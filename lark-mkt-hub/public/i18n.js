'use strict';
/*
 * NGÔN NGỮ — Tiếng Việt / English cho CẢ BỐN APP.
 *
 * Cách làm: dịch ở tầng DOM thay vì rải t('...') khắp 4 app (~10k dòng). Lớp vỏ
 * nạp file này, rồi tự chèn nó vào từng app con qua shim của proxy — nên chỉ có
 * MỘT từ điển cho cả hệ, thêm chữ mới chỉ sửa một chỗ.
 *
 * Chỉ dịch khi TOÀN BỘ nội dung một text node khớp đúng một khoá (hoặc khớp một
 * mẫu regex). Nhờ vậy dữ liệu thật — tên công việc, tên người, tên chiến dịch —
 * không bao giờ bị dịch, vì chúng không trùng nhãn giao diện. Thêm một lớp chắn
 * nữa: bỏ qua mọi node nằm trong vùng chứa dữ liệu (khai ở BO_QUA).
 *
 * Giá trị gửi lên server KHÔNG đổi: chỉ text node và placeholder/title được dịch,
 * còn `value` của <option> vẫn nguyên tiếng Việt như trong Base.
 */
(function () {
  if (window.__I18N__) return;                 // tránh nạp hai lần

  /* ---------------- từ điển: khớp nguyên câu ---------------- */
  const EN = {
    /* --- lớp vỏ: panel & đầu trang --- */
    'Marketing Hub': 'Marketing Hub',
    'Rooty Trip Phú Quốc': 'Rooty Trip Phu Quoc',
    'Tổng quan chung': 'Overview',

    /* --- lớp phủ khi khung app con dính trang lỗi (phuLoi trong app.js) ---
     * Trang loi.html đứng một mình, KHÔNG nạp file này (lúc nó hiện ra thì
     * server thường đã chết), nên bản tiếng Anh chỉ có ở lớp phủ này. */
    'Ma-Két đang cố gắng khắc phục sự cố': 'Ma-Két is working on the fix',
    'Đang thử lại…': 'Retrying…',
    'Thử lại ngay': 'Retry now',

    /* --- thông báo --- */
    'Thông báo': 'Notifications',
    'Chưa đọc': 'Unread',
    'Đã đọc': 'Read',
    'mới': 'new',
    'Mốc thời gian là lúc diễn ra việc. Tự cập nhật từ các Base — xử lý xong là mục tự mất.':
      'Times shown are when the work happens. Updated automatically — an item disappears once handled.',
    'Chờ tiếp nhận': 'Awaiting pickup',
    '7 ngày': '7 days',
    '30 ngày': '30 days',
    'Tất cả': 'All',
    'Mọi base': 'All bases',
    'Chỉ chưa đọc': 'Unread only',
    'Xem hết': 'Show all',
    // nhãn dòng gộp các ô bằng 0 ở Tổng quan chung
    'Không có': 'None',
    'Không có mục nào khớp bộ lọc.': 'Nothing matches this filter.',
    'Mốc thời gian là lúc diễn ra việc. Xử lý xong là mục tự mất.':
      'Times shown are when the work happens. An item disappears once handled.',
    'Yêu cầu điều chỉnh': 'Change request',
    'Yêu cầu điều chỉnh chờ trả lời': 'Change request awaiting reply',
    'Đã xử lý': 'Handled',
    'Mở việc': 'Open task',
    'Báo cáo còn dở dang': 'Report still incomplete',
    'Nháp để quá lâu': 'Draft left too long',
    'Lịch đã được duyệt': 'Schedule approved',
    'Lịch bị từ chối': 'Schedule rejected',
    'Lịch đã bị huỷ': 'Schedule cancelled',
    'Lịch đã đổi sau khi duyệt': 'Schedule changed after approval',
    'Phản hồi của quản lý': "Manager's reply",
    'đã giao nhưng chưa ai bấm nhận': 'assigned but nobody has picked it up',
    'Không có việc nào ở nhóm này.': 'No tasks in this group.',
    'Đã chấm điểm': 'Scored',
    'Đã hoàn thành': 'Completed',
    'Cần làm ngay': 'Do it now',
    'Thông tin': 'For your information',
    'Không có gì cần bạn để mắt. Nhẹ người.': 'Nothing needs your attention. Enjoy.',
    'Tự cập nhật từ dữ liệu các Base — xử lý xong là mục tự mất.':
      'Updated automatically from your Bases — an item disappears once handled.',
    'Lịch chờ duyệt kế hoạch': 'Schedule waiting for plan approval',
    'Xin huỷ lịch': 'Cancellation request',
    'Yêu cầu vé FOC chờ phản hồi': 'FOC ticket request awaiting reply',
    'Yêu cầu nhân sự Media chờ phản hồi': 'Media staff request awaiting reply',
    'Báo cáo chờ nghiệm thu': 'Report awaiting sign-off',
    'Lịch bị trả về': 'Schedule sent back',
    'Hôm nay đi tác nghiệp': 'Fieldwork today',
    'Ngày mai đi tác nghiệp': 'Fieldwork tomorrow',
    'Chưa nộp báo cáo': 'Report not submitted',
    'Đã nộp báo cáo': 'Report submitted',
    'Vé FOC đã được duyệt': 'FOC ticket approved',
    'Vé FOC bị từ chối': 'FOC ticket rejected',
    'Việc chờ tiếp nhận': 'Task waiting to be picked up',
    'Việc trễ deadline chưa xử lý': 'Overdue task not handled',
    'Việc mới giao cho bạn': 'New task assigned to you',
    'Việc bị trả về làm lại': 'Task sent back for rework',
    'Việc đã trễ deadline': 'Task past its deadline',
    'Hôm nay tới hạn': 'Due today',
    'Base đang quản lý': 'Bases you manage',
    'Đang ẩn': 'Hidden',
    'mục cũ hơn': 'older items',
    'Thêm base': 'Add base',
    'Cài đặt': 'Settings',
    'Làm mới': 'Refresh',
    'Thời gian': 'Period',
    /* Nhãn trên thanh thu gọn khối lọc của điện thoại (thugon.js). Câu tóm tắt
     * đứng cạnh nó thì KHÔNG cần khoá ở đây: nó được chép ra từ chính các nút
     * và <option> đang hiển thị, tức là đã qua tay bộ dịch này rồi. */
    'Lọc': 'Filters',
    'Tháng này': 'This month',
    'Tháng trước': 'Last month',
    'Tuần này': 'This week',
    'Tuần tới': 'Next week',
    'Tuần trước': 'Last week',
    'Năm nay': 'This year',
    'Tuỳ chỉnh': 'Custom',
    'Tùy chỉnh': 'Custom',
    'Tháng tiếp theo': 'Next month',
    '7 ngày': '7 days',
    '14 ngày': '14 days',
    '30 ngày': '30 days',
    'Tuỳ chọn': 'Custom',
    'Tùy chọn': 'Custom',
    'Toàn bộ': 'All time',
    'Hôm nay': 'Today',
    'Về mặc định': 'Reset',
    'Xem toàn bộ': 'View all',
    'Xem tải người khác': "See others' workload",
    /* Thông báo chặn màn hình */
    'Thông báo tới nhân sự': 'Announcements',
    'Popup chặn màn hình, buộc đọc mới dùng app tiếp': 'Full-screen popup people must read before continuing',
    'Tôi đã đọc': 'I have read this',
    'Soạn thông báo': 'New announcement',
    'Sửa thông báo': 'Edit announcement',
    'Mức độ': 'Severity',
    'Tiêu đề': 'Title',
    'Nội dung': 'Body',
    'Nút hành động': 'Action button',
    'Khoảng hiển thị': 'Show between',
    'Gửi cho': 'Send to',
    'Đang gửi': 'Live',
    'Tin': 'Info',
    'Quan trọng': 'Important',
    'Gấp': 'Urgent',
    'Xem tải của ai': "Whose workload they can see",
    'Cả phòng': 'Everyone',
    'Lọc theo tên…': 'Filter by name…',
    'Xoá lọc': 'Clear filters',
    'Bỏ lọc': 'Clear filters',
    'LỌC': 'FILTER',
    'Đóng': 'Close',
    'Lưu': 'Save',
    'Xoá': 'Delete',
    'Thoát': 'Exit',
    'Huỷ': 'Cancel',
    'Hủy': 'Cancel',
    'Mở app': 'Open app',
    'Mở Base': 'Open Base',
    'Base': 'Base',
    'Mở trong Lark': 'Open in Lark',
    'Tải lại': 'Reload',
    'Sáng': 'Light',
    'Tối': 'Dark',
    'Theo hệ thống': 'System',
    'Tiếng Việt': 'Tiếng Việt',
    'English': 'English',

    /* --- trang Tổng quan chung --- */
    'Tải nhân sự': 'Workload',
    'Tải của tôi': 'My workload',
    'Dải nhiệt': 'Heatmap',
    'Theo ngày': 'By day',
    'tác nghiệp': 'field trip',
    'Cần xử lý ngay': 'Needs action now',
    'Chưa phân công': 'Unassigned',
    'Việc đang mở': 'Open tasks',
    'Quá hạn': 'Overdue',
    'Đang tiến hành': 'In progress',
    'Sắp tới hạn (48h)': 'Due soon (48h)',
    'Chờ tiếp nhận': 'Awaiting pickup',
    'Chờ duyệt': 'Awaiting approval',
    'Lịch hôm nay': "Today's trips",
    '7 ngày tới': 'Next 7 days',
    'Lịch có nguy cơ': 'Trips at risk',
    'Chưa chốt báo cáo': 'Reports not closed',
    'Chi phí dự kiến': 'Planned cost',
    'Chi phí dự kiến tháng': 'Planned cost this month',
    'Chi tiêu': 'Spend',
    'Chuyển đổi': 'Conversions',
    'Cảnh báo': 'Alerts',
    'Tổng công việc': 'Total tasks',
    'Điểm trung bình': 'Average score',
    'Tỉ lệ hoàn thành': 'Completion rate',
    'Tổng lịch': 'Total trips',
    'Sắp diễn ra': 'Upcoming',
    'Đã duyệt': 'Approved',
    'Đang báo cáo': 'Reporting',
    'Đã hoàn tất': 'Completed',
    'bản ghi đọc được': 'records readable',
    'Chưa có việc nào cần xử lý.': 'Nothing needs action.',
    'Không có việc nào khớp bộ lọc.': 'No tasks match the filter.',
    'Không có mục nào.': 'Nothing here.',
    'Đang nạp…': 'Loading…',

    /* --- cửa sổ xử lý nhanh --- */
    'Xử lý nhanh': 'Quick actions',
    'Xử lý': 'Handle',
    'Mở chi tiết': 'Open detail',
    'Bắt đầu': 'Start',
    'Hoàn thành': 'Complete',
    'Hoàn tất': 'Finish',
    'Giải quyết': 'Submit late work',
    'Nộp': 'Submit',
    'Dán link sản phẩm cuối (Drive, Figma, bài đăng…)':
      'Paste the link to the final file (Drive, Figma, published post…)',
    'Đã giải quyết': 'Submitted (late)',
    '↥ Giải quyết · nộp sản phẩm': '↥ Submit late work',
    '↥ Giải quyết · nộp sản phẩm (giữ nguyên trạng thái trễ)':
      '↥ Submit late work (keeps the late status)',
    'Phân công': 'Assign',
    'Đổi người': 'Reassign',
    'Đặt hạn': 'Set due date',
    'Đổi hạn': 'Change due date',
    'Duyệt': 'Approve',
    'Trả lại': 'Send back',
    'Chốt nhân sự': 'Assign crew',
    'Đã thanh toán': 'Mark paid',
    'Chọn người…': 'Pick a person…',
    'Đang gửi': 'Sending',
    'Không còn mục nào trong nhóm này.': 'Nothing left in this group.',
    'Đang lấy danh sách…': 'Loading list…',
    'chưa có deadline': 'no deadline',
    'chưa phân công': 'unassigned',
    'chưa có ngày': 'no date',
    'chưa có nhân sự': 'no crew',

    /* --- phân quyền --- */
    'Phân quyền nhân sự': 'Staff permissions',
    'Về Cài đặt': 'Back to settings',
    'Chọn người trong danh bạ…': 'Pick from directory…',
    'Thêm dòng': 'Add row',
    'Mở bảng trong Lark': 'Open table in Lark',
    'Người': 'Person',
    'Email': 'Email',
    'Vị trí': 'Position',
    'Vai': 'Role',
    'Base được xem': 'Visible bases',
    /* --- ai thấy base nào: base "kín" vs base mở cho cả phòng --- */
    'Ai thấy': 'Who can see',
    'Quản trị base': 'Base admin',
    'Quản lý base': 'Base admin',
    'Kín': 'Private',
    'Cả phòng': 'Whole team',
    /* Base mở bằng biến HUB_CA_PHONG — nút bấm bị khoá vì nút chỉ sửa file. */
    'Cả phòng · env': 'Whole team · env',
    'Mở bằng env': 'Opened by env',
    'Mở cả phòng': 'Open to team',
    'Đóng lại': 'Make private',
    'Cả phòng thấy base này': 'The whole team can see this base',
    'Chỉ quản lý và người được cấp tên': 'Managers and named people only',
    'Mọi base (kể cả base mới)': 'All bases (including new ones)',
    'Không base nào': 'No base',
    '— kể cả base thêm vào sau này': '— including bases added later',
    '— cả phòng đã thấy': '— whole team already sees it',
    'Kín — chỉ quản lý, cấp tên từng người sau': 'Private — managers only, grant people later',
    'Cả phòng — ai đăng nhập cũng thấy': 'Whole team — everyone signed in can see it',
    'Tùy chọn cho nhân sự': 'Staff options',
    'Quyền thêm': 'Extra rights',
    'Quyền thêm cho nhân sự': 'Extra rights for staff',
    'Nhận diện': 'Identity match',
    'Họ tên': 'Full name',
    'Vai trò': 'Role',
    'Nhân sự & phân quyền': 'Staff & permissions',

    /* ============ app Báo cáo & KPI ============
       Lớp vỏ bơm tệp này vào MỌI iframe app con và khoá theo chính chuỗi tiếng
       Việt. Thiếu khoá thì chuỗi đó ở nguyên tiếng Việt — không lỗi, không cảnh
       báo, chỉ là thanh tab nửa Anh nửa Việt. */
    'Báo cáo & KPI': 'Reports & KPI',
    'Chấm điểm KPI tháng · bộ luật tách khỏi số liệu':
      'Monthly KPI scoring · rules kept apart from data',

    /* --- tám tab --- */
    'Tiến độ KPI': 'KPI progress',
    'Tổng quan KPI': 'KPI overview',
    'Phiếu KPI': 'KPI sheets',
    'Nguồn số liệu': 'Data sources',
    /* "Phân công KÊNH" chứ không phải "Phân công" trơn — chuỗi sau đã là nút
       giao việc cho người bên Bảng công việc, dịch là "Assign". */
    'Phân công kênh': 'Channel assignment',
    'Mục tiêu & thử luật': 'Targets & rule sandbox',
    'Soát & chốt': 'Review & lock',

    /* --- thanh lọc của tab Báo cáo ---
       "Khoảng thời gian", "Năm nay", "Tháng này/trước", "Tuần này/trước" đã có
       khoá ở khối lọc chung phía trên — khai lại là khoá sau đè khoá trước mà
       không báo gì. */
    'Quý này': 'This quarter',
    'Xuất báo cáo': 'Export report',
    'Tải thẳng bảng số cho Excel': 'Download the raw figures for Excel',
    'Mở tệp báo cáo hoàn chỉnh — trong đó có nút Lưu PDF, tải HTML, tải CSV':
      'Opens the full report — it has Save as PDF, download HTML and download CSV inside',

    /* --- tiêu đề các thẻ --- */
    'Tính đến hôm nay': 'As of today',
    '% kết quả công việc theo người': 'Work completion by person',
    '% đạt mục tiêu theo kênh': 'Target attainment by channel',
    'Chi tiết từng chỉ số của từng kênh': 'Every metric of every channel',
    'Mốc theo tuần — theo người': 'Weekly milestones — by person',
    'Mốc theo tuần — theo kênh': 'Weekly milestones — by channel',
    'Sức khoẻ phòng': 'Team health',
    'Mạnh yếu hệ thống': 'Systemic strengths and weaknesses',
    'Theo nhân sự': 'By person',
    'Tăng trưởng theo kênh': 'Growth by channel',
    'Điểm tính lương': 'Payroll score',
    'Điểm chấm tay': 'Manually scored items',
    'Số máy tự lấy được': 'Figures the system fetches on its own',
    'Tải file lên': 'Upload a file',
    'Soát phân công': 'Assignment check',
    'Kênh × nhân sự': 'Channels × staff',
    'Nhân sự không chấm theo kênh': 'Staff not scored by channel',
    'Gợi ý mục tiêu từ số liệu cũ': 'Target suggestions from past figures',
    'Điểm trước → sau': 'Score before → after',
    'Đã trả lương → app tính lại': 'Paid → recomputed by the app',

    /* --- nhãn hay gặp --- */
    'Nhịp chuẩn': 'Expected pace',
    'Trung bình phòng': 'Team average',
    'Kịp nhịp': 'On pace',
    'Chưa đo được': 'Not measurable yet',
    'chưa đo được': 'not measurable yet',
    'đủ dữ liệu': 'complete',
    'chưa có nguồn': 'no source yet',
    'Đang hụt nhịp': 'Behind pace',
    'Đạt nhịp': 'On pace',
    'Còn thiếu': 'Still needed',
    'Đo được': 'Measured',
    'Xuất phiếu': 'Export sheet',
    'Xuất phiếu của tôi': 'Export my sheet',
    'Xuất văn bản KPI phòng': 'Export team KPI document',
    'Lưu phân công': 'Save assignment',
    'Chưa sửa gì': 'Nothing changed',
    'Bỏ sửa': 'Discard changes',
    'Nhập tại base nguồn': 'Enter in the source base',
    'Tải file lên đây': 'Upload a file here',
    'Người phụ trách tự chấm': 'Scored by the owner',
    'Chờ nối app': 'Waiting to be wired up',
    'Sai ở bộ luật': 'Rule set error',
    'Máy tự lấy được': 'Fetched automatically',
    'Kênh không ai nhận': 'Channels nobody owns',
    'Kênh nhiều người nhận': 'Channels owned by several people',
    'Nhân sự ăn theo kênh': 'Staff scored by channel',
    'Không đủ 100%': 'Not adding up to 100%',
    'Của tôi': 'Mine',
    'Hệ thống': 'System',
    'Từng app': 'Per app',
    'Phân quyền': 'Permissions',
    'Ai thấy base nào, ai duyệt được trong app nào': 'Who sees which base, who can approve where',
    'Địa chỉ công khai, app Lark, bản đang chạy': 'Public address, Lark app, running build',
    'Tìm thiết lập…': 'Search settings…',
    'Không có mục nào khớp.': 'Nothing matches.',
    'Thấy base nào · quyền từng người': 'Base visibility · per-person rights',
    'Ai là quản lý bên trong từng app': 'Who manages inside each app',
    'Phân phối việc mới': 'New-task distribution',
    'Quản lý của app này': "This app's managers",
    'Thiết lập riêng của app này.': 'Settings that belong to this app.',
    'Ai duyệt được trong từng app': 'Who can approve inside each app',
    'Phân phối công việc': 'Task distribution',
    'Tự giao việc mới theo tỷ lệ': 'Auto-assign new tasks by ratio',
    'Mở màn phân phối': 'Open the distribution screen',
    /* --- Nhận diện thương hiệu --- */
    'Nhận diện thương hiệu': 'Brand identity',
    'Logo đóng lên tệp xuất ra': 'Logo stamped on exported files',
    'Logo này được nhúng thẳng vào mọi tệp báo cáo các app xuất ra, nên tệp gửi đi đâu cũng thấy.':
      'This logo is embedded directly into every report the apps export, so it travels with the file.',
    'Logo hiện dùng': 'Current logo',
    'Định dạng nhận vào': 'Accepted formats',
    'PNG · JPG · SVG · WEBP, tối đa 2 MB. Nên dùng bản nền trong suốt (PNG hoặc SVG) vì báo cáo in ra nền trắng. Chỉ giữ MỘT tệp — tải bản mới là bản cũ bị thay.':
      'PNG · JPG · SVG · WEBP, up to 2 MB. Prefer a transparent version (PNG or SVG) — reports print on white. Only ONE file is kept; uploading a new one replaces the old.',
    'Chưa có tệp nào. Báo cáo đang in tạm bằng chữ theo màu thương hiệu.':
      'No file yet. Reports fall back to a text wordmark in the brand colour.',
    'chưa có logo': 'no logo yet',
    'Tải ảnh lên': 'Upload image',
    'Đổi ảnh': 'Replace image',
    'Gỡ': 'Remove',
    /* --- Của tôi: tài khoản + thiết lập chung --- */
    'Tài khoản': 'Account',
    'Tên': 'Name',
    'Thiết lập chung': 'General settings',
    'Máy cá nhân — dùng thẳng phiên lark-cli, không đăng nhập vào hub.':
      'Personal machine — uses the lark-cli session directly, no hub sign-in.',
    'Chưa đọc được tài khoản.': 'Could not read the account.',
    'Email phụ': 'Secondary email',
    'Mã Lark (open_id)': 'Lark ID (open_id)',
    /* --- video giới thiệu: nhiều video, phát luân phiên --- */
    'Video giới thiệu': 'Intro video',
    'Chưa có video': 'No video yet',
    'Chưa có gì để phát': 'Nothing to play yet',
    'Lưu ý: tệp ở đây KHÔNG sống qua lần deploy': 'Heads-up: files here do NOT survive a deploy',
    'Ổ đĩa của máy chủ là ổ tạm — mỗi lần deploy là dựng lại từ kho, nên video/ảnh tải lên qua đây sẽ mất. Muốn giữ lâu thì gắn đĩa lưu cho service, hoặc nhờ đưa tệp thẳng vào kho mã nguồn.':
      'The server disk is ephemeral — every deploy rebuilds it from the repo, so video/images uploaded here are lost. To keep them, attach a persistent disk to the service, or have the file committed to the repo.',
    'ổ tạm': 'ephemeral disk',
    'Chưa đặt video hay ảnh nào — trang Tổng quan chỉ hiện bảng tin.':
      'No video or image set — the Overview shows only the news column.',
    'Tải lên': 'Upload',
    'Thêm video hoặc ảnh': 'Add video or image',
    'Đang tải lên…': 'Uploading…',
    'Đã thêm vào ô phát': 'Added to the rotation',
    'Chưa đặt video nào — trang Tổng quan chỉ hiện bảng tin.':
      'No video set — the Overview shows only the news column.',
    'Tải video lên': 'Upload video',
    'Thêm video': 'Add video',
    'Thay': 'Replace',
    'Thứ tự phát': 'Play order',
    'Chỉ có một video nên nó lặp lại mãi. Thêm cái nữa là hai cái chạy luân phiên.':
      'Just one video, so it loops forever. Add another and they alternate.',
    'Đang tải video lên…': 'Uploading video…',
    'Đã thêm video': 'Video added',
    'Thêm nhân sự': 'Add staff',
    'Sửa': 'Edit',
    'Theo email': 'By email',
    'Chưa khớp ai': 'No match',
    'Gán người': 'Assign person',
    'Khai quyền': 'Set permissions',
    'Chọn từ danh bạ Lark': 'Pick from Lark directory',
    'Đã đăng nhập': 'Signed in',
    'Theo tên': 'By name',
    'Trùng tên': 'Duplicate name',
    'chưa có': 'none yet',
    'mặc định': 'default',
    'toàn quyền': 'full access',
    'Bạn': 'You',
    '← Danh sách': '← Back to list',
    'Chọn từ danh bạ': 'Pick from directory',
    '— chọn người —': '— pick a person —',
    'Vị trí công việc': 'Job position',
    'Ghi chú': 'Note',
    'Đang lưu…': 'Saving…',
    '— chọn vị trí —': '— pick a position —',
    'Nhân sự': 'Staff',
    'Quản lý': 'Manager',
    'Được tạo mới': 'Can create',
    'Xem chi phí': 'See costs',
    'Xem như': 'View as',
    'chỉ xem — mọi thao tác ghi bị chặn': 'view only — all writes are blocked',
    'Chỉ quản lý mở được phần Cài đặt': 'Only managers can open Settings',
    'Chỉ quản lý mở được phần Phân quyền': 'Only managers can open Permissions',
    'Chỉ quản lý được thao tác này.': 'Managers only.',
    'Bảng công việc': 'Task board',
    'Lịch tác nghiệp': 'Field trips',
    'Quản lý quảng cáo': 'Ads manager',
    'Đang đọc bảng phân quyền…': 'Reading the permission table…',

    /* --- cài đặt & kiểm tra --- */
    'Cài đặt · các base trong panel': 'Settings · bases in the panel',
    'Kiểm tra hệ thống': 'System check',
    'Chung': 'General',
    'Nâng cao': 'Advanced',
    'Base trong panel': 'Bases in the panel',

    /* --- bảng tin trên trang Tổng quan --- */
    'Tin của phòng': 'Team news',
    'mới': 'new',

    /* --- thẻ Báo cáo & KPI --- */
    'Đạt mục tiêu': 'Target attainment',
    'Chưa chấm xong': 'Scoring incomplete',
    'Cảnh báo số liệu': 'Data warnings',
    'Đã chốt': 'Closed',

    /* --- thẻ Quỹ chi phí --- */
    'Còn trong quỹ': 'Fund balance',
    'Chờ chi': 'Awaiting payout',
    'Chờ quyết toán': 'Awaiting settlement',
    'Chi trong kỳ': 'Spent in period',
    'Đã chi từ đầu quỹ': 'Spent since fund opened',

    /* --- thẻ Báo cáo công việc --- */
    'Phiếu đã nộp': 'Reports submitted',
    'Nộp trễ': 'Late',
    'Nộp bù': 'Make-up',
    'Cần hỗ trợ': 'Needs help',
    'cả phòng, trong kỳ lọc': 'whole team, in the selected period',
    'của bạn, trong kỳ lọc': 'yours, in the selected period',
    'nhân sự đang mắc, cần người gỡ': 'people are stuck and need unblocking',
    'Thứ tự trong panel': 'Order in the panel',
    'Về thứ tự gốc': 'Reset order',
    'Đã về thứ tự gốc': 'Order reset',
    'Lên một bậc': 'Move up',
    'Xuống một bậc': 'Move down',
    'Log app con': 'Module logs',
    'Chế độ chạy': 'Run mode',
    'Tài khoản Lark': 'Lark account',
    'Ngôn ngữ': 'Language',
    'Sáng / tối': 'Light / dark',
    'Bản đang chạy': 'Running build',
    'Chọn base': 'Pick a base',
    'Địa chỉ công khai': 'Public address',
    'Tình trạng': 'Status',
    'Mở màn quản lý': 'Open the manager screen',
    'Mở phân quyền': 'Open permissions',
    'Chạy lại': 'Run again',
    'Trang phát hành': 'Release page',
    'Bật lại base': 'Restart base',
    'Ẩn': 'Hide',
    'cần xử lý': 'needs attention',
    'ổn': 'ok',
    'Đang đọc…': 'Loading…',
    'Đang đọc bảng phân quyền…': 'Reading the permission table…',
    'máy cá nhân': 'personal machine',
    'server chung': 'shared server',
    'Thông tin phiên đang chạy và cách hiển thị.': 'Current session info and how things look.',
    // khoá phải là MỘT chuỗi liền (không nối được bằng +) vì nó là tên thuộc tính
    'Mỗi base là một app riêng. Tắt hay ẩn ở đây không ảnh hưởng dữ liệu trong Lark. Base "Kín" chỉ quản lý và người được cấp tên trong Phân quyền mới thấy — base mới luôn bắt đầu ở Kín.':
      'Each base is its own app. Stopping or hiding it here does not touch the data in Lark. ' +
      'A "Private" base is visible only to managers and people named in Permissions — a new ' +
      'base always starts private.',
    'Hỏi thẳng từng base xem đang đọc được gì.': 'Ask each base directly what it can read.',
    'Đọc lại từ đầu, không dùng số đã nhớ.': 'Read again from scratch, ignoring cached numbers.',
    'Khai thêm một app hoặc một Lark Base vào panel.': 'Add another app or Lark Base to the panel.',
    'Áp cho lớp vỏ và cả ba app con. Mỗi người nhớ lựa chọn riêng trong máy mình.':
      'Applies to the shell and all three modules. Each person keeps their own choice.',
    'Theo hệ thống là ăn theo cài đặt của máy.': 'System follows your machine setting.',
    'Ai mở được app là do Lark quyết (Availability). Ai thấy base nào là do anh quyết ở đây.':
      'Lark decides who can open the app (Availability). You decide who sees which base here.',
    'Danh sách từng người: vị trí, vai, base được xem, và app có nhận ra họ chưa.':
      'Per-person list: position, role, visible bases, and whether the app recognises them.',
    'Dòng lệnh thật của app con — chỗ đầu tiên cần xem khi một base báo lỗi.':
      'The real output of the module — the first place to look when a base reports an error.',
    'Kiểu': 'Type',
    'Trạng thái': 'Status',
    'Thao tác': 'Actions',
    'Bật lại': 'Restart',
    'Tắt': 'Stop',
    'Log': 'Log',
    'Ẩn khỏi panel': 'Hide from panel',
    'Hiện lại': 'Show again',
    'Đang chạy': 'Running',
    'Chạy sẵn ngoài hub': 'Running outside the hub',
    'Đang khởi động…': 'Starting…',
    'Đã tắt': 'Stopped',
    'App ngoài': 'External app',
    'Lỗi': 'Error',
    'Chế độ': 'Mode',
    'Bản đang chạy': 'Running build',
    'Tài khoản của bạn': 'Your account',
    'Vai quản lý': 'Manager role',
    'App Lark đang chạy': 'Lark app in use',
    'mở trang phát hành': 'open the release page',
    'Đang có vai quản lý.': 'You have the manager role.',
    'có': 'yes',
    'Tải lại log': 'Reload log',
    'Bật lại module': 'Restart module',
    'Chưa có log.': 'No log yet.',
    'Thêm base vào panel': 'Add a base to the panel',
    'Tên hiển thị': 'Display name',
    'Màu': 'Colour',
    'Thêm': 'Add',

    /* --- app Bảng công việc --- */
    'Việc của tôi': 'My tasks',
    'Lịch': 'Calendar',
    'Kanban': 'Kanban',
    'Bảng': 'Table',
    'Tổng quan': 'Dashboard',
    '+ Công việc': '+ Task',
    '+ Đặt việc': '+ Request task',
    'Báo cáo': 'Report',
    'Quyền': 'Permissions',
    'Tìm công việc...': 'Search tasks...',
    'Tìm công việc…': 'Search tasks…',
    'Chiến dịch: tất cả': 'Campaign: all',
    'Nhân sự: tất cả': 'Staff: all',
    'Thời gian: tất cả': 'Period: all',
    'Thiếu deadline': 'No deadline',
    'Đang tiến hành — toàn cảnh': 'In progress — everyone',
    'Ngày cụ thể': 'Specific date',
    'Ngày mai': 'Tomorrow',
    'Hôm qua': 'Yesterday',
    'Tuần trước': 'Last week',
    '7 ngày qua': 'Last 7 days',
    'Trong 7 ngày tới': 'Next 7 days',
    '30 ngày qua': 'Last 30 days',
    'Trong 30 ngày tới': 'Next 30 days',
    'Đã quá hạn (chưa đóng)': 'Overdue (still open)',
    'Chưa có deadline': 'No deadline set',
    'Mốc thời gian': 'Time',
    'Theo tình trạng': 'By state',
    'Trễ deadline': 'Late',
    'Tạm dừng': 'On hold',
    'Làm lại': 'Redo',
    'Cao': 'High',
    'Trung bình': 'Medium',
    'Thấp': 'Low',

    /* --- app Lịch tác nghiệp --- */
    'Cần xử lý': 'To handle',
    'Danh sách': 'List',
    'Chi phí': 'Costs',
    'Lịch của tôi': 'My trips',
    '+ Đăng ký lịch': '+ New trip',
    'Đăng ký lịch tác nghiệp': 'Register a field trip',
    'Mọi trạng thái': 'All statuses',
    'Mọi nhân sự': 'All staff',
    'Chưa đặt trạng thái': 'No status',
    'Tất cả thời gian': 'All time',
    'Sắp tới (7 ngày)': 'Upcoming (7 days)',
    'Đã qua': 'Past',
    'Hàng đợi cần xử lý': 'Queue to handle',
    'Mở trang xử lý': 'Open the queue',
    'Phân bố trạng thái': 'Status breakdown',
    'Dự kiến': 'Planned',
    'Thực tế': 'Actual',
    'Tải tác nghiệp theo nhân sự': 'Trips per person',
    'Lịch tác nghiệp theo tháng': 'Trips by month',
    'Chờ duyệt kế hoạch': 'Plans awaiting approval',
    'Yêu cầu FOC chờ phản hồi': 'FOC requests pending',
    'Yêu cầu phòng Media': 'Media team requests',
    'Quá ngày chưa báo cáo': 'Past date, no report',
    'Chi phí chờ thanh toán': 'Costs awaiting payment',
    'Đang lên kế hoạch': 'Planning',
    'Chờ duyệt/Xử lý': 'Awaiting approval',
    'Duyệt/Chờ tác nghiệp': 'Approved / upcoming',
    'Từ chối/Cần điều chỉnh': 'Rejected / needs edit',
    'Từ chối': 'Rejected',
    'Hủy lịch': 'Trip cancelled',
    'Xem chi tiết': 'View detail',
    'Phụ trách': 'Owner',
    'Hoạt động': 'Activity',

    /* --- app Quản lý quảng cáo --- */
    'Nền tảng': 'Platforms',
    'Chiến dịch': 'Campaigns',
    'Nhóm quảng cáo': 'Ad groups',
    'Quảng cáo': 'Ads',
    'Nhập số hằng ngày': 'Daily entry',
    'Dữ liệu theo ngày': 'Daily data',
    'Doanh thu & ROAS': 'Revenue & ROAS',
    'Kết nối & Đồng bộ': 'Connect & Sync',
    'Số từ Lark Base': 'Data from Lark Base',
    'Mục tiêu': 'Targets',
    'KHOẢNG THỜI GIAN': 'DATE RANGE',
    'TỪ NGÀY': 'FROM',
    'ĐẾN NGÀY': 'TO',
    'NỀN TẢNG': 'PLATFORM',
    'CHIẾN DỊCH': 'CAMPAIGN',
    'Tỉ trọng chi tiêu': 'Spend share',
    'Chi tiêu theo ngày × nền tảng': 'Daily spend × platform',
    'Chuyển đổi & CPA theo ngày': 'Daily conversions & CPA',
    'CPA theo chiến dịch': 'CPA by campaign',
    'Bảng so sánh nền tảng': 'Platform comparison',
    'Tỉ lệ chuyển đổi': 'Conversion rate',
    'chuyển đổi / click': 'conversions / click',
    'mục tiêu': 'target',
    'kỳ trước': 'previous period',
    'Vượt ngân sách': 'Over budget',
    'Bị trả lại, chưa điều chỉnh': 'Sent back, not yet revised',
    'Đã qua ngày mà chưa báo cáo': 'Date passed, no report',
    'Sát ngày mà chưa có nhân sự': 'Trip is near and no crew assigned',
    'Yêu cầu FOC chưa được phản hồi': 'FOC request has no answer',
    'Yêu cầu phòng Media chưa phản hồi': 'Media team request has no answer',
    'Báo cáo bỏ dở quá 3 ngày': 'Report left unfinished over 3 days',
    'Đã xong nhưng chưa thanh toán chi phí': 'Finished but cost not paid',
    'Chưa có phụ trách chính': 'No main owner yet',
    'Tăng ngân sách': 'Raise budget',
    'Tối ưu': 'Optimise',
    'Mở chiến dịch': 'Open campaign',
    'Mở quảng cáo': 'Open ad',
    'Tắt / xem lại': 'Pause / review',
    'Quảng cáo (Ads)': 'Ads',

    /* --- app Chỉnh ảnh & Edit video --- */
    'Chỉnh ảnh & Edit video': 'Photo & video editing',
    'Báo cáo link sản phẩm · nghiệm thu · gửi nhóm chat':
      'Report product links · sign-off · post to chat',
    'Sản phẩm đã làm': 'Finished work',
    'Báo cáo sản phẩm': 'Report your work',
    'Dán tên thư mục Google Photos / Drive': 'Paste the Google Photos / Drive folder name',
    'tên thư mục, người làm, ghi chú': 'folder name, person, note',
    '— chọn Tour —': '— pick a Tour —',
    'Ngày tác nghiệp': 'Shoot date',
    'Hạng mục': 'Work type',
    /* Ghép / VIP là hai kiểu đoàn khách, không phải "merge" — dịch theo nghĩa
       nghiệp vụ, không dịch theo chữ. Giá trị gửi lên Base vẫn nguyên tiếng Việt. */
    'Ghép': 'Shared group',
    'Chỉnh ảnh': 'Photo editing',
    'Edit video': 'Video editing',
    'Link thư mục ảnh (Google Photos)': 'Photo folder link (Google Photos)',
    'Link thư mục video (Google Drive)': 'Video folder link (Google Drive)',
    'Số ảnh': 'Photo count',
    'Số video': 'Video count',
    'Loại': 'Type',
    'Người chỉnh': 'Edited by',
    'Thêm mục': 'Add item',
    'Xoá mục': 'Remove item',
    'chưa chọn ai': 'nobody selected',
    'gõ tên để tìm trong danh bạ Lark': 'type a name to search the Lark directory',
    'không thấy ai khớp': 'no match',
    'chưa đủ Tour và ngày': 'Tour and date still missing',
    'Nghiệm thu': 'Sign-off',
    'Hàng đợi nghiệm thu': 'Sign-off queue',
    'cũ nhất trước': 'oldest first',
    'Ảnh chờ xem': 'Photos to review',
    'Video chờ xem': 'Videos to review',
    'Không còn lô nào chờ nghiệm thu.': 'Nothing left to sign off.',
    'Cần sửa gì? (bắt buộc khi trả về sửa)': 'What needs fixing? (required when sending back)',
    'Mở thư mục ảnh': 'Open photo folder',
    'Mở thư mục video': 'Open video folder',
    'Của tôi gần đây': 'My recent reports',
    'Chưa có báo cáo nào trong khoảng đang lọc.': 'No reports in the selected period.',
    'Lô đã báo': 'Batches reported',
    'Ảnh': 'Photos',
    'Video': 'Videos',
    'Chờ nghiệm thu': 'Awaiting sign-off',
    'Cần sửa lại': 'Needs rework',
    'Đạt': 'Approved',
    'Chưa gửi nhóm': 'Not posted to chat',
    'chưa gửi': 'not posted',
    'Sản phẩm': 'Products',
    'Theo người làm': 'By person',
    'Theo Tour': 'By tour',
    'Người làm': 'Person',
    'Thư mục': 'Folder',
    'Việc': 'Actions',
    'Gửi nhóm': 'Post to chat',
    'Đang gửi…': 'Sending…',
    'Nghiệm thu': 'Sign off',
    'Lưu nghiệm thu': 'Save sign-off',
    'Gửi kết quả về nhóm': 'Post result to chat',
    'Trả về sửa thì phải ghi rõ sửa gì': 'If sending back, say what needs fixing',
    'Nhận xét': 'Comment',
    'Kết quả': 'Result',
    'Nhóm chat nhận báo cáo': 'Chat group for reports',
    'Chọn nhóm': 'Pick a group',
    'Lưu nhóm': 'Save group',
    'Danh mục Tour': 'Tour catalogue',
    'Sửa danh mục trên Base': 'Edit catalogue in Base',
    'Chỉ quản lý đổi được nhóm nhận báo cáo.': 'Only managers can change the chat group.',
    'Chỉ của tôi': 'Mine only',
    'Không có lô nào khớp bộ lọc.': 'No batches match the filter.',
    'Chưa có số liệu.': 'No data yet.',
    'Thứ tự': 'Order',
    'Dùng': 'Active',
    'tắt': 'off',

    /* --- nhãn bộ lọc dùng chung: thiếu từ trước, app nào cũng có --- */
    'Khoảng thời gian': 'Date range',
    'Từ ngày': 'From',
    'Đến ngày': 'To',
    'Tìm': 'Search',
    'Bỏ lọc': 'Clear filter',

    /* --- nhãn bộ lọc dạng "…: tất cả" --- */
    'Trạng thái: tất cả': 'Status: all',
    'Ưu tiên: tất cả': 'Priority: all',
    'Loại việc: tất cả': 'Work type: all',
    'Phụ trách: tất cả': 'Owner: all',
    'Kênh: tất cả': 'Channel: all',
    'Luồng: tất cả': 'Flow: all',
    'Tất cả': 'All',
    'tất cả': 'all',

    /* --- vụn vặt hay gặp --- */
    'chưa có': 'none yet',
    'mới': 'new',
    'có kết quả': 'has result',
    'Hạn hôm nay': 'Due today',
    'Yêu cầu điều chỉnh': 'Change request',
    'Ẩn việc đã xong': 'Hide finished',
    'Chọn ít nhất một việc': 'Pick at least one task',
    'Không có mục nào cần xử lý.': 'Nothing to handle.',
    'Sạch': 'Clear',
    'Thiết kế': 'Design',
    'Website': 'Website',
    'Nội dung': 'Content',
    'Khác': 'Other',
    'Operate': 'Operate',

    /* --- LỖ HỔNG TÌM ĐƯỢC BẰNG CÁCH QUÉT DOM THẬT ---
     *
     * Cách tìm (dùng lại được): mở hub, đặt English, rồi duyệt mọi text node
     * tìm chữ còn dấu tiếng Việt, bỏ qua các vùng dữ liệu khai trong BO_QUA.
     * Cái gì còn sót lại mà không phải tên người / tên việc thì là nhãn thiếu.
     * Đọc mắt thường không ra, vì trang lẫn lộn nhãn với dữ liệu thật.
     *
     * Hai base thêm sau cùng chưa bao giờ có khoá, nên panel bên trái hiện bảy
     * dòng tiếng Anh và hai dòng tiếng Việt. */
    'Quỹ chi phí': 'Expense fund',
    'Báo cáo công việc': 'Work reports',
    'Sổ quỹ tạm ứng · chứng từ · quyết toán': 'Advance ledger · receipts · settlement',
    'Báo cáo ngày · tuần · tháng của từng người': 'Daily · weekly · monthly reports per person',

    /* Base thứ mười (22/09/2026) — khai khoá NGAY lúc thêm base, đừng để lặp lại
       chuyện panel bảy dòng tiếng Anh xen hai dòng tiếng Việt. */
    'Thông tin sản phẩm': 'Product info',
    'Lịch làm việc': 'Work schedule',
    'Đăng ký lịch tháng · chép sang HCNS': 'Monthly schedule sign-up · copy to HR',
    'Đăng ký ngay': 'Register now',
    'Lịch chuẩn đã điền sẵn — chỉ sửa những ngày nghỉ rồi bấm Nộp.': 'The standard schedule is pre-filled — change your days off, then Submit.',
    'nghỉ': 'off',
    /* app Lịch làm việc (23/09/2026) */
    'Công chuẩn': 'Standard days',
    'Tổng công': 'Total days',
    'Ngày nghỉ': 'Days off',
    'Phép năm': 'Annual leave',
    'Không lương': 'Unpaid',
    'Về lịch chuẩn': 'Reset to standard',
    'Lưu nháp': 'Save draft',
    'Nộp đăng ký': 'Submit',
    'Nộp lại': 'Resubmit',
    'Chưa đăng ký': 'Not registered',
    'Tải Excel': 'Download Excel',
    'Chép khối ngày': 'Copy day block',
    'Đánh dấu đã chép HCNS': 'Mark as copied to HR',
    'Sheet HCNS': 'HR sheet',
    'Đã nộp': 'Submitted',
    'Chờ chép HCNS': 'Waiting for HR copy',
    'Sửa sau khi chép': 'Edited after copy',
    'Công': 'Days',
    'Nháp': 'Draft',
    'Đã chép': 'Copied',
    'Đi làm cả ngày': 'Full day',
    'Làm nửa ngày': 'Half day',
    'Nghỉ hằng tuần': 'Weekly off',
    'Nghỉ phép năm': 'Annual leave',
    'Nửa ngày phép': 'Half-day leave',
    'Nghỉ không lương': 'Unpaid leave',
    'Nghỉ lễ': 'Public holiday',
    'Làm ngày lễ (x2)': 'Holiday work (x2)',
    'Làm nửa ngày lễ': 'Half holiday work',
    'Làm ngày OFF (x2)': 'Day-off work (x2)',
    'Công tác': 'Business trip',
    'Tác nghiệp': 'Field work',
    'Hiếu (ông bà, anh chị em)': 'Bereavement (1 day)',
    'Hiếu (bố mẹ, con)': 'Bereavement (3 days)',
    'Nghỉ kết hôn': 'Wedding leave',
    'Phòng Marketing': 'Marketing team',
    'Tháng sau': 'Next month',
    'Về lịch của tôi': 'Back to my schedule',
    'Ghi chú cho quản lý / HCNS': 'Note for manager / HR',
    'Bạn là ai trong danh sách HCNS?': 'Which name on the HR list is you?',
    'Chờ chép sang HCNS': 'Waiting for HR copy',
    'Giá công bố · USP · lịch trình · ưu đãi': 'List price · USP · itinerary · offers',

    /* tab + bộ lọc */
    'Danh mục': 'Catalogue',
    'Đang đẩy': 'Being pushed',
    'Sắp hết hạn': 'Expiring soon',
    'Cần bổ sung': 'Needs filling in',
    'Tài liệu chung': 'Shared files',
    'Bảng đẩy': 'Push board',
    'Quản lý': 'Manage',

    /* tầng của Bảng đẩy */
    '🆕 Sắp ra mắt': '🆕 Launching soon',
    '🔥 Ưu tiên đẩy': '🔥 Priority push',
    '🟢 Chạy hằng ngày': '🟢 Running daily',
    '🔵 Duy trì': '🔵 Maintain',
    '🌤 Theo mùa / theo yêu cầu': '🌤 Seasonal / on request',
    '⏸ Tạm dừng đẩy': '⏸ Push paused',
    'Chưa xếp mức': 'No tier set',
    'Sắp ra mắt': 'Launching soon',
    'Chuẩn bị nội dung trước ngày mở bán': 'Get content ready before the launch date',
    'Dồn ngân sách và nội dung vào nhóm này': 'Put budget and content into this group',
    'Có bài đều, giữ nhịp': 'Post regularly, keep the rhythm',
    'Giữ hồ sơ đủ, chạy khi có nhu cầu': 'Keep the profile complete, run on demand',
    'Chỉ đẩy khi Kinh doanh yêu cầu hoặc vào mùa': 'Push only on a Sales request or in season',
    'Không chạy truyền thông lúc này': 'No marketing right now',
    'Cần quản lý xếp mức ưu tiên': 'A manager needs to set the priority',
    'Mỗi sản phẩm nằm ở đúng một tầng. \u201cSắp ra mắt\u201d đứng trên cùng vì việc phải làm là kịp nội dung cho ngày mở bán.':
      'Each product sits in exactly one tier. \u201cLaunching soon\u201d comes first because the job is getting content ready in time.',
    'Mỗi sản phẩm nằm ở đúng một tầng. \u201cSắp ra mắt\u201d đứng trên cùng vì việc phải làm là kịp nội dung cho ngày mở bán. Đổi tầng của một sản phẩm ở tab Quản lý hoặc trong ngăn chi tiết.':
      'Each product sits in exactly one tier. \u201cLaunching soon\u201d comes first because the job is getting content ready in time. Change a product\u2019s tier on the Manage tab or in the detail panel.',
    'theo báo giá': 'by quotation',
    'chưa có giá': 'no price yet',

    /* khu quản lý */
    'Đặt cho cả nhóm:': 'Set for the whole group:',
    'Bỏ chọn': 'Clear selection',
    'Tick vài dòng để đặt mức ưu tiên cho cả nhóm một lượt.':
      'Tick a few rows to set the priority for the whole group at once.',
    '— trống —': '— empty —',
    'Sản phẩm': 'Product',
    'Trạng thái': 'Status',
    'Giá NL': 'Adult price',
    'Giá TE': 'Child price',
    'Chi tiết': 'Detail',
    'Xếp loại': 'Tier',
    'sửa được': 'editable',
    'Trạng thái kinh doanh': 'Business status',
    'Ghi chú giá — dùng khi giá không cố định': 'Price note — for when the price is not fixed',

    /* hai mức giá (22/09/2026) */
    'Giá khách thực trả': 'What the guest pays',

    /* Lịch đổi thông tin (22/09/2026) */
    'Lịch đổi thông tin': 'Scheduled changes',
    'Sửa dòng lịch': 'Edit scheduled change',
    'Sửa': 'Edit',
    'Lưu': 'Save',
    'Thôi': 'Never mind',
    'Đã lưu.': 'Saved.',
    'Tour riêng (VIP)': 'Private tour (VIP)',
    'Giá theo số khách': 'Price by group size',
    'Số khách': 'Group size',
    'Tour riêng tính giá trên đầu người, đoàn càng đông càng rẻ. Báo giá phải kèm số khách.':
      'Private tours are priced per person and get cheaper as the group grows. Always quote the group size.',
    'Sắp đổi': 'Changing soon',
    'Chưa gán sản phẩm': 'No product assigned',
    '(đặt và huỷ ở tab Quản lý)': '(schedule and cancel on the Manage tab)',
    'Đặt trước — tới ngày app tự ghi vào sản phẩm, có lưu bản cũ.':
      'Set it ahead — on the date the app writes it to the product and keeps the old value.',
    '+ Đặt lịch đổi': '+ Schedule a change',
    'Đóng': 'Close',
    'Cột cần đổi': 'Column to change',
    'Ngày áp dụng': 'Applies on',
    'Giá trị mới': 'New value',
    'Giá trị cũ': 'Old value',
    'Đặt lịch': 'Schedule it',
    'Huỷ': 'Cancel',
    'Cột': 'Column',
    'Chưa đặt lịch đổi nào.': 'No scheduled change yet.',
    '(chưa gán)': '(not assigned)',
    'Chờ áp dụng': 'Pending',
    'Đã áp dụng': 'Applied',
    'Đã huỷ': 'Cancelled',
    'Lỗi': 'Error',
    'Đã đặt lịch.': 'Scheduled.',
    'Đã huỷ.': 'Cancelled.',
    'Huỷ dòng lịch này?': 'Cancel this scheduled change?',
    'Số thì gõ số trần (900000). Ngày thì YYYY-MM-DD. Chọn thì gõ đúng tên lựa chọn.':
      'Numbers plain (900000). Dates as YYYY-MM-DD. For a choice, type the option name exactly.',
    'Nguồn, lý do đổi…': 'Source, reason for the change…',
    'Lịch trình tóm tắt': 'Itinerary summary',
    'Đã trừ:': 'Already deducted:',
    'Giảm': 'Discount',
    'Khách trả': 'Guest pays',
    'đã trừ vào giá hiển thị': 'already taken off the shown price',
    'Giá Kinh doanh công bố, CHƯA trừ khuyến mãi. Mức giảm khai ở bảng Chính sách & Khuyến mãi trên Base.':
      'The list price from Sales, BEFORE any offer. Discounts are entered in the Policies & Offers table on the Base.',
    'Giai đoạn áp dụng hoặc ưu đãi sắp kết thúc. Rà lại với Kinh doanh trước khi chạy tiếp.':
      'The applicable period or the offer is ending. Check with Sales before running it again.',
    'Làm mới': 'Refresh',
    'Mở Base': 'Open Base',
    'Đang đọc…': 'Reading…',
    'Tìm mã, tên, USP, trải nghiệm…': 'Search code, name, USP, experience…',
    'Mọi nhóm': 'All groups',
    'Mọi mức ưu tiên': 'All priorities',
    'Mọi tệp khách': 'All audiences',
    'Mọi trải nghiệm': 'All experiences',
    'Bỏ lọc': 'Clear filter',
    'Không có sản phẩm nào khớp.': 'No product matches.',
    'Chưa có tài liệu dùng chung nào.': 'No shared file yet.',
    'Chưa xếp nhóm': 'Ungrouped',
    'Mở': 'Open',

    /* câu dẫn của ba tab cảnh báo */
    'Sản phẩm đang được đẩy truyền thông — mức ưu tiên đặt ở từng sản phẩm.':
      'Products currently being pushed — priority is set on each product.',
    'Giai đoạn áp dụng sắp kết thúc hoặc đã kết thúc. Rà lại với Kinh doanh trước khi chạy tiếp.':
      'The applicable period is ending or has ended. Check with Sales before running it again.',
    'Hồ sơ chưa đủ để làm truyền thông. Bổ sung trong Lark Base rồi bấm Làm mới.':
      'Profile not complete enough for marketing. Fill it in on Lark Base, then hit Refresh.',
    'Mở view “Cần bổ sung” trên Base': 'Open the “Needs filling in” view on the Base',

    /* thẻ sản phẩm */
    'trẻ em': 'child',
    'chưa có giá công bố': 'no list price yet',
    'chưa xếp': 'not set',
    'chưa đặt hạn': 'no end date',
    'chưa ghi nguồn': 'source not recorded',

    /* ngăn chi tiết */
    'Chi tiết sản phẩm': 'Product detail',
    'Chép': 'Copy',
    'Đã chép.': 'Copied.',
    'Đã đọc lại từ Lark Base.': 'Re-read from Lark Base.',
    'Đã đổi mức ưu tiên.': 'Priority updated.',
    '— chưa xếp —': '— not set —',
    '(chỉ quản lý đổi được mức này)': '(only managers can change this)',
    'Ưu tiên marketing': 'Marketing priority',
    'Giá công bố': 'List price',
    'Người lớn': 'Adult',
    'Trẻ em': 'Child',
    'Hiệu lực từ': 'Valid from',
    'Hiệu lực đến': 'Valid until',
    'Giá theo giai đoạn': 'Price by period',
    'Giai đoạn': 'Period',
    'Áp dụng': 'Applies',
    'Điểm nổi bật': 'Highlights',
    'Đối tượng mục tiêu': 'Target audience',
    'Nhãn': 'Tags',
    'Lịch trình tóm tắt': 'Itinerary summary',
    'Dịch vụ bao gồm': 'Included services',
    'Dịch vụ chưa bao gồm': 'Excluded services',
    'Ưu đãi đang chạy': 'Live offers',
    'Chính sách trẻ em': 'Child policy',
    'Chính sách phụ thu': 'Surcharge policy',
    'Chính sách giảm trừ': 'Discount policy',
    'Lưu ý cho marketing': 'Notes for marketing',
    'Chính sách & khuyến mãi áp dụng': 'Policies & offers that apply',
    'Ảnh · video · tài liệu': 'Photos · videos · files',
    'Nguồn & cập nhật': 'Source & last update',
    'Nguồn': 'Source',
    'Sửa trong Lark Base': 'Edit on Lark Base',
    'Không đọc được Base: ': 'Could not read the Base: ',
    'Chỉ quản lý đổi được mức ưu tiên đẩy.': 'Only managers can change the push priority.',
    'Giá công bố · USP · lịch trình · ưu đãi': 'List price · USP · itinerary · offers',
    'Sản phẩm đang bán': 'Products on sale',
    'Ưu tiên đẩy': 'Priority push',
    'Chạy hằng ngày': 'Running daily',
    'Sắp / đã hết hạn': 'Expiring / expired',
    'Ưu đãi sắp hết': 'Offers ending soon',
    'Hồ sơ còn thiếu': 'Incomplete profiles',
    'dòng trong Base': 'rows in the Base',
    'không lọc theo thời gian': 'not filtered by date',

    /* Nhãn thẻ số trên chính trang Tổng quan — màn hình đầu tiên ai cũng thấy */
    'Doanh thu từ QC': 'Revenue from ads',
    'Doanh thu thu về': 'Revenue received',
    'Cần liên hệ khách': 'Guests to contact',
    'Tour hôm nay': 'Tours today',
    'Hoa hồng OTA': 'OTA commission',
    'Booking về 24h qua': 'Bookings in the last 24h',
    'Lượt xem': 'Views',
    'Lượt tiếp cận': 'Reach',
    'Follower tăng ròng': 'Net follower growth',
    'Tương tác': 'Engagements',
    'Tỷ lệ tương tác': 'Engagement rate',
    'chốt ngày mới nhất': 'as of the latest day',
    'chỉ tính phần từ quảng cáo': 'ads-attributed only',
    'thiếu SĐT / điểm đón / chưa xác nhận': 'missing phone / pickup / not confirmed',
    'chưa nhập giá OTA bán (Gross) nên chưa tính được':
      'OTA gross price not entered yet — cannot compute',
    'TikTok · chưa đăng bài hoặc chưa đồng bộ': 'TikTok · nothing posted, or not synced',
    'vừa xong': 'just now',

    /* Cửa sổ Thêm base */
    'App Node trên máy này': 'Node app on this machine',
    'App đã có URL riêng': 'App with its own URL',
    'Mở thẳng Lark Base': 'Open Lark Base directly',
    'Biểu tượng': 'Icon',
    'Thư mục app': 'App folder',
    'Cổng': 'Port',
    'Bộ đọc chỉ số': 'Metrics reader',
    '— chưa có —': '— none —',
    'Theo dõi chiến dịch': 'Campaign tracker',

    /* Tooltip — không thấy trên ảnh chụp nên rất dễ bị bỏ quên */
    'Thu gọn / mở rộng panel': 'Collapse / expand the panel',
    'Thêm một base vào panel': 'Add a base to the panel',
    'Trạng thái module, log, phân quyền nhân sự': 'Module status, logs, staff permissions',
    'Đọc lại chỉ số của mọi base, và nạp lại app đang mở':
      "Re-read every base's metrics and reload the open app",
    'Mở Lark Base trong tab mới': 'Open the Lark Base in a new tab',
    'Bấm để xem và xử lý ngay': 'Click to view and handle it now',
    'Mở app để xử lý': 'Open the app to handle it',
    'Bấm để mở việc này trong app': 'Click to open this item in the app',
    'số việc trong một ngày': 'tasks in a single day',
    'việc gấp / quá hạn': 'urgent / overdue',

    /* Thêm chiến dịch ngay trong form giao việc (app Bảng công việc) */
    '+ Thêm chiến dịch mới…': '+ Add a new campaign…',
    'Tên chiến dịch mới…': 'New campaign name…',
    'Đang thêm vào Base…': 'Adding it to the Base…',
    'Chưa nhập tên chiến dịch.': 'No campaign name entered.',
    'Chiến dịch này đã có sẵn — đã chọn sẵn.': 'That campaign already exists — selected it for you.',
    'Tên chiến dịch dài quá 80 ký tự.': 'Campaign name is longer than 80 characters.',

    /* Sáu câu cuối còn sót của màn Cài đặt / Phân quyền — quét lại toàn bộ mười
     * mục trong Cài đặt thì chỉ còn đúng bấy nhiêu, phần còn lại đều là TÊN
     * NGƯỜI (dữ liệu thật, không được dịch). */
    'Ai mở được app là do Lark quyết (Availability). Ai thấy base nào và ai duyệt được thì quyết ở đây.':
      'Who can open the app is decided by Lark (Availability). Who sees which base, and who can approve, is decided here.',
    'Ba thứ dưới đây nhớ riêng trong máy bạn — đổi xong người khác không bị ảnh hưởng.':
      'The three settings below are remembered on your machine only — changing them affects nobody else.',
    'Áp cho lớp vỏ và cả các app con.': 'Applies to the shell and every app inside it.',
    'Chưa đọc được tài khoản.': 'Could not read the account.',
    '(bạn — không tự bỏ quyền được)': '(you — cannot remove your own access)',
  };

  /* ---------------- từ điển: khớp theo mẫu ----------------
   * Cho những câu ghép số/tên vào giữa. $1, $2… là nhóm bắt được.
   */
  const MAU_EN = [
    /* --- Thông tin sản phẩm: câu có con số nên không khớp khoá nguyên câu --- */
    [/^(\d+) dòng trong Base$/, '$1 rows in the Base'],
    [/^(\d+) sản phẩm$/, '$1 products'],
    [/^(\d{2}\/\d{2}\/\d{4}) → (\d{2}\/\d{2}\/\d{4}) · còn (\d+) ngày$/, '$1 → $2 · $3 days left'],
    [/^(\d{2}\/\d{2}\/\d{4}) → (\d{2}\/\d{2}\/\d{4})$/, '$1 → $2'],
    [/^đến (\d{2}\/\d{2}\/\d{4}) · còn (\d+) ngày$/, 'until $1 · $2 days left'],
    [/^từ (\d{2}\/\d{2}\/\d{4}) · chưa đặt hạn$/, 'from $1 · no end date'],
    [/^(\d+) mục$/, '$1 items'],
    [/^từ (\d{2}\/\d{2}\/\d{4})$/, 'from $1'],
    [/^(\d+) khách$/, '$1 guests'],
    [/^⏳ đổi (\d{2}\/\d{2}\/\d{4})$/, '⏳ changes $1'],
    [/^⏳ đổi (\d{2}\/\d{2}\/\d{4}) · (\d+) mục$/, '⏳ changes $1 · $2 items'],
    [/^\/khách · đoàn từ (\d+)$/, '\/guest · groups of $1+'],
    [/^áp lúc (\d{2}\/\d{2}\/\d{4})$/, 'applied $1'],
    [/^Chọn cả (\d+) dòng đang hiện$/, 'Select all $1 rows shown'],
    [/^Đã chọn (\d+)$/, '$1 selected'],
    [/^Đã đặt cho (\d+) sản phẩm\.$/, 'Applied to $1 products.'],
    [/^ưu đãi hết (\d{2}\/\d{2}\/\d{4})$/, 'offer ends $1'],
    [/^(\d+) sản phẩm đã ngừng bán không nằm trong bảng này — tra ở tab Danh mục\.$/,
      '$1 discontinued products are not on this board — look them up on the Catalogue tab.'],
    [/^(\d+) sản phẩm · đọc lúc (.+)$/, '$1 products · read at $2'],
    [/^trẻ em ([\d.,]+)đ$/, 'child $1đ'],
    [/^thiếu: (.+)$/, 'missing: $1'],
    [/^Sửa lần cuối: (.+)$/, 'Last edited: $1'],
    [/^đến (\d{2}\/\d{2}\/\d{4})$/, 'until $1'],

    /* --- lớp vỏ: phụ đề trang Tổng quan trong lúc chờ số liệu về --- */
    [/^Đang đọc số liệu từ (\d+) base…$/, 'Reading data from $1 bases…'],

    /* --- lớp phủ khi app con chưa mở được --- */
    [/^(.+) tạm thời chưa mở được\. Bạn chờ một chút nhé — xong là tự vào lại\.$/,
      '$1 is not available right now. Hang on — it opens itself once it is back.'],
    [/^Tự thử lại sau (\d+) giây$/, 'Retrying in $1s'],

    /* Dòng mô tả tệp của logo và của từng video: "<tên> · <cỡ> · tải lên <giờ>".
     * Tên tệp và giờ là chữ THẬT, giữ nguyên — chỉ dịch phần khung. */
    [/^(.+ · .+) · tải lên (.+)$/, '$1 · uploaded $2'],

    /* --- nén video ngay trong trình duyệt trước khi tải lên --- */
    [/^Video (\d+) MB — đang nén, chạy theo độ dài clip…$/,
      'Video is $1 MB — compressing, takes as long as the clip'],
    [/^Đang nén (\d+)%$/, 'Compressing $1%'],
    [/^Nén xong: (\d+) MB → ([\d,.]+) MB$/, 'Compressed: $1 MB to $2 MB'],
    [/^Clip dài (\d+) giây — nén xuống (\d+) MB thì hình sẽ nhoè\. Cắt ngắn clip rồi tải lại\.$/,
      'The clip runs $1 seconds — squeezing it to $2 MB would look blurry. Trim it and upload again.'],
    [/^Không nén được \((.+)\) — tải nguyên bản\.$/, 'Could not compress ($1) — uploading the original.'],
    [/^Tệp nặng (\d+) MB — quá 60 MB\. Nén lại rồi tải lên\.$/,
      'File is $1 MB — over the 60 MB limit. Compress it and upload again.'],

    /* --- ô phát của trang Tổng quan: mỗi ô là video HOẶC ảnh --- */
    [/^Video (\d+) · phát đầu tiên$/, 'Video $1 · plays first'],
    [/^Ảnh (\d+) · phát đầu tiên$/, 'Image $1 · plays first'],
    [/^Video (\d+)$/, 'Video $1'],
    [/^Ảnh (\d+)$/, 'Image $1'],
    [/^Chạy hết ô 1 sang ô 2… rồi quay lại ô 1\. Video chạy hết bài, ảnh đứng 8 giây\.$/,
      'Plays slot 1, then slot 2… then back to slot 1. Videos play through; images hold for 8 seconds.'],
    [/^Chỉ có một ô nên nó lặp lại mãi\. Thêm cái nữa là hai cái chạy luân phiên\.$/,
      'Only one slot, so it loops forever. Add another and they alternate.'],
    [/^MP4 · WEBM · MOV · PNG · JPG · WEBP · GIF ≤ 60 MB · tối đa (\d+) ô$/,
      'MP4 · WEBM · MOV · PNG · JPG · WEBP · GIF, up to 60 MB · max $1 slots'],
    [/^Đã đủ (\d+) ô$/, 'All $1 slots used'],
    [/^Đã thay ô (\d+)$/, 'Slot $1 replaced'],
    [/^Đã đủ (\d+) video\. Gỡ bớt một cái rồi thêm\.$/, 'All $1 slots used. Remove one first.'],
    [/^Tệp nặng (\d+) MB — quá 60 MB\. Nén lại rồi tải lên\.$/,
      'File is $1 MB — over the 60 MB limit. Compress it and upload again.'],
    [/^Chỉ nhận MP4 · WEBM · MOV · PNG · JPG · WEBP · GIF\.$/,
      'Only MP4 · WEBM · MOV · PNG · JPG · WEBP · GIF are accepted.'],

    /* --- app Chỉnh ảnh & Edit video: nhãn mang con số hoặc tên nhóm --- */
    [/^Gửi tin về nhóm (.+)$/, 'Post to $1'],
    [/^nhóm (.+)$/, 'group $1'],

    /* --- ghi chú của ba thẻ mới: mang con số hoặc tháng nên phải đi bằng mẫu --- */
    [/^đã ứng (\d+) lần$/, '$1 top-ups so far'],
    [/^(\d+) khoản$/, '$1 items'],
    [/^tháng (\S+) · (\d+) người đã chấm đủ$/, '$1 · $2 people fully scored'],
    [/^tháng (\S+)$/, '$1'],
    [/^chưa chốt tháng (\S+)$/, '$1 not closed yet'],
    [/^tháng (\S+) đã chốt$/, '$1 closed'],
    [/^Báo cáo (\d+) mục$/, 'Report $1 item(s)'],
    [/^(\d+) mục$/, '$1 item(s)'],
    [/^(\d+) mục · (.+)$/, '$1 item(s) · $2'],
    [/^(\d+) lô$/, '$1 batch(es)'],
    [/^Quá hạn (\d+) ngày$/, 'Overdue $1 days'],
    [/^quá hạn (\d+) ngày$/, 'overdue $1 days'],
    [/^Còn (\d+) ngày · (.+)$/, '$1 days left · $2'],
    [/^hạn (.+)$/, 'due $1'],
    [/^(\d+) mục$/, '$1 items'],
    [/^(\d+) việc$/, '$1 tasks'],
    [/^(\d+) việc trễ đã giải quyết$/, '$1 late tasks submitted'],
    [/^đã giải quyết (.+)$/, 'submitted $1'],
    [/^Đã giải quyết · trễ (\d+) ngày$/, 'Submitted · $1 days late'],
    [/^(\d+) lịch$/, '$1 trips'],
    [/^(\d+) người · (\d+) lượt · (\d+) người có ngày ≥ (\d+) việc$/,
      '$1 people · $2 assignments · $3 with ≥ $4 tasks/day'],
    [/^(\d+) \/ (\d+) việc · (.+)$/, '$1 / $2 tasks · $3'],
    [/^Tracking · (\d+) việc toàn phòng$/, 'Tracking · $1 tasks (whole team)'],
    [/^Tracking · (\d+) việc của bạn$/, 'Tracking · $1 tasks of yours'],
    /* Ba mẫu cho cùng một dòng, và THỨ TỰ là tất cả: bộ dịch lấy mẫu KHỚP ĐẦU
     * TIÊN rồi dừng, nên cái hẹp phải đứng trước cái rộng. Để mẫu rộng lên
     * trước thì hai mẫu dưới thành đồ trang trí — đúng chuyện đã xảy ra: dòng
     * đầu trang đọc là "9 bases · 46 need action · cập nhật vừa xong".
     *
     * Và vì bộ dịch chỉ khớp TRỌN một text node, phần đuôi không tự dịch lại
     * được bằng khoá 'vừa xong' — nó phải nằm ngay trong mẫu. */
    [/^(\d+) base · (\d+) việc cần xử lý · cập nhật vừa xong$/,
      '$1 bases · $2 need action · updated just now'],
    [/^(\d+) base · (\d+) việc cần xử lý · cập nhật (.+)$/,
      '$1 bases · $2 need action · updated $3'],
    [/^(\d+) base · (\d+) việc cần xử lý · (.+)$/, '$1 bases · $2 need action · $3'],
    [/^(\d+) chiến dịch · (\d+) nhóm · (.+)$/, '$1 campaigns · $2 groups · $3'],
    [/^Số liệu (.+) → (.+) \((\d+) ngày\) · kỳ trước (.+) → (.+)$/,
      'Data $1 → $2 ($3 days) · previous $4 → $5'],
    [/^Bộ lọc chung: (.+) → (.+)$/, 'Shared filter: $1 → $2'],
    [/^Đang xem bằng mắt của (.+)$/, 'Viewing as $1'],
    [/^Đã xử lý: (.+)$/, 'Done: $1'],
    [/^(\d+) việc đang mở · đã lọc$/, '$1 open tasks · filtered'],
    [/^(\d+) việc đã chấm$/, '$1 tasks scored'],
    [/^thực tế (.+)$/, 'actual $1'],
    [/^cổng (\d+)$/, 'port $1'],
    [/^(\d+) việc đang mở$/, '$1 open tasks'],
    [/^(\d+) việc đang mở\s+·\s+(\d+) trễ$/, '$1 open · $2 late'],
    [/^Dữ liệu mới nhất (.+) — trễ (\d+) ngày$/, 'Latest data $1 — $2 days behind'],
    [/^(\d+) lịch tác nghiệp$/, '$1 field trips'],
    [/^\/ (\d+) toàn bộ$/, '/ $1 total'],
    [/^(\d+) dòng$/, '$1 rows'],
    [/^top (\d+)$/, 'top $1'],
    [/^Tài khoản Lark: (.+)$/, 'Lark account: $1'],
    [/^App Lark đang chạy: (.+)$/, 'Lark app in use: $1'],
    [/^Số bản: (.+)$/, 'Build: $1'],
    /* MƯỜI MẪU DƯỚI ĐÂY TỪNG CHẾT HẾT — cả màn Phân quyền đứng nguyên tiếng
     * Việt khi chọn English, mà không có lỗi nào hiện ra.
     *
     * Nguyên nhân: chúng bị viết qua `node -e "..."` trong Git Bash, và shell
     * ăn mất một lớp backslash — `(\d+)` thành `(d+)`, `\(…\)` thành `(…)`.
     * `(d+)` vẫn là biểu thức HỢP LỆ (khớp chữ d lặp lại), nên không nổ; nó chỉ
     * lặng lẽ không bao giờ khớp câu nào.
     *
     * Cách bắt loại lỗi này: xem `test/tu-vung.test.js` — mỗi mẫu phải có ít
     * nhất một câu mẫu khớp được, mẫu nào không khớp gì là hỏng. */
    [/^hub tự bật · cổng nội bộ (\d+) \(không ra internet\)$/,
      'started by the hub · internal port $1 (not exposed)'],
    [/^(\d+) người đã khai quyền riêng · (\d+) người chưa khai \(đang ở mặc định: thấy đủ (\d+) base\)$/,
      '$1 with custom permissions · $2 not configured (default: all $3 bases)'],
    [/^(\d+) dòng chưa khớp được với ai trong Lark — quyền đó chưa có tác dụng\.$/,
      '$1 row(s) match nobody in Lark — those permissions have no effect.'],
    [/^Sửa quyền · (.+)$/, 'Edit permissions · $1'],
    [/^Đã khớp: (.+)$/, 'Matched: $1'],
    [/^(\d+) người đã khai quyền riêng$/, '$1 people with custom permissions'],
    [/^(\d+) người chưa khai quyền$/, '$1 people not configured yet'],
    [/^Đang ở mặc định: thấy đủ (\d+) base với vai nhân sự\. Bấm Khai quyền để đặt riêng\.$/,
      'Currently on the default: all $1 bases as staff. Click Set permissions to change.'],
    [/^Người chưa khai thì thấy đủ (\d+) base với vai nhân sự — xem danh sách ở cuối trang\.$/,
      'People not configured see all $1 bases as staff — see the list at the bottom.'],
    [/^(\d+) người đã khai$/, '$1 people configured'],
    [/^Tất cả (\d+) base$/, 'All $1 bases'],
    [/^Ai chưa có trong danh sách thì thấy đủ (\d+) base với vai nhân sự\.$/,
      'Anyone not listed sees all $1 bases as staff.'],
    [/^Tải của bạn · (\d+) lượt · đỉnh (\d+) việc\/ngày$/, 'Your load · $1 assignments · peak $2 tasks\/day'],
    [/^Tải của bạn · (\d+) lượt$/, 'Your load · $1 assignments'],
    [/^(\d+) người · (\d+) lượt$/, '$1 people · $2 assignments'],
    [/^Quá hạn (\d+) ngày · (.+)$/, 'Overdue $1 days · $2'],
    [/^Bộ lọc đang che (\d+) việc gấp$/, 'Filter is hiding $1 urgent items'],
    [/^(\d+) việc quá hạn từ trước khoảng lọc$/, '$1 overdue tasks from before this range'],
    [/^(\d+) lịch chờ duyệt \/ có nguy cơ ngoài khoảng lọc$/,
      '$1 trips awaiting approval / at risk outside this range'],
    [/^Đã chi (.+) \/ (.+) \((.+)\)$/, 'Spent $1 / $2 ($3)'],
    [/^Còn (\d+) ngày là tác nghiệp mà chưa duyệt$/, '$1 days to the trip and still not approved'],
    [/^\+(\d+) việc khác$/, '+$1 more'],
    [/^(\d+) việc chưa có deadline$/, '$1 tasks without a deadline'],
    [/^Chờ duyệt · (.+)$/, 'Awaiting approval · $1'],
    [/^Hôm nay · (.+)$/, 'Today · $1'],
    [/^phụ trách (.+)$/, 'owner $1'],

    /* --- cùng đợt quét DOM với khối khoá mới ở trên --- */
    [/^Mở app (.+)$/, 'Open $1'],
    /* Dòng so sánh dưới mỗi thẻ số của Quảng cáo / Social. Trước đây chỉ dịch
     * riêng chữ 'kỳ trước' nên cả cụm không bao giờ khớp — nó là MỘT text node. */
    [/^(.+) vs kỳ trước$/, '$1 vs previous period'],
    [/^(.+) của (.+) toàn công ty$/, '$1 of $2 company-wide'],
    [/^(.+): (\d+) việc quá hạn từ trước khoảng lọc$/,
      '$1: $2 overdue tasks from before this range'],
    /* Đuôi "+N việc khác" phải nằm TRONG mẫu, không thể trông vào mẫu
     * `^\+(\d+) việc khác$` ở trên: nó chỉ khớp khi đó là cả text node. */
    [/^Sát ngày mà chưa có nhân sự · \+(\d+) việc khác$/,
      'Trip is close and nobody assigned · +$1 more'],
    [/^sát ngày mà chưa có nhân sự · \+(\d+) việc khác$/,
      'trip is close and nobody assigned · +$1 more'],
    [/^Sát ngày mà chưa có nhân sự · (.+)$/, 'Trip is close and nobody assigned · $1'],
    [/^sát ngày mà chưa có nhân sự · (.+)$/, 'trip is close and nobody assigned · $1'],
    [/^Yêu cầu FOC chưa được phản hồi · (.+)$/, 'FOC request still unanswered · $1'],
    [/^Ngày kết thúc (.+) nhưng trạng thái vẫn "(.+)"$/,
      'End date $1 but the status is still "$2"'],
    [/^(\d+) booking · (\d+) khách$/, '$1 bookings · $2 guests'],
    [/^(\d+) khách$/, '$1 guests'],
    [/^(\d+) quản lý:$/, '$1 manager(s):'],
    [/^(\d+) quản lý$/, '$1 manager(s)'],
    [/^Đã thêm chiến dịch "(.+)"$/, 'Added the campaign "$1"'],
  ];

  /* Vùng chứa DỮ LIỆU — không dịch bên trong, kể cả có trùng nhãn. */
  const BO_QUA = [
    '.n-td', '.n-phu', '.tieu-de',            // tiêu đề việc/lịch trong lớp vỏ
    '.card-title', 'td.c-title', '.dcard-title',   // Bảng công việc
    '.q-ten', '.q-mail', '.tn-ten', '.nm', '.av',  // tên người
    /* Chỉnh ảnh & Edit video: tên thư mục và nhận xét nghiệm thu là chữ người gõ,
       dịch là sai nghĩa. Tên thư mục thì không trùng khoá nào, nhưng nhận xét
       ngắn kiểu "Đạt" thì trùng — chắn cả hai cho chắc. */
    '.ml-ten', '.ml-nx', 'td .phu',
    '.log', 'code', 'pre', 'option[data-giu]',
    /* Vùng nào tự khai là dữ liệu thì tôn trọng. Cần thiết vì có bảng cấu hình
       lấy tên dòng từ Base, mà mấy tên đó trùng nhãn giao diện trong từ điển —
       không chắn thì bảng hiện nửa Việt nửa Anh. */
    '[data-no-i18n]',
  ].join(',');

  let ngonNgu = 'vi';
  const goc = new WeakMap();      // node -> chữ tiếng Việt ban đầu
  const gocAttr = new WeakMap();  // el -> { attr: chữ gốc }

  function dich(s) {
    const t = String(s).trim();
    if (!t) return null;
    if (EN[t] != null) return EN[t];
    for (const [re, ra] of MAU_EN) {
      if (re.test(t)) return t.replace(re, ra);
    }
    /* Select trong Base hay có emoji dẫn đầu ("🟡 Trung bình") — bóc emoji ra,
     * dịch phần chữ rồi gắn emoji lại, khỏi phải khai từng biến thể.
     *
     * ĐÃ TỪNG CHẾT, cùng nguyên nhân với mười mẫu ở MAU_EN: backslash bị shell
     * ăn mất, `[^\p{L}\p{N}]` thành `[^p{L}p{N}]` — một lớp ký tự loại trừ đúng
     * năm chữ cái p { L } N. Hậu quả không phải "không khớp" mà tệ hơn: nó khớp
     * SAI. Với "🟡 Trung bình" nó tách ra ["🟡 Trung bìn", "h"] rồi đi tra
     * EN["h"], đời nào có. Nên toàn bộ đường lùi này im lặng không chạy, và mọi
     * giá trị select có emoji dẫn đầu đứng nguyên tiếng Việt ở chế độ English.
     * Mà những giá trị đó thì BẮT BUỘC giữ emoji — đó là chữ thật trong Base. */
    const m = /^([^\p{L}\p{N}]+)\s*(.+)$/u.exec(t);
    if (m && EN[m[2]] != null) return m[1].trim() + ' ' + EN[m[2]];

    /* Có chỗ server hạ chữ đầu xuống ("sát ngày mà chưa có nhân sự") — thử lại
     * với chữ đầu viết hoa rồi hạ lại kết quả, khỏi phải khai hai lần. */
    if (/^[a-zà-ỹ]/.test(t)) {
      const hoa = t.charAt(0).toUpperCase() + t.slice(1);
      const r = EN[hoa] != null ? EN[hoa] : (() => {
        for (const [re, ra] of MAU_EN) if (re.test(hoa)) return hoa.replace(re, ra);
        return null;
      })();
      if (r) return r.charAt(0).toLowerCase() + r.slice(1);
    }
    return null;
  }

  function xuLyTextNode(n) {
    const cha = n.parentElement;
    if (!cha || cha.closest('script,style,textarea')) return;
    if (ngonNgu === 'en') {
      if (cha.closest(BO_QUA)) return;
      const cu = goc.has(n) ? goc.get(n) : n.nodeValue;
      const moi = dich(cu);
      if (moi == null) return;
      if (!goc.has(n)) goc.set(n, n.nodeValue);
      // giữ nguyên khoảng trắng hai đầu để không phá layout
      const dau = /^\s*/.exec(cu)[0];
      const cuoi = /\s*$/.exec(cu)[0];
      if (n.nodeValue !== dau + moi + cuoi) n.nodeValue = dau + moi + cuoi;
    } else if (goc.has(n)) {
      n.nodeValue = goc.get(n);
      goc.delete(n);
    }
  }

  const ATTR = ['placeholder', 'title', 'aria-label'];

  function xuLyAttr(el) {
    for (const a of ATTR) {
      if (!el.hasAttribute(a)) continue;
      const luu = gocAttr.get(el) || {};
      if (ngonNgu === 'en') {
        const cu = luu[a] != null ? luu[a] : el.getAttribute(a);
        const moi = dich(cu);
        if (moi == null) continue;
        if (luu[a] == null) { luu[a] = cu; gocAttr.set(el, luu); }
        if (el.getAttribute(a) !== moi) el.setAttribute(a, moi);
      } else if (luu[a] != null) {
        el.setAttribute(a, luu[a]);
        delete luu[a];
      }
    }
  }

  function quet(root) {
    const r = root || document.body;
    if (!r) return;
    const it = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    const ds = [];
    for (let n = it.nextNode(); n; n = it.nextNode()) if (n.nodeValue.trim()) ds.push(n);
    ds.forEach(xuLyTextNode);
    if (r.nodeType === 1) {
      if (r.hasAttribute && ATTR.some((a) => r.hasAttribute(a))) xuLyAttr(r);
      r.querySelectorAll('[placeholder],[title],[aria-label]').forEach(xuLyAttr);
    }
  }

  let mo = null;
  function theoDoi() {
    if (mo) return;
    mo = new MutationObserver((ds) => {
      // tự mình đổi text cũng sinh mutation -> tắt quan sát trong lúc dịch
      mo.disconnect();
      try {
        for (const m of ds) {
          if (m.type === 'characterData') xuLyTextNode(m.target);
          else if (m.type === 'attributes') xuLyAttr(m.target);
          else m.addedNodes.forEach((n) => {
            if (n.nodeType === 3) xuLyTextNode(n);
            else if (n.nodeType === 1) quet(n);
          });
        }
      } finally { bat(); }
    });
    bat();
  }
  function bat() {
    if (!mo || !document.body) return;
    mo.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributeFilter: ATTR,
    });
  }

  /* Tên tab trình duyệt cũng phải đổi theo — nó do JS của app đặt nên phải theo dõi. */
  const gocTitle = { vi: null };
  function xuLyTitle() {
    const el = document.querySelector('title');
    if (!el) return;
    if (ngonNgu === 'en') {
      const cu = gocTitle.vi != null ? gocTitle.vi : el.textContent;
      // "<tên base> · Marketing Hub" -> dịch phần đầu
      const m = /^(.+?)s·s(.+)$/.exec(cu.trim());
      let moi = dich(cu);
      if (moi == null && m) {
        const a1 = dich(m[1]) || m[1];
        const a2 = dich(m[2]) || m[2];
        if (a1 !== m[1] || a2 !== m[2]) moi = a1 + ' · ' + a2;
      }
      if (moi == null) return;
      if (gocTitle.vi == null) gocTitle.vi = cu;
      if (el.textContent !== moi) el.textContent = moi;
    } else if (gocTitle.vi != null) {
      el.textContent = gocTitle.vi;
      gocTitle.vi = null;
    }
  }

  /** Đổi ngôn ngữ của trang này. 'vi' | 'en' */
  function dat(v) {
    const moi = v === 'en' ? 'en' : 'vi';
    if (moi === ngonNgu) return;
    ngonNgu = moi;
    document.documentElement.setAttribute('lang', moi);
    document.documentElement.setAttribute('data-lang', moi);
    if (mo) mo.disconnect();
    quet(document.body);
    xuLyTitle();
    theoDoi();
  }

  window.__I18N__ = { dat, hienTai: () => ngonNgu, tuDien: EN };
  window.hubDatNgonNgu = dat;     // shim của lớp vỏ gọi xuống

  /* Trang con cùng origin -> đọc thẳng ngôn ngữ của trang cha khi mới nạp. */
  function tuKhoiTao() {
    let v = '';
    try { v = parent !== window ? parent.document.documentElement.getAttribute('data-lang') || '' : ''; } catch (_) {}
    if (!v) { try { v = localStorage.getItem('hub.lang') || ''; } catch (_) {} }
    if (!v) v = /^en/i.test(navigator.language || '') ? 'en' : 'vi';
    document.documentElement.setAttribute('data-lang', v === 'en' ? 'en' : 'vi');
    if (v === 'en') dat('en'); else theoDoi();
  }

  // app tự đặt document.title lúc chạy -> dịch lại mỗi lần nó đổi
  (function () {
    const el = document.querySelector('title');
    if (!el || !window.MutationObserver) return;
    let dangSua = false;
    new MutationObserver(() => {
      if (dangSua) return;
      dangSua = true;
      try { xuLyTitle(); } finally { dangSua = false; }
    }).observe(el, { childList: true, characterData: true, subtree: true });
  })();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tuKhoiTao);
  else tuKhoiTao();

  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin) return;
    if (ev.data && ev.data.hub === 'lang') dat(ev.data.v);
  });
})();
