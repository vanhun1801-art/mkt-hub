'use strict';
/**
 * ============================================================================
 * LỚP VỎ TRÊN ĐIỆN THOẠI — panel base phải là NGĂN KÉO, không ăn bề ngang
 * ============================================================================
 * Anh Hùng: "giờ anh muốn tối ưu mobile cho cả ứng dụng".
 *
 * Đo thật trên khung 390×844 trước khi sửa: trang không tràn ngang, nhưng panel
 * base vẫn nằm trong dòng chảy và ăn 68px — 17% bề ngang của máy, mà ở dạng dải
 * icon thì nó còn không nói được base nào là base nào. Đổi thành ngăn kéo trượt
 * ra, nội dung lấy trọn 390px.
 *
 * Bộ này chốt những chỗ dễ vỡ lại nhất khi ai đó sửa CSS sau này — toàn là lỗi
 * IM LẶNG, tức là trên máy tính nhìn vẫn hoàn toàn bình thường:
 *
 *   1. thanh trên cùng lọt xuống máy tính (mặc định phải là display: none);
 *   2. luật thu panel về dải icon của máy tính bảng với xuống điện thoại — khi
 *      đó ngăn kéo mở ra là một cột icon không tên, vô dụng;
 *   3. quên `.rail.min`: ai đã ghim panel thu gọn trên máy tính thì trên điện
 *      thoại ngăn kéo bị bóp còn 68px;
 *   4. mở ngăn kéo rồi bấm một base mà nó không tự đóng lại.
 *
 * Chạy: node test/mobile-vo.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (vi ? ' — ' + vi : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const GOC = path.join(__dirname, '..');
const doc = (p) => fs.readFileSync(path.join(GOC, p), 'utf8');
const HTML = doc('public/index.html');
const CSS = doc('public/styles.css');
const JS = doc('public/app.js');

/** Lấy nguyên khối `@media (…) { … }` theo điều kiện, đếm ngoặc cho cân. */
function khoiMedia(css, dieu) {
  const i = css.indexOf('@media ' + dieu);
  if (i < 0) return null;
  const mo = css.indexOf('{', i);
  let sau = 1;
  for (let j = mo + 1; j < css.length; j++) {
    if (css[j] === '{') sau++;
    else if (css[j] === '}' && --sau === 0) return css.slice(mo + 1, j);
  }
  return null;
}

group('Thanh trên cùng chỉ thuộc về điện thoại');
{
  ok('index.html có thanh .mob-bar', /<header class="mob-bar">/.test(HTML));
  ok('có nút mở ngăn kéo #btnMenu', /id="btnMenu"/.test(HTML));
  ok('có nền mờ #railNen', /id="railNen"/.test(HTML));
  /* Thanh phải nằm NGOÀI .app: .app là flex ngang (panel | sân khấu), nhét thêm
   * một header vào trong thì trên máy tính nó thành cột thứ ba. */
  ok('thanh nằm TRƯỚC <div class="app">',
    HTML.indexOf('class="mob-bar"') < HTML.indexOf('class="app"'));
  ok('nền mờ cũng nằm ngoài .app',
    HTML.indexOf('id="railNen"') < HTML.indexOf('class="app"'));
  /* Mặc định ẩn, chỉ @media mới bật lên. Bỏ dòng này thì máy tính mọc thêm một
   * thanh tiêu đề thừa — mà trên máy tính thì không ai chạy test. */
  ok('.mob-bar mặc định display: none', /\.mob-bar\s*\{\s*display:\s*none/.test(CSS));
  ok('.rail-nen mặc định display: none', /\.rail-nen\s*\{\s*display:\s*none/.test(CSS));
}

group('Luật của máy tính bảng không được với xuống điện thoại');
{
  const tb = khoiMedia(CSS, '(min-width: 641px) and (max-width: 900px)');
  ok('khối thu panel về icon có chặn dưới 641px', tb !== null);
  if (tb) {
    ok('… và chính nó là khối giấu chữ trong panel', /\.ri-tx/.test(tb) && /display:\s*none/.test(tb));
    ok('… và chính nó là khối bóp panel về --rail-w-min', /--rail-w-min/.test(tb));
  }
  /* Không còn khối max-width: 900px nào giấu .ri-tx mà THIẾU chặn dưới. */
  const rong = khoiMedia(CSS, '(max-width: 900px)');
  ok('khối 900px còn lại không đụng tới panel',
    rong !== null && !/\.ri-tx|--rail-w-min/.test(rong));
}

group('Panel base = ngăn kéo dưới 640px');
{
  const dt = khoiMedia(CSS, '(max-width: 640px)');
  ok('có khối @media (max-width: 640px)', dt !== null);
  if (dt) {
    ok('panel rời khỏi dòng chảy (position: fixed)', /\.rail[^{]*\{[^}]*position:\s*fixed/.test(dt));
    /* `.rail.min` mạnh hơn `.rail`: quên nó thì ai từng ghim panel thu gọn sẽ
     * có một ngăn kéo rộng 68px. */
    ok('luật ngăn kéo tính cả .rail.min', /\.rail,\s*\.rail\.min\s*\{/.test(dt));
    ok('đóng thì trượt ra khỏi màn', /translateX\(-100%\)/.test(dt));
    ok('body.rail-mo thì trượt vào', /body\.rail-mo\s+\.rail\s*\{[^}]*transform:\s*none/.test(dt));
    ok('ngăn kéo hiện ĐỦ chữ, không phải dải icon',
      /\.rail\s+\.ri-tx\s*\{\s*display:\s*flex/.test(dt));
    ok('thanh trên cùng bật lên', /\.mob-bar\s*\{[^}]*display:\s*flex/.test(dt));
    ok('nền mờ bật lên', /\.rail-nen\s*\{[^}]*display:\s*block/.test(dt));
    /* Ngón tay không bấm trúng nút cao 31px. 40px là mức tối thiểu quen dùng. */
    ok('nút bấm cao tối thiểu 40px', /\.btn\s*\{[^}]*min-height:\s*40px/.test(dt));
    ok('nút ☰ vuông 40px', /\.mob-nut\s*\{[^}]*width:\s*40px[^}]*height:\s*40px/.test(dt));
    /* Tên màn đã nằm trên thanh trên cùng — in lại ngay dưới là phí một dòng. */
    ok('không lặp lại tiêu đề trang', /\.page-head h1\s*\{\s*display:\s*none/.test(dt));
  }
}

group('Đóng mở ngăn kéo');
{
  ok('có hàm moNganKeo', /function moNganKeo\(/.test(JS));
  ok('nút ☰ bật/tắt ngăn kéo', /\$\('#btnMenu'\)\.onclick/.test(JS));
  ok('bấm nền mờ thì đóng', /\$\('#railNen'\)\.onclick\s*=\s*\(\)\s*=>\s*moNganKeo\(false\)/.test(JS));
  /* Chọn xong một base mà ngăn kéo vẫn che nửa màn thì coi như chưa chọn.
   * hashchange bắt cả lối bấm trong panel lẫn nút Lùi của trình duyệt. */
  ok('chọn base xong thì tự đóng (hashchange)',
    /addEventListener\('hashchange',\s*\(\)\s*=>\s*moNganKeo\(false\)\)/.test(JS));
  ok('Escape đóng được', /e\.key === 'Escape'[^;]*moNganKeo\(false\)/.test(JS));
  ok('mở Cài đặt thì đóng ngăn kéo', /#btnSettings'\)\.onclick[^\n]*moNganKeo\(false\)/.test(JS));
  ok('mở Thêm base thì đóng ngăn kéo', /#btnAdd'\)\.onclick[^\n]*moNganKeo\(false\)/.test(JS));
}

group('Tên màn trên thanh trên cùng');
{
  /* App con nằm trong iframe — lớp vỏ không mượn được tiêu đề của nó, nên phải
   * tự đặt ở cả hai lối vào, nếu không thanh trên cùng nói sai chỗ đang đứng. */
  ok('có hàm datTenMan', /function datTenMan\(/.test(JS));
  const mo = JS.slice(JS.indexOf('function moModule('), JS.indexOf('function moHome('));
  ok('mở app con thì đổi tên', /datTenMan\(mod\.ten\)/.test(mo));
  const home = JS.slice(JS.indexOf('function moHome('), JS.indexOf('function moHome(') + 500);
  ok('về Tổng quan thì đổi lại', /datTenMan\('Tổng quan chung'\)/.test(home));
}

group('Mọi app đều khai khung nhìn của máy');
{
  /* Thiếu thẻ này thì trình duyệt di động dựng trang ở 980px rồi thu nhỏ lại:
   * mọi @media viết bên dưới đều không bao giờ chạy, chữ bé như kiến. */
  const goc = path.join(GOC, '..');
  const apps = fs.readdirSync(goc).filter((d) => d.startsWith('lark-') &&
    fs.existsSync(path.join(goc, d, 'public', 'index.html')));
  ok('quét được nhiều app', apps.length >= 8, String(apps.length));
  const thieu = apps.filter((d) => !/<meta name="viewport"[^>]*width=device-width/
    .test(fs.readFileSync(path.join(goc, d, 'public', 'index.html'), 'utf8')));
  ok('app nào cũng có meta viewport', thieu.length === 0, thieu.join(', '));
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
