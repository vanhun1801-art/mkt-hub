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

/* ---- Xin huỷ MUỘN ----
 * Phép tính mốc nằm ở huy-muon.js — tách ra vì nó phải cộng độ lệch VN trước
 * khi lấy đầu ngày, và app này đã có một lỗi đúng kiểu đó. Chú thích đầy đủ và
 * phép thử ở trong tệp đó. */
const huyMuon = require('./huy-muon');
/* Phép tính "bây giờ mở hay đóng" tách riêng: nó tính theo giờ VN và phải xử
 * được cửa sổ vắt qua tuần. Chú thích và phép thử ở trong tệp đó. */
const cuaSo = require('./cua-so-dang-ky');
const mocHuyMuon = (item) => huyMuon.moc(item, cfg.lateCancel.afterMs);
const huyMuonDuoc = (item, luc) => huyMuon.duoc(item, cfg.lateCancel, luc);

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
  if (meId && laPhuTrach(it, meId)) return it;   // chuyến của mình thì thấy đủ
  const o = Object.assign({}, it);
  delete o.costPlan;
  delete o.costActual;
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
 *
 * CỐ Ý KHÔNG xét `status`. Base tự điền mặc định "Đang lên kế hoạch" cho cột
 * đó, nên trạng thái không nói gì về việc dòng có nội dung hay không — trước
 * đây điều kiện `!t.status` làm 10 dòng rác lọt qua, và biểu đồ "Phân bố trạng
 * thái" báo 14 nháp trong khi thật chỉ có 4. An toàn vì app bắt buộc tên + mục
 * đích + ngày khi tạo (`requiredOnCreate`), nên dòng thật không bao giờ trống
 * cả sáu ô dưới đây.
 */
function isBlank(t) {
  return !String(t.title || '').trim() &&
    !String(t.purpose || '').trim() &&
    !String(t.plan || '').trim() &&
    !t.start &&
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

/* ==========================================================================
   BÁO VÀO LARK
   Bốn kênh trong app (số đỏ ở panel, chuông, băng cảnh báo, thẻ đỏ) đều chỉ
   chạm được người ta khi họ MỞ app. Quyết định của quản lý — trả về, từ chối,
   huỷ, duyệt — thì phải tới nơi ngay cả khi họ chưa mở, nên đẩy thẳng một tin
   nhắn Lark.

   Gửi tin là việc phụ: hỏng thì ghi log rồi thôi, tuyệt đối không để nó làm
   hỏng thao tác chính. Chưa cấp quyền im:message:send_as_bot thì Lark từ chối,
   app vẫn chạy bình thường.
   ========================================================================== */
const BAO_LARK = {
  'Từ chối/Cần điều chỉnh': {
    tieu: 'Lịch tác nghiệp bị trả về',
    nhac: 'Sửa lại rồi bấm Gửi duyệt lần nữa.',
  },
  'Từ chối': {
    tieu: 'Lịch tác nghiệp bị từ chối',
    nhac: 'Cần trao đổi thêm thì nhắn lại quản lý.',
  },
  'Hủy lịch': {
    tieu: 'Lịch tác nghiệp đã bị huỷ',
    nhac: 'Lịch này không còn hiện trong danh sách của bạn.',
  },
  'Duyệt/Chờ tác nghiệp': {
    tieu: 'Lịch tác nghiệp đã được duyệt',
    nhac: 'Xem lại giờ, phương tiện và vé trước khi đi.',
  },
};

/* Cấu hình đọc từ Base, giữ 60 giây. Đủ ngắn để anh Hùng tắt một loại tin là
 * thấy tác dụng gần như ngay, đủ dài để không đọc lại Base mỗi lần bấm nút. */
const demCauHinh = { ds: null, at: 0 };

async function docCauHinhBao(force) {
  if (!force && demCauHinh.ds && Date.now() - demCauHinh.at < 60000) return demCauHinh.ds;
  const F2 = cfg.cauHinhFields;
  try {
    /* Ô của bản ghi được khoá bằng FIELD_ID, không phải tên cột — nên phải đọc
     * danh sách cột trước để dựng bảng tra tên → id. Bảng cấu hình do lark-cli
     * tạo nên id không cố định giữa các môi trường, không thể khai cứng. */
    const fields = await lark.listFields(cfg.cauHinhTableId);
    const idCua = {};
    for (const f of fields) {
      const ten = f.name || f.field_name;
      const fid = f.id || f.field_id;
      if (ten && fid) idCua[ten] = fid;
    }
    const recs = await lark.listAllRecords(cfg.cauHinhTableId);
    demCauHinh.ds = recs.map((r) => {
      const c = r.cells || {};
      const lay = (ten) => c[idCua[ten]];
      return {
        id: r.record_id,
        suKien: asText(lay(F2.suKien)),
        bat: lay(F2.bat) === true,
        nguoiNhan: asText(first(lay(F2.nguoiNhan))) || 'Chỉ phụ trách',
        moTa: asText(lay(F2.moTa)),
        mau: asText(lay(F2.mau)),
      };
    }).filter((x) => x.suKien);
    demCauHinh.at = Date.now();
  } catch (e) {
    console.warn('[cấu hình thông báo] không đọc được, tạm dùng mặc định: ' + e.message);
    demCauHinh.ds = null;
  }
  return demCauHinh.ds;
}

/* ---------------- cửa sổ đăng ký ---------------- */
let demCuaSo = { at: 0, luat: null };

/**
 * Luật cửa sổ đăng ký, đọc từ bảng một dòng trên Base.
 *
 * Đọc lỗi (mất mạng, đổi tên cột) thì trả null, và chỗ gọi hiểu là KHÔNG ÁP
 * cửa sổ — nút mở như cũ. Cố ý nghiêng về phía mở: đọc lỗi mà đóng nút thì cả
 * phòng không đăng ký được và không ai biết vì sao, còn mở thừa một hôm thì
 * quản lý chỉ phải xếp thêm vài lịch.
 */
/* Đệm NGẮN. Luật này gác một cái nút, và nó lật đúng vào một phút cụ thể
 * (15:00 thứ 6). Đệm 60 giây như mấy bảng cấu hình khác thì nhân sự ngồi nhìn
 * màn hình lúc 15:01 vẫn thấy nút xám — đã gặp đúng thế. Đọc một dòng Base thì
 * rẻ, đệm 15 giây là đủ để không gọi liên tục. */
const DEM_CUA_SO_MS = 15000;

async function docLuatCuaSo(force) {
  if (!force && demCuaSo.luat !== null && Date.now() - demCuaSo.at < DEM_CUA_SO_MS) return demCuaSo.luat;
  const F2 = cfg.cuaSoFields;
  try {
    const fields = await lark.listFields(cfg.cuaSoTableId);
    const idCua = {};
    for (const f of fields) {
      const ten = f.name || f.field_name;
      const fid = f.id || f.field_id;
      if (ten && fid) idCua[ten] = fid;
    }
    const recs = await lark.listAllRecords(cfg.cuaSoTableId);
    const r = recs[0];
    if (!r) { demCuaSo = { at: Date.now(), luat: null }; return null; }
    const c = r.cells || {};
    const lay = (ten) => c[idCua[ten]];
    const thuSo = (v) => cuaSo.THU_SO[asText(first(v))] || 0;
    /* Ô NGÀY của Base trả về CHUỖI ISO ở chế độ cli ("2026-09-11T16:25+07:00"),
     * còn chế độ api trả số ms. Number() trên chuỗi đó ra NaN, rồi `|| 0` biến
     * nó thành "không đặt" — nên bấm "đóng tay" xong đọc lại vẫn là mở, im lặng
     * hoàn toàn. Đã đo được đúng thế: giá trị NẰM trên Base mà đọc ra 0. */
    const asMs = (v) => {
      const x = first(v);
      if (x == null || x === '') return 0;
      if (typeof x === 'number') return x;
      return Date.parse(asText(x)) || 0;
    };
    demCuaSo = {
      at: Date.now(),
      luat: {
        recordId: r.record_id,
        bat: lay(F2.bat) === true,
        moThu: thuSo(lay(F2.moThu)),
        moGio: asText(lay(F2.moGio)),
        dongThu: thuSo(lay(F2.dongThu)),
        dongGio: asText(lay(F2.dongGio)),
        moTayToi: asMs(lay(F2.moTayToi)),
        dongTayToi: asMs(lay(F2.dongTayToi)),
        ghiChu: asText(lay(F2.ghiChu)),
      },
    };
  } catch (e) {
    console.warn('[cửa sổ đăng ký] không đọc được, tạm không áp: ' + e.message);
    demCuaSo = { at: Date.now(), luat: null };
  }
  return demCuaSo.luat;
}

/** Trạng thái cửa sổ lúc này. Không có luật -> coi như mở. */
async function trangThaiCuaSo(force) {
  const luat = await docLuatCuaSo(force);
  if (!luat) {
    return { mo: true, vi: 'Chưa khai bảng Cửa sổ đăng ký — nút mở liên tục.', chuaKhai: true };
  }
  return Object.assign(cuaSo.trangThai(luat), { ghiChu: luat.ghiChu, recordId: luat.recordId });
}

/**
 * Loại tin này có được gửi không, và gửi cho ai.
 * Đọc bảng lỗi (mất mạng, đổi tên cột) thì MẶC ĐỊNH VẪN GỬI cho phụ trách —
 * thà gửi thừa một tin còn hơn im lặng để người ta không biết lịch bị trả về.
 */
async function luatBao(trangThaiMoi) {
  const ten = cfg.cauHinhMap[trangThaiMoi];
  if (!ten) return null;                       // trạng thái không thuộc diện báo
  /* Không đọc được bảng, hoặc chưa khai dòng đó: giữ NGUYÊN nếp cũ — vẫn gửi,
   * và "được duyệt" thì cả nhóm. Đổi âm thầm nếp cũ khi bảng lỗi là cách nhanh
   * nhất để người ta mất tin mà không biết vì sao. */
  const macDinh = { bat: true, caNhom: trangThaiMoi === 'Duyệt/Chờ tác nghiệp' };
  const ds = await docCauHinhBao(false);
  if (!ds) return macDinh;
  const d = ds.find((x) => x.suKien === ten);
  if (!d) return macDinh;
  return { bat: d.bat, caNhom: /cả nhóm/i.test(d.nguoiNhan), mau: d.mau || '' };
}

/**
 * Chỗ điền động trong mẫu tin. Quản lý gõ {ten} thì app thay bằng tên hoạt động.
 * Giữ danh sách này ở một chỗ để màn hình cấu hình liệt kê đúng những gì dùng được.
 */
const CHO_DIEN = {
  ten: (t) => t.title || '(chưa đặt tên)',
  gio: (t) => (t.start ? gioVN(new Date(t.start)) : 'chưa đặt'),
  phutrach: (t) => ((t.owner || [])[0] || {}).name || '(chưa có)',
  phuongtien: (t) => (t.transport || []).join(', ') || '(chưa chọn)',
  thoiluong: (t) => (t.duration ? t.duration + ' giờ' : '(chưa đặt)'),
};

/** Thay các {cho_dien} trong mẫu. Chỗ nào không biết thì để nguyên, đừng xoá mất. */
function dienMau(mau, item, lyDo) {
  return String(mau).replace(/\{(\w+)\}/g, (nguyen, khoa) => {
    if (khoa === 'lydo') return lyDo || '';
    if (khoa === 'link') return cfg.hubUrl || '';
    const f = CHO_DIEN[khoa];
    return f ? f(item) : nguyen;
  }).replace(/\n{3,}/g, '\n\n').trim();
}

/** Mẫu sẵn của một loại tin — hiện lên màn hình cấu hình làm điểm khởi đầu. */
function mauMacDinh(trangThaiMoi) {
  const m = BAO_LARK[trangThaiMoi];
  if (!m) return '';
  return [m.tieu, '', 'Hoạt động: {ten}', 'Thời gian: {gio}',
    'Phản hồi của quản lý: {lydo}', '', m.nhac, '{link}'].join('\n');
}

/**
 * Ghép nội dung tin nhắn — đọc là hiểu, không cần mở app mới biết chuyện gì.
 * Có mẫu riêng thì dùng mẫu; không thì dùng mẫu sẵn. Cùng một đường đi để mẫu
 * riêng và mẫu sẵn không bao giờ lệch cách xử lý.
 */
function soanTinLich(item, trangThaiMoi, lyDo, mauRieng) {
  const m = BAO_LARK[trangThaiMoi];
  if (!m) return null;
  const mau = String(mauRieng || '').trim() || mauMacDinh(trangThaiMoi);
  /* Không có lý do thì xoá luôn cả dòng chứa {lydo}, chứ không để lại một dòng
   * "Phản hồi của quản lý:" trống trơn. */
  const sach = lyDo ? mau : mau.split('\n').filter((d) => !/\{lydo\}/.test(d)).join('\n');
  return dienMau(sach, item, lyDo);
}

/**
 * Ai cần biết quyết định này.
 * Người phụ trách luôn nhận. Lịch được duyệt thì cả nhóm cùng nhận, vì ai cũng
 * phải sắp xếp mà đi; còn bị trả về / từ chối thì chỉ phụ trách — người khác
 * nhận cũng không làm gì được.
 */
function nguoiNhanTin(item, trangThaiMoi, caNhom) {
  const ds = (item.owner || []).map((u) => u.id).filter(Boolean);
  const rong = caNhom === undefined
    ? trangThaiMoi === 'Duyệt/Chờ tác nghiệp'   // mặc định cũ, dùng khi chưa có cấu hình
    : !!caNhom;
  if (rong) {
    for (const u of (item.staff || [])) if (u.id && !ds.includes(u.id)) ds.push(u.id);
  }
  return ds;
}

/* ---------------------------------------------------------------------------
 * TỰ TẠO ĐƠN TOURWELL KHI ĐÁNH DẤU "ĐÃ THANH TOÁN"
 * -------------------------------------------------------------------------
 * Ba luật, và cả ba đều phải chốt Ở ĐÂY chứ không phải ở giao diện:
 *
 *  1. MỘT LỊCH MỘT ĐƠN. Ô "Đơn Tourwell" có mã rồi thì thôi. Bấm nhầm hai lần
 *     là hai đơn thật trên hệ thống kế toán, mà Tourwell không chống trùng hộ.
 *     Thêm một khoá trong bộ nhớ cho trường hợp hai cú bấm sát nhau: ô Base
 *     chưa kịp ghi xong thì cú thứ hai đã đọc và thấy trống.
 *
 *  2. TOURWELL HỎNG KHÔNG ĐƯỢC LÀM HỎNG VIỆC ĐÁNH DẤU. Tiền đã chuyển rồi;
 *     việc ghi nhận thanh toán trong Base phải xong bất kể CRM có sống hay
 *     không. Lỗi được trả kèm để báo cho người bấm, không ném ra ngoài.
 *
 *  3. NÓI RÕ ĐƠN CHƯA XONG. API không chuyển được đơn sang "Thành công",
 *     không gửi được điều hành, không tải được UNC. Đơn tạo ra đang ở "Đang
 *     xử lý" và còn 5 nút phải bấm tay — giấu chuyện đó đi thì người dùng
 *     tưởng xong, và tháng sau kế toán mới phát hiện.
 * ------------------------------------------------------------------------- */
const tourwell = require('./tourwell');
const dangTaoDon = new Set();

async function taoDonTourwell(recId, item) {
  if (!tourwell.bat()) return { bo: 'chua-cau-hinh' };
  if (String(item.tourwell || '').trim()) {
    return { bo: 'da-co', ma: String(item.tourwell).trim() };
  }
  if (!(Number(item.costActual) > 0)) return { bo: 'khong-co-chi-phi' };
  if (dangTaoDon.has(recId)) return { bo: 'dang-tao' };

  dangTaoDon.add(recId);
  try {
    const kq = await tourwell.taoDonChoLich(item);

    /* Ghi mã ngược vào Base NGAY, kể cả khi dòng chi phí lỗi: đơn đã tồn tại
     * thì ô này phải có mã, nếu không lần bấm sau sẽ đẻ thêm đơn nữa. */
    const ghi = kq.ma + ' · ' + kq.link;
    try {
      await lark.updateRecord(recId, { [F.tourwell.name]: ghi });
      if (cache.records) {
        const rec = cache.records.find((r) => r.record_id === recId);
        // applyLocal() cố ý bỏ qua trường readOnly nên phải tự đặt vào cache
        if (rec) rec.cells[F.tourwell.id] = ghi;
      }
    } catch (e) {
      kq.loiGhiBase = e.message;
    }
    return kq;
  } catch (e) {
    return { loi: e.message };
  } finally {
    dangTaoDon.delete(recId);
  }
}

/* ---------------------------------------------------------------------------
 * GHI KHOẢN CHI VÀO SỔ QUỸ
 * -------------------------------------------------------------------------
 * Cùng ba luật với phần Tourwell ở trên — một lịch một dòng, hỏng không được
 * chặn việc đánh dấu, và phải nói ra kết quả. Chốt chống trùng ở đây là ô
 * "Sổ quỹ" trong Base lịch, chứ không phải đếm dòng bên kia: đếm thì hai buổi
 * cùng tên cùng tiền sẽ bị coi là một.
 * ------------------------------------------------------------------------- */
const soQuy = require('./so-quy');
const dangGhiQuy = new Set();

async function ghiSoQuy(recId, item, maDon) {
  if (!soQuy.bat()) return { bo: 'chua-cau-hinh' };
  if (String(item.soQuy || '').trim()) return { bo: 'da-co', ma: String(item.soQuy).trim() };
  if (!(Number(item.costActual) > 0)) return { bo: 'khong-co-chi-phi' };
  if (dangGhiQuy.has(recId)) return { bo: 'dang-ghi' };

  dangGhiQuy.add(recId);
  try {
    const kq = await soQuy.ghiKhoanChi({ ...item, id: recId }, maDon);
    if (kq && kq.id && F.soQuy) {
      const ghi = 'Đã ghi sổ quỹ' + (kq.dot ? ' · ' + kq.dot : '');
      try {
        await lark.updateRecord(recId, { [F.soQuy.name]: ghi });
        if (cache.records) {
          const rec = cache.records.find((r) => r.record_id === recId);
          if (rec) rec.cells[F.soQuy.id] = ghi;
        }
      } catch (e) { kq.loiGhiBase = e.message; }
    }
    return kq;
  } catch (e) {
    return { loi: e.message };
  } finally {
    dangGhiQuy.delete(recId);
  }
}

async function baoVaoLark(item, trangThaiMoi, lyDo) {
  const luat = await luatBao(trangThaiMoi);
  if (!luat || !luat.bat) return;              // quản lý đã tắt loại tin này
  const noi = soanTinLich(item, trangThaiMoi, lyDo, luat.mau);
  if (!noi || typeof lark.guiTinNhan !== 'function') return;
  for (const id of nguoiNhanTin(item, trangThaiMoi, luat.caNhom)) {
    try {
      const kq = await lark.guiTinNhan(id, noi);
      if (!kq.ok) console.warn('[báo Lark] không gửi được cho ' + id + ': ' + kq.ly);
    } catch (e) {
      console.warn('[báo Lark] lỗi: ' + e.message);
    }
  }
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

/* ==========================================================================
   NHẮC NHÂN SỰ
   ==========================================================================
   Cả hệ được dựng để CHỈ RA ai đang trễ — hàng đợi báo cáo dở dang, quá ngày
   chưa báo cáo, trả về chưa sửa, nháp để lâu. Nhưng trước đây mỗi hàng đợi chỉ
   có nút "Xem chi tiết": quản lý thấy vấn đề rồi phải thoát app, mở Lark, tìm
   người, gõ tay. Đường gửi tin thì đã có sẵn và đang chạy.

   Câu nhắc do MÁY CHỦ tự dựng từ trạng thái thật của lịch, không phải chữ client
   gửi lên — cùng nguyên tắc với câu giải thích của bộ phân phối: hệ thống nói
   được vì sao nó nhắc.
*/

/** Đã nhắc lịch nào lúc nào. Giữ trong RAM: mất sau deploy thì cùng lắm nhắc lại
 *  một lần, còn ghi thêm cột lên Base chỉ để chống trùng thì không đáng. */
const daNhac = new Map();
const CACH_NHAU = 6 * 3600000;      // cùng một lịch, 6 tiếng mới nhắc lại được

/**
 * Vì sao nhắc — dựng từ chính trạng thái của lịch.
 * Trả null nghĩa là lịch này không có gì để nhắc.
 */
function lyDoNhac(t) {
  const thieu = [];
  if (!t.end) thieu.push('thời gian kết thúc');
  if (!String(t.reportAfter || '').trim()) thieu.push('báo cáo sau tác nghiệp');
  if (t.costActual == null) thieu.push('chi phí thực tế');

  if (t.status === 'Đang báo cáo' && thieu.length) {
    return 'Báo cáo còn thiếu: ' + thieu.join(', ') + '.';
  }
  const bd = t.start ? Date.parse(t.start) : 0;
  if (t.status === 'Duyệt/Chờ tác nghiệp' && bd && bd < ngayVN(new Date()).getTime()) {
    return 'Lịch đã qua ngày đi mà chưa bấm Báo cáo.';
  }
  if (t.status === 'Từ chối/Cần điều chỉnh') {
    return 'Lịch bị trả về cần điều chỉnh rồi gửi duyệt lại.' +
      (t.mgrNote ? ' Quản lý yêu cầu: ' + t.mgrNote : '');
  }
  if (t.status === 'Đang lên kế hoạch') {
    return 'Bản nháp để lâu chưa gửi duyệt.';
  }
  return null;
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

    /* Lịch đã huỷ vẫn bị cắt khỏi danh sách của nhân sự (theo ý anh Hùng), nhưng
     * phần thông báo đọc từ `all` nên vẫn báo được cho họ biết một tiếng. */
    const scoped = anLichHuy(scoped0, manager);

    return json(res, {
      me, manager, acting,
      // quản lý cấp riêng trong bảng "Phân quyền app" của lớp vỏ
      perm: { toanBo: manager || qToanBo(), taoMoi: manager || qDuocTao(), chiPhi: manager || qChiPhi() },
      // không được xem chi phí thì cắt luôn ở server, không chỉ ẩn trên giao diện
      items: (manager || qChiPhi()) ? scoped : scoped.map((t) => boChiPhi(t, me && me.id)),
      /* Cửa sổ đăng ký: giao diện phải biết đang mở hay đóng để vẽ nút cho
       * đúng. Gửi kèm cả mốc kế tiếp — nút bị khoá mà không nói bao giờ mở lại
       * thì người ta bấm lại mỗi tiếng. */
      cuaSo: await trangThaiCuaSo(url.searchParams.get('refresh') === '1'),
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
        // giao diện phải dùng ĐÚNG con số của máy chủ, không tự khai lại
        lateCancel: cfg.lateCancel,
        uploadable: cfg.uploadable,
        larkUrl: cfg.larkUrl,
        fieldNames: Object.fromEntries(BY_KEY.map(([k, f]) => [k, f.name])),
      },
    });
  }

  /* --- cửa sổ đăng ký: đọc cho mọi người, SỬA chỉ quản lý --- */
  if (p === '/api/cua-so') {
    if (req.method === 'GET') {
      const cs = await trangThaiCuaSo(url.searchParams.get('refresh') === '1');
      const luat = await docLuatCuaSo(false);
      return json(res, {
        ...cs,
        luatTho: luat,
        thu: cuaSo.THU.slice(1),
        larkUrl: cfg.larkUrl.replace(/table=[^&]*/, 'table=' + cfg.cuaSoTableId),
      });
    }

    if (req.method === 'PATCH') {
      if (!(await requireManager(res))) return;
      const body = await readBody(req);
      const luat = await docLuatCuaSo(true);
      if (!luat) {
        return json(res, {
          error: 'Chưa đọc được bảng "Cửa sổ đăng ký" — kiểm tra bảng và cột.',
          code: 'NO_TABLE',
        }, 400);
      }
      const F2 = cfg.cuaSoFields;
      const cells = {};
      const soThu = (v) => cuaSo.THU[Number(v)] || '';
      if (body.bat != null) cells[F2.bat] = !!body.bat;
      if (body.moThu != null && soThu(body.moThu)) cells[F2.moThu] = soThu(body.moThu);
      if (body.dongThu != null && soThu(body.dongThu)) cells[F2.dongThu] = soThu(body.dongThu);
      /* Giờ sai định dạng thì TỪ CHỐI, không im lặng lấy mặc định: lưu xong mà
       * khung giờ khác cái vừa gõ là loại lỗi không ai soát lại. */
      for (const [k, cot] of [['moGio', F2.moGio], ['dongGio', F2.dongGio]]) {
        if (body[k] == null) continue;
        if (cuaSo.docGio(body[k]) == null) {
          return json(res, { error: 'Giờ "' + body[k] + '" không đọc được. Ghi kiểu 15:00.',
            code: 'BAD_TIME' }, 400);
        }
        cells[cot] = cuaSo.veGio(cuaSo.docGio(body[k]));
      }
      /* BỎ ngoại lệ = ghi một mốc ĐÃ QUA, không phải ghi null.
       *
       * Đo được: ghi `null`, `""` hay `0` vào ô ngày thì lark-cli trả ok:true mà
       * giá trị trên Base KHÔNG đổi — nút "Bỏ" bấm xong không có gì xảy ra, và
       * không có lỗi nào. Luật chỉ xét `mốc > bây giờ`, nên một mốc quá khứ có
       * đúng nghĩa "không còn hiệu lực", và nó là một datetime thật nên ghi
       * được. Ô trên Base giữ lại mốc cũ — đọc ra là "lần ghi đè gần nhất, đã
       * hết hạn", không sai gì. */
      const mocTay = (v) => (Number(v) > 0 ? Number(v) : Date.now() - 60000);
      if (body.moTayToi != null) cells[F2.moTayToi] = mocTay(body.moTayToi);
      if (body.dongTayToi != null) cells[F2.dongTayToi] = mocTay(body.dongTayToi);
      if (body.ghiChu != null) cells[F2.ghiChu] = String(body.ghiChu);
      if (!Object.keys(cells).length) return json(res, { error: 'Không có gì để sửa' }, 400);

      /* updateRecord nhận tableId ở tham số thứ ba — cả hai chế độ api/cli
       * đều vậy, nên không cần hàm riêng. */
      await lark.updateRecord(luat.recordId, cells, cfg.cuaSoTableId);
      demCuaSo = { at: 0, luat: null };
      return json(res, { ok: true, cuaSo: await trangThaiCuaSo(true) });
    }
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
        /* Huỷ một bản nháp và huỷ một lịch ĐÃ DUYỆT là hai việc khác hẳn nhau:
         * cái sau đã có vé, đã hẹn đối tác. Nói rõ ngay ở tiêu đề tin, không
         * để quản lý phải mở ra mới biết mình đang quyết chuyện gì. */
        const muon = huyMuonDuoc(t);
        them({ id: 'lich:xin-huy:' + t.id, muc: 'gap', rec: t.id, khi: t.start,
          tieuDe: muon ? 'Xin huỷ lịch ĐÃ DUYỆT' : 'Xin huỷ lịch',
          mo: ten(t) + (muon ? ' — đã duyệt, đã qua ngày đi' : '') +
            ' — lý do: ' + (t.cancelReason || '(không ghi)') });
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
          tieuDe: 'Lịch bị trả về',
          mo: ten(t) + ' — ' + (t.mgrNote || 'sửa lại rồi gửi duyệt lần nữa') });
      }

      /* Ba mốc quan trọng nhất với nhân sự mà trước nay không ai báo: được
       * duyệt, bị từ chối, bị huỷ. Riêng lịch huỷ còn bị cắt khỏi danh sách của
       * họ nên nếu không báo thì nó chỉ đơn giản là biến mất. */
      for (const t of cuaToi.filter((x) => x.status === 'Duyệt/Chờ tác nghiệp')) {
        them({ id: 'lich:da-duyet:' + t.id, muc: 'tin', rec: t.id, khi: t.start,
          tieuDe: 'Lịch đã được duyệt', mo: ten(t) + ' · ' + gioVN(new Date(t.start)) + ' — chuẩn bị đi' });
      }
      for (const t of cuaToi.filter((x) => x.status === 'Từ chối')) {
        them({ id: 'lich:bi-tu-choi:' + t.id, muc: 'can', rec: t.id, khi: t.start,
          tieuDe: 'Lịch bị từ chối', mo: ten(t) + ' — ' + (t.mgrNote || 'quản lý không nêu lý do') });
      }
      /* Lịch huỷ bị cắt khỏi danh sách của nhân sự (theo ý anh Hùng), nên với họ
       * thông báo này KHÔNG kèm mã bản ghi: bấm vào cũng không mở được gì, chỉ ăn
       * một câu "không thấy việc này" vô nghĩa. Tin đã nói đủ lý do rồi. Quản lý
       * thì vẫn thấy lịch huỷ nên vẫn bấm được. */
      for (const t of cuaToi.filter((x) => x.status === 'Hủy lịch')) {
        them({ id: 'lich:bi-huy:' + t.id, muc: 'can',
          ...(manager ? { rec: t.id } : {}),
          khi: t.start,
          tieuDe: 'Lịch đã bị huỷ',
          mo: ten(t) + ' — ' + (t.mgrNote || t.cancelReason || 'không nêu lý do') +
            (manager ? '' : ' (lịch huỷ không còn trong danh sách của bạn)') });
      }
      /* Quản lý sửa giờ/phương tiện sau khi đã duyệt: người đi cùng đã ghi giờ
       * cũ vào đầu rồi. Mốc sửa nằm trong mã thông báo nên mỗi lần sửa lại là
       * một thông báo mới, chưa đọc. */
      for (const t of cuaToi.filter((x) => x.editedAfter && x.status === 'Duyệt/Chờ tác nghiệp')) {
        them({ id: 'lich:doi-sau-duyet:' + t.id + ':' + t.editedAfter, muc: 'gap', rec: t.id, khi: t.editedAfter,
          tieuDe: 'Lịch đã đổi sau khi duyệt',
          mo: ten(t) + ' — xem lại giờ và phương tiện: ' + gioVN(new Date(t.start)) });
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

  /* Tự kiểm kênh Lark.
   *
   * Chỉ gửi cho CHÍNH người bấm, không gửi cho ai khác — nên bấm bao nhiêu lần
   * cũng không làm ai bị quấy. Trả về nguyên văn kết quả của Lark để đọc là
   * biết thiếu gì: chưa cấp quyền, app chưa bật Bot, hay người nhận ngoài phạm
   * vi khả dụng.
   *
   * Lý do phải có đầu mối này: máy cá nhân gửi bằng app riêng của lark-cli, còn
   * bản trên Render gửi bằng app Marketing Hub — hai app khác nhau, hai bộ
   * quyền khác nhau. Thử ở máy KHÔNG chứng minh được bản Render gửi được. */
  /* Nhận cả GET để anh Hùng chỉ cần bấm một đường dẫn là thử được, khỏi phải
   * mở cửa sổ Phân quyền. Vẫn chỉ quản lý gọi được và vẫn chỉ gửi cho chính
   * người gọi, nên không có gì để lạm dụng. */
  if (p === '/api/thu-tin-lark' && (req.method === 'POST' || req.method === 'GET')) {
    if (!(await requireManager(res))) return;
    const toi = await whoAmI();
    if (!toi || !toi.id) {
      return json(res, { error: 'Không xác định được bạn là ai để gửi thử.' }, 400);
    }
    if (typeof lark.guiTinNhan !== 'function') {
      return json(res, { error: 'Chế độ chạy này chưa có hàm gửi tin.' }, 500);
    }
    const noi = [
      'Thử kênh thông báo — app Lịch tác nghiệp',
      '',
      'Nhận được tin này nghĩa là app gửi được tin nhắn cho nhân sự.',
      'Tin này chỉ gửi cho chính bạn, không gửi cho ai khác.',
      cfg.hubUrl || '',
    ].filter(Boolean).join('\n');
    const kq = await lark.guiTinNhan(toi.id, noi);
    return json(res, {
      ok: kq.ok,
      cheDo: cfg.mode,
      guiTu: cfg.mode === 'api' ? 'app Marketing Hub (tenant token)' : 'app riêng của lark-cli trên máy này',
      nguoiNhan: toi.name || toi.id,
      ly: kq.ly || null,
    });
  }

  /* Cấu hình thông báo — quản lý tự bật tắt, không phải nhờ ai sửa mã.
   * Nguồn dữ liệu là bảng "Cấu hình thông báo" trên Base, nên sửa ở app hay sửa
   * thẳng trong Base đều được, và không mất sau mỗi lần deploy. */
  if (p === '/api/cau-hinh-bao' && req.method === 'GET') {
    if (!(await requireManager(res))) return;
    const ds = await docCauHinhBao(url.searchParams.get('refresh') === '1');
    /* Kèm cả GIẢI THÍCH và XEM TRƯỚC. Màn hình chỉ có công tắc thì quản lý không
     * hiểu được loại tin nào bắn lúc nào, và không biết mình vừa sửa ra cái gì. */
    const nguoc = {};
    for (const [tt, ten] of Object.entries(cfg.cauHinhMap)) nguoc[ten] = tt;
    const mau = {
      title: 'Livestream show Tiên Cá — Vinwonders',
      start: new Date(Date.now() + 2 * 86400000).toISOString(),
      duration: '5', transport: ['Taxi'],
      owner: [{ id: 'x', name: 'Danh Minh Trường' }], staff: [],
    };
    return json(res, {
      items: (ds || []).map((x) => {
        const tt = nguoc[x.suKien];
        const gt = (cfg.giaiThichBao || {})[x.suKien] || {};
        return Object.assign({}, x, {
          trangThai: tt || '',
          banKhi: gt.khi || '',
          khongBan: gt.khong || '',
          mauMacDinh: tt ? mauMacDinh(tt) : '',
          xemTruoc: tt ? soanTinLich(mau, tt, 'Trùng lịch với đoàn khách Hàn — dời sang 03/09', x.mau) : '',
        });
      }),
      docDuoc: !!ds,
      choDien: Object.keys(CHO_DIEN).concat(['lydo', 'link']),
      coHubUrl: !!cfg.hubUrl,
      larkUrl: cfg.larkUrl.replace(/table=[^&]*/, 'table=' + cfg.cauHinhTableId),
    });
  }

  if (p === '/api/cau-hinh-bao' && req.method === 'PATCH') {
    if (!(await requireManager(res))) return;
    const body = await readBody(req);
    if (!body.id) return json(res, { error: 'Thiếu mã dòng cấu hình' }, 400);
    const F2 = cfg.cauHinhFields;
    const cells = {};
    if (typeof body.bat === 'boolean') cells[F2.bat] = body.bat;
    if (body.nguoiNhan) cells[F2.nguoiNhan] = String(body.nguoiNhan);
    // gửi mẫu rỗng = quay về mẫu sẵn, nên phải nhận cả chuỗi trống
    if (body.mau !== undefined) cells[F2.mau] = String(body.mau || '');
    if (!Object.keys(cells).length) return json(res, { error: 'Không có gì để đổi' }, 400);
    await lark.updateRecord(body.id, cells, cfg.cauHinhTableId);
    demCauHinh.at = 0;                       // buộc đọc lại ngay lần sau
    return json(res, { ok: true });
  }

  /* Nhắc người phụ trách một lịch. Chỉ quản lý, và chỉ khi lịch THẬT SỰ đang
   * treo — không cho nhắc bừa một lịch đang bình thường. */
  if (p === '/api/nhac' && req.method === 'POST') {
    if (!(await requireManager(res))) return;
    const body = await readBody(req);
    const rec0 = await findRecord(String(body.id || ''));
    if (!rec0) return json(res, { error: 'Không tìm thấy lịch này' }, 404);
    const item = toItem(rec0);

    const ly = lyDoNhac(item);
    if (!ly) return json(res, { error: 'Lịch này không có gì để nhắc.' }, 400);

    const ai = (item.owner || []).filter((u) => u && u.id);
    if (!ai.length) return json(res, { error: 'Lịch này chưa có người phụ trách để nhắc.' }, 400);

    const truoc = daNhac.get(item.id);
    if (truoc && Date.now() - truoc < CACH_NHAU) {
      const con = Math.ceil((CACH_NHAU - (Date.now() - truoc)) / 3600000);
      return json(res, {
        error: 'Vừa nhắc lịch này rồi — chờ ' + con + ' tiếng nữa hãy nhắc lại.',
        code: 'NHAC_QUA_DAY',
      }, 429);
    }

    const tin = 'Nhắc việc: "' + (item.title || '(chưa đặt tên)') + '"' +
      (item.start ? ' — ' + gioVN(new Date(item.start)) : '') + '\n' +
      ly + (cfg.hubUrl ? '\n' + cfg.hubUrl : '');

    /* Không gửi được thì KHÔNG im lặng báo thành công — quản lý sẽ bấm nhắc mấy
     * lần mà bên kia không nhận gì. Nói thẳng, và chưa tính là đã nhắc. */
    if (typeof lark.guiTinNhan !== 'function') {
      return json(res, { error: 'Bản chạy này chưa nối được kênh gửi tin Lark.' }, 503);
    }
    let gui = 0;
    const hong = [];
    for (const u of ai) {
      try { const kq = await lark.guiTinNhan(u.id, tin); if (kq !== false) gui++; }
      catch (e) { hong.push((u.name || u.id) + ': ' + e.message); }
    }
    if (!gui) {
      return json(res, { error: 'Không gửi được tin Lark. ' + (hong[0] || ''),
        code: 'KHONG_GUI_DUOC' }, 502);
    }
    daNhac.set(item.id, Date.now());
    return json(res, { ok: true, nguoi: ai.map((u) => u.name), vi: ly, gui });
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

    /* CỬA SỔ ĐĂNG KÝ — chốt ở đây, không chỉ khoá nút.
     *
     * Chỉ chặn khi lịch đi thẳng vào hàng đợi duyệt. NHÁP thì cho tạo bất cứ
     * lúc nào: nhân sự soạn sẵn trong tuần rồi tới khung giờ bấm Gửi duyệt là
     * nếp tốt hơn, mà vẫn gọn cho quản lý vì hàng đợi chỉ đầy lên trong khung.
     * Chặn cả nháp thì chỉ đẩy người ta đi ghi ra chỗ khác.
     *
     * Quản lý không bị chặn: họ là người xếp việc, phải thêm được bất cứ lúc nào.
     */
    if (!manager) {
      const dinhGui = !body.status || body.status === 'Chờ duyệt/Xử lý';
      if (dinhGui) {
        const cs = await trangThaiCuaSo();
        if (!cs.mo) {
          return json(res, {
            error: 'Ngoài khung giờ đăng ký. Mở lại ' + cuaSo.noiMoc(cs.moLuc) +
              '. Cần đi gấp thì nói trực tiếp với quản lý.',
            code: 'DANG_KY_DONG',
            moLuc: cs.moLuc || 0,
          }, 403);
        }
      }
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
      /* Người đăng ký chính là phụ trách chuyến đó (vài dòng dưới gán owner),
       * nên tiền của chuyến này là tiền họ khai — không chặn. Quyền "xem chi
       * phí" là để xem tiền của cả phòng, không phải để cấm khai tiền của mình. */
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
        /* Quyền "xem chi phí" là để xem tiền của CẢ PHÒNG. Tiền của chuyến do
         * chính mình phụ trách thì luôn khai được — dự kiến lúc đăng ký, thực
         * tế lúc báo cáo. Chặn chỗ này thì báo cáo không bao giờ đủ, mà cũng
         * chẳng giấu được ai điều gì. */
        const toiTien = await whoAmI();
        if (!(toiTien && laPhuTrach(item, toiTien.id))) {
          COT_TIEN.forEach((k) => { delete body[k]; });
        }
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

        /* Gửi duyệt = ĐĂNG KÝ. Đây là cửa thật của cơ chế khung giờ: nháp soạn
         * lúc nào cũng được, nhưng đẩy vào hàng đợi của quản lý thì phải đúng
         * khung — nếu không thì cả tuần vẫn có lịch mới rơi vào hàng đợi. */
        if (body.status === 'Chờ duyệt/Xử lý' && item.status !== 'Chờ duyệt/Xử lý') {
          const cs = await trangThaiCuaSo();
          if (!cs.mo) {
            return json(res, {
              error: 'Ngoài khung giờ đăng ký. Mở lại ' + cuaSo.noiMoc(cs.moLuc) +
                '. Lịch vẫn giữ ở bản nháp, tới khung giờ bấm Gửi duyệt là được.',
              code: 'DANG_KY_DONG',
              moLuc: cs.moLuc || 0,
            }, 403);
          }
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
        const ld = String((body.cancelReason != null ? body.cancelReason : item.cancelReason) || '').trim();
        if (!ld) {
          return json(res, { error: 'Phải ghi lý do huỷ.', code: 'CANCEL_REASON_REQUIRED' }, 400);
        }

        /* Lịch ĐÃ DUYỆT: hai cửa hẹp hơn, và cả hai phải chốt ở đây. Giao diện
         * chỉ hiện nút khi tới mốc, nhưng nút ẩn không phải là luật — gọi thẳng
         * API vẫn phải bị chặn. */
        if (!manager && item.status === cfg.lateCancel.status) {
          const moc = mocHuyMuon(item);
          if (!moc) {
            return json(res, {
              error: 'Lịch này chưa có ngày đi nên chưa tính được mốc xin huỷ. Báo quản lý.',
              code: 'CANCEL_NO_DATE',
            }, 400);
          }
          if (Date.now() < moc) {
            return json(res, {
              error: 'Lịch đã duyệt thì chỉ xin huỷ được từ ' + gioVN(new Date(moc)) +
                ' (36 tiếng tính từ đầu ngày đi). Trước mốc đó, đi được thì đi rồi ' +
                'báo cáo; có việc gấp thì nói trực tiếp với quản lý.',
              code: 'CANCEL_TOO_EARLY',
              moHoiLuc: new Date(moc).toISOString(),
            }, 403);
          }
          /* Huỷ một lịch đã duyệt là huỷ cả vé, cả hẹn với đối tác. Quản lý
           * đọc "không đi được" thì không quyết được gì, nên bắt viết thật. */
          if (ld.length < cfg.lateCancel.minReason) {
            return json(res, {
              error: 'Lịch đã duyệt, đã xin vé và đã hẹn đối tác — lý do phải nói rõ ' +
                'vì sao bất khả kháng (ít nhất ' + cfg.lateCancel.minReason + ' ký tự).',
              code: 'CANCEL_REASON_SHORT',
            }, 400);
          }
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

      /* Quản lý sửa nội dung của lịch ĐÃ DUYỆT: đóng dấu mốc để báo lại cho
       * người đi cùng — họ đã ghi giờ cũ vào đầu rồi. Chỉ tính khi động vào
       * những thứ ảnh hưởng chuyến đi; sửa ghi chú thì không cần réo cả nhóm. */
      const ANH_HUONG = ['start', 'end', 'duration', 'transport', 'plan', 'title'];
      if (manager && item.status === 'Duyệt/Chờ tác nghiệp' &&
          Object.keys(body).some((k) => ANH_HUONG.includes(k))) {
        body.editedAfter = new Date().toISOString();
      }

      const cells = toCells(body);
      if (!Object.keys(cells).length) return json(res, { error: 'Không có trường nào để cập nhật' }, 400);
      await lark.updateRecord(id, cells);
      if (cache.records) {
        const rec = cache.records.find((r) => r.record_id === id);
        if (rec) applyLocal(rec, body);
      }

      /* Ghi xong mới báo, và KHÔNG chờ gửi xong mới trả lời: người bấm nút
       * không việc gì phải ngồi đợi Lark. Chỉ báo khi trạng thái THỰC SỰ đổi,
       * không thì lưu lại một ô ghi chú cũng réo cả nhóm. */
      if (body.status && body.status !== item.status) {
        baoVaoLark(item, body.status, body.mgrNote || item.mgrNote || '')
          .catch((e) => console.warn('[báo Lark]', e.message));
      }

      /* Đánh dấu đã thanh toán => tạo đơn chi phí bên Tourwell. Chỉ khi trạng
       * thái thanh toán THỰC SỰ đổi sang "Đã thanh toán": lưu lại một ô ghi chú
       * của lịch đã thanh toán từ tháng trước không được đẻ thêm đơn.
       *
       * Cố ý CHỜ xong mới trả lời (khoảng 3 giây) thay vì chạy ngầm: người bấm
       * cần nhận ngay mã đơn và danh sách việc còn phải làm tay. Chạy ngầm thì
       * họ đóng máy mất, không ai biết đơn đã tạo hay chưa. */
      let tw;
      let sq;
      if (body.payment === 'Đã thanh toán' && item.payment !== 'Đã thanh toán') {
        tw = await taoDonTourwell(id, { ...item, ...body });
        if (tw && tw.loi) console.warn('[Tourwell]', tw.loi);

        /* Rồi ghi tiếp một dòng vào SỔ QUỸ. Hai việc độc lập: Tourwell hỏng thì
         * sổ quỹ vẫn phải có dòng chi, vì đó là chỗ theo dõi tiền còn lại. */
        sq = await ghiSoQuy(id, { ...item, ...body }, tw && tw.ma);
        if (sq && sq.loi) console.warn('[sổ quỹ]', sq.loi);
      }

      return json(res, { ok: true, tourwell: tw, soQuy: sq });
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
  module.exports = { khoaKeHoach, duMinhChung, anLichHuy, laPhuTrach, ownedBy, duBaoCao, boChiPhi, isBlank,
    soanTinLich, nguoiNhanTin, docCauHinhBao, luatBao };
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
