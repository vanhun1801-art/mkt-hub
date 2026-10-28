'use strict';
/**
 * Xếp ngăn bằng luật. Mẫu thư lấy từ hộp thư thật ngày 28/10/2026 (chỉ tiêu
 * đề và người gửi). Chỗ sai nguy hiểm nhất là thư CẦN XỬ LÝ rơi vào "Để biết"
 * hay "Tự động": người ta không mở ngăn đó và đề xuất nằm im.
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
const ngan = (email, tieuDe, them = {}) => xep(thu(email, tieuDe), Object.assign({ cfg, minh }, them)).ngan;

console.log('\nBốn ngăn');
ok('đủ bốn ngăn theo thứ tự', NGAN.map((n) => n.id).join() === 'xu-ly,sep,biet,tu-dong');

console.log('\nBan giám đốc');
ok('CEO trả lời đề xuất → Sếp giao',
  ngan('ceo@rootytrip.com', 'Trả lời: ĐỀ XUẤT PHÊ DUYỆT CHI PHÍ NHẬP QUỸ MARKETING THÁNG 11') === 'sep');
ok('CEO chuyển tiếp → Sếp giao', ngan('ceo@rootytrip.com', 'Chuyển tiếp: Các vấn đề về chính sách (1)') === 'sep');
ok('Phó TGĐ → Sếp giao', ngan('deputy.ceo@rootytrip.com', 'Thông báo định hướng sử dụng nhận diện') === 'sep');

console.log('\nCần xử lý');
ok('nhân viên xin duyệt', ngan('hanpm@rootytrip.com', 'Xác nhận và phê duyệt quyền lợi du lịch') === 'xu-ly');
ok('đề xuất chi thưởng', ngan('hangvtc@rootytrip.com', 'ĐỀ XUẤT CHI THƯỞNG THÁNG 06 + 08/2026 CHO HDV') === 'xu-ly');
ok('form đặt dịch vụ trên web', ngan('phuquoc@rootytrip.com', 'Rootytrip "Đặt Dịch Vụ"') === 'xu-ly');
ok('form đặt dịch vụ tiếng Anh', ngan('phuquoc@rootytrip.com', 'Rootytrip "Service Booking Request"') === 'xu-ly');
ok('form đặt dịch vụ tiếng Nga', ngan('phuquoc@rootytrip.com', 'Rootytrip "Бронирование услуги"') === 'xu-ly');
ok('booking mới của khách sạn', ngan('pito@routinehospitality.vn', '[Booking mới] PITO Hòn Thơm · 1 × Superior') === 'xu-ly');
const la = xep(thu('karim@gmail.com', 'Request for 16-Seater Minibus Quote'), { cfg, minh });
ok('thư lạ không luật nào nhận → Cần xử lý, không giấu đi', la.ngan === 'xu-ly' && la.nguon === 'mac-dinh');

console.log('\nĐể biết');
ok('UNC Tourwell', ngan('booking@tourwell.vn', '[ROOTY TRIP PHU QUOC] Gửi UNC - Người nhận QUỸ MARKETING') === 'biet');
ok('bản lưu đơn Tourwell không bị luật "đặt dịch vụ" kéo sang Cần xử lý',
  ngan('booking@tourwell.vn', '[ROOTY TRIP PHU QUOC] Yêu cầu đặt dịch vụ khách hàng Lê Văn Hùng') === 'biet');
ok('hoá đơn điện tử từ máy gửi vẫn là chứng từ', ngan('no-reply@meinvoice.vn', 'gửi hóa đơn điện tử số 00000003') === 'biet');
ok('thông báo HCNS', ngan('chro@rootytrip.com', 'THÔNG BÁO ĐĂNG KÝ LỊCH LÀM VIỆC - [TB tự động]') === 'biet');
ok('thư mình tự gửi từ cmo@', ngan('cmo@rootytrip.com', 'ĐỀ XUẤT HỢP TÁC TRUYỀN THÔNG PITO HOTEL') === 'biet');

console.log('\nTự động');
ok('mã xác nhận MISA', ngan('no-reply@misa.vn', '450636 là mã xác nhận đăng nhập tài khoản MISA') === 'tu-dong');
ok('mã xác minh Trip.com (người gửi không có chữ noreply)',
  ngan('lodgingsupport@trip.com', 'Mã xác minh Trip eBooking của quý vị') === 'tu-dong');
ok('noreply nằm giữa địa chỉ', ngan('ads-account-noreply@google.com', 'Chấp nhận lời mời truy cập') === 'tu-dong');
ok('automated@airbnb.com', ngan('automated@airbnb.com', 'Chúng tôi đã gửi khoản chi trả') === 'tu-dong');
ok('mailer-daemon', ngan('mailer-daemon@larksuite.com', 'Message was bounced back') === 'tu-dong');
ok('hộp marketing@ của mình KHÔNG bị coi là máy gửi',
  ngan('marketing@rootytrip.com', 'Kế hoạch tháng 11') === 'xu-ly');

console.log('\nThứ tự ưu tiên');
ok('luật tay thắng luật cài sẵn',
  ngan('ceo@rootytrip.com', 'Chuyển tiếp: thư mời sự kiện', { tay: { 'ceo@rootytrip.com': 'biet' } }) === 'biet');
ok('luật tay với ngăn lạ bị bỏ qua',
  ngan('ceo@rootytrip.com', 'Trả lời: x', { tay: { 'ceo@rootytrip.com': 'xoa-het' } }) === 'sep');
ok('AI chỉ dùng khi luật không nhận',
  ngan('karim@gmail.com', 'Minibus quote', { ai: { ngan: 'tu-dong' } }) === 'tu-dong' &&
  ngan('ceo@rootytrip.com', 'Trả lời: x', { ai: { ngan: 'tu-dong' } }) === 'sep');
ok('AI trả ngăn lạ thì về mặc định', ngan('karim@gmail.com', 'x', { ai: { ngan: 'rac' } }) === 'xu-ly');

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
