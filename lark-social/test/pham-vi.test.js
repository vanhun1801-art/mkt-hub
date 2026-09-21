'use strict';
/* Test thuần Node: `node test/pham-vi.test.js`. */
const assert = require('assert');
const pv = require('../pham-vi');

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

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
