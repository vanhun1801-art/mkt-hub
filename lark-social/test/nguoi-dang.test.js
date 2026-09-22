'use strict';
const assert = require('assert');
const N = require('../nguoi-dang');

let dat = 0; let hong = 0;
function t(ten, fn) {
  try { fn(); dat++; console.log('  ✓ ' + ten); } catch (e) {
    hong++; console.log('  ✗ ' + ten); console.log('    ' + e.message);
  }
}

console.log('nguoi-dang — rút ID từ link');

t('ba dạng link thật trong Base đều rút được ID', () => {
  /* Số liệu thật: 1.001 bài /reel/, 558 bài /posts/, 43 bài /videos/. */
  assert.strictEqual(N.idTuLink('https://www.facebook.com/reel/1449888943621106/'), '1449888943621106');
  assert.strictEqual(N.idTuLink('https://www.facebook.com/1510257614463542/videos/1060177736883984'), '1060177736883984');
  assert.strictEqual(N.idTuLink('https://www.facebook.com/1510257614463542/posts/1508465481309422'), '1508465481309422');
});

t('link chia sẻ dạng story_fbid cũng rút được', () => {
  assert.strictEqual(
    N.idTuLink('https://www.facebook.com/permalink.php?story_fbid=1508465481309422&id=1510257614463542'),
    '1508465481309422');
});

t('không nhầm ID Trang thành ID bài', () => {
  /* Link /videos/ có ID Trang đứng trước ID bài. Bắt nhầm cái đầu là ghép
     toàn bộ bài của một Trang vào cùng một người. */
  assert.strictEqual(N.idTuLink('https://www.facebook.com/1510257614463542/videos/1060177736883984'), '1060177736883984');
  assert.strictEqual(N.idTuLink('https://www.facebook.com/rootytrip1/videos/938806172109763'), '938806172109763');
});

t('link rác thì trả rỗng, không đoán bừa', () => {
  ['', null, 'https://www.facebook.com/rootytrip1', 'https://tiktok.com/@x/video/123'].forEach((u) => {
    assert.strictEqual(N.idTuLink(u), '', String(u));
  });
});

console.log('\nnguoi-dang — ghép với bài trong Base');

const BAI = [
  { id: 'r1', key: 'Facebook#a_1', platform: 'Facebook', url: 'https://www.facebook.com/reel/111111111111/', poster: '' },
  { id: 'r2', key: 'Facebook#a_2', platform: 'Facebook', url: 'https://www.facebook.com/page/posts/222222222222', poster: 'Võ Hằng' },
  { id: 'r3', key: 'TikTok#x', platform: 'TikTok', url: 'https://tiktok.com/@x/video/333333333333', poster: '' },
];

t('ghép đúng bài và bỏ qua bài đã đúng người', () => {
  const r = N.ghep([
    { link: 'https://www.facebook.com/reel/111111111111/?mibextid=abc', nguoi: 'Phương Ái' },
    { link: 'https://www.facebook.com/page/posts/222222222222', nguoi: 'Võ Hằng' },
  ], BAI);
  assert.strictEqual(r.capNhat.length, 1);
  assert.strictEqual(r.capNhat[0].id, 'r1');
  assert.strictEqual(r.capNhat[0].nguoi, 'Phương Ái');
});

t('tham số thừa trong link không làm hỏng việc ghép', () => {
  /* Link copy từ Facebook luôn kèm ?mibextid=…&rdid=… Cắt theo chuỗi thì trượt,
     nên phải rút ID chứ không so cả URL. */
  const r = N.ghep([{ link: 'https://www.facebook.com/reel/111111111111/?rdid=zz&share_url=yy', nguoi: 'Lý Thư Bạch' }], BAI);
  assert.strictEqual(r.capNhat.length, 1);
});

t('bài không có trong Base thì báo ra, không im lặng bỏ', () => {
  const r = N.ghep([{ link: 'https://www.facebook.com/reel/999999999999/', nguoi: 'Võ Hằng' }], BAI);
  assert.strictEqual(r.capNhat.length, 0);
  assert.strictEqual(r.khongKhop.length, 1);
});

t('tên lạ thì KHÔNG ghi, và phải báo ra', () => {
  /* Cột trong Base là dạng chọn. Ghi tên ngoài danh sách thì hoặc Lark từ chối,
     hoặc tệ hơn là sinh thêm lựa chọn rác rồi KPI đếm nhầm thành người mới. */
  const r = N.ghep([{ link: 'https://www.facebook.com/reel/111111111111/', nguoi: 'Nguyễn Văn X' }], BAI);
  assert.strictEqual(r.capNhat.length, 0);
  assert.strictEqual(r.tenLa.length, 1);
  assert.strictEqual(r.tenLa[0].nguoi, 'Nguyễn Văn X');
});

t('một bài gửi hai lần trong cùng lượt thì chỉ ghi một', () => {
  const r = N.ghep([
    { link: 'https://www.facebook.com/reel/111111111111/', nguoi: 'Phương Ái' },
    { link: 'https://www.facebook.com/reel/111111111111/', nguoi: 'Phương Ái' },
  ], BAI);
  assert.strictEqual(r.capNhat.length, 1);
});

t('người khác với người đang có thì GHI ĐÈ', () => {
  /* Màn hình Facebook là nguồn thật; cột trong Base có thể do ai đó gán nhầm. */
  const r = N.ghep([{ link: 'https://www.facebook.com/page/posts/222222222222', nguoi: 'Phương Ái' }], BAI);
  assert.strictEqual(r.capNhat.length, 1);
  assert.strictEqual(r.capNhat[0].cu, 'Võ Hằng');
});

t('bảng tra bỏ qua bài không phải Facebook', () => {
  assert.strictEqual(N.banhTra(BAI).has('333333333333'), false);
});

console.log('\nnguoi-dang — khớp theo caption khi link là pfbid');

const BAI2 = [
  { id: 'p1', key: 'Facebook#a_9', platform: 'Facebook',
    url: 'https://www.facebook.com/reel/1113010908066256/', poster: '',
    title: 'Trúng kế VinWonders rồi... 💔🥹 #VinWonders #thuycung #RootyTrip #tienca' },
  { id: 'p2', key: 'Facebook#a_8', platform: 'Facebook',
    url: 'https://www.facebook.com/reel/222222222222/', poster: '',
    title: 'Một ngày Lễ Quốc khánh cực kỳ trọn vẹn tại VinWonders Phú Quốc' },
];

t('link pfbid không có ID số thì khớp bằng caption', () => {
  /* Link trong feed hay ở dạng pfbid0… — mã mờ, không đối chiếu được với Base.
     Nhưng khối bài trên màn hình luôn chứa caption. */
  const van = 'Rooty Trip Phú QuốcNgười đăng: Phương Ái10 Tháng 9 lúc 16:06'
    + 'Trúng kế VinWonders rồi... 💔🥹 #VinWonders #thuycung #RootyTrip';
  const r = N.ghep([{ link: 'https://www.facebook.com/RootyTrip/posts/pfbid0abcXYZ', nguoi: 'Phương Ái', van }], BAI2);
  assert.strictEqual(r.capNhat.length, 1);
  assert.strictEqual(r.capNhat[0].id, 'p1');
});

t('caption quá ngắn thì KHÔNG đoán', () => {
  const r = N.ghep([{ link: 'https://www.facebook.com/x/posts/pfbid0zz', nguoi: 'Võ Hằng', van: 'ngắn quá' }], BAI2);
  assert.strictEqual(r.capNhat.length, 0);
  assert.strictEqual(r.khongKhop.length, 1);
});

t('hai bài mở đầu giống hệt nhau thì bỏ qua, không chọn bừa', () => {
  /* Thà để trống còn hơn gán sai rồi KPI đếm cho người khác. */
  const doi = [
    { id: 'x1', platform: 'Facebook', url: '', poster: '', title: 'Show Tiên Cá Vinwonders Phú Quốc mỗi ngày hai suất nha' },
    { id: 'x2', platform: 'Facebook', url: '', poster: '', title: 'Show Tiên Cá Vinwonders Phú Quốc mỗi ngày hai suất nha' },
  ];
  assert.strictEqual(N.ghepTheoVan('abc Show Tiên Cá Vinwonders Phú Quốc mỗi ngày hai suất nha xyz', doi), null);
});

t('link có ID số vẫn được ưu tiên hơn caption', () => {
  const r = N.ghep([{
    link: 'https://www.facebook.com/reel/222222222222/',
    nguoi: 'Lý Thư Bạch',
    van: 'Trúng kế VinWonders rồi... 💔🥹 #VinWonders #thuycung #RootyTrip',
  }], BAI2);
  assert.strictEqual(r.capNhat.length, 1);
  assert.strictEqual(r.capNhat[0].id, 'p2', 'phải theo link, không theo caption');
});

t('mục TÊN LẠ cũng phải mang vị trí, để tiện ích giữ lại gửi sau', () => {
  /* Lỗi mất dữ liệu: máy chủ chỉ trả vị trí của nhóm "chưa tìm thấy bài", nên
     một người mới chưa kịp khai vào Base là bài của họ bị tiện ích xoá khỏi
     hàng chờ luôn — mất trắng, không dấu vết ngoài một dòng nhật ký. Giữ lại
     thì khai xong tên là lượt gửi sau tự ghi được. */
  const bai = [{
    id: 'z1', platform: 'Facebook', url: '', poster: '',
    title: 'Một tiêu đề đủ dài để khớp được bằng caption nhé bạn ơi',
  }];
  const r = N.ghep([
    { nguoi: 'Người Chưa Khai', van: 'Một tiêu đề đủ dài để khớp được bằng caption nhé bạn ơi' },
    { nguoi: 'Võ Hằng', van: 'Đoạn chữ này chắc chắn không trùng bài nào trong Base cả đâu' },
  ], bai);
  assert.strictEqual(r.capNhat.length, 0);
  assert.deepStrictEqual(r.tenLa.map((x) => x.viTri), [0], 'tên lạ phải kèm vị trí');
  assert.deepStrictEqual(r.khongKhop.map((x) => x.viTri), [1]);
  /* Máy chủ gộp hai nhóm này thành chuaKhop — cả hai đều phải được giữ lại. */
  const chuaKhop = [...r.khongKhop.map((x) => x.viTri), ...r.tenLa.map((x) => x.viTri)].sort();
  assert.deepStrictEqual(chuaKhop, [0, 1]);
});

t('server.js cất cả tên lạ vào hàng chờ, không riêng bài chưa tìm thấy', () => {
  /* Luật cần giữ: mục của người CHƯA KHAI TÊN không được biến mất.
   *
   * Chỗ bảo vệ luật này đã DỜI. Trước kia nó nằm ở tiện ích: máy chủ trả tên lạ
   * về trong `chuaKhop`, tiện ích giữ lại rồi gửi lại mỗi năm phút. Từ 1.15.0
   * hàng chờ nằm hẳn ở máy chủ — tiện ích gửi xong là buông, nên chỗ phải kiểm
   * bây giờ là lời gọi choKhop.luu(): nó phải nhận CẢ HAI nhóm. Thiếu r.tenLa ở
   * đây thì khai tên xong cũng không còn gì để ghi.
   *
   * Kiểm trên mã nguồn vì tuyến này chưa có test HTTP; thà một phép thử thô còn
   * hơn để một luật đã mất một bài thật không ai canh. */
  const src = require('fs').readFileSync(require.resolve('../server'), 'utf8');
  assert.ok(/\[\.\.\.r\.khongKhop,\s*\.\.\.r\.tenLa\]/.test(src),
    'phần cất vào hàng chờ phải gồm cả r.tenLa, nếu không là mất bài của người chưa khai tên');
  assert.ok(/choKhop\.luu\(/.test(src),
    'phải thật sự gọi choKhop.luu() — giữ ở trình duyệt thì bài hẹn giờ lại rơi mất');
});

t('server.js KHÔNG còn bắt tiện ích gửi lại mục đã cất được', () => {
  /* Đây là lỗi anh Hùng gặp: xoá dòng thử nghiệm trên Base mà nó cứ hiện lại,
   * Số lần thử leo tới 193. Nguyên nhân là `chuaKhop` trả về mọi mục chưa khớp
   * nên tiện ích gửi lại mỗi năm phút, và luu() không thấy khoá cũ nên tạo dòng
   * mới. Luật quyết định nằm ở choKhop.viTriPhaiGiu(), có test riêng bên
   * test/cho-khop.test.js. */
  const src = require('fs').readFileSync(require.resolve('../server'), 'utf8');
  assert.ok(/viTriPhaiGiu\(/.test(src),
    'phải dùng choKhop.viTriPhaiGiu() để quyết định mục nào tiện ích còn phải giữ');
  assert.ok(!/chuaKhop:\s*\[\.\.\.r\.khongKhop/.test(src),
    'trả thẳng mọi mục chưa khớp về cho tiện ích là dựng lại vòng gửi lại vô tận');
});

console.log('\nnguoi-dang — bảng chấm KPI theo người');

t('gộp đúng và xếp theo lượt xem', () => {
  const r = N.gopTheoNguoi([
    { poster: 'Võ Hằng', views: 100, reach: 50, engagement: 10 },
    { poster: 'Võ Hằng', views: 200, reach: 60, engagement: 20 },
    { poster: 'Lý Thư Bạch', views: 500, reach: 90, engagement: 5 },
  ]);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].nguoi, 'Lý Thư Bạch');
  assert.strictEqual(r[1].soBai, 2);
  assert.strictEqual(r[1].views, 300);
});

t('bài chưa rõ người phải hiện thành một dòng, và luôn xuống CUỐI', () => {
  /* Nhìn "Võ Hằng 20 bài, Lý Thư Bạch 18 bài" mà không biết còn 40 bài không ai
     nhận thì con số đẹp một cách giả tạo. Và để dòng đó lẫn vào bảng xếp hạng
     theo lượt xem là đọc nhầm nó thành một người. */
  const r = N.gopTheoNguoi([
    { poster: '', views: 9000 },
    { poster: '   ', views: 1000 },
    { poster: 'Võ Hằng', views: 10 },
  ]);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[r.length - 1].nguoi, '(chưa rõ)', 'phải nằm cuối dù nhiều lượt xem nhất');
  assert.strictEqual(r[r.length - 1].soBai, 2, 'chuỗi rỗng và chuỗi toàn khoảng trắng là một nhóm');
});

t('danh sách rỗng thì trả mảng rỗng, không vỡ', () => {
  assert.deepStrictEqual(N.gopTheoNguoi([]), []);
  assert.deepStrictEqual(N.gopTheoNguoi(null), []);
});

t('caption ngắn vẫn khớp được, nhưng quá ngắn thì thôi', () => {
  /* Để cứng 40 ký tự là bỏ luôn 38 bài thật có caption ngắn — kiểu "Show Tiên
     Cá Vinwonders Phú Quốc". Lấy trọn caption khi nó ngắn hơn 40 thì khớp được,
     mà vẫn an toàn vì phép khớp đã bỏ qua khi hai bài cùng mở đầu giống nhau.
     Dưới 20 thì thôi: ngắn quá là đụng nhau quá dễ. */
  const bai = [{ id: 's1', platform: 'Facebook', title: 'Show Tiên Cá Vinwonders Phú Quốc' }];
  assert.ok(N.ghepTheoVan('Rooty Trip Show Tiên Cá Vinwonders Phú Quốc Lên lịch', bai));
  /* Ngưỡng hạ xuống 5 theo yêu cầu: caption ngắn vẫn khớp được, miễn là DUY NHẤT. */
  assert.strictEqual(N.ghepTheoVan('Thử nghiệm', bai), null,
    'không có bài nào tên Thử nghiệm trong mẫu này');
  assert.ok(N.ghepTheoVan('Thử nghiệm',
    [{ id: 'z', platform: 'Facebook', title: 'Thử nghiệm' }]), 'có bài trùng thì khớp được');
  assert.ok(N.DAI_TOI_THIEU <= 5, 'ngưỡng tối thiểu phải đủ thấp cho bài thử');

  const doi = [
    { id: 'a', platform: 'Facebook', title: 'Show Tiên Cá Vinwonders Phú Quốc' },
    { id: 'b', platform: 'Facebook', title: 'Show Tiên Cá Vinwonders Phú Quốc' },
  ];
  assert.strictEqual(N.ghepTheoVan('x Show Tiên Cá Vinwonders Phú Quốc y', doi), null,
    'hai bài trùng caption thì vẫn phải bỏ qua, không vì ngắn mà nới');
});

t('ngưỡng của tiện ích khớp với ngưỡng của máy chủ', () => {
  /* Lệch nhau là tiện ích bắt về rồi máy chủ vứt đi — mục nằm trong hàng chờ
     tới lúc hết hạn, không ai hiểu vì sao. */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  const m = /const DAI_TOI_THIEU = (\d+)/.exec(src);
  assert.ok(m, 'tiện ích phải khai ngưỡng');
  assert.strictEqual(Number(m[1]), N.DAI_TOI_THIEU, 'hai bên phải bằng nhau');
});


t('bài TikTok và bài Facebook cùng caption thì không lẫn vào nhau', () => {
  const van = 'Vị thế thật sự của Phú Quốc trên bản đồ du lịch quốc tế';
  const bai = [
    { id: 'fb', platform: 'Facebook', title: van },
    { id: 'tt', platform: 'TikTok', title: van },
  ];
  /* Không khai nền tảng thì hiểu là Facebook — giữ nguyên cách hiểu của các bản
     tiện ích cũ vẫn đang chạy trên máy các bạn. */
  assert.strictEqual(N.ghepTheoVan(van, bai).id, 'fb');
  assert.strictEqual(N.ghepTheoVan(van, bai, { nenTang: 'TikTok' }).id, 'tt');
  assert.strictEqual(N.ghepTheoVan(van, bai, { nenTang: 'Instagram' }), null,
    'không có bài Instagram nào thì đừng vơ bài của nền tảng khác');
});

t('gợi ý kênh tách được hai bài TikTok giống hệt caption', () => {
  const van = 'Một clip đăng lên hai kênh, caption giống hệt nhau luôn';
  const bai = [
    { id: 'a', platform: 'TikTok', title: van, channel: 'Rooty Trip Phú Quốc', channelExtId: 'k1' },
    { id: 'b', platform: 'TikTok', title: van, channel: 'Vi Vu Phú Quốc', channelExtId: 'k2' },
  ];
  const kenhDS = [
    { name: 'Rooty Trip Phú Quốc', handle: 'rootytrip', extId: 'k1' },
    { name: 'Vi Vu Phú Quốc', handle: 'vivupq', extId: 'k2' },
  ];
  assert.strictEqual(N.ghepTheoVan(van, bai, { nenTang: 'TikTok' }), null,
    'không có gợi ý thì phải bỏ qua, không đoán');
  assert.strictEqual(
    N.ghepTheoVan(van, bai, { nenTang: 'TikTok', kenh: '@vivupq', kenhDS }).id, 'b');
  assert.strictEqual(
    N.ghepTheoVan(van, bai, { nenTang: 'TikTok', kenh: 'Rooty Trip Phú Quốc', kenhDS }).id, 'a',
    'gợi ý bằng TÊN kênh cũng phải nhận');
  assert.strictEqual(
    N.ghepTheoVan(van, bai, { nenTang: 'TikTok', kenh: '@chua-khai-bao-gio', kenhDS }), null,
    'gợi ý lạ thì coi như không có — quay về trạng thái hai bài, vẫn bỏ qua');
});

t('tiện ích gắn nền tảng theo tên miền', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  assert.ok(src.includes('tiktok'), 'phải nhận ra tiktok.com');
  assert.ok(src.includes('nenTang: NEN_TANG'), 'mục bắt được phải mang theo nền tảng');
  /* Mục cũ trong kho chưa có nenTang: gán nền tảng của TAB HIỆN TẠI vào đó là
     bài Facebook cũ bị đổi thành TikTok rồi không bao giờ khớp nữa. */
  assert.ok(src.includes("x.nenTang || 'Facebook'"),
    'lúc gửi phải giữ nền tảng CỦA TỪNG MỤC, không lấy của tab');
  /* TikTok không có dòng "Người đăng" nào để đọc — quét ở đó chỉ đẻ bảng rỗng. */
  assert.ok(src.includes("NEN_TANG !== 'Facebook'"), 'không quét màn hình trên TikTok');

  const mf = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
  const m = mf.content_scripts[0].matches.join(' ');
  assert.ok(m.includes('tiktok.com'), 'manifest phải cho chạy trên tiktok.com');
  assert.ok(m.includes('facebook.com'), 'và vẫn phải chạy trên facebook.com');
});

console.log('\n' + dat + ' phép thử đạt' + (hong ? ' — CÓ LỖI' : ''));
if (hong) process.exit(1);
