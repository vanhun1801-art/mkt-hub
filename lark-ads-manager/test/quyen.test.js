/**
 * Test chốt vai quản lý.
 *
 * Chốt này canh đường DUY NHẤT mà token đi ra khỏi app (/api/connect/xuat-env).
 * Một chốt bảo mật không có test là chỗ dễ hỏng nhất khi sửa code về sau — nên nó
 * được tách ra quyen.js để test được bằng req giả.
 */
const { laQuanLy } = require('../quyen');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  ok  ' + name); }
  else { fail += 1; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

const req = (headers = {}) => ({ headers });
const FILE = { mode: 'file' };
const API = { mode: 'api' };

console.log('— máy cá nhân (mode file): luôn có vai');
t('không cần header', laQuanLy(req(), FILE, {}) === true);
t('header giả cũng không đổi gì', laQuanLy(req({ 'x-hub-user-manager': '0' }), FILE, {}) === true);

console.log('— server chung (mode api): chỉ tin header của hub');
t('có header = 1 → có vai', laQuanLy(req({ 'x-hub-user-manager': '1' }), API, {}) === true);
t('không có header → KHÔNG có vai', laQuanLy(req(), API, {}) === false);
t('header rỗng → KHÔNG', laQuanLy(req({ 'x-hub-user-manager': '' }), API, {}) === false);
t('header = 0 → KHÔNG', laQuanLy(req({ 'x-hub-user-manager': '0' }), API, {}) === false);
// Chỉ chấp nhận đúng chuỗi '1'. 'true'/'yes' không được coi là có vai.
t("chỉ chuỗi '1' được tính", laQuanLy(req({ 'x-hub-user-manager': 'true' }), API, {}) === false);
t('số 1 (không phải chuỗi) cũng không tính', laQuanLy(req({ 'x-hub-user-manager': 1 }), API, {}) === false);

console.log('— cổng mở ra ngoài (HUB_TRUST_HEADER=0): không tin ai');
t('kể cả có header = 1',
  laQuanLy(req({ 'x-hub-user-manager': '1' }), API, { HUB_TRUST_HEADER: '0' }) === false);
t('nhưng máy cá nhân vẫn có vai',
  laQuanLy(req({}), FILE, { HUB_TRUST_HEADER: '0' }) === true);

console.log('— req rác không làm sập');
t('req rỗng', laQuanLy({}, API, {}) === false);
t('req null', laQuanLy(null, API, {}) === false);
t('headers null', laQuanLy({ headers: null }, API, {}) === false);

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
