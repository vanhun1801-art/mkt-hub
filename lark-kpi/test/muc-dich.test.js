'use strict';
/**
 * LƯỢT XEM TÁCH THEO MỤC ĐÍCH VÀ THEO NGƯỜI ĐĂNG — `node test/muc-dich.test.js`.
 *
 * Anh Hùng 18/10/2026: *"view thì để tính kết quả KPI sẽ là tính view của video
 * bán hàng hay video tương tác. Tương tự vậy luôn thì từng bạn sẽ có tên trong
 * social, nên em tính theo từng bạn."*
 *
 * VÌ SAO QUAN TRỌNG, bằng số thật của tháng 10/2026 trên trang Rooty Trip:
 *
 *   view thô      Ngọc 123.354  ·  Hằng  74.821   → Ngọc dẫn
 *   view quy đổi  Ngọc  31.495  ·  Hằng  62.577   → Hằng dẫn, gấp đôi
 *
 * Vì Ngọc đăng 27 bài tương tác / 6 bài bán hàng, còn Hằng 4 / 7. Gộp chung
 * rồi chấm là chấm sai, và sai đúng về phía người đăng nhiều bài tương tác.
 *
 * Dựng một app Social giả rồi soi đúng con số mà lớp thu số liệu dựng ra.
 */
const assert = require('assert');
const http = require('http');

let so = 0;
/* Nhận cả hàm đồng bộ lẫn bất đồng bộ. Không `await` thì lỗi của phép thử bất
 * đồng bộ thoát ra ngoài thành uncaught, và nó in RA SAU dòng "đạt" — đọc lên
 * tưởng đã qua hết rồi mới hỏng ở đâu đó khác. */
const t = async (ten, fn) => {
  try { await fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

/* Sáu bài trên cùng một kênh. Cố ý trộn đủ bốn cảnh có thật:
 *   - bán hàng và tương tác của hai người khác nhau
 *   - một bài CHƯA GẮN NHÃN mục đích
 *   - một bài chưa gắn tên người đăng */
const BAI = [
  { platform: 'Facebook', channel: 'Trang A', poster: 'Võ Hằng', mucDich: 'Bán hàng', views: 100000, publishedAt: '2026-10-02T09:00:00+07:00' },
  { platform: 'Facebook', channel: 'Trang A', poster: 'Võ Hằng', mucDich: 'Tương tác', views: 50000, publishedAt: '2026-10-03T09:00:00+07:00' },
  { platform: 'Facebook', channel: 'Trang A', poster: 'Lý Thư Bạch', mucDich: 'Tương tác', views: 200000, publishedAt: '2026-10-04T09:00:00+07:00' },
  { platform: 'Facebook', channel: 'Trang A', poster: 'Lý Thư Bạch', mucDich: 'Bán hàng', views: 10000, publishedAt: '2026-10-05T09:00:00+07:00' },
  { platform: 'Facebook', channel: 'Trang A', poster: 'Võ Hằng', mucDich: '', views: 70000, publishedAt: '2026-10-06T09:00:00+07:00' },
  { platform: 'Facebook', channel: 'Trang A', poster: '', mucDich: 'Bán hàng', views: 1000, publishedAt: '2026-10-07T09:00:00+07:00' },
];

const may = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const tra = (o) => {
    const b = Buffer.from(JSON.stringify(o));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': b.length });
    res.end(b);
  };
  if (p === '/api/bai') return tra({ bai: BAI });
  if (p === '/api/tong-quan') {
    return tra({ kenh: [{ platform: 'Facebook', name: 'Trang A', views: 431000, followUp: 300 }], live: [] });
  }
  if (p === '/api/tin-nhan') return tra({ rows: [], chuaNoi: [] });
  return tra({});
});

const K = 'FB|Trang A|Bài viết';
const cs = (ma, nguon) => ({ ma, ten: ma, mucTieu: 1, tyTrong: 1, nguon });
const LUAT = {
  heSo: { macDinh: { 'Bán hàng': 1, 'Tương tác': 0.2 }, theoNhom: {} },
  nhom: [
    { kenh: 'FB', tenKenh: 'Trang A', loai: 'Bài viết', tieuChi: [
      cs('view', K + '#view'),
      cs('viewBanHang', K + '#viewBanHang'),
      cs('viewTuongTac', K + '#viewTuongTac'),
      cs('viewQuyDoi', K + '#viewQuyDoi'),
    ] },
    { kenh: 'FB', tenKenh: 'Trang A', loai: 'Bài viết · hằng', tieuChi: [
      cs('view', K + '|hang#view'),
      cs('viewQuyDoi', K + '|hang#viewQuyDoi'),
      cs('baiBanHang', K + '|hang#baiBanHang'),
    ] },
    { kenh: 'FB', tenKenh: 'Trang A', loai: 'Bài viết · ngọc', tieuChi: [
      cs('view', K + '|ngoc#view'),
      cs('viewQuyDoi', K + '|ngoc#viewQuyDoi'),
    ] },
  ],
  nguoi: [],
};

(async () => {
  await new Promise((r) => may.listen(0, '127.0.0.1', r));
  const cong = may.address().port;
  process.env.KPI_URL_SOCIAL = 'http://127.0.0.1:' + cong;
  process.env.KPI_URL_ADS = 'http://127.0.0.1:' + cong;
  const nguon = require('../nguon');
  nguon.DIA_CHI.social = 'http://127.0.0.1:' + cong;
  nguon.DIA_CHI['quang-cao'] = 'http://127.0.0.1:' + cong;

  const r = await nguon.docTuApp('2026-10', LUAT);
  const s = r.soLieu;
  const ghiCua = (ma) => (r.nhatKy.find((x) => x.ma === ma) || {}).ghi || '';

  console.log('\nlượt xem tách theo mục đích');

  await t('view thô vẫn là tổng tất cả, kể cả bài chưa gắn nhãn', () => {
    assert.strictEqual(s[K + '#view'], 431000, '100k+50k+200k+10k+70k+1k');
  });

  await t('view bán hàng chỉ cộng bài Bán hàng', () => {
    assert.strictEqual(s[K + '#viewBanHang'], 111000, '100k + 10k + 1k');
  });

  await t('view tương tác chỉ cộng bài Tương tác', () => {
    assert.strictEqual(s[K + '#viewTuongTac'], 250000, '50k + 200k');
  });

  await t('view quy đổi nhân hệ số của BỘ LUẬT, không chép cứng', () => {
    /* 111.000 × 1,0 + 250.000 × 0,2 = 161.000. Bài chưa gắn nhãn (70k) không
       vào — đoán bừa là trừ oan 80% hoặc cho không, cả hai đều sai. */
    assert.strictEqual(s[K + '#viewQuyDoi'], 161000);
  });

  await t('đổi hệ số trong bộ luật thì con số đổi theo', async () => {
    const luat2 = JSON.parse(JSON.stringify(LUAT));
    luat2.heSo.macDinh['Tương tác'] = 0.5;
    const r2 = await nguon.docTuApp('2026-10', luat2);
    assert.strictEqual(r2.soLieu[K + '#viewQuyDoi'], 111000 + 250000 * 0.5);
  });

  await t('bài chưa gắn nhãn thì PHẢI kêu, kèm số lượng', () => {
    const g = ghiCua(K + '#viewQuyDoi');
    assert.match(g, /1\/6 bài chưa gắn nhãn/, 'ghi chú hiện tại: ' + g);
  });

  await t('view thô chỉ thẳng sang chỉ số đã quy đổi', () => {
    assert.match(ghiCua(K + '#view'), /viewQuyDoi/);
  });

  console.log('\ntách theo người đăng');

  await t('mỗi người chỉ ăn bài mang tên mình', () => {
    assert.strictEqual(s[K + '|hang#view'], 220000, '100k + 50k + 70k');
    assert.strictEqual(s[K + '|ngoc#view'], 210000, '200k + 10k');
  });

  await t('bài chưa gắn tên không vào của ai', () => {
    const tong = s[K + '|hang#view'] + s[K + '|ngoc#view'];
    assert.strictEqual(s[K + '#view'] - tong, 1000, 'đúng bằng bài chưa gắn tên');
  });

  await t('quy đổi theo người lật ngược thứ hạng so với view thô', () => {
    /* Chính cảnh anh Hùng chỉ ra. Hằng: 100k×1 + 50k×0,2 = 110k.
       Ngọc: 10k×1 + 200k×0,2 = 50k. View thô thì Ngọc 210k, Hằng 220k — sát
       nhau; quy đổi thì Hằng gấp hơn hai lần. */
    assert.strictEqual(s[K + '|hang#viewQuyDoi'], 110000);
    assert.strictEqual(s[K + '|ngoc#viewQuyDoi'], 50000);
    assert.ok(s[K + '|hang#viewQuyDoi'] > s[K + '|ngoc#viewQuyDoi'] * 2);
  });

  await t('đếm được số bài bán hàng của từng người', () => {
    assert.strictEqual(s[K + '|hang#baiBanHang'], 1);
  });

  may.close();
  console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
