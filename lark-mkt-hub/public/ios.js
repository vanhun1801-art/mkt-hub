/* Lớp giao diện iOS (bản thử) — phần hành vi cho điện thoại.
 *
 * Chỉ chạy khi html[data-skin="ios"]. CSS (ios.css) giấu thanh tab ở màn rộng:
 * máy tính dùng panel trái, điện thoại dùng thanh tab (anh Hùng chốt 25/09/2026).
 *
 * Thanh tab: Tổng quan · Công việc · Lịch tác nghiệp · Báo cáo · Cá nhân.
 * Bốn mục đầu là đường dẫn hash có sẵn của app.js. "Cá nhân" bấm hộ nút mở
 * panel (#btnMenu): panel trên điện thoại được CSS dựng thành màn Cá nhân
 * (thẻ tài khoản · Thông báo · Cài đặt · các ứng dụng khác). Không có luật điều
 * hướng riêng nào ở đây, nên quyền, nạp lại iframe, giữ trạng thái… vẫn đúng
 * một chỗ như cũ.
 */
(function () {
  if (document.documentElement.getAttribute('data-skin') !== 'ios') return;

  const $ = (s, g) => (g || document).querySelector(s);

  /* ---------------- Mở app con: không để người dùng thấy bố cục nhảy ----------------
   * app.js gọi hàm này thay cho việc gỡ lớp phủ khung xương ngay (xem
   * boLopPhuKhung). Đo trong 12 app: hầu hết các lần nhảy xảy ra trong ~250ms
   * đầu (dãy tab, dãy nút lọc, ô chọn được JavaScript đổ nội dung vào rồi nở
   * ra / xuống dòng). Giữ lớp phủ cho tới khi app con 350ms liền không có lần
   * nhảy nào (đọc bằng PerformanceObserver 'layout-shift' ngay trong app con —
   * cùng origin), tối đa 1,5 giây, rồi mờ lớp phủ đi trong 180ms. */
  /* App con báo "khung xương của tôi đã hiện" → gỡ lớp chờ của lớp vỏ ngay
   * (mờ nhanh), để người dùng thấy đúng khung của trang thay vì khung đoán. */
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.ios !== 'khung-san') return;
    const f = [...document.querySelectorAll('iframe')].find((x) => x.contentWindow === e.source);
    const l = f && f.parentElement && f.parentElement.querySelector('.frame-loading');
    if (!l || l.dataset.dangGo === '1') return;
    l.dataset.dangGo = '1';
    l.style.transition = 'opacity .16s ease';
    l.style.opacity = '0';
    l.style.pointerEvents = 'none';
    setTimeout(() => l.remove(), 180);
  });
  window.__iosChoYen = (f, go, lop) => {
    const t0 = performance.now();
    let cuoi = t0, xong = false, ob = null;
    try {
      const W = f.contentWindow;
      ob = new W.PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) cuoi = performance.now();
      });
      ob.observe({ type: 'layout-shift', buffered: true });
    } catch (_) { /* trình duyệt không có layout-shift: chỉ đợi mốc tối thiểu */ }
    const giam = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const kiem = () => {
      if (xong) return;
      const nay = performance.now();
      if ((nay - cuoi > 350 && nay - t0 > 250) || nay - t0 > 1500) {
        xong = true;
        try { ob && ob.disconnect(); } catch (_) {}
        if (giam || !lop) return go();
        /* Kiểu B: lớp chờ chỉ mờ dần đi (nhẹ, không nhoè) */
        lop.style.transition = 'opacity .22s ease';
        lop.style.opacity = '0';
        lop.style.pointerEvents = 'none';
        setTimeout(go, 240);
      } else setTimeout(kiem, 60);
    };
    kiem();
  };
  const svg = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const IC = {
    'tong-quan': svg('<path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>'),
    'cong-viec': svg('<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="m8.5 9.5 2 2 4-4M8.5 15.5h7"/>'),
    'lich': svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2"/>'),
    'bao-cao': svg('<path d="M6.5 3.5h8l4 4v13h-12z"/><path d="M14 3.5V8h4.5M9.5 13h6M9.5 16.5h4"/>'),
    'nguoi': svg('<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20.5c.9-3.8 3.7-5.8 7.2-5.8s6.3 2 7.2 5.8"/>'),
    'chuong': svg('<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.8 1.8H4.2z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>')
  };
  // Ba app đã có tab riêng thì không lặp lại trong danh sách "Ứng dụng khác"
  const CO_TAB = ['cong-viec', 'lich-tac-nghiep', 'bao-cao'];
  const MUC = [
    { k: 'tong-quan', ten: 'Tổng quan', href: '#/tong-quan', ic: IC['tong-quan'] },
    { k: 'cong-viec', ten: 'Công việc', href: '#/m/cong-viec', ic: IC['cong-viec'] },
    { k: 'lich-tac-nghiep', ten: 'Lịch tác nghiệp', href: '#/m/lich-tac-nghiep', ic: IC.lich },
    { k: 'bao-cao', ten: 'Báo cáo', href: '#/m/bao-cao', ic: IC['bao-cao'] },
    { k: 'ca-nhan', ten: 'Cá nhân', nut: true, ic: IC.nguoi }
  ];

  /* ---------------- Thanh tab ---------------- */
  const nav = document.createElement('nav');
  nav.className = 'ios-tabbar';
  nav.setAttribute('aria-label', 'Thanh tab');
  nav.innerHTML = MUC.map((m) => m.nut
    ? '<button type="button" data-ios="' + m.k + '">' + m.ic + '<span>' + m.ten + '</span></button>'
    : '<a href="' + m.href + '" data-ios="' + m.k + '">' + m.ic + '<span>' + m.ten + '</span></a>').join('');
  document.body.appendChild(nav);
  document.body.classList.add('co-ios-tab');
  const nutCaNhan = $('[data-ios="ca-nhan"]', nav);

  // KHÔNG dùng offsetParent: bảng thông báo là position:fixed nên offsetParent
  // luôn null dù đang hiện — đã dính (bảng không đóng khi bấm tab khác).
  const tbMo = () => { const p = $('.tb-panel'); return !!(p && !p.hidden && getComputedStyle(p).display !== 'none'); };
  const dongTb = () => { const x = $('.tb-panel .tb-x'); if (x) x.click(); };
  const railMo = () => document.body.classList.contains('rail-mo');
  const dongRail = () => { if (railMo()) { const m = $('#btnMenu'); if (m) m.click(); } };

  function sang() {
    // "#/" và "#" cũng là trang chủ — trước đây rơi xuống nhánh "không khớp tab nào"
    // nên thanh tab sáng nhầm "Cá nhân" ngay khi mở hub
    const h = (!location.hash || location.hash === '#' || location.hash === '#/') ? '#/tong-quan' : location.hash;
    let co = false;
    nav.querySelectorAll('a[data-ios]').forEach((a) => {
      const on = !railMo() && !tbMo() && (h === a.getAttribute('href') || h.indexOf(a.getAttribute('href') + '?') === 0);
      if (on) { a.setAttribute('aria-current', 'page'); co = true; } else a.removeAttribute('aria-current');
    });
    // Đang ở màn Cá nhân, màn Thông báo, hay một app không có tab riêng → sáng "Cá nhân"
    if (!co) nutCaNhan.setAttribute('aria-current', 'page'); else nutCaNhan.removeAttribute('aria-current');
  }
  window.addEventListener('hashchange', sang);
  new MutationObserver(sang).observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
  sang();

  nav.addEventListener('click', (e) => {
    const muc = e.target.closest('[data-ios]');
    if (!muc) return;
    if (tbMo()) dongTb();
    if (muc.dataset.ios === 'ca-nhan') {
      const m = $('#btnMenu');
      if (m && !railMo()) m.click();
      return;
    }
    dongRail();
  });

  /* ---------------- Màn Cá nhân (panel base trên điện thoại) ----------------
   * Thêm thẻ tài khoản ở đầu và dòng "Thông báo" vào nhóm Cài đặt. Tên lấy từ
   * chip #homeUser mà app.js vẫn điền ("Tài khoản Lark: Lê Văn Hùng"). */
  const rail = $('#rail');
  let hoso = null, dongTbRail = null;
  if (rail) {
    hoso = document.createElement('button');
    hoso.type = 'button';
    hoso.className = 'ios-hoso';
    hoso.innerHTML = '<span class="ios-av"></span><span><b></b><small>Tài khoản Lark</small></span>';
    rail.insertBefore(hoso, rail.firstChild);
    hoso.addEventListener('click', () => { const s = $('#btnSettings'); if (s) s.click(); });

    /* Màn Cá nhân: chỉ danh sách app được kéo. Safari iPhone không phải lúc
     * nào cũng theo overscroll-behavior (ios.css) — chặn thêm bằng tay: vuốt
     * ngoài danh sách, hoặc vuốt quá đầu/cuối danh sách, thì không cho chuyền
     * ra trang phía sau. */
    let y0 = 0;
    rail.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    rail.addEventListener('touchmove', (e) => {
      if (innerWidth > 640 || !document.body.classList.contains('rail-mo')) return;
      /* 09/10/2026, anh Hùng: "cuộn lên cả trang vậy mới ổn hơn" — CẢ màn Cá
       * nhân cuộn một khối (tiêu đề, thẻ tài khoản, nhóm Cài đặt, danh sách app)
       * như Cài đặt của iOS. Chỉ chặn cú vuốt quá đầu/cuối để trang phía sau
       * không nảy theo. */
      const ds = rail;
      if (ds.scrollHeight <= ds.clientHeight + 1) { e.preventDefault(); return; }
      const dy = e.touches[0].clientY - y0;
      const dinh = ds.scrollTop <= 0, day = ds.scrollTop + ds.clientHeight >= ds.scrollHeight - 1;
      if ((dy > 0 && dinh) || (dy < 0 && day)) e.preventDefault();
    }, { passive: false });

    const foot = $('.rail-foot', rail);
    if (foot) {
      dongTbRail = document.createElement('button');
      dongTbRail.type = 'button';
      dongTbRail.className = 'rail-item ios-tb';
      dongTbRail.innerHTML = '<span class="ri-ic" style="color:#ff3b30">' + IC.chuong + '</span><span class="ri-tx"><b>Thông báo</b></span>';
      foot.insertBefore(dongTbRail, foot.firstChild);
      dongTbRail.addEventListener('click', () => {
        dongRail();
        const mo = () => { const t = $('#btnTB'); if (t) t.click(); };
        if ((location.hash || '#/tong-quan') !== '#/tong-quan') { location.hash = '#/tong-quan'; setTimeout(mo, 250); }
        else mo();
      });
    }
  }
  function tenNguoi() {
    const u = $('#homeUser');
    const t = u ? (u.textContent || '').replace(/^[^:]*:\s*/, '').trim() : '';
    if (!hoso || !t) return;
    $('b', hoso).textContent = t;
    const av = $('.ios-av', hoso);
    av.textContent = t.split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();
    /* Ảnh Lark: ganAnh() tìm tên qua data-ten — ô này nằm cạnh khối "tên + Tài
     * khoản Lark" nên đọc chữ bên cạnh không ra tên. Gắn thẳng tên vào ô. */
    if (av.dataset.ten !== t) { av.dataset.ten = t; delete av.dataset.iosAnh; av.classList.remove('ios-co-anh'); av.style.backgroundImage = ''; }
    try { ganAnh(); } catch (_) {}
  }
  const u = $('#homeUser');
  if (u) new MutationObserver(tenNguoi).observe(u, { childList: true, subtree: true, characterData: true });
  tenNguoi();

  /* Đánh dấu dòng đầu/cuối ĐANG HIỆN của mỗi nhóm trong panel, để CSS bo góc
   * đúng khi ba app có tab riêng đã bị ẩn khỏi danh sách (:first-child không
   * bỏ qua được phần tử ẩn). */
  function danhDauNhom() {
    const nav2 = $('#railNav');
    if (!nav2) return;
    nav2.querySelectorAll('a.rail-item').forEach((a) => {
      a.classList.toggle('ios-an', CO_TAB.includes(a.dataset.id));
    });
    [nav2, $('.rail-foot')].forEach((g) => {
      if (!g) return;
      let nhom = [];
      const xong = () => {
        const hien = nhom.filter((x) => !x.classList.contains('ios-an') && x.getAttribute('href') !== '#/tong-quan');
        nhom.forEach((x) => x.classList.remove('ios-dau', 'ios-cuoi'));
        if (hien.length) { hien[0].classList.add('ios-dau'); hien[hien.length - 1].classList.add('ios-cuoi'); }
        nhom = [];
      };
      [...g.children].forEach((c) => {
        if (c.classList.contains('rail-item')) nhom.push(c);
        else xong();
      });
      xong();
    });
  }
  const railNav = $('#railNav');
  if (railNav) new MutationObserver(danhDauNhom).observe(railNav, { childList: true });
  danhDauNhom();

  /* ---------------- Số thông báo chưa đọc ----------------
   * Chép từ huy hiệu của nút chuông (#tbSo) lên tab Cá nhân và dòng Thông báo. */
  function dem() {
    const so = $('#tbSo');
    const n = so && !so.hidden ? (so.textContent || '').trim() : '';
    [[nutCaNhan, 'ios-so'], [dongTbRail, 'ri-badge']].forEach(([el, cls]) => {
      if (!el) return;
      let b = el.querySelector('.' + cls);
      if (n && n !== '0') {
        if (!b) { b = document.createElement('span'); b.className = cls; el.appendChild(b); }
        b.textContent = n;
      } else if (b) b.remove();
    });
  }
  const so = $('#tbSo');
  if (so) new MutationObserver(dem).observe(so, { childList: true, characterData: true, subtree: true, attributes: true });
  dem();

  /* ---------------- Thẻ base trên Tổng quan: bấm cả đầu thẻ để mở ----------------
   * Nút "Mở app" đã ẩn (mọi cỡ màn); đầu thẻ mượn đúng đường dẫn của nó. */
  document.addEventListener('click', (e) => {
    const dau = e.target.closest('.nhom-base .khoi-head');
    if (!dau || e.target.closest('a, button, .seg')) return;
    const mo = $('a.btn.primary', dau);
    if (mo) location.hash = mo.getAttribute('href');
  });

  /* ---------------- Tải nhân sự: số thật trên từng ô ngày ----------------
   * Mỗi ô có sẵn chú thích "01/09/2026 · 2 việc (1 tác nghiệp)". Đọc số việc ra
   * data-so, ngày ra data-ngay để CSS in thẳng lên ô; ô trống không có chú
   * thích thì suy ngày từ vị trí so với ô có ngày đầu tiên của hàng. Xong thì
   * cuộn dải tới hôm nay. */
  function soThat() {
    const khoi = $('.khoi-tai');
    if (!khoi) return;
    const nay = new Date();
    const khoaNay = nay.getFullYear() + '-' + String(nay.getMonth() + 1).padStart(2, '0') + '-' + String(nay.getDate()).padStart(2, '0');
    khoi.querySelectorAll('.tn-hang:not(.tn-thuoc)').forEach((h) => {
      const dai = $('.tn-dai', h);
      if (!dai || dai.dataset.ios === '1') return;
      const o = [...dai.querySelectorAll('.tn-o')];
      const moc = o.findIndex((x) => x.dataset.n);
      const goc = moc >= 0 ? new Date(o[moc].dataset.n + 'T00:00:00') : null;
      let iNay = -1;
      o.forEach((x, i) => {
        const m = /(\d+)\s*việc/.exec(x.getAttribute('title') || '');
        x.dataset.so = m ? m[1] : '0';
        /* Ngày nghỉ (Lịch làm việc): máy tính in chữ OFF / ½ trong ô — điện thoại
         * in đúng chữ đó thay cho số việc, để không mất thông tin nghỉ. */
        x.dataset.hien = /ng-(ca|nua)/.test(x.className) ? (x.classList.contains('ng-ca') ? 'OFF' : '½') : x.dataset.so;
        let ngay = x.dataset.n;
        if (!ngay && goc) { const d = new Date(goc); d.setDate(goc.getDate() + (i - moc)); ngay = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
        x.dataset.ngay = ngay ? String(+ngay.slice(8)) : '';
        if (ngay === khoaNay) { x.classList.add('ios-nay'); iNay = i; }
      });
      dai.dataset.ios = '1';
      /* Một tháng (≤ 31 ngày): điện thoại xếp thành lưới hai hàng nửa tháng, thấy
       * trọn cả tháng như máy tính, không phải vuốt, không ô nào bị cắt mép.
       * Khoảng dài hơn (Năm nay, Tuỳ chỉnh) giữ dải vuốt ngang. */
      if (o.length <= 31) {
        dai.classList.add('ios-luoi');
        dai.style.setProperty('--so-cot', String(Math.min(16, o.length)));
        return;
      }
      if (iNay > 0 && innerWidth <= 640) requestAnimationFrame(() => { dai.scrollLeft = Math.max(0, (iNay - 1) * 44); });
    });
  }
  const homeBody = $('#homeBody');
  if (homeBody) new MutationObserver(soThat).observe(homeBody, { childList: true, subtree: true });
  soThat();

  /* ---------------- Phân quyền: trạng thái khớp = chấm ----------------
   * ios.css thu "Đã khớp: <tên>" thành một chấm xanh/cam (tên đã in ngay trên).
   * Dấu " · " đứng trước nó trong dòng email vì thế thừa — gỡ đi mỗi lần cửa
   * sổ vẽ lại. Chỉ gỡ đúng dấu nằm sát trước chấm, không đụng chữ khác. */
  const mdBody = document.getElementById('mdBody');
  if (mdBody) {
    const donCham = () => {
      mdBody.querySelectorAll('.q-nd-luc, .q-nd-vang').forEach((s) => {
        const t = s.previousSibling;
        if (t && t.nodeType === 3 && /·\s*$/.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(/\s*·\s*$/, ' ');
      });
    };
    let henCham = 0;
    new MutationObserver(() => { if (!henCham) henCham = requestAnimationFrame(() => { henCham = 0; donCham(); }); })
      .observe(mdBody, { childList: true, subtree: true });
  }

  /* ---------------- Tiêu đề lớn thu lại khi cuộn ----------------
   * Nghe sự kiện cuộn ở pha capture (bắt được cả khung cuộn bên trong, không
   * chỉ cửa sổ) của lớp vỏ và của từng iframe app con — cùng origin nên gắn
   * được. Bỏ qua khung cuộn nhỏ (dải tab trượt ngang, ô danh sách thả xuống):
   * chỉ tính khung cao từ 240px (khung làn việc của Bảng công việc chỉ cao
   * ~418px trên iPhone vì đầu app đứng yên — mốc "nửa màn" bỏ sót đúng khung
   * cuộn chính). Có vùng đệm (thu ở >36px, mở lại ở <8px) để tiêu đề không
   * nhấp nháy khi chiều cao thanh đầu thay đổi. */
  const bar = $('.mob-bar');
  if (bar) {
    const doCuon = (t, doc) => {
      // Lịch tác nghiệp cuộn bằng chính <body> (overflow trên body), không phải
      // <html> — lấy số lớn hơn của cả hai thì app nào cũng đúng.
      if (t === doc || t === doc.documentElement || t === doc.body) {
        return Math.max((doc.scrollingElement || doc.documentElement).scrollTop, doc.body ? doc.body.scrollTop : 0);
      }
      if (!t || t.clientHeight < 240) return null;
      return t.scrollTop;
    };
    const nghe = (doc) => (e) => {
      const y = doCuon(e.target, doc);
      if (y == null) return;
      if (y > 36) bar.classList.add('thu');
      else if (y < 8) bar.classList.remove('thu');
    };
    document.addEventListener('scroll', nghe(document), true);
    const ganKhung = (f) => {
      if (f.__iosCuon) return;
      f.__iosCuon = true;
      const gan = () => { try { f.contentDocument.addEventListener('scroll', nghe(f.contentDocument), true); } catch (_) {} };
      f.addEventListener('load', gan);
      if (f.contentDocument && f.contentDocument.readyState !== 'loading') gan();
    };
    const quet = () => document.querySelectorAll('iframe').forEach(ganKhung);
    quet();
    new MutationObserver(quet).observe($('#stage') || document.body, { childList: true, subtree: true });
    // Chuyển app thì tiêu đề lớn hiện lại — trang mới bắt đầu ở đầu
    window.addEventListener('hashchange', () => bar.classList.remove('thu'));
  }
})();

(function () {
  if (document.documentElement.getAttribute('data-skin') !== 'ios') return;
  /* Mép dải trượt ngang (tab, bộ lọc): gắn data-mep = trai | phai | ca để CSS
   * làm mờ dần phía còn nội dung, thay vì cắt ngang chữ ở mép khung. */
  const MEP = '.topbar .tabs, .tabsbar .tabs, .thanh .tabs, .topbar > .pills, .filters, .filters-dash, .filters-work, .cal-filters, .loc-bar, .cd-nav, .tb-chips';
  function mepMot(d) {
    const tran = d.scrollWidth > d.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(d).overflowX);
    let v = '';
    if (tran) {
      const trai = d.scrollLeft > 2, phai = d.scrollLeft + d.clientWidth < d.scrollWidth - 2;
      v = trai && phai ? 'ca' : trai ? 'trai' : phai ? 'phai' : '';
    }
    if ((d.getAttribute('data-mep') || '') !== v) { if (v) d.setAttribute('data-mep', v); else d.removeAttribute('data-mep'); }
  }
  const mepHet = () => document.querySelectorAll(MEP).forEach(mepMot);
  document.addEventListener('scroll', (e) => { const d = e.target; if (d && d.matches && d.matches(MEP)) mepMot(d); }, { capture: true, passive: true });
  addEventListener('resize', () => requestAnimationFrame(() => { mepHet(); lensHet(); }));

  /* THẤU KÍNH TRƯỢT (Liquid Glass): trong mỗi dải tab / rãnh phân đoạn có một
   * <i class="ios-lens"> nằm dưới các nút; mục đang chọn đổi thì thấu kính trượt
   * tới bằng lò xo (CSS .ios-lens.chay) thay vì nền nhảy bụp từ nút này sang
   * nút kia. Lần đặt đầu tiên không chạy hiệu ứng (khỏi bay từ góc trái vào).
   * Dải bị "tháo" thành display:contents (hàng viên lọc điện thoại) thì bỏ
   * thấu kính, trả nền về cho nút. */
  const LENS = '.topbar .tabs, .tabsbar .tabs, .thanh .tabs, .topbar > .pills, .seg, .hub-seg, .cal-modes, .ios-tabbar';
  const DANG_CHON = ':scope > :is(.on, .is-active, .chon, [aria-current="page"], [aria-selected="true"])';
  const lensCu = new Map();
  function lensMot(d) {
    let l = d.querySelector(':scope > .ios-lens');
    const on = d.querySelector(DANG_CHON);
    const hs = getComputedStyle(d);
    if (!on || hs.display === 'contents' || hs.display === 'none' || !on.offsetWidth) {
      if (l) { l.remove(); d.classList.remove('ios-co-lens'); }
      return;
    }
    const khoa = (d.id || '') + '|' + String(d.className).replace(/\s*ios-co-lens/, '') + '|' + (d.parentElement ? d.parentElement.className : '');
    let tuCu = null;
    if (!l) {
      l = document.createElement('i');
      l.className = 'ios-lens'; l.setAttribute('aria-hidden', 'true');
      d.insertBefore(l, d.firstChild);
      d.classList.add('ios-co-lens');
      if (getComputedStyle(d).position === 'static') d.style.position = 'relative';
      tuCu = lensCu.get(khoa) || null;   // app vẽ lại dải tab: xuất phát từ chỗ cũ
    }
    const x = on.offsetLeft, y = on.offsetTop, w = on.offsetWidth, h = on.offsetHeight;
    const cu = l.dataset.k, moi = x + ',' + y + ',' + w + ',' + h;
    if (cu === moi) return;
    l.dataset.k = moi;
    lensCu.set(khoa, [x, y, w, h]);
    if (tuCu && tuCu.join(',') !== moi && l.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      /* Phần tử vừa chèn chưa có "kiểu trước đó" nên CSS transition không có
       * điểm xuất phát → dùng Web Animations, chạy thẳng từ chỗ cũ tới chỗ mới. */
      l.classList.add('san');
      l.animate([
        { transform: 'translate3d(' + tuCu[0] + 'px,' + tuCu[1] + 'px,0)', width: tuCu[2] + 'px', height: tuCu[3] + 'px' },
        { transform: 'translate3d(' + x + 'px,' + y + 'px,0)', width: w + 'px', height: h + 'px' },
      ], { duration: 500, easing: 'cubic-bezier(.32, 1.32, .5, 1)' });
      requestAnimationFrame(() => l.classList.add('chay'));
    }
    l.style.setProperty('--x', x + 'px'); l.style.setProperty('--y', y + 'px');
    l.style.setProperty('--w', w + 'px'); l.style.setProperty('--h', h + 'px');
    const br = getComputedStyle(on).borderTopLeftRadius;
    if (br && br !== '0px') l.style.borderRadius = br;
    if (!l.classList.contains('san')) requestAnimationFrame(() => { l.classList.add('san'); requestAnimationFrame(() => l.classList.add('chay')); });
  }
  const lensHet = () => document.querySelectorAll(LENS).forEach(lensMot);


  /* ĐỆM CUỐI VÙNG CUỘN (điện thoại): khung app nay kéo tới đáy màn, nội dung
   * lướt sau viên kính của thanh tab → vùng cuộn chính cần đệm cuối để mục cuối
   * cùng vẫn cuộn lên được phía trên thanh. Tìm vùng cuộn lớn nhất (cao > nửa
   * màn), gắn .ios-cuon-day; cuộn cả trang thì gắn cho <body>. Trong app con,
   * lấy độ cao thanh Home (safe-area) đo từ lớp vỏ, vì iframe không có env(). */
  let cuonHen = 0;
  function cuonDay() {
    const cu = document.querySelectorAll('.ios-cuon-day');
    if (innerWidth > 640) { cu.forEach((e) => e.classList.remove('ios-cuon-day')); return; }
    const vh = innerHeight;
    let tot = null, dt = 0;
    const de = document.scrollingElement || document.documentElement;
    if (de.scrollHeight > de.clientHeight + 4) { tot = document.body; dt = de.clientWidth * de.clientHeight; }
    if (document.body.scrollHeight > document.body.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(document.body).overflowY)) { tot = document.body; dt = document.body.clientWidth * document.body.clientHeight; }
    document.querySelectorAll('body *').forEach((e) => {
      if (e.clientHeight < vh * 0.5 || e.scrollHeight <= e.clientHeight + 4 || !e.getClientRects().length) return;
      if (!/auto|scroll/.test(getComputedStyle(e).overflowY)) return;
      const s = e.clientWidth * e.clientHeight;
      if (s > dt) { tot = e; dt = s; }
    });
    cu.forEach((e) => { if (e !== tot) e.classList.remove('ios-cuon-day'); });
    if (tot && !tot.classList.contains('ios-cuon-day')) tot.classList.add('ios-cuon-day');
  }
  let cuonLan = 0;
  const henCuon = () => {
    if (cuonHen) return;
    const cho = Math.max(0, 400 - (Date.now() - cuonLan));
    cuonHen = setTimeout(() => { cuonHen = 0; cuonLan = Date.now(); cuonDay(); }, cho);
  };
  try {
    if (parent !== window && parent.document) {
      const pd = parent.document, pr = pd.createElement('div');
      pr.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
      pd.body.appendChild(pr);
      document.documentElement.style.setProperty('--ios-duoi', pr.offsetHeight + 'px');
      pr.remove();
    }
  } catch (_) {}
  addEventListener('resize', henCuon);
  addEventListener('load', henCuon);
  addEventListener('hashchange', henCuon);
  document.addEventListener('click', henCuon, true);
  setTimeout(cuonDay, 1200); setTimeout(cuonDay, 4000);


  /* ẢNH ĐẠI DIỆN LARK: thay ô tròn chữ viết tắt bằng ảnh thật của người đó.
   * Máy chủ trả bảng tên → ảnh (/api/anh-dai-dien, gọi bằng đường TUYỆT ĐỐI để
   * shim của proxy không đổi sang API của app con). Tên lấy từ chính ô: title,
   * data-ten, aria-label, hoặc chữ tên nằm ngay cạnh. Chỉ gắn ảnh nền + lớp
   * .ios-co-anh (CSS giấu chữ) — không sửa chữ, i18n.js không bị ảnh hưởng. */
  const O_AV = '.av, .pk-ava, .avatar, .ava, .ios-av, .av-sm, .tn-av, .nv-av, .ng-av';
  const chuanTenAv = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  let bangAnh = null, dangLayAnh = false;
  function layBangAnh() {
    if (bangAnh || dangLayAnh) return;
    try {
      const c = JSON.parse(sessionStorage.getItem('ios.anh') || 'null');
      if (c && Date.now() - c.at < 3600e3) { bangAnh = c.ds; return; }
    } catch (_) {}
    dangLayAnh = true;
    fetch(location.origin + '/api/anh-dai-dien', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        bangAnh = (j && (j.ds || (j.data && j.data.ds))) || {};
        try { sessionStorage.setItem('ios.anh', JSON.stringify({ at: Date.now(), ds: bangAnh })); } catch (_) {}
        ganAnh();
      })
      .catch(() => { bangAnh = {}; })
      .finally(() => { dangLayAnh = false; });
  }
  function tenCuaAv(e) {
    const c = [e.getAttribute('title'), e.dataset.ten, e.getAttribute('aria-label')];
    const ke = e.nextElementSibling;
    if (ke && !ke.matches(O_AV)) c.push(ke.textContent);
    const cha = e.parentElement;
    if (cha) c.push(cha.getAttribute('title'));
    for (const x of c) {
      const k = chuanTenAv(x);
      if (!k) continue;
      if (bangAnh[k]) return bangAnh[k];
      const bo = k.replace(/\s*\(.*?\)\s*/g, ' ').trim();   // "Nguyễn Long Khánh (Pinky)"
      if (bangAnh[bo]) return bangAnh[bo];
    }
    return '';
  }
  function ganAnh() {
    if (!bangAnh) return layBangAnh();
    if (!Object.keys(bangAnh).length) return;
    document.querySelectorAll(O_AV).forEach((e) => {
      if (e.dataset.iosAnh === '1' && e.classList.contains('ios-co-anh')) return;   // bị vẽ lại mất lớp ảnh thì gắn lại
      const u = tenCuaAv(e);
      if (!u) return;
      e.dataset.iosAnh = '1';
      e.style.backgroundImage = 'url("' + u.replace(/"/g, '%22') + '")';
      e.classList.add('ios-co-anh');
    });
  }


  /* THEO DÕI ÂM THẦM (loi-giao-dien.js ở máy chủ): lỗi JS, promise không ai bắt,
   * trang tràn ngang, cửa sổ kẹt — gửi về lớp vỏ bằng sendBeacon, người dùng
   * không thấy gì. Tối đa 15 báo mỗi lần mở trang, không gửi trùng. */
  const BAO_APP = document.documentElement.getAttribute('data-app') || 'hub';
  const daBao = new Set();
  let soBao = 0;
  function baoLoi(loai, msg, nguon) {
    try {
      const k = loai + '|' + msg + '|' + nguon;
      if (!msg || daBao.has(k) || soBao >= 15) return;
      daBao.add(k); soBao++;
      const b = JSON.stringify({ loai, app: BAO_APP, msg: String(msg).slice(0, 400), nguon: String(nguon || '').slice(0, 200),
        url: location.pathname + location.hash, w: innerWidth, h: innerHeight, ua: navigator.userAgent.slice(0, 160) });
      const u = location.origin + '/api/loi-giao-dien';
      if (!(navigator.sendBeacon && navigator.sendBeacon(u, new Blob([b], { type: 'text/plain' })))) {
        fetch(u, { method: 'POST', body: b, credentials: 'same-origin', keepalive: true }).catch(() => {});
      }
    } catch (_) {}
  }
  addEventListener('error', (e) => {
    if (!e || e.target !== window && e.target && e.target !== document) return;   // ảnh/tệp tải hỏng: không phải lỗi giao diện
    const f = String(e.filename || '');
    if (f && f.indexOf(location.origin) !== 0) return;                            // tiện ích trình duyệt
    baoLoi('js', e.message || 'Lỗi không rõ', f.replace(location.origin, '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0));
  });
  addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    baoLoi('promise', (r && (r.message || r)) || 'Promise bị từ chối', (r && r.stack ? String(r.stack).split('\n')[1] || '' : '').trim());
  });
  function kiemTran() {
    const d = document.documentElement;
    if (d.scrollWidth <= d.clientWidth + 2) return;
    let thu = '';
    for (const e of document.querySelectorAll('body *')) {
      const r = e.getBoundingClientRect();
      if (r.right > d.clientWidth + 2 && r.width > 0 && r.width < d.scrollWidth + 1) {
        let a = e.parentElement, cat = false;
        while (a && a !== document.body) { if (getComputedStyle(a).overflowX !== 'visible') { cat = true; break; } a = a.parentElement; }
        if (!cat) { thu = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + [...e.classList].slice(0, 2).map((c) => '.' + c).join(''); break; }
      }
    }
    baoLoi('tran', 'Trang tràn ngang ' + d.scrollWidth + '>' + d.clientWidth + 'px', thu);
  }
  let henTran = 0;
  const henKiemTran = () => { clearTimeout(henTran); henTran = setTimeout(kiemTran, 1500); };
  addEventListener('load', () => setTimeout(kiemTran, 5000));
  addEventListener('resize', henKiemTran);
  document.addEventListener('click', henKiemTran, true);

  const CUA_KET = '.drawer.on, .drawer.open, .modal.on, .modal.open, .modal-wrap:not([hidden]):not(.hidden), .phu-man, .md.on, .xt.on, .xt.mo, [role="dialog"]:not([hidden]), .mask.on, .scrim.open';
  let ketTu = 0;
  setInterval(() => {
    if (!document.body.classList.contains('mod-che')) { ketTu = 0; return; }
    const f = [...document.querySelectorAll('#stage iframe')].find((x) => x.offsetParent && !x.closest('.khung-ngam'));
    let coCua = true;
    try { const d = f && f.contentDocument; coCua = !!(d && [...d.querySelectorAll(CUA_KET)].some((e) => e.getClientRects().length)); } catch (_) {}
    if (coCua) { ketTu = 0; return; }
    if (!ketTu) ketTu = Date.now();
    else if (Date.now() - ketTu > 4000) {
      baoLoi('ket', 'Lớp vỏ còn mờ nhưng không còn cửa sổ nào mở', (f && f.src || '').replace(location.origin, ''));
      document.body.classList.remove('mod-che');                     // tự gỡ cho người dùng khỏi kẹt
      const r = document.getElementById('rail'); if (r) r.style.filter = '';
      ketTu = 0;
    }
  }, 1500);

  let hen = 0;
  const lich = () => { if (hen) return; hen = requestAnimationFrame(() => { hen = 0; mepHet(); lensHet(); henCuon(); ganAnh(); }); };

  function caiHienHinh() {
    /* KHUNG XƯƠNG KIỂU C — "hiện hình": khối nào vừa được thay khung xương bằng
     * nội dung thật thì gắn .kx-hien-hinh (nhoè → rõ, CSS trong ios.css). Nhận ra
     * bằng bản ghi của MutationObserver: nút bị gỡ có chứa .kx, và khối cha sau đó
     * không còn .kx nào. Lớp phủ toàn màn (data-kx-xem, Bảng công việc) tắt bằng
     * đổi lớp → cho các vùng nội dung đang hiện "hiện hình" cùng lúc. Lớp phủ
   * iframe của lớp vỏ (.frame-loading) KHÔNG tính: nó đã tự tan nhoè trong
   * __iosChoYen, tính thêm là khung trang nhoè hai lần liền nhau. */
    const coXuong = (n) => n.nodeType === 1 && !n.classList.contains('frame-loading') && (n.classList.contains('kx') || n.classList.contains('kx-vung') || !!n.querySelector('.kx'));
    function hienHinh(e) {
      if (!e || e === document.body || e === document.documentElement || e.closest('.kx-hien-hinh')) return;
      // thanh bên, thanh đầu, dải tab, thanh tab: khung cố định, không đổi gì — nhoè là thừa, trông như lỗi
      if (e.closest('.rail, .topbar, header, .ios-tabbar, .mob-bar, .tabs, .pills, .tabsbar')) return;
      e.classList.remove('kx-hien-hinh'); void e.offsetWidth; e.classList.add('kx-hien-hinh');
      setTimeout(() => e.classList.remove('kx-hien-hinh'), 700);
    }
    new MutationObserver((ds) => {
      const da = new Set();
      for (const m of ds) {
        if (m.type === 'childList') {
          if (!m.removedNodes.length || da.has(m.target)) continue;
          let co = false;
          for (const n of m.removedNodes) { if (coXuong(n)) { co = true; break; } }
          if (!co || !(m.target instanceof Element) || m.target.querySelector('.kx')) continue;
          da.add(m.target);
          if (m.target === document.body) [...document.body.children].forEach((c) => { if (c.offsetHeight && !c.matches('script, .topbar, header')) hienHinh(c); });
          else hienHinh(m.target);
        } else if (m.type === 'attributes' && m.target.matches && m.target.matches('[data-kx-xem]')) {
          const t = m.target, an = t.hidden || getComputedStyle(t).display === 'none' || t.classList.contains('hidden');
          if (an && !t.dataset.daHien) {
            t.dataset.daHien = '1';
            document.querySelectorAll('body > main, body > section, body > .page').forEach((c) => { if (c.offsetHeight && c !== t) hienHinh(c); });
          }
        }
      }
    }).observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
  
  }
  caiHienHinh();
  lich();
  new MutationObserver(lich).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-current', 'aria-selected', 'hidden'] });
})();

/* ĐÓNG CỬA SỔ MƯỢT, MỘT NHỊP CHO CẢ HỆ (27/09). Anh Hùng: "cho hiệu ứng đóng cửa
 * sổ mượt hơn và đồng bộ trên toàn bộ ứng dụng". Mở đã có lò xo (ios.css), còn
 * đóng thì mỗi app một kiểu — đa số tắt phụt (display:none / gỡ khỏi trang).
 * Không sửa từng app: lúc một cửa sổ vừa tắt, dựng ngay BẢN SAO của nó ở đúng
 * chỗ (giữ lớp lúc mở, giá trị ô nhập, vị trí cuộn), rồi cho bản sao mờ + thu
 * nhẹ 0,22s và tự gỡ. Cửa sổ thật đã đóng xong theo đúng logic của app; bản sao
 * chỉ là hình, không bấm được (inert). Cửa sổ tự mờ dần (opacity/visibility)
 * thì để nguyên, không nhân đôi. */
(function () {
  if (document.documentElement.getAttribute('data-skin') !== 'ios') return;
  /* 09/10/2026 (hệ chuyển động chung): thêm cả lớp nổi nhỏ — danh sách xổ,
   * bộ chọn ngày, gợi ý tìm kiếm, ngăn kéo Khách hàng — để đóng cũng mờ/thu
   * dần như cửa sổ, không biến mất cụt. */
  const HOP = '.modal, .modal-wrap, .md, .xt, .phu-man, .hop, .mask, .scrim, .modal-mask, .modal-nen, .ios-nen-so, [role="dialog"], ' +
    '.ng-pop, .goi-y, .goi-y-ng, .ng-goiy, .pk-panel, .ngan';
  const dangMo = new Map();
  /* Bị THAY bằng bản mới cùng loại ngay tại chỗ (VD lịch chọn ngày vẽ lại khi
   * sang tháng): không phải đóng → không để bóng mờ, và bản mới không diễn lại
   * hiệu ứng mở (.ios-thay-the). */
  const thayThe = (e, r) => {
    const lop = String(r.lop || '').split(/\s+/)[0];
    if (!lop || !r.cha || !r.cha.isConnected) return false;
    const moi = [...r.cha.children].find((x) => x !== e && x.classList.contains(lop));
    if (moi) moi.classList.add('ios-thay-the');
    return !!moi;
  };
  const thay = (e, s) => s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length > 0;   // KHÔNG xét opacity: lúc vừa mở hộp còn đang hiện dần từ 0
  function dong(e, r) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cha = r.cha && r.cha.isConnected ? r.cha : document.body;
    const c = e.cloneNode(true);
    c.className = r.lop; c.removeAttribute('hidden'); c.removeAttribute('style');
    if (r.kieu) c.setAttribute('style', r.kieu);
    c.style.setProperty('display', r.hien, 'important');
    c.setAttribute('aria-hidden', 'true'); c.inert = true;
    const a = e.querySelectorAll('input, textarea, select'), b = c.querySelectorAll('input, textarea, select');
    a.forEach((x, i) => { if (b[i]) { b[i].value = x.value; if ('checked' in x) b[i].checked = x.checked; } });
    const sau = e.isConnected && e.parentNode === cha ? e.nextSibling : (r.ke && r.ke.parentNode === cha ? r.ke : null);
    cha.insertBefore(c, sau);
    const cuonA = [e, ...e.querySelectorAll('*')], cuonB = [c, ...c.querySelectorAll('*')];
    cuonA.forEach((x, i) => { if (x.scrollTop && cuonB[i]) cuonB[i].scrollTop = x.scrollTop; });
    const q = c.getBoundingClientRect();
    if (q.width >= innerWidth * 0.9 && q.height >= innerHeight * 0.9) {
      c.classList.add('ios-bong-dong');                         // nền phủ cả màn: mờ dần
      let hop = null, dt = 0;
      for (const x of c.children) { const k = x.getBoundingClientRect(); if (k.width * k.height > dt && k.width < innerWidth * 0.98) { dt = k.width * k.height; hop = x; } }
      if (hop) hop.classList.add('ios-bong-hop');               // hộp ở giữa: mờ + thu nhẹ
    } else c.classList.add('ios-bong-dong', 'ios-bong-hop');
    let xong = false;
    const go = () => { if (!xong) { xong = true; c.remove(); } };
    c.addEventListener('animationend', (ev) => { if (ev.target === c) go(); });
    setTimeout(go, 320);
  }
  /* CỬA SỔ ĐỤC MỘT MÀU (09/10/2026, anh Hùng: "cửa sổ hiện lên còn lỗi chỗ
   * màu chưa đồng nhất"): thân hộp từng trong 94% nên thẻ/nhãn phía sau lấp ló
   * xuyên qua, mỗi vùng một tông. Mỗi app đặt tên hộp một kiểu → đánh dấu hộp
   * lúc mở (.ios-hop-dac), ios.css tô nền đặc. Lớp phủ kín màn thì hộp là con
   * lớn nhất; lớp nổi nhỏ (danh sách xổ…) đã có nền riêng thì bỏ qua. */
  const NHO = '.ng-pop, .goi-y, .goi-y-ng, .ng-goiy, .pk-panel, .mask, .scrim, .modal-mask, .modal-nen, .ios-nen-so';
  function danhDauHop(e) {
    if (e.matches(NHO)) return;
    const q = e.getBoundingClientRect();
    if (q.width >= innerWidth * 0.9 && q.height >= innerHeight * 0.9) {
      let hop = null, dt = 0;
      for (const x of e.children) { const k = x.getBoundingClientRect(); if (k.width * k.height > dt && k.width < innerWidth * 0.98) { dt = k.width * k.height; hop = x; } }
      if (hop && !hop.matches(NHO)) hop.classList.add('ios-hop-dac');
    } else e.classList.add('ios-hop-dac');
  }
  function quet() {
    document.querySelectorAll(HOP).forEach((e) => {
      if (e.closest('.ios-bong-dong') || (e.parentElement && e.parentElement.closest(HOP))) return;
      const s = getComputedStyle(e);
      if (thay(e, s)) { if (!dangMo.has(e)) danhDauHop(e); dangMo.set(e, { hien: s.display, lop: e.className, kieu: e.getAttribute('style'), cha: e.parentNode, ke: e.nextSibling }); }
      else if (dangMo.has(e)) { const r = dangMo.get(e); dangMo.delete(e); if (s.display === 'none' || e.hidden) dong(e, r); }
    });
    dangMo.forEach((r, e) => { if (!e.isConnected) { dangMo.delete(e); if (!thayThe(e, r)) dong(e, r); } });
  }
  new MutationObserver(() => { try { quet(); } catch (_) {} })
    .observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'style', 'open'] });
})();

/* LĂN CHUỘT CUỘN DẢI NGANG (29/09 — soát toàn diện). Dải tab, hàng nút lọc,
 * hàng chip "Cần xử lý"… giấu thanh cuộn cho gọn như iPhone; trên máy tính dùng
 * chuột thì lăn chỉ đi dọc → phần bị che (Quảng cáo: "Cảnh báo · Doanh thu &
 * ROAS · Kết nối"; OTA "Kênh OTA"…) không cách nào kéo tới. Lăn chuột trên một
 * dải NGANG thấp (không tự cuộn dọc) thì đổi thành cuộn ngang; bảng cao vẫn để
 * lăn dọc cuộn trang như thường. Hết dải thì trả lại cho trang. */
(function () {
  if (document.documentElement.getAttribute('data-skin') !== 'ios') return;
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.shiftKey || innerWidth <= 640 || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    for (let el = e.target; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (/auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2) return;   // gặp khung cuộn dọc trước: để nó
      if (/auto|scroll/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 2 && (el.clientHeight < 140 || s.scrollbarWidth === 'none')) {
        const dau = el.scrollLeft;
        el.scrollLeft += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        if (el.scrollLeft !== dau) e.preventDefault();
        return;
      }
    }
  }, { passive: false, capture: true });
})();

/* NHÃN CHO Ô NHẬP (04/10/2026 — soát WCAG, skill frontend-ui): ô lọc ngày, chiến
 * dịch, trạng thái… nhìn thì có nhãn (chữ đứng trên / trước ô) nhưng nhãn không
 * gắn vào ô, nên trình đọc màn hình chỉ đọc "ô nhập" — 204 chỗ trên 14 màn.
 * Lấy đúng chữ người dùng đang thấy gắn thành aria-label; ô đã có nhãn thì để yên. */
(function () {
  if (document.documentElement.getAttribute('data-skin') !== 'ios') return;
  const O = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit]), select, textarea';
  const gon = (t) => String(t || '').replace(/\s+/g, ' ').replace(/[:*]\s*$/, '').trim().slice(0, 60);
  function nhanCua(o) {
    const nhom = o.closest('.fgroup, .field, .frm-row, .o, .viec-o, .loc-nhom, .md-field, .fld-wrap, .hang, .the-dau, .form-row, .fld');
    if (nhom) {
      const l = [...nhom.children].find((c) => c !== o && !c.contains(o) && /^(LABEL|SPAN|DIV|B|STRONG|SMALL)$/.test(c.tagName) && gon(c.innerText) && gon(c.innerText).length < 50);
      if (l) return gon(l.innerText);
    }
    const dn = o.closest('[data-nhan]');
    if (dn && gon(dn.getAttribute('data-nhan'))) return gon(dn.getAttribute('data-nhan'));
    const truoc = o.previousElementSibling;
    const dau = truoc && !truoc.matches(O) ? gon(String(truoc.innerText || '').split(/ — | – |\(|: /)[0]) : '';
    if (dau && dau.length < 40) return dau;
    // ô trong bảng: tên cột (th cùng vị trí)
    const td = o.closest('td');
    if (td) {
      const bang = td.closest('table'), hang = bang && bang.querySelector('thead tr');
      const th = hang && hang.children[td.cellIndex];
      if (th && gon(th.innerText)) return gon(th.innerText);
    }
    // ô nằm giữa câu ("Lấy trung bình [3] tháng gần nhất"): chữ trần của khối cha
    const cau = gon([...(o.parentElement || {}).childNodes || []].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' '));
    if (cau && cau.length < 60) return cau;
    if (o.tagName === 'SELECT' && o.options[0] && gon(o.options[0].text)) return gon(o.options[0].text);
    if (o.type === 'date') return 'Chọn ngày';
    if (o.type === 'search' || /tim|search|q$/i.test(o.id || '')) return 'Tìm';
    return '';
  }
  function gan() {
    document.querySelectorAll(O).forEach((o) => {
      if (o.getAttribute('aria-label') || o.getAttribute('aria-labelledby') || o.title || o.placeholder || o.closest('label')) return;
      if (o.id && document.querySelector('label[for="' + CSS.escape(o.id) + '"]')) return;
      const t = nhanCua(o);
      if (t) o.setAttribute('aria-label', t);
    });
  }
  let hen = 0;
  const lich = () => { if (!hen) hen = setTimeout(() => { hen = 0; try { gan(); } catch (_) {} }, 300); };
  const bat = () => { gan(); new MutationObserver(lich).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bat); else bat();
})();

/* TIÊU ĐIỂM BÀN PHÍM VỚI CỬA SỔ (04/10/2026 — soát WCAG, skill frontend-ui).
 * Mở cửa sổ mà tiêu điểm vẫn nằm ở trang phía sau: bấm Tab là đi lạc ra sau nền
 * tối, trình đọc màn hình không biết có cửa sổ. Mở → đưa tiêu điểm vào KHUNG cửa
 * sổ (không vào ô nhập đầu: điện thoại sẽ bật bàn phím), đánh dấu role=dialog;
 * đóng → trả tiêu điểm về đúng chỗ cũ (nút đã mở nó). Nút chỉ có biểu tượng ✕ ở
 * đầu cửa sổ thì gắn tên "Đóng" cho trình đọc màn hình. */
(function () {
  if (document.documentElement.getAttribute('data-skin') !== 'ios') return;
  const HOP = '.modal.on, .modal.open, .modal-wrap:not([hidden]):not(.hidden), .drawer.on, .drawer.open, .xt.on, .xt.mo, .md.on, .phu-man, [role="dialog"]:not([hidden])';
  const hien = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  let dangMo = null, truoc = null;
  function xet() {
    const ds = [...document.querySelectorAll(HOP)].filter((e) => hien(e) && !e.closest('.ios-bong-dong') && !(e.parentElement && e.parentElement.closest(HOP)));
    const k = ds[ds.length - 1] || null;
    if (k && k !== dangMo) {
      if (!dangMo) truoc = document.activeElement;
      dangMo = k;
      const hop = k.querySelector(':scope > .modal-box, :scope > .hop, :scope > .md-box, :scope > .xt-box, :scope > .xt-hop, :scope > .modal-hop, :scope > .modal') || k;
      if (!hop.getAttribute('role')) hop.setAttribute('role', 'dialog');
      hop.setAttribute('aria-modal', 'true');
      if (!hop.hasAttribute('aria-label') && !hop.hasAttribute('aria-labelledby')) {
        const td = hop.querySelector('h1, h2, h3, .modal-title, .dr-title, .xt-ten');
        if (td && td.textContent.trim()) hop.setAttribute('aria-label', td.textContent.trim().slice(0, 80));
      }
      if (!hop.contains(document.activeElement)) {
        if (!hop.hasAttribute('tabindex')) hop.setAttribute('tabindex', '-1');
        try { hop.focus({ preventScroll: true }); } catch (_) {}
      }
      hop.querySelectorAll('button, [role="button"]').forEach((b) => {
        if (b.getAttribute('aria-label') || b.title || (b.innerText || '').trim()) return;
        if (b.closest('.modal-head, .drawer-head, .dr-head, .hop-dau, .xt-dau, .md-head') || /(^|[-_ ])(x|close|dong)([-_ ]|$)/i.test(b.className)) b.setAttribute('aria-label', 'Đóng');
      });
    } else if (!k && dangMo) {
      dangMo = null;
      if (truoc && truoc.isConnected && truoc !== document.body) { try { truoc.focus({ preventScroll: true }); } catch (_) {} }
      truoc = null;
    }
  }
  let hen = 0;
  const lich = () => { if (!hen) hen = requestAnimationFrame(() => { hen = 0; try { xet(); } catch (_) {} }); };
  const bat = () => new MutationObserver(lich).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style', 'open'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bat); else bat();
})();

/* NÚT LỌC TRÊN THANH TIÊU ĐỀ ĐIỆN THOẠI (09/10/2026). Anh Hùng: "các tùy chọn
 * lọc thường để mặc định tháng này nên các bộ lọc hiển thị cũng chưa thật sự cần
 * thiết… Bảng công việc thì bỏ lọc luôn". Trên điện thoại thanh lọc của mọi màn
 * ẩn (ios.css · "MÀN ĐIỆN THOẠI GỌN"), nhưng không mất hẳn: một nút phễu cạnh nút
 * làm mới bật/tắt thanh lọc của màn đang xem (lớp ios-hien-loc trên <html> của
 * lớp vỏ hoặc của app con trong iframe). Đang lọc khác "Tháng này" thì nút có
 * chấm xanh — để không ai đọc nhầm số tháng trước là số tháng này. */
(() => {
  if (document.documentElement.getAttribute('data-skin') !== 'ios') return;
  const LOC = '.loc-bar, .filters, .filters-dash, .filters-work, section#filters, .loc-hang, [data-app="khach-hang"] .man > .loc';
  const mq = window.matchMedia('(max-width: 640px)');
  const taiLieu = () => {
    const home = document.getElementById('pageHome');
    if (home && !home.hidden) return document;
    const f = [...document.querySelectorAll('#stage iframe')].find((x) => x.offsetParent && !x.closest('.khung-ngam'));
    try { return f && f.contentDocument; } catch (_) { return null; }
  };
  const khoiLoc = (d) => [...d.querySelectorAll(LOC)].filter((k) =>
    !k.closest('[hidden]') && !(k.closest('[data-app="mat-khau"]') || d.documentElement.getAttribute('data-app') === 'mat-khau'));
  /* Có đang lọc khác mặc định không: mốc thời gian đang chọn không phải "Tháng
   * này", hoặc một ô chọn đã đổi khỏi lựa chọn đầu, hoặc ô tìm có chữ. */
  const khacMacDinh = (ds) => ds.some((k) => {
    const moc = k.querySelector('.seg .on, .seg .chon, .hub-seg .on, .pills .on');
    if (moc && !/^(Tháng này|This month)$/i.test((moc.textContent || '').trim())) return true;
    if ([...k.querySelectorAll('select')].some((s) => s.selectedIndex > 0)) return true;
    return [...k.querySelectorAll('input[type="search"], input[type="text"]')].some((i) => (i.value || '').trim());
  });

  let nut = null;
  function dung() {
    const bar = document.querySelector('.mob-bar');
    const lamMoi = document.getElementById('btnMobLamMoi');
    if (!bar || !lamMoi || nut) return;
    nut = document.createElement('button');
    nut.type = 'button';
    nut.className = 'mob-nut ios-nut-loc';
    nut.setAttribute('aria-label', 'Bộ lọc');
    nut.setAttribute('aria-pressed', 'false');
    nut.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8z"></path></svg><i class="ios-loc-cham" hidden></i>';
    bar.insertBefore(nut, lamMoi);
    nut.addEventListener('click', () => {
      const d = taiLieu();
      if (!d) return;
      const mo = !d.documentElement.classList.contains('ios-hien-loc');
      d.documentElement.classList.toggle('ios-hien-loc', mo);
      nut.setAttribute('aria-pressed', String(mo));
      if (mo) { const k = khoiLoc(d)[0]; if (k) k.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    });
  }
  function xet() {
    if (!mq.matches) { if (nut) nut.hidden = true; return; }
    dung();
    if (!nut) return;
    const d = taiLieu();
    const ds = d ? khoiLoc(d) : [];
    nut.hidden = !ds.length;
    const mo = !!(d && d.documentElement.classList.contains('ios-hien-loc'));
    nut.setAttribute('aria-pressed', String(mo));
    nut.classList.toggle('on', mo);
    nut.querySelector('.ios-loc-cham').hidden = !khacMacDinh(ds);
  }
  const bat = () => { xet(); setInterval(xet, 1200); addEventListener('hashchange', () => setTimeout(xet, 400)); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bat); else bat();
})();

/* CỬA SỔ MỞ THÌ NỀN ĐỨNG YÊN (09/10/2026, anh Hùng: "khi các cửa sổ này hiện
 * lên, việc lăn chuột hay cảm ứng bên dưới không bị ảnh hưởng"). body.bb-chan chỉ
 * khoá <body>, mà vùng cuộn thật là #pageHome / app con / danh sách → cú lăn
 * chuột, cú vuốt vẫn trôi xuống trang nền. Khi có cửa sổ đang mở: chỉ cho cuộn
 * phần tử CUỘN ĐƯỢC nằm trong chính cửa sổ, và chỉ khi nó còn chỗ để cuộn theo
 * hướng đó; mọi trường hợp khác chặn hẳn. */
(() => {
  if (window.__KHOA_CUON__) return; window.__KHOA_CUON__ = true;
  const LOP = '.bb-phu, #modalWrap:not([hidden]), .modal-wrap:not([hidden]):not(.hidden), .modal.on, .modal.open, .drawer.on, .drawer.open, .phu-man, .md.on, .xt.on, .xt.mo, .mask.on, .scrim.open, [role="dialog"][aria-modal="true"]';
  const hien = (e) => !!(e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  const dangMo = () => [...document.querySelectorAll(LOP)].filter(hien);
  const cuonDuoc = (el, dy, dx) => {
    for (let a = el; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (dy && /auto|scroll/.test(s.overflowY) && a.scrollHeight > a.clientHeight + 1) {
        if ((dy < 0 && a.scrollTop > 0) || (dy > 0 && a.scrollTop + a.clientHeight < a.scrollHeight - 1)) return true;
      }
      if (dx && /auto|scroll/.test(s.overflowX) && a.scrollWidth > a.clientWidth + 1) {
        if ((dx < 0 && a.scrollLeft > 0) || (dx > 0 && a.scrollLeft + a.clientWidth < a.scrollWidth - 1)) return true;
      }
    }
    return false;
  };
  const xet = (e, dy, dx) => {
    const ds = dangMo();
    if (!ds.length) return;
    const trong = ds.some((k) => k.contains(e.target));
    if (!trong || !cuonDuoc(e.target, dy, dx)) e.preventDefault();
  };
  addEventListener('wheel', (e) => xet(e, e.deltaY, e.deltaX), { passive: false, capture: true });
  let y0 = 0, x0 = 0;
  addEventListener('touchstart', (e) => { const t = e.touches[0]; y0 = t.clientY; x0 = t.clientX; }, { passive: true, capture: true });
  addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    xet(e, y0 - t.clientY, x0 - t.clientX);
  }, { passive: false, capture: true });
})();

/* THÔNG BÁO KIỂU DYNAMIC ISLAND (09/10/2026). Anh Hùng: bản mừng đầu (vòng tick
 * + pháo giấy) "không phù hợp, chưa hiện đại" → viên đen trồi ra giữa mép trên;
 * rồi "tất cả các thông báo đều đồng bộ dạng đó chưa" → MỌI thông báo của hub
 * và 15 app con đi qua đây, thay ô thông báo riêng của từng app:
 *   ok   tick xanh tự vẽ (đã lưu / đã nộp / thành công…), rung nhẹ trên Android
 *   loi  chấm than đỏ, giữ lâu hơn để kịp đọc
 *   dang vòng xoay (Đang tải lên…), giữ tới khi có thông báo kế
 *   tin  chữ i xanh
 * Câu dài thì viên nở thành hộp bo tròn nhiều dòng. Không chặn bấm.
 * App con gọi lên qua window.__iosDao (ios-app.js); __iosMung giữ cho tương thích. */
(() => {
  if (window.__iosDao) return;
  const LOI_LOP = /(^|\s)(do|err|loi|xau|error|danger)(\s|$)/;
  const OK_LOP = /(^|\s)(luc|ok|xanh|success)(\s|$)/;
  const LOI_CHU = /lỗi|thất bại|không (được|thể|đủ|có quyền|tìm|kết nối|lưu|gửi|tải)|chưa (được|có quyền)|hết hạn|từ chối/i;
  const OK_CHU = /^(đã|xong)(\s|$)|thành công|hoàn tất|hoàn thành/i;
  const IC = {
    ok: '<svg viewBox="0 0 24 24" width="16" height="16"><path class="ve" d="M6 12.5l4 4L18 8.5"/></svg>',
    loi: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 7v6.5"/><circle cx="12" cy="17" r="1.3"/></svg>',
    tin: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="7.6" r="1.3"/><path d="M12 11v6"/></svg>',
    dang: '<i class="ios-dao-xoay"></i>',
  };
  let dang = null, cuoi = '', luc = 0, hen1 = 0, hen2 = 0;
  function phanLoai(chu, lop) {
    if (LOI_LOP.test(lop || '') || LOI_CHU.test(chu)) return 'loi';
    if (/^đang\b/i.test(chu) || /…$|\.\.\.$/.test(chu)) return 'dang';
    if (OK_LOP.test(lop || '') || OK_CHU.test(chu)) return 'ok';
    return 'tin';
  }
  function dao(chu, lop) {
    chu = String(chu || '').replace(/\s+/g, ' ').trim();
    if (!chu) return false;
    const kieu = phanLoai(chu, lop);
    if (chu === cuoi && Date.now() - luc < 600) return true;   // cùng câu bắn hai lần liền
    cuoi = chu; luc = Date.now();
    if (kieu === 'ok') { try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) {} }
    clearTimeout(hen1); clearTimeout(hen2);
    if (dang) { const cu = dang; cu.classList.remove('mo'); cu.classList.add('thu'); setTimeout(() => cu.remove(), 300); }
    const o = document.createElement('div');
    o.className = 'ios-dao ' + kieu + (chu.length > 46 ? ' dai' : '');
    o.setAttribute('role', kieu === 'loi' ? 'alert' : 'status');
    o.innerHTML = '<div class="ios-dao-vien"><span class="ios-dao-tick">' + IC[kieu] + '</span><span class="ios-dao-chu"></span></div>';
    o.querySelector('.ios-dao-chu').textContent = chu;
    document.body.appendChild(o);
    dang = o;
    requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add('mo')));
    const giu = kieu === 'dang' ? 8000 : kieu === 'loi' ? Math.min(7000, 3800 + chu.length * 25)
      : Math.min(5000, 2100 + chu.length * 18);
    hen1 = setTimeout(() => { o.classList.remove('mo'); o.classList.add('thu'); }, giu);
    hen2 = setTimeout(() => { o.remove(); if (dang === o) dang = null; }, giu + 600);
    return true;
  }
  window.__iosDao = dao;
  window.__iosMung = (chu) => dao(chu, 'luc');

  /* Thông báo của chính hub: #toasts > .toast */
  const bat = () => {
    const h = document.getElementById('toasts');
    if (!h) return;
    document.documentElement.classList.add('ios-dao-thay');
    new MutationObserver((ds) => ds.forEach((d) => d.addedNodes.forEach((n) => {
      if (n.nodeType === 1) dao(n.textContent, n.className);
    }))).observe(h, { childList: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bat); else bat();
})();
/* NÚT BẤM KIỂU MỚI (09/10/2026, anh Hùng duyệt ở trang thử hiệu ứng): nhấn thì
 * thu nhỏ nhẹ + tối nhẹ, thả ra nảy về bằng lò xo; nút chính có gợn sáng toả từ
 * chỗ chạm. Dùng thuộc tính `scale` riêng (không đụng `transform`) nên nút canh
 * giữa bằng transform không dịch chỗ — lỗi làm bản co/nảy cũ bị bỏ. Gắn lớp
 * bằng pointerdown, giữ tối thiểu 140ms để chạm nhanh trên điện thoại vẫn thấy.
 * Vật to (thẻ, ô rộng) co ít hơn để không "nhảy". Có cùng bản ở ios.js / ios-app.js. */
(() => {
  if (window.__iosNhan) return;
  window.__iosNhan = true;
  const NUT = '.btn, button, [role="button"], .tab, .pill, .tb-chip, .cxl-chip, .cd-item, .ios-tabbar > *, .mob-nut, .ios-tao, .rail-item, ' +
    '.card.bam-duoc, .wcard, .ord-card, .dcard, .nhom-base .the.bam-duoc, .tile, .tb-o, .theDay, .lt-the, a.btn, label.btn';
  const CHINH = '.btn.primary, .btn-primary, .btn.chinh, button.primary, .ios-tao';
  const BO = 'input, textarea, select, [contenteditable], .ios-dao, [data-khong-nhan], .ios-lens';
  const anim = (e) => { e.classList.remove('ios-tha'); void e.offsetWidth; };
  addEventListener('pointerdown', (ev) => {
    if (ev.button > 0) return;
    const t = ev.target;
    if (!t || !t.closest || t.closest(BO)) return;
    const e = t.closest(NUT);
    if (!e || e.disabled || e.getAttribute('aria-disabled') === 'true') return;
    const r = e.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const to = Math.max(r.width, r.height);
    e.style.setProperty('--ios-nhan-s', to > 320 ? '.985' : to > 160 ? '.97' : '.955');
    anim(e);
    e.classList.add('ios-nhan');
    if (e.matches(CHINH)) {
      /* Gợn sáng là một lớp phủ cố định đúng khung nút (bo theo góc nút), không
       * phải ảnh nền: nền gradient của nút chính đè mất ảnh nền, còn phần tử con
       * hay overflow:hidden thì làm lệch/cắt huy hiệu. */
      const s = getComputedStyle(e), g = document.createElement('div');
      g.className = 'ios-gon';
      g.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border-radius:' + s.borderRadius +
        ';--ios-gon-x:' + (ev.clientX - r.left) + 'px;--ios-gon-y:' + (ev.clientY - r.top) + 'px';
      document.body.appendChild(g);
      setTimeout(() => g.remove(), 650);
    }
    const t0 = Date.now();
    const tha = () => {
      removeEventListener('pointerup', tha, true); removeEventListener('pointercancel', tha, true);
      setTimeout(() => {
        e.classList.remove('ios-nhan'); e.classList.add('ios-tha');
        setTimeout(() => e.classList.remove('ios-tha'), 560);
      }, Math.max(0, 140 - (Date.now() - t0)));
    };
    addEventListener('pointerup', tha, true); addEventListener('pointercancel', tha, true);
  }, { capture: true, passive: true });
})();

/* Ô tick / nút chọn đổi trạng thái → nảy nhẹ (.cd-tich, hệ chuyển động chung). */
(() => {
  if (window.__cdTich) return;
  window.__cdTich = true;
  addEventListener('change', (ev) => {
    const e = ev.target;
    if (!e || e.tagName !== 'INPUT' || (e.type !== 'checkbox' && e.type !== 'radio')) return;
    e.classList.remove('cd-tich'); void e.offsetWidth; e.classList.add('cd-tich');
    setTimeout(() => e.classList.remove('cd-tich'), 360);
  }, true);
})();
