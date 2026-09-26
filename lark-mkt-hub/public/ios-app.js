/* Lớp giao diện iOS — phần chạy TRONG app con (proxy.js chèn vào mọi app).
 *
 * Việc duy nhất: gỡ emoji khỏi phần KHUNG giao diện. Anh Hùng không dùng
 * emoji trong giao diện (xem mkt-hub-app); lượt quét 25/09/2026 vẫn thấy sót ở
 * Sản phẩm ("⏳ Sắp đổi", ô loại 🆕🔄🔥🟢🔵) và OTA ("📞" trước số điện thoại).
 *
 * KHÔNG đụng dữ liệu thật: tên người ("Nguyễn Minh Tiến 📸"), tiêu đề bài đăng
 * trong bảng, nội dung ô — chỉ xét chữ nằm trong tiêu đề, nút, nhãn, tab, và
 * chỉ gỡ emoji ĐỨNG ĐẦU. Nút mang tiêu đề bài đăng (.link-btn của Quảng cáo)
 * là dữ liệu nên bị loại trừ.
 *
 * Ô loại sản phẩm (.tangIcon) chỉ có đúng một emoji làm biểu tượng → đổi thành
 * chấm màu cùng nghĩa, để không mất thông tin. */
(function () {
  if (document.documentElement.getAttribute('data-skin') !== 'ios') return;

  const EMOJI_DAU = /^\s*(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}‍️⃣])+\s*/u;
  const KHUNG = 'h1,h2,h3,h4,h5,label,th,legend,summary,.btn:not(.link-btn),button:not(.link-btn),.tab,.pill,'
    + '.sec-title,.section-title,.kpi-label,.lbl,.nhan,.sdDau,.manh,.dash-head,.lane-head,.queue-title,.chip,.tag,.badge';
  const MAU = { '🆕': 'xanh', '🔄': 'cam', '🔥': 'do', '🟢': 'luc', '🔵': 'xanh', '⏳': 'cam', '⚠️': 'cam', '⚠': 'cam' };

  function donMot(goc) {
    // chấm màu thay cho ô biểu tượng loại
    goc.querySelectorAll('.tangIcon:not([data-ios-cham])').forEach((o) => {
      const e = (o.textContent || '').trim();
      o.setAttribute('data-ios-cham', MAU[e] || 'xam');
      o.setAttribute('title', o.getAttribute('title') || '');
      o.textContent = '';
    });
    // emoji đứng đầu trong chữ của khung giao diện
    const w = document.createTreeWalker(goc, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!EMOJI_DAU.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || !p.closest(KHUNG) || p.closest('.link-btn, td, [contenteditable]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const ds = [];
    let n; while ((n = w.nextNode())) ds.push(n);
    /* Tách phần emoji ra một nút chữ riêng rồi bỏ nút đó, thay vì sửa nodeValue:
     * i18n.js (tiếng Anh) nhớ chữ gốc theo TỪNG NÚT và dịch lại từ chữ gốc mỗi
     * khi nút đổi — sửa tại chỗ thì nó đặt lại emoji. Nút còn lại là nút mới. */
    ds.forEach((t) => {
      const m = EMOJI_DAU.exec(t.nodeValue);
      if (!m || !t.parentNode) return;
      if (m[0].length >= t.nodeValue.length) { t.nodeValue = ''; return; }
      t.splitText(m[0].length);
      t.remove();
    });
  }

  /* ---- Nút TẠO MỚI: cùng một chỗ, cùng một dáng ở mọi app ----
   * Anh Hùng: "đừng làm cho người dùng trong cùng một ứng dụng mà các nút hành
   * động quá khác xa nhau, như nút Đăng ký lịch tác nghiệp và Tạo công việc mới".
   * Đo 12 app: "+ Công việc" ở góc phải thanh công cụ; "+ Đăng ký lịch" lọt giữa
   * thanh; "+ Nhập booking OTA" kẹp giữa các nút khác; "Tạo hợp tác" của KOL
   * nằm tuốt dưới các ô số. Chuẩn chung: góc PHẢI thanh công cụ, nút cuối cùng,
   * dấu + vẽ bằng CSS (.ios-tao::before) thay cho chữ "+" gõ tay mỗi app một kiểu.
   *
   * Nút đã nằm trên thanh công cụ thì chỉ đánh dấu (CSS đẩy xuống cuối). Nút
   * nằm trong thân trang (KOL) thì KHÔNG bê đi — app bắt sự kiện bằng uỷ quyền
   * trên vùng nội dung (man.onclick xét ev.target.id), bê ra ngoài là nút chết.
   * Thay vào đó dựng một nút đại diện trên thanh công cụ, bấm thì bấm hộ nút gốc;
   * nút đại diện chỉ hiện khi nút gốc đang có trên màn. */
  const TAO_TEN = /^\s*(\+\s*|Tạo |Thêm |Khai khoản|Đăng ký lịch|Nhập booking)/;
  const TAO_TRONG_THAN = ['#taoHt', '#kolMoi'];   // KOL: Tạo hợp tác, Thêm KOL
  function nutTao() {
    const tb = document.querySelector('header.topbar, .topbar');
    if (!tb) return;
    tb.querySelectorAll('.btn.primary, .btn-primary, .btn.chinh').forEach((b) => {
      if (!b.classList.contains('ios-tao')) {
        if (!TAO_TEN.test(b.textContent || '')) return;
        b.classList.add('ios-tao');
      }
      /* Chữ đã có dấu "+" gõ sẵn ("+ Công việc", "+ Task") thì KHÔNG vẽ thêm dấu
       * bằng CSS; chữ chưa có ("Khai khoản chi", "Tạo hợp tác") thì CSS vẽ.
       * KHÔNG sửa chữ của nút: i18n.js nhớ chữ gốc từng nút và dịch lại từ chữ
       * gốc mỗi khi chữ đổi — gỡ dấu "+" là hai bên giành nhau, bản tiếng Anh
       * đã ra "+ + Task". Đánh dấu bằng thuộc tính thì không ai phải giành. */
      const coCong = /^\s*\+/.test(b.textContent || '');
      if (coCong !== b.hasAttribute('data-ios-co-cong')) b.toggleAttribute('data-ios-co-cong', coCong);
    });
    TAO_TRONG_THAN.forEach((sel) => {
      const goc = document.querySelector(sel);
      let dd = tb.querySelector('[data-ios-dai-dien="' + sel + '"]');
      if (goc && !goc.closest('.topbar')) {
        if (!dd) {
          dd = document.createElement('button');
          dd.type = 'button';
          dd.className = 'btn chinh ios-tao ios-dai-dien';
          dd.setAttribute('data-ios-dai-dien', sel);
          dd.addEventListener('click', () => { const g = document.querySelector(sel); if (g) g.click(); });
          tb.appendChild(dd);
        }
        const chu = (goc.textContent || '').replace(/^\s*\+\s*/, '').trim();
        // chỉ đặt chữ khi chữ GỐC đổi — so với chữ đang hiện thì ở tiếng Anh sẽ
        // giành nhau với i18n.js (nó dịch đi, mình đặt lại, nó dịch đi… mãi)
        if (dd.dataset.goc !== chu) { dd.dataset.goc = chu; dd.textContent = chu; }
        dd.hidden = false;
        goc.classList.add('ios-goc-an');
      } else if (dd) dd.hidden = true;
    });
  }

  /* Chip nguồn số (Quảng cáo): còn mỗi chấm; khi có kênh lỗi app chèn
   * "· Google Ads LỖI" → chấm đỏ + chữ "Google Ads lỗi" (bỏ dấu · thừa ở đầu,
   * bỏ viết hoa cả chữ). */
  function chipNguon() {
    document.querySelectorAll('.btn.src').forEach((b) => {
      const l = b.querySelector('.loi');
      if (l) {
        b.setAttribute('data-ios-loi', '');
        const m = (l.textContent || '').replace(/^\s*·\s*/, '').replace(/\s*LỖI\s*$/, ' lỗi');
        if (l.textContent !== m) l.textContent = m;
      } else b.removeAttribute('data-ios-loi');
    });
  }

  /* Dải tab trượt ngang (điện thoại, hoặc app nhiều tab): tab ĐANG CHỌN luôn
   * nằm trong tầm nhìn. Đo được: bấm sang Kanban rồi quay về Tổng quan thì dải
   * vẫn giữ chỗ cuộn cũ, tab "Tổng quan" đang sáng nằm khuất ngoài mép trái.
   * Chỉ chỉnh scrollLeft của chính dải (không scrollIntoView — cái đó kéo cả
   * trang theo chiều dọc). */
  /* Chỉ canh khi tab đang chọn ĐỔI (hoặc lần đầu thấy dải này) — app vẽ lại
   * số liệu mỗi 20–60 giây, canh mỗi lần là giật dải về khi người dùng đang tự
   * vuốt xem các tab khác. */
  const tabCu = new WeakMap();
  function tabTrongTam() {
    document.querySelectorAll('.topbar .tabs, .tabsbar .tabs, .thanh .tabs, .topbar > .pills').forEach((d) => {
      if (d.scrollWidth <= d.clientWidth + 1) return;
      const on = d.querySelector(':scope > .on, :scope > .is-active, :scope > .chon');
      if (!on) return;
      const khoa = (on.dataset.tab || on.dataset.man || on.textContent || '').trim();
      if (tabCu.get(d) === khoa) return;
      tabCu.set(d, khoa);
      // toạ độ theo khung nhìn rồi quy về hệ của dải (offsetLeft sai khi dải tự là offsetParent)
      const rd = d.getBoundingClientRect(), ro = on.getBoundingClientRect();
      const trai = ro.left - rd.left + d.scrollLeft, phai = trai + ro.width;
      const lo = d.scrollLeft, hi = d.scrollLeft + d.clientWidth;
      if (trai < lo + 4) d.scrollLeft = Math.max(0, trai - 12);
      else if (phai > hi - 4) d.scrollLeft = phai - d.clientWidth + 12;
    });
  }


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
    document.querySelectorAll('body *').forEach((e) => {
      if (e.clientHeight < vh * 0.5 || e.scrollHeight <= e.clientHeight + 4) return;
      if (!/auto|scroll/.test(getComputedStyle(e).overflowY)) return;
      const s = e.clientWidth * e.clientHeight;
      if (s > dt) { tot = e; dt = s; }
    });
    cu.forEach((e) => { if (e !== tot) e.classList.remove('ios-cuon-day'); });
    if (tot && !tot.classList.contains('ios-cuon-day')) tot.classList.add('ios-cuon-day');
  }
  const henCuon = () => { clearTimeout(cuonHen); cuonHen = setTimeout(cuonDay, 350); };
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
  document.addEventListener('click', henCuon, true);
  setTimeout(cuonDay, 1200); setTimeout(cuonDay, 4000);

  let hen = 0;
  const lich = () => { if (hen) return; hen = requestAnimationFrame(() => { hen = 0; try { donMot(document.body); nutTao(); chipNguon(); tabTrongTam(); mepHet(); lensHet(); henCuon(); } catch (_) {} }); };
  const batDau = () => {
    lich();
    new MutationObserver(lich).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'aria-current', 'aria-selected', 'hidden'] });
    // đổi tab nhiều app chỉ đổi lớp .on (không đổi DOM) — nghe cả cú bấm
    document.addEventListener('click', (e) => { if (e.target.closest('.tabs, .pills')) requestAnimationFrame(tabTrongTam); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', batDau);
  else batDau();
})();
