'use strict';
/**
 * Tầng gọi lark-cli (chế độ máy cá nhân): parse JSON, retry lỗi tạm thời,
 * đọc/ghi bản ghi Base. Cùng chữ ký hàm với larkapi.js.
 *
 * So với ba app kia có thêm hai hàm đọc lược đồ — `listTables` và `listFields` —
 * vì app này dò field ID theo TÊN cột thay vì hardcode.
 */
const { execFile } = require('child_process');
const cfg = require('./config');

const TRANSIENT = [1254291, 1254036, 99991400];

function isTransient(err) {
  const m = String((err && err.message) || '');
  if (TRANSIENT.some((c) => m.includes(String(c)))) return true;
  return /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|EPIPE/i.test(m);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Rút một câu ĐỌC ĐƯỢC từ lỗi thô của lark-cli.
 *
 * Vì sao cần: câu lỗi này đi thẳng lên băng thông báo của dashboard. Ném nguyên
 * stack trace của Node vào đó thì người vận hành thấy 15 dòng
 * "node:internal/modules/cjs/loader:1386 throw err" — không hiểu gì và cũng không
 * biết phải làm gì. Nhận ra vài lỗi hay gặp rồi nói thẳng cách xử lý.
 */
function gonLoi(raw) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();

  if (/MODULE_NOT_FOUND|Cannot find module/.test(t) && /cli|run\.js/i.test(t)) {
    return 'Máy này chưa cài lark-cli (hoặc LARK_CLI_SCRIPT trỏ sai đường dẫn: ' +
      cfg.cliScript + '). Cài lark-cli rồi đăng nhập, hoặc chạy ở chế độ api bằng ' +
      'LARK_APP_ID + LARK_APP_SECRET.';
  }
  if (/not logged in|chưa đăng nhập|unauthenticated|auth/i.test(t) && /lark-cli|cli/i.test(t)) {
    return 'Phiên lark-cli của máy đã hết hạn — đăng nhập lại lark-cli rồi thử lại.';
  }
  if (/ENOENT/.test(t) && /node/i.test(t)) {
    return 'Không chạy được lark-cli trên máy này. Kiểm tra lại đường dẫn: ' + cfg.cliScript;
  }
  /* 91403 = Lark từ chối vì quyền. Đọc được mà ghi không được là tình huống RẤT
   * hay gặp với base do người khác dựng: link chia sẻ cho quyền Xem, không cho
   * Sửa. Câu lỗi gốc ("you don't have permission") không nói được phải làm gì. */
  if (/91403|permission denied|EACCES|don't have permission/i.test(t)) {
    return 'Tài khoản Lark đang dùng KHÔNG có quyền sửa base này (chỉ xem được). ' +
      'Nhờ chủ base mở quyền "Chỉnh sửa" cho tài khoản/ứng dụng đang chạy app, ' +
      'rồi bấm Đẩy hàng đợi vào Base — booking đang chờ trong hàng đợi không mất.';
  }
  // Không nhận ra thì cắt ngắn, giữ phần đầu vì đó là chỗ có thông tin
  return t.length > 240 ? t.slice(0, 240) + '…' : t;
}

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
          return reject(new Error(gonLoi(json.error?.message || json.message ||
            JSON.stringify(json.error || json))));
        }
        if (err && !json) return reject(new Error('lark-cli: ' + gonLoi(stderr || err.message)));
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

/**
 * Tài khoản đang dùng có quyền GHI vào base này không.
 *
 * VÌ SAO PHẢI HỎI RIÊNG: đọc được không có nghĩa là ghi được. Base do người khác
 * dựng thường chỉ chia sẻ ở mức "Có thể xem" — mọi màn hình vẫn đầy đủ số, không
 * có gì trông như hỏng, và chỉ tới khi booking THẬT đầu tiên về mới lòi ra là ghi
 * không được. Hỏi trước một câu thì biết ngay từ lúc mở tab Thiết lập.
 *
 * @returns {Promise<boolean|null>} null = không xác định được (đừng suy diễn gì).
 */
async function quyenGhi() {
  try {
    const d = await cli(['drive', 'permission.members', 'auth',
      '--type', 'bitable', '--token', cfg.baseToken, '--action', 'edit',
      '--as', cfg.identity, '--format', 'json'], { retries: 1, timeout: 25000 });
    return typeof d.auth_result === 'boolean' ? d.auth_result : null;
  } catch (_) {
    /* Lệnh không có, hết hạn đăng nhập, mạng hỏng… đều KHÔNG phải bằng chứng là
     * thiếu quyền. Trả null để phía trên im lặng thay vì doạ nhầm. */
    return null;
  }
}

/** [{ table_id, name }] — để dò table ID theo tên bảng. */
async function listTables(opts = {}) {
  const d = await cli(['base', '+table-list', ...baseArgs(), '--format', 'json'], opts);
  const ds = d.tables || d.items || d.data || [];
  return ds.map((t) => ({
    id: t.table_id || t.id || '',
    name: String(t.name || t.table_name || ''),
  })).filter((t) => t.id);
}

/** [{ field_id, field_name, type }] — để dò field ID theo tên cột. */
async function listFields(tableId, opts = {}) {
  const d = await cli(['base', '+field-list', ...baseArgs(), '--table-id', tableId, '--format', 'json'], opts);
  const ds = d.fields || d.items || [];
  return ds.map((f) => ({
    id: f.field_id || f.id || '',
    name: String(f.field_name || f.name || ''),
    type: f.type || f.ui_type || '',
  })).filter((f) => f.id);
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

/* Chế độ api (server chung) không có lark-cli trên máy đó — chuyển hướng ngay tại
 * đây để store.js / webhook.js / schema.js không phải biết đang chạy backend nào. */
module.exports = cfg.mode === 'api'
  ? require('./larkapi')
  : {
      cli, whoami, quyenGhi, listAll, listTables, listFields,
      createRecord, createMany, updateRecord, updateMany, deleteRecords,
      gonLoi,
    };
