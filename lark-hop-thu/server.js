'use strict';
/**
 * ============================================================================
 * App "Hộp thư" · lọc, xếp ngăn, trả lời nhanh email Lark
 * ============================================================================
 * Chạy: node server.js  →  http://localhost:5204
 *
 * Gom mọi hộp thư người dùng được cấp quyền (hộp chính + hộp chung như
 * sales@, marketing@, cmo@) vào một danh sách, xếp theo VIỆC PHẢI LÀM:
 * Cần xử lý · Sếp giao · Để biết · Tự động. Luật người gửi/tiêu đề xếp phần
 * lớn; AI (Claude) tóm tắt thư và viết nháp trả lời khi người dùng mở thư.
 *
 * DANH TÍNH: thư đọc bằng lark-cli đang đăng nhập trên máy này (chế độ cli).
 * Qua hub, chỉ người có email trùng chủ hộp thư chính mới mở được; người khác
 * nhận 403 kèm lời giải thích. Không có nhánh "người lạ thấy thư của chủ máy".
 *
 * KHÔNG XOÁ THƯ. Lưu trữ = chuyển sang ARCHIVED, hoàn tác được. Gửi thư chỉ
 * xảy ra ở POST …/tra-loi với gui:true, giao diện chỉ gọi sau hộp xác nhận.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const thu = require('./thu');
const kho = require('./kho');
const ai = require('./ai');
const { NGAN, LA_NGAN, xep } = require('./phan-loai');

const BIND = process.env.BIND || '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');

/* ---------------- trả lời ---------------- */

function gui(res, ma, than, headers = {}) {
  const buf = Buffer.isBuffer(than) ? than : Buffer.from(String(than), 'utf8');
  res.writeHead(ma, Object.assign({ 'Content-Length': buf.length }, headers));
  res.end(buf);
}
const json = (res, o, ma = 200) =>
  gui(res, ma, JSON.stringify(o), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
const loi = (res, ma, thong, them = {}) => json(res, Object.assign({ error: thong }, them), ma);

function docThan(req, tran = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const buf = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > tran) { reject(new Error('Nội dung quá lớn')); req.destroy(); return; }
      buf.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(buf).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('JSON hỏng: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

/* ---------------- hộp thư được cấp ---------------- */

let hopDem = { luc: 0, ds: null };
async function cacHop() {
  if (hopDem.ds && Date.now() - hopDem.luc < 10 * 60000) return hopDem.ds;
  const ds = await thu.cacHop();
  hopDem = { luc: Date.now(), ds };
  return ds;
}
const hopChinh = (ds) => (ds.find((h) => h.chinh) || ds[0] || {}).email || '';

/* ---------------- ai đang gọi ---------------- */

/**
 * Qua hub thì hub gửi danh tính xuống bằng header. Nhận biết "đến từ hub" bằng
 * SỰ CÓ MẶT của header, cùng giao kèo với các app con khác: request từ hub mà
 * hụt danh tính là người lạ, không rơi xuống nhánh chạy-một-mình.
 */
function aiGoi(req) {
  const h = req.headers || {};
  const de = (v) => { try { return decodeURIComponent(v || ''); } catch (_) { return v || ''; } };
  const quaHub = ['x-hub-user-id', 'x-hub-user-email', 'x-hub-user-name'].some((k) => k in h);
  if (!quaHub) {
    const motMinh = process.env.HUB !== '1' && ['127.0.0.1', 'localhost', '::1'].includes(BIND);
    return { quaHub: false, motMinh, ten: '', emails: [] };
  }
  return {
    quaHub: true,
    ten: de(h['x-hub-user-name']),
    emails: [de(h['x-hub-user-email']), de(h['x-hub-user-email-phu'])]
      .map((x) => x.trim().toLowerCase()).filter(Boolean),
  };
}

/** Người này có phải chủ hộp thư đang nối không. */
async function laChu(req) {
  const n = aiGoi(req);
  if (!n.quaHub) return { ok: n.motMinh, n };
  const ds = await cacHop();
  const chu = hopChinh(ds);
  return { ok: Boolean(chu) && n.emails.includes(chu), n, chu };
}

/* ---------------- danh sách thư ---------------- */

let dsDem = { luc: 0, ds: null, loi: [] };
const DEM_MS = 60000;

async function songSong(viec, tran = 4) {
  const kq = new Array(viec.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(tran, viec.length) }, async () => {
    while (i < viec.length) { const k = i++; kq[k] = await viec[k](); }
  }));
  return kq;
}

async function docHet(ep) {
  if (!ep && dsDem.ds && Date.now() - dsDem.luc < DEM_MS) return dsDem;
  const hop = await cacHop();
  const loiHop = [];
  const phan = await songSong(hop.map((h) => async () => {
    try { return await thu.danhSach(h.email); } catch (e) {
      loiHop.push({ hop: h.email, loi: e.message });
      return [];
    }
  }));
  dsDem = { luc: Date.now(), ds: [].concat(...phan), loi: loiHop };
  return dsDem;
}

/** Gắn ngăn, kết quả AI đã có, hẹn nhắc lên từng thư. */
function lamGiau(ds, hop) {
  const tay = kho.luat();
  const hen = kho.hen();
  const minh = [hopChinh(hop)].concat(cfg.cuaMinh).filter(Boolean);
  const nay = Date.now();
  return ds.map((t) => {
    const a = kho.layAi(t.hop, t.id);
    const x = xep(t, { cfg, tay, ai: a, minh });
    const henDen = hen[kho.khoa(t.hop, t.id)] || 0;
    return Object.assign({}, t, {
      ngan: x.ngan, nguon: x.nguon, lyDo: x.lyDo,
      tomTat: a ? a.tomTat : '', canLam: a ? a.canLam : '', han: a ? a.han : '',
      henDen: henDen > nay ? henDen : 0,
    });
  }).sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : 0));
}

/* ---------------- tệp tĩnh ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/* Dấu phiên bản tính lại mỗi lần phục vụ trang chủ (nhớ 2 giây), không tính
 * một lần lúc khởi động: tính một lần là sửa tệp xong người dùng vẫn kẹt bản
 * cũ tới khi khởi động lại máy chủ (nguyên tắc làm việc, mục 21). */
let vt = { luc: 0, v: '1' };
function vanTay() {
  if (Date.now() - vt.luc < 2000) return vt.v;
  let t = 0, n = 0;
  for (const f of fs.readdirSync(PUBLIC)) {
    try { const st = fs.statSync(path.join(PUBLIC, f)); if (st.isFile()) { t = Math.max(t, st.mtimeMs); n += st.size; } } catch (_) {}
  }
  vt = { luc: Date.now(), v: Math.round(t / 1000).toString(36) + n.toString(36) };
  return vt.v;
}

function tinh(res, duong, truyVan) {
  const p = duong === '/' ? '/index.html' : duong;
  const f = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
    return gui(res, 404, 'Không có ' + p, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  let body = fs.readFileSync(f);
  const trangChu = path.basename(f) === 'index.html';
  if (trangChu) body = Buffer.from(body.toString('utf8').split('v=BUILD').join('v=' + vanTay()), 'utf8');
  gui(res, 200, body, {
    'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
    'Cache-Control': !trangChu && /[?&]v=/.test(truyVan || '') ? 'public, max-age=31536000, immutable' : 'no-store',
  });
}

/* ---------------- định tuyến API ---------------- */

const LA_ID = /^[A-Za-z0-9+/=_-]{8,256}$/;

/** Kiểm hộp + mã thư trong đường dẫn: hộp phải là hộp được cấp. */
async function thuTuDuong(res, hopRaw, idRaw) {
  let hop, id;
  try { hop = decodeURIComponent(hopRaw).toLowerCase(); id = decodeURIComponent(idRaw); } catch (_) {}
  if (!hop || !id || !LA_ID.test(id)) { loi(res, 400, 'Mã thư không hợp lệ'); return null; }
  const ds = await cacHop();
  if (!ds.some((h) => h.email === hop)) { loi(res, 403, 'Hộp thư này không nằm trong các hộp anh được cấp quyền'); return null; }
  return { hop, id };
}

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/suc-khoe') return json(res, { ok: true });

  const quyen = await laChu(req);
  if (!quyen.ok) {
    return loi(res, 403, quyen.n.quaHub
      ? 'Hộp thư đang nối với tài khoản Lark ' + (quyen.chu || '(chưa rõ)') + '. Chỉ chủ tài khoản đó mở được.'
      : 'App chỉ mở được qua Marketing Hub.', { khongPhaiChu: true });
  }

  if (p === '/api/hop' && m === 'GET') {
    const hop = await cacHop();
    return json(res, { hop, chinh: hopChinh(hop), ngan: NGAN, ai: ai.coKhoa(), model: cfg.ai.model });
  }

  if (p === '/api/thu' && m === 'GET') {
    const d = await docHet(url.searchParams.get('lam') === '1');
    const hop = await cacHop();
    return json(res, { luc: d.luc, thu: lamGiau(d.ds, hop), loi: d.loi });
  }

  /* Xếp nhanh bằng AI những thư luật không nhận. Giao diện gọi sau khi nạp
   * danh sách; mỗi thư chỉ xếp một lần vì kết quả nằm trong bộ đệm. */
  if (p === '/api/xep-ai' && m === 'POST') {
    if (!ai.coKhoa()) return json(res, { xep: 0, khongKhoa: true });
    const d = await docHet(false);
    const hop = await cacHop();
    const can = lamGiau(d.ds, hop).filter((t) => t.nguon === 'mac-dinh' && !kho.layAi(t.hop, t.id)).slice(0, 80);
    if (!can.length) return json(res, { xep: 0 });
    const kq = await ai.xepNhanh(can, { nguoi: quyen.n.ten || 'anh Hùng' });
    kho.datAiNhieu(kq.map((x) => ({ hop: x.thu.hop, id: x.thu.id, v: { ngan: x.ngan, chiXep: true } })));
    return json(res, { xep: kq.length });
  }

  if (p === '/api/luat' && m === 'POST') {
    const b = await docThan(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return loi(res, 400, 'Địa chỉ gửi không hợp lệ');
    if (b.ngan && !LA_NGAN.has(b.ngan)) return loi(res, 400, 'Ngăn không hợp lệ');
    kho.datLuat(email, b.ngan || null);
    return json(res, { ok: true, luat: kho.luat() });
  }

  const mt = /^\/api\/thu\/([^/]+)\/([^/]+)(?:\/([a-z-]+))?$/.exec(p);
  if (!mt) return loi(res, 404, 'Không có đường này');
  const k = await thuTuDuong(res, mt[1], mt[2]);
  if (!k) return;
  const viec = mt[3] || '';

  /* Chế độ chỉ đọc cho lúc soát giao diện: dữ liệu Lark là thư thật của công
   * ty, công cụ soát không được đổi nhãn hay gửi thư nào. */
  if (process.env.HOP_THU_CHI_DOC === '1' && (viec === 'doi' || viec === 'tra-loi')) {
    return loi(res, 423, 'Đang ở chế độ chỉ đọc, không đổi gì trên Lark Mail');
  }

  if (!viec && m === 'GET') {
    const t = await thu.doc(k.hop, k.id);
    return json(res, { thu: t, ai: kho.layAi(k.hop, k.id), hen: kho.hen()[kho.khoa(k.hop, k.id)] || 0 });
  }

  if (viec === 'phan-tich' && m === 'POST') {
    if (!ai.coKhoa()) return loi(res, 409, 'Chưa có khoá Claude API', { khongKhoa: true });
    const t = await thu.doc(k.hop, k.id);
    const kq = await ai.phanTich(t, { nguoi: quyen.n.ten || 'anh Hùng' });
    kho.datAi(k.hop, k.id, kq);
    return json(res, { ai: kho.layAi(k.hop, k.id) });
  }

  if (viec === 'nhap' && m === 'POST') {
    if (!ai.coKhoa()) return loi(res, 409, 'Chưa có khoá Claude API', { khongKhoa: true });
    const b = await docThan(req);
    const t = await thu.doc(k.hop, k.id);
    const chu = await ai.vietNhap(t, String(b.yDinh || ''), { nguoi: quyen.n.ten || 'Lê Văn Hùng' });
    return json(res, { chu });
  }

  if (viec === 'doi' && m === 'POST') {
    const b = await docThan(req);
    const them = [], bo = [];
    let thuMuc = '';
    if (b.daDoc === true) bo.push('UNREAD');
    if (b.daDoc === false) them.push('UNREAD');
    if (b.sao === true) them.push('FLAGGED');
    if (b.sao === false) bo.push('FLAGGED');
    if (b.luuTru === true) thuMuc = 'archive';
    if (b.luuTru === false) thuMuc = 'inbox';
    if (!them.length && !bo.length && !thuMuc) return loi(res, 400, 'Không có thay đổi nào');
    await thu.doi(k.hop, [k.id], { them, bo, thuMuc });
    dsDem.luc = 0;                       // lần đọc sau lấy lại từ Lark
    return json(res, { ok: true });
  }

  if (viec === 'hen' && m === 'POST') {
    const b = await docThan(req);
    const den = Number(b.den) || 0;
    if (den && den < Date.now()) return loi(res, 400, 'Giờ hẹn đã qua');
    kho.datHen(k.hop, k.id, den || null);
    return json(res, { ok: true });
  }

  if (viec === 'tra-loi' && m === 'POST') {
    const b = await docThan(req);
    const chu = String(b.chu || '').trim();
    if (!chu) return loi(res, 400, 'Thư trả lời đang trống');
    if (chu.length > 20000) return loi(res, 400, 'Thư trả lời quá dài');
    const kq = await thu.traLoi(k.hop, k.id, chu, { gui: b.gui === true, tatCa: b.tatCa === true });
    dsDem.luc = 0;
    return json(res, { ok: true, daGui: b.gui === true, kq });
  }

  return loi(res, 404, 'Không có đường này');
}

/* ---------------- máy chủ ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET') return loi(res, 405, 'Không hỗ trợ');
    return tinh(res, url.pathname, url.search);
  } catch (e) {
    if (e.chiTiet) console.error('[hop-thu]', url.pathname, e.chiTiet);
    if (res.headersSent) return;
    if (thu.LoiChuaNoi && e instanceof thu.LoiChuaNoi) return loi(res, 503, e.message, { chuaNoi: true });
    loi(res, e instanceof ai.LoiAi ? 502 : 500, e.message || String(e));
  }
});

if (require.main === module) {
  server.listen(cfg.port, BIND, () => {
    console.log('Hộp thư · http://localhost:' + cfg.port + (ai.coKhoa() ? ' · AI bật (' + cfg.ai.model + ')' : ' · AI tắt (chưa có ANTHROPIC_API_KEY)'));
  });
}

module.exports = { server, aiGoi, lamGiau };
