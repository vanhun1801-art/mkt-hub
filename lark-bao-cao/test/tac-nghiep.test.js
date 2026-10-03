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
 *   2. CHỈ "ĐÃ HOÀN TẤT" MỚI TÍNH (anh Hùng 03/10). Đây là trạng thái cuối,
 *      chỉ quản lý đặt được. Buổi huỷ, buổi còn "Đang báo cáo", buổi chờ
 *      duyệt — đều không tính, dù ô báo cáo đã có chữ.
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
  { ngay: N(2026, 10, 3), ten: ['nguyen long khanh'], trangThai: 'Đã hoàn tất', coBaoCao: true, tieuDe: 'Xong' },
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

  /* Anh Hùng 03/10: chỉ "Đã hoàn tất" mới tính. Buổi đã điền báo cáo nhưng
   * quản lý chưa chốt thì chưa thay được báo cáo ngày. */
  ok('"Đang báo cáo" dù đã điền báo cáo thì KHÔNG tính',
    !ngay('Nguyễn Long Khánh (Pinky)').includes('01/10/2026'));
  ok('"Đã hoàn tất" thì tính',
    ngay('Nguyễn Long Khánh (Pinky)').includes('03/10/2026'));
  ok('mọi trạng thái giữa chừng đều không tính',
    ['Đang lên kế hoạch', 'Chờ duyệt/Xử lý', 'Duyệt/Chờ tác nghiệp',
      'Từ chối/Cần điều chỉnh', 'Đang báo cáo', ''].every((tt) =>
      TN.ngayDaBaoCao([{ ngay: N(2026, 10, 5), ten: ['le trung thanh'],
        trangThai: tt, coBaoCao: true }], { ten: 'Lê Trung Thành' }).length === 0),
    'danh sách CHO PHÉP, không phải danh sách loại trừ — trạng thái mới thêm vào luồng phải mặc định là không tính');
  ok('hoàn tất mà bỏ trống ô báo cáo cũng không tính',
    TN.ngayDaBaoCao([{ ngay: N(2026, 10, 5), ten: ['le trung thanh'],
      trangThai: 'Đã hoàn tất', coBaoCao: false }], { ten: 'Lê Trung Thành' }).length === 0);

  /* Tên trong hai Base lệch nhau một cái đuôi — đã gặp thật với Khánh. */
  ok('"Nguyễn Long Khánh (Pinky)" khớp dòng ghi "Nguyễn Long Khánh"',
    ngay('Nguyễn Long Khánh (Pinky)').includes('03/10/2026'));
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

group('Tên rút gọn bên Lịch tác nghiệp');
{
  /* Ô người bên đó hiện "Hằng", bên Báo cáo là "Võ Thị Cẩm Hằng" — buổi 02/10
   * đã hoàn tất mà màn hình vẫn đòi báo cáo ngày. Quy về tên đầy đủ lúc đọc. */
  const quyen = [{ ten: 'Võ Thị Cẩm Hằng' }, { ten: 'Lê Trung Thành' }, { ten: 'Nguyễn Hồng Ngọc' }];

  ok('"hằng" -> "võ thị cẩm hằng"', TN.dayDu('hang', quyen) === 'vo thi cam hang');
  ok('tên đã đủ chữ thì để nguyên',
    TN.dayDu('le trung thanh', quyen) === 'le trung thanh');
  ok('không có trong Phân quyền thì để nguyên, không bịa',
    TN.dayDu('tuan', quyen) === 'tuan');

  /* Ghép nhầm = xoá hộ người kia một ngày thiếu, nên thà không ghép. */
  ok('hai người cùng đuôi thì KHÔNG ghép',
    TN.dayDu('hang', quyen.concat({ ten: 'Trần Thu Hằng' })) === 'hang');
  ok('bảng Phân quyền đọc hỏng (rỗng) cũng không làm sai tên',
    TN.dayDu('hang', []) === 'hang');

  /* Bên Báo cáo phiếu của chị cũng lúc ghi "Hằng" lúc ghi đủ họ tên, nên hỏi
   * bằng tên rút gọn cũng phải ra. Dòng giữ cả hai dạng là vì thế. */
  const haiDang = [{ ngay: N(2026, 10, 2), ten: ['hang', 'vo thi cam hang'],
    trangThai: 'Đã hoàn tất', coBaoCao: true }];
  ok('hỏi bằng tên đầy đủ -> ra',
    TN.ngayDaBaoCao(haiDang, { ten: 'Võ Thị Cẩm Hằng' }).length === 1);
  ok('hỏi bằng tên rút gọn -> cũng ra',
    TN.ngayDaBaoCao(haiDang, { ten: 'Hằng' }).length === 1);

  /* Đây là dòng thật của buổi 02/10: chị ở cả ô Nhân sự lẫn ô Phụ trách. */
  const dong = [{ ngay: N(2026, 10, 2), ten: ['le trung thanh', 'vo thi cam hang', 'vo thi cam hang'],
    trangThai: 'Đã hoàn tất', coBaoCao: true, tieuDe: 'Khảo sát tour Jeep Phú Quốc' }];
  ok('sau khi quy tên, buổi 02/10 tính cho chị Hằng',
    TN.ngayDaBaoCao(dong, { ten: 'Võ Thị Cẩm Hằng' }).map(K.veNgay).join() === '02/10/2026');
  ok('và không tính cho người khác',
    TN.ngayDaBaoCao(dong, { ten: 'Nguyễn Hồng Ngọc' }).length === 0);
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
  /* Sót một chỗ thì cùng một người, màn này nói thiếu, màn kia nói đủ. Đếm
   * theo lời gọi ngayThieu() chứ không đếm chữ TN.ngayDaBaoCao trong cả tệp:
   * còn chỗ khác dùng nó mà không phải để đếm ngày thiếu (cửa soi). */
  const so = (sv.match(/K\.ngayThieu\([^;]*?TN\.ngayDaBaoCao\(/g) || []).length;
  ok('server.js nối ở cả bốn chỗ (phiếu của mình, Theo dõi, người chưa nộp gì, Toàn phòng)',
    so === 4, 'đang có ' + so + ' chỗ');

  /* Chỗ thứ NĂM, sót mất một hôm: bảng "Chi tiết kỳ" không lấy số từ server.js
   * mà từ kho.tongHop(). Màn Toàn phòng nói đủ, sổ bên phải vẫn kẻ đỏ. */
  const kh = fs.readFileSync(path.join(__dirname, '..', 'kho.js'), 'utf8');
  ok('kho.tongHop() cũng nối — đây là số mà bảng "Chi tiết kỳ" đọc',
    /K\.ngayThieu\([^;]*?daNop\.concat\(ngayTN\)/.test(kh));
  ok('và trả cả danh sách ngày đi tác nghiệp để màn hình nói ra',
    /ngayTacNghiep:/.test(kh) && /buoiTrongNgay\(/.test(kh));
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
