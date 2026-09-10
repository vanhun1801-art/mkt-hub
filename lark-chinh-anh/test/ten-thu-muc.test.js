'use strict';
/* Test thuần Node, không framework: `node test/ten-thu-muc.test.js`.
 *
 * Còn hai việc đáng test sau khi anh Hùng bỏ ô dán tên (10/09/2026): ghép tên thư
 * mục cho đúng quy ước, và sinh khoá chống trùng cho ổn định. Khoá là chỗ nguy hiểm
 * — sai một chút là hai lô khác nhau đè lên nhau trên Base, hoặc một lô đẻ hai dòng. */
const assert = require('assert');
const ttm = require('../ten-thu-muc');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

console.log('\nkhông dấu / gọn');

t('bỏ dấu tiếng Việt và ký tự phân cách', () => {
  assert.strictEqual(ttm.gon('1 TOUR ĐẢO'), '1tourdao');
  assert.strictEqual(ttm.gon('Rạch Vẹm'), 'rachvem');
  assert.strictEqual(ttm.gon('6. Dịch vụ media Đảo'), '6dichvumediadao');
});

t('đ và Đ đều về d — không thì "ĐẢO" không khớp "dao"', () => {
  assert.strictEqual(ttm.khongDau('ĐẢO'), 'dao');
  assert.strictEqual(ttm.khongDau('đảo'), 'dao');
});

console.log('\nghép tên thư mục');

t('ghép đúng quy ước "<TOUR> · <Loại> · <dd.mm.yyyy>"', () => {
  assert.strictEqual(ttm.dat({ tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: '2026-09-10' }),
    'TOUR ĐẢO · Ghép · 10.09.2026');
});

t('thiếu trường nào thì bỏ phần đó, không để dấu · lửng', () => {
  assert.strictEqual(ttm.dat({ tour: 'TOUR ĐẢO', loai: '', ngay: '' }), 'TOUR ĐẢO');
  assert.strictEqual(ttm.dat({ tour: '', loai: 'VIP', ngay: '2026-09-10' }), 'VIP · 10.09.2026');
});

t('ngày sai định dạng thì bỏ hẳn, không in chuỗi rác vào tên', () => {
  assert.strictEqual(ttm.ngayVietGon(''), '');
  assert.strictEqual(ttm.ngayVietGon('10/09/2026'), '');
  assert.strictEqual(ttm.dat({ tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: 'hôm nay' }),
    'TOUR ĐẢO · Ghép');
});

console.log('\nkhoá chống trùng');

t('khoá không phân biệt hoa thường và dấu — một lô chỉ có một khoá', () => {
  const a = ttm.khoa({ tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: '2026-09-10' });
  const b = ttm.khoa({ tour: 'Tour đảo', loai: 'ghép', ngay: '2026-09-10' });
  assert.strictEqual(a, b, 'sửa hoa/thường tên Tour trong Base là lô cũ thành lô mới');
  assert.strictEqual(a, 'tourdao|ghep|2026-09-10');
});

t('khác loại hoặc khác ngày là khác lô', () => {
  const g = ttm.khoa({ tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: '2026-09-10' });
  const v = ttm.khoa({ tour: 'TOUR ĐẢO', loai: 'VIP', ngay: '2026-09-10' });
  const h = ttm.khoa({ tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: '2026-09-11' });
  assert.notStrictEqual(g, v);
  assert.notStrictEqual(g, h);
});

t('không khai Loại thì rơi về "khac", không để khoá lửng', () => {
  assert.strictEqual(ttm.khoa({ tour: 'TOUR ĐẢO', loai: '', ngay: '2026-09-10' }),
    'tourdao|khac|2026-09-10');
});

t('thiếu tour hoặc ngày thì KHÔNG sinh khoá — khoá rỗng sẽ đè lẫn nhau', () => {
  assert.strictEqual(ttm.khoa({ tour: '', loai: 'Ghép', ngay: '2026-09-10' }), '');
  assert.strictEqual(ttm.khoa({ tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: '' }), '');
});

t('khoá chỉ lấy 10 ký tự đầu của ngày — giờ lọt vào là mỗi lần một khoá', () => {
  assert.strictEqual(ttm.khoa({ tour: 'A B', loai: 'Ghép', ngay: '2026-09-10 08:30:00' }),
    'ab|ghep|2026-09-10');
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
