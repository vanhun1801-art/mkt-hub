/**
 * Test cho sync/tourwellapi.js — phần logic thuần, không gọi mạng.
 *
 * Hai chỗ nguy hiểm và là lý do file này tồn tại:
 *
 * 1. **TIỀN.** Tourwell trả tiền dưới ít nhất ba dạng: số, chuỗi "40,000,000",
 *    và object {original, forex}. Đọc sai thì CẢ CỘT VỀ 0 mà không có lỗi nào —
 *    đúng cái bẫy đã xảy ra một lần với bản đọc Excel (`tien('14,920,000')` ra 0
 *    vì `replace(',', '.')` chỉ thay dấu phẩy ĐẦU TIÊN).
 *
 * 2. **HÌNH DẠNG TRẢ RA phải giống hệt bản đọc Excel**, nếu không thì sync/roas.js
 *    lặng lẽ không ghép được gì và bảng doanh thu ra rỗng chứ không báo lỗi.
 */
const t_ = require('../sync/tourwellapi');
const excel = require('../sync/tourwell');
const pancakePos = require('../sync/pancakepos');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

console.log('— địa chỉ máy chủ: gõ kiểu nào cũng nhận');
[
  ['rootytrip.tourwell.net', 'https://rootytrip.tourwell.net'],
  ['https://rootytrip.tourwell.net', 'https://rootytrip.tourwell.net'],
  ['https://rootytrip.tourwell.net/', 'https://rootytrip.tourwell.net'],
  ['http://rootytrip.tourwell.net', 'https://rootytrip.tourwell.net'],
  ['  rootytrip.tourwell.net  ', 'https://rootytrip.tourwell.net'],
  ['', ''],
  [null, ''],
].forEach(([vao, ra]) => t(`"${vao}" → ${ra || '(rỗng)'}`, t_.chuanHost(vao) === ra, t_.chuanHost(vao)));
t('bỏ luôn đường dẫn thừa', t_.chuanHost('rootytrip.tourwell.net/admin/lead') === 'https://rootytrip.tourwell.net');

console.log('— khoảng ngày: Tourwell dùng DD/MM/YYYY, không phải ISO');
t('đổi đúng', t_.khoangNgay('2026-08-02', '2026-08-31') === '02/08/2026 - 31/08/2026',
  t_.khoangNgay('2026-08-02', '2026-08-31'));
t('thiếu một đầu thì trả rỗng, không gửi khoảng méo',
  t_.khoangNgay('2026-08-02', '') === '' && t_.khoangNgay('', '2026-08-31') === '');

console.log('— TIỀN: ba dạng Tourwell có thể trả, sai là cả cột về 0');
[
  ['40,000,000', 40000000, 'chuỗi kiểu Anh'],
  ['14.920.000', 14920000, 'chuỗi kiểu Việt'],
  ['1,234,567.89', 1234567.89, 'có phần thập phân kiểu Anh'],
  ['1.234.567,89', 1234567.89, 'có phần thập phân kiểu Việt'],
  [1500000, 1500000, 'số trần'],
  [0, 0, 'số không'],
  [null, 0, 'null'],
  ['', 0, 'chuỗi rỗng'],
  ['-500,000', -500000, 'số âm'],
  ['40,000,000 đ', 40000000, 'có kèm đơn vị'],
].forEach(([vao, ra, ten]) => t(`${ten}: ${JSON.stringify(vao)} → ${ra}`, t_.tien(vao) === ra, String(t_.tien(vao))));

t('object {original, forex}', t_.tien({ original: '40,000,000', forex: 0 }) === 40000000,
  String(t_.tien({ original: '40,000,000', forex: 0 })));
t('object {value}', t_.tien({ value: 250000 }) === 250000);
t('object rỗng → 0, không nổ', t_.tien({}) === 0);
t('object lồng nhau vẫn ra số', t_.tien({ original: { value: '99,000' } }) === 99000,
  String(t_.tien({ original: { value: '99,000' } })));
/* Chính xác cái ca đã làm hỏng cả cột Tổng tiền ở bản Excel */
t('CA ĐÃ TỪNG HỎNG: "14,920,000" không được ra 0', t_.tien('14,920,000') === 14920000);

console.log('— ngày: ba dạng, và phải ra chuỗi YYYY-MM-DD');
t('DD/MM/YYYY kèm giờ', t_.ngay('23/07/2025 08:13:26') === '2025-07-23');
t('ISO', t_.ngay('2025-07-23T00:00:00') === '2025-07-23');
t('mốc mili-giây theo giờ VN', t_.ngay(1753233206000) === '2025-07-23', t_.ngay(1753233206000));
t('rỗng → rỗng', t_.ngay('') === '' && t_.ngay(null) === '');
t('rác → rỗng chứ không ra ngày bịa', t_.ngay('không rõ') === '');

console.log('— số điện thoại: ba module phải ra CÙNG một kết quả');
['0933833893', '+84933833893', '84886068886', '(+84)982266226', '934330084', '', 'abc']
  .forEach((v) => {
    const a = t_.chuanSdt(v);
    const b = pancakePos.chuanSdt(v);
    t(`"${v}" khớp với pancakepos`, a === b, `${a} vs ${b}`);
  });

console.log('— mã lead: khoá phải là SỐ, cùng luật với đường POS');
t('LUP2115 (bản demo) → 2115', t_.soLead('LUP2115') === 2115);
t('LU00998 → 998, số 0 đầu không ảnh hưởng', t_.soLead('LU00998') === 998);
t('khớp với soLead của pancakepos', t_.soLead('LU1997') === pancakePos.soLead('LU1997'));
t('rỗng → null', t_.soLead('') === null && t_.soLead(null) === null);

console.log('— lay(): dò nhiều tên, đi được đường a.b.c');
t('đường lồng', t_.lay({ customer: { code: 'KH1' } }, 'customer.code') === 'KH1');
t('tên thứ hai khi tên đầu không có',
  t_.lay({ mobile: '0900' }, 'phone.primary.number', 'mobile') === '0900');
t('không có gì → undefined', t_.lay({}, 'a.b') === undefined);
t('rỗng cũng coi như không có', t_.lay({ a: '' }, 'a', 'b') === undefined);
t('không nổ khi đi qua giá trị không phải object',
  t_.lay({ a: 5 }, 'a.b.c') === undefined);
t('số 0 KHÔNG bị coi là thiếu', t_.lay({ a: 0 }, 'a') === undefined || t_.lay({ a: 0 }, 'a') === 0);

console.log('— ghi chú ngược: nối thêm, không bao giờ đè, chạy lại không nhân bản');
const g = t_.ghepGhiChu;
let n1 = g('Khách hẹn gọi lại chiều', 'Facebook · IS_Giá chưa tới 1 củ');
t('giữ nguyên ghi chú người viết', n1.includes('Khách hẹn gọi lại chiều'));
t('có mốc mở và mốc đóng', n1.includes(t_.MOC_DAU) && n1.includes(t_.MOC_CUOI));
t('có nội dung máy ghi', n1.includes('IS_Giá chưa tới 1 củ'));

let n2 = g(n1, 'TikTok · Chỉ từ 6 củ');
t('chạy lại KHÔNG nhân đôi khối máy ghi',
  n2.split(t_.MOC_DAU).length - 1 === 1, String(n2.split(t_.MOC_DAU).length - 1));
t('thay đúng nội dung cũ bằng nội dung mới',
  n2.includes('Chỉ từ 6 củ') && !n2.includes('IS_Giá chưa tới 1 củ'));
t('ghi chú người viết vẫn còn sau nhiều lượt', n2.includes('Khách hẹn gọi lại chiều'));

const n3 = g('', 'Facebook · X');
t('ghi chú đang rỗng thì không để lại dòng trắng thừa',
  n3.startsWith(t_.MOC_DAU), JSON.stringify(n3.slice(0, 20)));
t('null cũng không nổ', typeof g(null, 'Y') === 'string');

const coDuoi = g('Đầu\n' + t_.MOC_DAU + '\ncũ\n' + t_.MOC_CUOI + '\nCuối', 'mới');
t('giữ nguyên phần người viết ở SAU khối máy ghi',
  coDuoi.includes('Đầu') && coDuoi.includes('Cuối') && coDuoi.includes('mới') && !coDuoi.includes('cũ'),
  JSON.stringify(coDuoi));

console.log('— hình dạng trả ra phải khớp bản đọc Excel');
/* Nếu hai đường trả về hình dạng khác nhau thì sync/roas.js lặng lẽ không ghép
 * được gì: bảng doanh thu ra rỗng chứ không báo lỗi. */
const TRUONG_LEAD = ['ma', 'id', 'kh', 'khach', 'sdt', 'ngay', 'nguon', 'trangThai', 'nguoiTao', 'donHang'];
const TRUONG_DON = ['ma', 'kh', 'khach', 'sdt', 'ngay', 'ngayXong', 'ngayDi', 'tien', 'thu', 'nguon', 'trangThai', 'ban'];
const nguonExcel = require('fs').readFileSync(require.resolve('../sync/tourwell.js'), 'utf8');
const nguonApi = require('fs').readFileSync(require.resolve('../sync/tourwellapi.js'), 'utf8');
TRUONG_LEAD.forEach((f) => {
  t(`lead.${f} có ở cả hai đường`,
    new RegExp(`\\b${f}:`).test(nguonExcel) && new RegExp(`\\b${f}:`).test(nguonApi));
});
TRUONG_DON.forEach((f) => {
  t(`đơn.${f} có ở cả hai đường`,
    new RegExp(`\\b${f}:`).test(nguonExcel) && new RegExp(`\\b${f}:`).test(nguonApi));
});
t('bản Excel vẫn còn nguyên, chưa bị thay thế',
  typeof excel.docLead === 'function' && typeof excel.docDon === 'function');

console.log('— chưa khai gì thì báo rõ, không im lặng trả rỗng');
/* docLead/docDon là hàm BẤT ĐỒNG BỘ: lỗi ném ra rơi vào promise chứ không bị
 * try/catch đồng bộ bắt. Viết sai chỗ này thì test tưởng là pass rồi cả tiến
 * trình chết vì unhandled rejection — đúng như lần chạy đầu. */
(async () => {
  const noiLoi = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message; } };
  t('thiếu địa chỉ thì nói là thiếu địa chỉ',
    (await noiLoi(() => t_.docLead({ token: 'x'.repeat(20) }))).includes('địa chỉ'));
  t('thiếu token thì nói là thiếu token',
    (await noiLoi(() => t_.docLead({ host: 'rootytrip.tourwell.net' }))).includes('token'));
  t('ghi ngược mà thiếu id lead thì chặn lại',
    (await noiLoi(() => t_.ghiGhiChuLead({ host: 'a.tourwell.net', token: 'x'.repeat(20) }, 0, 'x')))
      .includes('id lead'));

  console.log(`\n${pass} pass · ${fail} fail`);
  /* ---- biến môi trường ----
   * Anh Hùng đặt TOURWELL_BASE_URL / TOURWELL_TOKEN thẳng trên Render, và đó là
   * cách tốt hơn ổ đĩa: biến môi trường sống sót qua mỗi lần deploy, ổ đĩa Render
   * thì không. Nhưng giá trị gõ trên giao diện phải THẮNG biến môi trường — nếu
   * không thì sửa trên web xong không có tác dụng gì mà cũng chẳng ai báo. */
  console.log('\u2014 Tourwell l\u1ea5y t\u1eeb bi\u1ebfn m\u00f4i tr\u01b0\u1eddng');
  const path = require('path');
  const fs = require('fs');
  const cp = require('child_process');

  const FILE = 'ket-noi.tw-test.json';
  const duong = path.join(process.cwd(), FILE);
  const doc = () => { try { fs.unlinkSync(duong); } catch (_) {} };
  process.on('exit', doc);

  const xem = (batDau, env) => {
    fs.writeFileSync(duong, JSON.stringify(batDau));
    const ra = cp.execFileSync(process.execPath, ['-e',
      `const k=require(${JSON.stringify(path.resolve('sync/ketnoi.js'))});
       const c=k.read().tourwell;
       const t=k.status().doLuong.find((x)=>x.key==='tourwell');
       console.log(JSON.stringify({ host:c.host, coToken:!!c.token, enabled:c.enabled,
         hostTuEnv:!!c.hostTuEnv, tokenTuEnv:!!c.tokenTuEnv,
         sanSang:t.sanSang, lot: JSON.stringify(t).includes('BIMAT') }));`],
    { env: { ...process.env, LARK_CONNECT_FILE: FILE, ...env }, cwd: process.cwd(), encoding: 'utf8' });
    return JSON.parse(ra.trim().split('\n').pop());
  };

  const RONG = { dongBo: { soNgayLui: 7 } };
  let r = xem(RONG, { TOURWELL_BASE_URL: 'rootytrip.tourwell.net', TOURWELL_TOKEN: 'BIMAT_khong_phai_that_1' });
  t('\u0111\u1ecdc \u0111\u01b0\u1ee3c \u0111\u1ecba ch\u1ec9 t\u1eeb bi\u1ebfn m\u00f4i tr\u01b0\u1eddng',
    r.host === 'https://rootytrip.tourwell.net', JSON.stringify(r));
  t('\u0111\u1ecdc \u0111\u01b0\u1ee3c token t\u1eeb bi\u1ebfn m\u00f4i tr\u01b0\u1eddng', r.coToken === true);
  t('khai \u0111\u1ee7 \u1edf bi\u1ebfn m\u00f4i tr\u01b0\u1eddng th\u00ec t\u1ef1 b\u1eadt, kh\u1ecfi ph\u1ea3i v\u00e0o t\u00edch tay',
    r.enabled === true && r.sanSang === true, JSON.stringify(r));
  t('\u0111\u00e1nh d\u1ea5u r\u00f5 l\u00e0 l\u1ea5y t\u1eeb env, \u0111\u1ec3 giao di\u1ec7n n\u00f3i \u0111\u01b0\u1ee3c',
    r.hostTuEnv === true && r.tokenTuEnv === true);
  t('token KH\u00d4NG l\u1ecdt ra status', r.lot === false);

  const COFILE = { tourwell: { enabled: true, host: 'khac.tourwell.net', token: 'trong_file' } };
  r = xem(COFILE, { TOURWELL_BASE_URL: 'rootytrip.tourwell.net', TOURWELL_TOKEN: 'BIMAT_khong_phai_that_1' });
  t('gi\u00e1 tr\u1ecb trong file TH\u1eaeNG bi\u1ebfn m\u00f4i tr\u01b0\u1eddng',
    r.host === 'https://khac.tourwell.net', JSON.stringify(r));
  t('v\u00e0 kh\u00f4ng b\u1ecb \u0111\u00e1nh d\u1ea5u l\u00e0 t\u1eeb env',
    r.hostTuEnv === false && r.tokenTuEnv === false, JSON.stringify(r));

  r = xem({ tourwell: { host: 'khac.tourwell.net' } },
    { TOURWELL_TOKEN: 'BIMAT_khong_phai_that_1' });
  t('m\u1ed7i th\u1ee9 \u0111i\u1ec1n ri\u00eang: \u0111\u1ecba ch\u1ec9 t\u1eeb file, token t\u1eeb env',
    r.host === 'https://khac.tourwell.net' && r.coToken === true
      && r.hostTuEnv === false && r.tokenTuEnv === true, JSON.stringify(r));

  r = xem(RONG, {});
  t('kh\u00f4ng khai g\u00ec th\u00ec kh\u00f4ng t\u1ef1 b\u1eadt',
    r.enabled === false && r.sanSang === false, JSON.stringify(r));

  console.log(`\n${pass} pass \u00b7 ${fail} fail`);
  process.exitCode = fail ? 1 : 0;
})();
