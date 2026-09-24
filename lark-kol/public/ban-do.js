/* ==========================================================================
   Bản đồ lịch trình Phú Quốc (anh Hùng 23/09/2026: "vẽ chính xác hơn bằng Google Maps").

   Google Maps nhúng trong trang cần API key có thẻ thanh toán Google Cloud — chưa có.
   Nên:
     · bản đồ trong app = Leaflet + nền OpenStreetMap — đường, bãi, địa danh chính xác,
       nền tối bằng cách đảo màu CSS theo giao diện
     · đường đi bám ĐƯỜNG BỘ thật qua OSRM (router.project-osrm.org); chặng ra đảo
       (Hòn Thơm, 3 đảo) vẽ nét đứt vì đi cáp treo / cano
     · mỗi ngày một nút "Mở trên Google Maps" → Google Maps thật, chỉ đường đủ các điểm
     · ô Điểm hẹn nhận link Google Maps / toạ độ dán vào → ghim đúng chỗ
     · không tải được Leaflet (mất mạng) → lùi về sơ đồ vector vẽ tay như bản cũ

   Toạ độ địa điểm tra từ OpenStreetMap (Nominatim) ngày 23/09/2026; dòng ghi "ước lượng"
   là nơi OSM chưa có — dán link Google Maps vào Điểm hẹn để ghim cho chắc.
   ========================================================================== */
(function (goc) {
  'use strict';
  /* [tên, vĩ độ, kinh độ, từ khoá không dấu (cụ thể đứng TRƯỚC chung chung), ngoài đảo chính?] */
  const DIEM = [
    ['VinWonders', 10.3384, 103.85467, ['vinwonders', 'vin wonders']],
    ['Vinpearl Safari', 10.33654, 103.88902, ['safari']],
    ['Wyndham Garden Grand World', 10.3232, 103.8563, ['wyndham']],
    ['Grand World', 10.32494, 103.85814, ['grand world', 'venice', 'tinh hoa viet nam', 'bao tang gau', 'teddy', 'gland_gw', 'gland_vin']],
    ['Gành Dầu', 10.37077, 103.84472, ['ganh dau']],
    ['Rạch Vẹm (Bãi Sao Biển)', 10.37419, 103.93898, ['rach vem', 'sao bien', 'starfish', 'gland_rv']],
    ['Bãi Thơm', 10.41201, 104.03149, ['bai thom']],
    ['Sân bay Phú Quốc', 10.17271, 103.99216, ['san bay', 'don bay', 'tien bay', 'airport']],
    ['Bãi Trường', 10.13606, 103.9764, ['bai truong', 'long beach']],
    ['Suối Tranh', 10.18378, 104.01534, ['suoi tranh']],
    ['Hàm Ninh', 10.17634, 104.03263, ['ham ninh']],
    ['Thiền viện Trúc Lâm Hộ Quốc', 10.1092, 104.0275, ['ho quoc', 'thien vien', 'truc lam']],
    ['Nhà tù Phú Quốc', 10.04345, 104.01879, ['nha tu', 'coconut prison', 'coconut tree']],
    ['Bãi Sao', 10.05247, 104.03519, ['bai sao', 'sao beach']],
    ['Bãi Khem', 10.03577, 104.03063, ['bai khem', 'kem beach', 'sun premier village kem']],
    ['Cầu Hôn', 10.02826, 104.00419, ['cau hon', 'kiss bridge', 'nha hat', 'kiss of the sea', 'symphony']],
    ['Ga cáp treo An Thới', 10.02704, 104.00724, ['ga cap treo', 'nha ga an thoi']],
    ['Sunset Town', 10.02943, 104.00831, ['sunset town', 'hoang hon', 'primavera', 'gland5', 'land 5', 'viet xua an thoi']],
    ['An Thới', 10.01209, 104.01481, ['an thoi']],
    ['Hòn Thơm', 9.9565, 104.01807, ['hon thom', 'cap treo', 'sun world', 'aquatopia', 'exotica', 'sun paradise', 'sun-c', 'mango'], 'cap'],
    ['Hòn Mây Rút', 9.91142, 103.98959, ['hon may rut', '3 dao', 'ba dao', 'cano', 'lan bien', 'lan ngam', 'g4'], 'cano'],
    ['Hòn Gầm Ghì', 9.912, 104.01493, ['hon gam ghi'], 'cano'],
    ['Hòn Dừa', 9.99601, 104.01042, ['hon dua'], 'cano'],
    ['Sunset Sanato', 10.15401, 103.97942, ['sanato']],
    ['Chợ đêm Dinh Cậu', 10.2163, 103.96058, ['cho dem', 'night market', 'dinh cau']],
    ['Dương Đông', 10.2175, 103.9601, ['duong dong', 'viet xua']],
  ];
  /* Bến ra đảo: xe chạy tới đây rồi mới đi cáp treo / cano (vẽ nét đứt). */
  const BEN = { cap: { ten: 'Ga cáp treo An Thới', lat: 10.02704, lng: 104.00724 }, cano: { ten: 'Cảng An Thới', lat: 10.0125, lng: 104.0105 } };
  const kd = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const e = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const trongPhuQuoc = (lat, lng) => lat > 9.8 && lat < 10.5 && lng > 103.75 && lng < 104.2;

  /** Toạ độ dán tay: link Google Maps (@lat,lng · !3dlat!4dlng · q=lat,lng) hoặc "10.217, 103.960". */
  function toaDoTrongChu(s) {
    const t = String(s || '');
    const m = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(t) || /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(t) ||
      /[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i.exec(t) || /(?:^|[^\d.])(9\.\d{3,}|10\.\d{3,})\s*,\s*(10[34]\.\d{3,})/.exec(t);
    if (!m) return null;
    const lat = +m[1], lng = +m[2];
    return trongPhuQuoc(lat, lng) ? { lat, lng } : null;
  }
  const linkNgan = (s) => (/https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\/\S+/i.exec(String(s || '')) || [])[0] || '';

  /** Đoán vị trí một hạng mục. Toạ độ dán tay thắng từ khoá. `giai` = kết quả link rút gọn đã giải. */
  function doan(h, giai) {
    const tay = toaDoTrongChu(h.diemHen) || (giai && giai[linkNgan(h.diemHen)]);
    if (tay) {
      /* Tên ghim: chữ trong Điểm hẹn (bỏ link, bỏ toạ độ); không còn chữ thì dùng tên hạng mục. */
      const chu = String(h.diemHen || '').replace(/https?:\/\/\S+/g, '').replace(/-?\d+\.\d+\s*,\s*-?\d+\.\d+/g, '').replace(/[\s,;:·-]+$/, '').trim();
      const tenHm = String(h.ten || '').replace(/\s+[—-]\s+(Người lớn|Trẻ em|Em bé)$/i, '').trim();
      return { ten: chu || tenHm || 'Điểm hẹn', lat: tay.lat, lng: tay.lng, tay: true };
    }
    const t = kd([h.ten, h.diemHen, h.nhaCungCap, h.maDv].join(' '));
    for (const d of DIEM) if (d[3].some((k) => t.includes(k))) return { ten: d[0], lat: d[1], lng: d[2], dao: !!d[4], kieu: d[4] || '', ben: d[4] ? BEN[d[4]] : null };
    return null;
  }

  const theoTu = (chuoi) => { const t = kd(chuoi); for (const d of DIEM) if (d[3].some((k) => t.includes(k))) return { ten: d[0], lat: d[1], lng: d[2], dao: !!d[4], kieu: d[4] || '', ben: d[4] ? BEN[d[4]] : null }; return null; };
  const gan = (a, b) => Math.abs(a.lat - b.lat) < 0.003 && Math.abs(a.lng - b.lng) < 0.003;   // ~300 m

  /**
   * Một hạng mục có thể có HAI chỗ (anh Hùng 24/09: "đón ở Bãi Sao rồi đi G4"):
   *   don — Điểm hẹn (nơi KOL có mặt / được đón): toạ độ dán tay, link Maps, hoặc tên địa danh trong ô
   *   den — nơi diễn ra hoạt động, đoán từ tên hạng mục / đối tác / mã dịch vụ
   * Hai chỗ trùng nhau (hoặc chỉ có một) → chỉ còn den. Trả {don, den} hoặc null nếu không đoán được gì.
   */
  function doanTach(h, giai) {
    let don = null;
    const tay = toaDoTrongChu(h.diemHen) || (giai && giai[linkNgan(h.diemHen)]);
    if (tay) {
      const chu = String(h.diemHen || '').replace(/https?:\/\/\S+/g, '').replace(/-?\d+\.\d+\s*,\s*-?\d+\.\d+/g, '').replace(/[\s,;:·-]+$/, '').trim();
      don = { ten: chu || 'Điểm hẹn', lat: tay.lat, lng: tay.lng, tay: true };
    } else if (h.diemHen) {
      /* vị trí theo địa danh trong ô (VD "DAD Resort - Đường Bãi Sao" → vùng Bãi Sao), nhưng TÊN giữ đúng chữ anh gõ */
      don = theoTu(h.diemHen);
      const ten = String(h.diemHen).split(/\s+[-–—]\s+|,/)[0].trim();
      if (don && ten && ten.length <= 40) don = { ...don, ten, uoc: don.ten };
    }
    const den = theoTu([h.ten, h.nhaCungCap, h.maDv].join(' '));
    if (don && don.tay && don.ten === 'Điểm hẹn') don.ten = String(h.ten || '').replace(/\s+[—-]\s+(Người lớn|Trẻ em|Em bé)$/i, '').trim() || 'Điểm hẹn';
    if (don && den && !gan(don, den)) return { don, den };
    /* một chỗ: toạ độ dán tay chính xác hơn từ khoá */
    const mot = don && (don.tay || !den) ? don : den;
    return mot ? { don: null, den: mot } : null;
  }

  /* ---- Tour có tuyến điểm dừng (window.PQ_TOUR từ /api/pq/tour.js, anh Hùng 24/09: "lịch trình của tour
   * vốn có sẵn trong maps") — G4: Cảng Vịnh Đầm → Mây Rút Ngoài → Mây Rút Trong → Gầm Ghì → Vịnh Đầm. ---- */
  const maTour = (h) => {
    const T = goc.PQ_TOUR && goc.PQ_TOUR.tour;
    const m = String((h && h.maDv) || '').toUpperCase().trim();
    if (m && T && T[m]) return m;
    const p = (/^\s*([A-Za-z0-9_]{2,14})\s*[-–:]\s+/.exec(String((h && h.ten) || '')) || [])[1];
    return p ? p.toUpperCase() : m;
  };
  function tuyenTour(h) {
    const T = goc.PQ_TOUR;
    const t = T && T.tour[maTour(h)];
    if (!t || !t.tuyen || t.tuyen.length < 2) return null;
    const ds = t.tuyen.map((id) => T.diem[id]).filter(Boolean).map((d) => ({ ...d }));
    const bo = ds.filter((d) => !d.dao);
    const capT = new Set((T.cap || []).map((c) => c.join('>')));
    for (const d of ds) {
      if (!d.dao || !bo.length) continue;
      /* bến của đảo = điểm đất liền gần nhất trong tuyến (cảng xuất phát, hoặc ga cáp treo) */
      const ben = bo.reduce((a, b) => (Math.hypot(b.lat - d.lat, b.lng - d.lng) < Math.hypot(a.lat - d.lat, a.lng - d.lng) ? b : a));
      d.ben = ben;
      d.kieu = capT.has(ben.id + '>' + d.id) || capT.has(d.id + '>' + ben.id) ? 'cap' : 'cano';
    }
    return ds;
  }
  /* điểm uốn luồng biển giữa hai điểm tuyến (diem.js LUONG_BIEN), để nét cano không cắt qua đảo */
  function luong(a, b) {
    const L = goc.PQ_TOUR && goc.PQ_TOUR.luong;
    if (!L || !a.id || !b.id) return [];
    if (L[a.id + '>' + b.id]) return L[a.id + '>' + b.id];
    if (L[b.id + '>' + a.id]) return L[b.id + '>' + a.id].slice().reverse();
    return [];
  }

  /* moc: [{ngay, gio, ten, h}] → điểm đã định vị + danh sách chưa rõ.
   * Số thứ tự đánh theo MỐC (không theo điểm): điểm đón và điểm đến của cùng một mốc mang cùng một số,
   * ghim đón vẽ rỗng (xem veThat) — khớp với số trên dòng thời gian của trang in. */
  function dinhVi(moc, giai) {
    const ngay = [...new Set(moc.map((m) => m.ngay).filter(Boolean))].sort((a, b) => a - b);
    const diem = [], chuaRo = [];
    const ds = moc.map((m, i) => ({ m, i })).sort((a, b) => ngay.indexOf(a.m.ngay) - ngay.indexOf(b.m.ngay) || (a.m.gio || 0) - (b.m.gio || 0) || a.i - b.i);
    let so = 0;
    for (const { m } of ds) {
      const t = doanTach(m.h, giai);
      const tuyen = tuyenTour(m.h);
      if (!t && !tuyen) { chuaRo.push(m.ten); continue; }
      const chung = { ngay: ngay.indexOf(m.ngay), gio: m.gio || 0, ten: m.ten, so: ++so };
      if (t && t.don) diem.push({ ...t.don, ...chung, noi: t.don.ten, don: true });
      /* tour có tuyến: mọi điểm dừng cùng số của mốc; điểm đầu (bến xuất phát) là ghim chính, còn lại chấm nhỏ */
      if (tuyen) tuyen.forEach((p, k) => diem.push({ ...p, ...chung, noi: p.ten, phu: k > 0 }));
      else diem.push({ ...t.den, ...chung, noi: t.den.ten });
    }
    return { ngay, diem, chuaRo };
  }

  /** Link Google Maps chỉ đường cho một ngày (tối đa 10 điểm — giới hạn của Google). */
  function linkGoogle(ds) {
    /* Google không chỉ đường xe ra đảo → điểm ngoài đảo thay bằng bến (ga cáp treo / cảng An Thới). */
    const p = ds.map((d) => (d.dao && d.ben ? { ...d.ben, noi: d.ben.ten } : d))
      .filter((d, i, a) => i === 0 || d.noi !== a[i - 1].noi).slice(0, 10).map((d) => d.lat + ',' + d.lng);
    if (!p.length) return '';
    if (p.length === 1) return 'https://www.google.com/maps/search/?api=1&query=' + p[0];
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + p[0] + '&destination=' + p[p.length - 1] +
      (p.length > 2 ? '&waypoints=' + encodeURIComponent(p.slice(1, -1).join('|')) : '');
  }

/** Các chặng của hành trình liền mạch: điểm i-1 → điểm i (bỏ chặng đứng yên cùng chỗ). */
  function chang(diem) {
    const out = [];
    for (let i = 1; i < diem.length; i++) {
      const a = diem[i - 1], b = diem[i];
      if (a.lat === b.lat && a.lng === b.lng) continue;
      out.push({ a, b, doiNgay: a.ngay !== b.ngay });
    }
    return out;
  }
  /**
   * Tách một chặng thành các đoạn đi thật: đất liền → bến (đường bộ) → đảo (cáp treo / cano, nét đứt).
   * Hai đầu cùng ngoài đảo (đảo này sang đảo kia bằng cano) → một đoạn biển.
   * @returns [{tu, den, bien}]
   */
  function doanChang(a, b) {
    const gan = (x, y) => Math.abs(x.lat - y.lat) < 1e-4 && Math.abs(x.lng - y.lng) < 1e-4;
    if (a.dao && b.dao) return [{ tu: a, den: b, bien: true }];
    const out = [];
    if (a.dao) { out.push({ tu: a, den: a.ben, bien: true }); if (!gan(a.ben, b)) out.push({ tu: a.ben, den: b, bien: false }); return out; }
    if (b.dao) { if (!gan(a, b.ben)) out.push({ tu: a, den: b.ben, bien: false }); out.push({ tu: b.ben, den: b, bien: true }); return out; }
    return [{ tu: a, den: b, bien: false }];
  }
  /** Cả chuyến trên Google Maps: Google nhận tối đa 10 điểm/link → chia đoạn, đoạn sau bắt đầu ở điểm cuối đoạn trước. */
  function linkGoogleNhieu(diem) {
    const ds = diem.filter((d, i) => i === 0 || d.lat !== diem[i - 1].lat || d.lng !== diem[i - 1].lng);
    if (ds.length < 2) return [];
    const out = [];
    for (let i = 0; i < ds.length - 1; i += 9) {
      const doan = ds.slice(i, i + 10);
      out.push({ tu: doan[0].so, den: doan[doan.length - 1].so, link: linkGoogle(doan) });
    }
    return out;
  }

  /* ---------------- sơ đồ vector (dự phòng khi không tải được bản đồ) ---------------- */
  const DAO = [[103.845, 10.372], [103.858, 10.398], [103.884, 10.418], [103.92, 10.438], [103.955, 10.452], [103.99, 10.458],
    [104.025, 10.447], [104.056, 10.43], [104.079, 10.408], [104.084, 10.382], [104.066, 10.36], [104.045, 10.345], [104.043, 10.315],
    [104.058, 10.286], [104.076, 10.255], [104.083, 10.222], [104.072, 10.19], [104.078, 10.158], [104.073, 10.12], [104.062, 10.088],
    [104.052, 10.058], [104.046, 10.03], [104.034, 10.006], [104.018, 10.004], [104.006, 10.022], [103.994, 10.055], [103.984, 10.09],
    [103.976, 10.128], [103.969, 10.165], [103.958, 10.2], [103.95, 10.228], [103.929, 10.255], [103.9, 10.276], [103.872, 10.298],
    [103.856, 10.322], [103.846, 10.348]];
  const W = 300, H = 600, X0 = 103.82, X1 = 104.1, Y0 = 10.47, Y1 = 9.88;
  const px = (lng) => ((lng - X0) / (X1 - X0)) * W;
  const py = (lat) => ((Y0 - lat) / (Y0 - Y1)) * H;
  function svg(dv, nho) {
    const dao = 'M' + DAO.map(([a, b]) => px(a).toFixed(1) + ',' + py(b).toFixed(1)).join('L') + 'Z';
    const duong = chang(dv.diem).flatMap(({ a, b, doiNgay }) => doanChang(a, b).map((d) => '<line class="bd-duong n' + (b.ngay % 5) + (doiNgay && !d.bien ? ' doi-ngay' : '') +
      '" x1="' + px(d.tu.lng).toFixed(1) + '" y1="' + py(d.tu.lat).toFixed(1) + '" x2="' + px(d.den.lng).toFixed(1) + '" y2="' + py(d.den.lat).toFixed(1) + '"/>')).join('');
    const gom = new Map();
    dv.diem.forEach((d) => { if (!gom.has(d.noi)) gom.set(d.noi, { ...d, soDs: [] }); gom.get(d.noi).soDs.push(d.so); });
    const cham = [...gom.values()].map((d) => { const x = px(d.lng), y = py(d.lat), trai = x > W * 0.62;
      return '<g class="bd-diem n' + (d.ngay % 5) + '"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (nho ? 7 : 9) + '"/><text class="bd-so" x="' + x.toFixed(1) + '" y="' + (y + 3.5).toFixed(1) + '">' +
        (d.soDs.length > 2 ? d.soDs[0] + '+' : d.soDs.join(',')) + '</text>' + (nho ? '' : '<text class="bd-ten" text-anchor="' + (trai ? 'end' : 'start') + '" x="' + (x + (trai ? -13 : 13)).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '">' + e(d.noi) + '</text>') + '</g>'; }).join('');
    return '<svg class="ban-do' + (nho ? ' nho' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sơ đồ lịch trình Phú Quốc"><path class="bd-dao" d="' + dao + '"/>' + duong + cham + '</svg>';
  }
  /** Bản vector — giữ chữ ký cũ cho chỗ nào còn gọi. */
  function ve(moc, nho, giai) { const dv = dinhVi(moc, giai); return { svg: svg(dv, nho), chuaRo: dv.chuaRo, coDiem: dv.diem.length, soNgay: dv.ngay.length }; }

  /* ---------------- bản đồ thật (Leaflet) ---------------- */
  const LEAFLET = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/';
  let napLeaflet = null;
  function taiLeaflet() {
    if (goc.L) return Promise.resolve(goc.L);
    if (napLeaflet) return napLeaflet;
    napLeaflet = new Promise((ok, loi) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = LEAFLET + 'leaflet.js';
      s.onload = () => (goc.L ? ok(goc.L) : loi(new Error('Leaflet không nạp được')));
      s.onerror = () => { napLeaflet = null; loi(new Error('Không tải được thư viện bản đồ')); };
      document.head.appendChild(s);
    });
    return napLeaflet;
  }
  const toi = () => {
    const t = document.documentElement.getAttribute('data-theme');
    return t === 'toi' || (t !== 'sang' && goc.matchMedia && goc.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  const MAU = () => { const c = getComputedStyle(document.documentElement); return ['--blue', '--orange', '--green', '--purple', '--red'].map((v) => c.getPropertyValue(v).trim() || '#2b5cff'); };

  /* Đường bộ giữa hai điểm (OSRM). Nhớ trong phiên để vẽ lại không gọi lại; hỏng thì trả null → vẽ thẳng. */
  const nhoDuong = new Map();
  async function duongBo(a, b) {
    const k = a.lat + ',' + a.lng + '>' + b.lat + ',' + b.lng;
    if (nhoDuong.has(k)) return nhoDuong.get(k);
    const p = (async () => {
      try {
        const ctl = new AbortController(); const hen = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch('https://router.project-osrm.org/route/v1/driving/' + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat + '?overview=full&geometries=geojson', { signal: ctl.signal });
        clearTimeout(hen);
        const j = await r.json();
        const c = j.routes && j.routes[0] && j.routes[0].geometry.coordinates;
        return c && c.length ? { toaDo: c.map(([x, y]) => [y, x]), km: j.routes[0].distance / 1000, phut: j.routes[0].duration / 60 } : null;
      } catch (_) { return null; }
    })();
    nhoDuong.set(k, p);
    return p;
  }

  /* Kiểu nền bản đồ (anh Hùng 23/09: "chuyển được sang vệ tinh"). Cả ba miễn phí, không cần khoá:
   * OSM gốc · ảnh vệ tinh Esri World Imagery + lớp nhãn địa danh/đường của Esri · OpenTopoMap. */
  const NEN = {
    /* bản đồ minh hoạ của phòng (ban-do-minh-hoa.js) — mặc định từ 24/09 */
    minhHoa: { ten: 'Minh hoạ Rooty Trip', lop: [] },
    duong: { ten: 'Bản đồ', lop: [['https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }]] },
    veTinh: { ten: 'Vệ tinh', lop: [
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Ảnh &copy; Esri, Maxar, Earthstar Geographics' }],
      ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: 0.7 }],
      ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }]] },
    diaHinh: { ten: 'Địa hình', lop: [['https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, subdomains: 'abc',
      attribution: '&copy; OpenStreetMap, <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' }]] },
  };
  const MAC_DINH = () => (goc.BanDoMinhHoa ? 'minhHoa' : 'duong');
  const nenLuu = () => { try { const v = goc.localStorage.getItem('kol-nen'); return NEN[v] && (v !== 'minhHoa' || goc.BanDoMinhHoa) ? v : MAC_DINH(); } catch (_) { return MAC_DINH(); } };
  const taoNen = (L, k) => (k === 'minhHoa' && goc.BanDoMinhHoa ? goc.BanDoMinhHoa.lop(L)
    : L.layerGroup((NEN[k] || NEN.duong).lop.map(([u, o]) => L.tileLayer(u, o))));

  /** Chặng từ a tới b cho KOL đọc: km + phút đi xe (OSRM), và phương tiện ra đảo nếu có.
   *  null = cùng một chỗ. Hỏng mạng thì km/phut = null, vẫn biết có đi cáp treo/cano không. */
  async function quangDuong(a, b) {
    if (Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lng - b.lng) < 1e-4) return null;
    let km = 0, phut = 0, du = true, bien = '';
    for (const d of doanChang(a, b)) {
      if (d.bien) { bien = (a.dao ? a.kieu : '') || (b.dao ? b.kieu : '') || bien || 'cano'; continue; }
      const r = await duongBo(d.tu, d.den);
      if (r) { km += r.km; phut += r.phut || 0; } else du = false;
    }
    /* huong: 'ra' = từ đảo chính ra đảo (xe trước, cáp/cano sau) · 've' = ngược lại · 'giua' = đảo sang đảo */
    return { km: du ? km : null, phut: du ? phut : null, bien, huong: bien ? (a.dao && b.dao ? 'giua' : a.dao ? 've' : 'ra') : '' };
  }

  /**
   * Vẽ bản đồ thật vào `khung`. Trả Promise<{ok, chuaRo, soDiem, ngay}>.
   * Không tải được Leaflet → đổ bản vector vào khung, ok:false.
   */
  /* Trang in (in-lich.js) gọi với: tinh — ảnh tĩnh, không nút phóng/kéo; sang — luôn nền sáng
   * dù app đang tối; lech — bản đồ riêng một ngày vẫn giữ màu của ngày đó trong cả chuyến. */
  async function veThat(khung, moc, { nho = false, giai = null, ngayNhan = [], tinh = false, sang = false, lech = 0, nen = '' } = {}) {
    const dv = dinhVi(moc, giai);
    let L;
    try { L = await taiLeaflet(); } catch (_) { khung.innerHTML = svg(dv, nho); return { ok: false, chuaRo: dv.chuaRo, soDiem: dv.diem.length, ngay: dv.ngay }; }
    if (khung._banDo) { khung._banDo.remove(); khung._banDo = null; }
    khung.innerHTML = '';
    const map = L.map(khung, tinh
      ? { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.25 }
      : { zoomControl: !nho, attributionControl: true, scrollWheelZoom: !nho });
    khung._banDo = map;
    /* Nền OpenStreetMap gốc — miễn phí, không cần khoá (CARTO từ 2026 đòi API key, hiện chữ
     * "API KEY REQUIRED"). OSM bắt buộc có Referer, mà hub đặt Referrer-Policy: same-origin cho
     * cả trang → đặt riêng chính sách cho ảnh nền, không thì OSM trả ô "Access blocked".
     * Nền tối = đảo màu bằng CSS (.bd-toi), OSM không có bản tối. */
    const kNen = NEN[nen] && (nen !== 'minhHoa' || goc.BanDoMinhHoa) ? nen : nenLuu();
    const datToi = (k) => khung.classList.toggle('bd-toi', !sang && k === 'duong' && toi());   // vệ tinh/địa hình không đảo màu
    const lopNen = {};
    for (const k of Object.keys(NEN)) lopNen[k] = taoNen(L, k);
    lopNen[kNen].addTo(map);
    datToi(kNen);
    /* Trên app: nút chọn kiểu nền (nhớ lựa chọn cho mọi bản đồ sau). Trang in tự có ô chọn riêng. */
    if (!tinh) {
      const theoTen = {};
      for (const k of Object.keys(NEN)) theoTen[NEN[k].ten] = lopNen[k];
      L.control.layers(theoTen, null, { position: 'bottomright', collapsed: true }).addTo(map);
      map.on('baselayerchange', (ev) => {
        const k = Object.keys(NEN).find((x) => NEN[x].ten === ev.name) || 'duong';
        datToi(k);
        try { goc.localStorage.setItem('kol-nen', k); } catch (_) {}
      });
    }
    const mau = MAU();
    const bien = [];
    /* Cùng một địa điểm nhiều mốc → một ghim, popup liệt kê các mốc. */
    const gom = new Map();
    dv.diem.forEach((d) => { const k = d.lat + ',' + d.lng; if (!gom.has(k)) gom.set(k, { ...d, muc: [] }); gom.get(k).muc.push(d); });
    for (const g of gom.values()) {
      const c = mau[(g.ngay + lech) % 5];
      const soDs = [...new Set(g.muc.map((m) => m.so))];
      const nhan = soDs.length > 2 ? soDs[0] + '+' : soDs.join(',');
      /* ghim chỉ là điểm đón: vòng rỗng viền màu ngày, để phân biệt với nơi diễn ra hoạt động */
      const chiDon = g.muc.every((m) => m.don);
      const chiPhu = g.muc.every((m) => m.phu);
      const icon = chiPhu
        ? L.divIcon({ className: 'bd-ghim phu', html: '<span style="background:' + c + '"></span>', iconSize: [12, 12], iconAnchor: [6, 6] })
        : L.divIcon({ className: 'bd-ghim' + (chiDon ? ' don' : ''), html: '<span style="' + (chiDon ? 'color:' + c + ';border-color:' + c : 'background:' + c) + '">' + nhan + '</span>', iconSize: [26, 26], iconAnchor: [13, 13] });
      L.marker([g.lat, g.lng], { icon, title: g.noi }).addTo(map).bindPopup('<b>' + e(g.noi) + '</b>' + (g.tay ? ' <i>(ghim tay)</i>' : '') + '<br>' +
        g.muc.map((m) => m.so + '. ' + (m.don ? 'Đón · ' : '') + e(m.ten) + (ngayNhan[m.ngay] ? ' · ' + e(ngayNhan[m.ngay]) : '') + (m.gio ? ' ' + new Date(m.gio + 7 * 3600000).toISOString().slice(11, 16) : '')).join('<br>') +
        '<br><a href="https://www.google.com/maps/search/?api=1&query=' + g.lat + ',' + g.lng + '" target="_blank" rel="noopener">Mở trên Google Maps</a>');
      bien.push([g.lat, g.lng]);
    }
    if (bien.length) map.fitBounds(bien, { padding: tinh ? [44, 44] : [28, 28], maxZoom: 14 }); else map.setView([10.2, 103.97], 10);
    /* MỘT hành trình xuyên suốt cả chuyến (anh Hùng 23/09): nối mọi điểm theo thời gian, kể cả
     * chặng cuối ngày → đầu ngày sau. Chặng mang màu ngày của điểm ĐẾN; chặng chuyển ngày vẽ
     * mảnh hơn. Vẽ thẳng nét đứt trước (thấy ngay), rồi thay chặng trên đảo bằng đường bộ thật;
     * chặng có đầu ngoài đảo (cáp treo, cano) giữ nét đứt. */
    const cho = [];
    if (lopNen[kNen]._san) cho.push(lopNen[kNen]._san);   // nền minh hoạ vẽ ảnh bất đồng bộ
    for (const { a, b, doiNgay } of chang(dv.diem)) {
      const c = mau[(b.ngay + lech) % 5];
      const net = doiNgay ? { weight: 2.5, opacity: 0.6, dashArray: '2 6' } : { weight: 4, opacity: 0.85 };
      for (const d of doanChang(a, b)) {
        if (d.bien) { L.polyline([[d.tu.lat, d.tu.lng], ...luong(d.tu, d.den), [d.den.lat, d.den.lng]], { color: c, weight: 3, opacity: 0.9, dashArray: '8 7' }).addTo(map); continue; }
        const thang = L.polyline([[d.tu.lat, d.tu.lng], [d.den.lat, d.den.lng]], { color: c, weight: 3, opacity: 0.6, dashArray: '6 6' }).addTo(map);
        cho.push(duongBo(d.tu, d.den).then((r) => {
          if (!r || !khung._banDo || khung._banDo !== map) return;
          map.removeLayer(thang);
          /* viền trắng dưới đường: nền minh hoạ / vệ tinh nhiều màu xanh, không viền là đường chìm mất */
          L.polyline(r.toaDo, { color: '#fff', weight: net.weight + 2.5, opacity: doiNgay ? 0.45 : 0.85, lineCap: 'round', lineJoin: 'round' }).addTo(map);
          L.polyline(r.toaDo, { color: c, ...net, opacity: doiNgay ? net.opacity : 1 }).addTo(map);
        }).catch(() => {}));
      }
    }
    setTimeout(() => map.invalidateSize(), 60);
    return { ok: true, chuaRo: dv.chuaRo, soDiem: dv.diem.length, ngay: dv.ngay, theoNgay: dv.ngay.map((_, i) => linkGoogle(dv.diem.filter((d) => d.ngay === i))),
      caChuyen: linkGoogleNhieu(dv.diem), diem: dv.diem, map, xong: Promise.all(cho) };
  }

  goc.BanDo = { ve, veThat, quangDuong, NEN, doan, doanTach, maTour, tuyenTour, dinhVi, linkGoogle, linkGoogleNhieu, chang, doanChang, toaDoTrongChu, linkNgan, DIEM };
})(window);
