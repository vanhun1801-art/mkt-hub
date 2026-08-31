'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
// cli: dùng phiên lark-cli của máy · api: gọi thẳng Open API bằng app credentials
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');
const { AsyncLocalStorage } = require('async_hooks');

const F = cfg.fields;
const BY_KEY = Object.entries(F);

/* ---------------- cache ---------------- */
let cache = { at: 0, records: null, fields: null, fieldsAt: 0, me: undefined };
let inflight = null;

/* Danh sách trường (và các lựa chọn trong đó, VD danh mục FOC) đọc thẳng từ
 * Base, nên thêm/sửa/xoá lựa chọn bên Base là app tự theo — không phải khai lại
 * ở đây. Giữ cache ngắn để thay đổi hiện ra trong khoảng một phút rưỡi mà không
 * cần bấm gì; bấm nút tải lại thì thấy ngay. */
async function getFields(force = false) {
  if (!force && cache.fields && Date.now() - cache.fieldsAt < 90000) return cache.fields;
  cache.fields = await lark.listFields();
  cache.fieldsAt = Date.now();
  return cache.fields;
}

async function getRecords(force = false) {
  if (!force && cache.records && Date.now() - cache.at < cfg.cacheTtlMs) return cache.records;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      cache.records = await lark.listAllRecords();
      cache.at = Date.now();
      return cache.records;
    } finally { inflight = null; }
  })();
  return inflight;
}

/* ---------------- Base -> UI ---------------- */
const first = (v) => (Array.isArray(v) ? v[0] : v);

const asText = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : (x && (x.text || x.name || x.link)) || '')).join('');
  if (typeof v === 'object') return v.text || v.name || v.link || '';
  return String(v);
};

const asUsers = (v) =>
  Array.isArray(v) ? v.filter(Boolean).map((u) => ({ id: u.id, name: u.name || u.en_name || u.id })) : [];

const asMulti = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : v ? [String(v)] : []);

const asAttach = (v) =>
  Array.isArray(v) ? v.map((a) => ({ name: a.name, size: a.size, type: a.type, token: a.file_token || null })) : [];

/** Base trả ô URL dạng markdown "[url](url)" - lấy lại URL thuần. */
function stripMdLink(s) {
  const m = /^\s*\[([^\]]*)\]\(([^)]*)\)\s*$/.exec(String(s || '').trim());
  return m ? (m[2] || m[1]) : String(s || '');
}

function toItem(rec) {
  const c = rec.cells;
  const t = { id: rec.record_id };
  for (const [key, f] of BY_KEY) {
    const v = c[f.id];
    switch (f.type) {
      case 'select':      t[key] = asText(first(v)) || null; break;
      case 'multiSelect': t[key] = asMulti(v); break;
      case 'user':        t[key] = asUsers(v); break;
      case 'datetime':    t[key] = v || null; break;
      case 'number':      t[key] = (v === 0 || v) ? Number(v) : null; break;
      case 'checkbox':    t[key] = v === true; break;
      case 'attachment':  t[key] = asAttach(v); break;
      case 'formula':     t[key] = typeof v === 'number' ? v : asText(v); break;
      default:            t[key] = asText(v); break;
    }
  }
  t.link = stripMdLink(t.link);
  return t;
}

/* ---------------- UI -> CellValue ---------------- */
const pad = (n) => String(n).padStart(2, '0');

function toCells(patch) {
  const out = {};
  for (const key of Object.keys(patch)) {
    const val = patch[key];
    const f = F[key];
    if (!f || f.readOnly || f.type === 'formula') continue;
    switch (f.type) {
      case 'select':
        out[f.name] = val ? String(val) : null; break;
      case 'multiSelect':
        out[f.name] = Array.isArray(val) ? val : val ? [String(val)] : []; break;
      case 'user':
        out[f.name] = (Array.isArray(val) ? val : val ? [val] : [])
          .map((u) => ({ id: typeof u === 'string' ? u : u.id })).filter((u) => u.id);
        break;
      case 'number':
        out[f.name] = (val === '' || val == null) ? null : Number(val); break;
      case 'checkbox':
        out[f.name] = !!val; break;
      case 'datetime': {
        if (!val) { out[f.name] = null; break; }
        const d = new Date(val);
        if (isNaN(d.getTime())) { out[f.name] = null; break; }
        /* Base ghi giờ Việt Nam. Máy chủ trên Render chạy giờ UTC nên getHours()
         * của máy sẽ lệch 7 tiếng — quy đổi thẳng sang UTC+7 để chạy ở đâu cũng
         * ra một kết quả. Điều kiện: trình duyệt phải gửi mốc có kèm múi giờ. */
        const vn = new Date(d.getTime() + 7 * 3600000);
        out[f.name] = vn.getUTCFullYear() + '-' + pad(vn.getUTCMonth() + 1) + '-' + pad(vn.getUTCDate()) +
          ' ' + pad(vn.getUTCHours()) + ':' + pad(vn.getUTCMinutes()) + ':00';
        break;
      }
      default:
        out[f.name] = val == null ? null : String(val); break;
    }
  }
  return out;
}

/* Lịch đã duyệt thì nội dung KẾ HOẠCH khoá lại. Nhưng "thời gian kết thúc" và
 * "thời lượng" không phải kế hoạch — đó là kết quả thật của chuyến đi, nhân sự
 * điền đúng lúc lịch đang ở trạng thái đã duyệt, nên hai ô này phải mở. */
const TRUONG_KE_HOACH = ['title', 'purpose', 'plan', 'start', 'transport', 'costPlan', 'foc'];
/* Gửi duyệt rồi là khoá luôn, không đợi tới lúc được duyệt: quản lý đang đọc
 * dở mà nhân sự sửa lén dưới tay thì họ duyệt một đằng, người đi một nẻo. Muốn
 * sửa thì xin trả về "Từ chối/Cần điều chỉnh" — trạng thái đó mở lại quyền. */
const TRANG_THAI_KHOA = ['Chờ duyệt/Xử lý', 'Duyệt/Chờ tác nghiệp', 'Đang báo cáo',
  'Đã hoàn tất', 'Hủy lịch', 'Từ chối'];

/* Lịch đã huỷ thì với nhân sự coi như không còn: cắt ngay ở server để nó biến
 * mất khỏi mọi tab, mọi con số, chứ không phải chỉ ẩn trên giao diện. Quản lý
 * vẫn thấy đủ để đối chiếu cuối tháng. */
function anLichHuy(items, manager) {
  return manager ? items : items.filter((t) => t.status !== 'Hủy lịch');
}

function khoaKeHoach(status, keys) {
  return TRANG_THAI_KHOA.includes(status) && keys.some((k) => TRUONG_KE_HOACH.includes(k));
}

/* Chuyển sang "Đang báo cáo" thì phải có gì đó chứng minh đã đi: báo cáo sau
 * tác nghiệp, hoặc liên kết sản phẩm. 'report' là ghi chú TRƯỚC chuyến nên
 * không tính — trước đây tính, thành ra nộp khống cũng lọt. */
function duMinhChung(item, body) {
  const lay = (k) => String((body[k] != null ? body[k] : item[k]) || '').trim();
  return !!(lay('reportAfter') || lay('link'));
}

/** Ghi giá trị mới vào cache cục bộ, giữ đúng dạng của record-list. */
function applyLocal(rec, patch) {
  for (const key of Object.keys(patch)) {
    const val = patch[key];
    const f = F[key];
    if (!f || f.readOnly || f.type === 'formula') continue;
    switch (f.type) {
      case 'select':      rec.cells[f.id] = val ? [String(val)] : null; break;
      case 'multiSelect': rec.cells[f.id] = Array.isArray(val) ? val : []; break;
      case 'user':
        rec.cells[f.id] = (Array.isArray(val) ? val : [])
          .map((u) => (typeof u === 'string' ? { id: u, name: u } : u));
        break;
      case 'number':      rec.cells[f.id] = (val === '' || val == null) ? null : Number(val); break;
      case 'checkbox':    rec.cells[f.id] = !!val; break;
      case 'datetime':    rec.cells[f.id] = val || null; break;
      default:            rec.cells[f.id] = val == null ? null : String(val); break;
    }
  }
}

/* ---------------- phân quyền ---------------- */
/* Chế độ api không có "người đang đăng nhập" ở tầng server, nên lớp vỏ đăng nhập
 * Lark rồi truyền danh tính xuống qua header. Dùng AsyncLocalStorage để mọi hàm
 * whoAmI()/isManager() cũ không phải đổi chữ ký. */
const nguoiCuaRequest = new AsyncLocalStorage();

/** Đọc danh tính lớp vỏ gửi kèm (chỉ tin khi server chỉ nghe trên 127.0.0.1). */
function nguoiTuHeader(req) {
  const id = req.headers['x-hub-user-id'];
  if (!id) return null;
  // hub đã quyết vai quản lý (theo open_id hoặc email), gửi kèm ở header này
  const quanLy = req.headers['x-hub-user-manager'] === '1';
  const ten = req.headers['x-hub-user-name'];
  let deco = id;
  try { deco = ten ? decodeURIComponent(ten) : id; } catch (_) { deco = ten || id; }
  return { id: String(id), name: String(deco), quanLy };
}

async function whoAmI() {
  if (cfg.mode === 'api') {
    const store = nguoiCuaRequest.getStore();
    return store ? store.me : null;
  }
  if (cache.me === undefined) cache.me = await lark.whoami();
  return cache.me;
}

async function isManager() {
  const me = await whoAmI();
  if (me && me.quanLy) return true;          // kết luận của lớp vỏ
  return !!(me && cfg.loadManagerIds().includes(me.id));
}

/* Tùy chọn lớp vỏ cấp riêng cho từng nhân sự (bảng "Phân quyền app"). Chỉ tin
 * header vì app chỉ nghe 127.0.0.1; tắt bằng HUB_TRUST_HEADER=0. */
function quyenTuHeader(req) {
  if (process.env.HUB_TRUST_HEADER === '0') return {};
  return {
    // Chạy đứng một mình (không qua lớp vỏ) thì KHÔNG áp phân quyền của hub —
    // nếu không, app dùng trực tiếp sẽ tự nhiên mất quyền xem chi phí.
    tuHub: !!req.headers['x-hub-user-id'],
    toanBo: req.headers['x-hub-perm-toan-bo'] === '1',
    khongTao: req.headers['x-hub-perm-khong-tao'] === '1',
    chiPhi: req.headers['x-hub-perm-chi-phi'] === '1',
  };
}

/** Quyền của request hiện tại (rỗng khi chạy chế độ cli trên máy cá nhân). */
function quyenHienTai() {
  const store = nguoiCuaRequest.getStore();
  return (store && store.quyen) || {};
}
const qToanBo = () => quyenHienTai().toanBo === true;
const qDuocTao = () => quyenHienTai().khongTao !== true;
/* Chi phí mặc định MỞ khi không đi qua lớp vỏ; đi qua lớp vỏ thì theo bảng phân quyền. */
const qChiPhi = () => { const q = quyenHienTai(); return q.tuHub ? q.chiPhi === true : true; };

/** Lịch thuộc phạm vi một người: phụ trách hoặc trong nhóm nhân sự. */
function ownedBy(it, personId) {
  const has = (arr) => (arr || []).some((u) => u.id === personId);
  return has(it.owner) || has(it.staff);
}

async function requireManager(res) {
  if (await isManager()) return true;
  json(res, { error: 'Chỉ quản lý được thực hiện thao tác này.', code: 'MANAGER_ONLY' }, 403);
  return false;
}

/**
 * Người phụ trách của một lịch.
 *
 * Khác với ownedBy(): ownedBy đúng cho câu hỏi "lịch này có phải việc của tôi
 * không" (được xem, được nhận thông báo), còn hàm này trả lời "tôi có phải người
 * chịu trách nhiệm không" — chỉ người đó mới ghi được vào lịch. Nhân sự cùng đi
 * thì đi cùng, còn báo cáo do phụ trách tổng hợp một lần.
 */
function laPhuTrach(it, personId) {
  return (it.owner || []).some((u) => u.id === personId);
}

async function requireOwn(res, it) {
  if (await isManager()) return true;
  const me = await whoAmI();
  if (me && ownedBy(it, me.id)) return true;
  json(res, { error: 'Đây không phải lịch tác nghiệp của bạn.', code: 'NOT_YOURS' }, 403);
  return false;
}

/** Hai cột tiền — ai không được xem chi phí thì cũng không đọc, không ghi được. */
const COT_TIEN = ['costPlan', 'costActual'];

/**
 * Bỏ cột tiền trước khi trả cho người không được xem chi phí.
 *
 * Trừ MỘT chỗ: chi phí thực tế của chuyến chính họ phụ trách thì vẫn giữ.
 * Quyền "xem chi phí" là để xem tiền của cả phòng; còn tiền chuyến của mình thì
 * chính họ tiêu, chính họ khai trong báo cáo — cắt đi thì báo cáo không bao giờ
 * đủ, mà cũng chẳng giấu được ai điều gì.
 */
function boChiPhi(it, meId) {
  const o = Object.assign({}, it);
  delete o.costPlan;
  if (!(meId && laPhuTrach(it, meId))) delete o.costActual;
  return o;
}

function collectOptions(fields) {
  const opts = {};
  for (const [key, f] of BY_KEY) {
    const raw = fields.find((x) => x.id === f.id);
    if (raw && raw.options) opts[key] = raw.options.map((o) => o.name).filter((v, i, a) => a.indexOf(v) === i);
  }
  return opts;
}

/**
 * Đọc một bản ghi cho các quyết định phân quyền.
 *
 * Không dùng cache: cache có TTL 20s, mà trạng thái quyết định quyền (đã duyệt
 * hay chưa, ai phụ trách) có thể vừa bị đổi ở nơi khác — trong Lark, ở máy
 * người khác, hoặc ở tab khác. Dựa vào bản cũ là mở cửa sổ cho nhân sự sửa kế
 * hoạch sau khi quản lý đã duyệt. Đổi lại là một lần gọi CLI cho mỗi lần ghi.
 */
async function findRecord(id) {
  try {
    const fresh = await lark.getRecord(id);
    if (fresh) return fresh;
  } catch (e) {
    // Base trục trặc thì lùi về cache, còn hơn chặn hết thao tác
    console.error('[record-get]', e.message);
    const recs = await getRecords();
    return recs.find((r) => r.record_id === id) || null;
  }
  return null;
}

/**
 * Base có nhiều dòng trống dùng để chừa chỗ. Bỏ qua chúng để không làm
 * sai lệch số đếm và biểu đồ; dòng chỉ cần có một dấu hiệu nội dung là giữ.
 */
function isBlank(t) {
  return !String(t.title || '').trim() &&
    !String(t.purpose || '').trim() &&
    !String(t.plan || '').trim() &&
    !t.start && !t.status &&
    !(t.owner || []).length && !(t.staff || []).length;
}

function collectPeople(items) {
  const m = new Map();
  for (const t of items) {
    for (const key of ['owner', 'staff']) {
      for (const u of t[key] || []) if (u && u.id && !m.has(u.id)) m.set(u.id, u);
    }
  }
  return [...m.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
}

/* ---- phụ trợ cho thông báo ---- */
const SETTLED_TB = ['Từ chối', 'Hủy lịch', 'Đã hoàn tất'];
const BAC_TB = { gap: 0, can: 1, tin: 2 };
const LECH_VN_TB = 7 * 3600000;

/** Đầu ngày theo giờ Việt Nam — máy chủ Render chạy giờ UTC nên không mượn getDate(). */
function ngayVN(d) {
  return new Date(Math.floor((d.getTime() + LECH_VN_TB) / 86400000) * 86400000 - LECH_VN_TB);
}
function nhan(d) {
  const x = new Date(d.getTime() + LECH_VN_TB);
  return x.toISOString().slice(0, 10);
}
function gioVN(d) {
  const x = new Date(d.getTime() + LECH_VN_TB);
  const p = (n2) => String(n2).padStart(2, '0');
  return p(x.getUTCDate()) + '/' + p(x.getUTCMonth() + 1) + ' ' + p(x.getUTCHours()) + ':' + p(x.getUTCMinutes());
}
/* Trạng thái "Đang báo cáo" chỉ nói người ta đã bấm nút, không nói đã điền
 * xong. Báo cáo còn dở thì đừng bảo quản lý là sẵn sàng nghiệm thu, mà phải
 * giục lại đúng người phụ trách. */
function duBaoCao(t) {
  return !!(t.end && String(t.reportAfter || '').trim() && t.costActual != null);
}

function nguoiCua(t) {
  const ds = [...(t.owner || []), ...(t.staff || [])].map((u) => u.name).filter(Boolean);
  return [...new Set(ds)].slice(0, 2).join(', ') || 'chưa gán người';
}

/* ---------------- API ---------------- */
async function api(req, res, url) {
  const p = url.pathname;

  /* Quản lý đang xem thử giao diện của nhân sự thì chỉ được đọc. Client gắn
   * `as=` vào mọi request khi ở chế độ đó, nên chặn ngay tại đây — không để
   * việc khoá nút trên giao diện là hàng rào duy nhất. */
  if (req.method !== 'GET' && url.searchParams.get('as')) {
    return json(res, {
      error: 'Đang xem giao diện của người khác — hãy quay lại vai quản lý trước khi thao tác.',
      code: 'PREVIEW_READONLY',
    }, 403);
  }

  if (p === '/api/meta' && req.method === 'GET') {
    const force = url.searchParams.get('refresh') === '1';
    const fields = await getFields(force);
    const records = await getRecords(force);
    const raw = records.map(toItem);
    const all = raw.filter((t) => !isBlank(t));
    const me = await whoAmI();
    const manager = await isManager();

    /* Quản lý xem thử giao diện của một nhân sự: lọc thật ở server để bản xem
     * trước trung thực, và trả về `acting` để UI khoá thao tác. */
    const asId = url.searchParams.get('as');
    let acting = null;
    if (manager && asId && (!me || asId !== me.id)) {
      const p = collectPeople(all).find((x) => x.id === asId);
      if (p) acting = p;
    }

    const scoped0 = acting ? all.filter((t) => ownedBy(t, acting.id))
      : manager ? all
      // nhân sự được cấp "Xem toàn bộ" thì thấy lịch cả phòng (chỉ để xem)
      : (me ? (qToanBo() ? all : all.filter((t) => ownedBy(t, me.id))) : []);

    const scoped = anLichHuy(scoped0, manager);

    return json(res, {
      me, manager, acting,
      // quản lý cấp riêng trong bảng "Phân quyền app" của lớp vỏ
      perm: { toanBo: manager || qToanBo(), taoMoi: manager || qDuocTao(), chiPhi: manager || qChiPhi() },
      // không được xem chi phí thì cắt luôn ở server, không chỉ ẩn trên giao diện
      items: (manager || qChiPhi()) ? scoped : scoped.map((t) => boChiPhi(t, me && me.id)),
      blankRows: raw.length - all.length,
      /* Nhân sự thường chỉ thấy người có mặt trong lịch của chính họ; muốn thấy
       * cả phòng thì quản lý phải cấp "Xem toàn bộ". */
      people: (manager || qToanBo()) ? collectPeople(all) : collectPeople(scoped),
      options: collectOptions(fields),
      config: {
        statusOrder: cfg.statusOrder,
        staffStatuses: cfg.staffStatuses,
        managerStatuses: cfg.managerStatuses,
        staffEditable: cfg.staffEditable,
        managerOnlyFields: cfg.managerOnlyFields,
        requiredOnCreate: cfg.requiredOnCreate,
        proofRequiredFor: cfg.proofRequiredFor,
        uploadable: cfg.uploadable,
        larkUrl: cfg.larkUrl,
        fieldNames: Object.fromEntries(BY_KEY.map(([k, f]) => [k, f.name])),
      },
    });
  }

  /* --- quyền quản lý --- */
  /* ==========================================================================
     THÔNG BÁO
     Không có bảng sự kiện, không có ai bấm nút gửi: mọi mục ở đây suy thẳng ra
     từ trạng thái hiện tại của Base. Cách này không cần lưu gì, không lệch với
     dữ liệu thật, và tự tắt khi việc được xử lý xong.
     Mã của mỗi mục có gắn mốc ngày với những loại phải nhắc lại (quá hạn, sắp
     tới) — nhờ vậy đọc rồi thì im trong ngày, sang hôm sau nhắc tiếp.
     ========================================================================== */
  if (p === '/api/thong-bao' && req.method === 'GET') {
    const items = (await getRecords()).map(toItem).filter((t) => !isBlank(t));
    const me = await whoAmI();
    const manager = await isManager();
    const ds = [];
    const homNay = ngayVN(new Date());

    const them = (o2) => { if (ds.length < 60) ds.push(o2); };
    const ten = (t) => t.title || '(chưa đặt tên)';

    if (manager) {
      for (const t of items.filter((x) => x.status === 'Chờ duyệt/Xử lý')) {
        them({ id: 'lich:duyet:' + t.id, muc: 'can', rec: t.id, khi: t.start,
          tieuDe: 'Lịch chờ duyệt kế hoạch', mo: ten(t) + ' · ' + nguoiCua(t) });
      }
      for (const t of items.filter((x) => x.cancelWant && !['Từ chối', 'Hủy lịch'].includes(x.status))) {
        them({ id: 'lich:xin-huy:' + t.id, muc: 'gap', rec: t.id, khi: t.start,
          tieuDe: 'Xin huỷ lịch', mo: ten(t) + ' — lý do: ' + (t.cancelReason || '(không ghi)') });
      }
      for (const t of items.filter((x) => x.focRequest && !x.focStatus && !SETTLED_TB.includes(x.status))) {
        them({ id: 'lich:foc:' + t.id, muc: 'can', rec: t.id, khi: t.start,
          tieuDe: 'Yêu cầu vé FOC chờ phản hồi', mo: ten(t) + ' · ' + (t.foc || []).join(', ') });
      }
      for (const t of items.filter((x) => x.mediaRequest && !x.mediaStatus && !SETTLED_TB.includes(x.status))) {
        them({ id: 'lich:media:' + t.id, muc: 'can', rec: t.id, khi: t.start,
          tieuDe: 'Yêu cầu nhân sự Media chờ phản hồi', mo: ten(t) });
      }
      for (const t of items.filter((x) => x.status === 'Đang báo cáo' && duBaoCao(x))) {
        them({ id: 'lich:nghiem-thu:' + t.id, muc: 'tin', rec: t.id, khi: t.end || t.start,
          tieuDe: 'Báo cáo chờ nghiệm thu', mo: ten(t) + ' · ' + nguoiCua(t) });
      }
      for (const t of items.filter((x) => x.status === 'Đang báo cáo' && !duBaoCao(x))) {
        them({ id: 'lich:bc-do-dang:' + t.id, muc: 'can', rec: t.id, khi: t.end || t.start,
          tieuDe: 'Báo cáo còn dở dang', mo: ten(t) + ' · ' + nguoiCua(t) + ' — chưa đủ thông tin để nghiệm thu' });
      }
    }

    if (me) {
      const cuaToi = items.filter((t) => ownedBy(t, me.id));
      /* Việc phải TAY LÀM thì chỉ người phụ trách nhận: sửa lại lịch bị trả về,
       * nộp báo cáo. Còn tin cần biết — hôm nay đi, ngày mai đi, vé đã duyệt —
       * thì cả nhóm cùng nhận, vì ai cũng phải sắp xếp mà đi. */
      const toiLoc = cuaToi.filter((t) => (t.owner || []).some((u) => u.id === me.id));
      for (const t of toiLoc.filter((x) => x.status === 'Từ chối/Cần điều chỉnh')) {
        them({ id: 'lich:tra-ve:' + t.id, muc: 'gap', rec: t.id, khi: t.start,
          tieuDe: 'Lịch bị trả về', mo: ten(t) + ' — sửa lại rồi gửi duyệt lần nữa' });
      }
      for (const t of cuaToi.filter((x) => x.status === 'Duyệt/Chờ tác nghiệp')) {
        const d = t.start ? new Date(t.start) : null;
        if (!d) continue;
        const cach = Math.round((ngayVN(d) - homNay) / 86400000);
        if (cach === 0) {
          them({ id: 'lich:hom-nay:' + t.id + ':' + nhan(homNay), muc: 'gap', rec: t.id, khi: t.start,
            tieuDe: 'Hôm nay đi tác nghiệp', mo: ten(t) + ' · ' + gioVN(d) });
        } else if (cach === 1) {
          them({ id: 'lich:ngay-mai:' + t.id + ':' + nhan(homNay), muc: 'can', rec: t.id, khi: t.start,
            tieuDe: 'Ngày mai đi tác nghiệp', mo: ten(t) + ' · ' + gioVN(d) + ' — xem lại vé và phương tiện' });
        } else if (cach < 0 && (t.owner || []).some((u) => u.id === me.id)) {
          them({ id: 'lich:tre-bc:' + t.id + ':' + nhan(homNay), muc: 'gap', rec: t.id, khi: t.start,
            tieuDe: 'Chưa nộp báo cáo', mo: ten(t) + ' — đã qua ngày đi, bấm Báo cáo' });
        }
      }
      for (const t of toiLoc.filter((x) => x.status === 'Đang báo cáo')) {
        const du = duBaoCao(t);
        them({
          id: (du ? 'lich:dang-bc:' : 'lich:bc-thieu:' + nhan(homNay) + ':') + t.id,
          muc: du ? 'tin' : 'gap', rec: t.id, khi: t.end || t.start,
          tieuDe: du ? 'Đã nộp báo cáo' : 'Báo cáo chưa xong',
          mo: du ? ten(t) + ' — chờ quản lý nghiệm thu'
                 : ten(t) + ' — còn thiếu ' + [
                     !t.end ? 'thời gian kết thúc' : '',
                     !String(t.reportAfter || '').trim() ? 'báo cáo sau tác nghiệp' : '',
                     t.costActual == null ? 'chi phí thực tế' : '',
                   ].filter(Boolean).join(', '),
        });
      }
      for (const t of cuaToi.filter((x) => x.focStatus && (x.foc || []).length && !SETTLED_TB.includes(x.status))) {
        const ok = t.focStatus === 'Phê duyệt';
        them({ id: 'lich:foc-' + (ok ? 'ok' : 'no') + ':' + t.id, muc: ok ? 'tin' : 'can', rec: t.id, khi: t.start,
          tieuDe: ok ? 'Vé FOC đã được duyệt' : 'Vé FOC bị từ chối',
          mo: ten(t) + ' · ' + (t.foc || []).join(', ') + (ok ? ' — nhớ nhận vé trước khi đi' : '') });
      }
    }

    ds.sort((a, b) => (BAC_TB[a.muc] - BAC_TB[b.muc]) || (new Date(b.khi || 0) - new Date(a.khi || 0)));
    return json(res, { items: ds });
  }

  if (p === '/api/quyen' && req.method === 'GET') {
    return json(res, { managers: cfg.loadManagerIds(), me: await whoAmI() });
  }
  if (p === '/api/quyen' && req.method === 'POST') {
    if (!(await requireManager(res))) return;
    const me = await whoAmI();
    const body = await readBody(req);
    const ids = Array.isArray(body.managers) ? body.managers.map(String) : [];
    if (me && !ids.includes(me.id)) {
      return json(res, { error: 'Không thể tự bỏ quyền quản lý của chính mình.', code: 'SELF_DEMOTE' }, 400);
    }
    return json(res, { ok: true, managers: cfg.saveManagerIds(ids) });
  }

  /* --- tạo lịch mới --- */
  if (p === '/api/items' && req.method === 'POST') {
    const body = await readBody(req);
    const me = await whoAmI();
    const manager = await isManager();

    if (!manager && !qDuocTao()) {
      return json(res, {
        error: 'Quản lý chưa mở quyền tạo lịch mới cho bạn.',
        code: 'CREATE_BLOCKED',
      }, 403);
    }

    for (const k of cfg.requiredOnCreate) {
      const v = body[k];
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) {
        return json(res, { error: 'Thiếu trường bắt buộc: ' + F[k].name, code: 'MISSING_FIELD' }, 400);
      }
    }

    const patch = {};
    for (const k of Object.keys(body)) {
      if (!F[k] || F[k].readOnly) continue;
      if (!manager && !cfg.staffEditable.includes(k)) continue;
      // không được xem chi phí thì cũng không ghi được chi phí (ẩn ở UI là chưa đủ)
      // lúc TẠO mới thì chưa có chuyến nào của ai, cứ chặn cả hai cột như cũ
      if (!manager && !qChiPhi() && COT_TIEN.includes(k)) continue;
      patch[k] = body[k];
    }
    // Người đăng ký mặc định là phụ trách, và luôn nằm trong nhóm nhân sự
    if (me) {
      if (!patch.owner || !patch.owner.length) patch.owner = [me.id];
      const st = (patch.staff || []).map((u) => (typeof u === 'string' ? u : u.id));
      if (!st.includes(me.id)) patch.staff = [...st, me.id];
    }
    if (!patch.status) patch.status = 'Chờ duyệt/Xử lý';
    if (patch.status && !manager && !cfg.staffStatuses.includes(patch.status)) {
      patch.status = 'Chờ duyệt/Xử lý';
    }

    const cells = toCells(patch);
    const out = await lark.createRecord(cells);
    cache.at = 0; // buộc tải lại lần sau
    return json(res, { ok: true, result: out });
  }

  /* --- đính kèm --- */
  const mUp = p.match(/^\/api\/items\/(rec[A-Za-z0-9]+)\/attachment\/([a-z]+)$/);
  if (mUp && req.method === 'POST') {
    const id = mUp[1];
    const key = mUp[2];
    if (!cfg.uploadable.includes(key)) return json(res, { error: 'Trường này không nhận tệp.' }, 400);
    const rec0 = await findRecord(id);
    if (!rec0) return json(res, { error: 'Không tìm thấy lịch tác nghiệp' }, 404);
    if (!(await requireOwn(res, toItem(rec0)))) return;

    const name = decodeURIComponent(url.searchParams.get('name') || 'tep');
    const safe = name.replace(/[\\/:*?"<>|]/g, '_').slice(-120);
    const relDir = './.tmp/up-' + Date.now();
    const absDir = path.join(__dirname, relDir);
    fs.mkdirSync(absDir, { recursive: true });
    const relFile = relDir + '/' + safe;
    try {
      fs.writeFileSync(path.join(absDir, safe), await readRawBody(req, 60 * 1024 * 1024));
      await lark.uploadAttachment(id, F[key].name, relFile);
      cache.at = 0;
      return json(res, { ok: true });
    } finally {
      try { fs.rmSync(absDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  const mDl = p.match(/^\/api\/items\/(rec[A-Za-z0-9]+)\/file\/([A-Za-z0-9]+)$/);
  if (mDl && req.method === 'GET') {
    const id = mDl[1];
    const token = mDl[2];
    const rec0 = await findRecord(id);
    if (!rec0) return json(res, { error: 'Không tìm thấy lịch tác nghiệp' }, 404);
    if (!(await requireOwn(res, toItem(rec0)))) return;

    let dir = null;
    try {
      dir = await lark.downloadAttachment(id, token, 'dl-' + Date.now());
      const files = fs.readdirSync(dir);
      if (!files.length) return json(res, { error: 'Không tải được tệp' }, 404);
      const file = path.join(dir, files[0]);
      const buf = fs.readFileSync(file);
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        'Content-Type': FILE_MIME[ext] || 'application/octet-stream',
        'Content-Length': buf.length,
        'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(files[0]),
      });
      return res.end(buf);
    } finally {
      if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
    }
  }

  /* --- sửa / xoá --- */
  const mItem = p.match(/^\/api\/items\/(rec[A-Za-z0-9]+)$/);
  if (mItem) {
    const id = mItem[1];

    if (req.method === 'DELETE') {
      if (!(await requireManager(res))) return;
      await lark.deleteRecords([id]);
      if (cache.records) cache.records = cache.records.filter((r) => r.record_id !== id);
      return json(res, { ok: true });
    }

    if (req.method === 'PATCH') {
      const rec0 = await findRecord(id);
      if (!rec0) return json(res, { error: 'Không tìm thấy lịch tác nghiệp' }, 404);
      const item = toItem(rec0);
      if (!(await requireOwn(res, item))) return;

      const body = await readBody(req);
      const manager = await isManager();

      if (!manager && !qChiPhi()) {
        /* Không có quyền xem chi phí thì không đụng được vào ngân sách dự kiến.
         * Riêng chi phí THỰC TẾ của chuyến mình phụ trách thì vẫn ghi được —
         * đó là số tiền chính họ tiêu và bắt buộc phải khai trong báo cáo. */
        const toiTien = await whoAmI();
        delete body.costPlan;
        if (!(toiTien && laPhuTrach(item, toiTien.id))) delete body.costActual;
      }

      if (!manager) {
        const bad = Object.keys(body).filter((k) => !cfg.staffEditable.includes(k));
        if (bad.length) {
          return json(res, {
            error: 'Trường "' + bad.map((k) => (F[k] ? F[k].name : k)).join(', ') + '" do quản lý phụ trách.',
            code: 'FIELD_LOCKED',
          }, 403);
        }
        /* Ghi vào lịch là việc của người phụ trách. Nhân sự cùng đi vẫn thấy
         * lịch và vẫn nhận thông báo, nhưng không nộp báo cáo, không gửi duyệt,
         * không xin huỷ thay — nếu ai cũng nộp thì quản lý nhận mấy bản báo cáo
         * chồng nhau cho cùng một buổi. */
        const toi = await whoAmI();
        if (!toi || !laPhuTrach(item, toi.id)) {
          return json(res, {
            error: 'Chỉ người phụ trách lịch này mới sửa và nộp báo cáo được. ' +
              'Bạn là nhân sự cùng tác nghiệp — góp nội dung thì gửi cho người phụ trách tổng hợp.',
            code: 'NOT_OWNER',
          }, 403);
        }

        /* Bản nháp là của riêng người viết, chưa ai nhìn tới — huỷ thì huỷ,
         * không phải xin phép ai. Từ lúc gửi duyệt trở đi mới phải xin. */
        const tuHuyDuoc = body.status === 'Hủy lịch' && item.status === 'Đang lên kế hoạch';
        if (body.status && !tuHuyDuoc && !cfg.staffStatuses.includes(body.status)) {
          return json(res, {
            error: 'Trạng thái "' + body.status + '" do quản lý đặt.',
            code: 'STATUS_LOCKED',
          }, 403);
        }
        // Lịch đã duyệt/đóng thì không tự sửa nội dung kế hoạch nữa
        if (khoaKeHoach(item.status, Object.keys(body))) {
          return json(res, {
            error: 'Lịch ở trạng thái "' + item.status + '" - nội dung kế hoạch đã khoá. Hãy báo quản lý.',
            code: 'PLAN_LOCKED',
          }, 403);
        }
      }

      /* Xin huỷ mà không nói vì sao thì quản lý không có gì để quyết. Chặn ở đây
       * chứ không chỉ ở giao diện, vì API gọi thẳng vẫn phải chặn được. */
      if (body.cancelWant === true) {
        const ld = body.cancelReason != null ? body.cancelReason : item.cancelReason;
        if (!String(ld || '').trim()) {
          return json(res, { error: 'Phải ghi lý do huỷ.', code: 'CANCEL_REASON_REQUIRED' }, 400);
        }
      }

      if (body.status === cfg.proofRequiredFor) {
        if (!duMinhChung(item, body)) {
          return json(res, {
            error: 'Cần điền "Báo cáo sau tác nghiệp" hoặc "Liên kết" trước khi chuyển sang Đang báo cáo.',
            code: 'PROOF_REQUIRED',
          }, 400);
        }
      }

      const cells = toCells(body);
      if (!Object.keys(cells).length) return json(res, { error: 'Không có trường nào để cập nhật' }, 400);
      await lark.updateRecord(id, cells);
      if (cache.records) {
        const rec = cache.records.find((r) => r.record_id === id);
        if (rec) applyLocal(rec, body);
      }
      return json(res, { ok: true });
    }
  }

  return json(res, { error: 'Not found' }, 404);
}

/* ---------------- helpers ---------------- */
function json(res, obj, code) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': b.length,
    'Cache-Control': 'no-store',
  });
  res.end(b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 4000000) req.destroy(); });
    req.on('end', () => {
      try { resolve(d ? JSON.parse(d) : {}); }
      catch (e) { reject(new Error('JSON body không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) { req.destroy(); return reject(new Error('Tệp quá lớn (tối đa ' + Math.round(limit / 1048576) + ' MB)')); }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const FILE_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.txt': 'text/plain; charset=utf-8',
};

const PUBLIC_DIR = path.join(__dirname, 'public');

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR)) return json(res, { error: 'Forbidden' }, 403);
  fs.readFile(file, (err, buf) => {
    if (err) return json(res, { error: 'Not found' }, 404);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}

/**
 * Chỉ mở CORS cho bản HTML gộp mở bằng file:// (origin "null") và cho localhost.
 * Không dùng "*": server này ghi thẳng vào Base, mở cho mọi origin nghĩa là bất kỳ
 * trang web nào người dùng ghé cũng gọi được API cục bộ này.
 */
function corsOrigin(req) {
  const o = req.headers.origin;
  if (!o) return null;
  if (o === 'null') return 'null';
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o)) return o;
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  const allow = corsOrigin(req);
  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', allow);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') { res.writeHead(allow ? 204 : 403); return res.end(); }

  // mọi xử lý của một request chạy trong ngữ cảnh của đúng người gửi request đó
  await nguoiCuaRequest.run({ me: nguoiTuHeader(req), quyen: quyenTuHeader(req) }, async () => {
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      return serveStatic(res, url.pathname);
    } catch (e) {
      console.error('[ERR]', e.message);
      if (!res.headersSent) json(res, { error: e.message }, 500);
    }
  });
});

if (cfg.mode === 'api' && (!cfg.appId || !cfg.appSecret)) {
  console.error('\n  Chế độ api thiếu LARK_APP_ID / LARK_APP_SECRET\n');
  process.exit(1);
}

/* ---------------- cổng nghe ----------------
 * MẶC ĐỊNH CHỈ NGHE 127.0.0.1. App này TIN header danh tính do lớp vỏ gửi kèm
 * (x-hub-user-id / x-hub-user-manager...), nên mở cổng ra mạng ngoài đồng nghĩa
 * ai cùng mạng Wi-Fi cũng tự xưng được là quản lý. Lớp vỏ luôn gọi qua 127.0.0.1
 * nên chạy dưới hub không cần khai gì thêm.
 *
 * Muốn phơi app này ra ngoài thì đặt BIND_HOST=0.0.0.0 — khi đó việc tin header
 * TỰ TẮT, vì hai thứ đó không được phép cùng bật.
 */
const BIND = process.env.BIND_HOST || '127.0.0.1';
const LOOPBACK = ['127.0.0.1', '::1', 'localhost'];
if (!LOOPBACK.includes(BIND) && process.env.HUB_TRUST_HEADER !== '0') {
  process.env.HUB_TRUST_HEADER = '0';
  console.warn('\n  [bảo mật] BIND_HOST=' + BIND + ' mở cổng ra mạng ngoài, nên đã TẮT\n' +
    '  việc tin header danh tính của lớp vỏ. Chạy dưới Marketing Hub thì bỏ BIND_HOST.\n');
}

/* Được require từ bộ kiểm thử thì chỉ xuất hàm ra, đừng mở cổng. */
if (require.main !== module) {
  module.exports = { khoaKeHoach, duMinhChung, anLichHuy, laPhuTrach, ownedBy, duBaoCao };
  return;
}

server.listen(cfg.port, BIND, () => {
  console.log('');
  console.log('  Rooty Trip · Lịch tác nghiệp');
  console.log('  ->  http://localhost:' + cfg.port);
  console.log('');
  console.log('  Base  : ' + cfg.baseToken);
  console.log('  Table : ' + cfg.tableId + '  (Lịch tác nghiệp)');
  console.log('  Ctrl+C để dừng.');
  console.log('');
});
