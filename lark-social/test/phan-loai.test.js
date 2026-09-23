'use strict';
/*
 * Test thuần Node: `node test/phan-loai.test.js`.
 *
 * Luật anh Hùng chốt 23/09/2026: mang thẻ #Tour là Bán hàng, còn lại Tương tác.
 * Hệ số KPI là ×1,0 với ×0,2 — phân loại sai một bài là sai tiền, nên mấy phép
 * thử ở đây canh đúng cái ranh giới dễ trượt nhất: thẻ chứa chữ "tour" mà KHÔNG
 * phải #Tour.
 */
const assert = require('assert');
const P = require('../phan-loai');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

console.log('\nphân loại bán hàng / tương tác');

t('mang #Tour là bán hàng, không mang là tương tác', () => {
  assert.strictEqual(P.loaiCuaBai('Combo 3 ngày 2 đêm #Tour #phuquoc'), P.BAN_HANG);
  assert.strictEqual(P.loaiCuaBai('Hôm nay biển đẹp quá #phuquoc #dulich'), P.TUONG_TAC);
});

t('không phân biệt hoa thường — content gõ kiểu gì cũng nhận', () => {
  ['#Tour', '#tour', '#TOUR', '#ToUr'].forEach((x) => {
    assert.strictEqual(P.loaiCuaBai('Nội dung gì đó ' + x), P.BAN_HANG, x);
  });
});

t('KHỚP NGUYÊN THẺ, không khớp tiền tố', () => {
  /* Đo trên dữ liệu thật: 134 bài mang đúng #tour, nhưng 316 bài mang thẻ bắt
     đầu bằng "tour" (#tourdao 103, #tours 38, #tourcano 26…). Khớp tiền tố là
     tự nới luật ra gấp đôi mà không ai quyết. */
  ['#tourdao', '#tours', '#tourcano', '#tourphuquoc', '#tour3dao', '#tourtet']
    .forEach((x) => {
      assert.strictEqual(P.loaiCuaBai('Đi chơi nè ' + x), P.TUONG_TAC, x + ' không phải #tour');
    });
  /* Và ngược lại: thẻ khác dính liền phía trước cũng không được tính. */
  assert.strictEqual(P.loaiCuaBai('#dulichtour thôi nhé'), P.TUONG_TAC);
});

t('#Tour nằm giữa caption, dính dấu câu, xuống dòng — vẫn nhận', () => {
  assert.strictEqual(P.loaiCuaBai('Giá tốt lắm #Tour, đặt ngay'), P.BAN_HANG);
  assert.strictEqual(P.loaiCuaBai('Xem thêm\n#Tour\n#phuquoc'), P.BAN_HANG);
  assert.strictEqual(P.loaiCuaBai('#phuquoc #Tour'), P.BAN_HANG);
});

t('caption rỗng thì vẫn phải ra một loại, không để trống', () => {
  /* "còn lại là tương tác HẾT" — hết nghĩa là không có ô trống nào. Ô trống là
     thứ app KPI chặn chốt tháng, nên để lọt một ô là chặn cả tháng. */
  [null, undefined, '', '   '].forEach((x) => {
    assert.strictEqual(P.loaiCuaBai(x), P.TUONG_TAC, JSON.stringify(x));
  });
});

t('chỉ trả về dòng CẦN đổi, không ghi lại cái đang đúng', () => {
  const bai = [
    { id: 'a', title: 'Combo #Tour', mucDich: 'Bán hàng' },   // đã đúng
    { id: 'b', title: 'Biển đẹp', mucDich: 'Tương tác' },     // đã đúng
    { id: 'c', title: 'Combo #Tour', mucDich: '' },           // phải điền
    { id: 'd', title: 'Biển đẹp', mucDich: 'Bán hàng' },      // phải sửa lại
  ];
  const r = P.tinh(bai);
  assert.strictEqual(r.ban, 2);
  assert.strictEqual(r.tuong, 2);
  assert.deepStrictEqual(Object.keys(r.doi).sort(), ['c', 'd'],
    'ghi lại 2.525 dòng mỗi lượt đồng bộ chỉ để ghi đúng cái đang có là phí');
});

t('cột này do máy giữ: ô người ta sửa tay sẽ bị tính lại', () => {
  /* Cố ý. Anh Hùng nói "còn lại là tương tác hết" — hết nghĩa là không ngoại lệ.
     Ghi phép thử để sau này ai thấy ô mình sửa bị đổi thì biết đó là thiết kế,
     không phải app nuốt mất. */
  const r = P.tinh([{ id: 'x', title: 'Biển đẹp #phuquoc', mucDich: 'Bán hàng' }]);
  assert.strictEqual(r.soDoi, 1);
});

t('danh sách thẻ bán hàng khai được từ ngoài, không phải sửa mã', () => {
  assert.ok(P.THE_BAN_HANG.has('#tour'), 'mặc định là #tour');
  assert.strictEqual(P.chuanThe('Tour'), '#tour', 'thiếu # thì tự thêm');
  assert.strictEqual(P.chuanThe('  #TOURDAO '), '#tourdao');
  assert.strictEqual(P.chuanThe(''), '');
});

t('đọc được mọi hashtag trong caption, kể cả tiếng Việt có dấu', () => {
  assert.deepStrictEqual(P.theCuaBai('#Tour #hònthơm #Phú_Quốc #tour'),
    ['#tour', '#hònthơm', '#phú_quốc']);
});

console.log('\n' + so + ' phép thử đạt\n');
