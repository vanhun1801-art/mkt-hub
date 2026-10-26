'use strict';
/**
 * ============================================================================
 * Mọi lời gọi hàm trong public/*.js phải trỏ tới một hàm CÓ THẬT
 * ============================================================================
 * Ngày 08/10/2026 anh Hùng báo "các nút ấn xử lý việc mở việc từ đây không còn
 * hoạt động tốt". Bấm "Mở chi tiết" trong cửa sổ Xử lý nhanh thì:
 *
 *     Uncaught ReferenceError: moViec is not defined
 *
 * `moViec` chưa bao giờ tồn tại. Hàm đúng là moModule(), hoặc đi qua đường băm
 * `#/m/<id>?rec=...`. Nhưng thứ làm lỗi này sống lâu là thứ tự trong handler:
 *
 *     dongModal();            // đóng cửa sổ — chạy xong
 *     moViec(modId, id);      // ném ReferenceError — chết ở đây
 *
 * Cửa sổ vẫn đóng lại gọn gàng, nên NHÌN y như vừa bấm xong việc gì đó. Không
 * thông báo đỏ, không có gì đứng im lại. Người dùng chỉ thấy "bấm xong chẳng ra
 * gì" rồi bấm lại lần nữa, và không ai mở Console ra xem.
 *
 * JavaScript không có trình biên dịch bắt giùm, mà mở trình duyệt bấm thử từng
 * nút thì không bao giờ phủ hết. Nên quét tĩnh: gom mọi tên được KHAI BÁO trong
 * public/*.js, rồi soi mọi chỗ GỌI `ten(`.
 *
 * BA THỨ PHẢI DỌN TRƯỚC KHI QUÉT, không dọn là ngập báo oan:
 *   · chú thích  — `moViec(...)` nhắc trong chính chú thích này cũng bị bắt
 *   · chuỗi      — CSS trong chuỗi đầy `var(`, `rgba(`, `translate3d(`, `env(`
 *   · hàm sẵn có — mã gọi thẳng `getComputedStyle(`, `matchMedia(` không có
 *                  `window.` đứng trước; Node không có chúng nên tưởng là thiếu
 *
 * Chạy: node test/goi-ham-co-that.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; fails.push(ten); console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};

const DIR = path.join(__dirname, '..', 'public');

/* Từ khoá: `if (`, `for (`, `catch (` trông y hệt lời gọi hàm. */
const TU_KHOA = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof',
  'function', 'await', 'new', 'do', 'else', 'case', 'delete', 'void', 'in', 'of',
  'yield', 'throw', 'super', 'import', 'instanceof', 'async', 'var', 'let', 'const']);

/* Hàm sẵn có của trình duyệt mà mã này gọi KHÔNG kèm `window.`. Node không có
 * chúng, nên phải kê tay. Kê thiếu thì test đỏ oan và sẽ có người tới đọc dòng
 * này — đó là ý đồ: danh sách phải đúng, không phải phỏng đoán. */
const CUA_TRINH_DUYET = new Set([
  'addEventListener', 'removeEventListener', 'dispatchEvent',
  'getComputedStyle', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'AbortController',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
  'fetch', 'alert', 'confirm', 'prompt', 'open', 'close', 'scrollTo', 'postMessage',
  'FormData', 'URLSearchParams', 'URL', 'Blob', 'File', 'FileReader', 'Image',
  'Audio', 'Headers', 'Request', 'Response', 'CustomEvent', 'Event', 'MouseEvent',
  'KeyboardEvent', 'DOMParser', 'XMLHttpRequest', 'IntlDateTimeFormat', 'btoa', 'atob',
  'structuredClone', 'reportError', 'getSelection', 'print', 'focus', 'blur',
  'MediaRecorder', 'createImageBitmap',
  'Path2D', 'ClipboardItem', 'EventSource', 'Notification',
]);

/**
 * Chỉ giữ lại phần MÃ: xoá ruột chú thích, chuỗi và biểu thức chính quy, thay
 * bằng khoảng trắng để số dòng không đổi.
 *
 * Phải đi từng ký tự, không dùng regex. Đã thử regex và hỏng nặng: mã của hub
 * đầy dấu nháy đơn trong chuỗi nháy kép và ngược lại, nên cặp nháy ghép lệch
 * nhau, một lần chạy nuốt mất 70% tệp app.js — và phép quét im lặng báo thiếu
 * cả moModule lẫn veHome, những hàm nằm sờ sờ ở đó. Một phép thử tự nói dối
 * còn tệ hơn là không có phép thử.
 *
 * Vì sao phải xoá cả chuỗi: hub dựng HTML và CSS bằng chuỗi, mà CSS thì đầy
 * `var(--x)`, `rgba(…)`, `translate3d(…)`, `cubic-bezier(…)` — để nguyên thì
 * phép quét đi bắt tên hàm CSS và báo thiếu hàng chục cái.
 */
function chiLayMa(s) {
  let ra = '';
  let i = 0;
  /* Ký tự có nghĩa gần nhất — để biết dấu `/` đang mở một biểu thức chính quy
   * hay chỉ là phép chia. Sau `(`, `,`, `=`, `:`, `[`, `!`, `&`, `|`, `?`,
   * `{`, `}`, `;` và đầu tệp thì nó là biểu thức chính quy. */
  let truoc = '';
  const giu = (c) => { ra += c; if (!/\s/.test(c)) truoc = c; };
  const bo = (c) => { ra += /\n/.test(c) ? '\n' : ' '; };

  while (i < s.length) {
    const c = s[i];
    const d = s[i + 1];

    if (c === '/' && d === '/') {                       // chú thích một dòng
      while (i < s.length && s[i] !== '\n') { bo(s[i]); i++; }
      continue;
    }
    if (c === '/' && d === '*') {                       // chú thích nhiều dòng
      bo(c); bo(d); i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) { bo(s[i]); i++; }
      if (i < s.length) { bo(s[i]); bo(s[i + 1]); i += 2; }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {          // chuỗi
      giu(c); i++;
      while (i < s.length) {
        if (s[i] === '\\') { bo(s[i]); bo(s[i + 1]); i += 2; continue; }
        if (s[i] === c) break;
        /* `${…}` trong chuỗi mẫu là MÃ THẬT — giữ nguyên, nếu không thì hàm
         * gọi bên trong nó biến mất khỏi phép quét. */
        if (c === '`' && s[i] === '$' && s[i + 1] === '{') {
          giu(s[i]); giu(s[i + 1]); i += 2;
          /* Ruột `${…}` là mã, nhưng có thể chứa chuỗi mẫu lồng (`${x ? `<b>Sales (…)</b>` : ''}`):
           * cắt ra rồi dọn đệ quy, nếu không chữ HTML trong chuỗi lồng bị coi là lời gọi hàm. */
          const dau = i;
          let sau = 1;
          while (i < s.length && sau > 0) {
            if (s[i] === '{') sau++;
            if (s[i] === '}') sau--;
            i++;
          }
          for (const k of chiLayMa(s.slice(dau, i - 1))) giu(k);
          giu('}');
          continue;
        }
        bo(s[i]); i++;
      }
      if (i < s.length) { giu(s[i]); i++; }
      continue;
    }
    if (c === '/' && (truoc === '' || '(,=:[!&|?{};+-*%<>~^'.includes(truoc))) {
      giu(c); i++;                                      // biểu thức chính quy
      let trongNgoac = false;
      while (i < s.length) {
        if (s[i] === '\\') { bo(s[i]); bo(s[i + 1]); i += 2; continue; }
        if (s[i] === '[') trongNgoac = true;
        else if (s[i] === ']') trongNgoac = false;
        else if (s[i] === '/' && !trongNgoac) break;
        else if (s[i] === '\n') break;                  // không phải regex, bỏ qua
        bo(s[i]); i++;
      }
      if (i < s.length && s[i] === '/') { giu(s[i]); i++; }
      while (i < s.length && /[a-z]/.test(s[i])) { giu(s[i]); i++; }   // cờ
      continue;
    }
    giu(c); i++;
  }
  return ra;
}

/** Gom mọi tên được khai báo: hàm, biến, tham số, phá cấu trúc, rút gọn trong object. */
function gomKhaiBao(s, vao) {
  const them = (n) => { if (/^[A-Za-z_$][\w$]*$/.test(n)) vao.add(n); };
  for (const m of s.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) them(m[1]);
  // hàm tự gọi có tên: `(async function boot() { … })()`, tên đó gọi lại được bên trong
  for (const m of s.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g)) them(m[1]);
  for (const m of s.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) them(m[1]);
  for (const m of s.matchAll(/([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g)) them(m[1]);
  /* Rút gọn trong object literal: `{ oSo(a, b) { … } }` — khung-xuong.js dựng
   * cả bộ khung xương theo lối này. */
  for (const m of s.matchAll(/(?:^|[{,])\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) them(m[1]);
  // Class methods/getters use the same method syntax without an object comma.
  // Count declarations here; dotted method calls remain outside this scanner.
  for (const m of s.matchAll(/(?:^|\n)\s*(?:(?:async|static|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) them(m[1]);
  for (const m of s.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g)) {
    m[1].split(',').forEach((x) => them(x.split(':').pop().trim()));
  }
  /* `[^()]` chứ không `[^)]`: `new Promise((ok, hong) =>` mà lấy từ ngoặc ngoài thì ra "(ok". */
  for (const m of s.matchAll(/\(([^()]*)\)\s*=>/g)) {
    m[1].split(',').forEach((x) => them(x.trim().split(/[=\s]/)[0]));
  }
  for (const m of s.matchAll(/function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g)) {
    m[1].split(',').forEach((x) => them(x.trim().split(/[=\s]/)[0]));
  }
}

const tep = fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();
const nguon = tep.map((f) => {
  const tho = fs.readFileSync(path.join(DIR, f), 'utf8');
  /* `sach` để quét lời gọi hàm; `tho` để tìm những thứ NẰM TRONG CHUỖI, như
   * tên thuộc tính `data-mochitiet` — bộ quét đã xoá chúng đi rồi. */
  return { f, sach: chiLayMa(tho), tho };
});

/* Mọi tệp nạp chung một trang, nên hàm khai ở app.js gọi được từ nhanh.js —
 * gom chung một rổ là đúng với cách chúng chạy thật. */
const khai = new Set();
for (const o of nguon) gomKhaiBao(o.sach, khai);

console.log('\n\x1b[1mlời gọi hàm trong public/*.js\x1b[0m');
console.log('  ' + tep.length + ' tệp · ' + khai.size + ' tên được khai báo');

const thieuHet = [];
for (const o of nguon) {
  const goi = new Set();
  /* `ten(` mà phía trước KHÔNG phải dấu chấm — có chấm thì nó là phương thức
   * của một đối tượng, phép quét này không kiểm được và cũng không nên kiểm. */
  for (const m of o.sach.matchAll(/(^|[^\w$.])([a-zA-Z_$][\w$]*)\s*\(/g)) goi.add(m[2]);
  const thieu = [...goi].filter((n) =>
    !khai.has(n) && !TU_KHOA.has(n) && !CUA_TRINH_DUYET.has(n) && !(n in globalThis));
  if (thieu.length) thieuHet.push(o.f + ': ' + thieu.join(', '));
}

ok('mọi lời gọi đều trỏ tới một hàm có thật', thieuHet.length === 0, thieuHet.join('\n        '));

/* Canh riêng đúng cái nút đã hỏng, bằng HÀNH VI chứ không bằng tên hàm: nó
 * phải dẫn người ta đi đâu đó. Đổi sang moModule() hay giữ đường băm đều được
 * — miễn là còn mở được việc. */
const nhanh = nguon.find((o) => o.f === 'nhanh.js');
ok('có tệp nhanh.js', !!nhanh);
if (nhanh) {
  /* Tìm chỗ BẮT SỰ KIỆN, không phải chỗ vẽ nút: `data-mochitiet` có hai lần
   * trong tệp, lần đầu là lúc dựng HTML. Vị trí tìm trên bản thô (tên thuộc
   * tính nằm trong chuỗi nên bản sạch đã xoá), rồi CẮT TRÊN BẢN SẠCH — chiLayMa
   * thay từng ký tự một nên hai bản trùng khít từng vị trí.
   *
   * Phải cắt trên bản sạch, không thì chính lời chú thích giải thích bản sửa
   * cũng chứa chữ "moModule()" và phép thử tự khớp vào chú thích của mình —
   * đã dính đúng bẫy đó khi thử lại với mã cũ, test xanh trong khi nút hỏng. */
  const i = nhanh.tho.indexOf("closest('[data-mochitiet]')");
  const khoi = i >= 0 ? nhanh.sach.slice(i, i + 900) : '';
  ok('nút "Mở chi tiết" có dẫn đi đâu đó',
    /location\.hash\s*=|moModule\s*\(|moTab\s*\(/.test(khoi),
    'bấm xong không mở gì cả — đúng lỗi của 08/10/2026');
  ok('và không còn gọi moViec()', !/\bmoViec\s*\(/.test(nhanh.sach));
}

/* App con (26/10/2026). Nút "Soạn" email của KOL kẹt ở "Đang soạn email…" suốt
 * một tháng: app.js gọi `esc(…)` mà hàm đó chỉ có ở mau-email.js phía máy chủ.
 * Dòng ấy chỉ chạy khi hộp thư cmo@ đã kết nối, tức là chỉ trên Hub, nên mở thử
 * trên máy không bao giờ thấy. Phép quét bên trên chỉ soi public/ của hub.
 *
 * Mỗi app con một rổ riêng: tệp của nó + các tệp hub chèn vào nó (ios-app.js,
 * nhap-chung.js…), vì những tệp đó chạy chung trang và khai được tên dùng chung.
 * Tệp được trang công khai riêng nạp (form.js của KOL) vẫn nằm trong rổ: cùng
 * thư mục, khai báo trùng thì cũng không làm phép quét báo oan. */
const GOC = path.join(__dirname, '..', '..');
/* CHỈ các tệp proxy.js chèn vào app con, không phải cả public/ của hub: hub có
 * `esc` riêng của nó, gom chung thì đúng lỗi của KOL lại lọt qua. */
const CHEN = [...fs.readFileSync(path.join(__dirname, '..', 'proxy.js'), 'utf8').matchAll(/src="\/([\w.-]+\.js)/g)].map((m) => m[1]);
ok('đọc được danh sách tệp hub chèn vào app con', CHEN.includes('ios-app.js'), CHEN.join(', '));
const khaiHub = new Set();
for (const o of nguon) if (CHEN.includes(o.f)) gomKhaiBao(o.sach, khaiHub);
const appCon = fs.readdirSync(GOC).filter((d) => d.startsWith('lark-') && d !== 'lark-mkt-hub' &&
  fs.existsSync(path.join(GOC, d, 'public')));
const thieuApp = [];
for (const a of appCon) {
  const pub = path.join(GOC, a, 'public');
  const ds = fs.readdirSync(pub).filter((f) => f.endsWith('.js') && !/\.min\.js$/.test(f))
    .map((f) => ({ f, sach: chiLayMa(fs.readFileSync(path.join(pub, f), 'utf8')) }));
  const khaiApp = new Set(khaiHub);
  for (const o of ds) gomKhaiBao(o.sach, khaiApp);
  for (const o of ds) {
    const goi = new Set();
    for (const m of o.sach.matchAll(/(^|[^\w$.])([a-zA-Z_$][\w$]*)\s*\(/g)) goi.add(m[2]);
    const thieu = [...goi].filter((n) =>
      !khaiApp.has(n) && !TU_KHOA.has(n) && !CUA_TRINH_DUYET.has(n) && !(n in globalThis));
    if (thieu.length) thieuApp.push(a + '/' + o.f + ': ' + thieu.join(', '));
  }
}
ok('app con: mọi lời gọi đều trỏ tới một hàm có thật (' + appCon.length + ' app)', thieuApp.length === 0, thieuApp.join('\n        '));

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
process.exit(fail ? 1 : 0);
