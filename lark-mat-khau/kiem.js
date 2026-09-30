'use strict';
/**
 * Kiểm giá trị trước khi ghi xuống Base — cửa kiểm DUY NHẤT cho sửa và thêm.
 *
 * Nhận khoá theo cfg.suaDuoc (không nhận field ID thô từ trình duyệt): ai gửi
 * một cột ngoài danh sách — kể cả cột mật khẩu — là 400, không phải "bỏ qua".
 * Trả về giá trị đúng dạng Base cần: chữ | số | "YYYY-MM-DD 00:00:00" | tên lựa
 * chọn | [{id}]. Chuỗi rỗng thành null để xoá ô, không ghi "" hay 0 giả.
 */
const cfg = require('./config');

const theoBang = (bang) => new Map((cfg.suaDuoc[bang] || []).map((c) => [c.k, c]));

function doiGiaTri(bang, k, v) {
  const c = theoBang(bang).get(k);
  if (!c) { const e = new Error('Cột không sửa được trong app: ' + k); e.http = 400; throw e; }
  const loi = (m) => { const e = new Error(c.nhan + ': ' + m); e.http = 400; throw e; };
  if (c.kieu === 'nguoi') {
    if (!Array.isArray(v)) loi('phải là danh sách người');
    const ids = [...new Set(v.filter((x) => typeof x === 'string' && /^ou_\w+$/.test(x)))];
    return ids.map((id) => ({ id }));
  }
  const s = v == null ? '' : String(v).trim();
  if (!s) return null;
  if (c.kieu === 'chu') return s.slice(0, c.dai || 300);
  if (c.kieu === 'so') {
    const n = Number(s.replace(/[.\s,đ]/g, ''));
    if (!Number.isFinite(n) || n < 0) loi('phải là số không âm');
    return n;
  }
  if (c.kieu === 'ngay') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s))) loi('ngày phải dạng YYYY-MM-DD');
    return s + ' 00:00:00';
  }
  if (c.kieu === 'chon') {
    if (!c.chon.includes(s)) loi('chỉ nhận: ' + c.chon.join(', '));
    return s;
  }
  loi('kiểu lạ');
}

/** { khoá: giá trị } → { fieldId: giá trị đã kiểm }. */
function doiNhieu(bang, truong) {
  if (!truong || typeof truong !== 'object' || Array.isArray(truong)) {
    const e = new Error('Thiếu các cột cần sửa.'); e.http = 400; throw e;
  }
  const F = bang === 'goi' ? cfg.f.goi : cfg.f.tk;
  const ra = {};
  for (const [k, v] of Object.entries(truong)) ra[F[k]] = doiGiaTri(bang, k, v);
  return ra;
}

module.exports = { doiGiaTri, doiNhieu, theoBang };
