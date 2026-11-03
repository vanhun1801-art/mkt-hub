'use strict';
/**
 * Đường /api/routine/* của OTA Manager: đọc Base booking khách sạn của Routine
 * Hospitality, đồng bộ thư theo chu kỳ, thống kê theo kênh.
 *
 *   GET  /api/routine/bookings   danh sách + thống kê + trạng thái đồng bộ
 *   POST /api/routine/dong-bo    đọc thư mới ngay
 */
const cfg = require('../config');
const lark = cfg.mode === 'api' ? require('../larkapi') : require('../lark');
const { dongBo } = require('./dong-bo');

const R = cfg.routine;
const TTL = 30000;

const tinhTrang = { dangChay: false, lan: null, loi: '', luc: null };
let cache = { luc: 0, rows: null };

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
};
const KIEU_GIO = new Set(['ngayDat', 'nhanPhong', 'traPhong', 'capNhat']);
const KIEU_SO = new Set(['soDem', 'soKhach', 'soTien', 'hoaHong', 'giaBan', 'daThanhToan']);
const TIEN = ['soTien', 'hoaHong', 'giaBan', 'daThanhToan'];

async function docBooking({ force = false } = {}) {
  if (!force && cache.rows && Date.now() - cache.luc < TTL) return cache.rows;
  const rows = await lark.voiBase(R.baseToken, async () => {
    const cot = await lark.listFields(R.tableId);
    const idCot = Object.fromEntries(Object.entries(COT).map(([k, ten]) => [k, (cot.find((c) => c.name === ten) || {}).id]));
    return (await lark.listAll(R.tableId)).map((r) => {
      const b = { id: r.id };
      for (const [k, fid] of Object.entries(idCot)) {
        const v = fid ? r.c[fid] : null;
        b[k] = KIEU_GIO.has(k) ? gio(v) : KIEU_SO.has(k) ? so(v) : k === 'daSua' ? !!v : chu(v);
      }
      b.nhanPhong = b.nhanPhong.slice(0, 10);
      b.traPhong = b.traPhong.slice(0, 10);
      return b;
    });
  });
  rows.sort((a, b) => ((a.ngayDat || a.capNhat) < (b.ngayDat || b.capNhat) ? 1 : -1));
  cache = { luc: Date.now(), rows };
  return rows;
}

/** Cộng theo kênh. Đơn huỷ chỉ đếm số, không cộng đêm phòng hay tiền. */
function thongKe(rows) {
  const theo = new Map();
  const tong = { kenh: 'Tổng', don: 0, huy: 0, dem: 0, tien: 0, hoaHong: 0 };
  for (const b of rows) {
    const k = b.kenh || 'Khác';
    if (!theo.has(k)) theo.set(k, { kenh: k, don: 0, huy: 0, dem: 0, tien: 0, hoaHong: 0 });
    for (const o of [theo.get(k), tong]) {
      if (b.trangThai === 'Đã huỷ') { o.huy++; continue; }
      o.don++;
      o.dem += b.soDem || 0;
      o.tien += b.soTien || 0;
      o.hoaHong += b.hoaHong || 0;
    }
  }
  return { theoKenh: [...theo.values()].sort((a, b) => b.don - a.don), tong };
}

function cheTien(b) {
  const ra = { ...b };
  TIEN.forEach((k) => { delete ra[k]; });
  return ra;
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

/** Trả true nếu đã xử lý đường này. */
async function xuLy(req, res, u, { ok, fail, quyenCua }) {
  const p = u.pathname;
  if (p === '/api/routine/bookings' && req.method === 'GET') {
    const perm = quyenCua(req);
    let rows = [], loi = '';
    try { rows = await docBooking({ force: u.searchParams.get('moi') === '1' }); } catch (e) { loi = e.message; }
    const tk = thongKe(rows);
    if (!perm.chiPhi) {
      tk.theoKenh.forEach((o) => { delete o.tien; delete o.hoaHong; });
      delete tk.tong.tien; delete tk.tong.hoaHong;
    }
    ok(res, {
      rows: perm.chiPhi ? rows : rows.map(cheTien),
      thongKe: tk,
      perm: { chiPhi: perm.chiPhi },
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
  return false;
}

module.exports = { xuLy, henGio, docBooking, thongKe };
