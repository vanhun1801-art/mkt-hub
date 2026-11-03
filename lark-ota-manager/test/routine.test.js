'use strict';
/**
 * Kiểm thử bộ đọc thư GoHost/Agoda của Routine Hospitality và phần gộp sự kiện.
 * THUẦN TÍNH TOÁN — không mạng, không Base. Chạy: node test/routine.test.js
 *
 * Thư mẫu chép đúng khuôn thư thật trong hộp pito@routinehospitality.vn
 * (11/2026), tên khách và mã đã thay bằng giá trị giả.
 */
const G = require('../routine/gohost');
const { gop } = require('../routine/gop');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const KS = '[CÔNG TY TNHH KHÁCH SẠN HÒN THƠM PHÚ QUỐC - PITO HOTEL]';
const DUOI = '\n\nĐể xem chi tiết đặt phòng, vui lòng truy cập tại đây. (https://click.gohost.vn/c/x)\n\nTrân trọng,\nĐội ngũ GoHost.';

const THU = {
  moi: [KS + ' - Bạn có đơn đặt phòng mới',
    'Đặt phòng mới\n\nThông tin đặt phòng:\n\n- Tên khách: Nguyen Van A\n\n- Nguồn đặt phòng: Agoda\n\n- Mã OTA: 1700000001\n\n' +
    '- Thời gian: 22/12/2026 - 23/12/2026 (1 đêm)\n\n- Loại phòng: 201\n\n- Số tiền: 1.187.406 ₫\n\n- Mã đặt phòng: PIOAAAAA1' + DUOI],
  moiBooking: [KS + ' - Bạn có đơn đặt phòng mới',
    'Đặt phòng mới\n\n- Tên khách: Tran Thi B\n\n- Nguồn đặt phòng: Booking\n\n- Mã OTA: 5700000002\n\n' +
    '- Thời gian: 23/12/2026 - 06/01/2027 (14 đêm)\n\n- Loại phòng: 201\n\n- Số tiền: 12.196.800 ₫\n\n- Mã đặt phòng: PIOBBBBB2' + DUOI],
  huy: [KS + ' - Hủy đặt phòng',
    'Đặt phòng đã bị hủy\n\nThông tin hủy:\n\n- Tên khách: Nguyen Van A\n\n- Ngày đến dự kiến: 22/12/2026\n\n' +
    '- Loại phòng: 201\n\n- Mã đặt phòng: PIOAAAAA1\n\n- Nguồn đặt phòng: Agoda' + DUOI],
  sua: ['Đơn OTA có sửa đổi: 5700000002 - Booking - Tran Thi B',
    'Chào Owner,\n\nĐơn phòng 5700000002 có sửa đổi từ OTA.\n\nNội dung thay đổi\n\nThông tin\nTrước sửa đổi\nSau sửa đổi\n\n' +
    'Tên khách\nTran Thi B\nTran Thi B\n\nNguồn\nBooking\nBooking\n\nThời gian\n24/12/2026 - 14/01/2027\n24/12/2026 - 12/01/2027\n\n' +
    'Loại phòng\nPremier Bathtub\nPremier Bathtub\n\nSố khách\n2\n2\n\nSố tiền\n18.295.200 VND\n16.552.800 VND\n\n' +
    'Ghi chú OTA\nMeal Plan: Giá phòng bao gồm bữa sáng.\nOTA Commission: 1829520\nMeal Plan: Giá phòng bao gồm bữa sáng.\nOTA Commission: 1655280\n\n' +
    'Hệ thống đã tự động cập nhật theo dữ liệu đặt phòng mới nhất từ OTA.'],
  doiPhong: [KS + ' Đơn PIOBBBBB2 đã đổi phòng',
    'Đơn PIOBBBBB2 đã đổi phòng\n\nThông tin thay đổi:\n\n- Phòng cũ: 201\n\n- Phòng mới: 601\n\nThông tin đặt phòng:\n\n' +
    '- Khách: Tran Thi B\n\n- Ngày đặt phòng: 01/11/2026\n\n- Nguồn: Booking\n\n- Mã OTA: 5700000002' + DUOI],
  nhan: [KS + ' - Thông báo khách đã nhận phòng',
    'Khách hàng đã nhận phòng thành công\n\n- Tên khách: Le Van C\n\n- Loại phòng: 601\n\n- Ngày nhận phòng: 02/11/2026\n\n' +
    '- Mã đặt phòng: PIOCCCCC3\n\n- Nguồn đặt phòng: Expedia\n\n- Số tiền: 1.352.448 ₫' + DUOI],
  tra: [KS + ' - Thông báo khách đã trả phòng',
    'Khách hàng đã hoàn tất trả phòng\n\n- Tên khách: Le Van C\n\n- Loại phòng: 601\n\n- Ngày trả phòng: 03/11/2026\n\n' +
    '- Mã đặt phòng: PIOCCCCC3\n\n- Nguồn đặt phòng: Expedia\n\n- Số tiền: 1.352.448 ₫' + DUOI],
  thanhToan: [KS + ' Đơn PIODDDDD4 đã thêm thanh toán',
    'Đơn PIODDDDD4 đã thêm thanh toán\n\nThông tin thanh toán:\n\n- Số tiền: 795.455 ₫\n\n- Phương thức thanh toán: Thẻ visa/master\n\n' +
    '- Số tiền còn lại: 0 ₫\n\nThông tin đặt phòng:\n\n- Khách: Pham D\n\n- Ngày đặt phòng: 02/11/2026\n\n- Nguồn: Website' + DUOI],
  hoaDon: ['CÔNG TY TNHH KHÁCH SẠN HÒN THƠM PHÚ QUỐC - PITO HOTEL | Hóa đơn tháng 10/2026', 'Hoá đơn dịch vụ GoHost.'],
};

const AGODA_XAC_NHAN = ['Agoda Booking ID 1700000001 - CONFIRMED Hotel Country: Vietnam Check-in 22-Dec-2026 (22-12-2026) / Language_English',
  'Booking ID\n\nMã số đặt phòng\n\n1700000001\n\nCustomer First Name\nTên Khách Hàng\n\nVan A\n\nCustomer Last Name\nHọ Khách Hàng\n\nNguyen\n\n' +
  'Country of Residence\nQuốc gia cư trú\n\nSouth Korea\n\nCheck-in\nNhận phòng\n\n22-Dec-2026 (22-12-2026)\n\nCheck-out\nTrả phòng\n\n23-Dec-2026 (23-12-2026)\n\n' +
  'Premier Double Room with Bathtub\n\n1\n\n2 Adults\n\n0\n\nSpecial Requests\nYêu cầu đặc biệt\n\n(\nAll special requests are subject to availability upon arrival.\n' +
  'Tất cả yêu cầu đặc biệt chỉ được đáp ứng tùy theo khả năng của khách sạn khi khách hàng nhận phòng.\n)\n\nNonSmoke, LargeBed\n\nCancellation Policy\n\n' +
  'Reference sell rate (incl. taxes & fees)\n\nGiá bán tham khảo (bao gồm thuế & phí)\n\nVND\n1,799,100.00\n\nCompensation\n\nKhoản bù trù\n\n' +
  '- Commission\nTiền hoa hồng\n\nVND\n-359,820.00\n'];

const doc = (k) => G.docGoHost(THU[k][0], THU[k][1]);

console.log('— đọc từng loại thư GoHost');
{
  const e = doc('moi');
  t('đơn mới: loại', e.loai === 'moi');
  t('đơn mới: mã GoHost + mã OTA', e.maGoHost === 'PIOAAAAA1' && e.maOta === '1700000001');
  t('đơn mới: ngày + số đêm', e.nhanPhong === '2026-12-22' && e.traPhong === '2026-12-23' && e.soDem === 1, JSON.stringify(e));
  t('đơn mới: số tiền 1.187.406', e.soTien === 1187406);
  t('Booking → Booking.com', doc('moiBooking').kenh === 'Booking.com');
  t('huỷ: mã + ngày đến', doc('huy').loai === 'huy' && doc('huy').maGoHost === 'PIOAAAAA1' && doc('huy').nhanPhong === '2026-12-22');
  const s = doc('sua');
  t('sửa: lấy cột SAU sửa đổi', s.traPhong === '2027-01-12' && s.soDem === 19 && s.soTien === 16552800, JSON.stringify(s));
  t('sửa: hoa hồng từ ghi chú SAU', s.hoaHong === 1655280, String(s.hoaHong));
  t('sửa: chỉ có mã OTA', s.maGoHost === '' && s.maOta === '5700000002');
  t('đổi phòng: 201 → 601', doc('doiPhong').phongCu === '201' && doc('doiPhong').loaiPhong === '601');
  t('nhận phòng', doc('nhan').loai === 'nhan-phong' && doc('nhan').ngayNhan === '2026-11-02');
  t('trả phòng', doc('tra').loai === 'tra-phong' && doc('tra').ngayTra === '2026-11-03');
  t('thanh toán: số đã trả + còn lại', doc('thanhToan').daTra === 795455 && doc('thanhToan').conLai === 0);
  t('thư hoá đơn → bỏ qua', doc('hoaDon') === null);
}

console.log('— thư Agoda');
{
  const a = G.docAgoda(...AGODA_XAC_NHAN);
  t('mã OTA', a.maOta === '1700000001');
  t('tên khách = Tên + Họ', a.tenKhach === 'Van A Nguyen', a.tenKhach);
  t('quốc gia', a.quocGia === 'South Korea');
  t('nhận/trả phòng', a.nhanPhong === '2026-12-22' && a.traPhong === '2026-12-23');
  t('2 người lớn', a.nguoiLon === 2 && a.treEm === 0);
  t('yêu cầu đặc biệt', a.yeuCau === 'NonSmoke, LargeBed', a.yeuCau);
  t('giá bán + hoa hồng', a.giaBan === 1799100 && a.hoaHong === 359820);
  t('thư Agoda khác → bỏ qua', G.docAgoda('Reply from X (Nov 1-2, 2026)', '') === null);
}

console.log('— gộp sự kiện thành booking');
{
  const su = (k, luc) => ({ luc, su: { ...doc(k), nguon: 'gohost' } });
  const ds = gop([
    { luc: '2026-11-02 21:10', su: { ...G.docAgoda(...AGODA_XAC_NHAN), nguon: 'agoda' } },
    su('moi', '2026-11-02 21:11'),
    su('huy', '2026-11-02 21:41'),
    su('moiBooking', '2026-11-01 09:38'),
    su('doiPhong', '2026-11-01 13:02'),
    su('sua', '2026-11-01 17:05'),
    su('nhan', '2026-11-02 14:59'),
    su('nhan', '2026-11-02 14:59'),
    su('tra', '2026-11-03 12:00'),
  ]);
  const theo = Object.fromEntries(ds.map((b) => [b.maGoHost, b]));
  t('ba đơn', ds.length === 3, ds.map((b) => b.maGoHost).join(','));
  const a = theo.PIOAAAAA1;
  t('Agoda đến trước GoHost vẫn nối được', a.quocGia === 'South Korea' && a.hoaHong === 359820);
  t('huỷ sau cùng → Đã huỷ', a.trangThai === 'Đã huỷ');
  const b = theo.PIOBBBBB2;
  t('thư sửa nối về mã GoHost qua mã OTA', b && b.daSua && b.soDem === 19 && b.soTien === 16552800, JSON.stringify(b));
  t('đổi phòng cập nhật phòng', b.phong === '601');
  t('vẫn Đã đặt', b.trangThai === 'Đã đặt');
  const c = theo.PIOCCCCC3;
  t('nhận rồi trả → Đã trả phòng', c.trangThai === 'Đã trả phòng' && c.nhanPhong === '2026-11-02' && c.traPhong === '2026-11-03');
  t('thư trùng chỉ ghi một lần', c.suKien.length === 2, JSON.stringify(c.suKien));
  t('lịch sử theo giờ', a.suKien[0].startsWith('2026-11-02 21:10'));
}

console.log('— cảnh báo chăm sóc và thống kê');
{
  const TK = require('../routine/thongke');
  const nay = '2026-11-03';
  const don = (o) => ({ id: o.ma, ma: o.ma, kenh: 'Agoda', trangThai: 'Đã đặt', chamSoc: '', ...o });
  const ds = TK.danhDau([
    don({ ma: 'A', nhanPhong: '2026-11-03', traPhong: '2026-11-04', soDem: 1, soTien: 1000000, ngayDat: '2026-11-01 10:00' }),
    don({ ma: 'B', nhanPhong: '2026-11-05', traPhong: '2026-11-07', soDem: 2, soTien: 3000000, ngayDat: '2026-10-01 10:00', chamSoc: 'Đã nhắn chào' }),
    don({ ma: 'C', kenh: 'Booking.com', trangThai: 'Đã huỷ', nhanPhong: '2026-12-01', soTien: 9000000 }),
    don({ ma: 'D', kenh: 'Expedia', trangThai: 'Đã nhận phòng', nhanPhong: '2026-11-02', soTien: 500000 }),
    don({ ma: 'E', trangThai: 'Đã đặt', nhanPhong: '2026-11-01', traPhong: '2026-11-02', soDem: 1 }),
  ], nay);
  const theo = Object.fromEntries(ds.map((b) => [b.ma, b]));
  t('nhận phòng hôm nay chưa liên hệ → cao', theo.A.muc === 'cao' && /hôm nay/.test(theo.A.canXuLy[0].nhan));
  t('đã nhắn chào → không báo chưa liên hệ', !theo.B.canXuLy.some((c) => /liên hệ|nhắn chào/.test(c.nhan)), JSON.stringify(theo.B.canXuLy));
  t('đơn huỷ không có việc', theo.C.canXuLy[0].nhan === 'Đã huỷ');
  t('quá ngày nhận phòng chưa báo nhận → cao', theo.E.muc === 'cao');
  t('đang ở thiếu ngày trả phòng → vừa', theo.D.canXuLy.some((c) => c.nhan === 'Thiếu ngày trả phòng'));
  const vh = TK.vanHanh(ds, nay);
  const so = (k) => vh.the.find((x) => x.khoa === k).so;
  t('thẻ nhận phòng hôm nay = 1', so('hom-nay') === 1);
  t('thẻ đang ở = 1', so('dang-o') === 1);
  t('thẻ chưa nhắn chào chỉ tính đơn sắp tới', so('chua-chao') === 1, String(so('chua-chao')));
  const tk = TK.thongKe(ds);
  t('đơn huỷ không cộng tiền', tk.tong.tien === 4500000 && tk.tong.huy === 1, JSON.stringify(tk.tong));
  t('giá TB/đêm chỉ tính đơn biết số đêm', tk.tong.giaDem === Math.round(4000000 / 4), String(tk.tong.giaDem));
  t('đặt trước TB = (2 + 35) / 2', tk.tong.datTruocTb === 18.5, String(tk.tong.datTruocTb));
  t('lọc theo kênh', TK.loc(ds, { kenh: ['Expedia'] }).length === 1);
  t('lọc theo ngày nhận phòng', TK.loc(ds, { truong: 'nhanPhong', from: '2026-11-03', to: '2026-11-05' }).length === 2);
  t('tìm theo mã', TK.loc(ds, { tim: 'b' }).map((b) => b.ma).join() === 'B');
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
