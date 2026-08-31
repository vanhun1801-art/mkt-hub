/**
 * Test bộ đọc bản xuất Tourwell và bộ máy ghi công doanh thu.
 *
 * Đây là chỗ sai đắt nhất trong cả app: ghi công sai thì ra một con số ROAS nhìn
 * hợp lý mà sai, và người ta sẽ chuyển ngân sách theo nó.
 */
const tw = require('../sync/tourwell');
const roas = require('../sync/roas');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  ok  ' + name); }
  else { fail += 1; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('— đọc số tiền: phải chịu cả kiểu Anh và kiểu Việt');
/* Tourwell xuất '14,920,000'. Bản đầu của tôi dùng replace(',', '.') — chỉ đổi dấu
 * ĐẦU TIÊN — nên ra NaN rồi trả 0, và TOÀN BỘ cột Tổng tiền về 0 mà không báo lỗi. */
[
  ['14,920,000', 14920000], ['79,600,000', 79600000], ['8.874.258.200', 8874258200],
  ['1.234.567', 1234567], ['1,234,567.89', 1234567.89], ['1.234.567,89', 1234567.89],
  ['0,44', 0.44], ['1.5', 1.5], ['-1,000', -1000], ['0', 0], ['', 0], ['abc', 0],
  ['14.920 đ', 14920], ['₫1.234', 1234],
].forEach(([v, mong]) => t(`tien(${JSON.stringify(v)}) = ${mong}`, tw.tien(v) === mong, String(tw.tien(v))));

console.log('— đọc ngày');
t('31/08/2026 13:06:06', tw.ngay('31/08/2026 13:06:06') === '2026-08-31');
t('dạng ISO cũng nhận', tw.ngay('2026-08-31') === '2026-08-31');
t('rác ra rỗng', tw.ngay('hôm qua') === '' && tw.ngay('') === '');

/* ---------------- bộ máy ghi công ---------------- */
const BASE = {
  ads: [
    { id: 'recA', name: 'QC Facebook', extId: 'FB1', platform: 'Facebook' },
    { id: 'recB', name: 'QC TikTok', extId: 'TT1', platform: 'TikTok' },
  ],
  daily: [
    { adId: 'recA', date: '2026-08-10', spend: 1000000, platform: 'Facebook' },
    { adId: 'recB', date: '2026-08-10', spend: 2000000, platform: 'TikTok' },
    { adId: 'recA', date: '2026-07-01', spend: 9999999, platform: 'Facebook' }, // ngoài kỳ
  ],
};
const LEAD = [
  { ma: 'LU1', id: 1, kh: 'KL1', sdt: '0900000001', ngay: '2026-08-10' },
  { ma: 'LU2', id: 2, kh: 'KL2', sdt: '0900000002', ngay: '2026-08-10' },
  { ma: 'LU3', id: 3, kh: 'KL3', sdt: '0900000003', ngay: '2026-08-10' },
  // cùng số điện thoại với LU3, ngày sau — bẫy khách quay lại
  { ma: 'LU4', id: 4, kh: 'KL4', sdt: '0900000003', ngay: '2026-08-25' },
];
const DON = [
  { ma: 'RT1', kh: 'KL1', ngay: '2026-08-11', tien: 10000000, thu: 5000000 },
  { ma: 'RT2', kh: 'KL2', ngay: '2026-08-01', tien: 7000000, thu: 7000000 },   // TRƯỚC lead
  { ma: 'RT3', kh: 'KL3', ngay: '2026-08-12', tien: 3000000, thu: 0 },
  { ma: 'RT4', kh: 'KL1', ngay: '2026-11-30', tien: 5000000, thu: 0 },          // quá cửa sổ
  { ma: 'RT5', kh: 'KLX', ngay: '2026-08-12', tien: 4000000, thu: 0 },          // không thuộc lead nào
];
const KY = { data: BASE, from: '2026-08-01', to: '2026-08-31', cuaSo: 60 };
const tim = (r, adId, duong) => r.rows.find((x) => x.adId === adId && x.duong === duong);

console.log('— đường POS: khoá cứng');
let r = roas.tinh({ ...KY, leadRows: LEAD, donRows: DON, posRows: [{ leadId: 1, adId: 'FB1' }] });
t('ghi công đúng quảng cáo', !!tim(r, 'FB1', 'POS'), JSON.stringify(r.rows));
t('doanh thu đúng', tim(r, 'FB1', 'POS').tien === 10000000, String(tim(r, 'FB1', 'POS').tien));
t('tiền đã thu tách riêng', tim(r, 'FB1', 'POS').thu === 5000000);
t('chi tiêu chỉ tính trong kỳ, không lấy tháng 7',
  tim(r, 'FB1', 'POS').spend === 1000000, String(tim(r, 'FB1', 'POS').spend));
t('ROAS = 10.000.000 / 1.000.000', tim(r, 'FB1', 'POS').roas === 10);
t('đơn quá cửa sổ (RT4, 111 ngày) KHÔNG được tính',
  tim(r, 'FB1', 'POS').don === 1, String(tim(r, 'FB1', 'POS').don));

console.log('— đơn tạo TRƯỚC lead không được ghi công');
r = roas.tinh({ ...KY, leadRows: LEAD, donRows: DON, posRows: [{ leadId: 2, adId: 'FB1' }] });
t('LU2 có đơn RT2 ngày 01/08 trước lead 10/08 → không ghi công',
  r.rows.length === 0, JSON.stringify(r.rows));

console.log('— lead quy về NHIỀU quảng cáo thì không ghi công cho ai');
r = roas.tinh({ ...KY, leadRows: LEAD, donRows: DON,
  posRows: [{ leadId: 1, adId: 'FB1' }, { leadId: 1, adId: 'TT1' }] });
t('không ghi công', r.rows.length === 0, JSON.stringify(r.rows));
t('và được đếm ra ở nhapNhangPOS', r.nhat.nhapNhangPOS === 1, String(r.nhat.nhapNhangPOS));

console.log('— đường hội thoại: khoá số điện thoại');
r = roas.tinh({ ...KY, leadRows: LEAD, donRows: DON, posRows: [],
  hoiThoaiRows: [{ adIds: ['TT1'], sdt: ['0900000001'], ngay: '2026-08-10' }] });
t('ghép được qua số điện thoại', !!tim(r, 'TT1', 'hội thoại'));
t('nhãn đường ghép là "hội thoại"', tim(r, 'TT1', 'hội thoại').duong === 'hội thoại');
t('doanh thu đúng', tim(r, 'TT1', 'hội thoại').tien === 10000000);

console.log('— hội thoại mang nhiều ad_ids thì bỏ, không gán bừa');
r = roas.tinh({ ...KY, leadRows: LEAD, donRows: DON, posRows: [],
  hoiThoaiRows: [{ adIds: ['TT1', 'FB1'], sdt: ['0900000001'], ngay: '2026-08-10' }] });
t('không ghi công', r.rows.length === 0);
t('đếm ra ở nhapNhangHoiThoai', r.nhat.nhapNhangHoiThoai === 1);

console.log('— một số điện thoại nhiều lead: chọn lead gần nhất TRƯỚC hội thoại');
/* Khách quay lại sau vài tháng thì lead mới không phải cái sinh ra bởi hội thoại
 * này. Chọn lead mới nhất tuyệt đối là gán doanh thu cũ cho quảng cáo mới. */
r = roas.tinh({ ...KY, leadRows: LEAD, donRows: DON, posRows: [],
  hoiThoaiRows: [{ adIds: ['TT1'], sdt: ['0900000003'], ngay: '2026-08-11' }] });
t('chọn LU3 (10/08) chứ không phải LU4 (25/08)',
  tim(r, 'TT1', 'hội thoại') && tim(r, 'TT1', 'hội thoại').tien === 3000000,
  JSON.stringify(r.rows.map((x) => [x.adId, x.tien])));

console.log('— MỘT đơn chỉ được ghi công MỘT lần, đường POS ưu tiên');
r = roas.tinh({ ...KY, leadRows: LEAD, donRows: DON,
  posRows: [{ leadId: 1, adId: 'FB1' }],
  hoiThoaiRows: [{ adIds: ['TT1'], sdt: ['0900000001'], ngay: '2026-08-10' }] });
t('chỉ một dòng có doanh thu', r.rows.length === 1, JSON.stringify(r.rows.map((x) => [x.adId, x.duong, x.tien])));
t('và đó là dòng POS', r.rows[0].duong === 'POS');
t('tổng doanh thu không bị nhân đôi', r.tong.tien === 10000000, String(r.tong.tien));

console.log('— tổng theo kênh dùng chi tiêu CẢ KỲ, không chỉ phần ghép được');
r = roas.tinh({ ...KY, leadRows: LEAD, donRows: DON, posRows: [{ leadId: 1, adId: 'FB1' }] });
const fb = r.theoKenh.find((x) => x.nenTang === 'Facebook');
const tt = r.theoKenh.find((x) => x.nenTang === 'TikTok');
t('Facebook: chi tiêu cả kỳ 1tr', fb.spendKy === 1000000, String(fb.spendKy));
t('Facebook ROAS 10', fb.roas === 10);
t('Facebook phủ 100%', fb.phu === 1);
t('TikTok có chi tiêu nhưng 0 doanh thu → ROAS 0, không phải null',
  tt.spendKy === 2000000 && tt.roas === 0, JSON.stringify(tt));
t('TikTok phủ 0%', tt.phu === 0);

console.log('— đơn không thuộc lead nào được đếm ra, không im lặng bỏ');
t('4 đơn không ghép được', r.donKhongGhep.so === 4, String(r.donKhongGhep.so));
t('kèm số tiền', r.donKhongGhep.tien === 7000000 + 3000000 + 5000000 + 4000000,
  String(r.donKhongGhep.tien));

console.log('— quảng cáo không có trong Base vẫn hiện, không bị bỏ');
r = roas.tinh({ ...KY, leadRows: LEAD, donRows: DON, posRows: [{ leadId: 1, adId: 'LA_GI_DAY' }] });
t('vẫn có dòng', r.rows.length === 1);
t('đánh dấu chưa có trong Base', r.rows[0].coTrongBase === false);
t('chi tiêu 0 nên ROAS null chứ không phải Infinity', r.rows[0].roas === null);

console.log('— dữ liệu rỗng không làm sập');
r = roas.tinh({ data: { ads: [], daily: [] }, leadRows: [], donRows: [], posRows: [], hoiThoaiRows: [] });
t('trả về bảng rỗng', r.rows.length === 0 && r.tong.tien === 0);
t('ROAS null khi không có chi tiêu', r.tong.roas === null);

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
