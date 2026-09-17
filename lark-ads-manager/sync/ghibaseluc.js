'use strict';
/**
 * Mốc giờ lần cuối GHI THẬT lên bảng "Báo cáo Sales" (/api/roas/ghi-base).
 *
 * Vì sao cần file riêng: việc ghi công + ghi lên Base KHÔNG chạy tự động theo
 * hẹn giờ (chỉ chạy khi có người bấm nút) — xem sync/ghidoanhthu.js. Cột KÊNH
 * trên Base vì thế có thể cũ hơn đơn hàng mới nhất. Giao diện cần biết mốc này
 * để không ngộ nhận "Khác" của một đơn hôm nay đã được xác minh, trong khi
 * thực ra ghi công gần nhất là từ nhiều ngày trước.
 *
 * Lưu ra đĩa (không phải bộ nhớ) vì `sync/keonen.js` là trạng thái TIẾN ĐỘ dùng
 * chung cho nhiều loại việc nền — chạy việc khác sau đó sẽ ghi đè, không giữ
 * được mốc riêng của ghi-base.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'roas-ghi-base-luc.json');

function doc() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return null; }
}

function ghi({ from, to, taoMoi = 0, capNhat = 0 }) {
  const kq = { luc: new Date().toISOString(), from: from || null, to: to || null, taoMoi, capNhat };
  fs.writeFileSync(FILE, JSON.stringify(kq), { mode: 0o600 });
  return kq;
}

module.exports = { doc, ghi };
