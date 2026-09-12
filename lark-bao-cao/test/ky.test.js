'use strict';
/**
 * ============================================================================
 * Kỳ báo cáo · hạn nộp · định mức — bài kiểm tra cho phần sai âm thầm
 * ============================================================================
 * Cả file này không gọi mạng, không đụng Base. Nó chỉ trả lời những câu mà sai
 * thì không ai phát hiện ra bằng mắt:
 *
 *   - Tuần của phòng chạy Thứ 7 → Thứ 6 hay lệch một ngày?
 *   - Nộp 23:30 tối thứ 6 là đúng hạn hay trễ?
 *   - Người nộp nửa ca 240 phút thì phần trăm là 100% hay 50%?
 *   - Chưa nộp mà chưa tới hạn thì có bị chấm là thiếu không?
 *
 * Vì sao gắt chuyện ISO: ở app Lịch tác nghiệp từng viết `moThu: 6` với ý
 * "Thứ 6", mà ISO 6 là THỨ BẢY — cả khung giờ chạy lệch một ngày suốt mấy hôm
 * trong khi câu chữ trên màn hình vẫn đọc xuôi tai. Nên ở đây có hẳn một nhóm
 * câu kiểm neo vào ngày THẬT trong lịch 2026, không neo vào con số ISO.
 *
 * Chạy: node test/ky.test.js
 */
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

/* Mốc neo: 12/09/2026 là THỨ BẢY (đã đối chiếu với nhóm Phòng MKT — hôm đó cả
 * nhóm gửi báo cáo buổi trưa vì thứ 7 về sớm). Mọi câu kiểm bên dưới suy ra từ
 * ngày này, nên nếu neo sai thì hỏng cả bộ chứ không hỏng lắt nhắt. */
const T7_1209 = K.tuNgayVN(2026, 9, 12);       // 00:00 VN thứ 7 12/09/2026
const T6_1109 = K.tuNgayVN(2026, 9, 11);       // thứ 6
const CN_1309 = K.tuNgayVN(2026, 9, 13);       // chủ nhật

group('Neo lịch — ngày thật, không phải con số ISO');
{
  ok('12/09/2026 là Thứ 7', K.phanRaVN(T7_1209).thu === 6,
    'ISO 6 = Thứ 7. Nhớ nhầm thành "Thứ 6" là cả bộ luật lệch một ngày');
  ok('11/09/2026 là Thứ 6', K.phanRaVN(T6_1109).thu === 5,
    '"Thứ 6" trong tiếng Việt là ISO 5, không phải 6');
  ok('13/09/2026 là Chủ nhật', K.phanRaVN(CN_1309).thu === 7);
  ok('veNgayThu đọc ra đúng chữ', K.veNgayThu(T7_1209) === 'Thứ 7 12/09/2026',
    'đang ra: ' + K.veNgayThu(T7_1209));
}

group('Giờ VN — máy chủ chạy UTC vẫn phải cắt ngày theo giờ Việt Nam');
{
  /* 17:01 VN ngày 12/09 = 10:01 UTC cùng ngày. Cắt theo giờ máy (UTC) thì vẫn
   * ra 12/09 nên không lộ. Phải thử mốc sau 17:00 VN mới thấy: 23:30 VN ngày
   * 12/09 là 16:30 UTC — vẫn 12/09. Mốc thật sự gãy là 00:30 VN ngày 13/09,
   * lúc đó UTC còn đang 17:30 ngày 12/09. */
  const nuaDem = T7_1209 + 24 * K.GIO + 30 * K.PHUT;   // 00:30 VN ngày 13/09
  ok('00:30 VN ngày 13/09 thuộc về ngày 13, không phải 12',
    K.veNgay(nuaDem) === '13/09/2026',
    'đang ra: ' + K.veNgay(nuaDem) + ' — đây chính là lỗi cắt ngày theo giờ UTC');

  const chieu = T7_1209 + 17 * K.GIO + K.PHUT;          // 17:01 VN
  ok('17:01 VN vẫn là ngày 12/09', K.veNgay(chieu) === '12/09/2026');
  ok('veLuc in cả giờ phút', K.veLuc(chieu) === '12/09/2026 17:01',
    'đang ra: ' + K.veLuc(chieu));

  ok('dauNgay lùi về 00:00 VN', K.veLuc(K.dauNgay(chieu)) === '12/09/2026 00:00');
  ok('cuoiNgay là 23:59 VN', K.veLuc(K.cuoiNgay(chieu)) === '12/09/2026 23:59');
}

group('Kỳ tuần — Thứ 7 tới Thứ 6, đúng thẻ nhắc anh Hùng gửi mỗi tuần');
{
  /* Thẻ trong nhóm: "Mốc thời gian đo lường: Thứ 7 tuần trước đến thứ 6 tuần
   * hiện tại". Nhân sự cũng ghi "báo cáo tuần (05.09 - 11.09)" = T7 → T6. */
  const t = K.kyTuan(T7_1209);
  ok('tuần chứa Thứ 7 12/09 bắt đầu chính hôm đó',
    K.veNgay(t.tu) === '12/09/2026', 'đang ra: ' + K.veNgay(t.tu));
  ok('và kết thúc Thứ 6 18/09', K.veNgay(t.den) === '18/09/2026',
    'đang ra: ' + K.veNgay(t.den));
  ok('nhãn tuần đọc được', t.nhan === '12/09/2026 – 18/09/2026', 'đang ra: ' + t.nhan);

  /* Thứ 6 11/09 phải rơi vào tuần TRƯỚC (05/09 – 11/09) — đúng cái tuần mà Hằng
   * và Hân khai trong nhóm. Đây là câu kiểm bắt lỗi lệch một ngày. */
  const tr = K.kyTuan(T6_1109);
  ok('Thứ 6 11/09 thuộc tuần 05/09 – 11/09',
    K.veNgay(tr.tu) === '05/09/2026' && K.veNgay(tr.den) === '11/09/2026',
    'đang ra: ' + tr.nhan);

  /* Chủ nhật là chỗ tuần vắt qua ranh giới ISO (7 → 1), nơi cách "trừ dần" hay
   * đi sai một nhịp. */
  const cn = K.kyTuan(CN_1309);
  ok('Chủ nhật 13/09 vẫn thuộc tuần bắt đầu 12/09',
    K.veNgay(cn.tu) === '12/09/2026', 'đang ra: ' + cn.nhan);

  ok('mọi ngày trong tuần cho ra cùng một kỳ', (() => {
    const chuan = K.kyTuan(T7_1209).tu;
    for (let i = 0; i < 7; i++) if (K.kyTuan(T7_1209 + i * K.NGAY).tu !== chuan) return false;
    return true;
  })());
  ok('tuần dài đúng 7 ngày', t.den - t.tu === 7 * K.NGAY - 1);
}

group('Kỳ tháng');
{
  const th = K.kyThang(T7_1209);
  ok('tháng 9 bắt đầu 01/09', K.veNgay(th.tu) === '01/09/2026');
  ok('và kết thúc 30/09', K.veNgay(th.den) === '30/09/2026', 'đang ra: ' + K.veNgay(th.den));
  ok('nhãn tháng', th.nhan === 'Tháng 09/2026', 'đang ra: ' + th.nhan);

  /* Tháng 12 vắt sang năm sau — chỗ duy nhất phải cộng năm. */
  const t12 = K.kyThang(K.tuNgayVN(2026, 12, 20));
  ok('tháng 12 kết thúc 31/12, không tràn sang 2027',
    K.veNgay(t12.den) === '31/12/2026', 'đang ra: ' + K.veNgay(t12.den));

  /* Tháng 2 năm nhuận: 2028 nhuận, 2026 không. */
  ok('tháng 2/2026 có 28 ngày',
    K.veNgay(K.kyThang(K.tuNgayVN(2026, 2, 10)).den) === '28/02/2026');
  ok('tháng 2/2028 có 29 ngày',
    K.veNgay(K.kyThang(K.tuNgayVN(2028, 2, 10)).den) === '29/02/2028');
}

group('Hạn nộp — theo đúng quy định anh Hùng đặt ra');
{
  /* "nhân sự sẽ gửi báo cáo vào cuối ngày" */
  const kn = K.kyNgay(T7_1209);
  ok('hạn báo cáo ngày là hết ngày đó',
    K.veLuc(K.hanNop(kn)) === '12/09/2026 23:59', 'đang ra: ' + K.veLuc(K.hanNop(kn)));

  /* "nếu báo cáo tuần thì gửi ngày cuối cùng" */
  const kt = K.kyTuan(T6_1109);
  ok('hạn báo cáo tuần là hết Thứ 6 cuối kỳ',
    K.veLuc(K.hanNop(kt)) === '11/09/2026 23:59', 'đang ra: ' + K.veLuc(K.hanNop(kt)));

  /* "báo cáo tháng thì gửi chậm nhất ngày đầu tiên của tháng tiếp theo" */
  const kth = K.kyThang(T7_1209);
  ok('hạn báo cáo tháng 9 là hết ngày 01/10',
    K.veLuc(K.hanNop(kth)) === '01/10/2026 23:59', 'đang ra: ' + K.veLuc(K.hanNop(kth)));
  ok('hạn tháng nằm SAU khi kỳ đóng', K.hanNop(kth) > kth.den,
    'đưa hạn vào trong kỳ là bắt nộp báo cáo cho ngày chưa xảy ra');
  ok('hạn tháng 12 rơi sang 01/01 năm sau',
    K.veLuc(K.hanNop(K.kyThang(K.tuNgayVN(2026, 12, 5)))) === '01/01/2027 23:59');
}

group('Chấm hạn — bốn trạng thái, không được gộp');
{
  const kn = K.kyNgay(T7_1209);
  const han = K.hanNop(kn);

  ok('nộp 17:01 chiều là đúng hạn',
    K.chamHan(kn, T7_1209 + 17 * K.GIO + K.PHUT).trangThai === 'dung-han');
  ok('nộp 23:59 vẫn kịp', K.chamHan(kn, han).trangThai === 'dung-han',
    'đúng mốc hạn phải tính là kịp, không phải trễ');
  ok('nộp 00:01 hôm sau là trễ',
    K.chamHan(kn, han + 2 * K.PHUT).trangThai === 'tre');

  /* Chỗ dễ gộp nhất, và gộp là báo đỏ oan cho người còn cả buổi chiều. */
  const giuaNgay = T7_1209 + 10 * K.GIO;
  ok('chưa nộp nhưng chưa tới hạn ≠ thiếu',
    K.chamHan(kn, null, giuaNgay).trangThai === 'chua-toi-han',
    'gộp vào "thiếu" là chấm sai người đang còn hạn');
  ok('chưa nộp và đã quá hạn thì mới là thiếu',
    K.chamHan(kn, null, han + K.GIO).trangThai === 'thieu');

  const tre = K.chamHan(kn, han + 2 * K.NGAY + 3 * K.GIO);
  ok('đo được trễ bao lâu', tre.treMs > 2 * K.NGAY);
  ok('nói bằng tiếng người', K.veTre(tre.treMs) === 'trễ 2 ngày 3 giờ',
    'đang ra: ' + K.veTre(tre.treMs));
  ok('trễ vài phút thì nói phút', K.veTre(45 * K.PHUT) === 'trễ 45 phút');
  ok('trễ vài giây không nói "trễ 0"', K.veTre(3000) === 'trễ dưới một phút');
}

group('Định mức ca — 480 hoặc 240, và cho phép tự khai');
{
  ok('ca cả ngày = 480 phút', K.dinhMuc('ngay') === 480);
  ok('nửa ngày = 240 phút', K.dinhMuc('nua') === 240);
  ok('ca khác lấy số tự khai', K.dinhMuc('khac', 300) === 300);
  ok('ca khác mà bỏ trống thì là 0 (chưa đo được)', K.dinhMuc('khac') === 0);
  ok('ca lạ thì lùi về mặc định cả ngày', K.dinhMuc('linh tinh') === 480);
  ok('số âm không thành định mức', K.dinhMuc('khac', -100) === 0);
}

group('Cộng dòng việc — phần trăm phải tính trên ĐỊNH MỨC');
{
  /* Lấy thẳng phiếu thật của Thư ngày 12/09 trong nhóm: 8 đầu việc, tổng 480. */
  const thu = [
    { nhom: 'Page', phut: 15 }, { nhom: 'Page', phut: 60 },
    { nhom: 'TikTok', phut: 15 }, { nhom: 'TikTok', phut: 15 },
    { nhom: 'Edit', phut: 200 }, { nhom: 'Kịch bản', phut: 30 },
    { nhom: 'Khác', phut: 30 }, { nhom: 'Báo cáo', phut: 115 },
  ];
  const g = K.gop(thu, K.dinhMuc('ngay'));
  ok('tổng đúng 480 phút', g.tongPhut === 480, 'đang ra: ' + g.tongPhut);
  ok('đủ ca thì 100%', g.phanTram === 100);
  ok('đếm đúng 8 đầu việc', g.soViec === 8);
  ok('gom nhóm và xếp theo phút giảm dần',
    g.theoNhom[0].ten === 'Edit' && g.theoNhom[0].phut === 200);
  ok('nhóm Page cộng dồn hai dòng', g.theoNhom.find((x) => x.ten === 'Page').phut === 75);

  /* Phiếu thật của Trường cùng ngày: tổng 240. Trong ảnh anh ấy ghi 100% vì
   * chia cho chính tổng của mình. Chia cho định mức ca cả ngày thì ra 50% —
   * và đó mới là con số nói lên điều gì đó. */
  const truong = [{ nhom: 'Edit', phut: 180 }, { nhom: 'Thiết kế', phut: 60 }];
  ok('240 phút trên ca cả ngày là 50%, không phải 100%',
    K.gop(truong, K.dinhMuc('ngay')).phanTram === 50,
    'chia cho chính tổng của mình thì ai cũng ra 100% — con số đó vô nghĩa');
  ok('cùng số phút đó mà khai nửa ca thì là 100%',
    K.gop(truong, K.dinhMuc('nua')).phanTram === 100);
  ok('còn thiếu bao nhiêu phút cũng nói ra',
    K.gop(truong, K.dinhMuc('ngay')).thieuPhut === 240);

  ok('không có định mức thì phần trăm là null, không phải 0',
    K.gop(truong, 0).phanTram === null,
    '"chưa đo được" khác "làm được 0%"');
  ok('phiếu rỗng vẫn cộng được', K.gop([], 480).tongPhut === 0);
  ok('phút rác không làm hỏng tổng',
    K.gop([{ phut: 'abc' }, { phut: null }, { phut: 60 }], 480).tongPhut === 60);
  ok('phút âm bị chặn về 0', K.gop([{ phut: -50 }, { phut: 60 }], 480).tongPhut === 60);
  ok('dòng không khai nhóm thì vào "Khác"',
    K.gop([{ phut: 10 }], 480).theoNhom[0].ten === 'Khác');
}

group('vePhut — đọc bằng giờ, vì không ai nghĩ bằng phút');
{
  ok('480 → 8 giờ', K.vePhut(480) === '8 giờ');
  ok('450 → 7 giờ 30', K.vePhut(450) === '7 giờ 30');
  ok('45 → 45 phút', K.vePhut(45) === '45 phút');
  ok('0 → 0 phút', K.vePhut(0) === '0 phút');
}

group('Ai chưa nộp — câu anh Hùng hỏi mỗi chiều');
{
  /* Tuần 05/09 – 11/09 có 6 ngày công: 05 (Thứ 7), 07, 08, 09, 10, 11 — Chủ
   * nhật 06 không tính. Người này nộp 05, 07, 08, 09, 11 nên chỉ thiếu 10. */
  const tu = K.tuNgayVN(2026, 9, 5);   // Thứ 7
  const den = K.cuoiNgay(K.tuNgayVN(2026, 9, 11));
  const daNop = [5, 7, 8, 9, 11].map((d) => K.tuNgayVN(2026, 9, d) + 17 * K.GIO);
  const thieu = K.ngayThieu(tu, den, daNop);

  ok('chỉ ra đúng ngày 10/09 còn thiếu',
    thieu.length === 1 && K.veNgay(thieu[0]) === '10/09/2026',
    'đang ra: ' + thieu.map(K.veNgay).join(', '));

  /* Chủ nhật 06/09 nằm trong khoảng nhưng không phải ngày công — không được
   * tính là thiếu. Trong nhóm có người báo "tăng ca ngày 06.09", tức là nộp
   * được, chỉ là không bắt buộc. */
  ok('Chủ nhật không bị tính là thiếu',
    !thieu.some((d) => K.phanRaVN(d).thu === 7),
    'Chủ nhật là ngày nghỉ — báo đỏ vào đó là chấm sai cả phòng mỗi tuần');

  ok('nộp lúc nào trong ngày cũng tính là có nộp ngày đó',
    K.ngayThieu(K.tuNgayVN(2026, 9, 7), K.cuoiNgay(K.tuNgayVN(2026, 9, 7)),
      [K.tuNgayVN(2026, 9, 7) + 23 * K.GIO + 59 * K.PHUT]).length === 0);

  ok('không nộp gì thì thiếu đủ 6 ngày công',
    K.ngayThieu(tu, den, []).length === 6,
    'tuần có 7 ngày, trừ Chủ nhật còn 6');
}

console.log('\n' + '─'.repeat(56));
console.log('  ' + pass + ' pass · ' + fail + ' fail');
if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
console.log('─'.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
