'use strict';
/**
 * Luật lịch chuẩn + cộng công + tháng phải đăng ký. Không cần Base.
 * Chạy: node test/ma-cong.test.js
 */
const MA = require('../ma-cong');
const kho = require('../kho');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};

/* Mốc thật: dòng của anh Hùng trong tab "LLV 09.2026" của HCNS. */
const HCNS_09 = 'x,NL,NL,x,x,OFF,x,x,x,x,x,x/2,OFF,x,x,x,x,x,x,OFF,x,x,x,x,x,x/2,OFF,x,x,x'.split(',');
const LE_09 = ['2026-09-02', '2026-09-03'];
const c09 = MA.lichChuan('2026-09', LE_09);
ok('lịch chuẩn tháng 9 khớp TỪNG Ô với sheet HCNS', c09.join() === HCNS_09.join(), c09.join());
ok('công chuẩn tháng 9 = 25 như sheet HCNS', MA.tinh('2026-09', c09, LE_09).congChuan === 25);

const c10 = MA.lichChuan('2026-10', []);
ok('T7 thứ 2 và thứ 4 của tháng 10 (10 và 24) là x/2', c10[9] === 'x/2' && c10[23] === 'x/2');
ok('T7 thứ 1, 3, 5 (3, 17, 31) đi làm cả ngày', c10[2] === 'x' && c10[16] === 'x' && c10[30] === 'x');
ok('mọi Chủ nhật là OFF', [4, 11, 18, 25].every((d) => c10[d - 1] === 'OFF'));
ok('công chuẩn tháng 10 = 26', MA.tinh('2026-10', c10, []).congChuan === 26);

/* Tháng bắt đầu bằng Thứ 7 (08/2026): T7 thứ 2 là ngày 8, không phải 15. */
const c08 = MA.lichChuan('2026-08', []);
ok('tháng mở đầu bằng T7: đếm T7 thứ mấy, không đếm tuần lịch', c08[7] === 'x/2' && c08[21] === 'x/2' && c08[0] === 'x');

/* Lễ rơi vào Chủ nhật vẫn là OFF. */
ok('lễ trùng Chủ nhật vẫn OFF', MA.lichChuan('2026-10', ['2026-10-04'])[3] === 'OFF');

const t = MA.tinh('2026-10', c10.map((m, i) => (i === 4 ? 'NP' : i === 5 ? 'KL' : i === 6 ? 'NP/2' : m)), []);
ok('NP giữ công, KL mất công, NP/2 giữ công', t.tongCong === 25, String(t.tongCong));
ok('ngày nghỉ đếm 2,5', t.nghi === 2.5, String(t.nghi));
ok('phép 1,5 · không lương 1', t.phep === 1.5 && t.khongLuong === 1);

const cb = MA.canhBao('2026-10', c10.map((m, i) => (i === 3 ? 'x' : m)), []);
ok('đi làm Chủ nhật mà ghi x thì nhắc chọn LVOFF', cb.some((x) => x.includes('LVOFF')));
ok('lịch chuẩn không có cảnh báo', MA.canhBao('2026-10', c10, []).length === 0);

ok('mức vắng: NP cả ngày, x/2 nửa ngày, x có mặt',
  MA.mucVang('NP') === 'ca' && MA.mucVang('x/2') === 'nua' && MA.mucVang('x') === '');

/* Tháng phải đăng ký, theo giờ VN. 28/09 17:00 UTC = 29/09 00:00 VN. */
const vnLuc = (s) => Date.parse(s + '+07:00');
ok('ngày 28 VN: vẫn tháng này', MA.thangPhaiDangKy(vnLuc('2026-10-28T23:59:00'), '') === '2026-10');
ok('00:00 ngày 29 VN: sang tháng sau', MA.thangPhaiDangKy(vnLuc('2026-09-29T00:00:00'), '') === '2026-10');
ok('tháng 12 -> tháng 1 năm sau', MA.thangPhaiDangKy(vnLuc('2026-12-30T08:00:00'), '') === '2027-01');
ok('tháng 2 không có ngày 29: nhắc từ ngày 28', MA.thangPhaiDangKy(vnLuc('2027-02-28T08:00:00'), '') === '2027-03');
ok('trước mốc bắt đầu thì không nhắc', MA.thangPhaiDangKy(vnLuc('2026-09-23T08:00:00'), '2026-10') === '');
ok('ai lỡ ngày 29 thì mùng 3 vẫn bị nhắc tháng đó', MA.thangPhaiDangKy(vnLuc('2026-10-03T08:00:00'), '2026-10') === '2026-10');

/* Kỳ đăng ký cố định: mặc định 09:00 ngày 29 -> 23:59 ngày hôm sau, giờ VN. */
const ky = (s, ch) => MA.cuaSo(vnLuc(s), ch || {});
ok('08:59 ngày 29: chưa mở, kỳ sắp tới là tháng sau', !ky('2026-09-29T08:59:00').dangMo && ky('2026-09-29T08:59:00').thang === '2026-10');
ok('09:00 ngày 29: mở', ky('2026-09-29T09:00:00').dangMo);
ok('23:59:30 ngày hôm sau: vẫn mở', ky('2026-09-30T23:59:30').dangMo);
ok('00:00 mùng 1: đã đóng, kỳ tới là tháng sau nữa', !ky('2026-10-01T00:00:00').dangMo && ky('2026-10-01T00:00:00').thang === '2026-11');
ok('tháng 2 (28 ngày): mở ngày 28, đóng tràn sang 01/03', ky('2027-03-01T20:00:00').dangMo && ky('2027-03-01T20:00:00').thang === '2027-03');
ok('cấu hình riêng: mở 25 lúc 14:00, đóng sau 2 ngày', ky('2026-09-27T12:00:00', { ngayMo: 25, gioMo: '14:00', dongSauNgay: 2 }).dangMo &&
  !ky('2026-09-25T13:59:00', { ngayMo: 25, gioMo: '14:00', dongSauNgay: 2 }).dangMo);
ok('cấu hình sai giờ bị từ chối', !!MA.kiemCauHinh({ gioMo: '9h' }).loi);
ok('đóng cùng ngày mà giờ đóng trước giờ mở bị từ chối', !!MA.kiemCauHinh({ dongSauNgay: 0, gioMo: '09:00', gioDong: '08:00' }).loi);
ok('tháng mở sẵn: kỳ đã đóng thì xem tháng sau', MA.thangXem(vnLuc('2026-09-30T23:59:59') + 1000, {}) === '2026-10');
ok('tháng mở sẵn: giữa tháng thì xem tháng này', MA.thangXem(vnLuc('2026-09-15T10:00:00'), {}) === '2026-09');

/* Khớp người: id -> email -> tên (chỉ khi đúng một người). */
const ds = [
  { recordId: 'a', hoTen: 'Nguyễn Long Khánh', nguoi: '', email: '' },
  { recordId: 'b', hoTen: 'Huỳnh Chí Khanh', nguoi: 'ou_k', email: 'k@x.vn' },
  { recordId: 'c', hoTen: 'Trần Văn A', nguoi: '', email: '' },
  { recordId: 'd', hoTen: 'Tran van a', nguoi: '', email: '' },
];
ok('khớp theo open_id', (kho.timNhanSu({ id: 'ou_k' }, ds) || {}).recordId === 'b');
ok('khớp theo email', (kho.timNhanSu({ id: 'ou_khac', email: 'K@x.vn' }, ds) || {}).recordId === 'b');
ok('khớp theo tên bỏ dấu', (kho.timNhanSu({ id: 'ou_moi', ten: 'nguyen long  khanh' }, ds) || {}).recordId === 'a');
ok('Khánh và Khanh không lẫn nhau khi có id', (kho.timNhanSu({ id: 'ou_k', ten: 'Nguyễn Long Khánh' }, ds) || {}).recordId === 'b');
ok('hai người trùng tên thì KHÔNG đoán', kho.timNhanSu({ id: 'ou_z', ten: 'Trần Văn A' }, ds) === null);

/* Ô Base đọc về: cli trả chuỗi ISO có +07:00. */
ok('ngày lễ đọc từ chuỗi ISO giờ Base', kho.asNgay('2027-01-01T00:00:00.000+07:00') === '2027-01-01');
ok('ngày lễ đọc từ số ms (chế độ api)', kho.asNgay(Date.parse('2027-01-01T00:00:00+07:00')) === '2027-01-01');

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
process.exit(fail ? 1 : 0);
