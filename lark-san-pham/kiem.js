'use strict';
/**
 * Kiểm giá trị trước khi ghi xuống Base.
 *
 * Nằm riêng vì có HAI đường ghi đi qua đây và chúng ở hai tầng khác nhau:
 * server.js (người bấm tay) và lich.js (lịch đặt trước, gọi từ kho.js). Để hàm
 * này trong server.js thì kho.js phải require ngược lên server.js — vòng tròn.
 *
 * Một cửa kiểm duy nhất là có chủ ý: nếu lịch đặt trước đi cửa khác, nó thành
 * đường vòng để ghi những giá trị mà bấm tay bị chặn.
 */
const cfg = require('./config');


/**
 * Đổi `{truong, giaTri}` từ client thành ô hợp lệ của Base, hoặc ném lỗi.
 *
 * Cả hai đường ghi (một dòng và hàng loạt) đều đi qua đây. Gom về một chỗ vì
 * đây là nơi duy nhất chặn được ba thứ: cột không cho sửa, lựa chọn lạ làm Base
 * tự đẻ option rác, và ngày/số viết sai kiểu.
 *
 * Ô trống luôn ghi `null` chứ không phải chuỗi rỗng — Base hiểu chuỗi rỗng ở
 * cột số/ngày là một giá trị, không phải "xoá".
 */
function doiTruong(truong, giaTri) {
  const kh = cfg.suaDuoc[truong];
  if (!kh) throw new Error('Cột này không sửa được từ app: ' + truong + '. Sửa trong Lark Base.');

  if (kh.kieu === 'select') {
    const v = String(giaTri == null ? '' : giaTri).trim();
    if (v && !cfg.chon[kh.chon].includes(v)) {
      throw new Error(kh.nhan + ' không hợp lệ: ' + v);
    }
    return { field: kh.field, giaTri: v || null };
  }

  if (kh.kieu === 'so') {
    if (giaTri === '' || giaTri == null) return { field: kh.field, giaTri: null };
    const n = Number(giaTri);
    if (!Number.isFinite(n) || n < 0) throw new Error(kh.nhan + ' phải là số không âm.');
    return { field: kh.field, giaTri: n };
  }

  if (kh.kieu === 'ngay') {
    const v = String(giaTri == null ? '' : giaTri).trim();
    if (!v) return { field: kh.field, giaTri: null };
    /* Ô date của trình duyệt trả YYYY-MM-DD. Ghi kèm 00:00:00 và để Base tự
       hiểu theo múi giờ của nó (Asia/Saigon) — đừng tự đổi sang epoch, đó là
       chỗ đã làm lệch ngày ở mấy app trước. */
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(kh.nhan + ' phải dạng YYYY-MM-DD.');
    return { field: kh.field, giaTri: v + ' 00:00:00' };
  }

  const v = String(giaTri == null ? '' : giaTri);
  if (v.length > 5000) throw new Error(kh.nhan + ' quá dài (trên 5000 ký tự).');
  return { field: kh.field, giaTri: v.trim() || null };
}

module.exports = { doiTruong };
