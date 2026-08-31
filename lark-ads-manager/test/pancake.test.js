/**
 * Test cho sync/pancake.js — phần logic thuần, không gọi mạng.
 *
 * Hai chỗ đáng test nhất, vì sai là sai âm thầm và số vẫn nhìn hợp lý:
 *   1. chuanSdt  — Tourwell lưu '(+84)982266226', Pancake lưu '0933833893'.
 *                  Không chuẩn hoá thì ghép doanh thu ra 1 dòng trên 998.
 *   2. theoAdVaNgay — một hội thoại nhiều ad_ids thì tính cho MỌI ad, nên tổng
 *                  theo ad lớn hơn tổng thật. Phải đếm và báo ra, không im lặng.
 */
const p = require('../sync/pancake');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  ok  ' + name); }
  else { fail += 1; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('— chuẩn hoá số điện thoại (khoá ghép doanh thu)');
const sdt = p.chuanSdt;
t('dạng 0xxx giữ nguyên', sdt('0933833893') === '0933833893', sdt('0933833893'));
t('dạng (+84) về 0', sdt('(+84)982266226') === '0982266226', sdt('(+84)982266226'));
t('dạng +84 về 0', sdt('+84933833893') === '0933833893', sdt('+84933833893'));
t('dạng 84 không dấu cộng về 0', sdt('84886068886') === '0886068886', sdt('84886068886'));
t('bỏ khoảng trắng và gạch', sdt('090 909 - 1234') === '0909091234', sdt('090 909 - 1234'));
t('thiếu số 0 đầu được thêm vào', sdt('934330084') === '0934330084', sdt('934330084'));
t('nháy đơn của Excel bị bỏ', sdt("'0933833893'") === '0933833893', sdt("'0933833893'"));
t('rỗng ra rỗng', sdt('') === '' && sdt(null) === '' && sdt(undefined) === '');
t('quá ngắn bị loại', sdt('12345') === '', sdt('12345'));
t('quá dài bị loại', sdt('0123456789012345') === '', sdt('0123456789012345'));
// Hai dạng của CÙNG một người phải ra cùng một chuỗi — đây là điều kiện để ghép được
t('hai dạng cùng người ra cùng khoá', sdt('(+84)982266226') === sdt('0982266226'));

console.log('— ngày theo giờ VN');
t('dauNgay là 17:00 UTC hôm trước',
  new Date(p.dauNgay('2026-08-31') * 1000).toISOString() === '2026-08-30T17:00:00.000Z',
  new Date(p.dauNgay('2026-08-31') * 1000).toISOString());
t('cuoiNgay là 16:59:59 UTC cùng ngày',
  new Date(p.cuoiNgay('2026-08-31') * 1000).toISOString() === '2026-08-31T16:59:59.000Z',
  new Date(p.cuoiNgay('2026-08-31') * 1000).toISOString());
// 23:30 giờ VN ngày 31 = 16:30Z ngày 31. Đọc theo UTC vẫn là 31 — nhưng 00:30 giờ VN
// ngày 31 = 17:30Z ngày 30, đọc theo UTC ra ngày 30, lệch một ngày. Đây là cái bẫy.
t('00:30 giờ VN vẫn thuộc ngày đó, không tụt về hôm trước',
  p.ngayVN('2026-08-30T17:30:00.000Z') === '2026-08-31',
  p.ngayVN('2026-08-30T17:30:00.000Z'));
t('23:30 giờ VN vẫn thuộc ngày đó',
  p.ngayVN('2026-08-31T16:30:00.000Z') === '2026-08-31',
  p.ngayVN('2026-08-31T16:30:00.000Z'));
t('ngày rác ra rỗng', p.ngayVN('khong-phai-ngay') === '');

console.log('— tên nền tảng quy về đúng tên trong Base');
t('facebook → Facebook', p.chuanNenTang('facebook') === 'Facebook');
t('FB → Facebook', p.chuanNenTang('FB') === 'Facebook');
t('tiktok_business → TikTok', p.chuanNenTang('tiktok_business') === 'TikTok');
t('tên lạ giữ nguyên chứ không mất', p.chuanNenTang('Threads') === 'Threads');
t('rỗng ra rỗng', p.chuanNenTang('') === '');

console.log('— đoán nền tảng từ tiền tố page_id');
/* API /pages trả platform cho page Facebook nhưng để trống với loại khác, nên bảng
 * hiện ra bắt người dùng tự chọn — mà nhìn 'ttm_-0004gFkT50UIFZT…' thì không ai
 * biết đó là TikTok. Đã xảy ra thật. */
const dnt = p.doanNenTang;
t('igo_ → Instagram', dnt('igo_17841406452112743', '') === 'Instagram');
t('waba_ → WhatsApp', dnt('waba_910524132139924', '') === 'WhatsApp');
t('ttm_ → TikTok', dnt('ttm_-0004gFkT50UIFZT5TBGQP8f_8xEHbqIF2dI', '') === 'TikTok');
t('chỉ toàn số → Facebook', dnt('1175309429179128', '') === 'Facebook');
t('trường platform của API luôn thắng tiền tố',
  dnt('1175309429179128', 'zalo') === 'Zalo', dnt('1175309429179128', 'zalo'));
t('tiktok_business từ API vẫn quy về TikTok', dnt('ttm_abc', 'tiktok_business') === 'TikTok');
t('id lạ không đoán bừa', dnt('gi-do-la', '') === '', dnt('gi-do-la', ''));
t('id rỗng ra rỗng', dnt('', '') === '');
// Số ngắn không phải page_id Facebook — đừng gán nhầm
t('số quá ngắn không nhận là Facebook', dnt('123', '') === '', dnt('123', ''));

console.log('— gom theo (quảng cáo × ngày)');
const hoiThoai = [
  { adIds: ['A1'], ngay: '2026-08-31', platform: 'Facebook', coSdt: true, sdt: ['0900000001'], orderIds: [11], tags: ['Chốt'], tagChotCuaPancake: false },
  { adIds: ['A1'], ngay: '2026-08-31', platform: 'Facebook', coSdt: false, sdt: [], orderIds: [], tags: [], tagChotCuaPancake: false },
  { adIds: ['A1'], ngay: '2026-08-30', platform: 'Facebook', coSdt: true, sdt: ['0900000002'], orderIds: [], tags: [], tagChotCuaPancake: true },
  { adIds: ['A2', 'A3'], ngay: '2026-08-31', platform: 'TikTok', coSdt: true, sdt: ['0900000003'], orderIds: [12, 13], tags: [], tagChotCuaPancake: false },
  { adIds: [], ngay: '2026-08-31', platform: 'Facebook', coSdt: true, sdt: ['0900000004'], orderIds: [], tags: [], tagChotCuaPancake: false },
];
const g = p.theoAdVaNgay(hoiThoai, { tagChot: ['Chốt'] });
const lay = (ad, ngay) => g.rows.find((r) => r.adId === ad && r.ngay === ngay);

t('hội thoại không có ad_ids bị đếm riêng, không lẫn vào', g.khongCoAd === 1, String(g.khongCoAd));
t('hội thoại nhiều ad_ids được đếm ra', g.trungAd === 1, String(g.trungAd));
t('A1 ngày 31: 2 hội thoại', lay('A1', '2026-08-31').hoiThoai === 2);
t('A1 ngày 31: chỉ 1 có SĐT', lay('A1', '2026-08-31').coSdt === 1);
t('A1 ngày 31: 1 chốt theo tag tên "Chốt"', lay('A1', '2026-08-31').chot === 1);
t('A1 ngày 30 tách riêng khỏi ngày 31', lay('A1', '2026-08-30').hoiThoai === 1);
t('tag do Pancake đánh dấu is_lead_event cũng tính là chốt',
  lay('A1', '2026-08-30').chot === 1);
t('hội thoại 2 ad được tính cho CẢ HAI ad',
  lay('A2', '2026-08-31').hoiThoai === 1 && lay('A3', '2026-08-31').hoiThoai === 1);
t('số đơn theo ad cộng đúng', lay('A2', '2026-08-31').soDon === 2);
t('SĐT trong một ô là danh sách không trùng',
  Array.isArray(lay('A1', '2026-08-31').sdt) && lay('A1', '2026-08-31').sdt.length === 1);
t('giữ tên nền tảng để ghép với bảng chi tiêu',
  lay('A2', '2026-08-31').platform === 'TikTok');
t('sắp theo ngày mới nhất trước', g.rows[0].ngay === '2026-08-31');
// Bất biến: tổng hội thoại theo ad KHÔNG được nhỏ hơn số hội thoại có ad —
// nếu nhỏ hơn thì đang mất dòng ở đâu đó.
const coAd = hoiThoai.filter((x) => x.adIds.length).length;
t('không mất hội thoại nào khi gom',
  g.rows.reduce((s, r) => s + r.hoiThoai, 0) >= coAd,
  g.rows.reduce((s, r) => s + r.hoiThoai, 0) + ' vs ' + coAd);

console.log('— không có tag chốt nào khai thì vẫn chạy');
const g2 = p.theoAdVaNgay(hoiThoai, {});
t('tag tên "Chốt" không tính khi chưa khai', lay2(g2, 'A1', '2026-08-31').chot === 0);
t('nhưng is_lead_event vẫn luôn tính', lay2(g2, 'A1', '2026-08-30').chot === 1);
function lay2(gg, ad, ngay) { return gg.rows.find((r) => r.adId === ad && r.ngay === ngay); }

t('danh sách rỗng không nổ', p.theoAdVaNgay([], {}).rows.length === 0);

console.log('— phân loại ad_ids ở cấp nào');
/* Vì sao phải có hàm này: ID quảng cáo và ID chiến dịch của Meta cùng một không
 * gian số. Trong Base thật, chiến dịch 'Daily_Tour Đảo' là 52518121733306 còn
 * quảng cáo 'IS_Giá chưa tới 1 củ' là 52518121733506 — lệch ĐÚNG một chữ số.
 * Ghép sai cấp thì số vẫn nhìn hợp lý mà sai hết, nên phải đếm chứ đừng đoán. */
const BASE = {
  campaigns: [{ id: 'recC1', name: 'Daily_Tour Đảo', extId: '52518121733306', platform: 'Facebook' }],
  groups: [{ id: 'recG1', name: 'Nhóm 1', campaignId: 'recC1', extId: '777' }],
  ads: [
    { id: 'recA1', name: 'IS_Giá chưa tới 1 củ', groupId: 'recG1', campaignId: 'recC1', extId: '52518121733506', platform: 'Facebook' },
    { id: 'recA2', name: 'QC hai', groupId: 'recG1', campaignId: 'recC1', extId: '888', platform: 'Facebook' },
  ],
  daily: [
    { adId: 'recA1', date: '2026-08-31', spend: 100000, conversions: 5, clicks: 10, impressions: 100 },
    { adId: 'recA2', date: '2026-08-31', spend: 50000, conversions: 2, clicks: 4, impressions: 40 },
    { adId: 'recA1', date: '2026-08-20', spend: 999999, conversions: 1, clicks: 1, impressions: 1 },
  ],
};

const pl1 = p.phanLoaiId(['52518121733506'], BASE);
t('ID quảng cáo được nhận đúng cấp', pl1.capDo === 'quang-cao', pl1.capDo);
const pl2 = p.phanLoaiId(['52518121733306'], BASE);
t('ID chiến dịch KHÔNG bị nhận thành quảng cáo dù lệch một chữ số',
  pl2.capDo === 'chien-dich' && pl2.dem.quangCao === 0, pl2.capDo);
const pl3 = p.phanLoaiId(['52518121733506', '52518121733306'], BASE);
t('trộn hai cấp thì báo lẫn lộn, không chọn bừa', pl3.capDo === 'lan-lon', pl3.capDo);
const pl4 = p.phanLoaiId(['khong-co-trong-base'], BASE);
t('ID lạ vào nhóm không khớp', pl4.dem.khongKhop === 1 && pl4.tyLeKhop === 0);
t('ưu tiên cấp quảng cáo trước nhóm và chiến dịch',
  p.phanLoaiId(['888'], BASE).capDo === 'quang-cao');
t('ID trùng nhau chỉ đếm một lần',
  p.phanLoaiId(['888', '888', '888'], BASE).tong === 1);

console.log('— ghép Pancake với chi tiêu');
const gom = {
  rows: [
    { adId: '52518121733506', ngay: '2026-08-31', platform: 'Facebook', hoiThoai: 10, coSdt: 4, chot: 2, soDon: 1, sdt: [] },
    { adId: 'khong-co-trong-base', ngay: '2026-08-31', platform: 'TikTok', hoiThoai: 7, coSdt: 1, chot: 0, soDon: 0, sdt: [] },
  ],
  khongCoAd: 0, trungAd: 0,
};
const gh = p.ghepVoiChiTieu(gom, BASE, { from: '2026-08-25', to: '2026-08-31' });
const d1 = gh.rows.find((r) => r.adId === '52518121733506');
const d2 = gh.rows.find((r) => r.adId === 'khong-co-trong-base');

t('dòng khớp được gắn chi tiêu đúng', d1.spend === 100000, String(d1.spend));
t('giá mỗi hội thoại = chi tiêu / hội thoại', d1.giaMoiHoiThoai === 10000, String(d1.giaMoiHoiThoai));
t('giá mỗi SĐT = chi tiêu / số có SĐT', d1.giaMoiSdt === 25000, String(d1.giaMoiSdt));
t('giá mỗi đơn chốt = chi tiêu / số chốt', d1.giaMoiChot === 50000, String(d1.giaMoiChot));
t('lấy được tên quảng cáo từ Base', d1.ten === 'IS_Giá chưa tới 1 củ', d1.ten);
t('dòng không khớp được đánh dấu, không im lặng bỏ', d2 && d2.ghepDuoc === false);
t('dòng không khớp có chi tiêu 0 chứ không phải NaN', d2.spend === 0);
// Chia cho 0 phải ra null, đừng để Infinity lọt ra giao diện thành "∞đ"
const gh0 = p.ghepVoiChiTieu({ rows: [
  { adId: '52518121733506', ngay: '2026-08-31', platform: 'Facebook', hoiThoai: 3, coSdt: 0, chot: 0, soDon: 0, sdt: [] },
], khongCoAd: 0, trungAd: 0 }, BASE, { from: '2026-08-25', to: '2026-08-31' });
t('chia cho 0 ra null, không phải Infinity',
  gh0.rows[0].giaMoiSdt === null && gh0.rows[0].giaMoiChot === null,
  JSON.stringify([gh0.rows[0].giaMoiSdt, gh0.rows[0].giaMoiChot]));

t('ngày ngoài khoảng không bị cộng vào', gh.chiTongKhoang === 150000, String(gh.chiTongKhoang));
t('chi tiêu không ghép được tính đúng', gh.chiKhongGhep === 50000, String(gh.chiKhongGhep));
t('đếm đúng số dòng chưa ghép', gh.soDongKhongGhep === 1, String(gh.soDongKhongGhep));
t('tổng chỉ cộng dòng ghép được', gh.tong.spend === 100000 && gh.tong.hoiThoai === 10);
t('sắp theo chi tiêu giảm dần', gh.rows[0].spend >= gh.rows[gh.rows.length - 1].spend);

// Pancake tra ID cap chien dich thi phai cong chi tieu CA chien dich trong ngay do
const ghCd = p.ghepVoiChiTieu({ rows: [
  { adId: '52518121733306', ngay: '2026-08-31', platform: 'Facebook', hoiThoai: 20, coSdt: 5, chot: 1, soDon: 0, sdt: [] },
], khongCoAd: 0, trungAd: 0 }, BASE, { from: '2026-08-25', to: '2026-08-31' });
t('ID cấp chiến dịch cộng chi tiêu của mọi quảng cáo trong chiến dịch',
  ghCd.rows[0].spend === 150000, String(ghCd.rows[0].spend));
t('và không còn đồng nào bị coi là không ghép được', ghCd.chiKhongGhep === 0, String(ghCd.chiKhongGhep));

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
