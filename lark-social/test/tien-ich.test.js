'use strict';
/* Thử phần suy luận của tiện ích Chrome bằng Node — không cần mở Facebook.
 * Hai hàm ở đây là chỗ đã hỏng thật hai lần trên máy người dùng. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const goc = {};
// eslint-disable-next-line no-new-func
new Function('self', fs.readFileSync(path.join(__dirname, '..', 'extension', 'loc.js'), 'utf8'))(goc);
const L = goc.RT_LOC;

let dat = 0; let hong = 0;
function t(ten, fn) {
  try { fn(); dat++; console.log('  ✓ ' + ten); } catch (e) {
    hong++; console.log('  ✗ ' + ten); console.log('    ' + e.message);
  }
}

console.log('tiện ích — rút tên người đăng');

t('cắt được ngày giờ dính liền sau tên', () => {
  /* Facebook chẻ dòng đó thành nhiều nút; ghép lại thì ngày giờ dính ngay sau
     tên, không có dấu cách: "Phương Ái10 Tháng 9 lúc 16:06". */
  assert.strictEqual(L.tachTen('Người đăng: Phương Ái10 Tháng 9 lúc 16:06'), 'Phương Ái');
  assert.strictEqual(L.tachTen('Rooty Trip Phú QuốcNgười đăng: Lý Thư Bạch19 Tháng 9'), 'Lý Thư Bạch');
});

t('có dấu chấm giữa thì cũng cắt đúng', () => {
  assert.strictEqual(L.tachTen('Người đăng: Võ Hằng · 2 giờ'), 'Võ Hằng');
});

t('chỉ có chữ "Người đăng:" mà chưa có tên thì trả rỗng', () => {
  /* Đây chính là lỗi làm bảng báo "đã thấy 0 bài" ở bản đầu: đọc từng nút chữ
     một thì nút đầu chỉ có nhãn, phần tên nằm ở nút khác. */
  assert.strictEqual(L.tachTen('Người đăng:'), '');
  assert.strictEqual(L.tachTen('Người đăng: '), '');
});

t('đoạn chữ không có nhãn thì trả rỗng, không đoán', () => {
  assert.strictEqual(L.tachTen('Rooty Trip Phú Quốc · 10 Tháng 9'), '');
  assert.strictEqual(L.tachTen(''), '');
});

t('tên dài bất thường thì bỏ, vì gần như chắc là bắt nhầm cả khối chữ', () => {
  assert.strictEqual(L.tachTen('Người đăng: ' + 'x'.repeat(80)), '');
});

console.log('\ntiện ích — so trùng hai lần bắt cùng một bài');

t('một bài bắt hai lần ở hai bước thì coi là một', () => {
  /* Luồng hẹn giờ bấm nhiều bước, mỗi bước chụp được một đoạn hơi khác nhau.
     Bản trước so 80 ký tự đầu nên trượt: MỘT bài đăng ra BỐN mục. */
  const b1 = 'Trúng kế VinWonders rồi... 💔🥹 #VinWonders #thuycung #RootyTrip';
  const b2 = 'Rooty Trip Phú Quốc Trúng kế VinWonders rồi... 💔🥹 #VinWonders #thuycung #RootyTrip Lên lịch';
  assert.strictEqual(L.trungNhau(b1, b2), true);
  assert.strictEqual(L.trungNhau(b2, b1), true, 'phải đối xứng');
});

t('khoảng trắng và hoa thường không làm lệch kết quả', () => {
  assert.strictEqual(L.trungNhau('Xin chào   Phú Quốc', 'xin chào phú quốc'), true);
});

t('hai bài khác nhau thì KHÔNG gộp', () => {
  assert.strictEqual(
    L.trungNhau('Show Tiên Cá Vinwonders Phú Quốc', 'Show diễn động vật Safari Phú Quốc'), false);
});

t('đoạn rỗng thì không bao giờ coi là trùng', () => {
  /* Không chặn thì mọi mục đều "trùng" với chuỗi rỗng và bài nào cũng bị nuốt. */
  assert.strictEqual(L.trungNhau('', 'bất kỳ'), false);
  assert.strictEqual(L.trungNhau('bất kỳ', ''), false);
  assert.strictEqual(L.trungNhau('', ''), false);
});

console.log('\n' + dat + ' phép thử đạt' + (hong ? ' — CÓ LỖI' : ''));
if (hong) process.exit(1);
