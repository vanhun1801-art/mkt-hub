# Marketing Hub — hướng dẫn cho Claude Code

Đọc file này trước khi làm bất cứ gì trong repo.

## Dự án là gì
Bộ 16 app Node thuần (không npm dependency) của phòng Marketing Rooty Trip Phú
Quốc, làm việc với Lark Base. `lark-mkt-hub` là lớp vỏ, tự bật các app con và
proxy vào một cổng. Chi tiết: `README.md`, `render.yaml`.

## Hai chế độ, một bộ code
- `cli`: máy cá nhân, đọc/ghi Lark qua phiên `lark-cli` của máy. Chạy
  `cd lark-mkt-hub && node server.js`, mở http://localhost:5180.
- `api`: server chung (Render, service `mkt-hub-tam`,
  https://mkt-hub-w6hi.onrender.com). Bật khi có `LARK_APP_ID` + `LARK_APP_SECRET`.
- **Không bật hub từ PowerShell quyền Admin** trên Windows: token lark-cli nằm
  trong kho mật khẩu của phiên thường, phiên Admin không thấy → mọi app trả 500.

## Quy ước
- Code, tên hàm, tên biến, comment, commit message: **tiếng Việt không dấu cho
  tên, có dấu cho comment và commit**. Giữ giọng của repo (giải thích *vì sao*
  ngay trong comment).
- Không thêm dependency npm. Không để secret trong repo (`.gitignore` gốc là
  whitelist: `/*` rồi mở từng thư mục; thư mục mới phải thêm dòng `!ten-thu-muc/`).
- Test: `node --test` trong thư mục app (thư mục `test/`).
- Thư mục `du-lieu/` của các app là dữ liệu cục bộ, không commit.

## Việc đang làm
Hợp nhất lớp dữ liệu, nhánh `hop-nhat-du-lieu`. Kế hoạch, tiến độ và cách tiếp
tục: **`docs/hop-nhat-du-lieu.md`**. Cập nhật mục "Nhật ký" và "Đang dở" của
file đó sau mỗi mốc, rồi commit và push — người ở máy khác chỉ biết qua git.

## Hiểu kiến trúc nhanh
Có đồ thị Graphify (`graphify-out/`, cục bộ, không lên git). Nếu có thư mục đó,
hỏi bằng `graphify query "<câu hỏi>"` trước khi đọc file. Nếu chưa có, dựng
bằng `/graphify .` (khoảng 5 phút, không cần API key).

## Máy móc
- Máy công ty và máy nhà anh Hùng đều có lark-cli + skill Lark. App ID của
  lark-cli mỗi máy khác nhau và khác app "Marketing Hub" trên Render; open_id
  của cùng một người khác nhau giữa các app → phân quyền dùng **email**.
