'use strict';
/**
 * Lọc, cảnh báo chăm sóc và thống kê cho booking khách sạn Routine Hospitality.
 * THUẦN TÍNH TOÁN: nhận mảng booking (dạng routine/api.js đọc từ Base), không gọi
 * mạng. Mọi ngày là chuỗi "YYYY-MM-DD" theo giờ Việt Nam.
 */

const KENH = ['Agoda', 'Booking.com', 'Expedia', 'Airbnb', 'Trip.com', 'Website', 'Đại lý', 'Khác'];
const TRANG_THAI = ['Đã đặt', 'Đã nhận phòng', 'Đã trả phòng', 'Đã huỷ'];
const CHAM_SOC = ['Chưa liên hệ', 'Đã nhắn chào', 'Đã xác nhận giờ đến', 'Đã hỏi thăm khi ở', 'Đã xin đánh giá', 'Có vấn đề'];

const homNayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const cong = (ngay, n) => new Date(Date.parse(ngay + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const cachNgay = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const song = (b) => b.trangThai !== 'Đã huỷ';
const chuaLienHe = (b) => !b.chamSoc || b.chamSoc === 'Chưa liên hệ';

/** Ngày dùng để lọc theo `truong`: nhanPhong | ngayDat | traPhong. */
const ngayTheo = (b, truong) => String((truong === 'ngayDat' ? b.ngayDat : truong === 'traPhong' ? b.traPhong : b.nhanPhong) || '').slice(0, 10);

/**
 * q: { from, to, truong, kenh: [], trangThai: [], chamSoc: [], tim }
 * Có from/to thì đơn không có ngày theo trường đó bị loại (không đoán).
 */
function loc(rows, q = {}) {
  const tim = String(q.tim || '').trim().toLowerCase();
  return rows.filter((b) => {
    const n = ngayTheo(b, q.truong);
    if (q.from && (!n || n < q.from)) return false;
    if (q.to && (!n || n > q.to)) return false;
    if (q.kenh && q.kenh.length && !q.kenh.includes(b.kenh || 'Khác')) return false;
    if (q.trangThai && q.trangThai.length && !q.trangThai.includes(b.trangThai)) return false;
    if (q.chamSoc && q.chamSoc.length && !q.chamSoc.includes(b.chamSoc || 'Chưa liên hệ')) return false;
    if (tim && ![b.ma, b.maOta, b.tenKhach, b.phong, b.quocGia, b.ghiChuChamSoc]
      .some((x) => String(x || '').toLowerCase().includes(tim))) return false;
    return true;
  });
}

/**
 * Việc cần làm với một đơn. muc: cao (làm ngay) · vua (nên làm) · ok.
 * Chỉ nói điều app biết chắc từ thư và cột chăm sóc, không đoán.
 */
function canXuLy(b, nay = homNayVN()) {
  const ra = [];
  const mai = cong(nay, 1), sau3 = cong(nay, 3);
  if (b.trangThai === 'Đã huỷ') return [{ muc: 'ok', nhan: 'Đã huỷ' }];
  if (b.chamSoc === 'Có vấn đề') ra.push({ muc: 'cao', nhan: 'Khách đang có vấn đề' });
  if (b.trangThai === 'Đã đặt' && b.nhanPhong) {
    if (b.nhanPhong < nay) ra.push({ muc: 'cao', nhan: 'Quá ngày nhận phòng, chưa báo nhận' });
    else if (chuaLienHe(b) && b.nhanPhong <= mai) ra.push({ muc: 'cao', nhan: b.nhanPhong === nay ? 'Nhận phòng hôm nay, chưa liên hệ' : 'Nhận phòng ngày mai, chưa liên hệ' });
    else if (chuaLienHe(b) && b.nhanPhong <= sau3) ra.push({ muc: 'vua', nhan: 'Sắp nhận phòng, chưa liên hệ' });
    else if (chuaLienHe(b)) ra.push({ muc: 'vua', nhan: 'Chưa nhắn chào khách' });
  }
  if (b.trangThai === 'Đã nhận phòng' && b.traPhong && b.traPhong < nay) ra.push({ muc: 'vua', nhan: 'Quá ngày trả phòng, chưa báo trả' });
  if (b.trangThai === 'Đã trả phòng' && b.chamSoc !== 'Đã xin đánh giá' && b.traPhong && cachNgay(b.traPhong, nay) <= 7) {
    ra.push({ muc: 'vua', nhan: 'Chưa xin đánh giá' });
  }
  if (!b.traPhong && b.trangThai !== 'Đã trả phòng') ra.push({ muc: 'vua', nhan: 'Thiếu ngày trả phòng' });
  if (b.daSua && b.capNhat && cachNgay(b.capNhat.slice(0, 10), nay) <= 2) ra.push({ muc: 'vua', nhan: 'OTA vừa sửa đơn' });
  return ra.length ? ra : [{ muc: 'ok', nhan: 'Ổn' }];
}

const mucCao = (ds) => (ds.some((c) => c.muc === 'cao') ? 'cao' : ds.some((c) => c.muc === 'vua') ? 'vua' : 'ok');

/** Gắn canXuLy + muc cho từng đơn. */
function danhDau(rows, nay = homNayVN()) {
  return rows.map((b) => { const c = canXuLy(b, nay); return { ...b, canXuLy: c, muc: mucCao(c) }; });
}

/** Thẻ việc cần làm ở màn Vận hành, tính trên MỌI đơn (không theo bộ lọc). */
function vanHanh(rows, nay = homNayVN()) {
  const mai = cong(nay, 1), sau7 = cong(nay, 7);
  const s = rows.filter(song);
  const homNay = s.filter((b) => b.nhanPhong === nay && b.trangThai === 'Đã đặt');
  const ngayMai = s.filter((b) => b.nhanPhong === mai);
  const tuan = s.filter((b) => b.trangThai === 'Đã đặt' && b.nhanPhong && b.nhanPhong >= nay && b.nhanPhong <= sau7);
  const dangO = s.filter((b) => b.trangThai === 'Đã nhận phòng');
  const can = rows.filter((b) => b.muc === 'cao');
  const chuaChao = s.filter((b) => b.trangThai === 'Đã đặt' && chuaLienHe(b) && b.nhanPhong && b.nhanPhong >= nay);
  const moi = rows.filter((b) => b.ngayDat && b.ngayDat.length > 10 && cachNgay(b.ngayDat.slice(0, 10), nay) <= 1);
  const theoNhan = (ds) => ds.slice().sort((a, b) => ((a.nhanPhong || '9') < (b.nhanPhong || '9') ? -1 : 1));
  const khach = (ds) => ds.reduce((t, b) => t + (b.soKhach || 0), 0);
  const nhom = {
    'hom-nay': theoNhan(homNay), 'ngay-mai': theoNhan(ngayMai), '7-ngay': theoNhan(tuan),
    'dang-o': theoNhan(dangO), 'can-lam': theoNhan(can), 'chua-chao': theoNhan(chuaChao),
    'moi-ve': moi.slice().sort((a, b) => (a.ngayDat < b.ngayDat ? 1 : -1)),
  };
  const the = [
    { nhan: 'Nhận phòng hôm nay', so: homNay.length, khoa: 'hom-nay', ghi: khach(homNay) ? khach(homNay) + ' khách' : '' },
    { nhan: 'Nhận phòng ngày mai', so: ngayMai.length, khoa: 'ngay-mai' },
    { nhan: '7 ngày tới', so: tuan.length, khoa: '7-ngay' },
    { nhan: 'Đang ở', so: dangO.length, khoa: 'dang-o' },
    { nhan: 'Cần làm ngay', so: can.length, khoa: 'can-lam', muc: can.length ? 'cao' : 'ok' },
    { nhan: 'Chưa nhắn chào', so: chuaChao.length, khoa: 'chua-chao', muc: chuaChao.length ? 'vua' : 'ok' },
    { nhan: 'Đơn mới 24h qua', so: moi.length, khoa: 'moi-ve' },
  ];
  return { the, nhom };
}

/* ---------------- thống kê ---------------- */

const NHOM_DAT_TRUOC = [
  { ten: 'Cùng ngày', tu: 0, den: 0 }, { ten: '1-3 ngày', tu: 1, den: 3 }, { ten: '4-7 ngày', tu: 4, den: 7 },
  { ten: '8-14 ngày', tu: 8, den: 14 }, { ten: '15-30 ngày', tu: 15, den: 30 }, { ten: 'Trên 30 ngày', tu: 31, den: Infinity },
];
const NHOM_LUU_TRU = [
  { ten: '1 đêm', tu: 1, den: 1 }, { ten: '2 đêm', tu: 2, den: 2 }, { ten: '3-4 đêm', tu: 3, den: 4 },
  { ten: '5-7 đêm', tu: 5, den: 7 }, { ten: 'Trên 7 đêm', tu: 8, den: Infinity },
];

const datTruoc = (b) => (b.ngayDat && b.nhanPhong ? cachNgay(b.ngayDat.slice(0, 10), b.nhanPhong) : null);
const tb = (ds) => (ds.length ? Math.round((ds.reduce((t, x) => t + x, 0) / ds.length) * 10) / 10 : null);

function gop(ds) {
  const s = ds.filter(song);
  const coDem = s.filter((b) => b.soDem > 0);
  const tienCoDem = coDem.reduce((t, b) => t + (b.soTien || 0), 0);
  const dem = coDem.reduce((t, b) => t + b.soDem, 0);
  const lead = s.map(datTruoc).filter((x) => x != null && x >= 0);
  return {
    don: s.length,
    huy: ds.length - s.length,
    tyLeHuy: ds.length ? Math.round(((ds.length - s.length) / ds.length) * 1000) / 10 : 0,
    dem,
    thieuDem: s.length - coDem.length,
    khach: s.reduce((t, b) => t + (b.soKhach || 0), 0),
    tien: s.reduce((t, b) => t + (b.soTien || 0), 0),
    hoaHong: s.reduce((t, b) => t + (b.hoaHong || 0), 0),
    /* Giá trung bình một đêm: chỉ tính đơn biết số đêm, không chia cho 0 đêm. */
    giaDem: dem ? Math.round(tienCoDem / dem) : null,
    datTruocTb: tb(lead),
    datTruocCo: lead.length,
    luuTruTb: tb(coDem.map((b) => b.soDem)),
  };
}

function demNhom(gt, nhom) {
  return nhom.map((n) => ({ ten: n.ten, so: gt.filter((x) => x >= n.tu && x <= n.den).length }));
}

/** Thống kê trên các đơn ĐÃ LỌC. */
function thongKe(rows) {
  const theoKenh = new Map();
  for (const b of rows) {
    const k = b.kenh || 'Khác';
    if (!theoKenh.has(k)) theoKenh.set(k, []);
    theoKenh.get(k).push(b);
  }
  const theoThang = new Map();
  for (const b of rows.filter(song)) {
    const t = (b.nhanPhong || '').slice(0, 7);
    if (!t) continue;
    if (!theoThang.has(t)) theoThang.set(t, []);
    theoThang.get(t).push(b);
  }
  const s = rows.filter(song);
  return {
    tong: gop(rows),
    theoKenh: [...theoKenh].map(([kenh, ds]) => ({ kenh, ...gop(ds) })).sort((a, b) => b.tien - a.tien || b.don - a.don),
    theoThang: [...theoThang].map(([thang, ds]) => ({ thang, ...gop(ds) })).sort((a, b) => (a.thang < b.thang ? -1 : 1)),
    datTruoc: demNhom(s.map(datTruoc).filter((x) => x != null && x >= 0), NHOM_DAT_TRUOC),
    luuTru: demNhom(s.filter((b) => b.soDem > 0).map((b) => b.soDem), NHOM_LUU_TRU),
    chamSoc: CHAM_SOC.map((c) => ({ ten: c, so: s.filter((b) => (b.chamSoc || 'Chưa liên hệ') === c).length })),
  };
}

module.exports = { KENH, TRANG_THAI, CHAM_SOC, loc, canXuLy, danhDau, vanHanh, thongKe, gop, homNayVN, cong };
