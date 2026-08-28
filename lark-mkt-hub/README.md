# Marketing Hub — siêu ứng dụng phòng Marketing Rooty Trip

Một cửa vào cho **tất cả** Lark Base của phòng. Panel bên trái là danh sách base;
khung bên phải là app của base đó, **giữ nguyên bộ tab riêng** của nó.

Trang chủ **Tổng quan chung** gom ba thứ, theo thứ tự đọc từ trên xuống:
thẻ số của từng base → **Tải nhân sự** (dải nhiệt ai làm gì ngày nào) →
**Cần xử lý ngay** (việc gấp trộn từ mọi base).

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
  "bat": true
}
```

- `an` — selector của khối logo/tiêu đề riêng cần ẩn (vì panel đã thay).
- `phuSelector` — selector của dòng phụ đề động để panel hiển thị. Để trống thì panel dùng `mo_ta`.
- `bat: false` — giữ trong file nhưng ẩn khỏi panel.

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
node test/api.test.js
```

64 phép thử, **chỉ đọc** — không ghi gì lên Lark Base. Kiểm tra: lớp vỏ, proxy từng
module (chèn shim, viết lại đường dẫn, API xuyên proxy), hình dạng dữ liệu Tổng quan chung,
bộ lọc thời gian (thu hẹp đúng, tham số sai không làm sập), lưới lịch chung (tổng ô khớp tổng lượt, thứ tự dồn việc, chặn khoảng quá rộng), log module, và vài chốt an toàn.
Module chưa chạy thì phần của nó ghi "bỏ qua", không tính lỗi.

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
| `kpi.js` | bộ đọc chỉ số cho Tổng quan chung (một hàm / một base) |
| `lichchung.js` | gộp việc mọi base thành dải nhiệt nhân sự × ngày (khối Tải nhân sự) |
| `public/index.html` · `styles.css` · `app.js` · `icons.js` | panel base, sân khấu iframe, trang Tổng quan chung, modal Cài đặt / Thêm base / Log |
| `test/api.test.js` | kiểm thử chỉ đọc |

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
