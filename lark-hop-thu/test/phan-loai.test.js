'use strict';
/**
 * Xếp ngăn bằng luật. Mẫu thư lấy từ hộp thư thật ngày 28/10/2026 (chỉ tiêu
 * đề và người gửi). Chỗ sai nguy hiểm nhất là thư CẦN TRẢ LỜI rơi vào "Chỉ để
 * đọc": người ta không mở ngăn đó và đề xuất nằm im.
 */
const { xep, NGAN } = require('../phan-loai');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

const cfg = { sep: ['ceo@rootytrip.com', 'deputy.ceo@rootytrip.com'] };
const minh = ['hunglv@rootytrip.com', 'cmo@rootytrip.com'];
const thu = (email, tieuDe) => ({ tu: { email, ten: '' }, tieuDe });
const xepDu = (email, tieuDe, them = {}) => xep(thu(email, tieuDe), Object.assign({ cfg, minh }, them));
const ngan = (email, tieuDe, them = {}) => xepDu(email, tieuDe, them).ngan;

console.log('\nBa ngăn');
ok('đủ ba ngăn theo thứ tự', NGAN.map((n) => n.id).join() === 'xu-ly,don,biet');
ok('tên ngăn nói việc phải làm', NGAN.map((n) => n.ten).join() === 'Cần trả lời,Đơn khách đặt,Chỉ để đọc');

console.log('\nBan giám đốc');
const ceo = xepDu('ceo@rootytrip.com', 'Trả lời: ĐỀ XUẤT PHÊ DUYỆT CHI PHÍ NHẬP QUỸ MARKETING THÁNG 11');
ok('CEO trả lời đề xuất → Cần trả lời, có cờ Ban giám đốc', ceo.ngan === 'xu-ly' && ceo.sep === true);
ok('CEO chuyển tiếp → Cần trả lời', ngan('ceo@rootytrip.com', 'Chuyển tiếp: Các vấn đề về chính sách (1)') === 'xu-ly');
ok('Phó TGĐ gửi thông báo vẫn vào Cần trả lời', ngan('deputy.ceo@rootytrip.com', 'Thông báo định hướng sử dụng nhận diện') === 'xu-ly');
ok('nhân viên thì không có cờ Ban giám đốc', xepDu('hanpm@rootytrip.com', 'Đề xuất').sep === false);
ok('luật tay chuyển thư sếp đi thì cờ vẫn giữ',
  xepDu('ceo@rootytrip.com', 'x', { tay: { 'ceo@rootytrip.com': 'biet' } }).sep === true);

console.log('\nCần trả lời');
ok('nhân viên xin duyệt', ngan('hanpm@rootytrip.com', 'Xác nhận và phê duyệt quyền lợi du lịch') === 'xu-ly');
ok('đề xuất chi thưởng', ngan('hangvtc@rootytrip.com', 'ĐỀ XUẤT CHI THƯỞNG THÁNG 06 + 08/2026 CHO HDV') === 'xu-ly');
const la = xepDu('karim@gmail.com', 'Request for 16-Seater Minibus Quote');
ok('thư lạ không luật nào nhận → Cần trả lời, không giấu đi', la.ngan === 'xu-ly' && la.nguon === 'mac-dinh');
ok('thư lạ không mang chữ kỹ thuật "Chưa luật nào nhận"', la.lyDo === '');
ok('hộp marketing@ của mình KHÔNG bị coi là máy gửi',
  ngan('marketing@rootytrip.com', 'Kế hoạch tháng 11') === 'xu-ly');

console.log('\nĐơn khách đặt');
ok('form đặt dịch vụ trên web', ngan('phuquoc@rootytrip.com', 'Rootytrip "Đặt Dịch Vụ"') === 'don');
ok('form đặt dịch vụ tiếng Anh', ngan('phuquoc@rootytrip.com', 'Rootytrip "Service Booking Request"') === 'don');
ok('form đặt dịch vụ tiếng Nga', ngan('phuquoc@rootytrip.com', 'Rootytrip "Бронирование услуги"') === 'don');
ok('booking mới của khách sạn', ngan('pito@routinehospitality.vn', '[Booking mới] PITO Hòn Thơm · 1 × Superior') === 'don');

console.log('\nChỉ để đọc');
ok('UNC Tourwell', ngan('booking@tourwell.vn', '[ROOTY TRIP PHU QUOC] Gửi UNC - Người nhận QUỸ MARKETING') === 'biet');
ok('bản lưu đơn Tourwell không bị luật "đặt dịch vụ" kéo sang Đơn khách đặt',
  ngan('booking@tourwell.vn', '[ROOTY TRIP PHU QUOC] Yêu cầu đặt dịch vụ khách hàng Lê Văn Hùng') === 'biet');
ok('hoá đơn điện tử từ máy gửi vẫn là chứng từ', ngan('no-reply@meinvoice.vn', 'gửi hóa đơn điện tử số 00000003') === 'biet');
ok('thông báo HCNS', ngan('chro@rootytrip.com', 'THÔNG BÁO ĐĂNG KÝ LỊCH LÀM VIỆC - [TB tự động]') === 'biet');
ok('thư mình tự gửi từ cmo@', ngan('cmo@rootytrip.com', 'ĐỀ XUẤT HỢP TÁC TRUYỀN THÔNG PITO HOTEL') === 'biet');
ok('mã xác nhận MISA', ngan('no-reply@misa.vn', '450636 là mã xác nhận đăng nhập tài khoản MISA') === 'biet');
ok('mã xác minh Trip.com (người gửi không có chữ noreply)',
  ngan('lodgingsupport@trip.com', 'Mã xác minh Trip eBooking của quý vị') === 'biet');
ok('noreply nằm giữa địa chỉ', ngan('ads-account-noreply@google.com', 'Chấp nhận lời mời truy cập') === 'biet');
ok('automated@airbnb.com', ngan('automated@airbnb.com', 'Chúng tôi đã gửi khoản chi trả') === 'biet');
ok('mailer-daemon', ngan('mailer-daemon@larksuite.com', 'Message was bounced back') === 'biet');
ok('thư nền tảng (Expedia, Trip.com) chỉ để đọc', ngan('partner@expediagroup.com', 'Your email was updated yesterday') === 'biet' &&
  ngan('ebooking@trip.com', 'Bạn nhận được lời mời tham gia Trip.com eBooking') === 'biet');
ok('booking mới từ nền tảng vẫn là đơn', ngan('noreply@agoda.com', '[Booking mới] Superior 29/10') === 'don');
ok('khách viết từ gmail không bị coi là nền tảng', ngan('khach@gmail.com', 'Travel to Phu Quoc') === 'xu-ly');

console.log('\nThứ tự ưu tiên');
ok('luật tay thắng luật cài sẵn',
  ngan('ceo@rootytrip.com', 'Chuyển tiếp: thư mời sự kiện', { tay: { 'ceo@rootytrip.com': 'biet' } }) === 'biet');
ok('luật tay với ngăn lạ bị bỏ qua',
  ngan('ceo@rootytrip.com', 'Trả lời: x', { tay: { 'ceo@rootytrip.com': 'xoa-het' } }) === 'xu-ly');
ok('luật tay của bản cũ vẫn chạy: "tu-dong" thành Chỉ để đọc, "sep" thành Cần trả lời',
  ngan('a@b.vn', 'x', { tay: { 'a@b.vn': 'tu-dong' } }) === 'biet' &&
  ngan('no-reply@b.vn', 'x', { tay: { 'no-reply@b.vn': 'sep' } }) === 'xu-ly');
ok('AI chỉ dùng khi luật không nhận',
  ngan('karim@gmail.com', 'Minibus quote', { ai: { ngan: 'don' } }) === 'don' &&
  ngan('ceo@rootytrip.com', 'Trả lời: x', { ai: { ngan: 'biet' } }) === 'xu-ly');
ok('AI đã lưu từ bản cũ ("tu-dong") vẫn dùng được', ngan('karim@gmail.com', 'x', { ai: { ngan: 'tu-dong' } }) === 'biet');
ok('AI trả ngăn lạ thì về mặc định', ngan('karim@gmail.com', 'x', { ai: { ngan: 'rac' } }) === 'xu-ly');

console.log('\nThư Lark xếp vào Thư rác (mẫu thật của sales@, 29/10/2026)');
const rac = (ten, email, tieuDe) => xep({ tu: { ten, email }, tieuDe, rac: true }, { cfg: {} }).ngan;
ok('khách hỏi báo giá bị xếp nhầm vào Thư rác: Cần trả lời',
  rac('Matteo Colantoni', 'mc.gazza91@gmail.com', 'Quotation Request – Snorkeling + Hon Thom Cable Car – 3 Dec') === 'xu-ly');
ok('mạo danh Meta từ tên miền lạ: Chỉ để đọc, kể cả tiêu đề có chữ "request"',
  rac('MetaAdsSupport', 'x@n.tinhochay.org', 'Copyright Appeal Request for Your Page') === 'biet');
ok('mạo danh nhà đăng ký tên miền: Chỉ để đọc', rac('TenTen Vn', 'ambul@roliambulance.be', 'Urgent: Final Notice for Domain Renewal') === 'biet');
ok('thư rác không có dấu hiệu gì: Chỉ để đọc, không theo mặc định Cần trả lời',
  rac('Sunset Sanato', 'sales@sunset.vn', 'Phú Quốc - Giảm 20% giá lữ hành cao điểm') === 'biet');
ok('luật tay vẫn thắng cả thư rác',
  xep({ tu: { ten: 'X', email: 'x@y.vn' }, tieuDe: 'Giảm giá', rac: true }, { cfg: {}, tay: { 'x@y.vn': 'xu-ly' } }).ngan === 'xu-ly');

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
