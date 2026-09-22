'use strict';
/* ============================================================================
 * THÔNG TIN SẢN PHẨM — giao diện
 * ============================================================================
 *
 * Thay ba file Google Sheet rời rạc. Bốn câu hỏi app phải trả lời trong vài
 * giây, theo đúng thứ tự phòng Marketing cần:
 *
 *   1. Đang phải đẩy cái gì — Bảng đẩy chia TẦNG, mở app ra là thấy ngay
 *   2. Giá công bố và USP của một sản phẩm — để chép sang bài đăng
 *   3. Cái nào sắp hết hạn (giai đoạn áp dụng + ưu đãi có thời hạn)
 *   4. Hồ sơ nào còn thiếu, thiếu đúng mục gì
 *
 * HAI VAI, hai thứ nhìn thấy:
 *   · Nhân sự — chỉ ĐỌC. Không thấy tab Quản lý, không thấy ô sửa nào.
 *   · Quản lý — sửa thẳng trong app chín cột phòng Marketing tự quyết
 *     (ưu tiên, trạng thái, giá công bố, hiệu lực, ưu đãi, lưu ý), sửa từng
 *     dòng hoặc hàng loạt. Nội dung dài (USP, lịch trình, chính sách) vẫn sửa
 *     trên Lark Base — chỗ Kinh doanh và Marketing cùng nhìn.
 *
 * Giấu ô sửa chỉ là phép lịch sự với mắt người dùng; server chốt lại hết.
 *
 * Không framework, cùng lối với chín app khác của phòng.
 * ========================================================================== */

const S = {
  ds: [],
  tomTat: null,
  me: null,
  chon: { nhom: [], uuTien: [], trangThai: [], tepKhach: [], traiNghiem: [] },
  suaDuoc: {},
  baseUrl: '',
  baseUrlBoSung: '',
  capNhat: 0,
  tab: 'bang-day',     // bang-day | danh-muc | het-han | thieu | quan-ly
  loc: { tim: '', nhom: '', uuTien: '', trangThai: '', tepKhach: '', traiNghiem: '' },
  moId: '',
  chonHangLoat: new Set(),
  /* Tầng nào đang mở trên Bảng đẩy. Khởi tạo theo `mo` của TANG, rồi theo đúng
     cái người dùng vừa bấm — vẽ lại màn không được đóng sập thứ họ vừa mở. */
  tangMo: new Set(),
};

const laQuanLy = () => !!(S.me && S.me.quanLy);

const XUONG = String.fromCharCode(10);

const $ = (s, g = document) => g.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tien = (n) => (Number(n) || 0).toLocaleString('vi-VN');

/* Gọi API theo đường TƯƠNG ĐỐI với trang hiện tại.
   Qua proxy của hub, app nằm dưới /m/san-pham/ — đường tuyệt đối `/api/...` sẽ
   trỏ ra gốc hub chứ không vào app. */
const apiUrl = (p) => (location.pathname.replace(/\/+$/, '') + p).replace(/^\/\//, '/');

async function api(duong, opt) {
  const r = await fetch(apiUrl(duong), opt);
  let d = null;
  try { d = await r.json(); } catch (_) {}
  if (!r.ok) throw new Error((d && d.error) || ('Lỗi ' + r.status));
  return d;
}

const guiJson = (duong, than) => api(duong, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(than),
});

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 260); },
    kind === 'err' ? 5200 : 2400);
}

/** Bỏ dấu để gõ "cap treo" cũng ra "cáp treo" — cùng mẹo với ô tìm người của hub. */
const boDau = (s) => String(s || '').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const veNgay = (t) => {
  if (!t) return '';
  /* Giờ VN, không giờ máy: Base lưu 30/09 00:00 (+07). Máy để múi giờ khác là
     lệch một ngày, mà lệch một ngày ở cột hạn thì sai nghĩa. */
  const d = new Date(t + 7 * 3600000);
  const hai = (n) => String(n).padStart(2, '0');
  return hai(d.getUTCDate()) + '/' + hai(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
};

/** Dạng YYYY-MM-DD cho <input type=date>, cũng tính theo giờ VN. */
const veNgayO = (t) => {
  if (!t) return '';
  const d = new Date(t + 7 * 3600000);
  const hai = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + hai(d.getUTCMonth() + 1) + '-' + hai(d.getUTCDate());
};

const gioPhut = (t) => {
  if (!t) return '';
  const d = new Date(t);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

/* ---------------------------------------------------------------------------
 * NHÃN
 * ------------------------------------------------------------------------- */

function lopUuTien(v) {
  if (/Ưu tiên đẩy/.test(v)) return 'uu';
  if (/Chạy hằng ngày/.test(v)) return 'ngay';
  if (/Duy trì/.test(v)) return 'duytri';
  return '';
}
const lopTinhTrang = (v) => (/Đã hết hạn/.test(v) ? 'het' : /Sắp hết hạn/.test(v) ? 'canh' : '');
const laSapRaMat = (p) => /Sắp ra mắt/.test(p.trangThai);

/** Ưu đãi của sản phẩm này sắp hết hạn trong 30 ngày tới. */
function uuDaiSapHet(p) {
  const nay = Date.now();
  const han = nay + 30 * 86400000;
  return (p.chinhSach || []).filter((c) => c.den && c.den >= nay && c.den <= han);
}

function nhanHtml(p) {
  const ds = [];
  if (laSapRaMat(p)) ds.push('<span class="nhan moi">🆕 Sắp ra mắt</span>');
  if (p.uuTien) ds.push('<span class="nhan ' + lopUuTien(p.uuTien) + '">' + esc(p.uuTien) + '</span>');
  if (p.trangThai && p.trangThai !== 'Đang kinh doanh' && !laSapRaMat(p)) {
    ds.push('<span class="nhan">' + esc(p.trangThai) + '</span>');
  }
  if (lopTinhTrang(p.tinhTrang)) {
    ds.push('<span class="nhan ' + lopTinhTrang(p.tinhTrang) + '">' + esc(p.tinhTrang) +
      (p.conLai != null ? ' · ' + p.conLai + 'n' : '') + '</span>');
  }
  const ud = uuDaiSapHet(p);
  if (ud.length) {
    ds.push('<span class="nhan canh">ưu đãi hết ' + esc(veNgay(ud[0].den)) + '</span>');
  }
  if (p.thieu) ds.push('<span class="nhan thieu">thiếu: ' + esc(p.thieu) + '</span>');
  return ds.join('');
}

/** Giá hiển thị: có số thì in số, không thì in ghi chú giá, không nữa thì nói rõ. */
function giaHtml(p) {
  if (p.giaNL != null) {
    return '<span class="gia">' + tien(p.giaNL) + 'đ</span>' +
      (p.giaTE != null ? '<span class="giaTe">trẻ em ' + tien(p.giaTE) + 'đ</span>' : '');
  }
  if (p.ghiChuGia) return '<span class="giaChu">' + esc(p.ghiChuGia) + '</span>';
  return '<span class="giaChu">chưa có giá công bố</span>';
}

/* ---------------------------------------------------------------------------
 * BẢNG ĐẨY — các tầng
 *
 * Mỗi sản phẩm rơi vào ĐÚNG MỘT tầng, tầng đầu tiên nó khớp. "Sắp ra mắt" đứng
 * trên cùng và giành quyền trước mọi mức ưu tiên: một sản phẩm chưa mở bán thì
 * việc phải làm là chuẩn bị nội dung cho kịp ngày, không phải chạy quảng cáo —
 * kể cả khi nó đã được xếp 🔥.
 *
 * "Ngừng bán" không có mặt: không còn gì để đẩy. Vẫn tra được ở tab Danh mục.
 * ------------------------------------------------------------------------- */
const TANG = [
  /* `mo: true` = mở sẵn. Ba tầng đầu là việc PHẢI LÀM nên luôn mở; mấy tầng
     dưới chỉ để tra nên gập lại — tầng Duy trì một mình đã 44 dòng, để mở hết
     thì phải cuộn ba màn mới thấy được bức tranh chung, tức là mất đúng cái
     làm nên "bảng thông tin nhanh". */
  { id: 'sap-ra-mat', ten: '🆕 Sắp ra mắt', mau: 'tim', mo: true,
    ghi: 'Chuẩn bị nội dung trước ngày mở bán',
    hop: (p) => laSapRaMat(p) },
  { id: 'uu-tien', ten: '🔥 Ưu tiên đẩy', mau: 'do', mo: true,
    ghi: 'Dồn ngân sách và nội dung vào nhóm này',
    hop: (p) => /Ưu tiên đẩy/.test(p.uuTien) },
  { id: 'hang-ngay', ten: '🟢 Chạy hằng ngày', mau: 'xanh', mo: true,
    ghi: 'Có bài đều, giữ nhịp',
    hop: (p) => /Chạy hằng ngày/.test(p.uuTien) },
  { id: 'chua-xep', ten: 'Chưa xếp mức', mau: 'xam', mo: true,
    ghi: 'Cần quản lý xếp mức ưu tiên',
    hop: (p) => !p.uuTien },
  { id: 'duy-tri', ten: '🔵 Duy trì', mau: 'lam', mo: false,
    ghi: 'Giữ hồ sơ đủ, chạy khi có nhu cầu',
    hop: (p) => /Duy trì/.test(p.uuTien) },
  { id: 'theo-mua', ten: '🌤 Theo mùa / theo yêu cầu', mau: 'vang', mo: false,
    ghi: 'Chỉ đẩy khi Kinh doanh yêu cầu hoặc vào mùa',
    hop: (p) => /Theo mùa/.test(p.uuTien) },
  { id: 'tam-dung', ten: '⏸ Tạm dừng đẩy', mau: 'xam', mo: false,
    ghi: 'Không chạy truyền thông lúc này',
    hop: (p) => /Tạm dừng/.test(p.uuTien) },
  { id: 'khac', ten: 'Mức khác', mau: 'xam', mo: false,
    ghi: 'Mức ưu tiên không nằm trong bộ chuẩn',
    hop: () => true },
];

/* Lần đầu vẽ Bảng đẩy thì lấy mặc định từ TANG. Gọi mỗi lần vẽ cũng không sao:
   sau lần đầu `tangMo` đã có phần tử nên nó không ghi đè lựa chọn của người dùng. */
function motTangMacDinh() {
  if (S.tangMo.size) return;
  TANG.filter((t) => t.mo).forEach((t) => S.tangMo.add(t.id));
}

function chiaTang(ds) {
  const con = ds.filter((p) => p.trangThai !== 'Ngừng bán');
  const ra = TANG.map((t) => ({ tang: t, ds: [] }));
  for (const p of con) {
    const i = TANG.findIndex((t) => t.hop(p));
    ra[i].ds.push(p);
  }
  return ra;
}

/* ---------------------------------------------------------------------------
 * LỌC
 * ------------------------------------------------------------------------- */

/**
 * Danh sách theo tab đang mở.
 *
 * Bộ lọc chỉ áp cho tab Danh mục. Hai tab cảnh báo là danh sách VIỆC PHẢI LÀM —
 * lọc chúng đi thì đúng thứ đang cần chú ý lại biến mất khỏi màn hình.
 */
function dsTheoTab() {
  if (S.tab === 'het-han') {
    /* Gồm cả sản phẩm hết hạn hiệu lực LẪN sản phẩm còn hạn nhưng ưu đãi sắp
       hết — với người chạy bài thì cả hai đều là "sắp phải sửa nội dung". */
    return S.ds.filter((p) => /hết hạn/i.test(p.tinhTrang) || uuDaiSapHet(p).length);
  }
  if (S.tab === 'thieu') return S.ds.filter((p) => p.thieu);
  return locDanhMuc(S.ds);
}

function locDanhMuc(ds) {
  const l = S.loc;
  const tim = boDau(l.tim.trim());
  return ds.filter((p) => {
    if (l.nhom && p.nhom !== l.nhom) return false;
    if (l.uuTien && p.uuTien !== l.uuTien) return false;
    if (l.trangThai && p.trangThai !== l.trangThai) return false;
    if (l.tepKhach && !p.tepKhach.includes(l.tepKhach)) return false;
    if (l.traiNghiem && !p.traiNghiem.includes(l.traiNghiem)) return false;
    if (!tim) return true;
    /* Tìm trên cả USP và điểm nổi bật: người viết content hay nhớ một cụm trong
       mô tả chứ không nhớ mã sản phẩm. */
    return boDau([p.ma, p.ten, p.tenEn, p.usp, p.noiBat, p.lichTrinh,
      p.traiNghiem.join(' '), p.tepKhach.join(' ')].join(' ')).includes(tim);
  });
}

const xoaLoc = () => {
  S.loc = { tim: '', nhom: '', uuTien: '', trangThai: '', tepKhach: '', traiNghiem: '' };
};

/* ---------------------------------------------------------------------------
 * VẼ
 * ------------------------------------------------------------------------- */

function veTabs() {
  const soHetHan = S.ds.filter((p) => /hết hạn/i.test(p.tinhTrang) || uuDaiSapHet(p).length).length;
  const soThieu = S.ds.filter((p) => p.thieu).length;
  const soDay = S.ds.filter((p) => laSapRaMat(p) || /Ưu tiên đẩy|Chạy hằng ngày/.test(p.uuTien)).length;
  const muc = [
    ['bang-day', 'Bảng đẩy', soDay, false],
    ['danh-muc', 'Danh mục', S.ds.length, false],
    ['het-han', 'Sắp hết hạn', soHetHan, soHetHan > 0],
    ['thieu', 'Cần bổ sung', soThieu, soThieu > 0],
  ];
  if (laQuanLy()) muc.push(['quan-ly', 'Quản lý', S.ds.length, false]);
  $('#tabs').innerHTML = muc.map(([id, ten, n, canh]) =>
    '<button class="pill' + (S.tab === id ? ' on' : '') + '" data-tab="' + id + '">' + esc(ten) +
    '<span class="dem' + (canh ? ' canh' : '') + '">' + n + '</span></button>').join('');
}

/* Mỗi thẻ số dẫn tới đúng danh sách nằm sau con số đó — bấm vào là lọc luôn,
   không phải tự đi dựng lại bộ lọc cho khớp. Khoá `di` khai ngay cạnh con số để
   hai thứ không bao giờ lệch nhau. */
const DI_THE = {
  'Sản phẩm đang bán': { tab: 'danh-muc', loc: { trangThai: 'Đang kinh doanh' } },
  'Sắp ra mắt': { tab: 'danh-muc', loc: { trangThai: '🆕 Sắp ra mắt' } },
  'Ưu tiên đẩy': { tab: 'danh-muc', loc: { uuTien: '🔥 Ưu tiên đẩy' } },
  'Chạy hằng ngày': { tab: 'danh-muc', loc: { uuTien: '🟢 Chạy hằng ngày' } },
  'Sắp / đã hết hạn': { tab: 'het-han' },
  'Ưu đãi sắp hết': { tab: 'het-han' },
  'Hồ sơ còn thiếu': { tab: 'thieu' },
};

function veDai() {
  const t = S.tomTat;
  if (!t) return '';
  return '<div class="dai">' + t.the.map((o) => {
    const di = DI_THE[o.nhan];
    return '<button class="o' + (o.chinh ? ' chinh' : '') +
      (o.muc === 'gap' ? ' gap' : o.muc === 'vua' ? ' vua' : '') +
      (di ? ' bam' : '') + '"' +
      (di ? ' data-the="' + esc(o.nhan) + '" title="Bấm để xem danh sách"' : ' disabled') + '>' +
      '<span class="nhan">' + esc(o.nhan) + '</span>' +
      '<span class="so">' + tien(o.so) + '</span>' +
      (o.ghi ? '<span class="ghi">' + esc(o.ghi) + '</span>' : '') +
      '</button>';
  }).join('') + '</div>';
}

function veLoc(soKq) {
  const ch = (ten, khoa, ds) =>
    '<select data-loc="' + khoa + '"><option value="">' + esc(ten) + '</option>' +
    ds.map((x) => '<option' + (S.loc[khoa] === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') +
    '</select>';
  const coLoc = Object.values(S.loc).some(Boolean);
  return '<div class="filters">' +
    '<input type="search" id="oTim" placeholder="Tìm mã, tên, USP, trải nghiệm…" value="' + esc(S.loc.tim) + '">' +
    ch('Mọi nhóm', 'nhom', S.chon.nhom) +
    ch('Mọi mức ưu tiên', 'uuTien', S.chon.uuTien) +
    ch('Mọi trạng thái', 'trangThai', S.chon.trangThai) +
    ch('Mọi tệp khách', 'tepKhach', S.chon.tepKhach) +
    ch('Mọi trải nghiệm', 'traiNghiem', S.chon.traiNghiem) +
    (coLoc ? '<button class="btn sm" id="btnXoaLoc">Bỏ lọc</button>' : '') +
    '<span class="demKq">' + soKq + ' sản phẩm</span>' +
    '</div>';
}

function theHtml(p) {
  return '<article class="the' + (S.moId === p.id ? ' chon' : '') + '" data-id="' + esc(p.id) + '">' +
    '<div class="dau">' +
      (p.ma ? '<span class="ma">' + esc(p.ma) + '</span>' : '') +
      '<div style="min-width:0" data-no-i18n><h3>' + esc(p.ten) + '</h3>' +
      (p.tenEn ? '<div class="en">' + esc(p.tenEn) + '</div>' : '') + '</div>' +
    '</div>' +
    '<div class="giaHang">' + giaHtml(p) + '</div>' +
    (p.usp || p.noiBat ? '<div class="usp" data-no-i18n>' + esc(p.usp || p.noiBat) + '</div>' : '') +
    '<div class="nhanHang">' + nhanHtml(p) + '</div>' +
    '</article>';
}

/** Dòng gọn cho Bảng đẩy — đọc lướt cả tầng, không phải đọc từng thẻ to. */
function dongHtml(p) {
  return '<div class="dong' + (S.moId === p.id ? ' chon' : '') + '" data-id="' + esc(p.id) + '">' +
    (p.ma ? '<span class="ma">' + esc(p.ma) + '</span>' : '<span class="ma trong">—</span>') +
    '<span class="dTen" data-no-i18n>' + esc(p.ten) + '</span>' +
    '<span class="dGia">' + (p.giaNL != null ? tien(p.giaNL) + 'đ'
      : '<i class="giaChu">' + esc(p.ghiChuGia ? 'theo báo giá' : 'chưa có giá') + '</i>') + '</span>' +
    '<span class="dNhan">' + nhanHtml(p) + '</span>' +
    '</div>';
}

function bangDayHtml() {
  motTangMacDinh();
  const nhom = chiaTang(S.ds);
  let html = '<p class="dan">Mỗi sản phẩm nằm ở đúng một tầng. “Sắp ra mắt” đứng trên cùng vì ' +
    'việc phải làm là kịp nội dung cho ngày mở bán.' +
    (laQuanLy() ? ' Đổi tầng của một sản phẩm ở tab Quản lý hoặc trong ngăn chi tiết.' : '') +
    '</p>';
  for (const { tang, ds } of nhom) {
    if (!ds.length) continue;
    /* <details> chứ không phải nút tự viết: gập/mở là hành vi sẵn có của trình
       duyệt, đọc được bằng bàn phím và trình đọc màn hình mà không cần thêm mã. */
    const dangMo = S.tangMo.has(tang.id);
    html += '<details class="tang tang-' + tang.mau + '" data-tang="' + tang.id + '"' +
      (dangMo ? ' open' : '') + '>' +
      '<summary class="tangDau">' +
        '<b>' + esc(tang.ten) + '</b>' +
        '<span class="dem">' + ds.length + '</span>' +
        '<span class="tangMo">' + esc(tang.ghi) + '</span>' +
      '</summary>' +
      '<div class="tangThan">' + ds.map(dongHtml).join('') + '</div>' +
      '</details>';
  }
  const ngung = S.ds.filter((p) => p.trangThai === 'Ngừng bán').length;
  if (ngung) {
    html += '<p class="dan">' + ngung + ' sản phẩm đã ngừng bán không nằm trong bảng này — ' +
      'tra ở tab Danh mục.</p>';
  }
  return html;
}

/** Lưới có chia nhóm — chỉ chia khi đang xem Danh mục và không lọc theo nhóm. */
function luoiHtml(ds) {
  if (!ds.length) return '<div class="trong">Không có sản phẩm nào khớp.</div>';
  if (S.tab !== 'danh-muc' || S.loc.nhom) {
    return '<div class="luoi">' + ds.map(theHtml).join('') + '</div>';
  }
  let html = '';
  let nhomHienTai = null;
  let dem = [];
  const xa = () => {
    if (!dem.length) return;
    html += '<div class="nhomDau"><span>' + esc(nhomHienTai || 'Chưa xếp nhóm') +
      '</span><span class="vach"></span><span class="phu">' + dem.length + '</span></div>' +
      '<div class="luoi">' + dem.map(theHtml).join('') + '</div>';
    dem = [];
  };
  for (const p of ds) {
    if (p.nhom !== nhomHienTai) { xa(); nhomHienTai = p.nhom; }
    dem.push(p);
  }
  xa();
  return html;
}

/* ---------------------------------------------------------------------------
 * KHU QUẢN LÝ
 *
 * Một bảng, sửa tại chỗ, không có nút "Lưu": mỗi ô đổi là ghi thẳng xuống Base
 * rồi báo. Có nút Lưu thì sẽ có người đổi mười dòng rồi đóng tab — và không ai
 * biết mười dòng đó chưa đi đâu cả.
 * ------------------------------------------------------------------------- */

function oChon(khoa, giaTri, ds, id) {
  return '<select class="oSua" data-sua="' + khoa + '" data-id="' + esc(id) + '">' +
    '<option value="">— trống —</option>' +
    ds.map((x) => '<option' + (giaTri === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') +
    '</select>';
}

function quanLyHtml() {
  const ds = locDanhMuc(S.ds);
  const n = S.chonHangLoat.size;
  let html = veLoc(ds.length);

  html += '<div class="hangLoat' + (n ? ' co' : '') + '">' +
    '<label class="chonHet"><input type="checkbox" id="chonHet"' +
      (n && n === ds.length ? ' checked' : '') + '> Chọn cả ' + ds.length + ' dòng đang hiện</label>' +
    (n
      ? '<span class="daChon">Đã chọn ' + n + '</span>' +
        '<span class="phu">Đặt cho cả nhóm:</span>' +
        oChon('uuTien', '', S.chon.uuTien, '__nhieu__') +
        oChon('trangThai', '', S.chon.trangThai, '__nhieu__') +
        '<button class="btn sm" id="boChon">Bỏ chọn</button>'
      : '<span class="phu">Tick vài dòng để đặt mức ưu tiên cho cả nhóm một lượt.</span>') +
    '</div>';

  if (!ds.length) return html + '<div class="trong">Không có sản phẩm nào khớp.</div>';

  html += '<div class="banggCuon"><table class="bangQL">' +
    '<thead><tr>' +
    '<th class="cTick"></th><th>Sản phẩm</th><th>Ưu tiên marketing</th><th>Trạng thái</th>' +
    '<th class="cSo">Giá NL</th><th class="cSo">Giá TE</th><th>Hiệu lực đến</th><th></th>' +
    '</tr></thead><tbody>' +
    ds.map((p) => '<tr' + (S.moId === p.id ? ' class="chon"' : '') + '>' +
      '<td class="cTick"><input type="checkbox" class="tick" data-tick="' + esc(p.id) + '"' +
        (S.chonHangLoat.has(p.id) ? ' checked' : '') + '></td>' +
      '<td data-no-i18n><b>' + esc(p.ma || '—') + '</b><div class="phu">' + esc(p.ten) + '</div></td>' +
      '<td>' + oChon('uuTien', p.uuTien, S.chon.uuTien, p.id) + '</td>' +
      '<td>' + oChon('trangThai', p.trangThai, S.chon.trangThai, p.id) + '</td>' +
      '<td class="cSo"><input class="oSua oSo" type="number" min="0" step="1000" data-sua="giaNL"' +
        ' data-id="' + esc(p.id) + '" value="' + (p.giaNL == null ? '' : p.giaNL) + '"></td>' +
      '<td class="cSo"><input class="oSua oSo" type="number" min="0" step="1000" data-sua="giaTE"' +
        ' data-id="' + esc(p.id) + '" value="' + (p.giaTE == null ? '' : p.giaTE) + '"></td>' +
      '<td><input class="oSua oNgay" type="date" data-sua="hieuLucDen"' +
        ' data-id="' + esc(p.id) + '" value="' + veNgayO(p.hieuLucDen) + '"></td>' +
      '<td><button class="btn sm" data-mo="' + esc(p.id) + '">Chi tiết</button></td>' +
      '</tr>').join('') +
    '</tbody></table></div>';
  return html;
}

function ve() {
  veTabs();
  const man = $('#man');
  if (S.tab === 'quan-ly' && laQuanLy()) {
    man.innerHTML = veDai() + quanLyHtml();
  } else if (S.tab === 'bang-day') {
    man.innerHTML = veDai() + bangDayHtml();
  } else {
    const ds = dsTheoTab();
    man.innerHTML = veDai() +
      (S.tab === 'danh-muc' ? veLoc(ds.length) : moTaTab(ds.length)) +
      luoiHtml(ds);
  }
  man.removeAttribute('aria-busy');
  $('#phuDe').textContent = S.ds.length + ' sản phẩm · đọc lúc ' + gioPhut(S.capNhat);
  const c = $('#chipToi');
  c.textContent = (S.me ? S.me.ten : '—') + (laQuanLy() ? ' · quản lý' : '');
  c.className = 'chip' + (laQuanLy() ? ' ql' : '');
}

function moTaTab(n) {
  const chu = {
    'het-han': 'Giai đoạn áp dụng hoặc ưu đãi sắp kết thúc. Rà lại với Kinh doanh trước khi chạy tiếp.',
    'thieu': 'Hồ sơ chưa đủ để làm truyền thông. Bổ sung trong Lark Base rồi bấm Làm mới.',
  }[S.tab] || '';
  /* Nút "Mở Base" trên thanh tiêu đề bị lớp vỏ ẩn đi (hub có nút Lark riêng),
     nên đường tắt sang đúng view cần điền phải nằm ở đây — chỗ người dùng đang
     đọc câu "bổ sung trong Lark Base". */
  const tat = S.tab === 'thieu' && S.baseUrlBoSung
    ? '<span class="lk"><a href="' + esc(S.baseUrlBoSung) + '" target="_blank" rel="noopener">' +
      'Mở view “Cần bổ sung” trên Base</a></span>'
    : '';
  return '<div class="filters"><span class="phu">' + esc(chu) + '</span>' + tat +
    '<span class="demKq">' + n + ' sản phẩm</span></div>';
}

/* ---------------------------------------------------------------------------
 * NGĂN CHI TIẾT
 * ------------------------------------------------------------------------- */

/* Mọi khối chữ dài đều có nút chép: đây là thao tác chính của người viết
   content, và chọn tay trong một ô cuộn được thì rất dễ hụt dòng cuối. */
function khoiHtml(tieuDe, noiDung, opt = {}) {
  if (!noiDung) return '';
  const id = 'k' + Math.random().toString(36).slice(2, 9);
  return '<section class="muc">' +
    '<h4>' + esc(tieuDe) +
    '<button class="btn sm" data-chep="' + id + '">Chép</button></h4>' +
    '<div class="noi' + (opt.canh ? ' canh' : '') + '" id="' + id + '" data-no-i18n>' +
    esc(noiDung) + '</div>' +
    '</section>';
}

/** Khối chữ dài mà quản lý sửa được tại chỗ. Nhân sự thấy đúng như khoiHtml. */
function khoiSuaHtml(tieuDe, khoa, p, opt = {}) {
  const giaTri = p[khoa] || '';
  if (!laQuanLy()) return khoiHtml(tieuDe, giaTri, opt);
  return '<section class="muc"><h4>' + esc(tieuDe) + '<span class="suaDuoc">sửa được</span></h4>' +
    '<textarea class="oSua oChu" rows="4" data-sua="' + khoa + '" data-id="' + esc(p.id) + '"' +
    ' placeholder="— trống —" data-no-i18n>' + esc(giaTri) + '</textarea></section>';
}

function veSo(p) {
  const so = $('#so');
  if (!p) { so.classList.remove('mo'); S.moId = ''; ve(); return; }
  S.moId = p.id;
  so.classList.add('mo');
  $('#soTieuDe').textContent = (p.ma ? p.ma + ' — ' : '') + p.ten;
  $('#soPhu').textContent = [p.nhom, p.thoiLuong, p.khoiHanh].filter(Boolean).join(' · ');

  const oNho = (k, v) => (v ? '<div class="oNho"><div class="k">' + esc(k) + '</div>' +
    '<div class="v">' + esc(v) + '</div></div>' : '');
  const ql = laQuanLy();

  let h = '';

  /* --- nhãn --- */
  h += '<section class="muc"><div class="nhanHang">' + nhanHtml(p) + '</div></section>';

  /* --- hai cột quyết định việc đẩy --- */
  h += '<section class="muc"><h4>Xếp loại' + (ql ? '<span class="suaDuoc">sửa được</span>' : '') + '</h4>';
  if (ql) {
    h += '<div class="doi">' +
      '<div class="oNho"><div class="k">Ưu tiên marketing</div>' +
      oChon('uuTien', p.uuTien, S.chon.uuTien, p.id) + '</div>' +
      '<div class="oNho"><div class="k">Trạng thái kinh doanh</div>' +
      oChon('trangThai', p.trangThai, S.chon.trangThai, p.id) + '</div>' +
      '</div>';
  } else {
    h += '<div class="doi">' + oNho('Ưu tiên marketing', p.uuTien || 'chưa xếp') +
      oNho('Trạng thái kinh doanh', p.trangThai || '—') + '</div>';
  }
  h += '</section>';

  /* --- giá --- */
  h += '<section class="muc"><h4>Giá công bố' + (ql ? '<span class="suaDuoc">sửa được</span>' : '') + '</h4>';
  if (ql) {
    const oSo = (k, nhan, v) => '<div class="oNho"><div class="k">' + esc(nhan) + '</div>' +
      '<input class="oSua oSo" type="number" min="0" step="1000" data-sua="' + k + '"' +
      ' data-id="' + esc(p.id) + '" value="' + (v == null ? '' : v) + '"></div>';
    const oNgay = (k, nhan, v) => '<div class="oNho"><div class="k">' + esc(nhan) + '</div>' +
      '<input class="oSua oNgay" type="date" data-sua="' + k + '"' +
      ' data-id="' + esc(p.id) + '" value="' + veNgayO(v) + '"></div>';
    h += '<div class="doi">' + oSo('giaNL', 'Người lớn', p.giaNL) + oSo('giaTE', 'Trẻ em', p.giaTE) +
      oNgay('hieuLucTu', 'Hiệu lực từ', p.hieuLucTu) + oNgay('hieuLucDen', 'Hiệu lực đến', p.hieuLucDen) +
      '</div>' +
      '<textarea class="oSua oChu" rows="2" data-sua="ghiChuGia" data-id="' + esc(p.id) + '"' +
      ' placeholder="Ghi chú giá — dùng khi giá không cố định" data-no-i18n>' +
      esc(p.ghiChuGia || '') + '</textarea>';
  } else {
    h += '<div class="doi">' +
      oNho('Người lớn', p.giaNL != null ? tien(p.giaNL) + 'đ' : '—') +
      oNho('Trẻ em', p.giaTE != null ? tien(p.giaTE) + 'đ' : '—') +
      oNho('Hiệu lực từ', veNgay(p.hieuLucTu) || '—') +
      oNho('Hiệu lực đến', veNgay(p.hieuLucDen) || 'chưa đặt hạn') +
      '</div>' +
      (p.ghiChuGia ? '<div class="noi" style="margin-top:8px" data-no-i18n>' +
        esc(p.ghiChuGia) + '</div>' : '');
  }
  h += '</section>';

  if (p.gia.length) {
    h += '<section class="muc"><h4>Giá theo giai đoạn</h4><table class="bang">' +
      '<tr><th>Giai đoạn</th><th>Người lớn</th><th>Trẻ em</th><th>Áp dụng</th></tr>' +
      p.gia.slice().sort((a, b) => (a.tu || 0) - (b.tu || 0)).map((g) =>
        '<tr><td data-no-i18n>' + esc(g.loai || g.ten) +
        (g.dieuKien ? '<div class="phu" style="white-space:pre-wrap">' + esc(g.dieuKien) + '</div>' : '') +
        '</td>' +
        '<td>' + (g.giaNL != null ? tien(g.giaNL) + 'đ' : '—') + '</td>' +
        '<td>' + (g.giaTE != null ? tien(g.giaTE) + 'đ' : '—') + '</td>' +
        '<td>' + (veNgay(g.tu) || '—') + (g.den ? ' → ' + veNgay(g.den) : '') +
        (g.tinhTrang ? '<div class="phu">' + esc(g.tinhTrang) + '</div>' : '') + '</td></tr>').join('') +
      '</table></section>';
  }

  /* --- nội dung cho bài đăng --- */
  h += khoiHtml('USP', p.usp);
  h += khoiHtml('Điểm nổi bật', p.noiBat);
  h += khoiHtml('Đối tượng mục tiêu', p.doiTuong);

  if (p.tepKhach.length || p.traiNghiem.length) {
    h += '<section class="muc"><h4>Nhãn</h4><div class="nhanHang">' +
      p.tepKhach.concat(p.traiNghiem).map((x) => '<span class="nhan">' + esc(x) + '</span>').join('') +
      '</div></section>';
  }

  h += khoiHtml('Lịch trình tóm tắt', p.lichTrinh);
  h += khoiHtml('Dịch vụ bao gồm', p.baoGom);
  h += khoiHtml('Dịch vụ chưa bao gồm', p.chuaBaoGom);
  h += khoiSuaHtml('Ưu đãi đang chạy', 'uuDai', p);
  h += khoiHtml('Chính sách trẻ em', p.csTreEm);
  h += khoiHtml('Chính sách phụ thu', p.csPhuThu);
  h += khoiHtml('Chính sách giảm trừ', p.csGiamTru);
  h += khoiSuaHtml('Lưu ý cho marketing', 'luuY', p, { canh: true });

  /* --- chính sách chung áp cho sản phẩm này --- */
  if (p.chinhSach.length) {
    h += '<section class="muc"><h4>Chính sách &amp; khuyến mãi áp dụng</h4>' +
      p.chinhSach.map((c) => {
        const noiBo = /Chỉ nội bộ/.test(c.truyenThong);
        return '<div class="cs' + (noiBo ? ' noiBo' : '') + '">' +
          '<div class="csDau"><span class="csTen" data-no-i18n>' + esc(c.ten) + '</span>' +
          (c.loai ? '<span class="nhan">' + esc(c.loai) + '</span>' : '') +
          (c.truyenThong ? '<span class="nhan' + (noiBo ? ' het' : '') + '">' + esc(c.truyenThong) + '</span>' : '') +
          (c.den ? '<span class="nhan' + (/hết hạn/i.test(c.tinhTrang) ? ' canh' : '') + '">đến ' + veNgay(c.den) + '</span>' : '') +
          '</div>' +
          '<div class="csNoi" data-no-i18n>' + esc(c.noiDung) + '</div>' +
          (c.nguon ? '<div class="lk" style="margin-top:6px"><a href="' + esc(c.nguon) +
            '" target="_blank" rel="noopener">Nguồn</a></div>' : '') +
          '</div>';
      }).join('') + '</section>';
  }

  /* --- media --- */
  const lk = [];
  if (p.anhVI) lk.push(['Ảnh lịch trình VI', p.anhVI]);
  if (p.anhEN) lk.push(['Ảnh lịch trình EN', p.anhEN]);
  if (p.video && /^https?:/.test(p.video)) lk.push(['Video tổng quan', p.video]);
  if (p.thuMuc) lk.push(['Thư mục media', p.thuMuc]);
  if (p.chuongTrinh) lk.push(['Chương trình chi tiết', p.chuongTrinh]);
  for (const m of p.media) {
    if (m.link && !lk.some(([, u]) => u === m.link)) lk.push([m.ten, m.link]);
  }
  if (lk.length) {
    h += '<section class="muc"><h4>Ảnh · video · tài liệu</h4><div class="lk">' +
      lk.map(([t, u]) => '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t) + '</a>').join('') +
      '</div></section>';
  }
  if (p.video && !/^https?:/.test(p.video)) {
    h += '<section class="muc"><h4>Video tổng quan</h4><div class="noi" data-no-i18n>' +
      esc(p.video) + '</div></section>';
  }

  /* --- gốc dữ liệu --- */
  h += '<section class="muc"><h4>Nguồn &amp; cập nhật</h4><div class="noi" data-no-i18n>' +
    esc(p.nguon || 'chưa ghi nguồn') +
    (p.capNhat ? XUONG + 'Sửa lần cuối: ' + veNgay(p.capNhat) +
      (p.nguoiCapNhat ? ' · ' + p.nguoiCapNhat : '') : '') +
    '</div>' +
    '<div class="lk" style="margin-top:8px">' +
    '<a href="' + esc(S.baseUrl) + '" target="_blank" rel="noopener">Sửa trong Lark Base</a>' +
    '</div></section>';

  $('#soThan').innerHTML = h;
  $('#soThan').scrollTop = 0;
  ve();
}

/* ---------------------------------------------------------------------------
 * GHI
 * ------------------------------------------------------------------------- */

/**
 * Ghi một ô xuống Base rồi cập nhật bản nhớ trong máy.
 *
 * Không vẽ lại cả màn sau mỗi lần ghi: đang gõ trong ô mà màn vẽ lại thì mất
 * con trỏ. Chỉ cập nhật đúng đối tượng, đánh dấu ô vừa lưu, và làm mới dải thẻ
 * số ở trên (vì con số vừa đổi).
 */
async function ghiO(o) {
  const id = o.dataset.id;
  const truong = o.dataset.sua;
  const p = S.ds.find((x) => x.id === id);
  if (!p) return;
  const cu = p[truong];
  const moi = o.type === 'number'
    ? (o.value === '' ? null : Number(o.value))
    : o.type === 'date'
      ? (o.value ? Date.parse(o.value + 'T00:00:00+07:00') : 0)
      : o.value.trim();
  /* Không gọi Base khi không có gì đổi — gõ vào rồi bấm ra ngoài là một sự kiện
     change kể cả khi chữ y nguyên. */
  const bang = o.type === 'date' ? (cu || 0) === (moi || 0) : (cu == null ? '' : cu) === (moi == null ? '' : moi);
  if (bang) return;

  o.classList.add('dangLuu');
  o.disabled = true;
  try {
    await guiJson('/api/san-pham/' + id, {
      truong,
      giaTri: o.type === 'date' ? o.value : o.value,
    });
    p[truong] = moi;
    o.classList.remove('dangLuu');
    o.classList.add('daLuu');
    setTimeout(() => o.classList.remove('daLuu'), 1400);
    S.tomTat = await api('/api/tong-quan');
    const dai = $('.dai');
    if (dai) dai.outerHTML = veDai();
    veTabs();
  } catch (e) {
    o.classList.remove('dangLuu');
    /* Trả ô về giá trị cũ: để nguyên là màn hình nói một đằng, Base một nẻo. */
    if (o.type === 'number') o.value = cu == null ? '' : cu;
    else if (o.type === 'date') o.value = veNgayO(cu);
    else o.value = cu || '';
    toast(e.message, 'err');
  } finally {
    o.disabled = false;
  }
}

async function ghiHangLoat(truong, giaTri) {
  const ids = [...S.chonHangLoat];
  if (!ids.length) return;
  try {
    await guiJson('/api/san-pham/hang-loat', { ids, truong, giaTri });
    for (const id of ids) {
      const p = S.ds.find((x) => x.id === id);
      if (p) p[truong] = giaTri;
    }
    S.tomTat = await api('/api/tong-quan');
    toast('Đã đặt cho ' + ids.length + ' sản phẩm.', 'ok');
    S.chonHangLoat.clear();
    ve();
  } catch (e) {
    toast(e.message, 'err');
    await nap(true);
    ve();
  }
}

/* ---------------------------------------------------------------------------
 * NẠP + SỰ KIỆN
 * ------------------------------------------------------------------------- */

async function nap(moi) {
  const d = await api('/api/san-pham' + (moi ? '?moi=1' : ''));
  S.ds = d.ds || [];
  S.tomTat = d.tomTat;
  S.capNhat = d.capNhat;
}

async function khoiTao() {
  try {
    const [kt] = await Promise.all([api('/api/khoi-tao'), nap(false)]);
    S.me = kt.me;
    S.chon = kt.chon;
    S.suaDuoc = kt.suaDuoc || {};
    S.baseUrl = kt.baseUrl;
    S.baseUrlBoSung = kt.baseUrlBoSung;
    ve();
  } catch (e) {
    $('#man').innerHTML = '<div class="dangTai err">Không đọc được Base: ' + esc(e.message) + '</div>';
    $('#man').removeAttribute('aria-busy');
  }
}

document.addEventListener('click', async (ev) => {
  const tab = ev.target.closest('[data-tab]');
  if (tab) { S.tab = tab.dataset.tab; S.chonHangLoat.clear(); ve(); return; }

  /* Thẻ số bấm được: nhảy sang đúng danh sách nằm sau con số đó. */
  const the = ev.target.closest('[data-the]');
  if (the) {
    const di = DI_THE[the.dataset.the];
    if (di) {
      xoaLoc();
      if (di.loc) Object.assign(S.loc, di.loc);
      S.tab = di.tab;
      S.chonHangLoat.clear();
      ve();
      $('#man').scrollIntoView({ block: 'start' });
    }
    return;
  }

  const mo = ev.target.closest('[data-mo]');
  if (mo) {
    const p = S.ds.find((x) => x.id === mo.dataset.mo);
    veSo(p && p.id === S.moId ? null : p);
    return;
  }

  /* Bấm vào ô sửa trong bảng thì KHÔNG mở ngăn chi tiết — nếu không thì mỗi lần
     chỉnh giá là ngăn lại bật ra che mất bảng. */
  if (ev.target.closest('.oSua, .tick, .hangLoat')) return;

  const card = ev.target.closest('.the[data-id], .dong[data-id]');
  if (card) {
    const p = S.ds.find((x) => x.id === card.dataset.id);
    veSo(p && p.id === S.moId ? null : p);
    return;
  }

  if (ev.target.id === 'soDong') { veSo(null); return; }

  if (ev.target.id === 'btnXoaLoc') { xoaLoc(); ve(); return; }
  if (ev.target.id === 'boChon') { S.chonHangLoat.clear(); ve(); return; }

  if (ev.target.id === 'btnBase') {
    /* Tab "Cần bổ sung" mở thẳng view tương ứng trên Base — người vào đó là để
       điền, không phải để ngắm cả bảng 59 dòng. */
    window.open(S.tab === 'thieu' ? S.baseUrlBoSung : S.baseUrl, '_blank', 'noopener');
    return;
  }

  if (ev.target.id === 'btnLamMoi') {
    const b = ev.target;
    if (b.disabled) return;
    b.disabled = true;
    const cu = b.textContent;
    b.textContent = 'Đang đọc…';
    try {
      await nap(true);
      if (S.moId) { const p = S.ds.find((x) => x.id === S.moId); veSo(p || null); } else ve();
      toast('Đã đọc lại từ Lark Base.', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      b.disabled = false;
      b.textContent = cu;
    }
    return;
  }

  const chep = ev.target.closest('[data-chep]');
  if (chep) {
    const o = document.getElementById(chep.dataset.chep);
    if (!o) return;
    try {
      await navigator.clipboard.writeText(o.textContent);
      toast('Đã chép.', 'ok');
    } catch (_) {
      /* Trình duyệt chặn clipboard khi trang không chạy https (localhost thì
         được). Chọn sẵn chữ để người dùng Ctrl+C — đừng để nút bấm vào im lặng. */
      const r = document.createRange();
      r.selectNodeContents(o);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      toast('Không chép tự động được — chữ đã được bôi sẵn, bấm Ctrl+C.', 'err');
    }
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'oTim') {
    S.loc.tim = ev.target.value;
    const vt = ev.target.selectionStart;
    ve();
    /* Vẽ lại làm mất con trỏ trong ô tìm — trả lại đúng chỗ, nếu không thì gõ
       được một chữ là phải bấm lại vào ô. */
    const moi = $('#oTim');
    if (moi) { moi.focus(); try { moi.setSelectionRange(vt, vt); } catch (_) {} }
  }
});

document.addEventListener('change', async (ev) => {
  const l = ev.target.closest('[data-loc]');
  if (l) { S.loc[l.dataset.loc] = l.value; S.chonHangLoat.clear(); ve(); return; }

  if (ev.target.id === 'chonHet') {
    const ds = locDanhMuc(S.ds);
    if (ev.target.checked) ds.forEach((p) => S.chonHangLoat.add(p.id));
    else S.chonHangLoat.clear();
    ve();
    return;
  }

  const tick = ev.target.closest('[data-tick]');
  if (tick) {
    if (tick.checked) S.chonHangLoat.add(tick.dataset.tick);
    else S.chonHangLoat.delete(tick.dataset.tick);
    ve();
    return;
  }

  const o = ev.target.closest('.oSua');
  if (!o) return;
  /* CHỈ ghi khi sự kiện đến từ NGƯỜI, không từ mã.
   *
   * App chạy trong lớp vỏ cùng với mấy đoạn mã hub chèn vào (i18n dịch nhãn,
   * thugon.js gập khối lọc, loc.js khoác dãy nút cho <select> rồi
   * `dispatchEvent(new Event('change'))`). Bất kỳ đoạn nào trong số đó chạm vào
   * một ô của app là một dòng lặng lẽ đổi giá trên Base cả phòng đang đọc.
   * `isTrusted` phân biệt đúng chuyện đó: sự kiện do trình duyệt sinh ra từ thao
   * tác thật thì true, sự kiện do script bắn ra thì false. */
  if (ev.isTrusted === false) return;
  if (o.dataset.id === '__nhieu__') {
    const v = o.value;
    o.value = '';
    if (v) await ghiHangLoat(o.dataset.sua, v);
    return;
  }
  await ghiO(o);
  /* Ngăn chi tiết đang mở chính dòng vừa sửa thì vẽ lại nó — nhãn ở đầu ngăn
     (ưu tiên, sắp ra mắt) vừa đổi theo. Ô textarea thì không, kẻo mất con trỏ. */
  if (S.moId === o.dataset.id && o.tagName !== 'TEXTAREA') {
    const p = S.ds.find((x) => x.id === S.moId);
    if (p) veSo(p);
  }
});

/* <details> không bắn sự kiện nổi bọt, nên bắt ở pha capture. */
document.addEventListener('toggle', (ev) => {
  const t = ev.target.closest ? ev.target.closest('[data-tang]') : null;
  if (!t) return;
  if (t.open) S.tangMo.add(t.dataset.tang);
  else S.tangMo.delete(t.dataset.tang);
}, true);

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && S.moId) veSo(null);
});

khoiTao();
