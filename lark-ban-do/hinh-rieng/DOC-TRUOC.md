# Hình minh hoạ tự vẽ cho bản đồ

Bỏ hình vào thư mục này, **tên file = mã điểm** (bảng dưới), rồi chạy `node tao/dong-goi.js`.
Điểm nào chưa có hình ở đây thì bản đồ dùng hình vẽ sẵn.

## Cách thay một hình (3 bước)

1. Mở hình mẫu đang dùng trong `hinh-rieng/mau-hien-tai/<mã>.svg` (Illustrator / Figma) để xem bố cục, rồi vẽ lại.
2. Lưu hình mới vào **thư mục này** (`hinh-rieng/`, không phải `mau-hien-tai/`), tên file = mã điểm, ví dụ `ganh-dau.png`.
3. Chạy `node tao/dong-goi.js` → file `dist/ban-do-phu-quoc.html` đã có hình mới. Muốn quay về hình cũ: xoá file đó rồi chạy lại.

Trên bản đồ: **ô số nằm đúng toạ độ điểm**, hình đứng ngay trên ô số (chân hình chạm mép trên ô số), tên ghi bên phải (chật thì bên trái).

## Chỉnh cỡ từng hình (tuỳ chọn)

Khi đóng gói, mỗi hình được tự **cắt sát phần trong suốt** và nén WebP 512 px, nên hình không bị nhỏ vì khung thừa.
Muốn một hình to/nhỏ hơn, tạo file `hinh-rieng/kich-thuoc.json` (mở bằng Notepad), ví dụ:

    { "safari": 1.2, "cau-hon": 0.9 }

1 = cỡ mặc định · 1.2 = to hơn 20% · 0.9 = nhỏ hơn 10%. Lưu rồi bấm đúp `CAP-NHAT-BAN-DO.bat`.

## Quy cách hình

- Định dạng: **PNG hoặc WebP nền trong suốt** (SVG cũng được).
- Khung **vuông**, khuyên 512 × 512 px (tối thiểu 256).
- Công trình **căn giữa**, **chân công trình chạm đáy khung** — đáy khung là điểm đặt trên bản đồ.
- Không cần vẽ số hay chữ tên: bản đồ tự ghi số (trái) + tên (phải) ngay dưới hình.
- Mỗi hình nên dưới ~150 KB (toàn bộ nhúng vào một file HTML).

## Phương tiện (máy bay, tàu, cano…)

Thay được như địa điểm — tên file:

| Tên file | Phương tiện | Hướng vẽ |
|---|---|---|
| xe-may-bay | Máy bay trên các đường bay | nhìn từ trên xuống, **mũi hướng sang PHẢI** (bản đồ tự xoay theo hướng bay) |
| xe-tau | Tàu cao tốc Rạch Giá / Hà Tiên / Nam Du / Thổ Chu | nhìn từ trên, mũi sang phải (tự xoay) |
| xe-cano | Cano tour đảo | nhìn từ trên, mũi sang phải (tự xoay) |
| xe-cabin | Cabin cáp treo Hòn Thơm | nhìn thẳng, móc treo ở giữa mép trên (không xoay) |
| xe-buom | Thuyền buồm trang trí | nhìn ngang, hướng sang phải (bản đồ tự lật khi đi sang trái) |

**Nhiều mẫu cho một loại:** thêm số sau tên — `xe-may-bay.png`, `xe-may-bay-2.png`, `xe-may-bay-3.png` (tới -9).
Các chiếc lần lượt dùng từng mẫu rồi quay vòng. Hiện có: 3 máy bay (HCM, Hà Nội, Singapore–Seoul), 8 tàu cao tốc
(2 chiếc × 4 tuyến Rạch Giá / Hà Tiên / Nam Du / Thổ Chu), 3 cano, 4 cabin, 2 thuyền buồm.

Hình mẫu: `mau-hien-tai/xe-*.svg`. Cỡ riêng chỉnh trong `kich-thuoc.json`, ví dụ `{ "xe-may-bay": 1.3 }`.

## Mã điểm

| Mã (tên file) | Địa điểm |
|---|---|
| vinwonders | VinWonders Phú Quốc |
| safari | Vinpearl Safari |
| grand-world | Grand World |
| ganh-dau | Gành Dầu |
| rach-vem | Rạch Vẹm – Vương quốc sao biển |
| ham-rong | Mũi Hàm Rồng |
| bai-thom | Bãi Thơm |
| duong-dong | Dương Đông – Trung tâm đảo |
| dinh-cau | Dinh Cậu |
| cho-dem | Chợ đêm Phú Quốc |
| san-bay | Sân bay quốc tế Phú Quốc |
| cang-quoc-te | Cầu cảng Quốc tế Phú Quốc |
| sanato | Sunset Sanato |
| bai-truong | Bãi Trường |
| ho-quoc | Thiền viện Trúc Lâm Hộ Quốc |
| nha-tu | Nhà tù Phú Quốc |
| bai-sao | Bãi Sao |
| bai-khem | Bãi Khem |
| sunset-town | Thị trấn Hoàng Hôn |
| ga-cap-treo | Ga cáp treo An Thới |
| cau-hon | Cầu Hôn |
| cang-bai-vong | Cảng Bãi Vòng |
| cang-vinh-dam | Cảng Vịnh Đầm |
| cang-an-thoi | Cảng An Thới |
| rach-gia | Bến tàu Rạch Giá |
| ha-tien | Bến tàu Hà Tiên |
| hon-thom | Hòn Thơm – Cáp treo & Sun World |
| may-rut-trong | Hòn Mây Rút Trong |
| may-rut-ngoai | Hòn Mây Rút Ngoài |
| gam-ghi | Hòn Gầm Ghì |
| mong-tay | Hòn Móng Tay |
