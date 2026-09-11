'use strict';
/**
 * ============================================================================
 * THÔNG BÁO CHẶN MÀN HÌNH — ai bị chặn, chặn tới khi nào
 * ============================================================================
 * Anh Hùng cần một nơi gửi thông báo che phủ toàn app, buộc đọc mới dùng tiếp.
 * Đây là chỗ duy nhất trong cả hệ mà một người bấm một nút là màn hình người
 * khác bị chặn — nên luật "ai thấy cái gì" phải thử được, không được đoán.
 *
 * Hai loại lỗi mà bài này canh, cả hai đều im lặng:
 *
 *   gửi sai người — thông báo nội bộ của quản lý chặn màn hình cả phòng, hoặc
 *                   ngược lại: gửi rồi mà không ai thấy vì lọt cửa nào đó.
 *   chặn vĩnh viễn — bật "buộc bấm nút" mà không có nút thì nút "Tôi đã đọc"
 *                   chờ một cái nút không tồn tại, người nhận không thoát được.
 *
 * Chạy: node test/tb-app.test.js   (không cần Base, không cần server)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

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

/* Bảng thông báo để trong file — cùng kiểu seam với bảng Phân quyền. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-tb-'));
const fTb = path.join(tmp, 'tb.json');
const NGAY = (s) => Date.parse(s + 'T00:00:00+07:00');
fs.writeFileSync(fTb, JSON.stringify([
  { tieuDe: 'Cả phòng', noiDung: 'x', mucDo: 'Gấp', nguoiNhan: '*', bat: true },
  { tieuDe: 'Chỉ A và B', noiDung: 'x', mucDo: 'Tin', nguoiNhan: 'ou_a,ou_b', bat: true },
  { tieuDe: 'Đang tắt', noiDung: 'x', mucDo: 'Gấp', nguoiNhan: '*', bat: false },
  { tieuDe: 'Chưa tới ngày', noiDung: 'x', nguoiNhan: '*', bat: true, tuNgay: NGAY('2026-10-01') },
  { tieuDe: 'Đã hết hạn', noiDung: 'x', nguoiNhan: '*', bat: true, denNgay: NGAY('2026-09-05') },
  { tieuDe: 'A đã đọc rồi', noiDung: 'x', nguoiNhan: '*', bat: true, daDoc: 'ou_a@2026-09-01T00:00:00Z' },
  { tieuDe: 'Không gửi cho ai', noiDung: 'x', nguoiNhan: '', bat: true },
]));
process.env.HUB_TB_FILE = fTb;

const tb = require('../thongbao-app');
const T = (o) => tb.chuanHoa(Object.assign({ recordId: 'r', tieuDe: 'x', bat: true, nguoiNhan: '*' }, o));
const LUC = NGAY('2026-09-11') + 10 * 3600000;   // 10h sáng 11/09 giờ VN

(async () => {
  group('1. Bốn cửa của luật hiển thị — cửa nào cũng chặn được một mình');
  {
    ok('mặc định (bật, cả phòng, không khoảng) thì hiện',
      tb.dangHieuLuc(T({}), 'ou_a', LUC));
    ok('tắt thì không hiện', !tb.dangHieuLuc(T({ bat: false }), 'ou_a', LUC));
    ok('chưa tới "Từ ngày" thì không hiện',
      !tb.dangHieuLuc(T({ tuNgay: NGAY('2026-09-12') }), 'ou_a', LUC));
    ok('đúng ngày bắt đầu thì hiện',
      tb.dangHieuLuc(T({ tuNgay: NGAY('2026-09-11') }), 'ou_a', LUC));

    /* "Đến ngày" phải tính HẾT ngày đó. Quản lý đặt 11/09 là có ý bao gồm cả
     * ngày 11; tắt lúc 00:00 sáng 11 nghĩa là thông báo không hiện đúng ngày
     * cuối mà quản lý vừa chọn — và không có gì trên màn hình nói ra. */
    ok('ngày cuối vẫn hiện suốt ngày đó',
      tb.dangHieuLuc(T({ denNgay: NGAY('2026-09-11') }), 'ou_a', LUC));
    ok('23:59 ngày cuối vẫn hiện',
      tb.dangHieuLuc(T({ denNgay: NGAY('2026-09-11') }), 'ou_a', NGAY('2026-09-11') + 86399000));
    ok('sang hôm sau thì tắt',
      !tb.dangHieuLuc(T({ denNgay: NGAY('2026-09-11') }), 'ou_a', NGAY('2026-09-12')));
  }

  group('2. Gửi cho ai — dùng lại đúng quy ước của "Base được xem"');
  {
    ok('`*` = cả phòng, kể cả người lạ chưa khai quyền',
      tb.dangHieuLuc(T({ nguoiNhan: '*' }), 'ou_la', LUC));
    ok('kê tên: đúng người đó thấy',
      tb.dangHieuLuc(T({ nguoiNhan: 'ou_a,ou_b' }), 'ou_b', LUC));
    /* Đây là nửa quan trọng: gửi riêng mà người khác cũng bị chặn thì vừa lộ
     * nội dung vừa chặn oan. */
    ok('kê tên: người KHÔNG được kê thì không thấy',
      !tb.dangHieuLuc(T({ nguoiNhan: 'ou_a,ou_b' }), 'ou_c', LUC));
    ok('để trống người nhận = KHÔNG AI (không phải "tất cả")',
      !tb.dangHieuLuc(T({ nguoiNhan: '' }), 'ou_a', LUC));
    ok('chưa đăng nhập (không có id) thì không bị chặn bởi thông báo gửi riêng',
      !tb.dangHieuLuc(T({ nguoiNhan: 'ou_a' }), '', LUC));
  }

  group('3. Đã đọc thì thôi — và ghi lại được thời điểm');
  {
    const x = T({ daDoc: 'ou_a@2026-09-01T00:00:00Z,ou_b' });
    ok('A đã đọc', tb.daXacNhan(x, 'ou_a'));
    ok('B đã đọc dù ô chỉ ghi open_id trần (sửa tay trong Lark)', tb.daXacNhan(x, 'ou_b'));
    ok('C chưa đọc', !tb.daXacNhan(x, 'ou_c'));
    /* Đi rồi về phải còn nguyên: mở bảng ra sửa một ô khác rồi lưu không được
     * làm mất dấu ai đã đọc. */
    const vong = tb.docDaDoc(tb.ghiDaDoc(x.daDoc));
    ok('đọc -> ghi -> đọc giữ nguyên cả người lẫn thời điểm',
      vong.get('ou_a') === '2026-09-01T00:00:00Z' && vong.has('ou_b') && vong.size === 2,
      JSON.stringify([...vong.entries()]));
  }

  group('4. Danh sách của một người — đọc từ file, gấp lên trước');
  {
    const cuaA = await tb.cuaNguoi({ id: 'ou_a' }, true);
    const ten = cuaA.map((x) => x.tieuDe);
    ok('A thấy đúng hai thông báo còn phải đọc',
      ten.length === 2 && ten.includes('Cả phòng') && ten.includes('Chỉ A và B'), ten.join(' | '));
    ok('thông báo A ĐÃ ĐỌC không còn trong danh sách', !ten.includes('A đã đọc rồi'));
    ok('thông báo đang tắt / chưa tới ngày / hết hạn đều không có',
      !ten.includes('Đang tắt') && !ten.includes('Chưa tới ngày') && !ten.includes('Đã hết hạn'));
    ok('"không gửi cho ai" thì không chặn ai', !ten.includes('Không gửi cho ai'));
    ok('Gấp xếp trước Tin', ten[0] === 'Cả phòng', ten.join(' | '));

    const cuaC = await tb.cuaNguoi({ id: 'ou_c' }, true);
    ok('C không thấy thông báo gửi riêng cho A và B',
      !cuaC.map((x) => x.tieuDe).includes('Chỉ A và B'), cuaC.map((x) => x.tieuDe).join(' | '));

    /* Nội dung KHÔNG được gửi kèm những trường nội bộ: danh sách người nhận và
     * danh sách ai đã đọc là chuyện của quản lý, không phải thứ đẩy xuống máy
     * từng nhân sự. */
    ok('gửi xuống máy nhân sự KHÔNG kèm danh sách người nhận / đã đọc',
      cuaA.every((x) => !('ai' in x) && !('daDoc' in x) && !('moiAi' in x)),
      JSON.stringify(Object.keys(cuaA[0] || {})));
  }

  group('5. Xác nhận rồi thì biến khỏi danh sách, và không ghi đè thời điểm cũ');
  {
    const truoc = await tb.cuaNguoi({ id: 'ou_c' }, true);
    const rec = truoc[0].recordId;
    await tb.xacNhan(rec, 'ou_c');
    const sau = await tb.cuaNguoi({ id: 'ou_c' }, true);
    ok('xác nhận xong thì thông báo đó rời danh sách',
      sau.length === truoc.length - 1 && !sau.some((x) => x.recordId === rec),
      truoc.length + ' -> ' + sau.length);

    const ds1 = await tb.docTatCa(true);
    const luc1 = ds1.find((x) => x.recordId === rec).daDoc.get('ou_c');
    await tb.xacNhan(rec, 'ou_c');
    const ds2 = await tb.docTatCa(true);
    const luc2 = ds2.find((x) => x.recordId === rec).daDoc.get('ou_c');
    /* Bấm hai lần không được làm đổi thời điểm: đó là bằng chứng "họ đọc lúc
     * nào", mà đổi được thì nó không còn là bằng chứng. */
    ok('bấm xác nhận lần hai KHÔNG đổi thời điểm đã ghi', luc1 === luc2, luc1 + ' vs ' + luc2);
    ok('người khác vẫn chưa đọc', !ds2.find((x) => x.recordId === rec).daDoc.has('ou_z'));
  }

  group('6. Máy chủ phải CHỐT, không chỉ ẩn trên giao diện');
  {
    const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const i = sv.indexOf("if (p === '/api/tb-app')");
    const than = i < 0 ? '' : sv.slice(i, i + 3000);

    ok('có đầu mối /api/tb-app', than.length > 0);
    /* Người xác nhận lấy từ PHIÊN. Nhận theo client thì gõ tay một open_id khác
     * là xác nhận hộ người ta — mất luôn bằng chứng ai đã đọc. */
    ok('người xác nhận lấy từ phiên, không nhận từ client',
      /tbApp\.xacNhan\(b\.recordId, nguoiTB\.id\)/.test(than),
      '(không thấy — coi lại có đang nhận open_id từ body không)');
    /* Quản lý bấm "Xem như" để soát giao diện nhân sự. Nếu popup chặn ở đó và
     * bấm được thì đó là xác nhận HỘ người ta. */
    ok('đang "Xem như" thì không trả thông báo và không cho xác nhận',
      /if \(nhuTB\) return ok\(res, \{ ds: \[\]/.test(than) &&
      /không xác nhận thay họ được/.test(than));
    ok('soạn/sửa/xoá chỉ quản lý', /'\/api\/tb-app\/quan-ly'[\s\S]{0,200}chiQuanLy/.test(sv));
    ok('chặn lưu khi chưa chọn người nhận — gửi mà không ai thấy thì vô nghĩa',
      /Chưa chọn người nhận/.test(sv));
  }

  group('6b. Máy cá nhân (chế độ cli) không được bị chặn — cái bẫy đã đo được');
  {
    /* Chế độ cli CỐ Ý không có danh tính phiên (xem aiDangXem trong server.js).
     * Nên một thông báo "cả phòng" vẫn qua được luật hiển thị — đo thật:
     * dangHieuLuc(tb, '') = true — mà đường xác nhận lại đòi id từ phiên và trả
     * 401. Popup hiện lên và KHÔNG BAO GIỜ đóng được, khoá luôn hub trên máy
     * của chính người gửi. */
    const caPhong = tb.chuanHoa({ recordId: 'r', tieuDe: 'x', bat: true, nguoiNhan: '*' });
    ok('vẫn đúng là luật hiển thị cho qua khi người xem không có id',
      tb.dangHieuLuc(caPhong, '', LUC) === true,
      '(nếu đổi thì bỏ được cái chặn ở server, đọc lại chú thích ở đó)');

    const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const i = sv.indexOf("if (p === '/api/tb-app')");
    const than = i < 0 ? '' : sv.slice(i, i + 3000);
    ok('nên server chặn thẳng ở chế độ cli, trả danh sách rỗng',
      /cfg\.mode !== 'api'\) return ok\(res, \{ ds: \[\], cuBo: 'cli' \}\)/.test(than),
      '(không thấy — máy cá nhân sẽ bị popup khoá cứng)');
  }

  group('7. Giao diện: không có đường thoát nào ngoài nút xác nhận');
  {
    const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'tbapp.js'), 'utf8');
    /* Cả cơ chế này sinh ra để chặn. Có một dấu X, một handler Escape, hay một
     * cú bấm ra ngoài là đóng được, thì nó thành cái toast to. */
    ok('không có dấu X / nút đóng nào trong lớp phủ',
      !/data-close/.test(app) && !/dongModal/.test(app));
    ok('Escape bị chặn ở chế độ capture (trước handler chung của hub)',
      /addEventListener\('keydown'[\s\S]{0,220}\}, true\)/.test(app) &&
      /stopPropagation/.test(app));
    ok('khoá cuộn trang nền khi đang chặn', /classList\.add\('bb-chan'\)/.test(app));
    ok('nút xác nhận khoá khi buộc bấm mà chưa bấm',
      /const khoa = tb\.buocBam && nut && !TB\.daBam/.test(app));

    /* "Xem thử" là cửa của QUẢN LÝ, không phải lỗ thoát của bản thật. Ba điều
     * phải đúng: có băng nói rõ đang xem thử, bấm gì cũng KHÔNG ghi xác nhận,
     * và Escape đóng được (chỉ ở chế độ xem thử). */
    ok('có chế độ xem thử', /function xemThuTb\(/.test(app) && /TB\.thu/.test(app));
    ok('xem thử: bấm "Tôi đã đọc" thì ĐÓNG, không gọi xác nhận',
      /TB\.thu \? dongXemThu\(\) : xacNhanTb\(tb\)/.test(app),
      '(bấm ở chế độ xem thử mà vẫn ghi thì quản lý xác nhận hộ chính mình)');
    ok('xem thử: có băng nói rõ để không nhầm với bản thật',
      /bb-thu/.test(app) && /xem thử/.test(app));
    ok('Escape chỉ đóng được khi đang xem thử', /if \(TB\.thu\) dongXemThu\(\)/.test(app));
    /* Nhịp tự nạp 60 giây ghi đè TB.ds bằng danh sách của máy chủ — mà trên máy
     * quản lý danh sách đó rỗng. Không đứng yên thì bản xem thử biến mất giữa
     * lúc đang xem (đã đo được đúng thế lúc thử tay). */
    ok('nhịp tự nạp đứng yên khi đang xem thử',
      /if \(TB\.thu\) return;/.test(app),
      '(không thì xem thử bị chính nhịp tự nạp xoá mất sau 60 giây)');

    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    /* Cắt đúng khối `.bb-phu { ... }` rồi mới tìm z-index trong đó. Bản đầu tôi
     * quét từ `.tb-phu` mà tên đó đã thuộc về bảng chuông thông báo — đúng cái
     * va chạm class mà phép thử này vừa giúp tìm ra. */
    const kh = /\.bb-phu \{([^}]*)\}/.exec(css);
    const z = kh && /z-index: (\d+)/.exec(kh[1]);
    const zKhac = [...css.matchAll(/z-index: (\d+)/g)].map((m) => Number(m[1]));
    ok('lớp phủ nằm TRÊN mọi z-index khác của hub',
      !!z && Number(z[1]) === Math.max(...zKhac),
      z ? 'bb-phu=' + z[1] + ' · cao nhất trong tệp=' + Math.max(...zKhac) : '(không thấy khối .bb-phu)');
  }

  group('7b. "Ai đã xem, ai chưa" — phải là danh sách, không phải con số');
  {
    /* Anh Hùng mở trang ra và không biết ai đã xem ai chưa. Bản đầu chỉ có
     * "3 đã đọc / 34 chưa đọc" cộng tám cái tên cắt ngang: con số nói CÓ BAO
     * NHIÊU, còn câu hỏi của quản lý là NHỮNG AI — để đi nhắc đúng người. */
    const cd = fs.readFileSync(path.join(__dirname, '..', 'public', 'caidat.js'), 'utf8');

    ok('có cửa sổ hai danh sách', /function moAiDaXem\(/.test(cd));
    ok('mỗi dòng thông báo có nút mở nó', /data-tb-ai="/.test(cd));
    ok('danh sách ĐÃ XEM kèm giờ đọc, không chỉ tên',
      /bb-luc/.test(cd) && /gio\(x\.luc\)/.test(cd),
      '(giờ đọc là thứ phân biệt "đọc lúc 23:14 hôm qua" với "8:02 sáng nay")');
    ok('chưa-xem xếp theo tên để dò được bằng mắt',
      /localeCompare\(tenCua\(b\), 'vi'\)/.test(cd));
    ok('đã-xem xếp theo thứ tự đọc sớm trước',
      /sort\(\(a, b\) => String\(a\.luc\)\.localeCompare\(String\(b\.luc\)\)\)/.test(cd));
    /* Gửi "cả phòng" thì người nhận suy ra từ danh bạ — phải nói ra chỗ đó,
     * không thì con số trông như tuyệt đối mà thực ra là ước lượng. */
    ok('nói rõ "cả phòng" đang tính theo danh bạ',
      /tính theo danh bạ/.test(cd));
    /* Bỏ hẳn kiểu bày tám cái tên cắt ngang ở dòng thu gọn. */
    ok('dòng thu gọn không còn cắt tên ở số 8',
      !/chua\.slice\(0, 8\)/.test(cd));

    const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    /* Máy chủ phải trả kèm TÊN, không chỉ open_id: panel mà tự dò tên thì người
     * đã rời khỏi danh bạ sẽ hiện thành một chuỗi ou_... không ai đọc được. */
    ok('máy chủ đổi open_id thành tên trước khi trả về',
      /daDoc: \[\.\.\.tb\.daDoc\.entries\(\)\]\.map\(\(\[id, luc\]\) => \(\{ id, ten: ten\.get\(id\) \|\| id, luc \}\)\)/.test(sv));
  }

  group('7c. Soạn ở máy cá nhân thì người nhận không khớp — phải nói ra');
  {
    /* Đo được trên Base thật: anh Hùng tạo hai thông báo trên Render, người
     * nhận là ou_5c7965c6..., đã xác nhận cả hai. Còn danh bạ ở máy cá nhân
     * trả về ou_f0d3514a... cho CÙNG một người. open_id cấp theo từng app Lark:
     * máy cá nhân đọc qua phiên lark-cli, bản deploy đọc qua app Marketing Hub.
     *
     * Hậu quả im lặng nhất trong cả tính năng này: tick đúng tên, lưu thành
     * công, không ai nhận được gì. Không lỗi, không dấu hiệu. Vá ở tầng này thì
     * không được (không có đường đổi open_id vùng này sang vùng kia khi người
     * đó không tồn tại trên máy đang chạy), nên phải nói thẳng trên màn hình. */
    const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const cd = fs.readFileSync(path.join(__dirname, '..', 'public', 'caidat.js'), 'utf8');

    ok('máy chủ báo chế độ đang chạy cho panel', /cheDo: cfg\.mode/.test(sv));
    ok('panel cảnh báo khi không phải chế độ api',
      /d\.cheDo && d\.cheDo !== 'api'/.test(cd) &&
      /đừng soạn thông báo ở đây/.test(cd));
    ok('cảnh báo nói rõ NGUYÊN NHÂN là open_id khác vùng',
      /open_id<\/code> khác/.test(cd) || /open_id.{0,40}khác/.test(cd));
    /* Và cảnh báo lần hai ngay tại khối chọn người — người ta đọc băng trên rồi
     * vẫn cuộn xuống tick, nên phải có chữ ở đúng chỗ tay đang làm. */
    ok('khối "Gửi cho" cũng cảnh báo tại chỗ',
      /Máy cá nhân: danh sách dưới đây/.test(cd));
  }

  group('8. Không tệp public nào khai trùng tên ở phạm vi toàn cục');
  {
    /* Lỗi đã xảy ra thật lúc dựng tính năng này: `ngayTb` khai ở cả caidat.js
     * lẫn tbapp.js. Các tệp này là <script> thường nên dùng CHUNG một phạm vi
     * toàn cục — khai hai lần là SyntaxError, và tệp nạp sau CHẾT HOÀN TOÀN.
     * Trên màn hình thì chỉ là "lớp phủ không chạy", không có gì báo; phải mở
     * console mới thấy một dòng. Nên canh bằng phép thử. */
    const thuMuc = path.join(__dirname, '..', 'public');
    const teps = fs.readdirSync(thuMuc).filter((f) => f.endsWith('.js'));
    const khai = new Map();
    for (const f of teps) {
      const src = fs.readFileSync(path.join(thuMuc, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')      // bỏ chú thích khối
        .replace(/^\s*\/\/.*$/gm, '');          // bỏ chú thích dòng
      // chỉ xét khai báo ở CỘT 0 — trong hàm thì trùng tên không sao
      /* CHỈ xét let/const/class: đúng ba thứ này khai hai lần là SyntaxError và
       * tệp chết hẳn. `function` và `var` thì khai lại được — tệp nạp sau ghi đè
       * tệp trước (hub đang có một chỗ như vậy: modalCaiDat ở app.js bị caidat.js
       * ghi đè). Lộn xộn, nhưng không phải lỗi mà bài này canh. */
      for (const m of src.matchAll(/^(?:let|const|class)\s+([A-Za-z_$][\w$]*)/gm)) {
        const ten = m[1];
        if (!khai.has(ten)) khai.set(ten, []);
        if (!khai.get(ten).includes(f)) khai.get(ten).push(f);
      }
    }
    const trung = [...khai.entries()].filter(([, fs2]) => fs2.length > 1);
    ok('không tên nào bị khai ở hai tệp', trung.length === 0,
      trung.map(([t, fs2]) => t + ' (' + fs2.join(' + ') + ')').join(' · '));
    /* Canh chính phép thử: regex hỏng thì nó quét ra rỗng và luôn xanh. Neo vào
     * mấy tên chắc chắn có để biết nó thật sự đang đọc được tệp. */
    ok('phép thử này quét được thật (thấy những tên đã biết là có)',
      khai.size > 20 && khai.has('TB') && khai.has('S'),
      'thấy ' + khai.size + ' tên · có TB=' + khai.has('TB') + ' · có S=' + khai.has('S'));
  }

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

  console.log('\n' + '─'.repeat(56));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})();
