'use strict';
/**
 * Đọc hai bản xuất Excel của Tourwell: Danh sách lead và Danh sách đơn hàng.
 *
 * Vì sao đọc file xuất chứ không gọi API: ô `Danh mục` khi tạo API key của Tourwell
 * chỉ có một tuỳ chọn `pancake`, tức hai key hiện có chỉ để nhận webhook, không đọc
 * được đơn hàng qua Open API. Chừng nào chưa mở được key đọc thì bản xuất là đường
 * duy nhất. Cấu trúc ở đây giữ nguyên chữ ký để sau này thay bằng API mà không phải
 * sửa phần ghi công.
 *
 * Hai chỗ đã sai thật và được xử lý ở đây:
 *
 *   1. KHOÁ LEAD LÀ SỐ. Tourwell đệm số 0 không nhất quán — cùng một bản xuất có cả
 *      `LU00998` và `LU1997`. So bằng chuỗi thì không bao giờ khớp với ghi chú đơn
 *      POS, mà không khớp thì bảng ra rỗng chứ không báo lỗi.
 *
 *   2. SỐ ĐIỆN THOẠI KHÁC ĐỊNH DẠNG. Lead lưu 755 số dạng `0xxx` và 229 dạng
 *      `(+84)xxx`; đơn lưu 313/319 dạng `(+84)xxx`. Excel còn thêm dấu nháy đơn ở
 *      đầu (`'0933833893`) để giữ số 0. Quy hết về một dạng.
 */
const xlsx = require('./xlsx');
const { chuanSdt } = require('./pancake');
const { soLead } = require('./pancakepos');

/** '31/08/2026 13:06:06' → '2026-08-31'. Trả rỗng nếu không nhận ra. */
function ngay(v) {
  const s = String(v == null ? '' : v).trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/**
 * '14,920,000' → 14920000 · '1.234.567' → 1234567
 *
 * Tourwell xuất số kiểu Anh (phẩy ngăn nghìn). Nhưng phải chịu được cả kiểu Việt
 * (chấm ngăn nghìn) vì cùng một hệ có thể đổi locale — đoán sai là lệch 1000 lần.
 */
function tien(v) {
  let s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '').trim();
  if (!s) return 0;
  const am = s.startsWith('-');
  if (am) s = s.slice(1);

  const coCham = s.includes('.');
  const coPhay = s.includes(',');

  if (coCham && coPhay) {
    // Có cả hai: dấu XUẤT HIỆN SAU là dấu thập phân, dấu kia là ngăn nghìn.
    const thapPhan = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const nghin = thapPhan === '.' ? ',' : '.';
    s = s.split(nghin).join('');
    s = s.split(thapPhan).join('.');
  } else if (coCham || coPhay) {
    const dau = coCham ? '.' : ',';
    const phan = s.split(dau);
    /* Chỉ một loại dấu. Nếu xuất hiện nhiều lần thì chắc chắn là ngăn nghìn.
     * Nếu một lần thì xét nhóm cuối: đúng 3 chữ số là ngăn nghìn ('14,920'),
     * khác 3 là thập phân ('0,44' · '1.5').
     *
     * Bản đầu dùng replace(dau, '.') — chỉ đổi dấu ĐẦU TIÊN, nên '14,920,000'
     * thành '14.920,000' rồi Number() ra NaN rồi trả 0. Toàn bộ cột Tổng tiền
     * về 0 mà không có gì báo. */
    if (phan.length > 2 || phan[phan.length - 1].length === 3) s = phan.join('');
    else s = phan.join('.');
  }

  const n = Number(s);
  return Number.isFinite(n) ? (am ? -n : n) : 0;
}

const chu = (v) => String(v == null ? '' : v).replace(/^'+|'+$/g, '').trim();

const COT_LEAD = ['Mã lead', 'Mã KH', 'Số điện thoại', 'Ngày tạo'];
const COT_DON = ['Mã đơn', 'Mã KH', 'Tổng tiền', 'Ngày tạo'];

function docLead(buf) {
  const b = xlsx.docBang(buf, { tenCot: COT_LEAD });
  const rows = b.rows.map((r) => ({
    ma: chu(r['Mã lead']),
    id: soLead(r['Mã lead']),
    kh: chu(r['Mã KH']),
    khach: chu(r['Khách hàng']),
    sdt: chuanSdt(r['Số điện thoại']),
    ngay: ngay(r['Ngày tạo']),
    nguon: chu(r['Nguồn']),
    trangThai: chu(r['Trạng thái']),
    nguoiTao: chu(r['Người tạo']),
    donHang: chu(r['Đơn hàng']),
    ngayDon: ngay(r['Ngày tạo đơn hàng']),
  })).filter((r) => r.id != null);
  return { rows, cot: b.cot, dongTieuDe: b.dongTieuDe };
}

function docDon(buf) {
  const b = xlsx.docBang(buf, { tenCot: COT_DON });
  const rows = b.rows.map((r) => ({
    ma: chu(r['Mã đơn']),
    kh: chu(r['Mã KH']),
    khach: chu(r['Khách hàng']),
    sdt: chuanSdt(r['Số điện thoại']),
    ngay: ngay(r['Ngày tạo']),
    ngayXong: ngay(r['Ngày thành công']),
    ngayDi: ngay(r['Ngày đi']),
    tien: tien(r['Tổng tiền']),
    thu: tien(r['Đã thu']),
    nguon: chu(r['Nguồn']),
    trangThai: chu(r['Trạng thái']),
    ban: chu(r['Bán hàng']),
  })).filter((r) => r.ma);
  return { rows, cot: b.cot, dongTieuDe: b.dongTieuDe };
}

/**
 * Nhận ra file nào là file nào, để người dùng kéo hai file vào mà không phải chọn.
 * Đi theo TÊN CỘT, không theo tên file — tên file người dùng đổi được.
 */
function nhanDang(buf) {
  const { sheets } = xlsx.doc(buf);
  const tho = (sheets[0] ? sheets[0].rows.slice(0, 6) : [])
    .flat().map((x) => String(x || '').toLowerCase());
  if (tho.includes('mã lead')) return 'lead';
  if (tho.includes('mã đơn')) return 'don';
  return null;
}

/** Tổng quan một bản xuất, để giao diện nói ngay file có dùng được không. */
function tomTat(loai, rows) {
  const ngayCo = rows.map((r) => r.ngay).filter(Boolean).sort();
  const o = {
    loai,
    dong: rows.length,
    tu: ngayCo[0] || '',
    den: ngayCo[ngayCo.length - 1] || '',
    coSdt: rows.filter((r) => r.sdt).length,
    coMaKH: rows.filter((r) => r.kh).length,
  };
  if (loai === 'don') {
    o.tongTien = rows.reduce((a, r) => a + r.tien, 0);
    o.tongThu = rows.reduce((a, r) => a + r.thu, 0);
    o.coTien = rows.filter((r) => r.tien > 0).length;
    o.soNguoiBan = new Set(rows.map((r) => r.ban).filter(Boolean)).size;
  } else {
    o.coDonHang = rows.filter((r) => r.donHang).length;
    o.nhanNguon = [...new Set(rows.map((r) => r.nguon || '(trống)'))].slice(0, 8);
  }
  return o;
}

module.exports = { docLead, docDon, nhanDang, tomTat, ngay, tien, COT_LEAD, COT_DON };
