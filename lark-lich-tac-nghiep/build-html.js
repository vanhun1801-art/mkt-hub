'use strict';
/*
 * Gộp public/index.html + styles.css + app.js thành một file HTML duy nhất.
 *
 *   node build-html.js
 *
 * Kết quả: dist/lich-tac-nghiep.html — mở trực tiếp bằng trình duyệt được,
 * miễn là server đang chạy (file gộp tự trỏ API về http://localhost:<port>).
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const SRC = path.join(__dirname, 'public');
const OUT_DIR = path.join(__dirname, 'dist');
const OUT = path.join(OUT_DIR, 'lich-tac-nghiep.html');

const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

let html = read('index.html');
const css = read('styles.css');
const js = read('app.js');

/* `</script>` nằm trong chuỗi JS sẽ đóng sớm thẻ script khi nhúng inline. */
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

const banner =
  '<!--\n' +
  '  Rooty Trip · Lịch tác nghiệp — bản gộp một file\n' +
  '  Sinh tự động bằng `node build-html.js`, đừng sửa trực tiếp file này.\n' +
  '  Nguồn: public/index.html + public/styles.css + public/app.js\n' +
  '  Cần server chạy tại http://localhost:' + cfg.port + ' (node server.js).\n' +
  '-->\n';

/*
 * Chỉ dùng đường dẫn tương đối khi trang đúng là do server app phục vụ. Mọi
 * trường hợp khác đều phải trỏ tuyệt đối: mở bằng file:// hoặc data:
 * (origin "null"), hay được một web server khác phục vụ — lúc đó đường dẫn
 * tương đối sẽ rơi vào nhầm host và trả 404.
 */
const API_ORIGIN = 'http://localhost:' + cfg.port;
const apiShim =
  '<script>\n' +
  '  if (location.origin !== "' + API_ORIGIN + '") {\n' +
  '    window.LARK_API_BASE = "' + API_ORIGIN + '";\n' +
  '  }\n' +
  '</script>\n';

html = html
  .replace('<link rel="stylesheet" href="/styles.css">', '<style>\n' + css + '\n</style>')
  .replace('<script src="/app.js"></script>', apiShim + '<script>\n' + safeJs + '\n</script>');

if (html.includes('href="/styles.css"') || html.includes('src="/app.js"')) {
  console.error('Không nhúng được CSS/JS — index.html đã đổi cấu trúc thẻ.');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, banner + html, 'utf8');

const kb = (n) => Math.round(n / 1024) + ' KB';
console.log('Đã tạo ' + path.relative(__dirname, OUT) + '  (' + kb(Buffer.byteLength(html)) + ')');
console.log('  HTML  ' + kb(Buffer.byteLength(read('index.html'))));
console.log('  CSS   ' + kb(Buffer.byteLength(css)));
console.log('  JS    ' + kb(Buffer.byteLength(js)));
