'use strict';
/**
 * Hoán đổi deadline giữa hai việc → báo người order (05/11/2026).
 * Chạy: node test/doi-lich.test.js
 */
const DL = require('../doi-lich');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};

console.log('\n\x1b[1mĐọc giờ\x1b[0m');
ok('chuỗi Base không múi giờ là giờ VN', DL.msVN('2026-11-10 08:00:00') === Date.parse('2026-11-10T01:00:00Z'));
ok('ISO có Z giữ nguyên', DL.msVN('2026-11-10T01:00:00.000Z') === Date.parse('2026-11-10T01:00:00Z'));
ok('ms dạng số và dạng chuỗi', DL.msVN(1793846400000) === 1793846400000 && DL.msVN('1793846400000') === 1793846400000);
ok('nhãn theo giờ VN', DL.nhanGio('2026-11-10T01:00:00Z') === '08:00 T3 10/11', DL.nhanGio('2026-11-10T01:00:00Z'));

console.log('\n\x1b[1mVí dụ anh Hùng: A 02:00, C 22:00 → hoán đổi\x1b[0m');
const toi = [{ id: 'ed' }];
const A = { id: 'A', title: 'Việc A', workType: 'Edit video', status: 'Đang tiến hành', owner: toi, deadline1: '2026-11-07 02:00:00' };
const C = { id: 'C', title: 'Việc C', workType: 'Edit video', status: 'Chờ tiếp nhận', owner: toi, deadline1: '2026-11-07 22:00:00' };
const NOW = Date.parse('2026-11-06T12:00:00+07:00');
const DONG = ['Hoàn thành', 'Hủy'];
ok('hợp lệ thì không chặn', DL.chanHoanDoi(A, C, 'ed', NOW, DONG) === '');
const tA = DL.tinHoanDoi(A, C), tC = DL.tinHoanDoi(C, A);
ok('A bị lùi: 02:00 → 22:00, nhận diện lui', DL.loaiTin(tA) === 'lui' && /02:00 T7 07\/11 → 22:00 T7 07\/11/.test(tA) && /"Việc C"/.test(tA), tA);
ok('C được kéo sớm: 22:00 → 02:00, nhận diện som', DL.loaiTin(tC) === 'som' && /22:00 T7 07\/11 → 02:00 T7 07\/11/.test(tC), tC);

console.log('\n\x1b[1mChặn\x1b[0m');
ok('việc của người khác', /của chính bạn/.test(DL.chanHoanDoi(A, { ...C, owner: [{ id: 'x' }] }, 'ed', NOW, DONG)));
ok('khác loại công việc', /cùng loại/.test(DL.chanHoanDoi(A, { ...C, workType: 'Chỉnh ảnh' }, 'ed', NOW, DONG)));
ok('việc đã đóng', /đã đóng/.test(DL.chanHoanDoi(A, { ...C, status: 'Hoàn thành' }, 'ed', NOW, DONG)));
ok('thiếu deadline', /phải có deadline/.test(DL.chanHoanDoi(A, { ...C, deadline1: null }, 'ed', NOW, DONG)));
ok('đã qua deadline', /qua deadline/.test(DL.chanHoanDoi(A, C, 'ed', Date.parse('2026-11-07T03:00:00+07:00'), DONG)));
ok('cùng một việc', DL.chanHoanDoi(A, A, 'ed', NOW, DONG) !== '');
ok('người hỗ trợ cũng là việc của mình', DL.chanHoanDoi({ ...A, owner: [], helper: toi }, C, 'ed', NOW, DONG) === '');

console.log('\n\x1b[1mĐổi deadline sau Yêu cầu điều chỉnh\x1b[0m');
ok('không đổi thì null', DL.tinDoiDeadline(A, { note: 'x' }) === null);
ok('cùng mốc khác cách viết thì null', DL.tinDoiDeadline(A, { deadline1: '2026-11-06T19:00:00.000Z' }) === null);
ok('đổi thì nhận diện deadline', DL.loaiTin(DL.tinDoiDeadline(A, { deadline1: '2026-11-08T10:00:00Z' })) === 'deadline');

console.log('\n\x1b[1mMàu khi có nhiều tin\x1b[0m');
ok('đỏ không bị xanh đè', DL.nangHon(DL.nangHon('', 'lui'), 'som') === 'lui');
ok('xanh lên đỏ', DL.nangHon('som', 'deadline') === 'deadline');
ok('tin thường không đổi gì', DL.nangHon('som', DL.loaiTin('anh xem giúp')) === 'som');

console.log('\n' + pass + ' pass · ' + fail + ' fail');
process.exit(fail ? 1 : 0);
