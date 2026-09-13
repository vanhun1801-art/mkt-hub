'use strict';
/**
 * Bộ chọn DOM có trỏ vào đâu không — kiểm tĩnh, không cần trình duyệt.
 *
 * VÌ SAO CÓ FILE NÀY: công tắc Ngôn ngữ trong Cài đặt hỏng đúng kiểu này và
 * không ai biết. `veSegNgonNgu()` bám cứng `$('#segLang')` — id của công tắc CŨ
 * trong index.html — mà công tắc đó đã bị gỡ từ lúc ngôn ngữ dọn về Cài đặt.
 * Không còn phần tử nào mang id ấy nên hàm `return` ngay dòng đầu.
 *
 * Triệu chứng nham hiểm ở chỗ NÓ TRÔNG NHƯ ĐANG CHẠY: bấm VI thì nội dung đổi
 * sang tiếng Việt thật, localStorage ghi 'vi' thật — chỉ mỗi nút EN vẫn là nút
 * sáng. Không lỗi, không cảnh báo, và ảnh chụp màn hình nhìn qua vẫn bình
 * thường. Đo tận nơi mới ra: data-lang="vi" mà class "on" nằm trên EN.
 *
 * `$('#x')` không tìm thấy gì thì JS trả null — im lặng. Đó là lý do loại lỗi
 * này sống lâu, và là lý do phải canh bằng phép thử chứ không bằng mắt.
 *
 * Chạy: node test/bo-chon.test.js
 */
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; console.log('  ✗ ' + ten + (vi ? '\n      ' + vi : '')); }
};

const tep = fs.readdirSync(PUBLIC).filter((f) => /\.(js|html)$/.test(f));
const nguon = Object.fromEntries(tep.map((f) => [f, fs.readFileSync(path.join(PUBLIC, f), 'utf8')]));
const tatCa = Object.values(nguon).join('\n');

/* Mọi id CÓ THỂ tồn tại lúc chạy. Ba nguồn, và nguồn thứ ba là thứ tránh báo
 * nhầm: `oThu('cdCsMoThu', …)` ghép id ra lúc chạy nên nó không bao giờ xuất
 * hiện dưới dạng `id="cdCsMoThu"` trong mã nguồn. */
const coThat = new Set();
for (const m of tatCa.matchAll(/\bid=["']([A-Za-z][\w-]*)["']/g)) coThat.add(m[1]);
for (const m of tatCa.matchAll(/\.id\s*=\s*["']([A-Za-z][\w-]*)["']/g)) coThat.add(m[1]);
for (const m of tatCa.matchAll(/(^|[^#\w.])['"]([A-Za-z][\w-]*)['"]/g)) {
  coThat.add(m[2]);                       // chuỗi trần trùng tên -> có thể là id dựng động
}

(function () {
  console.log('\nKiểm thử bộ chọn DOM\n');

  console.log('[1] Không bộ chọn nào trỏ vào hư không');
  const chet = [];
  for (const [f, s] of Object.entries(nguon)) {
    if (!f.endsWith('.js')) continue;
    const thay = new Set();
    for (const m of s.matchAll(/\$\(\s*['"]#([A-Za-z][\w-]*)['"]\s*\)/g)) thay.add(m[1]);
    for (const m of s.matchAll(/getElementById\(\s*['"]([A-Za-z][\w-]*)['"]\s*\)/g)) thay.add(m[1]);
    for (const id of thay) if (!coThat.has(id)) chet.push(f + ' → #' + id);
  }
  ok('mọi $(\'#id\') / getElementById đều có phần tử tương ứng', !chet.length,
    chet.join('\n      '));

  console.log('\n[2] Công tắc dùng chung vẽ được ở MỌI chỗ nó xuất hiện');
  /* Ngôn ngữ và sáng/tối được dựng ở hai nơi — index.html (bản cũ, đã gỡ) và
   * bảng Cài đặt. Hàm vẽ lại phải bắt theo CLASS, y như `veThanhLoc()` đã phải
   * đổi sang class để dùng được cho trang thứ hai. */
  const app = nguon['app.js'] || '';
  for (const [ham, lop] of [['veSegNgonNgu', 'seg-lang'], ['veSegTheme', 'seg-theme']]) {
    const than = (new RegExp('function ' + ham + '\\(\\)[\\s\\S]*?\\n}')).exec(app);
    ok(ham + '() bắt theo class .' + lop + ' chứ không chỉ một id',
      !!than && than[0].includes('.' + lop),
      than ? 'thân hàm không nhắc tới .' + lop : 'không tìm thấy hàm');
    ok(ham + '() vẽ cho MỌI phần tử khớp (dùng $$, không phải $)',
      !!than && /\$\$\(/.test(than[0]));
  }

  /* Và công tắc trong Cài đặt phải thật sự mang class đó, không thì vế trên
   * đúng mà vẫn không có gì được vẽ. */
  const cd = nguon['caidat.js'] || '';
  ok('bảng Cài đặt dựng công tắc với class seg-lang', cd.includes('seg-lang'));
  ok('bảng Cài đặt dựng công tắc với class seg-theme', cd.includes('seg-theme'));

  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exitCode = fail ? 1 : 0;
})();
