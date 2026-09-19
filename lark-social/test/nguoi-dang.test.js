'use strict';
const assert = require('assert');
const N = require('../nguoi-dang');

let dat = 0; let hong = 0;
function t(ten, fn) {
  try { fn(); dat++; console.log('  ✓ ' + ten); } catch (e) {
    hong++; console.log('  ✗ ' + ten); console.log('    ' + e.message);
  }
}

console.log('nguoi-dang — rút ID từ link');

t('ba dạng link thật trong Base đều rút được ID', () => {
  /* Số liệu thật: 1.001 bài /reel/, 558 bài /posts/, 43 bài /videos/. */
  assert.strictEqual(N.idTuLink('https://www.facebook.com/reel/1449888943621106/'), '1449888943621106');
  assert.strictEqual(N.idTuLink('https://www.facebook.com/1510257614463542/videos/1060177736883984'), '1060177736883984');
  assert.strictEqual(N.idTuLink('https://www.facebook.com/1510257614463542/posts/1508465481309422'), '1508465481309422');
});

t('link chia sẻ dạng story_fbid cũng rút được', () => {
  assert.strictEqual(
    N.idTuLink('https://www.facebook.com/permalink.php?story_fbid=1508465481309422&id=1510257614463542'),
    '1508465481309422');
});

t('không nhầm ID Trang thành ID bài', () => {
  /* Link /videos/ có ID Trang đứng trước ID bài. Bắt nhầm cái đầu là ghép
     toàn bộ bài của một Trang vào cùng một người. */
  assert.strictEqual(N.idTuLink('https://www.facebook.com/1510257614463542/videos/1060177736883984'), '1060177736883984');
  assert.strictEqual(N.idTuLink('https://www.facebook.com/rootytrip1/videos/938806172109763'), '938806172109763');
});

t('link rác thì trả rỗng, không đoán bừa', () => {
  ['', null, 'https://www.facebook.com/rootytrip1', 'https://tiktok.com/@x/video/123'].forEach((u) => {
    assert.strictEqual(N.idTuLink(u), '', String(u));
  });
});

console.log('\nnguoi-dang — ghép với bài trong Base');

const BAI = [
  { id: 'r1', key: 'Facebook#a_1', platform: 'Facebook', url: 'https://www.facebook.com/reel/111111111111/', poster: '' },
  { id: 'r2', key: 'Facebook#a_2', platform: 'Facebook', url: 'https://www.facebook.com/page/posts/222222222222', poster: 'Võ Hằng' },
  { id: 'r3', key: 'TikTok#x', platform: 'TikTok', url: 'https://tiktok.com/@x/video/333333333333', poster: '' },
];

t('ghép đúng bài và bỏ qua bài đã đúng người', () => {
  const r = N.ghep([
    { link: 'https://www.facebook.com/reel/111111111111/?mibextid=abc', nguoi: 'Phương Ái' },
    { link: 'https://www.facebook.com/page/posts/222222222222', nguoi: 'Võ Hằng' },
  ], BAI);
  assert.strictEqual(r.capNhat.length, 1);
  assert.strictEqual(r.capNhat[0].id, 'r1');
  assert.strictEqual(r.capNhat[0].nguoi, 'Phương Ái');
});

t('tham số thừa trong link không làm hỏng việc ghép', () => {
  /* Link copy từ Facebook luôn kèm ?mibextid=…&rdid=… Cắt theo chuỗi thì trượt,
     nên phải rút ID chứ không so cả URL. */
  const r = N.ghep([{ link: 'https://www.facebook.com/reel/111111111111/?rdid=zz&share_url=yy', nguoi: 'Lý Thư Bạch' }], BAI);
  assert.strictEqual(r.capNhat.length, 1);
});

t('bài không có trong Base thì báo ra, không im lặng bỏ', () => {
  const r = N.ghep([{ link: 'https://www.facebook.com/reel/999999999999/', nguoi: 'Võ Hằng' }], BAI);
  assert.strictEqual(r.capNhat.length, 0);
  assert.strictEqual(r.khongKhop.length, 1);
});

t('tên lạ thì KHÔNG ghi, và phải báo ra', () => {
  /* Cột trong Base là dạng chọn. Ghi tên ngoài danh sách thì hoặc Lark từ chối,
     hoặc tệ hơn là sinh thêm lựa chọn rác rồi KPI đếm nhầm thành người mới. */
  const r = N.ghep([{ link: 'https://www.facebook.com/reel/111111111111/', nguoi: 'Nguyễn Văn X' }], BAI);
  assert.strictEqual(r.capNhat.length, 0);
  assert.strictEqual(r.tenLa.length, 1);
  assert.strictEqual(r.tenLa[0].nguoi, 'Nguyễn Văn X');
});

t('một bài gửi hai lần trong cùng lượt thì chỉ ghi một', () => {
  const r = N.ghep([
    { link: 'https://www.facebook.com/reel/111111111111/', nguoi: 'Phương Ái' },
    { link: 'https://www.facebook.com/reel/111111111111/', nguoi: 'Phương Ái' },
  ], BAI);
  assert.strictEqual(r.capNhat.length, 1);
});

t('người khác với người đang có thì GHI ĐÈ', () => {
  /* Màn hình Facebook là nguồn thật; cột trong Base có thể do ai đó gán nhầm. */
  const r = N.ghep([{ link: 'https://www.facebook.com/page/posts/222222222222', nguoi: 'Phương Ái' }], BAI);
  assert.strictEqual(r.capNhat.length, 1);
  assert.strictEqual(r.capNhat[0].cu, 'Võ Hằng');
});

t('bảng tra bỏ qua bài không phải Facebook', () => {
  assert.strictEqual(N.banhTra(BAI).has('333333333333'), false);
});

console.log('\n' + dat + ' phép thử đạt' + (hong ? ' — CÓ LỖI' : ''));
if (hong) process.exit(1);
