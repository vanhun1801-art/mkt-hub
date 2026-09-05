'use strict';
/**
 * Kho khoá và việc che token là hai chốt bảo mật. Chốt bảo mật không có test là
 * chỗ dễ hỏng nhất khi sửa code sau này — nên chúng có test riêng.
 *
 * Chạy: node test/vault.test.js
 */
process.env.SOCIAL_VAULT_KEY = 'khoa-thu-nghiem-khong-dung-that';
const assert = require('assert');

const vault = require('../vault');
const ketnoi = require('../ketnoi');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

console.log('\nkho khoá');

t('có SOCIAL_VAULT_KEY thì kho bật', () => {
  assert.strictEqual(vault.bat(), true);
});

t('mã hoá rồi giải mã ra đúng bản gốc', () => {
  const goc = { channels: [{ openId: 'abc', refreshToken: 'rft_secret_123' }] };
  assert.deepStrictEqual(vault.giaiMa(vault.maHoa(goc)), goc);
});

t('bản mã KHÔNG chứa token ở dạng đọc được', () => {
  const s = vault.maHoa({ refreshToken: 'rft_secret_123' });
  assert.ok(!s.includes('rft_secret_123'), 'token lọt ra ngoài bản mã');
  assert.ok(!s.includes('refreshToken'), 'tên trường cũng không được lộ');
});

t('hai lần mã hoá cùng nội dung ra hai chuỗi khác nhau', () => {
  // IV ngẫu nhiên: giống nhau nghĩa là ai xem Base cũng biết token có đổi hay không
  assert.notStrictEqual(vault.maHoa({ a: 1 }), vault.maHoa({ a: 1 }));
});

t('sửa một ký tự trong bản mã thì giải mã hỏng, không trả rác', () => {
  const s = vault.maHoa({ a: 1 });
  const p = s.split('.');
  p[3] = (p[3][0] === 'A' ? 'B' : 'A') + p[3].slice(1);
  assert.throws(() => vault.giaiMa(p.join('.')));
});

t('sai chìa thì không giải được', () => {
  const s = vault.maHoa({ a: 1 });
  const cu = process.env.SOCIAL_VAULT_KEY;
  // config đọc env một lần lúc require, nên phải nạp lại module để đổi chìa
  process.env.SOCIAL_VAULT_KEY = 'chia-khac-hoan-toan';
  for (const k of Object.keys(require.cache)) {
    if (/lark-social[\\/](vault|config)\.js$/.test(k)) delete require.cache[k];
  }
  const v2 = require('../vault');
  assert.throws(() => v2.giaiMa(s));
  process.env.SOCIAL_VAULT_KEY = cu;
});

t('chuỗi không đúng định dạng thì báo lỗi rõ ràng', () => {
  assert.throws(() => vault.giaiMa('rác'), /không đúng định dạng/);
  assert.throws(() => vault.giaiMa('v9.a.b.c'), /không đúng định dạng/);
});

console.log('\nche token khi trả ra giao diện');

t('mọi khoá bí mật đều bị che', () => {
  const c = ketnoi.checHet({
    facebook: { userToken: 'EAAG0123456789abcdef', apiVersion: 'v23.0' },
    tiktok: {
      clientSecret: 'tts_super_secret_value',
      channels: [{ openId: 'ok1', refreshToken: 'rft_abcdefghijklmnop', name: 'Kênh 1' }],
    },
    zalo: { secretKey: 'zalo_secret_key_xyz' },
  });
  const s = JSON.stringify(c);
  ['EAAG0123456789abcdef', 'tts_super_secret_value', 'rft_abcdefghijklmnop', 'zalo_secret_key_xyz']
    .forEach((bi) => assert.ok(!s.includes(bi), 'lộ bí mật: ' + bi));
});

t('che nhưng vẫn phân biệt được đã khai hay chưa', () => {
  const c = ketnoi.checHet({ facebook: { userToken: 'EAAG0123456789abcdef' } });
  assert.ok(c.facebook.userToken.includes('••••'));
  assert.strictEqual(ketnoi.checHet({ facebook: { userToken: '' } }).facebook.userToken, '');
});

t('trường không bí mật thì giữ nguyên để giao diện dùng được', () => {
  const c = ketnoi.checHet({
    tiktok: { clientKey: 'awxyz123', channels: [{ openId: 'ok1', mode: 'business' }] },
  });
  assert.strictEqual(c.tiktok.clientKey, 'awxyz123');
  assert.strictEqual(c.tiktok.channels[0].mode, 'business');
});

t('coThongTin biết được cấu hình rỗng với cấu hình đã khai', () => {
  assert.strictEqual(ketnoi.coThongTin({ facebook: { userToken: '' } }), false);
  assert.strictEqual(ketnoi.coThongTin({ facebook: { userToken: 'x' } }), true);
  // token nằm sâu trong mảng channels vẫn phải nhận ra
  assert.strictEqual(ketnoi.coThongTin({ tiktok: { channels: [{ refreshToken: 'r' }] } }), true);
});

console.log('\nche token trong thông báo lỗi');

t('scrub() cắt token kể cả khi nó nằm trần giữa câu', () => {
  const { scrub, hideSecret } = require('../sync/http');
  hideSecret('EAAG0123456789abcdefXYZ');
  const cau = scrub('Malformed access token EAAG0123456789abcdefXYZ at position 3');
  assert.ok(!cau.includes('EAAG0123456789abcdefXYZ'));
  assert.ok(scrub('?access_token=abc123xyz789&x=1').includes('access_token=***'));
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
