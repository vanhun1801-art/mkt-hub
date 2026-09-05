'use strict';
/** Gọi HTTP ra ngoài: timeout, thử lại lỗi tạm thời, không bao giờ log token. */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sổ đăng ký bí mật cần che.
 *
 * Chỉ che theo mẫu `access_token=...` là chưa đủ: Meta trả về những câu như
 * "Malformed access token EAAG…" — token nằm trần trong câu, không có dấu `=`.
 * Câu đó mà in ra terminal rồi lọt vào dong-bo.log là token coi như lộ.
 * Nên đăng ký giá trị thật vào đây và cắt thẳng theo chuỗi.
 */
const secrets = new Set();

/** Đăng ký một chuỗi bí mật để mọi thông báo về sau đều che nó đi. */
function hideSecret(v) {
  const s = String(v == null ? '' : v).trim();
  if (s.length >= 12) secrets.add(s);
}

/** Che token/khoá khỏi thông báo lỗi và log. */
const scrub = (s) => {
  let out = String(s == null ? '' : s);
  for (const sec of secrets) if (out.includes(sec)) out = out.split(sec).join('***');
  return out
    .replace(/(access_token|Access-Token|token|key)=([^&\s"']+)/gi, '$1=***')
    .replace(/"(access_?token)"\s*:\s*"[^"]*"/gi, '"$1":"***"');
};

async function request(url, opts = {}) {
  const { method = 'GET', headers = {}, body, timeout = 60000, retries = 3, label = 'HTTP' } = opts;
  let last;
  for (let i = 0; i < retries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
      const text = await res.text();
      // 429 / 5xx là lỗi tạm thời — chờ rồi thử lại
      if ((res.status === 429 || res.status >= 500) && i < retries - 1) {
        last = new Error(`${label}: HTTP ${res.status}`);
        await wait(1500 * Math.pow(2, i));
        continue;
      }
      return { status: res.status, ok: res.ok, text, headers: res.headers };
    } catch (e) {
      last = new Error(`${label}: ${scrub(e.message || e)}`);
      if (i === retries - 1) throw last;
      await wait(1200 * Math.pow(2, i));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

/** GET rồi parse JSON. Lỗi HTTP kèm thân phản hồi đã che token. */
async function getJson(url, opts = {}) {
  const r = await request(url, opts);
  let json = null;
  try { json = JSON.parse(r.text); } catch (_) {}
  if (!r.ok && !json) throw new Error(`${opts.label || 'HTTP'}: HTTP ${r.status} — ${scrub(r.text).slice(0, 300)}`);
  return json || {};
}

async function postJson(url, payload, opts = {}) {
  const r = await request(url, {
    ...opts, method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: JSON.stringify(payload),
  });
  let json = null;
  try { json = JSON.parse(r.text); } catch (_) {}
  if (!r.ok && !json) throw new Error(`${opts.label || 'HTTP'}: HTTP ${r.status} — ${scrub(r.text).slice(0, 300)}`);
  return json || {};
}

async function getText(url, opts = {}) {
  const r = await request(url, opts);
  if (!r.ok) {
    // Thân phản hồi là trang HTML thì đừng phun cả trang ra thông báo lỗi —
    // vô dụng với người đọc, và có thể dài hàng chục nghìn ký tự.
    const laHtml = /^\s*<(!doctype|html)/i.test(r.text);
    const than = laHtml ? '(máy chủ trả về một trang web, không phải dữ liệu)' : scrub(r.text).slice(0, 200);
    throw new Error(`${opts.label || 'HTTP'}: HTTP ${r.status} — ${than}`);
  }
  return r.text;
}

module.exports = { request, getJson, postJson, getText, scrub, hideSecret };
