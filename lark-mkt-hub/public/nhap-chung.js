/* ==========================================================================
 * NHÁP TẠI MÁY CHO MỌI FORM TRONG CỬA SỔ — dùng chung cho lớp vỏ và mọi app con
 * ==========================================================================
 * Lần đầu (28/09) anh Hùng: "cần cơ chế tự động lưu nháp khi có phát sinh thêm
 * nhập liệu mới". Mỗi app một kiểu form, phần lớn chỉ ghi Base lúc bấm Lưu/Gửi —
 * lỡ đóng cửa sổ, lỡ bấm ra ngoài là mất trắng. Ở đây giữ mọi ô đang gõ NGAY
 * TRÊN MÁY (không ghi Base, không tạo bản ghi dở):
 *  - mở lại đúng form đó mà có nháp → thanh "Khôi phục · Bỏ", KHÔNG tự điền;
 *  - bấm Lưu/Gửi/Tạo… rồi cửa sổ đóng = đã lưu thật → xoá nháp; đóng bằng ✕,
 *    Esc, bấm ra ngoài → giữ nháp. Nháp quá 7 ngày tự bỏ.
 *
 * Tách khỏi ios-app.js ngày 02/10/2026 sau đợt rà "tự lưu, lưu nháp toàn Hub"
 * (anh Hùng: "kiểm tra sửa các chỗ hở đó đi em"). Bản cũ có bốn chỗ hở:
 *  1. CHỈ chạy ở giao diện iOS, và KHÔNG chạy trong chính lớp vỏ (Soạn "Tin của
 *     phòng", Phân quyền…) → nay chạy ở mọi giao diện, lớp vỏ nạp riêng.
 *  2. Ngăn đã TỰ LƯU lên Base (chi tiết việc ở Bảng công việc, Lịch tác nghiệp)
 *     vẫn bị giữ thêm một bản trên máy; bấm "Khôi phục" là đè giá trị CŨ lên Base.
 *     → app đánh dấu khung đó `.ios-tu-luu`: lớp này bỏ qua, và xoá nháp cũ.
 *  3. Khoá nháp chỉ là id khung + tiêu đề, mà nhiều cửa sổ cùng một tiêu đề cho
 *     MỌI bản ghi ("Yêu cầu điều chỉnh", "Sửa khoản chi"…) → nháp của bản ghi A
 *     được mời khôi phục ở bản ghi B. → app gắn `data-nhap-khoa="<mã bản ghi>"`.
 *  4. Ô token / secret của Social được chép nguyên văn vào bộ nhớ trình duyệt.
 *     → ô nào trông như mật khẩu, khoá bí mật thì không bao giờ giữ.
 * Cộng thêm: hộp thoại <dialog> gốc, và khung nào app tự gắn `[data-nhap]`.
 *
 * DẤU CHO APP CON (đặt trên khung, hoặc một phần tử bên trong khung):
 *   .ios-tu-luu            app tự lưu khung này lên Base — lớp này đứng ngoài
 *   [data-nhap-khoa="…"]   nháp riêng theo bản ghi
 *   .ios-khong-nhap        vùng / ô không phải form (ô nhắn tin, ô mật khẩu…)
 *   [data-nhap]            khung form không có class quen thuộc — cũng giữ nháp
 *   sự kiện 'ios-nhap-xong' app tự lưu xong → bỏ nháp của khung đó
 */
(function () {
  if (window.__nhapChung) return;            // nạp hai lần (vỏ + app) thì chỉ chạy một
  window.__nhapChung = true;
  const html = document.documentElement;
  const me = document.currentScript;
  const APP = html.getAttribute('data-app') || (me && me.dataset.app) || '';
  if (!APP) return;

  const KHUNG = '.modal, .modal-wrap, .drawer, .xt, .hop, .phu-man, .md, [role="dialog"], dialog[open], [data-nhap]';
  const O = 'input:not([type=hidden]):not([type=password]):not([type=file]):not([type=button]):not([type=submit]):not([type=search]):not([type=range]), textarea, select';
  /* Nút "đã lưu thật". Thêm các động từ bắt gặp khi rà 02/10: Quyết toán, Gán mã,
   * Chốt kỳ, Đặt lịch, Phân công, Duyệt, Nghiệm thu… — trước đây bấm xong nháp không
   * bị xoá, lần sau lại mời khôi phục một thứ đã lưu rồi. KHÔNG có "Huỷ": nút Huỷ
   * thường là đóng-không-lưu, xoá nháp ở đó là mất đúng thứ cần giữ (bắt được khi
   * thử form giá NET của OTA, 02/10). */
  const NUT_LUU = /^\s*(\+\s*)?(lưu|gửi|nộp|tạo|ghi|đăng ký|cập nhật|xác nhận|thêm|hoàn tất|báo cáo|quyết toán|gán|chốt|đặt lịch|phân công|duyệt|nghiệm thu|từ chối|giao|đồng ý)/i;
  const TIEN_TO = 'ios.nhap:' + APP + ':';
  /* Trông như ô bí mật: không bao giờ chép vào localStorage, kể cả khi app đổi
   * type=password thành text để hiện ra (nút "Sinh" mật khẩu). */
  const BI_MAT = /token|secret|bí mật|mật khẩu|mat-?khau|matkhau|password|passwd|api[-_ ]?key|app[-_ ]?key|refresh|\bpin\b|\botp\b|cvv|credential/i;

  const hien = (e) => e && e.isConnected && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const ngoai = (e) => { let k = e.closest(KHUNG); while (k && k.parentElement && k.parentElement.closest(KHUNG)) k = k.parentElement.closest(KHUNG); return k; };
  const tuLuu = (k) => !!(k && (k.matches('.ios-tu-luu') || k.querySelector('.ios-tu-luu') || k.closest('.ios-tu-luu')));
  function biMat(o) {
    if (o.type === 'password') return true;
    const nhan = (o.labels && o.labels[0] && o.labels[0].textContent) ||
      ((o.closest('.field, .md-field, .f, .o, label, .dong') || {}).textContent || '').slice(0, 80);
    return BI_MAT.test([o.id, o.name, o.dataset.f, o.dataset.k, o.placeholder, o.getAttribute('autocomplete'), nhan].join(' '));
  }
  const boQua = (o) => o.closest('.ios-bong-dong, .pk-panel, .dd-panel, .ios-nhap-bar, .ios-khong-nhap') ||
    /tìm|search/i.test(o.placeholder || '') || o.readOnly || o.disabled || biMat(o);
  const oCua = (k) => [...k.querySelectorAll(O)].filter((o) => !boQua(o));
  const tenO = (o, i) => o.id || o.name || o.dataset.f || o.dataset.k || ('#' + i);
  const chu = (o) => o.tagName === 'TEXTAREA' || (o.tagName === 'INPUT' && /^(text|email|url|tel|number|)$/.test(o.type));
  const coChu = (k) => oCua(k).some((o) => chu(o) && String(o.value || '').trim());
  function goc(k) {
    return TIEN_TO + (k.id || [...k.classList].filter((c) => !/^(on|open|mo|hien|ios-)/.test(c)).join('.') || k.tagName.toLowerCase()) + ':';
  }
  function khoa(k) {
    const h = k.querySelector('h1, h2, h3, .modal-title, .dr-title, .xt-ten, .hop-dau');
    const t = h ? [...h.childNodes].filter((n) => n.nodeType === 3 || !n.matches('button, .md-x, .x')).map((n) => n.textContent).join('') : '';
    const rieng = k.dataset.nhapKhoa || ((k.querySelector('[data-nhap-khoa]') || {}).dataset || {}).nhapKhoa || '';
    return goc(k) + t.replace(/\s+/g, ' ').trim().slice(0, 60) + (rieng ? '#' + rieng : '');
  }
  const doc = (kh) => { try { const x = JSON.parse(localStorage.getItem(kh) || 'null'); return x && Date.now() - x.at < 7 * 864e5 ? x : null; } catch (_) { return null; } };
  const xoa = (kh) => { try { localStorage.removeItem(kh); } catch (_) {} };
  /* Khung tự lưu: dọn sạch mọi nháp cũ của nó (bản cũ có thể đã giữ, xem chỗ hở 2). */
  const daDon = new Set();
  function donTuLuu(k) {
    const g = goc(k);
    if (daDon.has(g)) return;
    daDon.add(g);
    try { Object.keys(localStorage).filter((x) => x.indexOf(g) === 0).forEach(xoa); } catch (_) {}
  }

  /* Thanh "Có bản nháp" cần chạy được cả ở giao diện gốc (ios.css chỉ tô ở iOS). */
  try {
    const st = document.createElement('style');
    st.setAttribute('data-hub', '1');
    st.textContent = '.ios-nhap-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0;padding:8px 10px;' +
      'border-radius:10px;background:rgba(0,122,255,.1);font-size:13px;line-height:18px}' +
      '.ios-nhap-bar>span{flex:1 1 auto;min-width:0}' +
      '.ios-nhap-bar>button{height:28px;padding:0 12px;border:0;border-radius:999px;cursor:pointer;font:inherit;font-weight:600;background:#007aff;color:#fff}' +
      '.ios-nhap-bar>button[data-nhap-nut="bo"]{background:transparent;color:inherit;opacity:.7}';
    (document.head || html).appendChild(st);
  } catch (_) {}

  /* Form TẠO MỚI hay cửa sổ SỬA bản ghi có sẵn? Lúc mở, chụp giá trị ban đầu
   * (form mới vẫn có sẵn giá trị mặc định: người phụ trách, ngày hôm nay…).
   * Tới lần gõ đầu tiên: ô khác đã bị app ĐIỀN SAU lúc mở (nạp bản ghi về) và
   * mang chữ → cửa sổ sửa → không giữ nháp. */
  const giaTri = (k) => { const g = {}; oCua(k).forEach((o, i) => { g[tenO(o, i)] = (o.type === 'checkbox' || o.type === 'radio') ? String(o.checked) : String(o.value); }); return g; };
  const trangThai = new Map();   // khung đang mở → { kh, goc, daGo, sua }; đóng là quên
  function thay(k) {
    let t = trangThai.get(k);
    if (t && t.kh === khoa(k)) return t;
    t = { kh: khoa(k), goc: giaTri(k), daGo: new Set(), sua: undefined };
    trangThai.set(k, t);
    moiKhoiPhuc(k, t);
    return t;
  }
  let hen = 0;
  function giu(k, oGo) {
    const t = thay(k);
    const ds = oCua(k);
    const ten = oGo ? tenO(oGo, ds.indexOf(oGo)) : '';
    if (t.sua === undefined) {
      t.sua = ds.some((o, i) => { const n = tenO(o, i); return o !== oGo && !t.daGo.has(n) && chu(o) && String(o.value).trim() && String(o.value) !== t.goc[n]; });
      if (t.sua) { const b = k.querySelector('.ios-nhap-bar'); if (b) b.remove(); }
    }
    if (ten) t.daGo.add(ten);
    if (t.sua) return;
    clearTimeout(hen);
    hen = setTimeout(() => {
      try {
        if (!coChu(k)) return xoa(t.kh);
        const f = {};
        oCua(k).forEach((o, i) => { f[tenO(o, i)] = (o.type === 'checkbox' || o.type === 'radio') ? { c: o.checked } : { v: o.value }; });
        localStorage.setItem(t.kh, JSON.stringify({ at: Date.now(), f }));
      } catch (_) {}
    }, 500);
  }
  function moiKhoiPhuc(k, t) {
    const x = doc(t.kh);
    if (!x || k.querySelector('.ios-nhap-bar')) return;
    const o0 = oCua(k)[0];
    if (!o0) return;
    // chèn thanh ngay trước khối chứa ô đầu tiên, ở cấp con trực tiếp của hộp
    let hop = k;
    const con = [...k.children].filter((c) => c.contains(o0));
    if (con[0] && con[0] !== o0 && con[0].getBoundingClientRect().width < innerWidth * 0.98) hop = con[0];
    let khoi = o0;
    while (khoi.parentElement && khoi.parentElement !== hop) khoi = khoi.parentElement;
    const g = new Date(x.at);
    const bar = document.createElement('div');
    bar.className = 'ios-nhap-bar';
    bar.innerHTML = '<span>Có bản nháp chưa lưu · ' + String(g.getHours()).padStart(2, '0') + ':' + String(g.getMinutes()).padStart(2, '0') +
      ' ' + String(g.getDate()).padStart(2, '0') + '/' + String(g.getMonth() + 1).padStart(2, '0') + '</span>' +
      '<button type="button" data-nhap-nut="lay">Khôi phục</button><button type="button" data-nhap-nut="bo">Bỏ</button>';
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-nhap-nut]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (b.dataset.nhapNut === 'lay') {
        oCua(k).forEach((o, i) => {
          const v = x.f[tenO(o, i)];
          if (!v) return;
          if ('c' in v) o.checked = v.c; else o.value = v.v;
          o.dispatchEvent(new Event('input', { bubbles: true }));
          o.dispatchEvent(new Event('change', { bubbles: true }));
        });
      } else xoa(t.kh);
      bar.remove();
    });
    /* Có thân hộp quen thuộc thì đặt thanh lên ĐẦU thân hộp — cách dò cấp con bên
     * trên có lúc đặt thanh ra NGOÀI hộp (OTA: nổi lơ lửng trên đầu cửa sổ). */
    const than = o0.closest('.modal-than, .modal-body, .md-body, .hop-than, .drawer-body, .dr-body, .xt-than, form');
    if (than && k.contains(than)) than.insertBefore(bar, than.firstChild);
    else khoi.parentElement.insertBefore(bar, khoi);
  }
  const suKien = (e) => {
    const o = e.target;
    if (!o || !o.matches || !o.matches(O) || boQua(o)) return;
    const k = ngoai(o);
    if (!k || !hien(k)) return;
    if (tuLuu(k)) { donTuLuu(k); return; }
    giu(k, o);
  };
  document.addEventListener('input', suKien, true);
  document.addEventListener('change', suKien, true);
  /* App tự lưu nháp lên Base rồi (Lịch tác nghiệp: form Đăng ký) → bỏ bản trên
   * máy và thôi giữ tiếp, kẻo mở form mới lại mời khôi phục một lịch đã có. */
  document.addEventListener('ios-nhap-xong', (e) => {
    const k = e.target && e.target.closest ? ngoai(e.target) || e.target : null;
    if (!k) return;
    clearTimeout(hen);
    const t = trangThai.get(k);
    xoa(t ? t.kh : khoa(k));
    if (t) t.sua = true;
    const b = k.querySelector('.ios-nhap-bar'); if (b) b.remove();
  });
  // mở cửa sổ: dò có nháp không (form trống)
  let henDo = 0;
  function quet() {
    henDo = 0;
    // cửa sổ đã đóng: quên trạng thái — app dùng lại đúng khung đó cho lần mở sau
    trangThai.forEach((t, k) => { if (!hien(k)) { trangThai.delete(k); const b = k.querySelector('.ios-nhap-bar'); if (b) b.remove(); } });
    document.querySelectorAll(KHUNG).forEach((k) => {
      if (k !== ngoai(k) || !hien(k) || !oCua(k).length) return;
      if (tuLuu(k)) { donTuLuu(k); return; }
      thay(k);
    });
  }
  const theoDoi = () => new MutationObserver(() => {
    if (henDo) return;
    /* setTimeout, không requestAnimationFrame: rAF đứng hẳn khi cửa sổ bị ẩn/thu
     * nhỏ — đóng rồi mở lại form lúc đó thì không bao giờ "quên" khung cũ, thanh
     * Khôi phục không hiện (bắt được khi thử 02/10). */
    henDo = setTimeout(quet, 80);
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style', 'open'] });
  if (document.body) theoDoi(); else document.addEventListener('DOMContentLoaded', theoDoi);
  // bấm nút lưu → cửa sổ đóng trong 6 giây = đã lưu thật → bỏ nháp
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button, .btn, [type=submit]');
    if (!b || b.closest('.ios-nhap-bar')) return;
    const k = ngoai(b);
    if (!k || !NUT_LUU.test(b.textContent || '')) return;
    const t = trangThai.get(k);
    if (!t || t.sua) return;
    const kh = t.kh, t0 = Date.now();
    const doi = setInterval(() => {
      if (!hien(k)) { clearInterval(doi); xoa(kh); }
      else if (Date.now() - t0 > 6000) clearInterval(doi);
    }, 300);
  }, true);
})();
