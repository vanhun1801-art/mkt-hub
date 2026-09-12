'use strict';
/*
 * Backend gọi thẳng Lark Open API bằng tenant_access_token của app.
 * Dùng khi deploy lên server chung (Render…) — ở đó không có phiên lark-cli của
 * từng người như khi chạy trên máy cá nhân.
 *
 * CÙNG CHỮ KÝ HÀM với lark.js để server.js không phải biết đang chạy backend nào:
 * chỉ cần `const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark')`.
 * Endpoint lấy từ bản `api` của app Bảng công việc (đã chạy thật trên Render).
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const HOST = process.env.LARK_API_HOST || 'https://open.larksuite.com';
const APP_ID = process.env.LARK_APP_ID || '';
const APP_SECRET = process.env.LARK_APP_SECRET || '';

/* ---------------- tenant_access_token ---------------- */
let tokenCache = { value: null, exp: 0 };

async function tenantToken() {
  if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;
  if (!APP_ID || !APP_SECRET) throw new Error('Thiếu LARK_APP_ID / LARK_APP_SECRET');

  const r = await fetch(HOST + '/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const d = await r.json();
  if (d.code !== 0) throw new Error('Lấy tenant_access_token thất bại: ' + (d.msg || d.code));
  tokenCache = {
    value: d.tenant_access_token,
    exp: Date.now() + Math.max(60, (d.expire || 7200) - 300) * 1000,   // trừ hao 5 phút
  };
  return tokenCache.value;
}

/* ---------------- gọi API (có thử lại) ---------------- */
const TRANSIENT = [1254291, 1254036, 99991400, 99991661];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, opts = {}) {
  const tries = opts.retries == null ? 3 : opts.retries;
  let cuoi;
  for (let i = 0; i < tries; i++) {
    try {
      return await callOnce(method, url, opts);
    } catch (e) {
      cuoi = e;
      const nen = e.transient ||
        /timeout|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(e.message);
      if (i === tries - 1 || !nen) throw e;
      await wait(400 * Math.pow(2, i));
    }
  }
  throw cuoi;
}

async function callOnce(method, url, { body, raw } = {}) {
  const token = await tenantToken();
  const r = await fetch(HOST + url, {
    method,
    headers: Object.assign(
      { Authorization: 'Bearer ' + token },
      body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}
    ),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (raw) {
    if (!r.ok) {
      const e = new Error('HTTP ' + r.status + ' khi tải tệp');
      e.transient = r.status === 429 || r.status >= 500;
      throw e;
    }
    return Buffer.from(await r.arrayBuffer());
  }

  const d = await r.json();
  if (d.code !== 0) {
    const e = new Error('Lark API ' + d.code + ': ' + (d.msg || 'lỗi không rõ'));
    e.code = d.code;
    e.transient = TRANSIENT.includes(d.code) || r.status === 429 || r.status >= 500;
    throw e;
  }
  return d.data || {};
}

/* `base` mặc định là Base của app; truyền khác đi để ghi sang Base "Chi phí
 * Marketing" — cùng lý do với baseArgs() bên lark.js. */
const baseUrl = (tableId, base) =>
  '/open-apis/base/v3/bases/' + (base || cfg.baseToken) + '/tables/' + tableId;

/* ---------------- Base -> bản ghi ---------------- */
function columnsToRecords(data) {
  const fieldIds = data.field_id_list || [];
  const ids = data.record_id_list || [];
  const rows = data.data || [];
  return rows.map((row, i) => {
    const cells = {};
    fieldIds.forEach((fid, j) => { cells[fid] = row[j]; });
    return { record_id: ids[i], cells };
  });
}

/* ---------------- các thao tác (cùng chữ ký với lark.js) ---------------- */
async function listAllRecords(tableId = cfg.tableId, base) {
  const out = [];
  let offset = 0;
  for (let trang = 0; trang < 30; trang++) {
    const d = await call('GET', baseUrl(tableId, base) + '/records?limit=200&offset=' + offset);
    out.push(...columnsToRecords(d));
    if (!d.has_more) break;
    offset += 200;
  }
  return out;
}

/**
 * Lấy MỘT bản ghi theo id.
 *
 * Trước đây hàm này chỉ đọc trang đầu (200 bản ghi) rồi tìm trong đó — bảng vượt
 * 200 dòng là mọi bản ghi nằm sau đó "không tìm thấy", mà bản ghi MỚI TẠO luôn
 * nằm cuối bảng. Hậu quả: vừa đăng ký lịch xong là không duyệt/sửa được.
 * Nay lật hết các trang cho tới khi gặp, hoặc hết bảng.
 */
async function getRecord(recordId, tableId = cfg.tableId) {
  let offset = 0;
  for (let trang = 0; trang < 30; trang++) {
    const d = await call('GET', baseUrl(tableId) + '/records?limit=200&offset=' + offset);
    const ds = columnsToRecords(d);
    const thay = ds.find((r) => r.record_id === recordId);
    if (thay) return thay;
    if (!d.has_more) break;
    offset += 200;
  }
  return null;
}

async function listFields(tableId = cfg.tableId, base) {
  const d = await call('GET', baseUrl(tableId, base) + '/fields?limit=100&offset=0');
  return d.fields || d.items || [];
}

async function updateRecord(recordId, fields, tableId = cfg.tableId) {
  return call('POST', baseUrl(tableId) + '/records/batch_update', {
    body: { update_records: { [recordId]: fields } },
  });
}

async function updateMany(map, tableId = cfg.tableId) {
  return call('POST', baseUrl(tableId) + '/records/batch_update', { body: { update_records: map } });
}

async function createRecord(fields, tableId = cfg.tableId, base) {
  const names = Object.keys(fields);
  return call('POST', baseUrl(tableId, base) + '/records/batch_create', {
    body: { fields: names, rows: [names.map((n) => fields[n])] },
  });
}

async function deleteRecords(recordIds, tableId = cfg.tableId, base) {
  return call('POST', baseUrl(tableId, base) + '/records/batch_delete', {
    body: { record_id_list: recordIds },
  });
}

/* ---------------- đính kèm ---------------- */
/* Lark từ chối vì app chưa được cấp scope tệp thì câu trả về là một danh sách
 * scope tiếng Anh dài — nhân sự đọc không hiểu gì. Đổi thành câu nói rõ phải làm gì. */
const thieuQuyenTep = (msg) => /Access denied/i.test(String(msg || '')) &&
  /scopes? (is|are) required/i.test(String(msg || ''));

function loiThieuQuyen(viec) {
  const e = new Error('App Lark chưa được cấp quyền tệp nên không ' + viec + ' được từ đây. ' +
    'Quản lý cần mở Developer Console, thêm scope drive:drive (hoặc cặp ' +
    'drive:drive:readonly + docs:document.media:upload) rồi phát hành phiên bản mới. ' +
    'Trong lúc chờ, mở bản ghi trong Base để xem/đính tệp trực tiếp.');
  e.code = 'MISSING_SCOPE';
  e.http = 424;
  return e;
}

/**
 * Tải đính kèm của Base ở chế độ api (danh tính app).
 *
 * Tệp của Base KHÔNG tải được bằng đường drive thông thường: gọi
 * /drive/v1/medias/<token>/download mà thiếu `extra` đúng thì Lark trả 400.
 * Nên thử lần lượt:
 *   1. get_attachments có trả URL tạm (url / tmp_url / download_url) -> tải luôn URL đó
 *   2. có `extra` -> truyền đúng nguyên văn
 *   3. tự dựng extra {"bitablePerm":{"tableId":...}} — dạng Lark đòi cho tệp Base
 * Hỏng cả ba thì báo lỗi KÈM tên các khoá mà API trả về, để lần sau khỏi mò.
 *
 * KHOÁ TÊN LÀ `extra_info`, KHÔNG PHẢI `extra` — đo được từ bản online: các khoá
 * get_attachments trả về là extra_info, file_token, name, size. Bản trước chỉ đọc
 * `o.extra` nên luôn ra null, gọi download không kèm extra và Lark từ chối. Ở máy
 * anh Hùng không lộ vì chạy chế độ cli (token người dùng), chỉ hỏng trên Render —
 * đúng cảnh "ấn vào tệp không xem được, không tải được" ngày 12/09/2026.
 */
async function downloadAttachmentBuffer(recordId, fileToken, tableId = cfg.tableId, base) {
  const meta = await call('POST', baseUrl(tableId, base) + '/get_attachments', {
    body: { record_id_list: [recordId] },
  });

  let o = null;
  const duyet = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) return x.forEach(duyet);
    if (x.file_token === fileToken) o = x;
    Object.values(x).forEach(duyet);
  };
  duyet(meta);

  const name = (o && o.name) || null;
  const cach = [];

  // 1. URL tạm sẵn có
  const url = o && (o.url || o.tmp_url || o.tmp_download_url || o.download_url);
  if (url) {
    cach.push('url-tam');
    try {
      const r = await fetch(url);
      if (r.ok) return { buffer: Buffer.from(await r.arrayBuffer()), name };
    } catch (_) { /* thử cách sau */ }
  }

  const duong = (extra) => '/open-apis/drive/v1/medias/' + encodeURIComponent(fileToken) + '/download' +
    (extra ? '?extra=' + encodeURIComponent(typeof extra === 'string' ? extra : JSON.stringify(extra)) : '');

  // 2. extra nguyên văn do API trả
  const extra = (o && (o.extra_info || o.extra)) || null;
  if (extra) {
    cach.push('extra-tra-ve');
    try { return { buffer: await call('GET', duong(extra), { raw: true }), name }; }
    catch (_) { /* thử cách sau */ }
  }

  // 3. tự dựng extra cho tệp Base
  cach.push('extra-tu-dung');
  try {
    const tuDung = { bitablePerm: { tableId, rev: (o && o.rev) || undefined } };
    return { buffer: await call('GET', duong(tuDung), { raw: true }), name };
  } catch (e) {
    if (thieuQuyenTep(e.message)) throw loiThieuQuyen('xem/tải tệp');
    const khoa = o ? Object.keys(o).join(',') : '(khong thay file_token trong get_attachments)';
    const err = new Error('Không tải được tệp từ Base. Đã thử: ' + cach.join(' -> ') +
      '. API trả về các khoá: ' + khoa + '. Lỗi cuối: ' + e.message);
    err.http = 502;
    throw err;
  }
}

/** Giữ cùng chữ ký với lark.js: ghi ra thư mục tạm rồi trả về đường dẫn thư mục. */
async function downloadAttachment(recordId, fileToken, relDirName, tableId = cfg.tableId, base) {
  const absDir = path.join(__dirname, '.tmp', relDirName);
  fs.mkdirSync(absDir, { recursive: true });
  const { buffer, name } = await downloadAttachmentBuffer(recordId, fileToken, tableId, base);
  const ten = String(name || fileToken).replace(/[\\/:*?"<>|]/g, '_').slice(-120);
  fs.writeFileSync(path.join(absDir, ten), buffer);
  return absDir;
}

async function uploadAttachment(recordId, fieldName, relFilePath, tableId = cfg.tableId, base) {
  const abs = path.resolve(__dirname, relFilePath);
  const buf = fs.readFileSync(abs);
  const fileName = path.basename(abs);

  const fd = new FormData();
  fd.append('file', new Blob([buf]), fileName);
  fd.append('file_name', fileName);
  fd.append('parent_type', 'bitable_file');
  fd.append('parent_node', base || cfg.baseToken);
  fd.append('size', String(buf.length));

  const token = await tenantToken();
  const r = await fetch(HOST + '/open-apis/drive/v1/medias/upload_all', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd,
  });
  const d = await r.json();
  if (d.code !== 0) throw new Error('Upload thất bại: ' + (d.msg || d.code));

  return call('POST', baseUrl(tableId, base) + '/append_attachments', {
    body: { attachments: { [recordId]: { [fieldName]: [{ file_token: d.data.file_token }] } } },
  });
}

/** Chế độ api không có "người đang đăng nhập" — danh tính đến từ phiên đăng nhập. */
async function whoami() { return null; }

/** Cho server.js gọi khi cần biết mình đang chạy backend nào. */
const cli = async () => { throw new Error('Chế độ api không dùng lark-cli'); };

/**
 * Gửi tin nhắn Lark tới một người.
 *
 * Cần quyền im:message:send_as_bot trên Developer Console; chưa cấp thì Lark
 * trả mã 99991672 và hàm này im lặng báo false. Cố ý KHÔNG ném lỗi: gửi tin
 * nhắn là việc phụ, không được làm hỏng thao tác chính của người dùng.
 *
 * @returns {Promise<{ok: boolean, ly?: string}>}
 */
async function guiTinNhan(openId, noiDung) {
  if (!openId || !noiDung) return { ok: false, ly: 'thiếu người nhận hoặc nội dung' };
  try {
    await call('POST', '/open-apis/im/v1/messages?receive_id_type=open_id', {
      body: {
        receive_id: openId,
        msg_type: 'text',
        content: JSON.stringify({ text: noiDung }),
      },
      retries: 1,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ly: e.message };
  }
}

module.exports = {
  guiTinNhan,
  cli, whoami, listAllRecords, listFields, getRecord,
  updateRecord, updateMany, createRecord, deleteRecords,
  downloadAttachment, uploadAttachment,
  tenantToken, call,
};
