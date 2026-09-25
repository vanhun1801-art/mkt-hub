'use strict';
/**
 * ============================================================================
 * BÁO CÁO QUỸ THEO KỲ — không cần mạng, không cần app chạy
 * ============================================================================
 *
 *   node test/bao-cao.test.js
 *
 * Neo vào BÁO CÁO THẬT anh Hùng đã gửi Ban Giám Đốc ngày 01/09/2026 cho kỳ
 * QTTU52/LVH (01/08 – 31/08/2026). Đó là bản anh làm tay từ sheet, đã qua mắt
 * anh và mắt Sếp — nên nó là mốc đúng để đo cái máy tự dựng.
 *
 * Sai số ở đây không hiện ra thành lỗi: tệp vẫn ra, thư vẫn gửi, chỉ có con số
 * trong thư gửi Sếp là sai. Nên mọi con số trong bản thật đều được chốt lại
 * dưới đây, kể cả mấy con số nhìn qua tưởng thừa.
 */
const bc = require('../bao-cao');
const bx = require('../bao-cao-xuat');
const docXlsx = require('../../lark-ads-manager/sync/xlsx');

let pass = 0, fail = 0;
const fails = [];
function ok(ten, dieu, chiTiet) {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (chiTiet ? ' → ' + chiTiet : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (chiTiet ? '\n         ' + chiTiet : ''));
  }
}
const nhom = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

/* ---------------------------------------------------------------------------
 * Sổ mẫu: đúng kỳ THÁNG 08 trong báo cáo thật, rút gọn còn 6 khoản đại diện
 * cho đủ 4 nhóm và đủ 4 tuần. Tổng thì lấy Ô CÔNG THỨC của đợt như Base thật.
 * ------------------------------------------------------------------------- */
const DOT = 'recT08';
const chi = (ngay, tien, loai, noiDung, nguoi) => ({
  id: 'rec' + ngay + tien, dot: [DOT], ngayChi: ngay + 'T10:00:00+07:00',
  ngayDeNghi: ngay + 'T10:00:00+07:00', tien, loai, noiDung,
  nguoi: [{ id: 'u', name: nguoi }], maDieuHanh: 'SG' + tien, maQuyetToan: 'QTTU52/LVH',
});

const KHO = {
  dot: [{ id: DOT, ma: 'THÁNG 08', tinhTrang: 'Đã chốt',
    nguoiGiu: [{ id: 'u3', name: 'Lê Văn Hùng' }],
    tongNap: 12930200, tongChi: 11960200, conLai: 970000 }],
  nap: [
    { id: 'n1', dot: [DOT], loai: 'Chuyển từ kỳ trước', noiDung: 'Số dư đầu kỳ', ngay: null, tien: 2930200 },
    { id: 'n2', dot: [DOT], loai: 'Nạp thêm', noiDung: 'Tạm ứng', ngay: '2026-08-06T00:00:00+07:00', tien: 10000000 },
  ],
  chi: [
    chi('2026-08-01', 613000, 'Tác nghiệp', 'Tác nghiệp Hòn Thơm', 'Huỳnh Thị Anh Thư'),
    chi('2026-08-07', 209000, 'Di chuyển', 'Xanh SM Premier về Ngọc Trai', 'Danh Minh Trường'),
    chi('2026-08-11', 1497000, 'Khác', 'Hỗ trợ sự kiện AI Powered Marketing', 'Phù Mỹ Hân'),
    chi('2026-08-15', 249000, 'Công cụ & phần mềm', 'PhotoROOM tháng 8', 'Danh Minh Trường'),
    chi('2026-08-19', 930000, 'Công cụ & phần mềm', 'Capcut tháng 8', 'Lê Văn Hùng'),
    chi('2026-08-29', 470000, 'Tác nghiệp', 'Tác nghiệp Nam Đảo Quốc Khánh', 'Lê Văn Hùng'),
  ],
};
const BAN_DO = require('../config').nhomBaoCao;
const r = bc.dungBaoCao(KHO, DOT, { banDoNhom: BAN_DO, ngayLap: '01/09/2026' });

nhom('Kỳ là MỘT ĐỢT TẠM ỨNG, không phải một tháng');
/* Nghe giống nhau vì đợt đang đặt tên "THÁNG 08". Nhưng khoản chi thuộc kỳ nào
 * là do ô "Đợt tạm ứng" nói — lấy theo tháng thì một khoản ngày 31/08 thuộc
 * đợt tháng 9 sẽ nhảy sai kỳ, và bảng cân đối lệch mà không ai thấy. */
ok('đọc đúng tên đợt', r.ky.tenDot === 'THÁNG 08', r.ky.tenDot);
ok('kỳ trải TRỌN tháng, không cắt ở khoản cuối',
  r.ky.tuVN === '01/08/2026' && r.ky.denVN === '31/08/2026', r.ky.tuVN + ' – ' + r.ky.denVN);
ok('mã quỹ lấy từ mã quyết toán của kỳ', r.ky.maQuy === 'QTTU52/LVH', r.ky.maQuy);
ok('khoản của đợt khác KHÔNG lọt vào',
  bc.dungBaoCao({ ...KHO, chi: [...KHO.chi, chi('2026-08-30', 999000, 'Khác', 'của đợt khác', 'X')]
    .map((c, i) => (i === KHO.chi.length ? { ...c, dot: ['recKHAC'] } : c)) }, DOT,
  { banDoNhom: BAN_DO }).chiTiet.length === 6);

nhom('Số tổng TIN ô công thức của Base, không cộng lại');
/* Hai nơi cùng tính một con số thì sớm muộn lệch nhau, và lúc lệch thì không
 * biết tin bên nào. Ở đây chỉ cộng những thứ Base KHÔNG tính. */
ok('tổng nguồn đúng bản thật', r.so.tongNguon === 12930200, String(r.so.tongNguon));
ok('tổng chi lấy từ ô công thức, KHÔNG phải tổng 6 dòng mẫu',
  r.so.tongChi === 11960200, String(r.so.tongChi));
ok('số dư cuối kỳ đúng bản thật', r.so.cuoiKy === 970000, String(r.so.cuoiKy));
ok('đầu kỳ tách khỏi nạp mới',
  r.so.dauKy === 2930200 && r.so.napThem === 10000000,
  r.so.dauKy + ' + ' + r.so.napThem);
ok('tỷ lệ còn lại khớp con số đã gửi Sếp (7,5%)',
  Math.round(r.so.tyLeCon * 1000) / 10 === 7.5, String(r.so.tyLeCon));
ok('quỹ dương thì không bật cờ âm', r.so.am === false);

nhom('Gom nhóm theo bản đồ, không theo ô Loại thô');
/* Ô "Loại" phục vụ người NHẬP (bảy lựa chọn ngắn); bảng gửi Sếp cần ít nhóm
 * hơn và tên nói rõ tiền đi vào việc gì. */
const ten = (ds) => ds.map((x) => x.ten);
ok('Tác nghiệp và Di chuyển gộp làm một nhóm',
  ten(r.nhom).includes('Tác nghiệp hiện trường')
  && !ten(r.nhom).includes('Di chuyển'), ten(r.nhom).join(' | '));
const tn = r.nhom.find((x) => x.ten === 'Tác nghiệp hiện trường');
ok('gộp xong cộng đúng cả số khoản lẫn tiền',
  tn.so === 3 && tn.tien === 613000 + 209000 + 470000, JSON.stringify(tn));
ok('nhóm xếp theo tiền, nhiều nhất trước',
  r.nhom.every((x, i) => i === 0 || r.nhom[i - 1].tien >= x.tien), ten(r.nhom).join(' | '));
/* Loại KHÔNG có trong bản đồ thì giữ nguyên tên — dồn vào "Khác" là giấu mất
 * một nhóm chi đang lớn dần mà không ai để ý. */
const la = bc.dungBaoCao({ ...KHO, chi: [{ ...KHO.chi[0], loai: 'Loại chưa khai' }] }, DOT,
  { banDoNhom: BAN_DO });
ok('loại lạ giữ nguyên tên, không dồn vào Khác',
  la.nhom[0].ten === 'Loại chưa khai', la.nhom[0].ten);
ok('ô Loại trống thì nói thẳng là chưa phân loại',
  bc.dungBaoCao({ ...KHO, chi: [{ ...KHO.chi[0], loai: '' }] }, DOT, {}).nhom[0].ten === 'Chưa phân loại');

nhom('Tuần chia theo NGÀY TRONG THÁNG, không phải tuần ISO');
/* Bảng gửi Sếp chia 01–07 · 08–14 · 15–21 · 22–cuối. Tuần ISO vắt qua hai
 * tháng nên một kỳ đẻ ra năm sáu tuần, trong đó hai tuần cụt. */
ok('bốn mốc đúng như bản thật',
  bc.tuanCua('2026-08-07') === '01–07/08' && bc.tuanCua('2026-08-08') === '08–14/08'
  && bc.tuanCua('2026-08-21') === '15–21/08' && bc.tuanCua('2026-08-22') === '22–31/08');
ok('tuần cuối co theo số ngày THẬT của tháng',
  bc.tuanCua('2026-02-25') === '22–28/02', bc.tuanCua('2026-02-25'));
ok('tuần xếp theo thứ tự trong tháng, không theo tiền',
  ten(r.tuan).join(' ') === '01–07/08 08–14/08 15–21/08 22–31/08', ten(r.tuan).join(' '));

nhom('Tồn luỹ kế đếm ngược từ tổng nguồn');
/* Cột này là thứ kế toán dò tay: mỗi dòng trừ dần, dòng cuối phải bằng đúng số
 * dư cuối kỳ. Lệch một đồng ở đây là cả bảng mất tin cậy. */
ok('dòng đầu = tổng nguồn trừ khoản đầu',
  r.chiTiet[0].tonLuyKe === 12930200 - 613000, String(r.chiTiet[0].tonLuyKe));
ok('xếp theo ngày tăng dần', r.chiTiet[0].noiDung === 'Tác nghiệp Hòn Thơm'
  && r.chiTiet[5].noiDung === 'Tác nghiệp Nam Đảo Quốc Khánh');
ok('đánh số STT liên tục từ 1', r.chiTiet.every((x, i) => x.stt === i + 1));

nhom('Quỹ ÂM phải bật cờ, không để lẫn vào số thường');
const am = bc.dungBaoCao({
  ...KHO,
  dot: [{ ...KHO.dot[0], tongNap: 1000000, tongChi: 1500000, conLai: -500000 }],
}, DOT, { banDoNhom: BAN_DO });
ok('cờ âm bật khi số dư cuối kỳ dưới 0', am.so.am === true && am.so.cuoiKy === -500000,
  JSON.stringify(am.so));

nhom('Tệp .xlsx ghi ra phải đọc lại được');
/* Ghi bằng bộ ghi tự viết, đọc bằng bộ đọc viết từ trước cho bản xuất Tourwell
 * — hai cài đặt độc lập. Sai một offset trong ZIP là bước này vỡ, thay vì để
 * Excel báo "file hỏng" trên máy NGƯỜI NHẬN, sau khi thư đã gửi đi. */
const x = bx.xuatXlsx(r, null);
ok('có nội dung và đúng đuôi tệp', x.than.length > 1000 && x.tep.endsWith('.xlsx'), x.tep);
ok('tên tệp mang kỳ và mã quỹ, bỏ dấu',
  x.tep === 'bao-cao-quy_thang-08_qttu52-lvh.xlsx', x.tep);
const rows = docXlsx.doc(x.than).sheets[0].rows;
ok('hàng 1 là tiêu đề báo cáo', rows[0][0] === bx.TIEU_DE, JSON.stringify(rows[0]));
ok('phụ đề nói rõ kỳ và mã quỹ',
  /01\/08\/2026 – 31\/08\/2026/.test(rows[1][0]) && /QTTU52/.test(rows[1][0]), rows[1][0]);
/* Khối tóm tắt nằm TRÊN bảng chi tiết, nên tờ này KHÔNG có hàng tên cột ở đầu
 * — hàng đó là tên của bảng nằm tận giữa trang, đọc lên tưởng tờ bắt đầu bằng
 * bảng chi tiết. */
ok('không có hàng tên cột lạc lên đầu tờ',
  rows[3][0] === 'I. TÌNH HÌNH QUỸ TRONG KỲ', JSON.stringify(rows[3]));
const phang = rows.map((y) => y.join('|')).join('\n');
ok('có đủ bốn khối tóm tắt',
  /II\. CƠ CẤU/.test(phang) && /III\. CHI PHÍ THEO TUẦN/.test(phang)
  && /IV\. CHI PHÍ THEO NGƯỜI/.test(phang) && /V\. CHI TIẾT/.test(phang));
ok('dòng cuối chốt tổng chi và số dư',
  rows[rows.length - 1].includes('TỔNG CHI TRONG KỲ'), JSON.stringify(rows[rows.length - 1]));

nhom('Thư gửi Sếp: đúng bố cục thư anh Hùng vẫn gửi');
const tho = bx.htmlEmail(r, { xinNap: 10000000, kyMoi: 'tháng 10/2026',
  hangMuc: ['Ngân sách sản xuất nội dung', 'Công cụ và phần mềm'] });
const chuThuong = tho.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
ok('xin nhập quỹ đứng TRƯỚC báo cáo',
  chuThuong.indexOf('NHẬP QUỸ MARKETING') < chuThuong.indexOf('BÁO CÁO QUỸ MARKETING'));
ok('có đúng số tiền xin nhập', /10\.000\.000 VND/.test(chuThuong));
ok('có kỳ, tổng chi và số dư cuối kỳ',
  /01\/08\/2026 – 31\/08\/2026/.test(chuThuong) && /11\.960\.200 VND/.test(chuThuong)
  && /970\.000 VND/.test(chuThuong), chuThuong.slice(0, 200));
ok('bảng cơ cấu nhóm đi kèm trong thân thư', /Tác nghiệp hiện trường/.test(chuThuong));
/* Hộp thư nào cũng cắt bớt CSS trong <head>; cắt xong thì bảng về dạng thô. */
ok('bảng dựng bằng thuộc tính inline, không dựa vào thẻ style',
  !/<style/i.test(tho) && /style="[^"]*border-bottom/.test(tho));
ok('không xin nhập quỹ thì bỏ hẳn mục 1, không để mục rỗng',
  !/NHẬP QUỸ MARKETING/.test(bx.htmlEmail(r, {}).replace(/<[^>]+>/g, ' ')));
ok('tiêu đề đổi theo việc: có xin nhập thì là ĐỀ XUẤT',
  /^ĐỀ XUẤT PHÊ DUYỆT/.test(bx.tieuDeEmail(r, { xinNap: 1, kyMoi: 'tháng 10/2026' }))
  && /^BÁO CÁO QUỸ/.test(bx.tieuDeEmail(r, {})));

nhom('Bản in — cùng bộ số với thư và với Excel');
const inRa = bx.htmlBaoCao(r, '');
ok('có đủ bốn phần', /Cơ cấu chi theo nhóm/.test(inRa) && /theo tuần/i.test(inRa)
  && /theo người đề nghị/i.test(inRa) && /Chi tiết các khoản chi/.test(inRa));
ok('khai khổ A4 và lặp tiêu đề bảng mỗi trang giấy',
  /@page\{size:A4/.test(inRa) && /thead\{display:table-header-group\}/.test(inRa));
/* Máy để chế độ tối thì trang xem trước ra chữ đen trên nền đen — in giấy vẫn
 * đúng, nhưng người ta nhìn màn hình rồi tưởng hỏng. */
ok('khai nền trắng tường minh', /html\{background:#fff\}/.test(inRa));
ok('in đúng số dư cuối kỳ', inRa.includes('970.000đ'));

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
if (fail) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
