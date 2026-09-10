# Chỉnh ảnh & Edit video — Rooty Trip

Nơi nhân sự **báo cáo link sản phẩm** đã làm, quản lý **nghiệm thu**, và tin báo
tự **gửi về nhóm chat Lark** — thay cho việc dán link vào nhóm bằng tay.

```
node server.js        # http://localhost:5181  (hoặc bấm start.bat)
npm test              # 87 phép thử, chỉ đọc Base, không gửi tin
```

Base: <https://rootytrip2.sg.larksuite.com/base/OzF9bSPkPamYQHsNcU8lmMVQgFb>
Nhóm chat mặc định: **SỬA ẢNH** (đổi được trong tab Cài đặt, chỉ quản lý).

Không dependency npm. Chạy độc lập được, và chạy dưới lớp vỏ
[Marketing Hub](../lark-mkt-hub) ở `#/m/chinh-anh`.

## Luồng việc thật mà app này số hoá

```
Ảnh:   Drive → tải về → Lightroom → tạo thư mục Google Photos
       (tên = Tour + Ghép/VIP + ngày) → lấy link
Video: Drive → tải về → Capcut → tải sản phẩm lên Drive → lấy link
                                    ↓
                        app này: điền link, bấm Báo cáo
                                    ↓
                   ghi Lark Base  +  gửi thẻ vào nhóm SỬA ẢNH
                                    ↓
                   quản lý bấm Nghiệm thu: Đạt / Cần sửa lại
```

**Một lần bấm Báo cáo = NHIỀU MỤC.** Một buổi thường có mấy thư mục: khác Tour, hoặc
cùng Tour mà khác Ghép/VIP, và có thể do người khác chỉnh. Bấm **Thêm mục** để thêm
(tối đa 20/lần); mục mới kế thừa Tour · Loại · ngày · người chỉnh của mục trước, nên
thường chỉ phải dán thêm cái link.

**Một MỤC = một LÔ** = một Tour + một Loại + một ngày, và là **một dòng** trên Base.
Trong mục có thể có cả ảnh và video; ai chỉ làm ảnh thì để trống ô video.

**Người chỉnh nằm trong TỪNG mục**, không gộp lên đầu — hai thư mục trong cùng buổi có
thể do hai người khác nhau làm, gộp lên đầu là mất thông tin đó. Ô chọn người tra thẳng
danh bạ Lark (`contact +search-user`), và luôn có sẵn danh sách người đã từng làm lấy từ
chính bảng Báo cáo — nên chế độ `api` (không tra được danh bạ) vẫn dùng được.

**Cả lần báo cáo chỉ gửi MỘT tin** vào nhóm, liệt kê từng mục kèm người chỉnh và link,
cộng sẵn tổng ảnh/video. Không gửi N tin: nhóm đọc một lần là biết cả buổi làm được gì,
khỏi cuộn qua mấy tin gần giống nhau. Bảng *Nhật ký gửi tin* vì thế có **một dòng cho
một lần bấm**, không phải một dòng cho một lô.

**Tiêu đề tin nói cho MEDIA và CSKH, không phải cho MKT.** Luồng thật là: MKT chỉnh
ảnh → gửi nhóm → **Media** kiểm và chỉnh tiếp → **CSKH** gửi khách. Người đọc tin không
phải người chỉnh, nên tiêu đề là `Media khách hàng Rooty Trip · 10.09.2026` (ngày tác
nghiệp), còn tên thư mục nội bộ (`TOUR ĐẢO · Ghép · 10.09.2026`) nằm trong **thân tin**.
Một mục và nhiều mục dùng **cùng một tiêu đề** — nhóm không phải học hai kiểu tin. Đổi
câu chữ thì sửa `ANH_TIEU_DE_TIN` trong `.env`, không phải sửa code.

**Mỗi mục là một khối riêng, cách nhau bằng đường kẻ, link đứng riêng một dòng:**

```
1 · TOUR ĐẢO · Ghép · 10.09.2026          ← tên thư mục, đậm
Chỉnh ảnh · 124 ảnh · do Nguyễn Thanh     ← làm gì, bao nhiêu, ai làm
Thư mục ảnh · Thư mục video               ← link, RIÊNG một dòng
─────────────────────────────
2 · LAND TOUR · VIP · 10.09.2026
…
```

Gộp hết vào một đoạn thì hai mục trôi thành một khối chữ xám, không thấy mục nào kết
thúc ở đâu. Và link nhét cuối câu thì mắt phải đọc hết câu mới thấy chỗ bấm — mà đó là
thứ Media cần bấm đầu tiên.

**Ghi chú KHÔNG vào tin** (chốt 10/09/2026): đúng ba dòng trên là đủ cho Media và CSKH;
thêm dòng chữ nghiêng chỉ làm khối mục dài. Ghi chú vẫn nằm nguyên trên Base và trong
app. Quy tắc giống nhau ở cả hai kiểu thẻ — không thì báo 1 lô thấy ghi chú mà báo 2 lô
lại không. **Nhận xét nghiệm thu thì VẪN gửi** — đó là thứ người chỉnh phải đọc để biết
sửa gì, có phép thử riêng chốt lại để lần dọn tin sau không quét luôn cả nó.

**Thẻ KHÔNG có nút bấm** (chốt 10/09/2026). App đang khép kín: người xem ảnh trong nhóm
không có đường vào app, nên nút "Nghiệm thu trong app" chỉ dẫn tới cánh cửa họ không mở
được. Link thư mục vẫn bấm được nhưng để dạng **link chữ trong thân tin**. Có vấn đề thì
họ nhắn thẳng trong nhóm, nhân sự tự chỉnh. `test/tin.test.js` chốt lại "không còn nút
nào" để sau này đừng ai thêm lại.

## Ba quyết định đáng biết trước khi sửa code

**1. Tên sản phẩm do app GHÉP, không ai gõ.** `<TOUR> · <Loại> · <dd.mm.yyyy>` ghép từ
ba thứ nhân sự chọn. Danh sách Tour là bảng *Danh mục Tour* trên Base — anh Hùng
thêm/bớt ở đó và app đọc theo, nên tên sản phẩm luôn khớp danh mục.

Bản đầu còn có một ô **dán tên thư mục** (tách chuỗi người gõ ra Tour/Loại/Ngày, chịu
được 18 kiểu viết bừa). Anh Hùng bỏ ô đó ngày 10/09/2026: quản danh mục trong Base là
đủ, không cần đoán từ chuỗi. Nửa "đọc" của `ten-thu-muc.js` đã xoá — cần lại thì lấy
trong git. Nửa còn lại (`dat()` ghép tên, `khoa()` sinh khoá chống trùng) vẫn là chỗ
nguy hiểm nhất nên vẫn có test riêng: hai Tour mà gọn hoá ra cùng chuỗi sẽ **dùng chung
một khoá** và đè lô của nhau — có phép thử chạy trên danh mục THẬT để chặn.

**2. Một lô chỉ có một dòng trên Base.** Cột `⚙️ Khoá` = `tour|loại|ngày`. Báo cáo lại
cùng một lô thì **đè** dòng cũ, không đẻ dòng mới — báo hai lần là mọi con số đếm gấp
đôi mà nhìn bảng không thấy gì bất thường. Giao diện nói trước: *"Lô này đã có báo cáo
— bấm Báo cáo sẽ cập nhật dòng đó"*. Báo cáo lại luôn đưa trạng thái về
**Chờ nghiệm thu**, nếu không người kiểm không biết là đã sửa xong.

Kéo theo: **hai mục trong CÙNG một lần bấm mà cùng Tour + Loại + ngày thì bị chặn** —
nếu không, mục sau đè mục trước và người dùng mất dữ liệu mà không ai báo. Cả giao diện
và server đều chặn, và nói rõ trùng với mục số mấy. Muốn hai link cùng một lô thì gộp
vào một mục, hoặc đổi Loại/ngày.

**3. Ghi Base xong rồi mới gửi tin, và gửi tin KHÔNG được làm vỡ báo cáo.**
`guiVeNhom()` không bao giờ throw — nó trả kết quả. Gửi thẻ trước, thẻ bị Lark từ chối
thì **lùi về tin chữ** (schema thẻ là thứ Lark siết lại được bất cứ lúc nào). Gửi hỏng
thì dòng vẫn nằm trên Base với `Đã gửi nhóm = false`, hiện thẻ **"Chưa gửi nhóm"** ở
màn quản lý và có nút **Gửi nhóm** để gửi lại. Mọi lượt gửi ghi vào bảng
*Nhật ký gửi tin*.

## Các bẫy đã tránh (đừng "sửa" lại)

- **Ghi ngày vào Base:** Base tạo với `time_zone Asia/Shanghai`, và Lark hiểu chuỗi
  trần `"2026-09-10 00:00:00"` theo **múi giờ của Base**. Nên `store.ngayVeBase()` chỉ
  ghép `" 00:00:00"`, KHÔNG quy đổi UTC. Đổi thành quy đổi UTC là mọi dòng lùi đúng một
  ngày — sai lệch câm, vì bảng vẫn đầy số trông rất hợp lý.
- **Bỏ một hạng mục thì phải xoá luôn số và link của hạng mục đó.** Không xoá thì lô
  ghi "Chỉnh ảnh" vẫn còn 2 video của lần báo trước, và thẻ Video ở màn quản lý cộng cả
  số đó.
- **Link phải là http/https** trước khi đưa vào nút bấm của thẻ (`tin.linkSach`). Một
  link rác là Lark từ chối **cả tin**.
- **Không retry mù khi gửi tin.** Đọc Base thì retry được; gửi lại một tin đã gửi được
  là nhóm nhận hai lần. Dùng `--idempotency-key` của lark-cli.
- **Một lô nhiều người thì đếm cho TỪNG người** (bảng *Theo người làm*). Đếm một lần
  thì không thấy ai đang gánh.
- **Việc bị trả về sửa nằm ngoài khoảng lọc vẫn phải đếm** — `/api/tong-quan` trả
  `ngoaiKhoang` để hub hiện băng *"Bộ lọc đang che N việc gấp"*. Bài học từ 44 việc quá
  hạn tháng 5 biến mất khỏi màn quản lý khi lọc theo tháng.
- **PHÒNG CÓ HAI APP LARK — đừng mời sai bot.**
  `cli_aa04305ecd385ed1` là app của Hub; **tên nó trong Developer Console là "Tracking"**,
  không phải "Marketing Hub" (đặt từ hồi chỉ có base Bảng công việc, giờ nó chạy cả bảy
  app). `cli_aaeafc646039ded1` là app mà lark-cli đang buộc trên máy anh Hùng.
  Không khai `ANH_TIN_APP_SECRET` thì tin gửi từ máy mang danh tính app thứ hai, còn tin
  gửi từ server mang danh tính app Hub → nhóm thấy hai người gửi khác nhau, và phải mời
  cả hai bot. Khai secret của app Hub vào `.env` là mọi tin đi qua `tin-app.js` ở **mọi
  chế độ**, chỉ phải mời một bot. Tab Cài đặt luôn in ra đang gửi bằng bot nào **kèm App
  ID** — App ID mới là thứ định danh chắc, tên thì đổi được.
- **Tin gửi bằng danh tính BOT, không phải danh tính người dùng.** Gửi bằng danh tính
  người cần scope `im:message.send_as_user` mà phiên lark-cli của máy không có — mỗi
  nhân sự lại phải tự đăng nhập Lark thêm một lần. Và khi deploy chung thì chỉ có bot.
  **Bot của app phải được thêm vào nhóm SỬA ẢNH**, nếu không Lark trả 230002/230013.
- **Icon trong hub tên là `chinh-anh`, không phải `anh`.** Tên `anh` đã là khung ảnh của
  mục Nhận diện thương hiệu trong Cài đặt; khai trùng thì một trong hai icon chết câm.

## Cấu trúc

| File | Việc |
|---|---|
| `config.js` | table/field ID thật, nhóm chat mặc định, option select |
| `thiet-lap-base.js` | dựng lại Base từ đầu (chạy lại được, `--base-token` để tiếp tục) |
| `ten-thu-muc.js` | đọc/ghép tên thư mục, sinh khoá chống trùng |
| `store.js` | đọc/ghi Base bằng field ID, cache 45s |
| `tin.js` | soạn thẻ + tin chữ gửi nhóm (không gửi, chỉ soạn) |
| `gui-thu.js` | gửi một tin thử để xem hình thù thẻ, không ghi gì lên Base |
| `tin-app.js` | gửi tin bằng danh tính app của Hub (`cli_aa04305ecd385ed1`) ở mọi chế độ |
| `lark.js` / `larkapi.js` | hai backend cùng chữ ký: lark-cli (máy cá nhân) / Open API (server chung) |
| `quyen.js` | chốt vai quản lý |
| `server.js` | HTTP thuần Node, `/api/*` cho nhân sự và `/api/quan-ly/*` cho quản lý |

## Bảng trên Base

- **Báo cáo sản phẩm** — mỗi dòng một lô. Cột chính là *Tên thư mục* để mở Base ra là
  đọc được ngay.
- **Danh mục Tour** — nguồn duy nhất của danh sách Tour. Thêm Tour = thêm dòng ở đây,
  không sửa code. `Đang dùng = false` thì Tour đó không còn hiện trong biểu mẫu nhưng
  báo cáo cũ vẫn giữ được.
- **Nhật ký gửi tin** — mỗi lượt gửi một dòng, kèm lỗi nếu hỏng.
- **Cài đặt** — `chat_id` / `chat_ten`. Để trên Base chứ không để trên đĩa vì app còn
  phải chạy được trên Render (đĩa ở đó không giữ được gì).

## Kiểm soát chất lượng ảnh bằng AI

Đã khảo sát xong, **tạm chưa làm** (anh Hùng chốt 10/09/2026). Ràng buộc bên ngoài và
thiết kế đã chốt nằm ở [docs/kiem-soat-chat-luong.md](docs/kiem-soat-chat-luong.md) —
đọc file đó trước khi mở lại việc này, đừng tra lại Google Photos API từ đầu.

Thứ app hiện tại đã làm để dọn đường: trả về *Cần sửa lại* thì **bắt buộc ghi rõ sửa
gì**. Vài tuần là bảng Báo cáo có một tập lý do thật để đúc thành tiêu chí.

## Cài trên máy: một bí mật duy nhất

```
copy .env.mau .env        # rồi mở .env, dán App Secret của Marketing Hub
```

`ANH_TIN_APP_SECRET` lấy ở <https://open.larksuite.com/app/cli_aa04305ecd385ed1> →
*Credentials & Basic Info* (app tên **"Tracking"**). `.env` đã bị `.gitignore` của repo
chặn. Khi deploy thì khai bằng biến môi trường của Render, không dùng file.

App đó còn phải có **scope `im:message`** và **đã phát hành version mới** — bộ 8 scope
khai trong `lark-mkt-hub/docs/trien-khai-render.md` mục A1 **không có** `im:message`,
nên gần như chắc phải thêm. Thiếu thì Lark trả `99991672` và app nói rõ ra.

Không khai cũng chạy — app chỉ gửi bằng bot khác và **nói rõ điều đó** trong tab Cài đặt.
`config.js` tự nạp `.env` (không dùng dotenv, giữ nguyên tắc không dependency npm);
biến đã có trong môi trường thì file **không** ghi đè.

**Đừng cất secret vào bảng Cài đặt trên Base** — cả phòng mở Base ra là đọc được.

## Nghiệm thu — tab riêng cho quản lý

Hàng đợi những lô đang *Chờ nghiệm thu*: mỗi lô một khối, mở thư mục ảnh ra xem rồi bấm
**Đạt** (xanh) hoặc **Cần sửa lại** (đỏ) ngay tại đó. Kết quả tự báo về nhóm chat.

Ba quyết định:

- **Là một TAB riêng, không phải nút trong bảng "Sản phẩm đã làm".** Xem ảnh là việc làm
  liên tục nhiều lô một lượt; còn bảng thì bị bộ lọc thời gian cắt và trộn lẫn lô đã
  duyệt với lô chưa. Ở tab này chỉ còn thứ cần quyết.
- **Hàng đợi KHÔNG theo bộ lọc thời gian** — nó đọc riêng, toàn bộ. Lô chờ từ tháng
  trước vẫn phải hiện ra, nếu không nó nằm đó mãi mà không ai thấy. Xếp **cũ nhất
  trước**: lô để lâu là lô dễ bị quên.
- **Trả về sửa thì BẮT BUỘC ghi rõ sửa gì** (server chặn, không chỉ giao diện). Đây
  chính là tình trạng cũ mà app ra đời để bỏ — "xấu thì chỉnh lại" mà không nói sửa gì.
  Và nó là nguyên liệu để sau này đúc bộ tiêu chí cho phần AI.

Tab chỉ hiện với quản lý. Nhân sự vào cũng không làm được gì (server chặn 403), mà thấy
một tab bấm vào là lỗi thì rất khó hiểu.

## Kiểm nhanh đường gửi tin

```
node gui-thu.js --toi-nguoi ou_xxx           # nhắn riêng, xem hình thù thẻ
node gui-thu.js --toi-nhom oc_xxx --mot-muc  # thẻ một mục
node gui-thu.js --toi-nguoi ou_xxx --dry-run # chỉ in, không gửi
```

Đi **đúng đường gửi của app thật** (`tin.js` → `lark.guiTin` → `tin-app.js`) nên nó
chứng minh cả chuỗi, chỉ khác là dữ liệu bịa và tiêu đề có `[TIN THỬ]`. Dùng mỗi khi đổi
app đứng tên gửi, đổi scope, hoặc deploy sang chỗ mới — thay vì bấm Báo cáo thật rồi
phải đi xoá một dòng rác trên Base. Gửi hỏng thì nó in ra ba chỗ hay thiếu theo đúng thứ
tự nên kiểm.

## Quyền

Máy cá nhân (`mode: cli`): ai mở app cũng là quản lý — cấu hình nằm ngay trên đĩa của
chính người đó, thêm chốt cũng không bảo vệ được gì.

Server chung (`mode: api`): chỉ tin header `x-hub-user-manager` do hub đặt sau khi đăng
nhập Lark và tra bảng Phân quyền app. Hub xoá header do client tự gửi trước khi ghi
lại, và app chỉ nghe trên `127.0.0.1`.
