'use strict';
/**
 * ============================================================================
 * LÀM MỜ "HÀNH ĐỘNG KHÔNG BẤM ĐƯỢC" — KHÔNG LÀM MỜ "NỘI DUNG CHỈ ĐỌC"
 * ============================================================================
 * Anh Hùng 28/09/2026, kèm ảnh Lịch làm việc: "cái này nó đang bị tối đi trên
 * các giao diện".
 *
 * Đo trong trình duyệt: 31 trong 36 ô lịch đang ở `opacity: .45`, phủ khoảng
 * 430.000 px² màn hình. Hai luật tranh nhau trên cùng một ô:
 *
 *   lark-lich-lam-viec/public/styles.css   .ngay:disabled { opacity: 1 }
 *   lark-mkt-hub/public/ios.css            :is(.btn, button):disabled { opacity: .45 }
 *
 * Luật của lớp iOS ưu tiên cao hơn nên thắng. Nhưng ở đây `disabled` KHÔNG có
 * nghĩa "nút chết": nó là "tháng đã nộp, chỉ đọc". Ô mang chữ để ĐỌC — "x · Đi
 * làm cả ngày" — nên làm mờ nó là làm khó đọc chính nội dung. Tác giả app biết
 * điều đó và đã khai `opacity: 1`; lớp dùng chung đè lên mà không ai hay.
 *
 * ---------------------------------------------------------------------------
 * BỘ NÀY KHÔNG CANH RIÊNG `.ngay`. Nó encode một nguyên tắc:
 *
 *   App nào đã nói rõ "phần tử này khoá nhưng ĐỪNG làm mờ" thì lớp dùng chung
 *   phải tôn trọng — hoặc bằng cách loại trừ, hoặc bằng cách khai lại.
 *
 * Thêm một exemption mới ở app bất kỳ mà quên lớp chung, phép thử này nổ.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '\n      ' + vi : '')); }
};

const GOC = path.join(__dirname, '..', '..');
const PUB = path.join(__dirname, '..', 'public');
const APP = ['lark-task-manager', 'lark-lich-tac-nghiep', 'lark-ads-manager',
  'lark-ota-manager', 'lark-social', 'lark-chinh-anh', 'lark-kpi',
  'lark-quy-chi-phi', 'lark-bao-cao', 'lark-san-pham', 'lark-lich-lam-viec', 'lark-kol', 'lark-kho-media'];

const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

console.log('\nlớp dùng chung tôn trọng ý định của app');

/* 1. Gom mọi "phần tử khoá nhưng KHÔNG được làm mờ" mà các app tự khai. */
const mienTru = [];
for (const app of APP) {
  let css;
  try { css = boChuThich(fs.readFileSync(path.join(GOC, app, 'public', 'styles.css'), 'utf8')); }
  catch (_) { continue; }
  const re = /([^{}]*?):disabled([^{}]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (!/opacity\s*:\s*1\b/.test(m[3])) continue;
    const goc = m[1].trim().split(',').pop().trim();     // ".ngay"
    if (goc) mienTru.push({ app, goc });
  }
}

ok('có quét được app nào không (phép thử không tự rỗng rồi báo đạt)',
  APP.filter((a) => fs.existsSync(path.join(GOC, a, 'public', 'styles.css'))).length >= 10);

/* 2. Với mỗi miễn trừ, lớp iOS phải hoặc LOẠI TRỪ nó khỏi luật làm mờ, hoặc
 *    khai lại `opacity: 1` cho chính nó. */
const ios = boChuThich(fs.readFileSync(path.join(PUB, 'ios.css'), 'utf8'));
const quen = [];
for (const { app, goc } of mienTru) {
  const lop = goc.replace(/^\./, '');
  const daLoaiTru = ios.indexOf(':not(.' + lop + ')') >= 0;
  const daKhaiLai = new RegExp('\\.' + lop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + ':disabled[^{]*\\{[^}]*opacity:\\s*1\\b').test(ios);
  if (!daLoaiTru && !daKhaiLai) quen.push(app + ' khai "' + goc + ':disabled { opacity: 1 }" mà ios.css không tôn trọng');
}
ok('mọi miễn trừ của app đều được lớp iOS tôn trọng',
  quen.length === 0, quen.length ? '\n      ' + quen.join('\n      ') : '');

/* 3. Nhưng nút hành động thật thì VẪN phải mờ — đừng vá quá tay. */
ok('nút hành động bị khoá vẫn được làm mờ',
  /:is\(\.btn, button\):disabled/.test(ios) && /opacity:\s*\.45/.test(ios));

/* 4. Ô chỉ đọc không được mang con trỏ "cấm" — nó có cấm gì đâu. */
ok('ô lịch chỉ đọc dùng con trỏ thường, không phải "cấm"',
  /\.ngay:disabled\s*\{[^}]*cursor:\s*default/.test(ios));

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
