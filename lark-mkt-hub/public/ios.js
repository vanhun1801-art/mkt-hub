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
        lop.style.transition = 'opacity .18s ease';
        lop.style.opacity = '0';
        lop.style.pointerEvents = 'none';
        setTimeout(go, 200);
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
    $('.ios-av', hoso).textContent = t.split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();
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
        let ngay = x.dataset.n;
        if (!ngay && goc) { const d = new Date(goc); d.setDate(goc.getDate() + (i - moc)); ngay = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
        x.dataset.ngay = ngay ? String(+ngay.slice(8)) : '';
        if (ngay === khoaNay) { x.classList.add('ios-nay'); iNay = i; }
      });
      dai.dataset.ios = '1';
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

  let hen = 0;
  const lich = () => { if (hen) return; hen = requestAnimationFrame(() => { hen = 0; mepHet(); lensHet(); }); };
  lich();
  new MutationObserver(lich).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-current', 'aria-selected', 'hidden'] });
})();
