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
const ND = require('./nhan-dinh');
const VT = require('./viec-tracking');
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
    canHoTro: p.canHoTro,
    linkVideo: p.linkVideo,
    daNop,
    nopLuc: p.nopLuc || 0,
    hanNop: p.hanNop || K.hanNop(k),
    dungHan: p.dungHan,
    trePhut: p.trePhut,
    suaLuc: p.suaLuc || 0,
    soLanNop: p.soLanNop || 0,
    trangThaiHan: cham.trangThai,
    /* Nộp bù là một MỨC của trễ, không phải trạng thái thứ năm — xem ky.js. */
    nopBu: !!cham.bu,
    veHan: K.veLanNop(cham),
    danhGiaAI: p.danhGiaAI,
    diemAI: p.diemAI,
  };
}

/**
 * Đổi lỗi của Lark thành câu người dùng làm được gì với nó.
 *
 * "Lark API 91403: you don't have permission" thì đúng nhưng vô dụng: người
 * đọc không biết ai thiếu quyền gì, và càng không biết phải nhờ ai. Mã 91403
 * ở app này gần như luôn là một chuyện duy nhất — Base do một người tạo, còn
 * bản trên Render ghi bằng danh nghĩa APP Lark, và app đó chưa được mời vào
 * Base. Nói thẳng ra thế thì người quản lý tự xử lý được trong hai phút.
 */
function dichLoiBase(e) {
  const m = String((e && e.message) || '');
  if (/91403|permission denied|you don't have permission/i.test(m)) {
    return 'App Lark chưa được cấp quyền vào Base "Báo cáo công việc MKT". ' +
      'Mở Base → Chia sẻ → thêm ứng dụng (App ID ' + (cfg.appId || 'của Marketing Hub') +
      ') với quyền Chỉnh sửa. Báo cáo vừa gõ vẫn còn trên màn hình, nộp lại sau khi cấp.';
  }
  if (/1254291|1254036|99991400|rate/i.test(m)) {
    return 'Base đang bận, thử lại sau vài giây. Nội dung vừa gõ vẫn còn trên màn hình.';
  }
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(m)) {
    return 'Không nối được tới Lark. Nội dung vừa gõ vẫn còn trên màn hình, thử nộp lại.';
  }
  return 'Base không nhận: ' + m;
}

function maLoiBase(e) {
  const m = String((e && e.message) || '');
  if (/91403|permission denied|you don't have permission/i.test(m)) return 'THIEU_QUYEN_BASE';
  return 'BASE_LOI';
}

/**
 * Gom phiếu về từng NGƯỜI.
 *
 * Không gom bằng một khoá chuỗi (`email || open_id`) như bản đầu: open_id do
 * TỪNG app Lark cấp riêng, nên cùng một người mở bản trên máy và bản trên Render
 * sẽ ra hai id khác nhau — anh Hùng hiện thành hai dòng trong bảng Theo dõi,
 * mỗi dòng một nửa số phiếu. `kho.cungNguoi()` đã biết chuyện này từ đầu nhưng
 * hai màn quản lý lại không dùng tới nó.
 *
 * Cách gom: mỗi nhóm giữ TẬP id và TẬP email đã gặp. Một phiếu nhập được vào
 * nhóm nếu trùng bất kỳ khoá nào — nhờ đó chuỗi id1–email–id2 nối lại thành một
 * người, dù id1 và id2 chẳng liên quan gì nhau.
 */
function gomNguoi(ds) {
  const nhom = [];
  for (const p of ds) {
    const mail = String(p.email || '').trim().toLowerCase();
    const id = String(p.nguoi || '').trim();
    let n = nhom.find((x) => (mail && x.email.has(mail)) || (id && x.id.has(id)));
    if (!n) {
      n = { id: new Set(), email: new Set(), ten: '', phieu: [] };
      nhom.push(n);
    }
    if (id) n.id.add(id);
    if (mail) n.email.add(mail);
    if (!n.ten && p.tenNguoi) n.ten = p.tenNguoi;
    n.phieu.push(p);
  }
  return nhom.map((n) => ({
    ten: n.ten || [...n.email][0] || [...n.id][0] || '?',
    id: [...n.id][0] || '',
    email: [...n.email][0] || '',
    phieu: n.phieu,
  }));
}

/** Gom dòng việc theo ngày — đầu vào của ND.timDungYen(). */
function nhomTheoNgay(dong) {
  const m = new Map();
  for (const d of dong) {
    const n = K.dauNgay(d.ngay);
    if (!m.has(n)) m.set(n, []);
    m.get(n).push(d);
  }
  return m;
}

/**
 * Bối cảnh để nhận định: những thứ chỉ thấy được khi nhìn rộng hơn một phiếu.
 * Với kỳ ngày thì nhìn lại 14 ngày, đủ để phát hiện đầu việc đứng yên mà không
 * phải đọc cả tháng.
 */
async function boiCanhCho(loai, k, ai, phieu) {
  const tu = loai === 'ngay' ? k.tu - 14 * K.NGAY : k.tu;
  const den = k.den;
  const dongRong = await kho.dsDong({ nguoi: ai, tu, den });
  const dongKy = dongRong.filter((d) => d.ngay >= k.tu && d.ngay <= k.den);
  const daNop = (await kho.dsPhieu({ loaiKy: 'ngay', nguoi: ai, tu: k.tu, den: k.den }))
    .filter((x) => x.trangThai === cfg.chon.trangThaiPhieu.daNop)
    .map((x) => x.tuNgay);
  return {
    dongKy,
    dungYen: ND.timDungYen(nhomTheoNgay(dongRong)),
    /* Kỳ ngày không có khái niệm "ngày thiếu" — chính nó là một ngày. */
    ngayThieu: loai === 'ngay' ? []
      : K.ngayThieu(k.tu, Math.min(k.den, Date.now()), daNop),
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
        tienDoPt: x.tienDoPt, maViec: x.maViec,
        tienDo: x.tienDo, trangThai: x.trangThai, ghiChu: x.ghiChu,
      })),
    };
    /* Tuần/tháng: số do máy cộng, gửi kèm luôn để màn hình không phải gọi lần hai. */
    if (d.ky.loai !== 'ngay') {
      const t = await kho.tongHop(d.ky.loai, d.ky.tu, ai);
      /* Nguyên liệu để người viết tổng hợp thành đánh giá tuần — anh Hùng:
       * "nó cần thể hiện được tổng các báo cáo đã nộp, các công việc; nội dung
       * đánh giá công việc và nhận định". Bốn con số tổng thì đúng nhưng không
       * viết ra được câu nào. */
      const viec = K.gopTheoViec(t.dong);
      const theoNgay = t.phieuNgay.map(vePhieu).map((p) => ({
        tu: p.tu,
        nhan: K.veNgayThu(p.tu),
        tongGio: p.tongGio,
        phanTram: p.phanTram,
        trangThaiHan: p.trangThaiHan,
        veHan: p.veHan,
        nhanDinh: p.nhanDinh,
        keHoach: p.keHoach,
        canHoTro: p.canHoTro,
        soViec: t.dong.filter((d) => K.dauNgay(d.ngay) === p.tu).length,
      })).sort((a, b) => a.tu - b.tu);

      ra.tongHop = {
        soPhieuNgay: t.soPhieuNgay,
        tongPhut: t.tongPhut,
        tongGio: K.vePhut(t.tongPhut),
        dinhMucPhut: t.dinhMucPhut,
        dinhMucGio: K.vePhut(t.dinhMucPhut),
        phanTram: t.phanTram,
        theoNhom: t.theoNhom.map((n) => ({ ...n, gio: K.vePhut(n.phut) })),
        ngayThieu: t.ngayThieu.map((x) => ({ ms: x, nhan: K.veNgayThu(x) })),
        phieuNgay: t.phieuNgay.map(vePhieu),
        viec: viec.map((v) => ({ ...v, gio: K.vePhut(v.tongPhut) })),
        theoNgay,
        /* Gom mọi câu người đã tự viết trong kỳ về một chỗ, kèm ngày, để đọc
         * lại mà tổng hợp. Đây là thứ ảnh chụp màn hình không bao giờ cho
         * được: muốn đọc lại bảy ngày thì phải mở bảy tấm ảnh. */
        daViet: [
          ...theoNgay.filter((n) => String(n.nhanDinh || '').trim())
            .map((n) => ({ ngay: n.nhan, loai: 'Nhận định', chu: n.nhanDinh })),
          ...theoNgay.filter((n) => String(n.canHoTro || '').trim())
            .map((n) => ({ ngay: n.nhan, loai: 'Cần hỗ trợ', chu: n.canHoTro })),
          ...viec.flatMap((v) => v.ghiChu.map((g) => ({
            ngay: K.veNgayThu(g.ms), loai: v.ten, chu: g.chu,
          }))),
        ],
      };

      /* ---- so với THÁNG TRƯỚC ----
       *
       * Chỉ tháng, không làm cho tuần: anh Hùng chốt vậy (14/09).
       *
       * Một con số đứng một mình không trả lời được gì — 152 giờ là nhiều hay
       * ít? Phải có tháng trước đứng cạnh mới thành câu trả lời.
       *
       * Tháng đang chạy dở thì tháng trước cũng chỉ tính bằng ngần ấy ngày
       * (xem K.mocSoSanh), không thì mùng 3 tháng nào cũng báo tụt 90%.
       *
       * Cộng thêm một kỳ nữa nhưng KHÔNG tốn thêm lượt gọi Lark: docTat() đang
       * giữ đệm, hai lần cộng này ăn cùng một mẻ dữ liệu. */
      if (d.ky.loai === 'thang') {
        const moc = K.mocSoSanh(d.ky, Date.now());
        const tTruoc = await kho.tongHop('thang', moc.mocMs, ai, false, moc.denToiDa);
        ra.tongHop.kyTruoc = K.soSanh(t, tTruoc,
          { nhan: tTruoc.ky.nhan, dayDu: moc.dayDu, soNgay: moc.soNgay });
      }
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
          dong: b.dong || [], nhanDinh: b.nhanDinh, keHoach: b.keHoach,
          canHoTro: b.canHoTro, linkVideo: b.linkVideo, nop,
        })
        : await kho.luuTongHop({
          nguoi: toi, loaiKy: loai, mocMs: mocB,
          nhanDinh: b.nhanDinh, keHoach: b.keHoach, canHoTro: b.canHoTro,
          linkVideo: b.linkVideo, nop,
        });
      return json(res, {
        ok: true,
        ma: r.ma,
        moi: r.phieu.moi,
        nop,
        tong: r.tong,
        han: K.hanNop(r.ky),
        cham: r.cham,
        soLanNop: r.soLanNop,
        nopBu: !!(r.cham && r.cham.bu),
        /* Dùng đúng câu chung của ky.js — viết lại ở đây là sớm muộn hai chỗ
         * nói khác nhau, mà chỗ này lại là câu người dùng đọc ngay sau khi bấm
         * Nộp. Bản trước tự ghép nên mất luôn chữ "Nộp bù". */
        veHan: r.cham ? K.veLanNop(r.cham) : 'Đã lưu nháp',
      });
    } catch (e) {
      return loi(res, 502, dichLoiBase(e), maLoiBase(e));
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


    const denThat = Math.min(den, Date.now());
    const soNgayCong = K.ngayThieu(tu, denThat, []).length;

    /**
     * Bốn nhóm, không phải hai. Anh Hùng muốn "kiểm soát được nhân sự báo cáo
     * đúng ngày, hay nhân sự báo cáo trễ và báo cáo bù" — ba thứ đó khác nhau
     * về mức độ, gộp lại thành "chưa đúng hạn" là mất đúng cái phân biệt ấy.
     */
    const nguoi = gomNguoi(ds).map((n) => {
      const daNop = n.phieu.filter((x) => x.trangThai === cfg.chon.trangThaiPhieu.daNop);
      /* Đọc từ chính ô đã ghi lúc nộp, KHÔNG chấm lại bây giờ: chấm lại là lấy
       * giờ hiện tại so với hạn cũ, và mọi phiếu quá hạn đều thành trễ kể cả
       * phiếu nộp đúng giờ. Ô `Nộp lúc` giữ lần nộp đầu, ô `Nộp bù` giữ kết
       * luận — cả hai đóng băng tại thời điểm nộp. */
      const bu = daNop.filter((x) => x.nopBu);
      const tre = daNop.filter((x) => x.dungHan === cfg.chon.dungHan.tre && !x.nopBu);
      const dung = daNop.filter((x) => x.dungHan === cfg.chon.dungHan['dung-han']);
      const thieu = K.ngayThieu(tu, denThat, daNop.map((x) => x.tuNgay));
      const sua = daNop.filter((x) => (x.soLanNop || 1) > 1);
      return {
        ten: n.ten, id: n.id, email: n.email,
        soNgayDaNop: daNop.length,
        soDungHan: dung.length,
        soTre: tre.length,
        soBu: bu.length,
        soSua: sua.length,
        /* Tỷ lệ tính trên NGÀY CÔNG, không trên số phiếu đã nộp — chia cho số
         * phiếu thì người nộp đúng một ngày trong tuần vẫn ra 100%. */
        tyLeDung: soNgayCong ? Math.round((dung.length / soNgayCong) * 100) : null,
        tongPhut: daNop.reduce((s, x) => s + (x.tongPhut || 0), 0),
        treNhatPhut: daNop.reduce((m, x) => Math.max(m, x.trePhut || 0), 0),
        thieu: thieu.map((x) => ({ ms: x, nhan: K.veNgay(x) })),
      };
    }).sort((a, b) => (b.thieu.length + b.soBu) - (a.thieu.length + a.soBu)
      || b.soTre - a.soTre || a.ten.localeCompare(b.ten));

    return json(res, { tu, den, soNgayCong, nguoi });
  }

  /**
   * Đầu việc đang giao cho người này bên app Bảng công việc.
   *
   * Trả về cả `chay: false` khi Tracking không trả lời, để màn nhập nói thật
   * ("không nối được Tracking") thay vì hiện một menu rỗng — menu rỗng thì
   * người dùng tưởng mình không có việc nào.
   */
  if (p === '/api/viec-cua-toi' && m === 'GET') {
    const ai = nguoiXem(toi, q);
    try {
      /* Cờ quản lý chỉ truyền khi NGƯỜI GỌI thật sự là quản lý (`toi`), không
       * phải người đang được xem (`ai`) — nhân sự không được mượn vai ai cả. */
      const ds = await VT.vieCuaNguoi(ai, moc(), q.get('moi') === '1', toi.quanLy);
      return json(res, {
        chay: true,
        cuaAi: ai.ten || ai.email || ai.id,
        ds: ds.map((v) => Object.assign({}, v, { nhom: VT.doanNhom(v.loai, v.ten) })),
      });
    } catch (e) {
      /* Kèm cổng và nguyên văn lỗi: lần trước anh Hùng chụp màn hình gửi sang
       * mà dòng cảnh báo không nói được vì sao, phải lần ngược từ code. */
      return json(res, { chay: false, ly: e.message, cong: VT.CONG, ds: [] });
    }
  }

  /** Nhận định cho một phiếu — của tôi, hoặc của người khác nếu là quản lý. */
  if (p === '/api/nhan-dinh' && m === 'GET') {
    const ai = nguoiXem(toi, q);
    const loai = loaiKy();
    const d = await kho.motPhieu(loai, moc(), ai, q.get('moi') === '1');
    if (!d.phieu) return json(res, { co: false, y: [], diem: null });
    const phieu = vePhieu(d.phieu);
    const bc = await boiCanhCho(loai, d.ky, ai, phieu);
    const y = ND.chiMotPhieu(phieu, loai === 'ngay' ? d.dong : bc.dongKy, bc);
    return json(res, { co: true, y, diem: ND.chamDiem(y), motCau: ND.motCau(y) });
  }

  /**
   * Bảng nhận định TOÀN PHÒNG — chỉ quản lý.
   * Mỗi người một dòng: điểm, một câu đáng chú ý nhất, và các ý đầy đủ để mở ra.
   */
  if (p === '/api/toan-phong' && m === 'GET') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý xem được bảng này.', 'CHI_QUAN_LY');
    const loai = loaiKy() === 'ngay' ? 'tuan' : loaiKy();   // toàn phòng theo ngày thì quá vụn
    const k = K.ky(loai, moc());
    const moi = q.get('moi') === '1';
    const phieuNgay = (await kho.dsPhieu({ loaiKy: 'ngay', tu: k.tu, den: k.den }, moi))
      .filter((x) => x.trangThai === cfg.chon.trangThaiPhieu.daNop);
    const dongKy = await kho.dsDong({ tu: k.tu, den: k.den }, false);

    const nguoi = [];
    for (const g of gomNguoi(phieuNgay)) {
      const n = { ten: g.ten, id: g.id, email: g.email, ps: g.phieu };
      const cuaHo = dongKy.filter((d) => kho.cungNguoi(d, n));
      const dinhMuc = n.ps.reduce((s, x) => s + (x.dinhMuc || 0), 0);
      const gop = K.gop(cuaHo.map((d) => ({ nhom: d.nhom, phut: d.phut })), dinhMuc);
      const gia = {
        loaiKy: loai, tu: k.tu, den: k.den,
        daNop: true,
        trangThaiHan: n.ps.some((x) => x.dungHan === cfg.chon.dungHan.tre) ? 'tre' : 'dung-han',
        veHan: n.ps.filter((x) => x.dungHan === cfg.chon.dungHan.tre).length + ' lần nộp muộn',
        tongPhut: gop.tongPhut, dinhMuc, phanTram: gop.phanTram,
        canHoTro: n.ps.map((x) => x.canHoTro).filter(Boolean).join(' · '),
      };
      const bc = {
        ngayThieu: K.ngayThieu(k.tu, Math.min(k.den, Date.now()), n.ps.map((x) => x.tuNgay)),
        dungYen: ND.timDungYen(nhomTheoNgay(cuaHo)),
      };
      const y = ND.chiMotPhieu(gia, cuaHo, bc);
      nguoi.push({
        ten: n.ten, id: n.id, email: n.email,
        soPhieu: n.ps.length, tongPhut: gop.tongPhut, tongGio: K.vePhut(gop.tongPhut),
        phanTram: gop.phanTram, soThieu: bc.ngayThieu.length,
        diem: ND.chamDiem(y), motCau: ND.motCau(y), y,
      });
    }
    nguoi.sort((a, b) => a.diem - b.diem || a.ten.localeCompare(b.ten));
    return json(res, { ky: k, loaiKy: loai, nhan: k.nhan, nguoi });
  }

  /**
   * Vướng mắc cả phòng đang nêu, gom một chỗ — chỉ quản lý.
   * Anh Hùng: "liệt kê tổng hợp lại cái vấn đề cần giúp đỡ của nhân viên".
   */
  if (p === '/api/can-ho-tro' && m === 'GET') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý xem được bảng này.', 'CHI_QUAN_LY');
    const tu = Number(q.get('tu')) || K.kyTuan(Date.now()).tu;
    const den = Number(q.get('den')) || Date.now();
    const ds = (await kho.dsPhieu({ tu, den }, q.get('moi') === '1'))
      .filter((x) => String(x.canHoTro || '').trim())
      .map((x) => ({
        ten: x.tenNguoi || x.email || x.nguoi,
        id: x.nguoi, email: x.email,
        loaiKy: x.loaiKy, nhan: K.veNgay(x.tuNgay),
        tu: x.tuNgay, noi: x.canHoTro,
        daNop: x.trangThai === cfg.chon.trangThaiPhieu.daNop,
      }))
      .sort((a, b) => b.tu - a.tu);
    return json(res, { tu, den, ds });
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

module.exports = { server, aiGoi, nguoiXem, vePhieu, dichLoiBase, maLoiBase, VER };
