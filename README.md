# Marketing Hub — phòng Marketing Rooty Trip Phú Quốc

Năm app Node thuần (không dependency npm) làm việc với Lark Base:

| Thư mục | Là gì | Cổng khi chạy máy |
|---|---|---|
| [`lark-mkt-hub`](lark-mkt-hub/) | **Lớp vỏ**: panel base, Tổng quan chung, dải nhiệt tải nhân sự, đăng nhập Lark. Tự bật + proxy ba app dưới. | 5180 |
| [`lark-task-manager`](lark-task-manager/) | Bảng công việc — Base *Tracking* | 5173 |
| [`lark-lich-tac-nghiep`](lark-lich-tac-nghiep/) | Lịch tác nghiệp | 5174 |
| [`lark-ads-manager`](lark-ads-manager/) | Quản lý quảng cáo đa nền tảng | 5176 |
| [`lark-ota-manager`](lark-ota-manager/) | Booking OTA — nhận webhook từ Klook/KKday/GYG/Ctrip/WAUG/MyRealTrip/Viator rồi tự ghi vào bảng `Bookings` | 5177 |

## Chạy trên máy

```bash
cd lark-mkt-hub && node server.js
```

Mở <http://localhost:5180>. Hub tự bật bốn app còn lại; dữ liệu đọc qua phiên
`lark-cli` của máy (không cần đăng nhập trong app).

## Chạy server chung (Render / VPS)

Chỉ deploy **một** service: `lark-mkt-hub`. Có đủ `LARK_APP_ID` + `LARK_APP_SECRET`
là cả năm app tự chuyển sang chế độ `api` — đọc/ghi Base bằng credential của app,
danh tính từng người do hub đăng nhập Lark rồi truyền xuống module qua header.

Hướng dẫn từng bước: [lark-mkt-hub/docs/trien-khai-render.md](lark-mkt-hub/docs/trien-khai-render.md)

## Hai chế độ, một bộ code

| | `cli` (máy cá nhân) | `api` (server chung) |
|---|---|---|
| Đọc/ghi Base | phiên `lark-cli` của máy | app credentials (`tenant_access_token`) |
| Danh tính người dùng | tài khoản đang đăng nhập lark-cli | mỗi người đăng nhập Lark ở hub |
| Chọn chế độ | mặc định | tự bật khi có `LARK_APP_ID` + `LARK_APP_SECRET` |

## Webhook OTA — đường công khai duy nhất

App Booking OTA nhận booking do OTA gọi vào, mà máy của Klook/Viator không đăng
nhập Lark được. Nên hub mở **một** đường đi vòng ngoài cổng đăng nhập:

```
POST https://<hub>/ota/webhook/<kênh>      kênh: klook | kkday | gyg | ctrip | waug | myrealtrip | viator
header: x-ota-secret: <OTA_WEBHOOK_SECRET>
```

Đường này chỉ nhận POST, chỉ chuyển tới module `ota`, và **không** gửi header
danh tính xuống module — không ai mạo danh quản lý qua đó được. Chính module bắt
buộc kiểm `OTA_WEBHOOK_SECRET`; chưa khai biến đó thì nó chỉ nhận webhook từ
`127.0.0.1`. Thêm `?dryRun=1` để soi mapping mà không ghi gì.

Chi tiết: [lark-ota-manager/README.md](lark-ota-manager/README.md)

## Bí mật

Không có secret nào trong repo. `.gitignore` ở gốc chặn sẵn `.env`, `ket-noi.json`
(token Meta/TikTok/Google), `quyen.json`, `muc-tieu.json`, `*.log`. Mọi khoá đặt bằng
biến môi trường.

## Kiểm thử

```bash
cd lark-mkt-hub && node server.js          # cửa sổ 1
cd lark-mkt-hub && node test/api.test.js   # cửa sổ 2 — 66 phép thử, chỉ đọc
cd lark-lich-tac-nghiep && node test/api.test.js
cd lark-ads-manager && node test/api.test.js
cd lark-ota-manager && node test/chuanhoa.test.js   # thuần, không cần server
cd lark-ota-manager && node test/api.test.js
```
