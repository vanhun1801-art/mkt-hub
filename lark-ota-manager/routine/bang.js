'use strict';
/**
 * Đọc và ghi bảng "Booking khách sạn" trong Base Routine Hospitality, dùng chung
 * cho màn hình (api.js) và bộ báo nhóm (bao-nhom.js).
 *
 * Base đặt múi UTC và app ghi giờ Việt Nam dạng chuỗi trần, nên phần ngày giờ
 * đọc về đúng là giờ Việt Nam: lấy nguyên chữ, không quy đổi.
 */
const cfg = require('../config');
const lark = cfg.mode === 'api' ? require('../larkapi') : require('../lark');

const R = cfg.routine;
const TTL = 30000;

const COT = {
  ma: 'Mã đặt phòng', kenh: 'Kênh', maOta: 'Mã OTA', tenKhach: 'Tên khách', trangThai: 'Trạng thái',
  ngayDat: 'Ngày đặt', nhanPhong: 'Nhận phòng', traPhong: 'Trả phòng', soDem: 'Số đêm', phong: 'Phòng',
  hangPhong: 'Hạng phòng', soKhach: 'Số khách', nguoiLon: 'Người lớn', treEm: 'Trẻ em', quocGia: 'Quốc gia',
  soTien: 'Số tiền', hoaHong: 'Hoa hồng OTA', giaBan: 'Giá bán OTA', daThanhToan: 'Đã thanh toán',
  daSua: 'OTA đã sửa', ghiChu: 'Yêu cầu / ghi chú', lichSu: 'Lịch sử', capNhat: 'Thư mới nhất',
  chamSoc: 'Chăm sóc', ghiChuChamSoc: 'Ghi chú chăm sóc', nguoiChamSoc: 'Người chăm sóc', chamSocLuc: 'Chăm sóc lúc',
  tinNhom: 'Tin nhóm', daBaoNhom: 'Đã báo nhóm',
  lyDoHuy: 'Lý do huỷ', nhacCskh: 'Nhắc CSKH',
};
/* Cột chữ app tự tạo nếu Base chưa có (nhac.js, 07/11/2026). */
const COT_TU_TAO = {
  lyDoHuy: 'Lý do khách huỷ, CSKH ghi sau khi gọi khách (chọn trên app OTA Manager).',
  nhacCskh: 'App ghi những lần đã nhắc CSKH trong luồng tin Booking KS, mỗi dòng một lần. Đừng sửa tay.',
};
const KIEU_GIO = new Set(['ngayDat', 'nhanPhong', 'traPhong', 'capNhat', 'chamSocLuc']);
const KIEU_SO = new Set(['soDem', 'soKhach', 'nguoiLon', 'treEm', 'soTien', 'hoaHong', 'giaBan', 'daThanhToan']);

function gio(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 16).replace('T', ' ');
  return String(v).slice(0, 16).replace('T', ' ');
}
const chu = (v) => (Array.isArray(v) ? v.map((x) => (x && (x.text || x.name)) || x).join(', ') : v == null ? '' : String(v));
const so = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

let cache = { luc: 0, rows: null };
/* Cột tự tạo mà Base chưa có (null = chưa đọc lần nào): ghi() bỏ qua, để một cột
 * thiếu không làm hỏng việc ghi "Tin nhóm" (hỏng là tin booking gửi trùng). */
let coCot = null;

/** Mọi đơn trong Base, mới đặt trước. */
async function doc({ force = false } = {}) {
  if (!force && cache.rows && Date.now() - cache.luc < TTL) return cache.rows;
  const rows = await lark.voiBase(R.baseToken, async () => {
    const ds = await lark.listFields(R.tableId);
    const idCot = Object.fromEntries(Object.entries(COT).map(([k, ten]) => [k, (ds.find((c) => c.name === ten) || {}).id]));
    coCot = new Set(Object.keys(idCot).filter((k) => idCot[k]));
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

const xoaCache = () => { cache.rows = null; };

let daKiemCot = false;
/** Tạo các cột trong COT_TU_TAO nếu Base chưa có. Trả tên cột vừa tạo. Chạy một lần mỗi lần khởi động. */
async function damBaoCot() {
  if (daKiemCot) return [];
  const tao = [];
  await lark.voiBase(R.baseToken, async () => {
    const ds = await lark.listFields(R.tableId);
    for (const [k, moTa] of Object.entries(COT_TU_TAO)) {
      if (ds.some((c) => c.name === COT[k])) continue;
      await lark.createField(R.tableId, { name: COT[k], type: 'text', description: moTa });
      tao.push(COT[k]);
    }
  });
  daKiemCot = true;
  if (tao.length) { xoaCache(); coCot = null; }
  return tao;
}

/** Ghi một dòng; `doi` theo khoá của COT. */
async function ghi(id, doi) {
  const theoTen = {};
  for (const [k, v] of Object.entries(doi)) {
    if (COT_TU_TAO[k] && !(coCot && coCot.has(k))) continue;
    theoTen[COT[k]] = v;
  }
  if (!Object.keys(theoTen).length) return;
  await lark.voiBase(R.baseToken, () => lark.updateRecord(R.tableId, id, theoTen));
  xoaCache();
}

module.exports = { COT, doc, ghi, xoaCache, damBaoCot };
