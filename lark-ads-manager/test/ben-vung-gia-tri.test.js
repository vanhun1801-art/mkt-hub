/**
 * benVung() phải so GIÁ TRỊ, không so sự CÓ MẶT.
 *
 * Anh Hùng gửi ảnh có hai băng cạnh nhau nói trái ngược:
 *   ĐỎ   "Phần vừa điền SẼ MẤT khi deploy lại"
 *   XANH "Deploy lại KHÔNG MẤT GÌ … Không phải gắn lại API"
 *
 * Băng xanh sai, và sai theo cách nguy hiểm nhất. benVung() chỉ hỏi "biến môi
 * trường CÓ token cho kênh này không" chứ không so token đó với token đang chạy.
 * Tình huống thật: ổ đĩa giữ refresh token Google MỚI vừa lấy lại, biến
 * ADS_CONNECT_JSON vẫn giữ token CŨ ĐÃ BỊ THU HỒI. Xét "có mặt" thì cả hai đều
 * có — app hứa không mất gì, rồi deploy xong chạy bằng token chết.
 *
 * Mất hẳn một kênh còn đỡ: nó báo lỗi. Tụt về giá trị cũ thì im lặng chạy sai.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const FILE = 'ket-noi.benvung-test.json';
const duong = path.join(process.cwd(), FILE);
process.on('exit', () => { try { fs.unlinkSync(duong); } catch (_) {} });

const TOKEN_MOI = '1//0-TOKEN-MOI-vua-lay-lai-aaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_CU = '1//0-TOKEN-CU-da-bi-thu-hoi-bbbbbbbbbbbbbbbbbbbbbbb';

const khoi = (rt) => ({
  meta: { enabled: true, accessToken: 'META-AAAA-BBBB-CCCC', accountIds: ['1'] },
  googleAds: {
    enabled: true, clientId: 'x.apps', clientSecret: 'sec-aaaa',
    refreshToken: rt, developerToken: 'dev-aaaa', customerIds: ['1'],
  },
});

/** Chạy benVung() trong tiến trình con với file đĩa và biến môi trường tự đặt. */
function chay(tep, env, coRender = true) {
  fs.writeFileSync(duong, JSON.stringify(tep));
  const ra = cp.execFileSync(process.execPath, ['-e',
    `const k=require(${JSON.stringify(path.resolve('sync/ketnoi.js'))});
     console.log(JSON.stringify(k.benVung()));`],
  { env: {
    ...process.env,
    LARK_CONNECT_FILE: FILE,
    ...(coRender ? { RENDER: '1' } : {}),
    ...(env ? { ADS_CONNECT_JSON: JSON.stringify(env) } : {}),
  }, cwd: process.cwd(), encoding: 'utf8' });
  return JSON.parse(ra.trim().split('\n').pop());
}

console.log('— CA ĐÃ SAI: đĩa giữ token MỚI, biến môi trường giữ token CŨ');
{
  const r = chay(khoi(TOKEN_MOI), khoi(TOKEN_CU));
  t('phải báo có chuyện phải lo', r.canLo === true, JSON.stringify(r));
  t('nêu đúng kênh sẽ tụt về giá trị cũ',
    (r.khacNhau || []).includes('googleAds'), JSON.stringify(r.khacNhau));
  t('kênh đó nằm trong danh sách sẽ mất',
    (r.seMat || []).includes('googleAds'), JSON.stringify(r.seMat));
  t('kênh giống nhau thì vẫn giữ được',
    (r.seCon || []).includes('meta'), JSON.stringify(r.seCon));
  t('KHÔNG được coi googleAds là giữ được', !(r.seCon || []).includes('googleAds'));
}

console.log('— hai bên giống nhau thì không có gì phải lo');
{
  const r = chay(khoi(TOKEN_MOI), khoi(TOKEN_MOI));
  t('canLo = false', r.canLo === false, JSON.stringify(r));
  t('không kênh nào khác nhau', (r.khacNhau || []).length === 0);
  t('cả hai kênh đều giữ được', r.seCon.length === 2, JSON.stringify(r.seCon));
}

console.log('— biến môi trường thiếu hẳn một kênh: mất hẳn, KHÁC với tụt giá trị cũ');
{
  const env = khoi(TOKEN_MOI);
  delete env.googleAds;
  const r = chay(khoi(TOKEN_MOI), env);
  t('googleAds mất hẳn', (r.seMat || []).includes('googleAds'), JSON.stringify(r.seMat));
  /* Phân biệt hai chuyện: mất hẳn thì báo lỗi, tụt giá trị cũ thì im lặng chạy
   * sai. Giao diện nói hai câu khác nhau nên dữ liệu phải tách được. */
  t('nhưng KHÔNG phải "khác giá trị"', !(r.khacNhau || []).includes('googleAds'),
    JSON.stringify(r.khacNhau));
}

console.log('— đĩa CÓ dữ liệu nhưng thiếu một kênh: kênh đó bị ẩn hẳn, không phải "giữ được"');
{
  /* Lùi về biến môi trường là chuyện ALL-OR-NOTHING, không phải từng kênh:
   * read() chỉ lấy env khi CẢ FILE không có thông tin gì. Nên một file đĩa có
   * Meta nhưng thiếu Google thì phần Google trong biến môi trường bị ẩn hoàn
   * toàn — kênh đó coi như không chạy, chứ không phải "đang chạy nhờ env".
   *
   * Bài kiểm đầu tôi viết ngược điều này và báo FAIL. Nhưng trạng thái đó app
   * KHÔNG BAO GIỜ tạo ra: writeSecrets() gọi read() (đã trộn) rồi ghi TRỌN BỘ
   * xuống đĩa, nên sau bất kỳ lần lưu nào file cũng đủ mọi kênh. Ghi lại đây để
   * lần sau không ai đi sửa read() vì tưởng nó thiếu tính năng. */
  const tep = khoi(TOKEN_MOI);
  delete tep.googleAds;
  const r = chay(tep, khoi(TOKEN_CU));
  t('googleAds KHÔNG được coi là đang chạy',
    !(r.dangChay || []).includes('googleAds'), JSON.stringify(r.dangChay));
  t('nên không nằm ở cả seCon lẫn seMat',
    !(r.seCon || []).includes('googleAds') && !(r.seMat || []).includes('googleAds'),
    JSON.stringify({ seCon: r.seCon, seMat: r.seMat }));
  t('Meta vẫn giữ được', (r.seCon || []).includes('meta'), JSON.stringify(r.seCon));
}

console.log('— chưa khai biến môi trường thì mất tất');
{
  const r = chay(khoi(TOKEN_MOI), null);
  t('canLo = true', r.canLo === true);
  t('mọi kênh vào danh sách mất', r.seMat.length === r.dangChay.length, JSON.stringify(r.seMat));
  t('nói rõ chưa có biến môi trường', /chưa có biến/.test(r.noiLuu), r.noiLuu);
}

console.log('— máy cá nhân: file trên đĩa thật, không mất đi đâu');
{
  const r = chay(khoi(TOKEN_MOI), null, false);
  t('canLo = false', r.canLo === false, JSON.stringify(r));
  t('có trường khacNhau để hình dạng nhất quán', Array.isArray(r.khacNhau));
}

console.log('— vân tay KHÔNG được để lọt token ra ngoài');
{
  const r = chay(khoi(TOKEN_MOI), khoi(TOKEN_CU));
  const s = JSON.stringify(r);
  t('không có token mới trong kết quả', !s.includes(TOKEN_MOI));
  t('không có token cũ trong kết quả', !s.includes(TOKEN_CU));
  t('không có access token Meta', !s.includes('META-AAAA'));
}

console.log('— giao diện: BỐN khả năng cho ra ĐÚNG MỘT băng');
{
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'ketnoi.js'), 'utf8');
  /* Bản trước tính hai băng độc lập rồi in cả hai, nên hiện "SẼ MẤT" ngay cạnh
   * "KHÔNG MẤT GÌ". Nay là chuỗi if/return nên chỉ một băng ra được. */
  t('băng "không mất gì" nằm SAU nhánh canLo',
    ui.indexOf('b.canLo') < ui.indexOf('Deploy lại không mất gì'), 'thứ tự nhánh');
  t('mỗi nhánh đều return ngay', (ui.match(/return `<div class="help"/g) || []).length >= 4);
  t('không còn hai băng độc lập cùng in',
    !/deLenBienMoiTruong \? `<div/.test(ui));
  /* Bản đang dùng chạy trên Render — ở đó không có dòng lệnh nào để gõ. */
  t('không còn khuyên chạy dòng lệnh', !ui.includes('node tao-env.js'));
  t('chỉ vào nút có thật', ui.includes('Lấy nội dung ADS_CONNECT_JSON'));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
