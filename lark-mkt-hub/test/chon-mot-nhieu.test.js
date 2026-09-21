'use strict';
/**
 * $ LẤY MỘT, $$ LẤY NHIỀU — gõ nhầm một ký tự là hỏng lặng lẽ.
 *
 * Chuyện đã xảy ra ở màn hình phân quyền: dùng $ thay vì $$ để lấy danh sách ô
 * tick kênh Social. Kết quả là MỘT thẻ <input>, mà .length của một thẻ input là
 * undefined — nên cả khối lưu kênh bị bỏ qua không một tiếng động: quản lý tick
 * kênh rồi bấm Lưu, thấy báo "Đã lưu" mà Base không hề đổi. Khi danh sách kênh
 * nạp hỏng thì còn tệ hơn — $ trả null, null.length ném lỗi ra tận catch ngoài,
 * người dùng thấy "không lưu được" dù quyền đã lưu xong.
 *
 * Không kiểu tĩnh nào bắt được chuyện này, nên bắt bằng cách đọc chữ: một phần
 * tử DOM không bao giờ có .length, .filter, .map… — thấy là gõ nhầm $.
 *
 * Bắt cả hai lối viết: gọi thẳng $(…).filter(, và gán ra biến rồi mới dùng
 * const o = $(…); if (o.length) — lối thứ hai chính là lối đã lọt lần trước.
 *
 * Chạy: node test/chon-mot-nhieu.test.js
 */
const fs = require('fs');
const path = require('path');

const GOC = path.join(__dirname, '..', '..');

/* Thứ chỉ mảng mới có. $(…).value, .checked, .classList thì bình thường. */
const CUA_MANG = ['length', 'filter', 'map', 'forEach', 'some', 'every',
  'slice', 'concat', 'join', 'sort', 'reduce'];
const THANG = /(?<!\$)\$\([^()]*\)\s*\.\s*(length|filter|map|forEach|some|every|slice|concat|join|sort|reduce)\b/g;
/* Phải kết thúc bằng `);` — `const ten = $('#x').value.trim()` cho ra CHUỖI, mà
 * chuỗi thì .length là chuyện bình thường. */
const QUA_BIEN = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?<!\$)\$\([^()]*\)\s*;/g;
const KHAI_HAI = /\$\$\s*=[^\n]*querySelectorAll/;

/* Ký tự ngay trước/sau tên biến: là chữ thì đó là biến KHÁC, chỉ trùng đuôi. */
const laChu = (c) => /[\w$]/.test(c || '');
const soDong = (s, i) => s.slice(0, i).split('\n').length;

let pass = 0, fail = 0;
const loi = [];

for (const app of fs.readdirSync(GOC).filter((d) => d.startsWith('lark-'))) {
  const thuMuc = path.join(GOC, app, 'public');
  if (!fs.existsSync(thuMuc)) continue;
  const teps = fs.readdirSync(thuMuc).filter((x) => x.endsWith('.js'));
  /* Chỉ soi app thật sự theo quy ước $ / $$. App không khai $$ thì $ của nó có
   * thể là thư viện khác, kết luận ở đây sẽ sai. */
  if (!teps.some((t) => KHAI_HAI.test(fs.readFileSync(path.join(thuMuc, t), 'utf8')))) continue;

  for (const tep of teps) {
    const s = fs.readFileSync(path.join(thuMuc, tep), 'utf8');
    const ten = app + '/public/' + tep;
    let m;

    THANG.lastIndex = 0;
    while ((m = THANG.exec(s))) loi.push(ten + ':' + soDong(s, m.index) + '  ' + m[0].trim());

    QUA_BIEN.lastIndex = 0;
    while ((m = QUA_BIEN.exec(s))) {
      const bien = m[1];
      /* Cửa sổ soi: từ chỗ khai tới chỗ khai lại cùng tên, và tối đa 40 dòng.
       * Tên như `o`, `ds`, `moi` được dùng lại khắp tệp; soi tới cuối tệp là
       * quy tội cho một biến khác trùng tên ở tận đâu. Còn chỗ lấy danh sách và
       * chỗ hỏi .length của nó thì luôn nằm sát nhau. */
      let sau = s.slice(m.index + m[0].length);
      const lai = sau.search(new RegExp('(?:const|let|var)\\s+' + bien + '\\b'));
      if (lai >= 0) sau = sau.slice(0, lai);
      sau = sau.split('\n').slice(0, 40).join('\n');
      for (const cach of CUA_MANG) {
        const k = sau.indexOf(bien + '.' + cach);
        if (k < 0 || laChu(sau[k - 1])) continue;
        if (laChu(sau[k + bien.length + 1 + cach.length])) continue;
        loi.push(ten + ':' + soDong(s, m.index) + '  const ' + bien + ' = $(…) rồi dùng '
          + bien + '.' + cach);
        break;
      }
    }
  }
}

console.log('\n$ lấy một, $$ lấy nhiều');
if (loi.length) {
  fail++;
  console.error('  ✗ có chỗ dùng $ như thể nó trả về danh sách:');
  [...new Set(loi)].forEach((x) => console.error('      ' + x));
  process.exitCode = 1;
} else {
  pass++;
  console.log('  ✓ không chỗ nào gọi phương thức của mảng lên kết quả của $');
}

console.log('\n' + pass + ' pass · ' + fail + ' fail\n');
