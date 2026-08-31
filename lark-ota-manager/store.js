'use strict';
/**
 * Nguồn dữ liệu booking cho dashboard: đọc từ Lark Base khi đã nối base, đọc từ
 * hàng đợi cục bộ khi chưa. LUÔN CHỈ MỘT NGUỒN tại một thời điểm — đọc trộn hai
 * nơi là kiểu bug mà số trên dashboard không bao giờ khớp số trong Base.
 *
 * Cột "Thông tin cần xử lý" được TÍNH LẠI mỗi lần đọc, không đọc chuỗi đã ghi
 * trong Base: cờ "còn 2 ngày, chưa xác nhận" phụ thuộc hôm nay là ngày nào, ghi
 * cứng vào Base thì hôm sau nó sai.
 */
const cfg = require('./config');
const lark = require('./lark');
const schema = require('./schema');
const danhmuc = require('./danhmuc');
const gia = require('./gia');
const hangdoi = require('./hangdoi');
const H = require('./chuanhoa');

const TZ = cfg.tzOffsetHours * 3600 * 1000;

/* ---------------------------------------------------- chuẩn hoá ô của Base */
const txt = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(txt).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.text || v.name || v.link || '');
  return String(v);
};
const clean = (v) => txt(v).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
const sel = (v) => (Array.isArray(v) ? txt(v[0]) : txt(v));
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const bool = (v) => v === true || v === 'true' || v === 1;

/** ISO/epoch của Base → 'YYYY-MM-DD' theo giờ tour. */
function toKey(v) {
  if (!v) return '';
  const t = typeof v === 'number' ? v : Date.parse(txt(v));
  if (!Number.isFinite(t)) return '';
  return new Date(t + TZ).toISOString().slice(0, 10);
}
function toMs(v) {
  if (!v) return 0;
  const t = typeof v === 'number' ? v : Date.parse(txt(v));
  return Number.isFinite(t) ? t : 0;
}

/** 'YYYY-MM-DD' → chuỗi datetime UTC để ghi vào Base = 00:00 giờ tour. */
function keyToBaseDatetime(key) {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d) - TZ).toISOString().slice(0, 19).replace('T', ' ');
}
/** epoch ms → chuỗi datetime UTC cho Base. */
const msToBaseDatetime = (ms) =>
  (ms ? new Date(ms).toISOString().slice(0, 19).replace('T', ' ') : null);

const todayKey = () => H.homNay();

/* =============================================== booking ⇄ bản ghi Base == */

/**
 * booking chuẩn → { fieldId: cellValue }. Chỉ ghi những cột base thực sự có.
 * Trường trống ghi null (xoá ô) thay vì bỏ qua, để lần OTA gửi lại có sửa đúng.
 */
function sangCell(b, luoc, { chiCotCo = true } = {}) {
  /* `ghiDuoc` chứ không phải `fields`: đây là danh sách cột KHÔNG phải công thức.
   * Base này tính tiền bằng công thức (Gross VND, Hoa hồng VND, Doanh thu thu về,
   * Lệch giá…) — ghi vào một trong số đó là Lark từ chối CẢ bản ghi, tức mất
   * nguyên booking chứ không chỉ thiếu một ô. */
  const F = (luoc && luoc.ghiDuoc) || {};
  const co = (k) => !chiCotCo || !!F[k];
  const out = {};
  const dat = (k, v) => { if (co(k)) out[F[k]] = v; };

  /* --- hai cột liên kết: nguồn của mọi con tiền trong Base --- */
  if (b.kenhRecordId) dat('kenh', [b.kenhRecordId]);
  if (b.tourRecordId) dat('tour', [b.tourRecordId]);

  dat('maBooking', b.maBooking || null);
  dat('tenKhach', b.tenKhach || null);
  dat('sdt', b.sdt || null);
  dat('email', b.email || null);
  dat('ngayDat', keyToBaseDatetime(b.ngayDat));
  dat('ngayDi', keyToBaseDatetime(b.ngayDi));
  dat('nguoiLon', b.nguoiLon == null ? null : Number(b.nguoiLon));
  dat('treEm', b.treEm == null ? null : Number(b.treEm));
  dat('diemDon', b.diemDon || null);
  dat('gioDon', b.gioDon || null);
  dat('ghiChu', b.ghiChu || null);

  /* Cột select: giá trị lạ là Lark chặn cả dòng, nên chỉ ghi khi nằm trong
   * option đã khai. Không khớp thì để trống — thiếu một ô còn hơn mất booking. */
  dat('ngonNgu', chonHopLe(b.thiTruong || b.ngonNgu, cfg.thiTruong));
  dat('tienTe', chonHopLe(b.tienTe, cfg.tienTe));
  dat('trangThai', chonHopLe(b.trangThai, cfg.trangThai) || cfg.trangThaiMoi);

  /* Cột "Gross nguyên tệ" giữ số ĐÚNG NGUYÊN TỆ (120 USD, không phải 3.144.000đ).
   * Booking đọc lại từ Base mang theo cả hai (tongTienGoc = nguyên tệ, tongTien =
   * Gross VND do công thức tính) — phải ghi lại bản nguyên tệ, ghi bản VNĐ vào đây
   * là mỗi lần sửa booking lại nhân tỷ giá thêm một lần nữa. */
  const grossGoc = b.tongTienGoc != null ? b.tongTienGoc : b.tongTien;
  dat('tongTien', grossGoc == null ? null : Number(grossGoc));
  /* Tỷ giá: KHÔNG có thì Base coi là 1 và Gross VND = số nguyên tệ — booking
   * 120 USD thành 120đ. Nên luôn điền, kể cả VND (=1). */
  dat('tyGia', tyGiaCua(b));

  /* Huỷ thì Base đòi Ngày huỷ (công thức "Kiểm tra dữ liệu" bắt lỗi thiếu).
   * Không huỷ thì XOÁ hai ô này, để booking huỷ nhầm rồi mở lại không còn vết. */
  const dangHuy = b.trangThai === 'Đã huỷ';
  dat('ngayHuy', dangHuy ? keyToBaseDatetime(b.ngayHuy || todayKey()) : null);
  dat('lyDoHuy', dangHuy ? (chonHopLe(b.lyDoHuy, cfg.lyDoHuy) || 'OTA huỷ') : null);

  dat('daNhan', !!b.daNhan);
  /* Payload gốc: bằng chứng khi số trên dashboard bị hỏi lại. Cắt 4000 ký tự —
   * ô văn bản của Base có hạn, mà phần đầu payload là phần có thông tin. */
  if (b.payloadGoc) dat('payloadGoc', String(b.payloadGoc).slice(0, 4000));

  return out;
}

/** Giá trị chỉ được ghi khi nằm trong danh sách option của cột select. */
function chonHopLe(v, ds) {
  const s = clean(v);
  if (!s) return null;
  const hit = ds.find((x) => x === s) ||
    ds.find((x) => x.toLowerCase() === s.toLowerCase());
  return hit || null;
}

/**
 * Tỷ giá về VNĐ cho một booking. Ưu tiên số OTA gửi kèm (nếu có), rồi tới bảng
 * tỷ giá trong config. Nguyên tệ lạ ⇒ null, để kế toán thấy ô trống mà điền tay
 * chứ không phải đi tìm xem con số sai đến từ đâu.
 */
function tyGiaCua(b) {
  if (Number.isFinite(Number(b.tyGia)) && Number(b.tyGia) > 0) return Number(b.tyGia);
  const tt = String(b.tienTe || 'VND').toUpperCase();
  const r = cfg.tyGia[tt];
  return Number.isFinite(Number(r)) && Number(r) > 0 ? Number(r) : null;
}

/**
 * Bản ghi Base → booking chuẩn.
 *
 * MỌI CON TIỀN ĐỀU ĐỌC TỪ CÔNG THỨC CỦA BASE, app không tính lại:
 *   tongTien  ← "Gross VND"          (khách trả, đã quy về VNĐ)
 *   hoaHong   ← "Hoa hồng VND"       (OTA giữ lại)
 *   thucNhan  ← "Doanh thu thu về"   (số khách × giá thu về trong Danh mục Tour)
 * Nhờ vậy con số trên dashboard và con số trong Base là MỘT, không thể lệch.
 */
function tuBanGhi(r, luoc) {
  const F = luoc.fields;
  const o = (k) => (F[k] ? r.c[F[k]] : null);
  /* Kênh/tour đọc qua cột công thức dạng chữ ("Kênh", "Sản phẩm") chứ không đọc
   * cột liên kết: cột liên kết trả về mảng record_id, muốn ra tên phải gọi thêm
   * một vòng API cho từng dòng. Chủ base đã dựng sẵn hai cột chữ đúng cho việc
   * này ("dùng để gom nhóm trong dashboard và pivot"). */
  const kenhTen = clean(o('kenhChu')) || sel(o('kenh'));
  const kenh = cfg.kenh.find((k) => k.ten === kenhTen) ||
    cfg.kenh.find((k) => kenhTen && kenhTen.toLowerCase().includes(k.ten.toLowerCase()));
  const nguyenTe = (clean(o('tienTe')) || 'VND').toUpperCase();
  return {
    id: r.id,
    recordId: r.id,
    kenh: kenhTen || '(chưa gán)',
    kenhId: kenh ? kenh.id : '',
    maBooking: clean(o('maBooking')),
    tenKhach: clean(o('tenKhach')),
    sdt: clean(o('sdt')),
    email: clean(o('email')),
    ngayDat: toKey(o('ngayDat')),
    ngayDi: toKey(o('ngayDi')),
    tour: clean(o('sanPham')) || sel(o('tour')),
    nguoiLon: num(o('nguoiLon')),
    treEm: num(o('treEm')),
    tongKhach: num(o('tongKhach')),
    diemDon: clean(o('diemDon')),
    gioDon: clean(o('gioDon')),
    ghiChu: clean(o('ghiChu')),
    ngonNgu: clean(o('ngonNgu')),
    tienTe: nguyenTe,
    /* Số nguyên tệ giữ riêng để tab Thiết lập đối chiếu được với Gross VND khi
     * nghi tỷ giá sai. Dashboard thì luôn dùng bản VNĐ. */
    tongTienGoc: num(o('tongTien')),
    tyGia: num(o('tyGia')),
    tongTien: num(o('tongTienVnd')),
    hoaHong: num(o('hoaHong')),
    hoaHongTyLe: (() => { const v = num(o('hoaHongTyLe')); return v == null ? null : (v <= 1 ? v * 100 : v); })(),
    thucNhan: num(o('thucNhan')),
    netVnd: num(o('netVnd')),
    sanPham: clean(o('sanPham')),
    lechBangGia: num(o('lechBangGia')),
    /* Doanh thu ở base này LUÔN tính từ bảng giá thu về trong Danh mục Tour —
     * đó chính là công thức của cột "Doanh thu thu về". */
    nguonThucNhan: num(o('thucNhan')) ? 'bang-gia' : '',
    /* Cờ do CHÍNH BASE soi (thiếu ngày huỷ, tour chưa có giá…). Khác với cờ vận
     * hành của app (thiếu SĐT, sát ngày) nên giữ riêng, không trộn. */
    kiemTra: clean(o('kiemTra')),
    trangThai: sel(o('trangThai')) || cfg.trangThaiMoi,
    ngayHuy: toKey(o('ngayHuy')),
    lyDoHuy: sel(o('lyDoHuy')),
    nhanLuc: toMs(o('nhanLuc')),
    nguoiNhap: clean(o('nguoiNhap')),
    daThanhToan: bool(o('daThanhToan')),
    kyDoiSoat: clean(o('kyDoiSoat')),
    /* Base chưa có cột "Sales đã nhận" thì coi như chưa ai nhận — và app cũng
     * không hiện nút nhận (xem coDaNhan trong /api/meta). */
    daNhan: bool(o('daNhan')),
  };
}

/* ================================================================ đọc ==== */
let cache = {};      // { base: …, 'hang-doi': … }
let dangNap = {};

/** Bồi thêm những gì tính được từ chính booking (không lưu trong Base). */
function boiThem(b) {
  const co = H.coCanXuLy(b);
  const tong = b.tongKhach != null ? b.tongKhach : (b.nguoiLon || 0) + (b.treEm || 0);
  return {
    ...b,
    tongKhach: tong || null,
    canXuLy: co,
    canXuLyChuoi: H.chuoiCanXuLy(co),
    muc: H.mucCanXuLy(co),
    dong: cfg.trangThaiDong.includes(b.trangThai),
  };
}

async function napBase(luoc) {
  const raw = await lark.listAll(luoc.tableId);
  return raw.map((r) => boiThem(tuBanGhi(r, luoc)));
}

/**
 * Nạp danh mục rồi đẩy giá thu về vào gia.js.
 *
 * Gọi ở đây, ngay trước mỗi lần đọc booking, để bảng giá của app luôn là bảng giá
 * đang nằm trong Base — sửa giá trong Danh mục Tour là app đổi theo, không phải
 * deploy lại. Danh mục có đệm riêng 10 phút nên việc này gần như không tốn gì.
 */
async function dongBoDanhMuc() {
  try {
    const dm = await danhmuc.get();
    if (dm.tour && dm.tour.length) gia.capNhatTuDanhMuc(dm.tour);
    return dm;
  } catch (_) { return null; }
}

function napHangDoi() {
  return hangdoi.doc().map((b) => boiThem({ ...b, recordId: b.recordId || '' }));
}

/**
 * @param {'auto'|'base'|'hang-doi'} xin nguồn người dùng CHỌN xem.
 *   auto      — Base nếu nối được, không thì hàng đợi (mặc định)
 *   base      — ép đọc Base
 *   hang-doi  — ép xem hàng đợi cục bộ, kể cả khi Base đang tốt. Có lựa chọn này
 *               để soi được booking nào đang kẹt chưa đẩy lên Base.
 */
async function nap(xin = 'auto') {
  const luoc = await schema.doc();
  if (luoc.ok) await dongBoDanhMuc();

  if (xin === 'hang-doi') {
    const rows = napHangDoi();
    return {
      luc: Date.now(), nguon: 'hang-doi', xin, luoc,
      loi: luoc.ok ? '' : luoc.loi,
      epNguon: luoc.ok,          // Base vẫn tốt, đây là lựa chọn của người xem
      rows: sapTheoNhanLuc(rows), chuaDay: hangdoi.demChuaDay(),
    };
  }

  if (!luoc.ok) {
    if (xin === 'base') {
      // Xin Base mà chưa nối được thì nói thẳng, không lặng lẽ trả hàng đợi
      return {
        luc: Date.now(), nguon: 'hang-doi', xin, luoc, loi: luoc.loi,
        rows: sapTheoNhanLuc(napHangDoi()), chuaDay: hangdoi.demChuaDay(),
      };
    }
    return {
      luc: Date.now(), nguon: 'hang-doi', xin, luoc, loi: luoc.loi,
      rows: sapTheoNhanLuc(napHangDoi()), chuaDay: hangdoi.demChuaDay(),
    };
  }

  try {
    const rows = await napBase(luoc);
    return {
      luc: Date.now(), nguon: 'base', xin, luoc, loi: '',
      rows: sapTheoNhanLuc(rows), chuaDay: hangdoi.demChuaDay(),
    };
  } catch (e) {
    /* Base lỗi thì thà xem hàng đợi còn hơn màn hình trắng — nhưng phải nói rõ
     * đang xem nguồn nào, không được im lặng đổi nguồn. */
    return {
      luc: Date.now(), nguon: 'hang-doi', xin, luoc,
      loi: 'Không đọc được Base: ' + e.message,
      rows: sapTheoNhanLuc(napHangDoi()), chuaDay: hangdoi.demChuaDay(),
    };
  }
}

const sapTheoNhanLuc = (rows) => rows.sort((a, b) => (b.nhanLuc || 0) - (a.nhanLuc || 0));

/* Đệm theo TỪNG nguồn: dùng chung một ô đệm thì bấm đổi nguồn xong vẫn ra dữ liệu
 * của nguồn cũ trong suốt TTL, người dùng tưởng nút không ăn. */
async function get({ force = false, nguon = 'auto' } = {}) {
  const khoa = nguon === 'hang-doi' ? 'hang-doi' : 'base';
  if (!force && cache[khoa] && Date.now() - cache[khoa].luc < cfg.cacheTtlMs) return cache[khoa];
  if (dangNap[khoa]) return dangNap[khoa];
  dangNap[khoa] = nap(nguon)
    .then((d) => { cache[khoa] = d; dangNap[khoa] = null; return d; })
    .catch((e) => { dangNap[khoa] = null; throw e; });
  return dangNap[khoa];
}

function invalidate() { cache = {}; dangNap = {}; }

module.exports = {
  get, invalidate, dongBoDanhMuc,
  sangCell, tuBanGhi, boiThem,
  toKey, toMs, keyToBaseDatetime, msToBaseDatetime, todayKey,
  txt, clean, sel, num, bool,
};
