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

const fs3 = require('fs');

/* Đọc tên các mục trong một gói ZIP từ Central Directory. Bộ đọc .xlsx bên
 * lark-ads-manager chỉ trả về ô, không trả về danh sách mục — mà chỗ cần canh
 * ở đây chính là các mục PHỤ (ảnh, phần vẽ, quan hệ). */
function tenMucZip(buf) {
  const ds = [];
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    const so = buf.readUInt16LE(i + 10);
    let o = buf.readUInt32LE(i + 16);
    for (let k = 0; k < so; k++) {
      if (buf.readUInt32LE(o) !== 0x02014b50) break;
      const dai = buf.readUInt16LE(o + 28);
      ds.push(buf.slice(o + 46, o + 46 + dai).toString('utf8'));
      o += 46 + dai + buf.readUInt16LE(o + 30) + buf.readUInt16LE(o + 32);
    }
    break;
  }
  return ds;
}

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
    plan: 'Kế hoạch chi tiết\n- 11h00 đến Vin\n- 13h45 lên live show tiên cá',
    report: 'Hỗ trợ cấp phép bay flycam',
    owner: [{ id: 'u1', name: 'Nguyễn Long Khánh (Pinky)' }],
    /* Người đăng ký thường khai CHÍNH MÌNH ở cả ô phụ trách lẫn ô nhân sự —
     * nên dòng này cũng là phép thử cho việc không đếm họ thành hai người. */
    staff: [{ id: 'u1', name: 'Nguyễn Long Khánh (Pinky)' }, { id: 'u2', name: 'Võ Hằng' },
      { id: 'u4', name: 'Lê Trung Thành' }],
    costPlan: 700000, costActual: 493000,
  },
  {
    start: '2026-09-13T00:00:00+07:00', end: '',
    title: 'Vinwonder Phú Quốc', diaDiem: 'Vinwonders', loaiHinh: 'Livestream',
    duration: '10', status: 'Đã hoàn tất', link: '',
    plan: '', report: '',
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

nhom('Bộ cột là của NGƯỜI NHẬN, không phải của Base');
/* Bảng này đối tác cầm để BỐ TRÍ: xin phép bay flycam, giữ chỗ ăn, cử người
 * đón. Cột nào không giúp họ bố trí thì không có mặt — và hai cột phải vắng vì
 * lý do riêng, không phải vì thừa:
 *
 *   Trạng thái     — anh Hùng bỏ ngày 21/09/2026. Đối tác đọc "Chờ duyệt/Xử lý"
 *                    rồi tưởng buổi đó chưa chắc chạy.
 *   Tên hoạt động  — gõ tay và cố tình chẻ chữ để né bộ lọc nền tảng
 *                    ("Li/v/e/stre/a/m"). Đóng lên văn bản gửi đối tác thì khó
 *                    coi; Địa điểm + Loại hình nói đúng chuyện đó mà sạch sẽ. */
ok('KHÔNG có cột Trạng thái', !/trạng thái/i.test(tenCot(thuong)), tenCot(thuong));
ok('KHÔNG có cột tên hoạt động', !/nội dung tác nghiệp|tên hoạt động/i.test(tenCot(thuong)),
  tenCot(thuong));
ok('không có ô nội bộ nào lọt ra',
  !/mục đích|phản hồi|lý do|báo cáo sau/i.test(tenCot(thuong)), tenCot(thuong));
ok('có đủ tám cột anh Hùng chốt',
  tenCot(thuong) === 'Ngày | Thời gian bắt đầu | Kế hoạch chi tiết | Địa điểm | Loại hình'
    + ' | Nhân sự phụ trách | Nhân sự đi cùng | Ghi chú trước tác nghiệp', tenCot(thuong));

const hVin = xuat.dungBang(xuat.loc(DS, { diaDiem: 'Vinwonders' }), false).hang;
ok('kế hoạch chi tiết về đúng ô, giữ nguyên xuống dòng',
  hVin[0][2].includes('13h45 lên live show tiên cá') && hVin[0][2].includes('\n'),
  JSON.stringify(hVin[0][2]));
ok('ghi chú trước tác nghiệp về đúng ô',
  hVin[0][7] === 'Hỗ trợ cấp phép bay flycam', JSON.stringify(hVin[0][7]));

/* Gộp một cột nhân sự thì đối tác đọc ra một đám tên ngang hàng, không biết
 * hỏi ai. Tách hai cột thì phải tách cho đúng. */
ok('phụ trách đứng riêng một cột',
  hVin[0][5] === 'Nguyễn Long Khánh (Pinky)', JSON.stringify(hVin[0][5]));
ok('người đi cùng đứng riêng, KHÔNG lặp lại người phụ trách',
  hVin[0][6] === 'Võ Hằng, Lê Trung Thành', JSON.stringify(hVin[0][6]));
ok('không ai đi cùng thì ô để trống, không ghi tên người phụ trách',
  hVin[1][6] === '', JSON.stringify(hVin[1][6]));

/* Buổi nhập từ sổ cũ rơi về 00:00 — in "00:00" lên bảng đưa đối tác là một con
 * số không nói gì. */
ok('buổi không ghi giờ thì cột giờ để TRỐNG', hVin[1][1] === '', JSON.stringify(hVin[1][1]));
ok('buổi có giờ thì chỉ hiện giờ BẮT ĐẦU', hVin[0][1] === '11:00', hVin[0][1]);

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
ok('hàng 4 là tên cột', rows[3][0] === 'Ngày' && rows[3][2] === 'Kế hoạch chi tiết',
  JSON.stringify(rows[3]));
ok('dữ liệu về đúng ô', rows[4][3] === 'Vinwonders', JSON.stringify(rows[4]));
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

nhom('Logo đóng lên tệp .xlsx');
/* Logo là ẢNH NỔI, không phải một ô: bốn phần thêm vào gói ZIP và ba chỗ khai
 * báo. Thiếu một khai báo là Excel báo "file hỏng" mà không nói vì sao — trên
 * máy NGƯỜI NHẬN, sau khi tệp đã gửi đi. Nên kiểm ngay lúc ghi. */
const LOGO_PNG = (() => {
  try { return fs3.readFileSync(__dirname + '/../../lark-mkt-hub/du-lieu/logo.png'); }
  catch (_) { return null; }
})();
if (!LOGO_PNG) {
  ok('có tệp logo trong kho để thử', false, 'thiếu lark-mkt-hub/du-lieu/logo.png');
} else {
  const kho = xuat.khoLogo({ buf: LOGO_PNG, mime: 'image/png' });
  ok('giữ đúng tỉ lệ ảnh gốc, không ép vuông',
    kho.cao === xuat.LOGO_CAO && kho.rong > kho.cao * 2, JSON.stringify(kho && { rong: kho.rong, cao: kho.cao }));

  const coLogo = xuat.xuatXlsx(xuat.loc(DS, dk), dk, false, { buf: LOGO_PNG, mime: 'image/png' });
  const ten = tenMucZip(coLogo.than);
  ok('gói có ảnh', ten.includes('xl/media/image1.png'), JSON.stringify(ten));
  ok('gói có phần vẽ', ten.includes('xl/drawings/drawing1.xml'), JSON.stringify(ten));
  ok('phần vẽ trỏ tới ảnh', ten.includes('xl/drawings/_rels/drawing1.xml.rels'));
  ok('sheet trỏ tới phần vẽ', ten.includes('xl/worksheets/_rels/sheet1.xml.rels'));

  const s2 = docXlsx.doc(coLogo.than).sheets[0];
  ok('vẫn đọc lại được bằng bộ đọc độc lập', s2.ten === 'Tác nghiệp', s2.ten);
  /* Ảnh nổi KHÔNG đẩy nội dung xuống, nên phải chừa sẵn một hàng trống cao
   * đúng bằng nó — thiếu hàng đó là logo nằm đè lên dòng tiêu đề. */
  ok('chừa một hàng trống cho logo đứng, tiêu đề tụt xuống hàng 2',
    (s2.rows[0] || []).length === 0 && s2.rows[1][0] === xuat.TIEU_DE,
    JSON.stringify(s2.rows.slice(0, 2)));
  ok('không có logo thì KHÔNG chừa hàng trống',
    docXlsx.doc(ra.than).sheets[0].rows[0][0] === xuat.TIEU_DE);
}

/* Không lấy được logo KHÔNG được phép làm hỏng bản xuất — hub ngủ lúc nửa đêm
 * là chuyện thường trên Render. */
ok('logo rỗng thì bỏ qua, không ném', xuat.khoLogo(null) === null);
ok('logo là buffer rỗng cũng bỏ qua',
  xuat.khoLogo({ buf: Buffer.alloc(0), mime: 'image/png' }) === null);
const khongLogo = xuat.xuatXlsx(xuat.loc(DS, dk), dk, false, null);
ok('vẫn ra tệp đọc được khi không có logo',
  docXlsx.doc(khongLogo.than).sheets[0].rows.length === 6,
  String(docXlsx.doc(khongLogo.than).sheets[0].rows.length));

nhom('CSV là đường vào Google Sheet');
const csv = xuat.xuatCsv(xuat.loc(DS, dk), dk, false).than.toString('utf8');
ok('mở đầu bằng BOM, nếu không Excel vỡ dấu tiếng Việt', csv.charCodeAt(0) === 0xfeff);
ok('dòng đầu là tên cột', csv.split('\r\n')[0].includes('Kế hoạch chi tiết'));
ok('ô có dấu phẩy được bọc ngoặc kép',
  csv.includes('"Võ Hằng, Lê Trung Thành"'), csv.split('\r\n')[1]);
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

nhom('Ba ô lọc nhận NHIỀU giá trị');
/* Một bảng gửi đối tác thường gộp mấy khu của cùng một bên — Vinwonders +
 * Grand World + Sunset Town. Xuất ba lần rồi dán tay lại là việc app phải làm
 * hộ. */
ok('hai địa điểm thì cộng cả hai',
  so({ diaDiem: 'Vinwonders,Grand World' }) === 3, String(so({ diaDiem: 'Vinwonders,Grand World' })));
ok('một địa điểm vẫn như cũ', so({ diaDiem: 'Vinwonders' }) === 2);
ok('rỗng vẫn là không lọc', so({ diaDiem: '' }) === 4);
ok('nhiều loại hình', so({ loaiHinh: 'Livestream,Quay - chụp' }) === 4);
ok('lọc nhiều chiều chồng nhau',
  so({ diaDiem: 'Vinwonders,Grand World', trangThai: 'Đã hoàn tất' }) === 2);
/* Khoảng trắng thừa quanh dấu phẩy là chuyện thường khi người ta gõ tay URL. */
ok('bỏ qua khoảng trắng quanh dấu phẩy',
  so({ diaDiem: ' Vinwonders , Grand World ' }) === 3);
ok('tên không có trong danh sách thì ra 0, không ra hết',
  so({ diaDiem: 'Chỗ Không Có' }) === 0);

/* Dấu phẩy làm dấu ngăn CHỈ an toàn khi không nhãn nào chứa dấu phẩy. Thêm một
 * nhãn kiểu "Nhà hàng, quán" là bộ lọc gãy âm thầm — lọc ra 0 mà không báo gì. */
const { DS_DIA_DIEM, DS_LOAI_HINH } = require('../public/phan-loai');
const cfgL = require('../config');
ok('không nhãn địa điểm nào chứa dấu phẩy',
  xuat.coDauPhay(DS_DIA_DIEM).length === 0, JSON.stringify(xuat.coDauPhay(DS_DIA_DIEM)));
ok('không nhãn loại hình nào chứa dấu phẩy',
  xuat.coDauPhay(DS_LOAI_HINH).length === 0, JSON.stringify(xuat.coDauPhay(DS_LOAI_HINH)));
const tt = [...(cfgL.staffStatuses || []), ...(cfgL.managerStatuses || [])];
ok('không tên trạng thái nào chứa dấu phẩy',
  xuat.coDauPhay(tt).length === 0, JSON.stringify(xuat.coDauPhay(tt)));

nhom('Phụ đề và tên tệp khi chọn nhiều chỗ');
ok('phụ đề nối bằng dấu cộng, không để nguyên dấu phẩy',
  xuat.moTaLoc({ diaDiem: 'Vinwonders,Grand World' }, 3) === 'Vinwonders + Grand World  ·  3 buổi',
  xuat.moTaLoc({ diaDiem: 'Vinwonders,Grand World' }, 3));
ok('hai chỗ thì tên tệp ghi cả hai',
  xuat.tenTep({ diaDiem: 'Vinwonders,Grand World' }, 'xlsx')
    === 'tac-nghiep_vinwonders-grand-world.xlsx',
  xuat.tenTep({ diaDiem: 'Vinwonders,Grand World' }, 'xlsx'));
/* Ba chỗ trở lên thì tên tệp dài loằng ngoằng mà vẫn không nói đủ. */
ok('ba chỗ trở lên thì ghi số lượng cho gọn',
  xuat.tenTep({ diaDiem: 'Vinwonders,Grand World,Safari' }, 'xlsx')
    === 'tac-nghiep_3-dia-diem.xlsx',
  xuat.tenTep({ diaDiem: 'Vinwonders,Grand World,Safari' }, 'xlsx'));

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
if (fail) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
