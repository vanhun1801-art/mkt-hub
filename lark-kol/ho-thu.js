'use strict';
/**
 * Hộp thư gửi email trên Hub (chế độ api) — anh Hùng 24/09 chọn "Kết nối hộp thư".
 *
 * Lark chỉ có quyền GỬI thư ở loại User token (mail:user_mailbox.message:send không có bản
 * tenant), nên app không tự đứng tên gửi được. Anh bấm "Kết nối hộp thư" một lần:
 *   /api/mail/ket-noi → trang đồng ý của Lark (scope gửi thư + offline_access)
 *   → /mail-callback?code= → đổi lấy access + refresh token (OAuth v2)
 * Refresh token lưu MÃ HOÁ (AES-256-GCM, khoá dẫn từ app secret) vào bảng "Cài đặt" của Base KOL —
 * không lưu tệp vì tệp trên Render mất sau mỗi lần deploy. Access token chỉ nằm trong bộ nhớ.
 * Lark đổi refresh token mỗi lần làm mới → ghi lại ngay bản mới.
 */
const crypto = require('crypto');
const cfg = require('./config');
const lark = require('./lark');

const BANG = cfg.bang.caiDat;
const KHOA = 'mail.phien';
/* gửi thư + đọc thư trả lời (theo-doi-mail.js) + giữ phiên lâu dài */
const QUYEN_DOC = ['mail:user_mailbox.message:readonly', 'mail:user_mailbox.message.subject:read', 'mail:user_mailbox.message.body:read', 'mail:user_mailbox.message.address:read'];
/* Lưu NHÁP là thao tác SỬA hộp thư, không phải gửi — Lark đòi một quyền
 * riêng. Thiếu nó thì /drafts trả 99991679 "required one of these privileges:
 * mail:user_mailbox.message:modify", đúng lỗi ngày 25/09/2026.
 *
 * Thêm quyền vào đây CHƯA đủ: phiên đã kết nối vẫn mang bộ quyền cũ, phải
 * Ngắt kết nối rồi Kết nối hộp thư lại thì Lark mới hỏi cấp quyền mới. Câu
 * lỗi ở goiThu() nói thẳng điều đó. */
const QUYEN_SUA = 'mail:user_mailbox.message:modify';
const PHAM_VI = ['mail:user_mailbox.message:send', QUYEN_SUA, ...QUYEN_DOC, 'offline_access'].join(' ');
const ACC = (cfg.apiHost || 'https://open.larksuite.com').replace('open.', 'accounts.');
const goiLai = () => (process.env.PUBLIC_URL || '').replace(/\/+$/, '') + (process.env.HUB_PREFIX || '') + '/mail-callback';

/* ---------- mã hoá ---------- */
const khoa = () => crypto.createHash('sha256').update('kol-mail|' + cfg.appSecret).digest();
function ma(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', khoa(), iv);
  const b = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), b].map((x) => x.toString('base64url')).join('.');
}
function giai(s) {
  const [iv, tag, b] = String(s || '').split('.').map((x) => Buffer.from(x, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', khoa(), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(b), d.final()]).toString('utf8'));
}

/* ---------- lưu trên Base ---------- */
const chu = (v) => (Array.isArray(v) ? v.map((p) => (typeof p === 'string' ? p : (p && p.text) || '')).join('') : v == null ? '' : String(v)).trim();
let idCot = null;
async function cot() {
  if (idCot) return idCot;
  const f = await lark.listFields(BANG);
  const tim = (ten) => (f.find((x) => (x.name || x.field_name) === ten) || {});
  idCot = { khoa: tim('Khoá').id || tim('Khoá').field_id, giaTri: tim('Giá trị').id || tim('Giá trị').field_id };
  return idCot;
}
async function docDong(k = KHOA) {
  const c = await cot();
  const ds = await lark.listAllRecords(BANG);
  return ds.find((r) => chu(r.cells[c.khoa] ?? r.cells['Khoá']) === k) || null;
}
/* Chữ ký email (anh Hùng 24/09: gửi qua API thì Lark Mail KHÔNG tự gắn chữ ký như khi soạn tay) —
 * anh dán chữ ký một lần trong app, lưu HTML ở bảng Cài đặt, gắn cuối mọi thư gửi từ Hub. */
/* hai chữ ký: tiếng Việt (mail.chuKy) và tiếng Anh cho thư gửi KOL nước ngoài (mail.chuKyEn).
 * Thư tiếng Anh chưa có chữ ký riêng thì dùng chữ ký tiếng Việt (trừ khi hỏi `dung` = đúng bản đó). */
const KHOA_CK = { vi: 'mail.chuKy', en: 'mail.chuKyEn' };
const chuKyDem = {};
async function chuKy(lang = 'vi', dung = false) {
  const k = lang === 'en' ? 'en' : 'vi';
  if (chuKyDem[k] == null) {
    const r = await docDong(KHOA_CK[k]);
    const c = await cot();
    chuKyDem[k] = r ? chu(r.cells[c.giaTri] ?? r.cells['Giá trị']) : '';
  }
  if (k === 'en' && !chuKyDem.en && !dung) return chuKy('vi');
  return chuKyDem[k];
}
/* chỉ giữ HTML trình bày: bỏ script/style/iframe, thuộc tính on*, link javascript: */
const sachHtml = (h) => String(h || '').replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '').replace(/<(script|iframe|object|embed)[^>]*>/gi, '')
  .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"').trim();
async function ghiChuKy(html, lang = 'vi') {
  const k = lang === 'en' ? 'en' : 'vi';
  const h = sachHtml(html);
  if (h.length > 60000) throw Object.assign(new Error('Chữ ký quá nặng (' + Math.round(h.length / 1000) + ' KB) — thường do ảnh dán thẳng vào. Dùng ảnh có đường link (https) thay vì ảnh dán.'), { http: 400 });
  const r = await docDong(KHOA_CK[k]);
  const f = { 'Khoá': KHOA_CK[k], 'Giá trị': h, 'Ghi chú': 'Chữ ký HTML ' + (k === 'en' ? 'tiếng Anh' : 'tiếng Việt') + ' gắn cuối email gửi từ Hub (sửa trong app KOL)' };
  if (r) await lark.updateRecord(r.record_id, f, BANG); else await lark.createRecord(f, BANG);
  chuKyDem[k] = h;
  return h;
}
let phien = null;           // { refresh, hetRefresh, email, ten, luc } — giải mã từ Base
let access = null;          // { token, het }
let daDoc = false;
async function napPhien() {
  if (daDoc) return phien;
  daDoc = true;
  try {
    const r = await docDong();
    const c = await cot();
    const v = r && chu(r.cells[c.giaTri] ?? r.cells['Giá trị']);
    phien = v ? giai(v) : null;
  } catch (e) { console.error('[HỘP THƯ] không đọc được phiên:', e.message); phien = null; daDoc = false; }
  return phien;
}
async function luuPhien(p) {
  phien = p; daDoc = true;
  const r = await docDong();
  const f = { 'Khoá': KHOA, 'Giá trị': p ? ma(p) : '', 'Ghi chú': p ? 'Phiên gửi mail của ' + p.email + ' (mã hoá) — đừng sửa tay' : 'Đã ngắt kết nối' };
  if (r) await lark.updateRecord(r.record_id, f, BANG); else await lark.createRecord(f, BANG);
}

/* ---------- OAuth ---------- */
const choState = new Map();   // state → hết hạn
function urlKetNoi() {
  if (!cfg.appId || !process.env.PUBLIC_URL) throw new Error('Thiếu LARK_APP_ID hoặc PUBLIC_URL — chỉ kết nối được trên bản chạy ở Hub.');
  const st = crypto.randomBytes(16).toString('hex');
  choState.set(st, Date.now() + 10 * 60000);
  const q = new URLSearchParams({ client_id: cfg.appId, response_type: 'code', redirect_uri: goiLai(), scope: PHAM_VI, state: st });
  return ACC + '/open-apis/authen/v1/authorize?' + q;
}
async function doiToken(than) {
  const r = await fetch(cfg.apiHost + '/open-apis/authen/v2/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ client_id: cfg.appId, client_secret: cfg.appSecret, ...than }),
  });
  const d = await r.json();
  if (d.code && d.code !== 0 || !d.access_token) throw new Error('Lark từ chối cấp phiên: ' + (d.error_description || d.msg || d.error || d.code));
  return d;
}
async function nhanCode(code, state) {
  const het = choState.get(state);
  choState.delete(state);
  if (!het || het < Date.now()) throw new Error('Liên kết kết nối đã hết hạn — bấm "Kết nối hộp thư" lại.');
  const d = await doiToken({ grant_type: 'authorization_code', code, redirect_uri: goiLai() });
  if (!/mail:user_mailbox\.message:send/.test(d.scope || '')) throw new Error('Lark chưa cấp quyền gửi thư (scope nhận được: ' + (d.scope || 'trống') + '). Kiểm quyền User token của app Marketing Hub đã phát hành chưa.');
  if (!d.refresh_token) throw new Error('Lark không trả refresh token — thiếu quyền offline_access.');
  const u = await (await fetch(cfg.apiHost + '/open-apis/authen/v1/user_info', { headers: { Authorization: 'Bearer ' + d.access_token } })).json();
  const email = (u.data && (u.data.enterprise_email || u.data.email)) || '';
  access = { token: d.access_token, het: Date.now() + (d.expires_in - 120) * 1000 };
  await luuPhien({ refresh: d.refresh_token, hetRefresh: Date.now() + (d.refresh_token_expires_in || 0) * 1000, email, ten: (u.data && u.data.name) || '', luc: Date.now(), quyen: d.scope || '' });
  return phien;
}
async function tokenGui() {
  if (access && access.het > Date.now()) return access.token;
  const p = await napPhien();
  if (!p) throw Object.assign(new Error('Chưa kết nối hộp thư — bấm "Kết nối hộp thư" trong khung email rồi đăng nhập Lark bằng tài khoản giữ hộp thư gửi.'), { http: 424 });
  let d;
  try { d = await doiToken({ grant_type: 'refresh_token', refresh_token: p.refresh }); } catch (e) {
    throw Object.assign(new Error('Phiên hộp thư đã hết hạn hoặc bị thu hồi — bấm "Kết nối hộp thư" lại. (' + e.message + ')'), { http: 424 });
  }
  access = { token: d.access_token, het: Date.now() + (d.expires_in - 120) * 1000 };
  await luuPhien({ ...p, quyen: d.scope || p.quyen || '', refresh: d.refresh_token || p.refresh, hetRefresh: d.refresh_token_expires_in ? Date.now() + d.refresh_token_expires_in * 1000 : p.hetRefresh });
  return access.token;
}

/* ---------------------------------------------------------------------------
 * ĐƯỜNG NHÁP — để có ĐÍNH KÈM và để "Lưu nháp" chạy được trên Hub
 * -------------------------------------------------------------------------
 * `messages/send` (hàm gui bên dưới) nhận {subject, to, body_html}: gọn, nhưng
 * chỉ gửi thẳng được và KHÔNG đính kèm được tệp nào. Nên trên Hub bấm "Lưu
 * nháp" là báo không làm được, và báo cáo quỹ gửi Ban Giám Đốc thì thiếu tệp
 * Excel — anh Hùng gặp ngày 25/09/2026.
 *
 * `drafts` thì nhận cả lá thư MIME mã base64url, nên có đính kèm và có nháp:
 *
 *   POST …/drafts                 → { draft_id }
 *   POST …/drafts/{id}/send       → gửi lá nháp đó đi
 *
 * Gửi = tạo nháp rồi gửi nháp. Hai lời gọi thay vì một, đổi lại là một đường
 * duy nhất lo cả nháp lẫn gửi lẫn đính kèm — ba nhánh riêng thì hai nhánh ít
 * dùng sẽ hỏng lặng lẽ.
 */
const { dungEml, sangRaw } = require('../lark-chung/eml');

async function goiThu(duong, than) {
  const token = await tokenGui();
  const r = await fetch(cfg.apiHost + duong, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(than || {}),
  });
  const d = await r.json().catch(() => ({ code: r.status, msg: 'HTTP ' + r.status }));
  if (d.code !== 0) {
    /* Câu của Lark là một đoạn tiếng Anh dài nói "required one of these
     * privileges…" — người bấm nút đọc xong vẫn không biết phải làm gì. Dịch
     * thành đúng một việc: đi kết nối lại hộp thư. */
    const thieuQuyen = d.code === 99991679 || /privilege|permission|scope|unauthorized/i.test(String(d.msg || ''));
    throw Object.assign(new Error('Lark Mail: ' + (d.msg || d.code) + ' (mã ' + d.code + ')'),
      { http: 424, maLark: d.code, thieuQuyen });
  }
  return d.data || {};
}

/**
 * Lưu một lá NHÁP (có thể kèm tệp). Trả { draftId }.
 * @param {Array} [dinhKem] [{ten, kieu, than:Buffer}]
 */
async function nhap({ tu, den, cc, tieuDe, html, ten, dinhKem }) {
  const eml = dungEml({
    tu: { email: tu || undefined, ten: ten || 'Rooty Trip Phú Quốc' },
    den, cc, tieuDe, html, dinhKem,
  });
  const raw = sangRaw(eml);

  /* GỬI THAY và LƯU NHÁP THAY là hai chuyện khác nhau.
   *
   * Gửi từ cmo@ bằng phiên của người khác thì Lark cho, vì đó là địa chỉ gửi
   * thay (send_as). Nhưng lá NHÁP phải nằm trong một hộp thư THẬT, và đặt nó
   * vào hộp thư của người khác là thao tác trên tài nguyên của người ta — Lark
   * từ chối kể cả khi phiên đã có quyền sửa hộp thư của CHÍNH MÌNH.
   *
   * Nên thử hộp thư được chỉ định trước; hỏng vì quyền thì lùi về 'me' — hộp
   * thư của chính người đã kết nối. Lá nháp nằm ở đó cũng đúng chỗ: người mở
   * Lark Mail ra đọc lại rồi bấm gửi chính là người ấy. Dòng From vẫn là cmo@
   * vì nó nằm trong lá thư MIME, không phụ thuộc hộp thư chứa nháp.
   */
  const thu = [...new Set([tu || 'me', 'me'])];
  let loiCuoi = null;
  for (const hop of thu) {
    try {
      const d = await goiThu('/open-apis/mail/v1/user_mailboxes/' + encodeURIComponent(hop) + '/drafts',
        { raw });
      const id = d.message_id || d.draft_id || d.id;
      if (!id) throw Object.assign(new Error('Lark Mail nhận lá nháp nhưng không trả về mã nháp'), { http: 502 });
      return { draftId: id, hop };
    } catch (e) {
      loiCuoi = e;
      if (!e.thieuQuyen) throw e;        // lỗi khác thì đừng thử mò tiếp
    }
  }
  /* Hết đường: lúc này mới là thiếu quyền thật. Nói đúng việc phải làm, thay vì
   * đưa nguyên đoạn tiếng Anh của Lark. */
  const p = (phien && phien.quyen) || '';
  throw Object.assign(new Error(
    'Chưa lưu nháp được vào hộp thư nào (' + thu.join(', ') + '). '
    + (p.includes(QUYEN_SUA)
      ? 'Phiên ĐÃ có quyền ' + QUYEN_SUA + ', nên nhiều khả năng tài khoản đã kết nối ('
        + ((phien && phien.email) || '?') + ') không phải chủ hộp thư đó.'
      : 'Phiên hiện tại CHƯA có quyền ' + QUYEN_SUA + ' — vào Cài đặt → Kết nối hộp thư, '
        + 'Ngắt kết nối rồi Kết nối lại.')
    + ' Lark nói: ' + (loiCuoi ? loiCuoi.message : ''),
  ), { http: 424 });
}

/** Gửi một lá nháp đã lưu. */
async function guiNhap(hop, draftId) {
  return goiThu('/open-apis/mail/v1/user_mailboxes/' + encodeURIComponent(hop || 'me')
    + '/drafts/' + encodeURIComponent(draftId) + '/send', {});
}

/** Gửi thư CÓ ĐÍNH KÈM: lưu nháp rồi gửi chính lá nháp đó. */
async function guiKemTep(t) {
  const n = await nhap(t);
  /* Nháp đã tạo mà gửi hỏng thì KHÔNG xoá hộ: lá nháp còn nằm trong Lark Mail
   * là thứ người dùng mở ra bấm gửi tay được. Xoá đi là mất cả công soạn. */
  try {
    await guiNhap(n.hop, n.draftId);
  } catch (e) {
    throw Object.assign(new Error('Đã lưu nháp nhưng chưa gửi được: ' + e.message
      + ' — mở Lark Mail, lá thư đang nằm trong mục Nháp.'), { http: e.http || 502 });
  }
  return n;
}

/** Gửi bằng phiên đã kết nối. `tu` = hộp thư gửi (cmo@…); để trống = hộp thư chính của người kết nối. */
async function gui({ tu, den, cc, tieuDe, html, ten }) {
  const token = await tokenGui();
  const body = { subject: tieuDe, to: den.map((x) => ({ mail_address: x })), body_html: html, head_from: { name: ten || 'Rooty Trip Phú Quốc' } };
  if (cc.length) body.cc = cc.map((x) => ({ mail_address: x }));
  const hop = tu || 'me';
  /* KHÔNG thử lại: lỗi mạng sau khi thư đã đi mà thử lại là gửi hai lần */
  const r = await fetch(cfg.apiHost + '/open-apis/mail/v1/user_mailboxes/' + encodeURIComponent(hop) + '/messages/send', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({ code: r.status, msg: 'HTTP ' + r.status }));
  if (d.code !== 0) {
    const e = new Error('Lark Mail từ chối gửi từ ' + hop + ': ' + (d.msg || d.code) + ' (mã ' + d.code + ')' +
      (hop !== 'me' ? '. Tài khoản đã kết nối (' + ((phien && phien.email) || '?') + ') cần là chủ hoặc được uỷ quyền gửi thay hộp thư ' + hop + '.' : ''));
    e.http = 424;
    throw e;
  }
  return d.data || {};
}

/* ---------- đọc thư (bộ theo dõi thư trả lời trên Hub) ---------- */
async function goiDoc(duong) {
  const token = await tokenGui();
  const r = await fetch(cfg.apiHost + '/open-apis/mail/v1/user_mailboxes/' + duong, { headers: { Authorization: 'Bearer ' + token } });
  const d = await r.json().catch(() => ({ code: r.status, msg: 'HTTP ' + r.status }));
  if (d.code !== 0) {
    const e = new Error(/99991679|99991672|scope|permission/i.test(String(d.msg) + d.code)
      ? 'Phiên hộp thư chưa có quyền đọc thư — bấm Ngắt kết nối rồi Kết nối hộp thư lại để cấp quyền đọc.'
      : 'Lark Mail: ' + (d.msg || d.code) + ' (mã ' + d.code + ')' +
        (d.error && d.error.field_violations ? ' — ' + d.error.field_violations.map((f) => f.field + ': ' + (f.description || f.value || '')).join('; ') : ''));
    e.code = d.code; throw e;
  }
  return d.data || {};
}
const b64 = (s) => { try { return Buffer.from(String(s || ''), 'base64url').toString('utf8'); } catch (_) { return String(s || ''); } };
const daDocThu = new Map();   // message_id → thư đã tải (thư không đổi nên nhớ trong phiên chạy)
/**
 * Thư mới trong Hộp thư đến của `hop` (mặc định hộp thư gửi): [{id, luong, tieuDe, tu, luc, noiDung}], mới trước.
 * Chỉ đọc `toiDa` thư gần nhất — thư trả lời BGĐ/KOL thường tới trong vài ngày.
 */
let hopDoc = null;   // hộp thư đọc được (nhớ sau lần đầu)
async function thuDen(hop, toiDa = 20) {
  const thu = [...new Set([hopDoc, hop, cfg.mail.from || 'cmo@rootytrip.com', 'me'].filter(Boolean))];
  let ds = null, h = '', loiCuoi = null;
  for (const x of thu) {
    h = encodeURIComponent(x);
    /* API danh sách thư của Lark nhận page_size tối đa 20 (40 → lỗi 99992402 field validation failed) */
    try { ds = await goiDoc(h + '/messages?folder_id=INBOX&page_size=' + Math.min(toiDa, 20)); hopDoc = x; break; }
    catch (e) { loiCuoi = e; if (/quyền đọc/.test(e.message)) throw e; }
  }
  if (!ds) throw loiCuoi;
  const ids = (ds.items || []).slice(0, toiDa);
  const out = [];
  for (const id of ids) {
    if (!daDocThu.has(id)) {
      const m = (await goiDoc(h + '/messages/' + encodeURIComponent(id))).message || {};
      daDocThu.set(id, {
        id, luong: m.thread_id || '', tieuDe: m.subject || '',
        tu: String((m.head_from && m.head_from.mail_address) || '').toLowerCase(),
        luc: Number(m.internal_date) || 0,
        noiDung: b64(m.body_plain_text) || b64(m.body_html).replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|blockquote)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' '),
      });
    }
    out.push(daDocThu.get(id));
  }
  return out.sort((a, b) => b.luc - a.luc);
}
const coQuyenDoc = () => !!(phien && (hopDoc || /mail:user_mailbox\.message(:readonly|\.body:read)/.test(String(phien.quyen || ''))));
/* Phiên kết nối TRƯỚC 25/09/2026 không có quyền sửa, nên lưu nháp và đính kèm
 * sẽ hỏng. Bày ra ở màn hình Kết nối hộp thư để thấy trước khi bấm, thay vì
 * bấm rồi mới nhận câu lỗi. */
const coQuyenSua = () => !!(phien && String(phien.quyen || '').includes(QUYEN_SUA));

async function trangThai() {
  const p = await napPhien().catch(() => null);
  /* Trả luôn chuỗi quyền Lark ĐÃ cấp. Không có nó thì lúc hỏng phải đoán giữa
   * "chưa cấp quyền" và "cấp rồi nhưng sai hộp thư" — hai bệnh, hai cách chữa. */
  return p ? { ketNoi: true, email: p.email, ten: p.ten, luc: p.luc,
    docDuoc: coQuyenDoc(), nhapDuoc: coQuyenSua(), quyen: String(p.quyen || '') } : { ketNoi: false };
}
async function ngat() { access = null; await luuPhien(null); }

module.exports = { urlKetNoi, nhanCode, gui, nhap, guiNhap, guiKemTep, trangThai, ngat, goiLai, thuDen, napPhien, coQuyenDoc, coQuyenSua, PHAM_VI, chuKy, ghiChuKy, _ma: ma, _giai: giai };
