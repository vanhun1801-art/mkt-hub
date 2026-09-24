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
const lich = require('./lich');
const nhatKy = require('./nhatky');
const { doiTruong } = require('./kiem');
const hinhBanDo = require('./hinh-ban-do');
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
      /* 'cao', KHÔNG phải 'gap'. Lớp vỏ chỉ hiểu cao/vua/thap/ok — xem
         kpi.js và public/app.js bên hub. Từ lạ không gây lỗi, nó chỉ rơi im
         lặng: huy hiệu đỏ cạnh tên app đếm đúng những thẻ 'cao' nên đứng ở 0
         mãi, và trong danh sách cần xử lý thì sản phẩm ĐÃ HẾT HẠN bị chấm xám
         "thấp" — thứ gấp nhất trông nhẹ nhất. */
      muc: hetHan.length ? 'cao' : 'ok' },
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
      muc: /Đã hết hạn/.test(p.tinhTrang) ? 'cao' : 'vua',
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

/**
 * Giá trị thô -> chữ người đọc được, để in trong một dòng tin.
 *
 * Ngày trong bộ nhớ là epoch ms còn giá trị vừa ghi là chuỗi "YYYY-MM-DD 00:00:00";
 * tiền là số trần. In thẳng thì tin đọc ra "1790... → 2026-10-01 00:00:00".
 */
function veGiaTri(v, field) {
  if (v == null || v === '') return '(trống)';
  if (field === 'giaNL' || field === 'giaTE') {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString('vi-VN') + 'đ' : String(v);
  }
  if (/^hieuLuc/.test(field)) {
    const t = typeof v === 'number' ? v : Date.parse(String(v).slice(0, 10) + 'T00:00:00+07:00');
    return Number.isFinite(t) && t ? veNgay(t) : String(v);
  }
  return String(v);
}

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
      cotDatLich: lich.COT_DAT_DUOC,
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
    /* Lấy giá trị CŨ trước khi ghi — sau khi ghi thì không còn ai biết nó là gì,
       mà đó chính là nửa quan trọng của một dòng tin ("900.000đ → 800.000đ"). */
    const { ds: dsTruoc } = await kho.tatCa();
    const spTruoc = dsTruoc.find((x) => x.id === mSua[1]);
    nhatKyGhi(toi, req, 'sua', mSua[1], than.truong, o.giaTri);
    await lark.updateRecord(mSua[1], { [cfg.f.sp[o.field]]: o.giaTri }, cfg.spTableId);
    if (spTruoc) {
      await nhatKy.ghi(lark, [{
        spId: spTruoc.id, ma: spTruoc.ma, ten: spTruoc.ten,
        cot: cfg.suaDuoc[than.truong].nhan,
        cu: veGiaTri(spTruoc[o.field], o.field),
        moi: veGiaTri(o.giaTri, o.field),
      }], { nguon: 'Sửa tay', nguoi: toi.ten });
    }
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
    const { ds: dsTruoc } = await kho.tatCa();
    const theoId = new Map(dsTruoc.map((x) => [x.id, x]));
    nhatKyGhi(toi, req, 'hang-loat', ids.join(','), than.truong, o.giaTri);
    await lark.updateMany(map, cfg.spTableId);
    /* Cả nhóm chung MỘT mã lô — bảng tin gộp thành một tin "12 sản phẩm đổi …"
       thay vì 12 tin giống hệt nhau. */
    await nhatKy.ghi(lark, ids.filter((id) => theoId.has(id)).map((id) => {
      const q = theoId.get(id);
      return {
        spId: q.id, ma: q.ma, ten: q.ten,
        cot: cfg.suaDuoc[than.truong].nhan,
        cu: veGiaTri(q[o.field], o.field),
        moi: veGiaTri(o.giaTri, o.field),
      };
    }), { nguon: 'Hàng loạt', nguoi: toi.ten, lo: nhatKy.maLo() });
    kho.xoaDem();
    return json(res, { ok: true, so: ids.length, truong: than.truong, giaTri: o.giaTri });
  }

  /* ---- Lịch đổi thông tin ---- */

  if (p === '/lich') {
    /* Chỉ quản lý: đây là màn điều phối, nhân sự xem vào chỉ thêm rối. Và nó
       lộ trước cả những thay đổi chưa tới ngày công bố. */
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý xem được lịch đổi thông tin.');
    const { ds, dsLich } = await kho.tatCa();
    const ten = new Map(ds.map((x) => [x.id, (x.ma ? x.ma + ' — ' : '') + x.ten]));
    return json(res, {
      ds: dsLich.map((r) => Object.assign({}, r, {
        sanPhamTen: r.spIds.map((id) => ten.get(id)).filter(Boolean).join(', '),
      })).sort((a, b) => (a.ngayApDung || 0) - (b.ngayApDung || 0)),
      cot: lich.COT_DAT_DUOC,
    });
  }


  if (p === '/lich/them' && req.method === 'POST') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý đặt được lịch đổi.');
    const than = await docThan(req);
    const spId = String(than.sanPham || '').trim();
    const cot = String(than.cot || '').trim();
    const ngay = String(than.ngay || '').trim();
    if (!/^rec[\w]+$/.test(spId)) return loi(res, 400, 'Chưa chọn sản phẩm.');
    if (!lich.THEO_NHAN.has(cot)) return loi(res, 400, 'Cột không đặt lịch được: ' + cot);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) return loi(res, 400, 'Ngày áp dụng phải dạng YYYY-MM-DD.');
    /* Kiểm giá trị NGAY LÚC ĐẶT, bằng đúng cửa kiểm lúc áp. Để tới ngày mới
       biết sai thì đã trễ — và lúc đó không còn ai ngồi đó để sửa. */
    try { doiTruong(lich.THEO_NHAN.get(cot), than.giaTri); }
    catch (e) { return loi(res, 400, e.message); }

    const { ds } = await kho.tatCa();
    const sp = ds.find((x) => x.id === spId);
    if (!sp) return loi(res, 400, 'Không thấy sản phẩm này.');

    await lark.createRecord({
      [cfg.f.lich.ten]: (sp.ma || sp.ten) + ' · ' + cot + ' từ ' + veNgay(
        Date.parse(ngay + 'T00:00:00+07:00')),
      [cfg.f.lich.sanPham]: [{ id: spId }],
      [cfg.f.lich.cot]: cot,
      [cfg.f.lich.giaTriMoi]: String(than.giaTri == null ? '' : than.giaTri),
      [cfg.f.lich.ngayApDung]: ngay + ' 00:00:00',
      [cfg.f.lich.trangThai]: 'Chờ áp dụng',
      [cfg.f.lich.ghiChu]: String(than.ghiChu || '').trim() || null,
    }, cfg.lichTableId);
    nhatKyGhi(toi, req, 'dat-lich', spId, cot, 'từ ' + ngay);
    kho.xoaDem();
    return json(res, { ok: true });
  }

  /* Sửa một dòng lịch đang chờ.
   *
   * Thiếu cửa này thì 4 dòng "chưa gán sản phẩm" không gán được từ app — mà đó
   * đúng là việc phải làm trước ngày áp dụng. Chỉ sửa được dòng còn CHỜ: dòng
   * đã áp là lịch sử, sửa nó là viết lại quá khứ. */
  const mSuaLich = /^\/lich\/(rec[\w]+)$/.exec(p);
  if (mSuaLich && req.method === 'POST') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý sửa được lịch đổi.');
    const than = await docThan(req);
    const { dsLich, ds } = await kho.tatCa();
    const dong = dsLich.find((r) => r.id === mSuaLich[1]);
    if (!dong) return loi(res, 404, 'Không thấy dòng lịch này.');
    if (dong.trangThai !== 'Chờ áp dụng') {
      return loi(res, 400, 'Chỉ sửa được dòng đang chờ áp dụng. Dòng này: ' + dong.trangThai);
    }

    const spId = String(than.sanPham || '').trim();
    const cot = String(than.cot || '').trim();
    const ngay = String(than.ngay || '').trim();
    if (!/^rec[\w]+$/.test(spId)) return loi(res, 400, 'Chưa chọn sản phẩm.');
    if (!lich.THEO_NHAN.has(cot)) return loi(res, 400, 'Cột không đặt lịch được: ' + cot);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) return loi(res, 400, 'Ngày áp dụng phải dạng YYYY-MM-DD.');
    try { doiTruong(lich.THEO_NHAN.get(cot), than.giaTri); }
    catch (e) { return loi(res, 400, e.message); }

    const sp = ds.find((x) => x.id === spId);
    if (!sp) return loi(res, 400, 'Không thấy sản phẩm này.');

    await lark.updateRecord(mSuaLich[1], {
      [cfg.f.lich.ten]: (sp.ma || sp.ten) + ' · ' + cot + ' từ ' +
        veNgay(Date.parse(ngay + 'T00:00:00+07:00')),
      [cfg.f.lich.sanPham]: [{ id: spId }],
      [cfg.f.lich.cot]: cot,
      [cfg.f.lich.giaTriMoi]: String(than.giaTri == null ? '' : than.giaTri),
      [cfg.f.lich.ngayApDung]: ngay + ' 00:00:00',
      [cfg.f.lich.ghiChu]: String(than.ghiChu || '').trim() || null,
    }, cfg.lichTableId);
    nhatKyGhi(toi, req, 'sua-lich', mSuaLich[1], cot, 'từ ' + ngay);
    kho.xoaDem();
    return json(res, { ok: true });
  }

  const mHuy = /^\/lich\/(rec[\w]+)\/huy$/.exec(p);
  if (mHuy && req.method === 'POST') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý huỷ được lịch đổi.');
    await lark.updateRecord(mHuy[1], { [cfg.f.lich.trangThai]: 'Đã huỷ' }, cfg.lichTableId);
    nhatKyGhi(toi, req, 'huy-lich', mHuy[1], 'Trạng thái', 'Đã huỷ');
    kho.xoaDem();
    return json(res, { ok: true });
  }

  /* ---- Hình bản đồ (tab Quản lý → mục Hình bản đồ). Đọc: ai cũng được; ghi: quản lý. ---- */
  if (p === '/hinh-ban-do' && req.method === 'GET') return json(res, { ds: await hinhBanDo.danhSach() });
  if (p.startsWith('/hinh-ban-do') && req.method === 'POST') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý đổi được hình bản đồ.');
    try {
      const o = await docThan(req, 3 * 1024 * 1024);
      if (p === '/hinh-ban-do') await hinhBanDo.ghiHinh(o, toi.ten);
      else if (p === '/hinh-ban-do/co') await hinhBanDo.ghiCo(o.ma, o.co, toi.ten);
      else if (p === '/hinh-ban-do/xoa') await hinhBanDo.veMacDinh(o.ma);
      else return loi(res, 404, 'Không có đường ' + p);
      nhatKyGhi(toi, req, 'hinh-ban-do', o.ma || '', p.replace('/hinh-ban-do', '') || 'tải hình', o.co != null ? String(o.co) : '');
      return json(res, { ok: true });
    } catch (e) { return loi(res, e.http || 500, e.message); }
  }

  /* Tin sản phẩm cho bảng tin của lớp vỏ.
   *
   * KHÔNG ghi vào bảng Thông báo của hub: bảng đó vừa nuôi bảng tin vừa nuôi
   * popup CHẶN MÀN HÌNH, nên mỗi lần đổi giá là cả phòng bị một popup. App tự
   * phát tin, hub gộp vào bảng tin và chỉ bảng tin. */
  if (p === '/tin') {
    const { ds, dsNhatKy } = await kho.tatCa();
    /* Thẻ nhận diện, không phải mỗi cái tên: bảng tin cả phòng đọc, mà ngoài đội
       sản phẩm thì không ai thuộc mã tour. Giá lấy bản SAU ưu đãi khi có, vì đó
       mới là giá đang bán — bảng tin nói giá gốc là gieo nhầm số cho người chạy
       quảng cáo. */
    const the = new Map(ds.map((x) => {
      const g = x.giaSauGiam || {};
      return [x.id, {
        ten: (x.ma ? x.ma + ' — ' : '') + x.ten,
        tenEn: x.tenEn || '',
        nhom: x.nhom || '',
        thoiLuong: x.thoiLuong || '',
        giaNL: g.nl || x.giaNL || 0,
        giaTE: g.te || x.giaTE || 0,
      }];
    }));
    return json(res, { ds: nhatKy.dungTin(dsNhatKy || [], the) });
  }

  if (p === '/lam-moi' && req.method === 'POST') {
    kho.xoaDem();
    const { ds, luc } = await kho.tatCa({ moi: true });
    return json(res, { ok: true, tong: ds.length, capNhat: luc });
  }

  return loi(res, 404, 'Không có đường ' + p);
}

/* ---------------- bản đồ du lịch (lark-ban-do) ----------------
 *
 * Tab "Bản đồ" của app nhúng bản đồ minh hoạ Phú Quốc ở /ban-do/. Tệp tĩnh (khung,
 * nền địa hình, hình minh hoạ) phục vụ thẳng từ ../lark-ban-do/public; riêng
 * du-lieu.js (tour + giá) DỰNG TƯƠI từ chính bộ đọc Base của app này — đổi giá,
 * thêm/ngừng tour trên Base là bản đồ đổi theo ở lần mở sau, không cần dựng lại.
 * Dựng bằng dungDuLieu() của lark-ban-do/tao/du-lieu.js (một định nghĩa duy nhất,
 * cùng hàm lệnh dựng tay dùng), không gọi mạng OSRM: đường bộ đọc từ đệm.
 *
 * Trang bản đồ gửi X-Hub-Khong-Chen: lớp vỏ chèn CSS/JS dùng chung vào mọi trang
 * HTML của app con, mà bản đồ có giao diện riêng — chèn vào là vỡ bố cục. */
const BAN_DO = path.join(__dirname, '..', 'lark-ban-do', 'public');
const BAN_DO_TEP = new Set(['index.html', 'ban-do.css', 'ban-do.js', 'hinh.js', 'dia-hinh.js', 'hinh-ve.js', 'hinh-rieng.js']);
let demBanDo = null;                                    // { luc, js } — theo mốc đọc Base của kho

async function banDo(res, duong) {
  const ten = duong.replace(/^\/ban-do\/?/, '') || 'index.html';
  /* hình: dựng sẵn trong repo + bảng "Hình bản đồ" trên Base (hinh-ban-do.js) */
  if (ten === 'hinh-rieng.js') {
    return gui(res, 200, await hinhBanDo.hinhRiengJs(), { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
  }
  const mAnh = ten.match(/^hinh\/([a-z0-9-]{2,40})$/);
  if (mAnh) {
    const a = await hinhBanDo.anhCua(mAnh[1]);
    if (!a) return gui(res, 404, 'Chưa có hình', { 'Content-Type': 'text/plain; charset=utf-8' });
    return gui(res, 200, a.buffer, { 'Content-Type': a.kieu, 'Cache-Control': 'no-store' });
  }
  if (ten === 'du-lieu.js') {
    const d = await kho.tatCa();
    if (!demBanDo || demBanDo.luc !== d.luc) {
      const { dungDuLieu } = require(path.join(__dirname, '..', 'lark-ban-do', 'tao', 'du-lieu.js'));
      const { ra } = await dungDuLieu(d.ds, { mang: false });
      demBanDo = { luc: d.luc, js: '/* Dựng tươi từ Base "Sản phẩm" lúc ' + new Date(d.luc).toISOString() + ' */\nwindow.PQ_DU_LIEU = ' + JSON.stringify(ra) + ';\n' };
    }
    return gui(res, 200, demBanDo.js, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
  }
  if (!BAN_DO_TEP.has(ten) || !fs.existsSync(path.join(BAN_DO, ten))) {
    return gui(res, 404, 'Không có ' + duong, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  gui(res, 200, fs.readFileSync(path.join(BAN_DO, ten)), {
    'Content-Type': MIME[path.extname(ten)] || 'application/octet-stream',
    'Cache-Control': ten === 'index.html' ? 'no-store' : 'public, max-age=3600',
    'X-Hub-Khong-Chen': '1',
  });
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
  if (u.pathname === '/ban-do') return gui(res, 302, '', { Location: 'ban-do/' });
  if (u.pathname.startsWith('/ban-do/')) {
    try { return await banDo(res, u.pathname); } catch (e) {
      console.error('[BẢN ĐỒ]', u.pathname, '->', e.message);
      if (!res.headersSent) return loi(res, 500, e.message);
      return;
    }
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
