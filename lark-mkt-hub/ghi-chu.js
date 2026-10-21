'use strict';
/* Ghi chú cá nhân. Kho thật là một tệp gzip trên Base kho Hub, mỗi tài khoản
 * một dòng riêng. Không đổi cột, không dùng ổ tạm Render làm nguồn dữ liệu.
 * Mỗi lần ghi thay ô đính kèm sau khi upload thành công: lỗi không gỡ bản cũ.
 * Thứ tự ghi theo người + revision tránh hai tab đè mất nội dung của nhau. */
const crypto = require('crypto');
const zlib = require('zlib');
const baseLark = require('./base-lark');
const LIMIT = 650000;
const error = (http, message, code) => Object.assign(new Error(message), { http, code });
const copy = (o) => JSON.parse(JSON.stringify(o));
const text = (v, n) => String(v == null ? '' : v).slice(0, n);
const defaults = () => ({ version: 0, folders: [
  { id: 'quick', name: 'Ghi chú nhanh', icon: 'sticky-note' },
  { id: 'meet', name: 'Cuộc họp', icon: 'messages-square' },
  { id: 'project', name: 'Dự án', icon: 'folder' },
  { id: 'personal', name: 'Cá nhân', icon: 'lock-keyhole' },
], notes: [], refs: [], operations: {} });

function ownerKey(user) {
  if (!user || !user.id) throw error(401, 'Chưa nhận ra tài khoản của anh.');
  return crypto.createHash('sha256').update((user.kieu || 'lark') + ':' + user.id).digest('hex');
}

// Chỉ tái tạo một bộ thẻ định dạng nhỏ, bỏ toàn bộ thuộc tính từ nội dung.
// Không để thẻ chưa đóng, URL, style, event handler hay SVG đi vào HTML trả về.
function cleanHTML(value) {
  const allowed = new Set(['p', 'div', 'span', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3']);
  if (String(value || '').length > 50000) throw error(413, 'Ghi chú quá dài. Anh tách nội dung thành hai ghi chú nhé.');
  const parts = text(value, 50000).split('<');
  let out = parts.shift();
  for (const part of parts) {
    const end = part.indexOf('>');
    if (end < 0) { out += '&lt;' + part; continue; }
    const tag = part.slice(0, end);
    const match = /^(\/?)([a-z][a-z0-9]*)\b[^<>]*$/i.exec(tag);
    if (match) {
      const name = match[2].toLowerCase();
      if (allowed.has(name)) out += '<' + match[1] + name + '>';
      else if (name === 'input' && !match[1]) out += '<input type="checkbox" aria-label="Đánh dấu mục ghi chú"' + (/\bchecked(?:\s|=|$)/i.test(tag) ? ' checked' : '') + '>';
    }
    out += part.slice(end + 1);
  }
  if (out.length > 40000) throw error(413, 'Một ghi chú tối đa 40.000 ký tự. Anh tách thành hai ghi chú nhé.');
  return out;
}

function validate(input) {
  if (!input || !Array.isArray(input.folders) || !Array.isArray(input.notes)) throw error(400, 'Dữ liệu ghi chú không hợp lệ.');
  if (input.folders.length > 60 || input.notes.length > 250) throw error(413, 'Không gian ghi chú đã đầy. Anh xuất bớt nội dung trước khi thêm.');
  const validId = (s) => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(s);
  const folderIds = new Set();
  const folders = input.folders.map((f) => {
    if (!f || !validId(f.id) || folderIds.has(f.id) || !text(f.name, 60).trim()) throw error(400, 'Thư mục không hợp lệ.');
    folderIds.add(f.id);
    return { id: f.id, name: text(f.name, 60).trim(), icon: ['sticky-note', 'messages-square', 'folder', 'lock-keyhole'].includes(f.icon) ? f.icon : 'folder' };
  });
  const noteIds = new Set();
  const notes = input.notes.map((n) => {
    if (!n || !validId(n.id) || noteIds.has(n.id) || !folderIds.has(n.folder)) throw error(400, 'Ghi chú hoặc thư mục không hợp lệ.');
    noteIds.add(n.id);
    return { id: n.id, folder: n.folder, title: text(n.title, 200), body: cleanHTML(n.body), tags: text(n.tags, 300),
      pinned: n.pinned === true, deleted: n.deleted === true,
      updated: Number.isFinite(Date.parse(n.updated)) ? new Date(n.updated).toISOString() : new Date().toISOString() };
  });
  if (Buffer.byteLength(JSON.stringify({ folders, notes })) > LIMIT) throw error(413, 'Không gian ghi chú đã đầy. Nội dung chưa được ghi đè lên bản đang lưu.');
  return { folders, notes };
}

function createLarkStorage(B = baseLark.bang(
  process.env.HUB_GHI_CHU_BASE || process.env.HUB_PHIM_BASE || process.env.HUB_TB_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG',
  process.env.HUB_GHI_CHU_TABLE || process.env.HUB_PHIM_TABLE || 'tbl1rcw5ES34EeEY', 'Tệp')) {
  const key = (owner) => 'ghi-chu:' + owner;
  async function row(owner) {
    const rows = (await B.docHet()).filter((r) => String(r['Ô'] || '') === key(owner));
    if (rows.length > 1) throw error(503, 'Kho ghi chú có hai bản trùng. Cần quản lý kiểm tra trước khi lưu tiếp.');
    return rows[0] || null;
  }
  return {
    async read(owner) {
      const r = await row(owner);
      if (!r) return defaults();
      const attachments = baseLark.docOTep(r['Tệp']);
      if (!attachments.length) return defaults(); // dòng tạo lần đầu nhưng chưa upload
      const file = attachments.filter((f) => f.ten === 'ghi-chu.json.gz').pop();
      if (!file) throw error(503, 'Không nhận dạng được tệp ghi chú. Giữ nguyên bản đang có.');
      const bytes = await B.taiTep(r.recordId, file.token);
      const raw = zlib.gunzipSync(bytes.buf, { maxOutputLength: 1200000 });
      const d = JSON.parse(raw.toString('utf8'));
      if (d.owner !== owner || !Number.isInteger(d.version) || d.version < 0) throw error(503, 'Dữ liệu không thuộc không gian ghi chú này.');
      return { ...d, ...validate(d) };
    },
    async write(owner, doc) {
      let r = await row(owner);
      if (!r) {
        const id = await B.tao({ 'Ô': key(owner) });
        if (!id) throw error(502, 'Lark chưa trả mã kho ghi chú.');
        r = { recordId: id };
      }
      const buf = zlib.gzipSync(Buffer.from(JSON.stringify({ ...doc, owner })));
      if (baseLark.laApi()) {
        const token = await B.upMedia('ghi-chu.json.gz', 'application/gzip', buf);
        if (!token) throw error(502, 'Lark chưa nhận tệp ghi chú.');
        await B.ghi(r.recordId, { 'Tệp': [{ file_token: token }] });
      } else {
        // CLI: append mới trước, rồi gỡ bản cũ. Đọc luôn chọn bản mới cuối.
        const old = baseLark.docOTep(r['Tệp']);
        await B.dinhTep(r.recordId, 'Tệp', { ten: 'ghi-chu.json.gz', kieu: 'application/gzip', buf });
        for (const f of old) await B.goTep(r.recordId, 'Tệp', f.token).catch(() => {});
      }
    },
  };
}

function createService({ storage = createLarkStorage(), taskCall, publicUrl = '' } = {}) {
  const queues = new Map();
  const latest = new Map();
  const lock = (key, fn) => {
    const old = queues.get(key) || Promise.resolve();
    const next = old.catch(() => {}).then(fn);
    queues.set(key, next);
    next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
    return next;
  };
  async function read(key, force = false) {
    const c = latest.get(key);
    if (!force && c && Date.now() - c.at < 20000) return copy(c.doc);
    const doc = await storage.read(key);
    latest.set(key, { doc: copy(doc), at: Date.now() });
    // không giữ vô hạn nội dung riêng của những phiên đã đóng
    if (latest.size > 60) latest.delete(latest.keys().next().value);
    return doc;
  }
  async function write(key, doc) {
    if (Buffer.byteLength(JSON.stringify(doc)) > 1000000) throw error(413, 'Kho ghi chú đã đầy. Nội dung cũ vẫn được giữ.');
    await storage.write(key, doc);
    latest.set(key, { doc: copy(doc), at: Date.now() });
    return doc;
  }
  const visible = (doc) => ({ version: doc.version, folders: doc.folders, notes: doc.notes, refs: doc.refs || [] });
  return {
    async load(user) { const key = ownerKey(user); return { ...visible(await read(key, true)), cacheKey: key }; },
    async save(user, version, data) {
      const key = ownerKey(user);
      const clean = validate(data);
      return lock(key, async () => {
        const doc = await read(key, true);
        if (version !== doc.version) throw error(409, 'Ghi chú đã thay đổi ở một cửa sổ khác. Anh tải lại dữ liệu; bản đang soạn vẫn được giữ trên máy.', 'NOTES_CONFLICT');
        const next = { ...doc, ...clean, version: doc.version + 1 };
        await write(key, next);
        return visible(next);
      });
    },
    async createTask(ctx, body) {
      const key = ownerKey(ctx.user);
      if (!ctx.canCreate) throw error(403, 'Anh chưa được cấp quyền tạo công việc.');
      if (!body || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId || '')) throw error(400, 'Thiếu mã yêu cầu tạo việc.');
      return lock(key, async () => {
        const doc = await read(key, true);
        const n = doc.notes.find((n) => n.id === body.noteId && !n.deleted);
        if (!n) throw error(404, 'Không tìm thấy ghi chú trong tài khoản của anh.');
        doc.operations = doc.operations || {};
        const old = doc.operations[body.requestId];
        if (!old && Object.keys(doc.operations).length >= 2000) throw error(413, 'Đã đạt giới hạn tạo việc từ ghi chú.');
        if (old && old.note !== n.id) throw error(409, 'Mã tạo việc đã được dùng cho ghi chú khác.');
        if (old && old.id) return { id: old.id, version: doc.version, refs: doc.refs || [] };
        const link = publicUrl.replace(/\/$/, '') + '/#/ghi-chu?note=' + encodeURIComponent(n.id) + '&from=' + body.requestId;
        if (old) {
          // Lượt trước mất kết nối sau khi ghi: tìm đúng việc theo link duy nhất,
          // tuyệt đối không gửi lại POST vì có thể tạo hai việc giống nhau.
          const orders = await taskCall(ctx, '/api/my-orders', { method: 'GET' });
          const tasks = await taskCall(ctx, '/api/tasks', { method: 'GET' });
          const found = [...(orders.tasks || []), ...(tasks.tasks || [])].find((t) => t.link === link);
          if (!found) throw error(409, 'Lượt tạo việc trước chưa xác định được kết quả. Anh kiểm tra Bảng công việc trước khi tạo lại.', 'TASK_PENDING');
          old.id = found.id;
        } else {
          const title = text(body.title, 200).trim();
          if (!title) throw error(400, 'Anh nhập tên công việc nhé.');
          const patch = { title, detail: text(body.detail, 12000), link,
            priority: text(body.priority || '🟡 Trung bình', 80), workType: text(body.workType || 'Content', 100) };
          if (body.deadline1) {
            if (!Number.isFinite(Date.parse(body.deadline1))) throw error(400, 'Deadline không hợp lệ.');
            patch.deadline1 = new Date(body.deadline1).toISOString();
          }
          if (body.owner && body.owner.length) {
            if (!ctx.canAssign) throw error(403, 'Người phụ trách do quản lý phân công.');
            if (!Array.isArray(body.owner) || body.owner.length > 10 || body.owner.some((u) => !u || typeof u.id !== 'string')) throw error(400, 'Người phụ trách không hợp lệ.');
            patch.owner = body.owner.map((u) => ({ id: u.id }));
          }
          // Quản lý tạo thay note owner; staff endpoint tự khoá requester là mình.
          if (ctx.canAssign) patch.requester = [{ id: ctx.user.id }];
          doc.operations[body.requestId] = { note: n.id, pending: true };
          doc.version++;
          await write(key, doc);
          let result;
          try { result = await taskCall(ctx, '/api/tasks', { method: 'POST', body: patch }); }
          catch (e) {
            if (e.http >= 400 && e.http < 500) {
              delete doc.operations[body.requestId];
              doc.version++;
              await write(key, doc);
            }
            throw e;
          }
          if (!result || !result.id) throw error(502, 'Chưa nhận được mã công việc. Anh kiểm tra Bảng công việc trước khi thử lại.', 'TASK_PENDING');
          doc.operations[body.requestId].id = result.id;
        }
        const id = doc.operations[body.requestId].id;
        doc.operations[body.requestId] = { note: n.id, id };
        doc.refs = doc.refs || [];
        if (!doc.refs.some((r) => r.id === id)) doc.refs.push({ id, note: n.id, title: text(body.title || n.title, 200) });
        doc.version++;
        await write(key, doc);
        return { id, version: doc.version, refs: doc.refs };
      });
    },
  };
}

module.exports = { createLarkStorage, createService, ownerKey, cleanHTML, validate, defaults };
