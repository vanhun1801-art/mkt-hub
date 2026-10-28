# Hộp thư · Lark Mail

App con thứ 16 của Marketing Hub (id `hop-thu`, cổng 5204). Gom mọi hộp thư người dùng được cấp quyền (hộp chính + hộp chung như `sales@`, `marketing@`, `cmo@`, các hộp `pito@`) vào một danh sách, xếp theo việc phải làm.

## Bốn ngăn

| Ngăn | Vào đây |
|---|---|
| Cần xử lý | đề xuất xin duyệt, khách đặt dịch vụ, thư hỏi cần trả lời, thư lạ chưa luật nào nhận |
| Sếp giao | thư từ Ban giám đốc (`HOP_THU_SEP`) |
| Để biết | UNC, hoá đơn, bản lưu Tourwell, thông báo chung, thư mình tự gửi |
| Tự động | mã xác nhận, thư máy gửi, quảng cáo |

Thứ tự xếp: luật anh tự đặt (nút Chuyển ngăn) > luật cài sẵn (`phan-loai.js`) > AI > Cần xử lý. Thư không ai nhận thì vào Cần xử lý: sót một đề xuất trong ngăn "Để biết" tệ hơn chiều ngược lại.

## AI (Claude)

- Khoá `ANTHROPIC_API_KEY` ở `lark-hop-thu/.env` (mẫu: `.env.example`). Thiếu khoá thì app vẫn chạy, chỉ tắt tóm tắt và viết nháp.
- Mở thư ở ngăn Cần xử lý / Sếp giao thì tự tóm tắt; ngăn khác bấm "Tóm tắt". Kết quả cất ở `du-lieu/ai.json`, mở lại không tốn thêm lượt.
- Thư luật không nhận được xếp nhanh cả loạt bằng một lượt gọi (chỉ người gửi + tiêu đề).
- Gọi thẳng HTTP (`ai.js`), không qua gói npm: cả repo không có dependency và Render build rỗng.
- Thư là dữ liệu từ ngoài: nằm trong thẻ `<thu>`, AI không có công cụ nào, kết quả chỉ là chữ bày ra.

## An toàn

- Đọc bằng lark-cli của máy này. Qua Hub chỉ người có email trùng chủ hộp thư chính mới mở được; người khác nhận 403.
- Không có nút xoá. Lưu trữ = chuyển sang ARCHIVED, có Hoàn tác.
- Trả lời mặc định lưu nháp. Gửi phải qua hộp xác nhận ghi rõ người nhận và hộp gửi; máy chủ chỉ gửi khi nhận đúng `gui: true`.
- `HOP_THU_CHI_DOC=1`: chặn mọi lệnh đổi nhãn, gửi thư. Dùng khi soát giao diện (cấu hình `hop-thu-xem` trong `.claude/launch.json`).

## Chưa làm

Mỗi người trong phòng đọc hộp thư của chính mình khi Hub chạy trên Render. Việc này cần app Marketing Hub (`cli_aa1a8ae21a78ded2`) được cấp quyền `mail:*` trong Developer Console, phát hành bản mới, rồi thêm bước "Nối hộp thư" lưu token từng người. Hiện app chỉ chạy trên máy đã đăng nhập lark-cli.

## Chạy

```
node server.js          # http://localhost:5204
node test/chay-het.js   # 4 bộ, không đụng thư thật
```
