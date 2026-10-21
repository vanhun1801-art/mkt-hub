# Nhật ký deploy

Ghi lại các lần chủ động kích Render deploy (commit chạm `lark-mkt-hub/` để
Render tự build lại từ `main`). Mỗi dòng: ngày · nội dung chính đang đưa lên.

- 2026-10-20 · App Công việc: bước nghiệm thu sản phẩm (editor "Đã gửi sản phẩm"
  → người order/quản lý nghiệm thu), mốc chỉnh sửa 1,5 ngày, tab "Việc đã order",
  và gợi ý deadline theo Loại công việc (dải nhiệt + mốc giờ 11:00/16:00). Lưu ý:
  push Lark "mời nghiệm thu" cần một automation trên Base (cột "Đã giải quyết").
- 2026-10-20 (2) · Gợi ý deadline: hiện màu dải nhiệt ngay khi chọn Loại công việc
  (đếm việc cùng loại tới hạn mỗi ngày, chưa cần chọn người); hiệu ứng ngày gợi ý
  mặc định "viền thở" (đổi bằng ?fx=tho|dom|quet|aurora|cham); câu gợi ý gọn lại.
- 2026-10-21 · Việc con: Enter tạo nhanh với người phụ trách để trống, hiện
  "Chưa phân công"; không tự phân phối hoặc gán người tạo. Bấm việc con để mở
  form chi tiết đầy đủ và chọn người làm. Mã thay đổi: 4ed6cfe. Đã kiểm tra 7
  tình huống của luồng này và 10 bộ kiểm thử không cần Lark thật.

- 2026-10-21 (3) · Không gian Ghi chú cá nhân: thư mục, tìm kiếm, ghim, checklist,
  biên bản họp và khôi phục ghi chú. Lưu bền trên kho Lark của Hub theo tài khoản;
  tạo công việc thật từ nội dung đã chọn, liên kết về ghi chú gốc, chống tạo trùng.

- 2026-10-21 (4) · Đồng bộ giao diện Ghi chú với Hub: bỏ logo/tiêu đề thương hiệu,
  chân trang và trạng thái lưu lặp; dùng cùng palette/phông chữ sáng tối, nút
  xanh và thẻ bo góc. Gọn thao tác tạo mới, cải thiện bố cục điện thoại.
