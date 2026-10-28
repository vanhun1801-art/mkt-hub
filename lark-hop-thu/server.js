'use strict';
/**
 * ============================================================================
 * App "Hộp thư" · lọc, xếp ngăn, trả lời nhanh email Lark
 * ============================================================================
 * Chạy: node server.js  →  http://localhost:5204
 *
 * Gom mọi hộp thư người dùng được cấp quyền (hộp chính + hộp chung như
 * sales@, marketing@, cmo@) vào một danh sách, xếp theo VIỆC PHẢI LÀM:
 * Cần trả lời · Đơn khách đặt · Chỉ để đọc. Luật người gửi/tiêu đề xếp phần
 * lớn; AI (Claude) tóm tắt thư và viết nháp trả lời khi người dùng mở thư.
 *
 * DANH TÍNH, hai đường:
 *   - Bản chạy chung: hub gửi user_access_token CỦA CHÍNH người đang xem qua
 *     header x-hub-thu-token (người đó đã bấm Nối hộp thư). Ai cũng chỉ thấy
 *     hộp mình được cấp; bộ đệm, luật, hẹn nhắc tách theo người.
 *   - Máy cá nhân: thư đọc bằng lark-cli đang đăng nhập trên máy. Qua hub, chỉ
 *     người có email trùng chủ hộp thư chính mới mở được; người khác nhận 403.
 *     Không có nhánh "người lạ thấy thư của chủ máy".
 *
 * KHÔNG XOÁ THƯ. Lưu trữ = chuyển sang ARCHIVED, hoàn tác được. Gửi thư chỉ
 * xảy ra ở POST …/tra-loi với gui:true, giao diện chỉ gọi sau hộp xác nhận.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const thu = require('./thu');
const mapi = require('./mail-api');
const kho = require('./kho');
const ai = require('./ai');
const chinhTa = require('./chinh-ta');
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

/* Bộ đệm theo NGƯỜI: khoá '' là chủ máy (lark-cli), còn lại là open_id hub
 * gửi xuống cùng token. Không bao giờ để người này nhận danh sách của người kia. */
const hopDem = new Map();
async function cacHop(n) {
  const c = hopDem.get(n.khoa);
  if (c && Date.now() - c.luc < 10 * 60000) return c.ds;
  const ds = await thu.cacHop(n.tk);
  hopDem.set(n.khoa, { luc: Date.now(), ds });
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
    return { quaHub: false, motMinh, ten: '', emails: [], tk: '', khoa: '', nguoi: '' };
  }
  /* Token chỉ có nghĩa khi đi kèm open_id: hub luôn gửi cả hai. */
  const id = String(h['x-hub-user-id'] || '');
  const tk = id ? String(h['x-hub-thu-token'] || '') : '';
  return {
    quaHub: true,
    tk,
    khoa: tk ? 'u:' + id : '',
    /* Sổ riêng (luật, hẹn, đã xong, sao, nhóm) theo NGƯỜI, kể cả trên máy chủ
     * máy: cùng một người mở ở máy cá nhân hay trên Render thấy cùng một sổ. */
    nguoi: id ? 'u:' + id : '',
    ten: de(h['x-hub-user-name']),
    emails: [de(h['x-hub-user-email']), de(h['x-hub-user-email-phu'])]
      .map((x) => x.trim().toLowerCase()).filter(Boolean),
  };
}

/** Người này có phải chủ hộp thư đang nối không. */
async function laChu(req) {
  const n = aiGoi(req);
  if (!n.quaHub) return { ok: n.motMinh, n };
  if (n.tk) return { ok: true, n };            // token của chính người này
  const ds = await cacHop(n);
  const chu = hopChinh(ds);
  return { ok: Boolean(chu) && n.emails.includes(chu), n, chu };
}

/* ---------------- danh sách thư ---------------- */

const dsDem = new Map();
const DEM_MS = 60000;
const quenDs = (n) => { const c = dsDem.get(n.khoa); if (c) c.luc = 0; };

async function songSong(viec, tran = 4) {
  const kq = new Array(viec.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(tran, viec.length) }, async () => {
    while (i < viec.length) { const k = i++; kq[k] = await viec[k](); }
  }));
  return kq;
}

async function docHet(n, ep) {
  const c = dsDem.get(n.khoa);
  if (!ep && c && c.ds && Date.now() - c.luc < DEM_MS) return c;
  const hop = await cacHop(n);
  const loiHop = [];
  /* Hộp đến và Đã gửi đọc cùng lúc (cùng một hàng đợi 6 lượt), không nối
   * đuôi nhau, để thêm thư mục Đã gửi không làm trang mở chậm gấp đôi. */
  const viec = hop.map((h) => async () => {
    try { return { den: await thu.danhSach(h.email, cfg.soThuMoiHop, n.tk) }; } catch (e) {
      /* Token hết giữa chừng thì cả trang phải mời nối lại, không lặng lẽ
       * thành tám hộp trống. */
      if (e instanceof thu.LoiChuaNoi) throw e;
      loiHop.push({ hop: h.email, loi: e.message });
      return { den: [] };
    }
  }).concat(hop.map((h) => async () => {
    /* Thư mục Đã gửi: để biết thư nào mình đã trả lời, và thư nào mình gửi
     * đi mà bên kia chưa hồi âm. Hỏng thì thôi, Hộp đến vẫn hiện. */
    try { return { gui: await thu.danhSach(h.email, cfg.soThuGuiMoiHop, n.tk, 'SENT') }; } catch (e) {
      if (e instanceof thu.LoiChuaNoi) throw e;
      return { gui: [] };
    }
  }));
  const kq = await songSong(viec, 6);
  const phan = kq.map((x) => x.den || []);
  const daGui = kq.map((x) => x.gui || []);
  const moi = { luc: Date.now(), ds: [].concat(...phan), gui: [].concat(...daGui), loi: loiHop };
  dsDem.set(n.khoa, moi);
  return moi;
}

const NGAY_CHO = 21;                                   // thư gửi đi quá 21 ngày thì thôi theo dõi
const msNgay = (s) => { const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/.exec(s || ''); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], m[4] - 7, +m[5]) : 0; };

/**
 * Ghép Hộp đến với Đã gửi theo chuỗi thư (cùng hộp + thread_id):
 *   - thư đến đã có thư mình gửi SAU nó trong cùng chuỗi → đã trả lời;
 *   - thư mình gửi gần nhất của một chuỗi mà chưa có thư đến nào sau nó → đang chờ người khác.
 */
function ghepChuoi(den, gui) {
  const cuoiGui = new Map(), cuoiDen = new Map();
  const k = (t) => t.hop + '|' + t.chuoi;
  for (const g of gui) if (g.chuoi && (!cuoiGui.has(k(g)) || cuoiGui.get(k(g)).ngay < g.ngay)) cuoiGui.set(k(g), g);
  for (const t of den) if (t.chuoi && (!cuoiDen.has(k(t)) || cuoiDen.get(k(t)).ngay < t.ngay)) cuoiDen.set(k(t), t);
  const daTraLoi = new Set(den.filter((t) => t.chuoi && cuoiGui.has(k(t)) && cuoiGui.get(k(t)).ngay >= t.ngay).map((t) => t.hop + '|' + t.id));
  const tu = Date.now() - NGAY_CHO * 86400e3;
  const cho = [...cuoiGui.values()]
    .filter((g) => msNgay(g.ngay) >= tu && !(cuoiDen.has(k(g)) && cuoiDen.get(k(g)).ngay > g.ngay))
    .sort((a, b) => (a.ngay < b.ngay ? -1 : 1))
    .map((g) => ({ hop: g.hop, id: g.id, chuoi: g.chuoi, ngay: g.ngay, tieuDe: g.tieuDe }));
  return { daTraLoi, cho };
}

/** Gắn ngăn, kết quả AI đã có, hẹn nhắc và trạng thái riêng lên từng thư. */
function lamGiau(ds, hop, nguoi = '') {
  const tay = kho.luat(nguoi);
  const hen = kho.hen(nguoi);
  const tt = kho.tt(nguoi);
  const minh = [hopChinh(hop)].concat(cfg.cuaMinh).filter(Boolean);
  const nay = Date.now();
  return ds.map((t) => {
    const a = kho.layAi(t.hop, t.id);
    const x = xep(t, { cfg, tay, ai: a, minh });
    const henDen = hen[kho.khoa(t.hop, t.id)] || 0;
    /* Đã đọc / sao / xong là của riêng người này, không lấy từ nhãn Lark (hộp
     * chung: người khác mở thư trên Lark không làm thư "đã đọc" với mình,
     * ngoại trừ lúc mình chưa từng đụng tới thư đó). */
    const r = tt[kho.khoa(t.hop, t.id)] || {};
    return Object.assign({}, t, {
      chuaDoc: r.d === 1 ? false : r.d === 0 ? true : Boolean(t.chuaDoc),
      sao: Boolean(r.s), xong: r.x || 0,
      ngan: x.ngan, nguon: x.nguon, lyDo: x.lyDo, sep: x.sep,
      tomTat: a ? a.tomTat : '', canLam: a ? a.canLam : '', han: a ? a.han : '',
      henDen: henDen > nay ? henDen : 0,
    });
  }).sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : 0));
}

/**
 * Chữ ký gắn vào thư trả lời: bản người dùng đã đặt; chưa đặt thì gợi ý từ
 * chữ ký Lark Mail (máy có lark-cli), không có nữa thì tên + hộp chính.
 */
const goiYChuKy = new Map();
async function layChuKy(n) {
  const daDat = kho.chuKy(n.nguoi);
  if (typeof daDat === 'string') return daDat;
  if (goiYChuKy.has(n.nguoi)) return goiYChuKy.get(n.nguoi);
  const hop = await cacHop(n);
  const lark = n.tk ? '' : await thu.chuKyLark(hopChinh(hop)).catch(() => '');
  const goiY = lark || [n.ten, hopChinh(hop)].filter(Boolean).join('\n');
  goiYChuKy.set(n.nguoi, goiY);
  return goiY;
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
async function thuTuDuong(res, n, hopRaw, idRaw) {
  let hop, id;
  try { hop = decodeURIComponent(hopRaw).toLowerCase(); id = decodeURIComponent(idRaw); } catch (_) {}
  if (!hop || !id || !LA_ID.test(id)) { loi(res, 400, 'Mã thư không hợp lệ'); return null; }
  const ds = await cacHop(n);
  if (!ds.some((h) => h.email === hop)) { loi(res, 403, 'Hộp thư này không nằm trong các hộp anh được cấp quyền'); return null; }
  return { hop, id };
}

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/suc-khoe') return json(res, { ok: true });

  const quyen = await laChu(req);
  const n = quyen.n;
  if (!quyen.ok) {
    return loi(res, 403, quyen.n.quaHub
      ? 'Hộp thư đang nối với tài khoản Lark ' + (quyen.chu || '(chưa rõ)') + '. Chỉ chủ tài khoản đó mở được.'
      : 'App chỉ mở được qua Marketing Hub.', { khongPhaiChu: true });
  }
  await kho.nap(n.nguoi, n.khoa);

  if (p === '/api/hop' && m === 'GET') {
    const hop = await cacHop(n);
    return json(res, { hop, chinh: hopChinh(hop), ngan: NGAN, ai: ai.coKhoa(), model: cfg.ai.model });
  }

  if (p === '/api/thu' && m === 'GET') {
    const d = await docHet(n, url.searchParams.get('lam') === '1');
    const hop = await cacHop(n);
    const { daTraLoi, cho } = ghepChuoi(d.ds, d.gui || []);
    const ds = lamGiau(d.ds, hop, n.nguoi).map((t) => (daTraLoi.has(t.hop + '|' + t.id) ? Object.assign(t, { daTraLoi: true }) : t));
    return json(res, { luc: d.luc, thu: ds, cho, nhom: kho.nhom(n.nguoi), loi: d.loi });
  }

  /* Chữ ký: lần đầu gợi ý từ Lark Mail (máy có lark-cli), sau đó là bản người dùng tự sửa. */
  if (p === '/api/chu-ky' && m === 'GET') {
    const daDat = typeof kho.chuKy(n.nguoi) === 'string';
    return json(res, { chuKy: await layChuKy(n), daDat });
  }
  if (p === '/api/chu-ky' && m === 'POST') {
    const b = await docThan(req);
    kho.datChuKy(String(b.chuKy || ''), n.nguoi);
    return json(res, { ok: true, chuKy: kho.chuKy(n.nguoi) });
  }

  /* Nhóm việc theo dõi: giao diện gửi cả danh sách, máy chủ kiểm khuôn rồi cất. */
  if (p === '/api/nhom' && m === 'POST') {
    const b = await docThan(req);
    const ds = Array.isArray(b.nhom) ? b.nhom.slice(0, 50) : null;
    if (!ds) return loi(res, 400, 'Danh sách nhóm không hợp lệ');
    const sach = ds.map((g) => ({
      id: String(g.id || '').slice(0, 40),
      ten: String(g.ten || '').trim().slice(0, 80) || 'Nhóm chưa đặt tên',
      luc: Number(g.luc) || Date.now(),
      chuoi: (Array.isArray(g.chuoi) ? g.chuoi : []).slice(0, 100).map((c) => ({
        hop: String(c.hop || '').toLowerCase().slice(0, 120), chuoi: String(c.chuoi || '').slice(0, 200),
        td: String(c.td || '').slice(0, 200),
      })).filter((c) => c.hop && c.chuoi),
    })).filter((g) => /^[\w-]{4,40}$/.test(g.id));
    kho.datNhom(sach, n.nguoi);
    return json(res, { ok: true, nhom: sach });
  }

  /* Thêm vào lịch Lark của chính người đang dùng. */
  if (p === '/api/lich' && m === 'POST') {
    if (process.env.HOP_THU_CHI_DOC === '1') return loi(res, 423, 'Đang ở chế độ chỉ đọc, không tạo lịch');
    const b = await docThan(req);
    const batDau = Number(b.batDau), ketThuc = Number(b.ketThuc);
    const tieuDe = String(b.tieuDe || '').trim().slice(0, 200);
    if (!tieuDe) return loi(res, 400, 'Sự kiện chưa có tên');
    if (!batDau || !ketThuc || ketThuc <= batDau) return loi(res, 400, 'Giờ kết thúc phải sau giờ bắt đầu');
    try {
      const kq = await thu.taoLich({ tieuDe, batDau, ketThuc, moTa: String(b.moTa || '').slice(0, 3000) }, n.tk);
      return json(res, { ok: true, kq });
    } catch (e) {
      if (e instanceof mapi.LoiQuyenLich) return loi(res, 409, e.message, { canQuyenLich: true });
      throw e;
    }
  }

  /* Xếp nhanh bằng AI những thư luật không nhận. Giao diện gọi sau khi nạp
   * danh sách; mỗi thư chỉ xếp một lần vì kết quả nằm trong bộ đệm. */
  if (p === '/api/xep-ai' && m === 'POST') {
    if (!ai.coKhoa()) return json(res, { xep: 0, khongKhoa: true });
    const d = await docHet(n, false);
    const hop = await cacHop(n);
    const can = lamGiau(d.ds, hop, n.nguoi).filter((t) => t.nguon === 'mac-dinh' && !kho.layAi(t.hop, t.id)).slice(0, 80);
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
    kho.datLuat(email, b.ngan || null, n.nguoi);
    return json(res, { ok: true, luat: kho.luat(n.nguoi) });
  }

  const mt = /^\/api\/thu\/([^/]+)\/([^/]+)(?:\/([a-z-]+))?$/.exec(p);
  if (!mt) return loi(res, 404, 'Không có đường này');
  const k = await thuTuDuong(res, n, mt[1], mt[2]);
  if (!k) return;
  const viec = mt[3] || '';

  /* Chế độ chỉ đọc cho lúc soát giao diện: dữ liệu Lark là thư thật của công
   * ty, công cụ soát không được gửi thư nào. (Đổi trạng thái chỉ ghi sổ riêng,
   * mà chế độ này sổ chỉ nằm trên máy.) */
  if (process.env.HOP_THU_CHI_DOC === '1' && viec === 'tra-loi') {
    return loi(res, 423, 'Đang ở chế độ chỉ đọc, không gửi gì lên Lark Mail');
  }

  if (!viec && m === 'GET') {
    const t = await thu.doc(k.hop, k.id, n.tk);
    return json(res, { thu: t, ai: kho.layAi(k.hop, k.id), hen: kho.hen(n.nguoi)[kho.khoa(k.hop, k.id)] || 0 });
  }

  if (viec === 'phan-tich' && m === 'POST') {
    if (!ai.coKhoa()) return loi(res, 409, 'Chưa có khoá Claude API', { khongKhoa: true });
    const t = await thu.doc(k.hop, k.id, n.tk);
    const kq = await ai.phanTich(t, { nguoi: quyen.n.ten || 'anh Hùng' });
    kho.datAi(k.hop, k.id, kq);
    return json(res, { ai: kho.layAi(k.hop, k.id) });
  }

  if (viec === 'nhap' && m === 'POST') {
    if (!ai.coKhoa()) return loi(res, 409, 'Chưa có khoá Claude API', { khongKhoa: true });
    const b = await docThan(req);
    const t = await thu.doc(k.hop, k.id, n.tk);
    const chu = await ai.vietNhap(t, String(b.yDinh || ''), { nguoi: quyen.n.ten || 'Lê Văn Hùng' });
    return json(res, { chu });
  }

  /* Đổi trạng thái: CHỈ ghi sổ riêng của người này, không đụng nhãn hay thư
   * mục trên Lark Mail (anh Hùng 28/10/2026: hộp chung còn người khác dùng). */
  if (viec === 'doi' && m === 'POST') {
    const b = await docThan(req);
    const doi = {};
    if (typeof b.daDoc === 'boolean') doi.daDoc = b.daDoc;
    if (typeof b.sao === 'boolean') doi.sao = b.sao;
    if (typeof b.xong === 'boolean') doi.xong = b.xong;
    if (!Object.keys(doi).length) return loi(res, 400, 'Không có thay đổi nào');
    return json(res, { ok: true, tt: kho.datTT(k.hop, k.id, doi, n.nguoi) });
  }

  if (viec === 'hen' && m === 'POST') {
    const b = await docThan(req);
    const den = Number(b.den) || 0;
    if (den && den < Date.now()) return loi(res, 400, 'Giờ hẹn đã qua');
    kho.datHen(k.hop, k.id, den || null, n.nguoi);
    return json(res, { ok: true });
  }

  /* Xem trước: đúng thân thư sẽ đi (phần viết + chữ ký + trích thư gốc), người
   * nhận, tiêu đề, và các lỗi chữ soát được. Không ghi gì lên Lark. */
  if (viec === 'xem-truoc' && m === 'POST') {
    const b = await docThan(req);
    const chu = String(b.chu || '').trim();
    if (!chu) return loi(res, 400, 'Thư trả lời đang trống');
    const g = await thu.doc(k.hop, k.id, n.tk);
    const tatCa = b.tatCa === true;
    const nhan = [g.tu].concat(tatCa ? g.den : []).filter((x) => x.email && x.email !== k.hop);
    const cc = tatCa ? g.cc.filter((x) => x.email && x.email !== k.hop) : [];
    const motLan = (ds) => ds.filter((x, i) => ds.findIndex((y) => y.email === x.email) === i);
    const chuKy = b.coChuKy === false ? '' : await layChuKy(n);
    const esc =(s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = thu.thanThu(chu, chuKy) +
      '<div style="margin-top:18px;color:#666;font-size:13px">Vào ' + esc(g.ngay) + ', ' + esc(g.tu.ten || g.tu.email) + ' đã viết:</div>' +
      '<blockquote style="margin:6px 0 0;border-left:2px solid #ccc;padding-left:10px;color:#666;font-size:13px;white-space:pre-wrap">' +
      esc(String(g.noiDung || '').slice(0, 3000)) + '</blockquote>';
    let loiChu = chinhTa.soat(chu);
    let aiSoat = false;
    if (ai.coKhoa() && b.soatAi !== false) {
      try { loiChu = chinhTa.gopAi(chu, loiChu, await ai.soatChinhTa(chu)); aiSoat = true; } catch (_) { /* AI hỏng vẫn còn bộ soát trên máy */ }
    }
    const tieuDe = /^(re|trả lời|tl)\s*:/i.test(g.tieuDe || '') ? g.tieuDe : 'Re: ' + (g.tieuDe || '');
    return json(res, { tu: k.hop, den: motLan(nhan), cc: motLan(cc), tieuDe, html, chuKy, loi: loiChu, aiSoat });
  }

  if (viec === 'tra-loi' && m === 'POST') {
    const b = await docThan(req);
    const chu = String(b.chu || '').trim();
    if (!chu) return loi(res, 400, 'Thư trả lời đang trống');
    if (chu.length > 20000) return loi(res, 400, 'Thư trả lời quá dài');
    const chuKy = b.coChuKy === false ? '' : await layChuKy(n);
    const kq =await thu.traLoi(k.hop, k.id, chu, { gui: b.gui === true, tatCa: b.tatCa === true, chuKy }, n.tk);
    quenDs(n);
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
    if (thu.LoiChuaNoi && e instanceof thu.LoiChuaNoi) return loi(res, 503, e.message, { chuaNoi: true, noiDuoc: Boolean(e.noiDuoc) });
    loi(res, e instanceof ai.LoiAi ? 502 : 500, e.message || String(e));
  }
});

if (require.main === module) {
  server.listen(cfg.port, BIND, () => {
    console.log('Hộp thư · http://localhost:' + cfg.port + (ai.coKhoa() ? ' · AI bật (' + cfg.ai.model + ')' : ' · AI tắt (chưa có ANTHROPIC_API_KEY)'));
  });
}

module.exports = { server, aiGoi, lamGiau, ghepChuoi };
