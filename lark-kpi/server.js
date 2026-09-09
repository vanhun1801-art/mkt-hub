'use strict';
/**
 * Server HTTP thuần Node (không dependency) cho app Báo cáo & KPI.
 *
 * Chạy độc lập: `node server.js` rồi mở http://localhost:5179
 * Chạy trong MKT Hub: hub tự bật và proxy vào /m/kpi/, danh tính người dùng do
 * hub truyền xuống qua header x-hub-user-id / x-hub-user-name.
 *
 * Giai đoạn này dữ liệu nằm ở tệp JSON (xem store.js) để anh Hùng bấm thử và
 * đánh giá mô hình trước khi đổ công vào Base.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const L = require('./luat');
const { chamThang, chotDuoc } = require('./tinh');
const store = require('./store');
const nguon = require('./nguon');
const baoCao = require('./bao-cao');

const PORT = Number(process.env.PORT || 5179);
/* PHẢI là loopback. App này đọc danh tính từ header `x-hub-user-id` mà hub truyền
 * xuống, và tin nó — chỉ an toàn khi không ai ngoài hub gọi tới được. Nghe
 * 0.0.0.0 thì bất kỳ máy nào trong mạng LAN cũng tự đặt header đó rồi thành
 * người khác. Bốn app con kia đều mặc định 127.0.0.1 và dùng tên biến BIND_HOST;
 * nhận cả hai tên để cấu hình đang chạy không chết. */
const BIND = process.env.BIND_HOST || process.env.BIND || '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
};

/* Vân tay tài nguyên tĩnh — đổi file là trình duyệt tự lấy bản mới. */
const VAN_TAY = (() => {
  const h = crypto.createHash('sha1');
  try {
    fs.readdirSync(PUBLIC).sort().forEach((f) => h.update(fs.readFileSync(path.join(PUBLIC, f))));
  } catch (_) { h.update(String(Date.now())); }
  return h.digest('hex').slice(0, 10);
})();

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
const fail = (res, code, message) => send(res, code, { error: message });

function readBody(req) {
  return new Promise((giai, tu) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 2e6) { tu(new Error('Gói tin quá lớn')); req.destroy(); } });
    req.on('end', () => { try { giai(s ? JSON.parse(s) : {}); } catch (e) { tu(new Error('JSON hỏng')); } });
    req.on('error', tu);
  });
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return fail(res, 403, 'Từ chối');
  fs.readFile(file, (err, buf) => {
    if (err) return fail(res, 404, 'Không tìm thấy ' + rel);
    let out = buf;
    if (rel === 'index.html') out = Buffer.from(buf.toString('utf8').split('__V__').join(VAN_TAY), 'utf8');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(out);
  });
}

/* ---------------- danh tính & quyền ----------------
 * Điểm KPI gắn với lương nên phạm vi xem phải chặt: mỗi người chỉ thấy phiếu của
 * mình; trưởng phòng và HCNS thấy cả phòng. Chạy một mình (không qua hub) thì coi
 * như quản lý — để còn phát triển được. */
const QUAN_LY = (process.env.KPI_QUAN_LY || '').split(',').map((s) => s.trim()).filter(Boolean);
const MA_CUA = (() => {
  try { return JSON.parse(process.env.KPI_MA_NGUOI || '{}'); } catch (_) { return {}; }
})();

function nguoiXem(req) {
  const id = req.headers['x-hub-user-id'] || '';
  const ten = req.headers['x-hub-user-name'] || '';
  if (!id) return { id: '', ten: 'Chạy cục bộ', quanLy: true, ma: '' };
  return {
    id, ten,
    quanLy: QUAN_LY.includes(id) || QUAN_LY.includes(ten),
    ma: MA_CUA[id] || MA_CUA[ten] || '',
  };
}

/** Cắt phiếu xuống đúng phạm vi người xem được phép thấy. */
function loc(kq, nx) {
  if (nx.quanLy) return kq;
  const cua = kq.nguoi.filter((n) => n.ma === nx.ma);
  return {
    ...kq,
    nguoi: cua,
    /* Nhóm kênh và cảnh báo toàn phòng cũng là dữ liệu của người khác — chỉ giữ
     * những nhóm mà người này thực sự được phân bổ. */
    nhom: kq.nhom.filter((n) => cua.some((x) => (x.kenh || []).some((k) => k.khoa === n.khoa))),
    canhBao: (kq.canhBao || []).filter((c) => cua.some((x) => String(c.o).includes(x.ten))),
    chiMinh: true,
  };
}

/* ---------------- tính một tháng ---------------- */
function tinhThang(th, luatThayThe) {
  const t = store.thang(th);
  if (!t) return null;
  const luat = luatThayThe || t.luat;
  const kq = chamThang(luat, t.soLieu, t.chamTay, th);
  const c = chotDuoc(luat, kq);
  return {
    ...kq,
    daTraLuong: t.daTraLuong,
    daSuaLuat: t.daSuaLuat,
    boQuaKhiNhap: t.boQuaKhiNhap,
    chot: t.chot ? { luc: t.chot.luc, boi: t.chot.boi } : null,
    chotDuoc: c.duoc,
    soChan: c.chan.length,
    chan: c.chan,
    canhBaoLuat: c.canhBao,
  };
}

/**
 * Áp một bộ sửa lên bản sao của bộ luật. Dùng cho màn hình "Thử luật": đổi một
 * con số rồi thấy ngay điểm cả phòng nhúc nhích, mà không ghi gì xuống đĩa.
 */
function apSua(luat, sua) {
  const l = JSON.parse(JSON.stringify(luat));
  const { mucTieu = {}, tyTrong = {}, trongSo = {}, phanBo = {}, buView, heSo } = sua || {};
  l.nhom.forEach((n) => {
    const khoa = L.khoaNhom(n);
    n.tieuChi.forEach((t) => {
      const k = khoa + '#' + t.ma;
      if (Number.isFinite(mucTieu[k])) t.mucTieu = mucTieu[k];
      if (Number.isFinite(tyTrong[k])) t.tyTrong = tyTrong[k];
    });
  });
  l.nguoi.forEach((ng) => {
    const w = trongSo[ng.ma] || {};
    ng.tieuChi.forEach((t) => { if (Number.isFinite(w[t.ma])) t.trongSo = w[t.ma]; });
    if (phanBo[ng.ma]) ng.kenh = Object.assign({}, ng.kenh, phanBo[ng.ma]);
  });
  if (buView) l.buView = Object.assign({}, l.buView, buView);
  if (heSo) l.heSo = Object.assign({}, l.heSo, heSo);
  return l;
}

/* ---------------- định tuyến ---------------- */
async function api(req, res, u) {
  const p = u.pathname;
  const nx = nguoiXem(req);

  if (p === '/api/meta') {
    const ths = store.danhSachThang();
    /* Tháng mới nhất thường là tháng CHƯA có số liệu (block đã dựng sẵn, chờ dán
     * dữ liệu vào). Mở app ra thấy toàn số 0 là hiểu nhầm app hỏng — nên mặc định
     * nhảy tới tháng gần nhất thực sự có số. */
    const coSo = (th) => {
      const t = store.thang(th);
      return !!t && Object.values(t.soLieu).some((v) => typeof v === 'number' && Number.isFinite(v) && v !== 0);
    };
    return ok(res, {
      ten: 'Báo cáo & KPI', thang: ths, coLichSu: store.coLichSu(),
      thangCoSo: ths.filter(coSo),
      thangGoiY: ths.find(coSo) || ths[0] || '',
      nguoiXem: { ten: nx.ten, quanLy: nx.quanLy, ma: nx.ma },
      nguon: 'du-lieu/lich-su-2026.json',
    });
  }

  if (p === '/api/thang') {
    const th = u.searchParams.get('thang') || store.danhSachThang()[0];
    const kq = tinhThang(th);
    if (!kq) return fail(res, 404, 'Chưa có dữ liệu tháng ' + th);
    return ok(res, loc(kq, nx));
  }

  if (p === '/api/luat') {
    const th = u.searchParams.get('thang') || store.danhSachThang()[0];
    const t = store.thang(th);
    if (!t) return fail(res, 404, 'Chưa có dữ liệu tháng ' + th);
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng xem được bộ luật');
    return ok(res, { thang: th, luat: t.luat, daSuaLuat: t.daSuaLuat, soat: L.soat(t.luat) });
  }

  if (p === '/api/thu-luat' && req.method === 'POST') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng thử được bộ luật');
    const body = await readBody(req);
    const th = body.thang || store.danhSachThang()[0];
    const t = store.thang(th);
    if (!t) return fail(res, 404, 'Chưa có dữ liệu tháng ' + th);
    const truoc = tinhThang(th);
    const luatMoi = apSua(t.luat, body.sua);
    const sau = tinhThang(th, luatMoi);
    return ok(res, {
      thang: th,
      truoc: truoc.nguoi.map((n) => ({ ma: n.ma, ten: n.ten, tong: n.tong })),
      sau: sau.nguoi.map((n) => ({ ma: n.ma, ten: n.ten, tong: n.tong })),
      soatSau: L.soat(luatMoi),
      chotDuocSau: sau.chotDuoc,
      luat: luatMoi,
    });
  }

  if (p === '/api/luu-luat' && req.method === 'POST') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng sửa được bộ luật');
    const body = await readBody(req);
    if (!body.thang || !body.luat) return fail(res, 400, 'Thiếu tháng hoặc bộ luật');
    const chan = L.soat(body.luat).filter((x) => x.muc === 'chan');
    if (chan.length) return fail(res, 400, 'Bộ luật còn ' + chan.length + ' lỗi chặn');
    store.luuLuat(body.thang, body.luat);
    return ok(res, { luu: true });
  }

  if (p === '/api/bo-sua-luat' && req.method === 'POST') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng làm được');
    const body = await readBody(req);
    store.boSuaLuat(body.thang);
    return ok(res, { ve: 'bản nhập từ Excel' });
  }

  if (p === '/api/cham' && req.method === 'POST') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng và HCNS chấm được');
    const b = await readBody(req);
    if (!b.thang || !b.nguoi || !b.tieuChi) return fail(res, 400, 'Thiếu tham số');
    store.luuChamTay(b.thang, b.nguoi, b.tieuChi, b.diem);
    return ok(res, loc(tinhThang(b.thang), nx));
  }

  if (p === '/api/chot' && req.method === 'POST') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng chốt được');
    const b = await readBody(req);
    const kq = tinhThang(b.thang);
    if (!kq) return fail(res, 404, 'Chưa có dữ liệu tháng ' + b.thang);
    if (!kq.chotDuoc) return fail(res, 400, 'Còn ' + kq.soChan + ' mục chặn, chưa chốt được');
    return ok(res, store.chot(b.thang, kq, nx.ten));
  }

  if (p === '/api/bo-chot' && req.method === 'POST') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng làm được');
    const b = await readBody(req);
    store.boChot(b.thang);
    return ok(res, { boChot: true });
  }

  /* ---------------- BÁO CÁO: gom mọi base ---------------- */

  if (p === '/api/bao-cao') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng xem được báo cáo toàn phòng');
    const { tu, den } = khoangTu(u);
    return ok(res, await baoCao.gomSoSanh(tu, den));
  }

  /** Một tệp HTML hoàn chỉnh để gửi Sếp — mở ra in thẳng thành PDF được. */
  if (p === '/api/xuat-bao-cao') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng xuất được báo cáo toàn phòng');
    const { tu, den } = khoangTu(u);
    const d = await baoCao.gomSoSanh(tu, den);
    const html = trangBaoCao(d, nx);
    return send(res, 200, html, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'inline; filename="bao-cao-marketing.html"',
    });
  }

  /* ---------------- thu số liệu ---------------- */

  /** Xem trước: mỗi tiêu chí lấy được số từ đâu, thiếu cái gì. Không ghi gì. */
  if (p === '/api/nguon') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng xem được');
    const th = u.searchParams.get('thang') || store.danhSachThang()[0];
    const t = store.thang(th);
    if (!t) return fail(res, 404, 'Chưa có dữ liệu tháng ' + th);
    const r = await nguon.docTuApp(th, t.luat);
    /* Kèm số đang dùng để thấy đổ về sẽ đổi cái gì — đừng bắt người ta bấm rồi
     * mới biết mình vừa ghi đè lên số nào. */
    r.nhatKy.forEach((x) => { x.dangDung = t.soLieu[x.ma]; });
    return ok(res, { ...r, nhatKySo: t.nhatKySo, coSoLieuMoi: t.coSoLieuMoi });
  }

  if (p === '/api/dong-bo' && req.method === 'POST') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng đổ số được');
    const b = await readBody(req);
    const th = b.thang || store.danhSachThang()[0];
    const t = store.thang(th);
    if (!t) return fail(res, 404, 'Chưa có dữ liệu tháng ' + th);
    if (t.chot) return fail(res, 400, 'Tháng này đã chốt — bỏ chốt trước khi đổ số mới');
    const r = await nguon.docTuApp(th, t.luat);
    const n = store.luuSoLieu(th, r.soLieu, 'app');
    return ok(res, { ghi: n, dem: r.dem, loiApp: r.loiApp });
  }

  if (p === '/api/tai-file' && req.method === 'POST') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng tải file được');
    const b = await readBody(req);
    const th = b.thang || store.danhSachThang()[0];
    const t = store.thang(th);
    if (!t) return fail(res, 404, 'Chưa có dữ liệu tháng ' + th);
    if (t.chot) return fail(res, 400, 'Tháng này đã chốt — bỏ chốt trước khi nạp số mới');
    const doc = nguon.tachBang(b.noiDung);
    if (doc.loi) return fail(res, 400, doc.loi);
    const g = nguon.ghepFile(doc.hang, t.luat);
    /* `xem: true` là chỉ xem thử. Người ta phải nhìn thấy dòng nào khớp vào đâu
     * trước khi số chạy vào bảng lương. */
    if (b.xem) return ok(res, { khop: g.khop, truot: g.truot, soDong: doc.hang.length });
    const n = store.luuSoLieu(th, g.soLieu, 'file');
    return ok(res, { ghi: n, khop: g.khop, truot: g.truot, soDong: doc.hang.length });
  }

  if (p === '/api/bo-so-lieu' && req.method === 'POST') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng làm được');
    const b = await readBody(req);
    store.boSoLieu(b.thang);
    return ok(res, { ve: 'số liệu gốc' });
  }

  /**
   * Gợi ý mục tiêu cho một tháng, dựa trên kết quả THẬT của các tháng trước.
   * Đặt mục tiêu bằng cảm tính là gốc của mọi méo mó đã thấy: tháng 7 có kênh
   * để mục tiêu 30.000 view trong khi tháng nào cũng đạt vài trăm nghìn.
   */
  if (p === '/api/goi-y-muc-tieu') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng xem được');
    const th = u.searchParams.get('thang') || store.danhSachThang()[0];
    const soThang = Math.max(1, Math.min(12, Number(u.searchParams.get('n') || 3)));
    const tang = Number(u.searchParams.get('tang'));
    const heSoTang = Number.isFinite(tang) ? tang : 0.1;
    const t = store.thang(th);
    if (!t) return fail(res, 404, 'Chưa có dữ liệu tháng ' + th);

    const truoc = store.danhSachThang().filter((x) => x < th).sort().reverse().slice(0, soThang);
    const ds = [];
    (t.luat.nhom || []).forEach((n) => (n.tieuChi || []).forEach((tc) => {
      const lichSu = truoc.map((x) => {
        const o = store.thang(x);
        const v = o && o.soLieu[tc.nguon];
        return { thang: x, so: (typeof v === 'number' && Number.isFinite(v)) ? v : null };
      }).reverse();
      const co = lichSu.map((x) => x.so).filter((v) => v != null);
      const tb = co.length ? co.reduce((a, b2) => a + b2, 0) / co.length : null;
      /* Làm tròn lên cho dễ đọc: 1.151.981 → 1.300.000, không phải 1.267.179,1 */
      const goiY = tb == null ? null : lamTron(tb * (1 + heSoTang));
      ds.push({
        ma: tc.nguon, nhom: [n.kenh, n.tenKenh, n.loai].filter(Boolean).join(' · '),
        tieuChi: tc.ten, hienTai: tc.mucTieu, lichSu,
        trungBinh: tb, thapNhat: co.length ? Math.min(...co) : null,
        caoNhat: co.length ? Math.max(...co) : null,
        goiY,
        datNeuTheoGoiY: goiY ? (tb / goiY) : null,
        datHienTai: tc.mucTieu > 0 && tb != null ? tb / tc.mucTieu : null,
      });
    }));
    return ok(res, { thang: th, dungThang: truoc, heSoTang, danhSach: ds });
  }

  /**
   * Tổng quan nhiều tháng — trả lời "phòng đang khoẻ hay yếu", không phải
   * "tháng này ai bao nhiêu điểm".
   *
   * Chỉ tính trên tháng THỰC SỰ có số liệu: tháng mới nhất thường là block đã
   * dựng sẵn chờ dán dữ liệu, đưa vào đường xu hướng là kéo mọi thứ về 0 và vẽ
   * ra một cú sụp không có thật.
   */
  if (p === '/api/tong-quan') {
    const ths = store.danhSachThang().slice().sort()
      .filter((th) => {
        const t = store.thang(th);
        return t && Object.values(t.soLieu).some((v) => typeof v === 'number' && Number.isFinite(v) && v !== 0);
      });

    const phong = [];
    const nguoiMap = new Map();     // ma -> { ten, theoThang[], tieuChi{} }
    const kenhMap = new Map();      // khoa -> { ten, theoThang[] }
    const tcMap = new Map();        // ma tiêu chí -> thống kê toàn phòng

    ths.forEach((th) => {
      const kq = tinhThang(th);
      if (!kq) return;

      const diems = kq.nguoi.map((n) => n.tong).filter(Number.isFinite);
      /* Kèm PHẦN TRĂM bên cạnh điểm thô: điểm 0,437 đọc lên không biết tốt xấu,
       * còn "36%" thì biết ngay. Phần trăm = điểm chia tổng trọng số của người đó. */
      const pts = kq.nguoi.map((n) => (n.tongTrongSo > 0 ? n.tong / n.tongTrongSo : null))
        .filter((x) => x != null);
      phong.push({
        thang: th,
        diemTB: diems.length ? diems.reduce((a, b) => a + b, 0) / diems.length : null,
        ptTB: pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null,
        soNguoi: diems.length,
        soDat: kq.nguoi.filter((n) => n.tongTrongSo > 0 && n.tong / n.tongTrongSo >= 1).length,
        chotDuoc: kq.chotDuoc,
      });

      kq.nguoi.forEach((n) => {
        const o = nguoiMap.get(n.ma) || { ma: n.ma, ten: n.ten, theoThang: [], tieuChi: {}, kenh: {} };
        o.theoThang.push({ thang: th, tong: n.tong, dayDu: n.dayDu,
          pt: n.tongTrongSo > 0 ? n.tong / n.tongTrongSo : null });
        n.tieuChi.forEach((tc) => {
          /* Bỏ tiêu chí chấm tay khỏi xếp hạng mạnh/yếu: Tuân thủ gần như luôn
           * bằng 1 nên ai cũng "mạnh nhất ở Tuân thủ" — một câu đúng mà vô dụng. */
          if (tc.kieu === 'tay') return;
          const g = o.tieuChi[tc.ma] || (o.tieuChi[tc.ma] = { ten: tc.ten, diem: [] });
          if (Number.isFinite(tc.diem)) g.diem.push(tc.diem);
        });
        /* Kênh nào kéo người này lên, kênh nào dìm xuống — tính theo điểm nhóm,
         * không theo phần đã nhân tỷ trọng, để so được giữa các kênh với nhau. */
        (n.kenh || []).forEach((k) => {
          if (k.boQua || !Number.isFinite(k.diemNhom)) return;
          const g = o.kenh[k.khoa] || (o.kenh[k.khoa] = { ten: k.ten, diem: [], tyTrong: k.tyTrong });
          g.diem.push(k.diemNhom);
          g.tyTrong = k.tyTrong;
        });
        nguoiMap.set(n.ma, o);
      });

      kq.nhom.forEach((n) => {
        const o = kenhMap.get(n.khoa) || { khoa: n.khoa, ten: n.ten, theoThang: [] };
        const chiSo = {};
        n.tieuChi.forEach((tc) => {
          if (tc.boQua) return;
          chiSo[tc.ma] = { ten: tc.ten, ketQua: tc.ketQua, mucTieu: tc.mucTieu, dat: tc.datMucTieu };
          /* Thống kê toàn phòng theo LOẠI tiêu chí: "Số lead" đạt 0% ở mười kênh
           * suốt bảy tháng là điểm yếu hệ thống, không phải lỗi một bạn nào. */
          const t = tcMap.get(tc.ma) || { ma: tc.ma, ten: tc.ten, dat: [], duoi: 0, vuot: 0 };
          if (Number.isFinite(tc.datMucTieu)) {
            t.dat.push(tc.datMucTieu);
            if (tc.datMucTieu < 0.5) t.duoi += 1;
            if (tc.datMucTieu > 2) t.vuot += 1;
          }
          tcMap.set(tc.ma, t);
        });
        o.theoThang.push({ thang: th, diem: n.diem, chiSo });
        kenhMap.set(n.khoa, o);
      });
    });

    const tb = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const nguoi = [...nguoiMap.values()].map((o) => {
      const xep = Object.entries(o.tieuChi)
        .map(([ma, g]) => ({ ma, ten: g.ten, tb: tb(g.diem) }))
        .filter((x) => x.tb != null)
        .sort((a, b) => b.tb - a.tb);
      const xepKenh = Object.entries(o.kenh)
        .map(([khoa, g]) => ({ khoa, ten: g.ten, tyTrong: g.tyTrong, tb: tb(g.diem) }))
        .filter((x) => x.tb != null)
        .sort((a, b) => b.tb - a.tb);
      const diemThang = o.theoThang.map((x) => x.pt).filter(Number.isFinite);
      /* Xu hướng: nửa sau so nửa đầu. Nói "đang lên hay đang xuống" thẳng hơn là
       * bắt người đọc tự nhìn bảy con số. */
      const nua = Math.ceil(diemThang.length / 2);
      const xuHuong = diemThang.length >= 4
        ? tb(diemThang.slice(nua)) - tb(diemThang.slice(0, nua)) : null;
      return {
        ma: o.ma, ten: o.ten, theoThang: o.theoThang,
        diemTB: tb(diemThang), xuHuong,
        manh: xep[0] || null, yeu: xep[xep.length - 1] || null,
        kenhTot: xepKenh[0] || null, kenhKem: xepKenh[xepKenh.length - 1] || null,
      };
    });

    const tieuChi = [...tcMap.values()].map((t) => ({
      ma: t.ma, ten: t.ten, soLan: t.dat.length, datTB: tb(t.dat),
      duoi: t.duoi, vuot: t.vuot,
    })).sort((a, b) => (a.datTB || 0) - (b.datTB || 0));

    return ok(res, { thang: ths, phong, nguoi, kenh: [...kenhMap.values()], tieuChi });
  }

  /* Bảng đối chiếu 8 tháng: đã trả lương so với app tính lại. */
  if (p === '/api/doi-chieu') {
    if (!nx.quanLy) return fail(res, 403, 'Chỉ trưởng phòng xem được');
    const ths = store.danhSachThang().slice().sort();
    const nguoi = new Map();
    const dong = [];
    ths.forEach((th) => {
      const kq = tinhThang(th);
      if (!kq) return;
      kq.nguoi.forEach((n) => {
        nguoi.set(n.ma, n.ten);
        dong.push({ thang: th, ma: n.ma, moi: n.tong, cu: kq.daTraLuong[n.ma] });
      });
    });
    const boQua = {};
    ths.forEach((th) => { boQua[th] = (store.thang(th) || {}).boQuaKhiNhap || []; });
    return ok(res, { thang: ths, nguoi: [...nguoi].map(([ma, ten]) => ({ ma, ten })), dong, boQua });
  }

  /**
   * TIẾN ĐỘ THEO TUẦN — "đang đạt bao nhiêu %, và có kịp nhịp không".
   *
   * Điểm KPI là chỉ số có trọng số, đọc lên không hình dung được: "1,169" không
   * nói lên điều gì. Ở đây mọi thứ quy về PHẦN TRĂM, và so với **nhịp chuẩn** —
   * đi hết 71% số ngày thì đáng lẽ phải đạt 71% mục tiêu.
   *
   * Chỉ tính phần tiêu chí TỰ ĐỘNG (kênh + chỉ số). Bỏ tiêu chí chấm tay: giữa
   * tháng chưa ai chấm, tính vào là % nào cũng thấp giả tạo và không ai tin nữa.
   */
  if (p === '/api/tien-do') {
    const th = u.searchParams.get('thang') || store.danhSachThang()[0];
    const t = store.thang(th);
    if (!t) return fail(res, 404, 'Chưa có dữ liệu tháng ' + th);

    const kh = nguon.khoang(th);
    const soNgay = Number(kh.den.slice(8));
    const homNay = new Date().toISOString().slice(0, 10);
    /* Tháng đã qua thì mốc cuối là hết tháng; tháng đang chạy thì là hôm nay. */
    const denHomNay = homNay < kh.den ? (homNay > kh.tu ? homNay : kh.tu) : kh.den;
    const ngayDaQua = Number(denHomNay.slice(8));

    const moc = [];
    for (let d = 7; d < soNgay; d += 7) {
      if (Number(kh.tu.slice(8)) + d - 1 > ngayDaQua) break;
      moc.push(th + '-' + String(d).padStart(2, '0'));
    }
    if (!moc.length || moc[moc.length - 1] !== denHomNay) moc.push(denHomNay);

    const kq = [];
    for (const den of moc) {
      const r = await nguon.docTuApp(th, t.luat, { tu: kh.tu, den });
      /* Số nào không đổ về được thì lấy số đang lưu — nếu không, mọi tiêu chí
       * nhập tay đều thành "không đo được" và bức tranh sai hẳn. */
      const sl = Object.assign({}, r.soLieu);
      const cham = chamThang(t.luat, sl, t.chamTay, th);
      /* Phân biệt "đo được và bằng 0" với "chưa đo được".
       * Bốn người có tiêu chí ăn theo Ads / OTA / Thiết kế — những nguồn chưa
       * nối — nên mọi thứ ra null. Hiện 0% là vu oan: đọc lên thành "làm không
       * ra gì" trong khi sự thật là app chưa lấy được số. Nên tính % TRÊN PHẦN
       * ĐO ĐƯỢC và nói rõ đo được bao nhiêu. */
      const nguoiPT = cham.nguoi.map((ng) => {
        const tuDong = ng.tieuChi.filter((x) => x.kieu !== 'tay');
        let w = 0; let wPhu = 0; let d = 0;
        tuDong.forEach((x) => {
          w += x.trongSo;
          let phu = 0;
          if (x.kieu === 'kenh') {
            const co = (ng.kenh || []).filter((k) => !k.boQua)
              .reduce((s, k) => s + k.tyTrong, 0);
            const tong = (ng.kenh || []).reduce((s, k) => s + k.tyTrong, 0);
            phu = tong > 0 ? co / tong : 0;
          } else {
            phu = x.chuaCo ? 0 : 1;
          }
          wPhu += x.trongSo * phu;
          d += x.diemTinhLuong;
        });
        return {
          ma: ng.ma, ten: ng.ten,
          phanTram: wPhu > 0 ? d / wPhu : null,
          doPhu: w > 0 ? wPhu / w : 0,
        };
      });
      const ngay = Number(den.slice(8));
      kq.push({
        den, ngay,
        nhipChuan: ngay / soNgay,
        layDuoc: r.dem.layDuoc,
        nguoi: nguoiPT,
        nhom: cham.nhom.map((n) => ({ khoa: n.khoa, ten: n.ten, phanTram: n.diem })),
      });
    }

    return ok(res, {
      thang: th, soNgay, ngayDaQua, denHomNay,
      nhipChuan: ngayDaQua / soNgay,
      moc: kq,
      capNhat: Date.now(),
      chiMinh: !nx.quanLy,
      loc: nx.quanLy ? null : nx.ma,
    });
  }

  /* ---------------- xuất báo cáo ----------------
   * CSV có BOM để Excel trên Windows mở ra không vỡ tiếng Việt — thiếu ba byte
   * đó là mọi dấu thành ký tự lạ và người nhận tưởng file hỏng. */
  if (p === '/api/xuat') {
    const th = u.searchParams.get('thang') || store.danhSachThang()[0];
    const kieu = u.searchParams.get('kieu') || 'phong';
    const kq0 = tinhThang(th);
    if (!kq0) return fail(res, 404, 'Chưa có dữ liệu tháng ' + th);
    const kq = loc(kq0, nx);
    const nhan = 'Tháng ' + Number(th.slice(5)) + '-' + th.slice(0, 4);
    let ten; let dong;

    if (kieu === 'nguoi') {
      const ma = u.searchParams.get('ma');
      const ng = kq.nguoi.find((x) => x.ma === ma);
      if (!ng) return fail(res, 404, 'Không thấy người này (hoặc bạn không có quyền xem)');
      ten = 'KPI ' + ng.ten + ' ' + nhan;
      dong = [['Phiếu KPI', ng.ten, nhan], []];
      dong.push(['Tiêu chí tính lương', 'Điểm', 'Trọng số', 'Điểm tính lương', 'Nguồn']);
      ng.tieuChi.forEach((tc) => dong.push([tc.ten, tc.chuaCo ? '' : tc.diem, tc.trongSo,
        tc.diemTinhLuong, tc.kieu === 'tay' ? ('do ' + (tc.boi || '') + ' chấm') : tc.kieu]));
      dong.push(['TỔNG', '', ng.tongTrongSo, ng.tong, '']);
      if ((ng.kenh || []).length) {
        dong.push([], ['Hiệu quả công việc chính đến từ đâu']);
        dong.push(['Nhóm kênh', 'Tỷ trọng', 'Điểm nhóm', 'Góp vào']);
        ng.kenh.forEach((k) => dong.push([k.ten, k.tyTrong, k.boQua ? '' : k.diemNhom, k.diem]));
        dong.push([], ['Chi tiết từng tiêu chí']);
        dong.push(['Nhóm kênh', 'Tiêu chí', 'Kết quả', 'Mục tiêu', '% đạt', 'Tỷ trọng', 'Điểm']);
        ng.kenh.forEach((k) => {
          const n = kq.nhom.find((x) => x.khoa === k.khoa);
          (n ? n.tieuChi : []).forEach((tc) => dong.push([n.ten, tc.ten,
            tc.boQua ? 'không đo được' : tc.ketQua, tc.mucTieu,
            tc.boQua ? '' : tc.datMucTieu, tc.boQua ? 0 : tc.tyTrong, tc.diem]));
        });
      }
    } else {
      ten = 'KPI phòng Marketing ' + nhan;
      dong = [['Báo cáo KPI phòng Marketing', nhan,
        kq.chot ? 'đã chốt ' + new Date(kq.chot.luc).toLocaleString('vi-VN') : 'CHƯA CHỐT'], []];
      const cot = [];
      kq.nguoi.forEach((ng) => ng.tieuChi.forEach((tc) => {
        if (!cot.some((c) => c.ma === tc.ma)) cot.push({ ma: tc.ma, ten: tc.ten });
      }));
      dong.push(['Người', 'Vị trí', ...cot.map((c) => c.ten), 'Tổng trọng số', 'ĐIỂM TÍNH LƯƠNG', 'Đủ dữ liệu']);
      kq.nguoi.forEach((ng) => dong.push([ng.ten, ng.viTri,
        ...cot.map((c) => { const tc = ng.tieuChi.find((x) => x.ma === c.ma); return tc ? (tc.chuaCo ? '' : tc.diem) : ''; }),
        ng.tongTrongSo, ng.tong, ng.dayDu ? 'có' : 'THIẾU']));
      dong.push([], ['Điểm từng nhóm kênh']);
      dong.push(['Nhóm kênh', 'Tiêu chí', 'Kết quả', 'Mục tiêu', '% đạt', 'Tỷ trọng', 'Điểm', 'Điểm nhóm']);
      kq.nhom.forEach((n) => n.tieuChi.forEach((tc, i) => dong.push([n.ten, tc.ten,
        tc.boQua ? 'không đo được' : tc.ketQua, tc.mucTieu,
        tc.boQua ? '' : tc.datMucTieu, tc.boQua ? 0 : tc.tyTrong, tc.diem,
        i === 0 ? n.diem : ''])));
      if ((kq.chan || []).length) {
        dong.push([], ['Mục chặn — tháng này chưa đủ điều kiện chốt']);
        kq.chan.forEach((x) => dong.push([x.o, x.viec]));
      }
    }
    const csv = '﻿' + dong.map((d) => d.map(oCsv).join(',')).join('\r\n');
    return send(res, 200, csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + encodeURIComponent(ten) + '.csv"',
    });
  }

  return fail(res, 404, 'Không có đường ' + p);
}

/**
 * Đọc khoảng thời gian từ query. Nhận `tu`/`den`, hoặc `thang=YYYY-MM`.
 * Mặc định là tháng hiện tại — mở báo cáo ra là thấy kỳ đang chạy.
 */
function khoangTu(u) {
  const tu = u.searchParams.get('tu');
  const den = u.searchParams.get('den');
  if (tu && den) return { tu, den };
  const th = u.searchParams.get('thang') || new Date().toISOString().slice(0, 7);
  return nguon.khoang(th);
}

const hEsc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function soDep(v, kieu) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (kieu === 'vnd') return Math.round(v).toLocaleString('vi-VN') + ' ₫';
  if (kieu === 'pt') return (Math.round(v * 10) / 10).toString().replace('.', ',') + '%';
  if (kieu === 'x') return (Math.round(v * 100) / 100).toString().replace('.', ',') + 'x';
  return Math.round(v).toLocaleString('vi-VN');
}

/**
 * Trang báo cáo hoàn chỉnh — một tệp HTML tự chứa, không phụ thuộc server.
 * Gửi Sếp bằng cách in ra PDF hoặc gửi thẳng tệp; mở bằng trình duyệt nào cũng
 * đọc được. Dùng lại đúng bảng màu của Marketing Hub.
 */
function trangBaoCao(d, nx) {
  const ngay = (s) => s.split('-').reverse().join('/');
  const o = (x) => {
    const l = x.lech;
    /* CPA thấp là tốt nên mũi tên đảo chiều — không đảo thì "CPA giảm 20%" bị
     * tô đỏ như một tin xấu. */
    const tot = l == null ? null : (x.dao ? l < 0 : l > 0);
    return '<div class="o"><div class="nhan">' + hEsc(x.nhan) + '</div>'
      + '<div class="so">' + soDep(x.so, x.dinhDang) + '</div>'
      + (l != null && Number.isFinite(l)
        ? '<div class="lech ' + (tot ? 'tot' : 'xau') + '">'
          + (l > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(l * 10) / 10).toString().replace('.', ',')
          + '% so kỳ trước</div>'
        : (x.ghi ? '<div class="ghi">' + hEsc(x.ghi) + '</div>' : ''))
      + '</div>';
  };
  const bang = (b) => {
    if (!b) return '';
    const soCot = new Set(b.soCot || []);
    return '<h3>' + hEsc(b.tieuDe) + '</h3><table><thead><tr>'
      + b.cot.map((c, i) => '<th' + (soCot.has(i) ? ' class="r"' : '') + '>' + hEsc(c) + '</th>').join('')
      + '</tr></thead><tbody>'
      + b.dong.map((r) => '<tr>' + r.map((c, i) => '<td' + (soCot.has(i) ? ' class="r"' : '') + '>'
        + (typeof c === 'number' ? soDep(c, 'so') : hEsc(c)) + '</td>').join('') + '</tr>').join('')
      + '</tbody></table>';
  };
  const khoi = d.base.map((b) => '<section class="base">'
    + '<header><span class="cham" style="background:' + hEsc(b.mau) + '"></span>'
    + '<b>' + hEsc(b.ten) + '</b><span class="mo">' + hEsc(b.mo) + '</span></header>'
    + (b.chay
      ? '<div class="luoi">' + (b.o || []).map(o).join('') + '</div>' + bang(b.bang)
      : '<p class="loi">Không đọc được số liệu — ' + hEsc(b.loi) + '</p>')
    + '</section>').join('');

  return '<!doctype html><html lang="vi"><head><meta charset="utf-8">'
    + '<title>Báo cáo Marketing ' + ngay(d.tu) + ' – ' + ngay(d.den) + '</title>'
    + '<style>'
    + ':root{--vien:#e3e8f0;--mem:#eef1f6;--chu:#1a2233;--mo:#5b6779;--nhat:#8b95a7;'
    + '--luc:#12a150;--do:#dc2b3d}'
    + '*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:var(--chu);'
    + 'font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}'
    + '.trang{max-width:1080px;margin:0 auto;padding:28px 22px 60px}'
    + 'h1{font-size:22px;margin:0 0 4px}h3{font-size:13px;margin:16px 0 6px;color:var(--mo)}'
    + '.ky{color:var(--mo);margin-bottom:20px}'
    + '.base{background:#fff;border:1px solid var(--vien);border-radius:12px;margin-bottom:16px;overflow:hidden}'
    + '.base>header{display:flex;align-items:center;gap:9px;padding:11px 14px;border-bottom:1px solid var(--vien)}'
    + '.base>header .mo{color:var(--nhat);font-size:12px}'
    + '.cham{width:9px;height:9px;border-radius:50%;display:inline-block}'
    + '.luoi{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr))}'
    + '.o{padding:10px 13px;box-shadow:0 0 0 1px var(--mem);display:flex;flex-direction:column}'
    + '.o .nhan{font-size:10px;color:var(--nhat);font-weight:650;text-transform:uppercase;letter-spacing:.04em}'
    + '.o .so{font-size:20px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}'
    + '.o .lech,.o .ghi{font-size:11.5px;margin-top:auto;padding-top:4px;color:var(--nhat)}'
    + '.o .lech.tot{color:var(--luc);font-weight:600}.o .lech.xau{color:var(--do);font-weight:600}'
    + 'table{width:100%;border-collapse:collapse;font-size:13px}'
    + 'th,td{padding:6px 14px;text-align:left;border-bottom:1px solid var(--mem)}'
    + 'th{font-size:10px;color:var(--nhat);text-transform:uppercase;letter-spacing:.04em;background:#fbfcfe}'
    + '.r{text-align:right;font-variant-numeric:tabular-nums}'
    + '.loi{margin:12px 14px;color:var(--do)}'
    + '.chan{margin-top:26px;color:var(--nhat);font-size:12px;border-top:1px solid var(--vien);padding-top:12px}'
    + '@media print{body{background:#fff}.trang{padding:0}.base{break-inside:avoid;box-shadow:none}}'
    + '</style></head><body><div class="trang">'
    + '<h1>Báo cáo Marketing</h1>'
    + '<div class="ky">Kỳ ' + ngay(d.tu) + ' – ' + ngay(d.den) + ' (' + d.soNgay + ' ngày)'
    + ' · so với kỳ trước ' + ngay(d.kyTruoc.tu) + ' – ' + ngay(d.kyTruoc.den)
    + ' · ' + d.soChay + '/' + d.soApp + ' base đọc được</div>'
    + khoi
    + '<div class="chan">Xuất lúc ' + new Date(d.luc).toLocaleString('vi-VN')
    + ' bởi ' + hEsc(nx.ten) + ' · Marketing Hub — Báo cáo &amp; KPI.'
    + ' Số liệu đọc trực tiếp từ các base tại thời điểm xuất; base nào không đọc được đã ghi rõ.'
    + '</div></div></body></html>';
}

/** Một ô CSV. Số giữ nguyên dấu chấm thập phân để Excel còn tính được. */
function oCsv(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Làm tròn lên cho số mục tiêu dễ đọc: 1.267.179 → 1.300.000.
 * Dưới 100 thì làm tròn về số nguyên: mục tiêu "5,5 lượt follow" hay "8,8 lead"
 * là số vô nghĩa — không ai đếm được nửa cái lead.
 */
function lamTron(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 100) return Math.max(1, Math.ceil(n));
  const bac = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.ceil(n / bac) * bac;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/api/')) {
    api(req, res, u).catch((e) => fail(res, 500, e.message));
    return;
  }
  serveStatic(req, res, u.pathname);
});

server.listen(PORT, BIND, () => {
  console.log('Báo cáo & KPI  →  http://localhost:' + PORT);
  if (!store.coLichSu()) {
    console.log('  ⚠ chưa có du-lieu/lich-su-2026.json — chạy bước nhập lịch sử trước');
  } else {
    console.log('  ' + store.danhSachThang().length + ' tháng có dữ liệu');
  }
});
