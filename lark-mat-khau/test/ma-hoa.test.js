'use strict';
/** Mã hoá: khứ hồi, IV mới mỗi lần, phát hiện sửa tay, sai khoá, thiếu khoá. Chạy: node test/ma-hoa.test.js */
let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};
const nem = (f) => { try { f(); return null; } catch (e) { return e; } };

const crypto = require('crypto');
process.env.TK_KHOA = crypto.randomBytes(32).toString('base64');
const mh = require('../ma-hoa');

const goc = 'Mật khẩu@Thử 2026 ✓';
const a = mh.maHoa(goc);
const b = mh.maHoa(goc);
ok('có tiền tố enc:v1:', a.startsWith('enc:v1:'));
ok('không chứa chữ gốc', !a.includes('Thử') && !a.includes('2026'));
ok('khứ hồi đúng từng ký tự (cả tiếng Việt, emoji)', mh.giaiMa(a) === goc);
ok('hai lần mã hoá ra hai chuỗi khác nhau (IV mới)', a !== b && mh.giaiMa(b) === goc);
ok('ô trống ra chuỗi trống', mh.maHoa('') === '' && mh.giaiMa('') === '');
ok('chữ thường cũ (chưa mã hoá) đọc thẳng', mh.giaiMa('matkhau-cu') === 'matkhau-cu');
ok('daMaHoa nhận đúng', mh.daMaHoa(a) && !mh.daMaHoa('abc') && !mh.daMaHoa(null));

const sua = a.slice(0, -4) + (a.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
ok('sửa tay một đoạn trên Base → báo lỗi, không ra mật khẩu sai', !!nem(() => mh.giaiMa(sua)));
ok('chuỗi bị cắt cụt → báo lỗi', !!nem(() => mh.giaiMa('enc:v1:AAAA')));

const khoaCu = process.env.TK_KHOA;
process.env.TK_KHOA = crypto.randomBytes(32).toString('base64');
ok('khoá khác → không giải được', !!nem(() => mh.giaiMa(a)));
process.env.TK_KHOA = '';
ok('thiếu khoá → maHoa từ chối (không ghi chữ thường lên Base)', !!nem(() => mh.maHoa('x')));
ok('thiếu khoá → giaiMa báo rõ', /TK_KHOA/.test((nem(() => mh.giaiMa(a)) || {}).message || ''));
ok('thiếu khoá → coKhoa() = false', mh.coKhoa() === false);
process.env.TK_KHOA = Buffer.from('ngan').toString('base64');
ok('khoá sai độ dài → coKhoa() = false', mh.coKhoa() === false);
process.env.TK_KHOA = khoaCu;
ok('taoKhoa ra 32 byte', Buffer.from(mh.taoKhoa(), 'base64').length === 32);

console.log('\n' + pass + ' pass · ' + fail + ' fail');
process.exit(fail ? 1 : 0);
