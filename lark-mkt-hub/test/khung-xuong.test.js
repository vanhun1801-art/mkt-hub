'use strict';
/**
 * ============================================================================
 * KHUNG XƯƠNG — một khuôn chờ dữ liệu cho CẢ HỆ
 * ============================================================================
 * Anh Hùng: "giao diện toàn ứng dụng có vẻ không có khuôn mẫu cho các thành
 * phần. YouTube cho hiện ra các ô trước rồi mới nạp dữ liệu vào, tạo cảm giác
 * hệ thống không bị lỗi và không trống trơn."
 *
 * Bộ này canh những chỗ dễ vỡ lại nhất — toàn lỗi IM LẶNG, tức là trang vẫn
 * chạy, chỉ là khoảng chờ quay về trống trơn như cũ mà không ai biết:
 *
 *   1. quên nạp khung-xuong.css / .js, hoặc nạp SAI THỨ TỰ (css trước
 *      styles.css thì không đè được nền thật; js sau app.js thì KX chưa tồn tại
 *      lúc vẽ lần đầu);
 *   2. khung xương của lần sơn đầu tiên bị bỏ khỏi index.html rồi chuyển sang
 *      dựng bằng JS — lúc đó người dùng vẫn thấy panel trắng trước đã;
 *   3. sửa bản gốc mà quên chạy `node dong-bo-khung.js`: chín app con giữ bản
 *      cũ, mỗi app một kiểu chờ — đúng chuyện đang đi sửa;
 *   4. mượn biến màu của app (--trang/--vien) trong file dùng chung: app nào
 *      không khai biến đó thì thẻ trắng toát giữa nền tối;
 *   5. hai lớp phủ (.frame-loading của hub, .loader của Bảng công việc) quên
 *      trả `place-items`/`place-content` về mặc định, làm khung xương bị bóp
 *      còn một cột hẹp giữa màn hình;
 *   6. veHome() quay lại lối cũ `if (!tq) return` — trang chủ trống trơn suốt
 *      mấy giây trong khi lớp vỏ ĐÃ biết có những base nào.
 *
 * Chạy: node test/khung-xuong.test.js
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
const CHA = path.join(GOC, '..');
const doc = (p) => fs.readFileSync(path.join(GOC, p), 'utf8');
const HTML = doc('public/index.html');
const CSS = doc('public/khung-xuong.css');
const CSS_SACH = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const KXJS = doc('public/khung-xuong.js');
const APPJS = doc('public/app.js');
const STYLES = doc('public/styles.css');

/* Chín app con — cùng danh sách với dong-bo-khung.js. */
const APP = ['lark-task-manager', 'lark-lich-tac-nghiep', 'lark-ads-manager', 'lark-ota-manager',
  'lark-social', 'lark-chinh-anh', 'lark-kpi', 'lark-quy-chi-phi', 'lark-bao-cao'];

group('Lớp vỏ nạp đúng file, đúng thứ tự');
{
  const iCss = HTML.indexOf('khung-xuong.css');
  const iStyles = HTML.indexOf('styles.css');
  ok('index.html có nạp khung-xuong.css', iCss > 0);
  ok('khung-xuong.css nằm SAU styles.css', iCss > iStyles, 'css=' + iCss + ' styles=' + iStyles);

  const iKx = HTML.indexOf('khung-xuong.js');
  const iApp = HTML.indexOf('/app.js');
  ok('index.html có nạp khung-xuong.js', iKx > 0);
  ok('khung-xuong.js nằm TRƯỚC app.js', iKx > 0 && iKx < iApp, 'kx=' + iKx + ' app=' + iApp);
}

group('Khung xương có mặt ngay ở nhịp sơn đầu tiên (viết thẳng vào HTML)');
{
  const nav = HTML.slice(HTML.indexOf('id="railNav"'), HTML.indexOf('rail-foot'));
  ok('panel base có khung xương sẵn trong HTML', /class="kx /.test(nav));
  const than = HTML.slice(HTML.indexOf('id="homeBody"'), HTML.indexOf('</main>'));
  ok('trang Tổng quan có khung xương sẵn trong HTML', /class="kx /.test(than));
  ok('khung xương trang chủ mượn đúng lưới thật (.luoi-base)', /luoi-base/.test(than));
  ok('không còn dòng "Đang nạp…" trơ trọi ở #homeBody',
    !/id="homeBody"[\s\S]{0,200}class="loading"/.test(HTML));
}

group('File dùng chung: tự lo màu, không mượn biến của app');
{
  ok('có token nền khối xương', /--kx-nen:/.test(CSS));
  ok('có token mặt thẻ giả', /--kx-mat:/.test(CSS));
  ok('KHÔNG mượn --trang của app', !/var\(--trang/.test(CSS_SACH));
  ok('KHÔNG mượn --vien của app', !/var\(--vien/.test(CSS_SACH));

  /* Tối có HAI nhánh như styles.css: người tự chọn "Tối", và hệ thống tối mà
   * người dùng không chọn "Sáng". Thiếu một nhánh là một nửa số người dùng thấy
   * khối xương sáng trắng trên nền đen. */
  ok('khai màu tối cho nhánh tự chọn', /\[data-theme="toi"\][\s\S]{0,200}--kx-nen/.test(CSS_SACH));
  ok('khai màu tối cho nhánh theo hệ thống',
    /prefers-color-scheme: dark[\s\S]{0,400}--kx-nen/.test(CSS_SACH));

  ok('có hiệu ứng lướt', /animation: kx-luot/.test(CSS_SACH));
  ok('tôn trọng "giảm chuyển động"',
    /prefers-reduced-motion[\s\S]{0,300}animation: kx-tho/.test(CSS_SACH));
}

group('Hai lớp phủ phải trả bố cục về mặc định');
{
  /* Chromium áp `justify-items` cho cả hộp khối, nên đổi mỗi `display` là chưa
   * đủ: khung xương vẫn bị bóp còn bề rộng nội dung rồi canh giữa. */
  const fl = STYLES.slice(STYLES.indexOf('.frame-loading.xuong'),
    STYLES.indexOf('.frame-loading.xuong') + 400);
  ok('.frame-loading.xuong đổi sang display block', /display: block/.test(fl));
  ok('.frame-loading.xuong trả place-items về mặc định', /place-items: normal/.test(fl));

  const tm = fs.readFileSync(path.join(CHA, 'lark-task-manager/public/styles.css'), 'utf8');
  const lo = tm.slice(tm.indexOf('.loader.xuong'), tm.indexOf('.loader.xuong') + 400);
  ok('.loader.xuong (Bảng công việc) đổi sang display block', /display: block/.test(lo));
  ok('.loader.xuong trả place-content về mặc định', /place-content: normal/.test(lo));
}

group('Trang Tổng quan vẽ ngay khi biết danh sách base');
{
  ok('veHome KHÔNG còn bỏ chạy khi thiếu số liệu',
    !/const tq = S\.tq;\s*\n\s*if \(!tq\) return;/.test(APPJS));
  ok('có cờ chờ số liệu', /const choSo = !S\.tq;/.test(APPJS));
  ok('napHub vẽ trang chủ khi chưa có số',
    /if \(!S\.tq && S\.view === 'home'\) veHome\(\)/.test(APPJS));
  ok('ô số để khung xương khi đang chờ', /if \(choSo\) \{[\s\S]{0,80}KX\.the\(6\)/.test(APPJS));
  ok('dải nhiệt có khung xương', /KX\.tai\(hang, ngay\)/.test(APPJS));
  ok('mở app con hiện khung xương của một màn app', /KX\.man\(esc\(mod\.ten\)\)/.test(APPJS));

  /* Mọi lời gọi KX đều phải có đường lùi: file khung xương lỡ không nạp được
   * thì trang vẫn chạy, chỉ là quay về dòng chữ như cũ. */
  const goi = APPJS.match(/KX\.\w+\(/g) || [];
  ok('có dùng bộ dựng khung xương', goi.length >= 5, goi.length + ' lời gọi');
  ok('mọi lời gọi đều đi kèm kiểm tra window.KX',
    (APPJS.match(/window\.KX \?/g) || []).length >= 5);
}

group('Bộ dựng khung xương mượn đúng lớp bố cục thật');
{
  ok('lưới base dùng .luoi-base', /class="luoi-base"/.test(KXJS));
  ok('ô số dùng .the-luoi > .the', /class="the-luoi"/.test(KXJS) && /class="the kx-the"/.test(KXJS));
  ok('dòng việc dùng .viec-dong', /class="viec-dong/.test(KXJS));
  ok('dải nhiệt dùng .tn-hang/.tn-o', /class="tn-hang"/.test(KXJS) && /'tn-o'/.test(KXJS));
  /* Bề rộng lấy theo vòng số cố định: random thì mỗi nhịp vẽ một hình khác,
   * khung xương tự nhấp nháy lung tung. */
  ok('bề rộng dòng KHÔNG dùng random', !/Math\.random/.test(KXJS));

  /* Nhóm CHUNG phải chỉ dùng lớp kx-*: app con gọi mấy hàm này. */
  for (const h of ['oSo', 'dong', 'log', 'bang', 'man']) {
    ok('có hàm dùng chung KX.' + h, KXJS.includes('\n    ' + h + '('));
  }
  const chung = KXJS.slice(KXJS.indexOf('oSo(n)'), KXJS.indexOf('---- ô số trong một base'));
  ok('nhóm chung không mượn lớp bố cục của lớp vỏ',
    !/(the-luoi|tn-hang|viec-dong|luoi-base|nhom-base)/.test(chung));
}

group('Chín app con dùng đúng MỘT bản khung xương');
{
  const TEP = ['khung-xuong.css', 'khung-xuong.js'];
  const goc = TEP.map((t) => fs.readFileSync(path.join(GOC, 'public', t)));
  const lech = [];
  const thieuLink = [];
  const thieuJs = [];
  const thieuThan = [];
  const saiThuTu = [];
  for (const ten of APP) {
    TEP.forEach((t, i) => {
      const f = path.join(CHA, ten, 'public', t);
      if (!fs.existsSync(f) || !fs.readFileSync(f).equals(goc[i])) lech.push(ten + '/' + t);
    });
    const html = fs.readFileSync(path.join(CHA, ten, 'public', 'index.html'), 'utf8');
    if (!/khung-xuong\.css/.test(html)) thieuLink.push(ten);
    if (!/<script[^>]+khung-xuong\.js/.test(html)) thieuJs.push(ten);
    if (!/class="kx-man|class="kx-lich/.test(html)) thieuThan.push(ten);
    /* Nạp sau app.js thì lúc app vẽ lần đầu chưa có KX — mọi chỗ chờ lặng lẽ
     * rơi về đường lùi chữ, và không ai thấy gì sai để mà đi sửa. */
    const iKx = html.indexOf('khung-xuong.js');
    const iApp = html.search(/<script[^>]+\bapp\.js/);
    if (iKx < 0 || iApp < 0 || iKx > iApp) saiThuTu.push(ten);
  }
  ok('bản chép khớp bản gốc từng byte', lech.length === 0,
    lech.join(', ') + (lech.length ? ' — chạy: node dong-bo-khung.js' : ''));
  ok('app nào cũng nạp khung-xuong.css', thieuLink.length === 0, thieuLink.join(', '));
  ok('app nào cũng nạp khung-xuong.js', thieuJs.length === 0, thieuJs.join(', '));
  ok('khung-xuong.js nạp TRƯỚC app.js ở mọi app', saiThuTu.length === 0, saiThuTu.join(', '));
  ok('app nào cũng có khung xương lúc khởi động', thieuThan.length === 0, thieuThan.join(', '));

  /* Nhóm hàm riêng của lớp vỏ mượn lớp bố cục của trang Tổng quan (.the-luoi,
   * .tn-hang, .viec-dong…). App con gọi vào là ăn nhầm CSS của chính nó —
   * `.the` bên Báo cáo là thẻ báo cáo, bên lớp vỏ là ô số. */
  const RIENG = ['the', 'khoiBase', 'luoiBase', 'viec', 'tai', 'rail', 'tin'];
  const goiBay = [];
  for (const ten of APP) {
    const dir = path.join(CHA, ten, 'public');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'khung-xuong.js')) {
      const js = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const h of RIENG) {
        if (js.includes('KX.' + h + '(')) goiBay.push(ten + '/' + f + ' -> KX.' + h);
      }
    }
  }
  ok('app con KHÔNG gọi nhóm hàm riêng của lớp vỏ', goiBay.length === 0, goiBay.join(', '));

  /* Đường lùi: file khung xương lỡ không nạp được thì app vẫn chạy. */
  const thieuLui = [];
  for (const ten of APP) {
    const dir = path.join(CHA, ten, 'public');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'khung-xuong.js')) {
      const js = fs.readFileSync(path.join(dir, f), 'utf8');
      const soGoi = (js.match(/KX\.\w+\(/g) || []).length;
      const soLui = (js.match(/window\.KX/g) || []).length;
      if (soGoi && soLui < 1) thieuLui.push(ten + '/' + f);
    }
  }
  ok('mọi lời gọi ở app con đều có đường lùi', thieuLui.length === 0, thieuLui.join(', '));

  ok('có sẵn lệnh đồng bộ', fs.existsSync(path.join(GOC, 'dong-bo-khung.js')));
  const dbk = doc('dong-bo-khung.js');
  const thieuKhai = APP.filter((x) => !dbk.includes(x));
  ok('lệnh đồng bộ khai đủ chín app', thieuKhai.length === 0, thieuKhai.join(', '));
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
