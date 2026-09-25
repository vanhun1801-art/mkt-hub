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

  let hen = 0;
  const lich = () => { if (hen) return; hen = requestAnimationFrame(() => { hen = 0; try { donMot(document.body); nutTao(); chipNguon(); tabTrongTam(); } catch (_) {} }); };
  const batDau = () => {
    lich();
    new MutationObserver(lich).observe(document.body, { childList: true, subtree: true, characterData: true });
    // đổi tab nhiều app chỉ đổi lớp .on (không đổi DOM) — nghe cả cú bấm
    document.addEventListener('click', (e) => { if (e.target.closest('.tabs, .pills')) requestAnimationFrame(tabTrongTam); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', batDau);
  else batDau();
})();
