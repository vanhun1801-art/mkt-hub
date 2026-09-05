// Cấu hình kết nối Lark Base
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Tìm entry script của lark-cli (gọi trực tiếp bằng node để tránh vấn đề .cmd trên Windows). */
function resolveCliScript() {
  const rel = path.join('node_modules', '@larksuite', 'cli', 'scripts', 'run.js');
  const roots = [
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
    '/usr/local/lib',
    '/usr/lib',
  ];
  for (const r of roots) {
    const p = path.join(r, rel);
    if (fs.existsSync(p)) return p;
  }
  // Chế độ api không cần lark-cli (server chung không cài) — chỉ báo lỗi khi thật sự dùng tới.
  return null;
}

// File danh sách quản lý. Đổi bằng LARK_QUYEN_FILE khi cần chạy nhiều cấu hình.
const QUYEN_FILE = process.env.LARK_QUYEN_FILE
  ? path.resolve(__dirname, process.env.LARK_QUYEN_FILE)
  : path.join(__dirname, 'quyen.json');

/** Đọc danh sách quản lý từ quyen.json; chưa có file thì dùng mặc định. */
function loadManagerIds() {
  try {
    const raw = JSON.parse(fs.readFileSync(QUYEN_FILE, 'utf8'));
    const ids = (raw.managers || []).map((s) => String(s).trim()).filter(Boolean);
    if (ids.length) return ids;
  } catch (_) { /* chưa có file hoặc file lỗi -> dùng mặc định */ }
  return module.exports.defaultManagerIds;
}

/** Ghi danh sách quản lý. Không cho lưu danh sách rỗng để tránh khoá hết quyền. */
function saveManagerIds(ids) {
  const clean = [...new Set((ids || []).map((s) => String(s).trim()).filter(Boolean))];
  if (!clean.length) throw new Error('Phải còn ít nhất một quản lý.');
  fs.writeFileSync(
    QUYEN_FILE,
    JSON.stringify({ managers: clean, capNhat: new Date().toISOString() }, null, 2),
    'utf8'
  );
  return clean;
}

module.exports = {
  port: Number(process.env.PORT || 5173),

  // Dấu phiên bản — để biết chắc server đang chạy bản nào
  build: '2026-08-28.1',

  // Base "Tracking" (wiki: AruDwJU14iyla5k6LmYlfXrbgth)
  baseToken: process.env.LARK_BASE_TOKEN || 'JhZtbxv0gamk5ys3Fr0luHnsgwG',
  tableId:   process.env.LARK_TABLE_ID   || 'tbl2ZBrfhXfmrsD4',   // Tracking
  requestTableId: process.env.LARK_REQ_TABLE_ID || 'tblYblcwsjzEVaXM', // Yêu cầu điều chỉnh
  commentTableId: process.env.LARK_CMT_TABLE_ID || 'tbl5uA7zSY0TJMLq', // Bình luận

  /* ---- Trung tâm phân phối công việc ----
   * Hai bảng, cố ý tách đôi: một dòng mỗi LOẠI (bật/tắt, mốc chờ, cách chia) và
   * một dòng mỗi (loại × NGƯỜI) kèm trọng số. Nhét chung một bảng thì hoặc phải
   * gói danh sách người vào một ô chữ (gõ sai tên là hỏng ngầm), hoặc phải lặp
   * lại thiết lập của loại ở mọi dòng.
   *
   * Để trên Base chứ không phải trong mã: anh Hùng sửa được ngay, và không mất
   * sau mỗi lần deploy (ổ đĩa Render là tạm). */
  luongTableId: process.env.LARK_LUONG_TABLE_ID || 'tbl4zkfB8QtBsRty',  // Phân phối - luồng
  phanNguoiTableId: process.env.LARK_PP_NGUOI_TABLE_ID || 'tblT6RaebdLHW4st', // Phân phối - người

  // Tên cột của hai bảng đó. Đọc theo TÊN rồi tra ra field_id lúc chạy — bảng do
  // lark-cli tạo nên id không cố định giữa các môi trường, khai cứng là gãy.
  luongFields: {
    loai: 'Loại công việc',
    bat: 'Bật',
    phut: 'Chờ (phút)',
    cach: 'Cách chia',
    ghiChu: 'Ghi chú',
  },
  phanNguoiFields: {
    loai: 'Loại công việc',
    nguoi: 'Người nhận',
    trongSo: 'Trọng số',
    ghiChu: 'Ghi chú',
  },
  /* CHỈ việc ở mấy trạng thái này mới vào hàng đợi phân phối. "Chờ tiếp nhận" là
   * cửa vào của việc mới đặt; việc chưa có chủ ở trạng thái khác thì là đang làm
   * dở bị gỡ người, hoặc dữ liệu cũ — tự giao mấy cái đó là xen vào việc quản lý
   * đang xử lý tay. */
  phanPhoiTrangThai: ['Chờ tiếp nhận'],

  // Nhãn trong Base -> mã dùng trong phanphoi.js
  cachChia: {
    'Tỷ lệ + cân tải': 'tai',
    'Luân phiên theo tỷ lệ': 'luot',
    'Ít việc nhất': 'it',
  },

  identity: process.env.LARK_AS || 'user',   // user | bot

  /* ---- Chế độ chạy ----
   * cli : dùng phiên lark-cli của máy — mỗi người chạy một bản (mặc định)
   * api : gọi thẳng Open API bằng app credentials + đăng nhập Lark — deploy server chung
   * Tự chọn api khi có đủ LARK_APP_ID + LARK_APP_SECRET.
   */
  mode: process.env.LARK_MODE ||
    ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),

  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',
  // URL công khai của app, dùng làm redirect_uri khi đăng nhập Lark
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  // Khoá ký cookie phiên — BẮT BUỘC đặt khi chạy mode api
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionDays: Number(process.env.SESSION_DAYS || 7),
  larkUrl: 'https://rootytrip2.sg.larksuite.com/wiki/AruDwJU14iyla5k6LmYlfXrbgth',

  // Đường dẫn CLI: gọi trực tiếp run.js để tránh vấn đề .cmd trên Windows
  cliScript: process.env.LARK_CLI_SCRIPT || resolveCliScript(),

  // Giữ dữ liệu bao lâu trước khi hỏi lại Lark. Ngắn thì thấy thay đổi nhanh
  // hơn nhưng gọi API nhiều hơn; đã có cơ chế gộp request trùng nên an toàn.
  cacheTtlMs: Number(process.env.LARK_CACHE_MS || 8000),

  // Field ID -> khoá dùng trong UI
  fields: {
    title:      { id: 'fld9HSAEbM', name: 'Công việc',        type: 'text' },
    detail:     { id: 'fldbx8Jktk', name: 'Chi tiết',          type: 'text' },
    status:     { id: 'fldUEUt6TJ', name: 'Trạng thái',        type: 'select' },
    flow:       { id: 'fld2Cv2rco', name: 'Luồng',             type: 'select' },
    priority:   { id: 'fldRMgxEuz', name: 'Độ ưu tiên',        type: 'select' },
    workType:   { id: 'fldFSa1rlf', name: 'Loại công việc',    type: 'select' },
    campaign:   { id: 'fld7UlB9mE', name: 'Campain',           type: 'select' },
    channel:    { id: 'fldlHAg4yl', name: 'Kênh phân phối',    type: 'multiSelect' },
    owner:      { id: 'fldXLsppcC', name: 'Phụ trách chính',   type: 'user' },
    helper:     { id: 'fldwiw1EOv', name: 'Người hỗ trợ',      type: 'user' },
    requester:  { id: 'flde2eaJAi', name: 'Người order',       type: 'user' },
    startAt:    { id: 'fldWFVt1Qj', name: 'Ngày bắt đầu',      type: 'datetime' },
    deadline1:  { id: 'fldXqWQUvG', name: 'Deadline 1',        type: 'datetime' },
    deadline2:  { id: 'fldAz9XIOm', name: 'Deadline 2',        type: 'datetime' },
    link:       { id: 'fld7qO1zyb', name: 'Link',              type: 'url' },
    note:       { id: 'fld59D2dAX', name: 'Ghi chú',           type: 'text' },
    rating:     { id: 'fldatiVxIl', name: 'Chấm điểm',         type: 'rating' },
    attachment: { id: 'fldJp3mzWY', name: 'Tệp đính kèm',      type: 'attachment', readOnly: true },
    /* Tài liệu người order gửi kèm để riêng với sản phẩm nhân sự nộp về: ô trên là
     * "Tệp đính kèm", ô này là "File kết quả". Nhìn Base là biết ai đưa gì. */
    fileKetQua:  { id: 'fld0qir7Qw', name: 'File kết quả',       type: 'attachment', readOnly: true },
    /* Cùng lý do với hai ô tệp: cột "Link" là link tracking / tài liệu do người
     * order đưa, còn đây là link sản phẩm nhân sự nộp về. Chung một ô thì ai nộp
     * sau đè người trước. */
    linkKetQua:  { id: 'fldjdI2qXM', name: 'Link kết quả',       type: 'url' },
    /* Việc TRỄ thì nhân sự không đổi trạng thái được nữa (để cuối tháng còn thống
     * kê được ai trễ), nhưng vẫn phải có chỗ nộp sản phẩm và cho việc đó rời khỏi
     * hàng đợi "phải hối". Hai cột này giữ vai đó — tick được cả trong Base. */
    daGiaiQuyet:   { id: 'fldhYDnqUx', name: 'Đã giải quyết',  type: 'checkbox' },
    ngayGiaiQuyet: { id: 'fldFy0vF7l', name: 'Ngày giải quyết', type: 'datetime' },
    parent:     { id: 'fld80gHPbr', name: 'Parent items',      type: 'link',       readOnly: true },
  },

  // Bảng "Yêu cầu điều chỉnh"
  requestFields: {
    task:     { id: 'fld8vL6fHK', name: 'Công việc cần điều chỉnh', type: 'link' },
    parts:    { id: 'fldVqWMQ6g', name: 'Thông tin cần sửa 2',       type: 'multiSelect' },
    proposal: { id: 'fld9p1BQf3', name: 'Nội dung điều chỉnh đề xuất', type: 'text' },
    reason:   { id: 'fldCgEOyqx', name: 'Lý do',                     type: 'text' },
    content:  { id: 'fldLHoneA6', name: 'Nội dung yêu cầu',          type: 'text' },
    sender:   { id: 'fldE4ds7N5', name: 'Người gửi yêu cầu',         type: 'user' },
    handled:  { id: 'fldbjniLrs', name: 'Trạng thái xử lý',          type: 'checkbox' },
    evidence: { id: 'fldtq1qLoa', name: 'Tệp minh chứng',            type: 'attachment', readOnly: true },
  },

  // Bảng "Bình luận"
  commentFields: {
    content: { id: 'fldU91Y4dm', name: 'Nội dung',   type: 'text' },
    task:    { id: 'fldKbMPwc4', name: 'Công việc',  type: 'link' },
    author:  { id: 'fldEp0NeFp', name: 'Người viết', type: 'user' },
    at:      { id: 'fldbzKMDbJ', name: 'Thời gian',  type: 'datetime' },
  },

  /* ---- Thông báo qua Lark ---- */
  // Bật bằng LARK_NOTIFY=1. Cần cấp scope im:message cho app.
  notify: process.env.LARK_NOTIFY === '1',

  // Thứ tự cột Kanban
  statusOrder: ['Chờ tiếp nhận', 'Đang tiến hành', 'Làm lại', 'Tạm dừng', 'Trễ deadline', 'Hoàn thành', 'Hủy'],

  /* ---- Quy tắc từ tài liệu "Base Tracking - Training" ---- */

  // Trạng thái người phụ trách chính được tự đặt
  staffStatuses: ['Đang tiến hành', 'Hoàn thành'],

  // Trạng thái do admin/quản lý giữ — nhân sự không tự đặt
  adminStatuses: ['Tạm dừng', 'Trễ deadline', 'Hủy'],

  /* Trường nhân sự được sửa; còn lại là của người order → phải gửi Yêu cầu điều chỉnh.
   * daGiaiQuyet/ngayGiaiQuyet KHÔNG nằm ở đây: chỉ đặt được qua nút "Giải quyết"
   * (bắt buộc có minh chứng), không sửa tự do qua PATCH. */
  /* Bỏ 'link' khỏi đây: đó là ô của người order (link tracking, tài liệu tham
   * chiếu). Nhân sự nộp vào 'linkKetQua'. */
  staffEditable: ['status', 'linkKetQua', 'note', 'helper', 'startAt'],

  // Chuyển sang trạng thái này bắt buộc phải có Tệp đính kèm hoặc Link kết quả
  proofRequiredFor: 'Hoàn thành',

  /* Việc đã quá hạn: nhân sự KHÔNG được tự đặt Hoàn thành nữa. Họ bấm "Giải quyết"
   * — nộp sản phẩm, việc rời khỏi hàng đợi quá hạn, nhưng TRẠNG THÁI KHÔNG ĐỔI để
   * cuối tháng vẫn đếm được ai trễ. Quản lý muốn đóng hẳn thì tự đặt Hoàn thành. */
  chanHoanThanhKhiTre: true,

  /* ---- Phân quyền xem ---- */
  // Mỗi người chỉ thấy việc của chính mình. Chỉ open_id trong danh sách này
  // mới xem được toàn phòng (tab Kanban / Bảng, tạo & xoá công việc).
  // Thêm/bớt open_id ở đây; lấy open_id bằng: lark-cli contact +resolve --name "<tên>"
  // Quản lý mặc định khi chưa có quyen.json (tránh bị khoá hết quyền)
  defaultManagerIds: (process.env.LARK_MANAGER_IDS || 'ou_f0d3514abf6b168bef076441f350c585')
    .split(',').map((s) => s.trim()).filter(Boolean),

  quyenFile: QUYEN_FILE,
  loadManagerIds,
  saveManagerIds,

  /* ---- Form đặt việc ---- */
  // Trường ai cũng điền được khi tạo việc — đúng bộ trường của Form
  // "Yêu cầu công việc" trong tài liệu Training.
  staffCreatable: ['title', 'detail', 'workType', 'priority', 'startAt', 'deadline1', 'link', 'note'],

  // Trường phân công / phân loại cấp phòng — chỉ quản lý thấy và điền
  managerOnlyFields: ['campaign', 'owner', 'helper', 'channel', 'flow', 'rating', 'deadline2', 'requester'],
};
