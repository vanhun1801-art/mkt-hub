'use strict';
/*
 * Nối hộp thư Lark của TỪNG người cho app Hộp thư (bản chạy chung).
 *
 * Đăng nhập hub chỉ lấy tên + open_id rồi bỏ token. Đọc thư thì cần token của
 * chính người đó, kèm quyền mail mà lúc đăng nhập không xin. Nên có một bước
 * riêng, người dùng tự bấm "Nối hộp thư":
 *
 *   /auth/noi-thu → Lark hỏi "cho Marketing Hub đọc thư?" → /auth/callback
 *   (state bắt đầu bằng "thu:") → đổi code lấy token (OAuth v2, có
 *   offline_access nên có refresh_token) → kiểm token đúng là của người đang
 *   đăng nhập → cất.
 *
 * CẤT Ở ĐÂU. Ổ đĩa Render là tạm, mỗi lần deploy mất sạch; cất vào Base thì
 * refresh token của cả phòng nằm chung một bảng. Nên refresh token nằm trong
 * cookie `hub_thu` của chính trình duyệt người đó, MÃ HOÁ AES-256-GCM bằng
 * khoá dẫn từ SESSION_SECRET: người dùng không đọc được, không sửa được, và
 * cookie chỉ mở được khi open_id bên trong trùng người đang đăng nhập.
 * Access token (2 tiếng) chỉ nằm trong RAM; restart thì làm mới lại từ cookie.
 *
 * Refresh token của Lark DÙNG MỘT LẦN: làm mới là ra cặp mới, cái cũ chết
 * ngay. Trang Hộp thư gọi vài API cùng lúc, nên mỗi người chỉ được một lượt
 * làm mới đang chạy; các request khác chờ chung kết quả đó. Cookie được ghi
 * lại mỗi khi refresh token đổi.
 */
const crypto = require('crypto');
const cfg = require('./config');

const COOKIE = 'hub_thu';

/* Đúng bộ quyền lark-cli dùng cho các lệnh của app Hộp thư (đọc hộp được cấp,
 * đọc thư, đổi nhãn/thư mục, lưu nháp và gửi). App Marketing Hub phải được cấp
 * các quyền này trong Developer Console và phát hành version, không thì Lark
 * báo 20027 ngay ở trang hỏi quyền. */
const SCOPE = [
  'mail:user_mailbox:readonly',
  'mail:user_mailbox.message:readonly',
  'mail:user_mailbox.message.subject:read',
  'mail:user_mailbox.message.address:read',
  'mail:user_mailbox.message.body:read',
  'mail:user_mailbox.message:modify',
  'mail:user_mailbox.message:send',
  'offline_access',
];

/* Xin THÊM khi người dùng bấm "Thêm vào lịch" lần đầu (?them=lich), không xin
 * ngay từ đầu: app chưa được cấp quyền lịch thì Lark chặn cả trang hỏi quyền
 * (20027) và không ai nối được hộp thư nữa. */
const SCOPE_LICH = ['calendar:calendar:read', 'calendar:calendar.event:create'];

const HAN_GOI = 20000;
const han = () => AbortSignal.timeout(HAN_GOI);

/* ---------------- mã hoá cookie ---------------- */

const khoa = () => crypto.createHash('sha256').update('hub-noi-thu|' + cfg.sessionSecret).digest();

function ma(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', khoa(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}

function mo(s) {
  if (!s || !cfg.sessionSecret) return null;
  try {
    const b = Buffer.from(String(s), 'base64url');
    if (b.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', khoa(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch (_) { return null; }
}

function docCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) { try { return decodeURIComponent(v.join('=')); } catch (_) { return ''; } }
  }
  return '';
}

/** Thêm một Set-Cookie, không đè cookie khác đã đặt trên cùng phản hồi. */
function themCookie(res, dong) {
  const co = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [].concat(co || [], dong));
}

function datCookie(res, u, s) {
  const giay = Math.max(60, Math.floor((s.re - Date.now()) / 1000));
  const parts = [COOKIE + '=' + ma({ u, r: s.r, re: s.re }), 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + giay];
  if (cfg.publicUrl.startsWith('https://')) parts.push('Secure');
  themCookie(res, parts.join('; '));
}

function xoaCookie(res) {
  const parts = [COOKIE + '=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (cfg.publicUrl.startsWith('https://')) parts.push('Secure');
  themCookie(res, parts.join('; '));
}

/* ---------------- gọi Lark ---------------- */

/** accounts.larksuite.com cho trang hỏi quyền, open.larksuite.com cho API. */
const hostTaiKhoan = () => cfg.apiHost.replace('://open.', '://accounts.');
const redirectUri = () => cfg.publicUrl + '/auth/callback';

function urlHoiQuyen(next, them = '') {
  const q = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPE.concat(them === 'lich' ? SCOPE_LICH : []).join(' '),
    state: 'thu:' + next,
  });
  return hostTaiKhoan() + '/open-apis/authen/v1/authorize?' + q.toString();
}

async function goiToken(than) {
  const r = await fetch(cfg.apiHost + '/open-apis/authen/v2/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(Object.assign({ client_id: cfg.appId, client_secret: cfg.appSecret }, than)),
    signal: han(),
  });
  const d = await r.json().catch(() => ({}));
  if (d.code !== 0 || !d.access_token) {
    const e = new Error((d.error_description || d.msg || d.error || 'Lark không cấp token') + (d.code ? ' (' + d.code + ')' : ''));
    e.laLark = true;
    throw e;
  }
  const bayGio = Date.now();
  return {
    a: d.access_token,
    ae: bayGio + (Number(d.expires_in) || 7200) * 1000,
    r: d.refresh_token || '',
    re: bayGio + (Number(d.refresh_token_expires_in) || 0) * 1000,
    scope: String(d.scope || ''),
  };
}

/* ---------------- giữ và làm mới ---------------- */

const ram = new Map();       // open_id -> { a, ae, r, re }
const dangLam = new Map();   // open_id -> Promise (một lượt làm mới mỗi người)

function lamMoi(u, r) {
  if (dangLam.has(u)) return dangLam.get(u);
  const p = goiToken({ grant_type: 'refresh_token', refresh_token: r })
    .then((s) => { ram.set(u, s); return s; })
    .finally(() => dangLam.delete(u));
  dangLam.set(u, p);
  return p;
}

/**
 * Token đọc thư của người đang xem, hoặc '' nếu họ chưa nối (hay đã hết hạn).
 * Ghi lại cookie khi refresh token đổi. Không bao giờ ném lỗi: thiếu token thì
 * app Hộp thư tự mời nối, hub không chặn đường vào.
 */
async function tokenCho(req, res, nguoi) {
  if (!nguoi || !nguoi.id || !cfg.sessionSecret) return '';
  const c = mo(docCookie(req));
  if (!c || c.u !== nguoi.id || !c.r) return '';
  const bayGio = Date.now();

  /* RAM có bản mới hơn cookie (vừa làm mới ở request khác) thì theo RAM;
   * cookie mới hơn (vừa nối lại, hoặc máy chủ mới khởi động) thì theo cookie. */
  let s = ram.get(nguoi.id);
  if (!s || (c.re || 0) > (s.re || 0)) {
    s = { a: '', ae: 0, r: c.r, re: c.re || 0 };
    ram.set(nguoi.id, s);
  }
  if (s.a && s.ae - 60000 > bayGio) {
    if (s.r !== c.r) datCookie(res, nguoi.id, s);
    return s.a;
  }
  if (s.re && s.re < bayGio) { ram.delete(nguoi.id); xoaCookie(res); return ''; }
  try {
    const moi = await lamMoi(nguoi.id, s.r);
    datCookie(res, nguoi.id, moi);
    return moi.a;
  } catch (e) {
    /* Lark từ chối refresh token (bị thu hồi, đã dùng rồi) thì nối lại; còn
     * mạng chập thì giữ nguyên, lần sau thử tiếp. */
    if (e.laLark) { ram.delete(nguoi.id); xoaCookie(res); }
    return '';
  }
}

/** Đổi code ở /auth/callback. Trả về câu lỗi để in ra trang, hoặc '' khi xong. */
async function nhanCode(res, code, nguoi) {
  if (!nguoi || nguoi.kieu === 'mk') {
    return 'Tài khoản đăng nhập bằng mật khẩu không nối được hộp thư Lark. Đăng xuất, đăng nhập lại bằng Lark rồi bấm Nối hộp thư.';
  }
  const s = await goiToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  if (!s.r) return 'Lark không cấp quyền giữ phiên lâu dài (offline_access). Báo quản lý kiểm lại quyền của app Marketing Hub.';
  const thieu = SCOPE.filter((x) => x !== 'offline_access' && !s.scope.split(' ').includes(x));
  if (s.scope && thieu.length) return 'Còn thiếu quyền đọc thư: ' + thieu.join(', ') + '. Bấm Nối hộp thư lại và cho phép đủ các quyền.';

  /* Token phải là của CHÍNH người đang đăng nhập hub. Không kiểm thì ai cũng
   * dụ được người khác bấm một link để gắn hộp thư lạ vào trình duyệt họ. */
  const ui = await fetch(cfg.apiHost + '/open-apis/authen/v1/user_info', {
    headers: { Authorization: 'Bearer ' + s.a }, signal: han(),
  }).then((r) => r.json()).catch(() => ({}));
  const openId = ui && ui.data && ui.data.open_id;
  if (!openId || openId !== nguoi.id) {
    return 'Tài khoản Lark vừa cho phép không phải tài khoản đang đăng nhập Marketing Hub. Đăng nhập Lark đúng tài khoản của mình rồi thử lại.';
  }
  ram.set(nguoi.id, s);
  datCookie(res, nguoi.id, s);
  return '';
}

function ngat(req, res, nguoi) {
  if (nguoi && nguoi.id) ram.delete(nguoi.id);
  xoaCookie(res);
}

module.exports = { COOKIE, SCOPE, SCOPE_LICH, urlHoiQuyen, nhanCode, tokenCho, ngat, _ma: ma, _mo: mo, _ram: ram };
