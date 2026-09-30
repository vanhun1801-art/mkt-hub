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
  thietLapTableId: process.env.LARK_TB_THIET_LAP || 'tblw5Tlrq8ioUI0o',

  /* Vị trí từng người lấy từ bảng Phân quyền của hub (cột "Vị trí") — nơi anh
   * Hùng đã khai sẵn, không khai lại lần hai ở app này. */
  phanQuyen: {
    base: process.env.HUB_QUYEN_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG',
    table: process.env.HUB_QUYEN_TABLE || 'tblBKm6ZurhN3703',
  },

  /* App Chỉnh ảnh đã đếm sẵn số ảnh/video mỗi lô người ta chỉnh (anh Hùng
   * 30/09: "nếu bạn thực hiện chỉnh ảnh thì sẽ có số liệu đó") — chỉ tiêu "ảnh
   * hậu kỳ" của Designer lấy thẳng từ đây, không bắt gõ lại số lượng. */
  chinhAnh: {
    base: process.env.ANH_BASE_TOKEN || 'OzF9bSPkPamYQHsNcU8lmMVQgFb',
    table: 'tblPBDyAV8sOM1ne',
    f: { nguoi: 'fldXjGGZeg', anh: 'fld4FvLZzo', video: 'fldf2Ub8NS', luc: 'fldVinadYI' },
  },

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
      /* "Nộp lúc" giữ lần nộp ĐẦU TIÊN và không bao giờ bị ghi đè — chấm đúng
       * hạn phải theo lần đầu, chứ mở ra sửa một chữ mà thành trễ thì cả bảng
       * kỷ luật thành vô nghĩa. Ba ô dưới ghi phần còn lại. */
      suaLuc:      { id: 'fldjCo1qix', name: 'Sửa lúc',         type: 'datetime' },
      soLanNop:    { id: 'fldiYe9fz6', name: 'Số lần nộp',      type: 'number' },
      nopBu:       { id: 'fldN6kH4RD', name: 'Nộp bù',          type: 'checkbox' },
      canHoTro:    { id: 'fld7EQt4lV', name: 'Cần hỗ trợ',      type: 'text' },
      /* Nhân sự vốn đã gửi kèm link video báo cáo trong nhóm Lark (Thư và Pinky
       * dùng Minutes). Không có ô này thì họ mất một thứ đang làm được. */
      linkVideo:   { id: 'fldFYQix0N', name: 'Link video',      type: 'url' },
      danhGiaAI:   { id: 'fldGz6B366', name: 'Đánh giá AI',     type: 'text' },
      /* Quản lý đánh dấu vướng mắc "Cần hỗ trợ" đã xử lý chưa (anh Hùng 30/09).
       * Nhân sự lưu lại phiếu KHÔNG ghi đè bốn ô này — kho.js không gửi chúng. */
      hoTroXong:   { id: 'fldAvkWhXt', name: 'Hỗ trợ đã xử lý', type: 'checkbox' },
      hoTroGhiChu: { id: 'fldBXZqGWR', name: 'Hỗ trợ ghi chú',  type: 'text' },
      hoTroBoi:    { id: 'fldsXkg8gV', name: 'Hỗ trợ xử lý bởi', type: 'text' },
      hoTroLuc:    { id: 'fldJ1GTeue', name: 'Hỗ trợ xử lý lúc', type: 'datetime' },
      hoTroTT:     { id: 'fldKXVnzAM', name: 'Hỗ trợ trạng thái', type: 'select' },
      hoTroBaoLuc: { id: 'fldy42HUhj', name: 'Hỗ trợ đã báo lúc', type: 'datetime' },
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
      /* 500 ảnh hậu kỳ hay 4 bài đăng là MỘT dòng việc — không có ô này thì không
       * đếm được sản lượng theo chuẩn vị trí. Rỗng = 1. Thêm 30/09/2026. */
      soLuong:     { id: 'fldihaykaU', name: 'Số lượng',        type: 'number' },
    },
    /* Bảng "Thiết lập": chuẩn theo vị trí do quản lý chỉnh trong app. Lưu ở Base
     * vì ổ Render mất sau mỗi lần deploy. Dựng bằng thiet-lap/nang-cap-chuan.js. */
    thietLap: {
      khoa:        { id: 'fldajWwJ2O', name: 'Khoá',            type: 'text' },
      giaTri:      { id: 'fldw9BWBFV', name: 'Giá trị',         type: 'text' },
      suaBoi:      { id: 'fldy2UsCQs', name: 'Sửa bởi',         type: 'text' },
      suaLuc:      { id: 'fldcgUGlWN', name: 'Sửa lúc',         type: 'datetime' },
    },
  },

  /* Giá trị select phải khớp TỪNG CHỮ với option trên Base — Base từ chối giá
   * trị lạ chứ không tự thêm. Gom vào đây để không ai gõ tay ở chỗ khác. */
  chon: {
    loaiKy: { ngay: 'Ngày', tuan: 'Tuần', thang: 'Tháng' },
    ca: { ngay: 'Cả ngày', nua: 'Nửa ngày', khac: 'Khác' },
    trangThaiPhieu: { nhap: 'Nháp', daNop: 'Đã nộp' },
    dungHan: { 'dung-han': 'Đúng hạn', tre: 'Trễ', thieu: 'Thiếu' },
    hoTro: { chua: 'Chưa xử lý', xong: 'Đã xử lý', 'chua-duoc': 'Chưa xử lý được' },
    trangThaiViec: ['Hoàn thành', 'Đang làm', 'Tạm dừng', 'Huỷ'],
    /* Năm nhóm cuối thêm 30/09/2026 sau khi đọc 184 bảng ảnh chụp: thiếu chúng
     * thì Website ghi gì cũng rơi vào "Khác", và thời gian chết (Capcut lỗi, mất
     * điện) bị chấm là phân bổ kém. */
    nhomViec: ['Page', 'TikTok', 'Edit video', 'Chỉnh ảnh', 'Thiết kế', 'Kịch bản',
      'Chụp/Quay', 'Livestream', 'Chạy quảng cáo', 'Website/SEO', 'OTA', 'Chatbot',
      'Báo cáo', 'Họp', 'Khác', 'Lỗi máy / mất điện'],
  },
};
