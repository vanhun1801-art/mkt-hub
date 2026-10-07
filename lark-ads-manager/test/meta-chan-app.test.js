/**
 * Hai lỗi bắt được ngày 07/10/2026, lúc anh Hùng bấm "Dò tài khoản" và nhận
 * một cái toast tiếng Anh trống trơn: **API access blocked.**
 *
 * 1. `sync/http.js` ném ra `undefined` khi gọi với `retries: 0`.
 *    `retries` được dùng thẳng làm số vòng lặp, nên 0 nghĩa là KHÔNG GỌI LẦN
 *    NÀO; `last` còn undefined và `throw last` ném đúng undefined. Bên gọi bắt
 *    được một thứ không có `.message` — câu lỗi biến mất sạch. Mọi phép dò viết
 *    với `retries: 0` đều im lặng trả về "undefined", kể cả phép dò tôi dùng để
 *    tìm nguyên nhân.
 *
 * 2. "API access blocked" lọt nguyên văn ra màn hình. Đây là chặn ở cấp **App**
 *    của Meta — token vẫn còn hạn, tài khoản quảng cáo vẫn chạy — nhưng Meta trả
 *    đúng ba chữ đó cho mọi lời gọi và không nói App nào. Đo thật: token trên
 *    máy anh Hùng thuộc App "Rooty Trip Dashboard Ads", còn bản trên server dùng
 *    token của App khác, và chính App kia bị chặn.
 */
const http = require('../sync/http');
const meta = require('../sync/meta');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

console.log('— retries: 0 nghĩa là ĐỪNG THỬ LẠI, không phải đừng gọi');
(async () => {
  {
    /* Địa chỉ không tồn tại → phải ném một Error ĐỌC ĐƯỢC, không ném undefined. */
    let bat = 'không ném gì';
    try {
      await http.getJson('http://127.0.0.1:1/khong-co-that', { label: 'thu', retries: 0, timeout: 2000 });
    } catch (e) { bat = e; }
    t('có ném lỗi', bat !== 'không ném gì');
    t('và lỗi KHÔNG phải undefined', bat !== undefined, String(bat));
    t('đọc được .message', !!(bat && bat.message), JSON.stringify(bat && bat.message));
    t('message có nhãn để biết hỏng ở đâu', /thu/.test((bat && bat.message) || ''), (bat && bat.message) || '');
  }

  {
    /* retries: 1 vẫn phải là một lần gọi, không phải không gọi. */
    let bat = null;
    try {
      await http.getJson('http://127.0.0.1:1/khong-co-that', { label: 'thu1', retries: 1, timeout: 2000 });
    } catch (e) { bat = e; }
    t('retries 1 cũng ném lỗi đọc được', !!(bat && bat.message), String(bat && bat.message).slice(0, 60));
  }

  {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'sync', 'http.js'), 'utf8');
    t('có kẹp sàn số lần thử', /Math\.max\(1, Number\(retries\)/.test(src));
    t('không còn dùng thẳng retries làm số vòng', !/i < retries;/.test(src));
    t('không bao giờ ném undefined ở cuối', /throw last \|\| new Error\(/.test(src));
    t('ghi lại lý do trong chú thích', /ném ra ĐÚNG undefined|ném đúng undefined/.test(src));
  }

  console.log('\n— "API access blocked": dịch thành câu làm được việc');
  {
    const conf = { accessToken: '', apiVersion: 'v21.0' };
    const ra = await meta.giaiThichChan(conf, 'API access blocked');
    t('nói rõ chặn ở cấp ỨNG DỤNG', /cấp ỨNG DỤNG/.test(ra), ra.slice(0, 80));
    /* Đây là phần quan trọng nhất: người đọc hay tưởng token hỏng rồi đi tạo
     * token mới, mà tạo bao nhiêu cái cũng vẫn chặn vì chặn nằm ở App. */
    t('nói rõ KHÔNG phải token hỏng', /không phải token/.test(ra));
    t('nói rõ tài khoản quảng cáo vẫn chạy', /tài khoản quảng cáo vẫn chạy/.test(ra));
    t('chỉ cách nhanh nhất: đổi sang App khác', /Meta App KHÁC/.test(ra));
    t('và chỉ chỗ chữa tận gốc', /developers\.facebook\.com\/apps/.test(ra));
    /* Hỏi không ra tên App thì nói thẳng là không biết, đừng đoán. */
    t('không đoán tên App khi hỏi không được', /Không hỏi được App nào/.test(ra), ra.slice(0, 120));
  }

  {
    /* Lỗi THƯỜNG thì giữ nguyên — đừng biến mọi lỗi Meta thành bài giảng về App. */
    const ra = await meta.giaiThichChan({ accessToken: '' }, 'Invalid OAuth access token');
    t('lỗi khác giữ nguyên văn', ra === 'Invalid OAuth access token', ra);
    t('chuỗi rỗng không nổ', (await meta.giaiThichChan({}, '')) === '');
    t('null không nổ', (await meta.giaiThichChan({}, null)) === '');
  }

  console.log('\n— nút "Dò tài khoản" và "Kiểm tra kết nối" đều phải đi qua bộ dịch');
  {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'sync', 'meta.js'), 'utf8');
    const i = src.indexOf('async function danhSachTaiKhoan');
    t('Dò tài khoản dịch lỗi', /giaiThichChan\(conf, scrub\(r\.error\.message/.test(src.slice(i, i + 900)));
    const j = src.indexOf('async function test(conf)');
    const than = src.slice(j, j + 1400);
    t('Kiểm tra kết nối dịch lỗi trả về', /giaiThichChan\(conf, scrub\(res\.error\.message/.test(than));
    t('và dịch cả lỗi ném ra', /giaiThichChan\(conf, scrub\(e\.message/.test(than));
    /* Hàm tự gọi hideSecret: nó chạy ở nhánh LỖI, có thể tới từ chỗ chưa kịp
     * đăng ký bí mật — thiếu thì chính nó hỏng và trả "không hỏi được App nào"
     * dù hỏi được. Đã mắc đúng lỗi này một lần. */
    t('bộ dịch tự lo hideSecret', /hideSecret\(conf\.accessToken\);[\s\S]{0,200}debug_token/.test(src));
  }

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exitCode = fail ? 1 : 0;
})();
