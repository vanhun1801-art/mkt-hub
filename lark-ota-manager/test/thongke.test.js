'use strict';
const TK = require('../thongke');

let pass = 0, fail = 0;
function t(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

console.log('— lead time / thời gian đặt trước');
const rows = [
  { trangThai: 'Đã xác nhận', ngayDat: '2026-09-01', ngayDi: '2026-09-01', tongKhach: 2, tienTe: 'VND' },
  { trangThai: 'Đã xác nhận', ngayDat: '2026-09-01', ngayDi: '2026-09-04', tongKhach: 2, tienTe: 'VND' },
  { trangThai: 'Đã hoàn thành', ngayDat: '2026-09-01', ngayDi: '2026-09-10', tongKhach: 1, tienTe: 'VND' },
  { trangThai: 'Chờ xác nhận', ngayDat: '', ngayDi: '2026-09-12', tongKhach: 1, tienTe: 'VND' },
  { trangThai: 'Đã huỷ', ngayDat: '2026-08-01', ngayDi: '2026-09-20', tongKhach: 5, tienTe: 'VND' },
];

const g = TK.gop(rows);
t('cùng ngày = 0', TK.soNgayDatTruoc(rows[0]) === 0);
t('01/09 → 04/09 = 3 ngày', TK.soNgayDatTruoc(rows[1]) === 3);
t('ngày đặt sau ngày đi bị loại', TK.soNgayDatTruoc({ ngayDat: '2026-09-05', ngayDi: '2026-09-04' }) === null);
t('trung bình = 4 ngày', g.datTruocTb === 4, String(g.datTruocTb));
t('trung vị = 3 ngày', g.datTruocTrungVi === 3, String(g.datTruocTrungVi));
t('chỉ tính 3 booking còn hiệu lực có đủ ngày', g.datTruocCoDuLieu === 3, String(g.datTruocCoDuLieu));
t('1 booking còn hiệu lực thiếu ngày', g.datTruocThieu === 1, String(g.datTruocThieu));
t('phân nhóm cùng ngày đúng', g.datTruocNhom.cungNgay === 1);
t('phân nhóm 1–3 ngày đúng', g.datTruocNhom.motDenBa === 1);
t('phân nhóm 8–14 ngày đúng', g.datTruocNhom.tamDenMuoiBon === 1);
t('booking huỷ không làm sai lead time', g.datTruocNhom.trenMuoiBon === 0);

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
