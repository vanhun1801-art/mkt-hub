'use strict';
/**
 * Đọc/ghi cấu hình kết nối các nền tảng social (ket-noi.json).
 *
 * Ba nguồn, xét theo thứ tự:
 *   1. ket-noi.json trên đĩa   — máy cá nhân
 *   2. SOCIAL_CONNECT_JSON     — server chung (Render), vì ổ đĩa ở đó là tạm
 *   3. mặc định rỗng
 *
 * Và một lớp phủ lên trên: KHO KHOÁ (vault.js), giữ bản mã hoá của CẢ BỐN khối
 * trên Base. Hai lý do:
 *   - token TikTok/Zalo xoay vòng, bản trong file/biến môi trường già rất nhanh;
 *   - ổ đĩa Render là tạm, nên mọi thứ chỉ nằm trong ket-noi.json đều là thứ sẽ
 *     phải nhập lại sau lần deploy tới — kể cả page token của Facebook.
 * doc() lấy token mới nhất từ kho, và khi cấu hình nền rỗng thì khôi phục trọn.
 *
 * Token KHÔNG bao giờ được trả nguyên vẹn ra API/giao diện — xem checHet().
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const vault = require('./vault');

const FILE = path.join(__dirname, cfg.connectFile);

const MAC_DINH = {
  facebook: {
    enabled: false,
    apiVersion: 'v23.0',
    /* Token gốc: System User token (không hết hạn) hoặc user token đã đổi sang
     * loại dài hạn. App dùng nó để liệt kê Page và lấy page token của từng trang. */
    userToken: '',
    pages: [],       // [{ id, name, handle, token, url }]
  },
  instagram: {
    enabled: false,
    /* IG Business luôn treo dưới một Facebook Page, nên token dùng chính token của
     * page đó — không khai token riêng ở đây. */
    accounts: [],    // [{ id, username, pageId, name }]
  },
  tiktok: {
    enabled: false,
    clientKey: '',
    clientSecret: '',
    /* Địa chỉ TikTok trả người dùng về sau khi bấm đồng ý. Phải trùng KHÍT với
     * chuỗi khai trong app trên developers.tiktok.com. Trang đó không cần tồn
     * tại thật — app chỉ cần tham số ?code=… trên thanh địa chỉ. */
    redirectUri: '',
    /* mode 'business' cho số liệu đầy đủ (reach, xem hồ sơ, tỷ lệ xem hết…) —
     * cần tài khoản đã chuyển sang TikTok Business. 'display' là đường phổ thông:
     * chỉ có follower, và view/like/comment/share theo từng video. */
    channels: [],    // [{ openId, name, handle, mode, businessId, accessToken, refreshToken, expiresAt, refreshExpiresAt }]
  },
  zalo: {
    enabled: false,
    appId: '',
    secretKey: '',
    oas: [],         // [{ oaId, name, accessToken, refreshToken, expiresAt }]
  },
  dongBo: {
    soNgayLui: 7,        // mỗi lượt chạy quét lại bao nhiêu ngày gần đây
    moiSoGio: 6,         // tự chạy mỗi mấy giờ (0 = tắt)
    khiKhoiDong: false,
    layBai: true,        // có kéo từng bài đăng về không
    layLive: true,       // có kéo phiên LIVE không
    soBaiToiDa: 200,     // trần số bài mỗi kênh mỗi lượt, để không treo cả buổi
  },
};

/* ---------------- đọc file thô ---------------- */

/** Bỏ mọi khoá chú thích `_...` khỏi cấu hình đọc lên. */
function bocChuThich(o) {
  if (Array.isArray(o)) return o.map(bocChuThich);
  if (!o || typeof o !== 'object') return o;
  const out = {};
  Object.keys(o).forEach((k) => { if (!k.startsWith('_')) out[k] = bocChuThich(o[k]); });
  return out;
}

const KHOA_BI_MAT = ['userToken', 'accessToken', 'refreshToken', 'clientSecret', 'secretKey', 'token'];

/** Khối này có token thật chưa? Dùng để biết file rỗng mà lùi về biến môi trường. */
function coThongTin(o) {
  if (!o || typeof o !== 'object') return false;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (KHOA_BI_MAT.includes(k) && typeof v === 'string' && v.trim()) return true;
    if (v && typeof v === 'object' && coThongTin(v)) return true;
  }
  return false;
}

function docFile() {
  try { return bocChuThich(JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (_) { return null; }
}

function docEnv() {
  if (!process.env.SOCIAL_CONNECT_JSON) return null;
  try { return bocChuThich(JSON.parse(process.env.SOCIAL_CONNECT_JSON)); } catch (e) {
    console.warn('[ket-noi] SOCIAL_CONNECT_JSON không phải JSON hợp lệ: ' + e.message);
    return null;
  }
}

/** Gộp nông hai mức — đủ cho hình dạng cấu hình này, và dễ đoán hơn gộp sâu. */
function gop(a, b) {
  const out = { ...a };
  Object.keys(b || {}).forEach((k) => {
    const v = b[k];
    out[k] = (v && typeof v === 'object' && !Array.isArray(v))
      ? { ...(a[k] || {}), ...v }
      : v;
  });
  return out;
}

/** Cấu hình đang lấy từ đâu — để giao diện nói rõ thay vì để người dùng đoán. */
function nguon() {
  if (coThongTin(docFile())) return 'file';
  if (coThongTin(docEnv())) return 'env';
  return 'trong';
}

/* ---------------- đọc có kho khoá ---------------- */

/** Bản đồng bộ (không chạm kho). Dùng ở những chỗ chỉ cần biết cấu trúc. */
function docTho() {
  const f = docFile();
  const nen = coThongTin(f) ? f : (docEnv() || f || {});
  return gop(MAC_DINH, nen || {});
}

/**
 * Ghép danh sách tài khoản giữa cấu hình nền và kho khoá.
 *
 * Hai tình huống khác hẳn nhau, và bản đầu chỉ xử lý một:
 *
 *   - Cấu hình nền CÓ danh sách → ghép theo id, kho chỉ bù phần token mới. Kênh
 *     người dùng đã gỡ thì không được hồi sinh, nên không lấy thêm từ kho.
 *
 *   - Cấu hình nền RỖNG → lấy trọn từ kho. Đây chính là cảnh sau mỗi lần deploy
 *     trên Render: ket-noi.json bay sạch, mà bản đầu dùng .map() trên mảng rỗng
 *     nên kết quả vẫn rỗng — kho có đủ token mà không bao giờ khôi phục được, và
 *     phải đi cấp quyền lại cả sáu kênh.
 */
function ghepDs(nen, kho, khoaId) {
  if (!Array.isArray(kho) || !kho.length) return nen || [];
  if (!Array.isArray(nen) || !nen.length) return kho;
  return nen.map((x) => {
    const v = kho.find((y) => y[khoaId] && y[khoaId] === x[khoaId]);
    return v ? { ...x, ...v } : x;
  });
}

/** Bản đầy đủ: cấu hình nền + những gì kho khoá đang giữ. */
async function doc() {
  const c = docTho();

  const tt = await vault.doc('tiktok');
  if (tt) {
    c.tiktok = { ...c.tiktok, ...bocToken(tt) };
    c.tiktok.channels = ghepDs(docTho().tiktok.channels, tt.channels, 'openId');
    if (c.tiktok.channels.length) c.tiktok.enabled = true;
  }

  const za = await vault.doc('zalo');
  if (za) {
    c.zalo = { ...c.zalo, ...bocToken(za) };
    c.zalo.oas = ghepDs(docTho().zalo.oas, za.oas, 'oaId');
    if (c.zalo.oas.length) c.zalo.enabled = true;
  }

  /* Facebook và Instagram KHÔNG có token xoay vòng, nhưng vẫn phải cất vào kho:
   * page token nằm trong ket-noi.json, mà file đó bay sau mỗi lần deploy. Không
   * cất thì mỗi lần deploy lại phải đi lấy System User token và tick lại Page. */
  const fb = await vault.doc('facebook');
  if (fb) {
    const nen = docTho().facebook;
    c.facebook = { ...c.facebook, ...bocToken(fb) };
    c.facebook.pages = ghepDs(nen.pages, fb.pages, 'id');
    if (!nen.userToken && fb.userToken) c.facebook.userToken = fb.userToken;
    if (c.facebook.pages.length && c.facebook.userToken) c.facebook.enabled = true;
  }

  const ig = await vault.doc('instagram');
  if (ig) {
    c.instagram = { ...c.instagram, ...bocToken(ig) };
    c.instagram.accounts = ghepDs(docTho().instagram.accounts, ig.accounts, 'id');
    if (c.instagram.accounts.length) c.instagram.enabled = true;
  }

  return c;
}

/** Bỏ các khoá mảng/điều khiển ra, chỉ giữ phần vô hại khi trải lên cấu hình nền. */
function bocToken(o) {
  const out = {};
  Object.keys(o || {}).forEach((k) => {
    if (['channels', 'oas', 'pages', 'accounts', 'ghiLuc', 'enabled'].includes(k)) return;
    if (o[k] !== '' && o[k] != null) out[k] = o[k];
  });
  return out;
}

/* ---------------- ghi ---------------- */

/** Ghi đè một khối cấu hình, giữ nguyên mọi khoá chú thích `_...` đang có. */
function ghiKhoi(khoi, values) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) {}
  raw[khoi] = { ...(raw[khoi] || {}), ...values };
  fs.writeFileSync(FILE, JSON.stringify(raw, null, 2) + '\n', 'utf8');
}

/**
 * Ghi lại token vừa làm mới. Hai chỗ, cố ý:
 *   - kho khoá  → sống qua deploy trên Render (chỗ quan trọng);
 *   - ket-noi.json → tiện cho máy cá nhân, và là bản dự phòng khi kho tắt.
 * Ổ đĩa chỉ đọc (Render) thì bước ghi file thất bại lặng lẽ — đúng ý.
 */
async function luuToken(nenTang, danhSach) {
  const truong = nenTang === 'tiktok' ? 'channels' : 'oas';
  const c = docTho();
  await vault.ghi(nenTang, { ...c[nenTang], [truong]: danhSach, ghiLuc: new Date().toISOString() });
  try {
    ghiKhoi(nenTang, { ...c[nenTang], [truong]: danhSach });
  } catch (_) { /* ổ đĩa tạm/chỉ đọc — kho khoá mới là chỗ tin cậy */ }
}

/**
 * Cất nguyên một khối cấu hình vào kho khoá.
 *
 * Gọi sau MỌI lần ghi cấu hình, không chỉ lúc token xoay vòng. Lý do đơn giản:
 * ổ đĩa Render là tạm, nên bất cứ thứ gì chỉ nằm trong ket-noi.json đều là thứ
 * sẽ phải nhập lại sau lần deploy tới. Kho tắt (chưa khai SOCIAL_VAULT_KEY) thì
 * hàm này im lặng không làm gì — đúng ý, vì trên máy cá nhân file là đủ bền.
 */
async function luuKho(khoi) {
  if (!vault.bat()) return false;
  const c = docTho();
  return vault.ghi(khoi, { ...c[khoi], ghiLuc: new Date().toISOString() },
    'App Social cất cấu hình ' + khoi + ' để sống qua lần deploy sau');
}

/* ---------------- che bí mật khi trả ra ngoài ---------------- */

const cheMot = (s) => {
  const v = String(s || '');
  if (!v) return '';
  return v.length <= 8 ? '••••' : v.slice(0, 4) + '••••' + v.slice(-4);
};

/**
 * Bản an toàn để trả về trình duyệt: mọi token thành "abcd••••wxyz".
 * Giao diện vẫn phân biệt được "đã khai" với "chưa khai", mà không cầm bí mật.
 */
function checHet(o) {
  if (Array.isArray(o)) return o.map(checHet);
  if (!o || typeof o !== 'object') return o;
  const out = {};
  Object.keys(o).forEach((k) => {
    out[k] = KHOA_BI_MAT.includes(k) ? cheMot(o[k]) : checHet(o[k]);
  });
  return out;
}

module.exports = {
  FILE, MAC_DINH, doc, docTho, ghiKhoi, luuToken, luuKho, nguon, checHet, coThongTin, ghepDs,
};
