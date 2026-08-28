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
    'Base đang quản lý': 'Bases you manage',
    'Đang ẩn': 'Hidden',
    'Thêm base': 'Add base',
    'Cài đặt': 'Settings',
    'Làm mới': 'Refresh',
    'Thời gian': 'Period',
    'Tháng này': 'This month',
    'Tháng trước': 'Last month',
    'Tuần này': 'This week',
    '7 ngày': '7 days',
    '14 ngày': '14 days',
    '30 ngày': '30 days',
    'Tuỳ chọn': 'Custom',
    'Tùy chọn': 'Custom',
    'Toàn bộ': 'All time',
    'Hôm nay': 'Today',
    'Về mặc định': 'Reset',
    'Xem toàn bộ': 'View all',
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
    'Phân quyền thành viên': 'Member permissions',
    'Về Cài đặt': 'Back to settings',
    'Chọn người trong danh bạ…': 'Pick from directory…',
    'Thêm dòng': 'Add row',
    'Mở bảng trong Lark': 'Open table in Lark',
    'Người': 'Person',
    'Email': 'Email',
    'Vị trí': 'Position',
    'Vai': 'Role',
    'Base được xem': 'Visible bases',
    'Tùy chọn cho nhân sự': 'Staff options',
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
  };

  /* ---------------- từ điển: khớp theo mẫu ----------------
   * Cho những câu ghép số/tên vào giữa. $1, $2… là nhóm bắt được.
   */
  const MAU_EN = [
    [/^Quá hạn (\d+) ngày$/, 'Overdue $1 days'],
    [/^quá hạn (\d+) ngày$/, 'overdue $1 days'],
    [/^Còn (\d+) ngày · (.+)$/, '$1 days left · $2'],
    [/^hạn (.+)$/, 'due $1'],
    [/^(\d+) mục$/, '$1 items'],
    [/^(\d+) việc$/, '$1 tasks'],
    [/^(\d+) lịch$/, '$1 trips'],
    [/^(\d+) người · (\d+) lượt · (\d+) người có ngày ≥ (\d+) việc$/,
      '$1 people · $2 assignments · $3 with ≥ $4 tasks/day'],
    [/^(\d+) \/ (\d+) việc · (.+)$/, '$1 / $2 tasks · $3'],
    [/^Tracking · (\d+) việc toàn phòng$/, 'Tracking · $1 tasks (whole team)'],
    [/^Tracking · (\d+) việc của bạn$/, 'Tracking · $1 tasks of yours'],
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
  ];

  /* Vùng chứa DỮ LIỆU — không dịch bên trong, kể cả có trùng nhãn. */
  const BO_QUA = [
    '.n-td', '.n-phu', '.tieu-de',            // tiêu đề việc/lịch trong lớp vỏ
    '.card-title', 'td.c-title', '.dcard-title',   // Bảng công việc
    '.q-ten', '.q-mail', '.tn-ten', '.nm', '.av',  // tên người
    '.log', 'code', 'pre', 'option[data-giu]',
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
     * dịch phần chữ rồi gắn emoji lại, khỏi phải khai từng biến thể. */
    const m = /^([^p{L}p{N}]+)s*(.+)$/u.exec(t);
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
