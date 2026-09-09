# OTA Manager — Rooty Trip

OTA Manager được thiết kế theo mô hình **manual-first** vì các OTA hiện chưa cấp
API ổn định cho Rooty Trip. Mục tiêu là nhân viên chỉ nhập booking **một lần** và
mọi báo cáo phía sau dùng chung đúng một nguồn dữ liệu.

```text
OTA có booking
      ↓
Nhân viên nhập một lần ở form/view “Nhập booking OTA” của Lark
      ↓
Bảng Bookings trong Lark Base — nguồn dữ liệu gốc duy nhất
      ↓
OTA Manager tự đọc → Booking mới → Thống kê OTA → cảnh báo dữ liệu
```

Khi một kênh được cấp API, chỉ thay bước đầu:

```text
API OTA → Bookings trong Lark → các màn hình và báo cáo hiện tại giữ nguyên
```

Không có luồng `OTA → nhập Lark → nhập lại Marketing Hub`.

Các kênh đã chuẩn bị sẵn: **Klook, KKday, GetYourGuide, Trip.com/Ctrip, WAUG,
MyRealTrip và Viator**.

## Ba màn hình

| Màn hình | Mục đích |
|---|---|
| **Booking mới** | Vận hành hằng ngày. Đọc các booking đã nhập ở Lark, ưu tiên theo ngày đi hoặc thời gian nhập, lọc theo OTA/trạng thái/ngày và bật cảnh báo thiếu SĐT, điểm đón, ngày đi… |
| **Thống kê OTA** | Tổng booking, số khách, tổng tiền, hoa hồng, doanh thu thu về, tỷ lệ huỷ, doanh thu theo OTA/tour/ngày và **lead time**. |
| **Dữ liệu Lark** | Kiểm tra bảng `Bookings`, `Danh mục OTA`, `Danh mục Tour`, quyền đọc/ghi, cột còn thiếu, link form nhập booking và trạng thái API tương lai. |

## Luồng nhập booking hiện tại

Nhân viên mở nút **+ Nhập booking OTA** trên OTA Manager. Nút này:

- mở thẳng form nếu Render có biến `OTA_INPUT_FORM_URL`;
- nếu chưa có link form riêng, mở Lark Base và nhắc dùng view
  **Nhập booking OTA**.

Form chỉ nên hỏi các trường có trên booking OTA:

- OTA và ID booking;
- tên khách, SĐT, email;
- ngày đặt, ngày đi;
- tour, số người lớn, số trẻ em;
- điểm đón, giờ đón;
- Gross nguyên tệ, nguyên tệ;
- trạng thái và ghi chú khách.

Các trường sau không cần để nhân viên tự tính:

- tổng khách;
- Gross VND;
- tỷ lệ và tiền hoa hồng;
- doanh thu thu về;
- lead time;
- thống kê ngày/tháng;
- cảnh báo thiếu thông tin.

Các cột tiền và cột liên kết được lấy từ công thức/danh mục trong Lark, còn OTA
Manager chỉ đọc và tổng hợp để tránh lệch số giữa bảng và dashboard.

## Lark Base là nguồn dữ liệu gốc

Base mặc định:

```text
https://rootytrip2.sg.larksuite.com/base/XrMkbW5FPaQlHpsMSN8lQFO9geW
```

Ba bảng được dùng:

| Bảng | Vai trò |
|---|---|
| `Bookings` | Mỗi dòng là một booking; đây là dữ liệu vận hành và báo cáo chính thức. |
| `Danh mục OTA` | Chuẩn hoá tên/mã OTA, nguyên tệ và tỷ lệ hoa hồng. |
| `Danh mục Tour` | Chuẩn hoá tour và giá thu về người lớn/trẻ em. |

App dò table ID và field ID theo **tên bảng/tên cột**, không phụ thuộc vị trí cột.
Màn **Dữ liệu Lark** cho biết cột nào đã nhận diện, cột nào bắt buộc và cột nào
nên bổ sung.

### Nguyên tắc tính tiền

Bảng `Bookings` có thể dùng công thức:

```text
Tổng khách        = Người lớn + Trẻ em
Gross VND         = Gross nguyên tệ × Tỷ giá về VND
HH % từ OTA       = FIRST([OTA].[Hoa hồng %])
Hoa hồng VND      = Gross VND × HH % từ OTA
Doanh thu thu về  = Người lớn × [Tour].[Giá thu về NL]
                    + Trẻ em × [Tour].[Giá thu về TE]
```

OTA Manager không ghi đè các cột công thức. Nhờ vậy số trên dashboard và số trong
Lark dùng cùng một nguồn.

## Tự cập nhật dữ liệu Lark

Booking được nhập trực tiếp trong Lark nên Lark không tự bắn sự kiện vào trình
duyệt. Khi nút **Tự cập nhật Lark** đang bật, giao diện chủ động đọc lại bảng
`Bookings` theo chu kỳ:

- mặc định: 60 giây;
- tối thiểu: 30 giây;
- thay đổi bằng `OTA_AUTO_REFRESH_MS`.

Nút **Đọc lại Lark** luôn cho phép nạp dữ liệu ngay. Khi màn hình bị ẩn, app không
gọi Lark liên tục; khi người dùng quay lại, app kiểm tra lại một lượt.

Hàng đợi cục bộ chỉ là công cụ kỹ thuật dành cho dữ liệu thử hoặc webhook cũ.
Nó không phải nguồn dùng để chốt báo cáo và không được nhớ qua lần mở trang sau;
OTA Manager luôn quay lại Lark Base.

## Thống kê OTA

Màn Thống kê có:

- booking còn hiệu lực và booking huỷ/no-show;
- số khách, người lớn, trẻ em;
- tổng tiền OTA bán;
- hoa hồng OTA;
- doanh thu thực nhận;
- trung bình doanh thu trên booking;
- tỷ lệ huỷ/hoàn;
- theo kênh OTA, tour và ngày;
- danh sách loại thông tin còn thiếu;
- **thời gian đặt trước (lead time)**.

Lead time được tính bằng `Ngày đi − Ngày đặt`, chỉ tính booking còn hiệu lực và
chia thành các nhóm:

- cùng ngày;
- 1–3 ngày;
- 4–7 ngày;
- 8–14 ngày;
- trên 14 ngày.

Booking thiếu ngày hoặc ngày đặt sau ngày đi được loại khỏi trung bình và đếm
riêng để người dùng bổ sung dữ liệu.

## Cảnh báo vận hành

OTA Manager tự tính cảnh báo, không ghi cứng vào Lark vì một số cảnh báo thay đổi
theo ngày hiện tại:

```text
Chưa có SĐT
Chưa có điểm đón
Chưa có ngày đi
Còn 1 ngày, chưa xác nhận
Đã qua ngày đi mà chưa xác nhận
Chưa map được tour / sản phẩm
Hoa hồng ước tính
Trẻ em — cần xác nhận chiều cao
```

OTA không trả dữ liệu thì để trống và bật cảnh báo; app không suy đoán điểm đón,
SĐT hoặc ngày đi.

## Phân quyền

OTA Manager dùng quyền từ bảng **Phân quyền app** của Marketing Hub:

| Quyền | Tác dụng |
|---|---|
| `quản lý` | Xem tình trạng kết nối/cấu trúc và công cụ kỹ thuật. |
| `chi phí` | Xem tiền, bảng giá NET, Thống kê OTA và xuất CSV. |
| `được sửa` | Cập nhật một số trường vận hành trở lại Lark. |

Quyền được áp ở server. Người không có quyền chi phí không nhận các trường tiền
qua API, không chỉ bị ẩn bằng CSS.

Quyền **chỉ đọc** trên Lark vẫn phù hợp với kiến trúc hiện tại: nhân viên nhập
trực tiếp trong form/view Lark, OTA Manager đọc và báo cáo. Khi chỉ đọc, các nút
sửa booking trong OTA Manager được ẩn.

## Biến môi trường quan trọng

| Biến | Ý nghĩa |
|---|---|
| `LARK_APP_ID`, `LARK_APP_SECRET` | Credential để đọc Lark qua Open API. |
| `OTA_BASE_TOKEN` | Token của Lark Base. |
| `OTA_TABLE_ID` | ID bảng `Bookings`. |
| `OTA_TABLE_OTA_ID` | ID bảng `Danh mục OTA`. |
| `OTA_TABLE_TOUR_ID` | ID bảng `Danh mục Tour`. |
| `OTA_INPUT_FORM_URL` | Link chia sẻ của form/view “Nhập booking OTA”. |
| `OTA_INPUT_VIEW_NAME` | Tên view nhập booking, mặc định `Nhập booking OTA`. |
| `OTA_AUTO_REFRESH_MS` | Chu kỳ giao diện đọc lại Lark, tối thiểu 30000 ms. |
| `OTA_CACHE_TTL` | Thời gian cache dữ liệu server, mặc định 30000 ms. |
| `OTA_TZ` | Múi giờ ngày tour, mặc định UTC+7. |
| `OTA_RATES_JSON` | Tỷ lệ hoa hồng dự phòng khi chưa đọc được danh mục. |
| `OTA_WEBHOOK_SECRET` | Secret dùng khi bật webhook trong tương lai. |

Ví dụ:

```text
OTA_INPUT_FORM_URL=https://rootytrip2.sg.larksuite.com/share/base/form/...
OTA_INPUT_VIEW_NAME=Nhập booking OTA
OTA_AUTO_REFRESH_MS=60000
```

Không đưa App Secret, access token hoặc webhook secret vào GitHub.

## API OTA trong tương lai

Backend vẫn giữ sẵn bộ chuẩn hoá và webhook cho 7 kênh, nhưng chúng không phải
điều kiện để vận hành hiện tại. Màn **Dữ liệu Lark** chỉ hiển thị trạng thái:

- `Chưa được cấp API` khi chưa có credential;
- `Có credential · chờ bật` khi đã khai credential.

Khi một OTA cấp API, adapter của kênh đó phải ghi vào cùng bảng `Bookings`.
Phần Booking mới, thống kê, cảnh báo và báo cáo không cần xây lại.

Đường webhook đã chuẩn bị:

```text
POST /webhook/klook
POST /webhook/kkday
POST /webhook/gyg
POST /webhook/ctrip
POST /webhook/waug
POST /webhook/myrealtrip
POST /webhook/viator
```

Dùng header `x-ota-secret` hoặc query `?secret=...`. Thêm `?dryRun=1` để kiểm tra
mapping mà không ghi dữ liệu. Đây là phần nâng cao dành cho lúc có API/payload
thật, không dùng cho quy trình nhập tay hiện tại.

## Chống trùng và an toàn dữ liệu

Hạ tầng API tương lai chống trùng theo cặp **(kênh, mã booking)**. Khi OTA gửi lại
một booking thiếu một trường, app không xoá dữ liệu đã được bổ sung trước đó.

Hàng đợi JSON cục bộ chỉ là lưới an toàn kỹ thuật và nằm trong `.gitignore`.
Filesystem mặc định của Render là tạm thời, nên không dùng hàng đợi làm nơi lưu
booking chính thức. Booking chính thức phải nằm trong Lark Base.

## Chạy và kiểm thử

```bash
npm start
npm test
```

Hoặc chạy riêng:

```bash
node test/chuanhoa.test.js
node test/thongke.test.js
node test/giao-dien.test.js
node test/api.test.js
```

`test/api.test.js` cần server đang chạy. Test tự bỏ qua các phép ghi khi phát hiện
đang kết nối Base thật để không đổ dữ liệu giả vào bảng vận hành.

## Các file chính

| File | Vai trò |
|---|---|
| `config.js` | Cấu hình Lark, 7 kênh, tên bảng/cột, form nhập và chu kỳ tự cập nhật. |
| `schema.js` | Dò table/field theo tên và phân biệt cột được ghi với cột công thức. |
| `store.js` | Đọc booking từ Lark hoặc hàng đợi kỹ thuật. |
| `danhmuc.js` | Đọc `Danh mục OTA` và `Danh mục Tour`. |
| `thongke.js` | Lọc, tổng hợp doanh thu, cảnh báo và lead time. |
| `public/app.js` | Ba màn hình Booking mới, Thống kê OTA, Dữ liệu Lark. |
| `chuanhoa.js` | Chuẩn hoá payload API tương lai của 7 OTA. |
| `nhan.js` | Upsert và chống trùng cho API/webhook tương lai. |
| `hangdoi.js` | Hàng đợi kỹ thuật, không phải dữ liệu báo cáo chính thức. |
| `test/` | Kiểm thử chuẩn hoá, thống kê, giao diện và API. |


## Tạo ba cột vận hành trong Lark

Quản lý vào **Dữ liệu Lark** và bấm **Tạo cột vận hành**. App chỉ thêm cột còn thiếu:
`Giờ đón` (text), `Ghi chú khách` (text), `Sales đã nhận` (checkbox). Không sửa dữ liệu,
công thức hay cột hiện có. `Payload gốc` chưa tạo ở giai đoạn nhập tay.
