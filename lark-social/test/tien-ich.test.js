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

console.log('\ntiện ích — bắt lúc bấm Đăng');

t('không đòi nút phải nằm trong hộp thoại', () => {
  /* Siết như vậy là quá tay: Công cụ lập kế hoạch của Business Suite soạn bài
     trên cả trang, không phải trong hộp thoại. Bài hẹn giờ 10:30 của bạn Lý Thư
     Bạch mất trắng vì cú bấm Lên lịch bị bỏ qua — không để lại dấu vết nào. */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  assert.ok(!/role="dialog"\],form/.test(src), 'không còn điều kiện phải ở trong dialog');
});

t('nhớ đoạn chữ đang soạn, vì tới bước xác nhận thì ô soạn bài đã biến mất', () => {
  /* Luồng hẹn giờ đi nhiều bước: soạn bài → Lên lịch → chọn ngày giờ → xác
     nhận. Đến bước cuối ô soạn bài không còn trên màn hình, nên đi tìm lúc đó
     là tìm hụt. */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  assert.ok(/let vanCuoi = ''/.test(src), 'phải có biến nhớ');
  assert.ok(/addEventListener\('input'/.test(src), 'cập nhật liên tục khi người ta gõ');
  assert.ok(/chuSoanBai\(\) \|\| vanCuoi/.test(src), 'tìm hụt thì lấy bản nhớ');
  assert.ok(/vanCuoi = '';/.test(src), 'ghi xong phải xoá, không xài lại cho bài sau');
});

t('bấm Đăng mà không moi được chữ thì phải nói ra', () => {
  /* Im lặng bỏ qua là cách một bài biến mất mà không ai hay — một tháng sau
     chấm KPI mới phát hiện thiếu. */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  assert.ok(/không đọc được nội dung/.test(src), 'phải báo cho người đăng biết');
});

t('ô soạn bài có thể là textarea, và có thể nằm trong iframe', () => {
  /* Bắt được cú bấm nhưng "không đọc được nội dung" — đúng triệu chứng bạn Lý
     Thư Bạch gặp. Hai nguyên nhân: bản trước chỉ dò contenteditable và
     role=textbox nên gõ vào một <textarea> thường là không thấy gì; và
     Business Suite dựng khung soạn bài trong iframe, script ở trang ngoài
     không với tới. */
  const goc = require('path').join(__dirname, '..', 'extension');
  const src = require('fs').readFileSync(require('path').join(goc, 'content.js'), 'utf8');
  const mf = JSON.parse(require('fs').readFileSync(require('path').join(goc, 'manifest.json'), 'utf8'));

  assert.strictEqual(mf.content_scripts[0].all_frames, true, 'phải chạy trong mọi khung');
  assert.ok(/textarea/.test(src), 'phải dò cả textarea');
  assert.ok(/chrome\.storage\.local\.set\(\{ nhap:/.test(src),
    'bản nháp phải cất vào kho chung — khung có ô soạn bài ghi, khung có nút đọc');
  assert.ok(/await nhapTuKho\(\)/.test(src), 'lúc bấm phải đọc được bản nháp của khung khác');
  assert.ok(/Date\.now\(\) - \(n\.luc \|\| 0\) < 1800000/.test(src),
    'bản nháp quá nửa tiếng thì bỏ, không gán nhầm nội dung cũ cho bài mới');
});

t('chạy mọi khung nhưng chỉ vẽ bảng ở khung ngoài cùng', () => {
  /* Không chặn thì mỗi iframe một bảng, chồng lên nhau giữa màn hình. */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  assert.ok(/window\.top === window/.test(src), 'phải biết mình có phải khung chính không');
  assert.ok(/function ve\(\) \{\r?\n\s*if \(!laKhungChinh\) return;/.test(src),
    'vẽ bảng phải chặn ở khung con');
});

t('chụp bản nháp đều đặn, không chỉ dựa vào sự kiện gõ phím', () => {
  /* Luồng "Tạo thước phim" đi ba bước Tạo → Chỉnh sửa → Chia sẻ, caption ở
     trên còn nút hẹn giờ ở dưới, và Facebook dựng lại DOM sau mỗi bước. Chỉ
     nghe sự kiện gõ thì trượt khi người ta dán bằng chuột phải, khi caption
     được điền sẵn, hoặc khi tiện ích nạp sau lúc họ gõ xong. */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  assert.ok(/setInterval\(\(\) => \{\r?\n\s*const v = chuSoanBai\(\);/.test(src),
    'phải có nhịp chụp định kỳ');
  assert.ok(/v !== vanCuoi\) nhoNhap\(v\)/.test(src),
    'chữ không đổi thì đừng ghi lại kho — mỗi hai giây ghi một lần là phí');
});

t('phép thử "đang hiện" không được dùng offsetParent', () => {
  /* offsetParent LÀ NULL với mọi thứ nằm trong position:fixed — không phải chỉ
     với thứ bị ẩn. Khung soạn bài của Facebook nằm trong lớp phủ cố định, nên
     phép thử cũ loại bỏ ĐÚNG cái ô cần tìm. Đây là lý do bốn lần thử đều "bắt
     được nút nhưng không đọc được chữ". */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  assert.ok(!/if (!el.offsetParent)/.test(src), 'không còn dùng offsetParent làm phép thử');
  assert.ok(/getClientRects\(\)\.length/.test(src), 'dùng getClientRects — đúng cho cả fixed');
});

t('trượt thì phải nói trượt ở đâu', () => {
  /* "Không đọc được nội dung" thôi thì vòng sau lại đoán tiếp. Kèm số ô thấy
     được và độ dài lớn nhất là biết ngay: không thấy ô nào (sai bộ chọn) hay
     thấy ô mà rỗng (sai thời điểm). */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  assert.ok(/soO \+ ' ô soạn, dài nhất ' \+ daiNhat/.test(src),
    'cảnh báo phải kèm số ô và độ dài');
});

console.log('\n' + dat + ' phép thử đạt' + (hong ? ' — CÓ LỖI' : ''));
if (hong) process.exit(1);
