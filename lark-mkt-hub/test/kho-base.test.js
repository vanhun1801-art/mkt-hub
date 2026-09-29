'use strict';
/**
 * ============================================================================
 * KHO BASE DÙNG CHUNG (kho-base.js) — gộp lượt đọc, TTL, làm tươi, cửa khoá
 * ============================================================================
 * Không cần Lark: cắm một bộ đọc giả đếm số lần bị gọi. Điều phải đúng:
 *   - hai app hỏi cùng trang cùng lúc -> Lark bị đọc MỘT lần
 *   - trong TTL hỏi lại -> không đọc Lark; hết TTL -> đọc lại
 *   - lam-tuoi -> lần hỏi sau đọc lại
 *   - user và bot là hai ngăn riêng
 *   - đọc hỏng -> lỗi trả về app con (502), KHÔNG phát bản cũ
 *   - thiếu khoá / không từ 127.0.0.1 -> 404 như chưa có đường này
 *
 * Chạy: node test/kho-base.test.js
 */
process.env.HUB_KHO_TTL_MS = '1000';
const http = require('http');
const kho = require('../kho-base');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; fails.push(ten); console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

const goiLark = [];
let hong = false;
const docGia = {
  async docTrang(base, t, offset, as) {
    goiLark.push(['trang', base, t, offset, as]);
    await ngu(30);
    if (hong) throw new Error('Lark API 800004135: limited');
    return { field_id_list: ['f1'], record_id_list: ['r' + offset], data: [['x']], has_more: false };
  },
  async docCot(base, t, as) {
    goiLark.push(['cot', base, t, as]);
    await ngu(10);
    return [{ id: 'f1', name: 'Cột 1' }];
  },
};

(async () => {
  console.log('\n\x1b[1mGộp lượt đọc trùng và TTL\x1b[0m');
  kho.bat({ cfg: { port: 0 }, docTho: docGia });
  kho.datLai(); goiLark.length = 0;
  const [a, b] = await Promise.all([kho.docTrang('B1', 'T1', 0, 'user'), kho.docTrang('B1', 'T1', 0, 'user')]);
  ok('hai app hỏi cùng lúc -> Lark bị đọc một lần', goiLark.length === 1, 'đọc ' + goiLark.length + ' lần');
  ok('cả hai nhận cùng dữ liệu', a.record_id_list[0] === 'r0' && b.record_id_list[0] === 'r0');
  await kho.docTrang('B1', 'T1', 0, 'user');
  ok('trong TTL hỏi lại -> không đọc Lark', goiLark.length === 1);
  await kho.docTrang('B1', 'T1', 200, 'user');
  ok('trang khác -> đọc thêm một lần', goiLark.length === 2 && goiLark[1][3] === 200);
  await kho.docTrang('B1', 'T1', 0, 'bot');
  ok('bot là ngăn riêng -> đọc lại', goiLark.length === 3 && goiLark[2][4] === 'bot');
  await ngu(1100);
  await kho.docTrang('B1', 'T1', 0, 'user');
  ok('hết TTL -> đọc lại', goiLark.length === 4);

  console.log('\n\x1b[1mLàm tươi sau khi ghi\x1b[0m');
  goiLark.length = 0;
  await kho.docCot('B1', 'T1', 'user');
  await kho.docCot('B1', 'T1', 'user');
  ok('cột cũng được đệm', goiLark.length === 1);
  kho.lamTuoi('B1', 'T1');
  await kho.docCot('B1', 'T1', 'user');
  await kho.docTrang('B1', 'T1', 0, 'user');
  ok('lam-tuoi bỏ cả cột lẫn trang (cả user lẫn bot)', goiLark.length === 3, JSON.stringify(goiLark));
  const tt = kho.tinhTrang();
  ok('tinhTrang có số liệu', tt.lamTuoi === 1 && tt.ttlMs === 1000 && typeof tt.soBang === 'number');

  console.log('\n\x1b[1mĐọc hỏng thì không phát bản cũ\x1b[0m');
  goiLark.length = 0; kho.datLai();
  await kho.docTrang('B2', 'T2', 0, 'user');
  await ngu(1100);
  hong = true;
  let loi = null;
  try { await kho.docTrang('B2', 'T2', 0, 'user'); } catch (e) { loi = e; }
  ok('hết TTL mà Lark hỏng -> ném lỗi cho app con tự đọc', !!loi && /800004135/.test(loi.message));
  hong = false;
  await kho.docTrang('B2', 'T2', 0, 'user');
  ok('Lark tỉnh lại -> đọc lại được', goiLark.length === 3);

  console.log('\x1b[1m\nCửa HTTP nội bộ\x1b[0m');
  const KHOA = 'khoa-thu';
  const srv = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://127.0.0.1').pathname;
    if (kho.xuLy(req, res, p, KHOA)) return;
    res.writeHead(404); res.end('khong');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const goi = (duong, method = 'GET', khoa = KHOA) => new Promise((r) => {
    const req = http.request({ host: '127.0.0.1', port, path: duong, method, headers: khoa ? { 'x-hub-khoa': khoa } : {} }, (res) => {
      let s = ''; res.on('data', (d) => { s += d; }); res.on('end', () => r({ code: res.statusCode, than: s }));
    });
    req.end();
  });
  goiLark.length = 0; kho.datLai();
  let r = await goi('/_noi-bo/kho/BaseTok123/tblAbc123/records?offset=0&as=user');
  ok('có khoá -> 200 kèm dữ liệu dạng cột', r.code === 200 && /record_id_list/.test(r.than), r.code + ' ' + r.than.slice(0, 80));
  r = await goi('/_noi-bo/kho/BaseTok123/tblAbc123/fields?as=user');
  ok('fields -> 200 { fields: [...] }', r.code === 200 && /"fields"/.test(r.than));
  r = await goi('/_noi-bo/kho/BaseTok123/tblAbc123/records?offset=0', 'GET', 'sai');
  ok('sai khoá -> 404', r.code === 404);
  r = await goi('/_noi-bo/kho/BaseTok123/tblAbc123/records?offset=0', 'GET', null);
  ok('thiếu khoá -> 404', r.code === 404);
  r = await goi('/_noi-bo/kho/BaseTok123/tblAbc123/lam-tuoi', 'GET');
  ok('lam-tuoi bằng GET -> 404 (chỉ POST)', r.code === 404);
  r = await goi('/_noi-bo/kho/BaseTok123/tblAbc123/lam-tuoi', 'POST');
  ok('lam-tuoi bằng POST -> 200', r.code === 200);
  r = await goi('/_noi-bo/kho/x/y/records');
  ok('base/table quá ngắn -> không nhận đường (404 của server)', r.code === 404 && r.than === 'khong');
  hong = true; kho.datLai();
  r = await goi('/_noi-bo/kho/BaseTok123/tblAbc123/records?offset=0');
  ok('Lark hỏng -> 502 để app con tự đọc', r.code === 502 && /800004135/.test(r.than));
  hong = false;
  srv.close();

  /* Dòng tổng kết đúng mẫu `N pass · M fail` — test/chay-het.js đọc bằng mẫu đó. */
  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
