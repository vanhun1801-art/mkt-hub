'use strict';
/*
 * Backend gọi thẳng Lark Open API bằng tenant_access_token của app.
 * Dùng khi deploy lên server chung (không có lark-cli của từng người).
 *
 * Cùng chữ ký hàm với lark.js để server.js không phải biết đang chạy backend nào.
 * Các endpoint dưới đây lấy từ `lark-cli ... --dry-run`, không phải đoán.
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
    // trừ hao 5 phút cho chắc
    exp: Date.now() + Math.max(60, (d.expire || 7200) - 300) * 1000,
  };
  return tokenCache.value;
}

/* ---------------- gọi API ---------------- */
const TRANSIENT_CODES = [1254291, 1254036, 99991400, 99991661];

function isTransient(code, status) {
  return TRANSIENT_CODES.includes(code) || status === 429 || (status >= 500 && status < 600);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, opts = {}) {
  const tries = opts.retries == null ? 3 : opts.retries;
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await callOnce(method, url, opts);
    } catch (e) {
      last = e;
      const nen = e.transient || /timeout|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(e.message);
      if (i === tries - 1 || !nen) throw e;
      await wait(400 * Math.pow(2, i));
    }
  }
  throw last;
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
      // giữ nguyên câu Lark trả về, không thì chỉ còn con số vô nghĩa khi đi soi lỗi
      const chi = await r.text().catch(() => '');
      const e = new Error('HTTP ' + r.status + ' khi tải tệp' +
        (chi ? ' — ' + chi.replace(/\s+/g, ' ').slice(0, 220) : ''));
      e.transient = isTransient(0, r.status);
      throw e;
    }
    return Buffer.from(await r.arrayBuffer());
  }

  const d = await r.json().catch(() => ({ code: -1, msg: 'Phản hồi không phải JSON' }));
  if (d.code !== 0) {
    const e = new Error('Lark API ' + d.code + ': ' + (d.msg || 'lỗi không rõ'));
    e.code = d.code;
    e.transient = isTransient(d.code, r.status);
    throw e;
  }
  return d.data;
}

const baseUrl = (tableId) =>
  '/open-apis/base/v3/bases/' + cfg.baseToken + '/tables/' + tableId;

/* ---------------- các thao tác (cùng chữ ký với lark.js) ---------------- */

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

async function listAllRecords(tableId = cfg.tableId) {
  const out = [];
  let offset = 0;
  for (let page = 0; page < 30; page++) {
    const d = await call('GET', baseUrl(tableId) + '/records?limit=200&offset=' + offset);
    out.push(...columnsToRecords(d));
    if (!d.has_more) break;
    offset += 200;
  }
  return out;
}

async function listFields(tableId = cfg.tableId) {
  const d = await call('GET', baseUrl(tableId) + '/fields?limit=100&offset=0');
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

async function createRecord(fields, tableId = cfg.tableId) {
  const names = Object.keys(fields);
  return call('POST', baseUrl(tableId) + '/records/batch_create', {
    body: { fields: names, rows: [names.map((n) => fields[n])] },
  });
}

async function deleteRecords(recordIds, tableId = cfg.tableId) {
  return call('POST', baseUrl(tableId) + '/records/batch_delete', {
    body: { record_id_list: recordIds },
  });
}

/**
 * Tải đính kèm của Base ở chế độ api (danh tính app).
 *
 * Tệp của Base KHÔNG tải được bằng đường drive thông thường — tài liệu lark-cli nói
 * thẳng: "Base 附件必须用这个命令下载" (phải dùng đúng lệnh của Base). Với app token,
 * gọi /drive/v1/medias/<token>/download mà thiếu `extra` đúng thì Lark trả 400.
 * Nên thử lần lượt:
 *   1. get_attachments có trả URL tạm (url / tmp_url / download_url) -> tải luôn URL đó
 *   2. có `extra` -> truyền đúng nguyên văn
 *   3. tự dựng extra {"bitablePerm":{"tableId":…}} — dạng Lark đòi cho tệp Base
 * Hỏng cả ba thì báo lỗi KÈM tên các khoá mà API trả về, để lần sau khỏi mò.
 */
async function downloadAttachmentBuffer(recordId, fileToken, tableId = cfg.tableId) {
  const meta = await call('POST', baseUrl(tableId) + '/get_attachments', {
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

  // 2. extra nguyên văn do API trả
  const duong = (extra) => '/open-apis/drive/v1/medias/' + encodeURIComponent(fileToken) + '/download' +
    (extra ? '?extra=' + encodeURIComponent(typeof extra === 'string' ? extra : JSON.stringify(extra)) : '');

  if (o && o.extra) {
    cach.push('extra-tra-ve');
    try { return { buffer: await call('GET', duong(o.extra), { raw: true }), name }; }
    catch (_) { /* thử cách sau */ }
  }

  // 3. tự dựng extra cho tệp Base
  cach.push('extra-tu-dung');
  try {
    const tuDung = { bitablePerm: { tableId, rev: (o && o.rev) || undefined } };
    return { buffer: await call('GET', duong(tuDung), { raw: true }), name };
  } catch (e) {
    const khoa = o ? Object.keys(o).join(',') : '(khong thay file_token trong get_attachments)';
    const err = new Error('Không tải được tệp từ Base. Đã thử: ' + cach.join(' -> ') +
      '. API trả về các khoá: ' + khoa + '. Lỗi cuối: ' + e.message);
    err.http = 502;
    throw err;
  }
}

/** Giữ cùng chữ ký với lark.js: ghi ra thư mục rồi trả về đường dẫn. */
async function downloadAttachment(recordId, fileToken, relDirName, tableId = cfg.tableId) {
  const absDir = path.join(__dirname, '.tmp', relDirName);
  fs.mkdirSync(absDir, { recursive: true });
  const { buffer, name } = await downloadAttachmentBuffer(recordId, fileToken, tableId);
  const safe = String(name || fileToken).replace(/[\\/:*?"<>|]/g, '_').slice(-120);
  fs.writeFileSync(path.join(absDir, safe), buffer);
  return absDir;
}

async function uploadAttachment(recordId, fieldName, relFilePath, tableId = cfg.tableId) {
  const abs = path.resolve(__dirname, relFilePath);
  const buf = fs.readFileSync(abs);
  const fileName = path.basename(abs);

  const fd = new FormData();
  fd.append('file', new Blob([buf]), fileName);
  fd.append('file_name', fileName);
  fd.append('parent_type', 'bitable_file');
  fd.append('parent_node', cfg.baseToken);
  fd.append('size', String(buf.length));

  const token = await tenantToken();
  const r = await fetch(HOST + '/open-apis/drive/v1/medias/upload_all', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd,
  });
  const d = await r.json();
  if (d.code !== 0) throw new Error('Upload thất bại: ' + (d.msg || d.code));

  return call('POST', baseUrl(tableId) + '/append_attachments', {
    body: { attachments: { [recordId]: { [fieldName]: [{ file_token: d.data.file_token }] } } },
  });
}

/** Gỡ tệp khỏi ô đính kèm. */
async function removeAttachment(recordId, fieldName, fileToken, tableId = cfg.tableId) {
  return call('POST', baseUrl(tableId) + '/remove_attachments', {
    body: { attachments: { [recordId]: { [fieldName]: [{ file_token: fileToken }] } } },
  });
}

/** Gửi tin nhắn Lark cho một người. Trả false nếu chưa đủ quyền. */
async function sendMessage(openId, text) {
  try {
    await call('POST', '/open-apis/im/v1/messages?receive_id_type=open_id', {
      body: { receive_id: openId, msg_type: 'text', content: JSON.stringify({ text }) },
      retries: 1,
    });
    return true;
  } catch (e) {
    return false;
  }
}

/** Backend API không có "người đang đăng nhập" — danh tính lấy từ phiên OAuth. */
async function whoami() { return null; }

/**
 * Những người app được phép phục vụ — chính là phạm vi khả dụng khai trong
 * Developer Console. Trả [] nếu không đọc được (khi đó UI dùng danh bạ từ Base).
 */
async function scopeUsers() {
  const userIds = [];
  const deptIds = [];
  let token = '';

  for (let i = 0; i < 10; i++) {
    const q = '?user_id_type=open_id&department_id_type=open_department_id&page_size=100' +
      (token ? '&page_token=' + encodeURIComponent(token) : '');
    const d = await call('GET', '/open-apis/contact/v3/scopes' + q);
    userIds.push(...(d.user_ids || []));
    deptIds.push(...(d.department_ids || []));
    if (!d.has_more || !d.page_token) break;
    token = d.page_token;
  }

  const ra = new Map();

  // Cấp theo phòng ban: mở rộng ra từng thành viên (gồm cả phòng con)
  for (const dep of deptIds) {
    let pt = '';
    for (let i = 0; i < 20; i++) {
      const q = '?department_id=' + encodeURIComponent(dep) +
        '&department_id_type=open_department_id&user_id_type=open_id&page_size=50' +
        (pt ? '&page_token=' + encodeURIComponent(pt) : '');
      let d;
      try {
        d = await call('GET', '/open-apis/contact/v3/users/find_by_department' + q);
      } catch (_) { break; }
      for (const u of d.items || []) {
        // giữ cả email: open_id khác nhau giữa các app Lark nên email mới là khoá chắc
        if (u.open_id) ra.set(u.open_id, { ten: u.name || u.en_name || u.open_id, email: u.enterprise_email || u.email || '' });
      }
      if (!d.has_more || !d.page_token) break;
      pt = d.page_token;
    }
  }

  // Cấp cho từng người
  for (const id of userIds) {
    if (ra.has(id)) continue;
    try {
      const d = await call('GET', '/open-apis/contact/v3/users/' + encodeURIComponent(id) + '?user_id_type=open_id');
      const u = d.user || {};
      ra.set(id, { ten: u.name || u.en_name || id, email: u.enterprise_email || u.email || '' });
    } catch (_) {
      ra.set(id, { ten: id, email: '' });
    }
  }

  return [...ra.entries()]
    .map(([id, x]) => ({ id, name: x.ten, email: x.email || '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

module.exports = {
  tenantToken, call, whoami, scopeUsers, removeAttachment, sendMessage,
  listAllRecords, listFields,
  updateRecord, updateMany, createRecord, deleteRecords,
  downloadAttachment, downloadAttachmentBuffer, uploadAttachment,
};
