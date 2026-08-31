# Quản lý quảng cáo đa nền tảng — Rooty Trip

App web chạy local, đọc/ghi **trực tiếp** vào Lark Base
[Quản lý Quảng cáo TikTok & Facebook](https://rootytrip2.sg.larksuite.com/base/WmWvbjjFQaiRmjsd3Z7lumQXgeb).
Không có dependency npm, không cần build.

## Chạy

```bash
node server.js
```

Rồi mở http://localhost:5176 — hoặc bấm đúp `start.bat` (tự mở trình duyệt).

Yêu cầu duy nhất: đã đăng nhập `lark-cli` bằng tài khoản có quyền vào Base
(`lark-cli auth status` để kiểm tra, `lark-cli auth login` nếu chưa).

Đổi cổng: `PORT=5180 node server.js`

## 10 tab

| Tab | Dùng để làm gì |
|---|---|
| 📈 **Tổng quan** | 6 KPI có so sánh kỳ trước, chi tiêu theo ngày × nền tảng (kèm đường CPA), tỉ trọng chi tiêu, CPA theo chiến dịch, top/bottom quảng cáo, cảnh báo nổi bật |
| 🌐 **Nền tảng** | So sánh Facebook / TikTok / Google Ads trên cùng khoảng thời gian: CPA, CTR, CPC, CPM, % chi tiêu, % chuyển đổi, CPA so với mục tiêu |
| 🎯 **Chiến dịch** | Điểm sức khoẻ, % ngân sách đã dùng, chi tiêu hôm nay vs ngân sách/ngày, xu hướng so kỳ trước. Bấm tên để mở chi tiết và **sửa ghi vào Base** |
| 🧩 **Nhóm quảng cáo** | So sánh tệp đối tượng / vị trí hiển thị / cách tối ưu |
| 🖼️ **Quảng cáo** | Xếp hạng từng quảng cáo + cột **Khuyến nghị** (Tăng ngân sách / Giữ nguyên / Tối ưu / Tắt) kèm lý do |
| ⌨️ **Nhập số hằng ngày** | Bảng nhập nhanh 1 ngày × tất cả quảng cáo. Có số của ngày trước để đối chiếu và nút chép |
| 🗂️ **Dữ liệu theo ngày** | Toàn bộ dòng thô, sửa/xoá từng dòng, xuất CSV |
| 🔔 **Cảnh báo** | Ngân sách · lịch chạy · thiếu số liệu · hiệu suất · lệch cấu hình · biến động |
| 💰 **Doanh thu & ROAS** | Ghép chi tiêu ads với bảng *Báo cáo Sales (theo ngày)* → ROAS, chi phí/đơn |
| 🔌 **Kết nối & Đồng bộ** | Lấy số tự động từ Meta / TikTok / Google Ads, nhập CSV, ghép ID nền tảng — xem phần cuối |

## Nguyên tắc tính số

**App không dùng cột formula/rollup của Lark để tính tổng.** Mọi chỉ số được cộng
lại từ dòng thô của bảng *Hiệu suất theo ngày*, join qua link
`Quảng cáo → Nhóm → Chiến dịch`. Lý do:

- Formula trong Base chỉ tính **cả kỳ** hoặc **hôm nay** → không lọc được khoảng ngày.
- Base này có bẫy trùng tên cột link với tên bảng, từng làm rollup cộng sai toàn bộ.

Một hàm `agg()` duy nhất trong `metrics.js` định nghĩa CTR / CPC / CPM / CPA / CVR / ROAS
cho mọi bảng, biểu đồ và cảnh báo — không có chỗ nào tự tính lại.

Đã đối chiếu: tổng toàn kỳ **37.938.928đ** và từng chiến dịch khớp đúng cột
`Tổng chi thực tế` của Base.

## Mục tiêu & ngưỡng

Nút **🎯 Mục tiêu** trên thanh trên, lưu vào `muc-tieu.json` (không ghi vào Base):

| Khoá | Ý nghĩa |
|---|---|
| `cpa.default` / `cpa.Facebook` / `cpa.TikTok` / `cpa.Google Ads` | CPA mục tiêu — quyết định màu CPA, cột Khuyến nghị, điểm sức khoẻ |
| `ctrMin`, `cvrMin` | Ngưỡng CTR / tỉ lệ chuyển đổi tối thiểu |
| `minSpendJudge` | Chi tiêu tối thiểu mới kết luận tốt/xấu (mặc định 300.000đ) |
| `budgetWarnPct` | % ngân sách bắt đầu cảnh báo cam (80) |
| `dataLagDays` | Cho phép trễ nhập liệu bao nhiêu ngày trước khi báo "Thiếu số liệu" |
| `spendSpikePct` | % tăng so với trung bình 7 ngày thì coi là đột biến |

## Nhập số hằng ngày

Tab **Nhập số** giải quyết đúng chỗ khó của Base này: form Lark không hỗ trợ cột
Link nên không nhập được từ điện thoại, phải gõ tay ở grid.

- Mỗi dòng = 1 quảng cáo; ô nào **đã có** dòng cho (quảng cáo × ngày) thì
  **UPDATE**, chưa có thì **CREATE** → không sinh dòng trùng.
- Để trống cả 4 chỉ số ⇒ bỏ qua, không tạo bản ghi rỗng.
- Cột **Ngày trước** hiện chi tiêu / chuyển đổi / CPA hôm trước để đối chiếu,
  nút `⤒ chép` copy sang dòng đang nhập.
- Bàn phím: `Enter` xuống ô cùng cột dòng dưới, `Tab` sang ô kế.
- Chỉ dòng nào có sửa mới được gửi lên Base.

**Ngày lưu vào Base** được ghi bằng 00:00 giờ Singapore (đúng như dữ liệu cũ), nên
cột `Ngày (khóa)` của Base luôn ra đúng ngày lịch.

## API

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/api/meta` | Tài khoản, danh mục chiến dịch/nhóm/quảng cáo, option select, mục tiêu |
| GET | `/api/overview` | KPI + kỳ trước + series + stack + nền tảng + chiến dịch + top/worst + cảnh báo |
| GET | `/api/campaigns` `/api/groups` `/api/ads` `/api/daily` | Bảng theo từng cấp |
| GET | `/api/entry?date=` | Ma trận nhập liệu 1 ngày |
| POST | `/api/entry` | `{date, rows:[{adId, spend, impressions, clicks, conversions, label}]}` — upsert |
| PATCH | `/api/campaign/:id` `/api/group/:id` `/api/ad/:id` `/api/daily/:id` | Ghi vào Base |
| DELETE | `/api/daily/:id` | Xoá 1 dòng hiệu suất |
| GET/PUT | `/api/targets` | Mục tiêu & ngưỡng |
| POST | `/api/refresh` | Bỏ cache, nạp lại từ Base |
| GET | `/api/export.csv` | Xuất dữ liệu ngày đã lọc |

Bộ lọc dùng chung cho các endpoint GET: `from`, `to` (hoặc `days`), `platform`,
`campaign`, `group`, `ad` (nhiều giá trị cách nhau bằng dấu phẩy).

## Kiểm thử

```bash
node test/api.test.js
```

35 kiểm tra đọc (đã pass). Vòng ghi (`test/write.test.js`) tạo → đọc lại → cập nhật →
patch → xoá trên Base thật rồi tự dọn sạch; chỉ chạy khi cần vì có ghi thật.

## Cấu trúc

```
config.js    toạ độ Base + toàn bộ field ID (đọc/ghi bằng ID, không theo tên cột)
lark.js      gọi lark-cli, retry lỗi tạm thời 1254291/rate-limit/timeout
store.js     nạp 7 bảng, chuẩn hoá cell, dựng cây CD → nhóm → QC → ngày, cache 60s
metrics.js   agg(), lọc, series, sức khoẻ, khuyến nghị, cảnh báo, ma trận nhập
server.js    HTTP thuần + router API + static
public/      index.html · styles.css · charts.js (SVG tự vẽ) · app.js · ketnoi.js
sync/        ketnoi.js (đọc token) · http.js · meta.js · tiktok.js · gsheet.js
             csv.js (đọc CSV Việt/Anh) · reconcile.js (đối chiếu vào Base) · index.js
ket-noi.js   trình cài kết nối, chạy một lần
dong-bo.js   đồng bộ từ dòng lệnh, cho Task Scheduler
cai-tac-vu.bat / xoa-tac-vu.bat / dong-bo-nen.bat   chạy nền bằng Task Scheduler
docs/        google-ads-script.js — dán vào Google Ads
```

## Lưu ý về Base

- 2 dòng ngày 26/08 **chưa gắn quảng cáo** (24.273đ) — app tách riêng và cảnh báo;
  sửa bằng tab *Dữ liệu theo ngày* → nút Sửa → chọn quảng cáo.
- Bảng *Báo cáo Sales (theo ngày)* đang trống → tab Doanh thu chưa có số. Sales nhập
  vào là ROAS tự hiện.
- Tuyệt đối **không** dùng `lark-cli base +form-questions-delete` trên base này —
  nó xoá luôn cột và dữ liệu.

---

# Đồng bộ tự động từ nền tảng quảng cáo

Thay vì gõ tay hằng ngày, app tự lấy số từ Meta / TikTok / Google Ads và ghi vào Base.

## Vì sao không có "thời gian thực"

Số liệu quảng cáo **không chốt ngay**: chi tiêu chạy dần trong ngày, còn chuyển đổi bị
các nền tảng **khai báo lại tới 7 ngày sau** (Meta mặc định cửa sổ attribution 7 ngày
sau click). Đồng bộ kiểu "ghi 1 lần rồi thôi" sẽ khiến số trong Base vĩnh viễn thấp hơn
Ads Manager.

Nên app **luôn ghi lại N ngày gần nhất** (mặc định 7), mỗi 3 giờ. Khoá ghi là
(quảng cáo × ngày) nên chạy lại bao nhiêu lần cũng chỉ cập nhật, không nhân dòng.

## Ba kênh, ba cách

| Kênh | Cơ chế | Cần chuẩn bị | Thời gian |
|---|---|---|---|
| **Facebook / Meta** | Marketing API `act_X/insights` level=ad, `time_increment=1` | System User token + ID tài khoản | ~30 phút, token không hết hạn |
| **Google Ads** | **Không dùng API.** Google Ads Script hẹn giờ ghi ra Google Sheet, app tải CSV của Sheet | Dán script + xuất bản Sheet dạng CSV | ~20 phút, **không phải xin duyệt** |
| **TikTok** | Marketing API `report/integrated/get` | Tạo app + chờ TikTok duyệt | vài ngày chờ |

Meta thường **không cần App Review** vì chỉ đọc tài khoản do Business Manager của mình
sở hữu. Google Ads cố tình đi đường Script để khỏi phải xin developer token (chờ cả tuần).

App gọi ra ngoài từ máy anh nên **không cần domain public, không cần mở port**.

## Cài đặt: điền ngay trong app (cách nhanh nhất)

Mở tab **Kết nối & Đồng bộ** → mỗi thẻ nền tảng có nút **Điền thông tin** → dán token,
mã tài khoản → **Lưu cấu hình** → **Kiểm tra kết nối**. App tự tạo `ket-noi.json` hộ,
không phải sửa file tay và không cần dòng lệnh — đây là đường duy nhất dùng được khi app
chạy trên Render.

Ba tiện ích trong biểu mẫu:

- **Dò tài khoản** (Facebook · Google Ads): hỏi thẳng nền tảng xem token này với tới
  những tài khoản nào, tick rồi điền hộ vào ô mã tài khoản.
- **Lấy link uỷ quyền** (Google Ads): lấy refresh token mà không cần chạy dòng lệnh.
  Bấm nút → đồng ý ở trang Google → trình duyệt nhảy tới `127.0.0.1:47123` và báo không
  kết nối được (bình thường) → copy nguyên URL trên thanh địa chỉ, dán vào ô bên dưới.
- **Xoá token đã lưu**: gỡ token và tắt kênh.

Quy tắc của biểu mẫu: token **đi vào được, không bao giờ đi ra** — giao diện chỉ hiện
"đã lưu / chưa có", không bao giờ hiện lại giá trị. Vì thế **ô bí mật để trống = giữ
nguyên cái đang lưu**, sửa chỉ số hay mã tài khoản không làm mất token.

> Trên Render ổ đĩa là tạm: token điền ở đây sống tới lần deploy kế tiếp rồi mất. Muốn
> giữ lâu dài thì dán nội dung `ket-noi.json` vào biến môi trường `ADS_CONNECT_JSON`.
> App tự hiện cảnh báo này khi chạy trên Render.

## Cài đặt: chạy trình cài một lần (trên máy cá nhân)

```bash
node ket-noi.js
```

Trình cài làm thay những việc dễ sai nhất:

- nhận token qua **nhập ẩn** (không hiện ký tự, không vào lịch sử lệnh)
- kiểm tra ngay token còn sống và có đủ quyền `ads_read` chưa
- **tự tìm danh sách tài khoản quảng cáo** — không phải đi tra ID ở Ads Manager
- **tự quét các loại chuyển đổi thật trong 14 ngày** rồi đề xuất đúng chỉ số, kèm CPA
  ước tính để đối chiếu với Ads Manager
- ghi `ket-noi.json`, bật kênh, chỉ ra bước tiếp theo

Chỉ cài một kênh: `node ket-noi.js --meta` (hoặc `--google`, `--tiktok`).

Muốn token không đi qua bàn phím thì đặt biến môi trường `LARK_META_TOKEN` /
`LARK_TIKTOK_TOKEN` trước khi chạy.

Sau đó để nó tự chạy mãi, không cần mở app — bấm đúp **`cai-tac-vu.bat`**
(đăng ký tác vụ Windows chạy mỗi 3 giờ, ghi log vào `dong-bo.log`).
Bỏ tác vụ: **`xoa-tac-vu.bat`**.

## Cài bằng tay (nếu không dùng trình cài)

### 1. Tạo file cấu hình

```bash
copy ket-noi.mau.json ket-noi.json
```

Mở `ket-noi.json`, điền token. File này đã được `.gitignore` và **token không bao giờ
hiện ra giao diện, không ghi vào Base, không ghi vào log** (kể cả log lỗi — mọi
`access_token=` trong thông báo lỗi đều bị che thành `***`).

### 2. Facebook / Meta

1. Business Manager → **Cài đặt doanh nghiệp** → **Người dùng hệ thống** → tạo system user.
2. Gán tài sản: tài khoản quảng cáo, quyền **Xem hiệu suất**.
3. **Tạo mã truy cập mới**, tick quyền `ads_read`. Copy token.
4. Điền `meta.accessToken`, `meta.accountIds` (ID tài khoản ở Ads Manager), `enabled: true`.

Chỉ số chuyển đổi mặc định là `onsite_conversion.messaging_conversation_started_7d`
(đúng cho chiến dịch **Tin nhắn/Lead** — 5/6 chiến dịch hiện tại của anh). Nếu lấy
`conversions` chung thì CPA sẽ lệch vài lần. Sau lần đồng bộ đầu, mục
**"Các loại chuyển đổi Meta thực có trong kỳ"** trong báo cáo liệt kê mọi `action_type`
có số thật để anh chọn lại cho đúng.

### 3. Google Ads

1. Tạo Google Sheet trống, copy ID từ URL.
2. Mở `docs/google-ads-script.js`, sửa `SHEET_ID`.
3. Google Ads → **Công cụ** → **Tập lệnh** → dán toàn bộ file → Cho phép → Chạy một lần.
4. Đặt tần suất **Mỗi giờ**.
5. Sheet → **Tệp → Chia sẻ → Xuất bản lên web** → chọn sheet `DuLieu`, định dạng **.csv** → copy link.
6. Điền `googleSheet.csvUrl`, `enabled: true`.

Mặc định script xuất ở **cấp nhóm quảng cáo** vì quảng cáo tìm kiếm của Google không có
tên; xuất cấp quảng cáo sẽ ra một rừng dòng chỉ có ID.

### 4. TikTok

Tạo app ở business-api.tiktok.com, chờ duyệt, uỷ quyền advertiser account, lấy access
token dài hạn → điền `tiktok.accessToken` và `tiktok.advertiserIds`.

### 5. Kiểm tra

Tab **🔌 Kết nối & Đồng bộ** → **Kiểm tra kết nối**. Kênh nào OK sẽ hiện tên tài khoản,
tiền tệ, múi giờ.

## Lần đồng bộ đầu tiên: ghép ID trước đã

Base đã có 6 chiến dịch / 7 nhóm / 13 quảng cáo anh khai tay. Nếu đồng bộ mà khớp theo
tên một cách hồn nhiên thì sẽ **nhân đôi dữ liệu**, vì Base này có tên trùng thật:
2 chiến dịch cùng tên `Daily_Tour Đảo` (Facebook và TikTok), 3 quảng cáo cùng tên
`IS_Giá chưa tới 1 củ` ở các nhóm khác nhau.

Cách app xử lý — theo thứ tự, và **chỉ nhận khi khớp duy nhất**:

1. Khớp theo **ID nền tảng** đã lưu ở cột `⚙️ ID …` — chắc chắn nhất.
2. Khớp theo **tên nhưng có giới hạn phạm vi**: chiến dịch khớp trong cùng nền tảng,
   nhóm trong cùng chiến dịch, quảng cáo trong cùng nhóm (rồi mới tới cùng chiến dịch).
   Có 2 ứng viên trở lên ⇒ coi là mơ hồ, **không đoán**.
3. Còn lại: báo ra bảng "Chưa ghép được" để anh dán ID vào đúng bản ghi.

Khớp được theo tên thì app **ghi luôn ID nền tảng vào Base**, nên từ lần thứ hai trở đi
mọi thứ khớp theo ID.

**Quy trình nên làm:**

1. Để `tuTaoMoi = false` (mặc định).
2. Bấm **Xem trước** — không ghi gì, chỉ báo sẽ khớp/tạo/đổi những gì.
3. Đối tượng nào "chưa ghép được" thì dán ID nền tảng vào bảng **🔗 Ghép ID nền tảng**.
4. Bấm **Đồng bộ** thật.
5. Khi đã yên tâm, bật `tuTaoMoi` để quảng cáo mới trên nền tảng tự vào Base.

## Chốt an toàn

- **Xem trước** (`dryRun`) không ghi một byte nào vào Base.
- Một ID nền tảng **không thể** gắn vào hai bản ghi (chặn ở API, HTTP 409).
- Nếu hai đối tượng nền tảng cùng đòi gắn ID vào một bản ghi Base, app **bỏ cả hai** và
  báo ra thay vì để cái sau đè cái trước.
- App **không bao giờ xoá** dòng nào. Dòng có trong Base mà nền tảng không báo được liệt
  kê riêng ("Có trong Base nhưng nền tảng không báo") để anh tự kiểm.
- Nhiều dòng nền tảng gộp về một bản ghi (cấp nhóm, CSV) thì **cộng lại**, không ghi đè.
- Cột `⚙️ Nguồn` ghi rõ mỗi dòng đến từ đâu: Nhập tay / Meta API / TikTok API / Google Ads / CSV.
- `ghiDeNhapTay = false` thì số nhập tay được giữ nguyên, đồng bộ chỉ thêm dòng mới.

## Nhập CSV — dùng được ngay, không cần token

Tab **Kết nối & Đồng bộ** → **Nhập từ file CSV**. Export báo cáo từ Ads Manager, chọn
nền tảng, kéo file vào.

App tự nhận cột theo tên **tiếng Việt hoặc tiếng Anh** (`Số tiền đã chi tiêu (VND)`,
`Amount spent`, `Cost`, `Cuộc hội thoại qua tin nhắn đã bắt đầu`, `Results`…), tự nhận
dấu phân cách (`,` `;` tab), tự nhận số kiểu Việt `1.234.567,89` lẫn kiểu Anh
`1,234,567.89`, tự bỏ các dòng tiêu đề rác mà Meta/Google chèn ở đầu file. Báo cáo hiện
rõ **cột nào được nhận ra, cột nào bỏ qua** để anh kiểm trước khi ghi.

Dùng chung y nguyên tầng đối chiếu với API, nên khi có token rồi thì mọi thứ đã quen.

## Chạy nền bằng Task Scheduler

Hẹn giờ trong app chỉ chạy khi app đang mở. Muốn chạy nền:

```bash
node dong-bo.js
```

Các tuỳ chọn:

```bash
node dong-bo.js --kiem-tra
```

```bash
node dong-bo.js --xem-truoc --ngay 14
```

```bash
node dong-bo.js --kenh meta --tu 2026-08-01 --den 2026-08-27
```

Tạo tác vụ trong **Task Scheduler**: Action = `node`, Arguments = `dong-bo.js`,
Start in = `C:\Users\ASUS\.agents\lark-ads-manager`, Trigger = mỗi 3 giờ.

## Kiểm thử tầng đồng bộ

```bash
node test/sync.test.js
```

72 kiểm tra: đọc số/ngày kiểu Việt–Anh, nhận cột, tách CSV có ngoặc kép lồng, che token
trong log lỗi, chuẩn hoá link Sheet, chọn đúng `action_type` của Meta, và đối chiếu
dry-run trên Base thật (khớp đúng bản ghi cũ, không nhân đôi, cộng đúng khi gộp, chặn
ID trùng). Không ghi gì vào Base.

## Google Ads: hai đường, chọn một

| | Google Ads (API) | Google Ads (qua Google Sheet) |
|---|---|---|
| Khối cấu hình | `googleAds` | `googleSheet` |
| Cần gì | OAuth client + refresh token + **developer token** (Google duyệt) + ID tài khoản | một Google Sheet + Google Ads Script + link CSV |
| Cấp chi tiết | tới từng quảng cáo (`ad_group_ad`) | theo cấp khai trong script (mặc định nhóm) |
| Chờ duyệt | có — developer token mức Test không đọc được tài khoản thật | không |
| Lấy cấu hình | `node ket-noi.js --google-api` | `node ket-noi.js --google` |

**Chỉ nên bật một đường.** Bật cả hai thì cùng một ngày có hai nguồn ghi vào Base,
số chi phí đếm hai lần.

### Các bước cho đường API

1. Google Cloud Console → **Credentials** → Create OAuth client ID → loại
   **Desktop app**. Thêm `http://127.0.0.1:47123` vào *Authorized redirect URIs*.
2. Google Ads → **Công cụ → API Center** → xin developer token. Token mới ở mức
   *Test* chỉ đọc được tài khoản test; muốn đọc tài khoản thật phải xin **Basic
   Access** (Google duyệt, thường vài ngày).
3. Chạy `node ket-noi.js --google-api` — công cụ mở link đồng ý của Google, tự nhận
   code qua `127.0.0.1:47123`, đổi thành refresh token rồi thử đọc tài khoản luôn.
4. Trên Render: copy toàn bộ `ket-noi.json` vào biến môi trường `ADS_CONNECT_JSON`.
   Ổ đĩa của Render là tạm, file sẽ mất sau mỗi lần deploy.

Refresh token của Google không hết hạn (trừ khi bị thu hồi hoặc đổi mật khẩu), nên
không phải lấy lại định kỳ như token Meta.
