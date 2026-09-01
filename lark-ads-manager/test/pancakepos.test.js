/**
 * Test cho sync/pancakepos.js — phần logic thuần, không gọi mạng.
 *
 * Chỗ nguy hiểm nhất và là lý do file này tồn tại: KHOÁ GHÉP MÃ LEAD.
 * Tourwell đệm số 0 không nhất quán — cùng một bản xuất có cả `LU00998` và
 * `LU1997`. So bằng chuỗi thì hai bên không bao giờ khớp, mà không khớp thì bảng
 * doanh thu ra rỗng chứ không báo lỗi. Nên khoá phải là SỐ.
 */
const p = require('../sync/pancakepos');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  ok  ' + name); }
  else { fail += 1; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('— rút mã lead Tourwell khỏi ghi chú đơn POS');
const ml = p.macLead;
t('note "LU1998"', ml('LU1998', '').id === 1998 && ml('LU1998', '').tuDau === 'ghi-chu');
t('giữ nguyên chuỗi đã thấy', ml('LU00998', '').ma === 'LU00998', ml('LU00998', '').ma);
t('nhưng khoá là số, số 0 đầu không ảnh hưởng', ml('LU00998', '').id === 998, String(ml('LU00998', '').id));
t('lấy được từ link khi ghi chú trống',
  ml('', 'https://rootytrip.tourwell.net/admin/lead/1998/show').id === 1998);
t('nguồn được ghi rõ là link',
  ml('', 'https://rootytrip.tourwell.net/admin/lead/1998/show').tuDau === 'link');
t('ghi chú thắng link khi có cả hai',
  ml('LU1998', 'https://rootytrip.tourwell.net/admin/lead/9999/show').id === 1998);
t('mã lẫn trong câu vẫn lấy được', ml('khách quen, xem LU1234 nha', '').id === 1234);
t('không có gì thì trả null', ml('', '') === null && ml('ghi chú bình thường', 'in') === null);
t('chữ thường cũng nhận', ml('lu1998', '').id === 1998);
// Không được nhận bừa: một số trần không phải mã lead
t('số trần không phải mã lead', ml('1998', '') === null, JSON.stringify(ml('1998', '')));

console.log('— soLead: hai phía phải ra cùng khoá');
t('LU00998 và LU998 cùng khoá', p.soLead('LU00998') === p.soLead('LU998'));
t('LU1997 → 1997', p.soLead('LU1997') === 1997);
t('có khoảng trắng và chữ thường vẫn được', p.soLead(' lu1997 ') === 1997);
t('số trần vẫn ra số (dùng cho cột Mã lead của Excel)', p.soLead('998') === 998);
t('rỗng → null', p.soLead('') === null && p.soLead(null) === null);

console.log('— chuẩn hoá số điện thoại, cùng luật với sync/pancake.js');
const pancake = require('../sync/pancake');
['0933833893', '(+84)982266226', '+84933833893', '84886068886', '934330084', ''].forEach((v) => {
  t(`"${v}" ra cùng kết quả ở hai module`, p.chuanSdt(v) === pancake.chuanSdt(v),
    p.chuanSdt(v) + ' vs ' + pancake.chuanSdt(v));
});

console.log('— gom theo (quảng cáo × ngày)');
const don = [
  { adId: 'A1', ngay: '2026-08-31', pageId: 'P1', leadId: 1001, leadMa: 'LU1001', sdt: '0900000001', tien: 0 },
  // cùng lead, hai đơn POS — khách Tina thật sự có 2 đơn, không được đếm thành 2 lead
  { adId: 'A1', ngay: '2026-08-31', pageId: 'P1', leadId: 1001, leadMa: 'LU1001', sdt: '0900000001', tien: 0 },
  { adId: 'A1', ngay: '2026-08-31', pageId: 'P1', leadId: 1002, leadMa: 'LU1002', sdt: '0900000002', tien: 0 },
  { adId: 'A1', ngay: '2026-08-30', pageId: 'P1', leadId: 1003, leadMa: 'LU1003', sdt: '0900000003', tien: 0 },
  { adId: 'A2', ngay: '2026-08-31', pageId: 'P2', leadId: null, leadMa: '', sdt: '0900000004', tien: 50000 },
  { adId: '', ngay: '2026-08-31', pageId: 'P1', leadId: 1005, leadMa: 'LU1005', sdt: '0900000005', tien: 0 },
];
const g = p.theoAdVaNgay(don);
const lay = (ad, ngay) => g.rows.find((r) => r.adId === ad && r.ngay === ngay);

t('đơn không có ad_id bị đếm riêng', g.khongCoAd === 1, String(g.khongCoAd));
t('A1 ngày 31: 3 đơn POS', lay('A1', '2026-08-31').soDon === 3);
t('nhưng chỉ 2 lead — không nhân đôi vì một lead nhiều đơn',
  lay('A1', '2026-08-31').soLead === 2, String(lay('A1', '2026-08-31').soLead));
t('số điện thoại cũng không trùng', lay('A1', '2026-08-31').sdt.length === 2);
t('ngày 30 tách riêng', lay('A1', '2026-08-30').soDon === 1);
t('đếm đơn thiếu mã lead', g.khongCoLead === 1, String(g.khongCoLead));
t('tổng lead duy nhất trên cả kỳ', g.soLeadDuyNhat === 3, String(g.soLeadDuyNhat));
t('tiền POS được cộng ra để phát hiện nếu POS bắt đầu có tiền',
  lay('A2', '2026-08-31').tienPOS === 50000);
t('danh sách rỗng không nổ', p.theoAdVaNgay([]).rows.length === 0);

console.log('— bảng mã lead → quảng cáo (khoá ghép với bản xuất Tourwell)');
const lv = p.leadVeQuangCao(don);
const tim = (id) => lv.rows.find((r) => r.leadId === id);
t('mỗi lead một dòng, không nhân theo số đơn', lv.rows.length === 4, String(lv.rows.length));
t('lead 1001 gộp 2 đơn POS', tim(1001).soDon === 2);
t('lead 1001 quy về đúng một quảng cáo', tim(1001).adIds.length === 1 && tim(1001).roRang === true);
t('giữ mã dạng gốc để đối chiếu bằng mắt', tim(1001).leadMa === 'LU1001');
t('lead không có ad_id được đếm ra', lv.khongCoAd === 1, String(lv.khongCoAd));

// Lead có hai ad_id khác nhau thì PHẢI báo, không được chọn bừa một cái
const nhap = p.leadVeQuangCao([
  { adId: 'A1', ngay: '2026-08-30', pageId: 'P1', leadId: 7, leadMa: 'LU7', sdt: '0900000009', tien: 0 },
  { adId: 'A2', ngay: '2026-08-31', pageId: 'P1', leadId: 7, leadMa: 'LU7', sdt: '0900000009', tien: 0 },
]);
t('lead nhiều ad_id bị đánh dấu nhập nhằng', nhap.nhapNhang === 1, String(nhap.nhapNhang));
t('và không bị coi là rõ ràng', nhap.rows[0].roRang === false);
t('giữ ngày SỚM NHẤT — lúc quảng cáo sinh ra khách, không phải lúc sửa đơn',
  nhap.rows[0].ngay === '2026-08-30', nhap.rows[0].ngay);

console.log('— mỗi gian hàng một khoá riêng');
/* Ở Pancake POS mỗi page là một gian hàng riêng; công ty này có 15 gian. Khoá của
 * gian Facebook (454586) gọi sang gian TikTok (100087658) bị từ chối với câu
 * "Cửa hàng không tồn tại". Bản đầu dùng MỘT apiKey cho mọi shopIds nên chỉ đọc
 * được gian Facebook, còn TikTok mất trắng. */
const dg = p.danhSachGian;
let gi = dg({ shops: [{ shopId: '454586', apiKey: 'A', ten: 'FB' }, { shopId: '100087658', apiKey: 'B', ten: 'TT' }] });
t('mỗi gian giữ khoá riêng', gi[0].apiKey === 'A' && gi[1].apiKey === 'B', JSON.stringify(gi));
t('giữ tên gợi nhớ', gi[1].ten === 'TT');
// dạng cũ phải còn đọc được, nếu không cấu hình đang chạy trên Render chết khi deploy
gi = dg({ apiKey: 'K', shopIds: ['1', '2'] });
t('dạng cũ vẫn đọc được', gi.length === 2 && gi[0].apiKey === 'K' && gi[1].apiKey === 'K', JSON.stringify(gi));
t('shops mới thắng dạng cũ',
  dg({ apiKey: 'CU', shopIds: ['9'], shops: [{ shopId: '1', apiKey: 'MOI' }] })[0].apiKey === 'MOI');
t('gian thiếu khoá vẫn hiện ra để báo thiếu',
  dg({ shops: [{ shopId: '1' }] })[0].apiKey === '', JSON.stringify(dg({ shops: [{ shopId: '1' }] })));
t('gian không có shopId bị bỏ', dg({ shops: [{ apiKey: 'X' }] }).length === 0);
t('cấu hình rỗng ra mảng rỗng', dg({}).length === 0 && dg(null).length === 0);

console.log('— chặn lẫn khoá giữa hai thẻ Pancake (đã xảy ra thật)');
/* Người dùng dán api_key của POS vào ô token của thẻ hội thoại; Pancake chỉ trả
 * "Invalid access_token" nên không biết mình sai CHỖ, không sai giá trị.
 * (`pancake` đã require ở phần chuẩn hoá số điện thoại phía trên.) */
t('api_key POS (32 hex) được nhận ra', pancake.laKeyPOS('b7c5321ef4d14cc08908beea0560d584'));
t('chữ hoa cũng nhận', pancake.laKeyPOS('A34CDB2E870A9B11AA96C1A0B1C2D3E4'));
t('33 ký tự thì không phải', pancake.laKeyPOS('b7c5321ef4d14cc08908beea0560d5840') === false);
t('có ký tự ngoài hex thì không phải', pancake.laKeyPOS('g7c5321ef4d14cc08908beea0560d584') === false);
t('pos_user_ không phải api_key', pancake.laKeyPOS('pos_user_ZjqPR06vv-An6I9IkY1Xma1') === false);
t('rỗng thì không phải', pancake.laKeyPOS('') === false && pancake.laKeyPOS(null) === false);

console.log('— ngày theo giờ VN');
t('dauNgay là 17:00 UTC hôm trước',
  new Date(p.dauNgay('2026-08-31') * 1000).toISOString() === '2026-08-30T17:00:00.000Z');
t('cuoiNgay là 16:59:59 UTC cùng ngày',
  new Date(p.cuoiNgay('2026-08-31') * 1000).toISOString() === '2026-08-31T16:59:59.000Z');

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
