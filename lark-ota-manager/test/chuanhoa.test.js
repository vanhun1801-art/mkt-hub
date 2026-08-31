'use strict';
/**
 * Kiểm thử bộ chuẩn hoá payload OTA. THUẦN TÍNH TOÁN — không mạng, không Base,
 * không cần server chạy. Chạy: node test/chuanhoa.test.js
 *
 * Đây là chỗ đáng test nhất của app: nếu bảy kênh map sai một trường thì dashboard
 * vẫn xanh mà booking thì thiếu điểm đón hoặc lệch số tiền.
 */
const H = require('../chuanhoa');
const G = require('../gia');
const mau = require('../mau');
const cfg = require('../config');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

/* ------------------------------------------------------------------ số -- */
console.log('— đọc số tiền');
t('3.450.000 → 3450000', H.soTien('3.450.000') === 3450000, String(H.soTien('3.450.000')));
t('3,450,000 → 3450000', H.soTien('3,450,000') === 3450000, String(H.soTien('3,450,000')));
t('1234.56 → 1234.56', H.soTien('1234.56') === 1234.56);
t('1,234.56 → 1234.56', H.soTien('1,234.56') === 1234.56);
t('1.234,56 → 1234.56', H.soTien('1.234,56') === 1234.56, String(H.soTien('1.234,56')));
t('₫1.250.000 → 1250000', H.soTien('₫1.250.000') === 1250000, String(H.soTien('₫1.250.000')));
t('VND 168 → 168', H.soTien('VND 168') === 168);
t('rỗng → null', H.soTien('') === null && H.soTien(null) === null);
t('rác → null', H.soTien('N/A') === null, String(H.soTien('N/A')));

console.log('— đọc ngày');
t('2026-09-02 giữ nguyên', H.ngay('2026-09-02') === '2026-09-02');
t('2026-09-02T13:30:00+07:00', H.ngay('2026-09-02T13:30:00+07:00') === '2026-09-02');
t('02/09/2026 → 2026-09-02 (DD/MM)', H.ngay('02/09/2026') === '2026-09-02', H.ngay('02/09/2026'));
t('25/12/2026 → 2026-12-25', H.ngay('25/12/2026') === '2026-12-25', H.ngay('25/12/2026'));
t('12/25/2026 → 2026-12-25 (MM/DD vì 25>12)', H.ngay('12/25/2026') === '2026-12-25', H.ngay('12/25/2026'));
t('epoch giây', H.ngay(1788307200) === H.ngay(1788307200 * 1000), H.ngay(1788307200));
t('rác → rỗng', H.ngay('sắp tới') === '' && H.ngay('') === '');
t('tháng 13 → rỗng', H.ngay('05/13/2026') !== '2026-13-05', H.ngay('05/13/2026'));

console.log('— giờ đón');
t('lấy giờ trong chuỗi ISO', H.gio('2026-09-02T07:45:00+07:00') === '07:45');
t('07:45 giữ nguyên', H.gio('07:45') === '07:45');
t('8:00 → 08:00', H.gio('8:00') === '08:00');
t('không có giờ → rỗng', H.gio('sáng sớm') === '');

console.log('— số điện thoại');
t('0912 345 678 → 0912345678', H.dienThoai('0912 345 678') === '0912345678');
t('(+84) 912-345-678 giữ dấu +', H.dienThoai('(+84) 912-345-678') === '+84912345678', H.dienThoai('(+84) 912-345-678'));
t('N/A → rỗng', H.dienThoai('N/A') === '');
t('000 → rỗng (quá ngắn)', H.dienThoai('000') === '');

console.log('— trạng thái');
/* Năm giá trị dưới đây là ĐÚNG option của cột select "Trạng thái" trong Base.
 * Trả về chuỗi khác là Lark từ chối cả bản ghi, nên phép thử này canh đúng chỗ
 * dễ mất booking nhất. */
[['CONFIRMED', 'Đã xác nhận'], ['SUCCESS', 'Đã xác nhận'], ['approved', 'Đã xác nhận'],
 ['PAYMENT_COMPLETED', 'Đã hoàn thành'], ['redeemed', 'Đã hoàn thành'], ['checked-in', 'Đã hoàn thành'],
 ['pending', 'Chờ xác nhận'], ['NEW', 'Chờ xác nhận'], ['', 'Chờ xác nhận'],
 ['CANCELLED', 'Đã huỷ'], ['user_canceled', 'Đã huỷ'], ['REJECTED', 'Đã huỷ'],
 // Base không có trạng thái "Hoàn tiền" riêng — refund là một dạng huỷ
 ['REFUNDED', 'Đã huỷ'], ['refund_completed', 'Đã huỷ'],
 ['NO_SHOW', 'No-show'], ['no_show_cancelled', 'No-show']]
  .forEach(([vao, ra]) => t(`"${vao}" → ${ra}`, H.trangThai(vao) === ra, H.trangThai(vao)));
t('huỷ thắng xác nhận trong "confirmed then cancelled"',
  H.trangThai('confirmed then cancelled') === 'Đã huỷ', H.trangThai('confirmed then cancelled'));
t('mọi trạng thái trả về đều nằm trong option của Base',
  ['CONFIRMED', 'pending', 'NO_SHOW', 'REFUNDED', 'redeemed', 'gì đó lạ', '']
    .every((x) => cfg.trangThai.includes(H.trangThai(x))));

console.log('— thị trường khách (select của Base)');
[['ko-KR', 'Hàn Quốc'], ['한국', 'Hàn Quốc'], ['zh-CN', 'Trung Quốc'], ['en-US', 'Âu Mỹ'],
 ['vi', 'Việt Nam'], ['', ''], ['tiếng gì đó', '']]
  .forEach(([vao, ra]) => t(`"${vao}" → ${ra || '(để trống)'}`, H.thiTruong(vao) === ra, H.thiTruong(vao)));
t('không bao giờ trả option lạ',
  ['ko', 'xx', ''].every((x) => !H.thiTruong(x) || cfg.thiTruong.includes(H.thiTruong(x))));

/* --------------------------------------------------------- bảy kênh ----- */
console.log('— bảy kênh đều ra được trường bắt buộc');
const BAT_BUOC = ['maBooking', 'tenKhach', 'ngayDi', 'tour'];
cfg.kenh.forEach((k) => {
  const { booking } = H.chuanHoa(k.id, mau.mau(k.id));
  BAT_BUOC.forEach((f) => t(`${k.id}: có ${f}`, !!booking[f], JSON.stringify(booking[f])));
  t(`${k.id}: có số khách`, (booking.tongKhach || 0) > 0, String(booking.tongKhach));
  t(`${k.id}: có tổng tiền`, booking.tongTien != null, String(booking.tongTien));
  t(`${k.id}: kênh đúng tên Base`, booking.kenh === k.ten, booking.kenh);
});

console.log('— Klook: hoa hồng THẬT do OTA trả, không ước tính');
{
  const p = mau.mau('klook');
  const { booking } = H.chuanHoa('klook', p);
  t('2 người lớn', booking.nguoiLon === 2, String(booking.nguoiLon));
  t('1 trẻ em', booking.treEm === 1, String(booking.treEm));
  t('tổng 3 khách', booking.tongKhach === 3, String(booking.tongKhach));
  t('OTA bán 4.382.000', booking.tongTien === 4382000, String(booking.tongTien));
  t('hoa hồng 657.000 (số thật OTA trả)', booking.hoaHong === 657000, String(booking.hoaHong));
  t('map ra "Tour cano + cáp treo" (không phải "Tour cano 3 đảo")',
    booking.sanPham === 'Tour cano + cáp treo', booking.sanPham);
  t('thực nhận theo BẢNG GIÁ = 2×1.400.000 + 1×925.000 = 3.725.000',
    booking.thucNhan === 3725000, String(booking.thucNhan));
  t('nguồn doanh thu là bảng giá', booking.nguonThucNhan === 'bang-gia', booking.nguonThucNhan);
  t('số OTA báo khớp bảng giá ⇒ không lệch', booking.lechBangGia === null, String(booking.lechBangGia));
  t('KHÔNG gắn cờ ước tính', booking.hoaHongUocTinh === false);
  t('điểm đón lấy từ pickup_location', /Seashells/.test(booking.diemDon), booking.diemDon);
  t('giờ đón 07:45', booking.gioDon === '07:45', booking.gioDon);
  /* Booking có trẻ em thì KHÔNG bao giờ là "đủ thông tin": bảng giá tính trẻ em
   * theo chiều cao 1m–1m4 mà OTA gửi theo tuổi, nên luôn phải xác nhận tại điểm đón. */
  t('không thiếu SĐT / điểm đón / ngày đi',
    !/Chưa có/.test(H.chuoiCanXuLy(booking.canXuLy)), H.chuoiCanXuLy(booking.canXuLy));
  t('chỉ còn cờ nhắc xác nhận chiều cao trẻ em',
    H.chuoiCanXuLy(booking.canXuLy) === '⚠️ Trẻ em — xác nhận chiều cao 1m–1m4',
    H.chuoiCanXuLy(booking.canXuLy));
}

console.log('— WAUG không trả điểm đón → phải bật cờ, KHÔNG suy đoán');
{
  const { booking } = H.chuanHoa('waug', mau.mau('waug'));
  t('điểm đón rỗng', booking.diemDon === '', booking.diemDon);
  t('có cờ "Chưa có điểm đón"', H.chuoiCanXuLy(booking.canXuLy).includes('Chưa có điểm đón'),
    H.chuoiCanXuLy(booking.canXuLy));
  t('4 người lớn + 1 trẻ em từ mảng options',
    booking.nguoiLon === 4 && booking.treEm === 1, booking.nguoiLon + '/' + booking.treEm);
  t('tên tour tiếng Hàn vẫn map được sản phẩm', booking.sanPham === 'Tour cano 3 đảo', booking.sanPham);
  t('thực nhận theo bảng giá = 4×650.000 + 325.000 = 2.925.000',
    booking.thucNhan === 2925000, String(booking.thucNhan));
}

console.log('— MyRealTrip không trả SĐT → bật cờ');
{
  const { booking } = H.chuanHoa('myrealtrip', mau.mau('myrealtrip'));
  t('SĐT rỗng', booking.sdt === '', booking.sdt);
  t('có cờ "Chưa có SĐT"', H.chuoiCanXuLy(booking.canXuLy).includes('Chưa có SĐT'),
    H.chuoiCanXuLy(booking.canXuLy));
  t('điểm đón lấy từ accommodation', /Novotel/.test(booking.diemDon), booking.diemDon);
  t('hoa hồng suy từ tổng − net = 282.000 (10%)', booking.hoaHong === 282000, String(booking.hoaHong));
  t('không phải ước tính vì có net_price', booking.hoaHongUocTinh === false);
  t('mức cần xử lý là cao', H.mucCanXuLy(booking.canXuLy) === 'cao');
}

console.log('— GetYourGuide: tên tách first/last, tiền EUR phải cảnh báo');
{
  const { booking, canhBao } = H.chuanHoa('gyg', mau.mau('gyg'));
  t('ghép tên "Anna Kowalski"', booking.tenKhach === 'Anna Kowalski', booking.tenKhach);
  t('SĐT +48501234567', booking.sdt === '+48501234567', booking.sdt);
  t('tiền tệ EUR', booking.tienTe === 'EUR', booking.tienTe);
  t('hoa hồng = 68 − 47,6 = 20,4 EUR (giữ phần lẻ)', booking.hoaHong === 20.4, String(booking.hoaHong));
  /* ĐÂY LÀ CÁI BẢNG GIÁ NET GIẢI QUYẾT ĐƯỢC mà cách tính theo % không làm được:
   * OTA bán bằng EUR, doanh thu vẫn ra VNĐ chính xác, không cần tỷ giá. */
  t('bán bằng EUR nhưng thực nhận ra VNĐ theo bảng giá = 2×650.000',
    booking.thucNhan === 1300000, String(booking.thucNhan));
  t('KHÔNG còn cờ "chưa quy đổi" vì doanh thu đã là VNĐ',
    !H.chuoiCanXuLy(booking.canXuLy).includes('chưa quy đổi'), H.chuoiCanXuLy(booking.canXuLy));
  t('điểm đón lấy từ pickup.hotel_name', /Salinda/.test(booking.diemDon), booking.diemDon);
}

console.log('— Ctrip: mảng passengers kiểu Adult/Child');
{
  const { booking } = H.chuanHoa('ctrip', mau.mau('ctrip'));
  t('3 người lớn', booking.nguoiLon === 3, String(booking.nguoiLon));
  t('2 trẻ em', booking.treEm === 2, String(booking.treEm));
  t('tổng 5 khách', booking.tongKhach === 5, String(booking.tongKhach));
  t('SĐT +8613800138000', booking.sdt === '+8613800138000', booking.sdt);
  t('điểm đón InterContinental', /InterContinental/.test(booking.diemDon), booking.diemDon);
  t('tiền tệ CNY → cảnh báo', booking.tienTe === 'CNY');
}

console.log('— Viator: payload lồng sâu (logistics.travelerPickup.pickupPoint)');
{
  const { booking } = H.chuanHoa('viator', mau.mau('viator'));
  t('mã booking dạng BR-…', /^BR-/.test(booking.maBooking), booking.maBooking);
  t('ghép tên có dấu nháy', booking.tenKhach === "Michael O'Brien", booking.tenKhach);
  t('SĐT từ communication.phone', booking.sdt === '+353871234567', booking.sdt);
  t('email từ communication.email', booking.email === 'mobrien@example.ie', booking.email);
  t('paxMix → 2 + 2 = 4', booking.tongKhach === 4, String(booking.tongKhach));
  t('điểm đón lồng 3 tầng', /Sailing Club/.test(booking.diemDon), booking.diemDon);
  t('ghi chú specialRequirements', /wheelchair/i.test(booking.ghiChu), booking.ghiChu);
}

console.log('— KKday: đơn vị vé tiếng Trung, chưa có điểm đón');
{
  const { booking } = H.chuanHoa('kkday', mau.mau('kkday'));
  t('2 người lớn từ 成人', booking.nguoiLon === 2, String(booking.nguoiLon));
  t('SĐT từ contact_tel', booking.sdt === '+886912000111', booking.sdt);
  t('điểm đón rỗng → có cờ', H.chuoiCanXuLy(booking.canXuLy).includes('Chưa có điểm đón'));
}

/* ----------------------------------------------------------- cờ xử lý -- */
console.log('— % hoa hồng theo hợp đồng (dùng khi OTA KHÔNG trả số thật)');
{
  const MONG_DOI = { klook: 15, kkday: 15, gyg: 30, ctrip: 20, waug: 15, myrealtrip: 10, viator: 22 };
  Object.entries(MONG_DOI).forEach(([id, pt]) => {
    const k = cfg.kenh.find((x) => x.id === id);
    t(id + ' = ' + pt + '%', k && k.hoaHong === pt, k && String(k.hoaHong));
  });

  /* OTA không trả hoa hồng ⇒ ước tính đúng % của kênh đó, và thực nhận phải khớp. */
  Object.entries(MONG_DOI).forEach(([id, pt]) => {
    const { booking } = H.chuanHoa(id, {
      booking_ref_no: 'X-' + id, customer_name: 'A', participation_date: mau.ngay(5),
      activity_name: 'T', adults: 1, total_amount: 10000000, currency: 'VND',
      pickup_location: 'H', phone: '0900000000',
    });
    const hh = 10000000 * pt / 100;
    t(id + ': ước tính hoa hồng = ' + hh.toLocaleString('vi-VN'),
      booking.hoaHong === hh && booking.thucNhan === 10000000 - hh,
      booking.hoaHong + ' / ' + booking.thucNhan);
    t(id + ': có gắn cờ ước tính', booking.hoaHongUocTinh === true);
  });

  // OTA trả số thật thì KHÔNG được lấy % hợp đồng đè lên
  const { booking: thuc } = H.chuanHoa('gyg', {
    booking_reference: 'G1', traveler_name: 'B', date_time: mau.ngay(3),
    activity_name: 'T', number_of_travelers: 1, total_amount: 1000000,
    commission_amount: 180000, currency: 'VND', pickup: { hotel_name: 'H' }, phone_number: '0900000000',
  });
  t('OTA trả 18% thật thì giữ 18%, không đè bằng 30% hợp đồng',
    thuc.hoaHong === 180000 && thuc.hoaHongUocTinh === false, String(thuc.hoaHong));
}

console.log('— bảng giá NET: nhận sản phẩm từ tên tour OTA gửi');
{
  const th = (tour, mong, nl = 2, te = 0) => {
    const r = G.thucNhanTheoBangGia({ tour, ngay: '2026-09-02', nguoiLon: nl, treEm: te });
    const ra = r.sanPham ? r.sanPham.ten : '[' + r.loi + ']';
    t('"' + tour.slice(0, 44) + '" → ' + mong, ra === mong, ra);
  };
  // tiếng Việt
  th('Tour cano 3 đảo', 'Tour cano 3 đảo');
  th('Phú Quốc: Cano 3 đảo + Cáp treo Hòn Thơm', 'Tour cano + cáp treo');
  th('Tour Rạch Vẹm câu mực', 'Tour Rạch Vẹm');
  th('Tour Nam Đảo Kiss Of The Sea', 'Tour Nam Đảo Kiss Of The Sea');
  // tiếng Anh — Klook/GYG/Viator bán bằng tên tiếng Anh
  th('Phu Quoc 3-Island Speedboat Tour', 'Tour cano 3 đảo');
  th('3-Island Speedboat + Hon Thom Cable Car', 'Tour cano + cáp treo');
  th('Hon Thom Cable Car ticket', 'Tour Cáp treo Hòn Thơm');
  th('Starfish Beach (Rach Vem) half-day tour', 'Tour Rạch Vẹm');
  th('Symphony of the Sea show at Sunset Town', 'Tour Sunset Town (Symphony of the Sea)');
  // tiếng Hàn / tiếng Trung — WAUG, MyRealTrip, Ctrip
  th('푸꾸옥 3섬 스노클링 투어', 'Tour cano 3 đảo');
  th('푸꾸옥 케이블카 투어', 'Tour Cáp treo Hòn Thơm');
  th('푸꾸옥 빈원더스 + 그랜드월드', 'Tour Vinwonders - Grandworld');

  // KHÔNG được đoán bừa
  th('Tour lặn biển Nam Đảo', '[khong-thay]');
  th('富国岛四岛跳岛游（含浮潜）', '[khong-thay]');   // 4 đảo — không có trong bảng giá
  th('Show Kiss The Stars', '[khong-thay]');         // 'kiss' nhưng không phải Kiss of the Sea

  console.log('— bảng giá NET: tính tiền');
  const r1 = G.thucNhanTheoBangGia({ tour: 'Tour cano 3 đảo', ngay: '2026-09-02', nguoiLon: 2, treEm: 1 });
  t('2 NL + 1 TE cano 3 đảo = 1.625.000', r1.tien === 1625000, String(r1.tien));
  t('có in ra cách tính', /2 NL × 650.000 \+ 1 TE × 325.000/.test(r1.chiTiet || ''), r1.chiTiet);

  const r2 = G.thucNhanTheoBangGia({ tour: 'Tour cano 3 đảo', ngay: '2026-09-02', nguoiLon: 0, treEm: 0 });
  t('không có số khách → không tính, không đoán', r2.loi === 'khong-co-so-khach', r2.loi);

  const r3 = G.thucNhanTheoBangGia({ tour: 'Tour cano 3 đảo', ngay: '2026-01-01', nguoiLon: 2, treEm: 0 });
  t('ngày đi trước ngày hiệu lực bảng giá → không áp giá mới',
    r3.loi === 'chua-co-bang', r3.loi);
}

console.log('— bảng giá NET: phát hiện OTA trả thiếu');
{
  const base = {
    booking_ref_no: 'K1', customer_name: 'A', participation_date: mau.ngay(4),
    activity_name: 'Tour cano 3 đảo', adults: 2, children: 0,
    pickup_location: 'H', phone: '0900000000', currency: 'VND',
  };
  // bảng giá: 2 × 650.000 = 1.300.000. OTA báo trả đúng ⇒ không lệch
  let r = H.chuanHoa('klook', { ...base, total_amount: 1530000, net_amount: 1300000 });
  t('OTA trả đúng bảng giá ⇒ không lệch', r.booking.lechBangGia === null, String(r.booking.lechBangGia));
  t('không có cờ tiền', !H.chuoiCanXuLy(r.booking.canXuLy).includes('THIẾU'),
    H.chuoiCanXuLy(r.booking.canXuLy));

  // OTA báo trả 1.100.000 ⇒ thiếu 200.000
  r = H.chuanHoa('klook', { ...base, total_amount: 1530000, net_amount: 1100000 });
  t('OTA trả thiếu 200.000 ⇒ lech = 200000', r.booking.lechBangGia === 200000, String(r.booking.lechBangGia));
  t('cờ ĐỎ "OTA trả THIẾU 200.000đ"',
    H.chuoiCanXuLy(r.booking.canXuLy).includes('OTA trả THIẾU 200.000đ'),
    H.chuoiCanXuLy(r.booking.canXuLy));
  t('mức cần xử lý là cao', H.mucCanXuLy(r.booking.canXuLy) === 'cao');
  t('doanh thu vẫn ghi theo BẢNG GIÁ, không theo số OTA báo thiếu',
    r.booking.thucNhan === 1300000, String(r.booking.thucNhan));
  t('vẫn giữ số OTA tự báo để đối chiếu', r.booking.thucNhanOta === 1100000, String(r.booking.thucNhanOta));
  t('có cảnh báo đối chiếu thanh toán', r.canhBao.some((c) => /đối chiếu/i.test(c)), JSON.stringify(r.canhBao));

  // lệch 500đ (làm tròn) thì KHÔNG báo — nếu không cờ đỏ nổ suốt ngày
  r = H.chuanHoa('klook', { ...base, total_amount: 1530000, net_amount: 1299500 });
  t('lệch 500đ (làm tròn) thì bỏ qua', r.booking.lechBangGia === null, String(r.booking.lechBangGia));

  // chưa map được sản phẩm ⇒ rơi về ước tính theo %, và phải nói rõ
  r = H.chuanHoa('klook', { ...base, activity_name: 'Tour lặn biển tự do', total_amount: 1000000 });
  t('không map được ⇒ ước tính theo %', r.booking.nguonThucNhan === 'uoc-tinh', r.booking.nguonThucNhan);
  t('ước tính = 1.000.000 − 15% = 850.000', r.booking.thucNhan === 850000, String(r.booking.thucNhan));
  t('có cờ "Chưa map được sản phẩm"',
    H.chuoiCanXuLy(r.booking.canXuLy).includes('Chưa map được sản phẩm'),
    H.chuoiCanXuLy(r.booking.canXuLy));

  // OTA chỉ gửi tổng khách, không tách NL/TE ⇒ không tính được theo bảng giá
  r = H.chuanHoa('gyg', {
    booking_reference: 'G9', traveler_name: 'B', date_time: mau.ngay(3),
    activity_name: 'Tour cano 3 đảo', number_of_travelers: 3,
    total_amount: 2000000, currency: 'VND', pickup: { hotel_name: 'H' }, phone_number: '0900000000',
  });
  t('chỉ có tổng khách ⇒ cờ "Chưa tách người lớn / trẻ em"',
    H.chuoiCanXuLy(r.booking.canXuLy).includes('Chưa tách người lớn / trẻ em'),
    H.chuoiCanXuLy(r.booking.canXuLy));

  // trẻ em ⇒ luôn nhắc xác nhận chiều cao (bảng giá theo chiều cao, OTA gửi theo tuổi)
  r = H.chuanHoa('klook', { ...base, children: 1 });
  t('có trẻ em ⇒ cờ nhắc xác nhận chiều cao 1m–1m4',
    H.chuoiCanXuLy(r.booking.canXuLy).includes('chiều cao'),
    H.chuoiCanXuLy(r.booking.canXuLy));
}

console.log('— làm tròn tiền theo loại tiền tệ');
t('VNĐ làm tròn về đồng', H.lamTron(517500.6, 'VND') === 517501, String(H.lamTron(517500.6, 'VND')));
t('EUR giữ 2 số lẻ', H.lamTron(50.400000000000006, 'EUR') === 50.4, String(H.lamTron(50.400000000000006, 'EUR')));
t('không có tiền tệ thì coi là VNĐ', H.lamTron(1.5) === 2, String(H.lamTron(1.5)));

console.log('— cờ "Thông tin cần xử lý"');
{
  const day = {
    kenh: 'Klook', trangThai: 'Đã xác nhận', tenKhach: 'A', sdt: '0900000000',
    diemDon: 'Hotel', ngayDi: mau.ngay(5), tienTe: 'VND', hoaHongUocTinh: false,
  };
  t('đủ thông tin → ✅', H.chuoiCanXuLy(H.coCanXuLy(day)) === '✅ Đủ thông tin',
    H.chuoiCanXuLy(H.coCanXuLy(day)));
  t('mức ok', H.mucCanXuLy(H.coCanXuLy(day)) === 'ok');

  const satNgay = { ...day, trangThai: cfg.trangThaiMoi, ngayDi: mau.ngay(1) };
  t('còn 1 ngày mà chưa xác nhận → cờ cao',
    H.chuoiCanXuLy(H.coCanXuLy(satNgay)).includes('chưa xác nhận'),
    H.chuoiCanXuLy(H.coCanXuLy(satNgay)));

  const quaNgay = { ...day, trangThai: cfg.trangThaiMoi, ngayDi: mau.ngay(-3) };
  t('đã qua ngày đi mà chưa xác nhận',
    H.chuoiCanXuLy(H.coCanXuLy(quaNgay)).includes('Đã qua ngày đi'),
    H.chuoiCanXuLy(H.coCanXuLy(quaNgay)));

  const huy = { ...day, trangThai: 'Đã huỷ', sdt: '', diemDon: '' };
  t('booking đã huỷ KHÔNG đòi SĐT/điểm đón',
    !H.chuoiCanXuLy(H.coCanXuLy(huy)).includes('Chưa có'), H.chuoiCanXuLy(H.coCanXuLy(huy)));
  t('booking đã huỷ hiện đúng trạng thái',
    H.chuoiCanXuLy(H.coCanXuLy(huy)).includes('Đã huỷ'), H.chuoiCanXuLy(H.coCanXuLy(huy)));
}

console.log('— chống lấy sai / thiếu dữ liệu');
{
  const { booking, canhBao } = H.chuanHoa('klook', { activity_name: 'Tour trần' });
  t('không có mã booking → cảnh báo', canhBao.some((c) => /mã booking/i.test(c)), JSON.stringify(canhBao));
  t('không tự bịa tên khách', booking.tenKhach === '', booking.tenKhach);
  t('không tự bịa ngày đi', booking.ngayDi === '', booking.ngayDi);
  t('không tự bịa tiền', booking.tongTien === null, String(booking.tongTien));
  t('hoa hồng cũng để trống khi không có tiền', booking.hoaHong === null, String(booking.hoaHong));
  t('nhiều cờ cần xử lý', booking.canXuLy.filter((c) => c.muc === 'cao').length >= 3,
    H.chuoiCanXuLy(booking.canXuLy));
}
{
  let nem = null;
  try { H.chuanHoa('agoda', {}); } catch (e) { nem = e; }
  t('kênh lạ → lỗi 400', nem && nem.code === 400, nem && nem.message);
}
{
  // OTA gửi tổng khách lệch với người lớn + trẻ em: giữ số OTA, cảnh báo
  const { booking, canhBao } = H.chuanHoa('klook', {
    booking_ref_no: 'X1', customer_name: 'B', participation_date: mau.ngay(3),
    activity_name: 'T', adults: 2, children: 1, total_pax: 4, total_amount: 100000,
    pickup_location: 'H', phone: '0900000000',
  });
  t('giữ tổng khách của OTA (4)', booking.tongKhach === 4, String(booking.tongKhach));
  t('cảnh báo lệch số khách', canhBao.some((c) => /đối chiếu/i.test(c)), JSON.stringify(canhBao));
}
{
  // form-urlencoded phẳng (một số OTA nhỏ gửi kiểu này)
  const { booking } = H.chuanHoa('waug', {
    reservation_code: 'W9', user_name: 'C', use_date: '2026-10-01',
    product_title: 'T', user_phone: '0911222333', hotel: 'Kh', total_amount: '2.000.000',
  });
  t('payload phẳng vẫn đọc được', booking.maBooking === 'W9' && booking.tongTien === 2000000,
    JSON.stringify({ m: booking.maBooking, t: booking.tongTien }));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
