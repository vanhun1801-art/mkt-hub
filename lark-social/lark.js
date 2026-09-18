'use strict';
/** Tầng gọi lark-cli: parse JSON, retry lỗi tạm thời, đọc/ghi bản ghi Base. */
const { execFile } = require('child_process');
const cfg = require('./config');

const TRANSIENT = [1254291, 1254036, 99991400];

function isTransient(err) {
  const m = String((err && err.message) || '');
  if (TRANSIENT.some((c) => m.includes(String(c)))) return true;
  return /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|EPIPE/i.test(m);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function cli(args, opts = {}) {
  const tries = opts.retries == null ? 3 : opts.retries;
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await cliOnce(args, opts); }
    catch (e) {
      last = e;
      if (i === tries - 1 || !isTransient(e)) throw e;
      await wait(400 * Math.pow(2, i));
    }
  }
  throw last;
}

function cliOnce(args, { timeout = 90000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cfg.cliScript, ...args],
      { timeout, cwd: __dirname, maxBuffer: 96 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const raw = (stdout || '').trim();
        let json = null;
        if (raw) {
          const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
          if (s >= 0 && e > s) { try { json = JSON.parse(raw.slice(s, e + 1)); } catch (_) {} }
        }
        if (json && json.ok === false) {
          return reject(new Error(json.error?.message || json.message || JSON.stringify(json.error || json)));
        }
        if (err && !json) return reject(new Error(`lark-cli lỗi: ${(stderr || err.message || '').slice(0, 800)}`));
        if (!json) return reject(new Error('Không parse được phản hồi từ lark-cli'));
        resolve(json.data ?? {});
      });
  });
}

const baseArgs = () => ['--base-token', cfg.baseToken, '--as', cfg.identity];

/** Người đang đăng nhập lark-cli. */
function whoami() {
  return new Promise((resolve) => {
    execFile(process.execPath, [cfg.cliScript, 'auth', 'status'],
      { timeout: 25000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        try {
          const raw = String(stdout || '');
          const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
          const u = j.identities && j.identities.user;
          resolve(u && u.openId ? { id: u.openId, name: u.userName || u.openId } : null);
        } catch (_) { resolve(null); }
      });
  });
}

/** +record-list trả dạng cột — đổi về mảng { id, c: { fieldId: value } }. */
function columnsToRecords(data) {
  const fieldIds = data.field_id_list || [];
  const ids = data.record_id_list || [];
  return (data.data || []).map((row, i) => {
    const c = {};
    fieldIds.forEach((fid, j) => { c[fid] = row[j]; });
    return { id: ids[i], c };
  });
}

async function listAll(tableId) {
  const out = [];
  let offset = 0;
  for (let page = 0; page < 60; page++) {
    const data = await cli(['base', '+record-list', ...baseArgs(),
      '--table-id', tableId, '--limit', '200', '--offset', String(offset), '--format', 'json']);
    out.push(...columnsToRecords(data));
    if (!data.has_more) break;
    offset += 200;
  }
  return out;
}

async function getRecord(tableId, recordId) {
  const data = await cli(['base', '+record-get', ...baseArgs(),
    '--table-id', tableId, '--record-id', recordId, '--format', 'json']);
  return columnsToRecords(data)[0] || null;
}

/** fields: { fieldId: cellValue } */
async function createRecord(tableId, fields) {
  const names = Object.keys(fields);
  const data = await cli(['base', '+record-batch-create', ...baseArgs(),
    '--table-id', tableId, '--format', 'json',
    '--json', JSON.stringify({ fields: names, rows: [names.map((n) => fields[n])] })]);
  return (data.record_id_list || [])[0] || null;
}

/**
 * Chia lô theo ĐỘ DÀI JSON, không phải theo số dòng.
 *
 * Chế độ cli truyền dữ liệu cho lark-cli qua tham số dòng lệnh, mà Windows chặn
 * dòng lệnh ở khoảng 32 nghìn ký tự. Chia 200 dòng một lô là đủ cho bảng số
 * liệu ngày (mỗi dòng vài chục ký tự), nhưng bảng Bài đăng có caption dài — 200
 * bài là hơn 100 nghìn ký tự và Node ném `spawn ENAMETOOLONG`. Gặp thật khi
 * chạy lại cả năm: lấy về đủ 525 bài rồi hỏng ở đúng bước ghi.
 *
 * Để ngưỡng 24.000 cho rộng chỗ: phần còn lại của dòng lệnh (đường dẫn script,
 * base token, tên bảng) cũng tính vào giới hạn đó.
 */
const TRAN_JSON = 24000;
/* Lark chặn ở 200 bản ghi mỗi lượt ghi. Phải chặn CẢ HAI: chỉ chặn độ dài thì
 * bảng số liệu ngày (dòng ngắn) gom tới hàng nghìn dòng một lô và Lark từ chối;
 * chỉ chặn số dòng thì bảng Bài đăng (caption dài) làm vỡ dòng lệnh Windows. */
const TRAN_DONG = 200;

function chiaLo(items, doDai) {
  const lo = [];
  let hienTai = [];
  let co = 0;
  items.forEach((x) => {
    const n = doDai(x);
    /* Một phần tử tự nó đã quá dài thì vẫn phải gửi riêng — thà để Lark từ chối
     * một dòng còn hơn im lặng bỏ nó lại. */
    const day = hienTai.length >= TRAN_DONG || (hienTai.length && co + n > TRAN_JSON);
    if (day) { lo.push(hienTai); hienTai = []; co = 0; }
    hienTai.push(x);
    co += n;
  });
  if (hienTai.length) lo.push(hienTai);
  return lo;
}

async function createMany(tableId, rowsObj) {
  if (!rowsObj.length) return [];
  const names = [...new Set(rowsObj.flatMap((r) => Object.keys(r)))];
  const out = [];
  const lo = chiaLo(rowsObj, (r) => JSON.stringify(r).length);
  for (const chunk of lo) {
    const data = await cli(['base', '+record-batch-create', ...baseArgs(),
      '--table-id', tableId, '--format', 'json',
      '--json', JSON.stringify({ fields: names, rows: chunk.map((r) => names.map((n) => (n in r ? r[n] : null))) })]);
    out.push(...(data.record_id_list || []));
  }
  return out;
}

async function updateRecord(tableId, recordId, fields) {
  return cli(['base', '+record-batch-update', ...baseArgs(),
    '--table-id', tableId, '--format', 'json',
    '--json', JSON.stringify({ update_records: { [recordId]: fields } })]);
}

/** map: { recordId: { fieldId: value } } — chia lô theo độ dài JSON, xem chiaLo(). */
async function updateMany(tableId, map) {
  const ids = Object.keys(map);
  let done = 0;
  for (const chunk of chiaLo(ids, (id) => JSON.stringify(map[id]).length + id.length + 4)) {
    const update_records = {};
    chunk.forEach((id) => { update_records[id] = map[id]; });
    await cli(['base', '+record-batch-update', ...baseArgs(),
      '--table-id', tableId, '--format', 'json',
      '--json', JSON.stringify({ update_records })]);
    done += chunk.length;
  }
  return done;
}

async function deleteRecords(tableId, recordIds) {
  return cli(['base', '+record-delete', ...baseArgs(),
    '--table-id', tableId, '--yes', '--format', 'json',
    '--json', JSON.stringify({ record_id_list: recordIds })]);
}

/* Chế độ api (deploy server chung): không có lark-cli trên máy đó, nên mọi file
 * gọi require('./lark') đều phải nhận backend Open API. Chuyển hướng ngay tại đây
 * để không phải sửa từng chỗ gọi (store.js, quyen.js, sync/*.js...). */
module.exports = cfg.mode === 'api'
  ? require('./larkapi')
  : { cli, whoami, listAll, getRecord, createRecord, createMany, updateRecord, updateMany, deleteRecords, chiaLo, TRAN_JSON, TRAN_DONG };
