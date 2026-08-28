# Automation của Base và app — chỗ nào ăn khớp, chỗ nào không

Ghi lại kết quả rà soát ngày 28/08/2026 trên Base `Tracking`
(`JhZtbxv0gamk5ys3Fr0luHnsgwG`, wiki `AruDwJU14iyla5k6LmYlfXrbgth`).

## 1. Open API chỉ đọc được 2/26 automation

`lark-cli base +workflow-list` trả về **2** workflow, trong khi Automation center
hiện **26 (25 đang bật)**. Lý do: API chỉ thấy automation *được tạo bằng API*
(chúng xuất hiện thành block ở sidebar của Base). 24 cái tạo trong UI thì API
không đọc, không sửa được — muốn rà phải mở Automation center.

Hai cái API thấy: `Thông báo đánh giá khi hoàn thành` (wkfuBUeBsQz8WiEo),
`Gửi kết quả đánh giá cho Lê Văn Hùng` (wkfS0ctcJncHkeY7).

## 2. `trigger_control_list` là danh sách CHẶN, không phải cho phép

Trong UI, phần **Trigger limit settings** ghi rõ: *"The following scenarios won't
trigger automations or workflows"*. Trạng thái mặc định của các automation theo
bản ghi trong Base này:

| Ô | Trạng thái |
|---|---|
| Copying or pasting data in bulk | ☑ chặn |
| Updating data in bulk via automation | ☑ chặn |
| Syncing scheduled data from other sources | ☐ |
| **Updating data in bulk via Open API** | ☑ **chặn** |

## 3. Ghi TỪNG bản ghi vẫn kích hoạt automation — đã đo được

Activity Log của `[Admin] Hoàn thành công việc & kiểm tra` khớp từng giây với hai
lệnh ghi thử qua app (chế độ cli, danh tính người dùng):

| App ghi | Automation chạy |
|---|---|
| 21:12:0x — `complete` một bản ghi | Success 21:12:13 |
| 21:19:0x — `complete` một bản ghi | Success 21:19:10 |

Nên ô "Updating data in **bulk** via Open API" chỉ chặn lệnh ghi *nhiều* bản ghi.
App sửa một bản ghi mỗi lần → automation vẫn chạy.

**Còn một điều chưa đo được:** bản trên Render chạy chế độ `api`, ghi bằng danh
tính **app (bot)** qua Open API, khác với chế độ `cli` ghi bằng danh tính người
dùng. Muốn chốt: bấm Hoàn thành một task trên bản online, rồi mở Activity Log của
automation đó xem có run đúng phút đó không.

API Base v3 chỉ có endpoint `records/batch_update` — không có endpoint sửa một bản
ghi. Vì vậy app **không thể** tự tránh đường "bulk"; nếu bản online bị chặn thì
cách duy nhất là bỏ tick ô đó trong từng automation.

## 4. Nút "Giải quyết" chưa được automation nào biết tới

Việc trễ nộp sản phẩm → app ghi `Đã giải quyết` + `Ngày giải quyết`, **giữ nguyên**
`Trạng thái = Trễ deadline` (để thống kê cuối tháng). Hệ quả với 26 automation
hiện có:

* `[Admin] Hoàn thành công việc & kiểm tra` không chạy → quản lý không biết việc
  trễ đã nộp.
* Hai automation chấm điểm không chạy → không ai được mời nghiệm thu, `Chấm điểm`
  rỗng mãi.
* Các automation nhắc theo giờ vẫn thấy đây là "việc trễ chưa xong" → nhân sự nộp
  rồi **vẫn bị nhắc tiếp**.

Hai cột mới đã hiện trong danh sách trigger của Automation center, nối vào được ngay.

## 5. Ba việc cần làm trong Automation center

### A. Bỏ tick "Updating data in bulk via Open API"

Chỉ làm nếu phép thử ở mục 3 cho thấy bản online bị chặn. Mở từng automation →
`Trigger limit settings` → bỏ tick dòng cuối → **Save and Activate**. Giữ nguyên
hai ô paste/automation (chúng chống vòng lặp).

Danh sách cần sửa (những cái phản ứng theo thao tác của app):

1. `[Admin] Hoàn thành công việc & kiểm tra`
2. `[Người order] Thông báo việc đã được tiếp nhận`
3. `[Người triển khai] Thông báo công việc mới`
4. `[Người order] Thông báo đã nhận Form`
5. `[Người triển khai] Trễ deadline và làm lại`
6. `[Admin] Nhắc nhở phân phối`
7. `[Admin] Xử lý điều chỉnh yêu cầu`
8. `[Người hỗ trợ] Thông báo cần hỗ trợ`
9. `[Admin] Có yêu cầu công việc từ liên phòng ban`

### B. Thêm điều kiện "chưa giải quyết" vào các automation nhắc sau deadline

Mở automation → khối điều kiện → thêm: `Đã giải quyết` **is** `chưa tick`
(unchecked). Áp cho:

* `[Người triển khai] Tới thời hạn deadline`
* `[Người triển khai] Nhắc hẹn - cập nhật trạng thái sau 1 ngày và báo thời hạn chuyển trạng thái`
* `[Người triển khai] Thông báo chuyển trạng thái - Sau 2 ngày`
* `[Auto] Tự động trễ Deadline sau 2 tiếng`
* `[Người order] Tới thời hạn deadline đã giao`

### C. Thêm automation mới cho nút Giải quyết

Lưu ý: `Thông báo đánh giá khi hoàn thành` là workflow tạo bằng API nên nó **không
nằm trong Automation center** (nó ở sidebar của Base) — không copy được từ đó.
Phải dựng mới bằng `+ Create Automation`:

* **Trigger**: `When record is updated` → table `Tracking` → Select fields: chỉ tick
  `Đã giải quyết`, đặt điều kiện *is / checked*.
* **Trigger limit settings**: bỏ tick "Updating data in bulk via Open API" — app
  chính là nơi tick ô này.
* **Action** `Send a Lark message`: người nhận = `Người order` (lấy từ "Record
  updated in step 1") + thêm quản lý; nội dung nêu Công việc, Phụ trách chính,
  Deadline 1, Ngày giải quyết, Link; bật `Add buttons at the bottom` với 3 nút
  `Add/Edit records` ghi `Chấm điểm` = 1 / 3 / 5.
* Kết thúc bằng **Save and Activate** (bấm `Save Only` thì automation nằm im).

Không cần bước `Delay`: app ghi link và ô Đã giải quyết trong cùng một lệnh, dữ
liệu đã đầy đủ ngay lúc trigger chạy.

Bản mô tả JSON tương đương (nếu tạo bằng `lark-cli base +workflow-create`):
trigger `SetRecordTrigger` trên `Đã giải quyết` với
`{"value_type":"boolean","value":true}`, `trigger_control_list` chỉ gồm
`pasteUpdate, automationBatchUpdate, appendImport`; sau đó `Delay 1 phút`;
rồi `LarkMessageAction` gửi tới `$.trigger.flde2eaJAi` (Người order) kèm 3 nút
`setRecord` ghi `Chấm điểm` = 1 / 3 / 5.

## 6. Hai Base còn lại

* **Lịch tác nghiệp** (`U8bAbfnwgalWgDsEU11lpHfPgTb`): 1 automation bật —
  `Cảnh báo chỉnh sửa bản ghi (chống gian lận)`, theo dõi 24 cột, chờ 2 phút rồi
  báo quản lý ai vừa sửa. `trigger_control_list` **không** có `openAPIBatchUpdate`
  → thao tác qua app cũng bắn cảnh báo. Nếu thấy ồn thì thêm ô chặn Open API vào
  automation này (app đã có chốt quyền riêng). Còn `Workflow` rỗng đang tắt là rác,
  nên xoá.
* **Quảng cáo** (`WmWvbjjFQaiRmjsd3Z7lumQXgeb`): 0 automation.

## 7. App không tự gửi tin

`cfg.notify` bật bằng `LARK_NOTIFY=1`, mà biến này không được đặt ở đâu (kể cả
`render.yaml`). Nghĩa là mọi hàm `baoTin` trong app đang vô hiệu — toàn bộ thông
báo hiện tại đều do automation của Base. Muốn app tự gửi thì đặt `LARK_NOTIFY=1`
trên Render và cấp scope `im:message` cho app.
