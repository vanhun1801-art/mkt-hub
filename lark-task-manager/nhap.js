'use strict';
/**
 * Nhận ra bản ghi NHÁP và loại nó khỏi danh sách việc.
 *
 * Để riêng một file vì đây là một chốt chặn hỏng-im-lặng: sai ở đây thì việc đang
 * soạn dở chảy ra toàn hệ — hiện trong danh sách của nhân sự, bị đếm vào Tổng quan
 * của hub, vào KPI, vào Báo cáo — mà không có lỗi nào nổ ra để biết. Cùng lý do
 * với campaign.js: phải kiểm thử được mà không cần bật server (server.js không
 * export gì và require nó là chạy luôn).
 */

/** Đọc ô select của Lark Base về chuỗi. Base trả nhiều dạng tuỳ backend. */
function chuOSelect(v) {
  if (v == null) return '';
  const x = Array.isArray(v) ? v[0] : v;
  if (x == null) return '';
  if (typeof x === 'string') return x;
  if (typeof x === 'object') return x.text || x.name || '';
  return String(x);
}

/**
 * Bản ghi này có phải nháp không.
 * Truyền tenNhap vào thay vì đọc cfg, để test không phụ thuộc cấu hình.
 */
function laNhap(rec, statusFieldId, tenNhap) {
  if (!rec || !rec.cells) return false;
  return chuOSelect(rec.cells[statusFieldId]) === tenNhap;
}

/** Bỏ mọi bản ghi nháp khỏi danh sách. */
function locBoNhap(ds, statusFieldId, tenNhap) {
  return (ds || []).filter((r) => !laNhap(r, statusFieldId, tenNhap));
}

/** Nháp của ai: khớp theo người order. Quản lý cũng không xem nháp người khác. */
function laChuNhap(rec, meId, requesterFieldId) {
  if (!rec || !rec.cells || !meId) return false;
  const v = rec.cells[requesterFieldId];
  if (!Array.isArray(v)) return false;
  return v.some((u) => u && u.id === meId);
}

module.exports = { laNhap, locBoNhap, laChuNhap, chuOSelect };
