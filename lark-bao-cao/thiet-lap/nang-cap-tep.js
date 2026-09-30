'use strict';
/**
 * Thêm cột "Tệp đính kèm" (attachment) vào bảng Phiếu báo cáo (30/09/2026).
 * Anh Hùng: báo cáo tháng "bổ sung giúp anh cho nhân sự tải tệp lên".
 * Chỉ THÊM cột. Chạy thử: node thiet-lap/nang-cap-tep.js · thật: thêm --that
 */
const cfg = require('../config');
const lark = require('../lark');
const THAT = process.argv.includes('--that');
const cli = (a) => lark.cli(['base', ...a, '--as', 'user', '--base-token', cfg.baseToken, '--format', 'json'], { retries: 1 });
(async () => {
  const ten = (f) => f.field_name || f.name;
  const ds = (await cli(['+field-list', '--table-id', cfg.phieuTableId])).fields || [];
  const co = ds.find((f) => ten(f) === 'Tệp đính kèm');
  if (co) { console.log('  đã có Tệp đính kèm = ' + (co.field_id || co.id)); return; }
  console.log((THAT ? '  → ' : '  (thử) ') + 'thêm cột Tệp đính kèm');
  if (!THAT) return;
  await cli(['+field-create', '--table-id', cfg.phieuTableId, '--json', JSON.stringify({
    type: 'attachment', name: 'Tệp đính kèm', description: 'Tệp nhân sự tải lên kèm báo cáo tháng (PDF, Excel, slide, ảnh…).' })]);
  const f = ((await cli(['+field-list', '--table-id', cfg.phieuTableId])).fields || []).find((x) => ten(x) === 'Tệp đính kèm');
  console.log('    ' + (f && (f.field_id || f.id)) + '  Tệp đính kèm');
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
