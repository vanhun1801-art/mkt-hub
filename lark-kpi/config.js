'use strict';
/**
 * Cấu hình app Báo cáo & KPI.
 *
 * Base "KPI Marketing" do app này tự tạo (10/09/2026). Mọi ID table/field dưới
 * đây lấy từ +table-list / +field-list THẬT, không đoán — và đọc/ghi bằng field
 * ID chứ không bằng tên cột, để đổi tên cột trên Base không làm app vỡ.
 *
 * VÌ SAO PHẢI CÓ BASE
 * Điểm KPI trước nay nằm ở hai tệp JSON trong `du-lieu/`. Thư mục đó cố ý không
 * lên GitHub (gắn với lương từng người, repo thì công khai), mà ổ đĩa Render lại
 * là ổ TẠM — mất sau mỗi lần deploy. Nên trên server chung nửa KPI luôn trống, và
 * có nhập tay vào cũng bay sau lần deploy sau. Base là chỗ duy nhất số sống được
 * mà vẫn không lọt lên GitHub.
 *
 * HAI BẢNG, đúng theo hai tệp cũ — giữ nguyên nguyên tắc "bản gốc không bao giờ
 * bị ghi đè":
 *   Tháng — bản gốc : số nhập từ Excel, chỉ đọc
 *   Tháng — đã sửa  : mọi thứ sửa trên app, đè lên bản gốc khi đọc
 * Đổ nhầm thì xoá bản ghi ở bảng "đã sửa" là quay lại số gốc.
 */
const path = require('path');

const npmRoot = process.env.LARK_NPM_ROOT
  || path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData/Roaming'),
    'npm/node_modules');

/* Bỏ TRỐNG biến này thì app quay về đọc hai tệp JSON trong du-lieu/ — máy nào
 * không nối được Lark vẫn chạy và soạn được bộ luật. */
const BASE_TOKEN = process.env.KPI_BASE_TOKEN || 'E2nYbb69OaJxdVs0nGGlHTy5g0f';

module.exports = {
  port: Number(process.env.PORT || 5179),
  identity: process.env.LARK_IDENTITY || 'user',

  /* cli: dùng phiên lark-cli của máy · api: gọi Open API bằng app credentials
     (khi deploy chung — trên đó không có lark-cli của ai cả). */
  mode: process.env.LARK_MODE
    || ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',

  // Gọi thẳng script Node của lark-cli — launcher .cmd trên Windows hay hỏng
  cliScript: process.env.LARK_CLI_SCRIPT
    || path.join(npmRoot, '@larksuite/cli/scripts/run.js'),

  baseToken: BASE_TOKEN,
  baseUrl: 'https://rootytrip2.sg.larksuite.com/base/' + BASE_TOKEN,
  /* Tắt hẳn đường Base (chạy thuần tệp) bằng KPI_BASE_TOKEN= rỗng. */
  dungBase: !!BASE_TOKEN,

  bang: {
    goc: {
      id: 'tblDJLNyDWINb0yM',
      ten: 'Tháng — bản gốc',
      f: {
        thang: 'fldbLXYCFs',          // Tháng (text) — khoá
        luat: 'fld6CYg6xJ',           // Bộ luật (JSON)
        soLieu: 'fldAT53JxN',         // Số liệu (JSON)
        chamTay: 'fld4RNPjVg',        // Chấm tay (JSON)
        daTraLuong: 'fldJcCz1Ka',     // Đã trả lương (JSON)
        boQuaKhiNhap: 'fldQPoEHnb',   // Bỏ qua khi nhập (JSON)
        canhBaoNhap: 'fld079zA4W',    // Cảnh báo nhập (JSON)
      },
    },
    sua: {
      id: 'tblHBolhcwm21ctw',
      ten: 'Tháng — đã sửa',
      f: {
        thang: 'fldJ69c5YG',          // Tháng (text) — khoá
        luat: 'fldM19pPyc',           // Bộ luật (JSON)
        soLieu: 'fldVw5s0q8',         // Số liệu (JSON)
        chamTay: 'fldvrbIcf6',        // Chấm tay (JSON)
        ghiChuCham: 'fldUKyMiiV',     // Ghi chú chấm (JSON)
        chot: 'fldn4ligU8',           // Chốt (JSON)
        nhatKySo: 'fldJP97x3G',       // Nhật ký số (JSON)
      },
    },
  },
};
