/* ==========================================================================
   Kiểu bản đồ nền — dữ liệu OpenStreetMap qua OpenFreeMap (vector, miễn phí, không
   cần API key), địa hình từ bộ DEM Terrarium công khai trên AWS.

   Bố cục, thứ bậc đường, cách ẩn hiện nhãn theo mức phóng bám theo Google Maps (anh
   Hùng 23/09: "dựa trên bản đồ thật của Google Maps rồi điều chỉnh lại"). Chỗ điều
   chỉnh cho Phú Quốc:
     · biển xanh ngọc đặc trưng: sát bờ sáng như nước cạn, ra khơi đậm dần
     · rừng Vườn quốc gia có hoạ tiết tán cây dày (ảnh "tan-cay" dựng bằng canvas)
     · đồi núi đổ bóng nhẹ để thấy dãy Hàm Ninh – Núi Chúa
     · ẩn POI của nền — điểm du lịch do bản đồ tự vẽ bằng hình minh hoạ riêng
   ========================================================================== */
(function () {
  'use strict';

  const MAU = {
    /* Tông poster 'Bản đồ du lịch Phú Quốc' của phòng (anh Hùng 24/09: nghiêng về bản đầu,
       mềm mại hơn): đất xanh non, đường trắng kem mảnh, rừng xanh mềm, biển xanh ngọc. */
    sang: {
      nen: '#dcefbd', dat: '#dcefbd', khuDan: '#e8f1d2',
      rung: '#a9d77f', rungDam: '#96cc6c', co: '#cde8a2', congVien: '#c4e49a',
      cat: '#f8e7b0', bien: '#22a6cd', bienSau: '#1690bd', bienNong: '#6fdcd8', bienSat: '#b8f2e6',
      song: '#6fd0ea', duongChinh: '#fffbe9', duongChinhVien: 'rgba(118,160,78,.55)',
      duong: '#ffffff', duongVien: 'rgba(118,160,78,.4)', duongNho: '#fbfdf4', duongNhoVien: 'rgba(118,160,78,.28)',
      nhaCua: '#e7eed8', nhaCuaVien: '#cfdcbc', duongBang: '#d9dfcf', sanBay: '#e6efd6',
      chu: '#33512a', chuNhat: '#5a7550', vienChu: 'rgba(255,255,255,.92)', chuBien: '#0d6a8f', chuNui: '#5f6a3a',
      bong: '#4a7a36', sangBong: 'rgba(255,255,235,.5)',
    },
    toi: {
      nen: '#1b2128', dat: '#1f262d', khuDan: '#232b33',
      rung: '#1f3b2a', rungDam: '#1a3324', co: '#23392c', congVien: '#213a2b',
      cat: '#3d3a2c', bien: '#0b3d57', bienSau: '#082d42', bienNong: '#11606f', bienSat: '#177a82',
      song: '#155a78', duongChinh: '#7a6634', duongChinhVien: '#4d4122',
      duong: '#3a434d', duongVien: '#2a3139', duongNho: '#333b44', duongNhoVien: '#262d35',
      nhaCua: '#2b333c', nhaCuaVien: '#252c34', duongBang: '#3b4148', sanBay: '#262c35',
      chu: '#cfd6dd', chuNhat: '#9aa4ae', vienChu: '#141a20', chuBien: '#7fc3e0', chuNui: '#c9b89c',
      bong: '#000000', sangBong: '#6b7f8f',
    },
  };

  /* Chữ: nhãn tiếng Việt lấy name (OSM Việt Nam ghi tên Việt), tiếng Anh lấy name:en → name:latin */
  const ten = (lang) => lang === 'en'
    ? ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]
    : ['coalesce', ['get', 'name:vi'], ['get', 'name']];

  const FONT = ['Noto Sans Regular'], FONT_DAM = ['Noto Sans Bold'], FONT_NGHIENG = ['Noto Sans Italic'];

  const noi = (z) => ['interpolate', ['exponential', 1.4], ['zoom']].concat(z);

  function phongCach(theme, lang) {
    const m = MAU[theme === 'toi' ? 'toi' : 'sang'];
    const L = [];
    L.push({ id: 'nen', type: 'background', paint: { 'background-color': m.nen } });

    /* mặt đất trước */
    L.push({ id: 'khu-dan', type: 'fill', source: 'omt', 'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['residential', 'suburb', 'neighbourhood', 'commercial', 'retail'], true, false],
      paint: { 'fill-color': m.khuDan, 'fill-opacity': noi([10, 0, 13, 1]) } });
    L.push({ id: 'co', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'farmland', 'wetland'], true, false], paint: { 'fill-color': m.co, 'fill-opacity': .7 } });
    L.push({ id: 'rung', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'wood'],
      paint: { 'fill-color': m.rung, 'fill-antialias': false } });
    L.push({ id: 'rung-cay', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'wood'], minzoom: 10.5,
      paint: { 'fill-pattern': 'tan-cay', 'fill-opacity': noi([10.5, 0, 12, .9]) } });
    /* KHÔNG vẽ lớp `park`: ở Phú Quốc nó gồm cả khu bảo tồn biển, tô lên là biển thành
       xanh lá nhạt và hiện các đường ranh thẳng giữa biển (đã gặp 24/09). */
    L.push({ id: 'cat', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'sand'], paint: { 'fill-color': m.cat } });

    /* Đổ bóng địa hình vẽ TRƯỚC mặt nước: DEM Terrarium có cả độ sâu đáy biển, vẽ sau
       nước là biển bị "đổ bóng" nhạt màu và lộ các mép dữ liệu thẳng tắp (24/09). */
    L.push({ id: 'dia-hinh', type: 'hillshade', source: 'dem', maxzoom: 16,
      paint: { 'hillshade-shadow-color': m.bong, 'hillshade-highlight-color': m.sangBong, 'hillshade-accent-color': m.bong,
        'hillshade-exaggeration': .42, 'hillshade-illumination-direction': 315 } });

    /* nước */
    L.push({ id: 'bien', type: 'fill', source: 'omt', 'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: { 'fill-color': ['match', ['get', 'class'], ['lake', 'river', 'pond'], m.song, m.bien] } });
    /* Dải nước nông xanh ngọc: vẽ theo đường bờ biển OSM, đẩy lệch (line-offset > 0) sang
       bên PHẢI của chiều vẽ — quy ước OSM là đất bên trái, nước bên phải — nên dải sáng
       nằm trọn ngoài biển, không lấn lên đất. */
    const dai = (id, mau, rong, mo) => L.push({ id, type: 'line', source: 'bo',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': mau, 'line-width': noi(rong), 'line-offset': noi(rong.map((v, i) => i % 2 ? v / 2 : v)),
        'line-blur': noi(rong.map((v, i) => i % 2 ? v * .8 : v)), 'line-opacity': mo } });
    dai('bien-nong', m.bienNong, [7, 8, 10, 28, 13, 80, 16, 200], .75);
    dai('bien-sat', m.bienSat, [7, 2, 10, 8, 13, 22, 16, 60], .85);
    /* sóng vỗ: vạch trắng sát mép, "thở" bằng line-opacity (ban-do.js chỉnh nhịp) */
    L.push({ id: 'bot-song', type: 'line', source: 'bo', minzoom: 11,
      paint: { 'line-color': '#ffffff', 'line-width': noi([11, 1, 16, 3]), 'line-offset': noi([11, 1.5, 16, 5]), 'line-blur': 1,
        'line-opacity': .55, 'line-dasharray': [2, 3] } });
    L.push({ id: 'song-ngoi', type: 'line', source: 'omt', 'source-layer': 'waterway',
      paint: { 'line-color': m.song, 'line-width': noi([10, .6, 16, 3]) } });

    /* sân bay */
    L.push({ id: 'san-bay', type: 'fill', source: 'omt', 'source-layer': 'aeroway',
      filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false], paint: { 'fill-color': m.sanBay } });
    L.push({ id: 'duong-bang', type: 'line', source: 'omt', 'source-layer': 'aeroway',
      filter: ['==', ['get', 'class'], 'runway'], paint: { 'line-color': m.duongBang, 'line-width': noi([10, 2, 13, 14, 16, 90]) } });
    L.push({ id: 'duong-lan', type: 'line', source: 'omt', 'source-layer': 'aeroway',
      filter: ['==', ['get', 'class'], 'taxiway'], minzoom: 12, paint: { 'line-color': m.duongBang, 'line-width': noi([12, 1, 16, 12]) } });

    /* đường: viền trước, lõi sau — như Google, đường chính vàng nhạt */
    const lop = (id, cls, rong, mau, vien, minzoom) => {
      const f = ['all', ['match', ['get', 'class'], cls, true, false], ['!=', ['get', 'brunnel'], 'tunnel']];
      L.push({ id: id + '-vien', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: f, minzoom,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': vien, 'line-width': noi(rong.map((v, i) => i % 2 ? v + 1.6 : v)) } });
      L.push({ id, type: 'line', source: 'omt', 'source-layer': 'transportation', filter: f, minzoom,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': mau, 'line-width': noi(rong) } });
    };
    lop('duong-nho', ['minor', 'service', 'track'], [12, .5, 14, 2.5, 17, 10], m.duongNho, m.duongNhoVien, 12);
    lop('duong-cap3', ['tertiary', 'secondary'], [9, .6, 12, 2, 14, 5, 17, 14], m.duong, m.duongVien, 8);
    lop('duong-chinh', ['primary', 'trunk', 'motorway'], [7, .8, 10, 2, 12, 3.5, 14, 7, 17, 18], m.duongChinh, m.duongChinhVien, 6);

    L.push({ id: 'nha', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14.5,
      paint: { 'fill-color': m.nhaCua, 'fill-outline-color': m.nhaCuaVien, 'fill-opacity': noi([14.5, 0, 15.5, 1]) } });

    /* nhãn */
    const nhan = (id, sl, filter, co, font, mau, minzoom, them) => L.push(Object.assign({
      id, type: 'symbol', source: 'omt', 'source-layer': sl, filter, minzoom,
      layout: Object.assign({ 'text-field': ten(lang), 'text-font': font, 'text-size': co, 'text-max-width': 8 }, (them || {}).layout),
      paint: Object.assign({ 'text-color': mau, 'text-halo-color': m.vienChu, 'text-halo-width': 1.4 }, (them || {}).paint),
    }));
    nhan('ten-duong', 'transportation_name', ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary', 'trunk'], true, false],
      noi([13, 10, 17, 13]), FONT, m.chuNhat, 13, { layout: { 'symbol-placement': 'line', 'text-letter-spacing': .02 } });
    nhan('ten-bien', 'water_name', null, noi([6, 11, 12, 14]), FONT_NGHIENG, m.chuBien, 5,
      { layout: { 'text-letter-spacing': .15 }, paint: { 'text-halo-width': 0 } });
    nhan('ten-nui', 'mountain_peak', ['has', 'name'], 11, FONT_NGHIENG, m.chuNui, 11.5,
      { layout: { 'text-field': ['concat', '▲ ', ten(lang)], 'text-anchor': 'top' } });
    nhan('ten-lang', 'place', ['match', ['get', 'class'], ['village', 'hamlet', 'suburb', 'neighbourhood', 'island', 'islet'], true, false],
      noi([10, 10, 15, 13]), FONT, m.chuNhat, 11);
    nhan('ten-thi-tran', 'place', ['match', ['get', 'class'], ['town', 'city'], true, false],
      noi([8, 12, 14, 17]), FONT_DAM, m.chu, 7);
    L.forEach((l) => { if (l.filter === null) delete l.filter; });

    return {
      version: 8,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sources: {
        omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet',
          attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
        dem: { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 13,
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          attribution: 'Địa hình: Mapzen / AWS Terrain Tiles' },
        dem3d: { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 13,
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'] },
        bo: { type: 'geojson', data: window.PQ_HINH ? window.PQ_HINH.boBien : { type: 'FeatureCollection', features: [] } },
      },
      layers: L,
    };
  }

  /* Hoạ tiết tán cây 64×64: ~46 tán tròn chồng lên nhau, năm sắc xanh, cỡ khác nhau —
     lần đầu (16 tán/48px) nhìn như chấm bi lặp đều, anh Hùng muốn rừng dày hơn. */
  function veTanCay(theme) {
    const n = 64, c = document.createElement('canvas');
    c.width = c.height = n * 2;
    const g = c.getContext('2d');
    g.scale(2, 2);
    const toi = theme === 'toi';
    const bong = toi ? 'rgba(0,0,0,.35)' : 'rgba(60,110,40,.22)';
    const tan = toi ? ['#28503a', '#2e5c42', '#23472f', '#315f3f', '#264c35'] : ['#8fcd6a', '#7fc25c', '#a0d77c', '#74b853', '#98d173'];
    const sang = toi ? 'rgba(120,170,120,.25)' : 'rgba(215,245,180,.75)';
    let s = 7;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const cay = [];
    for (let i = 0; i < 46; i++) cay.push([r() * n, r() * n, 3.4 + r() * 3.2]);
    cay.sort((a, b) => a[1] - b[1]);                                // tán phía dưới vẽ sau, đè lên tán phía trên
    for (const [x, y, rr] of cay) {
      for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) {      // vẽ tràn biên để ô ghép liền mạch
        g.fillStyle = bong; g.beginPath(); g.arc(x + dx + rr * .35, y + dy + rr * .45, rr, 0, 7); g.fill();
      }
    }
    cay.forEach(([x, y, rr], i) => {
      for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) {
        g.fillStyle = tan[i % 5]; g.beginPath(); g.arc(x + dx, y + dy, rr, 0, 7); g.fill();
        g.fillStyle = sang; g.beginPath(); g.arc(x + dx - rr * .3, y + dy - rr * .35, rr * .42, 0, 7); g.fill();
      }
    });
    return { width: c.width, height: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
  }

  window.PQ_PHONG_CACH = { phongCach, veTanCay };
})();
