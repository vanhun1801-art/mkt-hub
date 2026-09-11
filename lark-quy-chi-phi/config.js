// Cấu hình kết nối Lark Base "Chi phí Marketing"
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
  /* Chế độ api (Render) không cài lark-cli — đừng ném lỗi ở đây, cả app sẽ chết
   * lúc khởi động. lark.js báo khi thật sự dùng tới. */
  return null;
}

module.exports = {
  port: Number(process.env.PORT || 5182),

  /* cli: dùng phiên lark-cli của máy · api: gọi Open API bằng app credentials */
  mode: process.env.LARK_MODE ||
    ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),
  identity: process.env.LARK_AS || 'user',
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',
  cliScript: process.env.LARK_CLI_SCRIPT || resolveCliScript(),
  cacheTtlMs: 15000,

  baseToken: process.env.LARK_BASE_TOKEN || 'IQfUbtDDZacFdCsl657l9hOPged',
  larkUrl: 'https://rootytrip2.sg.larksuite.com/base/IQfUbtDDZacFdCsl657l9hOPged',

  /* Ba bảng. `tableId` là bảng Chi phí vì lark.js lấy nó làm mặc định — mọi lời
   * gọi tới hai bảng kia đều truyền id tường minh. */
  tableId: process.env.LARK_TB_CHI || 'tblf4Rq9ei6Fp6A1',
  dotTableId: process.env.LARK_TB_DOT || 'tblsgGaO4NWnMYRV',
  napTableId: process.env.LARK_TB_NAP || 'tblkfhu5isXjjFUy',

  /* Field ID lấy từ +field-list, không đoán. Đổi tên cột trên Base thì app vẫn
   * chạy; xoá cột mới hỏng. */
  fields: {
    chi: {
      noiDung:     { id: 'fldLkfXrBP', name: 'Nội dung chi',          type: 'text' },
      loai:        { id: 'fld0t3xVyd', name: 'Loại chi',              type: 'select' },
      tien:        { id: 'fld0FWFs8h', name: 'Số tiền',               type: 'number' },
      ngayDeNghi:  { id: 'fldrVB6aeO', name: 'Ngày đề nghị',          type: 'datetime' },
      ngayChi:     { id: 'fld1C4kkhS', name: 'Ngày thanh toán',       type: 'datetime' },
      nguoi:       { id: 'fldzDcQ1Jw', name: 'Người đề nghị',         type: 'user' },
      tinhTrang:   { id: 'fldKyr5FHI', name: 'Tình trạng',            type: 'select' },
      hoaDon:      { id: 'fldEqE0qRD', name: 'Hoá đơn',               type: 'attachment' },
      unc:         { id: 'fld0d01YS8', name: 'UNC',                   type: 'attachment' },
      soHoaDon:    { id: 'fldNQdS5QF', name: 'Số hoá đơn',            type: 'text' },
      maDieuHanh:  { id: 'fldu8cayad', name: 'Mã điều hành',          type: 'text' },
      maDon:       { id: 'fldg9FSPmL', name: 'Mã đơn Tourwell',       type: 'text' },
      ncc:         { id: 'fld8TVDc9t', name: 'Nhà cung cấp trên TW',  type: 'text' },
      chuyenKhoan: { id: 'fldhQAijCk', name: 'Thông tin chuyển khoản', type: 'text' },
      maQuyetToan: { id: 'fldZqsDCDg', name: 'Mã quyết toán',         type: 'text' },
      linkCu:      { id: 'fldwCcDfg7', name: 'Link chứng từ cũ',      type: 'text' },
      linkUncCu:   { id: 'fldTFNtK0m', name: 'Link UNC cũ',           type: 'text' },
      buoiTacNghiep: { id: 'fldFKIFMah', name: 'Buổi tác nghiệp',     type: 'text' },
      ghiChu:      { id: 'fldcrapG2C', name: 'Ghi chú',               type: 'text' },
      dot:         { id: 'fld9V3pjSa', name: 'Đợt tạm ứng',           type: 'link' },
    },
    dot: {
      ma:        { id: 'fld4c4l09s', name: 'Mã phiếu chi',  type: 'text' },
      ngayMo:    { id: 'fldFnenkwe', name: 'Ngày mở',       type: 'datetime' },
      nguoiGiu:  { id: 'fldWWOSqU4', name: 'Người giữ quỹ', type: 'user' },
      tinhTrang: { id: 'fldmjtdDVD', name: 'Tình trạng',    type: 'select' },
      ghiChu:    { id: 'fldMro5Pk5', name: 'Ghi chú',       type: 'text' },
      tongNap:   { id: 'fldrzRVkkY', name: 'Tổng nạp',      type: 'formula', readOnly: true },
      tongChi:   { id: 'fldAcFoWna', name: 'Tổng đã chi',   type: 'formula', readOnly: true },
      conLai:    { id: 'fldfCjTl0y', name: 'Còn lại',       type: 'formula', readOnly: true },
    },
    nap: {
      noiDung: { id: 'fldNlPKhgx', name: 'Nội dung',     type: 'text' },
      ngay:    { id: 'fldREvuIdl', name: 'Ngày nạp',     type: 'datetime' },
      tien:    { id: 'fldiGHnrXo', name: 'Số tiền',      type: 'number' },
      loai:    { id: 'fld3t30WPi', name: 'Loại',         type: 'select' },
      dot:     { id: 'fldbnAInwv', name: 'Đợt tạm ứng',  type: 'link' },
      ghiChu:  { id: 'fldJraekkG', name: 'Ghi chú',      type: 'text' },
    },
  },

  loaiChi: ['Tác nghiệp', 'Di chuyển', 'Công cụ & phần mềm', 'In ấn',
    'Quảng cáo', 'Tiếp khách', 'Khác'],
  tinhTrang: ['Chờ chi', 'Đã chi', 'Đã quyết toán'],

  /* Ô đính kèm được phép tải lên. Hai ô này là lý do chính bỏ Google Sheet:
   * chứng từ nằm ngay trong bảng, kế toán không phải xin quyền Drive. */
  uploadable: ['hoaDon', 'unc'],

  /* Chỉ một người dùng app này (anh Hùng chốt). Kế toán xem thẳng trên Base
   * với quyền chỉ đọc, không cần tài khoản trong app. */
  chuQuy: (process.env.LARK_CHU_QUY || 'ou_f0d3514abf6b168bef076441f350c585')
    .split(',').map((s) => s.trim()).filter(Boolean),
};
