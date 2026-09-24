'use strict';
/* ==========================================================================
   Dựng hình đảo Phú Quốc cho bản đồ: đường bờ biển + trục đường chính.

   Nguồn: OpenStreetMap (tải qua Overpass ngày 23/09/2026, lưu ở tao/osm/).
   Ra: public/hinh.js — các chuỗi path SVG đã chiếu sẵn vào hệ toạ độ của bản đồ,
   nên trình duyệt không phải tính gì, và trang không phụ thuộc máy chủ bản đồ nào.

   Tải lại dữ liệu OSM (khi cần cập nhật đường mới):
     node tao/hinh.js --tai
   Chỉ dựng lại từ file đã có:
     node tao/hinh.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { CHIEU } = require('./chieu');
const { cayCum, doThi, ranSanHo } = require('./minh-hoa');

const OSM = path.join(__dirname, 'osm');
const RA = path.join(__dirname, '..', 'public', 'hinh.js');
const OVERPASS = 'https://overpass.private.coffee/api/interpreter';

const TRUY_VAN = {
  'bo-bien.json': '[out:json][timeout:80];way["natural"="coastline"](9.78,103.78,10.50,104.12);out geom;',
  'duong.json': '[out:json][timeout:100];way["highway"~"^(trunk|primary|secondary)$"](9.98,103.80,10.47,104.10);out geom;',
};

async function tai() {
  for (const [ten, q] of Object.entries(TRUY_VAN)) {
    const r = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': 'rootytrip-ban-do/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(q),
    });
    if (!r.ok) throw new Error(ten + ': Overpass trả ' + r.status);
    fs.writeFileSync(path.join(OSM, ten), await r.text());
    console.log('đã tải', ten);
  }
}

const khoa = (p) => p.lat.toFixed(7) + ',' + p.lon.toFixed(7);

/* Đường bờ biển OSM bị cắt thành nhiều đoạn; nối lại theo điểm đầu/cuối trùng nhau
   thành các vòng khép kín. Vòng nào không khép (bị khung tải cắt ngang) thì bỏ. */
function noiVong(ways) {
  const theoDau = new Map();
  for (const w of ways) theoDau.set(khoa(w.geometry[0]), w);
  const daDung = new Set();
  const vong = [];
  let ho = 0;
  for (const w of ways) {
    if (daDung.has(w)) continue;
    daDung.add(w);
    const pts = w.geometry.slice();
    for (let i = 0; i < 5000; i++) {
      const cuoi = khoa(pts[pts.length - 1]);
      if (cuoi === khoa(pts[0])) break;
      const tiep = theoDau.get(cuoi);
      if (!tiep || daDung.has(tiep)) { pts.length = 0; break; }
      daDung.add(tiep);
      pts.push(...tiep.geometry.slice(1));
    }
    if (pts.length > 3) vong.push(pts); else ho++;
  }
  return { vong, ho };
}

/* Douglas–Peucker trên toạ độ đã chiếu (đơn vị = điểm ảnh bản đồ). */
function rutGon(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let max = 0, idx = 0;
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return rutGon(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rutGon(pts.slice(idx), eps));
}

/* Vòng khép có điểm đầu = điểm cuối nên Douglas–Peucker sụp về một đoạn; tách làm đôi
   tại điểm xa điểm đầu nhất rồi rút gọn từng nửa. */
function rutGonVong(pts, eps) {
  let xa = 0, idx = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > xa) { xa = d; idx = i; }
  }
  return rutGon(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rutGon(pts.slice(idx), eps)).slice(0, -1);
}

const so = (n) => Math.round(n * 10) / 10;
const thanhPath = (pts, khep) =>
  'M' + pts.map(([x, y]) => so(x) + ' ' + so(y)).join('L') + (khep ? 'Z' : '');

/* bo cong một vòng khép: mỗi cạnh thay bằng hai điểm ở 1/4 và 3/4 */
function chaikin(v) {
  const ra = [];
  for (let i = 0; i < v.length; i++) {
    const [x1, y1] = v[i], [x2, y2] = v[(i + 1) % v.length];
    ra.push([x1 * .75 + x2 * .25, y1 * .75 + y2 * .25], [x1 * .25 + x2 * .75, y1 * .25 + y2 * .75]);
  }
  return ra;
}

function dienTich(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
}

/* ---------------- thiên nhiên: rừng, cây, núi, bãi cát, sông hồ ---------------- */

const docOsm = (ten) => {
  try {
    const s = fs.readFileSync(path.join(OSM, ten), 'utf8');
    return s.trim().startsWith('{') ? JSON.parse(s).elements : null;
  } catch (_) { return null; }
};

function trongDa(pt, poly) {
  let vao = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) vao = !vao;
  }
  return vao;
}

/* Vòng ngoài của way/relation đa giác (relation: ghép các member outer). */
function vongCua(el) {
  if (el.type === 'way' && el.geometry && el.geometry.length > 3) return [el.geometry];
  if (el.type !== 'relation' || !el.members) return [];
  const doan = el.members.filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry.slice());
  const ra = [];
  while (doan.length) {
    let v = doan.shift();
    for (let lap = 0; lap < 200 && doan.length; lap++) {
      const cuoi = khoa(v[v.length - 1]);
      if (cuoi === khoa(v[0])) break;
      const i = doan.findIndex((d) => khoa(d[0]) === cuoi || khoa(d[d.length - 1]) === cuoi);
      if (i < 0) break;
      const d = doan.splice(i, 1)[0];
      v = v.concat(khoa(d[0]) === cuoi ? d.slice(1) : d.reverse().slice(1));
    }
    if (v.length > 3) ra.push(v);
  }
  return ra;
}

/* Dự phòng khi không tải được rừng từ OSM: ranh gần đúng Vườn quốc gia Phú Quốc
   (nửa Đông Bắc) và dãy đồi Hàm Ninh – An Thới phía Nam. */
const RUNG_DU_PHONG = [
  [[10.44, 103.965], [10.452, 104.0], [10.43, 104.045], [10.37, 104.07], [10.30, 104.055], [10.23, 104.035],
    [10.205, 104.005], [10.24, 103.975], [10.30, 103.955], [10.37, 103.95], [10.42, 103.95]],
  [[10.17, 104.02], [10.15, 104.035], [10.10, 104.045], [10.07, 104.04], [10.08, 104.02], [10.12, 104.012], [10.16, 104.008]],
];
const NUI_DU_PHONG = [
  { ten: 'Núi Chúa', lat: 10.395, lon: 104.005, cao: 565 },
  { ten: '', lat: 10.36, lon: 104.03, cao: 400 },
  { ten: '', lat: 10.32, lon: 104.015, cao: 350 },
  { ten: 'Núi Hàm Ninh', lat: 10.19, lon: 104.02, cao: 360 },
  { ten: '', lat: 10.12, lon: 104.03, cao: 250 },
];

function ngauNhien(hat) {           // số giả ngẫu nhiên cố định → mỗi lần dựng cây mọc y chỗ cũ
  let s = hat >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function thienNhien(daoXY, honDs) {
  const xy = (p) => CHIEU.xy(p.lat, p.lon);
  const ghi = [];

  /* rừng */
  const rungOsm = [...(docOsm('rung.json') || []), ...(docOsm('rung-rel.json') || [])];
  let rung = rungOsm.flatMap(vongCua).map((v) => v.map(xy)).filter((v) => dienTich(v) > 12);
  if (!rung.length) {
    rung = RUNG_DU_PHONG.map((v) => v.map(([lat, lon]) => CHIEU.xy(lat, lon)));
    ghi.push('rừng: dùng ranh dự phòng (chưa có dữ liệu OSM)');
  } else ghi.push('rừng OSM: ' + rung.length + ' vùng');

  /* 25/09 (bản minh hoạ): cây gom cụm, ít hơn ~45%, chừa khoảng thở cho đô thị/resort — tao/minh-hoa.js */
  const cay = cayCum({ daoXY, hon: honDs, rung, trongDa });
  ghi.push('cây: ' + cay.length + ' (' + [0, 1, 2, 3, 4].map((k) => cay.filter((c) => c[3] === k).length).join('/') + ' tròn/rừng/dừa/bụi/núi)');

  /* núi */
  const nuiOsm = (docOsm('nui.json') || []).filter((e) => e.type === 'node')
    .map((e) => ({ ten: e.tags.name || '', lat: e.lat, lon: e.lon, cao: parseFloat(e.tags.ele) || 0 }))
    .filter((n) => n.cao >= 120 || n.ten);
  const nuiNguon = nuiOsm.length ? nuiOsm : NUI_DU_PHONG;
  const nui = nuiNguon
    .map((n) => { const [x, y] = CHIEU.xy(n.lat, n.lon); return { x: so(x), y: so(y), ten: n.ten, cao: n.cao }; })
    .filter((n) => trongDa([n.x, n.y], daoXY))
    .sort((a, b) => b.cao - a.cao).slice(0, 24);
  ghi.push('núi: ' + nui.length + (nuiOsm.length ? ' (OSM)' : ' (dự phòng)'));

  /* bãi cát */
  const cat = (docOsm('cat.json') || []).flatMap(vongCua).map((v) => v.map(xy)).filter((v) => dienTich(v) > .3);
  ghi.push('bãi cát: ' + cat.length);

  /* sông, hồ */
  const nuocOsm = docOsm('nuoc.json') || [];
  const ho = nuocOsm.filter((e) => e.tags && e.tags.natural === 'water').flatMap(vongCua)
    .map((v) => v.map(xy)).filter((v) => dienTich(v) > .8);
  const song = nuocOsm.filter((e) => e.tags && /river|stream/.test(e.tags.waterway || '') && e.geometry)
    .map((e) => rutGon(e.geometry.map(xy), .5)).filter((v) => v.length > 1);
  ghi.push('hồ: ' + ho.length + ' · sông: ' + song.length);

  console.log('thiên nhiên —', ghi.join(' · '));
  return {
    rung: rung.map((v) => thanhPath(rutGonVong(v, .6), true)).join(''),
    /* [x, y, bán kính, …] phẳng — trình duyệt tự dựng thành path, nhẹ hơn ~10 lần */
    cay: cay.flatMap(([x, y, rr, k]) => [so(x), so(y), so(rr), k]),
    nui,
    cat: cat.map((v) => thanhPath(rutGonVong(v, .3), true)).join(''),
    ho: ho.map((v) => thanhPath(rutGonVong(v, .3), true)).join(''),
    song: song.map((v) => thanhPath(v, false)).join(''),
  };
}

/* ---------------- sân bay: đường băng, đường lăn, sân đỗ, nhà ga (OSM aeroway) ----------------
   Anh Hùng 25/09: vẽ đường băng trên mặt đất, hình dạng đúng thực tế. osm/san-bay.json tải bằng:
   way["aeroway"](10.150,103.970,10.185,104.025); out geom;  (mirror maps.mail.ru) */
function sanBay() {
  const els = docOsm('san-bay.json');
  if (!els) return null;
  const pts = (w) => w.geometry.map((p) => CHIEU.xy(p.lat, p.lon));
  const theo = (k) => els.filter((w) => w.tags && w.tags.aeroway === k);
  const m = 111320 / CHIEU.K;                                      // mét cho một đơn vị bản đồ
  return {
    bang: theo('runway').map((w) => ({ d: thanhPath(pts(w)), rong: so((+w.tags.width || 45) / m), ten: w.tags.ref || '' })),
    lan: theo('taxiway').concat(theo('taxilane')).map((w) => thanhPath(pts(w))).join(''),
    san: theo('apron').map((w) => thanhPath(pts(w), true)).join(''),
    ga: theo('terminal').map((w) => thanhPath(pts(w), true)).join(''),
  };
}

function dung() {
  const bo = JSON.parse(fs.readFileSync(path.join(OSM, 'bo-bien.json'), 'utf8')).elements;
  const { vong, ho } = noiVong(bo);

  /* Góc Tây Bắc của khung tải có đảo của Campuchia (Koh Ses…) — không vẽ. */
  const laCampuchia = (v) => {
    const lat = v.reduce((a, p) => a + p.lat, 0) / v.length;
    const lon = v.reduce((a, p) => a + p.lon, 0) / v.length;
    return lat > 10.39 && lon < 103.83;
  };

  const dat = vong
    .filter((v) => !laCampuchia(v))
    .map((v) => v.map((p) => CHIEU.xy(p.lat, p.lon)))
    .map((v) => ({ v, s: dienTich(v) }))
    .filter((o) => o.s > 0.4)                         // bỏ đá lẻ nhỏ hơn ~1 điểm ảnh
    .sort((a, b) => b.s - a.s);

  const daoChinh = dat[0];
  const hon = dat.slice(1);

  const duongOsm = JSON.parse(fs.readFileSync(path.join(OSM, 'duong.json'), 'utf8')).elements;
  const duong = { chinh: [], phu: [], nho: [], khu: [], mon: [] };
  const duongDs = [];                               // toạ độ đường khu dân cư/liên xã cho cụm nhà
  for (const w of duongOsm) {
    const pts = rutGon(w.geometry.map((p) => CHIEU.xy(p.lat, p.lon)), 0.6);
    if (pts.length < 2) continue;
    const loai = /trunk|primary/.test(w.tags.highway) ? 'chinh' : 'phu';
    duong[loai].push(thanhPath(pts, false));
  }
  /* đường nhỏ (25/09, anh Hùng muốn đường chi tiết hơn): liên xã/làng + đường mòn — tải rời từng
     nửa đảo (dn-*.json) vì truy vấn gộp bị Overpass từ chối */
  for (const f of ['dn-bac-1.json', 'dn-nam-1.json', 'dn-bac-2.json', 'dn-nam-2.json']) {
    for (const w of docOsm(f) || []) {
      if (!w.geometry) continue;
      const pts = rutGon(w.geometry.map((p) => CHIEU.xy(p.lat, p.lon)), 0.5);
      if (pts.length < 2) continue;
      const hw = w.tags.highway;
      duong[/track/.test(hw) ? 'mon' : /residential/.test(hw) ? 'khu' : 'nho'].push(thanhPath(pts, false));
      if (!/track/.test(hw)) duongDs.push(pts);
    }
  }

  const tn = thienNhien(daoChinh.v, hon);
  const nha = doThi({ daoXY: daoChinh.v, hon, duongDs: duongDs.concat(duongOsm.map((w) => w.geometry.map((p) => CHIEU.xy(p.lat, p.lon)))), trongDa });
  const sanHo = ranSanHo({ hon });

  /* Bờ biển dạng toạ độ thật cho bản đồ nền MapLibre: dải nước nông xanh ngọc chạy dọc
     bờ (line) và hình đất (polygon) phủ lại lên dải đó để nó chỉ lấn ra phía biển. */
  const vongLonLat = vong.filter((v) => !laCampuchia(v))
    .map((v) => v.map((p) => [p.lon, p.lat]))
    .filter((v) => dienTich(v) > 2e-7)
    /* rút gọn mạnh rồi bo cong (Chaikin 2 lần): dải nước nông vẽ bằng line-offset, bờ gấp
       khúc là dải bị răng cưa nhọn (24/09) — đường mềm thì dải cũng mềm */
    .map((v) => chaikin(chaikin(rutGonVong(v, .00045))).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]))
    .filter((v) => v.length > 3)
    .map((v) => v.concat([v[0]]));
  /* đảo đá quá nhỏ: dải line-offset quanh vòng tí hon toè thành hình ngôi sao → không vẽ dải */
  const boBien = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: vongLonLat.filter((v) => dienTich(v) > 4e-6) } }] };
  const datLien = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: vongLonLat.map((v) => [v]) } }] };

  /* Bản MapLibre (24/09) chỉ cần bờ biển: đường, rừng, bãi cát đã có trong nền vector.
     Các lớp SVG cũ (daoChinh, cây…) bỏ khỏi đầu ra cho file nhẹ; hàm dựng vẫn giữ để
     `--svg` xuất lại khi cần bản không-mạng. */
  /* 25/09: quay về bản vector (anh Hùng chọn), --maplibre để xuất bộ bờ biển cho bản MapLibre */
  const ra = !process.argv.includes('--maplibre')
    ? { rong: CHIEU.rong, cao: CHIEU.cao, chieu: { BAC: CHIEU.BAC, TAY: CHIEU.TAY, K: CHIEU.K, COS: CHIEU.COS }, ...tn,
      daoChinh: thanhPath(rutGonVong(daoChinh.v, 0.35), true), hon: hon.map((o) => thanhPath(rutGonVong(o.v, 0.3), true)).join(''),
      duongChinh: duong.chinh.join(''), duongPhu: duong.phu.join(''), duongNho: duong.nho.join(''), duongKhu: duong.khu.join(''), duongMon: duong.mon.join(''), sanBay: sanBay(), nha, sanHo }
    : { boBien, datLien };

  const noiDung =
    '/* SINH TỰ ĐỘNG bởi tao/hinh.js từ dữ liệu OpenStreetMap (© OpenStreetMap contributors, ODbL).\n' +
    '   Đừng sửa tay — chạy lại `node tao/hinh.js`. */\n' +
    'window.PQ_HINH = ' + JSON.stringify(ra) + ';\n';
  fs.writeFileSync(RA, noiDung);
  console.log(
    'vòng khép:', vong.length, '· bỏ vì hở:', ho, '· đảo nhỏ giữ lại:', hon.length,
    '· đường:', duong.chinh.length, '+', duong.phu.length, '+ nhỏ', duong.nho.length, '+ khu', duong.khu.length, '+ mòn', duong.mon.length,
    '· dung lượng:', (noiDung.length / 1024).toFixed(1) + ' KB'
  );
}

(async () => {
  if (process.argv.includes('--tai')) await tai();
  dung();
})().catch((e) => { console.error(e.message); process.exit(1); });
