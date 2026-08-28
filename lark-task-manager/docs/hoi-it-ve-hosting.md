# Cần hỏi IT / nhà cung cấp hosting 3 câu

App viết bằng **Node.js**, chạy như một tiến trình thường trực — khác website
PHP/WordPress chỉ cần upload file rồi thôi. Nên phải xác nhận hosting có chạy
được kiểu đó không.

Gửi nguyên 3 câu này:

> 1. Hosting công ty đang dùng là **shared hosting** hay **VPS / Cloud Server**?
> 2. Có **đăng nhập SSH** được không? (nếu có, cho xin IP + user)
> 3. Có chạy được **ứng dụng Node.js thường trực** (long-running process) không?
>    Nếu là cPanel thì trong trang quản lý có mục **"Setup Node.js App"** không?

## Hoặc anh tự nhìn ra trong 2 phút

Đăng nhập vào trang quản lý hosting rồi đối chiếu:

| Thấy gì | Là loại gì | Kết luận |
|---|---|---|
| Giao diện cPanel / DirectAdmin / Plesk, có File Manager, phpMyAdmin | Shared hosting | Tìm mục **Setup Node.js App**. Có → dùng được. Không → phải thuê VPS |
| Nhà cung cấp đưa **IP + mật khẩu root**, anh vào bằng PuTTY / Terminal | VPS / Cloud Server | **Dùng được ngay**, không tốn thêm |
| Chỉ thấy trang quản trị WordPress | Đó là website, không phải hosting | Cần hỏi IT chỗ đặt website |

## Yêu cầu tối thiểu nếu phải thuê mới

- 1 GB RAM, 1 vCPU, 10 GB ổ cứng — dư sức
- Ubuntu 22.04 hoặc 24.04
- Có SSH
- Giá tham khảo: 100–200 nghìn/tháng (Vultr, DigitalOcean, hoặc nhà cung cấp
  trong nước như Vinahost, AZDIGI, TinoHost)

## Còn cần chuẩn bị thêm

1. **`app_secret`** của app `cli_aa04305ecd385ed1` — lấy tại
   Developer Console → Credentials & Basic Info → App Secret.
   Đây là chìa khoá đọc/ghi toàn bộ Base, **không gửi qua chat công khai**.
2. **Bản ghi DNS** cho `mkt.rootytrip.com` → trỏ về IP server
   (bản ghi loại A). Ai quản lý DNS của `rootytrip.com` thì nhờ người đó thêm.
