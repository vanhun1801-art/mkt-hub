'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

/** Lỗi tạm thời của Base — thử lại được. */
const TRANSIENT = [
  1254291,          // ghi đồng thời, xung đột revision
  1254036,          // quá tần suất
  99991400,         // rate limit
];

function isTransient(err) {
  const m = String((err && err.message) || '');
  if (TRANSIENT.some((c) => m.includes(String(c)))) return true;
  // gồm cả "i/o timeout", "dial tcp ... timeout" của lark-cli
  return /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|EPIPE|"subtype":\s*"timeout"|"type":\s*"network"/i.test(m);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Gọi lark-cli, tự thử lại khi gặp lỗi tạm thời. */
async function cli(args, opts = {}) {
  const tries = opts.retries == null ? 3 : opts.retries;
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await cliOnce(args, opts);
    } catch (e) {
      last = e;
      if (i === tries - 1 || !isTransient(e)) throw e;
      await wait(400 * Math.pow(2, i));
    }
  }
  throw last;
}

function cliOnce(args, { timeout = 60000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [cfg.cliScript, ...args],
      { timeout, cwd, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const raw = (stdout || '').trim();
        let json = null;
        if (raw) {
          const s = raw.indexOf('{');
          const e = raw.lastIndexOf('}');
          if (s >= 0 && e > s) { try { json = JSON.parse(raw.slice(s, e + 1)); } catch (_) {} }
        }
        if (json && json.ok === false) {
          return reject(new Error(json.error?.message || json.message || JSON.stringify(json.error || json)));
        }
        if (err && !json) {
          return reject(new Error(`lark-cli lỗi: ${(stderr || err.message || '').slice(0, 800)}`));
        }
        if (!json) return reject(new Error('Không parse được phản hồi từ lark-cli'));
        resolve(json.data ?? {});
      }
    );
  });
}

const baseArgs = () => ['--base-token', cfg.baseToken, '--as', cfg.identity];

/** Người dùng đang đăng nhập lark-cli (dùng cho tab "Của tôi"). */
async function whoami() {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cfg.cliScript, 'auth', 'status'],
      { timeout: 20000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        try {
          const raw = String(stdout || '');
          const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
          const u = j.identities && j.identities.user;
          resolve(u && u.openId ? { id: u.openId, name: u.userName || u.openId } : null);
        } catch (_) {
          resolve(null);
        }
      }
    );
  });
}

/** Chuyển đổi kết quả dạng cột của +record-list thành mảng object. */
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
    const data = await cli([
      'base', '+record-list', ...baseArgs(),
      '--table-id', tableId,
      '--limit', '200', '--offset', String(offset),
      '--format', 'json',
    ]);
    out.push(...columnsToRecords(data));
    if (!data.has_more) break;
    offset += 200;
  }
  return out;
}

/**
 * Đọc một bản ghi duy nhất, luôn lấy bản mới nhất từ Base.
 * Dùng cho các quyết định phân quyền — không được dựa vào cache có thể đã cũ.
 */
async function getRecord(recordId, tableId = cfg.tableId) {
  const data = await cli([
    'base', '+record-get', ...baseArgs(),
    '--table-id', tableId,
    '--record-id', recordId,
    '--format', 'json',
  ]);
  return columnsToRecords(data)[0] || null;
}

async function listFields(tableId = cfg.tableId) {
  const data = await cli(['base', '+field-list', ...baseArgs(), '--table-id', tableId, '--format', 'json']);
  return data.fields || [];
}

async function updateRecord(recordId, fields, tableId = cfg.tableId) {
  return cli([
    'base', '+record-batch-update', ...baseArgs(),
    '--table-id', tableId,
    '--json', JSON.stringify({ update_records: { [recordId]: fields } }),
  ]);
}

async function updateMany(map, tableId = cfg.tableId) {
  return cli([
    'base', '+record-batch-update', ...baseArgs(),
    '--table-id', tableId,
    '--json', JSON.stringify({ update_records: map }),
  ]);
}

async function createRecord(fields, tableId = cfg.tableId) {
  const names = Object.keys(fields);
  const row = names.map((n) => fields[n]);
  return cli([
    'base', '+record-batch-create', ...baseArgs(),
    '--table-id', tableId,
    '--json', JSON.stringify({ fields: names, rows: [row] }),
  ]);
}

/**
 * Tải một tệp đính kèm. lark-cli chỉ nhận --output là đường dẫn tương đối
 * trong cwd, nên tải vào .tmp/<id> ngay trong thư mục project.
 * Trả về đường dẫn tuyệt đối của thư mục chứa tệp.
 */
async function downloadAttachment(recordId, fileToken, relDirName, tableId = cfg.tableId) {
  const relDir = './.tmp/' + relDirName;
  const absDir = path.join(__dirname, '.tmp', relDirName);
  fs.mkdirSync(absDir, { recursive: true });
  await cli([
    'base', '+record-download-attachment', ...baseArgs(),
    '--table-id', tableId,
    '--record-id', recordId,
    '--file-token', fileToken,
    '--output', relDir,
    '--overwrite',
    '--format', 'json',
  ], { timeout: 180000, cwd: __dirname });
  return absDir;
}

/** Upload tệp lên một ô attachment. lark-cli cần --file là đường dẫn tương đối trong cwd. */
async function uploadAttachment(recordId, fieldName, relFilePath, tableId = cfg.tableId) {
  return cli([
    'base', '+record-upload-attachment', ...baseArgs(),
    '--table-id', tableId,
    '--record-id', recordId,
    '--field-id', fieldName,
    '--file', relFilePath,
    '--format', 'json',
  ], { timeout: 300000, cwd: __dirname });
}

async function deleteRecords(recordIds, tableId = cfg.tableId) {
  return cli([
    'base', '+record-delete', ...baseArgs(),
    '--table-id', tableId,
    '--json', JSON.stringify({ record_id_list: recordIds }),
    '--yes',
  ]);
}

/* Chế độ api (deploy server chung): không có lark-cli trên máy đó, nên mọi file
 * gọi require('./lark') đều phải nhận backend Open API. Chuyển hướng ngay tại đây
 * để không phải sửa từng chỗ gọi (store.js, quyen.js, sync/*.js...). */
module.exports = cfg.mode === 'api' ? require('./larkapi') : {
  cli, whoami, listAllRecords, listFields, getRecord,
  updateRecord, updateMany, createRecord, deleteRecords,
  downloadAttachment, uploadAttachment,
};
