'use strict';
/* Test thuần Node, không framework: `node test/ten-thu-muc.test.js`.
 *
 * Đây là module đáng test nhất của app: nó đọc tên thư mục do người gõ tay, và
 * tên thư mục thật thì bừa hơn mọi thứ mình tưởng tượng. Mỗi phép thử dưới đây
 * là một kiểu bừa có thật hoặc rất dễ xảy ra. */
const assert = require('assert');
const ttm = require('../ten-thu-muc');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

/* Đúng danh mục seed vào Base. */
const TOURS = ['TOUR ĐẢO', 'LAND TOUR', 'RẠCH VẸM', 'GRAND WORLD', 'MARKETING',
  'DỊCH VỤ MEDIA ĐẢO', 'GOPRO', 'THUÊ MEDIA', 'KHÁCH SẠN', 'PHÁO HOA', 'SỰ KIỆN',
  'BỘ MẪU ẢNH', 'MẪU MEDIA', 'KHÁC'];

console.log('\nkhông dấu / gọn');

t('bỏ dấu tiếng Việt và số thứ tự đầu tên', () => {
  assert.strictEqual(ttm.gon('1 TOUR ĐẢO'), '1tourdao');
  assert.strictEqual(ttm.gon('Rạch Vẹm'), 'rachvem');
  assert.strictEqual(ttm.gon('6. Dịch vụ media Đảo'), '6dichvumediadao');
});

t('đ và Đ đều về d — không thì "ĐẢO" không khớp "dao"', () => {
  assert.strictEqual(ttm.khongDau('ĐẢO'), 'dao');
  assert.strictEqual(ttm.khongDau('đảo'), 'dao');
});

console.log('\nđọc Tour');

t('nhận tour dù viết hoa, viết thường, có số thứ tự', () => {
  assert.strictEqual(ttm.docTour('1 TOUR ĐẢO', TOURS), 'TOUR ĐẢO');
  assert.strictEqual(ttm.docTour('tour dao ghep', TOURS), 'TOUR ĐẢO');
  assert.strictEqual(ttm.docTour('TOURDAO-VIP-10.09', TOURS), 'TOUR ĐẢO');
});

t('LAND TOUR không bị nhận thành TOUR ĐẢO — lấy tên khớp DÀI NHẤT', () => {
  assert.strictEqual(ttm.docTour('2 LAND TOUR VIP 05.09.2026', TOURS), 'LAND TOUR');
});

t('không có tour nào khớp thì trả rỗng, không đoán bừa', () => {
  assert.strictEqual(ttm.docTour('anh cuoi nha hang', TOURS), '');
});

console.log('\nđọc Loại');

t('ghép / gộp / chung đều là Ghép', () => {
  assert.strictEqual(ttm.docLoai('TOUR ĐẢO ghép 10.09'), 'Ghép');
  assert.strictEqual(ttm.docLoai('tour dao gop'), 'Ghép');
});

t('VIP nhận cả khi viết thường hoặc là "riêng"', () => {
  assert.strictEqual(ttm.docLoai('tour dao vip'), 'VIP');
  assert.strictEqual(ttm.docLoai('TOUR ĐẢO RIÊNG 10.09'), 'VIP');
});

t('VIP thắng khi tên có cả hai chữ — nhóm VIP quan trọng hơn, đọc sai là gửi sai', () => {
  assert.strictEqual(ttm.docLoai('TOUR ĐẢO ghép VIP'), 'VIP');
});

console.log('\nđọc ngày');

t('nhận d.m.yyyy · d/m/yy · d-m', () => {
  assert.strictEqual(ttm.docNgay('10.09.2026'), '2026-09-10');
  assert.strictEqual(ttm.docNgay('5/9/26'), '2026-09-05');
  assert.strictEqual(ttm.docNgay('TOUR ĐẢO 5-9', '2026-09-20'), '2026-09-05');
});

t('thiếu năm mà ngày rơi vào tương lai xa thì hiểu là năm trước', () => {
  // Đang là tháng 1/2027 mà thư mục ghi 20.12 → đó là 12/2026, không phải 12/2027
  assert.strictEqual(ttm.docNgay('20.12', '2027-01-05'), '2026-12-20');
});

t('ngày/tháng vô lý thì trả rỗng', () => {
  assert.strictEqual(ttm.docNgay('40.13.2026'), '');
  assert.strictEqual(ttm.docNgay('khong co ngay'), '');
});

t('bỏ link ra trước khi đọc — ID trong URL không được thành ngày', () => {
  const r = ttm.doc('https://photos.app.goo.gl/aB3c9/12.34.5678 TOUR ĐẢO ghép 10.09.2026', TOURS);
  assert.strictEqual(r.ngay, '2026-09-10');
  assert.strictEqual(r.tour, 'TOUR ĐẢO');
});

console.log('\nghép tên và khoá');

t('ghép tên thư mục chuẩn', () => {
  assert.strictEqual(ttm.dat({ tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: '2026-09-10' }),
    'TOUR ĐẢO · Ghép · 10.09.2026');
});

t('thiếu trường nào thì bỏ phần đó, không để dấu · lửng', () => {
  assert.strictEqual(ttm.dat({ tour: 'TOUR ĐẢO', loai: '', ngay: '' }), 'TOUR ĐẢO');
  assert.strictEqual(ttm.dat({ tour: '', loai: 'VIP', ngay: '2026-09-10' }), 'VIP · 10.09.2026');
});

t('khoá không phân biệt hoa thường và dấu — một lô chỉ có một khoá', () => {
  const a = ttm.khoa({ tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: '2026-09-10' });
  const b = ttm.khoa({ tour: 'Tour đảo', loai: 'ghép', ngay: '2026-09-10' });
  assert.strictEqual(a, b);
  assert.strictEqual(a, 'tourdao|ghep|2026-09-10');
});

t('khác loại hoặc khác ngày là khác lô', () => {
  const g = ttm.khoa({ tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: '2026-09-10' });
  const v = ttm.khoa({ tour: 'TOUR ĐẢO', loai: 'VIP', ngay: '2026-09-10' });
  const h = ttm.khoa({ tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: '2026-09-11' });
  assert.notStrictEqual(g, v);
  assert.notStrictEqual(g, h);
});

t('thiếu tour hoặc ngày thì KHÔNG sinh khoá — khoá rỗng sẽ đè lẫn nhau', () => {
  assert.strictEqual(ttm.khoa({ tour: '', loai: 'Ghép', ngay: '2026-09-10' }), '');
  assert.strictEqual(ttm.khoa({ tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: '' }), '');
});

t('đọc trọn một tên thư mục thật', () => {
  assert.deepStrictEqual(ttm.doc('4 GRAND WORLD - VIP - 08.09.2026', TOURS),
    { tour: 'GRAND WORLD', loai: 'VIP', ngay: '2026-09-08' });
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
