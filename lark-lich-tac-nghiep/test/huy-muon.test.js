'use strict';
/**
 * ============================================================================
 * XIN HUỶ MUỘN — lịch đã duyệt mà không đi được
 * ============================================================================
 * Chỗ kẹt anh Hùng nêu: nhân sự đã được duyệt, chờ đi tác nghiệp. Thuận lợi
 * thì đi xong rồi báo cáo. Bất lợi — bất khả kháng không đi được — thì họ
 * KHÔNG báo cáo được (chưa đi thì không có gì nộp) mà cũng KHÔNG huỷ được
 * (lịch đã duyệt thì huỷ là việc của quản lý). Lịch treo mãi ở làn 4.
 *
 * Đường lùi mở MUỘN: 36 tiếng tính từ đầu ngày đi, tức 12h trưa ngày hôm sau.
 *
 * Vì sao phải có bài thử riêng cho một phép cộng: nó cộng độ lệch Việt Nam
 * TRƯỚC khi lấy đầu ngày, và app này đã có một lỗi đúng kiểu đó — Render chạy
 * giờ UTC nên mọi mốc 00:00–06:59 giờ VN bị đẩy sang ngày hôm trước (đo được
 * 16 lịch và 3 việc rơi sai cột). Sai một ngày ở đây nghĩa là nút huỷ mở sớm
 * 24 tiếng, và không có gì trên màn hình nói ra điều đó.
 *
 * Chạy: node test/huy-muon.test.js   (không cần server, không cần Base)
 */
const fs = require('fs');
const path = require('path');
const hm = require('../huy-muon');
const cfg = require('../config');

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

const L = cfg.lateCancel;
const DUYET = L.status;
const lich = (start, status) => ({ start, status: status === undefined ? DUYET : status });
/** Mốc -> "YYYY-MM-DD HH:MM" giờ Việt Nam, để câu báo lỗi đọc được bằng mắt. */
const vn = (ms) => (ms ? new Date(ms + hm.LECH_VN).toISOString().slice(0, 16).replace('T', ' ') : '(không có)');

group('1. Mốc mở cửa: 12h trưa ngày HÔM SAU, bất kể đi lúc mấy giờ');
{
  /* Ba chuyến cùng ngày 10/09 nhưng giờ đi khác nhau hẳn — kể cả 00:30 sáng và
   * 23:30 đêm, là hai đầu dễ rơi sai ngày nhất. Cả ba phải mở cùng một lúc:
   * không có lý gì hạn xin huỷ của chuyến 6h sáng lệch chuyến 22h 16 tiếng. */
  const ds = [
    ['2026-09-10T00:30:00+07:00', 'nửa đêm về sáng'],
    ['2026-09-10T06:00:00+07:00', 'sáng sớm'],
    ['2026-09-10T13:00:00+07:00', 'giữa trưa'],
    ['2026-09-10T23:30:00+07:00', 'gần nửa đêm'],
  ];
  const mocs = ds.map(([s]) => hm.moc(lich(s), L.afterMs));
  ok('bốn giờ đi khác nhau trong cùng một ngày ra CÙNG một mốc',
    new Set(mocs).size === 1, ds.map(([, t], i) => t + '=' + vn(mocs[i])).join(' · '));
  ok('mốc đó là 12:00 ngày 11/09 giờ Việt Nam',
    vn(mocs[0]) === '2026-09-11 12:00', vn(mocs[0]));

  /* Đây là cái bẫy múi giờ: 00:30 ngày 10/09 giờ VN là 17:30 ngày 09/09 giờ
   * UTC. Nếu lấy đầu ngày theo UTC thì mốc rơi vào 11/09 lúc 05:00 VN — mở
   * sớm 7 tiếng, và với chuyến 06:00 thì lệch hẳn sang ngày 10. */
  ok('chuyến 00:30 KHÔNG bị tính lùi sang ngày hôm trước',
    vn(hm.moc(lich('2026-09-10T00:30:00+07:00'), L.afterMs)) === '2026-09-11 12:00',
    vn(hm.moc(lich('2026-09-10T00:30:00+07:00'), L.afterMs)));

  /* Mốc gửi từ Base thường là dạng UTC kèm Z, không phải +07:00. Cùng một thời
   * điểm viết hai cách thì phải ra cùng một mốc. */
  ok('mốc viết bằng Z (UTC) và bằng +07:00 cho cùng kết quả',
    hm.moc(lich('2026-09-09T23:00:00Z'), L.afterMs) ===
    hm.moc(lich('2026-09-10T06:00:00+07:00'), L.afterMs));

  ok('lịch chưa có ngày đi thì KHÔNG đoán mốc, trả 0',
    hm.moc(lich(''), L.afterMs) === 0 && hm.moc(lich(null), L.afterMs) === 0 &&
    hm.moc({}, L.afterMs) === 0);
}

group('2. Cửa mở đúng lúc — không sớm một phút nào');
{
  const t = lich('2026-09-10T08:00:00+07:00');
  const moc = hm.moc(t, L.afterMs);

  ok('ngay lúc đi: chưa mở', !hm.duoc(t, L, Date.parse('2026-09-10T08:00:00+07:00')));
  /* 9h sáng hôm sau là mốc NHẮC BÁO CÁO của app. Cửa huỷ phải đứng sau nó:
   * giục nộp trước, không nộp được thì trưa mới mở đường lùi. Mở cùng lúc thì
   * nút huỷ thành lối đi tiện tay của những chuyến chỉ đang chậm báo cáo. */
  ok('9h sáng hôm sau (mốc nhắc báo cáo): vẫn chưa mở',
    !hm.duoc(t, L, Date.parse('2026-09-11T09:00:00+07:00')));
  ok('11:59 hôm sau: chưa mở', !hm.duoc(t, L, moc - 60000));
  ok('đúng 12:00 hôm sau: mở', hm.duoc(t, L, moc));
  ok('sau đó: vẫn mở', hm.duoc(t, L, moc + 30 * 86400000));
}

group('3. Chỉ lịch ĐÃ DUYỆT mới có đường lùi này');
{
  const khi = Date.parse('2026-10-01T12:00:00+07:00');   // rất muộn so với ngày đi
  const s = '2026-09-10T08:00:00+07:00';

  ok('Duyệt/Chờ tác nghiệp: có', hm.duoc(lich(s), L, khi));

  /* Đã bấm Báo cáo nghĩa là đã đi. Không đi mà bấm báo cáo thì đó là chuyện
   * khác, không phải chuyện của nút này. */
  ok('Đang báo cáo: KHÔNG — đã bấm báo cáo là đã đi',
    !hm.duoc(lich(s, 'Đang báo cáo'), L, khi));
  /* Nháp và chờ duyệt đã có đường huỷ riêng, nhẹ hơn hẳn (nháp huỷ thẳng, đã
   * gửi thì xin huỷ kèm lý do). Mở thêm cửa nặng ở đây chỉ gây lẫn. */
  ok('Đang lên kế hoạch: KHÔNG — nháp huỷ thẳng, không phải xin',
    !hm.duoc(lich(s, 'Đang lên kế hoạch'), L, khi));
  ok('Chờ duyệt/Xử lý: KHÔNG — đã có cửa xin huỷ thường',
    !hm.duoc(lich(s, 'Chờ duyệt/Xử lý'), L, khi));
  ok('Đã hoàn tất / Hủy lịch / Từ chối: KHÔNG',
    ['Đã hoàn tất', 'Hủy lịch', 'Từ chối'].every((st) => !hm.duoc(lich(s, st), L, khi)));
  ok('lịch để trống ô trạng thái: KHÔNG', !hm.duoc(lich(s, ''), L, khi));
}

group('4. Máy chủ phải CHỐT, không chỉ ẩn nút trên giao diện');
{
  /* Nút ẩn không phải là luật. Nhân sự gọi thẳng API — hoặc tick ô "Xin huỷ
   * lịch" ngay trên Base — thì vẫn phải bị chặn, không thì cả cơ chế 36 tiếng
   * chỉ là một câu trang trí. */
  const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const i = sv.indexOf('body.cancelWant === true');
  const than = i < 0 ? '' : sv.slice(i, i + 2600);

  ok('có nhánh chốt riêng cho lịch đã duyệt',
    /cfg\.lateCancel\.status/.test(than), '(không thấy nhánh nào so trạng thái)');
  ok('chặn khi CHƯA tới mốc', /CANCEL_TOO_EARLY/.test(than));
  ok('chặn khi lý do quá ngắn', /CANCEL_REASON_SHORT/.test(than));
  ok('chặn khi lịch không có ngày đi', /CANCEL_NO_DATE/.test(than));
  /* Chỉ chặn NHÂN SỰ: quản lý vẫn phải huỷ được bất cứ lúc nào, nếu không thì
   * chính người có quyền quyết lại là người bị khoá. */
  ok('chỉ áp cho nhân sự, quản lý không bị khoá', /!manager && item\.status/.test(than));
  /* Câu báo lỗi phải NÓI RA mốc. "Chưa được huỷ" thì người ta bấm lại mỗi
   * tiếng; "từ 12:00 11/09" thì họ biết đường mà chờ. */
  ok('câu báo lỗi nói rõ mốc mở cửa', /gioVN\(new Date\(moc\)\)/.test(than));
}

group('5. Giao diện dùng ĐÚNG con số của máy chủ');
{
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  /* Nút hiện theo một mốc mà máy chủ chốt theo mốc khác thì người ta bấm vào
   * bị chặn và không hiểu vì sao. Nên giao diện phải đọc luật từ /api/meta. */
  ok('giao diện đọc lateCancel từ meta', /S\.config\.lateCancel/.test(app));
  ok('máy chủ có gửi lateCancel trong /api/meta',
    /lateCancel: cfg\.lateCancel/.test(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8')));

  /* Bộ mặc định trong app.js chỉ để màn hình không vỡ khi meta chưa về — nó
   * vẫn phải trùng config, không thì lúc mạng chậm nút hiện sai. */
  const mac = /HUY_MUON_MAC\s*=\s*\{([^}]*)\}/.exec(app);
  ok('bộ mặc định của giao diện trùng config', !!mac &&
    new RegExp('afterMs:\\s*' + (L.afterMs / 3600000) + '\\s*\\*\\s*3600000').test(mac[1]) &&
    new RegExp('minReason:\\s*' + L.minReason).test(mac[1]) &&
    mac[1].includes(L.status), mac ? mac[1].trim() : '(không thấy)');

  /* Nút chỉ dành cho NGƯỜI PHỤ TRÁCH: người đi cùng không nộp báo cáo thì cũng
   * không xin huỷ thay — cùng một luật với mọi thao tác khác của lịch. Và quản
   * lý không có nút này: họ đã có "Hủy lịch" thẳng trong ô chi tiết. */
  const co = /function huyMuonCoNut\(t\) \{([\s\S]*?)\n\}/.exec(app);
  ok('nút chỉ hiện cho người phụ trách, không hiện cho quản lý',
    !!co && /laPhuTrach\(t\)/.test(co[1]) && /!MGR\(\)/.test(co[1]) &&
    /huyMuonDuoc\(t\)/.test(co[1]), co ? co[1].trim() : '(không thấy)');
  ok('đang xin huỷ rồi thì không hiện nút lần nữa',
    !!co && /!t\.cancelWant/.test(co[1]));

  /* Xem như: VẼ nút nhưng KHOÁ.
   *
   * Nút này chỉ hiện cho người phụ trách không phải quản lý, nên nó không bao
   * giờ xuất hiện trên màn hình quản lý — mà Xem như lại ẩn sạch mọi nút thao
   * tác, nên ở đó cũng không soát được. Anh Hùng phải chạy một bản riêng đóng
   * vai nhân sự ở cổng khác mới thấy. Giờ Xem như vẽ nút, khoá lại, kèm chữ. */
  const bam = /function huyMuonBamDuoc\(t\) \{([\s\S]*?)\n\}/.exec(app);
  ok('"bấm được" = không ở Xem như, cộng đủ điều kiện có nút',
    !!bam && /!PREVIEW\(\)/.test(bam[1]) && /huyMuonCoNut\(t\)/.test(bam[1]),
    bam ? bam[1].trim() : '(không thấy)');

  const ve = /function nutHuyMuon\(t, nhan\) \{([\s\S]*?)\n\}/.exec(app);
  ok('có hàm vẽ nút dùng chung cho hai chỗ (thẻ và bảng thông tin)', !!ve);
  ok('Xem như: nút KHOÁ và KHÔNG mang data-huymuon (bấm cũng không mở gì)',
    !!ve && /disabled/.test(ve[1]) &&
    /PREVIEW\(\)/.test(ve[1]) &&
    // nhánh có data-huymuon phải nằm trong nhánh !PREVIEW()
    ve[1].indexOf('data-huymuon') < ve[1].indexOf('disabled'),
    ve ? ve[1].trim() : '(không thấy)');
  ok('Xem như: có dòng chữ nói đây là nút của nhân sự',
    !!ve && /Nhân sự thấy nút này/.test(ve[1]));
  /* Chân bảng thông tin cũng phải theo, không thì hai chỗ nói hai đằng. */
  ok('chân bảng thông tin cũng vẽ nút khoá khi Xem như',
    /huyMuonCoNut\(t\)\s*\n?\s*\?/.test(app) &&
    /Nhân sự thấy nút này[\s\S]{0,200}btn danger" disabled/.test(app));

  /* Cửa sổ phải khác hẳn cửa xin huỷ thường: đỏ, kê tác hại, bắt xác nhận. */
  ok('có cửa sổ riêng cho huỷ muộn', /function moXinHuyMuon\(/.test(app));
  ok('cửa sổ kê ra tác hại từ chính bản ghi', /function tacHaiHuy\(/.test(app) &&
    /tacHaiHuy\(t\)/.test(app));
  ok('nút gửi khoá tới khi đủ lý do VÀ đã xác nhận',
    /oGui\.disabled = !\(duLd && oOk\.checked\)/.test(app));
  ok('quản lý cũng thấy bản kê tác hại ngay ở ô chi tiết',
    /hm-ds-nho/.test(app));

  /* Màu đỏ phải nằm ở CSS bằng biến, không ghi mã màu trong app.js: bộ --red-*
   * đã được khai lại cho chế độ tối. */
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const khoi = css.slice(css.indexOf('.hm {'));
  ok('CSS cửa sổ đỏ chỉ dùng biến màu, không ghi mã màu cứng',
    khoi.length > 0 && !/#[0-9a-f]{3,6}/i.test(khoi.slice(0, khoi.indexOf('.tag-do'))),
    'có mã màu cứng trong khối .hm — chế độ tối sẽ thành chữ đỏ trên nền đỏ');
}

console.log('\n' + '─'.repeat(56));
console.log('  ' + pass + ' pass · ' + fail + ' fail');
if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
console.log('─'.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
