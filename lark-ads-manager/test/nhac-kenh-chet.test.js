/**
 * Nhắn qua Lark khi có kênh chết — anh Hùng chốt bật ngày 07/10/2026.
 *
 * Bối cảnh: Google Ads chết từ 23/09 ("The provided client secret is invalid")
 * và im 14 ngày. Một trong hai lý do im là bộ nhắc TẮT — mà nó tắt theo kiểu
 * không ai sửa được: `nhacNho` còn chẳng có trong DEFAULT của ketnoi.js, nên
 * `caiDatNhac().bat` luôn là false dù cấu hình thế nào.
 *
 * Lý do thứ hai, âm thầm hơn: hàm gửi cũ gọi lark-cli với `--as user`, tức là
 * mượn phiên đăng nhập cá nhân. Trên Render không có phiên nào — mà Render mới
 * là chỗ cần nhắc nhất. Giờ đi chung đường với bản tin 8:00
 * (lark-chung/gui-anh-hung.js), đường đó tự lo cả hai môi trường.
 */
const g = require('../giam-sat');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const tt = (o = {}) => ({
  khoe: false, coLoiNang: true,
  van_de: [{ loai: 'ket-noi', nang: true, kenh: 'Google Ads',
    mo_ta: 'Google Ads: Google từ chối cấp access token: The provided client secret is invalid.' }],
  nenTangSong: ['Facebook', 'TikTok'],
  moiNhat: { Facebook: '2026-10-07', TikTok: '2026-10-07', 'Google Ads': '2026-09-23', '(chưa gán)': '2026-08-26' },
  luc: new Date().toISOString(), ...o,
});

console.log('— bật mặc định, và tắt được bằng biến môi trường');
{
  const cu = process.env.ADS_NHAC_TAT;
  delete process.env.ADS_NHAC_TAT;
  t('mặc định BẬT', g.caiDatNhac().bat === true, String(g.caiDatNhac().bat));
  process.env.ADS_NHAC_TAT = '1';
  t('ADS_NHAC_TAT=1 thì tắt', g.caiDatNhac().bat === false);
  if (cu == null) delete process.env.ADS_NHAC_TAT; else process.env.ADS_NHAC_TAT = cu;

  /* Không được đòi open_id nữa — đó là lý do cũ khiến nó im ("chưa khai người
   * nhận"), và trên Render thì chẳng ai vào khai được. */
  t('không còn đòi khai người nhận', !('nguoiNhan' in g.caiDatNhac()),
    JSON.stringify(g.caiDatNhac()));
}

console.log('— thẻ nói đủ ba điều: kênh nào, vì sao, Base dừng ngày nào');
{
  const c = g.dungThe(tt());
  const chu = JSON.stringify(c);
  t('tiêu đề nói đang hỏng', /đang HỎNG/.test(c.header.title.content), c.header.title.content);
  t('hỏng nặng thì thẻ đỏ', c.header.template === 'red', c.header.template);
  t('nêu tên kênh chết', /Google Ads/.test(chu));
  t('nêu nguyên văn lý do', /client secret is invalid/.test(chu));
  t('kèm ngày mới nhất của từng kênh', /2026-09-23/.test(chu) && /2026-10-07/.test(chu));
  t('chỉ chỗ đi sửa', /Kết nối/.test(chu));

  /* `mo_ta` đã mở đầu bằng tên kênh, in thêm tên nữa là "Google Ads — Google
   * Ads: ...". Đọc trên điện thoại rất chướng. */
  t('không lặp tên kênh hai lần',
    !/Google Ads\*\* — Google Ads:/.test(c.elements[0].content), c.elements[0].content);

  /* Kênh "(chưa gán)" là dòng rác trong Base, đừng đưa vào tin nhắn. */
  t('bỏ dòng (chưa gán)', !/chưa gán/.test(chu));
}

console.log('— khoẻ thì vẫn báo, nhưng báo khác hẳn');
{
  const c = g.dungThe(tt({ khoe: true, coLoiNang: false, van_de: [] }));
  t('thẻ xanh', c.header.template === 'green', c.header.template);
  t('nói đã bình thường trở lại', /bình thường/.test(JSON.stringify(c)));
  t('không còn chấm đỏ nào', !/🔴/.test(JSON.stringify(c)));
}

console.log('— vấn đề nhẹ thì cam, không phải đỏ');
{
  const c = g.dungThe(tt({ coLoiNang: false,
    van_de: [{ loai: 'du-lieu', nang: false, kenh: 'TikTok', mo_ta: 'TikTok: số mới nhất trong Base là 2026-10-01 — trễ 6 ngày' }] }));
  t('thẻ cam', c.header.template === 'orange', c.header.template);
  t('dùng dấu cam', /🟠/.test(JSON.stringify(c)));
  t('vẫn đậm tên kênh', /\*\*TikTok\*\*/.test(JSON.stringify(c)));
}

console.log('— chống gửi trùng và chống làm phiền');
{
  /* Chữ ký dựng từ (loại × kênh), nên cùng một vấn đề kéo dài không đổi chữ ký
   * — đó là cái giữ cho nó không nhắn mỗi giờ. */
  const a = g.chuKy(tt());
  const b = g.chuKy(tt({ moiNhat: {} }));
  t('chữ ký không đổi khi chỉ số liệu đổi', a === b, `${a} / ${b}`);
  const c = g.chuKy(tt({ van_de: [{ loai: 'token', nang: true, kenh: 'Facebook / Meta', mo_ta: 'x' }] }));
  t('vấn đề khác thì chữ ký khác', a !== c);
  t('khoẻ thì chữ ký rỗng', g.chuKy(tt({ van_de: [] })) === '');

  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'giam-sat.js'), 'utf8');
  /* Lượt hẹn giờ chạy mỗi giờ VÀ có cơ chế thử lại sau 60 giây — không có khoá
   * chống trùng thì một vấn đề thành hai tin giống hệt nhau. */
  t('có khoá chống gửi trùng', /khoa: 'qc-suc-khoe-'|khoa = 'qc-suc-khoe-/.test(src));
  t('khoá gắn theo giờ', /toISOString\(\)\.slice\(0, 13\)/.test(src));
  t('vẫn giữ mốc im lặng', /imLangGio/.test(src));

  /* Đường gửi phải là đường chung, không phải lark-cli --as user. */
  t('gửi qua lark-chung/gui-anh-hung', /lark-chung\/gui-anh-hung/.test(src));
  t('bỏ hẳn cách gửi mượn phiên cá nhân', !/'--as', 'user'/.test(src));
  t('ghi lại vì sao bỏ', /Render không gửi được/.test(src));
}

console.log('— bộ hẹn giờ truyền được cli để chạy lẻ ngoài hub');
{
  const idx = require('fs').readFileSync(require('path').join(__dirname, '..', 'sync', 'index.js'), 'utf8');
  t('truyền cli vào chay()', /giamSat\.chay\(\{ cli:/.test(idx));
  t('và chịu được khi không có cli', /larkMod\.cli \|\| null/.test(idx));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
