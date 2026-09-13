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

| Kỳ | Khoảng đo | Hạn nộp |
|---|---|---|
| Ngày | chính ngày đó | hết ngày đó |
| Tuần | **Thứ 7 → Thứ 6** | hết **Thứ 7** tuần kế |
| Tháng | mùng 1 → cuối tháng | hết **ngày 1** tháng sau |

Tuần và tháng cùng một luật dù nghe như hai quy định riêng: hạn là **ngày đầu
tiên của kỳ kế tiếp**. Anh Hùng (13/09): *"làm báo cáo ngày thứ 7, còn hiệu quả
đo lường từ thứ 7 tuần trước tới thứ 6 tuần này"*. Hạn phải nằm SAU khi kỳ đóng
— đặt hạn trong kỳ là bắt tổng kết một khoảng chưa kết thúc.

- Khoảng đo tuần khớp đúng thẻ nhắc gửi trong nhóm mỗi tuần.
- Ca làm việc: **480 phút** (cả ngày) hoặc **240 phút** (nửa ngày); ca khác thì
  tự khai. Phần trăm tính trên **định mức của ca**, không phải trên tổng người
  đó tự khai — chia cho chính tổng của mình thì ai cũng ra 100%.
- **Tuần và tháng do máy cộng** từ các phiếu ngày. Người chỉ viết *nhận định* và
  *kế hoạch kỳ sau* — hai thứ máy không viết thay được, và cũng là hai thứ AI sẽ
  đọc để đánh giá sau này.
- Chủ nhật **không bắt buộc** báo cáo, nhưng vẫn nộp được (có người báo tăng ca).
- Báo cáo **tuần và tháng** có ô **link video** (Minutes/Drive) — nhân sự vốn đã
  gửi kèm link này trong nhóm Lark. Báo cáo ngày không hỏi, vì chưa ai quay
  video cho một ngày.
- Nộp báo cáo **không còn gửi vào nhóm Lark** nữa.

## Base

**Báo cáo công việc MKT** · `IqK1b8mdSapQaIsYhavlMMxzgQf`, dựng 12/09/2026 bằng
`node thiet-lap/tao-base.js --that`. Giữ script đó lại để dựng lại được, khỏi
bấm tay 31 cột.

| Bảng | id | Vai trò |
|---|---|---|
| Phiếu báo cáo | `tblMIviEWyBXNTFz` | một người × một kỳ, 25 cột |
| Dòng việc | `tblo5FBTVuXzv0W0` | một đầu việc một bản ghi, 13 cột |

**App Lark phải được mời vào Base** (`cli_aa04305ecd385ed1`, quyền Quản lý —
cấp ngày 13/09/2026). Base đứng tên người tạo; trên máy app đọc/ghi bằng phiên
lark-cli của chính người đó nên chạy ngon, còn trên Render nó ghi bằng danh
nghĩa APP Lark. Thiếu bước này thì mọi lần nộp báo cáo trả `91403`.

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

Màn nhập giữ dạng **bảng** — mỗi đầu việc một hàng. Đã thử dựng mỗi đầu việc
thành một khối riêng cho rõ, nhưng năm đầu việc thành năm khối cao, phải cuộn
mới nhìn hết một ngày; anh Hùng bảo "hơi lớn". Bảng gọn hơn và vốn là hình dạng
cả phòng đã quen từ file Excel.

Ô Công việc có **hai hàng trong cùng một ô**: hàng trên chọn từ Bảng công việc
(nhỏ và mờ hơn — nó là đường tắt), hàng dưới là tên công việc. Cả hai luôn hiện.
Chọn một việc thì tên tự điền xuống hàng dưới (vẫn sửa được), và sửa tay thì
liên kết về Tracking tự bỏ — tên đã khác mà giữ mã cũ là báo cáo trỏ về một đầu
việc không còn đúng. Nhóm việc tự đoán từ "Loại công việc" bên Tracking, ô nhóm
mang viền xanh mảnh khi giá trị là máy đoán.

App **không đọc Base của Tracking** — nó gọi API của app đó, vì luật lọc và
phân quyền nằm ở đó; chép lại là sớm muộn hai bên nói khác nhau. Tracking tắt
thì màn nhập **nói thẳng** "không nối được", chứ không hiện menu rỗng.

## Nhận định tự động

`nhan-dinh.js` đọc dữ liệu thật của kỳ rồi phát biểu những điều **đo được**:
nộp đúng hạn hay muộn, thời lượng so với định mức, một nhóm việc chiếm bao
nhiêu phần, đầu việc **giữ nguyên tiến độ qua nhiều ngày**, việc dở dang không
ghi lý do, ngày thiếu, vướng mắc đã nêu. Mỗi ý có mức (tốt / lưu ý / cảnh báo)
và một điểm 0–100 chỉ để xếp thứ tự bảng — **không phải điểm KPI**.

Trên phiếu của nhân sự, mấy ý này hiện thành **note nhỏ ngay dưới dòng hạn
nộp** — liếc qua là biết, không bắt dừng lại đọc; phần giải thích thành lời
nhắc khi rê chuột. **Không hiện điểm ở màn đó**: điểm chỉ để xếp thứ tự bảng
toàn phòng của quản lý, chấm một con số lên đầu phiếu của chính người vừa gõ là
đổi hẳn ý nghĩa nó, từ "máy đọc dữ liệu" thành "máy chấm điểm anh". Khối đầy đủ
kèm điểm vẫn dùng ở màn Toàn phòng.

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

## Kỷ luật nộp

Bốn mức, và ba mức sau không được gộp lại:

| Mức | Nghĩa |
|---|---|
| Đúng hạn | nộp trước 23:59 của hạn |
| Trễ | nộp sau hạn, trong vòng 24 giờ |
| Nộp bù | trễ quá 24 giờ — nộp cho kỳ đã trôi qua hẳn |
| Chưa nộp | quá hạn mà không có phiếu |

Quên gửi buổi tối rồi sáng hôm sau gửi khác hẳn dồn cả tuần vào cuối tháng.

**Ô `Nộp lúc` giữ lần nộp ĐẦU TIÊN và không bao giờ bị ghi đè.** Lần sửa ghi
riêng vào `Sửa lúc`, số lần vào `Số lần nộp`. Bản đầu ghi đè `Nộp lúc` mỗi lần
bấm Nộp, nên người nộp đúng hạn hôm qua mà hôm nay mở ra sửa một chữ lập tức bị
chấm "trễ 18 giờ" — hỏng đúng cái bảng kỷ luật mà nó sinh ra để phục vụ.

Màn **Theo dõi** (quản lý) đếm bốn mức đó theo tuần hoặc tháng, kèm tỷ lệ đúng
hạn tính trên **ngày công** chứ không trên số phiếu đã nộp — chia cho số phiếu
thì người nộp đúng một ngày trong tuần vẫn ra 100%.

## Dọn dữ liệu thử — KHÔNG BAO GIỜ xoá cả bảng

Dùng `node thiet-lap/don-thu-nghiem.js` (thêm `--that` để xoá thật). Nó chỉ xoá
bản ghi mang dấu thử (`THU`, `THỬ`, `TEST` ở đầu tên công việc), in ra từng
dòng sắp xoá, và nói rõ giữ lại bao nhiêu của người thật.

**Vì sao có hàng rào này:** ngày 13/09/2026 tôi dọn sau mỗi đợt thử bằng một
dòng gọn — `listAllRecords()` rồi `deleteRecords()` toàn bộ. Tức là xoá sạch cả
bảng, không phân biệt phiếu của tôi với phiếu anh Hùng vừa nộp thật. Anh nộp
báo cáo, thấy dữ liệu biến mất, và tưởng do deploy. Không phải deploy.

Quy tắc từ đây: **không có lệnh xoá hàng loạt nào chạy thẳng trên Base thật.**
Muốn dọn thì qua script trên; muốn thử ghi nhiều thì dựng một Base riêng bằng
`thiet-lap/tao-base.js` và trỏ `LARK_BASE_TOKEN` vào đó.

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
- **Base mới tạo thì app Lark CHƯA có quyền vào.** Lỗi `91403` khi nộp báo cáo
  trên Render gần như luôn là chuyện này — và nó không bao giờ lộ khi thử trên
  máy. `thiet-lap/tao-base.js` in sẵn lệnh cấp quyền sau khi tạo xong.
- **Hai backend, và chỉ một cái được thử trên máy.** `lark.js` (lark-cli) chạy
  khi làm local; `larkapi.js` (Open API) chạy trên Render. Một lỗi ở file thứ
  hai đi thẳng lên bản thật — `createMany` từng viết theo dạng thân của
  `bitable/v1` trong khi cả file dùng `base/v3`, và mọi lần nộp trên Render trả
  `1254045 FieldNameNotFound`. `test/larkapi.test.js` chặn `fetch` rồi soi URL
  và thân yêu cầu; nó cũng gác việc hai backend phải có cùng bộ hàm.
- **Ô checkbox đọc về thành chuỗi `"false"`, mà chuỗi đó TRUTHY.** Không có
  nhánh riêng thì mọi phiếu đều đếm là đã tick — phiếu trễ 18 giờ nhảy sang cột
  "nộp bù". Dùng `kho.asTick()`.
- **Gom người phải hợp nhất theo id VÀ email**, không phải một khoá chuỗi. Cùng
  một người mở bản trên máy và bản trên Render ra hai open_id khác nhau, và họ
  hiện thành hai dòng trong bảng Theo dõi, mỗi dòng một nửa số phiếu.
- **Ô kiểu URL của Base trả về dạng Markdown `[địa chỉ](địa chỉ)`.** Đổ thẳng
  vào ô nhập rồi lưu lần nữa là nó bọc thêm một lớp, mỗi lần sửa lại dài gấp
  đôi. Gỡ ngay lúc đọc bằng `kho.asLink()`; cột phải khai `type: 'url'` mới đi
  qua đường gỡ đó.
- **`node --check` không bắt được biến mồ côi trong hàm xử lý nút.** Đổi bố cục
  xong, `const ds = …` bị xoá mà dòng dùng `ds` thì còn — tệp vẫn xanh, chỉ nổ
  khi có người bấm "+ Thêm dòng". `test/giao-dien.test.js` nay gọi thật từng
  `onclick`.
- **Lớp CSS `.rong` nghĩa là "không có gì" và nó CĂN GIỮA.** Đừng mượn từ đó để
  nói "chiếm cả hàng" — đã có lần đặt `class="viec-o rong"` và nhãn của mọi ô
  nhập nhảy vào giữa màn hình.
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

## Mô hình ngôn ngữ: CHƯA nối, và đó là quyết định có chủ ý

Anh Hùng chốt 12/09/2026: **giữ nguyên nhận định theo luật**, chạy thực tế vài
tuần rồi mới quyết có nối AI hay không. Đừng tự nối khi chưa được hỏi lại.

Chi phí đã tính, để khỏi tính lại: phòng 7–8 người, chạy AI cho tuần + tháng là
~40 lượt/tháng, mỗi lượt ~1.500 token vào / 400 ra. Haiku 4.5 ~$0,14/tháng ·
Sonnet 5 ~$0,28 · Opus 5 ~$0,70. Chạy cho cả báo cáo ngày (~250 lượt) thì lần
lượt ~$0,87 · $1,73 · $4,34. **Giá không phải yếu tố quyết định** — đừng chọn
nhà cung cấp theo giá.

Khi nào nối, ba ràng buộc đã chốt trước:

1. **Phạm vi: tuần + tháng.** Báo cáo ngày giữ nhận định theo luật — một ngày
   chưa đủ dữ liệu để mô hình nói được điều gì mới.
2. **Ẩn danh trước khi gửi.** Gửi "Nhân sự A", không gửi tên thật; ghép tên lại
   ở máy mình sau khi có kết quả. Đây là dữ liệu đánh giá con người, gắn với
   lương, và người bị đánh giá không đọc được cái đang gửi đi.
3. **AI KHÔNG chấm điểm.** Điểm vẫn do luật tính. Mô hình chỉ diễn đạt lại các
   ý `nhan-dinh.js` đã sinh, và gợi ý câu hỏi nên hỏi. Lý do: AI chấm điểm
   người thì sai một lần là mất sạch niềm tin, và không giải thích nổi vì sao
   62 mà không phải 70 — luật thì giải thích được từng dòng.

Khoá KHÔNG vào repo, chỉ đặt biến môi trường trên Render, giống
`ADS_CONNECT_JSON`. Không đưa App Secret của app Lark cho bên thứ ba nào.

## Còn thiếu

- Mục tiêu từng người theo KPI: đã chừa đường, chưa dựng.
- Chưa nhập lịch sử báo cáo cũ (đang nằm trong ảnh ở nhóm Lark).
