#!/usr/bin/env node
'use strict';
/**
 * KIỂM BẢN ĐANG CHẠY sau mỗi lần deploy — thay cho việc mở tay 14 app soi lỗi.
 *
 *   node test/kiem-ban-chay.js                       → bản trên Render (https://mkt-hub-w6hi.onrender.com)
 *   node test/kiem-ban-chay.js http://localhost:5180  → hub trên máy (chế độ cli, không cần đăng nhập)
 *   node test/kiem-ban-chay.js --cho                  → CHỜ tới khi Render lên đúng commit HEAD rồi mới kiểm
 *
 * Bước 1 (không cần đăng nhập): /healthz trả `build` = "…+<7 ký tự commit>". So với
 *   `git rev-parse HEAD` để biết Render đã lên bản vừa push chưa — câu hỏi đã tốn
 *   nhiều lượt nhất mỗi lần deploy.
 * Bước 2: mở /api/hub rồi gọi cửa thử (`thuApi` trong modules.json) của TỪNG app
 *   con qua proxy, đo thời gian, báo app nào lỗi / chậm.
 *   Trên Render mọi đường sau /healthz đều cần đăng nhập. Đặt biến HUB_COOKIE bằng
 *   cookie phiên của một quản lý (DevTools → Application → Cookies → dòng của
 *   mkt-hub-w6hi.onrender.com, chép "tên=giá trị") để chạy bước này. KHÔNG cất
 *   cookie vào tệp nào — nó là phiên đăng nhập của anh.
 *
 * Chỉ ĐỌC: mọi lời gọi là GET, không ghi gì xuống Base.
 * Thoát mã 1 nếu có app lỗi — gắn vào bất kỳ đâu (cron, CI) cũng dùng được.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const GOC = (args.find((a) => /^https?:\/\//.test(a)) || process.env.HUB_URL || 'https://mkt-hub-w6hi.onrender.com').replace(/\/+$/, '');
const CHO = args.includes('--cho');
const COOKIE = process.env.HUB_COOKIE || '';
const CHAM_MS = 15000;

const xanh = (s) => '\x1b[32m' + s + '\x1b[0m';
const do_ = (s) => '\x1b[31m' + s + '\x1b[0m';
const vang = (s) => '\x1b[33m' + s + '\x1b[0m';

async function lay(duong, hanMs = 60000) {
  const t = Date.now();
  const r = await fetch(GOC + duong, {
    headers: COOKIE ? { cookie: COOKIE } : {},
    redirect: 'manual',
    signal: AbortSignal.timeout(hanMs),
  });
  const chu = await r.text();
  let j = null;
  try { j = JSON.parse(chu); } catch (_) {}
  return { ma: r.status, j, chu, ms: Date.now() - t, vi: r.headers.get('location') || '' };
}

function commitMay() {
  try { return execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }).trim(); } catch (_) { return ''; }
}

(async () => {
  let hong = 0;
  console.log('Kiểm ' + GOC + '\n');

  /* ---- 1. đúng bản chưa ---- */
  const head = commitMay();
  let h;
  for (let lan = 0; ; lan++) {
    try { h = await lay('/healthz', 90000); } catch (e) { h = { ma: 0, chu: e.message }; }
    const build = (h.j && h.j.build) || '';
    const dung = head && build.endsWith('+' + head.slice(0, 7));
    if (h.ma === 200 && (dung || !CHO || /localhost|127\.0\.0\.1/.test(GOC))) break;
    if (!CHO || lan > 40) break;
    process.stdout.write('  chờ Render lên ' + head.slice(0, 7) + ' (đang là ' + (build || h.ma) + ')…\r');
    await new Promise((r) => setTimeout(r, 15000));
  }
  const build = (h.j && h.j.build) || '';
  if (h.ma !== 200) { hong++; console.log(do_('✗ /healthz trả ' + h.ma + ' — ' + String(h.chu).slice(0, 160))); }
  else if (/localhost|127\.0\.0\.1/.test(GOC)) console.log(xanh('✓ hub trên máy đang chạy') + ' (' + build + ')');
  else if (head && !build.endsWith('+' + head.slice(0, 7))) console.log(vang('! Render đang chạy ' + build + ', máy đang ở ' + head.slice(0, 7) + ' — chưa push, hoặc Render chưa deploy xong (thêm --cho để đợi)'));
  else console.log(xanh('✓ Render đang chạy đúng bản ' + build));

  /* ---- 2. từng app con ---- */
  let hub;
  try { hub = await lay('/api/hub'); } catch (e) { hub = { ma: 0, chu: e.message }; }
  if (hub.ma === 302 || hub.ma === 401 || hub.ma === 403) {
    console.log(vang('\n! Bước 2 cần đăng nhập — đặt HUB_COOKIE (xem đầu tệp) rồi chạy lại.'));
    process.exit(hong ? 1 : 0);
  }
  if (hub.ma !== 200 || !hub.j) { console.log(do_('✗ /api/hub trả ' + hub.ma)); process.exit(1); }

  const khai = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'modules.json'), 'utf8')).modules || [];
  const thuCua = new Map(khai.map((m) => [m.id, m.thuApi || '/api/meta']));
  const mods = (hub.j.modules || []).filter((m) => (m.kieu || 'local') === 'local');
  console.log('\n' + mods.length + ' app con:');
  const kq = await Promise.all(mods.map(async (m) => {
    const duong = '/m/' + m.id + (thuCua.get(m.id) || '/api/meta');
    try {
      const r = await lay(duong);
      return { m, r, duong };
    } catch (e) { return { m, r: { ma: 0, chu: e.message, ms: 60000 }, duong }; }
  }));
  for (const { m, r, duong } of kq) {
    const okMa = r.ma === 200 && r.j;
    const ten = (m.ten || m.id).padEnd(28);
    if (!okMa) { hong++; console.log('  ' + do_('✗') + ' ' + ten + do_(r.ma + ' ') + duong + ' — ' + String((r.j && r.j.error) || r.chu).slice(0, 120)); }
    else if (r.ms > CHAM_MS) console.log('  ' + vang('!') + ' ' + ten + vang((r.ms / 1000).toFixed(1) + ' giây (chậm)'));
    else console.log('  ' + xanh('✓') + ' ' + ten + (r.ms / 1000).toFixed(1) + ' giây');
  }
  console.log('\n' + (hong ? do_(hong + ' chỗ lỗi') : xanh('Tất cả ổn')));
  process.exit(hong ? 1 : 0);
})().catch((e) => { console.error(do_('LỖI: ' + e.message)); process.exit(1); });
