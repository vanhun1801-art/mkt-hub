'use strict';
/* Test thuần Node: `node test/quyen.test.js`.
 *
 * Chốt vai quản lý của app KPI. Mỗi phép thử dưới đây canh một lỗi CÓ THẬT đã
 * gặp trên bản chạy ở Render ngày 10/09/2026: app tự dựng danh sách quản lý
 * riêng từ biến `KPI_QUAN_LY`, mà biến đó không có trong render.yaml — nên MỌI
 * người đăng nhập đều rơi xuống vai nhân sự, sáu tab chỉ-quản-lý biến mất và
 * app trông như bản thiếu một nửa. Hub vốn ĐÃ gửi sẵn `x-hub-user-manager`.
 */
const assert = require('assert');
const { laQuanLy } = require('../quyen');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so += 1; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

const req = (h) => ({ headers: h || {} });
const API = { mode: 'api' };
const CLI = { mode: 'cli' };

console.log('\nchốt vai quản lý');

t('máy cá nhân thì luôn có vai — chốt ở đây không bảo vệ được gì', () => {
  assert.strictEqual(laQuanLy(req(), CLI, {}), true);
  assert.strictEqual(laQuanLy(req({ 'x-hub-user-id': 'ou_1' }), CLI, {}), true);
});

t('server chung: tin header x-hub-user-manager của hub', () => {
  assert.strictEqual(laQuanLy(req({ 'x-hub-user-manager': '1' }), API, {}), true);
});

t('server chung: KHÔNG có header thì là nhân sự, dù đã đăng nhập', () => {
  assert.strictEqual(laQuanLy(req({ 'x-hub-user-id': 'ou_1' }), API, {}), false);
});

t('header giá trị lạ không được tính là quản lý', () => {
  ['0', 'true', 'yes', '', 'null'].forEach((v) => {
    assert.strictEqual(laQuanLy(req({ 'x-hub-user-manager': v }), API, {}), false, 'giá trị ' + JSON.stringify(v));
  });
});

t('HUB_TRUST_HEADER=0 thì không tin ai — kể cả header đúng', () => {
  /* Cờ này bật khi cổng app mở ra ngoài mạng: lúc đó ai cũng tự đặt được header. */
  assert.strictEqual(laQuanLy(req({ 'x-hub-user-manager': '1' }), API, { HUB_TRUST_HEADER: '0' }), false);
});

t('KPI_QUAN_LY vẫn dùng được khi chạy api MỘT MÌNH, không qua hub', () => {
  const e = { KPI_QUAN_LY: 'ou_hung, Lê Văn Hùng' };
  assert.strictEqual(laQuanLy(req({ 'x-hub-user-id': 'ou_hung' }), API, e), true);
  assert.strictEqual(laQuanLy(req({ 'x-hub-user-id': 'ou_khac' }), API, e), false);
});

t('KPI_QUAN_LY khớp cả theo TÊN đã mã hoá URL', () => {
  /* Hub gửi tên qua encodeURIComponent; so sánh thô thì tên có dấu không bao giờ khớp. */
  const e = { KPI_QUAN_LY: 'Lê Văn Hùng' };
  const ten = encodeURIComponent('Lê Văn Hùng');
  assert.strictEqual(laQuanLy(req({ 'x-hub-user-id': 'ou_1', 'x-hub-user-name': ten }), API, e), true);
});

t('KPI_QUAN_LY rỗng thì KHÔNG mở cửa cho ai', () => {
  /* Cái bẫy kinh điển: ''.split(',') ra [''], rồi includes('') khớp với id rỗng. */
  ['', '   ', ',,'].forEach((v) => {
    assert.strictEqual(laQuanLy(req({ 'x-hub-user-id': '' }), API, { KPI_QUAN_LY: v }), false);
    assert.strictEqual(laQuanLy(req({ 'x-hub-user-id': 'ou_1' }), API, { KPI_QUAN_LY: v }), false);
  });
});

t('tên hỏng mã URL không làm nổ hàm', () => {
  assert.strictEqual(laQuanLy(req({ 'x-hub-user-id': 'ou_1', 'x-hub-user-name': '%E0%A4%A' }),
    API, { KPI_QUAN_LY: 'ai đó' }), false);
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
