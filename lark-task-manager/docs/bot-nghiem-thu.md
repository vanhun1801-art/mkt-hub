# Bot nhắc nghiệm thu · bản thử

Mở Order & nghiệm thu → Bot nhắc việc. Gửi 2 mẫu chỉ gửi cho tài khoản quản lý đang đăng nhập; người nhận không thể được đổi bằng payload client. Mẫu nghiệm thu dùng việc do người đó order; mẫu cảnh báo dùng công việc toàn phòng trong phạm vi quản lý.

Sau khi gửi đủ 2 mẫu, bật chế độ pilot cho tài khoản đó: thông báo nộp mới và nhắc các việc còn chờ lúc 08:00 / 17:00 Asia/Ho_Chi_Minh. Cần dùng bot Marketing Hub trên bản API Render. Chỉ gửi digest khi có việc chờ; không gồm hoàn thành/hủy/nháp/liên phòng. Ngừng nhắc từng việc khi nghiệm thu hoặc trả về chỉnh sửa; có thể Tắt nhắc thử trong hộp Bot.

Chưa bật toàn phòng. Chế độ all trong service dành cho bước triển khai tiếp theo, chưa có UI bật và chưa được chọn.

Cấu hình ở cột Ô kho Base tbl1rcw5ES34EeEY (cùng vị trí HUB_PHIM_BASE/HUB_PHIM_TABLE), namespace bot-cong-viec:v1. Mỗi dấu gửi có namespace bot-cv-gui và SHA256 của người nhận/loại/mốc. Không dùng ổ tạm Render; UUID gửi Lark giữ nguyên khi thử lại. Gửi lỗi không ghi dấu đã gửi.

Lịch mỗi phút trên Render, chỉ bù trong 30 phút đầu mỗi mốc; nếu Render ngừng lâu hơn thì bỏ mốc cũ. Thẻ không tự tạo việc hay đổi deadline. Mẫu cảnh báo là gợi ý cố định theo trạng thái, không suy đoán nội dung công việc.

API: GET /api/bot-nghiem-thu xem mẫu; POST action demo + requestId gửi thử và chọn pilot; POST action stop tắt. Chỉ quản lý, danh tính lấy từ phiên; lớp Hub giữ chặn ghi khi xem hộ.
