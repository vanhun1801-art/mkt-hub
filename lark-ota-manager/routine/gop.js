'use strict';
/**
 * Gộp các sự kiện của cùng một đơn (mới → sửa → đổi phòng → nhận → trả, hoặc huỷ)
 * thành một dòng booking khách sạn, đúng thứ tự thời gian thư đến.
 *
 * Khoá của đơn là mã GoHost (PIO…). Thư "Đơn OTA có sửa đổi" chỉ có mã OTA nên
 * được nối về mã GoHost qua thư "đơn mới" cùng mã OTA. Thư Agoda nối theo mã OTA.
 */

const TRANG_THAI = {
  moi: 'Đã đặt',
  sua: 'Đã đặt',
  'nhan-phong': 'Đã nhận phòng',
  'tra-phong': 'Đã trả phòng',
  huy: 'Đã huỷ',
};
const TEN_SU_KIEN = {
  moi: 'Đơn mới', sua: 'OTA sửa đơn', huy: 'Huỷ', 'nhan-phong': 'Nhận phòng',
  'tra-phong': 'Trả phòng', 'thanh-toan': 'Thanh toán', 'doi-phong': 'Đổi phòng',
};

const dat = (o, k, v) => { if (v !== undefined && v !== null && v !== '') o[k] = v; };

/**
 * @param {Array<{luc: string, su: object}>} thu  luc = "2026-11-02 21:11" (giờ VN),
 *   su = kết quả docGoHost / docAgoda (có thêm `nguon: 'gohost'|'agoda'`).
 * @returns {object[]} booking, mới nhất trước.
 */
function gop(thu) {
  const ds = thu.filter((t) => t && t.su).slice().sort((a, b) => (a.luc < b.luc ? -1 : a.luc > b.luc ? 1 : 0));
  const theoMa = new Map();      // mã GoHost → booking
  const otaVeMa = new Map();     // mã OTA → mã GoHost
  const choOta = [];             // sự kiện chưa nối được về mã GoHost

  const lay = (ma) => {
    if (!theoMa.has(ma)) theoMa.set(ma, { maGoHost: ma, suKien: [] });
    return theoMa.get(ma);
  };

  for (const { luc, su } of ds) {
    if (su.nguon === 'agoda') { choOta.push({ luc, su }); continue; }
    if (su.maGoHost && su.maOta) otaVeMa.set(su.maOta, su.maGoHost);
    const ma = su.maGoHost || otaVeMa.get(su.maOta);
    if (!ma) { choOta.push({ luc, su }); continue; }
    apDung(lay(ma), luc, su);
  }

  /* Thư sửa/Agoda đến trước thư "đơn mới" của GoHost (hoặc đơn từ trước ngày nối
   * GoHost) vẫn được giữ: nối lại lần nữa, không được thì thành dòng theo mã OTA. */
  for (const { luc, su } of choOta) {
    const ma = otaVeMa.get(su.maOta);
    if (su.nguon === 'agoda') {
      const b = ma ? theoMa.get(ma) : (theoMa.get('OTA-' + su.maOta) || theoTen(theoMa, su));
      if (b) boSungAgoda(b, luc, su);
      else boSungAgoda(lay('OTA-' + su.maOta), luc, su, true);
      continue;
    }
    apDung(lay(ma || 'OTA-' + su.maOta), luc, su);
  }

  for (const b of theoMa.values()) {
    /* Mỗi phòng một thư nhận/trả phòng: bỏ dòng trùng, rồi xếp theo giờ. */
    b.suKien = [...new Set(b.suKien)].sort((x, y) => (x.slice(0, 16) < y.slice(0, 16) ? -1 : x.slice(0, 16) > y.slice(0, 16) ? 1 : 0));
    if (!b.trangThai) b.trangThai = 'Đã đặt';
  }
  return [...theoMa.values()].sort((a, b) => (a.ngayDat || a.capNhat || '') < (b.ngayDat || b.capNhat || '') ? 1 : -1);
}

function apDung(b, luc, su) {
  b.suKien.push(luc + ' · ' + TEN_SU_KIEN[su.loai] + (su.loai === 'doi-phong' ? ' ' + su.phongCu + ' → ' + su.loaiPhong : ''));
  b.capNhat = luc;
  dat(b, 'maOta', su.maOta);
  dat(b, 'kenh', su.kenh);
  dat(b, 'tenKhach', su.tenKhach);
  if (su.loai === 'moi' && !b.ngayDat) b.ngayDat = luc;
  if (su.ngayDat && !b.ngayDat) b.ngayDat = su.ngayDat;
  if (su.loai === 'moi' || su.loai === 'sua') {
    dat(b, 'nhanPhong', su.nhanPhong);
    dat(b, 'traPhong', su.traPhong);
    dat(b, 'soDem', su.soDem);
    /* Thư sửa ghi tên loại phòng ("Premier Bathtub"), thư đơn mới ghi số phòng. */
    if (su.loai === 'sua') dat(b, 'hangPhong', su.loaiPhong);
    else dat(b, 'phong', su.loaiPhong);
    dat(b, 'soTien', su.soTien);
    dat(b, 'soKhach', su.soKhach);
    dat(b, 'ghiChu', su.ghiChuOta);
    dat(b, 'hoaHong', su.hoaHong);
    if (su.loai === 'sua') b.daSua = true;
  } else if (su.loai === 'doi-phong') {
    dat(b, 'phong', su.loaiPhong);
  } else if (su.loai === 'nhan-phong' || su.loai === 'tra-phong' || su.loai === 'huy') {
    dat(b, 'nhanPhong', su.nhanPhong || (su.loai === 'nhan-phong' ? su.ngayNhan : undefined));
    if (su.loai === 'tra-phong') dat(b, 'traPhong', su.ngayTra);
    dat(b, 'phong', su.loaiPhong);
    if (b.soTien == null) dat(b, 'soTien', su.soTien);
  } else if (su.loai === 'thanh-toan') {
    b.daThanhToan = (b.daThanhToan || 0) + (su.daTra || 0);
    dat(b, 'conLai', su.conLai);
  }
  if (TRANG_THAI[su.loai] && !(b.trangThai === 'Đã huỷ' && su.loai === 'sua')) b.trangThai = TRANG_THAI[su.loai];
  if (b.nhanPhong && b.traPhong && !b.soDem) b.soDem = Math.round((Date.parse(b.traPhong) - Date.parse(b.nhanPhong)) / 864e5);
}

const chuanTen = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Thư nhận phòng của GoHost không ghi mã OTA: nối thư Agoda theo tên khách + ngày nhận phòng. */
function theoTen(theoMa, su) {
  if (!su.tenKhach || !su.nhanPhong) return null;
  const ten = chuanTen(su.tenKhach);
  for (const b of theoMa.values()) {
    if (b.kenh === 'Agoda' && !b.maOta && b.nhanPhong === su.nhanPhong && chuanTen(b.tenKhach) === ten) return b;
  }
  return null;
}

function boSungAgoda(b, luc, su, chiAgoda = false) {
  b.suKien.push(luc + ' · Agoda ' + (su.trangThaiAgoda === 'CANCELLED' ? 'báo huỷ' : 'xác nhận'));
  dat(b, 'maOta', su.maOta);
  b.kenh = b.kenh || 'Agoda';
  dat(b, 'quocGia', su.quocGia);
  dat(b, 'nguoiLon', su.nguoiLon);
  if (su.treEm != null) b.treEm = su.treEm;
  if (b.soKhach == null && su.nguoiLon) b.soKhach = su.nguoiLon + (su.treEm || 0);
  dat(b, 'yeuCau', su.yeuCau);
  if (su.loaiPhongOta && !b.hangPhong) b.hangPhong = su.loaiPhongOta + (su.goiGia ? ' (' + su.goiGia + ')' : '');
  dat(b, 'giaBan', su.giaBan);
  dat(b, 'hoaHong', su.hoaHong);
  if (chiAgoda) {
    /* Đơn chỉ có thư Agoda (trước khi nối GoHost): lấy luôn ngày ở từ thư Agoda. */
    dat(b, 'tenKhach', su.tenKhach);
    dat(b, 'nhanPhong', su.nhanPhong);
    dat(b, 'traPhong', su.traPhong);
    if (!b.ngayDat && su.trangThaiAgoda === 'CONFIRMED') b.ngayDat = luc;
    if (b.nhanPhong && b.traPhong) b.soDem = Math.round((Date.parse(b.traPhong) - Date.parse(b.nhanPhong)) / 864e5);
  } else if (!b.traPhong && su.traPhong && (!b.nhanPhong || b.nhanPhong === su.nhanPhong)) {
    /* Đơn chỉ có thư nhận phòng của GoHost (không ghi ngày trả): thư Agoda có ngày trả. */
    b.traPhong = su.traPhong;
    if (b.nhanPhong) b.soDem = Math.round((Date.parse(b.traPhong) - Date.parse(b.nhanPhong)) / 864e5);
    if (!b.ngayDat && su.trangThaiAgoda === 'CONFIRMED') b.ngayDat = luc;
  }
  if (su.trangThaiAgoda === 'CANCELLED') b.trangThai = 'Đã huỷ';
  else if (!b.trangThai) b.trangThai = 'Đã đặt';
  b.capNhat = b.capNhat && b.capNhat > luc ? b.capNhat : luc;
}

module.exports = { gop, TRANG_THAI };
