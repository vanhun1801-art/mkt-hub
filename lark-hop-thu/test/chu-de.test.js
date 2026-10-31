'use strict';
/* Gom thư theo chủ đề (chu-de.js) và ghép trả lời theo chủ đề (ghepChuoi). */
const { chuanTieuDe, gomChuDe } = require('../chu-de');

let pass = 0, fail = 0;
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

ok('bỏ Re:/Fwd:/TL: lồng nhau', chuanTieuDe('RE: Fwd:  TL: Reply from SUNGHYWI IM (Nov 1-2, 2026)') === 'reply from sunghywi im (nov 1-2, 2026)');
ok('tiêu đề chung chung không dùng để gom', chuanTieuDe('Re: Báo giá') === '' && chuanTieuDe('Hello') === '' && chuanTieuDe('') === '');

const AG = 'notifications@agoda-messaging.com';
const td = 'Reply from SUNGHYWI IM (Nov 1-2, 2026)';
const den = [
  /* Agoda: mỗi tin của khách một chuỗi mới, cùng tiêu đề, cùng người gửi */
  { hop: 'pito@x', id: 'a1', chuoi: 't1', ngay: '2026-10-31 09:55', tu: { email: AG }, tieuDe: td },
  { hop: 'pito@x', id: 'a2', chuoi: 't2', ngay: '2026-10-31 10:21', tu: { email: AG }, tieuDe: td },
  { hop: 'pito@x', id: 'a3', chuoi: 't3', ngay: '2026-10-31 14:28', tu: { email: AG }, tieuDe: td },
  /* cùng tiêu đề nhưng ở hộp khác: không gom */
  { hop: 'sales@x', id: 'b1', chuoi: 't9', ngay: '2026-10-31 10:00', tu: { email: AG }, tieuDe: td },
  /* hai khách khác nhau cùng viết một tiêu đề: không gom */
  { hop: 'pito@x', id: 'c1', chuoi: 'u1', ngay: '2026-10-30 08:00', tu: { email: 'kha@gmail.com' }, tieuDe: 'Hỏi tour đảo ngày 5/11' },
  { hop: 'pito@x', id: 'c2', chuoi: 'u2', ngay: '2026-10-30 09:00', tu: { email: 'khb@gmail.com' }, tieuDe: 'Hỏi tour đảo ngày 5/11' },
  /* thư lẻ */
  { hop: 'pito@x', id: 'd1', chuoi: 'v1', ngay: '2026-10-29 08:00', tu: { email: 'x@y.z' }, tieuDe: 'Hello' },
  { hop: 'pito@x', id: 'd2', chuoi: 'v1', ngay: '2026-10-29 09:00', tu: { email: 'x@y.z' }, tieuDe: 'Re: Hello' },
];
const gui = [
  /* mình trả lời Agoda: Lark để chung chuỗi với thư a2 */
  { hop: 'pito@x', id: 'g1', chuoi: 't2', ngay: '2026-10-31 11:00', tieuDe: 'Re: ' + td },
  /* mình trả lời bằng chuỗi mới, chỉ khớp được theo tiêu đề */
  { hop: 'pito@x', id: 'g2', chuoi: 'w9', ngay: '2026-10-31 12:00', tieuDe: 'RE: ' + td },
  /* tiêu đề thuộc hai khách: không đoán, đứng riêng */
  { hop: 'pito@x', id: 'g3', chuoi: 'w8', ngay: '2026-10-30 10:00', tieuDe: 'Re: Hỏi tour đảo ngày 5/11' },
];
const cd = gomChuDe(den, gui);
const m = (h, id) => cd.get(h + '|' + id);

ok('Agoda nhiều chuỗi cùng tiêu đề gom một chủ đề', m('pito@x', 'a1') === m('pito@x', 'a2') && m('pito@x', 'a2') === m('pito@x', 'a3'));
ok('chủ đề gom từ nhiều chuỗi có mã td:', /^td:/.test(m('pito@x', 'a1')), m('pito@x', 'a1'));
ok('thư mình gửi cùng chuỗi vào luồng', m('pito@x', 'g1') === m('pito@x', 'a1'));
ok('thư mình gửi chuỗi mới, khớp tiêu đề, vào luồng', m('pito@x', 'g2') === m('pito@x', 'a1'));
ok('khác hộp thì khác chủ đề', m('sales@x', 'b1') !== m('pito@x', 'a1'));
ok('hai khách cùng tiêu đề là hai chủ đề', m('pito@x', 'c1') !== m('pito@x', 'c2'));
ok('thư gửi có tiêu đề trùng hai khách không bị đoán', m('pito@x', 'g3') !== m('pito@x', 'c1') && m('pito@x', 'g3') !== m('pito@x', 'c2'));
ok('một chuỗi Lark giữ nguyên mã chuỗi (sổ người lo cũ vẫn khớp)', m('pito@x', 'd1') === 'v1' && m('pito@x', 'd2') === 'v1');
ok('thư lẻ một mình giữ mã chuỗi', m('sales@x', 'b1') === 't9');
const lai = gomChuDe(den.slice().reverse(), gui.slice().reverse());
ok('mã chủ đề không đổi theo thứ tự đọc', lai.get('pito@x|a1') === m('pito@x', 'a1'));

const FORM = [
  { hop: 's@x', id: 'f1', chuoi: 'p1', ngay: '2026-10-30 08:00', tu: { email: 'web@rootytrip.com' }, tieuDe: 'Rootytrip "Liên hệ tư vấn"' },
  { hop: 's@x', id: 'f2', chuoi: 'p2', ngay: '2026-10-30 09:00', tu: { email: 'web@rootytrip.com' }, tieuDe: 'Rootytrip "Liên hệ tư vấn"' },
  { hop: 's@x', id: 'f3', chuoi: 'p3', ngay: '2026-10-30 09:00', tu: { email: 'ks@x' }, tieuDe: '[Booking mới] PITO Hòn Thơm · 2 phòng' },
  { hop: 's@x', id: 'f4', chuoi: 'p4', ngay: '2026-10-30 10:00', tu: { email: 'ks@x' }, tieuDe: '[Booking mới] PITO Hòn Thơm · 2 phòng' },
];
const cf = gomChuDe(FORM, [], { khongGom: (t) => t.tieuDe.startsWith('[Booking') });
ok('form web: mỗi lần gửi form là một khách, không gom', cf.get('s@x|f1') !== cf.get('s@x|f2'));
ok('thư bên gọi đánh dấu khongGom (đơn khách đặt) không gom theo tiêu đề', cf.get('s@x|f3') !== cf.get('s@x|f4'));

/* ghepChuoi theo chủ đề: Agoda a1, a2 đã được trả lời (g2 lúc 12:00), a3 thì chưa. */
process.env.HOP_THU_DU_LIEU = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'hop-thu-cd-'));
const { ghepChuoi } = require('../server');
const gan = (t) => Object.assign({}, t, { cd: cd.get(t.hop + '|' + t.id) });
const gc = ghepChuoi(den.map(gan), gui.map(gan));
ok('trả lời ở chuỗi khác vẫn tính là đã trả lời cả chủ đề', gc.daTraLoi.has('pito@x|a1') && gc.daTraLoi.has('pito@x|a2'));
ok('tin khách nhắn sau lần trả lời thì chưa trả lời', !gc.daTraLoi.has('pito@x|a3'));

console.log('\n' + pass + ' pass · ' + fail + ' fail');
process.exit(fail ? 1 : 0);
