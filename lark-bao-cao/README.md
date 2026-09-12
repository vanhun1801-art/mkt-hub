# Báo cáo công việc

App con thứ 9 của Marketing Hub. Nhân sự nộp báo cáo **ngày / tuần / tháng**;
dữ liệu vào thẳng Lark Base dưới dạng **dòng**, không phải ảnh chụp màn hình.

```
node server.js        →  http://localhost:5183
node test/chay-het.js →  toàn bộ test
```

## Vì sao có app này

Cả phòng đang gõ báo cáo vào một bảng Excel, chụp màn hình, rồi dán vào nhóm
Lark lúc 17:00. Nội dung nằm trong ảnh nên **không tìm được, không cộng được,
không đưa cho AI đọc được** — trong khi chính mấy con số đó (phút, nhóm việc,
tiến độ từng đầu việc) là thứ bảng nhiệt và KPI đang cần.

App nhận đúng nội dung ấy, giữ nguyên hình dạng cái bảng mọi người đã quen, chỉ
khác là mỗi đầu việc thành một bản ghi.

## Quy định (anh Hùng chốt 12/09/2026)

| Kỳ | Hạn nộp |
|---|---|
| Ngày | hết ngày làm việc đó |
| Tuần | hết ngày cuối cùng của tuần |
| Tháng | hết **ngày đầu tiên của tháng sau** |

- Tuần của phòng chạy **Thứ 7 → Thứ 6**, đúng thẻ nhắc gửi trong nhóm mỗi tuần.
- Ca làm việc: **480 phút** (cả ngày) hoặc **240 phút** (nửa ngày); ca khác thì
  tự khai. Phần trăm tính trên **định mức của ca**, không phải trên tổng người
  đó tự khai — chia cho chính tổng của mình thì ai cũng ra 100%.
- **Tuần và tháng do máy cộng** từ các phiếu ngày. Người chỉ viết *nhận định* và
  *kế hoạch kỳ sau* — hai thứ máy không viết thay được, và cũng là hai thứ AI sẽ
  đọc để đánh giá sau này.
- Chủ nhật **không bắt buộc** báo cáo, nhưng vẫn nộp được (có người báo tăng ca).
- Nộp báo cáo **không còn gửi vào nhóm Lark** nữa.

## Base

**Báo cáo công việc MKT** · `IqK1b8mdSapQaIsYhavlMMxzgQf`, dựng 12/09/2026 bằng
`node thiet-lap/tao-base.js --that`. Giữ script đó lại để dựng lại được, khỏi
bấm tay 31 cột.

| Bảng | id | Vai trò |
|---|---|---|
| Phiếu báo cáo | `tblMIviEWyBXNTFz` | một người × một kỳ, 21 cột |
| Dòng việc | `tblo5FBTVuXzv0W0` | một đầu việc một bản ghi, 13 cột |

Hai cột `Đánh giá AI` / `Điểm AI` còn trống — tạo sẵn vì thêm cột vào bảng đã có
vài nghìn dòng phiền hơn nhiều so với để trống vài tháng.

## Hai vai

**Nhân sự** — Hôm nay · Tuần · Tháng · Đã nộp. Nhập báo cáo, đọc nhận định tự
động về chính mình.

**Quản lý** — thêm Toàn phòng · Cần hỗ trợ · Theo dõi. Xem đánh giá cả phòng
xếp theo điểm (thấp lên trước), gom vướng mắc mọi người nêu về một chỗ, và biết
ai còn thiếu ngày nào.

## Đầu việc lấy từ app Tracking

Ô "Công việc" **không cho gõ tự do**: nó là danh sách việc app Bảng công việc
(cổng 5173) đang giao cho chính người đó — việc đang mở, cộng việc vừa đóng
trong 7 ngày. Gõ tay chỉ còn một đường: chọn "Khác — tự nhập".

Được cái gì: tên việc trong báo cáo khớp từng chữ với Tracking, và mỗi dòng
mang theo `record_id` nên sau này ghép hai nguồn không phải đoán theo tên.

App **không đọc Base của Tracking** — nó gọi API của app đó, vì luật lọc và
phân quyền nằm ở đó; chép lại là sớm muộn hai bên nói khác nhau. Tracking tắt
thì màn nhập **nói thẳng** "không nối được", chứ không hiện menu rỗng.

## Nhận định tự động

`nhan-dinh.js` đọc dữ liệu thật của kỳ rồi phát biểu những điều **đo được**:
nộp đúng hạn hay muộn, thời lượng so với định mức, một nhóm việc chiếm bao
nhiêu phần, đầu việc **giữ nguyên tiến độ qua nhiều ngày**, việc dở dang không
ghi lý do, ngày thiếu, vướng mắc đã nêu. Mỗi ý có mức (tốt / lưu ý / cảnh báo)
và một điểm 0–100 chỉ để xếp thứ tự bảng — **không phải điểm KPI**.

Phần này chạy được ngay: không cần khoá, không phụ thuộc mạng, không bao giờ
bịa ra một con số. Chỗ dành cho mô hình ngôn ngữ là viết lại mấy ý này thành
lời — và khi nối, nó vẫn phải neo vào chính danh sách ý đó, không đọc thẳng dữ
liệu thô. Máy tổng hợp số, mô hình chỉ diễn đạt.

Thứ đáng giá nhất ở đây là **"đầu việc giữ nguyên tiến độ qua N ngày"** — muốn
thấy điều đó bằng mắt thì phải mở bảy tấm ảnh ra so với nhau.

## Sắp tới: nối với mục tiêu bên KPI

Anh Hùng đã báo trước ý định này (chưa làm). Cấu trúc hiện tại đã chừa đường:

- Mỗi dòng việc mang `Mã việc tracking`, nên ghép được với Bảng công việc.
- `Nhóm việc` dùng chung bộ danh mục, nên gộp theo nhóm được ngay.
- Phiếu có sẵn `Điểm AI` / `Đánh giá AI` để chứa kết quả đối chiếu với mục tiêu.
- Số liệu theo người × theo kỳ đã chuẩn hoá, nên [[kpi-app]] chỉ cần đọc
  `/api/toan-phong` là có đủ, không phải tự cộng lại.

## Những chỗ đã sập một lần, đừng sập lại

- **"Thứ 6" là ISO 5, không phải 6.** App Lịch tác nghiệp từng viết `moThu: 6` và
  cả khung giờ chạy lệch một ngày trong khi màn hình vẫn đọc xuôi tai.
- **Giờ VN là UTC+7 cố định, phải cộng lệch TRƯỚC khi cắt ngày.** Render chạy
  UTC; cắt theo giờ máy thì báo cáo nộp sau 17:00 rơi sang ngày hôm trước.
- **Ô ngày giờ của Base trả chuỗi ISO ở chế độ `cli` và số ms ở chế độ `api`.**
  `Number(chuỗi ISO)` ra `NaN`, `NaN || 0` ra `0`, mà `0` lại đọc như "chưa đặt".
  Mọi ô ngày phải đi qua `kho.asMs()`.
- **open_id khác nhau theo từng app Lark**, nên luôn ghi kèm email và ghép người
  bằng cả hai (`kho.cungNguoi`).
- **Nhận biết "đến từ hub" bằng sự CÓ MẶT của header, không bằng giá trị.** Bản
  đầu dùng `if (h['x-hub-user-id'] || ...)`, nên request từ hub mà hụt danh tính
  rơi xuống nhánh chạy-một-mình — nhánh đó lấy phiên lark-cli của máy **và tự
  cấp quyền quản lý**. `test/server.test.js` gác chỗ này.
- **Giao diện không phải hàng rào.** Nộp phiếu rỗng bị chặn ở cả hai đầu, vì ai
  cũng gọi thẳng API được — mà phiếu rỗng vẫn được chấm "đúng hạn", tức là bảng
  theo dõi báo xanh cho người chưa làm gì.
- **`caPhong` KHÔNG được bật trong `modules.json`** — mỗi lần deploy sẽ tự mở
  lại và xoá lựa chọn của quản lý. Mở cho cả phòng bằng biến `HUB_CA_PHONG` trên
  Render.

## Đường API

| Đường | Việc |
|---|---|
| `GET /api/meta` | danh tính, ba kỳ hiện tại, hạn, danh mục ca/nhóm việc |
| `GET /api/phieu?ky=&moc=` | một phiếu + dòng việc; tuần/tháng kèm phần máy cộng |
| `POST /api/phieu` | lưu nháp hoặc nộp (luôn ghi cho chính người gọi) |
| `GET /api/danh-sach` | phiếu đã nộp trong khoảng |
| `GET /api/viec-cua-toi` | đầu việc Tracking đang giao cho người này |
| `GET /api/nhan-dinh?ky=&moc=` | nhận định tự động cho một phiếu |
| `GET /api/toan-phong` | đánh giá cả phòng — **chỉ quản lý** |
| `GET /api/can-ho-tro` | vướng mắc gom một chỗ — **chỉ quản lý** |
| `GET /api/theo-doi` | ai nộp ai chưa — **chỉ quản lý** |
| `GET /api/xuat` | CSV (có BOM để Excel mở không vỡ dấu) |

## Còn thiếu

- **Mô hình ngôn ngữ** chưa nối — nhận định hiện do luật sinh. Cần chốt dùng
  nhà cung cấp nào và cất khoá ở đâu (khoá KHÔNG vào repo, chỉ đặt biến môi
  trường trên Render, giống `ADS_CONNECT_JSON`).
- Mục tiêu từng người theo KPI: đã chừa đường, chưa dựng.
- Chưa nhập lịch sử báo cáo cũ (đang nằm trong ảnh ở nhóm Lark).
