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

Trong thư chỉ có ba nút có chữ: **Trả lời**, **Giao việc**, **Xong** (chuyển vào Lưu trữ, có Hoàn tác). Nhắc lại sau, chuyển ngăn, gắn sao, đánh dấu chưa đọc nằm trong nút **⋯ Thêm**. Không bày lý do xếp ngăn ra giao diện.

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
- Không có nút xoá. Lưu trữ = chuyển sang ARCHIVED, có Hoàn tác.
- Trả lời mặc định lưu nháp. Gửi phải qua hộp xác nhận ghi rõ người nhận và hộp gửi; máy chủ chỉ gửi khi nhận đúng `gui: true`.
- `HOP_THU_CHI_DOC=1`: chặn mọi lệnh đổi nhãn, gửi thư. Dùng khi soát giao diện (cấu hình `hop-thu-xem` trong `.claude/launch.json`).

## Điều kiện để Nối hộp thư chạy trên Render

App Marketing Hub (`cli_aa1a8ae21a78ded2`) phải được cấp 7 quyền mail cùng `offline_access` trong Developer Console rồi **phát hành version** (danh sách ở `lark-mkt-hub/docs/trien-khai-render.md`, mục A1b). Thiếu thì trang hỏi quyền của Lark báo lỗi 20027.

## Chạy

```
node server.js          # http://localhost:5204
node test/chay-het.js   # 6 bộ, không đụng thư thật
```
