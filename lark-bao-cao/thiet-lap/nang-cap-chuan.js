'use strict';
/**
 * Nâng cấp Base "Báo cáo công việc MKT" cho phần CHUẨN THEO VỊ TRÍ (30/09/2026).
 *
 * Chỉ THÊM, không xoá, không đổi tên gì:
 *   1. Bảng "Thiết lập" (Khoá · Giá trị · Sửa bởi · Sửa lúc) — chuẩn do quản lý
 *      chỉnh trong app lưu ở đây. Không lưu file: ổ Render mất sau mỗi deploy.
 *   2. Cột "Số lượng" ở bảng Dòng việc — 500 ảnh hay 4 bài đăng là MỘT dòng việc,
 *      không có ô này thì không đếm được sản lượng.
 *   3. Thêm lựa chọn cho cột "Nhóm việc": Livestream, Website/SEO, OTA, Chatbot,
 *      Lỗi máy / mất điện. Đọc 184 bảng ảnh chụp cho thấy thiếu mấy nhóm này nên
 *      Hân ghi gì cũng rơi vào "Khác", và thời gian chết của Pinky bị tính là phân
 *      bổ kém.
 *
 * Chạy thử (chỉ in):  node thiet-lap/nang-cap-chuan.js
 * Chạy thật:          node thiet-lap/nang-cap-chuan.js --that
 */
const cfg = require('../config');
const lark = require('../lark');

const THAT = process.argv.includes('--that');
const B = cfg.baseToken;
const NHOM_MOI = ['Livestream', 'Website/SEO', 'OTA', 'Chatbot', 'Lỗi máy / mất điện'];

const cli = (a) => lark.cli(['base', ...a, '--as', 'user', '--base-token', B, '--format', 'json'], { retries: 1 });
const ghi = async (moTa, a) => {
  console.log((THAT ? '  → ' : '  (thử) ') + moTa);
  if (THAT) return cli(a);
  return null;
};

(async () => {
  console.log(THAT ? 'CHẠY THẬT trên Base ' + B : 'CHẠY THỬ — thêm --that để ghi');

  /* 1. bảng Thiết lập */
  const bang = await cli(['+table-list']);
  const ds = bang.tables || bang.items || [];
  let tl = ds.find((t) => (t.name || t.table_name) === 'Thiết lập');
  if (tl) console.log('  đã có bảng Thiết lập = ' + (tl.id || tl.table_id));
  else {
    const r = await ghi('tạo bảng "Thiết lập"', ['+table-create', '--name', 'Thiết lập', '--fields', JSON.stringify([
      { type: 'text', name: 'Khoá', description: 'Tên thiết lập, vd "chuan-vi-tri". Một khoá một dòng.' },
      { type: 'text', name: 'Giá trị', description: 'JSON. Sửa trong app (tab Thiết lập), đừng sửa tay ở đây.' },
      { type: 'text', name: 'Sửa bởi' },
      { type: 'datetime', name: 'Sửa lúc' },
    ])]);
    if (r) console.log('    table_id: ' + (r.table_id || (r.table && r.table.id) || JSON.stringify(r).slice(0, 200)));
  }

  /* 2 + 3. bảng Dòng việc */
  const fl = await cli(['+field-list', '--table-id', cfg.dongTableId]);
  const truong = fl.fields || fl.items || [];
  const ten = (f) => f.field_name || f.name;
  if (truong.some((f) => ten(f) === 'Số lượng')) console.log('  đã có cột Số lượng');
  else {
    await ghi('thêm cột "Số lượng" (Dòng việc)', ['+field-create', '--table-id', cfg.dongTableId, '--json', JSON.stringify({
      type: 'number', name: 'Số lượng',
      description: 'Số sản phẩm của dòng việc: 3 bài đăng, 500 ảnh, 2 kịch bản. Rỗng = 1.',
    })]);
  }

  const nhom = truong.find((f) => (f.field_id || f.id) === cfg.fields.dong.nhom.id);
  if (!nhom) throw new Error('Không thấy cột Nhóm việc ' + cfg.fields.dong.nhom.id);
  const cu = ((nhom.property && nhom.property.options) || nhom.options || []);
  const thieu = NHOM_MOI.filter((n) => !cu.some((o) => o.name === n));
  if (!thieu.length) console.log('  Nhóm việc đã đủ lựa chọn mới');
  else {
    await ghi('thêm lựa chọn Nhóm việc: ' + thieu.join(', '), ['+field-update', '--table-id', cfg.dongTableId,
      '--field-id', cfg.fields.dong.nhom.id, '--yes', '--json', JSON.stringify({
        type: 'select', name: ten(nhom),
        options: cu.map((o) => ({ name: o.name, hue: o.hue, lightness: o.lightness })).concat(thieu.map((name) => ({ name }))),
      })]);
  }

  if (THAT) {
    console.log('\nĐọc lại id thật:');
    const b2 = await cli(['+table-list']);
    const t = (b2.tables || b2.items || []).find((x) => (x.name || x.table_name) === 'Thiết lập');
    if (t) {
      const tid = t.id || t.table_id;
      console.log('  bảng Thiết lập = ' + tid);
      const f2 = await cli(['+field-list', '--table-id', tid]);
      for (const f of (f2.fields || f2.items || [])) console.log('    ' + (f.field_id || f.id) + '  ' + ten(f));
    }
    const f3 = await cli(['+field-list', '--table-id', cfg.dongTableId]);
    const sl = (f3.fields || f3.items || []).find((f) => ten(f) === 'Số lượng');
    if (sl) console.log('  Số lượng = ' + (sl.field_id || sl.id));
  }
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
