# Rooty Trip · Lịch tác nghiệp

Giao diện web đọc/ghi trực tiếp Lark Base **Lịch tác nghiệp**, có hai tầng quyền:
**quản lý** (toàn cảnh + duyệt) và **nhân sự** (lịch của mình + đăng ký lịch mới).

- Base: `U8bAbfnwgalWgDsEU11lpHfPgTb` · Table: `tblwfl1sEXHI9HOp`
- Không có dependency npm. Chỉ cần Node.js và `lark-cli` đã đăng nhập.

## Chạy

```bash
node server.js
```

Hoặc nháy đúp `start.bat`. Mở http://localhost:5174

Đổi cổng: `PORT=8080 node server.js`

## Bản HTML gộp một file

```bash
node build-html.js
```

Sinh `dist/lich-tac-nghiep.html` (~97 KB) — nhúng sẵn CSS + JS, không tham chiếu
file ngoài nào. Mở trực tiếp bằng trình duyệt, hoặc đặt ở đâu cũng được.

**Vẫn phải có server chạy.** Đây chỉ là phần giao diện; dữ liệu lấy qua API của
`server.js`, mà server mới là nơi gọi `lark-cli` và chốt phân quyền. Trang tự
chọn cách gọi API:

- mở qua `http://localhost:5174` → dùng đường dẫn tương đối
- mở bằng `file://`, hoặc do một web server khác phục vụ → trỏ tuyệt đối về
  `http://localhost:5174`

Vì thế server bật CORS cho **origin `null` (file://) và localhost**, không mở
`*` — server này ghi thẳng vào Base, mở cho mọi origin nghĩa là bất kỳ trang web
nào anh ghé cũng gọi được API cục bộ.

Đừng sửa trực tiếp `dist/lich-tac-nghiep.html`: nó sinh tự động, chạy lại
`node build-html.js` là mất hết thay đổi. Sửa trong `public/`.

## Phân quyền

App nhận diện người dùng qua phiên `lark-cli` của máy đang chạy
(`lark-cli auth status`). Danh sách quản lý lưu ở `quyen.json`, đọc lại mỗi
request nên đổi quyền có hiệu lực ngay, không cần restart.

- **Quản lý**: thấy toàn bộ 138 lịch, có tab Tổng quan / Cần xử lý / Chi phí,
  duyệt kế hoạch, duyệt FOC & Media, xác nhận thanh toán, xoá bản ghi.
- **Nhân sự**: chỉ thấy lịch mình là *Phụ trách* hoặc nằm trong *Nhân sự*.

Cấp quyền bằng nút bánh răng cạnh tên trên thanh trên (chỉ quản lý thấy).
Mặc định quản lý là Lê Văn Hùng — sửa bằng `LARK_MANAGER_IDS` hoặc `quyen.json`.

### Chuyển vai — xem giao diện của nhân sự

Bấm vào chip tên mình ở góc phải → chọn một nhân sự. Màn hình chuyển đúng sang
những gì người đó thấy: chỉ lịch của họ, chỉ 3 tab của nhân sự, không có
Tổng quan / Cần xử lý / Chi phí. Chip đổi sang cam kèm băng cảnh báo; bấm
"Quay lại vai quản lý" để thoát.

Đây là chế độ **chỉ xem** — khoá ở cả hai tầng:

- Giao diện: ẩn nút Đăng ký lịch, bỏ mọi nút thao tác trên thẻ, drawer
  chuyển toàn bộ ô nhập và nút tải tệp sang trạng thái khoá, bỏ nút Lưu.
- Server: khi mượn vai, client gắn `as=<open_id>` vào mọi request; server từ
  chối mọi method khác GET với mã `PREVIEW_READONLY`. Khoá nút trên giao diện
  không phải hàng rào duy nhất.

Phạm vi dữ liệu cũng lọc thật ở server (`/api/meta?as=`), không phải ẩn bớt ở
client. Nhân sự truyền `as=` sẽ bị bỏ qua — không ai mượn vai người khác được.

## Luồng trạng thái

```
Đang lên kế hoạch → Chờ duyệt/Xử lý → Duyệt/Chờ tác nghiệp → Đang báo cáo → Đã hoàn tất
                          ↓
                Từ chối/Cần điều chỉnh → (sửa) → Chờ duyệt/Xử lý
                          ↓
                   Từ chối · Hủy lịch
```

Chốt ở server, không chỉ ẩn UI:

| Quy tắc | Mã lỗi |
|---|---|
| Nhân sự chỉ đặt được `Đang lên kế hoạch` / `Chờ duyệt/Xử lý` / `Đang báo cáo` | `STATUS_LOCKED` |
| Nhân sự không sửa `Phụ trách`, `Thanh toán`, `Trạng thái FOC/Media`, `Feedback Media` | `FIELD_LOCKED` |
| Lịch đã duyệt/đóng thì nhân sự không sửa được nội dung kế hoạch | `PLAN_LOCKED` |
| Chuyển sang `Đang báo cáo` bắt buộc có `Báo cáo & ghi chú` hoặc `Liên kết` | `PROOF_REQUIRED` |
| Chỉ quản lý xoá bản ghi | `MANAGER_ONLY` |
| Không thao tác trên lịch không phải của mình | `NOT_YOURS` |
| Không ghi khi đang xem giao diện của người khác | `PREVIEW_READONLY` |

Quyết định phân quyền đọc bản ghi bằng `+record-get` (một lần gọi mỗi lần ghi),
**không dùng cache**. Cache có TTL 20s, mà trạng thái quyết định quyền có thể vừa
bị đổi trong Lark hoặc ở máy người khác — dựa vào bản cũ sẽ mở một cửa sổ cho
nhân sự sửa kế hoạch sau khi quản lý đã duyệt.

## Kiểm thử

```bash
node test/api.test.js          # chỉ đọc
node test/quyen.test.js        # chỉ đọc, cần instance vai nhân sự ở 5175
```

Thêm `--write` để chạy vòng ghi thật (tạo → sửa → đính kèm → xoá). Bản ghi thử
đặt tên `[TEST ...] <thời gian>` và bị xoá ở cuối bài, nhưng vẫn kích hoạt
workflow cảnh báo của Base.

`quyen.test.js` cần một instance thứ hai đóng vai nhân sự — chạy với file quyền
không chứa tài khoản đang đăng nhập:

```bash
PORT=5175 LARK_QUYEN_FILE=quyen.nhansu.json node server.js
```

Lần chạy gần nhất: **112 pass · 0 fail** (65 + 47).

## Lưu ý về dữ liệu Base

- **Base có 149 dòng trống** dùng để chừa chỗ (không tên, không ngày, không người).
  Server lọc bỏ chúng ở `isBlank()` để số đếm và biểu đồ không bị sai;
  còn lại 138 lịch thật.
- **Trường công thức `Thời lượng tác nghiệp` đang hỏng**: công thức
  `([Thời gian kết thúc]-[Thời gian bắt đầu])*24` trả số rác (âm hàng triệu)
  với 245/287 bản ghi thiếu *Thời gian kết thúc*. App bỏ qua trường này và tự
  tính lại từ mốc bắt đầu/kết thúc (`realHours()` trong `public/app.js`).
- **Workflow `Cảnh báo chỉnh sửa bản ghi (chống gian lận)` đang bật** và theo dõi
  gần như mọi trường. Mỗi lần lưu từ app sẽ kích hoạt nó → gửi thông báo cho
  admin sau 2 phút. Đây là hành vi mong muốn hay không là quyết định của bạn;
  nếu không, tắt workflow `wkfBvGXzkfUNfPeT` trong Lark Base.

## Cấu trúc

```
config.js        toạ độ Base, ánh xạ field ID → khoá UI, quy tắc phân quyền
lark.js          gọi lark-cli, retry khi gặp lỗi tạm thời (1254291, timeout…)
server.js        REST API + phục vụ file tĩnh, chốt quyền ở server
public/app.js    toàn bộ giao diện (không framework)
public/styles.css design token theo Lark
quyen.json       danh sách open_id của quản lý
```

## API

| Method | Đường dẫn | Việc |
|---|---|---|
| GET | `/api/meta` | danh tính, vai trò, toàn bộ lịch trong phạm vi, options, cấu hình |
| POST | `/api/items` | đăng ký lịch mới |
| PATCH | `/api/items/:id` | cập nhật (chốt quyền theo vai trò) |
| DELETE | `/api/items/:id` | xoá (quản lý) |
| POST | `/api/items/:id/attachment/:key` | tải tệp lên (`tickets` / `files` / `unc`) |
| GET | `/api/items/:id/file/:token` | tải tệp đính kèm xuống |
| GET/POST | `/api/quyen` | xem / sửa danh sách quản lý |

## Phím tắt

- `Esc` đóng drawer hoặc modal
- `Ctrl/Cmd + S` lưu thay đổi trong drawer
