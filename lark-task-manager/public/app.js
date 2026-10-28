'use strict';

/* =======================  state  ======================= */
/** Bộ lọc thời gian mặc định của cả app — tháng hiện tại (mã trong DUE_OPTIONS). */
const MAC_DINH_DUE = 'thismonth';

const S = {
  meta: null,
  tasks: [],
  requests: [],       // yêu cầu điều chỉnh — chỉ quản lý tải
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
  orderScope: 'mine',
  ordersError: '',
  orders: [],                // việc mình đã gửi order (tab "Việc tôi order")
  of: { campaign: '', workType: '', owner: '', status: '', due: MAC_DINH_DUE, dueDate: '', hideDone: false },   // bộ lọc tab order
  sort: { key: 'deadline', dir: 'asc' },
  colW: {},                  // độ rộng cột bảng do người dùng kéo, nhớ ở localStorage
  selected: new Set(),
  collapsed: {},             // lane key -> true
  gapViec: {},               // id việc lớn đã thu gọn -> true, nhớ ở localStorage
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

try { S.colW = JSON.parse(localStorage.getItem('tracking.colW') || '{}') || {}; } catch (e) { S.colW = {}; }
try { S.gapViec = JSON.parse(localStorage.getItem('tracking.gapViec') || '{}') || {}; } catch (e) { S.gapViec = {}; }
function luuGapViec() { try { localStorage.setItem('tracking.gapViec', JSON.stringify(S.gapViec)); } catch (e) {} }

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
    /* "Mở việc ra rồi" vì nút Yêu cầu điều chỉnh đã rời khỏi thẻ (27/10/2026) —
     * câu chỉ đường phải chỉ tới chỗ nút đang đứng thật. */
    hint: 'Đọc kỹ yêu cầu. Đủ thông tin thì bấm Bắt đầu làm; thiếu/sai thì mở việc ra rồi gửi Yêu cầu điều chỉnh.',
    empty: 'Không có việc mới nào đang chờ bạn.' },
  { key: 'redo', title: 'Cần làm lại',
    hint: 'Người order trả về. Sửa sản phẩm, cập nhật lại tệp/link rồi nộp lại.',
    empty: 'Không có việc nào bị trả về.' },
  { key: 'helping', title: 'Cần hỗ trợ',
    hint: 'Việc của người khác, bạn được thêm vào cột Người hỗ trợ.',
    empty: 'Bạn không hỗ trợ việc nào.' },
  { key: 'doing', title: 'Đang tiến hành',
    hint: 'Đính sản phẩm hoặc dán link kết quả trước khi bấm Đã gửi sản phẩm.',
    empty: 'Bạn chưa bắt đầu việc nào.' },
  { key: 'late', title: 'Đang trễ deadline',
    hint: 'Đã bị đánh dấu trễ. Ưu tiên xử lý và báo người order.',
    empty: 'Không có việc nào bị đánh dấu trễ.' },
  /* Đã gửi sản phẩm, đang đợi người order nghiệm thu. Hiện thường xuyên để
   * editor theo dõi việc còn treo (và mốc 1,5 ngày chỉnh sửa). */
  { key: 'daNop', title: 'Đã gửi · chờ nghiệm thu',
    hint: 'Đã gửi sản phẩm cho người order. Đợi nghiệm thu; nếu bị trả về sẽ chuyển sang Cần làm lại.',
    empty: 'Không có việc nào đang chờ nghiệm thu.' },
  { key: 'done', title: 'Đã hoàn thành', onlyWhenFiltered: true,
    hint: 'Đã nộp kết quả — chờ hoặc đã có chấm điểm.',
    empty: 'Chưa có việc nào hoàn thành.' },
];

/* Các thẻ đếm ở đầu trang */
const COUNTERS = ['new', 'doing', 'daNop', 'late', 'redo', 'done'];

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

/**
 * Bỏ dấu tiếng Việt để so tên.
 *
 * Mọi ô tìm người trước đây so bằng `name.toLowerCase().includes(q)`, nên gõ
 * "hung" KHÔNG ra "Lê Văn Hùng" — mà người Việt gõ tên đồng nghiệp thì hầu như
 * không bao giờ bỏ dấu ra gõ. Anh Hùng gặp đúng cảnh này ở app Chỉnh ảnh
 * (22/09/2026); bốn ô chọn người của app này dính y hệt.
 *
 * Lọc dấu bằng code point chứ không dùng regex chứa ký tự tổ hợp: dải
 * U+0300..U+036F viết thẳng vào regex rất dễ bị công cụ chuyển mã làm hỏng, mà
 * hỏng kiểu câm — hàm vẫn chạy, chỉ là hết bỏ được dấu.
 */
const khongDau = (s) => {
  const nfd = String(s == null ? '' : s).normalize('NFD');
  let out = '';
  for (const ch of nfd) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) continue;
    if (cp === 0x111 || cp === 0x110) { out += 'd'; continue; }
    out += ch;
  }
  return out.toLowerCase();
};
/** Tên có khớp từ khoá không — bỏ dấu cả hai phía rồi mới so. */
const khopTen = (ten, q) => !q || khongDau(ten).includes(khongDau(q));

const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

/* =======================  api  ======================= */
/**
 * Đọc phản hồi của máy chủ.
 *
 * Đọc dạng văn bản trước rồi mới phân tích: khi request bị cắt giữa chừng (mạng
 * rớt, lớp vỏ hết giờ chờ, máy chủ trả trang lỗi HTML) thì thân phản hồi rỗng
 * hoặc không phải JSON. Gọi thẳng .json() lúc đó ném ra "Unexpected end of JSON
 * input" — một câu chẳng ai hiểu, mà cũng chẳng nói được nên làm gì.
 */
async function docPhanHoi(r) {
  const raw = await r.text().catch(() => '');
  if (!raw.trim()) {
    return { __loi: r.ok
      ? 'Máy chủ không trả lời (kết nối bị cắt giữa chừng). Thử lại, hoặc tải tệp nhỏ hơn.'
      : 'Máy chủ báo lỗi HTTP ' + r.status + ' và không kèm nội dung.' };
  }
  try { return JSON.parse(raw); } catch (_) {
    /* KHÔNG đắp thân phản hồi vào câu báo lỗi. Thân không phải JSON thì gần
     * như luôn là trang lỗi HTML của hạ tầng (Render trả trang 502 khi tiến
     * trình đang bật lại) — anh Hùng đã gặp đúng cảnh đó ở app Quảng cáo:
     * giữa màn hình là `<!DOCTYPE html> <html lang="en">…`. */
    return { __loi: [502, 503, 504].includes(r.status)
      ? 'Máy chủ đang bật lại. Thử lại sau vài giây.'
      : 'Máy chủ trả về dữ liệu không đọc được (HTTP ' + r.status + ').' };
  }
}

async function req(url, opts) {
  const r = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
  const data = await docPhanHoi(r);
  if (!r.ok || data.error || data.__loi) {
    const e = new Error(data.error || data.__loi || 'HTTP ' + r.status);
    e.code = data.code;
    e.hint = data.hint;
    throw e;
  }
  return data;
}

async function loadAll(refresh) {
  const q = refresh ? '?refresh=1' : '';
  const [meta, tasks] = await Promise.all([req('/api/meta' + q), req('/api/tasks' + (q ? q + '&' : '?') + 'lienPhong=1')]);
  S.meta = meta;
  S.tasks = tasks.tasks;
  S.fetchedAt = tasks.fetchedAt || Date.now();
  /* Thứ tự việc con do người kéo. Hỏng thì bỏ qua và xếp theo hạn như cũ —
   * mất thứ tự tay là khó chịu, còn chặn cả trang vì nó thì vô lý. */
  try { S.thuTuCon = (await req('/api/thu-tu-con' + q)).thuTu || {}; }
  catch (_) { S.thuTuCon = S.thuTuCon || {}; }
  /* Yêu cầu điều chỉnh chỉ quản lý xử lý, nên chỉ quản lý mới phải tải.
   * Đọc vai thẳng từ meta vừa nhận, KHÔNG dùng S.isManager: cờ đó được gán ở
   * bước vẽ, tức là sau hàm này — lần nạp đầu nó vẫn còn false và danh sách
   * yêu cầu sẽ không bao giờ được tải.
   * Bảng lỗi thì bỏ qua, không được để nó chặn cả trang. */
  if (meta && meta.role === 'manager') {
    try { S.requests = (await req('/api/requests' + q)).requests || []; }
    catch (e) { S.requests = S.requests || []; }
  }
}

/* =======================  utils  ======================= */
function parseDate(v) {
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
const p2 = (n) => String(n).padStart(2, '0');

/** Tách một mốc thời gian thành ngày–giờ Việt Nam. */
function vnParts(v) {
  const d = parseDate(v);
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

function fmtDate(v, withTime) {
  const p = vnParts(v);
  if (!p) return '';
  const s = p2(p.d) + '/' + p2(p.m) + '/' + String(p.y).slice(2);
  if (!withTime) return s;
  return (p.H || p.M) ? s + ' ' + p2(p.H) + ':' + p2(p.M) : s;
}

/** Dạng đầy đủ cho ô nhập: luôn có giờ, kể cả 00:00. */
function vnText(v) {
  const p = vnParts(v);
  return p ? p2(p.d) + '/' + p2(p.m) + '/' + p.y + ' ' + p2(p.H) + ':' + p2(p.M) : '';
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
/**
 * Người order CHÍNH LÀ người làm — không còn ai đứng ngoài để nghiệm thu, nên
 * bỏ luôn bước đó (anh Hùng 27/10/2026). Bản chiếu của tuGiaoTuLam() bên máy
 * chủ: máy chủ vẫn là nơi quyết định, bên này chỉ để gọi đúng tên cái nút.
 */
function tuGiaoTuLam(t) {
  if (!t || t.lienPhong || t.maLienPhong) return false;
  const order = (t.requester || []).filter((u) => u && u.id);
  const lam = (t.owner || []).filter((u) => u && u.id);
  if (!order.length || !lam.length) return false;
  return order.every((u) => lam.some((o) => o.id === u.id));
}

/** "Đã giải quyết · trễ 6 ngày" — tính theo Ngày giải quyết, không theo hôm nay. */
function nhanGiaiQuyet(t) {
  const gq = t.ngayGiaiQuyet ? new Date(t.ngayGiaiQuyet) : null;
  const dl = t.deadline ? new Date(t.deadline) : null;
  if (!gq || !dl || isNaN(gq.getTime()) || isNaN(dl.getTime())) return 'Đã giải quyết';
  const ngay = Math.floor((startOfDay(gq) - startOfDay(dl)) / 86400000);
  return ngay > 0 ? 'Đã giải quyết · trễ ' + ngay + ' ngày' : 'Đã giải quyết';
}

/** Mốc nghiệm thu/chỉnh sửa = Ngày gửi sản phẩm + gioNghiemThu (mặc định 1,5 ngày).
 *  Trả {han, conGio, qua} hoặc null nếu chưa gửi sản phẩm. */
function hanChinhSua(t) {
  if (!t.daGiaiQuyet || !t.ngayGiaiQuyet) return null;
  const gq = new Date(t.ngayGiaiQuyet);
  if (isNaN(gq.getTime())) return null;
  const gio = (S.meta && S.meta.rules && S.meta.rules.gioNghiemThu) || 36;
  const han = new Date(gq.getTime() + gio * 3600000);
  const conMs = han.getTime() - Date.now();
  return { han, conGio: conMs / 3600000, qua: conMs < 0 };
}
/** Nhãn đếm ngược cho việc đang chờ nghiệm thu; null nếu không áp dụng. */
function nhanHanChinhSua(t) {
  const h = hanChinhSua(t);
  if (!h) return null;
  const doiGio = (g) => (g >= 24 ? (Math.round(g / 24 * 10) / 10) + ' ngày' : Math.round(g) + ' giờ');
  return h.qua
    ? { txt: 'Quá hạn chỉnh sửa ' + doiGio(-h.conGio), qua: true }
    : { txt: 'Còn ' + doiGio(h.conGio) + ' để nghiệm thu', qua: false };
}
/** Cấu hình luật từ server (meta.rules) — thiếu thì coi như đang bật. */
const cfg0 = () => ({ chanTre: !S.meta || !S.meta.rules || S.meta.rules.chanHoanThanhKhiTre !== false });

/** Dải nhiệt tải việc: đếm số việc chưa đóng theo ngày deadline cho (các) nhân sự.
 *  Trả {"y-m-d": số việc}. Chỉ quản lý có đủ S.tasks để tính thật. */
function taiTheoNgay(ownerIds) {
  const ids = new Set((ownerIds || []).filter(Boolean));
  const map = {};
  if (!ids.size) return map;
  for (const t of S.tasks || []) {
    if (isClosed(t)) continue;
    if (!(t.owner || []).some((u) => ids.has(u.id))) continue;
    const d = t.deadline ? parseDate(t.deadline) : null;
    if (!d) continue;
    const p = vnParts(d);
    const key = p.y + '-' + p.m + '-' + p.d;
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

/** Dải nhiệt theo LOẠI công việc: đếm số việc cùng loại (chưa đóng) tới hạn mỗi
 *  ngày — ngày nào dồn nhiều việc cùng loại thì "nóng". Dùng khi đã chọn Loại
 *  nhưng chưa chọn Phụ trách chính (người thường chọn sau). */
function taiTheoNgayLoai(workType) {
  const map = {};
  if (!workType) return map;
  for (const t of S.tasks || []) {
    if (t.workType !== workType || isClosed(t)) continue;
    const d = t.deadline ? parseDate(t.deadline) : null;
    if (!d) continue;
    const p = vnParts(d);
    const key = p.y + '-' + p.m + '-' + p.d;
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

/** Nhóm người thường làm một Loại công việc: suy từ lịch sử (ai từng/đang được gán
 *  loại đó), xếp theo số việc giảm dần. (Giữ lại cho các tiện ích khác.) */
function nguoiTheoLoai(workType) {
  if (!workType) return [];
  const dem = new Map();
  for (const t of S.tasks || []) {
    if (t.workType !== workType) continue;
    for (const u of t.owner || []) {
      if (!u || !u.id) continue;
      const e = dem.get(u.id) || { id: u.id, name: u.name, n: 0 };
      e.n += 1; dem.set(u.id, e);
    }
  }
  return [...dem.values()].sort((a, b) => b.n - a.n);
}

/** Dữ liệu dải nhiệt cho ô Deadline của form tạo/sửa việc.
 *  - Đã chọn Phụ trách chính -> lịch của người đó.
 *  - Chưa chọn nhưng có Loại công việc -> NHÓM dự kiến; mỗi ngày lấy người RẢNH
 *    NHẤT trong nhóm (để biết ngày nào xếp được việc và ai làm). */
function dulieuDaiNhiet(t) {
  const ow = (t.owner || []).filter((u) => u && u.id);
  if (ow.length) {
    const map = taiTheoNgay(ow.map((u) => u.id));
    return {
      bat: true,
      tieuDe: 'Lịch của ' + ow.map((u) => u.name).join(', '),
      ngay: (y, m, d) => ({ load: map[y + '-' + m + '-' + d] || 0, who: null }),
    };
  }
  /* Chưa chọn người (người thường chọn sau) nhưng đã chọn Loại công việc:
   * hiện ngay DẢI NHIỆT CỦA LOẠI đó = số việc cùng loại tới hạn mỗi ngày. Ngày
   * nào dồn nhiều việc cùng loại thì tô nóng, để biết ngày nào đang kẹt lịch loại
   * này; KHÔNG lộ tên ai. */
  if (!t.workType) return { bat: false };
  const map = taiTheoNgayLoai(t.workType);
  return {
    bat: true,
    nhom: true,
    tieuDe: 'Dải nhiệt loại ' + t.workType,
    ngay: (y, m, d) => ({ load: map[y + '-' + m + '-' + d] || 0, who: null }),
  };
}
/* Hai khái niệm khác nhau, đừng lẫn:
 *  - laTreTheoHan: đã trễ hạn, kể cả đã nộp sản phẩm  -> quyết định NÚT nào hiện.
 *  - isOverdue:    đã trễ mà chưa nộp                 -> quyết định còn nằm trong
 *                                                        hàng đợi quá hạn hay không. */
const laTreTheoHan = (t) => !isClosed(t) &&
  (t.status === 'Trễ deadline' ||
    (daysLeft(t.deadline) != null && daysLeft(t.deadline) < 0));
const isOverdue = (t) => laTreTheoHan(t) && !daGiaiQuyet(t);
/* Hai câu hỏi khác nhau, đừng dùng chung một hàm — đây từng là lỗi thật: việc
 * vừa tạo, người order gắn brief vào "Tệp đính kèm" hoặc nhập gì vào ô "Link",
 * danh sách hiện luôn "Đã có kết quả" trong khi chưa ai làm gì.
 *
 *  - daNopKetQua: NGƯỜI THỰC HIỆN đã nộp sản phẩm chưa? Chỉ đếm hai ô mà họ
 *    nộp vào: "File kết quả" và "Link kết quả". Dùng cho NHÃN.
 *  - coMinhChung: có gì ở bất kỳ ô nào không? Đếm cả "Tệp đính kèm" và "Link".
 *    Dùng cho CỔNG nộp — cổng phải rộng tay, vì lời hướng dẫn cũ từng bảo nhân
 *    sự đính sản phẩm vào "Tệp đính kèm", nên việc nộp theo lối đó không được
 *    chặn ngược. */
const daNopKetQua = (t) => (t.fileKetQua || []).length > 0 || !!t.linkKetQua;
/* Việc liên phòng: "Tệp đính kèm"/"Links" là của người giao bên công ty, KHÔNG
 * phải sản phẩm — chỉ tính kết quả của chính người nhận (khớp luật phía máy chủ). */
const coMinhChung = (t) => daNopKetQua(t) ||
  (!t.lienPhong && ((t.attachment || []).length > 0 || !!t.link));

/** Nhãn minh chứng: CHỈ hai trạng thái — đã nộp, hoặc chưa.
 *
 *  Từng có một trạng thái thứ ba cho việc chỉ có dữ liệu ở hai ô cũ. Đã bỏ, vì
 *  hai ô đó là của NGƯỜI ORDER: "Tệp đính kèm" là tệp gắn kèm yêu cầu, còn ô
 *  "Link" thì chính app gọi là "Link brief / tư liệu". Người order nhập gì vào
 *  đấy cũng không nói lên được người thực hiện đã nộp sản phẩm hay chưa — đưa
 *  nó lên nhãn chỉ làm quản lý hiểu là đã có sản phẩm trong khi chưa có.
 *
 *  Cổng nộp thì vẫn nhận hai ô cũ — xem chú thích ở coMinhChung. */
function theMinhChung(t, ngan) {
  if (daNopKetQua(t)) {
    return el('span', 'proofdot has', ngan ? 'có kết quả' : 'Đã có kết quả');
  }
  return el('span', 'proofdot missing', ngan ? 'chưa nộp' : 'Chưa nộp kết quả');
}

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

/* ==========================================================================
   CÂY VIỆC TRONG DANH SÁCH (27/10/2026)

   Trước đây danh sách phẳng: việc con rơi vào đúng chỗ mà hạn của nó rơi, nên
   cha một nơi con một nẻo, chỉ còn mũi tên ↳ để nhận ra. Anh Hùng: "cần chỉnh
   đầu tiên là cách sắp xếp, sau đó cho phép thu gọn task lớn lại dễ nhìn".

   Giờ việc con ngồi cùng làn với việc lớn của nó, kể cả khi trạng thái của nó
   thuộc làn khác — lúc đó thẻ con mang thêm một nhãn ghi làn thật của nó, để
   không ai hiểu nhầm là nó đã đổi trạng thái. Số đếm trên đầu làn vẫn đếm theo
   trạng thái thật, nên có thể lệch với số thẻ nhìn thấy trong làn; anh Hùng đã
   chọn như vậy để nhìn được trọn cây.
   ========================================================================== */

/**
 * Việc lớn ngoài cùng mà `t` nép vào, trong phạm vi những việc ĐANG hiện.
 * Cha không hiện ra (người khác làm, đã hủy, bị bộ lọc cắt đi) thì `t` tự đứng
 * làm gốc. `daQua` chặn vòng tròn cha–con: Base không canh nên dữ liệu có thể
 * có A→B→A, và một vòng như vậy đủ treo cả trang.
 */
function theGoc(t, hien, who) {
  const daQua = new Set();
  let cur = t;
  while (!daQua.has(cur.id)) {
    daQua.add(cur.id);
    const cha = hien.get(idCha(cur));
    if (!cha || laneOf(cha, who) == null) return cur;
    cur = cha;
  }
  return cur;
}

/**
 * Xếp một làn thành cây: gốc theo thứ tự cũ (quá hạn trước, rồi hạn gần, rồi ưu
 * tiên), con nằm ngay dưới cha theo thứ tự anh tự kéo. Trả về dãy phẳng đã kèm
 * cấp, để chỗ vẽ chỉ việc đi một vòng.
 */
function xepCay(items) {
  const trong = new Map(items.map((t) => [t.id, t]));
  const conTheo = new Map();
  const gocDs = [];
  for (const t of items) {
    const c = idCha(t);
    if (c && trong.has(c)) {
      if (!conTheo.has(c)) conTheo.set(c, []);
      conTheo.get(c).push(t);
    } else gocDs.push(t);
  }
  const ra = [];
  const daXep = new Set();
  /* Nhánh đang gấp: đánh dấu đã xử lý xuống tận đáy nhưng không vẽ. Thiếu bước
   * này thì vòng vét cuối hàm tưởng chúng bị bỏ sót và đẩy hết xuống cuối làn —
   * gấp lại thành ra hất việc con ra khỏi cây. */
  const bo = (t) => {
    if (daXep.has(t.id)) return;
    daXep.add(t.id);
    for (const x of conTheo.get(t.id) || []) bo(x);
  };
  const dat = (t, cap) => {
    if (daXep.has(t.id)) return;      // vòng tròn dữ liệu
    daXep.add(t.id);
    const con = conTheo.get(t.id) || [];
    ra.push({ t, cap, soCon: con.length });
    if (!con.length) return;
    if (S.gapViec[t.id]) { for (const x of con) bo(x); return; }
    for (const x of xepTheoThuTuCon(con, t.id)) dat(x, cap + 1);
  };
  for (const t of laneSort(gocDs)) dat(t, 1);
  /* Việc kẹt trong một vòng tròn không có gốc nào với tới: vẫn phải hiện ra,
   * không thì nó biến mất khỏi app mà không ai biết vì sao. */
  for (const t of items) if (!daXep.has(t.id)) ra.push({ t, cap: 1, soCon: 0 });
  return ra;
}

/** Một thẻ trong cây: thụt vào theo cấp, có nút gấp, có nhãn làn thật nếu cần. */
function theTrongCay(o, laneKey, who) {
  const laneThat = laneOf(o.t, who);
  /* Nút trên thẻ đi theo trạng thái THẬT của việc chứ không theo làn nó ngồi:
   * một việc đang tiến hành nép dưới việc lớn ở làn "Công việc mới" vẫn phải có
   * nút của việc đang làm. */
  const c = workCard(o.t, laneThat || laneKey);
  if (o.cap > 1) c.classList.add('wcard-con', 'cap-' + Math.min(o.cap, 3));
  if (laneThat && laneThat !== laneKey && LANE_BY_KEY[laneThat]) {
    const meta = c.querySelector('.wcard-meta');
    const ten = LANE_BY_KEY[laneThat].title;
    const n = el('span', 'tag tag-lan', ten);
    n.title = 'Việc này đang ở "' + ten + '". Nó nằm đây vì là việc con của việc lớn phía trên.';
    if (meta) meta.insertBefore(n, meta.firstChild);
  }
  c.insertBefore(nutGap(o), c.firstChild);
  return c;
}

/** Máy đang xin bớt chuyển động thì mọi hiệu ứng dưới đây đổi sang làm ngay. */
function itChuyenDong() {
  return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/**
 * Nút thu gọn đầu thẻ. Thẻ không mang con vẫn chừa chỗ, để tên việc thẳng hàng.
 *
 * Mũi tên XOAY chứ không đổi ký tự, và nhánh trượt ra / cụp vào thay vì biến
 * mất tức thì (anh Hùng 27/10/2026: "dạng chuyển động mượt hơn"). Mở theo nhịp
 * --cd-vao, đóng nhanh hơn theo --cd-ra, đúng nhịp chung của Hub.
 */
function nutGap(o) {
  if (!o.soCon) return el('span', 'wc-gap trong');
  const dangGap = !!S.gapViec[o.t.id];
  const b = el('button', 'wc-gap' + (dangGap ? ' cup' : ''));
  b.type = 'button';
  b.appendChild(el('span', '', '▾'));
  b.title = (dangGap ? 'Mở ra ' : 'Thu gọn ') + o.soCon + ' việc con';
  b.setAttribute('aria-expanded', dangGap ? 'false' : 'true');
  b.onclick = (e) => {
    e.stopPropagation();
    const xong = () => { luuGapViec(); render(); };
    if (dangGap) {
      delete S.gapViec[o.t.id];
      xong();
      /* Nhánh vừa hiện ra: đánh dấu để nó trượt xuống, lệch nhau một nhịp nhỏ
       * cho giống một tờ giấy mở ra chứ không phải ba thẻ nảy lên cùng lúc. */
      if (itChuyenDong()) return;
      const the = document.querySelector('#lanes .wcard[data-id="' + o.t.id + '"]');
      if (!the) return;
      theTrongNhanh(the).forEach((x, i) => {
        x.style.setProperty('--tre', (i * 40) + 'ms');
        x.classList.add('vua-mo');
      });
      return;
    }
    const the = e.target.closest('.wcard');
    const nhanh = the ? theTrongNhanh(the) : [];
    S.gapViec[o.t.id] = true;
    if (!nhanh.length || itChuyenDong()) { xong(); return; }
    /* Cụp xong mới vẽ lại: vẽ ngay thì nhánh biến mất trước khi kịp thấy gì. */
    b.classList.add('cup');
    for (const x of nhanh) x.classList.add('dang-cup');
    setTimeout(xong, 220);
  };
  return b;
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
  /* Tay nắm kéo ẩn tới khi rê chuột vào thẻ, nên phải nói ra một lần ở đây —
   * không thì không ai biết là kéo được (anh Hùng 27/10/2026). */
  if (keoGomDuoc() && list.length > 1) {
    box.appendChild(el('div', 'lanes-mach',
      'Kéo tay nắm bên trái một việc rồi thả vào việc khác để gom nó thành việc con của việc đó. '
      + 'Chia sâu tối đa ' + CAP_TOI_DA + ' cấp.'));
  }
  const who = S.who && S.who.id;

  const groups = {};
  for (const l of LANES) groups[l.key] = [];
  /* Thẻ ngồi theo làn của việc lớn ngoài cùng, không theo làn của chính nó —
   * có vậy cả cây mới nằm liền một khối. Việc Hủy/Tạm dừng vẫn ẩn như cũ. */
  const hien = new Map(list.map((t) => [t.id, t]));
  for (const t of list) {
    if (laneOf(t, who) == null) continue;
    const k = laneOf(theGoc(t, hien, who), who);
    if (groups[k]) groups[k].push(t);
  }

  /* Làn NHÁP nằm trên cùng. Nháp không đi qua laneOf() vì nó không nằm trong
   * S.tasks — /api/tasks cố ý không trả nháp, để không app nào đếm phải nó. Nên
   * vẽ riêng ở đây từ S.nhapDs.
   *
   * Chỉ hiện khi đang xem việc của CHÍNH MÌNH: quản lý bấm xem việc người khác mà
   * lại thấy nháp của mình chen vào thì rất khó hiểu. */
  const xemViecMinh = !S.viewAs;
  if (xemViecMinh && (S.nhapDs || []).length && !S.wf.lane) {
    const lane = el('div', 'lane lane-l-nhap');
    const head = el('div', 'lane-head');
    head.appendChild(el('strong', '', 'Nháp — chưa gửi đi'));
    head.appendChild(el('span', 'lh-n', String(S.nhapDs.length)));
    head.appendChild(el('span', 'lh-hint',
      'Việc anh soạn dở, chưa ai trong phòng thấy. Bấm vào để soạn tiếp rồi bấm "Tạo công việc".'));
    lane.appendChild(head);

    const body = el('div', 'lane-items');
    for (const n of S.nhapDs) {
      const c = el('div', 'wcard wcard-nhap');
      const main = el('div', 'wcard-main');
      main.appendChild(el('div', 'wcard-title', n.title || '(chưa đặt tên)'));
      if (n.detail) {
        main.appendChild(el('div', 'wcard-sub', SoanChu.chuTho(n.detail).slice(0, 150)));
      }
      const meta = el('div', 'wcard-meta');
      meta.appendChild(el('span', 'tag tag-nhap', 'Nháp'));
      if (n.workType) meta.appendChild(el('span', 'tag', n.workType));
      if (n.startAt) meta.appendChild(el('span', 'tag', 'soạn ' + nhanLucNhap(n.startAt)));
      // Nói thẳng còn thiếu gì thì mới thành việc thật được
      const thieu = [];
      if (!n.detail) thieu.push('chi tiết');
      if (!n.workType) thieu.push('loại việc');
      if (!n.deadline1) thieu.push('deadline');
      if (thieu.length) meta.appendChild(el('span', 'tag tag-thieu', 'còn thiếu: ' + thieu.join(', ')));
      main.appendChild(meta);
      c.appendChild(main);
      c.title = 'Soạn tiếp bản nháp này';
      c.onclick = () => openDrawer(null, n);
      body.appendChild(c);
    }
    lane.appendChild(body);
    box.appendChild(lane);
  }

  for (const def of LANES) {
    const items = xepCay(groups[def.key]);
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
    for (const o of items) body.appendChild(theTrongCay(o, def.key, who));
    lane.appendChild(body);

    box.appendChild(lane);
  }
}

/* ---- Việc LIÊN PHÒNG BAN (01/10/2026) ----
 * Đọc thêm từ Base "Giao việc" công ty, CHỈ ĐỌC. Anh Hùng: "hiển thị một biểu
 * tượng nhỏ, đây là công việc liên phòng ban — một dấu nhỏ thôi, không quá nổi
 * bật". Mọi chỗ vẽ tên việc đi qua veTen() nên dấu có mặt ở mọi màn. */
function dauLP(t) {
  const x = el('span', 'lp-dau', '⇄');
  x.title = t.lienPhong
    ? 'Công việc liên phòng ban · ' + (t.nguonTen || 'Base Giao việc công ty') +
      (t.nguonMa ? ' · ' + t.nguonMa : '') + (t.trangThaiGoc ? ' · ' + t.trangThaiGoc : '')
    : 'Công việc liên phòng ban — đã hoàn thành và lưu về Base phòng';
  return x;
}
function veTen(tag, cls, t) {
  const x = el(tag, cls, t.title || '(chưa có tên)');
  if (t.lienPhong || t.maLienPhong) x.appendChild(dauLP(t));
  /* Việc con: một mũi tên nhỏ trước tên, rê vào thấy tên việc lớn. Việc lớn:
   * viên "2/5" sau tên. Ngoài danh sách chỉ có vậy, phần còn lại nằm trong ô
   * chi tiết (anh Hùng 21/10/2026: không muốn rối giao diện bên ngoài). */
  if (idCha(t)) {
    const cha = viecTheoMa(idCha(t));
    /* Một mũi tên cho cấp 2, hai mũi tên cho cấp 3 — nhìn đầu dòng là biết
     * mình đang ở sâu bao nhiêu, không phải mở ra mới biết (27/10/2026). */
    const cap = capCuaViec(t);
    const m = el('span', 'ten-con' + (cap > 2 ? ' sau' : ''), '↳'.repeat(Math.max(1, cap - 1)));
    m.title = 'Việc con cấp ' + cap + (cha ? ' · thuộc: ' + cha.title : '');
    x.insertBefore(m, x.firstChild);
  }
  const vc = vienCon(t);
  if (vc) x.appendChild(vc);
  const vt = vienTin(t);
  if (vt) x.appendChild(vt);
  return x;
}

/* ==========================================================================
   TIN TRAO ĐỔI CHƯA ĐỌC (26/10/2026)
   Anh Hùng: "khi ấn vào thì không biết hội thoại nào chưa xem". Máy chủ đếm
   (/api/tin-chua-doc, cùng phép đếm với lời nhắc của hub); app gắn viên
   "N tin mới" cạnh tên việc ở mọi tab, và vạch "Tin mới" trong Trao đổi.
   ========================================================================== */
async function napChuaDoc() {
  try {
    const d = await req('/api/tin-chua-doc');
    S.chuaDoc = new Map((d.ds || []).map((x) => [x.id, x]));
  } catch (_) { if (!S.chuaDoc) S.chuaDoc = new Map(); }
}
/**
 * Thẻ có tin chưa đọc thì nháy sáng vài cái (anh Hùng 27/10/2026).
 *
 * Chỉ nháy khi SỐ tin đổi, không nháy mỗi lần vẽ lại: danh sách tự làm mới vài
 * chục giây một lần, nháy theo thì cả màn hình chớp liên tục và không ai nhìn
 * được nữa. Nhớ theo cặp "mã việc + số tin" nên tin mới tới là nháy tiếp.
 */
const DA_NHAY = new Set();
function nhayTinMoi(c, t) {
  const x = S.chuaDoc && t && S.chuaDoc.get(t.id);
  if (!x || !x.n) return;
  const khoa = t.id + ':' + x.n;
  if (DA_NHAY.has(khoa)) return;
  DA_NHAY.add(khoa);
  c.classList.add('nhay-tin');
}

function vienTin(t) {
  const x = S.chuaDoc && t && S.chuaDoc.get(t.id);
  if (!x || !x.n) return null;
  const v = el('span', 'vien-tin', x.n + ' tin mới');
  v.title = (x.nguoi ? x.nguoi + ': ' : '') + (x.trich || '') + ' (mở tab Trao đổi để đọc)';
  return v;
}
/**
 * Khối "Tin nhắn chưa đọc" đứng ĐẦU màn Tổng quan và Việc của tôi (26/10/2026).
 * Anh Hùng bấm "Kiểm tra ngay" trên lời nhắc mà "đâu biết nào chưa xem": viên
 * "N tin mới" trên thẻ nằm lẫn giữa mấy chục thẻ. Khối này gom đủ: việc nào,
 * ai nhắn, nhắn gì; bấm là mở tab Trao đổi. Không có tin chưa đọc thì ẩn hẳn.
 */
function veKhoiTinChuaDoc() {
  const ds = [...(S.chuaDoc || new Map()).values()].sort((a, b) => b.at - a.at);
  const tong = ds.reduce((s2, x) => s2 + (x.n || 0), 0);
  for (const id of ['tcdDash', 'tcdWork']) {
    const k = document.getElementById(id);
    if (!k) continue;
    k.classList.toggle('hidden', !ds.length);
    if (!ds.length) continue;
    const dau = ds.map((x) => x.id + '@' + x.at + '#' + x.n).join('|');
    if (k._dau === dau) continue;           // không đổi thì khỏi vẽ lại
    k._dau = dau;
    k.querySelector('.tcd-so').textContent = tong + ' tin · ' + ds.length + ' việc';
    const hop = k.querySelector('.tcd-ds');
    hop.innerHTML = '';
    for (const x of ds) {
      const t = timViecTheoMa(x.id);
      const dong = el('button', 'tcd-dong');
      dong.type = 'button';
      const chu = el('span', 'tcd-chu');
      const ten = el('span', 'tcd-ten', x.title || (t && t.title) || '(chưa có tên)');
      ten.appendChild(el('span', 'vien-tin', x.n + ' tin mới'));
      chu.appendChild(ten);
      chu.appendChild(el('span', 'tcd-trich', (x.nguoi ? x.nguoi + ': ' : '') + (x.trich || '')));
      dong.appendChild(chu);
      dong.appendChild(el('span', 'tcd-mo', 'Mở trao đổi ›'));
      dong.onclick = () => {
        const v = timViecTheoMa(x.id);
        if (!v) { toast('Việc này không còn trong phạm vi bạn xem.', true); return; }
        DT_TAB = 'chat';
        openDrawer(v);
      };
      hop.appendChild(dong);
    }
  }
}

/** Danh sách các việc có tin chưa đọc; bấm một dòng là mở thẳng tab Trao đổi. */
function moTinChuaDoc() {
  const ds = [...(S.chuaDoc || new Map()).values()].sort((a, b) => b.at - a.at)
    .map((x) => timViecTheoMa(x.id)).filter(Boolean);
  if (ds.length === 1) { DT_TAB = 'chat'; openDrawer(ds[0]); return; }
  moDanhSachNhanh('tin', 'Tin nhắn chưa đọc', ds, { tab: 'chat', giuThuTu: true });
}
const msGioTin = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (/^\d+$/.test(String(v))) return Number(v);
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : 0;
};

/* ==========================================================================
   VIỆC CON (21/10/2026)
   Anh Hùng: việc lớn cấu thành từ các việc con, kiểu Asana; dùng cơ chế việc
   cha – con có sẵn của Base (ô "Parent items"). Chỉ một tầng: việc con không
   chia tiếp. Tiến độ { tong, xong, tre } do máy chủ đếm trên toàn bộ việc của
   phòng (ganTienDoCon), nên đúng cả khi người xem không thấy hết việc con.
   ========================================================================== */
const idCha = (t) => ((t && t.parent) || [])[0] || '';
function viecTheoMa(id) {
  if (!id) return null;
  return (S.tasks || []).find((x) => x.id === id) || (S.orders || []).find((x) => x.id === id) || null;
}
/* ---- TẦNG VIỆC: TỐI ĐA 3 CẤP (27/10/2026) ----
   Anh Hùng: "Em giúp anh cho tối đa là 3 cấp độ". Con số này phải khớp với
   CAP_TOI_DA bên server.js — lệch nhau thì viền xanh mọc ở chỗ máy chủ sẽ từ
   chối, người ta kéo xong mới ăn lỗi. Bài test/keo-gom.test.js cột hai bên.

   Mọi phép đếm tầng dưới đây đều chặn vòng: Base không canh gì cả, ô liên kết
   ghi bừa là được A→B→A, và một vòng lặp không lối ra thì treo cả trang. */
const CAP_TOI_DA = 3;

/** Gộp S.tasks và S.orders theo id — hai mảng chồng nhau, cùng việc nằm cả hai. */
function moiViec() {
  const m = new Map();
  for (const x of [...(S.tasks || []), ...(S.orders || [])]) if (!m.has(x.id)) m.set(x.id, x);
  return m;
}

/** Việc này ở cấp mấy — 1 là việc gốc, 3 là sâu nhất. */
function capCuaViec(t) {
  if (!t) return 1;
  const kho = moiViec();
  const da = new Set([t.id]);
  let n = 1;
  let p = idCha(t);
  while (p) {
    if (da.has(p)) return CAP_TOI_DA + 1;
    da.add(p);
    n++;
    if (n > CAP_TOI_DA) return n;
    const x = kho.get(p);
    p = x ? idCha(x) : '';
  }
  return n;
}

/** Cây dưới việc này dày mấy cấp — 1 là việc không có con. */
function caoCuaViec(t) {
  if (!t) return 1;
  const con = new Map();
  for (const x of moiViec().values()) {
    if (x.status === 'Hủy') continue;
    const c = idCha(x);
    if (!c) continue;
    if (!con.has(c)) con.set(c, []);
    con.get(c).push(x.id);
  }
  const di = (k, dang) => {
    if (dang.has(k) || dang.size > CAP_TOI_DA) return 1;
    dang.add(k);
    let h = 1;
    for (const x of (con.get(k) || [])) h = Math.max(h, 1 + di(x, dang));
    dang.delete(k);
    return h;
  };
  return di(t.id, new Set());
}

/** `id` có nằm trong cây dưới `goc` không — chặn thả một việc vào con của nó. */
function namDuoiViec(id, goc) {
  const kho = moiViec();
  const x = kho.get(id);
  const da = new Set();
  let p = x ? idCha(x) : '';
  while (p) {
    if (p === goc) return true;
    if (da.has(p)) return false;
    da.add(p);
    const y = kho.get(p);
    p = y ? idCha(y) : '';
  }
  return false;
}

/**
 * Việc con người này xem được.
 *
 * Mặc định xếp theo HẠN. Nhưng nếu anh Hùng đã tự kéo thứ tự cho việc lớn này
 * thì thứ tự tay thắng — hai việc cùng hạn thì chỉ có người mới nói được cái
 * nào làm trước (27/10/2026).
 *
 * Con chưa có trong dãy đã kéo xuống cuối, vẫn xếp theo hạn giữa chúng: việc
 * mới chia ra không được chen lên đầu và xô lệch thứ tự vừa đặt.
 */
function xepTheoThuTuCon(ds, idChaCua) {
  const base = ds.slice().sort((a, b) =>
    String(a.deadline || '9').localeCompare(String(b.deadline || '9')));
  const tt = (S.thuTuCon || {})[idChaCua];
  if (!tt || !tt.length) return base;
  const viTri = new Map(tt.map((id, i) => [id, i]));
  return base.sort((a, b) => {
    const x = viTri.has(a.id) ? viTri.get(a.id) : Infinity;
    const y = viTri.has(b.id) ? viTri.get(b.id) : Infinity;
    return x - y;
  });
}
function conCua(t) {
  const m = new Map();
  for (const x of [...(S.tasks || []), ...(S.orders || [])]) if (idCha(x) === t.id) m.set(x.id, x);
  return xepTheoThuTuCon([...m.values()], t.id);
}
/** Viên "2/5" cạnh tên việc lớn. Có việc con trễ thì đỏ, xong hết thì xanh. */
function vienCon(t) {
  const c = t && t.con;
  if (!c || !c.tong) return null;
  const v = el('span', 'vien-con' + (c.xong === c.tong ? ' xong' : c.tre ? ' tre' : ''),
    c.xong + '/' + c.tong);
  v.title = c.tong + ' việc con · xong ' + c.xong + (c.tre ? ' · trễ ' + c.tre : '');
  return v;
}
/** Ai chia được việc này thành việc con. */
function chiaDuoc(t) {
  if (!t || t.isNew || t.lienPhong || S.viewAs) return false;
  /* Chia tiếp được tới cấp 3, không còn chặn cứng ở một tầng (27/10/2026). */
  if (capCuaViec(t) >= CAP_TOI_DA) return false;
  if (S.isManager) return true;
  /* Người trong phòng: mọi việc mình mở được, kể cả người bị tắt "Được tạo mới"
   * (tắt đó chỉ chặn việc lớn mới). 26/10/2026, anh Hùng: "anh muốn tất cả". */
  if (S.perm && S.perm.chiaViec) return true;
  if (!S.perm || !S.perm.taoMoi) return false;
  const me = S.meta && S.meta.me && S.meta.me.id;
  return !!me && [...(t.owner || []), ...(t.helper || [])].some((u) => u && u.id === me);
}
/**
 * Đi giữa việc lớn và việc con NGAY TRONG cửa sổ đang mở, kiểu đẩy trang của
 * iOS (anh Hùng 21/10/2026: "hiệu ứng chuyển vào trong liền lạc về tư duy công
 * việc mẹ đến việc con"). Vào việc con: trang cũ lùi sang trái, việc con trượt
 * vào từ phải. Về việc lớn: ngược lại. Không đóng rồi mở lại cửa sổ, để mắt
 * thấy mình đang đi SÂU vào cùng một việc chứ không sang việc khác.
 *
 * Vào việc con thì quản lý được mở thẳng form sửa: thường là vừa gõ tên xong,
 * vào để đặt người làm, hạn, chi tiết.
 */
let dangDiViec = false;
async function moViecKhac(x) {
  if (dangDiViec || !x) return;
  const cu = S.editing;
  const lui = !!(cu && idCha(cu) === x.id);
  /* Còn thay đổi chưa gửi của việc đang mở thì gửi nốt, như lúc đóng cửa sổ. */
  if (cu && !cu.isNew && Object.keys(S.dirty || {}).length) tuLuuViec().then(() => render()).catch(() => {});
  const giam = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lop = () => [$('#drawer .drawer-head-main'), $('#drawerBody')].filter(Boolean);
  dangDiViec = true;
  try {
    let ra = [];
    if (!giam) {
      ra = lop().map((e) => e.animate(
        [{ transform: 'none', opacity: 1 }, { transform: 'translateX(' + (lui ? '14%' : '-14%') + ')', opacity: 0 }],
        { duration: 180, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }));
      /* Tab bị ẩn hay máy đang bận thì hiệu ứng có thể không chạy hết: đừng để
       * việc chuyển trang chờ nó mãi. */
      await Promise.race([
        Promise.all(ra.map((a) => a.finished.catch(() => {}))),
        new Promise((r) => setTimeout(r, 260)),
      ]);
    }
    DT_TAB = 'info';
    openDrawer(x);
    if (!lui && idCha(x) && S.isManager && !S.suaDayDu) { S.suaDayDu = true; buildDrawer(); }
    $('#drawerBody').scrollTop = 0;
    ra.forEach((a) => a.cancel());
    if (!giam) {
      lop().forEach((e) => e.animate(
        [{ transform: 'translateX(' + (lui ? '-24%' : '24%') + ')', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 360, easing: 'cubic-bezier(.32, .72, 0, 1)' }));
    }
  } finally {
    dangDiViec = false;
  }
}
/**
 * Gõ tên rồi Enter là có việc con (anh Hùng 21/10/2026: "cho cái khung sẵn để
 * chữ là thêm task"). Không qua form: việc con nhận sẵn chiến dịch, loại việc,
 * ưu tiên và hạn của việc lớn. Để trống người phụ trách cho đến khi được chọn
 * trong form chi tiết; việc con không tham gia tự phân phối.
 * Cần đổi gì thì bấm vào việc con mà sửa như việc thường.
 */
async function taoNhanhViecCon(cha, ten) {
  const body = { title: ten, parent: [cha.id], startAt: new Date().toISOString() };
  for (const k of ['workType', 'priority', 'deadline1']) if (cha[k]) body[k] = cha[k];
  if (S.isManager) {
    if (cha.campaign) body.campaign = cha.campaign;
    if ((cha.channel || []).length) body.channel = cha.channel.slice();
    if (S.meta && S.meta.me) body.requester = [{ id: S.meta.me.id }];
  }
  const kq = await req('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
  return { kq, body };
}

/**
 * Sau khi tạo: bảo đảm việc con nằm trong S.tasks và mang đúng việc cha.
 *
 * Ngay sau lượt ghi, danh sách Lark trả về có lúc chưa kịp có ô "Parent items"
 * của bản ghi mới (hoặc chưa có bản ghi). Khi đó dòng việc con không hiện và
 * anh Hùng gõ xong không có gì để bấm vào (21/10/2026). Nên gắn tay một bản
 * tạm; lượt đọc sau của app sẽ thay bằng bản thật.
 */
function ganViecConMoi(cha, kq, body) {
  const id = kq && kq.id;
  if (!id) return;
  const coSan = (S.tasks || []).find((x) => x.id === id);
  if (coSan) {
    if (!idCha(coSan)) coSan.parent = [cha.id];
    return;
  }
  const nguoi = (ds) => (ds || []).map((u) => {
    const ai = (S.meta && S.meta.people || []).find((p) => p.id === u.id);
    return { id: u.id, name: ai ? ai.name : (S.meta && S.meta.me && S.meta.me.id === u.id ? S.meta.me.name : '') };
  });
  S.tasks.push({
    id, title: body.title, parent: [cha.id], status: 'Chờ tiếp nhận',
    priority: body.priority || null, workType: body.workType || null, campaign: body.campaign || cha.campaign || null,
    startAt: body.startAt, deadline1: body.deadline1 || null, deadline: body.deadline1 || null,
    owner: nguoi(body.owner),
    helper: [], requester: nguoi(body.requester || (S.meta && S.meta.me ? [S.meta.me] : [])),
    channel: body.channel || [], attachment: [], fileKetQua: [],
  });
}

/* ==========================================================================
 * KÉO ĐỔI THỨ TỰ VIỆC CON, VÀ CHUYỂN SANG VIỆC LỚN KHÁC   (27/10/2026)
 *
 * Anh Hùng: "anh muốn lôi các công việc con đó vào một công việc lớn khác,
 * kiểu di chuyển linh hoạt thứ tự nó đi với nhau".
 *
 * Hai việc khác hẳn nhau nên làm bằng hai cử chỉ khác nhau, cố ý:
 *
 *   ĐỔI THỨ TỰ  — kéo thả trong danh sách. Nhanh, thấy ngay, sai thì kéo lại.
 *   ĐỔI VIỆC LỚN — bấm nút, chọn trong danh sách. Đây là đổi chỗ ở của một
 *                  việc, người khác sẽ thấy nó biến mất khỏi việc lớn cũ, nên
 *                  không để nó xảy ra chỉ vì tay trượt một cái.
 *
 * Kéo bằng TAY NẮM riêng, không kéo cả dòng: cả dòng là nút mở việc con, mà
 * một phần tử vừa bấm-để-mở vừa kéo-để-xếp thì trên điện thoại gần như không
 * mở nổi — chạm nào cũng thành kéo.
 * ========================================================================== */

/** Gắn tay nắm kéo cho một dòng việc con. */
function ganKeoCon(h, x, cha) {
  const nam = el('span', 'vc-nam');
  nam.title = 'Kéo để đổi thứ tự';
  nam.setAttribute('aria-hidden', 'true');
  nam.draggable = true;
  /* Chặn click nổi lên dòng: bấm vào tay nắm không được mở việc con. */
  nam.onclick = (e) => { e.stopPropagation(); e.preventDefault(); };
  nam.ondragstart = (e) => {
    e.stopPropagation();
    /* Dọn dấu của lượt kéo trước. `dragend` thường bắn, nhưng không phải lúc
     * nào cũng bắn (thả ra ngoài cửa sổ, kéo bị huỷ giữa chừng). Còn sót một
     * dòng mang .dang-keo thì lượt sau nhặt nhầm dòng đó làm thứ đang kéo, và
     * thả vào đâu cũng không đúng chỗ. */
    [...h.parentNode.children].forEach((c) => c.classList.remove('dang-keo', 'tren', 'duoi'));
    h.classList.add('dang-keo');
    try { e.dataTransfer.setData('text/plain', x.id); } catch (_) {}
    e.dataTransfer.effectAllowed = 'move';
    /* Ảnh kéo là cả DÒNG chứ không phải mỗi tay nắm — kéo một dấu ba gạch bé
     * tí thì không biết mình đang mang cái gì đi. */
    try { e.dataTransfer.setDragImage(h, 20, 14); } catch (_) {}
  };
  nam.ondragend = () => {
    h.classList.remove('dang-keo');
    [...h.parentNode.children].forEach((c) => c.classList.remove('tren', 'duoi'));
  };
  h.insertBefore(nam, h.firstChild);

  h.ondragover = (e) => {
    const list = h.parentNode;
    const keo = list.querySelector('.dang-keo');
    if (!keo || keo === h) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    /* Thả lên nửa trên thì chèn TRƯỚC, nửa dưới thì chèn SAU. Vạch sáng cho
     * biết nó sắp rơi vào đâu — không có vạch thì phải thả ra mới biết. */
    const o = h.getBoundingClientRect();
    const tren = (e.clientY - o.top) < o.height / 2;
    [...list.children].forEach((c) => c.classList.remove('tren', 'duoi'));
    h.classList.add(tren ? 'tren' : 'duoi');
  };
  h.ondragleave = () => h.classList.remove('tren', 'duoi');
  h.ondrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const list = h.parentNode;
    const keo = list.querySelector('.dang-keo');
    const tren = h.classList.contains('tren');
    [...list.children].forEach((c) => c.classList.remove('tren', 'duoi'));
    if (!keo || keo === h) return;
    list.insertBefore(keo, tren ? h : h.nextSibling);
    const ids = [...list.children].map((c) => c.dataset.id).filter(Boolean);
    /* Vẽ lại ngay theo thứ tự mới, đừng đợi máy chủ: người ta vừa thả tay là
     * muốn thấy nó nằm đúng chỗ. Máy chủ hỏng thì nói ra và trả về như cũ. */
    S.thuTuCon = Object.assign({}, S.thuTuCon, { [cha.id]: ids });
    try {
      await req('/api/tasks/' + encodeURIComponent(cha.id) + '/thu-tu-con',
        { method: 'PUT', body: JSON.stringify({ ids }) });
    } catch (err) {
      toast('Không lưu được thứ tự: ' + err.message, 'do');
      try { S.thuTuCon = (await req('/api/thu-tu-con')).thuTu || {}; } catch (_) {}
      buildDrawer();
    }
  };
}

/* ---- Kéo thẳng một thẻ việc thả vào thẻ khác (27/10/2026) ----
 * Anh Hùng: "không kiểu kéo việc này hoặc việc con gom vào task lớn hoặc task
 * hiện có". Nút "Chuyển" vẫn giữ chứ không bỏ: điện thoại không kéo được
 * (HTML5 drag không bắn trên cảm ứng), và TáCH một việc ra khỏi việc lớn thì
 * không có thẻ nào để thả vào.
 *
 * Thẻ nằm rải ở nhiều làn khác nhau nên không dò được "cái đang kéo" bằng
 * .dang-keo trong cùng một hộp như việc con — phải nhớ ra biến này. */
let KEO_THE = null;

/** Có đủ quyền để kéo gom việc không — quyết định có hiện tay nắm hay không. */
function keoGomDuoc() {
  if (S.viewAs) return false;
  return !!(S.isManager || (S.perm && (S.perm.chiaViec || S.perm.taoMoi)));
}

/** Việc này có nhấc đi gắn chỗ khác được không. */
function nhacDiDuoc(t) {
  if (!t || t.isNew || t.lienPhong || t.status === 'Hủy') return false;
  /* Việc đang có con VẪN nhấc đi được — cả nhánh đi theo nó. Chỉ là nó chỉ
   * lọt vào được những chỗ còn đủ chỗ cho cả nhánh (27/10/2026). */
  return keoGomDuoc();
}

/**
 * Việc `con` có thả vào việc `cha` được không.
 *
 * Đây là bản chiếu của canhDoiCha() bên máy chủ. Máy chủ vẫn là nơi chặn
 * thật; cái này chỉ để viền sáng không mọc ở chỗ thả vào sẽ bị từ chối.
 */
function nhanConDuoc(cha, con) {
  if (!cha || !con || cha.id === con.id) return false;
  if (cha.isNew || con.isNew) return false;
  if (idCha(con) === cha.id) return false;            // đã nằm trong đó rồi
  if (cha.lienPhong || con.lienPhong) return false;   // bên công ty quản lý
  if (cha.status === 'Hủy' || con.status === 'Hủy') return false;
  if (namDuoiViec(cha.id, con.id)) return false;      // thả vào con của chính nó
  /* Cấp của việc đích cộng độ dày của cả nhánh đang kéo phải nằm trong 3 cấp. */
  if (capCuaViec(cha) + caoCuaViec(con) > CAP_TOI_DA) return false;
  return S.isManager || chiaDuoc(cha);
}

/** Vì sao không thả vào đây được — nói ngay trên thẻ thay vì lặng im. */
function viSaoKhongNhan(cha, con) {
  if (idCha(con) === cha.id) return 'Đã nằm trong việc này';
  if (cha.lienPhong || con.lienPhong) return 'Việc liên phòng';
  if (cha.status === 'Hủy' || con.status === 'Hủy') return 'Việc đã huỷ';
  if (namDuoiViec(cha.id, con.id)) return 'Đây là việc con của nó';
  const sau = capCuaViec(cha) + caoCuaViec(con);
  if (sau > CAP_TOI_DA) {
    return caoCuaViec(con) > 1
      ? 'Cả nhánh sẽ thành ' + sau + ' cấp, quá ' + CAP_TOI_DA
      : 'Sẽ thành cấp ' + sau + ', quá ' + CAP_TOI_DA;
  }
  return 'Bạn chưa chia được việc này';
}

/** Gom `con` vào `cha` rồi vẽ lại. */
async function gomVaoViec(cha, con) {
  try {
    await req('/api/tasks/' + encodeURIComponent(con.id),
      { method: 'PATCH', body: JSON.stringify({ parent: [cha.id] }) });
    toast('Đã gom “' + (con.title || 'việc') + '” vào “' + (cha.title || 'việc lớn') + '”', 'xanh');
    await loadAll(true);
    render();
  } catch (err) {
    toast(err.message, 'do');
  }
}

/** Cấp của một thẻ đọc từ chính lớp CSS của nó. Thẻ gốc không mang lớp cap-*. */
function capCuaThe(x) {
  const m = x.className.match(/\bcap-(\d)\b/);
  return m ? Number(m[1]) : 1;
}

/**
 * Các thẻ nằm trong nhánh của một thẻ, đọc theo thứ tự trên màn hình.
 * Cây đã được xepCay() rải phẳng đúng thứ tự nên mọi thẻ sâu hơn đứng liền
 * ngay sau nó chính là nhánh của nó.
 */
function theTrongNhanh(the) {
  const ra = [];
  const cap = capCuaThe(the);
  let n = the.nextElementSibling;
  while (n && n.classList.contains('wcard') && capCuaThe(n) > cap) {
    ra.push(n);
    n = n.nextElementSibling;
  }
  return ra;
}

/** Dọn mọi dấu kéo còn sót — dragend không phải lúc nào cũng bắn. */
function donDauKeoThe() {
  KEO_THE = null;
  document.body.classList.remove('dang-keo-the');
  /* Xấp giấy mồ côi: lượt kéo trước có thể đứt mà không ai dọn (thẻ bị vẽ lại
   * dưới chân nó, tab mất nét, trình duyệt nuốt mất pointerup). Để sót thì nó
   * nằm đè lên màn hình và không bấm được gì nữa. */
  document.querySelectorAll('.keo-bong:not(.bay-ve)').forEach((x) => x.remove());
  document.querySelectorAll('.wcard.dang-keo, .wcard.theo-cha, .wcard.nhan-con,'
    + ' .wcard.chan-con, .wcard.tha-duoc, .wcard.tha-khong, .wcard.nhuong-cho')
    .forEach((x) => {
      x.classList.remove('dang-keo', 'theo-cha', 'nhan-con', 'chan-con',
        'tha-duoc', 'tha-khong', 'nhuong-cho');
      delete x.dataset.nhan;
    });
}

/**
 * Lúc vừa nhấc một thẻ lên: chấm trước mọi thẻ còn lại thả được hay không, và
 * làm mờ cả nhánh đang bị mang theo.
 *
 * Trước đây phải rê qua từng thẻ mới biết thẻ đó có nhận không — kéo một nhánh
 * dày đi tìm chỗ đậu thành ra mò mẫm. Anh Hùng 27/10/2026: "có hiệu ứng gợi ý
 * kéo được vào cái nào", và "nắm đầu việc lớn kéo thì các việc con cũng theo".
 */
function soiChoTha(theNguon) {
  for (const x of theTrongNhanh(theNguon)) x.classList.add('theo-cha');
  for (const x of document.querySelectorAll('#lanes .wcard[data-id]')) {
    if (x === theNguon || x.classList.contains('theo-cha')) continue;
    const t = viecTheoMa(x.dataset.id);
    if (!t) continue;
    x.classList.add(nhanConDuoc(t, KEO_THE) ? 'tha-duoc' : 'tha-khong');
  }
}

/** Gắn tay nắm kéo và chỗ thả cho một thẻ việc ngoài danh sách chính. */
/* ==========================================================================
   KÉO THEO NGÓN TAY (27/10/2026)

   Bản đầu dùng cơ chế kéo sẵn của trình duyệt (draggable + dragstart). Nó chỉ
   cho MỘT tấm ảnh tĩnh của MỘT thẻ bay theo con trỏ, nên kéo một việc lớn đang
   có con thì mấy việc con chỉ mờ đi tại chỗ. Anh Hùng: "ấn kéo hiệu ứng nó
   không thật sự cho anh cảm nhận được anh cầm cả khối việc đó kéo đi".

   Nên tự làm bằng pointer events: cả xấp việc bám theo ngón tay, có độ trễ và
   hơi nghiêng theo chiều đang kéo; chỗ sắp thả tách ra nhường một khe. Đổi lại
   còn được hai thứ mà cơ chế cũ không có: kéo được trên điện thoại (cảm ứng
   không bắn sự kiện kéo HTML5), và trang tự cuộn khi rê tới mép.
   ========================================================================== */

const NGUONG_KEO = 6;      // px: dưới ngưỡng này vẫn tính là một cú bấm
let KEO = null;            // lượt kéo đang chạy

/** Dựng cái xấp giấy bay theo ngón tay: thẻ đang cầm trên cùng, con thò ra sau. */
function dungBongKeo(the, nhanh) {
  const r = the.getBoundingClientRect();
  const b = el('div', 'keo-bong');
  b.style.width = r.width + 'px';
  const lop = (x, i) => {
    const c = x.cloneNode(true);
    c.classList.remove('dang-keo', 'theo-cha', 'nhan-con', 'chan-con', 'tha-duoc', 'tha-khong', 'vua-mo', 'dang-cup');
    c.classList.add('keo-lop');
    c.style.setProperty('--i', i);
    b.appendChild(c);
  };
  lop(the, 0);
  /* Chỉ thò ra hai tờ: nhiều hơn thì cái xấp che mất danh sách bên dưới, mà
   * người ta cũng không đếm được bằng mắt — còn lại nói bằng số. */
  nhanh.slice(0, 2).forEach((x, i) => lop(x, i + 1));
  if (nhanh.length > 2) {
    b.appendChild(el('span', 'keo-them', '+' + (nhanh.length - 2) + ' việc nữa'));
  }
  document.body.appendChild(b);
  return b;
}

/** Thẻ việc nằm dưới một điểm trên màn hình. Bóng không chắn vì nó không bắt chuột. */
function theDuoiDiem(x, y) {
  const el0 = document.elementFromPoint(x, y);
  const the = el0 && el0.closest ? el0.closest('#lanes .wcard[data-id]') : null;
  if (!the || the.classList.contains('dang-keo') || the.classList.contains('theo-cha')) return null;
  const t = viecTheoMa(the.dataset.id);
  return t ? { the, t } : null;
}

/** Mỗi khung hình: đuổi theo ngón tay, nghiêng theo chiều đi, cuộn khi tới mép. */
function veBongKeo() {
  const k = KEO;
  if (!k) return;
  /* Mỗi tờ đuổi theo tờ đứng trước nó, tờ đầu đuổi theo ngón tay. Vì vậy cả
   * xấp trôi thành một cái đuôi chứ không phải một khối cứng dán chặt vào con
   * trỏ (anh Hùng 27/10/2026: "các việc nhỏ không trôi theo").
   *
   * Hệ số đuổi để thấp và biên nghiêng hẹp: kéo nhanh mà đuổi gấp thì cái xấp
   * giật từng nhịp — "hiệu ứng vừa phải, đừng rung quá". */
  k.lop.forEach((l, i) => {
    if (i === 0) {
      /* Tờ đang cầm BÁM DÍNH ngón tay, không đuổi theo. Cho nó trễ một nhịp
       * thì người kéo mất cảm giác cầm được thứ mình đang cầm (anh Hùng
       * 27/10/2026: "chỉ theo thao tác của chuột hoặc cảm ứng, tạo cảm giác
       * người dùng kiểm soát được nó"). Độ trễ chỉ dành cho mấy tờ phía sau. */
      l.x = k.dichX;
      l.y = k.dichY;
    } else {
      l.x += (k.lop[i - 1].x + 7 - l.x) * 0.26;
      l.y += (k.lop[i - 1].y + 9 - l.y) * 0.26;
    }
    /* Nghiêng rất nhẹ theo quãng vừa đi. Lấy bước nhảy từng khung hình làm góc
     * thì đó là số nhiễu và thẻ rung lập bập. */
    const muonGoc = Math.max(-3, Math.min(3, (l.x - l.truocX) * 0.5));
    l.truocX = l.x;
    l.goc += (muonGoc - l.goc) * 0.14;
    l.el.style.transform = 'translate3d(' + Math.round(l.x) + 'px,' + Math.round(l.y)
      + 'px,0) rotate(' + l.goc.toFixed(2) + 'deg)';
  });
  if (k.them) {
    const cuoi = k.lop[k.lop.length - 1];
    k.them.style.transform = 'translate3d(' + Math.round(cuoi.x + k.rong - 110) + 'px,'
      + Math.round(cuoi.y + k.cao - 6) + 'px,0)';
  }

  /* Rê tới sát mép thì trang tự chạy, không thì việc nằm ngoài màn hình là
   * không bao giờ thả vào được. Càng sát mép càng nhanh. */
  const cao = window.innerHeight;
  const tren = k.conY - 70;
  const duoi = k.conY - (cao - 70);
  if (tren < 0) window.scrollBy(0, Math.max(-16, tren / 7));
  else if (duoi > 0) window.scrollBy(0, Math.min(16, duoi / 7));

  k.raf = requestAnimationFrame(veBongKeo);
}

/** Chấm lại chỗ đang nhắm tới sau mỗi lần ngón tay nhúc nhích. */
function nhamChoTha() {
  const k = KEO;
  const moi = theDuoiDiem(k.conX, k.conY);
  if (moi && k.dich && moi.the === k.dich.the) return;
  if (k.dich) {
    k.dich.the.classList.remove('nhan-con', 'chan-con');
    delete k.dich.the.dataset.nhan;
  }
  dongKhe();
  k.dich = moi;
  if (!moi) return;
  const ok = nhanConDuoc(moi.t, k.t);
  moi.the.dataset.nhan = ok ? 'Thả vào đây' : viSaoKhongNhan(moi.t, k.t);
  moi.the.classList.toggle('nhan-con', ok);
  moi.the.classList.toggle('chan-con', !ok);
  /* Khe chỉ mở khi ngón tay DỪNG lại trên một thẻ. Mở ngay thì lướt qua năm
   * thẻ là năm lần cả danh sách nhấp nhô — anh Hùng 27/10/2026: "kéo đang
   * nhảy lung tung". Dừng lại nhắm mới là lúc cần thấy chỗ việc sẽ rơi vào. */
  if (!ok) return;
  k.hen = setTimeout(() => {
    if (!KEO || KEO.dich !== moi) return;
    const sau = moi.the.nextElementSibling;
    if (sau && sau.classList.contains('wcard')) sau.classList.add('nhuong-cho');
  }, 160);
}

/** Đóng cái khe đang mở (nếu có) và huỷ hẹn mở khe còn treo. */
function dongKhe() {
  const k = KEO;
  if (!k) return;
  clearTimeout(k.hen);
  if (k.dich) {
    const sau = k.dich.the.nextElementSibling;
    if (sau) sau.classList.remove('nhuong-cho');
  }
}

/** Đưa cái xấp về một chỗ rồi dẹp nó đi. */
function hangCanhBong(k, toi, mo) {
  const b = k.bong;
  /* Đánh dấu đang bay về: donDauKeoThe() chạy ngay sau đây và nó dọn mọi xấp
   * còn sót — không chừa cái này ra thì hiệu ứng bay về bị cắt đứt. */
  b.classList.add('bay-ve');
  if (k.them) k.them.style.opacity = '0';
  /* Cả xấp khép lại thành một chồng rồi mới về đích: từng tờ bay mỗi nơi một
   * kiểu thì nhìn như rơi vãi. */
  k.lop.forEach((l, i) => {
    l.el.style.transition = 'transform .22s cubic-bezier(.2,.7,.3,1), opacity .22s ease';
    l.el.style.transform = 'translate3d(' + Math.round(toi.x + i * 3) + 'px,'
      + Math.round(toi.y + i * 4) + 'px,0) rotate(0deg)';
    if (mo) l.el.style.opacity = '0';
  });
  setTimeout(() => b.remove(), 240);
}

function ketThucKeo(thaThat) {
  const k = KEO;
  if (!k) return;
  clearTimeout(k.hen);
  KEO = null;
  cancelAnimationFrame(k.raf);
  document.removeEventListener('keydown', k.phim, true);
  const dich = k.dich;
  const nhan = thaThat && dich && nhanConDuoc(dich.t, k.t);
  if (nhan) {
    const r = dich.the.getBoundingClientRect();
    hangCanhBong(k, { x: r.left + 18, y: r.bottom - 6 }, true);
  } else {
    /* Không thả được thì cái xấp bay về đúng chỗ nó đứng — người kéo thấy ngay
     * là không có gì thay đổi, không phải đi tìm xem việc mình vừa cầm đâu rồi. */
    const r = k.the.getBoundingClientRect();
    hangCanhBong(k, { x: r.left, y: r.top }, false);
  }
  /* Nhánh đã cụp lại lúc nhấc lên; đặt tay xuống thì nó phải trượt ra lại chứ
   * không bật về đột ngột. */
  const nhanh = nhan ? [] : (k.nhanh || []);
  donDauKeoThe();
  if (!itChuyenDong()) {
    nhanh.forEach((x, i) => {
      if (!x.isConnected) return;
      x.style.setProperty('--tre', (i * 40) + 'ms');
      x.classList.add('vua-mo');
    });
  }
  if (nhan) gomVaoViec(dich.t, k.t);
  /* gomVaoViec() tự vẽ lại; không thả được thì phải tự trả nợ những lượt làm
   * mới đã bị hoãn trong lúc kéo. */
  else if (k.noVe) render();
}

/** Gắn tay nắm kéo và chỗ thả cho một thẻ việc ngoài danh sách chính. */
function ganKeoThe(c, t) {
  if (!keoGomDuoc() || !nhacDiDuoc(t)) return;

  const nam = el('span', 'wc-nam');
  nam.title = 'Kéo thả vào một việc khác để gom vào việc đó';
  nam.setAttribute('aria-hidden', 'true');
  nam.onclick = (e) => { e.stopPropagation(); e.preventDefault(); };

  nam.onpointerdown = (e) => {
    if (e.button != null && e.button !== 0) return;     // chuột phải, chuột giữa
    e.stopPropagation();
    e.preventDefault();
    const r = c.getBoundingClientRect();
    const dat = {
      t, the: c, con: e.pointerId,
      x0: e.clientX, y0: e.clientY,
      lech: { x: r.left - e.clientX, y: r.top - e.clientY },
      chay: false,
    };
    try { nam.setPointerCapture(e.pointerId); } catch (_) {}

    const di = (ev) => {
      if (ev.pointerId !== dat.con) return;
      if (!dat.chay) {
        if (Math.abs(ev.clientX - dat.x0) + Math.abs(ev.clientY - dat.y0) < NGUONG_KEO) return;
        if (!batDauKeo(dat)) return;
      }
      KEO.conX = ev.clientX;
      KEO.conY = ev.clientY;
      KEO.dichX = ev.clientX + KEO.lech.x;
      KEO.dichY = ev.clientY + KEO.lech.y;
      nhamChoTha();
    };
    const xong = (ev) => {
      if (ev.pointerId !== dat.con) return;
      nam.removeEventListener('pointermove', di);
      nam.removeEventListener('pointerup', xong);
      nam.removeEventListener('pointercancel', huy);
      if (dat.chay) ketThucKeo(ev.type === 'pointerup');
    };
    const huy = xong;
    nam.addEventListener('pointermove', di);
    nam.addEventListener('pointerup', xong);
    nam.addEventListener('pointercancel', huy);
  };

  c.insertBefore(nam, c.firstChild);
}

/** Ngón tay đã đi quá ngưỡng: nhấc cả nhánh lên. */
function batDauKeo(dat) {
  /* Thẻ có thể đã bị vẽ lại dưới chân mình giữa lúc bấm xuống và lúc ngón tay
   * đi quá ngưỡng. Thẻ mồ côi thì mọi số đo của nó bằng 0 và cái xấp dựng ra
   * sẽ rỗng không — thà bỏ lượt kéo. */
  if (!dat.the.isConnected || !dat.the.getBoundingClientRect().width) return false;
  donDauKeoThe();
  const nhanh = theTrongNhanh(dat.the);
  dat.chay = true;
  KEO_THE = dat.t;
  const o = dat.the.getBoundingClientRect();
  const bong = dungBongKeo(dat.the, nhanh);
  const x0 = dat.x0 + dat.lech.x, y0 = dat.y0 + dat.lech.y;
  KEO = Object.assign({}, dat, {
    nhanh, bong,
    rong: o.width, cao: o.height,
    /* Mỗi tờ giữ vị trí riêng: cả xấp khởi hành từ đúng chỗ thẻ đang nằm rồi
     * mới tản ra thành đuôi, chứ không nhảy phịch ra giữa màn hình. */
    lop: [...bong.querySelectorAll('.keo-lop')].map((e2) => ({ el: e2, x: x0, y: y0, truocX: x0, goc: 0 })),
    them: bong.querySelector('.keo-them'),
    dichX: x0, dichY: y0,
    conX: dat.x0, conY: dat.y0, dich: null,
  });
  dat.the.classList.add('dang-keo');
  document.body.classList.add('dang-keo-the');
  /* Escape bỏ lượt kéo: đang cầm một nhánh mà đổi ý thì phải có đường lùi. */
  /* Đặt chỗ ngay, đừng chờ khung hình đầu tiên: chưa có transform thì cả xấp
   * nằm ở góc trên bên trái màn hình, và người kéo thấy nó nhoáng một cái. */
  KEO.lop.forEach((l) => { l.el.style.transform = 'translate3d(' + Math.round(x0) + 'px,' + Math.round(y0) + 'px,0)'; });
  KEO.phim = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ketThucKeo(false); } };
  document.addEventListener('keydown', KEO.phim, true);
  soiChoTha(dat.the);
  KEO.raf = requestAnimationFrame(veBongKeo);
  return true;
}

/**
 * Cửa sổ chọn việc lớn mới cho một việc con.
 * Chỉ hiện việc KHÔNG phải con của ai, không phải chính nó, không liên phòng.
 */
function moChonViecLon(con) {
  /* Gộp qua Map theo id: S.tasks và S.orders chồng nhau, cùng một việc nằm ở
   * cả hai thì danh sách hiện nó hai lần — đã thấy "KOL Ấn Độ 1M" ra hai dòng
   * giống hệt, không ai biết nên bấm dòng nào.
   *
   * Bỏ việc LIÊN PHÒNG khỏi danh sách đích: việc đó do bên công ty quản lý,
   * gắn con của phòng vào là tạo một quan hệ chỉ Hub nhìn thấy. */
  const gop = new Map();
  for (const x of [...(S.tasks || []), ...(S.orders || [])]) {
    if (gop.has(x.id) || x.id === con.id || x.isNew) continue;
    /* Cùng một bộ luật với viền xanh lúc kéo thả — danh sách này không được
     * mời anh chọn một chỗ mà kéo tay vào thì bị chặn. Giữ lại đúng việc lớn
     * đang chứa nó để còn hiện nhãn "đang ở đây". */
    const dangODay = !!idCha(con) && x.id === idCha(con);
    if (!dangODay && !nhanConDuoc(x, con)) continue;
    gop.set(x.id, x);
  }
  const dsGoc = [...gop.values()];

  const than = el('div', 'cvl');
  const chaCu = idCha(con) ? viecTheoMa(idCha(con)) : null;
  than.appendChild(el('div', 'cvl-dau',
    'Đang chuyển: ' + (con.title || '(chưa có tên)') +
    (chaCu ? '  ·  hiện thuộc: ' + chaCu.title : '  ·  hiện chưa thuộc việc lớn nào')));

  const o = el('input');
  o.type = 'search';
  o.placeholder = 'Gõ tên việc lớn để tìm';
  o.className = 'cvl-tim ios-khong-nhap';
  o.setAttribute('aria-label', 'Tìm việc lớn');
  than.appendChild(o);

  const ds = el('div', 'cvl-ds');
  than.appendChild(ds);

  const chuyen = async (idMoi) => {
    ds.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await req('/api/tasks/' + encodeURIComponent(con.id), {
        method: 'PATCH', body: JSON.stringify({ parent: idMoi ? [idMoi] : [] }),
      });
      dongXemNhanh();
      toast(idMoi ? 'Đã chuyển sang việc lớn mới' : 'Đã tách khỏi việc lớn', 'xanh');
      await loadAll(true);
      render();
    } catch (err) {
      ds.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      toast(err.message, 'do');
    }
  };

  const ve = () => {
    const q = chuanTim(o.value);
    ds.innerHTML = '';
    if (chaCu) {
      const b = el('button', 'cvl-o cvl-tach', 'Tách ra, không thuộc việc lớn nào');
      b.type = 'button';
      b.onclick = () => chuyen('');
      ds.appendChild(b);
    }
    const loc = dsGoc.filter((x) => !q || chuanTim(x.title || '').includes(q)).slice(0, 60);
    if (!loc.length) { ds.appendChild(el('div', 'queue-empty', 'Không có việc lớn nào khớp.')); return; }
    for (const x of loc) {
      const b = el('button', 'cvl-o' + (chaCu && x.id === chaCu.id ? ' dang' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'cvl-ten', x.title || '(chưa có tên)'));
      const c = x.con;
      if (c && c.tong) b.appendChild(el('span', 'cvl-so', c.xong + '/' + c.tong));
      if (chaCu && x.id === chaCu.id) b.appendChild(el('span', 'cvl-nhan', 'đang ở đây'));
      else b.onclick = () => chuyen(x.id);
      if (chaCu && x.id === chaCu.id) b.disabled = true;
      ds.appendChild(b);
    }
  };
  o.oninput = ve;
  ve();

  /* Dùng lại đúng lớp phủ của "xem nhanh" (.xn-lop) thay vì dựng kiểu cửa sổ
   * thứ hai: cùng nền đặc, cùng cách đóng, cùng nhịp — anh Hùng đã chốt cửa sổ
   * trong app chỉ có một dáng. */
  dongXemNhanh();
  const lop = el('div', 'xn-lop');
  lop.id = 'xnLop';
  const hop = el('div', 'xn-hop');
  const dau = el('div', 'xn-dau');
  dau.appendChild(el('b', '', 'Chuyển sang việc lớn khác'));
  dau.appendChild(el('span', 'xn-n', dsGoc.length + ' việc lớn'));
  const nutX = el('button', 'xn-x', '✕');
  nutX.type = 'button';
  nutX.onclick = dongXemNhanh;
  dau.appendChild(nutX);
  hop.appendChild(dau);
  hop.appendChild(than);
  lop.appendChild(hop);
  lop.onclick = (e) => { if (e.target === lop) dongXemNhanh(); };
  document.body.appendChild(lop);
  setTimeout(() => o.focus(), 40);
}

/** Bỏ dấu + thường hoá, để gõ "tourdeks" cũng ra "THIẾT KẾ TOURDEKS". */
function chuanTim(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd').toLowerCase().trim();
}

/**
 * Hàng "Thuộc việc lớn" trong ô chi tiết, chỉ có ở việc con.
 *
 * Tách khỏi khoiViecCon() ngày 27/10/2026: trước đây hai thứ chung một hàm và
 * hàm thoát ngay sau hàng này, nên một việc con không bao giờ có khối "Việc
 * con" của riêng nó — tức là không chia nhỏ thêm được, dù trần đã nới lên 3
 * cấp. Anh Hùng: "nếu có 3 level thì sub-task cũng có thể tạo thêm task con".
 */
function hangViecLon(t) {
  if (!t || t.isNew || t.lienPhong || !idCha(t)) return null;
  {
    const cha = viecTheoMa(idCha(t));
    const hang = el('button', 'vc-cha');
    hang.type = 'button';
    hang.appendChild(el('span', 'vc-cha-nhan', 'Thuộc việc lớn'));
    hang.appendChild(el('b', '', cha ? cha.title : 'Việc lớn bạn chưa được xem'));
    if (cha && cha.con) hang.appendChild(el('span', 'vc-cha-so', cha.con.xong + '/' + cha.con.tong + ' xong'));
    if (cha) hang.onclick = () => moViecKhac(cha);
    else hang.disabled = true;
    /* Chuyển sang việc lớn khác: nút RIÊNG bên cạnh, không nhét vào trong hàng
     * — cả hàng vốn là nút mở việc lớn, lồng nút vào nút là HTML sai và trình
     * duyệt tháo ra mất. Cùng mức quyền với chia việc con. */
    /* Ai chia được việc lớn thì chuyển được con của nó. Không hỏi chiaDuoc(t):
     * t đang LÀ việc con nên hàm đó luôn trả false — hỏi nó là không ai ngoài
     * quản lý thấy nút này. */
    if (!S.isManager && !(cha && chiaDuoc(cha))) return hang;
    const boc = el('div', 'vc-cha-boc');
    boc.appendChild(hang);
    const nut = el('button', 'vc-doi-cha', 'Chuyển');
    nut.type = 'button';
    nut.title = 'Chuyển việc này sang một việc lớn khác, hoặc tách ra';
    nut.onclick = (e) => { e.stopPropagation(); moChonViecLon(t); };
    boc.appendChild(nut);
    return boc;
  }
}

/** Khối "Việc con" trong ô chi tiết. Không có gì để nói thì null. */
function khoiViecCon(t) {
  if (!t || t.isNew || t.lienPhong) return null;

  const ds = conCua(t);
  const c = t.con || { tong: ds.filter((x) => x.status !== 'Hủy').length, xong: ds.filter((x) => x.status === 'Hoàn thành').length, tre: 0 };
  const chia = chiaDuoc(t);
  if (!c.tong && !ds.length && !chia) return null;

  const k = theKhoi('Việc con', 'viec-con');
  k.the.dataset.vc = t.id;
  if (c.tong) {
    k.dau.appendChild(el('span', 'vc-so', c.xong + '/' + c.tong + ' xong'));
    const thanh = el('div', 'vc-thanh');
    const day = el('span', '');
    day.style.width = Math.round((c.xong / c.tong) * 100) + '%';
    thanh.appendChild(day);
    k.than.appendChild(thanh);
  }
  /* Kéo đổi thứ tự và chuyển sang việc lớn khác: cùng một mức quyền như chia
   * việc con. Ai chia được thì xếp được — không đẻ thêm một loại quyền nữa. */
  const xepDuoc = chia;

  /* Mỗi dòng: chấm màu · tên · TRẠNG THÁI · người làm · hạn. Bấm là mở việc con. */
  const list = el('div', 'vc-ds');
  for (const x of ds) {
    const h = el('button', 'vc-dong' + (isClosed(x) ? ' dong' : ''));
    h.type = 'button';
    const mau = STATUS_HUE[x.status] || '#8f959e';
    const cham = el('span', 'vc-cham');
    cham.style.background = mau;
    h.appendChild(cham);
    h.appendChild(el('span', 'vc-ten', x.title || '(chưa có tên)'));
    const tt = el('span', 'vc-tt', x.status || 'Chưa đặt');
    tt.style.setProperty('--vc-mau', mau);
    h.appendChild(tt);
    const ai = (x.owner || []).map((u) => u.name).filter(Boolean)[0];
    h.appendChild(el('span', 'vc-ai' + (ai ? '' : ' chua'), ai || 'Chưa phân công'));
    h.dataset.id = x.id;
    const dl = deadlineTag(x);
    if (dl) h.appendChild(dl);
    h.title = 'Mở việc con này';
    h.onclick = () => moViecKhac(x);
    if (xepDuoc) ganKeoCon(h, x, t);
    list.appendChild(h);
  }
  if (ds.length) k.than.appendChild(list);
  if (xepDuoc && ds.length > 1) {
    k.than.appendChild(el('div', 'vc-mach', 'Kéo để đổi thứ tự. Bấm giữ tay nắm rồi thả vào chỗ muốn đặt.'));
  }
  const an = c.tong - ds.filter((x) => x.status !== 'Hủy').length;
  if (an > 0) k.than.appendChild(el('div', 'vc-an', 'Và ' + an + ' việc con của người khác.'));

  if (chia) {
    const o = el('form', 'vc-them');
    const dau = el('span', 'vc-them-dau', '+');
    const inp = el('input');
    inp.type = 'text';
    inp.maxLength = 200;
    inp.placeholder = 'Thêm việc con, gõ tên rồi Enter';
    inp.setAttribute('aria-label', 'Tên việc con mới');
    inp.classList.add('ios-khong-nhap');
    o.appendChild(dau);
    o.appendChild(inp);
    o.onsubmit = async (e) => {
      e.preventDefault();
      const ten = inp.value.trim();
      if (!ten || inp.disabled) return;
      inp.disabled = true;
      o.classList.add('dang');
      try {
        const { kq, body } = await taoNhanhViecCon(t, ten);
        await refresh(true).catch(() => {});
        ganViecConMoi(t, kq, body);
        /* Tiến độ: lượt đọc vừa rồi có thể chưa đếm việc con mới. */
        const ds = conCua(t).filter((x) => x.status !== 'Hủy');
        const c = t.con || {};
        if (!c.tong || c.tong < ds.length) {
          t.con = { tong: ds.length, xong: ds.filter((x) => x.status === 'Hoàn thành').length, tre: c.tre || 0 };
          const goc = viecTheoMa(t.id);
          if (goc) goc.con = t.con;
        }
        veLaiViecCon(t.id, true, kq && kq.id);
        /* Anh Hùng: "Enter xong thì hệ thống oke và cho anh ấn vào task đó tiếp".
         * Báo đã xong, và dòng mới sáng lên để biết bấm vào đâu. */
        toast('Đã thêm "' + ten + '". Bấm vào để chọn người làm và chi tiết.');
      } catch (err) {
        toast('Chưa thêm được việc con: ' + err.message, true);
        inp.disabled = false;
        o.classList.remove('dang');
        inp.focus();
      }
    };
    k.than.appendChild(o);
  }
  return k.the;
}
/** Vẽ lại riêng khối việc con của việc đang mở (sau khi thêm), giữ chỗ con trỏ. */
function veLaiViecCon(idViec, focus, idMoi) {
  const cu = document.querySelector('#drawer [data-vc="' + idViec + '"]');
  if (!cu || !S.editing || S.editing.id !== idViec) return;
  const moi = viecTheoMa(idViec);
  if (moi && moi.con) S.editing.con = moi.con;
  const k = khoiViecCon(S.editing);
  if (!k) return;
  cu.replaceWith(k);
  if (idMoi) {
    const dong = k.querySelector('.vc-dong[data-id="' + idMoi + '"]');
    if (dong) dong.classList.add('vc-moi');
  }
  if (focus) { const i = k.querySelector('.vc-them input'); if (i) i.focus(); }
}
/**
 * Gắn hàng "Thuộc việc lớn" rồi khối "Việc con" vào ô chi tiết, ngay sau thẻ
 * đầu (hoặc lên đầu). Một việc con có cả hai: nó thuộc về ai, và nó chia nhỏ
 * ra những gì.
 */
function ganKhoiViecCon(b, t, sauThe) {
  const moc = sauThe ? b.children[1] || null : b.firstChild;
  for (const k of [hangViecLon(t), khoiViecCon(t)]) if (k) b.insertBefore(k, moc);
}

function workCard(t, lane) {
  const c = el('div', 'wcard');
  c.dataset.id = t.id;
  /* Bấm vào đâu trên thẻ cũng mở chi tiết, không bắt nhắm đúng dòng tiêu đề
   * (27/10/2026, anh Hùng). Nút, ô nhập và tay nắm kéo giữ việc của mình. */
  c.onclick = (e) => {
    if (e.target.closest('button, a, input, select, textarea, label, .wc-nam')) return;
    openDrawer(t);
  };
  ganKeoThe(c, t);
  const d = daysLeft(t.deadline);
  if (!isClosed(t) && d != null) {
    if (d < 0) c.classList.add('late');
    else if (d <= 3) c.classList.add('soon');
  }

  nhayTinMoi(c, t);
  const main = el('div', 'wcard-main');
  main.appendChild(veTen('div', 'wcard-title', t));

  if (t.detail) {
    main.appendChild(el('div', 'wcard-sub', SoanChu.chuTho(t.detail).slice(0, 150)));
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
    meta.appendChild(theMinhChung(t, false));
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
  /* Chủ việc GỬI sản phẩm chờ nghiệm thu, không tự chốt Hoàn thành nữa —
   * nghiệm thu là của người order (tab "Việc đã order") hoặc quản lý. */
  /* Tự order cho chính mình thì nộp xong là xong — gọi đúng tên việc sắp xảy
   * ra, không hứa một bước nghiệm thu không có thật (anh Hùng 27/10/2026). */
  const tuChot = tuGiaoTuLam(t) && !laTreTheoHan(t);
  const nhanNop = tuChot ? '✓ Hoàn thành' : '✓ Đã gửi sản phẩm';
  const primary = {
    new:  { label: '▶ Bắt đầu làm', run: () => startTask(t) },
    doing: { label: nhanNop, run: () => openDone(t) },
    late:  treCanGQ
      ? { label: daGiaiQuyet(t) ? '↥ Gửi lại sản phẩm' : '↥ Gửi sản phẩm · giải quyết',
          run: () => openDone(t, 'giai-quyet') }
      : { label: nhanNop, run: () => openDone(t) },
    redo:  { label: tuChot ? '↻ Làm lại xong' : '↻ Gửi lại sản phẩm', run: () => openDone(t) },
    daNop: { label: '↥ Gửi lại sản phẩm', run: () => openDone(t) },
  }[lane];

  if (primary) {
    /* Việc liên phòng mang màu riêng: bấm nút này là ghi sang Base của công ty,
     * không phải nộp trong phòng — hai việc khác nhau thì nút đừng giống nhau
     * (anh Hùng 27/10/2026). */
    const b = el('button', 'btn btn-primary' + (t.lienPhong ? ' btn-lp' : ''), primary.label);
    b.onclick = primary.run;
    acts.appendChild(b);
    /* "Yêu cầu điều chỉnh" đã rời khỏi thẻ (27/10/2026, anh Hùng): ngoài danh
     * sách mỗi thẻ chỉ còn một nút — việc cần làm tiếp theo. Nút đó vẫn nằm
     * trong ô chi tiết, chỗ người ta đọc kỹ rồi mới xin đổi. */
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
  // 'nop' = gửi sản phẩm chờ nghiệm thu (mặc định cho editor); 'giai-quyet' = việc trễ
  // (cùng cơ chế); 'complete' = chốt Hoàn thành thẳng (quản lý).
  S.doneKieu = kieu === 'giai-quyet' ? 'giai-quyet' : (kieu === 'complete' ? 'complete' : 'nop');
  const laNop = S.doneKieu !== 'complete';
  /* Tự order cho chính mình: nộp xong là đóng luôn, nên đừng nói "chờ nghiệm
   * thu" — chẳng ai chờ ai cả (anh Hùng 27/10/2026). */
  const tuChot = laNop && tuGiaoTuLam(t) && !laTreTheoHan(t);
  S.modalTask = t;
  $('#doneEyebrow').textContent = !laNop ? 'Nghiệm thu · đóng việc'
    : (tuChot ? 'Hoàn thành · bạn tự order việc này' : 'Gửi sản phẩm · chờ nghiệm thu');
  $('#doneSubmit').textContent = laNop ? (tuChot ? 'Hoàn thành' : 'Gửi sản phẩm') : 'Xác nhận hoàn thành';
  /* Nút trong cửa sổ mang cùng màu với nút trên thẻ: cùng một hành động thì
   * cùng một màu, dù bấm ở đâu. */
  $('#doneSubmit').classList.toggle('btn-lp', !!t.lienPhong);
  $('#doneTaskName').textContent = t.title || '(chưa có tên)';
  $('#doneLink').value = t.linkKetQua || '';
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

  /* Việc liên phòng: hoàn thành là lưu một bản về Base phòng — chọn chiến dịch
   * cho bản đó (mặc định Operate). */
  const oCamp = $('#doneCampWrap');
  if (oCamp) {
    oCamp.classList.toggle('hidden', !t.lienPhong);
    if (t.lienPhong) {
      const ds = (S.meta.options && S.meta.options.campaign) || [];
      const mac = ds.includes('Operate') ? 'Operate' : (ds[0] || '');
      $('#doneCamp').innerHTML = ds.map((c) => '<option' + (c === mac ? ' selected' : '') + '>' +
        escPP(c) + '</option>').join('');
    }
  }

  const co = $('#doneCallout');
  if (coMinhChung(t)) {
    const phan = [];
    if (kq.length) phan.push(kq.length + ' file kết quả');
    if (att.length && !t.lienPhong) phan.push(att.length + ' tệp kèm yêu cầu');
    if (t.linkKetQua) phan.push('có link kết quả');
    else if (t.link && !t.lienPhong) phan.push('có link (ô cũ)');
    co.className = 'md-proof ok';
    co.textContent = 'Đã có minh chứng: ' + phan.join(' · ');
  } else {
    co.className = 'md-proof warn';
    co.textContent = laNop
      ? 'Cần dán link hoặc đính tệp sản phẩm trước khi gửi.'
      : 'Cần dán link hoặc đính tệp sản phẩm trước khi hoàn thành.';
  }
  $('#mDone').dataset.nhapKhoa = t.id;   // nháp tại máy riêng từng việc (nhap-chung.js)
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
      const r = await fetch('api/tasks/' + t.id + '/upload?cot=ket-qua', {
        method: 'POST',
        headers: { 'X-File-Name': encodeURIComponent(files[i].name) },
        body: files[i],
      });
      const d = await docPhanHoi(r);
      if (!r.ok || d.error || d.__loi) {
        throw new Error('Tệp "' + files[i].name + '": ' + (d.error || d.__loi || 'tải lên thất bại'));
      }
    }

    msg.textContent = 'Đang cập nhật trạng thái…';
    const link = $('#doneLink').value.trim();
    const note = $('#doneNote').value.trim();
    const laNop = S.doneKieu === 'nop' || S.doneKieu === 'giai-quyet';
    const kq = await req('/api/tasks/' + t.id + '/' + S.doneKieu, {
      method: 'POST',
      body: JSON.stringify({
        linkKetQua: link || undefined, note: note || undefined,
        campaign: t.lienPhong ? ($('#doneCamp').value || undefined) : undefined,
      }),
    });

    closeModal('mDone');
    /* Báo luôn chuyện báo cáo ngày (01/10/2026): Hoàn thành ở đây là báo cáo
     * hôm nay đã có sẵn dòng 100% (nháp). */
    const bc = kq && kq.baoCao;
    const duoiBC = !bc ? ''
      : bc.ok ? ' Đã thêm vào báo cáo ngày ' + (bc.nhan || 'hôm nay') + ' (nháp) — nhớ vào nộp.'
        : bc.bo === 'da-nop' ? ' Báo cáo hôm nay đã nộp — vào Báo cáo công việc cập nhật nếu cần.' : '';
    toast((t.lienPhong
      ? 'Đã gửi kết quả sang Giao việc công ty' + (kq && kq.luuVe ? ' và lưu về Base phòng.' : '.')
      : laNop
        ? 'Đã gửi sản phẩm. Đang chờ người order nghiệm thu.'
        : 'Đã hoàn thành. Người order sẽ nhận thẻ chấm điểm.') + duoiBC);
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
  /* "Yêu cầu điều chỉnh" cùng một tiêu đề cho mọi việc — gắn mã việc để nháp
   * đang gõ dở của việc A không bị mời khôi phục ở việc B (02/10/2026). */
  $('#mAdjust').dataset.nhapKhoa = t.id;
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
    .filter((p) => khopTen(p.name, q))
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
    toast('Đã lưu: ' + d.managers.length + ' quản lý. Người bị đổi quyền cần mở lại trang.');
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
      chip.appendChild(veTen('span', 'cal-chip-t', t));
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
      bar.appendChild(veTen('span', '', t));
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
    // đã có người phụ trách nhưng chưa ai bấm nhận — khác hẳn "chưa phân công"
    choNhan: open.filter((t) => t.status === 'Chờ tiếp nhận'),
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
  box.appendChild(kpiCard(D.unassigned.length, 'Chưa phân công', '', 'alert',
    () => moDanhSachNhanh('unassigned', 'Chưa phân công', D.unassigned)));
  box.appendChild(kpiCard(D.choNhan.length, 'Chờ tiếp nhận',
    'đã giao nhưng chưa ai bấm nhận', 'warn',
    () => moDanhSachNhanh('choNhan', 'Chờ tiếp nhận', D.choNhan)));
  box.appendChild(kpiCard(D.overdue.length, 'Quá hạn', '', 'alert',
    () => moDanhSachNhanh('overdue', 'Quá hạn', D.overdue)));
  box.appendChild(kpiCard(D.doing.length, 'Đang tiến hành', '', 'hot',
    () => moDanhSachNhanh('doing', 'Đang tiến hành', D.doing)));
  box.appendChild(kpiCard(diem, 'Điểm trung bình', D.scored.length + ' việc đã chấm', 'ok',
    () => moDanhSachNhanh('scored', 'Đã chấm điểm', D.scored)));
  box.appendChild(kpiCard(tyLe + '%', 'Tỉ lệ hoàn thành', dungHan + ' / ' + D.all.length, '',
    () => moDanhSachNhanh('done', 'Đã hoàn thành',
      D.all.filter((t) => t.status === 'Hoàn thành'))));
}

/**
 * Xem nhanh danh sách việc sau một con số.
 *
 * Trước đây bấm ô chỉ cuộn xuống hàng đợi tương ứng — mà chỉ ba ô có hàng đợi,
 * mấy ô còn lại bấm không ra gì. Giờ ô nào cũng mở được đúng danh sách của nó,
 * bấm một dòng là vào thẳng ô chi tiết của việc đó.
 */
/**
 * Việc nào nhắc được. Phải KHỚP với `lyDoNhacViec` bên máy chủ — client giấu nút
 * mà server vẫn nhận, hoặc ngược lại, đều là kiểu lỗi khó thấy: quản lý không
 * biết mình đang thiếu một thao tác.
 *
 * "Chờ tiếp nhận" cũng nhắc được: việc đã giao rồi mà người ta chưa bấm nhận.
 */
function nhacDuoc(t) {
  if (['Hoàn thành', 'Hủy'].includes(t.status) || t.daGiaiQuyet) return false;
  if (!(t.owner || []).length) return false;
  if (t.status === 'Chờ tiếp nhận' || t.status === 'Trễ deadline') return true;
  return !!t.deadline && daysLeft(t.deadline) < 0;
}

/** Giao một việc theo đúng người mà trung tâm phân phối đang đề xuất. */
async function giaoNhanh(t, nut) {
  nut.disabled = true;
  const cu = nut.textContent;
  nut.textContent = 'Đang giao…';
  try {
    const r = await req('/api/phan-phoi/giao', { method: 'POST', body: JSON.stringify({ id: t.id }) });
    toast('Đã giao "' + (t.title || '') + '" cho ' + r.nguoi.ten);
    dongXemNhanh();
    await loadAll(true);
  } catch (e) {
    nut.disabled = false; nut.textContent = cu;
    toast('Không giao được: ' + e.message, true);
  }
}

/** Nhắc người phụ trách một việc đang trễ. */
async function nhacNhanh(t, nut) {
  nut.disabled = true;
  const cu = nut.textContent;
  nut.textContent = 'Đang gửi…';
  try {
    const r = await req('/api/nhac', { method: 'POST', body: JSON.stringify({ id: t.id }) });
    nut.textContent = 'Đã nhắc';
    toast('Đã nhắc ' + (r.nguoi || []).join(', ') + ' — "' + r.vi + '"');
  } catch (e) {
    nut.disabled = false; nut.textContent = cu;
    /* Kèm cả `hint`: khi gửi trượt, câu lỗi chỉ nói "không gửi được", còn cách
     * sửa nằm ở hint — bỏ mất thì người dùng biết là hỏng mà không biết làm gì. */
    toast(e.message + (e.hint ? ' — ' + e.hint : ''), true);
  }
}

function moDanhSachNhanh(key, tieuDe, items, tuy) {
  tuy = tuy || {};
  const ds = tuy.giuThuTu ? (items || []).slice() : (items || []).slice().sort((a, b) => {
    const x = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const y = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return x - y;
  });

  const than = el('div', 'xn');
  if (!ds.length) {
    than.appendChild(el('div', 'queue-empty', 'Không có việc nào ở nhóm này.'));
  }
  for (const t of ds.slice(0, 200)) {
    /* KHÔNG dùng <button> cho cả hàng: hàng có nút hành động bên trong, mà button
     * lồng button là HTML không hợp lệ — trình duyệt tháo ra và hàng mất luôn khả
     * năng bấm. Dùng div + role/tabindex để vẫn bấm và vẫn đi được bằng bàn phím. */
    const dong = el('div', 'xn-o');
    dong.setAttribute('role', 'button');
    dong.tabIndex = 0;
    dong.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dong.onclick(); }
    };
    dong.appendChild(veTen('div', 'xn-ten', t));
    /* Danh sách tin chưa đọc: ai nhắn gì, ngay dưới tên việc. */
    const tinMoi = tuy.tab === 'chat' && S.chuaDoc && S.chuaDoc.get(t.id);
    if (tinMoi && (tinMoi.nguoi || tinMoi.trich)) {
      dong.appendChild(el('div', 'xn-tin', (tinMoi.nguoi ? tinMoi.nguoi + ': ' : '') + (tinMoi.trich || '')));
    }
    const meta = el('div', 'xn-meta');
    if (t.priority) meta.appendChild(el('span', 'tag ' + priClass(t.priority), plainLabel(t.priority)));
    if (t.workType) meta.appendChild(el('span', 'tag', t.workType));
    if (t.deadline) {
      const con = daysLeft(t.deadline);
      meta.appendChild(el('span', 'tag due' + (con < 0 ? ' late' : con === 0 ? ' soon' : ''),
        con < 0 ? 'Quá hạn ' + Math.abs(con) + ' ngày' : con === 0 ? 'Hạn hôm nay' : 'Còn ' + con + ' ngày'));
    }
    const ai = (t.owner || []).map((u) => u.name).join(', ');
    meta.appendChild(el('span', 'tag', ai || 'Chưa phân công'));
    dong.appendChild(meta);
    dong.onclick = () => { dongXemNhanh(); if (tuy.tab) DT_TAB = tuy.tab; openDrawer(t); };

    /* Hành động ngay tại dòng, không bắt mở drawer rồi mới làm được. Đặt trong
     * một khối riêng ngoài nút `dong` vì nút lồng trong nút là HTML không hợp lệ
     * — trình duyệt tự tháo ra và cả hàng mất luôn khả năng bấm. */
    const nut = el('div', 'xn-nut');
    if (!(t.owner || []).length) {
      const g = el('button', 'btn btn-primary btn-sm', 'Giao theo đề xuất');
      g.type = 'button';
      g.onclick = (e) => { e.stopPropagation(); giaoNhanh(t, g); };
      nut.appendChild(g);
    }
    if (nhacDuoc(t)) {
      const n = el('button', 'btn btn-sm',
        t.status === 'Chờ tiếp nhận' ? 'Nhắc nhận việc' : 'Nhắc');
      n.type = 'button';
      n.title = 'Gửi tin Lark cho người phụ trách, kèm lý do';
      n.onclick = (e) => { e.stopPropagation(); nhacNhanh(t, n); };
      nut.appendChild(n);
    }
    if (nut.childElementCount) dong.appendChild(nut);
    than.appendChild(dong);
  }

  dongXemNhanh();
  const lop = el('div', 'xn-lop');
  lop.id = 'xnLop';
  const hop = el('div', 'xn-hop');
  const dau = el('div', 'xn-dau');
  dau.appendChild(el('b', '', tieuDe));
  dau.appendChild(el('span', 'xn-n', ds.length + ' việc'));
  const x = el('button', 'xn-x', '✕');
  x.type = 'button';
  x.onclick = dongXemNhanh;
  dau.appendChild(x);
  hop.appendChild(dau);
  hop.appendChild(than);
  lop.appendChild(hop);
  lop.onclick = (e) => { if (e.target === lop) dongXemNhanh(); };
  document.body.appendChild(lop);
  void key;
}

function dongXemNhanh() {
  const o = document.getElementById('xnLop');
  if (o) o.remove();
}

function khoiYeuCau() {
  const ds = (S.requests || []).filter((r) => !r.handled);
  const box = el('div', 'queue queue-alert');
  box.dataset.q = 'yeucau';

  const head = el('div', 'queue-head');
  head.appendChild(el('strong', '', 'Yêu cầu điều chỉnh'));
  head.appendChild(el('span', 'queue-n', String(ds.length)));
  box.appendChild(head);
  box.appendChild(el('div', 'queue-hint',
    'Nhân sự xin đổi thông tin do người order giữ. Sửa ở ô chi tiết việc, rồi bấm Đã xử lý.'));

  const list = el('div', 'queue-list');
  if (!ds.length) {
    list.appendChild(el('div', 'queue-empty', 'Không còn yêu cầu nào chờ trả lời.'));
  }

  for (const y of ds) {
    const row = el('div', 'queue-row');
    const main = el('div', 'queue-main');

    const ttl = el('div', 'queue-title', y.taskTitle || '(không rõ việc)');
    const viec = (S.tasks || []).find((t) => (y.taskIds || []).includes(t.id));
    if (viec) ttl.onclick = () => openDrawer(viec);
    main.appendChild(ttl);

    const meta = el('div', 'queue-meta');
    for (const p of (y.parts || [])) meta.appendChild(el('span', 'tag', p));
    const ai = (y.sender || []).map((u) => u.name).join(', ');
    if (ai) meta.appendChild(el('span', 'tag', ai));
    main.appendChild(meta);

    // Nội dung đề xuất là thứ quản lý cần đọc để quyết — cho ra hẳn một dòng
    main.appendChild(el('div', 'yc-noi', y.proposal || ''));
    if (y.reason) main.appendChild(el('div', 'yc-ly', 'Lý do: ' + y.reason));
    row.appendChild(main);

    const acts = el('div', 'queue-act');
    if (viec) {
      const b1 = el('button', 'btn small', 'Mở việc');
      b1.onclick = () => openDrawer(viec);
      acts.appendChild(b1);
    }
    const b2 = el('button', 'btn small btn-primary', 'Đã xử lý');
    b2.onclick = async () => {
      b2.disabled = true;
      try {
        await req('/api/requests/' + y.id + '/xong', { method: 'POST' });
        toast('Đã đánh dấu xử lý xong');
        await refresh(true);
      } catch (e) { b2.disabled = false; toast('Lỗi: ' + e.message, true); }
    };
    acts.appendChild(b2);
    row.appendChild(acts);
    list.appendChild(row);
  }

  box.appendChild(list);
  return box;
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
    const ttl = veTen('div', 'queue-title', t);
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
  box.appendChild(khoiYeuCau());
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
      const ttl = veTen('div', 'dcard-title', t);
      ttl.onclick = () => openDrawer(t);
      row.appendChild(ttl);

      const meta = el('div', 'dcard-meta');
      if (t.priority) meta.appendChild(el('span', 'tag ' + priClass(t.priority), plainLabel(t.priority)));
      const dl = deadlineTag(t);
      if (dl) meta.appendChild(dl);
      if (t.status === 'Làm lại') meta.appendChild(el('span', 'tag p-mid', 'Làm lại'));
      meta.appendChild(theMinhChung(t, true));
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

  S.assignDl = t.deadline1 || t.deadline2 || null;
  const hopHan = $('#assignDeadline');
  hopHan.innerHTML = '';
  hopHan.appendChild(ngayInput(S.assignDl, (v) => { S.assignDl = v; }));
  fillNativeSelect($('#assignPriority'), o.priority, t.priority, '— Ưu tiên —');
  fillNativeSelect($('#assignType'), o.workType, t.workType, '— Loại việc —');
  /* Campain ở đây cũng phải thêm mới được, y như trong drawer — cùng một việc
   * mà chỗ làm được chỗ không thì người dùng chỉ nhớ được "lúc được lúc không".
   * Giữ giá trị trong S như hai ô kia của modal này (S.assignPick, S.assignDl),
   * vì ô này không còn là <select> để đọc `.value`. */
  S.assignCampaign = t.campaign || null;
  const hopCd = $('#assignCampaign');
  hopCd.innerHTML = '';
  hopCd.appendChild(campaignInput(t.campaign, o.campaign, (v) => { S.assignCampaign = v; }));
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
  if (S.assignDl) patch.deadline1 = S.assignDl;
  const pri = $('#assignPriority').value;
  if (pri) patch.priority = pri;
  const wt = $('#assignType').value;
  if (wt) patch.workType = wt;
  const cp = S.assignCampaign;
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
  // Kanban có thể vẽ trước khi /api/meta về (bấm tab sớm) — chưa có thứ tự cột thì để trống, khỏi văng lỗi
  const groups = new Map(((S.meta && S.meta.statusOrder) || []).map((s) => [s, []]));
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
        if (!t || t.lienPhong || t.status === status) return;
        await patchTask(t, { status }, 'Đã chuyển sang "' + status + '"');
      });
    }
    board.appendChild(col);
  }
}

function taskCard(t) {
  const c = el('div', 'card');
  if (S.selected.has(t.id)) c.classList.add('is-selected');
  c.draggable = !t.lienPhong;   // việc liên phòng: chỉ đọc, không kéo đổi trạng thái
  c.dataset.id = t.id;
  c.appendChild(veTen('div', 'card-title', t));

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
/* Thứ tự cột ưu tiên theo yêu cầu quản lý; `w` là độ rộng mặc định (px),
 * người dùng kéo mép để đổi và được nhớ trong localStorage. */
const COLS = [
  { key: '_check', label: '', sort: false, w: 36 },
  { key: 'title', label: 'Công việc', w: 230 },
  { key: 'detail', label: 'Chi tiết', sort: false, w: 300 },
  { key: 'campaign', label: 'Chiến dịch', w: 150 },
  { key: 'deadline', label: 'Deadline', w: 150 },
  { key: 'requester', label: 'Người order', sort: false, w: 140 },
  { key: 'owner', label: 'Phụ trách', w: 140 },
  { key: 'priority', label: 'Ưu tiên', w: 130 },
  { key: 'workType', label: 'Loại việc', w: 130 },
  { key: 'status', label: 'Trạng thái', w: 150 },
  { key: 'rating', label: 'Điểm', w: 90 },
];

function saveColW() { try { localStorage.setItem('tracking.colW', JSON.stringify(S.colW)); } catch (e) {} }
function colWidth(c) { const w = S.colW[c.key]; return (typeof w === 'number' && w > 0) ? w : c.w; }
function tableWidth() { return COLS.reduce((s, c) => s + colWidth(c), 0); }

function renderTable(list) {
  const wrap = $('#table');
  wrap.innerHTML = '';
  const table = el('table', 'tb-fixed');
  // Chiều rộng cố định = tổng cột (table-layout:fixed cần width tường minh, tránh phình)
  table.style.width = tableWidth() + 'px';

  // colgroup giữ độ rộng cột — table-layout:fixed nên đây là nguồn chuẩn
  const cg = el('colgroup');
  for (const c of COLS) {
    const col = el('col');
    col.style.width = colWidth(c) + 'px';
    cg.appendChild(col);
  }
  table.appendChild(cg);

  const thead = el('thead');
  const trh = el('tr');

  COLS.forEach((c, i) => {
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
      th.appendChild(el('span', 'th-lab',
        c.label + (S.sort.key === c.key ? (S.sort.dir === 'asc' ? '  ↑' : '  ↓') : '')));
      if (c.sort !== false) {
        th.onclick = () => {
          if (S.sort.key === c.key) S.sort.dir = S.sort.dir === 'asc' ? 'desc' : 'asc';
          else S.sort = { key: c.key, dir: 'asc' };
          render();
        };
      }
    }
    if (i < COLS.length - 1) th.appendChild(colResizer(cg, i, c));
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tb = el('tbody');
  for (const t of sortTasks(list)) tb.appendChild(tableRow(t));
  table.appendChild(tb);
  wrap.appendChild(table);
}

/** Tay kéo ở mép phải tiêu đề cột: kéo đổi độ rộng, bấm đúp về mặc định. */
function colResizer(cg, idx, c) {
  const h = el('div', 'col-resize');
  h.title = 'Kéo để chỉnh độ rộng · bấm đúp để về mặc định';
  h.onclick = (e) => e.stopPropagation();
  h.ondblclick = (e) => { e.stopPropagation(); delete S.colW[c.key]; saveColW(); render(); };
  h.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const col = cg.children[idx];
    const startX = e.clientX;
    // Đo từ ô tiêu đề <th> — <col>.getBoundingClientRect() không đáng tin (trả sai số)
    const startW = h.parentElement.getBoundingClientRect().width;
    document.body.classList.add('col-resizing');
    const move = (ev) => {
      const w = Math.max(60, Math.round(startW + (ev.clientX - startX)));
      col.style.width = w + 'px';
      S.colW[c.key] = w;
      cg.parentElement.style.width = tableWidth() + 'px';   // giữ bảng khớp tổng cột
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('col-resizing');
      saveColW();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  return h;
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

/** Ô người dùng (avatar chồng) cho Người order / Phụ trách. */
function personCell(users) {
  const td = el('td', 'c-people');
  const arr = users || [];
  if (!arr.length) { td.appendChild(el('span', 'muted', '—')); return td; }
  const av = el('div', 'avatars');
  for (const u of arr.slice(0, 3)) {
    const a = el('div', 'av', initials(u.name));
    a.style.background = colorOf(u.name);
    a.title = u.name;
    av.appendChild(a);
  }
  if (arr.length > 3) av.appendChild(el('div', 'av av-more', '+' + (arr.length - 3)));
  td.appendChild(av);
  return td;
}

function tableRow(t) {
  const tr = el('tr', 'row-click');
  if (S.selected.has(t.id)) tr.classList.add('is-selected');
  // Bấm bất kỳ đâu trên hàng -> mở cửa sổ chi tiết (trừ checkbox/ô sửa nhanh đã chặn nổi bọt)
  tr.onclick = () => openDrawer(t);

  const tdc = el('td', 'c-check');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.checked = S.selected.has(t.id);
  cb.onclick = (e) => e.stopPropagation();
  cb.onchange = () => toggleSelect(t.id);
  tdc.appendChild(cb);
  tr.appendChild(tdc);

  // Công việc
  const tdt = veTen('td', 'c-title cell-ell', t);
  tdt.title = t.title || '';
  tr.appendChild(tdt);

  // Chi tiết (rút gọn một dòng, xem đầy đủ trong cửa sổ chi tiết)
  const det = SoanChu.chuTho(t.detail);
  const tdd2 = el('td', 'c-detail cell-ell', det || '—');
  tdd2.title = det;
  tr.appendChild(tdd2);

  // Chiến dịch
  tr.appendChild(el('td', 'cell-ell', t.campaign || '—'));

  // Deadline
  const tdd = el('td');
  const dl = deadlineTag(t);
  tdd.appendChild(dl || el('span', 'muted', '—'));
  tr.appendChild(tdd);

  // Người order · Phụ trách
  tr.appendChild(personCell(t.requester));
  tr.appendChild(personCell(t.owner));

  // Ưu tiên (sửa nhanh)
  const tdp = el('td');
  tdp.appendChild(inlineSelect(t, 'priority', S.meta.options.priority));
  tr.appendChild(tdp);

  // Loại việc
  tr.appendChild(el('td', 'cell-ell', t.workType || '—'));

  // Trạng thái (sửa nhanh)
  const tds = el('td');
  tds.appendChild(inlineSelect(t, 'status', S.meta.options.status));
  tr.appendChild(tds);

  // Điểm
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

/**
 * Ô nhập ngày giờ dùng chung.
 *
 * Không dùng <input type="datetime-local">: trình duyệt vẽ ô đó theo ngôn ngữ
 * của chính nó, máy nào cũng ra "08/29/2026 11:40 AM" — vừa lộn ngày với tháng
 * vừa 12 giờ sáng chiều. Ô này gõ và hiện đúng một dạng dd/mm/yyyy HH:mm.
 *
 * @param {string|null} value  mốc hiện tại (ISO)
 * @param {(iso:string|null)=>void} onChange
 */
function ngayInput(value, onChange, opts) {
  const boc = el('div', 'ng');
  const inp = el('input');
  inp.type = 'text';
  inp.className = 'ng-in';
  inp.placeholder = 'dd/mm/yyyy hh:mm';
  inp.autocomplete = 'off';
  inp.value = vnText(value);

  const nut = el('button', 'ng-nut');
  nut.type = 'button';
  nut.title = 'Chọn trên lịch';
  nut.innerHTML = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="1.5"/>' +
    '<path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke-linecap="round"/></svg>';

  boc.appendChild(inp);
  boc.appendChild(nut);

  let iso = value || null;
  const dat = (v, goi) => {
    iso = v;
    inp.value = vnText(v);
    if (goi !== false) onChange(v);
  };

  // Gõ tay đọc lúc rời ô: gõ đúng thì viết lại cho chuẩn dạng, gõ sai thì trả
  // về giá trị cũ chứ không im lặng nuốt mất.
  inp.onchange = () => {
    if (!inp.value.trim()) { dat(null); return; }
    const v = docNgayVN(inp.value);
    if (v) dat(v);
    else { inp.value = vnText(iso); toast('Ngày giờ phải theo dạng dd/mm/yyyy hh:mm', 'err'); }
  };

  let pop = null;
  let xem = null;            // tháng đang xem
  const dong = () => { if (pop) { pop.remove(); pop = null; boc.classList.remove('mo'); } };

  const ve = () => {
    if (pop) pop.remove();
    pop = el('div', 'ng-pop');
    const chon = iso ? vnParts(iso) : null;
    const nay = vnParts(new Date());
    if (!xem) xem = { y: (chon || nay).y, m: (chon || nay).m };

    // Dải nhiệt tải việc (nếu form truyền vào): tô ngày bận của người phụ trách,
    // hoặc — khi chưa chọn người — của nhóm dự kiến theo Loại công việc.
    const DN = opts && typeof opts.dulieu === 'function' ? opts.dulieu() : null;
    const heat = DN && DN.bat ? DN : null;
    const NGUONG_TAI = 4;   // >= 4 việc/ngày = quá tải (cùng ngưỡng với hub)
    const oNgay = (y, m, d) => (heat ? (heat.ngay(y, m, d) || { load: 0, who: null }) : { load: 0, who: null });
    // 3 ngày nguội gần nhất (load < 2) — vừa để gợi ý vừa để tô viền ánh sáng trên lịch.
    const goiNgay = [];
    if (heat) {
      const d0g = new Date();
      for (let i = 1; i <= 30 && goiNgay.length < 3; i++) {
        const p = vnParts(new Date(d0g.getTime() + i * 86400000));
        if ((oNgay(p.y, p.m, p.d).load || 0) < 2) goiNgay.push(p);
      }
    }
    const laGoi = (y, m, d) => goiNgay.some((g) => g.y === y && g.m === m && g.d === d);

    const dau = el('div', 'ng-dau');
    const lui = el('button', 'ng-dh', '‹'); lui.type = 'button';
    const toi = el('button', 'ng-dh', '›'); toi.type = 'button';
    lui.onclick = () => { xem.m--; if (xem.m < 1) { xem.m = 12; xem.y--; } ve(); };
    toi.onclick = () => { xem.m++; if (xem.m > 12) { xem.m = 1; xem.y++; } ve(); };
    dau.appendChild(lui);
    dau.appendChild(el('span', 'ng-thang', 'Tháng ' + xem.m + ' / ' + xem.y));
    dau.appendChild(toi);
    pop.appendChild(dau);

    const thu = el('div', 'ng-thu');
    // tuần bắt đầu từ thứ Hai, đúng thói quen bảng biểu trong nước
    ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].forEach((x) => thu.appendChild(el('span', '', x)));
    pop.appendChild(thu);

    const luoi = el('div', 'ng-luoi');
    const dem = (new Date(Date.UTC(xem.y, xem.m - 1, 1)).getUTCDay() + 6) % 7;
    for (let i = 0; i < dem; i++) luoi.appendChild(el('span', 'ng-o mo'));
    const soNgay = new Date(Date.UTC(xem.y, xem.m, 0)).getUTCDate();
    for (let d = 1; d <= soNgay; d++) {
      const laNay = nay.y === xem.y && nay.m === xem.m && nay.d === d;
      const laChon = chon && chon.y === xem.y && chon.m === xem.m && chon.d === d;
      const info = oNgay(xem.y, xem.m, d);
      const load = info.load || 0;
      let cls = 'ng-o' + (laChon ? ' chon' : '') + (laNay ? ' nay' : '');
      if (heat && load) cls += load >= NGUONG_TAI ? ' tai-cao' : ' tai-vua';
      if (heat && laGoi(xem.y, xem.m, d)) cls += ' goi';   // ngày gợi ý: viền ánh sáng chạy
      const o = el('button', cls, String(d));
      o.type = 'button';
      if (heat && load) {
        o.title = heat.nhom ? 'Ngày này cả nhóm đều kín lịch' : 'Nhân sự đang gánh ' + load + ' việc hôm này';
        o.appendChild(el('span', 'ng-tai', String(load)));
      }
      o.onclick = () => {
        const g = chon || { H: 9, M: 0 };    // chưa đặt giờ thì lấy 09:00 cho khỏi ra 00:00
        dat(vnISO({ y: xem.y, m: xem.m, d, H: g.H, M: g.M }));
        ve();
      };
      luoi.appendChild(o);
    }
    pop.appendChild(luoi);

    // Gợi ý theo dải nhiệt: tô ngày bận; liệt kê vài ngày nguội gần nhất (bấm chọn
    // luôn). Khi chưa chọn người, dải nhiệt là của NHÓM dự kiến theo Loại công việc,
    // mỗi gợi ý kèm tên người đang rảnh để tự xếp lịch.
    if (heat) {
      const gbox = el('div', 'ng-goi');
      gbox.appendChild(el('div', 'ng-goi-txt', 'Gợi ý đặt deadline vào các thời gian trống bên dưới'));
      const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
      if (!goiNgay.length) gbox.appendChild(el('div', 'ng-goi-txt', 'Nhóm này đang kín lịch 30 ngày tới.'));
      for (const p of goiNgay) {
        const info = oNgay(p.y, p.m, p.d);
        const thu = THU[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
        const dong = el('div', 'ng-goi-dong');
        const left = el('div', 'ng-goi-info');
        left.appendChild(el('span', 'ng-goi-ngay', p2(p.d) + '/' + p2(p.m) + ' · ' + thu));
        // Theo loại: số việc cùng loại ngày đó. Theo người: tải của người đó.
        const phu = heat.nhom
          ? (info.load ? info.load + ' việc cùng loại' : 'trống cho loại này')
          : (info.load ? info.load + ' việc' : 'đang trống');
        left.appendChild(el('span', 'ng-goi-tai', phu));
        dong.appendChild(left);
        // Hai mốc deadline chính: 11:00 sáng hoặc 16:00 chiều — bấm là chốt luôn.
        const gioRow = el('div', 'ng-goi-gio');
        [[11, '11:00'], [16, '16:00']].forEach(([H, lbl]) => {
          const gb = el('button', 'ng-goi-gb', lbl);
          gb.type = 'button';
          gb.onclick = () => { dat(vnISO({ y: p.y, m: p.m, d: p.d, H, M: 0 })); ve(); };
          gioRow.appendChild(gb);
        });
        dong.appendChild(gioRow);
        gbox.appendChild(dong);
      }
      pop.appendChild(gbox);
    }

    const hang = el('div', 'ng-gio');
    hang.appendChild(el('span', 'ng-nhan', 'Giờ'));
    const selG = el('select', 'ng-sel');
    for (let h = 0; h < 24; h++) {
      const op = el('option', '', p2(h)); op.value = h;
      if (chon && chon.H === h) op.selected = true;
      selG.appendChild(op);
    }
    const selP = el('select', 'ng-sel');
    const phut = [];
    for (let m = 0; m < 60; m += 5) phut.push(m);
    // phút lẻ do gõ tay thì vẫn phải hiện ra, không được nuốt mất
    if (chon && chon.M % 5) phut.push(chon.M);
    phut.sort((a, b) => a - b).forEach((m) => {
      const op = el('option', '', p2(m)); op.value = m;
      if (chon && chon.M === m) op.selected = true;
      selP.appendChild(op);
    });
    const datGio = () => {
      const c = (iso ? vnParts(iso) : null) || { y: xem.y, m: xem.m, d: nay.d };
      dat(vnISO({ y: c.y, m: c.m, d: c.d, H: Number(selG.value), M: Number(selP.value) }));
      ve();
    };
    selG.onchange = datGio;
    selP.onchange = datGio;
    hang.appendChild(selG);
    hang.appendChild(el('span', 'ng-hai', ':'));
    hang.appendChild(selP);
    // Hai mốc deadline chính: 11:00 sáng / 16:00 chiều — đặt nhanh cho ngày đang chọn.
    [[11, '11:00'], [16, '16:00']].forEach(([H, lbl]) => {
      const qb = el('button', 'ng-gio-nhanh', lbl); qb.type = 'button';
      qb.onclick = () => {
        const c = (iso ? vnParts(iso) : null) || { y: xem.y, m: xem.m, d: nay.d };
        dat(vnISO({ y: c.y, m: c.m, d: c.d, H, M: 0 }));
        ve();
      };
      hang.appendChild(qb);
    });
    pop.appendChild(hang);

    const chan = el('div', 'ng-chan');
    const xoa = el('button', 'btn btn-ghost ng-nho', 'Xoá'); xoa.type = 'button';
    xoa.onclick = () => { dat(null); ve(); };
    const homNay = el('button', 'btn ng-nho', 'Hôm nay'); homNay.type = 'button';
    homNay.onclick = () => {
      const g = chon || { H: nay.H, M: nay.M - (nay.M % 5) };
      xem = { y: nay.y, m: nay.m };
      dat(vnISO({ y: nay.y, m: nay.m, d: nay.d, H: g.H, M: g.M }));
      ve();
    };
    const xong = el('button', 'btn btn-primary ng-nho', 'Xong'); xong.type = 'button';
    xong.onclick = dong;
    chan.appendChild(xoa);
    chan.appendChild(homNay);
    chan.appendChild(xong);
    pop.appendChild(chan);

    boc.appendChild(pop);
    boc.classList.add('mo');
  };

  nut.onclick = (e) => {
    e.stopPropagation();
    if (pop) { dong(); return; }
    xem = null;
    ve();
    // bấm ra ngoài thì đóng lịch
    const ngoai = (ev) => {
      if (boc.contains(ev.target)) return;
      document.removeEventListener('click', ngoai, true);
      dong();
    };
    setTimeout(() => document.addEventListener('click', ngoai, true), 0);
  };

  return boc;
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
  /* Dòng "—" nghĩa là BỎ TRỐNG, nên value phải là chuỗi rỗng.
   *
   * `el('option', '', '—')` chỉ đặt textContent; option không có thuộc tính
   * value thì trình duyệt lấy chính phần chữ làm giá trị. Nên `s.value` ra
   * "—" — một chuỗi TRUTHY — và `onChange(s.value || null)` ở cuối hàm gửi đi
   * đúng ký tự gạch ngang thay vì null. Quản lý muốn xoá Campain / Loại việc /
   * Luồng của một việc thì lại ghi chữ "—" xuống cột select trong Base.
   * `fillSelect` và `fillNativeSelect` đều đặt `value=''` — chỉ hàm này quên. */
  const op0 = el('option', '', '—');
  op0.value = '';
  s.appendChild(op0);
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

/**
 * Ô chọn Campain, có thêm lối tạo chiến dịch MỚI ngay tại chỗ.
 *
 * Vì sao phải làm: chiến dịch là thứ đời thật sinh ra liên tục, mà cột này là
 * select của Base — trước đây muốn thêm một cái là phải rời app, mở Lark Base,
 * sửa cột, rồi quay lại nạp lại trang. Quản lý đang đứng ở form giao việc thì
 * chiến dịch mới phải tạo được ngay tại đó.
 *
 * Thiết kế: KHÔNG dùng prompt() — nó bị chặn trong iframe của Marketing Hub ở
 * một số cấu hình, và trông không giống phần còn lại của app. Chọn dòng
 * "+ Thêm chiến dịch mới…" thì ô select nhường chỗ cho một hàng nhập gọn.
 */
function campaignInput(value, options, onChange) {
  const box = el('div', 'cd-box');
  let dang = value || null;

  function veChon() {
    box.innerHTML = '';
    const s = el('select');
    /* Dòng trống phải có value="" HẲN HOI. `el('option','','—')` không đặt
     * value, nên trình duyệt lấy chính chữ "—" làm giá trị — chọn "bỏ trống"
     * là ghi ký tự gạch ngang vào Base. */
    const op0 = el('option', '', '—');
    op0.value = '';
    s.appendChild(op0);
    for (const o of options || []) {
      const op = el('option', '', o);
      op.value = o;
      if (dang === o) op.selected = true;
      s.appendChild(op);
    }
    /* Đánh dấu dòng "thêm mới" bằng data-, KHÔNG bằng một giá trị đặc biệt:
     * tên chiến dịch là chữ người dùng tự gõ, nên mọi chuỗi "chắc không ai
     * trùng" đều là một vụ cá cược không cần thiết. */
    const opMoi = el('option', '', '+ Thêm chiến dịch mới…');
    opMoi.value = '';
    opMoi.dataset.moi = '1';
    s.appendChild(opMoi);
    s.onchange = () => {
      const chon = s.options[s.selectedIndex];
      if (chon && chon.dataset.moi === '1') {
        /* Trả select về giá trị cũ TRƯỚC khi đổi sang hàng nhập: bỏ dở việc
         * thêm mới thì phải quay về đúng cái đang chọn, không phải về "—". */
        s.value = dang || '';
        veNhap();
        return;
      }
      dang = s.value || null;
      onChange(dang);
    };
    box.appendChild(s);
  }

  function veNhap() {
    box.innerHTML = '';
    const hang = el('div', 'cd-them');
    const i = el('input');
    i.type = 'text';
    i.placeholder = 'Tên chiến dịch mới…';
    const nutThem = el('button', 'btn btn-primary btn-sm', 'Thêm');
    const nutHuy = el('button', 'btn btn-ghost btn-sm', 'Huỷ');
    const bao = el('div', 'ro-note', '');

    const huy = () => veChon();
    const them = async () => {
      const ten = i.value.trim().replace(/\s+/g, ' ');
      if (!ten) { i.focus(); return; }
      nutThem.disabled = true; nutHuy.disabled = true;
      bao.textContent = 'Đang thêm vào Base…';
      bao.className = 'ro-note';
      try {
        const d = await req('/api/options/campaign', {
          method: 'POST', body: JSON.stringify({ ten }),
        });
        /* Cập nhật danh sách dùng chung để mọi ô Campain khác (ô lọc, drawer
         * đang mở) thấy ngay, khỏi phải F5. */
        if (S.meta && S.meta.options) S.meta.options.campaign = d.options || [];
        options = (S.meta && S.meta.options && S.meta.options.campaign) || options;
        dang = d.ten;
        onChange(dang);
        toast(d.daCo ? 'Chiến dịch này đã có sẵn — đã chọn sẵn.' : 'Đã thêm chiến dịch "' + d.ten + '"');
        veChon();
        napLaiBoLocCampaign();
      } catch (e) {
        nutThem.disabled = false; nutHuy.disabled = false;
        bao.textContent = e.message;
        bao.className = 'ro-note loi';
      }
    };

    nutThem.onclick = them;
    nutHuy.onclick = huy;
    i.onkeydown = (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); them(); }
      if (ev.key === 'Escape') { ev.preventDefault(); huy(); }
    };

    hang.appendChild(i);
    hang.appendChild(nutThem);
    hang.appendChild(nutHuy);
    box.appendChild(hang);
    box.appendChild(bao);
    i.focus();
  }

  veChon();
  return box;
}

/* Ô lọc Campain trên thanh công cụ cũng phải có chiến dịch vừa thêm, không thì
 * tạo xong lại không lọc ra được chính việc mình vừa tạo. */
function napLaiBoLocCampaign() {
  const sel = $('#fCampaign');
  if (!sel || !S.meta || !S.meta.options) return;
  const giu = sel.value;
  fillSelect(sel, S.meta.options.campaign, 'Campain: tất cả');
  sel.value = giu;
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
    const hien = items.filter((i) => khopTen(i.name, q));
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

/* ---------------- nháp việc mới ----------------
 * Nháp là bản ghi THẬT trong Base, mang trạng thái "Nháp". Chọn vậy để nháp đi
 * theo người chứ không theo máy: mở máy nào cũng thấy, và giữ được cả tệp đính kèm
 * (tệp cần record_id mới tải lên được — có bản ghi nháp là có sẵn id).
 *
 * Ba điều làm nó an toàn, cả ba nằm ở server:
 *   1. getRecords() mặc định loại nháp -> không app nào (hub · KPI · Báo cáo · bot)
 *      đếm phải nó, vì tất cả đều đọc qua /api/tasks của app này.
 *   2. Nháp chỉ chủ của nó đọc được.
 *   3. Bấm "Tạo công việc" thì ĐÈ LÊN chính bản ghi nháp, không đẻ bản mới.
 *
 * Điều duy nhất không giấu được: mở thẳng Lark Base thì vẫn thấy dòng nháp, vì nó
 * là bản ghi thật. Trong app thì không chỗ nào thấy.
 */

/** Có gì đáng giữ không — đừng tạo bản ghi cho một cái form trống. */
function nhapCoGi(t) {
  if (!t) return false;
  return !!(t.title || t.detail);
}

/** Nhãn thời điểm: "14:32" nếu của hôm nay, "14:32 · 13/09" nếu để qua hôm khác. */
function nhanLucNhap(v) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const n = new Date();
  const p = (x) => String(x).padStart(2, '0');
  const gio = p(d.getHours()) + ':' + p(d.getMinutes());
  const cungNgay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate();
  return cungNgay ? gio : gio + ' · ' + p(d.getDate()) + '/' + p(d.getMonth() + 1);
}

/** Xoá hẳn một bản nháp khỏi Base. */
async function boNhap(id) {
  await req('/api/nhap/' + encodeURIComponent(id), { method: 'DELETE' });
}

/**
 * Mở ô chi tiết.
 *   openDrawer(task)          — xem/sửa một việc đã có
 *   openDrawer(null)          — form tạo việc mới, trắng
 *   openDrawer(null, nhap)    — soạn tiếp một bản nháp
 */
function openDrawer(task, nhap) {
  if (task) {
    S.editing = Object.assign({}, task);
    S.nhapId = null;           // mở việc có sẵn thì không dính gì tới nháp
  } else {
    // Việc mới: ngày bắt đầu mặc định là lúc tạo, người order là chính mình
    S.editing = {
      isNew: true,
      status: 'Chờ tiếp nhận',
      priority: '🟡 Trung bình',
      startAt: new Date().toISOString(),
      requester: S.meta && S.meta.me ? [S.meta.me] : [],
      campaign: S.isManager ? 'Operate' : null,
      owner: [], helper: [], channel: [],
    };
    if (nhap) {
      /* Soạn tiếp nháp: giữ nguyên mọi thứ đã điền, nhưng trạng thái phải quay về
       * mặc định — "Nháp" là chỗ cất, không phải trạng thái việc sẽ mang khi ra đời. */
      Object.assign(S.editing, nhap, {
        isNew: true, id: undefined, status: 'Chờ tiếp nhận',
      });
      S.nhapId = nhap.id;
    } else {
      S.nhapId = null;
    }
  }
  S.dirty = {};
  /* Hàng đợi tệp của form "Tạo công việc mới". Xoá mỗi lần mở drawer: bỏ dở một
   * lần đặt việc thì tệp cũ không được lẻn sang việc sau. */
  (S.tepMoi || []).forEach((f) => { if (f.__xem) URL.revokeObjectURL(f.__xem); });
  S.tepMoi = [];
  // Việc của tôi / Việc tôi order: mở bản gọn. Kanban/Bảng (quản lý): mở đầy đủ, nút đổi được.
  S.suaDayDu = S.isManager && S.view !== 'work' && S.view !== 'order';
  buildDrawer();
  $('#drawer').classList.add('open');
  $('#scrim').classList.add('open');
  baoChe(true);
}

function closeDrawer() {
  clearInterval(henChat); henChat = 0;
  /* Còn thay đổi chưa gửi của việc đã có: gửi nốt (tuLuuViec đọc S.editing ngay). */
  if (S.editing && !S.editing.isNew && Object.keys(S.dirty || {}).length) {
    tuLuuViec().then(() => render()).catch(() => {});
  }
  // việc mới còn thay đổi chưa cất: cất nốt (tuLuuNhap chụp S.editing ngay lúc gọi)
  if (henNhap && S.editing && S.editing.isNew) {
    tuLuuNhap().then(() => napNhap()).then(() => render()).catch(() => {});
  }
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
  $('#dStatusMsg').textContent = S.editing.isNew ? 'Có thay đổi chưa lưu' : 'Đang chờ lưu…';
  if (key === 'title') $('#dTitleView').textContent = val || '(chưa có tên)';
  if (S.editing.isNew) henNhapTD();
  else henTuLuu();
}

/* TỰ LƯU VIỆC ĐÃ CÓ (01/10/2026). Anh Hùng: "loại bỏ nút lưu thay đổi, vì sẽ tự
 * lưu". Sửa xong 1,2 giây thì gửi đúng những ô vừa đổi lên Base; đóng ô chi tiết
 * thì gửi nốt. Lỗi thì giữ lại phần chưa lưu để lần sau gửi tiếp, không mất chữ. */
let henLuu = 0;
function henTuLuu() {
  clearTimeout(henLuu);
  henLuu = setTimeout(() => { tuLuuViec(); }, 1200);
}
async function tuLuuViec() {
  clearTimeout(henLuu); henLuu = 0;
  const t = S.editing;
  if (!t || t.isNew || S.viewAs || !Object.keys(S.dirty).length) return;
  const goi = Object.assign({}, S.dirty);
  S.dirty = {};
  const suffix = isStaffMode() ? '?role=staff' : '';
  const msg = $('#dStatusMsg');
  if (S.editing === t) msg.textContent = 'Đang lưu…';
  try {
    await req('/api/tasks/' + t.id + suffix, { method: 'PATCH', body: JSON.stringify(goi) });
    const local = S.tasks.find((x) => x.id === t.id);
    if (local) {
      Object.assign(local, goi);
      local.deadline = local.deadline1 || local.deadline2 || null;
    }
    if (S.editing === t) {
      const g = new Date();
      msg.textContent = 'Đã tự lưu · ' + String(g.getHours()).padStart(2, '0') + ':' + String(g.getMinutes()).padStart(2, '0');
    }
  } catch (e) {
    if (S.editing === t) {
      S.dirty = Object.assign(goi, S.dirty);
      msg.textContent = 'Chưa lưu được — ' + e.message;
    }
    toast('Chưa lưu được: ' + e.message, true);
  }
}

/* TỰ LƯU NHÁP VIỆC MỚI (28/09). Anh Hùng: "bỏ luôn các nút nháp còn lại, tất
 * cả đều có cơ chế tự lưu nháp". Thay nút "Lưu nháp": sửa xong 2,5 giây thì tự
 * cất lên Base đúng đường /api/nhap cũ (nháp ẩn, chỉ chủ nó thấy, "Tạo công
 * việc" đè lên chính bản ghi đó) — nhưng KHÔNG đóng form. Tệp chờ tải lên vẫn
 * đợi lúc Tạo công việc. Đóng form thì gửi nốt phần chưa cất. */
let henNhap = 0, nhapDangLuu = null;
function henNhapTD() {
  clearTimeout(henNhap);
  henNhap = setTimeout(() => { tuLuuNhap(); }, 2500);
}
function tuLuuNhap() {
  clearTimeout(henNhap); henNhap = 0;
  const t = S.editing;
  if (!t || !t.isNew || !nhapCoGi(t) || S.viewAs) return nhapDangLuu || Promise.resolve();
  const truoc = nhapDangLuu || Promise.resolve();
  nhapDangLuu = truoc.then(async () => {
    const payload = thanNhap(t);
    if (S.nhapId) payload.id = S.nhapId;
    try {
      const kq = await req('/api/nhap', { method: 'POST', body: JSON.stringify(payload) });
      S.nhapId = kq.id || S.nhapId;
      if (S.editing === t) {
        const g = new Date();
        $('#dStatusMsg').textContent = 'Đã tự lưu nháp · ' + String(g.getHours()).padStart(2, '0') + ':' +
          String(g.getMinutes()).padStart(2, '0') + ' — chỉ anh thấy';
      }
    } catch (e) {
      if (S.editing === t) $('#dStatusMsg').textContent = 'Chưa tự lưu được nháp — ' + e.message;
    }
  }).finally(() => { nhapDangLuu = null; });
  return nhapDangLuu;
}
/** Bộ trường nháp: đúng bộ vai trò hiện tại được phép gửi, như lúc tạo việc thật. */
function thanNhap(t) {
  const allowed = S.isManager
    ? S.meta.rules.staffCreatable.concat(S.meta.rules.managerOnlyFields)
    : S.meta.rules.staffCreatable;
  const payload = {};
  for (const k of allowed) {
    const v = t[k];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    payload[k] = v;
  }
  return payload;
}

/** Drawer ở chế độ nhân sự: khoá trường của người order. */
function isStaffMode() {
  if (S.viewAs) return false;      // quản lý xem việc người khác → mở drawer đầy đủ
  const t = S.editing;
  if (!t || t.isNew) return false;
  /* Quản lý: bản gọn chỉ là cách XEM; nút "Xem bản gọn / Sửa đầy đủ" quyết định,
   * áp cho MỌI tab (Việc của tôi, Kanban, Bảng). Trước đây khoá cứng ở tab work
   * nên ở Bảng/Kanban bấm nút không đổi gì. */
  if (S.isManager) return !S.suaDayDu;
  // Nhân sự: bản gọn ở tab "Việc của tôi" và "Việc tôi order" (khoá trường order).
  return S.view === 'work' || S.view === 'order';
}

function buildDrawer() {
  const t = S.editing;
  const o = S.meta.options;
  const isNew = !!t.isNew;
  const staff = isStaffMode();

  // Tab "Việc đã order": người order chỉ XEM (trạng thái/sản phẩm read-only).
  // Quản lý vẫn bấm "Sửa đầy đủ" để chuyển sang form sửa.
  const orderRO = !isNew && S.view === 'order' && !S.suaDayDu;

  $('#dRecId').textContent = isNew ? 'CÔNG VIỆC MỚI' : t.lienPhong ? ((t.nguonMa || '') + ' · Liên phòng ban') : t.id;
  $('#dTitleView').textContent = isNew ? 'Tạo công việc mới' : (t.title || '(chưa có tên)');
  /* Việc liên phòng: không Xoá, không Sửa đầy đủ — bản ghi là của Base công ty. */
  $('#dDelete').classList.toggle('hidden', isNew || staff || orderRO || !!t.lienPhong);
  const nutFull = $('#dFull');
  nutFull.classList.toggle('hidden', isNew || !S.isManager || !!t.lienPhong);
  nutFull.textContent = staff ? '✎ Sửa đầy đủ' : '◀ Xem bản gọn';
  nutFull.title = staff
    ? 'Mở form sửa mọi trường (deadline, người phụ trách, chiến dịch…)'
    : 'Về bản gọn — đúng những gì nhân sự nhìn thấy';
  $('#dSave').textContent = isNew ? 'Tạo công việc' : 'Lưu thay đổi';
  /* Việc đã có thì tự lưu — nút Lưu chỉ còn ở form tạo việc mới. */
  $('#dSave').classList.toggle('hidden', orderRO || !isNew);
  /* Nút hành động chính (Bắt đầu làm / Hoàn thành…) do bản gọn đặt vào góc dưới. */
  const nutCu = $('#dAct');
  if (nutCu) nutCu.remove();

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
  if (t.lienPhong && !orderRO) { buildStaffDrawer(b, t, o); return chiaTab(b, t); }
  if (orderRO) { buildOrderDrawer(b, t, o); ganKhoiViecCon(b, t, true); return chiaTab(b, t); }   // người order: chỉ xem
  if (staff) { buildStaffDrawer(b, t, o); ganKhoiViecCon(b, t, true); return chiaTab(b, t); }

  /* ---- chế độ quản lý: sửa mọi trường ---- */
  b.appendChild(field('Tên công việc *', textInput(t.title, (v) => set('title', v))));

  b.appendChild(field('Chi tiết yêu cầu', oChiTiet(t)));

  const r1 = el('div', 'row2');
  r1.appendChild(field('Trạng thái', selectInput(t.status, o.status, (v) => set('status', v))));
  r1.appendChild(field('Độ ưu tiên', selectInput(t.priority, o.priority, (v) => set('priority', v))));
  b.appendChild(r1);

  const r2 = el('div', 'row2');
  r2.appendChild(field('Loại công việc', selectInput(t.workType, o.workType, (v) => set('workType', v))));
  r2.appendChild(field('Campain', campaignInput(t.campaign, o.campaign, (v) => set('campaign', v))));
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
  r4.appendChild(field('Ngày bắt đầu', ngayInput(t.startAt, (v) => set('startAt', v))));
  r4.appendChild(field('Deadline 1', ngayInput(t.deadline1, (v) => set('deadline1', v), {
    dulieu: () => dulieuDaiNhiet(t),
  })));
  b.appendChild(r4);

  b.appendChild(field('Deadline 2', ngayInput(t.deadline2, (v) => set('deadline2', v))));
  b.appendChild(field('Phụ trách chính', peopleDropdown(t.owner, (v) => set('owner', v), 'Chọn người phụ trách…')));
  b.appendChild(field('Người hỗ trợ', peopleDropdown(t.helper, (v) => set('helper', v), 'Chọn người hỗ trợ…')));
  b.appendChild(field('Người order', onePersonInput(t.requester, (v) => set('requester', v))));
  b.appendChild(field('Kênh phân phối', optionsDropdown(o.channel, t.channel, (v) => set('channel', v), 'Chọn kênh…')));
  if (laLinkNguon(t.link)) b.appendChild(field(nhanNguon(t.link), theNguon(t.link)));
  else b.appendChild(field('Link tài liệu / tracking (của người order)',
    textInput(t.link, (v) => set('link', v), 'url')));
  b.appendChild(field('Link kết quả (nhân sự nộp)',
    textInput(t.linkKetQua, (v) => set('linkKetQua', v), 'url')));

  const note = el('textarea');
  note.value = t.note || '';
  note.style.minHeight = '60px';
  note.oninput = () => set('note', note.value);
  b.appendChild(field('Ghi chú', note));

  b.appendChild(attachmentField(t, true));
  b.appendChild(khoiTep(t, 'File kết quả', t.fileKetQua, 'ket-qua', true, 'Nhân sự chưa nộp file nào.'));
  b.appendChild(oTaiLen(t, 'ket-qua'));
  b.appendChild(khoiBinhLuan(t));
  ganKhoiViecCon(b, t, false);
  chiaTab(b, t);
}

/**
 * Form đặt việc mới.
 * Ai cũng điền được phần trên (đúng bộ trường Form "Yêu cầu công việc" trong
 * tài liệu). Phần phân công cấp phòng chỉ quản lý thấy.
 */
function buildCreateForm(b, t, o) {
  const isMgr = !!S.isManager;

  /* Đang tạo việc con: nói rõ thuộc việc lớn nào. Chi tiết yêu cầu không bắt
   * buộc, vì việc con thường chỉ cần một cái tên. */
  if (idCha(t)) {
    const cha = viecTheoMa(idCha(t));
    const dong = el('div', 'vc-cha vc-cha-tao');
    dong.appendChild(el('span', 'vc-cha-nhan', 'Việc con của'));
    dong.appendChild(el('b', '', (cha && cha.title) || t.tenCha || 'việc lớn'));
    b.appendChild(dong);
    if (!isMgr) b.appendChild(el('div', 'ro-note', 'Việc con chưa có người phụ trách. Quản lý sẽ phân công trong phần chi tiết.'));
  }

  /* Đang mở lại bản nháp: phải nói rõ đây không phải form trắng, và cho đường ra
   * ngay cạnh — nếu không người dùng tưởng app tự điền bừa. */
  if (S.nhapId) {
    // Đang soạn tiếp một bản nháp đã có
    const bang = el('div', 'nhap-bang');
    bang.appendChild(el('span', 'nhap-chu',
      'Đang soạn tiếp một bản nháp — chưa ai trong phòng thấy việc này. ' +
      'Bấm "Tạo công việc" là bản nháp này thành việc thật.'));
    const bo = el('button', 'btn btn-ghost nhap-bo', 'Bỏ nháp');
    bo.type = 'button';
    bo.title = 'Xoá hẳn bản nháp này khỏi Base';
    bo.onclick = async () => {
      if (!confirm('Xoá hẳn bản nháp "' + (t.title || 'chưa đặt tên') + '"?')) return;
      try {
        await boNhap(S.nhapId);
        toast('Đã xoá bản nháp');
        S.nhapId = null;
        await napNhap();
        closeDrawer();
        render();
      } catch (e) { toast('Không xoá được: ' + e.message, true); }
    };
    bang.appendChild(bo);
    b.appendChild(bang);
  } else if (!idCha(t) && !laLinkNguon(t.link)) {
    /* Form trắng: nếu đang còn nháp thì phải cho thấy, không thì người dùng soạn
     * lại từ đầu một việc mình đã soạn dở hôm qua. Nạp sau để form hiện ra ngay.
     * Form đã điền sẵn (việc con, việc tạo từ tin) thì thôi: bấm nhầm vào nháp
     * là mất luôn phần đã điền. */
    const cho = el('div', 'nhap-bang hidden');
    b.appendChild(cho);
    req('/api/nhap').then((d) => {
      const ds = (d && d.nhap) || [];
      if (!ds.length || S.nhapId) return;
      cho.classList.remove('hidden');
      cho.appendChild(el('span', 'nhap-chu',
        ds.length === 1 ? 'Anh còn 1 bản nháp chưa xong:' : 'Anh còn ' + ds.length + ' bản nháp chưa xong:'));
      const oChip = el('div', 'nhap-ds');
      ds.forEach((n) => {
        const chip = el('button', 'nhap-chip',
          (n.title || '(chưa đặt tên)') + (n.startAt ? ' · ' + nhanLucNhap(n.startAt) : ''));
        chip.type = 'button';
        chip.title = 'Soạn tiếp bản nháp này';
        chip.onclick = () => openDrawer(null, n);
        oChip.appendChild(chip);
      });
      cho.appendChild(oChip);
    }).catch(() => {});
  }

  b.appendChild(field('Tên công việc *', textInput(t.title, (v) => set('title', v))));

  b.appendChild(field(idCha(t) ? 'Chi tiết yêu cầu' : 'Chi tiết yêu cầu *', oChiTiet(t)));

  const r1 = el('div', 'row2');
  r1.appendChild(field('Loại công việc *', selectInput(t.workType, o.workType, (v) => set('workType', v))));
  r1.appendChild(field('Độ ưu tiên *', selectInput(t.priority, o.priority, (v) => set('priority', v))));
  b.appendChild(r1);

  const r2 = el('div', 'row2');
  const fStart = field('Ngày bắt đầu', ngayInput(t.startAt, (v) => set('startAt', v)));
  fStart.appendChild(el('div', 'ro-note', 'Mặc định là thời điểm tạo việc.'));
  r2.appendChild(fStart);
  r2.appendChild(field('Deadline *', ngayInput(t.deadline1, (v) => set('deadline1', v), {
    dulieu: () => dulieuDaiNhiet(t),
  })));
  b.appendChild(r2);

  /* Tạo từ tin: thẻ tin thay cho ô link, khỏi để lộ một đường dẫn dài. */
  if (laLinkNguon(t.link)) b.appendChild(field(nhanNguon(t.link), theNguon(t.link)));
  else b.appendChild(field('Link brief / tư liệu', textInput(t.link, (v) => set('link', v), 'url')));
  b.appendChild(oTepViecMoi());

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
  r3.appendChild(field('Campain', campaignInput(t.campaign, o.campaign, (v) => set('campaign', v))));
  r3.appendChild(field('Người order', onePersonInput(t.requester, (v) => set('requester', v))));
  b.appendChild(r3);

  b.appendChild(field('Kênh phân phối',
    optionsDropdown(o.channel, t.channel, (v) => set('channel', v), 'Chọn kênh…')));
}

/* Biến URL trong mô tả thành link bấm được. Yêu cầu của người order hay có
 * link Drive/Figma dán giữa đoạn văn — để dạng chữ thì phải bôi đen copy tay. */
/* ---------- Thẻ "Trích từ tin" (21/10/2026) ----------
 * Việc tạo từ "Tin của phòng" không chép chữ của tin. Ô link giữ đường về tin
 * (…/#/tin/<mã>), và chỗ nào hiện ô link thì vẽ thành thẻ: ảnh, tiêu đề, ngày,
 * một dòng trích. Bấm vào là lớp vỏ mở đúng tin đó lên đọc (anh Hùng: "ấn vào
 * ra bảng tin ấy thay vì là hiện như text").
 * Lớp vỏ cùng origin nên gọi thẳng parent.hubTin. Mở app riêng (không có lớp
 * vỏ) thì bấm thẻ là mở trang hub ở tab mới. */
function maTinTuLink(link) {
  const m = /#\/tin\/([^\s#?/]+)\s*$/.exec(String(link || ''));
  return m ? decodeURIComponent(m[1]) : '';
}
function hubTin() {
  try { return parent !== window && parent.hubTin ? parent.hubTin : null; } catch (_) { return null; }
}
function theTinNguon(link) {
  const ma = maTinTuLink(link);
  const the = el('button', 'tin-nguon');
  the.type = 'button';
  the.title = 'Mở tin này';
  const anh = el('span', 'tin-nguon-anh');
  const chu = el('span', 'tin-nguon-chu');
  const dau = el('span', 'tin-nguon-dau', 'Trích từ tin của phòng');
  const ten = el('b', '', 'Đang lấy tin…');
  const trich = el('span', 'tin-nguon-trich', '');
  chu.appendChild(dau); chu.appendChild(ten); chu.appendChild(trich);
  the.appendChild(anh); the.appendChild(chu);
  the.onclick = (e) => {
    e.preventDefault();
    const h = hubTin();
    if (h) h.mo(ma);
    else window.open(link, '_blank', 'noopener');
  };
  const h = hubTin();
  if (!h) { ten.textContent = 'Mở tin trên Marketing Hub'; return the; }
  h.lay(ma).then((t) => {
    if (!t) { ten.textContent = 'Tin này không còn trên bảng Thông báo'; the.classList.add('mat'); return; }
    ten.textContent = t.tieuDe || '(không tiêu đề)';
    dau.textContent = 'Trích từ tin' + (t.ngay ? ' · ' + t.ngay : '');
    trich.textContent = t.trich || '';
    if (t.anh) {
      const img = el('img');
      img.src = t.anh; img.alt = ''; img.loading = 'lazy';
      img.onerror = () => img.remove();
      anh.appendChild(img);
    }
  }).catch(() => { ten.textContent = 'Chưa lấy được tin'; });
  return the;
}
/* Việc tạo từ Ghi chú (26/10/2026) cũng đi qua form này, ô link giữ
 * …/#/ghi-chu?note=<mã>. Ghi chú là riêng tư nên thẻ không đọc được nội dung:
 * chỉ mời mở ghi chú gốc; ai không phải người viết thì Ghi chú tự báo. */
function maGhiChuTuLink(link) {
  const m = /#\/ghi-chu\?note=([^&\s#]+)/.exec(String(link || ''));
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch (_) { return ''; }
}
const laLinkNguon = (link) => !!(maTinTuLink(link) || maGhiChuTuLink(link));
const nhanNguon = (link) => (maTinTuLink(link) ? 'Tin gốc' : 'Ghi chú gốc');
const theNguon = (link) => (maTinTuLink(link) ? theTinNguon(link) : theGhiChuNguon(link));
function theGhiChuNguon(link) {
  const ma = maGhiChuTuLink(link);
  const the = el('button', 'tin-nguon tu-ghi-chu');
  the.type = 'button';
  the.title = 'Mở ghi chú gốc';
  const chu = el('span', 'tin-nguon-chu');
  chu.appendChild(el('span', 'tin-nguon-dau', 'Từ ghi chú'));
  chu.appendChild(el('b', '', 'Mở ghi chú gốc'));
  the.appendChild(el('span', 'tin-nguon-anh'));
  the.appendChild(chu);
  the.onclick = (e) => {
    e.preventDefault();
    try {
      if (parent !== window) {
        /* Đóng ô chi tiết trước: lớp vỏ đang tối cả màn vì nó (__HUB__.che), sang
         * Ghi chú mà không đóng thì màn hình tối kẹt. closeDrawer cũng gửi nốt
         * phần chưa lưu. */
        if (S.editing) closeDrawer();
        parent.location.hash = '#/ghi-chu?note=' + encodeURIComponent(ma);
        return;
      }
    } catch (_) {}
    window.open(link, '_blank', 'noopener');
  };
  return the;
}

/** Ô link chỉ đọc: trỏ về tin hay ghi chú thì vẽ thẻ nguồn, còn lại như cũ. */
function oLinkDoc(link) {
  return laLinkNguon(link) ? theNguon(link) : moTaCoLink(link);
}

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
/* Ô soạn chi tiết yêu cầu có định dạng: Ctrl+B/I/U, dán bảng Excel. Không bày
 * thanh công cụ (anh Hùng 28/10/2026). Chuyển đổi nằm ở soan-chu.js. */
function oChiTiet(t) {
  return SoanChu.taoOSoan(t.detail || '', (md) => set('detail', md));
}

/** Chi tiết yêu cầu chỉ đọc: giữ đậm, nghiêng, gạch chân, bảng và link bấm được. */
function moTaDinhDang(text) {
  const box = el('div', 'd-desc');
  box.innerHTML = SoanChu.sangHtml(text, { link: true });
  return box;
}

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
      /* Tải ảnh hỏng thì nói thẳng, đừng để cái icon ảnh vỡ — người dùng không
       * biết là lỗi hệ thống hay tệp hỏng. Nút Tải xuống bên cạnh vẫn dùng được. */
      img.onerror = () => {
        xem.innerHTML = '';
        xem.classList.add('ic', 'loi');
        xem.textContent = 'KHÔNG XEM ĐƯỢC';
        xem.title = 'Không tải được ảnh để xem trước — thử nút Tải xuống';
      };
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
    const nhanh = el('button', 'attbtn', 'Xem');
    nhanh.onclick = () => moXemTep(t, a);
    acts.appendChild(nhanh);
    const tai = el('a', 'attbtn', 'Tải về');
    tai.href = urlTep(t.id, a.token, true);
    tai.setAttribute('download', a.name || '');
    acts.appendChild(tai);
    if (xoaDuoc) {
      const xoa = el('button', 'attbtn del', 'Xoá');
      xoa.onclick = async () => {
        if (!confirm('Xoá tệp "' + (a.name || '') + '"? Tệp bị gỡ khỏi việc này, không khôi phục được.')) return;
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
  /* Bản gọn kiểu iOS (anh Hùng 01/10/2026): "tối ưu đồng bộ như iOS và tổng quan
   * giao diện của ứng dụng; đưa ra thông tin hữu ích cho nhân sự đọc và làm được
   * việc". Thứ tự theo câu hỏi người làm tự hỏi khi mở việc:
   *   1. Việc này đang ở đâu, còn bao lâu, giờ bấm gì?   → thẻ đầu + nút chính
   *   2. Ai giao, ai làm cùng, gấp không?               → danh sách thông tin
   *   3. Làm cái gì, tài liệu đâu?                        → "Cần làm gì"
   *   4. Nộp ở đâu?                                       → "Sản phẩm của bạn"
   * Yêu cầu điều chỉnh xuống cuối, một dòng nhẹ — cần thì có, không chiếm chỗ. */
  const me = S.who && S.who.id;
  const stage = laneOf(t, me);
  const st = LANE_BY_KEY[stage];
  const myRole = roleIn(t, me);
  const laChinh = myRole === 'owner';
  const ten = (ds) => (ds || []).map((u) => u.name).filter(Boolean).join(', ');

  /* ---------- 1. Thẻ đầu: tình trạng · hạn · việc tiếp theo ---------- */
  const hero = el('div', 'sg-hero sg-' + (stage || 'x'));
  const dau = el('div', 'sg-hero-dau');
  dau.appendChild(el('span', 'sg-giai', st ? st.title : (t.status || '—')));
  const tre = laTreTheoHan(t);
  const con = daysLeft(t.deadline);
  const hanChu = !t.deadline ? 'Chưa có hạn'
    : tre ? (con != null && con < 0 ? 'Trễ ' + Math.abs(con) + ' ngày' : 'Đã trễ')
      : con === 0 ? 'Hạn hôm nay' : con === 1 ? 'Hạn ngày mai' : con != null && con > 1 ? 'Còn ' + con + ' ngày' : 'Hạn';
  dau.appendChild(el('span', 'sg-han' + (tre ? ' tre' : con != null && con <= 1 ? ' gap' : ''),
    hanChu + (t.deadline ? ' · ' + fmtDate(t.deadline, true) : '')));
  hero.appendChild(dau);
  if (st && st.hint) {
    hero.appendChild(el('div', 'sg-goi-y', t.lienPhong
      ? st.hint.replace(/gửi Yêu cầu điều chỉnh/g, 'nhắn người giao ở tab Trao đổi')
      : st.hint));
  }

  /* Nút chính nằm ở GÓC DƯỚI của ô chi tiết (anh Hùng 01/10/2026), chỗ nút Lưu
   * cũ — tay luôn tìm hành động ở đó, thẻ đầu chỉ còn để đọc. */
  const datNut = (bt) => {
    bt.id = 'dAct';
    bt.classList.remove('sg-nut');
    const foot = $('#drawerFoot');
    if (foot) foot.appendChild(bt);
  };
  if (laChinh && stage === 'new') {
    const bt = el('button', 'btn btn-primary sg-nut', '▶  Bắt đầu làm');
    bt.onclick = async () => { closeDrawer(); await startTask(t); };
    datNut(bt);
  } else if (laChinh && (stage === 'doing' || stage === 'redo' || stage === 'late' || stage === 'daNop')) {
    const treGQ = !S.isManager && cfg0().chanTre && laTreTheoHan(t);
    const nhan = stage === 'daNop' ? '↥  Gửi lại sản phẩm'
      : treGQ ? (daGiaiQuyet(t) ? '↥  Gửi lại sản phẩm' : '↥  Gửi sản phẩm · giải quyết việc trễ')
      : stage === 'redo' ? '↻  Gửi lại sản phẩm'
      : '✓  Đã gửi sản phẩm';
    const bt = el('button', 'btn btn-primary sg-nut', nhan);
    bt.onclick = () => { closeDrawer(); openDone(t, treGQ ? 'giai-quyet' : ''); };
    datNut(bt);
    if (stage === 'daNop') {
      const hc = nhanHanChinhSua(t);
      hero.appendChild(el('div', 'sg-nho', 'Đã gửi sản phẩm, đang chờ người order nghiệm thu.'
        + (hc ? ' ' + hc.txt + '.' : '')));
    } else if (!coMinhChung(t)) {
      hero.appendChild(el('div', 'sg-nho', 'Cần link hoặc tệp sản phẩm — đính ngay trong cửa sổ Gửi sản phẩm.'));
    }
  } else if (!laChinh && stage !== 'done') {
    hero.appendChild(el('div', 'sg-nho', 'Bạn là ' + (myRole === 'helper' ? 'người hỗ trợ' : 'người order') +
      ' — phụ trách chính là người cập nhật trạng thái.'));
  }
  /* Việc liên phòng: nguồn ở app Giao việc công ty — mở bản gốc một chạm. */
  if (t.lienPhong) {
    hero.appendChild(el('div', 'sg-nguon', '⇄ Liên phòng ban · ' + (t.nguonMa || '')));
  }
  b.appendChild(hero);

  /* ---------- 2. Thông tin việc: danh sách kiểu iOS ---------- */
  const ds = el('div', 'sg-nhom');
  const hang = (nhan, giaTri, tone) => {
    if (!giaTri) return null;
    const r = el('div', 'sg-hang');
    r.appendChild(el('span', 'sg-k', nhan));
    r.appendChild(el('span', 'sg-v' + (tone ? ' t-' + tone : ''), giaTri));
    ds.appendChild(r);
    return r;
  };
  if (t.lienPhong) hang('Trạng thái bên công ty', t.trangThaiGoc);
  hang(t.lienPhong ? 'Người giao' : 'Người order', ten(t.requester));
  hang(t.lienPhong ? 'Người nhận' : 'Phụ trách chính', ten(t.owner) || 'Chưa giao');
  /* Việc liên phòng giao cho nhiều người được tách mỗi người một việc — nêu ai
   * cùng nhận để biết phần mình nằm trong việc chung nào. */
  if (t.lienPhong && (t.dongNhan || []).length) hang('Cùng nhận việc này', ten(t.dongNhan));
  hang('Người hỗ trợ', ten(t.helper));
  hang('Độ ưu tiên', plainLabel(t.priority), toneUuTien(t.priority));
  hang('Loại việc', t.workType);
  if (t.lienPhong) hang('Phòng ban nhận', t.phongBan);
  hang('Ngày giao', t.startAt ? fmtDate(t.startAt, true) : '');
  if (daGiaiQuyet(t)) hang('Đã nộp', nhanGiaiQuyet(t), 'green');
  if (t.rating) hang('Chấm điểm', '★'.repeat(t.rating) + '  ' + t.rating + '/5', 'green');
  /* Dòng báo cáo ngày: đọc sau (Base khác), bấm là sang tab Báo cáo. */
  const rBC = hang('Báo cáo ngày', 'Đang đọc…');
  if (rBC) {
    rBC.classList.add('bam');
    rBC.appendChild(el('span', 'sg-mui', '›'));
    rBC.onclick = () => {
      const nutBC = [...b.querySelectorAll('.dt-tab')].find((x) => /Báo cáo/.test(x.textContent));
      if (nutBC) nutBC.click();
    };
    napBaoCaoViec(t).then((bc) => {
      const v = rBC.querySelector('.sg-v');
      if (!bc.length) { v.textContent = 'Chưa có lần nào'; return; }
      const cuoi = bc[bc.length - 1];
      v.textContent = bc.length + ' lần · mới nhất ' + (cuoi.tienDoPt == null ? '—' : cuoi.tienDoPt + '%');
    }).catch(() => { const v = rBC.querySelector('.sg-v'); if (v) v.textContent = '—'; });
  }
  b.appendChild(ds);

  /* ---------- 3. Cần làm gì (chỉ đọc) ---------- */
  const yc = theKhoi('Cần làm gì');
  if (t.detail) yc.than.appendChild(moTaDinhDang(t.detail));
  else yc.than.appendChild(el('div', 'd-desc trong-nhe', 'Người order chưa ghi chi tiết yêu cầu.'));
  if (t.link) {
    const oLink = el('div', 'field');
    oLink.appendChild(el('label', '', laLinkNguon(t.link) ? nhanNguon(t.link) : 'Link tài liệu của người order'));
    oLink.appendChild(oLinkDoc(t.link));
    yc.than.appendChild(oLink);
  }
  /* Tài liệu kèm là của người order: ai vừa order vừa phụ trách (hoặc quản lý) thì
   * gỡ được tệp mình đã gửi (anh Hùng 09/10/2026: "tải tệp lên thì không có lựa
   * chọn xoá tệp đã tải lên"). Máy chủ cùng luật: laNguoiOrder / isManager. */
  const laOrder = (t.requester || []).some((u) => u.id === me);
  yc.than.appendChild(khoiTep(t, 'Tài liệu kèm', t.attachment, '', laOrder || S.isManager, 'Không có tệp kèm.'));
  b.appendChild(yc.the);

  /* ---------- 4. Sản phẩm của bạn ---------- */
  const cb = theKhoi('Sản phẩm của bạn', 'cb');
  cb.than.appendChild(field('Link kết quả', textInput(t.linkKetQua, (v) => set('linkKetQua', v), 'url')));
  cb.than.appendChild(khoiTep(t, 'File kết quả', t.fileKetQua, 'ket-qua', laChinh, 'Chưa nộp file nào.'));
  if (laChinh) cb.than.appendChild(oTaiLen(t, 'ket-qua'));
  const note = el('textarea');
  note.value = t.note || '';
  note.style.minHeight = '60px';
  note.placeholder = 'Ghi chú cho người order (không bắt buộc)';
  note.oninput = () => set('note', note.value);
  cb.than.appendChild(field('Ghi chú', note));
  /* Base công ty không có cột Người hỗ trợ — việc liên phòng thì bỏ ô này. */
  if (!t.lienPhong) {
    cb.than.appendChild(field('Thêm người hỗ trợ (khi thật cần)',
      peopleDropdown(t.helper, (v) => set('helper', v), 'Chọn người hỗ trợ…')));
  }
  b.appendChild(cb.the);

  b.appendChild(khoiBinhLuan(t));

  /* ---------- 5. Điều chỉnh: một dòng nhẹ ở cuối ---------- */
  if (t.lienPhong) return;   // việc liên phòng: trao đổi với người giao ở tab Trao đổi
  const dc = el('button', 'sg-dc');
  dc.type = 'button';
  dc.appendChild(el('span', 'sg-dc-chu', 'Yêu cầu chưa rõ, thiếu tài liệu hay deadline không kịp?'));
  dc.appendChild(el('b', '', 'Gửi yêu cầu điều chỉnh ›'));
  dc.onclick = () => { closeDrawer(); openAdjust(t); };
  b.appendChild(dc);
}

/** Drawer cho NGƯỜI ORDER (tab "Việc đã order"): CHỈ ĐỌC.
 *  Xem tình trạng + sản phẩm, không sửa được gì; muốn đổi thì gửi Yêu cầu điều chỉnh. */
function buildOrderDrawer(b, t, o) {
  /* Việc LIÊN PHÒNG mình giao: sửa thẳng ở đây, tự lưu vào Base Giao việc công ty
   * (anh Hùng 01/10/2026: "anh không muốn đi đâu cả, chỉ muốn chỉnh trực tiếp
   * trên app mình"). */
  if (t.lienPhong) {
    b.appendChild(el('div', 'sg-nguon', '⇄ Liên phòng ban · ' + (t.nguonMa || '') + ' · tự lưu vào Giao việc công ty'));
    const sv = theKhoi('Việc bạn đã giao');
    sv.than.appendChild(field('Tên việc', textInput(t.title, (v) => set('title', v))));
    const nd = el('textarea');
    nd.value = t.detail || '';
    nd.style.minHeight = '160px';
    nd.oninput = () => set('detail', nd.value);
    sv.than.appendChild(field('Nội dung', nd));
    const r = el('div', 'row2');
    r.appendChild(field('Deadline', ngayInput(t.deadline1, (v) => set('deadline1', v))));
    r.appendChild(field('Mức độ ưu tiên', selectInput(t.uuTienGoc || '', ['Gấp', 'Cao', 'Trung bình', 'Thấp'],
      (v) => set('uuTienGoc', v))));
    sv.than.appendChild(r);
    b.appendChild(sv.the);
  }
  // Thẻ 1: yêu cầu mình đã đặt (chỉ đọc)
  const yc = theKhoi('Nội dung yêu cầu');
  yc.than.appendChild(el('div', 'ro-note', 'Người order: ' +
    ((t.requester || []).map((u) => u.name).join(', ') || 'chưa có')));
  if (t.lienPhong) { /* đã có ô sửa ở trên — không lặp lại bản chỉ đọc */ }
  else if (t.detail) yc.than.appendChild(moTaDinhDang(t.detail));
  else yc.than.appendChild(el('div', 'd-desc trong-nhe', 'Chưa ghi chi tiết yêu cầu.'));
  if (t.link) {
    const oLink = el('div', 'field');
    oLink.appendChild(el('label', '', laLinkNguon(t.link) ? nhanNguon(t.link) : 'Link tài liệu / tracking'));
    oLink.appendChild(oLinkDoc(t.link));
    yc.than.appendChild(oLink);
  }
  /* Người order gửi thêm / gỡ tài liệu kèm ngay đây (anh Hùng 02/10/2026: "anh
   * chưa thể tải lên các tệp từ đây nữa"). Việc liên phòng: vào "File đính kèm"
   * của Base công ty; việc của phòng: ô "Tệp đính kèm". */
  yc.than.appendChild(khoiTep(t, 'Tài liệu yêu cầu', t.attachment, '', true,
    'Chưa có tài liệu kèm theo.'));
  yc.than.appendChild(oTaiLen(t, ''));
  b.appendChild(yc.the);

  // Thẻ 2: tình trạng & sản phẩm (chỉ đọc)
  const tt = theKhoi('Tình trạng & sản phẩm', 'cb');
  const chips = el('div', 'd-chips');
  chips.appendChild(vien('trạng thái', t.status || 'Chưa đặt', toneTrangThai(t.status)));
  if (t.priority) chips.appendChild(vien('ưu tiên', plainLabel(t.priority), toneUuTien(t.priority)));
  const nguoiPT = (t.owner || []).map((u) => u.name).join(', ');
  chips.appendChild(vien('phụ trách', nguoiPT || 'chưa gán'));
  if (t.workType) chips.appendChild(vien('loại', t.workType));
  if (t.deadline) chips.appendChild(vien('hạn', fmtDate(t.deadline, true), laTreTheoHan(t) ? 'red' : ''));
  if (t.rating) chips.appendChild(vien('điểm', '★'.repeat(t.rating) + ' ' + t.rating + '/5', 'green'));
  tt.than.appendChild(chips);

  const spLink = el('div', 'field');
  spLink.appendChild(el('label', '', 'Link kết quả'));
  if (t.linkKetQua) spLink.appendChild(moTaCoLink(t.linkKetQua));
  else spLink.appendChild(el('div', 'ro-note', 'Chưa có link kết quả.'));
  tt.than.appendChild(spLink);

  tt.than.appendChild(khoiTep(t, 'File kết quả (sản phẩm)', t.fileKetQua, 'ket-qua', false,
    'Chưa có sản phẩm nộp.'));
  b.appendChild(tt.the);

  // Editor đã gửi sản phẩm & chưa đóng → mời người order nghiệm thu
  if (t.daGiaiQuyet && !isClosed(t)) b.appendChild(nghiemThuBox(t));

  // trao đổi vẫn mở (đọc + gửi bình luận), không phải sửa việc
  b.appendChild(khoiBinhLuan(t));

  // hành động duy nhất của người order: gửi yêu cầu điều chỉnh
  if (t.lienPhong) return;   // việc liên phòng: người giao tự sửa ngay ở trên
  if (S.isManager) return; // quản lý dùng Sửa đầy đủ khi cần điều chỉnh
  const dc = el('div', 'sd-dc');
  dc.appendChild(el('div', 'sd-dc-txt',
    'Cần đổi deadline, nội dung hay thông tin của việc này? Gửi yêu cầu điều chỉnh — Admin sẽ xử lý, đừng tự sửa.'));
  const adj = el('button', 'btn', 'Gửi yêu cầu điều chỉnh');
  adj.onclick = () => { closeDrawer(); openAdjust(t); };
  dc.appendChild(adj);
  b.appendChild(dc);
}

/** Khối nghiệm thu cho người order: xem sản phẩm xong thì Đạt hoặc Cần chỉnh sửa. */
function nghiemThuBox(t) {
  const box = el('div', 'nt-box');
  box.appendChild(el('div', 'nt-title', 'Editor đã gửi sản phẩm — mời bạn nghiệm thu'));
  const h = nhanHanChinhSua(t);
  if (h) box.appendChild(el('div', 'nt-han' + (h.qua ? ' qua' : ''), h.txt));
  const ta = el('textarea', 'nt-gy');
  ta.placeholder = 'Góp ý nếu cần chỉnh sửa (tuỳ chọn)…';
  ta.rows = 2;
  box.appendChild(ta);
  const row = el('div', 'nt-row');
  const dat = el('button', 'btn btn-primary', '✓ Nghiệm thu đạt');
  dat.onclick = () => nghiemThuDat(t);
  const sua = el('button', 'btn btn-warn', '✗ Cần chỉnh sửa');
  sua.onclick = () => canChinhSua(t, ta.value.trim());
  row.appendChild(dat);
  row.appendChild(sua);
  box.appendChild(row);
  return box;
}

/** Nghiệm thu đạt → chốt Hoàn thành (thẻ chấm điểm của Base tự gửi như hiện nay). */
async function nghiemThuDat(t) {
  if (!confirm('Nghiệm thu đạt và đóng việc "' + (t.title || '') + '"?\n\nViệc chuyển Hoàn thành; thẻ chấm điểm được gửi cho người order.')) return;
  try {
    await req('/api/tasks/' + t.id + '/complete', { method: 'POST', body: JSON.stringify({}) });
    toast('Đã nghiệm thu. Việc chuyển Hoàn thành; thẻ chấm điểm được gửi cho người order.');
    closeDrawer();
    await refresh(true);
  } catch (e) { toast('Lỗi: ' + (e.message || e), true); }
}

/** Cần chỉnh sửa → trả về editor (chuyển "Làm lại"), kèm góp ý. */
async function canChinhSua(t, gopY) {
  if (!confirm('Trả việc "' + (t.title || '') + '" về cho editor chỉnh sửa?\n\nViệc chuyển sang Cần làm lại.')) return;
  try {
    await req('/api/tasks/' + t.id + '/tra-ve', {
      method: 'POST',
      body: JSON.stringify({ note: gopY || undefined }),
    });
    toast('Đã trả về để chỉnh sửa. Việc chuyển sang Cần làm lại.');
    closeDrawer();
    await refresh(true);
  } catch (e) { toast('Lỗi: ' + (e.message || e), true); }
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

    /* Bấm vào ảnh hoặc tên tệp vẫn mở xem được, nhưng không có gì trên màn hình
     * nói ra điều đó — anh Hùng bấm mãi tưởng hỏng (12/09/2026). Nút Xem đứng
     * cạnh Tải về cho thấy rõ hai việc khác nhau: coi tại chỗ hay giữ về máy. */
    const acts = el('div', 'attacts');
    const nhanh = el('button', 'attbtn', 'Xem');
    nhanh.onclick = () => moXemTep(t, a);
    acts.appendChild(nhanh);

    const tai = el('a', 'attbtn', 'Tải về');
    tai.href = urlTep(t.id, a.token, true);
    tai.setAttribute('download', a.name || '');
    acts.appendChild(tai);

    if (canUpload) {
      const xoa = el('button', 'attbtn del', 'Xoá');
      xoa.onclick = async () => {
        if (!confirm('Xoá tệp "' + (a.name || '') + '"? Tệp bị gỡ khỏi việc này, không khôi phục được.')) return;
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
      /* Một tệp hỏng không được làm hỏng cả mẻ: ghi tên lại rồi đi tiếp, cuối
       * cùng nói rõ cái nào không lên được. Trước đây ném lỗi giữa chừng là mấy
       * tệp còn lại bị bỏ, mà người dùng không biết đã lên được cái nào. */
      const hong = [];
      for (let i = 0; i < files.length; i++) {
        st.textContent = 'Đang tải ' + (i + 1) + '/' + files.length + ' — ' + files[i].name;
        try {
          const r = await fetch('api/tasks/' + t.id + '/upload' + (cot ? '?cot=' + cot : ''), {
            method: 'POST',
            headers: { 'X-File-Name': encodeURIComponent(files[i].name) },
            body: files[i],
          });
          const d = await docPhanHoi(r);
          if (!r.ok || d.error || d.__loi) throw new Error(d.error || d.__loi || 'Tải tệp thất bại');
        } catch (e) {
          hong.push(files[i].name + ' (' + e.message + ')');
        }
      }
      st.textContent = '';
      input.disabled = false;
      input.value = '';
      const duoc = files.length - hong.length;
      if (duoc) toast('Đã đính ' + duoc + ' tệp');
      if (hong.length) toast('Không tải được: ' + hong.join(' · '), true);
      if (duoc) { closeDrawer(); await refresh(true); }
    };
    row.appendChild(input);
    hop.appendChild(row);
    hop.appendChild(st);
  }
  return hop;
}

/** 60 MB — đúng mức server chặn trong /api/tasks/:id/upload. Chặn sớm ở đây để
 *  người dùng biết ngay, thay vì đợi tải hết tệp lên rồi mới bị trả về lỗi. */
const TEP_TOI_DA = 60 * 1024 * 1024;

const coTep = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');

/**
 * Ô chọn tệp cho việc CHƯA tồn tại (form "Tạo công việc mới").
 *
 * Khác ô oTaiLen ở drawer: Lark chỉ nhận tệp khi đã có record_id, mà lúc này
 * bản ghi chưa được tạo. Nên tệp chỉ được XẾP HÀNG trong bộ nhớ; tạo việc xong
 * saveDrawer mới đẩy lần lượt lên ô "Tệp đính kèm" — đúng ô tài liệu của người
 * order (ô "File kết quả" để dành cho sản phẩm nhân sự nộp về).
 */
function oTepViecMoi() {
  if (!S.tepMoi) S.tepMoi = [];
  const hop = el('div', 'field');
  hop.appendChild(el('label', '', 'Tệp đính kèm'));

  const ds = el('div', 'attgrid');
  const st = el('div', 'ro-note');

  const row = el('div', 'uploadrow');
  const input = el('input');
  input.type = 'file';
  input.multiple = true;
  row.appendChild(input);

  function ve() {
    ds.innerHTML = '';
    (S.tepMoi || []).forEach((f, i) => {
      const o = el('div', 'attitem');

      const xem = el('div', 'attthumb');
      if (laAnh(f.name)) {
        const img = el('img');
        /* Xem trước ngay từ máy, chưa cần lên Lark. Thu hồi URL khi bỏ tệp để
         * chọn nhầm vài chục ảnh rồi bỏ đi không giữ lại bộ nhớ. */
        img.src = f.__xem || (f.__xem = URL.createObjectURL(f));
        img.alt = '';
        /* Đuôi .jpg mà trình duyệt không mở được thì thường là tệp hỏng hoặc
         * đặt sai đuôi. Trả về ô "TỆP" cho gọn — vẫn đính lên được như thường. */
        img.onerror = () => { xem.innerHTML = ''; xem.classList.add('ic'); xem.textContent = 'TỆP'; };
        xem.appendChild(img);
      } else {
        xem.classList.add('ic');
        xem.textContent = laPdf(f.name) ? 'PDF' : laVideo(f.name) ? '▶' : 'TỆP';
      }
      o.appendChild(xem);

      const meta = el('div', 'attmeta');
      meta.appendChild(el('div', 'attname', f.name));
      meta.appendChild(el('div', 'attsize', coTep(f.size)));
      const acts = el('div', 'attacts');
      const bo = el('button', 'attbtn del', 'Bỏ ra');
      bo.type = 'button';
      bo.onclick = () => {
        if (f.__xem) URL.revokeObjectURL(f.__xem);
        S.tepMoi.splice(i, 1);
        ve();
      };
      acts.appendChild(bo);
      meta.appendChild(acts);
      o.appendChild(meta);

      ds.appendChild(o);
    });
    const n = (S.tepMoi || []).length;
    st.textContent = n
      ? n + ' tệp — sẽ tải lên ngay sau khi bấm "Tạo công việc".'
      : 'Brief, ảnh mẫu, tài liệu kèm yêu cầu. Tệp lên khi bấm "Tạo công việc".';
  }

  input.onchange = () => {
    for (const f of input.files) {
      if (f.size > TEP_TOI_DA) {
        toast('Tệp "' + f.name + '" nặng ' + coTep(f.size) + ' — tối đa 60 MB. Gửi bằng link Drive.', true);
        continue;
      }
      // Bấm chọn hai lần cùng một tệp thì không đính hai bản lên Base
      if ((S.tepMoi || []).some((x) => x.name === f.name && x.size === f.size)) continue;
      S.tepMoi.push(f);
    }
    input.value = '';
    ve();
  };

  hop.appendChild(row);
  hop.appendChild(ds);
  hop.appendChild(st);
  ve();
  return hop;
}

/**
 * Đẩy hàng đợi tệp lên việc vừa tạo. Trả về mảng tên tệp KHÔNG lên được.
 *
 * Không ném lỗi: bản ghi đã nằm trong Base rồi, một tệp hỏng mà làm cả lần tạo
 * việc báo đỏ thì người dùng tưởng chưa tạo được và bấm lại — thành hai việc.
 */
async function taiTepViecMoi(id) {
  const files = S.tepMoi || [];
  if (!files.length) return [];
  if (!id) return files.map((f) => f.name);   // server không trả id thì đành chịu
  const hong = [];
  for (const f of files) {
    try {
      const r = await fetch('api/tasks/' + id + '/upload', {
        method: 'POST',
        headers: { 'X-File-Name': encodeURIComponent(f.name) },
        body: f,
      });
      const d = await docPhanHoi(r);
      if (!r.ok || d.error || d.__loi) throw new Error(d.error || d.__loi || 'tải lên thất bại');
    } catch (_) {
      hong.push(f.name);
    }
  }
  return hong;
}

/* ---- bình luận trong công việc ---- */
/* ==================================================================
   NGĂN CHI TIẾT VIỆC: 3 TAB — Thông tin · Trao đổi · Lịch sử
   Anh Hùng (01/10/2026), theo app giao việc của phòng bạn: "chat trên task và
   phân tab riêng khá hay". Form cũ dồn trao đổi xuống đáy, phải cuộn qua cả
   form mới thấy; giờ trao đổi là một tab riêng dạng chat, có số tin trên tab.
   ================================================================== */

/** Tab đang mở — giữ qua các lần mở việc khác cho đỡ phải bấm lại. */
let DT_TAB = 'info';
/* Hẹn giờ nạp lại tin khi tab Trao đổi đang mở (người kia trả lời thì thấy). */
let henChat = 0;

function chiaTab(b, t, tuyChon) {
  const khongChat = !!(tuyChon && tuyChon.khongChat);   // việc liên phòng: trao đổi ở app công ty
  clearInterval(henChat); henChat = 0;
  const chat = b.querySelector(':scope > .cmt-khoi');
  if (chat) chat.remove();

  const info = el('div', 'dt-pane dt-info');
  while (b.firstChild) info.appendChild(b.firstChild);
  /* ios-khong-nhap: ô nhắn tin không phải form — lớp vỏ iOS đừng giữ nháp cho nó. */
  const paneChat = el('div', 'dt-pane dt-chat ios-khong-nhap');
  if (chat) paneChat.appendChild(chat);
  const paneLs = el('div', 'dt-pane dt-ls');
  if (!['info', 'chat', 'bc'].includes(DT_TAB)) DT_TAB = 'info';

  const bar = el('div', 'dt-tabs');
  const nut = {};
  const mk = (ma, ic, ten) => {
    const x = el('button', 'dt-tab');
    x.type = 'button';
    x.innerHTML = '<span class="dt-ic">' + ic + '</span><span>' + ten + '</span><span class="dt-n hidden"></span>';
    x.onclick = () => chon(ma);
    bar.appendChild(x);
    nut[ma] = x;
  };
  mk('info', 'ⓘ', 'Thông tin');
  if (!khongChat) mk('chat', '💬', 'Trao đổi');
  /* Anh Hùng 01/10: "Lịch sử" đổi thành "Báo cáo" — các lần nhân sự tick việc
   * này trong báo cáo ngày kèm tiến độ; mốc của việc nằm dưới cùng. */
  mk('bc', '📋', 'Báo cáo');

  const dat = (ma, n) => {
    const s = nut[ma] && nut[ma].querySelector('.dt-n');
    if (!s) return;
    s.textContent = n;
    s.classList.toggle('hidden', !n);
  };
  b._datSo = dat;

  function chon(ma) {
    if (khongChat && ma === 'chat') ma = 'info';
    DT_TAB = ma;
    for (const k of Object.keys(nut)) nut[k].classList.toggle('on', k === ma);
    info.classList.toggle('hidden', ma !== 'info');
    paneChat.classList.toggle('hidden', ma !== 'chat');
    paneLs.classList.toggle('hidden', ma !== 'bc');
    b.classList.toggle('dt-dang-chat', ma === 'chat');
    b.dataset.tab = ma;   // khung "Có bản nháp chưa lưu" của lớp vỏ chỉ hiện ở Thông tin (CSS)
    clearInterval(henChat); henChat = 0;
    if (ma === 'chat') {
      const list = paneChat.querySelector('.cmt-list');
      if (list) {
        list.scrollTop = list.scrollHeight;
        henChat = setInterval(() => {
          if (!S.editing || S.editing.id !== t.id || !document.body.contains(list)) {
            clearInterval(henChat); henChat = 0; return;
          }
          napBinhLuan(t, list, true);
        }, 15000);
      }
      const ta = paneChat.querySelector('.cmt-input');
      if (ta) setTimeout(() => ta.focus(), 30);
    }
    if (ma === 'bc') veBaoCao(t, paneLs);
    b.scrollTop = 0;
  }

  b.appendChild(bar);
  b.appendChild(info);
  b.appendChild(paneChat);
  b.appendChild(paneLs);
  chon(DT_TAB);
  /* Đếm số lần báo cáo ngay khi mở, để tab có số như tab Trao đổi. */
  napBaoCaoViec(t).then((ds) => dat('bc', ds.length)).catch(() => {});
}

function khoiBinhLuan(t) {
  const f = el('div', 'cmt-khoi');

  const list = el('div', 'cmt-list');
  if (window.KX) list.innerHTML = KX.log(3);
  else list.appendChild(el('div', 'cmt-load', 'Đang tải…'));
  f.appendChild(list);

  const soan = el('div', 'cmt-new');
  const ta = el('textarea', 'cmt-input');
  ta.rows = 2;
  ta.placeholder = 'Nhắn tin… (Enter gửi, Shift+Enter xuống dòng)';
  /* Tin đang gõ dở giữ trên máy theo từng việc (02/10/2026): đóng ngăn chi tiết,
   * tải lại trang hay chuyển việc khác rồi quay lại vẫn còn. Gửi được là xoá. */
  const khoaTin = 'cong-viec.tin-do.' + t.id;
  try { ta.value = localStorage.getItem(khoaTin) || ''; } catch (_) {}
  let henTin = 0;
  ta.addEventListener('input', () => {
    clearTimeout(henTin);
    henTin = setTimeout(() => {
      try { if (ta.value.trim()) localStorage.setItem(khoaTin, ta.value); else localStorage.removeItem(khoaTin); } catch (_) {}
    }, 300);
  });
  const gui = el('button', 'btn btn-primary cmt-gui', '➤ Gửi');
  gui.onclick = async () => {
    const noi = ta.value.trim();
    if (!noi) return;
    gui.disabled = true;
    /* Hiện ngay bong bóng "đang gửi" — không bắt người gõ ngồi chờ Base. */
    const tam = bongBong({ content: noi, author: S.meta.me ? [S.meta.me] : [], at: new Date().toISOString() }, true);
    tam.classList.add('dang-gui');
    const rong = list.querySelector('.cmt-load');
    if (rong) rong.remove();
    list.appendChild(tam);
    list.scrollTop = list.scrollHeight;
    ta.value = '';
    clearTimeout(henTin);
    try {
      const d = await req('/api/tasks/' + t.id + '/comments', {
        method: 'POST', body: JSON.stringify({ content: noi }),
      });
      try { localStorage.removeItem(khoaTin); } catch (_) {}
      /* Báo tin hỏng thì phải NÓI RA. Trước đây máy chủ bắn tin rồi quên, màn
       * hình không biết gì, nên tin không tới nơi mà vẫn im như đã tới. */
      const b = d && d.bao;
      if (b && b.hong) toast('Đã gửi, nhưng không báo được Lark cho ' + b.hong + ' người', true);
      await napBinhLuan(t, list, true);
    } catch (e) {
      tam.remove();
      ta.value = noi;
      toast('Lỗi: ' + e.message, true);
    } finally { gui.disabled = false; ta.focus(); }
  };
  ta.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); gui.click(); }
  };
  soan.appendChild(ta);
  soan.appendChild(gui);
  f.appendChild(soan);
  /* Nói ĐÚNG ai sẽ nhận, không hứa chung chung.
   *
   * Câu cũ — "Người phụ trách, người hỗ trợ và người order sẽ nhận thông báo
   * trong Lark" — mô tả luật, không mô tả việc này. Việc chưa ai nhận thì ô
   * phụ trách trống, có khi người gõ là người duy nhất có tên: không ai nhận
   * được gì, mà dòng chữ vẫn hứa như thường. Đọc tên ra thì nhìn một cái là
   * biết tin sẽ đi đâu, và biết luôn khi nó chẳng đi đâu cả. */
  const ai = [...(t.owner || []), ...(t.helper || []), ...(t.requester || [])]
    .filter((u) => u && u.id && (!S.meta.me || u.id !== S.meta.me.id))
    .filter((u, i, a) => a.findIndex((x) => x.id === u.id) === i)
    .map((u) => u.name).filter(Boolean);
  f.appendChild(el('div', 'ro-note cmt-goi-y', ai.length
    ? 'Gửi xong sẽ báo Lark cho: ' + ai.join(', ') + '.'
    : 'Việc này chưa có ai khác ngoài bạn — tin sẽ không báo Lark cho ai.'));

  napBinhLuan(t, list);
  return f;
}

/** Một bong bóng tin. `cuaToi` = tin của người đang xem (nằm bên phải). */
function bongBong(c, cuaToi) {
  const ten = (c.author && c.author[0] && c.author[0].name) || 'Ẩn danh';
  const o = el('div', 'cmt' + (cuaToi ? ' cua-toi' : ''));
  if (!cuaToi) {
    const av = el('span', 'av av-sm', initials(ten));
    av.style.background = colorOf(ten);
    o.appendChild(av);
  }
  const body = el('div', 'cmt-body');
  const head = el('div', 'cmt-head');
  head.appendChild(el('span', 'cmt-who', cuaToi ? 'Bạn' : ten));
  const g = c.at ? vnParts(c.at) : null;
  head.appendChild(el('span', 'cmt-at', g ? p2(g.H) + ':' + p2(g.M) : ''));
  body.appendChild(head);
  body.appendChild(el('div', 'cmt-txt', c.content));
  o.appendChild(body);
  return o;
}

async function napBinhLuan(t, list, im) {
  try {
    const d = await req('/api/tasks/' + t.id + '/comments');
    t._cmts = d.comments;
    /* Việc liên phòng đã nối Rooty Workspace (15/10/2026): một luồng tin chung hai bên. */
    const goiY = list.parentElement && list.parentElement.querySelector('.cmt-goi-y');
    if (goiY && d.rw) {
      goiY.textContent = d.rw.loi
        ? 'Chưa đọc được trao đổi bên Rooty Workspace: ' + d.rw.loi
        : 'Chung một luồng với Rooty Workspace (' + d.rw.ma + '): nhắn ở đây thì bên đó thấy y vậy, bên đó báo Lark cho người liên quan.';
      goiY.classList.toggle('cmt-goi-y-loi', !!d.rw.loi);
    }
    const b = list.closest('.drawer-body');
    if (b && b._datSo) b._datSo('chat', d.comments.length);
    /* Nạp lại định kỳ: không có gì mới thì khỏi vẽ lại (giữ chỗ đang cuộn). */
    const dau = d.comments.map((c) => c.id).join(',');
    /* Nhưng "mới" không chỉ là có thêm TIN. Người kia mở ra đọc cũng là tin
     * mới cần vẽ lại — mà dấu đã xem đổi thì danh sách tin thì không, nên nếu
     * chỉ so id tin thì lượt nạp thoát ngay ở đây và dòng "Chưa ai xem" đứng
     * nguyên mãi. Anh Hùng gặp đúng chuyện này 02/10/2026: Trường đã xem rồi
     * mà màn hình vẫn báo chưa.
     *
     * Khi CHỈ có dấu đã xem đổi thì vẽ lại mỗi dòng đó, không dựng lại cả danh
     * sách tin: dựng lại là nhảy mất chỗ đang cuộn và chớp một cái, trong khi
     * thứ đổi chỉ là một dòng chữ cuối. */
    const dauXem = (d.daXem || []).map((x) => x.id + '@' + x.at).sort().join(',');
    if (im && list._dau === dau) {
      if (list._dauXem === dauXem) return;
      list._dauXem = dauXem;
      const cu = list.querySelector('.cmt-daxem');
      if (cu) cu.remove();
      veDaXem(list, d.comments, d.daXem || [], S.meta.me && S.meta.me.id);
      return;
    }
    list._dau = dau;
    list._dauXem = dauXem;
    const oCuoi = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    list.innerHTML = '';
    if (!d.comments.length) {
      list.appendChild(el('div', 'cmt-load', 'Chưa có trao đổi nào — nhắn tin đầu tiên cho việc này.'));
      return;
    }
    const meId = S.meta.me && S.meta.me.id;
    /* Vạch "Tin mới": chụp mốc "đã xem" của mình MỘT LẦN lúc mở việc, trước khi
     * app ghi mốc mới, để vạch còn đứng đúng chỗ suốt lúc đang đọc. Chỉ vẽ khi
     * máy chủ báo việc này có tin chưa đọc (việc cũ chưa từng mở thì khỏi vạch
     * trên tin đầu tiên). */
    if (t._mocTinMoi === undefined) {
      const cua = (d.daXem || []).find((x) => x.id === meId);
      t._mocTinMoi = S.chuaDoc && S.chuaDoc.has(t.id) ? (cua ? msGioTin(cua.at) : 0) : null;
    }
    let vachMoi = null;
    let ngayTruoc = '';
    for (const c of d.comments) {
      const ngay = c.at ? fmtDate(c.at) : '';
      if (ngay && ngay !== ngayTruoc) {
        list.appendChild(el('div', 'cmt-ngay', ngay));
        ngayTruoc = ngay;
      }
      const tacGia = c.author && c.author[0] && c.author[0].id;
      if (!vachMoi && t._mocTinMoi !== null && tacGia !== meId && msGioTin(c.at) > t._mocTinMoi) {
        vachMoi = el('div', 'cmt-moi', 'Tin mới');
        list.appendChild(vachMoi);
      }
      list.appendChild(bongBong(c, !!meId && tacGia === meId));
    }
    veDaXem(list, d.comments, d.daXem || [], meId);
    /* Lần đầu mở: đưa vạch "Tin mới" lên gần đầu khung thay vì cuộn xuống đáy,
     * để đọc từ tin chưa đọc đầu tiên. */
    if (!im && vachMoi) list.scrollTop = Math.max(0, vachMoi.offsetTop - list.offsetTop - 12);
    else if (!im || oCuoi) list.scrollTop = list.scrollHeight;
    /* Mình vừa NHÌN THẤY những tin này — đánh dấu. Chỉ gọi khi có tin của
     * NGƯỜI KHÁC mới hơn mốc đã ghi, chứ không gọi mỗi nhịp nạp lại: tab này
     * tự nạp đều đặn, gọi theo nhịp đó là mỗi người mở một tab thành vài chục
     * lượt ghi Base mỗi phút. */
    danhDauDaXem(t, d.comments, d.daXem || [], meId);
  } catch (e) {
    if (im) return;
    list.innerHTML = '';
    list.appendChild(el('div', 'cmt-load', 'Không tải được trao đổi: ' + e.message));
  }
}

/* ==========================================================================
   DẤU "ĐÃ XEM"
   ==========================================================================
   Một người đã đọc tin nào: so GIỜ. Mốc "Xem tới" của họ ≥ giờ của tin thì tin
   đó họ đã đọc. So theo giờ chứ không lưu id tin cuối — lưu id thì tin tới trễ
   hoặc tin bị sửa sẽ làm lệch, còn so giờ thì chỉ một phép so.
*/

/** Vẽ dòng "đã xem" dưới tin CUỐI CÙNG của mình. */
function veDaXem(list, cmts, daXem, meId) {
  if (!meId || !cmts.length) return;
  /* Chỉ gắn dưới tin cuối của mình: gắn dưới mọi tin thì một cuộc trao đổi dài
   * thành ra đầy chữ "đã xem" lặp lại, đọc rất mệt mà không thêm thông tin. */
  let cuoi = null;
  for (const c of cmts) {
    if (c.author && c.author[0] && c.author[0].id === meId) cuoi = c;
  }
  if (!cuoi || !cuoi.at) return;
  const moc = new Date(cuoi.at).getTime();
  const roi = daXem.filter((x) => x.id !== meId && new Date(x.at).getTime() >= moc);
  const o = el('div', 'cmt-daxem');
  if (!roi.length) {
    o.classList.add('chua');
    o.textContent = 'Chưa ai xem';
  } else {
    const gio = (s) => { const g = vnParts(s); return p2(g.H) + ':' + p2(g.M); };
    /* Một người thì nói rõ lúc mấy giờ; đông người thì nói số, không liệt kê
     * một hàng dài tên. */
    o.textContent = roi.length === 1
      ? '✓✓ ' + roi[0].name + ' đã xem ' + gio(roi[0].at)
      : '✓✓ ' + roi.length + ' người đã xem';
    o.title = roi.map((x) => x.name + ' · ' + gio(x.at)).join('\n');
  }
  list.appendChild(o);
}

/**
 * Đánh dấu mình đã xem — chỉ khi THẬT SỰ có cái mới để đánh dấu.
 *
 * Điều kiện: có tin của người khác, và tin mới nhất trong số đó mới hơn mốc đã
 * ghi của mình. Không có điều kiện này thì mỗi nhịp nạp lại là một lượt ghi
 * Base, nhân với số người đang mở tab.
 */
function danhDauDaXem(t, cmts, daXem, meId) {
  if (!meId || !cmts.length) return;
  const cuaNguoiKhac = cmts.filter((c) => !(c.author && c.author[0] && c.author[0].id === meId) && c.at);
  if (!cuaNguoiKhac.length) return;
  const moiNhat = Math.max(...cuaNguoiKhac.map((c) => new Date(c.at).getTime()));
  const cua = daXem.find((x) => x.id === meId);
  if (cua && new Date(cua.at).getTime() >= moiNhat) return;     // đã đánh dấu rồi
  /* Chặn gọi chồng: hai nhịp nạp sát nhau trước khi lượt ghi đầu kịp xong. */
  if (t._dangDanhDau) return;
  t._dangDanhDau = true;
  req('/api/tasks/' + t.id + '/da-xem', { method: 'POST' })
    .then(() => { if (S.chuaDoc && S.chuaDoc.delete(t.id)) render(); })   // thẻ việc thôi báo "tin mới"
    .catch(() => {})                 // dấu đã xem hỏng thì thôi, đừng phá tab
    .finally(() => { t._dangDanhDau = false; });
}

/* ---- Lịch sử ----
 * Bảng việc trên Base KHÔNG có cột ngày tạo, cũng không ghi ai đổi gì lúc nào,
 * nên lịch sử dựng lại từ những mốc có thật: ngày bắt đầu, hạn, các yêu cầu
 * điều chỉnh, các lần trao đổi, nộp kết quả, ngày giải quyết. */
function dsLichSu(t) {
  const ten = (ds) => (ds || []).map((u) => u.name).filter(Boolean).join(', ');
  const ra = [];
  if (t.startAt) {
    ra.push({ at: t.startAt, loai: 0, ic: '📨', chu: (ten(t.requester) || 'Người order') + ' giao việc' +
      (ten(t.owner) ? ' cho ' + ten(t.owner) : '') + (ten(t.helper) ? ' · hỗ trợ: ' + ten(t.helper) : '') });
  }
  if (t.deadline1) ra.push({ at: t.deadline1, loai: 3, ic: '⏰', chu: 'Deadline 1', hen: true });
  if (t.deadline2 && t.deadline2 !== t.deadline1) ra.push({ at: t.deadline2, loai: 3, ic: '⏰', chu: 'Deadline 2', hen: true });
  for (const y of (S.requests || []).filter((r) => (r.taskIds || []).includes(t.id))) {
    ra.push({ at: null, ic: '✏️', chu: (ten(y.sender) || 'Ai đó') + ' gửi yêu cầu điều chỉnh' +
      ((y.parts || []).length ? ': ' + y.parts.join(', ') : '') + (y.handled ? ' — đã xử lý' : ' — chờ xử lý') });
  }
  for (const c of (t._cmts || [])) {
    ra.push({ at: c.at, loai: 1, ic: '💬', chu: ((c.author && c.author[0] && c.author[0].name) || 'Ẩn danh') + ' nhắn: ' +
      String(c.content || '').replace(/\s+/g, ' ').slice(0, 80) });
  }
  if (t.linkKetQua || (t.fileKetQua || []).length) {
    ra.push({ at: null, ic: '📦', chu: 'Đã nộp kết quả' +
      ((t.fileKetQua || []).length ? ' · ' + t.fileKetQua.length + ' tệp' : '') + (t.linkKetQua ? ' · có link' : '') });
  }
  if (t.ngayGiaiQuyet) ra.push({ at: t.ngayGiaiQuyet, loai: 2, ic: '✅', chu: 'Đánh dấu đã giải quyết' });
  ra.push({ at: null, ic: '●', chu: 'Trạng thái hiện tại: ' + (t.status || '—'), hienTai: true });
  /* Có ngày thì xếp theo NGÀY; cùng ngày thì giao việc trước, rồi trao đổi, giải
   * quyết, hạn sau cùng (ô chỉ có ngày mang giờ 00:00 — so giờ là đảo thứ tự).
   * Mục không có ngày nằm sau, giữ thứ tự thêm. */
  const ngay = (v) => { const p = vnParts(v); return p ? p.y * 10000 + p.m * 100 + p.d : 0; };
  const gio = (v) => { const g = new Date(v).getTime(); return isNaN(g) ? 0 : g; };
  return ra.map((x, i) => Object.assign(x, { i }))
    .sort((a, b) => (a.at ? 0 : 1) - (b.at ? 0 : 1) ||
      (a.at && b.at ? ngay(a.at) - ngay(b.at) || (a.loai || 0) - (b.loai || 0) || gio(a.at) - gio(b.at) : 0) ||
      a.i - b.i);
}

function veLichSu(t, pane) {
  const ds = dsLichSu(t);
  const ul = el('div', 'ls-ds');
  for (const x of ds) {
    const d = el('div', 'ls-m' + (x.hen ? ' hen' : '') + (x.hienTai ? ' hien-tai' : ''));
    d.appendChild(el('span', 'ls-ic', x.ic));
    const th = el('div', 'ls-than');
    th.appendChild(el('div', 'ls-chu', x.chu));
    if (x.at) th.appendChild(el('div', 'ls-at', fmtDate(x.at, true)));
    d.appendChild(th);
    ul.appendChild(d);
  }
  pane.appendChild(ul);
}

/* ---- tab Báo cáo: dữ liệu báo cáo ngày của app Báo cáo công việc ---- */
async function napBaoCaoViec(t, moi) {
  if (t._bc && !moi) return t._bc;
  const d = await req('/api/tasks/' + t.id + '/bao-cao');
  t._bc = d.dong || [];
  t._bcLoi = d.loi || '';
  return t._bc;
}

const THU_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
function nhanNgayBC(ms) {
  const p = vnParts(ms);
  if (!p) return '';
  const thu = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return THU_VN[thu] + ' ' + p2(p.d) + '/' + p2(p.m);
}
const gioPhut = (ph) => { ph = Math.round(ph || 0); const g = Math.floor(ph / 60), m = ph % 60; return g ? g + ' giờ' + (m ? ' ' + m + ' phút' : '') : m + ' phút'; };

async function veBaoCao(t, pane) {
  pane.innerHTML = '';
  const dang = el('div', 'cmt-load', 'Đang đọc báo cáo ngày…');
  pane.appendChild(dang);
  let ds = [];
  try { ds = await napBaoCaoViec(t, true); } catch (e) { t._bcLoi = e.message; }
  if (!pane.isConnected) return;
  pane.innerHTML = '';
  const b = pane.closest('.drawer-body');
  if (b && b._datSo) b._datSo('bc', ds.length);

  const khoi = el('div', 'bc-khoi');
  if (t._bcLoi) khoi.appendChild(el('div', 'bc-trong', t._bcLoi));
  else if (!ds.length) {
    khoi.appendChild(el('div', 'bc-trong',
      'Chưa có báo cáo ngày nào chọn việc này. Khi nhân sự báo cáo ngày và tick việc này kèm tiến độ, từng lần sẽ hiện ở đây.'));
  } else {
    /* Tóm tắt: tiến độ mới nhất + tổng thời gian đã khai cho việc này. */
    const cuoi = ds[ds.length - 1];
    const tong = ds.reduce((x, d) => x + (d.phut || 0), 0);
    const pt = cuoi.tienDoPt == null ? null : Math.max(0, Math.min(100, cuoi.tienDoPt));
    const tt = el('div', 'bc-tom');
    tt.innerHTML = '<div class="bc-tom-dau"><span>Tiến độ mới nhất</span><b>' + (pt == null ? '—' : pt + '%') + '</b></div>' +
      '<div class="bc-thanh"><i style="width:' + (pt || 0) + '%"></i></div>' +
      '<div class="bc-tom-duoi">' + escPP(cuoi.ten || '') + ' · ' + escPP(nhanNgayBC(cuoi.ngay)) +
      ' · tổng ' + escPP(gioPhut(tong)) + ' qua ' + ds.length + ' lần báo cáo</div>';
    khoi.appendChild(tt);

    const list = el('div', 'bc-ds');
    for (const d of ds.slice().reverse()) {
      const o = el('div', 'bc-m');
      const p = d.tienDoPt == null ? null : Math.max(0, Math.min(100, d.tienDoPt));
      const ten = d.ten || 'Ẩn danh';
      const av = el('span', 'av av-sm', initials(ten));
      av.style.background = colorOf(ten);
      o.appendChild(av);
      const th = el('div', 'bc-than');
      th.innerHTML =
        '<div class="bc-dau"><b>' + escPP(ten) + '</b><span class="bc-ngay">' + escPP(nhanNgayBC(d.ngay)) + '</span>' +
          (d.daNop ? '' : '<span class="bc-nhap">nháp</span>') +
          '<span class="bc-pt">' + (p == null ? '—' : p + '%') + '</span></div>' +
        '<div class="bc-thanh nho"><i style="width:' + (p || 0) + '%"></i></div>' +
        '<div class="bc-so">' + [d.nhom, d.phut ? gioPhut(d.phut) : '', d.soLuong ? 'SL ' + d.soLuong : '', d.trangThai]
          .filter(Boolean).map((x) => '<span>' + escPP(x) + '</span>').join('') + '</div>' +
        ((d.tienDo || d.ghiChu) ? '<div class="bc-ghi">' + escPP([d.tienDo, d.ghiChu].filter(Boolean).join(' · ')) + '</div>' : '');
      o.appendChild(th);
      list.appendChild(o);
    }
    khoi.appendChild(list);
  }
  pane.appendChild(khoi);

  /* Mốc của việc (bản "Lịch sử" cũ) — gọn ở dưới cùng. */
  pane.appendChild(el('div', 'bc-tieu', 'Mốc của việc'));
  veLichSu(t, pane);
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
      // đợi lượt tự lưu nháp đang chạy xong, để "Tạo công việc" đè đúng bản nháp đó
      clearTimeout(henNhap); henNhap = 0;
      if (nhapDangLuu) await nhapDangLuu;
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

      /* Lớn lên từ nháp thì ĐÈ LÊN chính bản ghi đó — tệp đã đính lúc nháp đi
       * thẳng sang việc thật, và Base không còn lại một bản nháp mồ côi. */
      if (S.nhapId) payload.tuNhap = S.nhapId;

      if (!payload.title) throw new Error('Cần nhập tên công việc');
      if (!payload.detail && !payload.parent) throw new Error('Cần nhập chi tiết yêu cầu');
      if (!payload.workType) throw new Error('Cần chọn loại công việc');
      if (!payload.deadline1) throw new Error('Cần chọn deadline');

      const kq = await req('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });

      /* Việc đã lên Base thì nháp hết vai trò. Xoá NGAY sau khi tạo xong, trước cả
       * bước tải tệp: tệp hỏng thì việc vẫn còn đó, giữ nháp lại chỉ khiến lần sau
       * mở form ra thấy bản cũ và đặt trùng việc. */
      S.nhapId = null;    // nháp đã hoá thành việc thật

      /* Tệp đi sau bản ghi, vì Lark cần record_id mới nhận tệp. */
      const soTep = (S.tepMoi || []).length;
      if (soTep) btn.textContent = 'Đang tải tệp…';
      const hong = await taiTepViecMoi(kq && kq.id);
      S.tepMoi = [];

      const laCon = !!payload.parent;
      toast(laCon ? 'Đã thêm việc con'
        : S.isManager
        ? 'Đã tạo công việc mới' + (soTep ? ' · ' + (soTep - hong.length) + '/' + soTep + ' tệp' : '')
        : 'Đã gửi yêu cầu công việc. Quản lý sẽ phân công người phụ trách.');
      if (hong.length) {
        toast('Việc đã tạo nhưng chưa đính được: ' + hong.join(' · ') +
          ' — mở việc ra đính lại ở ô Tệp đính kèm.', true);
      }
      closeDrawer();
      await refresh(true);
      /* Thêm xong việc con thì quay về việc lớn, thấy ngay nó nằm trong danh sách. */
      if (laCon) {
        const cha = viecTheoMa(payload.parent[0]);
        if (cha) openDrawer(cha);
      }
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
  /* Việc đã có tự lưu — đóng là closeDrawer() gửi nốt phần chưa lưu. */
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
  if ((S.tasks || []).some((x) => x.id === id && x.lienPhong)) return;   // liên phòng: không chọn để sửa hàng loạt
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
  if ($('#oCampaign')) {
    $('#oCampaign').value = S.of.campaign;
    $('#oWorkType').value = S.of.workType;
    $('#oStatus').value = S.of.status;
    $('#oDue').value = S.of.due;
    $('#oDueDate') && ($('#oDueDate').value = S.of.dueDate);
    $('#oHideDone').checked = S.of.hideDone;
  }
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
  /* Phân công hàng loạt — thao tác quản lý cần nhất khi chọn nhiều dòng, mà thanh
   * này trước chỉ có đổi trạng thái / ưu tiên / xoá. API bulk đã nhận `owner` từ
   * lâu (lớp vỏ vẫn dùng), chỉ thiếu chỗ bấm. Xếp người đang giữ nhiều việc lên
   * đầu để khỏi cuộn tìm trong 36 cái tên. */
  const oNguoi = $('#bulkOwner');
  if (oNguoi) {
    /* `S.meta.people` không kèm số việc, nên tự đếm từ dữ liệu đang có — xếp theo
     * ai đang giữ nhiều việc MỞ để người còn làm nổi lên trước, thay vì để 36 cái
     * tên theo bảng chữ cái lẫn cả người đã nghỉ. */
    const dem = new Map();
    for (const t of S.tasks || []) {
      if (['Hoàn thành', 'Hủy'].includes(t.status)) continue;
      for (const u of t.owner || []) if (u && u.id) dem.set(u.id, (dem.get(u.id) || 0) + 1);
    }
    const ds = (S.meta.people || []).slice()
      .sort((a, b) => (dem.get(b.id) || 0) - (dem.get(a.id) || 0) ||
        String(a.name).localeCompare(String(b.name), 'vi'));
    oNguoi.innerHTML = '<option value="">Phân công cho…</option>' +
      ds.map((p) => '<option value="' + p.id + '">' + escPP(p.name) +
        (dem.get(p.id) ? '  · ' + dem.get(p.id) + ' việc mở' : '') + '</option>').join('');
  }
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

  // Bộ lọc tab "Việc tôi order"
  fillSelect($('#oCampaign'), o.campaign, 'Chiến dịch: tất cả');
  fillSelect($('#oWorkType'), o.workType, 'Loại việc: tất cả');
  fillSelect($('#oStatus'), o.status, 'Trạng thái: tất cả');
  fillDueSelect($('#oDue'), 'Thời gian: tất cả');
  if (window.HUB_SEG && DUOI_HUB()) window.HUB_SEG($('#oDue'));

  // Ô chọn nhân sự: dùng chung component có ô tìm + số việc, không dùng <select>
  lapChonNguoi('fOwnerHost', 'Phụ trách: tất cả',
    () => S.filters.owner, (v) => { S.filters.owner = v; });
  lapChonNguoi('oOwnerHost', 'Phụ trách: tất cả',
    () => S.of.owner, (v) => { S.of.owner = v; });
  lapChonNguoi('dPersonHost', 'Nhân sự: tất cả',
    () => S.df.person, (v) => { S.df.person = v; });
  lapChonNguoi('calPersonHost', 'Mọi nhân sự',
    () => S.cf.person, (v) => { S.cf.person = v; });
}

/* =======================  render: việc tôi order  ======================= */
function filterOrders() {
  const f = S.of;
  const q = (S.filters.q || '').trim().toLowerCase();
  const review = S.isManager && S.orderScope === 'review';
  let list = S.orders.filter((t) => review
    ? !t.lienPhong && t.daGiaiQuyet && !isClosed(t)
    : (t.requester || []).some((u) => u.id === (S.meta.me || {}).id));
  if (f.campaign) list = list.filter((t) => t.campaign === f.campaign);
  if (f.workType) list = list.filter((t) => t.workType === f.workType);
  if (f.status) list = list.filter((t) => t.status === f.status);
  if (f.owner) list = list.filter((t) => (t.owner || []).some((u) => u.id === f.owner));
  if (f.hideDone) list = list.filter((t) => !isClosed(t));
  if (f.due) list = list.filter((t) => matchDue(t, f.due, f.dueDate));
  if (q) {
    list = list.filter((t) =>
      [t.title, t.detail, t.campaign, t.workType, t.status]
        .concat((t.owner || []).map((u) => u.name), (t.requester || []).map((u) => u.name)).join(' ').toLowerCase().includes(q));
  }
  return list;
}

function orderCard(t) {
  const c = el('div', 'ord-card');
  c.dataset.id = t.id;

  const top = el('div', 'ord-top');
  top.appendChild(veTen('div', 'ord-title', t));
  const st = el('span', 'ord-status');
  st.style.background = STATUS_HUE[t.status] || '#8f959e';
  st.textContent = t.status || 'Chưa đặt';
  top.appendChild(st);
  c.appendChild(top);

  const meta = el('div', 'ord-meta');
  if (t.workType) meta.appendChild(el('span', 'tag', t.workType));
  if (t.campaign) meta.appendChild(el('span', 'tag', t.campaign));
  if (t.priority) meta.appendChild(el('span', 'tag ' + priClass(t.priority), plainLabel(t.priority)));
  const dl = deadlineTag(t);
  if (dl) meta.appendChild(dl);
  c.appendChild(meta);

  const foot = el('div', 'ord-foot');
  const who = el('div', 'ord-who');
  who.appendChild(el('span', 'ord-lbl', 'Phụ trách:'));
  if ((t.owner || []).length) {
    const av = el('div', 'avatars');
    for (const u of t.owner.slice(0, 3)) {
      const a = el('div', 'av', initials(u.name));
      a.style.background = colorOf(u.name); a.title = u.name; av.appendChild(a);
    }
    who.appendChild(av);
  } else who.appendChild(el('span', 'muted', 'chưa gán'));
  foot.appendChild(who);
  if (S.isManager && S.orderScope === 'review') {
    foot.appendChild(el('span', 'ord-lbl', 'Order: ' +
      ((t.requester || []).map((u) => u.name).join(', ') || 'chưa có')));
  }

  // "Sản phẩm" = File kết quả + Link kết quả (deliverable của nhân sự)
  const nFile = (t.fileKetQua || []).length;
  const hasLink = !!(t.linkKetQua || t.link);
  const sp = el('span', 'ord-sp' + (nFile || hasLink ? ' co' : ''));
  if (nFile || hasLink) {
    const parts = [];
    if (nFile) parts.push(nFile + ' tệp');
    if (hasLink) parts.push('link');
    sp.textContent = 'Sản phẩm: ' + parts.join(' + ');
  } else sp.textContent = 'Chưa có sản phẩm';
  foot.appendChild(sp);

  if (t.rating) foot.appendChild(el('span', 'ord-rate', '★'.repeat(t.rating) + ' ' + t.rating + '/5'));
  const hc = nhanHanChinhSua(t);
  if (hc && !isClosed(t)) foot.appendChild(el('span', 'ord-han' + (hc.qua ? ' qua' : ''), hc.txt));
  c.appendChild(foot);

  c.addEventListener('click', () => openDrawer(t));
  return c;
}

function renderOrders() {
  const box = $('#orderList');
  box.innerHTML = '';
  const list = filterOrders();
  const review = S.isManager && S.orderScope === 'review';
  const total = S.orders.filter((t) => review
    ? !t.lienPhong && t.daGiaiQuyet && !isClosed(t)
    : (t.requester || []).some((u) => u.id === (S.meta.me || {}).id)).length;
  $('#oCount').textContent = 'Hiển thị ' + list.length + ' / ' + total +
    (review ? ' việc chờ nghiệm thu trong phòng' : ' việc bạn đã order');
  if (S.ordersError) box.appendChild(el('div', 'ord-empty',
    'Không cập nhật được danh sách: ' + S.ordersError + '. Bấm Làm mới để thử lại.'));
  if (!list.length) {
    box.appendChild(el('div', 'ord-empty',
      total ? 'Không có việc khớp bộ lọc.' : (review ? 'Không có việc nào đang chờ nghiệm thu trong phòng.' : 'Bạn chưa gửi order công việc nào.')));
    return;
  }
  // Lên đầu: sản phẩm chờ nghiệm thu trong phạm vi đang chọn.
  const cho = list.filter((t) => t.daGiaiQuyet && !isClosed(t));
  const conLai = list.filter((t) => !(t.daGiaiQuyet && !isClosed(t)));
  if (cho.length) {
    const sec = el('div', 'ord-sec ord-sec-nt');
    const h = el('div', 'ord-sec-head');
    const pill = el('span', 'pill'); pill.style.background = '#ff8800';
    h.appendChild(pill);
    h.appendChild(el('strong', '', 'Chờ bạn nghiệm thu'));
    h.appendChild(el('span', 'n', String(cho.length)));
    sec.appendChild(h);
    const grid = el('div', 'ord-grid');
    for (const t of sortTasks(cho)) grid.appendChild(orderCard(t));
    sec.appendChild(grid);
    box.appendChild(sec);
  }
  // nhóm phần còn lại theo trạng thái để nhìn nhanh "đang thế nào rồi"
  const order = S.meta.statusOrder || [];
  const rank = (s) => { const i = order.indexOf(s); return i < 0 ? 99 : i; };
  const groups = new Map();
  for (const t of conLai) {
    const k = t.status || 'Chưa đặt trạng thái';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  for (const k of [...groups.keys()].sort((a, b) => rank(a) - rank(b))) {
    const sec = el('div', 'ord-sec');
    const h = el('div', 'ord-sec-head');
    const pill = el('span', 'pill'); pill.style.background = STATUS_HUE[k] || '#8f959e';
    h.appendChild(pill);
    h.appendChild(el('strong', '', k));
    h.appendChild(el('span', 'n', String(groups.get(k).length)));
    sec.appendChild(h);
    const grid = el('div', 'ord-grid');
    for (const t of sortTasks(groups.get(k))) grid.appendChild(orderCard(t));
    sec.appendChild(grid);
    box.appendChild(sec);
  }
}

/* =======================  render root  ======================= */
function render() {
  /* Đang cầm một nhánh trên tay thì chưa vẽ lại: vẽ lại là thay sạch thẻ dưới
   * con trỏ, lượt kéo đứt giữa chừng và cái xấp kẹt lại trên màn hình. Lượt
   * làm mới tự động nào rơi vào đây thì ghi nợ, thả tay xong vẽ bù. */
  if (KEO) { KEO.noVe = true; return; }
  veKhoiTinChuaDoc();
  const isDash = S.view === 'dash';
  const isWork = S.view === 'work';
  const isCal  = S.view === 'cal';
  const isOrder = S.view === 'order';
  $('#dashboard').classList.toggle('hidden', !isDash);
  $('#workspace').classList.toggle('hidden', !isWork);
  $('#calendar').classList.toggle('hidden', !isCal);
  $('#orderArea').classList.toggle('hidden', !isOrder);
  $('#adminArea').classList.toggle('hidden', isDash || isWork || isCal || isOrder);

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

  if (isOrder) {
    renderOrders();
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
    /* Kanban và Bảng gom việc con vào việc lớn (viên "2/5" cạnh tên), khỏi một
     * việc chiếm năm thẻ. Việc của tôi, Order, Lịch vẫn hiện việc con như việc
     * thường, vì đó là chỗ người được giao tìm việc của mình. */
    const coTrongDs = new Set(S.tasks.map((x) => x.id));
    const gon = list.filter((x) => !(idCha(x) && coTrongDs.has(idCha(x))));
    if (isBoard) renderBoard(gon); else renderTable(gon);
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

/** Nạp nháp của chính mình để hiện thành một làn trong "Việc của tôi". */
async function napNhap() {
  try {
    const d = await req('/api/nhap');
    S.nhapDs = (d && d.nhap) || [];
  } catch (_) {
    S.nhapDs = [];      // không đọc được nháp thì thôi, đừng chặn cả màn hình
  }
}

/**
 * Tìm việc cho link ?rec=: trong việc của mình, rồi trong việc mình đã order.
 * Người giao việc liên phòng (thường ở phòng khác) chỉ có việc ở danh sách
 * order. Link từ Base công ty mang mã bản ghi gốc, còn ở đây mỗi người nhận
 * là một bản `<mã gốc>x<đuôi>`, nên khớp cả tiền tố.
 */
function timViecTheoMa(rec) {
  const ds = [...(S.tasks || []), ...(S.orders || [])];
  return ds.find((x) => x.id === rec) || ds.find((x) => String(x.id).startsWith(rec + 'x')) || null;
}

/** Việc mình order và, với quản lý, sản phẩm chờ nghiệm thu trong base. */
async function napOrders(force) {
  try {
    const d = await req('/api/my-orders?lienPhong=1&nghiemThu=1' + (force ? '&refresh=1' : ''));
    S.orders = (d && d.tasks) || [];
    S.ordersError = '';
  } catch (e) {
    S.ordersError = e.message || String(e);
  }
}

async function refresh(force) {
  await Promise.all([loadAll(force), napNhap(), napOrders(force), napChuaDoc()]);

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
  $('#oScope').classList.toggle('hidden', !S.isManager);
  $('#oBot').classList.toggle('hidden', !S.isManager);
  if (!S.isManager) S.orderScope = 'mine';
  $('#oScope').value = S.orderScope;
  const reviewCount = S.orders.filter((t) => !t.lienPhong && t.daGiaiQuyet && !isClosed(t)).length;
  $('#oScope').options[1].textContent = 'Chờ nghiệm thu · toàn phòng (' + reviewCount + ')';
  document.querySelector('[data-view="order"]').textContent = S.isManager
    ? 'Order & nghiệm thu' : 'Việc đã order';

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
  $('#btnPhanPhoi').classList.toggle('hidden', !S.isManager);
  $('#btnReport').classList.toggle('hidden', !S.isManager);
  // Ai cũng đặt việc được nên ai cũng có tab "Việc tôi order"
  const choPhep = S.isManager ? null : (xemHet ? ['work', 'order', 'board', 'table'] : ['work', 'order']);
  if (choPhep && !choPhep.includes(S.view)) S.view = 'work';
  // Ai mở app cũng vào "Việc của tôi" trước, quản lý cũng vậy (anh Hùng, 27/10/2026)
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
    const ds = dsNguoi().filter((p) => khopTen(p.name, q));
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

  if (me && khopTen(me.name, q)) {
    box.appendChild(dong(me, true));
    box.appendChild(el('div', 'as-sep', 'Người được cấp quyền dùng app'));
  }
  const ds = nguon.filter((p) => (!me || p.id !== me.id) && khopTen(p.name, q));
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
    const d = await req('/api/tasks?lienPhong=1' + (epTaiLai ? '&refresh=1' : ''));
    S.tasks = d.tasks;
    S.fetchedAt = d.fetchedAt || Date.now();
    await napChuaDoc();
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
  n.title = 'Dữ liệu lấy từ Lark ' + nhan + ' — bấm để làm mới ngay';
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

  // bộ lọc tab "Việc tôi order"
  const bindO = (sel, key) => { const e = $(sel); if (e) e.onchange = () => { S.of[key] = e.value; render(); }; };
  $('#oBot').onclick = openBotReview;
  $('#botReviewClose').onclick = () => closeModal('mBotReview');
  $('#botReviewSend').onclick = sendBotReview;
  $('#botReviewStop').onclick = async () => {
    try { await req('/api/bot-nghiem-thu', { method: 'POST', body: JSON.stringify({ action: 'stop' }) });
      $('#botReviewStatus').textContent = 'Đã tắt nhắc thử. Không gửi cho người khác.';
    } catch (e) { $('#botReviewStatus').textContent = e.message; }
  };
  $('#oScope').onchange = () => {
    S.orderScope = S.isManager && $('#oScope').value === 'review' ? 'review' : 'mine';
    // Mở hàng chờ phải thấy cả việc nộp từ tháng trước, không giữ bộ lọc cũ.
    S.of = { campaign: '', workType: '', owner: '', status: '', due: '', dueDate: '', hideDone: false };
    S.filters.q = ''; $('#search').value = '';
    syncFilterInputs(); render();
  };
  bindO('#oCampaign', 'campaign');
  bindO('#oWorkType', 'workType');
  bindO('#oStatus', 'status');
  if ($('#oDue')) $('#oDue').onchange = () => {
    S.of.due = $('#oDue').value;
    if (S.of.due !== 'exact') S.of.dueDate = '';
    render();
  };
  if ($('#oHideDone')) $('#oHideDone').onchange = () => { S.of.hideDone = $('#oHideDone').checked; render(); };
  if ($('#oClear')) $('#oClear').onclick = () => {
    S.of = { campaign: '', workType: '', owner: '', status: '', due: S.orderScope === 'review' ? '' : MAC_DINH_DUE, dueDate: '', hideDone: false };
    $('#search').value = ''; S.filters.q = '';
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
      toast('Đã làm mới · ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
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
  $('#btnPhanPhoi').onclick = openPhanPhoi;
  $('#ppLoad').onclick = () => napPhanPhoi(true);

  /* Một chỗ bắt cho cả ba loại ô cấu hình + nút Giao ngay. Dùng `change` chứ
   * không `input`: gõ dở dang mà đã ghi lên Base thì mỗi phím một lần ghi. */
  $('#ppBody').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.ppbat != null) return luuPhanPhoi('/api/phan-phoi/luong',
      { rec: t.dataset.ppbat, bat: t.checked }, 'Không bật/tắt được');
    if (t.dataset.ppphut != null) return luuPhanPhoi('/api/phan-phoi/luong',
      { rec: t.dataset.ppphut, phut: t.value }, 'Không đổi được mốc chờ');
    if (t.dataset.ppcach != null) return luuPhanPhoi('/api/phan-phoi/luong',
      { rec: t.dataset.ppcach, cach: t.value }, 'Không đổi được cách chia');
    if (t.dataset.ppts != null) return luuPhanPhoi('/api/phan-phoi/nguoi',
      { rec: t.dataset.ppts, trongSo: t.value }, 'Không đổi được trọng số');
    if (t.dataset.ppchon != null && t.value) {
      const ten = t.options[t.selectedIndex].textContent.split('  ·')[0];
      return luuPhanPhoi('/api/phan-phoi/nguoi',
        { loai: t.dataset.ppchon, id: t.value, ten, trongSo: 1 },
        'Không thêm được', 'POST');
    }
  });

  $('#ppBody').addEventListener('click', async (e) => {
    /* Bỏ hẳn một người: hỏi lại, vì đây là xoá dòng chứ không phải tạm ngưng, và
     * lấy lại thì phải thêm mới rồi gõ lại trọng số. */
    const x = e.target.closest('[data-ppxoa]');
    if (x) {
      if (!confirm('Bỏ hẳn ' + x.dataset.ten + ' khỏi luồng ' + x.dataset.loai + '?\n\nDùng cho người đã NGHỈ VIỆC. Nếu chỉ nghỉ phép thì đặt trọng số 0 để tạm ngưng.')) return;
      return luuPhanPhoi('/api/phan-phoi/nguoi', { rec: x.dataset.ppxoa },
        'Không bỏ được', 'DELETE');
    }

    const b = e.target.closest('[data-ppgiao]');
    if (!b) return;
    b.disabled = true;
    try {
      const r = await req('/api/phan-phoi/giao',
        { method: 'POST', body: JSON.stringify({ id: b.dataset.ppgiao }) });
      toast('Đã giao cho ' + r.nguoi.ten);
      await napPhanPhoi(true);
      await loadAll(true);
    } catch (err) {
      b.disabled = false;
      toast('Không giao được: ' + err.message, true);
    }
  });
  $('#btnReport').onclick = () => window.open('api/report', '_blank', 'noopener');
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
  $('#bulkOwner').onchange = (e) => {
    const v = e.target.value;
    if (!v) return;
    const ten = e.target.options[e.target.selectedIndex].textContent;
    e.target.value = '';
    bulkPatch({ owner: [v] }, 'Đã phân công cho ' + ten);
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
    const tv = new URLSearchParams(location.search);
    // ?fx=tho|dom|quet|aurora|cham -> chọn hiệu ứng ngày gợi ý (mặc định 'tho')
    document.body.dataset.fx = tv.get('fx') || 'tho';
    moTheoLenh(tv.get('mo'));
    const rec = tv.get('rec');
    if (rec) {
      const t = timViecTheoMa(rec);
      /* ?mo=trao-doi: bấm "Mở trao đổi" trên thẻ Lark -> mở thẳng tab chat. */
      if (t && tv.get('mo') === 'trao-doi') DT_TAB = 'chat';
      if (t) openDrawer(t);
    }
    /* ?mo=phan-phoi -> mở thẳng màn phân phối. Cài đặt của lớp vỏ gọi đường
     * này: thiết lập TÌM ở Cài đặt, còn giao diện vẫn ở đây, không dựng lại
     * hai bản. Chỉ quản lý mở được — nhân sự bấm vào cũng chỉ nhận 403. */
    if (tv.get('mo') === 'phan-phoi' && S.isManager) openPhanPhoi();
    if (CHO_TAO_TU_TIN) moTaoTuTin(CHO_TAO_TU_TIN);

    /* ?tab=dash|work|order|board|table -> mở thẳng một tab (link demo theo vai). */
    const tab = tv.get('tab');
    if (tab && document.querySelector('.tab[data-view="' + tab + '"]')) {
      S.view = tab;
      S.viewChosen = true;
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x.dataset.view === tab));
      render();
    }
    /* ?nhu=<tên> -> quản lý xem NHƯ nhân sự đó (trải nghiệm vai Người triển khai). */
    const nhu = tv.get('nhu');
    if (nhu && S.isManager) {
      const low = nhu.toLowerCase();
      const ng = (S.meta.people || []).find((p) => (p.name || '').toLowerCase() === low)
        || (S.meta.people || []).find((p) => (p.name || '').toLowerCase().includes(low));
      if (ng) {
        S.viewAs = ng; S.who = ng; S.view = 'work'; S.viewChosen = true; S.wf.lane = '';
        applyRoleChrome();
        document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x.dataset.view === 'work'));
        render();
      }
    }
  } catch (e) {
    toast('Không tải được dữ liệu: ' + (e && e.message), true);
  }
  $('#loader').classList.add('hidden');
})();

/* ============================================================
   Tạo việc từ "Tin của phòng" (21/10/2026)
   Anh Hùng: tin của phòng hay dẫn tới việc (đăng bài, làm theo quy định), nên
   bấm "Tạo việc" ở bảng tin là ra form đã điền sẵn, khỏi gõ lại.
   Lớp vỏ gửi sang tiêu đề, nội dung và nguyên tệp của tin (nó tự tải, vì ở
   đây đường /api/ của lớp vỏ không tới được). Lớp vỏ nhắc lại tới khi nhận
   được "tao-tu-tin-ok"; mã lượt giúp không mở form hai lần.
   Chỉ điền form. Việc chỉ lên Base khi người ta tự bấm "Tạo công việc".
   ============================================================ */
let CHO_TAO_TU_TIN = null;
let MA_TAO_TU_TIN = '';
function moTaoTuTin(goi) {
  CHO_TAO_TU_TIN = null;
  if (!goi || !goi.title) return;
  if (!S.perm || !S.perm.taoMoi) { toast('Tài khoản này chưa được tạo việc.', true); return; }

  const nhap = { title: goi.title, detail: goi.detail || '' };
  if (goi.link) nhap.link = goi.link;
  openDrawer(null, nhap);
  const tep = (goi.tep || []).filter((f) => f && f.size <= TEP_TOI_DA);
  if (tep.length) { S.tepMoi = tep; buildDrawer(); }
  if ((goi.soTep || 0) > tep.length) {
    toast('Có ' + (goi.soTep - tep.length) + ' tệp của tin chưa lấy về được. Đính thêm tay ở ô Tệp đính kèm.', true);
  }
}

/** Đi thẳng tới một màn theo lệnh ?mo= (lúc khởi động) hoặc lệnh của lớp vỏ. */
function moTheoLenh(mo) {
  if (!mo) return;
  if (S.editing) closeDrawer();
  if (mo === 'nghiem-thu') {
    S.view = 'order'; S.viewChosen = true;
    if (S.isManager) S.orderScope = 'review';
    S.of.due = ''; S.of.status = ''; S.of.owner = ''; S.of.campaign = ''; S.of.workType = '';
    S.filters.q = ''; $('#search').value = '';
    applyRoleChrome(); syncFilterInputs();
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('is-active', x.dataset.view === 'order'));
    render();
  }
  if (mo === 'can-xu-ly' && S.isManager) {
    S.view = 'dash'; S.viewChosen = true;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('is-active', x.dataset.view === 'dash'));
    render();
  }
  if (mo === 'bot-nhac' && S.isManager) openBotReview();
  if (mo === 'tin-chua-doc') moTinChuaDoc();
}

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
    const t = timViecTheoMa(d.rec);
    /* Lời nhắc "tin nhắn chưa đọc" mở thẳng tab Trao đổi (d.mo = 'trao-doi'). */
    if (t && d.mo === 'trao-doi') DT_TAB = 'chat';
    if (t) { openDrawer(t); bao('opened'); return; }
    // App vừa mở còn đang nạp Base -> im lặng, hub sẽ gửi lại sau 1s.
    // Chỉ khi đã có dữ liệu mà vẫn không thấy thì mới báo là ngoài phạm vi.
    if ((S.tasks || []).length) bao('khong-thay');
  }

  if (d.hub === 'tao-tu-tin' && d.ma) {
    try { parent.postMessage({ hub: 'tao-tu-tin-ok', ma: d.ma }, location.origin); } catch (_) {}
    if (d.ma === MA_TAO_TU_TIN) return;     // lượt nhắc lại của lần đã nhận
    MA_TAO_TU_TIN = d.ma;
    if (S.meta) moTaoTuTin(d);
    else CHO_TAO_TU_TIN = d;                // còn đang nạp Base: boot() mở sau
  }

  /* Lời nhắc của lớp vỏ ("Kiểm tra ngay") khi app đã mở sẵn: lớp vỏ không nạp
   * lại khung nên ?mo= không được đọc lại, phải nhắn sang. */
  if (d.hub === 'mo' && d.v && S.meta) moTheoLenh(d.v);

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

/* ==========================================================================
   TRUNG TÂM PHÂN PHỐI CÔNG VIỆC
   ==========================================================================
   Ba khối, theo đúng thứ tự anh Hùng cần nhìn:
     1. Đang chờ phân công  — việc chưa có chủ, kèm đề xuất + LÝ DO + nút giao
     2. Luồng & tỷ lệ       — bật/tắt tự động, mốc chờ, cách chia, trọng số
     3. Sổ đã giao          — hệ thống đã làm gì, để soi trong lúc chưa tin nó

   Vì sao lý do luôn hiện ra: giao việc cho người khác mà không nói được vì sao
   thì không ai dám bật tự động. Câu giải thích do chính bộ luật sinh ra, không
   phải chữ trang trí.
   ========================================================================== */
/* App này dựng DOM bằng textContent là chính nên chưa có hàm thoát HTML dùng
 * chung. Đặt riêng ở đây, tên khác hẳn để không đụng ai. */
const escPP = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function openPhanPhoi() {
  $('#ppBody').innerHTML = window.KX ? KX.dong(5)
    : '<div class="muted" style="padding:20px 0">Đang tải…</div>';
  openModal('mPhanPhoi');
  await napPhanPhoi();
}

async function napPhanPhoi(refresh) {
  try {
    const d = await req('/api/phan-phoi' + (refresh ? '?refresh=1' : ''));
    S.pp = d;
    vePhanPhoi();
    $('#ppMsg').textContent = '';
    if (d.larkUrl) $('#ppBase').href = d.larkUrl;
  } catch (e) {
    $('#ppBody').innerHTML = '<div class="callout warn">Lỗi: ' + escPP(e.message) + '</div>';
  }
}

function vePhanPhoi() {
  const d = S.pp;
  const soBat = (d.luong || []).filter((x) => x.bat).length;
  let h = '';

  /* Nói ngay tình trạng: đang tự động hay chưa. Người dùng mở màn hình này ra là
   * muốn biết "nó có đang tự làm gì sau lưng tôi không". */
  h += '<div class="callout' + (soBat ? '' : ' pp-tat') + '">' +
    (soBat
      ? '<b>Đang tự phân công</b> cho ' + soBat + '/' + d.luong.length + ' loại. ' +
        'Việc chưa có chủ sẽ tự giao khi hết mốc chờ.'
      : '<b>Tự động đang TẮT hết.</b> Màn hình vẫn đề xuất người nhận để anh bấm giao — ' +
        'xem vài hôm thấy đúng ý thì bật từng loại ở dưới.') +
    '</div>';

  if (!d.docDuoc) {
    h += '<div class="callout warn">Không đọc được bảng cấu hình trên Base — ' +
      'hệ thống tạm KHÔNG phân phối gì cả.</div>';
  }
  if ((d.thieuLuong || []).length) {
    h += '<div class="callout warn">Có việc thuộc loại <b>' +
      d.thieuLuong.map(escPP).join(', ') + '</b> nhưng loại đó chưa khai trong bảng phân phối, ' +
      'nên hệ thống không đề xuất được. Thêm dòng trên Base nếu muốn.</div>';
  }

  /* ---------------- 1. Đang chờ ---------------- */
  h += '<h4 class="pp-h">Đang chờ phân công <span class="pp-dem">' +
    (d.dangCho || []).length + '</span></h4>';
  if (!(d.dangCho || []).length) {
    h += '<div class="pp-rong">Không có việc nào đang ở <b>' +
      (d.trangThaiCanPhanPhoi || ['Chờ tiếp nhận']).map(escPP).join(' / ') +
      '</b> mà chưa có người phụ trách. Việc mới đặt sẽ hiện ở đây kèm đề xuất.</div>';
  } else {
    for (const x of d.dangCho) {
      h += '<div class="pp-cho">' +
        '<div class="pp-cho-tren">' +
          '<span class="pp-ten">' + escPP(x.tieuDe) + '</span>' +
          (x.loai ? '<span class="tag">' + escPP(x.loai) + '</span>' : '<span class="tag warn">chưa có loại</span>') +
          (x.uuTien ? '<span class="tag">' + escPP(x.uuTien) + '</span>' : '') +
        '</div>' +
        (x.nguoiOrder ? '<div class="pp-phu">Người order: ' + escPP(x.nguoiOrder) + '</div>' : '') +
        (x.deXuat
          ? '<div class="pp-dx"><b>Đề xuất: ' + escPP(x.deXuat.ten) + '</b>' +
            '<div class="pp-vi">' + escPP(x.vi) + '</div></div>'
          : '<div class="pp-dx pp-khong">Không đề xuất được — ' + escPP(x.khong) + '</div>') +
        '<div class="pp-cho-duoi">' +
          (x.tuDong
            ? '<span class="pp-dh">Tự giao sau ' + x.conLaiPhut + ' phút</span>'
            : '<span class="pp-dh mo">Tự động đang tắt cho loại này</span>') +
          (x.deXuat
            ? '<button class="btn btn-primary btn-sm" data-ppgiao="' + escPP(x.id) + '">Giao ngay</button>'
            : '') +
        '</div></div>';
    }
  }

  /* ---------------- 2. Luồng & tỷ lệ ---------------- */
  h += '<h4 class="pp-h">Luồng &amp; tỷ lệ</h4>';
  h += '<div class="pp-luong">';
  for (const b of d.bangTai || []) {
    const l = (d.luong || []).find((x) => x.loai === b.loai) || {};
    h += '<div class="pp-l">' +
      '<div class="pp-l-tren">' +
        '<label class="pp-sw"><input type="checkbox" data-ppbat="' + escPP(l.rec || '') + '"' +
          (b.bat ? ' checked' : '') + '><span>' + escPP(b.loai) + '</span></label>' +
        '<span class="grow"></span>' +
        '<label class="pp-nho">Chờ <input type="number" class="pp-so" min="0" max="1440" ' +
          'value="' + Number(l.phut || 5) + '" data-ppphut="' + escPP(l.rec || '') + '"> phút</label>' +
        '<select class="pp-sel" data-ppcach="' + escPP(l.rec || '') + '">' +
          Object.entries(d.cach || {}).map(([ma, nhan]) =>
            '<option value="' + escPP(ma) + '"' + (b.cach === ma ? ' selected' : '') + '>' +
            escPP(nhan) + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<table class="pp-tb"><thead><tr><th>Người nhận</th><th>Tỷ lệ</th>' +
        '<th>Đang giữ</th><th>Thực tế</th><th></th></tr></thead><tbody>';
    for (const n of b.nguoi) {
      const rec = (d.nguoi || []).find((x) => x.loai === b.loai && x.id === n.id) || {};
      /* Lệch nhiều thì tô — đây là chỗ anh Hùng nhìn ra "ai đang gánh, ai đang rảnh"
       * mà không cần mở báo cáo. */
      const lech = n.thucTe - n.tyLe;
      const mau = !b.tongMo ? '' : lech >= 20 ? ' pp-nhieu' : lech <= -20 ? ' pp-it' : '';
      h += '<tr class="' + (n.trongSo ? '' : 'pp-ngung') + '">' +
        '<td>' + escPP(n.ten) + (n.trongSo ? '' : ' <span class="tag">tạm ngưng</span>') + '</td>' +
        '<td><input type="number" class="pp-so" min="0" max="1000" value="' + n.trongSo +
          '" data-ppts="' + escPP(rec.rec || '') + '"></td>' +
        '<td class="num">' + n.dangMo + '</td>' +
        '<td class="num' + mau + '">' + (b.tongMo ? n.thucTe + '%' : '—') + '</td>' +
        '<td class="num"><button class="pp-x" title="Bỏ khỏi luồng này" ' +
          'data-ppxoa="' + escPP(rec.rec || '') + '" data-ten="' + escPP(n.ten) +
          '" data-loai="' + escPP(b.loai) + '">✕</button></td>' +
        '</tr>';
    }
    /* Ô thêm người ngay dưới từng luồng: người đã nghỉ thì bỏ bằng nút ✕, người
     * mới vào thì thêm ở đây — không phải mở Base. Danh sách xếp người đang giữ
     * nhiều việc lên trước, vì đó gần như chắc chắn là người còn đang làm. */
    const daCo = new Set(b.nguoi.map((x) => x.id));
    const conLai = (d.nhanSu || []).filter((x) => !daCo.has(x.id));
    h += '</tbody></table>' +
      '<div class="pp-them">' +
        '<select class="pp-sel" data-ppchon="' + escPP(b.loai) + '">' +
          '<option value="">+ Thêm người vào ' + escPP(b.loai) + '…</option>' +
          conLai.map((x) => '<option value="' + escPP(x.id) + '">' + escPP(x.ten) +
            (x.dangMo ? '  · đang giữ ' + x.dangMo + ' việc'
                      : x.soViec ? '  · đã làm ' + x.soViec + ' việc'
                                 : '  · chưa từng nhận việc') +
            '</option>').join('') +
        '</select>' +
      '</div></div>';
  }
  h += '</div>';
  h += '<div class="pp-ghi">Trọng số <b>0</b> = <b>tạm ngưng</b> (nghỉ phép) — còn trong ' +
    'bảng, việc dạt sang người khác, mở lại là tự cân về. Nút <b>✕</b> = <b>bỏ hẳn</b> ' +
    'khỏi luồng, dùng khi người đó nghỉ việc.</div>';

  /* ---------------- 3. Sổ ---------------- */
  if ((d.so || []).length) {
    h += '<h4 class="pp-h">Đã giao gần đây</h4><div class="pp-so">';
    for (const m of d.so.slice(0, 20)) {
      h += '<div class="pp-so-d"><span class="pp-so-g">' + gioNgan(m.luc) + '</span>' +
        (m.tuDong ? '<span class="tag">tự động</span>' : '<span class="tag">bấm tay</span>') +
        '<b>' + escPP(m.nguoi) + '</b><span class="pp-vi">' + escPP(m.vi || '') + '</span></div>';
    }
    h += '</div>';
  }

  $('#ppBody').innerHTML = h;
}

const gioNgan = (t) => {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes());
};

/** Lưu một ô cấu hình rồi nạp lại — số liệu đổi theo ngay, khỏi đoán. */
async function luuPhanPhoi(duong, body, loi, method) {
  $('#ppMsg').textContent = 'Đang lưu…';
  try {
    await req(duong, { method: method || 'PATCH', body: JSON.stringify(body) });
    await napPhanPhoi(true);
    toast('Đã lưu vào Base');
  } catch (e) {
    $('#ppMsg').textContent = '';
    toast(loi + ': ' + e.message, true);
  }
}


let botDemoRequestId = '';
async function openBotReview() {
  openModal('mBotReview');
  $('#botReviewSend').disabled = true;
  $('#botReviewStatus').textContent = 'Đang lấy dữ liệu mới và mẫu thẻ…';
  $('#botReviewPreview').replaceChildren();
  botDemoRequestId = '';
  try {
    const d = await req('/api/bot-nghiem-thu');
    $('#botReviewStatus').textContent = d.settings.mode === 'off' ? 'Đang tắt nhắc thử.'
      : d.settings.pilot ? 'Chế độ thử · chỉ gửi cho ' + d.settings.pilot.name + ' · 08:00 và 17:00.'
      : 'Chưa bật gửi. Mẫu nghiệm thu dùng việc do bạn order; mẫu cảnh báo dùng việc toàn phòng.';
    for (const card of d.cards) {
      const box = el('div', 'bot-review-card');
      box.appendChild(el('h4', '', card.header.title.content));
      for (const part of card.elements) {
        if (part.text) box.appendChild(el('p', '', part.text.content.replace(/\*\*/g, '').replace(/\\([*_~`[\]<>])/g, '$1')));
        if (part.actions) for (const action of part.actions) {
          const a = el('a', 'btn', action.text.content); a.href = action.url; a.target = '_blank'; a.rel = 'noopener'; box.appendChild(a);
        }
      }
      $('#botReviewPreview').appendChild(box);
    }
    $('#botReviewSend').disabled = false;
  } catch (e) { $('#botReviewStatus').textContent = 'Không nạp được mẫu: ' + e.message; }
}
async function sendBotReview() {
  const b = $('#botReviewSend'); b.disabled = true;
  if (!botDemoRequestId) botDemoRequestId = crypto.randomUUID();
  $('#botReviewStatus').textContent = 'Đang gửi 2 mẫu qua Bot Marketing Hub…';
  try {
    const d = await req('/api/bot-nghiem-thu', { method: 'POST', body: JSON.stringify({ action: 'demo', requestId: botDemoRequestId }) });
    $('#botReviewStatus').textContent = 'Lark đã xác nhận 2 mẫu gửi riêng cho ' + d.recipient + '. Nhắc thử 08:00 và 17:00; chưa gửi người khác.';
  } catch (e) { $('#botReviewStatus').textContent = e.message + ' Bấm gửi lại để tiếp tục, mẫu đã gửi sẽ không gửi trùng.'; }
  b.disabled = false;
}
