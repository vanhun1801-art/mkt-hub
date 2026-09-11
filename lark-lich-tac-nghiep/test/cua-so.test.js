'use strict';
/**
 * ============================================================================
 * CỬA SỔ ĐĂNG KÝ — nút đăng ký chỉ mở trong một khung giờ mỗi tuần
 * ============================================================================
 * Chỗ kẹt anh Hùng nêu: nút đăng ký mở liên tục, nhân sự thêm lịch bất kỳ lúc
 * nào, nên anh phải xử lý lịch rải rác cả tuần. Nếp anh làm bằng tay là nhắn
 * cho cả phòng: mở 15:00 T6, đóng 12:00 T7.
 *
 * Ba loại lỗi bài này canh, cả ba đều im lặng:
 *
 *   lệch một ngày   — "Thứ 6" là ISO 5, không phải 6. Bản đầu tôi gõ 6 và cả
 *                     cơ chế chạy T7→CN, mà màn hình vẫn hiện một câu đọc thấy
 *                     hợp lý. Đây là lỗi ĐÃ XẢY RA trong lúc dựng.
 *   cửa sổ vắt tuần — "mở T7 15:00, đóng T2 12:00" là hợp lệ; so kiểu
 *                     `mo <= nay < dong` thì cả tuần không mở nổi một lần.
 *   lệch múi giờ    — Render chạy UTC. App này đã có một lỗi đúng kiểu đó,
 *                     16 lịch rơi sai cột ngày.
 *
 * Chạy: node test/cua-so.test.js   (không cần server, không cần Base)
 */
const fs = require('fs');
const path = require('path');
const cs = require('../cua-so-dang-ky');

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

/** Mốc giờ VN. 11/09/2026 là thứ Sáu — mọi phép thử dưới neo vào tuần đó. */
const N = (s) => Date.parse(s + '+07:00');
const mo = (luat, luc) => cs.trangThai(luat, luc).mo;

group('1. Tên thứ và số ISO — đúng chỗ đã sai một lần');
{
  /* Tiếng Việt lệch một so với số ISO: "Thứ 6" là 5. Neo bằng phép thử vì bản
   * đầu tôi gõ moThu = 6 với ý "thứ 6" và cả cơ chế lệch một ngày. */
  ok('THU_SO["Thứ 6"] = 5, không phải 6', cs.THU_SO['Thứ 6'] === 5, String(cs.THU_SO['Thứ 6']));
  ok('THU_SO["Thứ 7"] = 6', cs.THU_SO['Thứ 7'] === 6);
  ok('THU_SO["Chủ nhật"] = 7', cs.THU_SO['Chủ nhật'] === 7);
  ok('THU_SO["Thứ 2"] = 1 (đầu tuần)', cs.THU_SO['Thứ 2'] === 1);
  ok('tra ngược lại cũng khớp',
    cs.THU[cs.THU_SO['Thứ 6']] === 'Thứ 6' && cs.THU[cs.THU_SO['Chủ nhật']] === 'Chủ nhật');

  /* Và luật mặc định phải ĐÚNG nếp anh Hùng đang nhắn tay. Câu thử này là câu
   * đã bắt được lỗi lệch ngày. */
  const L = cs.chuanLuat(cs.MAC_DINH);
  ok('mặc định là Thứ 6 15:00 → Thứ 7 12:00',
    cs.THU[L.moThu] === 'Thứ 6' && cs.veGio(L.moPhut) === '15:00' &&
    cs.THU[L.dongThu] === 'Thứ 7' && cs.veGio(L.dongPhut) === '12:00',
    cs.THU[L.moThu] + ' ' + cs.veGio(L.moPhut) + ' → ' + cs.THU[L.dongThu] + ' ' + cs.veGio(L.dongPhut));
}

group('2. Cửa sổ thường: mở 15:00 T6, đóng 12:00 T7');
{
  const L = {};   // để trống = lấy mặc định
  ok('T6 14:59 — chưa mở', !mo(L, N('2026-09-11T14:59')));
  ok('T6 15:00 — mở đúng phút đó', mo(L, N('2026-09-11T15:00')));
  ok('T6 23:59 — vẫn mở qua nửa đêm', mo(L, N('2026-09-11T23:59')));
  ok('T7 00:01 — vẫn mở', mo(L, N('2026-09-12T00:01')));
  ok('T7 11:59 — vẫn mở', mo(L, N('2026-09-12T11:59')));
  ok('T7 12:00 — đóng đúng phút đó', !mo(L, N('2026-09-12T12:00')));
  ok('giữa tuần (T2, T4) — đóng',
    !mo(L, N('2026-09-14T09:00')) && !mo(L, N('2026-09-16T20:00')));

  /* Mốc kế tiếp phải nói ra được, không thì nút khoá mà người ta bấm lại mỗi
   * tiếng vì không biết chờ tới lúc nào. */
  const dong = cs.trangThai(L, N('2026-09-14T09:00'));
  ok('đang đóng thì nói mốc MỞ kế tiếp là T6 tuần này',
    cs.noiMoc(dong.moLuc) === 'Thứ 6 15:00 ngày 18/09', cs.noiMoc(dong.moLuc));
  const dangMo = cs.trangThai(L, N('2026-09-11T16:00'));
  ok('đang mở thì nói mốc ĐÓNG', cs.noiMoc(dangMo.dongLuc) === 'Thứ 7 12:00 ngày 12/09',
    cs.noiMoc(dangMo.dongLuc));
  ok('vừa qua mốc đóng thì mốc mở kế tiếp là TUẦN SAU',
    cs.noiMoc(cs.trangThai(L, N('2026-09-12T12:01')).moLuc) === 'Thứ 6 15:00 ngày 18/09',
    cs.noiMoc(cs.trangThai(L, N('2026-09-12T12:01')).moLuc));
}

group('3. Cửa sổ VẮT QUA tuần: mở T7 15:00, đóng T2 12:00');
{
  /* Dạng này là chỗ so sánh thẳng `mo <= nay && nay < dong` sẽ luôn ra ĐÓNG —
   * cả tuần không mở nổi một lần, mà màn hình không báo gì. */
  const V = { moThu: cs.THU_SO['Thứ 7'], moGio: '15:00',
    dongThu: cs.THU_SO['Thứ 2'], dongGio: '12:00' };
  ok('T7 14:59 — chưa mở', !mo(V, N('2026-09-12T14:59')));
  ok('T7 15:30 — mở', mo(V, N('2026-09-12T15:30')));
  ok('Chủ nhật 20:00 — vẫn mở (qua ngày)', mo(V, N('2026-09-13T20:00')));
  ok('T2 11:59 — vẫn mở (qua mốc đầu tuần)', mo(V, N('2026-09-14T11:59')));
  ok('T2 12:01 — đóng', !mo(V, N('2026-09-14T12:01')));
  ok('T4 — đóng', !mo(V, N('2026-09-16T10:00')));
  ok('đang mở ở Chủ nhật thì mốc đóng là T2 tới',
    cs.noiMoc(cs.trangThai(V, N('2026-09-13T20:00')).dongLuc) === 'Thứ 2 12:00 ngày 14/09',
    cs.noiMoc(cs.trangThai(V, N('2026-09-13T20:00')).dongLuc));
}

group('4. Giờ Việt Nam, không phải giờ máy chủ');
{
  /* Render chạy UTC. 08:30 UTC là 15:30 VN — trong khung. Nếu tính theo UTC thì
   * 08:30 sáng T6 nằm ngoài khung và cả phòng không đăng ký được. */
  ok('08:30 UTC thứ Sáu = 15:30 VN → MỞ',
    mo({}, Date.parse('2026-09-11T08:30:00Z')));
  ok('07:59 UTC thứ Sáu = 14:59 VN → đóng',
    !mo({}, Date.parse('2026-09-11T07:59:00Z')));
  /* Và mốc 00:30 VN thứ Bảy = 17:30 UTC thứ Sáu: lấy "thứ" theo UTC là ra thứ
   * Sáu, sai ngày. */
  ok('00:30 VN thứ Bảy (17:30 UTC thứ Sáu) → vẫn MỞ',
    mo({}, N('2026-09-12T00:30')));
}

group('5. Đọc giờ: nhận nhiều cách gõ, từ chối cái vô nghĩa');
{
  ok('"15:00" → 900', cs.docGio('15:00') === 900);
  ok('"15h" → 900', cs.docGio('15h') === 900);
  ok('"9:05" → 545', cs.docGio('9:05') === 545);
  ok('" 15 : 30 " → 930 (bỏ khoảng trắng)', cs.docGio(' 15 : 30 ') === 930);
  /* Từ chối chứ không im lặng lấy 0: "25:00" thành 00:00 thì khung giờ khác
   * hẳn cái vừa gõ, và không ai soát lại. */
  ok('"25:00" bị từ chối', cs.docGio('25:00') === null);
  ok('"15:70" bị từ chối', cs.docGio('15:70') === null);
  ok('"" và chữ bị từ chối', cs.docGio('') === null && cs.docGio('trưa') === null);
  /* Gõ sai thì luật rơi về mặc định, KHÔNG rơi về 00:00 — 00:00 nghĩa là cửa
   * sổ dịch hẳn sang nửa đêm mà không ai biết. */
  const L = cs.chuanLuat({ moGio: 'trưa', dongGio: '99:99' });
  ok('giờ sai → lấy mặc định, không lấy 00:00',
    cs.veGio(L.moPhut) === '15:00' && cs.veGio(L.dongPhut) === '12:00',
    cs.veGio(L.moPhut) + ' / ' + cs.veGio(L.dongPhut));
}

group('6. Tắt cơ chế, và hai ngoại lệ tay');
{
  const giuaTuan = N('2026-09-16T10:00');
  ok('tắt cơ chế → mở liên tục', mo({ bat: false }, giuaTuan));

  /* Mở tay: dùng cho tuần có việc gấp. Phải THẮNG khung giờ, không thì bấm mở
   * xong vẫn bị đóng và không ai hiểu vì sao. */
  ok('mở tay tới mốc sau → mở dù giữa tuần',
    mo({ moTayToi: giuaTuan + 3600000 }, giuaTuan));
  ok('mở tay đã qua mốc → hết hiệu lực, về khung giờ',
    !mo({ moTayToi: giuaTuan - 1000 }, giuaTuan));

  /* Đóng tay: dùng khi quản lý chưa xếp xong. Phải thắng CẢ khung giờ đang mở. */
  const trongKhung = N('2026-09-11T16:00');
  ok('đóng tay thắng khung giờ đang mở',
    !mo({ dongTayToi: trongKhung + 3600000 }, trongKhung));
  ok('đóng tay hết hạn → về khung giờ (đang mở)',
    mo({ dongTayToi: trongKhung - 1000 }, trongKhung));
  /* Đóng tay đứng TRƯỚC mở tay: hai nút cùng bật thì đóng thắng — an toàn hơn,
   * và quản lý bấm đóng là có ý dừng hẳn. */
  ok('cả hai nút cùng bật thì ĐÓNG thắng',
    !mo({ moTayToi: trongKhung + 7200000, dongTayToi: trongKhung + 3600000 }, trongKhung));
}

group('7. Máy chủ phải CHỐT, không chỉ khoá nút');
{
  const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  ok('có đọc luật từ Base', /async function docLuatCuaSo\(/.test(sv));
  ok('đọc bảng lỗi thì KHÔNG áp cửa sổ (nghiêng về phía mở)',
    /chuaKhai: true/.test(sv) && /nút mở liên tục/.test(sv),
    '(đọc lỗi mà đóng nút thì cả phòng không đăng ký được và không ai biết vì sao)');

  /* Hai cửa: tạo mới đi thẳng vào hàng đợi, và gửi duyệt một bản nháp. Thiếu
   * cửa thứ hai thì soạn nháp cả tuần rồi bấm Gửi duyệt lúc nào cũng được. */
  ok('chặn khi TẠO MỚI vào hàng đợi duyệt',
    /const dinhGui = !body\.status \|\| body\.status === 'Chờ duyệt\/Xử lý'/.test(sv));
  ok('chặn khi GỬI DUYỆT một bản nháp',
    /body\.status === 'Chờ duyệt\/Xử lý' && item\.status !== 'Chờ duyệt\/Xử lý'/.test(sv));
  ok('mã lỗi riêng để giao diện nói đúng câu', /DANG_KY_DONG/.test(sv));
  /* Câu lỗi phải NÓI RA mốc mở lại. "Ngoài khung giờ" thì người ta bấm lại mỗi
   * tiếng; "mở lại Thứ 6 15:00 ngày 18/09" thì họ biết chờ. */
  ok('câu lỗi nói rõ mốc mở lại', /cuaSo\.noiMoc\(cs\.moLuc\)/.test(sv));
  /* Nháp KHÔNG bị chặn — cố ý. Soạn trước rồi tới khung giờ bấm Gửi duyệt là
   * nếp tốt hơn, mà hàng đợi của quản lý vẫn chỉ đầy lên trong khung. */
  ok('nháp vẫn tạo được ngoài khung giờ', /NHÁP thì cho tạo bất cứ/.test(sv));
  /* Quản lý không bị chặn: họ là người xếp việc. */
  ok('quản lý không bị chặn', /Quản lý không bị chặn/.test(sv));

  ok('sửa luật chỉ quản lý',
    /'\/api\/cua-so'[\s\S]{0,900}PATCH[\s\S]{0,120}requireManager/.test(sv));
  /* Giờ sai định dạng thì từ chối, không im lặng lấy mặc định. */
  ok('lưu giờ sai định dạng thì từ chối', /BAD_TIME/.test(sv));
}

group('8. Giao diện: khoá nút, và nói bao giờ mở lại');
{
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  /* KHOÁ chứ không ẩn: nút biến mất thì người ta tưởng app lỗi hoặc tưởng mất
   * quyền; nút khoá kèm chữ thì họ biết chờ tới lúc nào. */
  ok('nút đăng ký bị KHOÁ, không bị ẩn',
    /nutMoi\.disabled = khoaDK/.test(app) && /Đăng ký đang đóng/.test(app));
  ok('quản lý không bao giờ bị khoá', /const khoaDK = !MGR\(\) && !cs\.mo/.test(app));
  ok('tooltip nói mốc mở lại', /Mở lại ' \+ mocCuaSo\(cs\.moLuc\)/.test(app));
  /* Một câu ở chỗ dễ thấy, không chỉ tooltip: mở app ra thấy nút xám thì phải
   * biết NGAY là do khung giờ. */
  ok('có băng nhắc ở đầu màn "Lịch của tôi"',
    /function bangCuaSo\(/.test(app) && /h \+= bangCuaSo\(\);/.test(app));
  ok('băng nhắc chỉ cho nhân sự, không hiện cho quản lý',
    /if \(!cs \|\| MGR\(\) \|\| PREVIEW\(\)\) return '';/.test(app));
  ok('băng nhắc nói nháp vẫn soạn được', /bấm Gửi duyệt/.test(app));

  ok('có màn chỉnh khung giờ cho quản lý', /function moManCuaSo\(/.test(app));
  ok('màn đó nói TRẠNG THÁI hiện tại trước khi nói luật',
    /Đang MỞ/.test(app) && /Đang ĐÓNG/.test(app));
  /* Ô ngày của hai ngoại lệ dùng chung bộ chọn lịch của app — phải có nhánh
   * riêng trong datNgay, không thì mốc chọn trên lịch rơi vào hư không. */
  /* Anh Hùng thử rồi nói "chỗ đóng mở này hơi khó hiểu", và ảnh anh chụp có CẢ
   * HAI ô ngày cùng điền — một trạng thái vô nghĩa mà màn hình không nói cái
   * nào thắng. Bốn thứ làm nó khó hiểu, và cả bốn là lỗi thiết kế:
   *   hai ô cho một câu hỏi · luật "đóng thắng mở" chỉ nằm trong code ·
   *   chữ "tới" bắt tự cộng giờ · bộ chọn lịch cho một việc 30 giây.
   * Giờ là MỘT hàng ba nút loại nhau + chọn thời lượng. */
  ok('không còn hai ô ngày cho ngoại lệ tay',
    !/oNgay\('cs'/.test(app) && !/CS_NGAY/.test(app),
    '(hai ô độc lập cho phép tạo trạng thái vô nghĩa: điền cả hai)');
  ok('thay bằng ba nút loại nhau: theo khung giờ / mở tay / đóng tay',
    /\['theo', 'mo', 'dong'\]/.test(app) && /data-tay="/.test(app));
  ok('chọn thời lượng chứ không bắt gõ mốc',
    /const CS_LAU = \[/.test(app) && /trong 1 giờ/.test(app) && /tới hết tuần này/.test(app));
  ok('viết ra KẾT QUẢ bằng câu tiếng Việt trước khi Lưu',
    /→ Mở tới /.test(app) && /sau đó tự theo khung giờ/.test(app));
  /* Ba trạng thái loại nhau thì Lưu phải ghi CẢ HAI cột — chọn "mở tay" mà
   * không xoá "đóng tay" cũ thì cái cũ thắng, đúng cái vừa gây khó hiểu. */
  ok('chọn một trạng thái thì xoá hẳn trạng thái kia',
    /moTayToi: tayChon === 'mo' \?/.test(app) && /: 0,/.test(app) &&
    /dongTayToi: tayChon === 'dong' \?/.test(app));
  /* Nút nào đang bật phải suy ra từ dữ liệu theo ĐÚNG luật máy chủ (đóng thắng
   * mở), không thì mở màn ra thấy nút này mà thực tế đang chạy nút kia. */
  ok('nút đang bật suy theo đúng luật "đóng thắng mở"',
    /function tayHienTai\(L\)[\s\S]{0,240}dongTayToi[\s\S]{0,80}return 'dong'/.test(app));

  /* Giao diện phải đọc trạng thái từ máy chủ, không tự tính lại — tự tính là
   * hai bên lệch nhau và nút mở mà bấm vào bị chặn. */
  /* App này KHÔNG có `$$` — chỉ hub có. Gõ `$$` theo quán tính từ hub là handler
   * ném ReferenceError, nút không đổi được, mà trên màn hình chỉ là "bấm không
   * ăn": không lỗi đỏ, không toast, phải mở console mới thấy. Đã gặp đúng thế
   * ở chính ba nút này. Canh cả tệp, không chỉ đoạn của cửa sổ đăng ký. */
  ok('public/app.js không dùng `$$` (hàm đó không tồn tại ở app này)',
    !/\$\$\(/.test(app), 'có chỗ dùng $$ — handler đó sẽ ném ReferenceError khi bấm');

  /* Trang nhân sự phải TỰ đổi khi quản lý mở/đóng. Anh Hùng mở tay bên quản lý,
   * sang bản nhân sự vẫn thấy "đang đóng" — vì nhịp tự nạp có sẵn là
   * refresh(false) (máy chủ trả bản trong bộ đệm, trễ tới ~2 phút) và nó bị bỏ
   * qua khi đang mở cửa sổ hay đang chọn một lịch. Với cổng mở đúng 15:00 thứ 6
   * thì thế là hỏng. */
  ok('có nhịp riêng hỏi trạng thái cửa sổ', /async function napCuaSo\(/.test(app));
  ok('nhịp đó chạy 30 giây một lần', /setInterval\(napCuaSo, 30000\)/.test(app));
  ok('và chạy lại khi quay về tab',
    /visibilitychange[\s\S]{0,80}napCuaSo\(\)/.test(app));
  /* Chỉ vẽ lại khi trạng thái LẬT — không thì cứ 30 giây dựng lại cả màn hình,
   * mất cả thứ người ta đang gõ dở. */
  ok('chỉ vẽ lại khi trạng thái đổi',
    /if \(cu\.mo === d\.mo && cu\.vi === d\.vi/.test(app));

  /* Và đệm phía máy chủ phải NGẮN: luật này lật đúng vào một phút cụ thể. */
  const sv2 = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok('đệm luật ở máy chủ ngắn (15 giây), không phải 60',
    /const DEM_CUA_SO_MS = 15000;/.test(sv2));

  ok('giao diện lấy trạng thái từ /api/meta', /S\.cuaSo = d\.cuaSo/.test(app));
  const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok('máy chủ có gửi trạng thái đó', /cuaSo: await trangThaiCuaSo\(/.test(sv));
}

console.log('\n' + '─'.repeat(56));
console.log('  ' + pass + ' pass · ' + fail + ' fail');
if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
console.log('─'.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
