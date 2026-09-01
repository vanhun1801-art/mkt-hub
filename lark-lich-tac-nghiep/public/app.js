/* Rooty Trip · Lịch tác nghiệp — giao diện quản lý & nhân sự trên Lark Base */
'use strict';

/* ============ state ============ */
const S = {
  me: null,
  manager: false,
  items: [],
  people: [],
  // danh bạ phòng lấy từ lớp vỏ — rộng hơn danh sách người có trong Base này
  danhBa: [],
  options: {},
  config: {},
  acting: null,       // quản lý đang xem thử giao diện của nhân sự nào
  actingId: null,     // open_id đang mượn vai (gửi kèm mỗi lần tải)
  tab: null,
  sel: null,          // record đang mở trong drawer
  draft: {},          // thay đổi chưa lưu trong drawer
  cal: null,          // {y, m} tháng đang xem ở tab Lịch
  f: { period: 'month', person: 'all', status: 'all', q: '', the: '' },   // mặc định: tháng hiện tại; `the` = thẻ số đang chọn ở Lịch của tôi
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

/* ==========================================================================
   NGÀY GIỜ — cả app dùng đúng một dạng: dd/mm/yyyy HH:mm, 24 giờ, giờ Việt Nam.
   Base ghi theo giờ Việt Nam (UTC+7, không có giờ mùa hè) nên quy đổi bằng độ
   lệch cố định thay vì mượn múi giờ của máy: máy nhân sự đặt sai múi giờ, hay
   máy chủ Render chạy giờ UTC, đều vẫn ra đúng một con số.
   ========================================================================== */
const LECH_VN = 7 * 3600000;

/** Tách một mốc thời gian thành ngày–giờ Việt Nam. */
function vnParts(v) {
  const d = toDate(v);
  if (!d) return null;
  const x = new Date(d.getTime() + LECH_VN);
  return {
    y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(),
    H: x.getUTCHours(), M: x.getUTCMinutes(),
  };
}

/** Ghép ngày–giờ Việt Nam thành mốc ISO có kèm múi giờ để gửi lên máy chủ. */
function vnISO(p) {
  return new Date(Date.UTC(p.y, p.m - 1, p.d, p.H, p.M) - LECH_VN).toISOString();
}

function fmtD(v) {
  const p = vnParts(v);
  return p ? pad(p.d) + '/' + pad(p.m) + '/' + p.y : '—';
}

function fmtDT(v) {
  const p = vnParts(v);
  if (!p) return '—';
  // Mốc đúng 00:00 thường là ngày không có giờ cụ thể — khỏi hiện "00:00" thừa
  return fmtD(v) + ((p.H || p.M) ? ' ' + pad(p.H) + ':' + pad(p.M) : '');
}

/** Dạng đầy đủ cho ô nhập: luôn có giờ, kể cả 00:00. */
function vnText(v) {
  const p = vnParts(v);
  return p ? pad(p.d) + '/' + pad(p.m) + '/' + p.y + ' ' + pad(p.H) + ':' + pad(p.M) : '';
}

/**
 * Đọc chuỗi người dùng gõ tay thành mốc ISO.
 * Nhận rộng tay: 29/8/2026 14:40 · 29-08-2026 14:40 · 29/08/2026 (thành 00:00)
 * · 29/08 (lấy năm hiện tại). Không đọc được thì trả null.
 */
function docNgayVN(str) {
  const s0 = String(str || '').trim();
  if (!s0) return null;
  const m = s0.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?(?:[\s,]+(\d{1,2})[:h.](\d{1,2}))?$/);
  if (!m) return null;
  const nay = vnParts(new Date());
  const d = +m[1], mo = +m[2];
  let y = m[3] == null ? nay.y : +m[3];
  if (y < 100) y += 2000;
  const H = m[4] == null ? 0 : +m[4];
  const M = m[5] == null ? 0 : +m[5];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || H > 23 || M > 59) return null;
  const iso = vnISO({ y, m: mo, d, H, M });
  const lai = vnParts(iso);
  // 31/02 sẽ bị Date đẩy sang tháng sau — bắt lại chứ không nhận bừa
  return (lai.d === d && lai.m === mo) ? iso : null;
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
/* Đầu ngày theo giờ Việt Nam. Trả về đúng một mốc thời gian nên vẫn so sánh và
 * cộng trừ được như cũ, chỉ khác là không phụ thuộc múi giờ của máy. */
const startOfDay = (d) => new Date(Math.floor((d.getTime() + LECH_VN) / 86400000) * 86400000 - LECH_VN);
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
const qHuy = () => S.items.filter((t) => t.cancelWant && !CLOSED_BAD.includes(t.status));
// Bước cuối của cả luồng, trước nay không có hàng đợi nào — báo cáo nộp xong
// nằm im, quản lý chỉ tình cờ thấy trong tab Danh sách.
const qNghiemThu = () => S.items.filter((t) => t.status === 'Đang báo cáo' && duBaoCao(t));
const qBaoCaoDo = () => S.items.filter((t) => t.status === 'Đang báo cáo' && !duBaoCao(t));
// Nháp để lâu: của ai người nấy dọn, nhưng quản lý cần thấy để nhắc
const qNhapCu = () => {
  const moc = Date.now() - 14 * 86400000;
  return S.items.filter((t) => t.status === 'Đang lên kế hoạch' &&
    toDate(t.start) && toDate(t.start).getTime() < moc);
};

const qReport = () => {
  const today = startOfDay(new Date());
  return S.items.filter((t) => {
    const d = toDate(t.start);
    return d && d < today && ['Duyệt/Chờ tác nghiệp'].includes(t.status);
  });
};
const approveCount = () =>
  qWaiting().length + qFoc().length + qMedia().length + qHuy().length + qNghiemThu().length;

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
/* Yêu cầu FOC phải trả lời trong 3 ngày — app vẫn ghi câu đó, nhưng trước nay
 * không đo. Mốc đếm lấy theo ngày tác nghiệp vì Base không lưu ngày gửi. */
function soNgayCho(t) {
  const d = toDate(t.start);
  if (!d) return 0;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
}

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
    } else if (kind === 'nghiemthu') {
      acts = '<button class="btn sm success" data-act="done" data-id="' + t.id + '">Nghiệm thu hoàn tất</button>' +
             '<button class="btn sm" data-open="' + t.id + '">Xem báo cáo</button>';
    } else if (kind === 'bcdo' || kind === 'nhapcu') {
      acts = '<button class="btn sm" data-open="' + t.id + '">Xem chi tiết</button>';
    } else if (kind === 'huy') {
      acts = '<button class="btn sm danger" data-act="huy-ok" data-id="' + t.id + '">Duyệt huỷ</button>' +
             '<button class="btn sm" data-act="huy-no" data-id="' + t.id + '">Giữ lịch</button>';
    } else if (kind === 'pay') {
      acts = '<button class="btn sm success" data-act="paid" data-id="' + t.id + '">Đã thanh toán</button>' +
             '<button class="btn sm" data-act="hold" data-id="' + t.id + '">Treo</button>';
    } else {
      acts = '<button class="btn sm" data-open="' + t.id + '">Xem chi tiết</button>';
    }

    /* Hàng đợi FOC vừa cần thấy danh mục xin, vừa cần thấy đã chờ bao lâu — quy
     * tắc "trả lời trong 3 ngày" của phòng trước nay chỉ nằm trên chữ, không đo. */
    const cho = soNgayCho(t);
    const extra = kind === 'foc'
      ? (t.foc || []).map((x) => '<span class="tag">' + esc(x) + '</span>').join('') +
        '<span class="mini" style="' + (cho > 3 ? 'color:var(--red-t);font-weight:600' : 'color:var(--t3)') +
        '">Đã chờ ' + cho + ' ngày' + (cho > 3 ? ' — quá 3 ngày' : '') + '</span>'
      : kind === 'pay' ? '<span class="mini muted">Thực tế ' + money(t.costActual) + ' đ</span>'
      : kind === 'huy' ? '<span class="mini" style="color:var(--red-t)">Lý do: ' + esc(t.cancelReason || '(không ghi)') + '</span>'
      : kind === 'bcdo' ? '<span class="mini" style="color:var(--orange-t)">Thiếu: ' + esc(thieuGiBaoCao(t).join(', ')) + '</span>'
      : kind === 'nhapcu' ? '<span class="mini muted">Ngày dự định: ' + esc(fmtD(t.start)) + '</span>' : '';

    h += '<tr data-open="' + t.id + '">' +
      '<td><div class="tname">' + esc(t.title || '(chưa đặt tên)') + '</div>' +
        '<div class="tsub">' + esc((t.purpose || '').replace(/\n/g, ' ').slice(0, 90)) + '</div>' + extra + '</td>' +
      '<td class="nowrap">' + esc(fmtDT(t.start)) + (t.duration ? '<div class="tsub">' + esc(t.duration) + ' giờ</div>' : '') + '</td>' +
      '<td>' + peopleStack(t.owner, 1) + '</td>' +
      '<td>' + peopleStack(t.staff, 3) + '</td>' +
      '<td class="num nowrap">' + money(t.costPlan) + '</td>' +
      '<td>' + badge(t.status) + '</td>' +
      '<td><div style="display:flex;gap:5px;flex-wrap:wrap">' + acts + '</div></td>' +
      '</tr>';
  }
  return h + '</tbody></table></div></div>';
}

function viewApprove() {
  let h = '<div class="banner info">' +
    '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.2v4M8 4.8v.6" stroke-linecap="round"/></svg>' +
    '<div class="sp">Mọi thao tác ở đây ghi thẳng vào Lark Base. Bấm vào dòng để mở chi tiết trước khi quyết định.</div></div>';
  h += queueCard('Chờ duyệt kế hoạch', qWaiting(), 'Duyệt · Cần chỉnh · Từ chối', 'plan');
  h += queueCard('Xin huỷ lịch', qHuy(), 'Nhân sự xin huỷ — đọc lý do rồi quyết định', 'huy');
  h += queueCard('Báo cáo chờ nghiệm thu', qNghiemThu(), 'Nhân sự đã nộp đủ — đọc rồi chốt Hoàn tất', 'nghiemthu');
  h += queueCard('Báo cáo còn dở dang', qBaoCaoDo(), 'Đã bấm nộp nhưng chưa điền đủ — nhắc lại người phụ trách', 'bcdo');
  h += queueCard('Yêu cầu FOC', qFoc(), 'Thông báo muộn nhất 3 ngày kể từ ngày gửi', 'foc');
  h += queueCard('Yêu cầu nhân sự phòng Media', qMedia(), 'Phê duyệt hoặc từ chối hỗ trợ', 'media');
  h += queueCard('Quá ngày chưa báo cáo', qReport(), 'Đã duyệt nhưng chưa chuyển sang báo cáo', 'late');
  h += queueCard('Chờ thanh toán chi phí', qPay(), 'Đã hoàn tất và có chi phí thực tế', 'pay');
  h += queueCard('Nháp để quá lâu', qNhapCu(), 'Quá 14 ngày kể từ ngày dự định đi mà chưa gửi duyệt', 'nhapcu');
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
/**
 * Dải thẻ số của trang "Lịch của tôi".
 *
 * Bấm một thẻ là lọc luôn xuống làn tương ứng — số và danh sách phải khớp nhau,
 * nên mỗi thẻ khai kèm bộ lọc của chính nó thay vì đếm một kiểu, lọc một kiểu.
 */
function theSoLichCuaToi(list) {
  const homNay = startOfDay(new Date());
  const mai2 = new Date(homNay.getTime() + 2 * 86400000);
  const con = (t) => !CLOSED_BAD.includes(t.status);
  const ngay = (t) => toDate(t.start);

  /* Xếp và tô theo MỨC CẤP BÁCH, gấp nhất đứng trước:
   *   đỏ   = đã trễ, phải làm ngay
   *   cam  = hôm nay
   *   vàng = trong 48 giờ, lo trước đi
   *   xám  = đang chờ người khác, chưa tới lượt mình
   *   xanh / tím / lục = đang yên, chỉ để tra cứu
   * Riêng hai thẻ đỏ và cam được tô nền (class "gap") để mắt bắt trước tiên. */
  const the = [
    /* Chỉ đếm lịch MÌNH phụ trách: nhân sự đi cùng không nộp báo cáo nên không
     * việc gì phải mang con số đỏ của người khác. Nộp rồi (Đang báo cáo) cũng
     * hết trễ — bóng đang ở sân quản lý. */
    { k: 'chua-bao-cao', nhan: 'Trễ báo cáo', tone: 'do', gap: 1, phu: 'phải nộp ngay',
      loc: (t) => ngay(t) && ngay(t) < homNay && (MGR() || laPhuTrach(t)) &&
        (t.status === 'Duyệt/Chờ tác nghiệp' ||
         (t.status === 'Đang báo cáo' && !duBaoCao(t))) },
    { k: 'hom-nay', nhan: 'Hôm nay', tone: 'cam', gap: 1, phu: 'đi trong hôm nay',
      loc: (t) => con(t) && ngay(t) && startOfDay(ngay(t)).getTime() === homNay.getTime() },
    { k: 'sap-48h', nhan: '48 giờ tới', tone: 'vang', phu: 'chuẩn bị trước',
      loc: (t) => con(t) && ngay(t) && ngay(t) > new Date() && ngay(t) <= mai2 },
    { k: 'cho-duyet', nhan: 'Chờ duyệt', tone: 'xam', phu: 'chờ quản lý',
      loc: (t) => t.status === 'Chờ duyệt/Xử lý' },
    { k: 'da-duyet', nhan: 'Đã duyệt', tone: 'xanh', phu: 'được đi',
      loc: (t) => t.status === 'Duyệt/Chờ tác nghiệp' },
    { k: 'chua-thanh-toan', nhan: 'Chưa thanh toán', tone: 'tim', phu: 'đang chờ tiền',
      loc: (t) => Number(t.costActual || 0) > 0 && t.payment !== 'Đã thanh toán' },
    { k: 'hoan-tat', nhan: 'Hoàn tất', tone: 'luc', phu: 'xong việc',
      loc: (t) => t.status === 'Đã hoàn tất' },
  ];

  return '<div class="the-lich">' + the.map((x) => {
    const n = list.filter(x.loc).length;
    const chon = S.f.the === x.k;
    // thẻ rỗng thì nhạt hẳn, kể cả thẻ gấp — không có việc thì đừng gào lên
    return '<button class="the-o t-' + x.tone + (n ? (x.gap ? ' gap' : '') : ' rong') +
      (chon ? ' chon' : '') + '" data-the="' + x.k + '">' +
      '<span class="the-so">' + n + '</span>' +
      '<span class="the-nhan">' + esc(x.nhan) + '</span>' +
      '<span class="the-phu">' + esc(x.phu) + '</span></button>';
  }).join('') + '</div>';
}

/** Bộ lọc của thẻ đang chọn — để làn bên dưới khớp với con số vừa bấm. */
function locTheoThe(list) {
  if (!S.f.the) return list;
  const gia = theSoLichCuaToi(list);   // dựng lại để lấy đúng định nghĩa
  void gia;
  const homNay = startOfDay(new Date());
  const mai2 = new Date(homNay.getTime() + 2 * 86400000);
  const con = (t) => !CLOSED_BAD.includes(t.status);
  const ngay = (t) => toDate(t.start);
  const bang = {
    'cho-duyet': (t) => t.status === 'Chờ duyệt/Xử lý',
    'da-duyet': (t) => t.status === 'Duyệt/Chờ tác nghiệp',
    'hom-nay': (t) => con(t) && ngay(t) && startOfDay(ngay(t)).getTime() === homNay.getTime(),
    'sap-48h': (t) => con(t) && ngay(t) && ngay(t) > new Date() && ngay(t) <= mai2,
    'chua-bao-cao': (t) => ngay(t) && ngay(t) < homNay && (MGR() || laPhuTrach(t)) &&
      (t.status === 'Duyệt/Chờ tác nghiệp' ||
       (t.status === 'Đang báo cáo' && !duBaoCao(t))),
    'hoan-tat': (t) => t.status === 'Đã hoàn tất',
    'chua-thanh-toan': (t) => Number(t.costActual || 0) > 0 && t.payment !== 'Đã thanh toán',
  };
  return bang[S.f.the] ? list.filter(bang[S.f.the]) : list;
}

function viewMine() {
  const v = viewer();
  const meId = v && v.id;
  const mine = S.items.filter((t) => !meId || [...(t.owner || []), ...(t.staff || [])].some((u) => u.id === meId));
  const q = S.f.q.trim().toLowerCase();
  const list = mine.filter((t) => (!q || (t.title || '').toLowerCase().includes(q)) && inPeriod(t, S.f.period));

  /* Bốn bước theo đúng đường đi thật của một chuyến tác nghiệp. Đặt tên theo việc
   * phải làm, không theo tên trạng thái trong Base. */
  const daQua = (t) => toDate(t.start) && toDate(t.start) < startOfDay(new Date());
  const buocs = [
    { k: 'nhap', t: '1 · Nháp', mo: 'Chưa gửi đi — điền xong thì bấm Gửi duyệt',
      loc: (t) => t.status === 'Đang lên kế hoạch' },
    /* Lịch bị trả về gộp chung vào bước 2: với nhân sự thì cả hai đều là "đã gửi
     * đi rồi", khác nhau ở chỗ một cái bị trả — nên thẻ trả về tô đỏ riêng. */
    { k: 'cho', t: '2 · Đã gửi · chờ duyệt', mo: 'Gồm cả lịch bị trả về cần điều chỉnh',
      loc: (t) => ['Chờ duyệt/Xử lý', 'Từ chối/Cần điều chỉnh'].includes(t.status) },
    { k: 'chuan-bi', t: '3 · Đã duyệt · chuẩn bị đi', mo: 'Xem lại giờ, phương tiện, vé',
      loc: (t) => t.status === 'Duyệt/Chờ tác nghiệp' && !daQua(t) },
    /* Bước này CHỈ chứa lịch chưa nộp. Trước đây nó nhận cả 'Đang báo cáo', mà
     * bấm Gửi báo cáo chính là chuyển sang trạng thái đó — nên nộp xong thẻ vẫn
     * nằm nguyên chỗ cũ, người ta tưởng bấm hụt. */
    /* Bấm nút Báo cáo là trạng thái đổi ngay, nhưng nội dung có thể còn dở —
     * điền thiếu thì vẫn nằm ở bước này cho tới khi đủ, đừng đẩy sang chờ
     * nghiệm thu để rồi quản lý mở ra thấy trống. */
    { k: 'bao-cao', t: '4 · Cần báo cáo', mo: 'Đã qua ngày đi, hoặc báo cáo còn thiếu',
      loc: (t) => (t.status === 'Duyệt/Chờ tác nghiệp' && daQua(t)) ||
        (t.status === 'Đang báo cáo' && !duBaoCao(t)) },
    { k: 'da-nop', t: '5 · Đã nộp · chờ nghiệm thu', mo: 'Quản lý đang xem, chưa cần làm gì',
      loc: (t) => t.status === 'Đang báo cáo' && duBaoCao(t) },
    { k: 'xong', t: 'Đã hoàn tất', mo: 'Xong việc, để đối chiếu cuối tháng',
      loc: (t) => t.status === 'Đã hoàn tất' },
    { k: 'dong', t: 'Đã đóng', mo: 'Từ chối hoặc huỷ',
      loc: (t) => ['Từ chối', 'Hủy lịch'].includes(t.status) },
  ].filter((b) => b.k !== 'dong' || MGR());   // lịch đã đóng chỉ quản lý cần thấy

  const today = startOfDay(new Date());
  /* Chỉ lịch ĐÃ DUYỆT mới lên bảng nhắc: đây là chỗ nhắc "sắp đi rồi, chuẩn bị gì".
   * Lịch còn chờ duyệt thì chưa chắc được đi — nhắc chuẩn bị là nhắc sai. */
  const soon = list.filter((t) => {
    const d = toDate(t.start);
    return d && d >= today && d < addDays(today, 8) && t.status === 'Duyệt/Chờ tác nghiệp';
  }).sort(byStartAsc);

  let h = '';
  const needFix = list.filter((t) => t.status === 'Từ chối/Cần điều chỉnh');
  if (needFix.length) {
    h += '<div class="banner"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<path d="M8 2l6 11H2L8 2z"/><path d="M8 6.4v3M8 11.2v.5" stroke-linecap="round"/></svg>' +
      '<div class="sp"><b>' + needFix.length + ' lịch</b> bị trả về cần điều chỉnh rồi gửi duyệt lại.</div></div>';
  }

  h += filterBar({ noStatus: true, noPerson: true });
  h += theSoLichCuaToi(list);

  if (soon.length && !S.f.the) {
    h += '<div class="card card-pad nhac" style="margin-bottom:16px"><div class="section-head">' +
      '<h2>Sắp đi — nhớ chuẩn bị</h2>' +
      '<span class="muted">Đã duyệt · 7 ngày tới · ' + soon.length + ' lịch</span></div>' +
      '<div class="nhac-luoi">' +
      soon.slice(0, 8).map((t) => {
        const d = toDate(t.start);
        const days = Math.round((startOfDay(d) - today) / 86400000);
        const when = days === 0 ? 'Hôm nay' : days === 1 ? 'Ngày mai' : 'Còn ' + days + ' ngày';
        /* Mỗi thẻ trả lời đúng mấy câu nhân sự cần biết trước khi bước ra khỏi cửa:
         * đi lúc nào, đi bằng gì, vé xong chưa, cầm theo cái gì, ai đi cùng. */
        const cb = [];
        cb.push((t.transport || []).length ? '🚗 ' + t.transport.join(', ') : '🚗 chưa chọn phương tiện');
        if (t.duration) cb.push('⏱ dự kiến ' + t.duration + ' giờ');
        if ((t.foc || []).length) {
          cb.push(t.focStatus === 'Phê duyệt' ? '🎟 vé đã duyệt — nhớ nhận vé trước khi đi'
            : t.focStatus === 'Từ chối' ? '🎟 vé bị từ chối — tự lo'
            : '🎟 vé chưa duyệt — hỏi quản lý');
        }
        if ((t.tickets || []).length) cb.push('📎 đã có ' + t.tickets.length + ' tệp vé / thông tin');
        if (t.mediaRequest) cb.push(t.mediaStatus === 'Phê duyệt' ? '🎥 có Media đi cùng' : '🎥 Media chưa xác nhận');
        return '<button class="nhac-o" data-phieu="' + t.id + '">' +
          '<div class="nhac-dau"><span class="badge ' + (days <= 1 ? 'orange' : 'blue') + '">' + esc(when) + '</span>' +
          '<span class="nhac-gio">' + esc(fmtDT(t.start)) + '</span></div>' +
          '<div class="nhac-ten">' + esc(t.title || '(chưa đặt tên)') + '</div>' +
          '<ul class="nhac-ds">' + cb.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
          '</button>';
      }).join('') + '</div></div>';
  }

  const hien = locTheoThe(list);
  h += '<div class="buocs">';
  for (const b of buocs) {
    const arr = hien.filter(b.loc).sort(byStartAsc);
    // Đang lọc theo thẻ số thì bỏ hẳn bước rỗng, khỏi phải cuộn qua chỗ trống.
    // Lúc xem đủ thì vẫn giữ bước rỗng nhưng làm nhạt đầu bước, giống cách
    // Bảng công việc làm mờ làn không có việc.
    if (!arr.length && S.f.the) continue;
    h += '<section class="buoc buoc-' + b.k + (arr.length ? '' : ' buoc-rong') + '">' +
      '<div class="buoc-dau"><span class="buoc-ten">' + esc(b.t) + '</span>' +
      '<span class="buoc-n">' + arr.length + '</span>' +
      '<span class="buoc-mo">' + esc(b.mo) + '</span></div>' +
      '<div class="buoc-than">';
    if (!arr.length) h += '<div class="buoc-trong">Không có lịch nào ở bước này.</div>';
    for (const t of arr) h += theViec(t, b.k);
    h += '</div></section>';
  }
  h += '</div>';
  return h;
}

/**
 * Thẻ việc ở trang "Lịch của tôi", viết theo VIỆC PHẢI LÀM chứ không theo trạng thái.
 *
 * Quy trình của nhân sự: gửi duyệt → chờ quản lý → được duyệt thì nắm thông tin và
 * nhận vé → đi xong thì bấm Báo cáo → quản lý chốt thành Hoàn tất. Mỗi thẻ vì thế
 * chỉ nói đúng một câu "bây giờ làm gì" và cho đúng một nút chính.
 */
/**
 * Báo cáo đã đủ thông tin chưa?
 *
 * Trạng thái "Đang báo cáo" trên Base chỉ nói người ta đã bấm nút, không nói đã
 * điền xong. Có bản ghi mang trạng thái đó mà thiếu cả chi phí thực tế — coi là
 * đã nộp thì quản lý nghiệm thu một bản trống, còn nhân sự thì không ai nhắc.
 *
 * Chi phí chỉ tính khi người đang xem được phép thấy cột tiền; ai không có
 * quyền đó thì máy chủ cắt cột trước khi gửi xuống, kiểm ở đây sẽ luôn ra
 * "thiếu" một cách oan uổng.
 */
function thieuGiBaoCao(t) {
  const thieu = [];
  if (!t.end) thieu.push('thời gian kết thúc');
  if (!String(t.reportAfter || '').trim()) thieu.push('báo cáo sau tác nghiệp');
  // Người phụ trách LUÔN phải khai chi phí chuyến của mình, dù không có quyền
  // xem chi phí của cả phòng — máy chủ cũng đã mở đúng ô này cho họ.
  if ((CHIPHI() || laPhuTrach(t)) && t.costActual == null) thieu.push('chi phí thực tế');
  return thieu;
}

const duBaoCao = (t) => thieuGiBaoCao(t).length === 0;

/**
 * Đã tới lúc bị giục báo cáo chưa?
 * Mốc: 9 giờ sáng NGÀY HÔM SAU ngày tác nghiệp — đi về, ngủ một giấc, sáng ra là
 * phải nộp. Trước mốc đó thì chưa giục, để nhân sự còn nghỉ.
 */
function toiHanBaoCao(t) {
  const d = toDate(t.start);
  if (!d) return false;
  const moc = new Date(startOfDay(new Date(d.getTime() + 86400000)).getTime() + 9 * 3600000);
  return new Date() >= moc;
}

function theViec(t, buoc) {
  const qua = toDate(t.start) && toDate(t.start) < new Date();
  const veXin = (t.foc || []).length;
  const veDuyet = t.focStatus === 'Phê duyệt';
  const veTuChoi = t.focStatus === 'Từ chối';

  /* --- câu việc cần làm + nút chính --- */
  const traVe = t.status === 'Từ chối/Cần điều chỉnh';
  const giuc = toiHanBaoCao(t);           // đã quá mốc 9h sáng hôm sau
  let viec = '';
  let nut = '';
  let them = '';                          // class phụ tô màu thẻ khi cần gấp
  let co = '';                            // cờ trạng thái dán cạnh tên

  /* Nhân sự cùng đi: thẻ chỉ để nắm thông tin, không có nút nào. Báo cáo do
   * người phụ trách tổng hợp một lần, ai cũng nộp thì quản lý nhận mấy bản
   * chồng nhau cho cùng một buổi. */
  if (!MGR() && !laPhuTrach(t) && buoc !== 'xong' && buoc !== 'dong') {
    const ten2 = (t.owner || [])[0];
    return '<div class="ct ct-cung-di" data-phieu="' + t.id + '">' +
      '<div class="ct-dau">' +
        '<div class="ct-ten">' + esc(t.title || '(chưa đặt tên)') +
          '<span class="ct-co xam">Bạn đi cùng</span></div>' +
        '<div class="ct-luc">' + esc(fmtDT(t.start)) + '</div>' +
      '</div>' +
      '<div class="ct-viec">' + esc(ten2
        ? ten2.name + ' phụ trách buổi này — báo cáo do bên đó tổng hợp'
        : 'Chưa có người phụ trách') + '</div>' +
      '<div class="ct-can">' +
        ((t.transport || []).length ? '<span class="ct-mon">🚗 ' + esc(t.transport.join(', ')) + '</span>' : '') +
        (t.duration ? '<span class="ct-mon">⏱ ' + esc(t.duration) + ' giờ</span>' : '') +
      '</div>' +
      '<div class="ct-chan">' + peopleStack(t.staff, 3) + '</div></div>';
  }

  /* Đang xin huỷ thì thẻ chỉ còn một việc: chờ quản lý trả lời. Mọi nút khác
   * tắt đi, khỏi vừa xin huỷ vừa gửi duyệt. */
  if (t.cancelWant && ['nhap', 'cho'].includes(buoc)) {
    return '<div class="ct ct-xin-huy" data-phieu="' + t.id + '">' +
      '<div class="ct-dau">' +
        '<div class="ct-ten">' + esc(t.title || '(chưa đặt tên)') +
          '<span class="ct-co xam">Đang xin huỷ</span></div>' +
        '<div class="ct-luc">' + esc(fmtDT(t.start)) + '</div>' +
      '</div>' +
      '<div class="ct-viec">Đã gửi yêu cầu huỷ — chờ quản lý duyệt</div>' +
      '<div class="ct-can">' + (t.cancelReason
        ? '<span class="ct-mon">Lý do: ' + esc(t.cancelReason) + '</span>' : '') + '</div>' +
      '<div class="ct-chan">' + peopleStack(t.staff, 3) + '</div></div>';
  }

  if (buoc === 'nhap') {
    viec = 'Bản nháp — điền đủ thông tin rồi bấm Gửi duyệt';
    if (!PREVIEW()) {
      nut = '<button class="btn sm" data-open="' + t.id + '">Chỉnh sửa</button>' +
        '<button class="btn sm primary" data-act="submit" data-id="' + t.id + '">Gửi duyệt</button>';
    }
  } else if (buoc === 'cho') {
    if (traVe) {
      /* Lịch bị trả về nằm chung chỗ chờ duyệt (cùng là "đã gửi đi rồi"), nhưng
       * phải nổi hẳn bằng màu đỏ vì đây là thứ duy nhất trong ô cần tay người. */
      viec = t.mgrNote ? 'Quản lý trả về: ' + t.mgrNote : 'Quản lý trả về — sửa lại rồi gửi duyệt lần nữa';
      them = ' ct-tra-ve';
      co = '<span class="ct-co do">Cần điều chỉnh</span>';
      if (!PREVIEW()) nut = '<button class="btn sm danger" data-open="' + t.id + '">Điều chỉnh</button>';
    } else {
      // Đã gửi thì không sửa nữa — chỉ còn đường xin huỷ (nút thêm ở dưới)
      viec = 'Đang chờ quản lý duyệt';
      co = '<span class="ct-co xam">Chờ duyệt</span>';
    }
  } else if (buoc === 'chuan-bi') {
    viec = qua ? 'Đã tới giờ — đi xong nhớ quay lại bấm Báo cáo' : 'Đã duyệt — chuẩn bị đi';
    if (giuc) { them = ' ct-giuc'; co = '<span class="ct-co vang">Tới hạn báo cáo</span>'; }
    if (!PREVIEW()) nut = '<button class="btn sm ' + (giuc ? 'warn' : 'primary') +
      '" data-act="report" data-id="' + t.id + '">Báo cáo</button>';
  } else if (buoc === 'da-nop') {
    viec = 'Đã nộp báo cáo — chờ quản lý nghiệm thu';
    co = '<span class="ct-co xam">Chờ nghiệm thu</span>';
  } else if (buoc === 'bao-cao') {
    // đã bấm nộp nhưng còn dở — nói thẳng thiếu cái gì, khỏi phải mở ra dò
    const thieu = t.status === 'Đang báo cáo' ? thieuGiBaoCao(t) : [];
    if (thieu.length) {
      viec = 'Báo cáo còn thiếu: ' + thieu.join(', ');
      them = ' ct-giuc';
      co = '<span class="ct-co vang">Chưa xong</span>';
    } else {
      viec = giuc ? 'Đã qua ngày đi — nộp báo cáo, chi phí và tệp kèm ngay hôm nay'
                  : 'Đi về rồi — điền báo cáo, chi phí và tệp kèm';
      if (giuc) { them = ' ct-giuc'; co = '<span class="ct-co vang">Tới hạn báo cáo</span>'; }
    }
    if (!PREVIEW()) nut = '<button class="btn sm ' + (giuc || thieu.length ? 'warn' : 'primary') +
      '" data-act="report" data-id="' + t.id + '">' +
      (thieu.length ? 'Điền nốt' : giuc ? 'Báo cáo ngay' : 'Điền báo cáo') + '</button>';
  } else {
    viec = 'Đã hoàn tất';
  }

  /* --- thông tin cần nắm, chỉ hiện ở bước chuẩn bị đi --- */
  /* Luôn vẽ hàng thông tin dù rỗng: thẻ nào cũng đủ bốn hàng thì lưới mới đều,
   * nút ở chân thẻ mới thẳng hàng giữa các thẻ. */
  let can = '<div class="ct-can"></div>';
  if (buoc === 'xong' || buoc === 'da-nop') {
    /* Việc xong rồi thì thứ đáng xem không còn là "chuẩn bị gì" nữa mà là
     * "kết quả ra sao": giờ thực tế, tiền thực chi, thanh toán chưa, nộp được gì. */
    const d = [];
    const gio = realHours(t);
    if (gio && gio !== '—') d.push('<span class="ct-mon">⏱ ' + esc(gio) + '</span>');
    if (Number(t.costActual || 0) > 0) {
      d.push('<span class="ct-mon">💰 ' + esc(shortMoney(t.costActual)) + 'đ thực chi</span>');
      d.push('<span class="ct-ve ' + (t.payment === 'Đã thanh toán' ? 'ok' : 'cho') + '">' +
        (t.payment === 'Đã thanh toán' ? '✔ đã thanh toán' : '⏳ chưa thanh toán') + '</span>');
    }
    if (t.reportAfter || t.report) d.push('<span class="ct-mon">📝 có báo cáo</span>');
    if (t.link) d.push('<span class="ct-mon">🔗 có link sản phẩm</span>');
    if ((t.files || []).length) d.push('<span class="ct-mon">📎 ' + t.files.length + ' tệp kèm</span>');
    if (!d.length) d.push('<span class="ct-mon">chưa ghi kết quả nào</span>');
    can = '<div class="ct-can">' + d.join('') + '</div>';
  }
  if (['cho', 'chuan-bi', 'bao-cao'].includes(buoc)) {
    /* Hiện từ bước "đã gửi" trở đi: lịch đang chờ duyệt thì thứ đáng nhìn không
     * phải câu nhắc suông, mà là mình đã khai những gì — đi bằng gì, mấy tiếng,
     * dự chi bao nhiêu, có xin vé không. */
    const d = [];
    if ((t.transport || []).length) d.push('<span class="ct-mon">🚗 ' + esc(t.transport.join(', ')) + '</span>');
    if (t.duration) d.push('<span class="ct-mon">⏱ ' + esc(t.duration) + ' giờ</span>');
    if (t.costPlan) d.push('<span class="ct-mon">💰 ' + esc(shortMoney(t.costPlan)) + 'đ dự kiến</span>');
    if (veXin) {
      const mau = veDuyet ? 'ok' : veTuChoi ? 'no' : 'cho';
      const chu = veDuyet ? 'Vé đã duyệt — nhận vé trước khi đi' :
        veTuChoi ? 'Vé bị từ chối' : 'Vé đang chờ quản lý duyệt';
      d.push('<span class="ct-ve ' + mau + '">🎟 ' + esc(chu) + '</span>');
      d.push('<span class="ct-mon">' + esc(t.foc.join(' · ')) + '</span>');
    }
    if ((t.tickets || []).length) d.push('<span class="ct-ve ok">📎 Đã có ' + t.tickets.length + ' tệp vé / thông tin</span>');
    can = '<div class="ct-can">' + d.join('') + '</div>';
  }

  /* Thẻ mở bảng thông tin chứ không mở ô sửa. Riêng lịch chưa gửi duyệt thì vẫn
   * phải vào được ô sửa, không thì không có đường nào điền nốt bản nháp. */
  const moGi = chiXem(t) ? 'data-phieu' : 'data-open';
  /* Nút huỷ để nhạt: đây là đường lùi, không phải việc chính của thẻ. Chỉ có ở
   * hai bước đầu — lịch đã duyệt thì huỷ hay không là chuyện của quản lý. */
  if (!PREVIEW() && ['nhap', 'cho'].includes(buoc)) {
    // Bản nháp huỷ thẳng; đã gửi rồi mới phải xin phép kèm lý do
    nut = (buoc === 'nhap'
      ? '<button class="btn sm mo" data-act="huy-nhap" data-id="' + t.id + '">Huỷ</button>'
      : '<button class="btn sm mo" data-xinhuy="' + t.id + '">Huỷ</button>') + nut;
  }

  return '<div class="ct' + them + '" ' + moGi + '="' + t.id + '">' +
    '<div class="ct-dau">' +
      '<div class="ct-ten">' + esc(t.title || '(chưa đặt tên)') + co + '</div>' +
      '<div class="ct-luc">' + esc(fmtDT(t.start)) + '</div>' +
    '</div>' +
    '<div class="ct-viec">' + esc(viec) + '</div>' +
    can +
    '<div class="ct-chan">' + peopleStack(t.staff, 3) +
      (nut ? '<div class="ct-nut">' + nut + '</div>' : '') +
    '</div></div>';
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
    (acts.length ? '<div class="acts">' + acts.join('') + '</div>' : '') +
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

/* Lịch đã duyệt trở đi thì với nhân sự không còn gì để sửa: kế hoạch đã chốt,
 * máy chủ cũng khoá. Mở ô chỉnh sửa lúc đó chỉ tổ để người ta lỡ tay. Nên bấm
 * vào đâu cũng ra bảng thông tin chỉ đọc — muốn động vào thì chỉ còn đúng nút
 * Báo cáo. Quản lý vẫn vào ô sửa như thường. */
/* Gửi đi rồi là hết sửa. Quản lý có thể đang đọc dở, sửa lén dưới tay người
 * duyệt thì họ duyệt một đằng nhân sự đi một nẻo. Muốn sửa thì xin quản lý trả
 * về "Cần điều chỉnh" — trạng thái đó mở lại quyền sửa. */
const KHOA_SUA = ['Chờ duyệt/Xử lý', 'Duyệt/Chờ tác nghiệp', 'Đang báo cáo',
  'Đã hoàn tất', 'Từ chối', 'Hủy lịch'];

function chiXem(t) {
  return !MGR() && (KHOA_SUA.includes(t.status) || !laPhuTrach(t));
}

/**
 * Tôi có phải người phụ trách lịch này không?
 *
 * Khác với "lịch của tôi": nhân sự cùng tác nghiệp vẫn thấy lịch, vẫn nhận
 * thông báo, nhưng người nộp báo cáo và động vào lịch chỉ có một — người phụ
 * trách, vì họ là người tổng hợp cuối cùng. Máy chủ cũng chốt y hệt.
 */
function laPhuTrach(t) {
  const v = viewer();
  return !!(v && (t.owner || []).some((u) => u.id === v.id));
}

function openItem(id) {
  const t = S.items.find((x) => x.id === id);
  if (!t) return;
  if (chiXem(t)) return moPhieuDi(id);
  S.sel = t;
  S.draft = {};
  renderDrawer();
  $('#drawer').classList.add('on');
  $('#mask').classList.add('on');
}

function closeDrawer() {
  // còn thay đổi chưa kịp lưu (vừa gõ xong đã đóng) thì ghi nốt rồi hãy đóng
  if (S.sel && Object.keys(S.draft || {}).length) saveDraft(true);
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

  const veDong = (p) =>
    '<div class="pk-row' + (cur.includes(p.id) ? ' on' : '') +
    '" data-user="' + key + '" data-val="' + esc(p.id) +
    '" data-single="' + (single ? '1' : '') + '" data-ten="' + esc(khongDau(p.name)) + '">' +
    avatar(p, 22) + '<span class="pk-row-ten">' + esc(p.name) + '</span>' +
    '<span class="pk-tick">' + (cur.includes(p.id) ? '✓' : '') + '</span></div>';

  const dong = dsChonNguoi().map(veDong).join('');

  return '<div class="frm-row"><label>' + esc(label) + (single ? ' <span class="hint">(một người)</span>' : '') + '</label>' +
    '<div class="pk' + (on ? '' : ' pk-tat') + '" data-pk="' + key + '" data-ph="' + esc(ph) + '">' +
      '<button type="button" class="pk-sum"' + (on ? '' : ' disabled') + '>' +
        '<span class="pk-chips">' + chipsHtml(cur, on, ph) + '</span>' +
        '<span class="pk-caret">▾</span>' +
      '</button>' +
      '<div class="pk-panel">' +
        '<input class="pk-tim" type="search" placeholder="Tìm nhân sự…" autocomplete="off">' +
        '<div class="pk-ds">' + dong + '</div>' +
      '</div>' +
    '</div></div>';
}

/**
 * Ô nhập ngày giờ dùng chung cho cả app.
 *
 * Không dùng <input type="datetime-local"> nữa: trình duyệt vẽ ô đó theo ngôn
 * ngữ của chính nó, máy nào cũng ra "08/29/2026 11:40 AM" — vừa lộn ngày với
 * tháng vừa 12 giờ sáng chiều. Ô này gõ và hiện đúng một dạng: dd/mm/yyyy HH:mm.
 *
 * @param {string} thuoc  'k' cho ô sửa chi tiết, 'n' cho form đăng ký mới
 */
function oNgay(thuoc, key, giaTri, tat) {
  return '<div class="ng' + (tat ? ' tat' : '') + '">' +
    '<input type="text" class="fld ng-in" data-' + thuoc + '="' + key + '" data-kieu="ngay"' +
      ' value="' + esc(vnText(giaTri)) + '" placeholder="dd/mm/yyyy hh:mm" autocomplete="off"' +
      (tat ? ' disabled' : '') + '>' +
    (tat ? '' : '<button type="button" class="ng-nut" data-nglich="1" title="Chọn trên lịch">' +
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke-linecap="round"/>' +
      '</svg></button>') +
    '</div>';
}

/** Trạng thái của lịch đang bật: ô nào, đang xem tháng nào, đã chọn mốc nào. */
let NG = null;

function veLichNgay() {
  if (!NG) return '';
  const { y, m, chon } = NG;
  const dauThang = new Date(Date.UTC(y, m - 1, 1));
  // tuần bắt đầu từ thứ Hai, đúng thói quen bảng biểu trong nước
  const lui = (dauThang.getUTCDay() + 6) % 7;
  const soNgay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const nay = vnParts(new Date());

  let o = '';
  for (let i = 0; i < lui; i++) o += '<span class="ng-o mo"></span>';
  for (let d = 1; d <= soNgay; d++) {
    const laNay = nay.y === y && nay.m === m && nay.d === d;
    const laChon = chon && chon.y === y && chon.m === m && chon.d === d;
    o += '<button type="button" class="ng-o' + (laChon ? ' chon' : '') + (laNay ? ' nay' : '') +
      '" data-ngd="' + d + '">' + d + '</button>';
  }

  const gio = [];
  for (let h = 0; h < 24; h++) gio.push('<option value="' + h + '"' + (chon && chon.H === h ? ' selected' : '') + '>' + pad(h) + '</option>');
  const phut = [];
  for (let p = 0; p < 60; p += 5) phut.push('<option value="' + p + '"' + (chon && chon.M === p ? ' selected' : '') + '>' + pad(p) + '</option>');
  // phút lẻ do gõ tay thì vẫn phải hiện ra, không được nuốt mất
  if (chon && chon.M % 5) phut.push('<option value="' + chon.M + '" selected>' + pad(chon.M) + '</option>');

  return '<div class="ng-pop">' +
    '<div class="ng-dau">' +
      '<button type="button" class="ng-dh" data-ngthang="-1">‹</button>' +
      '<span class="ng-thang">Tháng ' + m + ' / ' + y + '</span>' +
      '<button type="button" class="ng-dh" data-ngthang="1">›</button>' +
    '</div>' +
    '<div class="ng-thu">' + ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((x) => '<span>' + x + '</span>').join('') + '</div>' +
    '<div class="ng-luoi">' + o + '</div>' +
    '<div class="ng-gio">' +
      '<span class="ng-nhan">Giờ</span>' +
      '<select class="ng-sel" data-ngh="1">' + gio.join('') + '</select>' +
      '<span class="ng-hai">:</span>' +
      '<select class="ng-sel" data-ngm="1">' + phut.join('') + '</select>' +
      '<span class="ng-24">24 giờ · giờ VN</span>' +
    '</div>' +
    '<div class="ng-chan">' +
      '<button type="button" class="btn sm ghost" data-ngxoa="1">Xoá</button>' +
      '<button type="button" class="btn sm" data-ngnay="1">Hôm nay</button>' +
      '<button type="button" class="btn sm primary" data-ngxong="1">Xong</button>' +
    '</div></div>';
}

/**
 * Vẽ lại lịch đang bật.
 *
 * Lịch treo thẳng ở <body> chứ không nằm trong ô nhập, vì trên đường từ ô nhập
 * ra ngoài có tới hai lớp cắt: thẻ .kh cao 122px với overflow:hidden, rồi thân
 * cửa sổ với overflow:auto. Lịch cao 352px nên đặt bên trong là mất gần hết,
 * người dùng bấm nút lịch mà chẳng thấy gì hiện ra.
 * Treo ở body thì không tổ tiên nào cắt được; đổi lại phải tự tính toạ độ và
 * tự đóng khi khung cuộn.
 */
function veLaiNgay() {
  document.querySelectorAll('.ng-pop').forEach((x) => x.remove());
  if (!NG || !NG.o) return;
  NG.o.classList.add('mo');
  document.body.insertAdjacentHTML('beforeend', veLichNgay());
  datChoLich();
}

/** Đặt lịch ngay dưới ô nhập; không đủ chỗ bên dưới thì lật lên trên. */
function datChoLich() {
  const pop = document.querySelector('.ng-pop');
  if (!pop || !NG || !NG.o) return;
  const a = NG.o.getBoundingClientRect();
  const cao = pop.offsetHeight || 352;
  const rong = pop.offsetWidth || 268;
  const duoi = window.innerHeight - a.bottom;
  const tren = a.top;
  pop.style.left = Math.round(Math.max(8, Math.min(a.left, window.innerWidth - rong - 8))) + 'px';
  const y = (duoi < cao + 10 && tren > duoi) ? a.top - cao - 6 : a.bottom + 6;
  pop.style.top = Math.round(Math.max(8, Math.min(y, window.innerHeight - cao - 8))) + 'px';
}

function dongLichNgay() {
  document.querySelectorAll('.ng.mo').forEach((x) => x.classList.remove('mo'));
  document.querySelectorAll('.ng-pop').forEach((x) => x.remove());
  NG = null;
}

/* Lịch treo ở body nên không trôi theo khung khi cuộn — đóng lại cho khỏi lơ
 * lửng sai chỗ. Đổi cỡ cửa sổ thì tính lại toạ độ. */
window.addEventListener('resize', () => { if (NG) datChoLich(); });
document.addEventListener('scroll', () => { if (NG) dongLichNgay(); }, true);

/** Ghi mốc mới vào ô nhập và vào bản nháp / form, cùng một đường. */
function datNgay(inp, iso) {
  inp.value = iso ? vnText(iso) : '';
  const bc = inp.dataset.bc;
  if (bc && BC) { BC[bc] = iso; return; }
  const k = inp.dataset.k;
  if (k && S.sel) { setDraft(k, iso); return; }
  const n = inp.dataset.n;
  if (n) NEW[n] = iso || '';
}

function fieldDate(key, label, hint) {
  const on = canEdit(key);
  return '<div class="frm-row"><label>' + esc(label) + '</label>' +
    oNgay('k', key, dv(key), !on) +
    (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
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
      '<input type="file" data-up="' + key + '" multiple hidden> + Tải tệp lên</label>' : '') +
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
  if (t.cancelWant) {
    steps += '<div class="banner" style="background:var(--red-bg);color:var(--red-t);border-color:var(--red-vien)">' +
      '<div class="sp"><b>Nhân sự xin huỷ lịch này.</b> Lý do: ' + esc(t.cancelReason || '(không ghi)') + '</div></div>';
  }
  if (t.mgrNote) {
    steps += '<div class="banner" style="background:var(--orange-bg);color:var(--orange-t);border-color:#f6d9a8">' +
      '<div class="sp"><b>Quản lý phản hồi:</b> ' + esc(t.mgrNote) + '</div></div>';
  }
  if (t.status === 'Từ chối/Cần điều chỉnh') steps += '<div class="banner">Quản lý yêu cầu điều chỉnh — sửa nội dung rồi bấm <b style="margin:0 4px">Gửi duyệt lại</b>.</div>';

  const locked = !canEditItem();
  const lockNote = locked
    ? '<div class="banner info">Lịch đã ở trạng thái "' + esc(t.status) + '" — nội dung kế hoạch đã khoá. Bạn vẫn cập nhật được báo cáo, liên kết và chi phí thực tế.</div>'
    : '';

  /* Mỗi nhóm trường là một thẻ riêng có đầu thẻ — cùng lối trình bày với ô chi
   * tiết bên Bảng công việc. Nhờ vậy mắt bám được vào từng nhóm thay vì trôi
   * tuột qua một dải ô nhập dài không có điểm dừng. */
  const khoi = (ten, than, phu) =>
    '<section class="kh' + (phu ? ' kh-' + phu : '') + '">' +
    '<div class="kh-dau"><span class="kh-ten">' + esc(ten) + '</span></div>' +
    '<div class="kh-than">' + than + '</div></section>';

  let h = steps + lockNote + '<div class="dr-khoi">';

  h += khoi('Thông tin chuyến',
    fieldText('title', 'Tên hoạt động', 'Tên ngắn gọn của hoạt động') +
    fieldText('purpose', 'Mục đích', '- Cập nhật tư liệu truyền thông\n- Phát trực tiếp', true) +
    '<div class="frm-2">' + fieldDate('start', 'Thời gian bắt đầu') +
      fieldSelect('duration', 'Thời lượng (giờ)', O.duration) + '</div>' +
    fieldDate('end', 'Thời gian kết thúc', 'Chỉ cập nhật sau khi đã hoàn tất tác nghiệp') +
    fieldText('plan', 'Kế hoạch chi tiết', '- 19:00 Có mặt tại địa điểm\n- 19:30 Thực hiện phát trực tiếp', true),
    'chuyen');

  h += khoi('Nhân sự & di chuyển',
    fieldUsers('owner', 'Phụ trách', true) +
    fieldUsers('staff', 'Nhân sự cùng tác nghiệp') +
    fieldMulti('transport', 'Phương tiện', O.transport),
    'nguoi');

  // phụ trách thấy tiền chuyến của mình, dù không có quyền xem chi phí cả phòng
  if (CHIPHI() || laPhuTrach(t)) {
    h += khoi('Chi phí',
      '<div class="frm-2">' + fieldNum('costPlan', 'Chi phí dự kiến (đ)') +
        fieldNum('costActual', 'Chi phí thực tế (đ)', 'Cập nhật sau chuyến công tác') + '</div>' +
      fieldSelect('payment', 'Thanh toán chi phí', O.payment),
      'tien');
  }

  h += khoi('Yêu cầu hỗ trợ',
    '<div class="kh-chon">' + fieldCheck('focRequest', 'Yêu cầu FOC (vé/dịch vụ miễn phí)') +
      fieldCheck('mediaRequest', 'Yêu cầu nhân sự phòng Media') + '</div>' +
    fieldMulti('foc', 'Danh mục FOC', O.foc) +
    '<div class="frm-2">' + fieldSelect('focStatus', 'Trạng thái FOC', O.focStatus) +
      fieldSelect('mediaStatus', 'Trạng thái nhân sự Media', O.mediaStatus) + '</div>' +
    fieldText('mediaNote', 'Feedback nhân sự Media', '', true),
    'foc');

  h += khoi('Kết quả & báo cáo',
    fieldText('report', 'Ghi chú trước chuyến', 'a) Bảng kê chi phí:\nb) Hiệu chỉnh trước công tác:\nc) Lưu ý dịch vụ:', true) +
    fieldText('reportAfter', 'Báo cáo sau tác nghiệp', '- Đã làm được gì\n- Phát sinh gì\n- Lưu ý cho lần sau', true) +
    fieldText('link', 'Liên kết sản phẩm', 'https://…'),
    'ketqua');

  h += khoi('Tệp đính kèm',
    filesBlock('tickets', 'Vé & thông tin cần thiết') +
    filesBlock('files', 'Hoá đơn, hình ảnh…') +
    filesBlock('unc', 'UNC'));

  h += khoi(MGR() ? 'Trạng thái' : 'Thông tin lịch',
    /* Nhân sự không tự đổi trạng thái: gửi duyệt có nút riêng, báo cáo có cửa
     * sổ riêng, huỷ phải xin. Bày ô chọn ra chỉ tổ nhảy lung tung. */
    (MGR() ? fieldSelect('status', 'Trạng thái lịch', statusChoices(), false)
           : '<div class="hint">Trạng thái đổi theo thao tác: bấm Gửi duyệt, bấm Báo cáo, hoặc quản lý duyệt.</div>') +
    '<dl class="kv">' +
      '<dt>Thời lượng thực tế</dt><dd>' + esc(realHours(t)) + '</dd>' +
      '<dt>Tuần / Tháng</dt><dd>' + esc(t.week || '—') + ' · ' + esc(t.month || '—') + '</dd>' +
      '<dt>Mã bản ghi</dt><dd class="mini muted">' + esc(t.id) + '</dd>' +
    '</dl>');

  h += '</div>';
  $('#drBody').innerHTML = h;

  // Đầu ô nhuốm màu theo giai đoạn — nhìn là biết lịch đang ở đâu trong quy trình
  const dh = bad ? 'dong' : t.status === 'Từ chối/Cần điều chỉnh' ? 'sua'
    : t.status === 'Chờ duyệt/Xử lý' ? 'cho' : t.status === 'Duyệt/Chờ tác nghiệp' ? 'duyet'
    : t.status === 'Đang báo cáo' ? 'baocao' : t.status === 'Đã hoàn tất' ? 'xong' : 'nhap';
  const head = $('.dr-head');
  head.className = 'dr-head dh-' + dh;

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
    if (t.cancelWant) {
      acts.push('<button class="btn danger" data-act="huy-ok" data-id="' + t.id + '">Duyệt huỷ</button>');
      acts.push('<button class="btn" data-act="huy-no" data-id="' + t.id + '">Giữ lịch</button>');
    }
    if (t.focRequest && !t.focStatus) acts.push('<button class="btn sm" data-act="foc-ok" data-id="' + t.id + '">Duyệt FOC</button>');
    if (t.mediaRequest && !t.mediaStatus) acts.push('<button class="btn sm" data-act="media-ok" data-id="' + t.id + '">Duyệt Media</button>');
    if (!CLOSED_BAD.includes(t.status)) acts.push('<button class="btn sm ghost" data-act="cancel" data-id="' + t.id + '">Hủy lịch</button>');
    acts.push('<button class="btn sm danger" data-act="delete" data-id="' + t.id + '">Xoá</button>');
  } else {
    /* Ô này với nhân sự chỉ còn đúng hai việc: sửa cho xong rồi gửi duyệt, hoặc
     * xin huỷ. Báo cáo đi đường riêng (cửa sổ Báo cáo từ thẻ), nên không có nút
     * chuyển sang "Đang báo cáo" ở đây — bấm nhầm là lịch nhảy trạng thái. */
    acts.push('<button class="btn primary" data-act="submit" data-id="' + t.id + '">' +
      (t.status === 'Từ chối/Cần điều chỉnh' ? 'Gửi duyệt lại' : 'Gửi duyệt') + '</button>');
    if (t.status === 'Đang lên kế hoạch') {
      acts.push('<button class="btn sm mo" data-act="huy-nhap" data-id="' + t.id + '">Huỷ</button>');
    } else if (!t.cancelWant) {
      acts.push('<button class="btn sm mo" data-xinhuy="' + t.id + '">Xin huỷ lịch</button>');
    }
  }

  $('#drFoot').innerHTML =
    '<span class="luu-tt" id="drDirty"></span>' +
    '<div class="sp"></div>' + acts.join(' ');
  markDirty();
}

function markDirty(chu) {
  const o = $('#drDirty');
  if (!o) return;
  const n = Object.keys(S.draft).length;
  o.textContent = chu != null ? chu : (n ? 'Đang gõ…' : '');
  o.className = 'luu-tt' + (chu === 'Đã lưu' ? ' xong' : '');
}

/* Tự lưu: gõ xong ngưng tay là ghi thẳng xuống Base, khỏi phải nhớ bấm nút. Đợi
 * 900ms để một câu gõ dở không hoá thành hai chục lần ghi. */
let henLuu = null;

function setDraft(k, v) {
  const orig = S.sel[k];
  const same = JSON.stringify(orig ?? null) === JSON.stringify(v ?? null);
  if (same) delete S.draft[k]; else S.draft[k] = v;
  markDirty();
  clearTimeout(henLuu);
  if (Object.keys(S.draft).length) henLuu = setTimeout(() => saveDraft(true), 900);
}

async function saveDraft(tuDong) {
  clearTimeout(henLuu);
  if (!S.sel || !Object.keys(S.draft).length) return;
  const id = S.sel.id;
  const patch = Object.assign({}, S.draft);
  markDirty('Đang lưu…');
  try {
    await api('/api/items/' + id, { method: 'PATCH', body: JSON.stringify(patch) });
    Object.assign(S.sel, patch);
    // chỉ xoá đúng những gì vừa ghi — người ta có thể đã gõ tiếp trong lúc chờ
    for (const k of Object.keys(patch)) {
      if (JSON.stringify(S.draft[k] ?? null) === JSON.stringify(patch[k] ?? null)) delete S.draft[k];
    }
    if (!tuDong) toast('Đã lưu vào Lark Base', 'ok');
    markDirty(Object.keys(S.draft).length ? null : 'Đã lưu');
    /* Tự lưu thì KHÔNG vẽ lại ô chi tiết: người ta đang gõ dở, vẽ lại là mất
     * con trỏ và mất cả chữ chưa kịp đọc. Chỉ làm mới danh sách phía sau. */
    await refresh(true);
    const again = S.items.find((x) => x.id === id);
    if (again) {
      S.sel = again;
      if (!tuDong) renderDrawer();
    }
  } catch (e) {
    markDirty('Chưa lưu được');
    toast(e.message, 'err');
  }
}

/* ============ hành động nhanh ============ */
const ACTIONS = {
  approve:   { patch: { status: 'Duyệt/Chờ tác nghiệp', mgrNote: '' }, msg: 'Đã duyệt kế hoạch' },
  /* Ba việc dưới đây đều làm hỏng kế hoạch của người khác, nên phải nói vì sao.
   * `hoi` = câu hỏi lý do; không nhập thì không chạy. */
  revise:    { patch: { status: 'Từ chối/Cần điều chỉnh' }, msg: 'Đã trả về để điều chỉnh',
               hoi: 'Cần điều chỉnh chỗ nào? Nhân sự sẽ đọc đúng câu này.' },
  reject:    { patch: { status: 'Từ chối' }, msg: 'Đã từ chối',
               hoi: 'Vì sao từ chối lịch này? Nhân sự sẽ đọc đúng câu này.' },
  cancel:    { patch: { status: 'Hủy lịch' }, msg: 'Đã hủy lịch',
               hoi: 'Vì sao huỷ lịch này? Nhân sự sẽ đọc đúng câu này.' },
  done:      { patch: { status: 'Đã hoàn tất' }, msg: 'Đã nghiệm thu' },
  submit:    { patch: { status: 'Chờ duyệt/Xử lý' }, msg: 'Đã gửi quản lý duyệt' },
  report:    { patch: { status: 'Đang báo cáo' }, msg: 'Đã chuyển sang báo cáo' },
  // Quản lý quyết định yêu cầu huỷ: duyệt thì huỷ thật, từ chối thì gỡ cờ xin huỷ
  'huy-ok':    { patch: { status: 'Hủy lịch', cancelWant: false }, msg: 'Đã duyệt huỷ lịch',
                 confirm: 'Duyệt huỷ lịch này? Lịch sẽ biến mất khỏi giao diện của nhân sự.' },
  'huy-no':    { patch: { cancelWant: false }, msg: 'Đã từ chối yêu cầu huỷ',
                 hoi: 'Vì sao giữ lịch này lại? Nhân sự sẽ đọc đúng câu này.' },
  // Bản nháp là của riêng người viết — huỷ thẳng, không qua tay quản lý
  'huy-nhap':  { patch: { status: 'Hủy lịch' }, msg: 'Đã huỷ bản nháp',
                 confirm: 'Huỷ bản nháp này? Lịch sẽ không còn hiện trong danh sách của bạn.' },
  'foc-ok':    { patch: { focStatus: 'Phê duyệt' }, msg: 'Đã duyệt FOC' },
  'foc-no':    { patch: { focStatus: 'Từ chối' }, msg: 'Đã từ chối FOC' },
  'media-ok':  { patch: { mediaStatus: 'Phê duyệt' }, msg: 'Đã duyệt hỗ trợ Media' },
  'media-no':  { patch: { mediaStatus: 'Từ chối' }, msg: 'Đã từ chối hỗ trợ Media' },
  paid:      { patch: { payment: 'Đã thanh toán' }, msg: 'Đã đánh dấu thanh toán' },
  hold:      { patch: { payment: 'Treo thanh toán' }, msg: 'Đã treo thanh toán' },
};

/* ==========================================================================
   CỬA SỔ XIN HUỶ LỊCH
   Nhân sự không tự huỷ được — trạng thái "Hủy lịch" nằm trong nhóm chỉ quản lý
   đặt, chốt cả ở máy chủ. Ở đây họ chỉ gửi yêu cầu kèm lý do.
   ========================================================================== */
let XH = null;

function moXinHuy(id) {
  const t = S.items.find((x) => x.id === id);
  if (!t) return;
  if (PREVIEW()) return toast('Đang xem giao diện của người khác — không xin huỷ thay họ được.', 'err');
  XH = { id, reason: t.cancelReason || '' };

  $('#mdTitle').textContent = 'Xin huỷ lịch tác nghiệp';
  $('#mdBody').innerHTML =
    '<div class="bc">' +
      '<div class="bc-dau">' +
        '<div class="bc-ten">' + esc(t.title || '(chưa đặt tên)') + '</div>' +
        '<div class="bc-luc">' + esc(fmtDT(t.start)) + ' · ' + esc(t.status || '') + '</div>' +
      '</div>' +
      '<div class="banner">Huỷ hay không do quản lý quyết định. Gửi xong lịch vẫn giữ nguyên ' +
        'trạng thái cho tới khi được duyệt huỷ.</div>' +
      '<div class="frm-row"><label>Lý do huỷ *</label>' +
        '<textarea class="fld" data-xh="reason" rows="4" placeholder="VD: Đối tác dời lịch sang tuần sau">' +
        esc(XH.reason) + '</textarea></div>' +
    '</div>';
  $('#mdBody').onclick = null;
  $('#mdFoot').innerHTML =
    '<button class="btn" data-close="1">Thôi, giữ lịch</button>' +
    '<button class="btn danger" id="xhGui">Gửi yêu cầu huỷ</button>';
  $('#modal').classList.add('on');
}

async function guiXinHuy() {
  if (!XH) return;
  if (!String(XH.reason).trim()) return toast('Chưa ghi lý do huỷ', 'err');
  const nut = $('#xhGui');
  nut.disabled = true;
  try {
    await api('/api/items/' + XH.id, {
      method: 'PATCH',
      body: JSON.stringify({ cancelWant: true, cancelReason: XH.reason.trim() }),
    });
    closeModal();
    XH = null;
    toast('Đã gửi yêu cầu huỷ — chờ quản lý duyệt', 'ok');
    await refresh(true);
  } catch (e) {
    nut.disabled = false;
    toast(e.message, 'err');
  }
}

/* ==========================================================================
   CỬA SỔ BÁO CÁO SAU TÁC NGHIỆP
   Đi về rồi, nhân sự chỉ cần điền đúng bảy thứ rồi bấm gửi. Cố ý KHÔNG mở ô
   chỉnh sửa đầy đủ ở đây: kế hoạch đã duyệt thì không sửa lại được nữa, mở ra
   chỉ khiến người ta lỡ tay đổi thứ không nên đổi.
   ========================================================================== */
let BC = null;

function moBaoCao(id) {
  const t = S.items.find((x) => x.id === id);
  if (!t) return;
  if (PREVIEW()) return toast('Đang xem giao diện của người khác — không báo cáo thay họ được.', 'err');
  if (!MGR() && !laPhuTrach(t)) {
    const ai = (t.owner || [])[0];
    return toast('Buổi này do ' + (ai ? ai.name : 'người phụ trách') +
      ' tổng hợp báo cáo. Bạn đi cùng nên không cần nộp.', 'err');
  }
  BC = {
    id,
    end: t.end || null,
    duration: t.duration || '',
    costActual: t.costActual == null ? '' : t.costActual,
    reportAfter: t.reportAfter || '',
    link: t.link || '',
    mediaNote: t.mediaNote || '',
  };
  veBaoCao();
  $('#modal').classList.add('on');
}

function veBaoCao() {
  const t = S.items.find((x) => x.id === BC.id);
  if (!t) return;
  const O = S.options;

  const o = (nhan, than, goi) =>
    '<div class="frm-row"><label>' + esc(nhan) + '</label>' + than +
    (goi ? '<div class="hint">' + esc(goi) + '</div>' : '') + '</div>';

  const khoi = (ten, than, phu) =>
    '<section class="kh kh-' + phu + '">' +
    '<div class="kh-dau"><span class="kh-ten">' + esc(ten) + '</span></div>' +
    '<div class="kh-than">' + than + '</div></section>';

  const chonGio = '<select class="fld" data-bc="duration"><option value="">— chọn —</option>' +
    (O.duration || []).map((x) =>
      '<option value="' + esc(x) + '"' + (BC.duration === x ? ' selected' : '') + '>' + esc(x) + ' giờ</option>').join('') +
    '</select>';

  const tep = (t.files || []);
  const dsTep = tep.length
    ? '<div class="bc-tep">' + tep.map((f) =>
        '<span class="bc-f">📎 ' + esc(f.name || 'tệp') + '</span>').join('') + '</div>'
    : '<div class="hint">Chưa có tệp nào.</div>';

  $('#mdTitle').textContent = 'Báo cáo sau tác nghiệp';
  $('#mdBody').innerHTML =
    '<div class="bc">' +
      '<div class="bc-dau">' +
        '<div class="bc-ten">' + esc(t.title || '(chưa đặt tên)') + '</div>' +
        '<div class="bc-luc">Đi lúc ' + esc(fmtDT(t.start)) +
          ((t.transport || []).length ? ' · ' + esc(t.transport.join(', ')) : '') + '</div>' +
      '</div>' +

      khoi('Chuyến đi đã xong',
        '<div class="frm-2">' +
          o('Thời gian kết thúc *', oNgay('bc', 'end', BC.end)) +
          o('Điều chỉnh thời lượng', chonGio) +
        '</div>', 'chuyen') +

      khoi('Chi phí & chứng từ',
        o('Chi phí thực tế (đ) *',
          '<input type="number" class="fld" data-bc="costActual" step="1000" min="0" value="' +
          (BC.costActual === '' ? '' : BC.costActual) + '" placeholder="0">',
          'Chuyến không tốn gì thì ghi 0 — bỏ trống thì cuối tháng không đối chiếu được.') +
        o('Hoá đơn + chứng từ', dsTep +
          '<label class="btn sm" style="align-self:flex-start;margin-top:6px">' +
          '<input type="file" data-bcup="1" multiple hidden> + Tải tệp lên</label>',
          'Chọn được nhiều tệp một lượt. Tệp tải lên lưu ngay vào Base, không cần chờ bấm gửi.'), 'tien') +

      khoi('Báo cáo',
        o('Báo cáo sau tác nghiệp *',
          '<textarea class="fld" data-bc="reportAfter" rows="5" placeholder="- Đã làm được gì&#10;- Phát sinh gì&#10;- Lưu ý cho lần sau">' +
          esc(BC.reportAfter) + '</textarea>') +
        o('Liên kết sản phẩm',
          '<input type="text" class="fld" data-bc="link" value="' + esc(BC.link) + '" placeholder="https://…">') +
        (t.mediaRequest
          ? o('Feedback nhân sự Media',
              '<textarea class="fld" data-bc="mediaNote" rows="3" placeholder="Nhận xét về bạn Media đi cùng">' +
              esc(BC.mediaNote) + '</textarea>',
              'Chỉ hiện khi chuyến này có xin nhân sự Media.')
          : ''), 'ketqua') +

      '<div class="bc-chan">Gửi xong lịch chuyển sang <b>Đang báo cáo</b>, quản lý nghiệm thu rồi mới thành Hoàn tất.</div>' +
    '</div>';

  $('#mdBody').onclick = null;
  $('#mdFoot').innerHTML =
    '<button class="btn" data-close="1">Để sau</button>' +
    '<button class="btn primary" id="bcGui">Gửi báo cáo</button>';
}

async function guiBaoCao() {
  const t = S.items.find((x) => x.id === BC.id);
  if (!t) return;
  if (!BC.end) return toast('Chưa điền Thời gian kết thúc', 'err');
  if (new Date(BC.end) <= new Date(t.start)) return toast('Thời gian kết thúc phải sau lúc bắt đầu', 'err');
  if (!String(BC.reportAfter).trim()) return toast('Chưa viết Báo cáo sau tác nghiệp', 'err');
  /* Chi phí phải điền, kể cả khi bằng 0 — bỏ trống thì cuối tháng không đối
   * chiếu được, mà "0" là một câu trả lời hợp lệ (chuyến không tốn gì). */
  if (String(BC.costActual).trim() === '') return toast('Chưa điền Chi phí thực tế (không tốn gì thì ghi 0)', 'err');

  const body = {
    status: 'Đang báo cáo',
    end: BC.end,
    duration: BC.duration || null,
    costActual: BC.costActual === '' ? null : Number(BC.costActual),
    reportAfter: BC.reportAfter.trim(),
    link: BC.link.trim(),
  };
  if (t.mediaRequest) body.mediaNote = BC.mediaNote.trim();

  const nut = $('#bcGui');
  nut.disabled = true;
  try {
    await api('/api/items/' + BC.id, { method: 'PATCH', body: JSON.stringify(body) });
    closeModal();
    BC = null;
    toast('Đã gửi báo cáo', 'ok');
    await refresh(true);
  } catch (e) {
    nut.disabled = false;
    toast(e.message, 'err');
  }
}

async function doAction(act, id) {
  const a = ACTIONS[act];
  if (!a) return;
  if (a.confirm && !confirm(a.confirm)) return;
  const patch = Object.assign({}, a.patch);
  if (a.hoi) {
    const ly = prompt(a.hoi, '');
    if (ly === null) return;                       // bấm Huỷ ở hộp thoại
    if (!String(ly).trim()) return toast('Phải ghi lý do — nhân sự cần biết vì sao', 'err');
    patch.mgrNote = String(ly).trim();
  }
  try {
    await api('/api/items/' + id, { method: 'PATCH', body: JSON.stringify(patch) });
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
    costPlan: '', foc: [],
    status: 'Chờ duyệt/Xử lý',
  };
  renderCreate();
  $('#modal').classList.add('on');
}

function closeModal() { $('#modal').classList.remove('on'); }

/**
 * PHIẾU ĐI TÁC NGHIỆP — cửa sổ chỉ để đọc.
 *
 * Mở từ bảng "Sắp đi — nhớ chuẩn bị". Lịch ở đó đã được duyệt, nghĩa là mọi thứ
 * đã chốt: nhân sự không còn gì phải sửa, chỉ cần đọc lại cho đủ trước khi đi.
 * Vì vậy phiếu này CỐ Ý không có một nút thao tác nào — chỉ có nút X để thoát.
 * Muốn sửa thì vào thẻ ở các bước bên dưới.
 */
function moPhieuDi(id) {
  const t = S.items.find((x) => x.id === id);
  if (!t) return;

  const mucs = [];
  const muc = (nhan, gt, rong) => {
    if (!gt) return;
    mucs.push('<div class="phieu-muc' + (rong ? ' rong' : '') + '">' +
      '<div class="phieu-nhan">' + esc(nhan) + '</div>' +
      '<div class="phieu-gt">' + gt + '</div></div>');
  };
  const chu = (v) => (v == null || v === '' ? '' : esc(String(v)));
  // giữ nguyên xuống dòng của mục đích / kế hoạch — nhân sự gõ theo gạch đầu dòng
  const nhieuDong = (v) => (v ? '<div class="phieu-pre">' + esc(String(v)) + '</div>' : '');
  const nguoi = (ds) => ((ds || []).length
    ? '<div class="phieu-ng">' + ds.map((u) =>
        '<span class="phieu-ai">' + esc(initials(u.name)) + '<b>' + esc(u.name || '') + '</b></span>').join('') + '</div>'
    : '');

  muc('Mục đích', nhieuDong(t.purpose), true);
  muc('Kế hoạch chi tiết', nhieuDong(t.plan), true);
  muc('Phản hồi của quản lý', nhieuDong(t.mgrNote), true);
  muc('Ghi chú trước chuyến', nhieuDong(t.report), true);
  muc('Phụ trách', nguoi(t.owner));
  muc('Cùng tác nghiệp', nguoi(t.staff));
  muc('Phương tiện', chu((t.transport || []).join(', ')));
  muc('Thời lượng', t.duration ? chu(t.duration + ' giờ') : '');
  muc('Thời gian kết thúc', t.end ? chu(fmtDT(t.end)) : '');
  if (t.end) muc('Thời lượng thực tế', chu(realHours(t)));
  if ((CHIPHI() || laPhuTrach(t)) && t.costPlan) muc('Chi phí dự kiến', chu(money(t.costPlan) + ' đ'));
  if ((CHIPHI() || laPhuTrach(t)) && t.costActual != null) {
    muc('Chi phí thực tế', chu(money(t.costActual) + ' đ') +
      (t.payment ? ' <span class="badge ' + (t.payment === 'Đã thanh toán' ? 'green' : 'yellow') + '">' +
        esc(t.payment) + '</span>' : ''));
  }

  if ((t.foc || []).length || t.focRequest) {
    const mau = t.focStatus === 'Phê duyệt' ? 'green' : t.focStatus === 'Từ chối' ? 'red' : 'orange';
    muc('Vé / dịch vụ FOC',
      '<span class="badge ' + mau + '">' + esc(t.focStatus || 'Chờ duyệt') + '</span>' +
      ((t.foc || []).length ? '<div class="phieu-ds">' +
        t.foc.map((x) => '<span class="phieu-mon">' + esc(x) + '</span>').join('') + '</div>' : ''), true);
  }
  if (t.mediaRequest) {
    const mau = t.mediaStatus === 'Phê duyệt' ? 'green' : t.mediaStatus === 'Từ chối' ? 'red' : 'orange';
    muc('Nhân sự Media',
      '<span class="badge ' + mau + '">' + esc(t.mediaStatus || 'Chờ duyệt') + '</span>' +
      (t.mediaNote ? nhieuDong(t.mediaNote) : ''), true);
  }

  // Kết quả sau chuyến — chỉ hiện khi đã có, để phiếu lúc chưa đi vẫn gọn
  muc('Báo cáo sau tác nghiệp', nhieuDong(t.reportAfter), true);
  if (t.link) {
    muc('Liên kết sản phẩm',
      '<a class="phieu-f" target="_blank" href="' + esc(t.link) + '">🔗 ' + esc(t.link) + '</a>', true);
  }

  // Tệp: thứ duy nhất bấm được ở đây, và chỉ để MỞ RA XEM
  const dsTep = (nhan, arr) => {
    if (!(arr || []).length) return;
    muc(nhan, '<div class="phieu-tep">' + arr.map((f) => (f.token
      ? '<a class="phieu-f" target="_blank" href="' + apiUrl('/api/items/' + t.id + '/file/' + f.token) + '">' +
        '📎 ' + esc(f.name || 'tệp') + '</a>'
      : '<span class="phieu-f">📎 ' + esc(f.name || 'tệp') + '</span>')).join('') + '</div>', true);
  };
  dsTep('Vé & thông tin cần mang', t.tickets);
  dsTep('Hoá đơn + chứng từ', t.files);
  dsTep('UNC', t.unc);

  const d = toDate(t.start);
  const homNay = startOfDay(new Date());
  const cach = d ? Math.round((startOfDay(d) - homNay) / 86400000) : null;
  const khi = cach === null ? '' : cach === 0 ? 'Hôm nay' : cach === 1 ? 'Ngày mai' : 'Còn ' + cach + ' ngày';

  $('#mdTitle').textContent = 'Phiếu đi tác nghiệp';
  $('#mdBody').innerHTML =
    '<div class="phieu">' +
      '<div class="phieu-dau">' +
        '<div class="phieu-ten">' + esc(t.title || '(chưa đặt tên)') + '</div>' +
        '<div class="phieu-khi">' +
          (khi ? '<span class="badge ' + (cach <= 1 ? 'orange' : 'blue') + '">' + esc(khi) + '</span>' : '') +
          '<span class="phieu-gio">' + esc(fmtDT(t.start)) + '</span>' +
          badge(t.status) +
        '</div>' +
      '</div>' +
      '<div class="phieu-luoi">' + mucs.join('') + '</div>' +
      '<div class="phieu-chan">' + esc(!chiXem(t) ? 'Bảng thông tin chỉ để xem.'
        : t.status === 'Duyệt/Chờ tác nghiệp' ? 'Lịch đã duyệt — nội dung đã chốt. Đi về rồi thì bấm Báo cáo trên thẻ.'
        : t.status === 'Đang báo cáo' ? 'Đã nộp báo cáo — chờ quản lý nghiệm thu.'
        : t.status === 'Đã hoàn tất' ? 'Chuyến đi đã hoàn tất, giữ lại để đối chiếu cuối tháng.'
        : 'Lịch đã đóng — chỉ còn để tra cứu.') + '</div>' +
    '</div>';
  $('#mdBody').onclick = null;
  $('#mdFoot').innerHTML = '';          // cố ý không có nút nào — chỉ còn nút X ở đầu cửa sổ
  $('#modal').classList.add('on');
}

/**
 * Bộ chọn có ô tìm — dùng cho form tạo mới (ghi vào NEW), khác fieldUsers() là cái
 * ghi vào bản nháp của drawer. Cùng bộ class .pk nên dùng chung CSS và hàm tìm.
 *
 * @param {string} key    khoá trong NEW
 * @param {Array}  ds     [{id, name}] — người hoặc lựa chọn
 * @param {boolean} single chỉ chọn một
 * @param {string} ph     chữ hiện khi chưa chọn gì
 * @param {boolean} laNguoi  có vẽ ảnh đại diện không
 */
function pickerMoi(key, ds, single, ph, laNguoi) {
  const cur = NEW[key] || [];
  const ten = (id) => (ds.find((x) => x.id === id) || {}).name || id;
  const chip = cur.length
    ? cur.slice(0, 4).map((id) => '<span class="pk-chip">' + esc(ten(id)) + '</span>').join('') +
      (cur.length > 4 ? '<span class="pk-them">+' + (cur.length - 4) + '</span>' : '')
    : '<span class="pk-ph">' + esc(ph) + '</span>';

  const veDong = (p) =>
    '<div class="pk-row' + (cur.includes(p.id) ? ' on' : '') +
    '" data-nuser="' + key + '" data-val="' + esc(p.id) +
    '" data-single="' + (single ? '1' : '') + '" data-ten="' + esc(khongDau(p.name)) + '">' +
    (laNguoi ? avatar(p, 22) : '') + '<span class="pk-row-ten">' + esc(p.name) + '</span>' +
    '<span class="pk-tick">' + (cur.includes(p.id) ? '\u2713' : '') + '</span></div>';

  const dong = ds.map(veDong).join('');

  return '<div class="pk" data-pk="' + key + '" data-ph="' + esc(ph) + '">' +
    '<button type="button" class="pk-sum"><span class="pk-chips">' + chip + '</span>' +
    '<span class="pk-caret">\u25be</span></button>' +
    '<div class="pk-panel">' +
      '<input class="pk-tim" type="search" placeholder="' + (laNguoi ? 'T\u00ecm nh\u00e2n s\u1ef1\u2026' : 'T\u00ecm\u2026') + '" autocomplete="off">' +
      '<div class="pk-ds">' + dong + '</div>' +
    '</div></div>';
}

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
        oNgay('n', 'start', NEW.start) + '</div>' +
      '<div class="frm-row"><label>Thời lượng dự kiến (giờ)</label>' +
        '<select class="fld" data-n="duration"><option value="">— chọn —</option>' +
        (O.duration || []).map((o) => '<option value="' + esc(o) + '"' + (NEW.duration === o ? ' selected' : '') + '>' + esc(o) + ' giờ</option>').join('') +
        '</select></div>' +
    '</div>' +

    '<div class="frm-row"><label>Kế hoạch chi tiết</label>' +
      '<textarea class="fld" data-n="plan" placeholder="- 11h30 xuất phát&#10;- 12h00 có mặt tại địa điểm&#10;- 13h50 lên sóng&#10;- 20h00 kết thúc hành trình">' + esc(NEW.plan) + '</textarea></div>' +

    '<div class="sec-title sec-nguoi">Nhân sự & di chuyển</div>' +
    (MGR()
      ? '<div class="frm-row"><label>Phụ trách chính</label>' +
          pickerMoi('owner', dsChonNguoi(), true, 'Chọn một người…', true) + '</div>'
      : '<div class="frm-row"><label>Phụ trách chính</label><input class="fld" value="' +
          esc(S.me ? S.me.name : '—') + '" readonly><div class="hint">Bạn là người đăng ký nên mặc định phụ trách chuyến này.</div></div>') +
    '<div class="frm-row"><label>Nhân sự cùng tác nghiệp</label>' +
      pickerMoi('staff', dsChonNguoi(), false, 'Chọn nhân sự…', true) + '</div>' +
    '<div class="frm-row"><label>Phương tiện</label>' + chips('transport', O.transport) + '</div>' +

    /* Luôn hiện, không núp sau quyền "xem chi phí": người đăng ký chính là phụ
     * trách chuyến, tiền này là tiền họ khai. Trước đây ẩn đi nên nhân sự không
     * có quyền xem chi phí phòng thì đăng ký lịch mà không khai được ngân sách,
     * quản lý duyệt trong tình trạng không biết chuyến tốn bao nhiêu. */
    '<div class="sec-title sec-tien">Chi phí</div>' +
    '<div class="frm-row"><label>Chi phí dự kiến (đ)</label>' +
      '<input type="number" class="fld" data-n="costPlan" value="' + esc(NEW.costPlan) +
      '" step="1000" min="0" placeholder="600000">' +
      '<div class="hint">Dự trù cho chuyến này. Không tốn gì thì ghi 0.</div></div>' +

    '<div class="sec-title sec-foc">Danh mục FOC</div>' +
    '<div class="frm-row"><label>Vé / dịch vụ miễn phí xin kèm</label>' +
      pickerMoi('foc', (O.foc || []).map((x) => ({ id: x, name: x })), false, 'Chọn danh mục…', false) +
      '<div class="hint">Cần thông báo muộn nhất 3 ngày kể từ ngày gửi phê duyệt.</div></div>' +
    '</div>';

  /* Hai lối đi, nói thẳng ra khác nhau chỗ nào. Trước đây chân cửa sổ chỉ nhắc
   * mỗi chuyện gửi duyệt, nên nút Lưu nháp đứng cạnh mà không ai đọc ra là một
   * lựa chọn — ô Nháp vì thế lúc nào cũng trống. */
  $('#mdFoot').innerHTML =
    '<span class="mini muted" style="margin-right:auto">Chưa xong thì <b>Lưu nháp</b> để sửa tiếp sau. ' +
    'Xong rồi thì <b>Gửi duyệt</b> — lịch chuyển sang <b>Chờ duyệt/Xử lý</b> và khoá lại.</span>' +
    '<button class="btn nhap" data-nsave="draft">Lưu nháp</button>' +
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
    /* Bỏ ô tick "Yêu cầu FOC" khỏi form: chọn danh mục FOC tức là đang xin FOC.
     * Vẫn phải gửi cờ này vì hàng đợi duyệt của quản lý đếm theo nó. */
    focRequest: (NEW.foc || []).length > 0,
    mediaRequest: false,
    status: mode === 'draft' ? 'Đang lên kế hoạch' : 'Chờ duyệt/Xử lý',
  };
  if (MGR()) body.owner = NEW.owner;

  const btns = document.querySelectorAll('[data-nsave]');
  btns.forEach((b) => (b.disabled = true));
  try {
    await api('/api/items', { method: 'POST', body: JSON.stringify(body) });
    closeModal();
    toast(mode === 'draft' ? 'Đã lưu nháp vào Base' : 'Đã gửi duyệt', 'ok');
    const doiKy = keoLocToiLich(body.start);
    await refresh(true);
    if (doiKy) toast('Lịch mới ở ' + doiKy + ' — đã chuyển bộ lọc sang đó cho bạn thấy', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

/**
 * Kéo bộ lọc thời gian tới tháng của lịch vừa tạo, nếu nó nằm ngoài khoảng đang xem.
 *
 * Bộ lọc mặc định là THÁNG NÀY, mà lịch tác nghiệp thì hay đăng ký cho tuần sau
 * hoặc tháng sau — lưu nháp xong quay ra không thấy đâu, tưởng mất bài. Thà tự
 * chuyển bộ lọc rồi nói một câu, còn hơn để người ta đi tìm.
 *
 * @returns {string} tên tháng vừa chuyển tới, hoặc '' nếu không phải chuyển
 */
function keoLocToiLich(startISO) {
  const p = vnParts(startISO);
  if (!p) return '';
  // đã nằm trong khoảng đang lọc thì thôi, đừng đụng vào lựa chọn của người ta
  if (inPeriod({ start: startISO, month: p.y + '-' + pad(p.m) }, S.f.period)) return '';
  const cuoi = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
  S.f.period = 'k:' + p.y + '-' + pad(p.m) + '-01:' + p.y + '-' + pad(p.m) + '-' + pad(cuoi);
  // kéo cả lớp vỏ và các base khác theo cho khớp
  if (window.hubBaoKhoang) {
    try { window.hubBaoKhoang(p.y + '-' + pad(p.m) + '-01', p.y + '-' + pad(p.m) + '-' + pad(cuoi)); }
    catch (_) {}
  }
  return 'tháng ' + p.m + '/' + p.y;
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
  $('#mdFoot').innerHTML =
    '<button class="btn" id="thuTinLark" style="margin-right:auto">Thử gửi tin Lark cho tôi</button>' +
    '<button class="btn" data-close="1">Đóng</button>' +
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
  if (close) { closeModal(); BC = null; XH = null; $('#mdTitle').textContent = 'Đăng ký lịch tác nghiệp'; return; }

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

  /* Nút thao tác luôn được xét TRƯỚC [data-open], nên thẻ/dòng bọc ngoài không bị
   * mở kèm. Tuyệt đối không bọc nút bằng onclick="event.stopPropagation()": mọi
   * thứ ở đây bắt sự kiện tại document, chặn nổi bọt là nút chết hẳn. */
  const act = T.closest('[data-act]');
  if (act) {
    e.stopPropagation();
    const a = act.dataset.act;
    if (a === 'delete') await deleteItem(act.dataset.id);
    // Báo cáo không đổi trạng thái ngay nữa: mở cửa sổ điền cho xong rồi mới gửi
    else if (a === 'report') { closeDrawer(); moBaoCao(act.dataset.id); }
    else await doAction(a, act.dataset.id);
    return;
  }

  /* ---- ô chọn ngày giờ ---- */
  // Lịch nằm ở tầng body nên phải xét cả .ng-pop, không thì bấm vào chính lịch
  // cũng bị tính là bấm ra ngoài
  if (NG && !T.closest('.ng') && !T.closest('.ng-pop')) dongLichNgay();

  const ngNut = T.closest('[data-nglich]');
  if (ngNut) {
    const o = ngNut.closest('.ng');
    const dangMo = NG && NG.o === o;
    dongLichNgay();
    if (!dangMo) {
      const inp = o.querySelector('.ng-in');
      const chon = docNgayVN(inp.value) ? vnParts(docNgayVN(inp.value)) : null;
      const nay = vnParts(new Date());
      NG = { o, inp, y: (chon || nay).y, m: (chon || nay).m, chon: chon || null };
      veLaiNgay();
    }
    return;
  }

  if (NG) {
    const doiThang = T.closest('[data-ngthang]');
    if (doiThang) {
      const b = Number(doiThang.dataset.ngthang);
      let m = NG.m + b, y = NG.y;
      if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
      NG.m = m; NG.y = y;
      veLaiNgay();
      return;
    }
    const oNg = T.closest('[data-ngd]');
    if (oNg) {
      const gio = NG.chon || { H: 8, M: 0 };   // chưa đặt giờ thì lấy 08:00 cho khỏi ra 00:00
      NG.chon = { y: NG.y, m: NG.m, d: Number(oNg.dataset.ngd), H: gio.H, M: gio.M };
      datNgay(NG.inp, vnISO(NG.chon));
      veLaiNgay();
      return;
    }
    if (T.closest('[data-ngnay]')) {
      const nay = vnParts(new Date());
      const gio = NG.chon || { H: nay.H, M: nay.M - (nay.M % 5) };
      NG.y = nay.y; NG.m = nay.m;
      NG.chon = { y: nay.y, m: nay.m, d: nay.d, H: gio.H, M: gio.M };
      datNgay(NG.inp, vnISO(NG.chon));
      veLaiNgay();
      return;
    }
    if (T.closest('[data-ngxoa]')) { datNgay(NG.inp, null); NG.chon = null; veLaiNgay(); return; }
    if (T.closest('[data-ngxong]')) { dongLichNgay(); return; }
    if (T.closest('.ng-pop')) return;      // bấm chỗ trống trong lịch thì đừng làm gì
  }

  // Phiếu đi phải được xét trước [data-open]: nó là cửa sổ chỉ đọc, không phải ô sửa
  // Xin huỷ xét trước [data-phieu]/[data-open]: nút nằm lọt trong thẻ và trong ô chi tiết
  const xh = T.closest('[data-xinhuy]');
  if (xh) { closeDrawer(); moXinHuy(xh.dataset.xinhuy); return; }

  const phieu = T.closest('[data-phieu]');
  if (phieu) { moPhieuDi(phieu.dataset.phieu); return; }

  const open = T.closest('[data-open]');
  if (open) { openItem(open.dataset.open); return; }

  // chuyển vai
  const roleCard = T.closest('[data-role]');
  if (roleCard) { await switchRole(roleCard.dataset.role); return; }
  if (T.closest('#btnExitActing')) { await switchRole(''); return; }

  /* Tự kiểm kênh Lark. Chỉ gửi cho chính người bấm nên bấm bao nhiêu lần cũng
   * không quấy ai. Phải thử TRÊN BẢN CHẠY THẬT: máy cá nhân gửi bằng app riêng
   * của lark-cli, bản trên Render gửi bằng app Marketing Hub — hai app khác
   * nhau, thử ở máy không kết luận được gì cho bản thật. */
  if (T.closest('#thuTinLark')) {
    const b = T.closest('#thuTinLark');
    b.disabled = true;
    const chu = b.textContent;
    b.textContent = 'Đang gửi…';
    try {
      const d = await api('/api/thu-tin-lark', { method: 'POST' });
      toast(d.ok
        ? 'Đã gửi. Gửi từ ' + d.guiTu + ' → kiểm hộp thoại Lark của bạn.'
        : 'Không gửi được: ' + (d.ly || 'không rõ lý do'), d.ok ? 'ok' : 'err');
    } catch (e) { toast(e.message, 'err'); }
    b.disabled = false;
    b.textContent = chu;
    return;
  }

  if (T.closest('#btnQuyen')) { await openQuyen(); return; }     // trước chipUser
  if (T.closest('#chipUser')) { openRoleSwitch(); return; }

  if (T.closest('#btnNew')) { $('#mdTitle').textContent = 'Đăng ký lịch tác nghiệp'; openCreate(); return; }
  if (T.closest('#btnRefresh')) { toast('Đang tải lại…'); await refresh(true); return; }
  if (T.closest('#drClose') || T.closest('#mask')) { closeDrawer(); return; }
  if (T.closest('#bcGui')) { await guiBaoCao(); return; }
  if (T.closest('#xhGui')) { await guiXinHuy(); return; }
  if (T.closest('#fReset')) { S.f = { period: 'month', person: 'all', status: 'all', q: '', the: '' }; render(); return; }

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
  if (sum) { moBangChon(sum.closest('.pk')); return; }

  /* Bấm thẻ số ở "Lịch của tôi": bấm lần nữa vào thẻ đang chọn thì bỏ lọc. */
  const oThe = T.closest('[data-the]');
  if (oThe) {
    S.f.the = S.f.the === oThe.dataset.the ? '' : oThe.dataset.the;
    render();
    return;
  }

  const uo = T.closest('[data-user]');
  if (uo) {
    const k = uo.dataset.user;
    const single = uo.dataset.single === '1';
    let cur = (dv(k) || []).map((u) => (typeof u === 'string' ? u : u.id));
    const id = uo.dataset.val;
    if (single) cur = cur.includes(id) ? [] : [id];
    else { const i = cur.indexOf(id); if (i >= 0) cur.splice(i, 1); else cur.push(id); }
    const tenCua = (x) => (dsChonNguoi().find((p) => p.id === x) || {}).name || x;
    setDraft(k, cur.map((x) => ({ id: x, name: tenCua(x) })));
    const hop = uo.closest('.pk') || uo.parentElement;
    hop.querySelectorAll('[data-user="' + k + '"]').forEach((b) => {
      const chon = cur.includes(b.dataset.val);
      b.classList.toggle('on', chon);
      const tick = b.querySelector('.pk-tick');
      if (tick) tick.textContent = chon ? '✓' : '';
    });
    const oChip = hop.querySelector('.pk-chips');
    if (oChip) oChip.innerHTML = chipsHtml(cur, true, hop.dataset.ph || 'Chọn nhân sự…');
    if (single) dongBangChon();   // chọn một người là xong, đóng luôn
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
    const single = nu.dataset.single === '1';
    if (single) NEW[k] = (NEW[k] || []).includes(id) ? [] : [id];
    else { const c = NEW[k] || (NEW[k] = []); const i = c.indexOf(id); if (i >= 0) c.splice(i, 1); else c.push(id); }

    const hop = nu.closest('.pk') || nu.parentElement;
    hop.querySelectorAll('[data-nuser="' + k + '"]').forEach((b) => {
      const chon = (NEW[k] || []).includes(b.dataset.val);
      b.classList.toggle('on', chon);
      const tick = b.querySelector('.pk-tick');
      if (tick) tick.textContent = chon ? '\u2713' : '';
    });
    // vẽ lại chip tóm tắt cho khớp
    const oChip = hop.querySelector('.pk-chips');
    if (oChip) {
      const ds = k === 'foc' ? (S.options.foc || []).map((x) => ({ id: x, name: x })) : dsChonNguoi();
      const cur = NEW[k] || [];
      const ten = (i2) => (ds.find((x) => x.id === i2) || {}).name || i2;
      oChip.innerHTML = cur.length
        ? cur.slice(0, 4).map((i2) => '<span class="pk-chip">' + esc(ten(i2)) + '</span>').join('') +
          (cur.length > 4 ? '<span class="pk-them">+' + (cur.length - 4) + '</span>' : '')
        : '<span class="pk-ph">' + esc(hop.dataset.ph || '') + '</span>';
    }
    if (single) dongBangChon();   // chọn một người là xong, đóng luôn
    return;
  }

  const ns = T.closest('[data-nsave]');
  if (ns) { await submitCreate(ns.dataset.nsave); return; }
});

/**
 * Danh bạ phòng, lấy từ lớp vỏ Marketing Hub.
 *
 * Base Lịch tác nghiệp chỉ biết 8 người từng có tên trong lịch — ai đi lần đầu
 * thì không tìm ra tên mình. Lớp vỏ gom danh bạ từ mọi Base đang bật (Bảng công
 * việc một mình đã 35 người), nên hỏi nó là đủ, khỏi xin thêm quyền đọc danh bạ
 * công ty trên Lark. Chạy ngoài lớp vỏ thì không có gì, quay về danh sách cũ.
 */
async function taiDanhBa() {
  if (!window.__HUB__) return;
  try {
    /* Lớp vỏ vá fetch để mọi đường dẫn bắt đầu bằng "/" chạy về app con — gọi
     * "/api/danh-ba" là rơi vào chính app này rồi 404. Ghi đủ origin thì shim
     * bỏ qua, request mới tới được lớp vỏ. */
    const r = await fetch(location.origin + '/api/danh-ba');
    if (!r.ok) return;
    const d = await r.json();
    if (Array.isArray(d.nguoi) && d.nguoi.length) S.danhBa = d.nguoi;
  } catch (_) { /* không có danh bạ thì vẫn chọn được người trong Base */ }
}

/**
 * Danh sách cho ô chọn người: một danh sách phẳng, không chia nhóm. Người đã
 * từng có trong Base xếp lên đầu cho dễ bắt, phần còn lại của phòng nối ngay
 * sau — cùng một kiểu dòng, cuộn hay gõ tìm đều ra.
 */
function dsChonNguoi() {
  const trong = S.people || [];
  const co = new Set(trong.map((x) => x.id));
  return [...trong, ...(S.danhBa || []).filter((x) => !co.has(x.id))];
}

/* ==========================================================================
   BẢNG CHỌN NGƯỜI — mở đóng
   Hai lần sửa trước vẫn còn cảnh nhiều bảng cùng mở, mà ở máy thì không tài nào
   tái hiện được. Nên lần này không vá tiếp mà đổi cách dựng, sao cho chuyện đó
   KHÔNG THỂ xảy ra: bảng nào hiện là do ô cha của nó mang class "mo", và CSS
   quy định .pk-panel mặc định display:none, chỉ .pk.mo mới cho hiện.
   Muốn hai bảng cùng hiện thì phải có hai ô cùng mang class "mo" — mà chỉ
   moBangChon() gắn được class đó, và nó luôn gỡ hết của mọi ô trước khi gắn.
   Không còn phụ thuộc thuộc tính hidden, thứ mà bất kỳ đoạn mã nào cũng có thể
   vô tình xoá mất.
   ========================================================================== */
function dongBangChon() {
  document.querySelectorAll('.pk.mo').forEach((x) => x.classList.remove('mo'));
  document.querySelectorAll('.pk-panel.len').forEach((x) => x.classList.remove('len'));
}

const bangDangMo = () => document.querySelector('.pk.mo');

function moBangChon(hop) {
  if (!hop) return;
  const pn = hop.querySelector('.pk-panel');
  if (!pn) return;
  const dangMo = hop.classList.contains('mo');
  dongBangChon();                       // luôn dọn sạch trước, kể cả bảng của chính nó
  if (dangMo) return;                   // bấm lần nữa vào chính nó là đóng
  hop.classList.add('mo');
  const tim = pn.querySelector('.pk-tim');
  // preventScroll: không có nó thì trình duyệt cuộn khung để lộ ô tìm, mà cuộn
  // khung lại là tín hiệu đóng bảng — vừa mở đã tự sập
  if (tim) { tim.value = ''; timNguoi(pn); tim.focus({ preventScroll: true }); }
  datChoBangChon(pn);
}

/**
 * Đặt chỗ cho bảng chọn.
 *
 * Bảng dùng position:fixed và toạ độ tính ở đây, chứ không nằm theo dòng chảy
 * bên trong ô. Lý do: trên đường ra ngoài có mấy lớp cắt — thẻ .kh, thân cửa sổ
 * và thân ô chi tiết đều đặt overflow — nên bảng nào bật ra từ ô nằm gần đáy
 * cũng bị cắt cụt, bấm không trúng dòng dưới. position:fixed thì không tổ tiên
 * nào cắt được, đổi lại phải tự tính chỗ và tự đóng khi khung cuộn.
 */
function datChoBangChon(pn) {
  const hop = pn.closest('.pk');
  if (!hop) return;
  const a = hop.getBoundingClientRect();
  const cao = pn.offsetHeight || 260;
  const duoi = window.innerHeight - a.bottom;   // chỗ trống bên dưới ô
  const len = duoi < cao + 10 && a.top > duoi;  // thiếu chỗ dưới, mà trên thì rộng
  pn.style.width = Math.round(a.width) + 'px';
  pn.style.left = Math.round(Math.max(8, Math.min(a.left, window.innerWidth - a.width - 8))) + 'px';
  // kẹp trong màn hình: ô nhập có thể đang nằm ngoài vùng nhìn thấy (khung vừa
  // cuộn, hoặc màn hình thấp) — bảng vẫn phải hiện trọn vẹn
  const y = len ? a.top - cao - 5 : a.bottom + 5;
  pn.style.top = Math.round(Math.max(8, Math.min(y, window.innerHeight - cao - 8))) + 'px';
}

/* Bấm ra ngoài là đóng. Bắt ở pha capture của pointerdown nên không phụ thuộc
 * thứ tự các nhánh trong bộ xử lý click — trước đây nhánh nào return sớm (ô
 * ngày, chip phương tiện, nút thao tác) là bảng cứ nằm đó.
 *
 * So với ĐÚNG ô đang mở chứ không phải "có nằm trong .pk nào đó không": bấm
 * sang ô chọn người thứ hai cũng là bấm ra ngoài đối với ô thứ nhất. */
document.addEventListener('pointerdown', (e) => {
  const mo = bangDangMo();
  if (!mo) return;
  const trong = e.target.closest && e.target.closest('.pk');
  if (trong === mo) return;
  dongBangChon();
}, true);

/* Cuộn KHUNG NGOÀI khi bảng đang mở thì bảng trôi khỏi ô của nó (nó nằm ở lớp
 * nổi) — đóng luôn cho khỏi lơ lửng giữa màn hình. Nhưng cuộn chính danh sách
 * bên trong bảng thì phải để yên, không thì kéo tìm người là bảng tự sập. */
document.addEventListener('scroll', (e) => {
  const mo = bangDangMo();
  if (!mo) return;
  const t = e.target;
  if (t && t.closest && t.closest('.pk') === mo) return;
  dongBangChon();
}, true);

// đổi cỡ cửa sổ thì tính lại chỗ, khỏi để bảng lệch khỏi ô của nó
window.addEventListener('resize', () => {
  const mo = bangDangMo();
  if (mo) datChoBangChon(mo.querySelector('.pk-panel'));
});

/* Ô chi tiết trượt vào bằng transform, mà phần tử có transform thì thành mốc
 * định vị cho position:fixed bên trong — bấm mở bảng chọn ngay lúc hoạt ảnh
 * chưa xong là bảng bay ra ngoài màn hình. Hoạt ảnh chạy xong thì đặt lại chỗ. */
const oChiTiet = $('#drawer');
if (oChiTiet) {
  oChiTiet.addEventListener('transitionend', (e) => {
    if (e.propertyName !== 'transform') return;
    const mo = bangDangMo();
    if (mo) datChoBangChon(mo.querySelector('.pk-panel'));
    if (NG) datChoLich();
  });
}

/** Lọc danh sách trong bảng chọn người theo ô tìm. */
/* Gõ "khanh" phải ra "Nguyễn Long Khánh". Bỏ dấu cả hai phía rồi mới so. */
const khongDau = (x) => String(x == null ? '' : x).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();

function timNguoi(panel) {
  const q = khongDau(panel.querySelector('.pk-tim').value);
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
    trong.textContent = 'Không có mục nào khớp';
    panel.querySelector('.pk-ds').appendChild(trong);
  }
  if (trong) trong.hidden = !!hien;
}

/* input / change */
/* Ô tìm nhân sự: lọc lại ở NHIỀU tín hiệu chứ không chỉ 'input'.
 * Gõ tiếng Việt bằng Telex/VNI đi qua một chuỗi ghép chữ (composition); tuỳ
 * trình duyệt và bộ gõ mà 'input' có lúc không bắn ra cho chữ cuối, thành ra ô
 * hiện chữ "Hùng" mà danh sách vẫn nguyên. Bắt thêm compositionend và keyup thì
 * kiểu gõ nào cũng lọc đúng; lọc lại vài lần thừa cũng không hại gì. */
['compositionend', 'keyup', 'search', 'change'].forEach((loai) => {
  document.addEventListener(loai, (e) => {
    if (e.target.classList && e.target.classList.contains('pk-tim')) {
      timNguoi(e.target.closest('.pk-panel'));
    }
  }, true);
});

document.addEventListener('input', (e) => {
  if (e.target.classList && e.target.classList.contains('pk-tim')) {
    timNguoi(e.target.closest('.pk-panel'));
    return;
  }
  const T = e.target;
  if (T.id === 'fQ') { S.f.q = T.value; clearTimeout(window.__qt); window.__qt = setTimeout(render, 240); return; }

  if (T.dataset && T.dataset.xh && XH) { XH[T.dataset.xh] = T.value; return; }

  const bc = T.dataset && T.dataset.bc;
  if (bc && BC) {
    if (T.dataset.kieu === 'ngay') return;      // ngày giờ đọc lúc rời ô
    BC[bc] = T.value;
    return;
  }

  const k = T.dataset && T.dataset.k;
  if (k && S.sel) {
    if (T.dataset.kieu === 'ngay') return;   // ngày giờ đọc khi rời ô, không đọc từng ký tự
    if (T.type === 'checkbox') setDraft(k, T.checked);
    else if (T.type === 'number') setDraft(k, T.value === '' ? null : Number(T.value));
    else setDraft(k, T.value);
    return;
  }
  const n = T.dataset && T.dataset.n;
  if (n) {
    if (T.dataset.kieu === 'ngay') return;
    NEW[n] = T.type === 'checkbox' ? T.checked : T.value;
  }
});

document.addEventListener('change', async (e) => {
  const T = e.target;

  if (NG && T.classList && T.classList.contains('ng-sel')) {
    const nay = vnParts(new Date());
    const c = NG.chon || { y: NG.y, m: NG.m, d: nay.d, H: 8, M: 0 };
    if (T.dataset.ngh) c.H = Number(T.value); else c.M = Number(T.value);
    NG.chon = c;
    datNgay(NG.inp, vnISO(c));
    return;
  }

  /* Ô ngày giờ: đọc lúc người ta rời ô. Gõ đúng thì viết lại cho chuẩn dạng,
   * gõ sai thì trả về giá trị cũ chứ không im lặng nuốt mất. */
  if (T.dataset && T.dataset.kieu === 'ngay') {
    const cu = T.dataset.bc && BC ? BC[T.dataset.bc]
      : T.dataset.k && S.sel ? S.sel[T.dataset.k]
      : (T.dataset.n ? NEW[T.dataset.n] : null);
    if (!T.value.trim()) { datNgay(T, null); return; }
    const iso = docNgayVN(T.value);
    if (iso) datNgay(T, iso);
    else { T.value = vnText(cu); toast('Ngày giờ phải theo dạng dd/mm/yyyy hh:mm', 'err'); }
    return;
  }

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
  if (T.dataset && T.dataset.bc && BC && T.tagName === 'SELECT') { BC[T.dataset.bc] = T.value; return; }

  const n = T.dataset && T.dataset.n;
  if (n && T.tagName === 'SELECT') { NEW[n] = T.value; return; }

  /* Hoá đơn tải thẳng từ cửa sổ báo cáo — không mượn đường của ô chi tiết, vì ô
   * đó đang đóng và sẽ vẽ lại nhầm chỗ. */
  if (T.dataset && T.dataset.bcup && T.files && T.files.length && BC) {
    const id = BC.id;
    const xong = await taiNhieuTep(T, id, 'files');
    if (xong && BC && BC.id === id) veBaoCao();
    return;
  }

  const up = T.dataset && T.dataset.up;
  if (up && T.files && T.files.length && S.sel) {
    if (PREVIEW()) { T.value = ''; return toast('Đang xem giao diện của người khác — không tải tệp thay họ được.', 'err'); }
    const id = S.sel.id;
    if (await taiNhieuTep(T, id, up)) {
      const again = S.items.find((x) => x.id === id);
      if (again && S.sel && S.sel.id === id) { S.sel = again; renderDrawer(); }
    }
  }
});

/**
 * Tải một loạt tệp lên cùng một ô đính kèm.
 *
 * Base nhận mỗi lần một tệp, nên ở đây gửi lần lượt chứ không song song — gửi
 * cùng lúc thì Base hay báo xung đột phiên bản vì mấy request cùng ghi vào một
 * bản ghi. Đổi lại phải báo tiến độ, không thì chọn 10 tệp là ngồi nhìn màn
 * hình đứng im.
 *
 * Một tệp hỏng không làm hỏng cả mẻ: ghi lại tên rồi đi tiếp, cuối cùng nói rõ
 * cái nào không lên được.
 */
async function taiNhieuTep(input, recId, cot) {
  const ds = [...input.files];
  input.value = '';                       // cho chọn lại đúng tệp đó nếu cần
  if (!ds.length) return false;
  input.disabled = true;
  const hong = [];
  try {
    for (let i = 0; i < ds.length; i++) {
      const f = ds[i];
      toast(ds.length > 1
        ? 'Đang tải ' + (i + 1) + '/' + ds.length + ' — ' + f.name
        : 'Đang tải "' + f.name + '" lên…');
      try {
        const r = await fetch(
          apiUrl('/api/items/' + recId + '/attachment/' + cot + '?name=' + encodeURIComponent(f.name)),
          { method: 'POST', body: f });
        /* Đọc văn bản trước rồi mới phân tích: request bị cắt giữa chừng thì
         * thân phản hồi rỗng, gọi thẳng .json() sẽ ném ra "Unexpected end of
         * JSON input" — câu đó chẳng nói được điều gì cho người dùng. */
        const raw = await r.text().catch(() => '');
        let d = {};
        if (raw.trim()) { try { d = JSON.parse(raw); } catch (_) { d = { error: raw.slice(0, 120) }; } }
        else if (!r.ok) d = { error: 'Máy chủ báo lỗi HTTP ' + r.status };
        else d = { error: 'Máy chủ không trả lời — thử lại hoặc dùng tệp nhỏ hơn' };
        if (!r.ok || d.error) throw new Error(d.error || 'Tải lên thất bại');
      } catch (err) {
        hong.push(f.name + ' (' + err.message + ')');
      }
    }
  } finally {
    input.disabled = false;
  }
  const duoc = ds.length - hong.length;
  if (duoc) toast('Đã lưu ' + duoc + ' tệp vào Base', 'ok');
  if (hong.length) toast('Không tải được: ' + hong.join(' · '), 'err');
  await refresh(true);
  return duoc > 0;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && bangDangMo()) {
    dongBangChon();     // Esc đóng bảng chọn trước, chưa đóng cả cửa sổ
    return;
  }
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
    // danh bạ chỉ để mở rộng ô chọn người, thiếu cũng không chặn gì — tải sau
    taiDanhBa().then(() => { if (!S.sel) render(); });
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

