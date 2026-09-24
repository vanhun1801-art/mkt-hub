/**
 * Kiểm header X-Hub-Khong-Chen: app con xin lớp vỏ KHÔNG chèn CSS/JS dùng chung.
 *
 * Vì sao có bộ này: tab "Bản đồ" của app Sản phẩm nhúng bản đồ du lịch Phú Quốc
 * (lark-ban-do) — một trang có giao diện riêng hoàn toàn. Lớp vỏ chèn shim CSS/JS +
 * dienthoai.css vào MỌI trang HTML của app con; chèn vào bản đồ là vỡ bố cục của nó
 * (bảng bên trái, nút, ô tìm). Trang còn lại của app phải được chèn như cũ.
 *
 * Chạy thật qua chuyenTiep() với một app con giả trên cổng ngẫu nhiên.
 */
const http = require('http');
const { chuyenTiep } = require('../proxy');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const TRANG = '<!doctype html><html><head><title>x</title><link rel="stylesheet" href="ban-do.css"></head><body><img src="/logo.svg"></body></html>';

const appCon = http.createServer((req, res) => {
  const h = { 'Content-Type': 'text/html; charset=utf-8' };
  if (req.url.startsWith('/ban-do/')) h['X-Hub-Khong-Chen'] = '1';
  res.writeHead(200, h);
  res.end(TRANG);
});

appCon.listen(0, '127.0.0.1', async () => {
  const mod = { id: 'thu-khong-chen', cong: appCon.address().port };
  const vo = http.createServer((req, res) => chuyenTiep(req, res, mod, req.url, null));
  await new Promise((ok) => vo.listen(0, '127.0.0.1', ok));
  const lay = (duong) => new Promise((ok, loi) => {
    http.get({ host: '127.0.0.1', port: vo.address().port, path: duong }, (r) => {
      const b = []; r.on('data', (c) => b.push(c)); r.on('end', () => ok(Buffer.concat(b).toString('utf8')));
    }).on('error', loi);
  });
  try {
    console.log('— trang thường của app con: vẫn được chèn như cũ');
    const thuong = await lay('/');
    t('có shim CSS/JS của lớp vỏ', thuong.includes('data-hub="1"'));
    t('đường tuyệt đối được thêm tiền tố /m/<id>', thuong.includes('src="/m/thu-khong-chen/logo.svg"'));

    console.log('— trang bản đồ (X-Hub-Khong-Chen: 1): giữ nguyên từng byte');
    const bd = await lay('/ban-do/');
    t('không có shim CSS/JS', !bd.includes('data-hub'));
    t('không có dienthoai.css', !bd.includes('dienthoai.css'));
    t('nội dung giữ nguyên', bd === TRANG, bd.slice(0, 120));
  } catch (e) {
    t('gọi qua lớp vỏ', false, e.message);
  }
  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  vo.close(); appCon.close();
  process.exit(fail ? 1 : 0);
});
