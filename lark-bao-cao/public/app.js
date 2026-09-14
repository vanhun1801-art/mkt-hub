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
/* Màn Theo dõi có phạm vi riêng — quản lý hay lùi lại xem tuần trước, và chuyển
 * sang cả tháng khi soát kỷ luật. Giữ ngoài MAN/MOC để đổi tab đi rồi quay lại
 * vẫn ở đúng chỗ đang xem. */
let TD_KY = 'tuan';
let TD_MOC = Date.now();

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
  /* Mỗi chỗ nói MỘT việc, không nhắc lại nhau: nhãn này chỉ nói đã nộp hay
   * chưa, dòng dưới nói mốc giờ, còn kết luận đúng hạn hay muộn thì để note màu
   * bên dưới lo. Bản trước cả ba đều ghi "trễ 19 giờ 50 phút". */
  const tt = !p ? '<span class="nhan-tt xam">Chưa có</span>'
    : p.daNop ? '<span class="nhan-tt xanh">Đã nộp</span>'
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
      /* Nhận định nạp sau (một lượt gọi riêng) nên chừa sẵn chỗ ngay đây. */
      '<div class="nd-note" id="ndNote"></div>' +
    '</div></div>';
}

function cauHan(d) {
  const p = d.phieu;
  /* Chỉ mốc giờ. Kết luận đúng hạn hay muộn nằm ở note ngay bên dưới — nói ở cả
   * hai chỗ thì người đọc phải kiểm xem hai câu có khớp nhau không. */
  if (p && p.daNop) {
    return 'đã nộp ' + veLuc(p.nopLuc) +
      (p.soLanNop > 1 ? ' · sửa ' + (p.soLanNop - 1) + ' lần' : '');
  }
  return Date.now() > d.han
    ? 'đã quá hạn — nộp bây giờ vẫn ghi nhận nhưng đánh dấu là trễ'
    : 'còn hạn';
}

/* ---- bảng đầu việc (phiếu NGÀY) ----
 *
 * Trở lại dạng BẢNG. Bản dựng mỗi đầu việc thành một khối riêng thì rõ ràng
 * thật, nhưng anh Hùng xem xong bảo "hiện tại anh thấy hơi lớn" — năm đầu việc
 * là năm khối cao, phải cuộn mới nhìn hết một ngày làm việc. Bảng gọn hơn hẳn
 * và vốn là hình dạng cả phòng đã quen từ file Excel.
 *
 * Chỗ anh yêu cầu thì làm đúng một việc: ô CÔNG VIỆC có THÊM MỘT HÀNG phía
 * trên để chọn từ Bảng công việc, ô gõ tay giữ nguyên bên dưới. Hai thứ luôn
 * hiện cả hai, không ẩn hiện — bản trước giấu ô gõ tay sau mục "Khác — tự nhập"
 * nên nhìn vào không đoán ra là vẫn gõ thẳng được.
 */
function theBang(d) {
  const dong = d.dong.length ? d.dong : [dongTrong()];
  const ca = (d.phieu && d.phieu.ca) || 'Cả ngày';

  /* Ba trạng thái khác nhau, và gộp chúng lại là cách chắc chắn để người dùng
   * hiểu sai: hỏng đường truyền · nối được nhưng không ai giao việc · có việc. */
  const canhBao = !VIEC ? ''
    : !VIEC.chay
      ? khoiBao('do', 'Không nối được Bảng công việc',
        (VIEC.ly || '') + (VIEC.cong ? ' (cổng ' + VIEC.cong + ')' : '') +
        ' — vẫn gõ thẳng tên công việc vào ô bên dưới được.')
      : !VIEC.ds.length
        ? khoiBao('cam', 'Không có đầu việc nào',
          'Bảng công việc hiện không giao việc nào cho ' + (VIEC.cuaAi || 'anh/chị') +
          '. Gõ thẳng tên vào ô bên dưới, hoặc nhờ quản lý giao việc trước.')
        : '';

  return '<div class="the">' +
    '<div class="the-dau"><h2>Báo cáo công việc</h2>' +
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
        '<th style="min-width:250px">Công việc</th>' +
        '<th class="tach" style="width:130px">Nhóm</th>' +
        '<th style="width:82px">Phút</th>' +
        '<th style="width:172px">Tiến độ</th>' +
        '<th style="min-width:170px">Ghi chú tiến độ</th>' +
        '<th style="width:124px">Trạng thái</th>' +
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

function khoiBao(mau, tieuDe, chu) {
  return '<div class="the-than bao-' + mau + '">' +
    '<span class="nhan-tt ' + mau + '">' + esc(tieuDe) + '</span> ' +
    '<span class="nho">' + esc(chu) + '</span></div>';
}

const dongTrong = () => ({
  congViec: '', maViec: '', nhom: 'Khác', phut: '',
  tienDoPt: 0, tienDo: '', trangThai: 'Đang làm', ghiChu: '',
});

/**
 * Menu đầu việc.
 *
 * Mục đầu để trống nghĩa là "tự gõ ở hàng dưới" — không cần mục "Khác" riêng,
 * vì ô gõ tay lúc nào cũng đứng ngay bên dưới.
 *
 * Việc đang khai mà KHÔNG còn trong danh sách (đã đóng lâu, hoặc chuyển cho
 * người khác) vẫn phải giữ được: thêm một mục riêng cho nó, kẻo mở lại phiếu cũ
 * là mất liên kết về Bảng công việc.
 */
function menuViec(d) {
  const ds = (VIEC && VIEC.ds) || [];
  const coTrongDs = d.maViec && ds.some((v) => v.id === d.maViec);
  /* Mục đầu là "Khác" — gõ tay tên ở ô dưới thì ô này tự về đây. Danh sách việc
   * nằm trong một nhóm có tên, nên mở menu ra là biết ngay đang chọn từ đâu mà
   * không phải thêm một dòng chữ nào trong hàng. */
  let o = '<option value="">Khác</option>';
  if (d.maViec && !coTrongDs) {
    o += '<option value="' + esc(d.maViec) + '" selected>' + esc(d.congViec) +
      ' (không còn trong danh sách)</option>';
  }
  if (ds.length) {
    o += '<optgroup label="Công việc đang tiến hành">' +
      ds.map((v) => '<option value="' + esc(v.id) + '" data-nhom="' + esc(v.nhom) + '"' +
        ' data-ten="' + esc(v.ten) + '"' + (v.id === d.maViec ? ' selected' : '') + '>' +
        (v.dong ? '✓ ' : '') + esc(v.ten) + (v.loai ? ' · ' + esc(v.loai) : '') +
        '</option>').join('') + '</optgroup>';
  }
  return o;
}

function veHang(d) {
  const pt = Number(d.tienDoPt) || 0;
  return '<tr>' +
    /* Hai hàng trong CÙNG một ô: chọn ở trên, gõ ở dưới. */
    '<td data-nhan="Công việc" class="o-viec">' +
      '<select class="v-viec">' + menuViec(d) + '</select>' +
      '<input class="v-cv" value="' + esc(d.congViec) + '" ' +
        'placeholder="Công việc khác">' +
    '</td>' +
    '<td data-nhan="Nhóm" class="tach"><select class="v-nhom">' +
      META.nhomViec.map((n) => '<option' + (n === d.nhom ? ' selected' : '') + '>' +
        esc(n) + '</option>').join('') +
    '</select></td>' +
    '<td data-nhan="Phút" class="so-o"><input class="v-phut" type="number" min="0" step="5" value="' +
      esc(d.phut === 0 || d.phut === '' ? '' : d.phut) + '" placeholder="0"></td>' +
    '<td data-nhan="Tiến độ"><div class="td-o">' +
      '<input class="v-pt" type="range" min="0" max="100" step="5" value="' + pt + '">' +
      '<span class="pt' + (pt >= 100 ? ' du' : '') + '">' + pt + '%</span>' +
    '</div></td>' +
    /* Không chữ gợi ý: cột đã có tiêu đề "GHI CHÚ TIẾN ĐỘ" ngay trên đầu, và ô
     * này chỉ cao một dòng nên câu gợi ý dài bị cắt làm đôi, nhìn như lỗi. */
    '<td data-nhan="Ghi chú tiến độ"><textarea class="v-td" rows="1">' +
      esc(d.tienDo) + '</textarea></td>' +
    '<td data-nhan="Trạng thái"><select class="v-tt">' +
      META.trangThaiViec.map((n) => '<option' + (n === d.trangThai ? ' selected' : '') + '>' +
        esc(n) + '</option>').join('') +
    '</select></td>' +
    '<td class="o-nut"><button class="btn nho mo v-xoa" title="Xoá dòng">✕</button></td>' +
  '</tr>';
}


/* ---- phần máy cộng (tuần / tháng) ----
 *
 * Anh Hùng xem bản bốn-thẻ-số rồi bảo "chưa thiết thực, vì nó cần thể hiện được
 * tổng các báo cáo đã nộp, các công việc; nội dung đánh giá công việc và nhận
 * định… dựa vào các thông tin như thế thì họ sẽ có thể tổng hợp thành đánh giá
 * báo cáo tuần".
 *
 * Đúng: "3 phiếu · 24 giờ · 100% định mức · 2 nhóm việc" thì không sai, nhưng
 * ngồi trước nó không viết nổi một câu nhận định nào. Người viết báo cáo tuần
 * cần NGUYÊN LIỆU — đã làm những việc gì, việc nào chạy việc nào đứng, và mình
 * đã tự viết gì trong bảy ngày qua. Nên số tổng thu lại thành một dải chip, chỗ
 * còn lại dành cho ba khối đọc được.
 */
function theTongHop(d) {
  const t = d.tongHop;
  if (!t) return '';
  const m = (nhan, gt, mau) => '<span class="m ' + (mau || '') + '">' +
    esc(nhan) + ' <b>' + esc(gt) + '</b></span>';

  const dai =
    m('Đã nộp', t.soPhieuNgay + ' ngày', t.ngayThieu.length ? 'cam' : 'xanh') +
    m('Tổng', t.tongGio) +
    m('Định mức', t.phanTram == null ? '—' : t.phanTram + '%',
      t.phanTram == null ? '' : t.phanTram >= 100 ? 'xanh' : t.phanTram < 80 ? 'cam' : '') +
    m('Đầu việc', t.viec.length) +
    (t.ngayThieu.length ? m('Chưa nộp', t.ngayThieu.length + ' ngày', 'do') : '');

  return '<div class="the"><div class="the-than dai-day" style="border:0">' +
      '<div class="dai-so">' + dai + '</div>' +
      (t.ngayThieu.length
        ? '<div class="nho" style="margin-top:8px">Chưa có báo cáo ngày: ' +
          t.ngayThieu.map((x) => '<span class="nhan-tt do" style="margin-right:4px">' +
            esc(x.nhan) + '</span>').join('') + '</div>'
        : '') +
    '</div></div>' +
    theViecKy(t) + theNgayKy(t) + theDaViet(t);
}

/** Đầu việc trong kỳ — gộp lại, không phải bảy dòng rời rạc của bảy ngày. */
function theViecKy(t) {
  if (!t.viec.length) {
    return '<div class="the"><div class="the-dau"><h2>Đầu việc trong kỳ</h2></div>' +
      rong('Chưa có báo cáo ngày nào trong kỳ',
        'Nộp báo cáo từng ngày trước, phần này tự cộng lại.') + '</div>';
  }
  return '<div class="the"><div class="the-dau"><h2>Đầu việc trong kỳ</h2>' +
    '<span class="nho">' + t.viec.length + ' việc · gộp từ ' + t.soPhieuNgay + ' báo cáo ngày</span>' +
    '</div><div class="the-than khit cuon">' +
    '<table class="bang-xem"><thead><tr>' +
      '<th>Công việc</th><th>Nhóm</th><th class="so-o">Thời lượng</th>' +
      '<th class="so-o">Số ngày</th><th>Tiến độ</th><th>Trạng thái</th>' +
    '</tr></thead><tbody>' +
    t.viec.map((v) => '<tr>' +
      '<td><b>' + esc(v.ten) + '</b></td>' +
      '<td><span class="nhan-tt xam">' + esc(v.nhom) + '</span></td>' +
      '<td class="so-o">' + esc(v.gio) + '</td>' +
      '<td class="so-o">' + v.soNgay + '</td>' +
      '<td>' + veTienDo(v) + '</td>' +
      '<td>' + (v.trangThai === 'Hoàn thành'
        ? '<span class="nhan-tt xanh">Hoàn thành</span>'
        : '<span class="nhan-tt xam">' + esc(v.trangThai || '—') + '</span>') + '</td>' +
    '</tr>').join('') +
    '</tbody></table></div></div>';
}

/** "30% → 70%" khi có nhích, "70%" khi đứng một chỗ — và nói thẳng nếu đứng yên. */
function veTienDo(v) {
  if (v.ptDau === v.ptCuoi) {
    return '<span class="' + (v.dungYen ? 'nhan-tt cam' : 'nho') + '">' + v.ptCuoi + '%' +
      (v.dungYen ? ' · đứng yên' : '') + '</span>';
  }
  return '<span class="nho">' + v.ptDau + '% → </span><b>' + v.ptCuoi + '%</b>';
}

/** Từng ngày đã nộp — để biết tuần này rơi vào những ngày nào. */
function theNgayKy(t) {
  if (!t.theoNgay.length) return '';
  return '<div class="the"><div class="the-dau"><h2>Các báo cáo ngày đã nộp</h2></div>' +
    '<div class="the-than khit cuon">' +
    '<table class="bang-xem"><thead><tr>' +
      '<th>Ngày</th><th class="so-o">Đầu việc</th><th class="so-o">Thời lượng</th>' +
      '<th class="so-o">Định mức</th><th>Nộp</th>' +
    '</tr></thead><tbody>' +
    t.theoNgay.map((n) => '<tr>' +
      '<td>' + esc(n.nhan) + '</td>' +
      '<td class="so-o">' + n.soViec + '</td>' +
      '<td class="so-o">' + esc(n.tongGio) + '</td>' +
      '<td class="so-o">' + (n.phanTram == null ? '—' : n.phanTram + '%') + '</td>' +
      '<td>' + (n.trangThaiHan === 'tre'
        ? '<span class="nhan-tt cam">' + esc(n.veHan) + '</span>'
        : '<span class="nhan-tt xanh">đúng hạn</span>') + '</td>' +
    '</tr>').join('') +
    '</tbody></table></div></div>';
}

/**
 * Mọi câu người đã tự viết trong kỳ, gom một chỗ kèm ngày.
 *
 * Đây là thứ ảnh chụp màn hình không bao giờ cho được: muốn đọc lại bảy ngày
 * thì phải mở bảy tấm ảnh. Có nó thì viết nhận định tuần chỉ còn là đọc lại
 * chính mình rồi rút gọn.
 */
function theDaViet(t) {
  if (!t.daViet.length) return '';
  return '<div class="the"><div class="the-dau"><h2>Anh/chị đã viết gì trong kỳ</h2>' +
    '<span class="nho">' + t.daViet.length + ' ghi chú · đọc lại để rút thành nhận định tuần</span>' +
    '</div><div class="the-than"><div class="da-viet">' +
    t.daViet.map((g) => '<div class="dv">' +
      '<div class="dv-dau"><span class="dv-ngay">' + esc(g.ngay) + '</span>' +
      '<span class="dv-loai">' + esc(g.loai) + '</span></div>' +
      '<div class="dv-chu">' + esc(g.chu) + '</div>' +
    '</div>').join('') +
    '</div></div></div>';
}


/**
 * Phần người tự viết.
 *
 * Câu chữ giữ ngắn và KHÔNG định hướng — anh Hùng: "câu từ đơn giản lại, ít
 * mang tính định hướng, ngắn gọn dễ hiểu ý hơn". Gợi ý dài kiểu "chạy tốt ở
 * đâu, vướng ở đâu, vì sao" thực ra là đang đọc hộ người ta phải viết gì, và ai
 * cũng viết đúng ba ý đó rồi thôi.
 */
function theVietTay(d, loaiKy) {
  const p = d.phieu || {};
  /* Ô để TRỐNG, không chữ gợi ý. Anh Hùng: "đổi thành ô trống không ghi nội
   * dung". Mỗi ô đã có nhãn riêng ngay trên nó rồi; thêm một câu mờ bên trong
   * vừa thừa vừa đang đọc hộ người ta phải viết gì. */
  const o = (nhan, id, gt) =>
    '<div class="viec-o"><div class="o-nhan">' + esc(nhan) + '</div>' +
    '<textarea class="in" id="' + id + '">' + esc(gt || '') + '</textarea></div>';

  /* Link video chỉ hỏi ở kỳ TUẦN và THÁNG, và KHÔNG ghi "không bắt buộc": quay
   * video báo cáo là quy định của phòng, viết thêm câu đó là nói ngược lại. */
  const video = loaiKy === 'ngay' ? ''
    : '<div class="viec-o"><div class="o-nhan">Link video</div>' +
      '<input class="in" id="txVideo" type="url" value="' + esc(p.linkVideo || '') +
      '"></div>';

  return '<div class="the"><div class="the-dau"><h2>Đánh giá báo cáo</h2></div>' +
    '<div class="the-than viec-ds">' +
      o('Nhận định', 'txNhanDinh', p.nhanDinh) +
      o('Kế hoạch kỳ sau', 'txKeHoach', p.keHoach) +
      video +
      o('Cần hỗ trợ', 'txHoTro', p.canHoTro) +
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
/**
 * Nhận định tự động, dạng mấy note nhỏ ngay trên đầu phiếu.
 *
 * Anh Hùng: "phần nhận định trên báo cáo thì em để thành các note nhỏ đơn giản
 * trên đầu là được, nhỏ nhỏ trên đó đủ hiểu". Bản trước là một thẻ riêng ở cuối
 * trang với điểm số to — người gõ xong phiếu phải cuộn xuống mới thấy, mà thấy
 * rồi thì nó lại to hơn giá trị nó mang.
 *
 * Không hiện điểm ở màn này. Điểm chỉ để XẾP THỨ TỰ bảng toàn phòng của quản
 * lý; chấm một con số lên đầu phiếu của chính người vừa gõ là đổi hẳn ý nghĩa
 * của nó, từ "máy đọc dữ liệu" thành "máy chấm điểm anh".
 */
async function napNhanDinh(loaiKy) {
  const o = $('#ndNote');
  if (!o || !DU.phieu) return;
  let d;
  try { d = await goi('/api/nhan-dinh?ky=' + loaiKy + '&moc=' + DU.ky.tu); } catch (_) { return; }
  if (!d.co || !d.y.length) return;
  o.innerHTML = noteY(d.y);
}

/* Trên phiếu chỉ nói chuyện NỘP. Anh Hùng: "phần này anh nghĩ chỉ cần nêu ra là
 * nộp muộn, hay nộp đúng. Còn phần đánh giá khác thì chưa cần". Mấy ý về thời
 * lượng, cơ cấu việc, vướng mắc… vẫn được tính và vẫn nằm ở màn Toàn phòng của
 * quản lý — chỉ là không đặt lên đầu phiếu của người vừa gõ. */
const NHOM_TREN_PHIEU = ['han'];

/* Cảnh báo đứng trước, rồi lưu ý, rồi tốt — mắt đọc từ trái sang. */
const THU_TU_MUC = { canh: 0, 'luu-y': 1, tot: 2 };

/** Dải note nhỏ. Phần "vì" thành lời nhắc khi rê chuột, để một dòng đủ chứa. */
function noteY(y) {
  return [...y]
    .filter((x) => NHOM_TREN_PHIEU.includes(x.nhom))
    .sort((a, b) => (THU_TU_MUC[a.muc] ?? 3) - (THU_TU_MUC[b.muc] ?? 3))
    .map((x) => '<span class="nd nd-' + esc(x.muc) + '"' +
      (x.vi ? ' title="' + esc(x.vi) + '"' : '') + '>' +
      /* Bỏ dấu chấm cuối câu: đây là note, không phải câu văn. */
      esc(String(x.chu).replace(/\.$/, '')) + '</span>').join('');
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
  ['#txNhanDinh', '#txKeHoach', '#txHoTro', '#txVideo'].forEach((s) => {
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
    const ds = $$('#thanBang tr');
    const o = ds.length && $('.v-viec', ds[ds.length - 1]);
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

    /**
     * Chọn một việc từ Bảng công việc:
     *   - điền tên xuống ô gõ tay ngay dưới (vẫn sửa được),
     *   - đặt nhóm theo phỏng đoán từ "Loại công việc" bên Tracking,
     *   - đánh dấu ô nhóm là "máy đoán", để người biết mà sửa nếu trượt.
     */
    if (viec) {
      viec.onchange = () => {
        BAN = true;
        const op = viec.selectedOptions[0];
        const tenViec = op && op.dataset.ten;
        if (viec.value && tenViec) cv.value = tenViec;
        const g = op && op.dataset.nhom;
        if (g && [...nhom.options].some((x) => x.value === g)) {
          nhom.value = g;
          nhom.classList.add('doan');
          nhom.title = 'Nhóm do máy đoán từ Bảng công việc — sửa được';
        } else {
          nhom.classList.remove('doan');
          nhom.title = '';
        }
        tinhLai();
      };
    }

    /* Sửa tay tên công việc thì bỏ liên kết về Bảng công việc: tên đã khác mà
     * giữ mã cũ là báo cáo trỏ về một đầu việc không còn đúng nữa. */
    if (cv && viec) {
      cv.oninput = () => {
        BAN = true;
        const op = viec.selectedOptions[0];
        const tenViec = (op && op.dataset.ten) || '';
        if (viec.value && cv.value.trim() !== tenViec) {
          viec.value = '';
          nhom.classList.remove('doan');
          nhom.title = '';
        }
        tinhLai();
      };
    }

    /* Người tự chọn nhóm thì thôi không còn là máy đoán nữa. */
    if (nhom) {
      nhom.onchange = () => {
        BAN = true;
        nhom.classList.remove('doan');
        nhom.title = '';
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
        /* Kéo hết thanh thì trạng thái tự sang Hoàn thành — không ai kéo tới
         * 100% mà còn muốn giữ nhãn "Đang làm". Vẫn đổi tay lại được. */
        const tt = $('.v-tt', tr);
        if (tt && Number(pt.value) >= 100 && tt.value === 'Đang làm') tt.value = 'Hoàn thành';
        tinhLai();
      };
    }

    /* Bọc thêm một lớp cho MỌI ô: những ô chưa có xử lý riêng vẫn phải đánh dấu
     * "có thay đổi" và cộng lại tổng. Đọc hàm cũ ra trước rồi mới ghi đè, kẻo
     * xoá mất mấy xử lý vừa gắn ở trên. */
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
          /* Xoá dòng cuối cùng thì để lại một dòng trống, đừng để bảng rỗng
           * không còn chỗ gõ — người dùng sẽ tưởng app hỏng. */
          tr.replaceWith(...htmlRa(veHang(dongTrong())));
        } else tr.remove();
        BAN = true;
        ganHang();
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
    return {
      /* Ô gõ tay là nguồn duy nhất của TÊN việc — chọn từ danh sách chỉ điền
       * vào nó. Một nguồn thì không bao giờ có chuyện hai ô nói khác nhau. */
      congViec: (($('.v-cv', tr) || {}).value || '').trim(),
      maViec: (viec && viec.value) || '',
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
    linkVideo: ($('#txVideo') || {}).value || '',
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

/**
 * Màn Theo dõi — kỷ luật nộp báo cáo của cả phòng.
 *
 * Anh Hùng: "anh muốn có thể kiểm soát được nhân sự báo cáo đúng ngày, hay nhân
 * sự báo cáo trễ và báo cáo bù". Nên bảng này chia BỐN cột chứ không phải hai:
 * đúng hạn · trễ · nộp bù · còn thiếu. Gộp ba cái sau thành "chưa đúng hạn" là
 * mất đúng cái phân biệt anh cần — quên gửi buổi tối rồi sáng gửi khác hẳn dồn
 * cả tuần vào cuối tháng, mà cũng khác hẳn không nộp gì.
 */
async function veTheoDoi(el) {
  const k = TD_KY === 'thang' ? kyThangNay() : mocTuan(TD_MOC);
  const d = await goi('/api/theo-doi?tu=' + k.tu + '&den=' + k.den + '&moi=1');

  const tong = (f) => d.nguoi.reduce((s, n) => s + f(n), 0);
  const oSo = (so, nhan, duoi, mau) =>
    '<div class="o-so ' + (mau || '') + '"><div class="so">' + esc(so) + '</div>' +
    '<div class="nhan">' + esc(nhan) + '</div>' +
    (duoi ? '<div class="duoi">' + esc(duoi) + '</div>' : '') + '</div>';

  const soThieu = tong((n) => n.thieu.length);
  const soBu = tong((n) => n.soBu);
  const soTre = tong((n) => n.soTre);
  const soDung = tong((n) => n.soDungHan);
  const tongPhieu = soDung + soTre + soBu;

  el.innerHTML =
    '<div class="luoi-so">' +
      oSo(tongPhieu ? Math.round((soDung / tongPhieu) * 100) + '%' : '—',
        'nộp đúng hạn', soDung + '/' + tongPhieu + ' phiếu',
        !tongPhieu ? '' : soDung === tongPhieu ? 'xanh' : soDung / tongPhieu < 0.8 ? 'do' : 'cam') +
      oSo(soTre, 'lượt nộp trễ', 'trong ngày hôm sau', soTre ? 'cam' : '') +
      oSo(soBu, 'lượt nộp bù', 'quá 24 giờ', soBu ? 'do' : '') +
      oSo(soThieu, 'ngày chưa nộp', d.soNgayCong + ' ngày công × ' + d.nguoi.length + ' người',
        soThieu ? 'do' : 'xanh') +
    '</div>' +

    '<div class="the"><div class="the-dau"><h2>Ai nộp thế nào</h2>' +
      '<span class="nho">' + veNgay(d.tu) + ' – ' + veNgay(d.den) +
      ' · ' + d.soNgayCong + ' ngày công</span>' +
      '<div class="lon"></div>' +
      '<div class="pills">' +
        '<button class="pill' + (TD_KY === 'tuan' ? ' on' : '') + '" id="tdTuan">Tuần</button>' +
        '<button class="pill' + (TD_KY === 'thang' ? ' on' : '') + '" id="tdThang">Tháng</button>' +
      '</div>' +
      (TD_KY === 'tuan'
        ? '<button class="btn nho mo" id="tdLui">‹</button>' +
          '<button class="btn nho mo" id="tdToi"' +
          (k.den >= Date.now() ? ' disabled' : '') + '>›</button>'
        : '') +
    '</div><div class="the-than khit cuon">' + (d.nguoi.length
      ? '<table class="bang-xem"><thead><tr>' +
        '<th>Người</th>' +
        '<th class="so-o">Đúng hạn</th>' +
        '<th class="so-o">Trễ</th>' +
        '<th class="so-o">Nộp bù</th>' +
        '<th class="so-o">Thời lượng</th>' +
        '<th>Ngày chưa nộp</th>' +
        '</tr></thead><tbody>' +
        d.nguoi.map((n) => '<tr>' +
          '<td><b>' + esc(n.ten) + '</b>' +
            (n.soSua ? ' <span class="nho">· sửa ' + n.soSua + ' phiếu</span>' : '') + '</td>' +
          '<td class="so-o">' + oDem(n.soDungHan, 'xanh') +
            (n.tyLeDung == null ? '' : ' <span class="nho">' + n.tyLeDung + '%</span>') + '</td>' +
          '<td class="so-o">' + oDem(n.soTre, 'cam') + '</td>' +
          '<td class="so-o">' + oDem(n.soBu, 'do') + '</td>' +
          '<td class="so-o">' + esc(vePhut(n.tongPhut)) + '</td>' +
          '<td>' + (n.thieu.length
            ? n.thieu.map((x) => '<span class="nhan-tt do" style="margin-right:4px">' +
              esc(x.nhan) + '</span>').join('')
            : '<span class="nhan-tt xanh">đủ</span>') + '</td>' +
        '</tr>').join('') + '</tbody></table>'
      : rong('Chưa ai nộp phiếu nào trong kỳ này')) +
    '</div></div>';

  $('#tdTuan').onclick = () => { TD_KY = 'tuan'; TD_MOC = Date.now(); ve(); };
  $('#tdThang').onclick = () => { TD_KY = 'thang'; ve(); };
  const lui = $('#tdLui');
  if (lui) lui.onclick = () => { TD_MOC = k.tu - 7 * NGAY_MS + 3600000; ve(); };
  const toi = $('#tdToi');
  if (toi) toi.onclick = () => { TD_MOC = k.tu + 7 * NGAY_MS + 3600000; ve(); };
}

/** Số 0 để mờ, số khác 0 mới tô màu — mắt chỉ dừng ở chỗ có chuyện. */
function oDem(n, mau) {
  if (!n) return '<span class="nho">0</span>';
  return '<span class="nhan-tt ' + mau + '">' + n + '</span>';
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
