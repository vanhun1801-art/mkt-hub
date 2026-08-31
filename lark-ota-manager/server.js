'use strict';
/**
 * Server HTTP thuần Node (không dependency) cho app Booking OTA.
 *
 * Hai nhóm đường dẫn, hai mức tin cậy khác nhau:
 *   /api/*      — dashboard của nội bộ, tin header danh tính do lớp vỏ gửi;
 *   /webhook/*  — OTA gọi vào, KHÔNG có danh tính, phải có secret mới nhận.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');
const schema = require('./schema');
const store = require('./store');
const hangdoi = require('./hangdoi');
const TK = require('./thongke');
const nhanBooking = require('./nhan');
const mau = require('./mau');
const gia = require('./gia');
const danhmuc = require('./danhmuc');
const H = require('./chuanhoa');

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
      if (size > 4 * 1024 * 1024) { reject(new Error('Body quá lớn')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (_) {
        /* Có OTA gửi form-urlencoded thay vì JSON — nhận luôn, đỡ phải bắt đối tác
         * đổi cấu hình. Bộ trích sâu làm việc với object nào cũng được.
         * Chỉ nhận khi thực sự có cặp khoá=giá trị: một chuỗi rác không dấu "="
         * sẽ thành {"chuỗi rác": ""} và lọt qua thành booking trắng. */
        try {
          if (raw.includes('=')) {
            const o = {};
            new URLSearchParams(raw).forEach((v, k) => { if (String(v).trim()) o[k] = v; });
            if (Object.keys(o).length) return resolve(o);
          }
        } catch (_) {}
        reject(Object.assign(new Error('Body không phải JSON hợp lệ'), { code: 400 }));
      }
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

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return fail(res, 403, 'Từ chối');
  fs.readFile(file, (err, buf) => {
    if (err) return fail(res, 404, 'Không tìm thấy ' + rel);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}

/* ---------------- bộ lọc từ query ---------------- */
function queryOpts(u) {
  const list = (k) => {
    const v = u.searchParams.get(k);
    return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
  };
  return {
    from: u.searchParams.get('from') || '',
    to: u.searchParams.get('to') || '',
    moc: u.searchParams.get('moc') || 'ngayDi',
    kenh: list('kenh'),
    trangThai: list('trangThai'),
    canXuLy: u.searchParams.get('canXuLy') || '',
    // 'ngayDi' (mặc định — gần nhất trước) hoặc 'nhanLuc' (mới về hệ thống trước)
    sap: TK.KIEU_SAP.includes(u.searchParams.get('sap')) ? u.searchParams.get('sap') : 'ngayDi',
    chuaNhan: u.searchParams.get('chuaNhan') === '1',
    tim: u.searchParams.get('tim') || '',
    // nguồn người xem chọn: auto | base | hang-doi
    nguon: ['base', 'hang-doi'].includes(u.searchParams.get('nguon'))
      ? u.searchParams.get('nguon') : 'auto',
  };
}

/* ---------------- chế độ TRỰC TIẾP (SSE) ----------------
 * Màn vận hành phải thấy booking NGAY khi OTA gửi về, không phải ngồi bấm Làm mới.
 * Dùng SSE chứ không WebSocket vì:
 *   - luồng một chiều (server → client) là đủ: app chỉ cần nói "có thay đổi rồi";
 *   - đi qua proxy của lớp vỏ được (proxy pipe thẳng response không phải HTML);
 *   - shim của lớp vỏ đã vá sẵn window.EventSource nên URL tương đối vẫn đúng.
 *
 * Gói tin CHỈ báo "có thay đổi" + vài thông tin để hiện toast, KHÔNG đẩy dữ liệu
 * booking qua đây. Lý do: kênh này mở sẵn không đi qua bước kiểm quyền chi phí của
 * từng endpoint, đẩy số tiền vào đây là lách mất phân quyền. Client nghe được tín
 * hiệu rồi tự gọi /api/bookings — chỗ đó mới cắt tiền theo quyền.
 */
const TOI_DA_KET_NOI = 24;
const ketNoi = new Set();

function phatSuKien(loai, du) {
  if (!ketNoi.size) return;
  const goi = 'event: ' + loai + '\ndata: ' + JSON.stringify(du || {}) + '\n\n';
  for (const res of [...ketNoi]) {
    try { res.write(goi); } catch (_) { ketNoi.delete(res); }
  }
}

function moLuongSuKien(req, res) {
  if (ketNoi.size >= TOI_DA_KET_NOI) {
    return fail(res, 503, 'Quá nhiều kết nối trực tiếp đang mở, thử lại sau.');
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    // tắt đệm ở tầng proxy, nếu không gói tin bị giữ lại cho đủ buffer mới đẩy
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.write('event: mo\ndata: {"ok":true}\n\n');
  ketNoi.add(res);

  /* Nhịp tim 15s: proxy của lớp vỏ đặt timeout 30s theo mức KHÔNG hoạt động của
   * socket, im lặng quá lâu là nó cắt kết nối. */
  const tim = setInterval(() => {
    try { res.write(': tim\n\n'); } catch (_) { clearInterval(tim); ketNoi.delete(res); }
  }, 15000);

  const dong = () => { clearInterval(tim); ketNoi.delete(res); };
  req.on('close', dong);
  req.on('error', dong);
}

/* ---------------- webhook: xác thực ---------------- */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** So sánh chuỗi kiểu chống dò từng ký tự. */
function bangNhau(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length || !x.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/**
 * Ai được gọi webhook.
 *  - Có khai OTA_WEBHOOK_SECRET: phải khớp secret (query ?secret= hoặc header
 *    x-ota-secret / Authorization: Bearer). Đây là chế độ dùng khi deploy.
 *  - Chưa khai: CHỈ nhận từ 127.0.0.1, để trên máy cá nhân test được ngay mà
 *    không vô tình mở một endpoint ghi dữ liệu cho cả internet.
 */
function duocGoiWebhook(req) {
  if (cfg.webhookSecret) {
    const u = new URL(req.url, 'http://localhost');
    const auth = String(req.headers.authorization || '');
    const dua = u.searchParams.get('secret') ||
      req.headers['x-ota-secret'] ||
      (auth.startsWith('Bearer ') ? auth.slice(7) : '');
    return bangNhau(dua, cfg.webhookSecret)
      ? { ok: true }
      : { ok: false, ma: 401, ly: 'Secret không đúng. Gửi ?secret=… hoặc header x-ota-secret.' };
  }
  /* Sau lớp vỏ, request đến từ chính hub trên loopback; header x-forwarded-for do
   * client tự đặt được nên KHÔNG dùng để quyết định — chỉ tin địa chỉ socket. */
  const ip = (req.socket && req.socket.remoteAddress) || '';
  return LOOPBACK.has(ip)
    ? { ok: true }
    : {
        ok: false, ma: 403,
        ly: 'Chưa khai OTA_WEBHOOK_SECRET nên app chỉ nhận webhook từ chính máy này. ' +
            'Đặt biến OTA_WEBHOOK_SECRET rồi đưa secret đó cho OTA.',
      };
}

/* ---------------- router ---------------- */
async function api(req, res, u) {
  const p = u.pathname;
  const method = req.method;

  /* Luồng trực tiếp — giữ kết nối mở, KHÔNG được đi qua send()/ok() vì hai hàm đó
   * kết thúc response. */
  if (p === '/api/su-kien' && method === 'GET') return moLuongSuKien(req, res);

  /* ======================= webhook OTA ======================= */
  let m;
  if ((m = p.match(/^\/webhook\/([a-z0-9_-]+)\/?$/i))) {
    if (method !== 'POST') return fail(res, 405, 'Webhook chỉ nhận POST');
    const quyen = duocGoiWebhook(req);
    if (!quyen.ok) return fail(res, quyen.ma, quyen.ly);

    const payload = await readBody(req);
    const dryRun = u.searchParams.get('dryRun') === '1' || u.searchParams.get('dryrun') === '1';
    const kq = await nhanBooking.nhan(m[1].toLowerCase(), payload, { dryRun });

    /* Trả 200 cả khi chưa ghi được vào Base: booking đã nằm trong hàng đợi, và
     * 4xx/5xx sẽ khiến OTA gửi lại rồi bỏ. Chi tiết nằm trong `ghiChuHeThong`. */
    if (!dryRun) {
      phatSuKien('booking', {
        moi: kq.moi,
        kenh: kq.booking.kenh,
        maBooking: kq.booking.maBooking,
        tenKhach: kq.booking.tenKhach,
        ngayDi: kq.booking.ngayDi,
        luuVao: kq.luuVao,
      });
    }

    return ok(res, {
      nhan: true,
      moi: kq.moi,
      luuVao: kq.luuVao,
      maBooking: kq.booking.maBooking,
      canXuLy: kq.booking.canXuLyChuoi,
      ...(dryRun ? { booking: kq.booking, nguon: kq.nguon, luocDo: kq.luocDo } : {}),
      ...(kq.canhBao && kq.canhBao.length ? { canhBao: kq.canhBao } : {}),
      ...(kq.ghiChuHeThong ? { ghiChuHeThong: kq.ghiChuHeThong } : {}),
    });
  }

  /* ======================= dashboard ======================= */
  if (p === '/api/meta' && method === 'GET') {
    const q = quyenCua(req);
    const xin = ['base', 'hang-doi'].includes(u.searchParams.get('nguon'))
      ? u.searchParams.get('nguon') : 'auto';
    const [luoc, me] = await Promise.all([schema.doc(), nguoiDung(req)]);
    let d = null;
    try { d = await store.get({ nguon: xin }); }
    catch (e) { d = { rows: [], nguon: 'loi', loi: e.message, luc: Date.now() }; }
    /* Danh mục nạp kèm store.get() ở trên, nên tới đây bảng giá đã là bảng giá
     * trong Base. Đọc lại chỉ để in ra, không gọi thêm API nào. */
    let dm = { ota: [], tour: [], loi: 'chưa nối Base' };
    if (luoc.ok) { try { dm = await danhmuc.get(); } catch (e) { dm = { ota: [], tour: [], loi: e.message }; } }
    return ok(res, {
      me,
      quanLy: q.quanLy,
      perm: { chiPhi: q.chiPhi, duocSua: q.duocSua },
      nguon: d.nguon,
      xinNguon: xin,
      epNguon: !!d.epNguon,
      loi: d.loi || '',
      luc: d.luc,
      soBooking: d.rows.length,
      chuaDay: hangdoi.demChuaDay(),
      baseUrl: cfg.baseUrl,
      luocDo: {
        ok: luoc.ok, noiBase: luoc.noiBase, tableId: luoc.tableId, tableTen: luoc.tableTen || '',
        thieu: luoc.thieu, thieuBatBuoc: luoc.thieuBatBuoc,
        thieuTuyChon: luoc.thieuTuyChon || [], thieuCongThuc: luoc.thieuCongThuc || [],
        loi: luoc.loi,
        huongDan: schema.huongDan(luoc),
      },
      /* Cột nào có thật trong Base — giao diện dùng để ẨN nút thay vì hiện ra rồi
       * báo lỗi. Quan trọng nhất là `daNhan`: bảng Bookings chưa có cột đó thì
       * nút "Nhận booking" không được hiện, cả ở đây lẫn trên Marketing Hub. */
      coCot: Object.fromEntries(Object.keys(cfg.cot).map((k) => [k, !!(luoc.fields || {})[k]])),
      danhMuc: {
        loi: dm.loi || '',
        ota: dm.ota.map((x) => ({ ten: x.ten, ma: x.ma, hoaHong: x.hoaHong, tienTe: x.tienTe })),
        tour: dm.tour.map((x) => ({ ten: x.ten, ma: x.ma, nguoiLon: x.nguoiLon, treEm: x.treEm,
          dangBan: x.dangBan })),
        tenBangOta: cfg.tableOtaName,
        tenBangTour: cfg.tableTourName,
      },
      nguonGia: gia.nguonGia(),
      kenh: cfg.kenh.map((k) => ({ id: k.id, ten: k.ten, hoaHong: k.hoaHong })),
      // Bảng giá NET là thông tin thương mại — chỉ người có quyền chi phí thấy
      bangGia: q.chiPhi ? gia.tomTat() : [],
      trangThai: cfg.trangThai,
      trangThaiDong: cfg.trangThaiDong,
      tyGia: cfg.tyGia,
      choSua: nhanBooking.CHO_SUA,
      webhook: {
        coSecret: !!cfg.webhookSecret,
        duong: '/webhook/<kênh>',
        duongHub: '/ota/webhook/<kênh>',
        kenh: cfg.kenh.map((k) => k.id),
      },
      homNay: H.homNay(),
    });
  }

  if (p === '/api/bookings' && method === 'GET') {
    const qn = queryOpts(u);
    const perm = quyenCua(req);
    const d = await store.get({ nguon: qn.nguon });
    const ds = TK.sapXep(TK.loc(d.rows, qn), qn.sap);
    const coDaNhan = !!((d.luoc && d.luoc.fields && d.luoc.fields.daNhan) || d.nguon === 'hang-doi');
    const vh = TK.vanHanh(d.rows, { coDaNhan });
    if (!perm.chiPhi) {
      // thẻ số của màn vận hành không có ô tiền nào, chỉ cần che các dòng bản ghi
      Object.keys(vh.nhom).forEach((k) => { vh.nhom[k] = cheTienDs(vh.nhom[k]); });
    }
    return ok(res, {
      nguon: d.nguon, xinNguon: d.xin, epNguon: !!d.epNguon, luc: d.luc, loi: d.loi || '',
      tongTatCa: d.rows.length,
      sap: qn.sap,
      perm: { chiPhi: perm.chiPhi, duocSua: perm.duocSua },
      // giao diện (và Marketing Hub) dùng cờ này để ẩn nút "Nhận booking"
      coDaNhan,
      /* Số booking còn kẹt ở hàng đợi. Marketing Hub đọc để kêu lên khi app ĐỌC
       * được Base nhưng GHI không được — lúc đó mọi số khác vẫn đúng, không có
       * gì trông như hỏng. */
      chuaDay: hangdoi.demChuaDay(),
      tong: perm.chiPhi ? TK.gop(ds) : cheTienGop(TK.gop(ds)),
      vanHanh: vh,
      rows: (perm.chiPhi ? ds : cheTienDs(ds)).slice(0, 500),
      catBot: Math.max(0, ds.length - 500),
    });
  }

  if (p === '/api/thongke' && method === 'GET') {
    const qn = queryOpts(u);
    const perm = quyenCua(req);
    /* Toàn bộ màn Thống kê là số tiền — không có quyền chi phí thì chặn thẳng ở
     * server, đừng trả một bản rỗng rồi để giao diện tự hiểu. */
    if (!perm.chiPhi) {
      return fail(res, 403,
        'Bạn chưa được cấp quyền xem doanh thu. Quản lý cấp trong bảng "Phân quyền app" của Marketing Hub.',
        { code: 'CHI_PHI_ONLY' });
    }
    const d = await store.get({ nguon: qn.nguon });
    return ok(res, { nguon: d.nguon, luc: d.luc, ...TK.thongKe(d.rows, qn) });
  }

  if ((m = p.match(/^\/api\/booking\/([\w-]+)$/))) {
    const perm = quyenCua(req);
    if (method === 'GET') {
      const d = await store.get();
      const b = d.rows.find((r) => r.id === m[1]);
      if (!b) return fail(res, 404, 'Không tìm thấy booking ' + m[1]);
      return ok(res, perm.chiPhi ? b : cheTien(b));
    }
    if (method === 'PATCH') {
      if (!perm.duocSua) {
        return fail(res, 403,
          'Bạn chỉ được xem, không được sửa booking. Quản lý cấp quyền trong bảng "Phân quyền app".',
          { code: 'CHI_XEM' });
      }
      const body = await readBody(req);
      const b = await nhanBooking.sua(m[1], body);
      // người khác đang mở dashboard ở chế độ trực tiếp cũng thấy thay đổi này
      phatSuKien('sua', { maBooking: b.maBooking, boi: (await nguoiDung(req) || {}).name || '' });
      return ok(res, perm.chiPhi ? b : cheTien(b));
    }
  }

  if (p === '/api/refresh' && method === 'POST') {
    store.invalidate();
    const d = await store.get({ force: true, nguon: queryOpts(u).nguon });
    return ok(res, { luc: d.luc, nguon: d.nguon, soBooking: d.rows.length, loi: d.loi || '' });
  }

  /* ---- thiết lập base ---- */
  if (p === '/api/luoc-do' && method === 'POST') {
    if (!quyenCua(req).quanLy) return fail(res, 403, 'Chỉ quản lý dò lại lược đồ Base.', { code: 'MANAGER_ONLY' });
    schema.xoaCache();
    gia.xoaCache();
    danhmuc.xoaCache();
    const luoc = await schema.doc({ force: true });
    store.invalidate();
    return ok(res, {
      ok: luoc.ok, tableId: luoc.tableId, tableTen: luoc.tableTen || '',
      thieu: luoc.thieu, thieuBatBuoc: luoc.thieuBatBuoc, loi: luoc.loi,
      huongDan: schema.huongDan(luoc),
    });
  }

  if (p === '/api/day-hang-doi' && method === 'POST') {
    if (!quyenCua(req).quanLy) return fail(res, 403, 'Chỉ quản lý đẩy hàng đợi vào Base.', { code: 'MANAGER_ONLY' });
    return ok(res, await nhanBooking.dayHangDoi());
  }

  /* ---- soi mapping của một kênh bằng payload mẫu (không ghi gì) ---- */
  if (p === '/api/thu-mapping' && method === 'POST') {
    const body = await readBody(req);
    const kenhId = String(body.kenh || '').toLowerCase();
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : mau.mau(kenhId);
    const kq = await nhanBooking.nhan(kenhId, payload, { dryRun: true });
    /* `noiDanhMuc` là thứ đáng xem nhất khi soi mapping một kênh mới: booking có
     * nối được sang Danh mục OTA / Danh mục Tour không. Không nối được thì dòng
     * vào Base sẽ ra 0đ mà chẳng báo lỗi gì. */
    return ok(res, { kenh: kenhId, payload, booking: kq.booking, nguon: kq.nguon,
      canhBao: kq.canhBao, noiDanhMuc: kq.noiDanhMuc || null });
  }

  /* ---- tạo booking mẫu để xem dashboard chạy ----
   * Chặn khi đang nối base thật, trừ khi cố ý đặt OTA_DEMO=1: đổ 7 dòng rác vào
   * base vận hành thì dọn rất mệt. */
  if (p === '/api/mau' && method === 'POST') {
    if (!quyenCua(req).quanLy) return fail(res, 403, 'Chỉ quản lý tạo booking mẫu.', { code: 'MANAGER_ONLY' });
    const luoc = await schema.doc();
    if (luoc.ok && process.env.OTA_DEMO !== '1') {
      return fail(res, 403,
        'App đang ghi vào Base thật nên không tạo booking mẫu. Cần thử thì đặt OTA_DEMO=1 rồi ' +
        'nhớ xoá các dòng có mã bắt đầu bằng tên kênh + số ngẫu nhiên.');
    }
    const ra = [];
    for (const { kenhId, payload } of mau.tatCa()) {
      const kq = await nhanBooking.nhan(kenhId, payload, {});
      ra.push({ kenh: kenhId, maBooking: kq.booking.maBooking, canXuLy: kq.booking.canXuLyChuoi });
    }
    store.invalidate();
    return ok(res, { tao: ra.length, rows: ra });
  }

  /* ---- xuất CSV ---- */
  if (p === '/api/export.csv' && method === 'GET') {
    const q = queryOpts(u);
    const perm = quyenCua(req);
    const d = await store.get({ nguon: q.nguon });
    const loc = TK.sapXep(TK.loc(d.rows, q), q.sap);
    const rows = perm.chiPhi ? loc : cheTienDs(loc);
    const cotTien = ['Sản phẩm (bảng giá)', 'Tổng tiền', 'Hoa hồng', 'Thực nhận', 'Chênh lệch bảng giá'];
    const head = ['Kênh OTA', 'Mã booking', 'Tên khách', 'SĐT', 'Email', 'Ngày đặt', 'Ngày đi',
      'Tour', 'Người lớn', 'Trẻ em', 'Tổng khách', 'Điểm đón', 'Giờ đón', 'Ghi chú',
      'Ngôn ngữ/QT', ...(perm.chiPhi ? cotTien : []), 'Trạng thái', 'Nhận lúc',
      'Cần xử lý', 'Đã nhận'];
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = [head.join(',')].concat(rows.map((r) => [
      r.kenh, r.maBooking, r.tenKhach, r.sdt, r.email, r.ngayDat, r.ngayDi, r.tour,
      r.nguoiLon, r.treEm, r.tongKhach, r.diemDon, r.gioDon, r.ghiChu, r.ngonNgu,
      ...(perm.chiPhi ? [r.sanPham, r.tongTien, r.hoaHong, r.thucNhan, r.lechBangGia] : []),
      r.trangThai,
      r.nhanLuc ? new Date(r.nhanLuc).toISOString().slice(0, 19).replace('T', ' ') : '',
      r.canXuLyChuoi, r.daNhan ? 'x' : '',
    ].map(esc).join(','))).join('\r\n');
    return send(res, 200, '﻿' + csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="booking-ota.csv"',
    });
  }

  if (p === '/healthz') return ok(res, { ok: true, nguon: (await schema.doc()).ok ? 'base' : 'hang-doi' });

  return fail(res, 404, 'Không có API ' + p);
}

/* ---------------- danh tính ---------------- */
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

/** Máy cá nhân thì người ngồi trước máy là quản lý; server chung thì hub quyết. */
function laQuanLy(req) {
  if (cfg.mode !== 'api') return true;
  if (process.env.HUB_TRUST_HEADER === '0') return false;
  return req.headers['x-hub-user-manager'] === '1';
}

/* ---------------- phân quyền ----------------
 * Tuỳ chọn lớp vỏ cấp riêng cho từng nhân sự (bảng "Phân quyền app" của hub).
 * Chỉ tin header vì app chỉ nghe 127.0.0.1; tắt bằng HUB_TRUST_HEADER=0.
 *
 * `chiPhi` ở app này quan trọng hơn các app khác: nó che CẢ BẢNG GIÁ NET. Giá net
 * theo hợp đồng với OTA là thông tin thương mại — hướng dẫn viên cần điểm đón và
 * số khách để chạy tour, không cần biết công ty ăn bao nhiêu một đầu khách.
 */
function quyenTuHeader(req) {
  if (process.env.HUB_TRUST_HEADER === '0') return {};
  return {
    /* Chạy đứng một mình (không qua lớp vỏ) thì KHÔNG áp phân quyền của hub —
     * nếu không, mở app trực tiếp trên máy là tự nhiên mất quyền xem tiền. */
    tuHub: !!req.headers['x-hub-user-id'],
    toanBo: req.headers['x-hub-perm-toan-bo'] === '1',
    khongTao: req.headers['x-hub-perm-khong-tao'] === '1',
    chiPhi: req.headers['x-hub-perm-chi-phi'] === '1',
  };
}

/** Quyền của một request: quản lý thì mở hết. */
function quyenCua(req) {
  const q = quyenTuHeader(req);
  const ql = laQuanLy(req);
  return {
    quanLy: ql,
    // tiền: mặc định MỞ khi không qua lớp vỏ; qua lớp vỏ thì theo bảng phân quyền
    chiPhi: ql || (q.tuHub ? q.chiPhi === true : true),
    duocSua: ql || q.khongTao !== true,
  };
}

/* Những trường TIỀN bị cắt khỏi phản hồi khi người xem không có quyền chi phí.
 * Cắt Ở SERVER, không phải chỉ ẩn ở giao diện — ẩn ở giao diện thì mở DevTools
 * hay gọi thẳng /api/bookings là thấy hết. */
const TRUONG_TIEN = ['tongTien', 'hoaHong', 'thucNhan', 'lechBangGia',
  'hoaHongOta', 'thucNhanOta', 'sanPham', 'sanPhamId', 'nguonThucNhan', 'hoaHongUocTinh'];

/** Cờ "cần xử lý" nào có chứa số tiền — che tiền thì phải che cả những cờ này. */
const CO_TIEN = /THIẾU|cao hơn bảng giá|Hoa hồng|Doanh thu|bảng giá|quy đổi/i;

function cheTien(b) {
  const ra = { ...b };
  TRUONG_TIEN.forEach((k) => { delete ra[k]; });
  ra.canXuLy = (b.canXuLy || []).filter((c) => !CO_TIEN.test(c.nhan));
  if (!ra.canXuLy.length) ra.canXuLy = [{ muc: 'ok', nhan: b.dong ? '— ' + b.trangThai : '✅ Đủ thông tin' }];
  ra.canXuLyChuoi = ra.canXuLy.map((c) => c.nhan).join(' · ');
  ra.muc = ra.canXuLy.some((c) => c.muc === 'cao') ? 'cao'
    : ra.canXuLy.some((c) => c.muc === 'vua') ? 'vua' : 'ok';
  return ra;
}

const cheTienDs = (rows) => rows.map(cheTien);

/** Bỏ mọi ô tiền khỏi khối cộng dồn. */
function cheTienGop(g) {
  const ra = { ...g };
  ['tongTien', 'hoaHong', 'thucNhan', 'tienHoan', 'tbBooking', 'tbKhach',
    'tyLeHoaHong', 'tienLech', 'lechBangGia', 'hoaHongUocTinh', 'theoBangGia',
    'chuaMapSanPham', 'khongCoDoanhThu', 'bookingVnd', 'ngoaiTe', 'dsNgoaiTe']
    .forEach((k) => { delete ra[k]; });
  return ra;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (!u.pathname.startsWith('/api/') && !u.pathname.startsWith('/webhook/') && u.pathname !== '/healthz') {
    return serveStatic(req, res, u.pathname);
  }
  api(req, res, u).catch((err) => {
    const code = err.code && Number.isInteger(err.code) ? err.code : 500;
    console.error('[API]', u.pathname, '->', err.message);
    fail(res, code >= 400 && code < 600 ? code : 500, err.message || 'Lỗi không xác định');
  });
});

/* ---------------- cổng nghe ----------------
 * MẶC ĐỊNH CHỈ NGHE 127.0.0.1 — giống ba app kia, vì app này cũng TIN header
 * danh tính do lớp vỏ gửi. Mở ra mạng ngoài thì việc tin header tự tắt.
 */
const BIND = process.env.BIND_HOST || '127.0.0.1';
const LB = ['127.0.0.1', '::1', 'localhost'];
if (!LB.includes(BIND) && process.env.HUB_TRUST_HEADER !== '0') {
  process.env.HUB_TRUST_HEADER = '0';
  console.warn('\n  [bảo mật] BIND_HOST=' + BIND + ' mở cổng ra mạng ngoài, nên đã TẮT\n' +
    '  việc tin header danh tính của lớp vỏ. Chạy dưới Marketing Hub thì bỏ BIND_HOST.\n');
}

/* Tắt server thì đóng hết luồng trực tiếp, đừng để client treo chờ vô hạn. */
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => {
  for (const res of [...ketNoi]) { try { res.end(); } catch (_) {} }
  ketNoi.clear();
  process.exit(0);
}));

server.listen(cfg.port, BIND, async () => {
  console.log('\n  Booking OTA — Rooty Trip');
  console.log('  http://localhost:' + cfg.port);
  if (!cfg.webhookSecret) {
    console.log('  [webhook] chưa khai OTA_WEBHOOK_SECRET — chỉ nhận webhook từ 127.0.0.1');
  }
  try {
    const luoc = await schema.doc();
    if (luoc.ok) {
      console.log('  Base: ' + cfg.baseUrl + '  (bảng ' + luoc.tableId + ')');
      const d = await store.get();
      console.log('  Đã nạp ' + d.rows.length + ' booking từ Base');
    } else {
      console.log('  Chưa nối Base: ' + luoc.loi);
      console.log('  Booking nhận được đang giữ ở hàng đợi: ' + hangdoi.demChuaDay() + ' dòng');
    }
  } catch (e) { console.error('  Không đọc được lược đồ:', e.message); }
});
