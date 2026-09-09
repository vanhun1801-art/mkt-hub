'use strict';
/* Test thuần Node: `node test/tinh.test.js`. */
const assert = require('assert');
const { chamThang, chamNhom, chotDuoc } = require('../tinh');
const bu = require('../bu-view');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};
const gan = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' — được ' + a + ', chờ ' + b);
const co = (v, chu) => v.some((x) => (x.viec + ' ' + x.o).includes(chu));
const chan = (v) => v.filter((x) => x.muc === 'chan');

const NHOM = {
  kenh: 'FB', tenKenh: 'Rooty Trip Phú Quốc', loai: 'Bài viết',
  tieuChi: [
    { ma: 'view', ten: 'Lượt view', nguon: 'fb.rt.view', mucTieu: 5000000, tyTrong: 0.4 },
    { ma: 'follow', ten: 'Lượt follow', nguon: 'fb.rt.follow', mucTieu: 12000, tyTrong: 0.3 },
    { ma: 'lead', ten: 'Số lead', nguon: 'fb.rt.lead', mucTieu: 1500, tyTrong: 0.3 },
  ],
};
const KHOA = 'FB|Rooty Trip Phú Quốc|Bài viết';
const luat = (over) => Object.assign({
  id: 'bl-t', tuThang: '2026-09',
  heSo: { macDinh: { 'Bán hàng': 1, 'Tương tác': 0.2 }, theoNhom: {} },
  buView: { bat: true, chiaNguong: 2, tyLeChoPhep: 0.5 },
  nhom: [JSON.parse(JSON.stringify(NHOM))],
  nguoi: [{
    ma: 'thu', ten: 'THƯ',
    tieuChi: [
      { ma: 'hieuQua', ten: 'Hiệu quả công việc chính', trongSo: 0.7, nguon: { kieu: 'kenh' } },
      { ma: 'tuanThu', ten: 'Tuân thủ', trongSo: 0.1, nguon: { kieu: 'tay', boi: 'HCNS' } },
      { ma: 'quanLy', ten: 'Quản lý đánh giá', trongSo: 0.1, nguon: { kieu: 'tay', boi: 'TP' } },
      { ma: 'dongGop', ten: 'Đóng góp', trongSo: 0.3, nguon: { kieu: 'tay', boi: 'TP' } },
    ],
    kenh: { [KHOA]: 1 },
  }],
}, over);

console.log('\nchấm nhóm kênh');

t('khớp đúng số học của bảng Excel tháng 7 (nhóm FB Rooty Trip)', () => {
  /* Số thật lấy từ file KPI đã sửa: view 1.151.981 / mục tiêu 5tr; follow 6.269 /
   * 12.000; lead đạt đủ 1.500. Nhóm phải ra 0,5489 đúng như bảng. */
  const w = [];
  const n = chamNhom(NHOM, { 'fb.rt.view': 1151981.3626, 'fb.rt.follow': 6269, 'fb.rt.lead': 1500 }, w);
  gan(n.tieuChi[0].datMucTieu, 0.23039627252, '% đạt view');
  gan(n.tieuChi[1].datMucTieu, 0.52241666667, '% đạt follow');
  gan(n.diem, 0.4 * 0.23039627252 + 0.3 * 0.52241666667 + 0.3 * 1, 'điểm nhóm');
});

t('tiêu chí không có số bị loại và tỷ trọng chia lại cho phần còn lại', () => {
  /* Excel ghi chữ "x" vào ô mục tiêu của những kênh không đo được follow, làm cả
   * nhóm ra lỗi rồi bị chữa cháy bằng cách gõ điểm 0. Ở đây phải chia lại. */
  const w = [];
  const n = chamNhom(NHOM, { 'fb.rt.view': 5000000, 'fb.rt.follow': null, 'fb.rt.lead': 1500 }, w);
  const view = n.tieuChi.find((x) => x.ma === 'view');
  const follow = n.tieuChi.find((x) => x.ma === 'follow');
  assert.ok(follow.boQua, 'follow phải bị loại');
  gan(view.tyTrong, 0.4 / 0.7, 'tỷ trọng view sau khi chia lại');
  gan(n.diem, 1, 'hai tiêu chí còn lại đều đạt 100% thì nhóm đạt 100%');
  assert.ok(co(w, 'chia lại'));
});

t('không đo được khác hẳn đạt 0', () => {
  const a = chamNhom(NHOM, { 'fb.rt.view': 5000000, 'fb.rt.follow': null, 'fb.rt.lead': 1500 }, []);
  const b = chamNhom(NHOM, { 'fb.rt.view': 5000000, 'fb.rt.follow': 0, 'fb.rt.lead': 1500 }, []);
  gan(a.diem, 1, 'không đo được thì chia lại');
  gan(b.diem, 0.7, 'đo được mà bằng 0 thì mất đúng phần đó');
});

t('cả nhóm không đo được thì điểm là null, không phải 0', () => {
  const w = [];
  const n = chamNhom(NHOM, {}, w);
  assert.strictEqual(n.diem, null);
  assert.ok(n.boQuaHet);
  assert.ok(chan(w).length, 'phải chặn chốt tháng');
});

t('đạt mục tiêu quá cao thì cảnh báo mục tiêu đặt sai', () => {
  /* Tháng 7 có kênh đặt mục tiêu 30.000 view nhưng đạt 353.035 — 1.177%. */
  const w = [];
  chamNhom({ ...NHOM, tieuChi: [{ ma: 'view', ten: 'Lượt view', nguon: 'v', mucTieu: 30000, tyTrong: 1 }] },
    { v: 353034 }, w);
  assert.ok(co(w, 'đặt quá thấp'));
});

t('đạt quá thấp cũng cảnh báo — thường là nguồn số liệu hỏng', () => {
  const w = [];
  chamNhom({ ...NHOM, tieuChi: [{ ma: 'view', ten: 'Lượt view', nguon: 'v', mucTieu: 5000000, tyTrong: 1 }] },
    { v: 100 }, w);
  assert.ok(co(w, 'Chỉ đạt'));
});

console.log('\nchấm tháng');

t('điểm tính lương = trọng số × điểm, cộng lại ra tổng', () => {
  const r = chamThang(luat(), { 'fb.rt.view': 5000000, 'fb.rt.follow': 12000, 'fb.rt.lead': 1500 },
    { thu: { tuanThu: 1, quanLy: 1, dongGop: 0.3 } }, '2026-09');
  const ng = r.nguoi[0];
  gan(ng.tieuChi[0].diem, 1, 'hiệu quả');
  gan(ng.tong, 0.7 * 1 + 0.1 * 1 + 0.1 * 1 + 0.3 * 0.3, 'tổng điểm tính lương');
  gan(ng.tongTrongSo, 1.2);
  assert.ok(ng.dayDu, 'đủ dữ liệu');
});

t('thiếu điểm chấm tay thì chặn chốt và đánh dấu chưa đủ', () => {
  const r = chamThang(luat(), { 'fb.rt.view': 5000000, 'fb.rt.follow': 12000, 'fb.rt.lead': 1500 },
    { thu: { tuanThu: 1 } }, '2026-09');
  assert.ok(!r.nguoi[0].dayDu);
  assert.strictEqual(r.nguoi[0].thieuCham, 2);
  assert.ok(co(r.canhBao, 'Chưa được TP chấm'));
  assert.ok(!chotDuoc(luat(), r).duoc, 'chưa chốt được');
});

t('người ăn chỉ số đơn lẻ (Hân, Hùng) chấm cùng một khuôn', () => {
  const l = luat({
    nguoi: [{
      ma: 'han', ten: 'HÂN',
      tieuChi: [
        { ma: 'seo', ten: 'SEO', trongSo: 0.6, nguon: { kieu: 'chiSo', ma: 'seo.tong' } },
        { ma: 'ota', ten: 'OTA', trongSo: 0.1, nguon: { kieu: 'chiSo', ma: 'ota.tong' } },
        { ma: 'tuanThu', ten: 'Tuân thủ', trongSo: 0.1, nguon: { kieu: 'tay', boi: 'HCNS' } },
        { ma: 'quanLy', ten: 'Quản lý', trongSo: 0.1, nguon: { kieu: 'tay', boi: 'TP' } },
        { ma: 'dongGop', ten: 'Đóng góp', trongSo: 0.3, nguon: { kieu: 'tay', boi: 'TP' } },
      ],
    }],
  });
  const r = chamThang(l, { 'seo.tong': 0.6148, 'ota.tong': 0.15 },
    { han: { tuanThu: 1, quanLy: 1, dongGop: 1 } }, '2026-09');
  gan(r.nguoi[0].tong, 0.6 * 0.6148 + 0.1 * 0.15 + 0.1 + 0.1 + 0.3);
});

t('phân bổ vào nhóm không chấm được thì báo mất bao nhiêu tỷ trọng', () => {
  const l = luat();
  l.nguoi[0].kenh = { [KHOA]: 0.6, 'FB|Kênh ma|Bài viết': 0.4 };
  const r = chamThang(l, { 'fb.rt.view': 5000000, 'fb.rt.follow': 12000, 'fb.rt.lead': 1500 },
    { thu: { tuanThu: 1, quanLy: 1, dongGop: 0 } }, '2026-09');
  assert.ok(co(r.canhBao, 'không có trong bộ luật'));
  assert.ok(co(r.canhBao, 'bị thiếu đúng phần đó'));
  gan(r.nguoi[0].tieuChi[0].diem, 0.6, 'chỉ tính phần chấm được');
  assert.ok(!r.nguoi[0].dayDu);
});

t('bộ luật sai thì chotDuoc gộp cả lỗi luật lẫn lỗi số liệu', () => {
  const l = luat();
  l.nhom[0].tieuChi[2].tyTrong = 0.1;   // nhóm cộng ra 0,8
  const r = chamThang(l, { 'fb.rt.view': 5000000, 'fb.rt.follow': 12000, 'fb.rt.lead': 1500 },
    { thu: { tuanThu: 1, quanLy: 1, dongGop: 1 } }, '2026-09');
  const c = chotDuoc(l, r);
  assert.ok(!c.duoc);
  assert.ok(co(c.chan, 'phải đủ 100%'));
});

t('cùng số liệu thì chấm lại ra đúng cùng một điểm', () => {
  const sl = { 'fb.rt.view': 4321000, 'fb.rt.follow': 9111, 'fb.rt.lead': 1200 };
  const tay = { thu: { tuanThu: 1, quanLy: 0.8, dongGop: 0.5 } };
  const a = chamThang(luat(), sl, tay, '2026-09');
  const b = chamThang(luat(), sl, tay, '2026-09');
  assert.deepStrictEqual(a.nguoi, b.nguoi);
});

console.log('\nluật bù view');

t('đăng đều tay thì được cộng thưởng', () => {
  const r = bu.tinh([100, 100, 100, 100].map((v) => ({ view: v, mucDich: 'Bán hàng' })),
    { bat: true, chiaNguong: 2, tyLeChoPhep: 0.5 }, () => 1);
  gan(r.trungBinh, 100);
  gan(r.nguong, 50);
  assert.strictEqual(r.duoiNguong, 0);
  gan(r.suatDu, 2);
  gan(r.thuong, 200);
  gan(r.sauBu, 600);
});

t('một video viral rồi bỏ bê thì bị trừ ngược', () => {
  const r = bu.tinh([400, 10, 10, 10].map((v) => ({ view: v, mucDich: 'Bán hàng' })),
    { bat: true, chiaNguong: 2, tyLeChoPhep: 0.5 }, () => 1);
  gan(r.tong, 430);
  gan(r.trungBinh, 107.5);
  assert.strictEqual(r.duoiNguong, 3);
  gan(r.suatDu, -1);
  gan(r.sauBu, 322.5, 'bị trừ đúng một suất trung bình');
  assert.ok(r.sauBu < r.tong, 'phải thấp hơn tổng thô');
});

t('hệ số mục đích áp sau khi bù, theo tỷ lệ view thật', () => {
  const r = bu.tinh([
    { view: 300, mucDich: 'Bán hàng' },
    { view: 100, mucDich: 'Tương tác' },
  ], { bat: true, chiaNguong: 2, tyLeChoPhep: 0.5 }, (md) => (md === 'Bán hàng' ? 1 : 0.2));
  gan(r.tong, 400);
  gan(r.trungBinh, 200);
  /* Ngưỡng = 200/2 = 100. Bài 100 view đúng BẰNG ngưỡng nên không bị tính là
   * dưới chuẩn — so sánh chặt "<" đúng như công thức Excel gốc. */
  assert.strictEqual(r.duoiNguong, 0);
  gan(r.suatDu, 1);
  gan(r.thuong, 200);
  gan(r.sauBu, 600);
  const bh = r.theoMucDich['Bán hàng'];
  const tt = r.theoMucDich['Tương tác'];
  gan(bh.sauBu + tt.sauBu, r.sauBu, 'chia hết phần đã bù');
  gan(r.ketQua, bh.sauBu * 1 + tt.sauBu * 0.2);
});

t('tắt luật bù thì ra đúng tổng thô đã quy đổi hệ số', () => {
  const r = bu.tinh([400, 10, 10, 10].map((v) => ({ view: v, mucDich: 'Bán hàng' })),
    { bat: false }, () => 1);
  gan(r.thuong, 0);
  gan(r.sauBu, 430);
  gan(r.ketQua, 430);
});

t('không có bài nào thì ra 0, không chia cho 0', () => {
  const r = bu.tinh([], { bat: true }, () => 1);
  assert.strictEqual(r.soBai, 0);
  gan(r.tong, 0); gan(r.trungBinh, 0); gan(r.ketQua, 0);
  assert.ok(Number.isFinite(r.thuong));
});

t('bài chưa gắn mục đích được liệt kê để chặn chốt tháng', () => {
  const ds = [{ view: 1, mucDich: 'Bán hàng' }, { view: 2 }, { view: 3, mucDich: '' }];
  assert.strictEqual(bu.chuaPhanLoai(ds).length, 2);
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
