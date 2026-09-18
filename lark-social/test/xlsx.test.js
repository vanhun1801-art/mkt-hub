'use strict';
/* Test thuần Node: `node test/xlsx.test.js`. */
const assert = require('assert');
const zlib = require('zlib');
const { taoXlsx, oTen, tenSheet, crc32, dongZip, xEsc } = require('../xlsx');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

console.log('\nxlsx — khung ZIP');

t('tệp bắt đầu bằng chữ ký ZIP và kết bằng end-of-central-directory', () => {
  const b = taoXlsx([{ ten: 'A', hang: [{ o: ['x'] }] }]);
  assert.strictEqual(b.slice(0, 2).toString(), 'PK');
  assert.strictEqual(b.readUInt32LE(b.length - 22), 0x06054b50);
});

t('CRC32 đúng chuẩn', () => {
  /* Sai CRC thì Excel mở lên báo "tệp hỏng" — mà mình không thấy, vì Node vẫn
     ghi ra tệp bình thường. Đối chiếu với zlib để chắc. */
  const buf = Buffer.from('Phú Quốc', 'utf8');
  if (zlib.crc32) assert.strictEqual(crc32(buf), zlib.crc32(buf));
  assert.strictEqual(crc32(Buffer.from('')), 0);
  assert.strictEqual(crc32(Buffer.from('123456789')), 0xcbf43926);
});

t('số tệp trong central directory khớp số tệp thật', () => {
  const b = dongZip([{ ten: 'a.txt', noiDung: 'x' }, { ten: 'b.txt', noiDung: 'y' }]);
  assert.strictEqual(b.readUInt16LE(b.length - 22 + 10), 2);
});

console.log('\nxlsx — tên ô và tên sheet');

t('tên ô đúng cả khi quá 26 cột', () => {
  assert.strictEqual(oTen(0, 1), 'A1');
  assert.strictEqual(oTen(25, 3), 'Z3');
  assert.strictEqual(oTen(26, 1), 'AA1');
  assert.strictEqual(oTen(27, 1), 'AB1');
});

t('tên sheet bỏ ký tự Excel cấm và cắt ở 31 ký tự', () => {
  /* Excel TỪ CHỐI MỞ cả tệp nếu tên sheet chứa : \ / ? * [ ] — và lỗi đó chỉ
     hiện ra ở máy người nhận. */
  const d = new Set();
  assert.strictEqual(tenSheet('VinWonders / Safari', d), 'VinWonders - Safari');
  assert.ok(tenSheet('x'.repeat(50), new Set()).length <= 31);
});

t('hai sheet trùng tên thì tự đánh số, không đè nhau', () => {
  const d = new Set();
  assert.strictEqual(tenSheet('Tour', d), 'Tour');
  assert.strictEqual(tenSheet('Tour', d), 'Tour (2)');
  assert.strictEqual(tenSheet('Tour', d), 'Tour (3)');
});

console.log('\nxlsx — nội dung ô');

t('số ghi kiểu số, chữ ghi kiểu chuỗi', () => {
  const b = taoXlsx([{ ten: 'S', hang: [{ o: ['Nhãn', 1234] }] }]).toString('latin1');
  assert.ok(b.includes('<v>1234</v>'), 'số phải ở dạng <v> để Excel cộng được');
  assert.ok(b.includes('t="inlineStr"'), 'chữ phải khai là chuỗi');
});

t('ký tự XML đặc biệt được thoát', () => {
  const b = taoXlsx([{ ten: 'S', hang: [{ o: ['a < b & "c"'] }] }]).toString('utf8');
  assert.ok(b.includes('&lt;') && b.includes('&amp;') && b.includes('&quot;'));
});

t('ký tự điều khiển bị loại, không làm Excel báo tệp hỏng', () => {
  /* Caption lấy từ nền tảng có lẫn ký tự điều khiển nhiều hơn người ta tưởng,
     và Excel từ chối mở hẳn chứ không bỏ qua. */
  /* Soi thẳng hàm thoát chứ không soi cả tệp: tệp là ZIP nhị phân, header của
     nó vốn có sẵn byte 0x01 nên tìm trong đó lúc nào cũng thấy. */
  const xau = 'xin' + String.fromCharCode(1) + 'chào';
  assert.strictEqual(xEsc(xau), 'xinchào');
  assert.ok(taoXlsx([{ ten: 'S', hang: [{ o: [xau] }] }]).toString('utf8').includes('xinchào'));
});

t('ô rỗng vẫn có thẻ, để cột không bị lệch', () => {
  const b = taoXlsx([{ ten: 'S', hang: [{ o: ['a', '', 'c'] }] }]).toString('utf8');
  assert.ok(/<c r="B1"\/>/.test(b));
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
