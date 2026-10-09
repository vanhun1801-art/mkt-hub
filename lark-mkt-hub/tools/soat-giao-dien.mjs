// soat-giao-dien.mjs: tự soát giao diện hub + mọi app con theo docs/nguyen-tac-lam-viec.md.
//
//   node tools/soat-giao-dien.mjs                 soát hết (hub phải đang chạy ở :5180)
//   node tools/soat-giao-dien.mjs --chi=bao-cao,kpi
//   node tools/soat-giao-dien.mjs --hub=http://localhost:5180 --anh=thu-muc-chup
//
// Lái Chrome ẩn qua DevTools (không cần thư viện), mở từng app ở hai khổ:
// điện thoại 390×844 (tối) và máy tính 1440×900 (sáng). Chỉ ĐỌC trang: không
// bấm, không gửi gì, nên không đụng dữ liệu thật.
//
// LỖI (thoát mã 1, phải sửa trước khi đẩy lên):
//   - kéo ngang trên điện thoại: trang rộng hơn màn, hoặc vùng nội dung cuộn
//     ngang (trừ dải tab/lọc/chip và bảng lưới ngày × người)
//   - lỗi JS khi mở app
// CẢNH BÁO (xem, sửa nếu đúng là lệch):
//   - bo góc lệch thang (ô 10px, ô nhiều dòng 12px, nút tròn)
//   - chữ ô nhập < 16px trên điện thoại (iPhone tự phóng to khi chạm)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GOC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const thamSo = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const HUB = (thamSo.hub || 'http://localhost:5180').replace(/\/$/, '');
const CHROME = thamSo.chrome || process.env.CHROME ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    .find((p) => fs.existsSync(p));
const mods = JSON.parse(fs.readFileSync(path.join(GOC, 'modules.json'), 'utf8'));
const DS = (mods.modules || mods).filter((m) => m.kieu !== 'lark').map((m) => m.id)
  .filter((id) => !thamSo.chi || thamSo.chi.split(',').includes(id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Đo bên trong một trang (hub hoặc app con). Trả về { loi: [], canh: [] }. */
const DO = `(() => {
  const W = document.documentElement.clientWidth, dt = W <= 640;
  const loi = [], canh = [];
  const ten = (e) => (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : (e.id ? '' : e.tagName.toLowerCase()));
  const DAI = /(^|\\s)(tabs|pills|seg|hub-seg|chips?|loc-bar|loc|filters|ios-tabbar|thanh-ky|cxl-loc|day|tg-dong)(\\s|$)/;
  /* lưới hai chiều (người × ngày / tháng): tiêu đề cột đa số là ngày, thứ, tháng */
  const NGAY = /^(\\d{1,2}|T\\d{1,2}|CN|\\d{1,2}\\s*(T[2-7]|CN)|\\d{1,2}\\/\\d{1,2})$/i;
  const luoi = (e) => { const t = e.querySelector('table');
    let th = null;
    if (t && t.tHead) th = [...t.tHead.rows[t.tHead.rows.length - 1].cells].map((x) => (x.innerText || '').trim());
    else if (e.firstElementChild) th = [...e.firstElementChild.children].map((x) => (x.innerText || '').trim()).filter(Boolean);
    return !!th && th.length >= 4 && th.filter((x) => NGAY.test(x)).length >= th.length / 2; };
  if (dt && document.scrollingElement.scrollWidth > W + 1) loi.push('trang rộng ' + document.scrollingElement.scrollWidth + 'px > màn ' + W + 'px');
  document.querySelectorAll('body *').forEach((e) => {
    if (!e.getClientRects().length) return;
    const s = getComputedStyle(e); if (s.visibility === 'hidden') return;
    const b = e.getBoundingClientRect();
    if (dt && (s.overflowX === 'auto' || s.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 4 && b.height >= 30 &&
        !DAI.test(e.className || '') && !e.closest('.ios-giu-bang') && !luoi(e))
      loi.push('kéo ngang: ' + ten(e) + ' (' + e.clientWidth + '/' + e.scrollWidth + 'px)');
    const tag = e.tagName;
    const r = parseFloat(s.borderTopLeftRadius);
    if ((tag === 'INPUT' && /^(text|date|datetime-local|time|month|number|url|email|tel|password)$/.test(e.type) && !/^tìm/i.test(e.placeholder || '') && !/tim|search/i.test(e.id + ' ' + e.name + ' ' + e.className)) || (tag === 'SELECT' && !e.multiple && e.size <= 1)) {
      if (Math.abs(r - 10) > .5) canh.push('bo ' + r + 'px (cần 10): ' + ten(e));
      if (dt && parseFloat(s.fontSize) < 16) canh.push('chữ ' + s.fontSize + ' (< 16px) ở ô ' + ten(e));
    } else if (tag === 'TEXTAREA') {
      if (Math.abs(r - 12) > .5) canh.push('bo ' + r + 'px (cần 12): ô nhiều dòng ' + ten(e));
      if (dt && parseFloat(s.fontSize) < 16) canh.push('chữ ' + s.fontSize + ' (< 16px) ở ô ' + ten(e));
    } else if ((tag === 'BUTTON' || e.classList.contains('btn')) && b.height >= 24 && b.height <= 48 && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && r < b.height / 2 - 1 && !e.closest('.ng-pop, .pk-panel, .dd-panel, table, .ios-lens, .rail, .ios-tabbar, .cd-dt'))
      canh.push('nút không tròn (bo ' + r + 'px, cao ' + Math.round(b.height) + '): ' + ten(e));
  });
  const gon = (a) => [...new Set(a)];
  return JSON.stringify({ loi: gon(loi).slice(0, 12), canh: gon(canh).slice(0, 12), nCanh: gon(canh).length });
})()`;

async function chay(kho) {
  const port = 9600 + Math.floor(Math.random() * 300);
  const hoSo = fs.mkdtempSync(path.join(os.tmpdir(), 'soat-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--lang=vi', '--remote-debugging-port=' + port, '--user-data-dir=' + hoSo, '--window-size=' + kho.w + ',' + kho.h, 'about:blank'], { stdio: 'ignore' });
  let ws, seq = 0; const cho = new Map(); let loiJs = [];
  const gui = (method, params = {}, sessionId) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((ok, no) => { cho.set(id, { ok, no }); setTimeout(() => { if (cho.has(id)) { cho.delete(id); no(new Error('hết giờ ' + method)); } }, 60000); }); };
  try {
    let ver; for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json(); } catch (_) { await sleep(200); } }
    ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
      if (m.id && cho.has(m.id)) { const c = cho.get(m.id); cho.delete(m.id); m.error ? c.no(new Error(m.error.message)) : c.ok(m.result); }
      if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; loiJs.push(((d.exception || {}).description || d.text || '').split('\n')[0].slice(0, 160) + (d.url ? ' @ ' + d.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] + ':' + (d.lineNumber + 1) : '')); } });
    const { targetId } = await gui('Target.createTarget', { url: 'about:blank' });
    const { sessionId: S } = await gui('Target.attachToTarget', { targetId, flatten: true });
    const g = (m, p) => gui(m, p, S);
    await g('Page.enable'); await g('Runtime.enable');
    const dt = kho.w <= 640;
    await g('Emulation.setDeviceMetricsOverride', { width: kho.w, height: kho.h, deviceScaleFactor: 1, mobile: dt });
    if (dt) await g('Emulation.setTouchEmulationEnabled', { enabled: true });
    await g('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: kho.toi ? 'dark' : 'light' }] });
    const danhGia = async (expr) => { const r = await g('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
    const ket = [];
    await g('Page.navigate', { url: HUB + '/' }); await sleep(9000);
    ket.push({ app: 'hub', ...JSON.parse(await danhGia(DO)), js: loiJs.splice(0) });
    for (const id of DS) {
      await g('Page.navigate', { url: HUB + '/#/m/' + id }); await sleep(4000);
      /* chờ app dựng xong dữ liệu thật: khung xương (bản chụp lần trước) còn hiện
       * thì đo nhầm vào ảnh tạm. Tối đa 20 giây. */
      for (let i = 0; i < 32; i++) {
        const xong = await danhGia('(()=>{const f=[...document.querySelectorAll("iframe")].find(x=>x.offsetParent&&(x.getAttribute("src")||"").includes("/m/' + id + '/"));if(!f||!f.contentDocument)return false;const d=f.contentDocument;return d.readyState==="complete"&&!d.querySelector(".kx, .kx-vung, [data-kx-xem], [aria-busy=\\"true\\"]")&&!f.parentNode.querySelector(".frame-loading")})()').catch(() => false);
        if (xong) break;
        await sleep(500);
      }
      await sleep(800);
      let r;
      try {
        r = JSON.parse(await danhGia('(async()=>{const f=[...document.querySelectorAll("iframe")].find(x=>x.offsetParent&&(x.getAttribute("src")||"").includes("/m/' + id + '/"));if(!f)return JSON.stringify({loi:["không thấy khung app"],canh:[],nCanh:0});return f.contentWindow.eval(' + JSON.stringify(DO) + ');})()'));
      } catch (e) { r = { loi: ['không đo được: ' + e.message], canh: [], nCanh: 0 }; }
      if (thamSo.anh) { fs.mkdirSync(thamSo.anh, { recursive: true }); const a = await g('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(thamSo.anh, kho.ten + '-' + id + '.png'), Buffer.from(a.data, 'base64')); }
      ket.push({ app: id, ...r, js: loiJs.splice(0) });
    }
    return ket;
  } finally { try { chrome.kill(); } catch (_) {} }
}

const KHO = [{ ten: 'dien-thoai', w: 390, h: 844, toi: true }, { ten: 'may-tinh', w: 1440, h: 900, toi: false }];
if (!CHROME) { console.error('Không tìm thấy Chrome. Truyền --chrome=đường-dẫn.'); process.exit(2); }
try { await fetch(HUB + '/'); } catch (_) { console.error('Hub chưa chạy ở ' + HUB); process.exit(2); }
console.log('Soát ' + (DS.length + 1) + ' màn × ' + KHO.length + ' khổ…');
const tatCa = await Promise.all(KHO.map((k) => chay(k).then((r) => ({ k, r }))));
let soLoi = 0, soCanh = 0;
for (const { k, r } of tatCa) {
  console.log('\n== ' + k.ten + ' (' + k.w + '×' + k.h + (k.toi ? ', tối' : ', sáng') + ')');
  for (const x of r) {
    const loi = [...x.loi, ...x.js.map((m) => 'lỗi JS: ' + m)];
    soLoi += loi.length; soCanh += x.nCanh || 0;
    if (!loi.length && !x.canh.length) continue;
    console.log('  ' + x.app);
    loi.forEach((m) => console.log('    ✖ ' + m));
    x.canh.forEach((m) => console.log('    · ' + m));
    if (x.nCanh > x.canh.length) console.log('    · … và ' + (x.nCanh - x.canh.length) + ' cảnh báo nữa');
  }
}
console.log('\n' + (soLoi ? '✖ ' + soLoi + ' lỗi phải sửa' : '✔ Không có lỗi') + ' · ' + soCanh + ' cảnh báo');
process.exit(soLoi ? 1 : 0);
