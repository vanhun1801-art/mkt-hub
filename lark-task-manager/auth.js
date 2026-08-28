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

const COOKIE = 'rt_session';

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
  /* Chạy sau lớp vỏ Marketing Hub: vỏ đã đăng nhập Lark rồi truyền danh tính xuống
   * qua header, khỏi phải đăng nhập hai lần. Chỉ tin header khi app này nghe trên
   * 127.0.0.1 (hub proxy nội bộ) — mở cổng ra ngoài thì đừng bật HUB_TRUST_HEADER. */
  if (process.env.HUB_TRUST_HEADER !== '0') {
    const id = req && req.headers && req.headers['x-hub-user-id'];
    if (id) {
      const ten = req.headers['x-hub-user-name'];
      let deco = id;
      try { deco = ten ? decodeURIComponent(ten) : id; } catch (_) { deco = ten || id; }
      return { id: String(id), name: String(deco) };
    }
  }
  const p = verify(readCookie(req, COOKIE));
  return p ? { id: p.id, name: p.name } : null;
}

function setSession(res, user) {
  const token = sign({
    id: user.id,
    name: user.name,
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
  const larkapi = require('./larkapi');
  const appToken = await larkapi.tenantToken();

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

  return { id: u.data.open_id, name: u.data.name || u.data.en_name || u.data.open_id };
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
