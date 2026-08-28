'use strict';
/**
 * Kiểm thử tầng đồng bộ. Chỉ ĐỌC Base + xem trước — không ghi gì.
 * Cần server đang chạy ở http://localhost:5176
 */
const csv = require('../sync/csv');
const ketnoi = require('../sync/ketnoi');
const meta = require('../sync/meta');
const gsheet = require('../sync/gsheet');
const store = require('../store');
const reconcile = require('../sync/reconcile');

const B = process.env.APP_URL || 'http://localhost:5176';
let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};
const get = async (p) => { const r = await fetch(B + p); return { s: r.status, j: await r.json().catch(() => null) }; };
const post = async (p, b) => {
  const r = await fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (_) {}
  return { s: r.status, j, txt };
};

(async () => {
  console.log('— đọc số kiểu Việt / Anh');
  t('1.234.567 → 1234567', csv.parseNumber('1.234.567') === 1234567);
  t('1,234,567.89 → 1234567.89', csv.parseNumber('1,234,567.89') === 1234567.89);
  t('1.234.567,89 → 1234567.89', csv.parseNumber('1.234.567,89') === 1234567.89);
  t('₫1.234 → 1234', csv.parseNumber('₫1.234') === 1234);
  t('0,44 → 0.44', csv.parseNumber('0,44') === 0.44);
  t('rỗng → 0', csv.parseNumber('') === 0 && csv.parseNumber('--') === 0);

  console.log('— đọc ngày');
  t('27/08/2026', csv.parseDate('27/08/2026') === '2026-08-27');
  t('2026-08-27', csv.parseDate('2026-08-27') === '2026-08-27');
  t('20260827', csv.parseDate('20260827') === '2026-08-27');
  t('Aug 27, 2026 không lệch ngày', csv.parseDate('Aug 27, 2026') === '2026-08-27', csv.parseDate('Aug 27, 2026'));
  t('rác → rỗng', csv.parseDate('abc') === '');

  console.log('— nhận cột');
  const kv = [
    ['Số tiền đã chi tiêu (VND)', 'spend'], ['Amount spent (VND)', 'spend'], ['Cost', 'spend'],
    ['Tên quảng cáo', 'adName'], ['Ad name', 'adName'],
    ['Tên nhóm quảng cáo', 'groupName'], ['Ad set name', 'groupName'], ['Ad group', 'groupName'],
    ['Clicks (all)', 'clicks'], ['Lượt click', 'clicks'],
    ['Cuộc hội thoại qua tin nhắn đã bắt đầu', 'conversions'], ['Results', 'conversions'],
    ['Lượt hiển thị', 'impressions'], ['Impr.', 'impressions'],
    ['Ngày', 'date'], ['Day', 'date'], ['Ad ID', 'adExtId'],
  ];
  kv.forEach(([h, k]) => t(`"${h}" → ${k}`, csv.lookup(h) === k, String(csv.lookup(h))));
  t('cột lạ → null', csv.lookup('Tổng thu nhập ròng ABC') === null, String(csv.lookup('Tổng thu nhập ròng ABC')));

  console.log('— tách CSV có tiêu đề rác + dấu ngoặc kép');
  const raw = [
    '"Báo cáo hiệu suất"', '"Tài khoản: Rooty Trip"', '',
    'Ngày,Tên chiến dịch,Tên nhóm quảng cáo,Tên quảng cáo,"Số tiền đã chi tiêu (VND)",Lượt hiển thị,"Clicks (all)","Kết quả"',
    '27/08/2026,CD A,"Nhóm, có phẩy","QC ""trong ngoặc""","1.250.000",42.318,"1.204",41',
  ].join('\n');
  const parsed = csv.toRows(raw, { platform: 'Facebook', level: 'ad' });
  t('bỏ được 3 dòng tiêu đề rác', parsed.rows.length === 1, JSON.stringify(parsed.rows.length));
  t('tên có dấu phẩy trong ngoặc kép', parsed.rows[0].groupName === 'Nhóm, có phẩy', parsed.rows[0].groupName);
  t('ngoặc kép lồng', parsed.rows[0].adName === 'QC "trong ngoặc"', parsed.rows[0].adName);
  t('số + ngày đúng', parsed.rows[0].spend === 1250000 && parsed.rows[0].date === '2026-08-27');
  t('conversions từ cột "Kết quả"', parsed.rows[0].conversions === 41);

  console.log('— cấp adgroup gộp quảng cáo về nhóm');
  const g = csv.toRows('date,adgroup_id,adgroup_name,ad_id,ad_name,cost,impressions,clicks,conversions\n'
    + '2026-08-27,G1,Nhóm G,A1,QC 1,100,10,1,1\n2026-08-27,G1,Nhóm G,A2,QC 2,200,20,2,1',
    { platform: 'Google Ads', level: 'adgroup' });
  t('2 dòng cùng trỏ về nhóm G', g.rows.every((r) => r.adName === 'Nhóm G' && r.adExtId === 'G1'));

  console.log('— thiếu cột bắt buộc thì báo lỗi rõ');
  let err = '';
  try { csv.toRows('a,b,c\n1,2,3', { platform: 'Facebook' }); } catch (e) { err = e.message; }
  t('báo thiếu cột', /thiếu cột bắt buộc|không có cột nào/.test(err), err);

  console.log('— che token trong lỗi');
  const { scrub } = require('../sync/http');
  t('access_token bị che', !scrub('https://x/y?access_token=SECRET123&z=1').includes('SECRET123'));
  t('token trong JSON bị che', !scrub('{"access_token":"SECRET123"}').includes('SECRET123'));

  console.log('— che bí mật đã đăng ký (token nằm trần trong câu lỗi của Meta)');
  const { hideSecret: hs, scrub: sc } = require('../sync/http');
  const FAKE = 'EAAGtokenGiaLapDeKiemThu1234567890';
  hs(FAKE);
  t('token trần trong câu bị che',
    !sc('Malformed access token ' + FAKE).includes(FAKE),
    sc('Malformed access token ' + FAKE));
  t('vẫn giữ phần còn lại của câu', sc('Malformed access token ' + FAKE).includes('Malformed access token'));
  t('chuỗi ngắn không bị đăng ký nhầm', (hs('abc'), sc('abc def') === 'abc def'));

  console.log('— cấu hình kết nối không lộ bí mật');
  const st = ketnoi.status();
  t('có 3 kênh', st.providers.length === 3);
  t('không có trường accessToken', !JSON.stringify(st).includes('accessToken'));
  t('không lộ giá trị token', !JSON.stringify(st).toLowerCase().includes('eaa'));
  t('có cờ coToken', st.providers.every((p) => typeof p.coToken === 'boolean'));

  console.log('— chuẩn hoá link Google Sheet');
  t('link edit → export csv',
    gsheet.normalizeUrl('https://docs.google.com/spreadsheets/d/ABC123/edit#gid=77')
    === 'https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=77',
    gsheet.normalizeUrl('https://docs.google.com/spreadsheets/d/ABC123/edit#gid=77'));
  t('link pub?output=csv giữ nguyên',
    gsheet.normalizeUrl('https://docs.google.com/spreadsheets/d/e/XYZ/pub?output=csv').includes('output=csv'));

  console.log('— Meta: lấy đúng loại chuyển đổi');
  const row = { actions: [
    { action_type: 'link_click', value: '120' },
    { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '41' },
    { action_type: 'purchase', value: '3' },
  ] };
  t('lấy tin nhắn = 41', meta.conversionsOf(row, 'onsite_conversion.messaging_conversation_started_7d') === 41);
  t('lấy purchase = 3', meta.conversionsOf(row, 'purchase') === 3);
  t('lấy nhiều loại = 44', meta.conversionsOf(row, 'purchase,onsite_conversion.messaging_conversation_started_7d') === 44);
  t('loại không có = 0', meta.conversionsOf(row, 'lead') === 0);

  console.log('— đối chiếu: gắn đúng bản ghi cũ, không nhân đôi');
  const data = await store.get({ force: true });
  const camp = data.campaigns.find((c) => c.platform === 'Facebook');
  const ad = data.ads.find((a) => a.campaignId === camp.id);
  const grp = data.gMap[ad.groupId];
  const mk = (extra = {}) => ({
    platform: 'Facebook', date: '2026-08-27',
    campaignExtId: 'C_TEST', campaignName: camp.name,
    groupExtId: 'G_TEST', groupName: grp.name,
    adExtId: 'A_TEST', adName: ad.name,
    spend: 123456, impressions: 1000, clicks: 20, conversions: 2, ...extra,
  });
  const r1 = await reconcile.reconcile(data, [mk()], { dryRun: true, source: 'Meta API' });
  t('khớp 1 chiến dịch theo tên', r1.khop.chienDich.theoTen === 1, JSON.stringify(r1.khop.chienDich));
  t('khớp 1 quảng cáo theo tên', r1.khop.quangCao.theoTen === 1, JSON.stringify(r1.khop.quangCao));
  t('không tạo thực thể mới', !r1.seTao.chienDich.length && !r1.seTao.quangCao.length);
  t('có gắn ID nền tảng', r1.ganIdMoi.length >= 1, JSON.stringify(r1.ganIdMoi));
  t('xem trước không ghi', r1.daGhi === undefined && r1.dryRun === true);

  const r2 = await reconcile.reconcile(data, [mk({ campaignName: '__Không tồn tại__', groupName: '__x__', adName: '__y__' })],
    { dryRun: true, tuTaoMoi: false });
  t('không bật tự tạo ⇒ báo chưa ghép', r2.chuaGhep.chienDich.length === 1 && r2.chuaGhep.quangCao.length === 1);
  t('dòng số bị bỏ được đếm', r2.dongBoQua === 1, String(r2.dongBoQua));
  t('bảng ngày không ghi gì', r2.bangNgay.taoMoi === 0 && r2.bangNgay.capNhat === 0);

  const r3 = await reconcile.reconcile(data, [mk({ campaignName: '__Không tồn tại__', groupName: '__x__', adName: '__y__' })],
    { dryRun: true, tuTaoMoi: true });
  t('bật tự tạo ⇒ lên kế hoạch cả 3 cấp',
    r3.seTao.chienDich.length === 1 && r3.seTao.nhom.length === 1 && r3.seTao.quangCao.length === 1,
    JSON.stringify(r3.seTao));
  t('đếm được dòng chờ thực thể mới', r3.dongChoThucTheMoi === 1, String(r3.dongChoThucTheMoi));

  console.log('— gộp nhiều dòng nền tảng về 1 bản ghi thì phải CỘNG');
  const r4 = await reconcile.reconcile(data,
    [mk({ adExtId: 'A1', spend: 100000, conversions: 1 }), mk({ adExtId: 'A2', spend: 200000, conversions: 2 })],
    { dryRun: true, tuTaoMoi: false });
  const goc = [...(r4.chiTiet.taoMoi || []), ...(r4.chiTiet.capNhat || [])];
  t('cộng thành 300.000', goc.length === 1 && goc[0].spend === 300000, JSON.stringify(goc.map((x) => x.spend)));
  t('cộng chuyển đổi = 3', goc.length === 1 && goc[0].conversions === 3);
  t('ghi nhận gộp từ 2 dòng', goc.length === 1 && goc[0].soDongGoc === 2);

  console.log('— API');
  let a = await get('/api/connect');
  t('/api/connect 200', a.s === 200 && Array.isArray(a.j.providers));
  t('/api/connect không lộ token', !JSON.stringify(a.j).includes('accessToken'));
  t('có trạng thái hẹn giờ', a.j.hengio && typeof a.j.hengio.dangBat === 'boolean');

  a = await post('/api/sync', { providers: ['khong-co-kenh-nay'], dryRun: true });
  t('kênh không hợp lệ → 400', a.s === 400, a.txt.slice(0, 120));
  a = await post('/api/sync', { dryRun: true });
  t('xem trước chạy được và KHÔNG ghi gì',
    a.s === 200 && a.j.dryRun === true && a.j.ketQua.every((k) => k.daGhi === undefined),
    a.txt.slice(0, 140));

  a = await post('/api/import-csv', { text: 'x', platform: 'Facebook', dryRun: true });
  t('CSV quá ngắn → 400', a.s === 400);
  a = await post('/api/import-csv', { text: raw, dryRun: true });
  t('thiếu platform → 400', a.s === 400, a.txt.slice(0, 120));
  a = await post('/api/import-csv', { text: raw, platform: 'Facebook', dryRun: true });
  t('CSV xem trước OK', a.s === 200 && a.j.dryRun === true, a.txt.slice(0, 150));

  const m = (await get('/api/meta')).j;
  a = await post('/api/mapping', { type: 'sai', recordId: m.ads[0].id, extId: 'x' });
  t('mapping type sai → 400', a.s === 400);
  a = await post('/api/mapping', { type: 'ad', recordId: 'khongphairec', extId: 'x' });
  t('mapping recordId sai → 400', a.s === 400);

  // Đây là Base SỐNG — mỗi ngày đội ngũ nhập thêm dòng thật, nên không neo vào một
  // con số cố định. Thứ cần bảo đảm là bộ test không để lại rác trong đó.
  const d0 = await get('/api/daily?from=2020-01-01&to=2099-01-01');
  t('không còn dòng do test tạo (nguồn CSV)',
    d0.j.rows.every((r) => r.source !== 'CSV'),
    d0.j.rows.filter((r) => r.source === 'CSV').length + ' dòng');
  t('không còn nhãn test', d0.j.rows.every((r) => !/__TEST/.test(r.label || '')));
  t('không còn quảng cáo test', m.ads.every((a) => !/^__TEST/.test(a.name)));
  t('không còn chiến dịch test', m.campaigns.every((c) => !/^__TEST/.test(c.name)));
  t('số dòng không bị hụt đi', m.counts.daily >= 181, String(m.counts.daily));
  t('không bản ghi nào bị gắn ID rác',
    m.ads.every((x) => !/__TEST/.test(x.extId || '')) && m.campaigns.every((x) => !/__TEST/.test(x.extId || '')));

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('LỖI TEST:', e.stack); process.exit(1); });
