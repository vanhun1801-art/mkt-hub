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

- 2026-10-21 (5) · Ghi chú điện thoại theo cách dùng iPhone: thư mục, danh sách
  và màn soạn riêng, điều hướng Quay lại, nhóm ghi chú theo ngày, thanh công cụ
  dưới, định dạng Aa và menu tuỳ chọn dạng bảng trượt. Giữ luồng tạo việc và
  tự động lưu; điều chỉnh chiều cao theo vùng nhìn khi bàn phím xuất hiện.

- 2026-10-21 (6) · Sửa đồng bộ Ghi chú: tự nhận thay đổi mỗi 6 giây/khi quay
  lại trang, thử lại sau lỗi kết nối, gộp thay đổi giữa các thiết bị và giữ bản
  riêng khi cùng sửa một trường. Bản nháp theo cửa sổ, cập nhật ô soạn đang
  mở mà giữ vị trí con trỏ; giảm tải lại tệp Base và chống lùi revision.

## 2026-10-21 · Hàng chờ nghiệm thu cho quản lý

- Bảng công việc: tab “Order & nghiệm thu”, chọn “Chờ nghiệm thu · toàn phòng” để xem việc đã nộp do bất kỳ người order nào trong base giao, gồm cả việc quá hạn/tháng trước.
- Hiện người order, sản phẩm và dùng luồng nghiệm thu đạt / trả về chỉnh sửa hiện có. Chỉ quản lý base được mở thêm phạm vi; quyền xem toàn bộ và khách giữ nguyên.
- Kiểm tra: 8 kiểm thử nghiệm thu/quyền, 7 kiểm tra việc con; bộ kiểm tra khách Hub và tham chiếu hàm; kiểm tra UI desktop/390px với dữ liệu giả.

## 2026-10-21 · Thử Bot nhắc nghiệm thu và cảnh báo hành động

- Tab Order & nghiệm thu → Bot nhắc việc: xem hai mẫu dữ liệu thật, gửi thử riêng tài khoản quản lý đang đăng nhập. Gửi xong chọn tài khoản đó làm người nhận thử; chưa gửi tới các người order khác. Có nút Tắt nhắc thử.
- Pilot: báo ngay khi có sản phẩm nộp cho người nhận thử, nhắc lại 08:00 và 17:00 giờ Việt Nam nếu còn chờ nghiệm thu. Lịch chạy trên Render, bù trong 30 phút nếu tiến trình vừa khởi động.
- Mẫu cảnh báo quản lý: ưu tiên việc quá hạn chưa nộp, đến hạn 24h, làm lại và đang thực hiện; nêu bước cần làm + nút mở đúng việc. Chỉ demo, không tự nhắc nhân sự.
- Cấu hình và dấu gửi lưu ở kho cấu hình Base (Ô bot-cong-viec:v1 / bot-cv-gui); UUID chống gửi trùng và chỉ báo gửi thành công khi Lark xác nhận. Deep link nghiệm thu mở đúng drawer Order.
- Kiểm tra bộ thử Bot, quyền nghiệm thu, nhắc tay; không gửi tin trong unit test.

- Kiểm tra dữ liệu thật: cảnh báo nhanh ưu tiên kỳ hiện tại, tách các việc có hạn từ tháng trước thành tồn cũ cần rà soát.
