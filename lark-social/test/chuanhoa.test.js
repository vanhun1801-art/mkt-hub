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

console.log('\nphân loại lỗi của Meta');

const { laMetricHong } = require('../sync/facebook');

t('chỉ lỗi "metric không hợp lệ" mới được coi là metric đã bị gỡ', () => {
  assert.strictEqual(laMetricHong(
    { code: 100, message: '(#100) The value must be a valid insights metric' }), true);
  assert.strictEqual(laMetricHong(
    { code: 100, message: '(#100) Tried accessing nonexisting field' }), true);
});

t('thiếu quyền / hết hạn / quá tải KHÔNG phải metric chết', () => {
  /* Bản trước gộp chung: một token thiếu read_insights làm cả tám metric bị đánh
     dấu chết, và nhật ký ghi "v23.0 không còn nhận page_post_engagements,
     page_views_total…" — kể tên đúng những metric vừa kiểm chứng là còn sống.
     Câu bịa đó tệ hơn im lặng: người đọc đi thay metric trong khi việc phải làm
     là cấp lại token. */
  [
    { code: 10, message: "(#10) This endpoint requires the 'pages_read_user_content' permission" },
    { code: 200, message: '(#200) Permissions error' },
    { code: 190, message: 'Error validating access token: Session has expired' },
    { code: 4, message: '(#4) Application request limit reached' },
    { code: 100, message: '(#100) Missing permissions' },
  ].forEach((e) => assert.strictEqual(laMetricHong(e), false,
    'lỗi ' + e.code + ' không được coi là metric chết'));
});

t('không nổ khi thiếu err hoặc thiếu message', () => {
  assert.strictEqual(laMetricHong(null), false);
  assert.strictEqual(laMetricHong({}), false);
  assert.strictEqual(laMetricHong({ code: 100 }), false);
});

console.log('\nmetrics — mẫu số và follower chốt');

t('tỷ lệ tương tác chọn mẫu số theo từng dòng, không cộng xong mới chọn', () => {
  /* Đúng hình dạng dữ liệu thật của tháng 5: chỉ Instagram có `reach`, còn
     Facebook và TikTok chỉ có `views`. Cộng hết rồi mới chọn mẫu số thì ra
     1.522% — con số đã thật sự hiện lên màn hình. Chọn theo từng dòng thì mẫu
     số là 60.000 + 18.000.000 + 600.000. */
  const r = M.agg([
    { platform: 'instagram', views: 70000, reach: 60000, engagement: 4000 },
    { platform: 'facebook', views: 18000000, engagement: 900000 },
    { platform: 'tiktok', views: 600000, engagement: 15384 },
  ]);
  assert.strictEqual(r.mauSo, 18660000);
  assert.ok(Math.abs(r.tyLeTuongTac - 919384 / 18660000) < 1e-12);
  assert.ok(r.tyLeTuongTac < 0.1, 'tỷ lệ tương tác không được vượt 100%');
});

t('dòng có tiếp cận thì lấy tiếp cận, không cộng cả tiếp cận lẫn lượt xem', () => {
  const r = M.agg([{ views: 1000, reach: 400, engagement: 40 }]);
  assert.strictEqual(r.mauSo, 400);
  assert.strictEqual(r.tyLeTuongTac, 0.1);
});

t('không dòng nào có số thì tỷ lệ bằng 0, không phải NaN', () => {
  const r = M.agg([]);
  assert.strictEqual(r.mauSo, 0);
  assert.strictEqual(r.tyLeTuongTac, 0);
});

t('follower chốt lấy mốc gần nhất trước ngày cuối, kể cả ngoài khoảng lọc', () => {
  /* TikTok chỉ chốt được follower vào ngày chạy đồng bộ, nên lọc tháng 5 thì
     trong khoảng không có dòng nào mang follower — bảng từng hiện 0 như thể
     mất kênh. */
  const ds = [
    { date: '2026-04-20', platform: 'tiktok', channelExtId: 'tt1', followers: 12000 },
    { date: '2026-05-10', platform: 'tiktok', channelExtId: 'tt1', views: 500 },
    { date: '2026-05-31', platform: 'facebook', channelExtId: 'fb1', followers: 671763 },
    { date: '2026-06-15', platform: 'tiktok', channelExtId: 'tt1', followers: 99999 },
  ];
  const chot = M.followerChot(ds, '2026-05-31', {});
  const m = new Map(chot.map((x) => [x.kenh, x.followers]));
  assert.strictEqual(m.get('tt1'), 12000, 'phải lấy mốc 20/4, không phải 0');
  assert.strictEqual(m.get('fb1'), 671763);
  assert.strictEqual(chot.reduce((a, b) => a + b.followers, 0), 683763);
});

t('follower chốt không lấy số của tương lai', () => {
  const ds = [
    { date: '2026-05-01', platform: 'tiktok', channelExtId: 'tt1', followers: 10 },
    { date: '2026-09-01', platform: 'tiktok', channelExtId: 'tt1', followers: 900 },
  ];
  assert.strictEqual(M.followerChot(ds, '2026-05-31', {})[0].followers, 10);
});

t('follower chốt vẫn tôn trọng bộ lọc nền tảng', () => {
  const ds = [
    { date: '2026-04-01', platform: 'tiktok', channelExtId: 'tt1', followers: 10 },
    { date: '2026-04-01', platform: 'facebook', channelExtId: 'fb1', followers: 700 },
  ];
  const chot = M.followerChot(ds, '2026-05-31', { platforms: ['tiktok'] });
  assert.strictEqual(chot.length, 1);
  assert.strictEqual(chot[0].followers, 10);
});

t('đọc ĐÚNG metric hỏng từ thông báo lỗi của Instagram', () => {
  /* Lỗi thật, làm 101/105 bài Instagram vào Base với 0 lượt xem.
     Thông báo của Meta có dạng:
       "(#100) metric[5] must be one of the following values: impressions, reach,
        replies, saved, likes, comments, shares, total_interactions…"
     Phần sau dấu hai chấm là danh sách metric HỢP LỆ. Bản trước dò thủ phạm bằng
     msg.includes(tên) nên khớp ngay `views` — hợp lệ hoàn toàn, chỉ vì nó có mặt
     trong danh sách gợi ý. Vòng lặp lần lượt vứt views, reach, likes… còn thủ
     phạm thật (`saves`) thì không bao giờ bị nhận ra vì nó KHÔNG nằm trong danh
     sách hợp lệ. */
  const msg = '(#100) metric[5] must be one of the following values: impressions, reach, '
    + 'replies, saved, likes, comments, shares, total_interactions, follows';
  const conLai = ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'total_interactions'];

  const cachCu = conLai.find((m) => msg.includes(m));
  assert.notStrictEqual(cachCu, 'saves', 'cách cũ đúng là bỏ nhầm metric — đây là cái bẫy');
  assert.ok(conLai.includes(cachCu), 'và nó bỏ một metric hoàn toàn hợp lệ (' + cachCu + ')');

  /* Cách mới: dùng chỉ số Meta nói. */
  const viTri = /metric\[(\d+)\]/.exec(msg);
  assert.ok(viTri);
  assert.strictEqual(conLai[Number(viTri[1])], 'saves', 'phải bỏ đúng saves');

  /* Không có chỉ số thì chỉ đoán trên phần TRƯỚC dấu hai chấm. */
  const truoc = msg.split(':')[0];
  assert.strictEqual(conLai.find((m) => truoc.includes(m)), undefined,
    'không được đoán bừa từ danh sách gợi ý');
});

t('instagram.js dùng chỉ số metric, không dò cả thông báo', () => {
  const src = require('fs').readFileSync(require.resolve('../sync/instagram'), 'utf8');
  assert.ok(src.includes('metric') && src.includes('.exec(msg)'),
    'phải đọc chỉ số metric[N] từ thông báo lỗi');
  assert.ok(src.includes("msg.split(':')[0]"),
    'khi đoán theo tên thì chỉ xét phần trước dấu hai chấm');
});

t('trần số bài phải lên tiếng, không được cắt âm thầm', () => {
  /* Lỗi thật: trần 200 bài mỗi Page, vòng ngoài đi từ tháng cũ đến tháng mới,
     nên 200 bài đầu găm hết vào đầu năm rồi dừng. Chạy lại cả năm chỉ làm mới
     525/933 bài, mà nhật ký vẫn báo "Thành công" — không chỗ nào nói rằng
     những tháng gần đây chưa được đọc lại. */
  const src = require('fs').readFileSync(require.resolve('../sync/facebook'), 'utf8');
  assert.ok(src.includes('chamTran'), 'phải có cờ đánh dấu dừng vì trần');
  assert.ok(/chamTran[\s\S]{0,400}canhBao\.push/.test(src),
    'chạm trần thì phải đẩy cảnh báo cho người dùng thấy');
  assert.ok(/soBaiToiDa \|\| (\d{4,})/.test(src), 'trần dự phòng phải đủ rộng cho cả năm');
  /* Trần thật nằm trong cấu hình, không phải ở toán tử `||` — nâng mỗi chỗ kia
     thì chạy lại vẫn dừng ở 200, đúng như lần thử đầu. */
  const cfg = require('fs').readFileSync(require.resolve('../ketnoi'), 'utf8');
  const m = /soBaiToiDa: (\d+)/.exec(cfg);
  assert.ok(m && Number(m[1]) >= 1000, 'cấu hình mặc định cũng phải đủ rộng, hiện là ' + (m && m[1]));
});

t('until của Meta loại trừ, nên phải cộng thêm một ngày', () => {
  /* Lỗi thật, kín đáo nhất trong cả loạt. chiaKhoang() trả các cửa sổ liền nhau
     và bao cả hai đầu: [01-01, 01-31], [02-01, 03-03]… Nhưng `until` của Meta hiểu
     là 0h00 ngày đó, tức LOẠI TRỪ. Truyền thẳng `den` vào là mất trắng ngày cuối
     của mỗi cửa sổ — tám ngày mỗi trang mỗi năm, không lỗi nào báo. Kiểm chứng
     bằng API thật: until=2026-09-05 trả về các ngày 01, 03, 04; until=2026-09-06
     mới có ngày 05. */
  const { chiaKhoang, ngayKe } = require('../sync/ngay');
  assert.strictEqual(ngayKe('2026-09-05'), '2026-09-06');
  assert.strictEqual(ngayKe('2026-12-31'), '2027-01-01');
  assert.strictEqual(ngayKe('2026-02-28'), '2026-03-01');

  /* Không cửa sổ nào được vượt trần sau khi đã cộng thêm ngày. */
  const ngay = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
  chiaKhoang('2026-01-01', '2026-12-31', 29).forEach(([t, d]) => {
    assert.ok(ngay(t, ngayKe(d)) <= 30, 'cửa sổ Instagram vượt 30 ngày: ' + t + '→' + d);
  });
  chiaKhoang('2026-01-01', '2026-12-31', 89).forEach(([t, d]) => {
    assert.ok(ngay(t, ngayKe(d)) <= 93, 'cửa sổ Facebook vượt trần: ' + t + '→' + d);
  });

  /* Và mọi nơi gọi Meta phải dùng ngayKe, không truyền thẳng den. */
  ['../sync/facebook', '../sync/instagram'].forEach((m) => {
    const src = require('fs').readFileSync(require.resolve(m), 'utf8');
    assert.ok(!/'&until=' \+ den/.test(src), m + ' còn truyền thẳng den vào until');
  });
});

t('lượt xem video phải là TỔNG LƯỢT PHÁT, không phải lượt xem từ 3 giây', () => {
  /* Anh Hùng mở Meta Business đối chiếu: reel 1408945757797599 hiện "1,3 triệu
     lượt xem", app ghi 722.178 — thấp hơn 42%. Không phải mất số, mà hỏi nhầm
     chỉ số. Mức bài trả post_video_views = lượt xem TỪ 3 GIÂY (722.194); con số
     Meta hiện là tổng lượt phát, chỉ có ở node video:
       fb_reels_play_count   =   895.523
       fb_reels_replay_count =   355.410
       fb_reels_total_plays  = 1.250.933  ← đúng cái Meta hiện
     Node video còn trả lại hai thứ mức bài đã gỡ: post_impressions_unique
     (tiếp cận thật, 901.534) và post_video_social_actions (bình luận kể cả trả
     lời: 486, trong khi comments.summary chỉ đếm bình luận gốc: 288). */
  const src = require('fs').readFileSync(require.resolve('../sync/facebook'), 'utf8');
  assert.ok(src.includes('video_insights'), 'phải hỏi node video');
  assert.ok(src.includes('fb_reels_total_plays'), 'reels phải lấy tổng lượt phát');
  assert.ok(src.includes('post_impressions_unique'), 'phải đòi lại tiếp cận mức bài');
  assert.ok(src.includes('post_video_social_actions'), 'phải lấy bình luận kể cả trả lời');
  /* Thứ tự ưu tiên: reels trước, video thường sau — không được đảo. */
  const i = src.indexOf('fb_reels_total_plays');
  const j = src.indexOf('total_video_views', i);
  assert.ok(i > 0 && j > i, 'fb_reels_total_plays phải đứng trước total_video_views');
});

t('ảnh và bài chữ Facebook thì KHÔNG đòi được gì thêm', () => {
  /* Kiểm chứng bằng API thật trên một bài ảnh: post_impressions,
     post_impressions_unique, post_impressions_organic, post_engaged_users đều
     trả "(#100) The value must be a valid insights metric". Chỉ còn post_clicks
     và post_reactions_by_type_total. Nên ô Lượt xem và Tiếp cận của bài ảnh để
     trống là ĐÚNG, không phải thiếu sót — và không được ghi 0. */
  const xuat = require('../xuat-doi-tac');
  assert.strictEqual(xuat.oXem({ platform: 'Facebook', type: 'Ảnh', views: 0 }), null);
  assert.strictEqual(xuat.oTiepCan({ platform: 'Facebook', reach: 0 }), null);
  /* Còn video thì giờ PHẢI có tiếp cận. */
  assert.strictEqual(xuat.oTiepCan({ platform: 'Facebook', reach: 901534 }), 901534);
});

t('cửa sổ quét lại mặc định phải phủ được cả tháng', () => {
  /* Lượt xem còn chạy tiếp hàng tháng sau khi đăng, nên quét lại 7 ngày là số
     của bài cũ đứng yên ở con số lúc đồng bộ lần cuối: bài 05/09 sau mười ngày
     đã lệch 34% so với thực tế. Báo cáo đối tác làm theo tháng, nên cửa sổ phải
     phủ được cả tháng. Ba chỗ cùng giữ con số này — cấu hình, giá trị dự phòng
     trong sync, và ô nhập ở Cài đặt — lệch một chỗ là lệch hành vi. */
  const fs = require('fs');
  const cfg = fs.readFileSync(require.resolve('../ketnoi'), 'utf8');
  const m = /soNgayLui: (\d+)/.exec(cfg);
  assert.ok(m && Number(m[1]) >= 30, 'cấu hình mặc định: ' + (m && m[1]));

  const sync = fs.readFileSync(require.resolve('../sync/index'), 'utf8');
  assert.ok(/soNgayLui\) \|\| 30/.test(sync), 'sync/index.js còn dự phòng 7 ngày');

  const ui = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  assert.ok(!/soNgayLui \|\| 7\b/.test(ui), 'ô Cài đặt còn hiện 7 ngày');
});

t('follower TikTok phải chốt vào HÔM NAY, không phải ngày cuối kỳ', () => {
  /* Lỗi thật anh Hùng bắt: cột Follower của mọi kênh TikTok về 0 trên màn hình
     Theo kênh, dù API vẫn trả 300.415. Display API không có lịch sử nên chỉ
     chốt được follower của hôm nay, nhưng dòng đó bị đóng dấu ngày `to`. Chọn
     khoảng "Tháng này" là to = 30/9 — một ngày CHƯA TỚI. Mọi báo cáo kết thúc
     trước 30/9 không thấy dòng đó, nên follower về 0; còn đến 30/9 thật thì ô
     đó đang giữ con số của 19/9. */
  const src = require('fs').readFileSync(require.resolve('../sync/tiktok'), 'utf8');
  assert.ok(/ngayChot/.test(src), 'phải có biến chốt ngày riêng');
  assert.ok(/to && to < homNay \? to : homNay/.test(src),
    'ngày chốt phải là min(to, hôm nay) — không bao giờ vượt hôm nay');
  assert.ok(!/dongTrong\(ch\.openId \|\| hs\.openId, to\)/.test(src),
    'còn đóng dấu thẳng ngày `to` vào dòng follower');

  /* Công thức chốt, kiểm trực tiếp. */
  const chot = (to, homNay) => (to && to < homNay ? to : homNay);
  assert.strictEqual(chot('2026-09-30', '2026-09-19'), '2026-09-19', 'kỳ tương lai → hôm nay');
  assert.strictEqual(chot('2026-08-31', '2026-09-19'), '2026-08-31', 'kỳ đã qua → giữ ngày cuối kỳ');
  assert.strictEqual(chot('', '2026-09-19'), '2026-09-19', 'không có `to` → hôm nay');
});

t('nói rõ vì sao TikTok không có Hiển thị và Tiếp cận', () => {
  /* Hai cột đó trống không phải vì hỏng, mà vì Display API không có. Người đọc
     thấy ô trống mà không có lời giải thích thì kết luận là app lỗi. */
  const M = require('../metrics');
  const luu = M.luuYNenTang([{ platform: 'TikTok' }]).join(' | ');
  assert.ok(/Display API/.test(luu), 'phải nêu đúng nguyên nhân là Display API');
  assert.ok(/Business API/.test(luu), 'phải nói cách lấy được hai cột đó');
});

t('không bao giờ ghi dòng ngày cho ngày chưa tới', () => {
  /* Lỗi thật: Base có 37 dòng cho các ngày 21/9–30/9 trong khi hôm nay 20/9,
     follower bê nguyên sang còn lượt xem bằng 0. Chọn khoảng "Tháng này" là
     `den` thành ngày cuối tháng, mà nền tảng vẫn trả chỉ số trọn đời cho từng
     ngày tới hết khoảng. Biểu đồ đọc ra thành "từ mai trở đi không ai xem gì",
     và ô follower chốt thì vớ phải dòng tương lai.

     Cùng họ với lỗi dòng follower TikTok đóng dấu ngày 30/9 — chặn ở chỗ gộp
     dòng ngày là chặn được cho cả bốn nền tảng, thay vì vá từng chỗ. */
  const src = require('fs').readFileSync(require.resolve('../sync/index'), 'utf8');
  assert.ok(/const homNay = store\.homNay\(\)/.test(src), 'phải lấy mốc hôm nay');
  assert.ok(/row\.date\)\.slice\(0, 10\) > homNay/.test(src),
    'phải bỏ dòng có ngày lớn hơn hôm nay');
  assert.ok(/soTuongLai/.test(src), 'và phải đếm để nói ra, không bỏ im lặng');
});

t('lịch chạy đếm theo LẦN CHẠY CUỐI, không theo lúc khởi động', () => {
  /* Lỗi thật: setInterval 6 tiếng đặt từ lúc process lên, nên mỗi lần deploy là
     đồng hồ về 0. Hôm deploy hơn chục lần thì lịch không bao giờ tới hạn — 24
     tiếng liền không có lượt đồng bộ nào, mà nhìn app vẫn thấy mọi thứ xanh.
     Render ngủ giữa chừng cũng cho ra đúng triệu chứng ấy. */
  const src = require('fs').readFileSync(require.resolve('../server'), 'utf8');
  assert.ok(/async function lanDongBoCuoi/.test(src),
    'phải đọc được lần đồng bộ cuối từ Nhật ký');
  assert.ok(/Date\.now\(\) - LICH\.lanCuoi < ms/.test(src),
    'mỗi nhịp phải so với lần chạy cuối, không phải đếm ngược từ khởi động');
});

t('lấy bản lifetime khi Meta trả một metric hai lần', () => {
  /* Lỗi thật, làm mất gần hết lượt xem bài Facebook. Khi xin nhiều metric một
     lượt, Meta trả CÙNG một metric hai lần — period `lifetime` rồi period `day`.
     Gán thẳng theo tên thì bản `day` đè bản `lifetime`, nên một bài 1.948.242
     lượt xem trọn đời vào Base thành 1. Tổng lượt xem bài Facebook từ 30.515.492
     tụt xuống 26.942, mà bảng vẫn đầy tương tác — nhìn là thấy vô lý nhưng phải
     mở phản hồi thô mới biết vì sao.

     Mô phỏng đúng vòng gom trong baiCuaPage(). */
  const goi = (ds) => {
    const ins = {};
    ds.forEach((m) => {
      const v = Number((m.values[0] || {}).value) || 0;
      if (m.period === 'lifetime' || !(m.name in ins)) ins[m.name] = v;
    });
    return ins;
  };
  const traVe = [
    { name: 'post_video_views_organic', period: 'lifetime', values: [{ value: 1948242 }] },
    { name: 'post_clicks', period: 'lifetime', values: [{ value: 42269 }] },
    { name: 'post_video_views_organic', period: 'day', values: [{ value: 1 }] },
  ];
  assert.strictEqual(goi(traVe).post_video_views_organic, 1948242,
    'bản day KHÔNG được đè bản lifetime');
  assert.strictEqual(goi(traVe).post_clicks, 42269);

  /* Thứ tự ngược lại cũng phải ra đúng — không được dựa vào việc lifetime đến trước. */
  assert.strictEqual(goi(traVe.slice().reverse()).post_video_views_organic, 1948242);

  /* Metric chỉ có bản day thì vẫn lấy, thà có số còn hơn bỏ trống. */
  assert.strictEqual(goi([{ name: 'x', period: 'day', values: [{ value: 7 }] }]).x, 7);
});

t('phân loại bài theo status_type THẬT của Graph', () => {
  /* Graph trả `added_video`, `added_photos` — không phải `video`, `photo`. Bảng
     cũ tra bằng tên rút gọn nên không khớp gì, và 563 bài của trang (trong đó có
     bài 1,9 triệu lượt xem) đều bị xếp là "Bài viết". */
  const src = require('fs').readFileSync(require.resolve('../sync/facebook'), 'utf8');
  const m = /const LOAI_BAI = {([^}]*)}/.exec(src);
  assert.ok(m, 'không tìm thấy LOAI_BAI');
  ['added_video', 'added_photos'].forEach((k) => assert.ok(m[1].includes(k),
    'thiếu status_type ' + k));
});

t('Facebook có ánh xạ tiếp cận, dưới CẢ HAI tên Meta dùng', () => {
  /* Xin bằng tên có _v2 nhưng Meta trả về dưới tên không có _v2. Thiếu một
     trong hai dòng ánh xạ thì request vẫn thành công, số vẫn về, mà cột tiếp cận
     trắng trơn — không có gì báo cho biết. */
  const fb = require('../sync/facebook');
  assert.ok(fb.METRIC_NGAY.includes('page_posts_impressions_organic_unique_v2'),
    'phải XIN bằng tên có _v2');
  assert.strictEqual(fb.COT.page_posts_impressions_organic_unique_v2, 'reach');
  assert.strictEqual(fb.COT.page_posts_impressions_organic_unique, 'reach',
    'Meta TRẢ VỀ dưới tên không có _v2');
});

t('tiếp cận và hiển thị là hai cột khác nhau', () => {
  const fb = require('../sync/facebook');
  assert.strictEqual(fb.COT.page_posts_impressions_organic, 'impressions');
  assert.notStrictEqual(fb.COT.page_posts_impressions_organic,
    fb.COT.page_posts_impressions_organic_unique);
});

t('không ghi field id undefined xuống Base', () => {
  /* Lỗi thật, mất một tuần dữ liệu bài mà không ai thấy. Khi thêm hai cột
     viewsOrganic/watchTime vào bảng NGÀY, phép thay thế đụng cả ba chỗ dựng dòng
     — ngày, bài và LIVE. Hai bảng sau không có hai cột đó, nên f.viewsOrganic là
     undefined; Lark nhận khoá "undefined" và trả not_found cho CẢ lượt ghi. Bài
     kẹt ở 08/09 suốt một tuần, mà dòng ngày vẫn về đều nên màn hình trông vẫn
     bình thường.

     Phép thử này quét mọi field id mà sync/index.js ghi, đối chiếu với bảng
     tương ứng trong config. */
  const fs = require('fs');
  const cfg = require('../config');
  const src = fs.readFileSync(require.resolve('../sync/index'), 'utf8');
  /* Mỗi hàm dựng dòng khai `const f = store.T.<bảng>.f` rồi dùng [f.x] bên dưới. */
  const khoi = src.split(/const f = store\.T\./).slice(1);
  let daSoat = 0;
  khoi.forEach((k) => {
    const bang = (/^(\w+)\.f/.exec(k) || [])[1];
    if (!bang || !cfg.tables[bang]) return;
    const het = k.indexOf('\n}');
    const than = het > 0 ? k.slice(0, het) : k;
    (than.match(/\[f\.(\w+)\]/g) || []).forEach((m) => {
      const ten = m.slice(3, -1);
      daSoat++;
      assert.ok(cfg.tables[bang].f[ten],
        'sync/index.js ghi [f.' + ten + '] vào bảng "' + bang + '" nhưng config không khai — '
        + 'Lark sẽ nhận field id undefined và từ chối cả lượt ghi');
    });
  });
  assert.ok(daSoat > 30, 'phải soát được kha khá field, mới soát ' + daSoat);
});

t('mọi adapter dựng dòng trống đủ khoá, không để cột mới thành NaN', () => {
  /* row[cot] += so trên một khoá chưa khai là undefined + số = NaN, và NaN ghi
     xuống Base thì ô trống — nhìn y như "hôm đó không có số". Thêm cột mà quên
     một adapter là hỏng lặng lẽ đúng kiểu đó. */
  const fs = require('fs');
  ['facebook', 'instagram', 'tiktok', 'zalo', 'index'].forEach((ten) => {
    const src = fs.readFileSync(require.resolve('../sync/' + ten), 'utf8');
    ['viewsOrganic', 'watchTime'].forEach((k) => assert.ok(src.includes(k + ': 0'),
      'sync/' + ten + '.js thiếu ' + k + ' trong dòng trống'));
  });
});

t('cột mới đi hết một vòng: đọc từ Base, cộng, ghi lại', () => {
  const fs = require('fs');
  const cfg = require('../config');
  ['viewsOrganic', 'watchTime'].forEach((k) => {
    assert.ok(cfg.tables.daily.f[k], 'config thiếu field id cho ' + k);
    assert.ok(fs.readFileSync(require.resolve('../store'), 'utf8').includes('f.' + k),
      'store.js không đọc ' + k);
    assert.ok(fs.readFileSync(require.resolve('../sync/index'), 'utf8').includes('f.' + k),
      'sync/index.js không ghi ' + k);
    assert.ok(M.agg([{ [k]: 5 }, { [k]: 7 }])[k] === 12, 'agg không cộng ' + k);
  });
});

t('Instagram không xin follower_count ngoài tầm 30 ngày', () => {
  /* follower_count chỉ trả 30 ngày gần nhất. Để nó trong danh sách chung thì mọi
     cửa sổ cũ đều lỗi, rồi app kết luận nhầm "API không còn nhận follower_count"
     — đổ cho Meta trong khi lỗi là mình hỏi sai khoảng. */
  const src = require('fs').readFileSync(require.resolve('../sync/instagram'), 'utf8');
  const m = /const CHUOI_TG = (\[[^\]]*\])/.exec(src);
  assert.ok(m, 'không tìm thấy CHUOI_TG');
  assert.ok(!m[1].includes('follower_count'),
    'follower_count phải nằm ở nhóm riêng, không nằm trong danh sách hỏi mọi cửa sổ');
  assert.ok(/CHUOI_TG_GAN = \[[^\]]*follower_count/.test(src));
});

t('lượt hiển thị của Facebook không được đổ vào cột tiếp cận', () => {
  /* v23.0 đã gỡ sạch chỉ số đếm NGƯỜI duy nhất của Page — thử tay 21 tên, chỉ
     page_posts_impressions_organic còn sống, và nó đếm LẦN hiển thị. Đổ nó vào
     "Lượt tiếp cận" thì ô đó đầy lên trông rất thuyết phục và sai. */
  const fb = require('../sync/facebook');
  assert.strictEqual(fb.COT.page_posts_impressions_organic, 'impressions');
  assert.ok(fb.METRIC_NGAY.includes('page_posts_impressions_organic'));
  assert.notStrictEqual(fb.COT.page_posts_impressions_organic, 'reach',
    'chỉ số đếm LẦN hiển thị không được coi là tiếp cận');
});

console.log('\nlink uỷ quyền Zalo');

t('link cấp quyền Zalo mang đúng cặp PKCE', () => {
  /* Zalo v4 bắt buộc PKCE. Nếu code_challenge không phải là sha256 của verifier
     mình giữ lại thì lúc đổi mã Zalo từ chối, mà thông báo lỗi không nói ra
     nguyên nhân — rất khó lần. */
  const crypto = require('crypto');
  const zalo = require('../sync/zalo');
  const r = zalo.linkCapQuyen({ appId: '999' }, 'https://vi.du/zalo-callback');
  const u = new URL(r.link);
  assert.strictEqual(u.origin + u.pathname, 'https://oauth.zaloapp.com/v4/oa/permission');
  assert.strictEqual(u.searchParams.get('app_id'), '999');
  assert.strictEqual(u.searchParams.get('redirect_uri'), 'https://vi.du/zalo-callback');
  assert.strictEqual(u.searchParams.get('code_challenge_method'), 'S256');
  assert.strictEqual(u.searchParams.get('code_challenge'),
    crypto.createHash('sha256').update(r.codeVerifier).digest('base64url'));
  assert.ok(r.codeVerifier.length >= 43 && r.codeVerifier.length <= 128);
  /* Trang quản trị ứng dụng của Zalo có ô "Code Challenge" riêng và tự dựng link,
     nên phải trả chuỗi này ra ngoài chứ không chỉ nhét vào link. */
  assert.strictEqual(r.codeChallenge, u.searchParams.get('code_challenge'));
});

t('mỗi lần tạo link là một verifier khác', () => {
  const zalo = require('../sync/zalo');
  const a = zalo.linkCapQuyen({ appId: '1' }, 'https://vi.du/cb');
  const b = zalo.linkCapQuyen({ appId: '1' }, 'https://vi.du/cb');
  assert.notStrictEqual(a.codeVerifier, b.codeVerifier);
});

t('thiếu appId hoặc redirect thì nói rõ thiếu gì', () => {
  const zalo = require('../sync/zalo');
  assert.throws(() => zalo.linkCapQuyen({}, 'https://vi.du/cb'), /App ID/);
  assert.throws(() => zalo.linkCapQuyen({ appId: '1' }, ''), /chuyển hướng/);
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
