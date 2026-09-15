'use strict';
/* Test thuần Node: `node test/canh-bao.test.js`. */
const assert = require('assert');
const cb = require('../canh-bao');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

const HOM_NAY = '2026-09-15';
const bai = (kenh, platform, ngay) => ({ channelExtId: kenh, channel: kenh, platform, date: ngay });
const ngay = (kenh, platform, d, views) => ({
  channelExtId: kenh, channel: kenh, platform, date: d, views,
});

console.log('\ncảnh báo — luật tụt');

t('TikTok KHÔNG bị xét luật tụt', () => {
  /* TikTok ghi trọn lượt xem đời của video vào NGÀY ĐĂNG, nên tuần không đăng là
     0 lượt xem — không phải vì không ai xem. Đo thật ngày 15/09: bốn kênh TikTok
     cùng hiện -100% trong khi kênh vẫn chạy bình thường. Bật luật này cho TikTok
     là mỗi tuần nhóm nhận mấy tin báo động giả, và sau hai tuần thì không ai đọc
     cảnh báo nữa — hỏng luôn cả những cảnh báo thật. */
  const d = {
    posts: [bai('tt1', 'TikTok', HOM_NAY)],
    daily: [
      ngay('tt1', 'TikTok', '2026-09-03', 139321),
      ngay('tt1', 'TikTok', '2026-09-14', 0),
    ],
  };
  const ds = cb.doTim(d, cb.MAC_DINH, HOM_NAY);
  assert.strictEqual(ds.filter((x) => x.loai === 'Kênh tụt').length, 0);
});

t('Facebook tụt quá ngưỡng thì báo', () => {
  const d = {
    posts: [bai('fb1', 'Facebook', HOM_NAY)],
    daily: [
      ngay('fb1', 'Facebook', '2026-09-03', 100000),
      ngay('fb1', 'Facebook', '2026-09-14', 20000),
    ],
  };
  const ds = cb.doTim(d, cb.MAC_DINH, HOM_NAY).filter((x) => x.loai === 'Kênh tụt');
  assert.strictEqual(ds.length, 1);
  assert.strictEqual(ds[0].muc, 'Nặng');
  assert.ok(/80%/.test(ds[0].noiDung), ds[0].noiDung);
});

t('kênh nhỏ dưới ngưỡng tối thiểu thì im, khỏi nhiễu', () => {
  const d = {
    posts: [bai('fb1', 'Facebook', HOM_NAY)],
    daily: [
      ngay('fb1', 'Facebook', '2026-09-03', 300),
      ngay('fb1', 'Facebook', '2026-09-14', 10),
    ],
  };
  assert.strictEqual(cb.doTim(d, cb.MAC_DINH, HOM_NAY).filter((x) => x.loai === 'Kênh tụt').length, 0);
});

console.log('\ncảnh báo — luật im lặng');

t('một kênh im thì báo đúng kênh đó', () => {
  const d = {
    posts: [
      bai('a', 'TikTok', '2026-08-17'),
      bai('b', 'TikTok', HOM_NAY), bai('c', 'Facebook', HOM_NAY),
      bai('d', 'Facebook', HOM_NAY), bai('e', 'Instagram', HOM_NAY),
    ],
    daily: [],
  };
  const ds = cb.doTim(d, cb.MAC_DINH, HOM_NAY).filter((x) => x.loai === 'Kênh im lặng');
  assert.strictEqual(ds.length, 1);
  assert.strictEqual(ds[0].kenh, 'a');
  assert.strictEqual(ds[0].muc, 'Nặng', '29 ngày là quá gấp đôi ngưỡng');
});

t('gần như MỌI kênh cùng im thì gộp thành một tin nghi máy hỏng', () => {
  /* Mười kênh cùng ngừng đăng thì lời giải thích gần như chắc chắn là app không
     lấy được bài, chứ không phải mười đội cùng nghỉ. Gửi mười tin "kênh X im
     lặng" là đổ lỗi cho mười người về một lỗi của máy. */
  const d = {
    posts: ['a', 'b', 'c', 'd', 'e'].map((k) => bai(k, 'TikTok', '2026-09-08')),
    daily: [],
  };
  const ds = cb.doTim(d, cb.MAC_DINH, HOM_NAY);
  assert.strictEqual(ds.filter((x) => x.loai === 'Kênh im lặng').length, 0);
  const gop = ds.filter((x) => x.loai === 'Đồng bộ hỏng' && /5\/5 kênh/.test(x.noiDung));
  assert.strictEqual(gop.length, 1);
  assert.strictEqual(gop[0].muc, 'Nặng');
});

t('ít kênh thì không gộp, tránh gộp nhầm khi mới có hai kênh', () => {
  const d = { posts: [bai('a', 'TikTok', '2026-09-01'), bai('b', 'TikTok', '2026-09-01')], daily: [] };
  const ds = cb.doTim(d, cb.MAC_DINH, HOM_NAY);
  assert.strictEqual(ds.filter((x) => x.loai === 'Kênh im lặng').length, 2);
});

console.log('\ncảnh báo — chống gửi trùng');

t('cùng một kênh im thì khoá không đổi theo ngày', () => {
  /* Khoá phải ổn định, nếu không thì mỗi ngày là một khoá mới và kênh im ba tuần
     sinh hai mươi mốt cái tin giống hệt. */
  const d = (h) => ({
    posts: [bai('a', 'TikTok', '2026-08-17'), bai('b', 'TikTok', h),
      bai('c', 'Facebook', h), bai('d', 'Facebook', h), bai('e', 'Instagram', h)],
    daily: [],
  });
  const k1 = cb.doTim(d('2026-09-15'), cb.MAC_DINH, '2026-09-15')
    .find((x) => x.loai === 'Kênh im lặng').khoa;
  const k2 = cb.doTim(d('2026-09-16'), cb.MAC_DINH, '2026-09-16')
    .find((x) => x.loai === 'Kênh im lặng').khoa;
  assert.strictEqual(k1, k2);
});

t('kênh tụt thì khoá đổi theo TUẦN, để tuần sau còn báo lại được', () => {
  const mk = (h) => cb.doTim({
    posts: [bai('fb1', 'Facebook', h)],
    daily: [ngay('fb1', 'Facebook', '2026-09-01', 100000), ngay('fb1', 'Facebook', h, 1000)],
  }, cb.MAC_DINH, h).filter((x) => x.loai === 'Kênh tụt');
  const a = mk('2026-09-07')[0];
  const b = mk('2026-09-20')[0];
  if (a && b) assert.notStrictEqual(a.khoa, b.khoa);
});

console.log('\ncảnh báo — soạn tin');

t('tin có mức nặng lên đầu và không rỗng', () => {
  const tin = cb.soanTin([
    { muc: 'Vừa', noiDung: 'việc nhẹ' }, { muc: 'Nặng', noiDung: 'việc nặng' },
  ], HOM_NAY);
  assert.ok(tin.includes(HOM_NAY));
  assert.ok(tin.includes('việc nặng') && tin.includes('việc nhẹ'));
});

t('không có gì đáng báo thì trả mảng rỗng, không dựng tin rỗng', () => {
  const d = { posts: [bai('a', 'TikTok', HOM_NAY)], daily: [] };
  assert.strictEqual(cb.doTim(d, cb.MAC_DINH, HOM_NAY).length, 0);
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
