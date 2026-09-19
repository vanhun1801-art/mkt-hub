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

## Hai cách dùng

**Trên máy người đăng (chính).** Khai tên mình ở Tuỳ chọn → mỗi lần bấm Đăng
trong Business Suite, tiện ích chụp lại đoạn chữ vừa soạn và ghi tên người đó.
Không phụ thuộc Facebook có vẽ dòng "Người đăng" hay không. Bài vừa đăng chưa
có trong Base (đồng bộ 6 tiếng một lượt), nên tiện ích giữ trong máy rồi tự gửi
lại mỗi lần mở Facebook cho tới khi khớp được — không cần ai nhớ.

**Trên máy quản lý (rà bài cũ).** Để trống ô "Tôi là", mở Trang rồi cuộn; tiện
ích đọc dòng "Người đăng" đã hiện trên màn hình, xong bấm **Gửi**.

## Cài

1. Máy chủ: khai biến môi trường `NGUOI_DANG_KEY` trên Render (chuỗi bất kỳ).
2. Chrome → `chrome://extensions` → bật **Chế độ dành cho nhà phát triển** →
   **Tải tiện ích đã giải nén** → chọn thư mục này.
3. Bấm biểu tượng tiện ích → **Tuỳ chọn** → điền địa chỉ Hub và đúng chuỗi khoá
   ở bước 1.

## Dùng

Mở Trang trên Facebook rồi cuộn bình thường. Bảng nhỏ góc dưới phải tự đếm
thêm khi anh cuộn tới bài mới — không phải bấm gì. Xem đủ rồi thì bấm **Gửi**.
Nút **Quét lại** chỉ dùng khi muốn ép đếm lại ngay.

Kết quả báo rõ ba nhóm: đã ghi, bài chưa có trong Base, và tên lạ (tên ngoài
danh sách ba người thì **không** ghi, để khỏi sinh lựa chọn rác trong Base).

## Đổi người / thêm người

Danh sách tên trong ô "Tôi là" do máy chủ cấp, không chép cứng trong tiện ích — đổi
người thì không phải cài lại cho từng máy.

Thêm một người phải làm **đủ hai việc**, thiếu một là ghi hỏng:

1. **Trên Base** — bảng Bài đăng, cột **Người đăng**, thêm lựa chọn mới đúng tên đó.
2. **Trên Render** — biến môi trường `NGUOI_DANG_TEN`, liệt kê đủ tên, ngăn bằng dấu
   phẩy. Ví dụ: `Võ Hằng,Lý Thư Bạch,Phương Ái,Tên Mới`.

Chưa khai biến này thì mặc định là ba tên ban đầu.

Người nghỉ việc thì bỏ tên khỏi biến; **đừng xoá lựa chọn trên Base**, không thì
những bài cũ của họ mất tên và KPI kỳ trước tính lại sai.

## Khi nào hỏng

Facebook đổi giao diện là bộ chọn DOM trượt — không phải *nếu* mà là *khi nào*.
Triệu chứng: bảng luôn hiện "Đã thấy 0 bài". Chỗ cần sửa là `RE_TEN` và
`CHON_LINK` trong `content.js`.
