'use strict';
/**
 * ============================================================================
 * App "Hộp thư" · lọc, xếp ngăn, trả lời nhanh email Lark
 * ============================================================================
 * Chạy: node server.js  →  http://localhost:5204
 *
 * Gom mọi hộp thư người dùng được cấp quyền (hộp chính + hộp chung như
 * sales@, marketing@, cmo@) vào một danh sách, xếp theo VIỆC PHẢI LÀM:
 * Cần trả lời · Đơn khách đặt · Chỉ để đọc. Luật người gửi/tiêu đề xếp phần
 * lớn; AI (Claude) tóm tắt thư và viết nháp trả lời khi người dùng mở thư.
 *
 * DANH TÍNH, hai đường:
 *   - Bản chạy chung: hub gửi user_access_token CỦA CHÍNH người đang xem qua
 *     header x-hub-thu-token (người đó đã bấm Nối hộp thư). Ai cũng chỉ thấy
 *     hộp mình được cấp; bộ đệm, luật, hẹn nhắc tách theo người.
 *   - Máy cá nhân: thư đọc bằng lark-cli đang đăng nhập trên máy. Qua hub, chỉ
 *     người có email trùng chủ hộp thư chính mới mở được; người khác nhận 403.
 *     Không có nhánh "người lạ thấy thư của chủ máy".
 *
 * KHÔNG XOÁ THƯ. Lưu trữ = chuyển sang ARCHIVED, hoàn tác được. Gửi thư chỉ
 * xảy ra ở POST …/tra-loi với gui:true, giao diện chỉ gọi sau hộp xác nhận.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const thu = require('./thu');
const mapi = require('./mail-api');
const kho = require('./kho');
const ai = require('./ai');
const chinhTa = require('./chinh-ta');
const { gomChuDe } = require('./chu-de');
const { NGAN, LA_NGAN, xep } = require('./phan-loai');

const BIND = process.env.BIND || '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');

/* ---------------- trả lời ---------------- */

function gui(res, ma, than, headers = {}) {
  const buf = Buffer.isBuffer(than) ? than : Buffer.from(String(than), 'utf8');
  res.writeHead(ma, Object.assign({ 'Content-Length': buf.length }, headers));
  res.end(buf);
}
const json = (res, o, ma = 200) =>
  gui(res, ma, JSON.stringify(o), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
const loi = (res, ma, thong, them = {}) => json(res, Object.assign({ error: thong }, them), ma);

function docThan(req, tran = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const buf = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > tran) { reject(new Error('Nội dung quá lớn')); req.destroy(); return; }
      buf.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(buf).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('JSON hỏng: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

/* ---------------- hộp thư được cấp ---------------- */

/* Bộ đệm theo NGƯỜI: khoá '' là chủ máy (lark-cli), còn lại là open_id hub
 * gửi xuống cùng token. Không bao giờ để người này nhận danh sách của người kia. */
const hopDem = new Map();
async function cacHop(n) {
  const c = hopDem.get(n.khoa);
  if (c && Date.now() - c.luc < 10 * 60000) return c.ds;
  const ds = await thu.cacHop(n.tk);
  hopDem.set(n.khoa, { luc: Date.now(), ds });
  return ds;
}
const hopChinh = (ds) => (ds.find((h) => h.chinh) || ds[0] || {}).email || '';
/* Hộp được đọc: mọi hộp được cấp trừ hộp người này tự tắt (kho.tatHop). Quyền
 * (xem, trả lời thư) vẫn tính theo cacHop: tắt là ẩn đi, không phải mất quyền. */
const tatCua = (n) => new Set(kho.tatHop(n.nguoi));
async function hopDoc(n) {
  const tat = tatCua(n);
  return (await cacHop(n)).filter((h) => !tat.has(h.email.toLowerCase()));
}

/* ---------------- ai đang gọi ---------------- */

/**
 * Qua hub thì hub gửi danh tính xuống bằng header. Nhận biết "đến từ hub" bằng
 * SỰ CÓ MẶT của header, cùng giao kèo với các app con khác: request từ hub mà
 * hụt danh tính là người lạ, không rơi xuống nhánh chạy-một-mình.
 */
function aiGoi(req) {
  const h = req.headers || {};
  const de = (v) => { try { return decodeURIComponent(v || ''); } catch (_) { return v || ''; } };
  const quaHub = ['x-hub-user-id', 'x-hub-user-email', 'x-hub-user-name'].some((k) => k in h);
  if (!quaHub) {
    /* Chạy riêng, hoặc qua hub trên máy cá nhân (HUB_MODE=cli, không đăng nhập
     * nên không có header danh tính): người mở là chủ máy, đọc bằng lark-cli. */
    const motMinh = (process.env.HUB !== '1' || process.env.HUB_MODE === 'cli') &&
      ['127.0.0.1', 'localhost', '::1'].includes(BIND);
    return { quaHub: false, motMinh, ten: '', emails: [], tk: '', khoa: '', nguoi: '' };
  }
  /* Token chỉ có nghĩa khi đi kèm open_id: hub luôn gửi cả hai. */
  const id = String(h['x-hub-user-id'] || '');
  const tk = id ? String(h['x-hub-thu-token'] || '') : '';
  return {
    quaHub: true,
    tk,
    khoa: tk ? 'u:' + id : '',
    /* Sổ riêng (luật, hẹn, đã xong, sao, nhóm) theo NGƯỜI, kể cả trên máy chủ
     * máy: cùng một người mở ở máy cá nhân hay trên Render thấy cùng một sổ. */
    nguoi: id ? 'u:' + id : '',
    ten: de(h['x-hub-user-name']),
    emails: [de(h['x-hub-user-email']), de(h['x-hub-user-email-phu'])]
      .map((x) => x.trim().toLowerCase()).filter(Boolean),
  };
}

/** Người này có phải chủ hộp thư đang nối không. */
async function laChu(req) {
  const n = aiGoi(req);
  if (!n.quaHub) return { ok: n.motMinh, n };
  if (n.tk) return { ok: true, n };            // token của chính người này
  const ds = await cacHop(n);
  const chu = hopChinh(ds);
  return { ok: Boolean(chu) && n.emails.includes(chu), n, chu };
}

/* ---------------- danh sách thư ---------------- */

const dsDem = new Map();
const DEM_MS = 60000;
const quenDs = (n) => { const c = dsDem.get(n.khoa); if (c) c.luc = 0; };

async function songSong(viec, tran = 4) {
  const kq = new Array(viec.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(tran, viec.length) }, async () => {
    while (i < viec.length) { const k = i++; kq[k] = await viec[k](); }
  }));
  return kq;
}

/*
 * Đọc hai nhịp (anh Hùng 28/10/2026: "cảm thấy không đầy đủ thư"): 60 thư
 * mới nhất mỗi hộp chỉ phủ được vài ngày ở hộp đông như sales@. Nên nhịp đầu
 * đọc một trang (cfg.soThuMoiHop) để trang hiện ngay, rồi đọc tiếp tới soThuDu thư mỗi hộp ở phía
 * sau; giao diện hỏi lại bằng ?du=1 và vẽ đè khi xong. Bản đầy đủ giữ lâu hơn.
 */
const DEM_DU_MS = 5 * 60000;
const sauDang = new Map();
function docSau(n) {
  if (!sauDang.has(n.khoa)) {
    sauDang.set(n.khoa, docHet(n, true, cfg.soThuDu, cfg.soThuGuiDu).finally(() => sauDang.delete(n.khoa)));
  }
  return sauDang.get(n.khoa);
}

/* Hai lượt đọc cùng cỡ của cùng một người (mở hai tab, bấm tải lại liền tay)
 * dùng chung một lần gọi Lark. Gọi chồng lên nhau là Lark chặn vì quá nhanh,
 * và cả hai lượt cùng thiếu hộp (29/10/2026). */
const dangDoc = new Map();
function docHet(n, ep, max = cfg.soThuMoiHop, maxGui = cfg.soThuGuiMoiHop) {
  const k = n.khoa + '|' + max + '|' + maxGui;
  if (!dangDoc.has(k)) dangDoc.set(k, docHetMot(n, ep, max, maxGui).finally(() => dangDoc.delete(k)));
  return dangDoc.get(k);
}

/**
 * Đọc một thư mục tới khi phủ đủ `ngay` ngày gần nhất (31/10/2026, anh Hùng sợ
 * sót thư). Bắt đầu bằng `dau` thư; thư cũ nhất vẫn còn trong khoảng ngày mà
 * thư mục còn thư thì đọc lại sâu hơn (gấp 2,5 lần), tới `tran` thư.
 * Trả { ds, du, cu }: du = đã phủ đủ số ngày (hoặc đọc hết thư mục), cu = ngày
 * của thư cũ nhất đọc được, để giao diện nói được mỗi hộp đọc tới đâu.
 */
async function docTheoNgay(hop, thuMuc, { dau, ngay, tran }, tk) {
  const moc = Date.now() - ngay * 86400e3;
  let max = dau;
  for (;;) {
    const ds = await thu.danhSach(hop, max, tk, thuMuc);
    const cu = ds.reduce((m, t) => (t.ngay && (!m || t.ngay < m) ? t.ngay : m), '');
    const het = ds.length < max;
    const du = het || (cu && msNgay(cu) < moc);
    if (du || max >= tran) return { ds, du: Boolean(du), cu };
    max = Math.min(tran, Math.round(max * 2.5));
  }
}

async function docHetMot(n, ep, max, maxGui) {
  const c = dsDem.get(n.khoa);
  if (!ep && c && c.ds && c.max >= max && Date.now() - c.luc < (c.du ? DEM_DU_MS : DEM_MS)) return c;
  const hop = await hopDoc(n);
  const loiHop = [];
  /* Nhịp đầu đọc số thư cố định để trang hiện ngay; nhịp sau (du) đọc theo
   * số ngày, tới khi phủ đủ (docTheoNgay). */
  const du = max >= cfg.soThuDu;
  const phu = {};                    // hộp → { den, gui, rac }: { du, cu }, cho giao diện nói đọc tới đâu
  const ghiPhu = (h, loai, kq) => { (phu[h] = phu[h] || {})[loai] = { du: kq.du, cu: kq.cu }; return kq.ds; };
  const doc = (h, thuMuc, dau, ngay, tran) => (du
    ? docTheoNgay(h, thuMuc, { dau, ngay, tran }, n.tk)
    : thu.danhSach(h, dau, n.tk, thuMuc).then((ds) => ({ ds, du: false, cu: ds.reduce((m, t) => (t.ngay && (!m || t.ngay < m) ? t.ngay : m), '') })));
  /* Hộp đến và Đã gửi đọc cùng lúc (cùng một hàng đợi 4 lượt: 6 lượt đã chạm ngưỡng Lark), không nối
   * đuôi nhau, để thêm thư mục Đã gửi không làm trang mở chậm gấp đôi. */
  const viec = hop.map((h) => async () => {
    try { return { den: ghiPhu(h.email, 'den', await doc(h.email, 'INBOX', max, cfg.ngayDen, cfg.tranDen)) }; } catch (e) {
      /* Token hết giữa chừng thì cả trang phải mời nối lại, không lặng lẽ
       * thành tám hộp trống. */
      if (e instanceof thu.LoiChuaNoi) throw e;
      loiHop.push({ hop: h.email, loi: e.message });
      return { den: [] };
    }
  }).concat(hop.map((h) => async () => {
    /* Thư mục Đã gửi: để biết thư nào mình đã trả lời, và thư nào mình gửi
     * đi mà bên kia chưa hồi âm. Hỏng thì thôi, Hộp đến vẫn hiện. */
    try { return { gui: ghiPhu(h.email, 'gui', await doc(h.email, 'SENT', maxGui, cfg.ngayGui, cfg.tranGui)) }; } catch (e) {
      if (e instanceof thu.LoiChuaNoi) throw e;
      return { gui: [] };
    }
  })).concat(hop.map((h) => async () => {
    /* Thư rác gần đây: Lark xếp nhầm cả thư khách hỏi giá vào đây. Chỉ đọc,
     * không đưa thư ra khỏi Thư rác trên Lark (hộp chung). Hỏng thì thôi. */
    try {
      const tu = Date.now() - cfg.ngayRac * 86400e3;
      /* Nhịp đầu chỉ một trang thư rác; đủ 100 thư thì để nhịp sau. */
      const soRac = du ? cfg.soThuRac : Math.min(cfg.soThuRac, max);
      const ds = await thu.danhSach(h.email, soRac, n.tk, 'SPAM');
      const cu = ds.reduce((m, t) => (t.ngay && (!m || t.ngay < m) ? t.ngay : m), '');
      ghiPhu(h.email, 'rac', { ds, du: ds.length < soRac || (cu && msNgay(cu) < tu), cu });
      return { den: ds.filter((t) => msNgay(t.ngay) >= tu) };
    } catch (e) {
      if (e instanceof thu.LoiChuaNoi) throw e;
      return { den: [] };
    }
  })).concat(!du ? [] : hop.map((h) => async () => {
    /* Lưu trữ (31/10/2026): thư ai đó bấm lưu trữ trên Lark. Ở hộp chung một
     * người lưu trữ là thư biến khỏi app của cả phòng, trái với "chỉ đổi bên
     * mình". Đọc 30 ngày gần nhất, giao diện gắn nhãn "Đã lưu trữ trên Lark"
     * và không đưa vào Việc cần làm (người lưu trữ thường đã xử lý xong). */
    try {
      const tu = Date.now() - cfg.ngayLuuTru * 86400e3;
      return { den: (await thu.danhSach(h.email, cfg.soThuLuuTru, n.tk, 'ARCHIVED')).filter((t) => msNgay(t.ngay) >= tu) };
    } catch (e) {
      if (e instanceof thu.LoiChuaNoi) throw e;
      return { den: [] };
    }
  }));
  const kq = await songSong(viec, 4);
  /* Một thư không được hiện hai lần (thư vừa chuyển thư mục giữa hai lượt gọi). */
  const daCo = new Set();
  const motLan = (ds) => ds.filter((t) => { const k = t.hop + '|' + t.id; if (daCo.has(k)) return false; daCo.add(k); return true; });
  const phan = motLan([].concat(...kq.map((x) => x.den || [])));
  const daGui = [].concat(...kq.map((x) => x.gui || []));
  const moi = { luc: Date.now(), ds: phan, gui: daGui, loi: loiHop, max, du, phu };
  dsDem.set(n.khoa, moi);
  return moi;
}

/*
 * Dò thư mới (04/11/2026, anh Hùng: "lôi email từ lark liên tục để ko bị
 * trễ"). Trang đang mở thì cứ 30 giây hỏi một lần. Chỉ đọc SO_DO thư mới nhất
 * của Hộp đến và Đã gửi mỗi hộp rồi ghép vào bản đệm, không đọc lại cả tám hộp
 * bốn thư mục: đọc cả thì chạm ngưỡng Lark (99991400 lúc 14:40 03/11).
 * Không đụng `luc` của bản đệm, để lượt đọc đủ vẫn tới hạn như cũ (thư bị lưu
 * trữ, xoá trên Lark chỉ lượt đó mới thấy). Chưa có bản đệm thì đọc như thường.
 */
const SO_DO = 10;
const doDang = new Map();
function docMoi(n) {
  if (!dsDem.get(n.khoa)) return docHet(n, false).then((d) => Object.assign({ moi: 0 }, d));
  if (!doDang.has(n.khoa)) doDang.set(n.khoa, docMoiMot(n).finally(() => doDang.delete(n.khoa)));
  return doDang.get(n.khoa);
}

async function docMoiMot(n) {
  const hop = await hopDoc(n);
  const viec = [];
  for (const h of hop) {
    for (const thuMuc of ['INBOX', 'SENT']) {
      viec.push(async () => {
        try { return { thuMuc, ds: await thu.danhSach(h.email, SO_DO, n.tk, thuMuc) }; } catch (e) {
          if (e instanceof thu.LoiChuaNoi) throw e;
          return null;                       // hộp này nhịp sau dò lại
        }
      });
    }
  }
  /* Hai lượt một lúc: dò là việc nền, không cần nhanh, chỉ cần không bị chặn. */
  const kq = (await songSong(viec, 2)).filter(Boolean);
  const c = dsDem.get(n.khoa);              // bản đệm mới nhất: lượt đọc đủ có thể vừa xong trong lúc dò
  if (!c) return docHet(n, false).then((d) => Object.assign({ moi: 0 }, d));
  const k = (t) => t.hop + '|' + t.id;
  /* Thư đã có thì thay bằng bản mới (trạng thái đọc, nhãn); thư chưa có thì thêm vào. */
  const ghep = (cu, them) => {
    const theoKhoa = new Map(them.map((t) => [k(t), t]));
    const daCo = new Set(cu.map(k));
    return them.filter((t) => !daCo.has(k(t))).concat(cu.map((t) => theoKhoa.get(k(t)) || t));
  };
  const den = [].concat(...kq.filter((x) => x.thuMuc === 'INBOX').map((x) => x.ds));
  const gui = [].concat(...kq.filter((x) => x.thuMuc === 'SENT').map((x) => x.ds));
  const daCo = new Set(c.ds.map(k));
  const soMoi = den.filter((t) => !daCo.has(k(t))).length;
  const sau = Object.assign({}, c, { ds: ghep(c.ds, den), gui: ghep(c.gui || [], gui), doLuc: Date.now() });
  dsDem.set(n.khoa, sau);
  return Object.assign({ moi: soMoi }, sau);
}

const NGAY_CHO = 21;                                   // thư gửi đi quá 21 ngày thì thôi theo dõi
const msNgay = (s) => { const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/.exec(s || ''); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], m[4] - 7, +m[5]) : 0; };

/**
 * Ghép Hộp đến với Đã gửi theo chuỗi thư (cùng hộp + thread_id):
 *   - thư đến đã có thư mình gửi SAU nó trong cùng chuỗi → đã trả lời;
 *   - thư mình gửi gần nhất của một chuỗi mà chưa có thư đến nào sau nó → đang chờ người khác.
 */
function ghepChuoi(den, gui) {
  const cuoiGui = new Map(), cuoiDen = new Map();
  /* Ghép theo chủ đề (cd, chu-de.js) khi có, không thì theo chuỗi Lark. */
  const c = (t) => t.cd || t.chuoi;
  const k = (t) => t.hop + '|' + c(t);
  for (const g of gui) if (c(g) && (!cuoiGui.has(k(g)) || cuoiGui.get(k(g)).ngay < g.ngay)) cuoiGui.set(k(g), g);
  for (const t of den) if (c(t) && (!cuoiDen.has(k(t)) || cuoiDen.get(k(t)).ngay < t.ngay)) cuoiDen.set(k(t), t);
  const daTraLoi = new Set(den.filter((t) => c(t) && cuoiGui.has(k(t)) && cuoiGui.get(k(t)).ngay >= t.ngay).map((t) => t.hop + '|' + t.id));
  const tu = Date.now() - NGAY_CHO * 86400e3;
  const cho = [...cuoiGui.values()]
    .filter((g) => msNgay(g.ngay) >= tu && !(cuoiDen.has(k(g)) && cuoiDen.get(k(g)).ngay > g.ngay))
    .sort((a, b) => (a.ngay < b.ngay ? -1 : 1))
    .map((g) => ({ hop: g.hop, id: g.id, chuoi: g.chuoi, cd: g.cd, ngay: g.ngay, tieuDe: g.tieuDe }));
  return { daTraLoi, cho };
}

/** Gắn ngăn, kết quả AI đã có, hẹn nhắc và trạng thái riêng lên từng thư. */
/* Người nhận một chuỗi thư trong sổ chung. Chạy riêng một mình (không qua hub)
 * thì không có mã người: coi là chủ máy. */
const nguoiLo = (n) => ({ id: n.nguoi || 'chu-may', ten: n.ten || 'Chủ hộp thư' });
const khoaChuoi = (t) => t.chuoi || 'id:' + t.id;

function lamGiau(ds, hop, nguoi = '') {
  const tay = kho.luat(nguoi);
  const hen = kho.hen(nguoi);
  const tt = kho.tt(nguoi);
  const lo = kho.lo();
  const toi = nguoi || 'chu-may';
  const minh = [hopChinh(hop)].concat(cfg.cuaMinh).filter(Boolean);
  const nay = Date.now();
  /* Người lo tính theo CẢ chủ đề: sổ ghi theo mã chủ đề (bản mới) hoặc mã
   * chuỗi của từng thư (bản cũ, và khi chủ đề vừa gom thêm chuỗi mới). Lấy
   * mục mới nhất, kể cả lệnh thôi nhận. */
  const loCd = new Map();
  for (const t of ds) {
    const cd = t.cd || khoaChuoi(t);
    for (const kh of [cd, khoaChuoi(t)]) {
      const l = lo[t.hop + '|' + kh];
      const cu = loCd.get(t.hop + '|' + cd);
      if (l && (!cu || (l.luc || 0) > (cu.luc || 0))) loCd.set(t.hop + '|' + cd, l);
    }
  }
  return ds.map((t) => {
    const a = kho.layAi(t.hop, t.id);
    const x = xep(t, { cfg, tay, ai: a, minh });
    const henDen = hen[kho.khoa(t.hop, t.id)] || 0;
    /* Đã đọc / sao / xong là của riêng người này, không lấy từ nhãn Lark (hộp
     * chung: người khác mở thư trên Lark không làm thư "đã đọc" với mình,
     * ngoại trừ lúc mình chưa từng đụng tới thư đó). */
    const r = tt[kho.khoa(t.hop, t.id)] || {};
    return Object.assign({}, t, {
      chuaDoc: r.d === 1 ? false : r.d === 0 ? true : Boolean(t.chuaDoc),
      sao: Boolean(r.s), xong: r.x || 0, boQua: r.b || 0,
      lo: (() => { const l = loCd.get(t.hop + '|' + (t.cd || khoaChuoi(t))); return l && l.id ? { ten: l.ten, minh: l.id === toi } : null; })(),
      ngan: x.ngan, nguon: x.nguon, lyDo: x.lyDo, sep: x.sep,
      tomTat: a ? a.tomTat : '', canLam: a ? a.canLam : '', han: a ? a.han : '',
      henDen: henDen > nay ? henDen : 0,
    });
  }).sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : 0));
}

/**
 * Hỏi AI bật khi có khoá API, hoặc khi đây là CHỦ MÁY và máy có Claude Code
 * (gói Claude cá nhân của anh Hùng, 03/11/2026). Người nối hộp thư bằng token
 * riêng (n.tk) không bao giờ được mượn gói của chủ máy.
 */
const coHoiAi = (n) => ai.coKhoa() || (!n.tk && ai.coClaudeCode());

/** Danh sách đã gom chủ đề, xếp ngăn, ghép với Đã gửi: dùng chung cho /api/thu và /api/hoi-thu. */
async function ghepDs(n, d0) {
  /* Bản đệm có thể còn thư của hộp vừa tắt (lượt đọc chạy trước lúc tắt). */
  const tat = tatCua(n);
  const d = tat.size ? Object.assign({}, d0, {
    ds: d0.ds.filter((t) => !tat.has(t.hop.toLowerCase())), gui: (d0.gui || []).filter((t) => !tat.has(t.hop.toLowerCase())),
  }) : d0;
  const hop = await cacHop(n);
  /* Gắn mã chủ đề lên bản sao, không sửa bộ đệm danh sách. */
  /* Đơn khách đặt không gom theo tiêu đề: mỗi đơn một khách (chu-de.js). */
  const ngan = new Map(lamGiau(d.ds, hop, n.nguoi).map((t) => [t.hop + '|' + t.id, t.ngan]));
  const maCd = gomChuDe(d.ds, d.gui || [], { khongGom: (t) => ngan.get(t.hop + '|' + t.id) === 'don' });
  const gan = (t) => Object.assign({}, t, { cd: maCd.get(t.hop + '|' + t.id) });
  const den = d.ds.map(gan), daGui = (d.gui || []).map(gan);
  const { daTraLoi, cho } = ghepChuoi(den, daGui);
  const ds = lamGiau(den, hop, n.nguoi).map((t) => (daTraLoi.has(t.hop + '|' + t.id) ? Object.assign(t, { daTraLoi: true }) : t));
  return { ds, den, daGui, cho };
}

/* Mã ngắn cố định của một thư cho hỏi đáp AI: cùng thư thì cùng mã qua mọi
 * câu hỏi, nên câu trả lời cũ trong lịch sử vẫn trỏ đúng thư. */
const maHoi = (t) => require('crypto').createHash('sha1').update(t.hop + '|' + t.id).digest('hex').slice(0, 7);

/** Dòng danh mục cho AI: chỉ thứ người dùng thấy trên danh sách, không nội dung. */
function dongHoi(ds, daGui) {
  const tenNgan = new Map(NGAN.map((x) => [x.id, x.ten]));
  const den = ds.map((t) => ({
    ma: maHoi(t), hop: t.hop, id: t.id, ngay: t.ngay, tu: t.tu, tieuDe: t.tieuDe,
    ngan: tenNgan.get(t.ngan) || t.ngan,
    trangThai: [
      t.chuaDoc && 'chưa đọc', t.daTraLoi && 'đã trả lời', t.sep && 'Ban giám đốc gửi',
      t.lo && (t.lo.minh ? 'anh đang lo' : t.lo.ten + ' đang lo'),
      t.xong && 'anh đã đánh dấu xong', t.boQua && 'anh đã bỏ qua', t.henDen && 'đang hẹn lại',
      t.rac && 'nằm trong Thư rác', t.luuTru && 'đã lưu trữ trên Lark',
    ].filter(Boolean).join(', '),
    tomTat: t.tomTat || '',
  }));
  const di = daGui.map((t) => ({
    ma: maHoi(t), hop: t.hop, id: t.id, ngay: t.ngay, tieuDe: t.tieuDe, daGui: true, ngan: 'Đã gửi',
  }));
  return den.concat(di).sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : 0));
}

/**
 * Chữ ký gắn vào thư trả lời: bản người dùng đã đặt; chưa đặt thì gợi ý từ
 * chữ ký Lark Mail (máy có lark-cli), không có nữa thì tên + hộp chính.
 */
const goiYChuKy = new Map();
async function layChuKy(n) {
  const daDat = kho.chuKy(n.nguoi);
  if (typeof daDat === 'string') return daDat;
  if (goiYChuKy.has(n.nguoi)) return goiYChuKy.get(n.nguoi);
  const hop = await cacHop(n);
  const lark = n.tk ? '' : await thu.chuKyLark(hopChinh(hop)).catch(() => '');
  const goiY = lark || [n.ten, hopChinh(hop)].filter(Boolean).join('\n');
  goiYChuKy.set(n.nguoi, goiY);
  return goiY;
}

/* ---------------- tệp tĩnh ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/* Dấu phiên bản tính lại mỗi lần phục vụ trang chủ (nhớ 2 giây), không tính
 * một lần lúc khởi động: tính một lần là sửa tệp xong người dùng vẫn kẹt bản
 * cũ tới khi khởi động lại máy chủ (nguyên tắc làm việc, mục 21). */
let vt = { luc: 0, v: '1' };
function vanTay() {
  if (Date.now() - vt.luc < 2000) return vt.v;
  let t = 0, n = 0;
  for (const f of fs.readdirSync(PUBLIC)) {
    try { const st = fs.statSync(path.join(PUBLIC, f)); if (st.isFile()) { t = Math.max(t, st.mtimeMs); n += st.size; } } catch (_) {}
  }
  vt = { luc: Date.now(), v: Math.round(t / 1000).toString(36) + n.toString(36) };
  return vt.v;
}

function tinh(res, duong, truyVan) {
  const p = duong === '/' ? '/index.html' : duong;
  const f = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
    return gui(res, 404, 'Không có ' + p, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  let body = fs.readFileSync(f);
  const trangChu = path.basename(f) === 'index.html';
  if (trangChu) body = Buffer.from(body.toString('utf8').split('v=BUILD').join('v=' + vanTay()), 'utf8');
  gui(res, 200, body, {
    'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
    'Cache-Control': !trangChu && /[?&]v=/.test(truyVan || '') ? 'public, max-age=31536000, immutable' : 'no-store',
  });
}

/* ---------------- định tuyến API ---------------- */

const LA_ID = /^[A-Za-z0-9+/=_-]{8,256}$/;

/** Kiểm hộp + mã thư trong đường dẫn: hộp phải là hộp được cấp. */
async function thuTuDuong(res, n, hopRaw, idRaw) {
  let hop, id;
  try { hop = decodeURIComponent(hopRaw).toLowerCase(); id = decodeURIComponent(idRaw); } catch (_) {}
  if (!hop || !id || !LA_ID.test(id)) { loi(res, 400, 'Mã thư không hợp lệ'); return null; }
  const ds = await cacHop(n);
  if (!ds.some((h) => h.email === hop)) { loi(res, 403, 'Hộp thư này không nằm trong các hộp anh được cấp quyền'); return null; }
  return { hop, id };
}

/*
 * Chạy qua hub trên máy cá nhân thì không có đăng nhập: ai gọi được
 * localhost:5180 là người chủ máy. Trình duyệt thì cho MỌI trang web gọi
 * localhost, nên một trang lạ có thể ngầm gửi lệnh (gửi thư!) dưới tên chủ
 * máy. Vì vậy request đến từ trang khác (Sec-Fetch-Site không phải
 * same-origin) bị chặn, trừ đúng hai đường Hỏi AI cho trang Render của mình:
 * mở Hub online trên chính máy này vẫn hỏi được bằng gói Claude của chủ máy.
 */
const NGUON_CAU = String(process.env.HOP_THU_NGUON_HOI || 'https://mkt-hub-w6hi.onrender.com')
  .split(',').map((x) => x.trim().replace(/\/+$/, '')).filter(Boolean);
const DUONG_CAU = new Set(['/api/hoi-may', '/api/hoi-thu']);

/** '' khi request đến từ chính trang này (hoặc không phải trình duyệt); còn lại là origin lạ. */
function nguonLa(req) {
  const site = String(req.headers['sec-fetch-site'] || '');
  if (!site || site === 'same-origin' || site === 'none') return '';
  return String(req.headers.origin || 'la');
}

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/suc-khoe') return json(res, { ok: true });

  const quyen = await laChu(req);
  const n = quyen.n;
  if (!quyen.ok) {
    return loi(res, 403, quyen.n.quaHub
      ? 'Hộp thư đang nối với tài khoản Lark ' + (quyen.chu || '(chưa rõ)') + '. Chỉ chủ tài khoản đó mở được.'
      : 'App chỉ mở được qua Marketing Hub.', { khongPhaiChu: true });
  }
  if (!n.quaHub) {
    const la = nguonLa(req);
    if (la) {
      if (!NGUON_CAU.includes(la) || !DUONG_CAU.has(p)) return loi(res, 403, 'Yêu cầu không đến từ Marketing Hub.');
      res.setHeader('Access-Control-Allow-Origin', la);
      res.setHeader('Vary', 'Origin');
      if (m === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Private-Network': 'true',
          'Access-Control-Max-Age': '600',
        });
        return res.end();
      }
      /* Bắt JSON để trình duyệt luôn phải hỏi trước (preflight): form thường không gửi lén được. */
      if (m === 'POST' && !/^application\/json/i.test(String(req.headers['content-type'] || ''))) {
        return loi(res, 415, 'Chỉ nhận JSON.');
      }
    }
    /* Trang Render dò xem máy này có hỏi được không. */
    if (p === '/api/hoi-may' && m === 'GET') return json(res, { hoiAi: coHoiAi(n) });
  }
  await kho.nap(n.nguoi, n.khoa);
  await kho.napChung();

  if (p === '/api/hop' && m === 'GET') {
    const hop = await cacHop(n);
    return json(res, { hop, chinh: hopChinh(hop), ngan: NGAN, ai: ai.coKhoa(), hoiAi: coHoiAi(n), model: cfg.ai.model,
      tat: [...tatCua(n)].filter((e) => hop.some((h) => h.email.toLowerCase() === e)) });
  }

  /* Bật tắt từng hộp: gửi cả danh sách hộp tắt. Phải còn ít nhất một hộp bật. */
  if (p === '/api/tat-hop' && m === 'POST') {
    const b = await docThan(req);
    const hop = await cacHop(n);
    const coThat = new Set(hop.map((h) => h.email.toLowerCase()));
    const tat = (Array.isArray(b.tat) ? b.tat : []).map((x) => String(x || '').toLowerCase().trim()).filter((x) => coThat.has(x));
    if (hop.length && tat.length >= hop.length) return loi(res, 400, 'Phải bật ít nhất một hộp thư');
    kho.datTatHop(tat, n.nguoi);
    /* Bật lại một hộp thì phải đọc lại mới có thư của nó. */
    dsDem.delete(n.khoa);
    return json(res, { ok: true, tat });
  }

  if (p === '/api/thu' && m === 'GET') {
    const muonDu = url.searchParams.get('du') === '1';
    const dho = url.searchParams.get('moi') === '1';      // nhịp dò thư mới của trang đang mở
    const d = muonDu ? await docSau(n) : dho ? await docMoi(n) : await docHet(n, url.searchParams.get('lam') === '1');
    if (!d.du && !muonDu && !dho) docSau(n).catch((e) => console.error('[hop-thu] đọc sâu hỏng:', e.message));
    const { ds, den, daGui, cho } = await ghepDs(n, d);
    /* Thư mình gửi thuộc chủ đề có thư đến: giao diện vẽ thành bong bóng bên
     * phải trong luồng hội thoại. */
    const coCd = new Set(den.map((t) => t.hop + '|' + t.cd));
    const gui = daGui.filter((g) => coCd.has(g.hop + '|' + g.cd))
      .map((g) => ({ hop: g.hop, id: g.id, chuoi: g.chuoi, cd: g.cd, ngay: g.ngay, tieuDe: g.tieuDe }));
    return json(res, { luc: Math.max(d.luc || 0, d.doLuc || 0), thu: ds, cho, gui, nhom: kho.nhom(n.nguoi), loi: d.loi, du: Boolean(d.du), phu: d.phu || {},
      moi: d.moi || 0 });
  }

  /* Chữ ký: lần đầu gợi ý từ Lark Mail (máy có lark-cli), sau đó là bản người dùng tự sửa. */
  if (p === '/api/chu-ky' && m === 'GET') {
    const daDat = typeof kho.chuKy(n.nguoi) === 'string';
    return json(res, { chuKy: await layChuKy(n), daDat });
  }
  if (p === '/api/chu-ky' && m === 'POST') {
    const b = await docThan(req);
    kho.datChuKy(String(b.chuKy || ''), n.nguoi);
    return json(res, { ok: true, chuKy: kho.chuKy(n.nguoi) });
  }

  /* Nhóm việc theo dõi: giao diện gửi cả danh sách, máy chủ kiểm khuôn rồi cất. */
  if (p === '/api/nhom' && m === 'POST') {
    const b = await docThan(req);
    const ds = Array.isArray(b.nhom) ? b.nhom.slice(0, 50) : null;
    if (!ds) return loi(res, 400, 'Danh sách nhóm không hợp lệ');
    const sach = ds.map((g) => ({
      id: String(g.id || '').slice(0, 40),
      ten: String(g.ten || '').trim().slice(0, 80) || 'Nhóm chưa đặt tên',
      luc: Number(g.luc) || Date.now(),
      chuoi: (Array.isArray(g.chuoi) ? g.chuoi : []).slice(0, 100).map((c) => ({
        hop: String(c.hop || '').toLowerCase().slice(0, 120), chuoi: String(c.chuoi || '').slice(0, 200),
        td: String(c.td || '').slice(0, 200),
      })).filter((c) => c.hop && c.chuoi),
    })).filter((g) => /^[\w-]{4,40}$/.test(g.id));
    kho.datNhom(sach, n.nguoi);
    return json(res, { ok: true, nhom: sach });
  }

  /* Dịch dự phòng (giao diện dùng bộ dịch của trình duyệt trước). */
  if (p === '/api/dich' && m === 'POST') {
    const b = await docThan(req);
    const chu = String(b.chu || '').trim();
    if (!chu) return loi(res, 400, 'Không có chữ để dịch');
    if (!ai.coKhoa()) {
      return loi(res, 409, 'Trình duyệt này chưa dịch được và app chưa có khoá Claude. Mở Marketing Hub bằng Google Chrome bản mới để dịch ngay trên máy.', { khongKhoa: true });
    }
    return json(res, { chu: await ai.dich(chu, b.den === 'en' ? 'en' : 'vi') });
  }

  /* Hỏi AI về thư trong hộp: chỉ đọc. AI thấy danh mục thư của chính người
   * hỏi (đúng các hộp người đó được cấp) và tự mở thư cần đọc kỹ. */
  if (p === '/api/hoi-thu' && m === 'POST') {
    if (!coHoiAi(n)) return loi(res, 409, 'Hỏi AI cần khoá Claude API (ANTHROPIC_API_KEY) trên máy chủ.', { khongKhoa: true });
    const b = await docThan(req);
    const cauHoi = String(b.cauHoi || '').trim();
    if (!cauHoi) return loi(res, 400, 'Câu hỏi đang trống');
    const d = await docHet(n, false);
    const { ds } = await ghepDs(n, d);
    const muc = dongHoi(ds, d.gui || []);
    const theoMa = new Map(muc.map((t) => [t.ma, t]));
    const dangMo = /^[^|]+\|.+$/.test(String(b.dangMo || '')) ? maHoi({ hop: b.dangMo.split('|')[0], id: b.dangMo.slice(b.dangMo.indexOf('|') + 1) }) : '';
    /* Có khoá API thì đi API; không thì Claude Code của chủ máy (coHoiAi đã chặn người khác). */
    const kq = await (ai.coKhoa() ? ai.hoiDap : ai.hoiDapMay)({
      cauHoi,
      lichSu: Array.isArray(b.lichSu) ? b.lichSu : [],
      ds: muc,
      dangMo,
      homNay: new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' '),
      nguoi: n.ten || 'anh Hùng',
      docThu: async (ma) => { const t = theoMa.get(ma); return t ? thu.doc(t.hop, t.id, n.tk) : null; },
    });
    /* Chỉ trả lại những thư câu trả lời có nhắc tới, để giao diện vẽ thành nút mở
     * thư; bản nháp <nhap ma="…"> cũng cần thư của nó để đưa vào khung trả lời. */
    const thuNhac = {};
    for (const x of kq.chu.matchAll(/\[#([0-9a-f]{7})\]|<nhap ma="([0-9a-f]{7})">/g)) {
      const ma = x[1] || x[2];
      const t = theoMa.get(ma);
      if (t) thuNhac[ma] = { hop: t.hop, id: t.id, tieuDe: t.tieuDe, tu: t.tu ? t.tu.ten || t.tu.email : '', daGui: Boolean(t.daGui) };
    }
    return json(res, { chu: kq.chu, thu: thuNhac, daMo: kq.daMo.length });
  }

  /* Thêm vào lịch Lark của chính người đang dùng. */
  if (p === '/api/lich' && m === 'POST') {
    if (process.env.HOP_THU_CHI_DOC === '1') return loi(res, 423, 'Đang ở chế độ chỉ đọc, không tạo lịch');
    const b = await docThan(req);
    const batDau = Number(b.batDau), ketThuc = Number(b.ketThuc);
    const tieuDe = String(b.tieuDe || '').trim().slice(0, 200);
    if (!tieuDe) return loi(res, 400, 'Sự kiện chưa có tên');
    if (!batDau || !ketThuc || ketThuc <= batDau) return loi(res, 400, 'Giờ kết thúc phải sau giờ bắt đầu');
    try {
      const kq = await thu.taoLich({ tieuDe, batDau, ketThuc, moTa: String(b.moTa || '').slice(0, 3000) }, n.tk);
      return json(res, { ok: true, kq });
    } catch (e) {
      if (e instanceof mapi.LoiQuyenLich) return loi(res, 409, e.message, { canQuyenLich: true });
      throw e;
    }
  }

  /* Xếp nhanh bằng AI những thư luật không nhận. Giao diện gọi sau khi nạp
   * danh sách; mỗi thư chỉ xếp một lần vì kết quả nằm trong bộ đệm. */
  if (p === '/api/xep-ai' && m === 'POST') {
    if (!ai.coKhoa()) return json(res, { xep: 0, khongKhoa: true });
    const d = await docHet(n, false);
    const hop = await cacHop(n);
    const can = lamGiau(d.ds, hop, n.nguoi).filter((t) => t.nguon === 'mac-dinh' && !kho.layAi(t.hop, t.id)).slice(0, 80);
    if (!can.length) return json(res, { xep: 0 });
    const kq = await ai.xepNhanh(can, { nguoi: quyen.n.ten || 'anh Hùng' });
    kho.datAiNhieu(kq.map((x) => ({ hop: x.thu.hop, id: x.thu.id, v: { ngan: x.ngan, chiXep: true } })));
    return json(res, { xep: kq.length });
  }

  if (p === '/api/luat' && m === 'POST') {
    const b = await docThan(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return loi(res, 400, 'Địa chỉ gửi không hợp lệ');
    if (b.ngan && !LA_NGAN.has(b.ngan)) return loi(res, 400, 'Ngăn không hợp lệ');
    kho.datLuat(email, b.ngan || null, n.nguoi);
    return json(res, { ok: true, luat: kho.luat(n.nguoi) });
  }

  const mt = /^\/api\/thu\/([^/]+)\/([^/]+)(?:\/([a-z-]+))?$/.exec(p);
  if (!mt) return loi(res, 404, 'Không có đường này');
  const k = await thuTuDuong(res, n, mt[1], mt[2]);
  if (!k) return;
  const viec = mt[3] || '';

  /* Chế độ chỉ đọc cho lúc soát giao diện: dữ liệu Lark là thư thật của công
   * ty, công cụ soát không được gửi thư nào. (Đổi trạng thái chỉ ghi sổ riêng,
   * mà chế độ này sổ chỉ nằm trên máy.) */
  if (process.env.HOP_THU_CHI_DOC === '1' && viec === 'tra-loi') {
    return loi(res, 423, 'Đang ở chế độ chỉ đọc, không gửi gì lên Lark Mail');
  }

  if (!viec && m === 'GET') {
    const t = await thu.doc(k.hop, k.id, n.tk);
    return json(res, { thu: t, ai: kho.layAi(k.hop, k.id), hen: kho.hen(n.nguoi)[kho.khoa(k.hop, k.id)] || 0 });
  }

  if (viec === 'phan-tich' && m === 'POST') {
    if (!ai.coKhoa()) return loi(res, 409, 'Chưa có khoá Claude API', { khongKhoa: true });
    const t = await thu.doc(k.hop, k.id, n.tk);
    const kq = await ai.phanTich(t, { nguoi: quyen.n.ten || 'anh Hùng' });
    kho.datAi(k.hop, k.id, kq);
    return json(res, { ai: kho.layAi(k.hop, k.id) });
  }

  if (viec === 'nhap' && m === 'POST') {
    if (!ai.coKhoa()) return loi(res, 409, 'Chưa có khoá Claude API', { khongKhoa: true });
    const b = await docThan(req);
    const t = await thu.doc(k.hop, k.id, n.tk);
    const chu = await ai.vietNhap(t, String(b.yDinh || ''), { nguoi: quyen.n.ten || 'Lê Văn Hùng' });
    return json(res, { chu });
  }

  /* Đổi trạng thái: CHỈ ghi sổ riêng của người này, không đụng nhãn hay thư
   * mục trên Lark Mail (anh Hùng 28/10/2026: hộp chung còn người khác dùng). */
  if (viec === 'doi' && m === 'POST') {
    const b = await docThan(req);
    const doi = {};
    if (typeof b.daDoc === 'boolean') doi.daDoc = b.daDoc;
    if (typeof b.sao === 'boolean') doi.sao = b.sao;
    if (typeof b.xong === 'boolean') doi.xong = b.xong;
    if (typeof b.boQua === 'boolean') doi.boQua = b.boQua;
    if (!Object.keys(doi).length) return loi(res, 400, 'Không có thay đổi nào');
    return json(res, { ok: true, tt: kho.datTT(k.hop, k.id, doi, n.nguoi) });
  }

  /* Nhận / thôi nhận một chuỗi thư: sổ CHUNG của phòng, không đổi gì trên Lark. */
  if (viec === 'lo' && m === 'POST') {
    const b = await docThan(req);
    if (typeof b.nhan !== 'boolean') return loi(res, 400, 'Thiếu nhan: true/false');
    const chuoi = String(b.chuoi || 'id:' + k.id).slice(0, 200);
    kho.datLo(k.hop, chuoi, b.nhan ? nguoiLo(n) : null);
    const l = kho.lo()[k.hop + '|' + chuoi];
    return json(res, { ok: true, lo: l && l.id ? { ten: l.ten, minh: true } : null });
  }

  if (viec === 'hen' && m === 'POST') {
    const b = await docThan(req);
    const den = Number(b.den) || 0;
    if (den && den < Date.now()) return loi(res, 400, 'Giờ hẹn đã qua');
    kho.datHen(k.hop, k.id, den || null, n.nguoi);
    return json(res, { ok: true });
  }

  /* Xem trước: đúng thân thư sẽ đi (phần viết + chữ ký + trích thư gốc), người
   * nhận, tiêu đề, và các lỗi chữ soát được. Không ghi gì lên Lark. */
  if (viec === 'xem-truoc' && m === 'POST') {
    const b = await docThan(req);
    const chu = String(b.chu || '').trim();
    if (!chu) return loi(res, 400, 'Thư trả lời đang trống');
    const g = await thu.doc(k.hop, k.id, n.tk);
    const tatCa = b.tatCa === true;
    /* Thư của chính mình (đang chờ bên kia hồi âm): nhắc lại thì gửi cho những
     * người nhận ban đầu, giống mail-api.dungTraLoi. */
    const thuMinh = g.tu.email === k.hop;
    const nhan = (thuMinh ? g.den : [g.tu].concat(tatCa ? g.den : [])).filter((x) => x.email && x.email !== k.hop);
    const cc = tatCa ? g.cc.filter((x) => x.email && x.email !== k.hop) : [];
    const motLan = (ds) => ds.filter((x, i) => ds.findIndex((y) => y.email === x.email) === i);
    const chuKy = b.coChuKy === false ? '' : await layChuKy(n);
    const esc =(s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = thu.thanThu(chu, chuKy) +
      '<div style="margin-top:18px;color:#666;font-size:13px">Vào ' + esc(g.ngay) + ', ' + esc(g.tu.ten || g.tu.email) + ' đã viết:</div>' +
      '<blockquote style="margin:6px 0 0;border-left:2px solid #ccc;padding-left:10px;color:#666;font-size:13px;white-space:pre-wrap">' +
      esc(String(g.noiDung || '').slice(0, 3000)) + '</blockquote>';
    /* Bản tiếng Anh (dịch từ chữ anh viết): luật soát là luật tiếng Việt, không áp. */
    const tiengAnh = b.ngonNgu === 'en';
    let loiChu = tiengAnh ? [] : chinhTa.soat(chu);
    let aiSoat = false;
    if (ai.coKhoa() && b.soatAi !== false && !tiengAnh) {
      try { loiChu = chinhTa.gopAi(chu, loiChu, await ai.soatChinhTa(chu)); aiSoat = true; } catch (_) { /* AI hỏng vẫn còn bộ soát trên máy */ }
    }
    const tieuDe = /^(re|trả lời|tl)\s*:/i.test(g.tieuDe || '') ? g.tieuDe : 'Re: ' + (g.tieuDe || '');
    return json(res, { tu: k.hop, den: motLan(nhan), cc: motLan(cc), tieuDe, html, chuKy, loi: loiChu, aiSoat });
  }

  if (viec === 'tra-loi' && m === 'POST') {
    const b = await docThan(req);
    const chu = String(b.chu || '').trim();
    if (!chu) return loi(res, 400, 'Thư trả lời đang trống');
    if (chu.length > 20000) return loi(res, 400, 'Thư trả lời quá dài');
    const chuKy = b.coChuKy === false ? '' : await layChuKy(n);
    const kq =await thu.traLoi(k.hop, k.id, chu, { gui: b.gui === true, tatCa: b.tatCa === true, chuKy }, n.tk);
    /* Ai gửi trả lời là người đang lo chuỗi thư đó: cả phòng thấy ngay, khỏi
     * hai người cùng trả lời một khách. */
    if (b.gui === true) kho.datLo(k.hop, String(b.chuoi || 'id:' + k.id).slice(0, 200), nguoiLo(n));
    quenDs(n);
    return json(res, { ok: true, daGui: b.gui === true, kq });
  }

  return loi(res, 404, 'Không có đường này');
}

/* ---------------- máy chủ ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET') return loi(res, 405, 'Không hỗ trợ');
    return tinh(res, url.pathname, url.search);
  } catch (e) {
    if (e.chiTiet) console.error('[hop-thu]', url.pathname, e.chiTiet);
    if (res.headersSent) return;
    if (thu.LoiChuaNoi && e instanceof thu.LoiChuaNoi) {
      /* Hub nói vì sao không có token (x-hub-thu-ly-do): in kèm để biết đường sửa. */
      let lyDo = '';
      try { lyDo = decodeURIComponent(String(req.headers['x-hub-thu-ly-do'] || '')).slice(0, 240); } catch (_) {}
      return loi(res, 503, e.message + (e.noiDuoc && lyDo ? ' Lý do: ' + lyDo : ''), { chuaNoi: true, noiDuoc: Boolean(e.noiDuoc) });
    }
    loi(res, e instanceof ai.LoiAi ? 502 : 500, e.message || String(e));
  }
});

if (require.main === module) {
  server.listen(cfg.port, BIND, () => {
    console.log('Hộp thư · http://localhost:' + cfg.port + (ai.coKhoa() ? ' · AI bật (' + cfg.ai.model + ')' : ' · AI tắt (chưa có ANTHROPIC_API_KEY)'));
  });
}

module.exports = { server, aiGoi, lamGiau, ghepChuoi, docTheoNgay };
