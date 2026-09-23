'use strict';
/**
 * Cấu hình app "Lịch làm việc" — app con thứ 11 của Marketing Hub.
 *
 * Vì sao có app này: lịch làm việc của phòng đang do HCNS giữ trong sheet LLV
 * hằng tháng, còn Marketing lại lệch với sheet đó (ai đổi T7, ai xin phép thì
 * HCNS không nắm kịp). Anh Hùng chốt 23/09/2026: mọi người đăng ký qua app, lịch
 * nằm ở Base của phòng, rồi xuất ra chép sang sheet HCNS. Base này cũng là nguồn
 * để bản đồ nhiệt Tải nhân sự của hub biết hôm nào ai nghỉ.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

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
  return null;
}

const p2 = (n) => String(n).padStart(2, '0');

/* id cột "Ngày 01…31", đọc từ +field-list lúc dựng Base 23/09/2026. */
const NGAY = {
  1: 'fldTanWlt5', 2: 'fldl98cl2R', 3: 'fldPKNKwYu', 4: 'fldVnAFtDO', 5: 'fldnUCbjlo',
  6: 'fldzweRrzD', 7: 'fldpWvJGkg', 8: 'fldLs7J53e', 9: 'fldxobeaJJ', 10: 'fld4NCmDWa',
  11: 'fld3F309Bm', 12: 'fldHaKPTWT', 13: 'fldGhrBtFE', 14: 'fldUH9qFXZ', 15: 'fldzM0D3xC',
  16: 'fld4vAbWC7', 17: 'fldw2RTJRa', 18: 'fldtrWGqHt', 19: 'fldnJSEWfw', 20: 'fldpUR1Jje',
  21: 'fldO9tGe6x', 22: 'fldCtFmoLb', 23: 'fldxhnGXUc', 24: 'fldLUWgnih', 25: 'fldQhrOcwC',
  26: 'fldKxYyJCT', 27: 'fldgc2qrm6', 28: 'fld6rzDA6m', 29: 'fldGuupDej', 30: 'fld3MD6cxx',
  31: 'fldpVLAhqm',
};

module.exports = {
  port: Number(process.env.PORT || 5185),

  mode: process.env.LARK_MODE ||
    ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),
  identity: process.env.LARK_AS || 'user',
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',
  cliScript: process.env.LARK_CLI_SCRIPT || timCli(),
  cacheTtlMs: 15000,

  /* Base "Lịch làm việc MKT", dựng 23/09/2026 bằng thiet-lap/tao-base.js. */
  baseToken: process.env.LARK_BASE_TOKEN || 'VTqxbgjx1a5ZIMsyMQGlLjtQg6c',
  larkUrl: 'https://rootytrip2.sg.larksuite.com/base/VTqxbgjx1a5ZIMsyMQGlLjtQg6c',

  dangKyTableId: process.env.LARK_TB_DANG_KY || 'tblad6snuvuCzh8y',
  nhanSuTableId: process.env.LARK_TB_NHAN_SU || 'tblskRVfDIva6zOO',
  ngayLeTableId: process.env.LARK_TB_NGAY_LE || 'tblBjsVdlOyRZup6',
  /* Kỳ đăng ký (ngày/giờ mở, đóng, bắt buộc) — để trên Base chứ không để file:
   * ổ đĩa Render là ổ tạm, quản lý chỉnh xong deploy một lần là mất. */
  cauHinhTableId: process.env.LARK_TB_CAU_HINH || 'tbl5fTk4rFFzBRr8',

  /* Sheet LLV của HCNS — chỉ để in đường dẫn cho người chép, app không ghi vào. */
  hcnsUrl: 'https://rootytrip2.sg.larksuite.com/wiki/K3H2w9JQli3rwAkKPUYlXKlhgHb',

  /* Tháng đầu tiên app đòi đăng ký. Không có mốc này thì hôm dựng xong (23/09)
   * cả phòng bị nhắc đăng ký bù tháng 9 đang chạy dở. */
  batDauNhac: process.env.LLV_BAT_DAU || '2026-10',

  fields: {
    dangKy: {
      ma:        { id: 'fldhJuoLKH', name: 'Mã phiếu' },
      thang:     { id: 'fldBq3V0lR', name: 'Tháng' },
      maNV:      { id: 'fldXj1VIjA', name: 'Mã NV' },
      hoTen:     { id: 'fldBFvVDvF', name: 'Họ tên' },
      chucVu:    { id: 'fldXciTQ3W', name: 'Chức vụ' },
      nguoi:     { id: 'fldbf6ebmP', name: 'Người' },
      email:     { id: 'fldqyPRTfj', name: 'Email' },
      trangThai: { id: 'fldCku9Cm8', name: 'Trạng thái' },
      congChuan: { id: 'fldVYl3RsV', name: 'Công chuẩn' },
      tongCong:  { id: 'fldImia0dY', name: 'Tổng công' },
      nghi:      { id: 'fldAbYv3Pp', name: 'Ngày nghỉ' },
      nopLuc:    { id: 'fldQ0Kmm1F', name: 'Nộp lúc' },
      suaLuc:    { id: 'fldwWZUJsv', name: 'Sửa lúc' },
      chuyenLuc: { id: 'fldQbsXOG2', name: 'Chuyển HCNS lúc' },
      suaSau:    { id: 'fldJcZxKJk', name: 'Sửa sau khi chuyển' },
      ghiChu:    { id: 'fldzJqqBft', name: 'Ghi chú' },
    },
    ngay: Object.fromEntries(Object.entries(NGAY).map(([d, id]) =>
      [d, { id, name: 'Ngày ' + p2(d) }])),
    nhanSu: {
      hoTen:  { id: 'fldXB3L6rD', name: 'Họ tên' },
      maNV:   { id: 'fldd4eNeYu', name: 'Mã NV' },
      chucVu: { id: 'fldyVouj3W', name: 'Chức vụ' },
      thuTu:  { id: 'fld4NVI32k', name: 'Thứ tự' },
      dangLam:{ id: 'fldKzQANCU', name: 'Đang làm' },
      nguoi:  { id: 'fldpH3rJTN', name: 'Người' },
      email:  { id: 'fldh0leenl', name: 'Email' },
    },
    ngayLe: {
      ten:  { id: 'fldV1v4iLA', name: 'Tên ngày lễ' },
      ngay: { id: 'fldXVEzPwG', name: 'Ngày' },
    },
    cauHinh: {
      khoa:   { id: 'fldHPFsc1a', name: 'Khoá' },
      giaTri: { id: 'fldv9qm4eH', name: 'Giá trị' },
    },
  },

  chon: {
    trangThai: { nhap: 'Nháp', daNop: 'Đã nộp', daChuyen: 'Đã chuyển HCNS' },
  },
};
