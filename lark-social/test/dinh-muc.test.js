'use strict';
/* Test thuần Node: `node test/dinh-muc.test.js`. Không mạng, không đụng Base. */
const assert = require('assert');
const dm = require('../dinh-muc');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

/* Đúng 11 kênh đang có trên Base Social ngày 07/11/2026. */
const kenh = (platform, name, handle, extId) => ({ platform, name, handle, extId });
const KENH = [
  kenh('TikTok', 'Rooty Trip Phú Quốc', 'rootytrip.official', 'tt1'),
  kenh('TikTok', 'Rooty Trip Phú Quốc 2', 'rooty.trip.phu.quoc', 'tt2'),
  kenh('TikTok', 'Phú Quốc Không Phanh', 'phuquockhongphanh2025', 'tt3'),
  kenh('TikTok', 'Cuộc sống tại Phú Quốc', 'lifeinphuquocvn', 'tt4'),
  kenh('TikTok', 'Đi Phú Quốc cùng HDV vui tánh', 'i.ph.quc.cng.hdv', 'tt5'),
  kenh('TikTok', 'Vi Vu Phú Quốc', 'vivuphuquoc68', 'tt6'),
  kenh('Facebook', 'Rooty Trip Phú Quốc', 'rootytripphuquoc', 'fb1'),
  kenh('Facebook', 'Rooty MICE Phú Quốc', 'rootytrip1', 'fb2'),
  kenh('Facebook', 'Tour Đảo Rooty Trip Phú Quốc', 'followphuquoc', 'fb3'),
  kenh('Instagram', 'Rooty Trip Phú Quốc', 'rootytrip', 'ig1'),
  kenh('Zalo OA', 'Rooty Trip Phú Quốc', '', 'za1'),
];
const ghep = (ten) => { const c = dm.ghepKenh(ten, KENH); return c && c.extId; };

console.log('\nđịnh mức — ghép tên gõ tay sang kênh');

t('chín tên trong bảng định mức về đúng kênh', () => {
  assert.strictEqual(ghep('FB Rooty Trip '), 'fb1');
  assert.strictEqual(ghep('Tiktok Rooty Trip'), 'tt1');
  assert.strictEqual(ghep('FB Tour đảo'), 'fb3');
  assert.strictEqual(ghep('Tiktok Cuộc sống tại Phú Quốc'), 'tt4');
  assert.strictEqual(ghep('Tiktok Phú Quốc không phanh'), 'tt3');
  assert.strictEqual(ghep('Tiktok Vi vu'), 'tt6');
  assert.strictEqual(ghep('Tiktok Rooty Trip 2'), 'tt2');
  assert.strictEqual(ghep('Tiktok HDV vui tánh'), 'tt5');
  assert.strictEqual(ghep('Instagram'), 'ig1');
});

t('"Rooty Trip" không lạc sang kênh "Rooty Trip 2" hay kênh Tour Đảo', () => {
  /* Cả ba kênh đều chứa "rooty trip" — chọn kênh thừa ít chữ nhất. */
  assert.strictEqual(ghep('TikTok Rooty Trip'), 'tt1');
  assert.strictEqual(ghep('Facebook Rooty Trip'), 'fb1');
});

t('không đúng nền tảng thì không ghép chéo', () => {
  assert.strictEqual(ghep('Tiktok Tour đảo'), null);
  assert.strictEqual(ghep('Youtube Rooty Trip'), null);
});

t('không chắc thì trả rỗng, không đoán', () => {
  assert.strictEqual(ghep('Tiktok'), null);              // sáu kênh TikTok, không biết kênh nào
  assert.strictEqual(ghep('Tiktok Phú Quốc mới toanh'), null);
});

console.log('\nđịnh mức — đọc ô số');

t('ô chữ có số và câu chữ', () => {
  assert.deepStrictEqual(dm.docSo('120'), { so: 120, ghiChu: '' });
  assert.deepStrictEqual(dm.docSo(' 1.200 '), { so: 1200, ghiChu: '' });
  assert.deepStrictEqual(dm.docSo('Không thể đảm bảo số lượng'), { so: null, ghiChu: 'Không thể đảm bảo số lượng' });
  assert.deepStrictEqual(dm.docSo(''), { so: null, ghiChu: '' });
});

console.log('\nđịnh mức — tiến độ');

const bai = (extId, date) => ({ channelExtId: extId, date });
const BANG = [
  { ten: 'FB Rooty Trip', so: 120, ghiChu: '' },
  { ten: 'Tiktok Vi vu', so: 15, ghiChu: '' },
  { ten: 'Tiktok HDV vui tánh', so: null, ghiChu: 'Không thể đảm bảo số lượng' },
];

t('nhịp rải đều theo ngày, chỉ đếm bài trong tháng', () => {
  const posts = [
    ...Array.from({ length: 26 }, () => bai('fb1', '2026-11-03')),
    bai('fb1', '2026-10-31'),                            // tháng trước, không tính
    ...Array.from({ length: 4 }, () => bai('tt6', '2026-11-05')),
  ];
  const kq = dm.tinh({ bang: BANG, channels: KENH, posts, thang: '2026-11', homNay: '2026-11-07' });
  assert.strictEqual(kq.soNgay, 30);
  assert.strictEqual(kq.ngayQua, 7);
  const [fb, vv, hdv] = kq.dong;
  assert.strictEqual(fb.da, 26);
  assert.strictEqual(fb.canDat, 28);                    // 120 × 7/30
  assert.strictEqual(fb.trangThai, 'cham');
  assert.strictEqual(fb.conThieu, 94);
  assert.ok(Math.abs(fb.moiNgay - 94 / 23) < 1e-9);
  assert.strictEqual(vv.trangThai, 'kip');              // 4 ≥ round(15 × 7/30) = 4
  assert.strictEqual(hdv.trangThai, 'khong-so');
  assert.strictEqual(hdv.ghiChu, 'Không thể đảm bảo số lượng');
});

t('tháng đã qua: chưa đủ là thiếu, đủ là đạt', () => {
  const posts = [
    ...Array.from({ length: 124 }, () => bai('fb1', '2026-10-10')),
    ...Array.from({ length: 7 }, () => bai('tt6', '2026-10-10')),
  ];
  const kq = dm.tinh({ bang: BANG, channels: KENH, posts, thang: '2026-10', homNay: '2026-11-07' });
  assert.strictEqual(kq.daHet, true);
  assert.strictEqual(kq.dong[0].trangThai, 'dat');
  assert.strictEqual(kq.dong[1].trangThai, 'thieu');
  assert.strictEqual(kq.dong[1].canDat, 15);
});

t('tháng Hai và tháng 31 ngày', () => {
  assert.strictEqual(dm.soNgayThang('2027-02'), 28);
  assert.strictEqual(dm.soNgayThang('2026-12'), 31);
});

t('ô Kênh đã liên kết thì theo liên kết, không đoán theo tên', () => {
  const kenh = KENH.map((k, i) => ({ ...k, id: 'rec' + i }));
  const vv = kenh.find((k) => k.extId === 'tt6');
  const kq = dm.tinh({
    bang: [{ ten: 'FB Rooty Trip', kenhId: vv.id, so: 15, ghiChu: '' }],
    channels: kenh, posts: [bai('tt6', '2026-11-02')], thang: '2026-11', homNay: '2026-11-07',
  });
  assert.strictEqual(kq.dong[0].kenh.extId, 'tt6');
  assert.strictEqual(kq.dong[0].da, 1);
});

console.log('\n' + so + ' phép thử định mức đã qua');
