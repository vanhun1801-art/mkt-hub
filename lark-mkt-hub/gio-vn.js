'use strict';
/**
 * ============================================================================
 * GIỜ VIỆT NAM — một nơi duy nhất cho cả lớp vỏ
 * ============================================================================
 * Máy chủ Render chạy giờ UTC. Mọi hàm `getHours()` / `getDate()` /
 * `setHours(0,0,0,0)` vì thế trả ra giờ UTC chứ không phải giờ Việt Nam, và lệch
 * đúng 7 tiếng — nghĩa là mọi mốc rơi vào khoảng 00:00–06:59 giờ VN bị tính sang
 * NGÀY HÔM TRƯỚC.
 *
 * Hậu quả đã đo được trên dữ liệu thật: 16 lịch tác nghiệp và 3 công việc rơi
 * sai cột ngày trên dải nhiệt "Tải nhân sự", và số "Quá hạn" đếm sớm một ngày
 * với những việc đúng hạn 00:00. Trên máy cá nhân (giờ VN) thì không thấy gì —
 * đó là lý do lỗi này sống lâu.
 *
 * Ba app con đã có bộ hàm riêng cho việc này rồi; đây là bản của lớp vỏ. Ai thêm
 * chỗ tính ngày mới thì lấy ở đây, ĐỪNG viết lại bằng getHours/getDate.
 */

const NGAY = 86400000;
const LECH_VN = 7 * 3600000;
const p2 = (n) => String(n).padStart(2, '0');

/** Chuẩn hoá về epoch ms: Base trả khi thì số, khi thì chuỗi ISO. */
const ms = (v) => (v == null || v === '' ? 0 : typeof v === 'number' ? v : Date.parse(v) || 0);

/** Epoch của 00:00 giờ VN trong ngày chứa mốc `t`. */
const dauNgay = (t) => Math.floor((ms(t) + LECH_VN) / NGAY) * NGAY - LECH_VN;

/** 'YYYY-MM-DD' theo giờ VN — dùng làm khoá cột ngày. */
function ngayKhoa(t) {
  if (!ms(t)) return '';
  const x = new Date(ms(t) + LECH_VN);
  return x.getUTCFullYear() + '-' + p2(x.getUTCMonth() + 1) + '-' + p2(x.getUTCDate());
}

/** 'DD/MM' theo giờ VN. */
function ngayNgan(t) {
  if (!ms(t)) return '';
  const x = new Date(ms(t) + LECH_VN);
  return p2(x.getUTCDate()) + '/' + p2(x.getUTCMonth() + 1);
}

/** 'HH:MM' theo giờ VN. */
function gio(t) {
  if (!ms(t)) return '';
  const x = new Date(ms(t) + LECH_VN);
  return p2(x.getUTCHours()) + ':' + p2(x.getUTCMinutes());
}

/** 'DD/MM/YYYY' theo giờ VN. */
function ngayDai(t) {
  if (!ms(t)) return '';
  const x = new Date(ms(t) + LECH_VN);
  return p2(x.getUTCDate()) + '/' + p2(x.getUTCMonth() + 1) + '/' + x.getUTCFullYear();
}

/** 'DD/MM HH:MM' theo giờ VN. */
const ngayGio = (t) => (ms(t) ? ngayNgan(t) + ' ' + gio(t) : '');

const THU = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
/** Thứ mấy, theo giờ VN. */
const thu = (t) => (ms(t) ? THU[new Date(ms(t) + LECH_VN).getUTCDay()] : '');

/** 'YYYY-MM-DD' -> epoch của 00:00 giờ VN hôm đó. Sai định dạng thì trả NaN. */
const tuNgayKhoa = (s) => Date.parse(String(s) + 'T00:00:00+07:00');

/** Tháng hiện tại theo giờ VN, trả { tu, den } dạng 'YYYY-MM-DD'. */
function thangNay(bayGio) {
  const x = new Date(dauNgay(bayGio == null ? Date.now() : bayGio) + LECH_VN);
  const y = x.getUTCFullYear();
  const m = x.getUTCMonth();
  const cuoi = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { tu: y + '-' + p2(m + 1) + '-01', den: y + '-' + p2(m + 1) + '-' + p2(cuoi) };
}

module.exports = {
  NGAY, LECH_VN, ms, dauNgay, ngayKhoa, ngayNgan, ngayDai, gio, ngayGio, thu, tuNgayKhoa, thangNay,
};
