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

/* Mặc định là Base của app này. Tham số `base` mở đường ghi sang Base KHÁC —
 * cần từ khi bấm "Đã thanh toán" phải ghi thêm một dòng vào sổ quỹ, vốn nằm ở
 * Base "Chi phí Marketing". Không có nó thì phải dựng lại cả lớp gọi lark-cli
 * lần hai chỉ để đổi một tham số. */
const baseArgs = (base) => ['--base-token', base || cfg.baseToken, '--as', cfg.identity];

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

async function listAllRecords(tableId = cfg.phieuTableId, base) {
  const out = [];
  let offset = 0;
  for (let page = 0; page < 30; page++) {
    const data = await cli([
      'base', '+record-list', ...baseArgs(base),
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
async function getRecord(recordId, tableId = cfg.phieuTableId) {
  const data = await cli([
    'base', '+record-get', ...baseArgs(),
    '--table-id', tableId,
    '--record-id', recordId,
    '--format', 'json',
  ]);
  return columnsToRecords(data)[0] || null;
}

async function listFields(tableId = cfg.phieuTableId, base) {
  const data = await cli(['base', '+field-list', ...baseArgs(base), '--table-id', tableId, '--format', 'json']);
  return data.fields || [];
}

async function updateRecord(recordId, fields, tableId = cfg.phieuTableId, base) {
  return cli([
    'base', '+record-batch-update', ...baseArgs(base),
    '--table-id', tableId,
    '--json', JSON.stringify({ update_records: { [recordId]: fields } }),
  ]);
}

async function updateMany(map, tableId = cfg.phieuTableId, base) {
  return cli([
    'base', '+record-batch-update', ...baseArgs(base),
    '--table-id', tableId,
    '--json', JSON.stringify({ update_records: map }),
  ]);
}

async function createRecord(fields, tableId = cfg.phieuTableId, base) {
  const names = Object.keys(fields);
  const row = names.map((n) => fields[n]);
  return cli([
    'base', '+record-batch-create', ...baseArgs(base),
    '--table-id', tableId,
    '--json', JSON.stringify({ fields: names, rows: [row] }),
  ]);
}



/**
 * Tạo NHIỀU bản ghi trong một lượt gọi.
 *
 * Một báo cáo ngày có 5–10 đầu việc. Gọi createRecord từng dòng nghĩa là 10 lần
 * ra vào Base cho một lần bấm Nộp — chậm, và tệ hơn là nếu đứt ở dòng thứ 6 thì
 * phiếu còn lại một nửa mà không ai biết.
 */
async function createMany(rows, tableId = cfg.phieuTableId, base) {
  if (!rows || !rows.length) return { records: [] };
  /* Mọi dòng phải cùng bộ cột vì payload là dạng bảng (fields + rows). Lấy hợp
   * của tất cả các khoá rồi điền null cho ô thiếu, thay vì tin rằng dòng đầu đã
   * đủ cột — dòng không khai Ghi chú sẽ làm lệch cả bảng. */
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return cli([
    'base', '+record-batch-create', ...baseArgs(base),
    '--table-id', tableId,
    '--json', JSON.stringify({
      fields: names,
      rows: rows.map((r) => names.map((n) => (n in r ? r[n] : null))),
    }),
  ]);
}

async function deleteRecords(recordIds, tableId = cfg.phieuTableId, base) {
  return cli([
    'base', '+record-delete', ...baseArgs(base),
    '--table-id', tableId,
    '--json', JSON.stringify({ record_id_list: recordIds }),
    '--yes',
  ]);
}

/* Chế độ api (deploy server chung): không có lark-cli trên máy đó, nên mọi file
 * gọi require('./lark') đều phải nhận backend Open API. Chuyển hướng ngay tại đây
 * để không phải sửa từng chỗ gọi (store.js, quyen.js, sync/*.js...). */
/**
 * Gửi tin nhắn Lark qua lark-cli (chạy trên máy cá nhân).
 * Không ném lỗi — gửi tin là việc phụ, hỏng thì thôi, đừng chặn thao tác chính.
 */
async function guiTinNhan(openId, noiDung) {
  if (!openId || !noiDung) return { ok: false, ly: 'thiếu người nhận hoặc nội dung' };
  try {
    /* --as bot: gửi ở vai ỨNG DỤNG, giống hệt cách bản trên Render gửi bằng
     * tenant token. Phải khai rõ vì lark-cli mặc định lấy vai user, mà vai user
     * lại đòi một quyền khác (im:message.send_as_user) — người nhận cũng thấy
     * tin đến từ cá nhân quản lý thay vì từ app. */
    await cli(['im', '+messages-send', '--as', 'bot',
      '--user-id', openId, '--text', noiDung], { retries: 1 });
    return { ok: true };
  } catch (e) {
    return { ok: false, ly: e.message };
  }
}

module.exports = cfg.mode === 'api' ? require('./larkapi') : {
  cli, whoami, listAllRecords, listFields, getRecord,
  updateRecord, updateMany, createRecord, createMany, deleteRecords, guiTinNhan,
};
