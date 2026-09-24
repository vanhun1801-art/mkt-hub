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
const PHAM_VI = ['mail:user_mailbox.message:send', ...QUYEN_DOC, 'offline_access'].join(' ');
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
const KHOA_CK = 'mail.chuKy';
let chuKyDem = null;
async function chuKy() {
  if (chuKyDem !== null) return chuKyDem;
  const r = await docDong(KHOA_CK);
  const c = await cot();
  chuKyDem = r ? chu(r.cells[c.giaTri] ?? r.cells['Giá trị']) : '';
  return chuKyDem;
}
/* chỉ giữ HTML trình bày: bỏ script/style/iframe, thuộc tính on*, link javascript: */
const sachHtml = (h) => String(h || '').replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '').replace(/<(script|iframe|object|embed)[^>]*>/gi, '')
  .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"').trim();
async function ghiChuKy(html) {
  const h = sachHtml(html);
  if (h.length > 60000) throw Object.assign(new Error('Chữ ký quá nặng (' + Math.round(h.length / 1000) + ' KB) — thường do ảnh dán thẳng vào. Dùng ảnh có đường link (https) thay vì ảnh dán.'), { http: 400 });
  const r = await docDong(KHOA_CK);
  const f = { 'Khoá': KHOA_CK, 'Giá trị': h, 'Ghi chú': 'Chữ ký HTML gắn cuối email gửi từ Hub (sửa trong app KOL)' };
  if (r) await lark.updateRecord(r.record_id, f, BANG); else await lark.createRecord(f, BANG);
  chuKyDem = h;
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

async function trangThai() {
  const p = await napPhien().catch(() => null);
  return p ? { ketNoi: true, email: p.email, ten: p.ten, luc: p.luc, docDuoc: coQuyenDoc() } : { ketNoi: false };
}
async function ngat() { access = null; await luuPhien(null); }

module.exports = { urlKetNoi, nhanCode, gui, trangThai, ngat, goiLai, thuDen, napPhien, coQuyenDoc, chuKy, ghiChuKy, _ma: ma, _giai: giai };
