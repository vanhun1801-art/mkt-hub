'use strict';
/* Test thuần Node: `node test/pham-vi.test.js`. */
const assert = require('assert');
const pv = require('../pham-vi');
const Q = require('../quyen');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

const kenh = (extId, viewers) => ({ extId, name: extId, viewers });
const ai = (email) => ({ email });

console.log('\nphạm vi — đọc danh sách email');

t('chịu mọi kiểu ngăn cách người ta hay gõ', () => {
  assert.deepStrictEqual(pv.tachEmail('a@x.com, b@x.com'), ['a@x.com', 'b@x.com']);
  assert.deepStrictEqual(pv.tachEmail('a@x.com;b@x.com'), ['a@x.com', 'b@x.com']);
  assert.deepStrictEqual(pv.tachEmail('a@x.com\nb@x.com'), ['a@x.com', 'b@x.com']);
  assert.deepStrictEqual(pv.tachEmail('  A@X.COM  '), ['a@x.com'], 'không phân biệt hoa thường');
});

t('bỏ qua chuỗi không phải email', () => {
  assert.deepStrictEqual(pv.tachEmail('Nguyễn Văn A, b@x.com'), ['b@x.com']);
  assert.deepStrictEqual(pv.tachEmail(''), []);
  assert.deepStrictEqual(pv.tachEmail(null), []);
});

console.log('\nphạm vi — ai xem được gì');

t('kênh CHƯA khai ai thì ai cũng xem được', () => {
  /* Mười một kênh đang trống. Mặc định "không ai xem được" thì ngay khi tính
     năng lên, cả phòng mở app ra thấy trắng trơn và không hiểu vì sao. */
  assert.strictEqual(pv.xemDuoc(kenh('a', ''), ai('x@rootytrip.com')), true);
  assert.strictEqual(pv.xemDuoc(kenh('a', null), ai('x@rootytrip.com')), true);
});

t('kênh đã khai thì chỉ người trong danh sách', () => {
  const k = kenh('a', 'hoa@rootytrip.com, lan@rootytrip.com');
  assert.strictEqual(pv.xemDuoc(k, ai('hoa@rootytrip.com')), true);
  assert.strictEqual(pv.xemDuoc(k, ai('HOA@RootyTrip.com')), true, 'hoa thường không quan trọng');
  assert.strictEqual(pv.xemDuoc(k, ai('minh@rootytrip.com')), false);
});

t('đã khai mà không biết người xem là ai thì ĐÓNG', () => {
  /* Hub không gửi email xuống (chưa đăng nhập, hoặc chạy ngoài hub) — thà không
     cho xem còn hơn mở toang một kênh đã được giao riêng. */
  const k = kenh('a', 'hoa@rootytrip.com');
  assert.strictEqual(pv.xemDuoc(k, {}), false);
  assert.strictEqual(pv.xemDuoc(k, null), false);
});

t('quản lý thấy tất cả, kể cả kênh đã giao cho người khác', () => {
  const ds = [kenh('a', 'hoa@x.com'), kenh('b', 'lan@x.com')];
  assert.strictEqual(pv.kenhCuaNguoi(ds, ai('minh@x.com'), true).length, 2);
  assert.strictEqual(pv.kenhCuaNguoi(ds, ai('minh@x.com'), false).length, 0);
});

console.log('\nphạm vi — giới hạn truy vấn');

t('chưa kênh nào bị khoá thì không giới hạn gì', () => {
  /* Trả null chứ không trả danh sách đủ: null nghĩa là "khỏi lọc", nhanh hơn và
     không đụng gì tới hành vi cũ. */
  assert.strictEqual(pv.gioiHan([kenh('a', ''), kenh('b', '')], ai('x@x.com'), false), null);
});

t('quản lý không bao giờ bị giới hạn', () => {
  assert.strictEqual(pv.gioiHan([kenh('a', 'hoa@x.com')], ai('minh@x.com'), true), null);
});

t('nhân sự chỉ nhận extId của kênh mình', () => {
  const ds = [kenh('a', 'hoa@x.com'), kenh('b', 'lan@x.com'), kenh('c', '')];
  assert.deepStrictEqual(pv.gioiHan(ds, ai('hoa@x.com'), false).sort(), ['a', 'c'],
    'kênh chưa khai ai vẫn xem được');
});

console.log('\nphạm vi — chốt ở máy chủ');

t('người dùng chọn kênh ngoài phần mình thì bị loại', () => {
  /* Giao diện đã lọc sẵn, nhưng giao diện là thứ sửa được. Gọi thẳng API với
     tên kênh ngoài phần mình vẫn phải ra rỗng. */
  assert.deepStrictEqual(pv.ganLoc(['a', 'z'], ['a', 'c']), ['a']);
  assert.deepStrictEqual(pv.ganLoc(['z'], ['a', 'c']), [], 'chọn toàn kênh lạ thì không còn gì');
});

t('không chọn gì thì mặc định là trọn phần của mình', () => {
  assert.deepStrictEqual(pv.ganLoc([], ['a', 'c']), ['a', 'c']);
});

t('không có giới hạn thì giữ nguyên lựa chọn', () => {
  assert.deepStrictEqual(pv.ganLoc(['a'], null), ['a']);
  assert.deepStrictEqual(pv.ganLoc([], null), []);
});

t('Khách hỏi mở cho nhân sự, nhưng bó theo kênh của họ', () => {
  /* Người trực kênh mới là người cần biết khách hỏi gì — bắt họ đi hỏi quản lý
     thì lỡ mất khách. Nhưng màn hình này gọi thẳng API Facebook, nên không bó
     lại là nhân sự quét được cả Trang không thuộc phần mình. */
  const src = require('fs').readFileSync(require.resolve('../server'), 'utf8');
  const i = src.indexOf("p === '/api/binh-luan'");
  const khuc = src.slice(i, i + 700);
  assert.ok(!/chanNeuKhongPhaiQuanLy/.test(khuc), 'không còn chặn hẳn nhân sự');
  assert.ok(/chiTrang: gh/.test(khuc), 'phải truyền phạm vi kênh xuống bộ quét');

  const bl = require('fs').readFileSync(require.resolve('../binh-luan'), 'utf8');
  assert.ok(/chiTrang && !chiTrang\.has\(String\(page\.id\)\)/.test(bl),
    'bộ quét phải bỏ qua Trang ngoài phạm vi');
  assert.ok(/opts\.chiTrang\) && opts\.chiTrang\.length/.test(bl),
    'bỏ trống thì không giới hạn — quản lý, hoặc chưa kênh nào khai người xem');
});

t('chỉ còn Nhập tay là tab đóng với nhân sự', () => {
  /* Nhập tay đóng vì nó ghi thẳng vào bảng số liệu — quyền SỬA, không phải quyền
     XEM. Khách hỏi và Nhật ký đều mở, nhưng mở kèm giới hạn chứ không mở suông:
     Khách hỏi bó theo Trang, Nhật ký thì nhân sự chỉ thấy phần "Đã đăng gì". */
  const ui = require('fs').readFileSync(require.resolve('../public/app.js'), 'utf8');
  assert.ok(/\['nhap-tay', 'Nhập tay', true\]/.test(ui), 'Nhập tay phải còn cờ chỉ quản lý');
  assert.ok(/\['nhat-ky', 'Nhật ký'\]/.test(ui), 'Nhật ký KHÔNG còn cờ đó');
  assert.ok(/\['binh-luan', 'Khách hỏi'\]/.test(ui), 'Khách hỏi KHÔNG còn cờ đó');
  /* Phần nhật ký đồng bộ trong tab đó vẫn phải bọc sau cổng quản lý. */
  /* Nhân sự KHÔNG được gọi /api/nhat-ky — cổng nằm ngay chỗ gọi, không phải
     chỗ vẽ, để họ đỡ tốn một lượt gọi vô ích và máy chủ đỡ đọc cả bảng. */
  assert.ok(ui.includes("S.quanLy ? goi('/api/nhat-ky')"),
    'lượt gọi /api/nhat-ky phải nằm sau điều kiện S.quanLy');
  assert.ok(ui.includes('if (S.quanLy && r) {'), 'và chỉ vẽ khi thật sự có dữ liệu');
});

t('màn hình "Đã đăng gì" lấy từ bảng Bài đăng, không phải bảng Nhật ký', () => {
  /* Mở nhật ký cho nhân sự nhưng CHỈ phần "ai đăng gì", không phải phần vận
     hành của máy. Lấy từ bảng Bài đăng là tự bó theo kênh của từng người —
     nếu đọc bảng Nhật ký rồi lọc sau thì phải nhớ lọc, mà quên một chỗ là lòi
     caption của kênh họ không được xem. */
  const src = require('fs').readFileSync(require.resolve('../server'), 'utf8');
  const i = src.indexOf("p === '/api/hoat-dong'");
  assert.ok(i > 0, 'phải có endpoint riêng');
  const khuc = src.slice(i, i + 800);
  assert.ok(/hanMucKenh\(req\)/.test(khuc), 'phải bó theo phạm vi kênh');
  assert.ok(/M\.topBai\(d\.posts/.test(khuc), 'nguồn là bảng Bài đăng');
  assert.ok(!/T\.log\.id/.test(khuc), 'không được đụng vào bảng Nhật ký');

  /* Còn bảng Nhật ký thật thì vẫn chỉ quản lý. */
  const j = src.indexOf("p === '/api/nhat-ky'");
  assert.ok(/chanNeuKhongPhaiQuanLy/.test(src.slice(j, j + 600)), 'nhật ký đồng bộ vẫn đóng');
});

t('khai theo NGƯỜI: chuyển trục ở máy chủ, không bắt giao diện tự cộng trừ', () => {
  /* Bảng trong Base lưu theo kênh (mỗi kênh một danh sách email), còn người
     dùng nghĩ theo người ("Ngọc xem những kênh nào"). Làm ở giao diện thì mỗi
     lần lưu phải đọc lại 11 kênh rồi cộng trừ email — quên một kênh là âm thầm
     gán sai, mà không ai thấy. */
  const src = require('fs').readFileSync(require.resolve('../server'), 'utf8');
  const i = src.indexOf("p === '/api/kenh/nguoi-xem-cua'");
  assert.ok(i > 0, 'phải có endpoint khai theo người');
  const khuc = src.slice(i, i + 1200);
  assert.ok(/chanNeuKhongPhaiQuanLy/.test(khuc), 'chỉ quản lý');
  assert.ok(/if \(co === can\) return;/.test(khuc), 'không đổi thì đừng ghi lại kênh đó');
  assert.ok(/lark\.updateMany/.test(khuc), 'ghi một lượt, không từng kênh một');
  assert.ok(/store\.xoaCache\(\)/.test(khuc), 'phải xoá đệm, không thì màn hình còn số cũ');
});

t('hộp thoại trong app Social chỉ để XEM, không khai nữa', () => {
  /* Giữ cả hai chỗ khai là quay lại đúng vấn đề ban đầu: hai màn hình cùng sửa
     một thứ, và người dùng không biết mở cái nào. Chỗ khai chuyển hẳn sang
     Phân quyền của Hub — ở đó khai theo NGƯỜI và tick bằng ô vuông, không phải
     gõ email vào từng dòng kênh. Gõ sai một ký tự là kênh đó thành "chỉ người
     không tồn tại xem được", mà nhìn ô vẫn thấy có chữ nên tưởng đã khai đúng. */
  const ui = require('fs').readFileSync(require.resolve('../public/app.js'), 'utf8');
  const i = ui.indexOf('async function moPhanQuyen()');
  const khuc = ui.slice(i, i + 2000);
  assert.ok(!/pq-in/.test(khuc), 'không còn ô nhập email');
  assert.ok(!/nguoi-xem/.test(khuc), 'không còn gọi API ghi');
  assert.ok(/Marketing Hub/.test(khuc), 'phải chỉ đường sang chỗ khai thật');
});


t('nhân sự KHÔNG được thấy con số tiền', () => {
  /* Anh Hùng 28/09/2026: "nhân sự không cho thấy doanh thu nhé em". */
  const cfgApi = { mode: 'api' };
  const ns = { headers: {} };
  assert.strictEqual(Q.duocXemTien(ns, cfgApi, {}), false, 'nhân sự thường');
  assert.strictEqual(
    Q.duocXemTien({ headers: { 'x-hub-user-manager': '1' } }, cfgApi, {}), true, 'quản lý');
  /* Dùng lại đúng quyền "Xem chi phí" có sẵn của hub, không đẻ quyền thứ hai
     cùng nghĩa để rồi hai chỗ lệch nhau. */
  assert.strictEqual(
    Q.duocXemTien({ headers: { 'x-hub-perm-chi-phi': '1' } }, cfgApi, {}), true,
    'nhân sự ĐƯỢC cấp quyền Xem chi phí');
});

t('cổng mở ra ngoài thì không tin header của ai', () => {
  /* Cùng lý do với laQuanLy: HUB_TRUST_HEADER=0 nghĩa là app không còn nấp sau
     hub nữa, client tự đặt header gì cũng được. */
  assert.strictEqual(
    Q.duocXemTien({ headers: { 'x-hub-perm-chi-phi': '1' } }, { mode: 'api' },
      { HUB_TRUST_HEADER: '0' }), false);
  assert.strictEqual(
    Q.duocXemTien({ headers: { 'x-hub-user-manager': '1' } }, { mode: 'api' },
      { HUB_TRUST_HEADER: '0' }), false);
});

t('máy cá nhân thì xem được — chốt ở đó không bảo vệ được gì', () => {
  assert.strictEqual(Q.duocXemTien({ headers: {} }, { mode: 'cli' }, {}), true);
});

t('máy chủ XOÁ HẲN con số tiền, không chỉ giấu cột', () => {
  /* Giấu ở giao diện thì số vẫn nằm trong phản hồi JSON, mở tab Network của
     trình duyệt là đọc được — mà thứ phải giấu ở đây là doanh thu. */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(src.includes('revenue: null'), 'doanh thu phiên LIVE phải bị xoá');
  assert.ok(src.includes('usd: null'), 'tiền quà TikTok phải bị xoá');
  assert.ok(/xemTien: duocXemTien\(req\)/.test(src), 'và phải nói cho giao diện biết');
  /* Hai bảng, hai mảng — lọc một quên một là cột kia vẫn lòi tiền ra. */
  assert.strictEqual((src.match(/\.map\(loc\)/g) || []).length, 2,
    'phải lọc CẢ hai mảng: phiên LIVE và LIVE theo ngày');

  /* Giao diện: thiếu cờ thì hiểu là KHÔNG được xem. Cờ quyền mà mặc định "được"
     là kiểu sai âm thầm — máy chủ cũ không gửi cờ thì cột tiền hiện ra với toàn
     số 0, trông như doanh thu bằng không. */
  const ui = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.ok(ui.includes('S.xemTien = me.xemTien === true;'), 'mặc định là không được xem');
  assert.ok(ui.includes("...(S.xemTien ? [{ t: 'Doanh thu'"), 'cột Doanh thu có điều kiện');
  assert.ok(ui.includes("...(S.xemTien ? [{ t: 'Quà (USD)'"), 'cột Quà (USD) có điều kiện');
});

console.log('\nphạm vi — lọc dòng số liệu theo kênh');

/* Dòng số liệu thật mang CẢ HAI khoá: `channelIds` là record id của bảng Kênh,
   `channelExtId` là id của nền tảng. gioiHan() trả về extId, nên phải so với
   channelExtId. Dựng cả hai khoá trong dữ liệu thử để bài test bắt được đúng
   lỗi so nhầm khoá. */
const dongSo = (extId) => ({ channelExtId: extId, channelIds: ['recXXX'], luotXem: 1 });

t('lọc theo extId, không theo record id', () => {
  const loc = pv.boLocKenh(['ext-a', 'ext-b']);
  assert.strictEqual(loc(dongSo('ext-a')), true);
  assert.strictEqual(loc(dongSo('ext-c')), false);
});

t('không giới hạn thì cho qua hết', () => {
  const loc = pv.boLocKenh(null);
  assert.strictEqual(loc(dongSo('bat-ky')), true);
  assert.strictEqual(loc({}), true);
});

t('hạn mức RỖNG nghĩa là không kênh nào, không phải mọi kênh', () => {
  /* Người chưa được khai ở kênh nào thì thấy trắng — đúng. Nhầm chỗ này thành
     "rỗng = không lọc" là mở sạch số của cả phòng cho người ngoài. */
  const loc = pv.boLocKenh([]);
  assert.strictEqual(loc(dongSo('ext-a')), false);
});

t('dòng không gắn kênh thì không lọt qua hạn mức', () => {
  const loc = pv.boLocKenh(['ext-a']);
  assert.strictEqual(loc({ luotXem: 9 }), false);
  assert.strictEqual(loc(null), false);
});

t('đi hết một vòng: Khánh được khai kênh nào thì thấy đúng kênh ấy', () => {
  /* Lỗi thật 08/10/2026: tab LIVE trên máy Khánh trắng trơn trong khi máy
     trưởng phòng đủ số. Nguyên nhân là server gọi `han.map((c) => c.id)` lên
     mảng CHUỖI extId, ra Set([undefined]) nên mọi dòng đều rớt. Bài test này
     đi đúng đường đó: gioiHan() → boLocKenh() → lọc dòng. */
  const channels = [
    { id: 'rec1', extId: 'ext-tt1', name: 'Rooty Trip', viewers: 'khanh@x.com, sep@x.com' },
    { id: 'rec2', extId: 'ext-tt2', name: 'Cuộc sống', viewers: 'khanh@x.com, sep@x.com' },
    { id: 'rec3', extId: 'ext-tt3', name: 'Vi Vu', viewers: 'sep@x.com' },
  ];
  const han = pv.gioiHan(channels, { email: 'khanh@x.com' }, false);
  assert.deepStrictEqual(han, ['ext-tt1', 'ext-tt2'], 'gioiHan trả về extId dạng chuỗi');

  const ds = [dongSo('ext-tt1'), dongSo('ext-tt2'), dongSo('ext-tt3')];
  assert.strictEqual(ds.filter(pv.boLocKenh(han)).length, 2, 'Khánh thấy hai kênh');
  assert.strictEqual(ds.filter(pv.boLocKenh(pv.gioiHan(channels, { email: 'sep@x.com' }, true)))
    .length, 3, 'trưởng phòng thấy cả ba');
});

t('không còn chỗ nào so hạn mức kênh bằng record id', () => {
  /* hanMucKenh() trả về mảng CHUỖI extId. Viết `han.some((c) => c.id === i)`
     lên mảng chuỗi thì `c.id` luôn undefined, điều kiện luôn đúng, và mọi
     nhân sự ăn 403 — trưởng phòng không bị giới hạn nên không ai thấy.

     Đã dính BA lần: tab LIVE trắng trơn, gắn nhãn LIVE theo ngày, và gán người
     đăng cho bài. Mọi chỗ nay phải đi qua phamVi.boLocKenh(). */
  const src = require('fs').readFileSync(require.resolve('../server'), 'utf8');
  const ma = src.split('\n')
    .filter((d) => !/^\s*(\*|\/\*|\/\/)/.test(d))
    .join('\n');
  const xau = ma.match(/han\w*\.some\(\([^)]*\)\s*=>\s*\w+\.id\s*===/g) || [];
  assert.deepStrictEqual(xau, [], 'còn chỗ so bằng .id trên mảng extId');

  const xau2 = ma.match(/han\w*\.map\(\([^)]*\)\s*=>\s*\w+\.id\)/g) || [];
  assert.deepStrictEqual(xau2, [], 'còn chỗ map .id trên mảng extId');
});

t('mọi chốt phạm vi kênh đều gọi boLocKenh', () => {
  const src = require('fs').readFileSync(require.resolve('../server'), 'utf8');
  const soChan = (src.match(/chưa giao cho bạn/g) || []).length;
  const soLoc = (src.match(/phamVi\.boLocKenh\(/g) || []).length;
  assert.ok(soLoc >= soChan,
    'có ' + soChan + ' chỗ chặn theo kênh nhưng chỉ ' + soLoc + ' chỗ gọi boLocKenh');
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
