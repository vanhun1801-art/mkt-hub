# Đưa Marketing Hub lên Render.com (lấy link công khai)

Kết quả: **một URL duy nhất** cho cả phòng, ai được cấp quyền thì đăng nhập Lark một
lần là dùng được cả ba base. Dữ liệu vẫn nằm nguyên trong Lark Base — Render chỉ là
nơi chạy app và cấp domain công khai.

```
                    ┌─────────────── Render (1 web service) ───────────────┐
người dùng ──HTTPS──▶│ lark-mkt-hub :10000  ← đăng nhập Lark ở đây          │
                    │   ├─ 127.0.0.1:5173  Bảng công việc                  │──▶ Lark Base
                    │   ├─ 127.0.0.1:5174  Lịch tác nghiệp                 │    (API app)
                    │   └─ 127.0.0.1:5176  Quản lý quảng cáo               │
                    └─────────────────────────────────────────────────────┘
```

Hub tự bật ba app con trong cùng container rồi proxy vào một cổng, nên **chỉ một
service, một URL, một lần đăng nhập** — không phải trả tiền/ cấu hình ba lần.

---

## PHẦN A — Lark Developer Console

App đang dùng: <https://open.larksuite.com/app/cli_aa04305ecd385ed1>

### A1. Quyền (Permissions & Scopes)

Cần đủ 8 scope (app Bảng công việc đã cấp trước đó, kiểm lại cho chắc):

```
base:record:read      base:record:create    base:record:update    base:record:delete
base:field:read       drive:file:upload     drive:file:download   contact:user.base:readonly
```

### A2. Chia sẻ CẢ BA base cho app

Đây là bước hay sót nhất. App phải là thành viên **quyền chỉnh sửa** của:

| Base | Nơi thêm app |
|---|---|
| Tracking (Bảng công việc) | Base nằm trong **wiki** → thêm app vào **knowledge space**, không phải chỉ ở Base |
| Lịch tác nghiệp | mở Base → Share → thêm app |
| Quản lý quảng cáo | mở Base → Share → thêm app |

Thiếu bước này: lỗi `91403`. Cấp scope mà chưa phát hành version: lỗi `99991672`.

### A3. Phát hành

**Create Version** → **Submit / Publish**. Cấp quyền xong mà không phát hành thì
quyền **chưa có hiệu lực**.

---

## PHẦN B — Đưa code lên GitHub

Repo chứa **cả bốn app** (hub + 3 module) vì hub cần các thư mục anh em ngay cạnh nó.

```bash
cd C:\Users\ASUS\.agents && git init && git add . && git commit -m "Marketing Hub - sieu ung dung phong Marketing"
```

`.gitignore` ở gốc theo kiểu "chặn hết rồi mở đúng bốn thư mục app", và chặn sẵn
`ket-noi.json` · `quyen.json` · `muc-tieu.json` · `.env` · `*.log` — **App Secret và
token quảng cáo không bị đẩy lên**. Kiểm lại trước khi push:

```bash
git ls-files | grep -Ei "ket-noi|quyen|env|secret" || echo "sach - khong co bi mat nao"
```

Tạo repo **Private** trên GitHub (tên gợi ý `mkt-hub`) rồi:

```bash
git remote add origin https://github.com/<tài-khoản>/mkt-hub.git && git branch -M main && git push -u origin main
```

> Để **Private**. Public là lộ cấu trúc Base, field ID và toàn bộ logic phân quyền.

---

## PHẦN C — Tạo service trên Render

### C1. Web Service

<https://render.com> → **New → Web Service** → chọn repo `mkt-hub`.

| Mục | Điền |
|---|---|
| Name | `mkt-hub` |
| Region | **Singapore** |
| Root Directory | `lark-mkt-hub` |
| Runtime | Node |
| Build Command | *(để trống — không có dependency npm)* |
| Start Command | `node server.js` |
| Instance Type | Free (hoặc Starter nếu muốn không ngủ) |

Repo đã có `render.yaml` ở gốc, nên có thể dùng **New → Blueprint** cho nhanh.

### C2. Biến môi trường

| Key | Value |
|---|---|
| `LARK_APP_ID` | `cli_aa04305ecd385ed1` |
| `LARK_APP_SECRET` | *(App Secret — dán trực tiếp vào Render)* |
| `PUBLIC_URL` | điền sau ở bước C3 |
| `SESSION_SECRET` | chuỗi ngẫu nhiên (lệnh dưới) |
| `LARK_MANAGER_IDS` | `ou_f0d3514abf6b168bef076441f350c585` (nhiều người: cách bằng dấu phẩy) |
| `NODE_VERSION` | `22` |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Hub truyền toàn bộ biến này xuống ba app con, nên **chỉ khai một lần**. Thấy đủ
`LARK_APP_ID` + `LARK_APP_SECRET` là cả bốn app tự chuyển sang chế độ `api`.

### C3. Nối vòng URL

Deploy xong Render cấp URL dạng `https://mkt-hub.onrender.com`.

1. Render → sửa `PUBLIC_URL` thành đúng URL đó → Save (tự deploy lại)
2. Developer Console → **Security Settings** → Redirect URL thêm:
   `https://mkt-hub.onrender.com/auth/callback`
3. Developer Console → **Web app** → Desktop + Mobile homepage: `https://mkt-hub.onrender.com`
4. **Create Version** và phát hành lại

---

## PHẦN D — Phân quyền ai được dùng

Hai lớp, đừng lẫn:

| Lớp | Quyết định | Đặt ở đâu |
|---|---|---|
| **Ai mở được app** | vào được hay không | Developer Console → **Availability** (phạm vi khả dụng): chọn phòng Marketing hoặc từng người |
| **Vai trong app** | quản lý hay nhân sự | biến `LARK_MANAGER_IDS` trên Render |

Người không nằm trong Availability: đăng nhập được nhưng app không đọc được dữ liệu
của họ. Người nằm ngoài `LARK_MANAGER_IDS`: vào với vai nhân sự — chỉ thấy việc của
mình, không thấy tab quản lý.

Lấy `open_id` của một người: mở app Bảng công việc → nút **Quyền**, hoặc gọi
`lark-cli contact +user-get --email <email>`.

---

## PHẦN E — Kiểm tra sau khi deploy

| Bước | Thao tác | Mong đợi |
|---|---|---|
| 1 | `https://mkt-hub.onrender.com/healthz` | `{"ok":true,...}` — không cần đăng nhập |
| 2 | Mở trang chủ | Chuyển sang trang đăng nhập Lark |
| 3 | Đăng nhập bằng tài khoản quản lý | Trang Tổng quan chung, panel 3 base |
| 4 | Mở lần lượt ba base | Có dữ liệu, không đòi đăng nhập lại |
| 5 | Nhờ một nhân sự đăng nhập | Chỉ thấy việc của họ, không có tab quản lý |
| 6 | ⚙ Cài đặt trong hub | Ba module trạng thái "Đang chạy" |

---

## Hạn chế của gói Free (và cách sống chung)

| Hạn chế | Ảnh hưởng | Xử lý |
|---|---|---|
| Ngủ sau ~15 phút không ai dùng | lần mở tiếp theo chờ 30–60s (còn phải chờ 3 app con bật) | Starter $7/tháng là hết ngủ |
| RAM 512MB | 4 tiến trình Node ~300MB — vừa đủ | nếu bị OOM: đặt `HUB_AUTOSTART=0` rồi bật từng module trong Cài đặt |
| Ổ đĩa tạm | `quyen.json`, `muc-tieu.json`, `ket-noi.json` mất sau mỗi deploy | quản lý đặt bằng `LARK_MANAGER_IDS`; mục tiêu CPA và token quảng cáo phải nhập lại (hoặc chuyển sang VPS) |

**Đồng bộ quảng cáo tự động** (Meta/TikTok/Google) cần `ket-noi.json` chứa token — file
này không lên GitHub và cũng không sống qua deploy. Trên Render cứ dùng tab **Kết nối &
Đồng bộ** để nhập CSV thủ công, hoặc chuyển app quảng cáo sang VPS nếu muốn hẹn giờ.

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân |
|---|---|
| `99991672 ... scopes is required` | chưa cấp scope, hoặc cấp rồi mà **chưa phát hành version** |
| `91403` | chưa thêm app vào knowledge space / Base (bước A2) |
| `redirect_uri mismatch` | Redirect URL trong Console khác `PUBLIC_URL` |
| Đăng nhập xong vẫn quay lại trang login | thiếu `SESSION_SECRET`, hoặc `PUBLIC_URL` sai giao thức (phải `https://`) |
| Panel báo module **Lỗi** | mở ⚙ Cài đặt → Log để xem stderr thật của app con |
| Trang trắng 30–60 giây | gói Free đang ngủ, bình thường |
| Số liệu trống mà không báo lỗi | app chưa được chia sẻ Base (bước A2) |

## Sau khi xong

**Reset App Secret** ở Developer Console nếu nó từng bị gửi qua chat/email, rồi cập
nhật lại biến môi trường trên Render.
