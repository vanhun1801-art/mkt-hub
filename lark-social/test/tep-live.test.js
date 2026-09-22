'use strict';
/* Test thuần Node, không framework, không mạng: `node test/tep-live.test.js`.
 *
 * Đường THẢ TỆP của tab LIVE. Dựng một tệp .xlsx thật bằng bộ ghi dùng chung
 * rồi đọc lại bằng bộ đọc dùng chung — nếu hai bên lệch nhau thì phép thử này
 * gãy ngay, chứ không đợi đến lúc anh Hùng thả bản xuất thật vào và thấy bảng
 * trống mà không có lỗi nào. */
const assert = require('assert');
const { ghiXlsx } = require('../../lark-chung/xlsx-ghi');
const { docBang } = require('../../lark-chung/xlsx-doc');
const { docBangDan, docBangObj, COT_LIVE } = require('../bang-dan');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

const COT = ['Thời gian bắt đầu', 'Thời lượng', 'Lượt xem', 'Người xem cao nhất',
  'Bình luận', 'Người theo dõi mới', 'Tiêu đề'];

function tepMau(hang) {
  return ghiXlsx({
    ten: 'LIVE',
    cot: COT.map((x) => ({ ten: x, rong: 18 })),
    hang,
  });
}

console.log('\nđọc tệp .xlsx');

t('dựng .xlsx rồi đọc lại ra đúng số của từng cột', () => {
  const buf = tepMau([['2026-09-19 20:00', 118, 2450, 63, 210, 17, 'LIVE tour Nam đảo']]);
  const { rows } = docBang(buf, { tenCot: Object.keys(COT_LIVE) });
  const ds = docBangObj(rows);
  assert.strictEqual(ds.length, 1);
  assert.strictEqual(ds[0].views, 2450);
  assert.strictEqual(ds[0].peak, 63);
  assert.strictEqual(ds[0].comments, 210);
  assert.strictEqual(ds[0].newFollows, 17);
  assert.strictEqual(ds[0].minutes, 118);
  assert.strictEqual(ds[0].title, 'LIVE tour Nam đảo');
  assert.ok(ds[0].start.startsWith('2026-09-19'));
});

t('nhiều phiên trong một tệp thì ra nhiều dòng', () => {
  const buf = tepMau([
    ['2026-09-18 20:00', 90, 1200, 40, 88, 9, 'Tối thứ Năm'],
    ['2026-09-19 20:00', 118, 2450, 63, 210, 17, 'Tối thứ Sáu'],
  ]);
  const ds = docBangObj(docBang(buf, { tenCot: Object.keys(COT_LIVE) }).rows);
  assert.strictEqual(ds.length, 2);
  assert.strictEqual(ds[0].views + ds[1].views, 3650);
});

t('cột lạ bị bỏ qua, cột quen vẫn đọc được', () => {
  const buf = ghiXlsx({
    ten: 'LIVE',
    cot: [{ ten: 'Mã phiên' }, { ten: 'Thời gian bắt đầu' }, { ten: 'Lượt xem' }, { ten: 'Kim cương' }],
    hang: [['X1', '2026-09-19 20:00', 2450, 999]],
  });
  const ds = docBangObj(docBang(buf, { tenCot: Object.keys(COT_LIVE) }).rows);
  assert.strictEqual(ds[0].views, 2450);
  assert.strictEqual(ds[0].peak, undefined);
});

t('tệp không có cột nào quen thì báo rõ, kèm tên cột thật của tệp', () => {
  assert.throws(
    () => docBangObj([{ 'Kim cương': 1, 'Hạng tuần': 2 }]),
    (e) => /Không nhận ra cột nào/.test(e.message) && /Kim cương/.test(e.message),
  );
});

t('tệp rỗng thì báo rỗng, không trả mảng trống im lặng', () => {
  assert.throws(() => docBangObj([]), /không có dòng số liệu/);
});

console.log('\nđường dán và đường thả tệp phải hiểu giống nhau');

t('cùng một bảng, dán hay thả tệp đều ra cùng con số', () => {
  const buf = tepMau([['2026-09-19 20:00', 118, 2450, 63, 210, 17, 'Tối thứ Sáu']]);
  const tuTep = docBangObj(docBang(buf, { tenCot: Object.keys(COT_LIVE) }).rows);
  const tuDan = docBangDan(COT.join('\t') + '\n'
    + ['2026-09-19 20:00', '118', '2.450', '63', '210', '17', 'Tối thứ Sáu'].join('\t'));
  assert.deepStrictEqual(tuTep[0], tuDan[0]);
});

console.log('\nCSV');

t('BOM của Excel không làm hỏng cột đầu — trim() của JS nuốt luôn U+FEFF', () => {
  const than = 'Thời gian bắt đầu,Lượt xem\n2026-09-19 20:00,2450';
  const bom = String.fromCharCode(0xfeff);
  /* Đã định viết phép thử này để chứng minh BOM nuốt mất cột đầu tiên, nhưng
   * chạy thử thì không phải: U+FEFF nằm trong tập ký tự trắng của String.trim(),
   * mà tach() đã trim từng ô. Giữ lại phép thử để lần sau khỏi ai đi điều tra
   * lại — và để biết đoạn bỏ BOM trong docTepLive() là lớp phòng hờ, không
   * phải thứ đang gánh việc. Đừng bỏ nó đi, nhưng cũng đừng tin nó là đủ. */
  assert.deepStrictEqual(docBangDan(bom + than)[0], docBangDan(than)[0]);
  assert.strictEqual(docBangDan(bom + than)[0].start, '2026-09-19 20:00');
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
