# Gộp cả hệ về một app Lark — "Marketing Hub"

**App duy nhất:** `cli_aa1a8ae21a78ded2`
<https://open.larksuite.com/app/cli_aa1a8ae21a78ded2>

Anh Hùng, 19/09/2026: *"Anh muốn không còn liên quan đến app Tracking hay Ads
hay ShootFlow nữa."*

Việc nặng nhất — đổi app nền tảng — **đã xong từ 16/09/2026**, chỉ là mã nguồn
và tài liệu chưa dọn theo. Tài liệu này ghi lại hiện trạng đo được, phần còn
lại phải làm, và những chỗ có thể đau nếu ai đó đổi ngược.

---

## 1. Đo, đừng đoán

Bản deploy đang đăng nhập bằng app nào — hỏi thẳng nó:

```bash
curl -s -o /dev/null -w "%{redirect_url}\n" https://mkt-hub-w6hi.onrender.com/auth/login
```

Đo ngày 19/09/2026:

```
…/authen/v1/authorize?app_id=cli_aa1a8ae21a78ded2&redirect_uri=…
```

**`LARK_APP_ID` trên Render = Marketing Hub.** Trước đó `render.yaml` cắm sẵn
`value: cli_aa04305ecd385ed1` và báo cáo đọc theo file đó là **sai** — giá trị
thật nằm ở dashboard Render, không phải ở kho mã. Đó là lý do biến này giờ để
`sync: false`: không còn con số nào trong kho mã để tin nhầm nữa.

Suy ra, không cần kiểm thêm: `LARK_APP_SECRET` cũng đã là của Marketing Hub
(id lệch secret thì tenant token hỏng và Tổng quan trống trơn), và **9 Base đã
chia sẻ cho Marketing Hub** (không thì mỗi thẻ đều `91403`).

---

## 2. Hiện trạng dính vào app cũ

Quét cả kho mã, chỉ có ba App ID xuất hiện:

| App ID | Tên trong Console | Còn dính gì |
|---|---|---|
| `cli_aa1a8ae21a78ded2` | **Marketing Hub** | **tất cả** — Base, đăng nhập, tin nhóm |
| `cli_aa04305ecd385ed1` | app thử nghiệm cũ | **không còn gì** — chỉ còn tên trong tài liệu |
| `cli_aaeafc646039ded1` | Lê Văn Hùng's Lark CLI | chỉ chạy ở máy cá nhân (chế độ `cli`) |

**Adsverting và ShootFlow không dính gì cả** — không App ID, không biến môi
trường, không một lời gọi nào trong toàn bộ kho mã.

Vậy phần còn lại chỉ là **bộ khoá thứ hai còn thừa**: `ANH_TIN_APP_ID` /
`ANH_TIN_APP_SECRET` trên Render vẫn đang khai lại đúng app đó một lần nữa. Hai
bản sao của cùng một secret là hai chỗ phải nhớ cập nhật, và là cách để trạng
thái "hai app" lặng lẽ quay lại.

### App này đang gánh gì

- **Base** — tenant token đọc/ghi 9 Base:

  | Base | App con |
  |---|---|
  | `E2nYbb69OaJxdVs0nGGlHTy5g0f` | KPI |
  | `IQfUbtDDZacFdCsl657l9hOPged` | Quỹ chi phí |
  | `IqK1b8mdSapQaIsYhavlMMxzgQf` | Báo cáo |
  | `JhZtbxv0gamk5ys3Fr0luHnsgwG` | Công việc — **và** Phân quyền + Thông báo + ô phát của hub |
  | `OzF9bSPkPamYQHsNcU8lmMVQgFb` | Chỉnh ảnh |
  | `U8bAbfnwgalWgDsEU11lpHfPgTb` | Lịch tác nghiệp |
  | `WmWvbjjFQaiRmjsd3Z7lumQXgeb` | Ads |
  | `XrMkbW5FPaQlHpsMSN8lQFO9geW` | OTA |
  | `YzgUbMS3PaE0B9sDtdIlNYzFgsc` | Social |

- **Đăng nhập** — `authen/v1/authorize` → `oidc/access_token` → `user_info`,
  redirect về `PUBLIC_URL/auth/callback`.
- **Đọc thành viên nhóm Phòng MKT** (`im/v1/chats/…/members`) để tick sẵn người
  nhận thông báo.
- **Gửi tin** vào nhóm và cho cá nhân, từ hub và từ năm app con.

---

## 3. Việc còn phải làm

### 3.1 Trong kho mã — đã xong ở lần sửa này

- `ANH_TIN_APP_*` và `SOCIAL_TIN_APP_*` **tự lùi về `LARK_APP_*`** khi không
  khai. Nhóm vẫn chỉ thấy một người gửi, mà không phải giữ bản sao thứ hai của
  cặp khoá. Chốt bằng phép thử trong `lark-chinh-anh/test/api.test.js`.
- `render.yaml` bỏ `value:` của `LARK_APP_ID`, bỏ hẳn hai biến `ANH_TIN_APP_*`.
- Log khởi động của hub in cảnh báo nếu app gửi tin **khác** app nền tảng.

Deploy bản này trước, rồi mới làm 3.2 — thứ tự ngược lại thì có một quãng
`tin-app.js` tự tắt.

### 3.2 Trên Render — sau khi bản trên đã chạy

Trong dashboard service `mkt-hub` → Environment, **xoá hai biến**:

- `ANH_TIN_APP_ID`
- `ANH_TIN_APP_SECRET`

Không phải thêm gì. Xong thì log khởi động không được có dòng
`⚠ Đang chạy HAI app Lark`.

### 3.3 Trong Lark Developer Console — sau cùng

Xoá hẳn **app thử nghiệm cũ** `cli_aa04305ecd385ed1`, **Adsverting** và
**ShootFlow**.

Xoá app là **thu hồi mọi quyền của nó trên mọi Base**. Nên làm sau khi 3.2 đã
chạy ổn vài ngày, đừng làm cùng ngày. Giữ lại `cli_aaeafc646039ded1`
(Lê Văn Hùng's Lark CLI) — đó là app lark-cli buộc vào máy cá nhân, không liên
quan bản deploy.

---

## 4. Nghiệm thu

1. `GET /healthz` → `{ ok: true, build: … }`, `build` phải là commit vừa đẩy.
2. `curl` lệnh ở mục 1 → vẫn `app_id=cli_aa1a8ae21a78ded2`.
3. **Tổng quan** đủ 9 thẻ có số → tenant token đọc được cả 9 Base.
4. **Cài đặt → Nhận diện thương hiệu**: chip **"Lark Base"** xanh → tenant token
   *ghi* được Base. Đỏ thì đọc mã lỗi Lark ngay trên chip; gần như chắc chắn là
   Base `JhZtbxv0gamk5ys3Fr0luHnsgwG` chưa chia sẻ quyền **sửa**.
5. Gửi thử một tin từ app Chỉnh ảnh vào **nhóm thử của riêng anh Hùng** — không
   gửi vào nhóm thật của phòng. Người gửi phải là Marketing Hub.
6. Panel Thông báo còn tick sẵn được người trong nhóm Phòng MKT.

Bước 3–6 không đổi so với trước 3.2, vì cả trước và sau đều là cùng một app —
đây là chỗ khiến bước này rẻ: không có gì để hỏng.

---

## 5. Vì sao đổi app nền tảng lại đáng sợ (và lần tới thì làm sao)

`open_id` cấp **theo từng app**, nên đổi app là mọi người có id mới. Đo thật:
anh Hùng là `ou_f0d3514a…` ở máy, `ou_49d2cc26…` trên Render. Đã rà từng chỗ
lưu id:

| Chỗ | Kết quả |
|---|---|
| `LARK_MANAGER_EMAILS` | **an toàn** — khai bằng email; `LARK_MANAGER_IDS` đang tắt |
| Bảng Phân quyền trên Base | **an toàn** — `quyen.js` khớp email trước, rồi tự vá open_id mới vào dòng đó |
| Danh sách nhóm MKT | **an toàn** — `nhom-lark.js` cố ý chỉ lưu tên, không lưu id |
| `thong-bao.json` | **an toàn** — khoá là `email \|\| id`, mà file này vốn mất mỗi lần deploy |
| Ô "Đã đọc" của thông báo trên Base | **lệch một lần** — `thongbao-app.js` lưu `open_id@thời-điểm`, nên thông báo cũ hiện lại là chưa đọc |
| Phiên đăng nhập | mọi người **đăng nhập lại một lần** |

Không chỗ nào cần script chuyển dữ liệu. Nếu lần sau lại phải đổi app nền tảng,
làm đúng ba việc ở Console trước — scope + **Redirect URL** `PUBLIC_URL/auth/callback`
+ chia sẻ 9 Base quyền sửa (Base nằm trong wiki thì chia sẻ ở cấp knowledge
space, chia sẻ riêng từng Base là chưa đủ) — rồi đổi `LARK_APP_ID` và
`LARK_APP_SECRET` **trong cùng một lần Save**. Lưu lẻ là có một quãng id lệch
secret và cả hub chết.

---

## 6. Quay đầu

Dán lại App ID + Secret cũ vào hai biến trên Render, lưu một lần. Không có thay
đổi nào ở Base hay ở mã nguồn cần hoàn tác.
