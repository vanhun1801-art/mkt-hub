'use strict';
/**
 * ============================================================================
 * XUẤT DANH SÁCH — không cần mạng, không cần app chạy
 * ============================================================================
 *
 *   node test/xuat.test.js
 *
 * Hai thứ được canh ở đây, và cả hai đều là chuyện hỏng thì không ai thấy:
 *
 *  1. CỘT TIỀN KHÔNG ĐƯỢC LỌT RA. Bảng này đem trình đối tác. Lộ chi phí ở đó
 *     hỏng chuyện lớn hơn mọi lỗi kỹ thuật trong app.
 *  2. TỆP .XLSX PHẢI MỞ ĐƯỢC. Ghi ZIP sai một offset là Excel báo "file hỏng"
 *     mà không nói vì sao — nên ghi xong đọc lại bằng BỘ ĐỌC ĐỘC LẬP (cái đã
 *     dùng cho bản xuất của Tourwell) và so từng ô.
 */
const xuat = require('../xuat');
const { ghiXlsx, ghiCsv } = require('../../lark-chung/xlsx-ghi');
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

/* Bốn buổi đủ các dạng đã gặp trong sổ thật: có giờ đầy đủ, chỉ có ngày, bị
 * huỷ, và một buổi ở tháng khác. */
const DS = [
  {
    start: '2026-09-02T11:00:00+07:00', end: '2026-09-02T19:20:00+07:00',
    title: 'QUAY + LIVESTREAM VINWONDERS', diaDiem: 'Vinwonders', loaiHinh: 'Livestream',
    duration: '8', status: 'Đã hoàn tất', link: 'https://drive.google.com/x',
    owner: [{ id: 'u1', name: 'Nguyễn Long Khánh (Pinky)' }],
    staff: [{ id: 'u1', name: 'Nguyễn Long Khánh (Pinky)' }, { id: 'u2', name: 'Võ Hằng' }],
    costPlan: 700000, costActual: 493000,
  },
  {
    start: '2026-09-13T00:00:00+07:00', end: '',
    title: 'Vinwonder Phú Quốc', diaDiem: 'Vinwonders', loaiHinh: 'Livestream',
    duration: '10', status: 'Đã hoàn tất', link: '',
    owner: [{ id: 'u3', name: 'Lê Văn Hùng' }], staff: [],
    costPlan: 600000, costActual: 0,
  },
  {
    start: '2026-09-20T10:30:00+07:00', end: '',
    title: 'Live/stream Grand World', diaDiem: 'Grand World', loaiHinh: 'Livestream',
    duration: '9', status: 'Hủy lịch', link: '',
    owner: [{ id: 'u1', name: 'Nguyễn Long Khánh (Pinky)' }], staff: [],
    costPlan: 700000, costActual: 0,
  },
  {
    start: '2026-08-19T08:00:00+07:00', end: '2026-08-19T16:00:00+07:00',
    title: 'Capcut tháng 8', diaDiem: '', loaiHinh: 'Quay - chụp',
    duration: '8', status: 'Đã hoàn tất', link: '',
    owner: [{ id: 'u3', name: 'Lê Văn Hùng' }], staff: [],
    costPlan: 930000, costActual: 930000,
  },
];

nhom('Lọc theo đúng thứ người dùng chọn');
const so = (dk) => xuat.loc(DS, dk).length;
ok('không lọc gì thì ra hết', so({}) === 4, String(so({})));
ok('khoảng ngày cắt đúng tháng 9', so({ tu: '2026-09-01', den: '2026-09-30' }) === 3);
ok('lọc địa điểm', so({ diaDiem: 'Vinwonders' }) === 2);
ok('lọc loại hình', so({ loaiHinh: 'Quay - chụp' }) === 1);
ok('lọc trạng thái', so({ trangThai: 'Đã hoàn tất' }) === 3);
ok('lọc chồng nhau', so({ tu: '2026-09-01', den: '2026-09-30', diaDiem: 'Vinwonders' }) === 2);
ok('nhiều trạng thái ngăn bằng dấu phẩy',
  so({ trangThai: 'Đã hoàn tất,Hủy lịch' }) === 4, String(so({ trangThai: 'Đã hoàn tất,Hủy lịch' })));
/* Sổ có dòng thiếu ngày; chúng không được lẳng lặng lọt vào một kỳ nào. */
ok('buổi không có ngày thì không lọt vào khoảng ngày nào',
  xuat.loc([{ start: '', title: 'x' }], { tu: '2026-01-01', den: '2026-12-31' }).length === 0);
ok('xếp theo ngày tăng dần',
  xuat.loc(DS, {}).map((t) => t.title)[0] === 'Capcut tháng 8');

nhom('Cột tiền KHÔNG được lọt ra khi không xin');
const thuong = xuat.dungBang(xuat.loc(DS, {}), false);
const coTien = xuat.dungBang(xuat.loc(DS, {}), true);
const tenCot = (b) => b.cot.map((c) => c.ten).join(' | ');
ok('bảng thường không có cột nào nhắc tiền',
  !/chi phí/i.test(tenCot(thuong)), tenCot(thuong));
ok('và không dòng nào dài hơn số cột', thuong.hang.every((h) => h.length === thuong.cot.length));
ok('xin thì mới có, và có đúng hai cột',
  coTien.cot.length === thuong.cot.length + 2 && /Chi phí dự kiến/.test(tenCot(coTien)));
ok('số tiền ghi kiểu SỐ để Excel cộng được',
  coTien.hang.every((h) => typeof h[h.length - 1] === 'number'));

nhom('Cột dựng cho người đọc, không phải đổ dữ liệu thô');
ok('không có cột nội bộ nào lọt ra',
  !/mục đích|kế hoạch|phản hồi|lý do|ghi chú/i.test(tenCot(thuong)), tenCot(thuong));
const hVin = xuat.dungBang(xuat.loc(DS, { diaDiem: 'Vinwonders' }), false).hang;
ok('gộp phụ trách và nhân sự, không trùng tên',
  hVin[0][6] === 'Nguyễn Long Khánh (Pinky), Võ Hằng', hVin[0][6]);
/* Buổi nhập từ sổ cũ rơi về 00:00 — in "00:00" lên bảng đưa đối tác là một con
 * số không nói gì. */
ok('buổi không ghi giờ thì cột Giờ để TRỐNG', hVin[1][1] === '', JSON.stringify(hVin[1][1]));
ok('buổi có giờ thì hiện cả đầu lẫn cuối', hVin[0][1] === '11:00 – 19:20', hVin[0][1]);

nhom('Phụ đề và tên tệp nói rõ bảng này là của ai, kỳ nào');
const dk = { tu: '2026-09-01', den: '2026-09-30', diaDiem: 'Vinwonders' };
ok('phụ đề có địa điểm, khoảng ngày và số buổi',
  xuat.moTaLoc(dk, 3) === 'Vinwonders  ·  01/09/2026 – 30/09/2026  ·  3 buổi',
  xuat.moTaLoc(dk, 3));
ok('tên tệp bỏ dấu, có địa điểm và kỳ',
  xuat.tenTep(dk, 'xlsx') === 'tac-nghiep_vinwonders_2026-09-01_2026-09-30.xlsx',
  xuat.tenTep(dk, 'xlsx'));

nhom('Tệp .xlsx ghi ra phải đọc lại được');
/* Ghi bằng bộ ghi mới, đọc bằng bộ đọc viết từ trước cho bản xuất Tourwell —
 * hai cài đặt độc lập. Sai một offset trong ZIP là bước này vỡ, thay vì để
 * Excel báo "file hỏng" trên máy người nhận. */
const ra = xuat.xuatXlsx(xuat.loc(DS, dk), dk, false);
ok('có nội dung và đúng đuôi tệp', ra.than.length > 1000 && ra.tep.endsWith('.xlsx'),
  ra.than.length + ' byte');
ok('khai đúng kiểu MIME của Excel', /spreadsheetml\.sheet$/.test(ra.kieu), ra.kieu);
const { sheets } = docXlsx.doc(ra.than);
ok('đọc lại thấy đúng một sheet, đúng tên', sheets.length === 1 && sheets[0].ten === 'Tác nghiệp',
  JSON.stringify(sheets.map((s) => s.ten)));
const rows = sheets[0].rows;
ok('hàng 1 là tiêu đề', rows[0][0] === xuat.TIEU_DE, JSON.stringify(rows[0]));
ok('hàng 2 là phụ đề', rows[1][0] === xuat.moTaLoc(dk, 2), JSON.stringify(rows[1]));
ok('hàng 4 là tên cột', rows[3][0] === 'Ngày' && rows[3][2] === 'Nội dung tác nghiệp',
  JSON.stringify(rows[3]));
ok('dữ liệu về đúng ô', rows[4][2] === 'QUAY + LIVESTREAM VINWONDERS', JSON.stringify(rows[4]));
ok('đủ số dòng: 3 dòng đầu + tên cột + 2 buổi', rows.length === 6, String(rows.length));

/* Ký tự XML và ký tự điều khiển: dữ liệu gõ tay có cả hai, và cả hai đều làm
 * Excel báo "file hỏng" nếu ghi thẳng. */
/* Ký tự chuông dựng bằng fromCharCode, KHÔNG gõ thẳng vào tệp: ký tự điều
 * khiển nằm trong mã nguồn thì trình soạn thảo hay một lần dán qua lại đều
 * nuốt được, và phép thử im lặng ngừng kiểm đúng thứ nó sinh ra để kiểm. */
const CHUONG = String.fromCharCode(7);
const banBan = ghiXlsx({
  ten: 'Thử', cot: [{ ten: 'A' }],
  hang: [['dấu & ngoặc "kép" <thẻ> ' + CHUONG + ' chuông'], ['dòng\nxuống']],
});
const rows2 = docXlsx.doc(banBan).sheets[0].rows;
ok('ký tự &, ngoặc kép và dấu nhọn vẫn nguyên',
  rows2[1][0] === 'dấu & ngoặc "kép" <thẻ>  chuông', JSON.stringify(rows2[1][0]));
ok('ký tự điều khiển bị bỏ, không làm hỏng tệp',
  !rows2[1][0].includes(CHUONG), JSON.stringify(rows2[1][0]));
ok('xuống dòng trong ô vẫn giữ', rows2[2][0].includes('\n'), JSON.stringify(rows2[2][0]));

nhom('CSV là đường vào Google Sheet');
const csv = xuat.xuatCsv(xuat.loc(DS, dk), dk, false).than.toString('utf8');
ok('mở đầu bằng BOM, nếu không Excel vỡ dấu tiếng Việt', csv.charCodeAt(0) === 0xfeff);
ok('dòng đầu là tên cột', csv.split('\r\n')[0].includes('Nội dung tác nghiệp'));
ok('ô có dấu phẩy được bọc ngoặc kép',
  csv.includes('"Nguyễn Long Khánh (Pinky), Võ Hằng"'), csv.split('\r\n')[1]);
const csvTrong = ghiCsv([{ ten: 'A' }], [['có "kép" và, phẩy']]).toString('utf8');
ok('ngoặc kép trong ô được nhân đôi đúng chuẩn',
  csvTrong.includes('"có ""kép"" và, phẩy"'), csvTrong);

nhom('Mỗi lựa chọn mang theo số buổi của nó');
/* Ngày 20/09/2026 anh Hùng lọc Vinwonders · tháng 9 · "Chờ duyệt/Xử lý" và ra
 * 0 buổi, tưởng hỏng. Không hỏng: bốn buổi tháng đó nằm ở "Đã hoàn tất" và
 * "Duyệt/Chờ tác nghiệp". Hai cái tên ấy dùng CÙNG BỘ CHỮ đảo thứ tự — nhìn
 * lướt không phân biệt được. Con số bên cạnh chặn được ngõ cụt đó. */
const demT9 = xuat.demTheo(DS, { tu: '2026-09-01', den: '2026-09-30' });
ok('đếm theo trạng thái đúng',
  demT9.trangThai['Đã hoàn tất'] === 2 && demT9.trangThai['Hủy lịch'] === 1,
  JSON.stringify(demT9.trangThai));
ok('đếm theo địa điểm đúng',
  demT9.diaDiem.Vinwonders === 2 && demT9.diaDiem['Grand World'] === 1,
  JSON.stringify(demT9.diaDiem));

/* Đếm cho MỘT ô thì phải BỎ chính ô đó ra khỏi bộ lọc. Không bỏ thì mọi lựa
 * chọn khác đều ra 0, và ô chọn thành vô dụng đúng lúc cần nó nhất. */
const demKhiDaChon = xuat.demTheo(DS, { diaDiem: 'Vinwonders' });
ok('đếm địa điểm KHÔNG bị chính bộ lọc địa điểm cắt',
  demKhiDaChon.diaDiem['Grand World'] === 1, JSON.stringify(demKhiDaChon.diaDiem));
ok('nhưng ô khác vẫn bị bộ lọc địa điểm cắt',
  demKhiDaChon.trangThai['Hủy lịch'] === undefined, JSON.stringify(demKhiDaChon.trangThai));

nhom('Ra 0 thì phải chỉ được đường ra');
const bkX = { tu: '2026-09-01', den: '2026-09-30', diaDiem: 'Vinwonders', trangThai: 'Hủy lịch' };
ok('bộ lọc này thật sự ra 0', xuat.loc(DS, bkX).length === 0);
const lt = xuat.loiThoat(DS, bkX);
ok('có lối thoát, xếp nhiều buổi trước',
  lt.length >= 2 && lt[0].so >= lt[1].so, JSON.stringify(lt));
ok('chỉ đúng ô đang chặn: bỏ trạng thái thì có lại 2 buổi',
  lt.some((x) => x.bo === 'trangThai' && x.so === 2), JSON.stringify(lt));
/* Không đề nghị bỏ ô mà bỏ xong vẫn 0 — đó là chỉ đường vào ngõ cụt thứ hai. */
ok('không đề nghị lối thoát nào ra 0 buổi', lt.every((x) => x.so > 0), JSON.stringify(lt));
ok('sổ trống thật thì không bịa ra lối thoát', xuat.loiThoat([], bkX).length === 0);

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
if (fail) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
