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
  const MEP = '.topbar .tabs, .tabsbar .tabs, .thanh .tabs, .topbar > .pills, .filters, .filters-dash, .filters-work, .cal-filters, .loc-bar, .cd-nav, .tb-chips, .filters .fgroup > .pills, .filters .fgroup > .seg';
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
    /* MỌI vùng cuộn chạm đáy màn (không chỉ vùng lớn nhất): app có vùng cuộn thứ
     * hai (bảng tự cuộn, khung con) thì mục cuối của nó từng nằm dưới thanh tab
     * — "Nộp báo cáo" của Báo cáo, ô chấm KPI, dòng cuối bảng Công việc. */
    const vh = innerHeight;
    const can = new Set();
    const de = document.scrollingElement || document.documentElement;
    if (de.scrollHeight > de.clientHeight + 4) can.add(document.body);
    /* app cuộn bằng chính <body> (Lịch tác nghiệp: html cao đúng màn, body tự
     * cuộn) — "body *" không gồm body nên từng bỏ sót */
    const bs = getComputedStyle(document.body);
    if (document.body.scrollHeight > document.body.clientHeight + 4 && /auto|scroll/.test(bs.overflowY)) can.add(document.body);
    document.querySelectorAll('body *').forEach((e) => {
      if (e.clientHeight < 160 || e.scrollHeight <= e.clientHeight + 4 || !e.getClientRects().length) return;
      if (!/auto|scroll/.test(getComputedStyle(e).overflowY)) return;
      if (e.closest('.drawer, .modal, .modal-wrap, .phu-man, #so, .dd-panel, .pk-panel')) return;
      const b = e.getBoundingClientRect();
      if (b.bottom < vh - 110) return;          // vùng cuộn không chạm vùng thanh tab
      can.add(e);
    });
    cu.forEach((e) => { if (!can.has(e)) e.classList.remove('ios-cuon-day'); });
    can.forEach((e) => { if (!e.classList.contains('ios-cuon-day')) e.classList.add('ios-cuon-day'); });
  }
  /* Điều tiết (throttle), KHÔNG dồn (debounce): app vẽ lại liên tục (Bảng công
   * việc) thì kiểu "chờ yên 350ms" không bao giờ tới lượt chạy — vùng cuộn của
   * tab mới không được chừa đáy, dòng cuối nằm dưới thanh tab. */
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
  document.addEventListener('click', henCuon, true);
  setTimeout(cuonDay, 1200); setTimeout(cuonDay, 4000);


  /* CỘT NỘI DUNG (desktop): đo mép trái/phải thật của các thẻ nội dung rồi
   * đặt --cot-trai / --cot-phai lên <html>. CSS dùng hai số này để thanh đầu
   * (dải tab, cụm nút), thanh lọc và băng cảnh báo thẳng đúng mép cột — trước
   * đó dải tab bắt đầu ở 16–28px trong khi thẻ bắt đầu ở 71px, nút cuối kết
   * thúc ở 1642px trong khi thẻ dừng ở 1591px ("lệch"). */
  const BO_COT = '.topbar, .tabsbar, header, #filters, #bangKenhLoi, .ios-lens, script, style';
  function doCot() {
    const html = document.documentElement;
    if (innerWidth <= 640) { html.style.removeProperty('--cot-trai'); html.style.removeProperty('--cot-phai'); return; }
    const vw = html.clientWidth;
    const goc = document.querySelector('main') || document.body;
    let L = Infinity, R = -Infinity;
    goc.querySelectorAll(':scope > *, :scope > * > *, :scope > * > * > *').forEach((e) => {
      if (e.closest(BO_COT)) return;
      const b = e.getBoundingClientRect();
      // ≥20% bề ngang: cột phải của bố cục hai cột (Chỉnh ảnh ~32%) cũng tính — ngưỡng 40% từng bỏ sót, mép phải đo thành 936px
      if (b.width < vw * 0.2 || b.height < 24 || b.left < 1 || b.right > vw - 1) return;
      const s = getComputedStyle(e);
      const coNen = (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') || s.boxShadow !== 'none';
      if (!coNen) return;
      L = Math.min(L, b.left); R = Math.max(R, b.right);
    });
    if (!isFinite(L)) return;
    const tr = Math.round(L) + 'px', ph = Math.round(vw - R) + 'px';
    if (html.style.getPropertyValue('--cot-trai') !== tr) html.style.setProperty('--cot-trai', tr);
    if (html.style.getPropertyValue('--cot-phai') !== ph) html.style.setProperty('--cot-phai', ph);
  }
  let cotHen = 0;
  const henCot = () => { clearTimeout(cotHen); cotHen = setTimeout(doCot, 250); };
  addEventListener('resize', henCot);
  addEventListener('load', henCot);
  [800, 2500, 6000].forEach((t) => setTimeout(doCot, t));
  // nội dung thật thay khung xương, bảng/biểu đồ nở ra… → đo lại
  try {
    const ro = new ResizeObserver(henCot);
    const gan = () => { const g = document.querySelector('main') || document.body; if (g) ro.observe(g); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', gan); else gan();
  } catch (_) {}

  let hen = 0;
  const lich = () => { if (hen) return; hen = requestAnimationFrame(() => { hen = 0; try { donMot(document.body); nutTao(); chipNguon(); tabTrongTam(); mepHet(); lensHet(); henCuon(); henCot(); nenSo(); xoaLoc(); nutTheoChu(); ganAnh(); baoChe(); } catch (_) {} }); };

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
  /* Báo lớp vỏ: khung xương CỦA CHÍNH APP (bản chụp màn thật / khung dựng sẵn)
   * đã vẽ xong → lớp vỏ gỡ lớp chờ ngay. Lớp chờ của lớp vỏ không biết app trông
   * thế nào (nó vẽ "ô icon + tiêu đề + 2 nút" trong khi app là dải tab…), để nó
   * che tới lúc có dữ liệu là người dùng thấy một hình SAI rồi mới tới hình đúng. */
  /* DẢI TAB LÊN CÙNG HÀNG với cụm nút (Quảng cáo, OTA, Social, KPI): các app
   * này để dải tab trong <div class="tabsbar"> — một hàng RIÊNG dưới thanh đầu,
   * nên cụm nút (Mục tiêu, Xuất CSV…) lơ lửng một hàng trống phía trên. Chuyển
   * đúng phần tử #tabs lên đầu thanh đầu: app vẫn tìm nó bằng id nên không gãy. */
  /* VAI TRÒ: lớp vỏ cho biết người đang xem có phải QUẢN LÝ base này không
   * (window.__HUB__.quanLy — gồm cả Lead; "xem như" nhân viên thì false). Gắn cờ
   * lên <html> để CSS ẩn những thứ nhân viên không dùng được: tab cấu hình, nút
   * đặt mục tiêu, dòng lỗi kỹ thuật (token, JSON của lark-cli). */
  try {
    if (window.__HUB__ && window.__HUB__.quanLy === false) document.documentElement.classList.add('ios-nhan-vien');
  } catch (_) {}
  /* Ngăn Sổ (Báo cáo, Sản phẩm) nay nổi giữa màn trên máy tính → cần nền mờ
   * phía sau; bấm nền = bấm nút ✕ (#soDong) của chính app, không tự đóng kiểu
   * khác để app giữ đúng trạng thái của nó. */
  function nenSo() {
    const so = document.getElementById('so');
    if (!so) return;
    let nen = document.querySelector('.ios-nen-so');
    if (!nen) {
      nen = document.createElement('div'); nen.className = 'ios-nen-so';
      nen.addEventListener('click', () => { const d = document.getElementById('soDong'); if (d) d.click(); });
      document.body.appendChild(nen);
    }
    const mo = document.body.classList.contains('so-mo') || so.classList.contains('mo');
    nen.classList.toggle('hien', mo);
  }
  /* XOÁ LỌC — một tên, một dáng ở mọi app. Nút đặt lại bộ lọc mỗi app một chữ
   * ("Xoá lọc", "Bỏ lọc", "Bỏ lọc") và một kiểu (nút xám, nút trắng, chữ trần).
   * Gắn .ios-xoa-loc (CSS: chữ xanh trần); ở tiếng Việt đổi chữ về "Xoá lọc" —
   * tách nút chữ riêng rồi thay, như donMot(), để i18n.js vẫn dịch đúng. */
  const XOA_LOC = '#dClear, #wClear, #fReset, #oClear, #calClear, #btnBoLoc, #btnClearFilter, #btnClear, #btnXoaLoc, #boLoc, #xoaLoc';
  function xoaLoc() {
    document.querySelectorAll(XOA_LOC).forEach((b) => {
      b.classList.add('ios-xoa-loc');
      if (!/^vi/.test(document.documentElement.lang || 'vi')) return;
      const t = [...b.childNodes].find((n) => n.nodeType === 3 && /Bỏ lọc/.test(n.nodeValue));
      if (t) t.nodeValue = t.nodeValue.replace('Bỏ lọc', 'Xoá lọc');
    });
  }
  /* Nút nguy hiểm theo CHỮ — app nào cũng có nút "Xoá" nhưng lớp CSS mỗi app
   * một kiểu (btn-danger, btn do, btn small ghost…). Và nút ✕ gỡ một dòng. */
  function nutTheoChu() {
    document.querySelectorAll('.btn, button.btn').forEach((b) => {
      if (b.closest('.topbar .tabs, .pk-chip, .chip, .modal-x')) return;
      const t = (b.textContent || '').trim();
      const nguy = /^(Xoá|Xóa)(?! lọc)/.test(t) || /^(Huỷ lịch|Hủy lịch)$/.test(t);
      if (nguy !== b.classList.contains('ios-nguy')) b.classList.toggle('ios-nguy', nguy);
      const x = /^[✕×]$/.test(t) && !b.closest('.topbar, .dr-head, .drawer-head, .so-dau, .modal-head, .md-head');
      if (x !== b.classList.contains('ios-nut-x')) b.classList.toggle('ios-nut-x', x);
    });
  }

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
      if (e.dataset.iosAnh === '1') return;
      const u = tenCuaAv(e);
      if (!u) return;
      e.dataset.iosAnh = '1';
      e.style.backgroundImage = 'url("' + u.replace(/"/g, '%22') + '")';
      e.classList.add('ios-co-anh');
    });
  }

  /* GIỮ CHỖ CUỘN NGANG khi app vẽ lại dải (bấm chip lọc → app dựng lại cả hàng
   * lọc bằng innerHTML → hàng mới cuộn về đầu → chip vừa bấm nhảy khỏi chỗ).
   * Nhớ scrollLeft theo "khoá" của dải (id hoặc lớp + vị trí trong trang), dải
   * mới cùng khoá thì trả lại đúng chỗ ngay nhịp vẽ đầu tiên. */
  const CUON_NGANG = '.topbar .tabs, .tabsbar .tabs, .topbar > .pills, .filters, .filters-dash, .filters-work, .cal-filters, .loc, .loc-hang, .cxl-loc, .fgroup > .pills, .fgroup > .seg';
  const choCuon = new Map();
  const khoaCuon = (d) => (d.id || '') + '|' + String(d.className).replace(/\s*(ios-\S+|on|tg-dong)/g, '') + '|' + (d.parentElement ? (d.parentElement.id || d.parentElement.className) : '');
  document.addEventListener('scroll', (e) => {
    const d = e.target;
    if (d && d.matches && d.matches(CUON_NGANG)) { choCuon.set(khoaCuon(d), d.scrollLeft); d.__iosDaGiu = true; }
  }, { capture: true, passive: true });
  function giuCuon() {
    document.querySelectorAll(CUON_NGANG).forEach((d) => {
      if (d.__iosDaGiu) return;
      d.__iosDaGiu = true;
      const x = choCuon.get(khoaCuon(d));
      if (x && d.scrollLeft < 2) d.scrollLeft = x;
    });
  }
  /* Cửa sổ bất kỳ đang mở (ngăn chi tiết, hộp thoại, Sổ…) → báo lớp vỏ làm tối
   * + mờ cả thanh menu và thanh đầu (__HUB__.che). App nào đã tự gọi thì gọi lại
   * cũng vô hại — chỉ gửi khi trạng thái đổi. */
  const CUA_SO = '.drawer.on, .drawer.open, .modal.on, .modal.open, .modal-wrap:not([hidden]):not(.hidden), .md.on, .md.open, .xt.on, .xt.mo, #so.mo, body.so-mo #so, .modal-mask.on, .scrim.open, .mask.on, [role="dialog"]:not([hidden])';
  let daChe = false;
  function baoChe() {
    let mo = false;
    document.querySelectorAll(CUA_SO).forEach((e) => { if (!mo && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.05) mo = true; });
    if (mo === daChe) return;
    daChe = mo;
    try { if (window.__HUB__ && window.__HUB__.che) window.__HUB__.che(mo); } catch (_) {}
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
    try { kiemKet(); } catch (_) {}
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
  /* KẸT CUỘN (27/09): app khoá cuộn ở body (Công việc) mà một khung quên khai
   * vùng cuộn → nội dung dưới đáy màn không bao giờ tới được (tab "Việc đã
   * order"). Chỉ xét khi khung nhìn không cuộn được — app cuộn bằng trang thì
   * thoát ngay, không tốn gì. Thẻ bo góc (overflow hidden) không tính là kẹt. */
  function kiemKet() {
    const d = document.documentElement, b = document.body;
    const hv = getComputedStyle(d).overflowY, bv = getComputedStyle(b).overflowY;
    const vp = hv === 'visible' ? bv : hv;
    if (!/hidden|clip/.test(vp) && d.scrollHeight > innerHeight + 2) return;
    if (hv !== 'visible' && /auto|scroll/.test(bv) && b.scrollHeight > b.clientHeight + 2) return;
    let dem = 0;
    for (const e of b.querySelectorAll('*')) {
      if (++dem > 4000) return;
      const r = e.getBoundingClientRect();
      if (r.top <= innerHeight + 4 || r.height < 5 || r.width < 5 || !e.offsetParent) continue;
      let a = e.parentElement, ok = false;
      while (a && a !== b) {
        const s = getComputedStyle(a);
        if (s.position === 'fixed') { ok = true; break; }
        if (/auto|scroll/.test(s.overflowY) && a.scrollHeight > a.clientHeight + 2) { ok = true; break; }
        if (/hidden|clip/.test(s.overflowY) && r.top >= a.getBoundingClientRect().bottom - 1) { ok = true; break; }
        a = a.parentElement;
      }
      if (ok) continue;
      const k = e.closest('[id]');
      baoLoi('ket-cuon', 'Nội dung dưới đáy màn không cuộn tới được', k ? '#' + k.id : e.tagName.toLowerCase());
      return;
    }
  }
  let henTran = 0;
  const henKiemTran = () => { clearTimeout(henTran); henTran = setTimeout(kiemTran, 1500); };
  addEventListener('load', () => setTimeout(kiemTran, 5000));
  addEventListener('resize', henKiemTran);
  document.addEventListener('click', henKiemTran, true);

  /* THANH ĐẦU KIỂU iOS (27/09): anh Hùng thấy trên điện thoại khu vực trên cùng
   * "màu khác, không liền mạch" — thanh đầu phủ kính trắng + saturate làm vệt
   * xanh của nền đậm lên, cộng đường kẻ dưới → hai mảng. iOS làm: ở đỉnh trang
   * thanh đầu TRONG SUỐT, liền với nền; chỉ khi nội dung cuộn chui xuống dưới
   * nó mới hiện kính mờ + đường kẻ. html.ios-dau-noi = "đang có nội dung dưới
   * thanh đầu"; ios.css đọc lớp này. */
  let dauCuon = null;
  const datDau = (v) => document.documentElement.classList.toggle('ios-dau-noi', !!v);
  document.addEventListener('scroll', (e) => {
    const tb = document.querySelector('body > header.topbar');
    if (!tb) return;
    const t = e.target === document ? document.scrollingElement : e.target;
    if (!t || !t.getBoundingClientRect || t.clientHeight < 200) return;
    if (t !== document.scrollingElement && t !== document.body && t.getBoundingClientRect().top > tb.getBoundingClientRect().bottom + 60) return;
    dauCuon = t; datDau(t.scrollTop > 2);
  }, { capture: true, passive: true });
  // đổi tab: vùng cuộn cũ có thể đã ẩn, vùng mới đang ở đỉnh
  document.addEventListener('click', () => setTimeout(() => {
    if (dauCuon && (!dauCuon.isConnected || (dauCuon !== document.scrollingElement && !dauCuon.offsetParent) || dauCuon.scrollTop <= 2)) datDau(false);
  }, 350), true);

  function gopTab() {
    const tb = document.querySelector('body > header.topbar');
    const bar = document.querySelector('body > .tabsbar');
    if (!tb || !bar) return;
    const tabs = bar.querySelector(':scope > .tabs');
    if (!tabs) return;
    tb.insertBefore(tabs, tb.firstChild);
    bar.classList.add('ios-tabsbar-rong');
    document.documentElement.classList.add('ios-gop-tab');
  }
  const baoKhungSan = () => { try { if (parent !== window) parent.postMessage({ ios: 'khung-san' }, location.origin); } catch (_) {} };
  const batDau = () => {
    gopTab();
    lich();
    caiHienHinh();
    requestAnimationFrame(() => requestAnimationFrame(baoKhungSan));
    new MutationObserver(() => { try { giuCuon(); } catch (_) {} lich(); }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'aria-current', 'aria-selected', 'hidden'] });
    // đổi tab nhiều app chỉ đổi lớp .on (không đổi DOM) — nghe cả cú bấm
    /* Anh Hùng 27/09: "bấm xong thì nhảy giao diện tại chính cái nút — hãy giữ
     * nguyên cái mình vừa chạm". Tab vừa bấm vốn đang nằm dưới ngón tay nên
     * KHÔNG cuộn dải theo nó nữa; chỉ ghi nhận là tab đang chọn để lần vẽ lại sau
     * không tưởng tab đổi rồi kéo dải đi. */
    document.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('.tabs > *, .pills > *');
      if (!t) return;
      const d = t.parentElement;
      tabCu.set(d, (t.dataset.tab || t.dataset.man || t.textContent || '').trim());
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', batDau);
  else batDau();
})();
