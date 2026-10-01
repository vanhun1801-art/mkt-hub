'use strict';
/* ============================================================================
 * TÀI KHOẢN & GÓI DỊCH VỤ — giao diện
 * ============================================================================
 *
 * Ba câu hỏi app phải trả lời trong vài giây:
 *   1. Mật khẩu của tài khoản X là gì — nếu tôi được phép biết
 *   2. Gói nào sắp hết hạn, ai đang giữ, bao nhiêu thiết bị đã dùng
 *   3. Phòng đang trả bao nhiêu mỗi tháng cho các gói đăng ký
 *
 * Mật khẩu KHÔNG có trong dữ liệu trang nạp về. Mỗi lần bấm 👁 hoặc Chép là
 * một lượt gọi POST /api/mo — server kiểm quyền trên bản ghi đọc tươi và ghi
 * nhật ký rồi mới trả. Hiện ra rồi thì tự che lại sau 30 giây.
 *
 * Giấu nút chỉ là phép lịch sự; server chốt quyền.
 * Không framework, cùng lối với các app khác của phòng.
 * ========================================================================== */

const S = {
  me: null,
  coKhoa: true,
  nhom: [],
  timNguoi: false,        // server cho phép tìm danh bạ (quản lý, hoặc người đã được cấp ít nhất một dòng)
  suaDuoc: null,          // cột quản lý sửa được — server gửi, không tự giữ bản riêng
  baseUrl: '',
  tk: [],
  goi: [],
  tomTat: null,
  capNhat: 0,
  tab: 'tai-khoan',        // tai-khoan | goi | chi-phi | phan-quyen | nhat-ky
  loc: { tim: '', nhom: '' },
  mo: null,                // { bang, id } đang mở ở ngăn chi tiết
  hien: new Map(),         // khoá "bang:id:truong" → { gia, het }
  nk: null,                // nhật ký (quản lý)
  pq: { bang: 'tk', chon: new Set(), nguoi: new Map() },   // nguoi: id → tên
};

const laQuanLy = () => !!(S.me && S.me.quanLy);
const $ = (s, g = document) => g.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tien = (n) => (n == null ? '—' : Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ');

/* Đường TƯƠNG ĐỐI: qua hub app nằm dưới /m/mat-khau/. */
const apiUrl = (p) => (location.pathname.replace(/\/+$/, '') + p).replace(/^\/\//, '/');

async function api(duong, opt) {
  const r = await fetch(apiUrl(duong), Object.assign({ cache: 'no-store' }, opt));
  let d = null;
  try { d = await r.json(); } catch (_) {}
  if (!r.ok) throw new Error((d && d.error) || ('Lỗi ' + r.status));
  return d;
}
const guiJson = (duong, than) => api(duong, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(than),
});

/* Hộp xác nhận VẼ TRONG TRANG, không dùng confirm() của trình duyệt: khung trình
   duyệt nhúng (và vài trình duyệt khi trang nằm trong iframe) tự đóng hộp thoại
   gốc, confirm() trả false ngay — nút bấm im lặng không làm gì (30/09/2026, nút
   Cấp quyền). `html` đã được escape ở chỗ gọi. */
function xacNhan(html, nutDong) {
  return new Promise((xong) => {
    const nen = document.createElement('div');
    nen.className = 'xn-nen';
    nen.innerHTML = '<div class="xn-hop" role="dialog" aria-modal="true"><div class="xn-noi">' + html + '</div>' +
      '<div class="nut-hang xn-nut"><button class="btn sm" data-xn="0">Huỷ</button>' +
      '<button class="btn sm primary" data-xn="1">' + esc(nutDong || 'Đồng ý') + '</button></div></div>';
    const dong = (v) => { nen.remove(); document.removeEventListener('keydown', phim, true); xong(v); };
    const phim = (e) => { if (e.key === 'Escape') { e.stopPropagation(); dong(false); } if (e.key === 'Enter') { e.preventDefault(); dong(true); } };
    nen.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!e.isTrusted) return;
      const b = e.target.closest('[data-xn]');
      if (b) dong(b.dataset.xn === '1'); else if (e.target === nen) dong(false);
    });
    document.addEventListener('keydown', phim, true);
    document.body.appendChild(nen);
    nen.querySelector('[data-xn="1"]').focus();
  });
}

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 260); }, kind === 'err' ? 5200 : 2400);
}

const boDau = (s) => String(s || '').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const veNgay = (t) => {
  if (!t) return '';
  const d = new Date(t + 7 * 3600000);
  const hai = (n) => String(n).padStart(2, '0');
  return hai(d.getUTCDate()) + '/' + hai(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
};
const veGio = (t) => {
  if (!t) return '';
  const d = new Date(t + 7 * 3600000);
  const hai = (n) => String(n).padStart(2, '0');
  return veNgay(t) + ' ' + hai(d.getUTCHours()) + ':' + hai(d.getUTCMinutes());
};

const tenNguoi = (ds) => (ds || []).map((n) => n.ten).filter(Boolean).join(', ');
const phuTrachCua = (x) => tenNguoi(x.phuTrach) || x.phuTrachChu || '';
const timBanGhi = (bang, id) => (bang === 'goi' ? S.goi : S.tk).find((x) => x.id === id);

/* Link đăng nhập: chỉ http(s). Ô trên Base gõ tay được, một "javascript:" lọt
   vào href là chạy mã trong trang đang giữ mật khẩu. */
const linkAnToan = (u) => {
  const t = String(u || '').trim();
  if (!t) return '';
  const co = /^https?:\/\//i.test(t) ? t : (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t) ? 'https://' + t : '');
  try { return co ? new URL(co).href : ''; } catch (_) { return ''; }
};

/* ---------------------------------------------------------------------------
 * MẬT KHẨU: hiện / chép / che
 * ------------------------------------------------------------------------- */

const HIEN_MS = 30000;
/* Icon mắt vẽ bằng SVG, không dùng emoji: trong lớp vỏ hub, font giao diện không
   có glyph 👁 nên nút hiện thành ô trống (thấy 30/09/2026). */
const IC_MAT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const IC_CHE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const khoaHien = (bang, id, truong) => bang + ':' + id + ':' + (truong || 'matKhau');

async function layMatKhau(bang, id, truong, viec) {
  const d = await guiJson('/api/mo', { bang, id, truong, viec });
  return d.matKhau || '';
}

async function hienMatKhau(bang, id, truong) {
  const k = khoaHien(bang, id, truong);
  if (S.hien.has(k)) { S.hien.delete(k); veLai(); return; }
  try {
    const mk = await layMatKhau(bang, id, truong, 'xem');
    S.hien.set(k, { gia: mk, het: Date.now() + HIEN_MS });
    setTimeout(() => { const o = S.hien.get(k); if (o && o.het <= Date.now()) { S.hien.delete(k); veLai(); } }, HIEN_MS + 50);
    veLai();
  } catch (e) { toast(e.message, 'err'); }
}

async function chepMatKhau(bang, id, truong) {
  try {
    const mk = await layMatKhau(bang, id, truong, 'chep');
    if (!mk) return toast('Ô mật khẩu đang trống.', 'err');
    await navigator.clipboard.writeText(mk);
    toast('Đã chép mật khẩu — nhớ dán xong thì chép thứ khác đè lên.', 'ok');
  } catch (e) { toast(e.message || 'Trình duyệt chặn chép', 'err'); }
}

async function chepChu(chu) {
  try { await navigator.clipboard.writeText(chu); toast('Đã chép', 'ok'); }
  catch (_) { toast('Trình duyệt chặn chép', 'err'); }
}

/** Ô mật khẩu: chấm tròn · 👁 · Chép — hoặc khoá nếu chưa được cấp quyền. */
function oMatKhau(x, truong) {
  truong = truong || 'matKhau';
  const co = truong === 'matKhauCu' ? x.coMatKhauCu : x.coMatKhau;
  if (!co) return '<span class="mk trong">—</span>';
  if (!x.xem) return '<span class="mk khoa" title="Chưa được cấp quyền xem. Nhờ quản lý cấp.">🔒 chưa được cấp quyền</span>';
  const h = S.hien.get(khoaHien(x.bang, x.id, truong));
  return '<span class="mk">' +
    '<code class="mk-gia' + (h ? ' hien' : '') + '" data-no-i18n>' + (h ? esc(h.gia) : '••••••••') + '</code>' +
    '<button class="btn sm ic" data-mk="hien" data-bang="' + x.bang + '" data-id="' + x.id + '" data-truong="' + truong + '" title="' + (h ? 'Che lại' : 'Hiện 30 giây') + '">' + (h ? IC_CHE : IC_MAT) + '</button>' +
    '<button class="btn sm ic" data-mk="chep" data-bang="' + x.bang + '" data-id="' + x.id + '" data-truong="' + truong + '" title="Chép mật khẩu">⧉</button>' +
    (x.chuaMaHoa ? '<span class="nhan het" title="Ô này trên Base còn là chữ thường">chưa mã hoá</span>' : '') +
    '</span>';
}

/* ---------------------------------------------------------------------------
 * NẠP
 * ------------------------------------------------------------------------- */

async function napDanhSach(moi) {
  const d = await api('/api/danh-sach' + (moi ? '?moi=1' : ''));
  S.tk = d.tk; S.goi = d.goi; S.tomTat = d.tomTat; S.capNhat = d.capNhat;
}

async function khoiTao() {
  try {
    const [k] = await Promise.all([api('/api/khoi-tao'), napDanhSach()]);
    S.me = k.me; S.coKhoa = k.coKhoa; S.nhom = k.nhom; S.baseUrl = k.baseUrl; S.suaDuoc = k.suaDuoc || null; S.timNguoi = !!k.timNguoi;
    const chip = $('#chipToi');
    chip.textContent = (S.me.ten || '?') + (laQuanLy() ? ' · Quản lý' : '');
    chip.classList.toggle('ql', laQuanLy());
    veLai();
  } catch (e) {
    $('#man').innerHTML = '<div class="dangTai err">Không nạp được: ' + esc(e.message) + '</div>';
  }
}

/* ---------------------------------------------------------------------------
 * VẼ
 * ------------------------------------------------------------------------- */

const TAB = () => [
  { k: 'tai-khoan', ten: 'Tài khoản', dem: S.tk.length },
  { k: 'goi', ten: 'Gói đăng ký', dem: S.goi.length,
    canh: S.goi.filter((g) => g.conLai != null && g.conLai <= 14 && !/ngừng/i.test(g.trangThai)).length },
  { k: 'chi-phi', ten: 'Chi phí' },
  ...(laQuanLy() ? [{ k: 'phan-quyen', ten: 'Phân quyền' }, { k: 'nhat-ky', ten: 'Nhật ký' }] : []),
];

function veTab() {
  $('#tabs').innerHTML = TAB().map((t) =>
    '<button class="pill' + (S.tab === t.k ? ' on' : '') + '" data-tab="' + t.k + '">' + esc(t.ten) +
    (t.canh ? ' <span class="dem canh">' + t.canh + '</span>' : t.dem != null ? ' <span class="dem">' + t.dem + '</span>' : '') +
    '</button>').join('');
}

/* Thẻ số → tab chứa danh sách sau con số đó. */
const DI_THE = [
  (t) => /Tài khoản/.test(t.nhan) && 'tai-khoan',
  (t) => /Chi phí/.test(t.nhan) && 'chi-phi',
  (t) => /Gói/.test(t.nhan) && 'goi',
  (t) => /Mật khẩu >/.test(t.nhan) && 'tai-khoan',
];

function veDai() {
  const ds = (S.tomTat && S.tomTat.the) || [];
  return '<div class="dai">' + ds.map((t) => {
    const di = DI_THE.map((f) => f(t)).find(Boolean) || '';
    const so = t.dinhDang === 'vnd' ? tien(t.so) : (Number(t.so) || 0).toLocaleString('vi-VN');
    return '<button class="o bam' + (t.chinh ? ' chinh' : '') + (t.muc && t.muc !== 'ok' ? ' ' + t.muc : '') + '"' +
      (di ? ' data-di="' + di + '"' : ' disabled') + '>' +
      '<span class="nhan">' + esc(t.nhan) + '</span><span class="so">' + so + '</span>' +
      (t.ghi ? '<span class="ghi">' + esc(t.ghi) + '</span>' : '') + '</button>';
  }).join('') + '</div>';
}

function veCanhBao() {
  let h = '';
  if (!S.coKhoa) {
    h += '<div class="bao do">⚠ Máy chủ chưa có khoá <b>TK_KHOA</b> — không mở, không đổi được mật khẩu đã mã hoá. ' +
      'Quản lý chạy <code>node nhap.js --tao-khoa</code> trên máy, hoặc khai biến môi trường trên Render.</div>';
  }
  const chua = S.tk.filter((x) => x.chuaMaHoa).length + S.goi.filter((x) => x.chuaMaHoa).length;
  if (chua && laQuanLy()) {
    h += '<div class="bao do">⚠ ' + chua + ' ô mật khẩu trên Base còn để <b>chữ thường</b> — ai mở Base là đọc được. ' +
      'Chạy <code>node nhap.js --ma-hoa-goi</code> để mã hoá tại chỗ.</div>';
  }
  return h;
}

function veLai() {
  veTab();
  $('#phuDe').textContent = S.tk.length + ' tài khoản · ' + S.goi.length + ' gói · cập nhật ' + veGio(S.capNhat).slice(-5);
  const man = $('#man');
  const ve = { 'tai-khoan': veTaiKhoan, goi: veGoi, 'chi-phi': veChiPhi, 'phan-quyen': vePhanQuyen, 'nhat-ky': veNhatKy }[S.tab] || veTaiKhoan;
  /* Chưa được cấp dòng nào thì dải thẻ toàn số 0 chỉ là nhiễu — bỏ hẳn. */
  const trong = !laQuanLy() && !S.tk.length && !S.goi.length;
  man.innerHTML = veCanhBao() + (trong ? '' : veDai()) + ve();
  if (S.mo) veSo();
}

/* Người chưa được phân quyền dòng nào: KHÔNG thấy gì — kể cả tên nền tảng. */
const chuaDuocCap = () => '<div class="trong chua-cap"><div class="to">🔒</div>' +
  '<b>Anh/chị chưa được phân quyền tài khoản nào.</b><br>Nhờ quản lý cấp ở tab Phân quyền — được cấp dòng nào thì thấy và chỉnh dòng đó.</div>';

/* ---------------------------------------------------------------------------
 * Ô CHỌN NGƯỜI — gõ tên/email, chọn từ danh bạ công ty (GET /api/tim-nguoi)
 *   <div class="chon-nguoi" data-sua="phuTrach" | data-pq-chon>
 *     thẻ người đã chọn (data-id, data-ten) · ô gõ · danh sách gợi ý
 * ------------------------------------------------------------------------- */
function oChonNguoi(dsDaChon, thuocTinh) {
  return '<div class="chon-nguoi" ' + thuocTinh + '>' +
    '<span class="the-ng-ds">' + dsDaChon.map(theNguoi).join('') + '</span>' +
    '<span class="tim-ng-khung"><input class="tim-ng" type="search" autocomplete="off" placeholder="Gõ tên hoặc email để tìm trong danh bạ…">' +
    '<span class="goi-y-ng" hidden></span></span></div>';
}
const theNguoi = (n) => '<span class="the-ng" data-id="' + esc(n.id) + '" data-ten="' + esc(n.ten || '') + '"><span data-no-i18n>' +
  esc(n.ten || n.id) + '</span><button type="button" class="bo-ng" title="Bỏ">✕</button></span>';
const daChonTrong = (khung) => [...khung.querySelectorAll('.the-ng')].map((e) => ({ id: e.dataset.id, ten: e.dataset.ten }));

let hoanNg = 0, luotNg = 0;
async function timNguoi(inp) {
  const khung = inp.closest('.chon-nguoi');
  const hop = khung.querySelector('.goi-y-ng');
  const q = inp.value.trim();
  if (!q) { hop.hidden = true; return; }
  const luot = ++luotNg;
  hop.hidden = false;
  hop.innerHTML = '<span class="phu">Đang tìm…</span>';
  try {
    const d = await api('/api/tim-nguoi?q=' + encodeURIComponent(q));
    if (luot !== luotNg) return;                    // gõ tiếp rồi — bỏ kết quả cũ
    const co = new Set(daChonTrong(khung).map((n) => n.id));
    const ds = d.ds.filter((n) => !co.has(n.id));
    hop.innerHTML = ds.length ? ds.map((n) => '<button type="button" class="ng-goi-y" data-id="' + esc(n.id) + '" data-ten="' + esc(n.ten) + '">' +
      '<b data-no-i18n>' + esc(n.ten) + '</b><span class="phu" data-no-i18n>' + esc([n.phong, n.email].filter(Boolean).join(' · ')) + '</span></button>').join('')
      : '<span class="phu">Không thấy ai khớp.</span>';
  } catch (e) { if (luot === luotNg) hop.innerHTML = '<span class="phu">' + esc(e.message) + '</span>'; }
}

/* ---- Tài khoản ---- */

function locTk() {
  const q = boDau(S.loc.tim).trim();
  return S.tk.filter((x) =>
    (!S.loc.nhom || x.nhom === S.loc.nhom) &&
    (!q || boDau([x.nenTang, x.ten, x.user, x.link, phuTrachCua(x), x.ghiChu, x.sdt].join(' ')).includes(q)));
}

function veTaiKhoan() {
  const ds = locTk();
  const loc = '<div class="filters">' +
    '<input type="search" id="tim" placeholder="Tìm nền tảng, user, người phụ trách… (gõ không dấu cũng được)" value="' + esc(S.loc.tim) + '">' +
    '<select id="locNhom"><option value="">Mọi nhóm</option>' +
      S.nhom.map((n) => '<option' + (S.loc.nhom === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>' +
    (laQuanLy() ? '<button class="btn sm primary" id="btnThem">＋ Thêm tài khoản</button>' : '') +
    '<span class="demKq">' + ds.length + ' / ' + S.tk.length + '</span></div>';
  if (!S.tk.length && !laQuanLy()) return chuaDuocCap();
  if (!S.tk.length) {
    return loc + '<div class="trong">Bảng Tài khoản còn trống.' +
      (laQuanLy() ? '<br>Nhập file Excel bằng: <code>node nhap.js "…\\TÀI KHOẢN MẬT KHẨU - ROOTY TRIP.xlsx"</code>' : '') + '</div>';
  }
  const theoNhom = new Map();
  for (const x of ds) { if (!theoNhom.has(x.nhom)) theoNhom.set(x.nhom, []); theoNhom.get(x.nhom).push(x); }
  const thuTu = [...S.nhom, ...[...theoNhom.keys()].filter((k) => !S.nhom.includes(k))];
  return loc + thuTu.filter((k) => theoNhom.has(k)).map((k) =>
    '<div class="nhomDau"><b>' + esc(k) + '</b> <span class="phu">' + theoNhom.get(k).length + '</span><span class="vach"></span></div>' +
    '<div class="ds-tk">' + theoNhom.get(k).map(dongTk).join('') + '</div>').join('') +
    (ds.length ? '' : '<div class="trong">Không có tài khoản nào khớp.</div>');
}

function dongTk(x) {
  const link = linkAnToan(x.link);
  const cu = x.coMatKhau && (!x.doiLuc || Date.now() - x.doiLuc > 180 * 86400000);
  return '<div class="dong-tk' + (S.mo && S.mo.id === x.id ? ' chon' : '') + (x.trangThai === 'Ngừng dùng' ? ' ngung' : '') + '" data-mo="tk" data-id="' + x.id + '">' +
    '<div class="c-ten"><b data-no-i18n>' + esc(x.nenTang || x.ten || '(chưa đặt tên)') + '</b>' +
      (x.ten && x.ten !== x.nenTang ? '<span class="phu" data-no-i18n>' + esc(x.ten) + '</span>' : '') + '</div>' +
    '<div class="c-user">' + (x.user
      ? '<code data-no-i18n>' + esc(x.user) + '</code><button class="btn sm ic" data-chep="' + esc(x.user) + '" title="Chép user">⧉</button>'
      : '<span class="phu">—</span>') + '</div>' +
    '<div class="c-mk">' + oMatKhau(x) + '</div>' +
    '<div class="c-pt"><span class="phu" data-no-i18n>' + esc(phuTrachCua(x) || 'chưa giao') + '</span>' +
      (cu ? ' <span class="nhan canh" title="' + (x.doiLuc ? 'Đổi lần cuối ' + veNgay(x.doiLuc) : 'Chưa rõ lần đổi cuối') + '">lâu chưa đổi</span>' : '') + '</div>' +
    '<div class="c-lk">' + (link ? '<a class="btn sm" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" title="' + esc(link) + '">Mở ↗</a>' : '') + '</div>' +
    '</div>';
}

/* ---- Gói đăng ký ---- */

function hanCua(g) {
  if (g.conLai == null) return { lop: '', chu: 'chưa có hạn' };
  if (g.conLai < 0) return { lop: 'het', chu: 'đã hết hạn ' + (-g.conLai) + ' ngày' };
  if (g.conLai <= 14) return { lop: 'canh', chu: 'còn ' + g.conLai + ' ngày' };
  return { lop: 'ngay', chu: 'còn ' + g.conLai + ' ngày' };
}

function veGoi() {
  const dau = laQuanLy() && S.suaDuoc ? '<div class="filters"><span class="phu">Bấm vào một gói để sửa hạn, chi phí, thiết bị, người phụ trách.</span>' +
    '<button class="btn sm primary" id="btnThemGoi" style="margin-left:auto">＋ Thêm gói</button></div>' : '';
  if (!S.goi.length && !laQuanLy()) return chuaDuocCap();
  if (!S.goi.length) return dau + '<div class="trong">Chưa có gói đăng ký nào trên Base.</div>';
  return dau + '<div class="luoi">' + S.goi.map((g) => {
    const h = hanCua(g);
    const tb = g.tbToiDa ? Math.min(100, Math.round((g.tbDangDung || 0) / g.tbToiDa * 100)) : null;
    return '<div class="the' + (S.mo && S.mo.id === g.id ? ' chon' : '') + '" data-mo="goi" data-id="' + g.id + '">' +
      '<div class="dau"><div style="flex:1;min-width:0"><h3 data-no-i18n>' + esc(g.ten) + '</h3>' +
        '<div class="phu">' + esc([g.loai, g.chuKy && 'trả theo ' + g.chuKy.toLowerCase(), g.soLuong > 1 && g.soLuong + ' suất'].filter(Boolean).join(' · ')) + '</div></div>' +
        '<span class="nhan ' + h.lop + '">' + esc(h.chu) + '</span></div>' +
      '<div class="giaHang"><span class="gia">' + tien(g.chiPhi) + '</span><span class="giaTe">/ ' + esc((g.chuKy || 'kỳ').toLowerCase()) +
        (g.chiPhiThang != null && g.chuKy === 'Năm' ? ' · ≈ ' + tien(g.chiPhiThang) + '/tháng' : '') + '</span></div>' +
      '<div class="doi">' +
        '<div class="oNho"><div class="k">Hết hạn</div><div class="v">' + (veNgay(g.hetHan) || '—') + '</div></div>' +
        '<div class="oNho"><div class="k">Thiết bị</div><div class="v">' + (g.tbToiDa ? (g.tbDangDung || 0) + ' / ' + g.tbToiDa : '—') + '</div>' +
          (tb != null ? '<div class="thanh"><i style="width:' + tb + '%"' + (tb >= 100 ? ' class="day"' : '') + '></i></div>' : '') + '</div>' +
        '<div class="oNho"><div class="k">Phụ trách</div><div class="v" data-no-i18n>' + esc(phuTrachCua(g) || '—') + '</div></div>' +
      '</div>' +
      '<div class="dn"><code data-no-i18n>' + esc(g.user || '—') + '</code>' +
        (g.user ? '<button class="btn sm ic" data-chep="' + esc(g.user) + '" title="Chép tài khoản đăng nhập">⧉</button>' : '') +
        oMatKhau(g) + '</div>' +
      '</div>';
  }).join('') + '</div>';
}

/* ---- Chi phí ---- */

function veChiPhi() {
  if (!S.goi.length && !laQuanLy()) return chuaDuocCap();
  const dung = S.goi.filter((g) => !/ngừng|huỷ|hủy|dừng/i.test(g.trangThai));
  const thang = dung.reduce((a, g) => a + (g.chiPhiThang || 0), 0);
  const nay = Date.now();
  const sap = dung.filter((g) => g.hetHan && g.hetHan - nay <= 90 * 86400000).sort((a, b) => a.hetHan - b.hetHan);
  const theoTen = new Map();
  for (const g of dung) theoTen.set(g.ten, (theoTen.get(g.ten) || 0) + (g.chiPhiThang || 0));
  /* Gói chưa ghi giá thì không vẽ vạch 0đ — nó chỉ làm dài danh sách. Vẫn nằm ở bảng "Toàn bộ gói". */
  const top = [...theoTen.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = top.length ? top[0][1] : 1;
  return '<div class="hai-cot">' +
    '<section class="khung"><h4>Chi phí theo dịch vụ <span class="phu">(quy về tháng)</span></h4>' +
      top.map(([ten, v]) => '<div class="vach-ngang"><span class="t" data-no-i18n>' + esc(ten) + '</span>' +
        '<span class="b"><i style="width:' + Math.max(2, Math.round(v / max * 100)) + '%"></i></span><span class="s">' + tien(v) + '</span></div>').join('') +
      '<div class="tong-cp"><span>Tổng mỗi tháng</span><b>' + tien(thang) + '</b></div>' +
      '<div class="tong-cp phu"><span>Ước tính cả năm</span><b>' + tien(thang * 12) + '</b></div>' +
    '</section>' +
    '<section class="khung"><h4>Gia hạn trong 90 ngày tới</h4>' +
      (sap.length ? '<table class="bang"><thead><tr><th>Ngày</th><th>Dịch vụ</th><th>Số tiền</th><th></th></tr></thead><tbody>' +
        sap.map((g) => { const h = hanCua(g); return '<tr><td>' + veNgay(g.hetHan) + '</td><td data-no-i18n>' + esc(g.ten) +
          '<div class="phu">' + esc(g.user || '') + '</div></td><td>' + tien((g.chiPhi || 0) * (g.soLuong || 1)) + '</td><td><span class="nhan ' + h.lop + '">' + esc(h.chu) + '</span></td></tr>'; }).join('') +
        '</tbody></table>' : '<div class="trong">Không có gói nào tới hạn trong 90 ngày.</div>') +
    '</section></div>' +
    '<section class="khung"><h4>Toàn bộ gói</h4><table class="bang"><thead><tr><th>Dịch vụ</th><th>Loại</th><th>Chu kỳ</th><th>Giá / kỳ</th><th>SL</th><th>≈ / tháng</th><th>Hết hạn</th></tr></thead><tbody>' +
      S.goi.map((g) => '<tr' + (/ngừng/i.test(g.trangThai) ? ' class="ngung"' : '') + '><td data-no-i18n>' + esc(g.ten) + '</td><td>' + esc(g.loai) + '</td><td>' + esc(g.chuKy) + '</td><td>' + tien(g.chiPhi) +
        '</td><td>' + (g.soLuong || 1) + '</td><td>' + tien(g.chiPhiThang) + '</td><td>' + (veNgay(g.hetHan) || '—') + '</td></tr>').join('') +
    '</tbody></table></section>';
}

/* ---- Phân quyền (quản lý) ---- */

function vePhanQuyen() {
  const bang = S.pq.bang;
  const ds = bang === 'goi' ? S.goi : S.tk;
  const q = boDau(S.loc.tim).trim();
  const hien = ds.filter((x) => !q || boDau([x.nenTang, x.ten, x.user, phuTrachCua(x)].join(' ')).includes(q));
  return '<div class="filters">' +
      '<select id="pqBang"><option value="tk"' + (bang === 'tk' ? ' selected' : '') + '>Tài khoản</option><option value="goi"' + (bang === 'goi' ? ' selected' : '') + '>Gói đăng ký</option></select>' +
      '<input type="search" id="tim" placeholder="Lọc dòng…" value="' + esc(S.loc.tim) + '">' +
      '<span class="demKq">đã chọn ' + S.pq.chon.size + ' dòng · ' + S.pq.nguoi.size + ' người</span></div>' +
    '<div class="pq">' +
      '<section class="khung pq-nguoi"><h4>1 · Chọn người</h4>' +
        oChonNguoi([...S.pq.nguoi].map(([id, ten]) => ({ id, ten })), 'data-pq-chon') +
        '<p class="phu goi-y">Tìm trong danh bạ công ty. Người được cấp sẽ <b>thấy, xem mật khẩu và sửa</b> đúng những dòng được chọn — không thấy dòng nào khác.</p>' +
        '<h4>2 · Làm gì</h4><div class="nut-hang">' +
          '<button class="btn sm primary" data-pq="them">Cấp thêm quyền</button>' +
          '<button class="btn sm" data-pq="bot">Rút quyền</button></div>' +
      '</section>' +
      '<section class="khung pq-dong"><h4>Dòng <label class="chk" style="margin-left:8px"><input type="checkbox" id="pqTatCa"> chọn hết đang hiện</label></h4>' +
        '<table class="bang"><thead><tr><th></th><th>Tài khoản</th><th>Phụ trách</th><th>Đang được xem</th></tr></thead><tbody>' +
        hien.map((x) => '<tr><td><input type="checkbox" data-pq-dong="' + x.id + '"' + (S.pq.chon.has(x.id) ? ' checked' : '') + '></td>' +
          '<td data-no-i18n><b>' + esc(x.nenTang || x.ten) + '</b><div class="phu">' + esc(x.user || '') + '</div></td>' +
          '<td data-no-i18n>' + esc(phuTrachCua(x) || '—') + '</td>' +
          '<td data-no-i18n>' + (x.duocXem.length ? x.duocXem.map((n) => '<span class="nhan">' + esc(n.ten || n.id) + '</span>').join(' ') : '<span class="phu">chỉ quản lý</span>') + '</td></tr>').join('') +
        '</tbody></table></section></div>';
}

/* ---- Nhật ký (quản lý) ---- */

function veNhatKy() {
  if (!S.nk) {
    api('/api/nhat-ky').then((d) => { S.nk = d.ds; veLai(); }).catch((e) => toast(e.message, 'err'));
    return '<div class="dangTai">Đang đọc nhật ký…</div>';
  }
  if (!S.nk.length) return '<div class="trong">Chưa có lượt truy cập nào.</div>';
  return '<section class="khung"><h4>500 lượt gần nhất <button class="btn sm" id="nkLai" style="margin-left:8px">Đọc lại</button></h4>' +
    '<table class="bang"><thead><tr><th>Lúc</th><th>Người</th><th>Việc</th><th>Chi tiết</th></tr></thead><tbody>' +
    S.nk.map((r) => '<tr' + (r.hanhDong === 'Bị từ chối' ? ' class="tu-choi"' : '') + '><td>' + veGio(r.luc) + '</td><td data-no-i18n>' + esc(r.nguoi) + '</td>' +
      '<td><span class="nhan' + (r.hanhDong === 'Bị từ chối' ? ' het' : r.hanhDong === 'Cấp quyền' || r.hanhDong === 'Đổi mật khẩu' ? ' canh' : '') + '">' + esc(r.hanhDong) + '</span></td>' +
      '<td data-no-i18n>' + esc(r.viec) + '</td></tr>').join('') +
    '</tbody></table></section>';
}

/* ---------------------------------------------------------------------------
 * NGĂN CHI TIẾT
 * ------------------------------------------------------------------------- */

function moSo(bang, id) { S.mo = { bang, id }; veLai(); $('#so').classList.add('mo'); }
function dongSo() { S.mo = null; $('#so').classList.remove('mo'); veLai(); }

function veSo() {
  const x = timBanGhi(S.mo.bang, S.mo.id);
  if (!x) return dongSo();
  const link = linkAnToan(x.link);
  $('#soTieuDe').textContent = x.nenTang || x.ten;
  $('#soPhu').textContent = x.bang === 'goi' ? 'Gói đăng ký' : x.nhom;
  const o = (k, v) => v ? '<div class="oNho"><div class="k">' + k + '</div><div class="v" data-no-i18n>' + v + '</div></div>' : '';
  $('#soThan').innerHTML =
    '<div class="muc"><h4>Đăng nhập</h4><div class="noi">' +
      '<div class="dn"><span class="k">User</span><code data-no-i18n>' + esc(x.user || '—') + '</code>' +
        (x.user ? '<button class="btn sm ic" data-chep="' + esc(x.user) + '">⧉</button>' : '') + '</div>' +
      '<div class="dn"><span class="k">Mật khẩu</span>' + oMatKhau(x) + '</div>' +
      (x.bang === 'tk' && x.coMatKhauCu ? '<div class="dn"><span class="k">Mật khẩu cũ</span>' + oMatKhau(x, 'matKhauCu') + '</div>' : '') +
      (link ? '<div class="dn"><span class="k">Link</span><a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" data-no-i18n>' + esc(link) + '</a></div>' : '') +
    '</div></div>' +
    (S.suaDuoc ? '<div class="muc"><h4>Sửa thông tin</h4><div class="noi">' + formSua(x.bang, x) +
      '<div class="nut-hang" style="margin-top:10px"><button class="btn sm primary" id="suaLuu">Lưu thay đổi</button>' +
      '<span class="phu">Chỉ ghi những ô đã đổi · mỗi lần lưu là một dòng nhật ký</span></div></div></div>' : '') +
    (S.suaDuoc ? '' : '<div class="muc"><h4>Thông tin</h4><div class="doi">' +
      o('Phụ trách', esc(phuTrachCua(x))) +
      o('Trạng thái', esc(x.trangThai)) +
      (x.bang === 'tk' ? o('Đổi mật khẩu lúc', veNgay(x.doiLuc) || 'chưa rõ') + o('Số điện thoại', esc(x.sdt)) : '') +
      (x.bang === 'goi' ? o('Chi phí', tien(x.chiPhi) + ' / ' + esc((x.chuKy || '').toLowerCase())) + o('Bắt đầu', veNgay(x.batDau)) +
        o('Hết hạn', veNgay(x.hetHan)) + o('Thiết bị', x.tbToiDa ? (x.tbDangDung || 0) + ' / ' + x.tbToiDa : '') + o('Mức độ cần thiết', esc(x.mucDo)) : '') +
    '</div></div>') +
    (x.ghiChu && !S.suaDuoc ? '<div class="muc"><h4>Ghi chú</h4><div class="noi" data-no-i18n style="white-space:pre-wrap">' + esc(x.ghiChu) + '</div></div>' : '') +
    (laQuanLy() ? '<div class="muc"><h4>Ai được xem mật khẩu</h4><div class="noi">' +
      (x.duocXem.length ? x.duocXem.map((n) => '<span class="nhan">' + esc(n.ten || n.id) + '</span>').join(' ') : '<span class="phu">Chỉ quản lý. Cấp thêm ở tab Phân quyền.</span>') +
      '</div></div>' : '') +
    (x.xem && S.coKhoa ? '<div class="muc"><h4>Đổi mật khẩu</h4><div class="noi">' +
      '<p class="phu">Đổi trên trang ' + esc(x.nenTang || x.ten) + ' xong rồi mới lưu ở đây.' + (x.bang === 'tk' ? ' Mật khẩu đang lưu sẽ chuyển thành "mật khẩu cũ".' : '') + '</p>' +
      '<div class="nut-hang"><input type="password" id="mkMoi" autocomplete="new-password" placeholder="Mật khẩu mới" style="flex:1;min-width:0">' +
      '<button class="btn sm" id="mkSinh" title="Sinh mật khẩu mạnh 20 ký tự">Sinh</button>' +
      '<button class="btn sm primary" id="mkLuu">Lưu</button></div>' +
      (x.coMatKhau ? '<div class="nut-hang" style="margin-top:8px"><button class="btn sm nguy" id="mkXoa">Xoá mật khẩu</button>' +
        '<span class="phu">' + (x.bang === 'tk' ? 'Ô mật khẩu thành trống, bản vừa xoá cất sang "mật khẩu cũ".' : 'Gói không lưu bản cũ — xoá là mất.') + '</span></div>' : '') +
      '</div></div>' : '') +
    (laQuanLy() ? '<div class="muc"><h4>Xoá ' + (x.bang === 'goi' ? 'gói' : 'tài khoản') + '</h4><div class="noi nguy-khung">' +
      '<p class="phu">Xoá hẳn dòng này khỏi Lark Base, kể cả mật khẩu. Không hoàn tác được. Chỉ muốn tạm cất thì đổi Trạng thái sang "Ngừng dùng".</p>' +
      '<button class="btn sm nguy" id="dongXoa">Xoá ' + (x.bang === 'goi' ? 'gói' : 'tài khoản') + ' này</button></div></div>' : '');
}

/* ---------------------------------------------------------------------------
 * FORM SỬA — dựng từ S.suaDuoc (server là nơi quyết cột nào sửa được)
 * ------------------------------------------------------------------------- */

const veNgayO = (t) => {
  if (!t) return '';
  const d = new Date(t + 7 * 3600000);
  const hai = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + hai(d.getUTCMonth() + 1) + '-' + hai(d.getUTCDate());
};

/** Giá trị hiện tại của một cột, đúng dạng ô nhập cần. */
function giaTriO(c, x) {
  const v = x ? x[c.k] : null;
  if (c.kieu === 'nguoi') return (v || []).map((n) => n.id).filter(Boolean);
  if (c.kieu === 'ngay') return veNgayO(v);
  return v == null ? '' : String(v);
}

function formSua(bang, x) {
  return '<div class="form-them">' + (S.suaDuoc[bang] || []).map((c) => {
    const v = giaTriO(c, x);
    let o;
    if (c.kieu === 'nguoi') {
      o = oChonNguoi((x && x[c.k]) || [], 'data-sua="' + c.k + '"');
    } else if (c.kieu === 'chon') {
      o = '<select data-sua="' + c.k + '">' + (v ? '' : '<option value=""></option>') +
        c.chon.map((n) => '<option' + (n === v ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>';
    } else if (c.nhieuDong) {
      o = '<textarea data-sua="' + c.k + '" rows="3">' + esc(v) + '</textarea>';
    } else {
      o = '<input data-sua="' + c.k + '" autocomplete="off" type="' + (c.kieu === 'ngay' ? 'date' : c.kieu === 'so' ? 'number' : 'text') + '"' +
        (c.kieu === 'so' ? ' min="0" step="any"' : '') + (c.goiY ? ' list="goiY-' + c.k + '"' : '') + ' value="' + esc(v) + '">' +
        (c.goiY ? '<datalist id="goiY-' + c.k + '">' + c.goiY.map((g) => '<option value="' + esc(g) + '">').join('') + '</datalist>' : '');
    }
    /* Ô người là <div>, không <label>: label bọc nhiều checkbox thì bấm vào chữ tiêu đề là bật/tắt ô ĐẦU TIÊN. */
    const the = c.kieu === 'nguoi' ? 'div' : 'label';
    return '<' + the + ' class="o-nhap"><span>' + esc(c.nhan) + '</span>' + o + '</' + the + '>';
  }).join('') + '</div>';
}

/** Đọc form → chỉ những cột ĐÃ ĐỔI so với bản ghi (x = null: mọi ô có giá trị). */
function docFormSua(goc, bang, x) {
  const ra = {};
  for (const c of S.suaDuoc[bang] || []) {
    const el = goc.querySelector('[data-sua="' + c.k + '"]');
    if (!el) continue;
    const moi = c.kieu === 'nguoi'
      ? daChonTrong(el).map((n) => n.id)
      : el.value.trim();
    const cu = giaTriO(c, x);
    const giong = c.kieu === 'nguoi' ? moi.slice().sort().join() === cu.slice().sort().join() : moi === cu;
    if (x ? !giong : (c.kieu === 'nguoi' ? moi.length : moi !== '')) ra[c.k] = moi;
  }
  return ra;
}

function moFormThemGoi() {
  S.mo = null;
  $('#so').classList.add('mo');
  $('#soTieuDe').textContent = 'Thêm gói đăng ký';
  $('#soPhu').textContent = '';
  $('#soThan').innerHTML = '<div class="muc"><div class="noi">' + formSua('goi', null) +
    '<label class="o-nhap" style="margin-top:10px"><span>Mật khẩu</span><span class="nut-hang"><input id="gMatKhau" type="password" autocomplete="new-password" style="flex:1;min-width:0"><button class="btn sm" id="gSinh">Sinh</button></span></label>' +
    '<div class="nut-hang" style="margin-top:10px"><button class="btn primary" id="gLuu">Lưu gói</button></div></div></div>';
}

/* Sinh mật khẩu bằng crypto của trình duyệt, không Math.random. */
function sinhMatKhau(n = 20) {
  const bo = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (v) => bo[v % bo.length]).join('');
}

/* ---------------------------------------------------------------------------
 * THÊM TÀI KHOẢN (quản lý)
 * ------------------------------------------------------------------------- */

function moFormThem() {
  S.mo = null;
  $('#so').classList.add('mo');
  $('#soTieuDe').textContent = 'Thêm tài khoản';
  $('#soPhu').textContent = '';
  const o = (id, nhan, kieu) => '<label class="o-nhap"><span>' + nhan + '</span><input id="' + id + '"' + (kieu ? ' type="' + kieu + '"' : '') + ' autocomplete="off"></label>';
  $('#soThan').innerHTML = '<div class="form-them">' +
    o('tNenTang', 'Nền tảng *') + o('tTen', 'Tên tài khoản') +
    '<label class="o-nhap"><span>Nhóm</span><select id="tNhom">' + S.nhom.map((n) => '<option>' + esc(n) + '</option>').join('') + '</select></label>' +
    o('tLink', 'Link đăng nhập') + o('tUser', 'User') +
    '<label class="o-nhap"><span>Mật khẩu</span><span class="nut-hang"><input id="tMatKhau" type="password" autocomplete="new-password" style="flex:1;min-width:0"><button class="btn sm" id="tSinh">Sinh</button></span></label>' +
    o('tSdt', 'Số điện thoại') + o('tPhuTrach', 'Người phụ trách (ghi tên)') +
    '<label class="o-nhap"><span>Ghi chú</span><textarea id="tGhiChu" rows="3"></textarea></label>' +
    '<p class="phu">Muốn giao người phụ trách bằng tài khoản Lark hoặc cấp quyền xem: lưu xong rồi làm ở Base / tab Phân quyền.</p>' +
    '<div class="nut-hang"><button class="btn primary" id="tLuu">Lưu tài khoản</button></div></div>';
}

/* ---------------------------------------------------------------------------
 * SỰ KIỆN
 * ------------------------------------------------------------------------- */

document.addEventListener('click', async (e) => {
  /* Lớp vỏ có script bắn sự kiện giả (loc.js). Mọi thao tác ở đây đều đụng
     tới mật khẩu hoặc Base, nên chỉ nghe cú bấm thật. */
  if (!e.isTrusted) return;
  const t = e.target.closest('button, a, [data-mo], input');
  if (!t) return;

  if (t.classList.contains('ng-goi-y')) {
    const khung = t.closest('.chon-nguoi');
    const n = { id: t.dataset.id, ten: t.dataset.ten };
    if ('pqChon' in khung.dataset) { S.pq.nguoi.set(n.id, n.ten); return veLai(); }
    khung.querySelector('.the-ng-ds').insertAdjacentHTML('beforeend', theNguoi(n));
    const inp = khung.querySelector('.tim-ng'); inp.value = ''; khung.querySelector('.goi-y-ng').hidden = true; inp.focus();
    return;
  }
  if (t.classList.contains('bo-ng')) {
    const the = t.closest('.the-ng'), khung = t.closest('.chon-nguoi');
    if ('pqChon' in khung.dataset) { S.pq.nguoi.delete(the.dataset.id); return veLai(); }
    the.remove();
    return;
  }
  if (t.dataset.tab) { S.tab = t.dataset.tab; S.loc.tim = ''; return veLai(); }
  if (t.dataset.di) { S.tab = t.dataset.di; return veLai(); }
  if (t.dataset.mk) {
    e.stopPropagation();
    return t.dataset.mk === 'hien' ? hienMatKhau(t.dataset.bang, t.dataset.id, t.dataset.truong)
      : chepMatKhau(t.dataset.bang, t.dataset.id, t.dataset.truong);
  }
  if (t.dataset.chep != null && t.tagName === 'BUTTON') { e.stopPropagation(); return chepChu(t.dataset.chep); }
  if (t.tagName === 'A') return;

  if (t.id === 'btnLamMoi') {
    t.disabled = true;
    try { await guiJson('/api/lam-moi', {}); await napDanhSach(true); S.nk = null; veLai(); toast('Đã đọc lại từ Base', 'ok'); }
    catch (er) { toast(er.message, 'err'); } finally { t.disabled = false; }
    return;
  }
  if (t.id === 'btnBase') return window.open(S.baseUrl, '_blank', 'noopener');
  if (t.id === 'soDong') return dongSo();
  if (t.id === 'btnThem') return moFormThem();
  if (t.id === 'btnThemGoi') return moFormThemGoi();
  if (t.id === 'gSinh') { const i = $('#gMatKhau'); i.value = sinhMatKhau(); i.type = 'text'; return; }

  if (t.id === 'suaLuu') {
    const x = timBanGhi(S.mo.bang, S.mo.id);
    const truong = docFormSua($('#soThan'), S.mo.bang, x);
    if (!Object.keys(truong).length) return toast('Chưa đổi ô nào');
    t.disabled = true;
    try {
      const tenNguoi = {};
      document.querySelectorAll('#soThan .the-ng').forEach((e) => { tenNguoi[e.dataset.id] = e.dataset.ten; });
      const d = await guiJson('/api/sua', { bang: S.mo.bang, id: S.mo.id, truong, tenNguoi });
      await napDanhSach(true); veLai(); toast('Đã lưu ' + d.doi.length + ' ô', 'ok');
    } catch (er) { toast(er.message, 'err'); t.disabled = false; }
    return;
  }

  if (t.id === 'gLuu') {
    const truong = docFormSua($('#soThan'), 'goi', null);
    if (!truong.ten) return toast('Cần tên dịch vụ', 'err');
    t.disabled = true;
    try {
      await guiJson('/api/them-goi', { truong, matKhau: ($('#gMatKhau') || {}).value || '' });
      await napDanhSach(true); dongSo(); toast('Đã thêm gói', 'ok');
    } catch (er) { toast(er.message, 'err'); t.disabled = false; }
    return;
  }
  if (t.id === 'nkLai') { S.nk = null; return veLai(); }
  if (t.id === 'mkSinh') { const i = $('#mkMoi'); i.value = sinhMatKhau(); i.type = 'text'; return; }
  if (t.id === 'tSinh') { const i = $('#tMatKhau'); i.value = sinhMatKhau(); i.type = 'text'; return; }

  if (t.id === 'mkXoa') {
    const ten = $('#soTieuDe').textContent;
    const bang = S.mo.bang;
    if (!(await xacNhan('Xoá mật khẩu của <b>' + esc(ten) + '</b>?<br><span class="phu">' +
      (bang === 'tk' ? 'Bản vừa xoá vẫn cất ở "mật khẩu cũ".' : 'Gói không lưu bản cũ — xoá là mất hẳn.') + '</span>', 'Xoá mật khẩu'))) return;
    t.disabled = true;
    try { await guiJson('/api/xoa-mat-khau', { bang, id: S.mo.id }); S.hien.clear(); await napDanhSach(true); veLai(); toast('Đã xoá mật khẩu', 'ok'); }
    catch (er) { toast(er.message, 'err'); t.disabled = false; }
    return;
  }

  if (t.id === 'dongXoa') {
    const ten = $('#soTieuDe').textContent;
    const bang = S.mo.bang;
    if (!(await xacNhan('Xoá hẳn <b>' + esc(ten) + '</b> khỏi Lark Base?<br><span class="phu">Kể cả mật khẩu. Không hoàn tác được — nhật ký vẫn ghi lại tên dòng đã xoá.</span>',
      'Xoá hẳn'))) return;
    t.disabled = true;
    try { await guiJson('/api/xoa-dong', { bang, id: S.mo.id }); S.hien.clear(); await napDanhSach(true); dongSo(); toast('Đã xoá ' + ten, 'ok'); }
    catch (er) { toast(er.message, 'err'); t.disabled = false; }
    return;
  }

  if (t.id === 'mkLuu') {
    const v = $('#mkMoi').value;
    if (!v) return toast('Chưa nhập mật khẩu mới', 'err');
    if (!(await xacNhan('Lưu mật khẩu mới cho <b>' + esc($('#soTieuDe').textContent) + '</b>?', 'Lưu mật khẩu'))) return;
    t.disabled = true;
    try {
      await guiJson('/api/doi-mat-khau', { bang: S.mo.bang, id: S.mo.id, matKhau: v });
      S.hien.clear();
      await napDanhSach(true); veLai(); toast('Đã lưu mật khẩu mới (mã hoá)', 'ok');
    } catch (er) { toast(er.message, 'err'); } finally { t.disabled = false; }
    return;
  }

  if (t.id === 'tLuu') {
    const g = (id) => ($('#' + id) || {}).value || '';
    const than = { nenTang: g('tNenTang'), ten: g('tTen'), nhom: g('tNhom'), link: g('tLink'), user: g('tUser'),
      matKhau: g('tMatKhau'), sdt: g('tSdt'), phuTrachChu: g('tPhuTrach'), ghiChu: g('tGhiChu') };
    if (!than.nenTang.trim()) return toast('Cần điền Nền tảng', 'err');
    t.disabled = true;
    try { await guiJson('/api/them', than); await napDanhSach(true); dongSo(); toast('Đã thêm tài khoản', 'ok'); }
    catch (er) { toast(er.message, 'err'); t.disabled = false; }
    return;
  }

  if (t.dataset.pq) {
    if (!S.pq.chon.size || !S.pq.nguoi.size) return toast('Chọn ít nhất một dòng và một người', 'err');
    const ten = [...S.pq.nguoi.values()].join(', ');
    const lam = t.dataset.pq === 'them' ? 'CẤP quyền xem mật khẩu cho ' : 'RÚT quyền xem mật khẩu của ';
    if (!(await xacNhan(esc(lam) + '<b>' + esc(ten) + '</b> trên <b>' + S.pq.chon.size + ' dòng</b>?', t.dataset.pq === 'them' ? 'Cấp quyền' : 'Rút quyền'))) return;
    t.disabled = true;
    try {
      const d = await guiJson('/api/cap-quyen', { bang: S.pq.bang, ids: [...S.pq.chon], nguoi: [...S.pq.nguoi.keys()],
        tenNguoi: Object.fromEntries(S.pq.nguoi), kieu: t.dataset.pq });
      S.pq.chon.clear(); await napDanhSach(true); veLai(); toast('Đã cập nhật ' + d.so + ' dòng', 'ok');
    } catch (er) { toast(er.message, 'err'); t.disabled = false; }
    return;
  }

  if (t.dataset.mo && !e.target.closest('button, input, a')) return moSo(t.dataset.mo, t.dataset.id);
});

document.addEventListener('change', (e) => {
  if (!e.isTrusted) return;
  const t = e.target;
  if (t.id === 'locNhom') { S.loc.nhom = t.value; return veLai(); }
  if (t.id === 'pqBang') { S.pq.bang = t.value; S.pq.chon.clear(); return veLai(); }
  if (t.dataset.pqDong) { t.checked ? S.pq.chon.add(t.dataset.pqDong) : S.pq.chon.delete(t.dataset.pqDong); return veLai(); }
  if (t.id === 'pqTatCa') {
    document.querySelectorAll('[data-pq-dong]').forEach((c) => { t.checked ? S.pq.chon.add(c.dataset.pqDong) : S.pq.chon.delete(c.dataset.pqDong); });
    return veLai();
  }
});

let hoanTim = 0;
document.addEventListener('input', (e) => {
  if (e.isTrusted && e.target.classList.contains('tim-ng')) {
    clearTimeout(hoanNg);
    const inp = e.target;
    hoanNg = setTimeout(() => timNguoi(inp), 250);
    return;
  }
  if (!e.isTrusted || e.target.id !== 'tim') return;
  clearTimeout(hoanTim);
  const v = e.target.value;
  hoanTim = setTimeout(() => {
    S.loc.tim = v; veLai();
    const i = $('#tim'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); }
  }, 180);
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#so').classList.contains('mo')) dongSo(); });

/* Rời tab / ẩn trang → che hết mật khẩu đang hiện. */
document.addEventListener('visibilitychange', () => { if (document.hidden && S.hien.size) { S.hien.clear(); veLai(); } });

khoiTao();
