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

## Một vai

App này **chỉ anh Hùng nhập** (`LARK_CHU_QUY`, mặc định open_id của anh). Người
khác mở ra vẫn xem được nhưng mọi lệnh ghi bị chặn ở server, không chỉ ẩn nút.

**Kế toán không dùng app** — họ mở thẳng Base với quyền chỉ đọc. Ba view dựng
sẵn cho họ:

- `Kế toán · đã chi` — mọi khoản đã chi
- `Kế toán · chờ quyết toán` — đã chi mà chưa có mã QTTU
- `Cần bổ sung chứng từ` — chưa quyết toán, chưa được miễn, và không có mảnh
  giấy nào

Cả ba view sắp theo **ngày thanh toán mới nhất trước**, và mang sẵn những cột kế
toán cần đọc: thời gian · mã đơn hàng · tên người chi · số tiền · chứng từ · mã
số thuế NCC.

## Bốn việc app làm

1. **Số dư quỹ** — màn hình đầu trả lời ngay "còn bao nhiêu", kèm chi tháng này,
   số khoản thiếu chứng từ, số khoản chờ quyết toán
2. **Khai khoản chi** + đính hoá đơn/UNC ngay tại dòng của khoản
3. **Quyết toán theo lô** — chọn nhiều khoản, gán một mã QTTU, đổi tình trạng
4. **Cảnh báo cần bổ sung chứng từ** — tab riêng, dòng tô đỏ trong mọi danh sách

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
node test/quy.test.js                    # chỉ đọc, cần app đang chạy ở 5182
node test/tourwell.live.test.js --that   # khai một khoản 10.000đ THẬT rồi tự dọn
```

Hai phép thử đáng giá nhất ở đó không phải "API có trả về không":

- **đối chiếu hai đường tính số dư** — công thức của Base so với cộng tay từ
  danh sách khoản chi; lệch một đồng là biết ngay có chuyện
- **chốt chặn dòng "Chuyển từ kỳ trước"** — nếu ai đó lỡ cộng cả chúng vào, tổng
  đã ứng vọt từ 65 lên 76,2 triệu và bài thử đỏ ngay

Lần chạy gần nhất: **28 pass · 0 fail**.

## Cấu trúc

```
config.js        toạ độ Base, field ID của cả ba bảng, danh sách loại chi
lark.js          gọi lark-cli (chế độ cli, chạy trên máy)
larkapi.js       gọi thẳng Open API (chế độ api, chạy trên Render)
server.js        REST API, chốt quyền chủ quỹ ở server
public/app.js    toàn bộ giao diện, không framework
```
