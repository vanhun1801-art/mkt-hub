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
    ['Thiền viện Trúc Lâm Hộ Quốc (ước lượng)', 10.107, 104.047, ['ho quoc', 'thien vien', 'truc lam']],
    ['Nhà tù Phú Quốc', 10.04345, 104.01879, ['nha tu', 'coconut prison', 'coconut tree']],
    ['Bãi Sao', 10.05247, 104.03519, ['bai sao', 'sao beach']],
    ['Bãi Khem', 10.03577, 104.03063, ['bai khem', 'kem beach', 'sun premier village kem']],
    ['Cầu Hôn', 10.02826, 104.00419, ['cau hon', 'kiss bridge', 'nha hat', 'kiss of the sea', 'symphony']],
    ['Ga cáp treo An Thới', 10.02704, 104.00724, ['ga cap treo', 'nha ga an thoi']],
    ['Sunset Town', 10.02943, 104.00831, ['sunset town', 'hoang hon', 'primavera', 'gland5', 'land 5', 'viet xua an thoi']],
    ['An Thới', 10.01209, 104.01481, ['an thoi']],
    ['Hòn Thơm', 9.9565, 104.01807, ['hon thom', 'cap treo', 'sun world', 'aquatopia', 'exotica', 'sun paradise', 'sun-c', 'mango'], true],
    ['Hòn Mây Rút', 9.91142, 103.98959, ['hon may rut', '3 dao', 'ba dao', 'cano', 'lan bien', 'lan ngam', 'g4'], true],
    ['Hòn Gầm Ghì', 9.912, 104.01493, ['hon gam ghi'], true],
    ['Hòn Dừa', 9.99601, 104.01042, ['hon dua'], true],
    ['Sunset Sanato', 10.15401, 103.97942, ['sanato']],
    ['Chợ đêm Dinh Cậu', 10.2163, 103.96058, ['cho dem', 'night market', 'dinh cau']],
    ['Dương Đông', 10.2175, 103.9601, ['duong dong', 'viet xua']],
  ];
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
    for (const d of DIEM) if (d[3].some((k) => t.includes(k))) return { ten: d[0], lat: d[1], lng: d[2], dao: !!d[4] };
    return null;
  }

  /* moc: [{ngay, gio, ten, h}] → điểm đã định vị + danh sách chưa rõ */
  function dinhVi(moc, giai) {
    const ngay = [...new Set(moc.map((m) => m.ngay).filter(Boolean))].sort((a, b) => a - b);
    const diem = [], chuaRo = [];
    for (const m of moc) {
      const d = doan(m.h, giai);
      if (!d) { chuaRo.push(m.ten); continue; }
      diem.push({ ...d, noi: d.ten, ngay: ngay.indexOf(m.ngay), gio: m.gio || 0, ten: m.ten });
    }
    diem.sort((a, b) => a.ngay - b.ngay || a.gio - b.gio);
    diem.forEach((d, i) => { d.so = i + 1; });
    return { ngay, diem, chuaRo };
  }

  /** Link Google Maps chỉ đường cho một ngày (tối đa 10 điểm — giới hạn của Google). */
  function linkGoogle(ds) {
    const p = ds.filter((d, i) => i === 0 || d.noi !== ds[i - 1].noi).slice(0, 10).map((d) => d.lat + ',' + d.lng);
    if (!p.length) return '';
    if (p.length === 1) return 'https://www.google.com/maps/search/?api=1&query=' + p[0];
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + p[0] + '&destination=' + p[p.length - 1] +
      (p.length > 2 ? '&waypoints=' + encodeURIComponent(p.slice(1, -1).join('|')) : '');
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
    const duong = dv.ngay.map((_, i) => {
      const ds = dv.diem.filter((d) => d.ngay === i);
      return ds.length > 1 ? '<polyline class="bd-duong n' + (i % 5) + '" points="' + ds.map((d) => px(d.lng).toFixed(1) + ',' + py(d.lat).toFixed(1)).join(' ') + '"/>' : '';
    }).join('');
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
        return c && c.length ? { toaDo: c.map(([x, y]) => [y, x]), km: j.routes[0].distance / 1000 } : null;
      } catch (_) { return null; }
    })();
    nhoDuong.set(k, p);
    return p;
  }

  /**
   * Vẽ bản đồ thật vào `khung`. Trả Promise<{ok, chuaRo, soDiem, ngay}>.
   * Không tải được Leaflet → đổ bản vector vào khung, ok:false.
   */
  async function veThat(khung, moc, { nho = false, giai = null, ngayNhan = [] } = {}) {
    const dv = dinhVi(moc, giai);
    let L;
    try { L = await taiLeaflet(); } catch (_) { khung.innerHTML = svg(dv, nho); return { ok: false, chuaRo: dv.chuaRo, soDiem: dv.diem.length, ngay: dv.ngay }; }
    if (khung._banDo) { khung._banDo.remove(); khung._banDo = null; }
    khung.innerHTML = '';
    const map = L.map(khung, { zoomControl: !nho, attributionControl: true, scrollWheelZoom: !nho });
    khung._banDo = map;
    /* Nền OpenStreetMap gốc — miễn phí, không cần khoá (CARTO từ 2026 đòi API key, hiện chữ
     * "API KEY REQUIRED"). OSM bắt buộc có Referer, mà hub đặt Referrer-Policy: same-origin cho
     * cả trang → đặt riêng chính sách cho ảnh nền, không thì OSM trả ô "Access blocked".
     * Nền tối = đảo màu bằng CSS (.bd-toi), OSM không có bản tối. */
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    khung.classList.toggle('bd-toi', toi());
    const mau = MAU();
    const bien = [];
    /* Cùng một địa điểm nhiều mốc → một ghim, popup liệt kê các mốc. */
    const gom = new Map();
    dv.diem.forEach((d) => { const k = d.lat + ',' + d.lng; if (!gom.has(k)) gom.set(k, { ...d, muc: [] }); gom.get(k).muc.push(d); });
    for (const g of gom.values()) {
      const c = mau[g.ngay % 5];
      const nhan = g.muc.length > 2 ? g.muc[0].so + '+' : g.muc.map((m) => m.so).join(',');
      const icon = L.divIcon({ className: 'bd-ghim', html: '<span style="background:' + c + '">' + nhan + '</span>', iconSize: [26, 26], iconAnchor: [13, 13] });
      L.marker([g.lat, g.lng], { icon, title: g.noi }).addTo(map).bindPopup('<b>' + e(g.noi) + '</b>' + (g.tay ? ' <i>(ghim tay)</i>' : '') + '<br>' +
        g.muc.map((m) => m.so + '. ' + e(m.ten) + (ngayNhan[m.ngay] ? ' · ' + e(ngayNhan[m.ngay]) : '') + (m.gio ? ' ' + new Date(m.gio + 7 * 3600000).toISOString().slice(11, 16) : '')).join('<br>') +
        '<br><a href="https://www.google.com/maps/search/?api=1&query=' + g.lat + ',' + g.lng + '" target="_blank" rel="noopener">Mở trên Google Maps</a>');
      bien.push([g.lat, g.lng]);
    }
    if (bien.length) map.fitBounds(bien, { padding: [28, 28], maxZoom: 14 }); else map.setView([10.2, 103.97], 10);
    /* Đường đi từng ngày: vẽ thẳng nét đứt trước (thấy ngay), rồi thay chặng trên đảo bằng đường bộ thật. */
    dv.ngay.forEach((_, i) => {
      const ds = dv.diem.filter((d) => d.ngay === i);
      for (let j = 1; j < ds.length; j++) {
        const a = ds[j - 1], b = ds[j];
        if (a.lat === b.lat && a.lng === b.lng) continue;
        const thang = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: mau[i % 5], weight: 3, opacity: 0.8, dashArray: '6 6' }).addTo(map);
        if (a.dao || b.dao) continue;   // cáp treo / cano: giữ nét đứt
        duongBo(a, b).then((r) => {
          if (!r || !khung._banDo || khung._banDo !== map) return;
          map.removeLayer(thang);
          L.polyline(r.toaDo, { color: mau[i % 5], weight: 4, opacity: 0.85 }).addTo(map);
        });
      }
    });
    setTimeout(() => map.invalidateSize(), 60);
    return { ok: true, chuaRo: dv.chuaRo, soDiem: dv.diem.length, ngay: dv.ngay, theoNgay: dv.ngay.map((_, i) => linkGoogle(dv.diem.filter((d) => d.ngay === i))) };
  }

  goc.BanDo = { ve, veThat, doan, dinhVi, linkGoogle, toaDoTrongChu, linkNgan, DIEM };
})(window);
