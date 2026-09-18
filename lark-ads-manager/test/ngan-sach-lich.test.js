/**
 * Hai quyết định anh Hùng chốt ngày 18/09/2026, và cái chắn cho chúng.
 *
 * 1. "Ngân sách dự kiến cho mỗi tháng." Bản trước so chi tiêu TOÀN THỜI GIAN với
 *    ô 6.000.000đ, ra 397%, 333%, 117%, 475% — với một ô nghĩa là "mỗi tháng"
 *    thì mấy con số đó vô nghĩa: chiến dịch chạy năm tháng thì đương nhiên vượt.
 *
 * 2. "Ngày kết thúc dựa vào tình trạng thực tế quảng cáo, chứ không phải dựa vào
 *    cái anh ghi, vì nó không thực tế, không cập nhật theo thời gian thực."
 *    Đo đúng vậy: cả hai chiến dịch Facebook đều KHÔNG đặt ngày kết thúc, trong
 *    khi Base khai 31/08 — nguồn của sáu cảnh báo bịa.
 */
const M = require('../metrics');
const dc = require('../sync/doichieu');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const NGUONG = {
  cpa: { default: 25000 }, minSpendJudge: 300000, budgetWarnPct: 80,
  ctrMin: 1, dataLagDays: 2, spendSpikePct: 50,
};

/* Dựng dữ liệu quanh NGÀY HÔM NAY, vì luật ngân sách bám tháng đang chạy. */
const homNay = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const thangNay = homNay.slice(0, 8);
const thangTruoc = (() => {
  const d = new Date(homNay + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 8);
})();

function duLieu({ chiThangNay = 0, chiThangTruoc = 0, budget = 6000000 } = {}) {
  const daily = [];
  if (chiThangNay) {
    daily.push({ id: 'd1', date: thangNay + '01', adId: 'a1', campaignId: 'c1', groupId: 'g1',
      platform: 'Facebook', spend: chiThangNay, impressions: 5000, clicks: 100, conversions: 20 });
  }
  if (chiThangTruoc) {
    daily.push({ id: 'd0', date: thangTruoc + '15', adId: 'a1', campaignId: 'c1', groupId: 'g1',
      platform: 'Facebook', spend: chiThangTruoc, impressions: 5000, clicks: 100, conversions: 20 });
  }
  return {
    campaigns: [{ id: 'c1', name: 'CD thử', platform: 'Facebook', status: 'Đang chạy',
      budget, dailyBudget: 0, start: null, end: null }],
    groups: [{ id: 'g1', name: 'Nhóm', campaignId: 'c1' }],
    ads: [{ id: 'a1', name: 'QC', groupId: 'g1', campaignId: 'c1', campaignName: 'CD thử',
      platform: 'Facebook', approval: 'Đã duyệt', campaignStatus: 'Đang chạy', groupStatus: 'Đang chạy' }],
    daily, sales: [], minDate: thangTruoc + '01', maxDate: homNay,
  };
}
const nganSach = (d) => M.alerts(d, NGUONG).filter((x) => x.kind === 'budget');

console.log('— ngân sách so theo THÁNG, không phải toàn thời gian');
{
  /* Chi tháng trước rất nhiều, tháng này chưa tiêu gì: KHÔNG được cảnh báo. Bản
   * cũ cộng dồn toàn thời gian nên dòng này sẽ kêu, và kêu oan mãi mãi vì quá
   * khứ không bao giờ nhỏ lại. */
  const cu = nganSach(duLieu({ chiThangTruoc: 50000000, chiThangNay: 0 }));
  t('chi nhiều ở tháng TRƯỚC thì không kêu', cu.length === 0,
    JSON.stringify(cu.map((x) => x.title)));

  const vuot = nganSach(duLieu({ chiThangNay: 9000000 }));
  t('vượt ngân sách THÁNG thì kêu', vuot.some((x) => /Vượt ngân sách tháng/.test(x.title)),
    JSON.stringify(vuot.map((x) => x.title)));
  const v = vuot.find((x) => /Vượt ngân sách tháng/.test(x.title)) || {};
  t('nói rõ đang so trong tháng nào', /trong tháng \d{2}\/\d{4}/.test(v.detail || ''), v.detail);
  t('gọi đúng tên ô: ngân sách tháng', /ngân sách tháng khai trong Base/.test(v.detail || ''));
  t('vẫn nói rõ đây không phải giới hạn nền tảng',
    /không phải giới hạn trên nền tảng/.test(v.detail || ''));
  t('mức nghiêm trọng', v.level === 'high', v.level);
}

console.log('— luật NHỊP tiêu, kiểm được mọi ngày trong tháng');
{
  /* Tách thành hàm thuần vì nhánh này chỉ chạy ở ĐẦU tháng: ngày 18/30 thì nhịp
   * đều đã là 60%, muốn vượt 1,5 lần phải tiêu 90% — mà 90% thì ngưỡng 80% kêu
   * trước rồi. Để trong alerts() thì bộ test chỉ chạy được nửa tháng, mà phép
   * kiểm chỉ chạy được nửa tháng thì coi như không có. */
  const n = M.nhipNganSach;

  const dau = n(1200000, 6000000, 3, 30);
  t('ngày 3/30 tiêu 20% = nhanh gấp đôi nhịp', Math.round(dau.vuotNhip * 100) === 200,
    String(dau.vuotNhip));
  t('và chưa chạm ngưỡng 80%', dau.pct < 80, String(dau.pct));

  const deu = n(3000000, 6000000, 15, 30);
  t('nửa tháng tiêu nửa ngân sách = đúng nhịp', Math.round(deu.vuotNhip * 100) === 100);

  const cham = n(600000, 6000000, 15, 30);
  t('tiêu chậm thì vượt nhịp < 1', cham.vuotNhip < 1, String(cham.vuotNhip));

  /* Ca thật đo được hôm nay trên chiến dịch Daily_Tour Đảo. */
  const that = n(8533839, 6000000, 18, 30);
  t('ca thật: 8,5tr/6tr ngày 18/30 = 2,37 lần nhịp',
    Math.round(that.vuotNhip * 100) === 237, String(that.vuotNhip));

  /* Chia cho 0 phải ra 0, không ra Infinity — Infinity lọt lên màn hình là một
   * con số không ai đọc được. */
  t('ngân sách 0 thì không nổ, không ra Infinity', n(100, 0, 5, 30).vuotNhip === 0);
  t('tháng 0 ngày cũng vậy', n(100, 6000000, 5, 0).vuotNhip === 0);
  t('ngày 0 thì nhịp 0, vượt 0', n(100, 6000000, 0, 30).vuotNhip === 0);
}

console.log('— KHÔNG còn cảnh báo lịch chạy dựng từ ô trong Base');
{
  const d = duLieu({ chiThangNay: 1000000 });
  d.campaigns[0].end = '2020-01-01';         // ô Base khai đã kết thúc từ lâu
  d.campaigns[0].start = '2099-01-01';       // và khai chưa tới ngày bắt đầu
  const a = M.alerts(d, NGUONG);
  t('không đẻ cảnh báo "quá ngày kết thúc"',
    !a.some((x) => /quá ngày kết thúc/i.test(x.title)), JSON.stringify(a.map((x) => x.title)));
  t('không đẻ cảnh báo "chưa tới ngày bắt đầu"',
    !a.some((x) => /chưa tới ngày bắt đầu/i.test(x.title)));
  t('cũng không còn nhóm schedule', !a.some((x) => x.kind === 'schedule'));
}

console.log('— đối chiếu: so ô Base với tình trạng THẬT');
{
  const HOM_NAY = '2026-09-18';

  /* Ca thật đã đo: Base khai 31/08, Facebook KHÔNG đặt ngày kết thúc. */
  const l1 = dc.soLech(
    { trangThai: 'Đang chạy', ketThuc: '2026-08-31' },
    { trangThaiThat: 'ACTIVE', ketThuc: '' }, HOM_NAY);
  t('bắt được Base khai ngày mà nền tảng không đặt',
    l1.some((x) => x.o === 'Ngày kết thúc' && x.that === 'không đặt'), JSON.stringify(l1));
  t('và nói rõ nền tảng chạy vô thời hạn',
    l1.some((x) => /vô thời hạn/.test(x.y)));

  /* CHƯA HỎI ĐƯỢC (null) KHÁC "không đặt" ('') — lẫn hai cái là lại bịa ra một
   * cảnh báo từ chỗ mình không biết, đúng cái sai vừa bỏ đi. */
  const l2 = dc.soLech(
    { trangThai: 'Đang chạy', ketThuc: '2026-08-31' },
    { trangThaiThat: 'đang chạy', ketThuc: null }, HOM_NAY);
  t('chưa hỏi được ngày thì KHÔNG kết luận gì về ngày',
    !l2.some((x) => x.o === 'Ngày kết thúc'), JSON.stringify(l2));

  /* Nền tảng khai kết thúc trong quá khứ mà vẫn chạy — cảnh báo THẬT, vì nó dựa
   * trên nền tảng chứ không dựa trên ô gõ tay. */
  const l3 = dc.soLech(
    { trangThai: 'Đang chạy', ketThuc: '' },
    { trangThaiThat: 'ACTIVE', ketThuc: '2026-09-01' }, HOM_NAY);
  t('nền tảng hết lịch mà vẫn chạy thì kêu',
    l3.some((x) => x.o === 'Lịch chạy'), JSON.stringify(l3));

  /* Trạng thái lệch nhau. */
  const l4 = dc.soLech(
    { trangThai: 'Tạm dừng', ketThuc: '' },
    { trangThaiThat: 'ACTIVE', ketThuc: '' }, HOM_NAY);
  t('Base ghi tạm dừng mà nền tảng đang chạy thì kêu',
    l4.some((x) => x.o === 'Trạng thái'), JSON.stringify(l4));

  /* Khớp nhau thì im. Một khối đối chiếu mà lúc nào cũng kêu thì vài hôm không
   * ai đọc nữa. */
  const l5 = dc.soLech(
    { trangThai: 'Đang chạy', ketThuc: '' },
    { trangThaiThat: 'ACTIVE', ketThuc: '' }, HOM_NAY);
  t('khớp nhau thì không kêu gì', l5.length === 0, JSON.stringify(l5));
}

console.log('— Google: mốc 2037 là "không đặt", không phải một ngày thật');
{
  const fs = require('fs');
  const path = require('path');
  const g = fs.readFileSync(path.join(__dirname, '..', 'sync', 'gads.js'), 'utf8');
  /* Google luôn trả end_date; không đặt thì nó là 2037-12-30. Để nguyên thì app
   * đi so một ngày năm 2037 với hôm nay rồi kết luận nhảm. */
  t('có xử lý mốc vô hạn của Google', /2037/.test(g));
  t('quy về chuỗi rỗng cho khớp quy ước Meta', /het >= '2037-01-01'\) \? '' : het/.test(g));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
