# Triển khai lên server — `mkt.rootytrip.com`

Đưa app từ chạy local sang web app thực thụ: một địa chỉ cho cả phòng, mỗi
người đăng nhập bằng tài khoản Lark của mình.

Code đã sẵn sàng cho việc này. App có **hai chế độ**, chọn tự động theo biến
môi trường:

| Chế độ | Khi nào | Nhận diện người dùng | Đọc/ghi Base |
|---|---|---|---|
| `cli` | mặc định, chạy local | phiên `lark-cli` của máy | qua `lark-cli` |
| `api` | có `LARK_APP_ID` + `LARK_APP_SECRET` | đăng nhập Lark, cookie phiên | Open API bằng `tenant_access_token` |

Không cần sửa code. Giao diện, quy tắc, `quyen.json` giữ nguyên.

---

## Bước 1 — Cấu hình app trên Developer Console

App `cli_aa04305ecd385ed1`, tại <https://open.larksuite.com/app/cli_aa04305ecd385ed1>

**Credentials & Basic Info** → copy **App Secret**, cất kỹ.

**Permissions & Scopes** → thêm:

```
base:record:create
base:record:read
base:record:update
base:record:delete
base:field:read
base:table:read
drive:file:upload
drive:file:download
contact:user.base:readonly
```

**Security Settings** → **Redirect URL** thêm đúng chuỗi:

```
https://mkt.rootytrip.com/auth/callback
```

**Web app** → Desktop homepage đổi từ `http://localhost:5173` sang
`https://mkt.rootytrip.com`, chọn **New tab in Lark**.
Mobile homepage điền cùng địa chỉ (giờ điện thoại vào được rồi).

Cuối cùng **Create Version** và phát hành.

## Bước 2 — Chia sẻ Base cho app

Đây là bước hay quên nhất. Base nằm trong **wiki**, nên chia sẻ ở cấp Base là
chưa đủ.

1. Mở knowledge space chứa Base `Tracking`
2. Thêm app `abc` (`cli_aa04305ecd385ed1`) làm **thành viên**, quyền **chỉnh sửa**
3. Kiểm: sau khi chạy server, mở `/api/tasks` — trả 200 kèm danh sách là được.
   Báo lỗi `91403` hoặc `NOTEXIST` nghĩa là app chưa được chia sẻ.

## Bước 3 — DNS

Thêm bản ghi A cho `rootytrip.com`:

```
mkt    A    <IP server>
```

Chờ 5–30 phút. Kiểm bằng `nslookup mkt.rootytrip.com`.

## Bước 4 — Cài trên server (Ubuntu)

```bash
sudo apt update && sudo apt install -y nodejs npm
sudo npm install -g pm2
```

Cần Node ≥ 18. Bản Ubuntu cũ cài Node cũ thì dùng NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

Copy thư mục `lark-task-manager` lên server, ví dụ `/opt/lark-task-manager`.
Không cần `npm install` — app không có dependency.

## Bước 5 — Biến môi trường

Tạo `/opt/lark-task-manager/.env`:

```bash
LARK_APP_ID=cli_aa04305ecd385ed1
LARK_APP_SECRET=<app secret lấy ở Bước 1>
PUBLIC_URL=https://mkt.rootytrip.com
SESSION_SECRET=<chuỗi ngẫu nhiên, xem lệnh dưới>
PORT=5173
```

Sinh `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Khoá quyền đọc file:

```bash
chmod 600 /opt/lark-task-manager/.env
```

Server tự kiểm khi khởi động — thiếu biến nào sẽ báo tên biến đó rồi dừng,
không chạy nửa vời.

## Bước 6 — Chạy thường trực

```bash
cd /opt/lark-task-manager && pm2 start server.js --name mkt-tracking --env-file .env
```

```bash
pm2 save && pm2 startup
```

Lệnh `pm2 startup` in ra một dòng lệnh — chạy dòng đó để app tự bật lại khi
server khởi động lại.

Xem log: `pm2 logs mkt-tracking`

## Bước 7 — HTTPS

Caddy tự xin và gia hạn chứng chỉ, không phải cấu hình gì thêm:

```bash
sudo apt install -y caddy
```

Sửa `/etc/caddy/Caddyfile` thành đúng 3 dòng:

```
mkt.rootytrip.com {
    reverse_proxy localhost:5173
}
```

```bash
sudo systemctl reload caddy
```

Mở <https://mkt.rootytrip.com> — phải tự chuyển sang trang đăng nhập Lark.

---

## Kiểm tra sau khi lên

| Việc | Mong đợi |
|---|---|
| Mở `/` khi chưa đăng nhập | Chuyển sang `/auth/login` |
| Gọi `/api/meta` khi chưa đăng nhập | `401 NO_SESSION` |
| Đăng nhập bằng tài khoản quản lý | Thấy 4 tab, có nút ⚙ |
| Đăng nhập bằng tài khoản nhân sự | Chỉ 1 tab, không có ⚙, chỉ thấy việc của mình |
| Nhân sự gọi `POST /api/tasks` kèm `owner` | `403 FIELD_LOCKED` |
| Hoàn thành việc chưa có tệp/link | `422 PROOF_REQUIRED` |

Bốn chốt cuối đã được kiểm ở bản local và **nằm ở server**, không phải ẩn nút —
nên chỉ cần tầng đăng nhập đúng là chúng chạy đúng.

## Bảo mật

- `.env` chứa `app_secret` = chìa khoá toàn bộ Base công việc của phòng.
  `chmod 600`, không commit, không gửi qua chat.
- Khoá đăng nhập SSH bằng key, tắt đăng nhập bằng mật khẩu.
- Cookie phiên ký bằng HMAC-SHA256, hết hạn sau 7 ngày (`SESSION_DAYS`).
  Đổi `SESSION_SECRET` là tất cả phiên hiện có mất hiệu lực.
- Muốn chặt hơn: giới hạn IP văn phòng ở tầng Caddy.

## Quay về chạy local

Bỏ `LARK_APP_ID` / `LARK_APP_SECRET` là app tự về chế độ `cli` như cũ.
Hai chế độ dùng chung một bộ code.
