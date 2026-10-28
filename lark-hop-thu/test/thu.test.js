'use strict';
/**
 * Chuyển HTML thư sang chữ và tách phần trích. Thư là dữ liệu từ ngoài công
 * ty: thứ gì lọt qua đây còn nguyên thẻ HTML là lỗ hổng, vì giao diện coi kết
 * quả là chữ (dù giao diện vẫn thoát ký tự thêm một lần nữa).
 */
const { htmlSangChu, tachTrich, veHtml, tachNguoi } = require('../thu');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

console.log('\nHTML → chữ');
const c = htmlSangChu('<div>DUYỆT</div><div><br></div><div>Dòng 2<br>Dòng 3</div>');
ok('khối và <br> thành xuống dòng', c === 'DUYỆT\n\nDòng 2\nDòng 3', JSON.stringify(c));
ok('bỏ style/script', htmlSangChu('<style>.a{}</style><script>alert(1)</script>Chào') === 'Chào');
ok('không còn thẻ nào', !/<[a-z]/i.test(htmlSangChu('<img src=x onerror=alert(1)><b>đậm</b><iframe src="x"></iframe>')));
ok('thực thể được giải', htmlSangChu('a &amp; b &lt;c&gt; &#7899; &#x1EDB;&nbsp;x') === 'a & b <c> ớ ớ x');
ok('link giữ địa chỉ', htmlSangChu('<a href="https://rootytrip.com/">Trang chủ</a>') === 'Trang chủ (https://rootytrip.com/)');
ok('link mà chữ chính là địa chỉ thì không lặp', htmlSangChu('<a href="https://a.vn">https://a.vn</a>') === 'https://a.vn');
ok('link javascript: bị bỏ, chỉ giữ chữ', htmlSangChu('<a href="javascript:alert(1)">bấm</a>') === 'bấm');
ok('bảng thành dòng có " | "', htmlSangChu('<table><tr><td>Mục</td><td>Số tiền</td></tr><tr><td>A</td><td>1.000</td></tr></table>') === 'Mục | Số tiền\nA | 1.000');
ok('danh sách thành gạch đầu dòng', htmlSangChu('<ul><li>một</li><li>hai</li></ul>') === '- một\n- hai');

console.log('\nTách phần trích');
const lark = '<div>DUYỆT</div><div class="history-quote-wrapper" id="q"><div>Từ: Lê Văn Hùng</div><div>Kính gửi BGĐ</div></div>';
const t1 = tachTrich(lark);
ok('Lark: phần mới chỉ còn câu trả lời', t1.moi === 'DUYỆT', JSON.stringify(t1.moi));
ok('Lark: thư cũ nằm ở phần trích', /Kính gửi BGĐ/.test(t1.trich));
const t2 = tachTrich('<p>Ok</p><div class="gmail_quote">On Mon wrote:</div>');
ok('Gmail', t2.moi === 'Ok' && /On Mon/.test(t2.trich));
const t3 = tachTrich('<p>Chào anh</p>');
ok('không có trích thì phần trích rỗng', t3.moi === 'Chào anh' && t3.trich === '');

console.log('\nThư trả lời');
ok('chữ người gõ được thoát ký tự', veHtml('<b>x</b> & y') === '<p>&lt;b&gt;x&lt;/b&gt; &amp; y</p>');
ok('đoạn và xuống dòng', veHtml('a\nb\n\nc') === '<p>a<br>b</p><p>c</p>');

console.log('\nNgười gửi');
const n = tachNguoi('Phạm Quang Hậu <CEO@rootytrip.com>');
ok('tách tên và email, email viết thường', n.ten === 'Phạm Quang Hậu' && n.email === 'ceo@rootytrip.com');
ok('chỉ có email', tachNguoi('a@b.vn').email === 'a@b.vn');

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
