'use strict';
/**
 * ============================================================================
 * Ô bên trái bảng tin: chiếu video hay hiện chữ
 * ============================================================================
 * Anh Hùng 08/10/2026: "ngoài hiển thị hình video ra, đôi khi anh muốn hiển thị
 * nội dung text cho nó nhẹ, như chào buổi sáng, chào buổi chiều gì đó". Anh
 * chốt làm CẢ HAI đường, không bắt chọn một:
 *
 *   để trống ô nội dung  -> app tự chào theo buổi, kèm tên người đang xem
 *   gõ nội dung riêng    -> hiện đúng chữ đã gõ
 *
 * Bài này canh ba thứ dễ hỏng lặng:
 *
 *   1. CHUẨN HOÁ dữ liệu đọc từ Base. Cấu hình cất bằng tệp JSON đính kèm, mà
 *      tệp thì có thể do bản cũ ghi, thiếu trường, hoặc sai kiểu. Không chuẩn
 *      hoá thì `chu` là một con số và trang ném lỗi giữa lúc vẽ.
 *   2. MẶC ĐỊNH phải là 'phim'. Base chưa có gì, hoặc Base đang lỗi, mà rơi
 *      sang 'chu' thì video của cả phòng tự dưng biến mất.
 *   3. Lưu KHÔNG được ghi đè lung tung: ghi lên Base mất ~4,6 giây, bấm nhanh
 *      bốn lần là bốn lượt ghi giành nhau và giá trị cuối cùng sai hẳn so với
 *      nút vừa bấm. Đã đo đúng cảnh đó.
 *
 * Chạy: node test/loi-chao.test.js
 */
const fs = require('fs');
const path = require('path');
const K = require('../phim-kho');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; fails.push(ten); console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

group('chuẩn hoá cấu hình đọc từ Base');
{
  const c = K.chuanChao;
  ok('mặc định là chiếu video', c({}).kieu === 'phim' && K.CHAO_MAC_DINH.kieu === 'phim');
  ok('null / undefined không làm ném', c(null).kieu === 'phim' && c(undefined).kieu === 'phim');
  ok('kiểu lạ rơi về phim', c({ kieu: 'anh' }).kieu === 'phim' && c({ kieu: 123 }).kieu === 'phim');
  ok('chỉ nhận đúng chữ "chu"', c({ kieu: 'chu' }).kieu === 'chu');

  /* `tuChao` mặc định BẬT: người mới bật "hiện chữ" mà chưa gõ gì phải thấy
   * lời chào, chứ không phải một ô trống. */
  ok('tự chào mặc định bật', c({}).tuChao === true && c({ kieu: 'chu' }).tuChao === true);
  ok('tắt được tự chào', c({ tuChao: false }).tuChao === false);
  ok('chỉ đúng `false` mới tắt, không phải mọi giá trị giả',
    c({ tuChao: 0 }).tuChao === true && c({ tuChao: '' }).tuChao === true);

  ok('chu luôn là chuỗi', typeof c({ chu: 123 }).chu === 'string' && c({ chu: 123 }).chu === '123');
  ok('chu null thành rỗng, không thành "null"', c({ chu: null }).chu === '');
  /* Cắt ở 500: ô này là một lời chào, không phải chỗ dán cả thông báo. Dài quá
   * thì nó tràn khỏi khung và đẩy cột tin bên cạnh méo đi. */
  ok('cắt ở 500 ký tự', c({ chu: 'a'.repeat(900) }).chu.length === 500);
  ok('giữ nguyên dấu tiếng Việt', c({ chu: 'Chào buổi sáng cả phòng' }).chu === 'Chào buổi sáng cả phòng');

  /* Chuẩn hoá phải trả về ĐÚNG ba trường, không mang theo rác người ta gửi
   * lên — đây là thứ sẽ được ghi thẳng xuống Base. */
  ok('không mang theo trường lạ',
    JSON.stringify(Object.keys(c({ kieu: 'chu', xau: 1, hack: '<script>' })).sort())
      === JSON.stringify(['chu', 'kieu', 'tuChao']));
}

group('kho trên Base');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'phim-kho.js'), 'utf8');
  ok('có khoá riêng cho lời chào', /KHOA_CHAO\s*=\s*'chao'/.test(src));
  ok('docKho nhận khoá chao', /o !== KHOA_LOGO && o !== KHOA_CHAO/.test(src));
  /* Ô đính kèm của Lark CỘNG DỒN chứ không thay thế — không gỡ tệp cũ thì mỗi
   * lần sửa một chữ là Base thêm một tệp nữa nằm chồng lên. */
  const ghi = src.slice(src.indexOf('async function ghiChao'));
  ok('gỡ tệp cũ trước khi đính tệp mới', /goTep\(rec, COT_TEP/.test(ghi));

  /* Hai luật dưới đây đều học từ cùng một lần hỏng: bấm nhanh bốn lượt làm ba
   * bản chồng lên nhau, và mọi lượt đọc sau đó trả về cấu hình của mấy phút
   * trước — không báo lỗi gì, chỉ là lưu xong không thấy đổi. */
  ok('gỡ MỌI tệp cũ, không chỉ tệp đầu',
    /for \(const t of d\.tep\)/.test(ghi),
    'gỡ một bản mỗi lượt thì khi đã chồng ba bản, chồng mãi không hết');
  const doc = src.slice(src.indexOf('async function docChao'), src.indexOf('async function ghiChao'));
  ok('đọc tệp CUỐI chứ không phải tệp đầu',
    /d\.tep\[d\.tep\.length - 1\]/.test(doc),
    'tệp đầu là bản CŨ NHẤT khi có nhiều bản chồng nhau');
  ok('không đọc lời chào qua docKho() (nó chỉ giữ tệp đầu)',
    !/docKho\(\)/.test(doc));
  ok('Base hỏng thì trả mặc định chứ không ném',
    /catch \(e\) \{ baoChao\(e\); return \{ \.\.\.CHAO_MAC_DINH \}; \}/.test(src));

  /* ---- hai lỗi bắt được trên BẢN THẬT ngày 08/10/2026 ---- */

  /* taiTep() cố tình vứt mọi đáp có content-type JSON, vì Lark có đường trả
   * thân lỗi dạng JSON kèm mã HTTP 200. Luật đó đúng và phải giữ. Nhưng cất
   * cấu hình dưới nhãn `application/json` là tự biến nó thành thứ không đọc
   * lại được: tải về đúng nội dung rồi bị ném đi vì tưởng là lỗi. Trên Cài đặt
   * nó hiện ra nguyên văn chuỗi JSON đúng, dưới tiêu đề "Không tải được". */
  ok('KHÔNG cất cấu hình dưới nhãn application/json',
    !/kieu: 'application\/json'/.test(ghi),
    'taiTep() sẽ vứt nó đi vì tưởng là thân lỗi của Lark');
  ok('nén trước khi cất, để ruột thành nhị phân', /zlib\.gzipSync/.test(ghi));
  ok('đọc nhận cả bản nén lẫn bản chữ trần đã ghi trước đó',
    /buf\[0\] === 0x1f && buf\[1\] === 0x8b/.test(doc));

  /* Lời chào hỏng KHÔNG được làm ô phát báo động nhầm: dùng chung `loiCuoi`
   * thì Cài đặt đóng dấu "ổ tạm" lên phần Video giới thiệu và báo "Không ghi
   * lên Lark Base được", trong khi video vẫn nằm yên trên Base. */
  ok('lời chào có ô báo lỗi RIÊNG, không dùng chung với ô phát',
    /let loiChaoCuoi/.test(src) && /function loiChao\(/.test(src));
  ok('docChao/ghiChao không đụng vào loiCuoi của ô phát',
    !/loiCuoi/.test(doc) && !/loiCuoi/.test(ghi));
  const SV = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok('đầu API lời chào báo lỗi của chính nó', /phimKho\.loiChao\(\)/.test(SV));
}

group('trang và màn Cài đặt');
{
  const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const CD = fs.readFileSync(path.join(__dirname, '..', 'public', 'caidat.js'), 'utf8');

  ok('trang có dựng ô chữ', /function oChaoHtml\(/.test(APP));
  ok('chọn hiện chữ thì KHÔNG dựng ô phát nữa',
    /const coPhim = !laChu &&/.test(APP),
    'hai ô cùng hiện là bảng tin có hai cột trái');
  /* Để trống + tắt tự chào thì vẫn còn ngày tháng: ô rỗng hoàn toàn trông như
   * khối hỏng, mà đây là chỗ đầu tiên người ta nhìn khi mở trang. */
  ok('luôn còn dòng ngày tháng dù không có lời chào nào',
    /tin-chao-ngay/.test(APP) && /loi \?/.test(APP));
  ok('nội dung riêng thắng lời chào tự động', /chuRieng\s*\n?\s*\|\|/.test(APP));

  /* `TIN` khai bằng `let` nên KHÔNG nằm trên window — caidat.js phải gọi hàm,
   * không được thử `window.TIN`. Bản đầu viết đúng kiểu đó và lệnh làm mới
   * không bao giờ chạy: sửa lời chào xong quay ra Tổng quan vẫn thấy cái cũ. */
  ok('trang có cửa chính thức để quên bảng tin', /function quenKhoiTin\(/.test(APP));
  ok('Cài đặt gọi đúng cửa đó', /quenKhoiTin\(\)/.test(CD));
  ok('Cài đặt KHÔNG dò window.TIN', !/window\.TIN/.test(CD));

  /* Ghi lên Base mất ~4,6 giây. Chặn bằng lá cờ chứ không bằng button.disabled:
   * lớp dịch ngôn ngữ dựng lại khối này nên thuộc tính DOM đặt tay bay mất sau
   * 80ms — đã đo. */
  ok('chặn lượt lưu thứ hai khi lượt đầu chưa xong', /if \(S\.cdChaoDangLuu\) return;/.test(CD));
  ok('và luôn mở khoá lại, kể cả khi lỗi', /finally \{\s*S\.cdChaoDangLuu = false;/.test(CD));
  ok('nói ra khi Base từ chối, không nuốt lỗi', /khoLoi/.test(CD));
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
process.exit(fail ? 1 : 0);
