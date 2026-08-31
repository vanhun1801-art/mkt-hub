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

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
