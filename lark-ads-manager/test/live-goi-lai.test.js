/**
 * Lỗi thoáng qua của một nền tảng (07/11/2026: chip hiện "TikTok lỗi" ngay
 * sau deploy, token vẫn tốt) phải được gọi lại một lần trước khi báo lỗi.
 * Không gọi mạng: thay ketnoi.read và fetchRange bằng hàm giả.
 */
process.env.LARK_LIVE_CHO_GOI_LAI = '1';
const ketnoi = require('../sync/ketnoi');
const tiktok = require('../sync/tiktok');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  ok  ' + name); }
  else { fail += 1; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

ketnoi.read = () => ({ tiktok: { enabled: true, accessToken: 'x', advertiserIds: ['1'] } });
let lan = 0;
let hongMay = 1;
tiktok.fetchRange = async () => {
  lan += 1;
  if (lan <= hongMay) throw new Error('TikTok báo lỗi (50002): thoáng qua');
  return { rows: [{ platform: 'TikTok', date: '2026-11-07' }] };
};
const live = require('../sync/live');

(async () => {
  console.log('— hỏng lần đầu, lần hai được');
  let r = await live.layRows('2026-11-01', '2026-11-07');
  t('không báo lỗi', r.loi.length === 0, JSON.stringify(r.loi));
  t('có số TikTok', r.rows.length === 1 && r.nenTang.includes('TikTok'));
  t('gọi đúng hai lần', lan === 2, String(lan));

  console.log('— hỏng cả hai lần thì mới báo lỗi');
  lan = 0; hongMay = 5;
  r = await live.layRows('2026-11-01', '2026-11-07');
  t('báo lỗi TikTok', r.loi.length === 1 && r.loi[0].platform === 'TikTok', JSON.stringify(r.loi));
  t('chỉ gọi hai lần', lan === 2, String(lan));

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
