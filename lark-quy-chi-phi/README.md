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
| Hết quỹ | mở tab mới | thêm một dòng ở bảng *Đợt tạm ứng* |
| Số dư | cột `Tồn` gõ tay từng dòng | công thức `tổng nạp − tổng chi`, không gõ được nên không lệch được |
| Chứng từ | link Google Drive, kế toán phải xin quyền | tệp đính kèm ngay trong bảng |
| Thiếu UNC | không ai nhìn ra — **67/162 dòng thiếu** | thẻ "Thiếu chứng từ" đếm sẵn, dòng tô đỏ |
| Quyết toán | sửa mã QTTU từng dòng | chọn nhiều khoản, gán một lượt |

## Ba bảng

```
Đợt tạm ứng    một kỳ quỹ (PC9955, THÁNG 09…). Công thức: Tổng nạp · Tổng đã chi · Còn lại
Lần nạp quỹ    mỗi lần nhận tiền, kể cả số dư đầu kỳ. Nhiều lần nạp trong một đợt
Chi phí        từng khoản chi — thứ kế toán đọc
```

Số dư **không** cộng dồn theo dòng như sheet. Base không làm được, và cũng không
nên: chèn một dòng cũ vào giữa là phải tính lại cả cột. Tính ở cấp đợt thì lúc
nào cũng đúng.

## Một vai

App này **chỉ anh Hùng nhập** (`LARK_CHU_QUY`, mặc định open_id của anh). Người
khác mở ra vẫn xem được nhưng mọi lệnh ghi bị chặn ở server, không chỉ ẩn nút.

**Kế toán không dùng app** — họ mở thẳng Base với quyền chỉ đọc. Ba view dựng
sẵn cho họ:

- `Kế toán · đã chi` — mọi khoản đã chi
- `Kế toán · chờ quyết toán` — đã chi mà chưa có mã QTTU
- `Thiếu hoá đơn` — đã chi mà trống cả ô Hoá đơn lẫn link chứng từ cũ

## Bốn việc app làm

1. **Số dư quỹ** — màn hình đầu trả lời ngay "còn bao nhiêu", kèm chi tháng này,
   số khoản thiếu chứng từ, số khoản chờ quyết toán
2. **Khai khoản chi** + đính hoá đơn/UNC ngay tại dòng của khoản
3. **Quyết toán theo lô** — chọn nhiều khoản, gán một mã QTTU, đổi tình trạng
4. **Cảnh báo thiếu chứng từ** — tab riêng, dòng tô đỏ trong mọi danh sách

## Dữ liệu cũ

162 dòng nhập từ sheet, đối chiếu khớp tuyệt đối: **58.181.875 đ**, và số dư 6/6
đợt bằng đúng cột `Tồn` cuối mỗi tab.

Chứng từ cũ vẫn là **link Google Drive** (cột *Link chứng từ cũ* / *Link UNC cũ*)
— tải về để đính kèm cần quyền Drive API mà mình chưa có. Từ nay trở đi mới là
tệp thật trong Base.

Hai cột suy ra bằng máy, sửa tay được: **Loại chi** (đoán từ nội dung) và
**Tình trạng** (có mã quyết toán → *Đã quyết toán*, không → *Đã chi*).

## Nối với app Lịch tác nghiệp

Bấm **Đã thanh toán** bên app Lịch tác nghiệp thì ngoài đơn Tourwell, một dòng
chi phí tự rơi vào đây: loại *Tác nghiệp*, người đề nghị là người phụ trách buổi
đó, gắn vào đợt đang dùng. Xem `../lark-lich-tac-nghiep/so-quy.js`.

## Kiểm thử

```bash
node test/quy.test.js     # chỉ đọc, cần app đang chạy ở 5182
```

Phép thử đáng giá nhất ở đó không phải "API có trả về không" mà là **đối chiếu
hai đường tính số dư**: công thức của Base so với cộng tay từ danh sách khoản
chi. Lệch một đồng là biết ngay có chuyện.

Lần chạy gần nhất: **23 pass · 0 fail**.

## Cấu trúc

```
config.js        toạ độ Base, field ID của cả ba bảng, danh sách loại chi
lark.js          gọi lark-cli (chế độ cli, chạy trên máy)
larkapi.js       gọi thẳng Open API (chế độ api, chạy trên Render)
server.js        REST API, chốt quyền chủ quỹ ở server
public/app.js    toàn bộ giao diện, không framework
```
