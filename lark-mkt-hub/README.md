# Marketing Hub — siêu ứng dụng phòng Marketing Rooty Trip

Một cửa vào cho **tất cả** Lark Base của phòng. Panel bên trái là danh sách base;
khung bên phải là app của base đó, **giữ nguyên bộ tab riêng** của nó.

Trang chủ **Tổng quan chung** gom ba thứ, theo thứ tự đọc từ trên xuống:
thẻ số của từng base → **Tải nhân sự** (dải nhiệt ai làm gì ngày nào) →
**Cần xử lý ngay** (việc gấp trộn từ mọi base).

Mọi con số ở đó **bấm được**: một thẻ mở ra đúng danh sách bản ghi sau con số đó
kèm nút xử lý ngay tại chỗ (phân công, đổi hạn, bắt đầu, duyệt lịch, xác nhận
thanh toán) — xem [Cửa sổ xử lý nhanh](#cửa-sổ-xử-lý-nhanh).

```
┌────────────────────┬─────────────────────────────────────────────────────┐
│ panel base         │ app của base đang chọn (tab của nó nằm nguyên trên)  │
│                    │                                                     │
│ ▣  Tổng quan chung │  ┌ Tổng quan │ Việc của tôi │ Lịch │ Kanban │ Bảng ┐ │
│ ── base ──         │  │                                              │   │
│ ☑  Bảng công việc  │  │  … nội dung app …                            │   │
│ ▦  Lịch tác nghiệp │  │                                              │   │
│ ▥  Quản lý quảng cáo  └──────────────────────────────────────────────┘   │
│ +  Thêm base       │                                                     │
│ ≡  Cài đặt         │                                                     │
└────────────────────┴─────────────────────────────────────────────────────┘
```
(panel dùng icon 2D nét mảnh — xem mục **Icon**)

## Chạy

```bat
start.bat
```
hoặc

```bash
node server.js      # -> http://localhost:5180
```

Hub **tự bật** các app module (`lark-task-manager`, `lark-lich-tac-nghiep`,
`lark-ads-manager`) rồi tự tắt khi bạn Ctrl+C. Nếu app nào đã được mở sẵn bằng
`start.bat` riêng, hub **dùng lại chứ không bật thêm** (tránh trùng cổng) — lúc đó
trạng thái hiện "Chạy sẵn ngoài hub" và hub không tắt/bật hộ được.

Không có dependency npm. Chỉ cần Node (đang dùng v24).

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 5180 | cổng của hub |
| `HUB_AUTOSTART` | 1 | `0` = không tự bật module, tự bật tay trong Cài đặt |
| `HUB_KPI_MS` | 20000 | thời gian cache chỉ số Tổng quan chung |
| `HUB_BOOT_MS` | 60000 | thời gian chờ module sẵn sàng |
| `HUB_MODULES_FILE` | `modules.json` | dùng file danh sách base khác |

## Kiến trúc — vì sao proxy chứ không nhúng `localhost:5173`

Mỗi module vẫn là một app Node độc lập, chạy được riêng như trước. Hub chỉ:

1. **Bật tiến trình** (`node server.js` với biến `PORT`), giữ log, tự bật lại khi chết.
2. **Proxy** `/m/<id>/...` → `127.0.0.1:<cổng>/...` nên hub và module **cùng một origin**:
   không CORS, không cookie chéo site, và khi deploy chỉ cần **một URL công khai** cho Lark.
3. **Chèn** vào HTML của module một đoạn CSS + JS nhỏ:
   - ẩn khối logo trùng ở góc trên trái (panel đã làm việc đó) — khai ở `an` trong `modules.json`;
   - vá `fetch` / `XHR` / `window.open` để đường dẫn tuyệt đối `/api/...` thành `/m/<id>/api/...`;
   - gửi dòng phụ đề của module (VD "384 việc toàn phòng · vừa xong") ra panel.

   Không sửa một dòng code nào của ba app kia.
4. **Gộp chỉ số**: hub không đọc Lark Base trực tiếp — nó gọi lại API của chính từng
   module (`/api/tasks`, `/api/meta`, `/api/overview`). Mọi quy tắc nghiệp vụ
   (lọc dòng trống, tính lại thời lượng, cách cộng chi tiêu) chỉ định nghĩa một nơi:
   trong module.

Iframe của module được **giữ lại trong DOM** sau khi mở, nên chuyển qua lại giữa các base
không mất trạng thái (bộ lọc, tab đang xem, ô đang nhập).

### Nén — đặt ở lớp vỏ, phủ cả chín app

Proxy **xoá `accept-encoding`** khi gọi lên app con (bước 3 ở trên cần HTML thô để còn
chèn shim vào). Hệ quả là app con luôn trả bản không nén, và trước đây không ai nén lại:
mở Bảng công việc là tải 268 KB, Lịch tác nghiệp 286 KB, riêng lớp vỏ đã 315 KB.

`nen.js` nén trên **đường ra** của hub, nên một chỗ phủ hết — không phải sửa dòng nào
của chín app con, đúng nguyên tắc kiến trúc ở trên. Đo thật:

| | Thô | Nén (brotli) |
|---|---|---|
| Lớp vỏ (10 tệp + trang chủ) | 315 KB | **98 KB** |
| `/m/cong-viec/` đủ bộ | 860 KB | **161 KB** |
| `/api/lich-chung` (mỗi lượt, không cache được) | 23,6 KB | **3,3 KB** |

Ba chỗ **không** nén, mỗi chỗ có lý do cụ thể:

- `text/event-stream` — luồng *Trực tiếp* của Booking OTA. zlib gom đệm chờ đủ khối mới
  đẩy, nén vào là sự kiện đứng im hàng phút. Có phép thử canh riêng.
- Ảnh / zip / xlsx / tệp đính kèm — đã nén sẵn, nén lại tốn CPU mà ra to hơn.
- Thân dưới 1 KB — phần đầu gzip còn dài hơn phần tiết kiệm được.

File tĩnh được nén **một lần ở mức brotli 11** rồi giữ trong RAM (khoá theo đường dẫn +
`mtime`, sửa file là tự hết hiệu lực). Phản hồi động nén mức vừa, đủ nhanh để không thành
nút cổ chai.

### Số cũ trả ngay, đọc lại phía sau

Đệm chỉ số sống 20 giây, mà trang tự nạp mỗi 60 giây — nên gần như **lượt nào cũng** rơi
vào nhánh chậm: người dùng chờ 2,5 giây cho bộ số máy chủ vừa có cách đó vài chục giây.

Nay hết hạn thì `kpi.doc()` **trả ngay số đang có** rồi đọc lại ở phía sau (2,5 giây →
3 ms; số không bao giờ cũ quá một nhịp). Quá 10 phút thì mới bắt đứng chờ số mới.

Hai chốt phải nhớ khi sửa chỗ này:

- **Không gắn cờ `cu`** cho số hơi cũ. Cờ đó dành riêng cho *"lần đọc mới nhất LỖI"* và
  giao diện treo băng cảnh báo đỏ cho nó — gắn nhầm là báo động giả mỗi phút một lần.
  Tuổi thật đã nằm trong `luc`, trang chủ vốn in "cập nhật lúc …".
- Lời gọi **đang bay** khởi hành trước lúc `xoaCache()` thì chở dữ liệu cũ. Cứ thế ghi
  vào đệm là xử lý xong một việc mà thẻ số dựng lại như chưa làm. `kpi.js` đánh số **đời**
  của đệm, kết quả lạc đời thì bỏ.

### Gộp lượt đang bay

Bảng Phân quyền bị hỏi ở đầu **gần như mọi request**, kể cả từng tệp tĩnh đi qua
`/m/<id>/`. Mở một app con là trình duyệt xin 20–40 tệp một lúc; đúng lúc đệm hết hạn thì
cả 40 cùng gọi Lark, và Lark chặn theo tần suất.

Đệm 20 giây chống được **lần thứ hai trở đi**, không chống được **cơn ập cùng lúc** — hai
chuyện khác nhau, và chỉ chuyện thứ hai mới gây sự cố. `quyen.js`, `kpi.js`, `lichchung.js`
đều gộp lượt trùng khoá đang bay làm một.

Ngoại lệ: `quyen.js` **không** gộp lượt "đọc lại" do người dùng bấm — lượt đó luôn đi ngay
sau một lần ghi quyền, mà lời gọi đang bay đã khởi hành *trước* khi ghi.

Hai bộ đệm chỉ số có **trần** (300 / 200 mục, dọn theo tuổi). Khoá gồm người xem + khoảng
ngày + vai nên nó nở theo cách dùng và không bao giờ tự co, mỗi mục lại ôm cả `nhom` vài
trăm bản ghi — chạy vài ngày là hết 512 MB của gói Free rồi bị giết, mà nhìn từ ngoài chỉ
thấy "app tự nhiên chậm rồi đứng".

## Ngôn ngữ thiết kế

Lớp vỏ dùng chung hệ thiết kế của app *Quản lý quảng cáo*:

- nền xám xanh `#f4f6fa` làm mặt đất, **mọi khối thông tin là thẻ trắng bo 12px, viền mỏng
  + bóng nhẹ** để tách khỏi nền. Không lồng thẻ trong thẻ — mỗi base chỉ là một tiêu đề
  (có gạch chân mảnh) rồi tới lưới thẻ số;
- nhãn in hoa nhỏ 11px đậm màu nhạt, số 22px đậm, chữ số `tabular-nums` cho thẳng cột;
- **không emoji trong giao diện** — base nhận diện bằng **icon 2D** trong ô màu,
  hành động bằng chữ ("Làm mới", "Mở Base", "Báo cáo", "Quyền");
- **không có dòng mô tả / hướng dẫn suông** — chữ nhỏ chỉ tồn tại khi mang số liệu:
  "39 việc đang mở · đã lọc", "91 / 132", "thực tế 8.784.800đ", "01/08/2026 → 31/08/2026".

Ba app module cũng đã dọn theo hai quy ước cuối: bỏ emoji ở tab / nút / tiêu đề, bỏ các dòng
giải thích trong bảng điều khiển. Riêng giá trị select của Base (`🟡 Trung bình`) vẫn ghi
nguyên như Base đang lưu, chỉ **bỏ emoji khi hiển thị** (`nhan()` trong `kpi.js`).

## Khung xương — khoảng chờ có hình dạng

Anh Hùng: *"YouTube cho hiện ra các ô trước rồi mới nạp dữ liệu vào, tạo cảm giác hệ thống
không bị lỗi và không trống trơn."* Trước đây mỗi màn chờ một kiểu: lớp vỏ ghi "Đang nạp…",
Bảng công việc quay một vòng tròn, Quảng cáo ghi "Đang nạp dữ liệu từ Lark Base…" — và ở
đâu cũng là **một dòng chữ giữa vùng trắng**. Trên Render gói Free, `/api/tongquan` mất 2-5
giây vì phải hỏi chín Base, nên vùng trắng đó là thứ người ta nhìn nhiều nhất trong ngày.

Giờ cả hệ dùng **một bộ khuôn**: vẽ sẵn đúng hình dạng của nội dung sắp tới bằng khối xám
nhấp nháy, rồi thay dữ liệu thật vào đúng chỗ đó.

| File | Việc |
|---|---|
| `public/khung-xuong.css` | **bản gốc** — token màu (sáng/tối), hiệu ứng lướt, các hình dạng chuẩn |
| `public/khung-xuong.js` | **bản gốc** — bộ dựng `KX.*` |
| `dong-bo-khung.js` | chép CẢ HAI bản gốc sang `public/` của chín app con |
| `test/khung-xuong.test.js` | canh cho không bản nào lệch và không chỗ nào rơi lại về vùng trắng |

`KX.*` có **hai nhóm, đừng lẫn**:

- **nhóm chung** — `o` `chu` `so` `nut` `oSo` `dong` `log` `cot` `luoiNho` `khoi` `hai` `bang`
  `man`: chỉ dùng lớp `kx-*`
  của riêng khung xương nên **app nào cũng gọi được**;
- **nhóm riêng của lớp vỏ** — `the` `khoiBase` `luoiBase` `viec` `tai` `rail` `tin`: mượn lớp
  bố cục của trang Tổng quan (`.the-luoi`, `.tn-hang`, `.viec-dong`…). **App con đừng gọi**:
  `.the` bên Báo cáo là thẻ báo cáo, bên lớp vỏ là ô số — gọi nhầm là ăn nhầm CSS của chính
  app đó. `test/khung-xuong.test.js` quét mọi tệp JS của chín app để canh chuyện này.

### Trí nhớ hình dạng — thứ làm nó KHỚP giao diện thật

Anh Hùng nhìn bản đầu và nói đúng một câu: *"nó không khớp với giao diện thật"*. Gốc của
chuyện đó là vẽ **hình trung bình**: bốn ô đều nhau cho mọi base, bốn thẻ + một bảng cho cả
chín app. Mà thật thì thẻ base có **một ô chính số 30px rộng hết hàng** rồi mới tới ô phụ,
mỗi base một số ô khác nhau, và số base thì tuỳ người đăng nhập.

Cách chữa: **nhớ hình của lần mở trước rồi dựng lại đúng hình đó.**

- Lớp vỏ ghi `hub.hinh.v2` vào localStorage sau mỗi lần vẽ thật: mỗi base một mục
  `{id, tên, icon, màu, số ô, có ô chính, có dòng "Không có", CHIỀU CAO thật, bề ngang cửa
  sổ lúc đo}`, cộng chiều cao của băng cảnh báo và khối "Cần xử lý ngay".
  **Chỉ hình, không có con số nào** — không có gì phải giấu trong localStorage.
- Mở lại app: `veHomeXuong()` + `veRailXuong()` chạy **trước cả lời gọi mạng đầu tiên**,
  dựng đúng số base, đúng tên, đúng icon, đúng số ô, và `min-height` đúng chiều cao cũ.
  Đo thật: trang khung xương và trang có số liệu **cao bằng nhau từng pixel** (2520px),
  từng khối một.
- Số ô đếm thẳng trên chuỗi HTML vừa dựng, không tính lại bằng tay — `xepTheoTang()` đổi
  luật lúc nào thì trí nhớ đổi theo lúc đó.
- Chiều cao đo **ngay sau khi vẽ**, không chờ `requestAnimationFrame`: rAF không chạy khi
  tab ở nền, mà tab nền đúng là lúc trang tự vẽ lại theo nhịp 60 giây.
- Bề ngang cửa sổ đi kèm chiều cao: số cột đổi theo bề ngang, nên chiều cao đo ở màn rộng
  đem áp cho màn hẹp còn sai hơn là không áp (lệch quá 140px thì bỏ).

App con dùng cùng cơ chế mà **không phải viết thêm dòng JS nào**: gắn `data-kx-cao="<tên>"`
lên thẻ bọc khung xương, `khung-xuong.js` tự chừa chiều cao cũ và tự đo lại khi nội dung
thật thay vào (MutationObserver + chờ 400ms cho nội dung vẽ xong nhiều lượt).

### Chín app con, chín hình khác nhau

Hình của từng app **đo trên màn thật của nó**, không bịa:

| App | Màn đầu thật | Khung xương |
|---|---|---|
| Bảng công việc | 6 thẻ số → 3 cột danh sách việc | `oSo(6)` + `cot(3, 3)` |
| Lịch tác nghiệp | lưới lịch 7 cột | `kx-lich` |
| Quảng cáo | 3 thẻ số lớn → hàng thẻ phụ → bảng | `oSo(3)` + `oSo(6)` + `dong(6)` |
| Social | hàng thẻ số → biểu đồ → bảng | `oSo(6)` + `khoi(210)` + `dong(6)` |
| Booking OTA | băng chú ý → 4 thẻ → bảng dài | `khoi()` + `oSo(4)` + `dong(8)` |
| Báo cáo & KPI | băng chú ý → lưới ô số nhỏ dày | `khoi()` + `luoiNho(14)` |
| Quỹ chi phí | 4 thẻ số → bảng dài | `oSo(4)` + `dong(10)` |
| Chỉnh ảnh | form lớn trái + danh sách phải | `hai(khoi, khoi)` |
| Báo cáo công việc | thẻ ngày → thẻ form lớn | ba `khoi()` chồng nhau |

Ba quy ước, phá cái nào cũng mất đúng thứ vừa làm được:

1. **Mượn lớp bố cục THẬT** (`.luoi-base`, `.the-luoi`, `.viec-dong`, `.tn-hang`) rồi đặt
   `.kx` vào trong. Dựng bố cục riêng cho khung xương thì hai bố cục lệch nhau, và lúc dữ
   liệu về trang nhảy một nhịp — đúng cái đang muốn tránh.
2. **Khung xương của nhịp sơn đầu tiên nằm thẳng trong `index.html`**, không dựng bằng JS:
   `app.js` nằm cuối trang và còn chờ `DOMContentLoaded`, nên dựng bằng JS thì người dùng
   vẫn thấy panel trắng trước đã.
3. **Hứa đúng thứ sắp hiện ra.** Trang Tổng quan biết danh sách base (`/api/hub`, ~100ms)
   trước khi biết số liệu (`/api/tongquan`, 2-5s), nên nó vẽ ngay tên base thật và chỉ để
   khung xương ở chỗ những con số. Khối video + bảng tin thì dựng theo trí nhớ
   (`localStorage['hub.tin.hinh']`): lần trước không có gì thì lần này không vẽ gì — khối
   xám hiện lên rồi biến mất còn tệ hơn là không hứa gì.

Sửa bản gốc xong **phải chạy `node dong-bo-khung.js`** (mỗi app con chạy độc lập được nên
chỉ phục vụ được file trong thư mục của chính nó — phải có một bản cho mỗi app).

### Chỗ nào có khung xương, chỗ nào vẫn là chữ

Có, ở mọi chỗ **một khối nội dung đang chờ dữ liệu**: trang Tổng quan (lưới base, dải nhiệt,
việc cần xử lý, bảng tin), màn Cài đặt (logo, video, tài khoản, phân quyền, thông báo, hộp
log), ba hộp thoại của lớp vỏ, màn khởi động của cả chín app con, và các màn nạp lại bên
trong chúng — đổi tab Social, đổi kỳ Báo cáo, tính lại KPI, Booking mới / Thống kê / Dữ liệu
Lark của OTA, danh sách hội thoại và điều khiển nền tảng của Quảng cáo, khung giờ + cấu hình
thông báo của Lịch, bình luận công việc và hộp Phân phối của Bảng công việc.

Không, và cố ý: **nhãn nút đang chạy** ("Đang ghi…", "Đang đồng bộ…"), **tiến trình tải tệp**
("Đang tải 2/5 — anh.png"), **ô gợi ý đang gõ** ("đang tìm…"). Mấy chỗ đó người dùng vừa bấm
xong nên đang nhìn đúng vào nó, và cái họ cần là *tiến độ*, không phải hình dạng của kết quả.
Riêng khối Bình luận của Social thì giữ **cả hai**: một câu nói rõ "gọi thẳng API nên hơi
lâu" đặt trên khung xương — vì nó lâu bất thường, im lặng ở đó là bị hiểu thành treo.

## Trang Tổng quan bấm được — một cú bấm tới đúng việc

Trang Tổng quan không chỉ để xem:

| Bấm vào | Kết quả |
|---|---|
| một dòng trong **Cần xử lý ngay** | mở app của base đó **và mở luôn ô chi tiết của đúng việc ấy** |
| một việc trong ô chi tiết của **dải nhiệt** | như trên |
| một **thẻ số** | mở app của base (thẻ "Cảnh báo" nhảy thẳng vào tab Cảnh báo) |

Cơ chế: lớp vỏ **không tự ghi dữ liệu**. Nó mở iframe của module rồi
`postMessage({hub:'open', rec})`; app con tự mở ô chi tiết bằng chính hàm của nó, nên
quy tắc nghiệp vụ / phân quyền vẫn chỉ có một nơi định nghĩa.

App con vừa mở còn đang nạp Base nên chưa tìm được bản ghi — vì thế vỏ **gửi lại mỗi giây,
tối đa 12 lần**, và dừng khi app báo `{hub:'opened'}`. Nếu app đã có dữ liệu mà vẫn không
thấy (ngoài phạm vi người đang xem), app trả `{hub:'khong-thay'}` và vỏ hiện toast.

Hai app cũng nhận **deep link** `?rec=recXXXX` (mở thẳng ô chi tiết khi tự nạp), dùng được
để dán link vào tin nhắn Lark:
`/m/cong-viec/?rec=recvqVeTFDbUWj` · `/m/lich-tac-nghiep/?rec=rec27fSSunVDrt`.

## Sáng / Tối — một công tắc cho cả hệ

Công tắc ba trạng thái ở đầu trang Tổng quan: **Sáng · Tối · Theo hệ thống**
(mặc định theo hệ thống, lựa chọn nhớ trong localStorage `hub.theme`).

Cách hoạt động — điểm quan trọng khi thêm base mới:

1. Lớp vỏ đặt `data-theme="sang" | "toi"` lên `<html>` của chính nó ("Theo hệ thống"
   thì bỏ hẳn thuộc tính, để CSS chạy theo `prefers-color-scheme`).
2. Mỗi lần đổi, vỏ `postMessage({hub:'theme', v})` xuống **mọi iframe module**; iframe mới
   nạp cũng được đẩy ngay khi `load` nên không nháy sai tone. Đoạn shim trong `proxy.js`
   nhận rồi đặt `data-theme` lên `<html>` của module.
3. CSS của vỏ **và cả ba app** đều theo cùng một quy ước:
   ```css
   :root[data-theme="toi"] { …token tối… }
   @media (prefers-color-scheme: dark) { :root:not([data-theme="sang"]) { …token tối… } }
   ```
   Hai khối cùng một danh sách — sửa thì sửa cả hai. Toàn bộ màu (kể cả **panel base**:
   sáng thì panel trắng, tối thì panel đen) đi qua token, không còn màu cứng trong component.
4. Biểu đồ SVG của app quảng cáo đọc màu khung bằng `getComputedStyle` (vì `var()` không
   giải được trong presentation attribute của SVG), nên app tự **vẽ lại** khi `data-theme`
   đổi — có `MutationObserver` theo dõi. Màu nền tảng (Facebook/TikTok/Google) cũng lấy từ
   token: TikTok đen tuyền sẽ tàng hình trên thẻ tối nên chế độ tối đổi sang xám sáng.

Thêm base mới muốn ăn theo công tắc: khai token của app theo đúng hai selector ở trên là xong,
không cần code thêm.

## Cửa sổ xử lý nhanh

Bấm một thẻ số (hoặc một dòng trong **Cần xử lý ngay**) → mở danh sách bản ghi
đứng sau con số đó, xử lý luôn tại chỗ rồi đóng lại. Không phải sang app tìm lại việc.

| Base | Làm được ngay |
|---|---|
| Bảng công việc | Phân công / đổi người · Đặt hoặc đổi hạn · Bắt đầu · Hoàn thành |
| Lịch tác nghiệp | Duyệt · Trả lại · Chốt nhân sự · Hoàn tất · Xác nhận đã thanh toán |
| Quản lý quảng cáo | chỉ đọc — cảnh báo là số tính ra từ nhiều dòng chi tiêu, không có bản ghi để sửa |

Ba điểm đáng chú ý khi đọc code:

- **Số và danh sách không thể lệch nhau.** `kpi.js` khi tính thẻ đã lưu luôn nhóm
  bản ghi đằng sau nó (`nhom`), `GET /api/o?mod=&khoa=` chỉ đọc lại nhóm đó từ
  cache — không có chỗ nào lọc lần thứ hai. Bộ kiểm thử so từng thẻ với danh sách
  nó mở ra, lệch một dòng là fail.
- **Hành động đi qua danh sách trắng.** `POST /api/viec` chỉ nhận vài hành động
  khai sẵn trong `goiHanhDong()` rồi dịch sang đúng API của module — hub không
  cho gọi tuỳ ý, và **module vẫn tự kiểm quyền lần nữa** (quản lý hay không, việc
  có phải của mình không, đã có minh chứng chưa). Lý do module từ chối được đưa
  nguyên văn lên thông báo, nên "Chưa có minh chứng kết quả" hiện đúng câu đó chứ
  không thành "HTTP 403".
- **Nút hiện theo trạng thái thật của dòng.** Việc chưa có người mới có "Phân
  công"; lịch đã đóng thì không còn "Chốt nhân sự"; nhân sự thường không thấy nút
  của quản lý. Xử lý xong: xoá cache của đúng base đó, nạp lại danh sách và số trên thẻ.

Một dòng lẻ mở bằng `khoa=rec:<recordId>` — hub tìm bản ghi trong các nhóm đã tính,
không gọi thêm module.

## Bộ lọc thời gian — mặc định THÁNG HIỆN TẠI

Trang Tổng quan chung có một thanh lọc áp cho **chỉ số của mọi base cùng lúc**:
`Tháng này` (mặc định) · `Tháng trước` · `Tuần này` · `7 ngày` · `30 ngày` · `Tuỳ chọn` · `Toàn bộ`.
Lựa chọn được nhớ trong máy (localStorage), bấm **Về mặc định** để quay lại tháng hiện tại.

Mỗi base hiểu "khoảng thời gian" theo trường ngày của nó — thanh lọc ghi rõ ngay trên UI:

| Base | Lọc theo |
|---|---|
| Bảng công việc | **Deadline** (việc không có deadline thì không khớp mốc nào — đúng như bộ lọc trong app) |
| Lịch tác nghiệp | **Thời gian bắt đầu** tác nghiệp |
| Quản lý quảng cáo | **Ngày chi tiêu** (hub truyền `from`/`to` xuống app, app tự cộng — một định nghĩa chỉ số duy nhất) |

### Thẻ số phải chỉ ra việc cần làm

Mỗi thẻ là **một hàng đợi quản lý**, không phải một con số mô tả:

| Base | Thẻ | Nghĩa |
|---|---|---|
| Bảng công việc | Quá hạn · Chưa phân công | phải xử lý ngay (đỏ) |
| Bảng công việc | Sắp tới hạn (48h) · **Chờ tiếp nhận** | sắp cháy / người nhận chưa xác nhận bắt tay làm (vàng). Dòng nhỏ của thẻ đếm luôn số việc chưa có deadline |
| Lịch tác nghiệp | Chờ duyệt | hàng đợi duyệt của quản lý |
| Lịch tác nghiệp | **Lịch có nguy cơ** | lịch đang có vấn đề — xem bảng dưới |
| Lịch tác nghiệp | Chưa chốt báo cáo | đã qua ngày mà chưa đóng |

### "Lịch có nguy cơ" gồm những gì

Mỗi lịch chỉ đếm một lần, lấy lý do nặng nhất (thứ tự dưới = ưu tiên); yêu cầu treo chỉ
tính khi lịch **còn sống** (chưa Đã hoàn tất / Từ chối / Hủy lịch):

| Mức | Lý do |
|---|---|
| đỏ | Bị trả lại (`Từ chối/Cần điều chỉnh`) mà chưa điều chỉnh |
| đỏ | Đã qua ngày tác nghiệp mà vẫn `Duyệt/Chờ tác nghiệp` — chưa báo cáo |
| đỏ | Còn ≤ 48h là tác nghiệp mà **chưa duyệt** |
| đỏ | Còn ≤ 48h mà **chưa có nhân sự** |
| vàng | Yêu cầu FOC / phòng Media **chưa được phản hồi** |
| vàng | `Đang báo cáo` bỏ dở quá 3 ngày |
| vàng | Đã hoàn tất, có chi phí thực tế mà **chưa thanh toán** |

Thêm luật hoặc sửa ngưỡng: hàm `lyDoNguyCo()` trong `kpi.js`. Lịch có nguy cơ cũng được
đẩy lên danh sách **Cần xử lý ngay** kèm lý do, và tính vào badge đỏ của base trên panel.

**Bộ lọc không được che việc gấp:** nếu vẫn còn việc quá hạn / lịch chờ duyệt hoặc có nguy cơ nằm ngoài
khoảng đang lọc, trang chủ hiện băng `Bộ lọc đang che N việc gấp` kèm nút **Xem toàn bộ**.

Ba app module cũng đã đổi **mặc định sang tháng hiện tại**:

| App | Chỗ đổi |
|---|---|
| Bảng công việc | cả 3 bộ lọc (Tổng quan · Việc của tôi · Kanban/Bảng) mở lên là `Thời gian: Tháng này`; nút "Xoá lọc" trả về tháng này. Hằng số `MAC_DINH_DUE` trong `public/app.js` |
| Lịch tác nghiệp | bộ lọc thời gian `Tháng này` (`S.f.period`); hàng đợi duyệt vẫn tính trên **toàn bộ** nên không bị che |
| Quản lý quảng cáo | thêm mốc `Tháng này` (ngày 1 → hôm nay hoặc ngày cuối có dữ liệu) và lấy làm mặc định |

Số trên hub khớp số trong app: "Quá hạn" tính theo **ngày** (hết hạn hôm nay chưa coi là trễ),
giống hệt cách app tính, không so từng giây.

## Tải nhân sự — ai làm gì ngày nào

Nằm ngay trong trang Tổng quan (không phải trang riêng), gộp việc của mọi base thành
**dải nhiệt nhân sự × ngày** để thấy ai đang bị dồn:

- **Dải nhiệt**: mỗi người một hàng, mỗi ngày một ô bo góc. Ô đậm dần theo số việc
  (xanh nhạt → xanh đậm), **từ 4 việc/ngày trở lên đổi đỏ và hiện luôn con số**.
  Ngày nào **có đi tác nghiệp** thì ô mang một **chấm nhỏ ở góc trên phải**
  (xanh lá trên ô nhạt, trắng trên ô đậm/đỏ) — dựa vào `module` của việc, đổi base
  nào là "đi tác nghiệp" ở hằng `MODULE_TAC_NGHIEP` trong `public/app.js`.
  Cột phải là thanh tổng để so tải giữa mọi người trong một cái nhìn; người bị dồn
  nhiều nhất xếp trên, hàng **Chưa phân công** ở cuối (chữ đỏ). Số đỏ cạnh tên là
  việc gấp/quá hạn. Trỏ vào ô để xem nhanh, bấm vào ô để mở danh sách việc của
  người đó trong ngày đó.
- **Theo ngày**: mỗi ngày một thẻ, liệt kê từng người kèm giờ và tên việc. Việc gấp
  viền đỏ, việc đã xong mờ đi, việc chỉ **hỗ trợ** viền nét đứt.
- Dùng chung bộ lọc thời gian của trang (mặc định tháng này). Chọn `Toàn bộ` thì dải
  nhiệt tự lấy tháng hiện tại vì lưới phải có biên; khoảng > 92 ngày bị API từ chối.

Một việc có nhiều người thì **đếm cho từng người** — đó mới là tải thật của họ, nên
`tổng lượt` thường lớn hơn `số việc`. Mỗi việc chỉ nằm ở một ngày: công việc lấy
**deadline**, lịch tác nghiệp lấy **ngày bắt đầu** (và tính cho *Nhân sự*; *Phụ trách*
chỉ tính khi chưa có nhân sự, nếu không quản lý bị cộng tải của mọi lịch).

Base mới muốn lên dải nhiệt thì thêm một hàm đọc trong `lichchung.js`, trả về
`{ ngay, gio, tieuDe, trangThai, muc, chinh: [người], hoTro: [người] }`, rồi khai
`kpi` trong `modules.json` như bình thường.

## Icon

Panel và tiêu đề khối dùng bộ **icon 2D nét mảnh** tự vẽ trong `public/icons.js`
(SVG 24×24, stroke 1.7, lấy màu từ `currentColor` nên đổi `mau` của base là icon đổi theo).
Không emoji, không thư viện ngoài. Icon có sẵn: `tong-quan` · `cong-viec` · `lich` ·
`quang-cao` · `nguoi` · `base` · `may` · `tien` · `them` · `cai-dat` · `gap`.
Khai tên icon ở `"icon"` trong `modules.json`; tên lạ thì hub in ra chính chuỗi đó,
nên vẫn dùng được kiểu chữ viết tắt cho base mới chưa có icon.

## Thứ tự app trong panel — mỗi người tự xếp

Thứ tự trong `modules.json` là thứ tự **lúc khai báo**, không liên quan gì tới
app nào hay dùng: app khai sau nằm cuối, kể cả khi ngày nào cũng mở nó.

Đổi chỗ bằng **kéo thả thẳng trên panel**, hoặc nút **↑ ↓** ở từng dòng trong
*Cài đặt → Base trong panel* (màn cảm ứng kéo rất khó, mà kéo thì không ai đoán
ra là kéo được nếu không thử). *Về thứ tự gốc* trả lại thứ tự tệp. Màn Cài đặt
không giải thích mấy câu này nữa — xem mục *Chữ trong Cài đặt* bên dưới.

Lưu ở **localStorage của từng trình duyệt**, không lưu lên máy chủ. Hai lý do:

- ổ đĩa Render là ổ **tạm** — ghi vào tệp thì deploy lần sau mất sạch (đã vấp
  đúng chuyện này với nút "mở cả phòng");
- thứ tự là **thói quen của từng người**. Người chạy quảng cáo muốn Quản lý
  quảng cáo lên đầu, người làm content muốn Bảng công việc lên đầu — ép chung
  một thứ tự là lấy đi của một trong hai.

Ba cái bẫy, đều im lặng, nên `test/thu-tu-app.test.js` chạy **chính đoạn mã của
`app.js`** (cắt khối thứ tự nạp vào `vm`) chứ không chép lại logic:

| Bẫy | Cách chặn |
|---|---|
| Khai app thứ mười, ai đã từng xếp panel thì **không bao giờ thấy nó** | thứ tự là danh sách **sắp xếp**, không phải bộ lọc — id lạ xuống cuối, id đã xoá rơi ra |
| Ẩn một app ở giữa rồi bấm ↓ thì app **nhảy hai bậc** | `doiChoApp` chỉ tính trên nhóm đang hiện; app ẩn vẫn giữ trong thứ tự lưu để bật lại là về đúng chỗ |
| Panel tự vẽ lại mỗi 10 giây → **đứt cú kéo** giữa chừng | `S.dangKeo` chặn `veRail()` trong lúc kéo |

Xếp một lần là mọi màn cùng theo: panel, trang Tổng quan và màn Cài đặt đều đọc
`S.modules`, mà mảng đó được xếp ngay tại cửa nhận dữ liệu (`napHub`).

## Thêm một base

**Cách 1 — trong app:** panel → `＋ Thêm base`. Ba kiểu:

| Kiểu | Khi nào dùng | Hub làm gì |
|---|---|---|
| `local` | app Node trên máy này (có `server.js`) | tự bật + proxy + nhúng |
| `ngoai` | app đã có URL riêng (Render, server nội bộ) | nhúng iframe thẳng URL đó |
| `lark` | chỉ cần mở nhanh Lark Base | mở tab mới (Lark chặn nhúng iframe) |

**Cách 2 — sửa `modules.json`** (đọc lại mỗi request, chỉ cần F5 trang; đổi cổng/thư mục
của module `local` thì phải khởi động lại hub):

```json
{
  "id": "chien-dich",
  "ten": "Theo dõi chiến dịch",
  "mo_ta": "Timeline · tiến độ",
  "icon": "📅",
  "mau": "#8b5cf6",
  "kieu": "local",
  "thuMuc": "../lark-campaign-tracker",
  "cong": 5177,
  "lenh": ["node", "server.js"],
  "larkUrl": "https://rootytrip2.sg.larksuite.com/base/...",
  "kpi": "",
  "an": ["header.topbar > .brand"],
  "phuSelector": "#subtitle",
  "bat": true,
  "caPhong": false
}
```

- `an` — selector của khối logo/tiêu đề riêng cần ẩn (vì panel đã thay).
- `phuSelector` — selector của dòng phụ đề động để panel hiển thị. Để trống thì panel dùng `mo_ta`.
- `bat: false` — giữ trong file nhưng ẩn khỏi panel.
- `caPhong: false` (mặc định, kể cả khi thiếu field) — base **kín**: chỉ quản lý và người
  được cấp tên trong bảng Phân quyền thấy. Đặt `true` là mở cho cả phòng. Xem mục dưới.

## Ai thấy base nào

Base mới thêm vào panel **luôn kín**. Dựng một base chưa xong mà cả phòng đã thấy nó trong
panel là chuyện đã xảy ra một lần — nên mở cho cả phòng bây giờ là một thao tác riêng
(`Cài đặt → Base trong panel → Mở cả phòng`), không phải hệ quả của việc thêm base.

Quyết định "người này thấy base nào" ghép từ hai nguồn:

| Nguồn | Ở đâu | Nói gì |
|---|---|---|
| `caPhong` của base | `modules.json` / Cài đặt | base này có phải base dùng chung của cả phòng |
| Ô "Base được xem" | bảng **Phân quyền app** trong Lark Base | người này được cấp thêm base nào |
| Ô "Quản lý base" | cùng bảng đó | base nào người này **quản trị** (xem được là hệ quả) |

Ô "Base được xem" có **ba** trạng thái, và đây là chỗ từng sai:

| Ô ghi | Nghĩa |
|---|---|
| `cong-viec,lich-tac-nghiep` | đúng những base đó (base thêm sau **không** tự có) |
| trống | không cấp base nào — chỉ còn các base `caPhong` và base mình quản trị |
| `*` | mọi base, kể cả base thêm sau này |

Trước đây ô trống bị hiểu là "tất cả", nên trong màn Phân quyền **bỏ tick hết base lại
thành mở hết** cho người đó, và ai chưa có dòng nào trong bảng thì thấy sạch mọi base —
kể cả base vừa dựng. Ba trạng thái giờ tách rời, `test/quyen-base.test.js` chốt lại luật này.

### Ô "Xem tải người khác" — cùng quy ước đó, cho bảng nhiệt

Nhân sự content cần biết editor và thiết kế đang bận gì để xếp việc. Cờ "Xem toàn bộ base"
làm được, nhưng nó còn được chuyển xuống app con qua header, tức là mở luôn **toàn bộ bản
ghi** của cả ba app — rộng hơn nhu cầu rất nhiều.

Nên có cột riêng, và nó **hẹp hai lần**: chỉ mở lưới bảng nhiệt ở trang Tổng quan (mở Bảng
công việc thì vẫn chỉ thấy việc của mình), và chỉ mở tải của **đúng những người được kê
tên**. Cột kiểu **Văn bản**, đọc bằng cùng một hàm với "Base được xem":

| Ô ghi | Nghĩa |
|---|---|
| trống | chỉ thấy tải của chính mình — **mặc định** |
| `ou_a,ou_b` | thấy thêm đúng hai người đó (tải của chính mình luôn thấy, không cần kê) |
| `*` | cả phòng, kể cả người vào sau |

Sửa ở màn **Phân quyền → sửa một người → Xem tải của ai**: một danh sách tick từng người,
có ô lọc theo tên, cộng một ô "Cả phòng".

Hai chuyện đã tính trước, ghi lại vì cả hai đều là loại lỗi im lặng:

- Cột này từng được hướng dẫn tạo kiểu **Checkbox**. Nếu Base còn trả boolean thì `true`
  được hiểu là `*` — đổi kiểu cột không làm mất quyền đã cấp cho ai.
- `nguoiKemQuyen()` dựng một object **mới** và liệt kê từng quyền một, nên quyền nào không
  được kê ở đó là rơi mất trên đường tới lưới: cột đã tick đúng người mà lưới vẫn chỉ hiện
  dòng của họ, không lỗi, không log. `test/xem-tai.test.js` soi cả đường đi này.

### Ba nấc vai, không phải hai

| Vai | Khai ở đâu | Được gì |
|---|---|---|
| Nhân sự | mặc định | việc của mình, trong những base được cấp |
| **Quản trị base** (Lead) | ô **Quản lý base** trong bảng Phân quyền | **quản lý bên trong đúng base đó**: mọi bản ghi, mọi số tiền, thao tác được hết. Base đó tự hiện trong panel dù đang Kín |
| Quản lý | `Vai = Quản lý`, hoặc `LARK_MANAGER_EMAILS` trên Render | mọi base + thêm/xoá base + phân quyền + Xem như + log app con |

Nấc giữa là để giao một app cho một Lead **mà không phải cho họ quyền quản lý toàn hệ** —
không thêm ai vào `LARK_MANAGER_EMAILS` (biến đó không có phạm vi, thêm là toàn quyền).
Ví dụ: ô `Quản lý base` = `ota` → trong app Booking OTA họ là quản lý; mở base khác vẫn là
nhân sự; ở lớp vỏ **không** thêm/xoá base, **không** sửa phân quyền, **không** Xem như,
**không** xem log app con, **không** mở/đóng base cho cả phòng.

Vai được tính **theo từng base ở từng request**: `laQLBase(q, mod)` trong `server.js`, rồi
`nguoiKemQuyen(nguoi, q, mod)` gắn vào header `x-hub-user-manager` mà proxy gửi xuống app
con. Vì vậy trang Tổng quan phải truyền **một hàm** `(mod) => danhTinh` xuống `kpi.tongQuan`,
không phải một danh tính dùng chung — cùng một người có thể là quản lý base này và nhân sự
base kia. Khoá cache chỉ số cũng gồm vai, nếu không thì đổi quyền xong vẫn trả bộ số vai cũ.

Còn hai đường luôn thắng theo hướng mở, cố ý để không ai tự khoá mình ra ngoài:

- `LARK_MANAGER_EMAILS` / `LARK_MANAGER_IDS` — vai quản lý, thấy mọi base.
- Đọc bảng phân quyền **thất bại** (token hết hạn, Base lỗi) — mở tạm mọi base thay vì
  khoá cả phòng. Khác hẳn "chưa khai dòng nào": chưa khai thì chỉ thấy base `caPhong`.

Kiểm tra nhanh mình đã cấp đúng chưa: màn Phân quyền → **Xem như** một người, cả app
chuyển sang đúng con mắt của họ (mọi thao tác ghi bị chặn trong lúc xem hộ).

## Video giới thiệu + bảng tin trên trang Tổng quan

Anh Hùng: *"bên trái sẽ là video anh phát, còn phần bên phải sẽ là những tin tức
mà anh đã thêm trong phần thông báo cho nhân sự"*.

Khối này đứng **trên mọi con số** của trang Tổng quan: video bên trái, tin bên
phải, màn hẹp hơn 900px thì xếp dọc. Không đẻ thêm chỗ nhập liệu nào — video đặt
ở *Cài đặt → Nhận diện thương hiệu*, tin lấy thẳng từ bảng Thông báo. Không có
video lẫn không có tin thì **không vẽ gì**: một cái khung rỗng giữa trang chủ
còn tệ hơn là không có.

Bảng tin khác popup chặn màn hình ở một điểm: **tin đã đọc vẫn còn**, chỉ nhạt
đi và mất nhãn "mới". Popup là để *bắt đọc*, bảng tin là để *tra lại* — bấm một
tin là mở ra **chỉ để đọc**: không băng "xem thử", không nút "Tôi đã đọc", chỉ
một nút Đóng. Họ đã bị popup bắt đọc một lần rồi, bắt xác nhận lần nữa là phiền
vô ích. Đường *Xem thử* của quản lý (từ Cài đặt) vẫn giữ nguyên băng cảnh báo và
nút xác nhận.

**Một dòng tin là một lưới cố định**, không phải hàng flex co theo nội dung —
mọi thành phần có chỗ của nó và đọc dọc xuống thì thẳng hàng:

```
[phân loại] [mới] ................ [ngày] │ [ảnh]
Tiêu đề — một dòng
Trích nội dung — một dòng
```

Bốn thứ giữ cho nó thẳng: chip phân loại có `min-width` (TIN / GẤP / QUAN TRỌNG
không xô nhau), ngày dùng `tabular-nums` trong ô rộng cố định, cột ảnh chừa sẵn
cho **mọi** dòng khi danh sách có ít nhất một ảnh (dòng không ảnh vẫn giữ ô
trống, nếu không mép chữ dòng này lệch dòng kia), và tiêu đề lẫn trích đều **cắt
ở một dòng** để mọi dòng cao bằng nhau. Đo được: 13 dòng đều cao 78px, tiêu đề
bắt đầu ở 586px, ngày ở 1294px, ảnh ở 1342px — không dòng nào lệch.

Cột không đếm số thông báo: con số đó không giúp ai quyết định gì mà lại chiếm
đúng chỗ dễ đọc nhất.

Khối chỉ vẽ **một lần** (`dataset.xong`): trang chủ tự vẽ lại mỗi 20 giây theo
nhịp số liệu, vẽ lại mà đụng vào thẻ `<video>` là video đang xem bị dựng lại từ
đầu.

Kích thước: cột video hẹp hơn cột tin, cả khối cao một khoảnh trên đầu trang,
không đẩy thẻ số liệu xuống ngoài tầm nhìn. Bề ngang cột video và chiều cao khối
là **một cặp 16:9** — `480/270`, `400/225` (≤1200px), `560/315` (≥1700px). Đổi
một số thì phải đổi số kia, nếu không video 16:9 lại bị cắt hai đầu.

`.tin-cot` và `.tin-ds` phải có `min-height: 0`: thiếu nó thì danh sách tin tự
nở theo nội dung thay vì cuộn, và mấy tin phía dưới bị cắt mà **không cuộn tới
được**.

**Video tự chạy, lặp mãi, mặc định CÓ tiếng** — nhưng thứ tự làm việc đó rất dễ
làm sai, và sai thì hỏng im lặng.

Trình duyệt **chỉ cho tự chạy khi video đang CÂM**. Bản đầu đọc lựa chọn "bật
tiếng" rồi bỏ câm ngay từ đầu, nên **máy nào đã từng bấm bật tiếng thì từ đó
video không bao giờ tự chạy nữa** — `play()` bị từ chối, video đứng ở khung hình
đầu, không báo gì. Đúng lỗi anh Hùng gặp.

Trình tự bắt buộc (`ganPhimTin`):

1. luôn mở ở trạng thái **câm** rồi `play()` — lượt này luôn được cho phép;
2. chờ **cú bấm đầu tiên** ở bất kỳ đâu trên trang rồi mới bỏ câm. Đừng thử bỏ
   câm sớm: gán `muted = false` khi chưa có cử chỉ thì Chrome **dừng luôn**
   video, và `play()` sau đó cũng bị từ chối — mở app lên thấy đứng hình mà nút
   lại báo có tiếng;
3. trang đã từng được bấm (quay về Tổng quan, đổi bộ lọc) thì mở tiếng **ngay**,
   không bắt bấm lại — cờ `DA_CO_CU_CHI` nhớ hộ;
4. nút loa **vẽ theo trạng thái thật** của thẻ video (kể cả nghe `volumechange`),
   không vẽ theo ý định. Vẽ theo ý định là ra đúng cái bẫy cũ: nút hiện 🔊 mà
   không có tiếng, bấm một cái thành 🔇, bấm cái nữa mới nghe được.

**Rời trang Tổng quan là câm và dừng** (mở một app con, hoặc chuyển tab trình
duyệt): video lúc đó nằm sau khung app con, không ai thấy, mà tiếng thì vẫn vang
lên giữa lúc người ta đang làm việc khác. Quay lại thì chạy tiếp, giữ nguyên
lựa chọn tiếng.

Khối này nằm **ngoài `#homeBody`**: trang Tổng quan vẽ lại theo nhịp số liệu
(20 giây/lần) và mỗi lần vẽ là thay sạch `#homeBody`. Để bên trong thì thẻ
`<video>` bị dựng lại, video quay về giây 0, tải lại từ đầu và mất luôn trạng
thái có tiếng.

"Chạy liên tục không dừng": `loop` lo phần lặp, còn ba đường hỏng thật của video
phát qua mạng thì mỗi đường một lối gọi lại — `stalled` (nghẽn luồng), `error`
(tải hỏng giữa chừng, nạp lại sau 10 giây), `visibilitychange` (tab ẩn rồi hiện
lại) — cộng một nhịp canh 5 giây làm lưới cuối, và `ended` tua về đầu phòng khi
`loop` hụt.

Không dùng `controls` — thanh điều khiển đen kịt dưới một video chạy nền trông
rất nặng, mà thứ người ta cần ở đây chỉ có đúng một cái: tiếng.

`test/video-tin.test.js` chạy chính hàm đó trong `vm` với một thẻ video giả, kể
cả cảnh **trình duyệt từ chối phát có tiếng**.

| | Video giới thiệu | Tệp đính kèm của thông báo |
|---|---|---|
| Chỗ lưu | ổ đĩa của hub (`du-lieu/video-tong-quan.*`), **và trong kho** | ô Đính kèm trên Base |
| Trần | 60 MB | 20 MB |
| Sống qua deploy? | có — vì tệp nằm trong kho | có |

### Vì sao video nằm trong kho

Cùng lý do với logo: **ổ đĩa Render là ổ tạm**, tệp tải lên qua Cài đặt mất sau
lần deploy kế tiếp. Ba đường đã cân, anh Hùng chọn đường thứ hai (15/09/2026):

| Đường | Được | Mất |
|---|---|---|
| Cắt clip < 20 MB rồi để trên Lark | sống mãi, không đụng kho | phải cắt/nén, và mỗi lượt xem phải kéo tệp từ Lark về |
| **Để trong kho** | sống qua mọi lần deploy, phát nhanh nhất (đọc thẳng ổ đĩa) | mỗi bản là một khối ~24 MB nằm lại trong lịch sử git **vĩnh viễn** |
| Tải lên lại sau mỗi deploy | không phải làm gì thêm | mỗi lần deploy là mất |

**Đổi video thì nhớ:** tải lên qua *Cài đặt → Nhận diện thương hiệu* chỉ đổi bản
đang chạy trên máy đó. Muốn bản mới sống qua deploy thì phải **commit tệp mới**
vào `du-lieu/`. Đổi vài lần là kho nặng thêm vài chục MB — đổi thường xuyên thì
nên chuyển sang đường Lark.

## Thông báo gửi kèm ảnh / tệp

Cột **Đính kèm** (`fldEwBAr6N`, kiểu attachment) trên bảng `Thông báo app`, tạo
ngày 15/09/2026.

Ô đính kèm của Base **không ghi được như ô thường** — phải đẩy tệp lên trước, lấy
token, rồi gắn token vào ô. Hai chế độ đi hai đường hẳn nhau (`base-lark.js`):

| | cli — máy cá nhân | api — bản deploy |
|---|---|---|
| Đẩy lên | `base +record-upload-attachment` | `drive/v1/medias/upload_all` (`parent_type` `bitable_file`) rồi ghi ô `[{file_token}]` |
| Tải về | `base +record-download-attachment` | bốn đường, dừng ở đường đầu tiên ra byte thật: `medias/{token}/download` → thêm `extra` bitablePerm → `batch_get_tmp_download_url` (± `extra`) → `url`/`tmp_url` có sẵn trong ô |
| Thử được ở máy cá nhân? | **có** | **không** — cần khoá app, mà khoá chỉ nằm trên Render |

Vì đường `api` không thử được ở máy cá nhân nên mọi lỗi ở đó được **dịch ra
việc phải làm**: `99991672` → "app chưa có scope `drive:drive`, thêm rồi phát
hành lại version"; `91403` → "app chưa được chia sẻ Base này".

Ba điều đã vấp và đã vá:

- **lark-cli chỉ nhận `--file` là đường dẫn tương đối nằm trong thư mục làm
  việc** ("unsafe file path" nếu trỏ ra ngoài), nên tệp tạm phải nằm dưới
  `.tmp/` của chính thư mục app, không dùng được `os.tmpdir()`.
- **Tên tệp đi qua header phải mã hoá base64**: tên tiếng Việt có dấu nhét thẳng
  vào header là Node ném `Invalid character in header`.
- **Ô trên Base hay để trống `type`**, nên lúc phát lại phải đoán kiểu theo đuôi
  tên — trả `application/octet-stream` cho một tấm PNG thì thẻ `<img>` của popup
  tuỳ trình duyệt mà hiện hay không.

Tệp **không** đi thẳng từ trình duyệt sang Lark mà đi qua lớp vỏ: khoá app không
ra khỏi máy chủ, chặn được cỡ tệp (10 MB) và ai được tải lên (chỉ quản lý), còn
người **nhận** thông báo xem được ảnh mà không cần quyền gì trên Base.

**Chọn tệp ngay lúc soạn.** Ô đính kèm của Base vẫn phải gắn vào một dòng đã
có, nên tệp nằm trong trình duyệt tới lúc bấm **Lưu**, rồi mới đẩy lên. Người
soạn thấy ảnh mình vừa chọn ngay lập tức (xem bằng chính tệp trên máy), không
chờ vòng mạng nào; bản trước bắt lưu xong mới mở lại được để đính — đúng về kỹ
thuật, sai về cách người ta làm việc.

**Ảnh nặng được nén ở trình duyệt** xuống quanh 1 MB trước khi gửi: hạ cạnh dài
về tối đa 1600px rồi giảm dần chất lượng. Đo thật: PNG 3000×2000 nặng **5,07 MB
→ 168 KB WEBP trong 264 ms**. Xuất WEBP chứ không JPEG vì WEBP giữ nền trong
suốt — logo PNG nền trong ép sang JPEG là nền đen. Không đụng vào: tệp không
phải ảnh, SVG (vector), GIF (nén thành ảnh tĩnh là mất cái người ta muốn gửi),
và ảnh vốn đã dưới 1 MB.

**Byte của tệp vừa tải lên được giữ lại trong RAM** (`demTep`, trần ~24 MB, bỏ
cái cũ nhất trước). Lúc tải lên thì lớp vỏ đang cầm byte trong tay, nên mọi lượt
xem ảnh sau đó lấy thẳng ở đó: nhanh hơn (đo được **12 ms** thay vì một vòng gọi
ra Lark), và **ảnh hiện được kể cả khi đường tải về của Lark từ chối** — đúng
chuyện đã xảy ra trên bản deploy: tải lên thì được, tải về thì không. Bộ đệm mất
sau mỗi lần deploy; lúc đó lại đi đường Lark. Nó là đường tắt, chỗ lưu thật vẫn
là ô đính kèm trên Base.

**Ảnh vẫn hỏng thì hiện THẲNG lý do**, không để lại khung ảnh vỡ cũng không bắt
bấm vào mới biết: thẻ `<img>` không nói được vì sao nó hỏng, nên lúc lỗi thì
giao diện hỏi lại chính đường dẫn đó để lấy câu lỗi của máy chủ và in ra đỏ ngay
tại dòng tệp.

Trong popup: **ảnh tràn hết bề ngang hộp và hiện trọn vẹn, không cắt** — kéo âm
đúng bằng padding của hộp (24px mỗi bên) để chạm mép, `width:100%; height:auto`.
Cắt ảnh thông báo không bao giờ là cái người gửi muốn: poster dọc 3:5 mà cắt
trên dưới là mất đúng phần nội dung.

Ảnh cao hơn màn hình thì **hộp tự cuộn trong nó** (`max-height: 92vh`), và hàng
nút **dính đáy** (`position: sticky`). Đây là popup *chặn* màn hình: nút "Tôi đã
đọc" mà trôi khỏi tầm nhìn vì một tấm ảnh dài thì người ta bị khoá lại giữa
chừng, không hiểu vì sao. Đo trên trình duyệt 1280×860 với poster 1000×2500:
ảnh ra 543×1360 (đúng tỉ lệ 2.5, không cắt), hộp cao 791px và cuộn được, hàng
nút vẫn nằm trong tầm nhìn.

**Video phát ngay trong popup**, tràn viền như ảnh, có thanh điều khiển. Không
tự chạy (`preload="metadata"`): thông báo bật lên giữa lúc người ta đang làm
việc, một đoạn phim tự kêu là chuyện khó chịu nhất có thể làm với người dùng —
chưa bấm thì chưa tốn mạng.

Muốn **tua** được thì máy chủ phải trả TỪNG ĐOẠN (HTTP Range) — không có thì
Chrome vẫn phát từ đầu nhưng kéo thanh thời gian là đứng im, trông y như hỏng.
`traTep()` trả `206` + `Content-Range` và nói rõ `Accept-Ranges: bytes`, nếu
không trình duyệt còn chẳng buồn hỏi.

Trần **20 MB** một tệp: vừa một clip ngắn, và cũng là trần của một lượt tải lên
Lark (tệp to hơn phải cắt khúc — việc khác hẳn, chưa làm). Video **không nén
được ở trình duyệt** (phải có bộ mã hoá, nặng gấp mấy lần cả app này) nên quá
trần thì app nói thẳng đường vòng: cắt ngắn clip, hoặc để clip trên Drive rồi
gắn link ở *Nút hành động*.

Tệp khác thành một dòng bấm để tải.

## Chữ trong Cài đặt — chỉ giữ chữ báo tình trạng

Anh Hùng: *"các cái note nhỏ nhỏ trong cài đặt anh thấy không cần nữa"*. Mỗi mục
trước đây có một câu giải thích dưới tiêu đề, mỗi hàng thiết lập có một câu dưới
nhãn. Đọc lần đầu thì hiểu ra; đọc lần thứ hai mươi thì chỉ là chữ chắn đường
tới cái nút.

Luật giữ lại, viết ra đây vì lần sau thêm màn mới rất dễ quên:

| Bỏ | Giữ |
|---|---|
| Câu mô tả dưới tiêu đề mỗi mục (`cdTieuDe` giờ chỉ nhận **tên**) | Cảnh báo đỏ / vàng: thiếu cột, chưa có bảng, chưa khớp được người, đang dùng bản lưu |
| Câu giải thích dưới nhãn từng hàng thiết lập | Câu báo lỗi: "Không đọc được: …" |
| Ghi chú dưới từng ô của form soạn thông báo | Dòng trạng thái: `hub tự bật · cổng nội bộ 5173`, `9 người trong nhóm Phòng MKT`, tên tệp logo, số bản đang chạy |
| Đuôi `— bỏ tick là…` trên ô tick | Đuôi mang **con số**, ví dụ `— 9 người trong nhóm Phòng MKT` |

Ranh giới là: **chữ chỉ hiện khi có chuyện thì giữ**, chữ nào lúc nào cũng hiện
và chỉ để dạy cách dùng thì bỏ. Cửa sổ *Thêm base* không nằm trong đợt dọn này —
nó là form khai báo hiếm dùng, chỗ duy nhất mà hướng dẫn còn đáng tiền.

## Thông báo chặn màn hình

Chỗ để quản lý nói một câu mà cả phòng **buộc phải đọc**: popup che toàn bộ app
— kể cả iframe của app con — và **không có đường thoát nào ngoài nút "Tôi đã
đọc"**. Không dấu X, không Escape, không bấm ra ngoài. Cố ý: nó sinh ra để chặn.

Soạn ở **Cài đặt → Thông báo tới nhân sự** (chỉ quản lý). Mỗi thông báo chọn
riêng ba thứ:

| Thiết lập | Nghĩa |
|---|---|
| **Mức độ** | Tin / Quan trọng / Gấp — đổi màu vạch trên hộp và thứ tự hiện. **Không** đổi mức chặn: cái nào cũng chặn. |
| **Nút hành động** + **Liên kết** | Bỏ trống cả hai = thông báo *chỉ cần đọc*. Điền vào là có thêm chỗ để ấn. Link bắt đầu bằng `#` mở trong hub **sau khi** xác nhận; còn lại mở tab mới. |
| **Buộc bấm nút** | Chưa bấm nút đó thì nút "Tôi đã đọc" còn khoá. |
| **Khoảng hiển thị** | Từ ngày – đến ngày. Ngoài khoảng thì không hiện, khỏi phải nhớ vào tắt. "Đến ngày" tính **hết** ngày đó. |
| **Gửi cho** | Cả phòng (`*`), hoặc tick từng người — cùng quy ước với ô "Base được xem". |

### "Gửi cho" mở ra là đã tick sẵn nhóm Phòng MKT

Danh bạ hub gom người từ **mọi app**, nên trong đó có cả Điều hành, kế toán, các
phòng khác — 37 người, trong khi phòng Marketing có 10. Soạn thông báo nội bộ mà
phải tự dò 10 cái tên trong 37 dòng thì lần nào cũng sót một người.

Nên thông báo **mới** mở ra đã tick sẵn đúng những người trong nhóm chat
**Phòng MKT**.

Và **"Cả phòng" nghĩa là danh sách bên dưới**, không còn là dấu sao. Trước đây
tick ô đó lưu người nhận là `*` = *mọi người trong danh bạ*, tức là thông báo
nội bộ của phòng bay sang Điều hành, kế toán, phòng khác — mà không màn hình nào
cho thấy chuyện đó. Giờ nó là công tắc **tick hết / bỏ hết** đúng nhóm phòng, và
lưu ra **danh sách tên cụ thể**: ai nhận được thì nhìn thấy trên màn hình. Bỏ
tick một người thì ô "Cả phòng" tự tắt theo. Sửa một thông báo cũ còn lưu `*`
thì form nói trước: bấm Lưu là nó đổi thành đúng những người đang tick.

Và danh sách **chỉ hiện nhóm phòng**, không đổ cả 37 người ra. Tick sẵn thôi
chưa đủ: 27 dòng ngoài phòng vẫn che mất 10 dòng cần nhìn, vẫn phải cuộn hết mới
biết mình đang gửi cho ai. Gõ tên vào ô trên thì tìm trong **toàn bộ** danh bạ —
đúng câu "muốn tìm kiếm thêm anh sẽ tự search". Ai **đã tick** thì luôn hiện, kể
cả người ngoài phòng: giấu một người đã chọn đi là để họ nhận thông báo mà mình
không thấy tên trên màn hình. Nút **Tick lại đúng nhóm Phòng MKT** trả về đúng
nhóm nếu lỡ tay.

**Sửa** một thông báo cũ thì không đụng vào danh sách đã lưu — đó là quyết định
của lần soạn đó, tự ý tick thêm là gửi cho người không định gửi.

Nguồn danh sách là **nhóm chat**, không khai tay trong mã: nhóm chat mới là nơi
người vào/người nghỉ được cập nhật thật. `nhom-lark.js` đi ba đường, theo thứ tự:

1. Hỏi Lark — máy cá nhân qua phiên `lark-cli`, bản deploy qua token app.
2. Hỏng thì lấy **bản lưu** `du-lieu/nhom-mkt.json` (chỉ tên, có trong kho nên
   bản deploy dùng được ngay ngày đầu). Panel nói rõ đang dùng bản lưu ngày nào.
3. Hỏng cả hai thì quay về mặc định cũ "Cả phòng", **kèm lý do** hiện trên form.

Đường 1 có thể hỏng ở bản deploy: `im:chat.members:read` và **người gọi phải ở
trong nhóm** — app Marketing Hub chưa được thêm vào nhóm thì Lark từ chối. Đó là
lý do có đường 2, và là việc phải làm nếu muốn danh sách luôn tươi trên Render.

Khớp theo `open_id` trước, **lùi về tên** khi id lệch — id cấp theo từng app nên
id đọc ở máy cá nhân khác id của bản deploy cho cùng một người. Trùng tên thì
**không tick bừa**, mà báo ra để tự tick. Người ở trong nhóm mà hub chưa thấy ở
app nào (chưa dùng app nào bao giờ) thì **không có ô để tick** — form nói thẳng
tên họ ra, vì im lặng bỏ sót một người là lỗi không ai phát hiện được.

| Biến môi trường | Mặc định | Nghĩa |
|---|---|---|
| `HUB_NHOM_MKT` | `oc_246eff4a…0465` | nhóm chat dùng làm "phòng MKT" |
| `HUB_NHOM_MKT_TEN` | `Phòng MKT` | tên hiện trên form |

Một lúc chỉ hiện **một** thông báo, Gấp trước. Dồn năm cái vào một màn hình thì
người ta cuộn qua rồi bấm cho xong, đúng cái cần tránh.

Xác nhận được ghi kèm **thời điểm**, nên trang Cài đặt trả lời được câu quan
trọng nhất: *ai chưa đọc*. Bấm lần hai không đổi thời điểm đã ghi — đó là bằng
chứng, đổi được thì hết là bằng chứng.

### Bảng trên Base

Lưu trên Base chứ không phải file: ổ đĩa Render là tạm, mất file nghĩa là mất cả
danh sách **ai đã đọc** — cả phòng bị chặn lại bởi một thông báo họ đã xác nhận
tuần trước.

Bảng **đã tạo sẵn**: `Thông báo app` (`tblcJnEvbMfHgNgn`) trong cùng Base với bảng
Phân quyền, và table id khai mặc định trong `thongbao-app.js` — không cần đặt
biến môi trường nào. `HUB_TB_TABLE` chỉ để ghi đè khi muốn trỏ sang bảng khác.
Các cột:

| Cột | Kiểu |
|---|---|
| Tiêu đề | Văn bản |
| Nội dung | Văn bản (nhiều dòng) |
| Mức độ | Lựa chọn: `Tin` · `Quan trọng` · `Gấp` |
| Nút hành động | Văn bản |
| Liên kết | Văn bản |
| Buộc bấm nút | Checkbox |
| Từ ngày · Đến ngày | Ngày |
| Người nhận | Văn bản (`*` hoặc các open_id cách nhau bằng dấu phẩy) |
| Bật | Checkbox |
| Đã đọc | Văn bản (`open_id@thời-điểm`, app tự ghi) |

Thiếu cột nào thì trang Cài đặt nói thẳng ra tên cột đó, và cảnh báo rằng thiết
lập tương ứng **không có tác dụng** — thay vì âm thầm bỏ qua ô khi ghi.

### Xem thử trước khi gửi

Nút **Xem thử** (trong danh sách và ngay trong form soạn) mở đúng popup mà nhân
sự sẽ thấy, kèm băng vàng nói rõ đang xem thử. Bấm gì ở đó cũng **không ghi xác
nhận của ai**, và Escape đóng được — khác hẳn bản thật.

Cần nút này vì bản thật không xem trước được: máy cá nhân (chế độ `cli`) không
nhận thông báo (xem dưới), còn trên bản deploy thì quản lý chỉ thấy thông báo
gửi cho chính mình. Không có nó thì cách duy nhất để biết popup trông ra sao là
gửi thật cho cả phòng.

### Ai đã xem, ai chưa

Mỗi dòng thông báo có thanh tiến độ + `3/37 đã đọc · còn 34`, và nút **Ai đã xem**
mở hai danh sách đầy đủ: **Chưa xem** (xếp theo tên, để dò bằng mắt rồi đi nhắc)
và **Đã xem** kèm **giờ đọc**. Giờ quan trọng hơn nó trông: "đọc lúc 23:14 hôm
qua" và "8:02 sáng nay" là hai câu chuyện khác nhau khi có việc.

Bản đầu chỉ có mấy con số cộng tám cái tên cắt ngang — con số nói *có bao nhiêu*,
mà câu hỏi của quản lý là *những ai*.

Gửi "cả phòng" thì người nhận suy ra từ **danh bạ**, nên màn hình nói rõ chỗ đó:
con số là ước lượng theo danh bạ, không phải tuyệt đối.

### KHÔNG soạn thông báo ở máy cá nhân

`open_id` cấp theo **từng app Lark**. Máy cá nhân đọc danh bạ qua phiên
`lark-cli`, bản deploy đọc qua app Marketing Hub — hai bên ra **hai chuỗi khác
nhau cho cùng một người**. Đo được trên Base thật: cùng anh Hùng, bản deploy cho
`ou_5c7965c6…`, máy cá nhân cho `ou_f0d3514a…`.

Hậu quả là loại im lặng nhất của cả tính năng này: tick đúng tên, lưu thành công,
**không ai nhận được gì**. Không lỗi, không dấu hiệu.

Không vá được ở tầng này — không có đường đổi `open_id` vùng này sang vùng kia
khi người đó không tồn tại trên máy đang chạy. Nên panel **cảnh báo hai lần**:
một băng đỏ trên đầu trang, và một dòng ngay tại khối "Gửi cho". Dấu hiệu nhận
ra khi đã lỡ: trong "Ai đã xem", người đọc hiện thành `ou_…` kèm chữ *không có
trong danh bạ bản này*.

Xem thử và xem "ai đã xem" ở máy cá nhân thì vẫn đúng — chỉ việc **chọn người
nhận** là không được.

### Máy cá nhân không bị chặn

Chế độ `cli` cố ý không có danh tính phiên. Nên một thông báo "cả phòng" vẫn qua
được luật hiển thị, mà đường xác nhận lại đòi id từ phiên và trả 401: **popup
hiện lên và không bao giờ đóng được**, khoá luôn hub trên máy của chính người
gửi. Đã đo được đúng thế, nên `/api/tb-app` trả danh sách rỗng khi `mode !== 'api'`.

Chặn ở đó thay vì nới đường xác nhận: máy cá nhân là máy của quản lý — người
gửi — không có lý gì chặn họ bằng câu họ vừa viết.

### Mấy chỗ đã tính trước

- **Chặn vĩnh viễn.** Bật "buộc bấm" mà không điền nút thì nút "Tôi đã đọc" chờ
  một cái nút không tồn tại — người nhận không thoát được. Chặn ngay lúc lưu.
- **Xác nhận hộ người khác.** Người xác nhận lấy từ **phiên**, không nhận từ
  client. Và đang **Xem như** thì không trả thông báo, cũng không cho xác nhận:
  quản lý soát giao diện nhân sự mà bấm "Tôi đã đọc" là ký hộ họ.
- **Nội dung của người khác.** Danh sách gửi xuống máy nhân sự chỉ chứa thông
  báo của chính họ, và **không** kèm danh sách người nhận hay ai đã đọc — cắt ở
  máy chủ, không ẩn bằng CSS.
- **Hai người xác nhận cùng lúc.** "Đã đọc" nằm trong một ô nên đường ghi là
  đọc–sửa–ghi; `xacNhan()` đọc lại bỏ qua bộ đệm ngay trước khi ghi. Khe hở còn
  một nhịp gọi API, và nếu lỡ mất thì tự lành: popup hiện lại, bấm lần nữa.
  Phòng đông lên thì đổi sang bảng-thứ-hai (một dòng một người).
- **Va chạm tên.** Các tệp trong `public/` là `<script>` thường nên dùng **chung
  một phạm vi toàn cục**: khai `const` cùng tên ở hai tệp là SyntaxError và tệp
  nạp sau **chết hoàn toàn** — trên màn hình chỉ là "tính năng không chạy".
  Đã gặp đúng lỗi này lúc dựng (`ngayTb` ở cả `caidat.js` và `tbapp.js`), nên
  `test/tb-app.test.js` canh luôn cả chuyện đó. Tiền tố class cũng vậy: `tb-*`
  đã thuộc về bảng chuông thông báo, lớp phủ này dùng `bb-*`.

## Thẻ base trên trang Tổng quan — tách bằng khoảng trắng, không kẻ ô

Anh Hùng (15/09/2026): *"phần bên dưới, nói thật đến hiện tại anh vẫn chưa thể
hài lòng được, anh muốn đẹp hơn"*. Ba thứ đổi, và chúng đi cùng nhau:

- **Bỏ kẻ ô.** Bản trước vẽ đường kẻ bằng một vòng 1px quanh từng ô. Hàng cuối
  thiếu ô thì vòng của mấy ô xung quanh quây lấy chỗ trống thành một **hộp rỗng
  có viền** — nhìn như thẻ dựng dở (thấy rõ ở Lịch tác nghiệp và Chỉnh ảnh). Giờ
  tách bằng khoảng trắng: chỗ trống thì trống hẳn.
- **Nền màu chỉ dành cho ô cần chú ý.** Trước đây ô nào cũng có khung nên màu
  chìm đi; giờ mọi ô trong suốt, liếc một cái là thấy chỗ đang có chuyện.
- **Thẻ cùng hàng cao bằng nhau** (`align-items: stretch`) để mép dưới thành một
  đường thẳng, và dòng *"Không có…"* bị đẩy xuống đáy (`margin-top: auto`) làm
  chân thẻ. **Phải đi cùng nhau** — chỉ lấy vế đầu thì thẻ ngắn hở một mảng
  trắng rỗng, đúng cái xấu mà bản cũ tránh.

**Mọi ô cùng một đệm, kể cả ô có nền.** Đệm chia hai: lưới giữ 2px, mỗi ô giữ
10px — cộng lại đúng 14px như mọi khối khác. Chia thế để ô cần chú ý tô nền rộng
ra quanh chữ mà **không phải kéo lề âm**. Kéo lề âm là cái bẫy vừa vấp: ô có nền
bị nhấc lên 8px so với ô thường bên cạnh, nhãn của cả hàng không nằm trên một
đường — lệch 8px thôi mà mắt bắt được ngay. Khe ngang 8px, đủ để hai mảng màu
cạnh nhau không dính thành một.

Ô chính to hơn (30px) và có đường kẻ chân, nên "base này đang thế nào" đọc được
trước khi mắt chạm tới mấy con số phụ. `test/phan-cap-o.test.js` chốt cả ba luật
mới này; luật cũ vẫn còn trong lịch sử git kèm lý do vì sao đổi.

## Ba base cuối cùng cũng có số

Tới 15/09/2026 vẫn còn ba base — **Báo cáo & KPI**, **Quỹ chi phí**, **Báo cáo
công việc** — hiện đúng một câu trên trang Tổng quan: *"Base này chưa có bộ đọc
chỉ số… khai `kpi` trong modules.json"*. Một câu viết cho người sửa mã, nằm giữa
màn hình của người dùng.

Mỗi app tự mở `/api/tong-quan` trả sẵn mảng `the`, hub chỉ bày ra (`tuAppTuCong`
trong `kpi.js`) — định nghĩa chỉ số nằm **trong app**, vì app mới biết "chờ
quyết toán" hay "nộp bù" nghĩa là gì.

| Base | Ô chính | Ô cảnh báo |
|---|---|---|
| Báo cáo & KPI | Đạt mục tiêu (%) tháng gần nhất **có số** | chưa chấm xong · cảnh báo số liệu · chưa chốt |
| Quỹ chi phí | Còn trong quỹ | chờ chi · chờ quyết toán |
| Báo cáo công việc | Phiếu đã nộp | nộp trễ · nộp bù · cần hỗ trợ |

Ba điều đã cân nhắc, ghi lại kẻo lần sau làm ngược:

- **KPI lấy tháng gần nhất CÓ SỐ, không lấy tháng mới nhất.** Tháng mới thường
  mới dựng khung, chưa dán số liệu — thẻ sẽ toàn số 0 và người đọc tưởng app hỏng.
- **`tong` của KPI là TỈ LỆ so với mục tiêu** (0,91 = đạt 91%), không phải điểm
  trên thang 10. Đưa thẳng 0,91 lên thẻ là người đọc tưởng điểm kém.
- **Không chặn theo vai ở `/api/tong-quan`.** Nhân sự cũng thấy thẻ trên trang
  Tổng quan — chỉ là thấy số của chính mình (app lọc sẵn). Trả 403 thì thẻ của
  nhân sự chỉ còn câu báo lỗi.

Đo thật qua hub (đổi cổng bằng `HUB_MODULES_FILE` để trỏ vào ba bản vừa sửa):
"Chi trong kỳ" lọc đúng tháng 9 ra 3.025.744đ / 7 khoản trong khi tổng từ đầu
quỹ là 59.080.875đ.

## Thẻ chỉ số cho base mới

Thêm một hàm trong `kpi.js` rồi khai tên hàm vào `kpi` của module:

```js
async function chienDich(mod) {
  const d = await goiJson(mod, '/api/meta');       // gọi API của chính module
  return {
    the: [{ nhan: 'Chiến dịch đang chạy', so: 12, dinhDang: 'so', muc: 'ok' }],
    canXuLy: [{ muc: 'cao', tieuDe: '…', phu: '…', the: ['…'] }],
  };
}
```

- `dinhDang`: `so` | `vnd` | `pt` (phần trăm) | `x` (ROAS).
- `muc`: `cao` (đỏ) | `vua` (vàng) | `ok`. Thẻ `cao` cộng vào badge đỏ trên panel.
- `lech` + `dao: true` — hiện % so kỳ trước, `dao` để "giảm là tốt" (CPA).
- `canXuLy` được trộn vào danh sách "Cần xử lý ngay" của trang chủ, sắp theo mức.

Bộ đọc hiện có: `cong-viec`, `lich-tac-nghiep`, `quang-cao`.

## Kiểm thử

```bash
node test/chay-het.js      # tất cả các bộ, cộng tổng
node test/api.test.js      # chỉ bộ tích hợp
```

**603 phép thử trên 16 bộ, chỉ đọc** — không ghi gì lên Lark Base. Kiểm tra: lớp vỏ, proxy
từng module (chèn shim, viết lại đường dẫn, API xuyên proxy), hình dạng dữ liệu Tổng quan
chung, bộ lọc thời gian (thu hẹp đúng, tham số sai không làm sập), lưới lịch chung (tổng ô
khớp tổng lượt, thứ tự dồn việc, chặn khoảng quá rộng), nén, đệm chỉ số, log module, và
vài chốt an toàn. Module chưa chạy thì phần của nó ghi "bỏ qua", không tính lỗi.

Hai phép thử đáng nhắc riêng, vì chúng canh loại lỗi **không báo gì cả**:

- `nen.test.js` — *"giải nén ra khớp TỪNG BYTE với bản thô"*. Nén sai một byte thì
  `app.js` hỏng trên máy người dùng, mà máy chủ không hề báo lỗi.
- `tu-vung.test.js` nhóm 6 — dấu vết **backslash bị shell ăn mất** trong regex.
  `(\d+)` thành `(d+)` vẫn là biểu thức HỢP LỆ, chỉ là không bao giờ khớp; `[^\p{L}\p{N}]`
  thành `[^p{L}p{N}]` thì tệ hơn — nó khớp SAI. Mười mẫu dịch và cả đường lùi bóc emoji
  đã chết lặng theo đúng hai kiểu này. Xem mục *"Bẫy `node -e`"* ở cuối file.

## Đưa lên chạy chung (Lark admin)

Hiện tại mọi module chạy chế độ `cli` — dùng **phiên `lark-cli` của máy đang chạy**, nên
đúng cho mô hình "mỗi người một bản trên máy mình".

Khi deploy một bản chung cho cả phòng, cần hai việc:

1. **Danh tính từng người.** App `lark-task-manager` đã có chế độ `api`
   (`LARK_APP_ID` + `LARK_APP_SECRET` + `PUBLIC_URL` + `SESSION_SECRET`) để mỗi người đăng nhập
   Lark riêng — xem `lark-task-manager/docs/trien-khai-server.md`. Hai app còn lại vẫn `cli`,
   nghĩa là ai mở cũng thấy dữ liệu dưới một tài khoản. Chạy chung mà chưa chuyển `api`
   thì phân quyền quản lý/nhân sự trong app không còn ý nghĩa.
2. **Một URL công khai.** Chỉ cần trỏ URL đó vào hub (cổng 5180); các module nằm sau proxy
   trên `127.0.0.1`, **không cần mở cổng riêng ra ngoài**. Trong Lark Developer Console khai
   Web app = URL của hub. Cookie phiên đã được hub tách theo `Path=/m/<id>/` nên các module
   không đè phiên của nhau.

Quyền trong Developer Console (Collaborators, Availability) chỉ quyết định **ai mở được app
trong Lark**, không liên quan tới vai quản lý/nhân sự bên trong từng app.

## Bản đồ file

| File | Việc |
|---|---|
| `server.js` | HTTP: trang vỏ, API, định tuyến `/m/<id>/`, tự bật module khi khởi động |
| `config.js` | cổng, timeout, đọc/ghi `modules.json` |
| `modules.json` | **danh sách base** — sửa ở đây là thêm/bớt base |
| `children.js` | bật/tắt/bật lại tiến trình module, log, health check 10s |
| `proxy.js` | proxy ngược + chèn CSS/JS vào HTML module + `goiJson()` |
| `nen.js` | nén gzip/brotli cho MỌI đường ra — kể cả phần proxy vào chín app con |
| `kpi.js` | bộ đọc chỉ số cho Tổng quan chung (một hàm / một base) |
| `lichchung.js` | gộp việc mọi base thành dải nhiệt nhân sự × ngày (khối Tải nhân sự) |
| `bot.js` | nguồn số liệu chỉ-đọc cho trợ lý hỏi đáp (`/bot/*`) — xem `docs/tro-ly-bot.md` |
| `gio-vn.js` | **giờ Việt Nam cho cả lớp vỏ** — Render chạy UTC, đừng dùng `getHours()`/`toLocaleString` |
| `base-lark.js` | **lớp gọi Lark Base dùng chung** — `bang(baseToken, tableId)` cho api/cli; mọi bảng của hub đi qua đây |
| `quyen.js` | bảng Phân quyền: ai thấy base nào, ai quản trị base nào |
| `thongbao-app.js` | bảng Thông báo chặn màn hình: ai nhận, còn hiệu lực không, ai đã đọc |
| `nhom-lark.js` | thành viên nhóm chat Phòng MKT — để form soạn thông báo tick sẵn đúng phòng |
| `public/khung-xuong.css` · `khung-xuong.js` | **khung xương** dùng chung: hình dạng chờ dữ liệu cho lớp vỏ và chín app con |
| `dong-bo-khung.js` | chép `khung-xuong.css` sang chín app con — chạy sau mỗi lần sửa bản gốc |
| `test/khung-xuong.test.js` | canh khung xương: đúng thứ tự nạp, đúng bản, và không màn nào rơi lại về vùng trắng |
| `public/index.html` · `styles.css` · `app.js` · `icons.js` | panel base, sân khấu iframe, trang Tổng quan chung, modal Cài đặt / Thêm base / Log |
| `test/api.test.js` | kiểm thử chỉ đọc |
| `test/bot.test.js` | kiểm thử lớp `/bot`: token, chỉ GET, và **không một đồng nào lọt ra** |
| `test/tb-app.test.js` | thông báo chặn màn hình: ai bị chặn, chặn tới khi nào, và canh va chạm tên giữa các tệp `public/` |
| `test/nhom-mkt.test.js` | khớp nhóm chat vào danh bạ: tick thiếu và tick thừa đều im lặng nên phải thử |
| `test/tep-dinh-kem.test.js` | đọc ô đính kèm của Base, tên tệp tiếng Việt qua header, và ba cửa tệp đều sau tường đăng nhập |
| `test/thu-tu-app.test.js` | thứ tự app do người dùng xếp: chạy chính khối mã của app.js trong vm |
| `test/nen.test.js` | nén: thương lượng `Accept-Encoding`, SSE không bị nén, và **giải ra khớp từng byte** |
| `test/dem-kpi.test.js` | đệm chỉ số: gộp lượt đang bay, trả số cũ rồi đọc lại, có trần, đời của đệm |

## Trợ lý hỏi đáp (bot)

Bot **không học** dữ liệu của phòng — nó **tra** lúc được hỏi, qua một bộ endpoint
chỉ-đọc `/bot/*`. Bộ não (Coze, Claude, n8n…) nằm ngoài và thay được; lớp dữ liệu
giữ nguyên.

Chưa khai `BOT_API_TOKEN` thì nhánh đó trả 404 như không tồn tại. Đường này **không
có dữ liệu tiền** — lý do và cách nới đúng: `docs/tro-ly-bot.md`.

```
curl -H "Authorization: Bearer <TOKEN>" "<URL>/bot/lich?tu=tuan-nay"
```

## Gỡ rối

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Panel báo module **Lỗi** | mở `⚙ Cài đặt → Log` xem stdout/stderr thật của app đó |
| Bấm **Bật lại** không có tác dụng | app đang chạy bằng `start.bat` riêng — đóng cửa sổ đó rồi bấm lại |
| Module trắng trang, API 502 | app chưa kịp sẵn sàng (đang nạp Base) — chờ vài giây rồi F5 |
| Thêm base `local` mà không lên | thư mục phải có `server.js` và app phải đọc biến `PORT` |
| Số ở Tổng quan lệch với trong app | hub cache 20s (`HUB_KPI_MS`); bấm `⟳ Làm mới` để đọc lại ngay. Cũng kiểm tra hai bên đang cùng khoảng thời gian |
| Trang chủ trông "sạch" bất thường | bộ lọc đang là tháng này — xem băng vàng "đang che N việc gấp", hoặc chọn `Toàn bộ` |
| Hai app tranh nhau một cổng | mỗi module `local` phải một cổng riêng (test có kiểm tra việc này) |
| Sửa `public/*.js` xong mà trình duyệt vẫn chạy bản cũ | số bản (`?v=`) tính **một lần lúc khởi động** — restart hub |
| Chế độ English mà một mảng giao diện vẫn tiếng Việt | khoá dịch còn thiếu, hoặc một mẫu regex **rộng hơn** đứng trước đã nuốt mất câu đó. Xem *Bẫy `node -e`* ngay dưới |

## Bẫy `node -e` — backslash bị ăn mất

Viết code qua `node -e "..."` trong Git Bash làm **rơi mất một lớp backslash**. Đã trả
giá ba lần cho đúng chuyện này, và hai lần thì không ai biết trong nhiều tháng:

| Viết đúng | Sau khi shell ăn | Chuyện xảy ra |
|---|---|---|
| `(\d+)` | `(d+)` | Vẫn là regex **hợp lệ** (khớp chữ "d" lặp lại) → không nổ, chỉ không bao giờ khớp. Mười mẫu dịch của màn Phân quyền chết lặng. |
| `[^\p{L}\p{N}]` | `[^p{L}p{N}]` | Tệ hơn: nó khớp **SAI**. `"🟡 Trung bình"` bị cắt thành `["🟡 Trung bìn", "h"]`. Cả đường lùi bóc emoji chết, mọi select có emoji dẫn đầu thôi dịch. |
| `` `code` `` trong README | *(mất sạch)* | Backtick bị shell coi là command substitution. |

**Luật:** file nào có regex, backtick hay `$$` thì sửa bằng công cụ ghi file, **không**
dùng `node -e`. Nếu buộc phải, splice theo **số dòng** chứ đừng so khớp chuỗi dài.

`test/tu-vung.test.js` nhóm 6 canh sẵn cả hai dấu vết trên, và kiểm bằng **hành vi**
(bóc thử emoji ra khỏi một nhãn thật) chứ không chỉ bằng hình dạng chuỗi.
