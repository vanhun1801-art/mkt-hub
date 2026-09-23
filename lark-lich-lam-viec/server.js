'use strict';
/**
 * ============================================================================
 * App "Lịch làm việc" — nhân sự đăng ký lịch tháng, quản lý chép sang HCNS
 * ============================================================================
 * Chạy: node server.js  →  http://localhost:5185
 *
 * Chỉ nghe 127.0.0.1 — trên Render chạy sau cổng đăng nhập của hub (BIND=0.0.0.0
 * không bao giờ được đặt khi app đứng một mình).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const MA = require('./ma-cong');
const kho = require('./kho');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

const BIND = process.env.BIND || '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');
const p2 = (n) => String(n).padStart(2, '0');

/* ---------------- trả lời ---------------- */
function gui(res, ma, than, headers = {}) {
  const buf = Buffer.isBuffer(than) ? than : Buffer.from(String(than), 'utf8');
  res.writeHead(ma, Object.assign({ 'Content-Length': buf.length }, headers));
  res.end(buf);
}
const json = (res, o, ma = 200) =>
  gui(res, ma, JSON.stringify(o), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
const loi = (res, ma, thong, code) => json(res, code ? { error: thong, code } : { error: thong }, ma);

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
 * Danh tính người gọi — cùng cách của app Báo cáo: có header của hub thì tin
 * hub (nhận biết bằng SỰ CÓ MẶT của header, không bằng giá trị — xem chú thích
 * aiGoi() bên lark-bao-cao/server.js); chạy một mình thì lấy phiên lark-cli và
 * coi là quản lý, vì chỉ ngồi trước chính máy đó mới gọi được 127.0.0.1.
 */
async function aiGoi(req) {
  const h = req.headers || {};
  const de = (v) => { try { return decodeURIComponent(v || ''); } catch (_) { return v || ''; } };
  if (['x-hub-user-id', 'x-hub-user-email', 'x-hub-user-name'].some((k) => k in h)) {
    return {
      id: h['x-hub-user-id'] || '',
      ten: de(h['x-hub-user-name']) || h['x-hub-user-id'] || '',
      email: de(h['x-hub-user-email']).toLowerCase(),
      quanLy: h['x-hub-user-manager'] === '1',
      quaHub: true,
    };
  }
  if (Date.now() - demToi.luc < 60000 && demToi.nguoi) return demToi.nguoi;
  let u = null;
  try { u = await lark.whoami(); } catch (_) { u = null; }
  const n = { id: (u && u.id) || '', ten: (u && u.name) || 'Chưa đăng nhập', email: '', quanLy: true, quaHub: false };
  demToi = { luc: Date.now(), nguoi: n };
  return n;
}

/* ---------------- tệp tĩnh ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml',
};
const VER = (() => {
  let t = 0;
  try {
    for (const f of fs.readdirSync(PUBLIC)) {
      try { const st = fs.statSync(path.join(PUBLIC, f)); if (st.isFile()) t = Math.max(t, st.mtimeMs); } catch (_) {}
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
  gui(res, 200, body, {
    'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
    'Cache-Control': !trangChu && /[?&]v=/.test(truyVan || '') ? 'public, max-age=31536000' : 'no-store',
  });
}

/* ---------------- tiện ích nghiệp vụ ---------------- */
const thangNay = () => { const t = MA.vn(Date.now()); return MA.veThang(t.nam, t.thang); };

function thangHopLe(s) {
  return MA.docThang(s) ? s : '';
}

/** Kỳ đăng ký hiện tại (đang mở hoặc sắp mở), theo cấu hình trên Base. */
async function kyHienTai(moi) {
  const ch = await kho.docCauHinh(moi);
  return Object.assign({ ch }, MA.cuaSo(Date.now(), ch));
}

/** Tháng mở sẵn khi vào app — xem MA.thangXem. */
let thangMacDinhDem = '';
const thangMacDinh = () => thangMacDinhDem || thangNay();
async function napThangMacDinh() {
  thangMacDinhDem = MA.thangXem(Date.now(), await kho.docCauHinh());
  return thangMacDinhDem;
}

/** Lưới của một người trong một tháng: lịch chuẩn + lịch đã đăng ký (nếu có). */
function luoiThang(thang, le, phieu) {
  const { nam, thang: th } = MA.docThang(thang);
  const chuan = MA.lichChuan(thang, le.map((x) => x.ngay));
  const tenLe = new Map(le.map((x) => [x.ngay, x.ten]));
  /* Đã có phiếu thì ô trống là TRỐNG (người nghỉ việc giữa tháng — xem dòng
   * Quỳnh tháng 9 bên HCNS), không lấp bằng lịch chuẩn. Lịch chuẩn chỉ để gợi ý
   * khi người đó chưa đăng ký gì. */
  const ma = chuan.map((c, i) => (phieu ? (MA.laMa(phieu.ngay[i]) ? phieu.ngay[i] : '') : c));
  return {
    ma,
    ngay: chuan.map((c, i) => {
      const k = thang + '-' + p2(i + 1);
      return { d: i + 1, thu: MA.thuCua(nam, th, i + 1), chuan: c, ma: ma[i], le: tenLe.get(k) || '' };
    }),
  };
}

function vePhieu(p) {
  if (!p) return null;
  return {
    recordId: p.recordId, trangThai: p.trangThai, daNop: kho.daNop(p),
    nopLuc: p.nopLuc, suaLuc: p.suaLuc, chuyenLuc: p.chuyenLuc, suaSau: p.suaSau, ghiChu: p.ghiChu,
  };
}

/** Đăng ký là CỐ ĐỊNH theo kỳ: nhân sự chỉ sửa được đúng tháng của kỳ đang mở.
 *  Ngoài kỳ, hoặc tháng khác, chỉ quản lý sửa (xin nghỉ đột xuất thì quản lý ghi hộ). */
const suaDuoc = (toi, thang, ky) => toi.quanLy || (!!ky && ky.dangMo && thang === ky.thang);

function dichLoiBase(e) {
  const m = String((e && e.message) || '');
  if (/91403|permission denied|you don't have permission/i.test(m)) {
    return 'App Lark chưa được cấp quyền vào Base "Lịch làm việc MKT". Mở Base → Chia sẻ → thêm ứng dụng ' +
      '(App ID ' + (cfg.appId || 'của Marketing Hub') + ') với quyền Chỉnh sửa. Lịch vừa chọn vẫn còn trên màn hình.';
  }
  if (/1254291|1254036|99991400|800004135|limited|rate/i.test(m)) return 'Base đang bận, thử lại sau vài giây. Lịch vừa chọn vẫn còn trên màn hình.';
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(m)) return 'Không nối được tới Lark. Lịch vừa chọn vẫn còn trên màn hình, thử lại.';
  return 'Base không nhận: ' + m;
}

/** Bảng cả phòng của một tháng — dùng chung cho màn quản lý và tệp xuất. */
async function bangCaPhong(thang, moi) {
  const [ns, le, ds] = await Promise.all([kho.dsNhanSu(moi), kho.dsNgayLe(moi), kho.dsDangKy(thang, moi)]);
  const leT = le.filter((x) => x.ngay.startsWith(thang + '-'));
  const ngLe = leT.map((x) => x.ngay);
  const hang = ns.filter((n) => n.dangLam || ds.some((p) => p.maNV && p.maNV === n.maNV)).map((n) => {
    const p = ds.find((x) => x.maNV && x.maNV === n.maNV) || null;
    const l = luoiThang(thang, leT, p);
    return {
      nhanSu: { recordId: n.recordId, hoTen: n.hoTen, maNV: n.maNV, chucVu: n.chucVu, thuTu: n.thuTu, lienKet: !!(n.nguoi || n.email) },
      phieu: vePhieu(p),
      ma: l.ma,
      tinh: MA.tinh(thang, l.ma, ngLe),
    };
  });
  const { nam, thang: th } = MA.docThang(thang);
  const ngay = Array.from({ length: MA.soNgay(nam, th) }, (_, i) => ({ d: i + 1, thu: MA.thuCua(nam, th, i + 1) }));
  return { thang, ngay, le: leT, hang, congChuan: MA.tinh(thang, MA.lichChuan(thang, ngLe), ngLe).congChuan };
}

/* ---------------- API ---------------- */
async function api(req, res, u) {
  const p = u.pathname;
  const q = u.searchParams;
  const m = req.method;
  const toi = await aiGoi(req);
  const moi = q.get('moi') === '1';
  await napThangMacDinh();

  if (p === '/api/meta' && m === 'GET') {
    const ns = await kho.dsNhanSu(moi);
    const toiLa = kho.timNhanSu(toi, ns);
    return json(res, {
      toi, toiLa,
      /* Chỉ đưa danh sách người CHƯA ai nhận để tự chọn — dòng đã gắn tài khoản
       * thì không cho người khác nhận thay. */
      chonDuoc: toiLa ? [] : ns.filter((x) => x.dangLam && !x.nguoi && !x.email)
        .map((x) => ({ recordId: x.recordId, hoTen: x.hoTen, chucVu: x.chucVu })),
      maCong: MA.DANH_SACH,
      thangMacDinh: thangMacDinh(),
      thangNay: thangNay(),
      ky: await kyHienTai(moi),
      larkUrl: cfg.larkUrl,
      hcnsUrl: cfg.hcnsUrl,
      cheDo: cfg.mode,
    });
  }

  /* Người chưa khớp được (tên Lark khác tên HCNS) tự nhận dòng của mình, một lần. */
  if (p === '/api/toi-la' && m === 'POST') {
    const b = await docThan(req);
    const ns = await kho.dsNhanSu(true);
    if (kho.timNhanSu(toi, ns)) return loi(res, 409, 'Tài khoản của bạn đã gắn với một dòng nhân sự rồi.');
    const n = ns.find((x) => x.recordId === b.recordId);
    if (!n) return loi(res, 404, 'Không có dòng nhân sự này.');
    if (n.nguoi || n.email) return loi(res, 409, 'Dòng này đã có người nhận. Nhờ quản lý kiểm tra lại bảng Nhân sự.');
    if (!toi.id && !toi.email) return loi(res, 400, 'Chưa biết bạn là ai — hãy đăng nhập qua Marketing Hub.');
    return json(res, { toiLa: await kho.ganNhanSu(n, toi, true) });
  }

  if (p === '/api/thang' && m === 'GET') {
    const thang = thangHopLe(q.get('thang')) || thangMacDinh();
    const [ns, le] = await Promise.all([kho.dsNhanSu(moi), kho.dsNgayLe(moi)]);
    let n = kho.timNhanSu(toi, ns);
    const xin = q.get('nhan-su');
    if (xin && toi.quanLy) n = ns.find((x) => x.recordId === xin) || null;
    if (!n) return json(res, { thang, chuaKhop: true });
    /* Lần đầu khớp bằng tên thì gắn luôn id/email — lần sau đổi tên Lark vẫn nhận ra. */
    if (!xin && (toi.id || toi.email) && (!n.nguoi || !n.email)) {
      try { n = await kho.ganNhanSu(n, toi); } catch (_) { /* đọc vẫn chạy được */ }
    }
    const leT = le.filter((x) => x.ngay.startsWith(thang + '-'));
    const p0 = (await kho.dsDangKy(thang, moi)).find((x) => x.maNV === n.maNV) || null;
    const l = luoiThang(thang, leT, p0);
    const ngLe = leT.map((x) => x.ngay);
    const ky = await kyHienTai(moi);
    return json(res, {
      thang, nhanSu: { recordId: n.recordId, hoTen: n.hoTen, maNV: n.maNV, chucVu: n.chucVu },
      ngay: l.ngay, phieu: vePhieu(p0), tinh: MA.tinh(thang, l.ma, ngLe),
      canhBao: MA.canhBao(thang, l.ma, ngLe), suaDuoc: suaDuoc(toi, thang, ky), hoNguoi: !!xin,
      ky: { dangMo: ky.dangMo, thang: ky.thang, mo: ky.mo, dong: ky.dong },
    });
  }

  if (p === '/api/thang' && m === 'POST') {
    const b = await docThan(req);
    const thang = thangHopLe(b.thang);
    if (!thang) return loi(res, 400, 'Tháng không hợp lệ.');
    const kyGhi = await kyHienTai(true);
    if (!suaDuoc(toi, thang, kyGhi)) {
      return loi(res, 403, kyGhi.dangMo
        ? 'Kỳ đăng ký đang mở cho tháng ' + kyGhi.thang + ', không phải tháng ' + thang + '.'
        : 'Chưa tới kỳ đăng ký (hoặc kỳ đã đóng) — nhờ quản lý sửa nếu cần.');
    }
    const [ns, le] = await Promise.all([kho.dsNhanSu(true), kho.dsNgayLe(true)]);
    let n;
    if (b.nhanSu && toi.quanLy) n = ns.find((x) => x.recordId === b.nhanSu);
    else n = kho.timNhanSu(toi, ns);
    if (!n) return loi(res, 404, 'Chưa xác định được bạn trong danh sách nhân sự.');
    const { nam, thang: th } = MA.docThang(thang);
    const ma = Array.isArray(b.ma) ? b.ma.slice(0, MA.soNgay(nam, th)) : [];
    if (ma.length !== MA.soNgay(nam, th) || !ma.every(MA.laMa)) {
      return loi(res, 400, 'Còn ngày chưa chọn mã công hoặc mã không có trong bảng HCNS.');
    }
    const ngLe = kho.leCua(le, thang);
    try {
      const p1 = await kho.luuDangKy({ thang, ns: n, ma, nop: !!b.nop, ghiChu: b.ghiChu, ngayLe: ngLe });
      return json(res, { ok: true, phieu: vePhieu(p1), tinh: MA.tinh(thang, ma, ngLe), canhBao: MA.canhBao(thang, ma, ngLe) });
    } catch (e) {
      return loi(res, 502, dichLoiBase(e));
    }
  }

  /* ---- kỳ đăng ký (quản lý chỉnh ở tab Thành viên) ---- */
  if (p === '/api/cau-hinh' && m === 'GET') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý.');
    const ky = await kyHienTai(moi);
    return json(res, { ch: ky.ch, ky: { dangMo: ky.dangMo, thang: ky.thang, mo: ky.mo, dong: ky.dong } });
  }
  if (p === '/api/cau-hinh' && m === 'POST') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý.');
    const k = MA.kiemCauHinh(await docThan(req));
    if (k.loi) return loi(res, 400, k.loi);
    try { await kho.luuCauHinh(k.ch); } catch (e) { return loi(res, 502, dichLoiBase(e)); }
    const ky = MA.cuaSo(Date.now(), k.ch);
    return json(res, { ok: true, ch: k.ch, ky: { dangMo: ky.dangMo, thang: ky.thang, mo: ky.mo, dong: ky.dong } });
  }

  /* ---- tab Thành viên (quản lý) ---- */
  if (p === '/api/thanh-vien' && m === 'GET') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý.');
    const thang = thangHopLe(q.get('thang')) || thangMacDinh();
    const [ns, ds] = await Promise.all([kho.dsNhanSu(moi), kho.dsDangKy(thang, moi)]);
    return json(res, {
      thang,
      ds: ns.map((n) => {
        const p0 = ds.find((x) => x.maNV && x.maNV === n.maNV);
        return {
          recordId: n.recordId, hoTen: n.hoTen, maNV: n.maNV, chucVu: n.chucVu, thuTu: n.thuTu,
          dangLam: n.dangLam, email: n.email, lienKet: !!(n.nguoi || n.email),
          trangThai: p0 ? p0.trangThai : '', suaSau: !!(p0 && p0.suaSau),
        };
      }),
    });
  }

  if (p === '/api/thanh-vien' && m === 'POST') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý.');
    const b = await docThan(req);
    const ns = await kho.dsNhanSu(true);
    const moiTao = !b.recordId;
    const cu = moiTao ? null : ns.find((x) => x.recordId === b.recordId);
    if (!moiTao && !cu) return loi(res, 404, 'Không có thành viên này.');
    if (moiTao && !String(b.hoTen || '').trim()) return loi(res, 400, 'Cần họ tên.');
    /* Mã NV là khoá của phiếu đăng ký ("YYYY-MM|Mã NV") — trùng là hai người
     * dùng chung một phiếu. */
    const ma = String(b.maNV == null ? (cu ? cu.maNV : '') : b.maNV).trim().toUpperCase();
    if (moiTao && !ma) return loi(res, 400, 'Cần mã nhân viên (RT00xxx) — đó là khoá để khớp với sheet HCNS.');
    if (ma && ns.some((x) => x.maNV === ma && x.recordId !== b.recordId)) {
      return loi(res, 409, 'Mã NV ' + ma + ' đã có người dùng.');
    }
    if (!moiTao && b.maNV != null && cu.maNV && ma !== cu.maNV &&
      (await kho.dsDangKy(null, true)).some((x) => x.maNV === cu.maNV)) {
      return loi(res, 409, 'Người này đã có lịch đăng ký theo mã ' + cu.maNV + ' — đổi mã sẽ làm rời các phiếu cũ.');
    }
    const o = Object.assign({}, b);
    if (moiTao) {
      if (o.dangLam == null) o.dangLam = true;
      if (o.thuTu == null) o.thuTu = Math.max(0, ...ns.map((x) => x.thuTu || 0)) + 1;
    }
    try {
      await kho.luuNhanSu(b.recordId || '', o);
    } catch (e) {
      return loi(res, 502, dichLoiBase(e));
    }
    return json(res, { ok: true });
  }

  if (p === '/api/ca-phong' && m === 'GET') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý xem được lịch cả phòng.');
    const thang = thangHopLe(q.get('thang')) || thangMacDinh();
    return json(res, await bangCaPhong(thang, moi));
  }

  /* Đánh dấu đã chép sang sheet HCNS: chỉ những phiếu đã nộp. */
  if (p === '/api/chuyen-hcns' && m === 'POST') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý.');
    const b = await docThan(req);
    const thang = thangHopLe(b.thang);
    if (!thang) return loi(res, 400, 'Tháng không hợp lệ.');
    const ds = (await kho.dsDangKy(thang, true)).filter(kho.daNop);
    try {
      await kho.danhDauChuyen(ds.map((x) => x.recordId));
    } catch (e) {
      return loi(res, 502, dichLoiBase(e));
    }
    return json(res, { ok: true, so: ds.length });
  }

  /* Tệp Excel đúng khuôn tab LLV của HCNS: STT · Mã NV · Họ tên · Chức vụ ·
   * Tổng công · 01…31, hàng thứ hai là T2/T3… — mở ra chép thẳng khối ngày. */
  if (p === '/api/xuat' && m === 'GET') {
    if (!toi.quanLy) return loi(res, 403, 'Chỉ quản lý.');
    const thang = thangHopLe(q.get('thang')) || thangMacDinh();
    const b = await bangCaPhong(thang, moi);
    const { ghiXlsx } = require(path.join(__dirname, '..', 'lark-chung', 'xlsx-ghi'));
    const cot = [
      { ten: 'STT', rong: 5 }, { ten: 'Phòng', rong: 7 }, { ten: 'Mã Nhân Viên', rong: 12 },
      { ten: 'Họ Tên Nhân Viên', rong: 24 }, { ten: 'Chức vụ', rong: 18 }, { ten: 'Tổng công', rong: 9 },
      ...b.ngay.map((x) => ({ ten: p2(x.d), rong: 5 })),
      { ten: 'Trạng thái', rong: 14 },
    ];
    const hangThu = ['', '', '', '', '', '', ...b.ngay.map((x) => MA.THU[x.thu]), ''];
    const hang = [hangThu, ...b.hang.map((r, i) => [
      i + 1, 'MKT', r.nhanSu.maNV, r.nhanSu.hoTen, r.nhanSu.chucVu, r.tinh.tongCong, ...r.ma,
      r.phieu ? r.phieu.trangThai + (r.phieu.suaSau ? ' (đã sửa)' : '') : 'Chưa đăng ký (lịch chuẩn)',
    ])];
    const { nam, thang: th } = MA.docThang(thang);
    const buf = ghiXlsx({
      ten: 'LLV ' + p2(th) + '.' + nam, cot, hang,
      tieuDe: 'LỊCH LÀM VIỆC PHÒNG MARKETING · THÁNG ' + p2(th) + '/' + nam,
      phuDe: 'Công chuẩn: ' + b.congChuan + ' · xuất ' + new Date().toISOString().slice(0, 10),
    });
    return gui(res, 200, buf, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="LLV-MKT-' + p2(th) + '-' + nam + '.xlsx"',
    });
  }

  /**
   * Hub hỏi mỗi lần mở: người này có phải đăng ký không. Từ ngày 29 là tháng
   * sau; ai lỡ thì sang tháng vẫn bị hỏi tiếp cho tới khi nộp — xem
   * MA.cuaSo (kỳ cố định, cấu hình trên Base). Người không có trong danh sách HCNS (cộng tác viên,
   * kế toán được mở quyền xem) thì không bị làm phiền.
   */
  if (p === '/api/nhac' && m === 'GET') {
    const ky = await kyHienTai(moi);
    const thang = ky.thang;
    if (!ky.dangMo || thang < cfg.batDauNhac) return json(res, { can: false, thang, mo: ky.mo, dong: ky.dong });
    const ns = await kho.dsNhanSu(moi);
    const n = kho.timNhanSu(toi, ns);
    if (!n || !n.dangLam) return json(res, { can: false, thang, laNhanSu: !!n });
    const p0 = (await kho.dsDangKy(thang, moi)).find((x) => x.maNV === n.maNV);
    return json(res, { can: !kho.daNop(p0), thang, laNhanSu: true, nhap: !!p0 && !kho.daNop(p0),
      batBuoc: ky.batBuoc, dong: ky.dong });
  }

  /**
   * Ngày vắng cho bản đồ nhiệt của hub, trong khoảng [tu, den] (YYYY-MM-DD).
   * Chỉ lấy phiếu ĐÃ NỘP — nháp còn đang sửa dở. Chủ nhật và lễ cũng trả về,
   * vì ô có việc rơi vào ngày nghỉ chính là thứ quản lý cần nhìn thấy.
   */
  if (p === '/api/nghi' && m === 'GET') {
    const tu = String(q.get('tu') || ''), den = String(q.get('den') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tu) || !/^\d{4}-\d{2}-\d{2}$/.test(den)) return loi(res, 400, 'Cần tu/den dạng YYYY-MM-DD.');
    const [ns, ds] = await Promise.all([kho.dsNhanSu(moi), kho.dsDangKy(null, moi)]);
    const out = [];
    ds.filter(kho.daNop).forEach((p0) => {
      if (p0.thang < tu.slice(0, 7) || p0.thang > den.slice(0, 7)) return;
      const n = ns.find((x) => x.maNV === p0.maNV) || {};
      p0.ngay.forEach((ma, i) => {
        const ngay = p0.thang + '-' + p2(i + 1);
        const muc = MA.mucVang(ma);
        if (!muc || ngay < tu || ngay > den) return;
        out.push({ id: p0.nguoi || n.nguoi || '', email: p0.email || n.email || '', ten: p0.hoTen, ngay, ma, muc,
          tenMa: (MA.THEO_MA.get(ma) || {}).ten || ma });
      });
    });
    return json(res, { tu, den, nghi: out });
  }

  /* Thẻ số cho trang Tổng quan của hub — mỗi thẻ là một hàng đợi cần làm gì đó. */
  if (p === '/api/tong-quan' && m === 'GET') {
    const kyTQ = await kyHienTai(moi);
    const thang = kyTQ.dangMo ? kyTQ.thang : thangMacDinh();
    if (!toi.quanLy) {
      const ns = await kho.dsNhanSu(moi);
      const n = kho.timNhanSu(toi, ns);
      const p0 = n && (await kho.dsDangKy(thang, moi)).find((x) => x.maNV === n.maNV);
      return json(res, {
        the: [{ chinh: true, nhan: 'Lịch tháng ' + thang.slice(5) + '/' + thang.slice(0, 4),
          so: kho.daNop(p0) ? 1 : 0, dinhDang: 'so', muc: kho.daNop(p0) ? 'ok' : 'vua',
          ghi: !n ? 'chưa gắn tên trong danh sách HCNS' : kho.daNop(p0) ? 'đã nộp' : 'chưa nộp' }],
        canXuLy: [], tong: kho.daNop(p0) ? 1 : 0, khoang: 'tháng ' + thang,
      });
    }
    const b = await bangCaPhong(thang, moi);
    const chua = b.hang.filter((r) => !(r.phieu && r.phieu.daNop));
    const suaSau = b.hang.filter((r) => r.phieu && r.phieu.suaSau);
    const choChuyen = b.hang.filter((r) => r.phieu && r.phieu.trangThai === cfg.chon.trangThai.daNop);
    return json(res, {
      the: [
        { chinh: true, nhan: 'Chưa đăng ký ' + thang.slice(5) + '/' + thang.slice(0, 4), so: chua.length, dinhDang: 'so',
          muc: chua.length ? 'vua' : 'ok', ghi: b.hang.length - chua.length + '/' + b.hang.length + ' người đã nộp' },
        { nhan: 'Chờ chép sang HCNS', so: choChuyen.length, dinhDang: 'so', muc: choChuyen.length ? 'vua' : 'ok' },
        { nhan: 'Sửa sau khi chép', so: suaSau.length, dinhDang: 'so', muc: suaSau.length ? 'cao' : 'ok',
          ghi: suaSau.length ? 'phải chép lại sang HCNS' : '' },
      ],
      canXuLy: suaSau.map((r) => ({ id: r.phieu.recordId, tieuDe: r.nhanSu.hoTen + ': sửa lịch sau khi đã chép sang HCNS',
        muc: 'cao', nhan: 'Chép lại' })),
      canXuLyTong: suaSau.length,
      tong: b.hang.length - chua.length,
      khoang: 'tháng ' + thang,
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
      if (!res.headersSent) loi(res, 500, /lark|limited|\d{6,}/i.test(e.message || '') ? dichLoiBase(e) : (e.message || 'Lỗi không xác định'));
    }
    return;
  }
  return tinh(res, u.pathname, u.search);
});

if (require.main === module) {
  server.listen(cfg.port, BIND, () => {
    console.log('Lịch làm việc — http://localhost:' + cfg.port + '  [' + cfg.mode + ']  bản ' + VER);
  });
}

module.exports = { server, aiGoi, luoiThang, bangCaPhong, VER };
