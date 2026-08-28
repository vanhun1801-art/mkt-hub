'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cfg = require('./config');
// cli: dùng phiên lark-cli của máy · api: gọi thẳng Open API bằng app credentials
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');
const auth = require('./auth');
const { dungBaoCao } = require('./baocao');

const F = cfg.fields;
const BY_KEY = Object.entries(F);

/* ---------------- cache ---------------- */
let cache = { at: 0, records: null, fields: null, fieldsAt: 0, me: undefined, scope: undefined };
let requestFieldCache = null;

async function getFields(force = false) {
  if (!force && cache.fields && Date.now() - cache.fieldsAt < 5 * 60000) return cache.fields;
  cache.fields = await lark.listFields();
  cache.fieldsAt = Date.now();
  return cache.fields;
}

let inflight = null;

async function getRecords(force = false) {
  if (!force && cache.records && Date.now() - cache.at < cfg.cacheTtlMs) return cache.records;
  // Gộp các yêu cầu tải đồng thời vào một lần gọi CLI
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      cache.records = await lark.listAllRecords();
      cache.at = Date.now();
      return cache.records;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/* ---------------- mapping: Base -> UI ---------------- */
const first = (v) => (Array.isArray(v) ? v[0] : v);

const asText = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === 'string' ? x : x && (x.text || x.name || x.link) || '')).join('');
  }
  if (typeof v === 'object') return v.text || v.name || v.link || '';
  return String(v);
};

const asUsers = (v) =>
  Array.isArray(v)
    ? v.filter(Boolean).map((u) => ({ id: u.id, name: u.name || u.en_name || u.id }))
    : [];

const asMulti = (v) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string') : v ? [String(v)] : [];

/** Base trả về ô kiểu URL dạng markdown "[url](url)" — lấy lại URL thuần. */
function stripMdLink(s) {
  const m = /^\s*\[([^\]]*)\]\(([^)]*)\)\s*$/.exec(String(s || ''));
  return m ? (m[2] || m[1]) : String(s || '');
}

const asAttach = (v) =>
  Array.isArray(v)
    ? v.map((a) => ({ name: a.name, size: a.size, type: a.type, token: a.file_token || null }))
    : [];

function toTask(rec) {
  const c = rec.cells;
  const t = { id: rec.record_id };
  for (const [key, f] of BY_KEY) {
    const v = c[f.id];
    switch (f.type) {
      case 'select':
        t[key] = asText(first(v)) || null;
        break;
      case 'multiSelect':
        t[key] = asMulti(v);
        break;
      case 'user':
        t[key] = asUsers(v);
        break;
      case 'datetime':
        t[key] = v || null;
        break;
      case 'rating':
        t[key] = typeof v === 'number' ? v : v ? Number(v) : null;
        break;
      case 'url':
        t[key] = stripMdLink(asText(v));
        break;
      case 'attachment':
        t[key] = asAttach(v);
        break;
      case 'link':
        t[key] = Array.isArray(v)
          ? v.map((x) => (x && (x.record_ids ? x.record_ids[0] : x.id)) || x).filter(Boolean)
          : [];
        break;
      default:
        t[key] = asText(v);
        break;
    }
  }
  t.deadline = t.deadline1 || t.deadline2 || null;
  return t;
}

/** Bản ghi bảng "Yêu cầu điều chỉnh" -> object cho UI. */
function toRequest(rec) {
  const RF = cfg.requestFields;
  const c = rec.cells;
  return {
    id: rec.record_id,
    taskIds: Array.isArray(c[RF.task.id])
      ? c[RF.task.id].map((x) => (x && (x.record_ids ? x.record_ids[0] : x.id)) || x).filter(Boolean)
      : [],
    parts: asMulti(c[RF.parts.id]),
    proposal: asText(c[RF.proposal.id]),
    reason: asText(c[RF.reason.id]),
    content: asText(c[RF.content.id]),
    sender: asUsers(c[RF.sender.id]),
    handled: c[RF.handled.id] === true,
    evidence: asAttach(c[RF.evidence.id]),
  };
}

/* ---------------- mapping: UI -> CellValue ---------------- */
function pad(n) {
  return String(n).padStart(2, '0');
}

function toCells(patch) {
  const out = {};
  for (const key of Object.keys(patch)) {
    const val = patch[key];
    const f = F[key];
    if (!f || f.readOnly) continue;
    switch (f.type) {
      case 'select':
        out[f.name] = val ? String(val) : null;
        break;
      case 'multiSelect':
        out[f.name] = Array.isArray(val) ? val : val ? [String(val)] : [];
        break;
      case 'user':
        out[f.name] = (Array.isArray(val) ? val : val ? [val] : [])
          .map((u) => ({ id: typeof u === 'string' ? u : u.id }))
          .filter((u) => u.id);
        break;
      case 'datetime': {
        if (!val) {
          out[f.name] = null;
          break;
        }
        const d = new Date(val);
        if (isNaN(d.getTime())) {
          out[f.name] = null;
          break;
        }
        out[f.name] =
          d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
          ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
        break;
      }
      case 'rating':
        out[f.name] = val === '' || val == null ? null : Number(val);
        break;
      default:
        out[f.name] = val == null ? null : String(val);
        break;
    }
  }
  return out;
}

/** Ghi giá trị mới vào cache cục bộ, giữ đúng dạng của record-list. */
function applyLocal(rec, patch) {
  for (const key of Object.keys(patch)) {
    const val = patch[key];
    const f = F[key];
    if (!f || f.readOnly) continue;
    switch (f.type) {
      case 'select':
        rec.cells[f.id] = val ? [String(val)] : null;
        break;
      case 'multiSelect':
        rec.cells[f.id] = Array.isArray(val) ? val : [];
        break;
      case 'user':
        rec.cells[f.id] = (Array.isArray(val) ? val : [])
          .map((u) => (typeof u === 'string' ? { id: u, name: u } : u));
        break;
      case 'datetime':
        rec.cells[f.id] = val || null;
        break;
      case 'rating':
        rec.cells[f.id] = val == null || val === '' ? null : Number(val);
        break;
      default:
        rec.cells[f.id] = val == null ? null : String(val);
        break;
    }
  }
}

/* ---------------- API ---------------- */
function collectOptions(fields) {
  const opts = {};
  for (const [key, f] of BY_KEY) {
    const raw = fields.find((x) => x.id === f.id);
    if (raw && raw.options) {
      opts[key] = raw.options.map((o) => o.name).filter((v, i, a) => a.indexOf(v) === i);
    }
  }
  return opts;
}

/* ---------------- phân quyền xem ---------------- */
/**
 * Người dùng của request hiện tại.
 * - mode api: lấy từ cookie phiên (mỗi người một danh tính)
 * - mode cli: lấy từ phiên lark-cli của máy (một người duy nhất)
 */
async function whoAmI(req) {
  if (cfg.mode === 'api') return req ? auth.sessionUser(req) : null;
  if (cache.me === undefined) cache.me = await lark.whoami();
  return cache.me;
}

async function isManager(req) {
  /* Chạy sau lớp vỏ Marketing Hub: hub đã quyết vai (danh sách khai bằng open_id
   * HOẶC email) và gửi kèm header. Tin được vì app chỉ nghe 127.0.0.1 và hub đã
   * xoá header do client tự gửi. Tắt bằng HUB_TRUST_HEADER=0. */
  if (req && req.headers && req.headers['x-hub-user-manager'] === '1' &&
      process.env.HUB_TRUST_HEADER !== '0') return true;
  const me = await whoAmI(req);
  return !!(me && cfg.loadManagerIds().includes(me.id));
}

/** Việc thuộc phạm vi một người: phụ trách chính hoặc người hỗ trợ. */
function ownedBy(task, personId) {
  const has = (arr) => (arr || []).some((u) => u.id === personId);
  return has(task.owner) || has(task.helper);
}

/** Danh sách task người đang đăng nhập được phép thấy. */
async function visibleFor(tasks, req) {
  if (await isManager(req)) return tasks;
  const me = await whoAmI(req);
  if (!me) return [];
  return tasks.filter((t) => ownedBy(t, me.id));
}

const XD = '\n';   // xuống dòng trong tin nhắn Lark

/**
 * Gửi tin nhắn Lark cho nhiều người. Chạy nền, không chặn phản hồi —
 * thông báo hỏng không được làm hỏng thao tác chính.
 */
function baoTin(openIds, text) {
  if (!cfg.notify || !openIds || !openIds.length) return;
  const ds = [...new Set(openIds.filter(Boolean))].slice(0, 30);
  (async () => {
    for (const id of ds) {
      try { await lark.sendMessage(id, text); } catch (_) {}
    }
  })().catch(() => {});
}

/** Đuôi tin nhắn: link mở app. */
const duoiTin = () => (cfg.publicUrl ? XD + cfg.publicUrl : '');

/** Chặn thao tác chỉ dành cho quản lý. */
async function requireManager(res, req) {
  if (await isManager(req)) return true;
  json(res, {
    error: 'Chỉ quản lý được thực hiện thao tác này.',
    code: 'MANAGER_ONLY',
  }, 403);
  return false;
}

/** Chặn thao tác trên task không thuộc phạm vi của mình. */
async function requireOwnTask(res, task, req) {
  if (await isManager(req)) return true;
  const me = await whoAmI(req);
  if (me && ownedBy(task, me.id)) return true;
  json(res, {
    error: 'Đây không phải công việc của bạn.',
    code: 'NOT_YOUR_TASK',
  }, 403);
  return false;
}

function collectPeople(tasks) {
  const m = new Map();
  for (const t of tasks) {
    for (const key of ['owner', 'helper', 'requester']) {
      for (const u of t[key] || []) if (u && u.id && !m.has(u.id)) m.set(u.id, u);
    }
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

async function api(req, res, url) {
  const p = url.pathname;

  if (p === '/api/meta' && req.method === 'GET') {
    const force = url.searchParams.get('refresh') === '1';
    const fields = await getFields(force);
    const records = await getRecords(force);
    const allTasks = records.map(toTask);
    const me = await whoAmI(req);
    const manager = await isManager(req);
    if (!requestFieldCache) {
      try { requestFieldCache = await lark.listFields(cfg.requestTableId); } catch (_) { requestFieldCache = []; }
    }
    // Phạm vi khả dụng của app — dùng cho nút chuyển vai của quản lý
    if (cache.scope === undefined || force) {
      try { cache.scope = await lark.scopeUsers(); } catch (_) { cache.scope = []; }
    }
    const tasks = manager ? allTasks : await visibleFor(allTasks, req);
    return json(res, {
      me,
      role: manager ? 'manager' : 'staff',
      options: collectOptions(fields),
      // danh bạ để chọn Người hỗ trợ — lấy từ toàn bảng, không phải dữ liệu công việc
      people: collectPeople(allTasks),
      // người app được cấp quyền dùng (Developer Console → phạm vi khả dụng)
      scopePeople: (cache.scope || []).map((p) => {
        const trongBang = collectPeople(allTasks).find((x) => x.id === p.id);
        return { id: p.id, name: trongBang ? trongBang.name : p.name };
      }),
      // chỉ chế độ api mới đọc được phạm vi; chế độ cli thì dùng danh bạ Base
      scopeAvailable: cfg.mode === 'api',
      statusOrder: cfg.statusOrder,
      fields: Object.fromEntries(BY_KEY.map(([k, f]) => [k, { name: f.name, type: f.type, readOnly: !!f.readOnly }])),
      rules: {
        staffStatuses: cfg.staffStatuses,
        adminStatuses: cfg.adminStatuses,
        staffEditable: cfg.staffEditable,
        staffCreatable: cfg.staffCreatable,
        managerOnlyFields: cfg.managerOnlyFields,
        proofRequiredFor: cfg.proofRequiredFor,
      },
      requestParts: (function () {
        const raw = requestFieldCache && requestFieldCache.find((x) => x.id === cfg.requestFields.parts.id);
        return raw && raw.options ? raw.options.map((x) => x.name) : [];
      })(),
      larkUrl: cfg.larkUrl,
      total: tasks.length,
    });
  }

  if (p === '/api/tasks' && req.method === 'GET') {
    const records = await getRecords(url.searchParams.get('refresh') === '1');
    const tasks = await visibleFor(records.map(toTask), req);
    return json(res, { tasks, fetchedAt: cache.at });
  }

  if (p === '/api/tasks' && req.method === 'POST') {
    const body = await readBody(req);
    const me = await whoAmI(req);
    const manager = await isManager(req);

    if (!manager) {
      // Nhân sự đặt việc: chỉ điền được bộ trường của Form "Yêu cầu công việc"
      const bad = Object.keys(body).filter((k) => !cfg.staffCreatable.includes(k));
      if (bad.length) {
        return json(res, {
          error: 'Trường "' + bad.join(', ') + '" do quản lý phân công.',
          code: 'FIELD_LOCKED',
        }, 403);
      }
      // Người order luôn là chính mình, không nhận từ client
      if (me) body.requester = [{ id: me.id }];
      body.status = 'Chờ tiếp nhận';
    }

    if (!body.title) return json(res, { error: 'Thiếu tên công việc' }, 400);
    if (!body.startAt) body.startAt = new Date().toISOString();

    const cells = toCells(body);
    const result = await lark.createRecord(cells);
    cache.at = 0;

    if (!manager) {
      // nhân sự đặt việc → báo quản lý vào phân công
      baoTin(cfg.loadManagerIds(),
        'Có yêu cầu công việc mới: "' + body.title + '"' +
        (me ? XD + 'Người order: ' + me.name : '') +
        XD + 'Cần phân công người phụ trách.' + duoiTin());
    } else if (body.owner) {
      baoTin((body.owner || []).map((u) => (typeof u === 'string' ? u : u.id)),
        'Bạn được giao việc mới: "' + body.title + '"' + duoiTin());
    }
    return json(res, { ok: true, result, role: manager ? 'manager' : 'staff' });
  }

  if (p === '/api/tasks/bulk' && req.method === 'PATCH') {
    if (!(await requireManager(res, req))) return;
    const body = await readBody(req);
    const ids = body.ids || [];
    const cells = toCells(body.patch || {});
    if (!ids.length || !Object.keys(cells).length) return json(res, { error: 'Thiếu ids hoặc patch' }, 400);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const map = {};
      for (const id of chunk) map[id] = cells;
      await lark.updateMany(map);
    }
    if (cache.records) {
      for (const id of ids) {
        const rec = cache.records.find((r) => r.record_id === id);
        if (rec) applyLocal(rec, body.patch);
      }
    }
    return json(res, { ok: true, count: ids.length });
  }

  if (p === '/api/tasks/bulk-delete' && req.method === 'POST') {
    if (!(await requireManager(res, req))) return;
    const body = await readBody(req);
    const ids = body.ids || [];
    if (!ids.length) return json(res, { error: 'Thiếu ids' }, 400);
    for (let i = 0; i < ids.length; i += 100) await lark.deleteRecords(ids.slice(i, i + 100));
    if (cache.records) cache.records = cache.records.filter((r) => !ids.includes(r.record_id));
    return json(res, { ok: true, count: ids.length });
  }

  /* ---- luồng làm việc của Phụ trách chính (theo tài liệu Training) ---- */

  const mAct = p.match(/^\/api\/tasks\/(rec[A-Za-z0-9]+)\/(start|complete|upload)$/);
  if (mAct && req.method === 'POST') {
    const id = mAct[1];
    const action = mAct[2];
    const records = await getRecords();
    const rec = records.find((r) => r.record_id === id);
    if (!rec) return json(res, { error: 'Không tìm thấy công việc' }, 404);
    const task = toTask(rec);
    if (!(await requireOwnTask(res, task, req))) return;

    if (action === 'upload') {
      const name = decodeURIComponent(req.headers['x-file-name'] || '') || 'file';
      const safe = name.replace(/[\\/:*?"<>|]/g, '_').slice(-120);
      const buf = await readRawBody(req, 60 * 1024 * 1024);
      if (!buf.length) return json(res, { error: 'Tệp trống' }, 400);
      const slug = 'up-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      const absDir = path.join(__dirname, '.tmp', slug);
      fs.mkdirSync(absDir, { recursive: true });
      const abs = path.join(absDir, safe);
      fs.writeFileSync(abs, buf);
      try {
        await lark.uploadAttachment(id, F.attachment.name, './.tmp/' + slug + '/' + safe);
      } finally {
        try { fs.rmSync(absDir, { recursive: true, force: true }); } catch (_) {}
      }
      cache.at = 0;
      return json(res, { ok: true, name: safe, size: buf.length });
    }

    if (action === 'start') {
      await lark.updateRecord(id, toCells({ status: 'Đang tiến hành' }));
      applyLocal(rec, { status: 'Đang tiến hành' });
      return json(res, { ok: true, status: 'Đang tiến hành' });
    }

    // complete: chặn nếu chưa có minh chứng (Tệp đính kèm hoặc Link kết quả)
    const body = await readBody(req);
    const patch = {};
    if (body.link) patch.link = String(body.link);
    if (body.note) patch.note = String(body.note);

    const hasProof = (task.attachment || []).length > 0 || !!(patch.link || task.link);
    if (!hasProof) {
      return json(res, {
        error: 'Chưa có minh chứng kết quả',
        code: 'PROOF_REQUIRED',
        hint: 'Tài liệu quy định: phải đính sản phẩm cuối cùng vào Tệp đính kèm hoặc dán Link kết quả trước khi chuyển Hoàn thành.',
      }, 422);
    }

    patch.status = cfg.proofRequiredFor;
    await lark.updateRecord(id, toCells(patch));
    applyLocal(rec, patch);

    // báo người order vào nghiệm thu & chấm điểm
    baoTin((task.requester || []).map((u) => u.id),
      'Việc "' + (task.title || '') + '" đã hoàn thành.' + XD +
      'Mời bạn nghiệm thu và chấm điểm.' + duoiTin());

    return json(res, { ok: true, status: patch.status });
  }

  /* ---- báo cáo tổng quan (HTML, in ra PDF được) ---- */

  if (p === '/api/report' && req.method === 'GET') {
    if (!(await requireManager(res, req))) return;
    const records = await getRecords(url.searchParams.get('refresh') === '1');
    const tasks = records.map(toTask);
    const me = await whoAmI(req);
    const html = dungBaoCao(tasks, {
      nguoiXuat: me ? me.name : '',
      tuNgay: url.searchParams.get('tu') || '',
      denNgay: url.searchParams.get('den') || '',
    });
    const b = Buffer.from(html, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': b.length,
      'Cache-Control': 'no-store',
    });
    return res.end(b);
  }

  /* ---- bình luận ---- */

  const mCmt = p.match(/^\/api\/tasks\/(rec[A-Za-z0-9]+)\/comments$/);
  if (mCmt) {
    const id = mCmt[1];
    const CF = cfg.commentFields;

    if (req.method === 'GET') {
      const recs = await lark.listAllRecords(cfg.commentTableId);
      const list = recs
        .map((r) => ({
          id: r.record_id,
          taskIds: Array.isArray(r.cells[CF.task.id])
            ? r.cells[CF.task.id].map((x) => (x && (x.record_ids ? x.record_ids[0] : x.id)) || x).filter(Boolean)
            : [],
          content: asText(r.cells[CF.content.id]),
          author: asUsers(r.cells[CF.author.id]),
          at: r.cells[CF.at.id] || null,
        }))
        .filter((c) => c.taskIds.includes(id))
        .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
      return json(res, { comments: list });
    }

    if (req.method === 'POST') {
      const recs = await getRecords();
      const rec = recs.find((r) => r.record_id === id);
      if (!rec) return json(res, { error: 'Không tìm thấy công việc' }, 404);
      if (!(await requireOwnTask(res, toTask(rec), req))) return;

      const body = await readBody(req);
      const noiDung = String(body.content || '').trim();
      if (!noiDung) return json(res, { error: 'Chưa nhập nội dung' }, 400);
      if (noiDung.length > 2000) return json(res, { error: 'Bình luận quá dài (tối đa 2000 ký tự)' }, 400);

      const me = await whoAmI(req);
      const cells = {};
      cells[CF.content.name] = noiDung;
      cells[CF.task.name] = [{ id }];
      if (me) cells[CF.author.name] = [{ id: me.id }];

      const kq = await lark.createRecord(cells, cfg.commentTableId);

      const t = toTask(rec);
      const nhan = [...(t.owner || []), ...(t.helper || []), ...(t.requester || [])]
        .map((u) => u.id)
        .filter((x, i, a) => x && a.indexOf(x) === i && (!me || x !== me.id));
      baoTin(nhan,
        'Bình luận mới trên "' + (t.title || '') + '"' + XD +
        (me ? me.name + ': ' : '') + noiDung.slice(0, 200) + duoiTin());

      return json(res, { ok: true, result: kq });
    }
  }

  /* ---- gỡ tệp đính kèm ---- */

  const mRm = p.match(/^\/api\/tasks\/(rec[A-Za-z0-9]+)\/attachment$/);
  if (mRm && req.method === 'DELETE') {
    const id = mRm[1];
    const recs = await getRecords();
    const rec = recs.find((r) => r.record_id === id);
    if (!rec) return json(res, { error: 'Không tìm thấy công việc' }, 404);
    if (!(await requireOwnTask(res, toTask(rec), req))) return;

    const token = url.searchParams.get('token') || '';
    if (!/^[A-Za-z0-9]+$/.test(token)) return json(res, { error: 'Tham số không hợp lệ' }, 400);

    await lark.removeAttachment(id, F.attachment.name, token);
    cache.at = 0;
    return json(res, { ok: true });
  }

  /* ---- phân quyền ---- */

  if (p === '/api/managers' && req.method === 'GET') {
    if (!(await requireManager(res, req))) return;
    const records = await getRecords();
    const tasks = records.map(toTask);
    const ids = cfg.loadManagerIds();
    const me = await whoAmI(req);

    // Chỉ liệt kê người được cấp quyền dùng app — cấp quản lý cho người
    // không mở được app là vô nghĩa. Chưa đọc được phạm vi thì dùng danh bạ Base.
    const trongBang = collectPeople(tasks);
    const scope = cache.scope || [];
    const dsChon = (cfg.mode === 'api' && scope.length)
      ? scope.map((p) => {
          const b = trongBang.find((x) => x.id === p.id);
          return { id: p.id, name: b ? b.name : p.name };
        })
      : trongBang;

    return json(res, {
      me,
      managers: ids,
      people: dsChon.map((p2) => ({
        id: p2.id,
        name: p2.name,
        isManager: ids.includes(p2.id),
        soViec: tasks.filter((t) => ownedBy(t, p2.id)).length,
      })),
      // quản lý có open_id nhưng không còn xuất hiện trong bảng
      lac: ids.filter((id) => !tasks.some((t) => ownedBy(t, id))),
    });
  }

  if (p === '/api/managers' && req.method === 'POST') {
    if (!(await requireManager(res, req))) return;
    const body = await readBody(req);
    const ids = body.ids || [];
    const me = await whoAmI(req);
    if (!ids.length) return json(res, { error: 'Phải còn ít nhất một quản lý.' }, 400);
    if (me && !ids.includes(me.id)) {
      return json(res, {
        error: 'Không thể tự bỏ quyền quản lý của mình — nhờ một quản lý khác làm, hoặc dùng: node quyen.js them "<tên>"',
        code: 'SELF_DEMOTE',
      }, 400);
    }
    try {
      const saved = cfg.saveManagerIds(ids);
      return json(res, { ok: true, managers: saved });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  /* ---- bảng Yêu cầu điều chỉnh ---- */

  if (p === '/api/requests' && req.method === 'GET') {
    const recs = await lark.listAllRecords(cfg.requestTableId);
    return json(res, { requests: recs.map(toRequest) });
  }

  if (p === '/api/requests' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.taskId) return json(res, { error: 'Thiếu công việc cần điều chỉnh' }, 400);
    if (!(body.parts || []).length) return json(res, { error: 'Chọn ít nhất một thông tin cần sửa' }, 400);
    if (!body.proposal) return json(res, { error: 'Nhập nội dung điều chỉnh đề xuất' }, 400);

    const RF = cfg.requestFields;
    const cells = {};
    cells[RF.task.name] = [{ id: body.taskId }];
    cells[RF.parts.name] = body.parts;
    cells[RF.proposal.name] = String(body.proposal);
    if (body.reason) cells[RF.reason.name] = String(body.reason);
    if (body.taskTitle) cells[RF.content.name] = String(body.taskTitle);
    if (body.senderId) cells[RF.sender.name] = [{ id: body.senderId }];
    cells[RF.handled.name] = false;

    const result = await lark.createRecord(cells, cfg.requestTableId);
    return json(res, { ok: true, result });
  }

  if (p === '/api/attachment' && req.method === 'GET') {
    const recordId = url.searchParams.get('record') || '';
    const token = url.searchParams.get('token') || '';
    if (!/^rec[A-Za-z0-9]+$/.test(recordId) || !/^[A-Za-z0-9]+$/.test(token)) {
      return json(res, { error: 'Tham số không hợp lệ' }, 400);
    }
    const slug = 'att-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    let dir = null;
    try {
      dir = await lark.downloadAttachment(recordId, token, slug);
      const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
      const target = names.length ? path.join(dir, names[0]) : null;
      if (!target) return json(res, { error: 'Không tải được tệp' }, 502);
      const buf = fs.readFileSync(target);
      const kieu = FILE_MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
      // Xem trực tiếp trong trình duyệt với ảnh / video / PDF / text;
      // chỉ ép tải xuống khi có ?tai=1 hoặc kiểu tệp không xem được.
      const xemDuoc = /^(image|video|text)\//.test(kieu) || kieu === 'application/pdf';
      const taiXuong = url.searchParams.get('tai') === '1' || !xemDuoc;
      res.writeHead(200, {
        'Content-Type': kieu,
        'Content-Length': buf.length,
        'Content-Disposition': (taiXuong ? 'attachment' : 'inline') +
          '; filename="' + encodeURIComponent(path.basename(target)) + '"',
        'Cache-Control': 'private, max-age=300',
      });
      res.end(buf);
    } finally {
      if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
    }
    return;
  }

  const mTask = p.match(/^\/api\/tasks\/(rec[A-Za-z0-9]+)$/);
  if (mTask) {
    const id = mTask[1];

    if (req.method === 'DELETE') {
      if (!(await requireManager(res, req))) return;
      await lark.deleteRecords([id]);
      if (cache.records) cache.records = cache.records.filter((r) => r.record_id !== id);
      return json(res, { ok: true });
    }

    if (req.method === 'PATCH') {
      const recs = await getRecords();
      const rec0 = recs.find((r) => r.record_id === id);
      if (!rec0) return json(res, { error: 'Không tìm thấy công việc' }, 404);
      if (!(await requireOwnTask(res, toTask(rec0), req))) return;

      const body = await readBody(req);

      // Vai trò nhân sự: chỉ sửa được các trường của mình, không đặt trạng thái của admin
      if (url.searchParams.get('role') === 'staff') {
        const bad = Object.keys(body).filter((k) => !cfg.staffEditable.includes(k));
        if (bad.length) {
          return json(res, {
            error: 'Trường "' + bad.join(', ') + '" do người order quản lý — hãy gửi Yêu cầu điều chỉnh.',
            code: 'FIELD_LOCKED',
          }, 403);
        }
        if (body.status && cfg.adminStatuses.includes(body.status)) {
          return json(res, {
            error: 'Trạng thái "' + body.status + '" do admin/quản lý đặt.',
            code: 'STATUS_LOCKED',
          }, 403);
        }
      }

      const cells = toCells(body);
      if (!Object.keys(cells).length) return json(res, { error: 'Không có trường nào để cập nhật' }, 400);

      const truoc = toTask(rec0);
      await lark.updateRecord(id, cells);
      if (cache.records) {
        const rec = cache.records.find((r) => r.record_id === id);
        if (rec) applyLocal(rec, body);
      }

      // vừa được phân công → báo người phụ trách mới
      if (body.owner) {
        const cu = (truoc.owner || []).map((u) => u.id);
        const moi = (body.owner || [])
          .map((u) => (typeof u === 'string' ? u : u.id))
          .filter((x) => x && !cu.includes(x));
        baoTin(moi,
          'Bạn được giao việc mới: "' + (truoc.title || '') + '"' +
          (truoc.deadline ? XD + 'Hạn: ' + new Date(truoc.deadline).toLocaleDateString('vi-VN') : '') +
          duoiTin());
      }
      // bị trả về làm lại → báo người phụ trách
      if (body.status === 'Làm lại' && truoc.status !== 'Làm lại') {
        baoTin((truoc.owner || []).map((u) => u.id),
          'Việc "' + (truoc.title || '') + '" bị trả về để làm lại.' + duoiTin());
      }
      return json(res, { ok: true });
    }
  }

  return json(res, { error: 'Not found' }, 404);
}

/* ---------------- helpers ---------------- */
function json(res, obj, code) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': b.length,
    'Cache-Control': 'no-store',
  });
  res.end(b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => {
      d += c;
      if (d.length > 4000000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(d ? JSON.parse(d) : {});
      } catch (e) {
        reject(new Error('JSON body không hợp lệ'));
      }
    });
    req.on('error', reject);
  });
}

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) { req.destroy(); return reject(new Error('Tệp quá lớn (tối đa ' + Math.round(limit / 1048576) + ' MB)')); }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const FILE_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.txt': 'text/plain; charset=utf-8',
};

const PUBLIC_DIR = path.join(__dirname, 'public');

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR)) return json(res, { error: 'Forbidden' }, 403);
  fs.readFile(file, (err, buf) => {
    if (err) return json(res, { error: 'Not found' }, 404);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length,
      // sửa app xong F5 là thấy ngay, không bị trình duyệt giữ bản JS/CSS cũ
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  try {
    // Health check cho Render/uptime — không cần đăng nhập, không lộ dữ liệu
    if (url.pathname === '/healthz') {
      return json(res, {
        ok: true,
        mode: cfg.mode,
        build: cfg.build,
        scope: (cache.scope || []).length,   // số người app được phép phục vụ
        at: new Date().toISOString(),
      });
    }

    // Logo là ảnh công khai — cho qua để trang đăng nhập cũng hiện đúng biểu tượng
    if (url.pathname === '/icon.svg' || url.pathname === '/favicon.ico') {
      return serveStatic(res, '/icon.svg');
    }

    // Chế độ api: bắt buộc đăng nhập Lark trước khi vào bất cứ đâu
    if (cfg.mode === 'api') {
      if (url.pathname.startsWith('/auth/')) {
        const done = await auth.handle(req, res, url);
        if (done !== false) return;
      }
      if (!auth.sessionUser(req)) return auth.requireLogin(res, url);
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(res, url.pathname);
  } catch (e) {
    console.error('[ERR]', e.message);
    return json(res, { error: e.message }, 500);
  }
});

/* ---------------- kiểm tra cấu hình trước khi chạy ---------------- */
if (cfg.mode === 'api') {
  const thieu = [];
  if (!cfg.appId) thieu.push('LARK_APP_ID');
  if (!cfg.appSecret) thieu.push('LARK_APP_SECRET');
  if (!cfg.publicUrl) thieu.push('PUBLIC_URL');
  if (!cfg.sessionSecret) thieu.push('SESSION_SECRET');
  if (thieu.length) {
    console.error('\n  Chế độ api thiếu biến môi trường: ' + thieu.join(', '));
    console.error('  Xem docs/trien-khai-server.md\n');
    process.exit(1);
  }
  if (cfg.sessionSecret.length < 24) {
    console.error('\n  SESSION_SECRET quá ngắn (cần ≥ 24 ký tự ngẫu nhiên).\n');
    process.exit(1);
  }
}

/**
 * Nạp sẵn phạm vi khả dụng ngay khi khởi động, để /healthz báo đúng số người
 * mà không phải chờ ai đó đăng nhập. Chạy nền, hỏng cũng không chặn server.
 */
function napPhamVi() {
  if (cfg.mode !== 'api') { cache.scope = []; return; }
  lark.scopeUsers()
    .then((ds) => {
      cache.scope = ds;
      console.log('  Phạm vi khả dụng: ' + ds.length + ' người');
    })
    .catch((e) => {
      cache.scope = [];
      console.error('  Không đọc được phạm vi khả dụng: ' + e.message);
    });
}

server.listen(cfg.port, () => {
  console.log('');
  console.log('  Rooty Trip · Quản lý công việc — Lark Base "Tracking"');
  console.log('  ->  ' + (cfg.publicUrl || 'http://localhost:' + cfg.port));
  console.log('');
  console.log('  Chế độ: ' + cfg.mode +
    (cfg.mode === 'api' ? '  (đăng nhập Lark, mỗi người một danh tính)'
                        : '  (dùng phiên lark-cli của máy này)'));
  console.log('  Base  : ' + cfg.baseToken);
  console.log('  Table : ' + cfg.tableId);
  console.log('  Ctrl+C để dừng.');
  console.log('');
  napPhamVi();
});
