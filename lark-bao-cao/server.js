'use strict';
/**
 * ============================================================================
 * App "Báo cáo công việc" — nhân sự nộp báo cáo ngày/tuần/tháng vào Lark Base
 * ============================================================================
 * Chạy: node server.js  →  http://localhost:5183
 *
 * Chỉ nghe 127.0.0.1: app này vào thẳng Base của phòng, không có lý do gì để mở
 * ra mạng ngoài. Trên Render thì đặt BIND=0.0.0.0 và chạy sau cổng đăng nhập của
 * hub, không bao giờ đứng một mình.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const K = require('./ky');
const kho = require('./kho');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

const BIND = process.env.BIND || '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');

/* ---------------- trả lời ---------------- */

function gui(res, ma, than, headers = {}) {
  const buf = Buffer.isBuffer(than) ? than : Buffer.from(String(than), 'utf8');
  res.writeHead(ma, Object.assign({ 'Content-Length': buf.length }, headers));
  res.end(buf);
}

const json = (res, o, ma = 200) =>
  gui(res, ma, JSON.stringify(o), { 'Content-Type': 'application/json; charset=utf-8' });

const loi = (res, ma, thong, code) =>
  json(res, code ? { error: thong, code } : { error: thong }, ma);

function docThan(req, tran = 1024 * 1024) {
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

/* Phiên lark-cli đổi rất chậm — hỏi lại mỗi request là thêm một lần chạy tiến
 * trình con cho mỗi cú bấm. */
let demToi = { luc: 0, nguoi: null };

/**
 * Danh tính người gọi.
 *
 * Qua hub: hub đã quyết xong ai là ai, ai là quản lý, và gửi kết luận xuống bằng
 * header. App con KHÔNG tự quyết lại — hub là nơi duy nhất giữ bảng phân quyền.
 *
 * Chạy một mình trên máy (không có header): lấy phiên lark-cli, và coi là quản
 * lý. Đây là máy của trưởng phòng, app chỉ nghe 127.0.0.1, và cách duy nhất để
 * chạy được kiểu này là ngồi trước chính máy đó.
 */
async function aiGoi(req) {
  const h = req.headers || {};
  const de = (v) => { try { return decodeURIComponent(v || ''); } catch (_) { return v || ''; } };
  /* Nhận biết "đến từ hub" bằng SỰ CÓ MẶT của header, không bằng giá trị.
   *
   * Bản đầu viết `if (h['x-hub-user-id'] || ...)`, nên một request từ hub mà
   * hụt danh tính (chuỗi rỗng) rơi thẳng xuống nhánh chạy-một-mình bên dưới —
   * và nhánh đó lấy phiên lark-cli của MÁY rồi tự cấp quyền quản lý. Kết quả:
   * phiếu được ghi đứng tên anh Hùng, với quyền quản lý, từ một request không
   * biết là của ai. Bộ test bắt được; đừng gộp hai nhánh này lại lần nữa. */
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

/**
 * Người mà request này đang thao tác lên.
 *
 * Nhân sự chỉ được là chính mình — không đọc `?nguoi=` từ client, vì đó là thứ
 * ai cũng sửa được trong thanh địa chỉ. Quản lý thì được xem phiếu người khác,
 * nhưng vẫn CHỈ XEM: mọi đường ghi bên dưới đều dùng `toi`, không dùng cái này.
 */
function nguoiXem(toi, q) {
  const xin = (q.get('nguoi') || '').trim();
  if (!xin || !toi.quanLy) return toi;
  return { id: xin, ten: xin, email: xin.includes('@') ? xin : '' };
}

/* ---------------- tệp tĩnh ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function tinh(res, duong, truyVan) {
  const p = duong === '/' ? '/index.html' : duong;
  const f = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
    return gui(res, 404, 'Không có ' + p, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  let body = fs.readFileSync(f);
  const trangChu = path.basename(f) === 'index.html';
  if (trangChu) body = Buffer.from(body.toString('utf8').split('v=BUILD').join('v=' + VER), 'utf8');
  /* Cùng bài học vừa vá ở hub: trang chủ là nơi duy nhất giữ số bản của mọi file
   * khác, nên nó không được nằm trong cache. File có kèm số bản thì cache thoải
   * mái — đổi file là đổi số bản, tức là đổi luôn địa chỉ. */
  gui(res, 200, body, {
    'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
    'Cache-Control': !trangChu && /[?&]v=/.test(truyVan || '')
      ? 'public, max-age=31536000' : 'no-store',
  });
}

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

/* ---------------- dựng câu trả lời ---------------- */

/** Phiếu Base -> object cho giao diện, kèm mọi thứ đã tính sẵn. */
function vePhieu(p) {
  if (!p) return null;
  const loai = p.loaiKy === cfg.chon.loaiKy.tuan ? 'tuan'
    : p.loaiKy === cfg.chon.loaiKy.thang ? 'thang' : 'ngay';
  const k = { loai, tu: p.tuNgay, den: p.denNgay };
  const daNop = p.trangThai === cfg.chon.trangThaiPhieu.daNop;
  const cham = K.chamHan(k, daNop ? p.nopLuc : null);
  return {
    id: p.id,
    ma: p.ma,
    loaiKy: loai,
    tu: p.tuNgay,
    den: p.denNgay,
    nhan: loai === 'ngay' ? K.veNgayThu(p.tuNgay)
      : K.veNgay(p.tuNgay) + ' – ' + K.veNgay(p.denNgay),
    nguoi: p.nguoi,
    email: p.email,
    tenNguoi: p.tenNguoi,
    ca: p.ca,
    dinhMuc: p.dinhMuc,
    tongPhut: p.tongPhut,
    tongGio: K.vePhut(p.tongPhut),
    phanTram: p.phanTram,
    nhanDinh: p.nhanDinh,
    keHoach: p.keHoach,
    daNop,
    nopLuc: p.nopLuc || 0,
    hanNop: p.hanNop || K.hanNop(k),
    dungHan: p.dungHan,
    trePhut: p.trePhut,
    trangThaiHan: cham.trangThai,
    veHan: cham.trangThai === 'dung-han' ? 'Đúng hạn'
      : cham.trangThai === 'tre' ? K.veTre(cham.treMs)
        : cham.trangThai === 'thieu' ? 'Chưa nộp, đã quá hạn' : 'Chưa tới hạn',
    danhGiaAI: p.danhGiaAI,
    diemAI: p.diemAI,
  };
}

/* ---------------- API ---------------- */

async function api(req, res, u) {
  const p = u.pathname;
  const q = u.searchParams;
  const m = req.method;
  const toi = await aiGoi(req);
  const moc = () => {
    const v = Number(q.get('moc'));
    return Number.isFinite(v) && v > 0 ? v : Date.now();
  };
  const loaiKy = () => {
    const v = q.get('ky') || 'ngay';
    return ['ngay', 'tuan', 'thang'].includes(v) ? v : 'ngay';
  };

  if (p === '/api/meta' && m === 'GET') {
    const nay = Date.now();
    return json(res, {
      toi,
      cheDo: cfg.mode,
      larkUrl: cfg.larkUrl,
      bayGio: nay,
      homNay: K.veNgayThu(nay),
      ca: Object.entries(cfg.chon.ca).map(([ma, ten]) => ({ ma, ten, phut: K.CA[ma].phut })),
      nhomViec: cfg.chon.nhomViec,
      trangThaiViec: cfg.chon.trangThaiViec,
      ky: {
        ngay: K.kyNgay(nay),
        tuan: K.kyTuan(nay),
        thang: K.kyThang(nay),
      },
      han: {
        ngay: K.hanNop(K.kyNgay(nay)),
        tuan: K.hanNop(K.kyTuan(nay)),
        thang: K.hanNop(K.kyThang(nay)),
      },
    });
  }

  /* Một phiếu cụ thể để mở ra sửa. */
  if (p === '/api/phieu' && m === 'GET') {
    const ai = nguoiXem(toi, q);
    const d = await kho.motPhieu(loaiKy(), moc(), ai, q.get('moi') === '1');
    const ra = {
      ma: d.ma,
      ky: d.ky,
      nhan: d.ky.loai === 'ngay' ? K.veNgayThu(d.ky.tu) : d.ky.nhan,
      han: K.hanNop(d.ky),
      cuaAi: { id: ai.id, ten: ai.ten, email: ai.email },
      phieu: vePhieu(d.phieu),
      dong: d.dong.map((x) => ({
        congViec: x.congViec, nhom: x.nhom, phut: x.phut,
        tienDo: x.tienDo, trangThai: x.trangThai, ghiChu: x.ghiChu,
      })),
    };
    /* Tuần/tháng: số do máy cộng, gửi kèm luôn để màn hình không phải gọi lần hai. */
    if (d.ky.loai !== 'ngay') {
      const t = await kho.tongHop(d.ky.loai, d.ky.tu, ai);
      ra.tongHop = {
        soPhieuNgay: t.soPhieuNgay,
        tongPhut: t.tongPhut,
        tongGio: K.vePhut(t.tongPhut),
        dinhMucPhut: t.dinhMucPhut,
        phanTram: t.phanTram,
        theoNhom: t.theoNhom,
        ngayThieu: t.ngayThieu.map((x) => ({ ms: x, nhan: K.veNgayThu(x) })),
        phieuNgay: t.phieuNgay.map(vePhieu),
      };
    }
    return json(res, ra);
  }

  /* Lưu nháp hoặc nộp. Luôn ghi cho CHÍNH NGƯỜI GỌI — quản lý cũng không nộp hộ
   * được, vì báo cáo đứng tên ai thì người đó phải là người gõ. */
  if (p === '/api/phieu' && m === 'POST') {
    if (!toi.id && !toi.email) {
      return loi(res, 401, 'Chưa nhận ra anh/chị là ai — thử đăng nhập lại.', 'KHONG_RO_NGUOI');
    }
    const b = await docThan(req);
    const loai = ['ngay', 'tuan', 'thang'].includes(b.loaiKy) ? b.loaiKy : 'ngay';
    /* Nộp phiếu ngày mà không có đầu việc nào thì không phải báo cáo, chỉ là
     * một dòng trống đứng tên người ta — và nó vẫn được chấm "đúng hạn", tức
     * là bảng theo dõi báo xanh cho người chưa làm gì. Giao diện đã chặn, nhưng
     * giao diện không phải hàng rào: ai cũng gọi thẳng API được. */
    if (loai === 'ngay' && b.nop !== false &&
        !(Array.isArray(b.dong) && b.dong.some((d) => String(d && d.congViec || '').trim() ||
          Number(d && d.phut) > 0))) {
      return loi(res, 400, 'Chưa có đầu việc nào để nộp.', 'PHIEU_RONG');
    }
    const mocB = Number(b.moc) > 0 ? Number(b.moc) : Date.now();
    const nop = b.nop !== false;

    try {
      const r = loai === 'ngay'
        ? await kho.luuNgay({
          nguoi: toi, ngayMs: mocB, ca: b.ca || 'ngay', dinhMucTay: b.dinhMucTay,
          dong: b.dong || [], nhanDinh: b.nhanDinh, keHoach: b.keHoach, nop,
        })
        : await kho.luuTongHop({
          nguoi: toi, loaiKy: loai, mocMs: mocB,
          nhanDinh: b.nhanDinh, keHoach: b.keHoach, nop,
        });
      return json(res, {
        ok: true,
        ma: r.ma,
        moi: r.phieu.moi,
        nop,
        tong: r.tong,
        han: K.hanNop(r.ky),
        cham: r.cham,
        veHan: r.cham
          ? (r.cham.trangThai === 'dung-han' ? 'Đúng hạn' : K.veTre(r.cham.treMs))
          : 'Đã lưu nháp',
      });
    } catch (e) {
      return loi(res, 502, 'Base không nhận: ' + e.message);
    }
  }

  /* Danh sách phiếu — của tôi, hoặc của cả phòng nếu là quản lý. */
  if (p === '/api/danh-sach' && m === 'GET') {
    const caPhong = q.get('ca-phong') === '1' && toi.quanLy;
    const tu = Number(q.get('tu')) || K.kyThang(Date.now()).tu;
    const den = Number(q.get('den')) || Date.now();
    const ds = await kho.dsPhieu({
      loaiKy: q.get('ky') || undefined,
      nguoi: caPhong ? null : toi,
      tu, den,
    }, q.get('moi') === '1');
    return json(res, { tu, den, caPhong, ds: ds.map(vePhieu) });
  }

  /**
   * Bảng theo dõi: ai đã nộp, ai chưa, ai trễ — trong một khoảng.
   * Đây là câu anh Hùng đang phải trả lời bằng cách cuộn nhóm chat mỗi chiều.
   */
  if (p === '/api/theo-doi' && m === 'GET') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý xem được bảng này.', 'CHI_QUAN_LY');
    const tu = Number(q.get('tu')) || K.kyTuan(Date.now()).tu;
    const den = Number(q.get('den')) || Date.now();
    const ds = await kho.dsPhieu({ loaiKy: 'ngay', tu, den }, q.get('moi') === '1');

    const theoNguoi = new Map();
    for (const p0 of ds) {
      const khoa = p0.email || p0.nguoi || '?';
      if (!theoNguoi.has(khoa)) {
        theoNguoi.set(khoa, { khoa, ten: p0.tenNguoi || khoa, email: p0.email, id: p0.nguoi, phieu: [] });
      }
      theoNguoi.get(khoa).phieu.push(p0);
    }

    const denThat = Math.min(den, Date.now());
    const nguoi = [...theoNguoi.values()].map((n) => {
      const daNop = n.phieu.filter((x) => x.trangThai === cfg.chon.trangThaiPhieu.daNop);
      const tre = daNop.filter((x) => x.dungHan === cfg.chon.dungHan.tre);
      const thieu = K.ngayThieu(tu, denThat, daNop.map((x) => x.tuNgay));
      return {
        ten: n.ten, id: n.id, email: n.email,
        soNgayDaNop: daNop.length,
        soTre: tre.length,
        tongPhut: daNop.reduce((s, x) => s + (x.tongPhut || 0), 0),
        thieu: thieu.map((x) => ({ ms: x, nhan: K.veNgay(x) })),
      };
    }).sort((a, b) => b.thieu.length - a.thieu.length || a.ten.localeCompare(b.ten));

    return json(res, {
      tu, den, soNgayCong: K.ngayThieu(tu, denThat, []).length, nguoi,
    });
  }

  /** Xuất CSV — "trích xuất báo cáo nhanh hơn", đúng nguyên văn yêu cầu. */
  if (p === '/api/xuat' && m === 'GET') {
    const caPhong = q.get('ca-phong') === '1' && toi.quanLy;
    const tu = Number(q.get('tu')) || K.kyThang(Date.now()).tu;
    const den = Number(q.get('den')) || Date.now();
    const dong = await kho.dsDong({ nguoi: caPhong ? null : toi, tu, den }, true);
    const o = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const dongCsv = [
      ['Ngày', 'Người', 'Email', 'Công việc', 'Nhóm việc', 'Số phút', 'Tiến độ', 'Trạng thái', 'Ghi chú']
        .map(o).join(','),
      ...dong
        .sort((a, b) => a.ngay - b.ngay || (a.tenNguoi || '').localeCompare(b.tenNguoi || ''))
        .map((d) => [K.veNgay(d.ngay), d.tenNguoi, d.email, d.congViec, d.nhom,
          d.phut, d.tienDo, d.trangThai, d.ghiChu].map(o).join(',')),
    ].join('\r\n');
    /* BOM để Excel mở ra không thành "Ba?o ca?o" — phòng này mở CSV bằng Excel,
     * không phải bằng trình soạn thảo. */
    return gui(res, 200, Buffer.from('﻿' + dongCsv, 'utf8'), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bao-cao-' +
        K.veNgay(tu).replace(/\//g, '') + '-' + K.veNgay(den).replace(/\//g, '') + '.csv"',
    });
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
    console.log('Báo cáo công việc — http://localhost:' + cfg.port +
      '  [' + cfg.mode + ']  bản ' + VER);
  });
}

module.exports = { server, aiGoi, nguoiXem, vePhieu, VER };
