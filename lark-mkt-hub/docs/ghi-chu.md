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

**Từ 26/10/2026, trong hub:** "Tạo công việc" và "Tạo từ đoạn này" mở form THẬT
của Bảng công việc (`parent.hubTaoViec`, cùng đường với tạo việc từ Tin của
phòng), điền sẵn tên và nội dung, ô Link là `…/#/ghi-chu?note=<mã>`. Bảng công
việc vẽ Link đó thành thẻ "Từ ghi chú"; `GET /api/ghi-chu/tasks` nhận thêm mọi
việc có Link trỏ về ghi chú của chính người đó, nên việc tạo xong tự hiện dưới
ghi chú. Mỗi lần mở lại Ghi chú, hub nhắn `{ hub: 'ghi-chu-hien' }` để trang đọc
lại danh sách việc. Cửa sổ tạo việc riêng bên dưới chỉ còn dùng khi mở trang
ngoài hub.

Trang nạp cùng lớp chung với app con (ios.css, ios-app.js, i18n.js,
dienthoai.css, `__HUB__.che`) ngay trong `ghi-chu.html`, vì nó không đi qua
proxy.js. Thông báo đi qua viên Dynamic Island của hub. Nội dung, tiêu đề, tên
thư mục tự đặt không bị i18n dịch.

(Cách cũ, vẫn giữ cho trang mở ngoài hub:) Tạo việc dùng API và quyền của Bảng công việc, mặc định không gửi người phụ
trách. Người order do máy chủ xác định. Công việc có Link về ghi chú gốc; bấm
công việc trong ghi chú mở form thật để sửa tiếp. Không sao chép ghi chú sang tài
khoản khác khi họ mở Link. Request ID và bản ghi pending được lưu trước POST;
mất kết nối thì tìm theo Link nguồn, không POST lại một cách mù quáng.

Kiểm tra không ghi Lark: `node --test test/ghi-chu.test.js`.

## Đồng bộ khi đang dùng

Trang đang mở kiểm tra thay đổi mỗi 6 giây, đồng bộ ngay khi trở lại tab hoặc
khôi phục mạng. Các tab cùng tài khoản báo phiên bản cho nhau qua BroadcastChannel
(không truyền nội dung ghi chú). Thay đổi được gửi sau 1,2 giây ngừng gõ hoặc tối
đa khoảng 5 giây gõ liên tục; lỗi tạm thời tự thử lại với thời gian chờ tăng dần.

Đối chiếu ba bản (bản đã xác nhận, bản đang soạn, bản máy chủ) để gộp các ghi chú
khác nhau hoặc các trường khác nhau. Nếu cùng một trường được sửa khác nhau ở
hai nơi, giữ nguyên bản máy chủ và tạo một bản giữ lại cho phần cục bộ. Bản nháp
có baseline được lưu theo tài khoản và cửa sổ; bản cũ không có baseline được
khôi phục thận trọng bằng bản giữ lại. Không bắt tải lại/ghi đè khi gặp HTTP 409.

Kho Base đọc lại danh sách tệp nhưng chỉ tải/giải nén khi token thay đổi, dùng
bộ đệm máy chủ 5 giây. Một phiên bản đã xác nhận không được lùi về phiên bản
cũ nếu danh sách đính kèm của Lark cập nhật chậm. Bộ đệm không phải nguồn dữ liệu
bền; thành công chỉ được xác nhận sau khi ghi Base xong.

Kiểm thử đồng bộ: `node --test test/ghi-chu-sync.test.js test/ghi-chu.test.js`.
