# Hộp thư · Lark Mail

App con thứ 16 của Marketing Hub (id `hop-thu`, cổng 5204). Gom mọi hộp thư người dùng được cấp quyền (hộp chính + hộp chung như `sales@`, `marketing@`, `cmo@`, các hộp `pito@`) vào một danh sách, xếp theo việc phải làm.

## Ba ngăn (28/10/2026)

Bốn ngăn cũ (Cần xử lý, Sếp giao, Để biết, Tự động) làm người dùng "không biết phải làm gì", nên gọn lại còn ba, đặt tên theo việc phải làm:

| Ngăn | Vào đây |
|---|---|
| Cần trả lời | đề xuất xin duyệt, thư Ban giám đốc (`HOP_THU_SEP`, gắn nhãn "Ban giám đốc"), khách tự viết hỏi, thư lạ chưa luật nào nhận |
| Đơn khách đặt | form đặt dịch vụ trên web, booking mới của khách sạn. Ở đầu "Cần trả lời" có một dòng gom "N đơn khách đặt" dẫn sang đây |
| Chỉ để đọc | UNC, hoá đơn, bản lưu Tourwell, thông báo chung, thư mình tự gửi, mã xác nhận, thư máy gửi, quảng cáo |

Ngăn "Hẹn lại" chỉ hiện khi có thư đang hẹn. Số trên ngăn là thư chưa đọc.

Thứ tự xếp: luật anh tự đặt (Thêm › Chuyển sang ngăn khác) > luật cài sẵn (`phan-loai.js`) > AI > Cần trả lời. Thư không ai nhận thì vào Cần trả lời: sót một đề xuất trong ngăn "Chỉ để đọc" tệ hơn chiều ngược lại. Luật tay và kết quả AI đã lưu từ bản bốn ngăn vẫn dùng được (`sep` → Cần trả lời, `tu-dong` → Chỉ để đọc).

Trong thư chỉ có ba nút có chữ: **Trả lời**, **Giao việc**, **Xong** (có Hoàn tác). Thêm vào lịch, theo dõi trong nhóm, nhắc lại sau, chuyển ngăn, gắn sao, đánh dấu chưa đọc, chữ ký nằm trong nút **⋯ Thêm**. Không bày lý do xếp ngăn ra giao diện.

## Việc cần làm (ngăn đầu, mở app là vào đây)

- **Người khác đang chờ anh**: thư Cần trả lời trong 7 ngày, chưa xong, chưa trả lời. Chờ 1 ngày thì vàng, từ 3 ngày thì đỏ và nhịp sáng (thư Ban giám đốc: nửa ngày vàng, 1 ngày đỏ). Thư chờ 7 đến 30 ngày gom một dòng, bấm mới mở, và thôi nhấp nháy.
- **Anh đang chờ người khác**: thư anh gửi (thư mục Đã gửi) trong 21 ngày mà chuỗi chưa có thư đến nào sau nó.
- "Đã trả lời" = trong cùng chuỗi (hộp + thread_id) có thư anh gửi sau thư đó (`ghepChuoi` ở server.js).
- **Nhóm việc anh theo dõi**: gom nhiều chuỗi thư cùng một việc; thẻ nhóm nói đang đến lượt ai.

## Thư rác và giới hạn tốc độ của Lark (29/10/2026)

- App đọc thêm thư mục **Thư rác** của mỗi hộp (14 ngày gần nhất, tối đa 40 thư, `ngayRac`/`soThuRac` ở config). Lark từng đẩy cả thư khách hỏi báo giá vào đó: sales@ có 64 thư rác trong hai tuần, có thư khách thật.
  - Thư rác có dấu hiệu khách hỏi (báo giá, booking, tour…) vào "Cần trả lời".
  - Thư mạo danh hãng lớn từ tên miền lạ ("MetaAdsSupport" gửi từ tinhochay.org) và phần còn lại vào "Chỉ để đọc".
  - Thư nào cũng mang nhãn "Thư rác" và câu nhắc kiểm người gửi. Thư vẫn nằm trong Thư rác trên Lark: app không chuyển thư nào.
- Đọc tám hộp cùng lúc từng chạm ngưỡng của Lark: `99991400 request trigger frequency limit`, `1230008 too many requests`. Lúc đó cả 4–5 hộp lỗi cùng lúc, mà câu báo lỗi chỉ là dòng "tip: run lark-cli … profile". Cách chống:
  - đọc lỗi JSON trong stderr của lark-cli;
  - gặp lỗi giới hạn thì chờ lâu dần rồi thử lại (cả lark-cli lẫn OpenAPI);
  - mỗi lúc đọc tối đa 4 hộp;
  - hai lượt đọc trùng nhau dùng chung một lần gọi.
- Hộp chung chưa được chia quyền thì chỉ hộp đó báo lỗi, không đòi nối lại cả trang.
- Hai hộp `pito@routinehotels.com` và `pito@riluxhotels.com` trống thật trên Lark (mọi thư mục 0 thư), không phải lỗi đọc.

## Chỉ đổi bên mình, Lark Mail giữ nguyên (28/10/2026)

Thư trong hộp chung mà người khác lo thì dùng **⋯ › Bỏ qua, việc của người khác** thay vì Xong (29/10/2026). Thư rời Việc cần làm của riêng mình, mang nhãn "Đã bỏ qua" ở cuối ngăn, mở ra có nút **Đưa về** (gỡ cả Xong lẫn Bỏ qua). Sổ riêng ghi `b` cạnh `x`.

Hộp chung có nhiều người dùng, nên **Xong, bỏ qua, đã đọc, chưa đọc, gắn sao, chuyển ngăn, hẹn, nhóm** chỉ ghi vào sổ riêng của từng người (`kho.js`). Không lệnh nào đổi nhãn hay thư mục trên Lark Mail. Sổ nằm ở kho Base của Hub (bảng của Ghi chú, ô "Ô" = `hop-thu:<băm>`, tệp `hop-thu.json.gz`), nên Render deploy lại không mất. Chạy riêng, chạy test, soát chỉ đọc thì sổ chỉ nằm trên máy.

## Gửi thư

Bấm Gửi chỉ mở **xem trước**: người nhận, tiêu đề, đúng tờ thư sẽ đi (phần viết + chữ ký + trích thư gốc) và các chỗ chữ nên sửa (`chinh-ta.js`: viết tắt, dấu cách, chữ lặp, đầu câu; có khoá Claude thì soát thêm lỗi dấu). Sửa từng chỗ hoặc Sửa hết, rồi mới **Gửi ngay**. Chữ ký đặt trong app (lần đầu gợi ý từ chữ ký Lark Mail), bỏ được cho từng thư. lark-cli gửi kèm `--no-signature` để không bị hai chữ ký.

## Dịch

- Thư tiếng nước ngoài có nút **Dịch sang tiếng Việt** (tiêu đề + thân), bấm "Xem bản gốc" để đổi qua lại.
- Ô soạn có **Gửi bằng tiếng Anh**: anh viết tiếng Việt, bấm Gửi thì app dịch sang tiếng Anh và bày bản xem trước tiếng Anh (kèm bản tiếng Việt gốc) rồi mới gửi. Thư đến không phải tiếng Việt thì ô này tự tick.
- Dịch bằng bộ dịch có sẵn trong Google Chrome (Translator API, chạy trên máy, thư không rời máy; lần đầu mỗi cặp ngôn ngữ tải gói vài giây). Trình duyệt không có thì nhờ máy chủ dịch bằng Claude (`/api/dich`, cần `ANTHROPIC_API_KEY`). API dịch của Lark trả 404 trên Lark quốc tế nên không dùng được.
- Đã thử: trình duyệt nhúng của Claude desktop có Translator nhưng không tải được gói, app chờ 30 giây rồi báo lý do.

## Nối với app khác

- **Giao việc** → form tạo việc của Bảng công việc; ô link về thư, Bảng công việc vẽ thành thẻ "Email gốc".
- **Thêm vào lịch** → sự kiện trên lịch Lark của người dùng, đoán sẵn ngày giờ có trong thư. Bản chạy chung lần đầu phải bấm "Cho phép" (Hub xin thêm `calendar:calendar:read`, `calendar:calendar.event:create` qua `/auth/noi-thu?them=lich`).
- **Hồ sơ liên quan** (chỉ trong Hub): email người gửi trùng KOL hay đối tác ở app KOL; số điện thoại trong thư trùng hồ sơ ở app Khách hàng.

## Khuôn

Trái danh sách, phải khung đọc. Vách giữa kéo được (nhớ độ rộng trên máy, bấm đúp về mặc định, phím ← → khi đang chọn vách). Nút trên đầu khung đọc ẩn danh sách hoặc đóng khung đọc; không bao giờ ẩn cả hai.

## AI (Claude)

- Khoá `ANTHROPIC_API_KEY` ở `lark-hop-thu/.env` (mẫu: `.env.example`). Thiếu khoá thì app vẫn chạy, chỉ tắt tóm tắt và viết nháp.
- Mở thư ở ngăn Cần trả lời thì tự tóm tắt; ngăn khác bấm "Tóm tắt". Câu tóm tắt hiện luôn ở dòng hai của thư trong danh sách. Kết quả cất ở `du-lieu/ai.json`, mở lại không tốn thêm lượt.
- Thư luật không nhận được xếp nhanh cả loạt bằng một lượt gọi (chỉ người gửi + tiêu đề).
- Gọi thẳng HTTP (`ai.js`), không qua gói npm: cả repo không có dependency và Render build rỗng.
- Thư là dữ liệu từ ngoài: nằm trong thẻ `<thu>`, AI không có công cụ nào, kết quả chỉ là chữ bày ra.

## An toàn

- Hai đường đọc thư:
  - **Bản chạy chung (Render):** mỗi người bấm **Nối hộp thư** một lần. Hub xin quyền đọc thư của chính người đó (OAuth, `lark-mkt-hub/noi-thu.js`), giữ refresh token trong cookie `hub_thu` đã mã hoá, rồi chuyển access token xuống app này qua header `x-hub-thu-token`. App gọi thẳng OpenAPI Mail (`mail-api.js`), không cất token. Mỗi người chỉ thấy các hộp mình được cấp; bộ đệm, luật tự đặt, hẹn nhắc tách theo người.
  - **Máy cá nhân:** đọc bằng lark-cli của máy. Qua Hub chỉ người có email trùng chủ hộp thư chính mới mở được; người khác nhận 403.
- Không có nút xoá, không lệnh nào đổi nhãn hay thư mục trên Lark Mail.
- Trả lời mặc định lưu nháp. Gửi phải qua bản xem trước ghi rõ người nhận và hộp gửi; máy chủ chỉ gửi khi nhận đúng `gui: true`.
- `HOP_THU_CHI_DOC=1`: chặn gửi thư, tạo lịch; sổ riêng chỉ ghi trên máy, không ghi Base. Dùng khi soát giao diện (cấu hình `hop-thu-xem` trong `.claude/launch.json`).

## Điều kiện để Nối hộp thư chạy trên Render

App Marketing Hub (`cli_aa1a8ae21a78ded2`) phải được cấp 7 quyền mail cùng `offline_access` trong Developer Console rồi **phát hành version** (danh sách ở `lark-mkt-hub/docs/trien-khai-render.md`, mục A1b). Thiếu thì trang hỏi quyền của Lark báo lỗi 20027.

## Chạy

```
node server.js          # http://localhost:5204
node test/chay-het.js   # 6 bộ, không đụng thư thật
```
