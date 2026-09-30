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
  /* Anh Hùng (30/09): thiết lập chuẩn nằm chung cụm quản lý cho tiện. */
  { ma: 'thiet-lap', ten: 'Thiết lập' },
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
  ganSo();
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
    b.onclick = async () => {
      await luuTruocKhiDi();
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
  if (tuLuuDuoc()) { tuLuu(true); return; }   // phiếu nháp: gửi luôn (keepalive), khỏi hỏi
  e.preventDefault();
  e.returnValue = '';
});

async function ve() {
  const el = $('#man');
  /* Khung xương thay cho chữ: đổi kỳ / đổi màn là cả cột nội dung trắng ra
   * trong lúc chờ Base, mà mấy màn này đọc khá lâu. */
  el.innerHTML = window.KX ? KX.man('', { dau: false, the: 3, dong: 7 })
    : '<div class="the"><div class="rong">Đang tải…</div></div>';
  try {
    /* Sổ đang mở mà đổi kỳ thì nội dung của nó phải đi theo — bỏ quên thì nó
     * ngồi đó hiển thị dữ liệu của kỳ vừa rời khỏi, mà nhìn thì không biết. */
    if (SO_MO && MAN !== 'tuan' && MAN !== 'thang') dongSo();
    if (MAN === 'toan-phong') return await veToanPhong(el);
    if (MAN === 'can-ho-tro') return await veCanHoTro(el);
    if (MAN === 'theo-doi') return await veTheoDoi(el);
    if (MAN === 'thiet-lap') return await veThietLap(el);
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
  if (SO_MO && DU.tongHop) moSo('Chi tiết kỳ', DU.nhan || '', soKy(DU));
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
        '<th style="width:70px" title="Số sản phẩm của dòng này: 3 bài đăng, 500 ảnh… Để trống = 1">SL</th>' +
        '<th style="width:172px">Tiến độ</th>' +
        '<th style="min-width:170px">Ghi chú công việc</th>' +
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
    /* Số lượng: 500 ảnh hậu kỳ hay 4 bài đăng là MỘT dòng việc. Không có ô này
     * thì chuẩn sản lượng theo vị trí không đếm được. Trống = 1. */
    '<td data-nhan="Số lượng" class="so-o"><input class="v-sl" type="number" min="1" step="1" value="' +
      esc(Number(d.soLuong) > 0 ? d.soLuong : '') + '" placeholder="1"></td>' +
    '<td data-nhan="Tiến độ"><div class="td-o">' +
      '<input class="v-pt" type="range" min="0" max="100" step="5" value="' + pt + '">' +
      '<span class="pt' + (pt >= 100 ? ' du' : '') + '">' + pt + '%</span>' +
    '</div></td>' +
    /* Không chữ gợi ý: cột đã có tiêu đề "GHI CHÚ CÔNG VIỆC" ngay trên đầu, và ô
     * này chỉ cao một dòng nên câu gợi ý dài bị cắt làm đôi, nhìn như lỗi. */
    '<td data-nhan="Ghi chú công việc"><textarea class="v-td" rows="1">' +
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
 * Trang chính của kỳ tuần/tháng nay trông GIỐNG kỳ ngày: cùng thẻ kỳ ở trên,
 * cùng dải chip số, rồi tới phần tự viết. Anh Hùng: "phía trên thì thông tin để
 * như báo cáo ngày, để khi chuyển qua không quá ngộp về giao diện."
 *
 * Ba bảng dữ liệu — đầu việc, các ngày đã nộp, những gì đã viết — dời hết vào
 * Sổ bên phải, bấm mới mở: "ấn mở ra thì mới mở ra, không cần hiện tràn ra".
 */
/**
 * Dải "so với tháng trước" — chỉ hiện ở báo cáo THÁNG.
 *
 * Hai con số anh Hùng chọn: tổng giờ và % định mức. Không tô màu cho giờ —
 * nhiều giờ hơn chưa chắc là tốt hơn (có thể chỉ là tháng đó nhiều ngày làm
 * hơn), nên để số trần, ai đọc tự hiểu. Chỉ % định mức mới tô, vì nó đã chia
 * cho định mức của chính những ngày đã nộp nên so được thẳng.
 *
 * Tháng trước trống trơn thì NÓI THẲNG là chưa có gì để so. Vẽ "-100%" ở đó là
 * bịa: hồi tháng 8 phòng chưa dùng app, không phải cả phòng nghỉ việc.
 */
function daiSoSanh(t) {
  const s = t && t.kyTruoc;
  if (!s) return '';
  const vach = 'style="width:100%;border-top:1px solid var(--border);' +
    'padding-top:9px;margin-top:3px"';
  if (!s.coDuLieu) {
    return '<div class="nho phu" ' + vach + '>' + esc(s.nhan) +
      ' chưa có báo cáo nào — chưa so được.</div>';
  }
  const m = (nhan, gt, mau) => '<span class="m ' + (mau || '') + '">' +
    esc(nhan) + ' <b>' + esc(gt) + '</b></span>';
  /* Nói rõ đang so bao nhiêu ngày với bao nhiêu ngày. Thiếu câu này thì người
   * đọc mặc định là hai tháng trọn vẹn, và mọi kết luận rút ra đều lệch. */
  const pham = s.dayDu ? 'cả tháng' : s.soNgay + ' ngày đầu';
  return '<div class="dai-so" ' + vach + '>' +
    '<span class="nho phu">So với ' + esc(s.nhan) + ' (' + esc(pham) + '):</span>' +
    m('Tổng giờ', s.chenhGio + ' · ' + s.tongGio) +
    (s.chenhPhanTram == null
      ? m('Định mức', 'chưa đo được')
      : m('Định mức', (s.chenhPhanTram > 0 ? '+' : '') + s.chenhPhanTram +
        ' điểm · ' + s.phanTram + '%',
      s.chenhPhanTram > 0 ? 'xanh' : s.chenhPhanTram < 0 ? 'cam' : '')) +
  '</div>';
}

function theTongHop(d) {
  const t = d.tongHop;
  if (!t) return '';
  const m = (nhan, gt, mau) => '<span class="m ' + (mau || '') + '">' +
    esc(nhan) + ' <b>' + esc(gt) + '</b></span>';

  return '<div class="the"><div class="the-than" ' +
    'style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
      '<div class="dai-so">' +
        m('Đã nộp', t.soPhieuNgay + ' ngày', t.ngayThieu.length ? 'cam' : 'xanh') +
        m('Tổng', t.tongGio) +
        m('Định mức', t.phanTram == null ? '—' : t.phanTram + '%',
          t.phanTram == null ? '' : t.phanTram >= 100 ? 'xanh' : t.phanTram < 80 ? 'cam' : '') +
        m('Đầu việc', t.viec.length) +
        (t.ngayThieu.length ? m('Chưa nộp', t.ngayThieu.length + ' ngày', 'do') : '') +
      '</div>' +
      '<div class="lon"></div>' +
      '<button class="btn nho chinh" id="btnSo">Chi tiết kỳ →</button>' +
      daiSoSanh(t) +
    '</div></div>';
}

/* ==================================================================
   SỔ BÊN PHẢI
   ================================================================== */

let SO_MO = false;

/**
 * Mở Sổ.
 *
 * Đóng/mở bằng một lớp trên <body> chứ không bằng `hidden`: Sổ là CỘT THẬT nên
 * nó cần co giãn được để trượt, mà `hidden` thì nhảy cái một. Cột nội dung tự
 * hẹp lại nhờ flex — mọi lưới trong app đều dùng auto-fit nên chúng xếp lại
 * theo bề ngang mới mà không cần biết tới Sổ.
 */
function moSo(tieuDe, phu, than) {
  $('#soTieuDe').textContent = tieuDe;
  $('#soPhu').textContent = phu || '';
  $('#soThan').innerHTML = than;
  document.body.classList.add('so-mo');
  SO_MO = true;
  $('#soThan').scrollTop = 0;
  /* Gắn ngay sau khi đổ HTML: nội dung sổ vẽ lại mỗi lần mở, nên tay nghe cũng
   * phải gắn lại mỗi lần — gắn một lần lúc khởi động thì mở sổ lần hai là mấy
   * dòng ngày bấm không ra gì. */
  ganMoNgay($('#soThan'));
  capNhatNutSo();
}

function dongSo() {
  document.body.classList.remove('so-mo');
  SO_MO = false;
  capNhatNutSo();
}

/* Nút đổi chữ theo trạng thái: mở rồi mà nút vẫn ghi "Chi tiết kỳ →" thì bấm
 * lần nữa người ta không đoán được chuyện gì sẽ xảy ra. */
function capNhatNutSo() {
  const b = $('#btnSo');
  if (b) b.textContent = SO_MO ? 'Đóng chi tiết' : 'Chi tiết kỳ →';
}

/* Gắn một lần lúc khởi động, không gắn lại mỗi lần vẽ — gắn lại thì mỗi lần
 * chuyển tab lại chồng thêm một tay nghe phím. */
function ganSo() {
  $('#soDong').onclick = dongSo;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && SO_MO) dongSo();
  });
}

/** Một mục đóng/mở được trong sổ. `mo` = mở sẵn khi vừa bật sổ. */
function muc(ten, dem, than, mo) {
  return '<details class="muc"' + (mo ? ' open' : '') + '>' +
    '<summary>' + esc(ten) +
      (dem == null ? '' : '<span class="dem">' + esc(dem) + '</span>') +
    '</summary>' +
    '<div class="muc-than">' + than + '</div></details>';
}

/**
 * Nội dung sổ cho kỳ tuần/tháng.
 *
 * Anh Hùng xem bản đầu rồi chốt lại thứ tự (28/09): "nhìn vào là biết dành bao
 * nhiêu thời gian cho các nhóm công việc nào" — nên PHÂN BỔ THỜI GIAN lên đầu,
 * không phải danh sách đầu việc. Danh sách từng đầu việc thì anh bảo thẳng là
 * "liệt kê vào cũng không có ý nghĩa mấy", nên bỏ hẳn: nó dài nhất trang mà
 * không trả lời câu hỏi nào người ta thật sự hỏi khi ngồi viết nhận định tuần.
 *
 * Còn lại đúng ba mục, theo đúng việc người ta làm: nhìn thời gian đi đâu → đọc
 * lại chính mình đã viết gì → soi lại từng ngày nếu cần.
 */
function soKy(d) {
  const t = d.tongHop;
  if (!t) return '<p class="phu">Chưa có dữ liệu cho kỳ này.</p>';

  const choAI = '<div class="cho-ai">Phần nhận xét bằng AI sẽ nằm ở đây. ' +
    'Hiện chưa nối — nhận định tự động bên dưới do luật sinh, đọc từ chính số ' +
    'liệu của kỳ.</div>';

  const dung = t.theoNgay.filter((n) => n.trangThaiHan !== 'tre').length;
  const tre = t.theoNgay.length - dung;

  return choAI +
    muc('Thời gian đã dành cho việc gì', t.tongGio, phanBoThoiGian(t), true) +
    muc('Nhận định & kế hoạch đã viết', t.daViet.length + ' ghi chú',
      bangDaViet(t), true) +
    muc('Nhật ký nộp báo cáo',
      dung + ' đúng hạn' + (tre ? ' · ' + tre + ' trễ' : '') +
      (t.ngayThieu.length ? ' · ' + t.ngayThieu.length + ' chưa nộp' : ''),
      bangNgay(t));
}

/**
 * Thời gian của kỳ đi vào những nhóm việc nào — câu hỏi anh Hùng đặt nguyên
 * văn: "nhìn vào là biết dành bao nhiêu thời gian cho các nhóm công việc nào".
 *
 * Nên mỗi dòng phải có ĐỦ BA thứ: tên nhóm, số giờ, và phần trăm của tổng.
 * Thiếu phần trăm thì "12 giờ" không nói được nó là nửa kỳ hay một góc nhỏ —
 * mà so sánh giữa các nhóm mới là thứ người ta nhìn.
 */
function phanBoThoiGian(t) {
  if (!t.theoNhom.length) {
    return '<p class="phu">Chưa có dòng việc nào trong kỳ — nộp báo cáo từng ngày ' +
      'trước, phần này tự cộng lại.</p>';
  }
  const tong = Math.max(1, t.tongPhut);
  const lonNhat = Math.max(1, t.theoNhom[0].phut);
  return '<div class="pb">' + t.theoNhom.map((n) => {
    const pt = Math.round((n.phut / tong) * 100);
    return '<div class="pb-d">' +
      '<div class="pb-ten">' + esc(n.ten) + '</div>' +
      '<div class="thanh"><i style="width:' +
        Math.round((n.phut / lonNhat) * 100) + '%"></i></div>' +
      '<div class="pb-so">' + esc(n.gio) + '<span class="pb-pt">' + pt + '%</span></div>' +
    '</div>';
  }).join('') +
  '<div class="pb-tong">Tổng <b>' + esc(t.tongGio) + '</b>' +
    (t.dinhMucGio ? ' · định mức ' + esc(t.dinhMucGio) : '') +
    (t.phanTram == null ? '' : ' · <b>' + t.phanTram + '%</b>') + '</div>' +
  '</div>';
}

/**
 * Nhật ký nộp: ngày nào đúng hạn, ngày nào trễ, ngày nào bỏ trống — và bấm vào
 * một ngày là đọc đúng những gì đã báo cáo hôm đó.
 *
 * Anh Hùng: "liệt kê nhẹ các công việc báo cáo đúng ngày và không đúng deadline,
 * ấn vào xem được nội dung đã báo cáo là gì" (28/09). Nên mặt ngoài phải NHẸ —
 * một dòng một ngày, không bảng nhiều cột — còn nội dung thì giấu bên trong,
 * mở ra khi cần.
 *
 * Nạp khi bấm, không nạp sẵn: mở sổ tháng mà gọi hai mươi lượt mạng cho hai
 * mươi ngày thì chậm, mà phần lớn không ai mở tới.
 */
function bangNgay(t) {
  if (!t.theoNgay.length && !t.ngayThieu.length) {
    return '<p class="phu">Chưa có ngày nào trong kỳ.</p>';
  }
  return '<div class="nk">' + t.theoNgay.map((n) =>
    '<details class="nk-d"><summary>' +
      '<span class="nk-ten">' + esc(n.nhan) + '</span>' +
      '<span class="nk-so">' + esc(n.tongGio) + ' · ' + n.soViec + ' việc</span>' +
      (n.trangThaiHan === 'tre'
        ? '<span class="nhan-tt cam">' + esc(n.veHan) + '</span>'
        : '<span class="nhan-tt xanh">đúng hạn</span>') +
    '</summary>' +
    '<div class="nk-than" data-ngay="' + n.tu + '">' +
      '<p class="phu">Đang mở…</p></div></details>').join('') + '</div>' +
    (t.ngayThieu.length
      ? '<p class="nho" style="margin:10px 0 0">Chưa nộp: ' +
        t.ngayThieu.map((x) => '<span class="nhan-tt do" style="margin-right:4px">' +
          esc(x.nhan) + '</span>').join('') + '</p>'
      : '');
}

/* Ngày nào đã mở rồi thì giữ lại, đóng mở lần nữa không gọi mạng lại. */
const NGAY_DA_MO = new Map();

/**
 * Bấm mở một ngày trong nhật ký -> nạp đúng phiếu hôm đó rồi vẽ nội dung.
 *
 * Gắn bằng uỷ quyền trên cả sổ, không gắn từng dòng: sổ vẽ lại mỗi lần đổi kỳ,
 * mà gắn từng dòng thì mỗi lần vẽ lại chồng thêm một tay nghe.
 */
function ganMoNgay(goc) {
  $$('.nk-d', goc).forEach((el) => {
    el.addEventListener('toggle', async () => {
      if (!el.open) return;
      const than = $('.nk-than', el);
      const moc = Number(than && than.dataset.ngay);
      if (!than || !moc || than.dataset.xong === '1') return;
      if (NGAY_DA_MO.has(moc)) { than.innerHTML = NGAY_DA_MO.get(moc); than.dataset.xong = '1'; return; }
      try {
        const d = await goi('/api/phieu?ky=ngay&moc=' + moc);
        const html = chiTietPhieu(d);
        NGAY_DA_MO.set(moc, html);
        than.innerHTML = html;
        than.dataset.xong = '1';
      } catch (e) {
        than.innerHTML = '<p class="phu">Không đọc được ngày này: ' + esc(e.message) + '</p>';
      }
    });
  });
}

/**
 * Nội dung MỘT phiếu đã nộp: làm những việc gì, và đã viết gì.
 *
 * Dùng chung cho hai chỗ — mở một ngày trong nhật ký, và mở một dòng trong tab
 * "Đã nộp". Một bản vẽ duy nhất thì hai nơi không bao giờ hiện hai kiểu.
 */
function chiTietPhieu(d) {
  const p = d.phieu || {};
  const dong = d.dong || [];
  const oChu = (nhan, chu) => (String(chu || '').trim()
    ? '<div class="ct-o"><div class="o-nhan">' + esc(nhan) + '</div>' +
      '<div class="ct-chu">' + esc(chu) + '</div></div>' : '');

  /* Thẻ chứ không phải bảng: chỗ này nằm trong cột sổ chỉ rộng chừng 320px, mà
   * tên việc thì dài ("TOUR CÁP TREO HÒN THƠM 2 CHIỀU_26.9_C NGỌC…"). Nhét vào
   * bảng bốn cột là mỗi ô còn mấy chục pixel, chữ vỡ dọc thành từng chữ cái.
   * Thẻ thì tên chạy hết chiều ngang, số nằm gọn một hàng dưới. */
  const bang = dong.length
    ? '<div class="ct-ds">' + dong.map((v) => '<div class="ct-v">' +
        '<div class="ct-v-ten">' + esc(v.congViec || '—') + '</div>' +
        '<div class="ct-v-so">' +
          '<span>' + esc(v.nhom || 'Khác') + '</span>' +
          '<span>' + (Number(v.phut) || 0) + ' phút</span>' +
          '<span>' + (v.tienDoPt == null ? '—' : v.tienDoPt + '%') + '</span>' +
          (v.trangThai ? '<span class="nhan-tt ' +
            (v.trangThai === 'Hoàn thành' ? 'xanh' : 'xam') + '">' +
            esc(v.trangThai) + '</span>' : '') +
        '</div>' +
        (String(v.tienDo || '').trim()
          ? '<div class="ct-v-gc">' + esc(v.tienDo) + '</div>' : '') +
      '</div>').join('') + '</div>'
    : '<p class="phu">Không có dòng việc nào.</p>';

  const chu = oChu('Nhận định', p.nhanDinh) + oChu('Kế hoạch', p.keHoach) +
    oChu('Cần hỗ trợ & vấn đề gặp phải', p.canHoTro) +
    (String(p.linkVideo || '').trim()
      ? '<div class="ct-o"><div class="o-nhan">Link video</div>' +
        '<div class="ct-chu">' + esc(p.linkVideo) + '</div></div>' : '');

  return '<div class="ct-dau">' +
      '<span class="m">Tổng <b>' + esc(p.tongGio || '0 phút') + '</b></span>' +
      '<span class="m">Định mức <b>' +
        (p.phanTram == null ? '—' : p.phanTram + '%') + '</b></span>' +
      (p.daNop ? '<span class="m">Nộp lúc <b>' + esc(veLuc(p.nopLuc)) + '</b></span>'
        : '<span class="nhan-tt cam">Còn là nháp</span>') +
    '</div>' + bang + (chu || '');
}

/**
 * Mọi câu người đã tự viết trong kỳ, gom một chỗ kèm ngày.
 *
 * Đây là thứ ảnh chụp màn hình không bao giờ cho được: muốn đọc lại bảy ngày
 * thì phải mở bảy tấm ảnh. Có nó thì viết nhận định tuần chỉ còn là đọc lại
 * chính mình rồi rút gọn.
 */
function bangDaViet(t) {
  if (!t.daViet.length) {
    return '<p class="phu">Chưa viết ghi chú nào trong kỳ. Mấy dòng ghi chú tiến ' +
      'độ mỗi ngày chính là nguyên liệu để viết nhận định tuần.</p>';
  }
  return '<div class="da-viet">' + t.daViet.map((g) => '<div class="dv">' +
    '<div class="dv-dau"><span class="dv-ngay">' + esc(g.ngay) + '</span>' +
    '<span class="dv-loai">' + esc(g.loai) + '</span></div>' +
    '<div class="dv-chu">' + esc(g.chu) + '</div>' +
  '</div>').join('') + '</div>';
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

  /* Nhãn gọi đúng tên kỳ đang đứng. "Kế hoạch kỳ sau" là chữ của người viết
   * phần mềm, không phải chữ của người ngồi viết báo cáo: đứng ở màn tuần thì
   * trong đầu họ là "tuần sau", phải đọc thêm một nhịp mới dịch được "kỳ sau"
   * là gì. Anh Hùng gọi tên từng cái (28/09). */
  const nhan = loaiKy === 'tuan'
    ? { nd: 'Nhận định tuần này', kh: 'Kế hoạch tuần sau' }
    : loaiKy === 'thang'
      ? { nd: 'Nhận định tháng này', kh: 'Kế hoạch tháng sau' }
      : { nd: 'Nhận định', kh: 'Kế hoạch công việc tiếp theo' };

  return '<div class="the"><div class="the-dau"><h2>Đánh giá báo cáo</h2></div>' +
    '<div class="the-than viec-ds">' +
      o(nhan.nd, 'txNhanDinh', p.nhanDinh) +
      o(nhan.kh, 'txKeHoach', p.keHoach) +
      video +
      /* Gọi cả "vấn đề gặp phải": chỉ ghi "Cần hỗ trợ" thì người ta hiểu là ô
       * để xin việc gì đó, nên vướng mắc tự gỡ được lại không ai ghi — mà đó
       * mới là thứ quản lý cần đọc. */
      o('Cần hỗ trợ & vấn đề gặp phải', 'txHoTro', p.canHoTro) +
    '</div></div>';
}

function theLuu(d) {
  const daNop = d.phieu && d.phieu.daNop;
  return '<div class="the"><div class="the-than" ' +
    'style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
    '<button class="btn chinh" id="btnNop">' + (daNop ? 'Cập nhật báo cáo' : 'Nộp báo cáo') + '</button>' +
    // Không còn nút Lưu nháp (28/09): phiếu chưa nộp tự lưu nháp liên tục
    '<span class="nho" id="ttTuLuu">' + (daNop ? '' : 'Tự lưu nháp khi có thay đổi') + '</span>' +
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
  /* Phiếu vừa vẽ từ dữ liệu máy chủ: chưa có gì chưa lưu. Không xoá cờ này thì
   * một lần tự lưu hỏng ở kỳ trước sẽ đem phiếu TRỐNG của kỳ mới đi lưu nháp. */
  BAN = false; clearTimeout(henTL);
  const dau = $('[data-buoc]');
  const buoc = Number(dau && dau.dataset.buoc) || 0;
  /* Đổi kỳ trước đây vẽ lại luôn, mất trắng những gì đang gõ mà không hỏi —
   * nay lưu nháp trước rồi mới đổi. */
  $('#btnLui').onclick = async () => { await luuTruocKhiDi(); doiMoc(-1, loaiKy, buoc); };
  $('#btnToi').onclick = async () => { await luuTruocKhiDi(); doiMoc(1, loaiKy, buoc); };
  $('#btnNay').onclick = async () => { await luuTruocKhiDi(); MOC = Date.now(); ve(); };
  const cn = $('#chonNgay');
  if (cn) cn.onchange = async () => { await luuTruocKhiDi(); MOC = tuISO(cn.value); ve(); };

  const bSo = $('#btnSo');
  if (bSo) {
    capNhatNutSo();
    bSo.onclick = () => (SO_MO ? dongSo() : moSo('Chi tiết kỳ', DU.nhan || '', soKy(DU)));
  }

  $('#btnNop').onclick = () => luu(true);
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
      soLuong: Number(($('.v-sl', tr) || {}).value || 0) || undefined,
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
/** Thân phiếu gửi lên /api/phieu — dùng chung cho nút Lưu/Nộp và tự lưu nháp. */
function thanPhieu(nop) {
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
  }
  return than;
}

async function luu(nop) {
  const than = thanPhieu(nop);
  if (nop && MAN === 'ngay' && !than.dong.length) return toast('Chưa có đầu việc nào để nộp.', 'do');
  clearTimeout(henTL);

  const nut = [$('#btnNop')].filter(Boolean);
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

/* ---------------- tự lưu nháp ----------------
 * Anh Hùng: "điều cần bấm nút lưu nháp để có thể lưu nháp, anh cần cơ chế tự
 * động lưu nháp khi có phát sinh thêm nhập liệu mới". Gõ / chọn / thêm-xoá dòng
 * xong 2,5 giây thì tự gửi đúng như bấm "Lưu nháp" — lặng lẽ, không vẽ lại màn
 * (đang gõ dở không mất con trỏ). Đổi kỳ / đổi tab / rời trang thì lưu ngay.
 *
 * CHỈ tự lưu phiếu CHƯA NỘP: phiếu đã nộp mà gửi nop:false là rút nó về nháp —
 * sửa phiếu đã nộp vẫn phải bấm "Cập nhật báo cáo" như cũ. */
let henTL = 0, dangTL = false, SUA = 0;
const tuLuuDuoc = () => !!(BAN && DU && DU.ky && $('#btnNop') && !(DU.phieu && DU.phieu.daNop));
function ttTuLuu(chu, loi) {
  const o = $('#ttTuLuu');
  if (!o) return;
  o.textContent = chu;
  o.classList.toggle('do', !!loi);
}
function henTuLuu() {
  if (!BAN) return;
  if (DU && DU.phieu && DU.phieu.daNop) return ttTuLuu('Có thay đổi — bấm "Cập nhật báo cáo" để lưu');
  if (!tuLuuDuoc()) return;
  SUA++;
  clearTimeout(henTL);
  ttTuLuu('Có thay đổi chưa lưu…');
  henTL = setTimeout(() => tuLuu(), 2500);
}
async function tuLuu(roiTrang) {
  clearTimeout(henTL); henTL = 0;
  if (!tuLuuDuoc() || dangTL) return;
  const moc = SUA;
  dangTL = true;
  ttTuLuu('Đang lưu nháp…');
  try {
    await goi('/api/phieu', { method: 'POST', body: JSON.stringify(thanPhieu(false)), keepalive: !!roiTrang });
    if (SUA === moc) BAN = false;
    if (DU.phieu) DU.phieu.daNop = false; else DU.phieu = { daNop: false };
    const g = new Date();
    ttTuLuu('Đã tự lưu nháp · ' + String(g.getHours()).padStart(2, '0') + ':' + String(g.getMinutes()).padStart(2, '0'));
  } catch (e) {
    ttTuLuu('Chưa tự lưu được — ' + e.message + '. Tự thử lại sau 15 giây', true);
    henTL = setTimeout(() => tuLuu(), 15000);
  } finally {
    dangTL = false;
    if (BAN && SUA !== moc) henTuLuu();
  }
}
/** Gọi trước mọi thao tác thay màn (đổi kỳ, đổi tab): còn gì chưa lưu thì lưu. */
async function luuTruocKhiDi() {
  if (BAN && tuLuuDuoc()) await tuLuu();
}
// Chạy SAU các handler của từng ô (onX gắn trên phần tử chạy trước khi sự kiện nổi lên document)
['input', 'change', 'click'].forEach((ev) =>
  document.addEventListener(ev, () => setTimeout(henTuLuu, 0)));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && BAN && tuLuuDuoc()) tuLuu(true);
});

/* ==================================================================
   MÀN ĐÃ NỘP (nhân sự)
   ================================================================== */
async function veDaNop(el) {
  const t = kyThangNay();
  const d = await goi('/api/danh-sach?tu=' + t.tu + '&den=' + t.den + '&moi=1');
  el.innerHTML = '<div class="the"><div class="the-dau"><h2>Báo cáo đã nộp</h2>' +
    '<span class="nho">' + veNgay(d.tu) + ' – ' + veNgay(d.den) + '</span></div>' +
    '<div class="the-than khit">' + (d.ds.length
      ? '<p class="nho" style="margin:0 0 8px">Bấm một dòng để xem lại đã báo cáo gì.</p>' +
        '<div class="cuon"><table class="bang-xem bam-duoc"><thead><tr><th>Kỳ</th><th>Loại</th>' +
        '<th class="so-o">Thời lượng</th><th class="so-o">Định mức</th>' +
        '<th>Nộp lúc</th><th>Hạn</th></tr></thead><tbody>' +
        d.ds.map((p) => '<tr data-xem-ky="' + esc(p.loaiKy) + '" data-xem-moc="' +
            (p.tu + 3600000) + '" data-xem-nhan="' + esc(p.nhan) + '">' +
          '<td>' + esc(p.nhan) + '</td>' +
          '<td><span class="nhan-tt xam">' +
            esc(p.loaiKy === 'ngay' ? 'Ngày' : p.loaiKy === 'tuan' ? 'Tuần' : 'Tháng') + '</span></td>' +
          '<td class="so-o">' + esc(p.tongGio) + '</td>' +
          '<td class="so-o">' + (p.phanTram == null ? '—' : p.phanTram + '%') + '</td>' +
          '<td>' + (p.daNop ? esc(veLuc(p.nopLuc)) : '<span class="nhan-tt cam">Nháp</span>') + '</td>' +
          '<td>' + nhanHan(p) + '</td>' +
        '</tr>').join('') + '</tbody></table></div>'
      : rong('Chưa có phiếu nào', 'Tháng này anh/chị chưa nộp báo cáo nào.')) +
    '</div></div>';

  /* Bấm một dòng -> mở sổ bên phải với đúng nội dung phiếu đó. Anh Hùng: "báo
   * cáo đã nộp cho phép ấn vào xem chi tiết" (28/09). Trước đây bảng này chỉ
   * có mấy con số, muốn đọc lại đã viết gì thì phải lùi ngày ở tab khác. */
  $$('[data-xem-moc]', el).forEach((tr) => {
    tr.onclick = async () => {
      const loai = tr.dataset.xemKy;
      const nhan = tr.dataset.xemNhan;
      moSo(nhan, loai === 'ngay' ? 'Báo cáo ngày' : loai === 'tuan' ? 'Báo cáo tuần' : 'Báo cáo tháng',
        '<p class="phu">Đang mở…</p>');
      try {
        const chiTiet = await goi('/api/phieu?ky=' + loai + '&moc=' + tr.dataset.xemMoc);
        moSo(nhan, loai === 'ngay' ? 'Báo cáo ngày' : loai === 'tuan' ? 'Báo cáo tuần' : 'Báo cáo tháng',
          chiTietPhieu(chiTiet) +
          /* Phiếu tuần/tháng không có dòng việc của riêng nó — số là máy cộng từ
           * các ngày. Nên kèm luôn phần tổng hợp, khỏi phải sang tab khác. */
          (chiTiet.tongHop ? soKy(chiTiet) : ''));
      } catch (e) {
        moSo(nhan, '', '<p class="phu">Không đọc được phiếu này: ' + esc(e.message) + '</p>');
      }
    };
  });
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

/* Lọc ở màn Cần hỗ trợ — giữ ngoài hàm để đổi tab rồi quay lại vẫn đúng chỗ. */
let HT_LOC = 'chua';

/**
 * Anh Hùng (30/09): "note giúp anh luôn là đã xử lý hay chưa", rồi "gửi cho nhân
 * sự biết khi vấn đề đã được xử lý hoặc chưa xử lý được tại thời điểm". Ba trạng
 * thái: Chưa xử lý · Chưa xử lý được (có lý do) · Đã xử lý. Mỗi lần chốt, bot
 * Marketing Hub nhắn RIÊNG cho người nêu — luôn gửi, không có ô tắt.
 */
async function veCanHoTro(el) {
  const t = mocTuan(Date.now());
  /* Nhìn rộng hơn một tuần: vướng mắc nêu tuần trước mà chưa gỡ thì vẫn là
   * vướng mắc, biến mất khỏi màn hình không làm nó tự hết. */
  const tu = t.tu - 21 * NGAY_MS;
  const d = await goi('/api/can-ho-tro?tu=' + tu + '&den=' + Date.now() + '&moi=1');
  const tt = (x) => x.trangThaiHT || (x.daXuLy ? 'xong' : 'chua');
  const soChua = d.ds.filter((x) => tt(x) !== 'xong').length;
  const thu = { chua: 0, 'chua-duoc': 1, xong: 2 };
  const ds = d.ds.filter((x) => HT_LOC === 'tat-ca' || (HT_LOC === 'chua' ? tt(x) !== 'xong' : tt(x) === 'xong'))
    .sort((x, y) => (thu[tt(x)] - thu[tt(y)]) || (y.tu - x.tu));
  const pill = (ma, chu) => '<button class="pill' + (HT_LOC === ma ? ' on' : '') + '" data-loc="' + ma + '">' + chu + '</button>';
  const nhan = {
    chua: '<span class="nhan-tt cam">Chưa xử lý</span>',
    'chua-duoc': '<span class="nhan-tt do">Chưa xử lý được</span>',
    xong: '<span class="nhan-tt xanh">Đã xử lý</span>',
  };
  const nut = (x, ma, chu, phu) => '<button class="btn nho' + (phu ? ' mo' : '') + ' ht-nut" data-rec="' +
    esc(x.recId) + '" data-tt="' + ma + '">' + chu + '</button>';

  /* Anh Hùng (30/09): thông báo MẶC ĐỊNH gửi — không còn ô tick "Nhắn cho…".
   * Bấm Đã xử lý / Chưa xử lý được là bot nhắn riêng cho người nêu. */
  const muc = (x) => {
    const s = tt(x);
    const kq = s !== 'chua' && (x.ghiChu || x.xuLyBoi)
      ? '<div class="ht-kq">' + (s === 'xong' ? '✔ ' : '⏳ ') + '<b>' + esc(x.ghiChu || 'Đã xử lý') + '</b>' +
        (x.xuLyBoi ? ' · ' + esc(x.xuLyBoi) : '') + (x.xuLyLuc ? ' · ' + esc(veNgay(x.xuLyLuc)) : '') +
        (x.daBaoLuc ? ' · đã nhắn cho ' + esc(x.ten) : '') + '</div>' : '';
    const tac = s === 'xong'
      ? '<div class="ht-tac"><div class="ht-nut-nhom">' + nut(x, 'mo-lai', 'Mở lại', true) + '</div></div>'
      : '<div class="ht-tac">' +
          '<input class="in ht-ghi" data-rec="' + esc(x.recId) + '" value="' + esc(x.ghiChu) + '" ' +
            'placeholder="Ghi chú cách xử lý / lý do chưa xử lý được">' +
          '<div class="ht-nut-nhom">' +
            nut(x, 'chua-duoc', s === 'chua-duoc' ? 'Cập nhật lý do' : 'Chưa xử lý được', false) +
            '<button class="btn nho chinh ht-nut" data-rec="' + esc(x.recId) + '" data-tt="xong">✓ Đã xử lý</button>' +
          '</div></div>';
    return '<div class="ht-muc ' + s + '">' +
      '<div class="ht-dau"><span class="ht-ten">' + esc(x.ten) + '</span>' +
        '<span class="ht-ngay">' + esc(x.loaiKy) + ' · ' + esc(x.nhan) + '</span>' +
        '<span class="ht-tt">' + nhan[s] + '</span></div>' +
      '<div class="ht-noi">' + esc(String(x.noi || '').trim()) + '</div>' + kq + tac +
    '</div>';
  };

  el.innerHTML = '<div class="the"><div class="the-dau"><h2>Vướng mắc cả phòng đang nêu</h2>' +
    '<span class="nho">bốn tuần gần đây · ' + d.ds.length + ' mục · ' +
      (soChua ? '<b style="color:var(--orange-text)">' + soChua + ' chưa xong</b>' : 'đã xử lý hết') + '</span>' +
    '<div class="lon"></div><div class="pills">' +
      pill('chua', 'Chưa xong') + pill('xong', 'Đã xử lý') + pill('tat-ca', 'Tất cả') +
    '</div></div>' +
    '<div class="the-than">' +
      '<div class="nho" style="margin-bottom:10px">Bấm <b>Đã xử lý</b> hoặc <b>Chưa xử lý được</b> — bot Marketing Hub ' +
        'sẽ nhắn riêng cho người nêu kèm ghi chú của bạn.</div>' +
      (ds.length ? '<div class="ht-ds">' + ds.map(muc).join('') + '</div>'
        : (d.ds.length
          ? rong(HT_LOC === 'chua' ? 'Không còn vướng mắc nào chưa xong' : 'Chưa có mục nào đã xử lý')
          : rong('Không ai nêu vướng mắc', 'Ô "Cần hỗ trợ" trong phiếu báo cáo đang trống ở mọi người.'))) +
    '</div></div>';

  $$('[data-loc]', el).forEach((b) => { b.onclick = () => { HT_LOC = b.dataset.loc; veCanHoTro(el); }; });
  $$('.ht-nut', el).forEach((b) => {
    b.onclick = async () => {
      const rec = b.dataset.rec;
      const o = $('.ht-ghi[data-rec="' + rec + '"]', el);
      if (b.dataset.tt === 'chua-duoc' && !(o && o.value.trim())) {
        if (o) o.focus();
        return toast('Ghi lý do chưa xử lý được để nhân sự biết', 'do');
      }
      b.disabled = true;
      try {
        const r = await goi('/api/can-ho-tro/xu-ly', { method: 'POST', body: JSON.stringify({
          recId: rec, trangThai: b.dataset.tt, ghiChu: o ? o.value : '',
          bao: b.dataset.tt !== 'mo-lai' }) });
        const chu = { xong: 'Đã ghi nhận xử lý', 'chua-duoc': 'Đã ghi chưa xử lý được', 'mo-lai': 'Đã mở lại' }[r.trangThai];
        if (r.bao && !r.bao.ok) toast(chu + ' — nhưng chưa nhắn được cho ' + r.nguoi + ': ' + r.bao.loi, 'do');
        else toast(chu + (r.bao && r.bao.ok ? ' · đã nhắn cho ' + r.nguoi : ''));
        veCanHoTro(el);
      } catch (e) { toast('Không lưu được: ' + e.message, 'do'); b.disabled = false; }
    };
  });
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

/**
 * Vẽ một thẻ Lark (JSON máy chủ sẽ gửi) thành HTML xem trước — nhìn ở đây thế
 * nào thì trong Lark ra thế ấy (trừ màu).
 */
function veTheLark(card, tenNguoi) {
  const md = (c) => esc(String(c || '').replace(/\\([*_~`\[\]])/g, '$1')
    .replace(/<at id=[^>]*><\/at>/g, '@' + (tenNguoi || 'người gửi'))
    .replace(/<font color='red'>(.*?)<\/font>/g, '$1'))
    .split('\n').join('<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const than = card.elements.map((e) => {
    if (e.tag === 'div') return '<div style="padding:10px 12px;line-height:1.7">' + md(e.text.content) + '</div>';
    if (e.tag === 'hr') return '<div style="border-top:1px solid var(--border)"></div>';
    if (e.tag === 'column_set') {
      return '<div style="display:flex;gap:8px;padding:6px 12px;' +
        (e.background_style === 'grey' ? 'background:rgba(127,127,127,.12)' : '') + '">' +
        e.columns.map((c) => '<div style="flex:' + c.weight + ';text-align:' +
          c.elements[0].text.text_align + '">' + md(c.elements[0].text.content) + '</div>').join('') +
        '</div>';
    }
    return '';
  }).join('');
  return '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;max-width:440px">' +
    '<div style="padding:10px 12px;color:#fff;font-weight:600;background:linear-gradient(90deg,#1fb5a8,#22c3e6)">' +
    esc(card.header.title.content) + '</div>' + than + '</div>';
}

/* ---------------- Thiết lập: gửi thông báo ----------------
 * Anh Hùng (30/09): "cho anh thiết lập gửi nhóm hay gửi cá nhân, hay điều chỉnh
 * mẫu, bật hay tắt. Lôi nó qua tab thiết lập thì đúng hơn". Lưu riêng (khoá
 * 'tin-nhom'), nút Lưu riêng — sửa mẫu tin không đụng tới chuẩn chấm. */
let TL_TIN_BAN = false;

function veKhoiTin() {
  const t = TL.tin;
  const nhan = (TL.coTheNhan || []).filter((u) => !t.nguoiNhan.some((x) => x.openId === u.openId));
  const coToi = TL.toi && TL.toi.openId && !t.nguoiNhan.some((x) => x.openId === TL.toi.openId);
  const pill = (on, attrs, chu) => '<button class="pill' + (on ? ' on' : '') + '" ' + attrs + '>' + esc(chu) + '</button>';
  const hop = (ten, id, on) => '<label style="display:flex;gap:8px;align-items:center;margin-bottom:6px">' +
    '<input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + esc(ten) + '</label>';
  return '<div class="the"><div class="the-dau"><h2>Gửi thông báo khi nộp báo cáo ngày</h2>' +
      '<span class="nho">' + (TL.tatCung ? 'Máy chủ đang TẮT CỨNG (BAO_CAO_TIN_NHOM=0)'
        : TL_TIN_BAN ? 'có chỉnh chưa lưu' : (t.bat ? 'đang bật' : 'đang tắt')) + '</span>' +
      '<div class="lon"></div>' +
      '<button class="btn nho mo" id="tnGui">Gửi thử cho tôi</button>' +
      '<button class="btn nho" id="tnLuu"' + (TL_TIN_BAN ? '' : ' disabled') + '>Lưu</button>' +
    '</div><div class="the-than" style="display:flex;flex-wrap:wrap;gap:24px">' +
      '<div style="flex:1 1 320px;min-width:0">' +
        '<label style="display:flex;gap:8px;align-items:center;margin-bottom:14px;font-weight:600">' +
          '<input type="checkbox" id="tnBat"' + (t.bat ? ' checked' : '') + '> Bật gửi thông báo</label>' +
        '<div class="nho" style="margin-bottom:6px">Gửi tới</div>' +
        '<div class="pills" style="margin-bottom:10px;display:inline-flex">' +
          pill(t.dich === 'nhom', 'data-dich="nhom"', 'Nhóm') +
          pill(t.dich === 'ca-nhan', 'data-dich="ca-nhan"', 'Cá nhân') +
          pill(t.dich === 'ca-hai', 'data-dich="ca-hai"', 'Cả hai') +
        '</div>' +
        (t.dich !== 'ca-nhan'
          ? '<div style="margin-bottom:12px"><div class="nho" style="margin-bottom:4px">Mã nhóm chat (để trống = Phòng MKT)</div>' +
            '<input id="tnNhom" value="' + esc(t.nhomId) + '" placeholder="' + esc(TL.nhomMacDinh) +
            '" style="width:100%;max-width:340px"></div>' : '') +
        (t.dich !== 'nhom'
          ? '<div style="margin-bottom:12px"><div class="nho" style="margin-bottom:4px">Người nhận riêng</div>' +
            (t.nguoiNhan.length ? t.nguoiNhan.map((u, i) =>
              '<span class="nhan-tt xam" style="margin:0 6px 6px 0;display:inline-flex;gap:6px;align-items:center">' +
                esc(u.ten || u.openId) + ' <a href="#" data-bo="' + i + '" title="Bỏ">✕</a></span>').join('')
              : '<div class="nho" style="margin-bottom:6px">Chưa có ai — chọn bên dưới.</div>') +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">' +
              (coToi ? '<button class="btn nho mo" id="tnThemToi">+ Tôi</button>' : '') +
              (nhan.length ? '<select id="tnChon"><option value="">+ Thêm người…</option>' +
                nhan.map((u) => '<option value="' + esc(u.openId) + '">' + esc(u.ten) + '</option>').join('') +
                '</select>' : '') +
            '</div></div>' : '') +
        '<div class="nho" style="margin:14px 0 4px">Mẫu tiêu đề — <code>{ten}</code> tên người, <code>{ngay}</code> ngày báo cáo</div>' +
        '<input id="tnTieuDe" value="' + esc(t.tieuDe) + '" style="width:100%;max-width:340px;margin-bottom:12px">' +
        hop('Tag người gửi', 'tnTag', t.tagNguoi) +
        hop('Hiện bảng Công việc | Tiến độ', 'tnBang', t.hienBang) +
        hop('Hiện dòng Đánh giá cuối thẻ (theo chuẩn bên dưới)', 'tnDG', t.hienDanhGia) +
        '<button class="btn nho mo" id="tnMacDinh" style="margin-top:6px">Mẫu mặc định</button>' +
      '</div>' +
      '<div style="flex:1 1 320px;min-width:0"><div class="nho" style="margin-bottom:6px">Xem trước</div>' +
        '<div id="tnXem"><span class="nho">Đang dựng thẻ mẫu…</span></div></div>' +
    '</div></div>';
}

function batKhoiTin(el) {
  const t = TL.tin;
  const doi = () => { TL_TIN_BAN = true; veThietLap(el); };
  $('#tnBat').onchange = (e) => { t.bat = e.target.checked; doi(); };
  $$('[data-dich]', el).forEach((b) => { b.onclick = () => { t.dich = b.dataset.dich; doi(); }; });
  const nh = $('#tnNhom'); if (nh) nh.onchange = () => { t.nhomId = nh.value.trim(); doi(); };
  $$('[data-bo]', el).forEach((a) => { a.onclick = (e) => { e.preventDefault(); t.nguoiNhan.splice(Number(a.dataset.bo), 1); doi(); }; });
  const toiB = $('#tnThemToi'); if (toiB) toiB.onclick = () => { t.nguoiNhan.push({ ten: TL.toi.ten, openId: TL.toi.openId }); doi(); };
  const ch = $('#tnChon');
  if (ch) ch.onchange = () => {
    const u = TL.coTheNhan.find((x) => x.openId === ch.value);
    if (u) { t.nguoiNhan.push({ ten: u.ten, openId: u.openId }); doi(); }
  };
  $('#tnTieuDe').onchange = (e) => { t.tieuDe = e.target.value; doi(); };
  $('#tnTag').onchange = (e) => { t.tagNguoi = e.target.checked; doi(); };
  $('#tnBang').onchange = (e) => { t.hienBang = e.target.checked; doi(); };
  $('#tnDG').onchange = (e) => { t.hienDanhGia = e.target.checked; doi(); };
  $('#tnMacDinh').onclick = () => {
    Object.assign(t, { tieuDe: TL.tinMacDinh.tieuDe, tagNguoi: true, hienBang: true, hienDanhGia: true }); doi();
  };
  $('#tnLuu').onclick = async (e) => {
    if (t.bat && t.dich !== 'nhom' && !t.nguoiNhan.length) return toast('Chọn ít nhất một người nhận riêng', 'do');
    e.target.disabled = true;
    try {
      const r = await goi('/api/thiet-lap/tin', { method: 'POST', body: JSON.stringify({ tin: t }) });
      TL.tin = r.tin; TL_TIN_BAN = false;
      toast('Đã lưu — áp từ lần nộp báo cáo tiếp theo');
      veThietLap(el);
    } catch (er) { toast('Lưu hỏng: ' + er.message, 'do'); e.target.disabled = false; }
  };
  $('#tnGui').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const d = await goi('/api/thu-tin-nhom', { method: 'POST', body: JSON.stringify({ tin: t, gui: true }) });
      toast('Đã gửi thử cho ' + (d.nguoiNhan || 'bạn') + (d.guiTu ? ' · ' + d.guiTu : ''));
    } catch (er) { toast('Gửi thử hỏng: ' + er.message, 'do'); }
    e.target.disabled = false;
  };
  /* Xem trước theo bản ĐANG sửa, chưa cần lưu. */
  goi('/api/thu-tin-nhom', { method: 'POST', body: JSON.stringify({ tin: t, gui: false }) })
    .then((d) => {
      const x = $('#tnXem'); if (!x) return;
      x.innerHTML = veTheLark(d.card, d.ten) +
        '<div class="nho" style="margin-top:6px">Mẫu lấy từ phiếu nộp gần nhất · sẽ gửi tới ' + d.soDich + ' nơi</div>';
    })
    .catch((er) => { const x = $('#tnXem'); if (x) x.innerHTML = '<span class="nho">' + esc(er.message) + '</span>'; });
}

/* ==================================================================
   THIẾT LẬP CHUẨN THEO VỊ TRÍ (quản lý)
   ==================================================================
 * Anh Hùng (30/09/2026): chuẩn chung 80% việc chính / 20% việc phụ, cộng chỉ
 * tiêu sản lượng từng vị trí. Thiết lập theo VỊ TRÍ, không theo tên người —
 * nhân sự đổi thì chỉ sửa cột "Vị trí" ở bảng Phân quyền của hub.
 *
 * Toàn bộ màn vẽ lại từ biến TL; mỗi ô nhập ghi thẳng vào TL qua data-*. Không
 * đọc ngược từ DOM lúc lưu, để thứ đang thấy và thứ được lưu là một. */
let TL = null;          // { chuan, macDinh, nhomViec, nhomBo, soNguoi }
let TL_THU = null;      // kết quả chấm thử gần nhất
let TL_BAN = false;     // có chỉnh chưa lưu

async function veThietLap(el) {
  if (!TL) {
    TL = await goi('/api/thiet-lap');
    TL.chuan = JSON.parse(JSON.stringify(TL.chuan));
    TL.tin = JSON.parse(JSON.stringify(TL.tin));
  }
  const c = TL.chuan;
  const chip = (on, attrs, chu) => '<button type="button" class="pill tl-chip' + (on ? ' on' : '') + '" ' +
    attrs + '>' + esc(chu) + '</button>';
  const nhomChon = TL.nhomViec.filter((n) => !TL.nhomBo.includes(n));
  const oSo = (attrs, v, rong, buoc) => '<input type="number" class="tl-so" ' + attrs + ' value="' + esc(v) +
    '" min="0" step="' + (buoc || 1) + '" style="width:' + (rong || 70) + 'px">';
  const hop = 'display:flex;flex-wrap:wrap;gap:6px';

  const theVT = Object.entries(c.viTri).map(([vt, v]) => {
    const n = (TL.soNguoi || {})[vt] || 0;
    const dv = 'data-vt="' + esc(vt) + '"';
    return '<div class="the"><div class="the-dau"><h2>' + esc(vt) + '</h2>' +
      '<span class="nho">' + (n ? 'đang áp cho ' + n + ' người' : 'chưa ai có vị trí này') + '</span>' +
      '<div class="lon"></div>' +
      '<button class="btn nho mo tl-xoa-vt" ' + dv + ' title="Bỏ vị trí này">Bỏ</button>' +
    '</div><div class="the-than">' +
      '<div class="nho" style="margin-bottom:6px">Nhóm việc tính là <b>việc chính</b></div>' +
      '<div style="' + hop + ';margin-bottom:14px">' +
        nhomChon.map((nh) => chip(v.nhomChinh.includes(nh), dv + ' data-chinh="' + esc(nh) + '"', nh)).join('') +
      '</div>' +
      '<div class="nho" style="margin-bottom:6px">Sản lượng tối thiểu mỗi ngày</div>' +
      (v.sanLuong.length ? v.sanLuong.map((sl, i) => {
        const a = dv + ' data-i="' + i + '"';
        return '<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px">' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px">' +
            '<input class="tl-ten" ' + a + ' value="' + esc(sl.ten) + '" placeholder="tên, vd video" style="width:130px">' +
            '<span class="nho">tối thiểu</span>' + oSo(a + ' data-k="toiThieu"', sl.toiThieu, 80, 0.5) +
            '<select class="tl-dem" ' + a + '>' +
              '<option value="san-pham"' + (sl.dem !== 'dong' ? ' selected' : '') + '>sản phẩm (tiến độ × số lượng)</option>' +
              '<option value="dong"' + (sl.dem === 'dong' ? ' selected' : '') + '>đầu việc (đếm dòng)</option>' +
            '</select>' +
            /* Nguồn: app Chỉnh ảnh đã đếm sẵn số ảnh/video từng lô — lấy số lớn
             * hơn giữa báo cáo và app, người quên ghi SL vẫn được tính đủ. */
            '<select class="tl-nguon" ' + a + '>' +
              '<option value="bao-cao"' + (!sl.nguon || sl.nguon === 'bao-cao' ? ' selected' : '') + '>chỉ từ báo cáo</option>' +
              '<option value="chinh-anh-anh"' + (sl.nguon === 'chinh-anh-anh' ? ' selected' : '') + '>+ số ảnh từ app Chỉnh ảnh</option>' +
              '<option value="chinh-anh-video"' + (sl.nguon === 'chinh-anh-video' ? ' selected' : '') + '>+ số video từ app Chỉnh ảnh</option>' +
            '</select>' +
            '<div class="lon"></div><button class="btn nho mo tl-xoa-sl" ' + a + '>✕</button>' +
          '</div>' +
          '<div style="' + hop + '">' +
            chip(sl.nhom.includes('*'), a + ' data-sln="*"', 'mọi nhóm') +
            nhomChon.map((nh) => chip(sl.nhom.includes(nh), a + ' data-sln="' + esc(nh) + '"', nh)).join('') +
          '</div></div>';
      }).join('') : '<div class="nho" style="margin-bottom:8px">Chưa đặt chỉ tiêu sản lượng — chỉ chấm phân bổ thời gian.</div>') +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
        '<button class="btn nho mo tl-them-sl" ' + dv + '>+ Thêm chỉ tiêu</button>' +
        (v.sanLuong.length > 1
          ? '<div class="pills">' +
            '<button class="pill tl-che' + (v.cheDo !== 'mot-trong' ? ' on' : '') + '" ' + dv + ' data-che="tat-ca">Phải đạt tất cả</button>' +
            '<button class="pill tl-che' + (v.cheDo === 'mot-trong' ? ' on' : '') + '" ' + dv + ' data-che="mot-trong">Đạt một trong</button>' +
            '</div>' : '') +
      '</div>' +
      veThuVT(vt) +
    '</div></div>';
  }).join('');

  el.innerHTML = veKhoiTin() +
    '<div class="the"><div class="the-dau"><h2>Chuẩn chung mọi vị trí</h2>' +
      '<span class="nho">' + (TL_BAN ? 'có chỉnh chưa lưu' : 'đã lưu trên Base') + '</span><div class="lon"></div>' +
      '<button class="btn nho mo" id="tlMacDinh">Về mặc định</button>' +
      '<button class="btn nho mo" id="tlThu">Chấm thử 30 ngày</button>' +
      '<button class="btn nho" id="tlLuu"' + (TL_BAN ? '' : ' disabled') + '>Lưu</button>' +
    '</div><div class="the-than">' +
      '<div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;margin-bottom:14px">' +
        '<label>Việc chính tối thiểu ' + oSo('data-g="chinhToiThieu"', c.chinhToiThieu) + ' %</label>' +
        '<label>Việc phụ tối đa ' + oSo('data-g="phuToiDa"', c.phuToiDa) + ' %</label>' +
        '<label title="Lệch chuẩn trong biên này là Lưu ý, quá biên là Lệch">Biên lưu ý ' +
          oSo('data-g="bien"', c.bien) + ' điểm</label>' +
      '</div>' +
      '<div class="nho" style="margin-bottom:6px">Nhóm việc tính là <b>việc phụ</b></div>' +
      '<div style="' + hop + ';margin-bottom:12px">' +
        nhomChon.map((nh) => chip(c.nhomPhu.includes(nh), 'data-phu="' + esc(nh) + '"', nh)).join('') +
      '</div>' +
      '<div class="nho" style="margin-bottom:12px">"' + esc(TL.nhomBo.join(', ')) +
        '" không tính vào chuẩn — máy hỏng, mất điện không phải lỗi phân bổ.</div>' +
      /* Lời nhắn ngắn ở cuối thẻ — anh Hùng 30/09: "đơn giản thôi". */
      '<div class="nho" style="margin:14px 0 6px">Lời nhắn cuối thẻ</div>' +
      [['tot', '✅ Tốt'], ['luuY', '⚠️ Cần lưu ý'], ['lech', '⚠️ Lệch nhiều'], ['tre', '⏰ Nộp trễ'],
        ['loiMay', '⚙️ Có lỗi máy / mất điện ({phut} = số phút)']].map(([k, nhan]) =>
        '<label style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">' +
          '<span style="width:230px">' + esc(nhan) + '</span>' +
          '<input class="tl-ln" data-ln="' + k + '" value="' + esc((c.loiNhan || {})[k] || '') +
          '" style="flex:1 1 260px;min-width:0"></label>').join('') +
      (TL_THU ? '<div class="nho" style="margin-top:12px">Chấm thử ' + TL_THU.soPhieu + ' phiếu ngày trong ' +
        TL_THU.soNgay + ' ngày qua' +
        (TL_THU.khongVT ? ' · ' + TL_THU.khongVT + ' phiếu của người chưa có vị trí có chuẩn, bỏ qua' : '') +
        '. Kết quả ở cuối từng vị trí.</div>' : '') +
    '</div></div>' +
    theVT +
    '<div class="the"><div class="the-than" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<input id="tlVTMoi" placeholder="Tên vị trí, đúng như cột Vị trí ở Phân quyền" style="width:300px;max-width:100%">' +
      '<button class="btn nho mo" id="tlThemVT">+ Thêm vị trí</button>' +
      '<span class="nho">Người có vị trí không nằm trong danh sách thì không được chấm.</span>' +
    '</div></div>';

  const doi = () => { TL_BAN = true; TL_THU = null; veThietLap(el); };
  const vtCua = (b) => c.viTri[b.dataset.vt];
  const bat = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); else arr.push(x); };

  $$('[data-g]', el).forEach((i) => { i.onchange = () => { c[i.dataset.g] = Number(i.value) || 0; doi(); }; });
  $$('[data-phu]', el).forEach((b) => { b.onclick = () => { bat(c.nhomPhu, b.dataset.phu); doi(); }; });
  $$('[data-chinh]', el).forEach((b) => { b.onclick = () => { bat(vtCua(b).nhomChinh, b.dataset.chinh); doi(); }; });
  $$('[data-sln]', el).forEach((b) => {
    b.onclick = () => {
      const sl = vtCua(b).sanLuong[b.dataset.i];
      if (b.dataset.sln === '*') sl.nhom = sl.nhom.includes('*') ? [] : ['*'];
      else { sl.nhom = sl.nhom.filter((x) => x !== '*'); bat(sl.nhom, b.dataset.sln); }
      doi();
    };
  });
  $$('.tl-ten', el).forEach((i) => { i.onchange = () => { vtCua(i).sanLuong[i.dataset.i].ten = i.value.trim(); doi(); }; });
  $$('[data-k="toiThieu"]', el).forEach((i) => {
    i.onchange = () => { vtCua(i).sanLuong[i.dataset.i].toiThieu = Number(i.value) || 0; doi(); };
  });
  $$('.tl-dem', el).forEach((i) => { i.onchange = () => { vtCua(i).sanLuong[i.dataset.i].dem = i.value; doi(); }; });
  $$('.tl-nguon', el).forEach((i) => { i.onchange = () => { vtCua(i).sanLuong[i.dataset.i].nguon = i.value; doi(); }; });
  $$('.tl-xoa-sl', el).forEach((b) => { b.onclick = () => { vtCua(b).sanLuong.splice(Number(b.dataset.i), 1); doi(); }; });
  $$('.tl-them-sl', el).forEach((b) => {
    b.onclick = () => { vtCua(b).sanLuong.push({ ten: 'sản phẩm', nhom: [], toiThieu: 1, dem: 'san-pham' }); doi(); };
  });
  $$('.tl-che', el).forEach((b) => { b.onclick = () => { vtCua(b).cheDo = b.dataset.che; doi(); }; });
  $$('.tl-xoa-vt', el).forEach((b) => {
    b.onclick = () => {
      if (!confirm('Bỏ chuẩn của vị trí "' + b.dataset.vt + '"? Người ở vị trí này sẽ không được chấm nữa.')) return;
      delete c.viTri[b.dataset.vt]; doi();
    };
  });
  $('#tlThemVT').onclick = () => {
    const t = ($('#tlVTMoi').value || '').trim();
    if (!t) return;
    if (c.viTri[t]) return toast('Đã có vị trí "' + t + '"', 'do');
    c.viTri[t] = { nhomChinh: [], sanLuong: [], cheDo: 'tat-ca' }; doi();
  };
  batKhoiTin(el);
  $$('.tl-ln', el).forEach((i) => { i.onchange = () => { c.loiNhan = c.loiNhan || {}; c.loiNhan[i.dataset.ln] = i.value; doi(); }; });
  $('#tlMacDinh').onclick = () => {
    if (!confirm('Đưa mọi con số về mặc định (80/20 và chỉ tiêu chốt 30/09)? Chưa lưu cho tới khi bấm Lưu.')) return;
    TL.chuan = JSON.parse(JSON.stringify(TL.macDinh)); doi();
  };
  $('#tlThu').onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = 'Đang chấm…';
    try {
      TL_THU = await goi('/api/thiet-lap/thu', { method: 'POST', body: JSON.stringify({ chuan: c, soNgay: 30 }) });
      veThietLap(el);
    } catch (er) {
      toast('Chấm thử hỏng: ' + er.message, 'do');
      e.target.disabled = false; e.target.textContent = 'Chấm thử 30 ngày';
    }
  };
  $('#tlLuu').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await goi('/api/thiet-lap', { method: 'POST', body: JSON.stringify({ chuan: c }) });
      TL.chuan = r.chuan; TL_BAN = false;
      toast('Đã lưu chuẩn — áp từ lần nộp báo cáo tiếp theo');
      veThietLap(el);
    } catch (er) { toast('Lưu hỏng: ' + er.message, 'do'); e.target.disabled = false; }
  };
}

/** Kết quả chấm thử của một vị trí — gộp số, không hiện tên người. */
function veThuVT(vt) {
  if (!TL_THU) return '';
  const x = (TL_THU.viTri || []).find((y) => y.viTri === vt);
  if (!x || !x.phieu) {
    return '<div class="nho" style="margin-top:12px">Chấm thử: chưa có phiếu nào của vị trí này trong ' +
      TL_THU.soNgay + ' ngày.</div>';
  }
  const pt = (n) => Math.round(n / x.phieu * 100) + '%';
  const hut = Object.entries(x.hutSL || {}).map(([k, v]) => k + ' ' + v + ' ngày').join(' · ');
  return '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">' +
    '<div class="nho" style="margin-bottom:6px">Chấm thử ' + x.phieu + ' phiếu:</div>' +
    '<span class="nhan-tt xanh">Đạt ' + pt(x.tot) + '</span> ' +
    '<span class="nhan-tt cam">Lưu ý ' + pt(x['luu-y']) + '</span> ' +
    '<span class="nhan-tt do">Lệch ' + pt(x.lech) + '</span>' +
    ((x.hutChinh || hut) ? '<div class="nho" style="margin-top:6px">Hụt: ' +
      [x.hutChinh ? 'việc chính ' + x.hutChinh + ' ngày' : '', hut].filter(Boolean).join(' · ') + '</div>' : '') +
  '</div>';
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
  window.location.href = 'api/xuat?tu=' + t.tu + '&den=' + t.den + caPhong;
}

nap().catch((e) => {
  $('#man').innerHTML = '<div class="the"><div class="rong"><b>Không khởi động được</b>' +
    esc(e.message) + '</div></div>';
});
