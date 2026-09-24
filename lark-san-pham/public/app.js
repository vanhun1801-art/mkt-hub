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
  cotDatLich: [],
  lich: null,          // null = chưa nạp; mảng = danh sách lịch đổi
  lichMoForm: false,
  /* Nhóm sản phẩm nào đang mở trong khu Lịch đổi. Vẽ lại sau mỗi thao tác
     mà không nhớ thì nó đóng sập đúng chỗ người ta vừa mở ra xem. */
  lichMo: new Set(),
  /* id dòng lịch đang sửa; rỗng = form đang ở chế độ thêm mới. */
  lichSua: '',
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

/** Mức giảm của một chính sách, viết gọn thành một nhãn. Rỗng nếu không giảm tiền. */
function mucGiam(c) {
  const ds = [];
  /* Tour ghép giảm theo VÉ, không phân biệt lớn nhỏ — hai cột bằng nhau thì gộp
     thành một nhãn, đừng in "−50.000đ/NL · −50.000đ/TE". */
  if (c.giamNL && c.giamNL === c.giamTE) ds.push('−' + tien(c.giamNL) + 'đ/vé');
  else {
    if (c.giamNL) ds.push('−' + tien(c.giamNL) + 'đ/NL');
    if (c.giamTE) ds.push('−' + tien(c.giamTE) + 'đ/TE');
  }
  if (c.giamPhanTram) ds.push('−' + c.giamPhanTram + '%');
  return ds.join(' · ');
}

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
  /* Sắp đổi nội dung: đứng CUỐI nhưng màu tím riêng, không lẫn với cảnh báo hạn.
     Đây là thứ sắp tới chứ không phải việc đang sai. */
  if (p.lichCho && p.lichCho.length) {
    ds.push('<span class="nhan doi">⏳ đổi ' + esc(veNgay(p.lichCho[0].ngayApDung)) +
      (p.lichCho.length > 1 ? ' · ' + p.lichCho.length + ' mục' : '') + '</span>');
  }
  return ds.join('');
}

/**
 * Giá trên thẻ và trên dòng.
 *
 * Giá trong bảng Sản phẩm là GIÁ CÔNG BỐ THÔ — Kinh doanh nhập sao để vậy, chưa
 * trừ khuyến mãi nào. Mức giảm nằm ở bảng Chính sách, và chỉ những dòng được bật
 * "Áp vào giá hiển thị" mới được trừ (xem kho.js → trongGiaHienThi).
 *
 * Khi có giảm thì in SỐ KHÁCH THỰC TRẢ to nhất, giá gốc gạch ngang bên cạnh, kèm
 * chip "-100.000đ". In mỗi giá sau giảm thì người viết content không biết mình
 * đang được phép nói "giảm bao nhiêu"; in mỗi giá gốc thì đăng lên sai giá.
 */
function giaHtml(p) {
  const g = p.giaSauGiam;
  if (p.giaNL != null) {
    if (g && g.nl != null && g.truNL > 0) {
      return '<span class="gia">' + tien(g.nl) + 'đ</span>' +
        '<span class="giaGoc">' + tien(p.giaNL) + 'đ</span>' +
        '<span class="chipGiam">−' + tien(g.truNL) + 'đ</span>' +
        (g.te != null && p.giaTE != null
          ? '<span class="giaTe">trẻ em ' + tien(g.te) + 'đ</span>' : '');
    }
    return '<span class="gia">' + tien(p.giaNL) + 'đ</span>' +
      (p.giaTE != null ? '<span class="giaTe">trẻ em ' + tien(p.giaTE) + 'đ</span>' : '');
  }
  /* Tour riêng không có một giá công bố: giá đổi theo số khách. In mức RẺ NHẤT
     kèm số khách đi cùng nó — "từ 850.000đ" đứng một mình là hứa hão, vì đoàn 2
     khách trả gấp năm. */
  if (p.giaPax && p.giaPax.length) {
    const min = Math.min(...p.giaPax.filter((x) => x.giaNL != null).map((x) => x.giaNL));
    /* Mức rẻ nhất thường trải trên NHIỀU bậc (22 và 23 khách cùng 850.000đ) —
       lấy bậc THẤP NHẤT đạt mức đó, và nói "đoàn từ", vì đó mới là điều kiện
       thật để được giá này. */
    const bac = p.giaPax.filter((x) => x.giaNL === min).map((x) => x.soKhach);
    if (Number.isFinite(min) && bac.length) {
      return '<span class="gia">từ ' + tien(min) + 'đ</span>' +
        '<span class="giaTe">/khách · đoàn từ ' + Math.min(...bac) + '</span>';
    }
  }
  if (p.ghiChuGia) return '<span class="giaChu">' + esc(p.ghiChuGia) + '</span>';
  return '<span class="giaChu">chưa có giá công bố</span>';
}

/** Giá gọn cho một dòng Bảng đẩy. */
function giaDongHtml(p) {
  const g = p.giaSauGiam;
  if (p.giaNL == null) {
    return '<i class="giaChu">' + esc(p.ghiChuGia ? 'theo báo giá' : 'chưa có giá') + '</i>';
  }
  if (g && g.nl != null && g.truNL > 0) {
    return tien(g.nl) + 'đ<span class="giaGoc">' + tien(p.giaNL) + 'đ</span>';
  }
  return tien(p.giaNL) + 'đ';
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
  /* `the: true` = bày dạng THẺ. Bốn tầng đầu là việc phải làm nên đáng chỗ trên
     màn hình; bốn tầng dưới chỉ để tra nên bày dòng gọn và gập sẵn.
     `mau` là mã màu CSS thật, dùng chung cho vạch tầng, chấm ở thanh phân bổ và
     viền thẻ — một tầng một màu, nhìn đâu cũng nhận ra. */
  { id: 'sap-ra-mat', ten: 'Sắp ra mắt', icon: '🆕', mau: '#8b5cf6', the: true, mo: true,
    ghi: 'Chuẩn bị nội dung trước ngày mở bán',
    hop: (p) => laSapRaMat(p) },
  { id: 'uu-tien', ten: 'Ưu tiên đẩy', icon: '🔥', mau: '#e5484d', the: true, mo: true,
    ghi: 'Dồn ngân sách và nội dung vào nhóm này',
    hop: (p) => /Ưu tiên đẩy/.test(p.uuTien) },
  { id: 'hang-ngay', ten: 'Chạy hằng ngày', icon: '🟢', mau: '#12a150', the: true, mo: true,
    ghi: 'Có bài đều mỗi ngày, giữ nhịp',
    hop: (p) => /Chạy hằng ngày/.test(p.uuTien) },
  { id: 'chua-xep', ten: 'Chưa xếp mức', icon: '⬜', mau: '#8b95a7', the: true, mo: true,
    ghi: 'Cần quản lý xếp mức ưu tiên',
    hop: (p) => !p.uuTien },
  { id: 'duy-tri', ten: 'Duy trì', icon: '🔵', mau: '#2b5cff', the: false, mo: false,
    ghi: 'Giữ hồ sơ đủ, chạy khi có nhu cầu',
    hop: (p) => /Duy trì/.test(p.uuTien) },
  { id: 'theo-mua', ten: 'Theo mùa / theo yêu cầu', icon: '🌤', mau: '#eab308', the: false, mo: false,
    ghi: 'Chỉ đẩy khi Kinh doanh yêu cầu hoặc vào mùa',
    hop: (p) => /Theo mùa/.test(p.uuTien) },
  { id: 'tam-dung', ten: 'Tạm dừng đẩy', icon: '⏸', mau: '#8b95a7', the: false, mo: false,
    ghi: 'Không chạy truyền thông lúc này',
    hop: (p) => /Tạm dừng/.test(p.uuTien) },
  { id: 'khac', ten: 'Mức khác', icon: '·', mau: '#8b95a7', the: false, mo: false,
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
  muc.push(['ban-do', 'Bản đồ', null, false]);
  if (laQuanLy()) muc.push(['quan-ly', 'Quản lý', S.ds.length, false]);
  $('#tabs').innerHTML = muc.map(([id, ten, n, canh]) =>
    '<button class="pill' + (S.tab === id ? ' on' : '') + '" data-tab="' + id + '">' + esc(ten) +
    (n == null ? '' : '<span class="dem' + (canh ? ' canh' : '') + '">' + n + '</span>') + '</button>').join('');
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
      (o.muc === 'cao' ? ' cao' : o.muc === 'vua' ? ' vua' : '') +
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
    '<span class="dGia">' + giaDongHtml(p) + '</span>' +
    '<span class="dNhan">' + nhanHtml(p) + '</span>' +
    '</div>';
}

/**
 * Thanh phân bổ — một vạch ngang chia theo tỉ lệ số sản phẩm mỗi tầng.
 *
 * Con số thì phải đọc rồi so; một vạch màu thì liếc là thấy ngay "gần như cả kho
 * đang nằm ở Duy trì, chỉ 2 cái chạy hằng ngày". Bấm một khúc là nhảy tới tầng đó.
 */
function phanBoHtml(nhom) {
  const tong = nhom.reduce((n, x) => n + x.ds.length, 0);
  if (!tong) return '';
  const co = nhom.filter((x) => x.ds.length);
  return '<div class="phanBo">' +
    '<div class="pbVach">' + co.map(({ tang, ds }) =>
      '<button class="pbKhuc" data-toi-tang="' + tang.id + '"' +
      ' style="flex:' + ds.length + ';background:' + tang.mau + '"' +
      ' title="' + esc(tang.ten + ' — ' + ds.length + ' sản phẩm') + '">' +
      (ds.length / tong > 0.08 ? ds.length : '') + '</button>').join('') + '</div>' +
    '<div class="pbChu">' + co.map(({ tang, ds }) =>
      '<button class="pbMuc" data-toi-tang="' + tang.id + '">' +
      '<span class="pbCham" style="background:' + tang.mau + '"></span>' +
      esc(tang.ten) + ' <b>' + ds.length + '</b></button>').join('') + '</div>' +
    '</div>';
}

/**
 * Thẻ trên Bảng đẩy — đúng bảy thứ anh Hùng cần, không hơn:
 * mã · tên Việt + Anh · giá trước và sau ưu đãi · giá trẻ em · mức ưu tiên ·
 * USP · ngày bắt đầu và kết thúc.
 *
 * CỐ Ý bỏ dòng "Hồ sơ đủ, chạy được" và nhãn "thiếu …": đó là trạng thái hồ sơ,
 * đã có hẳn tab **Cần bổ sung** lo. Để trên thẻ thì mỗi sản phẩm cõng thêm một
 * dòng mà chín trên mười lần chỉ nói "không có gì phải làm".
 *
 * Giữ nhãn "⏳ đổi": nó nói về thứ SẮP tới, không phải trạng thái hồ sơ.
 *
 * Thẻ cũng không mang màu tầng: nó đã nằm trong khối tầng có tiêu đề rồi.
 */
/**
 * Khối "sắp đổi thành gì" trên thẻ sản phẩm.
 *
 * Trước đây chỗ này chỉ là một nhãn đếm số: "⏳ đổi 15/10/2026 · 2 mục". Anh
 * Hùng, nhìn thẻ của một tour SẮP RA MẮT: "nó hiển thị các thông tin trên base,
 * thay vì thông tin chuẩn bị được thay đổi trong thời gian tới". Đúng: với tour
 * chưa mở bán, nội dung đang nằm trên Base là bản sắp bị thay, còn bản thật thì
 * nằm trong Lịch đổi mà thẻ không hé ra chữ nào.
 *
 * Nên in thẳng giá trị mới. KHÔNG thay vào chỗ giá trị cũ: hôm nay bán theo bản
 * cũ, người viết bài cần cả hai — cái đang chạy và cái sắp tới. Nhãn ngày đứng
 * ngay trên từng mục để không ai nhầm đây là nội dung đã hiệu lực.
 *
 * Mỗi mục cắt một dòng cho các thẻ cao bằng nhau; đọc trọn thì bấm vào thẻ.
 */
function sapDoiHtml(p) {
  if (!p.lichCho || !p.lichCho.length) return '';
  /* Cả đợt thường cùng một ngày (Kinh doanh gửi từng đợt). Ngày đó ghi một lần
     ở đầu khối, đỡ lặp lại trên mỗi dòng của một thẻ vốn đã hẹp. Khác ngày thì
     mới ghi kèm từng mục — lúc đó nó là thông tin thật, không phải tiếng ồn. */
  const ngay = p.lichCho.map((x) => x.ngayApDung);
  const motNgay = ngay.every((t) => t === ngay[0]);
  const muc = p.lichCho.slice(0, 3).map((x) =>
    '<div class="sdMuc">' +
      '<div class="sdCot">' +
        (motNgay ? '' : esc(veNgay(x.ngayApDung)) + ' · ') + esc(x.cot) +
      '</div>' +
      (x.moi ? '<div class="sdMoi" data-no-i18n>' + esc(x.moi) + '</div>' : '') +
    '</div>').join('');
  const con = p.lichCho.length - 3;
  return '<div class="sapDoi">' +
    '<div class="sdDau">⏳ Sắp đổi' +
      (motNgay ? ' <span class="sdNgay">từ ' + esc(veNgay(ngay[0])) + '</span>' : '') +
    '</div>' + muc +
    (con > 0 ? '<div class="sdCon">và ' + con + ' mục nữa</div>' : '') +
    '</div>';
}

function theDayHtml(p) {
  /* KHÔNG gắn nhãn mức ưu tiên hay "Sắp ra mắt" ở đây: thẻ đang nằm trong đúng
     cái tầng mang tên đó rồi, in lại là nói hai lần cùng một điều. */
  return '<article class="theDay' + (S.moId === p.id ? ' chon' : '') + '" data-id="' + esc(p.id) + '">' +
    '<div class="tdDau">' +
      (p.ma ? '<span class="ma">' + esc(p.ma) + '</span>' : '') +
      '<span class="tdTen" data-no-i18n>' + esc(p.ten) + '</span>' +
    '</div>' +
    (p.tenEn ? '<div class="tdEn" data-no-i18n>' + esc(p.tenEn) + '</div>' : '') +
    '<div class="giaHang">' + giaHtml(p) + '</div>' +
    (p.usp || p.noiBat
      ? '<div class="tdUsp" data-no-i18n>' + esc(p.usp || p.noiBat) + '</div>' : '') +
    sapDoiHtml(p) +
    hanHtml(p) +
    '</article>';
}

/**
 * Ngày bắt đầu – kết thúc hiệu lực.
 *
 * Viết thẳng hai mốc thay vì một nhãn "⚠️ Sắp hết hạn" riêng: hai mốc trả lời
 * được cả "còn bán tới bao giờ" lẫn "có sắp hết không" trong một dòng. Vẫn tô
 * vàng/đỏ theo cột `Tình trạng hiệu lực` của Base để liếc ra được.
 */
function hanHtml(p) {
  if (!p.hieuLucTu && !p.hieuLucDen) return '';
  const lop = /Đã hết hạn/.test(p.tinhTrang) ? ' het'
    : /Sắp hết hạn/.test(p.tinhTrang) ? ' canh' : '';
  const chu = p.hieuLucDen
    ? (p.hieuLucTu ? veNgay(p.hieuLucTu) + ' → ' : 'đến ') + veNgay(p.hieuLucDen) +
      (p.conLai != null ? ' · còn ' + p.conLai + ' ngày' : '')
    : 'từ ' + veNgay(p.hieuLucTu) + ' · chưa đặt hạn';
  return '<div class="tdHan' + lop + '">' + esc(chu) + '</div>';
}

function bangDayHtml() {
  motTangMacDinh();
  const nhom = chiaTang(S.ds);

  /* MÃ ĐÃ CÓ ĐANG CHỜ CẬP NHẬT — đi kèm tầng "Sắp ra mắt".
     Anh Hùng, chỉ vào băng "Sắp ra mắt": "chỗ này hiện luôn giúp anh các thông
     tin chuẩn bị thay đổi trên các mã sản phẩm đã có trước đó, chỉ là update".
     Cùng một câu hỏi "sắp tới có gì khác đi" mà đang phải xem hai nơi: tour mới
     thì ở đây, còn tour cũ sắp đổi lịch trình thì nằm rải trong các tầng bên
     dưới. Gom lại một chỗ. Tách khối con có nhãn riêng chứ không trộn chung
     lưới: mã mới mở bán và mã chỉ đổi nội dung là hai việc khác nhau. */
  const daCoTrongTang = new Set((nhom[0] ? nhom[0].ds : []).map((p) => p.id));
  const choCapNhat = S.ds
    .filter((p) => p.trangThai !== 'Ngừng bán' && p.lichCho && p.lichCho.length
      && !daCoTrongTang.has(p.id))
    .sort((a, b) => (a.lichCho[0].ngayApDung || 0) - (b.lichCho[0].ngayApDung || 0));

  let html = phanBoHtml(nhom);
  html += '<p class="dan">Mỗi sản phẩm nằm ở đúng một tầng. “Sắp ra mắt” đứng trên cùng vì ' +
    'việc phải làm là kịp nội dung cho ngày mở bán.' +
    (choCapNhat.length
      ? ' Băng đó kèm luôn những mã đã có đang chờ cập nhật, nên các mã này hiện hai lần: ' +
        'một ở trên cùng, một ở tầng của chúng.'
      : '') +
    (laQuanLy() ? ' Đổi tầng của một sản phẩm ở tab Quản lý hoặc trong ngăn chi tiết.' : '') +
    '</p>';
  for (const { tang, ds } of nhom) {
    const themCapNhat = tang.id === 'sap-ra-mat' ? choCapNhat : [];
    if (!ds.length && !themCapNhat.length) continue;
    /* <details> chứ không phải nút tự viết: gập/mở là hành vi sẵn có của trình
       duyệt, đọc được bằng bàn phím và trình đọc màn hình mà không cần thêm mã. */
    const dangMo = S.tangMo.has(tang.id);
    html += '<details class="tang" id="tang-' + tang.id + '" data-tang="' + tang.id + '"' +
      ' style="--tang:' + tang.mau + '"' + (dangMo ? ' open' : '') + '>' +
      '<summary class="tangDau">' +
        '<span class="tangIcon">' + esc(tang.icon) + '</span>' +
        '<b>' + esc(tang.ten) + '</b>' +
        '<span class="dem">' + ds.length + '</span>' +
        '<span class="tangMo">' + esc(tang.ghi) + '</span>' +
      '</summary>' +
      (ds.length
        ? (tang.the
          ? '<div class="tangLuoi">' + ds.map(theDayHtml).join('') + '</div>'
          : '<div class="tangThan">' + ds.map(dongHtml).join('') + '</div>')
        : '') +
      (themCapNhat.length
        ? '<div class="cnDau">' +
            '<span class="tangIcon">🔄</span><b>Cập nhật trên mã đã có</b>' +
            '<span class="dem">' + themCapNhat.length + '</span>' +
            '<span class="tangMo">Mã cũ, chỉ đổi nội dung — không phải sản phẩm mới</span>' +
          '</div>' +
          '<div class="tangLuoi">' + themCapNhat.map(theDayHtml).join('') + '</div>'
        : '') +
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

/* ---------------------------------------------------------------------------
 * LỊCH ĐỔI THÔNG TIN
 *
 * Đặt trước một thay đổi, tới ngày app tự ghi xuống Base. Kinh doanh gửi đợt
 * đổi lịch trình cho 8 tour hẹn 01/10 — trước đây phòng phải nhớ rồi hôm đó
 * ngồi sửa tay từng dòng.
 * ------------------------------------------------------------------------- */

const LOP_TT = {
  'Chờ áp dụng': 'cho', 'Đã áp dụng': 'xong', 'Đã huỷ': 'huy', 'Lỗi': 'loi',
};

function lichHtml() {
  const ds = S.lich;

  /* Dòng tóm tắt trên đầu: trả lời "có gì đang chờ không" mà không phải mở
     khối nào. Đây là thứ người ta liếc mỗi sáng. */
  let tom = '';
  if (ds && ds.length) {
    const cho = ds.filter((r) => r.trangThai === 'Chờ áp dụng');
    const chuaGan = cho.filter((r) => !r.sanPhamTen).length;
    const som = cho.length ? Math.min(...cho.map((r) => r.ngayApDung || Infinity)) : 0;
    const soSP = new Set(ds.map((r) => r.sanPhamTen)).size;
    tom = '<span class="klTom">' + ds.length + ' mục · ' + soSP + ' sản phẩm' +
      (som && Number.isFinite(som) ? ' · sớm nhất ' + esc(veNgay(som)) : '') + '</span>' +
      (chuaGan ? '<span class="klCanh">' + chuaGan + ' mục chưa gán sản phẩm</span>' : '');
  }

  let h = '<section class="khoiLich"><header class="klDau">' +
    '<b>Lịch đổi thông tin</b>' + tom +
    '<span class="sp"></span>' +
    '<button class="btn sm primary" id="lichThem">' +
    (S.lichMoForm ? 'Đóng' : '+ Đặt lịch đổi') + '</button>' +
    '</header>';

  /* MỘT form cho cả thêm mới lẫn sửa. Hai form riêng thì hai bộ kiểm, hai chỗ
     quên cập nhật khi thêm cột mới. */
  if (S.lichMoForm || S.lichSua) {
    const cu = S.lichSua ? (S.lich || []).find((r) => r.id === S.lichSua) : null;
    const sp = S.ds.slice().sort((a, b) => (a.ma || '').localeCompare(b.ma || ''));
    const spCu = cu && cu.spIds && cu.spIds.length ? cu.spIds[0] : '';
    h += '<form class="klForm" id="lichForm">' +
      (cu ? '<div class="klFormDau">Sửa dòng lịch</div>' : '') +
      '<label>Sản phẩm<select name="sanPham" required>' +
      '<option value="">— chọn —</option>' +
      sp.map((p) => '<option value="' + esc(p.id) + '"' + (spCu === p.id ? ' selected' : '') +
        ' data-no-i18n>' + esc((p.ma ? p.ma + ' — ' : '') + p.ten) + '</option>').join('') +
      '</select></label>' +
      '<label>Cột cần đổi<select name="cot" required>' +
      '<option value="">— chọn —</option>' +
      S.cotDatLich.map((c) => '<option' + (cu && cu.cot === c ? ' selected' : '') + '>' +
        esc(c) + '</option>').join('') +
      '</select></label>' +
      '<label>Ngày áp dụng<input type="date" name="ngay" required value="' +
        (cu ? veNgayO(cu.ngayApDung) : '') + '"></label>' +
      '<label class="rong">Giá trị mới' +
      '<textarea name="giaTri" rows="4" placeholder="Số thì gõ số trần (900000). Ngày thì YYYY-MM-DD. Chọn thì gõ đúng tên lựa chọn." data-no-i18n>' +
        esc(cu ? cu.giaTriMoi : '') + '</textarea></label>' +
      '<label class="rong">Ghi chú<input name="ghiChu" placeholder="Nguồn, lý do đổi…" value="' +
        esc(cu ? cu.ghiChu : '') + '" data-no-i18n></label>' +
      '<div class="klNut">' +
      '<button class="btn primary" type="submit">' + (cu ? 'Lưu' : 'Đặt lịch') + '</button>' +
      (cu ? '<button class="btn" type="button" id="lichThoi">Thôi</button>' : '') +
      '</div></form>';
  }

  if (!ds) return h + '<div class="trong">Đang đọc…</div></section>';
  if (!ds.length) return h + '<div class="trong">Chưa đặt lịch đổi nào.</div></section>';

  /* Gom THEO SẢN PHẨM và GẬP lại.
     Một đợt sinh 2 dòng cho mỗi tour; nếu bày hết cả nội dung mới thì 16 mục
     chiếm mấy màn hình và không còn nhìn ra bức tranh chung. Nên: mỗi sản phẩm
     một dòng tóm tắt, bấm mới mở ra các mục, bấm tiếp mới thấy nội dung mới. */
  const nhom = new Map();
  for (const r of ds) {
    const khoa = r.sanPhamTen || '';
    if (!nhom.has(khoa)) nhom.set(khoa, []);
    nhom.get(khoa).push(r);
  }
  /* Nhóm chưa gán sản phẩm lên ĐẦU và mở sẵn: chúng sẽ thành Lỗi đúng ngày áp
     dụng nếu không ai gán, nên không được nằm sau một cái nút gập. */
  const khoa = [...nhom.keys()].sort((a, b) => (a ? 1 : 0) - (b ? 1 : 0) || a.localeCompare(b, 'vi'));

  h += '<div class="klNhom">';
  for (const k of khoa) {
    const rs = nhom.get(k);
    const chuaGan = !k;
    const cho = rs.filter((r) => r.trangThai === 'Chờ áp dụng');
    const somNhat = cho.length ? Math.min(...cho.map((r) => r.ngayApDung || Infinity)) : 0;
    const mo = chuaGan || S.lichMo.has(k);
    h += '<details class="klSP' + (chuaGan ? ' chuaGan' : '') + '" data-lich-sp="' + esc(k) + '"' +
      (mo ? ' open' : '') + '>' +
      '<summary class="klSPDau">' +
        '<b data-no-i18n>' + esc(k || 'Chưa gán sản phẩm') + '</b>' +
        '<span class="klDem">' + rs.length + ' mục</span>' +
        (somNhat && Number.isFinite(somNhat)
          ? '<span class="klNgay">từ ' + esc(veNgay(somNhat)) + '</span>' : '') +
        '<span class="sp"></span>' +
        '<span class="klCot2">' + esc(rs.map((r) => r.cot).filter(Boolean).join(' · ')) + '</span>' +
      '</summary>' +
      rs.map((r) => {
        const choR = r.trangThai === 'Chờ áp dụng';
        return '<details class="klMuc"><summary class="klDong">' +
          '<span class="klCot">' + esc(r.cot || '—') + '</span>' +
          '<span class="ttLich tt-' + (LOP_TT[r.trangThai] || 'cho') + '">' +
            esc(r.trangThai || '—') + '</span>' +
          '<span class="klNgay2">' + esc(veNgay(r.ngayApDung) || '—') + '</span>' +
          (choR ? '<button class="btn sm" data-sua-lich="' + esc(r.id) + '">Sửa</button>' +
            '<button class="btn sm" data-huy-lich="' + esc(r.id) + '">Huỷ</button>'
            : '<span></span>') +
          '</summary>' +
          '<div class="klThan">' +
          '<div class="klGt" data-no-i18n>' + esc(r.giaTriMoi || '') + '</div>' +
          (r.ghiChu ? '<div class="klGhi" data-no-i18n>' + esc(r.ghiChu) + '</div>' : '') +
          (r.giaTriCu ? '<div class="klGhi" data-no-i18n>Bản cũ: ' + esc(r.giaTriCu) + '</div>' : '') +
          (r.apDungLuc ? '<div class="klGhi">áp lúc ' + esc(veNgay(r.apDungLuc)) + '</div>' : '') +
          '</div></details>';
      }).join('') +
      '</details>';
  }
  return h + '</div></section>';
}

async function napLich() {
  try { S.lich = (await api('/api/lich')).ds || []; }
  catch (e) { S.lich = []; toast(e.message, 'err'); }
  ve();
}

/* Tab Bản đồ: bản đồ du lịch Phú Quốc (lark-ban-do) phục vụ ở ban-do/ của chính app,
   dữ liệu tour dựng tươi từ Base. Giữ MỘT iframe: vẽ lại màn khác rồi quay về thì gắn
   lại đúng iframe đó, không tải lại bản đồ từ đầu. Đường tương đối để chạy được cả
   độc lập (localhost:5184/ban-do/) lẫn trong hub (/m/san-pham/ban-do/). */
let khungBanDo = null;
/* iframe nằm trong một vùng RIÊNG cạnh #man (không nằm trong #man): gỡ iframe khỏi
   trang là trình duyệt tải lại nó từ đầu, mà #man bị vẽ lại bằng innerHTML mỗi lần
   đổi tab. Nên chỉ ẩn/hiện, bản đồ giữ nguyên chỗ đang xem. */
function hienBanDo(bat) {
  const man = $('#man');
  let vung = $('#vungBanDo');
  if (bat && !vung) {
    vung = document.createElement('div');
    vung.id = 'vungBanDo';
    khungBanDo = document.createElement('iframe');
    khungBanDo.className = 'khung-ban-do';
    khungBanDo.title = 'Bản đồ du lịch Phú Quốc';
    khungBanDo.src = 'ban-do/';
    khungBanDo.setAttribute('allow', 'fullscreen; clipboard-write');   // nút "Tạo link gửi khách" chép link
    vung.appendChild(khungBanDo);
    man.parentNode.insertBefore(vung, man);
    addEventListener('resize', () => hienBanDo(S.tab === 'ban-do'));
  }
  if (vung) vung.hidden = !bat;
  man.hidden = !!bat;
  if (bat) khungBanDo.style.height = Math.max(420, innerHeight - khungBanDo.getBoundingClientRect().top - 12) + 'px';
}

/* ---------------- Hình bản đồ (tab Quản lý) ----------------
   Quản lý tự thay hình minh hoạ của bản đồ — điểm đến và phương tiện (nhiều mẫu máy bay,
   tàu…). Hình được cắt sát viền trong suốt + nén WebP 512 px NGAY TRÊN TRÌNH DUYỆT rồi mới
   gửi lên (ảnh xuất từ phần mềm vẽ thường vài MB, khung thừa nhiều), lưu vào bảng
   "Hình bản đồ" trên Base; bản đồ của cả phòng đổi ở lần mở sau. */
S.hinh = null;                 // null = chưa nạp
S.hinhMo = false;
async function napHinh() {
  try { S.hinh = (await api('/api/hinh-ban-do')).ds; } catch (e) { S.hinh = []; toast(e.message, 'err'); }
  if (S.tab === 'quan-ly') ve();
}
const NGUON_HINH = { base: 'Hình đã tải lên', goc: 'Hình dựng sẵn', 've-san': 'Hình vẽ sẵn' };
function hinhBanDoHtml() {
  if (S.hinh === null) { napHinh(); S.hinh = undefined; }
  const ds = S.hinh || [];
  const soRieng = ds.filter((o) => o.nguon === 'base').length;
  const o1 = (o) => '<div class="o-hinh" data-o-hinh="' + esc(o.ma) + '">' +
    '<div class="o-hinh-anh">' + (o.nguon === 've-san' ? '<span class="phu">Hình vẽ sẵn</span>'
      : '<img loading="lazy" alt="" src="ban-do/hinh/' + encodeURIComponent(o.ma) + '?v=' + encodeURIComponent(o.luc || 'goc') + '">') + '</div>' +
    '<b title="' + esc(o.ma) + '">' + esc(o.ten) + '</b>' +
    '<span class="phu">' + esc(NGUON_HINH[o.nguon] || '') + (o.nguoi ? ' · ' + esc(o.nguoi) : '') + '</span>' +
    (o.loi ? '<span class="loi-hinh" title="' + esc(o.loi) + '">Bản đồ chưa đọc được hình này: ' + esc(o.loi.slice(0, 160)) + '</span>' : '') +
    '<div class="o-hinh-nut">' +
      '<label class="btn sm">Tải hình<input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" data-tai-hinh="' + esc(o.ma) + '" hidden></label>' +
      '<label class="co-hinh" title="Cỡ hiển thị (1 = mặc định)">Cỡ <input type="number" min="0.3" max="3" step="0.1" value="' + (+o.co || 1) + '" data-co-hinh="' + esc(o.ma) + '"></label>' +
      (o.nguon === 'base' ? '<button class="btn sm" data-ve-mac-dinh="' + esc(o.ma) + '">Về mặc định</button>' : '') +
    '</div></div>';
  return '<details class="khoi-hinh"' + (S.hinhMo ? ' open' : '') + '><summary><b>Hình bản đồ</b> <span class="phu">' +
    (S.hinh === undefined ? 'đang đọc…' : soRieng + ' hình đã tải lên · PNG/WebP nền trong, app tự cắt viền và nén') + '</span></summary>' +
    '<div class="nhom-hinh-tieu">Điểm đến</div><div class="luoi-hinh">' + ds.filter((o) => o.nhom === 'diem').map(o1).join('') + '</div>' +
    '<div class="nhom-hinh-tieu">Phương tiện — mỗi loại nhiều mẫu, các chiếc trên bản đồ lần lượt dùng từng mẫu</div><div class="luoi-hinh">' + ds.filter((o) => o.nhom === 'xe').map(o1).join('') + '</div>' +
    '</details>';
}

/** Cắt sát viền trong suốt + thu về tối đa 512 px + WebP — chạy trên trình duyệt. */
async function nenHinh(tep) {
  const url = URL.createObjectURL(tep);
  try {
    const img = new Image();
    await new Promise((ok, loi) => { img.onload = ok; img.onerror = () => loi(new Error('Không đọc được hình này')); img.src = url; });
    const W = img.naturalWidth || 1024, H = img.naturalHeight || 1024, k0 = Math.min(1, 1600 / Math.max(W, H));
    const c = document.createElement('canvas'); c.width = Math.round(W * k0); c.height = Math.round(H * k0);
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x1 = c.width, y1 = c.height, x2 = -1, y2 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 10) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    }
    if (x2 < 0) throw new Error('Hình trong suốt hoàn toàn');
    const bw = x2 - x1 + 1, bh = y2 - y1 + 1, k = Math.min(1, 512 / Math.max(bw, bh));
    const o = document.createElement('canvas'); o.width = Math.round(bw * k); o.height = Math.round(bh * k);
    const go = o.getContext('2d'); go.imageSmoothingQuality = 'high';
    go.drawImage(c, x1, y1, bw, bh, 0, 0, o.width, o.height);
    return { anh: o.toDataURL('image/webp', .9), w: o.width, h: o.height };
  } finally { URL.revokeObjectURL(url); }
}

const taiLaiBanDo = () => { if (khungBanDo && khungBanDo.contentWindow) { try { khungBanDo.contentWindow.location.reload(); } catch (_) { khungBanDo.src = 'ban-do/'; } } };

async function taiHinhLen(inp) {
  const tep = inp.files && inp.files[0], ma = inp.dataset.taiHinh;
  inp.value = '';
  if (!tep) return;
  const o = $('[data-o-hinh="' + ma + '"]');
  if (o) o.classList.add('dang-tai');
  try {
    const n = await nenHinh(tep);
    await guiJson('/api/hinh-ban-do', { ma, anh: n.anh, w: n.w, h: n.h });
    toast('Đã thay hình ' + ma + ' (' + Math.round(n.anh.length * .75 / 1024) + ' KB sau khi nén).', 'ok');
    S.hinhMo = true; await napHinh(); taiLaiBanDo();
  } catch (e) { toast(e.message, 'err'); if (o) o.classList.remove('dang-tai'); }
}

function ve() {
  veTabs();
  const man = $('#man');
  hienBanDo(S.tab === 'ban-do');
  if (S.tab === 'ban-do') {
    man.removeAttribute('aria-busy');
    $('#phuDe').textContent = S.ds.length + ' sản phẩm · đọc lúc ' + gioPhut(S.capNhat);
    return;
  }
  if (S.tab === 'quan-ly' && laQuanLy()) {
    man.innerHTML = veDai() + lichHtml() + hinhBanDoHtml() + quanLyHtml();
    if (S.lich === null) napLich();
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
  h += '<section class="muc"><h4>Giá công bố' + (ql ? '<span class="suaDuoc">sửa được</span>' : '') +
    '</h4><p class="dan" style="margin:0 0 8px">Giá Kinh doanh công bố, CHƯA trừ khuyến mãi. ' +
    'Mức giảm khai ở bảng Chính sách &amp; Khuyến mãi trên Base.</p>';
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

  /* Bảng đối chiếu hai mức giá. Chỉ vẽ khi thật sự có giảm — không thì nó là một
     khối rỗng nói "giảm 0đ", tệ hơn là không có. */
  const gg = p.giaSauGiam;
  if (gg && (gg.truNL > 0 || gg.truTE > 0)) {
    const dong = (nhan, goc, tru, sau) => (goc == null ? '' :
      '<tr><td>' + esc(nhan) + '</td>' +
      '<td class="cSo">' + tien(goc) + 'đ</td>' +
      '<td class="cSo doGiam">−' + tien(tru || 0) + 'đ</td>' +
      '<td class="cSo manh">' + tien(sau) + 'đ</td></tr>');
    h += '<section class="muc"><h4>Giá khách thực trả</h4>' +
      '<table class="bang bangGia">' +
      '<tr><th></th><th class="cSo">Giá công bố</th><th class="cSo">Giảm</th>' +
      '<th class="cSo">Khách trả</th></tr>' +
      dong('Người lớn', p.giaNL, gg.truNL, gg.nl) +
      dong('Trẻ em', p.giaTE, gg.truTE, gg.te) +
      '</table>' +
      '<div class="dan" style="margin:8px 0 0"><span>Đã trừ:</span> ' +
      gg.ds.map((c) => '<b data-no-i18n>' + esc(c.ten) + '</b>').join(' · ') +
      (gg.ds.some((c) => c.ghiGiam)
        ? '<div class="noi" style="margin-top:6px" data-no-i18n>' +
          esc(gg.ds.map((c) => c.ghiGiam).filter(Boolean).join(XUONG)) + '</div>'
        : '') +
      '</div></section>';
  }

  if (p.giaPax && p.giaPax.length) {
    const coTE = p.giaPax.some((x) => x.giaTE != null);
    h += '<section class="muc"><h4>Giá theo số khách' +
      '<button class="btn sm" data-chep="paxBang">Chép</button></h4>' +
      '<p class="dan" style="margin:0 0 6px">Tour riêng tính giá trên đầu người, ' +
      'đoàn càng đông càng rẻ. Báo giá phải kèm số khách.</p>' +
      '<table class="bang bangGia" id="paxBang"><tr><th>Số khách</th>' +
      '<th class="cSo">Người lớn</th>' + (coTE ? '<th class="cSo">Trẻ em</th>' : '') + '</tr>' +
      p.giaPax.map((x) => '<tr><td>' + x.soKhach + ' khách</td>' +
        '<td class="cSo manh">' + (x.giaNL != null ? tien(x.giaNL) + 'đ' : '—') + '</td>' +
        (coTE ? '<td class="cSo">' + (x.giaTE != null ? tien(x.giaTE) + 'đ' : '—') + '</td>' : '') +
        '</tr>').join('') +
      '</table></section>';
  }

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
          (mucGiam(c) ? '<span class="nhan giam">' + esc(mucGiam(c)) + '</span>' : '') +
          (c.apGia ? '<span class="nhan ngay">đã trừ vào giá hiển thị</span>' : '') +
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

  /* --- lịch đổi đang chờ của chính sản phẩm này --- */
  if (p.lichCho && p.lichCho.length) {
    h += '<section class="muc"><h4>Sắp đổi</h4><div class="noi canh">' +
      p.lichCho.map((x) => '· ' + esc(x.cot) + ' — từ ' + esc(veNgay(x.ngayApDung)))
        .join(XUONG) +
      (laQuanLy() ? XUONG + '(đặt và huỷ ở tab Quản lý)' : '') +
      '</div></section>';
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

/**
 * Mở sẵn sổ chi tiết của một tour khi lớp vỏ gọi tới kèm `?rec=…`.
 *
 * Người ta bấm nút trên một tin sản phẩm ở trang Tổng quan; lớp vỏ nạp app này
 * kèm record id. Không đọc thì họ rơi vào danh sách 67 dòng và phải tự đi tìm
 * đúng cái tour vừa đọc tin — nút CTA coi như chỉ mở app chứ không dẫn tới đâu.
 *
 * Mã không khớp (tour bị xoá, link cũ) thì im lặng mở danh sách bình thường:
 * một lời báo lỗi ở đây không giúp được gì cho người đọc tin.
 */
function moTheoDuong() {
  let rec = '';
  try { rec = new URLSearchParams(location.search).get('rec') || ''; } catch (_) { return; }
  if (!rec) return;
  const p = S.ds.find((x) => x.id === rec);
  if (p) veSo(p);
}

async function khoiTao() {
  try {
    const [kt] = await Promise.all([api('/api/khoi-tao'), nap(false)]);
    S.me = kt.me;
    S.chon = kt.chon;
    S.suaDuoc = kt.suaDuoc || {};
    S.cotDatLich = kt.cotDatLich || [];
    S.baseUrl = kt.baseUrl;
    S.baseUrlBoSung = kt.baseUrlBoSung;
    ve();
    moTheoDuong();
  } catch (e) {
    $('#man').innerHTML = '<div class="dangTai err">Không đọc được Base: ' + esc(e.message) + '</div>';
    $('#man').removeAttribute('aria-busy');
  }
}

document.addEventListener('click', async (ev) => {
  const tab = ev.target.closest('[data-tab]');
  if (tab) { S.tab = tab.dataset.tab; S.chonHangLoat.clear(); ve(); return; }

  /* Hình bản đồ: nhớ khối đang mở (vẽ lại không đóng sập) + nút Về mặc định */
  const tomHinh = ev.target.closest('.khoi-hinh > summary');
  if (tomHinh) { S.hinhMo = !tomHinh.parentNode.open; return; }
  const veMd = ev.target.closest('[data-ve-mac-dinh]');
  if (veMd) {
    if (!ev.isTrusted) return;
    if (!confirm('Bỏ hình đã tải lên của "' + veMd.dataset.veMacDinh + '" và quay về hình mặc định?')) return;
    try { await guiJson('/api/hinh-ban-do/xoa', { ma: veMd.dataset.veMacDinh }); toast('Đã quay về hình mặc định.', 'ok'); await napHinh(); taiLaiBanDo(); }
    catch (e) { toast(e.message, 'err'); }
    return;
  }

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

  const toi = ev.target.closest('[data-toi-tang]');
  if (toi) {
    const id = toi.dataset.toiTang;
    S.tangMo.add(id);
    if (S.tab !== 'bang-day') { S.tab = 'bang-day'; }
    ve();
    const el = document.getElementById('tang-' + id);
    if (el) { el.open = true; el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
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

  const card = ev.target.closest('.the[data-id], .dong[data-id], .theDay[data-id]');
  if (card) {
    const p = S.ds.find((x) => x.id === card.dataset.id);
    veSo(p && p.id === S.moId ? null : p);
    return;
  }

  if (ev.target.id === 'soDong') { veSo(null); return; }

  if (ev.target.id === 'btnXoaLoc') { xoaLoc(); ve(); return; }

  if (ev.target.id === 'lichThem') {
    S.lichMoForm = !S.lichMoForm;
    S.lichSua = '';
    ve();
    return;
  }
  if (ev.target.id === 'lichThoi') { S.lichSua = ''; ve(); return; }

  const suaL = ev.target.closest('[data-sua-lich]');
  if (suaL) {
    /* Nút nằm trong <summary>; không chặn thì cú bấm vừa mở form vừa gập khối. */
    ev.preventDefault();
    S.lichSua = suaL.dataset.suaLich;
    S.lichMoForm = false;
    ve();
    const f = $('#lichForm');
    if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  const huy = ev.target.closest('[data-huy-lich]');
  if (huy) {
    /* Nút này nằm trong <summary>; không chặn thì một cú bấm vừa huỷ vừa gập
       khối lại, và người dùng không thấy kết quả mình vừa gây ra. */
    ev.preventDefault();
    if (!window.confirm('Huỷ dòng lịch này?')) return;
    try {
      await guiJson('/api/lich/' + huy.dataset.huyLich + '/huy', {});
      await napLich();
      toast('Đã huỷ.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    return;
  }
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
      /* bản đồ đọc lại du-lieu.js dựng tươi từ Base vừa đọc */
      if (khungBanDo && khungBanDo.contentWindow) { try { khungBanDo.contentWindow.location.reload(); } catch (_) { khungBanDo.src = 'ban-do/'; } }
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

  /* hình bản đồ — chỉ nhận thao tác của người (isTrusted), cùng lý do với ô sửa bên dưới */
  if (ev.target.matches('[data-tai-hinh]')) { if (ev.isTrusted !== false) await taiHinhLen(ev.target); return; }
  if (ev.target.matches('[data-co-hinh]')) {
    if (ev.isTrusted === false) return;
    try { await guiJson('/api/hinh-ban-do/co', { ma: ev.target.dataset.coHinh, co: +ev.target.value }); toast('Đã đổi cỡ hình.', 'ok'); taiLaiBanDo(); }
    catch (e) { toast(e.message, 'err'); }
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
  if (t) {
    if (t.open) S.tangMo.add(t.dataset.tang);
    else S.tangMo.delete(t.dataset.tang);
    return;
  }
  const l = ev.target.closest ? ev.target.closest('[data-lich-sp]') : null;
  if (l) {
    if (l.open) S.lichMo.add(l.dataset.lichSp);
    else S.lichMo.delete(l.dataset.lichSp);
  }
}, true);

document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'lichForm') return;
  ev.preventDefault();
  const f = ev.target;
  const nut = f.querySelector('button[type=submit]');
  if (nut.disabled) return;
  nut.disabled = true;
  try {
    const than = {
      sanPham: f.sanPham.value,
      cot: f.cot.value,
      ngay: f.ngay.value,
      giaTri: f.giaTri.value,
      ghiChu: f.ghiChu.value,
    };
    const dangSua = S.lichSua;
    await guiJson(dangSua ? '/api/lich/' + dangSua : '/api/lich/them', than);
    S.lichMoForm = false;
    S.lichSua = '';
    await napLich();
    toast(dangSua ? 'Đã lưu.' : 'Đã đặt lịch.', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    nut.disabled = false;
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && S.moId) veSo(null);
});

khoiTao();
