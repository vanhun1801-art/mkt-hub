# Marketing Hub — phòng Marketing Rooty Trip Phú Quốc

Bốn app Node thuần (không dependency npm) làm việc với Lark Base:

| Thư mục | Là gì | Cổng khi chạy máy |
|---|---|---|
| [`lark-mkt-hub`](lark-mkt-hub/) | **Lớp vỏ**: panel base, Tổng quan chung, dải nhiệt tải nhân sự, đăng nhập Lark. Tự bật + proxy ba app dưới. | 5180 |
| [`lark-task-manager`](lark-task-manager/) | Bảng công việc — Base *Tracking* | 5173 |
| [`lark-lich-tac-nghiep`](lark-lich-tac-nghiep/) | Lịch tác nghiệp | 5174 |
| [`lark-ads-manager`](lark-ads-manager/) | Quản lý quảng cáo đa nền tảng | 5176 |

## Chạy trên máy

```bash
cd lark-mkt-hub && node server.js
```

Mở <http://localhost:5180>. Hub tự bật ba app còn lại; dữ liệu đọc qua phiên
`lark-cli` của máy (không cần đăng nhập trong app).

## Chạy server chung (Render / VPS)

Chỉ deploy **một** service: `lark-mkt-hub`. Có đủ `LARK_APP_ID` + `LARK_APP_SECRET`
là cả bốn app tự chuyển sang chế độ `api` — đọc/ghi Base bằng credential của app,
danh tính từng người do hub đăng nhập Lark rồi truyền xuống module qua header.

Hướng dẫn từng bước: [lark-mkt-hub/docs/trien-khai-render.md](lark-mkt-hub/docs/trien-khai-render.md)

## Hai chế độ, một bộ code

| | `cli` (máy cá nhân) | `api` (server chung) |
|---|---|---|
| Đọc/ghi Base | phiên `lark-cli` của máy | app credentials (`tenant_access_token`) |
| Danh tính người dùng | tài khoản đang đăng nhập lark-cli | mỗi người đăng nhập Lark ở hub |
| Chọn chế độ | mặc định | tự bật khi có `LARK_APP_ID` + `LARK_APP_SECRET` |

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
```
