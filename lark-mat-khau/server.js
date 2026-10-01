'use strict';
/**
 * ============================================================================
 * App "Tài khoản & gói dịch vụ" — kho mật khẩu + tài sản đăng ký của phòng
 * ============================================================================
 * Chạy: node server.js  →  http://localhost:5189
 *
 * Thay file Excel "TÀI KHOẢN MẬT KHẨU - ROOTY TRIP" (72 tài khoản, mật khẩu để
 * chữ thường, ai có file là có hết) và bảng gói đăng ký trên Base "TÀI SẢN
 * PHÒNG BAN" (16 gói Adobe/Canva…, mật khẩu cũng để chữ thường).
 *
 * BA LỚP CHẮN, lớp nào cũng phải đứng được một mình:
 *   1. Base chỉ giữ chuỗi mã hoá AES-256-GCM (ma-hoa.js). Khoá ở biến môi
 *      trường, không ở Base, không ở git. Lộ link Base ≠ lộ mật khẩu.
 *   2. Quyền xem theo TỪNG tài khoản: quản lý thấy hết; người khác chỉ thấy tài
 *      khoản mà quản lý đã cấp ở cột "Được xem mật khẩu". Kiểm trên bản ghi ĐỌC
 *      TƯƠI, không trên bộ đệm — vừa bị rút quyền là mất quyền ngay.
 *   3. Mỗi lần mở một mật khẩu là một dòng ở bảng "Nhật ký truy cập". Không ghi
 *      được nhật ký thì KHÔNG trả mật khẩu (đóng khi hỏng, không mở khi hỏng).
 *
 * Danh sách gửi lên trình duyệt không bao giờ mang mật khẩu — kể cả dạng mã hoá
 * (xem kho.js). Mật khẩu chỉ đi qua POST /api/mo, từng ô một.
 *
 * Chỉ nghe 127.0.0.1. Trên Render đặt BIND=0.0.0.0 và chạy sau cổng đăng nhập của hub.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const kho = require('./kho');
const mh = require('./ma-hoa');
const kiem = require('./kiem');
const danhBaCty = require('./danh-ba');

const lark = kho.lark;
const BIND = process.env.BIND || '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');
const NGAY = 86400000;

/* ---------------- trả lời ---------------- */

function gui(res, ma, than, headers = {}) {
  const buf = Buffer.isBuffer(than) ? than : Buffer.from(String(than), 'utf8');
  res.writeHead(ma, Object.assign({ 'Content-Length': buf.length }, headers));
  res.end(buf);
}

/* no-store cho MỌI câu trả lời API: một mật khẩu nằm trong bộ đệm trình duyệt
   hay proxy là một mật khẩu nằm ngoài tầm nhật ký. */
const json = (res, o, ma = 200) =>
  gui(res, ma, JSON.stringify(o), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });

const loi = (res, ma, thong) => json(res, { error: thong }, ma);

function docThan(req, tran = 64 * 1024) {
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

/* ---------------- ai đang gọi ---------------- */

let demToi = { luc: 0, nguoi: null };

/** Cùng giao kèo với các app con khác — xem lark-san-pham/server.js → aiGoi. */
/* Khác các app con khác ở chỗ KHÔNG loại trừ HUB=1.
 * Hub chạy trên máy (chế độ cli) không có bước đăng nhập nên không gửi header
 * danh tính; thiếu nhánh này thì anh Hùng mở app qua localhost:5180 cũng chỉ
 * thấy ổ khoá (30/09/2026). Cho quản lý ở đây KHÔNG mở thêm gì: ở chế độ cli
 * app đọc Base bằng chính phiên lark-cli của người ngồi máy — người đó vốn đã
 * đọc được cả Base. Hub chế độ api truyền LARK_APP_ID xuống (children.js →
 * envChoCon) nên app con cũng ở chế độ api và nhánh này tắt. */
function chayMotMinh() {
  return cfg.mode !== 'api' && ['127.0.0.1', 'localhost', '::1'].includes(BIND);
}

async function aiGoi(req) {
  const h = req.headers || {};
  const de = (v) => { try { return decodeURIComponent(v || ''); } catch (_) { return v || ''; } };
  if (['x-hub-user-id', 'x-hub-user-email', 'x-hub-user-name'].some((k) => k in h)) {
    return {
      id: h['x-hub-user-id'] || '',
      ten: de(h['x-hub-user-name']) || h['x-hub-user-id'] || '',
      email: de(h['x-hub-user-email']),
      quanLy: h['x-hub-user-manager'] === '1',
      quaHub: true,
    };
  }
  /* "Xem như" một nhân viên để quản lý thử giao diện của họ: TK_XEM_NHU="ou_…|Tên".
     CHỈ khi chạy một mình trên máy (loopback, không do hub bật, không chế độ api) —
     ở mọi chỗ khác biến này bị bỏ qua, nên không thành cửa mạo danh. Luôn là vai
     nhân sự, không bao giờ cấp quản lý. */
  if (chayMotMinh() && process.env.TK_XEM_NHU) {
    const [id, ten] = process.env.TK_XEM_NHU.split('|');
    return { id: id || '', ten: ten || id || '', email: '', quanLy: false, quaHub: false };
  }
  if (Date.now() - demToi.luc < 60000 && demToi.nguoi) return demToi.nguoi;
  let u = null;
  try { u = await lark.whoami(); } catch (_) { u = null; }
  const n = {
    id: (u && u.id) || '',
    ten: (u && u.name) || 'Chưa đăng nhập',
    email: '',
    quanLy: chayMotMinh(),
    quaHub: false,
  };
  demToi = { luc: Date.now(), nguoi: n };
  return n;
}

const boDau = (s) => String(s || '').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

/**
 * Người này có nằm trong danh sách (ô người dùng trên Base) không.
 *
 * Khớp id TRƯỚC, rồi mới tới tên. Tên là đường lùi có chủ ý: open_id RIÊNG theo
 * từng app Lark (xem memory lark-nam-app-cua-phong) — chạy trên máy bằng
 * lark-cli thì Base trả open_id của app CLI, còn hub gửi xuống open_id của app
 * Marketing Hub; cùng một người mà hai id. Header tên do hub đặt sau khi đã xoá
 * mọi header x-hub-* của trình duyệt, nên người dùng không tự khai tên được.
 */
function coTrong(toi, ds) {
  if (!toi || !Array.isArray(ds)) return false;
  const t = boDau(toi.ten);
  return ds.some((x) => (toi.id && x.id === toi.id) || (t && x.ten && boDau(x.ten) === t));
}

/* MỘT định nghĩa quyền cho mọi cửa: thấy dòng = xem mật khẩu = sửa dòng đó.
   Anh Hùng 30/09: "người mới thì không thấy gì, ai được phân quyền mới có thể
   thấy và điều chỉnh nội dung mình được phân quyền". */
const xemDuoc = (toi, banGhi) => !!toi.quanLy || coTrong(toi, banGhi.duocXem);

/** Phần dữ liệu người này được thấy. Mọi câu trả lời có dòng dữ liệu đều đi qua đây. */
const phanCua = (toi, d) => ({
  luc: d.luc,
  tk: d.tk.filter((x) => xemDuoc(toi, x)),
  goi: d.goi.filter((x) => xemDuoc(toi, x)),
});

/* Tên cho nhật ký, do trình duyệt gửi kèm id đã chọn. Chỉ để ĐỌC nhật ký cho
   dễ — quyền không bao giờ dựa vào nó. */
const tenGui = (o) => {
  const m = new Map();
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) if (/^ou_\w+$/.test(k)) m.set(k, String(v || '').slice(0, 60));
  }
  return m;
};

/* ---------------- nhật ký ---------------- */

/** "YYYY-MM-DD HH:mm:ss" theo giờ VN — Base đọc chuỗi trần theo múi giờ của Base. */
function gioVN(t = Date.now()) {
  const d = new Date(t + 7 * 3600000);
  const h = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + h(d.getUTCMonth() + 1) + '-' + h(d.getUTCDate()) + ' ' +
    h(d.getUTCHours()) + ':' + h(d.getUTCMinutes()) + ':' + h(d.getUTCSeconds());
}

const TEN_BANG = { tk: 'Tài khoản', goi: 'Gói đăng ký' };

async function ghiNhatKy(toi, req, hanhDong, bang, banGhi, them) {
  /* "Nền tảng — Tên"; bỏ phần trùng hoặc trống để khỏi ra "Zalo — " cụt đuôi. */
  const tenDong = banGhi ? [banGhi.nenTang, banGhi.ten && banGhi.ten !== banGhi.nenTang ? banGhi.ten : (banGhi.nenTang ? '' : banGhi.user)]
    .filter(Boolean).join(' — ') : '';
  const viec = hanhDong + ' · ' + tenDong +
    (them ? ' · ' + them : '');
  console.log('[NHẬT KÝ]', hanhDong, bang, banGhi ? banGhi.id : '-', '| ai:', toi.ten || '?',
    toi.quaHub ? '(qua hub)' : '(máy)', '| từ:', req.headers.referer || '-');
  const F = cfg.f.nk;
  await lark.createRecord({
    [F.viec]: viec.slice(0, 300),
    [F.luc]: gioVN(),
    [F.nguoi]: (toi.ten || '?') + (toi.email ? ' <' + toi.email + '>' : ''),
    [F.hanhDong]: hanhDong,
    [F.bang]: TEN_BANG[bang] || bang || '',
    [F.ma]: banGhi ? banGhi.id : '',
  }, cfg.nkTableId);
}

/* ---------------- hạn mức mở mật khẩu ----------------
 * Người thật mở vài mật khẩu một lúc. Một phiên mở 40 cái trong 10 phút là
 * dấu hiệu có ai đó đang vét kho — chặn lại, và vì mỗi lần mở đã ghi nhật ký
 * nên quản lý thấy được ai. */
const HAN = { so: 40, ms: 10 * 60000 };
const lanMo = new Map();
function quaHan(toi) {
  const k = toi.id || toi.ten || '?';
  const nay = Date.now();
  const ds = (lanMo.get(k) || []).filter((t) => nay - t < HAN.ms);
  if (ds.length >= HAN.so) { lanMo.set(k, ds); return true; }
  ds.push(nay);
  lanMo.set(k, ds);
  return false;
}

/* ---------------- tệp tĩnh ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const VER = (() => {
  let t = 0;
  try {
    for (const f of fs.readdirSync(PUBLIC)) {
      try {
        const st = fs.statSync(path.join(PUBLIC, f));
        if (st.isFile()) t = Math.max(t, st.mtimeMs);
      } catch (_) {}
    }
  } catch (_) {}
  return String(Math.round(t / 1000) || 1);
})();

function tinh(res, duong, truyVan) {
  const p = duong === '/' ? '/index.html' : duong;
  const f = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
    return gui(res, 404, 'Không có ' + p, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  let body = fs.readFileSync(f);
  const trangChu = path.basename(f) === 'index.html';
  if (trangChu) body = Buffer.from(body.toString('utf8').split('v=BUILD').join('v=' + VER), 'utf8');
  gui(res, 200, body, {
    'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
    'Cache-Control': !trangChu && /[?&]v=/.test(truyVan || '')
      ? 'public, max-age=31536000' : 'no-store',
  });
}

/* ---------------- tổng quan ---------------- */

const dem = (ds, f) => ds.reduce((n, p) => n + (f(p) ? 1 : 0), 0);
const dangDung = (g) => !/ngừng|huỷ|hủy|dừng/i.test(g.trangThai || '');

const veNgay = (t) => {
  if (!t) return '';
  const d = new Date(t + 7 * 3600000);
  const hai = (n) => String(n).padStart(2, '0');
  return hai(d.getUTCDate()) + '/' + hai(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
};

/** Bộ số cho trang "Tổng quan chung" của hub và dải thẻ đầu app. KHÔNG có mật khẩu. */
function tongQuan({ tk, goi }) {
  const goiDung = goi.filter(dangDung);
  const daHet = goiDung.filter((g) => g.conLai != null && g.conLai < 0);
  const sapHet = goiDung.filter((g) => g.conLai != null && g.conLai >= 0 && g.conLai <= cfg.sapHetNgay);
  const thang = goiDung.reduce((a, g) => a + (g.chiPhiThang || 0), 0);
  const tkDung = tk.filter((x) => x.trangThai !== 'Ngừng dùng');
  const cu = tkDung.filter((x) => x.coMatKhau && (!x.doiLuc || Date.now() - x.doiLuc > cfg.cuNgay * NGAY));
  const chuaMaHoa = dem(tk, (x) => x.chuaMaHoa) + dem(goi, (x) => x.chuaMaHoa);
  /* Chỉ tính người phụ trách gắn tài khoản Lark — ô ghi tay đã bỏ khỏi app (01/10). */
  const thieuPT = dem(tkDung, (x) => !x.phuTrach.length);

  const the = [
    { chinh: true, nhan: 'Tài khoản đang quản lý', so: tkDung.length, dinhDang: 'so',
      ghi: goiDung.length + ' gói trả phí' },
    { nhan: 'Chi phí gói / tháng', so: thang, dinhDang: 'vnd', ghi: 'quy đổi gói năm ÷ 12' },
    { nhan: 'Gói đã hết hạn', so: daHet.length, dinhDang: 'so', muc: daHet.length ? 'cao' : 'ok' },
    { nhan: 'Gói hết hạn ≤ ' + cfg.sapHetNgay + ' ngày', so: sapHet.length, dinhDang: 'so',
      muc: sapHet.length ? 'vua' : 'ok' },
    { nhan: 'Mật khẩu > ' + cfg.cuNgay + ' ngày chưa đổi', so: cu.length, dinhDang: 'so',
      muc: cu.length ? 'thap' : 'ok' },
  ];
  if (chuaMaHoa) the.push({ nhan: 'Ô mật khẩu chưa mã hoá', so: chuaMaHoa, dinhDang: 'so', muc: 'cao' });

  const tenGoi = (g) => g.ten + (g.loai ? ' · ' + g.loai : '') + (g.user ? ' (' + g.user + ')' : '');
  const canXuLy = [
    ...daHet.map((g) => ({ id: g.id, tieuDe: 'Hết hạn: ' + tenGoi(g),
      phu: 'từ ' + veNgay(g.hetHan) + (g.chiPhi ? ' · ' + g.chiPhi.toLocaleString('vi-VN') + 'đ/' + (g.chuKy || 'kỳ').toLowerCase() : ''),
      the: ['Gói đăng ký'], muc: 'cao', _s: g.conLai })),
    ...sapHet.map((g) => ({ id: g.id, tieuDe: 'Sắp hết hạn: ' + tenGoi(g),
      phu: 'còn ' + g.conLai + ' ngày (' + veNgay(g.hetHan) + ')',
      the: ['Gói đăng ký'], muc: 'vua', _s: g.conLai })),
    ...(chuaMaHoa ? [{ tieuDe: chuaMaHoa + ' ô mật khẩu còn để chữ thường trên Base',
      phu: 'chạy node nhap.js --ma-hoa-goi', the: ['Bảo mật'], muc: 'cao', _s: -999 }] : []),
    ...(thieuPT ? [{ tieuDe: thieuPT + ' tài khoản chưa có người phụ trách', phu: 'bấm vào dòng để gán',
      the: ['Tài khoản'], muc: 'thap', _s: 900 }] : []),
  ].sort((a, b) => a._s - b._s).map(({ _s, ...v }) => v);

  return { the, canXuLy, canXuLyTong: canXuLy.length, tong: tk.length + goi.length,
    khoang: 'không lọc theo thời gian' };
}

/* ---------------- kiểm đầu vào ---------------- */

const BANG = new Set(['tk', 'goi']);
const laId = (x) => typeof x === 'string' && /^rec[\w]+$/.test(x);

function banGhiTu(bang, r) { return bang === 'goi' ? kho.tuGoi(r) : kho.tuTaiKhoan(r); }

/** Đọc TƯƠI một bản ghi và kiểm quyền trên chính bản đó. */
async function docVaKiem(toi, bang, id, truong) {
  const o = await kho.layO(bang, id, truong || 'matKhau');
  if (!o.co) { const e = new Error('Không thấy bản ghi này trên Base.'); e.http = 404; throw e; }
  const bg = banGhiTu(bang, o.banGhi);
  return { bg, gia: o.gia, duoc: xemDuoc(toi, bg) };
}

/* Danh sách người để quản lý chọn khi cấp quyền: gom từ MỌI ô người trên Base.
   Chỉ quản lý nhận được danh sách này. */
function danhBa({ tk, goi }, toi) {
  const m = new Map();
  for (const x of [...tk, ...goi]) {
    for (const n of [...x.phuTrach, ...x.duocXem]) if (n.id && !m.has(n.id)) m.set(n.id, n);
  }
  if (toi.id && !m.has(toi.id)) m.set(toi.id, { id: toi.id, ten: toi.ten });
  return [...m.values()].sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
}

const laOpenId = (x) => typeof x === 'string' && /^ou_\w+$/.test(x);

/**
 * Nhân sự thêm một dòng thì PHẢI tự được xem dòng đó — không thì thêm xong là
 * mất hút, vì danh sách chỉ hiện dòng được phân quyền. Gán họ vào "Được xem mật
 * khẩu", và vào "Người phụ trách" nếu ô đó còn trống. Quản lý vốn thấy hết nên
 * không gán gì (khỏi rác tên quản lý trên mọi dòng).
 *
 * id lấy từ header hub, mà hub và lớp ghi Base dùng CÙNG app Lark ở chế độ api,
 * nên open_id ghi xuống khớp với open_id đọc lên.
 */
function ganNguoiThem(toi, ghi, F) {
  if (toi.quanLy || !laOpenId(toi.id)) return;
  ghi[F.duocXem] = [{ id: toi.id }];
  const pt = ghi[F.phuTrach];
  if (!Array.isArray(pt) || !pt.length) ghi[F.phuTrach] = [{ id: toi.id }];
}

/* ---------------- API ---------------- */

async function api(req, res, u) {
  const p = u.pathname.replace(/^\/api/, '') || '/';
  const toi = await aiGoi(req);

  if (p === '/khoi-tao') {
    const d = await kho.tatCa();
    return json(res, {
      me: { ten: toi.ten, email: toi.email, quanLy: toi.quanLy },
      baseUrl: cfg.baseUrl,
      coKhoa: mh.coKhoa(),
      nhom: cfg.nhom,
      capNhat: d.luc,
      suaDuoc: cfg.suaDuoc,
      /* Có ít nhất một dòng thì được tìm người (để gán người phụ trách cho dòng đó). */
      timNguoi: toi.quanLy || phanCua(toi, d).tk.length + phanCua(toi, d).goi.length > 0,
    });
  }

  if (p === '/tim-nguoi') {
    const d = await kho.tatCa();
    const mine = phanCua(toi, d);
    if (!toi.quanLy && !(mine.tk.length + mine.goi.length)) return loi(res, 403, 'Chưa được phân quyền dòng nào.');
    try { return json(res, { ds: await danhBaCty.tim(u.searchParams.get('q')) }); }
    catch (e) { return loi(res, 502, 'Không tra được danh bạ: ' + e.message); }
  }

  if (p === '/danh-sach') {
    /* Chỉ những dòng người này được phân quyền — chưa được cấp gì là danh sách
       rỗng, kể cả tên nền tảng. Danh sách "ai được xem" chỉ quản lý cần. */
    const d = phanCua(toi, await kho.tatCa({ moi: u.searchParams.get('moi') === '1' }));
    const gan = (x) => Object.assign({}, x, { xem: true, duocXem: toi.quanLy ? x.duocXem : [] });
    return json(res, { tk: d.tk.map(gan), goi: d.goi.map(gan), capNhat: d.luc, tomTat: tongQuan(d) });
  }

  /* Thẻ số trên trang Tổng quan của hub cũng chỉ đếm phần của người đang xem. */
  if (p === '/tong-quan') return json(res, tongQuan(phanCua(toi, await kho.tatCa())));

  /* ---- mở một mật khẩu: cửa DUY NHẤT trả mật khẩu ra ngoài ---- */
  if (p === '/mo' && req.method === 'POST') {
    const than = await docThan(req);
    const bang = than.bang;
    const truong = than.truong === 'matKhauCu' ? 'matKhauCu' : 'matKhau';
    const hanhDong = than.viec === 'chep' ? 'Chép' : 'Xem';
    if (!BANG.has(bang) || !laId(than.id)) return loi(res, 400, 'Thiếu bảng hoặc mã bản ghi.');
    if (bang === 'goi' && truong === 'matKhauCu') return loi(res, 400, 'Gói đăng ký không lưu mật khẩu cũ.');
    if (quaHan(toi)) return loi(res, 429, 'Mở quá nhiều mật khẩu trong 10 phút. Đợi một lúc rồi thử lại.');

    let r;
    try { r = await docVaKiem(toi, bang, than.id, truong); } catch (e) { return loi(res, e.http || 500, e.message); }
    if (!r.duoc) {
      try { await ghiNhatKy(toi, req, 'Bị từ chối', bang, r.bg, 'chưa được cấp quyền'); } catch (_) {}
      return loi(res, 403, 'Anh/chị chưa được cấp quyền xem mật khẩu này. Nhờ quản lý cấp ở tab Phân quyền.');
    }
    if (!r.gia) return json(res, { matKhau: '', trong: true });

    let matKhau;
    try { matKhau = mh.giaiMa(r.gia); } catch (e) { return loi(res, 500, e.message); }
    /* Ghi nhật ký TRƯỚC khi trả. Hỏng là không trả — xem đầu tệp. */
    try {
      await ghiNhatKy(toi, req, hanhDong, bang, r.bg, truong === 'matKhauCu' ? 'mật khẩu cũ' : '');
    } catch (e) {
      console.error('[NHẬT KÝ] hỏng:', e.message);
      return loi(res, 503, 'Không ghi được nhật ký truy cập nên chưa mở mật khẩu. Thử lại sau ít giây.');
    }
    return json(res, { matKhau, chuaMaHoa: !mh.daMaHoa(r.gia) });
  }

  /* ---- đổi mật khẩu: ai xem được thì đổi được (thường là người phụ trách) ---- */
  if (p === '/doi-mat-khau' && req.method === 'POST') {
    const than = await docThan(req);
    const bang = than.bang;
    const moi = typeof than.matKhau === 'string' ? than.matKhau : '';
    if (!BANG.has(bang) || !laId(than.id)) return loi(res, 400, 'Thiếu bảng hoặc mã bản ghi.');
    if (!moi || moi.length > 500) return loi(res, 400, 'Mật khẩu mới trống hoặc dài quá 500 ký tự.');
    if (!mh.coKhoa()) return loi(res, 503, 'Máy chủ chưa có khoá TK_KHOA — không ghi mật khẩu chữ thường lên Base.');

    let r;
    try { r = await docVaKiem(toi, bang, than.id, 'matKhau'); } catch (e) { return loi(res, e.http || 500, e.message); }
    if (!r.duoc) return loi(res, 403, 'Chưa được cấp quyền với tài khoản này.');

    const F = bang === 'goi' ? cfg.f.goi : cfg.f.tk;
    const truong = { [F.matKhau]: mh.maHoa(moi) };
    if (bang === 'tk') {
      /* Giữ lại mật khẩu vừa bị thay: đổi xong mà trang kia chưa nhận là còn
         đường quay về. Chỉ giữ MỘT đời, cũ hơn nữa thì bỏ. */
      if (r.gia) truong[F.matKhauCu] = mh.daMaHoa(r.gia) ? r.gia : mh.maHoa(r.gia);
      truong[F.doiLuc] = gioVN();
    }
    await ghiNhatKy(toi, req, 'Đổi mật khẩu', bang, r.bg);
    await lark.updateRecord(than.id, truong, bang === 'goi' ? cfg.goiTableId : cfg.tkTableId);
    kho.xoaDem();
    return json(res, { ok: true });
  }

  /* ---- xoá mật khẩu (làm trống ô), tài khoản vẫn giữ ----
   * Cùng quyền với đổi mật khẩu. Bảng Tài khoản: mật khẩu vừa xoá chuyển sang
   * cột "cũ" — bấm nhầm là còn đường lấy lại. Bảng gói không có cột cũ nên giao
   * diện nói rõ điều đó trước khi bấm. */
  if (p === '/xoa-mat-khau' && req.method === 'POST') {
    const than = await docThan(req);
    const bang = than.bang;
    if (!BANG.has(bang) || !laId(than.id)) return loi(res, 400, 'Thiếu bảng hoặc mã bản ghi.');
    let r;
    try { r = await docVaKiem(toi, bang, than.id, 'matKhau'); } catch (e) { return loi(res, e.http || 500, e.message); }
    if (!r.duoc) return loi(res, 403, 'Chưa được cấp quyền với tài khoản này.');
    if (!r.gia) return loi(res, 400, 'Ô mật khẩu đang trống.');
    const F = bang === 'goi' ? cfg.f.goi : cfg.f.tk;
    const truong = { [F.matKhau]: null };
    if (bang === 'tk') {
      if (!mh.coKhoa() && !mh.daMaHoa(r.gia)) return loi(res, 503, 'Máy chủ chưa có khoá TK_KHOA.');
      truong[F.matKhauCu] = mh.daMaHoa(r.gia) ? r.gia : mh.maHoa(r.gia);
      truong[F.doiLuc] = gioVN();
    }
    await ghiNhatKy(toi, req, 'Xoá mật khẩu', bang, r.bg, bang === 'tk' ? 'đã cất sang mật khẩu cũ' : 'gói không lưu bản cũ');
    await lark.updateRecord(than.id, truong, bang === 'goi' ? cfg.goiTableId : cfg.tkTableId);
    kho.xoaDem();
    return json(res, { ok: true });
  }

  /* ---- xoá hẳn một dòng: chỉ quản lý ----
   * Ghi nhật ký TRƯỚC khi xoá, kèm tên + user (không bao giờ kèm mật khẩu): xoá
   * xong thì bản ghi không còn, nhật ký là dấu vết duy nhất "ai xoá cái gì". */
  if (p === '/xoa-dong' && req.method === 'POST') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý xoá được tài khoản / gói.');
    const than = await docThan(req);
    const bang = than.bang;
    if (!BANG.has(bang) || !laId(than.id)) return loi(res, 400, 'Thiếu bảng hoặc mã bản ghi.');
    const tableId = bang === 'goi' ? cfg.goiTableId : cfg.tkTableId;
    const raw = await lark.getRecord(than.id, tableId);
    if (!raw) return loi(res, 404, 'Không thấy bản ghi này trên Base.');
    const bg = banGhiTu(bang, raw);
    await ghiNhatKy(toi, req, 'Xoá dòng', bang, bg, bg.user ? 'user: ' + bg.user : '');
    await lark.deleteRecords([than.id], tableId);
    kho.xoaDem();
    return json(res, { ok: true });
  }

  /* ---- cấp / rút quyền xem: chỉ quản lý ---- */
  if (p === '/cap-quyen' && req.method === 'POST') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý cấp được quyền xem mật khẩu.');
    const than = await docThan(req);
    const bang = than.bang;
    const ids = Array.isArray(than.ids) ? than.ids.filter(laId) : [];
    const nguoi = Array.isArray(than.nguoi) ? than.nguoi.filter((x) => typeof x === 'string' && /^ou_\w+$/.test(x)) : null;
    if (!BANG.has(bang) || !ids.length || !nguoi) return loi(res, 400, 'Thiếu bảng, tài khoản hoặc danh sách người.');
    if (ids.length > 200) return loi(res, 400, 'Một lượt tối đa 200 dòng.');
    const kieu = ['dat', 'them', 'bot'].includes(than.kieu) ? than.kieu : 'dat';

    const d = await kho.tatCa({ moi: true });
    const theoId = new Map((bang === 'goi' ? d.goi : d.tk).map((x) => [x.id, x]));
    const F = bang === 'goi' ? cfg.f.goi : cfg.f.tk;
    const map = {};
    for (const id of ids) {
      const x = theoId.get(id);
      if (!x) continue;
      const cu = x.duocXem.map((n) => n.id).filter(Boolean);
      const ra = kieu === 'dat' ? nguoi
        : kieu === 'them' ? [...new Set([...cu, ...nguoi])]
          : cu.filter((i) => !nguoi.includes(i));
      map[id] = { [F.duocXem]: ra.map((i) => ({ id: i })) };
    }
    if (!Object.keys(map).length) return loi(res, 404, 'Không thấy dòng nào trong số đã chọn.');
    const ten = new Map([...danhBa(d, toi).map((n) => [n.id, n.ten]), ...tenGui(than.tenNguoi)]);
    const mo = (kieu === 'bot' ? 'rút: ' : kieu === 'them' ? 'thêm: ' : 'đặt: ') +
      (nguoi.map((i) => ten.get(i) || i).join(', ') || '(không ai)');
    await ghiNhatKy(toi, req, 'Cấp quyền', bang,
      ids.length === 1 ? theoId.get(ids[0]) : { id: ids.join(','), ten: ids.length + ' dòng' }, mo);
    await lark.updateMany(map, bang === 'goi' ? cfg.goiTableId : cfg.tkTableId);
    kho.xoaDem();
    return json(res, { ok: true, so: Object.keys(map).length });
  }

  /* ---- thêm tài khoản mới: chỉ quản lý ---- */
  if (p === '/them' && req.method === 'POST') {
    /* Ai cũng thêm được (anh Hùng 01/10). Nhân sự thêm thì tự được cấp xem — xem ganNguoiThem. */
    if (!toi.quanLy && !laOpenId(toi.id)) return loi(res, 403, 'Chưa xác định được anh/chị là ai nên chưa thêm được.');
    if (!mh.coKhoa()) return loi(res, 503, 'Máy chủ chưa có khoá TK_KHOA.');
    const t = await docThan(req);
    const s = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
    if (!s(t.nenTang) && !s(t.ten)) return loi(res, 400, 'Cần ít nhất Nền tảng hoặc Tên tài khoản.');
    const nhom = cfg.nhom.includes(t.nhom) ? t.nhom : 'Khác';
    const F = cfg.f.tk;
    const o = {
      [F.ten]: s(t.ten) || s(t.nenTang),
      [F.nenTang]: s(t.nenTang),
      [F.nhom]: nhom,
      [F.link]: s(t.link, 1000) || null,
      [F.user]: s(t.user) || null,
      [F.sdt]: s(t.sdt, 40) || null,
      [F.ghiChu]: s(t.ghiChu, 2000) || null,
      [F.trangThai]: 'Đang dùng',
    };
    if (t.matKhau) { o[F.matKhau] = mh.maHoa(String(t.matKhau).slice(0, 500)); o[F.doiLuc] = gioVN(); }
    ganNguoiThem(toi, o, cfg.f.tk);
    await lark.createRecord(o, cfg.tkTableId);
    await ghiNhatKy(toi, req, 'Thêm mới', 'tk', { id: '', nenTang: s(t.nenTang), ten: s(t.ten) });
    kho.xoaDem();
    return json(res, { ok: true });
  }

  /* ---- sửa thông tin một dòng: chỉ quản lý ----
   * Chỉ những cột khai ở cfg.suaDuoc; mật khẩu không đi cửa này. Đọc bản ghi
   * TƯƠI trước khi ghi để nhật ký có được "cũ → mới" — sau khi ghi thì không
   * còn ai biết giá trị cũ là gì, mà đó là nửa quan trọng của một dòng nhật ký. */
  if (p === '/sua' && req.method === 'POST') {
    const than = await docThan(req);
    const bang = than.bang;
    if (!BANG.has(bang) || !laId(than.id)) return loi(res, 400, 'Thiếu bảng hoặc mã bản ghi.');
    let ghi;
    try { ghi = kiem.doiNhieu(bang, than.truong); } catch (e) { return loi(res, e.http || 400, e.message); }
    if (!Object.keys(ghi).length) return loi(res, 400, 'Không có gì thay đổi.');
    const tableId = bang === 'goi' ? cfg.goiTableId : cfg.tkTableId;
    const raw = await lark.getRecord(than.id, tableId);
    if (!raw) return loi(res, 404, 'Không thấy bản ghi này trên Base.');
    const cu = banGhiTu(bang, raw);
    /* Quyền kiểm trên bản ghi ĐỌC TƯƠI, như cửa mở mật khẩu. */
    if (!xemDuoc(toi, cu)) return loi(res, 403, 'Anh/chị chưa được phân quyền dòng này.');
    const tenNguoi = new Map([...danhBa(await kho.tatCa(), toi).map((n) => [n.id, n.ten]), ...tenGui(than.tenNguoi)]);
    const cot = kiem.theoBang(bang);
    const doi = Object.keys(than.truong).map((k) => {
      const c = cot.get(k);
      const ve = (v) => {
        if (c.kieu === 'nguoi') return (v || []).map((n) => n.ten || tenNguoi.get(n.id) || n.id).join(', ') || '(trống)';
        if (c.kieu === 'ngay') return v ? veNgay(typeof v === 'number' ? v : Date.parse(String(v).slice(0, 10) + 'T00:00:00+07:00')) : '(trống)';
        return v == null || v === '' ? '(trống)' : String(v).slice(0, 40);
      };
      return c.nhan + ': ' + ve(cu[k]) + ' → ' + ve(ghi[(bang === 'goi' ? cfg.f.goi : cfg.f.tk)[k]]);
    });
    await ghiNhatKy(toi, req, 'Sửa thông tin', bang, cu, doi.join(' · '));
    await lark.updateRecord(than.id, ghi, tableId);
    kho.xoaDem();
    return json(res, { ok: true, doi });
  }

  /* ---- thêm gói đăng ký: chỉ quản lý ---- */
  if (p === '/them-goi' && req.method === 'POST') {
    if (!toi.quanLy && !laOpenId(toi.id)) return loi(res, 403, 'Chưa xác định được anh/chị là ai nên chưa thêm được.');
    const than = await docThan(req);
    let ghi;
    try { ghi = kiem.doiNhieu('goi', than.truong); } catch (e) { return loi(res, e.http || 400, e.message); }
    if (!ghi[cfg.f.goi.ten]) return loi(res, 400, 'Cần tên dịch vụ.');
    if (than.matKhau) {
      if (!mh.coKhoa()) return loi(res, 503, 'Máy chủ chưa có khoá TK_KHOA.');
      ghi[cfg.f.goi.matKhau] = mh.maHoa(String(than.matKhau).slice(0, 500));
    }
    if (!ghi[cfg.f.goi.trangThai]) ghi[cfg.f.goi.trangThai] = 'Đang dùng';
    ganNguoiThem(toi, ghi, cfg.f.goi);
    await lark.createRecord(ghi, cfg.goiTableId);
    await ghiNhatKy(toi, req, 'Thêm mới', 'goi', { id: '', ten: ghi[cfg.f.goi.ten] });
    kho.xoaDem();
    return json(res, { ok: true });
  }

  /* ---- nhật ký: chỉ quản lý ---- */
  if (p === '/nhat-ky') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý xem được nhật ký truy cập.');
    const F = cfg.f.nk;
    const ds = (await lark.listAllRecords(cfg.nkTableId)).map((r) => {
      const c = r.cells || {};
      const luc = c[F.luc];
      return {
        viec: kho.chu(c[F.viec]),
        luc: typeof luc === 'number' ? luc : (Date.parse(luc) || 0),
        nguoi: kho.chu(c[F.nguoi]),
        hanhDong: Array.isArray(c[F.hanhDong]) ? kho.chu(c[F.hanhDong][0]) : kho.chu(c[F.hanhDong]),
        bang: kho.chu(c[F.bang]),
        ma: kho.chu(c[F.ma]),
      };
    }).sort((a, b) => b.luc - a.luc).slice(0, 500);
    return json(res, { ds });
  }

  if (p === '/lam-moi' && req.method === 'POST') {
    kho.xoaDem();
    const d = await kho.tatCa({ moi: true });
    return json(res, { ok: true, tong: d.tk.length + d.goi.length, capNhat: d.luc });
  }

  return loi(res, 404, 'Không có đường ' + p);
}

/* ---------------- máy chủ ---------------- */

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (u.pathname.startsWith('/api/')) {
    try {
      await api(req, res, u);
    } catch (e) {
      console.error('[API]', u.pathname, '->', e.message);
      if (!res.headersSent) loi(res, e.http || 500, e.message || 'Lỗi không xác định');
    }
    return;
  }
  return tinh(res, u.pathname, u.search);
});

if (require.main === module) {
  server.listen(cfg.port, BIND, () => {
    console.log('Tài khoản & gói dịch vụ — http://localhost:' + cfg.port +
      '  [' + cfg.mode + ']  bản ' + VER + (mh.coKhoa() ? '' : '  ⚠ CHƯA CÓ TK_KHOA'));
  });
}

module.exports = { server, aiGoi, api, tongQuan, coTrong, xemDuoc, gioVN, VER };
