'use strict';
/**
 * Cấu hình app "Hộp thư".
 *
 * Bí mật (ANTHROPIC_API_KEY) nằm ở lark-hop-thu/.env trên máy và ở biến môi
 * trường của Render, KHÔNG BAO GIỜ ở git (.gitignore đã chặn mọi *.env).
 * Thiếu khoá thì app vẫn chạy: luật xếp ngăn, đọc, trả lời, giao việc đều
 * không cần AI; chỉ phần tóm tắt và viết nháp tắt đi.
 */
const fs = require('fs');
const path = require('path');

/* Cùng bộ nạp .env với các app khác: không dùng dotenv (cả hệ không có
 * dependency npm), và biến đã có trong môi trường thì file KHÔNG ghi đè. */
(function napEnv() {
  for (const f of [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')]) {
    let raw;
    try { raw = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    raw.split('\n').forEach((dong) => {
      const d = dong.trim();
      if (!d || d[0] === '#') return;
      const i = d.indexOf('=');
      if (i < 1) return;
      const k = d.slice(0, i).trim();
      let v = d.slice(i + 1).trim();
      if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) v = v.slice(1, -1);
      if (process.env[k] === undefined) process.env[k] = v;
    });
  }
})();

const npmRoot = process.env.LARK_NPM_ROOT ||
  path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData/Roaming'), 'npm/node_modules');

const dsEmail = (s) => String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

module.exports = {
  port: Number(process.env.PORT || 5204),
  cliScript: process.env.LARK_CLI_SCRIPT ||
    path.join(npmRoot, '@larksuite/cli/scripts/run.js'),

  /* Bản chạy chung đọc thư qua OpenAPI bằng token từng người (mail-api.js). */
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',

  /* Thư mục dữ liệu chạy (bộ đệm tóm tắt AI, luật tự đặt, hẹn nhắc). Có nội
   * dung thư nên đã gitignore, giống du-lieu/ của KPI và KOL. */
  duLieu: process.env.HOP_THU_DU_LIEU || path.join(__dirname, 'du-lieu'),

  /* Số thư đọc mỗi hộp mỗi lần. Hộp chính anh Hùng ~5 thư/tuần, 60 là hơn
   * hai tháng; hộp chung nhiều hơn nhưng thư cũ quá thì đã xử lý rồi. */
  soThuMoiHop: Number(process.env.HOP_THU_SO_THU || 60),
  /* Thư mục Đã gửi chỉ cần đủ để biết thư nào đã trả lời, thư nào đang chờ. */
  soThuGuiMoiHop: Number(process.env.HOP_THU_SO_THU_GUI || 30),
  /* Nhịp đọc sau (server.js, docSau): đủ sâu để hộp đông như sales@ cũng phủ
   * được khoảng một tháng. */
  soThuDu: Number(process.env.HOP_THU_SO_THU_DU || 200),
  soThuGuiDu: Number(process.env.HOP_THU_SO_THU_GUI_DU || 60),
  /* Thư mục Thư rác: Lark đẩy cả thư khách hỏi báo giá vào đây (sales@ có 64
   * thư rác trong hai tuần, trong đó có thư khách thật, 29/10/2026). Đọc thư
   * rác trong ngần ấy ngày gần nhất, tối đa ngần ấy thư mỗi hộp. */
  ngayRac: Number(process.env.HOP_THU_NGAY_RAC || 14),
  soThuRac: Number(process.env.HOP_THU_SO_THU_RAC || 40),

  /* Ban giám đốc: thư từ những địa chỉ này vào "Cần trả lời" kèm nhãn "Ban giám đốc". Khai bằng env
   * để đổi người không phải sửa mã. */
  sep: dsEmail(process.env.HOP_THU_SEP || 'ceo@rootytrip.com,deputy.ceo@rootytrip.com'),

  /* Địa chỉ cũng là của chính người dùng ngoài hộp chính (anh Hùng gửi đề
   * xuất bằng cmo@). Thư từ đây là bản mình tự gửi, không phải việc cần làm. */
  cuaMinh: dsEmail(process.env.HOP_THU_CUA_MINH || 'cmo@rootytrip.com'),

  ai: {
    key: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.HOP_THU_MODEL || 'claude-opus-5-5',
    url: process.env.ANTHROPIC_BASE_URL
      ? process.env.ANTHROPIC_BASE_URL.replace(/\/$/, '') + '/v1/messages'
      : 'https://api.anthropic.com/v1/messages',
  },
};
