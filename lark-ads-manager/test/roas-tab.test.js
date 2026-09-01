/**
 * Test công thức ROAS của bốn ô số ở đầu tab Doanh thu.
 *
 * Vì sao có bộ này: anh Hùng bắt được ROAS hiện **174,93×**. Công thức cũ lấy
 * TOÀN BỘ doanh thu công ty chia cho chi tiêu quảng cáo. Đo ra: 8.916.706.200đ
 * doanh thu, trong đó 8.596.173.200đ — **96,4%** — thuộc kênh "Khác" (lữ hành,
 * khách cũ, gọi trực tiếp), không liên quan gì tới quảng cáo nhưng vẫn nằm trong
 * TỬ SỐ.
 *
 * Lỗi này nằm im từ đầu vì bảng Base rỗng nên mọi số đều 0. Ghi dữ liệu thật vào
 * là lộ ngay — và đó là lý do phải có test cho công thức, không phải chỉ cho code.
 *
 * Lỗi thứ hai, ở MẪU SỐ: chi tiêu chỉ cộng những kênh CÓ ĐƠN. Google Ads tiêu
 * 3.832.963đ mà không ghi công được đơn nào nên không sinh dòng, và biến khỏi mẫu
 * số — làm ROAS bị tô hồng.
 */
const cfg = require('../config');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

/* Bản sao công thức đúng, viết lại ở đây theo ĐÚNG cách server.js làm. Nếu hai bên
 * trôi xa nhau thì các phép kiểm cấu trúc ở cuối file sẽ bắt được. */
const laQuangCao = (k) => cfg.platforms.includes(String(k || '').trim());
function tinh(byChannel, spendByChannel) {
  const tuQC = byChannel.filter((c) => laQuangCao(c.channel));
  const ngoaiQC = byChannel.filter((c) => !laQuangCao(c.channel));
  const chiQC = cfg.platforms.reduce((a, k) => a + (spendByChannel[k] || 0), 0);
  const dtQC = tuQC.reduce((a, c) => a + c.revenue, 0);
  const dtNgoai = ngoaiQC.reduce((a, c) => a + c.revenue, 0);
  return {
    dtCongTy: dtQC + dtNgoai, dtTuQuangCao: dtQC, dtNgoaiQuangCao: dtNgoai,
    chiQuangCao: chiQC,
    roas: chiQC > 0 ? Math.round((dtQC / chiQC) * 100) / 100 : null,
  };
}

console.log('— ĐÚNG ca đã sai: số thật ngày 01/09/2026');
const BC = [
  { channel: 'Khác', orders: 688, revenue: 8596173200 },
  { channel: 'Facebook', orders: 27, revenue: 232161000 },
  { channel: 'TikTok', orders: 8, revenue: 88372000 },
];
const CHI = { Facebook: 25025955, TikTok: 25945846, 'Google Ads': 3832963 };
const r = tinh(BC, CHI);

t('doanh thu công ty vẫn đủ', r.dtCongTy === 8916706200, String(r.dtCongTy));
t('doanh thu TỪ QUẢNG CÁO chỉ 320.533.000đ', r.dtTuQuangCao === 320533000, String(r.dtTuQuangCao));
t('phần ngoài quảng cáo được tách ra', r.dtNgoaiQuangCao === 8596173200, String(r.dtNgoaiQuangCao));
t('MẪU SỐ có cả Google Ads dù kênh đó không có đơn nào',
  r.chiQuangCao === 54804764, String(r.chiQuangCao));
t('ROAS ra 5,85× chứ KHÔNG phải 174,93×', r.roas === 5.85, String(r.roas));
t('và chắc chắn không còn con số vô lý đó', r.roas < 20, String(r.roas));

console.log('— kênh không phải quảng cáo KHÔNG được có ROAS');
/* Bản trước hiện "0×" cho dòng Khác — đọc như thể kênh đó hiệu quả bằng không,
 * trong khi thật ra nó không có chi tiêu quảng cáo nào để mà chia. */
const dongKhac = BC.find((c) => c.channel === 'Khác');
t('"Khác" không phải kênh quảng cáo', laQuangCao(dongKhac.channel) === false);
t('ô trống cũng không phải kênh quảng cáo', laQuangCao('') === false && laQuangCao(null) === false);
t('ba kênh thật thì có', ['Facebook', 'TikTok', 'Google Ads'].every(laQuangCao));
t('danh sách kênh lấy từ config, không gõ tay lại',
  cfg.platforms.length === 3, JSON.stringify(cfg.platforms));

console.log('— các ca biên');
t('không có đơn quảng cáo nào → ROAS 0, không phải null',
  tinh([{ channel: 'Khác', orders: 5, revenue: 1e9 }], CHI).roas === 0);
t('không chi đồng nào → ROAS null, KHÔNG chia cho 0',
  tinh(BC, {}).roas === null);
t('bảng rỗng → mọi số 0, không nổ',
  tinh([], {}).dtCongTy === 0 && tinh([], {}).roas === null);
t('chỉ có quảng cáo, không có Khác → dtCongTy = dtTuQuangCao',
  (() => { const x = tinh([{ channel: 'Facebook', orders: 1, revenue: 5e6 }], { Facebook: 1e6 });
    return x.dtCongTy === x.dtTuQuangCao && x.roas === 5; })());

console.log('— server.js phải dùng đúng công thức này, không có bản thứ hai');
const src = require('fs').readFileSync(require.resolve('../server.js'), 'utf8');
t('có tách laQuangCao', /const laQuangCao = \(k\) => cfg\.platforms\.includes/.test(src));
t('mẫu số cộng theo cfg.platforms, không theo kênh có đơn',
  /cfg\.platforms\.reduce\(\(a, k\) => a \+ \(spendByChannel\[k\] \|\| 0\), 0\)/.test(src));
t('trả ra khối `tong` để giao diện không tự cộng', /tong: \{/.test(src));
t('ROAS chỉ chia dtQC', /roas: chiQC > 0 \? Math\.round\(\(dtQC \/ chiQC\)/.test(src));
t('kênh ngoài quảng cáo trả roas null', /roas: qc && spend > 0 \?/.test(src));

const ui = require('fs').readFileSync(require.resolve('../public/app.js'), 'utf8');
t('giao diện dùng T.dtTuQuangCao, KHÔNG tự cộng byChannel',
  ui.includes('T.dtTuQuangCao') && !ui.includes("d.byChannel.reduce((s, c) => s + c.revenue"));
t('ô thứ tư hiện doanh thu toàn công ty riêng', ui.includes('Doanh thu toàn công ty'));
t('dòng không từ quảng cáo hiện chữ, không hiện 0×',
  ui.includes('không từ quảng cáo'));

console.log('— metrics.overview: thẻ ở Tổng quan chung của hub đọc từ đây');
/* Hub không tự tính ROAS — nó hỏi /api/overview của module này. Nên thẻ "Quản lý
 * quảng cáo" hiện 162,63x là do metrics.js, và sửa ở đây thì cả hai chỗ cùng đúng. */
{
  const M = require('../metrics');
  const data = {
    daily: [
      { date: '2026-08-10', platform: 'Facebook', adId: 'a1', spend: 25025955, impressions: 100, clicks: 10, conversions: 5 },
      { date: '2026-08-10', platform: 'TikTok', adId: 'a2', spend: 25945846, impressions: 100, clicks: 10, conversions: 5 },
      { date: '2026-08-10', platform: 'Google Ads', adId: 'a3', spend: 3832963, impressions: 100, clicks: 10, conversions: 0 },
    ],
    sales: [
      { date: '2026-08-11', channel: 'Facebook', status: 'Đã chốt', revenue: 232161000 },
      { date: '2026-08-11', channel: 'TikTok', status: 'Đã chốt', revenue: 88372000 },
      // 8,6 tỷ của kênh Khác: doanh thu công ty, KHÔNG phải doanh thu quảng cáo
      { date: '2026-08-11', channel: 'Khác', status: 'Đã chốt', revenue: 8596173200 },
    ],
    campaigns: [], groups: [], ads: [],
    // alerts() cần maxDate để tính cửa sổ 7 ngày gần nhất
    maxDate: '2026-08-31', minDate: '2026-08-01',
  };
  const ov = M.overview(data, { from: '2026-08-01', to: '2026-08-31' });
  const k = ov.kpi;
  t('doanh thu TỪ QUẢNG CÁO không gồm kênh Khác', k.revenue === 320533000, String(k.revenue));
  t('doanh thu toàn công ty vẫn trả riêng', k.revenueCongTy === 8916706200, String(k.revenueCongTy));
  t('phần ngoài quảng cáo tách đúng', k.revenueNgoaiQuangCao === 8596173200, String(k.revenueNgoaiQuangCao));
  t('ROAS 5,85x chu KHONG phai 162,63x', k.roas === 5.85, String(k.roas));
  t('mẫu số có cả Google Ads dù kênh đó 0 đơn', k.spend === 54804764, String(k.spend));
  t('tỷ lệ từ quảng cáo tính ra được', k.tyLeTuQuangCao === 3.59, String(k.tyLeTuQuangCao));

  const ov2 = M.overview({ ...data, sales: [data.sales[2]] }, { from: '2026-08-01', to: '2026-08-31' });
  t('chỉ có kênh Khác thì ROAS 0, không phải số to', ov2.kpi.roas === 0, String(ov2.kpi.roas));
}

console.log('— thẻ hub: bỏ CTR, thêm Doanh thu từ QC');
{
  const path = require('path');
  const kpiSrc = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'lark-mkt-hub', 'kpi.js'), 'utf8');
  const i2 = kpiSrc.indexOf('async function quangCao(');
  const khoi = kpiSrc.slice(i2, kpiSrc.indexOf('const nhom', i2));
  t('có ô Doanh thu từ QC', khoi.includes("nhan: 'Doanh thu từ QC'"));
  t('ô đó dùng k.revenue (đã là doanh thu quảng cáo)', khoi.includes('so: k.revenue'));
  t('bỏ CTR khỏi bảng tổng quan', !khoi.includes("nhan: 'CTR'"));
  t('vẫn giữ Chi tiêu, ROAS, CPA, Cảnh báo',
    ["'Chi tiêu'", "'ROAS'", "'CPA'", "'Cảnh báo'"].every((x) => khoi.includes(x)));
  t('đúng sáu ô, không nhiều hơn', (khoi.match(/nhan: '/g) || []).length === 6,
    String((khoi.match(/nhan: '/g) || []).length));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
