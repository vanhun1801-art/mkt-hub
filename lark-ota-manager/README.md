# Booking OTA — Rooty Trip

Nhận booking từ 7 kênh OTA qua webhook, tự điền đủ thông tin khách rồi ghi vào
Lark Base. **Không ai phải nhập tay** — mở dashboard là xem và nhận booking.

```
OTA có booking mới → POST /webhook/<kênh> → chuẩn hoá → hàng đợi → Lark Base → dashboard
```

Kênh: `klook` · `kkday` · `gyg` (GetYourGuide) · `ctrip` · `waug` · `myrealtrip` · `viator`

## Hai màn hình

| | Dùng để |
|---|---|
| **Booking mới** | Vận hành hằng ngày. Thẻ số: tour hôm nay, tour ngày mai, 7 ngày tới, **cần liên hệ khách**, chưa ai nhận, booking về 24h qua. Bấm một thẻ là bảng dưới lọc theo đúng nhóm đó. (Thẻ *chưa ai nhận* chỉ hiện khi bảng `Bookings` đã có cột `Sales đã nhận`.) |
| **Thống kê OTA** | Booking · khách · tổng tiền · hoa hồng · **doanh thu thu về** theo từng kênh, theo ngày, theo tour; tỷ lệ huỷ / no-show. Mọi con tiền đọc từ công thức của Base. |
| *Thiết lập* | Xem lược đồ 3 bảng, cột nào còn thiếu, bảng giá đang dùng, đường webhook đưa cho OTA, thử mapping từng kênh. |

## Thứ tự danh sách

Mặc định sắp theo **ngày đi gần nhất trước** — đọc từ trên xuống là biết hôm nay
làm gì, không phải tự tìm:

```
1. Chưa có ngày đi     ← OTA chưa gửi, phải hỏi ngay, không được để lọt cuối
2. Hôm nay             ← cùng ngày thì theo GIỜ ĐÓN, đúng thứ tự xe chạy
3. Mai · Mốt · Còn N ngày
4. Đã qua N ngày       ← tour chạy rồi, xuống cuối
```

Mỗi dòng có nhãn tương đối (`Hôm nay · 07:30`, `Mai · 16:00`, `Còn 3 ngày`,
`Đã qua 6 ngày`) vì con số `02/09` một mình không nói được gì khi đang đứng ngày
31/08. Nút **Sắp theo → Mới về hệ thống** đổi sang thứ tự booking vừa gửi về
(`?sap=nhanLuc`) cho câu hỏi "vừa có booking nào mới".

## Trực tiếp vs Base

Huy hiệu ở góc trên phải — cùng chỗ, cùng kiểu với app quảng cáo:

| | |
|---|---|
| 🟢 **Trực tiếp** `10:16` | Luồng SSE đang mở: OTA gửi booking về là **hiện ngay**, không phải bấm Làm mới. Mặc định BẬT — đây là màn vận hành. |
| ⚪ **Đang xem số trong Base** `10:16` | Ảnh chụp lúc nạp, không tự cập nhật. Bấm Làm mới để nạp lại. |

Bấm huy hiệu để đổi qua lại; lựa chọn nhớ trong `localStorage`.

### Chế độ trực tiếp làm gì

`GET /api/su-kien` là luồng SSE. Mỗi lần webhook nhận booking (hoặc ai đó sửa
booking), server bắn một gói tin, client gộp 700ms rồi nạp lại — nhiều booking về
liền nhau chỉ tốn một lượt gọi API.

Gói tin **chỉ báo "có thay đổi"** kèm kênh + mã booking + tên khách để hiện toast,
**không mang số tiền**. Lý do: kênh này mở sẵn, không đi qua bước cắt tiền theo
quyền của từng endpoint — đẩy tiền vào đây là lách mất phân quyền. Client nghe tín
hiệu rồi tự gọi `/api/bookings`, chỗ đó mới cắt theo quyền.

Chi tiết kỹ thuật: nhịp tim 15s (proxy của lớp vỏ cắt socket im lặng quá 30s),
`retry: 3000` để `EventSource` tự nối lại, tối đa 24 kết nối cùng lúc, đóng hết khi
server nhận SIGTERM. Đường `/su-kien` được cho timeout vô hạn trong
`lark-mkt-hub/proxy.js` — nó cố ý mở mãi.

> ⚠️ Công cụ nào chờ `networkidle` sẽ treo trên app này, vì luồng SSE không bao giờ
> đóng. Dùng `load` hoặc `domcontentloaded`.

### Xem hàng đợi cục bộ

Không nằm ở huy hiệu (huy hiệu chỉ trả lời một câu: số đang tự chảy về, hay đang
đứng yên). Nó là việc soi lỗi, nên nằm ở **đường link trong băng thông báo**:

- Đọc được Base mà còn booking kẹt → băng "N booking chưa đẩy được lên Base" +
  link *Xem hàng đợi*
- Đang xem hàng đợi trong khi Base vẫn tốt → băng nói rõ "đây là lựa chọn của bạn"
  + link *Quay lại xem Base*

API: `?nguon=base|hang-doi`. Đệm tách theo từng nguồn — dùng chung một ô đệm thì
bấm đổi nguồn xong vẫn ra dữ liệu cũ suốt TTL, người dùng tưởng nút không ăn.

## Phân quyền

Theo đúng bảng **"Phân quyền app"** của Marketing Hub, giống ba app kia. Cấp quyền
xem base này cho một người: thêm `ota` vào dòng của họ trong bảng đó — không cần
sửa code.

| Quyền | Có thì | Không có thì |
|---|---|---|
| **quản lý** | mọi thứ, kể cả 3 thao tác thiết lập | — |
| **chi phí** | thấy tiền: OTA bán · hoa hồng · thực nhận · chênh lệch · **bảng giá NET** · tab Thống kê · xuất CSV | chỉ thấy phần vận hành |
| **được sửa** (`khongTao` tắt) | nhận booking, điền SĐT / điểm đón | chỉ xem |

`chi phí` ở app này nặng hơn các app khác vì nó che **cả bảng giá NET** — giá net
theo hợp đồng với OTA là thông tin thương mại. Hướng dẫn viên cần điểm đón và số
khách để chạy tour, không cần biết công ty ăn bao nhiêu một đầu khách.

**Cắt ở server, không phải ẩn ở giao diện.** Không có quyền chi phí thì
`/api/bookings` trả về bản ghi đã bị xoá hẳn các trường tiền, `/api/thongke` trả
`403`, CSV không có cột tiền, `/api/meta` không trả bảng giá. Kể cả cờ *"⚠️ OTA
trả THIẾU 200.000đ"* cũng bị lọc — cờ đó có chứa số tiền, ẩn cột mà để lọt cờ thì
vẫn lộ.

Chạy app trực tiếp (không qua lớp vỏ) thì **không áp phân quyền** — nếu không, mở
app trên máy cá nhân là tự nhiên mất quyền xem tiền.

## Cờ "Thông tin cần xử lý"

Thứ duy nhất cần đọc để biết booking nào phải gọi khách. **App tự tính, không ghi
vào Base** — cờ "còn 1 ngày" phụ thuộc hôm nay là ngày nào, ghi cứng vào Base thì
hôm sau nó sai. Khác với cột `Kiểm tra dữ liệu` của Base (soi dòng nhập thiếu:
thiếu ngày huỷ, tour chưa có giá thu về…) — app đọc và hiện cả cột đó, hai loại cờ
để riêng chứ không trộn.

```
⚠️ Chưa có SĐT              ⚠️ Chưa có điểm đón        ⚠️ Chưa có ngày đi
⚠️ Còn 1 ngày, chưa xác nhận ⚠️ Đã qua ngày đi mà chưa xác nhận
⚠️ Tiền EUR, chưa quy đổi    ⚠️ Hoa hồng ước tính       ✅ Đủ thông tin
```

**OTA không trả điểm đón thì để trống + bật cờ, KHÔNG suy đoán.** Booking đã huỷ
hoặc no-show không bị đòi thông tin nữa.

## Thiết lập

### 1. Base và ba bảng của nó

Base đã cắm sẵn:
[`XrMkbW5FPaQlHpsMSN8lQFO9geW`](https://rootytrip2.sg.larksuite.com/base/XrMkbW5FPaQlHpsMSN8lQFO9geW)

Base này **đã có sẵn và đang chạy thật** (booking nhập tay từ tháng 8/2026), do
người khác dựng. App bám theo nó chứ không bắt nó chiều mình:

| Bảng | Vai trò | App làm gì |
|---|---|---|
| `Bookings` | 44 cột · từng booking | đọc + **ghi** dữ liệu thô |
| `Danh mục OTA` | 7 kênh · `Hoa hồng %` · nguyên tệ mặc định | **chỉ đọc**, để nối link và biết % hoa hồng |
| `Danh mục Tour` | 7 tour · `Giá thu về NL/TE` | **chỉ đọc**, đây là **bảng giá NET** |

App dò table ID và field ID **theo tên**, nên đổi tên cột trong Base không làm
app chết — mở tab **Thiết lập** để xem cột nào khớp, cột nào chưa.

#### Chia việc: app ghi dữ liệu thô, Base tính tiền

Đây là điểm quan trọng nhất, và cũng là chỗ khác hẳn bản app đời đầu (bản đó tự
tính tiền rồi ghi vào cột số của chính nó). Bảng `Bookings` tính tiền bằng **công
thức**:

```
Gross VND        = Gross nguyên tệ × Tỷ giá về VND
HH % từ OTA      = FIRST([OTA].[Hoa hồng %])
Hoa hồng VND     = Gross VND × HH % từ OTA
Doanh thu thu về = Người lớn × [Tour].[Giá thu về NL] + Trẻ em × [Tour].[Giá thu về TE]
```

Nên app **không được ghi vào những cột đó** — ghi vào cột công thức là Lark từ
chối **cả bản ghi**, tức mất nguyên một booking chứ không chỉ thiếu một ô.
`config.js` đánh dấu chúng `chiDoc`, `schema.js` chặn thêm một lớp nữa **theo kiểu
cột thật trong Base** (phòng khi chủ base đổi một cột số thành công thức), và
`test/api.test.js` có phép thử canh đúng chỗ này.

Đổi lại: con số trên dashboard và con số trong Base **là một**, không thể lệch.

#### Hai cột liên kết quyết định mọi con tiền

`Bookings` không tự chứa kênh và tour — nó **trỏ** sang hai bảng danh mục:

- `OTA` → `Danh mục OTA` — quyết định % hoa hồng
- `Tour` → `Danh mục Tour` — quyết định giá thu về

Webhook ghi vào mà **không nối được hai link này** thì dòng đó ra **0đ và không
báo lỗi gì**. Nên `nhan.js` nối link ngay trước khi ghi (`noiDanhMuc`), nối không
được thì **kêu lên** — cảnh báo hiện trong app, và cột `Kiểm tra dữ liệu` của Base
cũng bắt được. Tên tour OTA gửi không bao giờ trùng tên danh mục
("Phu Quoc: 3-Island Speedboat + Hon Thom Cable Car" vs "Đảo cáp treo"), nên việc
khớp do bộ luật đa ngôn ngữ trong `gia.js` làm.

#### Cột app dùng của bảng `Bookings`

**Ghi** — dữ liệu thô OTA gửi:
`OTA` (link) · `Tour` (link) · `ID BK` · `Tên khách` · `Số điện thoại` · `Email` ·
`Ngày đặt` · `Ngày đi` · `Người lớn` · `Trẻ em` · `Điểm đón` · `Thị trường khách` ·
`Nguyên tệ` · `Gross nguyên tệ` · `Tỷ giá về VND` · `Trạng thái` · `Ngày huỷ` ·
`Lý do huỷ`

**Chỉ đọc** — công thức và cột tự động của Base:
`Kênh` · `Sản phẩm` · `Tổng khách` · `Gross VND` · `HH % từ OTA` · `Hoa hồng VND` ·
`Doanh thu thu về` · `Net VND` · `Lệch giá OTA vs bảng giá` · `Kiểm tra dữ liệu` ·
`Thời gian nhập` · `Người nhập` · `Đã nhận tiền` · `Kỳ đối soát`

#### Bốn cột nên thêm vào `Bookings`

App chạy được khi thiếu, chỉ mất tính năng — tab **Thiết lập** in sẵn danh sách:

| Cột | Kiểu | Thiếu thì mất gì |
|---|---|---|
| `Giờ đón` | Văn bản | sales phải mở lại từng booking bên OTA để biết đón mấy giờ |
| `Ghi chú khách` | Văn bản | mất yêu cầu riêng của khách (dị ứng, trẻ nhỏ, xe lăn…) |
| `Sales đã nhận` | Ô đánh dấu | **mất nút "Nhận booking"** cả trong app lẫn trên Marketing Hub |
| `Payload gốc` | Văn bản | mất bản gốc OTA gửi — không đối chứng được khi kế toán hỏi |

App **không tự tạo cột hộ**: tạo cột sai kiểu trong base vận hành là việc khó dọn,
và người vận hành base mới biết cột nào nên là select với option gì.

#### Quyền ghi: app tự hỏi trước, không đợi mất booking

Đọc được **không** có nghĩa là ghi được. Base do người khác dựng thường chỉ chia
sẻ ở mức *Có thể xem* — và đó là kiểu hỏng nguy hiểm nhất vì **trông như đang
chạy tốt**: mọi thẻ số, mọi bảng đều đầy đủ (chúng chỉ đọc), chỉ có booking mới
là lặng lẽ nằm lại hàng đợi.

Nên mỗi lần dò lược đồ, app hỏi thẳng Lark *"tài khoản này có quyền `edit` trên
base không"* và hiện kết quả ngay đầu tab **Thiết lập**; Marketing Hub cũng đẩy
nó lên đầu danh sách *Cần xử lý*. Quyền **không** được nhớ ra `.tmp/schema.json`
như tên cột — chủ base mở quyền một cái là đổi ngay, nhớ lại số cũ thì app còn
kêu oan rất lâu.

Không hỏi được (thiếu scope, mạng hỏng) thì trả `null` và **im lặng** — app không
doạ nhầm, và cũng không bao giờ tự cấm ghi dựa trên câu trả lời này: quyền có thể
vừa được mở mà đệm chưa hết hạn, cấm nhầm là mất booking.

Sửa: mở Base → **Chia sẻ** → nâng tài khoản (chế độ `cli`) hoặc ứng dụng Lark
(chế độ `api`) lên **Có thể chỉnh sửa** → bấm *Làm mới lược đồ* → *Đẩy hàng đợi
vào Base*. Booking chờ trong hàng đợi không mất.

#### Trạng thái: đúng 5 option của Base

`Chờ xác nhận` → `Đã xác nhận` → `Đã hoàn thành` / `Đã huỷ` / `No-show`

Base **không có** trạng thái "Hoàn tiền" riêng, nên OTA báo refund thì app ghi
`Đã huỷ` và điền thêm `Ngày huỷ` + `Lý do huỷ` (cột `Kiểm tra dữ liệu` của Base
bắt lỗi "Thiếu ngày huỷ"). Ghi một chuỗi ngoài 5 option trên là Lark chặn cả bản
ghi, nên `chuanhoa.js` quy mọi kiểu chữ của 7 OTA về đúng năm giá trị này.

### 2. Biến môi trường

| Biến | Ý nghĩa |
|---|---|
| `OTA_BASE_TOKEN` | Đoạn `TOKEN` trong `.../base/<TOKEN>?table=…`. Mặc định đã cắm base thật của Rooty Trip. Bỏ trống = chạy chế độ hàng đợi cục bộ. |
| `OTA_TABLE_ID` | ID bảng (tham số `?table=`). Mặc định đã cắm. App **kiểm tra ID này trước** rồi mới tin — không dùng được thì tự dò lại theo tên bảng. |
| `OTA_SCHEMA_LOI_TTL` | Bao lâu thì thử dò lại lược đồ sau một lần thất bại (mặc định 30000ms). |
| `OTA_WEBHOOK_SECRET` | Bí mật webhook. Chưa khai thì app **chỉ nhận webhook từ 127.0.0.1**. |
| `OTA_TABLE_OTA_ID` / `OTA_TABLE_TOUR_ID` | ID hai bảng danh mục. Mặc định đã cắm; khai sai thì app dò lại theo tên bảng. |
| `OTA_GIA_JSON` | Bảng giá **dự phòng** khi chưa nối được Base. Nối được rồi thì `Danh mục Tour` luôn thắng. |
| `OTA_RATES_JSON` | % hoa hồng **dự phòng**. Nối được Base thì `Danh mục OTA` luôn thắng. |
| `OTA_TY_GIA_JSON` | Tỷ giá về VNĐ, VD `{"USD":26200,"KRW":18.4}`. App điền vào cột `Tỷ giá về VND` để công thức `Gross VND` ra đúng. **Là số ước tính** — kế toán vẫn sửa tay khi đối soát. |
| `OTA_DANHMUC_TTL` | Bao lâu đọc lại hai bảng danh mục (mặc định 600000ms = 10 phút). |
| `OTA_TZ` | Múi giờ ngày tour, mặc định `7` (Phú Quốc). |
| `OTA_DEMO=1` | Cho phép nút "Tạo booking mẫu" khi đã nối Base thật. |

### 3. Đưa đường webhook cho OTA

```
# chạy sau Marketing Hub (khuyến nghị — chỉ một URL công khai)
POST https://<hub>/ota/webhook/klook
header: x-ota-secret: <OTA_WEBHOOK_SECRET>

# chạy trực tiếp app này
POST http://localhost:5177/webhook/klook?secret=<OTA_WEBHOOK_SECRET>
```

OTA không cho đặt header thì dùng `?secret=…`. Thêm `?dryRun=1` để xem app đọc
được những gì mà **không ghi gì cả** — dùng cái này lúc nối một OTA mới.

## Bảng giá NET — nguồn doanh thu chính

Hợp đồng của Rooty Trip là **giá NET cố định**: mình nhận đúng 650.000đ cho một
người lớn đi Tour cano 3 đảo, bất kể Klook bán 800k hay GetYourGuide bán 40 EUR.
Nên doanh thu tính từ bảng giá, không tính từ số OTA gửi.

**Bảng giá nằm trong Base, không nằm trong code.** Nguồn thật là cột
`Giá thu về NL` / `Giá thu về TE` của bảng `Danh mục Tour` — cũng chính là bảng mà
công thức `Doanh thu thu về` của Base đọc. Một nguồn cho cả hai phía, nên hai bên
không thể lệch nhau. Sửa giá là **mở Base sửa**, không deploy lại, không sửa code;
app đọc lại sau 10 phút hoặc ngay khi bấm *Làm mới lược đồ*.

Bảng đang chạy (VNĐ / khách):

| Tour trong danh mục | Người lớn | Trẻ em (1m–1m4) |
|---|--:|--:|
| Tour 3 đảo | 650.000 | 325.000 |
| Đảo cáp treo *(cano + cáp treo)* | 1.400.000 | 925.000 |
| Symphony *(Sunset Town)* | 1.100.000 | 750.000 |
| Cáp treo Hòn Thơm | 1.270.000 | 910.000 |
| Rạch Vẹm | 800.000 | 400.000 |
| Tour du thuyền | 1.900.000 | 1.400.000 |
| Tour Vinwonders - Grandworld | 1.725.000 | 1.055.000 |

Bảng giá trong `gia.js` **chỉ còn là phương án dự phòng** cho lúc chưa nối được
Base (booking vẫn phải vào hàng đợi và vẫn cần ước tính doanh thu). Phần đáng giá
còn lại của file đó là **luật nhận diện tên tour** — xem mục dưới.

### Thứ tự tin cậy của "Doanh thu thực nhận"

Nối được Base thì chỉ còn **một** nguồn: công thức `Doanh thu thu về` của bảng
`Bookings` = số khách × giá thu về trong `Danh mục Tour`. App đọc thẳng con số đó.

Bốn mức dưới đây là của **chế độ hàng đợi cục bộ** (chưa nối Base), lúc app phải
tự ước tính:

```
1. Bảng giá dự phòng × số khách  ← LUÔN ra VNĐ
2. Số OTA tự báo (net_amount)    ← nếu booking bằng VNĐ
3. Tổng tiền − hoa hồng OTA báo
4. Tổng tiền × (1 − % hợp đồng)  ← ước tính, có gắn cờ
```

**Thực nhận luôn là VNĐ**, kể cả booking bán bằng EUR/CNY — vì bảng giá là VNĐ.
Còn *Gross VND* thì cần **tỷ giá**: app điền cột `Tỷ giá về VND` theo bảng trong
`config.js` (sửa bằng `OTA_TY_GIA_JSON`), và đó là **số ước tính** để dòng mới
không rỗng — kế toán vẫn sửa tay khi đối soát. Booking ngoại tệ chưa có tỷ giá thì
tab Thống kê đếm riêng ở `thieuTyGia` chứ không lặng lẽ cộng vào tổng.

### Đối chiếu — chỗ giữ tiền cho công ty

Có cả bảng giá lẫn số OTA tự báo thì app so hai số. Lệch quá 1.000đ ⇒ cờ đỏ
`⚠️ OTA trả THIẾU 200.000đ so với bảng giá`, và ghi số lệch vào cột *Chênh lệch
bảng giá* để đối chiếu với báo cáo thanh toán. Ba nguyên nhân có thể: OTA trả sai,
app map sai sản phẩm, hoặc bảng giá trong app đã cũ. **Doanh thu vẫn ghi theo bảng
giá** — số OTA trả thiếu là tranh chấp, không phải doanh thu.

### Nhận sản phẩm từ tên tour OTA gửi

Tên OTA không khớp tên bảng giá: Klook gọi "Phú Quốc: Cano 3 đảo + Cáp treo Hòn
Thơm", bảng giá ghi "Tour cano + cáp treo". Mỗi sản phẩm khai **luật nhận diện**
(nhóm token phải có / không được có) thay vì một cái tên, kèm alias tiếng Anh,
tiếng Hàn, tiếng Trung. Khớp đúng một sản phẩm mới nhận; không khớp hoặc khớp hai
sản phẩm ngang nhau thì **bật cờ chứ không đoán** — đoán sai sản phẩm là sai tiền.

Hai chỗ app **cố ý không tự quyết**:

- **Trẻ em tính theo CHIỀU CAO 1m–1m4, OTA gửi theo TUỔI.** Một bé 9 tuổi có thể
  cao hơn 1m4 ⇒ phải tính giá người lớn. App tính theo đúng cái OTA gửi rồi bật cờ
  `⚠️ Trẻ em — xác nhận chiều cao 1m–1m4` để hướng dẫn viên đo tại điểm đón.
- **OTA chỉ gửi tổng số khách, không tách người lớn / trẻ em** (GetYourGuide hay
  gửi kiểu này) ⇒ cờ `⚠️ Chưa tách người lớn / trẻ em`. Coi hết là người lớn thì
  tính vượt tiền của khách, coi hết là trẻ em thì mình mất tiền.

## % hoa hồng OTA giữ lại

**Nguồn thật là cột `Hoa hồng %` của bảng `Danh mục OTA`** — công thức
`HH % từ OTA` của Base lấy từ đó, rồi `Hoa hồng VND = Gross VND × HH %`. Sửa hợp
đồng thì sửa trong Base, không sửa code.

Số đang nằm trong danh mục (chủ base ghi chú là "mức phổ biến, cần SỬA lại theo
hợp đồng thực tế" — **nên kiểm lại trước khi tin báo cáo hoa hồng**):

| Kênh | % OTA giữ | Kênh | % OTA giữ |
|---|--:|---|--:|
| GetYourGuide | 30% | Klook | 15% |
| Viator | 22% | KKday | 15% |
| MyRealTrip | 20% | Ctrip / Trip.com | 15% |
| | | WAUG | 10% |

Bộ % trong `config.js` (`OTA_RATES_JSON`) **chỉ là dự phòng** cho chế độ hàng đợi
cục bộ và hiện đang khác danh mục ở ba kênh — Base luôn thắng.

**Bộ % này chỉ còn là phương án chót** — dùng khi không map được sản phẩm trong
bảng giá NET, và khi OTA cũng không trả số hoa hồng thật. OTA gửi kèm
`commission_amount` hay `net_amount` thì app luôn lấy số của OTA — số thật thắng
số hợp đồng, vì đó mới là số dùng để đối chiếu thanh toán. Booking phải ước tính
được gắn cờ `⚠️ Hoa hồng ước tính`, và màn Thống kê đếm riêng chúng.

Cột **% HH** ở bảng "Theo kênh OTA" là % **thực tế tính từ tiền**, không phải %
cấu hình. Lệch quá 2 điểm thì app in thêm dòng `cấu hình 30%` ngay dưới — đó là
dấu hiệu hợp đồng đã đổi mà chưa cập nhật, hoặc OTA tính sai.

Hợp đồng đổi thì sửa cột `Hoa hồng %` trong bảng `Danh mục OTA` — không cần sửa
code, không cần deploy lại. `OTA_RATES_JSON` chỉ còn dùng cho chế độ hàng đợi.

## Khi OTA đổi tên khoá trong payload

App không có bảy adapter cứng. Nó làm phẳng payload thành `đường dẫn → giá trị`
rồi khớp tên khoá cuối với danh sách tên gọi (alias), ưu tiên đường dẫn nông
nhất; mỗi kênh khai thêm alias riêng ở `chuanhoa.js → KENH_ALIAS`. Nhờ vậy
payload lồng sâu như `logistics.travelerPickup.pickupPoint` của Viator vẫn ra
được điểm đón.

Nối OTA thật mà thấy trường nào trống:

1. Bắn payload thật vào `POST /webhook/<kênh>?dryRun=1` (hoặc bấm **Thử mapping**
   trong tab Thiết lập).
2. Xem cột **Lấy từ** — nó in ra đúng đường dẫn mà mỗi trường đọc được.
3. Thêm tên khoá thật của OTA vào `KENH_ALIAS.<kênh>` trong `chuanhoa.js`.

Không phải sửa logic, không phải sửa `store.js` hay `server.js`.

> **Tên khoá trong `mau.js` là DỮ LIỆU MẪU, không phải hợp đồng API.** Chúng gom
> từ tài liệu partner và phải đối chiếu lại với payload thật của từng kênh.

## Những chỗ app cố ý KHÔNG tự quyết

| Tình huống | App làm gì |
|---|---|
| OTA không trả điểm đón / SĐT | Để trống + bật cờ. Không suy đoán từ tên tour hay booking cũ. |
| OTA gửi lại booking mà thiếu điểm đón | **Giữ** giá trị sales đã điền, không xoá. Có giá trị thì OTA thắng. |
| OTA không trả hoa hồng | Ước tính theo % cấu hình **và gắn cờ "Hoa hồng ước tính"**. |
| Booking tính bằng USD/EUR/CNY | Ghi nguyên tệ vào cột **Tiền tệ**, hiển thị đúng nguyên tệ, và **không cộng vào các ô tiền VNĐ** của màn Thống kê (đếm riêng ở `ngoaiTe`). App không tự quy đổi — tỷ giá nào, ngày nào là quyết định của kế toán. |
| OTA gửi tổng khách lệch người lớn + trẻ em | Giữ số của OTA + cảnh báo cần đối chiếu. |
| Ngày không đoán được chắc chắn | Để trống. Thà trống hơn sai ngày chạy tour. |
| Booking huỷ / hoàn tiền | Không cộng vào doanh thu; đếm riêng ở `huy` / `hoanTien`. |
| Sửa tay trong app | Chỉ SĐT, email, điểm đón, giờ đón, ghi chú, ngôn ngữ, trạng thái, đã nhận. **Mã booking và số tiền không cho sửa** — còn phải đối chiếu với báo cáo thanh toán của OTA. |

## Chống trùng & không mất booking

Booking nhận được ghi vào **hàng đợi cục bộ trước**, rồi mới đẩy vào Base. Lark
lỗi hay token hết hạn thì webhook vẫn trả `200` và booking vẫn còn — trả 4xx/5xx
cho OTA là cách mất booking nhanh nhất, vì phần lớn OTA chỉ thử lại vài lần.

Chống trùng hai lớp theo khoá **(kênh, mã booking)**: hàng đợi giữ luôn
`record_id` đã tạo; trước khi tạo mới còn soi lại dữ liệu Base. Lớp thứ hai tồn
tại vì ổ đĩa Render là tạm — sau mỗi deploy hàng đợi trắng mà OTA vẫn có thể gửi
lại booking cũ.

## Chạy & kiểm thử

```bash
node server.js                    # http://localhost:5177
node test/chuanhoa.test.js        # 208 phép thử, thuần tính toán, không cần server
node test/api.test.js             # cần server. Phần GHI tự bỏ qua khi đã nối Base thật

# Phần phân quyền chỉ chạy được ở chế độ `api` (chế độ cli coi người ngồi trước
# máy là quản lý nên không có gì để kiểm). Bật một server riêng rồi trỏ test vào:
OTA_QUEUE_FILE=/tmp/ota/hd.json OTA_SCHEMA_FILE=/tmp/ota/sc.json \
  LARK_MODE=api PORT=5179 node server.js
APP_URL=http://localhost:5179 LARK_MODE=api node test/api.test.js
```

## File

| File | Việc |
|---|---|
| `config.js` | Cổng, chế độ cli/api, 7 kênh, 3 bảng của base, bản đồ cột (tên · kiểu · **chỉ đọc hay ghi được**), option của các cột select, tỷ giá |
| `chuanhoa.js` | Bộ trích sâu theo alias, đọc số/ngày/giờ/SĐT, map trạng thái, tính cờ cần xử lý |
| `gia.js` | Luật nhận tour từ tên OTA gửi (Anh · Trung · Hàn); giá lấy từ `Danh mục Tour`, bảng trong file chỉ là dự phòng |
| `danhmuc.js` | Đọc `Danh mục OTA` + `Danh mục Tour` — nguồn của % hoa hồng, giá thu về, và record_id để nối link |
| `mau.js` | Payload mẫu 7 kênh — cho test và nút "Thử mapping" |
| `schema.js` | Dò table ID + field ID theo tên (cả 3 bảng), tách cột **ghi được** khỏi cột công thức, nhớ vào `.tmp/schema.json` |
| `hangdoi.js` | Hàng đợi cục bộ — lưới an toàn cho webhook |
| `nhan.js` | Nhận booking, gộp với dữ liệu cũ, **nối link OTA/Tour**, upsert vào Base, đẩy hàng đợi, sửa booking |
| `store.js` | Đọc booking (Base hoặc hàng đợi), chuyển booking ⇄ ô của Base — **chỉ ghi vào cột không phải công thức** |
| `thongke.js` | Lọc + cộng dồn cho hai màn hình |
| `server.js` | HTTP: `/api/*` cho dashboard, `/webhook/*` cho OTA |
| `lark.js` / `larkapi.js` | Hai backend cùng chữ ký: lark-cli (máy cá nhân) / Open API (server chung) |
