'use strict';
/**
 * Kho — đọc/ghi ba bảng của Base "Lịch làm việc MKT", và chỉ có thế.
 * Luật (lịch chuẩn, cộng công, cảnh báo) nằm ở ma-cong.js.
 */
const cfg = require('./config');
const MA = require('./ma-cong');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

const F = cfg.fields;
const C = cfg.chon;
const p2 = (n) => String(n).padStart(2, '0');

/* ---------------- đọc ô Base ---------------- */
const asText = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    return v.map((x) => (x && (x.text || x.name)) || (typeof x === 'string' ? x : '')).join('');
  }
  if (typeof v === 'object') return v.text || v.name || '';
  return String(v);
};
/* Ô ngày: cli trả chuỗi ISO có múi giờ, api trả số ms — xem kho.js của app Báo cáo. */
function asMs(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = asText(v);
  const n = Number(s);
  if (Number.isFinite(n) && n > 1e11) return n;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}
/* Chuỗi ISO mang sẵn ngày theo giờ Base (+07:00) — cắt thẳng, khỏi quy đổi. */
function asNgay(v) {
  const s = asText(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const ms = asMs(v);
  if (!ms) return '';
  const t = MA.vn(ms);
  return t.nam + '-' + p2(t.thang) + '-' + p2(t.ngay);
}
const asTick = (v) => v === true || v === 1 || /^(true|1)$/i.test(asText(v).trim());
const asSo = (v) => { const n = Number(asText(v)); return Number.isFinite(n) ? n : 0; };

/** "Nguyễn Long  Khánh" -> "nguyen long khanh": so tên người không lệ thuộc dấu. */
function chuanTen(s) {
  /* Bỏ dấu bằng so code point (U+0300–U+036F), không bằng regex: regex dấu
   * trong kho này đã hai lần bị công cụ sửa file ăn mất ký tự. */
  const bo = [...String(s || '').normalize('NFD')]
    .filter((ch) => { const c = ch.codePointAt(0); return c < 0x300 || c > 0x36f; }).join('');
  return bo.split(String.fromCharCode(0x111)).join('d').split(String.fromCharCode(0x110)).join('d')
    .toLowerCase().trim().split(/\s+/).join(' ');
}

/* ---------------- đệm ---------------- */
/* Ba lớp chống Lark báo "OpenAPIListRecord limited" (800004135) — đã dính
 * ngay lần mở đầu trong hub, vì lớp vỏ gọi /api/nhac, /api/tong-quan và
 * /api/nghi cùng lúc, mỗi cái đọc 2–3 bảng:
 *   1. đệm 15 giây theo bảng;
 *   2. lượt đọc ĐANG BAY của cùng một bảng thì dùng chung, không đọc lại;
 *   3. mọi lượt đọc Base xếp hàng MỘT, không bắn song song. */
const dem = new Map();
const dangBay = new Map();
let hang = Promise.resolve();
const xepHang = (f) => { const lan = hang.then(f, f); hang = lan.catch(() => {}); return lan; };

async function coDem(khoa, moi, lay) {
  const c = dem.get(khoa);
  if (!moi && c && Date.now() - c.luc < cfg.cacheTtlMs) return c.v;
  // đọc ép mới (sau khi ghi) thì KHÔNG dùng lượt đang bay — nó có thể bắt đầu trước lúc ghi
  if (!moi && dangBay.has(khoa)) return dangBay.get(khoa);
  const lan = xepHang(lay).then((v) => { dem.set(khoa, { luc: Date.now(), v }); return v; })
    .finally(() => dangBay.delete(khoa));
  dangBay.set(khoa, lan);
  return lan;
}
const xoaDem = () => dem.clear();

/* ---------------- Nhân sự ---------------- */
function veNhanSu(r) {
  const c = r.cells, N = F.nhanSu;
  return {
    recordId: r.record_id,
    hoTen: asText(c[N.hoTen.id]).trim(),
    maNV: asText(c[N.maNV.id]).trim(),
    chucVu: asText(c[N.chucVu.id]).trim(),
    thuTu: asSo(c[N.thuTu.id]),
    dangLam: asTick(c[N.dangLam.id]),
    nguoi: asText(c[N.nguoi.id]).trim(),
    email: asText(c[N.email.id]).trim().toLowerCase(),
  };
}
async function dsNhanSu(moi) {
  return coDem('ns', moi, async () => (await lark.listAllRecords(cfg.nhanSuTableId))
    .map(veNhanSu).filter((x) => x.hoTen)
    .sort((a, b) => (a.thuTu || 999) - (b.thuTu || 999) || a.hoTen.localeCompare(b.hoTen, 'vi')));
}

/**
 * Người đang gọi là ai trong danh sách HCNS.
 *
 * Thứ tự khoá: open_id → email → tên. open_id do TỪNG app Lark cấp riêng (xem
 * memory lark-nam-app-cua-phong) nên bản trên máy và bản trên Render ra hai id
 * khác nhau cho cùng một người; tên là khoá cuối, và chỉ nhận khi khớp ĐÚNG MỘT
 * người — hai người trùng tên thì bắt tự chọn chứ không đoán.
 */
function timNhanSu(toi, ds) {
  if (!toi) return null;
  const id = String(toi.id || '').trim();
  const mail = String(toi.email || '').trim().toLowerCase();
  let n = id && ds.find((x) => x.nguoi === id);
  if (!n && mail) n = ds.find((x) => x.email === mail);
  if (!n && toi.ten) {
    const t = chuanTen(toi.ten);
    const khop = ds.filter((x) => chuanTen(x.hoTen) === t);
    if (khop.length === 1) n = khop[0];
  }
  /* Tên Lark hay lệch tên HCNS: "Nguyễn Long Khánh (Pinky)", "Võ Hằng", "Hân Phù
   * MKT" (23/09/2026, ba người bị hỏi "Bạn là ai" dù đã có tên). So mềm: mọi chữ
   * của tên Lark nằm trong tên HCNS, và chỉ đúng MỘT người khớp. */
  if (!n && toi.ten) {
    const khop = ds.filter((x) => tenKhopMem(toi.ten, x.hoTen));
    if (khop.length === 1) n = khop[0];
  }
  return n || null;
}

/** Bỏ phần trong ngoặc, chữ "MKT" và dấu — còn lại tập chữ của tên. */
function chuTen(s) {
  const bo = String(s || '').split('(')[0];
  return chuanTen(bo).split(' ').filter((w) => w && w !== 'mkt');
}

/** Tên Lark `a` khớp tên HCNS `b` khi mọi chữ của a đều có trong b (không đòi thứ tự). */
function tenKhopMem(a, b) {
  const A = chuTen(a), B = new Set(chuTen(b));
  return A.length > 0 && A.every((w) => B.has(w));
}

/**
 * Ghi open_id/email vào dòng Nhân sự lần đầu gặp — lần sau khỏi so tên.
 *
 * open_id CHỈ ghi ở chế độ api (bản Render, app Marketing Hub). Chạy trên máy
 * (cli) thì id là của app Lark CLI — ghi vào thì bản Render không bao giờ khớp
 * được nữa và bản đồ nhiệt phải lùi về so tên. Đã dính ngay lần mở thử đầu tiên
 * 23/09/2026. `batBuoc` = người tự bấm nhận tên mình: lúc đó ghi cả hai.
 */
async function ganNhanSu(ns, toi, batBuoc) {
  const N = F.nhanSu;
  const doi = {};
  if (toi.id && !ns.nguoi && (cfg.mode === 'api' || batBuoc)) doi[N.nguoi.name] = toi.id;
  if (toi.email && !ns.email) doi[N.email.name] = String(toi.email).toLowerCase();
  if (!Object.keys(doi).length) return ns;
  await lark.updateRecord(ns.recordId, doi, cfg.nhanSuTableId);
  xoaDem();
  return Object.assign({}, ns, { nguoi: ns.nguoi || doi[N.nguoi.name] || '', email: ns.email || doi[N.email.name] || '' });
}

/* ---------------- Ngày lễ ---------------- */
async function dsNgayLe(moi) {
  return coDem('le', moi, async () => (await lark.listAllRecords(cfg.ngayLeTableId))
    .map((r) => ({ ten: asText(r.cells[F.ngayLe.ten.id]).trim(), ngay: asNgay(r.cells[F.ngayLe.ngay.id]) }))
    .filter((x) => x.ngay)
    .sort((a, b) => a.ngay.localeCompare(b.ngay)));
}
const leCua = (le, thang) => le.filter((x) => x.ngay.startsWith(thang + '-')).map((x) => x.ngay);

/* ---------------- Đăng ký tháng ---------------- */
function veDangKy(r) {
  const c = r.cells, D = F.dangKy;
  const thang = asText(c[D.thang.id]).trim();
  const t = MA.docThang(thang);
  const n = t ? MA.soNgay(t.nam, t.thang) : 31;
  const ma = [];
  for (let d = 1; d <= n; d++) ma.push(asText(c[F.ngay[d].id]).trim());
  return {
    recordId: r.record_id,
    ma: asText(c[D.ma.id]).trim(),
    thang,
    maNV: asText(c[D.maNV.id]).trim(),
    hoTen: asText(c[D.hoTen.id]).trim(),
    chucVu: asText(c[D.chucVu.id]).trim(),
    nguoi: asText(c[D.nguoi.id]).trim(),
    email: asText(c[D.email.id]).trim().toLowerCase(),
    trangThai: asText(c[D.trangThai.id]).trim() || C.trangThai.nhap,
    congChuan: asSo(c[D.congChuan.id]),
    tongCong: asSo(c[D.tongCong.id]),
    nghi: asSo(c[D.nghi.id]),
    nopLuc: asMs(c[D.nopLuc.id]),
    suaLuc: asMs(c[D.suaLuc.id]),
    chuyenLuc: asMs(c[D.chuyenLuc.id]),
    suaSau: asTick(c[D.suaSau.id]),
    ghiChu: asText(c[D.ghiChu.id]),
    ngay: ma,
  };
}

async function dsDangKy(thang, moi) {
  const het = await coDem('dk', moi, async () =>
    (await lark.listAllRecords(cfg.dangKyTableId)).map(veDangKy).filter((x) => x.thang));
  return thang ? het.filter((x) => x.thang === thang) : het;
}

const daNop = (p) => !!p && (p.trangThai === C.trangThai.daNop || p.trangThai === C.trangThai.daChuyen);

/**
 * Lưu lịch của một người cho một tháng. Tạo mới nếu chưa có phiếu, không thì
 * ghi đè đúng phiếu đó — khoá là Mã phiếu "YYYY-MM|Mã NV".
 *
 * `nop`: true = bấm Nộp. Phiếu đã chuyển HCNS mà sửa lại thì lùi về "Đã nộp" và
 * bật cờ "Sửa sau khi chuyển" để quản lý biết phải chép lại dòng này.
 */
async function luuDangKy({ thang, ns, ma, nop, ghiChu, ngayLe }) {
  const D = F.dangKy;
  const khoa = thang + '|' + (ns.maNV || ns.recordId);
  const cu = (await dsDangKy(thang, true)).find((x) => x.ma === khoa);
  const t = MA.tinh(thang, ma, ngayLe);
  const nay = Date.now();

  const o = {
    [D.ma.name]: khoa,
    [D.thang.name]: thang,
    [D.maNV.name]: ns.maNV,
    [D.hoTen.name]: ns.hoTen,
    [D.chucVu.name]: ns.chucVu,
    [D.congChuan.name]: t.congChuan,
    [D.tongCong.name]: t.tongCong,
    [D.nghi.name]: t.nghi,
    [D.suaLuc.name]: nay,
  };
  /* Lấy từ dòng Nhân sự, KHÔNG từ người bấm: quản lý sửa hộ thì phiếu vẫn đứng
   * tên nhân sự đó. Tự nộp thì ganNhanSu() đã điền open_id trước khi tới đây. */
  if (ns.nguoi) o[D.nguoi.name] = ns.nguoi;
  if (ns.email) o[D.email.name] = ns.email;
  if (ghiChu != null) o[D.ghiChu.name] = String(ghiChu).slice(0, 2000);
  const n = MA.soNgay(MA.docThang(thang).nam, MA.docThang(thang).thang);
  for (let d = 1; d <= 31; d++) o[F.ngay[d].name] = d <= n ? ma[d - 1] : null;

  if (nop) {
    o[D.trangThai.name] = C.trangThai.daNop;
    if (!cu || !cu.nopLuc) o[D.nopLuc.name] = nay;
    if (cu && cu.trangThai === C.trangThai.daChuyen) o[D.suaSau.name] = true;
  } else if (!cu) {
    o[D.trangThai.name] = C.trangThai.nhap;
  } else if (cu.trangThai === C.trangThai.daChuyen) {
    o[D.trangThai.name] = C.trangThai.daNop;
    o[D.suaSau.name] = true;
  }

  if (cu) await lark.updateRecord(cu.recordId, o, cfg.dangKyTableId);
  else await lark.createRecord(o, cfg.dangKyTableId);
  xoaDem();
  return (await dsDangKy(thang, true)).find((x) => x.ma === khoa) || null;
}

/** Đánh dấu các phiếu đã được chép sang sheet HCNS. */
async function danhDauChuyen(ids) {
  if (!ids.length) return;
  const D = F.dangKy;
  const nay = Date.now();
  const map = {};
  ids.forEach((id) => {
    map[id] = { [D.trangThai.name]: C.trangThai.daChuyen, [D.chuyenLuc.name]: nay, [D.suaSau.name]: false };
  });
  /* Dòng lệnh Windows chặn ở ~32.000 ký tự (memory quy-chi-phi) — ghi từng lô 10. */
  const khoa = Object.keys(map);
  for (let i = 0; i < khoa.length; i += 10) {
    const lo = {};
    khoa.slice(i, i + 10).forEach((k) => { lo[k] = map[k]; });
    await lark.updateMany(lo, cfg.dangKyTableId);
  }
  xoaDem();
}

/**
 * Thêm / sửa một dòng Nhân sự (tab Thành viên của quản lý).
 *
 * KHÔNG có xoá: bớt thành viên = tắt "Đang làm". Xoá hẳn thì lịch các tháng cũ
 * của người đó mất chỗ nối (bảng cả phòng tháng trước còn cần tên + mã NV).
 */
async function luuNhanSu(recordId, o) {
  const N = F.nhanSu;
  const doi = {};
  if (o.hoTen != null) doi[N.hoTen.name] = String(o.hoTen).trim().slice(0, 120);
  if (o.maNV != null) doi[N.maNV.name] = String(o.maNV).trim().toUpperCase().slice(0, 30);
  if (o.chucVu != null) doi[N.chucVu.name] = String(o.chucVu).trim().slice(0, 120);
  if (o.thuTu != null && Number.isFinite(Number(o.thuTu))) doi[N.thuTu.name] = Number(o.thuTu);
  if (o.dangLam != null) doi[N.dangLam.name] = !!o.dangLam;
  if (o.email != null) doi[N.email.name] = String(o.email).trim().toLowerCase() || null;
  /* Gỡ liên kết: xoá cả open_id lẫn email — lần mở sau app nhận lại người theo tên. */
  if (o.goLienKet) { doi[N.nguoi.name] = null; doi[N.email.name] = null; }
  if (!Object.keys(doi).length) return null;
  if (recordId) await lark.updateRecord(recordId, doi, cfg.nhanSuTableId);
  else await lark.createRecord(doi, cfg.nhanSuTableId);
  xoaDem();
  return true;
}

/* ---------------- Cấu hình kỳ đăng ký ---------------- */
async function docCauHinhTho(moi) {
  return coDem('ch', moi, async () => (await lark.listAllRecords(cfg.cauHinhTableId)).map((r) => ({
    recordId: r.record_id,
    khoa: asText(r.cells[F.cauHinh.khoa.id]).trim(),
    giaTri: asText(r.cells[F.cauHinh.giaTri.id]).trim(),
  })).filter((x) => x.khoa));
}

/** Cấu hình đã kiểm. Base hỏng / ô gõ sai thì lùi về mặc định — KHÔNG được làm
 *  sập cả app vì một ô cấu hình. */
async function docCauHinh(moi) {
  let tho = [];
  try { tho = await docCauHinhTho(moi); } catch (_) { tho = []; }
  const o = {};
  tho.forEach((x) => { if (x.khoa in MA.CAU_HINH_MAC_DINH && x.giaTri !== '') o[x.khoa] = x.giaTri; });
  const k = MA.kiemCauHinh(o);
  return k.ch || Object.assign({}, MA.CAU_HINH_MAC_DINH);
}

/** Ghi cấu hình đã kiểm: sửa dòng có sẵn, thiếu khoá nào thì thêm dòng khoá đó. */
async function luuCauHinh(ch) {
  const tho = await docCauHinhTho(true);
  const K = F.cauHinh;
  const map = {};
  const moi = [];
  Object.keys(MA.CAU_HINH_MAC_DINH).forEach((k) => {
    const v = k === 'batBuoc' ? (ch[k] ? '1' : '0') : String(ch[k]);
    const r = tho.find((x) => x.khoa === k);
    if (r) { if (r.giaTri !== v) map[r.recordId] = { [K.giaTri.name]: v }; }
    else moi.push({ [K.khoa.name]: k, [K.giaTri.name]: v });
  });
  if (Object.keys(map).length) await lark.updateMany(map, cfg.cauHinhTableId);
  if (moi.length) await lark.createMany(moi, cfg.cauHinhTableId);
  xoaDem();
}

module.exports = {
  docCauHinh, luuCauHinh,
  luuNhanSu,
  asText, asMs, asNgay, chuanTen, tenKhopMem, veDangKy, veNhanSu,
  dsNhanSu, timNhanSu, ganNhanSu, dsNgayLe, leCua, dsDangKy, daNop,
  luuDangKy, danhDauChuyen, xoaDem,
};
