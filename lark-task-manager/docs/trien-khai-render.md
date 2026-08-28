# Triển khai lên Render.com (miễn phí)

Dùng cho giai đoạn thử nghiệm. Chuyển sang VPS sau này không phải sửa code.

---

## PHẦN A — Anh làm trên Lark Developer Console

<https://open.larksuite.com/app/cli_aa04305ecd385ed1>

### A1. Cấp quyền (Permissions & Scopes)

Đã kiểm: app **chưa có quyền đọc Base**, báo lỗi `99991672`. Thêm đủ 8 scope:

```
base:record:read
base:record:create
base:record:update
base:record:delete
base:field:read
drive:file:upload
drive:file:download
contact:user.base:readonly
```

### A2. Thêm Redirect URL (Security Settings)

Chưa có URL Render thì để trống, làm sau ở bước C3.

### A3. Phát hành

**Create Version** → điền số version → **Submit / Publish**.

> Cấp scope xong mà không phát hành thì quyền **chưa có hiệu lực**. Đây là chỗ hay sót nhất.

### A4. Chia sẻ Base cho app

Base nằm trong **wiki**, nên chia sẻ ở cấp Base là chưa đủ:

1. Mở knowledge space chứa Base `Tracking`
2. Thêm app **abc** (`cli_aa04305ecd385ed1`) làm thành viên, quyền **chỉnh sửa** (Full access)

Thiếu bước này sẽ báo `91403` dù đã cấp scope.

---

## PHẦN B — Đưa code lên GitHub

Render lấy code từ GitHub.

```bash
cd C:\Users\ASUS\.agents\lark-task-manager && git init && git add . && git commit -m "App quan ly cong viec Lark Base"
```

Đã có sẵn `.gitignore` loại trừ `.env`, `quyen.json`, `*.log` — **App Secret sẽ không bị đẩy lên**.

Tạo repo **Private** trên GitHub rồi:

```bash
git remote add origin https://github.com/<tài-khoản>/mkt-tracking.git && git branch -M main && git push -u origin main
```

> Để **Private**. Repo public nghĩa là cả cấu trúc Base và logic phân quyền lộ ra ngoài.

---

## PHẦN C — Tạo service trên Render

### C1. Tạo Web Service

<https://render.com> → đăng nhập bằng GitHub → **New → Web Service** → chọn repo vừa đẩy.

| Mục | Điền |
|---|---|
| Name | `mkt-tracking` |
| Region | **Singapore** |
| Runtime | Node |
| Build Command | *(để trống — app không có dependency)* |
| Start Command | `node server.js` |
| Instance Type | **Free** |

### C2. Biến môi trường

Mục **Environment** → thêm:

| Key | Value |
|---|---|
| `LARK_APP_ID` | `cli_aa04305ecd385ed1` |
| `LARK_APP_SECRET` | *(App Secret — dán trực tiếp vào Render, đừng để trong code)* |
| `PUBLIC_URL` | điền sau ở bước C3 |
| `SESSION_SECRET` | chuỗi ngẫu nhiên, sinh bằng lệnh dưới |
| `LARK_MANAGER_IDS` | `ou_f0d3514abf6b168bef076441f350c585` |
| `NODE_VERSION` | `22` |

Sinh `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `LARK_MANAGER_IDS` đặt bằng env var vì Render dùng ổ đĩa tạm — nút ⚙ ghi vào
> `quyen.json` sẽ mất sau mỗi lần deploy. Thêm quản lý thì sửa env var này,
> nhiều open_id cách nhau bởi dấu phẩy.

### C3. Nối vòng URL

Deploy xong Render cấp URL dạng `https://mkt-tracking.onrender.com`.

1. Quay lại Render → sửa `PUBLIC_URL` thành đúng URL đó → save (tự deploy lại)
2. Developer Console → **Security Settings** → Redirect URL thêm:
   `https://mkt-tracking.onrender.com/auth/callback`
3. Developer Console → **Web app** → Desktop + Mobile homepage:
   `https://mkt-tracking.onrender.com`
4. **Create Version** và phát hành lại

---

## PHẦN D — Kiểm tra

| Bước | Lệnh / thao tác | Mong đợi |
|---|---|---|
| 1 | Mở `https://mkt-tracking.onrender.com/healthz` | `{"ok":true,"mode":"api"}` |
| 2 | Mở trang chủ | Chuyển sang trang đăng nhập Lark |
| 3 | Đăng nhập tài khoản quản lý | 4 tab, có nút ⚙ |
| 4 | Nhờ một nhân sự đăng nhập | 1 tab, chỉ việc của họ |

`mode` trả về `cli` thay vì `api` nghĩa là thiếu `LARK_APP_ID`/`LARK_APP_SECRET`.

## Lỗi thường gặp

| Lỗi | Nguyên nhân |
|---|---|
| `99991672 ... scopes is required` | Chưa cấp scope, hoặc cấp rồi mà **chưa phát hành version** |
| `91403` | Chưa thêm app vào knowledge space (bước A4) |
| Trang trắng 30–60 giây | Gói Free đang ngủ, bình thường |
| `redirect_uri mismatch` | Redirect URL trong Console khác `PUBLIC_URL` |
| Phân quyền mất sau deploy | Dùng `LARK_MANAGER_IDS` thay cho nút ⚙ |

## Hạn chế của gói Free

- **Ngủ sau ~15 phút** không ai dùng → lần mở tiếp theo chờ 30–60 giây
- **Ổ đĩa tạm** → `quyen.json` không giữ được
- Có giới hạn giờ chạy mỗi tháng

Chuyển sang VPS thì hết cả ba, xem [trien-khai-server.md](trien-khai-server.md).

## Sau khi xong

**Reset App Secret** ở Developer Console nếu nó từng bị lộ (gửi qua chat, email,
commit nhầm), rồi cập nhật lại biến môi trường trên Render.
