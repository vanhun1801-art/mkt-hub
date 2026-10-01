'use strict';
/** Mã 2FA (khớp bộ số mẫu RFC 6238) và bộ nhắc (ai nhận gì, hôm nào). Chạy: node test/totp-nhac.test.js */
let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};
const nem = (f) => { try { f(); return null; } catch (e) { return e; } };

const totp = require('../totp');

/* RFC 6238 phụ lục B: khoá ASCII "12345678901234567890", 8 chữ số, SHA1. */
const RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const c8 = { bimat: RFC, so: 8, chuKy: 30, thuatToan: 'SHA1' };
ok('RFC 6238 t=59 → 94287082', totp.sinhMa(c8, 59000).ma === '94287082');
ok('RFC 6238 t=1111111109 → 07081804', totp.sinhMa(c8, 1111111109000).ma === '07081804');
ok('RFC 6238 t=1234567890 → 89005924', totp.sinhMa(c8, 1234567890000).ma === '89005924');
ok('RFC 6238 t=20000000000 → 65353130', totp.sinhMa(c8, 20000000000000).ma === '65353130');
ok('6 số mặc định = 6 chữ số cuối', totp.sinhMa(RFC, 59000).ma === '287082');
ok('còn lại đúng giây', totp.sinhMa(RFC, 59000).conLai === 1 && totp.sinhMa(RFC, 60000).conLai === 30);

ok('dán có dấu cách, chữ thường vẫn đọc', totp.docCauHinh('gezd gnbv gy3t qojq gezd gnbv gy3t qojq').bimat === RFC);
const u = totp.docCauHinh('otpauth://totp/Google:mkt@x.vn?secret=' + RFC + '&issuer=Google&digits=8&period=30');
ok('đọc đường otpauth:// (digits, period)', u.bimat === RFC && u.so === 8 && u.chuKy === 30);
ok('otpauth HOTP bị từ chối', !!nem(() => totp.docCauHinh('otpauth://hotp/x?secret=' + RFC + '&counter=1')));
ok('chuỗi không phải base32 bị từ chối', !!nem(() => totp.docCauHinh('matkhau-123!')));
ok('chuỗi quá ngắn bị từ chối', !!nem(() => totp.docCauHinh('ABCD')));
ok('đóng gói rồi mở lại giữ nguyên cấu hình', JSON.stringify(totp.moGoi(totp.dongGoi(u))) === JSON.stringify(u));

/* ---------------- bộ nhắc ---------------- */
process.env.LARK_MODE = 'cli';
const nhac = require('../nhac');
const NGAY = 86400000;
const luc = Date.parse('2026-10-01T02:00:00Z');          // 09:00 sáng 01/10 giờ VN
const hom = (n) => Date.parse('2026-10-01T00:00:00+07:00') + n * NGAY;
const H = { id: 'ou_h', ten: 'Hân' }, G = { id: 'ou_g', ten: 'Giang' };
const goi = [
  { id: 'g7', ten: 'Canva', hetHan: hom(7), phuTrach: [H], trangThai: 'Đang dùng', chiPhi: 150000, chuKy: 'Tháng' },
  { id: 'g1', ten: 'Adobe', hetHan: hom(1), phuTrach: [H, G], trangThai: 'Đang dùng' },
  { id: 'gq', ten: 'Claude', hetHan: hom(-1), phuTrach: [G], trangThai: 'Đang dùng' },
  { id: 'g5', ten: 'Figma', hetHan: hom(5), phuTrach: [H], trangThai: 'Đang dùng' },
  { id: 'gn', ten: 'Cũ', hetHan: hom(1), phuTrach: [H], trangThai: 'Ngừng dùng' },
  { id: 'g0', ten: 'Không ai', hetHan: hom(7), phuTrach: [], trangThai: 'Đang dùng' },
];
const tk = [
  { id: 't1', nenTang: 'TikTok', coMatKhau: true, doiLuc: null, phuTrach: [H], trangThai: 'Đang dùng' },
  { id: 't2', nenTang: 'Gmail', coMatKhau: true, doiLuc: luc - 10 * NGAY, phuTrach: [H], trangThai: 'Đang dùng' },
  { id: 't3', nenTang: 'Klook', coMatKhau: true, doiLuc: luc - 400 * NGAY, phuTrach: [G], trangThai: 'Đang dùng' },
  { id: 't4', nenTang: 'Zalo', coMatKhau: false, phuTrach: [G], trangThai: 'Đang dùng' },
];
const ds = nhac.lapDanhSach({ tk, goi }, luc);
const han = ds.filter((x) => x.loai === 'han' && x.nguoi);
ok('gói còn 7 ngày → nhắc', han.some((x) => x.rec === 'g7' && x.nguoi.id === 'ou_h'));
ok('gói còn 1 ngày → nhắc CẢ hai người phụ trách', han.filter((x) => x.rec === 'g1').length === 2);
ok('gói quá hạn 1 ngày → nhắc', han.some((x) => x.rec === 'gq' && /HẾT HẠN/.test(x.chu)));
ok('gói còn 5 ngày → không nhắc (chỉ mốc 7, 1, -1)', !ds.some((x) => x.rec === 'g5'));
ok('gói Ngừng dùng → không nhắc', !ds.some((x) => x.rec === 'gn'));
ok('gói không người phụ trách → vào danh sách nhưng không có người nhận', ds.some((x) => x.rec === 'g0' && !x.nguoi));
ok('khoá nhắc gia hạn khác nhau theo người', new Set(han.map((x) => x.khoa)).size === han.length);
const mk = ds.filter((x) => x.loai === 'mk');
ok('ngày 1: mỗi người MỘT tin đổi mật khẩu', mk.length === 2 && mk.some((x) => x.nguoi.id === 'ou_h') && mk.some((x) => x.nguoi.id === 'ou_g'));
ok('tin của Hân chỉ có TikTok (Gmail mới đổi 10 ngày)', /TikTok/.test(mk.find((x) => x.nguoi.id === 'ou_h').chu) && !/Gmail/.test(mk.find((x) => x.nguoi.id === 'ou_h').chu));
ok('tài khoản không có mật khẩu không bị nhắc', !/Zalo/.test(mk.find((x) => x.nguoi.id === 'ou_g').chu));
ok('khoá nhắc mật khẩu theo tháng', mk.every((x) => /^mk:2026-10:ou_/.test(x.khoa)));
ok('ngày 15 không nhắc đổi mật khẩu', !nhac.lapDanhSach({ tk, goi }, luc + 14 * NGAY).some((x) => x.loai === 'mk'));
ok('tin có đường mở app', han.every((x) => /#\/m\/mat-khau/.test(x.chu)));

console.log('\n' + pass + ' pass · ' + fail + ' fail');
process.exit(fail ? 1 : 0);
