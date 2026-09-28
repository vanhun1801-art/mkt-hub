'use strict';
/**
 * Chốt vai quản lý.
 *
 * Tách ra khỏi server.js để test được. Một chốt bảo mật không có test là chỗ dễ
 * hỏng nhất khi sửa code sau này.
 *
 * Máy cá nhân (mode 'file'): luôn có vai. Cấu hình nằm ngay trên đĩa của chính
 * người đó, thêm chốt ở đây không bảo vệ được gì.
 *
 * Server chung (mode 'api'): chỉ tin header x-hub-user-manager do hub đặt sau khi
 * đăng nhập Lark và tra bảng Phân quyền app. Hub XOÁ header do client tự gửi trước
 * khi ghi lại, và app chỉ nghe trên 127.0.0.1 — nên không ai mạo danh được. Nếu
 * HUB_TRUST_HEADER=0 (cổng mở ra ngoài) thì không tin ai cả.
 */
function laQuanLy(req, cfg, env) {
  const c = cfg || require('./config');
  const e = env || process.env;
  if (c.mode !== 'api') return true;
  if (e.HUB_TRUST_HEADER === '0') return false;
  const h = (req && req.headers) || {};
  return h['x-hub-user-manager'] === '1';
}

/**
 * Được nhìn thấy CÁC CON SỐ TIỀN hay không.
 *
 * Anh Hùng 28/09/2026: "nhân sự không cho thấy doanh thu nhé em".
 *
 * Quản lý thì được. Ngoài ra hub có sẵn quyền lẻ "Xem chi phí" trong bảng Phân
 * quyền app, gửi xuống bằng header x-hub-perm-chi-phi — dùng lại đúng quyền ấy
 * thay vì đẻ ra một quyền thứ hai cùng nghĩa để rồi hai chỗ lệch nhau.
 *
 * CHẶN Ở MÁY CHỦ, không chỉ giấu cột trên màn hình. Giấu ở giao diện thì số vẫn
 * nằm trong phản hồi JSON, mở tab Network của trình duyệt là đọc được — mà cái
 * cần giấu ở đây là doanh thu.
 */
function duocXemTien(req, cfg, env) {
  const c = cfg || require('./config');
  const e = env || process.env;
  if (c.mode !== 'api') return true;                  // máy cá nhân: người ngồi máy tự xem của mình
  if (laQuanLy(req, c, e)) return true;
  if (e.HUB_TRUST_HEADER === '0') return false;
  const h = (req && req.headers) || {};
  return h['x-hub-perm-chi-phi'] === '1';
}

module.exports = { laQuanLy, duocXemTien };
