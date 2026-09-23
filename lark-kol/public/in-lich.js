'use strict';
/* ==========================================================================
   Trang in lịch trình gửi KOL. Bản 2 (anh Hùng 23/09: "thành một tài liệu thật hữu ích"):
     · tờ bìa      — cả hành trình trên bản đồ + tổng quan từng ngày
     · mỗi ngày    — bản đồ ngày đó + QR mở lộ trình trên Google Maps; bên phải các mốc theo
                     buổi, GIỮA hai mốc ghi chặng đi (xe bao nhiêu km / mấy phút, cáp treo, cano)
     · tờ cuối     — thông tin chuyến đi: đoàn, nơi ở, nội dung hợp tác cần bàn giao, liên hệ
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
  const THU = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
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
  const gioChu = (p) => (p == null ? '' : p < 60 ? Math.max(5, Math.round(p / 5) * 5) + ' phút' : Math.floor(p / 60) + ' giờ' + (Math.round(p % 60 / 5) * 5 ? ' ' + Math.round(p % 60 / 5) * 5 + ' phút' : ''));
  const kmChu = (k) => (k == null ? '' : k < 10 ? k.toFixed(1).replace('.', ',') + ' km' : Math.round(k) + ' km');
  const BIEN = { cap: { ra: 'Cáp treo ra Hòn Thơm', ve: 'Cáp treo về An Thới', giua: 'Cáp treo' },
    cano: { ra: 'Cano ra đảo', ve: 'Cano về cảng An Thới', giua: 'Cano giữa các đảo' } };
  const chuBien = (r) => (r.bien ? (BIEN[r.bien] || BIEN.cano)[r.huong || 'ra'] : '');
  /* đọc theo đúng thứ tự đi: ra đảo thì ngồi xe tới bến trước, về thì xuống cáp/cano rồi mới lên xe */
  const chuChang = (r) => {
    const xe = r.km ? 'Xe ' + kmChu(r.km) + (r.phut ? ' · khoảng ' + gioChu(r.phut) : '') : '';
    const b = chuBien(r);
    return (r.huong === 've' ? [b, xe] : [xe, b]).filter(Boolean).join(', rồi ') || 'Di chuyển';
  };

  const S = { nen: 'duong', coTin: true };
  try { const v = localStorage.getItem('kol-nen-in'); if (window.BanDo.NEN[v]) S.nen = v; } catch (_) {}
  { const v = new URLSearchParams(location.search).get('nen'); if (window.BanDo.NEN[v]) S.nen = v; }   // ?nen=veTinh mở thẳng kiểu nền

  async function dung() {
    const id = new URLSearchParams(location.search).get('ht');
    if (!id) throw new Error('Thiếu mã hợp tác (?ht=…)');
    const [dl, meta, logo, qr] = await Promise.all([api('/api/du-lieu'), api('/api/meta').catch(() => ({})), coLogo(), taiQr()]);
    const ht = dl.hopTac.find((h) => h.id === id);
    if (!ht) throw new Error('Không tìm thấy hợp tác này');
    const kol = dl.kol.find((k) => k.id === ht.kol) || {};
    const hm = dl.hangMuc.filter((h) => h.hopTac === id && h.tinhTrang !== 'Huỷ');
    const bg = dl.banGiao.filter((b) => b.hopTac === id && b.trangThai !== 'Huỷ');

    /* Link Google Maps rút gọn trong Điểm hẹn → server giải ra toạ độ (như ở app). */
    const giai = {};
    const can = [...new Set(hm.map((h) => window.BanDo.linkNgan(h.diemHen)).filter(Boolean))];
    await Promise.all(can.map((u) => api('/api/vi-tri?u=' + encodeURIComponent(u)).then((r) => { giai[u] = r.lat ? r : null; }).catch(() => { giai[u] = null; })));

    /* các ngày của chuyến: từ ngày đi tới ngày về, cộng ngày lẻ của hạng mục nằm ngoài khoảng */
    const moc = gomMoc(hm).map((h) => ({ h, gio: h.gioHen || 0, ngay: h.gioHen || h.ngay ? dauNgay(h.gioHen || h.ngay) : 0, ten: tenGon(h.ten) }));
    const ngay = [];
    if (ht.batDau) for (let t = dauNgay(ht.batDau); t <= dauNgay(ht.ketThuc || ht.batDau); t += NGAY_MS) ngay.push(t);
    for (const m of moc) if (m.ngay && !ngay.includes(m.ngay)) ngay.push(m.ngay);
    ngay.sort((a, b) => a - b);
    /* cùng thứ tự với ban-do.js (theo giờ, mốc chưa có giờ giữ thứ tự bảng kê) để số trên ghim khớp số trên dòng thời gian */
    const theoNgay = ngay.map((d) => moc.filter((m) => m.ngay === d).sort((a, b) => a.gio - b.gio)
      .map((m) => ({ ...m, d: window.BanDo.doan(m.h, giai), buoi: buoi(m) })));
    theoNgay.forEach((ds) => { let so = 0; ds.forEach((m) => { m.so = m.d ? ++so : 0; }); });
    const mau = MAU();
    const chuaGio = moc.filter((m) => m.ngay && !m.gio).length;

    const goi = [kol.xungHo, kol.tenGoi || kol.ten || ht.kolTen].filter(Boolean).join(' ');
    const soNgay = ngay.length;
    const khoang = soNgay ? soNgay + ' ngày' + (soNgay > 1 ? ' ' + (soNgay - 1) + ' đêm' : '') : '';
    const tuDen = soNgay ? ddmm(ngay[0]) + (soNgay > 1 ? ' – ' + ddmm(ngay[soNgay - 1]) : '') + '/' + vn(ngay[soNgay - 1]).y : '';
    const doan = [[ht.nguoiLon, 'người lớn'], [ht.treEm, 'trẻ em'], [ht.emBe, 'em bé']].filter(([n]) => n > 0).map(([n, t]) => n + ' ' + t).join(' · ');
    const luuTru = [...new Map(hm.filter((h) => h.nhom === 'Lưu trú' && !/bữa|ăn sáng|ăn tối/i.test(h.ten))
      .map((h) => { const ten = h.nhaCungCap || tenGon(h.ten); return [ten, { ten, ngay: h.ngay, dem: h.demLuot }]; })).values()];
    const lienHe = String(meta.lienHeKol || '').trim();
    document.title = 'Lịch trình Phú Quốc · ' + (kol.ten || ht.kolTen || '') + (soNgay ? ' · ' + ddmm(ngay[0]).replace('/', '-') : '');

    const logoHtml = (nho) => (logo ? '<img class="il-logo' + (nho ? ' nho' : '') + '" src="' + e(logo) + '" alt="Rooty Trip">' : '<span class="il-chu-logo">Rooty <i>trip</i></span>');
    const coTin = S.coTin && (bg.length || ht.yeuCau || luuTru.length || lienHe || doan);
    const tongTo = 1 + theoNgay.reduce((n, ds) => n + Math.max(1, Math.ceil(ds.length / MOI_TO)), 0) + (coTin ? 1 : 0);
    let soTo = 0;
    const chan = () => '<div class="il-chan"><span><b>Rooty Trip Phú Quốc</b> · Lịch trình dành riêng cho ' + e(goi) + (lienHe ? ' · Liên hệ: ' + e(lienHe) : '') +
      '</span><span>' + (++soTo) + ' / ' + tongTo + '</span></div>';
    const trang = [];
    const banDo = [];      // [{id, moc, lech}] — gắn Leaflet sau khi tờ đã nằm trên trang
    const chang = [];      // [{id, a, b}] — ô "chặng đi" giữa hai mốc, điền sau khi hỏi OSRM
    const tomNgay = [];    // [{id, ds}] — dòng "5 điểm · 38 km · ~1 giờ đi xe" ở đầu tờ ngày

    /* ---- tờ bìa ---- */
    const tq = theoNgay.map((ds, i) => {
      const t = vn(ngay[i]);
      const noi = ds.map((m) => m.ten).filter((x, j, a) => a.indexOf(x) === j);
      return '<div class="il-tq-ngay"><div><b><span class="il-cham" style="background:' + mau[i % 5] + '"></span>Ngày ' + (i + 1) + '</b><small>' + THU[t.thu] + ', ' + ddmm(ngay[i]) + '</small></div>' +
        '<p>' + (noi.length ? noi.slice(0, 6).map(e).join('<span class="il-mui"> → </span>') + (noi.length > 6 ? ' …' : '') : '<span class="il-mui">Ngày tự do</span>') + '</p></div>';
    }).join('');
    banDo.push({ id: 'ilBd0', moc: theoNgay.flat(), lech: 0 });
    trang.push('<section class="il-trang">' +
      '<div class="il-dau">' + logoHtml(false) + '<div class="il-dau-phai"><b>Lịch trình du lịch</b>' + (ht.maTourwell ? 'Mã đặt chỗ ' + e(ht.maTourwell) : '') + '</div></div>' +
      '<div class="il-than"><div class="il-bd"><div class="bd-that" id="ilBd0"></div>' +
        '<div class="il-bd-nhan">' + ngay.map((d, i) => '<span><i class="il-cham" style="background:' + mau[i % 5] + '"></i>Ngày ' + (i + 1) + '</span>').join('') + '</div></div>' +
      '<div class="il-bia-phai"><div class="il-mat">Dành riêng cho ' + e(goi) + '</div>' +
        '<h1 class="il-tieu-de">Hành trình <em>Phú Quốc</em></h1><div class="il-khoang">' + e([khoang, tuDen].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="il-so"><div><small>Thời gian</small><b>' + e(khoang || '—') + '</b></div><div><small>Đoàn</small><b>' + e(doan || '—') + '</b></div>' +
          '<div><small>Điểm đến</small><b>' + new Set(moc.map((m) => m.ten)).size + ' điểm</b></div></div>' +
        '<div class="il-tq">' + tq + '</div></div></div>' + chan() + '</section>');

    /* ---- mỗi ngày một (hoặc vài) tờ ---- */
    theoNgay.forEach((ds, i) => {
      const t = vn(ngay[i]);
      const c = mau[i % 5];
      const dsDiem = ds.filter((m) => m.d);
      const linkNgay = dsDiem.length ? window.BanDo.linkGoogle(dsDiem.map((m) => ({ ...m.d, noi: m.d.ten }))) : '';
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
          const noi = chuNoi || (x.d && x.d.ten !== x.ten ? x.d.ten : '');
          const chiDuong = x.d ? 'https://www.google.com/maps/search/?api=1&query=' + x.d.lat + ',' + x.d.lng : '';
          /* nhãn buổi chỉ hiện khi đổi buổi — đọc lướt thấy ngay sáng làm gì, chiều làm gì */
          const nhanBuoi = x.buoi && x.buoi !== buoiTruoc ? '<div class="il-buoi">Buổi ' + x.buoi.toLowerCase() + '</div>' : '';
          if (x.buoi) buoiTruoc = x.buoi;
          /* chặng tới mốc KẾ TIẾP có vị trí (bỏ qua mốc chưa rõ chỗ) */
          const sau = x.d ? ds.slice(ds.indexOf(x) + 1).find((y) => y.d) : null;
          const cId = sau ? 'ilCh' + i + '_' + ds.indexOf(x) : '';
          if (sau && ph.includes(sau)) chang.push({ id: cId, a: x.d, b: sau.d });
          return nhanBuoi + '<div class="il-moc"><div class="il-moc-so' + (x.so ? '' : ' trong') + '" style="background:' + c + '">' + (x.so || '') + '</div><div>' +
            '<div class="il-moc-gio">' + (x.gio ? hhmm(x.gio) : '') + (h.nhom ? '<span' + (x.gio ? '' : ' style="margin:0"') + '>' + e(h.nhom) + '</span>' : '') + '</div>' +
            '<div class="il-moc-ten">' + e(x.ten) + '</div>' +
            (noi || chiDuong ? '<div class="il-moc-noi">' + e(noi) + (chiDuong ? (noi ? ' · ' : '') + '<a href="' + e(chiDuong) + '" target="_blank" rel="noopener">Chỉ đường</a>' : '') + '</div>' : '') +
            (sau && ph.includes(sau) ? '<div class="il-chang" id="' + cId + '"></div>' : '') +
            '</div></div>';
        }).join('');
        trang.push('<section class="il-trang">' +
          '<div class="il-dau">' + logoHtml(true) + '<div class="il-ngay-dau"><div class="il-ngay-so" style="background:' + c + '">Ngày ' + (i + 1) + '</div>' +
            '<div class="il-ngay-ten">' + THU[t.thu] + ', ' + ddmm(ngay[i]) + '/' + t.y + (j ? ' <span class="il-mui" style="font-weight:500">(tiếp)</span>' : '') +
            '<small>Hành trình Phú Quốc · ' + e(khoang) + '</small></div></div>' +
            '<div class="il-dau-phai il-tom" id="' + tomId + '"></div></div>' +
          '<div class="il-than"><div class="il-trai"><div class="il-bd"><div class="bd-that" id="' + bdId + '"></div></div>' +
            (qrNgay ? '<a class="il-qr" href="' + e(linkNgay) + '" target="_blank" rel="noopener">' + qrNgay + '<span><b>Lộ trình ngày ' + (i + 1) + ' trên Google Maps</b>Quét mã bằng camera điện thoại, hoặc bấm vào đây trong tệp PDF để mở chỉ đường từng điểm.</span></a>' : '') +
          '</div>' +
            (ph.length ? '<div class="il-dong' + (ph.length > 5 ? ' il-dac' : '') + '">' + dong + '</div>'
              : '<div class="il-tu-do"><b>Ngày tự do</b>Thong thả nghỉ ngơi, khám phá Phú Quốc theo ý mình.</div>') +
          '</div>' + chan() + '</section>');
      });
    });

    /* ---- tờ cuối: thông tin chuyến đi ---- */
    if (coTin) {
      const tenKenh = (id) => { const k = dl.kenh.find((x) => x.id === id); return k ? [k.nenTang, k.ten].filter(Boolean).join(' · ') : ''; };
      const kenh = (b) => [...new Set((b.kenhDang || []).map(tenKenh).filter(Boolean))].join(', ') || (b.nenTang || []).join(', ');
      const dongBg = bg.sort((a, b) => (a.hanDang || 9e15) - (b.hanDang || 9e15)).map((b) =>
        '<tr><td><b>' + e(b.ten) + '</b>' + (b.chuDe ? '<div class="il-mui">' + e(b.chuDe) + '</div>' : '') + '</td><td>' + e(b.loai || '') + (b.soLuong > 1 ? ' × ' + b.soLuong : '') +
        '</td><td>' + e(kenh(b)) + '</td><td>' + (b.hanDang ? ddmm(b.hanDang) + '/' + vn(b.hanDang).y : '') + '</td></tr>').join('');
      const o = (nhan, gt) => (gt ? '<div class="il-tin-o"><small>' + nhan + '</small><div>' + gt + '</div></div>' : '');
      trang.push('<section class="il-trang">' +
        '<div class="il-dau">' + logoHtml(true) + '<div class="il-ngay-ten" style="margin-left:6mm">Thông tin chuyến đi<small>' + e(goi) + ' · ' + e(tuDen) + '</small></div><div class="il-dau-phai"></div></div>' +
        '<div class="il-than il-tin">' +
          '<div>' + '<h3 class="il-h3">Chuyến đi</h3>' +
            o('Thời gian', e([khoang, tuDen].filter(Boolean).join(' · '))) + o('Đoàn', e(doan)) + o('Mã đặt chỗ', e(ht.maTourwell || '')) +
            o('Nơi lưu trú', luuTru.map((l) => '<div>' + e(l.ten) + (l.ngay ? ' <span class="il-mui">· nhận phòng ' + ddmm(l.ngay) + (l.dem ? ', ' + l.dem + ' đêm' : '') + '</span>' : '') + '</div>').join('')) +
            o('Liên hệ Rooty Trip trong chuyến', e(lienHe)) +
            '<h3 class="il-h3">Lịch trình tóm tắt</h3>' + theoNgay.map((ds, i) => '<div class="il-tom-ngay"><span class="il-cham" style="background:' + mau[i % 5] + '"></span><b>Ngày ' + (i + 1) + ' · ' + ddmm(ngay[i]) + '</b> ' +
              e(ds.map((m) => m.ten).filter((x, j, a) => a.indexOf(x) === j).join(' · ') || 'Tự do') + '</div>').join('') +
          '</div>' +
          '<div>' + (dongBg || ht.yeuCau || ht.kenhDang ? '<h3 class="il-h3">Nội dung hợp tác</h3>' +
            (dongBg ? '<table class="il-bang"><thead><tr><th>Sản phẩm</th><th>Loại</th><th>Kênh đăng</th><th>Hạn đăng</th></tr></thead><tbody>' + dongBg + '</tbody></table>' : '') +
            (ht.kenhDang ? o('Kênh đăng tải', e(ht.kenhDang)) : '') +
            (ht.yeuCau ? '<div class="il-tin-o"><small>Yêu cầu nội dung</small><div class="il-yeu-cau">' + e(ht.yeuCau) + '</div></div>' : '') : '') +
          '</div>' +
        '</div>' + chan() + '</section>');
    }

    $('#ilSach').innerHTML = trang.join('');
    tt(chuaGio ? chuaGio + ' mốc chưa có giờ hẹn — đặt giờ trong app để lịch rõ hơn' : 'Đang vẽ bản đồ…');
    S.banDo = banDo; S.giai = giai; S.chuaGio = chuaGio; S.tongTo = tongTo;

    /* chặng đi + tóm tắt ngày: hỏi OSRM (ban-do.js nhớ kết quả nên vẽ bản đồ không gọi lại) */
    const kq = new Map();
    await Promise.all(chang.map(async (c) => { kq.set(c.id, await window.BanDo.quangDuong(c.a, c.b).catch(() => null)); }));
    for (const c of chang) {
      const r = kq.get(c.id), el = document.getElementById(c.id);
      if (!el) continue;
      if (!r) { el.remove(); continue; }
      el.textContent = chuChang(r);
    }
    for (const t of tomNgay) {
      const el = document.getElementById(t.id);
      const dsD = t.ds.filter((m) => m.d);
      let km = 0, phut = 0, bien = new Set();
      for (let k = 0; k + 1 < dsD.length; k++) {
        const r = await window.BanDo.quangDuong(dsD[k].d, dsD[k + 1].d).catch(() => null);
        if (!r) continue;
        km += r.km || 0; phut += r.phut || 0; if (r.bien) bien.add(r.bien === 'cap' ? 'có đi cáp treo' : 'có đi cano');
      }
      el.innerHTML = '<b>' + t.ds.length + ' điểm hẹn</b>' + [km ? 'khoảng ' + kmChu(km) + ' đường bộ' : '', phut ? '~' + gioChu(phut) + ' ngồi xe' : '', ...bien].filter(Boolean).map(e).join(' · ');
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
    tt(S.tongTo + ' tờ A4 ngang' + (S.chuaGio ? ' · ' + S.chuaGio + ' mốc chưa có giờ hẹn' : '') + ' · bấm Lưu PDF rồi chọn "Lưu dưới dạng PDF"');
    $('#ilIn').disabled = false;
  }

  /* thanh công cụ */
  $('#ilNen').innerHTML = Object.entries(window.BanDo.NEN).map(([k, v]) => '<option value="' + k + '"' + (k === S.nen ? ' selected' : '') + '>' + v.ten + '</option>').join('');
  $('#ilNen').onchange = (ev) => { S.nen = ev.target.value; try { localStorage.setItem('kol-nen-in', S.nen); } catch (_) {} veBanDo(); };
  $('#ilTin').onchange = (ev) => { S.coTin = ev.target.checked; chay(); };
  $('#ilIn').onclick = () => window.print();
  const chay = () => dung().catch((err) => {
    tt('Không dựng được');
    $('#ilSach').innerHTML = '<div class="il-loi">' + e(err.message) + '</div>';
  });
  chay();
})();
