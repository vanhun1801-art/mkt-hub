# Thông tin sản phẩm

App con thứ mười của [Marketing Hub](../lark-mkt-hub/README.md). Tra cứu — và với
quản lý là điều phối — sản phẩm của Rooty Trip từ Lark Base **“Sản phẩm”**.

```
node server.js          # http://localhost:5184
start.bat               # tiện hơn trên Windows
npm test                # 2 bộ, không chạm mạng
```

Trong Hub thì không cần chạy tay: panel bên trái → **Thông tin sản phẩm**, hub tự
bật tiến trình con rồi proxy vào `/m/san-pham/`.

---

## Vì sao có app này

Trước đó thông tin sản phẩm nằm rải ở ba file Google Sheet và một thư mục Drive:

| Nguồn | Có gì | Vấn đề |
|---|---|---|
| File sản phẩm MKT (06/02/2026) | USP, lịch trình, dịch vụ bao gồm | **Cột “giá bán công bố” điền nhầm giá TA inbound** — G4 ghi 700k trong khi giá công bố thật là 800k |
| File sales đổ qua | mô tả, điểm nổi bật, chính sách của tour trọn gói và combo | không ai biết giai đoạn áp dụng đã gần hết |
| File gửi đối tác | bảng giá công bố chuẩn, vé Sun/Vin, Seawalker | 48 tab, phần lớn là bản cũ |
| Thư mục Drive | ảnh lịch trình VI/EN theo mã sản phẩm | không nối được với giá và USP |

Base “Sản phẩm” gom cả bốn nguồn lại; app này là cửa vào cho phòng Marketing.

**Năm nhóm:** Tour ghép hằng ngày · **Tour riêng (VIP)** · Tour trọn gói · Combo tự
túc · Dịch vụ lẻ.

---

## Hai vai

| | Nhân sự | Quản lý |
|---|---|---|
| Bốn tab tra cứu | ✓ | ✓ |
| Tab **Quản lý** | không thấy | ✓ |
| Ô sửa trong ngăn chi tiết | không thấy | ✓ |
| Mọi đường ghi | server trả **403** | ✓ |

Giấu ô sửa chỉ là phép lịch sự với mắt người dùng. Server chốt lại hết, và
“request từ hub mà hụt danh tính” bị coi là người lạ chứ không rơi xuống nhánh
chạy-một-mình rồi tự cấp quyền quản lý — có test canh.

---

## Năm tab

| Tab | Nội dung |
|---|---|
| **Bảng đẩy** (mặc định) | toàn bộ sản phẩm chia **tầng ưu tiên**, dòng gọn, đọc lướt một màn |
| **Danh mục** | lưới thẻ, chia nhóm sản phẩm, bộ lọc + ô tìm (bỏ dấu — gõ “cap treo” ra “cáp treo”) |
| **Sắp hết hạn** | giai đoạn áp dụng **hoặc** ưu đãi sắp/đã kết thúc |
| **Cần bổ sung** | hồ sơ chưa đủ để làm truyền thông, kèm link sang đúng view trên Base |
| **Quản lý** *(chỉ quản lý)* | lịch đổi thông tin + bảng sửa tại chỗ + đặt hàng loạt |

Bộ lọc **chỉ áp cho tab Danh mục và Quản lý**. Hai tab cảnh báo là danh sách việc
phải làm — lọc chúng đi thì đúng thứ đang cần chú ý lại biến mất khỏi màn hình.

### Dải thẻ số bấm được

Mỗi thẻ dẫn thẳng tới danh sách nằm sau con số đó (bảng `DI_THE` trong `app.js`,
khai ngay cạnh con số để hai thứ không lệch nhau). Thẻ nào chưa có đường đi thì
để `disabled` — trông vẫn như thẻ nhưng không giả vờ bấm được.

### Bảng đẩy — các tầng

Mỗi sản phẩm rơi vào **đúng một** tầng, tầng đầu tiên nó khớp:

| Tầng | Mở sẵn | Nghĩa |
|---|---|---|
| 🆕 Sắp ra mắt | ✓ | chuẩn bị nội dung trước ngày mở bán |
| 🔥 Ưu tiên đẩy | ✓ | dồn ngân sách và nội dung |
| 🟢 Chạy hằng ngày | ✓ | có bài đều, giữ nhịp |
| Chưa xếp mức | ✓ | cần quản lý xếp mức |
| 🔵 Duy trì · 🌤 Theo mùa · ⏸ Tạm dừng · Mức khác | gập | chỉ để tra |

Bốn tầng trên bày dạng **thẻ**, bốn tầng dưới bày **dòng gọn**. Thẻ mang đúng
bảy thứ: mã · tên Việt + Anh · giá trước và sau ưu đãi · giá trẻ em · mức ưu tiên
· USP (cắt 3 dòng) · ngày bắt đầu – kết thúc.

Không có dòng “Hồ sơ đủ, chạy được” và không có nhãn “thiếu …”: đó là trạng thái
hồ sơ, đã có hẳn tab **Cần bổ sung** lo. Để trên thẻ thì mỗi sản phẩm cõng thêm
một dòng mà chín trên mười lần chỉ nói “không có gì phải làm”. Hai mốc hiệu lực
viết thẳng ra (tô vàng/đỏ khi sắp/đã hết) thay cho một nhãn cảnh báo riêng — hai
mốc đã trả lời được cả “còn bán tới bao giờ” lẫn “có sắp hết không”. Màu của tầng chỉ xuất hiện
ở **hai** chỗ — chấm trên thanh phân bổ và huy hiệu số ở đầu tầng. Bản đầu còn kẻ
thêm vạch màu dọc bên trái tầng và bên trái từng thẻ; bỏ ngày 22/09/2026 vì tô
cùng một thông tin ba lần là hai lần thừa, và nhìn rối. Trên cùng là **thanh phân bổ**
— một vạch ngang chia theo tỉ lệ, bấm một khúc là nhảy tới tầng đó. Con số thì phải
đọc rồi so; một vạch màu thì liếc là thấy “gần như cả kho nằm ở Duy trì”.

Hai quyết định ở đây:

- **“Sắp ra mắt” giành quyền trước mọi mức ưu tiên.** Một sản phẩm chưa mở bán thì
  việc phải làm là kịp nội dung cho ngày ra mắt, không phải chạy quảng cáo — kể cả
  khi nó đã được xếp 🔥.
- **Bốn tầng dưới gập sẵn.** Riêng tầng Duy trì đã 40+ dòng; mở hết thì phải cuộn
  ba màn mới thấy bức tranh chung, tức là mất đúng cái làm nên “bảng thông tin
  nhanh”. Dùng `<details>` chứ không phải nút tự viết — gập/mở là hành vi sẵn có
  của trình duyệt, đọc được bằng bàn phím và trình đọc màn hình.

“Ngừng bán” không có mặt trên bảng: không còn gì để đẩy. Vẫn tra được ở Danh mục.

---

## Hai mức giá

Giá trong bảng **Sản phẩm** là **giá công bố thô** — Kinh doanh nhập sao để vậy,
chưa trừ khuyến mãi nào. Mức giảm khai ở bảng **Chính sách & Khuyến mãi**, năm cột:

| Cột | Nghĩa |
|---|---|
| `Giảm tiền NL` · `Giảm tiền TE` | số tiền giảm cho một vé. Tour ghép giảm theo vé không phân biệt lớn nhỏ → điền bằng nhau |
| `Giảm %` | nhập `20` nghĩa là 20% |
| `Áp vào giá hiển thị` | **công tắc của con người** — bật thì app mới trừ |
| `Ghi chú mức giảm` | phần không diễn đạt được bằng một con số (bậc thang theo số vé, điều kiện kèm theo) |

App chỉ trừ khi **đủ ba điều kiện** (`kho.js → trongGiaHienThi`):

1. `Áp vào giá hiển thị` đang bật. App **không tự suy** từ chữ trong nội dung
   chính sách — ưu đãi có điều kiện (khách cũ, mua từ vé thứ 5, tự túc ăn trưa)
   mà chui vào giá công bố là hứa với khách thứ một người mua lẻ không nhận được.
2. Chính sách chưa hết hiệu lực (đọc cột công thức `Tình trạng` của Base).
   “Sắp hết hạn” vẫn còn trừ — nếu không thì trước ngày hết hạn giá tự nhảy lên
   mà không ai đổi gì.
3. Không phải chính sách `🔒 Chỉ nội bộ`.

Thứ tự tính: **trừ tiền trước, rồi mới lấy phần trăm trên phần còn lại**. Nhiều
chính sách cùng bật thì cộng dồn. Kết quả không bao giờ âm.

Giao diện in **số khách thực trả** to nhất, giá gốc gạch ngang bên cạnh, chip
`−100.000đ`; ngăn chi tiết có bảng ba cột *Giá công bố · Giảm · Khách trả* kèm
tên chính sách đã trừ. In mỗi giá sau giảm thì người viết content không biết mình
được phép nói “giảm bao nhiêu”; in mỗi giá gốc thì đăng lên sai giá.

Chính sách có `Phạm vi = Toàn bộ sản phẩm` thì áp cho mọi dòng mà không cần nối
tay. **Nhận biết bằng ô Phạm vi, không phải bằng “ô Áp dụng cho đang trống”** —
bản đầu làm thế và sập ngay khi thêm chính sách cho nhóm sản phẩm chưa có trong
Base (ưu đãi tour riêng): mức giảm 10% của tour riêng dán lên cả 59 sản phẩm.

Hiện chỉ **hai** chính sách được bật: ưu đãi tour cáp treo (G2, G2CHONTHOM —
100.000đ/vé) và ưu đãi các tour land (50.000đ/vé). **G4 không có mức giảm nào**
vì CSBH 15/02/2026 viết phần giảm ngay dưới dòng G2, chưa rõ có áp cho G4 không —
xem ô *Lưu ý cho marketing* của G4.

---

## Quản lý sửa được gì

Mười một cột, khai ở `config.suaDuoc`, kiểm giá trị ở `kiem.js → doiTruong()`:

`Ưu tiên marketing` · `Trạng thái kinh doanh` · `Giá công bố NL` · `Giá công bố TE`
· `Ghi chú giá` · `Hiệu lực từ` · `Hiệu lực đến` · `Ưu đãi đang chạy` ·
`Lưu ý cho marketing` · `Lịch trình tóm tắt` · `Dịch vụ bao gồm`

Hai cột cuối ban đầu **cố ý đóng**; mở ra 22/09/2026 vì Lịch đổi thông tin chỉ
ghi được vào cột nằm trong danh sách này, mà đợt 01/10 đổi đúng hai cột đó. USP,
chính sách và dịch vụ *chưa* bao gồm vẫn đóng.

Hai ô giá là **giá công bố thô**, không phải giá sau giảm — nhãn trong app nói rõ
điều đó. Mức giảm sửa ở bảng Chính sách trên Base, không sửa từ đây.

Sửa được ở hai chỗ: bảng tab Quản lý (kèm tick nhiều dòng để **đặt hàng loạt**),
và ngay trong ngăn chi tiết của từng sản phẩm.

**Danh sách này cố ý hẹp.** USP, lịch trình, dịch vụ bao gồm, chính sách vẫn sửa
trên Lark Base — đó là chỗ Kinh doanh và Marketing cùng nhìn, dựng thêm một màn
nhập liệu ở đây chỉ tạo ra nguồn sự thật thứ hai. Server từ chối thẳng cột ngoài
danh sách, kèm câu chỉ sang Base.

**Không có nút “Lưu”:** mỗi ô đổi là ghi thẳng. Có nút Lưu thì sẽ có người đổi
mười dòng rồi đóng tab, và không ai biết mười dòng đó chưa đi đâu cả. Đổi lại,
trạng thái từng ô phải nhìn thấy được: đang lưu (mờ) → đã lưu (viền xanh 1,4 giây)
→ lỗi thì **trả ô về giá trị cũ** rồi báo, vì để nguyên là màn hình nói một đằng
Base một nẻo.

Mỗi lần ghi in một dòng `[GHI]` kèm người và `referer`. Không phải log tạm: app
sửa một Base cả phòng dùng chung, và câu hỏi đầu tiên khi thấy số liệu khác hôm
qua luôn là “ai đổi, từ đâu”.

---

## Tour riêng: giá theo số khách

Tour riêng **không có một giá công bố duy nhất** — giá tính trên đầu người và rẻ
dần khi đoàn đông (V4: 2 khách 4.400.000đ/khách → 22 khách 850.000đ/khách). Nhét
một con số vào cột `Giá công bố NL` là nói dối với 20 bậc còn lại.

Nên có bảng riêng **“Giá tour riêng theo số khách”** (sản phẩm · số khách · giá
NL · giá TE · nguồn). Trên thẻ app in mức rẻ nhất kèm điều kiện — *“từ 850.000đ
/khách · đoàn từ 22”* — và ngăn chi tiết có cả thang, kèm nút Chép.

Mức rẻ nhất thường trải trên nhiều bậc (22 và 23 khách cùng 850.000đ); app lấy
bậc **thấp nhất** đạt mức đó, vì đó mới là điều kiện thật để được giá này.

**Hai mã chưa có bảng giá**: `V2CHONTHOM` và `VLAND_VIN` — không tìm được tab
tương ứng trong file gửi đối tác. Ô `Ghi chú giá` nói rõ, không bịa số.

---

## Lịch đổi thông tin

Kinh doanh gửi đợt đổi lịch trình cho 8 tour, hẹn ngày 01/10. Trước đây phòng
phải nhớ rồi hôm đó ngồi sửa tay từng dòng — nhớ sót thì bài đăng nói một đằng,
tour chạy một nẻo.

Bảng **Lịch đổi thông tin** trên Base giữ từng thay đổi: sản phẩm, cột cần đổi,
giá trị mới, ngày áp dụng, trạng thái, giá trị cũ. Đặt và huỷ ngay trong tab
**Quản lý**.

Khu này **gom theo sản phẩm và gập ba tầng**, không phải một danh sách phẳng:

1. **Dòng tóm tắt cả khu** — *“16 mục · 7 sản phẩm · sớm nhất 01/10 · 4 mục chưa
   gán”*. Trả lời “hôm nay có gì đang chờ” mà không phải mở khối nào.
2. **Một dòng cho mỗi sản phẩm** — mã, số mục, ngày sớm nhất, và tên các cột sắp
   đổi. Biết sản phẩm nào đổi *cái gì* mà chưa cần mở.
3. **Bấm một mục mới ra nội dung mới.**

Mỗi mục đang chờ có nút **Sửa** và **Huỷ**. Sửa mở lại chính form đặt lịch, điền
sẵn — đây là đường duy nhất để **gán sản phẩm** cho những dòng nhập từ file mà
tên không khớp mã nào. Dòng **đã áp dụng thì không sửa được**: nó là lịch sử, và
bản cũ đã ghi đè rồi thì không lần ngược lại được nữa.

Màu trong khu này để rất tiết kiệm: “Chờ áp dụng” là trạng thái bình thường của
gần như mọi dòng nên để chữ xám, màu chỉ dành cho *đã áp · đã huỷ · lỗi*. Nhóm
chưa gán sản phẩm chỉ có một vạch đỏ mảnh, không tô nền.

Bản đầu phơi hết nội dung mới ra màn hình: 16 mục chiếm mấy màn, và mất luôn thứ
duy nhất cần nhìn trước. Nhóm **chưa gán sản phẩm** lên đầu, viền đỏ và **mở
sẵn** — chúng sẽ thành Lỗi đúng ngày áp dụng nếu không ai gán, nên không được
nằm sau một cái nút gập.

Sản phẩm nào có thay đổi đang chờ thì mang nhãn tím **⏳ đổi 01/10** ở mọi chỗ
nó xuất hiện, và ngăn chi tiết có mục *Sắp đổi*.

### Chạy bằng cách đọc-thì-áp, không có cron

Mỗi lần app đọc dữ liệu (`kho.tatCa`) nó kiểm luôn bảng lịch; dòng nào tới hạn
thì ghi xuống Base ngay lúc đó. Ba lý do:

- App chạy như tiến trình con trong lớp vỏ và trên Render **có thể bị ngủ**. Một
  cron trong tiến trình sẽ im lặng không chạy đúng lúc ngủ, mà không ai biết.
- Đọc-thì-áp **tự lành**: ngủ qua ngày 01/10 thì sáng 02/10 có người mở là nó áp
  ngay. Chậm tối đa bằng lần mở app kế tiếp — mà app này mở để xem thông tin sản
  phẩm, nên không ai đọc thì cũng chẳng ai thấy bản cũ.
- Lớp vỏ còn gọi `/api/tong-quan` cho trang Tổng quan nên thực tế nó chạy vài
  phút một lần trong giờ làm.

`kho.tatCa` gom mọi lời gọi song song vào một promise, nên hai tab mở cùng lúc
không áp hai lần.

### Bốn điều đã chốt trong bộ máy

| | Vì sao |
|---|---|
| Ghi **sản phẩm trước**, đánh dấu lịch sau | Ngược lại thì mạng đứt giữa chừng sẽ để lại dòng ghi “Đã áp dụng” trong khi sản phẩm chưa đổi gì — và không ai đi tìm lại nữa. Thứ tự này thì lần đọc sau tự thử lại |
| Dùng **chung `kiem.doiTruong`** với đường bấm tay | Nếu lịch đi cửa kiểm khác, nó thành đường vòng để ghi giá trị mà bấm tay bị chặn |
| Áp không được thì đánh dấu **Lỗi kèm lý do**, không thử lại | Một dòng chờ vĩnh viễn trông y hệt một dòng chưa tới hạn |
| Lưu **giá trị cũ** | Đây là thay đổi tự động; câu hỏi tiếp theo luôn là “trước đó nó là gì” |

`kiem.js` nằm riêng vì cả `server.js` (người bấm) lẫn `lich.js` (lịch, gọi từ
`kho.js`) đều cần — để trong `server.js` thì `kho.js` phải require ngược lên, thành
vòng tròn.

### Đợt đang chờ

16 dòng hẹn 01/10/2026 (7 tour) và 15/10/2026 (Rạch Vẹm). **4 dòng chưa gán sản
phẩm**: “Tour Safari – Vinwonders” và “Tour Vinwonders” trong file Kinh doanh
không khớp mã nào đang có (`GLAND_VIN` là VinWonders **+ Grand World**). Không
đoán — đoán sai ở đây là ghi đè lịch trình của một tour đang bán. Quản lý gán
sản phẩm trước ngày áp dụng, nếu không app sẽ đánh dấu Lỗi.

---

## Mấy cái bẫy đã sập, đừng sập lại

| Bẫy | Hậu quả | Chỗ vá |
|---|---|---|
| Trừ khuyến mãi vào giá công bố mà **tự suy từ nội dung** chính sách | Ưu đãi có điều kiện (khách cũ, từ vé thứ 5) lọt vào giá công khai — hứa với khách thứ họ không được hưởng | phải bật tay ô `Áp vào giá hiển thị`; `🔒 Chỉ nội bộ` bị chặn cứng |
| Sự kiện `change` do **script** bắn ra | App chạy cùng mã hub chèn vào (i18n dịch nhãn, `thugon.js`, `loc.js` khoác dãy nút cho `<select>` rồi `dispatchEvent(new Event('change'))`). Bất kỳ đoạn nào chạm vào ô của app là một dòng lặng lẽ đổi giá trên Base cả phòng đang đọc | `ghiO` bỏ qua sự kiện có `isTrusted === false` |
| `Number('')` ra **0** | Cột `Còn lại (ngày)` trả chuỗi rỗng cho dòng chưa đặt hạn ⇒ 0 ngày = “hết hạn hôm nay” ⇒ 50 sản phẩm không có hạn nhảy lên đầu cảnh báo | `kho.so()` trả `null`, có test |
| Ghi chuỗi rỗng vào cột số/ngày | Base hiểu đó là một **giá trị**, không phải “xoá” | `doiTruong()` luôn quy về `null`, có test |
| Select của Base **tự đẻ option** khi ghi giá trị lạ | Gõ nhầm một lần là cột có thêm một mức rác vĩnh viễn, bộ lọc lệch từ đó | danh sách trắng `cfg.chon`, kiểm cả ở đường hàng loạt |
| Đọc ngày bằng **giờ máy chủ** | Render chạy UTC; 30/09 00:00 (+07) = 29/09 17:00 UTC ⇒ mọi hạn lùi một ngày | `veNgay()`/`veNgayO()` cộng +07 rồi dùng `getUTC*`, cả server lẫn giao diện |
| Ô kiểu url trả dạng `[nhãn](url)` | Thẻ `<a>` có href là cả cặp ngoặc | `kho.linkSach()` |
| Ô “Ảnh lịch trình” của dòng cũ chứa **ghi chú** chứ không phải link | Nút bấm vào lỗi | `linkSach()` chỉ nhận chuỗi bắt đầu bằng `http` |
| Request từ hub **hụt danh tính** | Bản đầu của các app khác rơi xuống nhánh chạy-một-mình rồi **tự cấp quyền quản lý** | `aiGoi()` nhận biết hub bằng **sự có mặt** của header, không bằng giá trị. Có test |
| Gọi API bằng đường tuyệt đối `/api/...` | Qua proxy hub, app nằm dưới `/m/san-pham/` nên đường tuyệt đối trỏ ra gốc hub | `apiUrl()` ghép theo `location.pathname` |
| Vẽ lại cả màn sau mỗi lần ghi | Đang gõ trong ô thì mất con trỏ | `ghiO` chỉ cập nhật đối tượng + vẽ lại dải thẻ; ngăn chi tiết chỉ vẽ lại khi ô vừa sửa **không phải** textarea |
| Bấm vào ô sửa cũng mở ngăn chi tiết | Mỗi lần chỉnh giá là ngăn bật ra che mất bảng | trình xử lý click thoát sớm khi trúng `.oSua`, `.tick`, `.hangLoat` |

---

## Tệp

| Tệp | Việc |
|---|---|
| `config.js` | cổng, chế độ (`cli`/`api`), base token, table ID, **field ID**, `chon` (danh sách trắng), `suaDuoc` |
| `lark.js` / `larkapi.js` | hai backend cùng chữ ký — lark-cli trên máy, Open API khi deploy |
| `kho.js` | đọc bốn bảng một lượt, ghép thành hồ sơ sản phẩm, đệm 90 giây |
| `kiem.js` | `doiTruong()` — cửa kiểm giá trị duy nhất, dùng chung cho người bấm và cho lịch |
| `lich.js` | bộ máy áp lịch tới hạn |
| `server.js` | tệp tĩnh + `/api/khoi-tao`, `/api/san-pham`, `/api/tong-quan`, `POST /api/san-pham/:id`, `/hang-loat`, `/api/lich`, `/api/lich/them`, `/api/lich/:id/huy` |
| `public/` | giao diện. `khung-xuong.*` là bản chép từ hub — sửa ở hub rồi chạy `node dong-bo-khung.js` |

## Khai trong Hub

`lark-mkt-hub/modules.json` → id `san-pham`, cổng 5184, `kpi: "san-pham"`
(bộ đọc ở `lark-mkt-hub/kpi.js`). Base này **không có trục thời gian** — một sản
phẩm không thuộc về tháng nào — nên khoảng lọc của trang Tổng quan bị nuốt ngay
tại bộ đọc, và app trả về câu “không lọc theo thời gian” để không ai đọc nhầm
con số.

Tab **Tài liệu chung** đã bị bỏ (22/09/2026) để nhường chỗ cho tab Quản lý. Các
link dùng chung (thư mục lịch trình tổng, bảng giá gửi đối tác, wiki CSBH) vẫn
nằm nguyên trong bảng **Kho media & tài liệu** trên Base; `kho.js` vẫn tách chúng
ra khỏi media của từng sản phẩm, chỉ là server không gửi lên nữa.
