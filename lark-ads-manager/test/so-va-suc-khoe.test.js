/**
 * Hai lỗi tìm được khi soát lại toàn bộ app ngày 18/09/2026.
 *
 * 1. SỐ THẬP PHÂN DÙNG DẤU CHẤM, trong một app mà dấu chấm là dấu phân nghìn.
 *    Cùng một màn hình Tổng quan hiện:
 *        CHI TIÊU         31.377.340đ   chấm = phân nghìn
 *        ROAS             2.65×         chấm = thập phân
 *        TỈ LỆ ĐẾN TỪ QC  1.9%          chấm = thập phân
 *        CTR              1,66%         phẩy = thập phân
 *    Ba quy ước một màn hình. Và "49.2×" đọc theo đúng quy ước app tự dạy ở ô
 *    bên cạnh thì ra "49 nghìn 2".
 *
 * 2. BĂNG "ĐỒNG BỘ ĐANG KHOẺ" dựa trên một lần kiểm 18 ngày trước. Tác vụ chấm
 *    điểm chạy mỗi 3 giờ; nó ngừng chạy từ 31/08 mà băng vẫn tô xanh và khẳng
 *    định "đang khoẻ". Kết quả kiểm cũ không phải tin tốt về đồng bộ — nó là tin
 *    xấu về chính việc kiểm.
 */
const fs = require('fs');
const path = require('path');
const M = require('../metrics');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

console.log('— số lẻ phải dùng dấu PHẨY, như mọi con số khác trong app');
{
  t('có hàm định dạng số lẻ ở server', typeof M.fmtSo === 'function');
  t('2,65 chứ không phải 2.65', M.fmtSo(2.65) === '2,65', M.fmtSo(2.65));
  t('giữ đúng số chữ số lẻ', M.fmtSo(1.9, 1) === '1,9', M.fmtSo(1.9, 1));
  t('làm tròn lên đủ chữ số', M.fmtSo(3, 2) === '3,00', M.fmtSo(3, 2));
  /* Số lớn phải có CẢ dấu phân nghìn lẫn dấu thập phân đúng quy ước — đây mới là
   * chỗ dễ đọc nhầm nhất: 1.234,56 chứ không phải 1,234.56. */
  t('số lớn: chấm phân nghìn, phẩy thập phân', M.fmtSo(1234.56) === '1.234,56', M.fmtSo(1234.56));
  t('null thì trả gạch, không trả NaN', M.fmtSo(null) === '—');
  t('không phải số cũng trả gạch', M.fmtSo('abc') === '—', M.fmtSo('abc'));

  /* Không tệp nào được quay lại .toFixed() để in ra màn hình: .toFixed() luôn
   * cho dấu chấm, và đó chính là cách bốn con số kia lọt ra. */
  ['public/app.js', 'public/ketnoi.js', 'metrics.js'].forEach((f) => {
    t(`${f} không còn gọi .toFixed()`, !/\.toFixed\(/.test(boChuThich(doc(f))));
  });
}

console.log('— ROAS in ra MỘT kiểu duy nhất');
{
  /* Trước đây ba dòng khác nhau in ROAS ba kiểu: .toFixed(2), số trần, rồi
   * .toFixed(2) lần nữa — cùng một chỉ số mỗi chỗ một dáng. */
  const app = doc('public/app.js');
  t('có hàm roasText dùng chung', /const roasText = /.test(app));
  /* Đếm THAM CHIẾU chứ không đếm lời gọi: một chỗ dùng nó qua bí danh
   * (`const ty = roasText;`) nên đếm `roasText(` sẽ hụt — tôi đã đếm hụt đúng
   * như vậy ở bản đầu. */
  const soCho = (boChuThich(app).match(/roasText/g) || []).length;
  t('mọi chỗ in ROAS đều qua nó', soCho >= 5, String(soCho));
  t('không còn in số trần rồi ghép dấu ×', !/\$\{T\.roas\} ?\+? ?.?×/.test(boChuThich(app)));
}

console.log('— cảnh báo cũng phải theo quy ước Việt');
{
  /* Chuỗi cảnh báo dựng bằng template literal, mà template literal đổi số sang
   * chuỗi kiểu JavaScript — luôn ra dấu chấm. Đo thật trên màn hình trước khi
   * sửa: 397.77%, 333.52%, 117.79%, 475.47%. */
  const m = boChuThich(doc('metrics.js'));
  t('phần trăm vượt ngân sách đi qua fmtSo', /fmtSo\(pct\)/.test(m));
  t('CTR trong cảnh báo cũng vậy', /fmtSo\(m\.ctr\)/.test(m));
  t('không còn nhét thẳng số lẻ vào chuỗi', !/\$\{r2\(pct\)\}/.test(m));
}

console.log('— "đang khoẻ" phải là kết luận về HÔM NAY, không phải về 18 ngày trước');
{
  const kn = doc('public/ketnoi.js');
  t('có xét tuổi của lần kiểm', /gioCu|quaCu/.test(kn));
  t('có ngưỡng coi là cũ', /GIO_COI_LA_CU/.test(kn));

  /* Quá cũ thì KHÔNG được tô xanh và KHÔNG được nói "đang khoẻ": lúc đó app
   * không biết đồng bộ thế nào, nó chỉ biết việc kiểm đã ngừng. */
  t('quá cũ thì nói "chưa biết"', /Chưa biết đồng bộ có khoẻ không/.test(kn));
  t('và nói rõ chính việc kiểm đã ngừng', /chính việc kiểm đã ngừng/.test(kn));
  t('và dặn đừng dựa vào số cũ', /đừng dựa vào mấy số này/.test(kn));

  /* Nhánh "quá cũ" phải đứng TRƯỚC nhánh khoẻ/hỏng, nếu không nó không bao giờ
   * chạy tới — đúng loại lỗi thứ tự điều kiện. */
  const iCu = kn.indexOf('quaCu');
  const iKhoe = kn.indexOf('Đồng bộ đang khoẻ');
  t('nhánh quá cũ xét trước nhánh khoẻ', iCu > 0 && iCu < iKhoe, `${iCu} / ${iKhoe}`);

  /* Ngưỡng phải rộng hơn nhịp chạy: tác vụ chạy mỗi 3 giờ, nhưng Render ngủ và
   * deploy làm lỡ nhịp. Báo động ở 3 tiếng là kêu oan gần như mỗi ngày, mà băng
   * kêu oan thì vài hôm là không ai đọc nữa. */
  const m2 = kn.match(/GIO_COI_LA_CU = (\d+)/);
  t('ngưỡng rộng hơn nhịp 3 giờ', m2 && Number(m2[1]) > 3, m2 && m2[1]);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
