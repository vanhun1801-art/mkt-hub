# KOL — app con thứ 12 của Marketing Hub

> **Bản 23/09/2026 (2):** tạo hợp tác trọn gói một màn (KOL + kênh + chuyến), mã vùng 191
> nước + tự sửa số điện thoại (`public/ma-vung.js`, dùng chung server/giao diện), bảng kê
> có lịch trình bên cạnh + cột Đối tác / Xin FOC + email xin FOC, bàn giao chọn kênh từ
> bảng Kênh + "Trả cho đối tác" + báo cáo đối tác, **Lùi bước** + Lịch sử bước, theo dõi
> thư trả lời BGĐ / KOL (`theo-doi-mail.js`, 15 phút/lần — báo anh, anh bấm duyệt).
> Nâng cấp Base: `node thiet-lap/nang-cap-1.js --that` (đã chạy).
>
> **Một lệnh cấp đủ quyền mail (gửi + đọc thư trả lời):**
> ```
> lark-cli auth login --scope "mail:user_mailbox.message:send mail:user_mailbox.message:readonly mail:user_mailbox.message.address:read mail:user_mailbox.message.subject:read mail:user_mailbox.message.body:read"
> ```

Quản lý một chuyến hợp tác KOL từ lúc chốt thông tin tới báo cáo kết quả, trên Base
**KOL · Hợp tác truyền thông** (`TqOFbEdN9aEKyNsGk8qlpeKZgHh`).

```
node server.js        →  http://localhost:5186   (hoặc start.bat)
node test/tinh.test.js
```

## Quy trình (cột Bước của bảng Hợp tác)

| Bước | Nút trong app | App tự làm |
|---|---|---|
| Đang trao đổi | Soạn email trình BGĐ | sinh email từ bảng kê, gửi qua Lark Mail |
| Chờ BGĐ duyệt | BGĐ đã duyệt / yêu cầu sửa | ghi Người duyệt, Duyệt lúc, Ý kiến |
| BGĐ đã duyệt | Soạn thư mời KOL | thư mời KHÔNG có giá |
| Đã mời KOL | KOL đã xác nhận | |
| KOL đã xác nhận | Đã tạo dịch vụ Tourwell (dán mã RT) | |
| Đã tạo dịch vụ → Đang đi tour → Chờ bàn giao | — | tự trôi theo ngày đi / ngày về |
| Chờ bàn giao | Cập nhật bàn giao · Soạn báo cáo BGĐ · Hoàn tất | nhắc nhập số 7N / 30N |

Nút chỉ mở khi bước trước đã qua (`tinh.js → duocLam`). Lý do: thư mời ca Châu Kim
Cương gửi 30/07, sau khi chuyến 11–13/07 đã xong.

## Tiền — hai con số, cố ý tách

- **Tiền công ty chi** = SL × Đêm/Lượt × Đơn giá chi, chỉ dòng *Công ty chi*. Số trình BGĐ.
- **Giá trị quy đổi** = SL × Đêm/Lượt × Giá công bố. Gồm cả phần đối tác FOC.

App tính và ghi vào Base (không dùng formula) — quy tắc nằm một chỗ ở `tinh.js`.
Em bé dưới 1m mặc định 0đ.

## Danh mục dịch vụ

"Thêm từ danh mục" gộp hai nguồn: **Base Sản phẩm** (chỉ đọc — lấy mã + giá công bố) và
bảng **Dịch vụ đối tác** (khách sạn, nhà hàng…). Lark không cho link chéo Base nên dòng
bảng kê CHÉP mã + giá lúc chốt: giá đổi sau này không làm sai bảng kê cũ.

## Email — Lark Mail

MX của rootytrip.com là larksuite → gửi bằng `lark-cli mail +send --as user`: thư đi từ
hộp thư thật của anh, Lark tự gắn chữ ký mặc định. *Lưu nháp* để mở Lark sửa rồi gửi,
xong bấm "Đã gửi từ Lark Mail" để ghi bước.

**Cần scope** `mail:user_mailbox.message:send` cho phiên lark-cli (cả gửi lẫn lưu nháp):
```
lark-cli auth login --scope "mail:user_mailbox.message:send"
```
Chế độ api (Render) cố ý KHÔNG gửi mail — tenant token không đứng tên anh được.

## Nhắc hẹn (`nhac.js`, mỗi phút một vòng)

- Hạng mục bật **Nhắc hẹn** + có **Giờ hẹn** → trước N phút (mặc định 60) bot nhắn riêng
  anh, kèm tin soạn sẵn để copy gửi KOL qua Zalo. Nhắn xong ghi *Đã nhắc lúc*.
- Bản tin sáng (8h): sắp đi 3 ngày tới, chờ BGĐ quá 2 ngày, bàn giao quá hạn, đến hạn nhập số.
- Kênh gửi: khai `KOL_TIN_APP_ID/SECRET` + `KOL_NHAC_EMAIL` trong `.env` → app Marketing
  Hub, chỉ đích bằng email. Không khai → bot lark-cli nhắn chính người đang đăng nhập lark-cli.

Biến `.env` (tuỳ chọn): `KOL_MAIL_FROM` (vd cmo@rootytrip.com) · `KOL_BGD_TO` ·
`KOL_NHAC_TRUOC_PHUT` · `KOL_NHAC_GIO_SANG` · `KOL_NHAC_TAT=1`.

## Base

Đọc bằng TÊN cột (`kho.js → BANG`), id cột tự dò lúc nạp — đổi tên cột trên Base thì sửa
ở đó. Dựng lại từ đầu: `node thiet-lap/tao-base.js --that`.
Nhớ mời app **Marketing Hub** (`cli_aa1a8ae21a78ded2`) vào Base với quyền Quản lý.
