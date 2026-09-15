'use strict';
/* Test thuần Node: `node test/noi-dung.test.js`. */
const assert = require('assert');
const nd = require('../noi-dung');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

console.log('\nnội dung — trung vị');

t('trung vị, không phải trung bình', () => {
  /* Cả lý do tồn tại của module này nằm ở phép thử này. Một bài lên xu hướng
     200.000 view nằm cạnh bốn bài 500 view: trung bình ra 40.400 — con số không
     mô tả bài nào cả. Trung vị ra 500, đúng cái người ta muốn biết. */
  const ds = [500, 500, 500, 500, 200000];
  assert.strictEqual(nd.trungVi(ds), 500);
  const tb = ds.reduce((a, b) => a + b, 0) / ds.length;
  assert.ok(tb > 40000, 'trung bình đúng là bị kéo lệch: ' + tb);
});

t('mảng chẵn lấy giữa hai số', () => {
  assert.strictEqual(nd.trungVi([10, 20, 30, 40]), 25);
});

t('mảng rỗng trả 0, không NaN', () => {
  assert.strictEqual(nd.trungVi([]), 0);
});

console.log('\nnội dung — giờ đăng');

t('giờ đọc theo múi giờ của Base, không theo múi giờ máy chủ', () => {
  /* Render chạy UTC. Dùng new Date().getHours() thì "19:15 giờ Việt" thành 12
     giờ và cả bảng giờ vàng lệch bảy tiếng — nhìn vẫn hợp lý nên không ai nghi. */
  const g = nd.gioThu('2026-09-05T19:15:00.000+08:00', 8);
  assert.strictEqual(g.gio, 19);
  assert.strictEqual(g.thu, 6, '05/09/2026 là thứ Bảy');
});

t('chuỗi UTC thì mới quy đổi sang múi giờ Base', () => {
  const g = nd.gioThu('2026-09-05T12:15:00.000Z', 8);
  assert.strictEqual(g.gio, 20);
});

t('chuỗi hỏng thì trả null, không đoán bừa', () => {
  assert.strictEqual(nd.gioThu('', 8), null);
  assert.strictEqual(nd.gioThu('hôm qua', 8), null);
});

console.log('\nnội dung — ngưỡng dữ liệu');

t('khung giờ mỏng bị đánh dấu chưa đủ để kết luận', () => {
  const bai = (gio, views) => ({ publishedAt: '2026-09-07T' + String(gio).padStart(2, '0') + ':00:00+08:00', views, engagement: 1 });
  const r = nd.gioVang([bai(9, 100), bai(9, 200), ...Array.from({ length: 6 }, () => bai(20, 50))], { toiThieu: 4 });
  const sang = r.o.find((x) => x.khung === 4);
  const toi = r.o.find((x) => x.khung === 10);
  assert.strictEqual(sang.du, false, '2 bài thì chưa đủ');
  assert.strictEqual(toi.du, true, '6 bài thì đủ');
});

t('hashtag dùng dưới 5 bài thì không lên bảng', () => {
  const bai = (cap, views) => ({ title: cap, views, engagement: 1 });
  const ds = [bai('#hiem', 999999)].concat(
    Array.from({ length: 5 }, () => bai('#haydung', 100)));
  const r = nd.hashtag(ds, { toiThieu: 5 });
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].the, '#haydung');
});

t('một thẻ lặp trong cùng caption chỉ tính một bài', () => {
  const ds = Array.from({ length: 5 }, () => ({ title: '#a #a #a', views: 10, engagement: 1 }));
  assert.strictEqual(nd.hashtag(ds, { toiThieu: 5 })[0].soBai, 5);
});

console.log('\nnội dung — cột không đo được');

t('bài không có lượt xem KHÔNG kéo trung vị xuống 0', () => {
  /* Facebook chỉ trả lượt xem cho video; bài chữ không có. Đổ số 0 của bài chữ
     vào mẫu thì bảng hiện "Bài viết — 0 lượt xem" như thể không ai đọc. */
  const ds = [
    { type: 'Bài viết', views: 0, engagement: 40 },
    { type: 'Bài viết', views: 0, engagement: 50 },
    { type: 'Bài viết', views: 700, engagement: 60 },
  ];
  const r = nd.theoNhom(ds, (p) => p.type, { toiThieu: 3 });
  assert.strictEqual(r[0].soBai, 3, 'vẫn đếm đủ 3 bài');
  assert.strictEqual(r[0].soCoXem, 1);
  assert.strictEqual(r[0].xem, 700, 'trung vị chỉ trên bài đo được');
  assert.strictEqual(r[0].tuongTac, 50, 'tương tác thì mọi bài đều có');
});

t('không bài nào đo được lượt xem thì trả null, không trả 0', () => {
  const ds = [
    { type: 'Bài viết', views: 0, engagement: 10 },
    { type: 'Bài viết', views: 0, engagement: 20 },
    { type: 'Bài viết', views: 0, engagement: 30 },
  ];
  const r = nd.theoNhom(ds, (p) => p.type, { toiThieu: 3 });
  assert.strictEqual(r[0].xem, null, 'null = không đo được, khác hẳn 0 = không ai xem');
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
