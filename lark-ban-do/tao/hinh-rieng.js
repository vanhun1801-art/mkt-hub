'use strict';
/* ==========================================================================
   Hình minh hoạ tự vẽ cho từng điểm (anh Hùng 25/09: "sau này tự vẽ bên ngoài rồi thêm vào").

   Bỏ file vào thư mục lark-ban-do/hinh-rieng/, đặt TÊN FILE = MÃ ĐIỂM, ví dụ:
       hinh-rieng/vinwonders.png   hinh-rieng/san-bay.webp   hinh-rieng/rach-vem.svg
   (bảng mã trong hinh-rieng/DOC-TRUOC.md). Chạy `node tao/dong-goi.js` (hoặc bấm đúp
   hinh-rieng/CAP-NHAT-BAN-DO.bat) là xong.

   26/09: mỗi hình được Chrome (chạy ẩn) xử lý trước khi nhúng:
     · CẮT SÁT viền trong suốt — hình xuất khung ngang 1536×1024 còn nhiều khoảng trống
       trước đây hiện rất nhỏ trên bản đồ
     · thu về tối đa 512 px, lưu WebP — 3 hình gốc 7 MB còn vài trăm KB
   Kết quả lưu đệm theo (tên, cỡ, ngày sửa) trong tao/dem/hinh-rieng.json — hình không đổi
   thì lần sau không xử lý lại. Không có Chrome thì nhúng nguyên file như cũ.

   Cỡ hiển thị riêng từng hình (tuỳ chọn): hinh-rieng/kich-thuoc.json, ví dụ
       { "safari": 1.3, "cau-hon": 0.9 }      (1 = cỡ mặc định của hình riêng)

   Chạy riêng:  node tao/hinh-rieng.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const THU_MUC = path.join(__dirname, '..', 'hinh-rieng');
const RA = path.join(__dirname, '..', 'public', 'hinh-rieng.js');
const DEM = path.join(__dirname, 'dem', 'hinh-rieng.json');
const KIEU = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((f) => fs.existsSync(f));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* xử lý trong trang Chrome: nạp hình → tìm khung chứa điểm ảnh không trong suốt → cắt → thu → WebP */
const XU_LY = `async (src) => {
  const img = new Image();
  await new Promise((ok, loi) => { img.onload = ok; img.onerror = () => loi(new Error('không nạp được')); img.src = src; });
  const W = img.naturalWidth || 1024, H = img.naturalHeight || 1024;
  const k0 = Math.min(1, 1600 / Math.max(W, H));
  const c = document.createElement('canvas'); c.width = Math.round(W * k0); c.height = Math.round(H * k0);
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x1 = c.width, y1 = c.height, x2 = -1, y2 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (d[(y * c.width + x) * 4 + 3] > 10) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
  }
  if (x2 < 0) { x1 = 0; y1 = 0; x2 = c.width - 1; y2 = c.height - 1; }
  const bw = x2 - x1 + 1, bh = y2 - y1 + 1, k = Math.min(1, 512 / Math.max(bw, bh));
  const o = document.createElement('canvas'); o.width = Math.round(bw * k); o.height = Math.round(bh * k);
  const go = o.getContext('2d'); go.imageSmoothingQuality = 'high';
  go.drawImage(c, x1, y1, bw, bh, 0, 0, o.width, o.height);
  return { url: o.toDataURL('image/webp', .9), w: o.width, h: o.height, cat: [W, H, Math.round(bw / k0), Math.round(bh / k0)] };
}`;

async function moChrome() {
  if (!CHROME) return null;
  const PORT = 9402;
  const p = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(require('os').tmpdir(), 'chrome-hinh-rieng'), 'about:blank']);
  let ws;
  for (let i = 0; i < 50 && !ws; i++) {
    try { const j = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json(); const t = j.find((x) => x.type === 'page'); if (t) ws = t.webSocketDebuggerUrl; } catch (_) { /* chưa lên */ }
    if (!ws) await sleep(250);
  }
  if (!ws) { p.kill(); return null; }
  const s = new WebSocket(ws);
  await new Promise((r) => (s.onopen = r));
  let id = 0; const cho = {};
  s.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && cho[d.id]) { cho[d.id](d); delete cho[d.id]; } };
  const goi = (method, params) => new Promise((r) => { const i = ++id; cho[i] = r; s.send(JSON.stringify({ id: i, method, params })); });
  return {
    xuLy: async (src) => {
      const r = await goi('Runtime.callFunctionOn', { functionDeclaration: XU_LY, arguments: [{ value: src }], awaitPromise: true, returnByValue: true, executionContextId: undefined, objectId: undefined })
        .catch(() => null);
      return r;
    },
    danhGia: (expr) => goi('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
    dong: () => { try { s.close(); } catch (_) { /* đã đóng */ } p.kill(); },
  };
}

async function dungHinhRieng() {
  const ma = new Set();
  try {
    const src = fs.readFileSync(path.join(__dirname, '..', 'diem.js'), 'utf8');
    for (const m of src.matchAll(/\bid:\s*'([a-z0-9-]+)'/g)) ma.add(m[1]);
    /* phương tiện chạy trên bản đồ (26/09) */
    /* nhiều mẫu cho một loại: xe-may-bay, xe-may-bay-2 … xe-may-bay-9 (các chiếc lần lượt dùng từng mẫu) */
    for (const x of ['xe-may-bay', 'xe-tau', 'xe-cano', 'xe-cabin', 'xe-buom']) { ma.add(x); for (let i = 2; i <= 9; i++) ma.add(x + '-' + i); }
  } catch (_) { /* không đọc được danh mục: nhận mọi tên */ }
  let kichThuoc = {};
  try { kichThuoc = JSON.parse(fs.readFileSync(path.join(THU_MUC, 'kich-thuoc.json'), 'utf8')); } catch (_) { /* không có — dùng mặc định */ }
  let dem = {};
  try { dem = JSON.parse(fs.readFileSync(DEM, 'utf8')); } catch (_) { /* chưa có đệm */ }

  const files = (fs.existsSync(THU_MUC) ? fs.readdirSync(THU_MUC) : []).filter((f) => KIEU[path.extname(f).toLowerCase()]);
  const ra = {}, lech = [], ghi = [];
  let chrome = null, goc = 0, sau = 0;
  for (const f of files) {
    const duoi = path.extname(f).toLowerCase(), id = path.basename(f, path.extname(f));
    if (ma.size && !ma.has(id)) { lech.push(f); continue; }
    const st = fs.statSync(path.join(THU_MUC, f)), khoa = f + '|' + st.size + '|' + st.mtimeMs;
    goc += st.size;
    let kq = dem[id] && dem[id].khoa === khoa ? dem[id] : null;
    if (!kq) {
      const buf = fs.readFileSync(path.join(THU_MUC, f));
      const src = 'data:' + KIEU[duoi] + ';base64,' + buf.toString('base64');
      if (chrome === null) chrome = (await moChrome()) || false;
      if (chrome) {
        await chrome.danhGia('window.__xl = ' + XU_LY);
        const r = await chrome.danhGia('window.__xl(' + JSON.stringify(src) + ')');
        const v = r && r.result && r.result.result && r.result.result.value;
        if (v && v.url) {
          kq = { khoa, url: v.url, w: v.w, h: v.h };
          ghi.push(id + ' ' + v.cat[0] + '×' + v.cat[1] + ' → cắt ' + v.cat[2] + '×' + v.cat[3] + ' → ' + v.w + '×' + v.h);
        }
      }
      if (!kq) kq = { khoa, url: src, w: 0, h: 0 };                 // không xử lý được: nhúng nguyên
      dem[id] = kq;
    }
    sau += kq.url.length * .75;
    ra[id] = { url: kq.url, w: kq.w, h: kq.h, co: +kichThuoc[id] || 1 };
  }
  if (chrome) chrome.dong();
  for (const id of Object.keys(dem)) if (!ra[id]) delete dem[id];
  fs.mkdirSync(path.dirname(DEM), { recursive: true });
  fs.writeFileSync(DEM, JSON.stringify(dem));
  fs.writeFileSync(RA, '/* SINH TỰ ĐỘNG bởi tao/hinh-rieng.js từ thư mục hinh-rieng/ — đừng sửa tay. */\n' +
    'window.PQ_HINH_RIENG = ' + JSON.stringify(ra) + ';\n');
  for (const g of ghi) console.log('  xử lý:', g);
  console.log('hình riêng:', Object.keys(ra).length ? Object.keys(ra).join(', ') : '(chưa có)', '·', (goc / 1048576).toFixed(1) + ' MB gốc →', (sau / 1024).toFixed(0) + ' KB nhúng');
  if (lech.length) console.log('  ⚠ bỏ qua vì tên file không trùng mã điểm nào:', lech.join(', '));
}

module.exports = { dungHinhRieng };
if (require.main === module) dungHinhRieng().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
