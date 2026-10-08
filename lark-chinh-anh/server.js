'use strict';
/**
 * Server HTTP thuần Node (không dependency) cho app Chỉnh ảnh & Edit video.
 *
 * Hai nhóm đường dẫn, hai mức tin cậy:
 *   /api/*        — nhân sự báo cáo và xem lại sản phẩm của cả nhóm;
 *   /api/quan-ly/* — nghiệm thu, đổi nhóm chat, sửa danh mục Tour: chỉ quản lý.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const lark = require('./lark');
const store = require('./store');
const ttm = require('./ten-thu-muc');
const tin = require('./tin');
const tinApp = require('./tin-app');

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
      if (size > 2 * 1024 * 1024) { reject(new Error('Body quá lớn')); req.destroy(); return; }
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
 * proxy của mkt-hub và đã có lần deploy xong mà trình duyệt vẫn dùng app.js cũ. */
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
    /* Trang chủ KHÔNG được vào cache: nó là nơi duy nhất giữ số bản của mọi
     * file khác, giữ bản cũ là xin đúng những file cũ. Còn file được xin KÈM
     * số bản thì cứ cache lâu — đổi file là đổi vân tay, tức đổi luôn địa chỉ,
     * nên không bao giờ lấy nhầm bản cũ.
     *
     * Vân tay đã có sẵn từ lâu và index.html đã đóng dấu ?v=__V__, nhưng vẫn
     * trả no-store, nên cả bộ máy đó không dùng được vào việc gì: mỗi lần mở
     * một tab trong hub là tải lại toàn bộ CSS/JS của app. */
    const coSoBan = /[?&]v=/.test(String(req.url || ''));
    const cache = rel !== 'index.html' && coSoBan ? 'public, max-age=31536000, immutable' : 'no-store';
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': cache,
    });
    res.end(out);
  });
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
  const e = new Error('Việc này chỉ quản lý làm được. Nhờ anh Hùng cấp quyền trong Cài đặt của Marketing Hub.');
  e.code = 403;
  return e;
}

/* ---------------- nhóm chat đang dùng ---------------- */
/**
 * Nhóm chat lấy từ bảng Cài đặt trên Base, không phải từ file trên đĩa: app còn
 * phải chạy được sau proxy của hub và trên Render (đĩa ở đó không giữ được gì).
 * Chưa có dòng cài đặt nào thì rơi về hằng trong config.
 */
function nhomChat(d) {
  const c = d.caiDat || {};
  return {
    id: c['chat_id'] || cfg.chatMacDinh,
    ten: c['chat_ten'] || cfg.chatTenMacDinh,
    tuBase: !!c['chat_id'],
  };
}

/**
 * TẤT CẢ nhóm nhận báo cáo — một báo cáo có thể phải vào nhiều nhóm.
 *
 * Anh Hiển nhờ đẩy thông báo sửa ảnh lên cả nhóm "CSKH - ẢNH,VIDEO" bên cạnh
 * nhóm SỬA ẢNH (05/10/2026): Media kiểm ảnh ở một nhóm, CSKH lấy ảnh gửi khách ở
 * nhóm khác. Bắt người chỉnh báo cáo hai lần là kiểu gì cũng có lần quên một bên.
 *
 * Lưu ở ô `chat_ds` dạng JSON [{id, ten}]. Chưa có ô đó thì lùi về cặp
 * `chat_id`/`chat_ten` của bản một-nhóm — mọi cài đặt cũ vẫn chạy nguyên.
 */
function dsNhomChat(d) {
  const c = (d && d.caiDat) || {};
  const tho = String(c['chat_ds'] || '').trim();
  if (tho) {
    try {
      const ds = JSON.parse(tho);
      const sach = (Array.isArray(ds) ? ds : [])
        .filter((x) => x && /^oc_[A-Za-z0-9]+$/.test(String(x.id || '')))
        .map((x) => ({ id: String(x.id), ten: String(x.ten || x.id) }));
      /* Bỏ trùng: chọn nhầm một nhóm hai lần là nhóm đó nhận hai tin giống hệt. */
      const theoId = new Map(sach.map((x) => [x.id, x]));
      if (theoId.size) return [...theoId.values()];
    } catch (_) { /* ô hỏng thì lùi về cách cũ, đừng để cả app không gửi được */ }
  }
  const mot = nhomChat(d);
  return mot.id ? [mot] : [];
}

/**
 * Gửi một tin vào nhóm. Thẻ trước, hỏng thì lùi về text thuần.
 *
 * Vì sao có đường lùi: schema thẻ là thứ Lark siết lại được bất cứ lúc nào, và khi
 * đó cả luồng báo cáo đứng. Báo cáo đã ghi vào Base rồi thì tin nhắn KHÔNG được
 * phép làm vỡ cả yêu cầu — nên hàm này không bao giờ throw, chỉ trả kết quả.
 */
/** Gửi vào MỘT nhóm. Thẻ trước, thẻ hỏng thì lùi về chữ thuần. */
async function guiMotNhom({ chatId, card, text, khoa }) {
  let r = await lark.guiTin({ chatId, card, khoa });
  if (!r.ok) {
    const dauTien = r.loi;
    r = await lark.guiTin({ chatId, text, khoa: khoa ? khoa + '-t' : '' });
    if (r.ok) r.canhBao = 'Thẻ bị từ chối nên đã gửi dạng chữ: ' + dauTien;
    else r.loi = dauTien + ' | text: ' + r.loi;
  }
  return r;
}

async function guiVeNhom({ chatId, chatIds, nhoms, card, text, khoa, baoCaoId, baoCaoIds }) {
  /* Một tin có thể thuộc NHIỀU lô (một lần báo cáo nhiều mục) — nhật ký nối vào lô
   * đầu, còn dấu "đã gửi" phải đóng cho TẤT CẢ, không thì các lô sau vẫn hiện
   * "chưa gửi" trong khi nhóm đã nhận tin rồi. */
  const ids = (baoCaoIds && baoCaoIds.length ? baoCaoIds : [baoCaoId]).filter(Boolean);
  const baoCaoId1 = ids[0] || '';

  /* Nhận cả ba dạng để chỗ gọi cũ không phải sửa: một chatId, mảng id, hoặc mảng
   * {id, ten} (dạng này mới nói được TÊN nhóm nào hỏng). */
  const dich = (nhoms && nhoms.length ? nhoms
    : (chatIds && chatIds.length ? chatIds : [chatId]).filter(Boolean).map((x) => ({ id: x, ten: x })))
    .filter((x) => x && x.id);

  if (!dich.length) {
    const r = { ok: false, loi: 'Chưa chọn nhóm chat. Vào Cài đặt để chọn.' };
    await store.ghiNhatKy({ chat: '', ok: false, noiDung: text, thongBao: r.loi, baoCaoId: baoCaoId1 });
    return r;
  }

  const xong = [];
  for (const n of dich) {
    /* Khoá chống gửi trùng phải KHÁC NHAU theo nhóm. Dùng chung một khoá thì
     * nhóm thứ hai bị Lark coi là gửi lại đúng tin cũ và nuốt mất — nhóm đó
     * không nhận được gì mà app vẫn báo thành công. */
    const khoaN = khoa ? khoa + '-' + n.id.slice(-8) : '';
    const r = await guiMotNhom({ chatId: n.id, card, text, khoa: khoaN });
    xong.push({ nhom: n, r });
    await store.ghiNhatKy({
      chat: n.id, ok: r.ok, msgId: r.msgId, noiDung: text,
      thongBao: r.canhBao || r.loi || '', baoCaoId: baoCaoId1,
    });
  }

  const duoc = xong.filter((x) => x.r.ok);
  const hong = xong.filter((x) => !x.r.ok);

  /* Đóng dấu "đã gửi" khi ÍT NHẤT MỘT nhóm nhận được: tin đã ra ngoài rồi, để
   * cờ false là lô đó nằm mãi trong danh sách "chưa gửi" và có người gửi lại,
   * thành hai tin ở nhóm đã nhận. Nhóm nào trượt thì nói rõ tên ở dưới. */
  if (duoc.length && ids.length) {
    try { await store.danhDauDaGui(ids); } catch (e) { console.warn('[gui] ' + e.message); }
  }

  const tenHong = hong.map((x) => x.nhom.ten || x.nhom.id).join(', ');
  const canhBao = [
    ...xong.filter((x) => x.r.canhBao).map((x) => (x.nhom.ten || x.nhom.id) + ': ' + x.r.canhBao),
    ...(duoc.length && hong.length ? ['Chưa gửi được vào ' + tenHong + ': ' + hong[0].r.loi] : []),
  ].join(' · ');

  return {
    ok: duoc.length > 0,
    msgId: (duoc[0] && duoc[0].r.msgId) || '',
    loi: duoc.length ? '' : hong.map((x) => (x.nhom.ten || x.nhom.id) + ': ' + x.r.loi).join(' · '),
    canhBao: canhBao || undefined,
    soNhom: dich.length,
    daGui: duoc.map((x) => x.nhom.ten || x.nhom.id),
    truot: hong.map((x) => x.nhom.ten || x.nhom.id),
  };
}

/* ---------------- lọc & tổng hợp ---------------- */
function thamSo(u) {
  const g = (k) => (u.searchParams.get(k) || '').trim();
  const den = g('den') || store.homNay();
  const tu = g('tu') || store.themNgay(den, -29);
  return {
    tu, den, tour: g('tour'), trangThai: g('trangThai'), nguoi: g('nguoi'),
    hangMuc: g('hangMuc'), q: g('q').toLowerCase(),
  };
}

function loc(ds, t) {
  return ds.filter((b) => {
    if (b.ngay && (b.ngay < t.tu || b.ngay > t.den)) return false;
    if (t.tour && b.tour !== t.tour) return false;
    if (t.trangThai && b.trangThai !== t.trangThai) return false;
    if (t.hangMuc && !(b.hangMuc || []).includes(t.hangMuc)) return false;
    if (t.nguoi && !(b.nguoiLam || []).some((u) => u.id === t.nguoi)) return false;
    if (t.q) {
      const kho = [b.thuMuc, b.tour, b.loai, b.ghiChu, b.nhanXet,
        (b.nguoiLam || []).map((u) => u.name).join(' ')].join(' ').toLowerCase();
      if (!kho.includes(t.q)) return false;
    }
    return true;
  });
}

/** Người đã từng xuất hiện trong bảng Báo cáo — danh bạ luôn có, không cần API. */
function nguoiDaLam(ds) {
  const m = new Map();
  (ds || []).forEach((b) => (b.nguoiLam || []).forEach((u) => {
    if (u.id && !m.has(u.id)) m.set(u.id, { id: u.id, ten: u.name || u.id, phong: '' });
  }));
  return [...m.values()].sort((a, b) => a.ten.localeCompare(b.ten));
}

/* Email đã tra, giữ trong RAM — một lô nhiều người thì khỏi gọi danh bạ lại. */
const KHO_EMAIL = new Map();

/**
 * NHẮN RIÊNG kết quả nghiệm thu cho người đã làm lô đó.
 *
 * Anh Hùng 08/10/2026: "đạt hay không đạt thì chỉ cần gửi tin nhắn riêng cho
 * bạn Trường là được". Trước đó mọi kết quả đều bắn vào nhóm chung — khen thì
 * không sao, nhưng trả về sửa trước mặt cả nhóm là chuyện không cần thiết.
 *
 * Nhắn theo EMAIL chứ không theo open_id của Base: xem chú thích ở
 * lark.emailTheoOpenId(). Nhắn hụt thì LÙI VỀ NHÓM chứ không im — người làm
 * phải biết lô bị trả lại, mất tin là lô nằm đó không ai sửa.
 */
async function guiRiengNghiemThu(bc, { nguoiTen, d }) {
  const soan = tin.soanNghiemThu(bc, { nguoiTen });
  const ds = (bc.nguoiLam || []).filter((x) => x && x.id);
  const xong = [];
  const truot = [];
  for (const u of ds) {
    if (!KHO_EMAIL.has(u.id)) {
      // eslint-disable-next-line no-await-in-loop
      KHO_EMAIL.set(u.id, await lark.emailTheoOpenId(u.id, u.name || ''));
    }
    const email = KHO_EMAIL.get(u.id);
    if (!email) { truot.push((u.name || u.id) + ': không tra được email công ty'); continue; }
    // eslint-disable-next-line no-await-in-loop
    const r = await lark.guiTin({
      email, card: soan.card, text: soan.text,
      khoa: 'ntr-' + bc.id + '-' + email.split('@')[0] + '-' + Date.now().toString(36).slice(-6),
    });
    if (r.ok) xong.push(u.name || email); else truot.push((u.name || email) + ': ' + String(r.loi || '').slice(0, 120));
    // eslint-disable-next-line no-await-in-loop
    await store.ghiNhatKy({
      chat: 'riêng:' + email, ok: r.ok, msgId: r.msgId, noiDung: soan.text,
      thongBao: r.loi || '', baoCaoId: bc.id,
    });
  }
  if (xong.length) {
    return { ok: true, duong: 'riêng', nguoi: xong,
      loi: truot.length ? 'Không nhắn được: ' + truot.join(' · ') : '' };
  }
  const g = await guiVeNhom({
    nhoms: dsNhomChat(d), card: soan.card, text: soan.text,
    khoa: 'nt-' + bc.id + '-' + Date.now().toString(36).slice(-6), baoCaoId: bc.id,
  });
  return { ...g, duong: 'nhóm',
    loi: g.loi || (ds.length
      ? 'Không nhắn riêng được (' + truot.join(' · ') + ') nên đã gửi vào nhóm.'
      : 'Lô chưa ghi người làm nên gửi vào nhóm.') };
}

function tongHop(ds) {
  const s = {
    soBaoCao: ds.length, soAnh: 0, soVideo: 0,
    choNghiemThu: 0, dat: 0, canSua: 0, chuaGui: 0,
    theoNguoi: {}, theoTour: {},
  };
  /* SỐ NGÀY CÓ VIỆC, không phải số lô. Một ngày có thể báo mấy lô, nên đếm lô
   * thì không trả lời được câu "tháng này bạn ấy ngồi chỉnh ảnh mấy ngày".
   * Đếm theo NGÀY LÀM của lô, và chỉ tính ngày lô đó thật sự có ảnh (hoặc có
   * video) — lô chỉ có video mà tính vào ngày có ảnh là thổi số lên. */
  const ngayAnh = new Set();
  const ngayVideo = new Set();
  ds.forEach((b) => {
    s.soAnh += b.soAnh || 0;
    s.soVideo += b.soVideo || 0;
    if (b.ngay && (b.soAnh || 0) > 0) ngayAnh.add(b.ngay);
    if (b.ngay && (b.soVideo || 0) > 0) ngayVideo.add(b.ngay);
    if (b.trangThai === 'Đạt') s.dat++;
    else if (b.trangThai === 'Cần sửa lại') s.canSua++;
    else s.choNghiemThu++;
    if (!b.daGui) s.chuaGui++;
    /* Đếm cho TỪNG người khi một lô có nhiều người làm — đó mới là tải thật.
     * Đếm một lần thì không thấy ai đang gánh (bài học từ trang Lịch chung của hub). */
    (b.nguoiLam.length ? b.nguoiLam : [{ id: '', name: 'Chưa ghi người' }]).forEach((u) => {
      const k = u.name || u.id;
      const o = s.theoNguoi[k] || (s.theoNguoi[k] = { ten: k, id: u.id, lo: 0, anh: 0, video: 0,
        canSua: 0, _ngayAnh: new Set(), _ngayVideo: new Set() });
      o.lo++; o.anh += b.soAnh || 0; o.video += b.soVideo || 0;
      if (b.ngay && (b.soAnh || 0) > 0) o._ngayAnh.add(b.ngay);
      if (b.ngay && (b.soVideo || 0) > 0) o._ngayVideo.add(b.ngay);
      if (b.trangThai === 'Cần sửa lại') o.canSua++;
    });
    const kt = b.tour || '(chưa ghi Tour)';
    const ot = s.theoTour[kt] || (s.theoTour[kt] = { ten: kt, lo: 0, anh: 0, video: 0 });
    ot.lo++; ot.anh += b.soAnh || 0; ot.video += b.soVideo || 0;
  });
  s.soNgayCoAnh = ngayAnh.size;
  s.soNgayCoVideo = ngayVideo.size;
  s.theoNguoi = Object.values(s.theoNguoi)
    .map(({ _ngayAnh, _ngayVideo, ...o }) => ({ ...o,
      ngayCoAnh: _ngayAnh.size, ngayCoVideo: _ngayVideo.size }))
    .sort((a, b) => b.lo - a.lo);
  s.theoTour = Object.values(s.theoTour).sort((a, b) => b.lo - a.lo);
  return s;
}

/* ---------------- API ---------------- */
async function api(req, res, u) {
  const p = u.pathname;
  const method = req.method;

  if (p === '/api/me') {
    const nd = await nguoiDung(req);
    const d = await store.tai();
    return ok(res, {
      user: nd, quanLy: laQuanLy(req), mode: cfg.mode,
      baseUrl: cfg.baseUrl, nhom: nhomChat(d), dsNhom: dsNhomChat(d),
      nguoiGui: tinApp.nguoiGui(),
    });
  }

  if (p === '/api/meta') {
    const d = await store.tai(u.searchParams.get('moi') === '1');
    const nd = await nguoiDung(req);
    return ok(res, {
      tours: d.tours.filter((t) => t.dung !== false),
      toursAll: d.tours,
      loai: cfg.loai, hangMuc: cfg.hangMuc, trangThai: cfg.trangThai,
      nhom: nhomChat(d), dsNhom: dsNhomChat(d), homNay: store.homNay(), baseUrl: cfg.baseUrl,
      /* Ai đứng tên gửi tin — hiện thẳng ra giao diện. Phòng có hai app Lark và
       * đã một lần suýt mời sai bot vào nhóm; để app tự khai ra là rẻ nhất. */
      nguoiGui: tinApp.nguoiGui(),
      /* Danh bạ mồi cho ô chọn người chỉnh — người đã từng làm, luôn có sẵn. */
      people: nguoiDaLam(d.baoCao),
      user: nd, quanLy: laQuanLy(req), capNhat: d.luc,
    });
  }

  if (p === '/api/bao-cao' && method === 'GET') {
    const d = await store.tai(u.searchParams.get('moi') === '1');
    const t = thamSo(u);
    const ds = loc(d.baoCao, t);
    return ok(res, { baoCao: ds, tong: tongHop(ds), loc: t, capNhat: d.luc });
  }

  if (p === '/api/bao-cao' && method === 'POST') {
    const b = await readBody(req);
    const nd = await nguoiDung(req);
    const d = await store.tai();

    /* MỘT LẦN BÁO CÁO = NHIỀU MỤC. Vẫn nhận cả dạng cũ (các trường phẳng) để
     * script cũ hoặc bản giao diện cũ còn cache không vỡ. */
    const dsVao = Array.isArray(b.muc) && b.muc.length ? b.muc : [b];
    if (dsVao.length > 20) return fail(res, 400, 'Một lần báo cáo tối đa 20 mục.');

    /* Người chỉnh mặc định là người đang đăng nhập, và luôn có mặt trong danh sách
     * để không bao giờ có báo cáo vô chủ. Từng mục khai riêng được (mỗi thư mục có
     * thể do người khác chỉnh); không khai thì lấy danh sách chung của lần báo cáo. */
    const idHopLe = (x) => /^ou_[A-Za-z0-9]+$/.test(String(x || ''));
    const nguoiChung = [...new Set((b.nguoiLamIds || []).filter(idHopLe))];

    const canGhi = [];
    const daThay = new Map();

    for (let k = 0; k < dsVao.length; k++) {
      const m = dsVao[k] || {};
      const o = (msg) => 'Mục ' + (k + 1) + ': ' + msg;

      const tour = d.tours.find((x) => x.id === m.tourId || x.ten === m.tour);
      if (!tour) return fail(res, 400, o('chưa chọn Tour (hoặc Tour không có trong danh mục).'));
      if (!m.ngay) return fail(res, 400, o('chưa có ngày tác nghiệp.'));

      const hangMuc = (m.hangMuc || []).filter((x) => cfg.hangMuc.includes(x));
      if (!hangMuc.length) {
        return fail(res, 400, o('chọn ít nhất một hạng mục: Chỉnh ảnh hoặc Edit video.'));
      }

      /* NHẬN XÉT ẢNH LÀ BẮT BUỘC. Tin nhắn gửi vào nhóm là để Media kiểm và CSKH
       * gửi khách — một loạt link trần không nói được ảnh này chụp góc nào, đã sửa
       * gì, chỗ nào cần lưu ý. Anh Hùng chốt phần này bắt buộc (22/09/2026), nên
       * chặn ở server chứ không chỉ ở form: bỏ trống là không lưu, không gửi. */
      const nhanXetAnh = String(m.nhanXetAnh == null ? '' : m.nhanXetAnh).trim();
      if (!nhanXetAnh) {
        return fail(res, 400, o('chưa viết nhận xét ảnh. Phần này bắt buộc, nhóm đọc để biết ảnh có gì.'));
      }
      if (nhanXetAnh.length > 2000) {
        return fail(res, 400, o('nhận xét ảnh dài quá 2000 ký tự.'));
      }

      const linkAnh = tin.linkSach(m.linkAnh);
      const linkVideo = tin.linkSach(m.linkVideo);
      if (hangMuc.includes('Chỉnh ảnh') && !linkAnh) {
        return fail(res, 400, o('hạng mục Chỉnh ảnh thì phải có link thư mục ảnh (http/https).'));
      }
      if (hangMuc.includes('Edit video') && !linkVideo) {
        return fail(res, 400, o('hạng mục Edit video thì phải có link thư mục video (http/https).'));
      }

      const loai = cfg.loai.includes(m.loai) ? m.loai : 'Khác';
      const ngay = String(m.ngay).slice(0, 10);
      /* Tour VIP phải có tên HDV (anh Hùng 01/10/2026) — chặn ở server như nhận xét ảnh. */
      const hdv = ttm.hdvCua(loai, m.hdv).slice(0, 120);
      if (loai === 'VIP' && !hdv) {
        return fail(res, 400, o('tour VIP thì nhập tên HDV.'));
      }
      const khoa = ttm.khoa({ tour: tour.ten, loai, ngay, hdv });

      /* Hai mục cùng Tour + Loại + ngày trong CÙNG một lần bấm thì mục sau đè mục
       * trước trên Base — người dùng mất dữ liệu mà không ai báo. Chặn ngay, và nói
       * rõ trùng với mục nào. */
      if (daThay.has(khoa)) {
        return fail(res, 400, o('trùng Tour + Loại + ngày' + (hdv ? ' + HDV' : '') + ' với mục ' + (daThay.get(khoa) + 1)
          + '. Hai thư mục cùng lô thì gộp link vào một mục, hoặc đổi Loại/ngày.'));
      }
      daThay.set(khoa, k);

      const rieng = [...new Set((m.nguoiLamIds || []).filter(idHopLe))];
      const nguoi = new Set(rieng.length ? rieng : nguoiChung);
      if (!nguoi.size && nd && nd.id) nguoi.add(nd.id);

      /* Bỏ một hạng mục thì phải XOÁ luôn số và link của hạng mục đó. Không xoá thì lô
       * ghi "Chỉnh ảnh" vẫn còn 2 video của lần báo trước, và thẻ Video ở màn quản lý
       * cộng cả số đó — sai mà nhìn bảng không thấy gì lạ. */
      const coAnh = hangMuc.includes('Chỉnh ảnh');
      const coVideo = hangMuc.includes('Edit video');

      canGhi.push({
        id: m.id || '',
        thuMuc: String(m.thuMuc || '').trim() || ttm.dat({ tour: tour.ten, loai, ngay, hdv }),
        khoa, ngay, tourId: tour.id, tour: tour.ten, loai, hdv, hangMuc, linkAnh, linkVideo,
        soAnh: coAnh ? (m.soAnh === '' || m.soAnh == null ? 0 : m.soAnh) : 0,
        soVideo: coVideo ? (m.soVideo === '' || m.soVideo == null ? 0 : m.soVideo) : 0,
        nguoiLamIds: [...nguoi],
        nhanXetAnh,
        ghiChu: m.ghiChu || b.ghiChu || '',
        /* Báo cáo lại một lô đã bị trả về "Cần sửa lại" thì phải quay về hàng đợi,
         * không thì người kiểm không biết là bạn ấy đã sửa xong. */
        trangThai: 'Chờ nghiệm thu',
      });
    }

    /* Ghi TUẦN TỰ, không Promise.all: ghiBaoCao() đọc lại cả bảng để tìm khoá trùng,
     * chạy song song thì hai mục mới cùng lúc đều thấy "chưa có" và đẻ hai dòng. */
    const ghi = [];
    for (const row of canGhi) ghi.push(await store.ghiBaoCao(row));

    const d2 = await store.tai(true);
    const dsBaoCao = ghi.map((g) => d2.baoCao.find((x) => x.id === g.id)).filter(Boolean);
    const nhom = nhomChat(d2);
    const nhoms = dsNhomChat(d2);

    let gui = { ok: false, loi: 'Không gửi (người dùng chọn không gửi).' };
    if (b.gui !== false && dsBaoCao.length) {
      /* MỘT tin cho cả lần báo cáo, không phải N tin: nhóm đọc một lần là biết cả
       * buổi làm được gì, khỏi cuộn qua mấy tin gần giống nhau. */
      const soan = tin.soan(dsBaoCao, {
        nguoiTen: nd ? nd.name : '',
        capNhat: dsBaoCao.length === 1 && !ghi[0].moi,
      });
      gui = await guiVeNhom({
        nhoms, card: soan.card, text: soan.text,
        khoa: 'bc-' + ghi.map((g) => g.id).join('-').slice(0, 30)
          + '-' + Date.now().toString(36).slice(-6),
        baoCaoIds: dsBaoCao.map((x) => x.id),
      });
    }

    const d3 = gui.ok ? await store.tai(true) : d2;
    return ok(res, {
      soMuc: ghi.length,
      soMoi: ghi.filter((g) => g.moi).length,
      ids: ghi.map((g) => g.id),
      nhom,
      baoCao: ghi.map((g) => d3.baoCao.find((x) => x.id === g.id)).filter(Boolean),
      gui: { ok: gui.ok, loi: gui.loi || '', canhBao: gui.canhBao || '',
        daGui: gui.daGui || [], truot: gui.truot || [] },
    });
  }

  /* Tra danh bạ Lark để chọn người chỉnh. Người đã từng làm luôn có sẵn (lấy từ
   * chính bảng Báo cáo) nên chế độ api — không tra được danh bạ — vẫn dùng được. */
  if (p === '/api/nhan-su') {
    const d = await store.tai();
    const q = (u.searchParams.get('q') || '').trim();
    const daLam = nguoiDaLam(d.baoCao);
    if (!q) return ok(res, { nguoi: daLam, tra: false });
    const kq = await lark.timNguoi(q);

    /* Lọc theo tên CHỈ áp cho danh sách người đã từng làm — Lark đã tự khớp rồi,
     * lọc lại là vứt đi kết quả đúng: Lark còn khớp theo email, biệt danh, phiên âm…
     * mà mấy thứ đó không nằm trong tên hiển thị. Trước đây lọc cả hai nên có lúc
     * Lark tìm ra người mà app vẫn báo "không thấy ai khớp". */
    const g = ttm.gon(q);
    const theoId = new Map(
      daLam.filter((x) => ttm.gon(x.ten).includes(g)).map((x) => [x.id, x])
    );
    kq.forEach((x) => { if (!theoId.has(x.id)) theoId.set(x.id, x); });

    return ok(res, { nguoi: [...theoId.values()], tra: kq.length > 0 });
  }

  /* Gửi lại tin cho một báo cáo đã có — dùng khi lần gửi đầu thất bại. */
  if (p === '/api/gui-lai' && method === 'POST') {
    const b = await readBody(req);
    const nd = await nguoiDung(req);
    const d = await store.tai();
    const bc = d.baoCao.find((x) => x.id === b.id);
    if (!bc) return fail(res, 404, 'Không thấy báo cáo này.');
    const nhoms = dsNhomChat(d);
    const soan = tin.soan(bc, { nguoiTen: nd ? nd.name : '', capNhat: bc.daGui });
    const gui = await guiVeNhom({
      nhoms, card: soan.card, text: soan.text,
      khoa: 'lai-' + bc.id + '-' + Date.now().toString(36).slice(-6), baoCaoId: bc.id,
    });
    return ok(res, { gui: { ok: gui.ok, loi: gui.loi || '', canhBao: gui.canhBao || '',
      daGui: gui.daGui || [], truot: gui.truot || [] } });
  }

  /* ---------------- chỉ quản lý ---------------- */

  if (p === '/api/quan-ly/nghiem-thu' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    if (!cfg.trangThai.includes(b.trangThai) || b.trangThai === 'Chờ nghiệm thu') {
      return fail(res, 400, 'Trạng thái nghiệm thu phải là "Đạt" hoặc "Cần sửa lại".');
    }
    if (b.trangThai === 'Cần sửa lại' && !String(b.nhanXet || '').trim()) {
      /* Bắt buộc có nhận xét khi trả về sửa: đó chính là chỗ mà lâu nay "xấu thì
       * yêu cầu chỉnh lại" không để lại dấu vết nào để đúc thành tiêu chí. */
      return fail(res, 400, 'Trả về sửa thì phải ghi rõ sửa gì.');
    }
    const nd = await nguoiDung(req);
    await store.nghiemThu(b.id, {
      trangThai: b.trangThai, nhanXet: b.nhanXet || '', nguoiId: nd ? nd.id : '',
    });
    const d = await store.tai(true);
    const bc = d.baoCao.find((x) => x.id === b.id);
    let gui = { ok: false, loi: 'Không gửi.', duong: '' };
    if (b.gui !== false && bc) {
      gui = await guiRiengNghiemThu(bc, { nguoiTen: nd ? nd.name : '', d });
    }
    return ok(res, { baoCao: bc,
      gui: { ok: gui.ok, loi: gui.loi || '', duong: gui.duong || '', nguoi: gui.nguoi || [] } });
  }

  if (p === '/api/quan-ly/nhom' && method === 'GET') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    return ok(res, { nhom: await lark.dsNhom() });
  }

  if (p === '/api/quan-ly/nhom' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);

    /* Nhận cả dạng cũ {id, ten} lẫn dạng mới {ds: [{id, ten}]} — bản giao diện cũ
     * còn nằm trong cache trình duyệt vẫn đổi được nhóm, không văng lỗi khó hiểu. */
    const vao = Array.isArray(b.ds) ? b.ds : (b.id ? [{ id: b.id, ten: b.ten }] : []);
    const sach = [];
    const daCo = new Set();
    for (const x of vao) {
      const id = String((x && x.id) || '');
      if (!/^oc_[A-Za-z0-9]+$/.test(id)) return fail(res, 400, 'chat_id phải dạng oc_…, đang nhận: ' + id);
      if (daCo.has(id)) continue;
      daCo.add(id);
      sach.push({ id, ten: String((x && x.ten) || id) });
    }
    if (!sach.length) return fail(res, 400, 'Chọn ít nhất một nhóm.');

    await store.ghiCaiDat('chat_ds', JSON.stringify(sach),
      'Các nhóm nhận báo cáo sản phẩm (JSON). Nhiều nhóm thì tin gửi vào tất cả.');
    /* Vẫn ghi cặp cũ: dòng đầu danh sách. Ai mở Base ra xem, hoặc bản code cũ bị
     * triển khai lại, cũng còn một nhóm đúng để gửi chứ không rơi về mặc định. */
    await store.ghiCaiDat('chat_id', sach[0].id, 'Nhóm chính (tương thích bản cũ)');
    await store.ghiCaiDat('chat_ten', sach[0].ten, 'Tên nhóm chính (chỉ để hiển thị)');

    const d = await store.tai(true);
    return ok(res, { nhom: nhomChat(d), ds: dsNhomChat(d) });
  }

  if (p === '/api/quan-ly/tour' && method === 'POST') {
    const loi = chanNeuKhongPhaiQuanLy(req); if (loi) throw loi;
    const b = await readBody(req);
    return ok(res, await store.ghiTour(b));
  }

  /* Chỉ số cho trang Tổng quan chung của Marketing Hub (xem hub/kpi.js). */
  if (p === '/api/tong-quan') {
    const d = await store.tai();
    const t = thamSo(u);
    const ds = loc(d.baoCao, t);
    const s = tongHop(ds);
    /* Lô bị trả về sửa NGOÀI khoảng lọc vẫn phải đếm: lọc theo tháng làm việc
     * của tháng trước biến mất khỏi màn quản lý — bài học từ 44 việc quá hạn của
     * app Bảng công việc. Hub hiện băng "Bộ lọc đang che N việc gấp" từ số này. */
    const ngoai = d.baoCao.filter((b) => b.trangThai === 'Cần sửa lại'
      && (!b.ngay || b.ngay < t.tu || b.ngay > t.den));

    /* Danh sách việc cần xử lý cho khối "Cần xử lý ngay" của hub. Gồm lô bị trả về
     * sửa (kể cả ngoài khoảng) và lô đã ghi Base mà chưa vào nhóm chat. */
    const canXuLy = [
      ...ds.filter((b) => b.trangThai === 'Cần sửa lại'), ...ngoai,
    ].map((b) => ({
      muc: 'gap',
      tieuDe: b.thuMuc + ' · cần sửa lại',
      phu: (b.nhanXet || 'chưa ghi nhận xét') + ' · '
        + (b.nguoiLam.map((u) => u.name).join(', ') || 'chưa ghi người'),
      the: [b.tour, b.loai].filter(Boolean),
    })).concat(ds.filter((b) => !b.daGui).map((b) => ({
      muc: 'vua',
      tieuDe: b.thuMuc + ' · chưa gửi nhóm',
      phu: 'đã ghi Base nhưng nhóm chat chưa nhận được tin',
      the: [b.tour, b.loai].filter(Boolean),
    })));

    return ok(res, {
      soBaoCao: s.soBaoCao, soAnh: s.soAnh, soVideo: s.soVideo,
      soNgayCoAnh: s.soNgayCoAnh, soNgayCoVideo: s.soNgayCoVideo,
      theoNguoi: s.theoNguoi,
      choNghiemThu: s.choNghiemThu, dat: s.dat, canSua: s.canSua, chuaGui: s.chuaGui,
      nguoi: s.theoNguoi.length, ngoaiKhoang: ngoai.length, canXuLy,
      tu: t.tu, den: t.den, nhom: nhomChat(d).ten, baseUrl: cfg.baseUrl,
    });
  }

  return fail(res, 404, 'Không có đường dẫn ' + p);
}

/* ---------------- vòng chạy ---------------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname.startsWith('/api/')) return await api(req, res, u);
    return serveStatic(req, res, u.pathname);
  } catch (e) {
    const code = e.code === 403 ? 403 : (e.code === 400 ? 400 : (e.code === 404 ? 404 : 500));
    if (code === 500) console.error('[server] ' + (e.stack || e.message));
    return fail(res, code, e.message || 'Lỗi không rõ');
  }
});

if (require.main === module) {
  server.listen(cfg.port, '127.0.0.1', () => {
    console.log(`App Chỉnh ảnh & Edit video: http://localhost:${cfg.port}  (chế độ ${cfg.mode})`);
    console.log('Base: ' + cfg.baseUrl);
  });
}

module.exports = { server, loc, tongHop, thamSo, nhomChat, dsNhomChat, guiVeNhom, nguoiDaLam };
