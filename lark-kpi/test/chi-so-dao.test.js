'use strict';
/**
 * CHỈ SỐ THẤP MỚI TỐT — `node test/chi-so-dao.test.js`.
 *
 * Anh Hùng 18/10/2026: *"tính bằng chỉ số CPA nha em"* — chi phí cho một đơn,
 * để chấm phần quảng cáo của Hùng.
 *
 * CPA đi ngược mọi chỉ số còn lại của bộ luật. Mục tiêu CPA 20.000đ mà đạt
 * 10.000đ là làm tốt gấp đôi, nhưng công thức `kết quả ÷ mục tiêu` ra 50% và
 * TRỪ điểm. Cùng loại: CPC, chi phí, tỷ lệ huỷ, số việc quá hạn.
 *
 * Nếu không có mấy phép thử này thì ngày nào đó ai đó đơn giản hoá lại công
 * thức cho "gọn", và người tiêu tiền hiệu quả nhất phòng thành người bị trừ
 * điểm nhiều nhất — mà bảng vẫn trông hợp lý.
 */
const assert = require('assert');
const { chamNhom, chamThang } = require('../tinh');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};
const gan = (a, b, ten) => assert.ok(Math.abs(a - b) < 1e-9,
  (ten || '') + ' — nhận ' + a + ', đợi ' + b);

console.log('\nchỉ số thấp-là-tốt trong một nhóm kênh');

const nhomCpa = (dao) => ({
  kenh: 'Ads', tenKenh: 'Tổng', loai: 'Chung',
  tieuChi: [{ ma: 'cpa', ten: 'CPA', mucTieu: 20000, tyTrong: 1, nguon: 'ads.cpa', dao }],
});

t('đạt NỬA mục tiêu CPA là làm TỐT GẤP ĐÔI', () => {
  const canh = [];
  const r = chamNhom(nhomCpa(true), { 'ads.cpa': 10000 }, canh);
  gan(r.tieuChi[0].datMucTieu, 2, 'CPA 10k trên mục tiêu 20k');
  gan(r.diem, 2);
});

t('cùng con số đó, nếu KHÔNG khai dao thì bị chấm ngược', () => {
  /* Giữ phép thử này để thấy rõ cái giá của việc quên khai `dao`. */
  const canh = [];
  const r = chamNhom(nhomCpa(false), { 'ads.cpa': 10000 }, canh);
  gan(r.tieuChi[0].datMucTieu, 0.5, 'đúng là bị chấm ngược');
});

t('CPA cao hơn mục tiêu thì bị trừ', () => {
  const canh = [];
  const r = chamNhom(nhomCpa(true), { 'ads.cpa': 40000 }, canh);
  gan(r.tieuChi[0].datMucTieu, 0.5);
});

t('CPA đúng bằng mục tiêu là 100%', () => {
  const canh = [];
  const r = chamNhom(nhomCpa(true), { 'ads.cpa': 20000 }, canh);
  gan(r.tieuChi[0].datMucTieu, 1);
});

t('kết quả bằng 0 KHÔNG thành điểm vô hạn', () => {
  /* CPA bằng 0 nghĩa là chưa tiêu đồng nào hoặc chưa có đơn nào — không phải
     "tốt vô hạn". Chia cho 0 ra Infinity, mà Infinity × trọng số thì kéo điểm
     cả phòng thành Infinity và bảng lương hết đọc được. */
  const canh = [];
  const r = chamNhom(nhomCpa(true), { 'ads.cpa': 0 }, canh);
  assert.strictEqual(r.tieuChi[0].datMucTieu, null);
  assert.strictEqual(r.tieuChi[0].boQua, true);
  assert.ok(Number.isFinite(r.diem) || r.diem === null, 'điểm phải hữu hạn, nhận ' + r.diem);
  assert.ok(canh.some((x) => /thấp-là-tốt/.test(x.viec)), 'phải có cảnh báo');
});

t('cảnh báo mục tiêu lệch nói ĐÚNG CHIỀU', () => {
  /* Với chỉ số thường, đạt 400% nghĩa là mục tiêu đặt quá THẤP. Với CPA thì
     ngược lại: đạt 400% nghĩa là mục tiêu CPA đặt quá CAO (quá dễ). */
  const canh = [];
  chamNhom(nhomCpa(true), { 'ads.cpa': 5000 }, canh);
  const c = canh.find((x) => /mục tiêu/.test(x.viec));
  assert.match(c.viec, /quá cao/, 'cảnh báo hiện tại: ' + c.viec);
});

console.log('\nchỉ số rời của một người');

const luatHung = (dao, mucTieu) => ({
  nhom: [],
  nguoi: [{
    ma: 'hung', ten: 'HÙNG',
    tieuChi: [{ ma: 'ads', ten: 'Quảng cáo', trongSo: 1, mucTieu, dao,
      nguon: { kieu: 'chiSo', ma: 'ads.cpa' } }],
  }],
});

t('chỉ số rời CÓ mục tiêu thì điểm là tỷ lệ đạt, không phải số thô', () => {
  /* Không có bước này thì CPA 22.400 đồng vào thẳng làm điểm, và điểm của
     Hùng thành 22.400 lần trọng số. */
  const r = chamThang(luatHung(true, 20000), { 'ads.cpa': 10000 }, {}, '2026-10');
  gan(r.nguoi[0].tieuChi[0].diem, 2);
});

t('chỉ số rời KHÔNG khai mục tiêu thì giữ đường cũ', () => {
  /* Tám tháng nhập từ Excel khai `chiSo` mà không có mục tiêu: ô đó đã là tỷ
     lệ sẵn (SEO 0,95 nghĩa là đạt 95%). Đổi cách đọc là tính lại sai cả tám
     tháng đã trả lương. */
  const r = chamThang(luatHung(false, undefined), { 'ads.cpa': 0.95 }, {}, '2026-10');
  gan(r.nguoi[0].tieuChi[0].diem, 0.95);
});

t('chỉ số rời thấp-là-tốt, kết quả 0 thì không chấm được', () => {
  const r = chamThang(luatHung(true, 20000), { 'ads.cpa': 0 }, {}, '2026-10');
  assert.strictEqual(r.nguoi[0].tieuChi[0].diem, null);
  assert.strictEqual(r.nguoi[0].tieuChi[0].chuaCo, true);
});

t('ghi chú nói rõ chiều của chỉ số', () => {
  const r = chamThang(luatHung(true, 20000), { 'ads.cpa': 10000 }, {}, '2026-10');
  assert.match(r.nguoi[0].tieuChi[0].ghi, /thấp hơn là tốt/);
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
