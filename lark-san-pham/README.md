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
| **Quản lý** *(chỉ quản lý)* | bảng sửa tại chỗ + đặt hàng loạt |

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

## Quản lý sửa được gì

Chín cột, khai ở `config.suaDuoc`, kiểm giá trị ở `server.js → doiTruong()`:

`Ưu tiên marketing` · `Trạng thái kinh doanh` · `Giá công bố NL` · `Giá công bố TE`
· `Ghi chú giá` · `Hiệu lực từ` · `Hiệu lực đến` · `Ưu đãi đang chạy` ·
`Lưu ý cho marketing`

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

## Mấy cái bẫy đã sập, đừng sập lại

| Bẫy | Hậu quả | Chỗ vá |
|---|---|---|
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
| `server.js` | tệp tĩnh + `/api/khoi-tao`, `/api/san-pham`, `/api/tong-quan`, `POST /api/san-pham/:id`, `POST /api/san-pham/hang-loat` |
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
