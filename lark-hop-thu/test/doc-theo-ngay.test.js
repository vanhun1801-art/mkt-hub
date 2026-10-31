'use strict';
/* Đọc thư mục theo SỐ NGÀY chứ không theo số thư (31/10/2026: 60 thư Đã gửi
 * của sales@ chỉ phủ 9 ngày). Lớp Lark Mail giả, không đụng thư thật. */
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.HOP_THU_DU_LIEU = fs.mkdtempSync(path.join(os.tmpdir(), 'hop-thu-ngay-'));

const pad = (n) => String(n).padStart(2, '0');
/* Ngày giờ Việt Nam của "cách đây h giờ", khuôn "YYYY-MM-DD HH:MM". */
const luc = (h) => { const d = new Date(Date.now() - h * 3600e3 + 7 * 3600e3); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };

/* Hộp đông: 10 thư mỗi ngày, 90 ngày. Hộp vắng: 5 thư. */
const HOP = {
  'dong@x': Array.from({ length: 900 }, (_, i) => ({ hop: 'dong@x', id: 'd' + i, ngay: luc(i * 2.4) })),
  'vang@x': Array.from({ length: 5 }, (_, i) => ({ hop: 'vang@x', id: 'v' + i, ngay: luc(i * 240) })),
};
const goi = [];
const gia = {
  danhSach: async (hop, max) => { goi.push([hop, max]); return HOP[hop].slice(0, max); },
};
require.cache[require.resolve('../thu')] = { id: 'thu', filename: require.resolve('../thu'), loaded: true, exports: gia };
const { docTheoNgay } = require('../server');

let pass = 0, fail = 0;
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

(async () => {
  const a = await docTheoNgay('dong@x', 'SENT', { dau: 60, ngay: 30, tran: 600 }, '');
  ok('hộp đông: đọc sâu thêm tới khi phủ đủ 30 ngày', a.du && a.ds.length > 300, a.ds.length + ' thư');
  ok('hộp đông: không đọc quá trần', goi.every(([, m]) => m <= 600), JSON.stringify(goi));

  goi.length = 0;
  const b = await docTheoNgay('dong@x', 'SENT', { dau: 60, ngay: 30, tran: 150 }, '');
  ok('chạm trần mà chưa đủ ngày thì báo chưa đủ', !b.du && b.ds.length === 150 && b.cu, JSON.stringify({ du: b.du, n: b.ds.length }));

  goi.length = 0;
  const c = await docTheoNgay('vang@x', 'SENT', { dau: 60, ngay: 30, tran: 600 }, '');
  ok('hộp vắng: đọc một lần là hết thư mục, coi như đủ', c.du && goi.length === 1 && c.ds.length === 5);

  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
