# Ghi chú cá nhân

Mở `/#/ghi-chu`. Mỗi tài khoản có thư mục, ghi chú định dạng cơ bản, checklist,
nhãn, ghim và mục đã xoá có thể khôi phục. Chưa có chia sẻ ghi chú hoặc AI.

Dữ liệu thật nằm trong bảng kho Hub hiện có (`Ô`, `Tệp`), không nằm trên ổ tạm
Render. Mỗi danh tính `kieu:id` có một dòng `ghi-chu:<sha256>`; tệp gzip chứa
snapshot và revision. Có thể chỉ định kho riêng bằng `HUB_GHI_CHU_BASE` và
`HUB_GHI_CHU_TABLE`; mặc định dùng cùng kho phim/logo Hub. Không đổi cấu trúc bảng.
Ứng dụng Lark cần quyền đọc/ghi Base và upload/download media như kho Hub.
Giới hạn mỗi tài khoản: 250 ghi chú, 60 thư mục, khoảng 650 KB nội dung.

API dùng danh tính phiên phía máy chủ, không nhận owner từ URL/body. Khách và
chế độ Xem như đều không được đọc/ghi. Đây là quyền riêng trong ứng dụng; người
quản trị Base Lark vẫn quản lý được dữ liệu ở tầng lưu trữ.

Upload snapshot mới trước rồi thay ô đính kèm; lỗi ghi không gỡ bản cũ. Revision
chặn việc hai tab ghi đè nhau. Bản chưa đồng bộ được giữ riêng theo tài khoản
trong trình duyệt, có nút tải bản nháp khi gặp lỗi/xung đột.

Tạo việc dùng API và quyền của Bảng công việc, mặc định không gửi người phụ
trách. Người order do máy chủ xác định. Công việc có Link về ghi chú gốc; bấm
công việc trong ghi chú mở form thật để sửa tiếp. Không sao chép ghi chú sang tài
khoản khác khi họ mở Link. Request ID và bản ghi pending được lưu trước POST;
mất kết nối thì tìm theo Link nguồn, không POST lại một cách mù quáng.

Kiểm tra không ghi Lark: `node --test test/ghi-chu.test.js`.
