# Xin Meta duyệt để lấy lượt xem LIVE tại thời điểm phát

Soạn ngày 08/10/2026, sau khi dò bằng chính token của phòng.
Hồ sơ này **anh Hùng phải tự nộp** — nó đăng nhập tài khoản Meta Developer của
công ty và đứng tên công ty.

---

## 1. Đang bị chặn ở đâu

Gọi `GET /1175309429179128/live_videos` bằng token hiện tại, Meta trả nguyên văn:

```
(#10) To use live-video-api on behalf of people who are not admins, developers
and testers of your app, your use of this endpoint must be reviewed and approved
by Facebook.
```

- Tính năng cần duyệt tên là **`live-video-api`** (không phải một quyền `pages_*`).
- App đang dùng: **Rooty Trip Dashboard Ads** · ID `1354023099795267`.
- Token đang dùng: **System User "Rooty Data"** · ID `122100364065459618`, loại
  `SYSTEM_USER`, không hết hạn.

## 2. Hai việc nên thử TRƯỚC khi nộp hồ sơ

Câu "on behalf of people who are **not** admins, developers and testers" nghĩa là
endpoint này **vẫn chạy** cho người có vai trong app. System user không có vai,
nên bị chặn. Hai cách thử, mỗi cách vài phút, không mất gì:

**Cách A — nâng vai cho system user**

1. Mở <https://business.facebook.com/settings/system-users>
2. Chọn **Rooty Data** → **Assign assets** → tab **Apps**
3. Chọn **Rooty Trip Dashboard Ads** → bật **Full control (Develop app)**
4. Lưu, rồi báo lại để chạy thử `/live_videos`

**Cách B — thử bằng token cá nhân của anh Hùng**

1. Mở <https://developers.facebook.com/tools/explorer/>
2. Ô **Meta App** chọn **Rooty Trip Dashboard Ads**
3. **User or Page** chọn **User Token**, thêm quyền `pages_show_list`,
   `pages_read_engagement`, `read_insights`
4. Bấm **Generate Access Token**, đăng nhập bằng tài khoản của anh
5. Chép chuỗi token gửi lại — chỉ dùng để chạy thử rồi bỏ, không ghi vào đâu

Cách B trả lời dứt điểm hai câu một lúc: vai trong app có gỡ được chặn không,
và nếu gỡ được thì `live_views` của một phiên **đã tắt sóng** có còn số không.

## 3. Vì sao em khuyên đừng nộp hồ sơ ngay

Ba dữ kiện, đều tra từ tài liệu chính thức của Meta:

1. **`live-video-api` là tính năng để PHÁT live, không phải để đọc số.** Trang
   tổng quan của Live Video API chỉ nói về tạo `LiveVideo`, lấy URL RTMPS, đẩy
   luồng, tạo poll. Không một dòng nào về đọc thống kê người xem.
2. **Tài liệu của chính cạnh `/{page-id}/live_videos` ghi là KHÔNG đọc được** —
   mục *Read* ghi "Bạn không thể thực hiện thao tác này trên điểm cuối này".
   Cạnh đó chỉ còn hỗ trợ `POST` để tạo phiên phát.
3. Meta duyệt theo **mục đích sử dụng**. Khai "tôi cần đọc lượt xem live của
   trang chính mình để làm báo cáo nội bộ" không khớp mục đích của tính năng,
   nên khả năng bị từ chối cao — mà mỗi vòng duyệt mất 1–3 tuần.

Nói thẳng: nộp hồ sơ này **có thể duyệt xong vẫn không lấy được số**, vì cái
chặn không chỉ là quyền mà còn là cạnh API đã ngừng cho đọc.

## 4. Nếu vẫn nộp — hồ sơ đã soạn sẵn

### Điều kiện bắt buộc phải xong trước

| Việc | Chỗ làm |
|---|---|
| Business Verification cho Rooty Trip | Business Settings → Security Centre |
| URL chính sách bảo mật công khai | App Dashboard → Settings → Basic |
| Biểu tượng app 1024×1024 | App Dashboard → Settings → Basic |
| App chuyển sang chế độ **Live** | thanh trên cùng App Dashboard |
| Data Use Checkup còn hạn | App Dashboard → thông báo đầu trang |

### Đường bấm

App Dashboard → **App Review** → **Permissions and Features** → tìm
`live-video-api` → **Request advanced access**.

### Phần "How will you use this feature?" (nộp bằng tiếng Anh)

> Rooty Trip is a tour operator in Phu Quoc, Vietnam. We operate the Facebook
> Pages listed on this app and broadcast live from our own tours several times a
> week.
>
> We have built an internal reporting tool, used only by our own marketing staff,
> that collects performance data for the Pages we own. It is not a public product
> and has no external users.
>
> We need the `live-video-api` feature to read the `live_views` field of live
> broadcasts published by our own Pages. The Video Insights endpoint only returns
> lifetime figures for the video after the broadcast has ended, which include
> replay views. We cannot separate the audience that watched during the broadcast
> from people who watched the recording later, and that distinction is what we use
> to judge whether a live session was worth running.
>
> We only read data for Pages we own and administer. We do not create, modify or
> delete live videos. We do not read any other Page's data. No personal data is
> collected, stored or shared — only aggregate counts per broadcast.

### Phần "Step-by-step instructions" cho người duyệt

> This app has no public interface. The data is read by a scheduled server-side
> job and written to an internal Lark Base used by our marketing team.
>
> 1. The server authenticates with a Business system user token for the app.
> 2. It calls `GET /{page-id}/live_videos?fields=id,title,broadcast_start_time,live_views`
>    for each Page we own.
> 3. The returned `live_views` value is stored against the matching broadcast row.
> 4. Our staff open the internal report and see, per broadcast, how many people
>    watched while it was live versus the total view count afterwards.
>
> A screencast of step 4 is attached.

### Kịch bản quay màn hình (Meta bắt buộc có)

Quay 60–90 giây, có tiếng hoặc phụ đề tiếng Anh:

1. Mở Marketing Hub → **Báo cáo & KPI** → tab **Báo cáo**.
2. Cuộn tới khối **LIVE**, dừng ở bảng *Lượt xem đo theo cách nào* — chỉ vào ô
   "Trong lúc phát" của Facebook đang để trống, nói rõ đây là ô cần tính năng này.
3. Cuộn tới bảng **Phiên LIVE Facebook**, chỉ vào cột Lượt xem, nói đây là số
   sau khi tắt sóng, gồm cả người xem lại.
4. Mở app Social → tab **LIVE** cho thấy đây là công cụ nội bộ, đăng nhập bằng
   tài khoản công ty, không mở cho người ngoài.

## 5. Đường khác, có ngay hôm nay, không cần duyệt

`/video_insights` đang chạy tốt và trả về **khoảng 50 chỉ số** mà báo cáo chưa
dùng tới. Đo trên phiên 06/10 (22k lượt xem):

| Chỉ số | Giá trị | Nói lên điều gì |
|---|---|---|
| `total_video_10s_views` | 2.700 | xem từ 10 giây — lọc bớt người lướt qua |
| `total_video_30s_views` | 904 | xem từ 30 giây |
| `total_video_60s_excludes_shorter_views` | 395 | xem trên 1 phút |
| `total_video_view_total_time` | ~53 giờ | tổng thời gian người ta đã xem |
| `total_video_avg_time_watched` | 9,6 giây | xem trung bình mỗi lượt |
| `total_video_impressions_organic` | 17.396 | số lần hiển thị — cột đang trống |
| `total_video_retention_graph` | đường cong | người xem rơi ở phút thứ mấy |

**Số "xem từ 30 giây" và "tổng thời gian xem" đánh giá chất lượng một phiên LIVE
sát hơn lượt xem thô**, vì 22k lượt xem mà xem trung bình 9,6 giây thì phần lớn
là người lướt qua. Mấy cột này lấy được ngay, không phải xin ai.
