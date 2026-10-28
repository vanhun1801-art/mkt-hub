'use strict';
/** Soát chữ trước khi gửi: bắt lỗi hay gặp, không đụng link, email, mã, số. */
const { soat, sua, gopAi } = require('../chinh-ta');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};
const sach = (t) => sua(t, soat(t));

console.log('\nBắt lỗi');
ok('viết tắt', sach('Em đã nhận dc, ko sao ạ') === 'Em đã nhận được, không sao ạ');
ok('viết hoa đầu câu giữ hoa', sach('Tks anh') === 'Cảm ơn anh');
ok('chữ lặp', sach('Báo giá của của bên mình') === 'Báo giá của bên mình');
ok('dấu cách trước dấu phẩy', sach('Chào anh ,em gửi') === 'Chào anh, em gửi');
ok('thiếu dấu cách sau dấu chấm, câu mới viết hoa', sach('Em đã gửi.em chờ anh') === 'Em đã gửi. Em chờ anh');
ok('đầu thư viết hoa', sach('chào anh') === 'Chào anh');
ok('số rồi dấu chấm dính chữ', sach('Em gửi trước thứ 6.em cảm ơn') === 'Em gửi trước thứ 6. Em cảm ơn');
ok('thừa dấu cách', sach('Chào  anh') === 'Chào anh');

console.log('\nKhông đụng');
const giu = 'Anh xem https://rootytrip.com/tour,a giúp em, gửi a.b@x.vn, mã RH-PITO-261028, giá 1,5tr, trang rootytrip.com nhé.';
ok('link, email, mã, số, tên miền', soat(giu).length === 0, JSON.stringify(soat(giu)));
ok('chữ đã đúng thì không có lỗi', soat('Dạ, em cảm ơn anh. Em sẽ gửi báo giá trước thứ Sáu.').length === 0);
ok('"a", "e" một mình không bị coi là viết tắt', soat('Phòng A và e-mail').length === 0);

console.log('\nGộp lỗi AI');
const g = gopAi('Em sẻ gửi', soat('Em sẻ gửi'), [{ sai: 'sẻ', sua: 'sẽ', ly: 'Sai dấu' }, { sai: 'không có', sua: 'x' }]);
ok('lỗi AI tìm đúng vị trí, lỗi không có trong chữ bị bỏ', g.length === 1 && g[0].vt === 3 && g[0].ai);
ok('sửa theo lỗi AI', sua('Em sẻ gửi', g) === 'Em sẽ gửi');

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
