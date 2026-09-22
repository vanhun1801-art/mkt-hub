# Bảo mật Marketing Hub — đối chiếu từng mục

Anh Hùng đưa danh sách 6 nhóm ngày 22/09/2026. Đây là đối chiếu **từng mục**:
đã có gì, vừa làm gì, mục nào **không áp dụng được** cho kiến trúc này và vì
sao, mục nào **còn nợ**.

Nguyên tắc khi đọc bảng: *"không áp dụng"* ở đây không phải cách nói tránh. Hệ
này không có SQL, không có database riêng, không có server tự quản — nên mấy
mục viết cho một web app LAMP cổ điển thật sự không có chỗ để áp vào.

---

## 1. Đăng nhập & phiên làm việc

| Mục | Trạng thái |
|---|---|
| Hash mật khẩu | **Đã làm** — `crypto.scrypt`, xem mục *Vì sao không Argon2/bcrypt* bên dưới |
| Rate limit đăng nhập | **Đã làm** — [chan-tan-suat.js](../chan-tan-suat.js) |
| Hạn phiên, huỷ phiên khi đăng xuất | **Đã làm** — xem *Huỷ phiên* bên dưới |
| Cookie HttpOnly / Secure / SameSite | **Đã có từ trước** — [auth.js](../auth.js) `setSession` |

### Vì sao `scrypt` chứ không Argon2/bcrypt

Cả hai đều là thư viện npm. Kho này giữ luật **không dependency**:
`buildCommand: ""` trên Render, không có `node_modules`, deploy xong trong vài
giây. Thêm npm là đổi cách build và cách deploy của cả 10 app.

`scrypt` có sẵn trong Node, **cùng họ memory-hard với Argon2** — bắt kẻ dò mật
khẩu phải trả RAM chứ không chỉ trả CPU, đó mới là thứ chặn được GPU — và nằm
trong danh sách OWASP khuyến nghị cho lưu mật khẩu. Tham số: `N=2^15, r=8, p=1`,
muối 16 byte ngẫu nhiên, khoá 32 byte. Đo trên máy: **63ms/lần**.

Chuỗi lưu xuống Base mang theo tham số của chính nó
(`scrypt$1$32768$8$1$muối$băm`), nên sau này nâng `N` vẫn đọc được bản băm cũ —
không ai bị khoá ra ngoài vì mình đổi tham số. Có phép thử canh đúng chuyện đó.

### Rate limit — đếm theo HAI khoá

Chỉ đếm theo IP thì đổi IP là qua. Chỉ đếm theo email thì một máy vẫn quét được
cả danh sách email, mỗi email vài lần. Nên đếm cả hai:

| Đường | Ngưỡng |
|---|---|
| đăng nhập — theo IP | 6 lần hỏng / 10 phút |
| đăng nhập — theo email | 6 lần hỏng / 10 phút |
| đăng ký — theo IP | 3 lần / 1 giờ (tính cả lần thành công) |

Chỉ đếm **lần hỏng**, không đếm lần gọi — nên một văn phòng chung IP không tự
khoá nhau khi đông người đăng nhập cùng lúc. Chờ tăng dần: 1 → 2 → 4 → 8 phút,
trần 15 phút.

`x-forwarded-for` lấy **phần tử đầu** (Render ghi IP thật ở đó); các phần tử sau
client tự bịa được nên không tin.

### Huỷ phiên

Cookie của hub **tự chứng thực** (ký HMAC), server không giữ kho phiên. Nên
"đăng xuất" vốn chỉ xoá cookie ở máy người dùng — ai đã sao được chuỗi cookie
thì dùng tiếp tới ngày hết hạn. Đúng mục anh Hùng nêu.

Đã vá bằng hai đường, vì hai loại tài khoản có chỗ lưu khác nhau:

- **Tài khoản mật khẩu** — cookie mang `iat` (cấp lúc nào), hàng Base mang cột
  `Phiên từ`. `iat < Phiên từ` là cookie chết. Ghi trên Base nên **sống qua
  deploy và restart**. Đăng xuất, khoá, từ chối, đổi mật khẩu đều đẩy mốc này.
- **Tài khoản Lark** — danh sách `sid` trong RAM. Đăng xuất huỷ **đúng phiên
  đó**, không đá phiên của chính người đó trên máy khác.

> **Giới hạn đã biết, ghi ra để không ai tưởng đã xong:** danh sách trong RAM
> trắng sau mỗi lần restart, nên cookie Lark đã đăng xuất lại dùng được. Vá
> triệt để thì phải có hàng Base cho từng người Lark — phải đụng vào bảng Phân
> quyền mà cả 10 app đang đọc, nên chưa làm. Trong lúc chưa có, thứ thật sự bảo
> vệ là `Max-Age` của cookie.

---

## 2. Bí mật & dữ liệu nhạy cảm

| Mục | Trạng thái |
|---|---|
| Dọn log in token/API key | **Đã sạch** — rà cả kho, không có chỗ nào in token/secret |
| Không để secret ở frontend | **Đúng vậy** — mọi khoá nằm ở biến môi trường Render, frontend chỉ gọi API cùng nguồn |

Một điều **chưa đạt** và nó là rủi ro lớn nhất còn lại: app Lark Marketing Hub
đang giữ **482 scope**, gồm cả `admin:app.enable:write`, `admin:app.visibility`,
`admin:ent_email_password` — quyền quản trị toàn công ty. Hub thật sự chỉ cần
khoảng 9. Từ 19/09 cả hệ chỉ còn một app, nên **một App Secret duy nhất vừa mở 9
Base vừa cầm quyền admin cả tenant**. Xem [gop-ve-mot-app.md](gop-ve-mot-app.md).

---

## 3. Phân quyền & kiểm soát truy cập

| Mục | Trạng thái |
|---|---|
| Chống IDOR | **Đã có** — không có đường nào nhận id người dùng từ URL; danh tính lấy từ cookie đã ký, hub tự quyết rồi truyền xuống app con qua header |
| Bảo vệ trang admin ở backend | **Đã có** — `chiQuanLy()` chặn ở server, không phải chỉ ẩn nút |

**Luật mới, chốt bằng phép thử:** tài khoản mật khẩu **không bao giờ làm quản lý
được**. Ai cũng tự đăng ký được và tự chọn email — không chặn thì chỉ cần đăng
ký bằng đúng email đang nằm trong `LARK_MANAGER_EMAILS` là có toàn quyền. Quản
lý luôn là người công ty, mà người công ty thì có Lark, nên luật này không lấy
mất của ai cái gì.

**Duyệt không cấp quyền gì cả.** Duyệt xong họ đăng nhập được, nhưng chỉ thấy
base mở cho cả phòng. Muốn họ thấy gì thì sang Phân quyền khai tiếp — màn duyệt
nói thẳng câu đó trên màn hình.

---

## 4. Dữ liệu đầu vào & lỗi

| Mục | Trạng thái |
|---|---|
| Kiểm ở server | **Đã có** — mọi đường ghi đều kiểm lại ở server; email, độ dài mật khẩu, trạng thái hợp lệ đều xét ở backend |
| SQL Injection | **Không áp dụng** — hệ không có SQL. Dữ liệu nằm trên Lark Base, đọc/ghi qua API có tham số |
| Giới hạn tệp tải lên | **Đã có** — 8 KB form đăng nhập · 1 MB body · 2 MB ảnh · 20 MB tệp · 60 MB video |
| Ẩn stack trace | **Đã có** — rà cả kho, không chỗ nào trả `e.stack` ra ngoài |

Thêm ở lần này: chống CSRF cho hai đường đăng nhập/đăng ký bằng kiểm `Origin`.
`SameSite=Lax` đã chặn cookie đi kèm POST chéo nguồn, nhưng hai đường này không
dựa vào cookie — chúng **tạo ra** phiên, nên phải kiểm riêng.

---

## 5. Mạng & cơ sở dữ liệu

| Mục | Trạng thái |
|---|---|
| Bắt buộc HTTPS | **Đã có** — Render tự ép, cộng HSTS 1 năm |
| Security headers | **Đã có** — CSP `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS |
| CORS chặt | **Đã có** — chỉ đúng một đường webhook công khai có `*`, và đường đó có khoá riêng, chỉ POST, không mang danh tính |
| Đóng cổng database | **Không áp dụng** — không có database nào để mở |
| Quyền tối thiểu cho tài khoản DB | **Không áp dụng** theo nghĩa DB; nhưng bản tương đương là **scope của app Lark**, và mục đó đang **chưa đạt** (xem nhóm 2) |

---

## 6. Hạ tầng, chống tấn công, giám sát

| Mục | Trạng thái |
|---|---|
| WAF / chống bot | **Chưa có.** Render free không gắn Cloudflare trước `*.onrender.com` được — phải có tên miền riêng. Rate limit ở tầng app đang gánh phần này |
| Backup | **Base của Lark tự giữ lịch sử bản ghi.** Không có DB riêng để backup |
| Giám sát & cảnh báo | **Chưa có.** Render free có Logs và Metrics nhưng không có cảnh báo tự động |

---

## Còn nợ, theo thứ tự nên làm

1. **Gỡ 482 scope của app Lark xuống còn ~9.** Rủi ro lớn nhất còn lại. Gỡ ẩu là
   gãy cả 9 app con, nên phải grep mọi endpoint Lark đang gọi trước.
2. **Huỷ phiên cho tài khoản Lark sống qua restart** (xem giới hạn ở nhóm 1).
3. **Cảnh báo khi đăng nhập hỏng tăng đột biến.** Hiện `chan-tan-suat.js` đã đếm
   sẵn — chỉ thiếu chỗ đẩy con số đó ra một tin Lark.
4. **Tên miền riêng + Cloudflare**, nếu muốn có WAF thật.

---

## Bật đăng nhập mật khẩu

```bash
node thiet-lap/tao-bang-tai-khoan.js          # xem trước, không ghi
node thiet-lap/tao-bang-tai-khoan.js --that   # tạo thật
```

Rồi Render → Environment → `HUB_TK_TABLE = <table_id vừa in ra>`.

Chưa khai biến đó thì tính năng **tắt hẳn**: trang đăng nhập chỉ hiện nút Lark,
không có ô mật khẩu, không có trang đăng ký. Cố ý fail closed — đây là cửa duy
nhất của hệ mở ra internet cho người ngoài công ty.

Duyệt người đăng ký: **Cài đặt → Tài khoản ngoài Lark**.
