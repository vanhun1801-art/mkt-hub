'use strict';
/* Nhắc hành động trong Hub. Bản thử được máy chủ giới hạn theo tài khoản pilot. */
(function () {
  const state = { data: null, tab: 'urgent', expanded: false, all: false, loading: false, root: null,
    timer: null, shown: 0, lastSignature: '', stored: {}, focusBack: null };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const key = () => 'hub.action-reminder.' + state.data.accountKey;
  const read = () => { try { return JSON.parse(localStorage.getItem(key()) || JSON.stringify(state.stored || {})); } catch (_) { return state.stored || {}; } };
  const save = patch => { state.stored = Object.assign(read(), patch); try { localStorage.setItem(key(), JSON.stringify(state.stored)); } catch (_) {} };
  function allowed() {
    return typeof S !== 'undefined' && S.hub && !S.hub.khach && !S.xemNhu &&
      (S.modules || []).some(m => m.id === 'cong-viec' && m.bat !== false && (m.quanLyToi || S.quanLy));
  }
  function blocked() {
    return document.hidden || document.body.classList.contains('mod-che') ||
      !!document.querySelector('#tbPhu, #nlPhu, #modalWrap:not([hidden])') ||
      /^(INPUT|TEXTAREA|IFRAME)$/.test((document.activeElement || {}).tagName || '') ||
      !!((document.activeElement || {}).isContentEditable);
  }
  function remove() {
    if (state.root) state.root.remove(); state.root = null; state.expanded = false;
  }
  function button(text, cls, fn) {
    const b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b;
  }
  function collapsed() {
    state.expanded = false; state.all = false; save({ lastShown: Date.now(), signature: state.data.signature }); render();
  }
  function open(manual) {
    if (!state.data || !state.data.items.length || !allowed()) return;
    if (!manual && (blocked() || read().snoozeUntil > Date.now())) return;
    state.focusBack = document.activeElement;
    state.expanded = true; state.all = false; state.tab = 'urgent';
    save({ lastShown: Date.now(), signature: state.data.signature, snoozeUntil: 0 });
    render();
  }
  function snooze() {
    save({ snoozeUntil: Date.now() + 15 * 60000, lastShown: Date.now(), signature: state.data.signature });
    state.expanded = false; state.all = false; render();
  }
  function listFor(data, tab) {
    if (tab === 'review') return data.items.filter(x => x.kind === 'review');
    if (tab === 'progress') return data.items.filter(x => !['review', 'late'].includes(x.kind));
    return data.items.filter(x => x.kind !== 'review');
  }
  function linkFor(item) {
    try { const u = new URL(item.url, location.origin); return u.origin === location.origin ? u.href : null; } catch (_) { return null; }
  }
  function render() {
    if (!state.data || !state.data.enabled || !allowed() || !state.data.total) { remove(); return; }
    const data = state.data;
    if (!state.root) { state.root = el('aside', 'action-reminder'); state.root.id = 'actionReminder'; document.body.appendChild(state.root); }
    const root = state.root;
    root.classList.toggle('is-expanded', state.expanded);
    root.replaceChildren();
    const chip = button('', 'ar-chip', () => state.expanded ? collapsed() : open(true));
    chip.setAttribute('aria-label', 'Mở lời nhắc công việc · ' + data.total + ' việc');
    chip.setAttribute('aria-expanded', String(state.expanded)); chip.setAttribute('aria-controls', 'actionReminderPanel');
    const pic = el('img', 'ar-mascot'); pic.src = '/logo-app-180.png'; pic.alt = ''; pic.width = 38; pic.height = 38;
    chip.appendChild(pic);
    const label = el('span', 'ar-chip-copy');
    label.appendChild(el('b', '', 'Việc cần làm'));
    label.appendChild(el('small', '', read().snoozeUntil > Date.now() ? 'Đã hẹn nhắc sau 15 phút' : data.counts.late + ' trễ hạn · ' + data.counts.review + ' chờ duyệt'));
    chip.appendChild(label); chip.appendChild(el('span', 'ar-chip-count', String(data.total)));
    if (!state.expanded) { root.appendChild(chip); return; }
    const panel = el('section', 'ar-panel'); panel.id = 'actionReminderPanel'; panel.setAttribute('aria-label', 'Lời nhắc công việc');
    const head = el('div', 'ar-head');
    const title = el('div', 'ar-heading'); title.appendChild(pic.cloneNode(true));
    const words = el('div'); words.appendChild(el('span', 'ar-eyebrow', 'MARKETING HUB · BẢN THỬ'));
    words.appendChild(el('h2', '', 'Mình xử lý việc nào trước?')); title.appendChild(words); head.appendChild(title);
    const close = button('×', 'ar-close', collapsed); close.setAttribute('aria-label', 'Thu gọn lời nhắc'); head.appendChild(close); panel.appendChild(head);
    panel.appendChild(el('p', 'ar-summary', data.scope + ' · ' + data.counts.late + ' việc trễ hạn · ' + data.counts.review + ' chờ nghiệm thu'));
    const tabs = el('div', 'ar-tabs'); tabs.setAttribute('aria-label', 'Nhóm công việc');
    for (const [k, text] of [['urgent', 'Cần xử lý'], ['review', 'Nghiệm thu ' + data.counts.review], ['progress', 'Đang thực hiện']]) {
      const b = button(text, 'ar-tab' + (state.tab === k ? ' on' : ''), () => { state.tab = k; state.all = false; render(); });
      b.setAttribute('aria-pressed', String(state.tab === k)); tabs.appendChild(b);
    }
    panel.appendChild(tabs);
    const rows = listFor(data, state.tab);
    const list = el('div', 'ar-list');
    for (const item of rows.slice(0, state.all ? rows.length : 3)) {
      const row = el('article', 'ar-item ar-' + item.kind);
      const topline = el('div', 'ar-item-top'); topline.appendChild(el('span', 'ar-dot')); topline.appendChild(el('b', '', item.title)); row.appendChild(topline);
      row.appendChild(el('span', 'ar-person', item.person + ' · ' + item.why));
      row.appendChild(el('p', 'ar-next', (item.kind === 'review' ? 'Anh cần làm: ' : 'Bước tiếp theo: ') + item.action));
      const url = linkFor(item);
      if (url) {
        const a = el('a', 'ar-task-link', item.kind === 'review' ? 'Xem sản phẩm & duyệt →' : 'Mở việc để xử lý →');
        a.href = url; a.onclick = () => { save({ snoozeUntil: Date.now() + 15 * 60000 }); state.expanded = false; render(); }; row.appendChild(a);
      }
      list.appendChild(row);
    }
    if (!rows.length) list.appendChild(el('p', 'ar-empty', 'Nhóm này hiện không có việc cần nhắc.'));
    panel.appendChild(list);
    const foot = el('div', 'ar-foot');
    foot.appendChild(button('Nhắc sau 15 phút', 'ar-snooze', snooze));
    if (!state.all && rows.length > 3) foot.appendChild(button('Xem thêm ' + (rows.length - 3) + ' việc', 'ar-more', () => { state.all = true; render(); }));
    else foot.appendChild(button('Thu gọn', 'ar-more', collapsed));
    panel.appendChild(foot); root.appendChild(panel);
  }
  async function load(forceOpen = false) {
    if (state.loading) return;
    if (!allowed()) { remove(); return; }
    state.loading = true;
    try {
      const r = await fetch('/m/cong-viec/api/bot-nghiem-thu?view=quick', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) { remove(); return; }
      const data = await r.json();
      if (!data.enabled) { state.data = null; remove(); return; }
      const changed = !state.data || state.data.signature !== data.signature;
      state.data = data; state.stored = read();
      if (forceOpen) open(true);
      else if (!state.expanded && !blocked()) {
        const saved = read();
        if (saved.snoozeUntil && saved.snoozeUntil <= Date.now()) open(false);
        else if (!saved.snoozeUntil && (!saved.lastShown || (changed && Date.now() - saved.lastShown >= 30 * 60000))) open(false);
      }
      if (changed || !state.root || !state.expanded) render();
    } catch (_) { /* Kết nối gián đoạn: giữ thẻ, lần sau đọc lại; không biến thành lời nhắc lỗi. */ }
    finally { state.loading = false; }
  }
  function start() {
    if (state.timer) return;
    load(location.hash === '#/nhac-viec');
    state.timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
    window.addEventListener('hashchange', () => { if (!allowed()) remove(); else if (location.hash === '#/nhac-viec') load(true); });
    window.addEventListener('storage', e => { if (state.data && e.key === key()) { state.expanded = false; render(); } });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.expanded) { collapsed(); if (state.root) state.root.querySelector('button').focus(); }
    });
    window.addEventListener('message', e => {
      if (e.origin === location.origin && e.data && e.data.hub === 'che') {
        if (e.data.mo) { if (state.root) state.root.hidden = true; }
        else { if (state.root) state.root.hidden = false; load(); }
      }
    });
  }
  window.HubActionReminder = { start, open: () => load(true), refresh: () => load() };
})();
