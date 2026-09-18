'use strict';
/**
 * ============================================================================
 * LỚP ĐIỆN THOẠI DÙNG CHUNG — cỡ chữ, sàn chạm, và cái bẫy độ ưu tiên
 * ============================================================================
 * Anh Hùng: "việc tối ưu hóa cho giao diện Mobile cần làm chỉnh chu hơn".
 *
 * Đo lại cả mười mặt ở khổ 375px trước khi sửa: bố cục đã tự co gần đúng rồi,
 * cái thiếu không phải layout mà là CỠ — 212 luật đặt chữ 9-11.5px, nút cao
 * 13-37px, và 15 ô nhập dưới 16px (iOS tự phóng to cả trang khi bấm vào, và
 * không tự thu lại). Ba app còn trượt ngang 76-85px vì dãy nút bên phải thanh
 * đầu khai flex: none nên không chịu co.
 *
 * Bộ này chốt những chỗ dễ vỡ lại nhất — TOÀN LÀ LỖI IM LẶNG, trên máy tính
 * nhìn vẫn hoàn toàn bình thường:
 *
 *   1. ai đó thêm một luật font-size 10px mới mà quên nâng ở khối điện thoại;
 *   2. ai đó chèn dienthoai.css vào ĐẦU <head> cho "gọn" — nó nằm trước
 *      styles.css của module, thua hết về thứ tự, cả file thành vô tác dụng;
 *   3. ai đó rút .btn.btn về .btn cho "sạch" — tụt từ ưu tiên 0,2,0 xuống
 *      0,1,0 và thua luật `.wcard-actions .btn` của Bảng công việc;
 *   4. ai đó gắn tiền tố /m/<id>/ vào href của dienthoai.css — trỏ sang server
 *      của module, nơi không có file đó, và trang mất trắng lớp điện thoại;
 *   5. một app mới lại khai flex: none cho dãy nút thanh đầu.
 *
 * Chạy: node test/dien-thoai.test.js
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

const DT = doc('public/dienthoai.css');
const DT_SACH = DT.replace(/\/\*[\s\S]*?\*\//g, '');
const HTML = doc('public/index.html');
const PROXY = doc('proxy.js');

/* Đọc CSS thành danh sách luật KÈM NGỮ CẢNH @media. Cần ngữ cảnh chứ không chỉ
 * selector: cả bài kiểm ở dưới xoay quanh câu hỏi "luật này nằm trong hay ngoài
 * khối điện thoại", mà một regex phẳng thì không phân biệt được hai chỗ đó. */
function docLuat(css) {
  const sach = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const ra = [];
  const ngan = [];
  let dem = '';
  for (let i = 0; i < sach.length; i++) {
    const c = sach[i];
    if (c === '{') { ngan.push(dem.trim().replace(/\s+/g, ' ')); dem = ''; continue; }
    if (c === '}') {
      const sel = ngan[ngan.length - 1] || '';
      const media = ngan.slice(0, -1).filter((x) => x.startsWith('@media')).join(' ');
      if (!sel.startsWith('@')) ra.push({ sel, than: dem, media });
      ngan.pop(); dem = '';
      continue;
    }
    dem += c;
  }
  return ra;
}

const coChu = (than) => {
  const m = than.match(/font-size\s*:\s*([\d.]+)px/);
  return m ? parseFloat(m[1]) : null;
};

/* "Khối điện thoại" = @media max-width từ 640px trở xuống. Không ghi cứng đúng
 * 640: app quảng cáo vá dãy nút ở 900px từ trước và vẫn đúng, nhưng riêng phần
 * cỡ chữ thì cả mười app đều dùng 640. */
const laKhoiDienThoai = (media) => {
  const m = media.replace(/\s+/g, '').match(/max-width:(\d+)px/);
  return !!m && Number(m[1]) <= 640;
};

/* Những chỗ font-size đang chỉnh cỡ một KÝ HIỆU nằm trong hộp vuông (ảnh đại
 * diện, icon, mũi nháy, logo) chứ không phải cỡ chữ người ta đọc — cố ý không
 * nâng. Danh sách này phải khớp với ghi chú trong dienthoai.css và trong khối
 * "sàn cỡ chữ" của từng app. */
const THA = [
  /\.av\b/, /\.av-/, /ava\b/, /caret/, /thumb/,
  /-ic\b/, /\.ic\b/, /kh-ic\b/, /^\.logo$/, /ota-api-logo/,
  /\.rail\.min /, /summary::before/,
];
const tha = (sel) => THA.some((r) => r.test(sel));

/* ------------------------------------------------------------------ */
group('[1] File lớp điện thoại có tồn tại và đúng hình dạng');

ok('public/dienthoai.css tồn tại', DT.length > 0);
{
  const luat = docLuat(DT);
  const ngoai = luat.filter((l) => !laKhoiDienThoai(l.media));
  ok('mọi luật trong file đều nằm trong khối điện thoại',
    luat.length > 0 && ngoai.length === 0,
    ngoai.map((l) => l.sel).join(', ') || 'file rỗng?');
}
ok('có luật 16px cho ô nhập (bẫy tự phóng to của iOS)',
  /input[^{]*\{[^}]*font-size:\s*16px/.test(DT_SACH));
/* !important ở đây là CỐ Ý: 15 luật trong 5 app đặt cỡ ô nhập bằng selector
 * lớp, mà lớp thắng phần tử. Bỏ !important đi là bẫy iOS quay lại nguyên vẹn. */
ok('luật 16px có !important (nếu không thì thua selector lớp của app)',
  /font-size:\s*16px\s*!important/.test(DT_SACH));
ok('có sàn chạm 40px', /min-height:\s*40px/.test(DT_SACH));
ok('có ngoại lệ cho thứ nằm trong bảng (bảng 165 dòng không được cao thêm 40px/dòng)',
  /table[^{]*\{[^}]*min-height:\s*3\dpx/.test(DT_SACH));
ok('checkbox được nới to (mặc định 13px, ngón tay bấm trượt sang dòng bên)',
  /input\[type="checkbox"\][\s\S]{0,160}?width:\s*2\dpx/.test(DT_SACH));

/* Bẫy số 3. Phải soi ĐÚNG luật sàn chạm, không phải bất kỳ chỗ nào có chuỗi
 * ".btn.btn" — ngoại lệ trong bảng cũng viết `table .btn.btn`, nên hỏi trống
 * kiểu /\.btn\.btn/ là vẫn xanh sau khi luật chính đã bị rút về `.btn`. */
{
  const luatBtn = docLuat(DT).find((l) => /(^|,)\s*\.btn/.test(l.sel) && !/table/.test(l.sel));
  ok('luật sàn chạm của .btn viết lặp lớp để thắng `.x .btn` của app',
    !!luatBtn && /\.btn\.btn\b/.test(luatBtn.sel),
    'đang là: ' + (luatBtn ? luatBtn.sel : '(không thấy luật nào)')
      + ' — rút .btn.btn về .btn là tụt ưu tiên 0,2,0 xuống 0,1,0');
}

/* ------------------------------------------------------------------ */
group('[2] Lớp vỏ nạp đúng file');

ok('index.html có <link> tới dienthoai.css', /dienthoai\.css/.test(HTML));
{
  /* So vị trí của hai THẺ <link>, không so vị trí của chuỗi "styles.css" trần:
   * chú thích ngay trên thẻ viewport cũng nhắc tên dienthoai.css, và chuỗi đó
   * đứng trước — so trần là test đỏ vì test sai. */
  const khongChuThich = HTML.replace(/<!--[\s\S]*?-->/g, '');
  const iSty = khongChuThich.search(/<link[^>]*href="[^"]*\/styles\.css/);
  const iDt = khongChuThich.search(/<link[^>]*href="[^"]*\/dienthoai\.css/);
  ok('thẻ <link> dienthoai.css đứng SAU thẻ styles.css', iSty > -1 && iDt > iSty,
    'khai trước là thua về thứ tự, cả file vô tác dụng');
}
/* env(safe-area-inset-*) trả 0 nếu thiếu viewport-fit=cover — thanh trên cùng
 * sẽ nằm dưới tai thỏ, mà trên máy tính không đời nào thấy được. */
ok('meta viewport có viewport-fit=cover',
  /<meta name="viewport"[^>]*viewport-fit=cover/.test(HTML));
ok('dienthoai.css có dùng env(safe-area-inset-*)', /env\(safe-area-inset-/.test(DT_SACH));

/* ------------------------------------------------------------------ */
group('[3] Proxy chèn file vào app con đúng chỗ');

ok('proxy.js có chèn dienthoai.css', /dienthoai\.css/.test(PROXY));
{
  /* Bẫy số 2: phải chèn ở CUỐI <head>. Kiểm bằng khoảng cách trong mã — chỗ
   * dựng linkDt và chỗ tìm </head> phải nằm sát nhau. */
  const iLink = PROXY.indexOf('linkDt');
  const iDong = PROXY.indexOf('head>', iLink);
  ok('chèn vào TRƯỚC </head> chứ không phải ngay sau <head>',
    iLink > -1 && iDong > iLink && iDong - iLink < 400,
    'chèn ngay sau <head> là nằm trước styles.css của module, thua thứ tự');

  /* Bẫy số 4: href phải giữ nguyên gốc "/dienthoai.css". Lượt gắn tiền tố chỉ
   * chạy trên `out` TRƯỚC đoạn này, nên kiểm thứ tự trong mã là đủ chắc. */
  const iThay = PROXY.indexOf('href|src|action|data-src');
  ok('chèn link SAU lượt gắn tiền tố (để href giữ nguyên /dienthoai.css)',
    iThay > -1 && iLink > iThay);
  ok('href trong mã không mang tiền tố /m/', /href="\/dienthoai\.css/.test(PROXY),
    'phải là href="/dienthoai.css", không phải /m/<id>/dienthoai.css');
}

/* ------------------------------------------------------------------ */
group('[4] Mười app: luật chữ nhỏ nào cũng có luật nâng đi kèm');

const goc = path.join(GOC, '..');
const apps = fs.readdirSync(goc).filter((d) => d.startsWith('lark-') &&
  fs.existsSync(path.join(goc, d, 'public', 'styles.css')));
ok('quét được nhiều app', apps.length >= 9, String(apps.length));

for (const a of apps) {
  const luat = docLuat(fs.readFileSync(path.join(goc, a, 'public', 'styles.css'), 'utf8'));
  const nen = new Map();   // selector -> cỡ khai NGOÀI khối điện thoại
  const dt = new Map();    // selector -> cỡ khai TRONG khối điện thoại
  for (const l of luat) {
    const px = coChu(l.than);
    if (px === null) continue;
    (laKhoiDienThoai(l.media) ? dt : nen).set(l.sel, px);
  }
  const hong = [];
  for (const [sel, px] of nen) {
    if (px >= 12 || tha(sel)) continue;
    const nang = dt.get(sel);
    if (!(nang >= 12)) {
      hong.push(sel + ' (' + px + 'px' + (nang ? ' -> ' + nang + 'px' : ', chưa nâng') + ')');
    }
  }
  ok(a + ': chữ <12px nào cũng được nâng ở khối điện thoại',
    hong.length === 0, hong.slice(0, 6).join(' | '));
}

/* ------------------------------------------------------------------ */
group('[5] Dãy nút thanh đầu: app nào cũng chịu xuống dòng');

for (const a of apps) {
  const pHtml = path.join(goc, a, 'public', 'index.html');
  if (!fs.existsSync(pHtml)) continue;
  const html = fs.readFileSync(pHtml, 'utf8');
  const lop = /class="top-right"/.test(html) ? 'top-right'
    : /class="topbar-right"/.test(html) ? 'topbar-right' : null;
  if (!lop) continue;          // app không có dãy nút kiểu đó thì không có gì để hỏi
  const luat = docLuat(fs.readFileSync(path.join(goc, a, 'public', 'styles.css'), 'utf8'));
  /* Câu hỏi thật là "dãy này có chịu xuống dòng khi hết chỗ không", nên có HAI
   * cách trả lời đúng, nhận cả hai:
   *   · khai wrap ngay ở luật gốc (KPI và OTA làm thế — luôn đúng ở mọi khổ);
   *   · khai wrap trong một @media khổ hẹp (bảy app còn lại).
   * Không ghi cứng 640px: app quảng cáo vá ở 900px từ trước và vẫn đúng. */
  const coWrap = luat.some((l) =>
    (l.media === '' || /max-width/.test(l.media)) &&
    new RegExp('\\.' + lop + '(\\b|$)').test(l.sel) &&
    /flex-wrap:\s*wrap|flex:\s*1 1 100%/.test(l.than));
  /* Và chắc chắn KHÔNG được có luật gốc nào khoá nó lại. Đây mới là cái bẫy
   * thật: `flex: none` / `flex-shrink: 0` là thứ đã làm ba app trượt ngang. */
  const coKhoa = luat.some((l) =>
    l.media === '' &&
    new RegExp('\\.' + lop + '(\\b|$)').test(l.sel) &&
    /flex:\s*none|flex-shrink:\s*0/.test(l.than));
  ok(a + ': .' + lop + ' chịu xuống dòng khi hết chỗ', coWrap,
    'thiếu là trang trượt ngang trên điện thoại');
  if (coKhoa) {
    /* Có khoá thì phải có luật gỡ khoá ĐẶC TRƯNG HƠN (thêm một cấp cha), vì
     * @media không cộng thêm độ ưu tiên nào — viết ngang nhau là thua. */
    const coGo = luat.some((l) =>
      /max-width/.test(l.media) &&
      new RegExp('[\\s>]\\.' + lop + '(\\b|$)').test(l.sel) &&
      /flex:\s*1 1 100%/.test(l.than));
    ok(a + ': luật gỡ `flex: none` đủ đặc trưng để thắng', coGo,
      'viết `.' + lop + '` trơn là ngang ưu tiên với luật gốc — phải thêm cấp cha');
  }
}

/* ------------------------------------------------------------------ */
group('[6] Thu gọn khối lọc (thugon.js)');

const TG = doc('public/thugon.js');
const CONFIG = doc('config.js');
const I18N = doc('public/i18n.js');
const MODS = JSON.parse(doc('modules.json'));

ok('public/thugon.js tồn tại', TG.length > 0);
/* Chỉ điện thoại. Bỏ mốc này đi là máy tính dính một nút "Lọc" vô nghĩa và
 * khối lọc bị thu lại ngay giữa màn 1440px. */
ok('chỉ chạy ở ≤640px', /matchMedia\(\s*'\(max-width:\s*640px\)'\s*\)/.test(TG));
ok('mặc định đóng', /MO_SAN\s*=\s*false/.test(TG));

/* Cái bẫy đã sập một lần: `document.body.offsetParent` theo chuẩn CSS LUÔN là
 * null, nên phép kiểm "cha có hiện không" viết bằng offsetParent làm Social và
 * Booking OTA (khối lọc là con trực tiếp của <body>) vĩnh viễn không có thanh
 * thu gọn — mà im lặng, không lỗi gì cả. */
ok('không hỏi offsetParent của cha để đoán ẩn/hiện',
  !/parentElement[\s\S]{0,40}offsetParent/.test(TG.replace(/\/\*[\s\S]*?\*\//g, '')),
  'document.body.offsetParent luôn null — dùng nó là bỏ sót app có khối lọc nằm ngay dưới <body>');

/* Bẫy thứ hai: Bảng công việc có ba khối .filters, mỗi tab một khối. Dùng
 * querySelector (một khối) thì hai tab còn lại không bao giờ thu gọn được. */
ok('duyệt MỌI khối khớp selector, không chỉ khối đầu',
  /querySelectorAll\(s\)/.test(TG),
  'Bảng công việc có 3 khối .filters — mỗi tab một khối');

ok('câu tóm tắt đặt bằng textContent, không phải innerHTML',
  /\.tg-tt'\)\.textContent\s*=/.test(TG),
  'câu này chứa tên chiến dịch / nội dung ô tìm — dữ liệu thật, không được thành thẻ HTML');

ok('lớp vỏ nạp thugon.js', /thugon\.js/.test(HTML));
ok('lớp vỏ đánh dấu khối lọc bằng data-thu-gon',
  /<section[^>]*class="loc-bar"[^>]*data-thu-gon/.test(HTML));
ok('proxy nạp thugon.js cho app con', /thugon\.js/.test(PROXY));
ok('proxy truyền locSelector xuống __HUB__', /locSelector:\s*\$\{JSON\.stringify\(mod\.locSelector/.test(PROXY));

/* Bẫy thứ ba, và là cái mất thời gian nhất: docModules() trong config.js là
 * DANH SÁCH TRẮNG. Field nào không gọi tên ở đó thì rơi mất trên đường từ
 * modules.json ra proxy — rơi im lặng, module vẫn chạy bình thường, chỉ là
 * locSelector luôn rỗng và không khối nào thu gọn được. */
ok('config.js có khai locSelector trong danh sách trắng',
  /locSelector:\s*m\.locSelector/.test(CONFIG),
  'thiếu dòng này thì modules.json khai bao nhiêu cũng vô nghĩa');

ok("i18n có khoá 'Lọc'", /'Lọc':/.test(I18N));
ok('dienthoai.css có luật đóng khối', /\.tg-dong\s*\{[^}]*display:\s*none/.test(DT_SACH));
ok('dienthoai.css có thanh tóm tắt', /\.tg-thanh\s*\{/.test(DT_SACH));

/* Mỗi selector khai trong modules.json phải là lớp CÓ THẬT trong chính app đó.
 * Gõ nhầm một chữ thì không có lỗi nào cả — thanh chỉ lặng lẽ không hiện. */
{
  const thuMuc = {
    'cong-viec': 'lark-task-manager', 'lich-tac-nghiep': 'lark-lich-tac-nghiep',
    'quang-cao': 'lark-ads-manager', 'ota': 'lark-ota-manager', 'social': 'lark-social',
    'kpi': 'lark-kpi', 'quy-chi-phi': 'lark-quy-chi-phi', 'chinh-anh': 'lark-chinh-anh',
    'bao-cao': 'lark-bao-cao',
  };
  const khai = MODS.modules.filter((m) => m.locSelector);
  ok('có module khai locSelector', khai.length >= 5, String(khai.length));
  khai.forEach((m) => {
    const d = thuMuc[m.id];
    if (!d) { ok(m.id + ': biết app nằm ở thư mục nào', false, 'chưa khai trong bảng của test'); return; }
    const lop = m.locSelector.replace(/^\./, '');
    const f = path.join(GOC, '..', d, 'public');
    const css = fs.existsSync(path.join(f, 'styles.css'))
      ? fs.readFileSync(path.join(f, 'styles.css'), 'utf8') : '';
    const js = fs.existsSync(path.join(f, 'app.js'))
      ? fs.readFileSync(path.join(f, 'app.js'), 'utf8') : '';
    const html = fs.existsSync(path.join(f, 'index.html'))
      ? fs.readFileSync(path.join(f, 'index.html'), 'utf8') : '';
    const re = new RegExp('\\b' + lop.replace(/[-]/g, '\\-') + '\\b');
    ok(m.id + ': lớp "' + m.locSelector + '" có thật trong app',
      re.test(css) || re.test(js) || re.test(html));
  });
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
