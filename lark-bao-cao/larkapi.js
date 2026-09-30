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

/* HẠN GIỜ CHO MỌI CUỘC GỌI RA LARK.
 *
 * Không đặt thì Node chờ mặc định 300 giây, mà lớp thử-lại ở dưới còn thử tới 3
 * lần — xấu nhất là mười lăm phút treo cho một lần bấm, trong khi người dùng chỉ
 * thấy một vòng xoay không nói gì. Đây là loại hỏng không bao giờ gặp lúc thử, chỉ
 * gặp đúng hôm Lark có sự cố — tức đúng hôm cần app chạy nhất.
 *
 * Mốc theo việc: đọc/ghi bảng và đổi token bình thường dưới một giây; tải tệp
 * thì ảnh vài MB qua mạng chậm là có thật. Quá hạn ném TimeoutError, câu lỗi có
 * chữ "timeout" nên isTransient() nhận ra là lỗi tạm thời và vẫn thử lại đàng hoàng. */
const HAN_GOI = 20000;
const HAN_TAI = 120000;
const han = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout
  ? AbortSignal.timeout(ms) : undefined);

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
    signal: han(HAN_GOI),
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
/* 800004135 = "OpenAPIListRecord limited": Lark chặn tần suất ĐỌC bản ghi.
 * Giới hạn tính theo CẢ TENANT, mà 12 app cùng đọc Base một lúc khi hub khởi
 * động — đo được trên log 28/09/2026. Thiếu mã này thì app coi đây là lỗi
 * VĨNH VIỄN và không thử lại, người dùng nhận thẳng một màn lỗi. */
const TRANSIENT = [1254291, 1254036, 99991400, 99991661, 800004135];
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

async function callOnce(method, url, { body, raw, hanMs } = {}) {
  const token = await tenantToken();
  const r = await fetch(HOST + url, {
    method,
    headers: Object.assign(
      { Authorization: 'Bearer ' + token },
      body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}
    ),
    body: body ? JSON.stringify(body) : undefined,
    /* Tải tệp đính kèm cần lâu hơn 20 giây (rà 01/10): trước đây mọi lượt đều
     * dùng HAN_GOI nên tệp vài MB trên đường chậm bị cắt rồi thử lại ba lần. */
    signal: han(hanMs || HAN_GOI),
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
/* Đọc tới khi hết (rà 01/10/2026). Bản trước dừng ở 30 trang = 6.000 dòng mà
 * không nói gì: bảng Dòng việc chạm mốc đó sau ~3 tháng, app thôi thấy dòng mới
 * rồi mỗi lần lưu lại tạo dòng trùng. Trần 1.000 trang (200.000 dòng) chỉ để
 * chặn vòng lặp vô tận — chạm trần là lỗi thật, phải báo. */
const TRAN_TRANG = 1000;
async function listAllRecords(tableId = cfg.phieuTableId, base) {
  const out = [];
  let offset = 0;
  for (let trang = 0; ; trang++) {
    if (trang >= TRAN_TRANG) throw new Error('Bảng ' + tableId + ' vượt ' + TRAN_TRANG + ' trang — cần đọc có lọc');
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
async function getRecord(recordId, tableId = cfg.phieuTableId) {
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

async function listFields(tableId = cfg.phieuTableId, base) {
  const d = await call('GET', baseUrl(tableId, base) + '/fields?limit=100&offset=0');
  return d.fields || d.items || [];
}

async function updateRecord(recordId, fields, tableId = cfg.phieuTableId, base) {
  return call('POST', baseUrl(tableId, base) + '/records/batch_update', {
    body: { update_records: { [recordId]: fields } },
  });
}

async function updateMany(map, tableId = cfg.phieuTableId, base) {
  return call('POST', baseUrl(tableId, base) + '/records/batch_update', { body: { update_records: map } });
}

async function createRecord(fields, tableId = cfg.phieuTableId, base) {
  const names = Object.keys(fields);
  return call('POST', baseUrl(tableId, base) + '/records/batch_create', {
    body: { fields: names, rows: [names.map((n) => fields[n])] },
  });
}

/**
 * Tạo nhiều bản ghi một lượt — xem chú thích ở lark.js.
 *
 * Dạng thân yêu cầu phải GIỐNG createRecord ở trên: `{ fields: [tên cột],
 * rows: [[giá trị]] }`. Bản đầu viết theo dạng `{ records: [{ fields }] }` của
 * Bitable Open API và tự ghép một URL khác — trên máy không lộ vì chế độ `cli`
 * đi đường hoàn toàn khác, còn trên Render thì mọi dòng việc mới đều trả
 * "Lark API 1254045: FieldNameNotFound", tức là không ai nộp được báo cáo nào.
 */
async function createMany(rows, tableId = cfg.phieuTableId, base) {
  if (!rows || !rows.length) return { records: [] };
  /* Hợp của mọi khoá, điền null cho ô thiếu — dòng không khai Ghi chú mà tin
   * rằng dòng đầu đã đủ cột thì cả bảng lệch cột. */
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return call('POST', baseUrl(tableId, base) + '/records/batch_create', {
    body: {
      fields: names,
      rows: rows.map((r) => names.map((n) => (n in r ? r[n] : null))),
    },
  });
}

async function deleteRecords(recordIds, tableId = cfg.phieuTableId, base) {
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

/* ---------------- tệp đính kèm (báo cáo tháng, 30/09/2026) ----------------
 * base/v3 không nhận ghi ô đính kèm như ô thường. Đường chuẩn của Open API:
 *   1. drive/v1/medias/upload_all (parent_type=bitable_file, parent_node=Base)
 *      → file_token
 *   2. bitable/v1 cập nhật bản ghi: ô đính kèm = danh sách CŨ + token mới
 *      (ghi đè cả ô, nên phải đọc danh sách cũ trước, không thì mất tệp cũ). */
const v1Rec = (tableId, recordId) => '/open-apis/bitable/v1/apps/' + cfg.baseToken + '/tables/' +
  tableId + '/records/' + recordId;

const tenCot = (id) => {
  for (const nhom of Object.values(cfg.fields)) for (const f of Object.values(nhom)) if (f && f.id === id) return f.name;
  return id;
};

async function tepHienCo(recordId, fieldId, tableId) {
  /* bitable/v1 trả và nhận ô theo TÊN cột — tra tên từ id trong config. */
  const ten = tenCot(fieldId);
  const d = await call('GET', v1Rec(tableId, recordId));
  const o = d.record && d.record.fields && d.record.fields[ten];
  return Array.isArray(o) ? o.map((x) => ({ file_token: x.file_token })) : [];
}

async function taiLenTep(recordId, fieldId, tep, tableId = cfg.phieuTableId) {
  const token = await tenantToken();
  const fd = new FormData();
  fd.append('file_name', tep.ten);
  fd.append('parent_type', 'bitable_file');
  fd.append('parent_node', cfg.baseToken);
  fd.append('size', String(tep.buf.length));
  fd.append('file', new Blob([tep.buf]), tep.ten);
  const r = await fetch(HOST + '/open-apis/drive/v1/medias/upload_all', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd, signal: han(180000),
  });
  const d = await r.json();
  if (d.code !== 0) throw new Error('Lark API ' + d.code + ' khi tải tệp lên: ' + (d.msg || ''));
  const ft = d.data.file_token;
  const cu = await tepHienCo(recordId, fieldId, tableId);
  await call('PUT', v1Rec(tableId, recordId), {
    body: { fields: { [tenCot(fieldId)]: cu.concat([{ file_token: ft }]) } },
  });
  return { file_token: ft };
}

async function xoaTep(recordId, fieldId, fileToken, tableId = cfg.phieuTableId) {
  const cu = await tepHienCo(recordId, fieldId, tableId);
  await call('PUT', v1Rec(tableId, recordId), {
    body: { fields: { [tenCot(fieldId)]: cu.filter((x) => x.file_token !== fileToken) } },
  });
  return { ok: true };
}

async function taiVeTep(recordId, fileToken, tableId = cfg.phieuTableId) {
  /* Base bật quyền nâng cao thì phải kèm `extra` chỉ đúng ô — gửi luôn cho chắc. */
  const extra = encodeURIComponent(JSON.stringify({ bitablePerm: { tableId, attachments: {
    [cfg.fields.phieu.tep.id]: { [recordId]: [fileToken] } } } }));
  return call('GET', '/open-apis/drive/v1/medias/' + fileToken + '/download?extra=' + extra, { raw: true, hanMs: HAN_TAI, retries: 2 });
}

module.exports = {
  taiLenTep, xoaTep, taiVeTep,
  guiTinNhan,
  cli, whoami, listAllRecords, listFields, getRecord,
  updateRecord, updateMany, createRecord, createMany, deleteRecords,
  tenantToken, call,
};
