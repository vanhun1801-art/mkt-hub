'use strict';
/* Server tĩnh cho bản đồ — chỉ để xem trên máy và để Marketing Hub bật như app con.
   Bản đồ thật ra là file tĩnh (public/), đưa lên website không cần server này. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 5187);
const BIND = process.env.BIND_HOST || '127.0.0.1';
const GOC = path.join(__dirname, 'public');
const KIEU = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8',
};

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  /* Bản đóng gói một file (tao/dong-goi.js) — để thử đúng thứ sẽ đưa lên website. */
  const f = p === '/ban-do-phu-quoc.html'
    ? path.join(__dirname, 'dist', 'ban-do-phu-quoc.html')
    : path.join(GOC, path.normalize(p));
  if (!f.startsWith(GOC) && !f.startsWith(path.join(__dirname, 'dist'))) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Không có'); }
    res.writeHead(200, {
      'Content-Type': KIEU[path.extname(f)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(buf);
  });
}).listen(PORT, BIND, () => console.log('Bản đồ Phú Quốc: http://localhost:' + PORT));
