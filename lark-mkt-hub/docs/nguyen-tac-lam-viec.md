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

- **Việc con dùng ô "Parent items" có sẵn của Base**, sâu tối đa **3 cấp** (27/10/2026, trước đó chỉ một tầng và việc cha chỉ ghi được lúc tạo). Xem mục 16.
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
- Trong Bảng công việc, việc có tin chưa đọc mang viên **"N tin mới"** cạnh tên ở mọi tab; tab Trao đổi có vạch **"Tin mới"** trước tin chưa đọc đầu tiên và mở ra ngay chỗ đó. Lời nhắc có từ hai hội thoại trở lên thì mở danh sách "Tin nhắn chưa đọc" (mỗi dòng ghi ai nhắn gì), một hội thoại thì mở thẳng (anh Hùng: "khi ấn vào thì không biết hội thoại nào chưa xem").

## 14. Trang nội bộ của hub cũng theo khuôn app con (26/10/2026)

Anh Hùng: "chỉnh theo style tổng thể ứng dụng của mình và cho nó hoạt động như cơ chế bên mình" (về Ghi chú).

- Trang nào của hub chạy trong khung mà không đi qua `proxy.js` (như `ghi-chu.html`) thì tự gắn đủ lớp chung y như proxy gắn cho app con: `data-app`, `data-skin`, `trong-hub`, `window.__HUB__.che`, sáng/tối theo hub, `i18n.js`, `dienthoai.css`, `ios.css`, `ios-app.js`.
- Thông báo đi qua viên Dynamic Island của hub (`parent.__iosDao`), không dùng ô riêng.
- Tạo việc từ bất kỳ đâu (Tin của phòng, Ghi chú…) đều mở **form thật của Bảng công việc**, điền sẵn, ô Link giữ đường về nguồn; Bảng công việc vẽ thành thẻ nguồn ("Tin gốc", "Ghi chú gốc"). Không dựng form tạo việc thứ hai.
- `<option>` phải có `value` gốc: i18n dịch chữ hiển thị, không được làm đổi giá trị gửi lên Base.
- Dữ liệu người dùng (nội dung ghi chú, tên thư mục tự đặt, tiêu đề) khai vào danh sách bỏ qua của i18n.
- Trang có thanh dưới cố định riêng thì trong hub trên điện thoại phải dừng phía trên thanh tab kính; trang có thanh điều hướng riêng thì ẩn thanh tiêu đề điện thoại của hub (`body.xem-ghi-chu .mob-bar`), không để hai tiêu đề lớn chồng nhau.
- Màu nhấn là màu của hub; không dùng màu riêng kiểu app khác (đã bỏ màu vàng Apple Notes).

## 15. Tab mở đầu của Bảng công việc (27/10/2026)

- Ai mở Bảng công việc cũng vào **"Việc của tôi"** trước, kể cả quản lý. Tổng quan vẫn còn, bấm vào tab là tới. Link có `?tab=` hoặc lệnh `?mo=` thì vẫn đi thẳng tới màn được chỉ.

## 16. Gom việc con bằng cách kéo thả, sâu tối đa 3 cấp (27/10/2026)

Anh Hùng: "anh muốn lôi các công việc con đó vào một công việc lớn khác, kiểu di chuyển linh hoạt thứ tự nó đi với nhau", rồi "Em giúp anh cho tối đa là 3 cấp độ" và "khi mà kéo việc không có việc con vào việc đồng cấp thì việc bị kéo vào thì sẽ thành việc con".

- **Trần là 3 cấp.** Con số nằm ở `CAP_TOI_DA` trong `lark-task-manager/server.js` và lặp lại trong `public/app.js`; bài `test/keo-gom.test.js` cột hai bên lại, lệch là đỏ. Việc ở cấp 3 không chia tiếp được, kể cả bằng ô "Thêm việc con".
- **Kéo bằng tay nắm, không kéo cả dòng.** Cả thẻ việc và cả dòng việc con đều là nút mở việc; thứ vừa bấm-để-mở vừa kéo-để-xếp thì trên điện thoại chạm nào cũng thành kéo. Tay nắm sáu chấm chỉ hiện khi rê chuột vào hoặc khi bàn phím chạm tới.
- **Hai cử chỉ khác nhau.** Trong khối "Việc con" của một việc lớn: kéo để **đổi thứ tự**. Ngoài danh sách chính: kéo một thẻ thả vào thẻ khác để **gom** nó thành việc con của thẻ đó — thả vào việc đồng cấp thì chính việc được thả vào trở thành việc lớn.
- **Lúc kéo, mỗi thẻ tự nói nó có nhận hay không**: viền xanh kèm "Thả vào đây", hoặc viền đỏ kèm lý do ("Sẽ thành cấp 4, quá 3", "Đây là việc con của nó", "Việc liên phòng", "Đã nằm trong việc này"). Viền trong (`inset box-shadow`) chứ không `border`, nếu không cả làn nhích lên nhích xuống theo con trỏ. Trong lúc kéo thì tắt nút trên thẻ: thả trượt tay trúng "Đã gửi sản phẩm" là một tai nạn.
- **Nút "Chuyển" trong ô chi tiết vẫn giữ.** **Tách** một việc ra khỏi việc lớn thì không có thẻ nào để thả vào. (Lý do cũ — điện thoại không kéo được — đã hết hiệu lực từ 27/10/2026, xem mục 18.) Danh sách trong nút đó dùng đúng bộ luật của viền xanh, không mời chọn chỗ mà kéo tay vào sẽ bị chặn.
- **Máy chủ là nơi chặn thật.** Base không canh gì cả — ô `Parent items` ghi gì vào cũng được, kể cả vòng tròn A→B→A. `canhDoiCha()` canh: tự làm cha của mình, vòng tròn, quá 3 cấp (tính cả độ dày của nhánh đang bị nhấc đi), việc liên phòng, và quyền xem việc lớn đích. Giao diện chỉ *chiếu* bộ luật đó để viền không mọc sai chỗ.
- **Mũi tên đầu tên việc con vẽ theo cấp**: một mũi tên ↳ cho cấp 2, hai mũi tên ↳↳ cho cấp 3. Nhìn đầu dòng là biết đang ở sâu bao nhiêu.
- **Thứ tự người kéo tay cất ở `lark-task-manager/thu-tu-con.json`** trên máy chủ (đã gitignore vì là dữ liệu chạy). Bảng Công việc còn đúng 24 cột, không có cột số nào rảnh. Thứ tự chỉ sống qua deploy khi **gắn đĩa cho Render** hoặc **thêm một cột "Thứ tự" vào Base** — chưa chốt. Mọi lối vào đi qua `doc()`/`ghi()` trong `thu-tu-con.js`, đổi chỗ cất chỉ phải sửa hai hàm đó.

## 17. Cây việc trong danh sách, và cái thẻ việc (27/10/2026)

Anh Hùng: "cần chỉnh đầu tiên là cách sắp xếp, sau đó cho phép thu gọn task lớn lại dễ nhìn", rồi sáu điều chốt tiếp cho thẻ việc.

- **Việc con nằm liền dưới việc lớn, không rải theo hạn.** Danh sách chính dựng thành cây (`xepCay()` trong `public/app.js`): các việc gốc vẫn xếp theo thứ tự cũ — quá hạn trước, rồi hạn gần, rồi ưu tiên — còn con nằm ngay dưới cha theo thứ tự người kéo tay. Thẻ con thụt vào theo cấp.
- **Con ngồi theo cha kể cả khi khác cột trạng thái**, và lúc đó mang thêm một nhãn ghi làn thật của nó ("Đang tiến hành" chẳng hạn). Anh Hùng chọn cách này để nhìn được trọn cây, chấp nhận việc số trên 5 thẻ đếm đầu trang đếm theo trạng thái thật nên có thể lệch với số thẻ nhìn thấy trong một làn. Số ngay trên đầu làn vẫn đúng bằng số thẻ trong làn đó.
- **Việc lớn không hiện ra thì con tự đứng làm gốc** — cha của người khác, cha bị hủy, hay cha bị bộ lọc cắt đi. Nhờ vậy bấm một thẻ đếm để lọc thì danh sách tự trở về phẳng, không kéo theo những việc không khớp bộ lọc.
- **Vòng tròn cha–con phải vẽ ra được.** Base không canh nên A→B→A là dữ liệu ghi được thật. `theGoc()` và `xepCay()` đều có chặn vòng, và vòng vét cuối `xepCay()` bảo đảm không việc nào biến mất khỏi màn hình mà không ai biết vì sao.
- **Thu gọn nhớ theo từng việc lớn**, cất ở `localStorage` khoá `tracking.gapViec`. Gấp thì cả nhánh cụp lên rồi mới vẽ lại (`--cd-ra`, 0,22s); mở thì nhánh trượt xuống lệch nhau 40ms một thẻ (`--cd-vao`). Mũi tên **xoay** chứ không đổi ký tự — đổi ký tự thì nó nhảy. Máy xin bớt chuyển động thì làm ngay, không chờ hiệu ứng.
- **Bấm vào đâu trên thẻ cũng mở chi tiết**, không bắt nhắm đúng dòng tiêu đề. Nút, ô nhập và tay nắm kéo giữ việc của mình.
- **Việc con cũng chia nhỏ thêm được** tới trần 3 cấp. Hàng "Thuộc việc lớn" và khối "Việc con" là hai hàm riêng (`hangViecLon()` và `khoiViecCon()`); gộp làm một thì hàm thoát ngay sau hàng đầu và việc con không bao giờ có ô "Thêm việc con".
- **Kéo việc lớn thì cả nhánh đi theo, và phải nhìn thấy là nó đi theo.** Nhánh mờ đi cùng thẻ đang kéo, và thẻ ghi "kèm 3 việc con" — ảnh kéo của trình duyệt chỉ vẽ được một thẻ nên phải nói bằng chữ.
- **Vừa nhấc thẻ lên là biết thả vào đâu được.** `soiChoTha()` chấm trước mọi thẻ: chỗ nhận được sáng lên với vệt xanh bên trái, chỗ không nhận lùi lại còn 40% đậm. Nó hỏi đúng `nhanConDuoc()` mà lúc thả sẽ hỏi, không được đoán kiểu khác.
- **Ngoài danh sách, mỗi thẻ chỉ còn một nút** — việc cần làm tiếp theo. "Yêu cầu điều chỉnh" đã rời khỏi thẻ, vẫn nằm trong ô chi tiết, chỗ người ta đọc kỹ rồi mới xin đổi. Câu chỉ đường ở đầu làn phải chỉ tới chỗ nút đang đứng thật.
- **Khổ hẹp (từ 980px) thẻ xếp dọc**, nên nút thu gọn và tay nắm kéo neo tuyệt đối vào góc trái; để mặc thì mỗi cái chiếm trọn một dòng phía trên tên việc. Trên điện thoại nút thu gọn nới vùng bấm lên 40px bằng một ô vô hình, không nới chỗ nó chiếm.

## 18. Cầm cả xấp việc mà kéo (27/10/2026)

Anh Hùng, sau khi dùng thử bản kéo đầu tiên: "ấn kéo hiệu ứng nó không thật sự cho anh cảm nhận được anh cầm cả khối việc đó kéo đi", rồi "các việc nhỏ không trôi theo, hiệu ứng cũng vừa phải đừng rung quá".

- **Không dùng cơ chế kéo của trình duyệt nữa.** `draggable` + `dragstart` chỉ cho MỘT ảnh tĩnh của MỘT thẻ bay theo con trỏ, nên kéo việc lớn thì mấy việc con chỉ mờ đi tại chỗ. Nay tự làm bằng pointer events trong `ganKeoThe()`/`batDauKeo()`/`veBongKeo()`.
- **Đổi lại được hai thứ cơ chế cũ không có:** kéo được **trên điện thoại** (tay nắm đặt `touch-action: none` để ngón tay không cuộn trang), và **trang tự cuộn** khi rê tới sát mép.
- **Tờ đang cầm BÁM DÍNH ngón tay**, đặt thẳng vào toạ độ con trỏ chứ không đuổi theo. Cho nó trễ một nhịp thì mất cảm giác cầm được thứ mình đang cầm — anh Hùng: "chỉ theo thao tác của chuột hoặc cảm ứng, tạo cảm giác người dùng kiểm soát được nó". Độ trễ chỉ dành cho mấy tờ phía sau: mỗi tờ đuổi theo tờ đứng trước nó, nên cả xấp kéo thành một cái đuôi rồi khép lại thành chồng lệch 7/9px khi dừng tay.
- **Bản sao thẻ trong xấp phải `transition: none`.** `.wcard` có hiệu ứng trượt 0,22s cho cái khe; bản sao thừa hưởng nó thì mỗi khung hình trình duyệt lại nội suy chồng lên chỗ vừa đặt — cái xấp trôi lờ đờ sau con trỏ, và lần đầu nó trượt từ góc trên màn hình xuống ("hiện trạng đang bị bay từ trên màn hình bay xuống"). Cũng phải đặt toạ độ ngay lúc dựng xấp, không chờ khung hình đầu tiên, không thì nó nhoáng một cái ở góc trái.
- **Biên nghiêng 3 độ, đo thực tế khi kéo nhanh chỉ tới 2,2 độ.** Góc nội suy dần theo quãng vừa đi chứ không lấy thẳng bước nhảy từng khung hình: bước nhảy là số nhiễu, lấy nó làm góc thì thẻ rung lập bập.
- **Chỉ thò ra hai tờ**, còn lại ghi "+N việc nữa" — nhiều hơn thì cái xấp che mất danh sách bên dưới mà mắt cũng không đếm được.
- **Chỗ sắp nhận mở ra một khe**: thẻ ngay dưới dịch xuống 8px. Chỉ mở khi thẻ đó thật sự nhận, và **chỉ sau khi ngón tay dừng lại 160ms** — mở ngay thì lướt qua năm thẻ là năm lần cả danh sách nhấp nhô (anh Hùng: "kéo đang nhảy lung tung"). Hẹn mở khe phải huỷ được, không thì khe bật ra sau khi đã thả xong.
- **Thả hụt thì cái xấp bay về đúng chỗ cũ**, không biến mất tại chỗ: người kéo phải thấy ngay là không có gì thay đổi. **Escape** bỏ lượt kéo giữa chừng.
- **Đang kéo thì `render()` hoãn lại** và ghi nợ, thả tay xong vẽ bù. Vẽ lại giữa lúc kéo là thay sạch thẻ dưới con trỏ, lượt kéo đứt và cái xấp kẹt lại trên màn hình — lỗi này đã xảy ra thật khi làm. `donDauKeoThe()` cũng dọn mọi xấp mồ côi, trừ cái đang bay về.
- **Thẻ có tin chưa đọc sáng lên tắt xuống, chậm và nhẹ, cho tới khi đọc** (anh Hùng 28/10/2026: "nháy nhẹ, chậm, nổi bật, lúc ẩn lúc hiện"). Thay kiểu ba nhịp nhanh rồi thôi của 27/10: lướt qua là không thấy. Nhịp 3,2 giây, lặp mãi tới khi mở Trao đổi. **Không vạch xanh bên trái, không viền**: chỉ một quầng xanh loang mềm từ mép trái kiểu iOS (anh Hùng: "ánh sáng không nên quá cứng nhắc"). Lớp sáng là `::after` nằm giữa nền thẻ và chữ, chỉ đổi opacity. Nhịp neo theo đồng hồ (`--tho-tre` âm) nên danh sách vẽ lại vài chục giây một lần mà thẻ không giật. Máy xin bớt chuyển động thì đứng yên ở mức sáng vừa. Lớp iOS đè nền thẻ và ẩn `::before`, nên luật phải nêu cả `html[data-skin]`.
- **Khối "Tin nhắn chưa đọc" ở Việc của tôi nằm ngoài vùng cuộn `.lanes`**, nên tự chừa lề `var(--le)` như thanh lọc (để mặc là tràn sát mép phải) và tự cuộn khi nhiều tin, không đẩy danh sách việc xuống.
- **Khối "Việc con" trong ô chi tiết vẫn dùng cơ chế cũ** để kéo đổi thứ tự, nên chỗ đó trên điện thoại vẫn chưa kéo được. Chưa chuyển vì anh Hùng chưa yêu cầu.

## 19. Nhấc việc lên, và bỏ nghiệm thu khi tự order tự làm (27/10/2026)

- **Nhấc lên là chỗ cũ TRỐNG.** Anh Hùng: "khi anh cầm lên thì vị trí task đó phải trống". Thẻ nguồn giữ nguyên chiều cao (để danh sách không giật) nhưng ẩn hết nội dung và kẻ viền đứt — một ô trống đánh dấu chỗ nó vừa rời. Chừa tay nắm ra: `visibility: hidden` làm phần tử thôi nhận sự kiện, ẩn nó là có nguy cơ rụng luôn lượt kéo.
- **Nhánh con cụp lại, không nằm cứng tại chỗ** — nó đang ở trên tay chứ không còn trong danh sách. Thả hụt thì nhánh trượt ra lại chứ không bật về đột ngột.
- **Hai mức gợi ý chỗ thả.** Viền **đứt** quanh thẻ = "thả vào đây được"; viền **đặc** = "sẽ thả vào đây" (chỗ đang nhắm). Dùng `outline` chứ không `border`: outline không chiếm chỗ nên danh sách không xê dịch. Chỗ không nhận lùi xuống 32% đậm.
- **Người order chính là người làm thì bỏ bước nghiệm thu**, hoàn thành luôn. Anh Hùng: "nếu việc người order giống với người phụ trách thì không cần bước nghiệm thu mà hoàn thành luôn". Bắt nộp rồi chờ là bắt người ta tự duyệt việc của chính mình. Luật ở `tuGiaoTuLam()`, có bản giống hệt ở hai bên và bài `test/tu-giao-tu-lam.test.js` chạy cả hai trên cùng bộ việc.
  - Đúng khi **mọi** người order đều có tên trong danh sách người làm. Order một người mà hai người làm thì vẫn tính; order hai người mà chỉ một người trong đó làm thì không, vì người kia còn phải duyệt.
  - **Không** áp dụng cho việc liên phòng (người giao ở bên công ty) và việc đã **trễ** — "trễ thì nhân sự không tự đóng" là chuyện thời hạn, không phải chuyện nghiệm thu.
  - Nút gọi đúng tên việc sắp xảy ra: "✓ Hoàn thành" thay vì "✓ Đã gửi sản phẩm", và không nhắn cho chính mình rằng việc mình vừa đóng đã xong.
- **Nút nộp việc liên phòng mang màu riêng** (`--purple`): bấm nó là ghi sang Base của công ty, không phải nộp trong phòng. Hai việc khác nhau thì nút đừng giống nhau. Nút trong cửa sổ nộp cùng màu — cùng một hành động thì cùng một màu, dù bấm ở đâu.

### Soát đồng bộ hai Base (27/10/2026, chỉ đọc)

Đọc 97 việc-người từ 60 bản ghi gốc của Base "Giao việc công ty"; trạng thái tổng bên đó **khớp hết** với bảng "Liên phòng · tiến độ" của phòng, đọc hai lần ra cùng số. Cột cũng còn nguyên: Base công ty đủ 9/9, bảng tiến độ đủ 7/7 cột mà đường ghi gọi tới — đây là chỗ hay hỏng âm thầm, vì Base nhận lệnh ghi rồi lặng lẽ bỏ qua trường lạ.

Nhưng **mới 1/97 việc-người có dòng tiến độ riêng**, nên luật tổng hợp gần như chưa chạy thật: "khớp hết" ở đây mới chứng minh đường ĐỌC đúng, chưa chứng minh đường GHI. Đường ghi chỉ kiểm được bằng một lượt ghi thật, mà dữ liệu này là của công ty nên phải do anh Hùng bấm.

## 20. Ô soạn chữ dài: định dạng không cần thanh công cụ (28/10/2026)

Anh Hùng: "không cần hiện các thanh công cụ định dạng, nhưng kiểu sẽ thông minh và hiện đại tối giản".

- Ô soạn chữ dài (như "Chi tiết yêu cầu" của Bảng công việc) nhận Ctrl+B in đậm, Ctrl+I in nghiêng, Ctrl+U gạch chân, và dán được bảng từ Excel, Google Sheets thành bảng thật. Không bày thanh nút định dạng.
- Không đặt chữ mờ gợi ý hay dòng chú thích hướng dẫn phím tắt trong ô ("không cần note luôn cho hiện đại").
- Base chỉ có chữ thuần nên định dạng lưu bằng dấu kiểu Markdown (`**đậm**`, `*nghiêng*`, `<u>gạch chân</u>`, bảng `| a | b |`), mở trên Base vẫn đọc được. Thẻ việc ngoài danh sách thì hiện chữ trơn, bỏ dấu.
- Bảng trong ô vừa bề ngang, chữ tự xuống dòng, không kéo ngang. Tab chuyển sang ô kế, Tab ở ô cuối thêm một hàng.

## 21. Dấu phiên bản tệp tĩnh, và phân cấp kiểu bảng lớp (28/10/2026)

### Dấu `?v=` phải tính lại, không tính một lần lúc khởi động

Anh Hùng: "bản local em làm đúng ý anh, còn trên đây anh thấy chưa làm được việc đó" — trên hub vẫn là bản cũ dù máy chủ đã phục vụ tệp mới.

Nguyên nhân: `VAN_TAY` trong `lark-task-manager/server.js` tính **một lần lúc khởi động**. `index.html` không được cache nên luôn mới, nhưng nó mang dấu cũ, trình duyệt xin đúng địa chỉ cũ, mà địa chỉ đó đã được đánh dấu `immutable, max-age` một năm từ lần trước — **người dùng kẹt ở bản cũ vĩnh viễn** cho tới khi khởi động lại máy chủ. Trên Render mỗi lần deploy là một lần khởi động nên không lộ; chạy trên máy thì lộ ngay.

Nay `vanTay()` đọc mtime + kích thước thư mục `public` mỗi lần phục vụ `index.html` (nhớ lại 2 giây). Sửa tệp là dấu đổi, không phải khởi động lại. Rẻ hơn đọc hết nội dung, mà sửa tệp thì cả hai đều đổi.

**Các app con khác vẫn tính một lần lúc khởi động** — ai sửa app nào thì mang cách này sang app đó.

### Tab Order & nghiệm thu: hai kiểu xem (28/10/2026)

Anh Hùng: "mặc định thì là giao diện hiện tại, nhưng cho chuyển sang giao diện như Việc của tôi".

- Nút **Lưới / Danh sách** cuối thanh lọc. **Mặc định Lưới** (thẻ ô như cũ). Mỗi người nhớ lựa chọn của mình trên máy mình (`localStorage` khoá `tracking.ordKieu`), không ghi gì lên Base.
- Kiểu Danh sách dùng đúng khuôn của Việc của tôi: làn có đầu bấm thu gọn, dòng `.wcard`. Dòng **không có nút làm việc** vì người xem là người order; bấm là mở chi tiết. Cột phải ghi sản phẩm, sao chấm, hạn chỉnh sửa. Có tin chưa đọc thì dòng cũng sáng lên mờ đi như thẻ ở Việc của tôi.
- Trên điện thoại hub giấu thanh lọc nên không có nút chuyển; kiểu đã chọn trên máy đó vẫn giữ.
- Chữ mới phải có khoá trong `lark-mkt-hub/public/i18n.js` ("Lưới", câu gợi ý của làn Chờ nghiệm thu).

### Phân cấp nhìn như bảng lớp của Photoshop/Figma

Anh Hùng: "em tham khảo kiểu layer của các ứng dụng AI, PS để hiểu phân cấp anh muốn sắp xếp".

- **Một vạch dọc cho mỗi tầng phía trên**, vạch trong cùng có **móc ngang** chỉ vào tên việc. Nhìn vạch là đọc được ngay việc này nằm trong cái gì, không phải đếm độ thụt bằng mắt.
- **Việc con cuối nhánh thì vạch dừng ở chỗ móc**, không thòng xuống — thòng xuống là trông như còn việc nữa ở dưới mà thật ra hết rồi.
- **Nét kiểu cây thư mục, anh Hùng vẽ lại 28/10/2026:** nét LIỀN, đậm vừa (chữ 30%, dày 1,5px), **mọc ra ngay dưới nút gấp của việc lớn đang mở** (`.wc-noi-cha`) rồi chạy xuống. Mỗi việc con một nhánh ngang ngay **hàng tên việc** (`--moc-y`), không phải giữa thẻ. Con cuối bo góc sang tên rồi dừng. Kiểu cũ là vạch mảnh màu viền, móc ở giữa thẻ, mọc lơ lửng từ mép thẻ con, nhìn như nét đứt không biết dẫn từ đâu.
- Chỗ đặt vạch tính từ biến `--noi-goc` / `--noi-buoc` trên `.lane-items`, khai riêng cho máy tính, khổ hẹp và điện thoại. Ba khổ có ba mức thụt khác nhau; quên một khổ là vạch rơi vào giữa chữ.

## 20. Tệp in gửi ra ngoài (28/10/2026)

Anh Hùng: "cho anh chỉnh trên file PDF này hết các vị trí đi, nhiều cái ko đúng ý anh".

- **Trang in sửa được ở mọi chỗ trước khi lưu PDF.** Cả tờ là một vùng sửa chữ; rê chuột (hoặc chạm) vào dòng bảng, ô thông tin, câu lưu ý hay tên mục thì hiện nút đưa lên, đưa xuống, thêm dòng, xoá. Có Hoàn tác và Bản gốc. Bản đã sửa cất trên máy theo hợp tác + lựa chọn trên thanh công cụ, mở lại vẫn còn (30 ngày). Mẫu: `lark-kol/public/in-doan.*`.
- **Trang in không nhận lớp giao diện chung của hub.** Tệp gửi khách sạn, đối tác luôn nền sáng, bảng giữ là bảng. Trang tự khai `<meta name="hub-trang-in">`, `proxy.js` khi đó chỉ chèn phần sửa đường dẫn, bỏ `dienthoai.css`, `ios.css`, `ios-app.js` (đã có lần tờ thông tin đoàn hiện nền đen, đầu bảng đen).

## 22. Mở app ra là biết phải làm gì (28/10/2026)

Anh Hùng (về Hộp thư): "cái giao diện này anh không biết phải làm gì luôn ấy em".

- **Ngăn, tab, bộ lọc đặt tên theo việc người dùng phải làm**, không theo cách app phân loại. "Cần trả lời", "Chỉ để đọc" chứ không "Tự động", "Để biết".
- **Không quá 3–4 ngăn.** Ngăn trống thì ẩn (như "Hẹn lại" chỉ hiện khi có thư đang hẹn).
- **Số trên ngăn là số việc còn phải làm** (thư chưa đọc), không phải tổng cả cũ lẫn mới. "117" làm người ta nản và không biết hôm nay còn bao nhiêu.
- **Hàng chục bản ghi giống hệt nhau (form tự động, đơn đặt) gom thành một dòng** dẫn sang ngăn riêng, không để chôn mất thứ người thật viết.
- **Không bày chữ kỹ thuật ra giao diện**: lý do xếp, tên luật, "Chưa luật nào nhận". Chỉ bày thứ người đọc dùng được.
- **Việc chính có nút có chữ (tối đa 3), việc phụ cất vào nút ⋯ Thêm.** Một dãy nút chỉ có hình là người dùng phải đoán từng cái.
- **Danh sách dài (hộp thư, kênh, người) chọn bằng một nút mở menu**, không bày thành dải chip tràn khỏi màn.

## 23. Dữ liệu chung, khuôn hai phần, việc chờ lâu (28/10/2026, Hộp thư)

- **Phân loại, đánh dấu trong app không được đổi dữ liệu gốc dùng chung** (anh Hùng: "việc phân loại của anh trên ứng dụng thì không nên tác động đến email thật vì cũng có người khác sử dụng"). Xong, đã đọc, sao, chuyển ngăn, nhóm theo dõi là sổ riêng từng người, cất trên Base của Hub, không cất trên ổ Render.
- **Việc của người khác trong dữ liệu chung thì "Bỏ qua", không "Xong"** (29/10/2026, anh Hùng: "email có vai trò của bạn khác, nếu anh ấn xong thì có thể ảnh hưởng đến công việc của bạn khác"). Bỏ qua chỉ rút việc khỏi danh sách của riêng mình, có Hoàn tác, xem lại được ở cuối ngăn và có nút Đưa về. Bản gốc người khác vẫn thấy y nguyên.
- **Màn danh sách + chi tiết là khuôn hai phần cố định** ("giao diện nhảy tùm lum"): cột trái rộng cố định, cột phải luôn có mặt (chưa chọn thì hiện lời mời). Mở, đóng một bản ghi không làm cột nào co giãn. Vách giữa **kéo được** để đổi tỷ lệ, mỗi phần **đóng được**; nút điều khiển rõ ràng nằm trên đầu khung chi tiết.
- **Việc chờ lâu phải tự nổi lên**: vàng khi chờ 1 ngày, đỏ và nhịp sáng khi từ 3 ngày. Chỉ những việc gần đây mới nhấp nháy; việc đã quá lâu gom một dòng, bấm mới mở. Cái gì cũng nháy thì không còn gì nổi bật.
- **Gửi ra ngoài (thư, tin) luôn qua bản xem trước**: đúng bản bên nhận thấy, có soát chính tả, sửa từng chỗ hoặc sửa hết, rồi mới gửi.
- **Gói một bản ghi sang app khác (giao việc từ thư) phải đọc hiểu được mà không cần mở nguồn**: tên sạch, ai gửi, nội dung chính (cả phần chuyển tiếp), bỏ chữ ký, ký tự rác, link dài, kèm thẻ dẫn về nguồn.

## 24. Thuận tay phải, và chừa đáy cho thanh tab (29/10/2026)

Anh Hùng: "giao diện cho người thuận tay phải, dời các nút về phải", và "mình có cái thanh tab menu bên dưới, nên các app em làm cần có nguyên tắc cho nó để hiển thị hết nội dung".

- **Nút thao tác nằm mép phải.** Nút trên thẻ, dòng (Đã gửi sản phẩm, Bắt đầu làm…) canh phải ở mọi khổ; tay nắm kéo của thẻ việc cũng ở mép phải. Riêng nút gấp việc lớn vẫn ở trái vì nó là gốc của nét cây (mục 17).
- **Chừa đáy cho lớp nổi của hub trên điện thoại.** Thanh tab kính cao 58px, đáy cách màn 10px; viên linh vật lời nhắc 44px, đáy ở 78px, nằm mép phải. Vùng cuộn chạm đáy màn phải có đệm cuối **132px + vùng thanh Home** (`.ios-cuon-day` trong `ios.css`, `ios-app.js` tự gắn) để mục cuối, kể cả nút ở mép phải, cuộn lên được phía trên cả hai. App có thanh hay nút cố định riêng ở đáy thì đặt nó phía trên mốc đó, không để chồng lên thanh tab hay viên linh vật.
- **Bảng nhiều cột chỉ đọc mà mỗi dòng là một người hay một đối tượng thì dựng thẻ riêng cho điện thoại**, không để lớp chung tự bẻ bảng (`.ios-the-bang`) khi cột đầu là tên và các cột sau là số: tên và con số chính lên đầu, số phụ xếp lưới 3 cột, số 0 nhạt đi (mẫu: Tải việc theo nhân sự, `theTaiViec()`).
- **Thẻ việc trên điện thoại chỉ giữ thứ cần để làm tiếp** (anh Hùng: "bỏ phần kết quả; bỏ quá hạn, bỏ chiến dịch; bỏ loại công việc, cái ô gọn lại"): tên, một dòng mô tả, ưu tiên, hạn gần (hôm nay / còn N ngày), người order, một nút. Ẩn nhãn loại việc, chiến dịch, "Quá hạn N ngày" (chấm đỏ trước tên đã báo trễ) và "Chưa nộp / Đã có kết quả". Mọi thứ đó vẫn ở ô chi tiết.
- **Nút nộp việc gọi bằng việc sắp làm, không bằng việc đã xong**: việc mình tự order là "Hoàn thành", việc được giao là "Gửi sản phẩm" (không phải "Đã gửi sản phẩm"). Tự order mà đã trễ thì vẫn qua nghiệm thu nên vẫn là "Gửi sản phẩm".
- **Nút CTA một cỡ**: nút việc tiếp theo trên thẻ và nút chính ở chân ô chi tiết cao 34px, rộng tối thiểu 152px, chữ canh giữa, ký hiệu + động từ. Chữ dài hơn thì nút giãn, không cắt chữ.
- **Tiêu đề làn không dính đầu khi cuộn trên điện thoại.** Không bày dòng hướng dẫn kéo tay nắm: sáu chấm tự nói là kéo được.
- **Đầu cửa sổ chi tiết: tiêu đề và nút cùng một hàng.** Nút phụ chỉ còn hình (✎ sửa đầy đủ, ✕ đóng), tên nằm ở `title`/`aria-label`. Không đặt nút "Đóng" ở chân khi đầu đã có ✕.
- **Ô gõ nhanh việc con ghi "Sub-task & ấn Enter".**
- **Trao đổi**: chưa có tin thì hiện biểu tượng trò chuyện và "Trao đổi ngay", không câu giải thích. Dưới ô gõ ghi ai sẽ nhận báo Lark. Gõ `@` để gắn người trong danh bạ app; người được gắn cũng nhận báo Lark (máy chủ chỉ nhận id có trong danh bạ).
- **Làn trống ẩn hẳn trên điện thoại** ("Công việc mới 0"). Chỉ khi mọi làn đều trống mới giữ một câu "đang trống".
- **Nhóm "(chưa điền)" của biểu đồ phân bổ ẩn trên điện thoại.** Máy tính vẫn hiện để quản lý biết mà đi điền.
- **Thẻ có lớp chung ép lề (`!important`) thì cây việc phải tính toạ độ từ một chỗ**: tâm nút gấp, vạch dọc và lề chữ cùng đi theo `--noi-goc` / `--noi-buoc`, không đặt ba số rời.
