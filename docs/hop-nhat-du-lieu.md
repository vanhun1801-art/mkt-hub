# Hợp nhất lớp dữ liệu Marketing Hub

Nhánh làm việc: `hop-nhat-du-lieu` (tách từ `main` ngày 2026-09-29).
Mục tiêu: các app trao đổi dữ liệu liền lạc, ít gọi Lark hơn, số liệu khớp nhau
mọi nơi, sửa một chỗ có hiệu lực toàn hệ.

Tài liệu này là **nguồn sự thật về tiến độ**. Ai (người hay Claude Code, ở máy
nào) tiếp tục việc này thì đọc mục "Đang dở" và "Cách tiếp tục" trước.

## Vì sao phải làm (khảo sát 2026-09-29)

| Vấn đề | Bằng chứng |
|---|---|
| 13 bản `lark.js` + 12 bản `larkapi.js` gần giống nhau nhưng đã trôi khác | md5 khác nhau, diff OTA ↔ Quỹ chi phí 387 dòng; tên hàm lệch (`listAll` / `listAllRecords`) |
| Cùng Base bị nhiều app đọc, mỗi app một bộ đệm | KOL + Sản phẩm cùng Base `N7Cjb…`; Bảng công việc + Báo cáo + Hub KPI cùng cần Tracking |
| Hub lấy số liệu bằng HTTP sang từng app con, app con lại gọi Lark | `lark-mkt-hub/kpi.js` gọi `/api/tong-quan`, `/api/tasks`…; lượt đầu Tổng quan 11,6 s |
| Cấu hình rải rác | Base token cứng trong 12 `config.js`; open_id anh Hùng cứng trong 3 file |
| `khung-xuong.js` nhân bản y hệt 14 lần | md5 giống nhau ở 14 app |

## Kế hoạch 4 bước

### Bước 1 — Một lớp Lark dùng chung (`lark-chung/lark-core.js`)
- Gộp phần lõi của 13 `lark.js` và 12 `larkapi.js` thành một module, giữ đúng
  hai chế độ `cli` (máy cá nhân) và `api` (Render).
- Mỗi app giữ lại `lark.js` **mỏng**: `require('../lark-chung/lark-core')(cfg)`
  cộng các hàm riêng của app (ví dụ `chiaLo` ở Social, `ganTep` ở KOL).
- Tên hàm: lõi cung cấp **cả hai tên** (`listAll` và `listAllRecords`…) để
  không app nào phải đổi chỗ gọi.
- Kiểm chứng: chạy test sẵn có của từng app (`node --test` trong thư mục app),
  chạy hub ở chế độ cli, mở từng app trên trình duyệt.

### Bước 2 — Bộ đệm dữ liệu tập trung ở Hub
- Hub đọc mỗi Base một lần, giữ trong bộ nhớ có TTL, phát cho app con qua một
  đường nội bộ `/noi-bo/base/<token>/<table>`.
- App con dùng lõi bước 1 với tuỳ chọn `quaHub: true` → đọc từ Hub thay vì Lark;
  ghi vẫn đi thẳng Lark rồi báo Hub làm tươi.
- Chạy lẻ (không có hub) thì tự về đọc Lark trực tiếp — không được gãy.

### Bước 3 — Một file cấu hình gốc (`lark-chung/cau-hinh.js`)
- Toàn bộ Base token, table id, App ID, danh sách quản lý ở một chỗ, đọc từ env
  trước rồi mới tới mặc định.
- 12 `config.js` chỉ còn `require` từ đó.

### Bước 4 — Gom khung xương giao diện
- Một bản `khung-xuong.js` ở `lark-chung/public/`, hub phục vụ cho 14 app qua
  `/chung/khung-xuong.js`.

## Nhật ký tiến độ

- 2026-09-29 · Khảo sát xong, dựng đồ thị Graphify (`graphify-out/`, không lên
  git). Tạo nhánh, viết tài liệu này và `CLAUDE.md`.
- 2026-09-29 · **Bước 1 xong.** `lark-chung/lark-core.js` (~600 dòng) thay cho
  13 `lark.js` + 12 `larkapi.js` (~6.000 dòng). 12 app đã chuyển: mỗi app còn
  `lark.js` và `larkapi.js` vài dòng gọi `taoLark(cfg, { ho, bangMacDinh, thuMuc })`.
  Chỉnh ảnh và Sản phẩm giữ thêm hàm riêng (guiTin rẽ sang tin-app; uploadAttachment
  nhận Buffer). Hub (`lark-mkt-hub/base-lark.js`) CHƯA chuyển — nó theo kiểu
  khác (khoá theo TÊN cột), để sang bước 2.
  Kiểm chứng: chạy toàn bộ test 13 app trên bản `main` sạch và trên nhánh, so
  từng dòng pass/fail: **giống hệt** (3 test Ads + 1 test Quỹ chi phí vốn đã
  fail vì thiếu dữ liệu cục bộ). Bật hub ở chế độ cli, gọi API của 9 app qua
  proxy: đều trả dữ liệu thật.
  Cải thiện kèm theo, áp dụng cho MỌI app: chia lô ghi theo cả số dòng lẫn độ
  dài JSON (trước chỉ Social có), chờ lệch nhau khi quá nhịp (trước chỉ chế độ
  api có), câu lỗi "chưa đăng nhập lark-cli" nói rõ chuyện PowerShell Admin.

- 2026-09-29 · **Bước 2 xong (kho Base dùng chung ở hub).**
  - `lark-mkt-hub/kho-base.js`: hub giữ bộ đệm TTL 10 s (đổi bằng
    `HUB_KHO_TTL_MS`) theo (danh tính, base, bảng, trang); gộp lượt đọc trùng
    (hai app hỏi cùng trang cùng lúc → Lark bị đọc một lần); đường nội bộ
    `GET /_noi-bo/kho/<base>/<table>/records|fields`, `POST …/lam-tuoi`, chỉ
    nhận từ 127.0.0.1 kèm khoá `HUB_KHOA_NOI_BO` (cùng khoá với `/_noi-bo/nhip`).
  - `lark-chung/kho-hub.js`: phía app con. Ba nguyên tắc như `nhip-lark.js`:
    không có hub thì im; hub hỏng thì tự đọc Lark, không bao giờ chặn việc thật;
    hỏng 3 lần liên tiếp thì nghỉ hỏi một phút. Tắt: `HUB_KHO_TAT=1`.
  - `lark-core.js` bọc tầng thấp: đọc trang / đọc cột hỏi hub trước; mọi thao
    tác ghi xong thì báo hub `lam-tuoi`. `getRecord` (đọc một bản ghi, dùng cho
    phân quyền) CỐ Ý không qua kho. App muốn né kho: `taoLark(cfg, { khongQuaHub: true })`.
  - Hub truyền `HUB_KHO_URL` cho app con qua `kids.datEnv` trong `server.js`.
    Hub tự đọc bảng của nó qua `base-lark.js` chưa qua kho (để sau).
  - Test mới: `lark-chung/test/lark-core.test.js` (32), `lark-mkt-hub/test/kho-base.test.js` (19).
  - Bốn test tĩnh của hub (`qua-nhip`, `han-gio-ra-ngoai`, `chiu-lark-chan`)
    trước đây đọc thẳng 12 bản `larkapi.js` để chắc "12 bản giống nhau"; nay
    app nào uỷ quyền cho lõi thì test soi lõi thay cho app. `mot-app` bỏ qua
    `graphify-out/`.
  - **Bài học đau:** KHÔNG chạy `test/chay-het.js` của hub khi hub thật đang
    chạy ở cổng 5180 — test đánh vào hub thật (đăng nhập quản lý) và test
    "nhân sự xoá base" đã xoá thật module Bảng công việc khỏi `modules.json`
    (đã khôi phục bằng git). Tắt hub trước khi chạy test.

## Đang dở

- Bước 3 (một file cấu hình gốc): chưa bắt đầu. Việc đầu tiên: liệt kê mọi
  Base token / table id / open_id cứng trong 12 `config.js` (lệnh gợi ý:
  `grep -rhoE "'[A-Za-z0-9]{27}'" lark-*/config.js | sort | uniq -c`), thiết kế
  `lark-chung/cau-hinh.js` đọc env trước rồi mới tới mặc định.

## Cách tiếp tục (ở bất kỳ máy nào)

```bash
git fetch origin
git checkout hop-nhat-du-lieu
git pull
```

Rồi nói với Claude Code: "đọc docs/hop-nhat-du-lieu.md và làm tiếp mục Đang dở".
Máy nào cũng cần `lark-cli` đã đăng nhập để chạy chế độ cli.

## Cách kiểm chứng trước khi gộp vào main

1. `node --test` trong từng app đã chuyển (xem danh sách trong nhật ký).
2. `cd lark-mkt-hub && node server.js`, mở http://localhost:5180, bấm qua 16 app.
3. Đẩy nhánh lên, tạo PR, để Render Preview (nếu bật) hoặc deploy tay lên
   service `mkt-hub-tam` sau giờ làm.
