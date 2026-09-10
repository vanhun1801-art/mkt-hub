'use strict';
/**
 * Đưa hai tệp JSON trong `du-lieu/` lên Base "KPI Marketing". CHẠY TAY MỘT LẦN.
 *
 *   node cong-cu/len-base.js          — xem trước, không ghi gì
 *   node cong-cu/len-base.js --ghi    — ghi thật
 *
 * Từ chối chạy khi Base đã có dòng: chạy hai lần là mỗi tháng hai bản ghi, mà
 * `store.js` lấy bản đọc sau cùng — tức là số của tháng đó tuỳ thứ tự trả về.
 * Muốn nhập lại thì xoá sạch hai bảng trên Base trước.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const lark = require('../lark');
const store = require('../store');

const THU_MUC = path.join(__dirname, '..', 'du-lieu');
const doc = (f, md) => {
  try { return JSON.parse(fs.readFileSync(path.join(THU_MUC, f), 'utf8')); } catch (_) { return md; }
};

(async () => {
  const ghi = process.argv.includes('--ghi');
  if (!cfg.dungBase) { console.error('KPI_BASE_TOKEN đang trống — không có Base để nhập lên.'); process.exit(1); }

  const goc = doc('lich-su-2026.json', { thang: {} });
  const sua = doc('sua-tay.json', { thang: {} });
  const nGoc = Object.keys(goc.thang || {}).length;
  const nSua = Object.keys(sua.thang || {}).length;
  console.log('Tệp trên máy : ' + nGoc + ' tháng bản gốc · ' + nSua + ' tháng đã sửa');
  if (!nGoc) { console.error('Không có tháng nào để nhập.'); process.exit(1); }

  const coGoc = await lark.listAll(cfg.bang.goc.id);
  const coSua = await lark.listAll(cfg.bang.sua.id);
  console.log('Base hiện có : ' + coGoc.length + ' dòng bản gốc · ' + coSua.length + ' dòng đã sửa');
  if (coGoc.length || coSua.length) {
    console.error('\nBase ĐÃ CÓ dòng. Nhập chồng lên là mỗi tháng hai bản ghi và số của');
    console.error('tháng đó tuỳ thứ tự Base trả về. Xoá sạch hai bảng rồi chạy lại:');
    console.error('  ' + cfg.baseUrl);
    process.exit(1);
  }

  if (!ghi) {
    console.log('\nXem trước — chưa ghi gì. Cỡ từng tháng:');
    Object.entries(goc.thang).forEach(([th, t]) => {
      console.log('  ' + th + '  ' + JSON.stringify(t).length + ' ký tự');
    });
    console.log('\nChạy lại với --ghi để nhập thật.');
    return;
  }

  const kq = await store.nhapLenBase(goc, sua);
  console.log('\nĐã ghi: ' + kq.goc + ' dòng bản gốc · ' + kq.sua + ' dòng đã sửa');

  /* Đọc lại từ Base và so với tệp — nhập xong mà không đối chiếu thì không biết
   * có tháng nào rơi mất hay JSON nào bị cắt cụt. */
  const r = await store.nap();
  console.log('Đọc lại từ Base: ' + r.thang + ' tháng');
  let lech = 0;
  Object.keys(goc.thang).forEach((th) => {
    const t = store.thang(th);
    if (!t) { console.error('  THIẾU ' + th); lech += 1; return; }
    const a = JSON.stringify(goc.thang[th].luat);
    const b = JSON.stringify(t.daSuaLuat ? t.luatGoc : t.luat);
    if (a !== b) { console.error('  LỆCH bộ luật ' + th); lech += 1; }
    const sa = Object.keys(goc.thang[th].soLieu || {}).length;
    const sb = Object.keys(t.soLieu || {}).length;
    if (sb < sa) { console.error('  THIẾU số liệu ' + th + ': ' + sb + '/' + sa); lech += 1; }
  });
  console.log(lech ? '\n⚠ ' + lech + ' chỗ lệch — xem lại trước khi tin.' : '\n✓ Đối chiếu khớp hết.');
})().catch((e) => { console.error('LỖI: ' + e.message); process.exit(1); });
