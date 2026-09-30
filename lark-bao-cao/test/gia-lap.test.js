'use strict';
/**
 * Chế độ XEM THỬ VAI NHÂN SỰ (BAO_CAO_GIA_NHAN_SU) — chỉ xem, không bao giờ ghi,
 * và không bao giờ lấn qua request đến từ hub.
 * Chạy: node test/gia-lap.test.js
 */
const http = require('http');
process.env.BAO_CAO_GIA_NHAN_SU = 'a@b.vn|ou_thu|Người Thử';
const S = require('../server');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + JSON.stringify(vi) : '')); }
};
const CONG = 5197;
const goi = (duong, method) => new Promise((res) => {
  const r = http.request({ host: '127.0.0.1', port: CONG, path: duong, method: method || 'GET',
    headers: { 'content-type': 'application/json' } }, (x) => {
    let b = ''; x.on('data', (c) => { b += c; }); x.on('end', () => res({ ma: x.statusCode, than: b }));
  });
  r.end(method === 'POST' ? '{}' : undefined);
});

(async () => {
  const toi = await S.aiGoi({ headers: {} });
  ok('không header hub → vai nhân sự giả lập, KHÔNG quản lý', toi.giaLap && !toi.quanLy && toi.email === 'a@b.vn' && toi.id === 'ou_thu', toi);
  const hub = await S.aiGoi({ headers: { 'x-hub-user-id': 'ou_hub', 'x-hub-user-manager': '1' } });
  ok('request qua hub không bị giả lập đè', !hub.giaLap && hub.id === 'ou_hub' && hub.quanLy, hub);

  await new Promise((r) => S.server.listen(CONG, '127.0.0.1', r));
  for (const duong of ['/api/phieu', '/api/thiet-lap', '/api/can-ho-tro/xu-ly', '/api/thiet-lap/tin']) {
    const r = await goi(duong, 'POST');
    ok('chặn ghi ' + duong + ' → 403', r.ma === 403 && /xem thử/i.test(r.than), r);
  }
  S.server.close();
  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
