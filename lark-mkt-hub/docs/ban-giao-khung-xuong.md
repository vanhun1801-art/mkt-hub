# Bàn giao: Khung xương (skeleton) cho Marketing Hub

*Viết ngày 18/09/2026. Đây là tệp BÀN GIAO cho phiên làm việc kế tiếp — không phải tài liệu
của hệ thống. Tài liệu thật nằm ở `lark-mkt-hub/README.md`, mục **"Khung xương — khoảng chờ
có hình dạng"**. Đọc xong việc thì xoá tệp này đi cũng được.*

---

## 1. Anh Hùng yêu cầu gì

Nguyên văn, theo thứ tự:

1. *"Giao diện toàn ứng dụng của anh có vẻ không có khuôn mẫu cho các thành phần. Đây là
   cách làm việc của YouTube, họ cho hiện ra các ô trước sau đó nạp dữ liệu vào tạo cảm giác
   như hệ thống không bị lỗi và không trống trơn. Em check lại và xử lý giúp anh tối ưu giao
   diện https://mkt-hub-w6hi.onrender.com/#/tong-quan"*
2. *"Quét các giao diện còn cũ, và đẩy lên render"*
3. *"Hiện tại giao diện tổng quan anh thấy khớp và ổn, còn lại chưa. Làm nốt phần còn lại"*
4. *"Đây giao diện lên chưa, anh deploy rồi kiểm tra nhé"* ← **đang dở ở đây**

## 2. Đã làm xong những gì

Ba commit, đều đã ở trên `origin/main`:

| Commit | Nội dung |
|---|---|
| `8f61e60` | Khung xương: khoảng chờ có hình dạng cho lớp vỏ và chín app con |
| `6bae2b2` | Khung xương dựng theo TRÍ NHỚ hình thật, không phải hình trung bình |
| `e30142a` | App con: khung xương CHỤP từ chính màn thật của lần trước |

`HEAD` lúc bàn giao là `c62f614` (*"Thay trang 502 đen của Render bằng Ma-Két đang sửa"*) —
commit đó **của phiên khác**, không liên quan khung xương. Cây làm việc sạch, không còn gì
chưa commit.

### Kiến trúc: hai tầng, hai cơ chế khác nhau

**Tầng 1 — lớp vỏ (trang Tổng quan):** khai hình bằng tay + **tự nhớ hình thật**.
`localStorage['hub.hinh.v2']` giữ, cho MỖI base: tên, icon, màu, số ô, có ô chính không, có
dòng "Không có" không, **chiều cao thật**, bề ngang cửa sổ lúc đo; cộng chiều cao băng cảnh
báo và khối "Cần xử lý ngay". `veHomeXuong()` + `veRailXuong()` chạy **trước lời gọi mạng
đầu tiên**. Đo được: **trang khung xương và trang có số liệu cao bằng nhau từng pixel
(2520px)**, từng khối một.

**Tầng 2 — chín app con:** không khai tay được (mỗi app mấy chục màn) nên **chụp khung xương
từ chính màn thật**: đi một vòng qua DOM sau khi vẽ xong, giữ nguyên thẻ + lớp CSS, thay chữ
bằng thanh xám (dài theo chữ thật, cao theo cỡ chữ thật), thay ảnh/biểu đồ/ô nhập bằng khối
xám **đúng cỡ**. Cất ở `localStorage['kx.xuong.<id>']`, lần mở sau nạp lại.

### Tệp

| Tệp | Việc |
|---|---|
| `lark-mkt-hub/public/khung-xuong.css` | **bản gốc** — token màu sáng/tối, hiệu ứng lướt, các hình dạng chuẩn |
| `lark-mkt-hub/public/khung-xuong.js` | **bản gốc** — bộ dựng `KX.*` + bộ chụp DOM |
| `lark-mkt-hub/dong-bo-khung.js` | chép CẢ HAI bản gốc sang `public/` của chín app con |
| `lark-mkt-hub/test/khung-xuong.test.js` | 79 câu kiểm |
| `lark-mkt-hub/public/app.js` | `docHinh/luuHinh/doCaoThe/veHomeXuong/veRailXuong`, `choSo` trong `veHome()` |

## 3. Quy ước BẮT BUỘC — phá cái nào cũng hỏng im lặng

1. **Sửa bản gốc xong phải chạy `node dong-bo-khung.js`.** Mỗi app con chạy độc lập được nên
   chỉ phục vụ được tệp trong thư mục của chính nó — phải có một bản cho mỗi app. Test canh
   từng byte.
2. **`KX.*` có hai nhóm, đừng lẫn:**
   - *chung* (`o` `chu` `so` `nut` `oSo` `dong` `log` `cot` `luoiNho` `khoi` `hai` `bang`
     `man`): chỉ dùng lớp `kx-*`, app nào cũng gọi được;
   - *riêng lớp vỏ* (`the` `theTheo` `khoiBase` `luoiBase` `viec` `tai` `rail` `tin`): mượn
     lớp bố cục trang Tổng quan. **App con gọi là ăn nhầm CSS của chính nó** — `.the` bên Báo
     cáo là thẻ báo cáo, bên lớp vỏ là ô số. Test quét mọi tệp JS của chín app để canh.
3. **Ba thuộc tính HTML, ba vai:**

   | Thuộc tính | Nghĩa | Đặt ở đâu |
   |---|---|---|
   | `data-kx-nho="<id>"` | vừa **hiện** vừa **chụp** | `<main>` của tám app |
   | `data-kx-chup="<id>"` | **chỉ chụp** | `#dashboard` của Bảng công việc |
   | `data-kx-xem="<id>"` | **chỉ hiện** | lớp phủ `#loader` của Bảng công việc |

   Tên phải trùng **id module bên lớp vỏ** (`cong-viec`, `lich-tac-nghiep`, `quang-cao`,
   `ota`, `social`, `chinh-anh`, `kpi`, `quy-chi-phi`, `bao-cao`).
4. **Mọi lời gọi `KX.*` phải có đường lùi `window.KX ? … : <chữ như cũ>`** — tệp khung xương
   lỡ không nạp được thì app vẫn chạy.
5. **Giữ nguyên chữ ở chỗ cần TIẾN ĐỘ, không cần hình dạng:** nhãn nút đang chạy ("Đang
   ghi…"), tiến trình tải tệp ("Đang tải 2/5 — anh.png"), ô gợi ý đang gõ. Đây là quyết định
   có chủ ý, đừng "quét nốt".

## 4. Sáu cái bẫy đã dính THẬT — đừng dẫm lại

1. **`display: block` chưa đủ để bỏ canh giữa.** Chromium áp `justify-items` cho cả hộp
   khối, nên `.frame-loading.xuong` / `.loader.xuong` phải trả `place-items` / `place-content`
   về `normal`, nếu không khung xương bị bóp còn một cột hẹp giữa màn hình.
2. **Mượn biến màu của app trong tệp dùng chung.** `var(--trang)` / `var(--vien)` → app nào
   không khai biến đó sẽ có thẻ **trắng toát giữa nền tối**. Khung xương phải tự lo màu bằng
   token riêng (`--kx-nen`, `--kx-mat`, `--kx-vien`).
3. **`requestAnimationFrame` KHÔNG chạy khi tab ở nền** — mà tab nền đúng là lúc trang tự vẽ
   lại theo nhịp 60 giây. Đo chiều cao phải đo thẳng sau khi vẽ.
4. **Đặt `data-kx-nho` lên thẻ khung xương thay vì lên `<main>`.** App thay `innerHTML` là
   thẻ đó biến mất cùng bộ theo dõi → chụp mãi không ra bản nào, **không có lỗi nào hiện ra**.
5. **Chừa chỗ quá tay.** Bảng quỹ chi phí cao 10.155px trong khi khung xương chỉ dựng 30
   dòng đầu → hở tám nghìn pixel trắng. Giờ lấy số nhỏ hơn giữa *chiều cao thật* và *chiều
   cao khung xương + 15%*.
6. **`.kx-chup * { background-image: none }` quét sạch luôn vệt sáng của chính khối xương**
   (nó vẽ bằng `linear-gradient`) → bản chụp đứng im như ảnh chết. Phải là `*:not(.kx)`.

Thêm một cái bẫy của **bộ test**, không phải của mã: `dong-nhat.test.js` lấy "tệp .css đầu
tiên" trong `public/`, mà `khung-xuong.css` đứng trước `styles.css` theo thứ tự chữ cái →
15 câu đỏ oan. Đã sửa cho nó lấy đích danh `styles.css`.

## 5. Việc còn treo — đây là chỗ cần làm tiếp

### 5.1. Xác minh trên bản chạy thật (việc chính)

Anh Hùng đã deploy và nhờ kiểm tra. **Không kiểm được từ ngoài**: mọi đường của
`https://mkt-hub-w6hi.onrender.com` đều trả `302` về `/auth/login` (Lark), kể cả tệp tĩnh.
Chỉ `GET /healthz` là công khai (`{"ok":true}`, đo được ~0,32s).

Nên cách kiểm phải là **anh Hùng tự mở**, hoặc anh ấy gửi ảnh chụp màn hình. Trình tự:

1. Mở `https://mkt-hub-w6hi.onrender.com/#/tong-quan`, bấm **Ctrl+Shift+R**.
2. **Lần mở thứ nhất sau khi xoá cache là lần xấu nhất** — máy chưa có gì để nhớ, nên chỉ
   thấy hình chung (3 thẻ base mẫu). Đúng như thiết kế.
3. **Mở lại lần thứ hai** (F5 thường): panel trái phải hiện **tên base thật ngay lập tức**,
   lưới base đúng số base và đúng số ô, không nhảy khi số liệu về.
4. Bấm vào một base → app con hiện khung xương **giống màn của chính app đó**, không phải
   bốn thẻ chung chung. Cũng cần mở hai lần: lần đầu app con mới chụp được.
5. Muốn xem nhanh trí nhớ đã có chưa, mở Console:
   `Object.keys(localStorage).filter(k => k.startsWith('kx.xuong') || k.startsWith('hub.hinh'))`
   → phải ra `hub.hinh.v2` + `kx.xuong.<id>` của những app đã mở.

Nếu anh ấy báo *"vẫn chưa thấy gì khác"* thì nghi theo thứ tự này:
- **cache trình duyệt** (hay gặp nhất) → Ctrl+Shift+R;
- **Render chưa deploy xong hoặc deploy hỏng** → xem dashboard Render;
- **Service worker** vừa được thêm ở `c62f614` (`public/sw.js`) — nó có đệm gì đó và trả bản
  cũ không? Đây là **nghi can mới, chưa ai kiểm**. `sw.js` viết là chỉ đệm trang báo hỏng và
  ảnh, nhưng phải đọc lại cho chắc vì nó ra đời sau khung xương.

### 5.2. Hai câu test đỏ sẵn, KHÔNG phải do khung xương

- `lark-mkt-hub/test/api.test.js`: chạy cả bộ (`npm test`) thỉnh thoảng đỏ **1 câu**; chạy
  riêng `node test/api.test.js` thì **175 pass · 0 fail**. Là tranh chấp lúc cả bộ nện vào
  hub cục bộ.
- `lark-lich-tac-nghiep`: 1 câu `đã lọc dòng trống của Base → blankRows=0` — đỏ từ trước, phụ
  thuộc dữ liệu thật trên Base.

Đã đối chứng bằng `git worktree` trên bản gốc chưa sửa: cả hai đỏ sẵn.

### 5.3. Có thể làm tiếp nếu anh Hùng muốn

- Khung xương lúc **mở app con lần đầu đời máy** vẫn là hình khai tay (đo trên màn thật của
  từng app). Đủ dùng, nhưng nếu app đổi giao diện nhiều thì hình khai tay sẽ lệch dần — cân
  nhắc bỏ hẳn, để trống rồi chờ bản chụp.
- Lớp phủ iframe của lớp vỏ vẫn là `KX.man` chung. Hiện nó chỉ sống tới lúc app con dựng
  xong DOM (bắt `'xin-loc'`), nên gần như không thấy. Muốn khớp hẳn thì phải cho lớp vỏ đọc
  được CSS của app con — chưa làm, và có lẽ không đáng.

## 6. Lệnh hay dùng

```bash
cd /c/Users/ASUS/.agents/lark-mkt-hub
node dong-bo-khung.js          # BẮT BUỘC sau khi sửa khung-xuong.css/.js
node test/khung-xuong.test.js  # 79 câu, chạy trong 1 giây
npm test                       # cả bộ — cần hub chạy ở cổng 5180, nếu không api.test.js hỏng
node server.js                 # bật hub + chín app con ở http://localhost:5180
```

Kiểm bằng mắt trên máy: mở `http://localhost:5180`, ép về trạng thái chờ bằng Console —

```js
S.tq = null; S.lich = null; veHome();                       // trang Tổng quan
KX.hien(document.querySelector('[data-kx-nho]'), 'social'); // trong một app con
```
