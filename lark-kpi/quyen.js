'use strict';
/**
 * Chốt vai quản lý — cùng một lối với năm app con kia (xem lark-social/quyen.js).
 *
 * Tách khỏi server.js để test được. Một chốt bảo mật không có test là chỗ dễ
 * hỏng nhất khi sửa code sau này.
 *
 * Máy cá nhân (mode 'cli'): luôn có vai. Cấu hình nằm ngay trên đĩa của chính
 * người đó, thêm chốt ở đây không bảo vệ được gì.
 *
 * Server chung (mode 'api'): chỉ tin header `x-hub-user-manager` do hub đặt sau
 * khi đăng nhập Lark và tra bảng Phân quyền app. Hub XOÁ header do client tự gửi
 * trước khi ghi lại, và app chỉ nghe trên 127.0.0.1 — nên không ai mạo danh được.
 * `HUB_TRUST_HEADER=0` (cổng mở ra ngoài) thì không tin ai cả.
 *
 * VÌ SAO PHẢI VIẾT TỆP NÀY: bản trước app KPI tự dựng danh sách quản lý riêng từ
 * biến `KPI_QUAN_LY`. Biến đó không có trong render.yaml, nên trên server chung
 * MỌI người đều rơi xuống vai nhân sự: sáu tab chỉ-quản-lý biến mất (Báo cáo,
 * Tổng quan, Nguồn số liệu, Phân công kênh, Mục tiêu & thử luật, Soát & chốt) và
 * app trông như bản thiếu một nửa. Hub vốn ĐÃ gửi sẵn header này — chỉ là app
 * không thèm đọc.
 */
function laQuanLy(req, cfg, env) {
  const c = cfg || require('./config');
  const e = env || process.env;
  if (c.mode !== 'api') return true;
  if (e.HUB_TRUST_HEADER === '0') return false;
  const h = (req && req.headers) || {};
  if (h['x-hub-user-manager'] === '1') return true;

  /* Đường phụ, giữ cho tương thích: ai chạy app này MỘT MÌNH ở chế độ api (không
   * qua hub) thì không có header nào cả, nên vẫn cho khai tay bằng KPI_QUAN_LY. */
  const ds = String(e.KPI_QUAN_LY || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ds.length) return false;
  const id = h['x-hub-user-id'] || '';
  /* `decodeURIComponent` NÉM LỖI với chuỗi hỏng ("%E0%A4%A"). Một chốt bảo mật
   * ném lỗi là 500 cho mọi yêu cầu — tệ hơn hẳn việc trả về "không phải quản lý". */
  let ten = h['x-hub-user-name'] || '';
  try { ten = ten ? decodeURIComponent(ten) : ''; } catch (_) { /* giữ nguyên bản thô */ }
  return (!!id && ds.includes(id)) || (!!ten && ds.includes(ten));
}

module.exports = { laQuanLy };
