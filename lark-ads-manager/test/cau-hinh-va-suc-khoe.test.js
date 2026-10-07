/**
 * Trang Kết nối dựng lại theo hai yêu cầu của anh Hùng, 07/10/2026.
 *
 * 1. "Thể hiện các cấu hình của TikTok, Facebook, Google, Pancake, POS và
 *    Tourwell thành 1 cụm gần nhau gọi là Cấu hình kết nối; sau khi đổi cấu
 *    hình thì sinh ra nội dung ADS_CONNECT_JSON để đưa lên Render."
 *    Trước đó ba kênh quảng cáo nằm một chỗ, Pancake/POS/Tourwell nằm tít
 *    dưới, mà nút lấy ADS_CONNECT_JSON lại chen vào GIỮA — bấm xong rồi mới
 *    sửa tiếp ba cái dưới là chuỗi vừa lấy đã cũ.
 *
 * 2. "Đảm bảo các kết nối này không bao giờ bị ngắt, nếu có thì ghi ngày kết
 *    nối và ngày cần kết nối mới lại."
 *    App trước đây KHÔNG lưu ngày kết nối, và dải theo dõi chỉ có ba kênh
 *    quảng cáo — Pancake/POS/Tourwell đứt thì ROAS chết mà không ai biết.
 */
const fs = require('fs');
const path = require('path');
const ketnoi = require('../sync/ketnoi');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

console.log('— cụm "Cấu hình kết nối": sáu nguồn liền nhau, ADS_CONNECT_JSON ở CUỐI');
{
  const src = doc('public/ketnoi.js');
  const i = (x) => src.indexOf(x);

  const cum = i('<h3>Cấu hình kết nối</h3>');
  const luoi = i("c.providers.filter(hienKenh).map(providerCard)");
  const pc = i('${thePancake(c)}');
  const pos = i('${thePancakePos(c)}');
  const tw = i('${theTourwell(c)}');
  const env = i('<h3>Sao lưu cấu hình vào ADS_CONNECT_JSON</h3>');
  const dongBo = i('<h3>Đồng bộ &amp; kiểm tra</h3>');

  t('có tiêu đề cụm', cum > 0);
  t('ba kênh quảng cáo nằm trong cụm', luoi > cum, `${cum} / ${luoi}`);
  t('Pancake liền ngay sau', pc > luoi, `${luoi} / ${pc}`);
  t('rồi POS', pos > pc);
  t('rồi Tourwell', tw > pos);
  /* ĐÂY là điểm chính: lấy chuỗi env SAU KHI đã sửa xong cả sáu. */
  t('ADS_CONNECT_JSON đứng CUỐI cụm', env > tw, `${tw} / ${env}`);
  t('và trước phần vận hành', env < dongBo, `${env} / ${dongBo}`);
  t('dặn sửa xong hết rồi mới lấy chuỗi', /Sửa xong <b>tất cả<\/b> rồi mới bấm/.test(src));
  /* Ba nguồn dưới không phải nguồn chi tiêu — nói rõ để khỏi tưởng thừa. */
  t('giải thích vai trò ba nguồn dưới', /thiếu chúng thì có chi tiêu mà không có doanh thu/.test(src));
}

console.log('— NGÀY KẾT NỐI: app phải nhớ');
{
  const src = doc('sync/ketnoi.js');
  t('ghi noiLuc khi bí mật đổi', /cur\[kenh\]\.noiLuc = nay;/.test(src));
  /* Sửa mã tài khoản hay chỉ số chuyển đổi thì ngày kết nối KHÔNG đổi theo. */
  t('chỉ ghi khi đổi BÍ MẬT, không phải mọi thay đổi', /LA_BI_MAT\(kenh, key\)/.test(src));
  /* Ba khối pancake/pos/tourwell lưu bằng hàm riêng, không đi qua writeSecrets. */
  t('có hàm đánh dấu cho ba khối lưu riêng', /function danhDauNoi/.test(src));
  ['pancake', 'pancakePos', 'tourwell'].forEach((k) => {
    t(`  ${k} có gọi danhDauNoi`, new RegExp(`danhDauNoi\\(cur, '${k}'\\)`).test(src));
  });

  const st = ketnoi.status();
  const het = [...st.providers, ...st.doLuong];
  t('mọi kết nối đều có ô noiLuc', het.every((x) => 'noiLuc' in x),
    JSON.stringify(het.filter((x) => !('noiLuc' in x)).map((x) => x.key)));
  t('chưa từng lưu thì là null, không bịa ngày',
    het.every((x) => x.noiLuc === null || typeof x.noiLuc === 'string'));
}

console.log('— HẠN: mỗi nguồn một luật, chỗ không biết thì nói không biết');
{
  const st = ketnoi.status();
  const lay = (k) => [...st.providers, ...st.doLuong].find((x) => x.key === k) || {};

  t('Pancake đọc được hạn thật từ JWT',
    !!(lay('pancake').hanToken && (lay('pancake').hanToken.hetHanNgay || lay('pancake').hanToken.vinhVien)),
    JSON.stringify(lay('pancake').hanToken));
  t('TikTok nói rõ không công bố hạn',
    /không công bố hạn/.test((lay('tiktok').hanToken || {}).moTa || ''),
    JSON.stringify(lay('tiktok').hanToken));
  /* Đúng cái Google Console cảnh báo trên màn hình anh Hùng hôm nay. */
  t('Google nhắc client bị xoá nếu 6 tháng không dùng',
    /6 tháng/.test((lay('googleAds').hanToken || {}).moTa || ''));
  t('Tourwell nói không hết hạn',
    (lay('tourwell').hanToken || {}).vinhVien === true);

  const src = doc('sync/ketnoi.js');
  /* 10 ngày là quá sát cho một token phải vào tận Pancake lấy lại. */
  t('báo trước 30 ngày, không phải 10', /if \(con <= 30\)/.test(src));
  t('ghi lại lý do đổi mốc', /10 ngày là quá sát/.test(src));
  t('kèm ngày hết hạn để giao diện in ra', /hetHanNgay: ngay/.test(src));
}

console.log('— bảng sức khoẻ: đủ SÁU, xếp theo mức gấp, tóm tắt khớp bảng');
{
  const src = doc('public/ketnoi.js');
  t('gom cả providers lẫn doLuong', /\[\.\.\.c\.providers\.filter\(hienKenh\), \.\.\.\(c\.doLuong \|\| \[\]\)\]/.test(src));
  /* Bản đầu lọc bỏ nguồn chưa có token — mà "Tourwell chưa nối" mới là thứ cần
   * thấy nhất. Không thể đảm bảo một kết nối không đứt nếu nó không nằm trong bảng. */
  t('KHÔNG lọc bỏ nguồn chưa cấu hình', !/\.filter\(\(x\) => x\.sanSang \|\| x\.coToken\)/.test(src));
  t('có cột Nối lúc', /<th>Nối lúc<\/th>/.test(src));
  t('có cột Hạn', /<th>Hạn<\/th>/.test(src));
  t('sắp sửa hết hạn thì nói NGÀY phải nối lại', /nối lại trước \$\{dmy\(han\.hetHanNgay/.test(src));

  /* Tóm tắt phải khớp cột "Cần làm gì" — bản đầu nói "mọi thứ bình thường"
   * ngay trên một bảng đang có dòng đỏ "số cũ 14 ngày". */
  t('mức gấp có tính cả số cũ trong Base', /if \(LA_QUANG_CAO\.includes\(p\.key\)\) \{[\s\S]{0,200}return 4;/.test(src));
  t('ghi lại lỗi tóm tắt lệch bảng', /nói "mọi thứ bình thường" ngay trên một bảng đang có dòng đỏ/.test(src));

  /* Nguồn ĐO không sinh dòng chi tiêu — đừng bắt chúng trả lời câu không dành
   * cho chúng rồi tô đỏ. */
  t('phân biệt nguồn quảng cáo với nguồn đo', /const LA_QUANG_CAO = /.test(src));
  t('nguồn đo ghi "không sinh số"', /không sinh số/.test(src));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
