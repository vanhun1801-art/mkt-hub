/**
 * Test băng cảnh báo "kênh đang bật mà gọi lỗi".
 *
 * Vì sao có bộ này: anh Hùng phát hiện mất kết nối Google Ads bằng cách tự nhìn
 * chỉ báo trên đầu và đếm thấy THIẾU một tên. App biết chính xác lỗi gì —
 * "Token has been expired or revoked" nằm sẵn trong live.loi — nhưng chỉ nhét vào
 * TOOLTIP của cái chip. Không ai hover một cái chip.
 *
 * Đây là loại hỏng tệ nhất: số vẫn hiện ra bình thường (lấy từ Base cũ) nên không
 * có gì TRÔNG sai. Không sai, chỉ cũ, và không ai biết.
 *
 * Rút thẳng hàm từ public/app.js chứ không chép lại — chép lại thì hai bên trôi xa
 * nhau mà test vẫn xanh.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const i = src.indexOf('function veBangKenhLoi(');
t('public/app.js có hàm veBangKenhLoi', i >= 0);
const j = src.indexOf('\nfunction renderNguon(', i);
const nguon = src.slice(i, j);

/* Dựng một #bangKenhLoi giả để đọc kết quả. `$` và `esc` là của trình duyệt. */
const el = { hidden: true, innerHTML: '' };
const $ = (sel) => (sel === '#bangKenhLoi' ? el : null);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// eslint-disable-next-line no-eval
const veBangKenhLoi = eval(`(${nguon.replace('function veBangKenhLoi', 'function')})`);

console.log('— không lỗi thì băng phải ẨN hẳn');
veBangKenhLoi({ loi: [] });
t('ẩn khi mảng lỗi rỗng', el.hidden === true && el.innerHTML === '');
veBangKenhLoi({});
t('ẩn khi không có trường loi', el.hidden === true);
veBangKenhLoi(null);
t('null cũng không nổ', el.hidden === true);

console.log('— có lỗi thì hiện, và nói rõ SỐ ĐANG HIỆN LÀ SỐ CŨ');
veBangKenhLoi({ loi: [{ kenh: 'googleAds', platform: 'Google Ads', loi: 'Token has been expired or revoked.' }] });
t('băng hiện ra', el.hidden === false);
t('nêu tên kênh', el.innerHTML.includes('Google Ads'));
/* Câu này là điểm cốt lõi: không có nó thì người đọc thấy "Google Ads 285.052đ"
 * và tin đó là số hôm nay, trong khi là số lần chảy cuối trước khi mất kết nối. */
t('nói rõ số đang hiện là số CŨ', /số cũ trong Lark Base/.test(el.innerHTML), el.innerHTML.slice(0, 200));
t('in nguyên câu lỗi của nền tảng để tra được',
  el.innerHTML.includes('Token has been expired or revoked'));
t('có nút mở tab Kết nối', /href="#\/ket-noi"/.test(el.innerHTML));

console.log('— dịch câu lỗi thành VIỆC PHẢI LÀM');
const loiRa = (s) => { veBangKenhLoi({ loi: [{ platform: 'X', loi: s }] }); return el.innerHTML; };

/* Nhãn nút phải ĐÚNG như trong giao diện. Bản đầu tôi viết "Lấy lại quyền" — một
 * nút không tồn tại. Chỉ người ta vào chỗ không có gì thì tệ hơn không nói gì. */
const ket = fs.readFileSync(path.join(__dirname, '..', 'public', 'ketnoi.js'), 'utf8');
const h = loiRa('Token has been expired or revoked.');
t('hướng dẫn nêu đúng nút "Lấy link uỷ quyền"', h.includes('Lấy link uỷ quyền'));
t('nút đó có thật trong giao diện', ket.includes('>Lấy link uỷ quyền<'));
t('hướng dẫn nêu đúng nút "Đổi lấy token"', h.includes('Đổi lấy token'));
t('nút đó cũng có thật', ket.includes('>Đổi lấy token<'));
/* Chỉ lấy lại token là tuần sau mất nữa, nếu màn hình OAuth còn ở chế độ Testing:
 * refresh token loại đó chỉ sống 7 ngày. Không nói ra thì mỗi tuần lại một lần. */
t('cảnh báo chế độ Testing chỉ sống 7 ngày', /Testing/.test(h) && /7 ngày/.test(h));
t('nêu cách hết lặp: In production', /In production/.test(h));

t('invalid_grant cũng ra cùng hướng dẫn', loiRa('invalid_grant').includes('Lấy link uỷ quyền'));
t('invalid_client nói đúng chỗ sai', /Client ID/.test(loiRa('invalid_client: bad')));
t('developer token nói đúng chỗ sai', /Developer token/.test(loiRa('The developer token is not approved')));
t('PERMISSION_DENIED nói về quyền và MCC', /quyền/.test(loiRa('USER_PERMISSION_DENIED')));
t('lỗi lạ vẫn có hướng dẫn chung, không bỏ trống',
  /Kiểm tra kết nối/.test(loiRa('cái gì đó rất lạ')), loiRa('cái gì đó rất lạ').slice(0, 160));

console.log('— nhiều kênh lỗi thì nêu đủ, không chỉ cái đầu');
veBangKenhLoi({ loi: [
  { platform: 'Google Ads', loi: 'invalid_grant' },
  { platform: 'TikTok', loi: 'Invalid access_token' },
] });
t('nêu cả hai kênh', el.innerHTML.includes('Google Ads') && el.innerHTML.includes('TikTok'));
t('dựng hai băng riêng', (el.innerHTML.match(/class="bang-loi"/g) || []).length === 2);

console.log('— chip cũng phải nói, không chỉ tooltip');
t('chip in tên kênh lỗi', /LỖI<\/span>/.test(src) && /loi\.map\(\(x\) => x\.platform\)/.test(src));
t('vẫn giữ chi tiết trong tooltip', /el\.title = /.test(src));

console.log('— CSS của băng dùng token có sẵn, không màu tự gõ');
{
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const k = css.indexOf('\n.bang-loi {');
  const khoi = k < 0 ? '' : css.slice(k, css.indexOf('}', k));
  t('có khối .bang-loi', k >= 0);
  /* Màu tự gõ chỉ đúng ở chế độ sáng. --bad-soft có sẵn cả bản tối. */
  t('nền dùng --bad-soft (có bản cho chế độ tối)', /var\(--bad-soft\)/.test(khoi), khoi);
  t('không có mã màu tự gõ', !/#[0-9a-f]{3,6}/i.test(khoi), khoi);
  t('--bad-soft có khai cho chế độ tối', (css.match(/--bad-soft:/g) || []).length >= 2);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
