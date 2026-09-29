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

## Hai chế độ: máy nội bộ và bản online (Render)

App Marketing Hub **không liệt kê được** thư mục Drive Marketing (403) nhưng **đọc được từng
file** đã chia sẻ trong công ty (ảnh thu nhỏ, bản 1080p, file gốc, kể cả theo đoạn). Nên chia việc:

| | Máy nội bộ (có `du-lieu/cay.json`) | Bản online (`LARK_APP_ID/SECRET`, không có cay.json) |
|---|---|---|
| Chỉ mục | quét Drive bằng lark-cli (`quet-drive.js`), gắn thẻ AI, theo dõi lịch tác nghiệp | tải **gói chỉ mục** 10 phút/lần (`napGoiOnline`) |
| Ảnh/video/file gốc | lark-cli + đệm trên ổ đĩa | `lark-api.js` chuyển thẳng luồng từ Lark (giữ Range/206), ảnh đệm RAM ≤ 40 MB |
| Gói chỉ mục | `dong-bo-len.js` đóng gói (đã lọc nhạy cảm, ~3 MB nén) và **ghi đè** file trên Drive sau mỗi lần dữ liệu đổi (≤ 10 phút/lần) | chỉ đọc |

Gói nằm ở Drive Marketing › `Hệ thống · Kho media (không xoá)` — mã thư mục/file trong
`dong-bo.json`. **Xoá hoặc chuyển file đó là bản online mất chỉ mục.** Bản online chỉ mới bằng
lượt đẩy gần nhất của máy nội bộ: máy tắt thì online vẫn chạy, chỉ không có file mới.

Hub chạy app với `--max-old-space-size=200` (chỉ mục ~55 MB heap): vượt trần thì chỉ app này dừng.
Cờ `chiMay` trong modules.json (hub `config.js`) vẫn còn cho app nào thật sự chỉ chạy được ở máy.
