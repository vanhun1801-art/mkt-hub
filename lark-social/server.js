'use strict';
/**
 * Server HTTP thuần Node (không dependency) cho app Social.
 *
 * Hai nhóm đường dẫn, hai mức tin cậy:
 *   /api/*          — đọc số, ai đăng nhập được hub cũng xem được;
 *   /api/ket-noi/*  — chạm vào token, chỉ quản lý (xem quyen.js).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const lark = require('./lark');
const store = require('./store');
const M = require('./metrics');
const ketnoi = require('./ketnoi');
const vault = require('./vault');
const sync = require('./sync');
const facebook = require('./sync/facebook');
const zalo = require('./sync/zalo');
const tiktok = require('./sync/tiktok');
const { docBangDan } = require('./bang-dan');

const T = cfg.tables;
const PUBLIC = path.join(__dirname, 'public');

/* ---------------- tiện ích HTTP ---------------- */
function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}
const ok = (res, body) => send(res, 200, body);
const fail = (res, code, message, extra = {}) => send(res, code, { error: message, ...extra });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) { reject(new Error('Body quá lớn')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (_) { reject(new Error('JSON không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

/* Vân tay nội dung file tĩnh. Header no-store một mình không đủ: app chạy sau
 * proxy của mkt-hub và đã có lần deploy xong mà trình duyệt vẫn dùng app.js cũ.
 * Gắn ?v=<vân tay> thì đổi mã là đổi URL, không còn chỗ cho cache bám vào. */
const VAN_TAY = (() => {
  const crypto = require('crypto');
  const h = crypto.createHash('sha1');
  ['app.js', 'styles.css', 'index.html'].forEach((f) => {
    try { h.update(fs.readFileSync(path.join(PUBLIC, f))); } catch (_) { h.update(f); }
  });
  return h.digest('hex').slice(0, 10);
})();

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return fail(res, 403, 'Từ chối');
  fs.readFile(file, (err, buf) => {
    if (err) return fail(res, 404, 'Không tìm thấy ' + rel);
    let out = buf;
    if (rel === 'index.html') out = Buffer.from(buf.toString('utf8').split('__V__').join(VAN_TAY), 'utf8');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(out);
  });
}

/* ---------------- tham số ---------------- */
function thamSo(u) {
  const list = (k) => {
    const v = u.searchParams.get(k);
    return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
  };
  const days = Number(u.searchParams.get('days') || 0);
  let to = u.searchParams.get('to') || store.homNay();
  let from = u.searchParams.get('from') || '';
  if (!from) from = store.themNgay(to, -((days > 0 ? days : 30) - 1));
  return { from, to, platforms: list('platform'), channels: list('channel') };
}

/* ---------------- danh tính ---------------- */
const laQuanLy = (req) => require('./quyen').laQuanLy(req, cfg);

async function nguoiDung(req) {
  if (cfg.mode !== 'api') return lark.whoami();
  if (process.env.HUB_TRUST_HEADER === '0') return null;
  const id = req.headers['x-hub-user-id'];
  if (!id) return null;
  const ten = req.headers['x-hub-user-name'];
  let deco = id;
  try { deco = ten ? decodeURIComponent(ten) : id; } catch (_) { deco = ten || id; }
  return { id: String(id), name: String(deco) };
}

function chanNeuKhongPhaiQuanLy(req) {
  if (laQuanLy(req)) return null;
  const e = new Error('Chỉ quản lý mới sửa được phần kết nối. Nhờ anh Hùng cấp quyền trong Cài đặt của Marketing Hub.');
  e.code = 403;
  return e;
}

/* ---------------- trạng thái đồng bộ ---------------- */
/* Một lượt đồng bộ chạy vài phút. Giữ tiến độ trong bộ nhớ để giao diện hỏi được
 * "đang tới đâu rồi", thay vì treo một vòng quay câm suốt năm phút. */
const TT = { dangChay: false, batDau: 0, log: [], ketQua: null, loi: '' };

function ghiLog(d) {
  const t = new Date().toISOString().slice(11, 19);
  TT.log.push(t + '  ' + d);
  if (TT.log.length > 400) TT.log.splice(0, TT.log.length - 400);
  console.log('[dong-bo] ' + d);
}

async function chayDongBo(opts) {
  if (TT.dangChay) {
    const e = new Error('Đang có một lượt đồng bộ chạy dở — đợi nó xong đã.');
    e.code = 409;
    throw e;
  }
  TT.dangChay = true; TT.batDau = Date.now(); TT.log = []; TT.ketQua = null; TT.loi = '';
  try {
    const r = await sync.dongBo({ ...opts, log: ghiLog });
    TT.ketQua = r;
    return r;
  } catch (e) {
    TT.loi = e.message;
    ghiLog('LỖI: ' + e.message);
    throw e;
  } finally {
    TT.dangChay = false;
  }
}

/* ---------------- nhập tay ---------------- */

/** Ghi một dòng số liệu ngày do người dùng gõ. Nguồn ghi rõ là "Nhập tay". */
async function nhapTayNgay(ban) {
  const d = await store.tai();
  const kenh = d.channels.find((c) => c.extId === ban.extId || c.id === ban.channelId
    || c.name === ban.channel);
  if (!kenh) throw Object.assign(new Error('Không thấy kênh "' + (ban.channel || ban.extId) + '" trong bảng Kênh'), { code: 400 });
  const extId = kenh.extId || kenh.id;
  const f = T.daily.f;
  const row = {
    [f.key]: extId + '#' + ban.date,
    [f.date]: store.ngayVeBase(ban.date),
    [f.channel]: [{ id: kenh.id }],
    [f.platform]: kenh.platform,
    [f.source]: 'Nhập tay',
  };
  ['followers', 'followUp', 'followDown', 'views', 'reach', 'impressions', 'profileViews',
    'likes', 'comments', 'shares', 'saves', 'engagement', 'clicks', 'messages', 'leads',
    'posts', 'lives'].forEach((k) => {
    if (ban[k] != null && ban[k] !== '') row[f[k]] = Number(ban[k]) || 0;
  });

  /* Người nhập tay gõ thích/bình luận/chia sẻ chứ không ai ngồi cộng ra "tương tác".
   * Không tự cộng ở đây thì cột Tương tác bằng 0 trong khi ba cột kia có số, và
   * tỷ lệ tương tác của cả kênh tụt về 0 mà nhìn bảng không thấy gì sai. */
  const cong = ['likes', 'comments', 'shares', 'saves'];
  if ((ban.engagement == null || ban.engagement === '') && cong.some((k) => ban[k])) {
    row[f.engagement] = cong.reduce((s, k) => s + (Number(ban[k]) || 0), 0);
  }
  const r = await store.ghiTheoKhoa('daily', [row], (x) => x[f.key]);
  return { ...r, kenh: kenh.name, ngay: ban.date };
}

/** Ghi một phiên LIVE nhập tay (TikTok/Instagram không có API cho LIVE). */
async function nhapTayLive(ban) {
  const d = await store.tai();
  const kenh = d.channels.find((c) => c.extId === ban.extId || c.id === ban.channelId
    || c.name === ban.channel);
  if (!kenh) throw Object.assign(new Error('Không thấy kênh "' + (ban.channel || ban.extId) + '"'), { code: 400 });
  const f = T.live.f;
  const idPhien = ban.liveId || (kenh.extId + '-' + String(ban.start || '').slice(0, 16).replace(/[^0-9]/g, ''));
  const row = {
    [f.key]: kenh.platform + '#' + idPhien,
    [f.title]: ban.title || '',
    [f.channel]: [{ id: kenh.id }],
    [f.platform]: kenh.platform,
    [f.extId]: idPhien,
    [f.source]: ban.source === 'CSV LIVE Center' ? 'CSV LIVE Center' : 'Nhập tay',
  };
  const b = store.gioVeBase(ban.start);
  const k = store.gioVeBase(ban.end);
  if (b) row[f.start] = b;
  if (k) row[f.end] = k;
  ['minutes', 'views', 'peak', 'comments', 'likes', 'shares', 'newFollows'].forEach((x) => {
    if (ban[x] != null && ban[x] !== '') row[f[x]] = Number(ban[x]) || 0;
  });
  if (ban.url) row[f.url] = ban.url;
  return store.ghiTheoKhoa('live', [row], (x) => x[f.key]);
}

/**
 * Bỏ giá trị là BẢN CHE do giao diện gửi ngược lên.
 *
 * Giao diện hiện token dạng "abcd••••wxyz". Người dùng không sửa ô đó thì trình
 * duyệt gửi lại đúng chuỗi che ấy — mà chuỗi che khác rỗng, nên `b.x || cauHinh.x`
 * chọn nhầm nó và đem đi gọi nền tảng. Kết quả là "Client key or secret is
 * incorrect" trong khi secret thật vẫn nằm nguyên trong cấu hình.
 *
 * Đường Lưu cấu hình đã chặn từ đầu; ba endpoint hành động thì quên, nên tách
 * hẳn ra một hàm để lần sau không sót chỗ nào.
 */
const tho = (v) => (typeof v === 'string' && v.includes('••••') ? '' : (v || ''));

/* ---------------- API ---------------- */
async function api(req, res, u) {
  const p = u.pathname;
  const method = req.method;

  if (p === '/api/me') {
    const nd = await nguoiDung(req);
    return ok(res, {
      user: nd, quanLy: laQuanLy(req), mode: cfg.mode,
      baseUrl: cfg.baseUrl, nguonCauHinh: ketnoi.nguon(),
      khoBat: vault.bat(),
    });
  }

  if (p === '/api/tong-quan') return ok(res, await M.tongQuan(thamSo(u)));

  if (p === '/api/kenh' && method === 'GET') {
    const d = await store.tai(u.searchParams.get('moi') === '1');
    return ok(res, { kenh: d.channels, capNhat: d.luc });
  }

  if (p === '/api/kenh' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    const f = T.channel.f;
    const fields = {};
    if (b.name) fields[f.name] = b.name;
    if (b.platform) fields[f.platform] = b.platform;
    if (b.extId != null) fields[f.extId] = String(b.extId);
    if (b.handle != null) fields[f.handle] = b.handle;
    if (b.url != null) fields[f.url] = b.url;
    if (b.status) fields[f.status] = b.status;
    if (b.source) fields[f.source] = b.source;
    if (b.note != null) fields[f.note] = b.note;
    if (b.ownerIds) fields[f.owner] = b.ownerIds.map((id) => ({ id }));
    if (!Object.keys(fields).length) return fail(res, 400, 'Không có gì để ghi');
    let id = b.id;
    if (id) await lark.updateRecord(T.channel.id, id, fields);
    else id = await lark.createRecord(T.channel.id, fields);
    store.xoaCache();
    return ok(res, { id });
  }

  if (p === '/api/bai') {
    const t = thamSo(u);
    const d = await store.tai();
    return ok(res, {
      bai: M.topBai(d.posts, {
        ...t,
        theo: u.searchParams.get('theo') || 'views',
        n: Number(u.searchParams.get('n') || 50),
      }),
    });
  }

  if (p === '/api/live' && method === 'GET') {
    const t = thamSo(u);
    const d = await store.tai();
    const pset = t.platforms.length ? new Set(t.platforms) : null;
    return ok(res, {
      live: d.lives
        .filter((l) => (!l.date || (l.date >= t.from && l.date <= t.to))
          && (!pset || pset.has(l.platform)))
        .sort((a, b) => String(b.start).localeCompare(String(a.start))),
    });
  }

  if (p === '/api/nhap-tay' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    if (!b.date) return fail(res, 400, 'Thiếu ngày');
    return ok(res, await nhapTayNgay(b));
  }

  if (p === '/api/live/nhap-tay' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    return ok(res, await nhapTayLive(await readBody(req)));
  }

  if (p === '/api/live/dan-bang' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    const ds = docBangDan(b.text);
    let xong = 0;
    const hong = [];
    for (const r of ds) {
      try {
        await nhapTayLive({ ...r, channel: b.channel, extId: b.extId, source: 'CSV LIVE Center' });
        xong++;
      } catch (e) { hong.push((r.start || '?') + ': ' + e.message); }
    }
    return ok(res, { doc: ds.length, ghi: xong, hong });
  }

  if (p === '/api/nhat-ky') {
    const rows = await lark.listAll(T.log.id);
    const f = T.log.f;
    return ok(res, {
      nhatKy: rows.map((r) => ({
        at: store.clean(r.c[f.at]),
        platform: store.sel(r.c[f.platform]),
        from: store.clean(r.c[f.from]),
        to: store.clean(r.c[f.to]),
        result: store.sel(r.c[f.result]),
        rowsDaily: store.num(r.c[f.rowsDaily]),
        rowsPost: store.num(r.c[f.rowsPost]),
        rowsLive: store.num(r.c[f.rowsLive]),
        seconds: store.num(r.c[f.seconds]),
        message: store.clean(r.c[f.message]),
      })).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 100),
    });
  }

  /* ---- kết nối ---- */
  if (p === '/api/ket-noi' && method === 'GET') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const c = await ketnoi.doc();
    return ok(res, {
      cauHinh: ketnoi.checHet(c),
      nguon: ketnoi.nguon(),
      kho: await vault.tinhTrang(),
      nenTangApi: cfg.platformsApi,
    });
  }

  if (p === '/api/ket-noi' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    if (!b.khoi || !b.giaTri) return fail(res, 400, 'Thiếu khối cấu hình');
    if (!['facebook', 'instagram', 'tiktok', 'zalo', 'dongBo'].includes(b.khoi)) {
      return fail(res, 400, 'Khối cấu hình không hợp lệ');
    }
    /* Giá trị "abcd••••wxyz" là bản đã che mà giao diện gửi trả — nghĩa là người
     * dùng KHÔNG sửa ô đó. Ghi nguyên chuỗi che vào là xoá mất token thật. */
    const cu = ketnoi.docTho()[b.khoi] || {};
    const loc = (o, o0) => {
      const out = Array.isArray(o) ? [] : {};
      Object.keys(o).forEach((k) => {
        const v = o[k];
        if (typeof v === 'string' && v.includes('••••')) {
          const g = (o0 || {})[k];
          if (g !== undefined) out[k] = g;
          return;
        }
        out[k] = (v && typeof v === 'object')
          ? loc(v, (o0 || {})[k] || (Array.isArray(v) ? [] : {}))
          : v;
      });
      return out;
    };
    const moi = loc(b.giaTri, cu);

    /* Kênh TikTok: KHÔNG tin thứ tự mảng mà giao diện gửi lên.
     *
     * Bản che của giao diện được khôi phục theo VỊ TRÍ trong mảng, nên chỉ cần
     * người dùng xoá một dòng hoặc đảo thứ tự là token của kênh A rơi sang kênh B
     * — hai kênh vẫn "có token", đồng bộ vẫn chạy, chỉ là số đổ nhầm kênh và
     * không ai nhận ra. Ghép lại theo openId cho chắc. */
    if (b.khoi === 'tiktok' && Array.isArray(moi.channels)) {
      const cuTheoId = new Map((cu.channels || []).map((x) => [x.openId, x]));
      moi.channels = moi.channels.map((ch) => {
        const g = cuTheoId.get(ch.openId);
        if (!g) return ch;
        const ra = { ...g, ...ch };
        // Ô token còn che (hoặc trống) nghĩa là người dùng không sửa — giữ bản cũ.
        ['accessToken', 'refreshToken'].forEach((k) => {
          if (!ch[k] || String(ch[k]).includes('••••')) ra[k] = g[k];
        });
        if (ra.refreshToken === g.refreshToken) {
          ra.expiresAt = g.expiresAt;
          ra.refreshExpiresAt = g.refreshExpiresAt;
        }
        return ra;
      });
    }

    ketnoi.ghiKhoi(b.khoi, moi);
    await ketnoi.luuKho(b.khoi);
    return ok(res, { ok: true });
  }

  if (p === '/api/ket-noi/kiem-tra-kho' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    return ok(res, await vault.kiemTra());
  }

  if (p === '/api/ket-noi/thu' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    return ok(res, await sync.thu(b.chi || ''));
  }

  if (p === '/api/ket-noi/facebook/pages' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    const c = await ketnoi.doc();
    const conf = { ...c.facebook, userToken: tho(b.userToken) || c.facebook.userToken };
    const ds = await facebook.danhSachPage(conf);
    /* KHÔNG trả page token về trình duyệt. Giao diện chỉ cần biết có những trang
     * nào để tick chọn; token ở lại trên máy chủ. */
    return ok(res, {
      pages: ds.map((p2) => ({
        id: p2.id, name: p2.name, handle: p2.handle, url: p2.url,
        followers: p2.followers, instagram: p2.instagram,
      })),
    });
  }

  if (p === '/api/ket-noi/facebook/luu-pages' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    const c = await ketnoi.doc();
    const conf = { ...c.facebook, userToken: tho(b.userToken) || c.facebook.userToken };
    if (!conf.userToken) return fail(res, 400, 'Chưa có token Facebook');
    const ds = await facebook.danhSachPage(conf);
    const chon = new Set((b.pageIds || []).map(String));
    const pages = ds.filter((x) => chon.has(x.id)).map((x) => ({
      id: x.id, name: x.name, handle: x.handle, url: x.url, token: x.token,
    }));
    ketnoi.ghiKhoi('facebook', {
      ...c.facebook, userToken: conf.userToken, pages, enabled: pages.length > 0,
    });
    // Trang nào có IG Business thì cắm luôn, khỏi bắt người dùng đi tìm ID
    const igs = ds.filter((x) => chon.has(x.id) && x.instagram).map((x) => ({
      id: x.instagram.id, username: x.instagram.username, pageId: x.id,
      name: x.instagram.username || x.name,
    }));
    if (igs.length) ketnoi.ghiKhoi('instagram', { ...c.instagram, accounts: igs, enabled: true });
    /* Cất ngay vào kho: page token chỉ nằm trong ket-noi.json, mà file đó bay sau
     * mỗi lần deploy trên Render. */
    await ketnoi.luuKho('facebook');
    if (igs.length) await ketnoi.luuKho('instagram');
    return ok(res, { pages: pages.length, instagram: igs.length });
  }

  if (p === '/api/ket-noi/tiktok/link' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    const c = await ketnoi.doc();
    const conf = { ...c.tiktok, clientKey: tho(b.clientKey) || c.tiktok.clientKey };
    return ok(res, { link: tiktok.linkCapQuyen(conf, b.redirectUri, b.mode || 'display') });
  }

  if (p === '/api/ket-noi/tiktok/doi-ma' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    if (!b.code) return fail(res, 400, 'Thiếu mã uỷ quyền');
    const c = await ketnoi.doc();
    const conf = {
      ...c.tiktok,
      clientKey: tho(b.clientKey) || c.tiktok.clientKey,
      clientSecret: tho(b.clientSecret) || c.tiktok.clientSecret,
    };
    const tok = await tiktok.doiMa(conf, b.code, b.redirectUri || '');

    /* Hỏi luôn tên kênh: người dùng vừa cấp quyền cho tài khoản nào thì thấy ngay
     * tên tài khoản đó, khỏi phải đoán open_id nào là kênh nào. Hỏng bước này
     * cũng không sao — token đã có rồi, chỉ là thiếu cái tên. */
    let hs = { name: '', handle: '', followers: 0 };
    try { hs = await tiktok.hoSoDisplay(tok.accessToken); } catch (_) {}

    const chs = (c.tiktok.channels || []).filter((x) => x.openId !== tok.openId);
    chs.push({
      openId: tok.openId,
      name: b.name || hs.name || tok.openId,
      handle: hs.handle || '',
      mode: b.mode === 'business' ? 'business' : 'display',
      businessId: b.businessId || '',
      accessToken: tok.accessToken,
      refreshToken: tok.refreshToken,
      expiresAt: tok.expiresAt,
      refreshExpiresAt: tok.refreshExpiresAt,
    });
    ketnoi.ghiKhoi('tiktok', { ...conf, channels: chs, enabled: true });
    await ketnoi.luuToken('tiktok', chs);

    /* KIỂM CHỨNG, không chỉ "đã gọi hàm lưu".
     *
     * Đã có lần app trên Render chưa được chia sẻ Base nên mọi lời ghi kho hỏng
     * lặng lẽ; người dùng cấp quyền xong năm kênh, thấy báo thành công, rồi mất
     * sạch sau lần deploy kế tiếp. Đọc lại kho và nói thẳng nếu chưa vào. */
    let canhBao = '';
    if (vault.bat()) {
      const kho = await vault.doc('tiktok');
      const co = ((kho || {}).channels || []).some((x) => x.openId === tok.openId);
      if (!co) {
        canhBao = 'Kênh đã nối NHƯNG chưa cất được vào kho khoá — lần deploy tới sẽ mất. '
          + ((await vault.tinhTrang()).canhBao || 'Bấm "Kiểm tra kho" để xem vì sao.');
      }
    }
    return ok(res, {
      openId: tok.openId, name: hs.name || '', handle: hs.handle || '',
      followers: hs.followers || 0, scope: tok.scope, soKenh: chs.length, canhBao,
    });
  }

  if (p === '/api/ket-noi/zalo/doi-ma' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    if (!b.code) return fail(res, 400, 'Thiếu oauth code');
    const c = await ketnoi.doc();
    const conf = {
      ...c.zalo,
      appId: tho(b.appId) || c.zalo.appId,
      secretKey: tho(b.secretKey) || c.zalo.secretKey,
    };
    const tok = await zalo.doiMa(conf, b.code, b.codeVerifier || '');
    const tt = await zalo.thongTinOa(tok.accessToken);
    const oas = (c.zalo.oas || []).filter((o) => o.oaId !== tt.oaId);
    oas.push({ oaId: tt.oaId, name: tt.name, ...tok });
    ketnoi.ghiKhoi('zalo', { ...conf, oas, enabled: true });
    await ketnoi.luuToken('zalo', oas);
    return ok(res, { oaId: tt.oaId, name: tt.name, followers: tt.followers });
  }

  /* ---- đồng bộ ---- */
  if (p === '/api/dong-bo' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    return ok(res, await chayDongBo({ from: b.from, to: b.to, chi: b.chi || '' }));
  }

  if (p === '/api/dong-bo/trang-thai') {
    return ok(res, {
      dangChay: TT.dangChay,
      giay: TT.batDau ? Math.round((Date.now() - TT.batDau) / 1000) : 0,
      log: TT.log.slice(-80),
      ketQua: TT.ketQua,
      loi: TT.loi,
      lich: LICH,
    });
  }

  return fail(res, 404, 'Không có đường dẫn ' + p);
}

/* ---------------- chạy tự động ---------------- */
const LICH = { moiSoGio: 0, lanToi: 0, lanCuoi: 0 };

function batLich() {
  const conf = ketnoi.docTho();
  const gio = Number((conf.dongBo || {}).moiSoGio || 0);
  LICH.moiSoGio = gio;
  if (!gio) return;
  /* Chưa nối nền tảng nào mà vẫn hẹn giờ thì cứ 6 tiếng lại đẻ một dòng nhật ký
   * "không lấy được gì" — rác, và làm người đọc tưởng đồng bộ đang hỏng. */
  if (!['facebook', 'instagram', 'tiktok', 'zalo'].some((k) => conf[k] && conf[k].enabled)) {
    LICH.moiSoGio = 0;
    console.log('  Chưa nối nền tảng nào — chưa bật chạy tự động.');
    return;
  }
  const ms = gio * 3600 * 1000;
  LICH.lanToi = Date.now() + ms;
  setInterval(async () => {
    if (TT.dangChay) return;
    try {
      await chayDongBo({});
      LICH.lanCuoi = Date.now();
    } catch (e) { console.error('[lịch] ' + e.message); }
    LICH.lanToi = Date.now() + ms;
  }, ms);
  console.log('  Tự đồng bộ mỗi ' + gio + ' giờ');
}

/* ---------------- khởi động ---------------- */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/healthz') return ok(res, { ok: true, app: 'social', mode: cfg.mode });
  if (!u.pathname.startsWith('/api/')) return serveStatic(req, res, u.pathname);
  api(req, res, u).catch((err) => {
    const code = err.code && Number.isInteger(err.code) ? err.code : 500;
    console.error('[API]', u.pathname, '->', err.message);
    fail(res, code >= 400 && code < 600 ? code : 500, err.message || 'Lỗi không xác định');
  });
});

/* MẶC ĐỊNH CHỈ NGHE 127.0.0.1 — app tin header danh tính do lớp vỏ gửi, nên mở
 * cổng ra mạng ngoài là ai cũng tự xưng được là quản lý. Đặt BIND_HOST=0.0.0.0
 * thì việc tin header TỰ TẮT; hai thứ đó không được phép cùng bật. */
const BIND = process.env.BIND_HOST || '127.0.0.1';
const LOOPBACK = ['127.0.0.1', '::1', 'localhost'];
if (!LOOPBACK.includes(BIND) && process.env.HUB_TRUST_HEADER !== '0') {
  process.env.HUB_TRUST_HEADER = '0';
  console.warn('\n  [bảo mật] BIND_HOST=' + BIND + ' mở cổng ra ngoài, nên đã TẮT việc tin\n'
    + '  header danh tính của lớp vỏ. Chạy dưới Marketing Hub thì bỏ BIND_HOST.\n');
}

server.listen(cfg.port, BIND, () => {
  console.log('\n  Social — Rooty Trip');
  console.log('  http://localhost:' + cfg.port);
  console.log('  Base: ' + cfg.baseUrl + '\n');
  store.tai(true)
    .then((d) => console.log('  Đã nạp: ' + d.channels.length + ' kênh · ' + d.daily.length
      + ' dòng ngày · ' + d.posts.length + ' bài · ' + d.lives.length + ' phiên LIVE'))
    .catch((e) => console.error('  Không nạp được Base:', e.message));
  batLich();
});

module.exports = { thamSo };
