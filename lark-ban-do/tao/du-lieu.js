'use strict';
/* ==========================================================================
   Ghép danh mục điểm (diem.js) với thông tin tour trên Base "Sản phẩm"
   → public/du-lieu.js (dữ liệu công khai mà bản đồ đọc).

   Đọc Base bằng CHÍNH kho.js của app Sản phẩm: cùng một cách hiểu cột, cùng một
   quy tắc giá sau ưu đãi (chỉ trừ khi chính sách bật "Áp vào giá hiển thị").

   Chạy:  node tao/du-lieu.js
   Cần phiên lark-cli còn đăng nhập trên máy (như app Sản phẩm ở chế độ cli).

   Trang này dành cho KHÁCH trên website, nên chỉ xuất một danh sách trường CHO
   PHÉP: tên, thời lượng, lịch khởi hành, giá công bố, USP. Không xuất lưu ý nội bộ,
   giá net, nguồn dữ liệu, người cập nhật hay link tài liệu nội bộ.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { CHIEU } = require('./chieu');
const { DIEM, TUYEN, CAP_TREO, LUONG_BIEN, TUYEN_TAU, TUYEN_BAY, DIA_DANH, VUNG, LIEN_HE } = require('../diem');

const RA = path.join(__dirname, '..', 'public', 'du-lieu.js');

/* Chỉ sản phẩm đang bán (hoặc sắp mở bán) mới lên bản đồ công khai. */
const BAN_DUOC = /Đang kinh doanh|Sắp ra mắt/i;

const boEmoji = (s) => String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();

/* 26/09: thêm Tour trọn gói + Combo tự túc — trước đó rơi vào 'khac' nên không nhóm nào hiện */
const loaiTour = (nhom) =>
  /ghép/i.test(nhom) ? 'ghep' : /riêng|VIP/i.test(nhom) ? 'rieng' : /trọn gói/i.test(nhom) ? 'tron-goi'
    : /combo/i.test(nhom) ? 'combo' : /lẻ/i.test(nhom) ? 've' : 'khac';

function dongUsp(s) {
  return String(s || '').split('\n')
    .map((d) => d.replace(/^\s*[-–•+]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

function veTour(p) {
  const pax = (p.giaPax || []).filter((r) => r.giaNL);
  const re = pax.length ? pax.reduce((a, b) => (b.giaNL < a.giaNL ? b : a)) : null;
  const sg = p.giaSauGiam;
  const nhanUuTien = boEmoji(p.uuTien);
  return {
    ma: p.ma,
    ten: p.ten,
    tenEn: p.tenEn || '',
    loai: loaiTour(p.nhom),
    thoiLuong: p.thoiLuong || '',
    khoiHanh: p.khoiHanh || '',
    giaNL: p.giaNL ?? null,
    giaTE: p.giaTE ?? null,
    sauGiamNL: sg && sg.nl != null && sg.nl < (p.giaNL ?? Infinity) ? sg.nl : null,
    sauGiamTE: sg && sg.te != null && sg.te < (p.giaTE ?? Infinity) ? sg.te : null,
    /* Tour riêng không có giá đơn: in "từ X/khách" theo bậc rẻ nhất (đoàn đông nhất). */
    tuPax: re ? { gia: re.giaNL, soKhach: re.soKhach } : null,
    sapRaMat: /Sắp ra mắt/i.test(p.trangThai),
    noiBat: /Ưu tiên đẩy/i.test(p.uuTien),
    uuTien: nhanUuTien,
    usp: dongUsp(p.usp),
    tuyen: TUYEN[p.ma] || [],
    trang: LIEN_HE.trangTour[p.ma] || '',
  };
}

/* Đường bộ thật giữa hai điểm qua OSRM (máy chủ công khai của dự án OSRM, dữ liệu OSM).
   Lưu đệm vào tao/osrm-dem.json: chạy lại không gọi mạng, và mất mạng vẫn dựng được. */
const DEM_OSRM = path.join(__dirname, 'osrm-dem.json');
let demOsrm = {};
try { demOsrm = JSON.parse(fs.readFileSync(DEM_OSRM, 'utf8')); } catch (_) { /* chưa có */ }
const luuDemOsrm = () => fs.writeFileSync(DEM_OSRM, JSON.stringify(demOsrm));

async function duongBo(a, b, mang) {
  const k = a.lon + ',' + a.lat + ';' + b.lon + ',' + b.lat;
  if (demOsrm[k]) return demOsrm[k];
  /* máy chủ (app Sản phẩm dựng dữ liệu mỗi lần mở) KHÔNG gọi mạng: thiếu đệm thì nối thẳng */
  if (!mang) return [[a.lon, a.lat], [b.lon, b.lat]];
  try {
    const r = await fetch('https://router.project-osrm.org/route/v1/driving/' + k + '?overview=simplified&geometries=geojson',
      { headers: { 'User-Agent': 'rootytrip-ban-do/1.0' } });
    const j = await r.json();
    const c = j.routes && j.routes[0] && j.routes[0].geometry.coordinates;
    if (c && c.length > 1) {
      demOsrm[k] = c.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
      await new Promise((ok) => setTimeout(ok, 400));      // lịch sự với máy chủ công khai
      return demOsrm[k];
    }
  } catch (e) { console.log('OSRM lỗi', a.id, '→', b.id, e.message); }
  return [[a.lon, a.lat], [b.lon, b.lat]];
}

/* ---------- hành trình SUY từ lịch trình (26/09) ----------
   Tour trọn gói / combo chưa gắn điểm trong diem.js nên bấm vào không thấy đường đi. Đọc lịch
   trình chữ trên Base theo thứ tự, nhận ra địa danh → dãy điểm. Chỉ dùng khi TUYEN không có mã
   đó (tuyến khai tay luôn thắng). Một khối "cano / 3 đảo" hay "Nam đảo" nở thành đúng tuyến
   của tour cano 3 đảo (G4) / tour Nam đảo (GLAND1) để đường đi trùng tour lẻ đã vẽ. */
const NHAN_DIEN = [
  [/sân bay|đón bay|tiễn bay|đến phú quốc/i, ['san-bay']],
  [/vinwonder/i, ['vinwonders']],
  [/safari/i, ['safari']],
  [/grand ?world|venice|thành phố không ngủ/i, ['grand-world']],
  [/cano|3 đảo|ba đảo|đảo đẹp|mây rút|gầm ghì|móng tay|lặn ngắm san hô/i, 'G4'],
  [/cáp treo|hòn thơm|công viên nước|aquatopia/i, ['ga-cap-treo', 'hon-thom']],
  [/nam đảo/i, 'GLAND1'],
  [/địa trung hải|sunset town|thị trấn hoàng hôn/i, ['sunset-town']],
  [/cầu hôn|kiss bridge/i, ['cau-hon']],
  [/rạch vẹm/i, ['rach-vem']],
  [/bãi sao/i, ['bai-sao']],
  [/bãi khem/i, ['bai-khem']],
  [/hộ quốc/i, ['ho-quoc']],
  [/nhà tù/i, ['nha-tu']],
  [/dinh cậu/i, ['dinh-cau']],
  [/chợ đêm/i, ['cho-dem']],
  [/sanato/i, ['sanato']],
  [/gành dầu/i, ['ganh-dau']],
];
function tuyenTuLich(p) {
  const chu = String(p.lichTrinh || '');
  if (!chu.trim()) return [];
  const thay = [];
  for (const dong of chu.split('\n')) {
    const coCano = NHAN_DIEN[4][0].test(dong);
    for (const [re, ra] of NHAN_DIEN) {
      if (ra === 'GLAND1' && coCano) continue;           // "cano khám phá Nam đảo" là tour đảo, không phải Nam đảo
      const g = new RegExp(re.source, 'ig');
      let m;
      while ((m = g.exec(dong))) thay.push({ o: thay.length ? thay[thay.length - 1].o + 1 : 0, vt: m.index, dong, ra });
    }
  }
  /* thứ tự = thứ tự dòng, trong dòng theo vị trí chữ */
  const theoDong = [];
  let o = 0, dongCu = null, trongDong = [];
  const xong = () => { trongDong.sort((a, b) => a.vt - b.vt); theoDong.push(...trongDong); trongDong = []; };
  for (const t of thay) { if (t.dong !== dongCu) { xong(); dongCu = t.dong; } trongDong.push(t); o++; }
  xong();
  const ds = [];
  for (const t of theoDong) {
    const them = typeof t.ra === 'string' ? TUYEN[t.ra] : t.ra;
    for (const id of them) {
      if (id === 'san-bay') continue;                                             // sân bay xử lý riêng bên dưới
      if (ds[ds.length - 1] === id) continue;
      if (id !== 'cang-vinh-dam' && ds.includes(id)) continue;                    // mỗi điểm một lần (trừ cảng cano)
      ds.push(id);
    }
  }
  /* rời đảo lên đất liền phải qua đường về: Hòn Thơm → cáp treo về ga An Thới; đảo khác → về cảng cano.
     Không có bước này thì "Hòn Thơm → VinWonders" thành một nét biển thẳng dọc bờ Tây. */
  const DAO = new Set(DIEM.filter((d) => d.vung === 'dao').map((d) => d.id));
  const CANG = new Set(['cang-vinh-dam', 'cang-an-thoi', 'cang-bai-vong', 'ga-cap-treo']);
  const veDatLien = () => {
    for (let i = 0; i < ds.length - 1; i++) {
      if (DAO.has(ds[i]) && !DAO.has(ds[i + 1]) && !CANG.has(ds[i + 1])) ds.splice(i + 1, 0, ds[i] === 'hon-thom' ? 'ga-cap-treo' : 'cang-vinh-dam');
    }
  };
  veDatLien();
  /* sân bay chỉ ở ĐẦU (đón) và CUỐI (tiễn) — "ĐÓN SÂN BAY" rồi "Đón khách tại sân bay" không phải hai lần ghé */
  if (/sân bay|đón bay|đến phú quốc/i.test(chu)) ds.unshift('san-bay');
  if (/tiễn/i.test(chu) && ds[ds.length - 1] !== 'san-bay') ds.push('san-bay');
  veDatLien();                                   // lần hai: sau khi thêm sân bay cuối (Hòn Thơm → tiễn bay)
  return ds.length >= 2 ? ds : [];
}

/**
 * Dựng dữ liệu bản đồ từ danh sách sản phẩm (kho.js) — dùng chung cho:
 *   · lệnh `node tao/du-lieu.js` (ghi public/du-lieu.js, được gọi mạng OSRM)
 *   · app Sản phẩm (lark-san-pham/server.js → /ban-do/du-lieu.js), dựng TƯƠI mỗi lần mở
 *     bản đồ từ Base, không gọi mạng (mang: false)
 * Trả { ra, chuaGan, thieu, anDi } — `ra` là đúng đối tượng window.PQ_DU_LIEU.
 */
async function dungDuLieu(ds, { mang = true } = {}) {
  const theoMa = new Map(ds.map((p) => [p.ma, p]));

  const canMa = new Set([...DIEM.flatMap((d) => d.tour), ...Object.keys(TUYEN)]);
  const tour = {};
  const thieu = [], anDi = [];
  for (const ma of canMa) {
    const p = theoMa.get(ma);
    if (!p) { thieu.push(ma); continue; }
    if (!BAN_DUOC.test(p.trangThai)) { anDi.push(ma + ' (' + p.trangThai + ')'); continue; }
    tour[ma] = veTour(p);
  }
  /* 26/09: sản phẩm ĐANG BÁN trên Base nhưng chưa gắn vào điểm nào (diem.js) → chưa lên bản đồ.
     Ghi ra tao/dem/chua-gan.json để lệnh cập nhật (tao/cap-nhat.js) báo lại. */
  const chuaGan = ds.filter((p) => p.ma && BAN_DUOC.test(p.trangThai) && !canMa.has(p.ma))
    .map((p) => ({ ma: p.ma, ten: boEmoji(p.ten), nhom: p.nhom || '', trangThai: p.trangThai }));
  /* Sản phẩm đang bán mà chưa gắn điểm (trọn gói, combo, vé Vin, du thuyền…) VẪN lên tab Tour
     (anh Hùng 26/09: "chưa thấy dữ liệu tour combo") — chỉ không có ghim / hành trình trên bản đồ
     cho tới khi được gắn điểm trong diem.js. */
  for (const p of ds) if (p.ma && !tour[p.ma] && BAN_DUOC.test(p.trangThai)) tour[p.ma] = veTour(p);
  /* hành trình suy từ lịch trình cho sản phẩm không có tuyến khai tay */
  const TUYEN_DU = Object.assign({}, TUYEN);
  for (const p of ds) {
    const t = tour[p.ma];
    if (!t || (t.tuyen && t.tuyen.length)) continue;
    const suy = tuyenTuLich(p);
    if (suy.length) { t.tuyen = suy; t.tuyenSuy = true; TUYEN_DU[p.ma] = suy; }
  }

  /* ---- hình học từng chặng của tuyến tour ---- */
  const theoIdDiem = new Map(DIEM.map((d) => [d.id, d]));
  const laCap = (a, b) => CAP_TREO.some(([x, y]) => (x === a.id && y === b.id) || (x === b.id && y === a.id));
  /* chặng biển: có một đầu là đảo, hoặc Mũi Hàm Rồng, hoặc CẢ HAI đầu là cảng. Cảng ↔ điểm trên đất liền
     (VinWonders → Cảng Vịnh Đầm trong hành trình suy từ lịch trình) là đường bộ — trước 26/09 nó bị
     vẽ thành một nét thẳng xuyên đảo */
  const laCang = (d) => d.loai === 'cua-ngo' && /cang/.test(d.id) && d.id !== 'cang-quoc-te';
  const laBien = (a, b) => a.vung === 'dao' || b.vung === 'dao' || (laCang(a) && laCang(b)) || a.id === 'ham-rong' || b.id === 'ham-rong';
  const lonLat = ([lat, lon]) => [+lon.toFixed(5), +lat.toFixed(5)];
  const chang = {};
  for (const [ma, ds] of Object.entries(TUYEN_DU)) {
    for (let i = 0; i < ds.length - 1; i++) {
      const a = theoIdDiem.get(ds[i]), b = theoIdDiem.get(ds[i + 1]);
      if (!a || !b) continue;
      const k = a.id + '>' + b.id;
      if (chang[k]) continue;
      if (laCap(a, b)) { chang[k] = { k: 'cap', c: [[a.lon, a.lat], [b.lon, b.lat]] }; continue; }
      if (laBien(a, b)) {
        const xuoi = LUONG_BIEN[k], nguoc = LUONG_BIEN[b.id + '>' + a.id];
        const giua = xuoi || (nguoc ? nguoc.slice().reverse() : []);
        chang[k] = { k: 'bien', c: [[a.lon, a.lat], ...giua.map(lonLat), [b.lon, b.lat]] };
        continue;
      }
      chang[k] = { k: 'bo', c: await duongBo(a, b, mang) };
    }
  }
  if (mang) luuDemOsrm();

  const chieu = (o) => { const [x, y] = CHIEU.xy(o.lat, o.lon); return { x: +x.toFixed(1), y: +y.toFixed(1) }; };

  const diem = DIEM.map((d, i) => Object.assign({
    so: i + 1,
    id: d.id, ten: d.ten, tenEn: d.tenEn, vung: d.vung, loai: d.loai, cap: d.cap,
    moTa: d.moTa, moTaEn: d.moTaEn, lat: d.lat, lon: d.lon,
    uocLuong: !!d.uocLuong,
    tour: d.tour.filter((m) => tour[m]),
  }, chieu(d)));

  /* Kiểm chéo: tuyến trỏ tới điểm không tồn tại là lỗi gõ — dừng luôn. */
  const coId = new Set(diem.map((d) => d.id));
  for (const [ma, ds2] of Object.entries(TUYEN)) {
    for (const id of ds2) if (!coId.has(id)) throw new Error('TUYEN.' + ma + ' trỏ tới điểm lạ: ' + id);
  }

  const ra = {
    capNhat: new Date().toISOString(),
    diem,
    tour,
    capTreo: CAP_TREO,
    chang,
    tuyenTau: TUYEN_TAU.map((t) => Object.assign({}, t, { duong: t.duong.map(lonLat) })),
    tuyenBay: TUYEN_BAY.map((t) => Object.assign({}, t, { duong: t.duong.map(([lat, lon, cao, giay]) => [+lon.toFixed(5), +lat.toFixed(5), cao, giay]) })),
    diaDanh: DIA_DANH.map((d) => Object.assign({ ten: d.ten, tenEn: d.tenEn, co: d.co, lat: d.lat, lon: d.lon }, chieu(d))),
    vung: VUNG.map((v) => Object.assign({ id: v.id, ten: v.ten, tenEn: v.tenEn, lat: v.lat, lon: v.lon }, chieu(v))),
    lienHe: { hotline: LIEN_HE.hotline, zalo: LIEN_HE.zalo },
  };
  return { ra, chuaGan, thieu, anDi };
}

async function main() {
  const kho = require('../../lark-san-pham/kho');
  const { ds } = await kho.docTatCa();
  const { ra, chuaGan, thieu, anDi } = await dungDuLieu(ds, { mang: true });
  const { diem, tour } = ra;
  fs.mkdirSync(path.join(__dirname, 'dem'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'dem', 'chua-gan.json'), JSON.stringify({ luc: new Date().toISOString(), chuaGan, thieu, anDi }, null, 1));

  fs.writeFileSync(RA,
    '/* SINH TỰ ĐỘNG bởi tao/du-lieu.js từ diem.js + Base "Sản phẩm". Đừng sửa tay. */\n' +
    'window.PQ_DU_LIEU = ' + JSON.stringify(ra) + ';\n');

  console.log('điểm:', diem.length, '· tour lên bản đồ:', Object.keys(tour).length);
  if (thieu.length) console.log('KHÔNG có trên Base:', thieu.join(', '));
  if (anDi.length) console.log('Ẩn vì không còn bán:', anDi.join(', '));
  const uoc = diem.filter((d) => d.uocLuong).map((d) => d.ten);
  if (uoc.length) console.log('Toạ độ ước lượng, nên kiểm lại:', uoc.join(', '));
}

module.exports = { dungDuLieu };
if (require.main === module) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
