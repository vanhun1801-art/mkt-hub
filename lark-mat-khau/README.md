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

Mất `TK_KHOA` là mất mọi mật khẩu đã mã hoá — không có cửa sau. Sao lưu nó ở chỗ không phải
Lark Base (trình quản lý mật khẩu cá nhân, hoặc giấy cất két). Trên Render khai **đúng cùng
giá trị** với máy. `nhap.js --tao-khoa` từ chối tạo khoá thứ hai nếu đã có.

## Giới hạn đã biết

- Danh bạ ở tab Phân quyền gom từ các ô người trên Base. Người chưa từng xuất hiện: thêm họ
  vào cột "Được xem mật khẩu" của một dòng trên Base một lần.
- open_id riêng theo từng app Lark, nên quyền khớp theo id **hoặc** tên (header tên do hub
  đặt, trình duyệt không giả được).
