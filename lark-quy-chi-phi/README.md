# Rooty Trip · Quỹ chi phí Marketing

Sổ quỹ tạm ứng của phòng Marketing, chạy trên Lark Base **Chi phí Marketing**
(`IQfUbtDDZacFdCsl657l9hOPged`). Thay cho Google Sheet *"Quỹ công ty tạm ứng chi
trước"* — 6 tab, 162 dòng, đã nhập hết vào Base ngày 11/09/2026.

```bash
node server.js          # http://localhost:5182
```

Hoặc bấm `start.bat`. Vào qua Marketing Hub thì Hub tự bật.

## Vì sao bỏ sheet

| | Sheet cũ | Base + app |
|---|---|---|
| Hết quỹ | mở tab mới | ghi một dòng ở *Các lần ứng tiền* — vẫn một quỹ |
| Số dư | cột `Tồn` gõ tay từng dòng, chia theo tab | **một con số** = tổng đã ứng − tổng đã chi, không gõ được nên không lệch được |
| Chứng từ | link Google Drive, kế toán phải xin quyền | tệp đính kèm ngay trong bảng |
| Chứng từ thiếu | không ai nhìn ra | thẻ "Cần bổ sung chứng từ" đếm sẵn, dòng tô đỏ |
| Quyết toán | sửa mã QTTU từng dòng | chọn nhiều khoản, gán một lượt |

## Ba bảng

```
Đợt tạm ứng    một kỳ quỹ (PC9955, THÁNG 09…). Công thức: Tổng nạp · Tổng đã chi · Còn lại
Lần nạp quỹ    mỗi lần công ty đưa tiền — đây là cái app gọi là 'Các lần ứng tiền'
Chi phí        từng khoản chi — thứ kế toán đọc
```

Cột **Lý do từ chối** (`fldNJ2yJUW`) và lựa chọn **Kế toán trả lại** trong cột
Tình trạng thêm ngày 15/09/2026, khi kế toán bắt đầu dùng app.

## Quỹ là MỘT cục

Sáu mã phiếu chi chỉ là sáu lần công ty ứng tiền, **không phải sáu túi tiền
riêng** — tiêu thì tiêu từ một quỹ. Nên app không chỗ nào bắt chọn "chi từ cục
nào": số dư là một con số ở đầu trang, bằng *tổng đã ứng − tổng đã chi*. Bản ghi
vẫn gắn vào một đợt do server tự chọn, phục vụ việc kế toán đối chiếu phiếu chi.

Một chỗ phải cẩn thận: bốn dòng **"Chuyển từ kỳ trước"** trong bảng *Lần nạp quỹ*
là tồn của kỳ trước mang sang, không phải tiền công ty đưa thêm. Cộng cả vào thì
quỹ phồng lên 11.194.600 đ không có thật — có một phép thử canh đúng chỗ này.

Số dư cũng không cộng dồn theo dòng như sheet: chèn một dòng cũ vào giữa là phải
tính lại cả cột. Cộng cả sổ mỗi lần đọc thì không bao giờ lệch.

### Khoản 559.931 đ sheet đánh rơi giữa hai tab

Cộng gộp thành một cục lần đầu thì quỹ ra **6.818.125 đ**, thiếu đúng 559.931 đ
so với con số anh Hùng vẫn dùng. Nguyên do: đợt PC9955 tiêu âm chừng đó, nhưng
khi mở tab PC16900 sheet bắt đầu lại từ 15.000.000 chẵn nên phần âm rơi mất giữa
hai tab.

Anh Hùng xác nhận 12/09/2026: **7.378.056 đ là đúng** — công ty đã bù. Nên sổ ghi
thêm một dòng ứng 559.931 đ ngày 16/04/2026 (ngày chi đầu tiên của PC16900), chứ
không sửa số cho vừa khớp. Giờ `65.559.931 − 58.181.875 = 7.378.056`.

## Ba vai

| Vai | Làm được | Cột chứng từ thấy gì |
|---|---|---|
| **chuQuy** — anh Hùng | khai chi · nạp quỹ · đính chứng từ · sửa · xoá · quyết toán | Hoá đơn **và** UNC |
| **keToan** — `tentt@rootytrip.com` | đọc · mở chứng từ · **duyệt / trả lại từng khoản** · quyết toán theo lô | **chỉ Hoá đơn** |
| **xem** — người còn lại | đọc | chỉ Hoá đơn tên xám, không mở được nút nào |

Kế toán từng bị xếp chung với "xem". Sai: việc của họ là **đóng sổ**, không phải
ngắm sổ. Bắt họ mở Base sửa mã QTTU từng dòng thì đúng cái việc app này sinh ra
để bỏ. Nên `quyết toán` có chốt riêng (`doiQuyenQuyetToan`), rộng hơn chốt ghi sổ.

**Vì sao kế toán không thấy UNC**: uỷ nhiệm chi là bằng chứng tiền đã rời tài
khoản — việc đối chiếu ngân hàng của người giữ quỹ. Kế toán cần hoá đơn để ghi
chi phí và soi mã số thuế. Bày cả hai ra chỉ làm dòng dài gấp đôi và mắt phải bỏ
qua một nửa. Anh Hùng chốt 12/09/2026.

Mọi lệnh ghi bị chặn **ở server**, không chỉ ẩn nút — ẩn nút chỉ là phép lịch sự
với mắt người dùng.

Ai là chủ quỹ được quyết theo thứ tự: **cờ `x-hub-user-manager` do Hub gửi
xuống** trước, rồi mới tới danh sách `LARK_CHU_QUY`. Đừng đảo lại — `open_id`
**khác nhau theo từng app Lark**, nên id lấy từ bản ghi Base (app Tracking)
không bao giờ khớp id Hub gửi (app riêng của Hub). Chính chỗ này làm anh Hùng mở
bản web ra thấy mình bị coi là khách chỉ xem hôm 12/09/2026.

### Khai ai là kế toán

Mặc định là **`tentt@rootytrip.com`**, khai sẵn trong `config.js` nên bản trên
Render chạy được ngay, không phải đặt thêm biến môi trường. Thêm hoặc đổi người:

```bash
LARK_KE_TOAN=tentt@rootytrip.com,ai-do@rootytrip.com
```

Nhận **email · họ tên · open_id**, cái nào cũng khớp, không phân biệt hoa
thường. **Nên dùng email**: `open_id` khác nhau theo từng app Lark — chính chỗ
này làm anh Hùng mở web ra thấy mình là khách hôm 12/09/2026 — còn tên tiếng
Việt thì dễ gõ sai dấu.

Hub giữ **hai** email của mỗi người (`enterprise_email` công ty cấp và email
đăng nhập Lark) đúng để khớp được cả hai, nhưng `proxy.js` trước đây chỉ chuyển
tiếp một cái. Nay chuyển cả hai qua `x-hub-user-email` và
`x-hub-user-email-phu`, nên khai kiểu nào cũng trúng.

Kế toán vẫn xem Base được nếu muốn. Ba view dựng sẵn cho họ:

- `Kế toán · đã chi` — mọi khoản đã chi
- `Kế toán · chờ quyết toán` — đã chi mà chưa có mã QTTU
- `Cần bổ sung chứng từ` — chưa quyết toán, chưa được miễn, và không có mảnh
  giấy nào

App **không còn nút "Base"** — vào thẳng sổ trên Lark thì mở từ Hub, còn trong
app thì mọi thứ cần đọc đã có sẵn. Nút đọc lại dùng đúng chữ **"Làm mới"**, đúng
`id="btnRefresh"` và đúng câu tooltip như bảy app còn lại của phòng: một app gọi
khác đi là người dùng phải học lại một nút vốn đã biết.

Cả ba view sắp theo **ngày thanh toán mới nhất trước**, và mang sẵn những cột kế
toán cần đọc: thời gian · mã đơn hàng · tên người chi · số tiền · chứng từ · mã
số thuế NCC.

## Một kỳ là một tháng

Anh Hùng và kế toán chốt sổ theo tháng, nên dải số trên đầu trang là **số của
một kỳ**, và chúng phải cộng khớp nhau:

```
số dư đầu kỳ  +  nạp trong kỳ  −  chi trong kỳ  =  tồn cuối kỳ
```

Trước đây màn hình chỉ có *Còn trong quỹ* (một con số sống, không thuộc kỳ nào)
và *Chi tháng này*. Kế toán nhìn vào **không dựng lại được phép tính trên**, nên
vẫn phải mở sheet ra cộng tay — đúng việc app này sinh ra để bỏ.

Lọc sang tháng nào thì cả dải số nhảy theo tháng đó, và ô đầu đổi tên từ *Còn
trong quỹ* thành *Tồn cuối tháng MM/YYYY*: cùng một phép tính, khác cái tên vì
khác câu hỏi người ta đang hỏi.

Bản ghi **không có ngày** tính vào "trước kỳ" — chúng là dữ liệu cũ nhập từ
sheet. Xếp vào kỳ hiện tại thì tháng này tự dưng phình ra một khoản không ai
tiêu.

### Một dòng nạp không có ngày làm lệch mọi kỳ

Ngày 15/09/2026 kế toán đối chiếu app với sheet và ba tháng đều lệch. Nguyên do
không nằm ở phép tính mà ở **bốn bản ghi**:

- **một dòng nạp 10.000.000 KHÔNG CÓ NGÀY.** App xếp "không ngày" vào trước mọi
  kỳ — đúng cho 162 dòng cũ nhập từ sheet, sai cho dòng này. Hậu quả: số dư
  **đầu kỳ** của tháng 7, 8 và 9 đều phồng lên đúng 10 triệu. Không lỗi nào bật
  ra, tổng quỹ vẫn đúng; chỉ phần chia theo kỳ sai — đúng thứ kế toán đọc.
- **ba khoản chi làm tháng 8, thanh toán chậm sang tháng 9.** Trong sheet chúng
  nằm ở tab THÁNG 09; Base đọc ngày thanh toán 27–30/08 nên xếp vào tháng 8.

Sửa: đặt **Ngày thanh toán** = 01/09/2026 cho ba khoản đó và cho dòng nạp, giữ
nguyên **Ngày đề nghị**. Đó không phải mẹo cho khớp số — khoản phát sinh tháng 8
mà trả tiền tháng 9 thì hai cột phải ghi hai tháng khác nhau, đúng nghĩa của
chúng. Nhân tiện lấp mã điều hành `SG21049` mà Base bỏ trống còn sheet có.

Hai dòng ứng gốc (20.000.000 PC9955 và 15.000.000 PC16900) cũng thiếu ngày; đặt
bằng ngày chi đầu tiên của chính đợt đó, cùng cách đã dùng cho dòng bù 559.931.

Sau khi sửa, **cả ba kỳ khớp tuyệt đối với sheet**, kể cả tháng 7 và tháng 8 anh
Hùng đã chốt — tức là sửa để khớp với sổ đã chốt, không phải sửa sổ đã chốt:

| Kỳ | Đầu kỳ | Nạp | Chi | Cuối kỳ |
|---|---:|---:|---:|---:|
| THÁNG 07 | 2.009.200 | 10.000.000 | 9.079.000 | 2.930.200 |
| THÁNG 08 | 2.930.200 | 10.000.000 | 11.960.200 | 970.000 |
| THÁNG 09 | 970.000 | 10.000.000 | 4.490.944 | 6.479.056 |

**Không cần thêm cột "Kỳ".** Bản ghi mới đã tự đúng: khai khoản chi thì *Ngày
thanh toán* mặc định là hôm nay, và app Lịch tác nghiệp cũng ghi ngày bấm nút.
Lệch chỉ xảy ra với dữ liệu nhập từ sheet, nơi một ngày bị chép vào cả hai cột.

Hai phép thử canh chỗ này: **không bản ghi nào được thiếu ngày**, và **cuối kỳ
tháng trước = đầu kỳ tháng sau** suốt cả chín kỳ.

### Chuông báo kỳ đóng sổ âm

Ngày 15/09/2026 anh Hùng sửa lại tình trạng một loạt khoản, và nhân đó ba khoản
(1.465.200 đ) quay về ngày **31/08** thay vì 01/09. Tháng 8 lập tức đóng ở
**−495.200 đ**, trong khi chính anh và kế toán đã chốt tháng đó ở 970.000.

Không gì bật ra. Tổng quỹ vẫn đúng 6.479.056, mọi dòng vẫn xanh — phải ngồi dò
tay từng tháng mới thấy.

**Quỹ tạm ứng không âm được**: tiêu là tiêu tiền đã ứng. Nên một kỳ ra số âm
luôn là lỗi dữ liệu, gần như chắc chắn do gõ nhầm ngày thanh toán làm một khoản
rơi sang tháng khác. Giờ có một vệt đỏ đứng **trên** cả dải số — vì nếu có kỳ
âm thì mọi con số bên dưới đều đang kể một câu chuyện sai.

Hai phép thử canh: `giao-dien.test.js` đẩy một khoản to sang tháng trước rồi đòi
thấy vệt đỏ; `quy.test.js` quét sổ thật, không kỳ nào được âm. Bài đầu tiên đỏ
ngay khi viết xong — nó bắt được chính **dữ liệu mẫu** của phép thử: sổ mẫu chỉ
có một lần nạp và đặt ở tháng 9 nên tháng 8 âm, một quyển sổ không tồn tại được
ngoài đời.

Kèm một chốt nữa: **mã quyết toán và tình trạng phải nói cùng một chuyện.** Hôm
đó có một dòng đeo mã `TEST` trong khi tình trạng là *Đã chi* — dấu vết bấm thử.
Nó không chỉ xấu: `quyetToanDuoc()` coi khoản có mã là đã đóng sổ, nên dòng đó
bị ô tích "chọn hết" bỏ qua và kế toán thấy nút *Đổi mã* thay vì *Quyết toán /
Từ chối*.

## Kế toán duyệt hoặc trả lại từng khoản

Quyết toán theo lô hợp với anh Hùng: đóng sổ một đợt hàng chục khoản. Kế toán
làm ngược lại — soi **từng dòng**. Nên mỗi dòng có hai nút:

- **Quyết toán** — nhập mã, ghi thẳng vào cột *Mã quyết toán* sẵn có (một khoản
  **một** mã; đẻ ô thứ hai là hai bên mỗi người nhìn một con số rồi cãi nhau xem
  cái nào thật). Mã gõ lần trước được điền sẵn cho lần sau, vì một xâu khoản
  thường chung một mã. Khoản đã đóng sổ chỉ còn nút **Đổi mã**.
- **Từ chối** — bắt buộc ghi lý do, kèm năm câu soạn sẵn bấm là điền.

Trả lại thì khoản chuyển sang tình trạng **Kế toán trả lại** (đỏ), và câu của
kế toán hiện **ngay dưới nội dung** trong sổ của anh Hùng, không giấu trong ô
Ghi chú. Đây là đường duy nhất thông tin đi ngược từ kế toán về người giữ quỹ;
một dòng đỏ không kèm chữ thì chỉ đẻ ra một tin nhắn hỏi *"sao trả?"* — đúng
cái vòng app này định cắt.

Ô đếm **Kế toán trả lại** chỉ mọc khi có khoản bị trả. Một ô số 0 đứng thường
trực là ô người ta học cách không nhìn, rồi đúng lúc nó khác 0 cũng trôi qua mắt.

Duyệt một khoản là **xoá lời từ chối cũ**: khoản đã qua rồi mà còn treo câu
"thiếu hoá đơn" thì lần sau đọc lại không biết còn đúng nữa không.

## Bốn việc app làm

1. **Số dư quỹ** — màn hình đầu trả lời ngay "còn bao nhiêu", kèm chi tháng này,
   số khoản thiếu chứng từ, số khoản chờ quyết toán
2. **Khai khoản chi** + đính hoá đơn/UNC ngay tại dòng của khoản
3. **Quyết toán theo lô** — chọn nhiều khoản, gán một mã QTTU, đổi tình trạng
4. **Cảnh báo cần bổ sung chứng từ** — tab riêng, dòng tô đỏ trong mọi danh sách

## Ba chốt chống mất tiền, mất dấu

Rà lại toàn bộ ngày 13/09/2026, đây là ba chỗ đã hỏng hoặc sắp hỏng:

**1. "Chọn hết" từng quét cả khoản đã đóng sổ.** Sổ có 163 khoản, **154 khoản
mang mã QTTU riêng** từ những đợt quyết toán cũ. Một cú tích ở đầu bảng rồi một
cú bấm *Quyết toán 163 khoản* là ghi đè sạch 154 mã đó — không hoàn lại được, và
kế toán mất đường đối chiếu với phiếu chi cũ. Giờ ô tích chỉ quét khoản **chưa
có mã và đã chi tiền**; tick từng dòng vẫn sửa được một mã gõ nhầm, nhưng cửa sổ
sẽ đỏ lên và nói thẳng sắp xoá mã nào. Server chốt lại bằng mã `GHI_DE_MA_CU`
(409) — cảnh báo trên màn hình không phải hàng rào, một tab mở từ hôm qua là đủ.

**2. Bấm hai lần là hai khoản chi.** *Ghi vào sổ* gọi Tourwell nên mất 3–8 giây,
mà nút không đổi gì trong lúc chờ. Bấm lại vì tưởng hụt là đẻ ra **một khoản chi
thứ hai và một đơn Tourwell thứ hai** — quỹ bị trừ hai lần cho một lần tiêu.
`chongBamHai()` khoá nút tới khi lời gọi xong.

**3. Tourwell hỏng thì không có đường tạo bù.** Tài liệu cũ bảo *"xoá ô Mã đơn
rồi khai lại"* — tức là đẻ thêm một dòng chi. Lời khuyên đó tệ hơn cả cái lỗi nó
định chữa. Giờ dòng nào chưa từng qua Tourwell có nút **+ đơn Tourwell** ngay
tại chỗ.

Nút đó **không mọc trên 162 khoản cũ**, dù chúng đều trống ô Mã đơn: chúng đã đi
qua Tourwell bằng tay, dấu vết là mã điều hành `SG…` và mã quyết toán. Mời tạo
đơn cho chúng là bày sẵn 162 cái bẫy, bấm nhầm một cái là một đơn THẬT mọc lên
cho khoản tiền đã đóng sổ từ tháng 4. Server chặn lại bằng `DA_QUA_TOURWELL`.

Ngoài ra: xoá một khoản chi giờ nói rõ **đơn Tourwell không tự huỷ** và khoản do
app Lịch tác nghiệp ghi sang thì xoá rồi không ghi lại được.

## Soát lại toàn app · 15/09/2026

**Một lỗi thật, im lặng hoàn toàn**: gõ vào ô tìm kiếm rồi bấm ô tích "chọn hết"
thì không chọn được gì. Gõ tìm chỉ vẽ lại phần `.bang` (để con trỏ khỏi nhảy
khỏi ô tìm), mà vẽ lại là đẻ ra một `#chonHet` MỚI — cái cũ mang listener đã bị
vứt đi cùng bảng. Chuyển `#chonHet` và `#btnNap2` sang **uỷ quyền ở document**:
bảng vẽ lại bao nhiêu lần cũng không đứt.

**Một bẫy suýt làm mất bản ghi**: khi thêm phím Enter để bấm nút chính của cửa
sổ, `querySelector('button.primary, button.nguyhiem')` trả về phần tử **đứng
trước trong DOM** — mà cửa sổ *Sửa khoản chi* đặt nút **Xoá khoản này** trước
nút Lưu. Gõ xong bấm Enter là xoá mất bản ghi trong khi người ta tưởng vừa lưu.
Đổi thành hai lần tìm, `.primary` trước. Có bốn phép thử canh đúng chỗ này.

**Ô tìm bỏ sót mã đơn RT** — đúng mã kế toán đối chiếu nhiều nhất. Dán
`RT16438` vào ô tìm ra rỗng vì nó chỉ soi mã điều hành `SG…`. Nay tìm được cả
mã đơn, mã số thuế và lý do trả lại.

**Thao tác**: Enter trong cửa sổ = bấm nút chính (ô nhiều dòng thì Ctrl+Enter),
vì chị kế toán duyệt hàng chục dòng liên tiếp và mỗi lần lại phải rời bàn phím
đi tìm chuột. Cửa sổ duyệt từng khoản nay cũng cảnh báo khoản còn **"Chờ chi"**
— trước chỉ cửa sổ theo lô mới cảnh báo, tức là đóng sổ từng dòng là con đường
lách được lời nhắc, mà đó lại là cách kế toán làm nhiều nhất.

**Câu chữ**: nút lúc đang chạy nói đúng việc — *Đang quyết toán… · Đang trả
lại… · Đang tạo đơn…* thay vì "Đang lưu…" cho tất cả. Ô *Chi trong kỳ* thay câu
chỉ dẫn "bấm một tháng ở bộ lọc…" bằng **số khoản** của kỳ: câu chỉ dẫn đứng
thường trực thì đọc một lần là thừa mãi mãi.

**Độ ồn**: nút *Đổi mã* của kế toán mọc trên 162/164 dòng đã đóng sổ, dựng một
hàng nút chạy suốt trang tranh chỗ với hai nút thật sự cần bấm. Hạ xuống dáng
chữ mờ — vẫn bấm được, thôi gọi mắt. Giờ cả bảng chỉ còn 4 nút nổi.

Dọn ba thứ chết: `cacLanUng()`, `$$()`, `S.dot` — khai ra rồi không ai đọc.

## Luật cảnh báo chứng từ

Luật đầu tiên là *"không đủ cả hoá đơn LẪN UNC = thiếu"*. Nó gắn cờ **68/162
khoản**, trong đó **67 khoản kế toán đã kiểm và đóng sổ từ lâu**. Một cảnh báo
réo sai 67 lần thì lần thứ 68 cũng không ai nhìn.

Luật đúng, theo cách kế toán thật sự làm việc:

- **Đã quyết toán thì thôi.** Có mã QTTU nghĩa là kế toán đã kiểm và chấp nhận.
- **"Không cần chứng từ" là một câu trả lời hợp lệ**, không phải chỗ trống. Chi
  nhỏ lẻ, hỗ trợ tiền ăn thường không có hoá đơn VAT — hoá đơn tay hoặc ảnh là
  đủ và kế toán vẫn duyệt. Cột **Chứng từ** ghi nhận điều đó.
- **Chỉ cần MỘT bằng chứng, không đòi cả hai.** Trả tiền mặt thì không bao giờ
  có UNC; mua ở chỗ không xuất hoá đơn thì chỉ có UNC.

Sau khi sửa: **1/162 khoản** cần bổ sung thật. Có bốn phép thử giữ cho luật cũ
không lặng lẽ quay lại.

## Dữ liệu cũ

162 dòng nhập từ sheet, đối chiếu khớp tuyệt đối: **58.181.875 đ**, và số dư 6/6
đợt bằng đúng cột `Tồn` cuối mỗi tab.

Chứng từ cũ vẫn là **link Google Drive** (cột *Link chứng từ cũ* / *Link UNC cũ*)
— tải về để đính kèm cần quyền Drive API mà mình chưa có. Từ nay trở đi mới là
tệp thật trong Base.

Hai cột suy ra bằng máy, sửa tay được: **Loại chi** (đoán từ nội dung) và
**Tình trạng** (có mã quyết toán → *Đã quyết toán*, không → *Đã chi*).

## Khai khoản chi là tạo đơn Tourwell

Mọi khoản tiêu từ quỹ đều đi qua nhà cung cấp **QUỸ MARKETING (id 274)** bên
Tourwell — lịch sử chi của quỹ nằm ở
`/admin/supplier/274/show?tab=history`. Nên khai một khoản ở đây mà không tạo
đơn thì lịch sử bên đó thủng.

Bấm **Khai khoản chi** giờ làm ba việc: ghi vào sổ · tạo đơn *Dịch vụ khác* trên
Tourwell với dòng chi phí Quỹ Marketing (VAT 8% đã gồm) · ghi mã `RT…` ngược vào
ô **Mã đơn Tourwell** — cũng là chốt chống tạo trùng.

**Mã điều hành `SG…` không lấy được qua API** — đã soi ba đơn *Thành công* thật,
payload không chứa mã đó lẫn id điều hành ở bất kỳ đâu, và `/api/v1/tours` trả
rỗng. Anh Hùng chốt 12/09/2026: mã đơn hàng `RT…` là đủ cho kế toán, nên app
không bắt dán `SG…` nữa; ô *Mã điều hành* vẫn còn đó cho ai muốn ghi.

Đơn dừng ở **"Đang xử lý"**, còn 5 nút phải bấm tay (chuyển thành công · xác
nhận · đính chứng từ · nhận điều hành · hoàn thành) vì Open API không mở mấy
bước đó. Cửa sổ kết quả kê thẳng ra, không giấu.

Mã code Tourwell dùng chung ở `../lark-chung/tourwell.js` — app Lịch tác nghiệp
cũng gọi đúng module đó. Chép đôi thì sửa VAT một nơi là nơi kia sai lặng lẽ.

## Nối với app Lịch tác nghiệp

Bấm **Đã thanh toán** bên app Lịch tác nghiệp thì ngoài đơn Tourwell, một dòng
chi phí tự rơi vào đây: loại *Tác nghiệp*, người đề nghị là người phụ trách buổi
đó. Xem `../lark-lich-tac-nghiep/so-quy.js`.

## Kiểm thử

```bash
node test/giao-dien.test.js              # nạp app.js vào DOM giả rồi để nó tự vẽ
node test/quy.test.js                    # chỉ đọc, cần app đang chạy ở 5182
node test/tourwell.live.test.js --that   # khai một khoản 10.000đ THẬT rồi tự dọn
```

`giao-dien.test.js` sinh ra sau một lỗi thật: tôi chèn hụt hàm `tachDon`, tệp
vẫn hợp lệ nên `node --check` xanh, và chỉ vỡ khi anh Hùng mở bản web —
*"Không đọc được sổ quỹ: tachDon is not defined"*, cả màn hình trắng. Phép thử
nạp `app.js` vào một `document` giả rồi gọi từng hàm vẽ; hàm thiếu hay biến sai
tên đều ném ReferenceError ngay. Đã kiểm chứng bằng cách đổi tên `tachDon` —
sáu phép thử đỏ đúng câu lỗi đó.

Hai phép thử đáng giá nhất ở đó không phải "API có trả về không":

- **đối chiếu hai đường tính số dư** — công thức của Base so với cộng tay từ
  danh sách khoản chi; lệch một đồng là biết ngay có chuyện
- **chốt chặn dòng "Chuyển từ kỳ trước"** — nếu ai đó lỡ cộng cả chúng vào, tổng
  đã ứng vọt từ 65 lên 76,2 triệu và bài thử đỏ ngay

`giao-dien.test.js` dựng cả **ba vai** rồi soi đúng chỗ mỗi vai khác nhau: kế
toán không được thấy chuỗi `UNC`, không có `data-sua`, nhưng phải có `data-chon`
và nút quyết toán. Đã thử phá để chắc nó cắn — bỏ nhánh `laKeToan()` đi thì ba
phép thử đỏ ngay.

`quy.test.js` thử phân quyền bằng **chính header Hub gửi xuống**, không phải
bằng cách gọi hàm nội bộ: kế toán khai chi phải ăn 403, mà quyết toán phải lọt
qua chốt quyền rồi mới dừng ở khâu kiểm dữ liệu. Đã thử phá — bỏ khớp email đi
thì bốn phép thử đỏ.

Phép thử số liệu theo kỳ không ghim con số nào: nó kiểm **đầu kỳ + nạp − chi =
cuối kỳ**, và **cuối kỳ tháng trước = đầu kỳ tháng sau**. Bất biến thì đúng mãi,
còn con số thì sai ngay khoản chi kế tiếp.

Lần chạy gần nhất: **73 + 62 pass · 0 fail**.

`node --check` xanh mà app vẫn vỡ — lần thứ hai. Ngày 13/09/2026 một dòng lạc
rơi vào giữa `/* tiện */` và `function json(...)`, biến một khai báo hàm thành
biểu thức trong dấu phẩy: cú pháp hợp lệ, `json` không bao giờ được gán, và MỌI
request ném `json is not defined`. `quy.test.js` bắt được ngay vì nó gọi thật —
nên đừng bỏ bước chạy nó sau khi sửa server.js.

## Cấu trúc

```
config.js        toạ độ Base, field ID của cả ba bảng, danh sách loại chi
lark.js          gọi lark-cli (chế độ cli, chạy trên máy)
larkapi.js       gọi thẳng Open API (chế độ api, chạy trên Render)
server.js        REST API, chốt quyền chủ quỹ ở server
public/app.js    toàn bộ giao diện, không framework
```
