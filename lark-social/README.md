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
| Lượt xem theo ngày | ✅ video | ✅ | ➖ tính chênh lệch | ✅ | ➖ tính chênh lệch |
| Lượt tiếp cận | ❌ Meta đã bỏ | ✅ | ❌ | ✅ | ❌ |
| Lượt xem trang / hồ sơ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Từng bài: xem/thích/bình luận/chia sẻ | ⚠️ cần `pages_read_user_content` | ✅ | ✅ | ✅ | ⚠️ tuỳ gói |
| Tỷ lệ xem hết video, thời gian xem TB | ➖ chỉ thời gian xem | ➖ chỉ Reels | ❌ | ✅ | ❌ |
| **LIVE** (xem / bình luận / follow mới) | ➖ đường vòng qua `/videos` | ❌ | ❌ | ❌ | ❌ |
| **LIVE ra tiền** (lead · đơn · doanh thu) | ✅ Tourwell | ❌ | ✅ Tourwell | ✅ Tourwell | ❌ |
| Tin nhắn / hội thoại | ❌ | ➖ replies | ❌ | ❌ | ✅ |

✅ máy lấy được · ➖ lấy được nhưng gián tiếp · ⚠️ tuỳ gói dịch vụ · ❌ phải nhập tay

**Ba điều đáng nhớ:**

1. **Không nền tảng nào cho số LIVE, nhưng tiền thì đo được.** TikTok và
   Instagram không mở API cho phát trực tiếp. Facebook có `live_videos` nhưng đòi
   Meta duyệt **App Review** — xin thêm scope vô ích; app đi đường vòng qua
   `/videos`, đọc được phiên **đã tắt** (xem mục 2b). Lượt xem LIVE của TikTok vẫn
   phải nhập tay: tab LIVE → *Dán bảng LIVE*, app đọc cột theo tên nên bản xuất nào
   cũng nhận. Còn **hiệu quả** của buổi LIVE thì không đợi nền tảng nữa — lead và
   doanh thu Tourwell gắn thẳng vào từng phiên, xem mục 2c.

4. **Facebook Page mất Lượt hiển thị và Lượt tiếp cận.** Đã dò thật trên Page của
   Rooty Trip ngày 09/09/2026 với API v23.0: Meta bỏ hẳn `page_impressions`,
   `page_impressions_unique` và `page_fans`. Hai cột đó của Facebook sẽ trống
   vĩnh viễn, không phải app thiếu quyền. Chạy `node .tmp/do-metric.js` để kiểm
   lại khi Meta đổi lần nữa.
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

## 2b. LIVE của Facebook về bằng đường nào

`GET /{page-id}/live_videos` trả `(#10) … must be reviewed and approved`. Đó là
**App Review của Meta**, không phải thiếu scope — xin thêm quyền bao nhiêu cũng
vẫn câu đó.

Đường vòng: một phiên LIVE **đã tắt** thì trở thành video bình thường của Trang,
mà video đọc được bằng đúng quyền app đang xin. Video sinh ra từ phát trực tiếp
mang thêm `live_status` và `broadcast_start_time` — đó là dấu để nhận ra nó giữa
đống video đăng thường. `liveTuVideo()` trong `sync/facebook.js`.

Ba điều phải biết trước khi tin cột này:

- Chỉ thấy phiên **đã tắt**. Phiên đang chạy chưa thành video.
- **Không có "Người xem cao nhất"** — `live_views` chỉ có ở `/live_videos`.
- Mất cả hai dấu `live_status` và `broadcast_start_time` thì app **trả rỗng và
  nói rõ**, chứ không đổ cả kho video vào bảng Phiên LIVE.

Đoạn này **chưa chạy thật lần nào** (21/09/2026 app chưa nối Facebook). Nên nó dò
từng trường: Meta không nhận trường nào thì bỏ đúng trường đó rồi hỏi lại, và ghi
vào nhật ký những trường đã phải bỏ. Nối xong, xem nhật ký đồng bộ là biết Meta
thật sự cho gì.

---

## 2c. Đo hiệu quả LIVE bằng dấu vết thật, không bằng lượt xem

Lượt xem LIVE thì nền tảng giấu. Nhưng mô hình LIVE ở đây là tư vấn rồi bảo khách
**bấm nút mũi tên cam để nhắn tin** — mà cú bấm đó mở một hội thoại trên Pancake kèm
dấu thời gian. Đó là dấu vết thật của buổi LIVE, không phải suy đoán.

```
phiên LIVE  [bắt đầu … kết thúc + 2 giờ]  ×  nền tảng
     ↓  hội thoại MỚI mở trên Pancake trong khung đó        → Tin nhắn
     ↓  lead Tourwell rơi vào khung đó, đúng nền tảng       → Lead
     ↓  đơn của cùng KHÁCH (customer.code), tạo sau lead ấy → Đơn · Doanh thu
```

**Bốn cột, bốn khoảng cách tới buổi LIVE.** Đọc từ trái sang phải là đi từ chắc chắn
sang phỏng đoán:

| Cột | Nguồn | Gần buổi LIVE tới đâu | Cỡ số thật (đo 15–21/09/2026) |
|---|---|---|---|
| **Tin nhắn** | Pancake | chính cú bấm nút | ~80 hội thoại/ngày → một buổi tối 20–22h chạm ~15 |
| **Lead** | Tourwell | sau khi sale nhập | ~8 lead/ngày → một buổi chạm 0–2 |
| **Đơn · Doanh thu** | Tourwell | có thể vài ngày sau | thưa, nhưng là tiền thật |

Cột **Tin nhắn** đếm hội thoại **MỞ MỚI**, không đếm tin nhắn. Khách cũ nhắn lại
không mở hội thoại mới nên không được đếm — cột này trả lời "bao nhiêu người mới
bấm vào", không phải "bao nhiêu tin nhắn".

**Khung giờ nào đáng LIVE** (hội thoại mở, giờ Việt Nam, 7 ngày 15–21/09/2026):

```
13h ███████████████████████  45      20h ███████████████████  37
14h █████████████████████████ 50      21h ████████████████    32
15h ██████████████████████████ 60     22h ██████████          19
```

Đỉnh là **13–15h**, tối 17–21h cũng dày. Từ 02h đến 06h gần như không ai nhắn.

**Bẫy giờ của Pancake — đọc trước khi tin bất kỳ con số giờ nào.** `inserted_at` về
dạng `2026-09-21T13:34:45.860818`: **không có `Z`, không có `+07:00`**, mà giá trị
thì là giờ **UTC**. Chuỗi ISO có giờ mà thiếu múi giờ thì JavaScript hiểu là *giờ
máy* — nên `Date.parse()` trần ra kết quả **đúng trên Render (UTC) và lệch 7 tiếng
trên máy ở Việt Nam**. Kiểu lỗi tệ nhất: thử ở nhà thấy sai, lên server lại thấy
đúng. `mocUTC()` trong `tien-live.js` gắn `'Z'` vào chuỗi nào chưa có múi giờ.
`sync/pancake.js` bên app quảng cáo còn đang dính lỗi này.

**Nối lead với đơn bằng mã khách, không bằng mã đơn.** Bản lead có trường
`orders[]`, và `lark-ads-manager` đang đọc nó — nhưng dò thật 21/09/2026 thì mảng
ấy **rỗng** (0/249 lead của một tháng có 895 đơn). Tin vào nó thì cột Doanh thu im
lặng bằng 0 mãi mãi mà không có lỗi nào. `customer.code` thì có ở 100% cả hai bên.

Lead mang sẵn nhãn nền tảng ở `source.name` — đã đếm thật: 55 *"Tiktok Rooty Trip
Phú Quốc"* / 45 *"Facebook Rooty Trip Phú Quốc"* trên 100 lead gần nhất. Đủ để tách
TikTok với Facebook.

Chạy tự động ở cuối mỗi lượt đồng bộ, hoặc bấm tay: tab LIVE → **Gắn doanh thu**.
Một lượt mất khoảng một phút vì Tourwell chặn 60 yêu cầu/phút và luôn trả 25 dòng
một trang. Mỗi lượt **tính lại cả khoảng** chứ không cộng dồn — doanh thu của một
buổi LIVE còn chạy nhiều ngày sau khi nó tắt.

**Đây là trùng khung giờ, không phải nhân quả.** Khách đến trong lúc đang LIVE vẫn
có thể là do quảng cáo hay bài đăng hôm trước. Vài luật giữ cho số khỏi phồng:

| Tình huống | Xử |
|---|---|
| Hai phiên cùng nền tảng chồng giờ | lead về phiên **bắt đầu muộn hơn** |
| Một đơn thuộc hai lead | chỉ ghi công **một lần** |
| Đơn tạo **trước** lead | bỏ — khách cũ quay lại, không phải công của phiên |
| Đơn đã huỷ | không tính vào doanh thu |
| Đơn do **Api Official** tạo | không tính — đó là đơn chi phí của chính phòng mình, xem `lark-chung/tourwell.js` |
| Hội thoại cũ được nhắn lại | không đếm — cột Tin nhắn đếm hội thoại MỞ MỚI |
| Lead không có nhãn nền tảng | không gắn vào phiên nào |

Hai kênh cùng một nền tảng LIVE cùng giờ thì **không tách được** (Tourwell chỉ có
một nhãn nguồn cho cả trang) — nên đừng xếp trùng giờ.

**Đừng mong con số to.** Đã đo thật trên tháng 22/08–21/09/2026: cả tháng 250 lead
(178 TikTok / 71 Facebook), tức khoảng **8 lead/ngày cho mọi khung giờ cộng lại**.
Thử ba khung 20–22h các tối thứ Sáu thì ra 0, 1, 0 lead. Đó là số học, không phải
lỗi: một buổi LIVE hai tiếng thường chạm 0–2 lead. Muốn nới đuôi thì đặt biến
`TIEN_LIVE_DUOI_PHUT` (mặc định 120) — nhưng nới đuôi chỉ quét thêm lead, không
tạo thêm nhân quả.

`tien-live.js`, và `test/tien-live.test.js` có 31 phép thử cho đúng các luật trên.

---

## 3. Nối từng nền tảng

Mọi thứ làm trong giao diện: nút **Kết nối** ở góc trên phải (chỉ quản lý thấy).

### Facebook Page + Instagram — một token cho cả hai

1. `business.facebook.com/settings` → **Người dùng** → **Người dùng hệ thống** → Thêm
   (vai trò Employee access).
2. Chọn user đó → **Thêm tài sản** → **Trang** → tick các Page của Rooty Trip →
   bật quyền xem thông tin chi tiết.
3. **Tạo mã truy cập mới** → chọn app → hết hạn **Không bao giờ** → tick:
   `pages_show_list`, `pages_read_engagement`, `read_insights`,
   **`pages_read_user_content`** (thiếu là không đọc được bài nào),
   `instagram_basic`, `instagram_manage_insights`.
   `pages_manage_metadata` cũng nên tick, dù LIVE vẫn cần App Review mới chạy.
4. Copy token **ngay** (Meta chỉ hiện một lần) → dán vào ô *Token gốc* →
   bấm **Liệt kê Page từ token** → tick trang → **Lưu các trang đã tick**.

App tự lấy page token của từng trang và **tự phát hiện tài khoản Instagram** gắn
với trang đó — không phải đi tìm IG user ID.

Nên dùng System User token vì loại đó **không hết hạn**. Token cá nhân sống ~60 ngày,
tới ngày là đồng bộ chết lặng lẽ; nút *Thử kết nối* có báo số ngày còn lại.

### TikTok — mỗi kênh cấp quyền một lần

**Bên TikTok** (`developers.tiktok.com`): tạo app kiểu **Other** (chọn nhầm kiểu là
phải xoá app làm lại — TikTok không cho đổi). Thêm sản phẩm **Login Kit**, thêm scope
`user.info.profile` · `user.info.stats` · `video.list` (`user.info.basic` kèm sẵn).

Dùng tab **Sandbox** thay vì Production: Production bắt *Submit for review* kèm **video
demo quay màn hình** và chờ TikTok duyệt vài ngày. Sandbox không cần gì, thêm tài khoản
vào **Target Users** là cấp quyền được ngay.

> Sandbox có **cặp khoá riêng**, khác Production. Khoá sandbox bắt đầu bằng `sbaw`,
> production bằng `aw`. Dán nhầm là lỗi rất khó đoán.

Vài chỗ Sandbox đòi mà hay vướng: **App icon phải đúng 1024x1024** (512 bị từ chối
thẳng), Category, Description, Terms of Service URL, Privacy Policy URL, Platforms =
Web. Redirect URI khai `https://mkt-hub-w6hi.onrender.com/healthz` — trang đó trả JSON
mà **không chuyển hướng**, nên tham số `?code=...` còn nguyên trên thanh địa chỉ để copy.

**Bên app**, khối TikTok có ba nút, làm lại cho **từng kênh**:

1. **Tạo link cấp quyền** -> mở link bằng trình duyệt đang đăng nhập đúng kênh đó
   (kênh thứ hai trở đi dùng **cửa sổ ẩn danh**, không thì TikTok cấp quyền nhầm kênh
   đang đăng nhập mà chẳng báo gì)
2. Bấm đồng ý -> copy **nguyên cả URL** trả về
3. **Đổi mã lấy token** -> app tự lấy tên kênh và follower

Mã uỷ quyền sống vài phút, dùng một lần. Không phải tự đụng tới `refresh token`.

Chế độ **business** (thêm tiếp cận, xem hồ sơ, follower theo ngày, tỷ lệ xem hết) cần
tài khoản TikTok Business và app được TikTok bật sản phẩm Business Account. Chưa có thì
để **display**; sau này được duyệt chỉ đổi ô Chế độ, không phải nối lại.

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

Kho giữ **cả bốn khối** cấu hình, không chỉ token xoay vòng — vì page token của
Facebook cũng chỉ nằm trong `ket-noi.json`, tức là cũng bay theo mỗi lần deploy.

Cách ghép khi khởi động lại:

| Cấu hình nền (file / biến môi trường) | Kết quả |
|---|---|
| có danh sách kênh | ghép theo id, kho chỉ bù phần token mới |
| **rỗng** (vừa deploy xong) | **lấy trọn từ kho** — không phải cấp quyền lại |
| kênh đã bị gỡ khỏi cấu hình | kho **không** hồi sinh nó |

Ghép theo **id**, không theo vị trí trong mảng: xoá một dòng hay đảo thứ tự mà ghép
theo vị trí thì token của kênh A rơi sang kênh B — cả hai kênh vẫn "có token", đồng
bộ vẫn chạy, chỉ là số đổ nhầm kênh và không ai nhận ra.

Chưa khai biến thì kho **tắt hẳn** (không ghi gì lên Base) và màn hình Kết nối hiện
cảnh báo. **Đổi giá trị biến = mất hết token đã cất**, phải nối lại TikTok/Zalo từ đầu.

`vault.js` · `ketnoi.ghepDs()` · phép thử ở `test/vault.test.js`.

---

## 5. Base phải được chia sẻ cho app Lark — nếu không thì im lặng hỏng

Trên máy cá nhân app chạy chế độ `cli`: nó mượn phiên lark-cli của chính người
dùng, nên Base nào người đó mở được thì app ghi được.

Trên Render là chế độ `api`: app dùng token của **ứng dụng Lark**
(`LARK_APP_ID`), một danh tính hoàn toàn khác. Base do người dùng tạo thì ứng
dụng đó **không có quyền gì cả**.

Triệu chứng rất dễ đọc nhầm: đồng bộ chạy ngon, log in ra đủ số liệu của từng
kênh, rồi chết ở dòng cuối với `Lark API 91403: you don't have permission`. Kéo
được nhưng không ghi được.

Chữa một lần, bằng lark-cli trên máy có phiên của chủ Base:

```bash
lark-cli drive +member-add --as user   --token <base_token> --type bitable   --member-type appid --member-id <LARK_APP_ID của hub> --perm edit --yes
```

Tra `LARK_APP_ID` mà Render đang dùng bằng cách mở trang chủ hub và đọc tham số
`app_id=` trong link chuyển hướng sang màn hình đăng nhập Lark — khỏi phải vào
dashboard. Lưu ý app của lark-cli trên máy và app của hub **thường là hai app
khác nhau**, nên cấp nhầm là vẫn 91403.

---

## 6. Base gồm những bảng gì

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

## 7. Vài quyết định kỹ thuật, và lý do

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

## 8. Vận hành

**Đồng bộ** (nút góc trên phải, chỉ quản lý): chọn khoảng ngày → *Thử kết nối* →
*Chạy đồng bộ*. Log chạy hiện ngay trong hộp, cảnh báo in ở cuối.

**Chạy tự động**: khai *Mỗi mấy giờ* trong Kết nối (0 = tắt). Chưa nối nền tảng nào
thì app không hẹn giờ, để khỏi đẻ nhật ký rác mỗi 6 tiếng.

**Quét lại mấy ngày**: mặc định 7. Số liệu social còn chạy tiếp vài ngày sau khi
đăng, nên quét lại là cần chứ không phải chạy thừa.

**Gắn doanh thu cho LIVE**: tự chạy ở cuối mỗi lượt đồng bộ; bấm tay ở tab LIVE →
*Gắn doanh thu*. Cần token Open API của Tourwell trong `lark-chung/tourwell.json`
(hoặc biến `TOURWELL_TOKEN`) — thiếu thì app nói rõ chứ không im lặng để 0.

**Số của LIVE Center vào app bằng hai đường**: tab LIVE → *Bảng LIVE Center* →
**thả tệp** `.xlsx`/`.csv` xuất từ LIVE Center, hoặc dán bảng như cũ. Cả hai đi qua
đúng một bộ luật nhận cột (`bang-dan.js`), nên bản xuất nào dán được thì thả tệp
cũng đọc được. Nhận dạng tệp theo NỘI DUNG (`PK` ở hai byte đầu là .xlsx) chứ không
theo đuôi tên.

**Test**: `node test/chuanhoa.test.js && node test/vault.test.js && node test/tien-live.test.js && node test/tep-live.test.js`
(119 phép thử, không cần mạng, không đụng Base).

---

## 9. File nào làm gì

| File | Việc |
|---|---|
| `config.js` | cổng, chế độ, **toàn bộ field ID của Base** |
| `ketnoi.js` | đọc/ghi cấu hình kết nối, che token, gộp bản trong kho |
| `vault.js` | mã hoá / giải mã kho token trên Base |
| `store.js` | đọc/ghi Base, ghi theo khoá, xử lý ngày tháng |
| `metrics.js` | gộp số cho giao diện — `agg()` là định nghĩa duy nhất |
| `bang-dan.js` | đọc bảng LIVE dán vào (nhận cột theo tên, số kiểu Việt/Anh) |
| `tien-live.js` | gắn tin nhắn Pancake + lead/doanh thu Tourwell vào từng phiên LIVE |
| `cho-khop.js` | hàng chờ người đăng ở máy chủ; `viTriPhaiGiu()` quyết định tiện ích còn phải gửi lại gì |
| `../lark-chung/xlsx-doc.js` | đọc .xlsx — dùng chung với app quảng cáo |
| `sync/facebook.js` · `instagram.js` · `tiktok.js` · `zalo.js` | bốn adapter |
| `sync/index.js` | nhạc trưởng: kéo → tính chênh lệch → ghi Base → ghi nhật ký |
| `server.js` | HTTP, phân quyền, nhập tay, lịch chạy |
| `public/` | giao diện |

---

## 10. Chưa làm

**Chấm điểm KPI theo Google Sheet.** Sheet hiện tại có chỉ tiêu tháng, tỷ trọng từng
tiêu chí và tỷ trọng kênh của từng người (Thư · Hằng · Khánh · Trường · Hân · Ngọc).
Bản này lo phần kết nối và gom số trước; phần chấm điểm làm sau, và khi làm thì thêm
bảng *Chỉ tiêu tháng* vào Base rồi tính từ bảng *Số liệu theo ngày* đã có.

**Cột Lead ở bảng Số liệu theo ngày.** Vẫn để trống. Lead đã gắn được cho *phiên
LIVE* (mục 2c, nguồn Tourwell), nhưng lead theo NGÀY cho từng kênh thì chưa — nguồn
tốt hơn cho việc đó là Pancake, mà `lark-ads-manager` đã nối sẵn, nên khi làm sẽ đọc
từ đó chứ không nối Pancake lần thứ hai.

**Ghép phiên LIVE với chi quảng cáo.** Có doanh thu rồi thì ROAS của một buổi LIVE
chỉ còn thiếu vế chi. Số đó nằm bên `lark-ads-manager`; chưa nối vì chi quảng cáo
ghi theo NGÀY, còn phiên LIVE tính theo GIỜ — chia chi phí ngày cho một khung hai
tiếng là đoán, mà đoán vào tiền thì thà chưa làm.
