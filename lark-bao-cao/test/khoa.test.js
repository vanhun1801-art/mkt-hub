'use strict';
/**
 * Khoá theo mã phiếu + khoá người — không chạm Base.
 * Chạy: node test/khoa.test.js
 */
const kho = require('../kho');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + JSON.stringify(vi) : '')); }
};
const cho = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* cùng khoá → tuần tự, đúng thứ tự gọi */
  const vet = [];
  await Promise.all([
    kho.trongKhoa('A', async () => { vet.push('1-vào'); await cho(30); vet.push('1-ra'); }),
    kho.trongKhoa('A', async () => { vet.push('2-vào'); await cho(5); vet.push('2-ra'); }),
  ]);
  ok('cùng mã phiếu: lượt 2 chờ lượt 1 xong', vet.join() === '1-vào,1-ra,2-vào,2-ra', vet);

  /* khác khoá → chạy song song */
  const v2 = [];
  await Promise.all([
    kho.trongKhoa('B', async () => { v2.push('b-vào'); await cho(30); v2.push('b-ra'); }),
    kho.trongKhoa('C', async () => { v2.push('c-vào'); await cho(5); v2.push('c-ra'); }),
  ]);
  ok('khác mã phiếu: không chờ nhau', v2.join() === 'b-vào,c-vào,c-ra,b-ra', v2);

  /* lượt trước hỏng không chặn lượt sau */
  let chay = false;
  const loi = kho.trongKhoa('D', async () => { throw new Error('hỏng'); }).catch((e) => e.message);
  await kho.trongKhoa('D', async () => { chay = true; });
  ok('lượt trước ném lỗi → lượt sau vẫn chạy, lỗi vẫn về đúng người gọi', chay && (await loi) === 'hỏng');

  /* khoá người */
  ok('khoaNguoi ưu tiên open_id', kho.khoaNguoi({ id: 'ou_1', email: 'A@b.vn' }) === 'ou_1');
  ok('khoaNguoi không id → email thường', kho.khoaNguoi({ email: ' A@B.vn ' }) === 'a@b.vn');
  ok('hai người chỉ có email → hai mã phiếu khác nhau',
    kho.maPhieu('ngay', Date.UTC(2026, 9, 1), kho.khoaNguoi({ email: 'a@b.vn' })) !==
    kho.maPhieu('ngay', Date.UTC(2026, 9, 1), kho.khoaNguoi({ email: 'c@d.vn' })));

  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
