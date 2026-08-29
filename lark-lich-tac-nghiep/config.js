// Cấu hình kết nối Lark Base "Lịch tác nghiệp"
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
  // Chế độ api (server chung như Render) không cài lark-cli — đừng ném lỗi ở đây,
  // vì config.js nạp lúc khởi động thì cả app sẽ chết. lark.js sẽ báo khi thật sự dùng tới.
  return null;
}

const QUYEN_FILE = process.env.LARK_QUYEN_FILE
  ? path.resolve(__dirname, process.env.LARK_QUYEN_FILE)
  : path.join(__dirname, 'quyen.json');

/** Đọc danh sách quản lý từ quyen.json; chưa có file thì dùng mặc định. */
function loadManagerIds() {
  try {
    const raw = JSON.parse(fs.readFileSync(QUYEN_FILE, 'utf8'));
    const ids = (raw.managers || []).map((s) => String(s).trim()).filter(Boolean);
    if (ids.length) return ids;
  } catch (_) { /* chưa có file -> mặc định */ }
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
  port: Number(process.env.PORT || 5174),

  baseToken: process.env.LARK_BASE_TOKEN || 'U8bAbfnwgalWgDsEU11lpHfPgTb',
  tableId:   process.env.LARK_TABLE_ID   || 'tblwfl1sEXHI9HOp',
  identity:  process.env.LARK_AS || 'user',

  /* ---- Chế độ chạy ----
   * cli : dùng phiên lark-cli của máy — mỗi người chạy một bản (mặc định khi ở máy)
   * api : gọi thẳng Open API bằng app credentials — dùng khi deploy server chung.
   *       Danh tính từng người do lớp vỏ (Marketing Hub) đăng nhập rồi truyền xuống
   *       qua header X-Hub-User-Id / X-Hub-User-Name.
   * Tự chọn api khi có đủ LARK_APP_ID + LARK_APP_SECRET.
   */
  mode: process.env.LARK_MODE ||
    ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',

  larkUrl: 'https://rootytrip2.sg.larksuite.com/base/U8bAbfnwgalWgDsEU11lpHfPgTb?table=tblwfl1sEXHI9HOp&view=vewJDIZobW',

  cliScript: process.env.LARK_CLI_SCRIPT || resolveCliScript(),
  cacheTtlMs: 20000,

  // Field ID -> khoá dùng trong UI. Lấy từ +field-list, không đoán.
  fields: {
    title:        { id: 'fldMvjlOhk', name: 'Tên hoạt động',            type: 'text' },
    purpose:      { id: 'fld9nKrKzm', name: 'Mục đích',                 type: 'text' },
    plan:         { id: 'flddvSstS2', name: 'Kế hoạch',                 type: 'text' },
    start:        { id: 'fldj5zK7xA', name: 'Thời gian bắt đầu',        type: 'datetime' },
    end:          { id: 'fldwj1Z06o', name: 'Thời gian kết thúc',       type: 'datetime' },
    duration:     { id: 'fldAiCLKcM', name: 'Thời lượng',               type: 'select' },
    status:       { id: 'fldK5SXHep', name: 'Trạng thái',               type: 'select' },
    owner:        { id: 'fldDmYi9su', name: 'Phụ trách',                type: 'user' },
    staff:        { id: 'fldNi5QZYQ', name: 'Nhân sự',                  type: 'user' },
    transport:    { id: 'fldbwQkvCl', name: 'Phương tiện',              type: 'multiSelect' },
    costPlan:     { id: 'fldp2Niwos', name: 'Chi phí dự kiến',          type: 'number' },
    costActual:   { id: 'flduWFHoEQ', name: 'Chi phí thực tế',          type: 'number' },
    payment:      { id: 'fld8vdgJo8', name: 'Thanh toán chi phí',       type: 'select' },
    foc:          { id: 'fldwz9ITPO', name: 'FOC',                      type: 'multiSelect' },
    focRequest:   { id: 'fldHypSVTm', name: 'Yêu cầu FOC',              type: 'checkbox' },
    focStatus:    { id: 'fldzWCH1wy', name: 'Trạng thái FOC',           type: 'select' },
    mediaRequest: { id: 'fldcY66185', name: 'Yêu cầu phòng Media',      type: 'checkbox' },
    mediaStatus:  { id: 'fldva9vZjw', name: 'Trạng thái nhân sự Media', type: 'select' },
    mediaSent:    { id: 'fldRidLKZS', name: 'Gửi Feedback Media',       type: 'checkbox' },
    mediaNote:    { id: 'fldWWha9wN', name: 'Feedback nhân sự Media',   type: 'text' },
    report:       { id: 'fld8UE0rNd', name: 'Báo cáo & ghi chú',        type: 'text' },
    // Ghi chú TRƯỚC chuyến nằm ở 'report'; ô này là báo cáo SAU chuyến, nhân sự
    // tự điền trong cửa sổ Báo cáo. Tách hẳn để hai nội dung không đè lên nhau.
    reportAfter:  { id: 'fldOyWVGRZ', name: 'Báo cáo sau tác nghiệp',   type: 'text' },
    link:         { id: 'fldXmEsMAD', name: 'Liên kết',                 type: 'text' },
    tickets:      { id: 'fld4ka0VLj', name: 'Vé & thông tin cần thiết', type: 'attachment', readOnly: true },
    files:        { id: 'fldhQfS9ch', name: 'Tệp đính kèm',             type: 'attachment', readOnly: true },
    unc:          { id: 'fld7DqfHbF', name: 'UNC',                      type: 'attachment', readOnly: true },
    hours:        { id: 'fldeShXr5l', name: 'Thời lượng tác nghiệp',    type: 'formula',    readOnly: true },
    week:         { id: 'fldPWVFfYI', name: 'Tuần tác nghiệp',          type: 'formula',    readOnly: true },
    month:        { id: 'fldQIlDkZ5', name: 'Tháng tác nghiệp',         type: 'formula',    readOnly: true },
  },

  // Ô đính kèm nhân sự được phép tải lên
  uploadable: ['tickets', 'files', 'unc'],

  /* ---- Luồng trạng thái ---- */
  statusOrder: [
    'Đang lên kế hoạch',
    'Chờ duyệt/Xử lý',
    'Từ chối/Cần điều chỉnh',
    'Duyệt/Chờ tác nghiệp',
    'Đang báo cáo',
    'Đã hoàn tất',
    'Từ chối',
    'Hủy lịch',
  ],

  // Nhân sự tự đặt được
  staffStatuses: ['Đang lên kế hoạch', 'Chờ duyệt/Xử lý', 'Đang báo cáo'],

  // Chỉ quản lý đặt
  managerStatuses: ['Duyệt/Chờ tác nghiệp', 'Từ chối/Cần điều chỉnh', 'Từ chối', 'Hủy lịch', 'Đã hoàn tất'],

  // Trường nhân sự được sửa
  staffEditable: [
    'title', 'purpose', 'plan', 'start', 'end', 'duration', 'staff',
    'transport', 'costPlan', 'foc', 'focRequest', 'mediaRequest',
    'report', 'reportAfter', 'link', 'status', 'costActual', 'mediaNote',
  ],

  // Trường chỉ quản lý được sửa (dùng cho form + chốt ở server)
  // mediaNote là nhận xét VỀ nhân sự Media, do người xin hỗ trợ viết sau chuyến —
  // nên để nhân sự điền trong cửa sổ Báo cáo, không phải quyền riêng của quản lý.
  managerOnlyFields: ['owner', 'payment', 'focStatus', 'mediaStatus', 'mediaSent'],

  // Trường bắt buộc khi đăng ký lịch mới
  requiredOnCreate: ['title', 'purpose', 'start'],

  // Chuyển sang trạng thái này bắt buộc có Báo cáo hoặc Liên kết
  proofRequiredFor: 'Đang báo cáo',

  defaultManagerIds: (process.env.LARK_MANAGER_IDS || 'ou_f0d3514abf6b168bef076441f350c585')
    .split(',').map((s) => s.trim()).filter(Boolean),

  quyenFile: QUYEN_FILE,
  loadManagerIds,
  saveManagerIds,
};
