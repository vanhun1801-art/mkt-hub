'use strict';
/**
 * ============================================================================
 * ĐỔI THÁNG: KHÔNG ĐƯỢC ĐỂ THÁNG CŨ NẰM DƯỚI TIÊU ĐỀ THÁNG MỚI
 * ============================================================================
 * Anh Hùng gửi ảnh ngày 28/09/2026: thanh công cụ ghi "Tháng 09/2026" mà thẻ
 * lịch bên dưới vẫn ghi "Lê Văn Hùng · tháng 10/2026".
 *
 * Gốc: `nap()` đọc xong mới vẽ. Bấm đổi tháng thì `S.thang` đổi ngay (nên thanh
 * công cụ nhảy ngay), còn `#man` vẫn giữ nguyên HTML của tháng trước cho tới
 * khi dữ liệu về. Đo trong trình duyệt: lệch nhau khoảng 3 giây với tháng chưa
 * có trong bộ đệm.
 *
 * Ba giây nhìn lịch tháng 10 mà tưởng tháng 9 là đủ để xếp nhầm một ca trực.
 * Thà trống còn hơn sai — nên dọn màn và đặt khung xương ngay khi bấm.
 *
 * Đo lại sau khi sửa (tháng 05/2026, chưa từng đọc): từ 80ms đến ~1,8s là khung
 * xương, rồi ra đúng tháng 05 — không còn khoảnh khắc nào lệch.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '\n      ' + vi : '')); }
};

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const than = (ten) => {
  const i = src.indexOf(ten);
  if (i < 0) return '';
  let sau = 0, k = src.indexOf('{', i), het = k;
  for (; het < src.length; het++) {
    if (src[het] === '{') sau++;
    else if (src[het] === '}') { sau--; if (!sau) break; }
  }
  return src.slice(i, het + 1);
};

console.log('\nđổi tháng thì dọn màn, không để dữ liệu cũ');

ok('có màn chờ riêng cho lúc đang đọc', src.indexOf('function veCho(') >= 0);

const nap = than('async function nap(');
ok('tìm được thân hàm nap()', nap.length > 0);

/* Phải dọn TRƯỚC khi chờ mạng. Đặt sau `await` thì màn cũ vẫn đứng đó suốt
 * thời gian chờ — đúng cái đang hỏng. */
ok('gọi veCho() TRƯỚC lần await đầu tiên',
  nap.indexOf('veCho()') >= 0 && nap.indexOf('veCho()') < nap.indexOf('await'),
  'veCho ở ' + nap.indexOf('veCho()') + ', await đầu ở ' + nap.indexOf('await'));

/* Nhưng KHÔNG dọn khi chỉ là làm mới đúng thứ đang xem — dọn mọi lúc thì bấm
 * "làm mới" là màn nháy trắng một cái, khó chịu mà chẳng để làm gì. */
ok('chỉ dọn khi câu hỏi đổi, không dọn khi chỉ làm mới',
  /if \(khoaMan\(\) !== dangVe\) veCho\(\);/.test(nap));
ok('khoá màn gồm đủ tab + tháng + người đang xem hộ',
  /khoaMan = \(\) => \[S\.tab, S\.thang, S\.hoNguoi \|\| ''\]/.test(src));
ok('ghi lại câu hỏi đã vẽ sau khi vẽ xong', /ve\(\);\s*\n\s*dangVe = khoaMan\(\);/.test(src));
/* Đọc hỏng thì phải QUÊN đi, không thì lần bấm lại cùng tháng sẽ tưởng là đã
 * vẽ rồi và bỏ qua màn chờ, để nguyên câu lỗi trên màn. */
ok('đọc hỏng thì xoá dấu đã vẽ', /dangVe = '';/.test(nap));

/* Khung xương phải GIỮ ĐÚNG BỐ CỤC thật, không phải một khối xám: 5 thẻ số,
 * lưới 7 cột, và bảng cả phòng khi là quản lý. Sai bố cục thì lúc dữ liệu về
 * mọi thứ nhảy một cái — khó chịu hơn là không có khung xương. */
const cho = than('function veCho(');
ok('khung xương có hàng thẻ số như màn thật', /oSo\(5\)/.test(cho));
ok('khung xương có lưới lịch 7 cột', /class="lich"/.test(cho) && /35/.test(cho));
ok('khung xương có bảng cả phòng khi là quản lý', /laQL\(\)/.test(cho));
ok('đánh dấu aria-busy để máy đọc màn hình biết là đang chờ', /aria-busy="true"/.test(cho));

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
process.exit(fail ? 1 : 0);
