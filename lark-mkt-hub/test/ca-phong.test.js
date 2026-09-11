'use strict';
/* `node test/ca-phong.test.js` — "ai thấy base này" phải HỎNG VỀ PHÍA AN TOÀN.
 *
 * Vì sao đáng một file riêng: anh Hùng báo 11/09/2026 "mỗi lần deploy lại thì hay
 * tự chuyển cho cả phòng xem". Nguyên nhân là `caPhong` chỉ nằm trong modules.json,
 * mà file đó nằm trong git và ổ đĩa Render là tạm — nên mỗi lần deploy, file bị
 * dựng lại theo bản trong git và mọi lần bấm "Đóng lại" trong app đều mất.
 *
 * Bộ thử này canh hai thứ:
 *   1. Trong git, KHÔNG base nào được `caPhong: true` → deploy chỉ có thể đóng.
 *   2. Mọi giá trị lạ trong file đều KHÔNG mở base ra.
 *
 * Muốn mở thật thì khai HUB_CA_PHONG — biến môi trường sống qua deploy.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let so = 0;
let hong = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { hong++; console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

const FILE = path.join(__dirname, '..', 'modules.json');

/** Nạp lại config.js với env đã đặt — config đọc env lúc gọi docModules(). */
function nap(env) {
  const cu = process.env.HUB_CA_PHONG;
  if (env === undefined) delete process.env.HUB_CA_PHONG;
  else process.env.HUB_CA_PHONG = env;
  delete require.cache[require.resolve('../config')];
  const cfg = require('../config');
  const ds = cfg.docModules();
  if (cu === undefined) delete process.env.HUB_CA_PHONG;
  else process.env.HUB_CA_PHONG = cu;
  delete require.cache[require.resolve('../config')];
  return ds;
}

console.log('\nmodules.json trong git');

t('KHÔNG base nào mở cho cả phòng trong file — deploy chỉ được phép đóng', () => {
  const tho = JSON.parse(fs.readFileSync(FILE, 'utf8')).modules || [];
  const mo = tho.filter((m) => m.caPhong === true).map((m) => m.id);
  assert.deepStrictEqual(mo, [],
    'base mở sẵn trong git sẽ tự mở lại sau mỗi lần deploy, xoá mất lựa chọn của quản lý: '
    + mo.join(', ') + '. Muốn mở thì khai HUB_CA_PHONG, đừng sửa file.');
});

t('mọi module đều khai id — thiếu id thì env không khớp được vào đâu', () => {
  const tho = JSON.parse(fs.readFileSync(FILE, 'utf8')).modules || [];
  assert.ok(tho.length > 0, 'modules.json rỗng');
  tho.forEach((m) => assert.ok(m.id && String(m.id).trim(), 'có module thiếu id'));
  const ids = tho.map((m) => m.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'có id trùng nhau');
});

console.log('\nmặc định: kín');

t('không khai HUB_CA_PHONG thì KHÔNG base nào mở', () => {
  const mo = nap(undefined).filter((m) => m.caPhong).map((m) => m.id);
  assert.deepStrictEqual(mo, []);
});

t('HUB_CA_PHONG rỗng cũng không mở gì', () => {
  assert.deepStrictEqual(nap('').filter((m) => m.caPhong).map((m) => m.id), []);
  assert.deepStrictEqual(nap('   ').filter((m) => m.caPhong).map((m) => m.id), []);
  assert.deepStrictEqual(nap(',,').filter((m) => m.caPhong).map((m) => m.id), []);
});

t('id lạ trong HUB_CA_PHONG không mở base nào', () => {
  assert.deepStrictEqual(nap('khong-ton-tai').filter((m) => m.caPhong).map((m) => m.id), []);
});

console.log('\nHUB_CA_PHONG mở đúng base được kê tên');

t('mở đúng base trong danh sách, chịu được khoảng trắng và dấu phẩy thừa', () => {
  const ds = nap(' cong-viec , lich-tac-nghiep ,,');
  const mo = ds.filter((m) => m.caPhong).map((m) => m.id);
  assert.deepStrictEqual(mo.sort(), ['cong-viec', 'lich-tac-nghiep']);
});

t('base mở bằng env phải TỰ KHAI là do env — giao diện cần nói thật', () => {
  const ds = nap('cong-viec');
  const cv = ds.find((m) => m.id === 'cong-viec');
  assert.strictEqual(cv.caPhong, true);
  assert.strictEqual(cv.caPhongTuEnv, true,
    'không khai thì giao diện vẽ nút "Đóng lại", bấm vào chỉ sửa file mà env vẫn mở');
  ds.filter((m) => m.id !== 'cong-viec')
    .forEach((m) => assert.strictEqual(m.caPhongTuEnv, false, m.id + ' báo sai nguồn'));
});

t('env chỉ MỞ THÊM, không đóng base đang mở trong file', () => {
  /* Hai nguồn cộng dồn. Nếu env mà đóng được cả cái file đã mở thì bỏ một id khỏi
   * env trên Render là âm thầm khoá base của cả phòng — không ai hiểu vì sao. */
  const tho = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const goc = JSON.stringify(tho, null, 2) + '\n';
  try {
    tho.modules[0].caPhong = true;
    fs.writeFileSync(FILE, JSON.stringify(tho, null, 2) + '\n', 'utf8');
    const ds = nap('');                       // env rỗng
    const m0 = ds.find((m) => m.id === tho.modules[0].id);
    assert.strictEqual(m0.caPhong, true, 'file mở mà env rỗng lại đóng — sai chiều');
    assert.strictEqual(m0.caPhongTuEnv, false, 'mở bằng file thì đừng báo là env');
  } finally {
    fs.writeFileSync(FILE, goc, 'utf8');      // trả file về nguyên trạng
  }
});

console.log('\ngiá trị lạ trong file KHÔNG được mở base');

t('chuỗi "true", số 1, "yes" đều không tính là mở', () => {
  const tho = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const goc = JSON.stringify(tho, null, 2) + '\n';
  try {
    ['true', 1, 'yes', {}, []].forEach((v) => {
      const x = JSON.parse(goc);
      x.modules[0].caPhong = v;
      fs.writeFileSync(FILE, JSON.stringify(x, null, 2) + '\n', 'utf8');
      const m0 = nap(undefined).find((m) => m.id === x.modules[0].id);
      assert.strictEqual(m0.caPhong, false,
        'caPhong = ' + JSON.stringify(v) + ' bị hiểu là mở cho cả phòng');
    });
  } finally {
    fs.writeFileSync(FILE, goc, 'utf8');
  }
});

/* Dòng tổng kết phải đúng mẫu `N pass · M fail` — test/chay-het.js đọc bằng mẫu đó,
 * in kiểu khác là nó báo HỎNG oan cho một bộ đang xanh. */
console.log('\n' + so + ' pass · ' + hong + ' fail\n');
