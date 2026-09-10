# Báo cáo & KPI (`lark-kpi`)

App con của MKT Hub. **Hai nửa, hai mục đích:**

1. **BÁO CÁO** — gom số liệu của *mọi* base (Social · Quảng cáo · OTA · Công việc
   · Lịch tác nghiệp) theo một khoảng thời gian bất kỳ, rồi **xuất một tệp báo
   cáo hoàn chỉnh để gửi Sếp**.
2. **KPI** — lấy chính số liệu đó chấm điểm nhân sự theo tháng: đặt mục tiêu,
   theo dõi tiến độ thời gian thực, xuất kết quả KPI từng người. Thay file Excel
   `KPI MKT`.

Trạng thái: **chạy thử được, đã nối số thật**. Server + giao diện + lớp thu số
liệu từ các app con. Dữ liệu nền là 8 tháng nhập từ Excel; số mới đổ về từ app
Social. Chưa nối Lark Base.

```
node server.js      →  http://localhost:5179
```
Hoặc mở qua MKT Hub (đã khai trong `modules.json`, cổng 5179).

---

## Vì sao làm app thay vì sửa tiếp Excel

File Excel không hỏng vì ai đó bất cẩn. Nó hỏng vì **công thức và dữ liệu nằm
chung một ô**: mỗi tháng phải copy một khối 68 dòng, và mỗi lần copy là một lần
link rụng. Bản soát tháng 9/2026 tìm được, trong 7 tháng:

- 131 ô kết quả trỏ lạc sang tháng khác hoặc kênh khác
- 105 ô bị dán **chữ** `#DIV/0!` đè lên công thức
- 40 ô "Số lead" gõ số cứng, 7 ô bằng đúng mục tiêu nên luôn đạt 100%
- mọi SUMIFS chỉ quét đến dòng 969 trong khi dữ liệu đã tới dòng 1.481

Nguyên tắc thiết kế số một ở đây: **bộ luật tách khỏi số liệu**. Thêm một tháng
chỉ là thêm dòng số liệu; bộ luật đứng yên, có phiên bản, và tháng đã chốt không
bị bộ luật mới chạm vào.

## Ba tệp lõi

| Tệp | Việc |
|---|---|
| `luat.js` | Hình dạng bộ luật + phép soát. Mỗi phép soát vá đúng một lỗi có thật của Excel. |
| `tinh.js` | Bộ máy chấm điểm. Hàm thuần, không I/O — cùng số liệu vào luôn ra cùng điểm. |
| `bu-view.js` | Luật thưởng/phạt độ đều tay, gom từ 7 cột rải rác của Excel về một hàm. |
| `store.js` | Kho dữ liệu — hiện là tệp JSON, đổi sang Base sau chỉ phải thay tệp này. |
| `server.js` | HTTP thuần Node + phân quyền xem. |
| `bao-cao.js` | Gom mọi base cho một khoảng thời gian + so sánh kỳ trước. |
| `nguon.js` | Đổ số từ app con về đúng mã nguồn của bộ luật; đọc file tải lên. |

Tất cả đều là hàm thuần nên chạy lại được 8 tháng cũ để đối chiếu — xem
`doi-chieu.js`.

## Bộ luật

Mọi người dùng **chung một hình dạng**. Trong Excel có hai kiểu bảng chắp vào
nhau (người ăn theo kênh vs người ăn theo SEO/Ads/KOL) nên mỗi lần sửa phải nhớ
sửa hai chỗ. Ở đây chỉ có một: `nguoi.tieuChi[].nguon.kieu` quyết định điểm lấy
từ đâu — `kenh`, `chiSo`, hay `tay`.

```
nhom[]   kênh × loại nội dung → tiêu chí { mục tiêu, tỷ trọng, mã nguồn số liệu }
nguoi[]  tiêu chí tính lương { trọng số, nguồn } + bảng phân bổ tỷ trọng kênh
heSo     hệ số quy đổi theo mục đích nội dung (Bán hàng 1,0 · Tương tác 0,2)
buView   { bật, chiaNguong, tyLeChoPhep }
```

## Bốn chốt chặn

1. **Tỷ trọng phải cộng đủ** — mỗi nhóm 100%, mỗi người bằng nhau. Excel có nhóm
   cộng ra 20% và một người cộng ra 1,3 thay vì 1,2.
2. **Mục tiêu phải là số > 0** — không cho khai mục tiêu trống hay trỏ vào chính
   ô kết quả (Excel `H44 = 'Lượt view'!X30` nên kênh đó luôn đạt đúng 100%).
3. **Không đo được ≠ đạt 0** — tiêu chí thiếu nguồn bị loại và tỷ trọng chia lại
   cho phần còn đo được, có ghi rõ trên phiếu. Excel gõ chữ "x" rồi chữa cháy
   bằng cách gõ điểm 0, làm cả nhóm mất điểm oan.
4. **Mục tiêu phi lý bị gắn cờ** — đạt trên 300% hoặc dưới 20% phải nhìn thấy
   trước khi chốt. Tháng 7 có kênh đặt mục tiêu 30.000 view trong khi đạt
   353.035, một mình nó kéo điểm hai người vọt lên.

Thiếu điểm chấm tay cũng là mục **chặn**: tháng chưa chốt được khi HCNS hoặc
trưởng phòng chưa chấm.

## Nhập lịch sử 8 tháng

`du-lieu/lich-su-2026.json` — bộ luật, số liệu, điểm chấm tay và **điểm đã trả
lương** của tháng 1–8/2026, rút từ `KPI MKT - da sua + T8.xlsx`.

```
node doi-chieu.js
```

In bảng hai cột *đã trả* → *app tính lại*. Hiện tại **50/56 ô khớp tuyệt đối**.
Sáu ô lệch đều thuộc một nguyên nhân duy nhất và được chỉ đích danh trong bảng:
Excel bỏ trống ô mục tiêu ở các nhóm LIVE, cho 0 điểm nhưng vẫn ăn tỷ trọng;
app loại tiêu chí đó rồi chia lại nên điểm cao hơn. Chốt chặn số 2 khiến chuyện
này không tái diễn.

Điểm lịch sử **chỉ để tham chiếu và vẽ xu hướng** — không dùng để tính lại lương
đã trả.

## Chạy test

```
npm test
```

38 phép thử. Phần lớn canh đúng một lỗi có thật của Excel: nếu một ngày nào đó
app lại cho phép chuyện đó, test phải đỏ.

## Đọc số thế nào

Con số chính của cả app là **phần trăm**, không phải điểm. Điểm KPI dạng `1,169`
là chỉ số có trọng số — nhìn vào không biết tốt hay xấu. `97%` thì biết ngay.

```
% hoàn thành  =  điểm tính lương / tổng trọng số
% đạt của kênh =  chính là điểm nhóm (vốn đã là tỷ lệ so mục tiêu)
```

Thang màu dùng chung mọi nơi (`mucPt` trong app.js): ≥100% xanh · 80–100% vàng ·
<80% đỏ. Điểm thô vẫn hiện, nhưng ở hàng phụ.

Giao diện lấy nguyên token và cấu trúc thẻ của `lark-mkt-hub` (khối là thẻ trắng
bo 12px, ô bên trong là ô bảng) để hai lớp không lệch nhau.

## Tám màn hình

**Báo cáo** *(nửa 1)* — thanh lọc khoảng thời gian giống hệt app Social (Tháng
này · Tháng trước · Tuần này · Tuần trước · Quý này · Năm nay, hoặc chọn ngày
tay).

Mỗi base một khối, lấy **hết** những gì app đó cấp — hiện là **66 chỉ số** trên
5 base (Social 22 · Quảng cáo 12 · OTA 12 · Công việc 10 · Lịch 10) — kèm:

- ô số với **▲▼ so kỳ trước** (kỳ trước cùng độ dài, nằm liền ngay trước). Chỉ
  số "thấp là tốt" (CPA, CPC, huỷ, quá hạn) có cờ `dao` nên mũi tên đảo màu.
- dòng **nền tảng nào góp vào con số này**, ngay dưới mỗi ô: `FB 532k · TikTok
  176k · IG 21k`, và `IG 15k — FB · TikTok chưa có`. Không có dòng đó thì "Lượt
  tiếp cận 15k" đọc lên như số toàn phòng, sự thật chỉ Instagram trả về — Meta
  đã gỡ mọi chỉ số đếm người duy nhất nên Facebook không có. Ô nào không nền
  tảng nào gửi số thì ghi thẳng "chưa nền tảng nào gửi số này".
- **giới hạn số liệu do chính app nguồn khai** (`luuY`) in ở đầu mỗi khối. Chép
  nguyên chứ không tự diễn giải: app sở hữu chỉ số biết rõ nhất vì sao nó trống.
- **biểu đồ đường** theo ngày + **vành khuyên** cơ cấu, vẽ bằng `charts.js` lấy
  nguyên từ app Social nên trông giống hệt
- các bảng chi tiết: theo nền tảng, theo kênh, theo chiến dịch, theo sàn, theo
  tour, theo người, cảnh báo…

Base nào không đọc được thì nói rõ, **không hiện số 0** — 0 và "không đọc được"
là hai chuyện khác nhau.

Nút **Xuất báo cáo** mở một tệp HTML **tự chứa**: logo Rooty Trip nhúng base64,
mọi biểu đồ vẽ sẵn thành SVG ở server (tệp tĩnh không chạy JS của app). Cạnh nó
là nút **CSV** (lối tắt cho ai chỉ cần số) và nút **biểu tượng làm mới** — cùng
lối với các app khác trong Hub, chứ không phải một nút chữ trông ngang hàng với
việc chính.



**Tiến độ** — màn mặc định, trả lời "hôm nay đang đạt bao nhiêu %, có kịp không".
Đọc số THẲNG từ các app con (không phải số đã chốt), luỹ kế từ đầu tháng, và luôn
đặt cạnh **nhịp chuẩn**: đi hết 71% số ngày thì đáng lẽ phải đạt 71% mục tiêu.
Sáu bảng: theo người hôm nay · **mốc tuần theo người** · **mốc tuần theo kênh**
(hết ngày 7, 14, 21, 28, hôm nay) · theo kênh hôm nay, bấm một kênh là bung ra
từng chỉ số của nó · và một **bảng phẳng mọi chỉ số của mọi kênh**, lọc được
theo Đang hụt nhịp / Đạt nhịp / Chưa đo được, có cột **Còn thiếu** nói thẳng
phải đẩy thêm bao nhiêu nữa mới chạm mục tiêu.

Cột "Xu hướng" so mốc cuối với mốc trước nó, tính theo khoảng cách tới nhịp
chuẩn: **bứt lên** hay **chậm lại**. Chữ phải trung tính với cả người đang dẫn
lẫn người đang hụt — bản đầu ghi "giãn ra / khép lại" nên người đang ở 309% mà
tuần cuối chững lại thì đọc y như đang tụt hậu.

Cột "Đo được" nói rõ bao nhiêu phần trăm trọng số thực sự lấy được số — nên
"chưa đo được" không bao giờ bị hiển thị nhầm thành "đạt 0%".



**Tổng quan** — trả lời "phòng đang khoẻ hay yếu", không phải "tháng này ai bao
nhiêu điểm". Bốn khối: sức khoẻ phòng theo tháng · **mạnh yếu hệ thống** (gộp mọi
kênh mọi tháng, chỉ ra loại tiêu chí nào cả phòng liên tục hụt — đừng quy cho một
cá nhân) · theo nhân sự (điểm 7 tháng, xu hướng, kênh kéo lên / kênh dìm xuống) ·
tăng trưởng theo kênh (đang lên / đi ngang / đang xuống / ngừng có số liệu).


**Nguồn số liệu** — chia theo **việc phải làm**, không dồn tất cả thành một chữ
"thiếu". Mỗi chỉ số chưa lấy được rơi vào đúng một khối, vì bốn cách này khác
hẳn nhau về người làm và nơi làm:

| Khối | Nghĩa |
|---|---|
| Máy tự lấy được | không cần ai làm gì |
| Nhập tại base nguồn | số lấy tự động được, chỉ là base chưa có dòng đó |
| Tải file lên đây | nền tảng không mở API — xuất file rồi dán vào |
| Người phụ trách tự chấm | không nền tảng nào đo được |
| Chờ nối app | app nguồn đã chạy, phần KPI chưa đọc sang (việc của người dựng app) |
| Sai ở bộ luật | không phải thiếu số — bộ luật gọi tên một chỉ số/kênh không tồn tại |

*Đổ tự động* hiện bảng **đang dùng → sẽ thành** trước khi ghi, đánh dấu ô nào
đổi và ô nào sẽ bị đổ về 0. *Tải file*: dán từ Excel hoặc chọn CSV, xem thử khớp
vào đâu rồi mới nạp. Số gốc không bao giờ bị ghi đè — luôn có nút về số gốc.

**Phiếu KPI** — bảng điểm cả phòng; bấm một người ra chuỗi tính đầy đủ: tiêu chí →
trọng số → điểm, rồi bấm tiếp một nhóm kênh ra từng tiêu chí với kết quả, mục
tiêu, % đạt và tỷ trọng. Không còn ô nào phải tin suông.

Bảng **chấm tay** là dạng danh sách (một dòng = một người × một tiêu chí) kèm ô
**ghi chú "vì sao chấm mức này"**. Trước đây là lưới ngang không còn chỗ cho ghi
chú, mà chấm tay không có ghi chú là chấm không giải trình được. Ghi chú lưu
riêng khỏi điểm (`ghiChuCham` trong `sua-tay.json`) — `tinh.js` và 38 phép kiểm
vẫn đọc `chamTay[người][tiêu chí]` là một SỐ, không phải đổi lõi tính lương vì
một việc của giao diện. Ghi chú in kèm trên phiếu xuất ra.

**Xuất KPI dạng văn bản** — `/api/xuat-kpi?kieu=nguoi|phong`. Một tệp HTML tự
chứa, khổ A4, có logo, tiêu đề, số hiệu, bảng chi tiết và **khối ký ba bên**;
mở ra bấm Ctrl+P là ra PDF. CSV (`/api/xuat`) vẫn còn cho ai cần bê số sang bảng
tính khác — nút **CSV** đứng cạnh, ở bậc phụ.

Văn bản **không in tên xếp loại** kiểu "Xuất sắc / Đạt": bộ luật không định
nghĩa thang đó, bịa ra rồi đóng lên văn bản chính thức là tự đặt ra một quy
định nhân sự. Chỉ có % hoàn thành, điểm tính lương, và màu theo đúng ngưỡng
giao diện đang dùng.

**Phân công** — *ai chịu kênh nào, ở tỷ trọng bao nhiêu*. Bộ luật có hai tầng
tách rời: tầng CHUNG là mục tiêu và tỷ trọng chỉ số của mỗi kênh (ai làm cũng
như nhau, sửa ở tab Mục tiêu & thử luật), tầng RIÊNG là `nguoi[].kenh` — bảng
này. Tầng riêng mới là chỗ **áp chỉ số lên người**, và trước đây nó chỉ nằm
trong tệp JSON: không màn hình nào bày ra, không sửa được trên app, dù máy chủ
đã nhận `phanBo` từ lâu.

Lưới **kênh × nhân sự**, mỗi ô là phần trăm. Bày theo chiều kênh → người
(ngược với hình dạng trong bộ luật) vì đó là chiều nhìn ra lỗi — đứng ở phía
người mà hỏi "người này đủ 100% chưa" thì hai lỗi nặng nhất lọt hết, do tính
riêng từng người đều hợp lệ:

- **kênh không ai nhận** — số liệu chạy về hằng ngày mà không vào KPI của ai,
  nên kênh tụt cũng chẳng ai chịu trách nhiệm. Cột "đang có số / kỳ này chưa có
  số" phân biệt kênh bị bỏ rơi thật với kênh vốn đã ngừng chạy.
- **kênh nhiều người nhận** — một lượt view cho điểm hai lần, hai người.

Cả hai đều thêm vào `luat.js` (mức cảnh báo, không chặn: hai người cùng giữ một
kênh là chuyện có thật khi bàn giao hay làm chung, nhưng phải là quyết định chứ
không phải lỗi chép). Hàng lỗi được xếp lên đầu bảng và tô nền nhạt.

Hàng chân dính đáy hiện tổng mỗi người — bộ luật CHẶN nếu khác 100%, nên nút Lưu
tắt cho tới khi sửa xong. Mọi con số phái sinh tính lại ngay mỗi lần gõ, không
vẽ lại cả bảng (vẽ lại là con trỏ nhảy ra khỏi ô đang gõ).

Người không ăn theo kênh (HÂN · HÙNG chấm bằng chỉ số SEO/Ads/OTA/KOL) không có
cột, và được liệt riêng bên dưới — để không ai tưởng là quên điền.

Lưu ghi vào bộ luật của THÁNG đó; bản gốc nhập từ Excel không mất, bỏ sửa luật
là quay lại được. Tháng đã chốt thì chặn hẳn: sửa phân công lúc đó là đổi điểm
sau khi đã trả lương.

**Thử luật** — có bảng **gợi ý mục tiêu từ số liệu cũ**: lấy trung bình N tháng
gần nhất nhân hệ số tăng trưởng, xếp tiêu chí lệch nhất lên đầu, một nút điền hết
vào ô mục tiêu (điền để nhìn thấy, chưa lưu). Rồi đổi mục tiêu hoặc tỷ trọng, cột phải hiện ngay điểm cả phòng
trước → sau và mức lệch. Không ghi gì xuống cho tới khi bấm Lưu, và không lưu
được khi bộ luật còn lỗi chặn. Có nút về lại bản gốc nhập từ Excel.

Phiếu KPI và báo cáo phòng **xuất được ra CSV** (có BOM nên Excel trên Windows
đọc đúng tiếng Việt): một nút xuất cả phòng, một nút xuất riêng từng bạn.

**Soát & đối chiếu** — danh sách mục chặn và cảnh báo của tháng, nút chốt tháng
(mờ đi khi còn mục chặn), và bảng 8 tháng *đã trả lương* → *app tính lại*.

## Xuất tệp — `xuat.js`

Ba loại tệp, chung một bộ khung, tách hẳn khỏi `server.js` (server lo định tuyến
và quyền, tệp này lo trình bày):

| Hàm | Ra cái gì | Khổ in |
|---|---|---|
| `trangBaoCao()` | báo cáo tổng hợp mọi base, gửi Sếp | A4 **ngang** |
| `vanBanNguoi()` | phiếu đánh giá KPI một người | A4 **dọc** |
| `vanBanPhong()` | báo cáo KPI cả phòng | A4 **dọc** |
| `csvBaoCao()` | cùng số liệu báo cáo, dạng CSV | — |

### Thanh lưu

Mọi tệp mở ra đều có thanh nút dính đỉnh: **Lưu PDF** (`window.print()`) ·
**Tải tệp HTML** · **Tải CSV cho Excel**. Thanh này `display:none` khi in.

Trước đây tệp mở ra là xong, không nút nào để giữ lại — muốn PDF thì phải tự
nhớ Ctrl+P, muốn giữ tệp thì Ctrl+S; không ai đoán ra.

"Tải tệp HTML" lấy chính `document.documentElement.outerHTML` chứ không gọi lại
máy chủ: trang này vốn tự chứa, nên bản tải về giống hệt bản đang xem, kể cả khi
số liệu bên các base đã đổi trong lúc đọc.

### Ba lỗi in đã sửa

1. **Không khai `@page`** → trang in lấy khổ mặc định của máy, nội dung rộng
   1080px bị **cắt mất mép phải**. Giờ báo cáo khai `A4 landscape` (có bảng 8
   cột và lưới 6 ô — ép vào khổ dọc là chữ nát), văn bản KPI khai `A4 portrait`
   (văn bản chữ một cột).

2. **`.base{break-inside:avoid}`** đặt trên khối cao 1200–2900px trong khi một
   mặt A4 ngang chỉ chứa ~718px. Trình duyệt không tài nào tránh ngắt được nên
   nó đẩy nguyên khối sang trang mới rồi **vẫn cắt**, để lại nửa trang trắng.
   Giờ chỉ tránh ngắt ở đơn vị NHỎ: một ô số, một hàng bảng, một biểu đồ, khối
   ký. Thêm `thead{display:table-header-group}` để bảng 40 dòng cắt sang trang
   vẫn còn tên cột.

3. **Biểu đồ đường một trục cho hai thang khác nhau.** Mỗi đường tự chia cho max
   của chính nó nhưng chỉ in MỘT thang bên trái, lấy max của đường đầu — nên
   "Tương tác 33k" vẽ cao ngang "Lượt xem 729k" và con số trên trục **nói dối**
   về đường thứ hai. Giờ đường khai `truc: 2` đi thang bên phải, có nhãn riêng,
   và chú thích ghi rõ đường nào theo trục nào.

Một chi tiết nhỏ cùng loại: cột "Vị trí" bị **bỏ hẳn** khi bộ luật chưa khai vị
trí cho ai — in một cột toàn dấu gạch lên văn bản chính thức thì thừa.

## Logo trên tệp xuất

Logo **không nằm ở app này**. Nó ở một chỗ duy nhất cho cả hệ: Marketing Hub →
**Cài đặt → Nhận diện thương hiệu** (chỉ quản lý thấy). Tệp giữ ở
`lark-mkt-hub/du-lieu/logo.<đuôi>`, chỉ giữ MỘT bản.

Trước đây mỗi app giữ một bản riêng: đổi logo là phải nhớ đi sửa từng app, và
không cách nào biết app nào đang đóng bản nào lên tệp gửi Sếp.

Lúc xuất tệp, app này gọi `GET <HUB>/api/logo` (mặc định
`http://127.0.0.1:5180`, đổi bằng biến môi trường `KPI_URL_HUB`) rồi nhúng thẳng
base64 vào tệp — tệp phải **tự chứa** để gửi qua mail hay mở ở máy khác vẫn thấy
logo. Ảnh tải về được ghi lại ở `du-lieu/logo-hub` làm bản dự phòng, nên Hub tắt
thì vẫn còn logo. Không có cả hai thì in **bản chữ** theo màu thương hiệu — chứ
**không tự vẽ lại nhãn hiệu**: vẽ gần đúng một nhãn hiệu đã đăng ký rồi đóng lên
báo cáo gửi Sếp thì sai còn khó chịu hơn là không có.


## Còn phải làm

- Đổi `store.js` sang Lark Base để cả phòng dùng chung
- Nối nốt app Quảng cáo / OTA / Công việc vào `nguon.js` (mới có Social)
- **Số đổ về là số THÔ** — chưa qua luật bù view và hệ số Bán hàng/Tương tác, nên
  không cùng nghĩa với cột kết quả của Excel. Phải áp hai bước đó trong lớp thu
  số liệu trước khi số live thay được số cũ. Cần dữ liệu từng bài + nhãn mục đích
- Gắn nhãn **Bán hàng / Tương tác** cho từng bài: máy đoán, người duyệt ngoại lệ.
  Phải đo độ chính xác của luật đoán trên dữ liệu 8 tháng trước khi cho chấm thật
- Quyền: hiện nhận diện qua header của hub; cần khai `KPI_QUAN_LY` và
  `KPI_MA_NGUOI` (map id Lark → mã người trong bộ luật) khi chạy thật
- Danh mục chỉ số theo nền tảng: hiện bộ luật chỉ chấm 6 chỉ số (view, follow,
  lead, LIVE-view/theo dõi/bình luận) trong khi app Social đã có sẵn ~30. Cần màn
  thêm/bớt tiêu chí và chọn chỉ số từ danh mục, thay vì chỉ sửa được mục tiêu
- Trường **tác giả** cho bảng Bài đăng của app Social, để tiến tới tính điểm theo
  bài thay vì theo tỷ trọng kênh. Dữ liệu cũ không dùng được: FB chỉ 9% dòng có
  tên nhân sự, Zalo OA 0%, TikTok và Instagram không có cột
- Đưa lên Render cùng các app kia (`render.yaml`)
