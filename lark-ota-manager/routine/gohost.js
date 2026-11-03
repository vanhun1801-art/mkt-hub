'use strict';
/**
 * Đọc thư GoHost và thư Agoda trong hộp pito@routinehospitality.vn thành sự kiện booking.
 *
 * GoHost là phần mềm quản lý kênh của Pito Hotel (Routine Hospitality). Mọi đơn
 * từ Agoda, Expedia, Airbnb, Booking.com, Trip.com, website, đại lý… đều đi qua
 * nó, và mỗi thay đổi có một thư cùng khuôn "- Nhãn: giá trị". Nên GoHost là nguồn
 * chính, thư riêng của Agoda chỉ dùng để bổ sung quốc gia, số người, yêu cầu đặc biệt
 * và hoa hồng thật (thư GoHost không có).
 *
 * Mọi hàm ở đây thuần: nhận tiêu đề + thân thư đã ra chữ, trả đối tượng. Không gọi
 * mạng, nên test được bằng thư mẫu.
 */

/* Tên nguồn GoHost ghi → tên kênh hiện trong app. Nguồn lạ giữ nguyên chữ GoHost. */
const KENH = {
  agoda: 'Agoda',
  expedia: 'Expedia',
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  'booking.com': 'Booking.com',
  trip: 'Trip.com',
  'trip.com': 'Trip.com',
  ctrip: 'Trip.com',
  website: 'Website',
  'travel agency': 'Đại lý',
  khac: 'Khác',
  'khác': 'Khác',
};
const OTA = new Set(['Agoda', 'Expedia', 'Airbnb', 'Booking.com', 'Trip.com']);

function tenKenh(nguon) {
  const s = String(nguon || '').trim();
  if (!s) return '';
  return KENH[s.toLowerCase()] || s;
}

/** Dòng "- Nhãn: giá trị" → { 'nhãn': 'giá trị' } (nhãn viết thường). */
function cacDong(than) {
  const o = {};
  for (const d of String(than || '').split(/\r?\n/)) {
    const m = /^\s*-\s*([^:]{2,40}):\s*(.*?)\s*$/.exec(d);
    if (m && !(m[1].toLowerCase() in o)) o[m[1].toLowerCase()] = m[2];
  }
  return o;
}

/** "1.187.406 ₫" · "16.552.800 VND" → 1187406 */
function soTien(s) {
  const m = /-?[\d.,]+/.exec(String(s || ''));
  if (!m) return null;
  const n = Number(m[0].replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** "22/12/2026" → "2026-12-22" */
function ngay(s) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || ''));
  return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : '';
}

/** "22/12/2026 - 23/12/2026 (1 đêm)" → { nhanPhong, traPhong, soDem } */
function khoangNgay(s) {
  const m = /(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})(?:\s*\((\d+)\s*đêm\))?/.exec(String(s || ''));
  if (!m) return {};
  const nhanPhong = ngay(m[1]), traPhong = ngay(m[2]);
  const soDem = m[3] ? Number(m[3]) : Math.round((Date.parse(traPhong) - Date.parse(nhanPhong)) / 864e5);
  return { nhanPhong, traPhong, soDem };
}

const MA_GOHOST = /\bPIO[A-Z0-9]{5,8}\b/;

/* Bảng "Trước sửa đổi / Sau sửa đổi" của thư "Đơn OTA có sửa đổi": mỗi nhãn một
 * dòng, rồi giá trị trước, rồi giá trị sau. Ghi chú OTA nhiều dòng nên đọc riêng. */
const NHAN_SUA = ['Tên khách', 'Nguồn', 'Thời gian', 'Loại phòng', 'Số khách', 'Số tiền'];
function bangSua(than) {
  const dong = String(than || '').split(/\r?\n/).map((d) => d.trim()).filter(Boolean);
  const o = {};
  for (const nhan of NHAN_SUA) {
    const i = dong.indexOf(nhan);
    if (i >= 0 && i + 2 < dong.length) o[nhan] = { truoc: dong[i + 1], sau: dong[i + 2] };
  }
  const g = String(than || '').split(/\r?\n\s*Ghi chú OTA\s*\r?\n/)[1];
  if (g) {
    const khoi = g.split(/\r?\n\s*\r?\n\s*Hệ thống đã tự động/)[0];
    /* Ghi chú trước và sau nối liền, nhận ra chỗ tách vì dòng đầu lặp lại. */
    const ds = khoi.split(/\r?\n/).map((d) => d.trim()).filter(Boolean);
    const lap = ds.indexOf(ds[0], 1);
    o['Ghi chú OTA'] = { sau: (lap > 0 ? ds.slice(lap) : ds).join('\n') };
  }
  return o;
}

/** Hoa hồng ghi trong ghi chú OTA của Booking.com: "OTA Commission: 1829520". */
function hoaHongTrongGhiChu(s) {
  const m = /OTA Commission:\s*([\d.,]+)/i.exec(String(s || ''));
  return m ? soTien(m[1]) : null;
}

/**
 * Một thư GoHost → một sự kiện, hoặc null nếu thư không nói về đơn (hoá đơn,
 * nạp tiền, mời tài khoản, đổi trạng thái phòng…).
 *
 * loai: moi · huy · sua · nhan-phong · tra-phong · thanh-toan · doi-phong
 */
function docGoHost(tieuDe, than) {
  const td = String(tieuDe || '');
  const d = cacDong(than);
  const kenh = tenKenh(d['nguồn đặt phòng'] || d['nguồn']);
  const maGoHost = (MA_GOHOST.exec(d['mã đặt phòng'] || '') || MA_GOHOST.exec(td) || [])[0] || '';
  const maOta = (d['mã ota'] || '').trim();
  const chung = { maGoHost, maOta, kenh, tenKhach: (d['tên khách'] || d['khách'] || '').trim() };

  if (/đơn đặt phòng mới/i.test(td)) {
    return { loai: 'moi', ...chung, ...khoangNgay(d['thời gian']),
      loaiPhong: d['loại phòng'] || '', soTien: soTien(d['số tiền']) };
  }
  if (/hủy đặt phòng|huỷ đặt phòng/i.test(td)) {
    return { loai: 'huy', ...chung, nhanPhong: ngay(d['ngày đến dự kiến']), loaiPhong: d['loại phòng'] || '' };
  }
  if (/đã nhận phòng/i.test(td)) {
    return { loai: 'nhan-phong', ...chung, ngayNhan: ngay(d['ngày nhận phòng']),
      loaiPhong: d['loại phòng'] || '', soTien: soTien(d['số tiền']) };
  }
  if (/đã trả phòng/i.test(td)) {
    return { loai: 'tra-phong', ...chung, ngayTra: ngay(d['ngày trả phòng']),
      loaiPhong: d['loại phòng'] || '', soTien: soTien(d['số tiền']) };
  }
  if (/đã thêm thanh toán/i.test(td)) {
    return { loai: 'thanh-toan', ...chung, ngayDat: ngay(d['ngày đặt phòng']),
      daTra: soTien(d['số tiền']), conLai: soTien(d['số tiền còn lại']),
      phuongThuc: d['phương thức thanh toán'] || '' };
  }
  if (/đã đổi phòng/i.test(td)) {
    return { loai: 'doi-phong', ...chung, ngayDat: ngay(d['ngày đặt phòng']),
      phongCu: d['phòng cũ'] || '', loaiPhong: d['phòng mới'] || '' };
  }
  const sua = /Đơn OTA có sửa đổi:\s*(\S+)\s*-\s*([^-]+?)\s*-\s*(.+)$/i.exec(td);
  if (sua) {
    const b = bangSua(than);
    const sau = (k) => (b[k] ? b[k].sau : '');
    const ghiChu = sau('Ghi chú OTA');
    return { loai: 'sua', maGoHost: '', maOta: sua[1], kenh: tenKenh(sau('Nguồn') || sua[2]),
      tenKhach: sau('Tên khách') || sua[3].trim(), ...khoangNgay(sau('Thời gian')),
      loaiPhong: sau('Loại phòng'), soKhach: Number(sau('Số khách')) || null,
      soTien: soTien(sau('Số tiền')), ghiChuOta: ghiChu, hoaHong: hoaHongTrongGhiChu(ghiChu) };
  }
  return null;
}

/* ---------------- thư riêng của Agoda (bổ sung) ---------------- */

/** "22-Dec-2026 (22-12-2026)" · "December 22, 2026" → "2026-12-22" */
function ngayAgoda(s) {
  const m = /\((\d{1,2})-(\d{1,2})-(\d{4})\)/.exec(String(s || ''));
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  const t = Date.parse(String(s || '') + ' UTC');
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
}

/** Giá trị nằm ở dòng có chữ sau nhãn song ngữ ("Check-in\nNhận phòng\n\n22-Dec-2026…"). */
function sauNhan(dong, nhan, buoc = 1) {
  const i = dong.findIndex((d) => d === nhan);
  if (i < 0) return '';
  let j = i + buoc;
  while (j < dong.length && !dong[j]) j++;
  return dong[j] || '';
}

/** Số tiền nằm hai dòng sau nhãn: "- Commission\nTiền hoa hồng\n\nVND\n-359,820.00" */
function tienSauNhan(dong, nhan) {
  const i = dong.findIndex((d) => d === nhan);
  if (i < 0) return null;
  for (let j = i + 1; j < Math.min(dong.length, i + 6); j++) {
    if (/^-?[\d,]+\.\d{2}$/.test(dong[j])) return Math.abs(Number(dong[j].replace(/,/g, '')));
  }
  return null;
}

/**
 * Thư "Agoda Booking ID … - CONFIRMED|CANCELLED" → thông tin bổ sung cho cùng mã OTA.
 * Thư khác của Agoda (tin nhắn, đánh giá, khuyến mãi) → null.
 */
function docAgoda(tieuDe, than) {
  const m = /Agoda Booking ID (\d+)\s*-\s*(CONFIRMED|CANCELLED|AMENDED)/i.exec(String(tieuDe || ''));
  if (!m) return null;
  const s = String(than || '');
  const dong = s.split(/\r?\n/).map((d) => d.trim());
  const o = { maOta: m[1], kenh: 'Agoda', trangThaiAgoda: m[2].toUpperCase() };
  if (o.trangThaiAgoda === 'CANCELLED') {
    const k = (nhan) => ((new RegExp('^' + nhan + '\\s*:\\s*(.+)$', 'm').exec(s) || [])[1] || '').trim();
    o.nguoiLon = Number(k('Số Người Lớn')) || null;
    o.treEm = Number(k('Số Trẻ Em')) || 0;
    o.phiHuy = soTien(k('Lệ Phí Hủy Đặt Phòng')) || 0;
    return o;
  }
  o.tenKhach = [sauNhan(dong, 'Tên Khách Hàng'), sauNhan(dong, 'Họ Khách Hàng')].filter(Boolean).join(' ');
  o.quocGia = sauNhan(dong, 'Quốc gia cư trú');
  o.nhanPhong = ngayAgoda(sauNhan(dong, 'Nhận phòng'));
  o.traPhong = ngayAgoda(sauNhan(dong, 'Trả phòng'));
  const nguoi = /(\d+)\s*Adults?(?:\s*,?\s*(\d+)\s*Child)?/i.exec(s);
  if (nguoi) { o.nguoiLon = Number(nguoi[1]); o.treEm = Number(nguoi[2] || 0); }
  const yc = s.split(/khi khách hàng nhận phòng\.\s*\r?\n\s*\)\s*/)[1];
  if (yc) o.yeuCau = yc.split(/\r?\n\s*\r?\n/)[0].trim();
  o.giaBan = tienSauNhan(dong, 'Reference sell rate (incl. taxes & fees)');
  o.hoaHong = tienSauNhan(dong, '- Commission');
  return o;
}

module.exports = { docGoHost, docAgoda, tenKenh, soTien, ngay, khoangNgay, cacDong, OTA };
