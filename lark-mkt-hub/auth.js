'use strict';
/*
 * Đăng nhập Lark cho chế độ `api` (deploy server chung).
 *
 * Luồng: /auth/login → Lark authorize → /auth/callback?code=...
 *        → đổi code lấy user_access_token → lấy open_id + tên
 *        → ký vào cookie phiên (HMAC, không lưu server nên restart không mất phiên).
 *
 * Mở trong Lark hay trong trình duyệt thường đều dùng chung luồng này.
 */
const crypto = require('crypto');
const cfg = require('./config');

const COOKIE = 'hub_session';

/* ---------------- ký / mở cookie ---------------- */
const b64u = (b) => Buffer.from(b).toString('base64url');

function sign(payload) {
  if (!cfg.sessionSecret) throw new Error('Thiếu SESSION_SECRET');
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', cfg.sessionSecret).update(body).digest('base64url');
  return body + '.' + mac;
}

function verify(token) {
  if (!token || !cfg.sessionSecret) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const body = token.slice(0, i);
  const mac = token.slice(i + 1);
  const wanted = crypto.createHmac('sha256', cfg.sessionSecret).update(body).digest('base64url');
  // so sánh chống timing attack
  const a = Buffer.from(mac);
  const b = Buffer.from(wanted);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p.exp || Date.now() > p.exp) return null;
    return p;
  } catch (_) { return null; }
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Người dùng của request hiện tại, hoặc null nếu chưa đăng nhập. */
function sessionUser(req) {
  const p = verify(readCookie(req, COOKIE));
  // e2 = email còn lại (công ty / cá nhân) — phân quyền khớp được cả hai
  return p ? { id: p.id, name: p.name, email: p.email || '', emailPhu: p.e2 || '' } : null;
}

function setSession(res, user) {
  const token = sign({
    id: user.id,
    name: user.name,
    email: user.email || '',
    e2: user.emailPhu || '',
    exp: Date.now() + cfg.sessionDays * 86400000,
  });
  const parts = [
    COOKIE + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + cfg.sessionDays * 86400,
  ];
  if (cfg.publicUrl.startsWith('https://')) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; Max-Age=0');
}

/* ---------------- tenant_access_token ----------------
 * Hub không đọc/ghi Base (việc đó của từng app module), chỉ cần token này để đổi
 * mã OAuth lấy tên + open_id của người vừa đăng nhập.
 */
let tokenCache = { value: null, exp: 0 };

async function tenantToken() {
  if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;
  if (!cfg.appId || !cfg.appSecret) throw new Error('Thiếu LARK_APP_ID / LARK_APP_SECRET');
  const r = await fetch(cfg.apiHost + '/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
  });
  const d = await r.json();
  if (d.code !== 0) throw new Error('Lấy tenant_access_token thất bại: ' + (d.msg || d.code));
  tokenCache = { value: d.tenant_access_token, exp: Date.now() + Math.max(60, (d.expire || 7200) - 300) * 1000 };
  return tokenCache.value;
}

/* ---------------- luồng OAuth ---------------- */
const redirectUri = () => cfg.publicUrl + '/auth/callback';

function loginUrl(state) {
  const q = new URLSearchParams({
    app_id: cfg.appId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    state: state || '/',
  });
  return cfg.apiHost + '/open-apis/authen/v1/authorize?' + q.toString();
}

/** Đổi code lấy thông tin người dùng. */
async function exchangeCode(code) {
  const appToken = await tenantToken();

  const r = await fetch(cfg.apiHost + '/open-apis/authen/v1/oidc/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: 'Bearer ' + appToken,
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
  });
  const d = await r.json();
  if (d.code !== 0) throw new Error('Đổi code thất bại: ' + (d.msg || d.code));

  const ui = await fetch(cfg.apiHost + '/open-apis/authen/v1/user_info', {
    headers: { Authorization: 'Bearer ' + d.data.access_token },
  });
  const u = await ui.json();
  if (u.code !== 0) throw new Error('Lấy thông tin người dùng thất bại: ' + (u.msg || u.code));

  /* Lark trả hai email: enterprise_email (công ty cấp) và email (tài khoản dùng
   * để đăng nhập Lark). Người khai quyền không biết chắc mình đang điền cái nào,
   * nên giữ cả hai và khớp được cả hai. */
  return {
    id: u.data.open_id,
    name: u.data.name || u.data.en_name || u.data.open_id,
    email: u.data.enterprise_email || u.data.email || '',
    emailPhu: (u.data.enterprise_email && u.data.email !== u.data.enterprise_email)
      ? (u.data.email || '') : '',
  };
}

/* ---------------- xử lý route ---------------- */
function redirect(res, to) {
  res.writeHead(302, { Location: to });
  res.end();
}

function page(res, title, body, code = 200) {
  const html = '<!doctype html><meta charset="utf-8">' +
    '<title>' + title + '</title>' +
    '<style>body{font:15px/1.6 -apple-system,"Segoe UI",Roboto,sans-serif;background:#f5f6f7;' +
    'color:#1f2329;display:grid;place-content:center;height:100vh;margin:0;text-align:center}' +
    'a{color:#3370ff}.box{background:#fff;padding:32px 40px;border-radius:12px;' +
    'border:1px solid #dee0e3;max-width:460px}</style><div class="box">' + body + '</div>';
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

/**
 * Xử lý các route /auth/*. Trả về true nếu đã xử lý xong request.
 */
async function handle(req, res, url) {
  const p = url.pathname;

  if (p === '/auth/login') {
    if (!cfg.publicUrl) return page(res, 'Thiếu cấu hình', '<h2>Thiếu PUBLIC_URL</h2>' +
      '<p>Đặt biến môi trường <code>PUBLIC_URL</code> bằng địa chỉ công khai của app.</p>', 500);

    /* PUBLIC_URL sai tên miền là lỗi cấu hình hay gặp nhất khi deploy: Render cấp
     * URL có hậu tố (mkt-hub-w6hi...) mà biến vẫn để tên dự kiến. Nếu cứ đẩy sang
     * Lark thì người dùng bị trả về một tên miền chết và không hiểu vì sao — nên
     * bắt tại đây và nói thẳng phải sửa gì. */
    const hostThat = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    let hostKhai = '';
    try { hostKhai = new URL(cfg.publicUrl).host; } catch (_) {}
    if (hostThat && hostKhai && hostThat.toLowerCase() !== hostKhai.toLowerCase()) {
      const dung = 'https://' + hostThat;
      return page(res, 'PUBLIC_URL chưa đúng',
        '<h2>PUBLIC_URL chưa đúng tên miền</h2>' +
        '<p>Anh đang mở app qua <code>' + hostThat.replace(/[<>]/g, '') + '</code>, ' +
        'nhưng biến <code>PUBLIC_URL</code> lại khai <code>' + hostKhai.replace(/[<>]/g, '') + '</code>. ' +
        'Đăng nhập Lark sẽ trả về tên miền sai nên không vào được.</p>' +
        '<p><b>Sửa:</b> Render → service → <b>Environment</b> → đặt<br>' +
        '<code>PUBLIC_URL = ' + dung + '</code> → Save.</p>' +
        '<p>Rồi trong Lark Developer Console → <b>Security Settings</b> → Redirect URL thêm<br>' +
        '<code>' + dung + '/auth/callback</code> → <b>Create Version</b> và phát hành lại.</p>', 500);
    }

    return redirect(res, loginUrl(url.searchParams.get('next') || '/'));
  }

  if (p === '/auth/logout') {
    clearSession(res);
    return redirect(res, '/auth/login');
  }

  if (p === '/auth/callback') {
    const code = url.searchParams.get('code');
    if (!code) return page(res, 'Đăng nhập lỗi', '<h2>Thiếu mã xác thực</h2>' +
      '<p><a href="/auth/login">Thử lại</a></p>', 400);
    try {
      const user = await exchangeCode(code);
      setSession(res, user);
      const next = url.searchParams.get('state') || '/';
      return redirect(res, next.startsWith('/') ? next : '/');
    } catch (e) {
      return page(res, 'Đăng nhập lỗi', '<h2>Không đăng nhập được</h2>' +
        '<p>' + String(e.message).replace(/[<>]/g, '') + '</p>' +
        '<p><a href="/auth/login">Thử lại</a></p>', 500);
    }
  }

  return false;
}

/** Trang chặn khi chưa đăng nhập. */
function requireLogin(res, url) {
  const next = encodeURIComponent(url.pathname + url.search);
  if (url.pathname.startsWith('/api/')) {
    const b = Buffer.from(JSON.stringify({ error: 'Chưa đăng nhập', code: 'NO_SESSION' }));
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length });
    return res.end(b);
  }
  return redirect(res, '/auth/login?next=' + next);
}

module.exports = { sessionUser, setSession, clearSession, handle, requireLogin, COOKIE };
