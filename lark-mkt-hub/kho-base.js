'use strict';
/**
 * ============================================================================
 * KHO BASE DÙNG CHUNG — hub đọc mỗi bảng MỘT lần, phát cho mọi app con
 * ============================================================================
 * Cặp với lark-chung/kho-hub.js (phía app con, được lark-core.js gọi).
 *
 * VÌ SAO: trước đây 12 app con mỗi app tự đọc Lark, tự giữ bộ đệm (8–60 giây,
 * mỗi app một con số). Cùng một Base bị đọc nhiều lần; lúc hub khởi động cả
 * loạt cùng đọc là dính 800004135; số trên thẻ Tổng quan (hub gọi app A) và
 * trong app B không khớp vì hai bộ đệm hết hạn khác lúc. Đưa bộ đệm về MỘT chỗ
 * thì: một lần đọc Lark cho mọi app, mọi app thấy cùng một bản, và ghi xong ở
 * app nào thì app đó báo "làm tươi" là cả nhà thấy bản mới.
 *
 * CÁCH LÀM:
 *   GET  /_noi-bo/kho/<base>/<table>/records?offset=N&as=user|bot
 *   GET  /_noi-bo/kho/<base>/<table>/fields?as=…
 *   POST /_noi-bo/kho/<base>/<table>/lam-tuoi
 * Chỉ nhận từ 127.0.0.1 kèm khoá HUB_KHOA_NOI_BO (cùng khoá với /_noi-bo/nhip).
 *
 * GỘP LƯỢT ĐỌC TRÙNG: hai app hỏi cùng trang trong lúc hub đang đi đọc Lark thì
 * cả hai chờ cùng một promise — không đọc Lark hai lần.
 *
 * TTL ngắn (mặc định 10 giây): kho này là để gộp những lượt đọc DÀY (khởi động,
 * một người bấm qua lại ba app), không phải để giữ dữ liệu lâu — bộ đệm dài hơn
 * vẫn nằm ở từng app như cũ. Đổi bằng HUB_KHO_TTL_MS.
 *
 * DANH TÍNH: chế độ cli đọc bằng `--as user|bot` theo app con yêu cầu, giữ riêng
 * hai ngăn — bot và user có thể thấy khác nhau. Chế độ api chỉ có tenant token.
 *
 * Hub tự đọc bảng của nó (Phân quyền, Thông báo) qua base-lark.js, KHÔNG qua đây —
 * để sau, khi base-lark.js chuyển sang lark-core.
 */
const path = require('path');

const TTL_MS = Math.max(1000, Number(process.env.HUB_KHO_TTL_MS || 10000));
const TRANG_TOI_DA = 60;

/** kho: khoá "as|base|table" -> { trang: Map<offset, o>, cot: o, luc } ; o = { luc, data, dang } */
const kho = new Map();
const dem = { trung: 0, hut: 0, gop: 0, lamTuoi: 0, loi: 0 };
let docTho = null;   // { docTrang(base, t, offset, as), docCot(base, t, as) }

const khoaCua = (as, base, t) => (as || 'user') + '|' + base + '|' + t;
const ngan = (as, base, t) => {
  const k = khoaCua(as, base, t);
  if (!kho.has(k)) kho.set(k, { trang: new Map(), cot: null, luc: Date.now() });
  return kho.get(k);
};

async function layHoacDoc(o, doc) {
  if (o.data && Date.now() - o.luc < TTL_MS) { dem.trung += 1; return o.data; }
  if (o.dang) { dem.gop += 1; return o.dang; }
  dem.hut += 1;
  o.dang = (async () => {
    try {
      const d = await doc();
      o.data = d; o.luc = Date.now();
      return d;
    } catch (e) {
      dem.loi += 1;
      /* Hỏng thì quên luôn bản cũ: trả lỗi cho app con tự đọc Lark, còn hơn phát
       * đi một bản có thể đã sai. */
      o.data = null;
      throw e;
    } finally { o.dang = null; }
  })();
  return o.dang;
}

async function docTrang(base, t, offset, as) {
  const n = ngan(as, base, t);
  if (!n.trang.has(offset)) n.trang.set(offset, { luc: 0, data: null, dang: null });
  return layHoacDoc(n.trang.get(offset), () => docTho.docTrang(base, t, offset, as));
}

async function docCot(base, t, as) {
  const n = ngan(as, base, t);
  if (!n.cot) n.cot = { luc: 0, data: null, dang: null };
  return layHoacDoc(n.cot, () => docTho.docCot(base, t, as));
}

/** Bỏ mọi ngăn của bảng (cả user lẫn bot). */
function lamTuoi(base, t) {
  dem.lamTuoi += 1;
  for (const k of kho.keys()) if (k.endsWith('|' + base + '|' + t)) kho.delete(k);
}

/* Dọn ngăn lâu không đụng tới, để hub chạy nhiều ngày không phình bộ nhớ. */
setInterval(() => {
  const han = Date.now() - 10 * 60 * 1000;
  for (const [k, n] of kho) {
    let moiNhat = n.cot ? n.cot.luc : 0;
    for (const o of n.trang.values()) if (o.luc > moiNhat) moiNhat = o.luc;
    if (moiNhat < han) kho.delete(k);
  }
}, 5 * 60 * 1000).unref();

/**
 * Bật. `cfg` là config của hub (mode, appId, appSecret, apiHost, port); `cliScript`
 * là đường tới run.js của lark-cli (base-lark.timLarkCli()).
 * Trả về env cần truyền cho app con.
 */
function bat({ cfg, cliScript, docTho: tuyChon }) {
  if (tuyChon) { docTho = tuyChon; }
  else {
    const { taoLark } = require('../lark-chung/lark-core');
    const loi = {};
    const cua = (as) => {
      if (!loi[as]) {
        loi[as] = taoLark({
          mode: cfg.mode, identity: as, baseToken: '', cliScript,
          appId: cfg.appId, appSecret: cfg.appSecret, apiHost: cfg.apiHost,
        }, { ho: 'A', thuMuc: path.join(__dirname) });
      }
      return loi[as].thap;
    };
    docTho = {
      docTrang: (base, t, offset, as) => cua(as === 'bot' ? 'bot' : 'user').docTrang(base, t, offset),
      docCot: (base, t, as) => cua(as === 'bot' ? 'bot' : 'user').docCotTho(base, t),
    };
  }
  if (process.env.HUB_KHO_TAT === '1') return {};
  return { HUB_KHO_URL: 'http://127.0.0.1:' + cfg.port + '/_noi-bo/kho' };
}

/** Xử lý các đường /_noi-bo/kho/…  Trả true nếu đã xử lý. `khoa` = HUB_KHOA_NOI_BO. */
function xuLy(req, res, p, khoa) {
  const m = /^\/_noi-bo\/kho\/([A-Za-z0-9_-]{5,64})\/([A-Za-z0-9_-]{5,64})\/(records|fields|lam-tuoi)$/.exec(p);
  if (!m) return false;
  const tuMay = /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(req.socket.remoteAddress || '');
  const [, base, t, viec] = m;
  const ptDung = viec === 'lam-tuoi' ? 'POST' : 'GET';
  if (req.method !== ptDung || !tuMay || !khoa || req.headers['x-hub-khoa'] !== khoa || !docTho) {
    res.writeHead(404); res.end(); return true;
  }
  const tra = (code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
  if (viec === 'lam-tuoi') {
    req.on('data', () => {}); req.on('end', () => { lamTuoi(base, t); tra(200, { ok: true }); });
    return true;
  }
  const u = new URL(req.url, 'http://127.0.0.1');
  const as = u.searchParams.get('as') === 'bot' ? 'bot' : 'user';
  const viecDoc = viec === 'records'
    ? docTrang(base, t, Math.min(Math.max(0, Number(u.searchParams.get('offset')) || 0), 200 * TRANG_TOI_DA), as)
    : docCot(base, t, as).then((fields) => ({ fields }));
  viecDoc.then((d) => tra(200, d))
    /* 502 chứ không phải thân rỗng: app con thấy khác 200 là tự đọc Lark. */
    .catch((e) => tra(502, { error: String((e && e.message) || e).slice(0, 300) }));
  return true;
}

/** Cho trang Kiểm tra hệ thống. */
function tinhTrang() {
  let soTrang = 0;
  for (const n of kho.values()) soTrang += n.trang.size + (n.cot ? 1 : 0);
  return Object.assign({ ttlMs: TTL_MS, soBang: kho.size, soTrang }, dem);
}

/* Chỉ dùng trong kiểm thử. */
function datLai() { kho.clear(); Object.keys(dem).forEach((k) => { dem[k] = 0; }); }

module.exports = { bat, xuLy, docTrang, docCot, lamTuoi, tinhTrang, datLai, TTL_MS };
