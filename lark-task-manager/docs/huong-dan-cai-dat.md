# Hướng dẫn cài đặt cho nhân sự triển khai

App chạy trên **máy của bạn** và đăng nhập bằng **tài khoản Lark của bạn**.
Nhờ vậy bạn chỉ thấy đúng việc của mình. Làm một lần, mất khoảng 10 phút.

---

## Bước 1 — Cài Node.js

Tải bản **LTS** tại <https://nodejs.org> rồi cài như phần mềm thường
(bấm Next đến hết).

Kiểm tra: mở **PowerShell** (bấm Start, gõ `powershell`) và chạy:

```bash
node -v
```

Hiện ra số phiên bản (ví dụ `v22.x.x`) là xong.

## Bước 2 — Cài lark-cli

```bash
npm install -g @larksuite/cli
```

## Bước 3 — Đăng nhập Lark

```bash
lark-cli auth login
```

Trình duyệt mở ra, đăng nhập bằng **tài khoản Lark của công ty** rồi bấm đồng ý.
Kiểm tra lại:

```bash
lark-cli auth status
```

Thấy tên mình ở dòng `userName` là đúng.

> Đăng nhập bằng tài khoản nào thì app hiện việc của người đó. Đăng nhập sai
> tài khoản sẽ không thấy việc của mình.

## Bước 4 — Lấy thư mục app

Copy cả thư mục `lark-task-manager` từ người quản lý (qua Lark, USB hay ổ chia
sẻ) và đặt vào máy mình, ví dụ `D:\lark-task-manager`.

Không cần chạy `npm install` — app không dùng thư viện ngoài.

## Bước 5 — Chạy app

Vào thư mục vừa copy, **double-click `start.bat`**.
Một cửa sổ đen mở ra và trình duyệt tự vào <http://localhost:5173>.

Hoặc chạy bằng lệnh:

```bash
node server.js
```

Cửa sổ đen phải để mở trong lúc dùng app. Đóng nó là app tắt.

---

## Dùng hằng ngày

Mỗi lần cần dùng thì double-click `start.bat`.

Bạn sẽ thấy:

- **Công việc mới** — bấm `Bắt đầu làm` khi nhận việc
- **Cần làm lại** — việc bị người order trả về
- **Cần hỗ trợ** — việc người khác phụ trách, bạn làm cùng
- **Đang tiến hành** — bấm `Hoàn thành` khi xong
- **Đang trễ deadline** — ưu tiên xử lý trước

Trước khi bấm `Hoàn thành`, **phải đính tệp sản phẩm hoặc dán link kết quả** —
đây là căn cứ để người order nghiệm thu và chấm điểm.

Thông tin sai hoặc deadline không khả thi: bấm `Yêu cầu điều chỉnh`,
**đừng tự sửa** ô của người order.

Cần đặt việc cho người khác: bấm `+ Đặt việc`.

---

## Gắn vào Lark cho tiện

Để mở app ngay trong Lark thay vì trình duyệt: Developer Console → app
**abc** (`cli_aa04305ecd385ed1`) → **Web app** → Desktop homepage điền
`http://localhost:5173`, chọn **New tab in Lark**.

Cách này chỉ chạy khi `start.bat` đang mở trên chính máy bạn.

---

## Gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| Trang trắng / không vào được localhost:5173 | Cửa sổ đen còn mở không? Chạy lại `start.bat` |
| `Không tải được dữ liệu` | Phiên đăng nhập hết hạn → chạy `lark-cli auth login` |
| Không thấy việc nào | Đăng nhập sai tài khoản → `lark-cli auth status` xem tên; hoặc bảng Tracking chưa điền tên bạn ở cột **Phụ trách chính** |
| `EADDRINUSE ... 5173` | App đã chạy rồi — mở <http://localhost:5173> |
| `lark-cli` không phải là lệnh | Làm lại Bước 2, rồi đóng và mở lại PowerShell |
| Cần xem việc toàn phòng | Đó là quyền quản lý — nhờ quản lý cấp trong app |

Không tự xử được thì nhắn quản lý kèm ảnh chụp cửa sổ đen.
