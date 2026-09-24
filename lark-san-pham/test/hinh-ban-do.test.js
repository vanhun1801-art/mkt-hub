/**
 * Hình bản đồ: tải lên xong thì bản đồ phải có hình mới NGAY — kể cả khi đọc ngược
 * tệp từ Lark hỏng (chế độ api trên Render, 26/09: "tải hình lên mà bản đồ không đổi").
 *
 * Chạy với một lớp Lark GIẢ (không đụng Base thật): ghi nhận bản ghi trong bộ nhớ,
 * tải lên nhận mọi tệp, tải về luôn ném lỗi.
 */
const path = require('path');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const cfg = require('../config');
const F = cfg.f.hinh;
const bang = [];
let soTep = 0;
const larkGia = {
  listAllRecords: async () => bang.map((r) => ({ record_id: r.id, cells: Object.assign({}, r.cells) })),
  createRecord: async (f) => { bang.push({ id: 'rec' + (bang.length + 1), cells: Object.assign({}, f) }); },
  updateRecord: async (id, f) => { Object.assign(bang.find((r) => r.id === id).cells, f); },
  deleteRecords: async (ids) => { for (const id of ids) bang.splice(bang.findIndex((r) => r.id === id), 1); },
  uploadAttachment: async (id, truong) => { bang.find((r) => r.id === id).cells[truong] = [{ file_token: 'tep' + (++soTep), name: 'x.webp' }]; },
  downloadAttachmentBuffer: async () => { throw new Error('giả lập: Lark từ chối tải'); },
};
/* thay lớp Lark trước khi nạp module */
for (const f of ['lark.js', 'larkapi.js']) {
  const p = require.resolve(path.join(__dirname, '..', f));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: larkGia };
}
const hbd = require('../hinh-ban-do');

/* WebP 1×1 hợp lệ */
const WEBP = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

(async () => {
  console.log('— tải lên khi đọc ngược từ Lark hỏng');
  await hbd.ghiHinh({ ma: 'sunset-town', anh: WEBP, w: 512, h: 435 }, 'Thử');
  const js = await hbd.hinhRiengJs();
  const o = JSON.parse(js.slice(js.indexOf('{'), js.lastIndexOf('}') + 1));
  t('bản đồ có hình mới của sunset-town ngay sau khi tải', o['sunset-town'] && o['sunset-town'].url === WEBP);
  t('khung 512x435 đi theo hình', o['sunset-town'] && o['sunset-town'].w === 512 && o['sunset-town'].h === 435);

  console.log('— máy chủ khởi động lại (mất bộ nhớ) mà Lark vẫn không cho tải');
  delete require.cache[require.resolve('../hinh-ban-do')];
  const hbd2 = require('../hinh-ban-do');
  const ds = await hbd2.danhSach();
  const st = ds.find((x) => x.ma === 'sunset-town');
  t('ô hình báo rõ lý do (không im lặng)', st && /Lark từ chối/.test(st.loi), st && st.loi);
  const js2 = await hbd2.hinhRiengJs();
  t('bản đồ vẫn dựng được (dùng hình dựng sẵn), không vỡ', js2.includes('PQ_HINH_RIENG'));

  console.log('— không giữ đệm bản thiếu hình: lần sau đọc được là có ngay');
  larkGia.downloadAttachmentBuffer = async () => ({ buffer: Buffer.from(WEBP.split(',')[1], 'base64') });
  const js3 = await hbd2.hinhRiengJs();
  const o3 = JSON.parse(js3.slice(js3.indexOf('{'), js3.lastIndexOf('}') + 1));
  t('Lark cho tải lại → bản đồ có hình Base', o3['sunset-town'] && o3['sunset-town'].url === WEBP);

  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL chạy thử  → ' + e.stack); console.log('\n' + pass + ' pass · ' + (fail + 1) + ' fail'); process.exit(1); });
