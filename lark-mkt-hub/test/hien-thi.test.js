'use strict';
/**
 * ============================================================================
 * BA LỖI HIỂN THỊ ĐO ĐƯỢC NGÀY 18/09/2026 — chốt lại để không quay về
 * ============================================================================
 * Anh Hùng: "Kiểm tra lại toàn bộ ứng dụng về phần hiển thị." Mở lần lượt lớp
 * vỏ và chín app con trên khung 1440×900 rồi 375×812, đo bằng DOM chứ không
 * nhìn ảnh: bề rộng cuộn của trang, ảnh vỡ, phần tử vượt mép, chữ "NaN /
 * undefined / [object Object]" lọt ra giao diện.
 *
 * Ba chỗ hỏng thật, cả ba đều IM LẶNG trên máy tính:
 *
 *   1. Quản lý quảng cáo — trên máy 375px, dãy nút bên phải thanh trên cùng
 *      không xuống dòng (riêng ô "Trực tiếp · Facebook, TikTok · Google Ads
 *      LỖI 09:07" đã 335px, cả dãy 521px) nên CẢ TRANG rộng 541px và trượt
 *      ngang. Thêm: dãy sáu mốc thời gian thừa 10px mà `.seg` lại
 *      overflow: hidden ⇒ chữ "Năm nay" bị xén, không cuộn tới được.
 *
 *   2. Báo cáo & KPI — tám tab cộng lại 480px, không cuộn được, đẩy trang
 *      rộng 494px; dãy sáu mốc thời gian cũng vậy.
 *
 *   3. Booking OTA — mở TRONG lớp vỏ thì lớp vỏ đẩy khoảng thời gian chung
 *      xuống ngay lúc DOM vừa dựng, app vẽ danh sách trước khi /api/meta về,
 *      và một chỗ đọc `S.meta.chuaDay` thiếu lá chắn ⇒ hộp đỏ "Cannot read
 *      properties of null (reading 'chuaDay')" ngay giữa màn. Mở thẳng
 *      /m/ota/ thì không bao giờ thấy, vì không ai đẩy bộ lọc xuống.
 *
 * Bộ này chỉ soi LUẬT trong file (không dựng trình duyệt) — đủ để bắt khi ai
 * đó xoá mấy dòng CSS/lá chắn ở trên, mà chạy được trong một giây.
 *
 * Chạy: node test/hien-thi.test.js
 */
const fs = require('fs');
const path = require('path');

const GOC = path.join(__dirname, '..');
const CHA = path.join(GOC, '..');
const doc = (...p) => fs.readFileSync(path.join(CHA, ...p), 'utf8');

/** Cắt đúng thân một khối @media bằng cách đếm ngoặc — cắt theo số ký tự thì
 *  thêm vài dòng chú thích là luật cần soi rơi ra ngoài lát cắt, test đỏ oan. */
function khoiMedia(css, mo) {
  const i = css.indexOf(mo);
  if (i < 0) return '';
  let sau = 0;
  const bat = css.indexOf('{', i);
  for (let j = bat; j < css.length; j++) {
    if (css[j] === '{') sau++;
    else if (css[j] === '}' && --sau === 0) return css.slice(bat + 1, j);
  }
  return '';
}

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' → ' + vi : '')); console.log('  ✗ ' + ten); }
};
const group = (t) => console.log('\n' + t);

group('Quản lý quảng cáo — thanh trên cùng trên máy hẹp');
{
  const css = doc('lark-ads-manager', 'public', 'styles.css');
  const mq = khoiMedia(css, '@media (max-width: 900px)');

  /* Phải là `.topbar > .topbar-right`: luật gốc `.topbar-right { flex: none }`
   * nằm DƯỚI khối @media trong file, mà @media không cộng độ ưu tiên — viết
   * ngang nhau thì luật đứng sau thắng và khối này thành vô nghĩa. */
  ok('dãy nút bên phải chiếm trọn một dòng', /\.topbar\s*>\s*\.topbar-right\s*\{[^}]*flex:\s*1 1 100%/.test(mq));
  ok('và được xuống dòng', /\.topbar\s*>\s*\.topbar-right\s*\{[^}]*flex-wrap:\s*wrap/.test(mq));
  ok('ô "Trực tiếp …" ngắt dòng được', /\.btn\.src\s*\{[^}]*white-space:\s*normal/.test(mq));
  ok('dãy mốc thời gian xuống dòng', /\.seg\s*\{[^}]*flex-wrap:\s*wrap/.test(mq));
  ok('luật gốc vẫn khoá .seg lại (nên mới cần luật trên)',
    /\.seg \{[^}]*overflow: hidden/.test(css));
}

group('Báo cáo & KPI — khay tab và bộ lọc');
{
  const css = doc('lark-kpi', 'public', 'styles.css');
  ok('khay tám tab cuộn ngang', /\.tabs \{[^}]*overflow-x:\s*auto/.test(css));
  ok('tab không tự ngắt chữ (cuộn chứ không xuống dòng)', /\.tab \{[^}]*white-space:\s*nowrap/.test(css));
  const mq720 = khoiMedia(css, '@media (max-width: 720px)');
  ok('dãy mốc thời gian xuống dòng trên máy hẹp', /\.seg \{ flex-wrap: wrap/.test(mq720));
}

group('Booking OTA — vẽ trước khi /api/meta về');
{
  const js = doc('lark-ota-manager', 'public', 'app.js');
  ok('chỗ đọc chuaDay đã có lá chắn', /\(\(S\.meta && S\.meta\.chuaDay\) \|\| 0\)/.test(js));
  ok('không còn chỗ đọc thẳng S.meta.chuaDay', !/[^&]\s\(S\.meta\.chuaDay/.test(js));
}

group('Mọi app con đều theo được tông tối của lớp vỏ');
{
  /* Lớp vỏ đặt data-theme lên <html> của app con (shim trong proxy.js). App nào
   * không khai bảng màu tối thì giữa nền tối của vỏ hiện ra một mảng TRẮNG
   * TOÁT — đo ngày 18/09/2026: ba app dưới đây đang như vậy. Danh sách chờ là
   * cố ý: nó phải NGẮN DẦN, và thêm app mới vào danh sách thì phải cố ý thêm. */
  const CHUA_CO = ['lark-kpi', 'lark-quy-chi-phi', 'lark-bao-cao'];
  const apps = fs.readdirSync(CHA).filter((d) => d.startsWith('lark-') && d !== 'lark-mkt-hub'
    && d !== 'lark-chung' && fs.existsSync(path.join(CHA, d, 'public', 'styles.css')));
  const thieu = apps.filter((d) => !doc(d, 'public', 'styles.css').includes('data-theme="toi"'));
  ok('không app nào TỤT khỏi danh sách (nghĩa là có app vừa mất bảng màu tối)',
    thieu.every((d) => CHUA_CO.includes(d)), thieu.filter((d) => !CHUA_CO.includes(d)).join(', '));
  const daLam = CHUA_CO.filter((d) => !thieu.includes(d));
  if (daLam.length) {
    console.log('  … ' + daLam.join(', ') + ' đã có bảng màu tối — bỏ khỏi CHUA_CO trong file này.');
  }
  ok('sáu app còn lại vẫn theo tông tối', apps.length - thieu.length >= 6,
    (apps.length - thieu.length) + '/' + apps.length);
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
