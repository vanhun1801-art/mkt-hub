'use strict';
/**
 * ============================================================================
 * CANH THANG GIAO DIỆN CHUNG CỦA CẢ 5 APP
 * ============================================================================
 * Năm app là năm tệp CSS rời, không có bước build nào gộp chúng lại — nên không
 * gì ngăn được việc mỗi app trôi mỗi kiểu. Đã trôi thật một lần: bo góc thẻ
 * 6/10/12px, đệm nút 5×12 / 6×14 / 7×12 / 7×13, cỡ chữ nút 12,5 và 13, và app
 * OTA dùng màu nhấn tím trong khi cả hệ dùng xanh.
 *
 * Trong lớp vỏ, đổi base một cái là hai app nằm cùng một khung — mắt so ngay.
 *
 * Phép thử này đọc thẳng 5 tệp CSS và bắt lệch. Sửa CSS mà quên app khác thì
 * `npm test` bên hub đỏ, không phải chờ ai đó nhìn ra.
 *
 * Chạy: node test/dong-nhat.test.js
 */
const fs = require('fs');
const path = require('path');

const GOC = path.join(__dirname, '..', '..');
/* Mọi app trong nhà. `lark-social` còn đang dựng dở và chưa vào repo, nên danh
 * sách được lọc lại bên dưới theo cái CÓ THẬT trên đĩa: thiếu nó thì bỏ qua,
 * có nó thì canh như năm app kia. Không lọc thì ai clone repo về sẽ thấy phép
 * thử vỡ vì đọc một thư mục không tồn tại — lỗi của phép thử, không phải lỗi
 * của mã. */
const MOI_APP = ['lark-mkt-hub', 'lark-task-manager', 'lark-lich-tac-nghiep',
  'lark-ads-manager', 'lark-ota-manager', 'lark-social'];

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

/** Đọc CSS của một app. */
function css(app) {
  const dir = path.join(GOC, app, 'public');
  const f = fs.readdirSync(dir).find((x) => x.endsWith('.css'));
  return fs.readFileSync(path.join(dir, f), 'utf8');
}

/** Giá trị một token, tìm trong khối đầu tiên khai nó. */
function token(s, ten) {
  const m = s.match(new RegExp('--' + ten + '\\s*:\\s*([^;/]+)'));
  return m ? m[1].trim() : '';
}

/** Một thuộc tính trong khối luật của selector (khối ĐẦU TIÊN khớp đúng). */
function trongKhoi(s, sel, prop) {
  /* Neo vào ĐẦU DÒNG: `indexOf('.btn {')` khớp cả `.viewas-bar .btn {` và đo
   * nhầm một nút phụ. Đây chính là lỗi đã làm phép đo đầu tiên sai. */
  const i = s.indexOf('\n' + sel + ' {');
  if (i < 0) return '';
  const j = s.indexOf('}', i);
  const than = s.slice(i, j);
  const m = than.match(new RegExp('(?:^|;|\\{)\\s*' + prop + '\\s*:\\s*([^;]+)'));
  return m ? m[1].trim() : '';
}

/** Bo góc thật của nút: giải token nếu selector dùng var(). */
function boGocNut(s) {
  const v = trongKhoi(s, '.btn', 'border-radius');
  const m = v.match(/var\(--([\w-]+)\)/);
  return m ? token(s, m[1]) : v;
}

const APPS = MOI_APP.filter((a) => fs.existsSync(path.join(GOC, a, 'public')));
const VANG = MOI_APP.filter((a) => !APPS.includes(a));

const CSS = Object.fromEntries(APPS.map((a) => [a, css(a)]));
const ten = (a) => a.replace('lark-', '').padEnd(16);

(async () => {
  if (VANG.length) {
    console.log('\n  (bỏ qua, chưa có trên đĩa: ' + VANG.join(', ') + ')');
  }

  group('1. Nút — thứ mắt so trực tiếp nhất khi đổi base trong lớp vỏ');
  {
    const dem = APPS.map((a) => [a, trongKhoi(CSS[a], '.btn', 'padding')]);
    ok('mọi app đệm nút 7px 12px',
      dem.every(([, v]) => v === '7px 12px'),
      dem.map(([a, v]) => ten(a) + (v || '(không thấy)')).join(' | '));

    const bg = APPS.map((a) => [a, boGocNut(CSS[a])]);
    ok('mọi app bo góc nút 9px',
      bg.every(([, v]) => v === '9px'),
      bg.map(([a, v]) => ten(a) + (v || '(không thấy)')).join(' | '));

    /* Cỡ chữ nút: app nào khai thì phải là 13px. Không khai thì kế thừa cỡ chữ
     * nền của app đó — chấp nhận được, nhưng khai SAI thì không. */
    const cc = APPS.map((a) => [a, trongKhoi(CSS[a], '.btn', 'font-size')]);
    ok('app nào khai cỡ chữ nút thì phải là 13px',
      cc.every(([, v]) => !v || v === '13px'),
      cc.map(([a, v]) => ten(a) + (v || '—')).join(' | '));
  }

  group('2. Bo góc thẻ');
  {
    /* Mỗi app đặt tên token một kiểu (lịch sử để lại). Chấp nhận tên khác nhau,
     * nhưng GIÁ TRỊ phải bằng nhau — cái mắt thấy là giá trị. */
    const tt = {
      'lark-mkt-hub': 'r',
      'lark-task-manager': 'r-card',
      'lark-lich-tac-nghiep': 'r-lg',
      'lark-ads-manager': 'radius',
      'lark-ota-manager': 'radius',
      'lark-social': 'radius',
    };
    const v = APPS.map((a) => [a, token(CSS[a], tt[a])]);
    ok('mọi app bo góc thẻ 12px',
      v.every(([, x]) => x === '12px'),
      v.map(([a, x]) => ten(a) + (x || '(không thấy)')).join(' | '));
  }

  group('3. Màu nhấn — cùng một màu ở cả hai chế độ');
  {
    const tt = {
      'lark-mkt-hub': 'xanh',
      'lark-task-manager': 'blue',
      'lark-lich-tac-nghiep': 'primary',
      'lark-ads-manager': 'brand',
      'lark-ota-manager': 'brand',
      'lark-social': 'brand',
    };
    const sang = APPS.map((a) => [a, token(CSS[a], tt[a])]);
    ok('chế độ sáng: #2b5cff',
      sang.every(([, x]) => x.toLowerCase() === '#2b5cff'),
      sang.map(([a, x]) => ten(a) + x).join(' | '));

    /* Bản tối khai trong khối [data-theme="toi"]; lấy lần khai CUỐI của token. */
    const cuoi = (s, k) => {
      const ds = [...s.matchAll(new RegExp('--' + k + '\\s*:\\s*([^;/]+)', 'g'))];
      return ds.length ? ds[ds.length - 1][1].trim() : '';
    };
    const toi = APPS.map((a) => [a, cuoi(CSS[a], tt[a])]);
    ok('chế độ tối: #6f9bff',
      toi.every(([, x]) => x.toLowerCase() === '#6f9bff'),
      toi.map(([a, x]) => ten(a) + x).join(' | '));
  }

  group('4. Nền, chữ, viền — giá trị phải trùng dù tên token khác nhau');
  {
    /* Năm app đặt năm bộ tên khác nhau cho cùng mấy màu — di sản, đổi tên thì
     * phải sửa hàng trăm chỗ trong 5 tệp. Chấp nhận tên khác, canh GIÁ TRỊ. */
    const bo = {
      'lark-mkt-hub': { nen: 'nen', chu: 'chu', vien: 'vien' },
      'lark-task-manager': { nen: 'bg', chu: 'text', vien: 'border' },
      'lark-lich-tac-nghiep': { nen: 'bg', chu: 't1', vien: 'line' },
      'lark-ads-manager': { nen: 'bg', chu: 'ink', vien: 'line' },
      'lark-ota-manager': { nen: 'bg', chu: 'ink', vien: 'line' },
      'lark-social': { nen: 'bg', chu: 'ink', vien: 'line' },
    };
    for (const [khoa, mong] of [['nen', '#f4f6fa'], ['chu', '#1a2233'], ['vien', '#e3e8f0']]) {
      const v = APPS.map((a) => [a, token(CSS[a], bo[a][khoa])]);
      ok(khoa + ' = ' + mong,
        v.every(([, x]) => x.toLowerCase() === mong),
        v.map(([a, x]) => ten(a) + (x || '(không thấy)')).join(' | '));
    }
  }

  group('5. Công tắc sáng/tối — cùng một quy ước, không thì vỏ sáng ruột tối');
  {
    for (const a of APPS) {
      const s = CSS[a];
      ok(ten(a).trim() + ': có cả [data-theme="toi"], [data-theme="sang"] và prefers-color-scheme',
        s.includes('data-theme="toi"') && s.includes('data-theme="sang"') &&
        s.includes('prefers-color-scheme'));
    }
  }

  group('6. Bóng thẻ — cùng một chiều sâu, không app nào phẳng hơn app khác');
  {
    /* Đã trôi một lần: hub được thêm token bóng riêng để thẻ có chiều sâu, năm
     * app kia giữ bóng phẳng cũ. Trong lớp vỏ hai thứ đó nằm cạnh nhau nên lệch
     * lộ ngay. Không có token riêng nữa — mỗi app một tên (di sản), một GIÁ TRỊ. */
    const tt = {
      'lark-mkt-hub': 'bong',
      'lark-task-manager': 'shadow-1',
      'lark-lich-tac-nghiep': 'shadow-1',
      'lark-ads-manager': 'shadow',
      'lark-ota-manager': 'shadow',
      'lark-social': 'shadow',
    };
    const CHUAN = '0 1px 2px rgba(20, 30, 60, .07), 0 8px 22px -12px rgba(20, 30, 60, .28)';
    const sang = APPS.map((a) => [a, token(CSS[a], tt[a])]);
    ok('chế độ sáng: cùng một bóng thẻ',
      sang.every(([, x]) => x === CHUAN),
      sang.map(([a, x]) => '\n        ' + ten(a) + (x || '(không thấy)')).join(''));

    const CHUAN_TOI = '0 1px 2px rgba(0, 0, 0, .35), 0 8px 22px -10px rgba(0, 0, 0, .5)';
    const cuoi = (s, k) => {
      const ds = [...s.matchAll(new RegExp('--' + k + '\\s*:\\s*([^;/]+)', 'g'))];
      return ds.length ? ds[ds.length - 1][1].trim() : '';
    };
    const toi = APPS.map((a) => [a, cuoi(CSS[a], tt[a])]);
    ok('chế độ tối: cùng một bóng thẻ',
      toi.every(([, x]) => x === CHUAN_TOI),
      toi.map(([a, x]) => '\n        ' + ten(a) + (x || '(không thấy)')).join(''));

    /* Token riêng cho hub đã gỡ — chặn nó mọc lại. */
    ok('không app nào đẻ token bóng thẻ riêng',
      !CSS['lark-mkt-hub'].includes('--bong-the'));
  }

  console.log('\n' + '─'.repeat(56));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})();
