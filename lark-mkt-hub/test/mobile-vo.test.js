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

/* Bản CSS đã bỏ chú thích. Có câu kiểm soi xem một selector còn tồn tại không,
 * mà chính lời giải thích "đừng dùng selector đó nữa" lại chứa nó — soi trên
 * bản còn chú thích là báo lỗi oan. */
const CSS_SACH = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

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

group('Không đặt kích thước theo id');
{
  /* Ở đây từng có `#btnTB { width: 100% }` từ hồi chuông nằm trong panel bên
   * trái. Chuông dời lên đầu trang, luật ở lại — và vì tính theo id nên nó ĐÈ
   * cả `.btn.chuong { width: 34px }`. Trên máy tính khung co theo nội dung nên
   * chưa lộ; đến khi thanh nút rộng hết dòng trên điện thoại thì chuông phình
   * thành 96px, huy hiệu số trôi ra tít mép. Luật theo id rất khó gỡ vì nó
   * thắng mọi luật theo lớp — đừng để mọc lại. */
  ok('không có luật CSS nào nhắm vào #btnTB', !/#btnTB\s*[,{]/.test(CSS_SACH));
  ok('chuông vẫn có kích thước theo lớp', /\.btn\.chuong\s*\{[^}]*width:\s*34px/.test(CSS));
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
    /* Phải đòi `.rail.min .ri-tx`, KHÔNG phải `.rail .ri-tx`.
     *
     * Bản cũ của phép thử này chỉ đòi `.rail .ri-tx { display: flex }` — và nó
     * ĐẠT suốt trong khi tính năng vẫn hỏng: `.rail.min .ri-tx { display:none }`
     * ở phần máy tính có độ ưu tiên (0,3,0), thắng (0,2,0) bất kể thứ tự, vì
     * @media không cộng điểm. Phép thử canh đúng cái luật thua cuộc. */
    ok('ngăn kéo hiện ĐỦ chữ, không phải dải icon',
      /\.rail\.min\s+\.ri-tx[^{]*\{[^}]*display:\s*flex/.test(dt)
      || /\.ri-tx[^{]*,\s*\.rail\.min\s+\.ri-tx\s*\{[^}]*display:\s*flex/.test(dt));
    ok('thanh trên cùng bật lên', /\.mob-bar\s*\{[^}]*display:\s*flex/.test(dt));
    ok('nền mờ bật lên', /\.rail-nen\s*\{[^}]*display:\s*block/.test(dt));
    /* Ngón tay không bấm trúng nút cao 31px. 40px là mức tối thiểu quen dùng. */
    ok('nút bấm cao tối thiểu 40px', /\.btn\s*\{[^}]*min-height:\s*40px/.test(dt));
    /* Nút chỉ có icon (chuông) phải giữ hình vuông: cho nó `padding` của nút
     * chữ là bề ngang phình ra, huy hiệu số trôi khỏi icon. */
    ok('nút chỉ-icon không bị padding kéo ngang', /\.btn\.chuong,\s*\.btn\.icon\s*\{[^}]*padding:\s*0/.test(dt));
    /* `.seg-nho` mạnh hơn `.seg` nên phải gọi đích danh, nếu không hai nút
     * Bản đồ nhiệt / Theo ngày vẫn cao 27px. */
    ok('nút đoạn nhỏ cũng đủ to để chạm', /\.seg\.seg-nho button\s*\{[^}]*padding/.test(dt));
    ok('nhãn tab Cài đặt không xuống dòng', /\.cd-nav button[^{]*\{[^}]*white-space:\s*nowrap/.test(CSS));
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

/* ============================================================================
 * MỌI luật `.rail.min …` của máy tính phải được GỠ lại trong khối điện thoại
 * ============================================================================
 * Đây là cái bẫy đã cắn thật ngày 23/09/2026, và nó im lặng tuyệt đối trên máy
 * tính. `.rail.min .ri-tx` có độ ưu tiên (0,3,0), `.rail .ri-tx` chỉ (0,2,0) —
 * mà `@media` KHÔNG cộng thêm điểm nào. Nên luật viết sau trong khối điện thoại
 * vẫn THUA, và ai đã ghim panel thu gọn trên máy tính thì mở app trên điện thoại
 * là ngăn kéo mất sạch tên app, chỉ còn một cột icon.
 *
 * Bản cũ đã gỡ đúng `.rail-item` nhưng quên `.ri-tx`, `.rail-group`,
 * `.logo-text`. Quên kiểu đó thì không phép thử nào bắt được — nên bộ này
 * KHÔNG liệt kê tay, mà quét cả tệp: cứ có một luật `.rail.min X` ở phần máy
 * tính thì phải có một luật `.rail.min X` trong khối điện thoại để gỡ lại.
 */
group('luật thu gọn của máy tính không được rơi xuống ngăn kéo');
{
  const css = doc('public/styles.css');
  const moKhoi = css.indexOf('@media (max-width: 640px)');

  /* Cắt đúng khối điện thoại bằng cách đếm ngoặc, đừng đoán theo dòng. */
  let i = css.indexOf('{', moKhoi), sau = 0, het = i;
  for (; het < css.length; het++) {
    if (css[het] === '{') sau++;
    else if (css[het] === '}') { sau--; if (!sau) break; }
  }
  const mayTinh = css.slice(0, moKhoi);
  const dienThoai = css.slice(i, het);

  /* Lấy phần đứng SAU `.rail.min` trong mỗi bộ chọn. '' nghĩa là chính `.rail.min`. */
  const lay = (s) => {
    const ra = new Set();
    for (const m of s.matchAll(/\.rail\.min([^,{]*)[,{]/g)) ra.add(m[1].trim());
    return ra;
  };

  /* Hai ngoại lệ, mỗi cái kèm lý do. Danh sách này phải NGẮN và phải có lý do,
   * không thì nó thành chỗ để nhét mọi thứ vào cho test hết kêu. */
  const THA = new Map([
    /* `.rail-pin` đã bị `display: none` ở khối điện thoại. Luật đặt vị trí của
     * máy tính có rơi xuống cũng không vẽ ra gì. */
    ['.rail-pin', 'ngăn kéo đã ẩn hẳn nút này'],
    /* Ẩn thanh cuộn ở ngăn kéo cũng đúng: điện thoại vốn dùng thanh cuộn nổi,
     * hiện ra chỉ tốn chỗ trong 300px. */
    ['.rail-nav::-webkit-scrollbar', 'ẩn thanh cuộn ở ngăn kéo cũng là điều muốn'],
  ]);

  const canGo = lay(mayTinh);
  const daGo = lay(dienThoai);
  const quen = [...canGo].filter((x) => !daGo.has(x) && !THA.has(x));

  ok('danh sách tha vẫn còn ngắn (đừng nhét thêm cho test hết kêu)', THA.size <= 3,
    THA.size + ' mục');

  ok('khối điện thoại gỡ lại MỌI luật `.rail.min` của máy tính',
    quen.length === 0,
    quen.length ? 'chưa gỡ: ' + quen.map((x) => '.rail.min ' + (x || '(chính nó)')).join(' · ') : '');

  ok('có quét được gì đó (phép thử không tự rỗng rồi báo đạt)',
    canGo.size >= 5, 'chỉ tìm thấy ' + canGo.size + ' luật .rail.min');

  /* Chốt riêng ba thứ đã từng mất, để thông báo lỗi nói thẳng cái gì hỏng thay
   * vì chỉ đưa ra một bộ chọn. */
  for (const [ten, sel] of [['tên app', '.ri-tx'], ['tiêu đề nhóm', '.rail-group'],
    ['tên app ở logo', '.logo-text']]) {
    ok('ngăn kéo vẫn hiện ' + ten, daGo.has(sel), 'thiếu `.rail.min ' + sel + '` trong khối điện thoại');
  }
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
