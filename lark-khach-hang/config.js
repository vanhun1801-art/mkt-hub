'use strict';
const path = require('path');

/* App con "Khách hàng" — gom hồ sơ khách từ mọi kênh về một chỗ.
 *
 * Bản LOCAL: dữ liệu nằm trong du-lieu/ trên đĩa máy này, KHÔNG ghi gì lên
 * Lark Base. Anh Hùng 02/10/2026: "làm local anh xem". Khi nào xem xong và
 * chốt hình dạng thì mới chuyển kho lên Base. */
module.exports = {
  port: Number(process.env.PORT) || 5203,
  thuMucDuLieu: path.join(__dirname, 'du-lieu'),
  tepTho: path.join(__dirname, 'du-lieu', 'tho.json'),

  /* Kéo lại sau bao lâu thì coi là cũ. Kéo đủ 16.000 khách mất ~6 phút nên
   * không thể làm mỗi lần mở trang — mở trang thì đọc bản đã kéo, còn kéo mới
   * là việc chạy nền. */
  hanCu: 12 * 3600 * 1000,

  /* Chạy trong Hub hay chạy một mình. Dòng nhãn "bản local" chỉ đúng khi chạy
   * một mình — để nguyên khi deploy là nói sai với cả phòng. */
  trongHub: !!(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET),
};
