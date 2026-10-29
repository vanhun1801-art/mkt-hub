---
name: giao-dien-hub
description: Luật giao diện của Marketing Hub (lark-mkt-hub và các app lark-*) theo lớp iOS đã chốt, cộng danh sách dấu "AI slop" bị cấm cả về hình lẫn chữ. Dùng mỗi khi sửa hay thêm màn, nút, cửa sổ, hiệu ứng, chữ trên giao diện, hoặc soát ảnh chụp giao diện trong repo .agents. Không dùng cho trang in gửi ra ngoài (trang có meta hub-trang-in) hay slide trình BGĐ.
---

# Giao diện Marketing Hub: khuôn iOS, không AI slop

Người dùng là anh Hùng, phòng Marketing Rooty Trip. Anh muốn app trông như một app thật do người làm, không phải bản AI dựng vội. Skill này gom hai thứ:

1. **Khuôn iOS của hub**: đã chốt qua nhiều lượt, nguồn gốc nằm ở `lark-mkt-hub/docs/nguyen-tac-lam-viec.md`.
2. **Dấu AI slop**: những kiểu mà model hay tự sinh ra khi "cố cho đẹp", đã gạn cho hợp với một app quản lý chứ không phải landing page.

Skill **không chép lại** tệp nguyên tắc. Tệp đó là nguồn duy nhất và luôn mới hơn skill. Trước khi sửa giao diện vẫn phải đọc nó (ít nhất mục 1 đến 7 và mục có số liên quan tới app đang sửa).

## 1. Thứ tự đọc trước khi sửa

1. `lark-mkt-hub/docs/nguyen-tac-lam-viec.md`: luật đã chốt, có ngày và lời anh Hùng.
2. `README.md` của app đang sửa: luật riêng của app (ví dụ Hộp thư: sổ riêng, không đổi Lark Mail).
3. Khối **BỘ CHUẨN** ở cuối `lark-mkt-hub/public/ios.css` (tìm chữ `BỘ CHUẨN THÀNH PHẦN DUY NHẤT`): kiểu nút chính, nút phụ, nút xoá, chip, nhãn, số đếm, phân đoạn. Thành phần mới phải khớp một kiểu ở đây, không dựng kiểu thứ hai.

## 2. Khuôn iOS: dùng cái có sẵn, đừng tự chế

| Cần | Dùng | Không làm |
|---|---|---|
| Màu | biến `--ios-*`: `--ios-the`, `--ios-o`, `--ios-chu`, `--ios-chu-2`, `--ios-vach`, `--ios-xanh`/`--ios-xanh-chu`, `--ios-do`/`--ios-do-chu`, `--ios-cam`/`--ios-cam-chu`, `--ios-xanh-nhat`... | viết thẳng `#fff`, `#000`, `rgb(...)`; tự đặt bảng màu riêng |
| Màu chữ trên nền nhạt | bản `-chu` (đã chỉnh đủ tương phản 4,5:1) | dùng màu nền đặc làm màu chữ |
| Chữ | `var(--ios-font)` (SF Pro, Segoe UI); thang 17 thân, 15 phụ, 13 chú thích; tối thiểu 12px | nhập font Google mới, cỡ chữ lẻ, chữ dưới 12px |
| Chuyển động | `--cd-vao` mở 0,26–0,42s; `--cd-ra` đóng 0,2–0,26s; `--cd-truot` trượt ngăn; `--cd-deu` 0,16s đổi trạng thái | `ease` mặc định, thời gian tuỳ hứng, mở có hiệu ứng mà đóng tắt phụp |
| Nhấn nút | `.ios-nhan` / `.ios-tha` (ios-app.js tự gắn) | chỉ làm nhạt đi; `transform` khi rê chuột |
| Thông báo | `parent.__iosDao(chu, lop)` (viên Dynamic Island) | ô toast riêng của app, `alert()` |
| Cửa sổ có nền tối phía sau | `window.__HUB__.che` (ios-app.js tự phát hiện) | lớp phủ tự chế, nền trong suốt |
| Vùng cuộn | thanh cuộn ẩn + `.cd-mep` mờ mép | để lộ thanh cuộn của trình duyệt |
| Đang nạp | khung xương `.kx` (kiểu C kính nhoè) | vòng xoay giữa màn, chữ "Đang tải..." trơ trọi |
| Luật CSS mới | cuối `ios.css`, dưới `html[data-skin="ios"]:not(#_):not(#__)` | sửa lẻ từng app khi luật chung làm được |

Bo góc theo thang cố định (mục 2 của tệp nguyên tắc). Ngắn gọn:
- ô nhập 10;
- ô nhiều dòng 12;
- bảng chọn nổi 14, dòng chọn bên trong 9;
- thẻ nhỏ 14, khối lớn 18;
- cửa sổ 18–22;
- nút, chip và ô tìm thì tròn 999px.

Nút tròn phải tròn thật: rộng bằng cao.

Kính (`--lg-*`) chỉ dùng cho lớp điều khiển (thanh tab, thanh bên, bảng thông báo). Thẻ nội dung và hộp cửa sổ có **nền đặc một màu**. Bảng chọn xổ xuống phải đục hẳn.

## 3. Dấu AI slop về hình: cấm

Mỗi dòng là một thứ model hay tự thêm vào. Gặp trong mã của mình thì gỡ.

**Màu và ánh sáng**
- Gradient tím xanh, quầng neon, `box-shadow` phát sáng màu quanh nút hay thẻ.
- Chữ tô gradient.
- Màu nhấn thứ hai, thứ ba tự nghĩ ra. Hub chỉ có xanh `--ios-xanh` làm màu nhấn; đỏ, cam, vàng, lục chỉ mang nghĩa trạng thái. Màu thương hiệu `#289683` dành cho tài liệu và nhận diện.
- Đổ bóng ở giao diện tối (`--ios-bong: none`).
- Viền thẻ đậm, khung lồng khung (card trong card trong card).

**Trang trí thừa**
- **Vạch màu dọc bên trái** thẻ để báo trạng thái. Anh Hùng đã gạt bỏ ("ánh sáng không nên quá cứng nhắc"). Muốn làm nổi thì dùng quầng sáng loang mềm `::after` chỉ đổi opacity, nhịp 3,2s, neo đồng hồ bằng `--tho-tre` (mẫu: `wc-tho` trong `lark-task-manager/public/styles.css`).
- Chấm màu trước mọi dòng, mọi mục menu, mọi nhãn. Chấm chỉ dùng khi nó là trạng thái thật (kết nối được hay lỗi).
- Emoji trong khung giao diện: nút, tiêu đề, tab, chip (ios-app.js còn gỡ emoji khỏi khung). Dùng icon nét có sẵn của app.
- Viên nhãn chồng lên ảnh, nhãn "Mới", "Beta", "v2.0" trang trí.
- Hiệu ứng lặp vô hạn (nhấp nháy, xoay, lắc, lướt sáng). Ngoại lệ đã duyệt: quầng sáng thở cho việc chờ lâu hoặc tin chưa đọc, và chỉ cho mục gần đây. Cái gì cũng nháy thì không còn gì nổi.
- Rê chuột làm phần tử dịch chỗ, phóng to, nảy lên. Rê chuột chỉ đổi nền, màu hoặc bóng, và chỉ trong `(hover: hover) and (pointer: fine)`.

**Bố cục**
- Ba thẻ bằng nhau nằm ngang chỉ để lấp chỗ.
- Hero, tiêu đề cực to, câu khẩu hiệu đầu trang. Đây là app làm việc: mở ra là thấy việc.
- Nhãn "Bước 1 / Bước 2 / Bước 3", số thứ tự khối kiểu "01 ·". Tên bước chính là việc của bước đó.
- Dòng chữ nhỏ giải thích dưới mỗi tiêu đề khối. Tiêu đề + nội dung là đủ.
- Bố cục nhảy khi dữ liệu về, khi mở hay đóng một bản ghi, khi vẽ lại. Giữ chỗ trước bằng khung xương; phần tử vẽ lại phải giữ nguyên vị trí (viên chọn tab không trượt lại từ mép trái mỗi lần vẽ).
- Viền `border` để báo trạng thái kéo thả hoặc chọn: nó chiếm chỗ làm danh sách xê dịch. Dùng `outline` hoặc `inset box-shadow`.
- Trên điện thoại: bất cứ thứ gì kéo ngang được ngoài dải tab, dải lọc, dải chip và lưới người × ngày.

**Dữ liệu giả**
- Tên kiểu "Nguyễn Văn A", "John Doe", số tròn trịa `99%`, `1.234.567` trong khung xương, ảnh mẫu, bản thử. Dùng dữ liệu thật đọc chỉ đọc, hoặc khung xương không chữ.
- Ảnh đại diện mặc định hình người xám. Không có ảnh thì dùng chữ cái đầu trên nền màu ổn định theo tên.

## 4. Dấu AI slop về chữ: cấm

Áp cho mọi chuỗi người dùng nhìn thấy, kể cả thông báo lỗi và chữ trong `i18n.js`. Viết hay sửa chữ thì gọi thêm skill `ux-writing`.

- **Gạch dài `—`** nối hai vế. Tách bằng dấu chấm, phẩy, hai chấm. Chỉ giữ một dấu `—` đứng một mình trong ô bảng rỗng.
- Chữ **"hệ thống"**. Nói thẳng: "Máy chủ đang lỗi", "Theo máy", "Tình trạng máy chủ".
- Từ đệm quảng cáo: "dễ dàng", "nhanh chóng", "liền mạch", "mạnh mẽ", "thông minh", "tối ưu", "trải nghiệm", "giải pháp", "nâng tầm", "chào mừng bạn đến với".
- Câu hỏi trần trong hộp xác nhận ("Bạn có chắc không?"). Phải nói chuyện gì xảy ra: "Xoá thông báo này? Người nhận sẽ không thấy nó nữa."
- Nút trần "OK", "Xác nhận", "Gửi đi" khi nói được việc cụ thể: "Gửi ngay", "Lưu nháp", "Giao việc".
- Chữ kỹ thuật bày ra giao diện: tên luật, mã lỗi thô, stack, "Chưa luật nào nhận", tên trường Base.
- Dấu `·` ngăn cả dãy dài. Tối đa một hoặc hai trên một dòng.
- Gọi "anh" trên giao diện dùng chung. Chỉ xưng "anh" trong chat với anh Hùng.
- Dấu chấm than, câu cảm thán, lời khen ("Tuyệt vời!", "Hoàn hảo!").
- Viết hoa từng chữ trong tiêu đề kiểu tiếng Anh.

Đổi chữ tiếng Việt thì đổi luôn khoá trong `lark-mkt-hub/public/i18n.js`, không thì bản tiếng Anh lặng lẽ mất. Dữ liệu người dùng nhập (tên thư mục, tiêu đề ghi chú) khai vào danh sách bỏ qua của i18n.

## 5. Khi dựng một màn mới

- Đặt tên ngăn, tab, bộ lọc theo **việc người dùng phải làm**, không theo cách app phân loại. Không quá 3–4 ngăn; ngăn trống thì ẩn. Số trên ngăn là số việc còn phải làm.
- Việc chính có nút có chữ (tối đa 3). Việc phụ cất vào nút `⋯ Thêm`.
- Danh sách và chi tiết dùng khuôn hai phần cố định. Bấm vào đâu trên dòng cũng mở được chi tiết.
- Nút bị khoá thì ghi lý do ngay cạnh nút.
- Gửi ra ngoài (thư, tin) luôn qua bản xem trước.
- Trạng thái trống nói một câu có ích và chỉ chỗ bắt đầu, không vẽ minh hoạ to.
- Điện thoại (≤ 640px) chỉ giữ thứ dùng khi cầm máy:
  - bộ lọc giấu sau nút phễu;
  - nút việc của máy tính (Xuất, Tải Excel, Mở Base) ẩn;
  - ô nhập chữ 16px.

## 6. Soát trước khi báo xong

1. Tự soát, không nhờ anh Hùng kiểm:
   - chạy `node lark-mkt-hub/tools/soat-giao-dien.mjs` khi hub đang chạy ở 5180, phải ra "Không có lỗi";
   - nếu báo một lỗi lẻ thì chạy lại một lần trước khi kết luận.
2. Xem bằng mắt:
   - các khổ 320, 375, 390, 430, 768, 1024, 1280, 1920;
   - cả giao diện sáng lẫn tối;
   - lỗi hay lộ ở 320px và ở khổ tablet 641–1100px.
3. Rà theo danh sách:
   - còn mã màu viết thẳng không;
   - còn `—` trong chuỗi hiện ra không;
   - còn emoji trong khung không;
   - đóng có hiệu ứng không;
   - mở, đóng, vẽ lại có làm cột hay dòng xê dịch không;
   - giao diện tối có còn ô trắng, chữ đen, viền sáng lạc không.
4. Dữ liệu Lark là thật. Khi soát chỉ đọc:
   - chặn lệnh ghi;
   - không bấm Lưu, Gửi, Nộp, Duyệt, Xoá, Đồng bộ.
5. Chạy bộ test an toàn của `lark-mkt-hub` và của app vừa sửa.
6. Commit đúng đường dẫn (không `git add -A`), rồi đẩy lên ngay. Render chỉ tự deploy khi commit có đụng tới `lark-mkt-hub/`.

## 7. Khi anh Hùng chốt điều mới

- Luật về giao diện hay quy trình: ghi vào `lark-mkt-hub/docs/nguyen-tac-lam-viec.md` trong cùng lượt, có ngày và trích lời anh.
- Một kiểu "trông như AI làm" mới mà anh chê: thêm một dòng vào mục 3 hoặc 4 của skill này.
