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

const bai = (id, title, poster, nenTang, kenh) => ({
  id, platform: nenTang || 'Facebook', title, url: '', poster: poster || '',
  channel: kenh || '', channelExtId: kenh || '',
});
const baiTT = (id, title, kenh, poster) => bai(id, title, poster, 'TikTok', kenh);
const dsCho = () => (bang[TP.id] || []).map((r) => ({
  van: r.c[f.van], nguoi: r.c[f.nguoi], soLan: r.c[f.soLan], trangThai: r.c[f.trangThai],
  nenTang: r.c[f.nenTang], kenh: r.c[f.kenh],
}));

let so = 0;
const cases = [];
const t = (ten, fn) => cases.push([ten, fn]);

t('cất được vào hàng chờ thì tiện ích KHÔNG giữ lại — nếu không, xoá dòng là mọc lại', () => {
  assert.deepStrictEqual(cho.viTriPhaiGiu([0, 2, 5], { them: 3, capNhat: 0 }), []);
});

t('cất HỎNG thì tiện ích phải giữ, không thì mất bài lúc Base trục trặc', () => {
  assert.deepStrictEqual(cho.viTriPhaiGiu([0, 2, 5], { loi: 'Lark 503' }), [0, 2, 5]);
});

t('không có kết quả cất (lượt cũ, máy chủ chưa cập nhật) thì coi như đã cất', () => {
  assert.deepStrictEqual(cho.viTriPhaiGiu([1], null), []);
  assert.deepStrictEqual(cho.viTriPhaiGiu(null, { them: 0 }), []);
});

t('xoá dòng trên Base rồi mà tiện ích gửi lại thì nó MỌC LẠI — lý do phải ngừng gửi', async () => {
  /* Phép thử này ghi lại đúng cái anh Hùng gặp: xoá dòng thử nghiệm mà nó cứ
   * hiện. luu() nhận diện theo khoá (vân, người, nền tảng); xoá dòng là mất
   * khoá, nên lượt gửi sau tạo dòng mới. Bản thân luu() không sai — sai là ở
   * chỗ để tiện ích gửi lại mãi. Giữ phép thử để ai định bật lại vòng gửi lại
   * thì thấy ngay hậu quả. */
  bang = {};
  await cho.luu([{ nguoi: AI, van: 'Bài thử nghiệm xoá rồi mọc lại nhé', nenTang: 'Facebook' }]);
  assert.strictEqual(dsCho().length, 1);

  bang[TP.id] = [];                       // anh Hùng xoá dòng trên Base
  await cho.luu([{ nguoi: AI, van: 'Bài thử nghiệm xoá rồi mọc lại nhé', nenTang: 'Facebook' }]);
  assert.strictEqual(dsCho().length, 1);  // …và nó mọc lại
  assert.strictEqual(dsCho()[0].soLan, 1); // dòng mới tinh, đếm lại từ đầu
});

t('giờ ghi vào bảng là giờ Việt Nam, không phải UTC cũng không phải giờ Base', async () => {
  bang = {};
  await cho.luu([{ nguoi: AI, van: 'Một nội dung đủ dài để không bị bỏ qua' }]);
  const luc = bang[TP.id][0].c[f.batLuc];
  /* Ba cột giờ ở bảng này là ô VĂN BẢN — Lark không vẽ lại theo múi giờ nào cả,
     ghi sao hiện vậy. Mà người đọc bảng này ngồi ở Việt Nam. */
  assert.ok(/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(luc),
    'dạng "YYYY-MM-DD HH:mm:ss", không có T và không có Z: ' + luc);
  const lech = Date.parse(luc.replace(' ', 'T') + 'Z') - Date.now();
  assert.ok(Math.abs(lech - 7 * 3600000) < 60000,
    'phải là +07:00 — lệch đang là ' + (lech / 3600000).toFixed(2) + ' giờ');
  assert.strictEqual(bang[TP.id][0].c[f.thuCuoi], luc, 'hai cột giờ phải cùng một dạng');
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
  bang[TP.id][0].c[f.batLuc] =
    new Date(Date.now() - (cho.HAN_NGAY + 1) * 86400000 + 7 * 3600000)
      .toISOString().slice(0, 19).replace('T', ' ');
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


t('TikTok: bắt ở TikTok Studio rồi đồng bộ xong thì tự ghi', async () => {
  bang = {};
  const van = 'Vị thế thật sự của Phú Quốc trên bản đồ du lịch quốc tế #1';
  await cho.luu([{ nguoi: AI, van, nenTang: 'TikTok', kenh: 'rootytrip' }]);
  assert.strictEqual(dsCho()[0].nenTang, 'TikTok');
  const k = await cho.khopLai([baiTT('recTT', van, 'rootytrip')],
    [{ name: 'Rooty Trip Phú Quốc', handle: 'rootytrip', extId: 'rootytrip' }]);
  assert.strictEqual(k.ghi, 1);
  assert.strictEqual(bang[cfg.tables.post.id][0].c[fp.poster], AI);
});

t('không lẫn nền tảng: mục TikTok không ăn vào bài Facebook cùng caption', async () => {
  bang = {};
  const van = 'Cùng một nội dung đăng lên cả hai nền tảng một lúc';
  await cho.luu([{ nguoi: AI, van, nenTang: 'TikTok' }]);
  const k = await cho.khopLai([bai('recFB', van)]);       // chỉ có bài Facebook
  assert.strictEqual(k.ghi, 0, 'bài Facebook không phải của mục TikTok');
  assert.strictEqual(dsCho().length, 1, 'vẫn nằm chờ bài TikTok của nó');
});

t('cùng một clip lên nhiều kênh: gợi ý kênh gỡ được thế bí', async () => {
  const van = 'Một clip đăng lên hai kênh, caption giống hệt nhau luôn';
  const kenhDS = [
    { name: 'Rooty Trip Phú Quốc', handle: 'rootytrip', extId: 'k1' },
    { name: 'Vi Vu Phú Quốc', handle: 'vivupq', extId: 'k2' },
  ];
  const posts = () => [baiTT('recA', van, 'k1'), baiTT('recB', van, 'k2')];

  /* Không có gợi ý kênh thì hai bài giống hệt nhau — phải bỏ qua, không đoán. */
  bang = {};
  await cho.luu([{ nguoi: AI, van, nenTang: 'TikTok' }]);
  assert.strictEqual((await cho.khopLai(posts(), kenhDS)).ghi, 0);

  /* Có gợi ý thì chỉ còn một ứng viên. */
  bang = {};
  await cho.luu([{ nguoi: AI, van, nenTang: 'TikTok', kenh: '@vivupq' }]);
  const k = await cho.khopLai(posts(), kenhDS);
  assert.strictEqual(k.ghi, 1);
  const ghi = bang[cfg.tables.post.id];
  assert.strictEqual(ghi.length, 1);
  assert.strictEqual(ghi[0].id, 'recB', 'phải là bài của kênh vivupq');
});

t('gợi ý kênh lạ thì coi như không có, đừng loại sạch', async () => {
  bang = {};
  const van = 'Kênh này chưa từng khai trong bảng Kênh bao giờ cả';
  await cho.luu([{ nguoi: AI, van, nenTang: 'TikTok', kenh: '@kenh-la-hoac-vua-doi-ten' }]);
  const k = await cho.khopLai([baiTT('recC', van, 'k1')],
    [{ name: 'Rooty Trip Phú Quốc', handle: 'rootytrip', extId: 'k1' }]);
  assert.strictEqual(k.ghi, 1, 'thà khớp rộng còn hơn trượt vì một chuỗi lạ');
});

t('dòng cũ chưa có ô Nền tảng thì thử CẢ HAI, không đóng đinh là Facebook', async () => {
  /* Đã làm hỏng một bài thật: bản máy chủ chạy trước khi có TikTok ghi mọi mục
     với ô Nền tảng trống. Bài "Lại bảo không hời đi..." Phương Ái đăng lên
     TikTok lúc 16:40, mục của nó bị hiểu là Facebook nên đi tìm trong kho bài
     Facebook — thử 39 lần, không lần nào ra. */
  const van = 'Lại bảo không hời đi... Hệ đổi chỗ ngủ thì vẫn vậy thôi';

  bang = {};
  await cho.luu([{ nguoi: AI, van }]);                  // không khai nền tảng
  assert.strictEqual(bang[TP.id][0].c[f.nenTang], '', 'không biết thì để trống');
  let k = await cho.khopLai([baiTT('recTT', van, 'k1')]);
  assert.strictEqual(k.ghi, 1, 'bài nằm ở TikTok thì vẫn phải tìm ra');

  /* Và vẫn khớp được bài Facebook như cũ. */
  bang = {};
  await cho.luu([{ nguoi: AI, van }]);
  k = await cho.khopLai([bai('recFB', van)]);
  assert.strictEqual(k.ghi, 1);

  /* Hai nền tảng cùng có bài giống hệt: không biết mục này của bài nào — thà
     để chờ còn hơn gán bừa cho một bên. */
  bang = {};
  await cho.luu([{ nguoi: AI, van }]);
  k = await cho.khopLai([bai('recFB', van), baiTT('recTT', van, 'k1')]);
  assert.strictEqual(k.ghi, 0, 'hai bên cùng ra thì không đoán');
  assert.strictEqual(dsCho().length, 1, 'và phải nằm lại chờ');
});

(async () => {
  console.log('\nhàng chờ người đăng');
  for (const [ten, fn] of cases) {
    try { await fn(); so++; console.log('  ✓ ' + ten); }
    catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
  }
  console.log('\n' + so + '/' + cases.length + ' đạt\n');
})();
