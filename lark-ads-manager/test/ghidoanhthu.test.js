/**
 * Test phần ghi doanh thu lên Base.
 *
 * Vì sao đáng có bộ riêng: đây là phần GHI vào Base thật của công ty. Ba cách
 * hỏng, cả ba đều không ném lỗi mà chỉ làm dữ liệu sai:
 *
 * 1. Ghi một option lạ vào cột select thì Lark TỰ THÊM option đó vào schema —
 *    tức là phần mềm tự ý sửa cấu trúc bảng của người dùng.
 * 2. Không có khoá thì mỗi lượt ghi lại là NHÂN ĐÔI bảng.
 * 3. Lấy kênh từ trường Nguồn của Tourwell thì sai — đã chứng minh: 996/1000 lead
 *    mang cùng một nhãn, và LU1995/LU1996 mang nhãn TikTok nhưng đơn POS đến từ
 *    page Facebook.
 */
const g = require('../sync/ghidoanhthu');
const cfg = require('../config');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const F = cfg.tables.sales.f;

console.log('— cột Kênh: chỉ được là một trong bốn option CÓ SẴN trên Base');
t('bốn option khớp đúng schema thật',
  JSON.stringify(g.CHUAN_KENH) === JSON.stringify(['Facebook', 'TikTok', 'Google Ads', 'Khác']),
  JSON.stringify(g.CHUAN_KENH));
[['Facebook', 'Facebook'], ['TikTok', 'TikTok'], ['Google Ads', 'Google Ads'],
 ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['Google', 'Google Ads'],
 ['', 'Khác'], [null, 'Khác'], ['Zalo', 'Khác'], ['Instagram', 'Khác'],
].forEach(([vao, ra]) => t(`"${vao}" → ${ra}`, g.kenh(vao) === ra, g.kenh(vao)));
t('KHÔNG BAO GIỜ trả ra option lạ',
  ['x', 'Shopee', 'ABC', undefined].every((v) => g.CHUAN_KENH.includes(g.kenh(v))));

console.log('— cột Trạng thái: cũng chỉ ba option có sẵn');
t('ba option khớp schema thật',
  JSON.stringify(g.CHUAN_TRANG_THAI) === JSON.stringify(['Đã chốt', 'Đang tư vấn', 'Hủy']));
/* Tiếng Việt đặt dấu ở nhiều vị trí: "hủy" là h+ủ+y, "huỷ" là h+u+ỷ. Mẫu đầu tiên
 * tôi viết `hu[ỷy]` nên bỏ sót "hủy" — dạng phổ biến nhất. */
t('"Đã hủy" (dấu ở ủ)', g.trangThai({ trangThai: 'Đã hủy', tien: 9e6 }) === 'Hủy');
t('"Đã huỷ" (dấu ở ỷ)', g.trangThai({ trangThai: 'Đã huỷ', tien: 9e6 }) === 'Hủy');
t('"Cancelled"', g.trangThai({ trangThai: 'Cancelled', tien: 9e6 }) === 'Hủy');
t('có ngày huỷ thì là Hủy dù chuỗi không nói',
  g.trangThai({ trangThai: 'Hoàn thành', tien: 9e6, ngayHuy: '2026-08-10' }) === 'Hủy');
t('có tiền, không huỷ → Đã chốt', g.trangThai({ tien: 5e6 }) === 'Đã chốt');
t('không tiền → Đang tư vấn', g.trangThai({ tien: 0 }) === 'Đang tư vấn');
t('giữ nguyên nếu Tourwell đã dùng đúng chữ',
  g.trangThai({ trangThai: 'Đang tư vấn', tien: 0 }) === 'Đang tư vấn');
t('không bao giờ trả option lạ',
  ['abc', '', 'Chờ xử lý'].every((v) => g.CHUAN_TRANG_THAI.includes(g.trangThai({ trangThai: v, tien: 1 }))));

console.log('— giờ ghi vào Base phải là 00:00 giờ Việt Nam');
t('15/08 → 14/08 17:00 UTC', g.gioBase('2026-08-15') === '2026-08-14 17:00:00', g.gioBase('2026-08-15'));
t('ngày rác → rỗng, không ghi giờ bịa', g.gioBase('xx') === '' && g.gioBase('') === '');

console.log('— dựng một dòng Base');
const don = { ma: 'RT16142', kh: 'KL15961', khach: 'Nguyễn Văn A', sdt: '0900000001',
  ngay: '2026-08-15', ngayXong: '2026-08-16', tien: 1600000, thu: 0,
  nguon: 'Tiktok Rooty Trip Phú Quốc', trangThai: '', ban: 'Trần B' };
let o = g.dongBase(don, { platform: 'Facebook', tenQC: 'IS_Giá chưa tới 1 củ', maLead: 'LU2011' }, F);
t('mã đơn vào đúng cột khoá', o[F.orderCode] === 'RT16142');
t('tiền đúng', o[F.revenue] === 1600000);
t('tên khách đúng', o[F.customer] === 'Nguyễn Văn A');
t('trạng thái suy ra Đã chốt', o[F.status] === 'Đã chốt');
/* Điểm cốt lõi: kênh lấy từ GHI CÔNG, không lấy trường Nguồn của Tourwell. */
t('KÊNH lấy từ ghi công (Facebook), KHÔNG phải Nguồn Tourwell (Tiktok)',
  o[F.channel] === 'Facebook', o[F.channel]);
t('ngày ưu tiên ngày thành công', o[F.time] === '2026-08-15 17:00:00', o[F.time]);
t('ghi chú có mã đơn, mã lead và tên quảng cáo',
  o[F.note].includes('RT16142') && o[F.note].includes('LU2011')
  && o[F.note].includes('IS_Giá chưa tới 1 củ'), o[F.note]);
t('ghi chú giữ luôn nguồn Tourwell để đối chiếu bằng mắt',
  o[F.note].includes('Tiktok Rooty Trip'), o[F.note]);

o = g.dongBase(don, null, F);
t('không ghi công được thì kênh là Khác, KHÔNG đoán theo Nguồn',
  o[F.channel] === 'Khác', o[F.channel]);

console.log('— KHÔNG ghi cột "Tên dịch vụ sử dụng"');
/* Cột đó có 6 option là tên tour cụ thể của công ty; tên dịch vụ bên Tourwell
 * không khớp, ghi vào là Lark tự thêm option lạ vào schema. */
t('không có cột dịch vụ trong dòng ghi', !(F.service in o), JSON.stringify(Object.keys(o)));
t('không ghi cột Nhân viên Sales (cần Lark user id, không map được)', !(F.staff in o));
t('không ghi cột Ngày (khóa) — đó là formula, chỉ đọc', !(F.dateKey in o));

console.log('— kế hoạch ghi: có khoá nên ghi lại KHÔNG nhân đôi bảng');
const dons = [
  { ma: 'RT1', khach: 'A', tien: 1e6, ngay: '2026-08-01' },
  { ma: 'RT2', khach: 'B', tien: 2e6, ngay: '2026-08-02' },
  { ma: 'RT2', khach: 'B lần hai', tien: 2e6, ngay: '2026-08-02' },
  { ma: '', khach: 'không mã', tien: 5e6 },
];
let kh = g.lenKeHoach({ donRows: dons, F });
t('tạo mới đúng 2 dòng', kh.taoMoi.length === 2, String(kh.taoMoi.length));
t('không có dòng nào để sửa', kh.capNhat.length === 0);
t('bỏ đơn trùng trong nguồn và đơn không mã', kh.boQua.length === 2, JSON.stringify(kh.boQua));

kh = g.lenKeHoach({ donRows: dons, daCo: new Map([['RT1', 'recAAA']]), F });
t('đơn đã có trên Base thì SỬA, không tạo lại',
  kh.capNhat.length === 1 && kh.capNhat[0].record_id === 'recAAA', JSON.stringify(kh.capNhat.map((x) => x.record_id)));
t('còn lại vẫn tạo mới', kh.taoMoi.length === 1);

console.log('— dòng trên Base mà nguồn không còn: BÁO ra, KHÔNG xoá');
kh = g.lenKeHoach({ donRows: [{ ma: 'RT1', tien: 1e6 }],
  daCo: new Map([['RT1', 'rec1'], ['RT_CU', 'rec2']]), F });
t('nêu đúng dòng không còn trong nguồn',
  kh.khongConNguon.length === 1 && kh.khongConNguon[0] === 'RT_CU', JSON.stringify(kh.khongConNguon));
t('và KHÔNG có danh sách xoá nào trong kế hoạch',
  !('xoa' in kh) && !('delete' in kh), JSON.stringify(Object.keys(kh)));

console.log('— tóm tắt để xem trước');
const tt = g.tomTat(g.lenKeHoach({ donRows: dons, F }));
t('đếm đúng số tạo mới', tt.taoMoi === 2);
t('có tổng tiền để đối chiếu bằng mắt', tt.tongTien === 3000000, String(tt.tongTien));

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
