'use strict';
/**
 * ============================================================================
 * NGÀY ĐI TÁC NGHIỆP CÓ BÁO CÁO = NGÀY ĐÃ CÓ BÁO CÁO
 * ============================================================================
 * Anh Hùng (03/10/2026): "sau mỗi buổi đi, nhân sự điền báo cáo tác nghiệp. Đi
 * xong mà thấy không khoẻ thì chỉ cần báo cáo tác nghiệp là đủ, không cần báo
 * cáo ngày — đừng ghi nhận là không có báo cáo."
 *
 * Bài này canh ba thứ dễ sai:
 *   1. GHÉP NGƯỜI BẰNG TÊN. Ô người bên Lịch tác nghiệp mang open_id do app
 *      tạo dòng cấp, dòng cũ mang id của app cũ — so id là trượt sạch. Mà ghép
 *      tên thì phải lo "Nguyễn Long Khánh" ↔ "Nguyễn Long Khánh (Pinky)".
 *   2. BUỔI BỊ HUỶ KHÔNG TÍNH. Không đi thì không có gì để báo.
 *   3. CHƯA BÁO CÁO THÌ VẪN LÀ THIẾU. Có lịch đi mà không nộp gì cả thì ngày
 *      đó vẫn phải hiện đỏ, không thì "đăng ký đi tác nghiệp" thành cách né
 *      báo cáo.
 *
 * Chạy: node test/tac-nghiep.test.js
 */
const path = require('path');
const K = require('../ky');
const TN = require('../tac-nghiep');

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

const N = (y, m, d) => K.tuNgayVN(y, m, d);
/* Mẫu dựng tay theo đúng hình dạng docHet() trả về. */
const MAU = [
  { ngay: N(2026, 9, 28), ten: ['huynh thi anh thu'], trangThai: 'Đã hoàn tất', coBaoCao: true, tieuDe: 'Quay KS' },
  { ngay: N(2026, 9, 29), ten: ['huynh thi anh thu'], trangThai: 'Đã hoàn tất', coBaoCao: false, tieuDe: 'Chưa nộp' },
  { ngay: N(2026, 9, 30), ten: ['huynh thi anh thu'], trangThai: 'Hủy lịch', coBaoCao: true, tieuDe: 'Huỷ' },
  { ngay: N(2026, 10, 1), ten: ['nguyen long khanh'], trangThai: 'Đang báo cáo', coBaoCao: true, tieuDe: 'Live' },
  { ngay: N(2026, 10, 2), ten: ['le trung thanh', 'nguyen hong ngoc'], trangThai: 'Đã hoàn tất', coBaoCao: true, tieuDe: 'Đi hai người' },
];

group('Ngày nào được tính là đã báo cáo');
{
  const ngay = (ten) => TN.ngayDaBaoCao(MAU, { ten }).sort().map(K.veNgay);

  ok('có báo cáo sau chuyến → tính',
    ngay('Huỳnh Thị Anh Thư').includes('28/09/2026'));
  ok('ĐI nhưng CHƯA báo cáo → vẫn thiếu',
    !ngay('Huỳnh Thị Anh Thư').includes('29/09/2026'),
    'không thì đăng ký đi tác nghiệp thành cách né báo cáo ngày');
  ok('buổi bị HUỶ thì không tính dù ô báo cáo có chữ',
    !ngay('Huỳnh Thị Anh Thư').includes('30/09/2026'));

  /* Tên trong hai Base lệch nhau một cái đuôi — đã gặp thật với Khánh. */
  ok('"Nguyễn Long Khánh (Pinky)" khớp dòng ghi "Nguyễn Long Khánh"',
    ngay('Nguyễn Long Khánh (Pinky)').includes('01/10/2026'));
  ok('và ngược lại, tên ngắn khớp dòng ghi tên dài',
    TN.ngayDaBaoCao([{ ngay: N(2026, 10, 1), ten: ['nguyen long khanh (pinky)'],
      trangThai: 'Đã hoàn tất', coBaoCao: true }], { ten: 'Nguyễn Long Khánh' }).length === 1);

  ok('một buổi hai người thì CẢ HAI được tính',
    ngay('Lê Trung Thành').includes('02/10/2026') &&
    ngay('Nguyễn Hồng Ngọc').includes('02/10/2026'));
  ok('người không có buổi nào thì rỗng', ngay('Võ Thị Cẩm Hằng').length === 0);
  ok('không có tên thì không đoán bừa', TN.ngayDaBaoCao(MAU, {}).length === 0,
    'tên rỗng mà khớp được thì ai cũng ăn ké ngày của người khác');
}

group('Nối vào phép đếm ngày thiếu');
{
  /* Cách nối: nhét ngày tác nghiệp vào danh sách "đã nộp" rồi gọi ngayThieu
   * như cũ — không thêm nhánh luật nào trong ky.js. */
  const tu = N(2026, 9, 28), den = N(2026, 10, 2) + 86399000;
  const lich = () => true;                       // cả tuần đều có lịch làm
  const daNop = [N(2026, 9, 29)];                // chỉ nộp báo cáo ngày 29
  const tn = TN.ngayDaBaoCao(MAU, { ten: 'Huỳnh Thị Anh Thư' });

  const khongNoi = K.ngayThieu(tu, den, daNop, K.LUAT, lich).map(K.veNgay);
  const coNoi = K.ngayThieu(tu, den, daNop.concat(tn), K.LUAT, lich).map(K.veNgay);

  ok('chưa nối thì 28/09 bị tính thiếu', khongNoi.includes('28/09/2026'));
  ok('nối rồi thì 28/09 hết thiếu', !coNoi.includes('28/09/2026'));
  ok('những ngày khác không bị nối nhầm',
    coNoi.includes('30/09/2026') && coNoi.includes('01/10/2026') && coNoi.includes('02/10/2026'),
    'đang ra: ' + coNoi.join(', '));
}

group('Bốn chỗ đếm ngày thiếu đều phải nối');
{
  const fs = require('fs');
  const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const cb = fs.readFileSync(path.join(__dirname, '..', 'ai', 'chuan-bi.js'), 'utf8');
  /* Sót một chỗ thì cùng một người, màn này nói thiếu, màn kia nói đủ. */
  const so = (sv.match(/TN\.ngayDaBaoCao\(/g) || []).length;
  ok('server.js nối ở cả bốn chỗ (phiếu của mình, Theo dõi, người chưa nộp gì, Toàn phòng)',
    so === 4, 'đang có ' + so + ' chỗ');
  ok('tệp dữ liệu đưa AI cũng nối', /TN\.ngayDaBaoCao\(dsTN, n\)/.test(cb));
  ok('và nói cho AI biết ngày nào là ngày đi tác nghiệp',
    /ngayDiTacNghiep:/.test(cb),
    'không thì AI vẫn viết "thiếu ngày đó" theo thói quen');
}

console.log('\n' + '─'.repeat(56));
console.log('  ' + pass + ' pass · ' + fail + ' fail');
if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
console.log('─'.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
