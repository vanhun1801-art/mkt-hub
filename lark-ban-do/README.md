# Bản đồ du lịch Phú Quốc — Rooty Trip

Bản đồ tương tác các điểm du lịch Phú Quốc, làm nổi bật nơi có tour của Rooty Trip và
các **cửa ngõ đến đảo** (sân bay, cảng tàu). Cách dùng giống bản đồ Sunset Town: bấm
hình minh hoạ ra thông tin điểm + tour ghé qua; chọn tour thì bản đồ vẽ tuyến và đánh số
từng điểm dừng.

## Nền bản đồ

Từ 24/09/2026 dùng **bản đồ thật**: MapLibre GL + OpenFreeMap (dữ liệu OpenStreetMap,
miễn phí, không cần API key), địa hình từ bộ DEM Terrarium công khai trên AWS. Kiểu vẽ
tự viết ở `public/phong-cach.js`, bám bố cục Google Maps rồi chỉnh cho Phú Quốc: biển
xanh ngọc (sát bờ sáng, ra khơi đậm dần), rừng có hoạ tiết tán cây dày, đồi núi đổ bóng.

Bẫy đã gặp — đừng lặp lại:
- **Không vẽ lớp `park`**: ở Phú Quốc nó gồm cả khu bảo tồn biển, tô lên là biển xanh lá nhạt.
- **Đổ bóng địa hình phải nằm dưới mặt nước**: DEM có cả độ sâu đáy biển.
- **Không đặt `position` cho `.mk`**: đè `position:absolute` của MapLibre là mỗi ghim
  thành một khối rộng hết màn hình, phủ mờ cả bản đồ.
- MapLibre 6 không còn bản UMD cho thẻ `<script>` — đang ghim **5.24.0**.

## Cấu trúc

| File | Vai trò | Sửa tay? |
|---|---|---|
| `diem.js` | 31 điểm (toạ độ, mô tả VI/EN, tour ghé), thứ tự tuyến tour, luồng cano, tuyến tàu, tuyến bay | **Có** — chỗ duy nhất |
| `tao/du-lieu.js` | đọc Base "Sản phẩm" (qua `lark-san-pham/kho.js`) + lấy đường bộ thật qua OSRM → `public/du-lieu.js` | không |
| `tao/hinh.js` | đường bờ biển OSM → `public/hinh.js` (dải nước nông quanh bờ) | không |
| `tao/dong-goi.js` | gộp thành một file `dist/ban-do-phu-quoc.html` | không |
| `public/phong-cach.js` | kiểu bản đồ nền (màu, thứ tự lớp, hoạ tiết cây) | giao diện |
| `public/hinh-ve.js` | hình minh hoạ từng điểm + phương tiện, vẽ theo ảnh thật | thêm hình cho điểm mới |
| `public/ban-do.js` | ghim, tuyến, phương tiện chạy, panel | giao diện |
| `server.js` | server tĩnh cổng 5187 để xem trên máy / cho Hub bật | không |

## Cập nhật giá, tour

```bash
node tao/du-lieu.js
node tao/dong-goi.js
```

Giá sau ưu đãi tính bằng đúng `tinhGiaSauGiam()` của app Sản phẩm. Chỉ sản phẩm **Đang
kinh doanh** / **Sắp ra mắt** lên bản đồ; trang công khai chỉ xuất tên, thời lượng, lịch
khởi hành, giá, USP. Đường bộ OSRM lưu đệm ở `tao/osrm-dem.json` (chạy lại không gọi mạng).

## Tuyến tàu, bay, cano — nguồn

- Tàu cao tốc Superdong / Phú Quốc Express: Rạch Giá (~2g30) và Hà Tiên (~1g15) cập
  **cảng Bãi Vòng**; Nam Du đi từ Vịnh Đầm; Thổ Châu (từ 22/12/2025) đi từ An Thới.
- Máy bay: đường băng 10/28 (toạ độ OSM), mùa gió Tây Nam hạ cánh đường băng 28 — vào từ
  phía Đông qua Hàm Ninh, cất cánh ra phía Tây. Màu Sun PhuQuoc Airways: thân trắng, đuôi
  đỏ Flame Scarlet chuyển cam vàng. Đường băng số 2 (3.300 m) và nhà ga T2 Phượng Hoàng
  lửa (dự kiến quý I/2027) ghi trong mô tả sân bay.
- Cano Rooty Trip: theo file "Tuyến Đường Cano Di Chuyển (Cảng Vịnh Đầm)" trong Drive —
  9:15 rời Cảng Vịnh Đầm, chạy dọc bờ Đông xuống cụm đảo.

## Gắn lên website

```html
<iframe src="https://<website>/ban-do-phu-quoc.html?nhung=1"
        style="width:100%;height:720px;border:0;border-radius:16px"
        loading="lazy" title="Bản đồ du lịch Phú Quốc"></iframe>
```

| Tham số | Tác dụng |
|---|---|
| `?tour=G4` | mở sẵn một tour và vẽ tuyến — dùng cho trang chi tiết từng tour |
| `?diem=san-bay` | mở sẵn một điểm (id trong `diem.js`) |
| `?lang=en` | tiếng Anh |
| `?nhung=1` | bỏ khối tiêu đề |
| `?theme=toi` | nền tối |

Trang cần mạng để tải thư viện MapLibre (jsDelivr) và ô bản đồ (OpenFreeMap).

## Việc còn mở

- Toạ độ ước lượng: Mũi Hàm Rồng, Cảng Vịnh Đầm, Bến tàu Hà Tiên, Hòn Mây Rút Trong.
- Lịch trình G4/G2 trên Base (Mây Rút Ngoài…) khác file tuyến cano trong Drive (Công viên
  san hô, Móng Tay, Mũi Mô Vít) — bản đồ đang theo Base, chỉ lấy điểm xuất phát Vịnh Đầm.
- Nút đặt tour chờ khai `LIEN_HE` trong `diem.js`.

Dữ liệu bản đồ © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap — dòng ghi công bắt buộc.
