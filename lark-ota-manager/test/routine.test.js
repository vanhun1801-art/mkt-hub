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

  /* Anh Hùng chốt 03/11/2026: không có thư trả phòng mà đã qua ngày trả thì coi là đã trả. */
  const suy = TK.danhDau([
    don({ ma: 'OTA-1', nhanPhong: '2026-10-29', traPhong: '2026-10-30' }),
    don({ ma: 'PIODANGO', trangThai: 'Đã nhận phòng', nhanPhong: '2026-11-01', traPhong: '2026-11-02' }),
    don({ ma: 'PIOCHUANHAN', nhanPhong: '2026-11-01', traPhong: '2026-11-02' }),
    don({ ma: 'PIOOCHUATRA', trangThai: 'Đã nhận phòng', nhanPhong: '2026-11-02', traPhong: '2026-11-05' }),
  ], nay);
  const s2 = Object.fromEntries(suy.map((b) => [b.ma, b]));
  t('đơn chỉ có thư OTA, qua ngày trả → Đã trả phòng', s2['OTA-1'].trangThai === 'Đã trả phòng' && s2['OTA-1'].suyRa);
  t('đơn đang ở, qua ngày trả → Đã trả phòng', s2.PIODANGO.trangThai === 'Đã trả phòng' && s2.PIODANGO.trangThaiThu === 'Đã nhận phòng');
  t('đơn GoHost chưa nhận phòng vẫn cảnh báo', s2.PIOCHUANHAN.trangThai === 'Đã đặt' && s2.PIOCHUANHAN.muc === 'cao');
  t('đơn còn trong kỳ ở vẫn là Đang ở', s2.PIOOCHUATRA.trangThai === 'Đã nhận phòng' && !s2.PIOOCHUATRA.suyRa);
  t('thẻ Đang ở chỉ còn đơn chưa tới ngày trả', TK.vanHanh(suy, nay).the.find((x) => x.khoa === 'dang-o').so === 1);
}

console.log('— thư Agoda bổ sung ngày trả cho đơn chỉ có thư nhận phòng');
{
  const nhan = { luc: '2026-11-01 17:34', su: { loai: 'nhan-phong', maGoHost: 'PIOZZZZZ9', maOta: '', kenh: 'Agoda',
    tenKhach: 'Kim Minsu', ngayNhan: '2026-11-01', loaiPhong: '201', soTien: 1319340, nguon: 'gohost' } };
  const agoda = { luc: '2026-10-31 02:26', su: { maOta: '1792200000', kenh: 'Agoda', trangThaiAgoda: 'CONFIRMED',
    tenKhach: 'Kim Minsu', nhanPhong: '2026-11-01', traPhong: '2026-11-02', nguoiLon: 2, treEm: 0, nguon: 'agoda' } };
  const [b] = gop([nhan, agoda]);
  t('nối theo tên + ngày nhận, lấy ngày trả', b.traPhong === '2026-11-02' && b.soDem === 1 && b.maOta === '1792200000', JSON.stringify(b));
}

console.log('— báo nhóm Booking KS');
{
  process.env.ROUTINE_BAO_TU = '2026-11-01 00:00';
  const BN = require('../routine/bao-nhom');
  const b = {
    ma: 'PIOAAAAA1', maOta: '1793490711', kenh: 'Agoda', tenKhach: 'Nguyen Van A', quocGia: 'Vietnam',
    nhanPhong: '2026-11-13', traPhong: '2026-11-14', soDem: 1, phong: '202',
    hangPhong: 'Superior Double Room (Room + 2 Cable Car & Water Park Tickets)', nguoiLon: 2, treEm: 1,
    soTien: 2137806, ghiChu: 'NonSmoke, LargeBed', ngayDat: '2026-11-03 16:58', trangThai: 'Đã đặt',
    lichSu: '2026-11-03 16:57 · Agoda xác nhận\n2026-11-03 16:58 · Đơn mới',
  };
  const bai = BN.soanBai(b).zh_cn;
  const chu = bai.content.map((d) => d.map((x) => x.text).join('')).join('\n');
  t('tiêu đề "Agoda - Khách Việt Nam"', bai.title === 'Agoda - Khách Việt Nam', bai.title);
  t('mã booking + mã GoHost', chu.includes('Mã booking: 1793490711  (GoHost PIOAAAAA1)'));
  t('thời gian lưu trú', chu.includes('Thời gian lưu trú: 13/11/2026 - 14/11/2026 (1 đêm)'));
  t('loại phòng + số phòng, gói tách dòng riêng', chu.includes('Loại phòng: Superior Double Room, phòng 202') && chu.includes('Gói: Phòng + 2 cáp'), chu);
  t('02 NL + 01 TE', chu.includes('Số lượng khách: 02 NL + 01 TE'));
  t('số tiền Agoda thanh toán', chu.includes('Số tiền: 2.137.806 đ (Agoda thanh toán)'), chu);
  t('đặt trước 10 ngày', chu.includes('Đặt lúc: 16:58 03/11, trước 10 ngày'));
  t('không kèm link vào app', !bai.content.some((d) => d.some((x) => x.tag === 'a')) && !chu.includes('Marketing Hub'));
  t('quốc gia lạ giữ nguyên', BN.tenQuocGia('Kazakhstan') === 'Kazakhstan' && BN.tenQuocGia('South Korea') === 'Hàn Quốc');

  const nay = Date.parse('2026-11-03T17:05:00+07:00');
  t('đơn mới trong 24h → gửi', (BN.canBao(b, nay) || {}).loai === 'moi');
  t('đơn đã huỷ → không gửi tin mới', BN.canBao({ ...b, trangThai: 'Đã huỷ' }, nay) === null);
  t('đơn cũ hơn 24h → không gửi', BN.canBao(b, nay + 2 * 864e5) === null);
  t('đơn đặt trước mốc bật tính năng → không gửi', BN.canBao({ ...b, ngayDat: '2026-10-31 23:00' }, Date.parse('2026-11-01T08:00:00+07:00')) === null);
  t('Agoda chưa có thư Agoda, mới 3 phút → đợi', BN.canBao({ ...b, quocGia: '' }, Date.parse('2026-11-03T17:01:00+07:00')) === null);

  const daGui = { ...b, tinNhom: 'om_1', daBaoNhom: b.lichSu };
  t('đã gửi, không có gì mới → im', BN.canBao(daGui, nay) === null);
  const huy = { ...daGui, trangThai: 'Đã huỷ', lichSu: b.lichSu + '\n2026-11-03 19:00 · Agoda báo huỷ\n2026-11-03 19:00 · Huỷ' };
  const v = BN.canBao(huy, nay);
  t('huỷ → trả lời trong luồng, chỉ một câu dù có hai thư huỷ', v && v.loai === 'traLoi' && v.canNoi.length === 1 && v.dongs.length === 2, JSON.stringify(v));
  t('câu trả lời huỷ', /^Khách đã huỷ đặt phòng \(Agoda báo lúc 19:00 03\/11\)\.$/.test(BN.soanTraLoi(huy, v.canNoi)), BN.soanTraLoi(huy, v.canNoi));
  const huy2 = { ...huy, daBaoNhom: b.lichSu + '\n2026-11-03 19:00 · Agoda báo huỷ' };
  const v2 = BN.canBao(huy2, nay);
  t('đã báo huỷ rồi → thư huỷ thứ hai chỉ đánh dấu', v2 && v2.canNoi.length === 0 && v2.dongs.length === 1);
  const sua = { ...daGui, nhanPhong: '2026-12-24', traPhong: '2027-01-12', soDem: 19, soTien: 16552800,
    lichSu: b.lichSu + '\n2026-11-03 20:00 · OTA sửa đơn\n2026-11-03 20:05 · Đổi phòng 201 → 601' };
  const tl = BN.soanTraLoi(sua, BN.canBao(sua, nay).canNoi);
  t('OTA sửa + đổi phòng', tl.includes('OTA sửa đơn lúc 20:00 03/11. Hiện tại: 24/12/2026 - 12/01/2027 (19 đêm), 16.552.800 đ.') && tl.includes('Đổi phòng 201 → 601 lúc 20:05 03/11.'), tl);
}

console.log('— tin khách nhắn qua Agoda');
{
  const BN = require('../routine/bao-nhom');
  const reply = ['Reply from KIM MINSU (Nov 1-2, 2026)',
    'Xin chào, Pito Hotel\n\nThắc mắc mới từ KIM MINSU\n\nKIM MINSU\nthg 10 31, 09:53 CH ICT\n\nMã số đặt phòng: 1792200000\n\n' +
    'Mấy giờ có xe đón ở bến cáp treo?\n\nNội dung trên được tự động dịch lại (qua Google Dịch) từ nội dung ban đầu như sau:\n\n케이블카 픽업 몇시?\n\n' +
    'Did you know?\n\nKIM MINSU\nthg 10 31, 09:51 CH ICT\n\nTin cũ không được lấy'];
  const tin = G.docAgodaTin(...reply);
  t('Reply from: lấy mã đơn + tin mới nhất', tin && tin.maOta === '1792200000' && tin.noiDung === 'Mấy giờ có xe đón ở bến cáp treo?', JSON.stringify(tin));
  t('Inquiry (chưa có đơn) → bỏ', G.docAgodaTin('Inquiry by A (Nov 22-24, 2026)', 'Tin nhắn: hỏi giá') === null);
  t('Special Request tự sinh → bỏ', G.docAgodaTin('Special Request for Booking ID 1 (Dec 25-26, 2026)',
    'Kính gửi Pito,\n\nRequested: Non-smoking, Large bed\n\nVui lòng xác nhận') === null);
  const sr = G.docAgodaTin('Special Request for Booking ID 17 (Dec 25-26, 2026)', 'Kính gửi Pito,\n\nCho mình phòng tầng cao nhé\n\nVui lòng xác nhận');
  t('Special Request khách tự viết → giữ', sr && sr.maOta === '17' && sr.noiDung === 'Cho mình phòng tầng cao nhé');

  const [b] = gop([
    { luc: '2026-10-31 02:26', su: { maOta: '1792200000', kenh: 'Agoda', trangThaiAgoda: 'CONFIRMED', tenKhach: 'KIM MINSU', nhanPhong: '2026-11-01', traPhong: '2026-11-02', nguon: 'agoda' } },
    { luc: '2026-10-31 21:53', su: { ...tin, nguon: 'agoda-tin' } },
    { luc: '2026-10-31 22:00', su: { maOta: '9999', kenh: 'Agoda', noiDung: 'đơn lạ', nguon: 'agoda-tin' } },
  ]);
  t('tin khách vào lịch sử của đúng đơn', b.suKien.includes('2026-10-31 21:53 · Khách nhắn: Mấy giờ có xe đón ở bến cáp treo?'), JSON.stringify(b.suKien));
  t('tin của mã lạ không tự tạo đơn', gop([{ luc: '2026-10-31 22:00', su: { maOta: '9999', noiDung: 'x', nguon: 'agoda-tin' } }]).length === 0);

  const don = { ma: 'PIOK1', maOta: '1792200000', kenh: 'Agoda', quocGia: 'South Korea', trangThai: 'Đã đặt', ngayDat: '2026-11-04 12:00',
    lichSu: '2026-11-04 11:59 · Agoda xác nhận\n2026-11-04 12:00 · Đơn mới\n2026-11-04 12:01 · Khách nhắn: Có ghế trẻ em không?' };
  const v = BN.canBao(don, Date.parse('2026-11-04T12:20:00+07:00'));
  t('gửi tin booking: tin khách chưa tính là đã báo', v.loai === 'moi' && v.dongs.length === 2);
  const daGui = { ...don, tinNhom: 'om_1', daBaoNhom: v.dongs.join('\n') };
  const v2 = BN.canBao(daGui, Date.parse('2026-11-04T12:25:00+07:00'));
  t('lượt sau trả lời tin khách vào luồng', v2.loai === 'traLoi' && BN.soanTraLoi(daGui, v2.canNoi) === 'Khách nhắn lúc 12:01 04/11: Có ghế trẻ em không?', BN.soanTraLoi(daGui, v2.canNoi));
}

(async () => {
  console.log('— song song hai ngôn ngữ');
  const BN = require('../routine/bao-nhom');
  const dongs = ['2026-11-04 12:01 · Khách nhắn: 아침 9시까진 부탁드립니다', '2026-11-04 12:02 · Khách nhắn: Có ghế trẻ em không?', '2026-11-04 12:03 · Huỷ'];
  const banDich = await BN.dichTin(dongs, { dichFn: async () => 'Nhờ sắp xếp trước 9 giờ sáng.' });
  t('dịch tin tiếng nước ngoài', banDich[dongs[0]] === 'Nhờ sắp xếp trước 9 giờ sáng.');
  t('tin tiếng Việt không dịch', !(dongs[1] in banDich));
  const tl = BN.soanTraLoi({ kenh: 'Agoda' }, dongs.slice(0, 2), banDich);
  t('gốc rồi bản Việt ngay dưới', tl === 'Khách nhắn lúc 12:01 04/11: 아침 9시까진 부탁드립니다\n→ Nhờ sắp xếp trước 9 giờ sáng.\nKhách nhắn lúc 12:02 04/11: Có ghế trẻ em không?', tl);
  const loi = await BN.dichTin(dongs, { dichFn: async () => { throw new Error('hết khoá'); } });
  t('dịch lỗi vẫn gửi bản gốc', Object.keys(loi).length === 0);

  /* 04/11/2026: GoHost gửi nguồn "Zalo", "Walk-in" chưa có trong ô chọn Kênh → Base
   * từ chối cả lượt ghi. Bộ đồng bộ phải nhận ra lựa chọn còn thiếu để thêm trước. */
  const { luaChonThieu } = require('../routine/dong-bo');
  const thieu = luaChonThieu(
    [{ 'Kênh': 'Zalo', 'Trạng thái': 'Đã đặt' }, { 'Kênh': 'Walk-in' }, { 'Kênh': 'agoda' }, { 'Kênh': 'Zalo' }],
    { 'Kênh': ['Agoda', 'Khác'], 'Trạng thái': ['Đã đặt'] });
  t('kênh mới chưa có lựa chọn được nhận ra, không trùng, không phân biệt hoa thường',
    JSON.stringify(thieu) === JSON.stringify({ 'Kênh': ['Zalo', 'Walk-in'] }), JSON.stringify(thieu));
  t('đủ lựa chọn thì không thêm gì', Object.keys(luaChonThieu([{ 'Kênh': 'Agoda' }], { 'Kênh': ['Agoda'] })).length === 0);

  /* Cảnh báo hỏng lâu: 10 phút mới nhắn, nhắc lại mỗi 3 giờ, khỏi thì báo một lần. */
  const CB = require('../routine/canh-bao');
  const s = { tu: 0, daBao: 0, loi: '' };
  const P = 60e3, T0 = Date.parse('2026-11-04T11:15:00Z');
  t('lỗi mới chưa nhắn', CB.xet('800030005', T0, s) === null && CB.xet('800030005', T0 + 9 * P, s) === null);
  t('chập chờn tự hết trong 10 phút thì không báo khỏi', (() => {
    const s2 = { tu: 0, daBao: 0, loi: '' };
    CB.xet('x', T0, s2); return CB.xet('', T0 + 3 * P, s2) === null && s2.tu === 0;
  })());
  const v1 = CB.xet('800030005', T0 + 10 * P, s);
  t('hỏng liên tục 10 phút thì nhắn', v1 && v1.loai === 'hong' && v1.tu === T0);
  CB.daGui(v1, T0 + 10 * P, s);
  t('đã nhắn thì phút sau không nhắn lại', CB.xet('800030005', T0 + 11 * P, s) === null);
  t('vẫn hỏng sau 3 giờ thì nhắc lại', (CB.xet('800030005', T0 + 10 * P + 3 * 3600e3, s) || {}).loai === 'hong');
  const v2 = CB.xet('', T0 + 4 * 3600e3, s);
  t('khỏi sau khi đã báo thì nhắn đã chạy lại', v2 && v2.loai === 'khoi' && v2.tu === T0);
  CB.daGui(v2, T0 + 4 * 3600e3, s);
  t('khỏi rồi không nhắn nữa', CB.xet('', T0 + 4 * 3600e3 + P, s) === null);
  const the = CB.dungThe({ loai: 'hong', loi: 'Lark API 800030005', tu: T0 }, 'pito@routinehospitality.vn');
  /* Thống kê tuần: thứ 7 tuần trước → thứ 6, gửi 17:00 thứ 7. */
  const TU = require('../routine/tuan');
  const donT = (o) => ({ id: o.ma, ma: o.ma, kenh: 'Agoda', trangThai: 'Đã đặt', chamSoc: '', ...o });
  const k = TU.khungTuan('2026-11-07');
  t('khung tuần gửi thứ 7 07/11 là 31/10 → 06/11', k.tu === '2026-10-31' && k.den === '2026-11-06');
  const dsTuan = [
    donT({ ma: 'T1', kenh: 'Agoda', ngayDat: '2026-10-31 00:10', soTien: 1000000, soDem: 2, quocGia: 'South Korea', nhanPhong: '2026-11-10' }),
    donT({ ma: 'T2', kenh: 'Agoda', ngayDat: '2026-11-06 23:50', soTien: 500000, soDem: 1, trangThai: 'Đã huỷ' }),
    donT({ ma: 'T3', kenh: 'Zalo', ngayDat: '2026-11-03 09:00', soTien: 2000000, soDem: 1, nhanPhong: '2026-11-08' }),
    donT({ ma: 'T4', kenh: 'Agoda', ngayDat: '2026-10-30 22:00', soTien: 9000000, soDem: 3 }),
    donT({ ma: 'T5', kenh: 'Agoda', ngayDat: '2026-11-07 08:00', soTien: 9000000, soDem: 3 }),
  ];
  const th = TU.tongHop(dsTuan, k.tu, k.den);
  t('chỉ tính đơn đặt trong khung, cả hai đầu', th.dat === 3, String(th.dat));
  t('huỷ không tính doanh thu và đêm', th.huy === 1 && th.con === 2 && th.tien === 3000000 && th.dem === 3, JSON.stringify(th));
  t('theo kênh xếp theo doanh thu', th.kenh[0].kenh === 'Zalo' && th.kenh[1].kenh === 'Agoda' && th.kenh[1].huy === 1);
  t('nhận phòng 7 ngày tới', TU.nhanTuanToi(dsTuan, '2026-11-07') === 2);
  t('chỉ gửi trong 17:00–17:59 thứ 7 giờ VN',
    TU.toiGio(Date.parse('2026-11-07T10:00:00Z')) && !TU.toiGio(Date.parse('2026-11-07T09:59:00Z')) &&
    !TU.toiGio(Date.parse('2026-11-07T11:00:00Z')) && !TU.toiGio(Date.parse('2026-11-06T10:30:00Z')));
  const theTuan = TU.soanTuan(dsTuan.filter((b) => b.ma !== 'T4'), '2026-11-07').the;
  t('tuần trước không có đơn thì không so sánh', !/tuần trước/.test(JSON.stringify(theTuan)) && /31\/10 – 06\/11/.test(theTuan.header.title.content));
  t('tuần trước có đơn thì so sánh', /so với tuần trước/.test(JSON.stringify(TU.soanTuan(dsTuan, '2026-11-07').the)));
  let guiLan = 0;
  const gia = { gui: async () => { guiLan++; return { ok: true }; } };

  await TU.thu({ guiTin: gia, docRows: async () => dsTuan, chatId: 'oc', ms: Date.parse('2026-11-07T10:00:00Z') });
  await TU.thu({ guiTin: gia, docRows: async () => dsTuan, chatId: 'oc', ms: Date.parse('2026-11-07T10:01:00Z') });
  await TU.thu({ guiTin: gia, docRows: async () => dsTuan, chatId: 'oc', ms: Date.parse('2026-11-07T09:00:00Z') });
  t('thứ 7 chỉ gửi một lần', guiLan === 1, String(guiLan));
  t('cuối tháng: 30/11, 31/12, 28/02', TU.cuoiThang('2026-11-06') === '2026-11-30' && TU.cuoiThang('2026-12-01') === '2026-12-31' && TU.cuoiThang('2027-02-10') === '2027-02-28');
  t('gửi tháng 17:00–17:59 ngày cuối tháng giờ VN',
    TU.toiGioThang(Date.parse('2026-11-30T10:00:00Z')) && !TU.toiGioThang(Date.parse('2026-11-29T10:00:00Z')) &&
    !TU.toiGioThang(Date.parse('2026-11-30T11:00:00Z')));
  const thg = TU.soanThang([
    donT({ ma: 'M1', ngayDat: '2026-11-01 08:00', soTien: 1000000, soDem: 1 }),
    donT({ ma: 'M2', ngayDat: '2026-11-30 16:00', soTien: 2000000, soDem: 2 }),
    donT({ ma: 'M3', ngayDat: '2026-10-31 23:00', soTien: 5000000, soDem: 1 }),
  ], '2026-11-30');
  t('thẻ tháng: khung 01→30/11, so tháng trước', thg.th.dat === 2 && thg.th.tien === 3000000 &&
    thg.the.header.title.content === 'Booking khách sạn tháng 11/2026' && /so với tháng trước/.test(JSON.stringify(thg.the)), JSON.stringify(thg.th));
  let guiThang = 0;
  const giaT = { gui: async (o) => { if (/thang/.test(o.khoa)) guiThang++; return { ok: true }; } };
  await TU.thu({ guiTin: giaT, docRows: async () => dsTuan, chatId: 'oc', ms: Date.parse('2026-11-30T10:00:00Z') });
  await TU.thu({ guiTin: giaT, docRows: async () => dsTuan, chatId: 'oc', ms: Date.parse('2026-11-30T10:05:00Z') });
  t('ngày cuối tháng chỉ gửi thẻ tháng một lần', guiThang === 1, String(guiThang));
  const { tachGoi } = require('../routine/bao-nhom');
  t('gói giá Agoda: chỉ phòng / 1 cáp / 2 cáp',
    tachGoi('Superior Double Room (Chính sách khách sạn đặc biệt (Room Only))').goi === 'Chỉ phòng' &&
    tachGoi('Premier Double Room with Bathtub (Room + 1 Cable Car & Water Park Tickets)').goi === 'Phòng + 1 cáp' &&
    tachGoi('Cozy Double Room (Room + 2 Cable Car & Water Park Tickets)').goi === 'Phòng + 2 cáp' &&
    tachGoi('Premier Bathtub').goi === '');
  const thGoi = TU.tongHop([
    donT({ ma: 'G1', ngayDat: '2026-11-01 10:00', hangPhong: 'Cozy (Room + 2 Cable Car & Water Park Tickets)', soTien: 2000000, soDem: 1 }),
    donT({ ma: 'G2', ngayDat: '2026-11-01 11:00', hangPhong: 'Superior (Chính sách khách sạn đặc biệt (Room Only))', soTien: 1000000, soDem: 1 }),
    donT({ ma: 'G3', kenh: 'Booking.com', ngayDat: '2026-11-02 11:00', soTien: 3000000, soDem: 2 }),
  ], '2026-10-31', '2026-11-06');
  t('bảng gói: chỉ phòng → 2 cáp → chưa rõ (kèm kênh)',
    thGoi.goi.map((g) => g.goi).join('|') === 'Chỉ phòng|Phòng + 2 cáp|Chưa rõ gói' && thGoi.goi[2].kenh[0] === 'Booking.com', JSON.stringify(thGoi.goi));
  const theGoi = JSON.stringify(TU.soanTuan([donT({ ma: 'G1', ngayDat: '2026-11-01 10:00', hangPhong: 'Cozy (Room + 2 Cable Car)', soTien: 1, soDem: 1 })], '2026-11-07').the);
  t('thẻ tuần rộng hết khung và có bảng gói', /"width_mode":"fill"/.test(theGoi) && /Theo gói giá/.test(theGoi));
  t('thẻ hỏng ghi giờ VN và lỗi', the.header.template === 'red' && /2026-11-04 18:15/.test(the.elements[0].content) && /800030005/.test(the.elements[0].content));

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
