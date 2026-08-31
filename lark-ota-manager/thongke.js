'use strict';
/**
 * Tính chỉ số cho hai màn hình. Mọi con số đều cộng lại từ danh sách booking —
 * không dựa vào cột formula/rollup của Base, để lọc được theo bất kỳ khoảng ngày
 * nào (formula trong Base chỉ tính cả kỳ hoặc "hôm nay").
 *
 * DOANH THU CHỈ TÍNH BOOKING CÒN SỐNG (Chờ xác nhận + Đã xác nhận + Đã hoàn
 * thành). Booking huỷ / no-show đếm riêng — cộng chúng vào doanh thu là tự báo
 * cáo sai.
 *
 * TIỀN LẤY TỪ CÔNG THỨC CỦA BASE, app chỉ CỘNG chứ không tính lại:
 * store.js đã đọc "Gross VND" / "Hoa hồng VND" / "Doanh thu thu về" vào từng
 * dòng. Nhờ đó cộng theo khoảng ngày nào cũng được mà vẫn khớp con số Base hiện.
 */
const cfg = require('./config');
const H = require('./chuanhoa');

/* Booking "còn sống" = chưa bị đóng. Suy từ config để thêm/bớt option trong Base
 * chỉ phải sửa một chỗ. */
const SONG = new Set(cfg.trangThai.filter((t) => !cfg.trangThaiDong.includes(t)));

/* --------------------------------------------------------------- bộ lọc -- */

/** Mốc thời gian để lọc: ngày đi (mặc định — vận hành quan tâm ngày chạy tour). */
const MOC = { ngayDi: 'ngayDi', ngayDat: 'ngayDat', nhanLuc: 'nhanLuc' };

function ngayCua(b, moc) {
  if (moc === 'nhanLuc') {
    return b.nhanLuc
      ? new Date(b.nhanLuc + cfg.tzOffsetHours * 3600000).toISOString().slice(0, 10)
      : '';
  }
  return b[moc] || '';
}

/**
 * @param {object[]} rows booking đã bồi (store.boiThem)
 * @param {object} q { from, to, moc, kenh:[], trangThai:[], canXuLy:'cao'|'', tim }
 */
function loc(rows, q = {}) {
  const moc = MOC[q.moc] || 'ngayDi';
  const from = q.from || '';
  const to = q.to || '';
  const kenh = (q.kenh || []).filter(Boolean);
  const tt = (q.trangThai || []).filter(Boolean);
  const tim = String(q.tim || '').trim().toLowerCase();

  return rows.filter((b) => {
    const d = ngayCua(b, moc);
    /* Booking chưa có ngày đi KHÔNG bị bộ lọc ngày loại bỏ — nó chính là loại
     * booking cần xử lý nhất, lọc mất là không ai thấy để đi hỏi OTA. */
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
    if (kenh.length && !kenh.includes(b.kenhId) && !kenh.includes(b.kenh)) return false;
    if (tt.length && !tt.includes(b.trangThai)) return false;
    if (q.canXuLy === 'cao' && b.muc !== 'cao') return false;
    if (q.canXuLy === 'du' && b.muc !== 'ok') return false;
    if (q.chuaNhan && b.daNhan) return false;
    if (tim) {
      const kho = [b.maBooking, b.tenKhach, b.sdt, b.email, b.tour, b.diemDon, b.kenh]
        .join(' ').toLowerCase();
      if (!kho.includes(tim)) return false;
    }
    return true;
  });
}

/* ----------------------------------------------------------- sắp xếp ----
 * Màn vận hành phải đọc được từ trên xuống là biết hôm nay làm gì, nên MẶC ĐỊNH
 * sắp theo NGÀY ĐI gần nhất trước — không phải theo giờ booking về hệ thống.
 * Sắp theo giờ về chỉ đúng cho câu hỏi "vừa có booking nào mới", nên nó là một
 * lựa chọn riêng chứ không phải mặc định.
 */
const KIEU_SAP = ['ngayDi', 'nhanLuc'];

function sapXep(rows, kieu = 'ngayDi') {
  const ds = rows.slice();
  if (kieu === 'nhanLuc') return ds.sort((a, b) => (b.nhanLuc || 0) - (a.nhanLuc || 0));

  const nay = H.homNay();
  /* Ba khối, theo đúng thứ tự việc phải làm:
   *   0. chưa có ngày đi — chính là booking phải hỏi OTA ngay, không được để lọt cuối
   *   1. ngày đi từ hôm nay trở đi — gần nhất trước (hôm nay, mai, mốt…)
   *   2. đã qua ngày đi — tour chạy rồi, đẩy xuống cuối; mới qua nhất trước
   */
  const khoi = (b) => (!b.ngayDi ? 0 : b.ngayDi >= nay ? 1 : 2);

  return ds.sort((a, b) => {
    const ka = khoi(a), kb = khoi(b);
    if (ka !== kb) return ka - kb;
    if (ka === 0) return (b.nhanLuc || 0) - (a.nhanLuc || 0);
    if (ka === 2) return b.ngayDi.localeCompare(a.ngayDi);
    // cùng một ngày thì sắp theo GIỜ ĐÓN — đúng thứ tự xe chạy trong ngày
    return a.ngayDi.localeCompare(b.ngayDi) ||
      (a.gioDon || '99:99').localeCompare(b.gioDon || '99:99') ||
      (b.nhanLuc || 0) - (a.nhanLuc || 0);
  });
}

/* ------------------------------------------------------------ cộng dồn --- */
const so = (v) => (v == null ? 0 : Number(v) || 0);

const laVnd = (b) => !b.tienTe || b.tienTe === 'VND';

function gop(rows) {
  const song = rows.filter((b) => SONG.has(b.trangThai));
  const huy = rows.filter((b) => b.trangThai === 'Đã huỷ');
  const hoan = rows.filter((b) => b.trangThai === 'No-show');

  const ngoai = song.filter((b) => !laVnd(b));
  /* Base đã quy Gross về VNĐ bằng cột "Tỷ giá về VND", nên tổng tiền và hoa hồng
   * cộng được CẢ booking ngoại tệ — miễn là dòng đó có tỷ giá. Dòng thiếu tỷ giá
   * thì Gross VND = số nguyên tệ, cộng vào là sai; nên vẫn loại ra và đếm riêng
   * để tab Thống kê nói được "còn N booking chưa điền tỷ giá". */
  const coQuyDoi = (b) => laVnd(b) || (b.tyGia != null && b.tyGia > 0);
  const dungTien = song.filter(coQuyDoi);
  const tongTien = dungTien.reduce((s, b) => s + so(b.tongTien), 0);
  const hoaHong = dungTien.reduce((s, b) => s + so(b.hoaHong), 0);
  const thucNhan = song.reduce((s, b) => s + so(b.thucNhan), 0);
  // số khách không phụ thuộc tiền tệ nên đếm cả booking ngoại tệ
  const khach = song.reduce((s, b) => s + so(b.tongKhach), 0);

  return {
    booking: rows.length,
    bookingSong: song.length,
    huy: huy.length,
    noShow: hoan.length,
    hoanTien: hoan.length,     // giữ tên cũ cho phần giao diện đang đọc khoá này
    tienHoan: hoan.filter(laVnd).reduce((s, b) => s + so(b.tongTien), 0),
    /* Booking ngoại tệ chưa ai điền tỷ giá — số tiền của chúng KHÔNG nằm trong
     * tongTien/hoaHong ở trên, phải nói ra chứ không lặng lẽ bỏ. */
    thieuTyGia: song.filter((b) => !coQuyDoi(b)).length,
    khach,
    nguoiLon: song.reduce((s, b) => s + so(b.nguoiLon), 0),
    treEm: song.reduce((s, b) => s + so(b.treEm), 0),
    tongTien, hoaHong, thucNhan,
    // số booking đứng sau các ô tiền ở trên (khác bookingSong khi có ngoại tệ)
    bookingVnd: dungTien.length,
    ngoaiTe: ngoai.length,
    dsNgoaiTe: [...new Set(ngoai.map((b) => b.tienTe))].sort(),
    tbBooking: dungTien.length ? Math.round(tongTien / dungTien.length) : 0,
    tbKhach: khach ? Math.round(tongTien / khach) : 0,
    tyLeHoaHong: tongTien > 0 ? Math.round((hoaHong / tongTien) * 1000) / 10 : 0,
    tyLeHuy: rows.length ? Math.round(((huy.length + hoan.length) / rows.length) * 1000) / 10 : 0,
    hoaHongUocTinh: song.filter((b) => b.nguonThucNhan === 'uoc-tinh').length,
    /* Sức khoẻ của bảng giá — hai con số này nói doanh thu ở trên đáng tin đến đâu. */
    theoBangGia: song.filter((b) => b.nguonThucNhan === 'bang-gia').length,
    chuaMapSanPham: song.filter((b) => b.tour && !b.sanPham).length,
    khongCoDoanhThu: song.filter((b) => b.thucNhan == null).length,
    lechBangGia: song.filter((b) => b.lechBangGia).length,
    tienLech: song.reduce((s, b) => s + so(b.lechBangGia), 0),
  };
}

/* ---------------------------------------------------- màn hình Booking mới */

/**
 * Ba thẻ đầu màn hình vận hành trả lời đúng ba câu: hôm nay chạy gì, cái nào
 * phải gọi khách, cái nào chưa ai nhận.
 */
function vanHanh(rows, { coDaNhan = true } = {}) {
  const nay = H.homNay();
  const mai = new Date(Date.parse(nay + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const sau7 = new Date(Date.parse(nay + 'T00:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
  const song = rows.filter((b) => SONG.has(b.trangThai));

  const homNay = song.filter((b) => b.ngayDi === nay);
  const ngayMai = song.filter((b) => b.ngayDi === mai);
  const tuanNay = song.filter((b) => b.ngayDi && b.ngayDi >= nay && b.ngayDi <= sau7);
  const canGoi = song.filter((b) => b.muc === 'cao');
  /* Bảng Bookings chưa có cột "Sales đã nhận" thì MỌI booking đều trông như chưa
   * ai nhận — một thẻ số lúc nào cũng đỏ mà không ai làm gì được. Thà không hiện
   * thẻ đó còn hơn hiện một con số vô nghĩa. */
  const chuaNhan = coDaNhan ? song.filter((b) => !b.daNhan && b.ngayDi && b.ngayDi >= nay) : [];
  const moiVe = rows.filter((b) => b.nhanLuc && Date.now() - b.nhanLuc < 24 * 3600000);

  /* Nhóm đứng sau mỗi thẻ số cũng sắp theo ngày đi, trừ "Booking về 24h qua" —
   * thẻ đó hỏi "vừa có gì mới", nên đúng của nó là sắp theo giờ về. */
  const nhom = {
    'hom-nay': sapXep(homNay),
    'ngay-mai': sapXep(ngayMai),
    '7-ngay': sapXep(tuanNay),
    'can-goi': sapXep(canGoi),
    'chua-nhan': sapXep(chuaNhan),
    'moi-ve': sapXep(moiVe, 'nhanLuc'),
  };

  const the = [
    { nhan: 'Tour hôm nay', so: homNay.length, khoa: 'hom-nay',
      ghi: homNay.reduce((s, b) => s + so(b.tongKhach), 0) + ' khách' },
    { nhan: 'Tour ngày mai', so: ngayMai.length, khoa: 'ngay-mai',
      ghi: ngayMai.reduce((s, b) => s + so(b.tongKhach), 0) + ' khách' },
    { nhan: '7 ngày tới', so: tuanNay.length, khoa: '7-ngay' },
    { nhan: 'Cần liên hệ khách', so: canGoi.length, khoa: 'can-goi',
      muc: canGoi.length ? 'cao' : 'ok',
      ghi: canGoi.length ? 'thiếu SĐT / điểm đón / chưa xác nhận' : 'không có booking nào thiếu' },
    ...(coDaNhan ? [{ nhan: 'Chưa ai nhận', so: chuaNhan.length, khoa: 'chua-nhan',
      muc: chuaNhan.length ? 'vua' : 'ok' }] : []),
    { nhan: 'Booking về 24h qua', so: moiVe.length, khoa: 'moi-ve' },
  ];

  return { the, nhom };
}

/* ----------------------------------------------------- màn hình Thống kê -- */

function theoKenh(rows) {
  const map = new Map();
  cfg.kenh.forEach((k) => map.set(k.ten, []));
  rows.forEach((b) => {
    const k = b.kenh || '(chưa gán)';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(b);
  });
  return [...map].map(([kenh, ds]) => {
    const c = cfg.kenh.find((k) => k.ten === kenh);
    return { kenh, kenhId: c ? c.id : '', hoaHongCauHinh: c ? c.hoaHong : null, ...gop(ds) };
  }).sort((a, b) => b.thucNhan - a.thucNhan || b.booking - a.booking);
}

function theoNgay(rows, moc) {
  const map = new Map();
  rows.forEach((b) => {
    const d = ngayCua(b, MOC[moc] || 'ngayDi');
    if (!d) return;
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(b);
  });
  return [...map].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ngay, ds]) => ({ ngay, ...gop(ds) }));
}

/**
 * Gộp theo SẢN PHẨM trong bảng giá nếu map được, không thì theo tên tour thô.
 * Gộp theo tên tour thô thì cùng một tour bán trên 7 kênh ra 7 dòng khác nhau —
 * không so được sản phẩm nào bán tốt.
 */
function theoTour(rows, gioiHan = 15) {
  const map = new Map();
  rows.forEach((b) => {
    const t = b.sanPham || b.tour || '(chưa có tên tour)';
    if (!map.has(t)) map.set(t, []);
    map.get(t).push(b);
  });
  return [...map].map(([tour, ds]) => ({ tour, ...gop(ds) }))
    .sort((a, b) => b.thucNhan - a.thucNhan || b.booking - a.booking)
    .slice(0, gioiHan);
}

/** Cờ cần xử lý gom theo loại — biết ngay đang thiếu thứ gì nhiều nhất. */
function theoCanXuLy(rows) {
  const map = new Map();
  rows.filter((b) => !b.dong).forEach((b) => {
    b.canXuLy.filter((c) => c.muc !== 'ok').forEach((c) => {
      // gộp "Còn 2 ngày, chưa xác nhận" và "Còn 1 ngày…" về một nhóm
      const nhan = c.nhan.replace(/Còn \d+ ngày, /, 'Sát ngày, ');
      map.set(nhan, (map.get(nhan) || 0) + 1);
    });
  });
  return [...map].map(([nhan, so]) => ({ nhan, so })).sort((a, b) => b.so - a.so);
}

function thongKe(rows, q = {}) {
  const ds = loc(rows, q);
  return {
    tong: gop(ds),
    kenh: theoKenh(ds),
    ngay: theoNgay(ds, q.moc),
    tour: theoTour(ds),
    canXuLy: theoCanXuLy(ds),
    moc: MOC[q.moc] || 'ngayDi',
    soDong: ds.length,
  };
}

module.exports = {
  loc, sapXep, gop, vanHanh, thongKe,
  theoKenh, theoNgay, theoTour, theoCanXuLy,
  MOC, KIEU_SAP, SONG,
};
