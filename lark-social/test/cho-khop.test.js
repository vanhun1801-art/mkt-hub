'use strict';
/*
 * Test thuần Node: `node test/cho-khop.test.js`.
 *
 * Canh cái đã mất một bài thật: tiện ích bắt tên lúc 10:24, bài hẹn giờ lên
 * sóng 12:01, mà hàng chờ chỉ nằm trong trình duyệt và ngừng thử lúc 11:05.
 * Từ nay hàng chờ nằm ở máy chủ, nên phép thử ở đây dựng đúng trình tự đó:
 * bắt tên KHI CHƯA CÓ BÀI → đồng bộ kéo bài về → khớp lại phải ra tên.
 */
const assert = require('assert');

/* Chặn lark trước khi các module nạp nó — không chạm Base thật. */
const lark = require('../lark');
const cfg = require('../config');
const TP = cfg.tables.pending;
const f = TP.f;
const fp = cfg.tables.post.f;

let bang = {};            // tableId -> [{id, c}]
let dem = 0;
lark.listAll = async (t) => (bang[t] || []).map((r) => ({ id: r.id, c: { ...r.c } }));
lark.createMany = async (t, rows) => {
  bang[t] = bang[t] || [];
  return rows.map((r) => { const id = 'rec' + (++dem); bang[t].push({ id, c: { ...r } }); return id; });
};
lark.updateMany = async (t, map) => {
  bang[t] = bang[t] || [];
  Object.entries(map).forEach(([id, fields]) => {
    const r = bang[t].find((x) => x.id === id);
    if (r) Object.assign(r.c, fields);
    else bang[t].push({ id, c: { ...fields } });
  });
  return Object.keys(map).length;
};
lark.deleteRecords = async (t, ids) => {
  bang[t] = (bang[t] || []).filter((r) => !ids.includes(r.id));
};

const cho = require('../cho-khop');
const nguoiDang = require('../nguoi-dang');
const AI = nguoiDang.NGUOI_DANG[1] || 'Lý Thư Bạch';

const bai = (id, title, poster) => ({
  id, platform: 'Facebook', title, url: '', poster: poster || '',
});
const dsCho = () => (bang[TP.id] || []).map((r) => ({
  van: r.c[f.van], nguoi: r.c[f.nguoi], soLan: r.c[f.soLan], trangThai: r.c[f.trangThai],
}));

let so = 0;
const cases = [];
const t = (ten, fn) => cases.push([ten, fn]);

t('giờ ghi vào bảng là giờ Base, không phải UTC', async () => {
  bang = {};
  await cho.luu([{ nguoi: AI, van: 'Một nội dung đủ dài để không bị bỏ qua' }]);
  const luc = bang[TP.id][0].c[f.batLuc];
  /* Bảng này người ta mở thẳng Lark ra đọc, không qua giao diện nào. */
  assert.match(luc, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'dạng "YYYY-MM-DD HH:mm:ss"');
  const lech = Math.abs(Date.parse(luc.replace(' ', 'T') + 'Z')
    - (Date.now() + require('../config').tzOffsetHours * 3600000));
  assert.ok(lech < 60000, 'lệch múi giờ: ' + luc);
});

t('bài hẹn giờ: bắt tên lúc chưa có bài, đồng bộ xong thì tự ghi', async () => {
  bang = {};
  const van = 'Thử nghiệm không có ảnh xem thế nào extention';
  await cho.luu([{ nguoi: AI, van }]);
  assert.strictEqual(dsCho().length, 1, 'phải giữ lại ở máy chủ');

  /* Chưa có bài trong Base — khớp lại không được gì, nhưng KHÔNG mất. */
  let k = await cho.khopLai([]);
  assert.strictEqual(k.ghi, 0);
  assert.strictEqual(dsCho().length, 1, 'chưa khớp được thì phải nằm lại');

  /* Đồng bộ kéo bài về. */
  const posts = [bai('recBai', van)];
  k = await cho.khopLai(posts);
  assert.strictEqual(k.ghi, 1);
  assert.deepStrictEqual(k.ten, [AI]);
  assert.strictEqual(bang[cfg.tables.post.id][0].c[fp.poster], AI);
  assert.strictEqual(dsCho().length, 0, 'ghi xong thì dọn khỏi hàng chờ');
});

t('gửi lại cùng một bài không đẻ thêm dòng', async () => {
  bang = {};
  const van = 'Lại bảo không hời đi... Hệ đổi chỗ ngủ thì vẫn vậy';
  await cho.luu([{ nguoi: AI, van }]);
  await cho.luu([{ nguoi: AI, van }]);
  await cho.luu([{ nguoi: AI, van }, { nguoi: AI, van }]);   // trùng ngay trong một lượt
  assert.strictEqual(dsCho().length, 1, 'tiện ích gửi lại mỗi 5 phút — không được nhân bản');
  assert.strictEqual(dsCho()[0].soLan, 3, 'nhưng phải đếm được đã thử mấy lần');
});

t('tên lạ thì nằm chờ, không ném vào ô chọn của Base', async () => {
  bang = {};
  await cho.luu([{ nguoi: 'Người Chưa Khai', van: 'Một nội dung nào đó đủ dài để khớp' }]);
  const k = await cho.khopLai([bai('recX', 'Một nội dung nào đó đủ dài để khớp')]);
  assert.strictEqual(k.ghi, 0, 'ghi tên ngoài danh sách là Lark từ chối cả lô');
  assert.deepStrictEqual(k.tenLa, ['Người Chưa Khai']);
  assert.strictEqual(dsCho().length, 1, 'giữ lại — khai tên xong là lượt sau ghi được');
});

t('hai mục khớp vào cùng một bài thì không đoán bừa', async () => {
  bang = {};
  const van = 'Cùng một đoạn mở đầu y hệt nhau không phân biệt được';
  await cho.luu([{ nguoi: AI, van }, { nguoi: nguoiDang.NGUOI_DANG[0], van }]);
  assert.strictEqual(dsCho().length, 2);
  const k = await cho.khopLai([bai('recY', van)]);
  assert.strictEqual(k.ghi, 1, 'chỉ một bài được ghi');
  assert.strictEqual(dsCho().length, 1, 'mục còn lại nằm lại chứ không bị xoá theo');
});

t('quá hạn thì ngừng thử nhưng vẫn nhìn thấy được', async () => {
  bang = {};
  await cho.luu([{ nguoi: AI, van: 'Bài này không bao giờ vào Base cả' }]);
  /* Ghi đúng dạng mà luu() ghi: giờ của Base, không có hậu tố múi giờ. Dùng ISO
   * thô ở đây là phép thử tự cho mình một dạng dữ liệu không bao giờ có thật. */
  const store = require('../store');
  bang[TP.id][0].c[f.batLuc] =
    store.gioVeBase(new Date(Date.now() - (cho.HAN_NGAY + 1) * 86400000).toISOString());
  const k = await cho.khopLai([]);
  assert.strictEqual(k.quaHan, 1);
  assert.strictEqual(dsCho().length, 1, 'không xoá — xoá là mất dấu vết đúng loại lỗi cần thấy');
  assert.strictEqual(dsCho()[0].trangThai, 'Quá hạn');
  const k2 = await cho.khopLai([]);
  assert.strictEqual(k2.quaHan, 0, 'đã quá hạn thì lượt sau không xét lại nữa');
});

t('bài đã có đúng tên rồi thì đừng ghi lại, nhưng vẫn dọn hàng chờ', async () => {
  bang = {};
  const van = 'Về nhà rồi vẫn lụy Phú Quốc quá đi mất thôi';
  await cho.luu([{ nguoi: AI, van }]);
  const k = await cho.khopLai([bai('recZ', van, AI)]);
  assert.strictEqual(k.ghi, 0, 'không ghi đè cái đã đúng');
  assert.strictEqual(dsCho().length, 0, 'nhưng việc đã xong thì đừng để nó chờ mãi');
});

t('mục rỗng thì bỏ qua, không đẻ dòng trắng', async () => {
  bang = {};
  await cho.luu([{ nguoi: AI, van: '' }, { nguoi: '', van: 'abc' }, null, undefined]);
  assert.strictEqual(dsCho().length, 0);
});

(async () => {
  console.log('\nhàng chờ người đăng');
  for (const [ten, fn] of cases) {
    try { await fn(); so++; console.log('  ✓ ' + ten); }
    catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
  }
  console.log('\n' + so + '/' + cases.length + ' đạt\n');
})();
