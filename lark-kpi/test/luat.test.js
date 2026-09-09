'use strict';
/* Test thuần Node, không framework: `node test/luat.test.js`.
 *
 * Mỗi phép thử dưới đây canh đúng một lỗi CÓ THẬT đã tìm thấy trong file KPI
 * Excel tháng 1–7/2026. Nếu một ngày nào đó bộ luật lại cho phép những chuyện
 * này, test phải đỏ. */
const assert = require('assert');
const L = require('../luat');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

/* Bộ luật tối giản nhưng hợp lệ, dùng làm nền rồi bẻ từng chỗ. */
const nhomFB = () => ({
  kenh: 'FB', tenKenh: 'Rooty Trip Phú Quốc', loai: 'Bài viết',
  tieuChi: [
    { ma: 'view', ten: 'Lượt view', nguon: 'fb.rt.view', mucTieu: 5000000, tyTrong: 0.4 },
    { ma: 'follow', ten: 'Lượt follow', nguon: 'fb.rt.follow', mucTieu: 12000, tyTrong: 0.3 },
    { ma: 'lead', ten: 'Số lead', nguon: 'fb.rt.lead', mucTieu: 1500, tyTrong: 0.3 },
  ],
});
const nguoiThu = () => ({
  ma: 'thu', ten: 'THƯ', viTri: 'Content',
  tieuChi: [
    { ma: 'hieuQua', ten: 'Hiệu quả công việc chính', trongSo: 0.7, nguon: { kieu: 'kenh' } },
    { ma: 'tuanThu', ten: 'Tuân thủ quy định', trongSo: 0.1, nguon: { kieu: 'tay', boi: 'HCNS' } },
    { ma: 'quanLy', ten: 'Quản lý đánh giá', trongSo: 0.1, nguon: { kieu: 'tay', boi: 'TP' } },
    { ma: 'dongGop', ten: 'Đóng góp tiêu chí 2', trongSo: 0.3, nguon: { kieu: 'tay', boi: 'TP' } },
  ],
  kenh: { 'FB|Rooty Trip Phú Quốc|Bài viết': 1 },
});
const luatOk = () => ({
  id: 'bl-2026-09', tuThang: '2026-09',
  heSo: { macDinh: { 'Bán hàng': 1, 'Tương tác': 0.2 }, theoNhom: {} },
  buView: { bat: true, chiaNguong: 2, tyLeChoPhep: 0.5 },
  nhom: [nhomFB()],
  nguoi: [nguoiThu()],
});
const chan = (v) => v.filter((x) => x.muc === 'chan');
const co = (v, chu) => v.some((x) => (x.viec + ' ' + x.o).includes(chu));

console.log('\nsoát bộ luật');

t('bộ luật đúng thì không có mục chặn nào', () => {
  assert.deepStrictEqual(chan(L.soat(luatOk())), []);
});

t('tỷ trọng tiêu chí trong nhóm không đủ 100% thì chặn', () => {
  // Excel: nhóm ZaloOA cộng ra 0,2 vì tiêu chí follow bị bỏ trống — mất 80% điểm
  const l = luatOk();
  l.nhom[0].tieuChi[2].tyTrong = 0.1;
  const v = L.soat(l);
  assert.ok(chan(v).length, 'phải chặn');
  assert.ok(co(v, 'phải đủ 100%'));
});

t('mục tiêu bằng 0 hoặc bỏ trống thì chặn, không để chia cho 0', () => {
  const l = luatOk();
  l.nhom[0].tieuChi[0].mucTieu = 0;
  assert.ok(co(L.soat(l), 'lớn hơn 0'));
  const l2 = luatOk();
  delete l2.nhom[0].tieuChi[0].mucTieu;
  assert.ok(co(L.soat(l2), 'lớn hơn 0'));
});

t('mục tiêu trỏ vào chính công thức kết quả không còn khai được', () => {
  // Excel H44 = ='Lượt view'!X30 nên kênh đó luôn đạt đúng 100%
  const l = luatOk();
  l.nhom[0].tieuChi[0].mucTieu = "='Lượt view'!X30";
  assert.ok(co(L.soat(l), 'lớn hơn 0'), 'mục tiêu phải là số, không phải tham chiếu');
});

t('tỷ trọng kênh của một người không đủ 100% thì chặn', () => {
  const l = luatOk();
  l.nguoi[0].kenh = { 'FB|Rooty Trip Phú Quốc|Bài viết': 0.6 };
  assert.ok(co(L.soat(l), 'Tỷ trọng kênh'));
});

t('phân bổ vào nhóm không tồn tại thì chặn', () => {
  const l = luatOk();
  l.nguoi[0].kenh = { 'FB|Kênh ma|Bài viết': 1 };
  assert.ok(co(L.soat(l), 'không tồn tại'));
});

t('tổng trọng số của một người lệch người khác thì chặn', () => {
  // Excel: Hân tháng 5 cộng ra 1,3 trong khi mọi người 1,2 — tự nhiên hơn 0,1 điểm
  const l = luatOk();
  const han = nguoiThu();
  han.ma = 'han'; han.ten = 'HÂN';
  han.tieuChi[0].trongSo = 0.8;   // tổng thành 1,3
  l.nguoi.push(han);
  const v = L.soat(l);
  assert.ok(co(v, 'Tổng trọng số'), 'phải bắt được chênh lệch tổng trọng số');
});

t('hai người trùng khít bảng phân bổ thì cảnh báo', () => {
  // Excel: Ngọc trùng 100% với Thư từ tháng 4 đến tháng 7 nên điểm luôn bằng nhau
  const l = luatOk();
  const ngoc = nguoiThu();
  ngoc.ma = 'ngoc'; ngoc.ten = 'NGỌC';
  l.nguoi.push(ngoc);
  const v = L.soat(l);
  assert.ok(co(v, 'giống hệt nhau'));
  assert.deepStrictEqual(chan(v), [], 'chỉ cảnh báo, không chặn');
});

t('nhóm kênh khai hai lần thì chặn', () => {
  const l = luatOk();
  l.nhom.push(nhomFB());
  assert.ok(co(L.soat(l), 'hai lần'));
});

t('kiểu nguồn lạ thì chặn', () => {
  const l = luatOk();
  l.nguoi[0].tieuChi[0].nguon = { kieu: 'ma-thuat' };
  assert.ok(co(L.soat(l), 'không hợp lệ'));
});

t('người không ăn theo kênh thì không bắt buộc bảng phân bổ', () => {
  // Hân (SEO/Ads/OTA) và Hùng (Ads/KOL) dùng chỉ số đơn lẻ, không có kênh
  const l = luatOk();
  l.nguoi = [{
    ma: 'han', ten: 'HÂN', viTri: 'Website',
    tieuChi: [
      { ma: 'seo', ten: 'SEO', trongSo: 0.6, nguon: { kieu: 'chiSo', ma: 'seo.tong' } },
      { ma: 'ota', ten: 'OTA', trongSo: 0.1, nguon: { kieu: 'chiSo', ma: 'ota.tong' } },
      { ma: 'tuanThu', ten: 'Tuân thủ', trongSo: 0.1, nguon: { kieu: 'tay', boi: 'HCNS' } },
      { ma: 'quanLy', ten: 'Quản lý đánh giá', trongSo: 0.1, nguon: { kieu: 'tay', boi: 'TP' } },
      { ma: 'dongGop', ten: 'Đóng góp', trongSo: 0.3, nguon: { kieu: 'tay', boi: 'TP' } },
    ],
  }];
  assert.deepStrictEqual(chan(L.soat(l)), []);
});

t('nguồn chỉ số thiếu mã thì chặn', () => {
  const l = luatOk();
  l.nguoi[0].tieuChi[0].nguon = { kieu: 'chiSo' };
  assert.ok(co(L.soat(l), 'chưa khai mã'));
});

t('hệ số lấy theo nhóm trước, không có thì lấy mặc định', () => {
  const l = luatOk();
  l.heSo.theoNhom['FB|Rooty Trip Phú Quốc|Bài viết'] = { 'Tương tác': 0.05 };
  assert.strictEqual(L.heSo(l, 'FB|Rooty Trip Phú Quốc|Bài viết', 'Tương tác'), 0.05);
  assert.strictEqual(L.heSo(l, 'FB|Rooty Trip Phú Quốc|Bài viết', 'Bán hàng'), 1);
  assert.strictEqual(L.heSo(l, 'nhóm khác', 'Tương tác'), 0.2);
  assert.strictEqual(L.heSo(l, 'nhóm khác', 'Mục đích lạ'), 1);
});

t('bộ luật mới tạo ra đúng hình dạng, chỉ thiếu nội dung', () => {
  const l = L.boLuatMoi('2026-10');
  assert.strictEqual(l.tuThang, '2026-10');
  const v = L.soat(l);
  assert.ok(co(v, 'chưa có nhóm kênh nào'));
  assert.ok(co(v, 'chưa có người nào'));
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
