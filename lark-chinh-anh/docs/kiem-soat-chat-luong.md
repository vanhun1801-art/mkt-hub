# Kiểm soát chất lượng ảnh bằng AI — ĐANG TẠM DỪNG

**Trạng thái: khảo sát xong, chưa làm.** Anh Hùng chốt tạm chưa ứng dụng (10/09/2026).
Ghi lại đây để lần sau mở lại không phải tra lại từ đầu — phần khó nhất của việc này
là mấy ràng buộc bên ngoài, không phải code.

## Bài toán gốc

Hiện ảnh gửi vào nhóm SỬA ẢNH có người xem bằng mắt, xấu thì yêu cầu chỉnh lại.
Anh Hùng thấy không bền: **tiêu chí không ai viết ra ở đâu**, nên người kiểm khác nhau
ra kết quả khác nhau, và không dạy lại được cho người mới.

Ba tiêu chí anh Hùng nói ra khi được hỏi trực tiếp:

1. **Màu sắc** — không đúng tone
2. **Out nét**
3. **Mặt mũi người không rõ ràng**

Cả ba quy về một việc: *tìm khuôn mặt → đo nét và độ sáng **ở vùng mặt** → so tone với
ảnh mẫu.* Đây là phần dễ, và Claude vision làm được.

## Ràng buộc chặn đường (kiểm 10/09/2026, đây mới là phần quan trọng)

**1. Google đã đóng đường đọc album Google Photos chia sẻ, từ 31/03/2025.**
Scope `photoslibrary.readonly` / `photoslibrary.sharing` / `photoslibrary` bị xoá; mọi
lời gọi vào album chia sẻ trả `403 PERMISSION_DENIED`. App chỉ đọc được ảnh do **chính
app đó** tạo. Nghĩa là **dán link Photos rồi để app tự tải ảnh về là KHÔNG khả thi** —
không phải chưa làm, mà Google không cho.
<https://developers.google.com/photos/support/updates>

**2. Đường thay thế duy nhất của Google là Picker API** — app mở cửa sổ Google Photos,
người dùng vào album bấm *Chọn tất cả*, app poll session rồi nhận media. Tức là còn
**đúng một cú bấm của con người mỗi lô**, không bỏ được khi ảnh còn ở Photos.
<https://developers.google.com/photos/picker/guides/sessions>

**3. Công ty KHÔNG dùng Google Workspace — ảnh đổ lên bằng `rootytrip@gmail.com`.**
Hệ quả (điểm mới, phát hiện 10/09/2026): app OAuth phải là **"External"**, và scope của
Photos là scope nhạy cảm → **phải qua vòng thẩm định của Google** (thường vài tuần, cần
video demo + trang chính sách bảo mật + tên miền đã xác minh). Nếu có Workspace thì đặt
"Internal" là xong, không phải thẩm định. Đây là chi phí thật của việc dùng Gmail thường.

Mặt tốt của việc dùng một tài khoản duy nhất: **cấp quyền MỘT lần cho cả phòng**, không
phải mỗi bạn tự cấp. Nhưng vẫn phải qua thẩm định trước đã.

**4. Vì (1)+(2)+(3), hướng rẻ và nhanh hơn nhiều là cho ảnh đã chỉnh đổ SONG SONG vào
một thư mục Drive** (Photos giữ nguyên để giao khách). Drive đọc được bằng service
account, không thẩm định, không ai phải bấm gì → AI chấm 100% tự động chạy nền.
Anh Hùng đã cân nhắc và chọn "ảnh qua Photo thôi". **Nếu mở lại việc này, hỏi lại câu
đó trước tiên** — nó quyết định toàn bộ phần còn lại.

## Nếu làm thì làm thế nào (đã thiết kế xong, chưa viết code)

**Ảnh mẫu chuẩn màu** anh Hùng cung cấp:
<https://drive.google.com/drive/folders/15bYdqya8nBNCI2IMY9apFFgJMutDF6PH>
Không có mẫu thì AI chấm theo gu của nó, không theo gu Rooty Trip. Cách dùng: kèm 5–8
ảnh mẫu vào mỗi lượt chấm làm chuẩn so sánh, và **cache phần prompt + ảnh mẫu** (prompt
caching) vì chúng không đổi giữa các lượt.

**Đo nét trên VÙNG MẶT, không đo cả khung.** Ảnh tour hay xoá phông — đo nét toàn khung
thì ảnh nghệ thuật nhất lại bị chấm out nét nặng nhất. Mọi công cụ chấm nét tự động đều
mắc lỗi này.

**Hỏi "mặt có rõ không", KHÔNG hỏi "đây là ai".** Claude từ chối định danh người trong
ảnh theo chính sách. Hỏi *mặt đủ sáng / có nét / có bị che / có nhắm mắt* thì hoàn toàn
trong phạm vi cho phép.

**Hai tầng model.** Haiku 4.5 quét toàn bộ → Sonnet 5 phán quyết lại số bị gắn cờ.
Giá đã tra thật (Claude tính ảnh theo ô 28×28 px: `⌈w/28⌉ × ⌈h/28⌉` visual token; gửi ở
~1000×1000 px, Google trả sẵn bản resize nên không phải ship file gốc):

| Model | / 1.000 ảnh | Việc |
|---|---|---|
| Haiku 4.5 | ~$1,9 (≈ 49.000đ) | quét toàn bộ |
| Sonnet 5 | ~$3,8 (≈ 99.000đ) | xử lại ~15% bị gắn cờ |
| Opus 5 | ~$9,5 (≈ 246.000đ) | chỉ khi cần chắc |

20.000 ảnh/tháng ≈ **$50/tháng**. Ảnh chấm sau báo cáo vài phút chứ không cần tức thì →
dùng **Batch API giảm 50%** còn ~$25/tháng. Tiền không phải rào cản ở đây.
<https://platform.claude.com/docs/en/build-with-claude/vision>

**Ngưỡng chặn theo TỶ LỆ, không theo một ảnh.** Mặc định >10% ảnh trong lô lỗi nặng thì
trả về, kèm đúng số hiệu ảnh và lý do. Một ảnh out nét trong 200 ảnh không phải lý do
trả cả lô.

**Ba mức trong Cài đặt** (anh Hùng chọn mức 3, nhưng phải dựng cả ba):
1. *Soi thầm* — AI chấm, ghi Base, không nói gì. Dùng để đo AI có khớp người kiểm không.
2. *AI nói, người quyết* — AI gửi danh sách ảnh lỗi, người bấm nút cuối.
3. *AI tự quyết* — tự đặt *Cần sửa lại*, tự báo nhóm. Người vẫn ghi đè được.

Lý do phải có mức 1–2 dù anh Hùng muốn auto: bật auto ngày đầu khi chưa hiệu chuẩn thì
tuần đầu AI trả về sai vài lô, cả nhóm mất niềm tin, và sau đó không ai dùng nữa kể cả
khi đã sửa đúng.

## Thứ app HIỆN TẠI đã làm để dọn đường

Chốt trong `server.js`: **trả về "Cần sửa lại" thì bắt buộc phải ghi rõ sửa gì**, không
cho bỏ trống. Chạy vài tuần là bảng *Báo cáo sản phẩm* có một tập lý do thật, viết bằng
chữ của chính người kiểm — đó là nguyên liệu để đúc bộ tiêu chí. Đúc từ tưởng tượng thì
AI chấm lệch.

Chưa có khoá API Anthropic của công ty (10/09/2026) — cần khi mở lại việc này.
