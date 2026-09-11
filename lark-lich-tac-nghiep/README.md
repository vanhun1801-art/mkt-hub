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

### Khung giờ đăng ký

Chỗ kẹt: nút đăng ký mở liên tục, nhân sự thêm lịch bất kỳ lúc nào, nên quản lý
phải xử lý lịch rải rác cả tuần. Nếp làm bằng tay là nhắn cho cả phòng: đăng ký
từ **15:00 T6** tới **12:00 T7**, phần còn lại của T7 dành để xếp việc tuần sau.

Giờ app tự áp. Sửa ở **Phân quyền quản lý → Khung giờ đăng ký** (chỉ quản lý):

| Thiết lập | Nghĩa |
|---|---|
| **Áp khung giờ** | Bỏ chọn là nút mở liên tục như trước |
| **Mở / Đóng** | Thứ + giờ. Đặt mốc đóng **trước** mốc mở cũng được — ví dụ mở T7 15:00, đóng T2 12:00 thì cửa sổ vắt qua cuối tuần |
| **Ngay bây giờ** | Hai nút: **Mở khoá 1 giờ** · **Đóng 1 giờ**. Bấm là áp ngay (không phải bấm Lưu), hết một giờ tự về khung giờ. Đang có ngoại lệ thì hiện mốc + nút **Bỏ** |

Ngoại lệ tay **thắng** khung giờ — nó là câu "tôi quyết thế" của quản lý. Hết
thời lượng thì tự trở về theo khung giờ.

Chỗ này đã đi qua ba bản. Đầu tiên là **hai ô ngày** "Mở tay tới" / "Đóng tay tới". Anh Hùng thử và
nói thẳng là khó hiểu — đúng, và cả bốn nguyên nhân là lỗi thiết kế:

1. **Hai ô cho một câu hỏi.** Câu hỏi thật là *"bây giờ mở hay đóng"*, mà giao
   diện bắt trả lời bằng hai ô độc lập — điền cả hai là một trạng thái vô nghĩa
   (ảnh anh chụp có đúng thế: 15:50 và 15:55).
2. Luật *"đóng thắng mở"* chỉ nằm trong chú thích code, không có trên màn hình.
3. Chữ **"tới"** bắt tự cộng giờ: *"bây giờ 15:40, muốn mở một tiếng thì gõ gì"*.
4. Bộ chọn lịch cho một việc mất 30 giây là quá nặng.

Bản thứ hai là ba nút + chọn thời lượng. Anh Hùng thử tiếp rồi chốt gọn hơn
nữa: *"chỉ cần ấn vào là mở khoá trong một giờ"*, thêm nút đóng một giờ. Đúng —
thứ này dùng để xử lý một tình huống **ngay lúc đó**, không phải để cấu hình.

Nên bản hiện tại là **hai nút**, bấm là áp ngay. Mỗi nút ghi **cả hai** ô ngoại
lệ nên không bao giờ còn hai ngoại lệ cùng sống. Nút **Lưu** ở trên chỉ thuộc về
khung giờ — gửi kèm hai ô ngoại lệ thì bấm Lưu để đổi giờ sẽ vô tình xoá ngoại
lệ vừa đặt, mà không có gì báo.

**Bỏ ngoại lệ = ghi một mốc ĐÃ QUA, không phải ghi null.** Đo được: ghi `null`,
`""` hay `0` vào ô ngày thì lark-cli trả `ok:true` mà giá trị trên Base **không
đổi** — nút "Bỏ" bấm xong không có gì xảy ra và không có lỗi nào. Luật chỉ xét
`mốc > bây giờ`, nên một mốc quá khứ có đúng nghĩa "không còn hiệu lực".

**Nháp không bị chặn — cố ý.** Cửa thật là lúc **Gửi duyệt**: soạn sẵn trong tuần
rồi tới khung giờ bấm gửi là nếp tốt hơn, mà hàng đợi của quản lý vẫn chỉ đầy
lên trong khung. Chặn cả nháp thì chỉ đẩy người ta đi ghi ra chỗ khác.

Quản lý **không bao giờ** bị chặn: họ là người xếp việc.

Chốt ở server, không chỉ khoá nút:

| Quy tắc | Mã lỗi |
|---|---|
| Tạo lịch đi thẳng vào hàng đợi duyệt, ngoài khung | `DANG_KY_DONG` |
| Bấm Gửi duyệt một bản nháp, ngoài khung | `DANG_KY_DONG` |
| Lưu giờ sai định dạng (`25:99`) | `BAD_TIME` |

Câu lỗi và tooltip đều **nói ra mốc mở lại** ("mở lại Thứ 6 15:00 ngày 18/09") —
nút khoá mà không nói bao giờ mở thì người ta bấm lại mỗi tiếng.

Luật nằm ở bảng **Cửa sổ đăng ký** (`tbl8TOoS3hQIhjPE`, một dòng) trong cùng Base.
Trên Base chứ không phải file: ổ đĩa Render là tạm, mất file là nút mở liên tục
trở lại mà không ai biết. Đọc bảng lỗi thì **không áp** cửa sổ — nghiêng về phía
mở, vì đọc lỗi mà đóng nút thì cả phòng không đăng ký được và không có gì báo.

Hai chỗ đã sai trong lúc dựng, nay có phép thử canh:

- **Lệch một ngày.** "Thứ 6" là ISO **5**, không phải 6. Bản đầu gõ 6 nên cửa sổ
  chạy T7→CN, mà màn hình vẫn hiện một câu đọc thấy hợp lý. Dùng `THU_SO` để
  tra, đừng gõ số.
- **Ô ngày trả về chuỗi ISO** ở chế độ cli (số ms ở chế độ api). `Number()` trên
  chuỗi đó ra NaN rồi thành 0 — bấm "đóng tay" xong đọc lại vẫn là mở, giá trị
  nằm trên Base mà đọc ra 0.
- **`$$` không tồn tại ở app này** (chỉ hub có). Gõ theo quán tính từ hub là
  handler ném `ReferenceError` ngay dòng đó: bấm nút không đổi gì, mà trên màn
  hình chỉ là "bấm không ăn" — không lỗi đỏ, không toast, phải mở console mới
  thấy. Phép thử giờ canh cả tệp `public/app.js`.

Phép tính "mở hay đóng" tách ra `cua-so-dang-ky.js` (giờ VN, xử được cửa sổ vắt
tuần); `test/cua-so.test.js` canh 62 phép, không cần server không cần Base.

**Còn thiếu:** luật được đệm 60 giây. Một tiến trình thì đổi xong áp ngay (đường
ghi tự xoá đệm), nhưng nếu chạy hai tiến trình cùng lúc trên một máy thì tiến
trình kia còn đọc luật cũ tới một phút.

### Chỉnh từ Cài đặt của hub

Cùng cơ chế đó có mặt trong **Marketing Hub → Cài đặt → Từng app → Lịch tác
nghiệp**: trạng thái hiện tại, khung hằng tuần, và hai nút *Mở khoá 1 giờ* /
*Đóng 1 giờ*. Hub **không giữ luật** — nó gọi thẳng `/api/cua-so` của app con
qua proxy (`/api/lich-cua-so`), nên chỉ có một nơi giữ luật và hai màn hình
không thể lệch nhau.

### Xin huỷ MUỘN — lịch đã duyệt mà không đi được

Chỗ kẹt có thật: lịch đã duyệt, tới ngày nhân sự bất khả kháng không đi được. Họ
**không báo cáo được** (chưa đi thì không có gì nộp) mà cũng **không huỷ được**
(lịch đã duyệt thì huỷ là việc của quản lý). Lịch treo mãi ở làn *4 · Cần báo
cáo*, và cách duy nhất là nhắn riêng cho quản lý.

Nên mở một đường lùi, nhưng mở **muộn** và mở **nặng**.

**Muộn** — nút chỉ hiện từ **36 tiếng tính từ đầu ngày đi**, tức **12h trưa ngày
hôm sau**. Đo theo *đầu ngày* chứ không theo giờ đi: cả app đang dùng cùng thước
"đã qua" theo ngày, và một chuyến 6h sáng với một chuyến 22h cùng ngày thì không
có lý gì hạn xin huỷ lệch nhau 16 tiếng. Mốc này đứng **sau** mốc nhắc báo cáo
(9h sáng hôm sau) ba tiếng: giục nộp trước, không nộp được thì trưa mới mở đường
lùi. Mở sớm hơn thì nó thành nút huỷ tiện tay cho những chuyến chỉ đang chậm.

**Nặng** — cửa sổ đỏ, cố tình không giống cửa xin huỷ thường, và khác ba chỗ:

1. Kê ra **đúng những gì chuyến này đã tiêu tốn**, lấy từ chính bản ghi: vé FOC
   nào đã duyệt, mấy tệp vé đã gửi, Media đã nhận hỗ trợ chưa, mấy người đã xếp
   lịch đi cùng, chi phí dự kiến bao nhiêu. Một câu răn đe chung chung thì đọc
   xong vẫn bấm; bản kê cụ thể thì mới thấy mình đang bỏ đi cái gì — và quản lý
   cũng thấy đúng bản kê đó ngay trong ô chi tiết khi quyết.
2. Lý do phải là **câu thật** (tối thiểu 20 ký tự). Quản lý đọc "không đi được"
   thì không quyết được gì.
3. Phải **tự tay xác nhận** một dòng. Nút gửi khoá tới khi đủ cả hai điều kiện,
   để người ta biết mình còn thiếu gì thay vì bấm rồi nhận lỗi.

Gửi xong lịch **vẫn tính là đã duyệt** cho tới khi quản lý quyết — hàng đợi *Xin
huỷ lịch* của quản lý gắn thêm dấu `Đã duyệt · đã qua ngày đi`, vì bấm "Duyệt
huỷ" ở hai trường hợp này là hai quyết định khác nhau hẳn mà bảng thì trông y
như nhau.

Luật khai một chỗ ở `config.js` (`lateCancel`) và **chuyển cho giao diện qua
`/api/meta`**: nút hiện theo một mốc mà máy chủ chốt theo mốc khác thì người ta
bấm vào bị chặn và không hiểu vì sao. Chốt ở server, không chỉ ẩn nút:

| Quy tắc | Mã lỗi |
|---|---|
| Chưa tới mốc 36 tiếng (câu lỗi nói rõ mốc mở cửa) | `CANCEL_TOO_EARLY` |
| Lý do ngắn hơn 20 ký tự | `CANCEL_REASON_SHORT` |
| Lịch chưa có ngày đi nên không tính được mốc | `CANCEL_NO_DATE` |
| Xin huỷ mà không ghi lý do (mọi trạng thái) | `CANCEL_REASON_REQUIRED` |

Phép tính mốc tách riêng ra `huy-muon.js` vì nó phải cộng độ lệch Việt Nam
**trước** khi lấy đầu ngày — app này đã có một lỗi đúng kiểu đó (Render chạy giờ
UTC nên mọi mốc 00:00–06:59 giờ VN bị đẩy sang ngày hôm trước). Sai một ngày ở
đây nghĩa là nút huỷ mở sớm 24 tiếng, và không có gì trên màn hình nói ra điều
đó. `test/huy-muon.test.js` canh cả bốn góc giờ trong ngày.

Đường lùi này chỉ dành cho **người phụ trách**, và chỉ ở trạng thái `Duyệt/Chờ
tác nghiệp`. Đã bấm Báo cáo nghĩa là đã đi; nháp và chờ duyệt đã có cửa huỷ
riêng, nhẹ hơn hẳn.

**Còn thiếu:** trước mốc 36 tiếng, nhân sự biết chắc không đi được vẫn không có
nút nào — phải nói trực tiếp với quản lý. Đây là chủ ý (mở sớm thì mất tác dụng
của mốc), nhưng nếu chuyện này xảy ra thường thì nên có một đường riêng cho nó
chứ không nên nới mốc.

## Tự tạo đơn Tourwell khi đánh dấu "Đã thanh toán"

Mỗi buổi tác nghiệp đã chi tiền, anh Hùng phải làm **22 thao tác** trên Tourwell
để chi phí đó vào sổ: tạo đơn → chuyển thành công → nhận điều hành → gõ dòng chi
phí Quỹ Marketing → hoàn thành. Đoạn gõ số là chỗ dễ sai nhất, và đúng đoạn đó
thì Open API của Tourwell làm được.

Giờ khi quản lý bấm **Đã thanh toán**, `tourwell.js` gọi hai lần ghi:

| | |
|---|---|
| `POST /api/v1/orders/products` | tạo đơn **Dịch vụ khác**, khách Lê Văn Hùng, nguồn *Khác*, ngày = ngày tác nghiệp |
| `POST /api/v1/order-items/{id}/costs` | dòng chi phí **Quỹ Marketing**, SL 1, **VAT 8% đã gồm** |

Mã đơn ghi ngược vào cột **Đơn Tourwell** (`fld8XjYhLe`) của Base — cột này cũng
là **chốt chống tạo trùng**: đã có mã thì không tạo đơn lần hai.

**Đã kiểm chứng trên hệ thống thật** (đơn RT16407 / RT16408, 11/09/2026): chi phí
bắn ở *cấp đơn* tự chảy sang phiếu điều hành và Tourwell tự sinh luôn Phiếu đặt
dịch vụ cho Quỹ Marketing. Bước 13–21 của quy trình tay biến mất hẳn.

### Năm việc API KHÔNG làm được

Đơn tạo ra dừng ở trạng thái **"Đang xử lý"**. Còn phải bấm tay trên Tourwell:
chuyển thành công · xác nhận · tải UNC + hoá đơn · nhận điều hành · hoàn thành.
Cửa sổ kết quả trong app kê đúng năm việc này kèm link — **cố ý không giấu**, vì
người bấm mà tưởng đã xong thì tháng sau kế toán mới phát hiện đơn treo.

Cũng không đặt được ô *Tên dịch vụ* (đã thử 5 tên trường, máy chủ nhận hết nhưng
bỏ qua hết), nên tên hoạt động sống ở *Ghi chú đơn hàng* và ở dòng chi phí.

### Bật

Tính năng **tự tắt khi chưa có token**. Để bật, tạo `tourwell.json` (đã gitignore):

```json
{ "host": "rootytrip.tourwell.net", "token": "<token Api Official>" }
```

Hoặc đặt biến môi trường `TOURWELL_TOKEN` (dùng cách này trên Render). Token lấy
ở Tourwell → **Cấu hình → Quản lý tài khoản** → tài khoản **Api Official**
(`api@admin.com`) — *không phải* màn hình *API Key*. Tắt tạm: `"tat": true` hoặc
`TOURWELL_TAT=1`.

### Hai điều phải biết trước khi bật

1. **Người tạo đơn hiện là "Api Official"**, không phải anh Hùng — API không đổi
   được. Sale phụ trách thì vẫn đúng (Lê Văn Hùng, id 33).
2. **Đơn này lọt vào `GET /api/v1/orders`** — đúng nguồn mà app Ads Manager đọc
   để tính ROAS. Doanh thu bằng 0 nên không làm sai tiền, nhưng làm sai *số đơn*
   nếu ai đó đếm. Lọc bằng nguồn *Khác* + nhà cung cấp Quỹ Marketing.

Số danh mục (nguồn 17, NCC 274, sale 33, sản phẩm 280, dịch vụ 7, chi nhánh 1)
khai ở `SO` trong `tourwell.js` — **dò từ máy chủ thật, không cái nào đoán**.

## Kiểm thử

```bash
node test/api.test.js          # chỉ đọc
node test/quyen.test.js        # chỉ đọc, cần instance vai nhân sự ở 5175
node test/huy-muon.test.js     # thuần logic — không cần server, không cần Base
node test/cua-so.test.js       # thuần logic + soi nguồn
node test/tourwell.test.js     # thuần logic — ngày, VAT, số danh mục
```

`test/tourwell.live.test.js --that` tạo một đơn THẬT trên Tourwell rồi tự huỷ —
phép thử duy nhất chứng minh máy chủ nhận, vì tài liệu của Tourwell đã sai một
lần (bảo `service_id` chỉ nhận 6/10, thực tế nhận 7). Phải gõ `--that` mới chạy.

Thêm `--write` để chạy vòng ghi thật (tạo → sửa → đính kèm → xoá). Bản ghi thử
đặt tên `[TEST ...] <thời gian>` và bị xoá ở cuối bài, nhưng vẫn kích hoạt
workflow cảnh báo của Base.

`quyen.test.js` cần một instance thứ hai đóng vai nhân sự — chạy với file quyền
không chứa tài khoản đang đăng nhập:

```bash
PORT=5175 LARK_QUYEN_FILE=quyen.nhansu.json node server.js
```

Lần chạy gần nhất: **152 pass · 0 fail** (65 + 47 + 40).

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
tourwell.js      tạo đơn chi phí bên Tourwell khi đánh dấu đã thanh toán
quyen.json       danh sách open_id của quản lý
tourwell.json    host + token Tourwell (không lên git)
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
