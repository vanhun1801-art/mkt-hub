'use strict';
/* Gộp public/ thành MỘT file HTML tự chứa: dist/ban-do-phu-quoc.html.
   Đưa file này lên hosting của website (hoặc bất cứ đâu phục vụ được file tĩnh)
   rồi nhúng bằng <iframe>. Chỉ còn phụ thuộc Google Fonts; mất mạng tới đó thì
   chữ lùi về font hệ thống, bản đồ vẫn chạy.

   Chạy:  node tao/dong-goi.js      (nên chạy sau node tao/du-lieu.js) */
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
const DIST = path.join(__dirname, '..', 'dist');
const doc = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');

/* </script> trong dữ liệu sẽ đóng thẻ script sớm — chặn cho chắc. */
const anToan = (js) => js.replace(/<\/script/gi, '<\\/script');

/* hình tự vẽ trong hinh-rieng/: cắt viền trong suốt + nén WebP (chạy riêng vì cần Chrome, bất đồng bộ) */
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'hinh-rieng.js')], { stdio: 'inherit' });
let html = doc('index.html');
html = html.replace('<link rel="stylesheet" href="ban-do.css">', () => '<style>\n' + doc('ban-do.css') + '\n</style>');
for (const f of ['hinh.js', 'dia-hinh.js', 'hinh-ve.js', 'hinh-rieng.js', 'du-lieu.js', 'ban-do.js']) {
  const the = '<script src="' + f + '"></script>';
  if (!html.includes(the)) throw new Error('index.html không còn thẻ ' + the);
  html = html.replace(the, () => '<script>\n' + anToan(doc(f)) + '\n</script>');
}

/* Nhúng luôn thư viện MapLibre (tao/thu-vien/, tải từ jsDelivr đúng bản 5.24.0) để file
   gửi đi máy khác không phụ thuộc CDN — mạng công ty, Wi-Fi khách sạn hay chặn jsDelivr.
   Chỉ còn cần mạng cho ô bản đồ (OpenFreeMap) và địa hình. */
const TV = path.join(__dirname, 'thu-vien');
const cdn = (duoi) => new RegExp('<(?:script src|link rel="stylesheet" href)="https://cdn\\.jsdelivr\\.net/npm/maplibre-gl@[^"]+/dist/maplibre-gl\\.' + duoi + '"[^>]*>(</script>)?');
if (fs.existsSync(path.join(TV, 'maplibre-gl.js')) && cdn('js').test(html)) {
  const js = fs.readFileSync(path.join(TV, 'maplibre-gl.js'), 'utf8').replace(/\/\/# sourceMappingURL=\S+\s*$/, '');
  const css = fs.readFileSync(path.join(TV, 'maplibre-gl.css'), 'utf8').replace(/\/\*# sourceMappingURL=\S+ \*\/\s*$/, '');
  if (!cdn('js').test(html) || !cdn('css').test(html)) throw new Error('index.html không còn thẻ MapLibre CDN để thay');
  html = html.replace(cdn('css'), () => '<style>\n' + css + '\n</style>');
  html = html.replace(cdn('js'), () => '<script>\n' + anToan(js) + '\n</script>');
} else {
  /* bản vector (25/09) không dùng MapLibre — không có gì để nhúng */
}

fs.mkdirSync(DIST, { recursive: true });
const ra = path.join(DIST, 'ban-do-phu-quoc.html');
fs.writeFileSync(ra, html);
console.log('đã đóng gói:', path.relative(process.cwd(), ra), '·', (html.length / 1024).toFixed(0) + ' KB');
