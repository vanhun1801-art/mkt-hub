'use strict';
/* Test thuần Node, không framework: `node test/chuanhoa.test.js`. */
const assert = require('assert');

const { docBangDan, soVN } = require('../bang-dan');
const M = require('../metrics');
const { chenhLech, gopDong } = require('../sync');
const store = require('../store');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

console.log('\nbang-dan');

t('đọc số kiểu Việt và kiểu Anh đều ra đúng', () => {
  assert.strictEqual(soVN('1.234.567'), 1234567);
  assert.strictEqual(soVN('1,234,567'), 1234567);
  assert.strictEqual(soVN('148.745'), 148745);   // dấu nghìn, không phải 148,745
  assert.strictEqual(soVN('12,5'), 12.5);        // dấu thập phân
  assert.strictEqual(soVN('95,12%'), 95.12);
  assert.strictEqual(soVN(''), 0);
  assert.strictEqual(soVN('x'), 0);
});

t('nhận cột theo tên, không theo thứ tự', () => {
  const a = docBangDan('Lượt xem\tThời gian bắt đầu\tBình luận\n1.500\t2026-03-01 20:00\t42');
  const b = docBangDan('Thời gian bắt đầu\tBình luận\tLượt xem\n2026-03-01 20:00\t42\t1.500');
  assert.deepStrictEqual(a[0], b[0]);
  assert.strictEqual(a[0].views, 1500);
  assert.strictEqual(a[0].comments, 42);
});

t('nhận cả CSV lẫn bảng dán từ Excel', () => {
  const csv = docBangDan('Thời gian bắt đầu,Lượt xem\n2026-03-01 20:00,900');
  assert.strictEqual(csv[0].views, 900);
});

t('cột lạ thì bỏ qua, không làm lệch các cột còn lại', () => {
  const r = docBangDan('Thời gian bắt đầu\tCột trời ơi\tLượt xem\n2026-03-01\txyz\t700');
  assert.strictEqual(r[0].views, 700);
  assert.strictEqual(r[0].start, '2026-03-01');
});

t('không nhận ra cột nào thì báo lỗi thay vì ghi rác', () => {
  assert.throws(() => docBangDan('aaa\tbbb\n1\t2'), /Không nhận ra cột nào/);
});

t('thiếu dòng số liệu thì báo lỗi', () => {
  assert.throws(() => docBangDan('Lượt xem'), /ít nhất một dòng tiêu đề/);
});

console.log('\nmetrics');

const ng = (o) => Object.assign({
  date: '2026-03-01', platform: 'TikTok', channelExtId: 'k1',
  followers: 0, followUp: 0, followDown: 0, views: 0, reach: 0, impressions: 0,
  profileViews: 0, likes: 0, comments: 0, shares: 0, saves: 0, engagement: 0,
  clicks: 0, messages: 0, leads: 0, posts: 0, lives: 0,
}, o);

t('follower KHÔNG bị cộng dồn qua các ngày', () => {
  const r = M.agg([
    ng({ date: '2026-03-01', followers: 1000, views: 10 }),
    ng({ date: '2026-03-02', followers: 1100, views: 20 }),
    ng({ date: '2026-03-03', followers: 1200, views: 30 }),
  ]);
  assert.strictEqual(r.followers, 1200, 'phải lấy số chốt ngày mới nhất');
  assert.strictEqual(r.views, 60, 'lượt xem thì cộng');
});

t('follower cộng ngang các kênh, không cộng dọc theo ngày', () => {
  const r = M.agg([
    ng({ date: '2026-03-01', channelExtId: 'a', followers: 100 }),
    ng({ date: '2026-03-02', channelExtId: 'a', followers: 120 }),
    ng({ date: '2026-03-02', channelExtId: 'b', followers: 500 }),
  ]);
  assert.strictEqual(r.followers, 620);
});

t('tỷ lệ tương tác lấy mẫu là tiếp cận, thiếu tiếp cận thì lấy lượt xem', () => {
  assert.strictEqual(M.agg([ng({ engagement: 50, reach: 1000, views: 5000 })]).tyLeTuongTac, 0.05);
  assert.strictEqual(M.agg([ng({ engagement: 50, reach: 0, views: 500 })]).tyLeTuongTac, 0.1);
});

t('chia cho 0 ra 0 chứ không ra Infinity', () => {
  const r = M.agg([ng({ engagement: 10 })]);
  assert.strictEqual(r.tyLeTuongTac, 0);
  assert.strictEqual(r.xemMoiBai, 0);
});

t('lọc theo khoảng ngày và nền tảng', () => {
  const ds = [
    ng({ date: '2026-03-01', platform: 'TikTok' }),
    ng({ date: '2026-03-05', platform: 'Facebook' }),
    ng({ date: '2026-04-01', platform: 'TikTok' }),
  ];
  assert.strictEqual(M.loc(ds, { from: '2026-03-01', to: '2026-03-31' }).length, 2);
  assert.strictEqual(M.loc(ds, { platforms: ['TikTok'] }).length, 2);
});

t('chuỗi theo ngày điền đủ cả ngày trống', () => {
  const r = M.theoNgay([ng({ date: '2026-03-02', views: 5 })], '2026-03-01', '2026-03-03');
  assert.strictEqual(r.length, 3);
  assert.strictEqual(r[0].views, 0);
  assert.strictEqual(r[1].views, 5);
});

console.log('\nchênh lệch (nguồn luỹ kế: TikTok display / Zalo)');

const bai = (o) => Object.assign({
  platform: 'TikTok', extId: 'k1', postId: 'v1', publishedAt: '2026-03-02T10:00:00Z',
  views: 0, likes: 0, comments: 0, shares: 0, saves: 0, source: 'TikTok API',
}, o);

t('bài đã có trong Base: chỉ lấy phần tăng thêm', () => {
  const cu = new Map([['TikTok#v1', { views: 1000, likes: 10, comments: 2, shares: 1, saves: 0 }]]);
  const r = chenhLech(cu, [bai({ views: 1500, likes: 25 })], '2026-03-05', '2026-03-01', new Set(['k1']));
  assert.strictEqual(r[0].views, 500);
  assert.strictEqual(r[0].likes, 15);
  assert.strictEqual(r[0].posts, 0, 'bài cũ không tính là bài mới');
});

t('bài mới đăng trong kỳ: tính trọn, GÁN VÀO NGÀY ĐĂNG', () => {
  const r = chenhLech(new Map(), [bai({ views: 800 })], '2026-03-05', '2026-03-01', new Set(['k1']));
  assert.strictEqual(r[0].views, 800);
  assert.strictEqual(r[0].date, '2026-03-02', 'phải là ngày đăng, không phải ngày chạy');
});

t('chenhLech KHÔNG đếm số bài — việc đó của vòng đếm theo ngày đăng', () => {
  // Đếm ở cả hai chỗ là 448 bài thành 884, và 436 bài dồn vào một ngày.
  const r = chenhLech(new Map(), [bai({ views: 10 })], '2026-03-05', '2026-03-01', new Set(['k1']));
  assert.strictEqual(r[0].posts, 0);
});

t('nhiều bài đăng nhiều ngày thì rải ra nhiều dòng, không dồn một cột', () => {
  const ds = [
    bai({ postId: 'v1', publishedAt: '2026-03-01T10:00:00Z', views: 100 }),
    bai({ postId: 'v2', publishedAt: '2026-03-02T10:00:00Z', views: 200 }),
    bai({ postId: 'v3', publishedAt: '2026-03-02T20:00:00Z', views: 300 }),
  ];
  const r = chenhLech(new Map(), ds, '2026-03-05', '2026-03-01', new Set(['k1']));
  const theoNgay = Object.fromEntries(r.map((x) => [x.date, x.views]));
  assert.deepStrictEqual(theoNgay, { '2026-03-01': 100, '2026-03-02': 500 });
});

t('phần tăng thêm của bài cũ vẫn gán vào NGÀY CHẠY', () => {
  const cu = new Map([['TikTok#v1', { views: 1000, likes: 0, comments: 0, shares: 0, saves: 0 }]]);
  const r = chenhLech(cu, [bai({ views: 1200 })], '2026-03-05', '2026-03-01', new Set(['k1']));
  assert.strictEqual(r[0].views, 200);
  assert.strictEqual(r[0].date, '2026-03-05');
});

t('bài đăng SAU ngày chạy thì bỏ qua (đồng hồ nền tảng lệch)', () => {
  const r = chenhLech(new Map(), [bai({ publishedAt: '2026-04-01T00:00:00Z', views: 999 })],
    '2026-03-05', '2026-03-01', new Set(['k1']));
  assert.strictEqual(r.length, 0);
});

t('bài lạ đăng TRƯỚC kỳ: bỏ qua, không đội số', () => {
  const r = chenhLech(new Map(), [bai({ publishedAt: '2025-01-01T00:00:00Z', views: 9e6 })],
    '2026-03-05', '2026-03-01', new Set(['k1']));
  assert.strictEqual(r.length, 0, 'không có mốc so sánh thì thà thiếu còn hơn bịa');
});

t('nền tảng đếm lùi (view bị Meta chỉnh giảm) không ra số âm', () => {
  const cu = new Map([['TikTok#v1', { views: 2000, likes: 0, comments: 0, shares: 0, saves: 0 }]]);
  const r = chenhLech(cu, [bai({ views: 1800 })], '2026-03-05', '2026-03-01', new Set(['k1']));
  assert.strictEqual(r[0].views, 0);
});

t('chỉ tính cho kênh trong danh sách luỹ kế', () => {
  const r = chenhLech(new Map(), [bai({ extId: 'k9', views: 500 })],
    '2026-03-05', '2026-03-01', new Set(['k1']));
  assert.strictEqual(r.length, 0);
});

console.log('\ngộp hai nguồn cùng một ngày');

t('gộp thì cộng lưu lượng nhưng follower lấy số lớn hơn', () => {
  const r = gopDong(ng({ views: 100, followers: 900 }), ng({ views: 50, followers: 1000 }));
  assert.strictEqual(r.views, 150);
  assert.strictEqual(r.followers, 1000);
});

console.log('\nngày tháng');

t('ngày ghi vào Base là chuỗi trần giờ base, không quy đổi sang UTC', () => {
  // Đã thử trên Base thật: Lark đọc chuỗi trần theo múi giờ của Base (+8).
  // Quy đổi sang UTC trước khi ghi là mọi dòng lùi đúng một ngày.
  assert.strictEqual(store.ngayVeBase('2026-03-05'), '2026-03-05 00:00:00');
});

t('đọc lại đúng ngày từ giá trị Base trả về', () => {
  assert.strictEqual(store.toKey('2026-03-05T00:00:00.000+08:00'), '2026-03-05');
});

t('giờ từ nền tảng (UTC) đổi sang giờ base trước khi ghi', () => {
  // 03/03 lúc 20:00 UTC = 04/03 lúc 04:00 giờ base (+8) — không đổi là lệch 8 tiếng,
  // và mọi bài đăng buổi tối bị xếp nhầm sang ngày hôm trước.
  assert.strictEqual(store.gioVeBase('2026-03-03T20:00:00Z'), '2026-03-04 04:00:00');
  assert.strictEqual(store.gioVeBase('không phải ngày'), null);
});

t('themNgay qua mốc tháng vẫn đúng', () => {
  assert.strictEqual(store.themNgay('2026-03-01', -1), '2026-02-28');
  assert.strictEqual(store.themNgay('2026-02-28', 1), '2026-03-01');
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
