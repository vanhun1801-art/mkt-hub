'use strict';
/**
 * Cấu hình app "Báo cáo công việc" — app con thứ 9 của Marketing Hub.
 *
 * Vì sao có app này: cả phòng đang gửi báo cáo ngày bằng ẢNH CHỤP bảng Excel vào
 * nhóm Lark. Nội dung trong ảnh thì không tìm được, không cộng được, không đưa
 * cho AI đọc được — trong khi chính mấy con số đó (phút, nhóm việc, tiến độ) là
 * thứ bảng nhiệt và KPI đang cần. App này nhận đúng nội dung ấy dưới dạng DÒNG,
 * mỗi đầu việc một bản ghi.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Tìm entry script của lark-cli (gọi thẳng bằng node để né chuyện .cmd trên Windows). */
function timCli() {
  const rel = path.join('node_modules', '@larksuite', 'cli', 'scripts', 'run.js');
  const roots = [
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
    '/usr/local/lib', '/usr/lib',
  ];
  for (const r of roots) {
    const p = path.join(r, rel);
    if (fs.existsSync(p)) return p;
  }
  /* Chế độ api (Render) không cài lark-cli. Đừng ném lỗi ở đây, cả app sẽ chết
   * lúc khởi động — lớp gọi Base báo khi thật sự cần tới. */
  return null;
}

module.exports = {
  port: Number(process.env.PORT || 5183),

  /* cli: dùng phiên lark-cli của máy · api: gọi Open API bằng app credentials */
  mode: process.env.LARK_MODE ||
    ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),
  identity: process.env.LARK_AS || 'user',
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',
  cliScript: process.env.LARK_CLI_SCRIPT || timCli(),
  cacheTtlMs: 15000,

  /* Base "Báo cáo công việc MKT", dựng 12/09/2026 bằng thiet-lap/tao-base.js. */
  baseToken: process.env.LARK_BASE_TOKEN || 'IqK1b8mdSapQaIsYhavlMMxzgQf',
  larkUrl: 'https://rootytrip2.sg.larksuite.com/base/IqK1b8mdSapQaIsYhavlMMxzgQf',

  phieuTableId: process.env.LARK_TB_PHIEU || 'tblMIviEWyBXNTFz',
  dongTableId: process.env.LARK_TB_DONG || 'tblo5FBTVuXzv0W0',

  /* Field ID lấy từ +field-list, không đoán. Đổi TÊN cột trên Base thì app vẫn
   * chạy; xoá cột mới hỏng — đó là lý do dùng id chứ không dùng tên. */
  fields: {
    phieu: {
      ma:          { id: 'fldHWf4ymH', name: 'Mã phiếu',        type: 'text' },
      loaiKy:      { id: 'fld6q2G4wU', name: 'Loại kỳ',         type: 'select' },
      tuNgay:      { id: 'fld3ctuRgl', name: 'Từ ngày',         type: 'datetime' },
      denNgay:     { id: 'fld6yF7MnX', name: 'Đến ngày',        type: 'datetime' },
      nguoi:       { id: 'fld4G24oLz', name: 'Người',           type: 'text' },
      email:       { id: 'fldJoYXya8', name: 'Email',           type: 'text' },
      tenNguoi:    { id: 'fldihEfLi3', name: 'Tên người',       type: 'text' },
      ca:          { id: 'fldQ2Kzngx', name: 'Ca',              type: 'select' },
      dinhMuc:     { id: 'fldghdRyEH', name: 'Định mức phút',   type: 'number' },
      tongPhut:    { id: 'fldY9MelWp', name: 'Tổng phút',       type: 'number' },
      phanTram:    { id: 'fldLAhVcYp', name: '% hoàn thành',    type: 'number' },
      nhanDinh:    { id: 'fldcQtMuGn', name: 'Nhận định',       type: 'text' },
      keHoach:     { id: 'fldwFNk15n', name: 'Kế hoạch kỳ sau', type: 'text' },
      trangThai:   { id: 'fldcESNvXR', name: 'Trạng thái',      type: 'select' },
      nopLuc:      { id: 'fldZc1hU6W', name: 'Nộp lúc',         type: 'datetime' },
      hanNop:      { id: 'fld6Z3hmfp', name: 'Hạn nộp',         type: 'datetime' },
      dungHan:     { id: 'fldVWuX78v', name: 'Đúng hạn',        type: 'select' },
      trePhut:     { id: 'fldSzBHUfy', name: 'Trễ (phút)',      type: 'number' },
      canHoTro:    { id: 'fld7EQt4lV', name: 'Cần hỗ trợ',      type: 'text' },
      danhGiaAI:   { id: 'fldGz6B366', name: 'Đánh giá AI',     type: 'text' },
      diemAI:      { id: 'fldE7Dj8pp', name: 'Điểm AI',         type: 'number' },
    },
    dong: {
      congViec:    { id: 'fldMheDpEc', name: 'Công việc',       type: 'text' },
      maPhieu:     { id: 'fldLOYQorR', name: 'Mã phiếu',        type: 'text' },
      ngay:        { id: 'fldybGgAf3', name: 'Ngày',            type: 'datetime' },
      nguoi:       { id: 'fldHDaZY7c', name: 'Người',           type: 'text' },
      email:       { id: 'fld9iBnCqe', name: 'Email',           type: 'text' },
      tenNguoi:    { id: 'fldg6E9qI5', name: 'Tên người',       type: 'text' },
      nhom:        { id: 'fldir5ctSP', name: 'Nhóm việc',       type: 'select' },
      phut:        { id: 'fldH0Ow26w', name: 'Số phút',         type: 'number' },
      tienDo:      { id: 'fldRa41V4n', name: 'Tiến độ',         type: 'text' },
      /* Tiến độ đo bằng SỐ là mặc định (anh Hùng chốt 12/09) — cộng được, so
       * được, vẽ được. Ô `tienDo` chữ ở trên còn lại vai mô tả thêm. */
      tienDoPt:    { id: 'fldVwUZluK', name: 'Tiến độ %',       type: 'number' },
      /* record_id bên Bảng công việc. Rỗng nghĩa là đầu việc này không có trong
       * tracking — chỉ nhóm "Khác" mới được gõ tay tên việc. */
      maViec:      { id: 'fldzmmM4X3', name: 'Mã việc tracking', type: 'text' },
      trangThai:   { id: 'fldZiU2VNb', name: 'Trạng thái việc', type: 'select' },
      ghiChu:      { id: 'fldHnljusq', name: 'Ghi chú',         type: 'text' },
    },
  },

  /* Giá trị select phải khớp TỪNG CHỮ với option trên Base — Base từ chối giá
   * trị lạ chứ không tự thêm. Gom vào đây để không ai gõ tay ở chỗ khác. */
  chon: {
    loaiKy: { ngay: 'Ngày', tuan: 'Tuần', thang: 'Tháng' },
    ca: { ngay: 'Cả ngày', nua: 'Nửa ngày', khac: 'Khác' },
    trangThaiPhieu: { nhap: 'Nháp', daNop: 'Đã nộp' },
    dungHan: { 'dung-han': 'Đúng hạn', tre: 'Trễ', thieu: 'Thiếu' },
    trangThaiViec: ['Hoàn thành', 'Đang làm', 'Tạm dừng', 'Huỷ'],
    nhomViec: ['Page', 'TikTok', 'Edit video', 'Chỉnh ảnh', 'Thiết kế', 'Kịch bản',
      'Chụp/Quay', 'Chạy quảng cáo', 'Báo cáo', 'Họp', 'Khác'],
  },
};
