# Social — số liệu các kênh mạng xã hội (Rooty Trip)

Kéo số liệu **tự nhiên (organic)** của TikTok · Facebook Page · Instagram · Zalo OA
từ API về Lark Base, rồi xem ở một màn hình. Quảng cáo trả tiền không thuộc app này —
đó là việc của `lark-ads-manager`.

- Chạy: `node server.js` (hoặc `start.bat`) → http://localhost:5178
- Không có dependency npm nào.
- Base: **Social — Rooty Trip** · `YzgUbMS3PaE0B9sDtdIlNYzFgsc`
- Trong Marketing Hub: panel trái → **Social**

---

## 1. API nào cho được gì — đọc trước khi mong đợi

Đây là bảng quan trọng nhất trong tài liệu này. Nó nói thẳng chỗ nào máy lấy được,
chỗ nào người phải gõ, để không ai ngồi chờ số không bao giờ về.

| Chỉ số | Facebook | Instagram | TikTok (display) | TikTok (business) | Zalo OA |
|---|---|---|---|---|---|
| Follower hiện tại | ✅ | ✅ | ✅ | ✅ | ✅ |
| Follower tăng/giảm **theo ngày** | ✅ | ✅ | ➖ tính gián tiếp | ✅ | ❌ chốt từng lượt chạy |
| Lượt xem theo ngày | ✅ | ✅ | ➖ tính chênh lệch | ✅ | ➖ tính chênh lệch |
| Lượt tiếp cận | ✅ | ✅ | ❌ | ✅ | ❌ |
| Lượt xem trang / hồ sơ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Từng bài: xem/thích/bình luận/chia sẻ | ✅ | ✅ | ✅ | ✅ | ⚠️ tuỳ gói |
| Tỷ lệ xem hết video, thời gian xem TB | ➖ chỉ thời gian xem | ➖ chỉ Reels | ❌ | ✅ | ❌ |
| **LIVE** (xem / bình luận / follow mới) | ✅ **có API** | ❌ | ❌ | ❌ | ❌ |
| Tin nhắn / hội thoại | ❌ | ➖ replies | ❌ | ❌ | ✅ |

✅ máy lấy được · ➖ lấy được nhưng gián tiếp · ⚠️ tuỳ gói dịch vụ · ❌ phải nhập tay

**Ba điều đáng nhớ:**

1. **TikTok không mở API cho LIVE.** Không có endpoint nào cho lượt xem / bình luận /
   follow mới của một buổi phát. Dùng tab LIVE → *Dán bảng LIVE*: xuất báo cáo từ
   TikTok LIVE Center rồi dán vào, app đọc cột theo tên nên xuất bản nào cũng nhận.
   Facebook thì ngược lại — LIVE có API thật, số tự về.
2. **Douyin và Xiaohongshu** không mở API cho tài khoản ngoài Trung Quốc → tab
   *Nhập tay*, mỗi tháng gõ một lần.
3. **Zalo mở API hẹp.** Follower và hội thoại thì chắc chắn có; lượt xem bài viết
   tuỳ gói dịch vụ của OA. Không có thì app để 0 và ghi cảnh báo chứ không đoán.

---

## 2. "Lượt xem hôm nay" được tính thế nào

Câu hỏi này quyết định số có đúng hay không, nên nói rõ.

**Facebook, Instagram, TikTok business** trả sẵn chuỗi theo ngày → app chép thẳng.

**TikTok display và Zalo** thì không: chúng chỉ trả **tổng đời** của từng bài. Cộng
thẳng vào một ngày là sai — video đăng tháng trước có 1 triệu view sẽ đội hết vào
hôm nay, và tháng nào cũng thế.

App so bản vừa lấy với bản đã lưu trong bảng *Bài đăng*, lấy phần **tăng thêm**:

| Tình huống | Tính vào ngày hôm nay |
|---|---|
| Bài đã có trong Base | phần tăng so với lần trước |
| Bài mới, đăng **trong** kỳ | trọn số hiện tại |
| Bài mới, đăng **trước** kỳ | **0** — không có mốc so sánh thì thà thiếu còn hơn bịa |
| Nền tảng đếm lùi (Meta hay chỉnh giảm) | 0, không ra số âm |

Hệ quả cần biết: **lần đồng bộ đầu tiên, các kênh TikTok display và Zalo sẽ ra 0**
cho phần lượt xem. Từ lần thứ hai trở đi mới có số. Đó là đúng, không phải lỗi.

`chenhLech()` trong `sync/index.js` và các phép thử trong `test/chuanhoa.test.js`.

---

## 3. Nối từng nền tảng

Mọi thứ làm trong giao diện: nút **Kết nối** ở góc trên phải (chỉ quản lý thấy).

### Facebook Page + Instagram — một token cho cả hai

1. `business.facebook.com/settings` → **Người dùng** → **Người dùng hệ thống** → Thêm
   (vai trò Employee access).
2. Chọn user đó → **Thêm tài sản** → **Trang** → tick các Page của Rooty Trip →
   bật quyền xem thông tin chi tiết.
3. **Tạo mã truy cập mới** → chọn app → tick `pages_read_engagement`, `pages_show_list`,
   `read_insights`. Muốn lấy cả LIVE thì thêm `pages_manage_metadata`.
4. Copy token **ngay** (Meta chỉ hiện một lần) → dán vào ô *Token gốc* →
   bấm **Liệt kê Page từ token** → tick trang → **Lưu các trang đã tick**.

App tự lấy page token của từng trang và **tự phát hiện tài khoản Instagram** gắn
với trang đó — không phải đi tìm IG user ID.

Nên dùng System User token vì loại đó **không hết hạn**. Token cá nhân sống ~60 ngày,
tới ngày là đồng bộ chết lặng lẽ; nút *Thử kết nối* có báo số ngày còn lại.

### TikTok — mỗi kênh cấp quyền một lần

1. `developers.tiktok.com` → tạo app → lấy **Client key** + **Client secret**.
2. Xin phạm vi: `user.info.basic`, `user.info.stats`, `video.list`.
   Muốn chế độ **business** (nhiều chỉ số hơn hẳn: tiếp cận, xem hồ sơ, follower theo
   ngày, tỷ lệ xem hết) thì tài khoản phải là TikTok Business và app phải được duyệt
   thêm phạm vi tương ứng.
3. **Từng kênh** tự bấm đồng ý một lần → lấy `refresh token` của kênh đó → thêm một
   dòng trong ô TikTok (tên kênh · open_id · chế độ · refresh token).

Sáu kênh trong bảng KPI = sáu dòng, mỗi dòng một lần cấp quyền.

### Zalo OA

1. `developers.zalo.me` → app của OA → lấy **App ID** + **Secret key**.
2. Lấy `oauth_code` một lần ở trang quản trị OA → dán vào ô *Mã uỷ quyền* →
   bấm **Đổi mã lấy token**.

Xong. Access token sống 1 giờ, app tự làm mới.

---

## 4. Kho khoá — thứ dễ quên nhất, và quên là hỏng

**TikTok và Zalo cấp refresh token dùng một lần.** Mỗi lần app làm mới, nền tảng trả
token mới và **huỷ token cũ ngay**.

Trên máy cá nhân không sao: app ghi đè `ket-noi.json`.

Trên Render thì ổ đĩa là **tạm** — deploy lại là file bay sạch, app quay về giá trị
trong `SOCIAL_CONNECT_JSON`, mà giá trị đó đã bị nền tảng huỷ từ lần làm mới đầu tiên.
Kết quả: **kênh chết lặng sau vài ngày, Base cứ thiếu số mà không ai biết vì sao.**

Cách chữa: khai biến môi trường **`SOCIAL_VAULT_KEY`**. Có nó, app mã hoá
AES-256-GCM rồi cất bản token mới nhất vào bảng *Kho khoá (mã hoá)* trên Base.

> Nhưng app quảng cáo cấm để token trong Base cơ mà?
> Ở đây token **không nằm trần**. Cả phòng mở Base ra chỉ thấy một chuỗi rác; chìa
> nằm ở biến môi trường Render, thứ chỉ người quản trị thấy. Base ở đây đóng vai
> **ổ đĩa bền**, không phải nơi công bố bí mật.

Chưa khai biến thì kho **tắt hẳn** (không ghi gì lên Base) và màn hình Kết nối hiện
cảnh báo. **Đổi giá trị biến = mất hết token đã cất**, phải nối lại TikTok/Zalo từ đầu.

`vault.js` · phép thử ở `test/vault.test.js`.

---

## 5. Base gồm những bảng gì

| Bảng | Vai trò | Khoá chống trùng |
|---|---|---|
| **Kênh** | danh mục kênh, gắn người phụ trách | `ID kênh` (ID nền tảng) |
| **Số liệu theo ngày** | một dòng = một kênh một ngày | `<ID kênh>#<YYYY-MM-DD>` |
| **Bài đăng** | từng bài, số luỹ kế mới nhất | `<nền tảng>#<ID bài>` |
| **Phiên LIVE** | từng buổi phát | `<nền tảng>#<ID phiên>` |
| **Nhật ký đồng bộ** | mỗi lượt chạy một dòng, kèm cảnh báo | — |
| **Kho khoá (mã hoá)** | token đã mã hoá — đừng sửa tay | tên ngăn |

Cột **Khoá** là cột chính của bốn bảng đầu. Nhờ nó, đồng bộ chạy lại bao nhiêu lần
cũng **đè đúng dòng cũ**. Không có khoá thì chạy lần hai là Base có hai bản của cùng
một ngày, và mọi con số tổng sai gấp đôi mà nhìn bảng không thấy gì bất thường.

Cột **Nguồn** ghi rõ số từ đâu: `TikTok API` · `Facebook API` · … · `Nhập tay` ·
`CSV LIVE Center`. Sau này cãi nhau về một con số thì mở cột đó ra là biết.

**Ghép kênh theo ID nền tảng, không theo tên.** Tên kênh người ta đổi suốt (thêm
emoji, đổi chính tả); ID thì cố định. Ghép theo tên là mỗi lần đổi tên lại đẻ ra
một kênh mới.

---

## 6. Vài quyết định kỹ thuật, và lý do

**Follower không bao giờ được cộng dồn.** Nó là số chốt tại một thời điểm, không phải
lưu lượng. Cộng follower của 30 ngày lại ra một con số vô nghĩa nhưng trông rất to —
lỗi kinh điển của mọi bảng social. `agg()` trong `metrics.js` lấy giá trị của ngày
mới nhất **theo từng kênh** rồi mới cộng ngang các kênh.

**Một hàm `agg()` là định nghĩa duy nhất của mọi tỷ lệ.** Để mỗi màn hình tự tính
"tỷ lệ tương tác" theo cách riêng là vài tuần sau hai màn hình cùng một kỳ ra hai
con số khác nhau, và không ai biết cái nào đúng.

**Không nhờ formula của Base tính tổng.** Mọi số hiển thị đều cộng lại từ dòng thô
trong JS, nên lọc được theo bất kỳ khoảng ngày nào — formula của Base chỉ tính được
cả kỳ hoặc "hôm nay".

**Ghi ngày vào Base là chuỗi trần `YYYY-MM-DD 00:00:00`.** Đã thử trên chính Base
này: Lark hiểu chuỗi trần theo **múi giờ của Base (+8)**. Đừng "sửa" thành quy đổi
sang UTC theo kiểu app quảng cáo — đã thử, gửi `2026-09-04 16:00:00` thì mọi dòng
lùi đúng một ngày, và bảng vẫn đầy số trông rất hợp lý. Xem `store.ngayVeBase()`.

**Metric của Meta tự rụng theo phiên bản API.** Xin một metric đã bị bỏ thì Meta trả
lỗi cho **cả request**, không phải chỉ metric đó. `doInsights()` đọc tên metric trong
câu lỗi, bỏ đúng cái đó ra rồi hỏi lại — kênh mất một chỉ số chứ không mất cả ngày
dữ liệu, và cảnh báo nói rõ mất cột nào.

**Token không bao giờ đi ra khỏi máy chủ.** API trả về bản đã che (`abcd••••wxyz`);
`scrub()` cắt token khỏi mọi thông báo lỗi, kể cả khi Meta nhét nó trần vào giữa câu
kiểu "Malformed access token EAAG…". Có phép thử riêng cho việc này.

---

## 7. Vận hành

**Đồng bộ** (nút góc trên phải, chỉ quản lý): chọn khoảng ngày → *Thử kết nối* →
*Chạy đồng bộ*. Log chạy hiện ngay trong hộp, cảnh báo in ở cuối.

**Chạy tự động**: khai *Mỗi mấy giờ* trong Kết nối (0 = tắt). Chưa nối nền tảng nào
thì app không hẹn giờ, để khỏi đẻ nhật ký rác mỗi 6 tiếng.

**Quét lại mấy ngày**: mặc định 7. Số liệu social còn chạy tiếp vài ngày sau khi
đăng, nên quét lại là cần chứ không phải chạy thừa.

**Test**: `node test/chuanhoa.test.js && node test/vault.test.js` (34 phép thử,
không cần mạng, không đụng Base).

---

## 8. File nào làm gì

| File | Việc |
|---|---|
| `config.js` | cổng, chế độ, **toàn bộ field ID của Base** |
| `ketnoi.js` | đọc/ghi cấu hình kết nối, che token, gộp bản trong kho |
| `vault.js` | mã hoá / giải mã kho token trên Base |
| `store.js` | đọc/ghi Base, ghi theo khoá, xử lý ngày tháng |
| `metrics.js` | gộp số cho giao diện — `agg()` là định nghĩa duy nhất |
| `bang-dan.js` | đọc bảng LIVE dán vào (nhận cột theo tên, số kiểu Việt/Anh) |
| `sync/facebook.js` · `instagram.js` · `tiktok.js` · `zalo.js` | bốn adapter |
| `sync/index.js` | nhạc trưởng: kéo → tính chênh lệch → ghi Base → ghi nhật ký |
| `server.js` | HTTP, phân quyền, nhập tay, lịch chạy |
| `public/` | giao diện |

---

## 9. Chưa làm

**Chấm điểm KPI theo Google Sheet.** Sheet hiện tại có chỉ tiêu tháng, tỷ trọng từng
tiêu chí và tỷ trọng kênh của từng người (Thư · Hằng · Khánh · Trường · Hân · Ngọc).
Bản này lo phần kết nối và gom số trước; phần chấm điểm làm sau, và khi làm thì thêm
bảng *Chỉ tiêu tháng* vào Base rồi tính từ bảng *Số liệu theo ngày* đã có.

**Cột Lead.** Đang để trống. Nguồn thật của lead là Pancake, mà `lark-ads-manager` đã
nối sẵn — nên khi làm sẽ đọc từ đó chứ không nối Pancake lần thứ hai.
