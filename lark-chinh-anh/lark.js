'use strict';
/**
 * Tầng gọi lark-cli: parse JSON, retry lỗi tạm thời, đọc/ghi bản ghi Base,
 * và gửi tin nhắn vào nhóm chat.
 *
 * Chép nguyên từ app Social (đã chạy thật) để bảy app dùng một tầng giống nhau;
 * phần thêm của app này là guiTin() ở cuối file.
 */
const { execFile } = require('child_process');
const cfg = require('./config');

/* 800004135 = "OpenAPIListRecord limited": Lark chặn tần suất ĐỌC bản ghi.
 * Giới hạn tính theo CẢ TENANT, mà 12 app cùng đọc Base một lúc khi hub khởi
 * động — đo được trên log 28/09/2026. Thiếu mã này thì app coi đây là lỗi
 * VĨNH VIỄN và không thử lại, người dùng nhận thẳng một màn lỗi. */
const TRANSIENT = [1254291, 1254036, 99991400, 800004135];

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


/* ---------------- gửi tin vào nhóm chat ---------------- */
/**
 * Gửi một tin vào nhóm. `noiDung` là object thẻ (interactive) hoặc chuỗi text.
 *
 * KHÔNG dùng cli() ở trên: cli() kẹp sẵn --base-token / --as của Base, còn đây là
 * API im. Và tin nhắn thì KHÔNG được retry mù như đọc Base — gửi lại một tin đã
 * gửi được là nhóm nhận hai lần. Lark có --idempotency-key cho đúng việc này, nên
 * bên gọi truyền khoá vào (xem im.js).
 */
function guiTin({ chatId, userId, email, text, card, khoa }) {
  /* Khai khoá app đứng tên gửi thì gửi bằng danh tính app đó, không dùng bot của
   * lark-cli — xem đầu file tin-app.js để hiểu vì sao (phòng có 5 app Lark). */
  const tinApp = require('./tin-app');
  if (tinApp.co()) return tinApp.gui({ chatId, userId, email, text, card, khoa });

  /* lark-cli chỉ có --chat-id / --user-id, không có --email. */
  if (email && !userId && !chatId) {
    return Promise.resolve({ ok: false,
      loi: 'Chỉ đích bằng email cần khai ANH_TIN_APP_ID + ANH_TIN_APP_SECRET '
        + '(lark-cli không có --email).' });
  }

  return new Promise((resolve) => {
    /* userId = nhắn riêng cho một người (dùng cho gui-thu.js và cho việc nhắc
     * đúng người bị trả về sửa). chatId = nhắn vào nhóm. */
    const dich = userId ? ['--user-id', userId] : ['--chat-id', chatId];
    const args = [cfg.cliScript, 'im', '+messages-send', ...dich,
      '--as', cfg.identityTin, '--format', 'json'];
    if (card) args.push('--msg-type', 'interactive', '--content', JSON.stringify(card));
    else args.push('--text', String(text || ''));
    if (khoa) args.push('--idempotency-key', String(khoa).slice(0, 50));

    execFile(process.execPath, args,
      { timeout: 60000, cwd: __dirname, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const raw = String(stdout || '');
        let j = null;
        const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
        if (a >= 0 && b > a) { try { j = JSON.parse(raw.slice(a, b + 1)); } catch (_) {} }
        if (j && j.ok === true) {
          const d = j.data || {};
          return resolve({ ok: true, msgId: d.message_id || d.message?.message_id || '' });
        }
        let loi = String((j && (j.error?.message || j.message)) || stderr || err?.message || raw);
        /* Nói thẳng nguyên nhân hay gặp nhất, thay vì để người dùng đọc mã lỗi Lark. */
        if (/230002|230013|out of the chat|not in the chat/i.test(loi)) {
          loi = 'Bot của app chưa được thêm vào nhóm này. Mời bot vào nhóm rồi gửi lại. (' + loi.slice(0, 200) + ')';
        } else if (/missing_scope|send_as_user/i.test(loi)) {
          loi = 'Thiếu quyền gửi tin của Lark app. (' + loi.slice(0, 200) + ')';
        }
        resolve({ ok: false, loi: loi.slice(0, 400) });
      });
  });
}


/** Tra danh bạ Lark theo tên — để chọn "người chỉnh" mà không phải gõ open_id. */
function timNguoi(q) {
  return new Promise((resolve) => {
    const tu = String(q || '').trim();
    if (!tu) return resolve([]);
    execFile(process.execPath, [cfg.cliScript, 'contact', '+search-user',
      '--query', tu, '--as', 'user', '--format', 'json'],
    { timeout: 30000, cwd: __dirname, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    (err, stdout) => {
      try {
        const raw = String(stdout || '');
        const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        resolve((j.data?.users || [])
          .filter((u) => u.open_id && u.is_activated !== false)
          .map((u) => ({
            id: u.open_id,
            ten: u.localized_name || u.open_id,
            phong: u.department || '',
          })));
      } catch (_) { resolve([]); }
    });
  });
}

/**
 * EMAIL CÔNG TY của một người, tra theo open_id trong ô Người làm của Base.
 *
 * Dùng để nhắn riêng. open_id là RIÊNG THEO TỪNG APP, nên mã lấy từ Base không
 * đưa thẳng cho app gửi tin được — Lark trả `99992361 open_id cross app`, đã
 * thử ngày 08/10/2026 với đúng mã của Trường. Email thì chung cho cả tenant.
 *
 * Chế độ cli phải đi đường TÌM KIẾM theo tên, vì `contact +get-user` không trả
 * email (đã thử: chỉ ra mỗi tên), chỉ `+search-user` mới có `enterprise_email`.
 *
 * KHỚP BẰNG open_id, KHÔNG BẰNG TÊN. Tìm theo tên là bắt buộc, nhưng chỉ nhận
 * kết quả khi open_id trả về TRÙNG KHÍT mã trên lô. Phòng có "Nguyễn Long
 * Khánh" và "Huỳnh Chí Khanh" — gửi nhầm kết quả nghiệm thu cho người khác là
 * chuyện không rút lại được.
 */
function emailTheoOpenId(openId, ten) {
  return new Promise((resolve) => {
    const tu = String(ten || '').trim();
    if (!openId || !tu) return resolve('');
    execFile(process.execPath, [cfg.cliScript, 'contact', '+search-user',
      '--query', tu, '--as', 'user', '--format', 'json'],
    { timeout: 30000, cwd: __dirname, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    (err, stdout) => {
      try {
        const raw = String(stdout || '');
        const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        const u = ((j.data && j.data.users) || []).find((x) => x.open_id === openId);
        resolve((u && (u.enterprise_email || u.email)) || '');
      } catch (_) { resolve(''); }
    });
  });
}

/** Nhóm chat người đang đăng nhập tham gia — để quản lý chọn nhóm trong Cài đặt. */
/**
 * Mọi nhóm bot đang ở trong. PHẢI LẬT HẾT TRANG.
 *
 * Lark trả 20 nhóm một trang. Bản trước chỉ đọc trang đầu rồi thôi, nên bot ở 49
 * nhóm mà ô chọn nhóm trong Cài đặt chỉ thấy 20 — nhóm "CSKH - ẢNH,VIDEO" nằm ở
 * trang 3, tìm mãi không ra và trông y như bot chưa được mời vào (05/10/2026).
 */
function motTrangNhom(pageToken) {
  return new Promise((resolve) => {
    const args = [cfg.cliScript, 'im', '+chat-list', '--as', cfg.identity, '--format', 'json'];
    if (pageToken) args.push('--page-token', pageToken);
    execFile(process.execPath, args,
      { timeout: 45000, cwd: __dirname, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        try {
          const raw = String(stdout || '');
          const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
          const d = j.data || {};
          resolve({ chats: d.chats || [], tiep: d.has_more ? (d.page_token || '') : '' });
        } catch (_) { resolve({ chats: [], tiep: '' }); }
      });
  });
}

async function dsNhom() {
  const tat = [];
  let tok = '';
  /* Trần 20 vòng: 400 nhóm là quá đủ, và không bao giờ quay vô hạn nếu Lark trả
   * has_more mãi mà page_token không đổi. */
  for (let i = 0; i < 20; i++) {
    const { chats, tiep } = await motTrangNhom(tok);
    tat.push(...chats);
    if (!tiep || tiep === tok) break;
    tok = tiep;
  }
  return tat
    .filter((c) => c.chat_status === 'normal')
    .map((c) => ({ id: c.chat_id, ten: c.name, che_do: c.chat_mode }));
}

/* Chế độ api (deploy server chung): không có lark-cli trên máy đó, nên mọi file
 * gọi require('./lark') đều phải nhận backend Open API. Chuyển hướng ngay tại đây
 * để không phải sửa từng chỗ gọi (store.js, quyen.js, sync/*.js...). */
module.exports = cfg.mode === 'api'
  ? require('./larkapi')
  : { cli, whoami, listAll, getRecord, createRecord, createMany, updateRecord, updateMany, deleteRecords, guiTin, dsNhom, timNguoi, emailTheoOpenId };
