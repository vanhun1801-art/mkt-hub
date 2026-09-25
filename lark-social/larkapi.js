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

/* LỖI QUÁ NHỊP PHẢI CHỜ KHÁC, VÀ PHẢI CHỜ LỆCH NHAU.
 *
 * 99991400 "request trigger frequency limit" không giống mấy lỗi chập chờn
 * khác: Lark tính hạn mức theo APP, mà cả phòng chỉ còn MỘT app Lark dùng
 * chung cho mười hai app con. Nên hạn mức ấy là của chung: vài app con cùng nạp
 * Base một lúc là đủ vượt, chứ không app nào gọi quá tay cả. Ngày 25/09 lúc
 * 11:21 hai app Lịch tác nghiệp và KOL cùng báo lỗi trong cùng một phút.
 *
 * Hai chỗ phải sửa:
 *   · Chờ LÂU HƠN. Hạn mức tính theo giây, mà 400ms rồi 800ms là chưa qua hết
 *     cửa sổ đã thử lại — ba lượt chỉ tốn 1,2 giây rồi bỏ cuộc.
 *   · Chờ LỆCH NHAU. Đây mới là chỗ quan trọng: hai app va nhau cùng một tích
 *     tắc, rồi cùng lùi đúng 400ms, nên thử lại cũng cùng một tích tắc và va
 *     tiếp. Cộng thêm một khoảng ngẫu nhiên là tự tản ra.
 */
const QUA_NHIP = [99991400, 99991661];
const khoangCho = (lan, e) => {
  const goc = (QUA_NHIP.includes(e && e.code) ? 1200 : 400) * Math.pow(2, lan);
  return goc + Math.floor(Math.random() * goc);
};

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
      await wait(khoangCho(i, e));
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

const baseUrl = (tableId) =>
  '/open-apis/base/v3/bases/' + cfg.baseToken + '/tables/' + tableId;

/* ---------------- Base -> bản ghi ---------------- */
function columnsToRecords(data) {
  const fieldIds = data.field_id_list || [];
  const ids = data.record_id_list || [];
  const rows = data.data || [];
  /* Phải trả ĐÚNG hình dạng của lark.js: { id, c } — store.js đọc r.c[fieldId].
   * Trả { record_id, cells } thì mọi bảng vỡ với lỗi "Cannot read properties of
   * undefined (reading 'fld...')" ngay khi deploy ở chế độ api. */
  return rows.map((row, i) => {
    const c = {};
    fieldIds.forEach((fid, j) => { c[fid] = row[j]; });
    return { id: ids[i], c };
  });
}

/* ---------------- các thao tác (cùng chữ ký với lark.js của app này) ---------------- */
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

async function getRecord(tableId, recordId) {
  const ds = await listAll(tableId);
  return ds.find((r) => r.id === recordId) || null;
}

/** fields: { fieldId: cellValue } — trả về record_id vừa tạo. */
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

/** map: { recordId: { fieldId: value } } — chia lô 200 bản ghi mỗi lần gọi. */
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

/** Chế độ api không có "người đang đăng nhập" — danh tính đến từ phiên đăng nhập. */
async function whoami() { return null; }
const cli = async () => { throw new Error('Chế độ api không dùng lark-cli'); };

module.exports = {
  cli, whoami, listAll, getRecord, createRecord, createMany,
  updateRecord, updateMany, deleteRecords,
  tenantToken, call,
};
