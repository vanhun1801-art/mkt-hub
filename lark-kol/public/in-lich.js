'use strict';
/* ==========================================================================
   Trang in lịch trình gửi KOL. Bản 2 (anh Hùng 23/09: "thành một tài liệu thật hữu ích"):
     · tờ bìa      — cả hành trình trên bản đồ + tổng quan từng ngày
     · mỗi ngày    — bản đồ ngày đó + QR mở lộ trình trên Google Maps; bên phải các mốc theo
                     buổi, GIỮA hai mốc ghi chặng đi (xe bao nhiêu km / mấy phút, cáp treo, cano)
     · tờ cuối     — thông tin chuyến đi: đoàn, nơi ở, liên hệ, lịch tóm tắt.
                     KHÔNG có bàn giao / yêu cầu nội dung (anh Hùng 24/09: tệp chỉ để KOL đi chơi theo)
   Chọn được nền bản đồ (Bản đồ / Vệ tinh / Địa hình). In bằng hộp in → "Lưu dưới dạng PDF".

   Chỉ đưa thông tin KOL cần. KHÔNG có giá, FOC, nhà cung cấp (trừ tên khách sạn), ghi chú nội bộ.
   ========================================================================== */
(function () {
  const $ = (s, g = document) => g.querySelector(s);
  const $$ = (s, g = document) => [...g.querySelectorAll(s)];
  const e = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const p2 = (n) => String(n).padStart(2, '0');
  const VN = 7 * 3600000, NGAY_MS = 86400000;
  const vn = (ms) => { const d = new Date(ms + VN); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), thu: d.getUTCDay() }; };
  const dauNgay = (ms) => { const t = vn(ms); return Date.UTC(t.y, t.m - 1, t.d) - VN; };
  const hhmm = (ms) => { const t = vn(ms); return p2(t.h) + ':' + p2(t.mi); };
  const ddmm = (ms) => { const t = vn(ms); return p2(t.d) + '/' + p2(t.m); };
  /* ---- song ngữ (anh Hùng 24/09: bản tiếng Anh cho KOL nước ngoài) ---- */
  const S = { nen: window.BanDoMinhHoa ? 'minhHoa' : 'duong', coTin: true, lang: 'vi' };   // mặc định nền minh hoạ của phòng
  { const q = new URLSearchParams(location.search).get('lang'); if (q === 'en' || q === 'vi') S.lang = q; }
  const EN = () => S.lang === 'en';
  const t2 = (vi, en) => (EN() ? en : vi);
  const THU_VI = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const THU_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const THANG_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const THU = new Proxy([], { get: (_, i) => (EN() ? THU_EN : THU_VI)[i] });
  /* ngày: "07/10" (VI) · "7 Oct" (EN) — người nước ngoài hay đọc nhầm dd/mm */
  const ngayChu = (ms, nam) => { const t = vn(ms); return EN() ? t.d + ' ' + THANG_EN[t.m - 1] + (nam ? ' ' + t.y : '') : p2(t.d) + '/' + p2(t.m) + (nam ? '/' + t.y : ''); };
  const NHOM_EN = { Tour: 'Tour', 'Vé tham quan': 'Attraction', 'Ăn uống': 'Dining', 'Lưu trú': 'Stay', 'Di chuyển': 'Transfer', 'Khác': 'Other' };
  const BUOI_EN = { 'Sáng': 'Morning', 'Trưa': 'Midday', 'Chiều': 'Afternoon', 'Tối': 'Evening' };
  /* tên tiếng Anh các địa điểm của ban-do.js (khoá = tên VI bên đó) */
  const NOI_EN = { 'Gành Dầu': 'Ganh Dau', 'Rạch Vẹm (Bãi Sao Biển)': 'Rach Vem Starfish Beach', 'Bãi Thơm': 'Bai Thom', 'Sân bay Phú Quốc': 'Phu Quoc Airport',
    'Bãi Trường': 'Long Beach', 'Suối Tranh': 'Suoi Tranh Waterfall', 'Hàm Ninh': 'Ham Ninh fishing village', 'Thiền viện Trúc Lâm Hộ Quốc': 'Ho Quoc Pagoda',
    'Nhà tù Phú Quốc': 'Phu Quoc Prison', 'Bãi Sao': 'Sao Beach', 'Bãi Khem': 'Khem Beach', 'Cầu Hôn': 'Kiss Bridge', 'Ga cáp treo An Thới': 'An Thoi cable car station',
    'An Thới': 'An Thoi', 'Hòn Thơm': 'Hon Thom Island', 'Hòn Mây Rút': 'May Rut Island', 'Hòn Gầm Ghì': 'Gam Ghi Island', 'Hòn Dừa': 'Dua Island',
    'Chợ đêm Dinh Cậu': 'Dinh Cau Night Market', 'Dương Đông': 'Duong Dong town', 'Cảng An Thới': 'An Thoi Port' };
  const noiChu = (ten) => (EN() ? NOI_EN[ten] || ten : ten);
  const tenGon = (s) => String(s || '').replace(/\s+[—-]\s+(Người lớn|Trẻ em|Em bé)$/i, '').trim();
  const kd = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const MAU = () => { const c = getComputedStyle(document.documentElement); return ['--blue', '--orange', '--green', '--purple', '--red'].map((v) => c.getPropertyValue(v).trim()); };
  /* Trong hub, trang chạy dưới /m/kol — ảnh đặt bằng JS không được hub viết lại đường dẫn. */
  const GOC = (window.__HUB__ && window.__HUB__.prefix) || '';
  const MOI_TO = 7;           // quá số mốc này trong một ngày thì sang tờ tiếp (mỗi mốc còn dòng chặng đi)
  const QR_JS = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
  const tt = (s) => { $('#ilTrangThai').textContent = s; };
  const cho = (ms) => new Promise((ok) => setTimeout(ok, ms));

  async function api(u) {
    const r = await fetch(GOC + u);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || 'Lỗi ' + r.status);
    return j;
  }
  const coLogo = () => new Promise((ok) => {
    const im = new Image();
    im.onload = () => ok(im.naturalWidth ? GOC + '/api/logo' : '');
    im.onerror = () => ok('');
    im.src = GOC + '/api/logo';
  });
  let napQr = null;
  const taiQr = () => napQr || (napQr = new Promise((ok) => {
    const s = document.createElement('script'); s.src = QR_JS;
    s.onload = () => ok(window.qrcode || null); s.onerror = () => ok(null);
    document.head.appendChild(s);
  }));
  const svgQr = (qr, link) => { try { const q = qr(0, 'L'); q.addData(link); q.make(); return q.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); } catch (_) { return ''; } };

  /* Các dòng cùng giờ + cùng tên (vé Người lớn / Trẻ em của một điểm) là MỘT mốc. */
  function gomMoc(hm) {
    const m = new Map();
    for (const h of hm) {
      const k = (h.gioHen || 'n' + (h.ngay || 0)) + '|' + tenGon(h.ten);
      if (!m.has(k)) m.set(k, h);
    }
    return [...m.values()];
  }

  /* Buổi trong ngày: có giờ thì theo giờ; chưa có giờ thì đoán theo chữ xuất hiện SỚM NHẤT trong tên
   * ("Sunset Town chiều và dạo chợ đêm" → Chiều, không phải Tối). Không đoán được thì bỏ trống. */
  const BUOI_TU = [['Sáng', ['sang', 'don bay', 'breakfast']], ['Trưa', ['trua', 'lunch']],
    ['Chiều', ['chieu', 'hoang hon', 'sunset']], ['Tối', ['toi', 'dem', 'phao hoa', 'dinner', 'show']]];
  function buoi(m) {
    if (m.gio) { const h = vn(m.gio).h; return h < 11 ? 'Sáng' : h < 14 ? 'Trưa' : h < 18 ? 'Chiều' : 'Tối'; }
    const t = ' ' + kd(m.ten) + ' ';
    let tot = null;
    for (const [ten, tu] of BUOI_TU) for (const w of tu) {
      const i = t.search(new RegExp('[^a-z]' + w + '[^a-z]'));
      if (i >= 0 && (!tot || i < tot.i)) tot = { i, ten };
    }
    return tot ? tot.ten : '';
  }
  const gioChu = (p) => (p == null ? '' : p < 60 ? Math.max(5, Math.round(p / 5) * 5) + t2(' phút', ' min') : Math.floor(p / 60) + t2(' giờ', ' h') + (Math.round(p % 60 / 5) * 5 ? ' ' + Math.round(p % 60 / 5) * 5 + t2(' phút', ' min') : ''));
  const kmChu = (k) => (k == null ? '' : k < 10 ? k.toFixed(1).replace('.', EN() ? '.' : ',') + ' km' : Math.round(k) + ' km');
  const BIEN_VI = { cap: { ra: 'Cáp treo ra Hòn Thơm', ve: 'Cáp treo về An Thới', giua: 'Cáp treo' },
    cano: { ra: 'Cano ra đảo', ve: 'Cano về đất liền', giua: 'Cano giữa các đảo' } };
  const BIEN_EN = { cap: { ra: 'Cable car to Hon Thom', ve: 'Cable car back to An Thoi', giua: 'Cable car' },
    cano: { ra: 'Speedboat to the islands', ve: 'Speedboat back to the main island', giua: 'Speedboat between islands' } };
  const chuBien = (r) => { const B = EN() ? BIEN_EN : BIEN_VI; return r.bien ? (B[r.bien] || B.cano)[r.huong || 'ra'] : ''; };
  /* đọc theo đúng thứ tự đi: ra đảo thì ngồi xe tới bến trước, về thì xuống cáp/cano rồi mới lên xe */
  const chuChang = (r) => {
    const xe = r.km ? t2('Xe ', 'Car ') + kmChu(r.km) + (r.phut ? t2(' · khoảng ', ' · about ') + gioChu(r.phut) : '') : '';
    const b = chuBien(r);
    return (r.huong === 've' ? [b, xe] : [xe, b]).filter(Boolean).join(t2(', rồi ', ', then ')) || t2('Di chuyển', 'Transfer');
  };

  try { const v = localStorage.getItem('kol-nen-in'); if (window.BanDo.NEN[v]) S.nen = v; } catch (_) {}
  { const v = new URLSearchParams(location.search).get('nen'); if (window.BanDo.NEN[v]) S.nen = v; }   // ?nen=veTinh mở thẳng kiểu nền

  async function dung() {
    const id = new URLSearchParams(location.search).get('ht');
    if (!id) throw new Error('Thiếu mã hợp tác (?ht=…)');
    const [dl, meta, logo, qr, spDs] = await Promise.all([api('/api/du-lieu'), api('/api/meta').catch(() => ({})), coLogo(), taiQr(),
      EN() ? api('/api/san-pham').then((r) => r.sanPham || []).catch(() => []) : []]);
    const ht = dl.hopTac.find((h) => h.id === id);
    if (!ht) throw new Error('Không tìm thấy hợp tác này');
    const kol = dl.kol.find((k) => k.id === ht.kol) || {};
    const hm = dl.hangMuc.filter((h) => h.hopTac === id && h.tinhTrang !== 'Huỷ');

    /* Link Google Maps rút gọn trong Điểm hẹn → server giải ra toạ độ (như ở app). */
    const giai = {};
    const can = [...new Set(hm.map((h) => window.BanDo.linkNgan(h.diemHen)).filter(Boolean))];
    await Promise.all(can.map((u) => api('/api/vi-tri?u=' + encodeURIComponent(u)).then((r) => { giai[u] = r.lat ? r : null; }).catch(() => { giai[u] = null; })));

    /* các ngày của chuyến: từ ngày đi tới ngày về, cộng ngày lẻ của hạng mục nằm ngoài khoảng */
    /* Tên tiếng Anh của một mốc: tên EN của sản phẩm trên Base Sản phẩm (theo mã) → tên EN của địa điểm →
     * giữ tên Việt (đếm để báo trên thanh công cụ; chữ trên tờ bấm vào sửa được trước khi lưu PDF). */
    const spEn = new Map(spDs.filter((x) => x.tenEn).map((x) => [String(x.ma).toUpperCase(), x.tenEn]));
    const S_THIEU = new Set();
    const tenMoc = (h) => {
      const vi = tenGon(h.ten);
      if (!EN()) return vi;
      const ma = window.BanDo.maTour(h);
      if (ma && spEn.get(ma)) return spEn.get(ma);
      const t = window.BanDo.doanTach(h, {});
      if (t && t.den && NOI_EN[t.den.ten] && kd(vi).includes(kd(t.den.ten).split(' ')[0])) return NOI_EN[t.den.ten];
      S_THIEU.add(vi);
      return vi;
    };
    const moc = gomMoc(hm).map((h) => ({ h, gio: h.gioHen || 0, ngay: h.gioHen || h.ngay ? dauNgay(h.gioHen || h.ngay) : 0, ten: tenMoc(h) }));
    const ngay = [];
    if (ht.batDau) for (let t = dauNgay(ht.batDau); t <= dauNgay(ht.ketThuc || ht.batDau); t += NGAY_MS) ngay.push(t);
    for (const m of moc) if (m.ngay && !ngay.includes(m.ngay)) ngay.push(m.ngay);
    ngay.sort((a, b) => a - b);
    /* cùng thứ tự với ban-do.js (theo giờ, mốc chưa có giờ giữ thứ tự bảng kê) để số trên ghim khớp số trên dòng thời gian */
    const theoNgay = ngay.map((d) => moc.filter((m) => m.ngay === d).sort((a, b) => a.gio - b.gio)
      .map((m) => {
        const t = window.BanDo.doanTach(m.h, giai) || {};
        /* tour có tuyến (G4…): nơi "tới" của mốc là bến xuất phát, rồi đi hết các điểm dừng của tour */
        const tuyen = window.BanDo.tuyenTour(m.h);
        return { ...m, d: tuyen ? tuyen[0] : t.den || null, cuoi: tuyen ? tuyen[tuyen.length - 1] : t.den || null, tuyen, don: t.don || null, buoi: buoi(m) };
      }));
    /* chuỗi điểm đi thật trong ngày: điểm đón (nếu có) rồi nơi diễn ra / các điểm dừng của tour */
    const diemDi = (ds) => ds.flatMap((m) => [m.don, ...(m.tuyen || [m.d])]).filter(Boolean);
    const TOUR = (window.PQ_TOUR && window.PQ_TOUR.tour) || {};
    theoNgay.forEach((ds) => { let so = 0; ds.forEach((m) => { m.so = m.d ? ++so : 0; }); });
    const mau = MAU();
    const chuaGio = moc.filter((m) => m.ngay && !m.gio).length;

    /* EN: tên đầy đủ, không xưng hô kiểu Việt */
    const goi = EN() ? (kol.ten || ht.kolTen || '') : [kol.xungHo, kol.tenGoi || kol.ten || ht.kolTen].filter(Boolean).join(' ');
    const soNgay = ngay.length;
    const khoang = !soNgay ? '' : EN() ? soNgay + (soNgay > 1 ? ' days ' + (soNgay - 1) + (soNgay > 2 ? ' nights' : ' night') : ' day')
      : soNgay + ' ngày' + (soNgay > 1 ? ' ' + (soNgay - 1) + ' đêm' : '');
    const tuDen = soNgay ? (soNgay > 1 ? ngayChu(ngay[0]) + ' – ' : '') + ngayChu(ngay[soNgay - 1], true) : '';
    const doan = (EN() ? [[ht.nguoiLon, 'adult', 'adults'], [ht.treEm, 'child', 'children'], [ht.emBe, 'infant', 'infants']]
      : [[ht.nguoiLon, 'người lớn', 'người lớn'], [ht.treEm, 'trẻ em', 'trẻ em'], [ht.emBe, 'em bé', 'em bé']])
      .filter(([n]) => n > 0).map(([n, a, b]) => n + ' ' + (n > 1 ? b : a)).join(' · ');
    const luuTru = [...new Map(hm.filter((h) => h.nhom === 'Lưu trú' && !/bữa|ăn sáng|ăn tối/i.test(h.ten))
      .map((h) => { const ten = h.nhaCungCap || tenGon(h.ten); return [ten, { ten, ngay: h.ngay, dem: h.demLuot }]; })).values()];
    const lienHe = String(meta.lienHeKol || '').trim();
    document.title = t2('Lịch trình Phú Quốc · ', 'Phu Quoc itinerary · ') + (kol.ten || ht.kolTen || '') + (soNgay ? ' · ' + ddmm(ngay[0]).replace('/', '-') : '');
    document.documentElement.lang = S.lang;

    const logoHtml = (nho) => (logo ? '<img class="il-logo' + (nho ? ' nho' : '') + '" src="' + e(logo) + '" alt="Rooty Trip">' : '<span class="il-chu-logo">Rooty <i>trip</i></span>');
    const coTin = S.coTin && soNgay > 0;
    const tongTo = 1 + theoNgay.reduce((n, ds) => n + Math.max(1, Math.ceil(ds.length / MOI_TO)), 0) + (coTin ? 1 : 0);
    let soTo = 0;
    const chan = () => '<div class="il-chan"><span><b>Rooty Trip Phú Quốc</b> · ' + t2('Lịch trình dành riêng cho ', 'Itinerary prepared for ') + e(goi) + (lienHe ? t2(' · Liên hệ: ', ' · Contact: ') + e(lienHe) : '') +
      '</span><span>' + (++soTo) + ' / ' + tongTo + '</span></div>';
    const trang = [];
    const banDo = [];      // [{id, moc, lech}] — gắn Leaflet sau khi tờ đã nằm trên trang
    const chang = [];      // [{id, a, b}] — ô "chặng đi" giữa hai mốc, điền sau khi hỏi OSRM
    const tomNgay = [];    // [{id, ds}] — dòng "5 điểm · 38 km · ~1 giờ đi xe" ở đầu tờ ngày

    const soDiemDen = new Set(moc.map((m) => m.ten)).size;
    /* ---- tờ bìa ---- */
    const tq = theoNgay.map((ds, i) => {
      const t = vn(ngay[i]);
      const noi = ds.map((m) => m.ten).filter((x, j, a) => a.indexOf(x) === j);
      return '<div class="il-tq-ngay"><div><b><span class="il-cham" style="background:' + mau[i % 5] + '"></span>' + t2('Ngày ', 'Day ') + (i + 1) + '</b><small>' + THU[t.thu] + ', ' + ngayChu(ngay[i]) + '</small></div>' +
        '<p contenteditable>' + (noi.length ? noi.slice(0, 6).map(e).join('<span class="il-mui"> → </span>') + (noi.length > 6 ? ' …' : '') : '<span class="il-mui">' + t2('Ngày tự do', 'Free day') + '</span>') + '</p></div>';
    }).join('');
    banDo.push({ id: 'ilBd0', moc: theoNgay.flat(), lech: 0 });
    trang.push('<section class="il-trang">' +
      '<div class="il-dau">' + logoHtml(false) + '<div class="il-dau-phai"><b>' + t2('Lịch trình du lịch', 'Travel itinerary') + '</b>' + (ht.maTourwell ? t2('Mã đặt chỗ ', 'Booking ref. ') + e(ht.maTourwell) : '') + '</div></div>' +
      '<div class="il-than"><div class="il-bd"><div class="bd-that" id="ilBd0"></div>' +
        '<div class="il-bd-nhan">' + ngay.map((d, i) => '<span><i class="il-cham" style="background:' + mau[i % 5] + '"></i>' + t2('Ngày ', 'Day ') + (i + 1) + '</span>').join('') + '</div></div>' +
      '<div class="il-bia-phai"><div class="il-mat">' + t2('Dành riêng cho ', 'Prepared for ') + e(goi) + '</div>' +
        '<h1 class="il-tieu-de">' + t2('Hành trình <em>Phú Quốc</em>', 'Your <em>Phu Quoc</em> journey') + '</h1><div class="il-khoang">' + e([khoang, tuDen].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="il-so"><div><small>' + t2('Thời gian', 'Duration') + '</small><b>' + e(khoang || '—') + '</b></div><div><small>' + t2('Đoàn', 'Group') + '</small><b>' + e(doan || '—') + '</b></div>' +
          '<div><small>' + t2('Điểm đến', 'Stops') + '</small><b>' + soDiemDen + t2(' điểm', soDiemDen > 1 ? ' places' : ' place') + '</b></div></div>' +
        '<div class="il-tq">' + tq + '</div></div></div>' + chan() + '</section>');

    /* ---- mỗi ngày một (hoặc vài) tờ ---- */
    theoNgay.forEach((ds, i) => {
      const t = vn(ngay[i]);
      const c = mau[i % 5];
      const dsDiem = diemDi(ds);
      const linkNgay = dsDiem.length ? window.BanDo.linkGoogle(dsDiem.map((d) => ({ ...d, noi: d.ten }))) : '';
      const qrNgay = qr && linkNgay ? svgQr(qr, linkNgay) : '';
      const phan = [];
      for (let k = 0; k < Math.max(1, ds.length); k += MOI_TO) phan.push(ds.slice(k, k + MOI_TO));
      phan.forEach((ph, j) => {
        const bdId = 'ilBd' + (i + 1) + (j ? '_' + j : '');
        banDo.push({ id: bdId, moc: ds, lech: i });
        const tomId = 'ilTom' + i + '_' + j;
        tomNgay.push({ id: tomId, ds });
        let buoiTruoc = '';
        const dong = ph.map((x) => {
          const h = x.h;
          const chuNoi = String(h.diemHen || '').replace(/https?:\/\/\S+/g, '').replace(/-?\d+\.\d+\s*,\s*-?\d+\.\d+/g, '').replace(/[\s,;:·-]+$/, '').trim();
          /* có điểm đón riêng: dòng nơi ghi "Đón tại …" (chỉ đường tới chỗ đón), rồi chặng tới nơi diễn ra */
          const toi = x.don || x.d;
          const noi = x.don ? t2('Đón tại ', 'Pick-up at ') + noiChu(x.don.ten) : chuNoi || (x.d && x.d.ten !== x.ten ? noiChu(x.d.ten) : '');
          const chiDuong = toi ? 'https://www.google.com/maps/search/?api=1&query=' + toi.lat + ',' + toi.lng : '';
          const cTrong = x.don && x.d ? 'ilChT' + i + '_' + ds.indexOf(x) : '';
          if (cTrong) chang.push({ id: cTrong, a: x.don, b: x.d, den: noiChu(EN() && x.d.tenEn ? x.d.tenEn : x.d.ten) });
          /* lịch trình của tour: các điểm dừng (bản đồ du lịch) + lịch trình tóm tắt trên Base Sản phẩm */
          const tour = TOUR[window.BanDo.maTour(h)] || null;
          const dongLt = tour && !EN() ? String(tour.lichTrinh || '').split(/\n+/).map((l) => ({ con: /^\s*[+*]/.test(l), t: l.replace(/^\s*[-–•+*]\s*/, '').trim() })).filter((l) => l.t) : [];
          const khungTour = x.tuyen || dongLt.length ? '<div class="il-tour">' +
            '<div class="il-tour-dau">' + t2('Lịch trình tour', 'Tour route') +
              (tour && !EN() && (tour.khoiHanh || tour.thoiLuong) ? '<span>' + e([tour.khoiHanh && 'khởi hành ' + tour.khoiHanh, tour.thoiLuong].filter(Boolean).join(' · ')) + '</span>' : '') + '</div>' +
            (x.tuyen ? '<div class="il-tour-tuyen">' + x.tuyen.map((p, k) => '<span' + (k ? '' : ' class="dau"') + '>' + e(EN() ? p.tenEn || p.ten : p.ten) + '</span>')
              .filter((s, k, a) => k === 0 || s !== a[k - 1]).join('<i>→</i>') + '</div>' : '') +
            (dongLt.length ? '<ul class="il-tour-ct" contenteditable>' + dongLt.slice(0, 14).map((l) => '<li' + (l.con ? ' class="con"' : '') + '>' + e(l.t) + '</li>').join('') + (dongLt.length > 14 ? '<li>…</li>' : '') + '</ul>' : '') +
            '</div>' : '';
          /* nhãn buổi chỉ hiện khi đổi buổi — đọc lướt thấy ngay sáng làm gì, chiều làm gì */
          const nhanBuoi = x.buoi && x.buoi !== buoiTruoc ? '<div class="il-buoi">' + t2('Buổi ' + x.buoi.toLowerCase(), BUOI_EN[x.buoi]) + '</div>' : '';
          if (x.buoi) buoiTruoc = x.buoi;
          /* chặng tới mốc KẾ TIẾP có vị trí (bỏ qua mốc chưa rõ chỗ) */
          const sau = x.d ? ds.slice(ds.indexOf(x) + 1).find((y) => y.d) : null;
          const cId = sau ? 'ilCh' + i + '_' + ds.indexOf(x) : '';
          if (sau && ph.includes(sau)) chang.push({ id: cId, a: x.cuoi || x.d, b: sau.don || sau.d });
          return nhanBuoi + '<div class="il-moc"><div class="il-moc-so' + (x.so ? '' : ' trong') + '" style="background:' + c + '">' + (x.so || '') + '</div><div>' +
            '<div class="il-moc-gio">' + (x.gio ? hhmm(x.gio) : '') + (h.nhom ? '<span' + (x.gio ? '' : ' style="margin:0"') + '>' + e(EN() ? NHOM_EN[h.nhom] || h.nhom : h.nhom) + '</span>' : '') + '</div>' +
            '<div class="il-moc-ten" contenteditable>' + e(x.ten) + '</div>' +
            (noi || chiDuong ? '<div class="il-moc-noi">' + e(noi) + (chiDuong ? (noi ? ' · ' : '') + '<a href="' + e(chiDuong) + '" target="_blank" rel="noopener">' + t2('Chỉ đường', 'Directions') + '</a>' : '') + '</div>' : '') +
            (cTrong ? '<div class="il-chang" id="' + cTrong + '"></div>' : '') + khungTour +
            (sau && ph.includes(sau) ? '<div class="il-chang" id="' + cId + '"></div>' : '') +
            '</div></div>';
        }).join('');
        trang.push('<section class="il-trang">' +
          '<div class="il-dau">' + logoHtml(true) + '<div class="il-ngay-dau"><div class="il-ngay-so" style="background:' + c + '">' + t2('Ngày ', 'Day ') + (i + 1) + '</div>' +
            '<div class="il-ngay-ten">' + THU[t.thu] + ', ' + ngayChu(ngay[i], true) + (j ? ' <span class="il-mui" style="font-weight:500">' + t2('(tiếp)', '(cont.)') + '</span>' : '') +
            '<small>' + t2('Hành trình Phú Quốc · ', 'Phu Quoc journey · ') + e(khoang) + '</small></div></div>' +
            '<div class="il-dau-phai il-tom" id="' + tomId + '"></div></div>' +
          '<div class="il-than"><div class="il-trai"><div class="il-bd"><div class="bd-that" id="' + bdId + '"></div></div>' +
            (qrNgay ? '<a class="il-qr" href="' + e(linkNgay) + '" target="_blank" rel="noopener">' + qrNgay + '<span><b>' + t2('Lộ trình ngày ' + (i + 1) + ' trên Google Maps', 'Day ' + (i + 1) + ' route on Google Maps') + '</b>' + t2('Quét mã bằng camera điện thoại, hoặc bấm vào đây trong tệp PDF để mở chỉ đường từng điểm.', 'Scan with your phone camera, or tap here in the PDF, for directions to each stop.') + '</span></a>' : '') +
          '</div>' +
            (ph.length ? '<div class="il-dong' + (ph.length > 5 ? ' il-dac' : '') + '">' + dong + '</div>'
              : '<div class="il-tu-do"><b>' + t2('Ngày tự do', 'Free day') + '</b>' + t2('Thong thả nghỉ ngơi, khám phá Phú Quốc theo ý mình.', 'Relax and explore Phu Quoc at your own pace.') + '</div>') +
          '</div>' + chan() + '</section>');
      });
    });

    /* ---- tờ cuối: thông tin chuyến đi ---- */
    if (coTin) {
      const o = (nhan, gt) => (gt ? '<div class="il-tin-o"><small>' + nhan + '</small><div>' + gt + '</div></div>' : '');
      trang.push('<section class="il-trang">' +
        '<div class="il-dau">' + logoHtml(true) + '<div class="il-ngay-ten" style="margin-left:6mm">' + t2('Thông tin chuyến đi', 'Trip details') + '<small>' + e(goi) + ' · ' + e(tuDen) + '</small></div><div class="il-dau-phai"></div></div>' +
        '<div class="il-than il-tin">' +
          '<div><h3 class="il-h3">' + t2('Chuyến đi', 'Your trip') + '</h3>' +
            o(t2('Thời gian', 'Dates'), e([khoang, tuDen].filter(Boolean).join(' · '))) + o(t2('Đoàn', 'Group'), e(doan)) + o(t2('Mã đặt chỗ', 'Booking ref.'), e(ht.maTourwell || '')) +
            o(t2('Nơi lưu trú', 'Accommodation'), luuTru.map((l) => '<div>' + e(l.ten) + (l.ngay ? ' <span class="il-mui">· ' + t2('nhận phòng ', 'check-in ') + ngayChu(l.ngay) + (l.dem ? ', ' + l.dem + t2(' đêm', l.dem > 1 ? ' nights' : ' night') : '') + '</span>' : '') + '</div>').join('')) +
            o(t2('Liên hệ Rooty Trip trong chuyến', 'Rooty Trip contact during your trip'), e(lienHe)) +
          '</div>' +
          '<div><h3 class="il-h3">' + t2('Lịch trình tóm tắt', 'At a glance') + '</h3>' + theoNgay.map((ds, i) => '<div class="il-tom-ngay"><span class="il-cham" style="background:' + mau[i % 5] + '"></span><b>' + t2('Ngày ', 'Day ') + (i + 1) + ' · ' + THU[vn(ngay[i]).thu] + ', ' + ngayChu(ngay[i]) + '</b> <span contenteditable>' +
              e(ds.map((m) => m.ten).filter((x, j, a) => a.indexOf(x) === j).join(' · ') || t2('Tự do', 'Free day')) + '</span></div>').join('') +
          '</div>' +
        '</div>' + chan() + '</section>');
    }

    $('#ilSach').innerHTML = trang.join('');
    tt('Đang vẽ bản đồ…');
    S.banDo = banDo; S.giai = giai; S.chuaGio = chuaGio; S.tongTo = tongTo; S.thieuEn = [...S_THIEU];

    /* chặng đi + tóm tắt ngày: hỏi OSRM (ban-do.js nhớ kết quả nên vẽ bản đồ không gọi lại) */
    const kq = new Map();
    await Promise.all(chang.map(async (c) => { kq.set(c.id, await window.BanDo.quangDuong(c.a, c.b).catch(() => null)); }));
    for (const c of chang) {
      const r = kq.get(c.id), el = document.getElementById(c.id);
      if (!el) continue;
      if (!r) { el.remove(); continue; }
      el.textContent = chuChang(r) + (c.den ? ' → ' + c.den : '');
    }
    for (const t of tomNgay) {
      const el = document.getElementById(t.id);
      const dsD = diemDi(t.ds);
      let km = 0, phut = 0, bien = new Set();
      for (let k = 0; k + 1 < dsD.length; k++) {
        const r = await window.BanDo.quangDuong(dsD[k], dsD[k + 1]).catch(() => null);
        if (!r) continue;
        km += r.km || 0; phut += r.phut || 0; if (r.bien) bien.add(r.bien === 'cap' ? t2('có đi cáp treo', 'by cable car') : t2('có đi cano', 'by speedboat'));
      }
      el.innerHTML = '<b>' + t.ds.length + t2(' điểm hẹn', t.ds.length > 1 ? ' stops' : ' stop') + '</b>' + [km ? t2('khoảng ', 'about ') + kmChu(km) + t2(' đường bộ', ' by road') : '', phut ? '~' + gioChu(phut) + t2(' ngồi xe', ' driving') : '', ...bien].filter(Boolean).map(e).join(' · ');
    }
    await veBanDo();
  }

  /* Vẽ (lại) mọi bản đồ theo nền đang chọn, chờ đường đi + ảnh nền tải xong rồi mới cho in. */
  async function veBanDo() {
    $('#ilIn').disabled = true;
    tt('Đang vẽ bản đồ…');
    const doi = [];
    for (const b of S.banDo) {
      const el = document.getElementById(b.id);
      if (!el) continue;
      if (!b.moc.length) { el.parentElement.classList.add('trong'); continue; }
      const r = await window.BanDo.veThat(el, b.moc, { tinh: true, sang: true, lech: b.lech, giai: S.giai, nen: S.nen });
      if (r && r.xong) doi.push(r.xong);
    }
    await Promise.race([Promise.all(doi), cho(9000)]);
    const het = Date.now() + 15000;
    while (Date.now() < het && !$$('.leaflet-tile').every((a) => a.complete)) await cho(300);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    tt(S.tongTo + ' tờ A4 ngang' + (S.chuaGio ? ' · ' + S.chuaGio + ' mốc chưa có giờ hẹn' : '') +
      (EN() && S.thieuEn && S.thieuEn.length ? ' · ' + S.thieuEn.length + ' mốc chưa có tên tiếng Anh — bấm vào chữ trên tờ để sửa, hoặc điền Tên tiếng Anh ở Base Sản phẩm' : '') +
      ' · bấm Lưu PDF rồi chọn "Lưu dưới dạng PDF"');
    $('#ilIn').disabled = false;
  }

  /* thanh công cụ */
  $('#ilNen').innerHTML = Object.entries(window.BanDo.NEN).map(([k, v]) => '<option value="' + k + '"' + (k === S.nen ? ' selected' : '') + '>' + v.ten + '</option>').join('');
  $('#ilLang').value = S.lang;
  $('#ilLang').onchange = (ev) => { S.lang = ev.target.value; window.PQ_LANG = S.lang; chay(); };
  window.PQ_LANG = S.lang;
  $('#ilNen').onchange = (ev) => { S.nen = ev.target.value; try { localStorage.setItem('kol-nen-in', S.nen); } catch (_) {} veBanDo(); };
  $('#ilTin').onchange = (ev) => { S.coTin = ev.target.checked; chay(); };
  $('#ilIn').onclick = () => window.print();
  const chay = () => dung().catch((err) => {
    tt('Không dựng được');
    $('#ilSach').innerHTML = '<div class="il-loi">' + e(err.message) + '</div>';
  });
  chay();
})();
