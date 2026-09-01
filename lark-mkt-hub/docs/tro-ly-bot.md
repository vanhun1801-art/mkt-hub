# Trợ lý hỏi đáp — nối bộ não bên ngoài vào số liệu thật

## Vì sao không "train" bot bằng dữ liệu

Ba lý do, theo thứ tự quan trọng:

1. **Mô hình học giọng văn, không học sự thật.** Train xong nó vẫn bịa số, mà bịa
   rất tự tin. Bot nói "tháng 8 chi 47 triệu" trong khi thật là 52 triệu thì tệ
   hơn là không có bot.
2. **Dữ liệu đổi mỗi ngày.** Train là chụp một ảnh của hôm đó. Hôm sau đã sai.
3. **Đắt và chậm** — hàng nghìn ví dụ, tiền GPU — để làm việc mà một câu truy vấn
   Base xong trong 200ms.

Cách đúng: bot **tra lúc được hỏi**. Nó không nhớ gì cả, nên con số luôn đúng
bằng con số trên Base. Đó là việc của `bot.js`.

Còn "dạy" bot theo nghĩa dùng được là: viết SOP, quy định, cách tính vào một chỗ
mà nó đọc được (bảng trên Base, hoặc Knowledge base của Coze). Thêm một dòng là
nó biết thêm — không cần sửa mã, không cần train.

## Kiến trúc

```
Người hỏi trong Lark
        ↓
   bộ não (Coze / Claude / n8n …)     ← anh chọn, thay được
        ↓  HTTPS + Bearer token
   GET /bot/<công cụ>                 ← lớp này, chỉ đọc
        ↓  127.0.0.1
   app module (Lịch / Công việc / OTA)
        ↓
   Lark Base                          ← nguồn sự thật duy nhất
```

Đổi bộ não thì lớp `/bot` giữ nguyên. Đó là lý do làm lớp này trước.

## Các công cụ

| Công cụ | Trả về | Tham số |
|---|---|---|
| `GET /bot/lich` | Lịch tác nghiệp: ai đi, đi đâu, mấy giờ, trạng thái duyệt | `tu` `den` `nguoi` `trangthai` |
| `GET /bot/viec` | Công việc bảng Tracking: ai làm gì, deadline, trễ mấy ngày | `nguoi` `trangthai` `quahan` `tu` `den` |
| `GET /bot/booking` | Booking OTA theo ngày đi tour: bao nhiêu khách, tour nào, sàn nào | `tu` `den` `tour` `san` |
| `GET /bot` | Mục lục — liệt kê công cụ và tham số | — |
| `GET /bot/openapi.json` | Schema OpenAPI 3 để nhập vào Coze | — |
| `GET /bot/so` | 200 lượt gọi gần nhất (xem có ai dò cửa) | — |

`tu` nhận **từ khoá** cho bộ não khỏi phải tự tính ngày (nó tính sai lịch là
chuyện thường): `hom-nay` `mai` `tuan-nay` `tuan-sau` `thang-nay` `thang-truoc`,
hoặc một ngày `YYYY-MM-DD`. Gõ sai thì trả **400 kèm danh sách từ khoá đúng** —
cố ý không âm thầm bỏ lọc, vì bỏ lọc là nó nhận cả năm dữ liệu rồi bịa ra "tuần
này có 200 lịch".

Mỗi kết quả có sẵn trường **`tomTat`** — một câu tiếng Việt đọc thẳng ra được.
Bộ não yếu cũng trả lời đúng vì không phải tự tính lại. `chiTiet` là danh sách
đầy đủ, tối đa 40 dòng, phần bị cắt báo ở `catBot`.

## Ranh giới an toàn

**Không có dữ liệu tiền ở đường này.** Không chi phí, không doanh thu, không hoa
hồng, không lương.

Lý do không phải vì khó làm, mà vì **Coze gọi API bằng danh tính của plugin — nó
không mang theo "người đang hỏi là ai"**. Không biết ai hỏi thì không phân quyền
được, mà chat 1-1 với bot là kênh kín: một câu trả lời sai người là lộ hẳn. Nên
đường này chỉ được phép trả thứ cả phòng vốn xem được.

Muốn bot trả lời được câu về tiền thì phải giải quyết danh tính trước — nghĩa là
hub tự nhận event Lark (event có `open_id` người gửi) rồi tự gọi bộ não. Lúc đó
phân quyền theo người dùng lại được bảng `quyen.json` sẵn có. **Đừng nới ranh
giới này mà chưa làm phần danh tính.**

Sáu lớp chặn, mỗi lớp độc lập:

1. Chưa khai `BOT_API_TOKEN` → nhánh `/bot` trả **404**, như không tồn tại. Trả
   401 là đã tự thừa nhận "có cửa ở đây, chỉ thiếu chìa".
2. Token phải dài ≥ 24 ký tự mới được coi là có. So bằng thời gian không đổi.
3. **Chỉ GET.** Không một endpoint nào ghi được vào Base.
4. Gọi module bằng danh tính cố định `NGUOI_BOT` (xem toàn bộ, **không** quyền
   chi phí) — không phải `null`, vì nhiều chỗ trong module coi `null` là "gọi nội
   bộ, cho xem hết tiền".
5. Lọc lần hai bằng **danh sách cho phép**: chỉ field khai trong hàm `dong()` mới
   ra ngoài. Base thêm cột tiền sau này cũng không lọt.
6. Trần 60 lượt/phút, và sổ ghi 200 lượt gần nhất.

Test `test/bot.test.js` giữ đúng mấy ranh giới này — trong đó có một test quét cả
chuỗi JSON trả về để bắt mọi tên cột nghi là tiền, chứ không chỉ mấy cột đang biết.

## Nối vào Coze

1. **Lấy chìa.** Render → service `mkt-hub` → Environment → `BOT_API_TOKEN`.
   Đừng dán nó vào code, vào chat, hay vào tin nhắn Lark.
2. **Kiểm tra cửa mở chưa** — thay `<URL>` và `<TOKEN>`:
   ```
   curl -H "Authorization: Bearer <TOKEN>" "<URL>/bot/lich?tu=tuan-nay"
   ```
   Ra JSON có `tomTat` là xong. Ra 404 nghĩa là chưa khai biến trên Render.
3. **Tạo plugin trong Coze** từ schema `<URL>/bot/openapi.json` (Coze nhập được
   OpenAPI, khỏi khai tay từng tham số). Auth: **Bearer token**, dán chìa ở bước 1.
4. **Lời nhắc hệ thống cho bot** — quan trọng, đây là chỗ chặn nó bịa:

   > Bạn là trợ lý của phòng Marketing Rooty Trip Phú Quốc. Trả lời bằng tiếng Việt,
   > ngắn gọn.
   >
   > Mọi câu hỏi về lịch tác nghiệp, công việc, booking: **bắt buộc gọi công cụ**,
   > không được trả lời bằng suy đoán hay bằng ký ức của lần trước. Con số phải lấy
   > từ kết quả công cụ; trường `tomTat` đã là câu trả lời sẵn.
   >
   > Nếu công cụ trả lỗi hoặc trả 0 kết quả, nói thẳng là không có dữ liệu. **Không
   > được đoán.**
   >
   > Nguồn này **không có** chi phí, doanh thu, hoa hồng, lương. Ai hỏi về tiền thì
   > trả lời: "Số liệu tiền không có ở kênh này, anh/chị mở Marketing Hub để xem."
   > Không tự tính, không ước lượng.
   >
   > Hôm nay là ngày nào thì dùng từ khoá `hom-nay` / `tuan-nay` / `thang-nay`,
   > đừng tự tính ngày.
5. **Kiến thức của phòng**: tải SOP livestream, quy định chi phí, cách tính hoa
   hồng OTA vào Knowledge base của Coze. Cái này là tài liệu **ít đổi** nên tải tệp
   là hợp; số liệu đổi hàng ngày thì phải qua công cụ ở trên.
6. Publish sang kênh Lark, nhắn thử.

Câu thử nên dùng: *"tuần này ai đi tác nghiệp"*, *"việc nào đang quá hạn"*,
*"tháng này có bao nhiêu booking"*, và một câu để kiểm ranh giới: *"tháng 8 chi
quảng cáo bao nhiêu"* — phải bị từ chối.

## Thêm một công cụ mới

Thêm một mục vào `CONG_CU` trong `bot.js`, khai `moTa` + `thamSo` + `chay()`, rồi
khai module tương ứng trong `MOD_CUA`. Schema OpenAPI sinh từ chính bảng đó nên
Coze thấy công cụ mới ngay, không phải sửa gì thêm.

Ba việc **bắt buộc** khi viết `chay()`:

- Gọi module với `{ nguoi: NGUOI_BOT }` — không bao giờ `null`.
- Xây dòng trả về bằng **danh sách cho phép** (liệt kê từng field), không phải
  sao chép bản ghi rồi xoá vài cột.
- Trả `tomTat` thành câu hoàn chỉnh, vì bộ não sẽ đọc nó thay vì tự tính.
