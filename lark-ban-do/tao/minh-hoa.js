'use strict';
/* ==========================================================================
   Lớp minh hoạ cho bản đồ kiểu "illustrated tourism map" (25/09, bản thử nghiệm):
     · cayCum()  — cây GOM CỤM thay cho rải đều: Bắc đảo + vườn quốc gia dày, núi có cây rừng
                   sẫm, Dương Đông / Bãi Trường / Sunset Town / An Thới chừa khoảng thở.
                   5 loại: 0 tán tròn nhiệt đới · 1 cây rừng · 2 dừa · 3 bụi thấp · 4 cây núi.
     · doThi()   — cụm nhà mini (không vẽ từng toà thật): khối nhà dọc đường khu dân cư cho
                   đô thị, dãy villa + hồ bơi dọc bãi cho resort.
   Cả hai tất định (hạt ngẫu nhiên cố định) → mỗi lần dựng ra y hệt.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { CHIEU } = require('./chieu');

const so = (n) => Math.round(n * 10) / 10;
const ngauNhien = (hat) => () => { hat = (hat * 16807) % 2147483647; return hat / 2147483647; };
const P = (lat, lon) => CHIEU.xy(lat, lon);

/* độ cao (m) từ tao/dem/cao.json do tao/dia-hinh.js ghi; không có thì coi như phẳng */
function docDoCao() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'dem', 'cao.json'), 'utf8'));
    return (x, y) => {
      const ix = Math.floor(x * j.k), iy = Math.floor(y * j.k);
      if (ix < 0 || iy < 0 || ix >= j.w || iy >= j.h) return 0;
      const v = j.cao[iy * j.w + ix] / 255;
      return v * v * 600;
    };
  } catch (_) { return () => 0; }
}

/* khu cần khoảng thở (đơn vị bản đồ ≈ 74 m): cây thưa hẳn trong bán kính, thưa dần tới 1,6 lần */
const KHU_THO = [
  [10.218, 103.962, 16],                       // Dương Đông
  [10.178, 103.970, 7], [10.155, 103.975, 7], [10.132, 103.978, 7], [10.108, 103.986, 6],   // dải Bãi Trường
  [10.168, 103.996, 13],                       // sân bay
  [10.028, 104.007, 8], [10.014, 104.014, 8],  // Sunset Town · An Thới
  [10.330, 103.857, 7], [10.338, 103.853, 5],  // Grand World · VinWonders
  [10.355, 103.852, 5], [10.372, 103.848, 4],  // resort Bãi Dài · Gành Dầu
  [10.036, 104.031, 4],                        // Bãi Khem
].map(([lat, lon, r]) => { const [x, y] = P(lat, lon); return { x, y, r }; });
const doTho = (x, y) => {
  let k = 1;
  for (const z of KHU_THO) {
    const d = Math.hypot(x - z.x, y - z.y) / z.r;
    if (d < 1) return 0;
    if (d < 1.6) k = Math.min(k, (d - 1) / .6 * .8);
  }
  return k;
};

function cayCum({ daoXY, hon, rung, trongDa }) {
  const r = ngauNhien(20260926);
  const cao = docDoCao();
  const trongDao = (p, le) => trongDa(p, daoXY) &&
    trongDa([p[0] + le, p[1]], daoXY) && trongDa([p[0] - le, p[1]], daoXY) &&
    trongDa([p[0], p[1] + le], daoXY) && trongDa([p[0], p[1] - le], daoXY);
  const latCua = (y) => CHIEU.BAC - y / CHIEU.K;
  const xs = daoXY.map((p) => p[0]), ys = daoXY.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cay = [];
  const BUOC = 21;
  for (let y = y0; y < y1; y += BUOC) {
    for (let x = x0; x < x1; x += BUOC) {
      const c = [x + (r() - .5) * BUOC * .9, y + (r() - .5) * BUOC * .9];
      if (!trongDao(c, 5)) continue;
      const e = cao(c[0], c[1]), trongRung = rung.some((v) => trongDa(c, v)), bac = latCua(c[1]) > 10.27;
      let w = trongRung ? (bac ? .56 : .34) : e > 60 ? .26 : .045;
      w *= doTho(c[0], c[1]);
      if (r() > w) continue;
      const n = trongRung ? 3 + Math.floor(r() * 4) : 2 + Math.floor(r() * 3);
      const R = 3.5 + r() * 4.5;
      for (let j = 0; j < n; j++) {
        const g = r() * 6.283, kc = R * Math.sqrt(r());
        const q = [c[0] + Math.cos(g) * kc, c[1] + Math.sin(g) * kc * .8];
        if (!trongDao(q, 2) || r() > doTho(q[0], q[1]) + .05) continue;
        const eq = cao(q[0], q[1]);
        const loai = eq > 170 ? (r() < .7 ? 4 : 1) : trongRung ? (r() < .6 ? 1 : 0) : (r() < .45 ? 3 : 0);
        /* cây giữa cụm to hơn → có tiền cảnh / hậu cảnh */
        const co = (loai === 3 ? 3.4 : 4.3) + r() * 2.2 * (1 - .45 * kc / R);
        cay.push([q[0], q[1], co, loai]);
      }
    }
  }
  /* dừa: bờ Tây (resort) và Nam đảo dày hơn; bờ Đông/Bắc lác đác */
  let quang = 0;
  for (let i = 1; i < daoXY.length; i++) {
    const [xa, ya] = daoXY[i - 1], [xb, yb] = daoXY[i];
    quang += Math.hypot(xb - xa, yb - ya);
    if (quang < 10) continue;
    quang = 0;
    const lat = latCua(yb), lon = CHIEU.TAY + xb / (CHIEU.K * CHIEU.COS);
    const tay = lon < 103.99 && lat < 10.36 && lat > 10.05;
    if (r() > (tay || lat < 10.06 ? .42 : .14)) continue;
    for (let g = 0; g < 8; g++) {
      const a = g * Math.PI / 4, q = [xb + Math.cos(a) * 4.5, yb + Math.sin(a) * 4.5];
      if (trongDao(q, 1.5)) { cay.push([q[0], q[1], 4.6 + r() * 2, 2]); break; }
    }
  }
  /* đảo tour phía Nam: vài cây dừa + bụi trên mỗi hòn đủ lớn */
  for (const o of hon) {
    const cx = o.v.reduce((a, p) => a + p[0], 0) / o.v.length, cy = o.v.reduce((a, p) => a + p[1], 0) / o.v.length;
    if (latCua(cy) > 10.0 || o.s < 6) continue;
    const n = Math.min(7, 2 + Math.floor(o.s / 25));
    for (let j = 0, thu = 0; j < n && thu < 60; thu++) {
      const q = [cx + (r() - .5) * Math.sqrt(o.s) * 1.1, cy + (r() - .5) * Math.sqrt(o.s) * 1.1];
      if (!trongDa(q, o.v)) continue;
      cay.push([q[0], q[1], 3.8 + r() * 1.6, r() < .6 ? 2 : 3]);
      j++;
    }
  }
  cay.sort((a, b) => a[1] - b[1]);
  return cay;
}

/* ---------------- cụm đô thị + resort ---------------- */
const MAU = {
  cam: '#e99138', ngoi: '#c8643b', kem: '#fff3d7', trang: '#ffffff', xanh: '#9fcfe8', hong: '#f2aaa0', vang: '#f6d27a',
};
const CUM = [
  /* [tên, lat, lon, bán kính, kiểu, bảng màu] — kiểu 'pho' = khối dọc đường, 'resort' = villa dọc bãi */
  ['Dương Đông', 10.218, 103.964, 21, 'pho', ['cam', 'ngoi', 'kem', 'trang', 'cam', 'ngoi', 'xanh']],
  ['An Thới', 10.012, 104.016, 13, 'pho', ['kem', 'cam', 'trang', 'xanh', 'ngoi']],
  ['Sunset Town', 10.030, 104.007, 6, 'pho', ['hong', 'vang', 'cam', 'xanh', 'kem', 'hong']],
  ['Grand World', 10.326, 103.858, 5, 'pho', ['cam', 'vang', 'ngoi', 'cam']],
  ['Hàm Ninh', 10.182, 104.052, 8, 'pho', ['kem', 'cam', 'xanh']],
  /* resort: khung [lat nam, lat bắc] × [lon tây, lon đông] ôm đúng dải bờ (1 đơn vị ≈ 74 m) */
  ['Bãi Trường', [10.088, 10.186], [103.950, 103.992], 0, 'resort', ['trang', 'kem', 'ngoi', 'cam']],
  ['Bãi Dài', [10.330, 10.362], [103.835, 103.862], 0, 'resort', ['trang', 'kem', 'ngoi']],
  ['Gành Dầu', [10.366, 10.392], [103.835, 103.862], 0, 'resort', ['trang', 'kem', 'ngoi']],
  ['Bãi Khem', [10.028, 10.043], [104.022, 104.042], 0, 'resort', ['trang', 'kem', 'ngoi']],
  ['Bãi Sao', [10.046, 10.064], [104.028, 104.046], 0, 'resort', ['trang', 'kem']],
  ['Hòn Thơm', [9.940, 9.966], [104.008, 104.030], 0, 'resort', ['trang', 'kem', 'xanh', 'cam']],
];

function doThi({ daoXY, hon, duongDs, trongDa }) {
  const r = ngauNhien(918273);
  const moiDat = [daoXY, ...hon.map((o) => o.v)];
  const laDat = (p) => moiDat.some((v) => trongDa(p, v));
  const [sb1, sb2] = [P(10.1745, 103.978), P(10.166, 104.014)];        // khung sân bay: không đặt nhà
  const trongSanBay = (x, y) => x > sb1[0] && x < sb2[0] && y > sb1[1] && y < sb2[1];
  const o = new Map();                                                 // lưới chống chồng 1,4 đơn vị
  const trong = (x, y, rr) => {
    const kx = Math.floor(x / 1.4), ky = Math.floor(y / 1.4);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const b of o.get((kx + i) + ',' + (ky + j)) || []) if (Math.hypot(b[0] - x, b[1] - y) < rr + b[2]) return false;
    }
    return true;
  };
  const giu = (x, y, rr) => { const k = Math.floor(x / 1.4) + ',' + Math.floor(y / 1.4); if (!o.has(k)) o.set(k, []); o.get(k).push([x, y, rr]); };
  const nha = {}; for (const m in MAU) nha[m] = { sang: [], toi: [] };
  const hoBoi = [];
  let dem = 0;
  const demCum = {};
  /* lưới đoạn đường (ô 5 đơn vị) để tìm đoạn gần nhất */
  const luoi = new Map();
  for (const pts of duongDs) for (let i = 1; i < pts.length; i++) {
    const [xa, ya] = pts[i - 1], [xb, yb] = pts[i];
    const k = Math.floor((xa + xb) / 10) + ',' + Math.floor((ya + yb) / 10);
    if (!luoi.has(k)) luoi.set(k, []);
    luoi.get(k).push([xa, ya, xb, yb]);
  }
  const ganNhat = (x, y) => {
    let tot = null;
    const kx = Math.floor(x / 5), ky = Math.floor(y / 5);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [xa, ya, xb, yb] of luoi.get((kx + i) + ',' + (ky + j)) || []) {
      const dx = xb - xa, dy = yb - ya, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - xa) * dx + (y - ya) * dy) / L2));
      const kc = Math.hypot(x - xa - dx * t, y - ya - dy * t);
      if (!tot || kc < tot.kc) { const L = Math.sqrt(L2); tot = { kc, ux: dx / L, uy: dy / L }; }
    }
    return tot;
  };
  /* khối nhà hình chữ nhật xoay theo hướng (ux, uy); mái chia đôi theo sống dọc: nửa sáng / nửa tối */
  const khoi = (x, y, ux, uy, dai, rong, mau) => {
    const vx = -uy, vy = ux, a = dai / 2, b = rong / 2;
    const g = (s, t) => [x + ux * s + vx * t, y + uy * s + vy * t];
    const pa = [g(-a, -b), g(a, -b), g(a, 0), g(-a, 0)], pb = [g(-a, 0), g(a, 0), g(a, b), g(-a, b)];
    const d = (q) => 'M' + so(q[0][0]) + ' ' + so(q[0][1]) + q.slice(1).map((p, i) => 'l' + so(p[0] - q[i][0]) + ' ' + so(p[1] - q[i][1])).join('') + 'z';
    /* nửa quay về Tây Bắc (nguồn sáng) là nửa sáng */
    const sangA = (vx * -1 + vy * -1) > 0;
    nha[mau][sangA ? 'toi' : 'sang'].push(d(pa));
    nha[mau][sangA ? 'sang' : 'toi'].push(d(pb));
    dem++;
  };
  for (const [tenCum, lat, lon, R, kieu, bang] of CUM) {
    const dem0 = dem;
    const [cx, cy] = kieu === 'pho' ? P(lat, lon) : [0, 0];
    const [kx1, ky1] = kieu === 'pho' ? [0, 0] : P(lat[1], lon[0]), [kx2, ky2] = kieu === 'pho' ? [0, 0] : P(lat[0], lon[1]);
    const chon = () => bang[Math.floor(r() * bang.length)];
    if (kieu === 'pho') {
      for (const pts of duongDs) {
        for (let i = 1; i < pts.length; i++) {
          const [xa, ya] = pts[i - 1], [xb, yb] = pts[i];
          const L = Math.hypot(xb - xa, yb - ya);
          if (L < .3) continue;
          const ux = (xb - xa) / L, uy = (yb - ya) / L;
          for (let s = r() * 1.4; s < L; s += 1.35 + r() * .4) {
            const px = xa + ux * s, py = ya + uy * s;
            const d = Math.hypot(px - cx, py - cy) / R;
            if (d > 1) continue;
            const mat = Math.pow(1 - d, .6);
            /* 3 hàng lùi dần vào trong: mặt tiền dày, hàng sau thưa */
            for (const ben of [-1, 1]) {
              for (const [hang, xs] of [[0, .92], [1, .62], [2, .34]]) {
                if (r() > xs * mat) break;
                const dai = .9 + r() * .7, rong = .7 + r() * .4, lui = .6 + rong / 2 + hang * 1.25;
                const x = px - uy * ben * lui, y = py + ux * ben * lui;
                if (!laDat([x, y]) || trongSanBay(x, y) || !trong(x, y, .48)) break;
                giu(x, y, .48);
                khoi(x, y, ux, uy, dai, rong, chon());
              }
            }
          }
        }
      }
      /* lấp khoảng trống: điểm ngẫu nhiên trong khu, bám hướng đoạn đường gần nhất (≤ 4,5 đơn vị) */
      for (let t = 0; t < R * R * 6; t++) {
        const g = r() * 6.283, d = Math.sqrt(r());
        const x = cx + Math.cos(g) * d * R, y = cy + Math.sin(g) * d * R;
        if (r() > .85 * Math.pow(1 - d, .5)) continue;
        const sg = ganNhat(x, y);
        if (!sg || sg.kc < .9 || sg.kc > 6) continue;
        if (!laDat([x, y]) || trongSanBay(x, y) || !trong(x, y, .48)) continue;
        giu(x, y, .48);
        khoi(x, y, sg.ux, sg.uy, .9 + r() * .7, .7 + r() * .4, chon());
      }
    } else {
      /* resort: đi dọc bờ trong bán kính, hướng vào đất liền: hàng villa + hồ bơi, hàng khách sạn */
      for (const v of moiDat) {
        /* lấy mẫu đều 1,9 đơn vị dọc từng đoạn bờ (bờ thẳng như Bãi Trường chỉ có vài đỉnh OSM) */
        const mau = [];
        let du = 0;
        for (let i = 1; i < v.length; i++) {
          const [xa, ya] = v[i - 1], [xb, yb] = v[i];
          const L = Math.hypot(xb - xa, yb - ya);
          if (!L) continue;
          for (let t = 1.9 - du; t <= L; t += 1.9) mau.push([xa + (xb - xa) * t / L, ya + (yb - ya) * t / L, (xb - xa) / L, (yb - ya) / L]);
          du = (du + L) % 1.9;
        }
        for (const [xb, yb, ux, uy] of mau) {
          if (xb < kx1 || xb > kx2 || yb < ky1 || yb > ky2) continue;
          let nx = -uy, ny = ux;
          if (!trongDa([xb + nx * 3, yb + ny * 3], v)) { nx = -nx; ny = -ny; }
          if (!trongDa([xb + nx * 3, yb + ny * 3], v)) continue;
          /* villa sát bãi (lùi 3,2) + hồ bơi phía biển */
          const vx = xb + nx * 3.2, vy = yb + ny * 3.2;
          if (r() < .92 && trong(vx, vy, .6)) {
            giu(vx, vy, .6);
            khoi(vx, vy, ux, uy, .95, .85, chon());
            if (r() < .6) hoBoi.push([xb + nx * 2.1, yb + ny * 2.1, ux, uy]);
          }
          /* khách sạn phía trong (lùi 6) */
          const hx = xb + nx * 6, hy = yb + ny * 6;
          if (r() < .7 && trongDa([hx, hy], v) && !trongSanBay(hx, hy) && trong(hx, hy, 1.1)) {
            giu(hx, hy, 1.1);
            khoi(hx, hy, ux, uy, 2.4, 1.05, r() < .6 ? 'trang' : chon());
          }
        }
      }
    }
    demCum[tenCum] = dem - dem0;
  }
  if (process.env.DBG) console.log(demCum);
  const boi = hoBoi.map(([x, y, ux, uy]) => {
    const vx = -uy, vy = ux, a = .5, b = .28;
    const g = (s, t) => [x + ux * s + vx * t, y + uy * s + vy * t];
    const q = [g(-a, -b), g(a, -b), g(a, b), g(-a, b)];
    return 'M' + so(q[0][0]) + ' ' + so(q[0][1]) + q.slice(1).map((p, i) => 'l' + so(p[0] - q[i][0]) + ' ' + so(p[1] - q[i][1])).join('') + 'z';
  }).join('');
  const ra = { mau: MAU, khoi: {}, hoBoi: boi };
  for (const m in nha) if (nha[m].sang.length) ra.khoi[m] = [nha[m].sang.join(''), nha[m].toi.join('')];
  console.log('cụm nhà:', dem, 'khối ·', hoBoi.length, 'hồ bơi');
  return ra;
}

/* rạn san hô + đá nhỏ quanh các đảo tour phía Nam (vẽ trong ảnh nền canvas) */
function ranSanHo({ hon }) {
  const r = ngauNhien(5150);
  const latCua = (y) => CHIEU.BAC - y / CHIEU.K;
  const ran = [], da = [];
  for (const o of hon) {
    const cy = o.v.reduce((a, p) => a + p[1], 0) / o.v.length;
    if (latCua(cy) > 10.0) continue;
    for (let i = 0; i < o.v.length; i += Math.max(1, Math.floor(o.v.length / 6))) {
      const [x, y] = o.v[i];
      if (r() < .55) ran.push([so(x + (r() - .5) * 5), so(y + (r() - .5) * 5), so(1.2 + r() * 1.8)]);
      if (r() < .5) da.push([so(x + (r() - .5) * 1.2), so(y + (r() - .5) * 1.2), so(.35 + r() * .45)]);
    }
  }
  return { ran: ran.flat(), da: da.flat() };
}

module.exports = { cayCum, doThi, ranSanHo };
