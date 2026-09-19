# Rooty · Người đăng — tiện ích Chrome

Đọc dòng **"Người đăng: …"** mà Facebook hiện dưới mỗi bài trên Trang, rồi gửi
về Marketing Hub để điền cột **Người đăng** trong bảng Bài đăng.

## Vì sao phải làm kiểu này

Facebook hiển thị tên người đăng trên giao diện nhưng **không phát qua API**.
Đã truy đến cùng trước khi chọn cách này:

| Đã thử | Kết quả |
|---|---|
| `admin_creator` — 4 loại mã × 6 phiên bản × 5 edge, bài từ 2023 đến nay | rỗng toàn bộ |
| 30 tên trường khác trên bài | không tồn tại |
| Bài hẹn giờ, bài chưa xuất bản | rỗng |
| 7 biến thể endpoint nhật ký hoạt động | không tồn tại |
| Marketing API | có tên người, nhưng chỉ cho thao tác quảng cáo |
| File xuất lịch sử Business Manager (542 dòng) | không có sự kiện đăng bài |
| Cấp thêm `business_management`, dùng mã tài khoản người thật | vẫn rỗng |

Phép thử dứt điểm: đúng bài hiện tên "Phương Ái" trên màn hình, API trả `from`
là Trang, không có `admin_creator`.

## Ba điều tiện ích này KHÔNG làm

- Không tự cuộn trang, không tự bấm, không tự mở bài.
- Không chạy ngầm khi không có ai ngồi đó.
- Không tự gửi — phải bấm nút.

Nó chỉ đọc phần đã hiện trên màn hình. Đây là ranh giới giữa *công cụ hỗ trợ
thao tác của người* và *bot cào dữ liệu* — vượt qua là vừa vi phạm điều khoản
của Meta, vừa có nguy cơ bị khoá tài khoản đang giữ quyền trên cả ba Trang.

## Cài

1. Máy chủ: khai biến môi trường `NGUOI_DANG_KEY` trên Render (chuỗi bất kỳ).
2. Chrome → `chrome://extensions` → bật **Chế độ dành cho nhà phát triển** →
   **Tải tiện ích đã giải nén** → chọn thư mục này.
3. Bấm biểu tượng tiện ích → **Tuỳ chọn** → điền địa chỉ Hub và đúng chuỗi khoá
   ở bước 1.

## Dùng

Mở Trang trên Facebook, cuộn tới đâu tiện ích thấy tới đó. Bảng nhỏ góc dưới
phải hiện số bài đã thấy; cuộn thêm thì bấm **Quét lại**; xong bấm **Gửi**.

Kết quả báo rõ ba nhóm: đã ghi, bài chưa có trong Base, và tên lạ (tên ngoài
danh sách ba người thì **không** ghi, để khỏi sinh lựa chọn rác trong Base).

## Khi nào hỏng

Facebook đổi giao diện là bộ chọn DOM trượt — không phải *nếu* mà là *khi nào*.
Triệu chứng: bảng luôn hiện "Đã thấy 0 bài". Chỗ cần sửa là `RE_TEN` và
`CHON_LINK` trong `content.js`.
