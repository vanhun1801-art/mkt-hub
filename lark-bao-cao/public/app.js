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
/* Hai màn quản lý có phạm vi RIÊNG, không dùng chung MOC với màn phiếu: quản lý
 * đang soi tháng trước của cả phòng mà bấm sang tab Hôm nay rồi quay lại thì
 * phải còn ở tháng đó. Mặc định THÁNG hiện tại — anh Hùng (02/10): soát cả
 * phòng là việc của cuối tháng, tuần chỉ xem khi cần nhìn kỹ một ai đó. */
let TP_LOC = 'thang-nay';
let HT_KYLOC = 'thang-nay';

/* ---------------- bản nháp trên máy (localStorage) ----------------
 * Mấy chỗ dưới đây chỉ giữ chữ đang gõ trong bộ nhớ: ghi chú xử lý ở Cần hỗ
 * trợ, Thiết lập, phiếu ĐÃ NỘP đang sửa. Lỡ tải lại trang (hay hub tự làm mới)
 * là mất trắng. Nên chép một bản xuống máy, có ghi giờ — quá 14 ngày coi như
 * bỏ dở hẳn, không đem ra khôi phục nữa. Chỉ xoá bản nháp SAU KHI máy chủ báo
 * lưu được; lưu hỏng thì nháp còn nguyên. */
const NHAP_HAN = 14 * 86400000;
const NHAP_TRUOC = 'bao-cao.nhap.';
function nhapDoc(khoa) {
  try {
    const v = JSON.parse(localStorage.getItem(NHAP_TRUOC + khoa) || 'null');
    if (!v || !v.luc || Date.now() - v.luc > NHAP_HAN) { if (v) localStorage.removeItem(NHAP_TRUOC + khoa); return null; }
    return v;
  } catch (_) { return null; }
}
function nhapGhi(khoa, v) {
  try { localStorage.setItem(NHAP_TRUOC + khoa, JSON.stringify(Object.assign({}, v, { luc: Date.now() }))); } catch (_) { /* hết chỗ / chặn lưu: thôi */ }
}
function nhapXoa(khoa) {
  try { localStorage.removeItem(NHAP_TRUOC + khoa); } catch (_) { /* không sao */ }
}
/* Ghi xuống máy chậm 0,4 giây sau phím cuối — gõ liên tục không ghi từng phím. */
const henNhap = {};
function nhapHen(khoa, layV) {
  clearTimeout(henNhap[khoa]);
  henNhap[khoa] = setTimeout(() => { delete henNhap[khoa]; const v = layV(); if (v) nhapGhi(khoa, v); else nhapXoa(khoa); }, 400);
  henNhap[khoa].lay = layV;
}
/** Rời trang: ghi ngay mọi bản đang hẹn, đừng để 0,4 giây cuối rơi mất. */
function nhapGhiHet() {
  Object.keys(henNhap).forEach((k) => {
    const h = henNhap[k]; clearTimeout(h); delete henNhap[k];
    const v = h && h.lay && h.lay(); if (v) nhapGhi(k, v); else nhapXoa(k);
  });
}
function nhapHuy(khoa) { clearTimeout(henNhap[khoa]); delete henNhap[khoa]; nhapXoa(khoa); }
/** Ghi ngay (bỏ lượt đang hẹn) — dùng khi vừa lưu xong một phần, phần còn lại phải đúng tức thì. */
function nhapNgay(khoa, layV) {
  clearTimeout(henNhap[khoa]); delete henNhap[khoa];
  const v = layV(); if (v) nhapGhi(khoa, v); else nhapXoa(khoa);
}
const gioPhut = (ms) => { const g = new Date(ms); return String(g.getHours()).padStart(2, '0') + ':' + String(g.getMinutes()).padStart(2, '0'); };
/** Dòng báo nhỏ "đã khôi phục …" kèm nút Bỏ (data-bo-nhap mang tên chỗ cần bỏ). */
const baoKhoiPhuc = (luc, cho) => '<span class="nho nhap-kp" style="color:var(--orange-text)">Đã khôi phục phần đang nhập dở lúc ' +
  gioPhut(luc) + ' · <a href="#" data-bo-nhap="' + esc(cho) + '">Bỏ</a></span>';

const MAN_TOI = [
  { ma: 'ngay', ten: 'Hôm nay' },
  { ma: 'tuan', ten: 'Tuần' },
  { ma: 'thang', ten: 'Tháng' },
  { ma: 'da-nop', ten: 'Đã nộp' },
];
const MAN_QL = [
  /* "Theo dõi" đã gộp vào Toàn phòng (anh Hùng 02/10: "chức năng có vẻ tương
   * tự, em gom về toàn phòng"). Đúng là vậy: hai màn cùng trả lời "ai nộp thế
   * nào trong kỳ này", chỉ khác cột. Giờ một bảng, một kỳ, một chỗ để nhìn. */
  { ma: 'toan-phong', ten: 'Toàn phòng' },
  { ma: 'can-ho-tro', ten: 'Cần hỗ trợ' },
  /* Anh Hùng (30/09): thiết lập chuẩn nằm chung cụm quản lý cho tiện. */
  { ma: 'thiet-lap', ten: 'Thiết lập' },
];

/* ---------------- gọi API ---------------- */
/* Lượt vẽ màn hiện tại. Bấm đổi tab nhanh thì dữ liệu của tab TRƯỚC có thể về
 * SAU và vẽ đè lên tab đang đứng — thấy tận mắt 30/09 (thanh tab ghi "Cần hỗ
 * trợ" mà nội dung là Toàn phòng). Mỗi lần ve() tăng số lượt; lệnh đọc (GET)
 * về trễ của lượt cũ bị bỏ, không vẽ. Lệnh ghi (POST) không bị bỏ. */
let LUOT = 0;
const CU = 'luot-cu';

async function goi(duong, opts = {}) {
  const luot = LUOT;
  const doc = !opts.method || opts.method === 'GET';
  const r = await fetch(duong, Object.assign({
    headers: { 'content-type': 'application/json' },
  }, opts));
  const raw = await r.text();
  let d = null;
  try { d = raw ? JSON.parse(raw) : {}; } catch (_) { d = null; }
  if (!r.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
  if (d === null) throw new Error('Máy chủ trả về thứ không đọc được');
  if (doc && luot !== LUOT) throw Object.assign(new Error(CU), { cu: true });
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

/**
 * Năm lựa chọn của bộ lọc hai màn quản lý — đúng danh sách anh Hùng chốt
 * (02/10): tuần này · tuần trước · tháng này · tháng trước · năm nay.
 *
 * Đặt thành LỰA CHỌN CÓ TÊN thay cho "Tuần|Tháng + mũi tên lùi/tới": gần như
 * lần nào quản lý cũng chỉ hỏi một trong năm câu đó, mà đường cũ phải bấm hai
 * nhát (chọn loại rồi lùi) và nhìn nhãn mới biết mình đang đứng đâu.
 *
 * `ky` là thứ máy chủ hiểu (tuan / thang / nam), `moc` là một mốc nằm trong kỳ.
 * tu/den tính luôn ở đây cho mấy đầu mối nhận khoảng (theo-doi, can-ho-tro) —
 * một chỗ tính, hai nơi dùng, khỏi lệch nhau một ngày.
 */
const LOC_KY = [
  { ma: 'tuan-nay', ten: 'Tuần này' },
  { ma: 'tuan-truoc', ten: 'Tuần trước' },
  { ma: 'thang-nay', ten: 'Tháng này' },
  { ma: 'thang-truoc', ten: 'Tháng trước' },
  { ma: 'nam-nay', ten: 'Năm nay' },
];

function kyTheoLoc(ma) {
  const nay = Date.now();
  if (ma === 'tuan-nay' || ma === 'tuan-truoc') {
    const moc = ma === 'tuan-truoc' ? nay - 7 * NGAY_MS : nay;
    const t = mocTuan(moc);
    return Object.assign({ ky: 'tuan', moc: t.tu + 3600000 }, t,
      { nhan: veNgay(t.tu) + ' – ' + veNgay(t.den) });
  }
  if (ma === 'nam-nay') {
    const p = phanRa(nay);
    return {
      ky: 'nam', moc: nay, nhan: 'Năm ' + p.nam,
      tu: Date.UTC(p.nam, 0, 1) - VN, den: Date.UTC(p.nam + 1, 0, 1) - VN - 1,
    };
  }
  const p = phanRa(nay);
  /* Lùi tháng bằng số tháng, không bằng 30 ngày: 31/03 trừ 30 ngày ra tháng 3. */
  const th = p.thang - (ma === 'thang-truoc' ? 1 : 0);
  const nam = p.nam + (th < 1 ? -1 : 0);
  const t12 = (th - 1 + 12) % 12;
  const tu = Date.UTC(nam, t12, 1) - VN;
  const sau = Date.UTC(t12 === 11 ? nam + 1 : nam, (t12 + 1) % 12, 1) - VN;
  return { ky: 'thang', moc: tu + 15 * NGAY_MS, tu, den: sau - 1,
    nhan: 'Tháng ' + p2(t12 + 1) + '/' + nam };
}

/**
 * Thanh lọc dùng chung cho hai màn quản lý.
 *
 * Gom một chỗ vì hai màn phải trông và chạy GIỐNG HỆT nhau — anh Hùng nêu đúng
 * chuyện này: "tab toàn phòng cần có bộ lọc như các bộ lọc khác", và "tab cần
 * hỗ trợ cũng cần lọc theo". Hai chỗ tự vẽ riêng là sớm muộn lệch nhau.
 */
function thanhKy(id, ma) {
  return '<div class="pills">' + LOC_KY.map((x) =>
    '<button class="pill' + (ma === x.ma ? ' on' : '') + '" data-loc-ky="' + x.ma +
    '" id="' + id + '-' + x.ma + '">' + esc(x.ten) + '</button>').join('') + '</div>';
}

/** Gắn tay nghe cho thanh lọc. `dat(ma)` ghi lại lựa chọn rồi vẽ lại. */
function ganThanhKy(goc, dat) {
  $$('[data-loc-ky]', goc).forEach((b) => { b.onclick = () => dat(b.dataset.locKy); });
}

/* ---------------- khởi động ---------------- */
async function nap() {
  META = await goi('/api/meta');
  $('#phuDe').textContent = META.toi.ten;
  const chip = $('#chipToi');
  chip.classList.toggle('ql', META.toi.quanLy);
  $('span:last-child', chip).textContent = META.toi.quanLy ? 'Quản lý' : 'Nhân sự';

  /* Nhân sự có thêm tab "Cần hỗ trợ" của RIÊNG mình (anh Hùng 30/09: "cho họ
   * tab Cần hỗ trợ, cho họ thấy"). Quản lý đã có tab cùng tên ở cụm quản lý. */
  veTab('#tabToi', META.toi.quanLy ? MAN_TOI : MAN_TOI.concat([{ ma: 'vuong-mac', ten: 'Cần hỗ trợ' }]));
  if (META.toi.giaLap) {
    const b = document.createElement('div');
    b.textContent = 'Đang XEM THỬ vai nhân sự (' + META.toi.ten + ') — chỉ xem, mọi nút lưu/nộp đều bị chặn.';
    b.style.cssText = 'background:var(--orange-bg);color:var(--orange-text);padding:8px 14px;font-size:13px;font-weight:600;text-align:center';
    document.body.prepend(b);
  }
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
      /* Thiết lập giữ chỉnh sửa trong TL (và bản nháp trên máy) nên rời tab không
       * mất — nhưng vẫn phải hỏi, kẻo tưởng đã lưu rồi bỏ đi luôn. */
      if (MAN === 'thiet-lap' && (TL_BAN || TL_TIN_BAN) &&
        !confirm('Thiết lập còn chỉnh chưa lưu (vẫn giữ nháp trên máy này). Rời đi?')) return;
      BAN = false;
      MAN = b.dataset.man;
      MOC = Date.now();
      $$('.pill').forEach((x) => x.classList.toggle('on', x.dataset.man === MAN));
      ve();
    };
  });
}

window.addEventListener('beforeunload', (e) => {
  nhapGhiHet();
  if (!BAN && (TL_BAN || TL_TIN_BAN)) { e.preventDefault(); e.returnValue = ''; return; }
  if (!BAN) return;
  if (tuLuuDuoc()) { tuLuu(true); return; }   // phiếu nháp: gửi luôn (keepalive), khỏi hỏi
  e.preventDefault();
  e.returnValue = '';
});

async function ve() {
  LUOT++;
  const el = $('#man');
  /* Khung xương thay cho chữ: đổi kỳ / đổi màn là cả cột nội dung trắng ra
   * trong lúc chờ Base, mà mấy màn này đọc khá lâu. */
  el.innerHTML = window.KX ? KX.man('', { dau: false, the: 3, dong: 7 })
    : '<div class="the"><div class="rong">Đang tải…</div></div>';
  try {
    /* Sổ đang mở mà đổi kỳ thì nội dung của nó phải đi theo — bỏ quên thì nó
     * ngồi đó hiển thị dữ liệu của kỳ vừa rời khỏi, mà nhìn thì không biết. */
    if (SO_MO && MAN !== 'tuan' && MAN !== 'thang' && MAN !== 'toan-phong') dongSo();
    /* Ai còn giữ đường dẫn #theo-doi (hoặc bấm nút cũ ở nơi khác) thì đưa thẳng
     * sang Toàn phòng — nơi đã gom nội dung đó về, thay vì trả màn trắng. */
    if (MAN === 'theo-doi') MAN = 'toan-phong';
    if (MAN === 'toan-phong') return await veToanPhong(el);
    if (MAN === 'can-ho-tro') return await veCanHoTro(el);
    if (MAN === 'vuong-mac') return await veVuongMac(el);
    if (MAN === 'thiet-lap') return await veThietLap(el);
    if (MAN === 'da-nop') return await veDaNop(el);
    return await veManPhieu(el, MAN);
  } catch (e) {
    if (e && e.cu) return;                 // lượt cũ, màn khác đã thay chỗ
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
    VIEC = await goi('/api/viec-cua-toi?moc=' + DU.ky.tu).catch((e) => { if (e && e.cu) throw e; return { chay: false, ds: [] }; });
  }

  el.innerHTML =
    theKy(loaiKy) +
    (loaiKy === 'ngay' ? theBang(DU) : theTongHop(DU)) +
    theVietTay(DU, loaiKy) +
    theLuu(DU);

  gan(loaiKy);
  if (loaiKy === 'ngay') tinhLai();
  khoiPhucSua();
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
        ' data-ten="' + esc(v.ten) + '"' +
        /* Cờ cho cửa sổ nộp sản phẩm khi kéo 100% (01/10/2026). */
        (v.coKetQua ? ' data-kq="1"' : '') + (v.laChinh ? ' data-chinh="1"' : '') +
        (v.id === d.maViec ? ' selected' : '') + '>' +
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

  /* Nhận xét AI (anh Hùng 01/10): Claude chạy theo lịch — tuần 8:30 & 14:00 Thứ 7,
   * tháng 8:30 & 14:00 ngày 29–30 — ghi vào ô "Đánh giá AI" của phiếu kỳ. Chỉ
   * nhận xét và gợi ý, không chấm điểm. */
  const aiChu = d.phieu && d.phieu.danhGiaAI;
  const loaiK = (d.phieu && d.phieu.loaiKy) || (d.ky && d.ky.loai) || MAN;
  const choAI = aiChu
    ? '<div class="ai-nx"><div class="ai-nx-dau">🤖 Nhận xét và gợi ý từ Marketing Hub AI</div>' +
      '<div class="ai-nx-chu">' + mdSangHtml(aiChu) + '</div>' +
      '<div class="nho" style="margin-top:6px">AI chỉ nhận xét và gợi ý, không chấm điểm.</div></div>'
    : '<div class="cho-ai">Nhận xét và gợi ý từ Marketing Hub AI sẽ có ở đây — ' +
      (loaiK === 'thang' ? 'chạy lúc 8:30 và 14:00 ngày 29, 30 hằng tháng.' : 'chạy lúc 8:30 và 14:00 Thứ 7, cho tuần vừa khép.') +
      '</div>';

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
    : '<div class="viec-o"><div class="o-nhan">Link video' +
      /* Anh Hùng 30/09: báo cáo tuần PHẢI có video — máy chủ chặn nộp nếu trống. */
      (loaiKy === 'tuan' ? ' <span style="color:var(--red-text)">*</span>' : '') + '</div>' +
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
      (loaiKy === 'thang' ? khoiTep(p) : '') +
      /* Gọi cả "vấn đề gặp phải": chỉ ghi "Cần hỗ trợ" thì người ta hiểu là ô
       * để xin việc gì đó, nên vướng mắc tự gỡ được lại không ai ghi — mà đó
       * mới là thứ quản lý cần đọc. */
      o('Cần hỗ trợ & vấn đề gặp phải', 'txHoTro', p.canHoTro) +
    '</div></div>';
}

/**
 * Tệp đính kèm báo cáo tháng (anh Hùng 30/09: "cho nhân sự tải tệp lên").
 * Tệp gắn thẳng vào ô "Tệp đính kèm" của phiếu tháng trên Base; chưa có phiếu
 * thì máy chủ tự lưu nháp để có chỗ gắn. Mỗi tệp ≤ 20MB.
 */
function khoiTep(p) {
  const cuaToi = !p.nguoi || !META.toi.quanLy || p.nguoi === META.toi.id || p.email === META.toi.email;
  const ds = (p.tep || []);
  const co = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  return '<div class="viec-o"><div class="o-nhan">Tệp đính kèm</div>' +
    (ds.length ? '<div class="tep-ds">' + ds.map((t) =>
      '<div class="tep-muc"><span class="tep-ten">📎 ' + esc(t.ten) + '</span>' +
        (t.co ? '<span class="nho">' + co(t.co) + '</span>' : '') +
        '<a class="btn nho mo" href="api/tep/tai?rec=' + encodeURIComponent(p.id) + '&token=' +
          encodeURIComponent(t.token) + '">Tải về</a>' +
        (cuaToi ? '<button type="button" class="btn nho mo" data-xoa-tep="' + esc(t.token) + '" data-rec="' +
          esc(p.id) + '">Xoá</button>' : '') +
      '</div>').join('') + '</div>' : '<div class="nho" style="margin-bottom:6px">Chưa có tệp nào.</div>') +
    (cuaToi ? '<label class="btn nho" style="display:inline-block;align-self:flex-start;margin-top:6px;cursor:pointer">+ Tải tệp lên' +
      '<input type="file" id="tepChon" multiple hidden></label>' +
      '<span class="nho" id="tepTT" style="margin-left:8px">PDF, Excel, Word, slide, ảnh… mỗi tệp tối đa 20MB</span>' : '') +
  '</div>';
}

/* Gắn một lần cho cả trang — màn vẽ lại nhiều lần, ô chọn tệp sinh mới mỗi lần. */
document.addEventListener('change', async (e) => {
  if (!e.target || e.target.id !== 'tepChon') return;
  const tt = $('#tepTT');
  const tep = [...e.target.files];
  for (let i = 0; i < tep.length; i++) {
    const f = tep[i];
    if (f.size > 20 * 1024 * 1024) { toast('"' + f.name + '" quá 20MB — nén lại hoặc để trên Drive rồi dán link', 'do'); continue; }
    if (tt) tt.textContent = 'Đang tải ' + (i + 1) + '/' + tep.length + ': ' + f.name + '…';
    try {
      const du = await new Promise((ok, hong) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(',')[1] || '');
        r.onerror = () => hong(new Error('Không đọc được tệp'));
        r.readAsDataURL(f);
      });
      await goi('api/tep', { method: 'POST', body: JSON.stringify({ moc: MOC, ten: f.name, du }) });
    } catch (er) { toast('Tải "' + f.name + '" hỏng: ' + er.message, 'do'); }
  }
  toast('Đã tải tệp lên');
  ve();
});
document.addEventListener('click', async (e) => {
  const b = e.target && e.target.closest && e.target.closest('[data-xoa-tep]');
  if (!b) return;
  if (!confirm('Xoá tệp này khỏi báo cáo tháng?')) return;
  b.disabled = true;
  try {
    await goi('api/tep/xoa', { method: 'POST', body: JSON.stringify({ recId: b.dataset.rec, token: b.dataset.xoaTep }) });
    toast('Đã xoá tệp'); ve();
  } catch (er) { toast('Xoá hỏng: ' + er.message, 'do'); b.disabled = false; }
});

function theLuu(d) {
  const daNop = d.phieu && d.phieu.daNop;
  return '<div class="the"><div class="the-than" ' +
    'style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
    '<button class="btn chinh" id="btnNop">' + (daNop ? 'Cập nhật báo cáo' : 'Nộp báo cáo') + '</button>' +
    // Không còn nút Lưu nháp (28/09): phiếu chưa nộp tự lưu nháp liên tục
    '<span class="nho" id="ttTuLuu">' + (daNop ? '' : 'Tự lưu nháp khi có thay đổi') + '</span>' +
    '<span id="ttKhoiPhuc"></span>' +
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
      /* Thả tay ở 100% với một việc từ Bảng công việc chưa có sản phẩm → mời nộp
       * sản phẩm luôn (anh Hùng 01/10/2026). Việc nhóm "Khác" (gõ tay, không có
       * mã việc) thì không bắt nộp. */
      pt.onchange = () => {
        if (Number(pt.value) < 100 || !viec || !viec.value) return;
        const op = viec.selectedOptions[0];
        if (!op || op.dataset.kq === '1' || op.dataset.chinh !== '1') return;
        moNopSanPham(viec.value, op.dataset.ten || (cv && cv.value) || '', op);
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

/**
 * Cửa sổ NỘP SẢN PHẨM ngay trong báo cáo ngày. Gửi qua máy chủ Báo cáo, máy
 * chủ chuyển sang Bảng công việc đúng danh tính — nộp xong việc bên đó thành
 * Hoàn thành (việc đã trễ: thành "đã giải quyết", giữ nhãn trễ).
 */
function moNopSanPham(maViec, ten, op) {
  let hop = $('#hopNopSP');
  if (!hop) {
    hop = document.createElement('dialog');
    hop.id = 'hopNopSP';
    hop.className = 'hop-nop';
    hop.setAttribute('role', 'dialog');
    document.body.appendChild(hop);
  }
  /* Lớp nháp chung của hub giữ link + ghi chú đang gõ dở, khoá theo mã việc —
   * đóng "Để sau" rồi mở lại đúng việc đó là còn nguyên. */
  hop.setAttribute('data-nhap-khoa', maViec);
  hop.innerHTML =
    '<form method="dialog" class="hn-than">' +
      '<div class="hn-dau"><div class="hn-nhan">Nộp sản phẩm</div>' +
        '<div class="hn-ten">' + esc(ten) + '</div>' +
        '<div class="nho">Tiến độ 100% — nộp link hoặc tệp sản phẩm để việc bên Bảng công việc chuyển Hoàn thành.</div></div>' +
      '<label class="hn-o"><span>Link kết quả</span><input id="hnLink" type="url" placeholder="https://drive.google.com/…"></label>' +
      '<label class="hn-o"><span>Tệp sản phẩm</span><input id="hnTep" type="file" multiple></label>' +
      '<label class="hn-o"><span>Ghi chú cho người order <i class="nho">(không bắt buộc)</i></span><textarea id="hnNote" rows="2"></textarea></label>' +
      '<div id="hnMsg" class="hn-msg"></div>' +
      '<div class="hn-nut"><button type="button" class="btn mo" id="hnDe">Để sau</button>' +
        '<button type="button" class="btn chinh" id="hnGui">Nộp sản phẩm</button></div>' +
    '</form>';
  const msg = $('#hnMsg', hop);
  $('#hnDe', hop).onclick = () => hop.close();
  $('#hnGui', hop).onclick = async () => {
    const link = $('#hnLink', hop).value.trim();
    const tep = [...($('#hnTep', hop).files || [])];
    if (!link && !tep.length) { msg.textContent = 'Dán link hoặc chọn tệp sản phẩm trước đã.'; return; }
    const nut = $('#hnGui', hop);
    nut.disabled = true;
    try {
      for (let i = 0; i < tep.length; i++) {
        msg.textContent = 'Đang tải tệp ' + (i + 1) + '/' + tep.length + '…';
        const r = await fetch('api/nop-san-pham/tep?viec=' + encodeURIComponent(maViec), {
          method: 'POST', headers: { 'x-file-name': encodeURIComponent(tep[i].name) }, body: tep[i],
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error('Tệp "' + tep[i].name + '": ' + (d.loi || d.error || 'tải lên thất bại'));
      }
      msg.textContent = 'Đang nộp…';
      const r = await fetch('api/nop-san-pham', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ maViec, link, note: $('#hnNote', hop).value.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d.loi || d.error || 'Không nộp được') + (d.goiY ? ' — ' + d.goiY : ''));
      if (op) op.dataset.kq = '1';
      hop.close();
      toast(d.giaiQuyet ? 'Đã nộp sản phẩm — việc trễ hạn nên giữ nhãn trễ, chờ nghiệm thu.'
        : 'Đã nộp sản phẩm — việc bên Bảng công việc đã chuyển Hoàn thành.', 'xanh');
    } catch (e) {
      msg.textContent = e.message;
    } finally { nut.disabled = false; }
  };
  hop.showModal();
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
  const khoa = khoaSua();               // tính trước: ve() sau khi lưu sẽ thay DU
  clearTimeout(henTL);
  /* Đang nộp thì KHÔNG tự lưu nháp chen vào (rà 01/10): cú bấm Nộp cũng là một
   * cú click, và trình nghe click hẹn tự lưu 2,5 giây — nộp chậm hơn thế là lượt
   * nháp bay sau và từng kéo phiếu về Nháp. Máy chủ cũng đã chặn, đây là lớp hai. */
  DANG_NOP = true;

  const nut = [$('#btnNop')].filter(Boolean);
  nut.forEach((b) => { b.disabled = true; });
  try {
    const r = await goi('/api/phieu', { method: 'POST', body: JSON.stringify(than) });
    clearTimeout(henTL);
    BAN = false;
    if (nop && khoa) nhapHuy(khoa);     // máy chủ đã nhận bản sửa — nháp trên máy hết việc
    toast(nop ? 'Đã nộp — ' + r.veHan : 'Đã lưu nháp',
      nop && r.cham && r.cham.trangThai === 'tre' ? '' : 'xanh');
    await ve();
  } catch (e) {
    toast(e.message, 'do');
  } finally {
    DANG_NOP = false;
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
let henTL = 0, dangTL = false, SUA = 0, DANG_NOP = false;
const tuLuuDuoc = () => !!(!DANG_NOP && BAN && DU && DU.ky && $('#btnNop') && !(DU.phieu && DU.phieu.daNop));
function ttTuLuu(chu, loi) {
  const o = $('#ttTuLuu');
  if (!o) return;
  o.textContent = chu;
  o.classList.toggle('do', !!loi);
}
function henTuLuu() {
  if (!BAN) return;
  if (DU && DU.phieu && DU.phieu.daNop) {
    /* Không tự gửi (gửi là rút phiếu về nháp / nộp hộ), nhưng giữ một bản trên
     * máy để tải lại trang không mất phần đang sửa. */
    const k = khoaSua();
    if (k && $('#btnNop')) nhapHen(k, () => { const v = layNhapSua(); return JSON.stringify(v) === GOC_SUA ? null : { phieu: v }; });
    return ttTuLuu('Có thay đổi — bấm "Cập nhật báo cáo" để lưu');
  }
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
/* ---- nháp trên máy cho phiếu ĐÃ NỘP đang sửa ----
 * Khoá theo mã phiếu (mỗi người · mỗi kỳ một mã), nên mở lại đúng phiếu đó mới
 * thấy. GOC_SUA là phiếu đúng như máy chủ trả về — nháp trùng nó thì khỏi giữ. */
let GOC_SUA = '';
function khoaSua() {
  return DU && DU.ky && DU.phieu && DU.phieu.daNop
    ? 'phieu.' + (DU.phieu.ma || (MAN + '-' + DU.ky.tu)) : '';
}
function layNhapSua() {
  const t = thanPhieu(true);
  delete t.nop; delete t.moc;
  return t;
}
function khoiPhucSua() {
  GOC_SUA = '';
  const k = khoaSua();
  if (!k) return;
  GOC_SUA = JSON.stringify(layNhapSua());
  const n = nhapDoc(k);
  if (!n || !n.phieu) return;
  if (JSON.stringify(n.phieu) === GOC_SUA) { nhapXoa(k); return; }
  const v = n.phieu;
  [['#txNhanDinh', 'nhanDinh'], ['#txKeHoach', 'keHoach'], ['#txHoTro', 'canHoTro'], ['#txVideo', 'linkVideo']]
    .forEach(([s, f]) => { const e = $(s); if (e && v[f] != null) e.value = v[f]; });
  if (MAN === 'ngay' && Array.isArray(v.dong) && $('#thanBang')) {
    $('#thanBang').innerHTML = (v.dong.length ? v.dong : [dongTrong()]).map(veHang).join('');
    ganHang();
    const ca = $('#chonCa');
    if (ca && v.ca && [...ca.options].some((o) => o.value === v.ca)) ca.value = v.ca;
    const dm = $('#dmTay');
    if (dm) dm.value = v.dinhMucTay || '';
    hienDmTay(); tinhLai();
  }
  /* Bản khôi phục CHƯA được gửi — vẫn phải bấm "Cập nhật báo cáo". */
  BAN = true;
  ttTuLuu('Có thay đổi — bấm "Cập nhật báo cáo" để lưu');
  const o = $('#ttKhoiPhuc');
  if (!o) return;
  o.innerHTML = baoKhoiPhuc(n.luc, 'phieu');
  $('[data-bo-nhap]', o).onclick = (e) => { e.preventDefault(); nhapHuy(k); BAN = false; ve(); };
}

/** Gọi trước mọi thao tác thay màn (đổi kỳ, đổi tab): còn gì chưa lưu thì lưu. */
async function luuTruocKhiDi() {
  if (BAN && tuLuuDuoc()) await tuLuu();
}
// Chạy SAU các handler của từng ô (onX gắn trên phần tử chạy trước khi sự kiện nổi lên document)
['input', 'change', 'click'].forEach((ev) =>
  document.addEventListener(ev, () => setTimeout(henTuLuu, 0)));
document.addEventListener('visibilitychange', () => {
  /* Trong Lark trên điện thoại, đóng app thường chỉ bắn sự kiện này, không có beforeunload. */
  if (document.visibilityState === 'hidden') nhapGhiHet();
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

/**
 * TOÀN PHÒNG — một bảng trả lời cả hai câu quản lý hỏi mỗi kỳ.
 *
 * Trước 02/10 đây là hai tab: "Toàn phòng" (chất lượng: điểm, thời lượng, đáng
 * chú ý) và "Theo dõi" (kỷ luật: đúng hạn, trễ, bù, ngày thiếu). Anh Hùng nhìn
 * ra ngay là trùng: "chức năng có vẻ tương tự, em gom về toàn phòng". Đúng vậy
 * — cùng một danh sách người, cùng một kỳ, chỉ khác cột; mà tách ra thì mỗi
 * lần soi một người phải nhớ số bên kia rồi bấm qua bấm lại.
 *
 * Nay một màn, một kỳ. Hai nguồn số vẫn là hai đầu mối cũ (/api/toan-phong và
 * /api/theo-doi), ghép ở đây theo email/id. Cố ý KHÔNG gộp hai đầu mối thành
 * một: cả hai đã chạy thật và có bài thử riêng, gộp lại là viết lại cả hai.
 */
async function veToanPhong(el) {
  const f = kyTheoLoc(TP_LOC);
  const d = await goi('/api/toan-phong?ky=' + f.ky + '&moc=' + f.moc + '&moi=1');
  /* Lấy đúng khoảng máy chủ vừa chốt, không tự tính lại: hai đầu mối lệch nhau
   * một ngày là bảng ghép ra số vênh mà nhìn không biết vì sao. */
  const kd = await goi('/api/theo-doi?tu=' + d.ky.tu + '&den=' + d.ky.den + '&moi=1')
    .catch((e) => { if (e && e.cu) throw e; return { nguoi: [], soNgayCong: 0 }; });

  const khoa = (n) => String(n.email || n.id || n.ten).toLowerCase();
  const theoKL = new Map((kd.nguoi || []).map((n) => [khoa(n), n]));
  const ds = d.nguoi.map((n) => Object.assign({ kl: theoKL.get(khoa(n)) || null }, n));

  const co = ds.length;
  const yeu = ds.filter((n) => n.diem < 60).length;
  const thieu = ds.reduce((s, n) => s + n.soThieu, 0);
  const tongKL = (f) => (kd.nguoi || []).reduce((s, n) => s + f(n), 0);
  const soDung = tongKL((n) => n.soDungHan);
  const tongPhieu = soDung + tongKL((n) => n.soTre) + tongKL((n) => n.soBu);
  const oSo = (so, nhan, duoi, mau) =>
    '<div class="o-so ' + (mau || '') + '"><div class="so">' + esc(so) + '</div>' +
    '<div class="nhan">' + esc(nhan) + '</div>' +
    (duoi ? '<div class="duoi">' + esc(duoi) + '</div>' : '') + '</div>';

  el.innerHTML =
    '<div class="luoi-so">' +
      oSo(co, 'người có báo cáo', d.nhan) +
      /* Kỷ luật nộp đứng ngay cạnh chất lượng — đó là nửa còn lại của câu hỏi
       * "phòng kỳ này thế nào", trước phải sang tab khác mới thấy. */
      oSo(tongPhieu ? Math.round((soDung / tongPhieu) * 100) + '%' : '—',
        'nộp đúng hạn', soDung + '/' + tongPhieu + ' phiếu',
        !tongPhieu ? '' : soDung === tongPhieu ? 'xanh' : soDung / tongPhieu < 0.8 ? 'do' : 'cam') +
      oSo(yeu, 'người cần nhìn kỹ', 'điểm dưới 60', yeu ? 'do' : 'xanh') +
      oSo(thieu, 'lượt ngày thiếu', 'trong kỳ', thieu ? 'cam' : 'xanh') +
      oSo(vePhut(ds.reduce((s, n) => s + n.tongPhut, 0)), 'tổng thời lượng cả phòng') +
    '</div>' +
    '<div class="the"><div class="the-dau"><h2>Đánh giá toàn phòng</h2>' +
      '<span class="nho">' + esc(d.nhan) +
        (kd.soNgayCong ? ' · ' + kd.soNgayCong + ' ngày công' : '') +
        ' · bấm một dòng để mở bên phải</span>' +
      '<div class="lon"></div>' + thanhKy('tp', TP_LOC) +
      '</div><div class="the-than khit cuon">' + (co
      ? '<table class="bang-xem bam-duoc"><thead><tr><th style="width:52px">Điểm</th><th>Người</th>' +
        '<th class="so-o">Phiếu</th><th class="so-o">Thời lượng</th><th class="so-o">Định mức</th>' +
        '<th>Nhịp nộp</th><th>Đáng chú ý nhất</th></tr></thead><tbody>' +
        ds.map((n, i) => '<tr class="mo-duoc" data-i="' + i + '">' +
          '<td><span class="diem ' + mauDiem(n.diem) + '">' + n.diem + '</span></td>' +
          '<td><b>' + esc(n.ten) + '</b>' +
            (n.soThieu ? ' <span class="nhan-tt do">thiếu ' + n.soThieu + ' ngày</span>' : '') + '</td>' +
          '<td class="so-o">' + n.soPhieu + '</td>' +
          '<td class="so-o">' + esc(n.tongGio) + '</td>' +
          '<td class="so-o">' + (n.phanTram == null ? '—' : n.phanTram + '%') + '</td>' +
          '<td>' + veNhipNop(n.kl) + '</td>' +
          '<td class="phu">' + esc(n.motCau) + '</td>' +
        '</tr>').join('') + '</tbody></table>'
      : rong('Chưa có báo cáo nào trong kỳ này',
        'Khi nhân sự bắt đầu nộp, bảng này tự có người.')) +
    '</div></div>';

  ganThanhKy(el, (ma) => { TP_LOC = ma; ve(); });
  $$('tr.mo-duoc', el).forEach((tr) => {
    tr.onclick = () => {
      $$('tr.mo-duoc', el).forEach((x) => x.classList.toggle('dang-chon', x === tr));
      moNguoi(ds[Number(tr.dataset.i)], d.nhan);
    };
  });
}

/** Nhịp nộp của một người, gọn trong một ô: đúng hạn · trễ · bù. */
function veNhipNop(kl) {
  if (!kl) return '<span class="nho">—</span>';
  const o = (n, mau, nhan) => (n ? '<span class="nhan-tt ' + mau + '" style="margin-right:4px">' +
    n + ' ' + nhan + '</span>' : '');
  return (o(kl.soDungHan, 'xanh', 'đúng hạn') + o(kl.soTre, 'cam', 'trễ') + o(kl.soBu, 'do', 'bù')) ||
    '<span class="nho">chưa nộp</span>';
}

/**
 * Mở một người ra CỬA BÊN PHẢI: nộp thế nào, viết gì, AI nhận xét ra sao.
 *
 * Anh Hùng (02/10): "khi anh ấn vào, cửa bên phải sẽ hiện thống kê nhanh, anh
 * xem được báo cáo nhân sự đã nộp ngày/tuần/tháng thế nào và nhận định AI thế
 * nào". Trước đây phần này đổ xuống DƯỚI bảng, nên mỗi lần xem một người là
 * trôi mất chỗ đang đứng trong bảng, và không so hai người liền nhau được.
 */
function moNguoi(n, nhanKy) {
  const loaiTen = (l) => (l === 'ngay' ? 'Ngày' : l === 'tuan' ? 'Tuần' : 'Tháng');
  const kl = n.kl;
  const chip = (nhan, gt, mau) => '<span class="m ' + (mau || '') + '">' + esc(nhan) +
    ' <b>' + esc(gt) + '</b></span>';

  const than =
    '<div class="ct-dau">' +
      chip('Điểm', String(n.diem), n.diem >= 85 ? 'xanh' : n.diem >= 60 ? 'cam' : 'do') +
      chip('Phiếu', String(n.soPhieu)) +
      chip('Thời lượng', n.tongGio) +
      chip('Định mức', n.phanTram == null ? '—' : n.phanTram + '%') +
      (kl ? chip('Đúng hạn', kl.soDungHan + (kl.tyLeDung == null ? '' : ' · ' + kl.tyLeDung + '%'),
        kl.tyLeDung == null ? '' : kl.tyLeDung >= 80 ? 'xanh' : 'cam') : '') +
      (kl && kl.soTre ? chip('Trễ', String(kl.soTre), 'cam') : '') +
      (kl && kl.soBu ? chip('Nộp bù', String(kl.soBu), 'do') : '') +
      (kl && kl.soSua ? chip('Sửa lại', String(kl.soSua)) : '') +
    '</div>' +
    (kl && kl.thieu && kl.thieu.length
      ? '<div class="nho" style="margin-bottom:10px">Ngày chưa nộp: ' +
        kl.thieu.map((x) => '<span class="nhan-tt do" style="margin-right:4px">' +
          esc(x.nhan) + '</span>').join('') + '</div>'
      : '') +
    ((n.phieu || []).length
      ? '<div class="nk">' + n.phieu.map((p) =>
        '<div class="nk-d"><div class="nk-sum" data-ql-ky="' + esc(p.loaiKy) + '" data-ql-ma="' + esc(p.ma) +
            '" data-ql-moc="' + (p.tu + 3600000) + '" data-ql-nhan="' + esc(p.nhan) + '">' +
          '<span class="nk-ten">' + esc(p.nhan) + '</span>' +
          '<span class="nk-so">' + loaiTen(p.loaiKy) + ' · ' + esc(p.tongGio) + '</span>' +
          (p.daNop ? nhanHan(p) : '<span class="nhan-tt cam">Nháp</span>') +
        '</div></div>').join('') + '</div>'
      /* Lọc cả năm thì sổ chỉ liệt kê phiếu tổng kết tuần/tháng. Chưa ai nộp
       * tổng kết mà vẫn có báo cáo ngày thì phải nói ra đường đi tiếp, không
       * để người xem tưởng cả năm người ta không làm gì. */
      : (n.soPhieu
        ? rong('Chưa có phiếu tổng kết trong kỳ',
          n.soPhieu + ' báo cáo ngày đã nộp — chọn "Tháng này" hoặc "Tuần này" để mở từng ngày.')
        : rong('Chưa có phiếu nào trong kỳ'))) +
    theY('Nhận định theo luật', n.y, n.diem) +
    (n.ai
      ? '<div class="ai-nx"><div class="ai-nx-dau">🤖 Nhận xét và gợi ý từ Marketing Hub AI</div>' +
        '<div class="ai-nx-chu">' + mdSangHtml(n.ai) + '</div></div>'
      : '<p class="nho">Chưa có nhận xét AI cho kỳ này — tuần chạy 8:30 &amp; 14:00 Thứ 7, ' +
        'tháng 8:30 &amp; 14:00 ngày 29–30.</p>');

  moSo(n.ten, nhanKy, than);

  /* Bấm một phiếu trong sổ thì thay nội dung sổ bằng chính phiếu đó, kèm nút
   * quay lại. Không mở sổ thứ hai: bên phải chỉ có một cột. */
  $$('[data-ql-moc]', $('#soThan')).forEach((r) => {
    r.onclick = async () => {
      const loai = r.dataset.qlKy;
      const nhan = r.dataset.qlNhan;
      const phu = n.ten + ' · Báo cáo ' + loaiTen(loai).toLowerCase();
      moSo(nhan, phu, '<p class="phu">Đang mở…</p>');
      try {
        const ct = await goi('/api/phieu?ky=' + loai + '&moc=' + r.dataset.qlMoc +
          '&ma=' + encodeURIComponent(r.dataset.qlMa));
        moSo(nhan, phu, '<button class="btn nho mo" id="soQuayLai">‹ ' + esc(n.ten) + '</button>' +
          chiTietPhieu(ct) + (ct.tongHop ? soKy(ct) : ''));
        const q = $('#soQuayLai');
        if (q) q.onclick = () => moNguoi(n, nhanKy);
      } catch (e) {
        if (e && e.cu) return;
        moSo(nhan, phu, '<p class="phu">Không đọc được phiếu này: ' + esc(e.message) + '</p>');
      }
    };
  });
}

/** HTML (từ ô soạn / clipboard) → markdown rút gọn. */
function htmlSangMd(goc) {
  const ra = [];
  const dem = [];                 // bộ đếm cho <ol> lồng nhau
  /* Xuống dòng chỉ khi chưa đứng đầu dòng — mỗi <div> là MỘT dòng, không sinh
   * dòng trống giữa các dòng như cách ghép "\n" hai đầu khối. */
  let dauMuc = false;             // vừa viết "1. " / "- " — khối con không được xuống dòng
  const nl = () => {
    if (dauMuc) return;
    if (ra.length && ra.join('').slice(-1) !== '\n') ra.push('\n');
  };
  const di = (n, ctx) => {
    if (n.nodeType === 3) {
      const chu = n.nodeValue.replace(/\s+/g, ' ');
      if (dauMuc && !chu.trim()) return;       // khoảng trắng giữa "1. " và chữ đầu tiên
      if (chu.trim()) dauMuc = false;
      ra.push(dauMuc ? chu.replace(/^\s+/, '') : chu);
      return;
    }
    if (n.nodeType !== 1) return;
    const t = n.tagName.toLowerCase();
    if (['script', 'style', 'meta', 'title', 'head'].includes(t)) return;
    const con = () => n.childNodes.forEach((c) => di(c, ctx));
    const w = n.style || {};
    const dam = t === 'b' || t === 'strong' || /^h[1-6]$/.test(t) || Number(w.fontWeight) >= 600 || w.fontWeight === 'bold';
    const nghieng = t === 'i' || t === 'em' || w.fontStyle === 'italic';
    if (t === 'br') { ra.push('\n'); return; }
    if (t === 'li') {
      const o = dem[dem.length - 1];
      dauMuc = false; nl(); ra.push(o && o.ol ? (++o.n) + '. ' : '- '); dauMuc = true;
      con(); return;
    }
    if (t === 'ul' || t === 'ol') { dem.push({ ol: t === 'ol', n: (Number(n.getAttribute('start')) || 1) - 1 }); con(); dem.pop(); nl(); return; }
    if (t === 'a' && /^https?:\/\//i.test(n.getAttribute('href') || '')) {
      ra.push('['); con(); ra.push('](' + n.getAttribute('href') + ')'); return;
    }
    const khoi = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'blockquote', 'section'].includes(t);
    if (khoi) nl();
    if (dam) ra.push('**');
    if (nghieng) ra.push('*');
    con();
    if (nghieng) ra.push('*');
    if (dam) ra.push('**');
    if (khoi) nl();
  };
  const tam = document.createElement('div');
  tam.innerHTML = goc;
  tam.childNodes.forEach((c) => di(c));
  return ra.join('')
    .replace(/\*\*\s*\*\*/g, '').replace(/(^|[^*])\*\s+\*(?!\*)/g, '$1')   // cặp rỗng (phải có khoảng trắng — "**" là mở chữ đậm)
    /* Khoảng trắng lọt VÀO TRONG cặp đậm ("** chữ **" — hay gặp khi dán từ Word)
     * đẩy ra ngoài; Lark không vẽ đậm nếu ** đứng cạnh khoảng trắng. */
    .replace(/\*\*(\s*)([^*\n]+?)(\s*)\*\*/g, '$1**$2**$3')
    .replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

/** Markdown rút gọn → HTML an toàn (thoát hết rồi mới dựng lại vài thẻ cho phép). */
function mdSangHtml(md) {
  const dong = esc(String(md || '')).split('\n');
  const noi = (s) => s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>');
  const ra = [];
  let ds = null;                   // 'ul' | 'ol' đang mở
  for (const d of dong) {
    const ul = d.match(/^\s*[-•]\s+(.*)$/), olm = d.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const ol = olm && [olm[0], olm[2]];
    const loai = ul ? 'ul' : ol ? 'ol' : null;
    if (ds && loai !== ds) { ra.push('</' + ds + '>'); ds = null; }
    if (loai) {
      /* Danh sách số bị gạch đầu dòng con cắt ngang vẫn đếm tiếp (start=). */
      if (!ds) { ra.push(loai === 'ol' ? '<ol start="' + olm[1] + '">' : '<ul>'); ds = loai; }
      ra.push('<li>' + noi((ul || ol)[1]) + '</li>');
    } else ra.push(d.trim() ? '<div>' + noi(d) + '</div>' : '<div><br></div>');
  }
  if (ds) ra.push('</' + ds + '>');
  return ra.join('');
}

/** Ô soạn: thanh công cụ + vùng contenteditable. `md` là nội dung đã lưu. */
function oSoan(rec, md, goiY) {
  const nut = (lenh, chu, ten) => '<button type="button" class="soan-nut" data-lenh="' + lenh + '" title="' + ten + '">' + chu + '</button>';
  return '<div class="soan" data-rec="' + esc(rec) + '">' +
    '<div class="soan-thanh">' +
      nut('bold', '<b>B</b>', 'Đậm (Ctrl+B)') + nut('italic', '<i>I</i>', 'Nghiêng (Ctrl+I)') +
      nut('insertUnorderedList', '•', 'Gạch đầu dòng') + nut('insertOrderedList', '1.', 'Danh sách số') +
      nut('createLink', '🔗', 'Chèn link') + nut('removeFormat', '⌫', 'Bỏ định dạng') +
    '</div>' +
    '<div class="in soan-vung ht-ghi" contenteditable="true" data-rec="' + esc(rec) + '" data-goi-y="' + esc(goiY) + '">' +
      (md ? mdSangHtml(md) : '') + '</div>' +
  '</div>';
}

/** Gắn hành vi cho mọi ô soạn trong `el`. */
function batSoan(el) {
  $$('.soan', el).forEach((s) => {
    const vung = $('.soan-vung', s);
    $$('.soan-nut', s).forEach((b) => {
      b.onmousedown = (e) => e.preventDefault();          // giữ vùng chọn trong ô soạn
      b.onclick = () => {
        vung.focus();
        if (b.dataset.lenh === 'createLink') {
          const u = prompt('Dán link (https://…)');
          if (u && /^https?:\/\//i.test(u.trim())) document.execCommand('createLink', false, u.trim());
          return;
        }
        document.execCommand(b.dataset.lenh, false, null);
      };
    });
    /* Dán: lọc HTML về đúng bộ định dạng giữ được, rồi dựng lại cho sạch. */
    vung.addEventListener('paste', (e) => {
      const cd = e.clipboardData || window.clipboardData;
      if (!cd) return;
      e.preventDefault();
      const html = cd.getData('text/html');
      const md = html ? htmlSangMd(html) : String(cd.getData('text/plain') || '');
      document.execCommand('insertHTML', false, mdSangHtml(md));
    });
  });
}

/** Nội dung ô soạn của một mục → markdown để gửi lên máy chủ. */
const layMd = (el, rec) => {
  const v = $('.soan-vung[data-rec="' + rec + '"]', el);
  return v ? htmlSangMd(v.innerHTML) : '';
};

/**
 * Tab "Cần hỗ trợ" phía NHÂN SỰ — vướng mắc mình đã nêu trong 90 ngày và tình
 * trạng xử lý, kèm hướng dẫn quản lý ghi (giữ định dạng). Chỉ xem.
 */
async function veVuongMac(el) {
  const d = await goi('/api/vuong-mac-cua-toi?moi=1');
  const nhan = {
    chua: '<span class="nhan-tt cam">Đang chờ xử lý</span>',
    'chua-duoc': '<span class="nhan-tt do">Chưa xử lý được</span>',
    xong: '<span class="nhan-tt xanh">Đã xử lý</span>',
  };
  const thu = { chua: 0, 'chua-duoc': 1, xong: 2 };
  const ds = d.ds.slice().sort((a, b) => (thu[a.trangThai] - thu[b.trangThai]) || (b.tu - a.tu));
  const soCho = ds.filter((x) => x.trangThai !== 'xong').length;
  const muc = (x) => '<div class="ht-muc ' + x.trangThai + '">' +
    '<div class="ht-dau"><span class="ht-ten">' + esc(x.loaiKy) + ' · ' + esc(x.nhan) + '</span>' +
      '<span class="ht-tt">' + nhan[x.trangThai] + '</span></div>' +
    '<div class="ht-noi">' + esc(String(x.noi || '').trim()) + '</div>' +
    (x.trangThai !== 'chua'
      ? '<div class="ht-kq"><div class="ht-kq-dau">' +
          (x.trangThai === 'xong' ? '✔ Đã xử lý' : '⏳ Chưa xử lý được tại thời điểm này') +
          (x.xuLyBoi ? ' · ' + esc(x.xuLyBoi) : '') + (x.xuLyLuc ? ' · ' + esc(veNgay(x.xuLyLuc)) : '') + '</div>' +
          (x.ghiChu ? '<div class="ht-kq-chu">' + mdSangHtml(x.ghiChu) + '</div>' : '') + '</div>'
      : '<div class="ht-kq"><div class="ht-kq-dau">Quản lý đã nhận được, sẽ phản hồi cho bạn qua tin nhắn Lark.</div></div>') +
  '</div>';
  el.innerHTML = '<div class="the"><div class="the-dau"><h2>Vướng mắc bạn đã nêu</h2>' +
    '<span class="nho">90 ngày gần đây · ' + ds.length + ' mục' +
      (soCho ? ' · <b style="color:var(--orange-text)">' + soCho + ' đang chờ</b>' : '') + '</span></div>' +
    '<div class="the-than">' +
      '<div class="nho" style="margin-bottom:10px">Ghi vào ô <b>"Cần hỗ trợ & vấn đề gặp phải"</b> khi nộp báo cáo — ' +
        'quản lý nhận ngay và phản hồi cho bạn tại đây và qua tin nhắn Lark.</div>' +
      (ds.length ? '<div class="ht-ds">' + ds.map(muc).join('') + '</div>'
        : rong('Bạn chưa nêu vướng mắc nào', 'Khi gặp khó, ghi vào ô "Cần hỗ trợ" trong phiếu báo cáo.')) +
    '</div></div>';
}

/* Lọc ở màn Cần hỗ trợ — giữ ngoài hàm để đổi tab rồi quay lại vẫn đúng chỗ. */
let HT_LOC = 'chua';
/* Ghi chú xử lý đang gõ dở, theo từng mục (recId → markdown). Màn này vẽ lại cả
 * danh sách mỗi lần bấm lọc hay chốt một mục khác — trước đây là xoá trắng ghi
 * chú đang soạn ở mọi mục còn lại. Map sống ngoài lượt vẽ; mỗi mục còn một bản
 * trên máy (khoá ht.<recId>) để tải lại trang cũng không mất. */
const HT_NHAP = new Map();
const htKhoa = (rec) => 'ht.' + rec;
function htNhapCua(rec) {
  if (!HT_NHAP.has(rec)) {
    const n = nhapDoc(htKhoa(rec));
    if (n && typeof n.md === 'string') HT_NHAP.set(rec, { md: n.md, luc: n.luc, may: true });
  }
  return HT_NHAP.get(rec) || null;
}

async function veCanHoTro(el) {
  /* Lọc theo kỳ như mọi màn khác (anh Hùng 02/10: "tab cần hỗ trợ cũng cần lọc
   * theo"). Trước đây cứng bốn tuần gần nhất — xem lại vướng mắc tháng trước
   * thì chịu, mà cuối tháng ngồi soát lại thì đó đúng là thứ cần xem.
   *
   * Vẫn giữ tinh thần cũ "nhìn rộng hơn một tuần": mặc định là THÁNG, không
   * phải tuần. Vướng mắc nêu tuần trước mà chưa gỡ thì vẫn là vướng mắc, biến
   * mất khỏi màn hình không làm nó tự hết. */
  const k = kyTheoLoc(HT_KYLOC);
  const d = await goi('/api/can-ho-tro?tu=' + k.tu + '&den=' + Math.min(k.den, Date.now()) + '&moi=1');
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
    /* Ghi chú xử lý thường là cả đoạn hướng dẫn nhiều bước (anh Hùng 30/09 dán
     * cách sửa Vbee) — giữ nguyên xuống dòng, không dồn thành một hàng. */
    const kq = s !== 'chua' && (x.ghiChu || x.xuLyBoi)
      ? '<div class="ht-kq"><div class="ht-kq-dau">' + (s === 'xong' ? '✔ Đã xử lý' : '⏳ Chưa xử lý được') +
          (x.xuLyBoi ? ' · ' + esc(x.xuLyBoi) : '') + (x.xuLyLuc ? ' · ' + esc(veNgay(x.xuLyLuc)) : '') +
          (x.daBaoLuc ? ' · đã nhắn cho ' + esc(x.ten) : '') + '</div>' +
          (x.ghiChu ? '<div class="ht-kq-chu">' + mdSangHtml(x.ghiChu) + '</div>' : '') + '</div>' : '';
    /* Ghi chú đang gõ dở (nếu có và khác bản đã lưu) thắng bản đã lưu. */
    const nh = s === 'xong' ? null : htNhapCua(String(x.recId));
    const coNhap = nh && nh.md !== String(x.ghiChu || '');
    if (nh && !coNhap) { HT_NHAP.delete(String(x.recId)); nhapXoa(htKhoa(x.recId)); }
    const tac = s === 'xong'
      ? '<div class="ht-tac"><div class="ht-nut-nhom">' + nut(x, 'mo-lai', 'Mở lại', true) + '</div></div>'
      : '<div class="ht-tac">' +
          oSoan(x.recId, coNhap ? nh.md : x.ghiChu, 'Ghi chú cách xử lý / lý do chưa xử lý được — dán văn bản có định dạng được, nhân sự nhận đúng như vậy') +
          /* Chỉ báo "khôi phục" khi bản nháp lấy từ máy (sau tải lại trang). Vẽ
           * lại trong cùng phiên thì chữ vẫn nằm đó như chưa từng đi đâu. */
          (coNhap && nh.may ? '<div style="margin:4px 0 6px">' + baoKhoiPhuc(nh.luc, x.recId) + '</div>' : '') +
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
    '<span class="nho">' + esc(k.nhan) + ' · ' + d.ds.length + ' mục · ' +
      (soChua ? '<b style="color:var(--orange-text)">' + soChua + ' chưa xong</b>' : 'đã xử lý hết') + '</span>' +
    '<div class="lon"></div><div class="pills">' +
      pill('chua', 'Chưa xong') + pill('xong', 'Đã xử lý') + pill('tat-ca', 'Tất cả') +
    '</div>' + thanhKy('ht', HT_KYLOC) + '</div>' +
    '<div class="the-than">' +
      '<div class="nho" style="margin-bottom:10px">Bấm <b>Đã xử lý</b> hoặc <b>Chưa xử lý được</b> — bot Marketing Hub ' +
        'sẽ nhắn riêng cho người nêu kèm ghi chú của bạn.</div>' +
      (ds.length ? '<div class="ht-ds">' + ds.map(muc).join('') + '</div>'
        : (d.ds.length
          ? rong(HT_LOC === 'chua' ? 'Không còn vướng mắc nào chưa xong' : 'Chưa có mục nào đã xử lý')
          : rong('Không ai nêu vướng mắc', 'Ô "Cần hỗ trợ" trong phiếu báo cáo đang trống ở mọi người.'))) +
    '</div></div>';

  $$('[data-loc]', el).forEach((b) => { b.onclick = () => { HT_LOC = b.dataset.loc; veCanHoTro(el); }; });
  ganThanhKy(el, (ma) => { HT_KYLOC = ma; veCanHoTro(el); });
  batSoan(el);
  const daLuu = new Map(d.ds.map((x) => [String(x.recId), String(x.ghiChu || '')]));
  $$('.soan-vung', el).forEach((v) => {
    const rec = v.dataset.rec;
    v.addEventListener('input', () => {
      const md = htmlSangMd(v.innerHTML);
      if (md === daLuu.get(rec)) { HT_NHAP.delete(rec); nhapHen(htKhoa(rec), () => null); return; }
      HT_NHAP.set(rec, { md, luc: Date.now() });
      nhapHen(htKhoa(rec), () => ({ md }));
    });
  });
  $$('[data-bo-nhap]', el).forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      const rec = a.dataset.boNhap;
      HT_NHAP.delete(rec); nhapHuy(htKhoa(rec));
      veCanHoTro(el);
    };
  });
  $$('.ht-nut', el).forEach((b) => {
    b.onclick = async () => {
      const rec = b.dataset.rec;
      const ghi = layMd(el, rec);
      if (b.dataset.tt === 'chua-duoc' && !ghi) {
        const v = $('.soan-vung[data-rec="' + rec + '"]', el); if (v) v.focus();
        return toast('Ghi lý do chưa xử lý được để nhân sự biết', 'do');
      }
      b.disabled = true;
      try {
        const r = await goi('/api/can-ho-tro/xu-ly', { method: 'POST', body: JSON.stringify({
          recId: rec, trangThai: b.dataset.tt, ghiChu: ghi,
          bao: b.dataset.tt !== 'mo-lai' }) });
        HT_NHAP.delete(rec); nhapHuy(htKhoa(rec));   // máy chủ đã nhận ghi chú — nháp hết việc
        const chu = { xong: 'Đã ghi nhận xử lý', 'chua-duoc': 'Đã ghi chưa xử lý được', 'mo-lai': 'Đã mở lại' }[r.trangThai];
        if (r.bao && !r.bao.ok) toast(chu + ' — nhưng chưa nhắn được cho ' + r.nguoi + ': ' + r.bao.loi, 'do');
        else toast(chu + (r.bao && r.bao.ok ? ' · đã nhắn cho ' + r.nguoi : ''));
        veCanHoTro(el);
      } catch (e) { toast('Không lưu được: ' + e.message, 'do'); b.disabled = false; }
    };
  });
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

/* Nháp Thiết lập trên máy: một khoá cho cả màn, mỗi phần (chuẩn / tin) chỉ có
 * mặt khi phần đó đang có chỉnh chưa lưu. TL_KP ghi giờ của phần vừa khôi phục
 * để hiện dòng báo cạnh nhãn "có chỉnh chưa lưu". */
const TL_KHOA = 'thiet-lap';
let TL_KP = null;
const tlNhap = () => (TL && (TL_BAN || TL_TIN_BAN)
  ? { chuan: TL_BAN ? TL.chuan : null, tin: TL_TIN_BAN ? TL.tin : null } : null);
const tlGhiNhap = () => nhapHen(TL_KHOA, tlNhap);
function tlKhoiPhuc() {
  TL_KP = null;
  const n = nhapDoc(TL_KHOA);
  if (!n) return;
  const khac = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
  if (n.chuan && khac(n.chuan, TL.chuan)) { TL.chuan = n.chuan; TL_BAN = true; TL_KP = { chuan: n.luc }; }
  if (n.tin && khac(n.tin, TL.tin)) { TL.tin = n.tin; TL_TIN_BAN = true; TL_KP = Object.assign(TL_KP || {}, { tin: n.luc }); }
  if (!TL_KP) nhapXoa(TL_KHOA);
}
const tlBaoKP = (phan, ban) => (ban && TL_KP && TL_KP[phan] ? ' ' + baoKhoiPhuc(TL_KP[phan], phan) : '');

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
      tlBaoKP('tin', TL_TIN_BAN) +
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
        /* Anh Hùng (30/09): "nếu có vướng mắc tới thì thông báo cho anh luôn". */
        '<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border)">' +
          '<label style="display:flex;gap:8px;align-items:center;margin-bottom:8px;font-weight:600">' +
            '<input type="checkbox" id="tnHT"' + (t.baoHoTro ? ' checked' : '') + '> Báo ngay khi có vướng mắc mới</label>' +
          '<div class="nho" style="margin-bottom:6px">Nhắn riêng cho — mỗi khi phiếu nộp có ô "Cần hỗ trợ" mới hoặc đổi nội dung</div>' +
          (t.nhanHoTro.length ? t.nhanHoTro.map((u, i) =>
            '<span class="nhan-tt xam" style="margin:0 6px 6px 0;display:inline-flex;gap:6px;align-items:center">' +
              esc(u.ten || u.openId) + ' <a href="#" data-bo-ht="' + i + '" title="Bỏ">✕</a></span>').join('')
            : '<div class="nho" style="margin-bottom:6px;color:var(--orange-text)">Chưa có ai nhận — vướng mắc sẽ không được báo.</div>') +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">' +
            (TL.toi && TL.toi.openId && !t.nhanHoTro.some((x) => x.openId === TL.toi.openId)
              ? '<button class="btn nho mo" id="tnHTToi">+ Tôi</button>' : '') +
            ((TL.coTheNhan || []).some((u) => !t.nhanHoTro.some((x) => x.openId === u.openId))
              ? '<select id="tnHTChon"><option value="">+ Thêm người…</option>' +
                TL.coTheNhan.filter((u) => !t.nhanHoTro.some((x) => x.openId === u.openId))
                  .map((u) => '<option value="' + esc(u.openId) + '">' + esc(u.ten) + '</option>').join('') +
                '</select>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div></div>';
}

function batKhoiTin(el) {
  const t = TL.tin;
  const doi = () => { TL_TIN_BAN = true; tlGhiNhap(); veThietLap(el); };
  /* Ô chữ chỉ báo đổi khi rời ô (onchange) — gõ dở mà tải lại trang thì mất.
   * Ghi vào TL ngay từng phím (không vẽ lại, kẻo mất con trỏ) để nháp có chữ. */
  const go = (o, ghi) => { if (o) o.oninput = () => { ghi(o.value); TL_TIN_BAN = true; tlGhiNhap(); }; };
  go($('#tnNhom'), (v) => { t.nhomId = v.trim(); });
  go($('#tnTieuDe'), (v) => { t.tieuDe = v; });
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
  $('#tnHT').onchange = (e) => { t.baoHoTro = e.target.checked; doi(); };
  $$('[data-bo-ht]', el).forEach((a) => { a.onclick = (e) => { e.preventDefault(); t.nhanHoTro.splice(Number(a.dataset.boHt), 1); doi(); }; });
  const htToi = $('#tnHTToi'); if (htToi) htToi.onclick = () => { t.nhanHoTro.push({ ten: TL.toi.ten, openId: TL.toi.openId }); doi(); };
  const htCh = $('#tnHTChon');
  if (htCh) htCh.onchange = () => {
    const u = TL.coTheNhan.find((x) => x.openId === htCh.value);
    if (u) { t.nhanHoTro.push({ ten: u.ten, openId: u.openId }); doi(); }
  };
  $('#tnMacDinh').onclick = () => {
    Object.assign(t, { tieuDe: TL.tinMacDinh.tieuDe, tagNguoi: true, hienBang: true, hienDanhGia: true }); doi();
  };
  $('#tnLuu').onclick = async (e) => {
    if (t.bat && t.dich !== 'nhom' && !t.nguoiNhan.length) return toast('Chọn ít nhất một người nhận riêng', 'do');
    e.target.disabled = true;
    try {
      const r = await goi('/api/thiet-lap/tin', { method: 'POST', body: JSON.stringify({ tin: t }) });
      TL.tin = r.tin; TL_TIN_BAN = false;
      if (TL_KP) TL_KP.tin = null;
      nhapNgay(TL_KHOA, tlNhap);          // bỏ phần tin khỏi nháp, giữ phần chuẩn nếu còn
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
  /* Thẻ mẫu xem trước đã BỎ (anh Hùng 02/10: "chỗ mẫu xem thử không cần hiện").
   * Nó chiếm nửa bề ngang màn thiết lập, dựng lại bằng một lượt gọi máy chủ mỗi
   * lần gõ một chữ, mà muốn xem thật thì đã có nút "Gửi thử cho tôi" — nhận
   * đúng thẻ trong Lark chứ không phải bản vẽ lại gần giống. */
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
const TL_MO = new Set();  // vị trí nào đang mở (màn vẽ lại sau mỗi lần sửa)

async function veThietLap(el) {
  if (!TL) {
    TL = await goi('/api/thiet-lap');
    TL.chuan = JSON.parse(JSON.stringify(TL.chuan));
    TL.tin = JSON.parse(JSON.stringify(TL.tin));
    tlKhoiPhuc();
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
    /* Gập lại, mở ra khi cần sửa (anh Hùng 02/10: "cho giao diện gọn thông minh
     * hơn"). Mỗi vị trí trước đây đổ ra hai hàng chip × 15 nhóm việc, bốn vị
     * trí là bốn màn hình cuộn — mà phần lớn thời gian chỉ sửa đúng một. Tóm
     * tắt ngay trên nắp đã đủ để biết có cần mở hay không. */
    const tomTat = [
      v.nhomChinh.length ? 'chính: ' + v.nhomChinh.join(', ') : 'chưa chọn việc chính',
      v.sanLuong.length ? v.sanLuong.length + ' chỉ tiêu sản lượng' : 'không có chỉ tiêu',
    ].join(' · ');
    return '<details class="the tl-vt"' + (TL_MO.has(vt) ? ' open' : '') + ' ' + dv + '>' +
      '<summary class="the-dau"><h2>' + esc(vt) + '</h2>' +
      '<span class="nho">' + (n ? 'đang áp cho ' + n + ' người' : 'chưa ai có vị trí này') +
        ' · ' + esc(tomTat) + '</span>' +
      '<div class="lon"></div>' +
      '<button class="btn nho mo tl-xoa-vt" ' + dv + ' title="Bỏ vị trí này">Bỏ</button>' +
    '</summary><div class="the-than">' +
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
    '</div></details>';
  }).join('');

  el.innerHTML = veKhoiTin() +
    '<div class="the"><div class="the-dau"><h2>Chuẩn chung mọi vị trí</h2>' +
      '<span class="nho">' + (TL_BAN ? 'có chỉnh chưa lưu' : 'đã lưu trên Base') + '</span>' +
      tlBaoKP('chuan', TL_BAN) + '<div class="lon"></div>' +
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

  const doi = () => { TL_BAN = true; TL_THU = null; tlGhiNhap(); veThietLap(el); };
  const vtCua = (b) => c.viTri[b.dataset.vt];
  /* Như khối tin: ô gõ ghi vào TL từng phím để nháp trên máy có chữ, vẽ lại thì
   * vẫn đợi rời ô. */
  const go = (sel, ghi) => $$(sel, el).forEach((o) => { o.oninput = () => { ghi(o); TL_BAN = true; tlGhiNhap(); }; });
  go('[data-g]', (i) => { c[i.dataset.g] = Number(i.value) || 0; });
  go('.tl-ten', (i) => { vtCua(i).sanLuong[i.dataset.i].ten = i.value.trim(); });
  go('[data-k="toiThieu"]', (i) => { vtCua(i).sanLuong[i.dataset.i].toiThieu = Number(i.value) || 0; });
  go('.tl-ln', (i) => { c.loiNhan = c.loiNhan || {}; c.loiNhan[i.dataset.ln] = i.value; });
  /* Bỏ phần vừa khôi phục: xoá phần đó khỏi nháp rồi đọc lại bản trên Base
   * (phần kia, nếu còn nháp, sẽ được khôi phục lại như cũ). */
  $$('[data-bo-nhap]', el).forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      if (a.dataset.boNhap === 'chuan') TL_BAN = false; else TL_TIN_BAN = false;
      nhapNgay(TL_KHOA, tlNhap);
      TL = null; TL_BAN = false; TL_TIN_BAN = false; TL_THU = null; TL_KP = null;
      veThietLap(el).catch((er) => toast('Không tải lại được: ' + er.message, 'do'));
    };
  });
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
  /* Nhớ vị trí nào đang mở: cả màn vẽ lại sau mỗi lần sửa, không nhớ thì mỗi
   * lần tick một chip là khối vừa mở lại sập xuống. */
  $$('.tl-vt', el).forEach((d) => {
    d.addEventListener('toggle', () => {
      if (d.open) TL_MO.add(d.dataset.vt); else TL_MO.delete(d.dataset.vt);
    });
  });
  $$('.tl-xoa-vt', el).forEach((b) => {
    b.onclick = (e) => {
      /* Nút nằm trong <summary>: không chặn thì bấm Bỏ cũng gập/mở khối. */
      e.preventDefault(); e.stopPropagation();
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
      if (TL_KP) TL_KP.chuan = null;
      nhapNgay(TL_KHOA, tlNhap);          // bỏ phần chuẩn khỏi nháp, giữ phần tin nếu còn
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
