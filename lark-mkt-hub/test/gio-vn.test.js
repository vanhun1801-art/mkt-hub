'use strict';
/**
 * Chứng minh hub cho ra CÙNG một kết quả dù máy chủ chạy giờ nào.
 *
 * Chạy hai lần trong cùng tiến trình là không được (TZ đọc lúc khởi động), nên
 * script này chỉ kiểm mấy hàm thuần của gio-vn.js + mô phỏng lại đúng công thức
 * cũ để thấy nó lệch ở đâu. Dùng mốc thật lấy từ Base.
 */
const g = require('../gio-vn');

let pass = 0, fail = 0;
const ok = (t, d, vi) => {
  if (d) { pass++; console.log('  \x1b[32mOK  \x1b[0m ' + t); }
  else { fail++; console.log('  \x1b[31mLỖI \x1b[0m ' + t + (vi ? '\n        ' + vi : '')); }
};

// Mốc hiểm: 00:30 giờ VN ngày 02/09 = 17:30 UTC ngày 01/09
const nuaDem = Date.parse('2026-09-02T00:30:00+07:00');
// Mốc thường: 15:00 giờ VN = 08:00 UTC, cùng ngày ở cả hai múi
const chieu = Date.parse('2026-09-02T15:00:00+07:00');

console.log('\n\x1b[1m1. Mốc 00:30 giờ VN phải là ngày 02/09, không phải 01/09\x1b[0m');
ok('ngayKhoa', g.ngayKhoa(nuaDem) === '2026-09-02', g.ngayKhoa(nuaDem));
ok('ngayNgan', g.ngayNgan(nuaDem) === '02/09', g.ngayNgan(nuaDem));
ok('gio    ', g.gio(nuaDem) === '00:30', g.gio(nuaDem));
ok('thu    ', g.thu(nuaDem) === 'Thứ tư', g.thu(nuaDem));

/* Công thức CŨ, viết lại y nguyên, để thấy nó hỏng chỗ nào khi máy chạy UTC. */
const p2 = (n) => String(n).padStart(2, '0');
const cuNgay = (t, lechMay) => {
  const d = new Date(t + lechMay);           // giả lập máy có lệch múi giờ
  return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
};
console.log('\n\x1b[1m2. Công thức cũ: đúng ở máy VN, sai ở máy UTC\x1b[0m');
ok('máy VN (+07) thì bản cũ vẫn đúng', cuNgay(nuaDem, 7 * 3600000) === '2026-09-02');
ok('máy UTC thì bản cũ ra SAI ngày — đây là lỗi đã sửa',
  cuNgay(nuaDem, 0) === '2026-09-01', cuNgay(nuaDem, 0));

console.log('\n\x1b[1m3. Bản mới không phụ thuộc múi giờ máy chủ\x1b[0m');
ok('cùng kết quả cho mốc nửa đêm', g.ngayKhoa(nuaDem) === '2026-09-02');
ok('cùng kết quả cho mốc buổi chiều', g.ngayKhoa(chieu) === '2026-09-02');
ok('đầu ngày là 00:00 giờ VN',
  new Date(g.dauNgay(chieu)).toISOString() === '2026-09-01T17:00:00.000Z',
  new Date(g.dauNgay(chieu)).toISOString());
ok('00:30 và 15:00 cùng ngày thì cùng đầu ngày', g.dauNgay(nuaDem) === g.dauNgay(chieu));

console.log('\n\x1b[1m4. Chuỗi YYYY-MM-DD phải hiểu là nửa đêm giờ VN\x1b[0m');
ok('tuNgayKhoa ghim +07',
  new Date(g.tuNgayKhoa('2026-09-02')).toISOString() === '2026-09-01T17:00:00.000Z',
  new Date(g.tuNgayKhoa('2026-09-02')).toISOString());
ok('khớp với dauNgay của chính ngày đó', g.tuNgayKhoa('2026-09-02') === g.dauNgay(chieu));

console.log('\n\x1b[1m5. Tháng hiện tại theo giờ VN\x1b[0m');
// 00:30 giờ VN ngày 01/10 = 17:30 UTC ngày 30/09 -> bản cũ sẽ ra tháng 9
const mung1 = Date.parse('2026-10-01T00:30:00+07:00');
const th = g.thangNay(mung1);
ok('00:30 ngày 01/10 vẫn ra THÁNG 10', th.tu === '2026-10-01', JSON.stringify(th));
ok('ngày cuối tháng 10 là 31', th.den === '2026-10-31', th.den);
const th2 = g.thangNay(Date.parse('2026-02-15T12:00:00+07:00'));
ok('tháng 2/2026 kết thúc ngày 28', th2.den === '2026-02-28', th2.den);

console.log('\n' + '─'.repeat(52));
console.log('  ' + pass + ' pass · ' + fail + ' fail');
console.log('─'.repeat(52) + '\n');
process.exit(fail ? 1 : 0);
