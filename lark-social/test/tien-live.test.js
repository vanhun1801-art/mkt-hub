'use strict';
/* Test thuần Node, không framework, không mạng: `node test/tien-live.test.js`.
 *
 * Phép gắn tiền cho phiên LIVE là chỗ dễ sai mà sai thì im lặng: lệch múi giờ
 * một tiếng, đếm một đơn hai lần, hay nhận nhầm lead của nền tảng khác — đều
 * ra một con số trông rất hợp lý. Nên mỗi luật trong tien-live.js có một phép
 * thử riêng ở đây. */
const assert = require('assert');
const TL = require('../tien-live');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

/* 20:00 → 22:00 giờ Việt Nam, viết bằng epoch ms giống hệt cách Base trả về. */
const VN = (s) => Date.parse(s + '+07:00');
const phien = (key, platform, start, end) => ({ key, platform, start: VN(start), end: VN(end) });
const lead = (ma, nenTang, luc, kh = 'KL1') => ({ ma, nenTang, luc: VN(luc), kh });
const ht = (id, nenTang, luc) => ({ id, nenTang, luc: VN(luc) });
const don = (ma, luc, tien, kh = 'KL1', trangThai = 'Thành công', nguoiTao = '') => ({
  ma, kh, luc: VN(luc), tien, trangThai,
  huy: TL.laHuy(trangThai), noiBo: TL.laNoiBo(nguoiTao),
});

console.log('\nnhãn nguồn → nền tảng');

t('đọc đúng hai nhãn thật của Tourwell', () => {
  assert.strictEqual(TL.nenTangTuNguon('Tiktok Rooty Trip Phú Quốc'), 'TikTok');
  assert.strictEqual(TL.nenTangTuNguon('Facebook Rooty Trip Phú Quốc'), 'Facebook');
});

t('nhãn lạ thì trả rỗng chứ không đoán bừa', () => {
  assert.strictEqual(TL.nenTangTuNguon('Lữ hành'), '');
  assert.strictEqual(TL.nenTangTuNguon(''), '');
  assert.strictEqual(TL.nenTangTuNguon(null), '');
});

console.log('\nđơn huỷ');

t('bắt được cả "hủy" lẫn "huỷ" — hai cách bỏ dấu', () => {
  assert.ok(TL.laHuy('Hủy'));
  assert.ok(TL.laHuy('Đã huỷ'));
  assert.ok(TL.laHuy('Cancelled'));
  assert.ok(!TL.laHuy('Thành công'));
  assert.ok(!TL.laHuy('Đang xử lý'));
});

console.log('\nđơn nội bộ');

t('đơn do API của phòng tự tạo không phải doanh thu', () => {
  assert.ok(TL.laNoiBo('Api Official'));
  assert.ok(TL.laNoiBo('api official'));
  assert.ok(!TL.laNoiBo('Bùi Thị Khánh Linh'));
  assert.ok(!TL.laNoiBo(''));
});

console.log('\nmốc thời gian');

t('đọc được cả epoch ms của Base lẫn chuỗi ISO của Tourwell', () => {
  const t0 = Date.parse('2026-09-21T15:26:43+07:00');
  assert.strictEqual(TL.moc(t0), t0);
  assert.strictEqual(TL.moc('2026-09-21T15:26:43+07:00'), t0);
  assert.strictEqual(TL.moc(String(t0)), t0);
  assert.ok(Number.isNaN(TL.moc('')));
});

t('giờ Pancake không có Z vẫn phải hiểu là UTC, dù máy chạy ở múi nào', () => {
  /* Đây là phép thử giữ cho một lỗi cụ thể không quay lại: Pancake trả
   * '2026-09-21T13:34:45.860818' và đó là giờ UTC. Date.parse() trần sẽ hiểu
   * thành giờ máy — đúng trên Render, lệch 7 tiếng trên máy ở Việt Nam. */
  assert.strictEqual(TL.mocUTC('2026-09-21T13:34:45.860818'),
    Date.parse('2026-09-21T13:34:45.860Z'));
  // chuỗi đã có múi giờ thì đừng đụng vào
  assert.strictEqual(TL.mocUTC('2026-09-21T13:34:45+07:00'),
    Date.parse('2026-09-21T13:34:45+07:00'));
  assert.strictEqual(TL.mocUTC('2026-09-21T13:34:45Z'),
    Date.parse('2026-09-21T13:34:45Z'));
  assert.ok(Number.isNaN(TL.mocUTC('')));
});

t('tiền đọc được cả ba dạng Tourwell trả', () => {
  assert.strictEqual(TL.tien(9350000), 9350000);
  assert.strictEqual(TL.tien('9,350,000'), 9350000);
  assert.strictEqual(TL.tien({ foreign: '9350000', base: 9350000 }), 9350000);
  assert.strictEqual(TL.tien(null), 0);
});

t('ngày về đúng định dạng Tourwell đòi', () => {
  assert.strictEqual(TL.ngayTW('2026-09-01'), '01/09/2026');
  assert.strictEqual(TL.ngayTW('bậy'), '');
});

console.log('\nkhung giờ phiên');

t('thiếu giờ kết thúc thì lấy số phút đã ghi', () => {
  const k = TL.khungPhien({ start: VN('2026-09-10T20:00:00'), minutes: 90 }, 0);
  assert.strictEqual(k.den - k.tu, 90 * 60000);
});

t('không có cả phút thì coi là 3 giờ', () => {
  const k = TL.khungPhien({ start: VN('2026-09-10T20:00:00') }, 0);
  assert.strictEqual(k.den - k.tu, 180 * 60000);
});

t('đuôi cộng thêm vào cuối, không cộng vào đầu', () => {
  const k = TL.khungPhien(phien('a', 'TikTok', '2026-09-10T20:00:00', '2026-09-10T22:00:00'), 120);
  assert.strictEqual(k.tu, VN('2026-09-10T20:00:00'));
  assert.strictEqual(k.den, VN('2026-09-11T00:00:00'));
});

t('phiên không có giờ bắt đầu thì bỏ, không dựng khung bừa', () => {
  assert.strictEqual(TL.khungPhien({ start: null }), null);
});

console.log('\nphép gắn');

const P = phien('tt-1', 'TikTok', '2026-09-10T20:00:00', '2026-09-10T22:00:00');

t('lead trong khung, đúng nền tảng thì được tính', () => {
  const kq = TL.gan({
    lives: [P],
    leads: [lead('LU1', 'TikTok', '2026-09-10T20:30:00')],
    dons: [], duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-1').soLead, 1);
});

t('lead của nền tảng khác thì không tính, dù đúng giờ', () => {
  const kq = TL.gan({
    lives: [P],
    leads: [lead('LU1', 'Facebook', '2026-09-10T20:30:00')],
    dons: [], duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-1').soLead, 0);
});

t('lead rơi trong đuôi 2 tiếng vẫn tính, quá đuôi thì thôi', () => {
  const trong = TL.gan({
    lives: [P], leads: [lead('LU1', 'TikTok', '2026-09-10T23:30:00')], dons: [], duoiPhut: 120,
  });
  const ngoai = TL.gan({
    lives: [P], leads: [lead('LU1', 'TikTok', '2026-09-11T00:30:00')], dons: [], duoiPhut: 120,
  });
  assert.strictEqual(trong.get('tt-1').soLead, 1);
  assert.strictEqual(ngoai.get('tt-1').soLead, 0);
});

t('lead trước giờ bắt đầu thì không tính', () => {
  const kq = TL.gan({
    lives: [P], leads: [lead('LU1', 'TikTok', '2026-09-10T19:59:00')], dons: [], duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-1').soLead, 0);
});

t('hội thoại Pancake mở trong khung giờ được đếm vào cột Tin nhắn', () => {
  const kq = TL.gan({
    lives: [P],
    hoiThoai: [
      ht('c1', 'TikTok', '2026-09-10T20:05:00'),
      ht('c2', 'TikTok', '2026-09-10T21:40:00'),
      ht('c3', 'TikTok', '2026-09-10T23:30:00'),   // trong đuôi 2 tiếng
    ],
    duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-1').soTinNhan, 3);
});

t('hội thoại ngoài khung, hoặc của nền tảng khác, thì không đếm', () => {
  const kq = TL.gan({
    lives: [P],
    hoiThoai: [
      ht('c1', 'TikTok', '2026-09-10T19:00:00'),    // trước giờ bắt đầu
      ht('c2', 'TikTok', '2026-09-11T02:00:00'),    // quá đuôi
      ht('c3', 'Facebook', '2026-09-10T20:30:00'),  // nền tảng khác
    ],
    duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-1').soTinNhan, 0);
});

t('hội thoại và lead chồng giờ thì cùng về một phiên — hai cột một luật', () => {
  const som = phien('tt-som', 'TikTok', '2026-09-10T19:00:00', '2026-09-10T22:00:00');
  const muon = phien('tt-muon', 'TikTok', '2026-09-10T20:00:00', '2026-09-10T21:00:00');
  const kq = TL.gan({
    lives: [som, muon],
    hoiThoai: [ht('c1', 'TikTok', '2026-09-10T20:30:00')],
    leads: [lead('LU1', 'TikTok', '2026-09-10T20:30:00')],
    duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-muon').soTinNhan, 1);
  assert.strictEqual(kq.get('tt-muon').soLead, 1);
  assert.strictEqual(kq.get('tt-som').soTinNhan, 0);
  assert.strictEqual(kq.get('tt-som').soLead, 0);
});

t('không có Pancake thì cột Tin nhắn là 0, không phải phiên biến mất', () => {
  const kq = TL.gan({ lives: [P], hoiThoai: [], leads: [], dons: [] });
  assert.strictEqual(kq.get('tt-1').soTinNhan, 0);
});

t('đơn nối với lead qua MÃ KHÁCH — bản lead không hề trả mã đơn', () => {
  const kq = TL.gan({
    lives: [P],
    leads: [lead('LU1', 'TikTok', '2026-09-10T20:30:00', 'KL9')],
    dons: [don('RT1', '2026-09-12T09:00:00', 9350000, 'KL9')],
    duoiPhut: 120,
  });
  const o = kq.get('tt-1');
  assert.strictEqual(o.soDon, 1);
  assert.strictEqual(o.doanhThu, 9350000);
});

t('đơn của khách khác thì không tính, dù cùng ngày', () => {
  const kq = TL.gan({
    lives: [P],
    leads: [lead('LU1', 'TikTok', '2026-09-10T20:30:00', 'KL9')],
    dons: [don('RT1', '2026-09-12T09:00:00', 9350000, 'KL8')],
    duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-1').soDon, 0);
});

t('đơn huỷ không phải doanh thu', () => {
  const kq = TL.gan({
    lives: [P],
    leads: [lead('LU1', 'TikTok', '2026-09-10T20:30:00', 'KL9')],
    dons: [don('RT1', '2026-09-12T09:00:00', 9350000, 'KL9', 'Hủy')],
    duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-1').doanhThu, 0);
  assert.strictEqual(kq.get('tt-1').soDon, 0);
});

t('đơn tạo TRƯỚC lead thì bỏ — khách cũ quay lại, không phải công của phiên', () => {
  const kq = TL.gan({
    lives: [P],
    leads: [lead('LU1', 'TikTok', '2026-09-10T20:30:00', 'KL9')],
    dons: [don('RT1', '2026-09-01T09:00:00', 9350000, 'KL9')],
    duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-1').doanhThu, 0);
});

t('khách liên hệ nhiều lần: đơn về LẦN GẦN NHẤT trước khi đặt', () => {
  const sau = phien('tt-2', 'TikTok', '2026-09-20T20:00:00', '2026-09-20T22:00:00');
  const kq = TL.gan({
    lives: [P, sau],
    leads: [
      lead('LU1', 'TikTok', '2026-09-10T20:30:00', 'KL9'),
      lead('LU2', 'TikTok', '2026-09-20T20:30:00', 'KL9'),
    ],
    dons: [don('RT1', '2026-09-21T09:00:00', 9350000, 'KL9')],
    duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-2').doanhThu, 9350000);
  assert.strictEqual(kq.get('tt-1').doanhThu, 0);
});

t('một đơn chỉ được ghi công một lần dù khách có nhiều lead trong cùng phiên', () => {
  const kq = TL.gan({
    lives: [P],
    leads: [
      lead('LU1', 'TikTok', '2026-09-10T20:10:00', 'KL9'),
      lead('LU2', 'TikTok', '2026-09-10T20:20:00', 'KL9'),
    ],
    dons: [don('RT1', '2026-09-12T09:00:00', 9350000, 'KL9')],
    duoiPhut: 120,
  });
  const o = kq.get('tt-1');
  assert.strictEqual(o.soLead, 2);
  assert.strictEqual(o.soDon, 1);
  assert.strictEqual(o.doanhThu, 9350000);
});

t('đơn chi phí nội bộ không chui vào doanh thu LIVE', () => {
  const kq = TL.gan({
    lives: [P],
    leads: [lead('LU1', 'TikTok', '2026-09-10T20:30:00', 'KL9')],
    dons: [don('RT1', '2026-09-12T09:00:00', 9350000, 'KL9', 'Đang xử lý', 'Api Official')],
    duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-1').doanhThu, 0);
  assert.strictEqual(kq.get('tt-1').soDon, 0);
});

t('đơn của khách có lead NGOÀI phiên thì không về phiên nào', () => {
  const kq = TL.gan({
    lives: [P],
    leads: [
      lead('LU1', 'TikTok', '2026-09-10T20:30:00', 'KL9'),
      lead('LU2', 'TikTok', '2026-09-15T09:00:00', 'KL9'),   // ngoài mọi khung
    ],
    dons: [don('RT1', '2026-09-16T09:00:00', 9350000, 'KL9')],
    duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-1').doanhThu, 0);
});

t('hai phiên chồng giờ: lead về phiên bắt đầu muộn hơn, không đếm hai lần', () => {
  const som = phien('tt-som', 'TikTok', '2026-09-10T19:00:00', '2026-09-10T22:00:00');
  const muon = phien('tt-muon', 'TikTok', '2026-09-10T20:00:00', '2026-09-10T21:00:00');
  const kq = TL.gan({
    lives: [som, muon],
    leads: [lead('LU1', 'TikTok', '2026-09-10T20:30:00')],
    dons: [], duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-muon').soLead, 1);
  assert.strictEqual(kq.get('tt-som').soLead, 0);
});

t('phiên không có gì thì cả bốn cột ra 0, vẫn có mặt trong kết quả', () => {
  const kq = TL.gan({ lives: [P], leads: [], dons: [] });
  assert.deepStrictEqual(
    { ...kq.get('tt-1'), maLead: undefined },
    { soTinNhan: 0, soLead: 0, soDon: 0, doanhThu: 0, maLead: undefined },
  );
});

t('lead không có nhãn nền tảng thì không gắn vào đâu cả', () => {
  const kq = TL.gan({
    lives: [P], leads: [lead('LU1', '', '2026-09-10T20:30:00')], dons: [], duoiPhut: 120,
  });
  assert.strictEqual(kq.get('tt-1').soLead, 0);
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
