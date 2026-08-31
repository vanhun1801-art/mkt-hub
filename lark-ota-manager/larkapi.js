'use strict';
/**
 * Backend gọi thẳng Lark Open API bằng tenant_access_token của app — dùng khi
 * deploy server chung (Render), nơi không có phiên lark-cli của từng người.
 *
 * CÙNG CHỮ KÝ HÀM với lark.js. Endpoint lấy từ bản `api` đã chạy thật của app
 * Bảng công việc / Lịch tác nghiệp (/records, /fields), riêng /tables chỉ dùng
 * để dò table ID nên gọi trong try-catch — hỏng thì khai OTA_TABLE_ID là xong.
 */
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
    exp: Date.now() + Math.max(60, (d.expire || 7200) - 300) * 1000,
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
    try { return await callOnce(method, url, opts); }
    catch (e) {
      cuoi = e;
      const nen = e.transient ||
        /timeout|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(e.message);
      if (i === tries - 1 || !nen) throw e;
      await wait(400 * Math.pow(2, i));
    }
  }
  throw cuoi;
}

async function callOnce(method, url, { body } = {}) {
  const token = await tenantToken();
  const r = await fetch(HOST + url, {
    method,
    headers: Object.assign(
      { Authorization: 'Bearer ' + token },
      body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}
    ),
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (d.code !== 0) {
    /* 91403 trên base người khác dựng gần như luôn là: app đã được thêm vào base
     * nhưng chỉ ở mức "Có thể xem". Nói thẳng việc phải làm thay vì in mã lỗi. */
    if (d.code === 91403) {
      const e = new Error('Ứng dụng Lark KHÔNG có quyền sửa base này (chỉ xem được). ' +
        'Mở base → Chia sẻ → thêm ứng dụng với quyền "Có thể chỉnh sửa", rồi bấm ' +
        'Đẩy hàng đợi vào Base — booking đang chờ trong hàng đợi không mất.');
      e.code = d.code;
      throw e;
    }
    const e = new Error('Lark API ' + d.code + ': ' + (d.msg || 'lỗi không rõ'));
    e.code = d.code;
    e.transient = TRANSIENT.includes(d.code) || r.status === 429 || r.status >= 500;
    throw e;
  }
  return d.data || {};
}

const basesUrl = () => '/open-apis/base/v3/bases/' + cfg.baseToken;
const baseUrl = (tableId) => basesUrl() + '/tables/' + tableId;

/* ---------------- Base -> bản ghi ---------------- */
function columnsToRecords(data) {
  const fieldIds = data.field_id_list || [];
  const ids = data.record_id_list || [];
  const rows = data.data || [];
  /* Phải trả ĐÚNG hình dạng của lark.js: { id, c } — store.js đọc r.c[fieldId]. */
  return rows.map((row, i) => {
    const c = {};
    fieldIds.forEach((fid, j) => { c[fid] = row[j]; });
    return { id: ids[i], c };
  });
}

/* ---------------- các thao tác ---------------- */
async function listAll(tableId) {
  const out = [];
  let offset = 0;
  for (let trang = 0; trang < 60; trang++) {
    const d = await call('GET', baseUrl(tableId) + '/records?limit=200&offset=' + offset);
    out.push(...columnsToRecords(d));
    if (!d.has_more) break;
    offset += 200;
  }
  return out;
}

async function listTables(opts = {}) {
  const d = await call('GET', basesUrl() + '/tables?limit=100&offset=0', opts);
  const ds = d.tables || d.items || [];
  return ds.map((t) => ({
    id: t.table_id || t.id || '',
    name: String(t.name || t.table_name || ''),
  })).filter((t) => t.id);
}

async function listFields(tableId, opts = {}) {
  const d = await call('GET', baseUrl(tableId) + '/fields?limit=100&offset=0', opts);
  const ds = d.fields || d.items || [];
  return ds.map((f) => ({
    id: f.field_id || f.id || '',
    name: String(f.field_name || f.name || ''),
    type: f.type || f.ui_type || '',
  })).filter((f) => f.id);
}

async function createRecord(tableId, fields) {
  const names = Object.keys(fields);
  const d = await call('POST', baseUrl(tableId) + '/records/batch_create', {
    body: { fields: names, rows: [names.map((n) => fields[n])] },
  });
  return (d.record_id_list || [])[0] || null;
}

async function createMany(tableId, rowsObj) {
  if (!rowsObj.length) return [];
  const names = [...new Set(rowsObj.flatMap((r) => Object.keys(r)))];
  const out = [];
  for (let i = 0; i < rowsObj.length; i += 200) {
    const lo = rowsObj.slice(i, i + 200);
    const d = await call('POST', baseUrl(tableId) + '/records/batch_create', {
      body: { fields: names, rows: lo.map((r) => names.map((n) => (n in r ? r[n] : null))) },
    });
    out.push(...(d.record_id_list || []));
  }
  return out;
}

async function updateRecord(tableId, recordId, fields) {
  return call('POST', baseUrl(tableId) + '/records/batch_update', {
    body: { update_records: { [recordId]: fields } },
  });
}

async function updateMany(tableId, map) {
  const ids = Object.keys(map);
  let xong = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const lo = ids.slice(i, i + 200);
    const update_records = {};
    lo.forEach((id) => { update_records[id] = map[id]; });
    await call('POST', baseUrl(tableId) + '/records/batch_update', { body: { update_records } });
    xong += lo.length;
  }
  return xong;
}

async function deleteRecords(tableId, recordIds) {
  return call('POST', baseUrl(tableId) + '/records/batch_delete', {
    body: { record_id_list: recordIds },
  });
}

/** Chế độ api không có "người đang đăng nhập" — danh tính đến từ lớp vỏ. */
async function whoami() { return null; }
const cli = async () => { throw new Error('Chế độ api không dùng lark-cli'); };

module.exports = {
  cli, whoami, listAll, listTables, listFields,
  createRecord, createMany, updateRecord, updateMany, deleteRecords,
  tenantToken, call,
};
