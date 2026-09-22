'use strict';
/**
 * ============================================================================
 * CẢ HỆ CHỈ CÒN MỘT APP LARK — canh để nó không lặng lẽ tách lại làm hai
 * ============================================================================
 * Anh Hùng, 19/09/2026: "Anh muốn không còn liên quan đến app Tracking hay Ads
 * hay ShootFlow nữa."
 *
 * Chuyện đã xảy ra HAI LẦN và cả hai lần đều tốn thời gian như nhau: có người
 * đọc `render.yaml`, thấy `LARK_APP_ID` cắm sẵn App ID của app thử nghiệm cũ,
 * rồi báo cáo là bản deploy đang chạy bằng app đó.
 * Thật ra dashboard Render mới là nơi giữ giá
 * trị thật, và nó đã trỏ sang Marketing Hub từ 16/09/2026. Cách duy nhất biết
 * chắc là hỏi chính bản đang chạy:
 *
 *   curl -s -o /dev/null -w "%{redirect_url}" <URL>/auth/login
 *
 * Nên bộ này chốt hai điều:
 *   1. App ID cũ không còn nằm trong mã hay cấu hình — chỉ được xuất hiện trong
 *      hai tài liệu chuyển đổi, nơi nó là thứ PHẢI nhắc tên để còn xoá.
 *   2. `render.yaml` không cắm sẵn `value:` cho LARK_APP_ID nữa, để không sinh
 *      thêm một con số nữa cho người sau tin nhầm.
 *
 * Xem docs/gop-ve-mot-app.md.
 */
const fs = require('fs');
const path = require('path');

const GOC = path.join(__dirname, '..', '..');
const APP_CU = 'cli_aa0' + '4305ecd385ed1';   // cắt đôi để chính file này không tự dính bẫy

/* Tài liệu chuyển đổi được phép nhắc tên app cũ — đó là app phải đi xoá. */
const DUOC_NHAC = [
  path.join('lark-mkt-hub', 'docs', 'gop-ve-mot-app.md'),
  path.join('lark-mkt-hub', 'docs', 'trien-khai-render.md'),
];

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten); console.log('  ✗ ' + ten); }
};

/** Mọi tệp văn bản trong kho, bỏ .git và node_modules. */
function quet(thuMuc, ra) {
  for (const t of fs.readdirSync(thuMuc, { withFileTypes: true })) {
    if (['.git', '.claude', 'node_modules', 'du-lieu'].includes(t.name)) continue;
    const p = path.join(thuMuc, t.name);
    if (t.isDirectory()) { quet(p, ra); continue; }
    if (!/\.(js|json|ya?ml|md|html|css|env\.mau)$/.test(t.name)) continue;
    ra.push(p);
  }
  return ra;
}

console.log('\nmột app Lark duy nhất');

const dinh = [];
for (const p of quet(GOC, [])) {
  let s;
  try { s = fs.readFileSync(p, 'utf8'); } catch (_) { continue; }
  if (!s.includes(APP_CU)) continue;
  const tuongDoi = path.relative(GOC, p);
  if (DUOC_NHAC.includes(tuongDoi)) continue;
  dinh.push(tuongDoi);
}
ok('App ID cũ không còn trong mã, cấu hình hay tài liệu' +
   (dinh.length ? ' — còn ở: ' + dinh.join(', ') : ''), dinh.length === 0);

/* ---- render.yaml không được cắm sẵn App ID ---- */
const yaml = fs.readFileSync(path.join(GOC, 'render.yaml'), 'utf8');
const khoiId = yaml.split('\n');
const iId = khoiId.findIndex((d) => /^\s*-\s*key:\s*LARK_APP_ID\s*$/.test(d));
ok('render.yaml có khai LARK_APP_ID', iId >= 0);
ok('LARK_APP_ID để sync: false, không cắm sẵn value',
  iId >= 0 && /^\s*sync:\s*false\s*$/.test(khoiId[iId + 1] || ''));

/* ---- không còn cặp khoá thứ hai bắt buộc ---- */
ok('render.yaml không còn bắt khai ANH_TIN_APP_ID',
  !/^\s*-\s*key:\s*ANH_TIN_APP_ID\s*$/m.test(yaml));
ok('render.yaml không còn bắt khai ANH_TIN_APP_SECRET',
  !/^\s*-\s*key:\s*ANH_TIN_APP_SECRET\s*$/m.test(yaml));

/* ---- app gửi tin lùi về app nền tảng ở mọi app con có gửi tin ---- */
for (const app of ['lark-chinh-anh', 'lark-social']) {
  const c = fs.readFileSync(path.join(GOC, app, 'config.js'), 'utf8');
  const dong = c.split('\n').filter((d) => /tinAppId:|tinAppSecret:/.test(d)).join('\n');
  /* Chuỗi lùi có thể vắt hai dòng, nên ghép cả khối rồi mới dò. */
  const khoi = c.slice(c.indexOf('tinAppId:'), c.indexOf('tinAppTen:'));
  ok(app + ': tinAppId lùi về LARK_APP_ID', /LARK_APP_ID/.test(khoi) && /tinAppId:/.test(dong));
  ok(app + ': tinAppSecret lùi về LARK_APP_SECRET', /LARK_APP_SECRET/.test(khoi));
}

/* ---- hub phải kêu khi ai đó dựng lại trạng thái hai app ---- */
const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
ok('hub cảnh báo lúc khởi động nếu app gửi tin khác app nền tảng',
  /Đang chạy HAI app Lark/.test(sv) && /ANH_TIN_APP_ID/.test(sv));

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
