'use strict';
/**
 * Đường /api/routine/* của OTA Manager: đọc Base booking khách sạn của Routine
 * Hospitality, đồng bộ thư theo chu kỳ, lọc, thống kê và cập nhật chăm sóc khách.
 *
 *   GET   /api/routine/bookings     đơn đã lọc + thẻ việc + thống kê + trạng thái đọc thư
 *   POST  /api/routine/dong-bo      đọc thư mới ngay
 *   PATCH /api/routine/don/<id>     lưu chăm sóc khách (cần quyền được sửa)
 *   GET   /api/routine/export.csv   xuất danh sách đang lọc
 */
const cfg = require('../config');
const lark = cfg.mode === 'api' ? require('../larkapi') : require('../lark');
const { dongBo } = require('./dong-bo');
const TK = require('./thongke');

const R = cfg.routine;
const TTL = 30000;

const tinhTrang = { dangChay: false, lan: null, loi: '', luc: null };
let cache = { luc: 0, rows: null, cot: null };

/* Base Routine đặt múi UTC và app ghi giờ Việt Nam dạng chuỗi trần, nên phần
 * ngày giờ đọc về đúng là giờ Việt Nam: lấy nguyên chữ, không quy đổi. */
function gio(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 16).replace('T', ' ');
  return String(v).slice(0, 16).replace('T', ' ');
}
const chu = (v) => (Array.isArray(v) ? v.map((x) => (x && (x.text || x.name)) || x).join(', ') : v == null ? '' : String(v));
const so = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

const COT = {
  ma: 'Mã đặt phòng', kenh: 'Kênh', maOta: 'Mã OTA', tenKhach: 'Tên khách', trangThai: 'Trạng thái',
  ngayDat: 'Ngày đặt', nhanPhong: 'Nhận phòng', traPhong: 'Trả phòng', soDem: 'Số đêm', phong: 'Phòng',
  hangPhong: 'Hạng phòng', soKhach: 'Số khách', quocGia: 'Quốc gia', soTien: 'Số tiền',
  hoaHong: 'Hoa hồng OTA', giaBan: 'Giá bán OTA', daThanhToan: 'Đã thanh toán', daSua: 'OTA đã sửa',
  ghiChu: 'Yêu cầu / ghi chú', lichSu: 'Lịch sử', capNhat: 'Thư mới nhất',
  chamSoc: 'Chăm sóc', ghiChuChamSoc: 'Ghi chú chăm sóc', nguoiChamSoc: 'Người chăm sóc', chamSocLuc: 'Chăm sóc lúc',
};
const KIEU_GIO = new Set(['ngayDat', 'nhanPhong', 'traPhong', 'capNhat', 'chamSocLuc']);
const KIEU_SO = new Set(['soDem', 'soKhach', 'soTien', 'hoaHong', 'giaBan', 'daThanhToan']);
const TIEN = ['soTien', 'hoaHong', 'giaBan', 'daThanhToan'];

async function docBooking({ force = false } = {}) {
  if (!force && cache.rows && Date.now() - cache.luc < TTL) return cache.rows;
  const { rows, cot } = await lark.voiBase(R.baseToken, async () => {
    const ds = await lark.listFields(R.tableId);
    const idCot = Object.fromEntries(Object.entries(COT).map(([k, ten]) => [k, (ds.find((c) => c.name === ten) || {}).id]));
    const rows = (await lark.listAll(R.tableId)).map((r) => {
      const b = { id: r.id };
      for (const [k, fid] of Object.entries(idCot)) {
        const v = fid ? r.c[fid] : null;
        b[k] = KIEU_GIO.has(k) ? gio(v) : KIEU_SO.has(k) ? so(v) : k === 'daSua' ? !!v : chu(v);
      }
      b.nhanPhong = b.nhanPhong.slice(0, 10);
      b.traPhong = b.traPhong.slice(0, 10);
      return b;
    });
    return { rows, cot: idCot };
  });
  rows.sort((a, b) => ((a.ngayDat || a.capNhat) < (b.ngayDat || b.capNhat) ? 1 : -1));
  cache = { luc: Date.now(), rows, cot };
  return rows;
}

function cheTien(b) {
  const ra = { ...b };
  TIEN.forEach((k) => { delete ra[k]; });
  return ra;
}
function cheTienGop(g) {
  const ra = { ...g };
  ['tien', 'hoaHong', 'giaDem'].forEach((k) => { delete ra[k]; });
  return ra;
}

const ds = (u, k) => (u.searchParams.get(k) || '').split(',').map((x) => x.trim()).filter(Boolean);
function queryLoc(u) {
  return {
    from: u.searchParams.get('from') || '',
    to: u.searchParams.get('to') || '',
    truong: u.searchParams.get('truong') || 'nhanPhong',
    kenh: ds(u, 'kenh'),
    trangThai: ds(u, 'trangThai'),
    chamSoc: ds(u, 'chamSoc'),
    tim: u.searchParams.get('tim') || '',
  };
}

/** Sắp danh sách: đơn sắp nhận phòng lên đầu theo ngày, rồi đơn đã qua (mới nhất trước). */
function sapXep(rows, nay) {
  const toi = rows.filter((b) => b.nhanPhong && b.nhanPhong >= nay).sort((a, b) => (a.nhanPhong < b.nhanPhong ? -1 : 1));
  const qua = rows.filter((b) => !(b.nhanPhong && b.nhanPhong >= nay)).sort((a, b) => ((a.nhanPhong || '') < (b.nhanPhong || '') ? 1 : -1));
  return toi.concat(qua);
}

async function chayDongBo() {
  if (tinhTrang.dangChay) return tinhTrang.lan;
  tinhTrang.dangChay = true;
  try {
    tinhTrang.lan = await dongBo();
    tinhTrang.loi = '';
    if (tinhTrang.lan.them || tinhTrang.lan.sua) cache.rows = null;
  } catch (e) {
    tinhTrang.loi = e.message || String(e);
    console.error('[routine] đồng bộ hỏng:', tinhTrang.loi);
  } finally {
    tinhTrang.dangChay = false;
    tinhTrang.luc = new Date().toISOString();
  }
  return tinhTrang.lan;
}

/** Tự đọc thư theo chu kỳ. Chạy lượt đầu sau 20 giây để không chen lúc app khởi động. */
function henGio() {
  if (!R.chuKyMs) return;
  setTimeout(chayDongBo, 20000).unref();
  setInterval(chayDongBo, Math.max(60000, R.chuKyMs)).unref();
}

const gioVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');

/** Trả true nếu đã xử lý đường này. */
async function xuLy(req, res, u, { ok, fail, send, quyenCua, readBody, nguoiDung }) {
  const p = u.pathname;
  let m;

  if (p === '/api/routine/bookings' && req.method === 'GET') {
    const perm = quyenCua(req);
    const nay = TK.homNayVN();
    let rows = [], loi = '';
    try { rows = TK.danhDau(await docBooking({ force: u.searchParams.get('moi') === '1' }), nay); } catch (e) { loi = e.message; }
    const daLoc = sapXep(TK.loc(rows, queryLoc(u)), nay);
    const vh = TK.vanHanh(rows, nay);
    const tk = TK.thongKe(daLoc);
    if (!perm.chiPhi) {
      tk.tong = cheTienGop(tk.tong);
      tk.theoKenh = tk.theoKenh.map(cheTienGop);
      tk.theoThang = tk.theoThang.map(cheTienGop);
      Object.keys(vh.nhom).forEach((k) => { vh.nhom[k] = vh.nhom[k].map(cheTien); });
    }
    ok(res, {
      rows: perm.chiPhi ? daLoc : daLoc.map(cheTien),
      tongTatCa: rows.length,
      vanHanh: vh,
      thongKe: tk,
      homNay: nay,
      danhMuc: { kenh: TK.KENH, trangThai: TK.TRANG_THAI, chamSoc: TK.CHAM_SOC },
      perm: { chiPhi: perm.chiPhi, duocSua: perm.duocSua },
      dongBo: { ...tinhTrang, chuKyMs: R.chuKyMs, hop: R.hop },
      baseUrl: R.baseUrl,
      loi,
    });
    return true;
  }

  if (p === '/api/routine/dong-bo' && req.method === 'POST') {
    await chayDongBo();
    if (tinhTrang.loi) fail(res, 502, tinhTrang.loi);
    else ok(res, { ...tinhTrang });
    return true;
  }

  if ((m = p.match(/^\/api\/routine\/don\/([\w-]+)$/)) && req.method === 'PATCH') {
    if (!quyenCua(req).duocSua) {
      fail(res, 403, 'Bạn chỉ được xem, chưa được cập nhật chăm sóc khách. Quản lý cấp quyền trong bảng "Phân quyền app".', { code: 'CHI_XEM' });
      return true;
    }
    const body = await readBody(req);
    const doi = {};
    if (body.chamSoc !== undefined) {
      if (body.chamSoc && !TK.CHAM_SOC.includes(body.chamSoc)) { fail(res, 400, 'Trạng thái chăm sóc không hợp lệ'); return true; }
      doi[COT.chamSoc] = body.chamSoc || null;
    }
    if (body.ghiChuChamSoc !== undefined) doi[COT.ghiChuChamSoc] = String(body.ghiChuChamSoc || '').slice(0, 2000);
    if (!Object.keys(doi).length) { fail(res, 400, 'Không có gì để lưu'); return true; }
    const ai = await nguoiDung(req).catch(() => null);
    doi[COT.nguoiChamSoc] = (ai && ai.name) || '';
    doi[COT.chamSocLuc] = gioVN();
    await lark.voiBase(R.baseToken, () => lark.updateRecord(R.tableId, m[1], doi));
    cache.rows = null;
    const b = TK.danhDau(await docBooking({ force: true })).find((x) => x.id === m[1]);
    ok(res, b ? (quyenCua(req).chiPhi ? b : cheTien(b)) : { id: m[1] });
    return true;
  }

  if (p === '/api/routine/export.csv' && req.method === 'GET') {
    const perm = quyenCua(req);
    const nay = TK.homNayVN();
    const rows = sapXep(TK.loc(TK.danhDau(await docBooking(), nay), queryLoc(u)), nay);
    const cot = [
      ['Kênh', 'kenh'], ['Mã đặt phòng', 'ma'], ['Mã OTA', 'maOta'], ['Tên khách', 'tenKhach'],
      ['Quốc gia', 'quocGia'], ['Số khách', 'soKhach'], ['Ngày đặt', 'ngayDat'], ['Nhận phòng', 'nhanPhong'],
      ['Trả phòng', 'traPhong'], ['Số đêm', 'soDem'], ['Phòng', 'phong'], ['Hạng phòng', 'hangPhong'],
      ...(perm.chiPhi ? [['Số tiền', 'soTien'], ['Hoa hồng OTA', 'hoaHong'], ['Giá bán OTA', 'giaBan'], ['Đã thanh toán', 'daThanhToan']] : []),
      ['Trạng thái', 'trangThai'], ['Chăm sóc', 'chamSoc'], ['Ghi chú chăm sóc', 'ghiChuChamSoc'],
      ['Người chăm sóc', 'nguoiChamSoc'], ['Cần xử lý', 'canXuLyChuoi'], ['Yêu cầu / ghi chú', 'ghiChu'],
    ];
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = [cot.map((c) => esc(c[0])).join(',')].concat(rows.map((r) => {
      const x = { ...r, canXuLyChuoi: r.canXuLy.map((c) => c.nhan).join(' · ') };
      return cot.map((c) => esc(x[c[1]])).join(',');
    })).join('\r\n');
    send(res, 200, '﻿' + csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="booking-routine-hospitality.csv"',
    });
    return true;
  }
  return false;
}

module.exports = { xuLy, henGio, docBooking, sapXep };
