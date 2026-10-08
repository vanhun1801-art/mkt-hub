/**
 * Uỷ quyền TikTok ngay trong app — khỏi mở terminal.
 *
 * Anh Hùng, 07/10/2026, sau khi thử ba token khác nhau mà vẫn 40105: "Vẫn thấy
 * lỗi". Google có nút "Lấy link uỷ quyền" trong app từ lâu, TikTok thì chưa —
 * muốn lấy token phải chạy `node ket-noi.js --tiktok`, mà trên server chung thì
 * không có dòng lệnh nào để chạy.
 *
 * CÁI ĐƯỢC LỚN NHẤT KHÔNG PHẢI TIỆN: lượt đổi token của TikTok trả về LUÔN danh
 * sách advertiser đã uỷ quyền, nên app lưu token và mã tài khoản CÙNG một lúc.
 * Hết cảnh token đúng mà ô "Mã tài khoản quảng cáo" khai một ID không nằm trong
 * uỷ quyền — đúng cái lỗi 40105 đang gặp.
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

console.log('— cấu hình nhận thêm App ID và App Secret');
{
  const c = ketnoi.read().tiktok;
  t('có ô appId', 'appId' in c, JSON.stringify(Object.keys(c)));
  t('có ô appSecret', 'appSecret' in c);

  const src = doc('sync/ketnoi.js');
  /* appSecret là BÍ MẬT: để trống nghĩa là giữ nguyên, và không bao giờ trả ra. */
  t('appSecret khai là bí mật', /\['appSecret', 'biMat'\]/.test(src));
  t('appId là ô thường', /\['appId', 'chuoi'\]/.test(src));

  const bm = ketnoi.bieuMau().tiktok;
  t('biểu mẫu trả appId ra được', 'appId' in bm);
  t('nhưng KHÔNG trả appSecret', !('appSecret' in bm), JSON.stringify(Object.keys(bm)));
  t('chỉ trả cờ đã có appSecret', 'daCoAppSecret' in bm);
}

console.log('— đường uỷ quyền trên server');
{
  const src = doc('server.js');
  const i = src.indexOf("'/api/connect/tiktok-oauth'");
  t('có đường dẫn', i > 0);
  const than = src.slice(i, i + 3200);

  t('gác sau vai quản lý', /laQuanLy\(req\)/.test(than));
  t('thiếu App ID/Secret thì báo rõ', /Điền App ID và App Secret/.test(than));
  t('chỉ luôn chỗ lấy', /business-api\.tiktok\.com/.test(than));
  t('bước link dựng đúng cổng uỷ quyền', /business-api\.tiktok\.com\/portal\/auth/.test(than));
  t('redirect khớp cái đã khai trong app', /127\.0\.0\.1:47124/.test(than));
  /* Nhận cả URL đầy đủ lẫn mã dán trần — người ta hay copy cả thanh địa chỉ. */
  t('bóc auth_code từ URL', /auth_code=\(\[\^&/.test(than));
  t('cũng nhận mã dán trần', /const code = m \? decodeURIComponent\(m\[1\]\) : dan;/.test(than));

  /* ĐÂY là phần chữa lỗi 40105: lưu token VÀ mã tài khoản cùng lúc. */
  t('lấy danh sách advertiser từ lượt đổi token', /d\.data\.advertiser_ids/.test(than));
  t('lưu cả token lẫn advertiserIds', /accessToken: d\.data\.access_token, advertiserIds: ids/.test(than));
  t('không có tài khoản nào thì báo, không lưu im lặng',
    /không tài khoản nào được uỷ quyền/.test(than));

  /* auth_code dùng một lần — nói trước thì đỡ một vòng hoang mang. */
  t('nhắc auth_code chỉ dùng một lần', /chỉ dùng được một lần/.test(than));
  t('nhắc redirect phải khớp', /Redirect URL khai trong app TikTok phải đúng bằng/.test(than));
  /* Gọi qua lớp http chung để token được che trong mọi thông báo lỗi. */
  t('dùng postJson của lớp http chung, không fetch trần', /await postJson\('https:\/\/business-api/.test(than));
  t('server có nhập postJson', /const \{ postJson \} = require\('\.\/sync\/http'\)/.test(src));
}

console.log('— giao diện: hai nút giống hệt đường Google');
{
  const src = doc('public/ketnoi.js');
  t('biểu mẫu TikTok bật cờ ttOauth', /ttOauth: true/.test(src));
  t('có ô App ID', /k: 'appId', l: 'TikTok App ID'/.test(src));
  t('có ô App Secret, kiểu bí mật', /k: 'appSecret', l: 'TikTok App Secret', mat: true/.test(src));
  t('có nút lấy link', /data-tt-link/.test(src));
  t('có ô dán URL', /data-tt-dan/.test(src));
  t('có nút đổi lấy token', /data-tt-doi/.test(src));

  /* Lưu trước rồi mới dựng link: App ID đang gõ dở mà chưa lưu thì link sai. */
  t('lưu cấu hình trước khi dựng link',
    /nhatForm\('tiktok'\)[\s\S]{0,300}tiktok-oauth/.test(src));
  /* Nói rõ phải tick tài khoản — không tick thì lấy được token mà rỗng tài khoản. */
  t('dặn tick tài khoản ở trang uỷ quyền', /Nhớ tick các tài khoản quảng cáo/.test(src));
  /* Và nói ra số tài khoản lấy được, vì đó chính là phần chữa lỗi. */
  t('báo số tài khoản đã uỷ quyền', /r\.soTaiKhoan/.test(src));
  t('nhắc 127\\.0\\.0\\.1:47124 báo không kết nối là bình thường',
    /127\.0\.0\.1:47124[\s\S]{0,160}bình thường/.test(src));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
