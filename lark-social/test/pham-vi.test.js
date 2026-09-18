'use strict';
/* Test thuần Node: `node test/pham-vi.test.js`. */
const assert = require('assert');
const pv = require('../pham-vi');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

const kenh = (extId, viewers) => ({ extId, name: extId, viewers });
const ai = (email) => ({ email });

console.log('\nphạm vi — đọc danh sách email');

t('chịu mọi kiểu ngăn cách người ta hay gõ', () => {
  assert.deepStrictEqual(pv.tachEmail('a@x.com, b@x.com'), ['a@x.com', 'b@x.com']);
  assert.deepStrictEqual(pv.tachEmail('a@x.com;b@x.com'), ['a@x.com', 'b@x.com']);
  assert.deepStrictEqual(pv.tachEmail('a@x.com\nb@x.com'), ['a@x.com', 'b@x.com']);
  assert.deepStrictEqual(pv.tachEmail('  A@X.COM  '), ['a@x.com'], 'không phân biệt hoa thường');
});

t('bỏ qua chuỗi không phải email', () => {
  assert.deepStrictEqual(pv.tachEmail('Nguyễn Văn A, b@x.com'), ['b@x.com']);
  assert.deepStrictEqual(pv.tachEmail(''), []);
  assert.deepStrictEqual(pv.tachEmail(null), []);
});

console.log('\nphạm vi — ai xem được gì');

t('kênh CHƯA khai ai thì ai cũng xem được', () => {
  /* Mười một kênh đang trống. Mặc định "không ai xem được" thì ngay khi tính
     năng lên, cả phòng mở app ra thấy trắng trơn và không hiểu vì sao. */
  assert.strictEqual(pv.xemDuoc(kenh('a', ''), ai('x@rootytrip.com')), true);
  assert.strictEqual(pv.xemDuoc(kenh('a', null), ai('x@rootytrip.com')), true);
});

t('kênh đã khai thì chỉ người trong danh sách', () => {
  const k = kenh('a', 'hoa@rootytrip.com, lan@rootytrip.com');
  assert.strictEqual(pv.xemDuoc(k, ai('hoa@rootytrip.com')), true);
  assert.strictEqual(pv.xemDuoc(k, ai('HOA@RootyTrip.com')), true, 'hoa thường không quan trọng');
  assert.strictEqual(pv.xemDuoc(k, ai('minh@rootytrip.com')), false);
});

t('đã khai mà không biết người xem là ai thì ĐÓNG', () => {
  /* Hub không gửi email xuống (chưa đăng nhập, hoặc chạy ngoài hub) — thà không
     cho xem còn hơn mở toang một kênh đã được giao riêng. */
  const k = kenh('a', 'hoa@rootytrip.com');
  assert.strictEqual(pv.xemDuoc(k, {}), false);
  assert.strictEqual(pv.xemDuoc(k, null), false);
});

t('quản lý thấy tất cả, kể cả kênh đã giao cho người khác', () => {
  const ds = [kenh('a', 'hoa@x.com'), kenh('b', 'lan@x.com')];
  assert.strictEqual(pv.kenhCuaNguoi(ds, ai('minh@x.com'), true).length, 2);
  assert.strictEqual(pv.kenhCuaNguoi(ds, ai('minh@x.com'), false).length, 0);
});

console.log('\nphạm vi — giới hạn truy vấn');

t('chưa kênh nào bị khoá thì không giới hạn gì', () => {
  /* Trả null chứ không trả danh sách đủ: null nghĩa là "khỏi lọc", nhanh hơn và
     không đụng gì tới hành vi cũ. */
  assert.strictEqual(pv.gioiHan([kenh('a', ''), kenh('b', '')], ai('x@x.com'), false), null);
});

t('quản lý không bao giờ bị giới hạn', () => {
  assert.strictEqual(pv.gioiHan([kenh('a', 'hoa@x.com')], ai('minh@x.com'), true), null);
});

t('nhân sự chỉ nhận extId của kênh mình', () => {
  const ds = [kenh('a', 'hoa@x.com'), kenh('b', 'lan@x.com'), kenh('c', '')];
  assert.deepStrictEqual(pv.gioiHan(ds, ai('hoa@x.com'), false).sort(), ['a', 'c'],
    'kênh chưa khai ai vẫn xem được');
});

console.log('\nphạm vi — chốt ở máy chủ');

t('người dùng chọn kênh ngoài phần mình thì bị loại', () => {
  /* Giao diện đã lọc sẵn, nhưng giao diện là thứ sửa được. Gọi thẳng API với
     tên kênh ngoài phần mình vẫn phải ra rỗng. */
  assert.deepStrictEqual(pv.ganLoc(['a', 'z'], ['a', 'c']), ['a']);
  assert.deepStrictEqual(pv.ganLoc(['z'], ['a', 'c']), [], 'chọn toàn kênh lạ thì không còn gì');
});

t('không chọn gì thì mặc định là trọn phần của mình', () => {
  assert.deepStrictEqual(pv.ganLoc([], ['a', 'c']), ['a', 'c']);
});

t('không có giới hạn thì giữ nguyên lựa chọn', () => {
  assert.deepStrictEqual(pv.ganLoc(['a'], null), ['a']);
  assert.deepStrictEqual(pv.ganLoc([], null), []);
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
