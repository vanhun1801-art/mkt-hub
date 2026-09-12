'use strict';
/**
 * Giao diện app Báo cáo công việc.
 *
 * Ba quyết định định hình cả file này:
 *
 * 1. Đầu việc CHỌN từ app Tracking, không gõ tay. Anh Hùng: "công việc các bạn
 *    thực hiện đang cố gắng đưa về ứng dụng tracking… còn tùy chọn nhập tên
 *    công việc thì chỉ nên là loại công việc khác". Nên ô Công việc là một
 *    <select> nạp từ /api/viec-cua-toi; chọn "Khác" mới hiện ô gõ.
 * 2. Tiến độ đo bằng %, mặc định. Thanh trượt + số, không phải ô chữ.
 * 3. Hai vai tách hẳn: nhân sự có Ngày/Tuần/Tháng/Đã nộp; quản lý có thêm
 *    Toàn phòng/Cần hỗ trợ/Theo dõi.
 */

const $ = (s, g) => (g || document).querySelector(s);
const $$ = (s, g) => [...(g || document).querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let META = null;
let MAN = 'ngay';
let MOC = Date.now();
let DU = null;      // phiếu đang mở
let VIEC = null;    // { chay, ds } — đầu việc từ Tracking
let BAN = false;    // có thay đổi chưa lưu

const MAN_TOI = [
  { ma: 'ngay', ten: 'Hôm nay' },
  { ma: 'tuan', ten: 'Tuần' },
  { ma: 'thang', ten: 'Tháng' },
  { ma: 'da-nop', ten: 'Đã nộp' },
];
const MAN_QL = [
  { ma: 'toan-phong', ten: 'Toàn phòng' },
  { ma: 'can-ho-tro', ten: 'Cần hỗ trợ' },
  { ma: 'theo-doi', ten: 'Theo dõi' },
];

/* ---------------- gọi API ---------------- */
async function goi(duong, opts = {}) {
  const r = await fetch(duong, Object.assign({
    headers: { 'content-type': 'application/json' },
  }, opts));
  const raw = await r.text();
  let d = null;
  try { d = raw ? JSON.parse(raw) : {}; } catch (_) { d = null; }
  if (!r.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
  if (d === null) throw new Error('Máy chủ trả về thứ không đọc được');
  return d;
}

let hetToast;
function toast(chu, kieu) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.className = kieu || '';
  t.textContent = chu;
  clearTimeout(hetToast);
  hetToast = setTimeout(() => t.remove(), 3800);
}

/* ---------------- ngày giờ (khớp ky.js phía máy chủ) ---------------- */
const NGAY_MS = 86400000;
const VN = 7 * 3600000;
const TEN_THU = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

function phanRa(ms) {
  const d = new Date(Number(ms) + VN);
  return {
    nam: d.getUTCFullYear(), thang: d.getUTCMonth() + 1, ngay: d.getUTCDate(),
    gio: d.getUTCHours(), phut: d.getUTCMinutes(),
    thu: d.getUTCDay() === 0 ? 7 : d.getUTCDay(),
  };
}
const p2 = (n) => String(n).padStart(2, '0');
const veNgay = (ms) => { const p = phanRa(ms); return p2(p.ngay) + '/' + p2(p.thang) + '/' + p.nam; };
const veNgayThu = (ms) => TEN_THU[phanRa(ms).thu] + ' ' + veNgay(ms);
const veLuc = (ms) => { const p = phanRa(ms); return veNgay(ms) + ' ' + p2(p.gio) + ':' + p2(p.phut); };
const veISO = (ms) => { const p = phanRa(ms); return p.nam + '-' + p2(p.thang) + '-' + p2(p.ngay); };
const tuISO = (s) => {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return y ? Date.UTC(y, m - 1, d) - VN : Date.now();
};
function vePhut(p) {
  const n = Math.max(0, Math.round(Number(p) || 0));
  if (n < 60) return n + ' phút';
  const g = Math.floor(n / 60), du = n % 60;
  return du ? g + ' giờ ' + du : g + ' giờ';
}
function kyThangNay() {
  const p = phanRa(Date.now());
  const tu = Date.UTC(p.nam, p.thang - 1, 1) - VN;
  const sau = p.thang === 12 ? Date.UTC(p.nam + 1, 0, 1) : Date.UTC(p.nam, p.thang, 1);
  return { tu, den: sau - VN - 1 };
}
function mocTuan(ms) {
  const d = Math.floor((ms + VN) / NGAY_MS) * NGAY_MS - VN;
  const lui = (phanRa(d).thu - 6 + 7) % 7;   // tuần bắt đầu Thứ 7 (ISO 6)
  const tu = d - lui * NGAY_MS;
  return { tu, den: tu + 7 * NGAY_MS - 1 };
}

/* ---------------- khởi động ---------------- */
async function nap() {
  META = await goi('/api/meta');
  $('#phuDe').textContent = META.toi.ten;
  const chip = $('#chipToi');
  chip.classList.toggle('ql', META.toi.quanLy);
  $('span:last-child', chip).textContent = META.toi.quanLy ? 'Quản lý' : 'Nhân sự';

  veTab('#tabToi', MAN_TOI);
  if (META.toi.quanLy) {
    $('#tabQL').hidden = false;
    veTab('#tabQL', MAN_QL);
  }

  $('#btnXuat').onclick = xuat;
  if (META.larkUrl && META.toi.quanLy) {
    const b = $('#btnLark');
    b.hidden = false;
    b.onclick = () => window.open(META.larkUrl, '_blank', 'noopener');
  }
  await ve();
}

function veTab(o, ds) {
  const el = $(o);
  el.innerHTML = ds.map((m) =>
    '<button class="pill' + (m.ma === MAN ? ' on' : '') + '" data-man="' + m.ma + '">' +
    esc(m.ten) + '</button>').join('');
  $$('.pill', el).forEach((b) => {
    b.onclick = () => {
      if (BAN && !confirm('Còn thay đổi chưa lưu. Rời đi?')) return;
      BAN = false;
      MAN = b.dataset.man;
      MOC = Date.now();
      $$('.pill').forEach((x) => x.classList.toggle('on', x.dataset.man === MAN));
      ve();
    };
  });
}

window.addEventListener('beforeunload', (e) => {
  if (!BAN) return;
  e.preventDefault();
  e.returnValue = '';
});

async function ve() {
  const el = $('#man');
  el.innerHTML = '<div class="the"><div class="rong">Đang tải…</div></div>';
  try {
    if (MAN === 'toan-phong') return await veToanPhong(el);
    if (MAN === 'can-ho-tro') return await veCanHoTro(el);
    if (MAN === 'theo-doi') return await veTheoDoi(el);
    if (MAN === 'da-nop') return await veDaNop(el);
    return await veManPhieu(el, MAN);
  } catch (e) {
    el.innerHTML = '<div class="the"><div class="rong"><b>Không tải được</b>' +
      esc(e.message) + '</div></div>';
  }
}

/* ==================================================================
   MÀN NHẬP PHIẾU (nhân sự)
   ================================================================== */

async function veManPhieu(el, loaiKy) {
  DU = await goi('/api/phieu?ky=' + loaiKy + '&moc=' + MOC + '&moi=1');
  if (loaiKy === 'ngay') {
    VIEC = await goi('/api/viec-cua-toi?moc=' + DU.ky.tu).catch(() => ({ chay: false, ds: [] }));
  }

  el.innerHTML =
    theKy(loaiKy) +
    (loaiKy === 'ngay' ? theBang(DU) : theTongHop(DU)) +
    theVietTay(DU, loaiKy) +
    '<div id="oNhanDinh"></div>' +
    theLuu(DU);

  gan(loaiKy);
  if (loaiKy === 'ngay') tinhLai();
  napNhanDinh(loaiKy);
}

function theKy(loaiKy) {
  const p = DU.phieu;
  const nhan = loaiKy === 'ngay' ? veNgayThu(DU.ky.tu)
    : loaiKy === 'tuan' ? veNgay(DU.ky.tu) + ' – ' + veNgay(DU.ky.den)
      : 'Tháng ' + p2(phanRa(DU.ky.tu).thang) + '/' + phanRa(DU.ky.tu).nam;
  const tt = !p ? '<span class="nhan-tt xam">Chưa có</span>'
    : p.daNop
      ? '<span class="nhan-tt ' + (p.trangThaiHan === 'tre' ? 'cam' : 'xanh') + '">' +
        (p.trangThaiHan === 'tre' ? esc(p.veHan) : 'Đã nộp') + '</span>'
      : '<span class="nhan-tt cam">Nháp</span>';
  const buoc = loaiKy === 'ngay' ? NGAY_MS : loaiKy === 'tuan' ? 7 * NGAY_MS : 0;

  return '<div class="the"><div class="the-dau" data-buoc="' + buoc + '">' +
    '<h2>' + esc(nhan) + '</h2>' + tt +
    '<div class="lon"></div>' +
    '<button class="btn nho mo" id="btnLui">‹</button>' +
    (loaiKy === 'ngay'
      ? '<input class="in" type="date" id="chonNgay" value="' + veISO(DU.ky.tu) + '">' : '') +
    '<button class="btn nho mo" id="btnToi"' + (DU.ky.den >= Date.now() ? ' disabled' : '') + '>›</button>' +
    '<button class="btn nho" id="btnNay">Hiện tại</button>' +
    '</div>' +
    '<div class="the-than phu" style="padding:10px 16px">' +
      'Hạn nộp <b>' + esc(veLuc(DU.han)) + '</b> · ' + esc(cauHan(DU)) +
    '</div></div>';
}

function cauHan(d) {
  const p = d.phieu;
  if (p && p.daNop) return 'đã nộp ' + veLuc(p.nopLuc) + ', ' + p.veHan.toLowerCase();
  return Date.now() > d.han
    ? 'đã quá hạn — nộp bây giờ vẫn ghi nhận nhưng đánh dấu là trễ'
    : 'còn hạn';
}

/* ---- bảng đầu việc (phiếu NGÀY) ---- */
function theBang(d) {
  const dong = d.dong.length ? d.dong : [dongTrong()];
  const ca = (d.phieu && d.phieu.ca) || 'Cả ngày';
  /* Ba trạng thái khác nhau, và gộp chúng lại là cách chắc chắn để người dùng
   * hiểu sai: hỏng đường truyền · nối được nhưng không ai giao việc · có việc.
   * Bản đầu chỉ có hai, nên "bạn không có việc nào" hiện ra y như bình thường —
   * menu trống trơn mà không một dòng giải thích. */
  const canhBao = !VIEC ? ''
    : !VIEC.chay
      ? '<div class="the-than" style="padding:10px 16px;border-bottom:1px solid var(--border)">' +
        '<span class="nhan-tt do">Không nối được Bảng công việc</span> ' +
        '<span class="nho">' + esc(VIEC.ly || '') +
        (VIEC.cong ? ' (cổng ' + esc(VIEC.cong) + ')' : '') +
        ' — vẫn gõ tay được bằng nhóm "Khác".</span>' +
        '</div>'
      : !VIEC.ds.length
        ? '<div class="the-than" style="padding:10px 16px;border-bottom:1px solid var(--border)">' +
          '<span class="nhan-tt cam">Không có đầu việc nào</span> ' +
          '<span class="nho">Bảng công việc hiện không giao việc nào cho ' +
          esc(VIEC.cuaAi || 'anh/chị') + '. Gõ tay bằng nhóm "Khác", ' +
          'hoặc nhờ quản lý giao việc trong Bảng công việc trước.</span>' +
          '</div>'
        : '';

  return '<div class="the">' +
    '<div class="the-dau"><h2>Đầu việc trong ngày</h2>' +
      '<span class="nho">chọn từ Bảng công việc · gõ tay chỉ dành cho nhóm Khác</span>' +
      '<div class="lon"></div>' +
      '<span class="nho">Ca</span>' +
      '<select class="in" id="chonCa">' +
        META.ca.map((c) => '<option value="' + c.ma + '"' + (c.ten === ca ? ' selected' : '') +
          '>' + esc(c.ten) + (c.phut ? ' · ' + c.phut + ' phút' : '') + '</option>').join('') +
      '</select>' +
      '<input class="in" id="dmTay" type="number" min="0" step="15" placeholder="phút" ' +
        'style="width:96px" hidden>' +
    '</div>' + canhBao +
    '<div class="the-than khit cuon">' +
      '<table class="bang"><thead><tr>' +
        '<th style="min-width:230px">Công việc</th>' +
        '<th style="width:132px">Nhóm</th>' +
        '<th style="width:88px">Phút</th>' +
        '<th style="width:190px">Tiến độ</th>' +
        '<th style="min-width:180px">Ghi chú tiến độ</th>' +
        '<th style="width:126px">Trạng thái</th>' +
        '<th class="o-nut"></th>' +
      '</tr></thead><tbody id="thanBang">' + dong.map(veHang).join('') + '</tbody></table>' +
    '</div>' +
    '<div class="the-than" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;' +
      'border-top:1px solid var(--border)">' +
      '<button class="btn nho" id="btnThem">+ Thêm dòng</button>' +
      '<div class="lon"></div>' +
      '<div class="dai-so" id="oTong"></div>' +
    '</div></div>';
}

const dongTrong = () => ({
  congViec: '', maViec: '', nhom: 'Khác', phut: '',
  tienDoPt: 0, tienDo: '', trangThai: 'Đang làm', ghiChu: '',
});

/**
 * Menu đầu việc. Mỗi việc bên Tracking là một <option> mang theo mã; mục cuối
 * là "Khác — tự nhập", và chỉ khi chọn nó ô gõ tay mới hiện ra.
 *
 * Việc đang khai mà KHÔNG còn trong danh sách (đã đóng lâu, hoặc bị chuyển cho
 * người khác) vẫn phải giữ được: thêm một option riêng cho nó, kẻo mở lại phiếu
 * cũ là mất tên việc.
 */
function menuViec(d) {
  const ds = (VIEC && VIEC.ds) || [];
  const coTrongDs = d.maViec && ds.some((v) => v.id === d.maViec);
  const tuNhap = !d.maViec && !!d.congViec;
  let o = '<option value=""' + (!d.maViec && !d.congViec ? ' selected' : '') + '>— chọn đầu việc —</option>';
  if (d.maViec && !coTrongDs) {
    o += '<option value="' + esc(d.maViec) + '" selected>' + esc(d.congViec) + ' (không còn trong danh sách)</option>';
  }
  o += ds.map((v) => '<option value="' + esc(v.id) + '" data-nhom="' + esc(v.nhom) + '"' +
    (v.id === d.maViec ? ' selected' : '') + '>' +
    (v.dong ? '✓ ' : '') + esc(v.ten) + (v.loai ? ' · ' + esc(v.loai) : '') + '</option>').join('');
  o += '<option value="__khac"' + (tuNhap ? ' selected' : '') + '>Khác — tự nhập</option>';
  return o;
}

function veHang(d) {
  const tuNhap = !d.maViec && !!d.congViec;
  const pt = Number(d.tienDoPt) || 0;
  return '<tr>' +
    '<td data-nhan="Công việc">' +
      '<select class="v-viec">' + menuViec(d) + '</select>' +
      '<input class="v-cv" value="' + esc(tuNhap ? d.congViec : '') +
        '" placeholder="Tên công việc khác"' + (tuNhap ? '' : ' hidden') + '>' +
    '</td>' +
    '<td data-nhan="Nhóm"><select class="v-nhom">' +
      META.nhomViec.map((n) => '<option' + (n === d.nhom ? ' selected' : '') + '>' + esc(n) + '</option>').join('') +
    '</select></td>' +
    '<td data-nhan="Phút" class="so-o"><input class="v-phut" type="number" min="0" step="5" value="' +
      esc(d.phut === 0 || d.phut === '' ? '' : d.phut) + '" placeholder="0"></td>' +
    '<td data-nhan="Tiến độ"><div class="td-o">' +
      '<input class="v-pt" type="range" min="0" max="100" step="5" value="' + pt + '">' +
      '<span class="pt' + (pt >= 100 ? ' du' : '') + '">' + pt + '%</span>' +
    '</div></td>' +
    '<td data-nhan="Ghi chú tiến độ"><textarea class="v-td" rows="1" placeholder="vướng ở đâu, làm được gì">' +
      esc(d.tienDo) + '</textarea></td>' +
    '<td data-nhan="Trạng thái"><select class="v-tt">' +
      META.trangThaiViec.map((n) => '<option' + (n === d.trangThai ? ' selected' : '') + '>' + esc(n) + '</option>').join('') +
    '</select></td>' +
    '<td class="o-nut"><button class="btn nho mo v-xoa" title="Xoá dòng">✕</button></td>' +
  '</tr>';
}

/* ---- phần máy cộng (tuần / tháng) ---- */
function theTongHop(d) {
  const t = d.tongHop;
  if (!t) return '';
  const oSo = (so, nhan, duoi, mau) =>
    '<div class="o-so ' + (mau || '') + '"><div class="so">' + esc(so) + '</div>' +
    '<div class="nhan">' + esc(nhan) + '</div>' +
    (duoi ? '<div class="duoi">' + esc(duoi) + '</div>' : '') + '</div>';

  const mauPt = t.phanTram == null ? '' : t.phanTram >= 100 ? 'xanh' : t.phanTram < 80 ? 'do' : 'cam';

  return '<div class="luoi-so">' +
      oSo(t.soPhieuNgay, 'phiếu ngày đã nộp', t.ngayThieu.length ? 'thiếu ' + t.ngayThieu.length + ' ngày' : 'đủ trong kỳ',
        t.ngayThieu.length ? 'do' : '') +
      oSo(vePhut(t.tongPhut), 'tổng thời lượng') +
      oSo(t.phanTram == null ? '—' : t.phanTram + '%', 'so với định mức',
        'định mức ' + vePhut(t.dinhMucPhut), mauPt) +
      oSo(t.theoNhom.length, 'nhóm việc', t.theoNhom.length ? t.theoNhom[0].ten + ' nhiều nhất' : '') +
    '</div>' +
    '<div class="the"><div class="the-dau"><h2>Máy cộng từ báo cáo ngày</h2>' +
      '<span class="nho">anh/chị chỉ cần viết nhận định bên dưới</span></div>' +
    '<div class="the-than">' +
      (t.theoNhom.length
        ? t.theoNhom.map((n) =>
          '<div style="display:flex;gap:10px;align-items:center;margin-bottom:7px">' +
            '<span style="width:120px" class="phu">' + esc(n.ten) + '</span>' +
            '<div class="thanh" style="flex:1"><i style="width:' +
              Math.round((n.phut / Math.max(1, t.theoNhom[0].phut)) * 100) + '%"></i></div>' +
            '<span class="nho" style="width:82px;text-align:right">' + esc(vePhut(n.phut)) + '</span>' +
          '</div>').join('')
        : '<p class="phu">Chưa có báo cáo ngày nào trong kỳ.</p>') +
      (t.ngayThieu.length
        ? '<p class="phu" style="margin:12px 0 0">Chưa có báo cáo ngày: ' +
          t.ngayThieu.map((x) => '<span class="nhan-tt do" style="margin-right:4px">' +
            esc(x.nhan) + '</span>').join('') + '</p>'
        : '') +
    '</div></div>';
}

/* ---- nhận định + kế hoạch + cần hỗ trợ ---- */
function theVietTay(d, loaiKy) {
  const p = d.phieu || {};
  return '<div class="the"><div class="the-dau"><h2>Anh/chị tự viết</h2>' +
    '<span class="nho">' + (loaiKy === 'ngay' ? 'không bắt buộc' : 'phần máy không viết thay được') +
    '</span></div><div class="the-than">' +
      '<label class="phu">Nhận định về kỳ này</label>' +
      '<textarea class="in" id="txNhanDinh" placeholder="Chạy tốt ở đâu, vướng ở đâu, vì sao">' +
        esc(p.nhanDinh || '') + '</textarea>' +
      '<label class="phu" style="display:block;margin-top:14px">Kế hoạch kỳ sau</label>' +
      '<textarea class="in" id="txKeHoach" placeholder="Kỳ tới tập trung vào gì">' +
        esc(p.keHoach || '') + '</textarea>' +
      '<label class="phu" style="display:block;margin-top:14px">Cần hỗ trợ gì không?</label>' +
      '<textarea class="in" id="txHoTro" placeholder="Vướng mắc cần quản lý gỡ — để trống nếu không có">' +
        esc(p.canHoTro || '') + '</textarea>' +
      '<div class="nho" style="margin-top:5px">Ô này gom về một chỗ để quản lý xem cả phòng đang vướng gì.</div>' +
    '</div></div>';
}

function theLuu(d) {
  const daNop = d.phieu && d.phieu.daNop;
  return '<div class="the"><div class="the-than" ' +
    'style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
    '<button class="btn chinh" id="btnNop">' + (daNop ? 'Cập nhật báo cáo' : 'Nộp báo cáo') + '</button>' +
    '<button class="btn" id="btnNhap">Lưu nháp</button>' +
    '</div></div>';
}

/* ---- nhận định tự động ---- */
async function napNhanDinh(loaiKy) {
  const o = $('#oNhanDinh');
  if (!o || !DU.phieu) return;
  let d;
  try { d = await goi('/api/nhan-dinh?ky=' + loaiKy + '&moc=' + DU.ky.tu); } catch (_) { return; }
  if (!d.co || !d.y.length) return;
  o.innerHTML = theY('Nhận định tự động', d.y, d.diem);
}

function theY(tieuDe, y, diem) {
  return '<div class="the"><div class="the-dau"><h2>' + esc(tieuDe) + '</h2>' +
    '<span class="nho">máy đọc dữ liệu kỳ này, không phải lời khen chê</span>' +
    '<div class="lon"></div>' +
    (diem == null ? '' : '<span class="diem ' + mauDiem(diem) + '">' + diem + '</span>') +
    '</div><div class="the-than"><div class="y-ds">' +
    y.map((x) => '<div class="y ' + esc(x.muc) + '"><span class="cham"></span><div>' +
      '<div class="chu">' + esc(x.chu) + '</div>' +
      (x.vi ? '<div class="vi">' + esc(x.vi) + '</div>' : '') +
    '</div></div>').join('') +
    '</div></div></div>';
}

const mauDiem = (d) => (d >= 85 ? '' : d >= 60 ? 'cam' : 'do');

/* ---------------- gắn sự kiện ---------------- */
function gan(loaiKy) {
  const dau = $('[data-buoc]');
  const buoc = Number(dau && dau.dataset.buoc) || 0;
  $('#btnLui').onclick = () => doiMoc(-1, loaiKy, buoc);
  $('#btnToi').onclick = () => doiMoc(1, loaiKy, buoc);
  $('#btnNay').onclick = () => { MOC = Date.now(); ve(); };
  const cn = $('#chonNgay');
  if (cn) cn.onchange = () => { MOC = tuISO(cn.value); ve(); };

  $('#btnNop').onclick = () => luu(true);
  $('#btnNhap').onclick = () => luu(false);
  ['#txNhanDinh', '#txKeHoach', '#txHoTro'].forEach((s) => {
    const e = $(s);
    if (e) e.oninput = () => { BAN = true; };
  });

  if (loaiKy !== 'ngay') return;

  $('#chonCa').onchange = () => { BAN = true; hienDmTay(); tinhLai(); };
  $('#dmTay').oninput = () => { BAN = true; tinhLai(); };
  hienDmTay();

  $('#btnThem').onclick = () => {
    $('#thanBang').insertAdjacentHTML('beforeend', veHang(dongTrong()));
    ganHang();
    BAN = true;
    const o = $('#thanBang tr:last-child .v-viec');
    if (o) o.focus();
  };
  ganHang();
}

function hienDmTay() {
  const ca = $('#chonCa'), o = $('#dmTay');
  if (!ca || !o) return;
  o.hidden = ca.value !== 'khac';
  if (!o.hidden && !o.value) o.value = (DU.phieu && DU.phieu.dinhMuc) || '';
}

function ganHang() {
  $$('#thanBang tr').forEach((tr) => {
    const viec = $('.v-viec', tr);
    const cv = $('.v-cv', tr);
    const nhom = $('.v-nhom', tr);

    if (viec) {
      viec.onchange = () => {
        BAN = true;
        const khac = viec.value === '__khac';
        cv.hidden = !khac;
        if (khac) {
          nhom.value = 'Khác';
          cv.focus();
        } else {
          const op = viec.selectedOptions[0];
          /* Nhóm đoán từ "Loại công việc" bên Tracking. Người sửa lại được —
           * đoán trượt thì cùng lắm biểu đồ hơi lệch, không mất dữ liệu. */
          const g = op && op.dataset.nhom;
          if (g && [...nhom.options].some((x) => x.value === g)) nhom.value = g;
        }
        tinhLai();
      };
    }

    const pt = $('.v-pt', tr);
    if (pt) {
      pt.oninput = () => {
        BAN = true;
        const o = $('.pt', tr);
        o.textContent = pt.value + '%';
        o.classList.toggle('du', Number(pt.value) >= 100);
        /* 100% thì trạng thái tự nhảy sang Hoàn thành — không ai kéo hết thanh
         * rồi còn muốn giữ nhãn "Đang làm". Người vẫn đổi tay lại được. */
        const tt = $('.v-tt', tr);
        if (tt && Number(pt.value) >= 100 && tt.value === 'Đang làm') tt.value = 'Hoàn thành';
      };
    }

    $$('input, select, textarea', tr).forEach((o) => {
      const cu = o.oninput;
      o.oninput = (e) => { if (cu) cu(e); BAN = true; tinhLai(); };
      const cuC = o.onchange;
      o.onchange = (e) => { if (cuC) cuC(e); BAN = true; tinhLai(); };
    });

    const x = $('.v-xoa', tr);
    if (x) {
      x.onclick = () => {
        if ($$('#thanBang tr').length === 1) {
          tr.replaceWith(...htmlRa(veHang(dongTrong())));
          ganHang();
        } else tr.remove();
        BAN = true;
        tinhLai();
      };
    }
  });
}

const htmlRa = (h) => {
  const t = document.createElement('tbody');
  t.innerHTML = h;
  return [...t.children];
};

function docBang() {
  return $$('#thanBang tr').map((tr) => {
    const viec = $('.v-viec', tr);
    const khac = !viec || viec.value === '__khac' || !viec.value;
    const op = viec && viec.selectedOptions[0];
    return {
      maViec: khac ? '' : viec.value,
      congViec: khac
        ? (($('.v-cv', tr) || {}).value || '').trim()
        : (op ? op.textContent.replace(/^✓ /, '').split(' · ')[0] : ''),
      nhom: ($('.v-nhom', tr) || {}).value || 'Khác',
      phut: Number(($('.v-phut', tr) || {}).value || 0) || 0,
      tienDoPt: Number(($('.v-pt', tr) || {}).value || 0) || 0,
      tienDo: ($('.v-td', tr) || {}).value || '',
      trangThai: ($('.v-tt', tr) || {}).value || 'Đang làm',
    };
  }).filter((d) => d.congViec.trim() || d.phut > 0);
}

function dinhMucHienTai() {
  const ca = $('#chonCa');
  if (!ca) return 0;
  if (ca.value === 'khac') return Number(($('#dmTay') || {}).value || 0) || 0;
  const c = META.ca.find((x) => x.ma === ca.value);
  return (c && c.phut) || 0;
}

/**
 * Dải số dưới bảng. Anh Hùng: "chỗ thống kê các thông tin sau điền làm nhỏ lại"
 * — nên đây là mấy con chip một dòng, không phải khối số 27px như đầu trang.
 */
function tinhLai() {
  const o = $('#oTong');
  if (!o) return;
  const dong = docBang();
  const tong = dong.reduce((s, d) => s + d.phut, 0);
  const dm = dinhMucHienTai();
  const pt = dm > 0 ? Math.round((tong / dm) * 100) : null;
  const xong = dong.filter((d) => d.trangThai === 'Hoàn thành').length;
  const m = (nhan, gt, mau) => '<span class="m ' + (mau || '') + '">' +
    esc(nhan) + ' <b>' + esc(gt) + '</b></span>';

  o.innerHTML =
    m('Đầu việc', dong.length) +
    m('Hoàn thành', xong + '/' + dong.length, xong === dong.length && dong.length ? 'xanh' : '') +
    m('Tổng', vePhut(tong)) +
    m('Định mức', pt == null ? '—' : pt + '%',
      pt == null ? '' : pt >= 100 ? 'xanh' : pt < 80 ? 'cam' : '') +
    (dm > 0 && tong < dm ? m('Chưa khai', vePhut(dm - tong), 'cam') : '');
}

function doiMoc(huong, loaiKy, buoc) {
  if (loaiKy === 'thang') {
    const p = phanRa(MOC);
    const th = p.thang + huong;
    MOC = Date.UTC(p.nam + (th > 12 ? 1 : th < 1 ? -1 : 0), (th - 1 + 12) % 12, 1) - VN + 3600000;
  } else {
    MOC = DU.ky.tu + huong * buoc + 3600000;
  }
  ve();
}

/* ---------------- lưu ---------------- */
async function luu(nop) {
  const than = {
    loaiKy: MAN,
    moc: DU.ky.tu + 3600000,
    nop,
    nhanDinh: ($('#txNhanDinh') || {}).value || '',
    keHoach: ($('#txKeHoach') || {}).value || '',
    canHoTro: ($('#txHoTro') || {}).value || '',
  };
  if (MAN === 'ngay') {
    than.dong = docBang();
    than.ca = ($('#chonCa') || {}).value || 'ngay';
    than.dinhMucTay = Number(($('#dmTay') || {}).value || 0) || 0;
    if (nop && !than.dong.length) return toast('Chưa có đầu việc nào để nộp.', 'do');
  }

  const nut = [$('#btnNop'), $('#btnNhap')].filter(Boolean);
  nut.forEach((b) => { b.disabled = true; });
  try {
    const r = await goi('/api/phieu', { method: 'POST', body: JSON.stringify(than) });
    BAN = false;
    toast(nop ? 'Đã nộp — ' + r.veHan : 'Đã lưu nháp',
      nop && r.cham && r.cham.trangThai === 'tre' ? '' : 'xanh');
    await ve();
  } catch (e) {
    toast(e.message, 'do');
  } finally {
    nut.forEach((b) => { b.disabled = false; });
  }
}

/* ==================================================================
   MÀN ĐÃ NỘP (nhân sự)
   ================================================================== */
async function veDaNop(el) {
  const t = kyThangNay();
  const d = await goi('/api/danh-sach?tu=' + t.tu + '&den=' + t.den + '&moi=1');
  el.innerHTML = '<div class="the"><div class="the-dau"><h2>Báo cáo đã nộp</h2>' +
    '<span class="nho">' + veNgay(d.tu) + ' – ' + veNgay(d.den) + '</span></div>' +
    '<div class="the-than khit cuon">' + (d.ds.length
      ? '<table class="bang-xem"><thead><tr><th>Kỳ</th><th>Loại</th>' +
        '<th class="so-o">Thời lượng</th><th class="so-o">Định mức</th>' +
        '<th>Nộp lúc</th><th>Hạn</th></tr></thead><tbody>' +
        d.ds.map((p) => '<tr>' +
          '<td>' + esc(p.nhan) + '</td>' +
          '<td><span class="nhan-tt xam">' +
            esc(p.loaiKy === 'ngay' ? 'Ngày' : p.loaiKy === 'tuan' ? 'Tuần' : 'Tháng') + '</span></td>' +
          '<td class="so-o">' + esc(p.tongGio) + '</td>' +
          '<td class="so-o">' + (p.phanTram == null ? '—' : p.phanTram + '%') + '</td>' +
          '<td>' + (p.daNop ? esc(veLuc(p.nopLuc)) : '<span class="nhan-tt cam">Nháp</span>') + '</td>' +
          '<td>' + nhanHan(p) + '</td>' +
        '</tr>').join('') + '</tbody></table>'
      : rong('Chưa có phiếu nào', 'Tháng này anh/chị chưa nộp báo cáo nào.')) +
    '</div></div>';
}

const rong = (a, b) => '<div class="rong"><b>' + esc(a) + '</b>' + esc(b || '') + '</div>';

function nhanHan(p) {
  if (!p.daNop) return '<span class="nhan-tt xam">chưa nộp</span>';
  if (p.trangThaiHan === 'tre') return '<span class="nhan-tt do">' + esc(p.veHan) + '</span>';
  return '<span class="nhan-tt xanh">đúng hạn</span>';
}

/* ==================================================================
   MÀN QUẢN LÝ
   ================================================================== */

async function veToanPhong(el) {
  const d = await goi('/api/toan-phong?ky=tuan&moc=' + MOC + '&moi=1');
  const co = d.nguoi.length;
  const yeu = d.nguoi.filter((n) => n.diem < 60).length;
  const thieu = d.nguoi.reduce((s, n) => s + n.soThieu, 0);
  const oSo = (so, nhan, duoi, mau) =>
    '<div class="o-so ' + (mau || '') + '"><div class="so">' + esc(so) + '</div>' +
    '<div class="nhan">' + esc(nhan) + '</div>' +
    (duoi ? '<div class="duoi">' + esc(duoi) + '</div>' : '') + '</div>';

  el.innerHTML =
    '<div class="luoi-so">' +
      oSo(co, 'người có báo cáo', d.nhan) +
      oSo(yeu, 'người cần nhìn kỹ', 'điểm dưới 60', yeu ? 'do' : 'xanh') +
      oSo(thieu, 'lượt ngày thiếu', 'trong kỳ', thieu ? 'cam' : 'xanh') +
      oSo(vePhut(d.nguoi.reduce((s, n) => s + n.tongPhut, 0)), 'tổng thời lượng cả phòng') +
    '</div>' +
    '<div class="the"><div class="the-dau"><h2>Đánh giá toàn phòng</h2>' +
      '<span class="nho">' + esc(d.nhan) + ' · bấm một dòng để mở đầy đủ</span>' +
      '<div class="lon"></div>' +
      '<button class="btn nho mo" id="btnLui">‹</button>' +
      '<button class="btn nho mo" id="btnToi"' + (d.ky.den >= Date.now() ? ' disabled' : '') + '>›</button>' +
      '</div><div class="the-than khit cuon">' + (co
      ? '<table class="bang-xem"><thead><tr><th style="width:52px">Điểm</th><th>Người</th>' +
        '<th class="so-o">Phiếu</th><th class="so-o">Thời lượng</th><th class="so-o">Định mức</th>' +
        '<th>Đáng chú ý nhất</th></tr></thead><tbody>' +
        d.nguoi.map((n, i) => '<tr class="mo-duoc" data-i="' + i + '">' +
          '<td><span class="diem ' + mauDiem(n.diem) + '">' + n.diem + '</span></td>' +
          '<td><b>' + esc(n.ten) + '</b>' +
            (n.soThieu ? ' <span class="nhan-tt do">thiếu ' + n.soThieu + ' ngày</span>' : '') + '</td>' +
          '<td class="so-o">' + n.soPhieu + '</td>' +
          '<td class="so-o">' + esc(n.tongGio) + '</td>' +
          '<td class="so-o">' + (n.phanTram == null ? '—' : n.phanTram + '%') + '</td>' +
          '<td class="phu">' + esc(n.motCau) + '</td>' +
        '</tr>').join('') + '</tbody></table>'
      : rong('Chưa có báo cáo nào trong kỳ này',
        'Khi nhân sự bắt đầu nộp, bảng này tự có người.')) +
    '</div></div><div id="oChiTiet"></div>';

  const buoc = 7 * NGAY_MS;
  $('#btnLui').onclick = () => { MOC = d.ky.tu - buoc + 3600000; ve(); };
  $('#btnToi').onclick = () => { MOC = d.ky.tu + buoc + 3600000; ve(); };
  $$('tr.mo-duoc').forEach((tr) => {
    tr.onclick = () => {
      const n = d.nguoi[Number(tr.dataset.i)];
      $('#oChiTiet').innerHTML = theY(n.ten + ' — ' + d.nhan, n.y, n.diem);
      $('#oChiTiet').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  });
}

async function veCanHoTro(el) {
  const t = mocTuan(Date.now());
  /* Nhìn rộng hơn một tuần: vướng mắc nêu tuần trước mà chưa gỡ thì vẫn là
   * vướng mắc, biến mất khỏi màn hình không làm nó tự hết. */
  const tu = t.tu - 21 * NGAY_MS;
  const d = await goi('/api/can-ho-tro?tu=' + tu + '&den=' + Date.now() + '&moi=1');
  el.innerHTML = '<div class="the"><div class="the-dau"><h2>Vướng mắc cả phòng đang nêu</h2>' +
    '<span class="nho">bốn tuần gần đây · ' + d.ds.length + ' mục</span></div>' +
    '<div class="the-than">' + (d.ds.length
      ? '<div class="y-ds">' + d.ds.map((x) =>
        '<div class="y canh"><span class="cham"></span><div>' +
          '<div class="chu">' + esc(x.ten) + ' — ' + esc(x.nhan) +
            ' <span class="nhan-tt xam">' + esc(x.loaiKy) + '</span></div>' +
          '<div class="vi">' + esc(x.noi) + '</div>' +
        '</div></div>').join('') + '</div>'
      : rong('Không ai nêu vướng mắc',
        'Ô "Cần hỗ trợ" trong phiếu báo cáo đang trống ở mọi người.')) +
    '</div></div>';
}

async function veTheoDoi(el) {
  const t = mocTuan(Date.now());
  const d = await goi('/api/theo-doi?tu=' + t.tu + '&den=' + t.den + '&moi=1');
  el.innerHTML = '<div class="the"><div class="the-dau"><h2>Ai đã nộp, ai chưa</h2>' +
    '<span class="nho">' + veNgay(d.tu) + ' – ' + veNgay(d.den) + ' · ' +
    d.soNgayCong + ' ngày công</span></div>' +
    '<div class="the-than khit cuon">' + (d.nguoi.length
      ? '<table class="bang-xem"><thead><tr><th>Người</th><th class="so-o">Đã nộp</th>' +
        '<th class="so-o">Trễ</th><th class="so-o">Tổng</th><th>Ngày còn thiếu</th></tr></thead><tbody>' +
        d.nguoi.map((n) => '<tr>' +
          '<td><b>' + esc(n.ten) + '</b></td>' +
          '<td class="so-o">' + n.soNgayDaNop + '/' + d.soNgayCong + '</td>' +
          '<td class="so-o">' + (n.soTre ? '<span class="nhan-tt cam">' + n.soTre + '</span>' : '0') + '</td>' +
          '<td class="so-o">' + esc(vePhut(n.tongPhut)) + '</td>' +
          '<td>' + (n.thieu.length
            ? n.thieu.map((x) => '<span class="nhan-tt do" style="margin-right:4px">' +
              esc(x.nhan) + '</span>').join('')
            : '<span class="nhan-tt xanh">đủ</span>') + '</td>' +
        '</tr>').join('') + '</tbody></table>'
      : rong('Chưa ai nộp phiếu nào trong tuần này')) +
    '</div></div>';
}

/* ---------------- xuất ---------------- */
function xuat() {
  const t = kyThangNay();
  const caPhong = META.toi.quanLy ? '&ca-phong=1' : '';
  window.location.href = '/api/xuat?tu=' + t.tu + '&den=' + t.den + caPhong;
}

nap().catch((e) => {
  $('#man').innerHTML = '<div class="the"><div class="rong"><b>Không khởi động được</b>' +
    esc(e.message) + '</div></div>';
});
