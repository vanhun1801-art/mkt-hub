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
const tienLive = require('./tien-live');
const { docBang: docXlsx } = require('../lark-chung/xlsx-doc');
const canhBao = require('./canh-bao');
const noiDung = require('./noi-dung');
const binhLuan = require('./binh-luan');
const nhan = require('./nhan');
const nguoiDang = require('./nguoi-dang');
const choKhop = require('./cho-khop');
const phanLoai = require('./phan-loai');
/* Lọc mã ra khỏi mọi thông báo lỗi trước khi trả về trình duyệt. */
const { scrub } = require('./sync/http');
const phamVi = require('./pham-vi');
const xuatDT = require('./xuat-doi-tac');
const facebook = require('./sync/facebook');
const zalo = require('./sync/zalo');
const tiktok = require('./sync/tiktok');
const { docBangDan, docBangObj, COT_LIVE } = require('./bang-dan');

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

/**
 * Đọc thân yêu cầu ở dạng NHỊ PHÂN — cho đường thả tệp .xlsx. readBody() bên
 * dưới ép sang utf8 rồi JSON.parse, làm thế với một file zip là hỏng file.
 */
function readRaw(req, tran = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > tran) { reject(new Error('Tệp quá lớn (trần ' + Math.round(tran / 1048576) + 'MB)')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Một tệp LIVE Center → danh sách phiên, nhận cả .xlsx lẫn .csv/.txt.
 *
 * Nhận dạng theo NỘI DUNG chứ không theo đuôi tên: 'PK' ở hai byte đầu là zip,
 * tức .xlsx. Người ta hay đổi đuôi tay, và đoán theo đuôi thì một file .xlsx
 * đặt tên .csv sẽ ra một mớ ký tự rác chứ không ra lỗi đọc được.
 */
function docTepLive(buf, ten = '') {
  if (!buf || !buf.length) throw Object.assign(new Error('Tệp rỗng'), { code: 400 });
  const laZip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (laZip) {
    const { rows } = docXlsx(buf, { tenCot: Object.keys(COT_LIVE) });
    return docBangObj(rows);
  }
  // Bỏ BOM: Excel xuất CSV kèm BOM, để nguyên thì tên cột đầu tiên không khớp.
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (/^\s*</.test(text)) {
    throw Object.assign(new Error('Tệp "' + ten + '" trông như một trang web, không phải bảng số liệu.'), { code: 400 });
  }
  return docBangDan(text);
}

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
function thamSo(u, hanMuc) {
  const list = (k) => {
    const v = u.searchParams.get(k);
    return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
  };
  const days = Number(u.searchParams.get('days') || 0);
  let to = u.searchParams.get('to') || store.homNay();
  let from = u.searchParams.get('from') || '';
  if (!from) from = store.themNgay(to, -((days > 0 ? days : 30) - 1));
  return {
    from, to,
    platforms: list('platform'),
    /* Chốt phân quyền nằm ở đây, phía máy chủ. Giao diện có lọc sẵn theo phần
     * của mình, nhưng giao diện là thứ sửa được — gọi thẳng API với tên kênh
     * ngoài phần mình vẫn phải ra rỗng. */
    channels: phamVi.ganLoc(list('channel'), hanMuc),
  };
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
  /* Email là khoá khớp của phân quyền xem kênh — xem pham-vi.js. Hub gửi nó đã
   * mã hoá URL vì email có thể chứa ký tự cần thoát. */
  const giaiMa = (v) => {
    if (!v) return '';
    try { return decodeURIComponent(String(v)); } catch (_) { return String(v); }
  };
  return {
    id: String(id),
    name: String(deco),
    email: giaiMa(req.headers['x-hub-user-email']),
    emailPhu: giaiMa(req.headers['x-hub-user-email-phu']),
  };
}

/**
 * Giới hạn kênh của người đang gọi. Trả null nghĩa là không giới hạn.
 *
 * Đọc bảng Kênh mỗi lần thay vì cất sẵn: quản lý vừa khai xong một dòng thì
 * người kia mở lại app là thấy ngay, không phải đợi hết vòng cache.
 */
async function hanMucKenh(req) {
  if (laQuanLy(req)) return null;
  const nguoi = await nguoiDung(req);
  const d = await store.tai();
  return phamVi.gioiHan(d.channels, nguoi, false);
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

/** Cấu hình app đứng tên gửi tin — gom một chỗ để chỉ có một nguồn sự thật. */
const guiCfg = () => ({
  appId: cfg.tinAppId, appSecret: cfg.tinAppSecret,
  apiHost: cfg.apiHost, tenApp: cfg.tinAppTen,
});

/**
 * Soát cảnh báo sau một lượt đồng bộ. Nuốt mọi lỗi: đồng bộ đã xong và số đã vào
 * Base rồi, không được để một cái tin nhắn làm hỏng kết quả đó.
 */
async function soatCanhBao(nhan) {
  try {
    const c = await ketnoi.doc();
    const r = await canhBao.chay(c.canhBao, guiCfg());
    if (r.gui) ghiLog('Cảnh báo: gửi ' + r.gui + ' mục vào nhóm Lark.');
    else if (r.loi) ghiLog('Cảnh báo: KHÔNG gửi được — ' + r.loi);
    return r;
  } catch (e) {
    console.warn('[' + (nhan || 'cảnh báo') + '] ' + e.message);
    return { loi: e.message };
  }
}

/**
 * Thử ghép lại hàng chờ người đăng với bài vừa kéo về.
 *
 * Bắt buộc store.tai(true): cache còn giữ danh sách bài TRƯỚC lúc đồng bộ, mà
 * đúng cái bài vừa về mới là cái cần khớp — dùng cache là lần nào cũng trượt.
 */
async function khopLaiNguoiDang() {
  const d = await store.tai(true);
  const k = await choKhop.khopLai(d.posts, d.channels);
  if (k.ghi) {
    store.xoaCache();
    await store.ghiNhatKy({
      platform: 'Facebook',
      result: 'Thành công',
      rowsPost: k.ghi,
      message: 'NGƯỜI ĐĂNG (hàng chờ) · ghi ' + k.ghi + ' bài'
        + (k.ten.length ? ' · ' + k.ten.join(', ') : '')
        + ' · còn chờ ' + k.conCho
        + (k.quaHan ? ' · quá hạn ' + k.quaHan : ''),
    });
  }
  return k;
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
    /* Đồng bộ vừa kéo bài mới về — đây đúng là lúc hàng chờ người đăng có cơ
     * khớp được. Chạy ở đây chứ không nhờ trình duyệt ai cả. Hỏng thì ghi log
     * rồi thôi: không để nó làm hỏng một lượt đồng bộ đã xong. */
    /* Phân loại Bán hàng / Tương tác theo thẻ #Tour. Chạy trước phần người
     * đăng vì nó chỉ đọc caption — không phụ thuộc gì, và hỏng thì cũng không
     * được kéo theo phần kia. */
    try {
      const pl = await phanLoai.chay((await store.tai(true)).posts);
      if (pl.soDoi) {
        store.xoaCache();
        ghiLog('Phân loại: đổi ' + pl.soDoi + ' bài · bán hàng ' + pl.ban
          + ' · tương tác ' + pl.tuong);
      }
    } catch (e) { ghiLog('Phân loại: hỏng — ' + e.message); }

    try {
      const k = await khopLaiNguoiDang();
      if (k.ghi || k.quaHan) {
        ghiLog('Người đăng: ghi ' + k.ghi + ' bài'
          + (k.ten.length ? ' (' + k.ten.join(', ') + ')' : '')
          + ' · còn chờ ' + k.conCho + (k.quaHan ? ' · quá hạn ' + k.quaHan : ''));
      }
    } catch (e) { ghiLog('Người đăng: khớp lại hỏng — ' + e.message); }

    /* Gắn tiền cho phiên LIVE. Chạy SAU khi bảng Phiên LIVE đã được ghi, và
     * chạy lại cả khoảng chứ không chỉ phiên mới — doanh thu của một buổi LIVE
     * còn chạy tiếp nhiều ngày sau khi nó tắt. Hỏng thì ghi log rồi thôi: một
     * lượt đồng bộ đã kéo được số về không đáng bị coi là thất bại chỉ vì
     * Tourwell chặn nhịp. */
    try {
      const g = await tienLive.ganTien({ from: r.tu, to: r.den, log: ghiLog });
      if (g.bo) ghiLog('Tiền LIVE: ' + g.lyDo);
      else {
        ghiLog('Tiền LIVE: ' + g.soPhien + ' phiên · ' + g.ganLead + ' lead · '
          + Number(g.doanhThu || 0).toLocaleString('vi-VN') + 'đ');
      }
    } catch (e) { ghiLog('Tiền LIVE: gắn hỏng — ' + e.message); }

    await soatCanhBao('sau đồng bộ');
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

/**
 * Ghi cả một danh sách phiên đọc từ bản xuất LIVE Center (dán bảng hoặc thả
 * tệp). Một dòng hỏng thì ghi tên dòng đó vào `hong` rồi đi tiếp — mất một
 * phiên còn hơn mất cả bản xuất, và người bấm cần biết chính xác dòng nào hỏng.
 */
async function ghiDsLive(ds, { channel = '', extId = '' } = {}) {
  let ghi = 0;
  const hong = [];
  for (const r of ds) {
    try {
      await nhapTayLive({ ...r, channel, extId, source: 'CSV LIVE Center' });
      ghi += 1;
    } catch (e) { hong.push((r.start || '?') + ': ' + e.message); }
  }
  return { doc: ds.length, ghi, hong };
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

  /* Ai gọi tới cũng tiện thể ngó lịch — xem ngoLich(). Không chặn lượt gọi này. */
  ngoLich();

  if (p === '/api/me') {
    const nd = await nguoiDung(req);
    const quanLy = laQuanLy(req);
    const d = await store.tai();
    const han = phamVi.gioiHan(d.channels, nd, quanLy);
    return ok(res, {
      user: nd, quanLy, mode: cfg.mode,
      baseUrl: cfg.baseUrl, nguonCauHinh: ketnoi.nguon(),
      khoBat: vault.bat(),
      /* Để giao diện nói được "anh đang xem 3/11 kênh được giao" thay vì âm thầm
       * hiện số nhỏ hơn thực tế và người dùng tưởng số liệu hụt. */
      phamVi: han ? { soKenh: han.length, tongKenh: d.channels.length } : null,
    });
  }

  if (p === '/api/tong-quan') return ok(res, await M.tongQuan(thamSo(u, await hanMucKenh(req))));

  if (p === '/api/kenh' && method === 'GET') {
    const d = await store.tai(u.searchParams.get('moi') === '1');
    const quanLy = laQuanLy(req);
    const nguoi = await nguoiDung(req);
    /* Nhân sự chỉ nhận danh sách kênh của mình — cả ô lọc kênh trên thanh công
     * cụ cũng chỉ liệt kê bấy nhiêu, thay vì bày ra tên mười một kênh rồi chọn
     * cái nào cũng trả rỗng. */
    return ok(res, {
      kenh: phamVi.kenhCuaNguoi(d.channels, nguoi, quanLy),
      tongSoKenh: d.channels.length,
      capNhat: d.luc,
    });
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
    const t = thamSo(u, await hanMucKenh(req));
    const d = await store.tai();
    return ok(res, {
      bai: M.topBai(d.posts, {
        ...t,
        theo: u.searchParams.get('theo') || 'views',
        n: Number(u.searchParams.get('n') || 50),
      }),
      /* Bảng chấm KPI theo người đăng — chỉ quản lý. Tính trên TOÀN BỘ bài
       * trong kỳ chứ không phải năm mươi bài đang bày: bảng xếp hạng dựa trên một
       * phần danh sách là sai theo kiểu nhìn không ra. */
      theoNguoi: laQuanLy(req)
        ? nguoiDang.gopTheoNguoi(M.topBai(d.posts, { ...t, theo: 'views', n: 100000 }))
        : null,
    });
  }

  if (p === '/api/noi-dung') {
    const t = thamSo(u, await hanMucKenh(req));
    const d = await store.tai();
    /* Lọc đúng như tab Bài đăng để hai màn hình không bao giờ nói hai con số
     * khác nhau cho cùng một khoảng ngày. */
    const bai = M.topBai(d.posts, { ...t, theo: 'views', n: 100000 });
    return ok(res, noiDung.tongHop(bai, { tz: cfg.tzOffsetHours }));
  }

  if (p === '/api/nhan' && method === 'GET') {
    const t = thamSo(u, await hanMucKenh(req));
    const d = await store.tai();
    const ds = nhan.chuanHoaNhan(await store.taiNhan());
    const bai = M.topBai(d.posts, { ...t, theo: 'views', n: 100000 });
    const gop = nhan.gopTheoNhan(bai, ds);
    /* Gộp theo đối tác: KHÔNG cộng dồn số của các nhãn con, vì một bài mang hai
     * nhãn của cùng đối tác vẫn chỉ là một bài. Xem nhan.gopTheoDoiTac(). */
    const theoDoiTac = nhan.gopTheoDoiTac(bai, ds);
    return ok(res, {
      /* Bỏ mảng bài ra khỏi phản hồi — 1.300 bài nhân nhiều nhãn là payload vài
       * megabyte mà bảng không dùng tới. Muốn xem bài thì tải CSV. */
      nhan: gop.map(({ bai: _b, ...o }) => o),
      /* Bản THÔ của bảng Nhãn bài, kể cả nhãn đang tắt hoặc chưa khai hashtag —
       * màn hình thiết lập phải sửa được cả những dòng đó, chứ không chỉ những
       * dòng đủ điều kiện tính số. */
      thoNhan: (await store.taiNhan()).map((x) => ({
        id: x.id, nhan: x.nhan, nhom: x.nhom, hashtag: x.hashtag,
        doiTac: x.doiTac, ghiChu: x.ghiChu, bat: x.bat,
      })),
      theoDoiTac,
      /* Mọi hashtag đang dùng trong khoảng lọc, kèm nhãn đang giữ nó. Giao diện
       * dùng bảng này cho hai việc: liệt kê thẻ chưa có chủ, và gợi ý thẻ khi
       * khai nhãn. Gửi một lần thay vì mỗi lần gõ lại hỏi máy chủ. */
      the: nhan.thongKeThe(bai, ds),
      khongNhan: nhan.baiKhongNhan(bai, ds).length,
      tongBai: bai.length,
      soNhan: ds.length,
    });
  }

  /* Thêm / sửa / xoá nhãn ngay trong app, khỏi phải mở Base.
   *
   * Vẫn ghi thẳng xuống bảng "Nhãn bài" chứ không giữ một bản sao ở đâu khác —
   * một nguồn sự thật, ai quen Base hơn thì sửa trong Base vẫn được. */
  /* Gợi ý thẻ cho một nhãn. Để máy chủ tính thay vì chép luật sang trình duyệt:
   * hai bản sao của cùng một luật sớm muộn cũng lệch nhau, và lúc đó không ai
   * biết bản nào đúng. */
  /* Gán email người xem cho một kênh. Chỉ quản lý. */
  /* Khai theo NGƯỜI thay vì theo kênh — để màn hình phân quyền của Hub gom được
   * cả hai tầng vào một chỗ.
   *
   * Bảng trong Base lưu theo kênh (mỗi kênh một danh sách email), còn người
   * dùng nghĩ theo người ("Ngọc xem những kênh nào"). Chuyển trục ở đây chứ
   * không bắt giao diện tự cộng trừ từng kênh: làm ở giao diện thì mỗi lần lưu
   * phải đọc lại 11 kênh, quên một kênh là âm thầm gán sai.
   */
  if (p === '/api/kenh/nguoi-xem-cua' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return fail(res, 400, 'Thiếu email công ty');
    const chon = new Set((Array.isArray(b.ids) ? b.ids : []).map(String));

    const ds = await store.taiKenh();
    const f = cfg.tables.channel.f;
    const doi = {};
    ds.forEach((c) => {
      const cu = phamVi.tachEmail(c.viewers);
      const co = cu.includes(email);
      const can = chon.has(String(c.id));
      if (co === can) return;                 // không đổi thì đừng ghi
      const moi = can ? [...cu, email] : cu.filter((x) => x !== email);
      doi[c.id] = { [f.viewers]: moi.join(', ') };
    });
    if (Object.keys(doi).length) {
      await lark.updateMany(cfg.tables.channel.id, doi);
      store.xoaCache();
    }
    return ok(res, { ok: true, doi: Object.keys(doi).length, soKenh: chon.size });
  }

  /* Danh sách kênh kèm người được xem — cho màn hình phân quyền của Hub. */
  if (p === '/api/kenh/quyen' && method === 'GET') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const d = await store.tai();
    return ok(res, {
      kenh: (d.channels || []).map((c) => ({
        id: c.id, name: c.name, platform: c.platform,
        viewers: phamVi.tachEmail(c.viewers),
      })),
    });
  }

  if (p === '/api/kenh/nguoi-xem' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    if (!b.id) return fail(res, 400, 'Thiếu kênh');
    const ds = phamVi.tachEmail(b.emails);
    /* Gõ một chuỗi không phải email thì lọc sẽ im lặng không khớp ai — nói ngay
     * còn hơn để người dùng tưởng đã gán xong. */
    const tho = String(b.emails || '').split(/[\s,;|]+/).map((x) => x.trim()).filter(Boolean);
    const hong = tho.filter((x) => !x.includes('@'));
    if (hong.length) return fail(res, 400, 'Không phải email: ' + hong.join(', '));
    await lark.updateRecord(cfg.tables.channel.id, b.id, {
      [cfg.tables.channel.f.viewers]: ds.join(', '),
    });
    store.xoaCache();
    return ok(res, { ok: true, so: ds.length });
  }

  if (p === '/api/nhan/goi-y' && method === 'GET') {
    const t = thamSo(u, await hanMucKenh(req));
    const d = await store.tai();
    const ds = nhan.chuanHoaNhan(await store.taiNhan());
    const bai = M.topBai(d.posts, { ...t, theo: 'views', n: 100000 });
    const tk = nhan.thongKeThe(bai, ds);
    const ten = (u.searchParams.get('nhan') || '').trim();
    /* Thẻ đã thuộc nhãn KHÁC thì không gợi ý — hai nhãn cùng giữ một thẻ là hai
     * đối tác cùng đếm một bài. Thẻ của chính nhãn đang sửa thì không tính. */
    const cuaNguoiKhac = new Set(tk.filter((x) => x.thuocNhan && x.thuocNhan !== ten).map((x) => x.the));
    return ok(res, {
      ds: nhan.goiYThe(
        { nhan: ten, hashtag: u.searchParams.get('hashtag') || '' },
        tk, cuaNguoiKhac, bai.length),
    });
  }

  /* Một thẻ chưa có chủ thì hợp với nhãn nào đã có. Trả kèm TOÀN BỘ nhãn để hộp
   * chọn không phải gọi thêm lần nữa — danh sách nhãn vốn ngắn. */
  if (p === '/api/the/nhan-hop' && method === 'GET') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const the = (u.searchParams.get('the') || '').trim();
    if (!the) return fail(res, 400, 'Thiếu hashtag');
    const ds = nhan.chuanHoaNhan(await store.taiNhan());
    return ok(res, {
      goiY: nhan.nhanHopVoiThe(the, ds),
      tatCa: ds.map((x) => ({ nhan: x.nhan, nhom: x.nhom, doiTac: x.doiTac, the: x.the })),
    });
  }

  /* Gắn thêm một thẻ vào nhãn đã có — nối vào cuối, không đụng thẻ cũ. */
  if (p === '/api/the/gan' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    const the = nhan.tachThe(b.the)[0];
    const ten = String(b.nhan || '').trim();
    if (!the || !ten) return fail(res, 400, 'Thiếu hashtag hoặc nhãn');

    const tho = await store.taiNhan();
    const dong = tho.find((x) => x.nhan === ten);
    if (!dong) return fail(res, 404, 'Không có nhãn "' + ten + '"');

    /* Thẻ đã thuộc nhãn khác thì dừng: hai nhãn cùng giữ một thẻ là hai đối tác
     * cùng đếm một bài, và tổng của họ lớn hơn số bài thật. */
    const chu = tho.find((x) => x.nhan !== ten && nhan.tachThe(x.hashtag).includes(the));
    if (chu) return fail(res, 400, 'Thẻ ' + the + ' đang thuộc nhãn "' + chu.nhan + '"');

    const daCo = nhan.tachThe(dong.hashtag);
    if (daCo.includes(the)) return ok(res, { ok: true, daCo: true });
    await lark.updateRecord(cfg.tables.label.id, dong.id, {
      [cfg.tables.label.f.hashtag]: (String(dong.hashtag || '').trim() + ' ' + the).trim(),
    });
    store.xoaCache();
    return ok(res, { ok: true, nhan: ten, the });
  }

  if (p === '/api/nhan/luu' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    const ten = String(b.nhan || '').trim();
    if (!ten) return fail(res, 400, 'Chưa đặt tên nhãn');
    if (!String(b.hashtag || '').trim()) {
      return fail(res, 400, 'Nhãn phải có ít nhất một hashtag, nếu không nó không bao giờ khớp bài nào');
    }
    const f = cfg.tables.label.f;
    const o = {
      [f.name]: ten,
      [f.group]: String(b.nhom || '').trim(),
      [f.hashtag]: String(b.hashtag || '').trim(),
      [f.partner]: String(b.doiTac || '').trim(),
      [f.on]: b.bat !== false,
      [f.note]: String(b.ghiChu || '').trim(),
    };
    /* Trùng tên là hỏng thầm: hai dòng cùng tên thì bảng gộp số về một chỗ còn
     * dòng kia biến mất, mà nhìn Base vẫn thấy đủ hai. */
    const dsCu = await store.taiNhan();
    const trung = dsCu.find((x) => x.nhan === ten && x.id !== b.id);
    if (trung) return fail(res, 400, 'Đã có nhãn tên "' + ten + '" rồi');

    let doiBai = 0;
    if (b.id) {
      /* Đổi tên nhãn phải kéo theo cột "Nhãn gắn bù" của bài, vì cột đó lưu TÊN
       * chứ không lưu id. Không làm thì 105 bài gắn bù trỏ vào cái tên cũ, bị
       * lọc ra như nhãn ma, và mất nhãn mà không có gì báo. */
      const cu = dsCu.find((x) => x.id === b.id);
      await lark.updateRecord(cfg.tables.label.id, b.id, o);
      if (cu && cu.nhan && cu.nhan !== ten) {
        const d = await store.tai();
        const sua = {};
        d.posts.forEach((x) => {
          const moi = nhan.doiTenTrongNhanBu(x.nhanBu, cu.nhan, ten);
          if (moi != null) sua[x.id] = { [cfg.tables.post.f.labels]: moi };
        });
        const ids = Object.keys(sua);
        for (let i = 0; i < ids.length; i += 200) {
          const lo = {};
          ids.slice(i, i + 200).forEach((id) => { lo[id] = sua[id]; });
          await lark.updateMany(cfg.tables.post.id, lo);
        }
        doiBai = ids.length;
      }
    } else {
      await lark.createRecord(cfg.tables.label.id, o);
    }
    store.xoaCache();
    return ok(res, { ok: true, doiBai });
  }

  if (p === '/api/nhan/xoa' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    if (!b.id) return fail(res, 400, 'Thiếu id');
    await lark.deleteRecords(cfg.tables.label.id, [b.id]);
    store.xoaCache();
    return ok(res, { ok: true });
  }

  /* Xuất báo cáo cho MỘT đối tác: Excel hoặc trang in.
   * Gom một chỗ vì hai định dạng dùng chung y hệt bộ số — tách ra là sớm muộn
   * hai tệp gửi cùng một đối tác lại nói hai con số khác nhau. */
  if (p === '/api/doi-tac/xuat' && method === 'GET') {
    const t = thamSo(u, await hanMucKenh(req));
    const ten = (u.searchParams.get('doiTac') || '').trim();
    if (!ten) return fail(res, 400, 'Chưa chọn đối tác');
    const kieu = u.searchParams.get('kieu') === 'in' ? 'in' : 'excel';

    const d = await store.tai();
    const ds = nhan.chuanHoaNhan(await store.taiNhan());
    const bai = M.topBai(d.posts, { ...t, theo: 'views', n: 100000 });
    const cuaDT = ds.filter((x) => x.doiTac === ten);
    if (!cuaDT.length) return fail(res, 404, 'Không có nhãn nào thuộc đối tác "' + ten + '"');

    const theoNhan = nhan.gopTheoNhan(bai, ds).filter((o) => o.doiTac === ten);
    const tongHop = nhan.gopTheoDoiTac(bai, ds).find((o) => o.doiTac === ten)
      || { soBai: 0, views: 0, reach: 0, likes: 0, comments: 0, shares: 0, engagement: 0, tyLeTuongTac: 0 };
    const ban = { doiTac: ten, nhan: theoNhan, tongHop, tu: t.from, den: t.to };

    if (kieu === 'in') {
      const html = xuatDT.trangIn({ ...ban, logo: await xuatDT.logoHtml() });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    const buf = xuatDT.excelDoiTac(ban);
    const tep = 'bao-cao-' + ten.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '-' + t.from + '-' + t.to + '.xlsx';
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': buf.length,
      'Content-Disposition': "attachment; filename=\"bao-cao.xlsx\"; filename*=UTF-8''"
        + encodeURIComponent(tep),
    });
    return res.end(buf);
  }

  if (p === '/api/nhan/csv' && method === 'GET') {
    const t = thamSo(u, await hanMucKenh(req));
    const ten = u.searchParams.get('nhan') || '';
    const d = await store.tai();
    const ds = nhan.chuanHoaNhan(await store.taiNhan());
    const bai = M.topBai(d.posts, { ...t, theo: 'views', n: 100000 });
    const o = nhan.gopTheoNhan(bai, ds).find((x) => x.nhan === ten);
    if (!o) return fail(res, 404, 'Không có nhãn "' + ten + '"');
    const csv = nhan.csvChoNhan(o, { tu: t.from, den: t.to });
    /* Tên tệp có dấu tiếng Việt: phải dùng filename* RFC 5987, không thì trình
     * duyệt lưu thành một xâu ký tự hỏng. */
    const tep = 'social-' + ten.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()
      + '-' + t.from + '-' + t.to + '.csv';
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': "attachment; filename=\"bao-cao.csv\"; filename*=UTF-8''"
        + encodeURIComponent(tep),
    });
    return res.end(csv);
  }

  if (p === '/api/binh-luan' && method === 'GET') {
    /* MỞ CHO NHÂN SỰ, nhưng bó theo kênh của họ.
     *
     * Trước đây chặn hẳn vì màn hình này gọi thẳng API Facebook. Nhưng người
     * trực kênh mới là người cần biết khách hỏi gì — bắt họ đi hỏi quản lý thì
     * lỡ mất khách. Bó theo phạm vi là đủ: họ chỉ quét được Trang của mình. */
    const gh = await hanMucKenh(req);
    const c = await ketnoi.doc();
    const r = await binhLuan.quet(c, {
      chiTrang: gh,
      soNgay: Number(u.searchParams.get('ngay')) || 7,
      soBaiMoiKenh: Number(u.searchParams.get('bai')) || 15,
      soBinhLuanMoiBai: Number(u.searchParams.get('moiBai')) || 50,
      chiKhachHoi: u.searchParams.get('tatCa') !== '1',
    });
    return ok(res, r);
  }

  if (p === '/api/live' && method === 'GET') {
    const t = thamSo(u, await hanMucKenh(req));
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

  /* Gắn lại số cho khoảng đang xem, không cần đợi lượt đồng bộ. Tên cũ
   * /gan-tien giữ lại để bản giao diện đang mở trong trình duyệt ai đó không
   * gãy giữa chừng khi máy chủ vừa lên bản mới.
   * Chỉ quản lý: mỗi lượt là vài chục lời gọi Tourwell, mà Tourwell chặn nhịp
   * chung cho cả phòng — không để ai bấm cũng được. */
  if ((p === '/api/live/gan-so' || p === '/api/live/gan-tien') && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const t = thamSo(u, await hanMucKenh(req));
    return ok(res, await tienLive.ganTien({ from: t.from, to: t.to, log: ghiLog }));
  }

  if (p === '/api/live/dan-bang' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    return ok(res, await ghiDsLive(docBangDan(b.text), b));
  }

  /* Thả tệp xuất của LIVE Center xuống app — .xlsx hoặc .csv.
   *
   * Thân yêu cầu là NHỊ PHÂN thô, không phải JSON và không phải multipart: chỉ
   * có đúng một tệp mỗi lượt, nên gói nó vào multipart là thêm một bộ phân tích
   * nữa để nuôi mà chẳng được gì. Tên tệp và kênh đi bằng query. */
  if (p === '/api/live/tai-tep' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const ten = u.searchParams.get('ten') || 'tệp';
    const buf = await readRaw(req);
    const ds = docTepLive(buf, ten);
    const kq = await ghiDsLive(ds, {
      channel: u.searchParams.get('channel') || '',
      extId: u.searchParams.get('extId') || '',
    });
    return ok(res, { ...kq, ten });
  }

  /* Hoạt động đăng bài — ai vừa đăng gì, cho MỌI NGƯỜI xem.
   *
   * Khác hẳn nhật ký đồng bộ bên dưới: cái kia là việc vận hành của máy (kéo
   * được bao nhiêu dòng, lỗi gì), còn đây là việc của người. Dữ liệu lấy từ bảng
   * Bài đăng chứ không từ bảng Nhật ký, nên tự động bó theo kênh của từng người
   * và không lòi ra caption của kênh họ không được xem. */
  if (p === '/api/hoat-dong' && method === 'GET') {
    const t = thamSo(u, await hanMucKenh(req));
    const d = await store.tai();
    const bai = M.topBai(d.posts, { ...t, theo: 'views', n: 100000 })
      .filter((x) => x.publishedAt)
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
      .slice(0, Number(u.searchParams.get('n') || 120));
    return ok(res, {
      hoatDong: bai.map((x) => ({
        date: x.date, publishedAt: x.publishedAt, platform: x.platform,
        channel: x.channel, poster: x.poster || '', title: x.title,
        url: x.url, views: x.views, engagement: x.engagement,
      })),
    });
  }

  if (p === '/api/nhat-ky') {
    /* Nhật ký là việc vận hành, không phải số liệu. Và từ khi tiện ích Người
     * đăng ghi vào đây thì nó còn kèm tên người đăng và vài chữ đầu của caption —
     * không có lý do để nhân sự đọc được của nhau. Đây là lỗ duy nhất còn sót:
     * hai tab quản lý kia đã chặn, riêng cái này quên. */
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
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
    if (!['facebook', 'instagram', 'tiktok', 'zalo', 'dongBo', 'canhBao'].includes(b.khoi)) {
      return fail(res, 400, 'Khối cấu hình không hợp lệ');
    }
    /* Giá trị "abcd••••wxyz" là bản đã che mà giao diện gửi trả — nghĩa là người
     * dùng KHÔNG sửa ô đó. Ghi nguyên chuỗi che vào là xoá mất token thật. */
    /* Bản CŨ phải lấy từ doc() — bản có kho khoá — chứ KHÔNG phải docTho().
     *
     * docTho() chỉ đọc ket-noi.json / biến môi trường. Trên Render vừa deploy thì
     * file rỗng, mọi cấu hình đang sống nhờ kho; lấy bản cũ từ docTho() là ra rỗng,
     * nên nhánh "giữ token cũ" bên dưới không có gì để giữ và bấm Lưu cấu hình một
     * cái là xoá sạch token của những kênh khôi phục từ kho. Đã xảy ra thật: kênh
     * rootytrip.official mất refreshToken đúng theo đường này. */
    const cu = (await ketnoi.doc())[b.khoi] || {};
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

    /* Cất vào kho BẢN ĐẦY ĐỦ, không phải phần vừa gửi lên.
     *
     * Giao diện chỉ gửi vài trường của khối (khối facebook gửi enabled +
     * userToken + apiVersion, KHÔNG gửi pages). Cất thẳng `moi` là kho mất sạch
     * danh sách Page — đã xảy ra thật: 3 page token biến khỏi kho sau một cú bấm
     * Lưu cấu hình, dù người dùng không đụng gì tới phần Page. */
    const dayDu = { ...cu, ...moi };
    ketnoi.ghiKhoi(b.khoi, moi);
    await ketnoi.luuKho(b.khoi, dayDu);
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

  /* Thử một mã BẤT KỲ xem nó có đọc được người đăng không — KHÔNG lưu lại.
   *
   * Facebook hiện "Người đăng: Phương Ái" ngay dưới tên Trang, nên dữ liệu có
   * thật. Trường tương ứng là `admin_creator`: nó TỒN TẠI (hỏi tên khác thì Graph
   * báo "nonexisting field", hỏi nó thì không báo) nhưng trả rỗng với mã của
   * Người dùng hệ thống. Tài liệu Meta ghi trường này thấy được "khi dùng Page
   * access token, hoặc user access token của người CÓ VAI TRÒ trên Trang" — mà
   * Người dùng hệ thống thì không phải một con người có vai trò.
   *
   * Nên phải thử bằng mã sinh từ tài khoản người thật. Mã đó chỉ sống trong một
   * lời gọi này rồi biến mất: không ghi ra đĩa, không vào kho, không trả ngược về
   * trình duyệt. Đang chạy được thì mới bàn tới chuyện lưu. */
  /* Nhận gói tin webhook Facebook mà hub chuyển sang, ghi nguyên văn vào Nhật ký.
   *
   * Đây là phép đo, không phải tính năng. Mọi đường ĐỌC người đăng đều đã chết:
   * admin_creator tồn tại nhưng luôn rỗng — thử trên bài mới lẫn bài 2023, trên
   * /posts, /feed, /published_posts, bằng mã Trang lẫn mã người thật có
   * business_management, trên v12 tới v23; /roles trả 0 người vì cả ba Trang đã
   * sang Trang kiểu mới. Webhook là hướng duy nhất còn lại, và tài liệu Meta
   * không nói rõ trường `from` trong gói tin là Trang hay người bấm đăng.
   *
   * Ghi vào Nhật ký thay vì console để còn đọc được từ Base — nhật ký của Render
   * mất sau mỗi lần deploy. Đo xong thì gỡ cả lối này lẫn lối bên hub. */
  /* Nhận "ai đăng bài nào" từ extension Chrome.
   *
   * Facebook hiện dòng "Người đăng: …" dưới mỗi bài nhưng không phát qua API —
   * đã truy đến cùng, xem đầu nguoi-dang.js. Nên dữ liệu này do trình duyệt của
   * chính người dùng đọc từ màn hình họ đang xem rồi gửi sang.
   *
   * Đường này nằm NGOÀI cổng đăng nhập (extension chạy ở origin facebook.com,
   * không mang theo phiên Lark), nên phải tự chặn:
   *   - chưa khai NGUOI_DANG_KEY thì trả 404 như không tồn tại;
   *   - sai khoá thì 401, không nói gì thêm;
   *   - chỉ ghi được ĐÚNG MỘT cột, và chỉ nhận ba tên đã khai sẵn.
   * Tức là lọt khoá thì kẻ gọi cũng chỉ đổi được tên người đăng, không chạm
   * được vào số liệu hay token.
   */
  /* Danh sách tên cho ô "Tôi là" trong tiện ích. Để tiện ích hỏi thay vì chép cứng:
   * đổi người thì chỉ sửa biến môi trường, không phải cài lại tiện ích cho từng máy. */
  if (p === '/api/nguoi-dang/nap' && method === 'GET') {
    const khoa = process.env.NGUOI_DANG_KEY || '';
    if (!khoa) return fail(res, 404, 'Chưa bật tính năng này');
    if (String(req.headers['x-nd-key'] || '') !== khoa) return fail(res, 401, 'Sai khoá');
    return ok(res, { nguoi: nguoiDang.NGUOI_DANG });
  }

  if (p === '/api/nguoi-dang/nap' && method === 'POST') {
    const khoa = process.env.NGUOI_DANG_KEY || '';
    if (!khoa) return fail(res, 404, 'Chưa bật tính năng này');
    const b = await readBody(req);
    if (String(b.khoa || req.headers['x-nd-key'] || '') !== khoa) {
      return fail(res, 401, 'Sai khoá');
    }
    const d = await store.tai();
    const r = nguoiDang.ghep(b.items, d.posts, d.channels);
    if (r.capNhat.length) {
      const f = store.T.post.f;
      const map = {};
      r.capNhat.forEach((x) => { map[x.id] = { [f.poster]: x.nguoi }; });
      await lark.updateMany(store.T.post.id, map);
      store.xoaCache();
    }

    /* GIỮ LẠI mục chưa khớp ở MÁY CHỦ.
     *
     * Trước đây chỗ này chỉ ghi một dòng nhật ký rồi thôi, và hàng chờ nằm
     * nguyên trong trình duyệt người đăng — mà tiện ích chỉ thử lại khi tab
     * Facebook còn mở. Bài hẹn giờ lên sóng sau khi người ta tắt máy là không
     * còn ai thử nữa: đã mất thật một bài như thế. Xem cho-khop.js.
     *
     * Hỏng riêng phần này thì đừng làm hỏng cả lượt gửi — bài vừa ghi được ở
     * trên vẫn phải tính là ghi được. */
    let choMoi = null;
    try {
      const chua = [...r.khongKhop, ...r.tenLa]
        .map((x) => (b.items || [])[x.viTri])
        .filter((x) => x && x.van)
        .map((x) => ({ nguoi: x.nguoi, van: x.van, nenTang: x.nenTang || 'Facebook', kenh: x.kenh }));
      choMoi = await choKhop.luu(chua);
    } catch (e) { choMoi = { loi: e.message }; }
    /* GHI NHẬT KÝ MỌI LƯỢT, kể cả lượt không ghi được bài nào.
     *
     * Không có dòng này thì khi máy của một bạn gửi lên mà chưa khớp được
     * (bài hẹn giờ ngày mai chưa có trong Base), không ai biết là nó đã tới hay
     * tiện ích chết im. Đúng kiểu lỗi im lặng đã gặp đủ mấy hôm nay. */
    const tenGui = [...new Set((b.items || []).map((x) => String((x && x.nguoi) || '?')))];
    /* Một lượt gửi có thể lẫn cả hai nền tảng — ghi 'Tất cả' thay vì nói dối
     * rằng đó là Facebook. */
    const nts = [...new Set((b.items || []).map((x) => (x && x.nenTang) || 'Facebook'))];
    await store.ghiNhatKy({
      platform: nts.length === 1 ? nts[0] : 'Tất cả',
      result: r.capNhat.length ? 'Thành công' : 'Một phần',
      rowsPost: r.capNhat.length,
      message: 'NGƯỜI ĐĂNG · nhận ' + (b.items || []).length
        + ' · ghi ' + r.capNhat.length
        + ' · chưa khớp ' + r.khongKhop.length
        + ' · từ: ' + tenGui.join(', ')
        + (r.tenLa.length ? ' · tên lạ: ' + r.tenLa.map((x) => x.nguoi).join(', ') : '')
        + (choMoi && choMoi.loi ? ' · KHÔNG GIỮ ĐƯỢC HÀNG CHỜ: ' + choMoi.loi
          : choMoi && choMoi.them ? ' · vào hàng chờ: ' + choMoi.them : '')
        /* Kèm vài dòng đầu của những mục chưa khớp. Không có nó thì chỉ thấy con số
         * "chưa khớp 4" mà không biết bốn cái đó là bốn bài thật hay một bài bị bắt
         * bốn lần — đúng câu hỏi đang phải trả lời. */
        + (r.khongKhop.length
          ? ' · chưa khớp: ' + r.khongKhop.slice(0, 4)
            .map((x) => '«' + String(((b.items || [])[x.viTri] || {}).van || '').slice(0, 44) + '»')
            .join(' ')
          : ''),
    });

    /* Vị trí các mục tiện ích PHẢI GIỮ LẠI để gửi lại sau — và CHỈ khi máy chủ
     * không cất được vào hàng chờ.
     *
     * Trước đây chỗ này trả về mọi mục chưa khớp, nên tiện ích giữ chúng lại
     * rồi gửi lại mỗi năm phút. Từ khi hàng chờ chuyển về máy chủ (cho-khop.js)
     * thì việc đó vừa thừa vừa có hại: máy chủ đã cất mục ấy rồi, mà tiện ích
     * cứ gửi lại thì cột Số lần thử leo tới 193, và — nặng hơn — xoá dòng trên
     * Base không có tác dụng, vì năm phút sau nó được tạo lại y nguyên. Người
     * dùng xoá một dòng là có ý bảo "bỏ cái này đi", mà hệ thống lặng lẽ dựng
     * lại thì không còn cách nào bỏ.
     *
     * Cất được rồi thì máy chủ nhận trách nhiệm: sau MỖI lượt đồng bộ nó tự
     * khớp lại, không cần trình duyệt ai mở. Chỉ khi cất HỎNG mới bảo tiện ích
     * giữ, để không mất bài lúc Base trục trặc.
     *
     * Vẫn trả bằng tên cũ `chuaKhop` để bản tiện ích cũ chưa cập nhật cũng thôi
     * gửi lại — nghĩa của trường không đổi ("những mục phải giữ"), chỉ là bây
     * giờ nó ngắn hơn. */
    const chuaKhop = [...r.khongKhop.map((x) => x.viTri), ...r.tenLa.map((x) => x.viTri)]
      .sort((a, b) => a - b);
    const giuLai = choKhop.viTriPhaiGiu(chuaKhop, choMoi);

    return ok(res, {
      nhan: (b.items || []).length,
      daGhi: r.capNhat.length,
      khongKhop: r.khongKhop.length,
      daCatVaoHangCho: giuLai.length ? 0 : chuaKhop.length,
      giuLai,
      chuaKhop: giuLai,
      tenLa: r.tenLa.map((x) => x.nguoi).slice(0, 5),
    });
  }

  if (p === '/api/fb-webhook' && method === 'POST') {
    const b = await readBody(req);
    await store.ghiNhatKy({
      platform: 'Facebook',
      result: 'Một phần',
      message: 'THỬ WEBHOOK · ' + JSON.stringify(b).slice(0, 900),
    });
    return ok(res, { nhan: true });
  }

  if (p === '/api/ket-noi/facebook/thu-nguoi-dang' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    const token = tho(b.token);
    if (!token) return fail(res, 400, 'Chưa dán mã');
    const g = 'https://graph.facebook.com/v23.0/';
    const lay = async (u) => (await fetch(u + (u.includes('?') ? '&' : '?')
      + 'access_token=' + encodeURIComponent(token))).json();

    /* Mã người dùng thì đi qua /me/accounts để lấy mã từng Trang; mã Trang thì
     * dùng thẳng. Không biết trước là loại nào nên thử cả hai. */
    const dsTrang = [];
    const acc = await lay(g + 'me/accounts?limit=25&fields=id,name,access_token');
    if (acc && acc.data) {
      (acc.data || []).forEach((x) => dsTrang.push({ id: x.id, name: x.name, tk: x.access_token }));
    }
    if (!dsTrang.length) {
      const me = await lay(g + 'me?fields=id,name');
      if (me && me.id) dsTrang.push({ id: me.id, name: me.name || me.id, tk: token });
    }
    if (!dsTrang.length) {
      return fail(res, 400, 'Mã không dùng được: ' + scrub(String(((acc || {}).error || {}).message || 'không rõ')));
    }

    const ra = [];
    for (const t of dsTrang.slice(0, 5)) {
      const r = await (await fetch(g + t.id + '/posts?limit=8&fields=id,created_time,admin_creator'
        + '&access_token=' + encodeURIComponent(t.tk))).json();
      if (r.error) { ra.push({ trang: t.name, loi: scrub(String(r.error.message || '')) }); continue; }
      const ds = r.data || [];
      const co = ds.filter((x) => x.admin_creator && (x.admin_creator.name || x.admin_creator.id));
      ra.push({
        trang: t.name,
        soBai: ds.length,
        coNguoiDang: co.length,
        ten: [...new Set(co.map((x) => x.admin_creator.name || x.admin_creator.id))].slice(0, 5),
      });
    }
    const duoc = ra.some((x) => x.coNguoiDang > 0);
    return ok(res, {
      duoc,
      ketQua: ra,
      ketLuan: duoc
        ? 'Mã này ĐỌC ĐƯỢC người đăng. Dán vào ô mã Facebook để dùng thật.'
        : 'Mã này vẫn không đọc được người đăng — Meta trả rỗng cho mọi bài.',
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

  /* Soát thử: KHÔNG lọc trùng, KHÔNG cần cờ bật — để người dùng bấm xem nhóm sẽ
   * nhận đúng cái gì trước khi bật thật. */
  if (p === '/api/canh-bao/thu' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    const c = await ketnoi.doc();
    const luat = { ...c.canhBao, ...(b.luat || {}) };
    if (b.chiXem) {
      const d = await store.tai();
      const ds = canhBao.doTim(d, luat, store.homNay());
      return ok(res, { ds, tin: ds.length ? canhBao.soanTin(ds, store.homNay()) : '' });
    }
    if (!luat.chatId) return fail(res, 400, 'Chưa khai nhóm nhận cảnh báo');
    const r = await canhBao.chay(luat, guiCfg(), { batBuoc: true });
    return ok(res, r);
  }

  if (p === '/api/ket-noi/zalo/link' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    const c = await ketnoi.doc();
    const conf = { ...c.zalo, appId: tho(b.appId) || c.zalo.appId };
    const r = zalo.linkCapQuyen(conf, b.redirectUri);
    /* Cất verifier lại ngay, và phải cất vào KHO KHOÁ chứ không chỉ ra tệp.
     *
     * Giữa lúc bấm "Tạo link" và lúc quay về dán mã, người dùng đi sang Zalo cấp
     * quyền — mất vài phút. Render ngủ sau ít phút không ai gọi, tỉnh dậy là ổ
     * đĩa trắng: verifier ghi ra tệp sẽ biến mất đúng trong khoảng đó, và bước
     * đổi mã đổ với thông báo chẳng liên quan gì tới nguyên nhân thật. */
    ketnoi.ghiKhoi('zalo', { ...conf, codeVerifier: r.codeVerifier });
    await ketnoi.luuKho('zalo', { ...conf, codeVerifier: r.codeVerifier });
    return ok(res, { link: r.link, codeChallenge: r.codeChallenge });
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
    const tok = await zalo.doiMa(conf, b.code, b.codeVerifier || c.zalo.codeVerifier || '');
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
    return ok(res, await chayDongBo({
      from: b.from, to: b.to, chi: b.chi || '', napLai: Boolean(b.napLai),
    }));
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
const LICH = { moiSoGio: 0, lanToi: 0, lanCuoi: 0, han: 0 };

/** Lượt đồng bộ gần nhất đã chạy lúc nào, đọc từ bảng Nhật ký trên Base. */
async function lanDongBoCuoi() {
  try {
    const f = store.T.log.f;
    const rows = await lark.listAll(store.T.log.id);
    let moi = 0;
    rows.forEach((r) => {
      /* Bỏ qua dòng của tiện ích Người đăng — nó không phải lượt đồng bộ. */
      if (/NGƯỜI ĐĂNG/.test(String(r.c[f.message] || ''))) return;
      const t = Date.parse(r.c[f.at] || '');
      if (Number.isFinite(t) && t > moi) moi = t;
    });
    return moi;
  } catch (e) {
    console.warn('  Không đọc được lần đồng bộ cuối: ' + e.message);
    return 0;
  }
}

/**
 * Hẹn giờ theo LẦN CHẠY CUỐI, không theo lúc khởi động tiến trình.
 *
 * Bản trước đặt setInterval 6 tiếng từ lúc process lên. Mỗi lần deploy là đồng
 * hồ đặt lại từ đầu, nên hôm nào deploy vài lần là lịch KHÔNG BAO GIỜ tới hạn —
 * gặp thật: 24 tiếng liền không có lượt nào, mà nhìn app thì mọi thứ vẫn xanh.
 * Render ngủ giữa chừng cũng cho ra đúng triệu chứng ấy.
 *
 * Giờ cứ 15 phút ngó một lần: lần cuối cách đây quá hạn thì chạy. Deploy hay
 * ngủ dậy đều tự bắt kịp, và chạy chồng thì đã có TT.dangChay chặn.
 */
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
  const NGO = 15 * 60 * 1000;

  lanDongBoCuoi().then((t) => {
    LICH.lanCuoi = t;
    LICH.lanToi = (t || Date.now()) + ms;
    const treQua = t && Date.now() - t > ms;
    console.log('  Tự đồng bộ mỗi ' + gio + ' giờ'
      + (t ? ' · lần cuối ' + new Date(t).toISOString().slice(0, 16) : ' · chưa có lượt nào')
      + (treQua ? ' · ĐÃ QUÁ HẠN, chạy bù' : ''));
  });

  LICH.han = ms;
  setInterval(ngoLich, NGO);
}

/**
 * Quá hạn thì chạy bù — gọi được từ nhịp hẹn giờ, và từ BẤT KỲ lượt gọi nào.
 *
 * Render ở gói miễn phí thì ngủ sau mười lăm phút không ai dùng, mà đã ngủ thì
 * mọi đồng hồ hẹn giờ đứng hết. Đồng hồ của mình có đúng cách mấy cũng vô ích —
 * thực tế: 20/9 tới 21/9 không có lượt nào dù đã sửa phần đếm theo lần chạy cuối.
 *
 * Nên bám vào thứ duy nhất đánh thức được nó: có người gọi tới. Ai mở app, hay
 * tiện ích của một bạn gửi bài lên, là tiện thể ngó lịch luôn. Không chặn lượt
 * gọi đó lại đợi đồng bộ xong — chạy nền, trả lời ngay. */
function ngoLich() {
  if (!LICH.moiSoGio || !LICH.han) return;
  if (TT.dangChay) return;
  if (LICH.lanCuoi && Date.now() - LICH.lanCuoi < LICH.han) return;
  LICH.lanCuoi = Date.now();          // ghi trước để không ai gọi chồng lên
  chayDongBo({})
    .then(() => { LICH.lanToi = Date.now() + LICH.han; })
    .catch((e) => console.error('[lịch] ' + e.message));
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
