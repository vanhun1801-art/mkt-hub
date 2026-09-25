'use strict';
/**
 * Canh lỗi kết nối API ra ngoài — dùng chung cho hub và mọi app con (25/09/2026).
 *
 * Anh Hùng cần biết NGAY khi một app gọi API (Lark, Tourwell, Pancake, Facebook,
 * TikTok…) mà hỏng. Mỗi app có hàng chục chỗ gọi, sửa từng chỗ thì sót — nên canh ở
 * một điểm: bọc `globalThis.fetch` và `https.request` của cả tiến trình.
 *
 * Nạp thế nào:
 *   - app con: hub bật chúng với NODE_OPTIONS="--require <file này>" (children.js),
 *     sự kiện POST về hub (HUB_BAO_LOI_URL + khoá HUB_KHOA_NOI_BO). Nạp xong thì gỡ
 *     cờ đó khỏi env để tiến trình cháu (lark-cli…) không nạp theo.
 *   - chính hub: server.js gọi `cai(ham)` để sự kiện đi thẳng vào bộ gom.
 *
 * TÍNH LÀ LỖI (cố ý hẹp — báo nhiễu thì người ta tắt thông báo):
 *   - không nối được: DNS, từ chối, reset, hết giờ chờ;
 *   - HTTP 5xx, 401, 403, 429;
 *   - Lark Open API trả `code` thuộc nhóm kết nối: token, quyền, gọi quá dày, máy chủ lỗi
 *     (larkNang) — mã nghiệp vụ thì không;
 *   - Facebook Graph lỗi token (code 190), TikTok Business `code` khác 0.
 * Không tính: gọi về localhost, 4xx khác (thường là dữ liệu gửi sai, app tự xử lý).
 *
 * KHÔNG ĐỂ LỘ BÍ MẬT: chỉ gửi host + đường dẫn (bỏ query — access_token hay nằm ở đó),
 * thông điệp lỗi cắt ngắn và xoá mọi chuỗi trông như token.
 */
const https = require('https');
/* Tệp này được nhét vào MỌI app con bằng NODE_OPTIONS --require. Nó ném lỗi
 * lúc nạp là cả mười hai app chết ngay từ dòng đầu, mà triệu chứng chỉ là "app
 * không bật được" — không ai đoán ra tại cái đồng hồ đếm nhịp. Nạp hụt thì coi
 * như không có nhịp, đúng như chạy dưới máy. */
let nhip = { xinLuot: async () => 0 };
try { nhip = require('./nhip-lark'); } catch (_) { /* không có nhịp thì thôi */ }
const { AsyncLocalStorage } = require('async_hooks');

const im = new AsyncLocalStorage();
let bao = null;                                            // hàm nhận sự kiện
const APP = (process.env.HUB_PREFIX || '').replace(/^\/m\//, '') || 'hub';

const NOI_BO = /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/i;
/* mã Lark không phải lỗi kết nối: bản ghi / tin không tồn tại, trùng khoá uuid */
const LARK_VO_HAI = new Set([1254043, 1254040, 1254041, 230011, 230020, 1254606]);

const giauBiMat = (s) => String(s || '')
  .replace(/(t-|u-|Bearer\s+)[A-Za-z0-9._-]{12,}/g, '$1***')
  .replace(/[A-Za-z0-9_-]{32,}/g, '***')
  .replace(/\s+/g, ' ').trim().slice(0, 180);
/* id trong đường dẫn (rec…, tbl…, số dài, token) gộp lại để cùng một API ra cùng một khoá */
const gonDuong = (p) => String(p || '/').split('?')[0]
  .replace(/\/(rec|tbl|fld|vew|ou_|oc_|om_)[A-Za-z0-9_]+/g, '/$1…')
  .replace(/\/[A-Za-z0-9]{20,}/g, '/…').replace(/\/\d{3,}/g, '/…').slice(0, 120);

function phat(su) {
  if (!bao || im.getStore()) return;
  try { bao(Object.assign({ app: APP, luc: Date.now() }, su)); } catch (_) { /* canh lỗi không được làm hỏng app */ }
}

/* Lark: chỉ mã thuộc KẾT NỐI — token/xác thực (99991xxx), thiếu quyền, gọi quá dày,
 * máy chủ lỗi. Mã nghiệp vụ (vd. 230001 sai người nhận, 1254045 sai cột) là lỗi dữ
 * liệu mà nhiều chỗ đã cố ý thử cách khác khi gặp — báo cả những mã đó là réo nhiễu. */
const LARK_NANG = new Set([1254302, 1254301, 1254304, 91403, 91402, 40004, 1254290, 1254291, 1254607, 1255001, 1255002, 1255040]);
const larkNang = (ma, msg) => (ma >= 99991000 && ma <= 99991999) || LARK_NANG.has(ma) ||
  /internal|timeout|timed out|too many|rate limit|frequency|permission|forbidden|unauthori|token/i.test(String(msg || ''));

function xetThan(host, status, j) {
  if (!j || typeof j !== 'object') return null;
  if (/open\.(larksuite\.com|feishu\.cn)$/.test(host) && typeof j.code === 'number' && j.code !== 0 && !LARK_VO_HAI.has(j.code) && larkNang(j.code, j.msg || j.message)) {
    return { ma: j.code, loi: j.msg || j.message || '' };
  }
  if (/graph\.facebook\.com$/.test(host) && j.error && (j.error.code === 190 || status >= 500)) {
    return { ma: j.error.code, loi: j.error.message || '' };
  }
  if (/business-api\.tiktok\.com$/.test(host) && typeof j.code === 'number' && j.code !== 0) {
    return { ma: j.code, loi: j.message || '' };
  }
  return null;
}

const HTTP_LOI = (s) => s >= 500 || s === 401 || s === 403 || s === 429;

function boc() {
  if (typeof globalThis.fetch === 'function' && !globalThis.fetch.__canh) {
    const goc = globalThis.fetch;
    const moi = async function (input, init) {
      let u;
      try { u = new URL(typeof input === 'string' ? input : input && input.url ? input.url : String(input)); } catch (_) { return goc.call(this, input, init); }
      if (NOI_BO.test(u.hostname) || im.getStore()) return goc.call(this, input, init);
      const phuongThuc = (init && init.method) || (input && input.method) || 'GET';
      /* Xin hub một lượt trước khi gọi Lark: cả mười hai app con dùng chung một
       * hạn mức, xem lark-mkt-hub/nhip.js. Không có hub thì hàm này trả ngay,
       * và hub hỏng cũng trả ngay — không bao giờ chặn việc thật. */
      try { await nhip.xinLuot(u.hostname); } catch (_) { /* nhịp hỏng thì cứ gọi */ }
      let r;
      try { r = await goc.call(this, input, init); } catch (e) {
        const c = e && e.cause;
        phat({ host: u.hostname, duong: gonDuong(u.pathname), pt: phuongThuc, kieu: 'mang', loi: giauBiMat((c && (c.code || c.message)) || (e && (e.name === 'AbortError' || e.name === 'TimeoutError') ? 'hết giờ chờ' : e && e.message)) });
        throw e;
      }
      try {
        const kieuTho = r.headers && r.headers.get && r.headers.get('content-type') || '';
        const coThe = /json/i.test(kieuTho) && /open\.(larksuite\.com|feishu\.cn)$|graph\.facebook\.com$|business-api\.tiktok\.com$/.test(u.hostname);
        if (coThe) {
          r.clone().json().then((j) => {
            const x = xetThan(u.hostname, r.status, j);
            if (x) phat({ host: u.hostname, duong: gonDuong(u.pathname), pt: phuongThuc, kieu: 'api', status: r.status, ma: x.ma, loi: giauBiMat(x.loi) });
            else if (HTTP_LOI(r.status)) phat({ host: u.hostname, duong: gonDuong(u.pathname), pt: phuongThuc, kieu: 'http', status: r.status, loi: '' });
          }).catch(() => { /* thân không phải json */ });
        } else if (HTTP_LOI(r.status)) {
          phat({ host: u.hostname, duong: gonDuong(u.pathname), pt: phuongThuc, kieu: 'http', status: r.status, loi: giauBiMat(r.statusText) });
        }
      } catch (_) { /* không cản response */ }
      return r;
    };
    moi.__canh = true;
    globalThis.fetch = moi;
  }

  if (!https.request.__canh) {
    const gocReq = https.request;
    const bocReq = function (...args) {
      const req = gocReq.apply(this, args);
      if (im.getStore()) return req;
      try {
        const a = args[0];
        const host = typeof a === 'string' || a instanceof URL ? new URL(a).hostname : (a && (a.hostname || a.host) || '').split(':')[0];
        const duong = typeof a === 'string' || a instanceof URL ? new URL(a).pathname : (a && a.path) || '/';
        if (!host || NOI_BO.test(host)) return req;
        const pt = (a && a.method) || 'GET';
        req.on('response', (res) => { if (HTTP_LOI(res.statusCode)) phat({ host, duong: gonDuong(duong), pt, kieu: 'http', status: res.statusCode, loi: '' }); });
        req.on('error', (e) => phat({ host, duong: gonDuong(duong), pt, kieu: 'mang', loi: giauBiMat(e && (e.code || e.message)) }));
      } catch (_) { /* bỏ */ }
      return req;
    };
    bocReq.__canh = true;
    https.request = bocReq;
  }
}

/** Bật canh, sự kiện gửi vào `ham(su)`. */
function cai(ham) { bao = ham; boc(); }

/** Chạy `fn` mà không canh — cho chính đường gửi báo lỗi, khỏi báo lỗi của báo lỗi. */
const imLang = (fn) => im.run(true, fn);

/* ---- nạp bằng --require trong app con ---- */
if (process.env.HUB_BAO_LOI_URL && process.env.HUB_KHOA_NOI_BO && !process.env.HUB_CANH_DA_NAP) {
  process.env.HUB_CANH_DA_NAP = '1';
  /* gỡ cờ --require khỏi env: tiến trình cháu (lark-cli, headless Chrome…) không nạp theo */
  if (process.env.NODE_OPTIONS) process.env.NODE_OPTIONS = process.env.NODE_OPTIONS.replace(/--require\s+("[^"]*canh-api[^"]*"|\S*canh-api\S*)/, '').trim();
  const dich = process.env.HUB_BAO_LOI_URL, khoa = process.env.HUB_KHOA_NOI_BO;
  const http = require('http');
  cai((su) => {
    imLang(() => {
      try {
        const than = JSON.stringify(su);
        const r = http.request(dich, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(than), 'x-hub-khoa': khoa }, timeout: 5000 });
        r.on('error', () => {}); r.on('timeout', () => r.destroy());
        r.end(than);
      } catch (_) { /* hub chưa sẵn sàng — bỏ */ }
    });
  });
}

module.exports = { cai, imLang, gonDuong, giauBiMat, xetThan };
