# Kho media

Tìm ảnh/video trong Drive Marketing (folder `ZlJ5f08Jzl1GVrdDV59l9M6PgAb`) — app con của
Marketing Hub, cổng **5188**, id module `kho-media`. Không dependency npm.

```
node server.js            # http://localhost:5188  (hub tự bật khi chạy chung)
node quet-drive.js        # quét lại toàn Drive → du-lieu/cay.json (~30 phút)
```

## Vì sao phải tự lập chỉ mục

68% ảnh/video có tên máy đặt (`IMG_2511.MOV`, `C0042.MP4`) — nội dung nằm ở **đường dẫn thư
mục**. `drive +search` của Lark chỉ khớp tên file ("Wyndham" ra 1 kết quả trong khi 2.198 file
nằm trong thư mục Wyndham), nên app tìm trên đường dẫn + mô tả AI.

## Thành phần

| Tệp | Việc |
|---|---|
| `chi-muc.js` | Dựng danh sách media từ `du-lieu/cay.json`. **Luật loại dữ liệu nhạy cảm nằm ở đây, một chỗ duy nhất**: thư mục cá nhân/nhân sự, tên có số điện thoại, CCCD/CMND/hộ chiếu. |
| `server.js` | API tìm (`/api/tim`), gợi ý khi gõ (`/api/goi-y-tim`), cây thư mục, ảnh thu nhỏ (`drive +cover`), phát video (bản MP4 1080p Lark tự chuyển mã, `drive +preview`), tải file gốc (`drive +download`, có tiến độ), Tổng quan cho hub. |
| `hoc.js` | Tìm kiếm tự học: lượt bấm/phát/tải/ghim sau một lần tìm → media lên hạng cho câu đó; từ đồng nghĩa `du-lieu/hoc/dong-nghia.json`. |
| `tac-nghiep.js` | Lịch tác nghiệp "Đã hoàn tất" có link thư mục Lark Drive → quét ngay (15 phút/lần), gắn tên lịch, đưa lên tab Nổi bật "Mới từ tác nghiệp". |
| `san-pham.js` | Sản phẩm đang đẩy (Base Sản phẩm) → gợi ý media theo lịch trình. **Không gọi `kho.tatCa()`** vì hàm đó ghi lịch đổi giá xuống Base. |
| `gan-the/` | Lượt gắn mô tả AI hằng ngày (tác vụ hẹn giờ 9:00 của app Claude, 1.000 file/lượt): `chuan-bi.js` → Claude xem tấm ghép 5×4 → `ghi-the.js`; `bao-cao-tim.js` cho phần từ đồng nghĩa. |

Mọi thứ **chỉ đọc** Drive và Lark Base. `du-lieu/` (chỉ mục, thẻ, ảnh đệm, file gốc đệm tối đa
5 GB, nhật ký tìm) không lên git.

## Chỉ chạy trên máy nội bộ

Module khai `"chiMay": true` trong `lark-mkt-hub/modules.json`: trên Render (chế độ api) hub
coi như không có app này. Lý do: đọc Drive bằng `lark-cli` với danh tính người ngồi máy, và
chỉ mục/ảnh đệm nằm trên ổ đĩa (Render xoá ổ đĩa mỗi lần deploy/ngủ). Muốn chạy online cần:
chia sẻ thư mục Drive cho app Marketing Hub, thay lark-cli bằng API gọi bằng token app, và
chỗ lưu bền cho chỉ mục + ảnh đệm.
