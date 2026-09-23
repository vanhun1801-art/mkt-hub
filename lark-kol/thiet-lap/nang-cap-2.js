'use strict';
/**
 * Nâng cấp Base KOL lần 2 (23/09/2026):
 *   - "Xin FOC" → "Hợp tác FOC", lựa chọn viết lại cho chuyên nghiệp (anh Hùng: không
 *     dùng chữ "xin", đây là đề xuất hợp tác). Giá trị cũ được chuyển sang tên mới.
 *   - "Xin FOC lúc" → "Gửi đề xuất FOC lúc"
 *   - Hạng mục: "Tourwell ID" (sp:<id> / ncc:<id>:<dịch vụ>) — dòng lấy từ danh mục Tourwell
 *   - Hợp tác: "Chốt bảng kê lúc" — chốt xong mới trình BGĐ
 *   - Đối tác: "Loại dịch vụ", "Mã Tourwell" — nhập danh sách nhà cung cấp từ Tourwell
 *
 * Chạy lại được.  node thiet-lap/nang-cap-2.js [--that]
 */
const cfg = require('../config');
const lark = require('../lark');

const THAT = process.argv.includes('--that');
const B = cfg.baseToken;
const GIO = { style: { format: 'yyyy-MM-dd HH:mm' } };
const DOI_FOC = { 'Không xin': 'Không áp dụng', 'Chưa xin': 'Chưa đề xuất', 'Đang xin': 'Đã gửi đề xuất', 'Đồng ý': 'Đối tác đồng ý', 'Từ chối': 'Đối tác từ chối' };
const MAU = { 'Không áp dụng': 'Gray', 'Chưa đề xuất': 'Orange', 'Đã gửi đề xuất': 'Yellow', 'Đối tác đồng ý': 'Green', 'Đối tác từ chối': 'Red' };
const moiFoc = Object.values(DOI_FOC).map((name) => ({ name, hue: MAU[name] }));

const cli = (a) => lark.cli(['base', ...a, '--as', 'user', '--base-token', B]);

async function cot(tid) { return (await lark.listFields(tid)).map((f) => ({ id: f.id || f.field_id, name: f.name || f.field_name })); }

(async () => {
  const log = (s) => console.log((THAT ? '  ' : '  [thử] ') + s);

  /* 1. Hợp tác FOC */
  const hm = await cot(cfg.bang.hangMuc);
  const cu = hm.find((f) => f.name === 'Xin FOC');
  const moi = hm.find((f) => f.name === 'Hợp tác FOC');
  if (cu && !moi) {
    log('đổi cột "Xin FOC" → "Hợp tác FOC" (giữ lựa chọn cũ tạm thời)');
    if (THAT) {
      await cli(['+field-update', '--table-id', cfg.bang.hangMuc, '--field-id', cu.id, '--yes', '--json', JSON.stringify({
        type: 'select', name: 'Hợp tác FOC', multiple: false, options: [...moiFoc, ...Object.keys(DOI_FOC).map((name) => ({ name, hue: 'Gray' }))] })]);
      const ds = await lark.listAllRecords(cfg.bang.hangMuc);
      const sua = {};
      for (const r of ds) { const v = [].concat(r.cells[cu.id] || [])[0]; if (DOI_FOC[v]) sua[r.record_id] = { 'Hợp tác FOC': DOI_FOC[v] }; }
      log('chuyển ' + Object.keys(sua).length + ' dòng sang tên mới');
      if (Object.keys(sua).length) await lark.updateMany(sua, cfg.bang.hangMuc);
      await cli(['+field-update', '--table-id', cfg.bang.hangMuc, '--field-id', cu.id, '--yes', '--json', JSON.stringify({
        type: 'select', name: 'Hợp tác FOC', multiple: false, options: moiFoc })]);
    }
  } else log('cột "Hợp tác FOC" đã có');

  const luc = hm.find((f) => f.name === 'Xin FOC lúc');
  if (luc) {
    log('đổi cột "Xin FOC lúc" → "Gửi đề xuất FOC lúc"');
    if (THAT) await cli(['+field-update', '--table-id', cfg.bang.hangMuc, '--field-id', luc.id, '--yes', '--json', JSON.stringify({ type: 'datetime', name: 'Gửi đề xuất FOC lúc', ...GIO })]);
  }

  /* 2. cột mới */
  const THEM = {
    [cfg.bang.hangMuc]: [{ type: 'text', name: 'Tourwell ID', description: 'sp:<id sản phẩm> hoặc ncc:<id nhà cung cấp>:<id dịch vụ> — dòng lấy từ danh mục Tourwell.' }],
    [cfg.bang.hopTac]: [{ type: 'datetime', name: 'Chốt bảng kê lúc', ...GIO, description: 'Chốt xong mới trình BGĐ. Mở chốt để sửa thì cột này về trống.' }],
    [cfg.bang.doiTac]: [
      { type: 'text', name: 'Loại dịch vụ', description: 'Khách sạn, Nhà hàng, Vé tham quan… (theo Tourwell).' },
      { type: 'text', name: 'Mã Tourwell', description: 'id nhà cung cấp trên Tourwell — để đồng bộ lại không bị trùng.' },
    ],
  };
  for (const [tid, ds] of Object.entries(THEM)) {
    const co = new Set((await cot(tid)).map((f) => f.name));
    for (const f of ds) {
      if (co.has(f.name)) { log('có sẵn ' + f.name); continue; }
      log('thêm ' + f.name);
      if (THAT) await cli(['+field-create', '--table-id', tid, '--json', JSON.stringify(f)]);
    }
  }
  if (!THAT) console.log('\nTHỬ — chưa ghi gì. Thêm --that để làm thật.');
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
