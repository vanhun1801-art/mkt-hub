'use strict';
/**
 * Kết quả ROAS (roasTinh.tinh()) của lượt ghi công GẦN NHẤT — để màn "ROAS từng
 * quảng cáo" có số ngay khi mở trang, không bắt anh Hùng bấm "Tính ROAS" mỗi
 * lần nếu lượt hẹn giờ/kéo API đã tự tính rồi. Nút "Tính ROAS" vẫn còn, dùng khi
 * muốn xem một khoảng ngày khác với lượt tự động.
 *
 * Lưu ra đĩa (không giữ trong bộ nhớ) cùng lý do với sync/khoroas.js: Render
 * khởi động lại tiến trình là mất bộ nhớ, nhưng ổ đĩa tạm cũng mất sau deploy —
 * chấp nhận được vì lượt hẹn giờ kế tiếp tự tính lại, không cần ai bấm gì.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'roas-cache.json');

function doc() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return null; }
}

function ghi(kq) {
  const goi = { luc: new Date().toISOString(), kq };
  fs.writeFileSync(FILE, JSON.stringify(goi), { mode: 0o600 });
  return goi;
}

module.exports = { doc, ghi };
