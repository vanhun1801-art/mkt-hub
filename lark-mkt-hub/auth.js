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
const taiKhoan = require('./tai-khoan');
const chanTs = require('./chan-tan-suat');

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

/* ---------------- huỷ phiên đã cấp ----------------
 * Cookie của hub tự chứng thực (ký HMAC), server KHÔNG giữ kho phiên — nên
 * "đăng xuất" vốn chỉ xoá cookie ở máy người dùng, còn ai đã sao được chuỗi
 * cookie thì dùng tiếp tới ngày hết hạn. Anh Hùng nêu đúng chỗ này: "làm cho
 * phiên cũ hết tác dụng ngay khi người dùng đăng xuất".
 *
 * Hai đường, vì hai loại tài khoản có chỗ lưu khác nhau:
 *
 *   tài khoản mật khẩu — mốc `Phiên từ` ghi trên hàng Base của chính họ.
 *     Sống qua deploy và restart. Xem tai-khoan.js.
 *   tài khoản Lark     — danh sách dưới đây, nằm trong RAM.
 *     GIỚI HẠN ĐÃ BIẾT: restart là danh sách trắng, cookie đã đăng xuất lại
 *     dùng được. Muốn vá triệt để thì phải có hàng Base cho từng người Lark
 *     nữa — chưa làm vì phải đụng vào bảng Phân quyền mà cả 10 app đang đọc.
 *     Trong lúc chưa có, thứ thật sự bảo vệ là Max-Age của cookie.
 */
const daHuy = new Map();   // sid -> lúc hết hạn (ms)

function huyPhien(sid, exp) {
  if (!sid) return;
  const bayGio = Date.now();
  for (const [k, v] of daHuy) if (v < bayGio) daHuy.delete(k);
  daHuy.set(sid, exp || bayGio + cfg.sessionDays * 86400000);
}
function daBiHuy(sid) {
  if (!sid) return false;
  const exp = daHuy.get(sid);
  if (!exp) return false;
  if (exp < Date.now()) { daHuy.delete(sid); return false; }
  return true;
}

/** Người dùng của request hiện tại, hoặc null nếu chưa đăng nhập. */
function sessionUser(req) {
  const p = verify(readCookie(req, COOKIE));
  if (!p) return null;
  if (daBiHuy(p.sid)) return null;
  // e2 = email còn lại (công ty / cá nhân) — phân quyền khớp được cả hai
  return {
    id: p.id, name: p.name, email: p.email || '', emailPhu: p.e2 || '',
    /* 'lark' | 'mk'. Dùng để chốt một luật không được phá: tài khoản mật khẩu
     * KHÔNG BAO GIỜ được làm quản lý — xem laQuanLy() trong server.js. */
    kieu: p.k === 'mk' ? 'mk' : 'lark',
    iat: p.iat || 0,
    rid: p.rid || '',      // recordId hàng tài khoản, chỉ có ở kiểu 'mk'
    sid: p.sid || '',
  };
}

function setSession(res, user, kieu) {
  const bayGio = Date.now();
  const token = sign({
    id: user.id,
    name: user.name,
    email: user.email || '',
    e2: user.emailPhu || '',
    k: kieu === 'mk' ? 'mk' : 'lark',
    rid: user.rid || '',
    iat: bayGio,
    /* Mã phiên ngẫu nhiên, để đăng xuất huỷ được ĐÚNG phiên này mà không đụng
     * tới phiên của người đó trên máy khác. */
    sid: crypto.randomBytes(9).toString('base64url'),
    exp: bayGio + cfg.sessionDays * 86400000,
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
  const parts = [COOKIE + '=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (cfg.publicUrl.startsWith('https://')) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
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

/**
 * Lọc đường dẫn quay lại sau khi đăng nhập: chỉ cho phép đường dẫn trong chính
 * app này. Trả về '/' nếu chuỗi đưa vào có thể dẫn ra ngoài.
 */
function duongDanNoiBo(next) {
  const s = String(next || '');
  if (!s.startsWith('/')) return '/';        // tuyệt đối, hoặc rỗng
  if (s.startsWith('//') || s.startsWith('/\\')) return '/';   // rút gọn giao thức
  return s;
}

function redirect(res, to) {
  res.writeHead(302, { Location: to });
  res.end();
}

function page(res, title, body, code = 200) {
  const html = '<!doctype html><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + title + '</title>' +
    '<style>body{font:15px/1.6 -apple-system,"Segoe UI",Roboto,sans-serif;background:#f5f6f7;' +
    'color:#1f2329;display:grid;place-content:center;min-height:100vh;margin:0;text-align:center;padding:16px}' +
    'a{color:#3370ff}.box{background:#fff;padding:32px 40px;border-radius:12px;' +
    'border:1px solid #dee0e3;max-width:460px}</style><div class="box">' + body + '</div>';
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

/* ---------------- trang đăng nhập ---------------- */

/** Thoát HTML. Mọi chuỗi do người dùng gõ đi qua đây trước khi vào trang. */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Bảng màu lấy từ chính con Ma-Két trên logo app: nền xanh ngọc chuyển sang lam,
 * linh vật trắng. Nên trang đăng nhập — thứ đầu tiên người lạ nhìn thấy — trông
 * cùng một nhà với app, thay vì một cái hộp xám trôi giữa nền đen.
 *
 * Nút Lark giữ đúng màu lam của Lark: đó là hành động mang thương hiệu của họ,
 * người dùng nhận ra nút đó trước khi đọc chữ. Xanh ngọc của mình chỉ làm nền và
 * viền sáng, không tranh chỗ. */
const KIEU_TRANG = `
:root{
  --muc:#111826;--mo:#5f6b7a;--vien:#e3e8ee;--the:#ffffff;--nen:#eef4f8;
  --lam:#3370ff;--ngoc:#22c3d6;--do:#c8342c;--luc:#237a3d;
  --do-nen:#fdf1f0;--do-vien:#f3c9c6;--luc-nen:#edf7ef;--luc-vien:#bfe3c6;
  --bong:0 1px 2px rgba(16,32,56,.05),0 12px 32px -12px rgba(16,32,56,.18);
}
*{box-sizing:border-box}
body{
  font:15px/1.55 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:var(--muc);margin:0;min-height:100vh;padding:32px 16px;
  display:grid;place-items:center;background:var(--nen);
  background-image:
    radial-gradient(62rem 32rem at 50% -14%, color-mix(in srgb, var(--ngoc) 26%, transparent), transparent 70%),
    radial-gradient(48rem 30rem at 92% 104%, color-mix(in srgb, var(--lam) 16%, transparent), transparent 72%);
  background-attachment:fixed;
}
.hop{
  background:var(--the);border:1px solid var(--vien);border-radius:18px;
  padding:34px 32px 28px;width:100%;max-width:372px;box-shadow:var(--bong);
  animation:len .32s cubic-bezier(.2,.7,.3,1) both;
}
@keyframes len{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.hop{animation:none}}
.dau{display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:26px}
.dau img{width:56px;height:56px;border-radius:14px;box-shadow:var(--bong);margin-bottom:14px}
h1{font-size:21px;line-height:1.25;margin:0;letter-spacing:-.01em;font-weight:650}
.phu{color:var(--mo);font-size:13px;margin:5px 0 0;letter-spacing:.01em}
label{display:block;font-size:12.5px;font-weight:550;color:var(--mo);margin:16px 0 6px}
input{
  width:100%;padding:11px 13px;border:1px solid var(--vien);border-radius:10px;
  font-size:15px;font-family:inherit;background:var(--the);color:var(--muc);
  transition:border-color .15s,box-shadow .15s;
}
input:focus{outline:0;border-color:var(--lam);box-shadow:0 0 0 3px color-mix(in srgb, var(--lam) 18%, transparent)}
button,.lark{
  display:flex;align-items:center;justify-content:center;width:100%;padding:12px;
  border:0;border-radius:10px;font-size:15px;font-weight:600;font-family:inherit;
  cursor:pointer;text-decoration:none;
  /* CHỈ chuyển filter, đừng chuyển background: đổi nền sáng/tối của máy là
   * mọi nút chạy hoạt ảnh đổi màu, bắt đúng lúc đó thì nút phụ đang nửa đen nửa
   * trắng và chữ không đọc được — đã chụp được cảnh đó lúc thử. */
  transition:filter .15s;
}
button{margin-top:22px;background:var(--lam);color:#fff}
button:hover,.lark:hover{filter:brightness(1.06)}
button:focus-visible,.lark:focus-visible{outline:2px solid var(--lam);outline-offset:2px}
button.phu-nut{background:var(--the);color:var(--muc);border:1px solid var(--vien);font-weight:550;margin-top:0}
button.phu-nut:hover{filter:none;background:var(--nen)}
.lark{background:var(--lam);color:#fff}
.vach{display:flex;align-items:center;gap:14px;color:var(--mo);font-size:12px;margin:16px 0}
.vach::before,.vach::after{content:"";flex:1;height:1px;background:var(--vien)}
.loi,.xong{border-radius:10px;padding:11px 13px;font-size:13.5px;margin-bottom:18px;text-align:left}
.loi{background:var(--do-nen);border:1px solid var(--do-vien);color:var(--do)}
.xong{background:var(--luc-nen);border:1px solid var(--luc-vien);color:var(--luc)}
.duoi{text-align:center;margin:22px 0 0;font-size:13px;color:var(--mo);line-height:1.7}
.duoi a{color:var(--lam);text-decoration:none;font-weight:550}
.duoi a:hover{text-decoration:underline}
.goi-y{font-size:12.5px;color:var(--mo);margin:7px 0 0}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --muc:#e8ecf1;--mo:#98a2b0;--vien:#2c333c;--the:#1a1f26;--nen:#0f1319;
    --lam:#4d84ff;--ngoc:#2dd4e8;--do:#ff8a80;--luc:#8fd694;
    --do-nen:#2a1d1c;--do-vien:#4d2f2c;--luc-nen:#16281a;--luc-vien:#2b4a30;
    --bong:0 1px 2px rgba(0,0,0,.4),0 16px 40px -16px rgba(0,0,0,.7);
  }
}
:root[data-theme="dark"]{
  --muc:#e8ecf1;--mo:#98a2b0;--vien:#2c333c;--the:#1a1f26;--nen:#0f1319;
  --lam:#4d84ff;--ngoc:#2dd4e8;--do:#ff8a80;--luc:#8fd694;
  --do-nen:#2a1d1c;--do-vien:#4d2f2c;--luc-nen:#16281a;--luc-vien:#2b4a30;
  --bong:0 1px 2px rgba(0,0,0,.4),0 16px 40px -16px rgba(0,0,0,.7);
}`;

/* Logo app trên đầu mỗi trang. Ảnh này mở công khai (xem `moCong` trong
 * server.js) vì trang đăng nhập nằm TRƯỚC cổng — chặn nó thì ô ảnh vỡ. */
const dauTrang = (tieu, phu) =>
  '<div class="dau"><img src="/logo-app-180.png" alt="" width="56" height="56">' +
  '<h1>' + esc(tieu) + '</h1>' +
  (phu ? '<p class="phu">' + esc(phu) + '</p>' : '') + '</div>';

function trang(res, tieuDe, than, code = 200) {
  const html = '<!doctype html><html lang="vi"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link rel="icon" href="/logo-app-32.png">' +
    '<title>' + esc(tieuDe) + '</title><style>' + KIEU_TRANG + '</style>' +
    '<div class="hop">' + than + '</div>';
  res.writeHead(code, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  });
  res.end(html);
}

/** Đọc body dạng form. Trần 8 KB — form đăng nhập không cần hơn. */
function docForm(req) {
  return new Promise((xong) => {
    let n = 0;
    const mieng = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > 8192) { req.destroy(); return; }
      mieng.push(c);
    });
    req.on('end', () => {
      try { xong(new URLSearchParams(Buffer.concat(mieng).toString('utf8'))); }
      catch (_) { xong(new URLSearchParams()); }
    });
    req.on('error', () => xong(new URLSearchParams()));
  });
}

/**
 * Chặn form gửi từ trang khác (CSRF).
 *
 * SameSite=Lax đã chặn cookie đi kèm POST chéo nguồn, nhưng hai đường này KHÔNG
 * dựa vào cookie — chúng tạo ra phiên. Nên kiểm Origin: không có, hoặc khác host
 * của chính mình, thì từ chối.
 */
function cungNguon(req) {
  const org = String(req.headers.origin || '');
  if (!org) return true;                    // gửi từ chính trang (một số trình duyệt không đặt)
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  try { return new URL(org).host.toLowerCase() === host.toLowerCase(); }
  catch (_) { return false; }
}

/**
 * Xử lý các route /auth/*. Trả về true nếu đã xử lý xong request.
 */
async function handle(req, res, url) {
  const p = url.pathname;

  /* Trang chọn cách vào. Chỉ hiện hai lựa chọn khi kho tài khoản đã bật
   * (HUB_TK_TABLE có khai); chưa bật thì đi thẳng sang Lark như trước, không
   * bày ra một ô mật khẩu không dùng được. */
  if (p === '/auth/login' && taiKhoan.co()) {
    const next = duongDanNoiBo(url.searchParams.get('next'));
    return trang(res, 'Đăng nhập · ' + cfg.ten,
      dauTrang(cfg.ten, cfg.phu) +
      '<a class="lark" href="/auth/lark?next=' + encodeURIComponent(next) + '">Đăng nhập bằng Lark</a>' +
      '<div class="vach">hoặc</div>' +
      '<form method="get" action="/auth/mat-khau">' +
      '<input type="hidden" name="next" value="' + esc(next) + '">' +
      '<button type="submit" class="phu-nut">Tài khoản và mật khẩu</button>' +
      '</form>' +
      '<p class="duoi">Người trong công ty dùng Lark.<br>' +
      'Cộng tác viên và đối tác dùng tài khoản riêng.</p>');
  }

  if (p === '/auth/login' || p === '/auth/lark') {
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

    // lọc ngay từ đây, đừng để đường dẫn lạ đi vòng qua Lark rồi mới lọc
    return redirect(res, loginUrl(duongDanNoiBo(url.searchParams.get('next'))));
  }

  if (p === '/auth/logout') {
    /* Xoá cookie là chưa đủ — chuỗi cookie đã sao ra ngoài vẫn còn hiệu lực tới
     * ngày hết hạn. Huỷ luôn phiên: tài khoản mật khẩu ghi mốc lên Base (sống
     * qua restart), tài khoản Lark vào danh sách trong RAM. */
    const nguoi = sessionUser(req);
    if (nguoi) {
      huyPhien(nguoi.sid);
      if (nguoi.kieu === 'mk' && nguoi.rid) {
        try { await taiKhoan.huyPhien(nguoi.rid); } catch (_) { /* vẫn phải đăng xuất được */ }
      }
    }
    clearSession(res);
    return redirect(res, '/auth/login');
  }

  /* ---------------- đăng nhập bằng mật khẩu ---------------- */

  if (p === '/auth/mat-khau') {
    if (!taiKhoan.co()) return redirect(res, '/auth/login');
    const next = duongDanNoiBo(url.searchParams.get('next'));

    const veTrang = (loiCau, mail) => trang(res, 'Đăng nhập · ' + cfg.ten,
      dauTrang('Đăng nhập', 'Tài khoản dành cho người không dùng Lark') +
      (loiCau ? '<div class="loi">' + esc(loiCau) + '</div>' : '') +
      '<form method="post" action="/auth/mat-khau?next=' + encodeURIComponent(next) + '">' +
      '<label for="e">Email</label>' +
      '<input id="e" name="email" type="email" autocomplete="username" required ' +
      'value="' + esc(mail || '') + '">' +
      '<label for="m">Mật khẩu</label>' +
      '<input id="m" name="mk" type="password" autocomplete="current-password" required>' +
      '<button type="submit">Đăng nhập</button>' +
      '</form>' +
      '<p class="duoi"><a href="/auth/dang-ky">Chưa có tài khoản? Đăng ký</a><br>' +
      '<a href="/auth/login">Quay lại</a></p>',
      loiCau ? 401 : 200);

    if (req.method !== 'POST') return veTrang('', '');
    if (!cungNguon(req)) return veTrang('Yêu cầu không hợp lệ. Mở lại trang đăng nhập.', '');

    const f = await docForm(req);
    const mail = String(f.get('email') || '').trim().toLowerCase();
    const mk = String(f.get('mk') || '');

    /* Đếm theo CẢ HAI khoá: một IP dò nhiều tài khoản, và nhiều IP cùng dò một
     * tài khoản. Thiếu một trong hai là đổi IP hoặc đổi email là lách qua. */
    const kIp = 'dn:ip:' + chanTs.ipCua(req);
    const kMail = 'dn:mail:' + mail;
    for (const k of [kIp, kMail]) {
      const r = chanTs.thu(k, { nguong: 6, cuaSoMs: 10 * 60000 });
      if (!r.ok) return veTrang(chanTs.noiCho(r.choMs), mail);
    }

    let kq;
    try { kq = await taiKhoan.kiemMatKhau(mail, mk); }
    catch (_) { return veTrang('Hệ thống đang lỗi, thử lại sau.', mail); }

    if (!kq.ok) {
      chanTs.hong(kIp); chanTs.hong(kMail);
      /* 'sai' và 'khong-co' phải trả về CÙNG một câu — khác câu là trang này
       * thành máy dò xem email nào có tài khoản. `kiemMatKhau` cũng đã đốt cùng
       * một khoảng thời gian cho cả hai nhánh. */
      if (kq.lyDo === 'cho-duyet') {
        return veTrang('Tài khoản đang chờ quản lý duyệt. Được duyệt rồi mới đăng nhập được.', mail);
      }
      if (kq.lyDo === 'khoa') return veTrang('Tài khoản đã bị khoá. Liên hệ quản lý.', mail);
      return veTrang('Email hoặc mật khẩu không đúng.', mail);
    }

    chanTs.xong(kIp); chanTs.xong(kMail);
    const rid = String(kq.nguoi.id).slice(3);   // 'mk:' + recordId
    setSession(res, { ...kq.nguoi, rid }, 'mk');
    taiKhoan.ghiDangNhap(rid).catch(() => {});  // ghi nhật ký, không chặn đường vào
    return redirect(res, next);
  }

  /* ---------------- đăng ký ---------------- */

  if (p === '/auth/dang-ky') {
    if (!taiKhoan.co()) return redirect(res, '/auth/login');

    const veTrang = (loiCau, cu) => trang(res, 'Đăng ký · ' + cfg.ten,
      dauTrang('Đăng ký', 'Gửi xong phải chờ quản lý duyệt mới vào được') +
      (loiCau ? '<div class="loi">' + esc(loiCau) + '</div>' : '') +
      '<form method="post" action="/auth/dang-ky">' +
      '<label for="t">Họ tên</label>' +
      '<input id="t" name="ten" required maxlength="80" value="' + esc((cu && cu.ten) || '') + '">' +
      '<label for="e">Email</label>' +
      '<input id="e" name="email" type="email" autocomplete="username" required ' +
      'value="' + esc((cu && cu.email) || '') + '">' +
      '<label for="m">Mật khẩu</label>' +
      '<input id="m" name="mk" type="password" autocomplete="new-password" required>' +
      '<p class="goi-y">Từ 10 ký tự, có cả chữ và số.</p>' +
      '<button type="submit">Gửi đăng ký</button>' +
      '</form>' +
      '<p class="duoi"><a href="/auth/mat-khau">Đã có tài khoản? Đăng nhập</a></p>',
      loiCau ? 400 : 200);

    if (req.method !== 'POST') return veTrang('', null);
    if (!cungNguon(req)) return veTrang('Yêu cầu không hợp lệ. Mở lại trang đăng ký.', null);

    /* Cửa này mở ra internet: chặn chặt hơn đăng nhập, vì mỗi lần lọt là một
     * dòng ghi vào Base của phòng. */
    const kIp = 'dk:ip:' + chanTs.ipCua(req);
    const r = chanTs.thu(kIp, { nguong: 3, cuaSoMs: 60 * 60000 });
    if (!r.ok) return veTrang(chanTs.noiCho(r.choMs), null);

    const f = await docForm(req);
    const cu = { ten: String(f.get('ten') || ''), email: String(f.get('email') || '') };
    let kq;
    try { kq = await taiKhoan.dangKy({ ten: cu.ten, email: cu.email, mk: String(f.get('mk') || '') }); }
    catch (_) { return veTrang('Hệ thống đang lỗi, thử lại sau.', cu); }

    if (!kq.ok) { chanTs.hong(kIp); return veTrang(kq.loi || 'Không đăng ký được.', cu); }

    /* Mỗi lần đăng ký thành công cũng tính một lượt: không thì một máy dựng
     * được vô số tài khoản, mỗi cái một email khác nhau. */
    chanTs.hong(kIp);

    /* Email đã có tài khoản cũng trả về ĐÚNG câu này — không nói ra ai đang có
     * tài khoản trong hệ thống. */
    return trang(res, 'Đã gửi · ' + cfg.ten,
      dauTrang('Đã gửi đăng ký', '') +
      '<div class="xong">Quản lý sẽ xem và duyệt. Được duyệt rồi thì đăng nhập ' +
      'bằng email và mật khẩu vừa đặt.</div>' +
      '<p class="duoi"><a href="/auth/login">Về trang đăng nhập</a></p>');
  }

  if (p === '/auth/callback') {
    const code = url.searchParams.get('code');
    if (!code) return page(res, 'Đăng nhập lỗi', '<h2>Thiếu mã xác thực</h2>' +
      '<p><a href="/auth/login">Thử lại</a></p>', 400);
    try {
      const user = await exchangeCode(code);
      setSession(res, user);
      /* Chỉ nhận đường dẫn NỘI BỘ. `startsWith('/')` là chưa đủ: chuỗi "//trang-la.com"
       * cũng bắt đầu bằng gạch chéo, mà trình duyệt hiểu đó là URL rút gọn giao thức
       * rồi đi thẳng ra tên miền lạ — đưa người vừa đăng nhập sang trang giả. Cũng
       * chặn "/\evil.com" vì một số trình duyệt coi \ tương đương /. */
      return redirect(res, duongDanNoiBo(url.searchParams.get('state')));
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

/**
 * Phiên còn sống không — phần phải hỏi Base nên không gọi được trong
 * `sessionUser` (hàm đó đồng bộ và bị gọi ở chục chỗ).
 *
 * Chỉ tài khoản mật khẩu mới phải hỏi: hàng của họ mang trạng thái (khoá? xoá
 * rồi?) và mốc `Phiên từ`. Có đệm 30 giây trong tai-khoan.js nên không phải mỗi
 * request một vòng gọi Lark. Tài khoản Lark thì đã xét xong ở `sessionUser`.
 *
 * Base lỗi thì CHO QUA: phiên đã ký hợp lệ, mà đá cả người đang làm việc ra
 * ngoài chỉ vì Lark chậm thì hại hơn lợi.
 */
async function conHanPhien(nguoi) {
  if (!nguoi || nguoi.kieu !== 'mk') return true;
  if (!nguoi.rid) return false;
  try { return await taiKhoan.conHan(nguoi.rid, nguoi.iat); }
  catch (_) { return true; }
}

module.exports = {
  sessionUser, setSession, clearSession, handle, requireLogin, COOKIE,
  sign, verify, duongDanNoiBo, conHanPhien, huyPhien, daBiHuy, cungNguon, esc,
};
