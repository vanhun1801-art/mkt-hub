/* ===== App quản lý quảng cáo đa nền tảng — Rooty Trip ===== */
'use strict';

/* ---------------- trạng thái ---------------- */
const S = {
  meta: null,
  tab: 'tong-quan',
  filter: { days: 7, from: '', to: '', platforms: [], campaigns: [] },
  cache: {},
  sort: {},
  entry: { date: '', rows: [], dirty: {} },
  nguon: localStorage.getItem('nguon-so') || '',   // '' = tự chọn, 'live', 'base'
  alertCount: 0,
};

const TABS = [
  { id: 'tong-quan', label: 'Tổng quan', filters: true },
  { id: 'nen-tang', label: 'Nền tảng', filters: true },
  { id: 'chien-dich', label: 'Chiến dịch', filters: true },
  { id: 'nhom', label: 'Nhóm quảng cáo', filters: true },
  { id: 'quang-cao', label: 'Quảng cáo', filters: true },
  { id: 'nhap-so', label: 'Nhập số hằng ngày', filters: false },
  { id: 'du-lieu', label: 'Dữ liệu theo ngày', filters: true },
  { id: 'canh-bao', label: 'Cảnh báo', filters: false },
  { id: 'doanh-thu', label: 'Doanh thu & ROAS', filters: true },
  { id: 'ket-noi', label: 'Kết nối & Đồng bộ', filters: false },
];

/* ---------------- tiện ích ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const vnd = (n) => (Math.round(Number(n) || 0)).toLocaleString('vi-VN') + 'đ';
const int = (n) => (Math.round(Number(n) || 0)).toLocaleString('vi-VN');
const pct = (n) => (n == null ? '—' : (Math.round(Number(n) * 100) / 100).toLocaleString('vi-VN') + '%');
const dmy = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '—');

const PLAT_CLASS = { Facebook: 'fb', TikTok: 'tt', 'Google Ads': 'gg' };
const platTag = (p) => `<span class="tag ${PLAT_CLASS[p] || ''}">${esc(p)}</span>`;

const STATUS_CLASS = {
  'Đang chạy': 'good', 'Đã duyệt': 'good', 'Nháp': '', 'Chờ duyệt': 'warn',
  'Tạm dừng': 'warn', 'Kết thúc': '', 'Bị từ chối': 'bad',
};
const statusTag = (s) => `<span class="tag ${STATUS_CLASS[s] || ''}">${esc(s)}</span>`;

const ACTION_CLASS = { great: 'good', good: 'good', warn: 'warn', bad: 'bad', idle: '' };

/** Mũi tên xu hướng. Với các chỉ số "càng thấp càng tốt" thì đảo màu. */
function trend(v, lowerBetter) {
  if (v == null) return '<span class="trend flat">mới</span>';
  if (Math.abs(v) < 0.05) return '<span class="trend flat">±0%</span>';
  const up = v > 0;
  const goodDir = lowerBetter ? !up : up;
  return `<span class="trend ${goodDir ? 'up' : 'down'}">${up ? '+' : '−'}${Math.abs(v).toLocaleString('vi-VN')}%</span>`;
}

function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6500 : 3200);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const txt = await res.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : {}; } catch (_) { json = { error: txt.slice(0, 300) }; }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function qs() {
  const f = S.filter;
  const p = new URLSearchParams();
  if (f.from && f.to) { p.set('from', f.from); p.set('to', f.to); }
  else p.set('days', String(f.days));
  if (f.platforms.length) p.set('platform', f.platforms.join(','));
  if (f.campaigns.length) p.set('campaign', f.campaigns.join(','));
  if (S.nguon) p.set('nguon', S.nguon);
  return p.toString();
}

/* ---------------- bảng có sắp xếp ---------------- */
/**
 * cols: [{ key, label, num, cls, render(row), sortVal(row), foot(rows) }]
 */
function table(id, cols, rows, opts = {}) {
  const sort = S.sort[id] || opts.sort || {};
  if (sort.key) {
    const col = cols.find((c) => c.key === sort.key);
    if (col) {
      const val = (r) => (col.sortVal ? col.sortVal(r) : r[col.key]);
      rows = rows.slice().sort((a, b) => {
        const x = val(a), y = val(b);
        const cmp = typeof x === 'string' || typeof y === 'string'
          ? String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'vi')
          : (Number(x || 0) - Number(y || 0));
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
  }
  const th = cols.map((c) => {
    const on = sort.key === c.key;
    return `<th class="${c.num ? 'num' : ''} ${c.noSort ? 'no-sort' : ''}" data-tbl="${id}" data-key="${esc(c.key)}" title="${esc(c.title || c.label)}">${esc(c.label)}${on ? ` <span class="arrow">${sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`;
  }).join('');
  const body = rows.length ? rows.map((r) => `<tr${opts.rowAttrs ? ' ' + opts.rowAttrs(r) : ''}>${cols.map((c) => {
    const v = c.render ? c.render(r) : esc(r[c.key]);
    return `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${v}</td>`;
  }).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}"><div class="empty">${esc(opts.empty || 'Không có dữ liệu')}</div></td></tr>`;
  const foot = opts.footer && rows.length
    ? `<tfoot><tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.foot ? c.foot(rows) : ''}</td>`).join('')}</tr></tfoot>` : '';
  return `<div class="tbl-wrap"><table class="tbl ${opts.cls || ''}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}

document.addEventListener('click', (e) => {
  const th = e.target.closest('th[data-tbl]');
  if (!th || th.classList.contains('no-sort')) return;
  const id = th.dataset.tbl, key = th.dataset.key;
  const cur = S.sort[id] || {};
  S.sort[id] = { key, dir: cur.key === key && cur.dir === 'desc' ? 'asc' : 'desc' };
  render();
});

/* ---------------- cột chỉ số dùng chung ---------------- */
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const metricCols = (opts = {}) => {
  const c = [
    { key: 'spend', label: 'Chi tiêu', num: true, render: (r) => `<b>${vnd(r.spend)}</b>`, foot: (rs) => vnd(sum(rs, 'spend')) },
    { key: 'impressions', label: 'Hiển thị', num: true, render: (r) => int(r.impressions), foot: (rs) => int(sum(rs, 'impressions')) },
    { key: 'clicks', label: 'Click', num: true, render: (r) => int(r.clicks), foot: (rs) => int(sum(rs, 'clicks')) },
    { key: 'ctr', label: 'CTR', num: true, title: 'Click / Hiển thị', render: (r) => pct(r.ctr), foot: (rs) => pct(sum(rs, 'impressions') ? (sum(rs, 'clicks') / sum(rs, 'impressions')) * 100 : 0) },
    { key: 'cpc', label: 'CPC', num: true, title: 'Chi phí mỗi click', render: (r) => vnd(r.cpc), foot: (rs) => vnd(sum(rs, 'clicks') ? sum(rs, 'spend') / sum(rs, 'clicks') : 0) },
    { key: 'cpm', label: 'CPM', num: true, title: 'Chi phí 1.000 hiển thị', render: (r) => vnd(r.cpm), foot: (rs) => vnd(sum(rs, 'impressions') ? (sum(rs, 'spend') / sum(rs, 'impressions')) * 1000 : 0) },
    { key: 'conversions', label: 'Chuyển đổi', num: true, render: (r) => `<b>${int(r.conversions)}</b>`, foot: (rs) => int(sum(rs, 'conversions')) },
    { key: 'cpa', label: 'CPA', num: true, title: 'Chi phí mỗi chuyển đổi', render: (r) => cpaCell(r), foot: (rs) => vnd(sum(rs, 'conversions') ? sum(rs, 'spend') / sum(rs, 'conversions') : 0) },
  ];
  return opts.only ? c.filter((x) => opts.only.includes(x.key)) : c;
};

function cpaCell(r) {
  if (!r.conversions) return '<span class="tag">—</span>';
  const v = vnd(r.cpa);
  if (r.cpaVsTarget == null) return v;
  const cls = r.cpaVsTarget <= 0 ? 'good' : r.cpaVsTarget <= 30 ? 'warn' : 'bad';
  const sign = r.cpaVsTarget > 0 ? '+' : '';
  return `${v} <span class="tag ${cls}">${sign}${Math.round(r.cpaVsTarget)}%</span>`;
}

function budgetCell(r) {
  if (!r.budget) return '<span class="sub-line">chưa đặt</span>';
  const p = r.budgetUsedPct || 0;
  const cls = p >= 100 ? 'bad' : p >= 80 ? 'warn' : '';
  return `<div>${vnd(r.budget)} <span class="tag ${cls}">${pct(p)}</span></div>
    <div class="bar-mini ${cls}"><i style="width:${Math.min(100, p)}%"></i></div>
    <span class="sub-line">${r.budgetLeft != null && r.budgetLeft >= 0 ? 'còn ' + vnd(r.budgetLeft) : 'vượt ' + vnd(Math.abs(r.budgetLeft || 0))} · cả kỳ ${vnd(r.lifetimeSpend || 0)}</span>`;
}

/* ---------------- khung ---------------- */
function renderShell() {
  $('#tabs').innerHTML = TABS.map((t) =>
    `<button class="tab ${S.tab === t.id ? 'on' : ''}" data-tab="${t.id}">${t.label}${t.id === 'canh-bao' && S.alertCount ? `<span class="badge">${S.alertCount}</span>` : ''}</button>`).join('');
  $$('#tabs .tab').forEach((b) => b.onclick = () => { S.tab = b.dataset.tab; renderShell(); render(); });
  const cur = TABS.find((t) => t.id === S.tab);
  $('#filters').hidden = !(cur && cur.filters);
}


/** Huy hiệu nguồn số: trực tiếp từ nền tảng, hay đọc từ Lark Base. */
function renderNguon() {
  const el = $('#srcChip');
  if (!el) return;
  const L = S.meta.live || { bat: false };
  const coKenh = (S.meta.kenhTrucTiep || []).length > 0;

  if (L.bat) {
    const gio = L.layLuc ? new Date(L.layLuc).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
    el.className = 'btn src on';
    el.innerHTML = `<span class="dot"></span>Trực tiếp · ${esc(L.nenTang.join(', '))}` + (gio ? ` <span class="t">${gio}</span>` : '');
    el.title = `Số ${L.from} → ${L.to} lấy thẳng từ ${L.nenTang.join(', ')}, lịch sử cũ hơn lấy từ Lark Base.`
      + (L.loi && L.loi.length ? '\nLỗi: ' + L.loi.map((x) => x.platform + ': ' + x.loi).join('; ') : '')
      + '\nBấm để xem số đang lưu trong Base.';
  } else {
    el.className = 'btn src' + (coKenh ? ' off' : '');
    el.innerHTML = coKenh ? '<span class="dot"></span>Đang xem số trong Base' : 'Số từ Lark Base';
    el.title = coKenh
      ? 'Đang đọc số đã lưu trong Base. Bấm để lấy trực tiếp từ nền tảng.'
      : 'Chưa nối kênh nào — chạy: node ket-noi.js';
  }
  el.onclick = () => {
    if (!coKenh) { toast('Chưa nối kênh nào. Chạy: node ket-noi.js', 'err'); return; }
    S.nguon = L.bat ? 'base' : 'live';
    localStorage.setItem('nguon-so', S.nguon);
    loadMeta().then(render);
  };
}

function renderFilters() {
  const m = S.meta;
  $('#linkBase').href = m.baseUrl;
  $('#meChip').textContent = m.me ? m.me.name : 'chưa đăng nhập lark-cli';
  renderNguon();
  $('#brandSub').textContent =
    `${m.counts.campaigns} chiến dịch · ${m.counts.groups} nhóm · ${m.counts.ads} quảng cáo · ${m.counts.daily} dòng ngày · dữ liệu tới ${dmy(m.maxDate)}`;

  /* Mốc thời gian lấy theo bộ chuẩn của lớp vỏ (loc.js): quản lý một bộ, nhân sự
   * một bộ hẹp hơn. Chạy đứng một mình (không qua lớp vỏ) thì giữ bộ mốc cũ. */
  const duoiHub = !!(window.HUB_LOC && window.__HUB__);
  const laNS = duoiHub && window.__HUB__.quanLy === false;
  const RANGES = duoiHub
    ? window.HUB_LOC.danhSachTheoVai(window.__HUB__.quanLy)
        .map((x) => ({ k: 'ns:' + x.tu + ':' + x.den, label: x.ten }))
    : [
      { k: 'today', label: 'Hôm nay' }, { k: 'thang', label: 'Tháng này' },
      { k: 7, label: '7 ngày' }, { k: 14, label: '14 ngày' },
      { k: 30, label: '30 ngày' }, { k: 'all', label: 'Toàn bộ' },
    ];
  // hai ô ngày là khoảng tuỳ chọn -> nhân sự không có
  if (laNS) {
    ['#fFrom', '#fTo'].forEach((sel) => {
      const g = $(sel) && $(sel).closest('.fgroup');
      if (g) g.hidden = true;
    });
  }
  // Nhiều mốc có thể trùng nhau (VD Base chỉ có dữ liệu tháng này thì "Tháng này"
  // và "Toàn bộ" cùng khớp) — chỉ sáng mốc khớp đầu tiên cho khỏi rối.
  let daSang = false;
  $('#rangeSeg').innerHTML = RANGES.map((r) => {
    const on = !daSang && isRangeOn(r.k);
    if (on) daSang = true;
    return `<button data-range="${r.k}" class="${on ? 'on' : ''}">${r.label}</button>`;
  }).join('');
  $$('#rangeSeg button').forEach((b) => b.onclick = () => {
    const k = b.dataset.range;
    if (String(k).startsWith('ns:')) {
      const [, tu, den] = String(k).split(':');
      S.filter.from = tu; S.filter.to = den;
    }
    else if (k === 'today') { S.filter.from = S.filter.to = m.today; }
    else if (k === 'thang') { const t = thangNay(m); S.filter.from = t.from; S.filter.to = t.to; }
    else if (k === 'all') { S.filter.from = m.minDate; S.filter.to = m.maxDate; }
    else { S.filter.from = ''; S.filter.to = ''; S.filter.days = Number(k); }
    syncDateInputs(); renderFilters(); render();
    baoKhoangLenHub();
  });

  syncDateInputs();
  $('#fFrom').min = $('#fTo').min = m.minDate;
  $('#fFrom').onchange = $('#fTo').onchange = () => {
    S.filter.from = $('#fFrom').value; S.filter.to = $('#fTo').value;
    if (S.filter.from && S.filter.to) { renderFilters(); render(); baoKhoangLenHub(); }
  };

  $('#fPlatform').innerHTML = m.platforms.map((p) =>
    `<button class="pill ${PLAT_CLASS[p] || ''} ${S.filter.platforms.includes(p) ? 'on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('');
  $$('#fPlatform .pill').forEach((b) => b.onclick = () => {
    const p = b.dataset.p;
    const i = S.filter.platforms.indexOf(p);
    if (i < 0) S.filter.platforms.push(p); else S.filter.platforms.splice(i, 1);
    renderFilters(); render();
  });

  const sel = $('#fCampaign');
  sel.size = Math.min(3, Math.max(1, m.campaigns.length));
  sel.innerHTML = m.campaigns.map((c) =>
    `<option value="${c.id}" ${S.filter.campaigns.includes(c.id) ? 'selected' : ''}>${esc(c.name)} · ${esc(c.platform)}</option>`).join('');
  sel.onchange = () => {
    S.filter.campaigns = [...sel.selectedOptions].map((o) => o.value);
    render();
  };

  $('#btnClearFilter').onclick = () => {
    S.filter = { days: 7, from: '', to: '', platforms: [], campaigns: [] };
    renderFilters(); render();
  };
}

/* ---------------- bộ lọc chung với lớp vỏ Marketing Hub ----------------
 * Một khoảng thời gian cho cả phòng: đổi ở đây thì Bảng công việc, Lịch tác
 * nghiệp và trang Tổng quan chung đổi theo, và ngược lại.
 */
function khoangDangLoc() {
  const f = S.filter;
  if (f.from && f.to) return { tu: f.from, den: f.to };
  // đang lọc kiểu "N ngày gần nhất" -> quy về khoảng ngày thật để base khác hiểu
  const el = $('#fFrom');
  if (el && el.value && $('#fTo').value) return { tu: el.value, den: $('#fTo').value };
  return null;
}

function baoKhoangLenHub() {
  if (!window.hubBaoKhoang) return;
  const m = S.meta || {};
  const k = khoangDangLoc();
  // "Toàn bộ" = cả kho số liệu -> báo lên là không giới hạn, đừng gửi min/max
  if (k && k.tu === m.minDate && k.den === m.maxDate) return window.hubBaoKhoang('', '');
  window.hubBaoKhoang(k ? k.tu : '', k ? k.den : '');
}

/** Lớp vỏ gọi xuống khi bộ lọc chung đổi. */
window.hubApKhoang = function (tu, den) {
  // Lớp vỏ gửi khoảng ngay khi trang vừa mở, có thể trước lúc nạp xong meta —
  // nhớ lại rồi áp sau, nếu không lần mở đầu tiên sẽ lệch bộ lọc chung.
  if (!S.meta) { window.__hubKhoangCho = { tu, den }; return; }
  const m = S.meta;
  if (tu && den) {
    if (S.filter.from === tu && S.filter.to === den) return;
    S.filter.from = tu;
    S.filter.to = den;
  } else {
    if (S.filter.from === m.minDate && S.filter.to === m.maxDate) return;
    S.filter.from = m.minDate;               // toàn bộ
    S.filter.to = m.maxDate;
  }
  syncDateInputs();
  renderFilters();
  render();
};

/** Áp khoảng lớp vỏ vào bộ lọc lúc boot (chưa vẽ dữ liệu — boot vẽ ngay sau đó).
 *  Vẫn phải đồng bộ lại thanh lọc, nếu không hai ô ngày hiện một khoảng mà số
 *  liệu bên dưới lại tính theo khoảng khác. */
function hubApKhoangSauNap(tu, den) {
  const m = S.meta;
  if (tu && den) { S.filter.from = tu; S.filter.to = den; }
  else { S.filter.from = m.minDate; S.filter.to = m.maxDate; }
  syncDateInputs();
  renderFilters();
}

function isRangeOn(k) {
  const f = S.filter, m = S.meta;
  if (String(k).startsWith('ns:')) {
    const [, tu, den] = String(k).split(':');
    return f.from === tu && f.to === den;
  }
  if (k === 'today') return f.from === m.today && f.to === m.today;
  if (k === 'thang') { const t = thangNay(m); return f.from === t.from && f.to === t.to; }
  if (k === 'all') return f.from === m.minDate && f.to === m.maxDate;
  return !f.from && f.days === Number(k);
}

function syncDateInputs() {
  const f = S.filter, m = S.meta;
  if (f.from && f.to) { $('#fFrom').value = f.from; $('#fTo').value = f.to; return; }
  const to = m.maxDate;
  const d = new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (f.days - 1));
  $('#fFrom').value = d.toISOString().slice(0, 10);
  $('#fTo').value = to;
}

/* ---------------- điều phối màn hình ---------------- */
const VIEW = {};

async function render() {
  const view = $('#view');
  const fn = VIEW[S.tab];
  if (!fn) { view.innerHTML = '<div class="empty">Chưa có màn hình này</div>'; return; }
  view.dataset.loading = '1';
  try {
    await fn(view);
  } catch (e) {
    view.innerHTML = `<div class="card"><div class="card-body"><b style="color:var(--bad)">Lỗi:</b> ${esc(e.message)}</div></div>`;
    toast(e.message, 'err');
  }
  delete view.dataset.loading;
}

/* ================= TAB: TỔNG QUAN ================= */
VIEW['tong-quan'] = async (view) => {
  const d = await api('/api/overview?' + qs());
  S.alertCount = d.alerts.length;
  renderShell();

  const K = [
    { label: 'Chi tiêu', value: vnd(d.kpi.spend), t: d.delta.spend, lower: true, foot: `kỳ trước ${vnd(d.prev.spend)}` },
    { label: 'Chuyển đổi', value: int(d.kpi.conversions), t: d.delta.conversions, lower: false, foot: `kỳ trước ${int(d.prev.conversions)}` },
    { label: 'CPA', value: vnd(d.kpi.cpa), t: d.delta.cpa, lower: true, foot: `mục tiêu ${vnd(d.targets.cpa.default)}` },
    { label: 'CTR', value: pct(d.kpi.ctr), t: d.delta.ctr, lower: false, foot: `${int(d.kpi.clicks)} click / ${int(d.kpi.impressions)} hiển thị` },
    { label: 'CPC', value: vnd(d.kpi.cpc), t: d.delta.cpc, lower: true, foot: `CPM ${vnd(d.kpi.cpm)}` },
    { label: 'Tỉ lệ chuyển đổi', value: pct(d.kpi.cvr), t: d.delta.cvr, lower: false, foot: 'chuyển đổi / click' },
  ];

  view.innerHTML = `
  <div class="help">Số liệu ${dmy(d.range.from)} → ${dmy(d.range.to)} (${d.range.days} ngày) · kỳ trước ${dmy(d.range.prevFrom)} → ${dmy(d.range.prevTo)}</div>
  <div class="kpis">${K.map((k) => `
    <div class="kpi">
      <div class="k-label">${k.label}</div>
      <div class="k-value">${k.value}</div>
      <div class="k-foot">${trend(k.t, k.lower)} <span>${k.foot}</span></div>
    </div>`).join('')}</div>

  <div class="grid g-2-1" style="margin-top:14px">
    <div class="card">
      <div class="card-head"><h3>Chi tiêu theo ngày × nền tảng <span class="sub">— đường đỏ là CPA</span></h3></div>
      <div class="card-body tight"><div id="chartSpend" style="padding:10px 14px 0"></div>
        <div class="legend" id="legendSpend"></div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Tỉ trọng chi tiêu</h3></div>
      <div class="card-body" style="display:grid;place-items:center"><div id="chartDonut"></div>
        <div class="legend" id="legendDonut" style="padding-top:10px"></div></div>
    </div>
  </div>

  <div class="grid g2" style="margin-top:14px">
    <div class="card">
      <div class="card-head"><h3>Chuyển đổi & CPA theo ngày</h3></div>
      <div class="card-body tight"><div id="chartConv" style="padding:10px 14px 0"></div>
        <div class="legend"><span><i style="background:#12a150"></i>Chuyển đổi</span><span><i style="background:#dc2b3d"></i>CPA</span></div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>CPA theo chiến dịch <span class="sub">— vạch đỏ = CPA mục tiêu</span></h3></div>
      <div class="card-body"><div id="chartCpa"></div></div>
    </div>
  </div>

  <div class="grid g2" style="margin-top:14px">
    <div class="card">
      <div class="card-head"><h3>Quảng cáo hiệu quả nhất</h3><span class="sub">CPA thấp nhất, chi tiêu ≥ ${vnd(d.targets.minSpendJudge)}</span></div>
      <div class="card-body tight" id="topAds"></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Quảng cáo cần xử lý</h3><span class="sub">CPA cao hoặc không ra chuyển đổi</span></div>
      <div class="card-body tight" id="worstAds"></div>
    </div>
  </div>

  <div class="card" style="margin-top:14px">
    <div class="card-head"><h3>Cảnh báo nổi bật</h3>
      <button class="btn small ghost" onclick="window.__goTab('canh-bao')">Xem tất cả (${d.alerts.length})</button></div>
    <div class="card-body tight"><div class="alert-list">${alertsHtml(d.alerts.slice(0, 6))}</div></div>
  </div>`;

  const keys = d.platformKeys.filter((k) => d.stack.some((s) => s[k] > 0));
  const stackRows = d.stack.map((s, i) => ({ ...s, cpa: d.series[i].cpa }));
  Charts.stackedBars($('#chartSpend'), stackRows, keys, {
    lineKey: 'cpa', lineLabel: 'CPA', fmtTip: vnd, fmtLine: vnd, height: 270,
  });
  $('#legendSpend').innerHTML = keys.map((k, i) =>
    `<span><i style="background:${Charts.colorFor(k, i)}"></i>${esc(k)}</span>`).join('') +
    '<span><i style="background:#dc2b3d"></i>CPA (trục phải)</span>';

  Charts.donut($('#chartDonut'), d.byPlatform.map((p) => ({ label: p.platform, value: p.spend })), { fmt: vnd, centerLabel: 'Chi tiêu' });
  $('#legendDonut').innerHTML = d.byPlatform.map((p, i) =>
    `<span><i style="background:${Charts.colorFor(p.platform, i)}"></i>${esc(p.platform)} · ${pct(p.shareSpend)}</span>`).join('');

  Charts.stackedBars($('#chartConv'), d.series, ['conversions'], {
    lineKey: 'cpa', lineLabel: 'CPA', fmtTip: int, fmtLine: vnd, height: 230,
  });
  const mauLuc = getComputedStyle(document.documentElement).getPropertyValue('--good').trim() || '#12a150';
  $('#chartConv').querySelectorAll('rect').forEach((r) => r.setAttribute('fill', mauLuc));

  Charts.hbars($('#chartCpa'), d.byCampaign.filter((c) => c.conversions > 0)
    .map((c, i) => ({ label: c.name + ' · ' + c.platform, value: c.cpa, color: Charts.colorFor(c.platform, i) })),
    { fmt: vnd, marker: d.targets.cpa.default, labelW: 330, rowH: 32 });

  $('#topAds').innerHTML = adMiniTable('topAds', d.topAds);
  $('#worstAds').innerHTML = adMiniTable('worstAds', d.worstAds);
};

function adMiniTable(id, rows) {
  return table(id, [
    { key: 'name', label: 'Quảng cáo', cls: 'name', render: (r) => `<button class="link-btn" onclick="window.__adDetail('${r.id}')">${esc(r.name)}</button><span class="sub-line">${esc(r.campaignName)} · ${esc(r.platform)}</span>` },
    { key: 'spend', label: 'Chi tiêu', num: true, render: (r) => vnd(r.spend) },
    { key: 'conversions', label: 'CĐ', num: true, render: (r) => int(r.conversions) },
    { key: 'cpa', label: 'CPA', num: true, render: (r) => cpaCell(r) },
    { key: 'action', label: 'Khuyến nghị', render: (r) => `<span class="tag ${ACTION_CLASS[r.actionLevel]}" title="${esc(r.reason)}">${esc(r.action)}</span>` },
  ], rows, { empty: 'Chưa đủ dữ liệu để xếp hạng' });
}

/* ================= TAB: NỀN TẢNG ================= */
VIEW['nen-tang'] = async (view) => {
  const d = await api('/api/overview?' + qs());
  const cols = [
    { key: 'platform', label: 'Nền tảng', render: (r) => platTag(r.platform) },
    ...metricCols(),
    { key: 'shareSpend', label: '% chi tiêu', num: true, render: (r) => `${pct(r.shareSpend)}<div class="bar-mini"><i style="width:${r.shareSpend}%"></i></div>` },
    { key: 'shareConv', label: '% chuyển đổi', num: true, render: (r) => pct(r.shareConv) },
    { key: 'cpaTarget', label: 'CPA mục tiêu', num: true, render: (r) => vnd(r.cpaTarget) },
  ];
  view.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>Bảng so sánh nền tảng</h3><span class="sub">${dmy(d.range.from)} → ${dmy(d.range.to)}</span></div>
    <div class="card-body tight">${table('platTbl', cols, d.byPlatform, { footer: true })}</div>
  </div>
  <div class="grid g3" style="margin-top:14px">
    <div class="card"><div class="card-head"><h3>CPA theo nền tảng</h3></div><div class="card-body"><div id="cCpa"></div></div></div>
    <div class="card"><div class="card-head"><h3>CTR theo nền tảng</h3></div><div class="card-body"><div id="cCtr"></div></div></div>
    <div class="card"><div class="card-head"><h3>Chuyển đổi theo nền tảng</h3></div><div class="card-body"><div id="cConv"></div></div></div>
  </div>
  <div class="card" style="margin-top:14px">
    <div class="card-head"><h3>Chi tiêu theo ngày × nền tảng</h3></div>
    <div class="card-body tight"><div id="cStack" style="padding:10px 14px 0"></div><div class="legend" id="lStack"></div></div>
  </div>`;

  const items = (k, fmt) => d.byPlatform.map((p) => ({ label: p.platform, value: p[k], color: Charts.colorFor(p.platform, 0) }));
  Charts.hbars($('#cCpa'), items('cpa'), { fmt: vnd, labelW: 110, marker: d.targets.cpa.default });
  Charts.hbars($('#cCtr'), items('ctr'), { fmt: (v) => pct(v), labelW: 110, marker: d.targets.ctrMin });
  Charts.hbars($('#cConv'), items('conversions'), { fmt: int, labelW: 110 });

  const keys = d.platformKeys.filter((k) => d.stack.some((s) => s[k] > 0));
  Charts.stackedBars($('#cStack'), d.stack, keys, { fmtTip: vnd, height: 260 });
  $('#lStack').innerHTML = keys.map((k, i) => `<span><i style="background:${Charts.colorFor(k, i)}"></i>${esc(k)}</span>`).join('');
};

/* ================= TAB: CHIẾN DỊCH ================= */
VIEW['chien-dich'] = async (view) => {
  const d = await api('/api/campaigns?' + qs());
  const cols = [
    { key: 'name', label: 'Chiến dịch', cls: 'name', render: (r) => `
      ${r.id ? `<button class="link-btn" onclick="window.__campDetail('${r.id}')"><b>${esc(r.name)}</b></button>` : `<b>${esc(r.name)}</b>`}
      <span class="sub-line">${esc(r.objective || '')}${r.owners && r.owners.length ? ' · ' + esc(r.owners.join(', ')) : ''}</span>` },
    { key: 'platform', label: 'Nền tảng', render: (r) => platTag(r.platform) },
    { key: 'status', label: 'Trạng thái', render: (r) => statusTag(r.status) },
    { key: 'health', label: 'Sức khoẻ', num: true, sortVal: (r) => (r.health.score == null ? -1 : r.health.score), render: (r) => `<span class="tag ${r.health.score == null ? '' : r.health.score >= 80 ? 'good' : r.health.score >= 60 ? 'warn' : 'bad'}">${esc(r.health.label)}${r.health.score != null ? ' ' + r.health.score : ''}</span>` },
    ...metricCols(),
    { key: 'budget', label: 'Ngân sách (cả kỳ)', num: true, sortVal: (r) => r.budgetUsedPct || 0, render: budgetCell },
    { key: 'todaySpend', label: 'Hôm nay', num: true, render: (r) => r.dailyBudget ? `${vnd(r.todaySpend)}<span class="sub-line">NS/ngày ${vnd(r.dailyBudget)} · ${pct(r.dailyBudgetUsedPct)}</span>` : `${vnd(r.todaySpend)}<span class="sub-line">chưa đặt NS/ngày</span>` },
    { key: 'end', label: 'Lịch chạy', render: (r) => `${dmy(r.start)}<span class="sub-line">→ ${dmy(r.end)}</span>` },
    { key: 'adCount', label: 'Nhóm / QC', num: true, render: (r) => `${r.groupCount} / ${r.adCount}` },
  ];
  view.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>Chiến dịch</h3><span class="sub">${dmy(d.from)} → ${dmy(d.to)} · ${d.rows.length} dòng</span></div>
    <div class="card-body tight">${table('campTbl', cols, d.rows, { footer: true, sort: { key: 'spend', dir: 'desc' } })}</div>
  </div>`;
};

/* ================= TAB: NHÓM ================= */
VIEW['nhom'] = async (view) => {
  const d = await api('/api/groups?' + qs());
  const cols = [
    { key: 'name', label: 'Nhóm quảng cáo', cls: 'name', render: (r) => `<button class="link-btn" onclick="window.__groupDetail('${r.id}')"><b>${esc(r.name)}</b></button><span class="sub-line">${esc(r.campaignName)}</span>` },
    { key: 'platform', label: 'Nền tảng', render: (r) => platTag(r.platform) },
    { key: 'status', label: 'Trạng thái', render: (r) => statusTag(r.status) },
    { key: 'optimize', label: 'Tối ưu theo', render: (r) => esc(r.optimize || '—') },
    { key: 'placement', label: 'Vị trí', render: (r) => esc(r.placement || '—') },
    ...metricCols(),
    { key: 'budget', label: 'Ngân sách nhóm', num: true, render: (r) => r.budget ? vnd(r.budget) : '<span class="sub-line">chưa đặt</span>' },
    { key: 'adCount', label: 'Số QC', num: true },
  ];
  view.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>Nhóm quảng cáo</h3><span class="sub">${dmy(d.from)} → ${dmy(d.to)}</span></div>
    <div class="card-body tight">${table('grpTbl', cols, d.rows, { footer: true, sort: { key: 'spend', dir: 'desc' } })}</div>
  </div>`;
};

/* ================= TAB: QUẢNG CÁO ================= */
VIEW['quang-cao'] = async (view) => {
  const d = await api('/api/ads?' + qs());
  const cols = [
    { key: 'name', label: 'Quảng cáo', cls: 'name', render: (r) => `<button class="link-btn" onclick="window.__adDetail('${r.id}')"><b>${esc(r.name)}</b></button><span class="sub-line">${esc(r.campaignName)} › ${esc(r.groupName)}</span>` },
    { key: 'platform', label: 'Nền tảng', render: (r) => platTag(r.platform) },
    { key: 'creative', label: 'Creative', render: (r) => `${esc(r.creative || '—')}${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noreferrer" title="Mở creative">↗</a>` : ''}` },
    { key: 'approval', label: 'Duyệt', render: (r) => statusTag(r.approval) },
    ...metricCols(),
    { key: 'action', label: 'Khuyến nghị', render: (r) => `<span class="tag ${ACTION_CLASS[r.actionLevel]}" title="${esc(r.reason)}">${esc(r.action)}</span><span class="sub-line">${esc(r.reason)}</span>` },
    { key: 'lastDate', label: 'Số liệu mới nhất', render: (r) => r.lastDate ? `${dmy(r.lastDate)}<span class="sub-line">${r.activeDays} ngày có số</span>` : '<span class="tag warn">chưa có</span>' },
  ];
  view.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>Quảng cáo</h3><span class="sub">${dmy(d.from)} → ${dmy(d.to)} · ${d.rows.length} quảng cáo</span>
      <a class="btn small ghost" href="/api/export.csv?${qs()}">Xuất CSV</a></div>
    <div class="card-body tight">${table('adTbl', cols, d.rows, { footer: true, sort: { key: 'spend', dir: 'desc' } })}</div>
  </div>`;
};

/* ================= TAB: NHẬP SỐ ================= */
VIEW['nhap-so'] = async (view) => {
  const date = S.entry.date || S.meta.today;
  const d = await api('/api/entry?date=' + date);
  S.entry.date = d.date;
  S.entry.rows = d.rows;
  S.entry.dirty = {};

  const rowHtml = (r) => `
    <tr data-ad="${r.adId}" class="${r.filled ? 'filled' : ''} ${r.active ? '' : 'inactive'}">
      <td class="name">
        <b>${esc(r.adName)}</b>
        <span class="sub-line">${esc(r.campaignName)} › ${esc(r.groupName)}</span>
      </td>
      <td>${platTag(r.platform)}</td>
      <td>${r.filled ? `<span class="tag good">đã có${r.duplicated ? ' (' + r.recordIds.length + ' dòng)' : ''}</span>` : r.active ? '<span class="tag warn">chưa nhập</span>' : '<span class="tag">không chạy</span>'}</td>
      <td class="num"><input data-f="spend" value="${r.spend || ''}" placeholder="0" inputmode="numeric"></td>
      <td class="num"><input data-f="impressions" value="${r.impressions || ''}" placeholder="0" inputmode="numeric"></td>
      <td class="num"><input data-f="clicks" value="${r.clicks || ''}" placeholder="0" inputmode="numeric"></td>
      <td class="num"><input data-f="conversions" value="${r.conversions || ''}" placeholder="0" inputmode="numeric"></td>
      <td class="num" data-cpa>${r.conversions ? vnd(r.spend / r.conversions) : '—'}</td>
      <td class="num" data-prev='${JSON.stringify(r.prev)}'>${r.prev.spend
        ? `<span class="sub-line">${vnd(r.prev.spend)} · ${int(r.prev.conversions)} CĐ · CPA ${r.prev.conversions ? vnd(r.prev.cpa) : '—'}</span>
           <button class="btn small ghost" data-copy title="Chép số ngày trước vào dòng này">⤒ chép</button>`
        : '<span class="sub-line">—</span>'}</td>
      <td><input class="text" data-f="label" value="${esc(r.label || '')}" placeholder="ghi chú"></td>
    </tr>`;

  view.innerHTML = `
  <div class="card">
    <div class="card-head">
      <h3>Nhập hiệu suất ngày
        <span class="sub">đã nhập ${d.filled}/${d.total} quảng cáo đang chạy</span></h3>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn small ghost" id="dPrev">‹ Ngày trước</button>
        <input type="date" id="dDate" value="${d.date}" max="${S.meta.today}">
        <button class="btn small ghost" id="dNext">Ngày sau ›</button>
        <button class="btn small ghost" id="dToday">Hôm nay</button>
      </div>
    </div>
    <div class="card-body tight">
      <div class="tbl-wrap"><table class="tbl entry-tbl" id="entryTbl">
        <thead><tr>
          <th class="no-sort">Quảng cáo</th><th class="no-sort">Nền tảng</th><th class="no-sort">Tình trạng</th>
          <th class="no-sort num">Chi tiêu (đ)</th><th class="no-sort num">Hiển thị</th><th class="no-sort num">Click</th>
          <th class="no-sort num">Chuyển đổi</th><th class="no-sort num">CPA</th>
          <th class="no-sort num">Ngày trước (${dmy(d.prevDate)})</th><th class="no-sort">Nhãn</th>
        </tr></thead>
        <tbody>${d.rows.map(rowHtml).join('')}</tbody>
      </table></div>
      <div class="sticky-actions">
        <div id="entryStat" class="mono">—</div>
        <div style="display:flex;gap:8px">
          <button class="btn ghost" id="btnReset">Hoàn tác thay đổi</button>
          <button class="btn primary" id="btnSave">Lưu vào Lark Base</button>
        </div>
      </div>
    </div>
  </div>`;

  const recalcStat = () => {
    let spend = 0, conv = 0, filled = 0;
    $$('#entryTbl tbody tr').forEach((tr) => {
      const g = (f) => Number(($('[data-f=' + f + ']', tr) || {}).value || 0);
      const s = g('spend'), c = g('conversions');
      spend += s; conv += c;
      if (s || c || g('impressions') || g('clicks')) filled++;
      const cpaCellEl = $('[data-cpa]', tr);
      if (cpaCellEl) cpaCellEl.textContent = c ? vnd(s / c) : '—';
    });
    const nDirty = Object.keys(S.entry.dirty).length;
    $('#entryStat').innerHTML = `Tổng nhập: <b>${vnd(spend)}</b> · <b>${int(conv)}</b> chuyển đổi · CPA <b>${conv ? vnd(spend / conv) : '—'}</b> · ${filled} dòng có số${nDirty ? ` · <span style="color:var(--warn)">${nDirty} dòng đã sửa</span>` : ''}`;
  };

  const markDirty = (tr) => { tr.classList.add('dirty'); S.entry.dirty[tr.dataset.ad] = true; };

  $('#entryTbl').addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-f]');
    if (!inp) return;
    markDirty(inp.closest('tr'));
    recalcStat();
  });

  // chép số của ngày trước vào dòng hiện tại
  $('#entryTbl').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-copy]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const prev = JSON.parse(tr.querySelector('[data-prev]').dataset.prev);
    ['spend', 'impressions', 'clicks', 'conversions'].forEach((f) => {
      const el = $('[data-f=' + f + ']', tr);
      if (el) el.value = prev[f] || '';
    });
    markDirty(tr);
    recalcStat();
  });

  // Enter = xuống ô cùng cột ở dòng dưới (nhập nhanh theo cột)
  $('#entryTbl').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const inp = e.target.closest('input[data-f]');
    if (!inp) return;
    e.preventDefault();
    const f = inp.dataset.f;
    const trs = $$('#entryTbl tbody tr');
    const i = trs.indexOf(inp.closest('tr'));
    const next = trs[i + 1] && $('[data-f=' + f + ']', trs[i + 1]);
    if (next) { next.focus(); next.select(); }
  });
  recalcStat();

  const go = (dt) => { S.entry.date = dt; render(); };
  const shift = (n) => {
    const x = new Date(d.date + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n);
    go(x.toISOString().slice(0, 10));
  };
  $('#dPrev').onclick = () => shift(-1);
  $('#dNext').onclick = () => shift(1);
  $('#dToday').onclick = () => go(S.meta.today);
  $('#dDate').onchange = (e) => go(e.target.value);
  $('#btnReset').onclick = () => render();

  $('#btnSave').onclick = async () => {
    const dirty = Object.keys(S.entry.dirty);
    if (!dirty.length) return toast('Chưa có thay đổi nào để lưu');
    const rows = dirty.map((adId) => {
      const tr = $(`#entryTbl tbody tr[data-ad="${adId}"]`);
      const g = (f) => ($('[data-f=' + f + ']', tr) || {}).value;
      const src = S.entry.rows.find((r) => r.adId === adId) || {};
      return {
        adId,
        recordId: src.recordIds && src.recordIds.length === 1 ? src.recordIds[0] : undefined,
        spend: Number(g('spend') || 0),
        impressions: Number(g('impressions') || 0),
        clicks: Number(g('clicks') || 0),
        conversions: Number(g('conversions') || 0),
        label: g('label') || '',
      };
    });
    const btn = $('#btnSave');
    btn.disabled = true; btn.textContent = 'Đang lưu…';
    try {
      const r = await api('/api/entry', { method: 'POST', body: JSON.stringify({ date: d.date, rows }) });
      toast(`Đã lưu ngày ${dmy(r.date)}: tạo mới ${r.created}, cập nhật ${r.updated}${r.skipped.length ? `, bỏ qua ${r.skipped.length}` : ''}`, 'ok');
      S.entry.dirty = {};
      render();
    } catch (e) {
      toast('Lưu thất bại: ' + e.message, 'err');
      btn.disabled = false; btn.textContent = 'Lưu vào Lark Base';
    }
  };
};

/* ================= TAB: DỮ LIỆU THEO NGÀY ================= */
VIEW['du-lieu'] = async (view) => {
  const d = await api('/api/daily?' + qs());
  const cols = [
    { key: 'date', label: 'Ngày', render: (r) => dmy(r.date) },
    { key: 'adName', label: 'Quảng cáo', cls: 'name', render: (r) => `${r.orphan ? '<span class="tag bad">chưa gắn QC</span> ' : ''}<b>${esc(r.adName)}</b><span class="sub-line">${esc(r.campaignName)} › ${esc(r.groupName)}</span>` },
    { key: 'platform', label: 'Nền tảng', render: (r) => platTag(r.platform) },
    ...metricCols(),
    { key: 'label', label: 'Nhãn', render: (r) => esc(r.label || '') },
    { key: 'act', label: '', noSort: true, render: (r) => `<button class="btn small ghost" onclick="window.__dailyEdit('${r.id}')">Sửa</button>` },
  ];
  view.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>Dữ liệu theo ngày</h3><span class="sub">${d.rows.length} dòng · ${dmy(d.from)} → ${dmy(d.to)}</span>
      <a class="btn small ghost" href="/api/export.csv?${qs()}">Xuất CSV</a></div>
    <div class="card-body tight">${table('dailyTbl', cols, d.rows, { footer: true, sort: { key: 'date', dir: 'desc' } })}</div>
  </div>`;
};

/* ================= TAB: CẢNH BÁO ================= */
VIEW['canh-bao'] = async (view) => {
  const d = await api('/api/alerts');
  S.alertCount = d.rows.length;
  renderShell();
  const KIND = {
    budget: 'Ngân sách', 'budget-day': 'Ngân sách ngày', schedule: 'Lịch chạy',
    data: 'Dữ liệu', perf: 'Hiệu suất', meta: 'Cấu hình', spike: 'Biến động',
  };
  const groups = {};
  d.rows.forEach((a) => { (groups[a.kind] = groups[a.kind] || []).push(a); });
  const counts = { high: 0, mid: 0, low: 0 };
  d.rows.forEach((a) => counts[a.level]++);

  view.innerHTML = `
  <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">
    <div class="kpi"><div class="k-label">Nghiêm trọng</div><div class="k-value" style="color:var(--bad)">${counts.high}</div><div class="k-foot">vượt ngân sách · đốt tiền không ra chuyển đổi</div></div>
    <div class="kpi"><div class="k-label">Cần theo dõi</div><div class="k-value" style="color:var(--warn)">${counts.mid}</div><div class="k-foot">CPA cao · thiếu số liệu · sắp hết ngân sách</div></div>
    <div class="kpi"><div class="k-label">Ghi nhận</div><div class="k-value">${counts.low}</div><div class="k-foot">CTR thấp · lệch cấu hình</div></div>
  </div>
  ${Object.keys(groups).map((k) => `
    <div class="card" style="margin-top:14px">
      <div class="card-head"><h3>${esc(KIND[k] || k)}</h3><span class="sub">${groups[k].length} cảnh báo</span></div>
      <div class="card-body tight"><div class="alert-list">${alertsHtml(groups[k])}</div></div>
    </div>`).join('') || '<div class="card"><div class="empty">Không có cảnh báo nào</div></div>'}`;
};

function alertsHtml(rows) {
  if (!rows.length) return '<div class="empty">Không có cảnh báo</div>';
  return rows.map((a) => {
    let act = '';
    if (a.ref && a.ref.type === 'campaign') act = `<button class="btn small ghost" onclick="window.__campDetail('${a.ref.id}')">Mở chiến dịch</button>`;
    if (a.ref && a.ref.type === 'ad') act = `<button class="btn small ghost" onclick="window.__adDetail('${a.ref.id}')">Mở quảng cáo</button>`;
    return `<div class="alert ${a.level}">
      <span class="dot"></span>
      <div style="flex:1">
        <div class="a-title">${esc(a.title)}</div>
        <div class="a-detail">${esc(a.detail)}</div>
      </div>
      <div style="flex:none">${act}</div>
    </div>`;
  }).join('');
}

/* ================= TAB: DOANH THU ================= */
VIEW['doanh-thu'] = async (view) => {
  const d = await api('/api/sales?' + qs());
  const totalRev = d.byChannel.reduce((s, c) => s + c.revenue, 0);
  const totalSpend = d.byChannel.reduce((s, c) => s + c.spend, 0);
  const cols = [
    { key: 'channel', label: 'Kênh', render: (r) => platTag(r.channel) },
    { key: 'spend', label: 'Chi tiêu ads', num: true, render: (r) => vnd(r.spend), foot: (rs) => vnd(sum(rs, 'spend')) },
    { key: 'orders', label: 'Đơn đã chốt', num: true, render: (r) => int(r.orders), foot: (rs) => int(sum(rs, 'orders')) },
    { key: 'revenue', label: 'Doanh thu', num: true, render: (r) => `<b>${vnd(r.revenue)}</b>`, foot: (rs) => vnd(sum(rs, 'revenue')) },
    { key: 'cac', label: 'Chi phí / đơn', num: true, render: (r) => vnd(r.cac) },
    { key: 'roas', label: 'ROAS', num: true, render: (r) => `<span class="tag ${r.roas >= 3 ? 'good' : r.roas >= 1 ? 'warn' : 'bad'}">${r.roas}×</span>` },
  ];
  view.innerHTML = `
  <div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    <div class="kpi"><div class="k-label">Doanh thu</div><div class="k-value">${vnd(totalRev)}</div><div class="k-foot">đơn đã chốt</div></div>
    <div class="kpi"><div class="k-label">Chi tiêu ads</div><div class="k-value">${vnd(totalSpend)}</div><div class="k-foot">cùng khoảng thời gian</div></div>
    <div class="kpi"><div class="k-label">ROAS</div><div class="k-value">${totalSpend ? (Math.round((totalRev / totalSpend) * 100) / 100) + '×' : '—'}</div><div class="k-foot">doanh thu / chi tiêu</div></div>
    <div class="kpi"><div class="k-label">Lãi gộp trước COGS</div><div class="k-value" style="color:${totalRev - totalSpend >= 0 ? 'var(--good)' : 'var(--bad)'}">${vnd(totalRev - totalSpend)}</div><div class="k-foot">doanh thu − chi tiêu ads</div></div>
  </div>
  <div class="card" style="margin-top:14px">
    <div class="card-head"><h3>Hiệu quả theo kênh</h3><span class="sub">${dmy(d.from)} → ${dmy(d.to)}</span></div>
    <div class="card-body tight">${table('salesTbl', cols, d.byChannel, { footer: true, empty: 'Bảng Báo cáo Sales chưa có dữ liệu trong khoảng này' })}</div>
  </div>
  ${d.rows.length ? `<div class="card" style="margin-top:14px">
    <div class="card-head"><h3>Đơn gần nhất</h3><span class="sub">${d.rows.length} bản ghi</span></div>
    <div class="card-body tight">${table('salesRaw', [
      { key: 'date', label: 'Ngày', render: (r) => dmy(r.date) },
      { key: 'channel', label: 'Kênh', render: (r) => platTag(r.channel) },
      { key: 'customer', label: 'Khách', cls: 'name' },
      { key: 'service', label: 'Dịch vụ', cls: 'name' },
      { key: 'status', label: 'Trạng thái', render: (r) => statusTag(r.status === 'Đã chốt' ? 'Đã duyệt' : r.status).replace('Đã duyệt', esc(r.status)) },
      { key: 'revenue', label: 'Doanh thu', num: true, render: (r) => vnd(r.revenue) },
      { key: 'staff', label: 'Sales', render: (r) => esc((r.staff || []).map((s) => s.name).join(', ')) },
    ], d.rows, { sort: { key: 'date', dir: 'desc' } })}</div>
  </div>` : ''}

  <div id="roasKhoi" style="margin-top:14px"></div>`;

  await roasVe();
};

/* ================= ROAS TỪNG QUẢNG CÁO =================
 *
 * Bảng trên cùng tab này (Hiệu quả theo kênh) lấy từ bảng "Báo cáo Sales" trong
 * Base — số do người gõ. Khối dưới đây khác hẳn: nó ghi công doanh thu THẬT của
 * Tourwell về từng quảng cáo, bằng khoá lấy từ Pancake.
 *
 * Hai đường ghi công, độ tin khác nhau, và bảng nói rõ dòng nào đi đường nào:
 *   POS        — đơn POS mang cả ad_id lẫn mã lead Tourwell. Khoá cứng.
 *   hội thoại  — ghép bằng số điện thoại. Yếu hơn. Đường duy nhất của TikTok.
 */
const RS = { kq: null, dangChay: false };

async function roasVe() {
  const khoi = $('#roasKhoi');
  if (!khoi) return;
  let tt;
  try { tt = await api('/api/roas/trang-thai'); }
  catch (e) { khoi.innerHTML = ''; return; }

  const banXuat = (nhan, o) => (o
    ? `<b>${esc(nhan)}</b> ${int(o.dong)} dòng · ${dmy(o.tu)} → ${dmy(o.den)}`
      + (o.tongTien != null ? ` · ${vnd(o.tongTien)}` : '')
    : `<b>${esc(nhan)}</b> <span style="color:var(--bad)">chưa nhập</span>`);

  khoi.innerHTML = `
  <div class="card">
    <div class="card-head"><h3>ROAS từng quảng cáo</h3>
      <span class="sub">doanh thu Tourwell ghi công về quảng cáo, không dùng trường Nguồn</span></div>
    <div class="card-body">
      <div class="help">
        Cần hai bản xuất Excel từ Tourwell: <b>Danh sách lead</b> và <b>Danh sách đơn hàng</b>.
        App tự nhận file nào là file nào theo tên cột.
        <br>Xuất đơn hàng nhớ chọn tab <b>Tất cả</b> và <b>xoá bộ lọc Bán hàng</b> — nếu không sẽ chỉ ra đơn của chính mình.
      </div>
      <div class="help" style="${tt.coDuLieu ? '' : 'border-color:var(--warn);color:var(--warn)'}">
        ${banXuat('Lead:', tt.lead)}<br>${banXuat('Đơn hàng:', tt.don)}
        ${tt.coDuLieu ? `<br><span class="sub">nhập lúc ${new Date(tt.luc).toLocaleString('vi-VN')}</span>` : ''}
        ${tt.coDuLieu && tt.oDiaTam ? '<br><b style="color:var(--warn)">Dữ liệu nhập nằm trên ổ đĩa tạm — mất sau lần deploy kế tiếp, nhập lại là xong.</b>' : ''}
      </div>
      <div class="form-grid">
        <div class="field full"><label>Chọn hai file xuất từ Tourwell</label>
          <input type="file" id="rsFile" accept=".xlsx" multiple>
          <span class="hint">Chọn cả hai file một lượt cũng được</span></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn ghost" id="rsNhap" disabled>Nhập file</button>
        <button class="btn primary" id="rsTinh" ${tt.coDuLieu ? '' : 'disabled'}>Tính ROAS</button>
        ${tt.coDuLieu ? '<button class="btn ghost" id="rsXoa">Xoá dữ liệu đã nhập</button>' : ''}
      </div>
      <div id="rsKetQua" style="margin-top:12px"></div>
    </div>
  </div>`;

  const fi = $('#rsFile');
  fi.onchange = () => { $('#rsNhap').disabled = !fi.files.length; };

  $('#rsNhap').onclick = async (e) => {
    const b = e.currentTarget; const cu = b.textContent;
    b.disabled = true; b.textContent = 'Đang đọc…';
    try {
      const files = [];
      for (const f of fi.files) {
        const buf = await f.arrayBuffer();
        let bin = '';
        const u8 = new Uint8Array(buf);
        for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192));
        files.push({ ten: f.name, base64: btoa(bin) });
      }
      const r = await api('/api/roas/nhap', { method: 'POST', body: JSON.stringify({ files }) });
      toast('Đã nhập: ' + (r.nhanXet || []).map((x) => `${x.loai} ${x.dong} dòng`).join(' · '), 'ok');
      await roasVe();
    } catch (err) { toast(err.message, 'err'); b.disabled = false; b.textContent = cu; }
  };

  if ($('#rsXoa')) {
    $('#rsXoa').onclick = async () => {
      await api('/api/roas/xoa', { method: 'POST', body: '{}' });
      RS.kq = null;
      await roasVe();
    };
  }

  $('#rsTinh').onclick = async (e) => {
    const b = e.currentTarget; const cu = b.textContent;
    b.disabled = true; b.textContent = 'Đang tính…';
    try {
      RS.kq = await api('/api/roas/tinh', { method: 'POST', body: '{}' });
      roasBang();
    } catch (err) { toast(err.message, 'err'); }
    b.disabled = false; b.textContent = cu;
  };

  if (RS.kq) roasBang();
}

function roasBang() {
  const r = RS.kq;
  const el = $('#rsKetQua');
  if (!el || !r) return;
  const ty = (v) => (v == null ? '—' : v.toFixed(2) + '×');
  const mauRoas = (v) => (v == null ? '' : v >= 3 ? 'good' : v >= 1 ? 'warn' : 'bad');

  el.innerHTML = `
    <div class="help">${dmy(r.from)} → ${dmy(r.to)} · cửa sổ ghi công ${r.cuaSo} ngày ·
      đọc ${int(r.nguon.posDon)} đơn POS, ${int(r.nguon.hoiThoai)} hội thoại,
      ${int(r.nguon.lead)} lead, ${int(r.nguon.don)} đơn Tourwell</div>
    ${(r.loi || []).length ? `<div class="help" style="border-color:var(--warn);color:var(--warn)">
      ${r.loi.map(esc).join('<br>')}</div>` : ''}

    <div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-top:10px">
      <div class="kpi"><div class="k-label">Chi tiêu cả kỳ</div><div class="k-value">${vnd(r.tong.chiKy)}</div><div class="k-foot">mọi kênh</div></div>
      <div class="kpi"><div class="k-label">Doanh thu ghi công</div><div class="k-value">${vnd(r.tong.tien)}</div><div class="k-foot">${int(r.tong.don)} đơn · ${int(r.tong.lead)} lead</div></div>
      <div class="kpi"><div class="k-label">ROAS</div><div class="k-value">${ty(r.tong.roas)}</div><div class="k-foot">sàn dưới — xem ghi chú</div></div>
      <div class="kpi"><div class="k-label">ROAS theo tiền đã thu</div><div class="k-value">${ty(r.tong.roasThu)}</div><div class="k-foot">${vnd(r.tong.thu)}</div></div>
    </div>

    <h4 style="margin:18px 0 6px;font-size:1rem">Theo kênh</h4>
    <div style="overflow-x:auto">${table('rsKenh', [
      { key: 'nenTang', label: 'Kênh', render: (x) => platTag(x.nenTang) },
      { key: 'spendKy', label: 'Chi tiêu cả kỳ', num: true, render: (x) => vnd(x.spendKy) },
      { key: 'phu', label: 'Phủ', num: true, render: (x) => (x.phu == null ? '—' : (x.phu * 100).toFixed(0) + '%') },
      { key: 'tien', label: 'Doanh thu', num: true, render: (x) => `<b>${vnd(x.tien)}</b>` },
      { key: 'thu', label: 'Đã thu', num: true, render: (x) => vnd(x.thu) },
      { key: 'don', label: 'Đơn', num: true, render: (x) => int(x.don) },
      { key: 'roas', label: 'ROAS', num: true, render: (x) => `<span class="tag ${mauRoas(x.roas)}">${ty(x.roas)}</span>` },
    ], r.theoKenh)}</div>

    <h4 style="margin:18px 0 6px;font-size:1rem">Theo từng quảng cáo</h4>
    <div style="overflow-x:auto">${table('rsAd', [
      { key: 'ten', label: 'Quảng cáo', cls: 'name', render: (x) => (x.coTrongBase
        ? `<b>${esc(x.ten)}</b><span class="sub-line">${esc(x.adId)}</span>`
        : `<span class="tag warn">chưa có trong Base</span> <code>${esc(x.adId)}</code>`) },
      { key: 'nenTang', label: 'Kênh', render: (x) => (x.nenTang ? platTag(x.nenTang) : '—') },
      { key: 'duong', label: 'Đường ghép', render: (x) => (x.duong === 'POS'
        ? '<span class="tag good">khoá cứng</span>'
        : '<span class="tag warn">số điện thoại</span>') },
      { key: 'spend', label: 'Chi tiêu', num: true, render: (x) => vnd(x.spend) },
      { key: 'lead', label: 'Lead', num: true, render: (x) => int(x.lead) },
      { key: 'don', label: 'Đơn', num: true, render: (x) => int(x.don) },
      { key: 'tien', label: 'Doanh thu', num: true, render: (x) => `<b>${vnd(x.tien)}</b>` },
      { key: 'roas', label: 'ROAS', num: true, render: (x) => `<span class="tag ${mauRoas(x.roas)}">${ty(x.roas)}</span>` },
      { key: 'treTB', label: 'Trễ TB', num: true, render: (x) => (x.treTB == null ? '—' : x.treTB + ' ngày') },
    ], r.rows, { sort: { key: 'tien', dir: 'desc' }, empty: 'Không ghép được dòng nào' })}</div>

    <div class="help" style="margin-top:12px">
      <b>Đọc con số này cho đúng.</b> ROAS chia cho <b>toàn bộ</b> chi tiêu của kênh, nhưng doanh thu
      chỉ tính phần ghép được — nên đây là <b>sàn dưới</b>: thật có thể cao hơn, không thể thấp hơn.
      Cột <b>Phủ</b> cho biết bao nhiêu phần chi tiêu có ghép được.
      <br>Dòng ghi <b>khoá cứng</b> đi qua đơn POS mang cả <code>ad_id</code> lẫn mã lead — không phải đoán.
      Dòng ghi <b>số điện thoại</b> yếu hơn: một số có thể thuộc nhiều lead.
      ${r.donKhongGhep && r.donKhongGhep.so ? `<br>Còn <b>${int(r.donKhongGhep.so)} đơn</b>
        (${vnd(r.donKhongGhep.tien)}) không ghép được về quảng cáo nào — phần lớn là khách không đến từ quảng cáo.` : ''}
      ${r.nhat && r.nhat.nhapNhangHoiThoai ? `<br>${int(r.nhat.nhapNhangHoiThoai)} hội thoại mang nhiều
        <code>ad_ids</code> nên không ghi công cho quảng cáo nào — thà bỏ hơn gán bừa.` : ''}
    </div>`;
}

/* ---------------- modal ---------------- */
function modal(title, bodyHtml, footHtml) {
  $('#modal').innerHTML = `
    <div class="modal-head"><h3>${title}</h3><button class="btn ghost small" id="mClose">×</button></div>
    <div class="modal-body">${bodyHtml}</div>
    ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ''}`;
  $('#modalWrap').hidden = false;
  $('#mClose').onclick = closeModal;
}
function closeModal() { $('#modalWrap').hidden = true; $('#modal').innerHTML = ''; }
$('#modalWrap').addEventListener('click', (e) => { if (e.target.id === 'modalWrap') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

const field = (label, html, hint) =>
  `<div class="field${/full/.test(label) ? '' : ''}"><label>${esc(label)}</label>${html}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;
const selectHtml = (name, options, value) =>
  `<select data-k="${name}">${['', ...options].map((o) => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${o === '' ? '— chưa đặt —' : esc(o)}</option>`).join('')}</select>`;
const inputHtml = (name, value, type = 'text') =>
  `<input data-k="${name}" type="${type}" value="${esc(value == null ? '' : value)}">`;

/* ---- chi tiết chiến dịch ---- */
window.__campDetail = async (id) => {
  const d = await api('/api/campaigns?' + qs());
  const c = d.rows.find((r) => r.id === id);
  if (!c) return toast('Không tìm thấy chiến dịch', 'err');
  const opt = S.meta.options;
  modal(`${esc(c.name)}`, `
    <div class="stat-row">
      <div><div class="s-label">Chi tiêu (kỳ lọc)</div><div class="s-value">${vnd(c.spend)}</div></div>
      <div><div class="s-label">Chuyển đổi</div><div class="s-value">${int(c.conversions)}</div></div>
      <div><div class="s-label">CPA</div><div class="s-value">${c.conversions ? vnd(c.cpa) : '—'}</div></div>
      <div><div class="s-label">CTR</div><div class="s-value">${pct(c.ctr)}</div></div>
      <div><div class="s-label">Chi cả vòng đời</div><div class="s-value">${vnd(c.lifetimeSpend)}</div></div>
      <div><div class="s-label">Sức khoẻ</div><div class="s-value">${esc(c.health.label)}</div></div>
    </div>
    <div class="help">Xu hướng so kỳ trước: chi tiêu ${trend(c.trend.spend, true)} · chuyển đổi ${trend(c.trend.conversions, false)} · CPA ${trend(c.trend.cpa, true)}</div>
    <div class="form-grid">
      ${field('Tên chiến dịch', inputHtml('name', c.name))}
      ${field('Nền tảng', selectHtml('platform', opt.platform, c.platform))}
      ${field('Trạng thái', selectHtml('status', opt.campaignStatus, c.status))}
      ${field('Mục tiêu', selectHtml('objective', opt.objective, c.objective))}
      ${field('Ngân sách dự kiến (đ)', inputHtml('budget', c.budget || '', 'number'), 'So với chi tiêu toàn vòng đời')}
      ${field('Ngân sách/ngày (đ)', inputHtml('dailyBudget', c.dailyBudget || '', 'number'), 'Dùng để cảnh báo vượt chi trong ngày')}
      ${field('Ngày bắt đầu', inputHtml('start', c.start, 'date'))}
      ${field('Ngày kết thúc', inputHtml('end', c.end, 'date'))}
      <div class="field full"><label>Ghi chú</label><textarea data-k="note">${esc(c.note || '')}</textarea></div>
    </div>
    <div class="help" style="margin-top:12px">Sản phẩm gắn kèm: ${c.products && c.products.length ? esc(c.products.join(', ')) : '(chưa gắn)'} · ${c.groupCount} nhóm · ${c.adCount} quảng cáo</div>
  `, `<button class="btn ghost" onclick="closeModalGlobal()">Đóng</button>
      <button class="btn primary" id="mSave">Lưu vào Base</button>`);
  $('#mSave').onclick = () => saveModal(`/api/campaign/${id}`, ['name', 'platform', 'status', 'objective', 'budget', 'dailyBudget', 'start', 'end', 'note']);
};

/* ---- chi tiết nhóm ---- */
window.__groupDetail = async (id) => {
  const d = await api('/api/groups?' + qs());
  const g = d.rows.find((r) => r.id === id);
  if (!g) return toast('Không tìm thấy nhóm', 'err');
  const opt = S.meta.options;
  modal(`${esc(g.name)}`, `
    <div class="stat-row">
      <div><div class="s-label">Chi tiêu</div><div class="s-value">${vnd(g.spend)}</div></div>
      <div><div class="s-label">Chuyển đổi</div><div class="s-value">${int(g.conversions)}</div></div>
      <div><div class="s-label">CPA</div><div class="s-value">${g.conversions ? vnd(g.cpa) : '—'}</div></div>
      <div><div class="s-label">CTR</div><div class="s-value">${pct(g.ctr)}</div></div>
      <div><div class="s-label">Chiến dịch</div><div class="s-value" style="font-size:14px">${esc(g.campaignName)}</div></div>
    </div>
    <div class="form-grid">
      ${field('Tên nhóm', inputHtml('name', g.name))}
      ${field('Trạng thái', selectHtml('status', opt.groupStatus, g.status))}
      ${field('Tối ưu theo', selectHtml('optimize', opt.optimize, g.optimize))}
      ${field('Vị trí hiển thị', selectHtml('placement', opt.placement, g.placement))}
      ${field('Ngân sách nhóm (đ)', inputHtml('budget', g.budget || '', 'number'))}
      <div class="field full"><label>Đối tượng mục tiêu</label><textarea data-k="audience">${esc(g.audience || '')}</textarea></div>
    </div>`,
    `<button class="btn ghost" onclick="closeModalGlobal()">Đóng</button>
     <button class="btn primary" id="mSave">Lưu vào Base</button>`);
  $('#mSave').onclick = () => saveModal(`/api/group/${id}`, ['name', 'status', 'optimize', 'placement', 'budget', 'audience']);
};

/* ---- chi tiết quảng cáo ---- */
window.__adDetail = async (id) => {
  const [ads, daily] = await Promise.all([
    api('/api/ads?' + qs()),
    api('/api/daily?' + qs() + '&ad=' + id),
  ]);
  const a = ads.rows.find((r) => r.id === id);
  if (!a) return toast('Không tìm thấy quảng cáo', 'err');
  const opt = S.meta.options;
  modal(`${esc(a.name)}`, `
    <div class="stat-row">
      <div><div class="s-label">Chi tiêu</div><div class="s-value">${vnd(a.spend)}</div></div>
      <div><div class="s-label">Chuyển đổi</div><div class="s-value">${int(a.conversions)}</div></div>
      <div><div class="s-label">CPA</div><div class="s-value">${a.conversions ? vnd(a.cpa) : '—'}</div></div>
      <div><div class="s-label">CTR</div><div class="s-value">${pct(a.ctr)}</div></div>
      <div><div class="s-label">CPC</div><div class="s-value">${vnd(a.cpc)}</div></div>
      <div><div class="s-label">Khuyến nghị</div><div class="s-value" style="font-size:14px"><span class="tag ${ACTION_CLASS[a.actionLevel]}">${esc(a.action)}</span></div></div>
    </div>
    <div class="help">${esc(a.reason)} · thuộc ${esc(a.campaignName)} › ${esc(a.groupName)} · ${esc(a.platform)}</div>
    <div class="form-grid">
      ${field('Tên quảng cáo', inputHtml('name', a.name))}
      ${field('Trạng thái duyệt', selectHtml('approval', opt.adApproval, a.approval))}
      ${field('Loại creative', selectHtml('creative', opt.creative, a.creative))}
      ${field('Link creative', inputHtml('url', a.url))}
      <div class="field full"><label>Nội dung / Caption</label><textarea data-k="caption">${esc(a.caption || '')}</textarea></div>
    </div>
    <h4 style="margin:18px 0 8px">Hiệu suất từng ngày</h4>
    ${table('adDaily', [
      { key: 'date', label: 'Ngày', render: (r) => dmy(r.date) },
      { key: 'spend', label: 'Chi tiêu', num: true, render: (r) => vnd(r.spend) },
      { key: 'impressions', label: 'Hiển thị', num: true, render: (r) => int(r.impressions) },
      { key: 'clicks', label: 'Click', num: true, render: (r) => int(r.clicks) },
      { key: 'ctr', label: 'CTR', num: true, render: (r) => pct(r.ctr) },
      { key: 'conversions', label: 'CĐ', num: true, render: (r) => int(r.conversions) },
      { key: 'cpa', label: 'CPA', num: true, render: (r) => (r.conversions ? vnd(r.cpa) : '—') },
    ], daily.rows, { footer: true, sort: { key: 'date', dir: 'desc' }, empty: 'Chưa có số liệu trong khoảng đã lọc' })}`,
    `<button class="btn ghost" onclick="closeModalGlobal()">Đóng</button>
     <button class="btn primary" id="mSave">Lưu vào Base</button>`);
  $('#mSave').onclick = () => saveModal(`/api/ad/${id}`, ['name', 'approval', 'creative', 'url', 'caption']);
};

/* ---- sửa 1 dòng ngày ---- */
window.__dailyEdit = async (id) => {
  const d = await api('/api/daily?' + qs());
  const r = d.rows.find((x) => x.id === id);
  if (!r) return toast('Không tìm thấy dòng', 'err');
  modal('Sửa dòng hiệu suất', `
    <div class="help">${esc(r.adName)} · ${esc(r.campaignName)} · ${dmy(r.date)}</div>
    <div class="form-grid">
      ${field('Ngày', inputHtml('date', r.date, 'date'))}
      ${field('Quảng cáo', `<select data-k="adId">${S.meta.ads.map((a) => `<option value="${a.id}" ${a.id === r.adId ? 'selected' : ''}>${esc(a.name)} · ${esc(a.campaignName)}</option>`).join('')}</select>`, r.orphan ? 'Dòng này chưa gắn quảng cáo — chọn để gắn lại' : '')}
      ${field('Chi tiêu (đ)', inputHtml('spend', r.spend, 'number'))}
      ${field('Lượt hiển thị', inputHtml('impressions', r.impressions, 'number'))}
      ${field('Lượt click', inputHtml('clicks', r.clicks, 'number'))}
      ${field('Lượt chuyển đổi', inputHtml('conversions', r.conversions, 'number'))}
      ${field('Nhãn', inputHtml('label', r.label))}
    </div>`,
    `<button class="btn danger" id="mDel">Xoá dòng</button>
     <button class="btn ghost" onclick="closeModalGlobal()">Đóng</button>
     <button class="btn primary" id="mSave">Lưu vào Base</button>`);
  $('#mSave').onclick = () => saveModal(`/api/daily/${id}`, ['date', 'adId', 'spend', 'impressions', 'clicks', 'conversions', 'label']);
  $('#mDel').onclick = async () => {
    if (!confirm('Xoá dòng này khỏi Lark Base? Không hoàn tác được.')) return;
    try {
      await api(`/api/daily/${id}`, { method: 'DELETE' });
      toast('Đã xoá dòng', 'ok'); closeModal(); render();
    } catch (e) { toast(e.message, 'err'); }
  };
};

/* ---- mục tiêu ---- */
$('#btnTargets').onclick = async () => {
  const t = await api('/api/targets');
  modal('Mục tiêu & ngưỡng cảnh báo', `
    <div class="form-grid">
      ${field('CPA mục tiêu chung (đ)', inputHtml('cpa.default', t.cpa.default, 'number'))}
      ${field('CPA mục tiêu Facebook (đ)', inputHtml('cpa.Facebook', t.cpa.Facebook, 'number'))}
      ${field('CPA mục tiêu TikTok (đ)', inputHtml('cpa.TikTok', t.cpa.TikTok, 'number'))}
      ${field('CPA mục tiêu Google Ads (đ)', inputHtml('cpa.Google Ads', t.cpa['Google Ads'], 'number'))}
      ${field('CTR tối thiểu (%)', inputHtml('ctrMin', t.ctrMin, 'number'), 'Dưới ngưỡng này coi là creative yếu')}
      ${field('Tỉ lệ chuyển đổi tối thiểu (%)', inputHtml('cvrMin', t.cvrMin, 'number'))}
      ${field('Chi tiêu tối thiểu để kết luận (đ)', inputHtml('minSpendJudge', t.minSpendJudge, 'number'), 'Dưới mức này chưa đánh giá tốt/xấu')}
      ${field('Cảnh báo ngân sách từ (%)', inputHtml('budgetWarnPct', t.budgetWarnPct, 'number'))}
      ${field('Cho phép trễ nhập liệu (ngày)', inputHtml('dataLagDays', t.dataLagDays, 'number'))}
      ${field('Ngưỡng tăng chi đột biến (%)', inputHtml('spendSpikePct', t.spendSpikePct, 'number'))}
    </div>`,
    `<button class="btn ghost" onclick="closeModalGlobal()">Đóng</button>
     <button class="btn primary" id="mSave">Lưu mục tiêu</button>`);
  $('#mSave').onclick = async () => {
    const body = { cpa: {} };
    $$('#modal [data-k]').forEach((el) => {
      const k = el.dataset.k;
      const v = el.type === 'number' ? Number(el.value) : el.value;
      if (k.startsWith('cpa.')) body.cpa[k.slice(4)] = v; else body[k] = v;
    });
    try {
      await api('/api/targets', { method: 'PUT', body: JSON.stringify(body) });
      toast('Đã lưu mục tiêu', 'ok'); closeModal();
      S.meta.targets = body; render();
    } catch (e) { toast(e.message, 'err'); }
  };
};

async function saveModal(path, keys) {
  const body = {};
  $$('#modal [data-k]').forEach((el) => {
    if (!keys.includes(el.dataset.k)) return;
    body[el.dataset.k] = el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
  });
  const btn = $('#mSave');
  btn.disabled = true; btn.textContent = 'Đang lưu…';
  try {
    await api(path, { method: 'PATCH', body: JSON.stringify(body) });
    toast('Đã lưu vào Lark Base', 'ok');
    closeModal();
    await loadMeta();
    render();
  } catch (e) {
    toast('Lưu thất bại: ' + e.message, 'err');
    btn.disabled = false; btn.textContent = 'Lưu vào Base';
  }
}

window.closeModalGlobal = closeModal;
window.__goTab = (id) => { S.tab = id; renderShell(); render(); };

/* ---------------- khởi động ---------------- */
$('#btnRefresh').onclick = async () => {
  const b = $('#btnRefresh');
  b.disabled = true; b.textContent = '⟳ Đang nạp…';
  try { await api('/api/refresh', { method: 'POST' }); await loadMeta(); await render(); toast('Đã nạp lại số mới nhất', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
  b.disabled = false; b.textContent = '⟳ Làm mới';
};

/**
 * Mốc "Tháng này": từ ngày 1 của tháng hiện tại tới hôm nay (hoặc tới ngày cuối
 * có dữ liệu nếu Base chưa nhập tới hôm nay).
 */
function thangNay(m) {
  const from = m.today.slice(0, 8) + '01';
  let to = m.maxDate && m.maxDate < m.today ? m.maxDate : m.today;
  if (to < from) to = from;
  return { from, to };
}

async function loadMeta() {
  S.meta = await api('/api/meta' + (S.nguon ? '?nguon=' + S.nguon : ''));
  // Mặc định mở app là THÁNG HIỆN TẠI (cần meta mới biết hôm nay/ngày cuối có dữ liệu)
  if (!S.filter.from && !S.filter.to) {
    const t = thangNay(S.meta);
    S.filter.from = t.from;
    S.filter.to = t.to;
  }
  renderFilters();
}

// Chart vẽ theo bề rộng thật của vùng chứa nên phải vẽ lại khi cửa sổ đổi kích thước
let resizeTimer = null;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (Math.abs(window.innerWidth - lastWidth) < 40) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (S.meta && S.tab !== 'nhap-so') render(); }, 300);
});

/* Biểu đồ SVG lấy màu khung bằng giá trị đã tính (không phải var()), nên khi đổi
   sáng/tối phải vẽ lại. Lớp vỏ đổi data-theme trên <html>, hệ thống đổi thì bắt
   qua matchMedia. */
function theoDoiSangToi() {
  const veLai = () => { render().catch(() => {}); };
  new MutationObserver(veLai).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme'],
  });
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', veLai);
  } catch (e) {}
}

(async function boot() {
  try {
    await loadMeta();
    const cho = window.__hubKhoangCho;
    if (cho) { window.__hubKhoangCho = null; hubApKhoangSauNap(cho.tu, cho.den); }
    renderShell();
    await render();
    theoDoiSangToi();
  } catch (e) {
    $('#view').innerHTML = `<div class="card"><div class="card-body">
      <b style="color:var(--bad)">Không nạp được dữ liệu:</b> ${esc(e.message)}
      <p>Kiểm tra: đã đăng nhập <code>lark-cli auth login</code> chưa, và tài khoản có quyền vào Base không.</p></div></div>`;
  }
})();

/* Nghe lệnh từ Marketing Hub: bấm thẻ "Cảnh báo" ở trang Tổng quan của hub thì
   app này nhảy thẳng vào tab tương ứng. */
window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin) return;
  const d = ev.data || {};
  if (d.hub === 'tab' && d.v && TABS.some((t) => t.id === d.v)) {
    S.tab = d.v;
    renderShell();
    render().catch(() => {});
  }
});
