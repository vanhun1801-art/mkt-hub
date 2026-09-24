'use strict';
/* ==========================================================================
   Đổ bóng địa hình (hillshade) cho bản đồ vector — dựng MỘT LẦN, nhúng vào trang.

   Anh Hùng 25/09 gửi bản đồ Sunset Town: "nhìn rất chi tiết và thực tế". Phần làm
   nên cảm giác thật là đồi núi có khối. Script này:
     1. tải ô độ cao Terrarium (AWS Terrain Tiles, công khai) phủ Phú Quốc
     2. giải mã PNG → độ cao (m) = R·256 + G + B/256 − 32768
     3. tính đổ bóng (nắng hướng Tây Bắc 315°, cao 45°) trên đúng phép chiếu của bản đồ
     4. ghi ảnh xám PNG (128 = phẳng, tối = sườn khuất, sáng = sườn đón nắng) vào
        public/dia-hinh.js — trang trộn nó lên mặt đất bằng chế độ overlay.
   Không cần thư viện: giải/nén PNG bằng zlib có sẵn của Node.

   Chạy:  node tao/dia-hinh.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { CHIEU } = require('./chieu');

const Z = 12;                                   // ~38 m/điểm ảnh ở vĩ độ này — đủ mịn cho đồi Phú Quốc
const K = 1.6;                                  // điểm ảnh cho mỗi đơn vị bản đồ
const DEM = path.join(__dirname, 'dem');
const RA = path.join(__dirname, '..', 'public', 'dia-hinh.js');

const tileX = (lon) => (lon + 180) / 360 * 2 ** Z;
const tileY = (lat) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** Z; };

/* ---------- PNG tối giản: đọc RGB/RGBA 8-bit, ghi ảnh xám 8-bit ---------- */
function docPng(buf) {
  let p = 8, w, h, loai, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kieu = buf.toString('ascii', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (kieu === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); loai = d[9]; if (d[8] !== 8 || d[12]) throw new Error('PNG lạ'); }
    else if (kieu === 'IDAT') idat.push(d);
    else if (kieu === 'IEND') break;
    p += 12 + len;
  }
  const bpp = loai === 6 ? 4 : loai === 2 ? 3 : 0;
  if (!bpp) throw new Error('PNG kiểu ' + loai + ' chưa hỗ trợ');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const dong = w * bpp, ra = Buffer.alloc(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (dong + 1)], src = raw.subarray(y * (dong + 1) + 1, (y + 1) * (dong + 1));
    const o = y * dong;
    for (let x = 0; x < dong; x++) {
      const a = x >= bpp ? ra[o + x - bpp] : 0, b = y ? ra[o - dong + x] : 0, c = x >= bpp && y ? ra[o - dong + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      ra[o + x] = v & 255;
    }
  }
  return { w, h, bpp, px: ra };
}
function crc32(b) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < b.length; n++) { c = (crc ^ b[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function ghiPngXam(w, h, px) {
  const khoi = (kieu, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const t = Buffer.concat([Buffer.from(kieu), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(t)); return Buffer.concat([l, t, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {                     // lọc "Sub" cho ảnh mịn nén tốt hơn
    raw[y * (w + 1)] = 1;
    for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (px[y * w + x] - (x ? px[y * w + x - 1] : 0)) & 255;
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), khoi('IHDR', ihdr), khoi('IDAT', zlib.deflateSync(raw, { level: 9 })), khoi('IEND', Buffer.alloc(0))]);
}

async function taiO(x, y) {
  fs.mkdirSync(DEM, { recursive: true });
  const f = path.join(DEM, Z + '-' + x + '-' + y + '.png');
  if (!fs.existsSync(f)) {
    /* tải bằng curl: fetch của Node không đi qua proxy PAC của máy (đã gặp 25/09) */
    require('child_process').execFileSync('curl', ['-s', '-f', '-m', '60', '-o', f,
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + Z + '/' + x + '/' + y + '.png']);
  }
  return docPng(fs.readFileSync(f));
}

(async () => {
  const x0 = Math.floor(tileX(CHIEU.TAY)), x1 = Math.floor(tileX(CHIEU.DONG));
  const y0 = Math.floor(tileY(CHIEU.BAC)), y1 = Math.floor(tileY(CHIEU.NAM));
  const o = {};
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) o[x + '/' + y] = await taiO(x, y);
  console.log('ô độ cao:', Object.keys(o).length);

  /* độ cao tại (lat, lon), nội suy song tuyến; biển (âm) coi như 0 để mặt biển không bị đổ bóng */
  const cao = (lat, lon) => {
    const fx = tileX(lon), fy = tileY(lat);
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const t = o[tx + '/' + ty];
    if (!t) return 0;
    const px = (fx - tx) * 256 - .5, py = (fy - ty) * 256 - .5;
    const g = (ix, iy) => {
      ix = Math.max(0, Math.min(255, ix)); iy = Math.max(0, Math.min(255, iy));
      const i = (iy * 256 + ix) * t.bpp;
      return Math.max(0, t.px[i] * 256 + t.px[i + 1] + t.px[i + 2] / 256 - 32768);
    };
    const ix = Math.floor(px), iy = Math.floor(py), dx = px - ix, dy = py - iy;
    return g(ix, iy) * (1 - dx) * (1 - dy) + g(ix + 1, iy) * dx * (1 - dy) + g(ix, iy + 1) * (1 - dx) * dy + g(ix + 1, iy + 1) * dx * dy;
  };

  const W = Math.round(CHIEU.rong * K), Hh = Math.round(CHIEU.cao * K);
  const latCua = (y) => CHIEU.BAC - y / K / CHIEU.K;
  const lonCua = (x) => CHIEU.TAY + x / K / (CHIEU.K * CHIEU.COS);
  const E = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) E[y * W + x] = cao(latCua(y), lonCua(x));

  /* đổ bóng: nắng từ Tây Bắc, phóng đại độ dốc 2,2 lần cho đồi thấp của đảo vẫn nổi khối */
  const met = 111320 / CHIEU.K / K;                   // mét cho mỗi điểm ảnh
  const PHONG = 2.2, AZ = 315 * Math.PI / 180, ALT = 45 * Math.PI / 180;
  const out = Buffer.alloc(W * Hh, 128);
  for (let y = 1; y < Hh - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const e = (dx, dy) => E[(y + dy) * W + x + dx];
      const dzdx = ((e(1, -1) + 2 * e(1, 0) + e(1, 1)) - (e(-1, -1) + 2 * e(-1, 0) + e(-1, 1))) / (8 * met) * PHONG;
      const dzdy = ((e(-1, 1) + 2 * e(0, 1) + e(1, 1)) - (e(-1, -1) + 2 * e(0, -1) + e(1, -1))) / (8 * met) * PHONG;
      const doc = Math.atan(Math.hypot(dzdx, dzdy));
      const huong = Math.atan2(dzdy, -dzdx);
      let hs = Math.cos(ALT) * Math.cos(doc) + Math.sin(ALT) * Math.sin(doc) * Math.cos(AZ - huong);
      /* đưa về quanh 128: vùng phẳng (hs = cos 45° ≈ .71) phải ra đúng 128 để không làm tối cả đảo */
      const v = 128 + (hs - Math.cos(ALT)) * 260;
      out[y * W + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  const png = ghiPngXam(W, Hh, out);
  /* 25/09 (bản minh hoạ): thêm ảnh ĐỘ CAO để trang tô màu địa hình theo tầng (đất – đồi – núi –
     rừng sâu) thay cho đổ bóng đen. Mã hoá căn bậc hai để đồi thấp (20–150 m) có nhiều bậc màu. */
  let caoMax = 0;
  for (let i = 0; i < E.length; i++) if (E[i] > caoMax) caoMax = E[i];
  const cao8 = Buffer.alloc(W * Hh);
  for (let i = 0; i < E.length; i++) cao8[i] = Math.round(255 * Math.sqrt(Math.min(E[i], 600) / 600));
  const pngCao = ghiPngXam(W, Hh, cao8);
  /* lưới độ cao cho tao/hinh.js (chọn loại cây theo độ cao) */
  fs.writeFileSync(path.join(DEM, 'cao.json'), JSON.stringify({ w: W, h: Hh, k: K, cao: Array.from(cao8) }));
  fs.writeFileSync(RA, '/* SINH TỰ ĐỘNG bởi tao/dia-hinh.js — đổ bóng + độ cao địa hình từ AWS Terrain Tiles (Mapzen), ' + W + '×' + Hh + '. */\n' +
    'window.PQ_DIA_HINH = { w: ' + W + ', h: ' + Hh + ', k: ' + K + ", anh: 'data:image/png;base64," + png.toString('base64') +
    "', cao: 'data:image/png;base64," + pngCao.toString('base64') + "' };\n");
  console.log('độ cao lớn nhất:', Math.round(caoMax), 'm · ảnh độ cao', (pngCao.length / 1024).toFixed(0) + ' KB');
  console.log('đổ bóng:', W + '×' + Hh, '·', (png.length / 1024).toFixed(0) + ' KB');
})().catch((e) => { console.error(e.message); process.exit(1); });
