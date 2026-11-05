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
const { dongBo } = require('./dong-bo');
const TK = require('./thongke');
const bang = require('./bang');
const baoNhom = require('./bao-nhom');
const canhBao = require('./canh-bao');

const R = cfg.routine;

const tinhTrang = { dangChay: false, lan: null, loi: '', luc: null, baoNhom: null };
const TIEN = ['soTien', 'hoaHong', 'giaBan', 'daThanhToan'];
const docBooking = (o) => bang.doc(o);

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
    tinhTrang.loi = (tinhTrang.lan.hong || []).length ? 'Không ghi được vào Base: ' + tinhTrang.lan.hong.join(' | ') : '';
    if (tinhTrang.lan.them || tinhTrang.lan.sua) bang.xoaCache();
    /* Báo nhóm Booking KS sau khi Base đã có đơn mới. Lỗi báo nhóm không làm hỏng lượt đọc thư. */
    if (baoNhom.batBao()) tinhTrang.baoNhom = { ...(await baoNhom.chay()), luc: new Date().toISOString() };
  } catch (e) {
    tinhTrang.loi = e.message || String(e);
    console.error('[routine] đồng bộ hỏng:', tinhTrang.loi);
  } finally {
    tinhTrang.dangChay = false;
    tinhTrang.luc = new Date().toISOString();
  }
  /* Bản tự đọc (Render) hỏng liên tục 10 phút thì nhắn riêng anh Hùng (canh-bao.js). */
  if (R.chuKyMs) {
    const loiNhom = ((tinhTrang.baoNhom && tinhTrang.baoNhom.loi) || []).join(' | ');
    const loi = [tinhTrang.loi, loiNhom && 'Gửi tin nhóm: ' + loiNhom].filter(Boolean).join(' · ');
    await canhBao.sauLuot(loi, { hop: R.hop });
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

  /* Gửi thử tin nhóm cho RIÊNG người bấm (quản lý), không vào nhóm. ?ma=<mã> để chọn đơn. */
  if (p === '/api/routine/thu-tin' && req.method === 'POST') {
    if (!quyenCua(req).quanLy) { fail(res, 403, 'Chỉ quản lý được gửi thử tin nhóm.'); return true; }
    const ai = await nguoiDung(req).catch(() => null);
    if (!ai || !ai.id) { fail(res, 400, 'Không biết bạn là ai để gửi thử. Mở app qua Marketing Hub.'); return true; }
    const kq = await baoNhom.guiThu({ userId: ai.id, ma: u.searchParams.get('ma') || '' });
    if (kq.ok) ok(res, kq); else fail(res, 502, kq.loi || 'Gửi thử không được');
    return true;
  }

  if (p === '/api/routine/gui-bu' && req.method === 'POST') {
    if (!quyenCua(req).quanLy) { fail(res, 403, 'Chỉ quản lý được gửi bù tin nhóm.'); return true; }
    const ma = u.searchParams.get('ma') || '';
    if (!ma) { fail(res, 400, 'Thiếu mã đơn cần gửi bù.'); return true; }
    const kq = await baoNhom.guiBu({ ma });
    if (kq.ok) ok(res, kq); else fail(res, 502, kq.loi || 'Gửi bù không được');
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
      doi.chamSoc = body.chamSoc || null;
    }
    if (body.ghiChuChamSoc !== undefined) doi.ghiChuChamSoc = String(body.ghiChuChamSoc || '').slice(0, 2000);
    if (!Object.keys(doi).length) { fail(res, 400, 'Không có gì để lưu'); return true; }
    const ai = await nguoiDung(req).catch(() => null);
    doi.nguoiChamSoc = (ai && ai.name) || '';
    doi.chamSocLuc = gioVN();
    await bang.ghi(m[1], doi);
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
