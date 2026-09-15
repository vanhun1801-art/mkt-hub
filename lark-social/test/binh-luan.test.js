'use strict';
/* Test thuần Node: `node test/binh-luan.test.js`. */
const assert = require('assert');
const bl = require('../binh-luan');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

const la = (s) => bl.laKhachHoi(s);

console.log('\nbình luận — ranh giới chữ tiếng Việt');

t('"cảm giác" KHÔNG bị tính là hỏi giá', () => {
  /* \b của JavaScript coi "chữ" là [A-Za-z0-9_], nên á là dấu phân cách và
     /\bgiá\b/ khớp "cảm giác". Đã bắt nhầm đúng như thế trên bình luận thật. */
  assert.strictEqual(/\bgiá\b/i.test('cảm giác'), true, 'đây là cái bẫy');
  assert.strictEqual(la('đi đà nẵng vài lần vẫn không có cảm giác này'), false);
  assert.strictEqual(la('cảm giác thật tuyệt'), false);
});

t('"giá" đứng riêng thì vẫn bắt', () => {
  assert.strictEqual(la('giá bao nhiêu vậy shop'), true);
  assert.strictEqual(la('báo giá giúp mình với'), true);
});

console.log('\nbình luận — khách thật thì không được lọt');

t('hai câu lấy từ bình luận thật đều được bắt', () => {
  /* Cả hai đều là khách hỏi mua, và bản chấm điểm đầu tiên bỏ lọt cả hai. */
  assert.strictEqual(la('Cho Gia 2 người'), true);
  assert.strictEqual(la('Chào em 4ngày 3 đêm'), true);
});

t('xin thông tin, xin tư vấn, để lại số', () => {
  assert.strictEqual(la('Cho mình xin thêm thông tin a'), true);
  assert.strictEqual(la('ib em với'), true);
  assert.strictEqual(la('sđt em 0912345678 nhé'), true);
});

console.log('\nbình luận — khen chê thì bỏ qua');

t('lời khen không bị coi là khách hỏi mua', () => {
  ['ảnh đẹp quá', 'tuyệt vời ông mặt trời', 'nhớ Phú Quốc ghê', '❤️❤️',
    'đi rồi, vui lắm'].forEach((s) => assert.strictEqual(la(s), false, 'không được bắt: ' + s));
});

t('chuỗi rỗng hoặc rác không làm nổ', () => {
  assert.strictEqual(la(''), false);
  assert.strictEqual(la(null), false);
  assert.strictEqual(la(undefined), false);
});

console.log('\nbình luận — điểm và dấu hiệu');

t('nhiều dấu hiệu thì điểm cộng dồn, xếp lên trước', () => {
  const a = bl.chamDiem('cho mình xin giá 2 người 3 ngày 2 đêm, sđt 0909123456');
  const b = bl.chamDiem('giá bao nhiêu');
  assert.ok(a.diem > b.diem, a.diem + ' phải lớn hơn ' + b.diem);
  assert.ok(a.dauHieu.length >= 3);
});

t('dấu hiệu được kể tên để người trực biết vì sao nó lọt vào', () => {
  const r = bl.chamDiem('0912345678');
  assert.deepStrictEqual(r.dauHieu, ['để lại số']);
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
