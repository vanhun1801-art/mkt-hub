'use strict';

/* =======================  state  ======================= */
/** Bộ lọc thời gian mặc định của cả app — tháng hiện tại (mã trong DUE_OPTIONS). */
const MAC_DINH_DUE = 'thismonth';

const S = {
  meta: null,
  tasks: [],
  view: 'work',
  who: null,                 // người mà tab "Việc của tôi" đang hiển thị
  viewAs: null,              // quản lý đang xem việc của ai (null = chính mình)
  isManager: false,          // quản lý mới xem được toàn phòng
  // MAC_DINH_DUE: bộ lọc thời gian mở app đã là tháng hiện tại
  wf: { campaign: '', priority: '', due: MAC_DINH_DUE, dueDate: '', lane: '' },
  df: { campaign: '', person: '', due: MAC_DINH_DUE, dueDate: '' },   // bộ lọc trang Tổng quan
  cf: { mode: 'month', moc: null, q: '', status: '', person: '', campaign: '', openOnly: true, moRong: {} },
  // `moc` là điều kiện phụ của hai thẻ Quá hạn / Hạn hôm nay — ghép AND với `due`,
  // không ghi đè bộ lọc thời gian người dùng đang đặt.
  filters: { campaign: '', workType: '', owner: '', priority: '', status: '', due: MAC_DINH_DUE, dueDate: '', moc: '', hideDone: false, q: '' },
  sort: { key: 'deadline', dir: 'asc' },
  selected: new Set(),
  collapsed: {},             // lane key -> true
  editing: null,
  dirty: {},
  modalTask: null,           // task đang xử lý trong modal
  // Quản lý bấm "Sửa đầy đủ" trong ô chi tiết -> mở form mọi trường thay vì bản gọn
  suaDayDu: false,
  quyen: null,               // dữ liệu modal phân quyền
  wlSort: { key: 'open', dir: 'desc' },   // sắp xếp bảng tải việc
  assignPick: [],            // người được chọn trong modal phân công
  seenNew: new Set(),        // id việc mới đã thông báo
  fetchedAt: 0,              // lúc server lấy dữ liệu lần cuối
  lastFocusPoll: 0,
};

const CLOSED = ['Hoàn thành', 'Hủy'];

/* Màu trạng thái — theo bảng màu Lark */
const STATUS_HUE = {
  'Chờ tiếp nhận': '#f54a45',
  'Đang tiến hành': '#3370ff',
  'Làm lại': '#ff8800',
  'Tạm dừng': '#ffc60a',
  'Trễ deadline': '#f54a45',
  'Hoàn thành': '#34c724',
  'Hủy': '#bbbfc4',
};

/* Màu ảnh đại diện — dải màu Lark, không sinh ngẫu nhiên */
const AVATAR_HUES = [
  '#3370ff', '#7f3bf5', '#14c0ff', '#00d6b9',
  '#f54a45', '#ff8800', '#8ab000', '#5c67d6',
];

/* Các làn việc — góc nhìn người triển khai */
const LANES = [
  { key: 'new', title: 'Công việc mới',
    hint: 'Đọc kỹ yêu cầu. Đủ thông tin thì bấm Bắt đầu làm; thiếu/sai thì gửi Yêu cầu điều chỉnh.',
    empty: 'Không có việc mới nào đang chờ bạn.' },
  { key: 'redo', title: 'Cần làm lại',
    hint: 'Người order trả về. Sửa sản phẩm, cập nhật lại tệp/link rồi nộp lại.',
    empty: 'Không có việc nào bị trả về.' },
  { key: 'helping', title: 'Cần hỗ trợ',
    hint: 'Việc của người khác, bạn được thêm vào cột Người hỗ trợ.',
    empty: 'Bạn không hỗ trợ việc nào.' },
  { key: 'doing', title: 'Đang tiến hành',
    hint: 'Đính sản phẩm hoặc dán link kết quả trước khi chuyển Hoàn thành.',
    empty: 'Bạn chưa bắt đầu việc nào.' },
  { key: 'late', title: 'Đang trễ deadline',
    hint: 'Đã bị đánh dấu trễ. Ưu tiên xử lý và báo người order.',
    empty: 'Không có việc nào bị đánh dấu trễ.' },
  /* Nộp xong là xong phần của nhân sự -> ẨN HẲN khỏi "Việc của tôi".
   * Vẫn tìm lại được bằng ô tìm kiếm khi cần nộp lại file cuối. */
  { key: 'daNop', title: 'Đã nộp · chờ nghiệm thu', chiKhiTim: true,
    hint: 'Đã trễ nhưng đã nộp sản phẩm. Trạng thái trễ được giữ để thống kê; đợi người order hoặc quản lý nghiệm thu.',
    empty: 'Không có việc nào đang chờ nghiệm thu.' },
  { key: 'done', title: 'Đã hoàn thành', onlyWhenFiltered: true,
    hint: 'Đã nộp kết quả — chờ hoặc đã có chấm điểm.',
    empty: 'Chưa có việc nào hoàn thành.' },
];

/* Năm thẻ đếm ở đầu trang */
const COUNTERS = ['new', 'doing', 'late', 'redo', 'done'];

const LANE_BY_KEY = Object.fromEntries(LANES.map((l) => [l.key, l]));

/** Làn của một task theo góc nhìn người đang xem. null = không thuộc phạm vi. */
function laneOf(t, me) {
  const isOwner = (t.owner || []).some((u) => u.id === me);
  const isHelper = (t.helper || []).some((u) => u.id === me);
  if (!isOwner && !isHelper) return null;
  const s = t.status;
  if (s === 'Hoàn thành') return 'done';
  if (s === 'Hủy' || s === 'Tạm dừng') return null;
  if (!isOwner) return 'helping';
  /* Đã nộp sản phẩm thì rời làn "Đang trễ deadline" — việc của nhân sự xong,
   * chỉ còn chờ nghiệm thu. Trạng thái vẫn là "Trễ deadline" để thống kê. */
  if (t.daGiaiQuyet) return 'daNop';
  if (s === 'Trễ deadline') return 'late';
  if (s === 'Làm lại') return 'redo';
  if (s === 'Đang tiến hành') return 'doing';
  return 'new';
}

/**
 * Danh sách người dùng cho MỌI ô chọn người trong app.
 * Chỉ gồm người được cấp quyền dùng app (phạm vi khả dụng khai trong Lark).
 * Chế độ cli không đọc được phạm vi nên mới dùng danh bạ lấy từ Base.
 */
function dsNguoi() {
  const m = S.meta || {};
  return (m.scopeAvailable && (m.scopePeople || []).length) ? m.scopePeople : (m.people || []);
}

const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

/* =======================  api  ======================= */
async function req(url, opts) {
  const r = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    const e = new Error(data.error || 'HTTP ' + r.status);
    e.code = data.code;
    e.hint = data.hint;
    throw e;
  }
  return data;
}

async function loadAll(refresh) {
  const q = refresh ? '?refresh=1' : '';
  const [meta, tasks] = await Promise.all([req('/api/meta' + q), req('/api/tasks' + q)]);
  S.meta = meta;
  S.tasks = tasks.tasks;
  S.fetchedAt = tasks.fetchedAt || Date.now();
}

/* =======================  utils  ======================= */
function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(v, withTime) {
  const d = parseDate(v);
  if (!d) return '';
  const s = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  if (!withTime) return s;
  const h = d.getHours(), m = d.getMinutes();
  return h || m ? s + ' ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') : s;
}

function toLocalInput(v) {
  const d = parseDate(v);
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function daysLeft(v) {
  const d = parseDate(v);
  if (!d) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  return Math.round((x - t) / 86400000);
}

/* ---- Mốc thời gian: khớp bộ điều kiện của Lark Base ---- */
const DUE_OPTIONS = [
  { nhom: 'Mốc thời gian', items: [
    ['exact',     'Ngày cụ thể'],
    ['today',     'Hôm nay'],
    ['tomorrow',  'Ngày mai'],
    ['yesterday', 'Hôm qua'],
    ['thisweek',  'Tuần này'],
    ['lastweek',  'Tuần trước'],
    ['thismonth', 'Tháng này'],
    ['lastmonth', 'Tháng trước'],
    ['past7',     '7 ngày qua'],
    ['next7',     'Trong 7 ngày tới'],
    ['past30',    '30 ngày qua'],
    ['next30',    'Trong 30 ngày tới'],
  ] },
  // Lark diễn đạt hai cái này bằng toán tử chứ không phải giá trị ngày
  { nhom: 'Theo tình trạng', items: [
    ['overdue', 'Đã quá hạn (chưa đóng)'],
    ['none',    'Chưa có deadline'],
  ] },
];

/** mã mốc -> nhãn, để in ra cho người dùng biết đang lọc theo gì. */
const DUE_LABEL = Object.fromEntries(
  DUE_OPTIONS.flatMap((g) => g.items).map(([k, v]) => [k, v])
);

/** Đổ danh sách mốc thời gian vào một <select>, giữ nguyên lựa chọn hiện tại. */
function fillDueSelect(sel, placeholder) {
  const keep = sel.value;
  sel.innerHTML = '';

  /* Nhân sự chỉ được bảy mốc quanh hôm nay — danh sách do lớp vỏ cấp (loc.js),
   * dùng chung với Tổng quan và hai base kia. Không có "tất cả", không quá hạn
   * cả tháng trước: nhìn xa hơn là việc của quản lý. */
  const moc = MOC_HUB();
  if (moc) {
    /* Khoảng tuỳ chỉnh chỉ đặt được ở thanh lọc của lớp vỏ (có hai ô ngày) — ở đây
     * hiện thành một lựa chọn "Bộ lọc chung" để biết đang lọc theo khoảng nào. */
    if (S.hubKhoang && !window.HUB_LOC.macCuaKhoang(S.hubKhoang.tu, S.hubKhoang.den)) {
      const op = el('option', '', 'Bộ lọc chung: ' + dmyNgan(S.hubKhoang.tu) + ' → ' + dmyNgan(S.hubKhoang.den));
      op.value = 'khoang';
      sel.appendChild(op);
    }
    for (const x of moc) {
      const op = el('option', '', x.ten);
      op.value = 'ns:' + x.tu + ':' + x.den;
      sel.appendChild(op);
    }
    sel.value = keep;
    if (!sel.value) {
      const mac = moc.find((x) => x.k === window.HUB_LOC.MAC_DINH) || moc[0];
      if (mac) sel.value = 'ns:' + mac.tu + ':' + mac.den;
    }
    return;
  }

  const p = el('option', '', placeholder);
  p.value = '';
  sel.appendChild(p);
  // khoảng do bộ lọc chung của Marketing Hub đưa xuống — hiện thành lựa chọn thật
  if (S.hubKhoang) {
    const op = el('option', '', 'Bộ lọc chung: ' + dmyNgan(S.hubKhoang.tu) + ' → ' + dmyNgan(S.hubKhoang.den));
    op.value = 'khoang';
    sel.appendChild(op);
  }
  for (const g of DUE_OPTIONS) {
    const og = document.createElement('optgroup');
    og.label = g.nhom;
    for (const [v, label] of g.items) {
      const op = el('option', '', label);
      op.value = v;
      og.appendChild(op);
    }
    sel.appendChild(og);
  }
  sel.value = keep;
}

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

const dmyNgan = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '');

/* Đang chạy dưới lớp vỏ Marketing Hub: mốc thời gian lấy theo bộ chuẩn của lớp vỏ
 * (loc.js) — quản lý một bộ, nhân sự một bộ hẹp hơn. Lớp vỏ mới là nơi quyết vai
 * (theo email + bảng phân quyền), nên hỏi nó chứ không tự đoán. */
const DUOI_HUB = () => !!(window.HUB_LOC && window.__HUB__);
const NS_HUB = () => DUOI_HUB() && window.__HUB__.quanLy === false;
const MOC_HUB = () => (DUOI_HUB() ? window.HUB_LOC.danhSachTheoVai(window.__HUB__.quanLy) : null);
const isoNgay = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0');

/**
 * Khoảng ngày tương đương của một mốc thời gian, để báo lên lớp vỏ cho các base
 * khác lọc theo. `null` = không lọc (toàn bộ); `undefined` = không diễn tả được
 * bằng khoảng ngày (VD "Đã quá hạn", "Chưa có deadline") -> không đồng bộ ngược.
 */
function khoangCuaMoc(mode, exact) {
  if (String(mode).startsWith('ns:')) {
    const [, tu, den] = String(mode).split(':');
    return { tu, den };
  }
  const t0 = startOfDay(new Date());
  const cong = (n) => { const x = new Date(t0); x.setDate(x.getDate() + n); return x; };
  const thang = (lech) => {
    const d = new Date(t0.getFullYear(), t0.getMonth() + lech, 1);
    return { tu: isoNgay(d), den: isoNgay(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  };
  const tuan = (lech) => {
    const s = weekStart(t0); s.setDate(s.getDate() + lech * 7);
    const e = new Date(s); e.setDate(e.getDate() + 6);
    return { tu: isoNgay(s), den: isoNgay(e) };
  };
  switch (mode) {
    case '':          return null;
    case 'khoang':    return S.hubKhoang || null;
    case 'exact':     return exact ? { tu: exact, den: exact } : undefined;
    case 'today':     return { tu: isoNgay(t0), den: isoNgay(t0) };
    case 'tomorrow':  return { tu: isoNgay(cong(1)), den: isoNgay(cong(1)) };
    case 'yesterday': return { tu: isoNgay(cong(-1)), den: isoNgay(cong(-1)) };
    case 'thisweek':  return tuan(0);
    case 'lastweek':  return tuan(-1);
    case 'thismonth': return thang(0);
    case 'lastmonth': return thang(-1);
    case 'past7':     return { tu: isoNgay(cong(-7)), den: isoNgay(t0) };
    case 'next7':     return { tu: isoNgay(t0), den: isoNgay(cong(7)) };
    case 'past30':    return { tu: isoNgay(cong(-30)), den: isoNgay(t0) };
    case 'next30':    return { tu: isoNgay(t0), den: isoNgay(cong(30)) };
    default:          return undefined;
  }
}

/** Báo lên lớp vỏ khi người dùng tự đổi mốc thời gian trong app này. */
function baoKhoangLenHub(mode, exact) {
  if (!window.hubBaoKhoang) return;
  const k = khoangCuaMoc(mode, exact);
  if (k === undefined) return;
  window.hubBaoKhoang(k ? k.tu : '', k ? k.den : '');
}

/* Lớp vỏ gọi xuống khi bộ lọc chung đổi: áp cho cả ba bộ lọc của app. */
window.hubApKhoang = function (tu, den) {
  S.hubKhoang = tu && den ? { tu, den } : null;
  // nhân sự dùng đúng mã của bảy mốc để ô chọn hiện đúng tên, không phải "Bộ lọc chung"
  const nsMoc = (DUOI_HUB() && tu && den && window.HUB_LOC.macCuaKhoang(tu, den))
    ? 'ns:' + tu + ':' + den : '';
  const moc = nsMoc || (S.hubKhoang ? 'khoang' : '');
  for (const f of [S.filters, S.wf, S.df]) { f.due = moc; f.dueDate = ''; }
  if (!S.meta) return;                       // chưa nạp xong thì để load() tự áp
  setupFilters();
  syncFilterInputs();
  render();
};

/** Thứ 2 đầu tuần chứa ngày d (tuần bắt đầu từ Thứ 2). */
function weekStart(d) {
  const x = startOfDay(d);
  const wd = (x.getDay() + 6) % 7;   // 0 = Thứ 2
  x.setDate(x.getDate() - wd);
  return x;
}

/** Deadline có nằm trong tuần bắt đầu từ `s` (Thứ 2) không. */
function trongTuan(day, s) {
  const e = new Date(s); e.setDate(e.getDate() + 7);
  return day >= s && day < e;
}

const cungThang = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/**
 * Kiểm tra deadline của task theo mốc thời gian đã chọn.
 * `d` = số ngày còn lại (0 = hôm nay, âm = đã qua).
 * `exact` = chuỗi yyyy-mm-dd khi chọn "Ngày cụ thể".
 */
function matchDue(t, mode, exact) {
  // Chọn "Ngày cụ thể" nhưng chưa chọn ngày → coi như chưa lọc
  if (mode === 'exact' && !exact) return true;

  const date = parseDate(t.deadline);
  if (mode === 'none') return date == null;
  if (!date) return false;

  // mốc của nhân sự: 'ns:<tu>:<den>' (bảy mốc dùng chung, xem loc.js)
  if (String(mode).startsWith('ns:')) {
    const [, tu, den] = String(mode).split(':');
    const d0 = startOfDay(date).getTime();
    return d0 >= startOfDay(new Date(tu + 'T00:00:00')).getTime() &&
           d0 <= startOfDay(new Date(den + 'T00:00:00')).getTime();
  }

  // khoảng do lớp vỏ Marketing Hub đưa xuống (một bộ lọc cho mọi base)
  if (mode === 'khoang') {
    if (!S.hubKhoang) return true;
    const day0 = startOfDay(date).getTime();
    return day0 >= startOfDay(new Date(S.hubKhoang.tu + 'T00:00:00')).getTime() &&
           day0 <= startOfDay(new Date(S.hubKhoang.den + 'T00:00:00')).getTime();
  }

  const d = daysLeft(t.deadline);
  const today = startOfDay(new Date());
  const day = startOfDay(date);

  switch (mode) {
    case 'exact': {
      const x = startOfDay(new Date(exact + 'T00:00:00'));
      return day.getTime() === x.getTime();
    }

    case 'today':     return d === 0;
    case 'tomorrow':  return d === 1;
    case 'yesterday': return d === -1;

    case 'thisweek':  return trongTuan(day, weekStart(today));
    case 'lastweek': {
      const s = weekStart(today); s.setDate(s.getDate() - 7);
      return trongTuan(day, s);
    }

    case 'thismonth': return cungThang(day, today);
    case 'lastmonth': return cungThang(day, new Date(today.getFullYear(), today.getMonth() - 1, 1));

    case 'past7':   return d <= 0 && d >= -7;
    case 'next7':   return d >= 0 && d <= 7;
    case 'past30':  return d <= 0 && d >= -30;
    case 'next30':  return d >= 0 && d <= 30;

    case 'overdue': return d < 0 && !isClosed(t);
    default: return true;
  }
}

const isClosed = (t) => CLOSED.includes(t.status);
/* Đã giải quyết = đã nộp sản phẩm dù trễ: rời khỏi hàng đợi quá hạn, nhưng TRẠNG
 * THÁI vẫn giữ nguyên để cuối tháng còn thống kê được ai trễ. */
const daGiaiQuyet = (t) => !!t.daGiaiQuyet;

/** "Đã giải quyết · trễ 6 ngày" — tính theo Ngày giải quyết, không theo hôm nay. */
function nhanGiaiQuyet(t) {
  const gq = t.ngayGiaiQuyet ? new Date(t.ngayGiaiQuyet) : null;
  const dl = t.deadline ? new Date(t.deadline) : null;
  if (!gq || !dl || isNaN(gq.getTime()) || isNaN(dl.getTime())) return 'Đã giải quyết';
  const ngay = Math.floor((startOfDay(gq) - startOfDay(dl)) / 86400000);
  return ngay > 0 ? 'Đã giải quyết · trễ ' + ngay + ' ngày' : 'Đã giải quyết';
}
/** Cấu hình luật từ server (meta.rules) — thiếu thì coi như đang bật. */
const cfg0 = () => ({ chanTre: !S.meta || !S.meta.rules || S.meta.rules.chanHoanThanhKhiTre !== false });
/* Hai khái niệm khác nhau, đừng lẫn:
 *  - laTreTheoHan: đã trễ hạn, kể cả đã nộp sản phẩm  -> quyết định NÚT nào hiện.
 *  - isOverdue:    đã trễ mà chưa nộp                 -> quyết định còn nằm trong
 *                                                        hàng đợi quá hạn hay không. */
const laTreTheoHan = (t) => !isClosed(t) &&
  (t.status === 'Trễ deadline' ||
    (daysLeft(t.deadline) != null && daysLeft(t.deadline) < 0));
const isOverdue = (t) => laTreTheoHan(t) && !daGiaiQuyet(t);
const hasProof = (t) => (t.attachment || []).length > 0 ||
  (t.fileKetQua || []).length > 0 || !!t.link;

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0] || '')[0] + (parts.length > 1 ? (parts[parts.length - 1] || '')[0] : '')).toUpperCase();
}

function colorOf(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) % 997;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

function priClass(p) {
  if (!p) return '';
  if (p.includes('Cao')) return 'p-high';
  if (p.includes('Trung')) return 'p-mid';
  return 'p-low';
}

/** Bỏ emoji đầu chuỗi khi hiển thị dạng nhãn — màu nền đã mang nghĩa. */
function plainLabel(s) {
  return String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

function deadlineTag(t) {
  if (!t.deadline) return null;
  const d = daysLeft(t.deadline);
  let cls = 'tag due';
  let txt = fmtDate(t.deadline);
  if (!isClosed(t)) {
    if (d < 0) { cls += ' late'; txt = 'Quá hạn ' + Math.abs(d) + ' ngày'; }
    /* Base đã chứng nhận trễ (automation đầu sau deadline 2 tiếng) thì đừng
     * ghi "Hạn hôm nay" nữa — nhân sự sẽ tưỏng còn kịp. */
    else if (t.status === 'Trễ deadline') { cls += ' late'; txt = 'Trễ deadline'; }
    else if (d === 0) { cls += ' soon'; txt = 'Hạn hôm nay'; }
    else if (d <= 3) { cls += ' soon'; txt = 'Còn ' + d + ' ngày · ' + txt; }
  }
  return el('span', cls, txt);
}

function toast(msg, isErr) {
  const t = el('div', 'toast' + (isErr ? ' err' : ''), msg);
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, isErr ? 6000 : 2800);
}

/* =======================  phạm vi & lọc  ======================= */
/** Vai trò của người đang xem trong một task. */
function roleIn(t, personId) {
  const has = (arr) => (arr || []).some((u) => u.id === personId);
  if (has(t.owner)) return 'owner';
  if (has(t.helper)) return 'helper';
  if (has(t.requester)) return 'requester';
  return null;
}

/** Toàn bộ việc thuộc phạm vi người triển khai (phụ trách chính hoặc hỗ trợ). */
function scopeTasks() {
  const who = S.who && S.who.id;
  if (!who) return [];
  return S.tasks.filter((t) => laneOf(t, who) !== null);
}

/**
 * Việc của người đang xem SAU bộ lọc (chiến dịch / ưu tiên / thời gian / tìm),
 * nhưng chưa áp việc chọn làn. Đây là tập dùng để ĐẾM 5 thẻ ở trên, nhờ vậy con
 * số trên thẻ và danh sách bên dưới luôn nói cùng một chuyện — trước đây thẻ đếm
 * trên toàn bộ nên lọc "Tháng này" mà thẻ vẫn cộng cả việc tháng 5, tháng 7.
 */
function myTasksLoc() {
  const f = S.wf;
  const q = S.filters.q.trim().toLowerCase();

  return scopeTasks().filter((t) => {
    if (f.campaign && t.campaign !== f.campaign) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.due && !matchDue(t, f.due, f.dueDate)) return false;
    if (q) {
      const hay = [t.title, t.detail, t.note, t.campaign, t.workType, t.status].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Việc của tôi sau khi áp bộ lọc.
 * `boQua` liệt kê những chiều cần bỏ qua — dùng khi đếm số trên thẻ, để con số
 * trên thẻ đúng bằng số việc hiện ra khi bấm vào thẻ đó.
 */
function myTasks(boQua) {
  const bq = boQua || [];
  const f = S.wf;
  const who = S.who && S.who.id;

  return myTasksLoc().filter((t) => {
    const lane = laneOf(t, who);
    if (!bq.includes('lane')) {
      // Làn "Đã hoàn thành" chỉ hiện khi được chọn ở thẻ đếm
      if (LANE_BY_KEY[lane].onlyWhenFiltered && f.lane !== lane) return false;
      if (f.lane && lane !== f.lane) return false;
    }
    return true;
  });
}

/** Ưu tiên trong lane: quá hạn trước, rồi deadline gần, rồi ưu tiên cao. */
function laneSort(list) {
  const pri = (p) => (!p ? 3 : p.includes('Cao') ? 0 : p.includes('Trung') ? 1 : 2);
  return list.slice().sort((a, b) => {
    const da = daysLeft(a.deadline), db = daysLeft(b.deadline);
    const va = da == null ? 9999 : da, vb = db == null ? 9999 : db;
    if (va !== vb) return va - vb;
    return pri(a.priority) - pri(b.priority);
  });
}

/* =======================  render: 5 thẻ đếm  ======================= */
function renderCounters() {
  const box = $('#flowstrip');
  box.innerHTML = '';
  const who = S.who && S.who.id;

  const counts = {};
  for (const k of COUNTERS) counts[k] = 0;
  for (const t of myTasksLoc()) {
    const lane = laneOf(t, who);
    if (counts[lane] !== undefined) counts[lane]++;
  }

  for (const k of COUNTERS) {
    const lane = LANE_BY_KEY[k];
    const n = el('div', 'fstage c-' + k + (counts[k] ? '' : ' is-zero'));
    if (S.wf.lane === k) n.classList.add('is-active');
    n.appendChild(el('span', 'fs-n', String(counts[k])));
    n.appendChild(el('span', 'fs-label', lane.title));
    n.title = lane.hint;
    n.onclick = () => {
      S.wf.lane = S.wf.lane === k ? '' : k;
      render();
    };
    box.appendChild(n);
  }
}

/* =======================  render: lanes  ======================= */
function renderLanes(list) {
  const box = $('#lanes');
  box.innerHTML = '';
  const who = S.who && S.who.id;

  const groups = {};
  for (const l of LANES) groups[l.key] = [];
  for (const t of list) {
    const k = laneOf(t, who);
    if (groups[k]) groups[k].push(t);
  }

  for (const def of LANES) {
    const items = laneSort(groups[def.key]);
    // Làn rỗng: giữ "Công việc mới" và "Đang tiến hành" để nhân sự biết mình đang trống,
    // nhưng khi đã chọn một thẻ đếm thì chỉ hiện đúng làn đó
    const keepEmpty = !S.wf.lane && (def.key === 'new' || def.key === 'doing');
    if (!items.length && !keepEmpty) continue;
    if (def.onlyWhenFiltered && S.wf.lane !== def.key) continue;
    // đã nộp rồi thì biến khỏi màn hình, trừ khi người dùng đang tìm chính nó
    if (def.chiKhiTim && !S.filters.q.trim()) continue;

    const lane = el('div', 'lane lane-l-' + def.key + (items.length ? '' : ' is-empty'));
    const collapsed = !!S.collapsed[def.key];
    if (collapsed) lane.classList.add('collapsed');

    const head = el('div', 'lane-head');
    head.appendChild(el('strong', '', def.title));
    head.appendChild(el('span', 'lh-n' + (items.length ? '' : ' is-zero'), String(items.length)));
    head.appendChild(el('span', 'lh-hint', def.hint));
    head.appendChild(el('span', 'lh-caret', collapsed ? '▸' : '▾'));
    head.onclick = () => {
      S.collapsed[def.key] = !collapsed;
      render();
    };
    lane.appendChild(head);

    const body = el('div', 'lane-items');
    if (!items.length) body.appendChild(el('div', 'lane-empty', def.empty));
    for (const t of items) body.appendChild(workCard(t, def.key));
    lane.appendChild(body);

    box.appendChild(lane);
  }
}

function workCard(t, lane) {
  const c = el('div', 'wcard');
  const d = daysLeft(t.deadline);
  if (!isClosed(t) && d != null) {
    if (d < 0) c.classList.add('late');
    else if (d <= 3) c.classList.add('soon');
  }

  const main = el('div', 'wcard-main');
  const title = el('div', 'wcard-title', t.title || '(chưa có tên)');
  title.onclick = () => openDrawer(t);
  main.appendChild(title);

  if (t.detail) {
    main.appendChild(el('div', 'wcard-sub', t.detail.replace(/\s+/g, ' ').slice(0, 150)));
  }

  const meta = el('div', 'wcard-meta');
  if (t.priority) meta.appendChild(el('span', 'tag ' + priClass(t.priority), plainLabel(t.priority)));
  if (t.workType) meta.appendChild(el('span', 'tag', t.workType));
  if (t.campaign) meta.appendChild(el('span', 'tag', t.campaign));
  const dl = deadlineTag(t);
  if (dl) meta.appendChild(dl);
  /* Đã nộp sản phẩm dù trễ: nói rõ ngay trên thẻ, và nói cả trễ mấy ngày — con số
   * đó đóng băng theo Ngày giải quyết nên báo cáo cuối tháng đọc được. */
  if (daGiaiQuyet(t)) meta.appendChild(el('span', 'tag tag-gq', nhanGiaiQuyet(t)));

  if (lane === 'doing' || lane === 'redo' || lane === 'late' || lane === 'daNop') {
    meta.appendChild(el('span', 'proofdot ' + (hasProof(t) ? 'has' : 'missing'),
      hasProof(t) ? 'Đã có kết quả' : 'Chưa có tệp/link'));
  }
  if (lane === 'done' && t.rating) {
    meta.appendChild(el('span', 'stars-in', '★'.repeat(t.rating)));
  }
  if (lane === 'helping') {
    if ((t.owner || []).length) {
      meta.appendChild(el('span', 'tag', 'Phụ trách: ' + t.owner.map((u) => u.name).join(', ')));
    }
  } else if ((t.requester || []).length) {
    meta.appendChild(el('span', 'tag', 'Order: ' + t.requester[0].name));
  }
  main.appendChild(meta);
  c.appendChild(main);

  /* --- hành động theo làn --- */
  const acts = el('div', 'wcard-actions');

  // Đang xem việc của người khác: không hiện nút thao tác của nhân sự
  if (S.viewAs) {
    const b = el('button', 'btn', 'Xem chi tiết');
    b.onclick = () => openDrawer(t);
    acts.appendChild(b);
    c.appendChild(acts);
    return c;
  }

  /* Việc đã trễ: nhân sự KHÔNG tự đặt Hoàn thành (trễ rồi thì phải chịu), nhưng
   * vẫn phải có chỗ nộp sản phẩm — nút "Giải quyết". Quản lý thì vẫn đóng được. */
  const treCanGQ = !S.isManager && cfg0().chanTre && laTreTheoHan(t);
  const primary = {
    new:  { label: '▶ Bắt đầu làm', run: () => startTask(t) },
    doing: { label: '✓ Hoàn thành', run: () => openDone(t) },
    late:  treCanGQ
      ? { label: daGiaiQuyet(t) ? '↥ Nộp lại sản phẩm' : '↥ Giải quyết · nộp sản phẩm',
          run: () => openDone(t, 'giai-quyet') }
      : { label: '✓ Hoàn thành', run: () => openDone(t) },
    redo:  { label: '↻ Nộp lại',    run: () => openDone(t) },
    daNop: treCanGQ
      ? { label: '↥ Nộp lại sản phẩm', run: () => openDone(t, 'giai-quyet') }
      : { label: '✓ Nghiệm thu · đóng việc', run: () => openDone(t) },
  }[lane];

  if (primary) {
    const b = el('button', 'btn btn-primary', primary.label);
    b.onclick = primary.run;
    acts.appendChild(b);
    const a = el('button', 'btn', 'Yêu cầu điều chỉnh');
    a.onclick = () => openAdjust(t);
    acts.appendChild(a);
  } else {
    const b = el('button', 'btn', 'Xem chi tiết');
    b.onclick = () => openDrawer(t);
    acts.appendChild(b);
  }
  c.appendChild(acts);
  return c;
}

/* =======================  hành động luồng  ======================= */
async function startTask(t) {
  try {
    await req('/api/tasks/' + t.id + '/start', { method: 'POST' });
    const local = S.tasks.find((x) => x.id === t.id);
    if (local) local.status = 'Đang tiến hành';
    toast('Đã chuyển "' + (t.title || '').slice(0, 40) + '" sang Đang tiến hành');
    render();
  } catch (e) {
    toast('Lỗi: ' + e.message, true);
  }
}

/* --- modal Hoàn thành --- */
function openDone(t, kieu) {
  S.doneKieu = kieu === 'giai-quyet' ? 'giai-quyet' : 'complete';
  S.modalTask = t;
  $('#doneTaskName').textContent = t.title || '(chưa có tên)';
  $('#doneLink').value = t.link || '';
  $('#doneNote').value = '';
  $('#doneFile').value = '';
  $('#doneMsg').textContent = '';

  /* Liệt kê cả hai ô nhưng ghi rõ tệp nào từ đâu — và tệp chọn ở đây luôn vào
   * ô "File kết quả", không đứng lẫn với tài liệu người order gửi kèm. */
  const att = t.attachment || [];
  const kq = t.fileKetQua || [];
  const list = $('#doneAttList');
  list.innerHTML = '';
  for (const a of kq) list.appendChild(el('span', 'md-file', (a.name || 'tệp')));
  for (const a of att) list.appendChild(el('span', 'md-file mo', (a.name || 'tệp') + ' · tài liệu kèm'));
  $('#doneFileLabel').textContent = 'Chọn file kết quả để nộp';

  const co = $('#doneCallout');
  if (hasProof(t)) {
    const phan = [];
    if (kq.length) phan.push(kq.length + ' file kết quả');
    if (att.length) phan.push(att.length + ' tệp kèm yêu cầu');
    if (t.link) phan.push('có link');
    co.className = 'md-proof ok';
    co.textContent = 'Đã có minh chứng: ' + phan.join(' · ');
  } else {
    co.className = 'md-proof warn';
    co.textContent = 'Cần dán link hoặc đính tệp sản phẩm trước khi hoàn thành.';
  }
  openModal('mDone');
}

async function submitDone() {
  const t = S.modalTask;
  if (!t) return;
  const btn = $('#doneSubmit');
  const msg = $('#doneMsg');
  btn.disabled = true;
  try {
    const files = [...($('#doneFile').files || [])];
    for (let i = 0; i < files.length; i++) {
      msg.textContent = 'Đang tải tệp ' + (i + 1) + '/' + files.length + '…';
      const r = await fetch('/api/tasks/' + t.id + '/upload?cot=ket-qua', {
        method: 'POST',
        headers: { 'X-File-Name': encodeURIComponent(files[i].name) },
        body: files[i],
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || 'Tải tệp thất bại');
    }

    msg.textContent = 'Đang cập nhật trạng thái…';
    const link = $('#doneLink').value.trim();
    const note = $('#doneNote').value.trim();
    const laGQ = S.doneKieu === 'giai-quyet';
    await req('/api/tasks/' + t.id + '/' + (laGQ ? 'giai-quyet' : 'complete'), {
      method: 'POST',
      body: JSON.stringify({ link: link || undefined, note: note || undefined }),
    });

    closeModal('mDone');
    toast(laGQ
      ? 'Đã nộp sản phẩm. Việc rời khỏi danh sách quá hạn, nhưng trạng thái trễ được giữ lại.'
      : 'Đã hoàn thành. Hệ thống sẽ gửi thẻ chấm điểm cho người order.');
    await refresh(true);
  } catch (e) {
    msg.textContent = '';
    if (e.code === 'PROOF_REQUIRED') {
      toast(e.hint || e.message, true);
      const co = $('#doneCallout');
      co.className = 'callout warn';
      co.textContent = e.hint || e.message;
    } else {
      toast('Lỗi: ' + e.message, true);
    }
  } finally {
    btn.disabled = false;
  }
}

/* --- modal Yêu cầu điều chỉnh --- */
function openAdjust(t) {
  S.modalTask = t;
  $('#adjTaskName').textContent = t.title || '(chưa có tên)';
  $('#adjProposal').value = '';
  $('#adjReason').value = '';
  $('#adjMsg').textContent = '';

  const box = $('#adjParts');
  box.innerHTML = '';
  const parts = S.meta.requestParts && S.meta.requestParts.length
    ? S.meta.requestParts
    : ['Deadline', 'Chi tiết', 'Công việc', 'Người order', 'Phụ trách chính', 'Độ ưu tiên'];
  const cur = new Set();
  for (const p of parts) {
    const c = el('div', 'chip', p);
    c.onclick = () => {
      if (cur.has(p)) cur.delete(p); else cur.add(p);
      c.classList.toggle('on');
    };
    box.appendChild(c);
  }
  box._selected = cur;
  openModal('mAdjust');
}

async function submitAdjust() {
  const t = S.modalTask;
  if (!t) return;
  const btn = $('#adjSubmit');
  const msg = $('#adjMsg');
  const parts = [...($('#adjParts')._selected || [])];
  const proposal = $('#adjProposal').value.trim();

  if (!parts.length) { msg.textContent = 'Chọn ít nhất một thông tin cần sửa.'; return; }
  if (!proposal) { msg.textContent = 'Nhập nội dung điều chỉnh đề xuất.'; return; }

  btn.disabled = true;
  msg.textContent = 'Đang gửi…';
  try {
    await req('/api/requests', {
      method: 'POST',
      body: JSON.stringify({
        taskId: t.id,
        taskTitle: t.title,
        parts,
        proposal,
        reason: $('#adjReason').value.trim(),
        senderId: S.who && S.who.id,
      }),
    });
    closeModal('mAdjust');
    toast('Đã gửi yêu cầu điều chỉnh. Chờ Admin xử lý rồi hãy bắt đầu làm.');
  } catch (e) {
    msg.textContent = '';
    toast('Lỗi: ' + e.message, true);
  } finally {
    btn.disabled = false;
  }
}

/* --- modal Phân quyền --- */
async function openQuyen() {
  $('#quyenMsg').textContent = 'Đang tải…';
  $('#quyenSearch').value = '';
  openModal('mQuyen');
  try {
    const d = await req('/api/managers');
    S.quyen = { me: d.me, chon: new Set(d.managers), people: d.people };
    renderQuyen();
    $('#quyenMsg').textContent = '';
  } catch (e) {
    $('#quyenMsg').textContent = 'Lỗi: ' + e.message;
  }
}

function renderQuyen() {
  const box = $('#quyenList');
  box.innerHTML = '';
  const q = $('#quyenSearch').value.trim().toLowerCase();
  const { chon, me } = S.quyen;

  const list = S.quyen.people
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => (chon.has(b.id) - chon.has(a.id)) || a.name.localeCompare(b.name, 'vi'));

  for (const p of list) {
    const row = el('label', 'quyen-row');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = chon.has(p.id);
    const laToi = me && p.id === me.id;
    if (laToi) { cb.disabled = true; row.classList.add('is-me'); }
    cb.onchange = () => {
      if (cb.checked) chon.add(p.id); else chon.delete(p.id);
      $('#quyenMsg').textContent = chon.size + ' quản lý';
    };
    row.appendChild(cb);

    const info = el('div', 'quyen-info');
    info.appendChild(el('div', 'quyen-name', p.name + (laToi ? '  (bạn)' : '')));
    info.appendChild(el('div', 'quyen-sub', p.soViec + ' việc phụ trách · ' + p.id));
    row.appendChild(info);

    row.appendChild(el('span', 'quyen-tag' + (chon.has(p.id) ? ' on' : ''),
      chon.has(p.id) ? 'Quản lý' : 'Nhân sự'));
    box.appendChild(row);
  }
  if (!list.length) box.appendChild(el('div', 'lane-empty', 'Không tìm thấy ai.'));
}

async function saveQuyen() {
  const btn = $('#quyenSave');
  btn.disabled = true;
  try {
    const ids = [...S.quyen.chon];
    const d = await req('/api/managers', { method: 'POST', body: JSON.stringify({ ids }) });
    closeModal('mQuyen');
    toast('Đã lưu: ' + d.managers.length + ' quản lý. Người bị đổi quyền cần tải lại trang.');
    await refresh(true);
  } catch (e) {
    $('#quyenMsg').textContent = 'Lỗi: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

/* Báo lớp vỏ Marketing Hub biết app con đang mở cửa sổ, để nó tối luôn panel bên
 * ngoài — không thì lớp phủ chỉ tối được vùng trong khung nhúng. Chạy ngoài Hub
 * thì __HUB__ không tồn tại và câu này không làm gì. */
function baoChe(mo) {
  try { if (window.__HUB__ && window.__HUB__.che) window.__HUB__.che(mo); } catch (_) {}
}

function openModal(id) {
  $('#' + id).classList.add('open');
  baoChe(true);
}
function closeModal(id) {
  $('#' + id).classList.remove('open');
  S.modalTask = null;
  // còn cửa sổ nào khác đang mở thì giữ nguyên nền tối
  if (!document.querySelector('.modal.open') && !$('#drawer').classList.contains('open')) baoChe(false);
}

/* =======================  LỊCH  ======================= */

/** Màu theo tình trạng, dùng chung cho cả hai chế độ lịch. */
function calClass(t) {
  if (t.status === 'Hoàn thành') return 'c-done';
  if (t.status === 'Hủy') return 'c-cancel';
  const d = daysLeft(t.deadline);
  if (t.status === 'Trễ deadline' || (d != null && d < 0)) return 'c-late';
  if (d === 0) return 'c-today';
  if (t.status === 'Đang tiến hành' || t.status === 'Làm lại') return 'c-doing';
  return 'c-new';
}

/** Việc lọt vào lịch sau khi áp bộ lọc riêng của tab. */
function calTasks() {
  const f = S.cf;
  const q = (f.q || '').trim().toLowerCase();
  return S.tasks.filter((t) => {
    if (f.openOnly && isClosed(t)) return false;
    if (f.campaign && t.campaign !== f.campaign) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.person && !(t.owner || []).some((u) => u.id === f.person)) return false;
    if (q) {
      const hay = [t.title, t.detail, t.workType, t.campaign]
        .concat((t.owner || []).map((u) => u.name)).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const dayKey = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const pad2 = (n) => String(n).padStart(2, '0');

/** ----- chế độ Tháng: việc xếp vào ngày deadline ----- */
function renderCalMonth(box, list) {
  const moc = S.cf.moc;
  const dauThang = new Date(moc.getFullYear(), moc.getMonth(), 1);
  const dau = weekStart(dauThang);

  const theoNgay = new Map();
  for (const t of list) {
    const d = parseDate(t.deadline);
    if (!d) continue;
    const k = dayKey(startOfDay(d));
    if (!theoNgay.has(k)) theoNgay.set(k, []);
    theoNgay.get(k).push(t);
  }

  const grid = el('div', 'cal-grid');
  for (const ten of ['Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7', 'CN']) {
    grid.appendChild(el('div', 'cal-dow', ten));
  }

  const homNay = dayKey(startOfDay(new Date()));
  for (let i = 0; i < 42; i++) {
    const ngay = new Date(dau);
    ngay.setDate(dau.getDate() + i);
    const k = dayKey(ngay);
    const khacThang = ngay.getMonth() !== moc.getMonth();

    const o = el('div', 'cal-cell' + (khacThang ? ' mo' : '') + (k === homNay ? ' nay' : ''));
    const head = el('div', 'cal-day');
    head.appendChild(el('span', 'cal-num' + (k === homNay ? ' hom-nay' : ''), String(ngay.getDate())));
    o.appendChild(head);

    const viec = theoNgay.get(k) || [];
    const ds = laneSort(viec);
    const gioiHan = S.cf.moRong[k] ? ds.length : 3;

    for (const t of ds.slice(0, gioiHan)) {
      const chip = el('div', 'cal-chip ' + calClass(t) + (khacThang ? ' mo' : ''));
      chip.appendChild(el('span', 'cal-chip-t', t.title || '(chưa có tên)'));
      chip.title = (t.title || '') +
        ((t.owner || []).length ? '\n' + t.owner.map((u) => u.name).join(', ') : '') +
        '\nBắt đầu: ' + (fmtDate(t.startAt) || '—') +
        '\nHạn: ' + (fmtDate(t.deadline) || '—') +
        '\nTrạng thái: ' + (t.status || '—');
      chip.onclick = () => openDrawer(t);
      o.appendChild(chip);
    }
    if (ds.length > gioiHan) {
      const m = el('div', 'cal-more', '+' + (ds.length - gioiHan) + ' việc nữa');
      m.onclick = () => { S.cf.moRong[k] = true; renderCalendar(); };
      o.appendChild(m);
    } else if (S.cf.moRong[k] && ds.length > 3) {
      const m = el('div', 'cal-more', 'Thu gọn');
      m.onclick = () => { delete S.cf.moRong[k]; renderCalendar(); };
      o.appendChild(m);
    }
    grid.appendChild(o);
  }
  box.appendChild(grid);
}

/** ----- chế độ Dòng thời gian: thanh từ ngày bắt đầu đến deadline ----- */
function renderCalLine(box, list) {
  const moc = S.cf.moc;
  const dau = startOfDay(new Date(moc.getFullYear(), moc.getMonth(), 1));
  const cuoi = startOfDay(new Date(moc.getFullYear(), moc.getMonth() + 1, 0));
  const soNgay = Math.round((cuoi - dau) / 86400000) + 1;

  // chỉ lấy việc có giao với khoảng đang xem
  const trong = list.filter((t) => {
    const s = parseDate(t.startAt), e = parseDate(t.deadline);
    if (!s && !e) return false;
    const a = startOfDay(s || e), b = startOfDay(e || s);
    return b >= dau && a <= cuoi;
  });

  if (!trong.length) {
    box.appendChild(el('div', 'queue-empty', 'Không có việc nào trong khoảng này.'));
    return;
  }

  // nhóm theo người phụ trách
  const nhom = new Map();
  for (const t of trong) {
    const os = t.owner || [];
    const key = os.length ? os[0].id : '__none';
    const ten = os.length ? os.map((u) => u.name).join(', ') : 'Chưa phân công';
    if (!nhom.has(key)) nhom.set(key, { ten, items: [] });
    nhom.get(key).items.push(t);
  }
  const ds = [...nhom.values()].sort((a, b) => b.items.length - a.items.length);

  const wrap = el('div', 'tl');
  wrap.style.setProperty('--ngay', String(soNgay));

  // thanh ngày
  const head = el('div', 'tl-head');
  head.appendChild(el('div', 'tl-name', 'Nhân sự'));
  const cols = el('div', 'tl-cols');
  const homNay = startOfDay(new Date());
  for (let i = 0; i < soNgay; i++) {
    const d = new Date(dau); d.setDate(dau.getDate() + i);
    const cuoiTuan = d.getDay() === 0 || d.getDay() === 6;
    const c = el('div', 'tl-col' + (cuoiTuan ? ' ct' : '') +
      (d.getTime() === homNay.getTime() ? ' nay' : ''), String(d.getDate()));
    cols.appendChild(c);
  }
  head.appendChild(cols);
  wrap.appendChild(head);

  for (const g of ds) {
    const row = el('div', 'tl-row');
    const nameCell = el('div', 'tl-name');
    const av = el('span', 'av av-sm', initials(g.ten));
    av.style.background = colorOf(g.ten);
    nameCell.appendChild(av);
    nameCell.appendChild(el('span', 'tl-nm', g.ten));
    nameCell.appendChild(el('span', 'tl-n', String(g.items.length)));
    row.appendChild(nameCell);

    const lane = el('div', 'tl-lane');
    // nền cuối tuần + vạch hôm nay
    for (let i = 0; i < soNgay; i++) {
      const d = new Date(dau); d.setDate(dau.getDate() + i);
      const cuoiTuan = d.getDay() === 0 || d.getDay() === 6;
      lane.appendChild(el('div', 'tl-bg' + (cuoiTuan ? ' ct' : '') +
        (d.getTime() === homNay.getTime() ? ' nay' : '')));
    }

    const bars = el('div', 'tl-bars');
    for (const t of laneSort(g.items)) {
      const s = parseDate(t.startAt), e = parseDate(t.deadline);
      const a = startOfDay(s || e), b = startOfDay(e || s);
      const tu = Math.max(0, Math.round((a - dau) / 86400000));
      const den = Math.min(soNgay - 1, Math.round((b - dau) / 86400000));
      const bar = el('div', 'tl-bar ' + calClass(t));
      bar.style.gridColumn = (tu + 1) + ' / ' + (den + 2);
      bar.appendChild(el('span', '', t.title || '(chưa có tên)'));
      bar.title = (t.title || '') +
        '\nBắt đầu: ' + (fmtDate(t.startAt) || '—') +
        '\nHạn: ' + (fmtDate(t.deadline) || '—') +
        '\nTrạng thái: ' + (t.status || '—');
      bar.onclick = () => openDrawer(t);
      bars.appendChild(bar);
    }
    lane.appendChild(bars);
    row.appendChild(lane);
    wrap.appendChild(row);
  }
  box.appendChild(wrap);
}

function renderCalendar() {
  const box = $('#calBody');
  box.innerHTML = '';
  const list = calTasks();
  const moc = S.cf.moc;

  $('#calTitle').textContent = 'Tháng ' + (moc.getMonth() + 1) + ' / ' + moc.getFullYear();
  $('#calPersonHost').classList.toggle('hidden', !S.isManager);

  if (S.cf.mode === 'line') renderCalLine(box, list);
  else renderCalMonth(box, list);

  const trongThang = list.filter((t) => {
    const d = parseDate(t.deadline);
    return d && d.getMonth() === moc.getMonth() && d.getFullYear() === moc.getFullYear();
  }).length;
  $('#calCount').textContent = trongThang + ' việc có hạn trong tháng · ' + list.length + ' việc đang xét';
}

/* =======================  TỔNG QUAN (quản lý)  ======================= */

const dueActive = (f) => !!f.due && !(f.due === 'exact' && !f.dueDate);
const dashFiltered = () => !!(S.df.campaign || S.df.person || dueActive(S.df));

/** Áp bộ lọc của trang Tổng quan. Nhân sự = Phụ trách chính. */
function dashScope() {
  const f = S.df;
  return S.tasks.filter((t) => {
    if (f.campaign && t.campaign !== f.campaign) return false;
    if (f.person && !(t.owner || []).some((u) => u.id === f.person)) return false;
    if (f.due && !matchDue(t, f.due, f.dueDate)) return false;
    return true;
  });
}

/** Các tập việc dùng chung cho bảng điều hành. */
function dashSets() {
  const all = dashScope();
  const open = all.filter((t) => !isClosed(t));
  return {
    all,
    open,
    unassigned: open.filter((t) => !(t.owner || []).length),
    overdue: open.filter(isOverdue),
    noDeadline: open.filter((t) => !t.deadline),
    doing: open.filter((t) => t.status === 'Đang tiến hành' || t.status === 'Làm lại'),
    awaitingScore: all.filter((t) => t.status === 'Hoàn thành' && !t.rating),
    scored: all.filter((t) => t.rating),
  };
}

function kpiCard(n, label, sub, tone, onClick) {
  const c = el('div', 'kpi' + (tone ? ' kpi-' + tone : '') + (onClick ? ' is-link' : ''));
  c.appendChild(el('div', 'kpi-n', String(n)));
  c.appendChild(el('div', 'kpi-label', label));
  if (sub) c.appendChild(el('div', 'kpi-sub', sub));
  if (onClick) c.onclick = onClick;
  return c;
}

function renderKpi(D) {
  const box = $('#kpiRow');
  box.innerHTML = '';
  const diem = D.scored.length
    ? (D.scored.reduce((s, t) => s + t.rating, 0) / D.scored.length).toFixed(2)
    : '—';
  const dungHan = D.all.filter((t) => t.status === 'Hoàn thành').length;
  const tyLe = D.all.length ? Math.round(dungHan / D.all.length * 100) : 0;

  box.appendChild(kpiCard(D.all.length, 'Tổng công việc',
    dashFiltered() ? D.open.length + ' việc đang mở · đã lọc' : D.open.length + ' việc đang mở'));
  box.appendChild(kpiCard(D.doing.length, 'Đang tiến hành', '', 'hot',
    () => scrollToQueue('doing')));
  box.appendChild(kpiCard(D.unassigned.length, 'Chưa phân công', '', 'alert',
    () => scrollToQueue('unassigned')));
  box.appendChild(kpiCard(D.overdue.length, 'Quá hạn', '', 'alert',
    () => scrollToQueue('overdue')));
  box.appendChild(kpiCard(diem, 'Điểm trung bình', D.scored.length + ' việc đã chấm', 'ok'));
  box.appendChild(kpiCard(tyLe + '%', 'Tỉ lệ hoàn thành', dungHan + ' / ' + D.all.length));
}

function scrollToQueue(key) {
  const n = document.querySelector('.queue[data-q="' + key + '"]');
  if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Một hàng đợi: tiêu đề + danh sách việc + nút hành động từng dòng. */
function queueBlock(key, title, items, tone, hint, actionLabel, onAction) {
  const box = el('div', 'queue queue-' + tone);
  box.dataset.q = key;

  const head = el('div', 'queue-head');
  head.appendChild(el('strong', '', title));
  head.appendChild(el('span', 'queue-n', String(items.length)));
  box.appendChild(head);
  if (hint) box.appendChild(el('div', 'queue-hint', hint));

  const list = el('div', 'queue-list');
  if (!items.length) {
    list.appendChild(el('div', 'queue-empty',
      dashFiltered() ? 'Không có việc nào khớp bộ lọc.' : 'Không còn việc nào. Tốt.'));
  }

  for (const t of laneSort(items).slice(0, 60)) {
    const row = el('div', 'queue-row');
    const main = el('div', 'queue-main');
    const ttl = el('div', 'queue-title', t.title || '(chưa có tên)');
    ttl.onclick = () => openDrawer(t);
    main.appendChild(ttl);

    const meta = el('div', 'queue-meta');
    if (t.priority) meta.appendChild(el('span', 'tag ' + priClass(t.priority), plainLabel(t.priority)));
    if (t.workType) meta.appendChild(el('span', 'tag', t.workType));
    const dl = deadlineTag(t);
    if (dl) meta.appendChild(dl);
    else meta.appendChild(el('span', 'tag due', 'Chưa có deadline'));
    if ((t.owner || []).length) meta.appendChild(el('span', 'tag', t.owner.map((u) => u.name).join(', ')));
    else if ((t.requester || []).length) meta.appendChild(el('span', 'tag', 'Order: ' + t.requester[0].name));
    main.appendChild(meta);
    row.appendChild(main);

    const b = el('button', 'btn', actionLabel);
    b.onclick = () => onAction(t);
    row.appendChild(b);
    list.appendChild(row);
  }
  if (items.length > 60) {
    list.appendChild(el('div', 'queue-empty', 'Còn ' + (items.length - 60) + ' việc nữa — xem ở tab Bảng.'));
  }
  box.appendChild(list);
  return box;
}

function renderQueues(D) {
  const box = $('#queues');
  box.innerHTML = '';
  box.appendChild(queueBlock('unassigned', 'Chưa phân công', D.unassigned, 'alert',
    '',
    'Phân công', openAssign));
  box.appendChild(queueBlock('overdue', 'Quá hạn', D.overdue, 'alert',
    '',
    'Xử lý', openAssign));
  box.appendChild(queueBlock('noDeadline', 'Thiếu deadline', D.noDeadline, 'warn',
    '',
    'Đặt hạn', openAssign));
}

/** Toàn cảnh việc đang chạy — nhóm theo người phụ trách. */
function renderDoing(D) {
  const box = $('#doingBoard');
  box.innerHTML = '';

  const nhom = new Map();
  for (const t of D.doing) {
    const owners = (t.owner || []);
    const key = owners.length ? owners.map((u) => u.id).join(',') : '__none';
    if (!nhom.has(key)) nhom.set(key, { ten: owners.length ? owners.map((u) => u.name).join(', ') : 'Chưa phân công', items: [] });
    nhom.get(key).items.push(t);
  }

  if (!nhom.size) {
    box.appendChild(el('div', 'queue-empty',
      dashFiltered() ? 'Không có việc nào khớp bộ lọc.' : 'Không có việc nào đang chạy.'));
    return;
  }

  const ds = [...nhom.values()].sort((a, b) => {
    const tre = (g) => g.items.filter((t) => isOverdue(t) || t.status === 'Trễ deadline').length;
    return (tre(b) - tre(a)) || (b.items.length - a.items.length);
  });

  for (const g of ds) {
    const cot = el('div', 'dcol');
    const tre = g.items.filter((t) => isOverdue(t)).length;

    const head = el('div', 'dcol-head');
    const av = el('span', 'av av-sm', initials(g.ten));
    av.style.background = colorOf(g.ten);
    head.appendChild(av);
    head.appendChild(el('span', 'dcol-name', g.ten));
    head.appendChild(el('span', 'dcol-n', String(g.items.length)));
    if (tre) head.appendChild(el('span', 'dcol-late', tre + ' trễ'));
    cot.appendChild(head);

    const list = el('div', 'dcol-list');
    for (const t of laneSort(g.items)) {
      const row = el('div', 'dcard' + (isOverdue(t) ? ' late' : ''));
      const ttl = el('div', 'dcard-title', t.title || '(chưa có tên)');
      ttl.onclick = () => openDrawer(t);
      row.appendChild(ttl);

      const meta = el('div', 'dcard-meta');
      if (t.priority) meta.appendChild(el('span', 'tag ' + priClass(t.priority), plainLabel(t.priority)));
      const dl = deadlineTag(t);
      if (dl) meta.appendChild(dl);
      if (t.status === 'Làm lại') meta.appendChild(el('span', 'tag p-mid', 'Làm lại'));
      meta.appendChild(el('span', 'proofdot ' + (hasProof(t) ? 'has' : 'missing'),
        hasProof(t) ? 'có kết quả' : 'chưa có'));
      row.appendChild(meta);
      list.appendChild(row);
    }
    cot.appendChild(list);
    box.appendChild(cot);
  }
}

/** Bảng tải việc theo nhân sự. */
function renderWorkload(D) {
  const box = $('#workload');
  box.innerHTML = '';

  // Lấy từ chính dữ liệu công việc — báo cáo phải phản ánh thực tế, kể cả
  // người không còn quyền dùng app nhưng vẫn đang đứng tên việc.
  const coViec = new Map();
  for (const t of D.all) {
    for (const u of (t.owner || [])) if (u && u.id && !coViec.has(u.id)) coViec.set(u.id, u);
  }
  // Lọc theo một nhân sự thì chỉ hiện đúng người đó — việc có nhiều người
  // đồng phụ trách sẽ kéo theo cả đồng nghiệp, gây nhiễu.
  const nguon = S.df.person
    ? [...coViec.values()].filter((p) => p.id === S.df.person)
    : [...coViec.values()];

  const rows = nguon.map((p) => {
    const mine = D.all.filter((t) => (t.owner || []).some((u) => u.id === p.id));
    const open = mine.filter((t) => !isClosed(t));
    const scored = mine.filter((t) => t.rating);
    return {
      id: p.id,
      name: p.name,
      doing: open.filter((t) => t.status === 'Đang tiến hành').length,
      late: open.filter((t) => isOverdue(t) || t.status === 'Trễ deadline').length,
      redo: open.filter((t) => t.status === 'Làm lại').length,
      open: open.length,
      wait: mine.filter((t) => t.status === 'Hoàn thành' && !t.rating).length,
      done: mine.filter((t) => t.status === 'Hoàn thành').length,
      diem: scored.length ? scored.reduce((s, t) => s + t.rating, 0) / scored.length : null,
      soCham: scored.length,
    };
  }).filter((r) => r.open > 0 || r.done > 0);

  const COL = [
    { k: 'name', t: 'Nhân sự', align: 'left' },
    { k: 'open', t: 'Đang mở' },
    { k: 'doing', t: 'Đang làm' },
    { k: 'late', t: 'Trễ' },
    { k: 'redo', t: 'Làm lại' },
    { k: 'wait', t: 'Chờ chấm' },
    { k: 'done', t: 'Hoàn thành' },
    { k: 'diem', t: 'Điểm TB' },
  ];

  const sk = S.wlSort.key, sd = S.wlSort.dir;
  rows.sort((a, b) => {
    let x = a[sk], y = b[sk];
    if (sk === 'name') return x.localeCompare(y, 'vi') * (sd === 'asc' ? 1 : -1);
    x = x == null ? -1 : x; y = y == null ? -1 : y;
    return (x - y) * (sd === 'asc' ? 1 : -1);
  });

  const maxOpen = Math.max(1, ...rows.map((r) => r.open));

  const table = el('table', 'wl-table');
  const thead = el('thead');
  const trh = el('tr');
  for (const c of COL) {
    const th = el('th', c.align === 'left' ? '' : 'num');
    th.textContent = c.t + (sk === c.k ? (sd === 'asc' ? ' ↑' : ' ↓') : '');
    th.onclick = () => {
      if (S.wlSort.key === c.k) S.wlSort.dir = S.wlSort.dir === 'asc' ? 'desc' : 'asc';
      else S.wlSort = { key: c.k, dir: c.k === 'name' ? 'asc' : 'desc' };
      renderWorkload(D);
    };
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tb = el('tbody');
  for (const r of rows) {
    const tr = el('tr');

    const tdN = el('td', 'wl-name');
    const av = el('span', 'av av-sm', initials(r.name));
    av.style.background = colorOf(r.name);
    tdN.appendChild(av);
    tdN.appendChild(el('span', '', r.name));
    tr.appendChild(tdN);

    // Đang mở: số + thanh tải
    const tdO = el('td', 'num');
    const wrap = el('div', 'wl-bar-wrap');
    const bar = el('div', 'wl-bar');
    bar.style.width = Math.round(r.open / maxOpen * 100) + '%';
    if (r.late > 0) bar.classList.add('has-late');
    wrap.appendChild(bar);
    tdO.appendChild(el('span', 'wl-num', String(r.open)));
    tdO.appendChild(wrap);
    tr.appendChild(tdO);

    tr.appendChild(el('td', 'num', String(r.doing)));
    const tdL = el('td', 'num' + (r.late ? ' is-alert' : ''), String(r.late));
    tr.appendChild(tdL);
    tr.appendChild(el('td', 'num' + (r.redo ? ' is-warn' : ''), String(r.redo)));
    tr.appendChild(el('td', 'num', String(r.wait)));
    tr.appendChild(el('td', 'num', String(r.done)));

    const tdD = el('td', 'num');
    if (r.diem == null) tdD.appendChild(el('span', 'muted', '—'));
    else {
      tdD.appendChild(el('span', 'wl-score', r.diem.toFixed(2)));
      tdD.appendChild(el('span', 'wl-cnt', ' /' + r.soCham));
    }
    tr.appendChild(tdD);
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  box.appendChild(table);

  if (!rows.length) box.appendChild(el('div', 'queue-empty', 'Chưa có dữ liệu.'));
}

/** Thanh phân bổ theo một trường. */
function renderBars(sel, items, key) {
  const box = $(sel);
  box.innerHTML = '';
  const m = new Map();
  for (const t of items) {
    const k = t[key] || '(chưa điền)';
    m.set(k, (m.get(k) || 0) + 1);
  }
  const rows = [...m.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));

  for (const [label, n] of rows) {
    const row = el('div', 'bar-row');
    row.appendChild(el('span', 'bar-label', label));
    const track = el('span', 'bar-track');
    const fill = el('span', 'bar-fill');
    fill.style.width = Math.round(n / max * 100) + '%';
    if (label === '(chưa điền)') fill.classList.add('is-empty');
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', 'bar-n', String(n)));
    box.appendChild(row);
  }
  if (!rows.length) box.appendChild(el('div', 'queue-empty', 'Không có dữ liệu.'));
}

function renderDashboard() {
  const D = dashSets();
  renderKpi(D);
  renderQueues(D);
  renderDoing(D);
  renderWorkload(D);
  renderBars('#distType', D.open, 'workType');
  renderBars('#distCampaign', D.open, 'campaign');

  // nhãn phạm vi: cho biết con số đang tính trên tập nào
  const scope = $('#dScope');
  if (!dashFiltered()) {
    scope.textContent = 'Đang tính trên toàn bộ ' + S.tasks.length + ' việc';
  } else {
    const phan = [];
    if (S.df.person) {
      const p = dsNguoi().find((x) => x.id === S.df.person);
      phan.push(p ? p.name : 'nhân sự');
    }
    if (S.df.campaign) phan.push(S.df.campaign);
    if (S.df.due) {
      const nhan = $('#dDue').selectedOptions[0].textContent;
      phan.push(S.df.due !== 'exact' ? nhan
        : (S.df.dueDate ? nhan + ': ' + fmtDate(S.df.dueDate) : nhan + ': chưa chọn'));
    }
    scope.textContent = D.all.length + ' / ' + S.tasks.length + ' việc  ·  ' + phan.join('  ·  ');
  }
}

/* --- modal Phân công --- */
function openAssign(t) {
  S.modalTask = t;
  const o = S.meta.options;
  $('#assignTaskName').textContent = t.title || '(chưa có tên)';

  const thieu = [];
  if (!(t.owner || []).length) thieu.push('Phụ trách chính');
  if (!t.deadline) thieu.push('Deadline');
  if (!t.workType) thieu.push('Loại công việc');
  const co = $('#assignCallout');
  if (thieu.length) {
    co.className = 'callout warn';
    co.textContent = 'Việc này đang thiếu: ' + thieu.join(' · ') +
      '. Chưa có Phụ trách chính thì nhân sự không thấy việc trong app.';
  } else {
    co.className = 'callout';
    co.textContent = 'Việc đã có đủ thông tin. Sửa lại phần cần đổi rồi lưu.';
  }

  const ownerBox = $('#assignOwner');
  ownerBox.innerHTML = '';
  S.assignPick = (t.owner || []).slice();
  ownerBox.appendChild(peopleDropdown(t.owner, (v) => { S.assignPick = v; }, 'Chọn người phụ trách…'));

  $('#assignDeadline').value = toLocalInput(t.deadline1 || t.deadline2);
  fillNativeSelect($('#assignPriority'), o.priority, t.priority, '— Ưu tiên —');
  fillNativeSelect($('#assignType'), o.workType, t.workType, '— Loại việc —');
  fillNativeSelect($('#assignCampaign'), o.campaign, t.campaign, '— Campain —');
  $('#assignMsg').textContent = '';
  openModal('mAssign');
}

function fillNativeSelect(sel, options, value, placeholder) {
  sel.innerHTML = '';
  const p = el('option', '', placeholder);
  p.value = '';
  sel.appendChild(p);
  for (const o of options || []) {
    const op = el('option', '', o);
    op.value = o;
    if (value === o) op.selected = true;
    sel.appendChild(op);
  }
}

async function submitAssign() {
  const t = S.modalTask;
  if (!t) return;
  const btn = $('#assignSubmit');
  const msg = $('#assignMsg');

  const patch = {};
  if ((S.assignPick || []).length) patch.owner = S.assignPick;
  const dl = $('#assignDeadline').value;
  if (dl) patch.deadline1 = dl;
  const pri = $('#assignPriority').value;
  if (pri) patch.priority = pri;
  const wt = $('#assignType').value;
  if (wt) patch.workType = wt;
  const cp = $('#assignCampaign').value;
  if (cp) patch.campaign = cp;

  if (!Object.keys(patch).length) { msg.textContent = 'Chưa thay đổi gì.'; return; }

  btn.disabled = true;
  msg.textContent = 'Đang lưu…';
  try {
    await req('/api/tasks/' + t.id, { method: 'PATCH', body: JSON.stringify(patch) });
    const local = S.tasks.find((x) => x.id === t.id);
    if (local) {
      Object.assign(local, patch);
      local.deadline = local.deadline1 || local.deadline2 || null;
    }
    closeModal('mAssign');
    toast(patch.owner
      ? 'Đã phân công cho ' + patch.owner.map((u) => u.name).join(', ')
      : 'Đã cập nhật công việc');
    render();
  } catch (e) {
    msg.textContent = '';
    toast('Lỗi: ' + e.message, true);
  } finally {
    btn.disabled = false;
  }
}

/* =======================  render: stats (admin) ======================= */
function renderStats() {
  const box = $('#stats');
  box.innerHTML = '';
  // Đếm trên tập ĐÃ lọc, chỉ bỏ qua đúng hai chiều mà chính các thẻ này bật/tắt
  // (trạng thái và điều kiện phụ) — nhờ vậy bấm thẻ nào ra đúng con số ghi trên thẻ.
  const all = visibleTasks(['status', 'moc']);
  const open = all.filter((t) => !isClosed(t));
  const cards = [
    { k: '', label: 'Tổng công việc', n: all.length, cls: '' },
    { k: 'Đang tiến hành', label: 'Đang tiến hành', n: all.filter((t) => t.status === 'Đang tiến hành').length, cls: '' },
    { k: 'Chờ tiếp nhận', label: 'Chờ tiếp nhận', n: all.filter((t) => t.status === 'Chờ tiếp nhận').length, cls: 'warn' },
    { k: '__overdue', label: 'Quá hạn', n: open.filter(isOverdue).length, cls: 'danger' },
    { k: '__today', label: 'Hạn hôm nay', n: open.filter((t) => daysLeft(t.deadline) === 0).length, cls: 'warn' },
    { k: 'Hoàn thành', label: 'Hoàn thành', n: all.filter((t) => t.status === 'Hoàn thành').length, cls: 'ok' },
  ];

  for (const c of cards) {
    const n = el('div', 'stat ' + c.cls);
    n.appendChild(el('b', '', String(c.n)));
    n.appendChild(el('span', '', c.label));
    const active =
      (c.k === '__overdue' && S.filters.moc === 'overdue') ||
      (c.k === '__today' && S.filters.moc === 'today') ||
      (c.k && !c.k.startsWith('__') && S.filters.status === c.k);
    if (active) n.classList.add('is-active');
    n.onclick = () => {
      // Quá hạn / Hạn hôm nay ghép THÊM vào mốc thời gian đang chọn, không xoá nó —
      // trước đây bấm vào là mốc "Tháng này" bị thay mất nên việc cũ hiện lại.
      if (c.k === '__overdue') S.filters.moc = S.filters.moc === 'overdue' ? '' : 'overdue';
      else if (c.k === '__today') S.filters.moc = S.filters.moc === 'today' ? '' : 'today';
      else S.filters.status = S.filters.status === c.k ? '' : c.k;
      syncFilterInputs();
      render();
    };
    box.appendChild(n);
  }
}

/**
 * Việc hiện ở tab Bảng / Kanban sau khi áp bộ lọc.
 * `boQua` bỏ qua vài chiều khi đếm số trên thẻ thống kê.
 */
function visibleTasks(boQua) {
  const bq = boQua || [];
  const f = S.filters;
  const q = f.q.trim().toLowerCase();
  let list = S.tasks;
  if (f.campaign) list = list.filter((t) => t.campaign === f.campaign);
  if (f.workType) list = list.filter((t) => t.workType === f.workType);
  if (f.priority) list = list.filter((t) => t.priority === f.priority);
  if (f.status && !bq.includes('status')) list = list.filter((t) => t.status === f.status);
  if (f.owner) list = list.filter((t) => (t.owner || []).concat(t.helper || []).some((u) => u.id === f.owner));
  if (f.hideDone) list = list.filter((t) => !isClosed(t));
  if (f.due) list = list.filter((t) => matchDue(t, f.due, f.dueDate));
  // Điều kiện phụ ghép thêm vào mốc thời gian, không thay thế nó
  if (!bq.includes('moc')) {
    if (f.moc === 'overdue') list = list.filter(isOverdue);
    else if (f.moc === 'today') list = list.filter((t) => !isClosed(t) && daysLeft(t.deadline) === 0);
  }
  if (q) {
    list = list.filter((t) =>
      [t.title, t.detail, t.note, t.campaign, t.workType, t.status]
        .concat((t.owner || []).map((u) => u.name), (t.helper || []).map((u) => u.name))
        .join(' ').toLowerCase().includes(q)
    );
  }
  return list;
}

function sortTasks(list) {
  const { key, dir } = S.sort;
  const mul = dir === 'asc' ? 1 : -1;
  const val = (t) => {
    if (key === 'deadline' || key === 'startAt') {
      const d = parseDate(key === 'deadline' ? t.deadline : t.startAt);
      return d ? d.getTime() : (dir === 'asc' ? 8.64e15 : -1);
    }
    if (key === 'owner') return (t.owner || []).map((u) => u.name).join(',');
    if (key === 'rating') return t.rating || 0;
    return String(t[key] || '');
  };
  return list.slice().sort((a, b) => {
    const x = val(a), y = val(b);
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * mul;
    return String(x).localeCompare(String(y), 'vi') * mul;
  });
}

/* =======================  render: board  ======================= */
function renderBoard(list) {
  const board = $('#board');
  board.innerHTML = '';
  const groups = new Map(S.meta.statusOrder.map((s) => [s, []]));
  const other = [];
  for (const t of list) {
    if (groups.has(t.status)) groups.get(t.status).push(t);
    else other.push(t);
  }
  if (other.length) groups.set('Chưa đặt trạng thái', other);

  for (const [status, items] of groups) {
    const col = el('div', 'col');
    col.dataset.status = status;

    const head = el('div', 'col-head');
    const pill = el('span', 'pill');
    pill.style.background = STATUS_HUE[status] || '#8f959e';
    head.appendChild(pill);
    head.appendChild(el('strong', '', status));
    head.appendChild(el('span', 'n', String(items.length)));
    col.appendChild(head);

    const body = el('div', 'col-body');
    if (!items.length) body.appendChild(el('div', 'col-empty', 'Không có công việc'));
    for (const t of sortTasks(items)) body.appendChild(taskCard(t));
    col.appendChild(body);

    if (status !== 'Chưa đặt trạng thái') {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop-active'); });
      col.addEventListener('dragleave', () => col.classList.remove('drop-active'));
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('drop-active');
        const id = e.dataTransfer.getData('text/plain');
        const t = S.tasks.find((x) => x.id === id);
        if (!t || t.status === status) return;
        await patchTask(t, { status }, 'Đã chuyển sang "' + status + '"');
      });
    }
    board.appendChild(col);
  }
}

function taskCard(t) {
  const c = el('div', 'card');
  if (S.selected.has(t.id)) c.classList.add('is-selected');
  c.draggable = true;
  c.dataset.id = t.id;
  c.appendChild(el('div', 'card-title', t.title || '(chưa có tên)'));

  const meta = el('div', 'card-meta');
  if (t.priority) meta.appendChild(el('span', 'tag ' + priClass(t.priority), plainLabel(t.priority)));
  if (t.workType) meta.appendChild(el('span', 'tag', t.workType));
  if (t.campaign) meta.appendChild(el('span', 'tag', t.campaign));
  const dl = deadlineTag(t);
  if (dl) meta.appendChild(dl);

  if ((t.owner || []).length) {
    const av = el('div', 'avatars');
    for (const u of t.owner.slice(0, 3)) {
      const a = el('div', 'av', initials(u.name));
      a.style.background = colorOf(u.name);
      a.title = u.name;
      av.appendChild(a);
    }
    meta.appendChild(av);
  }
  c.appendChild(meta);

  c.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', t.id);
    c.classList.add('dragging');
  });
  c.addEventListener('dragend', () => c.classList.remove('dragging'));
  c.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey) { toggleSelect(t.id); return; }
    openDrawer(t);
  });
  return c;
}

/* =======================  render: table  ======================= */
const COLS = [
  { key: '_check', label: '', sort: false },
  { key: 'title', label: 'Công việc' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'priority', label: 'Ưu tiên' },
  { key: 'owner', label: 'Phụ trách' },
  { key: 'deadline', label: 'Deadline' },
  { key: 'workType', label: 'Loại việc' },
  { key: 'campaign', label: 'Campain' },
  { key: 'rating', label: 'Điểm' },
];

function renderTable(list) {
  const wrap = $('#table');
  wrap.innerHTML = '';
  const table = el('table');
  const thead = el('thead');
  const trh = el('tr');

  for (const c of COLS) {
    const th = el('th', c.sort === false ? 'nosort' : '');
    if (c.key === '_check') {
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = list.length > 0 && list.every((t) => S.selected.has(t.id));
      cb.onchange = () => {
        if (cb.checked) list.forEach((t) => S.selected.add(t.id));
        else list.forEach((t) => S.selected.delete(t.id));
        render();
      };
      th.appendChild(cb);
    } else {
      th.textContent = c.label + (S.sort.key === c.key ? (S.sort.dir === 'asc' ? '  ↑' : '  ↓') : '');
      th.onclick = () => {
        if (S.sort.key === c.key) S.sort.dir = S.sort.dir === 'asc' ? 'desc' : 'asc';
        else S.sort = { key: c.key, dir: 'asc' };
        render();
      };
    }
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tb = el('tbody');
  for (const t of sortTasks(list)) tb.appendChild(tableRow(t));
  table.appendChild(tb);
  wrap.appendChild(table);
}

function inlineSelect(t, key, options) {
  const s = el('select', 'inline-sel');
  s.appendChild(el('option', '', '—'));
  for (const o of options || []) {
    const op = el('option', '', o);
    op.value = o;
    if (t[key] === o) op.selected = true;
    s.appendChild(op);
  }
  s.onchange = async () => {
    const patch = {};
    patch[key] = s.value || null;
    await patchTask(t, patch, 'Đã cập nhật');
  };
  s.onclick = (e) => e.stopPropagation();
  return s;
}

function tableRow(t) {
  const tr = el('tr');
  if (S.selected.has(t.id)) tr.classList.add('is-selected');

  const tdc = el('td', 'c-check');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.checked = S.selected.has(t.id);
  cb.onclick = (e) => e.stopPropagation();
  cb.onchange = () => toggleSelect(t.id);
  tdc.appendChild(cb);
  tr.appendChild(tdc);

  const tdt = el('td', 'c-title', t.title || '(chưa có tên)');
  tdt.onclick = () => openDrawer(t);
  tr.appendChild(tdt);

  const tds = el('td');
  tds.appendChild(inlineSelect(t, 'status', S.meta.options.status));
  tr.appendChild(tds);

  const tdp = el('td');
  tdp.appendChild(inlineSelect(t, 'priority', S.meta.options.priority));
  tr.appendChild(tdp);

  const tdo = el('td');
  if (!(t.owner || []).length) tdo.appendChild(el('span', 'muted', '—'));
  else {
    const av = el('div', 'avatars');
    for (const u of t.owner.slice(0, 3)) {
      const a = el('div', 'av', initials(u.name));
      a.style.background = colorOf(u.name);
      a.title = u.name;
      av.appendChild(a);
    }
    tdo.appendChild(av);
  }
  tr.appendChild(tdo);

  const tdd = el('td');
  const dl = deadlineTag(t);
  tdd.appendChild(dl || el('span', 'muted', '—'));
  tr.appendChild(tdd);

  tr.appendChild(el('td', '', t.workType || '—'));
  tr.appendChild(el('td', '', t.campaign || '—'));

  const tdr = el('td');
  tdr.appendChild(el('span', 'stars', t.rating ? '★'.repeat(t.rating) : '—'));
  tr.appendChild(tdr);
  return tr;
}

/* =======================  drawer  ======================= */
function field(label, node) {
  const f = el('div', 'field');
  f.appendChild(el('label', '', label));
  f.appendChild(node);
  return f;
}

function textInput(value, onChange, type) {
  const i = el('input');
  i.type = type || 'text';
  i.value = value == null ? '' : value;
  i.oninput = () => onChange(i.value);
  return i;
}

function selectInput(value, options, onChange, disabledSet) {
  const s = el('select');
  s.appendChild(el('option', '', '—'));
  for (const o of options || []) {
    const op = el('option', '', o + (disabledSet && disabledSet.includes(o) ? '  (admin)' : ''));
    op.value = o;
    if (disabledSet && disabledSet.includes(o) && value !== o) op.disabled = true;
    if (value === o) op.selected = true;
    s.appendChild(op);
  }
  s.onchange = () => onChange(s.value || null);
  return s;
}

function chipsInput(selected, options, onChange) {
  const box = el('div', 'chips');
  const cur = new Set(selected || []);
  for (const o of options || []) {
    const c = el('div', 'chip' + (cur.has(o) ? ' on' : ''), o);
    c.onclick = () => {
      if (cur.has(o)) cur.delete(o); else cur.add(o);
      c.classList.toggle('on');
      onChange([...cur]);
    };
    box.appendChild(c);
  }
  return box;
}

function onePersonInput(selected, onChange) {
  const cur = (selected || [])[0];
  const s = el('select');
  s.appendChild(el('option', '', '—'));
  for (const p of dsNguoi()) {
    const op = el('option', '', p.name);
    op.value = p.id;
    if (cur && cur.id === p.id) op.selected = true;
    s.appendChild(op);
  }
  s.onchange = () => {
    const p = dsNguoi().find((x) => x.id === s.value);
    onChange(p ? [p] : []);
  };
  return s;
}

/**
 * Dropdown nhiều lựa chọn, gọn trong một dòng.
 * items: [{ id, name }] — onChange nhận mảng id đã chọn.
 */
/** ============================================================
 * Bộ chọn nhiều giá trị — bản hiện đại.
 *  - Ô hiển thị: chip có avatar cho người đã chọn (quá 2 thì +N), bấm chip để bỏ.
 *  - Bảng chọn: luôn có ô tìm, mỗi dòng là avatar + tên + dấu tích bên phải;
 *    dòng đã chọn tô nền xanh nhạt. Enter chọn dòng đầu tiên, Esc đóng.
 *  - Dùng cho cả người (có avatar) và giá trị select (không avatar).
 * ============================================================ */
function multiDropdown(items, selectedIds, onChange, placeholder, opts) {
  const o = opts || {};
  const coAvatar = o.avatar !== false;
  const cur = new Set(selectedIds || []);
  const dd = el('details', 'dd dd-pick');
  const sum = el('summary', 'dd-sum');
  const txt = el('span', 'dd-txt');
  const caret = el('span', 'dd-caret', '▾');

  const tenCua = (id) => (items.find((i) => i.id === id) || {}).name || id;

  const paint = () => {
    txt.innerHTML = '';
    if (!cur.size) {
      txt.textContent = placeholder || 'Chưa chọn';
      txt.classList.add('is-empty');
      return;
    }
    txt.classList.remove('is-empty');
    const ids = [...cur];
    ids.slice(0, 2).forEach((id) => {
      const chip = el('span', 'pk-chip');
      if (coAvatar) {
        const av = el('span', 'pk-ava', initials(tenCua(id)));
        av.style.background = colorOf(tenCua(id));
        chip.appendChild(av);
      }
      chip.appendChild(el('span', 'pk-ten', tenCua(id)));
      const x = el('span', 'pk-x', '×');
      x.title = 'Bỏ ' + tenCua(id);
      x.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        cur.delete(id);
        veDs();
        paint();
        onChange([...cur]);
      };
      chip.appendChild(x);
      txt.appendChild(chip);
    });
    if (ids.length > 2) txt.appendChild(el('span', 'pk-them', '+' + (ids.length - 2)));
  };

  sum.appendChild(txt);
  sum.appendChild(caret);
  dd.appendChild(sum);

  const panel = el('div', 'dd-panel dd-panel-pick');
  const tim = el('input', 'dd-search');
  tim.type = 'search';
  tim.placeholder = coAvatar ? 'Tìm nhân sự…' : 'Tìm…';
  tim.onclick = (e) => e.stopPropagation();
  panel.appendChild(tim);

  const list = el('div', 'dd-list');
  panel.appendChild(list);

  const chan = el('div', 'dd-foot');
  const xoaHet = el('button', 'dd-clear', 'Bỏ chọn tất cả');
  xoaHet.type = 'button';
  xoaHet.onclick = (e) => {
    e.preventDefault();
    cur.clear();
    veDs();
    paint();
    onChange([]);
  };
  chan.appendChild(xoaHet);
  panel.appendChild(chan);

  function veDs() {
    const q = tim.value.trim().toLowerCase();
    list.innerHTML = '';
    const hien = items.filter((i) => !q || i.name.toLowerCase().includes(q));
    if (!hien.length) {
      list.appendChild(el('div', 'dd-trong', 'Không có ai khớp'));
    }
    for (const it of hien) {
      const row = el('div', 'dd-opt' + (cur.has(it.id) ? ' on' : ''));
      row.dataset.id = it.id;
      if (coAvatar) {
        const av = el('span', 'pk-ava', initials(it.name));
        av.style.background = colorOf(it.name);
        row.appendChild(av);
      }
      row.appendChild(el('span', 'dd-opt-ten', it.name));
      row.appendChild(el('span', 'dd-tick', cur.has(it.id) ? '✓' : ''));
      row.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (cur.has(it.id)) cur.delete(it.id); else cur.add(it.id);
        veDs();
        paint();
        onChange([...cur]);
      };
      list.appendChild(row);
    }
    chan.classList.toggle('hidden', !cur.size);
  }

  tim.oninput = veDs;
  tim.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const dau = list.querySelector('.dd-opt');
      if (dau) dau.click();
      tim.value = '';
      veDs();
    } else if (e.key === 'Escape') {
      dd.removeAttribute('open');
    }
  };

  // mở ra là con trỏ nhảy vào ô tìm luôn; và chỉ để một bảng mở cùng lúc
  dd.addEventListener('toggle', () => {
    if (!dd.open) return;
    document.querySelectorAll('details.dd[open]').forEach((x) => { if (x !== dd) x.removeAttribute('open'); });
    veDs();
    tim.focus();
  });

  dd.appendChild(panel);
  veDs();
  paint();
  return dd;
}

/** Dropdown chọn nhiều người — trả về [{id, name}]. */
function peopleDropdown(selected, onChange, placeholder) {
  const items = dsNguoi();
  return multiDropdown(
    items,
    (selected || []).map((u) => u.id),
    (ids) => onChange(items.filter((p) => ids.includes(p.id))),
    placeholder || 'Chọn người…'
  );
}

/** Dropdown chọn nhiều giá trị select (kênh phân phối…) — trả về mảng chuỗi. */
function optionsDropdown(options, selected, onChange, placeholder) {
  const items = (options || []).map((o) => ({ id: o, name: o }));
  return multiDropdown(items, selected || [], (ids) => onChange(ids), placeholder || 'Chọn…', { avatar: false });
}

function peopleInput(selected, onChange) {
  const box = el('div', 'chips');
  const cur = new Map((selected || []).map((u) => [u.id, u]));
  for (const p of dsNguoi()) {
    const c = el('div', 'chip' + (cur.has(p.id) ? ' on' : ''), p.name);
    c.onclick = () => {
      if (cur.has(p.id)) cur.delete(p.id); else cur.set(p.id, p);
      c.classList.toggle('on');
      onChange([...cur.values()]);
    };
    box.appendChild(c);
  }
  return box;
}

function openDrawer(task) {
  if (task) {
    S.editing = Object.assign({}, task);
  } else {
    // Việc mới: ngày bắt đầu mặc định là lúc tạo, người order là chính mình
    S.editing = {
      isNew: true,
      status: 'Chờ tiếp nhận',
      priority: '🟡 Trung bình',
      startAt: new Date().toISOString(),
      requester: S.meta.me ? [S.meta.me] : [],
      campaign: S.isManager ? 'Operate' : null,
      owner: [], helper: [], channel: [],
    };
  }
  S.dirty = {};
  S.suaDayDu = false;     // mở ra là bản gọn, muốn sửa sâu thì bấm nút
  buildDrawer();
  $('#drawer').classList.add('open');
  $('#scrim').classList.add('open');
  baoChe(true);
}

function closeDrawer() {
  S.editing = null;
  S.dirty = {};
  $('#drawer').classList.remove('open');
  $('#scrim').classList.remove('open');
  $('#dStatusMsg').textContent = '';
  if (!document.querySelector('.modal.open')) baoChe(false);
}

function set(key, val) {
  S.dirty[key] = val;
  S.editing[key] = val;
  $('#dStatusMsg').textContent = 'Có thay đổi chưa lưu';
  if (key === 'title') $('#dTitleView').textContent = val || '(chưa có tên)';
}

/** Drawer ở chế độ nhân sự: khoá trường của người order. */
function isStaffMode() {
  if (S.view !== 'work') return false;
  if (S.viewAs) return false;      // quản lý xem việc người khác → mở drawer đầy đủ
  /* Quản lý sửa được tất cả: bản gọn chỉ là cách XEM, bấm "Sửa đầy đủ" là ra form
   * mọi trường. Nhân sự không có nút này nên vẫn bị khoá trường của người order. */
  if (S.isManager && S.suaDayDu) return false;
  const t = S.editing;
  if (!t || t.isNew) return false;
  return true;
}

function buildDrawer() {
  const t = S.editing;
  const o = S.meta.options;
  const isNew = !!t.isNew;
  const staff = isStaffMode();

  $('#dRecId').textContent = isNew ? 'CÔNG VIỆC MỚI' : t.id;
  $('#dTitleView').textContent = isNew ? 'Tạo công việc mới' : (t.title || '(chưa có tên)');
  $('#dDelete').classList.toggle('hidden', isNew || staff);
  const nutFull = $('#dFull');
  nutFull.classList.toggle('hidden', isNew || !S.isManager);
  nutFull.textContent = staff ? '✎ Sửa đầy đủ' : '◀ Xem bản gọn';
  nutFull.title = staff
    ? 'Mở form sửa mọi trường (deadline, người phụ trách, chiến dịch…)'
    : 'Về bản gọn — đúng những gì nhân sự nhìn thấy';
  $('#dSave').textContent = isNew ? 'Tạo công việc' : 'Lưu thay đổi';

  /* Đầu ô chi tiết nhuốm màu theo giai đoạn, và mang luôn cái quan trọng nhất
   * là HẠN — vì dưới kia chỉ còn bốn viên trạng thái/ưu tiên/order/loại việc. */
  const dhead = $('#drawer .drawer-head');
  dhead.className = 'drawer-head';
  const badge = $('#dStage');
  badge.innerHTML = '';
  if (!isNew) {
    const key = laneOf(t, S.who && S.who.id);
    const def = LANE_BY_KEY[key];
    if (key) dhead.classList.add('dh-' + key);
    badge.appendChild(el('span', 'sb-lan', def ? def.title : (t.status || '')));
    if (t.deadline) {
      const tre = laTreTheoHan(t);
      const con = daysLeft(t.deadline);
      badge.appendChild(el('span', 'sb-han' + (tre ? ' tre' : ''),
        (tre ? 'Trễ · hạn ' : 'Hạn ') + fmtDate(t.deadline, true) +
        (tre && con != null && con < 0 ? ' (' + Math.abs(con) + ' ngày)' : '')));
    }
    if (daGiaiQuyet(t)) badge.appendChild(el('span', 'sb-han gq', nhanGiaiQuyet(t)));
  }

  const b = $('#drawerBody');
  b.innerHTML = '';

  if (isNew) return buildCreateForm(b, t, o);
  if (staff) return buildStaffDrawer(b, t, o);

  /* ---- chế độ quản lý: sửa mọi trường ---- */
  b.appendChild(field('Tên công việc *', textInput(t.title, (v) => set('title', v))));

  const detail = el('textarea');
  detail.value = t.detail || '';
  detail.oninput = () => set('detail', detail.value);
  b.appendChild(field('Chi tiết yêu cầu', detail));

  const r1 = el('div', 'row2');
  r1.appendChild(field('Trạng thái', selectInput(t.status, o.status, (v) => set('status', v))));
  r1.appendChild(field('Độ ưu tiên', selectInput(t.priority, o.priority, (v) => set('priority', v))));
  b.appendChild(r1);

  const r2 = el('div', 'row2');
  r2.appendChild(field('Loại công việc', selectInput(t.workType, o.workType, (v) => set('workType', v))));
  r2.appendChild(field('Campain', selectInput(t.campaign, o.campaign, (v) => set('campaign', v))));
  b.appendChild(r2);

  const r3 = el('div', 'row2');
  r3.appendChild(field('Luồng', selectInput(t.flow, o.flow, (v) => set('flow', v))));
  r3.appendChild(field('Chấm điểm (1–5)', (() => {
    const i = textInput(t.rating, (v) => set('rating', v === '' ? null : Number(v)), 'number');
    i.min = 1; i.max = 5; i.step = 1;
    return i;
  })()));
  b.appendChild(r3);

  const r4 = el('div', 'row2');
  r4.appendChild(field('Ngày bắt đầu', textInput(toLocalInput(t.startAt), (v) => set('startAt', v || null), 'datetime-local')));
  r4.appendChild(field('Deadline 1', textInput(toLocalInput(t.deadline1), (v) => set('deadline1', v || null), 'datetime-local')));
  b.appendChild(r4);

  b.appendChild(field('Deadline 2', textInput(toLocalInput(t.deadline2), (v) => set('deadline2', v || null), 'datetime-local')));
  b.appendChild(field('Phụ trách chính', peopleDropdown(t.owner, (v) => set('owner', v), 'Chọn người phụ trách…')));
  b.appendChild(field('Người hỗ trợ', peopleDropdown(t.helper, (v) => set('helper', v), 'Chọn người hỗ trợ…')));
  b.appendChild(field('Người order', onePersonInput(t.requester, (v) => set('requester', v))));
  b.appendChild(field('Kênh phân phối', optionsDropdown(o.channel, t.channel, (v) => set('channel', v), 'Chọn kênh…')));
  b.appendChild(field('Link', textInput(t.link, (v) => set('link', v), 'url')));

  const note = el('textarea');
  note.value = t.note || '';
  note.style.minHeight = '60px';
  note.oninput = () => set('note', note.value);
  b.appendChild(field('Ghi chú', note));

  b.appendChild(attachmentField(t, true));
  b.appendChild(khoiTep(t, 'File kết quả', t.fileKetQua, 'ket-qua', true, 'Nhân sự chưa nộp file nào.'));
  b.appendChild(oTaiLen(t, 'ket-qua'));
  b.appendChild(khoiBinhLuan(t));
}

/**
 * Form đặt việc mới.
 * Ai cũng điền được phần trên (đúng bộ trường Form "Yêu cầu công việc" trong
 * tài liệu). Phần phân công cấp phòng chỉ quản lý thấy.
 */
function buildCreateForm(b, t, o) {
  const isMgr = !!S.isManager;

  b.appendChild(field('Tên công việc *', textInput(t.title, (v) => set('title', v))));

  const detail = el('textarea');
  detail.value = t.detail || '';
  detail.oninput = () => set('detail', detail.value);
  b.appendChild(field('Chi tiết yêu cầu *', detail));

  const r1 = el('div', 'row2');
  r1.appendChild(field('Loại công việc *', selectInput(t.workType, o.workType, (v) => set('workType', v))));
  r1.appendChild(field('Độ ưu tiên *', selectInput(t.priority, o.priority, (v) => set('priority', v))));
  b.appendChild(r1);

  const r2 = el('div', 'row2');
  const fStart = field('Ngày bắt đầu',
    textInput(toLocalInput(t.startAt), (v) => set('startAt', v || null), 'datetime-local'));
  fStart.appendChild(el('div', 'ro-note', 'Mặc định là thời điểm tạo việc.'));
  r2.appendChild(fStart);
  r2.appendChild(field('Deadline *',
    textInput(toLocalInput(t.deadline1), (v) => set('deadline1', v || null), 'datetime-local')));
  b.appendChild(r2);

  b.appendChild(field('Link brief / tư liệu', textInput(t.link, (v) => set('link', v), 'url')));

  const note = el('textarea');
  note.value = t.note || '';
  note.style.minHeight = '60px';
  note.oninput = () => set('note', note.value);
  b.appendChild(field('Ghi chú', note));

  if (!isMgr) {
    b.appendChild(el('div', 'callout',
      'Bạn là Người order của việc này. Quản lý sẽ phân công Phụ trách chính, ' +
      'Campain và Kênh phân phối sau khi tiếp nhận.'));
    return;
  }

  /* ---- chỉ quản lý ---- */
  b.appendChild(el('div', 'section-title', 'Phân công — chỉ quản lý'));

  b.appendChild(field('Phụ trách chính',
    peopleDropdown(t.owner, (v) => set('owner', v), 'Chọn người phụ trách…')));
  b.appendChild(field('Người hỗ trợ',
    peopleDropdown(t.helper, (v) => set('helper', v), 'Chọn người hỗ trợ…')));

  const r3 = el('div', 'row2');
  r3.appendChild(field('Campain', selectInput(t.campaign, o.campaign, (v) => set('campaign', v))));
  r3.appendChild(field('Người order', onePersonInput(t.requester, (v) => set('requester', v))));
  b.appendChild(r3);

  b.appendChild(field('Kênh phân phối',
    optionsDropdown(o.channel, t.channel, (v) => set('channel', v), 'Chọn kênh…')));
}

/* Biến URL trong mô tả thành link bấm được. Yêu cầu của người order hay có
 * link Drive/Figma dán giữa đoạn văn — để dạng chữ thì phải bôi đen copy tay. */
function moTaCoLink(text) {
  const box = el('div', 'd-desc');
  const re = /(https?:\/\/[^\s<>"')\]]+)/g;
  let i = 0, m;
  while ((m = re.exec(String(text))) !== null) {
    if (m.index > i) box.appendChild(document.createTextNode(text.slice(i, m.index)));
    const a = el('a', '', m[1].length > 60 ? m[1].slice(0, 57) + '\u2026' : m[1]);
    a.href = m[1];
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = m[1];
    box.appendChild(a);
    i = m.index + m[1].length;
  }
  if (i < text.length) box.appendChild(document.createTextNode(text.slice(i)));
  return box;
}

/** Viên thông tin nhỏ: nhãn mờ — giá trị đậm. `tone` cho màu ngụ nghĩa. */
function vien(nhan, giaTri, tone) {
  const c = el('span', 'd-chip' + (tone ? ' t-' + tone : ''));
  if (nhan) c.appendChild(el('span', 'k', nhan));
  c.appendChild(el('b', '', String(giaTri)));
  return c;
}

/** Màu cho độ ưu tiên / trạng thái — cùng bộ với thẻ ngoài danh sách. */
const toneUuTien = (v) => (/cao|urgent|g\u1ea5p/i.test(v || '') ? 'red'
  : /trung/i.test(v || '') ? 'orange' : /th\u1ea5p/i.test(v || '') ? 'green' : '');
const toneTrangThai = (v) => (v === 'Hoàn thành' ? 'green'
  : v === 'Trễ deadline' ? 'red'
  : v === 'Làm lại' ? 'orange'
  : v === 'Đang tiến hành' ? 'blue' : '');

/** Một khối thông tin dạng thẻ, cùng ngôn ngữ đổ bóng với các app khác trong Hub. */
function theKhoi(tieuDe, phu) {
  const the = el('div', 'kh' + (phu ? ' kh-' + phu : ''));
  const dau = el('div', 'kh-dau');
  dau.appendChild(el('span', 'kh-ten', tieuDe));
  the.appendChild(dau);
  const than = el('div', 'kh-than');
  the.appendChild(than);
  return { the, than, dau };
}

/**
 * Danh sách tệp kèm Xem nhanh + Tải xuống.
 * @param {string} nhan   nhãn hiển thị
 * @param {Array}  att    danh sách tệp
 * @param {string} cot    'ket-qua' | '' — quyết định xoá khỏi ô nào
 * @param {boolean} xoaDuoc
 * @param {string} khiTrong câu hiện khi chưa có tệp
 */
function khoiTep(t, nhan, att, cot, xoaDuoc, khiTrong) {
  att = att || [];
  const box = el('div', 'field');
  box.appendChild(el('label', '', nhan + ' (' + att.length + ')'));
  if (!att.length) {
    box.appendChild(el('div', 'ro-note', khiTrong || 'Chưa có tệp nào.'));
    return box;
  }
  const ds = el('div', 'attgrid');
  for (const a of att) {
    if (!a.token) { ds.appendChild(el('span', 'att', a.name || 'tệp')); continue; }
    const o = el('div', 'attitem');
    const xem = el('div', 'attthumb');
    if (laAnh(a.name)) {
      const img = el('img');
      img.src = urlTep(t.id, a.token);
      img.alt = a.name || '';
      img.loading = 'lazy';
      xem.appendChild(img);
    } else {
      xem.classList.add('ic');
      xem.textContent = laPdf(a.name) ? 'PDF' : laVideo(a.name) ? '▶' : 'TỆP';
    }
    xem.onclick = () => moXemTep(t, a);
    xem.title = 'Bấm để xem';
    o.appendChild(xem);

    const meta = el('div', 'attmeta');
    const ten = el('div', 'attname', a.name || 'tệp');
    ten.onclick = () => moXemTep(t, a);
    meta.appendChild(ten);
    meta.appendChild(el('div', 'attsize', a.size ? Math.round(a.size / 1024) + ' KB' : ''));
    const acts = el('div', 'attacts');
    const nhanh = el('button', 'attbtn', 'Xem nhanh');
    nhanh.onclick = () => moXemTep(t, a);
    acts.appendChild(nhanh);
    const tai = el('a', 'attbtn', 'Tải xuống');
    tai.href = urlTep(t.id, a.token, true);
    tai.setAttribute('download', a.name || '');
    acts.appendChild(tai);
    if (xoaDuoc) {
      const xoa = el('button', 'attbtn del', 'Xoá');
      xoa.onclick = async () => {
        if (!confirm('Xoá tệp "' + (a.name || '') + '"?')) return;
        xoa.disabled = true;
        try {
          await req('/api/tasks/' + t.id + '/attachment?token=' + encodeURIComponent(a.token) +
            (cot ? '&cot=' + cot : ''), { method: 'DELETE' });
          toast('Đã xoá tệp');
          closeDrawer();
          await refresh(true);
        } catch (e) {
          toast('Lỗi: ' + e.message, true);
          xoa.disabled = false;
        }
      };
      acts.appendChild(xoa);
    }
    meta.appendChild(acts);
    o.appendChild(meta);
    ds.appendChild(o);
  }
  box.appendChild(ds);
  return box;
}

/** Drawer cho Phụ trách chính — chỉ mở đúng những gì tài liệu cho phép sửa. */
function buildStaffDrawer(b, t, o) {
  const stage = laneOf(t, S.who && S.who.id);
  const st = LANE_BY_KEY[stage];
  const myRole = roleIn(t, S.who && S.who.id);

  const co = el('div', 'callout' + (stage === 'new' || stage === 'redo' || stage === 'late' ? ' warn' : ''));
  co.textContent = st ? st.hint : '';
  b.appendChild(co);

  /* --- yêu cầu từ người order: chỉ đọc ---
   * Thứ tự đọc: PHẢI LÀM GÌ (mô tả) -> tài liệu kèm -> phần còn lại gọn thành
   * viên nhỏ. Tên việc đã nằm ở đầu drawer nên không lặp lại ở đây. */
  /* ---------- THẺ 1: yêu cầu từ người order (chỉ đọc) ----------
   * Nhân sự cần đúng ba thứ để bắt tay vào làm: làm gì, tài liệu đâu, ai order.
   * Phần còn lại gọn thành viên nhỏ. */
  const yc = theKhoi('Yêu cầu từ người order');
  if (t.detail) yc.than.appendChild(moTaCoLink(t.detail));
  else yc.than.appendChild(el('div', 'd-desc trong-nhe', 'Người order chưa ghi chi tiết yêu cầu.'));

  yc.than.appendChild(khoiTep(t, 'Tài liệu kèm yêu cầu', t.attachment, '', false,
    'Người order không gửi tệp nào kèm theo.'));

  const chips = el('div', 'd-chips');
  const themVien = (nhan, v, tone) => { if (v) chips.appendChild(vien(nhan, v, tone)); };
  themVien('', t.status, toneTrangThai(t.status));
  themVien('', plainLabel(t.priority), toneUuTien(t.priority));
  themVien('order', (t.requester || []).map((u) => u.name).join(', '));
  themVien('loại', t.workType);
  if (t.rating) themVien('điểm', '★'.repeat(t.rating) + ' ' + t.rating + '/5', 'green');
  if (chips.children.length) yc.than.appendChild(chips);

  /* Nút điều chỉnh: nói rõ khi nào dùng, đừng để họ đoán. */
  const dc = el('div', 'sd-dc');
  dc.appendChild(el('div', 'sd-dc-txt',
    'Yêu cầu này có gì chưa rõ hoặc chưa đảm bảo để làm — thiếu tài liệu, sai thông tin, ' +
    'deadline không kịp? Gửi yêu cầu điều chỉnh cho người order thay vì tự sửa.'));
  const adj = el('button', 'btn', 'Gửi yêu cầu điều chỉnh');
  adj.onclick = () => { closeDrawer(); openAdjust(t); };
  dc.appendChild(adj);
  yc.than.appendChild(dc);
  b.appendChild(yc.the);

  /* ---------- THẺ 2: phần của bạn (được sửa) ---------- */
  const cb = theKhoi('Phần của bạn', 'cb');

  if (myRole !== 'owner') {
    cb.than.appendChild(el('div', 'callout', 'Bạn là ' +
      (myRole === 'helper' ? 'Người hỗ trợ' : 'Người order') +
      ' của task này. Người cập nhật trạng thái là Phụ trách chính.'));
  }

  cb.than.appendChild(field('Link kết quả', textInput(t.link, (v) => set('link', v), 'url')));

  const note = el('textarea');
  note.value = t.note || '';
  note.style.minHeight = '60px';
  note.oninput = () => set('note', note.value);
  cb.than.appendChild(field('Ghi chú', note));

  cb.than.appendChild(khoiTep(t, 'File kết quả', t.fileKetQua, 'ket-qua', myRole === 'owner',
    'Chưa nộp file nào.'));
  if (myRole === 'owner') {
    const nop = el('div', 'field');
    nop.appendChild(el('div', 'ro-note',
      'Chọn tệp ở đây là vào thẳng ô "File kết quả" của bản ghi trên Base — ' +
      'không lẫn với tài liệu người order gửi kèm.'));
    nop.appendChild(oTaiLen(t, 'ket-qua'));
    cb.than.appendChild(nop);
  }

  cb.than.appendChild(field('Người hỗ trợ (chỉ thêm khi thật cần)',
    peopleDropdown(t.helper, (v) => set('helper', v), 'Chọn người hỗ trợ…')));
  b.appendChild(cb.the);

  b.appendChild(khoiBinhLuan(t));

  /* --- hành động chính --- */
  const foot = el('div', 'field');
  if (myRole === 'owner') {
    if (stage === 'new') {
      const bt = el('button', 'btn btn-primary', '▶ Bắt đầu làm  (→ Đang tiến hành)');
      bt.onclick = async () => { closeDrawer(); await startTask(t); };
      foot.appendChild(bt);
    } else if (stage === 'doing' || stage === 'redo' || stage === 'late' || stage === 'daNop') {
      const treGQ = !S.isManager && cfg0().chanTre && laTreTheoHan(t);
      const bt = el('button', 'btn btn-primary',
        treGQ
          ? (daGiaiQuyet(t)
            ? '↥ Nộp lại sản phẩm (đang chờ nghiệm thu)'
            : '↥ Giải quyết · nộp sản phẩm (giữ nguyên trạng thái trễ)')
          : stage === 'redo' ? '↻ Nộp lại  (→ Hoàn thành)' : '✓ Hoàn thành công việc');
      bt.onclick = () => { closeDrawer(); openDone(t, treGQ ? 'giai-quyet' : ''); };
      foot.appendChild(bt);
    }
  }
  if (foot.children.length) b.appendChild(foot);
}

const laAnh = (n) => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(n || '');
const laPdf = (n) => /\.pdf$/i.test(n || '');
const laVideo = (n) => /\.(mp4|mov|webm)$/i.test(n || '');
/* Ảnh và tệp đính kèm nạp qua <img src> / <a href>, không đi qua fetch — nên shim
 * của Marketing Hub không vá hộ. Chạy trong khung nhúng thì đường dẫn tuyệt đối
 * "/api/..." trỏ về gốc Hub chứ không vào app con — ảnh vì thế chỉ hiện ô vỡ.
 * Tự thêm tiền tố /m/<id> do Hub khai báo; chạy trực tiếp thì tiền tố rỗng. */
const TIEN_TO_HUB = (window.__HUB__ && window.__HUB__.prefix) || '';
const urlTep = (id, token, tai) =>
  TIEN_TO_HUB + '/api/attachment?record=' + encodeURIComponent(id) +
  '&token=' + encodeURIComponent(token) + (tai ? '&tai=1' : '');

function attachmentField(t, canUpload) {
  const att = t.attachment || [];
  const list = el('div', 'attgrid');

  for (const a of att) {
    if (!a.token) { list.appendChild(el('span', 'att', a.name || 'tệp')); continue; }
    const src = urlTep(t.id, a.token);

    const o = el('div', 'attitem');
    const xem = el('div', 'attthumb');
    if (laAnh(a.name)) {
      const img = el('img');
      img.src = src; img.alt = a.name || '';
      img.loading = 'lazy';
      xem.appendChild(img);
    } else {
      xem.classList.add('ic');
      xem.textContent = laPdf(a.name) ? 'PDF' : laVideo(a.name) ? '▶' : 'TỆP';
    }
    xem.onclick = () => moXemTep(t, a);
    xem.title = 'Bấm để xem';
    o.appendChild(xem);

    const meta = el('div', 'attmeta');
    const ten = el('div', 'attname', a.name || 'tệp');
    ten.onclick = () => moXemTep(t, a);
    meta.appendChild(ten);
    meta.appendChild(el('div', 'attsize', a.size ? Math.round(a.size / 1024) + ' KB' : ''));

    const acts = el('div', 'attacts');
    const tai = el('a', 'attbtn', 'Tải về');
    tai.href = urlTep(t.id, a.token, true);
    tai.setAttribute('download', a.name || '');
    acts.appendChild(tai);

    if (canUpload) {
      const xoa = el('button', 'attbtn del', 'Xoá');
      xoa.onclick = async () => {
        if (!confirm('Xoá tệp "' + (a.name || '') + '" khỏi công việc này?')) return;
        xoa.disabled = true;
        try {
          await req('/api/tasks/' + t.id + '/attachment?token=' + encodeURIComponent(a.token), { method: 'DELETE' });
          toast('Đã xoá tệp');
          closeDrawer();
          await refresh(true);
        } catch (e) {
          toast('Lỗi: ' + e.message, true);
          xoa.disabled = false;
        }
      };
      acts.appendChild(xoa);
    }
    meta.appendChild(acts);
    o.appendChild(meta);
    list.appendChild(o);
  }

  if (!att.length) list.appendChild(el('div', 'att', 'Chưa có tệp nào.'));

  const f = field('Tệp đính kèm (' + att.length + ')', list);
  if (canUpload) f.appendChild(oTaiLen(t));
  else f.appendChild(el('div', 'ro-note', 'Bấm vào tệp để xem trực tiếp.'));
  return f;
}

/** Ô chọn tệp để tải lên — tách riêng để đặt được vào đúng khối "Phần của bạn". */
/** @param {string} cot 'ket-qua' → vào ô File kết quả; bỏ trống → ô Tệp đính kèm. */
function oTaiLen(t, cot) {
  const hop = el('div', 'field');
  {
    const row = el('div', 'uploadrow');
    const input = el('input');
    input.type = 'file';
    input.multiple = true;
    const st = el('div', 'ro-note', 'Chọn tệp để tải lên ngay.');
    input.onchange = async () => {
      const files = [...input.files];
      if (!files.length) return;
      input.disabled = true;
      try {
        for (let i = 0; i < files.length; i++) {
          st.textContent = 'Đang tải ' + (i + 1) + '/' + files.length + '…';
          const r = await fetch('/api/tasks/' + t.id + '/upload' + (cot ? '?cot=' + cot : ''), {
            method: 'POST',
            headers: { 'X-File-Name': encodeURIComponent(files[i].name) },
            body: files[i],
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || d.error) throw new Error(d.error || 'Tải tệp thất bại');
        }
        toast('Đã đính ' + files.length + ' tệp');
        closeDrawer();
        await refresh(true);
      } catch (e) {
        st.textContent = '';
        toast('Lỗi: ' + e.message, true);
        input.disabled = false;
      }
    };
    row.appendChild(input);
    hop.appendChild(row);
    hop.appendChild(st);
  }
  return hop;
}

/* ---- bình luận trong công việc ---- */
function khoiBinhLuan(t) {
  const f = el('div', 'field');
  f.appendChild(el('label', '', 'Trao đổi'));

  const list = el('div', 'cmt-list');
  list.appendChild(el('div', 'cmt-load', 'Đang tải…'));
  f.appendChild(list);

  const soan = el('div', 'cmt-new');
  const ta = el('textarea', 'cmt-input');
  ta.rows = 2;
  ta.placeholder = 'Viết trao đổi về công việc này…';
  const gui = el('button', 'btn btn-primary', 'Gửi');
  gui.onclick = async () => {
    const noi = ta.value.trim();
    if (!noi) return;
    gui.disabled = true;
    try {
      await req('/api/tasks/' + t.id + '/comments', {
        method: 'POST', body: JSON.stringify({ content: noi }),
      });
      ta.value = '';
      await napBinhLuan(t, list);
      toast('Đã gửi trao đổi');
    } catch (e) {
      toast('Lỗi: ' + e.message, true);
    } finally { gui.disabled = false; }
  };
  ta.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') gui.click();
  };
  soan.appendChild(ta);
  soan.appendChild(gui);
  f.appendChild(soan);
  f.appendChild(el('div', 'ro-note', 'Ctrl + Enter để gửi nhanh. Người liên quan sẽ nhận thông báo trong Lark.'));

  napBinhLuan(t, list);
  return f;
}

async function napBinhLuan(t, list) {
  try {
    const d = await req('/api/tasks/' + t.id + '/comments');
    list.innerHTML = '';
    if (!d.comments.length) {
      list.appendChild(el('div', 'cmt-load', 'Chưa có trao đổi nào.'));
      return;
    }
    for (const c of d.comments) {
      const o = el('div', 'cmt');
      const ten = (c.author && c.author[0] && c.author[0].name) || 'Ẩn danh';
      const av = el('span', 'av av-sm', initials(ten));
      av.style.background = colorOf(ten);
      o.appendChild(av);

      const body = el('div', 'cmt-body');
      const head = el('div', 'cmt-head');
      head.appendChild(el('span', 'cmt-who', ten));
      head.appendChild(el('span', 'cmt-at', fmtDate(c.at, true) || ''));
      body.appendChild(head);
      body.appendChild(el('div', 'cmt-txt', c.content));
      o.appendChild(body);
      list.appendChild(o);
    }
    list.scrollTop = list.scrollHeight;
  } catch (e) {
    list.innerHTML = '';
    list.appendChild(el('div', 'cmt-load', 'Không tải được trao đổi: ' + e.message));
  }
}

/* ---- xem tệp toàn màn hình ---- */
function moXemTep(t, a) {
  const src = urlTep(t.id, a.token);
  const box = $('#viewerBody');
  box.innerHTML = '';
  $('#viewerName').textContent = a.name || 'tệp';
  $('#viewerDl').href = urlTep(t.id, a.token, true);
  $('#viewerDl').setAttribute('download', a.name || '');

  if (laAnh(a.name)) {
    const img = el('img', 'vw-img');
    img.src = src; img.alt = a.name || '';
    box.appendChild(img);
  } else if (laPdf(a.name)) {
    const fr = el('iframe', 'vw-frame');
    fr.src = src;
    box.appendChild(fr);
  } else if (laVideo(a.name)) {
    const v = el('video', 'vw-img');
    v.src = src; v.controls = true;
    box.appendChild(v);
  } else {
    const n = el('div', 'vw-none');
    n.appendChild(el('div', 'vw-none-ic', 'TỆP'));
    n.appendChild(el('div', '', 'Kiểu tệp này không xem trực tiếp được.'));
    const b = el('a', 'btn btn-primary', 'Tải về để mở');
    b.href = urlTep(t.id, a.token, true);
    b.setAttribute('download', a.name || '');
    n.appendChild(b);
    box.appendChild(n);
  }
  openModal('mViewer');
}

async function saveDrawer() {
  const t = S.editing;
  if (!t) return;
  const btn = $('#dSave');
  btn.disabled = true;
  try {
    if (t.isNew) {
      // Gom payload từ đúng những trường vai trò hiện tại được phép gửi
      const allowed = S.isManager
        ? S.meta.rules.staffCreatable.concat(S.meta.rules.managerOnlyFields, ['status'])
        : S.meta.rules.staffCreatable;
      const payload = {};
      for (const k of allowed) {
        const v = t[k];
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
        payload[k] = v;
      }
      if (S.isManager && t.status) payload.status = t.status;

      if (!payload.title) throw new Error('Cần nhập tên công việc');
      if (!payload.detail) throw new Error('Cần nhập chi tiết yêu cầu');
      if (!payload.workType) throw new Error('Cần chọn loại công việc');
      if (!payload.deadline1) throw new Error('Cần chọn deadline');

      await req('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
      toast(S.isManager
        ? 'Đã tạo công việc mới'
        : 'Đã gửi yêu cầu công việc. Quản lý sẽ phân công người phụ trách.');
      closeDrawer();
      await refresh(true);
    } else {
      if (!Object.keys(S.dirty).length) { toast('Không có thay đổi nào'); btn.disabled = false; return; }
      const suffix = isStaffMode() ? '?role=staff' : '';
      await req('/api/tasks/' + t.id + suffix, { method: 'PATCH', body: JSON.stringify(S.dirty) });
      const local = S.tasks.find((x) => x.id === t.id);
      if (local) {
        Object.assign(local, S.dirty);
        local.deadline = local.deadline1 || local.deadline2 || null;
      }
      toast('Đã lưu vào Lark Base');
      closeDrawer();
      render();
    }
  } catch (e) {
    toast('Lỗi: ' + e.message, true);
  } finally {
    btn.disabled = false;
  }
}

/** Bấm ra ngoài ô chi tiết: có thay đổi thì lưu rồi đóng, không thì đóng luôn. */
async function luuRoiDong() {
  const t = S.editing;
  if (t && !t.isNew && Object.keys(S.dirty).length) return saveDrawer();
  closeDrawer();
}

async function deleteCurrent() {
  const t = S.editing;
  if (!t || t.isNew) return;
  if (!confirm('Xoá công việc "' + (t.title || t.id) + '"? Bản ghi sẽ bị xoá khỏi Lark Base.')) return;
  try {
    await req('/api/tasks/' + t.id, { method: 'DELETE' });
    S.tasks = S.tasks.filter((x) => x.id !== t.id);
    S.selected.delete(t.id);
    toast('Đã xoá công việc');
    closeDrawer();
    render();
  } catch (e) {
    toast('Lỗi: ' + e.message, true);
  }
}

/* =======================  mutations  ======================= */
async function patchTask(task, patch, okMsg) {
  const local = S.tasks.find((x) => x.id === task.id);
  const backup = local ? Object.assign({}, local) : null;
  if (local) {
    Object.assign(local, patch);
    local.deadline = local.deadline1 || local.deadline2 || null;
  }
  render();
  try {
    await req('/api/tasks/' + task.id, { method: 'PATCH', body: JSON.stringify(patch) });
    if (okMsg) toast(okMsg);
  } catch (e) {
    if (local && backup) Object.assign(local, backup);
    render();
    toast('Lỗi: ' + e.message, true);
  }
}

function toggleSelect(id) {
  if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id);
  render();
}

async function bulkPatch(patch, msg) {
  const ids = [...S.selected];
  if (!ids.length) return;
  try {
    const r = await req('/api/tasks/bulk', { method: 'PATCH', body: JSON.stringify({ ids, patch }) });
    for (const id of ids) {
      const t = S.tasks.find((x) => x.id === id);
      if (t) { Object.assign(t, patch); t.deadline = t.deadline1 || t.deadline2 || null; }
    }
    S.selected.clear();
    toast(msg + ' (' + r.count + ' việc)');
    render();
  } catch (e) {
    toast('Lỗi: ' + e.message, true);
  }
}

async function bulkDelete() {
  const ids = [...S.selected];
  if (!ids.length) return;
  if (!confirm('Xoá ' + ids.length + ' công việc khỏi Lark Base?')) return;
  try {
    await req('/api/tasks/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
    S.tasks = S.tasks.filter((t) => !ids.includes(t.id));
    S.selected.clear();
    toast('Đã xoá ' + ids.length + ' công việc');
    render();
  } catch (e) {
    toast('Lỗi: ' + e.message, true);
  }
}

/* =======================  filters UI  ======================= */
function fillSelect(sel, options, placeholder, isPeople) {
  const keep = sel.value;
  sel.innerHTML = '';
  const p = el('option', '', placeholder);
  p.value = '';
  sel.appendChild(p);
  for (const o of options || []) {
    const op = el('option', '', isPeople ? o.name : o);
    op.value = isPeople ? o.id : o;
    sel.appendChild(op);
  }
  sel.value = keep;
}

function syncFilterInputs() {
  /* Gán .value bằng code KHÔNG phát sự kiện change, nên dãy nút phải được vẽ lại
   * tay — nếu không, đổi mốc ở một chỗ mà hai dãy nút kia vẫn sáng nút cũ. */
  if (window.HUB_SEG && DUOI_HUB()) {
    setTimeout(() => ['#wDue', '#dDue', '#fDue'].forEach((x) => window.HUB_SEG($(x))), 0);
  }
  $('#fCampaign').value = S.filters.campaign;
  $('#fWorkType').value = S.filters.workType;

  $('#fPriority').value = S.filters.priority;
  $('#fStatus').value = S.filters.status;
  $('#fDue').value = S.filters.due;
  $('#fHideDone').checked = S.filters.hideDone;
  $('#wCampaign').value = S.wf.campaign;
  $('#wPriority').value = S.wf.priority;
  $('#wDue').value = S.wf.due;
  $('#dCampaign').value = S.df.campaign;

  $('#dDue').value = S.df.due;
  $('#fDueDate').value = S.filters.dueDate;
  $('#wDueDate').value = S.wf.dueDate;
  $('#dDueDate').value = S.df.dueDate;
  for (const k of Object.keys(CHON_NGUOI)) CHON_NGUOI[k].ve();
  syncDateInputs();
}

/** Ô chọn ngày chỉ hiện khi mốc là "Ngày cụ thể". */
function syncDateInputs() {
  $('#fDueDate').classList.toggle('hidden', S.filters.due !== 'exact');
  $('#wDueDate').classList.toggle('hidden', S.wf.due !== 'exact');
  $('#dDueDate').classList.toggle('hidden', S.df.due !== 'exact');
}

function setupFilters() {
  const o = S.meta.options;
  fillSelect($('#fCampaign'), o.campaign, 'Campain: tất cả');
  fillSelect($('#fWorkType'), o.workType, 'Loại việc: tất cả');
  fillSelect($('#fPriority'), o.priority, 'Ưu tiên: tất cả');
  fillSelect($('#fStatus'), o.status, 'Trạng thái: tất cả');

  fillSelect($('#bulkStatus'), o.status, 'Đổi trạng thái…');
  fillSelect($('#bulkPriority'), o.priority, 'Đổi ưu tiên…');
  fillSelect($('#wCampaign'), o.campaign, 'Chiến dịch: tất cả');
  fillSelect($('#wPriority'), o.priority, 'Độ ưu tiên: tất cả');
  fillSelect($('#dCampaign'), o.campaign, 'Chiến dịch: tất cả');

  fillDueSelect($('#wDue'), 'Thời gian: tất cả');
  fillDueSelect($('#dDue'), 'Thời gian: tất cả');
  fillDueSelect($('#fDue'), 'Thời gian: tất cả');
  /* Dưới lớp vỏ: ô chọn mốc khoác thành dãy nút, cùng một cách thể hiện với trang
   * Tổng quan và hai base kia. Chạy đứng một mình thì giữ <select> như cũ. */
  if (window.HUB_SEG && DUOI_HUB()) ['#wDue', '#dDue', '#fDue'].forEach((x) => window.HUB_SEG($(x)));
  fillSelect($('#calStatus'), o.status, 'Mọi trạng thái');
  fillSelect($('#calCampaign'), o.campaign, 'Mọi chiến dịch');

  // Ô chọn nhân sự: dùng chung component có ô tìm + số việc, không dùng <select>
  lapChonNguoi('fOwnerHost', 'Phụ trách: tất cả',
    () => S.filters.owner, (v) => { S.filters.owner = v; });
  lapChonNguoi('dPersonHost', 'Nhân sự: tất cả',
    () => S.df.person, (v) => { S.df.person = v; });
  lapChonNguoi('calPersonHost', 'Mọi nhân sự',
    () => S.cf.person, (v) => { S.cf.person = v; });
}

/* =======================  render root  ======================= */
function render() {
  const isDash = S.view === 'dash';
  const isWork = S.view === 'work';
  const isCal  = S.view === 'cal';
  $('#dashboard').classList.toggle('hidden', !isDash);
  $('#workspace').classList.toggle('hidden', !isWork);
  $('#calendar').classList.toggle('hidden', !isCal);
  $('#adminArea').classList.toggle('hidden', isDash || isWork || isCal);

  if (isCal) {
    if (!S.cf.moc) S.cf.moc = startOfDay(new Date());
    renderCalendar();
    $('#bulkbar').classList.add('hidden');
    return;
  }

  if (isDash) {
    renderDashboard();
    $('#bulkbar').classList.add('hidden');
    return;
  }

  if (isWork) {
    const list = myTasks();
    renderViewAsBar();
    renderCounters();
    renderLanes(list);
    // nói rõ đang lọc theo mốc nào, để không ai tưởng đây là toàn bộ việc của họ
    const total = scopeTasks().length;
    const mocLoc = (DUE_LABEL[S.wf.due] || '').toLowerCase();
    $('#wCount').textContent = 'Hiển thị ' + list.length + ' / ' + total + ' việc của ' +
      (S.who ? S.who.name : '—') + (mocLoc ? ' · lọc: ' + mocLoc : '');
  } else {
    const list = visibleTasks();
    renderStats();
    $('#countLabel').textContent = 'Hiển thị ' + list.length + ' / ' + S.tasks.length + ' công việc';
    const isBoard = S.view === 'board';
    $('#board').classList.toggle('hidden', !isBoard);
    $('#table').classList.toggle('hidden', isBoard);
    if (isBoard) renderBoard(list); else renderTable(list);
  }

  const n = S.selected.size;
  $('#bulkbar').classList.toggle('hidden', n === 0 || isWork);
  $('#bulkCount').textContent = 'Đã chọn ' + n + ' việc';
}

/**
 * Nhân sự chỉ được bảy mốc thời gian của lớp vỏ. Mốc đang giữ (VD 'thismonth' mặc
 * định, hay 'overdue' nhớ từ trước) không nằm trong bảy mốc đó thì kéo về mốc mặc
 * định — nếu không ô chọn hiện một mốc mà dữ liệu lại lọc theo mốc khác.
 */
function chuanMocNhanSu() {
  const ds = MOC_HUB();
  if (!ds) return;
  const ma = (x) => 'ns:' + x.tu + ':' + x.den;
  const hop = (v) => ds.some((x) => v === ma(x));
  const mac = ma(ds.find((x) => x.k === window.HUB_LOC.MAC_DINH) || ds[0]);
  for (const f of [S.filters, S.wf, S.df]) {
    if (!hop(f.due)) { f.due = mac; f.dueDate = ''; }
  }
}

/** Con số trên phụ đề đang đếm việc của ai — nói đúng để khỏi hiểu nhầm. */
function nhanPhamVi() {
  if (S.isManager) return ' việc toàn phòng';
  return S.perm && S.perm.toanBo ? ' việc toàn phòng (chỉ xem)' : ' việc của bạn';
}

async function refresh(force) {
  await loadAll(force);

  S.isManager = S.meta.role === 'manager';
  // Tùy chọn quản lý cấp riêng cho nhân sự này (bảng Phân quyền app của hub)
  S.perm = Object.assign({ toanBo: S.isManager, taoMoi: true }, S.meta.perm || {});
  chuanMocNhanSu();
  // Nhân sự luôn khoá theo tài khoản đăng nhập; quản lý được xem việc của người khác
  if (!S.isManager) S.viewAs = null;
  S.who = S.viewAs || S.meta.me || null;

  setupFilters();
  syncFilterInputs();
  applyRoleChrome();
  $('#subtitle').textContent = 'Tracking · ' + S.tasks.length +
    nhanPhamVi();
  $('#linkLark').href = S.meta.larkUrl;
  render();
  updateBadge();
  capNhatNhanThoiGian();
}

/** Ẩn/hiện các phần chỉ dành cho quản lý. */
function applyRoleChrome() {
  const me = S.meta.me;

  // Nhân sự: chip tĩnh. Quản lý: chip là nút chuyển vai.
  $('#meChip').classList.toggle('hidden', !!S.isManager);
  $('#meSwitch').classList.toggle('hidden', !S.isManager);
  $('#meChip').textContent = me ? me.name : 'Chưa đăng nhập';

  if (S.isManager) {
    $('#meChipText').textContent = S.viewAs
      ? 'Đang xem: ' + S.viewAs.name
      : (me ? me.name + '  ·  Quản lý' : 'Quản lý');
    $('#meChipBtn').classList.toggle('is-viewas', !!S.viewAs);
    renderViewAsList();
  }

  /* Nhân sự chỉ có tab "Việc của tôi". Ai được cấp "Xem toàn bộ" thì thêm Kanban
   * và Bảng để nhìn được việc cả phòng — sửa vẫn chỉ sửa được việc của mình. */
  const xemHet = S.isManager || S.perm.toanBo;
  for (const v of ['dash', 'board', 'table']) {
    const tab = document.querySelector('.tab[data-view="' + v + '"]');
    if (tab) tab.classList.toggle('hidden', v === 'dash' ? !S.isManager : !xemHet);
  }
  // Ai cũng đặt được việc (Form "Yêu cầu công việc"); phần phân công mới cần quản lý
  $('#btnNew').textContent = S.isManager ? '+ Công việc' : '+ Đặt việc';
  $('#btnNew').classList.toggle('hidden', !S.perm.taoMoi);
  $('#btnQuyen').classList.toggle('hidden', !S.isManager);
  $('#btnReport').classList.toggle('hidden', !S.isManager);
  const choPhep = S.isManager ? null : (xemHet ? ['work', 'board', 'table'] : ['work']);
  if (choPhep && !choPhep.includes(S.view)) S.view = 'work';
  // Quản lý mở app là vào Tổng quan trước
  if (S.isManager && !S.viewChosen) S.view = 'dash';
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x.dataset.view === S.view));
}

/* =======================  ô chọn nhân sự dùng chung  ======================= */
/* Mọi chỗ chọn người trong app đều dùng component này: có ô tìm, ảnh đại diện,
   số việc đang mở và số việc trễ — giống hệt nút chuyển vai ở góc phải. */

/** Số việc đang mở / đang trễ của một người, tính trên toàn bộ dữ liệu. */
function demViec(id) {
  let mo = 0, tre = 0;
  for (const t of S.tasks) {
    if (isClosed(t)) continue;
    if (laneOf(t, id) !== null) mo++;
    if ((t.owner || []).some((u) => u.id === id) && (isOverdue(t) || t.status === 'Trễ deadline')) tre++;
  }
  return { mo, tre };
}

/** Một dòng người: ảnh đại diện · tên · số việc đang mở · huy hiệu trễ. */
function dongNguoi(p, opt) {
  const o = opt || {};
  const row = el('div', 'as-opt' + (o.on ? ' on' : ''));
  const av = el('span', 'av av-sm', initials(p.name));
  av.style.background = colorOf(p.name);
  row.appendChild(av);
  const info = el('div', 'as-info');
  info.appendChild(el('div', 'as-name', p.name + (o.hau || '')));
  const d = demViec(p.id);
  info.appendChild(el('div', 'as-sub', d.mo + ' việc đang mở' + (d.tre ? '  ·  ' + d.tre + ' trễ' : '')));
  row.appendChild(info);
  if (d.tre) row.appendChild(el('span', 'as-late', String(d.tre)));
  return row;
}

// Các ô chọn nhân sự đã dựng, để syncFilterInputs vẽ lại khi bộ lọc đổi.
const CHON_NGUOI = {};

/**
 * Dựng ô chọn nhân sự vào thẻ có id `hostId`.
 * nhan  : chữ hiện khi chưa chọn ai
 * doc() : trả về open_id đang chọn ('' = tất cả)
 * ghi(v): lưu lựa chọn mới
 */
function lapChonNguoi(hostId, nhan, doc, ghi) {
  const host = $('#' + hostId);
  if (!host || CHON_NGUOI[hostId]) return;
  host.innerHTML = '';

  const dd = el('details', 'dd pick-dd');
  const sum = el('summary', 'dd-sum pick-sum');
  const av = el('span', 'av av-xs pick-av');
  const txt = el('span', 'dd-txt');
  sum.appendChild(av);
  sum.appendChild(txt);
  sum.appendChild(el('span', 'dd-caret', '▾'));

  const panel = el('div', 'dd-panel dd-panel-people');
  const tim = el('input', 'dd-search');
  tim.type = 'search'; tim.placeholder = 'Tìm nhân sự…'; tim.autocomplete = 'off';
  const list = el('div', 'dd-list');
  panel.appendChild(tim);
  panel.appendChild(list);

  dd.appendChild(sum);
  dd.appendChild(panel);
  host.appendChild(dd);

  const dong = () => { dd.open = false; tim.value = ''; };

  function veDanhSach() {
    const q = (tim.value || '').trim().toLowerCase();
    const dangChon = doc();
    list.innerHTML = '';

    if (!q) {
      const all = el('div', 'as-opt as-all' + (dangChon ? '' : ' on'));
      all.appendChild(el('span', 'pick-all-ico', '◎'));
      const inf = el('div', 'as-info');
      inf.appendChild(el('div', 'as-name', nhan));
      inf.appendChild(el('div', 'as-sub', S.tasks.length + ' việc, không lọc theo người'));
      all.appendChild(inf);
      all.onclick = () => { ghi(''); dong(); ve(); render(); };
      list.appendChild(all);
    }

    const me = S.meta.me;
    const ds = dsNguoi().filter((p) => !q || p.name.toLowerCase().includes(q));
    for (const p of ds) {
      const row = dongNguoi(p, { on: p.id === dangChon, hau: me && p.id === me.id ? '  (bạn)' : '' });
      row.onclick = () => { ghi(p.id); dong(); ve(); render(); };
      list.appendChild(row);
    }
    if (!ds.length) {
      list.appendChild(el('div', 'queue-empty', q ? 'Không tìm thấy ai.' : 'Chưa có ai được cấp quyền.'));
    }
  }

  /** Vẽ lại phần nút bấm cho khớp lựa chọn hiện tại. */
  function ve() {
    const id = doc();
    const p = id ? dsNguoi().find((x) => x.id === id) : null;
    sum.classList.toggle('is-picked', !!p);
    txt.classList.toggle('is-empty', !p);
    txt.textContent = p ? p.name : nhan;
    av.classList.toggle('hidden', !p);
    if (p) { av.textContent = initials(p.name); av.style.background = colorOf(p.name); }
    if (dd.open) veDanhSach();
  }

  sum.onclick = () => { setTimeout(() => { if (dd.open) { veDanhSach(); tim.focus(); } }, 0); };
  tim.oninput = veDanhSach;
  tim.onclick = (e) => e.stopPropagation();
  document.addEventListener('click', (e) => { if (dd.open && !dd.contains(e.target)) dong(); });

  CHON_NGUOI[hostId] = { ve };
  ve();
}

/* =======================  chuyển vai (quản lý)  ======================= */

/** Danh sách người trong nút chuyển vai, kèm số việc đang mở của họ. */
function renderViewAsList() {
  const box = $('#asList');
  if (!box) return;
  box.innerHTML = '';
  const q = ($('#asSearch').value || '').trim().toLowerCase();
  const me = S.meta.me;

  const dong = (p, laToi) => {
    const row = dongNguoi(p, {
      on: (S.viewAs ? S.viewAs.id : (me && me.id)) === p.id,
      hau: laToi ? '  (bạn)' : '',
    });

    row.onclick = () => {
      S.viewAs = laToi ? null : p;
      S.who = S.viewAs || me;
      $('#meSwitch').open = false;
      $('#asSearch').value = '';
      S.view = 'work';
      S.viewChosen = true;
      S.wf.lane = '';
      applyRoleChrome();
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x.dataset.view === 'work'));
      render();
    };
    return row;
  };

  // Chỉ hiện người được cấp quyền dùng app (phạm vi khả dụng trong Lark).
  // Chế độ cli không đọc được phạm vi -> đành dùng danh bạ từ Base.
  const nguon = dsNguoi();

  if (me && (!q || me.name.toLowerCase().includes(q))) {
    box.appendChild(dong(me, true));
    box.appendChild(el('div', 'as-sep', 'Người được cấp quyền dùng app'));
  }
  const ds = nguon.filter((p) => (!me || p.id !== me.id) && (!q || p.name.toLowerCase().includes(q)));
  for (const p of ds) box.appendChild(dong(p, false));

  if (!ds.length) {
    box.appendChild(el('div', 'queue-empty', q
      ? 'Không tìm thấy ai.'
      : 'Chưa cấp quyền cho ai khác. Thêm người trong Developer Console → Availability.'));
  }
}

/** Băng báo đang xem việc của người khác. */
function renderViewAsBar() {
  const bar = $('#viewAsBar');
  const on = !!S.viewAs;
  bar.classList.toggle('hidden', !on);
  if (on) {
    $('#viewAsText').textContent =
      'Bạn đang xem việc của ' + S.viewAs.name + '. Các nút thao tác của nhân sự đã tắt — ' +
      'muốn sửa thì mở chi tiết công việc.';
  }
}

/* =======================  thông báo việc mới  ======================= */
/** Thông báo luôn tính trên việc của chính mình, không theo vai đang xem. */
function newTaskIds() {
  const me = S.meta && S.meta.me && S.meta.me.id;
  if (!me) return [];
  return S.tasks
    .filter((t) => laneOf(t, me) === 'new')
    .map((t) => t.id);
}

function updateBadge() {
  const n = newTaskIds().length;
  document.title = (n ? '(' + n + ') ' : '') + 'Bảng công việc · Rooty Trip';
  const tab = document.querySelector('.tab[data-view="work"]');
  if (tab) tab.textContent = n ? 'Việc của tôi  ' + n : 'Việc của tôi';
}

function primeSeen() {
  S.seenNew = new Set(newTaskIds());
}

function notifyNew() {
  const ids = newTaskIds();
  const fresh = ids.filter((id) => !S.seenNew.has(id));
  S.seenNew = new Set(ids);
  if (!fresh.length) return;

  const titles = fresh
    .map((id) => (S.tasks.find((t) => t.id === id) || {}).title || 'công việc')
    .slice(0, 3);
  const msg = fresh.length === 1
    ? 'Việc mới: ' + titles[0]
    : fresh.length + ' việc mới cần xác nhận: ' + titles.join(' · ');

  toast(msg);
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Bạn có việc mới trên Tracking', { body: msg, tag: 'rt-new-task' });
    }
  } catch (_) {}
}

/**
 * Nhịp kiểm nền. KHÔNG ép tải lại — để cache 8 giây của server phục vụ,
 * nhờ vậy mỗi nhịp chỉ mất ~70ms thay vì ~1.4 giây, và nhiều người dùng
 * cùng lúc cũng chỉ tốn một lần gọi Lark.
 */
async function poll(epTaiLai) {
  try {
    const d = await req('/api/tasks' + (epTaiLai ? '?refresh=1' : ''));
    S.tasks = d.tasks;
    S.fetchedAt = d.fetchedAt || Date.now();
    notifyNew();
    updateBadge();
    if (!S.editing && !document.querySelector('.modal.open')) render();
  } catch (_) {}
}

/** Nhãn cho biết dữ liệu lấy từ Lark cách đây bao lâu. */
function capNhatNhanThoiGian() {
  const n = $('#btnRefresh');
  if (!n || !S.fetchedAt) return;
  const giay = Math.max(0, Math.round((Date.now() - S.fetchedAt) / 1000));
  const nhan = giay < 15 ? 'vừa xong'
    : giay < 60 ? giay + ' giây trước'
    : Math.round(giay / 60) + ' phút trước';
  n.title = 'Dữ liệu lấy từ Lark ' + nhan + ' — bấm để tải lại ngay';
  const sub = $('#subtitle');
  if (sub && S.meta) {
    sub.textContent = 'Tracking · ' + S.tasks.length +
      nhanPhamVi() + ' · ' + nhan;
  }
}

/** Quay lại tab thì cập nhật ngay — chỗ thấy "chậm" rõ nhất. */
function setupAutoRefresh() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') poll(true);
  });
  window.addEventListener('focus', () => {
    // tránh gọi dồn khi vừa chuyển tab xong
    if (Date.now() - (S.lastFocusPoll || 0) > 5000) {
      S.lastFocusPoll = Date.now();
      poll(true);
    }
  });
}

/* =======================  boot  ======================= */
function setupChrome() {
  $('#tabs').onclick = (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x === b));
    S.view = b.dataset.view;
    S.viewChosen = true;
    S.selected.clear();
    render();
  };

  let tmr;
  $('#search').oninput = (e) => {
    clearTimeout(tmr);
    tmr = setTimeout(() => { S.filters.q = e.target.value; render(); }, 180);
  };

  // bộ lọc "Việc của tôi"
  const bindW = (sel, key) => { $(sel).onchange = () => { S.wf[key] = $(sel).value; render(); }; };
  bindW('#wCampaign', 'campaign');
  bindW('#wPriority', 'priority');
  $('#wDue').onchange = () => {
    S.wf.due = $('#wDue').value;
    if (S.wf.due !== 'exact') S.wf.dueDate = '';
    syncDateInputs();
    render();
    baoKhoangLenHub(S.wf.due, S.wf.dueDate);
  };
  $('#wDueDate').onchange = () => { S.wf.dueDate = $('#wDueDate').value; render(); };

  $('#wClear').onclick = () => {
    S.wf = { campaign: '', priority: '', due: MAC_DINH_DUE, dueDate: '', lane: '' };
    S.filters.q = '';
    $('#search').value = '';
    syncFilterInputs();
    render();
  };

  // bộ lọc trang Tổng quan
  const bindD = (sel, key) => { $(sel).onchange = () => { S.df[key] = $(sel).value; render(); }; };
  bindD('#dCampaign', 'campaign');

  $('#dDue').onchange = () => {
    S.df.due = $('#dDue').value;
    if (S.df.due !== 'exact') S.df.dueDate = '';
    syncDateInputs();
    render();
    baoKhoangLenHub(S.df.due, S.df.dueDate);
  };
  $('#dDueDate').onchange = () => { S.df.dueDate = $('#dDueDate').value; render(); };

  $('#dClear').onclick = () => {
    S.df = { campaign: '', person: '', due: MAC_DINH_DUE, dueDate: '' };
    syncFilterInputs();
    render();
  };

  // bộ lọc admin
  const bind = (sel, key) => { $(sel).onchange = () => { S.filters[key] = $(sel).value; render(); }; };
  bind('#fCampaign', 'campaign');
  bind('#fWorkType', 'workType');

  bind('#fPriority', 'priority');
  bind('#fStatus', 'status');
  $('#fDue').onchange = () => {
    S.filters.due = $('#fDue').value;
    if (S.filters.due !== 'exact') S.filters.dueDate = '';
    syncDateInputs();
    render();
    baoKhoangLenHub(S.filters.due, S.filters.dueDate);
  };
  $('#fDueDate').onchange = () => { S.filters.dueDate = $('#fDueDate').value; render(); };
  $('#fHideDone').onchange = () => { S.filters.hideDone = $('#fHideDone').checked; render(); };
  $('#btnClear').onclick = () => {
    S.filters = { campaign: '', workType: '', owner: '', priority: '', status: '', due: MAC_DINH_DUE, dueDate: '', moc: '', hideDone: false, q: '' };
    $('#search').value = '';
    syncFilterInputs();
    render();
  };

  $('#btnNew').onclick = () => openDrawer(null);
  $('#btnRefresh').onclick = async () => {
    const b = $('#btnRefresh');
    b.disabled = true; b.textContent = '…';
    const t0 = Date.now();
    try {
      await refresh(true);
      toast('Đã tải lại từ Lark Base · ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    } catch (e) { toast('Lỗi: ' + e.message, true); }
    b.disabled = false; b.textContent = '⟳';
  };

  // hiện "cập nhật lúc" mỗi 10 giây để biết dữ liệu mới tới đâu
  setInterval(capNhatNhanThoiGian, 10000);

  /* X và Đóng = bỏ, không lưu. Bấm ra vùng trống = lưu luôn — để không ai gõ xong
   * rồi mất bài vì quên bấm Lưu. */
  $('#dFull').onclick = () => {
    S.suaDayDu = !S.suaDayDu;
    buildDrawer();
  };
  $('#dClose').onclick = closeDrawer;
  $('#dCancel').onclick = closeDrawer;
  $('#scrim').onclick = () => luuRoiDong();
  $('#dSave').onclick = saveDrawer;
  $('#dDelete').onclick = deleteCurrent;

  $('#doneSubmit').onclick = submitDone;
  $('#doneFile').onchange = () => {
    const f = [...($('#doneFile').files || [])];
    $('#doneFileLabel').textContent = f.length
      ? f.length + ' tệp đã chọn: ' + f.map((x) => x.name).join(', ').slice(0, 60)
      : 'Chọn tệp để đính kèm';
  };
  $('#adjSubmit').onclick = submitAdjust;
  $('#btnQuyen').onclick = openQuyen;
  $('#btnReport').onclick = () => window.open('/api/report', '_blank', 'noopener');
  $('#assignSubmit').onclick = submitAssign;

  // ---- tab Lịch ----
  const doiThang = (n) => {
    const m = S.cf.moc || startOfDay(new Date());
    S.cf.moc = new Date(m.getFullYear(), m.getMonth() + n, 1);
    S.cf.moRong = {};
    render();
  };
  $('#calPrev').onclick = () => doiThang(-1);
  $('#calNext').onclick = () => doiThang(1);
  $('#calToday').onclick = () => { S.cf.moc = startOfDay(new Date()); S.cf.moRong = {}; render(); };
  $('#calModes').onclick = (e) => {
    const b = e.target.closest('.cal-mode');
    if (!b) return;
    document.querySelectorAll('.cal-mode').forEach((x) => x.classList.toggle('is-active', x === b));
    S.cf.mode = b.dataset.mode;
    render();
  };
  let calTmr;
  $('#calSearch').oninput = (e) => {
    clearTimeout(calTmr);
    calTmr = setTimeout(() => { S.cf.q = e.target.value; renderCalendar(); }, 180);
  };
  const bindC = (sel, key) => { $(sel).onchange = () => { S.cf[key] = $(sel).value; renderCalendar(); }; };
  bindC('#calStatus', 'status');

  bindC('#calCampaign', 'campaign');
  $('#calOpenOnly').onchange = () => { S.cf.openOnly = $('#calOpenOnly').checked; renderCalendar(); };
  $('#calClear').onclick = () => {
    S.cf.q = ''; S.cf.status = ''; S.cf.person = ''; S.cf.campaign = ''; S.cf.openOnly = true;
    $('#calSearch').value = '';
    $('#calStatus').value = ''; $('#calCampaign').value = '';
    if (CHON_NGUOI.calPersonHost) CHON_NGUOI.calPersonHost.ve();
    $('#calOpenOnly').checked = true;
    renderCalendar();
  };

  // chuyển vai
  $('#asSearch').oninput = renderViewAsList;
  $('#asSearch').onclick = (e) => e.stopPropagation();
  $('#viewAsExit').onclick = () => {
    S.viewAs = null;
    S.who = S.meta.me;
    S.wf.lane = '';
    applyRoleChrome();
    render();
  };
  document.addEventListener('click', (e) => {
    const sw = $('#meSwitch');
    if (sw && sw.open && !sw.contains(e.target)) sw.open = false;
  });
  $('#quyenSave').onclick = saveQuyen;
  $('#quyenSearch').oninput = () => { if (S.quyen) renderQuyen(); };
  document.querySelectorAll('[data-close]').forEach((b) => {
    b.onclick = () => closeModal(b.dataset.close);
  });
  document.querySelectorAll('.modal').forEach((m) => {
    m.onclick = (e) => { if (e.target === m) closeModal(m.id); };
  });

  $('#bulkClear').onclick = () => { S.selected.clear(); render(); };
  $('#bulkDelete').onclick = bulkDelete;
  $('#bulkStatus').onchange = (e) => {
    const v = e.target.value;
    if (!v) return;
    e.target.value = '';
    bulkPatch({ status: v }, 'Đã đổi trạng thái');
  };
  $('#bulkPriority').onchange = (e) => {
    const v = e.target.value;
    if (!v) return;
    e.target.value = '';
    bulkPatch({ priority: v }, 'Đã đổi độ ưu tiên');
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const open = document.querySelector('.modal.open');
      if (open) closeModal(open.id);
      else if (S.editing) closeDrawer();
      else if (S.selected.size) { S.selected.clear(); render(); }
    }
    if (e.key === '/' && document.activeElement === document.body) { $('#search').focus(); e.preventDefault(); }
  });
}

(async function boot() {
  setupChrome();
  try {
    await refresh(false);
    primeSeen();
    updateBadge();
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => Notification.requestPermission().catch(() => {}), 2500);
    }
    setupAutoRefresh();
    setInterval(poll, 25000);
    // ?rec=recXXX -> mở luôn ô chi tiết việc đó (deep link từ hub hoặc từ Lark)
    const rec = new URLSearchParams(location.search).get('rec');
    if (rec) {
      const t = (S.tasks || []).find((x) => x.id === rec);
      if (t) openDrawer(t);
    }
  } catch (e) {
    toast('Không tải được dữ liệu: ' + (e && e.message), true);
  }
  $('#loader').classList.add('hidden');
})();

/* ============================================================
   Nghe lệnh từ Marketing Hub (lớp vỏ)
   Trang Tổng quan của hub bấm vào một việc -> hub nhờ app này mở ô chi tiết
   đúng việc đó. Hub không sửa dữ liệu trực tiếp, mọi quy tắc vẫn ở trong app.
   ============================================================ */
window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin) return;
  const d = ev.data || {};

  if (d.hub === 'open' && d.rec) {
    const bao = (loai) => {
      try { parent.postMessage({ hub: loai, rec: d.rec }, location.origin); } catch (e) {}
    };
    const t = (S.tasks || []).find((x) => x.id === d.rec);
    if (t) { openDrawer(t); bao('opened'); return; }
    // App vừa mở còn đang nạp Base -> im lặng, hub sẽ gửi lại sau 1s.
    // Chỉ khi đã có dữ liệu mà vẫn không thấy thì mới báo là ngoài phạm vi.
    if ((S.tasks || []).length) bao('khong-thay');
  }

  if (d.hub === 'tab' && d.v) {
    S.view = d.v;
    S.viewChosen = true;
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x.dataset.view === d.v));
    render();
  }
});

/* ============================================================
   Bấm ra vùng trống là đóng bảng chọn
   Các dropdown ở đây là <details> nên mặc định chỉ đóng khi bấm lại đúng ô —
   thao tác quen tay là bấm ra ngoài, nên bắt thêm ở document. Esc cũng đóng.
   ============================================================ */
document.addEventListener('mousedown', (e) => {
  const mo = document.querySelectorAll('details.dd[open]');
  if (!mo.length) return;
  mo.forEach((dd) => { if (!dd.contains(e.target)) dd.removeAttribute('open'); });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const mo = document.querySelectorAll('details.dd[open]');
  if (!mo.length) return;
  e.stopPropagation();                       // đừng để Esc đóng luôn cả drawer
  mo.forEach((dd) => dd.removeAttribute('open'));
}, true);
