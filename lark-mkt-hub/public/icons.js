'use strict';
/* ============================================================
   Bộ icon 2D nét mảnh cho panel và tiêu đề khối.
   Vẽ tay bằng SVG 24×24, stroke 1.7, đầu nét tròn — không dùng emoji,
   không phụ thuộc thư viện ngoài. Icon lấy màu từ `currentColor` nên đổi
   màu module trong modules.json là icon đổi theo.

   Thêm base mới: đặt `"icon": "<tên>"` trong modules.json, tên nằm trong
   danh sách dưới đây. Tên lạ (hoặc 1-3 chữ cái) thì hub in ra dạng chữ.
   ============================================================ */

const IC = (d, extra = '') =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + extra + '</svg>';

const ICONS = {
  /* Tổng quan: 4 khối như một bảng điều khiển */
  'tong-quan': IC(
    '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/>' +
    '<rect x="13.5" y="3.5" width="7" height="7" rx="2"/>' +
    '<rect x="3.5" y="13.5" width="7" height="7" rx="2"/>' +
    '<rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'
  ),

  /* Công việc: bảng có dấu tích */
  'cong-viec': IC(
    '<rect x="4" y="3.5" width="16" height="17" rx="3"/>' +
    '<path d="M8 9.5l2 2 3.5-3.5"/>' +
    '<path d="M8 15.5h8"/>'
  ),

  /* Lịch tác nghiệp: khung lịch */
  'lich': IC(
    '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/>' +
    '<path d="M3.5 10h17M8 3.5v3.5M16 3.5v3.5"/>' +
    '<circle cx="8.5" cy="14.5" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="12.5" cy="14.5" r="1.1" fill="currentColor" stroke="none"/>'
  ),

  /* Quảng cáo: cột hiệu suất tăng dần */
  'quang-cao': IC(
    '<path d="M4 20.5V13M9.5 20.5V8.5M15 20.5v-6M20.5 20.5V4.5"/>'
  ),

  /* Tải nhân sự / người */
  'nguoi': IC(
    '<circle cx="12" cy="8" r="3.5"/>' +
    '<path d="M5 20.5c0-3.6 3.1-6 7-6s7 2.4 7 6"/>'
  ),

  /* Base / bảng dữ liệu */
  'base': IC(
    '<rect x="3.5" y="4" width="17" height="16" rx="3"/>' +
    '<path d="M3.5 9.5h17M3.5 15h17M9.5 4v16"/>'
  ),

  /* App ngoài / trên mây */
  'may': IC(
    '<path d="M7.5 18.5h9.2a3.8 3.8 0 0 0 .3-7.6 5.4 5.4 0 0 0-10.4-1A3.8 3.8 0 0 0 7.5 18.5Z"/>'
  ),

  /* Tiền / doanh thu */
  'tien': IC(
    '<circle cx="12" cy="12" r="8.5"/>' +
    '<path d="M12 7.5v9M14.5 9.8c-.5-.9-1.4-1.3-2.5-1.3-1.4 0-2.5.7-2.5 1.9 0 1.1.9 1.6 2.5 1.9 1.7.3 2.7.8 2.7 2 0 1.3-1.2 2-2.7 2-1.2 0-2.2-.5-2.7-1.4"/>'
  ),

  /* Thêm */
  'them': IC('<path d="M12 5.5v13M5.5 12h13"/>'),

  /* Cài đặt: 3 cần trượt */
  'cai-dat': IC(
    '<path d="M4 7h16M4 12h16M4 17h16"/>' +
    '<circle cx="9" cy="7" r="2.1" fill="var(--rail-nen, #fff)"/>' +
    '<circle cx="15" cy="12" r="2.1" fill="var(--rail-nen, #fff)"/>' +
    '<circle cx="7.5" cy="17" r="2.1" fill="var(--rail-nen, #fff)"/>'
  ),

  /* Chế độ sáng */
  'sang': IC(
    '<circle cx="12" cy="12" r="4.2"/>' +
    '<path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>'
  ),

  /* Chế độ tối */
  'toi': IC('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/>'),

  /* Theo hệ thống */
  'auto': IC(
    '<rect x="3" y="4.5" width="18" height="12.5" rx="2.5"/>' +
    '<path d="M8.5 20.5h7"/>' +
    '<path d="M12 7.5v6.5a3.25 3.25 0 0 0 0-6.5Z" fill="currentColor" stroke="none"/>'
  ),

  /* Cảnh báo / cần xử lý */
  'gap': IC(
    '<path d="M12 4.5 21 19.5H3L12 4.5Z"/>' +
    '<path d="M12 10v4"/>' +
    '<circle cx="12" cy="16.8" r="1" fill="currentColor" stroke="none"/>'
  ),
};

/** Trả về HTML của icon; tên lạ thì in ra chính chuỗi đó (dạng chữ viết tắt). */
function icon(ten) {
  if (ICONS[ten]) return ICONS[ten];
  return String(ten == null ? '' : ten);
}

window.ICONS = ICONS;
window.icon = icon;
