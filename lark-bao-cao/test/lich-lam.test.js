'use strict';
/**
 * Lịch làm việc → ngày phải báo cáo. Hàm thuần, không chạm Base.
 * Chạy: node test/lich-lam.test.js
 */
const LL = require('../lich-lam');
const K = require('../ky');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + JSON.stringify(vi) : '')); }
};
const ngayVN = (d, m) => K.kyNgay(Date.UTC(2026, m - 1, d, 5)).tu;

const ds = [
  { thang: '2026-09', ten: 'Huỳnh Thị Anh Thư', email: '', ngay: { 1: 'x', 2: 'NL', 3: 'NL', 4: 'x', 5: 'OFF', 7: 'x/2', 8: 'NP', 9: 'KL' } },
  { thang: '2026-10', ten: 'Nguyễn Long Khánh', email: 'khanhnl@rootytrip.com', ngay: { 1: 'x', 4: 'OFF' } },
];
const thu = LL.lichCua(ds, { ten: 'Huỳnh Thị Anh Thư' });
ok('x → đi làm', thu(ngayVN(1, 9)) === true);
ok('x/2 → đi làm (nửa ca vẫn báo)', thu(ngayVN(7, 9)) === true);
ok('NL / OFF / NP / KL → nghỉ', [2, 5, 8, 9].every((d) => thu(ngayVN(d, 9)) === false));
ok('ô trống → không biết (null)', thu(ngayVN(6, 9)) === null);
ok('tháng chưa đăng ký → null', thu(ngayVN(1, 10)) === null);

const pinky = LL.lichCua(ds, { ten: 'Nguyễn Long Khánh (Pinky)' });
ok('"Tên (biệt danh)" khớp với "Tên" trên lịch', pinky(ngayVN(1, 10)) === true);
ok('khớp theo email', LL.lichCua(ds, { email: 'KhanhNL@rootytrip.com' })(ngayVN(4, 10)) === false);
ok('khớp tên không phân biệt dấu/hoa', LL.lichCua(ds, { ten: 'huynh thi anh thu' })(ngayVN(1, 9)) === true);

/* ngayThieu dùng lịch: nghỉ lễ không tính thiếu, ô trống lùi về T2–T7 */
const tu = ngayVN(1, 9), den = ngayVN(7, 9) + 86400000 - 1;
const thieu = K.ngayThieu(tu, den, [], K.LUAT, thu).map((ms) => K.veNgay(ms));
ok('thiếu theo lịch: 01, 04, 07 (+ 06 ô trống là CN → bỏ)', thieu.join() === '01/09/2026,04/09/2026,07/09/2026', thieu);
const khongLich = K.ngayThieu(tu, den, []).map((ms) => K.veNgay(ms));
ok('không có lịch → T2–T7 như cũ (6 ngày)', khongLich.length === 6, khongLich);

ok('coLich liệt kê người có ngày đi làm trong kỳ', LL.coLich(ds, tu, den).map((x) => x.ten).join() === 'Huỳnh Thị Anh Thư');
ok('maCong trả mã của ngày', LL.maCong(ds, { ten: 'Huỳnh Thị Anh Thư' }, ngayVN(2, 9)) === 'NL');

console.log('\n' + pass + ' pass · ' + fail + ' fail');
process.exit(fail ? 1 : 0);
