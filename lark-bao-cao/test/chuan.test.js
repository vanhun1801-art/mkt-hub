'use strict';
/**
 * Chuẩn theo vị trí — chỉ gọi hàm thuần, không chạm Base.
 * Chạy: node test/chuan.test.js
 */
const C = require('../chuan');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + JSON.stringify(vi) : '')); }
};

const chuan = C.chuanHoa(C.MAC_DINH);
const d = (nhom, phut, o = {}) => Object.assign({ congViec: o.ten || nhom + phut, nhom, phut, tienDoPt: 100, trangThai: 'Hoàn thành' }, o);

/* mặc định đúng số anh Hùng chốt 30/09 */
ok('chuẩn chung 80/20', chuan.chinhToiThieu === 80 && chuan.phuToiDa === 20);
ok('Editor 2,5 video', chuan.viTri.Editor.sanLuong[0].toiThieu === 2.5);
ok('Content 3 kịch bản · 4 bài đăng · 2 clip',
  chuan.viTri.Content.sanLuong.map((s) => s.toiThieu).join(',') === '3,4,2');
ok('Designer 2 thiết kế · 500 ảnh', chuan.viTri.Designer.sanLuong.map((s) => s.toiThieu).join(',') === '2,500');
ok('Website 5 đầu việc, đếm theo dòng', chuan.viTri.Website.sanLuong[0].toiThieu === 5 && chuan.viTri.Website.sanLuong[0].dem === 'dong');

/* phân bổ */
let kq = C.cham([d('Edit video', 180), d('Edit video', 150), d('Edit video', 90), d('Khác', 60)], 'Editor', chuan);
ok('Editor 3 clip, 87% việc chính → đạt', kq.muc === 'tot' && kq.chinhPt === 88, kq);
kq = C.cham([d('Edit video', 240), d('Khác', 240)], 'Editor', chuan);
ok('việc chính 50% → lệch', kq.muc === 'lech', kq);
kq = C.cham([d('Edit video', 180), d('Edit video', 180), d('Edit video', 30), d('Khác', 90)], 'Editor', chuan);
ok('việc chính 81%, đủ 3 video → đạt', kq.muc === 'tot', kq);
kq = C.cham([d('Edit video', 180), d('Edit video', 180), d('Khác', 120)], 'Editor', chuan);
ok('việc chính 75% (hụt 5 điểm, trong biên) → lưu ý', kq.muc === 'luu-y', kq);

/* Lỗi máy không tính vào mẫu số */
kq = C.cham([d('Edit video', 200), d('Edit video', 130), d('Edit video', 30), d('Lỗi máy / mất điện', 120)], 'Editor', chuan);
ok('lỗi máy 120 phút không làm tụt việc chính', kq.chinhPt === 100 && kq.boPhut === 120, kq);
ok('câu đánh giá có ghi phút lỗi máy', /lỗi máy\/mất điện 120 phút/.test(C.veCau(kq)), C.veCau(kq));

/* sản lượng theo phần tiến độ TĂNG trong ngày */
const truoc = new Map([['ma:A', 50]].map(([k, v]) => [k.replace('ma:', ''), v]));
kq = C.cham([
  d('Edit video', 200, { maViec: 'A', tienDoPt: 100 }),       // dựng tiếp 50 → 100 = 0,5
  d('Edit video', 200, { maViec: 'B', tienDoPt: 100 }),       // xong trọn = 1
  d('Edit video', 80, { maViec: 'C', tienDoPt: 50, trangThai: 'Đang làm' }), // dở = 0,5
], 'Editor', chuan, truoc);
ok('đếm phần tăng: 0,5 + 1 + 0,5 = 2 video', kq.sanLuong[0].dat === 2, kq.sanLuong);
ok('2/2,5 video → lưu ý dù phân bổ tốt', kq.muc === 'luu-y' && !kq.slOk, kq);

/* số lượng: 500 ảnh là một dòng */
kq = C.cham([
  d('Thiết kế', 200, { ten: 'banner' }), d('Thiết kế', 100, { ten: 'poster' }),
  d('Chỉnh ảnh', 180, { soLuong: 520 }),
], 'Designer', chuan);
ok('Designer: 2 thiết kế + 520 ảnh → đạt', kq.muc === 'tot' && kq.sanLuong[1].dat === 520, kq.sanLuong);

/* số ảnh từ app Chỉnh ảnh: lấy số lớn hơn giữa báo cáo và app */
kq = C.cham([d('Thiết kế', 200, { ten: 'a' }), d('Thiết kế', 100, { ten: 'b' }), d('Chỉnh ảnh', 180)],
  'Designer', chuan, new Map(), { anh: 708, video: 13 });
ok('ảnh hậu kỳ lấy 708 từ app Chỉnh ảnh', kq.sanLuong[1].dat === 708 && kq.muc === 'tot', kq.sanLuong);
ok('câu đánh giá ghi nguồn app Chỉnh ảnh', /708\/500 \(app Chỉnh ảnh\)/.test(C.veCau(kq)), C.veCau(kq));
kq = C.cham([d('Chỉnh ảnh', 400, { soLuong: 600 })], 'Designer', chuan, new Map(), { anh: 100, video: 0 });
ok('báo cáo ghi 600 > app 100 → lấy 600', kq.sanLuong[1].dat === 600, kq.sanLuong);

/* Content: 3 chỉ tiêu, phải đạt tất cả */
kq = C.cham([
  d('Kịch bản', 150, { soLuong: 3 }), d('Page', 45, { soLuong: 3 }), d('TikTok', 15),
  d('Edit video', 120), d('Edit video', 110), d('Báo cáo', 15),
], 'Content', chuan);
ok('Content đủ 3 kịch bản · 4 bài · 2 clip → đạt', kq.muc === 'tot', kq.sanLuong);
kq = C.cham([d('Kịch bản', 200), d('Page', 45, { soLuong: 4 }), d('Edit video', 120), d('Edit video', 100)], 'Content', chuan);
ok('Content thiếu kịch bản → lưu ý, ghi ✗', kq.muc === 'luu-y' && /kịch bản 1\/3 ✗/.test(C.veCau(kq)), C.veCau(kq));

/* Website đếm dòng */
kq = C.cham([1, 2, 3, 4, 5].map((i) => d('Website/SEO', 90, { ten: 'việc ' + i })), 'Website', chuan);
ok('Website 5 đầu việc → đạt', kq.muc === 'tot' && kq.sanLuong[0].dat === 5, kq);

kq = C.cham([d('Website/SEO', 150), d('OTA', 20), d('Họp', 90), d('Báo cáo', 120), d('Khác', 100)], 'Website', chuan);
ok('Website: họp/báo cáo/khác không phải đầu việc → 2/5', kq.sanLuong[0].dat === 2 && kq.muc === 'lech', kq.sanLuong);

/* lời nhắn cuối thẻ — đơn giản, không con số */
const tot = C.cham([d('Edit video', 200, { ten: 'a' }), d('Edit video', 150, { ten: 'b' }), d('Edit video', 100, { ten: 'c' })], 'Editor', chuan);
ok('tốt → lời khen, có "phát triển"', /^🌟 .*phát triển/.test(C.loiNhanThe(tot, chuan)[0]), C.loiNhanThe(tot, chuan));
const ly = C.cham([d('Edit video', 200)], 'Editor', chuan);
ok('lưu ý → lời nhắc nhẹ, không chữ "Cần lưu ý"', /^💡 /.test(C.loiNhanThe(ly, chuan)[0]) && !/Cần lưu ý|🚨/.test(C.loiNhanThe(ly, chuan).join()));
ok('trễ → thêm lời nhắc gửi sớm', /^⏰ .*sớm hơn/.test(C.loiNhanThe(tot, chuan, { tre: true })[1]));
const loi = C.cham([d('Edit video', 300, { ten: 'x' }), d('Lỗi máy / mất điện', 150)], 'Editor', chuan);
ok('lỗi máy → câu cân đối có số phút', C.loiNhanThe(loi, chuan).some((l) => /^⚙️ .*150 phút.*cân đối lại/.test(l)));
ok('không vị trí + trễ → chỉ dòng trễ', C.loiNhanThe(null, chuan, { tre: true }).length === 1);
ok('không vị trí, đúng hạn → không nhắn gì', C.loiNhanThe(null, chuan).length === 0);
ok('lời nhắn sửa được, rỗng thì về mặc định', C.chuanHoa({ loiNhan: { tot: 'Giỏi lắm', tre: '  ' } }).loiNhan.tot === 'Giỏi lắm' &&
  C.chuanHoa({ loiNhan: { tre: '  ' } }).loiNhan.tre === C.MAC_DINH.loiNhan.tre);

/* vị trí không có chuẩn */
ok('vị trí lạ → không chấm', C.cham([d('Khác', 480)], 'Quản lý', chuan) === null);

/* chuanHoa không tin dữ liệu bẩn */
const ban = C.chuanHoa({ chinhToiThieu: 500, phuToiDa: -3, viTri: { X: { nhomChinh: 'Page', sanLuong: [{ ten: '', nhom: ['Page'], toiThieu: 2 }, { ten: 'bài', nhom: ['Page'], toiThieu: 'abc' }] } } });
ok('kẹp % về 0–100', ban.chinhToiThieu === 100 && ban.phuToiDa === 0);
ok('bỏ chỉ tiêu không tên / không số', ban.viTri.X.sanLuong.length === 0 && Array.isArray(ban.viTri.X.nhomChinh));

/* tra vị trí theo email → open_id → tên, không dấu */
const bang = [{ ten: 'Nguyễn Long Khánh', email: 'khanhnl@rootytrip.com', openId: 'ou_1', viTri: 'Editor' }];
ok('tra theo email', C.viTriCua(bang, { email: 'KhanhNL@rootytrip.com' }) === 'Editor');
ok('tra theo open_id', C.viTriCua(bang, { id: 'ou_1' }) === 'Editor');
ok('tra theo tên bỏ dấu', C.viTriCua(bang, { ten: 'nguyen long khanh' }) === 'Editor');
ok('không thấy → rỗng', C.viTriCua(bang, { email: 'x@y' }) === '');

console.log('\n' + pass + ' pass · ' + fail + ' fail');
process.exit(fail ? 1 : 0);
