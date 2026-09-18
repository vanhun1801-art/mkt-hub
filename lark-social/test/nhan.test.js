'use strict';
/* Test thuần Node: `node test/nhan.test.js`. */
const assert = require('assert');
const nhan = require('../nhan');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

const bai = (title, o) => ({ title, views: 0, engagement: 0, ...o });

console.log('\nnhãn — đọc hashtag');

t('hashtag khai trong Base chịu mọi kiểu gõ', () => {
  /* Người khai trong Base sẽ gõ mỗi lúc một kiểu. Bắt họ gõ đúng một khuôn là
     sớm muộn cũng có dòng lặng lẽ không khớp gì cả. */
  assert.deepStrictEqual(nhan.tachThe('#SunsetTown'), ['#sunsettown']);
  assert.deepStrictEqual(nhan.tachThe('SunsetTown'), ['#sunsettown'], 'thiếu dấu # vẫn hiểu');
  assert.deepStrictEqual(nhan.tachThe('#A, #B; #C | #D'), ['#a', '#b', '#c', '#d']);
  assert.deepStrictEqual(nhan.tachThe('  '), []);
});

t('hashtag trong caption đọc được cả chữ có dấu', () => {
  const ds = nhan.theCuaBai('Đi #PhúQuốc với #RootyTrip #phuquoc');
  assert.ok(ds.includes('#phúquốc'));
  assert.ok(ds.includes('#rootytrip'));
  assert.strictEqual(ds.length, 3);
});

t('cùng một thẻ lặp trong caption chỉ tính một lần', () => {
  assert.deepStrictEqual(nhan.theCuaBai('#a #A #a'), ['#a']);
});

console.log('\nnhãn — gắn nhãn');

t('khớp hashtag thì gắn, không khớp thì thôi', () => {
  const ds = nhan.chuanHoaNhan([
    { nhan: 'Sunset Town', hashtag: '#SunsetTown' },
    { nhan: 'Hòn Thơm', hashtag: '#HonThom #captreohonthom' },
  ]);
  assert.deepStrictEqual(nhan.nhanCuaBai(bai('chơi ở #sunsettown'), ds), ['Sunset Town']);
  assert.deepStrictEqual(nhan.nhanCuaBai(bai('#captreohonthom đẹp'), ds), ['Hòn Thơm']);
  assert.deepStrictEqual(nhan.nhanCuaBai(bai('không có thẻ nào'), ds), []);
});

t('CHỈ đọc hashtag, không đoán theo chữ trong caption', () => {
  /* Anh Hùng chốt đo bằng hashtag và sẽ siết quy định. Nếu ở đây lén khớp thêm
     theo từ khoá thì số trong báo cáo sẽ không khớp với thứ đội nội dung gắn,
     và không ai giải thích nổi vì sao. */
  const ds = nhan.chuanHoaNhan([{ nhan: 'VinWonders', hashtag: '#vinwonders' }]);
  assert.deepStrictEqual(nhan.nhanCuaBai(bai('hôm nay đi VinWonders chơi'), ds), [],
    'nhắc tên mà không gắn thẻ thì KHÔNG được tự gắn nhãn');
});

t('một bài mang được nhiều nhãn cùng lúc', () => {
  const ds = nhan.chuanHoaNhan([
    { nhan: 'Sunset Town', hashtag: '#sunsettown' },
    { nhan: 'Tour CB01', hashtag: '#cb01' },
  ]);
  assert.deepStrictEqual(nhan.nhanCuaBai(bai('#sunsettown #cb01'), ds).sort(),
    ['Sunset Town', 'Tour CB01']);
});

t('nhãn tắt hoặc không khai hashtag thì bị bỏ qua', () => {
  const ds = nhan.chuanHoaNhan([
    { nhan: 'Tắt', hashtag: '#x', bat: false },
    { nhan: 'Rỗng', hashtag: '' },
    { nhan: 'Chạy', hashtag: '#y' },
  ]);
  assert.deepStrictEqual(ds.map((x) => x.nhan), ['Chạy']);
});

console.log('\nnhãn — gắn bù cho bài cũ');

t('nhãn gắn bù được tính, nhưng chỉ khi tên có thật trong bảng Nhãn', () => {
  /* Gõ sai một chữ trong Base thì thà không tính còn hơn đẻ ra một nhãn ma chỉ
     tồn tại ở đúng một bài — nó sẽ không bao giờ lên bảng, mà bài thì coi như đã
     có nhãn nên không ai đi gắn lại. */
  const ds = nhan.chuanHoaNhan([{ nhan: 'Sunset Town', hashtag: '#sunsettown' }]);
  assert.deepStrictEqual(nhan.nhanCuaBai(bai('không thẻ', { nhanBu: 'Sunset Town' }), ds),
    ['Sunset Town']);
  assert.deepStrictEqual(nhan.nhanCuaBai(bai('không thẻ', { nhanBu: 'Sunset Twon' }), ds), []);
});

t('gắn bù nhiều nhãn, không trùng với nhãn đã có từ hashtag', () => {
  const ds = nhan.chuanHoaNhan([
    { nhan: 'A', hashtag: '#a' }, { nhan: 'B', hashtag: '#b' }, { nhan: 'C', hashtag: '#c' },
  ]);
  const r = nhan.nhanCuaBai(bai('#a', { nhanBu: 'A, B' }), ds).sort();
  assert.deepStrictEqual(r, ['A', 'B'], 'A chỉ được tính một lần');
});

t('phân biệt bài nhận nhãn nhờ hashtag với bài gắn bù', () => {
  const ds = nhan.chuanHoaNhan([{ nhan: 'A', hashtag: '#a' }]);
  assert.strictEqual(nhan.nguonNhan(bai('#a'), ds), 'hashtag');
  assert.strictEqual(nhan.nguonNhan(bai('không thẻ', { nhanBu: 'A' }), ds), 'gắn bù');
  assert.strictEqual(nhan.nguonNhan(bai('chẳng có gì'), ds), '');
});

t('đếm riêng số bài gắn bù trong mỗi nhãn', () => {
  const ds = nhan.chuanHoaNhan([{ nhan: 'A', hashtag: '#a' }]);
  const r = nhan.gopTheoNhan([
    bai('#a', { views: 10 }), bai('#a', { views: 10 }),
    bai('không thẻ', { views: 10, nhanBu: 'A' }),
  ], ds);
  assert.strictEqual(r[0].soBai, 3);
  assert.strictEqual(r[0].soGanBu, 1);
});

console.log('\nnhãn — gộp số');

t('cộng đúng và tính tỷ lệ tương tác theo từng bài', () => {
  /* Cùng luật với metrics.agg(): mẫu số chọn theo từng dòng rồi mới cộng. Cộng
     trước rồi chọn thì một nhãn có bài Instagram (có tiếp cận) lẫn bài Facebook
     (không có) sẽ ra tỷ lệ hàng nghìn phần trăm. */
  const ds = nhan.chuanHoaNhan([{ nhan: 'N', hashtag: '#n' }]);
  const r = nhan.gopTheoNhan([
    bai('#n', { views: 1000, engagement: 50 }),
    bai('#n', { views: 3000, reach: 2000, engagement: 100 }),
    bai('khác', { views: 9999, engagement: 9999 }),
  ], ds);
  assert.strictEqual(r[0].soBai, 2);
  assert.strictEqual(r[0].views, 4000);
  assert.strictEqual(r[0].engagement, 150);
  assert.strictEqual(r[0].tyLeTuongTac, 150 / 3000, 'mẫu số = 1000 (views) + 2000 (reach)');
});

t('bài không mang nhãn nào đếm được, để biết quy định theo tới đâu', () => {
  const ds = nhan.chuanHoaNhan([{ nhan: 'N', hashtag: '#n' }]);
  const p = [bai('#n'), bai('không thẻ'), bai('#khac')];
  assert.strictEqual(nhan.baiKhongNhan(p, ds).length, 2);
});

console.log('\nnhãn — thiết lập trong app');

t('nhãn không khai hashtag thì không bao giờ vào bảng', () => {
  /* Máy chủ chặn từ lúc lưu, nhưng dòng cũ trong Base có thể trống. Không lọc ở
     đây thì nó đứng trong bảng với 0 bài mãi mãi, và người dùng tưởng đội nội
     dung chưa gắn thẻ chứ không phải mình quên khai. */
  const ds = nhan.chuanHoaNhan([
    { nhan: 'Chưa khai', hashtag: '' },
    { nhan: 'Đã khai', hashtag: '#x' },
  ]);
  assert.deepStrictEqual(ds.map((x) => x.nhan), ['Đã khai']);
});

t('nhóm là chữ tự do, không bó trong danh sách cố định', () => {
  /* Anh Hùng sẽ còn thêm nhóm mới — Sản phẩm, Sự kiện… Bó cứng vào một danh
     sách là mỗi lần thêm nhóm lại phải nhờ sửa code. */
  const ds = nhan.chuanHoaNhan([{ nhan: 'A', hashtag: '#a', nhom: 'Sản phẩm mùa hè' }]);
  assert.strictEqual(ds[0].nhom, 'Sản phẩm mùa hè');
});

t('nhiều nhãn cùng đối tác thì gộp được về một mối', () => {
  const ds = nhan.chuanHoaNhan([
    { nhan: 'VinWonders', hashtag: '#vw', doiTac: 'Vinpearl' },
    { nhan: 'Safari', hashtag: '#sf', doiTac: 'Vinpearl' },
    { nhan: 'Sunset', hashtag: '#st', doiTac: 'Sun Group' },
  ]);
  const r = nhan.gopTheoNhan([bai('#vw', { views: 10 }), bai('#sf', { views: 5 }),
    bai('#st', { views: 3 })], ds);
  const vin = r.filter((x) => x.doiTac === 'Vinpearl');
  assert.strictEqual(vin.length, 2);
  assert.strictEqual(vin.reduce((a, b) => a + b.views, 0), 15);
});

console.log('\nnhãn — xuất CSV');

t('dấu chấm phẩy và BOM, để Excel tiếng Việt mở đúng', () => {
  /* Dấu phẩy + không BOM là mở ra thấy chữ hỏng và mọi cột dồn vào một ô — file
     gửi đối tác mà thế thì hỏng việc. */
  const csv = nhan.csvChoNhan({
    nhan: 'N', doiTac: 'Sun Group', the: ['#n'], soBai: 1,
    views: 10, reach: 0, likes: 1, comments: 0, shares: 0, engagement: 1,
    bai: [{ date: '2026-09-01', platform: 'Facebook', title: 'xin chào', views: 10 }],
  }, { tu: '2026-09-01', den: '2026-09-30' });
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF, 'phải có BOM');
  assert.ok(csv.includes('Ngày đăng;Nền tảng'), 'phải phân tách bằng dấu chấm phẩy');
  assert.ok(csv.includes('\r\n'), 'xuống dòng kiểu Windows');
});

t('ô chứa dấu chấm phẩy hoặc nháy được bọc đúng', () => {
  assert.strictEqual(nhan.dongCsv(['a;b', 'c"d', 'e']), '"a;b";"c""d";e');
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
