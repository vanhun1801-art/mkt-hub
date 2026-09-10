/**
 * Giao diện gọn: những gì đã BỎ thì phải không quay lại, và đường thay thế phải còn.
 *
 * Bộ này giữ ba việc dọn giao diện khỏi bị hoàn nguyên trong im lặng:
 *
 * 1. Tab "Nhập số hằng ngày" đã bỏ. API lấy đủ số của cả ba nền tảng, nên bảng
 *    nhập tay chỉ còn là một cửa để nhập sai. Đo trong Base: 109 dòng "Nhập tay"
 *    đều thuộc 01/08–26/08, giai đoạn TRƯỚC khi nối API.
 *
 * 2. Nhưng đường sửa từng dòng PHẢI còn — ở tab "Dữ liệu theo ngày". Nếu một nền
 *    tảng để hở một ngày mà không còn chỗ nào vá được thì việc bỏ tab là làm hỏng,
 *    không phải làm gọn. Đây là phép kiểm quan trọng nhất của bộ này.
 *
 * 3. /api/entry ở server còn sống: hai bộ test ghi dùng nó, và nó là đường vá.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const app = doc('public/app.js');
const srv = doc('server.js');
const css = doc('public/styles.css');

console.log('— tab nhập tay đã bỏ');
{
  t('không còn tab trong thanh tab', !/id:\s*'nhap-so'/.test(app));
  t('không còn khối VIEW', !/VIEW\['nhap-so'\]/.test(app));
  t('không còn state S.entry', !/S\.entry/.test(app));
  t('không còn CSS .entry-tbl', !css.includes('.entry-tbl'));
}

console.log('— đường sửa từng dòng PHẢI còn');
{
  /* Không có phép kiểm này thì lần dọn sau có thể bỏ luôn nút Sửa, và app mất
   * hẳn cách vá một ngày bị hở — im lặng, không ai biết cho tới lúc cần. */
  t('tab Dữ liệu theo ngày còn trong thanh tab', /id:\s*'du-lieu'/.test(app));
  t('còn nút Sửa từng dòng', app.includes('window.__dailyEdit'));
  t('__dailyEdit còn được khai', /window\.__dailyEdit\s*=/.test(app));
  t('__dailyEdit ghi qua /api/daily', /__dailyEdit[\s\S]{0,2000}?\/api\/daily/.test(app));
}

console.log('— /api/entry còn sống: cho test ghi và cho đường vá');
{
  t('còn đường GET', srv.includes("p === '/api/entry' && method === 'GET'"));
  t('còn đường POST', srv.includes("p === '/api/entry' && method === 'POST'"));
  /* Ghi lại VÌ SAO nó còn, để lần sau không ai tưởng là mã chết rồi xoá. */
  t('có ghi lý do nó còn tồn tại', /Nhập số hằng ngày[\s\S]{0,400}?api\.test\.js/.test(srv));
}

console.log(`
${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
