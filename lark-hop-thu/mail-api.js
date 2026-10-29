'use strict';
/**
 * Lark Mail qua OpenAPI bằng user_access_token của TỪNG người (bản chạy chung
 * trên Render). Hub giữ token, chuyển xuống bằng header x-hub-thu-token; app
 * này không cất token ở đâu cả.
 *
 * Trả về ĐÚNG hình dạng mà các lệnh lark-cli trả cho thu.js (+triage,
 * +message, accessible_mailboxes), để phần trên không phải biết thư đến từ
 * đường nào. Các API gọi ở đây là đúng những gì lark-cli gọi (đã soi bằng
 * --dry-run ngày 28/10/2026):
 *   GET  user_mailboxes/me/accessible_mailboxes
 *   GET  user_mailboxes/<hộp>/messages?folder_id=INBOX     (chỉ ra mã thư)
 *   POST user_mailboxes/<hộp>/messages/batch_get           (format=metadata)
 *   GET  user_mailboxes/<hộp>/messages/<mã>                (thân thư base64url)
 *   POST user_mailboxes/<hộp>/messages/batch_modify
 *   POST user_mailboxes/<hộp>/drafts {raw: EML base64url} → drafts/<mã>/send
 *   POST calendar/v4/calendars/primary → calendars/<mã>/events  (Thêm vào lịch)
 */
const cfg = require('./config');

/** Token hết hạn, bị thu hồi, hoặc app chưa được cấp quyền mail: phải nối lại. */
class LoiToken extends Error {}
/** Token còn sống nhưng chưa có quyền lịch: mời người dùng cho phép thêm. */
class LoiQuyenLich extends Error {}
/** Không được đọc MỘT hộp (hộp chung chưa chia cho người này). Chỉ hộp đó báo
 *  lỗi, các hộp khác vẫn đọc. Đọc danh sách hộp mà gặp lỗi này thì thu.js mới
 *  đổi thành "phải nối lại". */
class LoiThieuQuyen extends Error {}

const MA_TOKEN = new Set([99991663, 99991664, 99991665, 99991668, 99991677, 20005, 20026, 20037]);
const MA_THIEU_QUYEN = new Set([99991672, 99991679, 99991676]);
const TRANSIENT = /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|EPIPE|fetch failed|aborted/i;
/* Lark chặn vì gọi dồn dập. Tám hộp, mỗi hộp hai ba thư mục, mỗi thư mục tới
 * 20 lượt gọi: chạm ngưỡng là chuyện thường, phải chờ rồi gọi lại, không được
 * bỏ cả hộp (29/10/2026, "chưa đọc được đủ hộp thư"). */
const MA_NHANH = new Set([99991400, 99991401, 1230008, 1254290]);
const LA_NHANH = /frequency|too many|rate limit|limit exceeded/i;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function goiMot(tk, method, duong, { query, body, goc = 'mail/v1/' } = {}) {
  const url = cfg.apiHost + '/open-apis/' + goc + duong + (query ? '?' + new URLSearchParams(query) : '');
  const r = await fetch(url, {
    method,
    headers: Object.assign({ Authorization: 'Bearer ' + tk },
      body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  const d = await r.json().catch(() => null);
  if (r.status === 429 || (d && (MA_NHANH.has(d.code) || LA_NHANH.test(d.msg || '')))) {
    throw Object.assign(new Error('Lark Mail đang giới hạn tốc độ đọc. Thử lại sau ít giây.'), { nhanh: true });
  }
  if (!d) throw new Error('Lark Mail trả về dữ liệu hỏng (HTTP ' + r.status + ')');
  if (d.code !== 0) {
    if (MA_TOKEN.has(d.code) || r.status === 401) {
      throw new LoiToken('Phiên nối hộp thư đã hết. Bấm Nối hộp thư để nối lại.');
    }
    if (MA_THIEU_QUYEN.has(d.code) && goc.startsWith('calendar')) {
      throw new LoiQuyenLich('Marketing Hub chưa được phép thêm lịch cho anh/chị.');
    }
    if (MA_THIEU_QUYEN.has(d.code)) {
      throw new LoiThieuQuyen('Chưa được cấp quyền đọc hộp thư này.');
    }
    throw new Error('Lark Mail: ' + (d.msg || 'lỗi') + ' (' + d.code + ')');
  }
  return d.data || {};
}

/** Lệnh đọc thử lại khi mạng chập chờn; lệnh ghi thì không (gửi hai lần còn tệ hơn báo lỗi). */
async function goi(tk, method, duong, opts = {}) {
  let last;
  for (let i = 0; i < 4; i++) {
    try { return await goiMot(tk, method, duong, opts); } catch (e) {
      last = e;
      const lai = e.nhanh ? i < 3 : i < 2 && TRANSIENT.test(e.message);
      if (opts.ghi || !lai || e instanceof LoiToken) throw e;
      /* bị chặn vì nhanh thì lùi lâu hơn, có chút ngẫu nhiên để tám hộp không cùng gọi lại một lúc */
      await wait(e.nhanh ? 900 * Math.pow(2, i) + Math.random() * 400 : 400 * Math.pow(2, i));
    }
  }
  throw last;
}

const hopDuong = (hop) => 'user_mailboxes/' + encodeURIComponent(hop || 'me');

/* Ngày giờ theo giờ Việt Nam như lark-cli in ra ("2026-10-27 13:06"). Máy
 * Render chạy giờ UTC, nên không dùng giờ máy. */
const DINH_NGAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function ngayVN(ms) {
  const n = Number(ms);
  if (!n) return '';
  const p = Object.fromEntries(DINH_NGAY.formatToParts(new Date(n)).map((x) => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute;
}

const giaiB64 = (s) => (s ? Buffer.from(String(s), 'base64url').toString('utf8') : '');

/** Tiêu đề MIME kiểu "=?utf-8?b?...?=" (trường reply_to Lark trả thô). */
function giaiMime(s) {
  return String(s || '').replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (m, bang, kieu, chu) => {
    try {
      if (kieu.toLowerCase() === 'b') return Buffer.from(chu, 'base64').toString('utf8');
      const b = chu.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16)));
      return Buffer.from(b, 'latin1').toString('utf8');
    } catch (_) { return m; }
  }).replace(/\?=\s+=\?/g, '');
}

/** "Tên <a@b>, c@d" → [{ ten, email }] */
function tachDsDiaChi(s) {
  return giaiMime(s).split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => {
    const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(x);
    if (m) return { name: m[1].trim(), mail_address: m[2].trim() };
    return { name: '', mail_address: x.trim() };
  }).filter((x) => /@/.test(x.mail_address));
}

/* ---------------- đọc ---------------- */

async function cacHop(tk) {
  return goi(tk, 'GET', 'user_mailboxes/me/accessible_mailboxes');
}

/** Giống `+triage --format data --labels`: { messages: [{ message_id, date, from, subject, labels, … }] } */
async function triage(tk, hop, max, thuMuc = 'INBOX') {
  const ids = [];
  let page = '';
  while (ids.length < max) {
    const q = { folder_id: thuMuc, page_size: String(Math.min(20, max - ids.length)) };
    if (page) q.page_token = page;
    const d = await goi(tk, 'GET', hopDuong(hop) + '/messages', { query: q });
    ids.push(...(d.items || []));
    if (!d.has_more || !d.page_token) break;
    page = d.page_token;
  }
  const messages = [];
  for (let i = 0; i < ids.length; i += 20) {
    const d = await goi(tk, 'POST', hopDuong(hop) + '/messages/batch_get',
      { body: { format: 'metadata', message_ids: ids.slice(i, i + 20) } });
    for (const m of d.messages || []) {
      const f = m.head_from || {};
      messages.push({
        message_id: m.message_id,
        thread_id: m.thread_id || '',
        date: ngayVN(m.internal_date),
        from: f.name ? f.name + ' <' + (f.mail_address || '') + '>' : (f.mail_address || ''),
        subject: m.subject || '',
        labels: (m.label_ids || []).join(','),
      });
    }
  }
  return { messages };
}

/** Thư thô từ Lark, thân đã giải base64url. */
async function thuTho(tk, hop, id) {
  const d = await goi(tk, 'GET', hopDuong(hop) + '/messages/' + encodeURIComponent(id));
  const m = d.message || d;
  return Object.assign({}, m, {
    body_html: giaiB64(m.body_html),
    body_plain_text: giaiB64(m.body_plain_text),
  });
}

/** Giống `+message`. */
async function message(tk, hop, id) {
  const m = await thuTho(tk, hop, id);
  return Object.assign(m, { date_formatted: ngayVN(m.internal_date) });
}

/* ---------------- ghi ---------------- */

const THU_MUC = { archive: 'ARCHIVED', inbox: 'INBOX' };

async function modify(tk, hop, ids, { them = [], bo = [], thuMuc = '' } = {}) {
  const body = { message_ids: ids };
  if (them.length) body.add_label_ids = them;
  if (bo.length) body.remove_label_ids = bo;
  if (thuMuc) body.add_folder = THU_MUC[thuMuc] || thuMuc;
  return goi(tk, 'POST', hopDuong(hop) + '/messages/batch_modify', { body, ghi: true });
}

/* Tiêu đề thư có dấu phải mã hoá kiểu RFC 2047, không thì người nhận thấy chữ vỡ. */
const maTieuDe = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=');
const diaChi = (x) => (x.name ? maTieuDe(x.name.replace(/["\r\n]/g, '')) + ' ' : '') + '<' + x.mail_address + '>';
const goc = (s) => { const v = String(s || '').trim(); return !v ? '' : v[0] === '<' ? v : '<' + v + '>'; };
const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Dựng thư trả lời dạng EML. Tách ra để test được mà không gọi Lark. */
function dungTraLoi(hop, g, htmlMoi, { tatCa = false } = {}) {
  const minh = String(hop).toLowerCase();
  const khongPhaiMinh = (x) => String(x.mail_address || '').toLowerCase() !== minh;
  const nhanTraLoi = tachDsDiaChi(g.reply_to);
  const dich = nhanTraLoi.length ? nhanTraLoi : [g.head_from || {}].filter((x) => x.mail_address);
  const daCo = new Set();
  const loc = (ds) => ds.filter((x) => {
    const k = String(x.mail_address || '').toLowerCase();
    if (!k || daCo.has(k) || !khongPhaiMinh(x)) return false;
    daCo.add(k);
    return true;
  });
  let to = loc(dich);
  let cc = [];
  if (tatCa) {
    to = to.concat(loc(g.to || []));
    cc = loc(g.cc || []);
  }
  /* Tự trả lời thư của chính mình (thư mình gửi đi rồi người ta chưa đáp):
   * gửi lại cho những người nhận ban đầu. */
  if (!to.length) to = loc(g.to || []);
  if (!to.length) throw new Error('Thư này không có địa chỉ nào để trả lời');

  const tieuDe = /^\s*(re|trả lời|回复)\s*:/i.test(g.subject || '') ? g.subject : 'Re: ' + (g.subject || '');
  const moc = goc(g.smtp_message_id);
  const thamChieu = [String(g.references || '').trim(), moc].filter(Boolean).join(' ');
  const f = g.head_from || {};
  const trich = '<div class="history-quote-wrapper"><div>Vào ' + escHtml(ngayVN(g.internal_date)) + ', ' +
    escHtml(f.name ? f.name + ' <' + f.mail_address + '>' : f.mail_address || '') + ' đã viết:</div>' +
    '<blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">' +
    (g.body_html || escHtml(g.body_plain_text || '')) + '</blockquote></div>';
  const than = Buffer.from('<div>' + htmlMoi + '</div><br>' + trich, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');

  const dau = [
    'From: <' + hop + '>',
    'To: ' + to.map(diaChi).join(', '),
    cc.length ? 'Cc: ' + cc.map(diaChi).join(', ') : '',
    'Subject: ' + maTieuDe(tieuDe),
    moc ? 'In-Reply-To: ' + moc : '',
    thamChieu ? 'References: ' + thamChieu : '',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  return { eml: dau.join('\r\n') + '\r\n\r\n' + than + '\r\n', to, cc };
}

async function traLoi(tk, hop, id, htmlMoi, { gui = false, tatCa = false } = {}) {
  const g = await thuTho(tk, hop, id);
  const { eml } = dungTraLoi(hop, g, htmlMoi, { tatCa });
  const d = await goi(tk, 'POST', hopDuong(hop) + '/drafts',
    { body: { raw: Buffer.from(eml, 'utf8').toString('base64url') }, ghi: true });
  const draftId = d.draft_id || (d.draft && (d.draft.draft_id || d.draft.id)) || d.id || '';
  if (!gui) return { draft_id: draftId };
  if (!draftId) throw new Error('Lark Mail không trả mã nháp, thư chưa được gửi');
  const s = await goi(tk, 'POST', hopDuong(hop) + '/drafts/' + encodeURIComponent(draftId) + '/send', { ghi: true });
  return Object.assign({ draft_id: draftId }, s);
}

/* ---------------- lịch ---------------- */

/** Tạo một sự kiện trên lịch chính của người dùng. Thời điểm là mili giây. */
async function taoLich(tk, { tieuDe, moTa = '', batDau, ketThuc }) {
  const c = await goi(tk, 'POST', 'calendars/primary', { goc: 'calendar/v4/', body: {} });
  const lich = (((c.calendars || [])[0] || {}).calendar || {}).calendar_id;
  if (!lich) throw new Error('Lark chưa trả lịch chính của anh/chị');
  const d = await goi(tk, 'POST', 'calendars/' + encodeURIComponent(lich) + '/events', {
    goc: 'calendar/v4/',
    ghi: true,
    body: {
      summary: tieuDe,
      description: moTa,
      start_time: { timestamp: String(Math.floor(batDau / 1000)) },
      end_time: { timestamp: String(Math.floor(ketThuc / 1000)) },
      reminders: [{ minutes: 30 }],
    },
  });
  return { event_id: (d.event || {}).event_id || '', app_link: (d.event || {}).app_link || '' };
}

module.exports = { LoiToken, LoiQuyenLich, LoiThieuQuyen, taoLich, cacHop, triage, message, modify, traLoi, dungTraLoi, ngayVN, giaiMime, tachDsDiaChi };
