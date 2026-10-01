# Quyền tối thiểu của app Lark "Marketing Hub"

Rà ngày 01/10/2026 bằng cách đọc **mọi** lời gọi Lark Open API trong 14 app khi chạy trên
Render (chế độ `api`). Các lệnh `lark-cli` chỉ chạy trên máy cá nhân nên không tính.

**Hiện tại app có ~482 quyền** (Admin Console ghi "requires 482 permissions"), gồm cả quyền
quản trị toàn công ty (`admin:app.enable:write`, `admin:app.visibility`, `admin:ent_email_password`…).
App Secret nằm trong biến môi trường Render và giờ còn mở được kho mật khẩu của phòng —
lộ Secret là mất cả tenant. **Cả hệ chỉ cần khoảng 25 quyền dưới đây.**

## Danh sách giữ lại

| Nhóm | Quyền (tên trên console có thể là tên cũ trong ngoặc) | Dùng cho |
|---|---|---|
| Base | `base:record:retrieve` (`bitable:app:readonly`) | đọc bản ghi — mọi app |
| | `base:record:create` · `base:record:update` · `base:record:delete` | ghi bản ghi — mọi app |
| | `base:field:read` · `base:field:create` · `base:field:update` | đọc/thêm/sửa cột (OTA, Bảng công việc) |
| | `base:table:read` | liệt kê bảng (OTA) |
| | `bitable:app` | API bitable/v1 cũ mà app Báo cáo còn gọi |
| Tệp đính kèm | `docs:document.media:upload` · `docs:document.media:download` (`drive:drive`) | ảnh/tệp trong Base |
| | `drive:file:download` (`drive:drive:readonly`) | Kho media tải ảnh/xem trước |
| | `docs:permission.member:auth` | OTA kiểm quyền Base (không có cũng chạy) |
| Tin nhắn | `im:message:send_as_bot` (`im:message`) | bot gửi tin nhóm + nhắn riêng (nhắc gia hạn, đổi mật khẩu…) |
| | `im:chat:readonly` · `im:chat.members:read` | đọc nhóm, danh sách thành viên Phòng MKT |
| Danh bạ | `contact:contact.base:readonly` · `contact:user.base:readonly` | tìm người (ô chọn người), tên + ảnh đại diện |
| | `contact:user.id:readonly` · `contact:user.email:readonly` | đổi email → open_id; email lúc đăng nhập |
| | `contact:user.employee:readonly` | có thể cần để đọc `enterprise_email` — giữ nếu console tách riêng |
| Đăng nhập người dùng | (không cần quyền nghiệp vụ) | đăng nhập Lark vào hub |
| Hộp thư (KOL) | `mail:user_mailbox.message:send` · `:modify` · `:readonly` · `.subject:read` · `.body:read` · `.address:read` · `offline_access` | app KOL gửi/đọc thư mời KOL bằng hộp thư của người bấm |

**Bỏ hết phần còn lại**, đặc biệt mọi quyền `admin:*`, `approval:*`, `calendar:*`, `task:*`,
`okr:*`, `attendance:*`, `vc:*`, `minutes:*`, `wiki:*`, `sheets:*`, `docx:*` (không app nào gọi).

## Cách gỡ an toàn (anh Hùng làm — Claude không được đổi cài đặt bảo mật)

1. Mở `https://open.larksuite.com/app/cli_aa1a8ae21a78ded2/auth` (Permissions & Scopes)
   — kiểm tên app ở góc trên là **Marketing Hub** trước khi bấm gì (xem memory: đừng đoán app theo tên).
2. **Chụp màn hình danh sách hiện tại** để còn đường quay lại.
3. Batch Actions → bỏ chọn mọi quyền KHÔNG có trong bảng trên.
4. **Create Version → Publish.** Không phát hành thì không có hiệu lực.
5. Ngay sau đó chạy kiểm tra bản chạy thật:
   ```
   HUB_COOKIE="…" node lark-mkt-hub/test/kiem-ban-chay.js
   ```
   và mở thử: Kho media (xem ảnh), app Tài khoản (tìm người), một app có ảnh đính kèm,
   gửi thử tin ở app Chỉnh ảnh. Hỏng chỗ nào → thêm lại đúng quyền của chỗ đó (bảng trên ghi
   rõ quyền nào cho việc gì), phát hành lại.

## Chỗ còn chưa chắc 100%

- Cửa `get_attachments` / `append_attachments` (base/v3) mới, chưa rõ tên quyền chính xác —
  có thể cần thêm `docs:document.media:*` bên cạnh `base:record:*`. Thử sau khi gỡ.
- Kho media gọi `preview_download` / `preview_result` (không có trong tài liệu công khai) —
  nếu ảnh xem trước hỏng thì thêm `drive:drive:readonly`.
- Console bản quốc tế có thể vẫn hiện tên quyền kiểu cũ (`drive:drive`, `bitable:app`) thay
  cho `docs:*` / `base:*` — chọn tên nào console đang có.
