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

async function createMany(tableId, rowsObj) {
  if (!rowsObj.length) return [];
  const names = [...new Set(rowsObj.flatMap((r) => Object.keys(r)))];
  const out = [];
  for (let i = 0; i < rowsObj.length; i += 200) {
    const chunk = rowsObj.slice(i, i + 200);
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

/** map: { recordId: { fieldId: value } } — chia lô 200 bản ghi mỗi lần gọi. */
async function updateMany(tableId, map) {
  const ids = Object.keys(map);
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
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

module.exports = { cli, whoami, listAll, getRecord, createRecord, createMany, updateRecord, updateMany, deleteRecords };
