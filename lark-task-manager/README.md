# Bảng công việc — Lark Base "Tracking"

Giao diện web thao tác trực tiếp trên Base `Tracking`
(wiki `AruDwJU14iyla5k6LmYlfXrbgth`, table `tbl2ZBrfhXfmrsD4`).
Mọi thay đổi ghi thẳng vào Lark Base — không có bản sao dữ liệu riêng.

Luồng làm việc và các quy tắc bắt buộc lấy từ tài liệu
**"Base Tracking - Training"** (wiki `D31NwcY5ziFU5OkkIrWlt7QVg8b`) —
bản trích xuất để tham chiếu: [docs/quy-trinh-tracking.txt](docs/quy-trinh-tracking.txt).

## Chạy

```bash
cd C:\Users\ASUS\.agents\lark-task-manager && node server.js
```

Hoặc double-click `start.bat`. Mở http://localhost:5173

Yêu cầu: Node.js + `lark-cli` đã đăng nhập (`lark-cli auth status`).
Không cần `npm install` — server dùng thuần Node core.

---

## 0. Phân quyền xem

App **khoá theo tài khoản `lark-cli` đang đăng nhập** — không có ô chọn người,
không xem được việc của người khác. Chốt này nằm ở server, không phải chỉ ẩn UI.

| | Nhân sự | Quản lý |
|---|---|---|
| Tab thấy được | Chỉ "Việc của tôi" | Tổng quan · Việc của tôi · Kanban · Bảng |
| `/api/tasks` trả về | Chỉ việc mình phụ trách / hỗ trợ | Toàn phòng |
| Sửa / bắt đầu / hoàn thành | Chỉ việc của mình → `403 NOT_YOUR_TASK` | Mọi việc |
| Đặt việc mới | Được — chỉ bộ trường của Form "Yêu cầu công việc" | Được, kèm phần phân công |
| Xoá, sửa hàng loạt | `403 MANAGER_ONLY` | Được |

Danh bạ để chọn Người hỗ trợ vẫn lấy đủ 35 người — đó là tên người, không phải
dữ liệu công việc.

### Cấp / thu quyền quản lý

**Trong app** (cách chính): quản lý bấm nút **⚙** trên thanh trên → tích ô
trước tên người cần cấp → `Lưu phân quyền`. Có ô tìm tên; mỗi dòng hiện số việc
người đó đang phụ trách và open_id.

**Bằng dòng lệnh** (khi không mở được app, hoặc lỡ khoá hết quyền):

```bash
node quyen.js
```

| Lệnh | Việc |
|---|---|
| `node quyen.js` | Xem mình đang là gì, ai đang là quản lý |
| `node quyen.js danhsach` | Liệt kê 35 người kèm open_id và số việc |
| `node quyen.js them "Văn Hùng"` | Cấp quyền quản lý (khớp tên không cần đủ) |
| `node quyen.js bo "Văn Hùng"` | Thu quyền, trả về nhân sự triển khai |
| `node quyen.js dat ou_a,ou_b` | Đặt lại danh sách bằng open_id |

Danh sách lưu ở `quyen.json`, **đọc lại mỗi request nên đổi quyền có hiệu lực
ngay, không cần restart** — người bị đổi chỉ cần tải lại trang.

Hai chốt chống tự khoá:

- Không lưu được danh sách rỗng → `Phải còn ít nhất một quản lý`
- Không tự bỏ quyền của chính mình qua app → `400 SELF_DEMOTE`
  (nhờ quản lý khác, hoặc dùng `node quyen.js`)

Chưa có `quyen.json` thì dùng mặc định trong `config.js → defaultManagerIds`
(hoặc biến môi trường `LARK_MANAGER_IDS`).

### Thêm nhân sự mới

Không cần cấp gì cả — mặc định ai cũng là nhân sự triển khai. Họ chỉ cần cài
app trên máy mình và đăng nhập `lark-cli` bằng tài khoản Lark của họ:
[docs/huong-dan-cai-dat.md](docs/huong-dan-cai-dat.md).

Điều kiện để thấy việc: tên họ phải nằm ở cột **Phụ trách chính** hoặc
**Người hỗ trợ** của bản ghi trong bảng Tracking.

## 1. Tab "Tổng quan" — bàn điều hành của quản lý

Tab mặc định khi quản lý mở app. Nhân sự không thấy tab này.

### Bộ lọc

**Chiến dịch** · **Nhân sự** · **Thời gian** (xem [Mốc thời gian](#mốc-thời-gian)).
Lọc được kết hợp và **áp cho toàn bộ trang**: chỉ số, ba hàng đợi, bảng tải việc
và hai biểu đồ phân bổ.

Nhãn phạm vi bên phải luôn cho biết con số đang tính trên tập nào — ví dụ
`3 / 384 việc · Danh Minh Trường · Operate · Tất cả việc quá hạn` — để không
đọc nhầm số đã lọc thành số toàn phòng.

Nhân sự tính theo **Phụ trách chính**. Lọc một người thì bảng tải việc chỉ hiện
đúng người đó (bảng có việc 6 người đồng phụ trách, không lọc sẽ kéo theo cả
đồng nghiệp).

### Sáu chỉ số đầu trang

Việc đang mở · Chưa phân công · Quá hạn · Chờ chấm điểm · Điểm trung bình ·
Tỉ lệ hoàn thành. Bấm *Chưa phân công* hoặc *Quá hạn* để nhảy xuống hàng đợi
tương ứng.

### Ba hàng đợi cần xử lý ngay

| Hàng đợi | Vì sao quan trọng | Nút |
|---|---|---|
| **Chưa phân công** | Việc đã vào bảng nhưng chưa có Phụ trách chính — **nhân sự không thấy được** | `Phân công` |
| **Quá hạn** | Deadline đã qua mà việc chưa đóng | `Xử lý` |
| **Thiếu deadline** | Không có deadline thì không đo được trễ hạn | `Đặt hạn` |

Cả ba nút mở **modal Phân công**: chọn Phụ trách chính (dropdown có tìm kiếm),
Deadline, Độ ưu tiên, Loại công việc, Campain. Modal tự liệt kê những trường
đang thiếu. Lưu xong việc rời hàng đợi ngay.

Đây cũng là chỗ đóng vòng cho việc nhân sự tự đặt: họ gửi yêu cầu → việc rơi
vào **Chưa phân công** → quản lý gán người → nhân sự thấy nó ở "Công việc mới".

### Tải việc theo nhân sự

Bảng: Đang mở (kèm thanh tải, đỏ nếu có việc trễ) · Đang làm · Trễ · Làm lại ·
Chờ chấm · Hoàn thành · Điểm TB (kèm số việc đã chấm). Bấm tiêu đề cột để sắp
xếp. Chỉ hiện người có việc.

### Phân bổ

Hai biểu đồ thanh: theo Loại công việc và theo Chiến dịch, tính trên việc đang
mở. Nhóm `(chưa điền)` tô xám để thấy ngay chỗ dữ liệu còn thiếu.

## 2. Tab "Việc của tôi" — dành cho nhân sự triển khai

Phạm vi: việc mình **phụ trách chính** hoặc **được thêm vào Người hỗ trợ**.
Việc mình chỉ là người order không nằm ở tab này.

### Chuyển vai — chỉ quản lý

Chip tên tài khoản trên thanh trên là **nút chuyển vai**. Bấm vào mở danh sách
toàn phòng, mỗi dòng kèm số việc đang mở và số việc trễ, có ô tìm tên. Chọn một
người là cả tab hiển thị đúng những gì họ thấy: 5 thẻ đếm, 5 làn việc, dấu minh
chứng — để biết họ đang làm gì và tắc ở đâu.

Khi đang xem vai khác:

- Chip đổi sang **màu cam**, ghi `Đang xem: <tên>`
- Có băng cảnh báo kèm nút `Quay về việc của tôi`
- **Nút thao tác của nhân sự bị tắt** (Bắt đầu làm / Hoàn thành / Nộp lại), chỉ
  còn `Xem chi tiết` — tránh vô ý đóng việc thay người khác
- Mở chi tiết thì được **drawer quản lý đầy đủ**, sửa mọi trường nếu thật sự cần
- Thông báo việc mới vẫn tính trên việc **của chính mình**, không đổi theo vai

Nhân sự không có nút này — chip của họ là chữ tĩnh.

### 5 thẻ đếm (bấm để lọc)

| Thẻ | Lấy từ |
|---|---|
| 🔔 Công việc mới | `Chờ tiếp nhận` hoặc chưa đặt trạng thái |
| ▶️ Đang tiến hành | `Đang tiến hành` |
| 🔥 Đang trễ deadline | Trạng thái `Trễ deadline` (do admin đặt) |
| 🔁 Cần làm lại | `Làm lại` — order trả về |
| ✅ Đã hoàn thành | `Hoàn thành` |

### Bộ lọc

**Chiến dịch** · **Độ ưu tiên** · **Thời gian** (xem [Mốc thời gian](#mốc-thời-gian)).
Ô tìm kiếm nằm ở thanh trên.

### 5 làn việc

| Làn | Nội dung | Nút hành động |
|---|---|---|
| 🔔 Công việc mới | Việc mới, chưa bắt đầu | `▶ Bắt đầu làm` · `Yêu cầu điều chỉnh` |
| 🔁 Cần làm lại | Order trả về để sửa | `↻ Nộp lại` · `Yêu cầu điều chỉnh` |
| 🤝 Cần hỗ trợ | Việc người khác phụ trách, mình làm cùng | `Xem chi tiết` |
| ▶️ Đang tiến hành | Việc mình đang chạy | `✓ Hoàn thành` · `Yêu cầu điều chỉnh` |
| 🔥 Đang trễ deadline | Đã bị đánh dấu trễ | `✓ Hoàn thành` · `Yêu cầu điều chỉnh` |

Mỗi làn là một khối riêng, tiêu đề 15px in đậm trên dải nền xám nhạt, có chấm
màu nhận diện và huy hiệu số — dán dính khi cuộn nên luôn biết mình đang ở mục
nào. Một việc chỉ nằm ở đúng một làn. Làn rỗng tự ẩn, trừ "Công việc mới" và
"Đang tiến hành" luôn hiện để nhân sự biết mình đang trống.
Làn "Đã hoàn thành" chỉ hiện khi bấm thẻ đếm tương ứng.

Thẻ việc hiển thị: ưu tiên, loại việc, chiến dịch, deadline dạng người đọc
("Quá hạn 21 ngày" / "Hạn hôm nay" / "Còn 3 ngày"), người order (hoặc người
phụ trách nếu đang ở làn Cần hỗ trợ), và **dấu minh chứng**
`✓ Đã có kết quả` / `⚠ Chưa có tệp/link`.
Việc quá hạn viền đỏ, gần hạn viền cam. Trong mỗi làn: quá hạn lên trước,
rồi deadline gần nhất, rồi ưu tiên cao.

### Thông báo việc mới

- Số việc mới hiện trên tab (`Việc của tôi 3`) và trên tiêu đề trình duyệt (`(3) …`)
- Tự kiểm tra Base mỗi 60 giây; có việc mới thì hiện toast + thông báo hệ thống
  (xin quyền Notification sau khi mở app vài giây)

### Ô "Xem theo"

Chọn nhân sự cần xem. Mặc định là tài khoản `lark-cli` đang đăng nhập —
để quản lý xem được việc của từng người, và để mỗi nhân sự chạy bản của mình.

---

## 3. Các chốt bảo vệ theo tài liệu

Kiểm tra **cả ở giao diện và ở server**, không chỉ ẩn nút.

| Quy tắc trong tài liệu | Cách app thực thi |
|---|---|
| Phải đính sản phẩm hoặc dán link trước khi `Hoàn thành` | Nút Hoàn thành mở hộp thoại có ô link + chọn tệp. Submit khi trống → server trả `422 PROOF_REQUIRED`, hộp thoại giữ nguyên và hiện đúng câu quy định |
| Không tự sửa Deadline / Người order / nội dung yêu cầu | Drawer chia hai khối: **Yêu cầu từ người order** (chỉ đọc) và **Phần của bạn** (Link, Ghi chú, Người hỗ trợ, Tệp đính kèm). PATCH `?role=staff` với trường bị khoá → `403 FIELD_LOCKED` |
| `Tạm dừng` / `Trễ deadline` / `Hủy` do admin đặt | PATCH `?role=staff` với các trạng thái này → `403 STATUS_LOCKED` |
| Chỉ Phụ trách chính cập nhật trạng thái | Làn "Cần hỗ trợ" không có nút đổi trạng thái; drawer hiện nhãn giải thích ai là người cập nhật |
| Bước 2 không đổi trạng thái | Làn "Công việc mới" không có nút đổi trạng thái nào ngoài `Bắt đầu làm` |
| Thiếu/sai thông tin thì gửi Yêu cầu điều chỉnh | Nút mở form ghi vào bảng `Yêu cầu điều chỉnh` — chọn Thông tin cần sửa, Nội dung đề xuất, Lý do; tự liên kết đúng bản ghi task và người gửi |

---

## 4. Form đặt việc (nút `+ Đặt việc` / `+ Công việc`)

Dựng theo Form "Yêu cầu công việc" trong tài liệu Training.

**Ai cũng điền được:** Tên công việc\* · Chi tiết yêu cầu\* · Loại công việc\* ·
Độ ưu tiên\* · Ngày bắt đầu · Deadline\* · Link brief · Ghi chú

- `Ngày bắt đầu` **tự điền thời điểm tạo việc**, sửa lại được
- `Người order` tự gán là người đang đăng nhập, không nhận từ client
- Trạng thái mới luôn là `Chờ tiếp nhận`

**Chỉ quản lý thấy** (nhóm "Phân công — chỉ quản lý"):
Phụ trách chính · Người hỗ trợ · Campain · Người order · Kênh phân phối

Nhân sự gửi kèm các trường này thì server trả `403 FIELD_LOCKED`.

**Không đưa vào form:** `Luồng`, `Chấm điểm`, `Deadline 2` — Base tự điền
`Luồng` = Chưa bắt đầu và `Campain` = Operate theo giá trị mặc định của trường.

Ba trường chọn nhiều (Phụ trách chính, Người hỗ trợ, Kênh phân phối) dùng
**dropdown thả xuống có ô tìm kiếm**, gộp lại thành một dòng ("Tên A, Tên B +3")
thay cho dãy 35 chip trải kín màn hình như trước. Drawer sửa việc cũng dùng
component này.

## 5. Tab "Kanban" và "Bảng" — dành cho quản lý

- **Kanban**: 7 cột theo Trạng thái, kéo–thả thẻ để đổi trạng thái
- **Bảng**: sắp xếp theo mọi cột, đổi Trạng thái/Ưu tiên ngay trên dòng,
  chọn nhiều dòng → đổi hàng loạt hoặc xoá
- **Thẻ thống kê**: Tổng · Đang tiến hành · Chờ tiếp nhận · Quá hạn ·
  Hạn hôm nay · Hoàn thành — bấm để lọc nhanh
- Drawer ở hai tab này mở toàn quyền: sửa mọi trường, tạo mới, xoá

Phím tắt: `/` tìm kiếm · `Esc` đóng hộp thoại / drawer / bỏ chọn.

---

## Mốc thời gian

Khớp bộ điều kiện lọc ngày của Lark Base, **dùng chung cho cả ba bộ lọc**
(Tổng quan · Việc của tôi · Kanban/Bảng). Danh sách khai một chỗ trong
`public/app.js → DUE_OPTIONS` nên không thể lệch nhau.

| Mốc | Nghĩa |
|---|---|
| Ngày cụ thể | Deadline đúng ngày chọn — hiện thêm ô chọn ngày |
| Hôm nay · Ngày mai · Hôm qua | Deadline rơi đúng ngày đó |
| Tuần này · Tuần trước | Tuần tính từ **Thứ 2** |
| Tháng này · Tháng trước | Theo tháng dương lịch |
| 7 ngày qua · 30 ngày qua | Từ N ngày trước đến hết hôm nay |
| Trong 7 ngày tới · Trong 30 ngày tới | Từ hôm nay đến N ngày sau |

Hai mốc cuối bảng thuộc nhóm **Theo tình trạng** — Lark diễn đạt bằng toán tử
chứ không phải giá trị ngày, nên tách riêng:

- **Đã quá hạn (chưa đóng)** — deadline đã qua **và** việc chưa Hoàn thành/Hủy.
  Việc đã đóng dù trễ vẫn không tính.
- **Chưa có deadline** — ô deadline trống.

Chọn "Ngày cụ thể" mà chưa chọn ngày thì coi như chưa lọc, không loại việc nào.

## Hệ màu

Tham chiếu bảng màu Lark / Semi Design, khai bằng CSS token ở đầu
`public/styles.css` — sửa một chỗ là đổi toàn app.

Nguyên tắc: **nền trung tính, xanh Lark `#3370FF` là màu tương tác duy nhất,
màu ngữ nghĩa chỉ dùng liều nhỏ và phải mang thông tin.**

| Vai trò | Màu | Dùng ở đâu |
|---|---|---|
| Tương tác | `#3370FF` | Nút chính, tab đang chọn, viền focus, mục đang lọc |
| Cần xử lý | `#F54A45` | Việc mới, trễ deadline, quá hạn, chưa có minh chứng |
| Cảnh báo | `#FF8800` | Cần làm lại, sắp đến hạn (≤3 ngày), ưu tiên trung bình |
| Hoàn tất | `#34C724` | Đã hoàn thành, đã có kết quả |
| Phụ trợ | `#7F3BF5` | Chấm nhận diện mục "Cần hỗ trợ" |

Cách dùng màu:

- Nhãn theo kiểu Lark: **nền nhuộm rất nhạt + chữ đậm cùng tông**, không viền,
  không nền đặc. Nhãn không mang nghĩa (Loại việc, Chiến dịch, người order) để
  xám trung tính — mỗi dòng việc chỉ còn 2–3 màu thay vì 5–6 như trước
- Con số ở thẻ đếm để màu chữ thường; **chỉ ba mục cần chú ý** (Việc mới, Trễ
  deadline, Cần làm lại) mới nhuộm đỏ/cam khi > 0. Mục bằng 0 xám đi
- Mục việc nhận diện bằng **chấm màu 8px** thay cho vạch màu dày
- Ưu tiên bỏ emoji trên nhãn vì màu nền đã mang nghĩa (giữ emoji trong dropdown
  vì ở đó không có nền màu)
- Ảnh đại diện lấy từ dải 8 màu Lark cố định, không sinh màu ngẫu nhiên

4 tầng nền tách biệt: trang → khối mục → tiêu đề mục → dòng việc.
Bán kính bo góc theo Lark: 6px cho nút/ô nhập, 8px cho thẻ, 12px cho khối lớn.

Toàn bộ chữ đạt chuẩn tương phản WCAG AA (≥ 4.5:1) ở **cả sáng và tối** —
đã đo: tên việc 15.8:1, tiêu đề mục 14.9:1, mô tả 5.1–5.5:1, nhãn 4.8:1.

## Kiến trúc

```
server.js    HTTP server thuần Node (không dependency) + REST API + chốt vai trò
lark.js      Adapter gọi lark-cli qua child_process, tự retry lỗi tạm thời
config.js    Base token, table id, field map, quy tắc từ tài liệu Training
quyen.js     Công cụ phân quyền bằng dòng lệnh
quyen.json   Danh sách quản lý (tự sinh khi lưu lần đầu)
public/      index.html · styles.css · app.js  (vanilla JS, không build step)
docs/        Tài liệu quy trình + hướng dẫn cài đặt cho nhân sự
```

Xác thực dùng luôn phiên đăng nhập của `lark-cli` (`--as user`) — app có đủ
quyền của chính người đăng nhập trên Base, không cần cấp scope riêng cho app.

### API

| Method | Endpoint | Việc |
|---|---|---|
| GET | `/api/meta?refresh=1` | Options, danh bạ, người đăng nhập, `role`, quy tắc |
| GET | `/api/tasks?refresh=1` | Công việc trong phạm vi được xem (phân trang 200/lần, cache 20s) |
| POST | `/api/tasks` | Đặt việc — nhân sự bị giới hạn ở `staffCreatable` |
| PATCH | `/api/tasks/:id` | Sửa — thêm `?role=staff` để bật chốt vai trò nhân sự |
| DELETE | `/api/tasks/:id` | Xoá — chỉ quản lý |
| POST | `/api/tasks/:id/start` | Bước 3 — chuyển `Đang tiến hành` |
| POST | `/api/tasks/:id/complete` | Bước 5 — kiểm minh chứng rồi chuyển `Hoàn thành` |
| POST | `/api/tasks/:id/upload` | Đính tệp (body nhị phân, tên ở header `X-File-Name`, ≤60 MB) |
| GET | `/api/attachment?record=&token=` | Tải tệp đính kèm |
| GET · POST | `/api/requests` | Đọc / gửi Yêu cầu điều chỉnh (`tblYblcwsjzEVaXM`) |
| GET · POST | `/api/managers` | Đọc / lưu danh sách quản lý — chỉ quản lý |

Biến môi trường thêm: `LARK_QUYEN_FILE` trỏ tới file danh sách quản lý khác
(dùng khi cần chạy song song nhiều cấu hình để thử vai trò).
| PATCH | `/api/tasks/bulk` | `{ids, patch}` — sửa hàng loạt (≤100/lần) |
| POST | `/api/tasks/bulk-delete` | `{ids}` — xoá hàng loạt |

---

## Gắn vào Lark App

Developer Console → app `abc` → **Web app**:

- **Desktop homepage**: `http://localhost:5173`
- Chọn **New tab in Lark**
- Mobile homepage: để trống (localhost không truy cập được từ điện thoại)

Chạy local thì chỉ máy đang chạy server mở được. Muốn cả phòng dùng thì
deploy lên domain HTTPS (Cloudflare Tunnel / VPS) rồi đổi Desktop homepage;
lúc đó nên chuyển xác thực sang `app_id` + `app_secret` (`tenant_access_token`),
cấp scope `base:record:*`, và lấy người dùng hiện tại từ JSSDK của Lark thay
cho ô "Xem theo".

## Giới hạn hiện tại

- **Nhân sự đặt việc xong thì không thấy việc đó trong app** cho đến khi quản lý
  phân công họ — vì phạm vi xem là "việc mình phụ trách / hỗ trợ", còn họ chỉ là
  người order. Quản lý thấy ngay ở hàng đợi *Chưa phân công* của tab Tổng quan
- Tab "Việc của tôi" không hiện việc mình chỉ là **người order**, và không hiện
  việc `Tạm dừng` / `Hủy` — đúng phạm vi người triển khai. Quản lý xem đầy đủ ở
  tab Kanban / Bảng
- Phân quyền dựa trên tài khoản `lark-cli` của máy đang chạy. Khi deploy chung
  một server cho cả phòng thì phải lấy người dùng từ JSSDK của Lark, vì lúc đó
  mọi người dùng chung một phiên `lark-cli`
- `Parent items` (quan hệ cha–con) chỉ đọc
- Xoá tệp đính kèm phải làm trong Lark Base
- Tệp minh chứng của Yêu cầu điều chỉnh chưa upload được từ app
- Ô "Xem theo" là lựa chọn thủ công, chưa phải đăng nhập từng người

## Đổi cấu hình

Biến môi trường: `PORT`, `LARK_BASE_TOKEN`, `LARK_TABLE_ID`,
`LARK_REQ_TABLE_ID`, `LARK_AS` (`user`|`bot`), `LARK_CLI_SCRIPT`.
Quy tắc vai trò (`staffStatuses`, `adminStatuses`, `staffEditable`,
`proofRequiredFor`) sửa trong `config.js`.
