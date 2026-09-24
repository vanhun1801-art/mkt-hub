/**
 * Đường công khai /k/* — link gửi khách xem tour (26/09).
 *
 * Đây là cửa thứ ba của hub mở ra Internet không cần đăng nhập (sau webhook OTA và /bot),
 * nên phải giữ thật hẹp. Bộ này đọc CHÍNH mã trong server.js (không chép lại) và kiểm:
 *   - chỉ khớp /k hoặc /k/<…>, không lan sang /kpi, /kol…
 *   - đường có ".." bị từ chối
 *   - chỉ chuyển tới module san-pham, vào nhánh /khach/*, KHÔNG mang danh tính (nguoi = null)
 *   - nằm TRƯỚC cổng đăng nhập (không thì khách bị đẩy sang trang đăng nhập Lark)
 *   - chỉ GET/HEAD
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const m = src.match(/const mKhach = (\/.*\/)\.exec\(p\);/);
t('server.js có nhánh /k/', !!m);
const RE = m ? eval(m[1]) : /$^/;                     // eslint-disable-line no-eval
const doi = (p) => { const k = RE.exec(p); return k && !(k[1] || '').includes('..') ? '/khach' + (k[1] || '/') : null; };

console.log('— khớp đúng đường');
t('/k/tour/G4 → /khach/tour/G4', doi('/k/tour/G4') === '/khach/tour/G4');
t('/k/api/tour/G2CHONTHOM → /khach/api/…', doi('/k/api/tour/G2CHONTHOM') === '/khach/api/tour/G2CHONTHOM');
t('/k/ban-do/ban-do.js → /khach/ban-do/ban-do.js', doi('/k/ban-do/ban-do.js') === '/khach/ban-do/ban-do.js');
t('/k → /khach/', doi('/k') === '/khach/');

console.log('— không lan sang đường khác');
for (const p of ['/kpi', '/kol/abc', '/m/san-pham/api/khoi-tao', '/k/../api/khoi-tao', '/k/tour/<script>', '/api/k/tour/G4']) {
  t('từ chối ' + p, doi(p) === null);
}

console.log('— vị trí + ràng buộc');
const iK = src.indexOf('const mKhach = '), iCong = src.indexOf("if (cfg.mode === 'api') {\n    if (p.startsWith('/auth/'))");
t('nhánh /k/ nằm TRƯỚC cổng đăng nhập', iK > 0 && iCong > 0 && iK < iCong, iK + ' vs ' + iCong);
const khoi = src.slice(iK, src.indexOf('return chuyenTiep(req, res, modSp', iK) + 200);
t('chỉ GET/HEAD', /req\.method !== 'GET' && req\.method !== 'HEAD'/.test(khoi));
t("chỉ tới module 'san-pham'", /timMod\('san-pham'\)/.test(khoi) && !/timMod\('(?!san-pham)/.test(khoi));
t('không mang danh tính (nguoi = null)', /chuyenTiep\(req, res, modSp, '\/khach' \+ \(mKhach\[1\] \|\| '\/'\) \+ \(u\.search \|\| ''\), null\)/.test(khoi));

console.log('\n' + pass + ' pass · ' + fail + ' fail');
process.exit(fail ? 1 : 0);
