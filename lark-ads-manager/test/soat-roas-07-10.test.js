/**
 * Soát toàn bộ phép tính ROAS, 07/10/2026 — anh Hùng: "kiểm tra giùm anh các
 * tính ROAS coi có lỗi hay mất logic gì không, cẩn thận nhé".
 *
 * Bắt được MỘT lỗi thật, và nó thuộc loại tệ nhất: hỏng âm thầm.
 *
 *   Một đơn thiếu ô tiền → `o.tien += d.tien` ra NaN → NaN lan ra tổng →
 *   JSON.stringify biến NaN thành `null` → màn hình hiện trống.
 *   Không có thông báo nào, không có dòng log nào. Con số chết mà trông như
 *   chưa có dữ liệu.
 *
 * Phần còn lại của file là các BẤT BIẾN phải luôn đúng, để lần sau sửa phép
 * ghi công thì biết ngay nếu làm vỡ cái gì.
 */
const roas = require('../sync/roas');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const NEN = {
  data: { ads: [
    { id: 'r1', extId: '111', name: 'A', platform: 'TikTok' },
    { id: 'r2', extId: '222', name: 'B', platform: 'Facebook' }],
    daily: [
      { adId: 'r1', date: '2026-09-10', spend: 1000000, platform: 'TikTok' },
      { adId: 'r2', date: '2026-09-10', spend: 2000000, platform: 'Facebook' }] },
  from: '2026-09-01', to: '2026-09-30', cuaSo: 60,
};
const lead1 = { id: 1, ma: 'LU1', kh: 'KH-A', ngay: '2026-09-05' };

console.log('— LỖI BẮT ĐƯỢC: đơn thiếu tiền làm tổng thành NaN rồi hoá null');
{
  const k = roas.tinh({ ...NEN, posRows: [{ leadId: 1, adId: '111' }],
    leadRows: [lead1],
    donRows: [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07' }] });   // thiếu tien/thu
  t('tổng tiền vẫn là SỐ', Number.isFinite(k.tong.tien), String(k.tong.tien));
  t('tổng thu vẫn là SỐ', Number.isFinite(k.tong.thu), String(k.tong.thu));
  /* Và phải là 0, không phải một con số bịa. */
  t('thiếu tiền thì tính 0', k.tong.tien === 0 && k.tong.thu === 0);
  t('vẫn đếm là một đơn ghi công được', k.tong.don === 1);
  /* ROAS từ tử số 0 phải là 0, không NaN. */
  t('ROAS là 0, không NaN', k.tong.roas === 0, String(k.tong.roas));

  /* Tiền rác kiểu chuỗi cũng không được lọt. */
  const k2 = roas.tinh({ ...NEN, posRows: [{ leadId: 1, adId: '111' }],
    leadRows: [lead1],
    donRows: [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07', tien: 'abc', thu: null }] });
  t('tiền không phải số thì tính 0', k2.tong.tien === 0, String(k2.tong.tien));

  /* donKhongGhep cũng phải chịu được. */
  const k3 = roas.tinh({ ...NEN, leadRows: [], donRows: [{ ma: 'RT9', kh: 'KH-Z', ngay: '2026-09-07' }] });
  t('tiền đơn chưa ghép cũng không NaN', Number.isFinite(k3.donKhongGhep.tien),
    String(k3.donKhongGhep.tien));
}

console.log('— BẤT BIẾN: tổng luôn bằng cộng các dòng');
{
  const k = roas.tinh({ ...NEN,
    posRows: [{ leadId: 1, adId: '111' }, { leadId: 2, adId: '222' }],
    leadRows: [lead1, { id: 2, ma: 'LU2', kh: 'KH-B', ngay: '2026-09-06' }],
    donRows: [
      { ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07', tien: 5000000, thu: 4000000 },
      { ma: 'RT2', kh: 'KH-B', ngay: '2026-09-08', tien: 3000000, thu: 1000000 }] });
  const sum = (x) => k.rows.reduce((a, r) => a + r[x], 0);
  t('tiền', sum('tien') === k.tong.tien);
  t('thu', sum('thu') === k.tong.thu);
  t('đơn', sum('don') === k.tong.don);
  t('lead', sum('lead') === k.tong.lead);
  t('ROAS = tiền / chi cả kỳ',
    Math.abs(k.tong.roas - k.tong.tien / k.tong.chiKy) < 1e-9);
  t('số dòng ghiCongDon = số đơn', k.ghiCongDon.length === k.tong.don);
  t('theo kênh cộng lại = tổng', k.theoKenh.reduce((a, x) => a + x.tien, 0) === k.tong.tien);
}

console.log('— BẤT BIẾN: một đơn chỉ được ghi công MỘT lần, dù bốn đường cùng với tới');
{
  const k = roas.tinh({ ...NEN,
    posRows: [{ leadId: 1, adId: '222' }],
    hoiThoaiRows: [
      { type: 'INBOX', id: 'h1', adIds: ['222'], ngay: '2026-09-05', sdt: ['0900000001'], coSdt: true },
      { type: 'INBOX', id: 'h2', adIds: ['111'], ngay: '2026-09-05', sdt: [], coSdt: false, tenKhachDs: ['Cô 2 Họ Đào'] },
    ],
    leadRows: [{ ...lead1, sdt: '0900000001', khach: 'Cô 2 Họ Đào', ghiChu: 'QC=111' }],
    donRows: [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07', tien: 5000000, thu: 4000000 }] });
  t('chỉ một đơn', k.tong.don === 1, JSON.stringify(k.tong));
  t('tiền không nhân lên', k.tong.tien === 5000000);
  const co = k.rows.filter((r) => r.don > 0);
  /* Thứ tự ưu tiên: người nối > POS > số điện thoại > tên. */
  t('thuộc đường mạnh nhất', co.length === 1 && co[0].duong === 'người nối',
    JSON.stringify(co.map((r) => r.duong)));
  t('mã đơn không lặp trong ghiCongDon',
    new Set(k.ghiCongDon.map((x) => x.ma)).size === k.ghiCongDon.length);
}

console.log('— BẤT BIẾN: nguồn có mã đơn TRÙNG vẫn chỉ tính một lần');
{
  const d = { ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07', tien: 5000000, thu: 4000000 };
  const k = roas.tinh({ ...NEN, posRows: [{ leadId: 1, adId: '111' }],
    leadRows: [lead1], donRows: [d, { ...d }, { ...d }] });
  t('ba dòng cùng mã → một đơn', k.tong.don === 1, JSON.stringify(k.tong));
  t('tiền không nhân ba', k.tong.tien === 5000000, String(k.tong.tien));
}

console.log('— BẤT BIẾN: không bịa ROAS khi không có chi tiêu');
{
  const k = roas.tinh({ data: { ads: [], daily: [] }, from: '2026-09-01', to: '2026-09-30',
    leadRows: [], donRows: [] });
  t('ROAS là null, không Infinity', k.tong.roas === null, String(k.tong.roas));
  t('chi cả kỳ là 0', k.tong.chiKy === 0);
}

console.log('— BẤT BIẾN: mọi đơn chưa ghi công đều có LÝ DO');
{
  const k = roas.tinh({ ...NEN, leadRows: [],
    donRows: [{ ma: 'RT9', kh: 'KH-Z', ngay: '2026-09-07', tien: 1000000, thu: 0 }] });
  const maGhi = new Set(k.ghiCongDon.map((x) => String(x.ma)));
  const maLyDo = new Set((k.lyDoTheoDon || []).map((x) => String(x.ma)));
  t('đơn chưa ghép có lý do', maLyDo.has('RT9'), JSON.stringify(k.lyDoTheoDon));
  t('không giải thích nhầm đơn đã ghép', ![...maLyDo].some((x) => maGhi.has(x)));
}

console.log('— màn hình nói rõ vì sao bốn ô trên khác khối ROAS');
{
  const fs = require('fs');
  const path = require('path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  /* Anh Hùng: trên hiện 0đ, dưới hiện 329 triệu. Cả hai đều đúng — một bên
   * theo bộ lọc đầu trang, một bên theo khoảng kho; và một bên đọc Base, một
   * bên tính tươi. Trước đây màn hình không nói lý do nào. */
  t('có khối giải thích', /đo hai thứ khác nhau/.test(app));
  t('nêu lý do khác khoảng ngày', /Khác khoảng ngày/.test(app));
  t('nêu lý do Base chưa kịp cập nhật', /Khác thời điểm/.test(app));
  t('nói rõ bốn ô trên đọc bảng Sales trên Base', /bảng Sales trên Base/.test(app));
  t('và chỉ cách làm cho hai bên khớp', /đợi lượt ghi Base xong rồi bấm/.test(app));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
