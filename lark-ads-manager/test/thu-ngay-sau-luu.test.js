/**
 * Dán token xong phải biết NGAY nó chạy chưa.
 *
 * Anh Hùng, 07/10/2026, sau khi đổi token TikTok: "sao vẫn bị lỗi thế này".
 * Luồng cũ bắt đi ba bước mới trả lời được câu đó:
 *   1. dán token → bấm Lưu cấu hình
 *   2. app bảo "Đã lưu — bấm Kiểm tra kết nối để thử"
 *   3. kết quả hiện trong một bảng tận cuối trang, lẫn với ba kênh khác
 *
 * Dán token là lúc người ta cần biết đúng MỘT điều: nó chạy chưa. Giờ lưu xong
 * app tự thử đúng kênh vừa dán và in kết quả ngay trong thẻ đó.
 */
const fs = require('fs');
const path = require('path');
const sync = require('../sync');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
/* Bỏ chú thích trước khi dò chữ: chính khối chú thích giải thích thay đổi này
 * có nhắc lại câu cũ, nên dò trên bản thô là kêu oan. */
const boChuThich = (x) => String(x)
  .replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), '')
  .replace(new RegExp('//[^\\n]*', 'g'), '');

console.log('— testAll lọc được một kênh');
{
  const src = doc('sync/index.js');
  t('nhận tham số chỉ một kênh', /async function testAll\(chiKenh = ''\)/.test(src));
  t('bỏ qua kênh khác', /if \(chiKenh && key !== chiKenh\) continue;/.test(src));
  /* Bỏ trống thì vẫn thử hết — nút "Kiểm tra kết nối" chung vẫn phải chạy. */
  t('bỏ trống thì không lọc gì', /chiKenh && key/.test(src));
  t('ghi lại vì sao cần lọc', /chẳng liên quan|chỉ muốn biết ĐÚNG kênh/.test(src));
}

console.log('— server nhận ?kenh=');
{
  const src = doc('server.js');
  const i = src.indexOf("'/api/connect/test'");
  const than = src.slice(i, i + 500);
  t('đọc tham số kenh', /searchParams\.get\('kenh'\)/.test(than), than.slice(0, 120));
  t('truyền xuống testAll', /sync\.testAll\(chi\)/.test(than));
}

console.log('— giao diện: lưu xong thử luôn, in ngay trong thẻ');
{
  const src = doc('public/ketnoi.js');
  t('không còn bảo đi bấm nút khác',
    !/Đã lưu — bấm Kiểm tra kết nối để thử/.test(boChuThich(src)));
  t('lưu xong có gọi thử', /\/api\/connect\/test\?kenh=/.test(src));
  t('có hàm dựng kết quả', /const kqLuuHtml = \(key\)/.test(src));
  t('vẽ trong THẺ kênh, không vẽ trong biểu mẫu', /\$\{kqLuuHtml\(p\.key\)\}/.test(src));

  /* BÀI HỌC PHẢI TRẢ GIÁ, 07/10/2026: bản đầu chèn thẳng khối kết quả vào DOM
   * rồi gọi render() — render() dựng lại cả trang nên khối vừa chèn biến mất
   * ngay lập tức. Không phép kiểm nào thấy; chỉ lòi ra lúc bấm thật trên app.
   * Nên kết quả phải nằm trong một kho ngoài hàm vẽ, và được vẽ LẠI mỗi lượt. */
  t('kết quả giữ ngoài hàm vẽ để sống qua render', /const KQ_LUU = \{\};/.test(src));
  t('cất vào kho TRƯỚC khi render',
    src.indexOf('KQ_LUU[k] = dong;') < src.lastIndexOf('render();'),
    `${src.indexOf('KQ_LUU[k] = dong;')} / ${src.lastIndexOf('render();')}`);
  t('không còn chèn thẳng vào DOM', !/function veKetQuaLuu/.test(src));
  /* Và phải vẽ trong thẻ kênh chứ không trong biểu mẫu: biểu mẫu gập lại sau
   * khi lưu, vẽ vào đó là vẽ vào chỗ không ai nhìn thấy. */
  t('không vẽ vào biểu mẫu đang gập', !/data-kq-luu/.test(src));

  /* Hỏng thì in NGUYÊN câu nền tảng trả về: từ 07/10 câu đó đã được dịch thành
   * lời chỉ đúng chỗ hỏng (Meta nói App nào bị chặn, TikTok nói tài khoản nào
   * chưa uỷ quyền). Cắt ngắn là vứt mất phần đáng giá nhất. */
  t('hỏng thì in nguyên câu lỗi', /esc\(d\.message \|\| 'không rõ lý do'\)/.test(src));
  t('chạy được thì kể tên tài khoản đọc được', /d\.results \|\| \[\]/.test(src));

  /* Còn thiếu ô bắt buộc thì đừng thử — gọi mạng để nhận một lỗi đã biết trước. */
  t('thiếu cấu hình thì không gọi thử', /if \(!p\.sanSang\) \{[\s\S]{0,260}return;/.test(src));

  /* Thử hỏng KHÔNG được làm hỏng bước lưu: token đã vào rồi, báo lỗi ở đây
   * chỉ làm người dùng tưởng chưa lưu được. */
  t('thử hỏng vẫn coi như đã lưu',
    /catch \(e\) \{ dong = \{ ok: false, message: e\.message \}; \}/.test(src));
}

console.log('— chạy thật: lọc đúng một kênh');
(async () => {
  const r = await sync.testAll('tiktok');
  t('chỉ trả về một dòng', r.length === 1, String(r.length));
  t('và đúng kênh đã xin', r[0] && r[0].kenh === 'tiktok', JSON.stringify(r[0] && r[0].kenh));

  const het = await sync.testAll();
  t('bỏ trống thì trả về nhiều kênh', het.length > 1, String(het.length));

  /* Tên kênh không có thật thì trả rỗng, đừng ném lỗi — giao diện có thể gửi
   * nhầm, mà ném ở đây thì mất luôn thông báo "đã lưu". */
  const bay = await sync.testAll('khong-co-that');
  t('kênh lạ thì trả rỗng, không nổ', Array.isArray(bay) && bay.length === 0, JSON.stringify(bay));

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exitCode = fail ? 1 : 0;
})();
