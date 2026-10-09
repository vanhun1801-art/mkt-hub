# Nguyên tắc làm việc · Marketing Hub

Anh Hùng (09/10/2026): "Khi anh yêu cầu chỉnh gì đó thì việc đó không cần phải nhắc lại."

Mọi điều dưới đây đã được chốt qua các lần chỉnh. Mỗi thay đổi về giao diện, ở hub hay ở bất kỳ app con nào, phải giữ đúng các điều này. Đây là mặc định, không cần ai nhắc. Khi anh Hùng chốt thêm một điều mới, ghi thêm vào đây ngay trong lượt làm đó.

Lớp giao diện chung nằm ở `public/ios.css`, `public/ios.js` (lớp vỏ) và `public/ios-app.js` (chèn vào 15 app con). Luật mới đặt ở cuối `ios.css`, dùng độ ưu tiên `:not(#_):not(#__)…` để thắng luật riêng của từng app. Không sửa lẻ từng app khi luật chung làm được.

## 1. Điện thoại (≤ 640px)

- **Không kéo ngang nội dung.** Trang, thẻ và bảng đều không được rộng hơn màn hình.
  - Bảng chỉ đọc mà tràn ngang thì tự thành thẻ (`.ios-the-bang` trong ios-app.js).
  - Chỉ được cuộn ngang ở hai loại chỗ:
    - dải tab, dải nút lọc, dải chip;
    - bảng lưới hai chiều mà tiêu đề cột là ngày hoặc thứ (lịch người × ngày, lưới xếp hạng).
- Không thu phóng được. Ô nhập có chữ 16px, để iPhone không tự phóng to khi chạm vào.
- Giao diện kiểu ứng dụng chứ không kiểu website:
  - tiêu đề lớn nằm bên trái, không nhảy vào giữa khi cuộn;
  - nút tròn;
  - bộ lọc ẩn sau nút phễu;
  - không bày dòng phụ hay chú thích thừa.
- Cài đặt đi theo kiểu iOS: nhiều trang con trượt vào trong, nút ← quay về đúng trang trước.
- Soát ở các khổ 320, 375, 390 và 430px, cả giao diện sáng lẫn tối.

## 2. Bo góc (thang cố định)

| Thành phần | Bo |
|---|---|
| Ô nhập 1 dòng, select, ô ngày/giờ | 10px |
| Ô nhiều dòng, ô tải tệp | 12px |
| Bảng chọn nổi (danh sách xổ, lịch chọn ngày, gợi ý); dòng chọn bên trong | 14px; 9px |
| Thẻ nhỏ / khối lớn | 14px / 18px |
| Hộp cửa sổ (máy tính) | 18–22px |
| Nút, nút đoạn trong thanh lọc, ô tìm kiếm, chip | tròn (999px) |

Nút tròn phải tròn thật: rộng bằng cao, không được dẹp.

## 3. Chuyển động (một nhịp chung, các biến `--cd-*` trong ios.css)

- Mở: 0,26–0,42s, giảm tốc mềm (`--cd-vao`).
- Đóng: 0,2–0,26s, nhanh và gọn hơn lúc mở (`--cd-ra`).
- Trượt ngăn, cột, khối co giãn: `--cd-truot`. Đổi trạng thái, rê chuột: 0,16s (`--cd-deu`).
- **Cái gì mở có hiệu ứng thì đóng cũng phải có.** Không được tắt phụp:
  - cửa sổ, ngăn kéo;
  - danh sách xổ, bộ chọn ngày, gợi ý;
  - mục thu gọn;
  - chuyển app trong hub (hoà tan).
- Nhấn nút: thu nhỏ nhẹ rồi nảy về (`.ios-nhan` / `.ios-tha`). Nút chính có thêm gợn sáng. Không dùng kiểu chỉ nhạt đi.
- Thứ mới (hiệu ứng, kiểu nút…) cho anh xem ở `public/thu-hieu-ung.html` trước; anh duyệt rồi mới áp cho toàn app.

## 4. Cửa sổ, bảng chọn, thông báo

- Cửa sổ hiện lên thì phía sau tối khoảng 32% và mờ đi, kể cả thanh menu của lớp vỏ. Phía dưới bị khoá cuộn.
- Hộp cửa sổ có nền đặc một màu: đầu, thân và chân cùng màu, chỉ ngăn bằng đường mảnh. Không dùng nền trong suốt, vì nội dung phía sau sẽ xuyên qua.
- Mọi thông báo là viên kiểu Dynamic Island ở giữa mép trên (`__iosDao`), không dùng ô thông báo riêng của từng app.
  - Thành công: tick xanh. Lỗi: chấm than đỏ, giữ lâu hơn. Đang xử lý: vòng xoay. Thông tin: chữ i.
- Ô tải tệp, ô ngày, select, ô số, bảng chọn tự làm của từng app đều theo kiểu chung, không để lộ kiểu gốc của trình duyệt.
- Thanh cuộn ẩn ở mọi nơi. Vùng cỡ vừa còn nội dung bên dưới thì mép mờ dần (`.cd-mep`).

## 5. Màu và giao diện tối

- Dùng biến màu (`--ios-the`, `--ios-o`, `--ios-chu`, `--kinh-bang`…), không viết thẳng mã màu trắng hay đen.
- Giao diện tối:
  - không còn ô trắng hay chữ đen sót lại;
  - không có viền sáng lạc;
  - nút không bị trắng đi;
  - chữ đỏ và cam phải đủ tương phản.
- Màu thương hiệu Rooty Trip là `#289683`.

## 6. Chữ trên giao diện

- Tiếng Việt, gọn, có ích cho người đọc. Không dùng gạch dài. Không nói "hệ thống".
- Hộp xác nhận nói rõ hậu quả. Ví dụ: "Tệp bị gỡ khỏi việc này, không khôi phục được."
- Đổi chữ tiếng Việt thì đổi luôn khoá tương ứng trong `i18n.js`.

## 7. Quy trình mỗi lần sửa

1. Sửa xong thì tự soát. Không bắt anh tự kiểm.
   - `node tools/soat-giao-dien.mjs` soát hub và 15 app ở điện thoại và máy tính, sáng và tối. Nó báo:
     - kéo ngang;
     - lỗi JS;
     - bo góc lệch thang;
     - chữ ô nhập nhỏ hơn 16px trên điện thoại.
   - Chụp màn hình những chỗ đã đổi.
2. Chạy bộ test an toàn (bỏ 6 test có ghi dữ liệu). Phải qua hết trước khi commit.
3. Commit đúng đường dẫn, không bao giờ `git add -A`.
   - Không commit `du-lieu/*`, `kx-mau.html`, `lark-kho-media/dong-bo.json`, `lark-quy-chi-phi/du-lieu/`.
4. Đẩy lên ngay. Render chỉ tự deploy khi commit có đụng tới `lark-mkt-hub/`.
5. Dữ liệu Lark là dữ liệu thật của công ty:
   - khi soát, chỉ đọc;
   - chặn mọi lệnh ghi;
   - không bấm Lưu, Gửi, Nộp, Duyệt, Xoá, Đồng bộ;
   - muốn xoá hay ghi đè dữ liệu thật thì gửi danh sách để anh duyệt trước.
6. Báo cáo kết quả bằng tiếng Việt, ngắn gọn: đã làm gì, đã kiểm thế nào, còn gì chưa làm.
