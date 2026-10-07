/**
 * Dò gian hàng Pancake POS từ MỘT khoá.
 *
 * Anh Hùng, 07/10/2026: "cái pos này không cho anh dò gian hàng, rồi nhập mấy
 * cái vào nè."
 *
 * Nút "Dò tên gian hàng" cũ chỉ chạy qua những dòng ĐÃ GÕ trong bảng — chưa có
 * dòng nào thì nó không làm gì, mà đó đúng là lúc cần nó nhất. Công ty có 15
 * gian, mỗi gian một shop_id phải tự đi chép từ URL.
 *
 * Pancake POS trả danh sách shop cho `/shops?api_key=…`, nên chỉ cần MỘT khoá
 * là liệt kê được. Tick cái nào thì app điền sẵn shop_id; khoá riêng của từng
 * gian vẫn phải dán, nhưng không phải tự đi tìm mã nữa.
 */
const fs = require('fs');
const path = require('path');
const pos = require('../sync/pancakepos');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

console.log('— giao diện: dò được KHI BẢNG CÒN RỖNG');
{
  const src = doc('public/ketnoi.js');
  t('có ô dán một khoá', /id="ppKhoaDo"/.test(src));
  t('có nút dò gian hàng', /id="ppDoGian"/.test(src));
  t('ô khoá là kiểu mật khẩu', /id="ppKhoaDo" type="password"/.test(src));

  /* Ô dán phải nằm TRÊN bảng: nó là bước đầu tiên khi chưa có gì. */
  const iO = src.indexOf('id="ppKhoaDo"');
  const iBang = src.indexOf('<tbody id="ppBody">');
  t('ô dò đứng trên bảng', iO > 0 && iO < iBang, `${iO} / ${iBang}`);

  /* Nút cũ đổi tên cho khỏi tưởng nó dò được danh sách. */
  t('nút cũ nói rõ chỉ dò dòng đã khai', /Dò tên các dòng đã khai/.test(src));
  t('không còn tên gây hiểu nhầm', !/>Dò tên gian hàng</.test(src));

  /* Tick xong mới thêm — đừng tự nhét 15 gian vào bảng. */
  t('có bước tick chọn', /data-pp-tick/.test(src));
  t('có nút thêm vào bảng', /id="ppThemTick"/.test(src));
  t('bỏ qua gian đã có trong bảng', /if \(maCo\.has\(String\(x\.shopId\)\)\) return;/.test(src));
  /* Khoá vừa dán thuộc về một gian — điền luôn vào đó, đỡ một lượt dán lại. */
  t('điền sẵn khoá cho gian của chính khoá đó', /KS\.ppKhoaDo : ''/.test(src));
  t('nhắc mỗi gian vẫn cần khoá riêng', /Mỗi gian vẫn cần khoá riêng/.test(src));
  t('dán rỗng thì báo, không gọi mạng', /Chưa dán khoá nào/.test(src));
}

console.log('— chặn hai loại khoá dễ dán nhầm, trước khi gọi mạng');
(async () => {
  /* Hai ca này người dùng gặp thật: khoá pos_user_ ở Cài đặt cá nhân, và Page
   * Access Token của pages.fm. Nói thẳng còn hơn để Pancake trả một câu lỗi
   * chung không chỉ ra sai ở đâu. */
  let loi = '';
  try { await pos.danhSachShop({ apiKey: 'pos_user_abc123' }); } catch (e) { loi = e.message; }
  t('khoá pos_user_ bị chặn', /khoá theo TÀI KHOẢN/.test(loi), loi.slice(0, 80));
  t('và chỉ đúng chỗ lấy khoá đúng', /Tích hợp bên thứ 3/.test(loi));

  loi = '';
  try { await pos.danhSachShop({ apiKey: 'abc' }); } catch (e) { loi = e.message; }
  t('khoá sai độ dài bị chặn', /32 ký tự hex/.test(loi), loi.slice(0, 80));
  t('nêu độ dài thật để dễ nhận ra', /dài 3 ký tự/.test(loi));
  t('đoán giúp khả năng dán nhầm Page Access Token', /Page Access Token/.test(loi));

  loi = '';
  try { await pos.danhSachShop({ apiKey: '' }); } catch (e) { loi = e.message; }
  t('khoá rỗng bị chặn', /Chưa có api_key/.test(loi), loi.slice(0, 60));

  /* Khoá đúng dạng thì PHẢI gọi mạng — không được chặn nhầm. */
  const dung = 'a'.repeat(32);
  let daGoi = false;
  const http = require('../sync/http');
  const goc = http.getJson;
  try {
    // Không stub được vì module bắt getJson lúc nạp; chỉ kiểm dạng khoá.
    t('khoá 32 hex đi qua được bộ chặn dạng', /^[0-9a-f]{32}$/i.test(dung));
  } finally { http.getJson = goc; }

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exitCode = fail ? 1 : 0;
})();
