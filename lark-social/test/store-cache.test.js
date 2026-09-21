'use strict';
/*
 * Test thuần Node: `node test/store-cache.test.js`.
 *
 * Canh đúng một chuyện: GHI XONG ĐỌC LẠI PHẢI THẤY. Bản cũ chia sẻ lời hứa nạp
 * đang chạy dở cho mọi người gọi, nên ai gọi tai() ngay sau khi ghi sẽ nhận về
 * dữ liệu đọc TRƯỚC lúc ghi — màn hình phân quyền lưu xong, mở lại thấy trống
 * trơn như chưa lưu gì.
 */
const assert = require('assert');

/* Chặn lark trước khi store nạp nó, để không chạm vào Base thật. */
const lark = require('../lark');
let doc = [];          // dữ liệu "trên Base" lúc này
let dangDoc = 0;       // số lần thật sự gọi xuống Base
let nhaSau = 0;        // giả lập độ trễ mạng (ms)
lark.listAll = async () => {
  dangDoc++;
  const chup = doc.slice();          // chụp lúc BẮT ĐẦU đọc, như mạng thật
  if (nhaSau) await new Promise((r) => setTimeout(r, nhaSau));
  return chup;
};

const store = require('../store');
const T = store.T;
const f = T.channel.f;
const kenh = (id, viewers) => ({ id, c: { [f.name]: id, [f.viewers]: viewers } });

let so = 0;
const cho = [];
const t = (ten, fn) => cho.push([ten, fn]);

t('ghi xong đọc lại thấy ngay, dù lần nạp cũ đang chạy dở', async () => {
  doc = [kenh('rec1', '')];
  store.xoaCache();
  nhaSau = 40;
  const cu = store.tai(true);          // lần nạp chậm, bắt đầu TRƯỚC khi ghi
  await new Promise((r) => setTimeout(r, 5));

  doc = [kenh('rec1', 'a@x.com')];     // "ghi"
  store.xoaCache();

  const moi = await store.tai();
  assert.strictEqual(moi.channels[0].viewers, 'a@x.com',
    'bám vào lần nạp cũ là đọc lại thấy như chưa ghi');
  await cu;
});

t('bản cũ về sau cũng không được đè lên cache', async () => {
  doc = [kenh('rec1', '')];
  store.xoaCache();
  nhaSau = 60;
  const cu = store.tai(true);
  await new Promise((r) => setTimeout(r, 5));

  doc = [kenh('rec1', 'b@x.com')];
  store.xoaCache();
  nhaSau = 0;
  await store.tai();
  await cu;                             // lần nạp cũ giờ mới xong
  const lai = await store.tai();
  assert.strictEqual(lai.channels[0].viewers, 'b@x.com',
    'lần nạp cũ về muộn không được ghi đè bản mới');
});

t('không ghi gì thì nhiều lời gọi cùng lúc vẫn chỉ đọc Base một lần', async () => {
  doc = [kenh('rec1', 'c@x.com')];
  store.xoaCache();
  nhaSau = 30;
  dangDoc = 0;
  const [a, b, c] = await Promise.all([store.tai(true), store.tai(), store.tai()]);
  /* Một lần nạp = bốn lượt đọc bảng (Kênh, Ngày, Bài, Live). Ba lời gọi mà
   * thành mười hai là mỗi người tự đi đọc một lượt. */
  assert.strictEqual(dangDoc, 4, 'gộp chung một lần nạp');
  assert.strictEqual(a.channels[0].viewers, 'c@x.com');
  assert.strictEqual(b, a);
  assert.strictEqual(c, a);
  nhaSau = 0;
});

t('taiKenh chỉ đọc bảng Kênh, không kéo theo bài đăng', async () => {
  doc = [kenh('rec1', 'd@x.com'), kenh('rec2', '')];
  dangDoc = 0;
  const ds = await store.taiKenh();
  assert.strictEqual(dangDoc, 1, 'đúng một bảng — tai() phải đọc bốn');
  assert.deepStrictEqual(ds.map((k) => k.id), ['rec1', 'rec2']);
  assert.strictEqual(ds[0].viewers, 'd@x.com');
});

(async () => {
  console.log('\nstore — cache và lần ghi');
  for (const [ten, fn] of cho) {
    try { await fn(); so++; console.log('  ✓ ' + ten); }
    catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
  }
  console.log('\n' + so + '/' + cho.length + ' đạt\n');
})();
