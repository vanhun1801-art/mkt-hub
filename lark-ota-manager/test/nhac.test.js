'use strict';
/**
 * Kiểm thử bộ nhắc CSKH trong luồng tin Booking KS (routine/nhac.js).
 * THUẦN TÍNH TOÁN — không mạng, không Base. Chạy: node test/nhac.test.js
 */
const N = require('../routine/nhac');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};
const luc = (s) => Date.parse(s.replace(' ', 'T') + ':00+07:00');
const GIO = '08:00-22:00';
const viec = (b, s) => N.canNhac(b, luc(s), { gioTruc: GIO });

const goc = {
  id: 'rec1', ma: 'PIOAAAAA1', maOta: '1700000001', kenh: 'Agoda', tenKhach: 'Kim Minji', quocGia: 'South Korea',
  trangThai: 'Đã đặt', ngayDat: '2026-11-07 10:00', nhanPhong: '2026-11-20', traPhong: '2026-11-22',
  tinNhom: 'om_1', nhacCskh: 'tin 2026-11-07 10:01', chamSoc: '', lyDoHuy: '', lichSu: '',
};

console.log('Nhận đơn');
t('vừa có tin: chỉ gửi mẫu chào', JSON.stringify(viec(goc, '2026-11-07 10:02')) === '["chao"]');
t('3 phút chưa ai nhận: nhắc cả nhóm', viec({ ...goc, nhacCskh: goc.nhacCskh + '\nchao 2026-11-07 10:02' }, '2026-11-07 10:04').includes('chua-nhan'));
t('đã đổi Chăm sóc: không nhắc', !viec({ ...goc, chamSoc: 'Đã nhắn chào' }, '2026-11-07 10:05').includes('chua-nhan'));
t('có người trả lời trong luồng: không nhắc', !viec({ ...goc, nhacCskh: goc.nhacCskh + '\nnhan ou_x' }, '2026-11-07 10:05').includes('chua-nhan'));
const daNhac = { ...goc, nhacCskh: goc.nhacCskh + '\nchao 2026-11-07 10:02\nchua-nhan 2026-11-07 10:04' };
t('nhắc rồi: chưa đủ 10 phút thì chưa báo quản lý', !viec(daNhac, '2026-11-07 10:10').length);
t('10 phút sau vẫn chưa ai nhận: báo quản lý', JSON.stringify(viec(daNhac, '2026-11-07 10:14')) === '["chua-nhan-ql"]');
t('báo quản lý một lần', !viec({ ...daNhac, nhacCskh: daNhac.nhacCskh + '\nchua-nhan-ql 2026-11-07 10:14' }, '2026-11-07 10:30').length);
const dem = { ...goc, nhacCskh: 'tin 2026-11-07 23:30\nchao 2026-11-07 23:30' };
t('ngoài giờ trực: không @ cả nhóm', !viec(dem, '2026-11-07 23:40').length);
t('sáng hôm sau 8:00: nhắc', viec(dem, '2026-11-08 08:00').includes('chua-nhan'));
t('đơn cũ không có dòng tin: không nhắc nhận đơn', !viec({ ...goc, nhacCskh: '' }, '2026-11-07 10:05').length);
t('chưa có tin nhóm: không nhắc gì', !viec({ ...goc, tinNhom: '' }, '2026-11-19 10:00').length);

console.log('Theo ngày ở');
const daNhan = { ...goc, chamSoc: 'Đã nhắn chào', nhacCskh: 'tin 2026-11-07 10:01\nchao 2026-11-07 10:02\nnhan ou_x' };
t('8:59 ngày trước: chưa nhắc', !viec(daNhan, '2026-11-19 08:59').length);
t('9:00 ngày trước ngày đến: nhắc', JSON.stringify(viec(daNhan, '2026-11-19 09:00')) === '["truoc-den"]');
t('đặt sát ngày (đặt hôm trước ngày đến): không nhắc trước ngày đến',
  !viec({ ...daNhan, ngayDat: '2026-11-19 07:00' }, '2026-11-19 09:30').includes('truoc-den'));
t('19:00 ngày nhận phòng: nhắc hỏi thăm', viec(daNhan, '2026-11-20 19:00').includes('hoi-tham'));
t('đã hỏi thăm rồi: không nhắc', !viec({ ...daNhan, chamSoc: 'Đã hỏi thăm khi ở' }, '2026-11-20 19:30').includes('hoi-tham'));
t('14:00 ngày trả phòng: nhắc xin đánh giá', viec({ ...daNhan, trangThai: 'Đã trả phòng' }, '2026-11-22 14:00').includes('xin-danh-gia'));
t('khách có vấn đề: không xin đánh giá', !viec({ ...daNhan, chamSoc: 'Có vấn đề' }, '2026-11-22 15:00').includes('xin-danh-gia'));
t('quá hạn hôm sau 22:00: thôi', !viec(daNhan, '2026-11-23 22:00').includes('xin-danh-gia'));

console.log('Huỷ');
const huy = { ...daNhan, trangThai: 'Đã huỷ', lichSu: '2026-11-08 09:00 · Đặt mới\n2026-11-10 14:00 · Huỷ' };
t('20 phút sau huỷ: chưa nhắc', !viec(huy, '2026-11-10 14:20').length);
t('30 phút sau huỷ chưa ghi lý do: nhắc', JSON.stringify(viec(huy, '2026-11-10 14:30')) === '["huy-ly-do"]');
t('đã ghi lý do: không nhắc', !viec({ ...huy, lyDoHuy: 'Giá' }, '2026-11-10 14:40').length);
t('đơn huỷ: không nhắc trước ngày đến', !viec(huy, '2026-11-19 09:30').length);

console.log('Nội dung');
t('khách Hàn: mẫu tiếng Hàn', N.mauTin('chao', goc).nn === 'ko' && /예약/.test(N.mauTin('chao', goc).chu));
t('khách Việt: mẫu tiếng Việt', N.mauTin('chao', { ...goc, quocGia: 'Vietnam' }).nn === 'vi');
t('quốc gia khác hoặc trống: tiếng Anh', N.mauTin('chao', { ...goc, quocGia: '' }).nn === 'en');
const chuaNhan = N.soanNhac('chua-nhan', goc, { goi: '<at user_id="all"></at>' });
t('nhắc chưa nhận có @ đầu tin', chuaNhan.startsWith('<at user_id="all"></at> '));
t('nhắc trước ngày đến có mẫu tin và ngày', /20\/11/.test(N.soanNhac('truoc-den', goc)) && /Mẫu tin tiếng Hàn/.test(N.soanNhac('truoc-den', goc)));
t('lời nhắc không bảo AI gửi khách', !/AI (đã )?gửi/.test(['chao', 'truoc-den', 'hoi-tham', 'xin-danh-gia'].map((l) => N.soanNhac(l, goc)).join(' ')));
t('đọc cột Nhắc CSKH', (() => { const n = N.docNhac('tin 2026-11-07 10:01\nnhan ou_a\nchao 2026-11-07 10:02'); return n.tin === '2026-11-07 10:01' && n.nhan === 'ou_a' && n.da.has('chao'); })());
t('giờ trực mặc định khi khai sai', JSON.stringify(N.khungTruc('sai')) === '[480,1320]');

console.log('Chạy một lượt (giả lập gửi)');
(async () => {
  const gui = [], ghi = [];
  const guiTin = { gui: async (o) => { gui.push(o); return o.text.startsWith('<at user_id="all">') ? { ok: false, loi: 'không được @ tất cả' } : { ok: true, msgId: 'om_x' }; } };
  const bang = { ghi: async (id, doi) => { ghi.push(doi); } };
  const kq = await N.chay({
    rows: [{ ...goc, nhacCskh: goc.nhacCskh }],
    bang, guiTin, guiQuanLy: async () => ({ ok: true }), docLuong: async () => '', nay: luc('2026-11-07 10:05'),
  });
  t('gửi mẫu chào và nhắc chưa nhận', kq.gui === 2, JSON.stringify(kq));
  t('@ tất cả bị chặn: gửi lại không @', gui.length === 3 && !gui[2].text.startsWith('<at'));
  t('mọi tin là trả lời trong luồng', gui.every((g) => g.traLoi === 'om_1' && g.trongLuong));
  t('ghi lại đã nhắc vào cột Nhắc CSKH', /chao 2026-11-07 10:05\nchua-nhan 2026-11-07 10:05$/.test(ghi[ghi.length - 1].nhacCskh));

  const gui2 = [];
  const kq2 = await N.chay({
    rows: [{ ...goc, nhacCskh: goc.nhacCskh + '\nchao 2026-11-07 10:02' }],
    bang, guiTin: { gui: async (o) => { gui2.push(o); return { ok: true }; } }, guiQuanLy: async () => ({ ok: true }),
    docLuong: async () => 'ou_nhan', nay: luc('2026-11-07 10:05'),
  });
  t('có người trả lời trong luồng: không nhắc, nhớ người nhận', kq2.gui === 0 && gui2.length === 0 && /nhan ou_nhan/.test(ghi[ghi.length - 1].nhacCskh));

  const gui3 = [];
  await N.chay({
    rows: [{ ...goc, nhacCskh: 'tin 2026-11-07 10:01\nchao 2026-11-07 10:02\nnhan ou_nhan', chamSoc: 'Đã nhắn chào' }],
    bang, guiTin: { gui: async (o) => { gui3.push(o); return { ok: true }; } }, guiQuanLy: async () => ({ ok: true }),
    docLuong: async () => { throw new Error('không được gọi'); }, nay: luc('2026-11-19 09:00'),
  });
  t('nhắc trước ngày đến @ đúng người đã nhận', gui3.length === 1 && gui3[0].text.startsWith('<at user_id="ou_nhan"></at>'));

  const N2 = require('../routine/nhac');
  const kq4 = await N2.chay({
    rows: [{ ...goc, nhacCskh: goc.nhacCskh + '\nchao 2026-11-07 10:02' }],
    bang, guiTin: { gui: async () => ({ ok: true }) }, guiQuanLy: async () => ({ ok: true }),
    docLuong: async () => { throw new Error('Lark 230027: no permission'); }, nay: luc('2026-11-07 10:05'),
  });
  t('không đọc được luồng: vẫn nhắc theo cột Base, ghi lỗi', kq4.gui === 1 && /230027/.test(N2.tinhTrang.docLuong));

  console.log(`\n${pass} đạt, ${fail} hỏng`);
  process.exit(fail ? 1 : 0);
})();
