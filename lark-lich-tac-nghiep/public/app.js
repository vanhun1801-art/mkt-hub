/* Rooty Trip · Lịch tác nghiệp — giao diện quản lý & nhân sự trên Lark Base */
'use strict';

/* ============ state ============ */
const S = {
  me: null,
  manager: false,
  items: [],
  people: [],
  options: {},
  config: {},
  acting: null,       // quản lý đang xem thử giao diện của nhân sự nào
  actingId: null,     // open_id đang mượn vai (gửi kèm mỗi lần tải)
  tab: null,
  sel: null,          // record đang mở trong drawer
  draft: {},          // thay đổi chưa lưu trong drawer
  cal: null,          // {y, m} tháng đang xem ở tab Lịch
  f: { period: 'month', person: 'all', status: 'all', q: '' },   // mặc định: tháng hiện tại
};

/**
 * Vai đang hiển thị. Quản lý xem thử giao diện nhân sự thì UI hạ xuống vai
 * nhân sự; quyền thật vẫn nằm ở server, đây chỉ là bản xem trước.
 */
const MGR = () => S.manager && !S.acting;

/** Đang xem thay người khác — mọi thao tác ghi bị khoá để không hành động hộ họ. */
const PREVIEW = () => !!S.acting;

/* Dưới lớp vỏ Marketing Hub thì mốc thời gian lấy theo bộ chuẩn của lớp vỏ
 * (loc.js): quản lý một bộ, nhân sự một bộ hẹp hơn. Vai do lớp vỏ quyết. */
const DUOI_HUB = () => !!(window.HUB_LOC && window.__HUB__);
const NS_HUB = () => DUOI_HUB() && window.__HUB__.quanLy === false;
const MOC_HUB = () => (DUOI_HUB() ? window.HUB_LOC.danhSachTheoVai(window.__HUB__.quanLy) : null);

/* Ba tùy chọn quản lý cấp thêm cho nhân sự. Server đã chặn thật, đây chỉ để giao
 * diện không bày ra thứ người dùng không có quyền. */
const CHIPHI = () => MGR() || !!(S.perm && S.perm.chiPhi);
const DUOC_TAO = () => !(S.perm && S.perm.taoMoi === false);

/** Người mà màn hình đang lấy làm "tôi". */
const viewer = () => S.acting || S.me;

/* ============ hằng số hiển thị ============ */
const STATUS_STYLE = {
  'Đang lên kế hoạch':      { cls: 'gray',   color: 'var(--t3)' },
  'Chờ duyệt/Xử lý':        { cls: 'orange', color: 'var(--orange)' },
  'Từ chối/Cần điều chỉnh': { cls: 'yellow', color: 'var(--yellow-t)' },
  'Duyệt/Chờ tác nghiệp':   { cls: 'blue',   color: 'var(--primary)' },
  'Đang báo cáo':           { cls: 'purple', color: 'var(--purple)' },
  'Đã hoàn tất':            { cls: 'green',  color: 'var(--green)' },
  'Từ chối':                { cls: 'red',    color: 'var(--red)' },
  'Hủy lịch':               { cls: 'dark',   color: '#bbbfc4' },
};
const stStyle = (s) => STATUS_STYLE[s] || { cls: 'gray', color: 'var(--t3)' };

// Luồng chính hiển thị trên thanh tiến trình
const FLOW = ['Đang lên kế hoạch', 'Chờ duyệt/Xử lý', 'Duyệt/Chờ tác nghiệp', 'Đang báo cáo', 'Đã hoàn tất'];
const CLOSED_BAD = ['Từ chối', 'Hủy lịch'];

const AV_COLORS = ['#3370ff', '#7f3bf5', '#f54a45', '#ff8800', '#00b96b', '#0fbfbf', '#d83931', '#6425d0', '#1a8917', '#b37feb'];

/* ============ tiện ích ============ */
const $ = (s, r) => (r || document).querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const pad = (n) => String(n).padStart(2, '0');

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmtD(v) {
  const d = toDate(v);
  return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : '—';
}

function fmtDT(v) {
  const d = toDate(v);
  if (!d) return '—';
  const hm = (d.getHours() || d.getMinutes()) ? ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '';
  return fmtD(v) + hm;
}

/** Giá trị cho <input type="datetime-local"> */
function toLocalInput(v) {
  const d = toDate(v);
  if (!d) return '';
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function money(n) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('vi-VN');
}

function shortMoney(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + ' tỷ';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' tr';
  if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'k';
  return String(v);
}

/**
 * Trường công thức "Thời lượng tác nghiệp" trong Base trả số rác khi thiếu
 * thời gian kết thúc, nên tính lại tại chỗ từ mốc bắt đầu và kết thúc.
 */
function realHours(t) {
  const a = toDate(t.start), b = toDate(t.end);
  if (a && b && b > a) return (Math.round((b - a) / 36e5 * 10) / 10) + ' giờ';
  if (t.duration) return t.duration + ' giờ (dự kiến)';
  return '—';
}

function initials(name) {
  // bỏ biệt danh trong ngoặc: "Nguyễn Long Khánh (Pinky)" -> "Nguyễn Long Khánh"
  const clean = String(name || '?').replace(/[(\[{].*?[)\]}]/g, ' ');
  const parts = clean.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  if (!parts.length) return '?';
  // tên một chữ ("Hằng") lấy 2 ký tự sẽ ra "HẰ" — chỉ lấy chữ đầu cho gọn
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avColor(key) {
  let h = 0;
  for (const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

function avatar(u, size) {
  const s = size || 26;
  return '<div class="av" title="' + esc(u.name) + '" style="width:' + s + 'px;height:' + s + 'px;background:' +
    avColor(u.id || u.name) + ';font-size:' + Math.round(s * 0.4) + 'px">' + esc(initials(u.name)) + '</div>';
}

function peopleStack(list, max) {
  const arr = list || [];
  if (!arr.length) return '<span class="muted mini">—</span>';
  const m = max || 3;
  let h = '<div class="people">';
  arr.slice(0, m).forEach((u) => { h += avatar(u, 26); });
  if (arr.length > m) h += '<div class="more">+' + (arr.length - m) + '</div>';
  return h + '</div>';
}

function badge(status) {
  if (!status) return '<span class="badge plain">Chưa đặt</span>';
  return '<span class="badge ' + stStyle(status).cls + '"><i class="dot"></i>' + esc(status) + '</span>';
}

const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function toast(msg, kind) {
  const t = el('div', 'toast' + (kind ? ' ' + kind : ''), esc(msg));
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .25s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 260); },
    kind === 'err' ? 5200 : 2800);
}

/* ============ gọi API ============ */
/*
 * Bản gộp một file mở bằng file:// không có origin để gọi tương đối, nên trang
 * tự khai `window.LARK_API_BASE` trỏ về server. Khi mở qua chính server thì
 * biến này rỗng và mọi lời gọi giữ nguyên đường dẫn tương đối.
 */
const API_BASE = String(window.LARK_API_BASE || '').replace(/\/+$/, '');
const apiUrl = (p) => API_BASE + p;

async function api(path, opts) {
  // Đang mượn vai thì khai báo với server để mọi request ghi bị chặn từ đó
  if (S.actingId && !/[?&]as=/.test(path)) {
    path += (path.includes('?') ? '&' : '?') + 'as=' + encodeURIComponent(S.actingId);
  }
  const r = await fetch(apiUrl(path), Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    if (!r.ok) throw new Error('Lỗi máy chủ ' + r.status);
    return r;
  }
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || ('Lỗi ' + r.status));
  return d;
}

/* ============ nạp dữ liệu ============ */
async function load(force) {
  const qs = [];
  if (force) qs.push('refresh=1');
  if (S.actingId) qs.push('as=' + encodeURIComponent(S.actingId));
  const d = await api('/api/meta' + (qs.length ? '?' + qs.join('&') : ''));
  S.me = d.me;
  S.manager = d.manager;
  // tùy chọn quản lý cấp riêng cho nhân sự này (bảng Phân quyền app của lớp vỏ)
  S.perm = Object.assign({ toanBo: false, taoMoi: true, chiPhi: false }, d.perm || {});
  S.acting = d.acting || null;
  if (!S.acting) S.actingId = null;
  S.items = d.items || [];
  S.people = d.people || [];
  S.options = d.options || {};
  S.config = d.config || {};
  if (!S.tab) S.tab = MGR() ? 'overview' : 'mine';
  if (!S.cal) { const n = new Date(); S.cal = { y: n.getFullYear(), m: n.getMonth() }; }
}

/* ============ lọc ============ */
function periodOptions() {
  /* Nhân sự chỉ được bảy mốc quanh hôm nay — danh sách do lớp vỏ cấp (loc.js),
   * dùng chung với Tổng quan và hai base kia. Không "tất cả thời gian", không
   * "đã qua": nhìn xa hơn là việc của quản lý. */
  const moc = MOC_HUB();
  if (moc) {
    const ra = moc.map((x) => ({ v: 'k:' + x.tu + ':' + x.den, t: x.ten }));
    /* Khoảng tuỳ chỉnh chỉ đặt ở thanh lọc lớp vỏ — ở đây hiện thành một lựa chọn
     * để biết đang lọc theo khoảng nào. */
    if (String(S.f.period).startsWith('k:')) {
      const [, tu, den] = S.f.period.split(':');
      if (!ra.some((x) => x.v === S.f.period)) {
        ra.unshift({ v: S.f.period, t: 'Bộ lọc chung: ' + dmyNgan(tu) + ' → ' + dmyNgan(den) });
      }
    }
    return ra;
  }
  const months = [...new Set(S.items.map((t) => t.month).filter((m) => m && m !== 'Chưa có ngày'))].sort().reverse();
  const ds = [
    { v: 'all', t: 'Tất cả thời gian' },
    { v: 'upcoming', t: 'Sắp tới (7 ngày)' },
    { v: 'week', t: 'Tuần này' },
    { v: 'month', t: 'Tháng này' },
    { v: 'past', t: 'Đã qua' },
  ];
  // khoảng lớp vỏ đưa xuống: hiện thành một lựa chọn thật để biết mình đang lọc gì
  if (String(S.f.period).startsWith('k:')) {
    const [, tu, den] = S.f.period.split(':');
    ds.unshift({ v: S.f.period, t: 'Bộ lọc chung: ' + dmyNgan(tu) + ' → ' + dmyNgan(den) });
  }
  return ds.concat(months.slice(0, 18).map((m) => ({ v: 'm:' + m, t: 'Tháng ' + m.slice(5) + '/' + m.slice(0, 4) })));
}

const dmyNgan = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '');
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0');

/**
 * Khoảng ngày tương đương của một lựa chọn thời gian — để báo lên lớp vỏ cho các
 * base khác lọc theo. `null` = toàn bộ; `undefined` = không biểu diễn được bằng
 * một khoảng (VD "Đã qua"), khi đó không đồng bộ ngược lên.
 */
function khoangCuaKy(p) {
  const now = new Date();
  const today = startOfDay(now);
  if (p === 'all') return null;
  if (p === 'upcoming') return { tu: iso(today), den: iso(addDays(today, 7)) };
  if (p === 'week') {
    const mon = addDays(today, -((today.getDay() + 6) % 7));
    return { tu: iso(mon), den: iso(addDays(mon, 6)) };
  }
  if (p === 'month') {
    return { tu: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
             den: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  if (p.startsWith('m:')) {
    const [y, m] = p.slice(2).split('-').map(Number);
    return { tu: iso(new Date(y, m - 1, 1)), den: iso(new Date(y, m, 0)) };
  }
  if (p.startsWith('k:')) { const [, tu, den] = p.split(':'); return { tu, den }; }
  return undefined;
}

/* Lớp vỏ Marketing Hub gọi xuống khi bộ lọc chung đổi. */
/** Nhân sự: nếu kỳ đang chọn không nằm trong bảy mốc thì kéo về tháng này. */
function chuanKyNhanSu() {
  const ds = MOC_HUB();
  if (!ds) return;
  // khoảng do lớp vỏ đưa xuống (kể cả tuỳ chỉnh) thì giữ nguyên
  if (String(S.f.period).startsWith('k:')) return;
  const mac = ds.find((x) => x.k === window.HUB_LOC.MAC_DINH) || ds[0];
  S.f.period = 'k:' + mac.tu + ':' + mac.den;
  if (window.hubBaoKhoang) window.hubBaoKhoang(mac.tu, mac.den);
}

window.hubApKhoang = function (tu, den) {
  const moi = tu && den ? 'k:' + tu + ':' + den : 'all';
  if (S.f.period === moi) return;
  S.f.period = moi;
  if (S.items && S.items.length) render();
};

function inPeriod(t, p) {
  if (p === 'all') return true;
  const d = toDate(t.start);
  if (p.startsWith('m:')) return t.month === p.slice(2);
  // 'k:<tu>:<den>' — khoảng do bộ lọc chung của Marketing Hub đưa xuống
  if (p.startsWith('k:')) {
    if (!d) return false;
    const [, tu, den] = p.split(':');
    return d >= startOfDay(new Date(tu + 'T00:00:00')) &&
           d < addDays(startOfDay(new Date(den + 'T00:00:00')), 1);
  }
  if (!d) return false;
  const now = new Date();
  const today = startOfDay(now);
  if (p === 'upcoming') return d >= today && d < addDays(today, 8);
  if (p === 'past') return d < today;
  if (p === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (p === 'week') {
    const dow = (today.getDay() + 6) % 7;            // thứ 2 = 0
    const mon = addDays(today, -dow);
    return d >= mon && d < addDays(mon, 7);
  }
  return true;
}

function filtered() {
  const q = S.f.q.trim().toLowerCase();
  return S.items.filter((t) => {
    if (!inPeriod(t, S.f.period)) return false;
    if (S.f.status === '__none') { if (t.status) return false; }
    else if (S.f.status !== 'all' && t.status !== S.f.status) return false;
    if (S.f.person !== 'all') {
      const has = [...(t.owner || []), ...(t.staff || [])].some((u) => u.id === S.f.person);
      if (!has) return false;
    }
    if (q) {
      const hay = [t.title, t.purpose, t.plan, t.report, (t.owner || []).map((u) => u.name).join(' '),
        (t.staff || []).map((u) => u.name).join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const byStartDesc = (a, b) => (toDate(b.start) || 0) - (toDate(a.start) || 0);
const byStartAsc = (a, b) => (toDate(a.start) || 8e15) - (toDate(b.start) || 8e15);

/* ============ hàng đợi cần xử lý (quản lý) ============ */
const qWaiting = () => S.items.filter((t) => t.status === 'Chờ duyệt/Xử lý');
// Lịch đã đóng (hủy/từ chối) hoặc đã hoàn tất thì yêu cầu hỗ trợ không còn ý nghĩa
const SETTLED = [...CLOSED_BAD, 'Đã hoàn tất'];
const qFoc = () => S.items.filter((t) => t.focRequest && !t.focStatus && !SETTLED.includes(t.status));
const qMedia = () => S.items.filter((t) => t.mediaRequest && !t.mediaStatus && !SETTLED.includes(t.status));
const qPay = () => S.items.filter((t) => t.status === 'Đã hoàn tất' && t.costActual != null && t.payment !== 'Đã thanh toán');
const qReport = () => {
  const today = startOfDay(new Date());
  return S.items.filter((t) => {
    const d = toDate(t.start);
    return d && d < today && ['Duyệt/Chờ tác nghiệp'].includes(t.status);
  });
};
const approveCount = () => qWaiting().length + qFoc().length + qMedia().length;

/* ============ khung ============ */
function tabDefs() {
  if (MGR()) {
    return [
      { k: 'overview', t: 'Tổng quan' },
      { k: 'calendar', t: 'Lịch' },
      { k: 'approve',  t: 'Cần xử lý', n: approveCount() },
      { k: 'list',     t: 'Danh sách' },
      { k: 'cost',     t: 'Chi phí' },
      { k: 'mine',     t: 'Lịch của tôi' },
    ];
  }
  // nhân sự: ba tab cơ bản, thêm Chi phí nếu quản lý mở quyền xem số tiền
  const ds = [
    { k: 'mine',     t: 'Lịch của tôi' },
    { k: 'calendar', t: 'Lịch' },
    { k: 'list',     t: 'Danh sách' },
  ];
  if (CHIPHI()) ds.push({ k: 'cost', t: 'Chi phí' });
  return ds;
}

function renderTabs() {
  chuanKyNhanSu();
  const defs = tabDefs();
  if (!defs.some((d) => d.k === S.tab)) S.tab = defs[0].k;
  $('#tabs').innerHTML = defs.map((d) =>
    '<button class="tab' + (d.k === S.tab ? ' on' : '') + '" data-tab="' + d.k + '">' + esc(d.t) +
    (d.n ? '<span class="cnt">' + d.n + '</span>' : '') + '</button>').join('');
}

function renderChip() {
  const me = S.me;
  const box = $('#chipUser');
  if (!me) {
    box.innerHTML = '<span class="mini muted">Chưa đăng nhập lark-cli</span>';
    box.classList.remove('acting', 'switchable');
    return;
  }

  // Quản lý đang xem thử giao diện của người khác
  if (S.acting) {
    box.className = 'chip-user acting switchable';
    box.title = 'Đang xem giao diện của ' + S.acting.name + ' — bấm để đổi vai';
    box.innerHTML = avatar(S.acting, 24) +
      '<span>' + esc(S.acting.name) + '</span>' +
      '<span class="role preview">Đang xem thử</span>' +
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" style="opacity:.6"><path d="M4 6l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return;
  }

  box.className = 'chip-user' + (S.manager ? ' switchable' : '');
  box.title = S.manager ? 'Bấm để xem giao diện của một nhân sự' : '';
  box.innerHTML = avatar(me, 24) +
    '<span>' + esc(me.name) + '</span>' +
    '<span class="role' + (MGR() ? '' : ' staff') + '">' + (MGR() ? 'Quản lý' : 'Nhân sự') + '</span>' +
    (S.manager ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" style="opacity:.6"><path d="M4 6l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') +
    (MGR() ? '<button class="btn icon ghost sm" id="btnQuyen" title="Phân quyền quản lý" style="margin-left:2px">' +
      // icon cần trượt, không dùng bánh răng có tia — dễ nhìn thành hình mặt trời
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<path d="M2 4.5h12M2 8h12M2 11.5h12" stroke-linecap="round"/>' +
      '<circle cx="6" cy="4.5" r="1.6" fill="var(--surface)"/><circle cx="10" cy="8" r="1.6" fill="var(--surface)"/><circle cx="5" cy="11.5" r="1.6" fill="var(--surface)"/>' +
      '</svg></button>' : '');
}

function filterBar(opts) {
  const o = opts || {};
  const per = periodOptions();
  return '<div class="filters">' +
    '<div class="search"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">' +
      '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14" stroke-linecap="round"/></svg>' +
      '<input class="fld" id="fQ" placeholder="Tìm hoạt động, mục đích, nhân sự…" value="' + esc(S.f.q) + '"></div>' +
    '<select class="fld" id="fPeriod">' + per.map((p) =>
      '<option value="' + p.v + '"' + (S.f.period === p.v ? ' selected' : '') + '>' + esc(p.t) + '</option>').join('') + '</select>' +
    (o.noStatus ? '' : '<select class="fld" id="fStatus"><option value="all">Mọi trạng thái</option>' +
      (S.config.statusOrder || []).map((s) =>
        '<option value="' + esc(s) + '"' + (S.f.status === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') +
      '<option value="__none"' + (S.f.status === '__none' ? ' selected' : '') + '>Chưa đặt trạng thái</option></select>') +
    (MGR() && !o.noPerson ? '<select class="fld" id="fPerson"><option value="all">Mọi nhân sự</option>' +
      S.people.map((p) => '<option value="' + esc(p.id) + '"' + (S.f.person === p.id ? ' selected' : '') + '>' +
        esc(p.name) + '</option>').join('') + '</select>' : '') +
    '<div class="sp"></div>' +
    '<button class="btn sm ghost" id="fReset">Xoá lọc</button>' +
    '</div>';
}

/* ============ TỔNG QUAN (quản lý) ============ */
function viewOverview() {
  const list = filtered();
  const now = new Date();
  const today = startOfDay(now);

  const cnt = (fn) => list.filter(fn).length;
  const waiting = cnt((t) => t.status === 'Chờ duyệt/Xử lý');
  const approved = cnt((t) => t.status === 'Duyệt/Chờ tác nghiệp');
  const reporting = cnt((t) => t.status === 'Đang báo cáo');
  const done = cnt((t) => t.status === 'Đã hoàn tất');
  const soon = list.filter((t) => {
    const d = toDate(t.start);
    return d && d >= today && d < addDays(today, 8) && !CLOSED_BAD.includes(t.status);
  }).length;
  const overdue = list.filter((t) => {
    const d = toDate(t.start);
    return d && d < today && t.status === 'Duyệt/Chờ tác nghiệp';
  }).length;

  const sumPlan = list.reduce((s, t) => s + (t.costPlan || 0), 0);
  const sumReal = list.reduce((s, t) => s + (t.costActual || 0), 0);

  const kpi = (k, lbl, val, sub, color) =>
    '<div class="kpi" data-kpi="' + k + '"><div class="lbl">' +
    (color ? '<i class="dot" style="background:' + color + '"></i>' : '') + esc(lbl) + '</div>' +
    '<div class="val">' + val + '</div>' +
    (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';

  let h = filterBar();

  h += '<div class="kpis">' +
    kpi('all', 'Tổng lịch', list.length, S.items.length !== list.length ? '/ ' + S.items.length + ' toàn bộ' : '') +
    kpi('Chờ duyệt/Xử lý', 'Chờ duyệt', waiting, '', 'var(--orange)') +
    kpi('soon', 'Sắp diễn ra', soon, '7 ngày tới', 'var(--primary)') +
    kpi('Duyệt/Chờ tác nghiệp', 'Đã duyệt', approved, overdue ? overdue + ' quá ngày chưa báo cáo' : '', 'var(--primary)') +
    kpi('Đang báo cáo', 'Đang báo cáo', reporting, '', 'var(--purple)') +
    kpi('Đã hoàn tất', 'Đã hoàn tất', done, '', 'var(--green)') +
    '</div>';

  // hàng đợi cần xử lý
  const queues = [
    { t: 'Chờ duyệt kế hoạch', arr: qWaiting(), color: 'var(--orange)' },
    { t: 'Yêu cầu FOC chờ phản hồi', arr: qFoc(), color: 'var(--purple)' },
    { t: 'Yêu cầu phòng Media', arr: qMedia(), color: 'var(--primary)' },
    { t: 'Quá ngày chưa báo cáo', arr: qReport(), color: 'var(--red)' },
  ];
  h += '<div class="grid2" style="margin-bottom:16px">';
  h += '<div class="card card-pad"><div class="section-head"><h2>Hàng đợi cần xử lý</h2><div class="sp"></div>' +
    '<button class="btn sm" data-goto="approve">Mở trang xử lý</button></div>';
  h += queues.map((q) =>
    '<div style="margin-bottom:12px">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<i class="dot" style="width:7px;height:7px;border-radius:50%;background:' + q.color + ';display:inline-block"></i>' +
      '<b style="font-size:13px;font-weight:600">' + esc(q.t) + '</b>' +
      '<span class="badge plain">' + q.arr.length + '</span></div>' +
    (q.arr.length
      ? '<div style="display:flex;flex-direction:column;gap:5px">' + q.arr.slice(0, 3).map((t) =>
          '<button class="tile" data-open="' + t.id + '" style="text-align:left">' +
          '<div class="t">' + esc(t.title || '(chưa đặt tên)') + '</div>' +
          '<div class="m">' + esc(fmtD(t.start)) +
          ((t.owner || [])[0] ? ' · ' + esc(t.owner[0].name) : '') + '</div></button>').join('')
        + (q.arr.length > 3 ? '<div class="mini muted" style="padding-left:2px">… và ' + (q.arr.length - 3) + ' lịch khác</div>' : '')
        + '</div>'
      : '<div class="mini muted">Không có mục nào.</div>') +
    '</div>').join('');
  h += '</div>';

  // phân bố trạng thái
  const order = S.config.statusOrder || [];
  const dist = order.map((s) => ({ s, n: list.filter((t) => t.status === s).length })).filter((x) => x.n);
  const noneN = list.filter((t) => !t.status).length;
  if (noneN) dist.push({ s: 'Chưa đặt trạng thái', n: noneN });
  const tot = dist.reduce((a, b) => a + b.n, 0) || 1;
  h += '<div class="card card-pad"><div class="section-head"><h2>Phân bố trạng thái</h2>' +
    '<span class="muted">' + tot + ' lịch</span></div>' +
    '<div class="stack">' + dist.map((x) =>
      '<i style="width:' + (x.n / tot * 100) + '%;background:' + stStyle(x.s).color + '" title="' +
      esc(x.s + ': ' + x.n) + '"></i>').join('') + '</div>' +
    '<div class="legend">' + dist.map((x) =>
      '<span><i style="background:' + stStyle(x.s).color + '"></i>' + esc(x.s) + ' · <b>' + x.n + '</b></span>').join('') +
    '</div>' +
    '<div class="divider" style="margin:16px 0"></div>' +
    '<div class="section-head"><h2>Chi phí</h2></div>' +
    '<div class="grid2" style="gap:12px">' +
      '<div><div class="mini muted">Dự kiến</div><div style="font-size:20px;font-weight:650">' + money(sumPlan) + '<span class="mini muted"> đ</span></div></div>' +
      '<div><div class="mini muted">Thực tế</div><div style="font-size:20px;font-weight:650">' + money(sumReal) + '<span class="mini muted"> đ</span></div></div>' +
    '</div>' +
    '</div>';
  h += '</div>';

  // tải theo nhân sự + lịch theo tháng
  const load = new Map();
  for (const t of list) {
    for (const u of [...(t.owner || []), ...(t.staff || [])]) {
      if (!u.id) continue;
      if (!load.has(u.id)) load.set(u.id, { u, n: 0, h: 0 });
      const r = load.get(u.id);
      r.n++;
      r.h += Number(t.duration || 0);
    }
  }
  const loadArr = [...load.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  const maxN = Math.max(1, ...loadArr.map((x) => x.n));

  const months = {};
  for (const t of S.items) {
    if (!t.month || t.month === 'Chưa có ngày') continue;
    months[t.month] = (months[t.month] || 0) + 1;
  }
  const mArr = Object.keys(months).sort().slice(-8).map((m) => ({ m, n: months[m] }));
  const maxM = Math.max(1, ...mArr.map((x) => x.n));

  h += '<div class="grid2">';
  h += '<div class="card card-pad"><div class="section-head"><h2>Tải tác nghiệp theo nhân sự</h2>' +
    '<span class="muted">top ' + loadArr.length + '</span></div><div class="bars">' +
    (loadArr.length ? loadArr.map((x) =>
      '<div class="bar-row"><div class="nm">' + esc(x.u.name) + '</div>' +
      '<div class="track"><i style="width:' + (x.n / maxN * 100) + '%"></i></div>' +
      '<div class="vv">' + x.n + '</div></div>').join('')
      : '<div class="mini muted">Chưa có dữ liệu.</div>') +
    '</div></div>';

  h += '<div class="card card-pad"><div class="section-head"><h2>Lịch tác nghiệp theo tháng</h2>' +
    '<span class="muted">toàn bộ Base</span></div>' +
    '<div class="spark">' + mArr.map((x) =>
      '<div><div class="col" style="height:96px"><i style="height:' + Math.max(4, x.n / maxM * 96) + 'px" title="' +
      x.n + ' lịch"></i></div><div class="lb">' + esc(x.m.slice(5) + '/' + x.m.slice(2, 4)) + '</div></div>').join('') +
    '</div></div>';
  h += '</div>';

  return h;
}

/* ============ CẦN XỬ LÝ (quản lý) ============ */
function queueCard(title, arr, note, kind) {
  if (!arr.length) {
    return '<div class="card card-pad" style="margin-bottom:14px"><div class="section-head"><h2>' + esc(title) +
      '</h2><span class="badge green">Sạch</span></div><div class="mini muted">Không còn mục nào cần xử lý.</div></div>';
  }
  let h = '<div class="card" style="margin-bottom:14px"><div class="card-pad" style="padding-bottom:6px">' +
    '<div class="section-head"><h2>' + esc(title) + '</h2><span class="badge orange">' + arr.length + '</span>' +
    '<div class="sp"></div><span class="muted mini">' + esc(note || '') + '</span></div></div>' +
    '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
    '<th style="min-width:230px">Hoạt động</th><th>Thời gian</th><th>Phụ trách</th><th>Nhân sự</th>' +
    '<th class="num">Chi phí DK</th><th>Trạng thái</th><th style="min-width:190px">Thao tác</th>' +
    '</tr></thead><tbody>';

  for (const t of arr.slice().sort(byStartAsc)) {
    let acts = '';
    if (kind === 'plan') {
      acts = '<button class="btn sm success" data-act="approve" data-id="' + t.id + '">Duyệt</button>' +
             '<button class="btn sm" data-act="revise" data-id="' + t.id + '">Cần chỉnh</button>' +
             '<button class="btn sm danger" data-act="reject" data-id="' + t.id + '">Từ chối</button>';
    } else if (kind === 'foc') {
      acts = '<button class="btn sm success" data-act="foc-ok" data-id="' + t.id + '">Duyệt FOC</button>' +
             '<button class="btn sm danger" data-act="foc-no" data-id="' + t.id + '">Từ chối</button>';
    } else if (kind === 'media') {
      acts = '<button class="btn sm success" data-act="media-ok" data-id="' + t.id + '">Phê duyệt</button>' +
             '<button class="btn sm danger" data-act="media-no" data-id="' + t.id + '">Từ chối</button>';
    } else if (kind === 'pay') {
      acts = '<button class="btn sm success" data-act="paid" data-id="' + t.id + '">Đã thanh toán</button>' +
             '<button class="btn sm" data-act="hold" data-id="' + t.id + '">Treo</button>';
    } else {
      acts = '<button class="btn sm" data-open="' + t.id + '">Xem chi tiết</button>';
    }

    const extra = kind === 'foc' ? (t.foc || []).map((x) => '<span class="tag">' + esc(x) + '</span>').join('')
      : kind === 'pay' ? '<span class="mini muted">Thực tế ' + money(t.costActual) + ' đ</span>' : '';

    h += '<tr data-open="' + t.id + '">' +
      '<td><div class="tname">' + esc(t.title || '(chưa đặt tên)') + '</div>' +
        '<div class="tsub">' + esc((t.purpose || '').replace(/\n/g, ' ').slice(0, 90)) + '</div>' + extra + '</td>' +
      '<td class="nowrap">' + esc(fmtDT(t.start)) + (t.duration ? '<div class="tsub">' + esc(t.duration) + ' giờ</div>' : '') + '</td>' +
      '<td>' + peopleStack(t.owner, 1) + '</td>' +
      '<td>' + peopleStack(t.staff, 3) + '</td>' +
      '<td class="num nowrap">' + money(t.costPlan) + '</td>' +
      '<td>' + badge(t.status) + '</td>' +
      '<td onclick="event.stopPropagation()"><div style="display:flex;gap:5px;flex-wrap:wrap">' + acts + '</div></td>' +
      '</tr>';
  }
  return h + '</tbody></table></div></div>';
}

function viewApprove() {
  let h = '<div class="banner info">' +
    '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.2v4M8 4.8v.6" stroke-linecap="round"/></svg>' +
    '<div class="sp">Mọi thao tác ở đây ghi thẳng vào Lark Base. Bấm vào dòng để mở chi tiết trước khi quyết định.</div></div>';
  h += queueCard('Chờ duyệt kế hoạch', qWaiting(), 'Duyệt · Cần chỉnh · Từ chối', 'plan');
  h += queueCard('Yêu cầu FOC', qFoc(), 'Thông báo muộn nhất 3 ngày kể từ ngày gửi', 'foc');
  h += queueCard('Yêu cầu nhân sự phòng Media', qMedia(), 'Phê duyệt hoặc từ chối hỗ trợ', 'media');
  h += queueCard('Quá ngày chưa báo cáo', qReport(), 'Đã duyệt nhưng chưa chuyển sang báo cáo', 'late');
  h += queueCard('Chờ thanh toán chi phí', qPay(), 'Đã hoàn tất và có chi phí thực tế', 'pay');
  return h;
}

/* ============ DANH SÁCH ============ */
function viewList() {
  const list = filtered().sort(byStartDesc);
  let h = filterBar();
  if (!list.length) return h + emptyBox('Không có lịch nào khớp bộ lọc', 'Thử đổi khoảng thời gian hoặc xoá bộ lọc.');

  h += '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr>' +
    '<th style="min-width:250px">Hoạt động</th><th>Bắt đầu</th><th>Thời lượng</th><th>Phụ trách</th><th>Nhân sự</th>' +
    '<th>Phương tiện</th><th class="num">Dự kiến</th><th class="num">Thực tế</th><th>Thanh toán</th><th>Trạng thái</th>' +
    '</tr></thead><tbody>';
  for (const t of list) {
    h += '<tr data-open="' + t.id + '">' +
      '<td><div class="tname">' + esc(t.title || '(chưa đặt tên)') + '</div>' +
        '<div class="tsub">' + esc((t.purpose || '').replace(/\n/g, ' ').slice(0, 110)) + '</div></td>' +
      '<td class="nowrap">' + esc(fmtDT(t.start)) + '<div class="tsub">' + esc(t.week || '') + '</div></td>' +
      '<td class="nowrap">' + (t.duration ? esc(t.duration) + ' giờ' : '<span class="muted">—</span>') + '</td>' +
      '<td>' + peopleStack(t.owner, 1) + '</td>' +
      '<td>' + peopleStack(t.staff, 3) + '</td>' +
      '<td>' + ((t.transport || []).map((x) => '<span class="tag">' + esc(x) + '</span>').join('') || '<span class="muted">—</span>') + '</td>' +
      '<td class="num nowrap">' + money(t.costPlan) + '</td>' +
      '<td class="num nowrap">' + money(t.costActual) + '</td>' +
      '<td>' + (t.payment ? '<span class="badge ' + (t.payment === 'Đã thanh toán' ? 'green' : 'yellow') + '">' + esc(t.payment) + '</span>' : '<span class="muted">—</span>') + '</td>' +
      '<td>' + badge(t.status) + '</td>' +
      '</tr>';
  }
  return h + '</tbody></table></div></div>';
}

/* ============ CHI PHÍ (quản lý) ============ */
function viewCost() {
  const list = filtered();
  const byMonth = {};
  for (const t of list) {
    const m = t.month && t.month !== 'Chưa có ngày' ? t.month : 'Chưa có ngày';
    if (!byMonth[m]) byMonth[m] = { plan: 0, real: 0, n: 0, unpaid: 0 };
    byMonth[m].plan += t.costPlan || 0;
    byMonth[m].real += t.costActual || 0;
    byMonth[m].n++;
    if (t.costActual != null && t.payment !== 'Đã thanh toán') byMonth[m].unpaid += t.costActual;
  }
  const rows = Object.keys(byMonth).sort().reverse();
  const max = Math.max(1, ...rows.map((m) => Math.max(byMonth[m].plan, byMonth[m].real)));

  const totPlan = list.reduce((s, t) => s + (t.costPlan || 0), 0);
  const totReal = list.reduce((s, t) => s + (t.costActual || 0), 0);
  const totUnpaid = list.filter((t) => t.costActual != null && t.payment !== 'Đã thanh toán')
    .reduce((s, t) => s + t.costActual, 0);
  const diff = totReal - totPlan;

  let h = filterBar();
  h += '<div class="kpis">' +
    '<div class="kpi"><div class="lbl">Chi phí dự kiến</div><div class="val">' + shortMoney(totPlan) + '</div><div class="sub">' + money(totPlan) + ' đ</div></div>' +
    '<div class="kpi"><div class="lbl">Chi phí thực tế</div><div class="val">' + shortMoney(totReal) + '</div><div class="sub">' + money(totReal) + ' đ</div></div>' +
    '<div class="kpi"><div class="lbl"><i class="dot" style="background:' + (diff > 0 ? 'var(--red)' : 'var(--green)') + '"></i>Chênh lệch</div>' +
      '<div class="val" style="color:' + (diff > 0 ? 'var(--red-t)' : 'var(--green-t)') + '">' + (diff > 0 ? '+' : '') + shortMoney(diff) + '</div>' +
      '<div class="sub">' + (diff > 0 ? 'vượt dự kiến' : 'thấp hơn dự kiến') + '</div></div>' +
    '<div class="kpi" data-kpi="unpaid"><div class="lbl"><i class="dot" style="background:var(--orange)"></i>Chưa thanh toán</div>' +
      '<div class="val">' + shortMoney(totUnpaid) + '</div><div class="sub">' + money(totUnpaid) + ' đ</div></div>' +
    '</div>';

  h += '<div class="card card-pad"><div class="section-head"><h2>Dự kiến so với thực tế theo tháng</h2></div>' +
    '<div class="bars">';
  for (const m of rows) {
    const r = byMonth[m];
    h += '<div class="bar-row"><div class="nm">' + esc(m) + ' <span class="muted mini">(' + r.n + ')</span></div>' +
      '<div style="display:flex;flex-direction:column;gap:4px">' +
        '<div class="track"><i style="width:' + (r.plan / max * 100) + '%;background:var(--primary-border)"></i></div>' +
        '<div class="track"><i style="width:' + (r.real / max * 100) + '%;background:var(--primary)"></i></div>' +
      '</div>' +
      '<div class="vv">' + shortMoney(r.real) + '</div></div>';
  }
  h += '</div><div class="legend"><span><i style="background:var(--primary-border)"></i>Dự kiến</span>' +
    '<span><i style="background:var(--primary)"></i>Thực tế</span></div></div>';

  const unpaid = list.filter((t) => t.costActual != null && t.payment !== 'Đã thanh toán').sort(byStartDesc);
  // nhân sự chỉ được xem: nút xác nhận thanh toán là việc của quản lý
  h += '<div style="height:16px"></div>' + queueCard('Chi phí chờ thanh toán', unpaid,
    MGR() ? 'Xác nhận sau khi chuyển khoản' : '', MGR() ? 'pay' : 'xem');
  return h;
}

/* ============ LỊCH CỦA TÔI ============ */
function viewMine() {
  const v = viewer();
  const meId = v && v.id;
  const mine = S.items.filter((t) => !meId || [...(t.owner || []), ...(t.staff || [])].some((u) => u.id === meId));
  const q = S.f.q.trim().toLowerCase();
  const list = mine.filter((t) => (!q || (t.title || '').toLowerCase().includes(q)) && inPeriod(t, S.f.period));

  const lanes = [
    { t: 'Nháp / Lên kế hoạch', st: ['Đang lên kế hoạch'] },
    { t: 'Chờ duyệt', st: ['Chờ duyệt/Xử lý'] },
    { t: 'Cần điều chỉnh', st: ['Từ chối/Cần điều chỉnh'] },
    { t: 'Đã duyệt · chờ tác nghiệp', st: ['Duyệt/Chờ tác nghiệp'] },
    { t: 'Đang báo cáo', st: ['Đang báo cáo'] },
    { t: 'Đã hoàn tất', st: ['Đã hoàn tất'] },
    { t: 'Đã đóng', st: ['Từ chối', 'Hủy lịch'] },
  ];

  const today = startOfDay(new Date());
  const soon = list.filter((t) => {
    const d = toDate(t.start);
    return d && d >= today && d < addDays(today, 8) && !CLOSED_BAD.includes(t.status);
  }).sort(byStartAsc);

  let h = '';
  const needFix = list.filter((t) => t.status === 'Từ chối/Cần điều chỉnh');
  if (needFix.length) {
    h += '<div class="banner"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<path d="M8 2l6 11H2L8 2z"/><path d="M8 6.4v3M8 11.2v.5" stroke-linecap="round"/></svg>' +
      '<div class="sp"><b>' + needFix.length + ' lịch</b> bị trả về cần điều chỉnh rồi gửi duyệt lại.</div></div>';
  }

  h += filterBar({ noStatus: true, noPerson: true });

  if (soon.length) {
    h += '<div class="card card-pad" style="margin-bottom:16px"><div class="section-head"><h2>Sắp diễn ra</h2>' +
      '<span class="muted">7 ngày tới · ' + soon.length + ' lịch</span></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px">' +
      soon.slice(0, 8).map((t) => {
        const d = toDate(t.start);
        const days = Math.round((startOfDay(d) - today) / 86400000);
        const when = days === 0 ? 'Hôm nay' : days === 1 ? 'Ngày mai' : 'Còn ' + days + ' ngày';
        return '<button class="tile" data-open="' + t.id + '" style="text-align:left">' +
          '<div class="m" style="margin-bottom:5px"><span class="badge ' + (days <= 1 ? 'orange' : 'blue') + '">' + esc(when) + '</span>' +
          '<span>' + esc(fmtDT(t.start)) + '</span></div>' +
          '<div class="t">' + esc(t.title || '(chưa đặt tên)') + '</div>' +
          '<div class="m">' + badge(t.status) + (t.duration ? '<span>' + esc(t.duration) + ' giờ</span>' : '') + '</div>' +
          '</button>';
      }).join('') + '</div></div>';
  }

  h += '<div class="lanes">';
  for (const ln of lanes) {
    const arr = list.filter((t) => ln.st.includes(t.status)).sort(byStartAsc);
    h += '<div class="lane"><div class="lane-head">' +
      '<i class="dot" style="width:7px;height:7px;border-radius:50%;background:' + stStyle(ln.st[0]).color + ';display:inline-block"></i>' +
      esc(ln.t) + '<span class="n">' + arr.length + '</span></div><div class="lane-body">';
    if (!arr.length) h += '<div class="lane-empty">Trống</div>';
    for (const t of arr) h += tileHtml(t);
    h += '</div></div>';
  }
  h += '</div>';
  return h;
}

function tileHtml(t) {
  const acts = [];
  if (PREVIEW()) {
    // đang xem hộ người khác: chỉ xem, không bấm thay họ
  } else if (t.status === 'Đang lên kế hoạch' || t.status === 'Từ chối/Cần điều chỉnh') {
    acts.push('<button class="btn sm primary" data-act="submit" data-id="' + t.id + '">Gửi duyệt</button>');
  }
  if (!PREVIEW() && t.status === 'Duyệt/Chờ tác nghiệp') {
    acts.push('<button class="btn sm primary" data-act="report" data-id="' + t.id + '">Báo cáo</button>');
  }
  const chk = [];
  if (t.focRequest) chk.push('<span class="badge ' + (t.focStatus === 'Phê duyệt' ? 'green' : t.focStatus === 'Từ chối' ? 'red' : 'orange') + '">FOC ' + esc(t.focStatus || 'chờ') + '</span>');
  if (t.mediaRequest) chk.push('<span class="badge ' + (t.mediaStatus === 'Phê duyệt' ? 'green' : t.mediaStatus === 'Từ chối' ? 'red' : 'orange') + '">Media ' + esc(t.mediaStatus || 'chờ') + '</span>');

  return '<div class="tile" data-open="' + t.id + '">' +
    '<div class="t">' + esc(t.title || '(chưa đặt tên)') + '</div>' +
    '<div class="m"><span>' + esc(fmtDT(t.start)) + '</span>' + (t.duration ? '<span>· ' + esc(t.duration) + 'h</span>' : '') + '</div>' +
    (chk.length ? '<div class="m" style="margin-top:6px">' + chk.join('') + '</div>' : '') +
    '<div class="m" style="margin-top:7px">' + peopleStack(t.staff, 3) +
      (t.costPlan ? '<span class="muted">' + shortMoney(t.costPlan) + ' đ</span>' : '') + '</div>' +
    (acts.length ? '<div class="acts" onclick="event.stopPropagation()">' + acts.join('') + '</div>' : '') +
    '</div>';
}

/* ============ LỊCH THÁNG ============ */
const DOW = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
                'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

function viewCalendar() {
  const { y, m } = S.cal;
  const q = S.f.q.trim().toLowerCase();
  const src = S.items.filter((t) => {
    if (S.f.status !== 'all' && t.status !== S.f.status) return false;
    if (S.f.person !== 'all' && ![...(t.owner || []), ...(t.staff || [])].some((u) => u.id === S.f.person)) return false;
    if (q && !(t.title || '').toLowerCase().includes(q)) return false;
    return true;
  });

  const map = new Map();
  for (const t of src) {
    const d = toDate(t.start);
    if (!d) continue;
    const k = dayKey(d);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }

  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7;            // thứ 2 đầu tuần
  const startCell = addDays(first, -offset);
  const todayK = dayKey(new Date());
  const monthCount = src.filter((t) => {
    const d = toDate(t.start);
    return d && d.getFullYear() === y && d.getMonth() === m;
  }).length;

  let h = '<div class="cal-head">' +
    '<button class="btn icon" data-cal="-1" title="Tháng trước">' +
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
    '<button class="btn icon" data-cal="1" title="Tháng sau">' +
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3l5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
    '<div class="cal-title">' + MONTHS[m] + ' ' + y + '</div>' +
    '<button class="btn sm" data-cal="0">Hôm nay</button>' +
    '<span class="muted mini">' + monthCount + ' lịch trong tháng</span>' +
    '<div class="sp" style="flex:1"></div>' +
    '</div>';

  h += filterBar({ noPerson: !MGR() });

  h += '<div class="cal"><div class="cal-dow">' + DOW.map((d) => '<div>' + d + '</div>').join('') + '</div><div class="cal-grid">';
  for (let i = 0; i < 42; i++) {
    const d = addDays(startCell, i);
    const k = dayKey(d);
    const off = d.getMonth() !== m;
    const evs = (map.get(k) || []).sort(byStartAsc);
    h += '<div class="cal-cell' + (off ? ' off' : '') + (k === todayK ? ' today' : '') + '" data-day="' + k + '">' +
      '<div class="cal-date">' + d.getDate() + '</div>';
    for (const t of evs.slice(0, 3)) {
      const c = stStyle(t.status);
      h += '<button class="ev" data-open="' + t.id + '" title="' + esc((t.title || '') + ' · ' + (t.status || '')) + '" ' +
        'style="background:' + c.color + '18;color:' + c.color + ';border-left-color:' + c.color + '">' +
        esc(t.title || '(chưa đặt tên)') + '</button>';
    }
    if (evs.length > 3) h += '<button class="ev-more" data-dayopen="' + k + '">+' + (evs.length - 3) + ' lịch khác</button>';
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

/* ============ khối rỗng ============ */
function emptyBox(ttl, sub) {
  return '<div class="card"><div class="empty">' +
    '<div class="ttl">' + esc(ttl) + '</div><div class="mini">' + esc(sub || '') + '</div></div></div>';
}

/* ============ render ============ */
function render() {
  renderTabs();
  renderChip();
  $('#btnLark').href = S.config.larkUrl || '#';
  // Xem hộ người khác thì không cho đăng ký lịch đứng tên họ
  $('#btnNew').style.display = (PREVIEW() || !DUOC_TAO()) ? 'none' : '';

  let h = '';
  if (PREVIEW()) {
    h += '<div class="banner acting-banner">' +
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.8"/></svg>' +
      '<div class="sp">Bạn đang xem giao diện <b>nhân sự</b> của <b>' + esc(S.acting.name) + '</b> — ' +
      'đúng những gì họ thấy khi mở app. Mọi thao tác ghi đã bị khoá.</div>' +
      '<button class="btn sm" id="btnExitActing">Quay lại vai quản lý</button></div>';
  }

  if (S.tab === 'overview') h += viewOverview();
  else if (S.tab === 'approve') h += viewApprove();
  else if (S.tab === 'list') h += viewList();
  else if (S.tab === 'cost') h += viewCost();
  else if (S.tab === 'mine') h += viewMine();
  else if (S.tab === 'calendar') h += viewCalendar();
  $('#page').innerHTML = h;
  /* Dưới lớp vỏ: ô chọn thời gian khoác thành dãy nút — cùng một cách thể hiện với
   * trang Tổng quan và hai base kia. Chạy đứng một mình thì giữ <select> như cũ. */
  if (window.HUB_SEG && DUOI_HUB()) window.HUB_SEG($('#fPeriod'));
}

/* ============ drawer chi tiết ============ */
function canEdit(key) {
  if (PREVIEW()) return false;          // xem hộ người khác thì không sửa gì
  if (MGR()) return true;
  return (S.config.staffEditable || []).includes(key);
}

function statusChoices() {
  return MGR() ? (S.config.statusOrder || []) : (S.config.staffStatuses || []);
}

function openItem(id) {
  const t = S.items.find((x) => x.id === id);
  if (!t) return;
  S.sel = t;
  S.draft = {};
  renderDrawer();
  $('#drawer').classList.add('on');
  $('#mask').classList.add('on');
}

function closeDrawer() {
  $('#drawer').classList.remove('on');
  $('#mask').classList.remove('on');
  S.sel = null;
  S.draft = {};
}

const dv = (k) => (k in S.draft ? S.draft[k] : S.sel[k]);

function fieldText(key, label, hint, multiline) {
  const on = canEdit(key);
  const v = dv(key) || '';
  return '<div class="frm-row"><label>' + esc(label) + '</label>' +
    (multiline
      ? '<textarea class="fld" data-k="' + key + '"' + (on ? '' : ' readonly') + ' placeholder="' + esc(hint || '') + '">' + esc(v) + '</textarea>'
      : '<input class="fld" data-k="' + key + '" value="' + esc(v) + '"' + (on ? '' : ' readonly') + ' placeholder="' + esc(hint || '') + '">') +
    (hint && multiline ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
}

function fieldSelect(key, label, opts, allowEmpty) {
  const on = canEdit(key);
  const v = dv(key) || '';
  return '<div class="frm-row"><label>' + esc(label) + '</label>' +
    '<select class="fld" data-k="' + key + '"' + (on ? '' : ' disabled') + '>' +
    (allowEmpty === false ? '' : '<option value="">— chưa chọn —</option>') +
    (opts || []).map((o) => '<option value="' + esc(o) + '"' + (v === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') +
    '</select></div>';
}

function fieldMulti(key, label, opts) {
  const on = canEdit(key);
  const cur = dv(key) || [];
  return '<div class="frm-row"><label>' + esc(label) + '</label><div class="multi">' +
    (opts || []).map((o) => '<button class="opt' + (cur.includes(o) ? ' on' : '') + '" data-multi="' + key + '" data-val="' +
      esc(o) + '"' + (on ? '' : ' disabled') + '>' + esc(o) + '</button>').join('') +
    (opts && opts.length ? '' : '<span class="mini muted">Chưa có lựa chọn.</span>') + '</div></div>';
}

/* Ô chọn người: chip có avatar + bảng chọn có ô tìm và dấu tích.
   Trước đây là một dãy 35 nút tên — không tìm được ai, chiếm hết chiều cao form. */
function chipNguoi(id, xoaDuoc) {
  const p = S.people.find((x) => x.id === id) || { id, name: id };
  return '<span class="pk-chip">' + avatar(p, 19) + '<span class="pk-ten">' + esc(p.name) + '</span>' +
    (xoaDuoc ? '<span class="pk-x" data-pkx="' + esc(id) + '" title="Bỏ ' + esc(p.name) + '">×</span>' : '') +
    '</span>';
}

function chipsHtml(cur, on, placeholder) {
  if (!cur.length) return '<span class="pk-trong">' + esc(placeholder) + '</span>';
  return cur.slice(0, 3).map((id) => chipNguoi(id, on)).join('') +
    (cur.length > 3 ? '<span class="pk-them">+' + (cur.length - 3) + '</span>' : '');
}

function fieldUsers(key, label, single) {
  const on = canEdit(key);
  const cur = (dv(key) || []).map((u) => (typeof u === 'string' ? u : u.id));
  const ph = single ? 'Chọn một người…' : 'Chọn nhân sự…';

  const dong = S.people.map((p) =>
    '<div class="pk-row' + (cur.includes(p.id) ? ' on' : '') + '" data-user="' + key + '" data-val="' + esc(p.id) +
    '" data-single="' + (single ? '1' : '') + '" data-ten="' + esc(p.name.toLowerCase()) + '">' +
    avatar(p, 22) + '<span class="pk-row-ten">' + esc(p.name) + '</span>' +
    '<span class="pk-tick">' + (cur.includes(p.id) ? '✓' : '') + '</span></div>').join('');

  return '<div class="frm-row"><label>' + esc(label) + (single ? ' <span class="hint">(một người)</span>' : '') + '</label>' +
    '<div class="pk' + (on ? '' : ' pk-tat') + '" data-pk="' + key + '" data-ph="' + esc(ph) + '">' +
      '<button type="button" class="pk-sum"' + (on ? '' : ' disabled') + '>' +
        '<span class="pk-chips">' + chipsHtml(cur, on, ph) + '</span>' +
        '<span class="pk-caret">▾</span>' +
      '</button>' +
      '<div class="pk-panel" hidden>' +
        '<input class="pk-tim" type="search" placeholder="Tìm nhân sự…" autocomplete="off">' +
        '<div class="pk-ds">' + dong + '</div>' +
      '</div>' +
    '</div></div>';
}

function fieldDate(key, label, hint) {
  const on = canEdit(key);
  return '<div class="frm-row"><label>' + esc(label) + '</label>' +
    '<input type="datetime-local" class="fld" data-k="' + key + '" value="' + toLocalInput(dv(key)) + '"' +
    (on ? '' : ' disabled') + '>' + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
}

function fieldNum(key, label, hint) {
  const on = canEdit(key);
  const v = dv(key);
  return '<div class="frm-row"><label>' + esc(label) + '</label>' +
    '<input type="number" class="fld" data-k="' + key + '" value="' + (v == null ? '' : v) + '"' +
    (on ? '' : ' readonly') + ' step="1000" min="0">' + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
}

function fieldCheck(key, label) {
  const on = canEdit(key);
  return '<label class="chk"><input type="checkbox" data-k="' + key + '"' + (dv(key) ? ' checked' : '') +
    (on ? '' : ' disabled') + '><span>' + esc(label) + '</span></label>';
}

function filesBlock(key, label) {
  const arr = S.sel[key] || [];
  const canUp = !PREVIEW() && (S.config.uploadable || []).includes(key) && (MGR() || canEditItem());
  return '<div class="frm-row"><label>' + esc(label) + '</label><div class="files">' +
    (arr.length ? arr.map((f) =>
      '<div class="file"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9 1.5z"/><path d="M9 1.5V5.5H13"/></svg>' +
      '<span class="nm">' + esc(f.name || 'tệp') + '</span>' +
      '<span class="sz">' + (f.size ? Math.round(f.size / 1024) + ' KB' : '') + '</span>' +
      (f.token ? '<a class="btn sm ghost" target="_blank" href="' +
        apiUrl('/api/items/' + S.sel.id + '/file/' + f.token) + '">Mở</a>' : '') +
      '</div>').join('') : '<div class="mini muted">Chưa có tệp.</div>') +
    (canUp ? '<label class="btn sm" style="align-self:flex-start;margin-top:2px">' +
      '<input type="file" data-up="' + key + '" hidden> + Tải tệp lên</label>' : '') +
    '</div></div>';
}

/** Nhân sự còn được sửa nội dung kế hoạch không? */
function canEditItem() {
  if (PREVIEW()) return false;          // xem hộ người khác thì không sửa gì
  if (MGR()) return true;
  return !['Duyệt/Chờ tác nghiệp', 'Đã hoàn tất', 'Hủy lịch', 'Từ chối'].includes(S.sel.status);
}

function renderDrawer() {
  const t = S.sel;
  if (!t) return;
  const O = S.options;

  $('#drTitle').textContent = t.title || '(chưa đặt tên)';
  $('#drSub').innerHTML = badge(t.status) + ' <span style="margin-left:6px">' + esc(fmtDT(t.start)) + '</span>' +
    (t.week ? ' <span class="muted">· ' + esc(t.week) + '</span>' : '');

  // thanh tiến trình
  const idx = FLOW.indexOf(t.status);
  const bad = CLOSED_BAD.includes(t.status);
  let steps = '<div class="steps">' + FLOW.map((s, i) =>
    '<div class="s' + (!bad && idx >= 0 && i <= idx ? ' done' : '') + '">' + esc(s.split('/')[0]) + '</div>').join('') + '</div>';
  if (bad) steps = '<div class="banner" style="background:var(--red-bg);color:var(--red-t);border-color:#f7c9c7">' +
    'Lịch này đã <b style="margin:0 4px">' + esc(t.status) + '</b>.</div>';
  if (t.status === 'Từ chối/Cần điều chỉnh') steps += '<div class="banner">Quản lý yêu cầu điều chỉnh — sửa nội dung rồi bấm <b style="margin:0 4px">Gửi duyệt lại</b>.</div>';

  const locked = !canEditItem();
  const lockNote = locked
    ? '<div class="banner info">Lịch đã ở trạng thái "' + esc(t.status) + '" — nội dung kế hoạch đã khoá. Bạn vẫn cập nhật được báo cáo, liên kết và chi phí thực tế.</div>'
    : '';

  let h = steps + lockNote + '<div class="frm">';

  h += '<div class="sec-title">Thông tin chuyến</div>';
  h += fieldText('title', 'Tên hoạt động', 'Tên ngắn gọn của hoạt động');
  h += fieldText('purpose', 'Mục đích', '- Cập nhật tư liệu truyền thông\n- Phát trực tiếp', true);
  h += '<div class="frm-2">' + fieldDate('start', 'Thời gian bắt đầu') +
       fieldSelect('duration', 'Thời lượng (giờ)', O.duration) + '</div>';
  h += fieldDate('end', 'Thời gian kết thúc', 'Chỉ cập nhật sau khi đã hoàn tất tác nghiệp');
  h += fieldText('plan', 'Kế hoạch chi tiết', '- 19:00 Có mặt tại địa điểm\n- 19:30 Thực hiện phát trực tiếp', true);

  h += '<div class="divider"></div><div class="sec-title">Nhân sự & di chuyển</div>';
  h += fieldUsers('owner', 'Phụ trách', true);
  h += fieldUsers('staff', 'Nhân sự cùng tác nghiệp');
  h += fieldMulti('transport', 'Phương tiện', O.transport);

  if (CHIPHI()) {
    h += '<div class="divider"></div><div class="sec-title">Chi phí</div>';
    h += '<div class="frm-2">' + fieldNum('costPlan', 'Chi phí dự kiến (đ)') +
         fieldNum('costActual', 'Chi phí thực tế (đ)', 'Cập nhật sau chuyến công tác') + '</div>';
    h += fieldSelect('payment', 'Thanh toán chi phí', O.payment);
  }

  h += '<div class="divider"></div><div class="sec-title">Yêu cầu hỗ trợ</div>';
  h += '<div class="frm-row" style="gap:9px">' + fieldCheck('focRequest', 'Yêu cầu FOC (vé/dịch vụ miễn phí)') +
       fieldCheck('mediaRequest', 'Yêu cầu nhân sự phòng Media') + '</div>';
  h += fieldMulti('foc', 'Danh mục FOC', O.foc);
  h += '<div class="frm-2">' + fieldSelect('focStatus', 'Trạng thái FOC', O.focStatus) +
       fieldSelect('mediaStatus', 'Trạng thái nhân sự Media', O.mediaStatus) + '</div>';
  h += fieldText('mediaNote', 'Feedback nhân sự Media', '', true);

  h += '<div class="divider"></div><div class="sec-title">Kết quả & báo cáo</div>';
  h += fieldText('report', 'Báo cáo & ghi chú', 'a) Bảng kê chi phí:\nb) Hiệu chỉnh trước công tác:\nc) Lưu ý dịch vụ:', true);
  h += fieldText('link', 'Liên kết sản phẩm', 'https://…');
  h += filesBlock('tickets', 'Vé & thông tin cần thiết');
  h += filesBlock('files', 'Tệp đính kèm (hoá đơn, hình ảnh…)');
  h += filesBlock('unc', 'UNC');

  h += '<div class="divider"></div><div class="sec-title">Trạng thái</div>';
  h += fieldSelect('status', 'Trạng thái lịch', statusChoices(), false);
  if (!MGR()) h += '<div class="hint" style="margin-top:-8px">Duyệt / Từ chối / Hủy lịch do quản lý quyết định.</div>';

  h += '<div class="divider"></div><dl class="kv">' +
    '<dt>Thời lượng thực tế</dt><dd>' + esc(realHours(t)) + '</dd>' +
    '<dt>Tuần / Tháng</dt><dd>' + esc(t.week || '—') + ' · ' + esc(t.month || '—') + '</dd>' +
    '<dt>Mã bản ghi</dt><dd class="mini muted">' + esc(t.id) + '</dd>' +
    '</dl>';

  h += '</div>';
  $('#drBody').innerHTML = h;

  /* --- nút thao tác --- */
  const acts = [];
  if (PREVIEW()) {
    $('#drFoot').innerHTML = '<span class="mini muted">Đang xem giao diện của <b>' + esc(S.acting.name) +
      '</b> — chỉ xem, không thao tác thay họ.</span><div class="sp"></div>' +
      '<button class="btn sm" id="btnExitActing">Quay lại vai quản lý</button>';
    return;
  }
  if (MGR()) {
    if (t.status === 'Chờ duyệt/Xử lý') {
      acts.push('<button class="btn success" data-act="approve" data-id="' + t.id + '">Duyệt kế hoạch</button>');
      acts.push('<button class="btn" data-act="revise" data-id="' + t.id + '">Yêu cầu chỉnh</button>');
      acts.push('<button class="btn danger" data-act="reject" data-id="' + t.id + '">Từ chối</button>');
    }
    if (t.status === 'Đang báo cáo') {
      acts.push('<button class="btn success" data-act="done" data-id="' + t.id + '">Nghiệm thu hoàn tất</button>');
    }
    if (t.focRequest && !t.focStatus) acts.push('<button class="btn sm" data-act="foc-ok" data-id="' + t.id + '">Duyệt FOC</button>');
    if (t.mediaRequest && !t.mediaStatus) acts.push('<button class="btn sm" data-act="media-ok" data-id="' + t.id + '">Duyệt Media</button>');
    if (!CLOSED_BAD.includes(t.status)) acts.push('<button class="btn sm ghost" data-act="cancel" data-id="' + t.id + '">Hủy lịch</button>');
    acts.push('<button class="btn sm danger" data-act="delete" data-id="' + t.id + '">Xoá</button>');
  } else {
    if (['Đang lên kế hoạch', 'Từ chối/Cần điều chỉnh'].includes(t.status)) {
      acts.push('<button class="btn primary" data-act="submit" data-id="' + t.id + '">' +
        (t.status === 'Từ chối/Cần điều chỉnh' ? 'Gửi duyệt lại' : 'Gửi duyệt') + '</button>');
    }
    if (t.status === 'Duyệt/Chờ tác nghiệp') {
      acts.push('<button class="btn primary" data-act="report" data-id="' + t.id + '">Chuyển sang báo cáo</button>');
    }
  }

  $('#drFoot').innerHTML =
    '<button class="btn primary" id="drSave" disabled>Lưu thay đổi</button>' +
    '<span class="mini muted" id="drDirty"></span>' +
    '<div class="sp"></div>' + acts.join(' ');
  markDirty();
}

function markDirty() {
  const n = Object.keys(S.draft).length;
  const b = $('#drSave');
  if (!b) return;
  b.disabled = !n;
  $('#drDirty').textContent = n ? n + ' thay đổi chưa lưu' : '';
}

function setDraft(k, v) {
  const orig = S.sel[k];
  const same = JSON.stringify(orig ?? null) === JSON.stringify(v ?? null);
  if (same) delete S.draft[k]; else S.draft[k] = v;
  markDirty();
}

async function saveDraft() {
  if (!Object.keys(S.draft).length) return;
  const id = S.sel.id;
  const patch = Object.assign({}, S.draft);
  const b = $('#drSave');
  b.disabled = true; b.textContent = 'Đang lưu…';
  try {
    await api('/api/items/' + id, { method: 'PATCH', body: JSON.stringify(patch) });
    Object.assign(S.sel, patch);
    S.draft = {};
    toast('Đã lưu vào Lark Base', 'ok');
    await refresh(true);
    const again = S.items.find((x) => x.id === id);
    if (again) { S.sel = again; renderDrawer(); }
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    b.textContent = 'Lưu thay đổi';
    markDirty();
  }
}

/* ============ hành động nhanh ============ */
const ACTIONS = {
  approve:   { patch: { status: 'Duyệt/Chờ tác nghiệp' }, msg: 'Đã duyệt kế hoạch' },
  revise:    { patch: { status: 'Từ chối/Cần điều chỉnh' }, msg: 'Đã trả về để điều chỉnh' },
  reject:    { patch: { status: 'Từ chối' }, msg: 'Đã từ chối', confirm: 'Từ chối lịch tác nghiệp này?' },
  cancel:    { patch: { status: 'Hủy lịch' }, msg: 'Đã hủy lịch', confirm: 'Hủy lịch tác nghiệp này?' },
  done:      { patch: { status: 'Đã hoàn tất' }, msg: 'Đã nghiệm thu' },
  submit:    { patch: { status: 'Chờ duyệt/Xử lý' }, msg: 'Đã gửi quản lý duyệt' },
  report:    { patch: { status: 'Đang báo cáo' }, msg: 'Đã chuyển sang báo cáo' },
  'foc-ok':    { patch: { focStatus: 'Phê duyệt' }, msg: 'Đã duyệt FOC' },
  'foc-no':    { patch: { focStatus: 'Từ chối' }, msg: 'Đã từ chối FOC' },
  'media-ok':  { patch: { mediaStatus: 'Phê duyệt' }, msg: 'Đã duyệt hỗ trợ Media' },
  'media-no':  { patch: { mediaStatus: 'Từ chối' }, msg: 'Đã từ chối hỗ trợ Media' },
  paid:      { patch: { payment: 'Đã thanh toán' }, msg: 'Đã đánh dấu thanh toán' },
  hold:      { patch: { payment: 'Treo thanh toán' }, msg: 'Đã treo thanh toán' },
};

async function doAction(act, id) {
  const a = ACTIONS[act];
  if (!a) return;
  if (a.confirm && !confirm(a.confirm)) return;
  try {
    await api('/api/items/' + id, { method: 'PATCH', body: JSON.stringify(a.patch) });
    toast(a.msg, 'ok');
    await refresh(true);
    if (S.sel && S.sel.id === id) {
      const again = S.items.find((x) => x.id === id);
      if (again) { S.sel = again; S.draft = {}; renderDrawer(); }
    }
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function deleteItem(id) {
  if (!confirm('Xoá vĩnh viễn lịch tác nghiệp này khỏi Lark Base?')) return;
  try {
    await api('/api/items/' + id, { method: 'DELETE' });
    closeDrawer();
    toast('Đã xoá', 'ok');
    await refresh(true);
  } catch (e) { toast(e.message, 'err'); }
}

/* ============ đăng ký lịch mới ============ */
let NEW = {};

function openCreate(preDate) {
  NEW = {
    title: '', purpose: '', plan: '', start: preDate || '', end: '', duration: '',
    staff: [], owner: S.me ? [S.me.id] : [], transport: ['Tự túc phương tiện'],
    costPlan: '', foc: [], focRequest: false, mediaRequest: false, link: '',
    status: 'Chờ duyệt/Xử lý',
  };
  renderCreate();
  $('#modal').classList.add('on');
}

function closeModal() { $('#modal').classList.remove('on'); }

function renderCreate() {
  const O = S.options;
  const req = ' <span style="color:var(--red)">*</span>';
  const chips = (key, opts) => '<div class="multi">' + (opts || []).map((o) =>
    '<button class="opt' + ((NEW[key] || []).includes(o) ? ' on' : '') + '" data-nmulti="' + key + '" data-val="' + esc(o) + '">' +
    esc(o) + '</button>').join('') + '</div>';

  $('#mdBody').innerHTML = '<div class="frm">' +
    '<div class="frm-row"><label>Tên hoạt động' + req + '</label>' +
      '<input class="fld" data-n="title" value="' + esc(NEW.title) + '" placeholder="VD: Livestream show Tiên Cá - Vinwonders"></div>' +
    '<div class="frm-row"><label>Mục đích' + req + '</label>' +
      '<textarea class="fld" data-n="purpose" placeholder="- Cập nhật tư liệu truyền thông&#10;- Phát trực tiếp&#10;- Tư vấn tour / bán hàng">' + esc(NEW.purpose) + '</textarea></div>' +

    '<div class="frm-2">' +
      '<div class="frm-row"><label>Thời gian bắt đầu' + req + '</label>' +
        '<input type="datetime-local" class="fld" data-n="start" value="' + esc(NEW.start) + '"></div>' +
      '<div class="frm-row"><label>Thời lượng dự kiến (giờ)</label>' +
        '<select class="fld" data-n="duration"><option value="">— chọn —</option>' +
        (O.duration || []).map((o) => '<option value="' + esc(o) + '"' + (NEW.duration === o ? ' selected' : '') + '>' + esc(o) + ' giờ</option>').join('') +
        '</select></div>' +
    '</div>' +

    '<div class="frm-row"><label>Kế hoạch chi tiết</label>' +
      '<textarea class="fld" data-n="plan" placeholder="- 11h30 xuất phát&#10;- 12h00 có mặt tại địa điểm&#10;- 13h50 lên sóng&#10;- 20h00 kết thúc hành trình">' + esc(NEW.plan) + '</textarea></div>' +

    '<div class="divider"></div><div class="sec-title">Nhân sự & di chuyển</div>' +
    (MGR()
      ? '<div class="frm-row"><label>Phụ trách chính</label><div class="multi">' + S.people.map((p) =>
          '<button class="opt' + (NEW.owner.includes(p.id) ? ' on' : '') + '" data-nuser="owner" data-val="' + esc(p.id) +
          '" data-single="1">' + esc(p.name) + '</button>').join('') + '</div></div>'
      : '<div class="frm-row"><label>Phụ trách chính</label><input class="fld" value="' +
          esc(S.me ? S.me.name : '—') + '" readonly><div class="hint">Bạn là người đăng ký nên mặc định phụ trách chuyến này.</div></div>') +
    '<div class="frm-row"><label>Nhân sự cùng tác nghiệp</label><div class="multi">' + S.people.map((p) =>
      '<button class="opt' + (NEW.staff.includes(p.id) ? ' on' : '') + '" data-nuser="staff" data-val="' + esc(p.id) + '">' +
      esc(p.name) + '</button>').join('') + '</div></div>' +
    '<div class="frm-row"><label>Phương tiện</label>' + chips('transport', O.transport) + '</div>' +

    '<div class="divider"></div><div class="sec-title">' +
      (CHIPHI() ? 'Chi phí &amp; hỗ trợ' : 'Yêu cầu hỗ trợ') + '</div>' +
    (CHIPHI()
      ? '<div class="frm-row"><label>Chi phí dự kiến (đ)</label>' +
        '<input type="number" class="fld" data-n="costPlan" value="' + esc(NEW.costPlan) + '" step="1000" min="0" placeholder="600000"></div>'
      : '') +
    '<div class="frm-row" style="gap:9px">' +
      '<label class="chk"><input type="checkbox" data-n="focRequest"' + (NEW.focRequest ? ' checked' : '') + '><span>Yêu cầu FOC (vé / dịch vụ miễn phí)</span></label>' +
      '<label class="chk"><input type="checkbox" data-n="mediaRequest"' + (NEW.mediaRequest ? ' checked' : '') + '><span>Yêu cầu nhân sự phòng Media hỗ trợ</span></label>' +
      '<div class="hint">Vé FOC cần thông báo muộn nhất 3 ngày kể từ ngày gửi phê duyệt.</div></div>' +
    '<div class="frm-row"><label>Danh mục FOC</label>' + chips('foc', O.foc) + '</div>' +

    '<div class="divider"></div>' +
    '<div class="frm-row"><label>Liên kết (nếu có)</label>' +
      '<input class="fld" data-n="link" value="' + esc(NEW.link) + '" placeholder="https://drive.google.com/…"></div>' +
    '</div>';

  $('#mdFoot').innerHTML =
    '<span class="mini muted" style="margin-right:auto">Lịch gửi đi sẽ ở trạng thái <b>Chờ duyệt/Xử lý</b>.</span>' +
    '<button class="btn" data-nsave="draft">Lưu nháp</button>' +
    '<button class="btn primary" data-nsave="send">Gửi duyệt</button>';
}

async function submitCreate(mode) {
  if (!NEW.title.trim()) return toast('Chưa nhập Tên hoạt động', 'err');
  if (!NEW.purpose.trim()) return toast('Chưa nhập Mục đích', 'err');
  if (!NEW.start) return toast('Chưa chọn Thời gian bắt đầu', 'err');

  const body = {
    title: NEW.title.trim(),
    purpose: NEW.purpose.trim(),
    plan: NEW.plan.trim(),
    start: NEW.start,
    duration: NEW.duration || null,
    staff: NEW.staff,
    transport: NEW.transport,
    costPlan: NEW.costPlan === '' ? null : Number(NEW.costPlan),
    foc: NEW.foc,
    focRequest: !!NEW.focRequest,
    mediaRequest: !!NEW.mediaRequest,
    link: NEW.link.trim(),
    status: mode === 'draft' ? 'Đang lên kế hoạch' : 'Chờ duyệt/Xử lý',
  };
  if (MGR()) body.owner = NEW.owner;

  const btns = document.querySelectorAll('[data-nsave]');
  btns.forEach((b) => (b.disabled = true));
  try {
    await api('/api/items', { method: 'POST', body: JSON.stringify(body) });
    closeModal();
    toast(mode === 'draft' ? 'Đã lưu nháp vào Base' : 'Đã gửi duyệt', 'ok');
    await refresh(true);
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

/* ============ chuyển vai ============ */
/** Số lịch mỗi người phụ trách hoặc tham gia — hiện trong bảng chọn vai. */
function countFor(id) {
  return S.items.filter((t) => [...(t.owner || []), ...(t.staff || [])].some((u) => u.id === id)).length;
}

function openRoleSwitch() {
  if (!S.manager) return;
  const meId = S.me && S.me.id;
  $('#mdTitle').textContent = 'Xem giao diện của ai?';
  $('#mdBody').innerHTML =
    '<div class="banner info">Chọn một nhân sự để xem đúng màn hình họ nhìn thấy khi mở app: ' +
    'chỉ lịch của họ, chỉ 3 tab của nhân sự, không có Tổng quan / Cần xử lý / Chi phí. ' +
    'Ở chế độ này mọi thao tác ghi bị khoá để bạn không hành động thay họ.</div>' +
    '<div class="role-list">' +
    '<button class="role-card' + (!S.acting ? ' on' : '') + '" data-role="">' +
      avatar(S.me || { name: '?' }, 34) +
      '<div class="rc-txt"><div class="rc-nm">' + esc(S.me ? S.me.name : '—') + ' <span class="badge blue">Quản lý</span></div>' +
      '<div class="rc-sub">Toàn bộ ' + S.items.length + ' lịch · đầy đủ quyền duyệt</div></div>' +
      (!S.acting ? '<span class="rc-tick">✓</span>' : '') +
    '</button>' +
    S.people.filter((p) => p.id !== meId).map((p) =>
      '<button class="role-card' + (S.acting && S.acting.id === p.id ? ' on' : '') + '" data-role="' + esc(p.id) + '">' +
      avatar(p, 34) +
      '<div class="rc-txt"><div class="rc-nm">' + esc(p.name) + '</div>' +
      '<div class="rc-sub">' + countFor(p.id) + ' lịch tác nghiệp</div></div>' +
      (S.acting && S.acting.id === p.id ? '<span class="rc-tick">✓</span>' : '') +
      '</button>').join('') +
    '</div>';
  $('#mdBody').onclick = null;
  $('#mdFoot').innerHTML = '<button class="btn" data-close="1">Đóng</button>';
  $('#modal').classList.add('on');
}

async function switchRole(id) {
  S.actingId = id || null;
  S.tab = null;                       // bộ tab hai vai khác nhau, chọn lại mặc định
  S.sel = null; S.draft = {};
  closeDrawer();
  closeModal();
  await refresh(false);
  toast(id ? 'Đang xem giao diện của ' + (S.acting ? S.acting.name : '') : 'Đã quay lại vai quản lý', 'ok');
}

/* ============ phân quyền ============ */
async function openQuyen() {
  const d = await api('/api/quyen');
  const cur = new Set(d.managers);
  $('#mdTitle').textContent = 'Phân quyền quản lý';
  $('#mdBody').innerHTML = '<div class="banner info">Người trong danh sách này thấy toàn bộ lịch tác nghiệp, ' +
    'duyệt kế hoạch, FOC, Media và thanh toán. Người khác chỉ thấy lịch của chính mình.</div>' +
    '<div class="multi">' + S.people.map((p) =>
      '<button class="opt' + (cur.has(p.id) ? ' on' : '') + '" data-q="' + esc(p.id) + '">' + esc(p.name) + '</button>').join('') +
    '</div><div class="hint" style="margin-top:10px">Không thể tự bỏ quyền của chính mình.</div>';
  $('#mdFoot').innerHTML = '<button class="btn" data-close="1">Đóng</button>' +
    '<button class="btn primary" id="qSave">Lưu quyền</button>';
  $('#modal').classList.add('on');

  $('#mdBody').onclick = (e) => {
    const b = e.target.closest('[data-q]');
    if (b) b.classList.toggle('on');
  };
  $('#qSave').onclick = async () => {
    const ids = [...$('#mdBody').querySelectorAll('[data-q].on')].map((b) => b.dataset.q);
    try {
      await api('/api/quyen', { method: 'POST', body: JSON.stringify({ managers: ids }) });
      toast('Đã cập nhật quyền', 'ok');
      closeModal();
      await refresh(true);
    } catch (e2) { toast(e2.message, 'err'); }
  };
}

/* ============ refresh ============ */
let refreshing = false;
async function refresh(force) {
  if (refreshing) return;
  refreshing = true;
  try {
    await load(force);
    render();
  } catch (e) {
    toast(e.message, 'err');
  } finally { refreshing = false; }
}

/* ============ sự kiện ============ */
document.addEventListener('click', async (e) => {
  const T = e.target;

  const close = T.closest('[data-close]');
  if (close) { closeModal(); $('#mdTitle').textContent = 'Đăng ký lịch tác nghiệp'; return; }

  const tab = T.closest('[data-tab]');
  if (tab) { S.tab = tab.dataset.tab; render(); return; }

  const goto = T.closest('[data-goto]');
  if (goto) { S.tab = goto.dataset.goto; render(); return; }

  const kpi = T.closest('[data-kpi]');
  if (kpi) {
    const k = kpi.dataset.kpi;
    if (k === 'all') S.f.status = 'all';
    else if (k === 'soon') { S.f.status = 'all'; S.f.period = 'upcoming'; }
    else if (k === 'unpaid') { /* đã hiển thị bảng bên dưới */ }
    else S.f.status = k;
    if (S.tab === 'overview' && k !== 'unpaid') S.tab = 'list';
    render();
    return;
  }

  const cal = T.closest('[data-cal]');
  if (cal) {
    const d = Number(cal.dataset.cal);
    if (d === 0) { const n = new Date(); S.cal = { y: n.getFullYear(), m: n.getMonth() }; }
    else {
      let m = S.cal.m + d, y = S.cal.y;
      if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
      S.cal = { y, m };
    }
    render();
    return;
  }

  const dayOpen = T.closest('[data-dayopen]');
  if (dayOpen) {
    const k = dayOpen.dataset.dayopen;
    S.tab = 'list';
    S.f.q = '';
    S.f.period = 'm:' + k.slice(0, 7);
    render();
    return;
  }

  const act = T.closest('[data-act]');
  if (act) {
    e.stopPropagation();
    const a = act.dataset.act;
    if (a === 'delete') await deleteItem(act.dataset.id);
    else await doAction(a, act.dataset.id);
    return;
  }

  const open = T.closest('[data-open]');
  if (open) { openItem(open.dataset.open); return; }

  // chuyển vai
  const roleCard = T.closest('[data-role]');
  if (roleCard) { await switchRole(roleCard.dataset.role); return; }
  if (T.closest('#btnExitActing')) { await switchRole(''); return; }

  if (T.closest('#btnQuyen')) { await openQuyen(); return; }     // trước chipUser
  if (T.closest('#chipUser')) { openRoleSwitch(); return; }

  if (T.closest('#btnNew')) { $('#mdTitle').textContent = 'Đăng ký lịch tác nghiệp'; openCreate(); return; }
  if (T.closest('#btnRefresh')) { toast('Đang tải lại…'); await refresh(true); return; }
  if (T.closest('#drClose') || T.closest('#mask')) { closeDrawer(); return; }
  if (T.closest('#drSave')) { await saveDraft(); return; }
  if (T.closest('#fReset')) { S.f = { period: 'month', person: 'all', status: 'all', q: '' }; render(); return; }

  // multi-select trong drawer
  const mo = T.closest('[data-multi]');
  if (mo) {
    const k = mo.dataset.multi;
    const cur = (dv(k) || []).slice();
    const i = cur.indexOf(mo.dataset.val);
    if (i >= 0) cur.splice(i, 1); else cur.push(mo.dataset.val);
    setDraft(k, cur);
    mo.classList.toggle('on');
    return;
  }

  /* ô chọn người: mở/đóng bảng, bỏ nhanh một chip */
  const pkx = T.closest('[data-pkx]');
  if (pkx) {
    const hop = pkx.closest('.pk');
    const dong = hop.querySelector('[data-val="' + pkx.dataset.pkx + '"]');
    if (dong) dong.click();
    return;
  }
  const sum = T.closest('.pk-sum');
  if (sum) {
    const pn = sum.parentElement.querySelector('.pk-panel');
    const dangMo = !pn.hidden;
    document.querySelectorAll('.pk-panel').forEach((x) => { x.hidden = true; });
    pn.hidden = dangMo;
    if (!pn.hidden) { const tim = pn.querySelector('.pk-tim'); if (tim) { tim.value = ''; timNguoi(pn); tim.focus(); } }
    return;
  }
  if (!T.closest('.pk-panel')) document.querySelectorAll('.pk-panel').forEach((x) => { x.hidden = true; });

  const uo = T.closest('[data-user]');
  if (uo) {
    const k = uo.dataset.user;
    const single = uo.dataset.single === '1';
    let cur = (dv(k) || []).map((u) => (typeof u === 'string' ? u : u.id));
    const id = uo.dataset.val;
    if (single) cur = cur.includes(id) ? [] : [id];
    else { const i = cur.indexOf(id); if (i >= 0) cur.splice(i, 1); else cur.push(id); }
    setDraft(k, cur.map((x) => ({ id: x, name: (S.people.find((p) => p.id === x) || {}).name || x })));
    const hop = uo.closest('.pk') || uo.parentElement;
    hop.querySelectorAll('[data-user="' + k + '"]').forEach((b) => {
      const chon = cur.includes(b.dataset.val);
      b.classList.toggle('on', chon);
      const tick = b.querySelector('.pk-tick');
      if (tick) tick.textContent = chon ? '✓' : '';
    });
    const oChip = hop.querySelector('.pk-chips');
    if (oChip) oChip.innerHTML = chipsHtml(cur, true, hop.dataset.ph || 'Chọn nhân sự…');
    if (single) { const pn = hop.querySelector('.pk-panel'); if (pn) pn.hidden = true; }
    return;
  }

  // multi-select trong form tạo mới
  const nm = T.closest('[data-nmulti]');
  if (nm) {
    const k = nm.dataset.nmulti;
    const cur = NEW[k] || [];
    const i = cur.indexOf(nm.dataset.val);
    if (i >= 0) cur.splice(i, 1); else cur.push(nm.dataset.val);
    NEW[k] = cur;
    nm.classList.toggle('on');
    return;
  }

  const nu = T.closest('[data-nuser]');
  if (nu) {
    const k = nu.dataset.nuser;
    const id = nu.dataset.val;
    if (nu.dataset.single === '1') NEW[k] = NEW[k].includes(id) ? [] : [id];
    else { const c = NEW[k]; const i = c.indexOf(id); if (i >= 0) c.splice(i, 1); else c.push(id); }
    nu.parentElement.querySelectorAll('[data-nuser="' + k + '"]').forEach((b) => {
      b.classList.toggle('on', NEW[k].includes(b.dataset.val));
    });
    return;
  }

  const ns = T.closest('[data-nsave]');
  if (ns) { await submitCreate(ns.dataset.nsave); return; }
});

/** Lọc danh sách trong bảng chọn người theo ô tìm. */
function timNguoi(panel) {
  const q = (panel.querySelector('.pk-tim').value || '').trim().toLowerCase();
  let hien = 0;
  panel.querySelectorAll('.pk-row').forEach((r) => {
    const khop = !q || (r.dataset.ten || '').includes(q);
    r.hidden = !khop;
    if (khop) hien += 1;
  });
  let trong = panel.querySelector('.pk-trong-ds');
  if (!hien && !trong) {
    trong = document.createElement('div');
    trong.className = 'pk-trong-ds';
    trong.textContent = 'Không có ai khớp';
    panel.querySelector('.pk-ds').appendChild(trong);
  }
  if (trong) trong.hidden = !!hien;
}

/* input / change */
document.addEventListener('input', (e) => {
  if (e.target.classList && e.target.classList.contains('pk-tim')) {
    timNguoi(e.target.closest('.pk-panel'));
    return;
  }
  const T = e.target;
  if (T.id === 'fQ') { S.f.q = T.value; clearTimeout(window.__qt); window.__qt = setTimeout(render, 240); return; }

  const k = T.dataset && T.dataset.k;
  if (k && S.sel) {
    if (T.type === 'checkbox') setDraft(k, T.checked);
    else if (T.type === 'number') setDraft(k, T.value === '' ? null : Number(T.value));
    else if (T.type === 'datetime-local') setDraft(k, T.value ? new Date(T.value).toISOString() : null);
    else setDraft(k, T.value);
    return;
  }
  const n = T.dataset && T.dataset.n;
  if (n) { NEW[n] = T.type === 'checkbox' ? T.checked : T.value; }
});

document.addEventListener('change', async (e) => {
  const T = e.target;
  if (T.id === 'fPeriod') {
    S.f.period = T.value;
    render();
    // kéo cả lớp vỏ và các base khác theo (nếu khoảng này diễn tả được bằng ngày)
    const k = khoangCuaKy(T.value);
    if (k !== undefined && window.hubBaoKhoang) window.hubBaoKhoang(k ? k.tu : '', k ? k.den : '');
    return;
  }
  if (T.id === 'fStatus') { S.f.status = T.value; render(); return; }
  if (T.id === 'fPerson') { S.f.person = T.value; render(); return; }

  const k = T.dataset && T.dataset.k;
  if (k && S.sel && T.tagName === 'SELECT') { setDraft(k, T.value || null); return; }
  const n = T.dataset && T.dataset.n;
  if (n && T.tagName === 'SELECT') { NEW[n] = T.value; return; }

  const up = T.dataset && T.dataset.up;
  if (up && T.files && T.files[0] && S.sel) {
    if (PREVIEW()) { T.value = ''; return toast('Đang xem giao diện của người khác — không tải tệp thay họ được.', 'err'); }
    const f = T.files[0];
    toast('Đang tải "' + f.name + '" lên…');
    try {
      await fetch(apiUrl('/api/items/' + S.sel.id + '/attachment/' + up + '?name=' + encodeURIComponent(f.name)),
        { method: 'POST', body: f }).then(async (r) => {
          const d = await r.json();
          if (!r.ok || d.error) throw new Error(d.error || 'Tải lên thất bại');
        });
      toast('Đã tải tệp lên Base', 'ok');
      await refresh(true);
      const again = S.items.find((x) => x.id === S.sel.id);
      if (again) { S.sel = again; renderDrawer(); }
    } catch (err) { toast(err.message, 'err'); }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('#modal').classList.contains('on')) closeModal();
    else if ($('#drawer').classList.contains('on')) closeDrawer();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && S.sel) { e.preventDefault(); saveDraft(); }
});

/* ============ khởi động ============ */
(async () => {
  try {
    await load(false);
    render();
    // ?rec=recXXX -> mở luôn ô chi tiết (deep link từ hub hoặc từ Lark)
    const rec = new URLSearchParams(location.search).get('rec');
    if (rec && (S.items || []).some((x) => x.id === rec)) openItem(rec);
    if (!S.me) {
      toast('Chưa đăng nhập lark-cli — chạy: lark-cli auth login', 'err');
    }
  } catch (e) {
    $('#page').innerHTML = '<div class="card card-pad"><div class="empty">' +
      '<div class="ttl">Không kết nối được Lark Base</div><div class="mini">' + esc(e.message) + '</div></div></div>';
  }
  setInterval(() => { if (!S.sel && !$('#modal').classList.contains('on')) refresh(false); }, 60000);
})();

/* ============================================================
   Nghe lệnh từ Marketing Hub (lớp vỏ)
   Bấm một lịch ở trang Tổng quan của hub -> mở đúng ô chi tiết ở đây.
   ============================================================ */
window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin) return;
  const d = ev.data || {};

  if (d.hub === 'open' && d.rec) {
    const bao = (loai) => {
      try { parent.postMessage({ hub: loai, rec: d.rec }, location.origin); } catch (e) {}
    };
    if ((S.items || []).some((x) => x.id === d.rec)) { openItem(d.rec); bao('opened'); return; }
    // đang nạp Base thì im lặng, hub gửi lại sau 1s
    if ((S.items || []).length) bao('khong-thay');
  }

  if (d.hub === 'tab' && d.v) { S.tab = d.v; render(); }
});

/* Bấm ra vùng trống (hoặc Esc) là đóng bảng chọn người — thao tác quen tay.
   Đặt ở mousedown/document để không phụ thuộc thứ tự các nhánh trong handler click. */
document.addEventListener('mousedown', (e) => {
  const mo = document.querySelectorAll('.pk-panel:not([hidden])');
  if (!mo.length) return;
  if (e.target.closest && e.target.closest('.pk')) return;   // bấm trong chính ô chọn
  mo.forEach((p) => { p.hidden = true; });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const mo = document.querySelectorAll('.pk-panel:not([hidden])');
  if (!mo.length) return;
  e.stopPropagation();                       // Esc đóng bảng chọn trước, không đóng drawer
  mo.forEach((p) => { p.hidden = true; });
}, true);
