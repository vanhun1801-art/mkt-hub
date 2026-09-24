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
const PHAM_VI = 'mail:user_mailbox.message:send offline_access';
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
async function docDong() {
  const c = await cot();
  const ds = await lark.listAllRecords(BANG);
  return ds.find((r) => chu(r.cells[c.khoa] ?? r.cells['Khoá']) === KHOA) || null;
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
  await luuPhien({ refresh: d.refresh_token, hetRefresh: Date.now() + (d.refresh_token_expires_in || 0) * 1000, email, ten: (u.data && u.data.name) || '', luc: Date.now() });
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
  await luuPhien({ ...p, refresh: d.refresh_token || p.refresh, hetRefresh: d.refresh_token_expires_in ? Date.now() + d.refresh_token_expires_in * 1000 : p.hetRefresh });
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

async function trangThai() {
  const p = await napPhien().catch(() => null);
  return p ? { ketNoi: true, email: p.email, ten: p.ten, luc: p.luc } : { ketNoi: false };
}
async function ngat() { access = null; await luuPhien(null); }

module.exports = { urlKetNoi, nhanCode, gui, trangThai, ngat, goiLai, _ma: ma, _giai: giai };
