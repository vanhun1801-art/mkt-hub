'use strict';
/**
 * ============================================================================
 * QUỸ CHI PHÍ MARKETING — máy chủ
 * ============================================================================
 *
 * Thay cho sheet "Quỹ công ty tạm ứng chi trước" (6 tab, 162 dòng). Ba bảng
 * trên Base "Chi phí Marketing": Đợt tạm ứng · Lần nạp quỹ · Chi phí.
 *
 * Khác app Lịch tác nghiệp ở một điểm lớn: app này CHỈ MỘT VAI. Anh Hùng giữ
 * quỹ và nhập; kế toán xem thẳng Base với quyền chỉ đọc, không có tài khoản
 * trong app. Nên không có tầng phân quyền hai chiều, chỉ có một chốt: người
 * đang đăng nhập có nằm trong `chuQuy` không.
 *
 * QUỸ LÀ MỘT CỤC. Sáu "đợt tạm ứng" chỉ là sáu lần ứng tiền khác nhau, không
 * phải sáu túi tiền riêng — tiêu thì tiêu từ một quỹ. Nên số dư là MỘT con số
 * cho cả sổ, và không chỗ nào bắt người dùng chọn "chi từ cục nào". Bản ghi vẫn
 * gắn vào một đợt, nhưng server tự gắn: đó là chuyện đối chiếu phiếu chi của kế
 * toán, không phải chuyện của người tiêu tiền.
 *
 * Số dư cũng KHÔNG cộng dồn theo dòng như sheet — chèn một dòng cũ vào giữa là
 * phải tính lại cả cột. Cộng cả sổ mỗi lần đọc thì không bao giờ lệch.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const cfg = require('./config');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');
const tourwell = require('../lark-chung/tourwell');

const F = cfg.fields;
const BIND = process.env.BIND || '127.0.0.1';

/* ---------------- đọc ô Base -> giá trị UI ---------------- */
const asText = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (x && (x.text || x.name)) || (typeof x === 'string' ? x : '')).join('');
  if (typeof v === 'object') return v.text || v.name || '';
  return String(v);
};
const first = (v) => (Array.isArray(v) ? v[0] : v);
const asUsers = (v) => (Array.isArray(v) ? v.map((u) => ({ id: u.id, name: u.name || u.en_name || u.id })) : []);
const asLinks = (v) => {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x && (x.record_id || x.id)))).filter(Boolean);
};
const asAttach = (v) => (Array.isArray(v)
  ? v.map((a) => ({ name: a.name || a.file_name || 'tệp', token: a.file_token || a.token || '', size: a.size || 0 }))
  : []);

/** Một bản ghi Base -> object phẳng theo bản đồ trường. */
function doiRa(rec, map) {
  const c = rec.cells || {};
  const t = { id: rec.record_id };
  for (const [key, f] of Object.entries(map)) {
    const v = c[f.id];
    switch (f.type) {
      case 'select':     t[key] = asText(first(v)) || null; break;
      case 'user':       t[key] = asUsers(v); break;
      case 'datetime':   t[key] = v || null; break;
      case 'number':
      case 'formula':    t[key] = (v === 0 || v) ? Number(asText(v) || v) || 0 : 0; break;
      case 'attachment': t[key] = asAttach(v); break;
      case 'link':       t[key] = asLinks(v); break;
      default:           t[key] = asText(v); break;
    }
  }
  return t;
}

const pad = (n) => String(n).padStart(2, '0');

/** UI -> ô Base. Khoá theo TÊN cột vì lark.js ghi theo tên. */
function doiVao(patch, map) {
  const out = {};
  for (const key of Object.keys(patch)) {
    const f = map[key];
    const val = patch[key];
    if (!f || f.readOnly || f.type === 'formula' || f.type === 'attachment') continue;
    switch (f.type) {
      case 'select': out[f.name] = val ? String(val) : null; break;
      case 'number': out[f.name] = (val === '' || val == null) ? null : Number(val); break;
      case 'user':
        out[f.name] = (Array.isArray(val) ? val : val ? [val] : [])
          .map((u) => ({ id: typeof u === 'string' ? u : u.id })).filter((u) => u.id);
        break;
      /* Ô liên kết: MẢNG CHUỖI record_id. Truyền [{id}] thì Base nhận lệnh,
       * trả về thành công, mà ô vẫn trống — đã mất một mẻ nhập vì chuyện này. */
      case 'link':
        out[f.name] = (Array.isArray(val) ? val : val ? [val] : [])
          .map((x) => (typeof x === 'string' ? x : (x && x.id))).filter(Boolean);
        break;
      case 'datetime': {
        if (!val) { out[f.name] = null; break; }
        const d = new Date(val);
        if (isNaN(d.getTime())) { out[f.name] = null; break; }
        /* Base ghi giờ Việt Nam còn Render chạy giờ UTC — quy sang UTC+7 rồi
         * đọc theo UTC để chạy ở đâu cũng ra một ngày. */
        const vn = new Date(d.getTime() + 7 * 3600000);
        out[f.name] = `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())} `
          + `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}:00`;
        break;
      }
      default: out[f.name] = val == null ? null : String(val); break;
    }
  }
  return out;
}

/* ---------------- kho tạm ----------------
 * Ba bảng đọc chung một nhịp: số dư của đợt phụ thuộc cả chi lẫn nạp, nên đọc
 * lệch nhau thì màn hình hiện một con số không tồn tại ở thời điểm nào cả. */
const kho = { at: 0, chi: null, dot: null, nap: null };

async function nap(buoc = false) {
  if (!buoc && kho.chi && Date.now() - kho.at < cfg.cacheTtlMs) return kho;
  const [chi, dot, lan] = await Promise.all([
    lark.listAllRecords(cfg.tableId),
    lark.listAllRecords(cfg.dotTableId),
    lark.listAllRecords(cfg.napTableId),
  ]);
  kho.chi = chi; kho.dot = dot; kho.nap = lan; kho.at = Date.now();
  return kho;
}

/* ---------------------------------------------------------------------------
 * QUỸ LÀ MỘT CỤC
 * -------------------------------------------------------------------------
 * Sáu "đợt tạm ứng" chỉ là sáu lần anh Hùng ứng tiền, không phải sáu túi tiền
 * riêng. Tiêu thì tiêu từ một quỹ. Nên số dư là MỘT con số cho cả sổ, và không
 * chỗ nào bắt người dùng chọn "chi từ cục nào".
 *
 * Một chỗ phải cẩn thận: dòng "Chuyển từ kỳ trước" là tồn của kỳ trước chuyển
 * sang, KHÔNG phải tiền công ty đưa thêm. Cộng cả vào thì quỹ phồng lên
 * 11.194.600 đ không có thật.
 * ------------------------------------------------------------------------- */
const NAP_CHUYEN_TIEP = 'Chuyển từ kỳ trước';

function tinhQuy(chi, nap) {
  const tongUng = nap.filter((n) => n.loai !== NAP_CHUYEN_TIEP)
    .reduce((a, n) => a + (Number(n.tien) || 0), 0);
  const tongChi = chi.reduce((a, c) => a + (Number(c.tien) || 0), 0);
  return { tongUng, tongChi, conLai: tongUng - tongChi, soLanUng: nap.filter((n) => n.loai !== NAP_CHUYEN_TIEP).length };
}

/**
 * Đợt để gắn bản ghi mới vào. Người dùng không chọn — nhưng bản ghi vẫn phải
 * thuộc một đợt, vì kế toán đối chiếu theo phiếu chi PC…; đó là chuyện của
 * chứng từ, không phải chuyện của người tiêu tiền.
 */
async function dotMacDinh(dotRows) {
  const dang = dotRows.find((d) => d.tinhTrang === 'Đang dùng');
  const chon = dang || dotRows[dotRows.length - 1];
  return chon ? chon.id : null;
}

/* ---------------------------------------------------------------------------
 * TẠO ĐƠN TOURWELL CHO MỘT KHOẢN CHI
 * -------------------------------------------------------------------------
 * Mọi khoản tiêu từ quỹ đều đi qua nhà cung cấp "QUỸ MARKETING" (id 274) bên
 * Tourwell — lịch sử chi của quỹ nằm ở
 * https://rootytrip.tourwell.net/admin/supplier/274/show?tab=history
 * Nên khai một khoản chi ở đây mà không tạo đơn thì lịch sử bên kia thủng.
 *
 * Ba luật giống hệt app Lịch tác nghiệp, và giống vì cùng một lý do:
 *   1. một khoản chi một đơn — ô "Mã đơn Tourwell" có mã rồi thì thôi
 *   2. Tourwell hỏng không chặn việc ghi sổ — tiền đã tiêu rồi
 *   3. nói rõ đơn mới ở "Đang xử lý", còn 5 nút phải bấm tay
 * ------------------------------------------------------------------------- */
async function taoDonTourwell(recId, khoan) {
  if (!tourwell.bat()) return { bo: 'chua-cau-hinh' };
  if (!recId) return { bo: 'khong-co-ban-ghi' };
  if (!(Number(khoan.tien) > 0)) return { bo: 'khong-co-chi-phi' };

  try {
    const kq = await tourwell.taoDon({
      ten: khoan.noiDung,
      ngay: khoan.ngayChi || khoan.ngayDeNghi,
      tien: khoan.tien,
    });
    /* Ghi mã ngược vào Base NGAY, kể cả khi dòng chi phí lỗi: đơn đã tồn tại
     * thì ô này phải có mã, nếu không lần sửa sau lại đẻ thêm đơn nữa. */
    try {
      await lark.updateRecord(recId, { [F.chi.maDon.name]: kq.ma + ' · ' + kq.link }, cfg.tableId);
      kho.at = 0;
    } catch (e) { kq.loiGhiBase = e.message; }
    return kq;
  } catch (e) {
    return { loi: e.message };
  }
}

/* ---------------- danh tính ---------------- */
const nguoiCuaRequest = new AsyncLocalStorage();

function nguoiTuHeader(req) {
  const id = req.headers['x-hub-user-id'];
  if (!id) return null;
  let ten = id;
  try { ten = req.headers['x-hub-user-name'] ? decodeURIComponent(req.headers['x-hub-user-name']) : id; }
  catch (_) { ten = req.headers['x-hub-user-name'] || id; }
  return { id: String(id), name: ten };
}

async function toiLaAi() {
  const tuHub = nguoiCuaRequest.getStore();
  if (tuHub) return tuHub;
  if (typeof lark.whoami === 'function') {
    try { return await lark.whoami(); } catch (_) { return null; }
  }
  return null;
}

/** Một chốt duy nhất: có phải chủ quỹ không. */
async function laChuQuy() {
  const me = await toiLaAi();
  return !!(me && cfg.chuQuy.includes(me.id));
}

async function doiChuQuy(res) {
  if (await laChuQuy()) return true;
  json(res, {
    error: 'Chỉ người giữ quỹ mới ghi được vào sổ. Bạn đang xem ở chế độ chỉ đọc.',
    code: 'NOT_FUND_OWNER',
  }, 403);
  return false;
}

/* ---------------- máy chủ ---------------- */
const server = http.createServer((req, res) => {
  const me = nguoiTuHeader(req);
  if (me) nguoiCuaRequest.run(me, () => xuLy(req, res).catch((e) => loi(res, e)));
  else xuLy(req, res).catch((e) => loi(res, e));
});

function loi(res, e) {
  console.error('[lỗi]', e && e.message);
  if (!res.headersSent) json(res, { error: String((e && e.message) || e) }, 500);
  else res.end();
}

async function xuLy(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Hub-User-Id,X-Hub-User-Name');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  /* ---- màn hình chính ---- */
  if (p === '/api/meta' && req.method === 'GET') {
    const k = await nap(url.searchParams.get('moi') === '1');
    const chi = k.chi.map((r) => doiRa(r, F.chi));
    const dot = k.dot.map((r) => doiRa(r, F.dot));
    const lan = k.nap.map((r) => doiRa(r, F.nap));

    /* Số dư của từng đợt do công thức Base tính, app không tự cộng lại — hai
     * nơi cùng tính một con số thì sớm muộn lệch nhau. */
    return json(res, {
      me: await toiLaAi(),
      chuQuy: await laChuQuy(),
      quy: tinhQuy(chi, lan),
      chi, dot, nap: lan,
      options: { loaiChi: cfg.loaiChi, tinhTrang: cfg.tinhTrang },
      larkUrl: cfg.larkUrl,
    });
  }

  /* ---- khoản chi ---- */
  if (p === '/api/chi' && req.method === 'POST') {
    if (!(await doiChuQuy(res))) return;
    const body = await docThan(req);
    if (!String(body.noiDung || '').trim()) {
      return json(res, { error: 'Phải ghi nội dung chi.' }, 400);
    }
    if (!(Number(body.tien) > 0)) {
      return json(res, { error: 'Số tiền phải lớn hơn 0.' }, 400);
    }
    const me = await toiLaAi();
    if (!body.nguoi && me) body.nguoi = [me.id];
    if (!body.tinhTrang) body.tinhTrang = 'Đã chi';
    if (!body.ngayChi) body.ngayChi = new Date().toISOString();
    /* Giao diện không hỏi đợt nữa — server tự gắn. Bản ghi vẫn phải có đợt để
     * kế toán đối chiếu theo phiếu chi. */
    if (!body.dot || !body.dot.length) {
      const k = await nap();
      const id = await dotMacDinh(k.dot.map((r) => doiRa(r, F.dot)));
      if (id) body.dot = [id];
    }
    const out = await lark.createRecord(doiVao(body, F.chi), cfg.tableId);
    kho.at = 0;
    /* lark-cli +record-batch-create trả về `record_id_list`; bản Open API trả
     * `records[]`. Đọc thiếu một dạng thì id ra null, và đơn Tourwell không bao
     * giờ được tạo — mà API vẫn báo thành công. */
    const id = (out && (
      (out.record_id_list && out.record_id_list[0])
      || out.record_id
      || (out.record && out.record.record_id)
      || (out.records && out.records[0] && out.records[0].record_id)
    )) || null;

    /* Rồi tạo đơn bên Tourwell — giống hệt đường của app Lịch tác nghiệp, vì
     * mọi khoản chi qua Quỹ Marketing đều phải có một đơn để kế toán chi tiền.
     * Tourwell hỏng KHÔNG được làm hỏng việc ghi sổ: tiền đã tiêu rồi. */
    const tw = await taoDonTourwell(id, body);
    if (tw && tw.loi) console.warn('[Tourwell]', tw.loi);
    return json(res, { ok: true, id, tourwell: tw });
  }

  const mChi = p.match(/^\/api\/chi\/(rec[A-Za-z0-9]+)$/);
  if (mChi) {
    const id = mChi[1];
    if (req.method === 'PATCH') {
      if (!(await doiChuQuy(res))) return;
      const body = await docThan(req);
      const cells = doiVao(body, F.chi);
      if (!Object.keys(cells).length) return json(res, { error: 'Không có gì để sửa' }, 400);
      await lark.updateRecord(id, cells, cfg.tableId);
      kho.at = 0;
      return json(res, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (!(await doiChuQuy(res))) return;
      await lark.deleteRecords([id], cfg.tableId);
      kho.at = 0;
      return json(res, { ok: true });
    }
  }

  /* ---- chứng từ ---- */
  const mUp = p.match(/^\/api\/chi\/(rec[A-Za-z0-9]+)\/tep\/([a-zA-Z]+)$/);
  if (mUp && req.method === 'POST') {
    if (!(await doiChuQuy(res))) return;
    const [, id, key] = mUp;
    if (!cfg.uploadable.includes(key)) return json(res, { error: 'Ô này không nhận tệp.' }, 400);
    const ten = decodeURIComponent(url.searchParams.get('name') || 'tep');
    const an = ten.replace(/[\\/:*?"<>|]/g, '_').slice(-120);
    const relDir = './.tmp/up-' + Date.now();
    const absDir = path.join(__dirname, relDir);
    fs.mkdirSync(absDir, { recursive: true });
    try {
      fs.writeFileSync(path.join(absDir, an), await docThanTho(req, 60 * 1024 * 1024));
      await lark.uploadAttachment(id, F.chi[key].name, relDir + '/' + an, cfg.tableId);
      kho.at = 0;
      return json(res, { ok: true });
    } finally {
      try { fs.rmSync(absDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  const mDl = p.match(/^\/api\/chi\/(rec[A-Za-z0-9]+)\/tep\/([A-Za-z0-9]+)\/tai$/);
  if (mDl && req.method === 'GET') {
    const [, id, token] = mDl;
    let dir = null;
    try {
      dir = await lark.downloadAttachment(id, token, 'dl-' + Date.now(), cfg.tableId);
      const files = fs.readdirSync(dir);
      if (!files.length) return json(res, { error: 'Không tải được tệp' }, 404);
      const file = path.join(dir, files[0]);
      const buf = fs.readFileSync(file);
      res.writeHead(200, {
        'Content-Type': MIME_TEP[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': buf.length,
        'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(files[0]),
      });
      return res.end(buf);
    } finally {
      if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
    }
  }

  /* ---- nạp quỹ ---- */
  if (p === '/api/nap' && req.method === 'POST') {
    if (!(await doiChuQuy(res))) return;
    const body = await docThan(req);
    if (!(Number(body.tien) > 0)) return json(res, { error: 'Số tiền nạp phải lớn hơn 0.' }, 400);
    if (!body.dot || !body.dot.length) {
      const k = await nap();
      const id = await dotMacDinh(k.dot.map((r) => doiRa(r, F.dot)));
      if (id) body.dot = [id];
    }
    if (!body.loai) body.loai = 'Nạp thêm';
    if (!body.ngay) body.ngay = new Date().toISOString();
    if (!body.noiDung) body.noiDung = 'Tạm ứng ngày ' + new Date().toLocaleDateString('vi-VN');
    await lark.createRecord(doiVao(body, F.nap), cfg.napTableId);
    kho.at = 0;
    return json(res, { ok: true });
  }

  /* ---- mở đợt mới ---- */
  if (p === '/api/dot' && req.method === 'POST') {
    if (!(await doiChuQuy(res))) return;
    const body = await docThan(req);
    if (!String(body.ma || '').trim()) return json(res, { error: 'Phải có mã phiếu chi.' }, 400);
    const me = await toiLaAi();
    if (!body.nguoiGiu && me) body.nguoiGiu = [me.id];
    if (!body.tinhTrang) body.tinhTrang = 'Đang dùng';
    if (!body.ngayMo) body.ngayMo = new Date().toISOString();
    await lark.createRecord(doiVao(body, F.dot), cfg.dotTableId);
    kho.at = 0;
    return json(res, { ok: true });
  }

  const mDot = p.match(/^\/api\/dot\/(rec[A-Za-z0-9]+)$/);
  if (mDot && req.method === 'PATCH') {
    if (!(await doiChuQuy(res))) return;
    const cells = doiVao(await docThan(req), F.dot);
    if (!Object.keys(cells).length) return json(res, { error: 'Không có gì để sửa' }, 400);
    await lark.updateRecord(mDot[1], cells, cfg.dotTableId);
    kho.at = 0;
    return json(res, { ok: true });
  }

  /* ---- quyết toán theo lô ----
   * Gán một mã QTTU cho nhiều khoản cùng lúc. Đây là việc hay làm nhất sau khi
   * nộp chứng từ, và là việc mà làm tay trên Base thì phải sửa từng dòng. */
  if (p === '/api/quyet-toan' && req.method === 'POST') {
    if (!(await doiChuQuy(res))) return;
    const body = await docThan(req);
    const ids = (body.ids || []).filter((x) => /^rec[A-Za-z0-9]+$/.test(x));
    const ma = String(body.ma || '').trim();
    if (!ids.length) return json(res, { error: 'Chưa chọn khoản nào.' }, 400);
    if (!ma) return json(res, { error: 'Phải nhập mã quyết toán.' }, 400);

    const cells = {
      [F.chi.maQuyetToan.name]: ma,
      [F.chi.tinhTrang.name]: 'Đã quyết toán',
    };
    const map = {};
    ids.forEach((id) => { map[id] = cells; });
    if (typeof lark.updateMany === 'function') {
      await lark.updateMany(map, cfg.tableId);
    } else {
      for (const id of ids) await lark.updateRecord(id, cells, cfg.tableId);
    }
    kho.at = 0;
    return json(res, { ok: true, so: ids.length });
  }

  /* ---- tệp tĩnh ---- */
  if (req.method === 'GET') {
    const ten = p === '/' ? '/index.html' : p;
    const f = path.join(__dirname, 'public', ten.replace(/^\/+/, ''));
    if (f.startsWith(path.join(__dirname, 'public')) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const buf = fs.readFileSync(f);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
        'Content-Length': buf.length,
        'Cache-Control': 'no-cache',
      });
      return res.end(buf);
    }
  }

  return json(res, { error: 'Not found' }, 404);
}

/* ---------------- tiện ---------------- */
function json(res, obj, code) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': b.length,
    'Cache-Control': 'no-store',
  });
  res.end(b);
}

function docThan(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 4000000) req.destroy(); });
    req.on('end', () => {
      try { resolve(d ? JSON.parse(d) : {}); }
      catch (_) { reject(new Error('JSON body không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

function docThanTho(req, tran) {
  return new Promise((resolve, reject) => {
    const cs = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > tran) { req.destroy(); return reject(new Error('Tệp quá lớn (tối đa ' + Math.round(tran / 1048576) + ' MB)')); }
      cs.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(cs)));
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
const MIME_TEP = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8', '.heic': 'image/heic',
};

server.listen(cfg.port, BIND, () => {
  console.log('\n  Rooty Trip · Quỹ chi phí Marketing');
  console.log('  ->  http://localhost:' + cfg.port);
  console.log('\n  Base  : ' + cfg.baseToken);
  console.log('  Chế độ: ' + cfg.mode + '\n');
});
