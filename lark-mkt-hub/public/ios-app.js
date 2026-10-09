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
      if (e.closest('.drawer, .modal, .modal-wrap, .phu-man, .dd-panel, .pk-panel')) return;   // Sổ (Báo cáo, Sản phẩm) là ngăn trong trang: vẫn chừa đáy dưới thanh tab
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
    /* Cột nội dung không trải tới mép phải (bên phải còn một cột thật, VD sổ
     * chi tiết của Báo cáo mở ra): thanh đầu vẫn trải cả hai cột → mép phải
     * lấy bằng mép trái. Trước đó đo ra 500px → dải tab bị ép, cắt chữ. */
    const ph0 = goc.getBoundingClientRect().right < vw - 40 ? L : vw - R;
    const tr = Math.round(L) + 'px', ph = Math.round(ph0) + 'px';
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
  const lich = () => { if (hen) return; hen = requestAnimationFrame(() => { hen = 0; try { donMot(document.body); nutTao(); chipNguon(); tabTrongTam(); mepHet(); lensHet(); henCuon(); henCot(); xoaLoc(); nutTheoChu(); ganAnh(); baoChe(); vuaPanel(); } catch (_) {} }); };

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
      if (e.dataset.iosAnh === '1' && e.classList.contains('ios-co-anh')) return;   // bị vẽ lại mất lớp ảnh thì gắn lại
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
  const khoaCuon = (d) => (d.id || '') + '|' + String(d.className).replace(/\s*(ios-\S+|on|tg-dong)\b/g, '') + '|' + (d.parentElement ? (d.parentElement.id || d.parentElement.className) : '');
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
  const CUA_SO = '.drawer.on, .drawer.open, .phu-man, .hop-nen, .modal.on, .modal.open, .modal-wrap:not([hidden]):not(.hidden), .md.on, .md.open, .xt.on, .xt.mo, .modal-mask.on, .scrim.open, .mask.on, [role="dialog"]:not([hidden])';
  let daChe = false;
  /* DANH SÁCH XỔ LÒI KHỎI MÀN (29/09, soát toàn diện): danh sách chọn (nhân sự,
   * danh mục…) luôn xổ XUỐNG dưới ô, kể cả khi dưới không đủ chỗ — iPhone nhỏ
   * (667px) ở Lịch tác nghiệp lòi 20px, mấy dòng cuối không bấm tới. Lòi thì:
   * trên rộng hơn → lật lên trên ô; không thì co lại vừa phần màn còn lại và
   * cuộn bên trong. Chỉ đụng khi đang lòi, và gỡ khi danh sách đóng. */
  function vuaPanel() {
    document.querySelectorAll('.pk-panel, .dd-panel, .ng-pop').forEach((p) => {
      const mo = p.getClientRects().length && getComputedStyle(p).display !== 'none';
      if (!mo) { if (p.dataset.iosVua) { p.style.maxHeight = ''; p.style.overflowY = ''; delete p.dataset.iosVua; } return; }
      const r = p.getBoundingClientRect();
      if (r.bottom <= innerHeight - 6 || r.height < 40) return;
      const o = p.parentElement ? p.parentElement.getBoundingClientRect() : r;
      const tren = o.top - 12, duoi = innerHeight - r.top - 10;
      const s = getComputedStyle(p);
      if (s.position === 'fixed' && tren > duoi && tren > 160) {
        const h = Math.min(r.height, tren);
        p.style.maxHeight = h + 'px';
        p.style.top = Math.max(8, o.top - 6 - h) + 'px';
      } else {
        p.style.maxHeight = Math.max(120, duoi) + 'px';
      }
      p.style.overflowY = 'auto';
      p.dataset.iosVua = '1';
    });
  }
  addEventListener('resize', () => requestAnimationFrame(vuaPanel));
  document.addEventListener('click', () => setTimeout(vuaPanel, 60), true);

  /* Cửa sổ vừa mở còn đang hiện dần (opacity 0 lúc đo) hoặc vừa đóng còn đang
   * mờ dần (visibility trễ) → một lần đo ngay lúc đổi lớp dễ sai, mà sau đó có
   * thể không còn thay đổi nào để đo lại → lớp vỏ không tối, hoặc tối kẹt.
   * Nên đo lại khi hiệu ứng xong và thêm một lần sau 480ms. */
  let henChe = 0;
  const cheLai = () => { clearTimeout(henChe); henChe = setTimeout(() => baoChe(true), 480); };
  document.addEventListener('transitionend', () => baoChe(true), true);
  document.addEventListener('animationend', () => baoChe(true), true);
  /* LỚP PHỦ LẠ (09/10/2026): danh sách CUA_SO chỉ biết tên lớp đã khai, nên cửa
   * sổ mới của app con (VD "Xem nhanh" .xn-lop ở Bảng công việc) mở ra mà lớp
   * vỏ không tối, không mờ. Nhận diện theo HÌNH chứ không theo tên: phần tử
   * fixed, phủ gần kín màn, có nền màu (bán trong suốt) và đang hiện, nằm sát
   * body (2 tầng). Lớp phủ đậm (xem ảnh toàn màn, nền > 60%) vẫn báo lớp vỏ
   * nhưng không bị đổi màu nền. */
  function nenLa() {
    let thay = false;
    const xet = (e) => {
      if (thay || !e || e.nodeType !== 1 || e.id === 'moApp') return;
      const s = getComputedStyle(e);
      if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return;
      const r = e.getBoundingClientRect();
      if (r.width < innerWidth * 0.95 || r.height < innerHeight * 0.95) return;
      const m = /rgba?\(\s*\d+,\s*\d+,\s*\d+(?:,\s*([\d.]+))?\)/.exec(s.backgroundColor);
      const al = m ? (m[1] == null ? 1 : +m[1]) : 0;
      if (al < 0.08 || al >= 0.97) return;
      if (al <= 0.6) e.classList.add('ios-nen-la');
      thay = true;
    };
    for (const c of document.body.children) { xet(c); if (thay) break; for (const d of c.children) { xet(d); if (thay) break; } }
    return thay;
  }
  function baoChe(lai) {
    if (lai !== true) cheLai();
    let mo = false;
    document.querySelectorAll(CUA_SO).forEach((e) => { if (!mo && !e.closest('.ios-bong-dong') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && (+getComputedStyle(e).opacity > 0.05 || (e.getAnimations && e.getAnimations().some((a) => a.playState === 'running')))) mo = true; });
    if (!mo) mo = nenLa();
    if (mo === daChe) return;
    daChe = mo;
    /* Thanh cuộn của trang nằm NGOÀI lớp phủ tối (fixed không phủ được rãnh cuộn)
     * → một dải sáng dọc mép phải khi mở cửa sổ. Tô rãnh cùng độ tối lớp phủ. */
    try {
      const h = document.documentElement;
      if (mo) {
        const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor) || [0, 238, 240, 245];
        const t = (v) => Math.round(v * 0.68);
        h.style.setProperty('--ios-ranh-toi', 'rgb(' + t(+m[1]) + ',' + t(+m[2]) + ',' + t(+m[3]) + ')');
      }
      h.classList.toggle('ios-co-cua-so', mo);
    } catch (_) {}
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

/* NHÁP TẠI MÁY cho form trong cửa sổ: đã tách sang public/nhap-chung.js (02/10/2026)
 * để chạy ở MỌI giao diện và cả trong lớp vỏ — xem đầu tệp đó. */

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

/* DẢI TAB KHÔNG ĐƯỢC KHUẤT (08/10/2026 — soát tổng thể). Thanh đầu một hàng
 * (27/09, anh Hùng: "cho ngang hàng") để dải tab chung hàng với cụm nút. App
 * nhiều tab thì tab cuối bị mép mờ nuốt mất: KPI ở 1280px khuất "Mục tiêu &
 * thử luật", "Soát & chốt"; Quảng cáo khuất từ "Dữ liệu theo ngày" — người ta
 * không biết là còn tab để lướt. Hai nấc, chỉ bật khi thật sự tràn:
 *   1. ios-tab-chat: giấu viên tên người (#meChip) — thông tin phụ, tên đã có
 *      ở lớp vỏ — nhường chỗ cho tab;
 *   2. ios-tab-xuong: vẫn tràn thì dải tab xuống một hàng riêng, đủ mặt tab. */
(() => {
  if (document.documentElement.getAttribute('data-skin') !== 'ios') return;
  const de = document.documentElement;
  const tran = (t) => t.scrollWidth > t.clientWidth + 2;
  let hen = 0;
  function kiem() {
    hen = 0;
    if (!de.classList.contains('ios-gop-tab') || innerWidth <= 640) { de.classList.remove('ios-tab-chat', 'ios-tab-xuong'); return; }
    const t = document.querySelector('body > header.topbar > .tabs');
    if (!t || !t.children.length) return;
    de.classList.remove('ios-tab-chat', 'ios-tab-xuong');
    if (!tran(t)) return;
    de.classList.add('ios-tab-chat');
    if (tran(t)) de.classList.add('ios-tab-xuong');
  }
  const lich = () => { if (!hen) hen = requestAnimationFrame(kiem); };
  const bat = () => {
    lich();
    addEventListener('resize', lich);
    new MutationObserver(lich).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bat); else bat();
})();

/* ĐỔI TAB MƯỢT (08/10/2026 — anh Hùng: "chuyển động mượt mà, hiệu ứng đồng bộ").
 * Bấm một tab ở thanh đầu thì nội dung mới thay "phụp". Cho vùng nội dung một
 * nhịp mờ → rõ 0,16s (CSS .ios-doi-tab). CHỈ đổi độ trong, không xê dịch: anh
 * từng chỉ ra chuyện "nhảy nhảy khi bấm tab". Vùng nội dung = khối main / #man /
 * #view / #noiDung đang hiện và không chứa chính dải tab. */
(() => {
  if (document.documentElement.getAttribute('data-skin') !== 'ios') return;
  const VUNG = 'main, #man, #view, #noiDung, #noi-dung, .man.dang, #content';
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('.topbar .tabs > *, .topbar > .pills > *, .tabsbar .tabs > *, nav.tabs > *');
    if (!t || t.classList.contains('ios-lens')) return;
    requestAnimationFrame(() => {
      const v = [...document.querySelectorAll(VUNG)].find((x) => x.getClientRects().length && !x.contains(t));
      if (!v) return;
      v.classList.remove('ios-doi-tab'); void v.offsetWidth; v.classList.add('ios-doi-tab');
      v.addEventListener('animationend', () => v.classList.remove('ios-doi-tab'), { once: true });
    });
  }, true);
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

/* THÔNG BÁO KIỂU DYNAMIC ISLAND: mọi thông báo của app con → nhờ lớp vỏ
 * (ios.js, window.__iosDao) vẽ viên giữa mép trên CẢ màn, còn ô thông báo
 * riêng của app thì ẩn (html.ios-dao-thay). Các app gọi thông báo ba kiểu:
 *   #toasts > .toast   (phần lớn app; lớp err/do/xau là lỗi)
 *   #toast dùng lại    (Báo cáo, KOL, Lịch làm việc: hidden; Kho media: .hien)
 *   #doc               (KPI: hidden, lớp .loi là lỗi) */
(() => {
  let goi = null;
  try { goi = parent !== window && parent.__iosDao ? parent.__iosDao : null; } catch (_) {}
  if (!goi) return;
  document.documentElement.classList.add('ios-dao-thay');
  const hien = (e) => !e.hidden && (!e.classList.contains('toast') || e.id !== 'toast' || e.classList.contains('hien'));
  const mot = (e) => { if (e && hien(e)) goi(e.textContent, e.className); };
  const bat = () => {
    new MutationObserver((ds) => {
      const xet = new Set();
      ds.forEach((d) => {
        const t = d.target.nodeType === 1 ? d.target : d.target.parentElement;
        if (!t) return;
        if (d.type === 'childList' && t.id === 'toasts') { d.addedNodes.forEach((n) => { if (n.nodeType === 1) mot(n); }); return; }
        const o = t.closest && t.closest('#toast, #doc');
        if (o) xet.add(o);
        d.addedNodes && d.addedNodes.forEach((n) => { if (n.nodeType === 1 && (n.id === 'toast' || n.id === 'doc')) xet.add(n); });
      });
      xet.forEach(mot);
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
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

/* GỢI Ý CUỘN (09/10/2026, anh Hùng duyệt ở trang thử): thanh cuộn đã ẩn, nên
 * vùng còn nội dung khuất thì MÉP mờ dần — dưới còn thì mép dưới mờ, đã cuộn
 * xuống thì mép trên mờ, tới cuối thì hết. Chỉ vùng cỡ vừa/nhỏ (danh sách, thân
 * cửa sổ, cột bên phải): vùng cao ≥ 75% màn thường là cả trang, hay có thanh
 * nút dính đáy — mờ đi là khó bấm. Vùng có phần tử dính (tiêu đề bảng…) thì
 * không mờ mép trên. Bỏ qua ô nhập. Có cùng bản ở ios.js / ios-app.js. */
(() => {
  if (window.__cdMep) return;
  window.__cdMep = true;
  const BO = 'textarea, select, input, iframe, .ios-dao, .ios-dao *, [data-khong-mep], [data-khong-mep] *';
  const dang = new Set();
  function ve(e) {
    const con = e.scrollHeight - e.clientHeight - e.scrollTop;
    e.style.setProperty('--cd-tren', !e._cdDinh && e.scrollTop > 2 ? '24px' : '0px');
    e.style.setProperty('--cd-duoi', con > 2 ? '32px' : '0px');
  }
  function coDinh(e) {
    const ds = e.querySelectorAll('*');
    if (ds.length > 600) return true;
    for (const x of ds) { const p = getComputedStyle(x).position; if (p === 'sticky' || p === 'fixed') return true; }
    return false;
  }
  function quet() {
    const H = innerHeight;
    dang.forEach((e) => { if (!e.isConnected) dang.delete(e); });
    document.querySelectorAll('body *').forEach((e) => {
      if (e.scrollHeight <= e.clientHeight + 8 || e.clientHeight < 60) {
        if (dang.has(e)) { dang.delete(e); e.classList.remove('cd-mep'); }
        return;
      }
      if (dang.has(e)) { ve(e); return; }
      if (e.matches(BO) || e.clientHeight >= H * 0.75) return;
      const oy = getComputedStyle(e).overflowY;
      if (oy !== 'auto' && oy !== 'scroll') return;
      e._cdDinh = coDinh(e);
      dang.add(e); e.classList.add('cd-mep'); ve(e);
    });
  }
  /* Quét đọc kích thước mọi phần tử → giới hạn: chờ yên 400ms, tối đa một lần
   * mỗi 1,5s, để app có chữ đổi liên tục (đồng hồ, tiến độ) không bị giật. */
  let hen = 0, lanCuoi = 0;
  const henQuet = () => {
    if (hen) return;                      // đã hẹn rồi: không dời mãi khi trang đổi liên tục
    hen = setTimeout(() => { hen = 0; lanCuoi = Date.now(); quet(); }, Math.max(400, 1500 - (Date.now() - lanCuoi)));
  };
  document.addEventListener('scroll', (ev) => { const e = ev.target; if (e && e.nodeType === 1 && dang.has(e)) ve(e); }, { capture: true, passive: true });
  addEventListener('resize', henQuet);
  const bat = () => {
    henQuet();
    new MutationObserver(henQuet).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bat); else bat();
})();

/* BẢNG THÀNH THẺ TRÊN ĐIỆN THOẠI (09/10/2026, nguyên tắc "điện thoại không kéo
 * ngang nội dung" — anh Hùng: "kéo ngang với nội dung trang báo cáo vẫn còn
 * tồn"). Bảng chỉ đọc mà rộng hơn khung → mỗi dòng thành một thẻ, mỗi ô kèm tên
 * cột (data-nhan lấy từ tiêu đề). Ngoại lệ có chủ ý: bảng lưới hai chiều (tiêu
 * đề đa số là ngày/thứ, VD lịch người × ngày) giữ kéo ngang; bảng có ô nhập (form báo cáo) đã có
 * bố cục riêng. Quét lại khi bảng vẽ lại; lên máy tính thì trả về bảng thường. */
(() => {
  if (window.__iosTheBang) return;
  window.__iosTheBang = true;
  const mq = matchMedia('(max-width: 640px)');
  function nhanCot(t) {
    const tr = t.tHead && t.tHead.rows[t.tHead.rows.length - 1];
    if (!tr) return null;
    const ds = [];
    for (const th of tr.cells) { const n = Math.max(1, th.colSpan || 1); for (let i = 0; i < n; i++) ds.push((th.innerText || '').replace(/\s+/g, ' ').trim()); }
    return ds;
  }
  function lam() {
    document.querySelectorAll('table.ios-the-bang, table.ios-bang-vua').forEach((t) => { if (!mq.matches || !t.isConnected) t.classList.remove('ios-the-bang', 'ios-bang-vua'); });
    if (!mq.matches) return;
    document.querySelectorAll('table').forEach((t) => {
      if (!t.getClientRects().length || t.closest('.ios-giu-bang')) return;
      const nhan = nhanCot(t);
      if (!nhan || nhan.length > 16) return;
      /* bảng 1–2 cột mà tràn: chỉ vì độ rộng tối thiểu của app → cho vừa khung */
      if (nhan.length < 3) {
        const cha2 = t.parentElement;
        if (cha2 && t.scrollWidth > cha2.clientWidth + 4) t.classList.add('ios-bang-vua');
        return;
      }
      /* lưới hai chiều (lịch người × ngày): đa số tiêu đề là số ngày / thứ → giữ */
      if (nhan.filter((x) => /^(\d{1,2}|T[2-7]|CN|\d{1,2}\s*(T[2-7]|CN))$/i.test(x)).length >= nhan.length / 2) return;
      /* bảng có ô nhập: chỉ đổi khi ít cột (phiếu chấm KPI…); bảng tính nhiều cột
       * sửa tại ô (Bảng công việc › Bảng) là việc của máy tính — tab đó ẩn trên điện thoại */
      if (t.querySelector('tbody input:not([type="checkbox"]), tbody select, tbody textarea') && nhan.length > 9) return;
      const cha = t.parentElement;
      const tran = t.classList.contains('ios-the-bang') || (cha && t.scrollWidth > cha.clientWidth + 4) || t.getBoundingClientRect().right > innerWidth + 2;
      if (!tran) return;
      for (const tb of t.tBodies) for (const tr of tb.rows) {
        let i = 0;
        for (const td of tr.cells) {
          const n = nhan[i] || '';
          if (td.getAttribute('data-nhan') !== n) td.setAttribute('data-nhan', n);
          i += Math.max(1, td.colSpan || 1);
        }
      }
      t.classList.add('ios-the-bang');
    });
  }
  let hen = 0;
  const henLam = () => { if (hen) return; hen = setTimeout(() => { hen = 0; try { lam(); } catch (_) {} }, 250); };
  const bat = () => {
    henLam();
    new MutationObserver(henLam).observe(document.body, { childList: true, subtree: true });
    mq.addEventListener ? mq.addEventListener('change', henLam) : mq.addListener(henLam);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bat); else bat();
})();

/* GỌN ĐIỆN THOẠI (09/10/2026, anh Hùng: "mobile cần rút gọn các cái không cần
 * thiết như bộ lọc… cứ tư duy đó mà cải thiện"). Điện thoại chỉ giữ thứ người
 * ta dùng khi cầm máy; việc của máy tính (xuất tệp, chép sang sheet, kết nối,
 * hướng dẫn nhập) và phần trống chỉ chiếm chỗ. Gắn .ios-an-dt (ios.css ẩn ở
 * ≤ 640px); lên máy tính gỡ ra. Danh sách theo CHỮ trên nút vì mỗi app đặt tên
 * lớp một kiểu. Xem docs/nguyen-tac-lam-viec.md mục 1. */
(() => {
  if (window.__iosGonDt) return;
  window.__iosGonDt = true;
  const mq = matchMedia('(max-width: 640px)');
  const NUT_MAY_TINH = /^(xuất csv|xuất báo cáo|xuất excel|tải excel|sheet hcns|chép khối ngày|hướng dẫn|kết nối|mở base|mở lark để nhập)$/i;
  const chu = (e) => (e.textContent || '').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '').replace(/\s+/g, ' ').trim();
  function lam() {
    document.querySelectorAll('.ios-an-dt').forEach((e) => { if (!mq.matches) e.classList.remove('ios-an-dt'); });
    if (!mq.matches) return;
    const an = (e) => { if (e && !e.classList.contains('ios-an-dt')) e.classList.add('ios-an-dt'); };
    document.querySelectorAll('button, a.btn, .btn').forEach((e) => { const t = chu(e); if (t.length < 26 && NUT_MAY_TINH.test(t)) an(e); });
    /* Bảng công việc › Bảng: bảng tính 11 cột sửa tại ô — trên điện thoại dùng Kanban/danh sách */
    if (document.documentElement.getAttribute('data-app') === 'cong-viec') {
      document.querySelectorAll('.topbar .tabs > .tab, .topbar .tabs > button').forEach((e) => { if (chu(e) === 'Bảng') an(e); });
      /* Kanban: cột trạng thái trống ("0 · Không có công việc") chiếm trọn một
       * trang vuốt — bỏ, trang đầu là cột có việc */
      document.querySelectorAll('.board > .col').forEach((c) => {
        const n = c.querySelector('.col-head .n');
        if (n && n.textContent.trim() === '0') an(c); else c.classList.remove('ios-an-dt');
      });
    }
    /* nhóm việc rỗng (số 0) ở Bảng công việc: tiêu đề + giải thích + "không có
     * việc nào" chiếm nửa màn mà không cho biết thêm gì */
    document.querySelectorAll('.queue').forEach((q) => {
      const n = q.querySelector('.queue-n');
      if (n && n.textContent.trim() === '0') an(q); else q.classList.remove('ios-an-dt');
    });
    /* nhóm có số 0 + câu "Không có… / Không còn… / Chưa có…" (Lịch tác nghiệp…):
     * cùng lý do như nhóm rỗng ở Bảng công việc */
    document.querySelectorAll('body *').forEach((e) => {
      if (e.children.length || e.closest('.ios-an-dt, [role="dialog"], .modal, .drawer')) return;
      const t = (e.textContent || '').trim();
      if (t.length > 70 || !/^(không có|không còn|chưa có)/i.test(t)) return;
      const g = e.parentElement;
      if (!g || g === document.body) return;
      const coSo0 = [...g.querySelectorAll('*')].some((x) => x !== e && !x.children.length && x.textContent.trim() === '0');
      if (coSo0 && g.getBoundingClientRect().height < 200) an(g);
    });
    /* đoạn chữ nhỏ (≤ 12.5px) dài ≥ 3 dòng: giải thích cách tính, chú thích — đọc
     * trên máy tính; ngoài cửa sổ, form, danh sách việc */
    document.querySelectorAll('p, div, span, small').forEach((e) => {
      if (e.classList.contains('ios-an-dt') || e.closest('.ios-an-dt, [role="dialog"], .modal, .drawer, form, label, details, .ios-dao, table, li, button, a')) return;
      if ([...e.children].some((x) => !/^(B|STRONG|EM|I|SPAN|BR|A|CODE)$/.test(x.tagName))) return;
      const t = (e.textContent || '').trim();
      if (t.length < 90) return;
      const s = getComputedStyle(e);
      const co = parseFloat(s.fontSize), dong = parseFloat(s.lineHeight) || co * 1.35;
      if (co > 12.5 || e.getBoundingClientRect().height < dong * 2.6) return;
      an(e);
    });
    /* hộp lỗi kết nối (Quảng cáo): giữ dòng báo lỗi, bỏ hướng dẫn kỹ thuật */
    document.querySelectorAll('.bang-loi :is(.bl-lam, .bl-ly)').forEach(an);
    /* thẻ hướng dẫn nhập booking trong Lark (Booking OTA): việc làm trên máy tính */
    document.querySelectorAll('.nhap-kicker').forEach((k) => {
      let c = k.parentElement;
      while (c && c !== document.body && getComputedStyle(c).backgroundColor === 'rgba(0, 0, 0, 0)') c = c.parentElement;
      if (c && c !== document.body && c.getBoundingClientRect().height < 260) an(c);
    });
  }
  let hen = 0;
  const henLam = () => { if (hen) return; hen = setTimeout(() => { hen = 0; try { lam(); } catch (_) {} }, 200); };
  const bat = () => {
    henLam();
    new MutationObserver(henLam).observe(document.body, { childList: true, subtree: true, characterData: true });
    mq.addEventListener ? mq.addEventListener('change', henLam) : mq.addListener(henLam);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bat); else bat();
})();
