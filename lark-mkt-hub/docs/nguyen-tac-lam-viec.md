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
    - bảng Kanban: cột trạng thái xếp ngang, nhưng vuốt dừng đúng từng cột như lật trang, cột trống thì ẩn.
  - Bảng có ô nhập tới 9 cột cũng thành thẻ: tên cột ở trên, ô nhập trải hết bề ngang. Bảng tính sửa tại ô nhiều cột hơn (Bảng công việc › Bảng) là việc của máy tính, nên tab đó ẩn trên điện thoại.
  - Danh sách hạng mục có nhiều ô sửa (bảng kê KOL, 17/10/2026) không dàn thành bảng nhiều cột, kể cả trên máy tính. Mỗi dòng là một thẻ gọn chỉ hiện thứ cần nắm (giờ, tên, đối tác, khách, trạng thái, tiền); bấm vào mới mở khung sửa có tên từng ô. Nhóm theo ngày, tổng và việc còn dở đặt trên đầu.
  - Biểu đồ cột tới 8 cột phải co vừa màn. Từ 9 cột trở lên mới cho vuốt ngang.
- Không thu phóng được. Ô nhập có chữ 16px, để iPhone không tự phóng to khi chạm vào.
- Giao diện kiểu ứng dụng chứ không kiểu website:
  - tiêu đề lớn nằm bên trái, không nhảy vào giữa khi cuộn;
  - nút tròn;
  - bộ lọc ẩn sau nút phễu;
  - không bày dòng phụ hay chú thích thừa.
- Cài đặt đi theo kiểu iOS: nhiều trang con trượt vào trong, nút ← quay về đúng trang trước.
- **Điện thoại chỉ giữ thứ người ta dùng khi cầm máy.** Mọi thứ khác giấu đi hoặc ẩn hẳn (module "gọn điện thoại" trong ios-app.js gắn `.ios-an-dt`):
  - bộ lọc: giấu sau nút phễu;
  - nút việc của máy tính (Xuất CSV, Xuất báo cáo, Tải Excel, Sheet HCNS, Chép khối ngày, Hướng dẫn, Kết nối, Mở Base): ẩn;
  - thẻ hướng dẫn thao tác trên máy tính: ẩn;
  - nhóm rỗng (số 0): ẩn;
  - dòng giải thích dài dưới tiêu đề khối, chữ "rê chuột": ẩn.
  - đoạn chữ nhỏ (≤ 12,5px) dài từ 3 dòng: ẩn, trừ khi nằm trong cửa sổ, form hay mục thu gọn;
  - nhóm có số 0 kèm câu "Không có… / Chưa có…": ẩn;
  - hộp báo lỗi kết nối: chỉ giữ dòng báo lỗi và nút sửa.

  Gặp màn mới thì tự áp đúng tinh thần đó, không đợi anh chỉ từng chỗ.
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
  - Nền phía sau phải **một màu liền**: vùng thanh menu và vùng app cùng một công thức (tối 32%, mờ 6px, đậm màu 1.2). Mỗi vùng chỉ có một lớp tối; lớp thừa chuyển trong suốt (`.ios-nen-thua`). Không gắn thêm filter làm tối riêng cho thanh menu.
- Hộp cửa sổ trên máy tính canh giữa **cả màn hình**, thẳng hàng với viên thông báo, chứ không phải giữa khung app. Phần này do module "cửa sổ giữa cả màn" trong ios-app.js làm.
- Thanh chọn (dải lọc, nút đoạn, tab) luôn cho thấy ô đang chọn: viên trượt, hoặc ô tô xanh đặc ở dải lọc, hoặc viên nền nổi ở nút đoạn. Chỉ đậm chữ thôi thì không đủ. Công cụ soát báo lỗi nếu thiếu.
- Khung chi tiết (`.drawer`, như ô việc của Bảng công việc, ô lịch của Lịch tác nghiệp) có **kích thước cố định** (15/10/2026): rộng `min(760px, 100vw - 32px)`, cao `min(88vh, 940px)`, điện thoại cao `100dvh - 96/120px`. Đổi tab Thông tin · Trao đổi · Báo cáo thì cửa sổ không co giãn; nội dung dài thì cuộn trong thân khung. Không dùng `height: fit-content`.
- Hộp cửa sổ có nền đặc một màu: đầu, thân và chân cùng màu, chỉ ngăn bằng đường mảnh. Không dùng nền trong suốt, vì nội dung phía sau sẽ xuyên qua.
- **Hộp cửa sổ không cao quá màn** (26/10/2026, email trình BGĐ của KOL khuất nút Gửi): đầu và chân (nút Gửi, Lưu…) luôn đứng yên trong màn, chỉ phần thân cuộn. Một hộp chỉ một vùng cuộn: khung con bên trong không tự cuộn riêng, vì nó giữ mất cú lăn chuột.
- **Nút bị khoá phải nói lý do ngay cạnh nút** (26/10/2026, "không ấn gửi ngay được"): dòng giải thích đặt sát nút, không chỉ ở đầu cửa sổ (cuộn là mất). Có việc cần làm trước thì kèm nút dẫn tới chỗ đó.
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
   - `node tools/soat-giao-dien.mjs` soát hub và 15 app, kể cả từng tab bên trong, ở điện thoại và máy tính, sáng và tối. Mọi lệnh ghi đều bị chặn ở tầng trình duyệt. Nó báo:
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

## 8. Ai xuất được tệp

Anh Hùng (10/10/2026): nhân sự xuất được báo cáo, nhưng **xuất đúng phần của mình**.

- Bản xuất đi qua **cùng một phép tính phạm vi** với màn hình, để tệp luôn khớp với bản người ta vừa nhìn. Chặn cứng thì người ta chụp màn hình gửi đi, mà ảnh chụp không có mốc đo lường lẫn ghi chú giới hạn số liệu.
- Bản rút gọn phải **tự khai là của ai**: tên người trên tiêu đề, một dòng "không phải số của cả phòng", và tên người trong tên tệp. Tệp rời khỏi app là không còn thanh lọc, không còn dải phạm vi.
- Số của **cả phòng** (chi phí, doanh thu, ROAS, tệp khách mới, xu hướng nhiều tháng) không được lọt vào bản rút gọn — kể cả khi bản xuất tự đọc thêm, vì đường đó không đi qua chốt của màn hình.

### Tệp báo cáo xuất ra (10/10/2026)

- Đầu tệp chỉ giữ **thông tin cơ bản**: kỳ đo, số ngày, số kênh, và so với kỳ nào nếu có bật so sánh. Không đếm base đọc được, không đếm số chỉ số, không giải thích mục tiêu. Bản rút gọn giữ thêm đúng một dòng "không phải số của cả phòng".
- **Không đưa khối "Giới hạn số liệu" vào tệp.** Trên màn hình nó gập lại, ai cần thì bấm; trong tệp in ra thì không gập được nên mỗi khối đội thêm một hộp chữ dài trước cả dãy số.
- Biểu đồ thanh xếp hạng **hẹp lại** (tối đa 520px), không trải hết bề ngang trang.
- Chân tệp là **chữ ký của ứng dụng**, một dòng: `Xuất lúc <giờ> <ngày> · Marketing Hub · phát triển bởi Lê Văn Hùng`.

### Tệp báo cáo xuất ra (10/10/2026)

- **Khổ A4 dọc.** Trang rộng 780px, bằng đúng một mặt A4 trừ lề, nên xem trên màn sao thì in ra vậy. Dãy ô ba cột; không có chỗ nào kéo ngang.
- Đầu tệp chỉ giữ **thông tin cơ bản**: kỳ đo, số ngày, số kênh, và so với kỳ nào nếu đang bật so sánh. Không đếm base đọc được, không đếm số chỉ số, không giải thích mục tiêu. Tên người ở ngay trên tiêu đề là đủ để biết bản của ai.
- **Không đưa khối "Giới hạn số liệu" vào tệp.** Trên màn hình nó gập lại, ai cần thì bấm; trong tệp in ra không gập được nên mỗi khối đội thêm một hộp chữ dài trước cả dãy số.
- Biểu đồ thanh xếp hạng **hẹp lại** (tối đa 520px), không trải hết bề ngang trang.
- Chân tệp là **chữ ký của ứng dụng**, một dòng: `Xuất lúc <giờ> <ngày> · Marketing Hub · phát triển bởi Lê Văn Hùng`.

## 9. Người ngoài phòng Marketing (14/10/2026)

- Phạm vi app Lark đã mở cho cả công ty, nên đăng nhập được không còn nghĩa là người phòng MKT.
- Người phòng MKT là người có dòng trong bảng Phân quyền, hoặc ở nhóm chat "Phòng MKT", hoặc là quản lý khai bằng env, hoặc là tài khoản mật khẩu đã được duyệt.
- Ai ngoài các diện đó là **khách công ty**. Anh Hùng chốt: không cần cấp gì, đăng nhập xong là vào thẳng **Bảng công việc** và chỉ thấy việc có tên mình (phụ trách, hỗ trợ, việc mình order hay giao liên phòng). Khách không có Tổng quan, bảng tin, lịch. Khách **được tạo việc** (anh Hùng chốt cùng ngày): việc tạo ra là order "Chờ tiếp nhận" gửi phòng MKT, quản lý phân công sau.
- **Việc con (Bảng công việc) mở cho tất cả người trong phòng** (anh Hùng 26/10/2026: "anh muốn tất cả"): ai xem được việc lớn thì thêm được việc con vào đó, kể cả người bị tắt "Được tạo mới" (ô đó chỉ chặn tạo việc lớn mới). Khách công ty vẫn chỉ chia việc có tên mình.
- Base mở cho khách khai ở `MO_CHO_KHACH` (server.js). Base "cả phòng" KHÔNG mở cho khách. Máy chủ chỉ cho khách đi các đường trong `DUONG_CHO_KHACH`, route mới mặc định kín với khách.
- Hub báo app con bằng header `x-hub-khach`. App con không được đưa cho khách danh bạ công ty hay dữ liệu của việc không có tên họ.
- Khớp dòng phân quyền theo tên chỉ nhận dòng chưa gắn email/open_id, và người đó phải ở nhóm "Phòng MKT".

## 10. Bài đăng dạng ảnh (17/10/2026)

- Bài ảnh **có** được ghi nhận: Facebook qua `/posts` (`status_type` = `added_photos`), Instagram qua `media_type` = `IMAGE`/`CAROUSEL_ALBUM`, Zalo gộp trong "Bài viết". TikTok thì **không** — app chỉ gọi `/video/list/`, mà anh Hùng xác nhận phòng chưa đăng dạng ảnh trên TikTok.
- Meta đã gỡ lượt xem và lượt tiếp cận ở **mức bài**. Video lấy bù được ở node video; ảnh và bài chữ thì không có đường nào. Đừng đi tìm lại, đã thử từng chỉ số trên sáu phiên bản API.
- Chỉ số đếm người duy nhất mà bài ảnh còn là **`post_clicks`** — cột "Lượt bấm" (`fld7Go6Zxh`) của bảng Bài đăng, thêm ngày 17/10/2026.
- Quy tắc của cột này, giống mọi cột khác trong hub: **ô trống = chưa đo được, số 0 = đo rồi và bằng 0.** Instagram, TikTok, Zalo không trả chỉ số này nên ô của chúng trống vĩnh viễn — `dongPost()` bỏ hẳn cột thay vì ghi 0. Khi Meta không trả thì `sync/facebook.js` gán `null`, không gán 0.
- "Lượt bấm" nằm trong `COT_POST_GIU`: một lượt đồng bộ trả 0 **không được** xoá số dương đã có. Lý do: khi Meta gỡ một metric, `baiCuaPage()` bỏ cả khối insights rồi hỏi lại, nên cả lượt về 0.
- Trên giao diện, bảng Bài đăng và bảng "Dạng bài nào ăn" in **dấu gạch** chứ không in số 0 cho lượt xem, tiếp cận và tỷ lệ tương tác khi không đo được. Bảng Bài đăng xếp hạng được theo "Lượt bấm" để so bài ảnh với bài ảnh.

## 11. Chấm KPI bằng số nào (18/10/2026)

- **Kho KPI mở được tháng mới ngay trên app.** Anh Hùng dừng nhập Excel từ tháng 9/2026; trước đó kho chỉ nhận tháng do bản nhập Excel sinh ra nên tháng 9 và tháng 10 không tồn tại, mà màn Tiến độ vẫn lặng lẽ bày số tháng 7 ra như số hiện tại. Thiếu tháng thì app phải **mời mở**, không được im.
- **Chỉ số đếm được trên bài thì lấy từ bảng Bài đăng, không lấy từ dòng ngày.** Dòng ngày của TikTok do app tự tính bằng chênh lệch giữa hai lần đồng bộ, ngày nào không chạy là ngày đó bằng 0 — đã làm bốn kênh TikTok hiện 0% kèm chú thích "đã đo được", trừ oan hai người suốt bốn tháng.
- **Lượt xem để chấm KPI là lượt xem ĐÃ QUY ĐỔI theo mục đích bài**, không phải lượt xem thô. Bán hàng ×1,0 · Tương tác ×0,2, hệ số lấy từ bộ luật. Bài chưa gắn nhãn thì bị loại và app phải nói ra bao nhiêu bài bị loại — đoán bừa là trừ oan 80% hoặc cho không.
- **Người cùng giữ một kênh thì chấm theo tên người đăng trên từng bài**, không chia theo tỷ trọng kênh. Tra bằng bảng `tenDang`, tuyệt đối không suy từ tên: "Phương Ái" là Thư, "Lý Thư Bạch" là Ngọc.
- **Tab KPI xếp theo CHỈ SỐ → KÊNH → NGƯỜI.** Chỉ số của doanh nghiệp đứng trước, KPI từng người là phần phụ. Mốc tuần phải có số tuyệt đối ("hết ngày 7 cần 1,88tr, đang có 597k"), không chỉ phần trăm.
- **Đổi tab thì giữ chiều cao cũ và đưa về đầu trang.** Để trang co lại là thanh cuộn biến mất, nội dung xê ngang, và vị trí cuộn bị kẹp về 0 một cách khó đoán.

## 12. Việc lớn, việc con và việc tạo từ tin (21/10/2026)

- **Việc con dùng ô "Parent items" có sẵn của Base**, chỉ một tầng: việc con không chia tiếp. Việc cha chỉ ghi lúc tạo, không đường sửa nào đổi được.
- **Không bày việc con ra ngoài.** Ngoài danh sách chỉ có mũi tên ↳ trước tên việc con và viên "2/5" sau tên việc lớn (đỏ khi có việc con trễ, xanh khi xong hết). Kanban và Bảng gom việc con vào việc lớn. Việc của tôi, Order và Lịch vẫn hiện việc con như việc thường, vì người được giao tìm việc của mình ở đó.
- Trong ô chi tiết của việc lớn: thanh tiến độ, rồi mỗi việc con một dòng có **tên và trạng thái** (kèm người làm, hạn), bấm vào là mở chi tiết việc con. Dưới cùng là **ô gõ sẵn** "Thêm việc con": gõ tên rồi Enter là tạo, không qua form. Việc con có dòng "Thuộc việc lớn" để quay về.
- **Đi vào việc con ngay trong cửa sổ đang mở**, kiểu đẩy trang iOS: việc lớn lùi sang trái, việc con trượt vào từ phải; bấm "Thuộc việc lớn" thì trượt ngược lại. Không đóng rồi mở lại cửa sổ. Quản lý vào việc con là gặp ngay form sửa để đặt người làm, hạn, chi tiết.
- Gõ xong việc con là dòng của nó phải hiện và bấm được ngay, kể cả khi Lark chưa kịp trả ô "Parent items" của bản ghi mới (app gắn tạm, lượt đọc sau thay bằng bản thật).
- Việc con gõ nhanh nhận sẵn chiến dịch, loại việc, ưu tiên, hạn và **người phụ trách của việc lớn**. Chưa có người phụ trách thì bộ tự phân phối sẽ giao cho người khác, nên không được để trống.
- Việc con là bản ghi bình thường: thông báo giao việc (ghi rõ "việc con … thuộc việc lớn …"), làm lại, nộp, nghiệm thu, nhắc hạn, tự phân phối đều chạy như việc thường.
- Tiến độ do máy chủ đếm trên toàn bộ việc của phòng, nên đúng cả khi người xem không thấy hết việc con.
- Quản lý chia được mọi việc. Nhân sự chỉ chia được việc mình phụ trách hoặc hỗ trợ, và việc con khi đó giao cho chính họ.
- **Việc tạo từ "Tin của phòng" không chép chữ của tin.** Ô link giữ `#/tin/<mã>`, app vẽ thành thẻ "Trích từ tin" (ảnh, tiêu đề, ngày, một dòng trích), bấm vào là mở đúng tin. Ảnh và tệp của tin vẫn đi theo vào ô Tệp đính kèm.

## 13. Lời nhắc kiểm tra việc và nút trên điện thoại (26/10/2026)

- **Nút phụ trên từng dòng danh sách thì không bày ra trên điện thoại.** Ví dụ "+ Tạo việc" ở bảng tin: máy tính hiện khi rê chuột, điện thoại và màn cảm ứng thì ẩn. Thao tác đó vẫn có trong cửa sổ mở ra khi chạm vào dòng ("Tạo việc từ tin này").
- Lời nhắc kiểm tra việc (`nhac-hanh-dong.*`, viên linh vật góc dưới) theo đủ thang chung: chữ từ 12px, nút tròn, màu theo biến, mở theo `--cd-vao` 0,36s, đóng theo `--cd-ra` 0,22s. Các phần xếp hàng tự co, không đặt toạ độ cứng, để chữ không bị nút đè. Điện thoại chỉ giữ câu số liệu ("3 việc trễ hạn cần kiểm tra."), tối đa hai dòng.
- Chữ trên lời nhắc không gọi "anh": quản lý nào cũng thấy nó.
- Nút dẫn sang app con phải đi được cả khi app con đã mở sẵn. Lớp vỏ không nạp lại khung nên `?mo=` không được đọc lần nữa; khi đó nhắn lệnh `{ hub: 'mo', v }` sang, app con xử lý bằng `moTheoLenh()`.
- Lời nhắc có thêm **tin Trao đổi chưa đọc** (26/10/2026): tin của người khác, mới hơn mốc "đã xem" của chính mình, trên việc còn mở mà mình phụ trách / hỗ trợ / order, trong 14 ngày. Thứ tự: việc trễ hạn → tin chưa đọc → chờ duyệt → sắp đến hạn; có cả việc trễ lẫn tin thì tin là liên kết phụ cùng dòng. Bấm là mở thẳng tab Trao đổi của việc có tin mới nhất (lệnh `{ hub: 'open', rec, mo: 'trao-doi' }`). Chỉ đọc; mở tab Trao đổi thì app tự ghi "đã xem" như cũ.

## 14. Trang nội bộ của hub cũng theo khuôn app con (26/10/2026)

Anh Hùng: "chỉnh theo style tổng thể ứng dụng của mình và cho nó hoạt động như cơ chế bên mình" (về Ghi chú).

- Trang nào của hub chạy trong khung mà không đi qua `proxy.js` (như `ghi-chu.html`) thì tự gắn đủ lớp chung y như proxy gắn cho app con: `data-app`, `data-skin`, `trong-hub`, `window.__HUB__.che`, sáng/tối theo hub, `i18n.js`, `dienthoai.css`, `ios.css`, `ios-app.js`.
- Thông báo đi qua viên Dynamic Island của hub (`parent.__iosDao`), không dùng ô riêng.
- Tạo việc từ bất kỳ đâu (Tin của phòng, Ghi chú…) đều mở **form thật của Bảng công việc**, điền sẵn, ô Link giữ đường về nguồn; Bảng công việc vẽ thành thẻ nguồn ("Tin gốc", "Ghi chú gốc"). Không dựng form tạo việc thứ hai.
- `<option>` phải có `value` gốc: i18n dịch chữ hiển thị, không được làm đổi giá trị gửi lên Base.
- Dữ liệu người dùng (nội dung ghi chú, tên thư mục tự đặt, tiêu đề) khai vào danh sách bỏ qua của i18n.
- Trang có thanh dưới cố định riêng thì trong hub trên điện thoại phải dừng phía trên thanh tab kính; trang có thanh điều hướng riêng thì ẩn thanh tiêu đề điện thoại của hub (`body.xem-ghi-chu .mob-bar`), không để hai tiêu đề lớn chồng nhau.
- Màu nhấn là màu của hub; không dùng màu riêng kiểu app khác (đã bỏ màu vàng Apple Notes).
