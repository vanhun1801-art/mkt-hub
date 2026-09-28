'use strict';
/*
 * Test thuần Node: `node test/live-ngay.test.js`.
 *
 * TikTok không mở API cho LIVE, nên số LIVE chỉ về được bằng bản xuất của LIVE
 * Center. Đọc sai ở đây thì không có đường nào khác để đối chiếu — mà kiểu sai
 * nguy nhất không phải là nổ, là đọc ra một bảng trông vẫn bình thường.
 *
 * Đã gặp thật: bộ đọc cũ (bang-dan.js, dành cho bảng PHIÊN) vớ phải tệp theo
 * ngày thì ra 12 dòng chỉ có mỗi "lượt xem" và MẤT SẠCH cột ngày.
 */
const assert = require('assert');
const zlib = require('zlib');
const LN = require('../live-ngay');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

const csv = (dong) => Buffer.from('﻿' + dong.map((r) => r.map((c) => '"' + c + '"').join(',')).join('\n'), 'utf8');
const NGAY = (d) => 'Sat Aug ' + String(d).padStart(2, '0') + ' 2026 07:00:00 GMT+0700 (Indochina Time)';

/** Gói một buffer thành ZIP thật (store, không nén) để thử đúng đường người dùng đi. */
function zipHoa(ten, than) {
  const t8 = Buffer.from(ten, 'utf8');
  const crc = zlib.crc32 ? zlib.crc32(than) : (() => {
    let c = ~0;
    for (let i = 0; i < than.length; i += 1) {
      c ^= than[i];
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
  })();
  const loc = Buffer.alloc(30);
  loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0, 8);
  loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(than.length, 18); loc.writeUInt32LE(than.length, 22);
  loc.writeUInt16LE(t8.length, 26);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0, 10);
  cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(than.length, 20); cen.writeUInt32LE(than.length, 24);
  cen.writeUInt16LE(t8.length, 28);
  const offCen = loc.length + t8.length + than.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cen.length + t8.length, 12); eocd.writeUInt32LE(offCen, 16);
  return Buffer.concat([loc, t8, than, cen, t8, eocd]);
}

console.log('\nLIVE theo ngày — bản xuất TikTok LIVE Center');

t('đọc được tệp Viewership, giữ đúng ngày', () => {
  const b = csv([
    ['Date', 'Views', 'Unique viewers', 'Active viewers', 'Average watch duration',
      'Peak concurrent viewers', 'Average concurrent viewers'],
    [NGAY(6), '29444', '25670', '647', '26', '902', '530'],
  ]);
  const r = LN.docMot(b, 'x_rootytrip.official_Viewership.csv');
  assert.strictEqual(r.loai, 'Viewership');
  assert.strictEqual(r.ds.length, 1);
  /* Ngày là thứ bộ đọc cũ đánh rơi — không có nó thì số rơi vào hư không mà
     bảng vẫn trông bình thường. */
  assert.strictEqual(r.ds[0].ngay, '2026-08-06');
  assert.strictEqual(r.ds[0].luotXem, 29444);
  assert.strictEqual(r.ds[0].dinhDongThoi, 902);
});

t('ngày lấy theo GIỜ VIỆT NAM, không theo UTC', () => {
  /* "07:00:00 GMT+0700" là 00:00 UTC cùng ngày, nhưng bản xuất khác giờ thì lệch
     sang hôm trước. Cắt thẳng từ chuỗi nên không phụ thuộc máy chạy ở đâu. */
  assert.strictEqual(LN.docNgay('Sat Aug 01 2026 07:00:00 GMT+0700 (Indochina Time)'), '2026-08-01');
  assert.strictEqual(LN.docNgay('Mon Dec 31 2026 00:30:00 GMT+0700 (Indochina Time)'), '2026-12-31');
  assert.strictEqual(LN.docNgay('2026-08-06'), '2026-08-06');
  assert.strictEqual(LN.docNgay('6/8/2026'), '2026-08-06', 'dd/mm/yyyy');
  assert.strictEqual(LN.docNgay('không phải ngày'), '');
});

t('nhận cột theo TÊN, không theo thứ tự', () => {
  /* LIVE Center đổi thứ tự cột giữa các bản xuất. Đọc theo thứ tự thì số vào
     sai ô và bảng vẫn trông bình thường — kiểu sai tệ nhất. */
  const b = csv([
    ['Likes', 'Date', 'Shares', 'New followers'],
    ['5118', NGAY(18), '41', '28'],
  ]);
  const r = LN.docMot(b, 'x_Engagement.csv');
  assert.strictEqual(r.ds[0].thich, 5118);
  assert.strictEqual(r.ds[0].chiaSe, 41);
  assert.strictEqual(r.ds[0].followerMoi, 28);
  assert.strictEqual(r.ds[0].ngay, '2026-08-18');
});

t('đọc được ZIP — đúng thứ người dùng tải về', () => {
  const trong = csv([['Date', 'Diamonds', 'USD'], [NGAY(6), '80', '32']]);
  const z = zipHoa('LIVE_x_rootytrip.official_Rewards.csv', trong);
  const r = LN.docMot(z, 'LIVE_x_rootytrip.official_Rewards.zip');
  assert.strictEqual(r.loai, 'Rewards');
  assert.strictEqual(r.ds[0].kimCuong, 80);
  assert.strictEqual(r.ds[0].usd, 32);
});

t('tệp lạ thì trả rỗng, không đoán bừa', () => {
  const b = csv([['Tên', 'Giá'], ['Tour A', '100']]);
  assert.strictEqual(LN.docMot(b, 'gi-do.csv').ds.length, 0);
  assert.strictEqual(LN.docMot(csv([['Date']]), 'chi-co-tieu-de.csv').ds.length, 0);
});

t('gộp bốn tệp về một dòng mỗi ngày', () => {
  const v = LN.docMot(csv([['Date', 'Views'], [NGAY(6), '29444']]), 'a_Viewership.csv');
  const a = LN.docMot(csv([['Date', 'LIVE duration', 'Total LIVE streams'], [NGAY(6), '5482', '2']]), 'a_Activity.csv');
  const e = LN.docMot(csv([['Date', 'Likes'], [NGAY(6), '18946']]), 'a_Engagement.csv');
  const w = LN.docMot(csv([['Date', 'Diamonds', 'USD'], [NGAY(6), '80', '32']]), 'a_Rewards.csv');
  const g = LN.gop([v, a, e, w]);
  assert.strictEqual(g.ds.length, 1, 'bốn tệp cùng một ngày thì ra MỘT dòng');
  assert.deepStrictEqual(g.loai.sort(), ['Activity', 'Engagement', 'Rewards', 'Viewership']);
  const r = g.ds[0];
  assert.strictEqual(r.luotXem, 29444);
  assert.strictEqual(r.soPhien, 2);
  assert.strictEqual(r.thich, 18946);
  assert.strictEqual(r.usd, 32);
});

t('ngày không LIVE thì bỏ, không ghi dòng rỗng vào Base', () => {
  /* Bản xuất trải đủ 31 ngày của tháng. Trên tệp thật: 31 ngày, 12 ngày có số. */
  const b = csv([
    ['Date', 'Views'],
    [NGAY(1), '0'], [NGAY(2), '0'], [NGAY(6), '29444'],
  ]);
  const g = LN.gop([LN.docMot(b, 'a_Viewership.csv')]);
  assert.strictEqual(g.ds.length, 1);
  assert.strictEqual(g.boQuaNgayTrong, 2);
});

t('đoán kênh từ tên tệp của LIVE Center', () => {
  assert.strictEqual(
    LN.handleTuTen('LIVE_58550-10-15_58632-12-04_rootytrip.official_Viewership.zip'),
    'rootytrip.official');
  /* Tên tệp còn hai cụm số phía trước — không được nuốt cả chúng vào handle. */
  assert.strictEqual(LN.handleTuTen('LIVE_1_2_abc.def_Rewards.csv'), 'abc.def');
  /* Handle CÓ gạch dưới thì chỉ lấy được mẩu cuối, không phải handle thật. Mẩu
     đó không khớp kênh nào trong bảng Kênh nên app quay ra hỏi người dùng chọn.
     Hụt thì an toàn; cái phải tránh là khớp NHẦM sang kênh khác. */
  assert.strictEqual(LN.handleTuTen('LIVE_1_2_co_gach_duoi_Rewards.csv'), 'duoi');
  /* Tệp không phải của LIVE Center thì trả rỗng, không bịa ra kênh nào. */
  assert.strictEqual(LN.handleTuTen('bao-cao-thang-8.zip'), '');
  assert.strictEqual(LN.handleTuTen(''), '');
});

t('số có dấu phẩy ngăn nghìn vẫn đọc đúng', () => {
  const b = csv([['Date', 'Views'], [NGAY(6), '29,444']]);
  assert.strictEqual(LN.docMot(b, 'a_Viewership.csv').ds[0].luotXem, 29444);
});

t('ô có dấu phẩy bên trong nháy kép không làm lệch cột', () => {
  assert.deepStrictEqual(LN.tachDong('"a,b","c"'), ['a,b', 'c']);
  assert.deepStrictEqual(LN.tachDong('"x""y","z"'), ['x"y', 'z']);
});

console.log('\n' + so + ' phép thử đạt\n');
