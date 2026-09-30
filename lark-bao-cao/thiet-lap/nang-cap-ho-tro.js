'use strict';
/**
 * Thêm 4 cột theo dõi XỬ LÝ vướng mắc vào bảng Phiếu báo cáo (30/09/2026).
 * Anh Hùng: "tab cần hỗ trợ thì note giúp anh luôn là đã xử lý hay chưa".
 * Chỉ THÊM cột. Chạy thử: node thiet-lap/nang-cap-ho-tro.js · thật: thêm --that
 */
const cfg = require('../config');
const lark = require('../lark');
const THAT = process.argv.includes('--that');
const cli = (a) => lark.cli(['base', ...a, '--as', 'user', '--base-token', cfg.baseToken, '--format', 'json'], { retries: 1 });
const COT = [
  { type: 'checkbox', name: 'Hỗ trợ đã xử lý' },
  { type: 'text', name: 'Hỗ trợ ghi chú', description: 'Quản lý ghi đã xử lý thế nào.' },
  { type: 'text', name: 'Hỗ trợ xử lý bởi' },
  { type: 'datetime', name: 'Hỗ trợ xử lý lúc' },
  /* Lần 2 (30/09): thêm trạng thái "Chưa xử lý được" và mốc đã nhắn cho nhân sự —
   * anh Hùng: "gửi cho nhân sự biết khi vấn đề đã được xử lý hoặc chưa xử lý được". */
  { type: 'select', name: 'Hỗ trợ trạng thái', options: [
    { name: 'Chưa xử lý' }, { name: 'Đã xử lý' }, { name: 'Chưa xử lý được' }] },
  { type: 'datetime', name: 'Hỗ trợ đã báo lúc', description: 'Lúc bot nhắn phản hồi cho người nêu vướng mắc.' },
];
(async () => {
  const ten = (f) => f.field_name || f.name;
  const co = ((await cli(['+field-list', '--table-id', cfg.phieuTableId])).fields || []).map(ten);
  for (const c of COT) {
    if (co.includes(c.name)) { console.log('  đã có ' + c.name); continue; }
    console.log((THAT ? '  → ' : '  (thử) ') + 'thêm cột ' + c.name);
    if (THAT) await cli(['+field-create', '--table-id', cfg.phieuTableId, '--json', JSON.stringify(c)]);
  }
  if (THAT) {
    for (const f of (await cli(['+field-list', '--table-id', cfg.phieuTableId])).fields || []) {
      if (/^Hỗ trợ /.test(ten(f))) console.log('    ' + (f.field_id || f.id) + '  ' + ten(f));
    }
  }
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
