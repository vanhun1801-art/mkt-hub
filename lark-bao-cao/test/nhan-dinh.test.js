'use strict';
/**
 * ============================================================================
 * Nhận định tự động — cái máy nói phải đúng với cái dữ liệu nói
 * ============================================================================
 * Đây là phần nguy hiểm nhất của app: nó phát biểu về CON NGƯỜI. Một câu sai ở
 * đây không dừng ở "hiển thị lỗi" — nó thành lời nhận xét về nhân sự trong bảng
 * của quản lý, và người bị nhận xét oan không có cách nào cãi ngoài việc mở
 * từng phiếu ra đếm lại.
 *
 * Nên hai điều được gác gắt:
 *   1. Không bao giờ nói điều dữ liệu không có (khen người nộp muộn, báo thiếu
 *      giờ cho người khai đủ).
 *   2. Phân biệt "chưa đo được" với "bằng không" — gộp hai thứ đó là chấm 0 cho
 *      người chưa khai định mức.
 *
 * Chạy: node test/nhan-dinh.test.js
 */
const ND = require('../nhan-dinh');
const K = require('../ky');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (vi ? ' — ' + vi : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const NGAY = K.NGAY;
const homQua = K.dauNgay(Date.now() - NGAY);

/** Phiếu ngày mẫu: nộp đúng hạn, khai đủ ca. */
const phieuChuan = (them = {}) => Object.assign({
  loaiKy: 'ngay', tu: homQua, den: homQua + NGAY - 1,
  daNop: true, trangThaiHan: 'dung-han', veHan: 'Đúng hạn',
  dinhMuc: 480, tongPhut: 480, phanTram: 100, canHoTro: '',
}, them);

const dongChuan = [
  { congViec: 'Edit clip', nhom: 'Edit video', phut: 240, tienDoPt: 100, tienDo: 'xong', trangThai: 'Hoàn thành' },
  { congViec: 'Kịch bản', nhom: 'Kịch bản', phut: 240, tienDoPt: 100, tienDo: 'xong', trangThai: 'Hoàn thành' },
];

const co = (y, mau) => y.some((x) => mau.test(x.chu));
const mucCua = (y, mau) => (y.find((x) => mau.test(x.chu)) || {}).muc;

group('Đúng hạn — không được khen người nộp muộn');
{
  const tot = ND.chiMotPhieu(phieuChuan(), dongChuan, {});
  ok('nộp đúng hạn thì có ý "Nộp đúng hạn"', co(tot, /Nộp đúng hạn/));
  ok('và nó là mức tốt', mucCua(tot, /Nộp đúng hạn/) === ND.MUC.tot);

  const tre = ND.chiMotPhieu(
    phieuChuan({ trangThaiHan: 'tre', veHan: 'trễ 2 giờ' }), dongChuan, {});
  ok('nộp muộn thì nói muộn', co(tre, /Nộp muộn/));
  ok('và KHÔNG đồng thời khen đúng hạn', !co(tre, /Nộp đúng hạn/),
    'nói cả hai thì cả bảng thành vô nghĩa');
  ok('muộn là mức cảnh báo', mucCua(tre, /Nộp muộn/) === ND.MUC.canh);
  ok('nhắc lại trễ bao lâu', co(tre, /trễ 2 giờ/));

  const thieu = ND.chiMotPhieu(
    phieuChuan({ daNop: false, trangThaiHan: 'thieu' }), [], {});
  ok('chưa nộp quá hạn thì nói "Chưa nộp"', co(thieu, /Chưa nộp/));
  ok('và không nói "Nộp muộn"', !co(thieu, /Nộp muộn/),
    'chưa nộp khác nộp muộn — một bên còn chưa có gì để đọc');
}

group('Thời lượng — chưa đo được KHÁC bằng không');
{
  const du = ND.chiMotPhieu(phieuChuan(), dongChuan, {});
  ok('khai đủ ca thì mức tốt', mucCua(du, /100% định mức/) === ND.MUC.tot);

  const it = ND.chiMotPhieu(
    phieuChuan({ tongPhut: 240, phanTram: 50 }),
    [{ nhom: 'Edit video', phut: 240, tienDoPt: 100, trangThai: 'Hoàn thành' }], {});
  ok('khai 50% thì nêu thiếu', co(it, /Mới khai 50%/), JSON.stringify(it.map((x) => x.chu)));
  ok('và nói còn thiếu bao nhiêu giờ', co(it, /còn 4 giờ chưa vào đâu/));
  ok('nhưng chỉ là lưu ý, không phải cảnh báo', mucCua(it, /Mới khai 50%/) === ND.MUC.luu_y,
    'khai thiếu giờ có thể là quên khai, chưa đủ để kết luận gì');

  const chuaDo = ND.chiMotPhieu(
    phieuChuan({ dinhMuc: 0, phanTram: null }), dongChuan, {});
  ok('chưa khai định mức thì nói "không đo được"', co(chuaDo, /không đo được/),
    'gộp với "làm được 0%" là chấm oan người chưa chọn ca');
  ok('và KHÔNG nói khai thiếu', !co(chuaDo, /Mới khai/));

  const qua = ND.chiMotPhieu(
    phieuChuan({ tongPhut: 720, phanTram: 150 }), dongChuan, {});
  ok('khai 150% thì nêu vượt ca', co(qua, /vượt khá xa một ca/));
  ok('gọi đúng tên: dấu hiệu việc dồn', (qua.find((x) => /vượt khá xa/.test(x.chu)) || {}).vi
    .includes('việc dồn'));
}

group('Cơ cấu việc');
{
  const dom = ND.chiMotPhieu(phieuChuan(), [
    { nhom: 'Edit video', phut: 400, trangThai: 'Hoàn thành' },
    { nhom: 'Họp', phut: 80, trangThai: 'Hoàn thành' },
  ], {});
  ok('một nhóm chiếm >60% thì nêu ra', co(dom, /Edit video chiếm 83%/),
    JSON.stringify(dom.map((x) => x.chu)));

  const deu = ND.chiMotPhieu(phieuChuan(), [
    { nhom: 'Edit video', phut: 120, trangThai: 'Hoàn thành' },
    { nhom: 'Page', phut: 120, trangThai: 'Hoàn thành' },
    { nhom: 'TikTok', phut: 120, trangThai: 'Hoàn thành' },
    { nhom: 'Họp', phut: 120, trangThai: 'Hoàn thành' },
  ], {});
  ok('rải nhiều nhóm thì nói rải, không nói chiếm', co(deu, /rải ra 4 nhóm/) && !co(deu, /chiếm/));

  ok('phiếu rỗng không làm nổ hàm', ND.chiMotPhieu(phieuChuan({ tongPhut: 0, phanTram: 0 }), [], {}).length > 0);
}

group('Việc đứng yên — thứ ảnh chụp màn hình không bao giờ chỉ ra');
{
  /* Ba ngày liền cùng một đầu việc, tiến độ y nguyên 30%. Muốn thấy điều này
   * bằng mắt thì phải mở ba tấm ảnh ra so với nhau. */
  const m = new Map();
  for (let i = 3; i >= 1; i--) {
    m.set(K.dauNgay(Date.now() - i * NGAY), [
      { maViec: 'recA', congViec: 'Thiết kế logo', tienDoPt: 30, trangThai: 'Đang làm' },
      { maViec: 'recB', congViec: 'Edit clip', tienDoPt: 20 * (4 - i), trangThai: 'Đang làm' },
    ]);
  }
  const dy = ND.timDungYen(m);
  ok('tìm ra đúng đầu việc đứng yên', dy.length === 1 && dy[0].ten === 'Thiết kế logo',
    'đang ra: ' + JSON.stringify(dy));
  ok('đếm đúng số ngày đứng yên', dy[0].soNgay === 3);
  ok('việc đang nhích thì KHÔNG bị kể tên', !dy.some((x) => x.ten === 'Edit clip'),
    'báo nhầm việc đang chạy là đứng thì lần sau không ai tin bảng này nữa');

  /* Việc đã xong thì thôi — 100% ba ngày liền là đã hoàn thành, không phải kẹt. */
  const xong = new Map();
  for (let i = 3; i >= 1; i--) {
    xong.set(K.dauNgay(Date.now() - i * NGAY),
      [{ maViec: 'recC', congViec: 'Xong rồi', tienDoPt: 100, trangThai: 'Hoàn thành' }]);
  }
  ok('việc đã hoàn thành không tính là đứng yên', ND.timDungYen(xong).length === 0);

  /* Không có mã tracking thì khớp theo tên — việc gõ tay vẫn phải theo dõi được. */
  const goTay = new Map();
  for (let i = 3; i >= 1; i--) {
    goTay.set(K.dauNgay(Date.now() - i * NGAY),
      [{ maViec: '', congViec: 'Việc tự nhập', tienDoPt: 40, trangThai: 'Đang làm' }]);
  }
  ok('việc gõ tay cũng theo dõi được (khớp theo tên)', ND.timDungYen(goTay).length === 1);

  ok('dòng không tên thì bỏ qua, không dựng việc ma',
    ND.timDungYen(new Map([[homQua, [{ maViec: '', congViec: '  ', tienDoPt: 10 }]]])).length === 0);

  const y = ND.chiMotPhieu(phieuChuan(), dongChuan, { dungYen: dy });
  ok('nhận định có nhắc việc đứng yên', co(y, /giữ nguyên tiến độ qua 3 ngày/));
  ok('và là mức cảnh báo', mucCua(y, /giữ nguyên tiến độ/) === ND.MUC.canh);
}

group('Việc dở dang không ghi lý do');
{
  const y = ND.chiMotPhieu(phieuChuan(), [
    { nhom: 'Edit video', phut: 240, tienDoPt: 50, tienDo: '', trangThai: 'Đang làm' },
    { nhom: 'Kịch bản', phut: 240, tienDoPt: 60, tienDo: 'chờ duyệt', trangThai: 'Đang làm' },
  ], {});
  ok('đếm đúng 1 việc thiếu ghi chú tiến độ', co(y, /1 việc chưa hoàn thành mà không ghi tiến độ/),
    JSON.stringify(y.map((x) => x.chu)));

  const xong = ND.chiMotPhieu(phieuChuan(), dongChuan, {});
  ok('việc đã hoàn thành thì không đòi ghi chú', !co(xong, /không ghi tiến độ/));
}

group('Ngày thiếu và vướng mắc');
{
  const y = ND.chiMotPhieu(phieuChuan(), dongChuan, {
    ngayThieu: [{ ms: homQua }, { ms: homQua - NGAY }],
  });
  ok('nêu số ngày thiếu', co(y, /Thiếu 2 ngày báo cáo/));

  const ht = ND.chiMotPhieu(phieuChuan({ canHoTro: 'Thiếu file gốc từ Sales.' }), dongChuan, {});
  ok('có vướng mắc thì đưa lên thành cảnh báo', mucCua(ht, /vướng mắc cần hỗ trợ/) === ND.MUC.canh);
  ok('và chép nguyên văn lời nhân sự',
    (ht.find((x) => /vướng mắc/.test(x.chu)) || {}).vi === 'Thiếu file gốc từ Sales.',
    'tóm tắt lại lời người ta là cách nhanh nhất làm sai ý họ');

  const trong = ND.chiMotPhieu(phieuChuan({ canHoTro: '   ' }), dongChuan, {});
  ok('ô hỗ trợ chỉ có khoảng trắng thì không tính', !co(trong, /vướng mắc/));
}

group('Điểm và một câu tóm — để xếp thứ tự bảng toàn phòng');
{
  const tot = ND.chiMotPhieu(phieuChuan(), dongChuan, {});
  ok('phiếu sạch thì điểm cao', ND.chamDiem(tot) >= 85, 'đang ra: ' + ND.chamDiem(tot));

  const xau = ND.chiMotPhieu(
    phieuChuan({ trangThaiHan: 'tre', veHan: 'trễ 1 ngày', tongPhut: 120, phanTram: 25,
      canHoTro: 'kẹt' }),
    [{ nhom: 'Edit video', phut: 120, tienDoPt: 10, tienDo: '', trangThai: 'Đang làm' }], {});
  ok('phiếu nhiều vấn đề thì điểm thấp hơn hẳn', ND.chamDiem(xau) < ND.chamDiem(tot) - 30);
  ok('điểm không bao giờ âm', ND.chamDiem(xau) >= 0);
  ok('điểm không vượt 100', ND.chamDiem(tot) <= 100);

  ok('câu tóm ưu tiên chuyện cảnh báo', /Nộp muộn/.test(ND.motCau(xau)),
    'đang ra: ' + ND.motCau(xau));
  ok('phiếu sạch thì câu tóm cũng là chuyện tốt', /đúng hạn/i.test(ND.motCau(tot)));
  ok('không có ý nào thì vẫn nói được một câu', /Chưa đủ dữ liệu/.test(ND.motCau([])));
}

console.log('\n' + '─'.repeat(56));
console.log('  ' + pass + ' pass · ' + fail + ' fail');
if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
console.log('─'.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
