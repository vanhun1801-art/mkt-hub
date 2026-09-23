'use strict';
/* ==========================================================================
   Trang in lịch trình gửi KOL (anh Hùng 23/09): một tờ bìa (cả hành trình trên bản đồ +
   tổng quan từng ngày) rồi mỗi ngày một tờ (bản đồ ngày đó bên trái, các mốc giờ bên phải).
   In bằng hộp in của trình duyệt → "Lưu dưới dạng PDF". Tờ A4 ngang, khổ cố định.

   Chỉ đưa thông tin KOL cần: giờ, việc, nơi, chỉ đường. KHÔNG có giá, FOC, nhà cung cấp,
   ghi chú nội bộ — tệp này gửi ra ngoài.
   ========================================================================== */
(function () {
  const $ = (s, g = document) => g.querySelector(s);
  const e = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const p2 = (n) => String(n).padStart(2, '0');
  const VN = 7 * 3600000, NGAY_MS = 86400000;
  const vn = (ms) => { const d = new Date(ms + VN); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), thu: d.getUTCDay() }; };
  const dauNgay = (ms) => { const t = vn(ms); return Date.UTC(t.y, t.m - 1, t.d) - VN; };
  const hhmm = (ms) => { const t = vn(ms); return p2(t.h) + ':' + p2(t.mi); };
  const ddmm = (ms) => { const t = vn(ms); return p2(t.d) + '/' + p2(t.m); };
  const THU = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const tenGon = (s) => String(s || '').replace(/\s+[—-]\s+(Người lớn|Trẻ em|Em bé)$/i, '').trim();
  const MAU = () => { const c = getComputedStyle(document.documentElement); return ['--blue', '--orange', '--green', '--purple', '--red'].map((v) => c.getPropertyValue(v).trim()); };
  /* Trong hub, trang chạy dưới /m/kol — ảnh logo đặt bằng JS nên không được hub viết lại đường dẫn. */
  const GOC = (window.__HUB__ && window.__HUB__.prefix) || '';
  const MOI_TO = 9;           // quá số mốc này trong một ngày thì sang tờ tiếp
  const tt = (s) => { $('#ilTrangThai').textContent = s; };

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

  /* Các dòng cùng giờ + cùng tên (vé Người lớn / Trẻ em của một điểm) là MỘT mốc. */
  function gomMoc(hm) {
    const m = new Map();
    for (const h of hm) {
      const k = (h.gioHen || 'n' + (h.ngay || 0)) + '|' + tenGon(h.ten);
      if (!m.has(k)) m.set(k, h);
    }
    return [...m.values()];
  }

  async function dung() {
    const id = new URLSearchParams(location.search).get('ht');
    if (!id) throw new Error('Thiếu mã hợp tác (?ht=…)');
    const [dl, logo] = await Promise.all([api('/api/du-lieu'), coLogo()]);
    const ht = dl.hopTac.find((h) => h.id === id);
    if (!ht) throw new Error('Không tìm thấy hợp tác này');
    const kol = dl.kol.find((k) => k.id === ht.kol) || {};
    const hm = dl.hangMuc.filter((h) => h.hopTac === id && h.tinhTrang !== 'Huỷ');

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
    /* cùng thứ tự với ban-do.js (theo giờ, mốc chưa có giờ lên đầu ngày) để số trên ghim khớp số trên dòng thời gian */
    const theoNgay = ngay.map((d) => moc.filter((m) => m.ngay === d).sort((a, b) => a.gio - b.gio));
    const mau = MAU();

    const goi = [kol.xungHo, kol.tenGoi || kol.ten || ht.kolTen].filter(Boolean).join(' ');
    const soNgay = ngay.length;
    const khoang = soNgay ? soNgay + ' ngày' + (soNgay > 1 ? ' ' + (soNgay - 1) + ' đêm' : '') : '';
    const tuDen = soNgay ? ddmm(ngay[0]) + (soNgay > 1 ? ' – ' + ddmm(ngay[soNgay - 1]) : '') + '/' + vn(ngay[soNgay - 1]).y : '';
    const doan = [[ht.nguoiLon, 'người lớn'], [ht.treEm, 'trẻ em'], [ht.emBe, 'em bé']].filter(([n]) => n > 0).map(([n, t]) => n + ' ' + t).join(' · ');
    document.title = 'Lịch trình Phú Quốc · ' + (kol.ten || ht.kolTen || '') + (soNgay ? ' · ' + ddmm(ngay[0]).replace('/', '-') : '');

    const logoHtml = (nho) => (logo ? '<img class="il-logo' + (nho ? ' nho' : '') + '" src="' + e(logo) + '" alt="Rooty Trip">' : '<span class="il-chu-logo">Rooty <i>trip</i></span>');
    const chan = (so) => '<div class="il-chan"><span><b>Rooty Trip Phú Quốc</b> · Lịch trình dành riêng cho ' + e(goi) + '</span><span>' + so + '</span></div>';
    const tongTo = 1 + theoNgay.reduce((n, ds) => n + Math.max(1, Math.ceil(ds.length / MOI_TO)), 0);
    let soTo = 0;
    const trang = [];
    const banDo = [];      // [{id, moc, lech}] — gắn Leaflet sau khi tờ đã nằm trên trang

    /* ---- tờ bìa ---- */
    soTo++;
    const tq = theoNgay.map((ds, i) => {
      const t = vn(ngay[i]);
      const noi = ds.map((m) => m.ten).filter((x, j, a) => a.indexOf(x) === j);
      return '<div class="il-tq-ngay"><div><b><span class="il-cham" style="background:' + mau[i % 5] + '"></span>Ngày ' + (i + 1) + '</b><small>' + THU[t.thu] + ', ' + ddmm(ngay[i]) + '</small></div>' +
        '<p>' + (noi.length ? noi.slice(0, 6).map(e).join('<span style="color:var(--il-phu)"> → </span>') + (noi.length > 6 ? ' …' : '') : '<span style="color:var(--il-phu)">Tự do khám phá</span>') + '</p></div>';
    }).join('');
    banDo.push({ id: 'ilBd0', moc: moc.filter((m) => m.ngay).sort((a, b) => a.ngay - b.ngay || a.gio - b.gio), lech: 0 });
    trang.push('<section class="il-trang">' +
      '<div class="il-dau">' + logoHtml(false) + '<div class="il-dau-phai"><b>Lịch trình du lịch</b>' + (ht.maTourwell ? 'Mã đặt chỗ ' + e(ht.maTourwell) : '') + '</div></div>' +
      '<div class="il-than"><div class="il-bd"><div class="bd-that" id="ilBd0"></div>' +
        '<div class="il-bd-nhan">' + ngay.map((d, i) => '<span><i class="il-cham" style="background:' + mau[i % 5] + '"></i>Ngày ' + (i + 1) + '</span>').join('') + '</div></div>' +
      '<div class="il-bia-phai"><div class="il-mat">Dành riêng cho ' + e(goi) + '</div>' +
        '<h1 class="il-tieu-de">Hành trình <em>Phú Quốc</em></h1><div class="il-khoang">' + e([khoang, tuDen].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="il-so"><div><small>Thời gian</small><b>' + e(khoang || '—') + '</b></div><div><small>Đoàn</small><b>' + e(doan || '—') + '</b></div>' +
          '<div><small>Điểm đến</small><b>' + new Set(moc.map((m) => m.ten)).size + ' điểm</b></div></div>' +
        '<div class="il-tq">' + tq + '</div></div></div>' +
      chan(soTo + ' / ' + tongTo) + '</section>');

    /* ---- mỗi ngày một (hoặc vài) tờ ---- */
    theoNgay.forEach((ds, i) => {
      const t = vn(ngay[i]);
      const c = mau[i % 5];
      /* số thứ tự chỉ đánh cho mốc định vị được — đúng như ghim trên bản đồ ngày đó */
      let so = 0;
      const dong = ds.map((m) => {
        const d = window.BanDo.doan(m.h, giai);
        return { ...m, d, so: d ? ++so : 0 };
      });
      const bdId = 'ilBd' + (i + 1);
      banDo.push({ id: bdId, moc: ds, lech: i });
      const phan = [];
      for (let k = 0; k < Math.max(1, dong.length); k += MOI_TO) phan.push(dong.slice(k, k + MOI_TO));
      phan.forEach((ph, j) => {
        soTo++;
        const moc1 = (x) => {
          const h = x.h;
          const chuNoi = String(h.diemHen || '').replace(/https?:\/\/\S+/g, '').replace(/-?\d+\.\d+\s*,\s*-?\d+\.\d+/g, '').replace(/[\s,;:·-]+$/, '').trim();
          const noi = chuNoi || (x.d && x.d.ten !== x.ten ? x.d.ten : '');
          const chiDuong = x.d ? 'https://www.google.com/maps/search/?api=1&query=' + x.d.lat + ',' + x.d.lng : '';
          return '<div class="il-moc"><div class="il-moc-so' + (x.so ? '' : ' trong') + '" style="background:' + c + '">' + (x.so || '·') + '</div><div>' +
            /* chưa đặt giờ thì chỉ hiện nhóm (Ăn uống, Tour…) — "Trong ngày" lặp ở mọi dòng chỉ thêm nhiễu */
            '<div class="il-moc-gio">' + (x.gio ? hhmm(x.gio) + (h.nhom ? '<span>' + e(h.nhom) + '</span>' : '') : '<span style="margin:0">' + e(h.nhom || 'Trong ngày') + '</span>') + '</div>' +
            '<div class="il-moc-ten">' + e(x.ten) + '</div>' +
            (noi || chiDuong ? '<div class="il-moc-noi">' + e(noi) + (chiDuong ? (noi ? ' · ' : '') + '<a href="' + e(chiDuong) + '" target="_blank" rel="noopener">Chỉ đường</a>' : '') + '</div>' : '') +
            '</div></div>';
        };
        trang.push('<section class="il-trang">' +
          '<div class="il-dau">' + logoHtml(true) + '<div class="il-ngay-dau" style="margin-left:6mm"><div class="il-ngay-so" style="background:' + c + '">Ngày ' + (i + 1) + '</div>' +
            '<div class="il-ngay-ten">' + THU[t.thu] + ', ' + ddmm(ngay[i]) + '/' + t.y + (j ? ' <span style="font-weight:500;color:var(--il-phu)">(tiếp)</span>' : '') +
            '<small>Hành trình Phú Quốc · ' + e(khoang) + '</small></div></div>' +
            '<div class="il-dau-phai">' + (ph.length ? ph.length + ' điểm hẹn' : '') + '</div></div>' +
          '<div class="il-than"><div class="il-bd"><div class="bd-that" id="' + bdId + (j ? '_' + j : '') + '"></div></div>' +
            (ph.length ? '<div class="il-dong' + (ph.length > 6 ? ' il-dac' : '') + '">' + ph.map(moc1).join('') + '</div>'
              : '<div class="il-tu-do"><b>Ngày tự do</b>Thong thả nghỉ ngơi, khám phá Phú Quốc theo ý mình.</div>') +
          '</div>' + chan(soTo + ' / ' + tongTo) + '</section>');
        if (j) banDo.push({ id: bdId + '_' + j, moc: ds, lech: i });
      });
    });

    $('#ilSach').innerHTML = trang.join('');

    /* ---- gắn bản đồ, chờ đường đi + ảnh nền tải xong rồi mới cho in ---- */
    tt('Đang vẽ bản đồ…');
    const cho = [];
    for (const b of banDo) {
      const el = document.getElementById(b.id);
      if (!el) continue;
      if (!b.moc.length) { el.parentElement.style.background = 'linear-gradient(135deg,#e8f4f1,#f6f8f9)'; continue; }
      const r = await window.BanDo.veThat(el, b.moc, { tinh: true, sang: true, lech: b.lech, giai });
      if (r && r.xong) cho.push(r.xong);
    }
    await Promise.race([Promise.all(cho), new Promise((ok) => setTimeout(ok, 9000))]);
    const het = Date.now() + 12000;
    while (Date.now() < het) {
      const anh = [...document.querySelectorAll('.leaflet-tile')];
      if (anh.every((a) => a.complete)) break;
      await new Promise((ok) => setTimeout(ok, 300));
    }
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    tt(tongTo + ' tờ A4 ngang · bấm Lưu PDF rồi chọn "Lưu dưới dạng PDF"');
    $('#ilIn').disabled = false;
    if (new URLSearchParams(location.search).get('in') === '1') setTimeout(() => window.print(), 300);
  }

  $('#ilIn').onclick = () => window.print();
  dung().catch((err) => {
    tt('Không dựng được');
    $('#ilSach').innerHTML = '<div class="il-loi">' + e(err.message) + '</div>';
  });
})();
