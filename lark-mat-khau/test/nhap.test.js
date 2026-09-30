'use strict';
/** Chuyển dòng Excel → bản ghi, chia nhóm. Không đọc file thật. Chạy: node test/nhap.test.js */
let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};
const { chuyenDong, nhomCua } = require('../nhap');

//          STT  Nền tảng  PT    Kênh  Tên  User  Pass  TG1  Phone  PassMoi  TG2  Mail
const d = chuyenDong([5, 'Tik Tok', 'Hằng', 'https://tiktok.com/@r', 'Rooty', 'u1', 'cu', 'KhongPhaiNgay', null, 'moi', '2026-03-01T00:00:00', null]);
ok('mật khẩu hiện tại = Password mới khi có', d.matKhau === 'moi');
ok('Password cũ giữ vào mật khẩu cũ', d.matKhauCu === 'cu');
ok('ngày đổi lấy từ cột thời gian thứ hai', d.doiLuc === '2026-03-01 00:00:00');
ok('ô "thời gian" không phải ngày KHÔNG chép sang Ghi chú (có thể là mật khẩu dán nhầm)', !JSON.stringify(d).includes('KhongPhaiNgay'));
ok('link đúng cột Kênh', d.link === 'https://tiktok.com/@r');
ok('nhóm Mạng xã hội', d.nhom === 'Mạng xã hội');

ok('dòng ghi chú cuối file bị bỏ', chuyenDong([null, '\n*Note: Vui lòng thông báo khi có bất kì thay đổi', null, null, null, null, null]) === null);
ok('dòng trống bị bỏ', chuyenDong([null, null, null, null, null, null, null, null, null, null, null, null]) === null);
const u = chuyenDong([9, 'https://tino.vn/vps-n8n', null, null, null, 'x', 'p']);
ok('URL ghi ở cột Nền tảng → thành link, nền tảng là tên miền', u.link === 'https://tino.vn/vps-n8n' && u.nenTang === 'tino.vn');

ok('"Website rootytrip.com" không bị xếp vào OTA (trip.com)', nhomCua('Website rootytrip.com') === 'Website & hạ tầng');
ok('Trip.com là OTA', nhomCua('Trip.com') === 'Kênh bán OTA');
ok('Payoneer là Thanh toán', nhomCua('payoneer') === 'Thanh toán');
ok('Google HR là Email & Google', nhomCua('Google HR') === 'Email & Google');
ok('Claude là Công cụ & AI', nhomCua('Claude') === 'Công cụ & AI');
ok('xét tên trước link', nhomCua('Tourwell', 'https://klook.com') === 'Công cụ & AI');

console.log('\n' + pass + ' pass · ' + fail + ' fail');
process.exit(fail ? 1 : 0);
