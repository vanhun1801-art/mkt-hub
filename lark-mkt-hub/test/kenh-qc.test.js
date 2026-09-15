/**
 * Cột "Kênh quảng cáo" trong bảng Phân quyền, và chuỗi gửi xuống app con.
 *
 * Anh Hùng chạy Facebook + TikTok, chị Hân chạy Google Ads. Anh Hùng đã chọn:
 * ô TRỐNG nghĩa là KHÔNG thấy kênh nào.
 *
 * Nhưng có một trạng thái thứ ba dễ lẫn vào "ô trống", và lẫn là cả phòng mất số
 * ngay giây deploy: CỘT CHƯA TỒN TẠI trong bảng. Lúc đó mọi ô đều đọc ra rỗng —
 * không phải vì ai khai gì, mà vì chưa có gì để khai. Quá nửa bộ test này chỉ để
 * tách hai chuyện đó ra.
 */
const quyen = require('../quyen');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

console.log('— đọc ô "Kênh quảng cáo"');
{
  const d = quyen.docKenhQC;
  t('để trống = không kênh nào', JSON.stringify(d('')) === '{"kenhQC":[],"moiKenhQC":false}');
  t('dấu * = mọi kênh', d('*').moiKenhQC === true);
  t('"tất cả" cũng là mọi kênh', d('tất cả').moiKenhQC === true);
  t('đọc đúng danh sách', JSON.stringify(d('Facebook,TikTok').kenhQC) === '["Facebook","TikTok"]');
  t('có khoảng trắng thừa vẫn đọc được',
    JSON.stringify(d(' Facebook , TikTok ').kenhQC) === '["Facebook","TikTok"]');

  /* Cột trong Base là VĂN BẢN, nên người ta gõ tay được. Gõ sai hoa thường mà
   * không chuẩn hoá thì phép so tên ở app con trượt, và người đó mất kênh mà
   * chẳng có lỗi nào hiện ra — im lặng, khó tìm. */
  t('chuẩn hoá hoa thường', JSON.stringify(d('facebook,tiktok').kenhQC) === '["Facebook","TikTok"]');
  t('chuẩn hoá cả tên hai chữ', JSON.stringify(d('google ads').kenhQC) === '["Google Ads"]');
  t('chuẩn hoá khoảng trắng thừa giữa chữ', JSON.stringify(d('Google  Ads').kenhQC) === '["Google Ads"]');
  /* Tên lạ thì GIỮ NGUYÊN, không bỏ đi: bỏ im lặng là người khai tưởng đã khai
   * xong. Giữ lại thì app con không khớp được và chuyện lộ ra. */
  t('tên lạ giữ nguyên, không nuốt mất', JSON.stringify(d('Zalo Ads').kenhQC) === '["Zalo Ads"]');

  /* Đường lùi: cột này có thể bị tạo nhầm kiểu Checkbox, giống chuyện đã xảy ra
   * với "Xem tải người khác". Boolean phải bắt riêng, không thì asText(true) ra
   * chuỗi "true" và thành một tên kênh rác. */
  t('cột lỡ tạo kiểu Checkbox: true = mọi kênh', d(true).moiKenhQC === true);
  t('và không đẻ ra tên kênh rác "true"', d(true).kenhQC.length === 0);
}

console.log('— luật chỉ BẬT khi đã có người được khai');
{
  const L = quyen.luatKenhDaBat;
  /* Đây là cái chắn giữa "thêm cột" và "cả phòng mất số". */
  t('bảng rỗng thì luật chưa bật', L([]) === false);
  t('mọi ô trống thì luật chưa bật',
    L([{ kenhQC: [], moiKenhQC: false }, { kenhQC: [], moiKenhQC: false }]) === false);
  t('có một người được khai là bật', L([{ kenhQC: [], moiKenhQC: false }, { kenhQC: ['Facebook'] }]) === true);
  t('khai * cũng là bật', L([{ moiKenhQC: true, kenhQC: [] }]) === true);
  t('không truyền gì cũng không nổ', L() === false);
}

console.log('— chuỗi gửi xuống app con');
{
  const K = quyen.kenhQuangCaoCua;
  const chuaAiKhai = [{ kenhQC: [], moiKenhQC: false }];
  const daKhai = [{ kenhQC: ['Google Ads'], moiKenhQC: false }];

  /* null và '-' KHÁC HẲN nhau, và lẫn là hỏng to:
   *   null  chưa ai khai gì -> hub KHÔNG gửi header -> app không giới hạn
   *   '-'   khai rõ "không kênh nào" -> app cấm sạch                          */
  t('chưa ai khai thì trả null (không gửi header)',
    K({ kenhQC: [], moiKenhQC: false }, chuaAiKhai) === null);
  t('luật bật + ô trống = dấu trừ', K({ kenhQC: [], moiKenhQC: false }, daKhai) === '-');
  t('luật bật + chưa có dòng nào của người này = dấu trừ', K(null, daKhai) === '-');
  t('khai * thì gửi *', K({ moiKenhQC: true, kenhQC: [] }, daKhai) === '*');
  t('khai danh sách thì gửi danh sách',
    K({ kenhQC: ['Facebook', 'TikTok'] }, daKhai) === 'Facebook,TikTok');
  /* Chưa bật luật thì KHÔNG gửi gì, kể cả khi người này chưa có dòng nào. */
  t('chưa bật luật thì người chưa có dòng cũng không bị cấm', K(null, chuaAiKhai) === null);
}

console.log('— hub truyền header, và xoá header client tự gửi');
{
  const fs = require('fs');
  const path = require('path');
  const px = fs.readFileSync(path.join(__dirname, '..', 'proxy.js'), 'utf8');

  /* Xoá trước khi ghi lại: không xoá thì ai cũng tự đặt x-hub-perm-kenh: * trong
   * trình duyệt và xem hết mọi kênh. Cả cơ chế phân quyền sập ở đúng dòng này. */
  t('xoá header client tự gửi', /'x-hub-perm-kenh'\]?\s*$|x-hub-perm-kenh'[,\]]/m.test(px)
    && px.includes("'x-hub-perm-kenh'"));
  const iXoa = px.indexOf('delete opts.headers[h]');
  const khoiXoa = px.slice(Math.max(0, iXoa - 400), iXoa);
  t('và xoá trong đúng khối delete', khoiXoa.includes('x-hub-perm-kenh'));

  /* Chỉ gửi khi có gì để nói — `if (nguoi.kenhQC)` lọc luôn cả null lẫn chuỗi
   * rỗng, nên "chưa ai khai" thì không có header nào đi xuống. */
  t('chỉ gửi khi hub thật sự có gì để nói',
    /if \(nguoi\.kenhQC\) opts\.headers\['x-hub-perm-kenh'\] = nguoi\.kenhQC;/.test(px));
  t('đường header thứ hai cũng gửi', /if \(nguoi\.kenhQC\) h\['x-hub-perm-kenh'\] = nguoi\.kenhQC;/.test(px));

  const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  /* Giới hạn kênh KHÔNG nới cho quản lý: vai quản lý nói về việc được sửa cấu
   * hình, không phải về việc theo dõi kênh của ai. Anh Hùng vẫn là quản lý mà
   * chỉ muốn nhìn Facebook với TikTok. */
  t('quyenCua có tính kenhQC', /kenhQC = quyen\.kenhQuangCaoCua\(hang, bang\)/.test(sv));
  t('và không nới cho quản lý', !/quanLy.*\|\|.*kenhQC|kenhQC.*quanLy \?/.test(sv));
}

console.log('— ghi xuống Base đúng quy ước');
{
  const fs = require('fs');
  const path = require('path');
  const q = fs.readFileSync(path.join(__dirname, '..', 'quyen.js'), 'utf8');
  t('ghi * khi chọn mọi kênh',
    /\[F\.kenhQC\]: hang\.moiKenhQC \? '\*' : \(hang\.kenhQC \|\| \[\]\)\.join\(','\)/.test(q));
  /* Bảng của người dùng có thể chưa có cột này. Ghi vào cột không tồn tại là
   * Lark trả lỗi và mất luôn cả bản ghi — đã có B.locCotThat lo chuyện đó. */
  t('vẫn đi qua bộ lọc cột thật', /locCotThat\(cells, 'phân quyền'\)/.test(q));
}

console.log('— panel phải chỉ ĐÚNG kiểu cột khi bảng còn thiếu');
{
  const fs = require('fs');
  const path = require('path');
  /* "Kênh quảng cáo" là cột VĂN BẢN. Panel bản trước ghi cứng "thêm cột kiểu
   * Checkbox" cho mọi cột thiếu — và tạo nhầm Checkbox ở đúng cột này thì tick
   * vào lại đọc ra `true`, tức MỌI KÊNH: ngược hẳn ý người khai, mà không báo
   * gì. Chỉ sai đường ở đúng chỗ người ta đang cần được chỉ đường. */
  t('có bảng kiểu cột', !!quyen.KIEU_COT);
  t('Kênh quảng cáo là Văn bản', quyen.KIEU_COT[quyen.F.kenhQC] === 'Văn bản',
    quyen.KIEU_COT[quyen.F.kenhQC]);
  t('Xem chi phí vẫn là Checkbox', quyen.KIEU_COT[quyen.F.chiPhi] === 'Checkbox');
  t('Base được xem là Văn bản', quyen.KIEU_COT[quyen.F.base] === 'Văn bản');
  t('mọi cột đều khai kiểu', Object.values(quyen.F).every((c) => !!quyen.KIEU_COT[c]),
    Object.values(quyen.F).filter((c) => !quyen.KIEU_COT[c]).join(', '));

  const pq = fs.readFileSync(path.join(__dirname, '..', 'public', 'quyen.js'), 'utf8');
  t('panel không còn ghi cứng Checkbox', !/thêm cột kiểu Checkbox/.test(pq));
  t('panel in kiểu kèm tên cột', /kieu\[c\]/.test(pq));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
