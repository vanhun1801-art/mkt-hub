# Tài khoản & gói dịch vụ

App con thứ 14 của [Marketing Hub](../lark-mkt-hub/README.md) (id `mat-khau`, cổng **5189**).
Kho mật khẩu và tài sản đăng ký của phòng Marketing, đọc/ghi Base
**TÀI SẢN PHÒNG BAN - MKT ROOTY TRIP** (`StCObaElHaob0ksyL7zltNAzgdd`, nằm trong wiki).

```
node server.js     # http://localhost:5189
npm test           # 3 bộ, không chạm mạng
```

Id là `mat-khau`, không phải `tai-khoan`: tên đó hub đã dùng cho tài khoản đăng nhập
(`lark-mkt-hub/tai-khoan.js`, mục Cài đặt → Tài khoản).

## Thay cho cái gì

| Trước | Vấn đề |
|---|---|
| File Excel "TÀI KHOẢN MẬT KHẨU - ROOTY TRIP" (71 tài khoản) | mật khẩu chữ thường; ai có file là có hết; không biết ai đã mở |
| Bảng gói đăng ký trên Base (Adobe, Canva…) | cột Mật khẩu chữ thường; ai mở Base là đọc được |

## Ba bảng trên Base

| Bảng | ID | Ghi chú |
|---|---|---|
| Tài khoản | `tblja4dzNvyCVxrC` | dựng 30/09/2026 từ file Excel |
| Bảng (gói đăng ký) | `tblTiL5EwinU9LUx` | có sẵn; thêm cột **Được xem mật khẩu** |
| Nhật ký truy cập | `tblCbOuJipwJpbQj` | mỗi lần xem/chép/đổi/cấp quyền/bị từ chối là một dòng |

## Ba lớp chắn

1. **Mã hoá.** Ô mật khẩu trên Base chỉ giữ `enc:v1:…` (AES-256-GCM, `ma-hoa.js`).
   Khoá `TK_KHOA` ở `.env` trên máy và ở biến môi trường Render — không ở Base, không ở git.
2. **Quyền theo từng dòng.** Quản lý (theo hub) xem hết. Người khác chỉ xem dòng có tên
   họ ở cột **Được xem mật khẩu** — cấp ở tab Phân quyền hoặc thẳng trên Base. Kiểm trên
   bản ghi đọc tươi, rút quyền là mất ngay.
3. **Nhật ký.** Không ghi được nhật ký thì không trả mật khẩu.

Danh sách gửi lên trình duyệt không bao giờ mang mật khẩu, kể cả dạng mã hoá. Mật khẩu
chỉ đi qua `POST /api/mo`, từng ô, hiện 30 giây rồi tự che. Mở quá 40 ô / 10 phút → 429.

## Lần đầu

```
node nhap.js --tao-khoa                                   # tạo TK_KHOA vào .env
node nhap.js --thu "C:\Users\ASUS\Downloads\TÀI KHOẢN MẬT KHẨU - ROOTY TRIP.xlsx"   # xem trước, không ghi
node nhap.js "C:\Users\ASUS\Downloads\TÀI KHOẢN MẬT KHẨU - ROOTY TRIP.xlsx"         # nhập thật
node nhap.js --ma-hoa-goi                                 # mã hoá cột Mật khẩu của bảng gói
```

Không script nào in mật khẩu ra màn hình. Nhập xong, kiểm trong app thấy đủ thì **xoá file
Excel gốc**.

## Giữ khoá

Mất `TK_KHOA` là mất mọi mật khẩu **và mã 2FA** đã mã hoá — không có cửa sau. Khoá hiện ở
HAI nơi (máy anh Hùng + Render); cả hai cùng mất (máy hỏng + service Render bị xoá) là mất
hết. Cất bản thứ ba ở chỗ không liên quan: trình quản lý mật khẩu cá nhân, hoặc giấy niêm
phong trong két công ty — KHÔNG cất trên Lark Base. Trên Render khai **đúng cùng giá trị**
với máy. `nhap.js --tao-khoa` từ chối tạo khoá thứ hai nếu đã có.

## Nhắc tự động (nhac.js)

Bot **Marketing Hub** nhắn riêng **người phụ trách** (cột Người phụ trách, tài khoản Lark):

| Khi nào | Nội dung |
|---|---|
| Gói còn 7 ngày, còn 1 ngày, quá hạn 1 ngày | tên gói, tài khoản, chi phí, hạn, link mở app |
| Ngày 1–3 hằng tháng | MỘT tin / người: các tài khoản họ phụ trách mà mật khẩu > 180 ngày chưa đổi |

- Không gửi trùng: mỗi tin là một dòng "Nhắc …" ở Nhật ký, cột Mã bản ghi giữ khoá.
- Không cron (Render cho app ngủ): chạy mỗi 30 phút khi đang thức + mỗi request vào app tối đa 1 lần/giờ.
- Không nhắn trước 8:00 giờ VN. Chỉ gửi trên Render; ở máy chỉ xem trước. Tắt: `MK_NHAC_TAT=1`.
- Quản lý xem trước / gửi ngay ở **tab Nhật ký → Bộ nhắc tự động**.
- Dòng không có người phụ trách thì không ai nhận — tab **Cần dọn** liệt kê những dòng đó.

## Mã 2FA

Dán mã bí mật lúc bật 2FA (chuỗi base32 hoặc cả đường `otpauth://`) vào ô **Mã bí mật 2FA**
trong form Sửa thông tin. App lưu mã hoá như mật khẩu, và ở khung Đăng nhập có nút **Hiện mã
6 số** (TOTP chuẩn RFC 6238 — trùng mã Google Authenticator), tự đổi theo chu kỳ, tự tắt sau
2 phút. Cùng quyền với xem mật khẩu; mỗi người × mỗi tài khoản ghi nhật ký tối đa 1 lần / 2 phút.

## Người nghỉ việc

Tab Phân quyền → bảng "Ai đang có quyền" → **Nghỉ việc**: rút quyền xem ở mọi dòng, rồi liệt
kê các tài khoản họ **đã từng mở mật khẩu** (đọc từ Nhật ký) hoặc **đang phụ trách** — đó là
danh sách cần đổi mật khẩu và giao người mới. Cột Người phụ trách cố ý để nguyên.

## Bấm thử không đụng Base thật

```
node test/may-gia.js                # vai quản lý, http://localhost:5193
MAY_GIA_NV=1 node test/may-gia.js   # vai nhân sự
```
Chạy đúng server.js trên một Base giả trong bộ nhớ.

## Giới hạn đã biết

- Ô chọn người tìm trong danh bạ công ty (danh-ba.js) bằng ĐÚNG app đang ghi Base — open_id
  riêng theo app, tìm bằng app khác là ghi id lạ.
- open_id riêng theo từng app Lark, nên quyền khớp theo id **hoặc** tên (header tên do hub
  đặt, trình duyệt không giả được).
