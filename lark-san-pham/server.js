'use strict';
/**
 * ============================================================================
 * App "Thông tin sản phẩm" — tra cứu sản phẩm của phòng Marketing
 * ============================================================================
 * Chạy: node server.js  →  http://localhost:5184
 *
 * Thay ba file Google Sheet rời rạc (file sản phẩm MKT, file sales đổ qua, file
 * gửi đối tác) bằng một chỗ đọc duy nhất: sản phẩm nào đang đẩy, sản phẩm nào
 * chạy hằng ngày, cái nào sắp hết hạn, giá công bố và USP ra sao.
 *
 * HAI VAI:
 *   · Nhân sự — chỉ ĐỌC. Mọi đường ghi trả 403, không chỉ ẩn nút.
 *   · Quản lý — sửa thẳng chín cột phòng Marketing tự quyết (ưu tiên, trạng
 *     thái, giá công bố, hiệu lực, ưu đãi, lưu ý), từng dòng hoặc hàng loạt.
 *     Danh sách cột khai ở config.suaDuoc, kiểm giá trị ở doiTruong().
 *
 * Nội dung dài (USP, lịch trình, dịch vụ bao gồm, chính sách) CỐ Ý không sửa
 * được ở đây: đó là chỗ Kinh doanh và Marketing cùng nhìn trên Lark Base, dựng
 * thêm một màn nhập liệu chỉ tạo ra nguồn sự thật thứ hai.
 *
 * Chỉ nghe 127.0.0.1: app vào thẳng Base của phòng, không có lý do mở ra mạng
 * ngoài. Trên Render thì đặt BIND=0.0.0.0 và chạy sau cổng đăng nhập của hub.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const kho = require('./kho');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

const BIND = process.env.BIND || '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');
const NGAY = 86400000;

/* ---------------- trả lời ---------------- */

function gui(res, ma, than, headers = {}) {
  const buf = Buffer.isBuffer(than) ? than : Buffer.from(String(than), 'utf8');
  res.writeHead(ma, Object.assign({ 'Content-Length': buf.length }, headers));
  res.end(buf);
}

const json = (res, o, ma = 200) =>
  gui(res, ma, JSON.stringify(o), { 'Content-Type': 'application/json; charset=utf-8' });

const loi = (res, ma, thong) => json(res, { error: thong }, ma);

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

/* ---------------- ai đang gọi ---------------- */

let demToi = { luc: 0, nguoi: null };

/**
 * Danh tính người gọi — cùng giao kèo với tám app kia.
 *
 * Qua hub: hub đã quyết xong ai là ai và ai là quản lý, gửi xuống bằng header.
 * App con KHÔNG tự quyết lại. Nhận biết "đến từ hub" bằng SỰ CÓ MẶT của header
 * chứ không bằng giá trị — một request từ hub mà hụt danh tính phải là người lạ,
 * không được rơi xuống nhánh chạy-một-mình rồi tự cấp quyền quản lý.
 */
async function aiGoi(req) {
  const h = req.headers || {};
  const de = (v) => { try { return decodeURIComponent(v || ''); } catch (_) { return v || ''; } };
  if (['x-hub-user-id', 'x-hub-user-email', 'x-hub-user-name'].some((k) => k in h)) {
    return {
      id: h['x-hub-user-id'] || '',
      ten: de(h['x-hub-user-name']) || h['x-hub-user-id'] || '',
      email: de(h['x-hub-user-email']),
      quanLy: h['x-hub-user-manager'] === '1',
      quaHub: true,
    };
  }
  if (Date.now() - demToi.luc < 60000 && demToi.nguoi) return demToi.nguoi;
  let u = null;
  try { u = await lark.whoami(); } catch (_) { u = null; }
  const n = {
    id: (u && u.id) || '',
    ten: (u && u.name) || 'Chưa đăng nhập',
    email: '',
    quanLy: true,
    quaHub: false,
  };
  demToi = { luc: Date.now(), nguoi: n };
  return n;
}

/* ---------------- tệp tĩnh ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** Số bản = mốc sửa gần nhất trong public. Quét cả thư mục, không chép tay. */
const VER = (() => {
  let t = 0;
  try {
    for (const f of fs.readdirSync(PUBLIC)) {
      try {
        const st = fs.statSync(path.join(PUBLIC, f));
        if (st.isFile()) t = Math.max(t, st.mtimeMs);
      } catch (_) {}
    }
  } catch (_) {}
  return String(Math.round(t / 1000) || 1);
})();

function tinh(res, duong, truyVan) {
  const p = duong === '/' ? '/index.html' : duong;
  const f = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
    return gui(res, 404, 'Không có ' + p, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  let body = fs.readFileSync(f);
  const trangChu = path.basename(f) === 'index.html';
  if (trangChu) body = Buffer.from(body.toString('utf8').split('v=BUILD').join('v=' + VER), 'utf8');
  /* Trang chủ giữ số bản của mọi file khác nên nó không được nằm trong cache.
     File có kèm số bản thì cache thoải mái — đổi file là đổi luôn địa chỉ. */
  gui(res, 200, body, {
    'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
    'Cache-Control': !trangChu && /[?&]v=/.test(truyVan || '')
      ? 'public, max-age=31536000' : 'no-store',
  });
}

/* ---------------- thẻ tổng quan ---------------- */

const dem = (ds, f) => ds.reduce((n, p) => n + (f(p) ? 1 : 0), 0);

/**
 * Bộ số cho trang "Tổng quan chung" của hub — và cũng là dải thẻ đầu app.
 *
 * Định nghĩa chỉ số nằm ở ĐÂY, không ở hub: hub chỉ bày ra. Cùng lối với tám
 * base kia (xem lark-mkt-hub/kpi.js → tuAppTuCong).
 *
 * Base này KHÔNG có trục thời gian để lọc: một sản phẩm không "thuộc về" tháng
 * nào. Nên khoảng lọc của hub bị bỏ qua có chủ ý, và `khoang` trả về câu nói rõ
 * điều đó thay vì im lặng để người xem tưởng số đã được lọc.
 */
function tongQuan(ds) {
  const hetHan = kho.sapHetHan(ds);
  const thieu = kho.canBoSung(ds);
  const uuDai = kho.uuDaiSapHet(ds);
  const dangBan = dem(ds, (p) => p.trangThai === 'Đang kinh doanh');

  const sapRaMat = dem(ds, (p) => /Sắp ra mắt/.test(p.trangThai));

  const the = [
    { chinh: true, nhan: 'Sản phẩm đang bán', so: dangBan, dinhDang: 'so',
      ghi: ds.length + ' dòng trong Base' },
    { nhan: 'Ưu tiên đẩy', so: dem(ds, (p) => /Ưu tiên đẩy/.test(p.uuTien)), dinhDang: 'so' },
    { nhan: 'Chạy hằng ngày', so: dem(ds, (p) => /Chạy hằng ngày/.test(p.uuTien)), dinhDang: 'so' },
    { nhan: 'Sắp ra mắt', so: sapRaMat, dinhDang: 'so' },
    { nhan: 'Sắp / đã hết hạn', so: hetHan.length, dinhDang: 'so',
      muc: hetHan.length ? 'gap' : 'ok' },
    { nhan: 'Ưu đãi sắp hết', so: uuDai.length, dinhDang: 'so',
      muc: uuDai.length ? 'vua' : 'ok' },
    { nhan: 'Hồ sơ còn thiếu', so: thieu.length, dinhDang: 'so',
      muc: thieu.length ? 'vua' : 'ok' },
  ];

  /* Xếp theo mức gấp rồi mới tới số ngày còn lại: một sản phẩm đã hết hạn mà
     nằm dưới một sản phẩm còn 29 ngày thì danh sách này vô nghĩa. */
  const canXuLy = [
    ...hetHan.map((p) => ({
      id: p.id,
      tieuDe: (p.ma ? p.ma + ' — ' : '') + p.ten,
      phu: p.tinhTrang + (p.conLai != null ? ' · còn ' + p.conLai + ' ngày' : '') +
        (p.hieuLucDen ? ' (đến ' + veNgay(p.hieuLucDen) + ')' : ''),
      the: [p.nhom].filter(Boolean),
      muc: /Đã hết hạn/.test(p.tinhTrang) ? 'gap' : 'vua',
      _sap: /Đã hết hạn/.test(p.tinhTrang) ? -1 : (p.conLai == null ? 999 : p.conLai),
    })),
    ...uuDai.map((c) => ({
      tieuDe: 'Ưu đãi hết hạn: ' + c.ten,
      phu: 'đến ' + veNgay(c.den) + ' · ' + (c.sanPham.slice(0, 4).join(', ') || 'toàn bộ sản phẩm'),
      the: ['Khuyến mãi'],
      muc: 'vua',
      _sap: Math.max(0, Math.round((c.den - Date.now()) / NGAY)),
    })),
    ...thieu.map((p) => ({
      id: p.id,
      tieuDe: (p.ma ? p.ma + ' — ' : '') + p.ten,
      phu: 'hồ sơ thiếu: ' + p.thieu,
      the: [p.nhom].filter(Boolean),
      muc: 'thap',
      _sap: 500,
    })),
  ].sort((a, b) => a._sap - b._sap).map(({ _sap, ...v }) => v);

  return {
    the,
    canXuLy,
    canXuLyTong: canXuLy.length,
    tong: ds.length,
    /* Hub luôn gửi khoảng lọc xuống; nói thẳng là base này không theo thời gian
       để không ai đọc nhầm con số. */
    khoang: 'không lọc theo thời gian',
  };
}

/**
 * Ngày theo giờ VN, không theo giờ máy chủ.
 *
 * Render chạy UTC. Base lưu 30/09/2026 00:00 (+07) thành 29/09 17:00 UTC, nên
 * `new Date(t).getDate()` trên Render ra 29 — hạn nào cũng bị lùi một ngày và
 * cảnh báo "hết hạn" bắn sớm hơn thực tế đúng một hôm. Cộng +07 rồi đọc bằng
 * getUTC* là cách cả hub đang dùng (xem lark-mkt-hub/gio-vn.js).
 */
const veNgay = (t) => {
  if (!t) return '';
  const d = new Date(t + 7 * 3600000);
  const hai = (n) => String(n).padStart(2, '0');
  return hai(d.getUTCDate()) + '/' + hai(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
};

/* ---------------- nhật ký ghi ---------------- */

/**
 * In ra MỘT dòng cho mỗi lần ghi xuống Base.
 *
 * Không phải để gỡ lỗi tạm: app này sửa một Base cả phòng dùng chung, và sáng
 * hôm sau mà thấy cột Ưu tiên khác hôm qua thì câu hỏi đầu tiên luôn là "ai
 * đổi, từ đâu". Ghi kèm `referer` vì nó phân biệt được thao tác thật trên giao
 * diện với một lời gọi lạc từ chỗ khác.
 */
function nhatKyGhi(toi, req, kieu, id, truong, giaTri) {
  const v = giaTri === null ? '(xoá)' : String(giaTri).slice(0, 60);
  console.log('[GHI]', kieu, id, truong, '=', v,
    '| ai:', toi.ten || '?', toi.quaHub ? '(qua hub)' : '(máy)',
    '| từ:', req.headers.referer || '-');
}

/* ---------------- kiểm giá trị trước khi ghi ---------------- */

/**
 * Đổi `{truong, giaTri}` từ client thành ô hợp lệ của Base, hoặc ném lỗi.
 *
 * Cả hai đường ghi (một dòng và hàng loạt) đều đi qua đây. Gom về một chỗ vì
 * đây là nơi duy nhất chặn được ba thứ: cột không cho sửa, lựa chọn lạ làm Base
 * tự đẻ option rác, và ngày/số viết sai kiểu.
 *
 * Ô trống luôn ghi `null` chứ không phải chuỗi rỗng — Base hiểu chuỗi rỗng ở
 * cột số/ngày là một giá trị, không phải "xoá".
 */
function doiTruong(truong, giaTri) {
  const kh = cfg.suaDuoc[truong];
  if (!kh) throw new Error('Cột này không sửa được từ app: ' + truong + '. Sửa trong Lark Base.');

  if (kh.kieu === 'select') {
    const v = String(giaTri == null ? '' : giaTri).trim();
    if (v && !cfg.chon[kh.chon].includes(v)) {
      throw new Error(kh.nhan + ' không hợp lệ: ' + v);
    }
    return { field: kh.field, giaTri: v || null };
  }

  if (kh.kieu === 'so') {
    if (giaTri === '' || giaTri == null) return { field: kh.field, giaTri: null };
    const n = Number(giaTri);
    if (!Number.isFinite(n) || n < 0) throw new Error(kh.nhan + ' phải là số không âm.');
    return { field: kh.field, giaTri: n };
  }

  if (kh.kieu === 'ngay') {
    const v = String(giaTri == null ? '' : giaTri).trim();
    if (!v) return { field: kh.field, giaTri: null };
    /* Ô date của trình duyệt trả YYYY-MM-DD. Ghi kèm 00:00:00 và để Base tự
       hiểu theo múi giờ của nó (Asia/Saigon) — đừng tự đổi sang epoch, đó là
       chỗ đã làm lệch ngày ở mấy app trước. */
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(kh.nhan + ' phải dạng YYYY-MM-DD.');
    return { field: kh.field, giaTri: v + ' 00:00:00' };
  }

  const v = String(giaTri == null ? '' : giaTri);
  if (v.length > 5000) throw new Error(kh.nhan + ' quá dài (trên 5000 ký tự).');
  return { field: kh.field, giaTri: v.trim() || null };
}

/* ---------------- API ---------------- */

async function api(req, res, u) {
  const p = u.pathname.replace(/^\/api/, '') || '/';
  const q = u.searchParams;
  const toi = await aiGoi(req);

  if (p === '/khoi-tao') {
    const { ds, luc } = await kho.tatCa();
    /* Lựa chọn cho bộ lọc lấy từ DỮ LIỆU THẬT, không từ danh sách cứng: anh Hùng
       thêm một tệp khách mới trên Base là bộ lọc có ngay, không phải sửa mã. */
    const gom = (f) => [...new Set(ds.flatMap(f).filter(Boolean))];
    return json(res, {
      me: { ten: toi.ten, email: toi.email, quanLy: toi.quanLy },
      baseUrl: cfg.baseUrl,
      baseUrlBoSung: cfg.baseUrl + '?table=' + cfg.spTableId + '&view=' + cfg.viewCanBoSung,
      capNhat: luc,
      chon: {
        nhom: cfg.chon.nhom.filter((x) => ds.some((p2) => p2.nhom === x))
          .concat(gom((p2) => [p2.nhom]).filter((x) => !cfg.chon.nhom.includes(x))),
        uuTien: cfg.chon.uuTien,
        trangThai: cfg.chon.trangThai,
        tepKhach: gom((p2) => p2.tepKhach).sort((a, b) => a.localeCompare(b, 'vi')),
        traiNghiem: gom((p2) => p2.traiNghiem).sort((a, b) => a.localeCompare(b, 'vi')),
      },
      /* Giao diện hỏi server "cột nào sửa được" thay vì tự giữ một danh sách
         riêng — hai danh sách lệch nhau thì nút hiện ra mà bấm vào báo 400. */
      suaDuoc: cfg.suaDuoc,
    });
  }

  if (p === '/san-pham') {
    /* `mediaChung` (thư mục tổng, bảng giá đối tác, wiki CSBH) CỐ Ý không gửi
       lên: anh Hùng bỏ tab Tài liệu chung để nhường chỗ cho khu Quản lý. Các
       link đó vẫn nằm nguyên trong bảng "Kho media & tài liệu" trên Base, và
       media gắn theo từng sản phẩm thì vẫn hiện trong ngăn chi tiết. */
    const { ds, luc } = await kho.tatCa({ moi: q.get('moi') === '1' });
    return json(res, { ds, capNhat: luc, tomTat: tongQuan(ds) });
  }

  if (p === '/tong-quan') {
    const { ds } = await kho.tatCa();
    return json(res, tongQuan(ds));
  }

  /* Sửa một cột của một sản phẩm — cửa GHI duy nhất của app. */
  const mSua = /^\/san-pham\/(rec[\w]+)$/.exec(p);
  if (mSua && req.method === 'POST') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý sửa được thông tin sản phẩm.');
    const than = await docThan(req);
    let o;
    try { o = doiTruong(than.truong, than.giaTri); } catch (e) { return loi(res, 400, e.message); }
    nhatKyGhi(toi, req, 'sua', mSua[1], than.truong, o.giaTri);
    await lark.updateRecord(mSua[1], { [cfg.f.sp[o.field]]: o.giaTri }, cfg.spTableId);
    kho.xoaDem();
    return json(res, { ok: true, truong: than.truong, giaTri: o.giaTri });
  }

  /* Sửa cùng một cột cho nhiều sản phẩm một lượt. */
  if (p === '/san-pham/hang-loat' && req.method === 'POST') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý sửa được thông tin sản phẩm.');
    const than = await docThan(req);
    const ids = Array.isArray(than.ids) ? than.ids.filter((x) => /^rec[\w]+$/.test(x)) : [];
    if (!ids.length) return loi(res, 400, 'Chưa chọn sản phẩm nào.');
    /* Base cho tối đa 200 bản ghi một lượt; bảng này 59 dòng nên chưa chạm trần,
       nhưng chặn ở đây để lần sau thêm sản phẩm không vỡ âm thầm. */
    if (ids.length > 200) return loi(res, 400, 'Một lượt tối đa 200 sản phẩm.');
    let o;
    try { o = doiTruong(than.truong, than.giaTri); } catch (e) { return loi(res, 400, e.message); }
    const map = {};
    for (const id of ids) map[id] = { [cfg.f.sp[o.field]]: o.giaTri };
    nhatKyGhi(toi, req, 'hang-loat', ids.join(','), than.truong, o.giaTri);
    await lark.updateMany(map, cfg.spTableId);
    kho.xoaDem();
    return json(res, { ok: true, so: ids.length, truong: than.truong, giaTri: o.giaTri });
  }

  if (p === '/lam-moi' && req.method === 'POST') {
    kho.xoaDem();
    const { ds, luc } = await kho.tatCa({ moi: true });
    return json(res, { ok: true, tong: ds.length, capNhat: luc });
  }

  return loi(res, 404, 'Không có đường ' + p);
}

/* ---------------- máy chủ ---------------- */

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (u.pathname.startsWith('/api/')) {
    try {
      await api(req, res, u);
    } catch (e) {
      console.error('[API]', u.pathname, '->', e.message);
      if (!res.headersSent) loi(res, 500, e.message || 'Lỗi không xác định');
    }
    return;
  }
  return tinh(res, u.pathname, u.search);
});

if (require.main === module) {
  server.listen(cfg.port, BIND, () => {
    console.log('Thông tin sản phẩm — http://localhost:' + cfg.port +
      '  [' + cfg.mode + ']  bản ' + VER);
  });
}

module.exports = { server, aiGoi, api, tongQuan, veNgay, VER };
