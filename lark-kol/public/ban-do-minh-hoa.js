/* ==========================================================================
   Nền "Minh hoạ Rooty Trip" cho bản đồ Leaflet của app KOL (anh Hùng 24/09: dùng bản đồ
   minh hoạ Phú Quốc của phòng thay cho nền OSM trơn).

   Dữ liệu (public/pq-du-lieu.js, ~800 KB, chỉ nạp khi chọn nền này) tách từ bản dựng
   "Ban-do-du-lich-Phu-Quoc-icon-reality-v3.html" của app lark-ban-do: đường bờ, rừng, bãi cát,
   hồ, đường sá (OSM), ảnh độ cao + đổ bóng (DEM), 31 hình minh hoạ điểm đến.
   Cách vẽ nền chép từ veNenCanvas() của bản đó: biển nhiều tầng → nước nông → cát → đất tô
   theo tầng độ cao + sườn đón nắng. Ở đây vẽ MỘT ảnh cho cả đảo rồi phủ lên Leaflet bằng
   imageOverlay; đường sá phủ bằng svgOverlay cho nét sắc khi phóng/in.

   Phép chiếu của bản minh hoạ là phẳng (x theo kinh độ × cos vĩ độ, y theo vĩ độ); Leaflet dùng
   Mercator. Trong khung Phú Quốc (~0,7° vĩ độ) hai phép lệch nhau dưới 50 m — không đáng kể.
   ========================================================================== */
(function (goc) {
  'use strict';
  const M = 90;                                  // lề biển quanh đảo, đơn vị bản đồ minh hoạ
  const TRUOC = (goc.__HUB__ && goc.__HUB__.prefix) || '';
  const V = ((document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src)) || [])[1] || '1';

  let napDl = null;
  const taiDuLieu = () => napDl || (napDl = new Promise((ok, loi) => {
    if (goc.PQ_HINH) return ok();
    const s = document.createElement('script');
    s.src = TRUOC + '/pq-du-lieu.js?v=' + V;
    s.onload = () => (goc.PQ_HINH ? ok() : loi(new Error('Thiếu dữ liệu bản đồ minh hoạ')));
    s.onerror = () => { napDl = null; loi(new Error('Không tải được dữ liệu bản đồ minh hoạ')); };
    document.head.appendChild(s);
  }));

  /* toạ độ bản đồ minh hoạ ↔ vĩ/kinh độ */
  const C = () => goc.PQ_HINH.chieu;
  const nguoc = (x, y) => [C().BAC - y / C().K, C().TAY + x / (C().K * C().COS)];
  const bien = () => { const H = goc.PQ_HINH; return [nguoc(-M, H.cao + M), nguoc(H.rong + M, -M)]; };

  /* hình minh hoạ: symbol SVG 64×64 — gắn một lần vào trang để <use href="#h-…"> tham chiếu */
  function ganHinh() {
    if (document.getElementById('pqHinhVe') || !goc.PQ_HINH_VE) return;
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.id = 'pqHinhVe'; s.setAttribute('aria-hidden', 'true');
    s.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    s.innerHTML = '<defs>' + goc.PQ_HINH_VE.defs + '</defs>';
    document.body.appendChild(s);
  }

  /* ---------- ảnh nền cả đảo (vẽ một lần mỗi trang) ---------- */
  let napAnh = null;
  const anhNen = () => napAnh || (napAnh = taiDuLieu().then(() => new Promise((ok) => {
    const H = goc.PQ_HINH, DH = goc.PQ_DIA_HINH;
    const k = Math.min(3, 4200 / (H.cao + 2 * M));
    const w = Math.round((H.rong + 2 * M) * k), h = Math.round((H.cao + 2 * M) * k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const dat = new Path2D(H.daoChinh + H.hon);
    const coBlur = 'filter' in g;
    /* biển: khơi đậm dần xuống Nam */
    const tb = g.createLinearGradient(0, 0, w * .3, h);
    tb.addColorStop(0, '#15a9d5'); tb.addColorStop(1, '#078cc7');
    g.fillStyle = tb; g.fillRect(0, 0, w, h);
    g.setTransform(k, 0, 0, k, M * k, M * k);
    g.lineJoin = 'round'; g.lineCap = 'round';

    /* nước nông quanh bờ: vẽ ảnh nhỏ rồi phóng (làm mờ trên ảnh lớn rất tốn) */
    const kN = .7;
    const cn = document.createElement('canvas');
    cn.width = Math.round((H.rong + 2 * M) * kN); cn.height = Math.round((H.cao + 2 * M) * kN);
    const gn = cn.getContext('2d');
    gn.setTransform(kN, 0, 0, kN, M * kN, M * kN); gn.lineJoin = 'round'; gn.lineCap = 'round';
    for (const [rong, mau, mo] of [[150, 'rgba(21,169,213,.32)', 40], [96, 'rgba(24,174,214,.4)', 26], [58, 'rgba(48,188,214,.48)', 16],
      [32, 'rgba(85,205,215,.6)', 9], [16, 'rgba(110,214,212,.72)', 4.5]]) {
      if (coBlur) gn.filter = 'blur(' + (mo * kN).toFixed(1) + 'px)';
      gn.strokeStyle = mau; gn.lineWidth = rong; gn.stroke(dat);
    }
    const sh = H.sanHo || { ran: [], da: [] };
    if (coBlur) gn.filter = 'blur(' + (1.4 * kN).toFixed(1) + 'px)';
    gn.fillStyle = 'rgba(40,150,160,.38)';
    for (let i = 0; i < sh.ran.length; i += 3) { gn.beginPath(); gn.ellipse(sh.ran[i], sh.ran[i + 1], sh.ran[i + 2] * 1.4, sh.ran[i + 2], i, 0, 7); gn.fill(); }
    gn.filter = 'none';
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingQuality = 'high'; g.drawImage(cn, 0, 0, w, h);
    g.setTransform(k, 0, 0, k, M * k, M * k);
    if (coBlur) g.filter = 'blur(' + (1.6 * k).toFixed(1) + 'px)';
    g.strokeStyle = 'rgba(141,221,210,.82)'; g.lineWidth = 7; g.stroke(dat);
    g.filter = 'none';
    /* sóng trắng đứt quãng quanh bờ */
    {
      const cs = document.createElement('canvas'); cs.width = w; cs.height = h;
      const gs = cs.getContext('2d');
      gs.setTransform(k, 0, 0, k, M * k, M * k); gs.lineJoin = 'round'; gs.lineCap = 'round';
      gs.setLineDash([5, 17]); gs.strokeStyle = '#fff'; gs.lineWidth = 5.2; gs.stroke(dat);
      gs.setLineDash([]); gs.globalCompositeOperation = 'destination-out'; gs.lineWidth = 4.2; gs.stroke(dat); gs.fill(dat);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = .38; g.drawImage(cs, 0, 0); g.restore();
    }

    const TANG = [[0, [126, 187, 94]], [40, [111, 175, 85]], [110, [88, 158, 76]], [230, [62, 135, 68]], [420, [42, 110, 60]]];
    const tang = (e) => {
      for (let i = 1; i < TANG.length; i++) if (e <= TANG[i][0]) {
        const [e0, c0] = TANG[i - 1], [e1, c1] = TANG[i], t = (e - e0) / (e1 - e0), m = t * t * (3 - 2 * t);
        return [c0[0] + (c1[0] - c0[0]) * m, c0[1] + (c1[1] - c0[1]) * m, c0[2] + (c1[2] - c0[2]) * m];
      }
      return TANG[TANG.length - 1][1];
    };
    const diaHinh = (aCao, aBong) => {
      const W = aCao.naturalWidth, Hh = aCao.naturalHeight;
      const c = document.createElement('canvas'); c.width = W; c.height = Hh;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(aCao, 0, 0); const dc = x.getImageData(0, 0, W, Hh).data;
      x.drawImage(aBong, 0, 0, W, Hh); const db = x.getImageData(0, 0, W, Hh).data;
      const ra = x.createImageData(W, Hh), o = ra.data, SANG = [214, 236, 160], TOI = [28, 84, 50];
      for (let i = 0; i < W * Hh; i++) {
        const v = dc[i * 4] / 255, e = v * v * 600;
        let [r, gg, b] = tang(e);
        const hs = Math.max(-1, Math.min(1, (db[i * 4] - 128) / 110)) * Math.min(1, e / 25);
        if (hs > 0) { const t = hs * .36; r += (SANG[0] - r) * t; gg += (SANG[1] - gg) * t; b += (SANG[2] - b) * t; }
        else { const t = -hs * .34; r += (TOI[0] - r) * t; gg += (TOI[1] - gg) * t; b += (TOI[2] - b) * t; }
        o[i * 4] = r; o[i * 4 + 1] = gg; o[i * 4 + 2] = b; o[i * 4 + 3] = 255;
      }
      x.putImageData(ra, 0, 0);
      return c;
    };
    const veDat = (aBong, aCao) => {
      g.save(); g.clip(dat);
      g.fillStyle = '#75af58'; g.fillRect(-M, -M, H.rong + 2 * M, H.cao + 2 * M);
      if (aBong && aCao) {
        if (coBlur) g.filter = 'blur(' + (.7 * k).toFixed(1) + 'px)';
        g.drawImage(diaHinh(aCao, aBong), 0, 0, H.rong, H.cao);
        g.filter = 'none';
      }
      if (coBlur) g.filter = 'blur(' + (3 * k).toFixed(1) + 'px)';
      g.fillStyle = 'rgba(35,95,54,.2)'; g.fill(new Path2D(H.rung || ''));
      g.filter = 'none';
      g.strokeStyle = 'rgba(236,214,150,.85)'; g.lineWidth = 1.5; g.stroke(dat);
      const cat = new Path2D(H.cat || '');
      g.fillStyle = '#f3d594'; g.fill(cat); g.strokeStyle = '#f3d594'; g.lineWidth = 2.6; g.stroke(cat);
      g.strokeStyle = 'rgba(251,236,192,.9)'; g.lineWidth = .7; g.stroke(dat);
      for (let i = 0; i < sh.da.length; i += 3) {
        g.fillStyle = '#9d9788'; g.beginPath(); g.arc(sh.da[i], sh.da[i + 1], sh.da[i + 2], 0, 7); g.fill();
      }
      /* hồ, sông */
      g.fillStyle = 'rgba(72,198,206,.9)'; g.fill(new Path2D(H.ho || ''));
      g.strokeStyle = 'rgba(72,198,206,.9)'; g.lineWidth = .9; g.stroke(new Path2D(H.song || ''));
      g.restore();
      if (cv.toBlob) cv.toBlob((b) => ok(b ? URL.createObjectURL(b) : cv.toDataURL()), 'image/png');
      else ok(cv.toDataURL());
    };
    if (DH && DH.anh && DH.cao) {
      const a = new Image(), b = new Image();
      let con = 2;
      a.onload = b.onload = () => { if (--con === 0) veDat(a, b); };
      a.onerror = b.onerror = () => { con = -1; veDat(null, null); };
      a.src = DH.anh; b.src = DH.cao;
    } else veDat(null, null);
  })));

  /* ---------- đường sá: SVG vector, nét giữ độ dày theo điểm ảnh khi phóng ---------- */
  function svgDuong() {
    const H = goc.PQ_HINH;
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', [-M, -M, H.rong + 2 * M, H.cao + 2 * M].join(' '));
    s.setAttribute('preserveAspectRatio', 'none');
    const p = (d, css) => '<path d="' + (d || '') + '" style="fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;' + css + '"/>';
    s.innerHTML = p(H.duongNho, 'stroke:#fff5dd;stroke-width:.9;opacity:.4') +
      p(H.duongPhu, 'stroke:#fff5dd;stroke-width:1.4;opacity:.7') +
      p(H.duongChinh, 'stroke:rgba(85,115,78,.42);stroke-width:4.4') +
      p(H.duongChinh, 'stroke:#fff5dd;stroke-width:2.4');
    return s;
  }

  /* Tên điểm không được đè nhau, đè ghim số hay đè hình khác: xét lần lượt từ điểm quan trọng
   * (cap nhỏ) — thử bên phải, rồi bên trái; không chỗ nào trống thì ẩn tên (hình vẫn còn). */
  function xepNhan(c) {
    const khung = c.getBoundingClientRect();
    const hien = (e) => getComputedStyle(e).display !== 'none';
    /* vật cản: ghim số của chuyến + mọi hình minh hoạ đang hiện (nhớ hình của điểm nào để bỏ qua chính nó) */
    const chiem = [...c.querySelectorAll('.bd-ghim span')].map((e) => ({ r: e.getBoundingClientRect(), cua: null }))
      .concat([...c.querySelectorAll('.mh-diem')].filter(hien).map((e) => ({ r: e.querySelector('svg').getBoundingClientRect(), cua: e })))
      .filter((o) => o.r.width);
    const de = (r, e) => chiem.some((o) => o.cua !== e && r.left < o.r.right - 1 && r.right > o.r.left + 1 && r.top < o.r.bottom - 1 && r.bottom > o.r.top + 1)
      || r.left < khung.left + 2 || r.right > khung.right - 2 || r.top < khung.top + 2 || r.bottom > khung.bottom - 2;
    const ds = [...c.querySelectorAll('.mh-diem')].filter(hien).sort((a, b) => (+a.dataset.cap || 1) - (+b.dataset.cap || 1));
    for (const e of ds) {
      const sp = e.querySelector('span');
      sp.style.visibility = ''; e.classList.remove('trai');
      let r = sp.getBoundingClientRect();
      if (de(r, e)) { e.classList.add('trai'); r = sp.getBoundingClientRect(); }
      if (de(r, e)) { e.classList.remove('trai'); sp.style.visibility = 'hidden'; continue; }
      chiem.push({ r, cua: e });
    }
  }

  /* ---------- hình minh hoạ điểm đến + tên ---------- */
  function lopHinh(L) {
    const g = L.layerGroup();
    for (const d of goc.PQ_DIEM || []) {
      const hv = goc.PQ_HINH_VE && goc.PQ_HINH_VE.theoDiem[d.id];
      if (!hv || d.lat == null) continue;
      const icon = L.divIcon({ className: 'mh-diem c' + (d.cap || 1), iconSize: [0, 0],
        html: '<svg viewBox="0 0 64 64"><use href="#' + hv + '"/></svg><span>' + String(d.ten).replace(/</g, '&lt;') + '</span>' });
      const m = L.marker([d.lat, d.lon], { icon, interactive: false, keyboard: false, zIndexOffset: -1000 });
      m.on('add', () => { const el = m.getElement(); if (el) el.dataset.cap = d.cap == null ? 1 : d.cap; });
      g.addLayer(m);
    }
    return g;
  }

  /**
   * Lớp nền cho Leaflet (dùng như một base layer). Trả về ngay; ảnh nền vẽ xong thì tự hiện.
   * `lop._san` = Promise khi mọi thứ đã lên — trang in chờ cái này trước khi cho in.
   */
  function lop(L) {
    const g = L.layerGroup();
    let map = null;
    const capHinh = () => {
      if (!map) return;
      const z = map.getZoom(), c = map.getContainer();
      c.classList.toggle('mh-xa', z < 11.5);        // nhìn cả đảo: chỉ hình điểm chính, ẩn chữ điểm phụ
      c.classList.toggle('mh-gan', z >= 13);
      requestAnimationFrame(() => xepNhan(c));
    };
    /* chỉ tải dữ liệu + vẽ ảnh khi lớp thật sự được bật (app tạo sẵn mọi nền cho ô chọn nền) */
    const batDau = () => g._san || (g._san = anhNen().then((url) => {
      ganHinh();
      const b = bien();
      g.addLayer(L.imageOverlay(url, b, { interactive: false, attribution: 'Minh hoạ Rooty Trip · &copy; OpenStreetMap' }));
      g.addLayer(L.svgOverlay(svgDuong(), b, { interactive: false }));
      g.addLayer(lopHinh(L));
      capHinh();
      return new Promise((ok) => setTimeout(ok, 50));
    }).catch(() => null));
    g.on('add', () => {
      map = g._map;
      if (!map) return;
      map.getContainer().classList.add('bd-mh');
      map.on('zoomend', capHinh); capHinh();
      batDau();
    });
    g.on('remove', () => { if (map) { map.getContainer().classList.remove('bd-mh', 'mh-xa', 'mh-gan'); map.off('zoomend', capHinh); } });
    return g;
  }

  goc.BanDoMinhHoa = { lop, taiDuLieu };
})(window);
