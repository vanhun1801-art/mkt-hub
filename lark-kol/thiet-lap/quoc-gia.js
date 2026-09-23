'use strict';
/**
 * Cột "Quốc gia" (bảng KOL) phải có ĐỦ tên nước của public/ma-vung.js — Base KHÔNG tự thêm
 * lựa chọn khi ghi giá trị lạ (lỗi 800030005), nên form chọn Indonesia mà cột không có là lưu hỏng.
 * Giữ mọi lựa chọn cũ (kể cả tên cũ không còn trong danh sách) để không mất giá trị của bản ghi nào.
 *   node thiet-lap/quoc-gia.js [--that]
 */
const cfg = require('../config');
const lark = require('../lark');
const MV = require('../public/ma-vung');

(async () => {
  const fl = await lark.listFields(cfg.bang.kol);
  const f = fl.find((x) => (x.name || x.field_name) === 'Quốc gia');
  const g = await lark.cli(['base', '+field-get', '--as', 'user', '--base-token', cfg.baseToken, '--table-id', cfg.bang.kol, '--field-id', f.id || f.field_id, '--format', 'json']);
  const cu = (g.field && g.field.options) || [];
  const co = new Set(cu.map((o) => o.name));
  const them = [...MV.DS.map((x) => x.ten), 'Khác'].filter((t) => !co.has(t));
  console.log('có ' + cu.length + ' lựa chọn, thêm ' + them.length);
  if (!process.argv.includes('--that') || !them.length) return;
  await lark.cli(['base', '+field-update', '--as', 'user', '--base-token', cfg.baseToken, '--table-id', cfg.bang.kol, '--field-id', f.id || f.field_id, '--yes',
    '--json', JSON.stringify({ type: 'select', name: 'Quốc gia', multiple: false, options: [...cu.map((o) => ({ name: o.name, hue: o.hue, lightness: o.lightness })), ...them.map((name) => ({ name }))] })]);
  console.log('đã cập nhật');
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
