'use strict';
/* Một lời gọi kiểm tra việc, không tự bung danh sách. Giữ nguyên DOM khi cập nhật. */
(function () {
  const state = { data: null, root: null, refs: null, loading: false, peeking: false,
    timer: null, hideTimer: null, idleTimer: null, stored: {}, memoryKey: '', pendingDemo: false };
  const MINUTE = 60000;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const key = () => 'hub.action-reminder.' + state.data.accountKey;
  function read() {
    if (state.memoryKey !== key()) { state.memoryKey = key(); state.stored = {}; }
    try { return JSON.parse(localStorage.getItem(key()) || JSON.stringify(state.stored)); } catch (_) { return state.stored; }
  }
  function save(patch) {
    state.stored = Object.assign(read(), patch);
    try { localStorage.setItem(key(), JSON.stringify(state.stored)); } catch (_) {}
  }
  function allowed() {
    return typeof S !== 'undefined' && S.hub && !S.hub.khach && !S.xemNhu &&
      (S.modules || []).some(m => m.id === 'cong-viec' && m.bat !== false && (m.quanLyToi || S.quanLy));
  }
  function blocked() {
    return document.hidden || document.body.classList.contains('mod-che') ||
      !!document.querySelector('#moApp, #tbPhu, #nlPhu, #modalWrap:not([hidden])') ||
      /^(INPUT|TEXTAREA|IFRAME)$/.test((document.activeElement || {}).tagName || '') ||
      !!((document.activeElement || {}).isContentEditable);
  }
  /* Tin Trao đổi chưa đọc (26/10/2026, anh Hùng: "hiện lên các tin nhắn chưa
   * đọc nữa"). Máy chủ đếm sẵn (counts.chat) và gửi kèm việc có tin mới nhất
   * (chat[0]); bấm là mở thẳng tab Trao đổi của việc đó. Thứ tự ưu tiên: việc
   * trễ hạn → tin chưa đọc → chờ duyệt → sắp đến hạn. Có cả việc trễ lẫn tin
   * chưa đọc thì tin thành liên kết phụ đứng sau, cùng một dòng. */
  function tinChuaDoc(data) {
    const n = (data.counts && data.counts.chat) || 0;
    const moi = (data.chat || [])[0];
    if (!n || !moi) return null;
    return {
      ngan: n + ' tin nhắn chưa đọc',
      dai: n + ' tin nhắn chưa đọc' + (moi.nguoi ? ' · ' + moi.nguoi + (moi.trich ? ': ' + moi.trich : '') : ''),
      target: '#/m/cong-viec?rec=' + encodeURIComponent(moi.id) + '&mo=trao-doi',
    };
  }
  function summary(data) {
    const tin = tinChuaDoc(data);
    if (data.counts.late) {
      return tin
        ? { text: data.counts.late + ' việc trễ hạn', target: '#/m/cong-viec?mo=can-xu-ly', phu: tin }
        : { text: data.counts.late + ' việc trễ hạn cần kiểm tra.', target: '#/m/cong-viec?mo=can-xu-ly' };
    }
    if (tin) return { text: tin.dai, target: tin.target };
    if (data.counts.review) return { text: data.counts.review + ' sản phẩm đang chờ duyệt.', target: '#/m/cong-viec?mo=nghiem-thu' };
    if (data.counts.soon) return { text: data.counts.soon + ' việc sắp đến hạn.', target: '#/m/cong-viec?mo=can-xu-ly' };
    return { text: 'Kiểm tra tiến độ công việc hôm nay nhé.', target: '#/m/cong-viec?mo=can-xu-ly' };
  }
  /* Đi tới đích của lời nhắc. App công việc đã mở sẵn thì lớp vỏ không nạp lại
   * khung, nên ?mo= / ?rec= trong đường dẫn không được đọc lần nữa: bấm lần hai
   * không đi tới đâu. Khi đó mở app rồi nhắn thẳng lệnh sang. */
  function diToi(e, href) {
    save({ snoozeUntil: Date.now() + 60 * MINUTE }); settle();
    const khung = typeof S !== 'undefined' && S.frames && S.frames.get('cong-viec');
    if (!khung || !khung.iframe) return;          // chưa có khung: để đường dẫn tự mở
    const q = new URLSearchParams((href.split('?')[1]) || '');
    const rec = q.get('rec'), mo = q.get('mo');
    if (!rec && !mo) return;
    e.preventDefault();
    location.hash = '#/m/cong-viec';
    setTimeout(() => {
      const w = khung.iframe.contentWindow;
      try {
        if (rec) w.postMessage({ hub: 'open', rec, mo }, location.origin);
        else w.postMessage({ hub: 'mo', v: mo }, location.origin);
      } catch (_) {}
    }, 60);
  }
  function remove() {
    clearTimeout(state.hideTimer); clearTimeout(state.idleTimer);
    if (state.root) state.root.remove(); state.root = null; state.refs = null; state.peeking = false;
  }
  function settle() {
    clearTimeout(state.hideTimer); state.peeking = false;
    if (!state.root) return;
    state.root.classList.remove('is-peeking');
    state.refs.mascot.setAttribute('aria-expanded', 'false');
    state.refs.copy.setAttribute('aria-hidden', 'true');
    state.refs.cta.tabIndex = -1; state.refs.close.tabIndex = -1; state.refs.phu.tabIndex = -1;
    state.refs.cta.setAttribute('aria-hidden', 'true'); state.refs.close.setAttribute('aria-hidden', 'true');
  }
  function later() {
    save({ snoozeUntil: Date.now() + 60 * MINUTE }); settle(); state.refs.mascot.focus();
  }
  function armHide() {
    clearTimeout(state.hideTimer);
    state.hideTimer = setTimeout(() => {
      if (state.root && (state.root.matches(':hover') || state.root.contains(document.activeElement))) return;
      settle();
    }, 9000);
  }
  function peek(manual = false) {
    if (!state.data || !state.data.total || !allowed() || blocked()) return false;
    const saved = read();
    if (!manual && (saved.snoozeUntil > Date.now() || (saved.lastShown && Date.now() - saved.lastShown < 60 * MINUTE))) return false;
    ensure(); update();
    state.peeking = true; state.pendingDemo = false;
    state.root.classList.add('is-peeking');
    state.refs.mascot.setAttribute('aria-expanded', 'true');
    state.refs.copy.setAttribute('aria-hidden', 'false');
    state.refs.cta.tabIndex = 0; state.refs.close.tabIndex = 0; state.refs.phu.tabIndex = 0;
    state.refs.cta.setAttribute('aria-hidden', 'false'); state.refs.close.setAttribute('aria-hidden', 'false');
    save({ lastShown: Date.now(), signature: state.data.signature, snoozeUntil: 0 });
    armHide(); return true;
  }
  function ensure() {
    if (state.root) return;
    const root = el('aside', 'action-reminder'); root.id = 'actionReminder'; root.setAttribute('aria-label', 'Nhắc kiểm tra công việc');
    const mascot = el('button', 'ar-mascot-button'); mascot.type = 'button';
    mascot.setAttribute('aria-label', 'Xem lời nhắc công việc'); mascot.setAttribute('aria-expanded', 'false');
    mascot.setAttribute('aria-controls', 'arNudgeCopy');
    const pic = el('img', 'ar-mascot'); pic.src = '/logo-app-180.png'; pic.alt = ''; pic.width = 32; pic.height = 32;
    mascot.appendChild(pic); mascot.appendChild(el('span', 'ar-unread'));
    mascot.onclick = () => state.peeking ? settle() : peek(true);
    const copy = el('div', 'ar-copy'); copy.id = 'arNudgeCopy'; copy.setAttribute('aria-live', 'polite'); copy.setAttribute('aria-hidden', 'true');
    copy.appendChild(el('b', '', 'Kiểm tra công việc nhé'));
    /* Dòng số liệu: chữ chính + (khi có) liên kết phụ "· N tin nhắn chưa đọc". */
    const dong = el('span', 'ar-dong'); const hint = el('span', 'ar-chu');
    const phu = el('a', 'ar-phu'); phu.hidden = true; phu.tabIndex = -1;
    phu.onclick = (e) => diToi(e, phu.getAttribute('href') || '');
    dong.append(hint, phu); copy.appendChild(dong);
    const cta = el('a', 'ar-check', 'Kiểm tra ngay'); cta.tabIndex = -1; cta.setAttribute('aria-hidden', 'true');
    cta.onclick = (e) => diToi(e, cta.getAttribute('href') || '');
    const close = el('button', 'ar-close', '×'); close.type = 'button'; close.tabIndex = -1; close.setAttribute('aria-hidden', 'true');
    close.setAttribute('aria-label', 'Để sau, tạm ẩn lời nhắc một giờ'); close.onclick = later;
    root.append(mascot, copy, cta, close);
    root.addEventListener('pointerenter', () => clearTimeout(state.hideTimer));
    root.addEventListener('pointerleave', () => { if (state.peeking) armHide(); });
    root.addEventListener('focusin', () => clearTimeout(state.hideTimer));
    root.addEventListener('focusout', () => { if (state.peeking) armHide(); });
    state.root = root; state.refs = { mascot, copy, hint, phu, cta, close }; document.body.appendChild(root);
  }
  function update() {
    if (!state.data || !state.data.total || !allowed()) { remove(); return; }
    ensure(); const s = summary(state.data);
    // Không dựng lại thẻ khi polling: không mất focus và không chạy lại animation.
    if (state.refs.hint.textContent !== s.text) state.refs.hint.textContent = s.text;
    state.refs.cta.setAttribute('href', s.target);
    const phu = state.refs.phu;
    phu.hidden = !s.phu;
    if (s.phu) {
      const chu = ' · ' + s.phu.ngan;
      if (phu.textContent !== chu) phu.textContent = chu;
      phu.setAttribute('href', s.phu.target);
      phu.title = s.phu.dai;
    }
    state.refs.mascot.setAttribute('title', s.text + (s.phu ? ' · ' + s.phu.ngan : ''));
    state.root.classList.toggle('has-chat', !!(state.data.counts && state.data.counts.chat));
    state.root.classList.toggle('has-late', !!state.data.counts.late);
  }
  function idlePeek(manual) {
    clearTimeout(state.idleTimer);
    let attempts = 0;
    function attempt() {
      if (!allowed() || !state.data) return;
      if (blocked()) {
        if (++attempts < 15) state.idleTimer = setTimeout(attempt, 2000);
        return;
      }
      peek(manual);
    }
    state.idleTimer = setTimeout(attempt, 1200);
  }
  async function load(demo = false) {
    if (demo) state.pendingDemo = true;
    if (state.loading) return;
    if (!allowed()) { remove(); return; }
    state.loading = true;
    try {
      const r = await fetch('/m/cong-viec/api/bot-nghiem-thu?view=quick', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) { remove(); return; }
      const data = await r.json();
      if (!data.enabled || !data.total) { state.data = null; remove(); return; }
      state.data = data; update();
      const saved = read();
      if (state.pendingDemo) idlePeek(true);
      else if (!state.peeking && (!saved.lastShown ||
        (data.signature !== saved.signature && Date.now() - saved.lastShown >= 60 * MINUTE) ||
        Date.now() - saved.lastShown >= 4 * 60 * MINUTE)) idlePeek(false);
    } catch (_) { /* Mạng gián đoạn: không tạo thêm lời nhắc hay nhảy giao diện. */ }
    finally { state.loading = false; }
  }
  function start() {
    if (state.timer) return;
    load(location.hash === '#/nhac-viec');
    state.timer = setInterval(() => { if (!document.hidden) load(); }, MINUTE);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); else settle(); });
    window.addEventListener('hashchange', () => { if (!allowed()) remove(); else if (location.hash === '#/nhac-viec') load(true); else settle(); });
    window.addEventListener('storage', e => { if (state.data && e.key === key()) settle(); });
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && state.peeking) later(); });
    window.addEventListener('message', e => {
      if (e.origin !== location.origin || !e.data || e.data.hub !== 'che') return;
      if (e.data.mo) settle(); else load();
    });
  }
  window.HubActionReminder = { start, open: () => load(true), refresh: () => load() };
})();
