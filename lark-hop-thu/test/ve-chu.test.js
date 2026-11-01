'use strict';
/* Vẽ thân thư theo mục đích (public/app.js: tachKhoi, veChu). Cắt đúng các
 * hàm đó ra chạy riêng, không dựng cả giao diện. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const lay = (dau, cuoi) => { const i = app.indexOf(dau); const j = app.indexOf(cuoi, i); if (i < 0 || j < 0) throw new Error('Không thấy ' + dau); return app.slice(i, j); };
const ma = lay('const esc = ', '\n\nconst S = ') + '\n' +
  lay('/* gon: chỉ hiện tên miền', '\nconst laHep') + '\nthis.tachKhoi = tachKhoi; this.veChu = veChu; this.kieuThu = kieuThu;';
const g = {};
vm.runInNewContext(ma, g);

let pass = 0, fail = 0;
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

const FORM = 'Sent from: Anna <a@b.c>\nSubject: Service Booking Request\n\nFull Name: Anna\nPhone Number: +79057207710\n\nStart Date: 2026/11/04\nTotal Price: đ 3 100 000\n\nMessage:\nCan we pay by cash?\n\nThis email was sent from the contact form on the website Rootytrip (https://rootytrip.com/a/b)';
const d = g.veChu(FORM, 'don');
ok('form: lời khách lên đầu', d.startsWith('<div class="loi-khach">') && d.indexOf('Can we pay by cash?') < d.indexOf('<dl'));
ok('form: nhãn thành bảng', /<dt>Full Name<\/dt><dd>Anna<\/dd>/.test(d) && /<dt>Total Price<\/dt>/.test(d));
ok('form: dòng gửi từ, tiêu đề bị bỏ', !/Sent from|Subject/.test(d));
ok('form: dòng trống không cắt đôi bảng', (d.match(/<dl/g) || []).length === 1, (d.match(/<dl/g) || []).length + ' bảng');
ok('form: chân thư máy gửi chữ mờ', /class="chan-thu"/.test(d));
ok('link chỉ hiện tên miền', /rootytrip\.com\/…<\/a>/.test(d));

const BANG = 'Nhận phòng | Chủ nhật 01/11/2026\nKhách | 12 người lớn\nCN, 01/11 | 7.173.912 ₫\nTổng | 14.347.824 ₫';
const b = g.veChu(BANG, 'don');
ok('bảng có dấu |: mọi hàng vào một bảng, kể cả nhãn có số', (b.match(/<dt>/g) || []).length === 4 && /<dt>CN, 01\/11<\/dt>/.test(b));

const THU = 'Kính gửi Ban Giám Đốc,\n\n- Chi phí đã sử dụng: 160.000 VNĐ\n- Ngân sách đề xuất: 10.000.000 VNĐ\n\nMục tiêu: Duy trì quảng cáo Google Maps, tăng lượt hiển thị, cuộc gọi và thúc đẩy khách đặt phòng.\n\nLúc 10:30 hôm nay em gửi kế hoạch.';
const t = g.veChu(THU, 'thu');
ok('thư: gạch đầu dòng thành danh sách thật', /<ul><li>Chi phí đã sử dụng: 160\.000 VNĐ<\/li><li>/.test(t));
ok('thư: câu có dấu hai chấm vẫn là đoạn văn', /<p>Mục tiêu: Duy trì/.test(t) && !/<dt>Mục tiêu/.test(t));
ok('thư: giờ "10:30" không thành nhãn', /<p>Lúc 10:30 hôm nay/.test(t));

ok('ký tự ẩn và chỗ giữ mẫu bị bỏ', !/​|##/.test(g.veChu('Xem trước​‌‍\n##DownloadAttackFileInjectPosition##\nNội dung', 'tb')));
ok('chữ của thư luôn được thoát', !/<script>/.test(g.veChu('Tên: <script>x</script>', 'don')));
ok('mục đích: đơn khách đặt, form web, thông báo, thư', g.kieuThu({ ngan: 'don' }, {}) === 'don' &&
  g.kieuThu({ ngan: 'xu-ly' }, { tieuDe: 'Rootytrip "Liên hệ tư vấn"' }) === 'don' &&
  g.kieuThu({ ngan: 'biet' }, { tieuDe: 'UNC' }) === 'tb' && g.kieuThu({ ngan: 'xu-ly' }, { tieuDe: 'Đề xuất' }) === 'thu');

console.log('\n' + pass + ' pass · ' + fail + ' fail');
process.exit(fail ? 1 : 0);
