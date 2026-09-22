'use strict';
/**
 * Đọc bốn bảng của Base "Sản phẩm" và ghép lại thành hồ sơ sản phẩm.
 *
 * Một lần mở app cần cả bốn bảng (sản phẩm, giá theo giai đoạn, chính sách,
 * media) — nên đọc một lượt rồi ghép tại chỗ, thay vì gọi Base mỗi lần bấm vào
 * một sản phẩm. Base này đổi vài lần một tuần chứ không phải vài lần một phút,
 * nên đệm 90 giây là thoải mái và vẫn coi như dữ liệu sống.
 */
const cfg = require('./config');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

const F = cfg.f;
const NGAY = 86400000;

/* ---------------- đọc ô ---------------- */

/** Ô text của Base có khi là chuỗi, có khi là mảng đoạn giàu định dạng. */
function chu(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) {
    return v.map((p) => (typeof p === 'string' ? p : (p && (p.text || p.name || p.link)) || ''))
      .join('').trim();
  }
  if (typeof v === 'object') return String(v.text || v.name || v.link || '').trim();
  return String(v).trim();
}

/** Select đơn trả về mảng một phần tử; select nhiều trả mảng. Về đây thành mảng. */
function nhieu(v) {
  if (v == null || v === '') return [];
  return (Array.isArray(v) ? v : [v]).map((x) => chu(x)).filter(Boolean);
}
const mot = (v) => nhieu(v)[0] || '';

/* Ô trống phải ra `null`, KHÔNG ra 0.
 *
 * Cột công thức "Còn lại (ngày)" trả chuỗi rỗng cho dòng chưa đặt hạn. Bản đầu
 * để `Number('')` chạy thẳng, ra 0 — và 0 ngày nghĩa là "hết hạn hôm nay", nên
 * mọi sản phẩm không có hạn đều nhảy lên đầu danh sách cảnh báo. Cùng lý do với
 * giá: chưa có giá khác hẳn giá 0 đồng. */
const so = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = chu(v).replace(/[^\d.-]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** datetime: khi là epoch ms, khi là chuỗi ISO. Về đây luôn là số ms hoặc 0. */
const ms = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const t = Date.parse(chu(v));
  return Number.isFinite(t) ? t : 0;
};

/** Ô link trả [{id}] — chỉ lấy record_id để ghép sang bảng khác. */
const idLink = (v) => (Array.isArray(v) ? v : []).map((x) => (x && (x.id || x.record_id)) || '')
  .filter(Boolean);

/* Ô kiểu url trong Base hay được trả về dạng markdown `[nhãn](url)` — lấy phần
   url. Không cắt thì giao diện in cả cặp ngoặc vào thẻ <a href>. */
function linkSach(v) {
  const t = chu(v);
  const m = /^\[(.*)\]\((.+)\)$/s.exec(t);
  const u = m ? m[2].trim() : t;
  return /^https?:\/\//i.test(u) ? u : '';
}

/* ---------------- ghép hồ sơ ---------------- */

function veSanPham(r) {
  const c = r.cells || {};
  const g = F.sp;
  const hieuLucDen = ms(c[g.hieuLucDen]);
  return {
    id: r.record_id,
    ma: chu(c[g.ma]),
    ten: chu(c[g.ten]),
    tenEn: chu(c[g.tenEn]),
    nhom: mot(c[g.nhom]),
    uuTien: mot(c[g.uuTien]),
    trangThai: mot(c[g.trangThai]),
    thoiLuong: chu(c[g.thoiLuong]),
    khoiHanh: chu(c[g.khoiHanh]),
    giaNL: so(c[g.giaNL]),
    giaTE: so(c[g.giaTE]),
    ghiChuGia: chu(c[g.ghiChuGia]),
    hieuLucTu: ms(c[g.hieuLucTu]),
    hieuLucDen,
    /* Ba cột công thức dưới đây do Base tính. App KHÔNG tính lại — một định
       nghĩa "sắp hết hạn" duy nhất, nằm trên Base, để người mở Base và người
       mở app thấy cùng một con số. Riêng `conLai` phải tự suy khi Base trả
       rỗng (dòng chưa đặt hạn) để bảng còn xếp thứ tự được. */
    tinhTrang: chu(c[g.tinhTrang]),
    conLai: so(c[g.conLai]),
    thieu: chu(c[g.thieu]).replace(/\s*·\s*$/, ''),
    usp: chu(c[g.usp]),
    noiBat: chu(c[g.noiBat]),
    doiTuong: chu(c[g.doiTuong]),
    tepKhach: nhieu(c[g.tepKhach]),
    traiNghiem: nhieu(c[g.traiNghiem]),
    lichTrinh: chu(c[g.lichTrinh]),
    baoGom: chu(c[g.baoGom]),
    chuaBaoGom: chu(c[g.chuaBaoGom]),
    csTreEm: chu(c[g.csTreEm]),
    csPhuThu: chu(c[g.csPhuThu]),
    csGiamTru: chu(c[g.csGiamTru]),
    uuDai: chu(c[g.uuDai]),
    luuY: chu(c[g.luuY]),
    anhVI: linkSach(c[g.anhVI]),
    anhEN: linkSach(c[g.anhEN]),
    thuMuc: linkSach(c[g.thuMuc]),
    video: linkSach(c[g.video]) || chu(c[g.video]),
    chuongTrinh: linkSach(c[g.chuongTrinh]),
    nguon: chu(c[g.nguon]),
    capNhat: ms(c[g.capNhat]),
    nguoiCapNhat: nhieu(c[g.nguoiCapNhat]).join(', '),
    gia: [],
    chinhSach: [],
    media: [],
    /* Điền ở docTatCa() sau khi nối xong chính sách — xem tinhGiaSauGiam(). */
    giaSauGiam: null,
  };
}

function veGia(r) {
  const c = r.cells || {};
  const g = F.gia;
  return {
    id: r.record_id,
    ten: chu(c[g.ten]),
    spIds: idLink(c[g.sanPham]),
    loai: mot(c[g.loai]),
    tu: ms(c[g.tu]),
    den: ms(c[g.den]),
    giaNL: so(c[g.giaNL]),
    giaTE: so(c[g.giaTE]),
    dieuKien: chu(c[g.dieuKien]),
    ghiChu: chu(c[g.ghiChu]),
    tinhTrang: chu(c[g.tinhTrang]),
    nguon: chu(c[g.nguon]),
  };
}

function veChinhSach(r) {
  const c = r.cells || {};
  const g = F.cs;
  return {
    id: r.record_id,
    ten: chu(c[g.ten]),
    loai: mot(c[g.loai]),
    phamVi: mot(c[g.phamVi]),
    spIds: idLink(c[g.apDungCho]),
    noiDung: chu(c[g.noiDung]),
    tu: ms(c[g.tu]),
    den: ms(c[g.den]),
    tinhTrang: chu(c[g.tinhTrang]),
    truyenThong: mot(c[g.truyenThong]),
    nguon: linkSach(c[g.nguon]),
    giamNL: so(c[g.giamNL]),
    giamTE: so(c[g.giamTE]),
    giamPhanTram: so(c[g.giamPhanTram]),
    apGia: !!c[g.apGia],
    ghiGiam: chu(c[g.ghiGiam]),
  };
}

function veMedia(r) {
  const c = r.cells || {};
  const g = F.media;
  return {
    id: r.record_id,
    ten: chu(c[g.ten]),
    spIds: idLink(c[g.sanPham]),
    loai: mot(c[g.loai]),
    ngonNgu: mot(c[g.ngonNgu]),
    link: linkSach(c[g.link]),
    ghiChu: chu(c[g.ghiChu]),
  };
}

/* ---------------- giá sau giảm ---------------- */

/**
 * Chính sách này có được trừ vào GIÁ HIỂN THỊ của sản phẩm không.
 *
 * Ba điều kiện, thiếu một là không trừ:
 *  1. Quản lý đã bật ô "Áp vào giá hiển thị". Đây là công tắc của con người —
 *     app không tự suy ra từ chữ trong nội dung chính sách.
 *  2. Chưa hết hiệu lực (đọc cột công thức `Tình trạng` của Base).
 *  3. Không phải chính sách "Chỉ nội bộ". Một mức giảm nội bộ mà chui vào giá
 *     công bố là hứa với khách thứ công ty chưa công bố.
 */
const trongGiaHienThi = (c) =>
  c.apGia === true &&
  !/hết hiệu lực/i.test(c.tinhTrang || '') &&
  !/Chỉ nội bộ/i.test(c.truyenThong || '');

/**
 * Trừ các ưu đãi đang chạy vào giá công bố của một sản phẩm.
 *
 * Thứ tự: trừ TIỀN trước, rồi mới lấy PHẦN TRĂM trên phần còn lại. Bình thường
 * một chính sách chỉ có một trong hai, nên thứ tự không đổi kết quả; khai rõ ở
 * đây để lúc có cả hai thì app và người đọc Base hiểu giống nhau.
 *
 * Trả về `null` khi không có gì để trừ — giao diện lúc đó chỉ in một mức giá,
 * không vẽ giá gạch ngang cho có.
 */
function tinhGiaSauGiam(p) {
  const ds = (p.chinhSach || []).filter(trongGiaHienThi)
    .filter((c) => c.giamNL || c.giamTE || c.giamPhanTram);
  if (!ds.length) return null;

  const tru = (goc, khoa) => {
    if (goc == null) return null;
    let v = goc;
    for (const c of ds) v -= (c[khoa] || 0);
    for (const c of ds) if (c.giamPhanTram) v -= v * (c.giamPhanTram / 100);
    return Math.max(0, Math.round(v));
  };

  const nl = tru(p.giaNL, 'giamNL');
  const te = tru(p.giaTE, 'giamTE');
  /* Không có giá gốc thì không có giá sau giảm — đừng bịa ra số 0. */
  if (nl == null && te == null) return null;

  return {
    nl, te,
    truNL: p.giaNL != null && nl != null ? p.giaNL - nl : null,
    truTE: p.giaTE != null && te != null ? p.giaTE - te : null,
    ds: ds.map((c) => ({ id: c.id, ten: c.ten, ghiGiam: c.ghiGiam, den: c.den })),
  };
}

/* ---------------- gom một lượt ---------------- */

const thuTu = (ds, v) => { const i = ds.indexOf(v); return i < 0 ? ds.length : i; };

async function docTatCa() {
  const [sp, gia, cs, media] = await Promise.all([
    lark.listAllRecords(cfg.spTableId),
    lark.listAllRecords(cfg.giaTableId),
    lark.listAllRecords(cfg.chinhSachTableId),
    lark.listAllRecords(cfg.mediaTableId),
  ]);

  const ds = sp.map(veSanPham).filter((p) => p.ma || p.ten);
  const theoId = new Map(ds.map((p) => [p.id, p]));

  /* Chính sách phạm vi "Toàn bộ sản phẩm" thường KHÔNG nối tới dòng nào —
     nối 59 dòng bằng tay thì lần thêm sản phẩm thứ 60 là quên. Nên ở đây suy
     ra: không có ô "Áp dụng cho" nghĩa là áp cho mọi sản phẩm. */
  const csAll = [];
  for (const r of cs.map(veChinhSach)) {
    if (!r.ten) continue;
    if (!r.spIds.length) { csAll.push(r); continue; }
    for (const id of r.spIds) { const p = theoId.get(id); if (p) p.chinhSach.push(r); }
  }
  for (const p of ds) p.chinhSach = csAll.concat(p.chinhSach);

  for (const r of gia.map(veGia)) {
    if (!r.ten && !r.spIds.length) continue;
    for (const id of r.spIds) { const p = theoId.get(id); if (p) p.gia.push(r); }
  }

  /* Media không nối sản phẩm là tài liệu dùng chung (thư mục tổng, bảng giá,
     wiki). Tách riêng để nó KHÔNG bị nhét vào từng sản phẩm — mở một tour ra mà
     thấy "Bảng giá gửi đối tác" nằm trong mục ảnh của nó thì sai nghĩa.
     Giao diện hiện không vẽ nhóm này (đã bỏ tab Tài liệu chung); giữ lại đây vì
     việc tách vẫn cần, và server quyết định có gửi lên hay không. */
  const mediaChung = [];
  for (const r of media.map(veMedia)) {
    if (!r.ten) continue;
    if (!r.spIds.length) { mediaChung.push(r); continue; }
    for (const id of r.spIds) { const p = theoId.get(id); if (p) p.media.push(r); }
  }

  /* Tính sau khi đã nối xong chính sách — trước đó `p.chinhSach` còn rỗng. */
  for (const p of ds) p.giaSauGiam = tinhGiaSauGiam(p);

  ds.sort((a, b) =>
    thuTu(cfg.chon.nhom, a.nhom) - thuTu(cfg.chon.nhom, b.nhom) ||
    thuTu(cfg.chon.uuTien, a.uuTien) - thuTu(cfg.chon.uuTien, b.uuTien) ||
    a.ten.localeCompare(b.ten, 'vi'));

  return { ds, mediaChung, luc: Date.now() };
}

/* ---------------- đệm ---------------- */
/* Đệm theo TIẾN TRÌNH, không theo người: Base này ai xem cũng thấy y hệt nhau
   (không có dòng riêng tư), nên không có chuyện lộ dữ liệu chéo như ở sổ quỹ. */
let dem = null;
let dangDoc = null;
const HAN = 90000;

async function tatCa({ moi = false } = {}) {
  if (!moi && dem && Date.now() - dem.luc < HAN) return dem;
  /* Nhiều tab cùng mở lúc app vừa khởi động thì chỉ đọc Base MỘT lần. */
  if (!dangDoc) {
    dangDoc = docTatCa()
      .then((d) => { dem = d; return d; })
      .finally(() => { dangDoc = null; });
  }
  return dangDoc;
}

const xoaDem = () => { dem = null; };

/* ---------------- các lát cắt dùng chung ---------------- */

/** Sắp hết hạn / đã hết hạn — đọc thẳng cột công thức của Base. */
const sapHetHan = (ds) => ds.filter((p) => /hết hạn/i.test(p.tinhTrang));

/** Hồ sơ chưa đủ để làm truyền thông. Cột công thức đã bỏ qua nhóm Dịch vụ lẻ. */
const canBoSung = (ds) => ds.filter((p) => p.thieu);

/** Ưu đãi đang chạy sẽ hết hạn trong `ngay` ngày tới. */
function uuDaiSapHet(ds, ngay = cfg.ngaySapHetHan) {
  const nay = Date.now();
  const han = nay + ngay * NGAY;
  const thay = new Map();
  for (const p of ds) {
    for (const c of p.chinhSach) {
      if (!c.den || c.den < nay || c.den > han) continue;
      if (!thay.has(c.id)) thay.set(c.id, Object.assign({ sanPham: [] }, c));
      thay.get(c.id).sanPham.push(p.ma || p.ten);
    }
  }
  return [...thay.values()].sort((a, b) => a.den - b.den);
}

module.exports = {
  tatCa, xoaDem, docTatCa,
  tinhGiaSauGiam, trongGiaHienThi,
  sapHetHan, canBoSung, uuDaiSapHet,
  chu, nhieu, mot, so, ms, linkSach, idLink,
  veSanPham, veGia, veChinhSach, veMedia,
};
