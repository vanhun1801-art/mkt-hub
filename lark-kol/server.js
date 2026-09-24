'use strict';
/**
 * ============================================================================
 * App "KOL" — hợp tác KOL từ lúc chốt thông tin tới báo cáo kết quả
 * ============================================================================
 * Chạy: node server.js  →  http://localhost:5186
 *
 * Quy trình (cột Bước): Đang trao đổi → Chờ BGĐ duyệt → BGĐ đã duyệt → Đã mời KOL
 *   → KOL đã xác nhận → Đã tạo tour Tourwell → Đang đi tour → Chờ nhận sản phẩm → Hoàn tất.
 * Email trình BGĐ / thư mời / báo cáo sinh từ cùng bản ghi (mau-email.js), gửi qua
 * Lark Mail (mail.js). Nhắc hẹn chạy nền (nhac.js).
 *
 * Chỉ nghe 127.0.0.1 — trên Render chạy sau cổng đăng nhập của hub.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const T = require('./tinh');
const kho = require('./kho');
const EM = require('./mau-email');
const mail = require('./mail');
const nhac = require('./nhac');
const theoDoi = require('./theo-doi-mail');
const MV = require('./public/ma-vung');
const TW = require('./tourwell-danh-muc');
const { layLogo } = require('../lark-chung/logo');

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
const loi = (res, ma, thong) => json(res, { error: thong }, ma);

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
let demToi = { luc: 0, nguoi: null };
async function aiGoi(req) {
  const h = req.headers || {};
  const de = (v) => { try { return decodeURIComponent(v || ''); } catch (_) { return v || ''; } };
  if (['x-hub-user-id', 'x-hub-user-email', 'x-hub-user-name'].some((k) => k in h)) {
    return { id: h['x-hub-user-id'] || '', ten: de(h['x-hub-user-name']) || '', quanLy: h['x-hub-user-manager'] === '1', quaHub: true };
  }
  if (Date.now() - demToi.luc < 60000 && demToi.nguoi) return demToi.nguoi;
  let u = null;
  try { u = await kho.lark.whoami(); } catch (_) { u = null; }
  const n = { id: (u && u.id) || '', ten: (u && u.name) || 'Chưa đăng nhập', quanLy: true, quaHub: false };
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
  /* mọi trang .html (index + trang in lịch trình) đều thay v=BUILD và không đệm */
  const trangChu = path.extname(f) === '.html';
  if (trangChu) body = Buffer.from(body.toString('utf8').split('v=BUILD').join('v=' + VER), 'utf8');
  gui(res, 200, body, {
    'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
    'Cache-Control': !trangChu && /[?&]v=/.test(truyVan || '') ? 'public, max-age=31536000' : 'no-store',
  });
}

const BAN_DO_GOC = path.join(__dirname, '..', 'lark-ban-do');
const SAN_PHAM = (process.env.SAN_PHAM_NOI_BO || 'http://127.0.0.1:5184').replace(/\/+$/, '');
const pqDem = {};
function taiChu(url, giay) {
  return new Promise((ok) => {
    const req = http.get(url, (r) => {
      if (r.statusCode !== 200) { r.resume(); return ok(null); }
      const m = []; r.on('data', (c) => m.push(c)); r.on('end', () => ok(Buffer.concat(m))); r.on('error', () => ok(null));
    });
    req.on('error', () => ok(null));
    req.setTimeout(giay * 1000, () => { req.destroy(); ok(null); });
  });
}
async function guiPq(res, ten) {
  const js = { 'Content-Type': MIME['.js'] };
  try {
    if (ten === 'diem') {
      if (!pqDem.diem) {
        const D = require(path.join(BAN_DO_GOC, 'diem.js')).DIEM;
        pqDem.diem = '/* 31 điểm của bản đồ du lịch (lark-ban-do/diem.js) */\nwindow.PQ_DIEM = ' +
          JSON.stringify(D.map((d) => ({ id: d.id, ten: d.ten, lat: d.lat, lon: d.lon, loai: d.loai, cap: d.cap }))) + ';\n';
      }
      return gui(res, 200, pqDem.diem, { ...js, 'Cache-Control': 'private, max-age=3600' });
    }
    if (ten === 'hinh-rieng') {
      /* hình trên Base đổi bất cứ lúc nào → không đệm ở trình duyệt; hỏi app Sản phẩm tối đa 5 giây */
      const tuSp = await taiChu(SAN_PHAM + '/ban-do/hinh-rieng.js', 5);
      if (tuSp && /PQ_HINH_RIENG/.test(tuSp.slice(0, 400).toString())) return gui(res, 200, tuSp, { ...js, 'Cache-Control': 'no-store' });
    }
    const f = path.join(BAN_DO_GOC, 'public', ten + '.js');
    if (!fs.existsSync(f)) return gui(res, 404, '', { 'Content-Type': 'text/plain' });
    return gui(res, 200, fs.readFileSync(f), { ...js, 'Cache-Control': ten === 'hinh-rieng' ? 'no-store' : 'private, max-age=3600' });
  } catch (e) {
    return gui(res, 500, '/* ' + String(e.message).replace(/\*\//g, '') + ' */', js);
  }
}

function dichLoiBase(e) {
  const m = String((e && e.message) || '');
  if (/91403|permission denied|you don't have permission/i.test(m)) {
    return 'App Lark chưa được cấp quyền vào Base "KOL · Hợp tác truyền thông". Mở Base → Chia sẻ → thêm ứng dụng ' +
      (cfg.appId || 'Marketing Hub (cli_aa1a8ae21a78ded2)') + ' với quyền Quản lý.';
  }
  if (/800010407|does not match the expected input shape/i.test(m)) {
    return /email/i.test(m) ? 'Email chưa đúng dạng (ví dụ ten@gmail.com) — Base không nhận.' : 'Có ô nhập sai định dạng, Base không nhận: ' + ((/"hint":\s*"([^"]+)"/.exec(m) || [])[1] || m.slice(0, 200));
  }
  if (/1254291|1254036|99991400|800004135|limited|rate/i.test(m)) return 'Base đang bận, thử lại sau vài giây.';
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(m)) return 'Không nối được tới Lark, thử lại.';
  return m;
}

/* ---------------- ghép dữ liệu ---------------- */
function goiHopTac(dl, id) {
  const ht = dl.hopTac.find((x) => x.id === id);
  if (!ht) return null;
  const kol = dl.kol.find((k) => k.id === ht.kol) || { ten: '(chưa gắn KOL)' };
  return {
    ht, kol,
    kenh: dl.kenh.filter((k) => k.kol === kol.id),
    hm: dl.hangMuc.filter((h) => h.hopTac === id),
    bg: dl.banGiao.filter((b) => b.hopTac === id),
  };
}

function toanCanh(dl, now = Date.now()) {
  const kolTen = new Map(dl.kol.map((k) => [k.id, k]));
  const hopTac = dl.hopTac.map((ht) => {
    const hm = dl.hangMuc.filter((h) => h.hopTac === ht.id);
    const bg = dl.banGiao.filter((b) => b.hopTac === ht.id);
    const kq = T.ketQua(ht, hm, bg);
    const k = kolTen.get(ht.kol);
    return {
      ...ht, kolTen: k ? k.ten : '', kq,
      treHan: bg.filter((b) => T.trangThaiBanGiao(b, now).ma === 'tre').length,
      canKiem: hm.filter((h) => h.kiemLai).length,
    };
  });
  const tt = {};
  for (const ht of dl.hopTac) {
    for (const [id, s] of T.trangThaiLich(dl.hangMuc.filter((h) => h.hopTac === ht.id), now)) tt[id] = s;
  }
  const banGiao = dl.banGiao.map((b) => ({ ...b, tt: T.trangThaiBanGiao(b, now) }));
  const hangMuc = dl.hangMuc.map((h) => ({
    ...h, ttLich: tt[h.id] || '', thanhTienTinh: T.thanhTien(h), quyDoiTinh: T.giaTriQuyDoi(h), thieuGia: T.thieuGiaCongBo(h),
  }));
  const song = (b) => !['Huỷ', 'Hoàn tất'].includes(b);
  const so = {
    choDuyet: hopTac.filter((h) => h.buoc === 'Chờ BGĐ duyệt').length,
    sapDi: hopTac.filter((h) => song(h.buoc) && h.batDau && h.batDau >= T.dauNgay(now) && h.batDau - now <= 7 * T.NGAY).length,
    dangDi: hopTac.filter((h) => h.buoc === 'Đang đi tour').length,
    treHan: banGiao.filter((b) => b.tt.ma === 'tre').length,
    canDo: banGiao.filter((b) => b.tt.ma === 'do-7' || b.tt.ma === 'do-30').length,
  };
  return { now, kol: dl.kol, kenh: dl.kenh, dichVu: dl.dichVu, doiTac: dl.doiTac, hopTac, hangMuc, banGiao, so };
}

/** Đồng bộ danh sách con: dòng không id → tạo, có id → sửa, id cũ không còn → xoá. */
async function dongBo(bang, cu, moi, gan) {
  const giu = new Set(moi.filter((x) => x.id).map((x) => x.id));
  const xoa = cu.filter((x) => !giu.has(x.id)).map((x) => x.id);
  const taoMoi = moi.filter((x) => !x.id).map((x) => ({ ...x, ...gan }));
  const sua = Object.fromEntries(moi.filter((x) => x.id && cu.some((c) => c.id === x.id)).map((x) => {
    const { id, ...r } = x; return [id, { ...r, ...gan }];
  }));
  if (xoa.length) await kho.xoa(bang, xoa);
  if (taoMoi.length) for (let i = 0; i < taoMoi.length; i += 200) await kho.taoNhieu(bang, taoMoi.slice(i, i + 200));
  if (Object.keys(sua).length) await kho.suaNhieu(bang, sua);
}

/** Ghi lại các con số App tính (thành tiền từng dòng + tổng của chuyến). */
async function tinhLaiTien(htId) {
  const dl = await kho.tatCa({ moi: true });
  const g = goiHopTac(dl, htId);
  if (!g) return;
  const sua = {};
  for (const h of g.hm) {
    const tt = T.thanhTien(h), qd = T.giaTriQuyDoi(h);
    if (h.thanhTien !== tt || h.quyDoi !== qd) sua[h.id] = { thanhTien: tt, quyDoi: qd };
  }
  if (Object.keys(sua).length) await kho.suaNhieu('hangMuc', sua);
  const t = T.tongHopTac(g.hm);
  const kq = T.ketQua(g.ht, g.hm, g.bg);
  await kho.sua('hopTac', htId, { tienCongTy: t.tienCongTy, giaTriFOC: t.giaTriFOC, giaTriQuyDoi: t.giaTriQuyDoi, tongXem: kq.xem });
}

const EMAIL = { 'de-xuat': ['deXuat', 'trinhBgd'], 'thu-moi': ['thuMoi', 'guiThuMoi'], 'bao-cao': ['baoCao', 'baoCao'] };

/* Cột client được phép ghi — mọi cột App tính thì KHÔNG nằm ở đây. */
const cho = (o, ds) => Object.fromEntries(ds.filter((k) => k in o).map((k) => [k, o[k]]));
const COT = {
  kol: ['ten', 'xungHo', 'tenGoi', 'tinhTrang', 'quocGia', 'maVung', 'sdt', 'email', 'lienHe', 'nguon', 'linhVuc', 'danhGia', 'ghiChu'],
  kenh: ['id', 'ten', 'nenTang', 'link', 'theoDoi', 'capNhat', 'reup'],
  dichVu: ['ten', 'loai', 'nhaCungCap', 'donVi', 'cbNL', 'cbTE', 'cbEB', 'netNL', 'netTE', 'netEB', 'focThuong',
    'lienHe', 'sdtLienHe', 'diaChi', 'dangDung', 'ghiChu'],
  hopTac: ['kol', 'nguoiLon', 'treEm', 'emBe', 'batDau', 'ketThuc', 'kenhDang', 'yeuCau', 'maTourwell', 'ttTourwell', 'ghiChu'],
  hangMuc: ['id', 'ten', 'nhom', 'ngay', 'gioHen', 'diemHen', 'nguonDv', 'maDv', 'dichVu', 'loaiKhach', 'soLuong', 'demLuot',
    'hinhThuc', 'donGiaChi', 'giaCongBo', 'vat', 'nhaCungCap', 'tinhTrang', 'nhacHen', 'tinNhan', 'kiemLai', 'ghiChu', 'xinFoc', 'tourwellId'],
  banGiao: ['id', 'ten', 'chuDe', 'loai', 'nenTang', 'soLuong', 'hanDang', 'trangThai', 'ngayDang', 'link', 'theTag', 'cta',
    'xem7', 'thich7', 'binhLuan7', 'chiaSe7', 'luu7', 'xem30', 'thich30', 'binhLuan30', 'chiaSe30', 'luu30', 'ghiChu',
    'kenhDang', 'traDoiTac'],
  doiTac: ['ten', 'email', 'cc', 'lienHe', 'sdt', 'ghiChu', 'loai', 'maTw'],
};

/**
 * Mọi lần đổi bước đi qua đây: ghi một dòng Lịch sử bước (để lùi được và biết ai
 * đổi gì lúc nào) và gỡ khoá "Không tự chuyển" khi bước tiến lên bình thường.
 */
function voiLichSu(ht, o, ly, now, laLui) {
  if (!o.buoc || o.buoc === ht.buoc) return o;
  const out = { ...o, lichSu: T.noiLichSu(ht.lichSu, T.dongLichSu(ht.buoc, o.buoc, ly, now)) };
  if (!laLui && ht.khongTuChuyen && !('khongTuChuyen' in o)) out.khongTuChuyen = false;
  return out;
}

/** KOL + kênh — dùng chung cho form KOL và form Tạo hợp tác. */
async function luuKol(b) {
  const o = cho(b, COT.kol);
  if ('email' in o) {
    o.email = String(o.email || '').trim().replace(/\s+/g, '');
    if (o.email && !mail.hopLe(o.email)) throw Object.assign(new Error('Email "' + o.email + '" chưa đúng dạng (ví dụ ten@gmail.com)'), { http: 400 });
  }
  if (o.sdt || o.maVung) {
    const c = MV.chuan(o.sdt, o.maVung);
    if (c.ma) o.maVung = '+' + c.ma;
    if (o.sdt) o.sdt = c.quocTe;
    /* Số mang mã nước khác quốc gia đã chọn → quốc gia đi theo số (đã gặp: "Thái Lan · +84"). */
    const qg = o.quocGia ? MV.theoTen(o.quocGia) : null;
    if (c.ma && o.sdt && (!qg || qg.ma !== c.ma)) { const n = MV.theoMa(c.ma); if (n) o.quocGia = n.ten; }
  }
  if (o.quocGia && !o.maVung) { const q = MV.theoTen(o.quocGia); if (q) o.maVung = '+' + q.ma; }
  const kenh = Array.isArray(b.kenh) ? b.kenh.map((k) => cho(k, COT.kenh)).filter((k) => k.ten || k.link) : null;
  if (kenh) o.tongTheoDoi = kenh.filter((k) => !k.reup).reduce((s, k) => s + (Number(k.theoDoi) || 0), 0);
  let id = b.id;
  if (id) await kho.sua('kol', id, o); else id = await kho.tao('kol', { tinhTrang: 'Đang trao đổi', ...o });
  if (kenh) {
    const dl = await kho.tatCa({ moi: true });
    await dongBo('kenh', dl.kenh.filter((k) => k.kol === id), kenh, { kol: id });
  }
  return id;
}

/* Link Google Maps (kể cả rút gọn) → {lat, lng}. Đi theo chuyển hướng tối đa 5 lần, và CHỈ trong
 * tên miền của Google — không thì ai cũng dùng được máy chủ này để gọi đi bất cứ đâu (SSRF). */
const nhoViTri = new Map();
/* Đuôi tên miền viết chặt: "google\.[a-z.]+" từng để lọt google.com.evil.com. */
const MIEN_GOOGLE = /^(maps\.app\.goo\.gl|goo\.gl|(www\.|maps\.)?google\.(com|[a-z]{2})(\.[a-z]{2})?)$/i;
function toaDoTuLink(t) {
  const m = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(t) || /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(t) ||
    /[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i.exec(t);
  return m ? { lat: +m[1], lng: +m[2] } : null;
}
async function giaiLinkBanDo(link) {
  if (nhoViTri.has(link)) return nhoViTri.get(link);
  let url = link, kq = { lat: null };
  try {
    for (let i = 0; i < 5; i++) {
      const h = new URL(url);
      if (h.protocol !== 'https:' || !MIEN_GOOGLE.test(h.hostname)) break;
      const tu = toaDoTuLink(decodeURIComponent(url));
      if (tu) { kq = tu; break; }
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6000) });
      const tiep = r.headers.get('location');
      if (!tiep) { const tu2 = toaDoTuLink(await r.text().catch(() => '')); if (tu2) kq = tu2; break; }
      url = new URL(tiep, url).href;
    }
  } catch (_) {}
  nhoViTri.set(link, kq);
  return kq;
}

/* ---------------- API ---------------- */
async function api(req, res, u) {
  const p = u.pathname;
  const m = req.method;
  const toi = await aiGoi(req);
  const now = Date.now();
  let r;

  if (p === '/api/meta' && m === 'GET') {
    const k = nhac.kenhGui();
    return json(res, {
      toi, larkUrl: cfg.larkUrl, mode: cfg.mode, buoc: T.BUOC, maVung: cfg.maVung, lienHeKol: cfg.lienHeKol,
      mail: { from: cfg.mail.from, bgdTo: cfg.mail.bgdTo, guiDuoc: cfg.mode === 'cli' },
      nhac: { ...nhac.trangThai, kenh: k ? k.ten : '', coKenh: !!k, truocPhut: cfg.nhac.truocPhut, tat: cfg.nhac.tat },
      theoDoi: { ...theoDoi.trangThai, chuKyPhut: theoDoi.CHU_KY / 60000 },
    });
  }

  /* Logo thương hiệu cho trang in lịch trình — bản gốc ở hub (lark-chung/logo.js).
   * Không có thì 404 và trang in tự hiện chữ "Rooty Trip" thay ảnh. */
  /* Bản đồ minh hoạ Phú Quốc DÙNG CHUNG với tab Bản đồ của app Sản phẩm (anh Hùng 24/09):
   *  hinh.js · dia-hinh.js · hinh-ve.js — đọc thẳng từ ../lark-ban-do/public (cùng repo, một bản gốc)
   *  diem.js       — 31 điểm (toạ độ, tên, cấp) từ ../lark-ban-do/diem.js
   *  hinh-rieng.js — hình quản lý tải lên trên Base: hỏi app Sản phẩm; nó ngủ/không có thì dùng bản dựng sẵn trong repo */
  const mPq = /^\/api\/pq\/(hinh|dia-hinh|hinh-ve|diem|hinh-rieng)\.js$/.exec(p);
  if (mPq && m === 'GET') return guiPq(res, mPq[1]);

  if (p === '/api/logo' && m === 'GET') {
    const logo = await layLogo(path.join(__dirname, 'du-lieu'));
    if (!logo) return gui(res, 404, '', { 'Content-Type': 'text/plain' });
    return gui(res, 200, logo.buf, { 'Content-Type': logo.mime, 'Cache-Control': 'private, max-age=3600' });
  }

  if (p === '/api/du-lieu' && m === 'GET') {
    return json(res, toanCanh(await kho.tatCa({ moi: u.searchParams.get('moi') === '1' }), now));
  }

  /* Cho trang Tổng quan của hub (kpi.js → tuAppTuCong). Không theo khoảng lọc:
   * một chuyến đang chạy thì việc gấp của nó không thuộc về "tháng này" hay tháng nào. */
  if (p === '/api/tong-quan' && m === 'GET') {
    const tc = toanCanh(await kho.tatCa(), now);
    const ten = (id) => { const h = tc.hopTac.find((x) => x.id === id); return h ? (h.kolTen || h.ma) : '?'; };
    const canXuLy = [
      ...tc.banGiao.filter((b) => b.tt.ma === 'tre').map((b) => ({ id: b.hopTac, tieuDe: ten(b.hopTac) + ': quá hạn đăng "' + b.ten + '"', muc: 'cao', nhan: 'Nhắc KOL' })),
      ...tc.hopTac.filter((h) => h.buoc === 'Chờ BGĐ duyệt' && h.trinhLuc && now - h.trinhLuc > 2 * T.NGAY)
        .map((h) => ({ id: h.id, tieuDe: (h.kolTen || h.ma) + ': chờ BGĐ duyệt từ ' + T.ddmm(h.trinhLuc), muc: 'vua', nhan: 'Hỏi lại BGĐ' })),
      ...tc.hopTac.filter((h) => h.batDau && h.batDau >= T.dauNgay(now) && h.batDau - now <= 3 * T.NGAY && T.viTri(h.buoc) < 4)
        .map((h) => ({ id: h.id, tieuDe: (h.kolTen || h.ma) + ': đi ' + T.ddmm(h.batDau) + ' mà mới "' + h.buoc + '"', muc: 'cao', nhan: 'Chốt ngay' })),
      ...tc.banGiao.filter((b) => b.tt.ma === 'do-7' || b.tt.ma === 'do-30').map((b) => ({ id: b.hopTac, tieuDe: ten(b.hopTac) + ': nhập số ' + (b.tt.ma === 'do-7' ? '7' : '30') + ' ngày cho "' + b.ten + '"', muc: 'vua', nhan: 'Nhập số' })),
    ];
    const so = tc.so;
    return json(res, {
      the: [
        { chinh: true, nhan: 'Chờ BGĐ duyệt', so: so.choDuyet, dinhDang: 'so', muc: so.choDuyet ? 'vua' : 'ok' },
        { nhan: 'Sắp đi 7 ngày', so: so.sapDi, dinhDang: 'so', muc: 'ok', ghi: so.dangDi ? so.dangDi + ' đang đi tour' : '' },
        { nhan: 'Bàn giao quá hạn', so: so.treHan, dinhDang: 'so', muc: so.treHan ? 'cao' : 'ok' },
        { nhan: 'Đến hạn nhập số', so: so.canDo, dinhDang: 'so', muc: so.canDo ? 'vua' : 'ok' },
      ],
      canXuLy, canXuLyTong: canXuLy.length,
      tong: tc.hopTac.filter((h) => !['Hoàn tất', 'Huỷ'].includes(h.buoc)).length,
      khoang: 'hợp tác đang chạy',
    });
  }

  if (p === '/api/san-pham' && m === 'GET') {
    let sp = [];
    try { sp = await kho.sanPham(); } catch (e) { return json(res, { sanPham: [], loi: 'Không đọc được Base Sản phẩm: ' + dichLoiBase(e) }); }
    return json(res, { sanPham: sp.filter((x) => x.trangThai !== 'Ngừng kinh doanh') });
  }

  /* ----- KOL + kênh ----- */
  if (p === '/api/kol' && m === 'POST') {
    const b = await docThan(req);
    if (!String(b.ten || '').trim() && !b.id) return loi(res, 400, 'Chưa có tên KOL');
    return json(res, { ok: true, id: await luuKol(b) });
  }

  /* ----- đối tác (email đề xuất hợp tác FOC) ----- */
  if (p === '/api/doi-tac' && m === 'POST') {
    const b = await docThan(req);
    const o = cho(b, COT.doiTac);
    if (!b.id && !String(o.ten || '').trim()) return loi(res, 400, 'Chưa có tên đối tác');
    const id = b.id ? (await kho.sua('doiTac', b.id, o), b.id) : await kho.tao('doiTac', o);
    return json(res, { ok: true, id });
  }

  /* ----- tạo hợp tác trọn gói: KOL + kênh + chuyến trong MỘT lần bấm ----- */
  if (p === '/api/hop-tac/tao' && m === 'POST') {
    const b = await docThan(req);
    const k = b.kol || {};
    if (!k.id && !String(k.ten || '').trim()) return loi(res, 400, 'Chưa có tên KOL');
    const o = cho(b.ht || {}, COT.hopTac);
    const kolId = await luuKol({ ...k, kenh: b.kenh });
    const dl = await kho.tatCa({ moi: true });
    const ma = T.maMoi(dl.hopTac.map((x) => x.ma), T.vn(now).nam);
    const id = await kho.tao('hopTac', {
      nguoiLon: 1, treEm: 0, emBe: 0, ...o, ma, kol: kolId, buoc: 'Đang trao đổi',
      ttTourwell: o.maTourwell ? 'Đang xử lý' : 'Chưa tạo',
      lichSu: T.dongLichSu('', 'Đang trao đổi', 'tạo hợp tác', now),
    });
    return json(res, { ok: true, id, ma, kol: kolId });
  }

  /* ----- dịch vụ đối tác ----- */
  if (p === '/api/dich-vu' && m === 'POST') {
    const b = await docThan(req);
    const o = cho(b, COT.dichVu);
    if (!b.id && !String(o.ten || '').trim()) return loi(res, 400, 'Chưa có tên dịch vụ');
    const id = b.id ? (await kho.sua('dichVu', b.id, o), b.id) : await kho.tao('dichVu', { dangDung: true, ...o });
    return json(res, { ok: true, id });
  }

  /* ----- hợp tác ----- */
  if (p === '/api/hop-tac' && m === 'POST') {
    const b = await docThan(req);
    const o = cho(b, COT.hopTac);
    if (b.id) { await kho.sua('hopTac', b.id, o); return json(res, { ok: true, id: b.id }); }
    if (!o.kol) return loi(res, 400, 'Chọn KOL trước');
    const dl = await kho.tatCa({ moi: true });
    const ma = T.maMoi(dl.hopTac.map((x) => x.ma), T.vn(now).nam);
    const id = await kho.tao('hopTac', { ma, buoc: 'Đang trao đổi', ttTourwell: 'Chưa tạo', nguoiLon: 1, treEm: 0, emBe: 0, ...o });
    const kol = dl.kol.find((k) => k.id === o.kol);
    if (kol && ['Tiềm năng', ''].includes(kol.tinhTrang)) await kho.sua('kol', kol.id, { tinhTrang: 'Đang trao đổi' });
    return json(res, { ok: true, id, ma });
  }

  /* ----- danh mục Tourwell (chỉ đọc) ----- */
  if (p === '/api/tourwell/san-pham' && m === 'GET') {
    if (!TW.coToken()) return json(res, { ds: [], loi: 'Chưa khai token Tourwell trên máy chủ này' });
    return json(res, { ds: await TW.sanPham({ moi: u.searchParams.get('moi') === '1' }) });
  }
  if (p === '/api/tourwell/ncc' && m === 'GET') {
    if (!TW.coToken()) return json(res, { ds: [], loi: 'Chưa khai token Tourwell trên máy chủ này' });
    return json(res, { ds: await TW.nhaCungCap({ moi: u.searchParams.get('moi') === '1' }) });
  }
  if ((r = /^\/api\/tourwell\/ncc\/(\d+)$/.exec(p)) && m === 'GET') {
    return json(res, { ds: await TW.dichVuNcc(r[1]) });
  }

  /* Đưa nhà cung cấp Tourwell vào bảng Đối tác (đối tác đã có thì chỉ điền ô còn trống —
   * email / người liên hệ anh sửa tay trên app không bị ghi đè). */
  if (p === '/api/doi-tac/nhap-tourwell' && m === 'POST') {
    const b = await docThan(req);
    const loaiNhan = Array.isArray(b.loai) && b.loai.length ? new Set(b.loai) : null;
    const ncc = (await TW.nhaCungCap()).filter((x) => !loaiNhan || loaiNhan.has(x.loai));
    const dl = await kho.tatCa({ moi: true });
    const theoMa = new Map(dl.doiTac.filter((d) => d.maTw).map((d) => [String(d.maTw), d]));
    const theoTen = new Map(dl.doiTac.map((d) => [d.ten.trim().toLowerCase(), d]));
    const tao = [], sua = {};
    for (const x of ncc) {
      const co = theoMa.get(String(x.id)) || theoTen.get(x.ten.toLowerCase());
      if (!co) { tao.push({ ten: x.ten, loai: x.loai, maTw: String(x.id), email: mail.hopLe(x.email) ? x.email : '', sdt: x.sdt }); continue; }
      const o = {};
      if (!co.maTw) o.maTw = String(x.id);
      if (!co.loai && x.loai) o.loai = x.loai;
      if (!co.email && mail.hopLe(x.email)) o.email = x.email;
      if (!co.sdt && x.sdt) o.sdt = x.sdt;
      if (Object.keys(o).length) sua[co.id] = o;
    }
    for (let i = 0; i < tao.length; i += 200) await kho.taoNhieu('doiTac', tao.slice(i, i + 200));
    if (Object.keys(sua).length) await kho.suaNhieu('doiTac', sua);
    return json(res, { ok: true, them: tao.length, capNhat: Object.keys(sua).length, tong: ncc.length });
  }

  if ((r = /^\/api\/hop-tac\/(rec\w+)\/(hang-muc|ban-giao)$/.exec(p)) && m === 'POST') {
    const b = await docThan(req);
    const bang = r[2] === 'hang-muc' ? 'hangMuc' : 'banGiao';
    const ds = (Array.isArray(b.ds) ? b.ds : []).map((x) => cho(x, COT[bang]));
    const dl = await kho.tatCa({ moi: true });
    const htGoc = dl.hopTac.find((h) => h.id === r[1]);
    if (!htGoc) return loi(res, 404, 'Không thấy hợp tác');
    if (bang === 'hangMuc' && htGoc.chotLuc) return loi(res, 409, 'Bảng kê đã chốt ' + T.ddmm(htGoc.chotLuc) + ' — bấm "Mở chốt" để sửa');
    if (bang === 'banGiao') {
      /* Ghi "Nhập số 7N/30N lúc" khi số của mốc đó vừa đổi — bản tin sáng dựa vào nó để thôi nhắc. */
      const cu = new Map(dl.banGiao.map((x) => [x.id, x]));
      for (const x of ds) {
        for (const moc of ['7', '30']) {
          const doi = ['xem', 'thich', 'binhLuan', 'chiaSe', 'luu'].some((k) => {
            const v = x[k + moc]; const c = x.id && cu.get(x.id) ? cu.get(x.id)[k + moc] : null;
            return v != null && v !== '' && Number(v) !== c;
          });
          if (doi) x['nhap' + moc] = now;
        }
      }
    }
    if (bang === 'hangMuc') {
      /* Trạng thái Hợp tác FOC vừa đổi → dòng tự đổi hình thức chi (đồng ý = FOC, từ chối = Công ty chi). */
      const cu = new Map(dl.hangMuc.map((x) => [x.id, x]));
      for (const x of ds) {
        const c = x.id ? cu.get(x.id) : null;
        if (x.xinFoc && (!c || c.xinFoc !== x.xinFoc)) Object.assign(x, T.theoFoc(x.xinFoc));
      }
    }
    await dongBo(bang, dl[bang].filter((x) => x.hopTac === r[1]), ds, { hopTac: r[1] });
    await tinhLaiTien(r[1]);
    return json(res, { ok: true });
  }

  if ((r = /^\/api\/hop-tac\/(rec\w+)\/buoc$/.exec(p)) && m === 'POST') {
    const b = await docThan(req);
    const dl = await kho.tatCa({ moi: true });
    const g = goiHopTac(dl, r[1]);
    if (!g) return loi(res, 404, 'Không thấy hợp tác');
    const viec = b.viec;
    const chan = (v) => { const l = T.duocLam(g.ht, v); if (l) throw Object.assign(new Error(l), { http: 409 }); };
    let o;
    const LY = { daDuyet: 'BGĐ duyệt', tuChoi: 'BGĐ yêu cầu sửa', daGui: 'gửi từ Lark Mail', kolXacNhan: 'KOL xác nhận',
      taoDichVu: 'tạo tour Tourwell', hoanTat: 'hoàn tất', huy: 'huỷ', doiBuoc: 'đổi tay', lui: 'lùi bước' };
    if (viec === 'chot' || viec === 'moChot') {
      if (viec === 'chot' && !g.hm.some((h) => h.tinhTrang !== 'Huỷ')) return loi(res, 409, 'Bảng kê còn trống — chưa chốt được');
      if (viec === 'chot' && g.hm.some((h) => h.hinhThuc === 'Công ty chi' && h.donGiaChi == null && h.loaiKhach !== 'Em bé')) {
        return loi(res, 409, 'Còn dòng "Công ty chi" chưa có đơn giá — điền đủ rồi chốt');
      }
      const o = viec === 'chot' ? { chotLuc: now } : { chotLuc: null };
      o.lichSu = T.noiLichSu(g.ht.lichSu, T.dongLichSu(g.ht.buoc, g.ht.buoc, viec === 'chot' ? 'chốt bảng kê ' + T.tien(T.tongHopTac(g.hm).tienCongTy) + 'đ' : 'mở chốt bảng kê', now));
      await kho.sua('hopTac', r[1], o);
      return json(res, { ok: true, buoc: g.ht.buoc, chot: viec === 'chot' });
    }
    if (viec === 'lui') {
      const l = T.lui(g.ht);
      if (!l) return loi(res, 409, 'Đang ở bước đầu, không lùi được nữa');
      o = { buoc: l.buoc, ...l.xoa };
      await kho.sua('hopTac', r[1], voiLichSu(g.ht, o, LY.lui, now, true));
      return json(res, { ok: true, buoc: o.buoc });
    }
    if (viec === 'daDuyet') {
      chan('daDuyet');
      o = { buoc: 'BGĐ đã duyệt', duyetLuc: now, nguoiDuyet: b.nguoiDuyet || 'Phạm Quang Hậu', kenhDuyet: b.kenhDuyet || 'Email', yKien: b.yKien || '' };
    } else if (viec === 'tuChoi') {
      chan('daDuyet');
      o = { buoc: 'Đang trao đổi', yKien: b.yKien || '', nguoiDuyet: b.nguoiDuyet || '' };
    } else if (viec === 'daGui') {
      /* Lưu nháp rồi tự gửi trong Lark Mail → bấm "Đã gửi" để ghi bước. */
      /* Nhớ tiêu đề — bộ theo dõi thư tìm lại luồng thư bằng tiêu đề khi không có thread_id. */
      if (b.loai === 'de-xuat') { chan('trinhBgd'); o = { buoc: 'Chờ BGĐ duyệt', trinhLuc: now, tdBgd: b.tieuDe || g.ht.tdBgd || '' }; }
      else if (b.loai === 'thu-moi') { chan('guiThuMoi'); o = { buoc: 'Đã mời KOL', thuMoiLuc: now, tdKol: b.tieuDe || g.ht.tdKol || '' }; }
      else return loi(res, 400, 'Loại email lạ');
    } else if (viec === 'kolXacNhan') {
      chan('kolXacNhan'); o = { buoc: 'KOL đã xác nhận', xacNhanLuc: now };
    } else if (viec === 'taoDichVu') {
      chan('taoDichVu');
      o = { buoc: 'Đã tạo tour Tourwell', maTourwell: String(b.maTourwell || '').trim(), ttTourwell: b.maTourwell ? 'Đang xử lý' : 'Chưa tạo' };
      const lich = T.buocTheoLich({ ...g.ht, ...o }, now);
      if (lich) o.buoc = lich;
    } else if (viec === 'hoanTat') {
      o = { buoc: 'Hoàn tất' };
      await kho.sua('kol', g.kol.id, { tinhTrang: 'Đã hợp tác' });
    } else if (viec === 'huy') {
      o = { buoc: 'Huỷ', lyDoHuy: b.lyDo || '' };
    } else if (viec === 'doiBuoc') {
      if (!T.BUOC.includes(b.buoc)) return loi(res, 400, 'Bước lạ');
      o = { buoc: b.buoc };
    } else return loi(res, 400, 'Hành động lạ');
    await kho.sua('hopTac', r[1], voiLichSu(g.ht, o, LY[viec], now));
    return json(res, { ok: true, buoc: o.buoc });
  }

  /* ----- email đề xuất hợp tác FOC: một đối tác một thư, gom mọi dòng của đối tác đó ----- */
  if ((r = /^\/api\/hop-tac\/(rec\w+)\/email\/(xin-foc|bao-cao-doi-tac)$/.exec(p))) {
    const dt = String(u.searchParams.get('dt') || '').trim();
    const dl = await kho.tatCa({ moi: m === 'POST' });
    const g = goiHopTac(dl, r[1]);
    if (!g) return loi(res, 404, 'Không thấy hợp tác');
    const cung = (s) => String(s || '').trim().toLowerCase() === dt.toLowerCase();
    const dong = g.hm.filter((h) => cung(h.nhaCungCap) && h.tinhTrang !== 'Huỷ');
    const doiTac = dl.doiTac.find((x) => cung(x.ten)) || null;
    if (r[2] === 'bao-cao-doi-tac') {
      if (!dt || !g.bg.some((b) => cung(b.traDoiTac))) return loi(res, 400, 'Chưa có sản phẩm bàn giao nào ghi "Trả cho đối tác" = "' + dt + '"');
      if (m === 'GET') return json(res, { ...EM.baoCaoDoiTac({ ...g, doiTac, tenDoiTac: dt }), cc: doiTac ? doiTac.cc : '', from: cfg.mail.from || '(hộp thư chính)' });
      const b = await docThan(req);
      await mail.guiMail({ den: b.den, cc: b.cc, tieuDe: b.tieuDe, html: b.html, gui: b.gui === true });
      return json(res, { ok: true, daGui: b.gui === true });
    }
    if (!dt || !dong.length) return loi(res, 400, 'Chưa có dòng nào của đối tác "' + dt + '" — điền cột Đối tác trong bảng kê trước');
    if (m === 'GET') {
      const e = EM.xinFoc({ ...g, hm: dong, doiTac, tenDoiTac: dt }, cfg.mail);
      return json(res, { ...e, cc: doiTac ? doiTac.cc : '', from: cfg.mail.from || '(hộp thư chính)', doiTac });
    }
    if (m === 'POST') {
      const b = await docThan(req);
      await mail.guiMail({ den: b.den, cc: b.cc, tieuDe: b.tieuDe, html: b.html, gui: b.gui === true });
      /* Nhớ email đối tác cho lần sau. */
      if (!doiTac) await kho.tao('doiTac', { ten: dt, email: b.den, cc: b.cc || '' });
      else if (b.den && b.den !== doiTac.email) await kho.sua('doiTac', doiTac.id, { email: b.den, cc: b.cc || '' });
      if (b.gui === true) {
        await kho.suaNhieu('hangMuc', Object.fromEntries(dong.filter((h) => !['Đối tác đồng ý', 'Đối tác từ chối'].includes(h.xinFoc))
          .map((h) => [h.id, { xinFoc: 'Đã gửi đề xuất', xinFocLuc: now }])));
      }
      return json(res, { ok: true, daGui: b.gui === true });
    }
  }

  if ((r = /^\/api\/hop-tac\/(rec\w+)\/email\/(de-xuat|thu-moi|bao-cao)$/.exec(p))) {
    const [ham, viec] = EMAIL[r[2]];
    const dl = await kho.tatCa({ moi: m === 'POST' });
    const g = goiHopTac(dl, r[1]);
    if (!g) return loi(res, 404, 'Không thấy hợp tác');
    if (m === 'GET') {
      const e = EM[ham](g, cfg.mail);
      return json(res, { ...e, chan: T.duocLam(g.ht, viec), from: cfg.mail.from || '(hộp thư chính)' });
    }
    if (m === 'POST') {
      const l = T.duocLam(g.ht, viec);
      if (l) return loi(res, 409, l);
      const b = await docThan(req);
      const kq = await mail.guiMail({ den: b.den, cc: b.cc, tieuDe: b.tieuDe, html: b.html, gui: b.gui === true });
      let buoc = g.ht.buoc;
      /* thread_id do +send trả về → bộ theo dõi thư đọc lại luồng để bắt thư trả lời. */
      const luong = (kq.du && (kq.du.thread_id || (kq.du.message && kq.du.message.thread_id))) || '';
      if (b.gui === true) {
        if (r[2] === 'de-xuat') {
          buoc = 'Chờ BGĐ duyệt';
          await kho.sua('hopTac', r[1], voiLichSu(g.ht, { buoc, trinhLuc: now, thuBgd: luong, tdBgd: b.tieuDe, bgdTraLoi: '', bgdTraLoiLuc: null }, 'gửi email từ app', now));
        }
        if (r[2] === 'thu-moi') {
          buoc = 'Đã mời KOL';
          await kho.sua('hopTac', r[1], voiLichSu(g.ht, { buoc, thuMoiLuc: now, thuKol: luong, tdKol: b.tieuDe, kolTraLoi: '', kolTraLoiLuc: null }, 'gửi email từ app', now));
        }
      } else if (r[2] === 'de-xuat') await kho.sua('hopTac', r[1], { tdBgd: b.tieuDe });
      else if (r[2] === 'thu-moi') await kho.sua('hopTac', r[1], { tdKol: b.tieuDe });
      return json(res, { ok: true, daGui: b.gui === true, buoc });
    }
  }

  /* ----- sửa nhanh một dòng (lịch trình, số liệu bài đăng) ----- */
  if ((r = /^\/api\/(hang-muc|ban-giao)\/(rec\w+)$/.exec(p)) && m === 'POST') {
    const bang = r[1] === 'hang-muc' ? 'hangMuc' : 'banGiao';
    const b = await docThan(req);
    const o = cho(b, COT[bang].filter((k) => k !== 'id'));
    if (bang === 'banGiao') {
      if (['xem7', 'thich7', 'binhLuan7', 'chiaSe7', 'luu7'].some((k) => k in o)) o.nhap7 = now;
      if (['xem30', 'thich30', 'binhLuan30', 'chiaSe30', 'luu30'].some((k) => k in o)) o.nhap30 = now;
      if (o.trangThai === 'Đã đăng' && !o.ngayDang && !b.giuNgay) o.ngayDang = now;
    }
    await kho.sua(bang, r[2], o);
    const dl = await kho.tatCa({ moi: true });
    const dong = dl[bang].find((x) => x.id === r[2]);
    if (dong && dong.hopTac) await tinhLaiTien(dong.hopTac);
    return json(res, { ok: true });
  }

  /* ----- toạ độ từ link Google Maps rút gọn (maps.app.goo.gl) ----- */
  if (p === '/api/vi-tri' && m === 'GET') {
    return json(res, await giaiLinkBanDo(String(u.searchParams.get('u') || '')));
  }

  /* ----- theo dõi thư trả lời ----- */
  if (p === '/api/theo-doi/kiem' && m === 'POST') {
    const moi = await theoDoi.kiem(cfg.nhac.tat ? null : nhac.guiTin);
    return json(res, { ok: !theoDoi.trangThai.loi, moi: moi.length, loi: theoDoi.trangThai.loi });
  }

  /* ----- nhắc ----- */
  if (p === '/api/nhac/thu' && m === 'POST') {
    const kq = await nhac.guiTin('Tin thử từ app KOL — nhắc hẹn đang chạy. Trước mỗi giờ hẹn ' +
      cfg.nhac.truocPhut + ' phút anh sẽ nhận tin như thế này.', 'kol-thu-' + now);
    return kq.ok ? json(res, { ok: true }) : loi(res, 502, kq.loi);
  }
  if (p === '/api/nhac/xem-truoc' && m === 'GET') {
    const dl = await kho.tatCa();
    const id = u.searchParams.get('hm');
    const h = dl.hangMuc.find((x) => x.id === id);
    if (!h) return loi(res, 404, 'Không thấy hạng mục');
    const ht = dl.hopTac.find((x) => x.id === h.hopTac) || {};
    const kol = dl.kol.find((k) => k.id === ht.kol);
    const cung = dl.hangMuc.filter((x) => x.hopTac === h.hopTac && x.gioHen === h.gioHen && EM.tenGon(x.ten) === EM.tenGon(h.ten));
    return json(res, { tinAnh: h.gioHen ? nhac.tinMoc(cung, ht, kol) : '', tinKol: h.gioHen ? T.tinNhacKol(h, ht, kol) : '' });
  }

  return loi(res, 404, 'Không có API ' + p);
}

/* ---------------- máy chủ ---------------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/healthz') return json(res, { ok: true });
    if (u.pathname.startsWith('/api/')) return await api(req, res, u);
    if (req.method !== 'GET') return loi(res, 405, 'Chỉ GET');
    return tinh(res, u.pathname, u.search);
  } catch (e) {
    console.error('[' + req.method + ' ' + u.pathname + ']', e.message);
    return loi(res, e.http || 500, e.http ? e.message : dichLoiBase(e));
  }
});

if (require.main === module) {
  server.listen(cfg.port, BIND, () => {
    console.log('KOL — http://localhost:' + cfg.port + '  (chế độ ' + cfg.mode + ')');
    const k = nhac.kenhGui();
    console.log('Nhắc hẹn: ' + (cfg.nhac.tat ? 'TẮT' : k ? k.ten + ', trước ' + cfg.nhac.truocPhut + ' phút' : 'chưa có kênh gửi'));
    nhac.batDau();
    /* Bộ nhắc tắt thì theo dõi thư vẫn chạy (ghi câu trả lời vào Base) nhưng không nhắn tin. */
    theoDoi.batDau(cfg.nhac.tat ? null : nhac.guiTin);
  });
}

module.exports = { server, toanCanh, goiHopTac };
