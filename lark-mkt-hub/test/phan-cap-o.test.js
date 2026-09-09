'use strict';
/**
 * ============================================================================
 * LUẬT XẾP TẦNG CÁC Ô Ở TỔNG QUAN CHUNG
 * ============================================================================
 * Trước đây mọi ô đổ vào MỘT lưới phẳng, sức nặng thị giác bằng nhau — sáu con số
 * cùng đòi được nhìn thì mắt không biết nhìn đâu. Và trong một lần xem thật có tới
 * bảy ô bằng 0 trải khắp năm thẻ, mỗi ô chiếm đúng bằng ô có số thật.
 *
 * Nay ba tầng + một dòng gộp. Luật phân tầng là thứ âm thầm trôi lệch nhất: sửa
 * một điều kiện là một ô đáng chú ý lặng lẽ tụt xuống dòng chữ mờ, mà không có
 * lỗi nào được ném ra và giao diện vẫn trông bình thường.
 *
 * Test rút thẳng hàm `xepTheoTang` từ public/app.js chứ không chép lại một bản —
 * chép lại thì hai bên trôi xa nhau mà test vẫn xanh.
 *
 * Chạy: node test/phan-cap-o.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

/* ---- rút hàm ra khỏi mã trình duyệt ---- */
const i = src.indexOf('function xepTheoTang(');
t('public/app.js có hàm xepTheoTang', i >= 0);
const j = src.indexOf('\nfunction theHtml(', i);
const nguonHam = src.slice(i, j);

/* `esc` và `theHtml` là của trình duyệt; thay bằng bản giả để đọc được kết quả
 * phân tầng. theHtml trả về đúng cái cần kiểm: nhãn + tầng. */
const esc = (s) => String(s);
const theHtml = (o, mod, lop) => `[${lop || 'thuong'}:${o.nhan}]`;
// eslint-disable-next-line no-eval
const xepTheoTang = eval(`(${nguonHam.replace('function xepTheoTang', 'function')})`);

/** Đọc kết quả thành { tang: [...], khong: [...] } cho dễ khẳng định. */
function doc(ds) {
  const html = xepTheoTang(ds, 'mod');
  const tang = [...html.matchAll(/\[([a-z]+):([^\]]*)\]/g)].map((m) => m[1] + ':' + m[2]);
  const khong = [...html.matchAll(/class="tkn"[^>]*>([^<]*)</g)].map((m) => m[1]);
  return { tang, khong, html };
}

console.log('— ô chính luôn đứng đầu, dù giá trị bằng 0');
{
  const r = doc([
    { nhan: 'Phụ', so: 5 },
    { nhan: 'Chính', so: 0, chinh: true },
  ]);
  t('ô chính ra trước ô phụ', r.tang[0] === 'chinh:Chính', JSON.stringify(r.tang));
  /* Ô chính bằng 0 KHÔNG được gộp: nó là câu trả lời của cả thẻ. Gộp đi thì thẻ
   * mất luôn con số đại diện và người đọc không biết base đang thế nào. */
  t('ô chính bằng 0 vẫn giữ nguyên ô, không bị gộp',
    r.khong.length === 0, JSON.stringify(r.khong));
}

console.log('— thứ tự ba tầng: chính → cần chú ý → phụ');
{
  const r = doc([
    { nhan: 'Phụ', so: 7 },
    { nhan: 'Vừa', so: 2, muc: 'vua' },
    { nhan: 'Chính', so: 9, chinh: true },
    { nhan: 'Cao', so: 3, muc: 'cao' },
  ]);
  t('đúng thứ tự chính → cao → vừa → phụ',
    JSON.stringify(r.tang) === JSON.stringify(['chinh:Chính', 'thuong:Cao', 'thuong:Vừa', 'phu:Phụ']),
    JSON.stringify(r.tang));
}

console.log('— ô bằng 0 gộp thành một dòng chữ, không chiếm ô');
{
  const r = doc([
    { nhan: 'Chính', so: 1, chinh: true },
    { nhan: 'Chưa phân công', so: 0 },
    { nhan: 'Chờ tiếp nhận', so: 0 },
    { nhan: 'Đang tiến hành', so: 10 },
  ]);
  t('hai ô 0 xuống dòng gộp', r.khong.length === 2, JSON.stringify(r.khong));
  t('giữ nguyên chữ nhãn để i18n dịch được',
    r.khong.includes('Chưa phân công'), JSON.stringify(r.khong));
  /* Hạ chữ là phá bản dịch: i18n của hệ này dịch theo "khớp nguyên câu một text
   * node". Đã lộ ra đúng vậy một lần: "Không có: today's trips" — nửa Việt nửa Anh. */
  t('KHÔNG hạ chữ nhãn', !r.khong.some((x) => x === x.toLowerCase() && /[A-ZĐ]/.test('Chưa')),
    JSON.stringify(r.khong));
  t('ô có số vẫn là ô', r.tang.includes('phu:Đang tiến hành'), JSON.stringify(r.tang));
  t('có dòng "Không có"', /the-khong/.test(r.html) && /Không có/.test(r.html));
}

console.log('— ba ngoại lệ: số 0 là TIN chứ không phải sự vắng mặt');
{
  const r = doc([
    { nhan: 'Đang cảnh báo', so: 0, muc: 'cao' },
    { nhan: 'Có ghi chú', so: 0, ghi: 'chưa ghi công được đơn nào' },
    { nhan: 'Ổn', so: 0, muc: 'ok' },
    { nhan: 'Trống hẳn', so: 0 },
  ]);
  t('mức cao bằng 0 vẫn giữ ô', r.tang.includes('thuong:Đang cảnh báo'), JSON.stringify(r.tang));
  /* Gộp ô có ghi chú là mất luôn lời giải thích, và người đọc lại tưởng hỏng. */
  t('ô có ghi chú vẫn giữ ô', r.tang.includes('phu:Có ghi chú'), JSON.stringify(r.tang));
  /* `muc: 'ok'` nghĩa là "chuyện này đang ổn" — không có việc gì phải làm, đúng
   * thứ nên nhường chỗ. Nó KHÔNG phải ngoại lệ. */
  t('muc "ok" bằng 0 thì gộp, không chiếm ô', r.khong.includes('Ổn'), JSON.stringify(r.khong));
  t('ô trống hẳn thì gộp', r.khong.includes('Trống hẳn'), JSON.stringify(r.khong));
}

console.log('— trong tầng phụ, ô CÓ SỐ đứng trước ô bằng 0');
{
  /* Không xếp thì mắt phải nhảy qua chỗ trống mới tới số thật — đã thấy đúng vậy:
   * "Đang tiến hành 10" nằm sau hai ô 0. */
  const r = doc([
    { nhan: 'Không nhưng có ghi', so: 0, ghi: 'x' },
    { nhan: 'Có số', so: 4 },
  ]);
  t('ô có số lên trước',
    r.tang.indexOf('phu:Có số') < r.tang.indexOf('phu:Không nhưng có ghi'), JSON.stringify(r.tang));
}

console.log('— các ca biên');
t('danh sách rỗng không nổ và không sinh khung rỗng', doc([]).html === '');
{
  const r = doc([{ nhan: 'A', so: 0 }, { nhan: 'B', so: 0 }]);
  t('toàn bộ bằng 0 thì KHÔNG dựng lưới ô nào',
    !/the-luoi/.test(r.html) && /the-khong/.test(r.html), r.html.slice(0, 90));
}
{
  const r = doc([{ nhan: 'A', so: 3, chinh: true }]);
  t('chỉ có ô chính thì không dựng dòng gộp rỗng',
    /the-luoi/.test(r.html) && !/the-khong/.test(r.html));
}

console.log('— dòng gộp vẫn bấm được để mở đúng nhóm');
{
  const r = doc([{ nhan: 'A', so: 0, tab: 'x', khoa: 'k' }]);
  t('mang data-mo', /data-mo="mod"/.test(r.html), r.html);
  t('mang data-tab và data-khoa', /data-tab="x"/.test(r.html) && /data-khoa="k"/.test(r.html));
}

console.log('— CSS phải có đủ ba tầng + dòng gộp');
{
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  t('có .the.chinh', /\.the\.chinh\s*\{/.test(css));
  t('ô chính rộng hết hàng', /\.the\.chinh\s*\{[^}]*grid-column:\s*1\s*\/\s*-1|grid-column: 1 \/ -1/.test(css)
    || /the\.chinh \{ grid-column: 1 \/ -1/.test(css) || css.includes('.the.chinh { grid-column: 1 / -1; }')
    || /\.the\.chinh\b[^{]*\{[^}]*grid-column/.test(css));
  t('có .the.phu nhỏ hơn', /\.the\.phu\b/.test(css));
  t('có .the-khong', /\.the-khong\b/.test(css));
  /* Số 30px của ô chính phải LỚN HƠN số của ô phụ, nếu không thì phân cấp chỉ
   * còn trên giấy. */
  const cChinh = (css.match(/\.the\.chinh \.so \{[^}]*font-size:\s*(\d+)px/) || [])[1];
  const cPhu = (css.match(/\.the\.phu \.so \{[^}]*font-size:\s*(\d+)px/) || [])[1];
  t('cỡ số ô chính > ô phụ', Number(cChinh) > Number(cPhu), `${cChinh} vs ${cPhu}`);
}

console.log('— hình khối: nhóm LÀ thẻ, ô LÀ ô bảng (không thẻ nào lồng thẻ nào)');
{
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const khoi = (sel) => {
    const k = css.indexOf('\n' + sel + ' {');
    return k < 0 ? '' : css.slice(k, css.indexOf('}', k));
  };

  /* Sáu nhóm trên một trang: không có khung thì mắt thấy "30 hộp rời" chứ không
   * thấy "6 base". Đây là phần lớn cảm giác rối mà anh Hùng nói. */
  const nb = khoi('.nhom-base');
  t('.nhom-base có nền thẻ', /background:\s*var\(--trang\)/.test(nb), nb.slice(0, 80));
  t('.nhom-base có viền', /border:\s*1px solid var\(--vien\)/.test(nb));
  t('.nhom-base bo góc bằng token dùng chung', /border-radius:\s*var\(--r\)/.test(nb));
  t('.nhom-base dùng bóng thẻ dùng chung', /box-shadow:\s*var\(--bong\)/.test(nb));

  /* Và ô thì KHÔNG còn là thẻ — đó là cách giải lo ngại "thẻ trong thẻ". */
  const the = khoi('.the');
  t('ô KHÔNG có viền riêng', /border:\s*0/.test(the), the.slice(0, 120));
  t('ô KHÔNG bo góc riêng', /border-radius:\s*0/.test(the));
  t('ô KHÔNG dùng bóng thẻ (chỉ có vòng kẻ 1px)',
    !/box-shadow:\s*var\(--bong\)/.test(the) && /box-shadow:\s*0 0 0 1px/.test(the), the);

  /* Đường kẻ vẽ bằng vòng trên TỪNG ô, không bằng nền của lưới: dùng nền lưới thì
   * ô nào không có nội dung vẫn để lộ cả ô màu xám. */
  const luoi = khoi('.nhom-base > .the-luoi');
  t('lưới ô để khe 1px cho vòng kẻ lấp vào', /gap:\s*1px/.test(luoi), luoi.slice(0, 120));
  t('lưới ô KHÔNG lấy nền viền (kẻo ô trống thành mảng xám)',
    /background:\s*transparent/.test(luoi), luoi);

  /* Thẻ chỉ cao bằng nội dung. Thiếu dòng này thì thẻ ngắn bị kéo cao bằng thẻ cao
   * nhất trong hàng, và từ khi thẻ có nền thì nó thành mảng trắng rỗng to. */
  t('.luoi-base để thẻ cao theo nội dung',
    /align-items:\s*start/.test(khoi('.luoi-base')), khoi('.luoi-base'));

  /* Ba cột chỉ khi đủ rộng: ở 1150px mỗi thẻ ~305px và tiêu đề vỡ thành ba dòng. */
  t('3 cột chỉ dùng từ ~1400px trở lên', /max-width:\s*1400px\)\s*\{\s*\.luoi-base/.test(css));
  t('có mốc 1 cột cho cửa sổ hẹp', /max-width:\s*820px\)\s*\{\s*\.luoi-base/.test(css));

  /* Tiêu đề là nhãn duy nhất cho biết đang đọc base nào — không được cắt. */
  t('tiêu đề thẻ KHÔNG bị cắt bằng ellipsis',
    !/text-overflow:\s*ellipsis/.test(khoi('.khoi-head h2')), khoi('.khoi-head h2'));
}

console.log('— nhãn dòng gộp phải có trong từ điển, kẻo kẹt tiếng Việt giữa giao diện Anh');
{
  const i18n = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
  t("từ điển có khoá 'Không có'", /'Không có':/.test(i18n));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
