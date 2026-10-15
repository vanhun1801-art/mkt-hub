'use strict';
/**
 * Thêm lựa chọn "Tăng ca" vào ô Ca của bảng Phiếu báo cáo (15/10/2026).
 * Anh Hùng chốt phiếu tăng ca riêng (xem kho.js, chỗ DUOI_TC); Base từ chối giá
 * trị chọn lạ nên phải có lựa chọn này trước khi bản mới chạy.
 *
 * +field-update là PUT cả ô, không phải vá: đọc ô hiện tại rồi gửi lại ĐỦ các
 * lựa chọn cũ (giữ màu) cộng thêm lựa chọn mới. Không xoá, không đổi tên gì.
 * Chạy thử: node thiet-lap/nang-cap-tang-ca.js · thật: thêm --that
 */
const cfg = require('../config');
const lark = require('../lark');
const THAT = process.argv.includes('--that');
const cli = (a) => lark.cli(['base', ...a, '--as', 'user', '--base-token', cfg.baseToken, '--format', 'json'], { retries: 1 });
const MOI = cfg.chon.ca.tangCa;

(async () => {
  const ten = (f) => f.field_name || f.name;
  const ca = ((await cli(['+field-list', '--table-id', cfg.phieuTableId])).fields || []).find((f) => ten(f) === 'Ca');
  if (!ca) throw new Error('không thấy ô Ca');
  const cu = (ca.options || []).map((o) => o.name);
  console.log('  ô Ca đang có: ' + cu.join(' · '));
  if (cu.includes(MOI)) return console.log('  đã có "' + MOI + '", không cần làm gì');
  const def = { name: 'Ca', type: 'select', multiple: false,
    options: (ca.options || []).concat([{ name: MOI, hue: 'Purple', lightness: 'Lighter' }]) };
  console.log((THAT ? '  → ' : '  (thử) ') + 'gửi: ' + def.options.map((o) => o.name).join(' · '));
  if (!THAT) return;
  await cli(['+field-update', '--table-id', cfg.phieuTableId, '--field-id', ca.id || ca.field_id, '--json', JSON.stringify(def), '--yes']);
  const sau = ((await cli(['+field-list', '--table-id', cfg.phieuTableId])).fields || []).find((f) => ten(f) === 'Ca');
  console.log('  sau khi sửa: ' + (sau.options || []).map((o) => o.name).join(' · '));
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
