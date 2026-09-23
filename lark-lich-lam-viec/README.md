# Lịch làm việc — app con thứ 11 của Marketing Hub

Nhân sự Marketing đăng ký lịch làm việc tháng vào Base **Lịch làm việc MKT**
(`VTqxbgjx1a5ZIMsyMQGlLjtQg6c`), quản lý xuất ra rồi chép sang sheet LLV của HCNS.
Base này cũng là nguồn ngày nghỉ cho dải nhiệt **Tải nhân sự** trên trang Tổng quan.

```
node server.js        # http://localhost:5185
node test/chay-het.js
```

## Base

| bảng | id | vai trò |
|---|---|---|
| Đăng ký tháng | `tblad6snuvuCzh8y` | một người × một tháng; 31 cột `Ngày 01…31` mang mã công HCNS |
| Nhân sự | `tblskRVfDIva6zOO` | danh sách phải đăng ký, **đúng thứ tự dòng bên sheet HCNS** |
| Ngày lễ | `tblBjsVdlOyRZup6` | ngày nào ở đây thì lịch chuẩn ghi NL — thêm Tết tại đây |
| Cấu hình | `tbl5fTk4rFFzBRr8` | kỳ đăng ký: `ngayMo` `gioMo` `dongSauNgay` `gioDong` `batBuoc` — quản lý chỉnh ở tab Thành viên |

Dựng lại: `node thiet-lap/tao-base.js --that`.

## Luật (ma-cong.js)

- Lịch chuẩn: **Chủ nhật OFF · Thứ 7 thứ 2 và thứ 4 của tháng x/2 · còn lại x** ·
  ngày lễ NL. Khớp từng ô với tab LLV 09.2026 của HCNS (công chuẩn 25).
- Bảng mã chép từ chú thích cuối sheet HCNS. `lam` = phần ngày có đi làm,
  `luong` = phần ngày được tính lương dù không đi làm.
- **Kỳ đăng ký cố định** (`MA.cuaSo`): mặc định mở 09:00 ngày 29 (tháng ngắn thì ngày
  cuối), đóng 23:59 ngày hôm sau, giờ VN, cho tháng SAU. Nhân sự chỉ sửa được đúng
  tháng đó trong kỳ; ngoài kỳ chỉ quản lý sửa. Không nhắc tháng trước `LLV_BAT_DAU`.
- Trong kỳ, ai chưa nộp bị hộp nhắc của hub **khoá mọi app khác** (tắt được bằng ô
  "Bắt buộc" — khi đó hộp có nút "Để sau").

## Nối với hub

- `/api/nhac` (theo kỳ cố định) → hộp nhắc `lark-mkt-hub/public/nhac-lich.js` (dùng lại lớp phủ của
  thông báo chặn màn hình, không có nút đóng, tự lùi khi đang ở trong app này).
- `/api/nghi?tu&den` → `DOC_NGHI` trong `lark-mkt-hub/lichchung.js`. Ngày nghỉ **không**
  cộng vào tải. Trên dải nhiệt chỉ hiện bằng CHỮ (anh Hùng chốt): nghỉ cả ngày `OFF`,
  nửa ca `½` — không đổi màu, không lớp phủ, không đổi kích thước ô.
- `/api/tong-quan` → thẻ số trang Tổng quan (chưa đăng ký · chờ chép · sửa sau khi chép).

## Chép sang HCNS

Tab **Cả phòng** (quản lý): *Chép khối ngày* đưa vào clipboard một khối mã công tách
bằng Tab, đúng thứ tự dòng HCNS — dán vào ô ngày 01 của người đầu tiên. Hoặc *Tải Excel*
(cùng khuôn cột với tab LLV). Xong bấm *Đánh dấu đã chép HCNS*; ai sửa sau đó hiện
"Sửa sau khi chép" để chép lại dòng đó.

## Khi đưa lên Render

1. Mời app Marketing Hub (`cli_aa1a8ae21a78ded2`) vào Base với quyền Quản lý — thiếu là 91403.
2. Thêm `lich-lam-viec` vào biến `HUB_CA_PHONG` — không thì nhân sự không vào được app để đăng ký.

## Bẫy đã gặp

- Mở app trên máy (chế độ cli) từng ghi open_id **của app Lark CLI** vào bảng Nhân sự —
  id đó vô dụng trên Render. Nay chế độ cli chỉ gắn email; open_id chỉ ghi ở chế độ api.
- Lark trả `800004135 OpenAPIListRecord limited` khi đọc ba bảng cùng lúc. `kho.js`
  xếp mọi lượt đọc thành một hàng và gộp lượt trùng.
