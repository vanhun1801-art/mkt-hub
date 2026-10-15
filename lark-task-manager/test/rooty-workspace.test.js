'use strict';
/**
 * Trao đổi việc liên phòng đi chung luồng với Rooty Workspace (15/10/2026).
 * Chạy với một máy chủ Rooty Workspace GIẢ trên 127.0.0.1 — không gọi bên thật.
 * Chạy: node test/rooty-workspace.test.js
 */
const http = require('http');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  PASS ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (vi !== undefined ? '\n        ' + JSON.stringify(vi) : '')); }
};

const KHOA = 'khoa-thu';
const nhan = [];   // mọi lời gọi máy chủ giả nhận được
const tin = [   // luồng trao đổi của GV-0045 bên Rooty Workspace
  { id: 1, task_id: 45, author_id: 'RT00366', author_name: 'Bùi Việt Đạt', body: 'Bên MKT xem giúp file này', files: '[{"name":"brief.pdf","token":"t1"}]', created_at: 1792040000000 },
];
let chanDoc = false;

const may = http.createServer((req, res) => {
  let than = '';
  req.on('data', (d) => { than += d; });
  req.on('end', () => {
    nhan.push({ method: req.method, url: req.url, khoa: req.headers['x-api-key'], email: req.headers['x-user-email'], than });
    const tra = (st, j) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (req.headers['x-api-key'] !== KHOA) return tra(401, { error: 'Mã khoá sai', code: 'api_auth' });
    if (req.url === '/api/v1/tasks/by-code/GV-0045') return tra(200, { id: 45, code: 'GV-0045', title: 'Việc thử', status: 'doing' });
    if (req.url === '/api/v1/tasks/by-code/GV-9999') return tra(404, { error: 'Không tìm thấy việc', code: 'not_found' });
    if (req.url === '/api/tasks/45' && req.method === 'GET') return tra(200, { task: { id: 45, code: 'GV-0045' }, comments: tin });
    if (req.url === '/api/tasks/45/comments' && req.method === 'POST') {
      if (chanDoc) return tra(423, { error: 'Anh/chị còn bài bắt buộc đọc quá hạn. Đọc và xác nhận trên Rooty Workspace rồi gửi lại.', code: 'must_read' });
      const b = JSON.parse(than || '{}');
      tin.push({ id: tin.length + 1, task_id: 45, author_id: 'RT00999', author_name: req.headers['x-user-email'] === 'hung@rootytrip.com' ? 'Lê Văn Hùng' : '?', body: b.body, files: null, created_at: Date.now() });
      return tra(201, { ok: true });
    }
    return tra(404, { error: 'không có' });
  });
});

(async () => {
  await new Promise((r) => may.listen(0, '127.0.0.1', r));
  process.env.RW_URL = 'http://127.0.0.1:' + may.address().port;
  process.env.RW_KHOANG_MS = '5';
  delete process.env.RW_KEY;
  process.env.RW_KHONG_TEP = '1';   // không đọc rw.env thật của máy
  const RW = require('../rooty-workspace');
  const hung = { id: 'ou_hung', name: 'Lê Văn Hùng', email: 'hung@rootytrip.com' };

  ok('chưa có RW_KEY thì tắt hẳn (Hub dùng bảng Bình luận như cũ)', RW.bat() === false);
  process.env.RW_KEY = KHOA;
  ok('có RW_KEY thì bật', RW.bat() === true);

  const ds = await RW.traoDoi('GV-0045', hung);
  const g = nhan.find((x) => x.url === '/api/tasks/45');
  ok('đọc luồng: gửi đúng mã khoá và email người xem', g && g.khoa === KHOA && g.email === hung.email, g);
  ok('tin bên kia hiện đủ, đúng tên người gửi', ds.length === 1 && ds[0].author[0].name === 'Bùi Việt Đạt' && /file này/.test(ds[0].content), ds);
  ok('tin có tệp thì nói tên tệp và chỗ mở', /brief\.pdf/.test(ds[0].content) && /Rooty Workspace/.test(ds[0].content), ds[0].content);
  ok('thời gian giữ nguyên mili-giây', ds[0].at === 1792040000000);
  ok('tin của người khác không nằm bên phải', ds[0].author[0].id !== hung.id);

  await RW.gui('GV-0045', hung.email, 'MKT đã nhận, chiều gửi bản đầu');
  const p = nhan.find((x) => x.method === 'POST');
  ok('gửi tin: đúng đường, mang email người gửi', p && p.url === '/api/tasks/45/comments' && p.email === hung.email, p);
  ok('gửi tin: thân đúng khuôn { body }', p && JSON.parse(p.than).body === 'MKT đã nhận, chiều gửi bản đầu', p && p.than);

  const sau = await RW.traoDoi('GV-0045', hung);
  ok('gửi xong đọc lại thấy ngay tin mới (không bị đệm cũ che)', sau.length === 2, sau.length);
  ok('tin của chính mình nằm bên phải', sau[1].author[0].id === hung.id, sau[1].author);

  const truoc = nhan.filter((x) => x.url === '/api/tasks/45').length;
  await RW.traoDoi('GV-0045', hung);
  ok('nạp lại liền sau đó dùng đệm, không gọi thêm', nhan.filter((x) => x.url === '/api/tasks/45').length === truoc);
  ok('mã GV chỉ hỏi id một lần', nhan.filter((x) => x.url === '/api/v1/tasks/by-code/GV-0045').length === 1);

  chanDoc = true;
  let loi = null;
  try { await RW.gui('GV-0045', hung.email, 'thử'); } catch (e) { loi = e; }
  ok('bên kia chặn (423 còn bài bắt buộc đọc) thì đưa nguyên câu tiếng Việt', loi && loi.status === 423 && /bắt buộc đọc/.test(loi.message), loi && loi.message);
  chanDoc = false;

  loi = null;
  try { await RW.gui('GV-0045', '', 'thử'); } catch (e) { loi = e; }
  ok('không có email thì không gửi, nói rõ vì sao', loi && loi.code === 'khong_email', loi && loi.message);

  loi = null;
  try { await RW.traoDoi('GV-9999', hung); } catch (e) { loi = e; }
  ok('mã không có bên kia thì báo lỗi rõ', loi && loi.status === 404, loi && loi.message);

  process.env.RW_KEY = 'sai';
  RW._datLai();
  loi = null;
  try { await RW.traoDoi('GV-0045', hung); } catch (e) { loi = e; }
  ok('mã khoá sai thì báo lỗi, không treo', loi && loi.status === 401, loi && loi.message);

  may.closeAllConnections && may.closeAllConnections();
  await new Promise((r) => may.close(r));
  console.log('\n' + pass + ' pass · ' + fail + ' fail\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('NỔ: ' + e.stack); process.exit(1); });
