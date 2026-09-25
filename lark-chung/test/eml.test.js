'use strict';
/**
 * ============================================================================
 * DỰNG THƯ MIME — không cần mạng
 * ============================================================================
 *
 *   node lark-chung/test/eml.test.js
 *
 * Lá thư này đi tới Ban Giám Đốc và tới KOL bên ngoài công ty. Hỏng ở đây
 * KHÔNG hiện ra lỗi: máy chủ nhận, Lark lưu nháp, chỉ có người mở thư ra mới
 * thấy tiêu đề vỡ dấu, tên tệp thành một dãy ký tự, hoặc thân thư rơi mất.
 * Nên chốt từng luật một, ngay từ lúc dựng.
 */
const eml = require('../eml');

let pass = 0, fail = 0;
const fails = [];
function ok(ten, dieu, chiTiet) {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (chiTiet ? ' → ' + chiTiet : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (chiTiet ? '\n         ' + chiTiet : ''));
  }
}
const nhom = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');
const CRLF = String.fromCharCode(13) + String.fromCharCode(10);

nhom('Chữ có dấu trong đầu mục phải mã theo RFC 2047');
/* Đưa thẳng tiếng Việt vào dòng Subject là hộp thư nhận được một dãy byte lạ
 * và hiện ra "Ä á»€ XUáº¤T…". */
ok('chữ thuần ASCII thì để nguyên, không mã thừa',
  eml.maDauMuc('Report September') === 'Report September', eml.maDauMuc('Report September'));
const md = eml.maDauMuc('ĐỀ XUẤT PHÊ DUYỆT CHI PHÍ NHẬP QUỸ MARKETING THÁNG 10/2026');
ok('chữ có dấu thì bọc =?UTF-8?B?…?=', /^=\?UTF-8\?B\?/.test(md), md.slice(0, 40));
ok('giải mã ngược ra đúng chữ ban đầu',
  md.split(CRLF + ' ').map((x) => Buffer.from(x.slice(10, -2), 'base64').toString('utf8')).join('')
  === 'ĐỀ XUẤT PHÊ DUYỆT CHI PHÍ NHẬP QUỸ MARKETING THÁNG 10/2026');
/* Một encoded-word tối đa 75 ký tự. Mã cả chuỗi rồi mới cắt là cắt giữa base64
 * — hỏng nguyên cụm. */
ok('mỗi mảnh đều dưới 75 ký tự',
  md.split(CRLF + ' ').every((x) => x.length <= 75),
  JSON.stringify(md.split(CRLF + ' ').map((x) => x.length)));
/* Cắt giữa một ký tự nhiều byte thì mảnh đó giải mã ra ký tự thay thế. */
ok('không cắt giữa ký tự nhiều byte',
  !eml.maDauMuc('Đ'.repeat(60)).split(CRLF + ' ')
    .map((x) => Buffer.from(x.slice(10, -2), 'base64').toString('utf8')).join('')
    .includes('�'));

nhom('Địa chỉ người nhận');
ok('chuỗi trần giữ nguyên', eml.diaChi('ceo@rootytrip.com') === 'ceo@rootytrip.com');
ok('có tên thì thành "Tên" <mail>',
  eml.diaChi({ email: 'a@b.c', ten: 'Rooty' }) === 'Rooty <a@b.c>', eml.diaChi({ email: 'a@b.c', ten: 'Rooty' }));
ok('tên có dấu thì mã, địa chỉ để nguyên',
  /^=\?UTF-8\?B\?.*\?= <a@b\.c>$/.test(eml.diaChi({ email: 'a@b.c', ten: 'Lê Văn Hùng' })),
  eml.diaChi({ email: 'a@b.c', ten: 'Lê Văn Hùng' }));
ok('nhiều địa chỉ ngăn bằng dấu phẩy',
  eml.dsDiaChi('a@b.c; d@e.f') === 'a@b.c, d@e.f', eml.dsDiaChi('a@b.c; d@e.f'));
ok('bỏ mục rỗng thay vì đẻ ra dấu phẩy thừa',
  eml.dsDiaChi(['a@b.c', '', null]) === 'a@b.c');

nhom('Thư KHÔNG đính kèm — một phần, text/html');
const t1 = eml.dungEml({
  tu: { email: 'cmo@rootytrip.com', ten: 'Rooty Trip Phú Quốc' },
  den: 'ceo@rootytrip.com',
  tieuDe: 'BÁO CÁO QUỸ MARKETING THÁNG 09',
  html: '<p>Kính gửi Ban Giám Đốc,</p>',
});
ok('có đủ đầu mục bắt buộc',
  /MIME-Version: 1\.0/.test(t1) && /^From: /m.test(t1) && /^To: ceo@rootytrip\.com/m.test(t1)
  && /^Date: /m.test(t1) && /^Subject: /m.test(t1), t1.slice(0, 200));
ok('khai text/html và base64', /Content-Type: text\/html; charset="UTF-8"/.test(t1)
  && /Content-Transfer-Encoding: base64/.test(t1));
ok('không có biên vì không có tệp nào', !/multipart/.test(t1));
/* Đầu mục và thân ngăn nhau bằng MỘT dòng trống — thiếu nó thì hộp thư đọc cả
 * thân thư thành đầu mục và thư hiện ra trắng trơn. */
const than1 = t1.split(CRLF + CRLF)[1];
ok('có dòng trống ngăn đầu mục với thân', !!than1);
ok('thân giải mã ra đúng nội dung',
  Buffer.from(than1.split(CRLF).join(''), 'base64').toString('utf8').includes('Kính gửi Ban Giám Đốc'));
ok('thân bọc trong khung html có khai charset',
  Buffer.from(than1.split(CRLF).join(''), 'base64').toString('utf8')
    .includes('<meta charset="utf-8">'));
ok('base64 cắt dòng 76 ký tự',
  eml.xepBase64(Buffer.alloc(300, 65)).split(CRLF).every((d) => d.length <= 76));

nhom('Thư CÓ đính kèm — multipart/mixed');
const tep = Buffer.from('PK\u0003\u0004 giả vờ là xlsx');
const t2 = eml.dungEml({
  tu: 'cmo@rootytrip.com', den: ['ceo@rootytrip.com'], cc: 'tentt@rootytrip.com',
  tieuDe: 'ĐỀ XUẤT NHẬP QUỸ', html: '<p>thân thư</p>',
  dinhKem: [{ ten: 'báo cáo quỹ tháng 9.xlsx', kieu: 'application/vnd.ms-excel', than: tep }],
});
const bien = (/boundary="([^"]+)"/.exec(t2) || [])[1];
ok('khai multipart/mixed kèm biên', /multipart\/mixed/.test(t2) && !!bien, String(bien));
ok('có Cc', /^Cc: tentt@rootytrip\.com/m.test(t2));
ok('đúng hai phần: thân + một tệp',
  t2.split('--' + bien).length - 1 === 3, String(t2.split('--' + bien).length - 1));
ok('kết thúc bằng biên đóng', t2.includes('--' + bien + '--'));
ok('tệp khai Content-Disposition: attachment', /Content-Disposition: attachment;/.test(t2));
/* Tên tệp có dấu phải khai HAI dạng: hộp thư cũ đọc filename=, hộp thư mới đọc
 * filename*=. Khai một dạng là luôn có một phía hiện tên vỡ. */
ok('tên tệp có dấu khai cả hai dạng',
  /filename="=\?UTF-8\?B\?/.test(t2) && /filename\*=UTF-8''/.test(t2),
  (/Content-Disposition:[^\r\n]*/.exec(t2) || [''])[0]);
ok('tên tệp giải ngược ra đúng chữ',
  decodeURIComponent((/filename\*=UTF-8''([^\r\n;]+)/.exec(t2) || [])[1]) === 'báo cáo quỹ tháng 9.xlsx');
const phanTep = t2.split('--' + bien)[2];
ok('nội dung tệp giữ nguyên từng byte',
  Buffer.from(phanTep.split(CRLF + CRLF)[1].trim().split(CRLF).join(''), 'base64').equals(tep));
ok('tệp rỗng thì bỏ qua, không đẻ ra phần trống',
  !/multipart/.test(eml.dungEml({ tu: 'a@b.c', den: 'd@e.f', tieuDe: 'x', html: 'y',
    dinhKem: [{ ten: 'rong.txt', than: Buffer.alloc(0) }] })));

nhom('Chốt an toàn');
let nem = '';
try { eml.dungEml({ tu: 'a@b.c', den: '', tieuDe: 'x', html: 'y' }); } catch (e) { nem = e.message; }
ok('không có người nhận thì ném lỗi có chữ, không dựng thư câm',
  /chưa có người nhận/i.test(nem), nem);
/* Mọi dòng trong thư MIME kết bằng CRLF — dùng LF trần thì một số máy chủ cắt
 * thư ở đúng chỗ đó. */
ok('mọi dòng kết bằng CRLF, không có LF trần',
  !/[^\r]\n/.test(t2.replace(/\r\n/g, '')), 'còn LF trần');
ok('raw mã base64url, không có ký tự + / =',
  !/[+/=]/.test(eml.sangRaw(t2)), eml.sangRaw(t2).slice(0, 40));
ok('raw giải ngược ra đúng lá thư',
  Buffer.from(eml.sangRaw(t2), 'base64url').toString('utf8') === t2);

nhom('Ngày kiểu RFC 5322, giờ Việt Nam');
const ng = eml.ngayThu(new Date('2026-09-25T02:30:00Z'));
ok('đổi sang +0700 và ghi đúng khuôn',
  ng === 'Fri, 25 Sep 2026 09:30:00 +0700', ng);

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
if (fail) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
