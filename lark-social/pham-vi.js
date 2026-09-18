'use strict';
/**
 * Ai được xem kênh nào.
 *
 * Mỗi bạn nội dung phụ trách vài kênh; mở app ra mà thấy số của cả mười một kênh
 * thì vừa loãng vừa không phải việc của họ. Quản lý khai email người xem cho
 * từng kênh, ai vào chỉ thấy kênh của mình.
 *
 * KHAI BẰNG EMAIL, KHÔNG DÙNG Ô NGƯỜI DÙNG CỦA LARK. Ô người dùng lưu open_id,
 * mà open_id là RIÊNG THEO TỪNG APP: cùng một con người, app lark-cli trên máy
 * thấy `ou_A`, app nền của hub trên Render thấy `ou_B`. Lọc bằng open_id thì
 * chạy đúng ở một nơi và sai ở nơi kia — kiểu lỗi không ai nghĩ tới khi ngồi
 * trên máy mình thấy mọi thứ bình thường. Email là chung cho cả tenant.
 *
 * KÊNH CHƯA KHAI AI THÌ AI CŨNG XEM ĐƯỢC. Mười một kênh đang không có dòng nào,
 * nếu mặc định là "không ai xem được" thì ngay khi tính năng này lên, cả phòng
 * mở app ra thấy trắng trơn và không hiểu vì sao. Siết dần từng kênh một, chứ
 * không khoá sạch rồi mở lại.
 */

const chuan = (s) => String(s || '').trim().toLowerCase();

/** Tách chuỗi email quản lý gõ trong Base. Chịu dấu phẩy, chấm phẩy, xuống dòng. */
function tachEmail(s) {
  return String(s || '')
    .split(/[\s,;|]+/)
    .map((x) => chuan(x))
    .filter((x) => x.includes('@'));
}

/**
 * Kênh này có mở cho người đó không.
 * @param kenh  { viewers }
 * @param nguoi { email, emailPhu } — email lấy từ header hub gửi xuống
 */
function xemDuoc(kenh, nguoi) {
  const ds = tachEmail(kenh && kenh.viewers);
  if (!ds.length) return true;            // chưa khai ai → mở, xem chú thích đầu file
  const cua = [chuan(nguoi && nguoi.email), chuan(nguoi && nguoi.emailPhu)].filter(Boolean);
  if (!cua.length) return false;          // đã khai mà không biết người xem là ai → đóng
  return cua.some((e) => ds.includes(e));
}

/**
 * Lọc danh sách kênh theo người đang xem.
 * Quản lý thấy tất cả — họ là người khai bảng này, thấy thiếu thì không sửa được.
 */
function kenhCuaNguoi(channels, nguoi, laQuanLy) {
  if (laQuanLy) return channels || [];
  return (channels || []).filter((c) => xemDuoc(c, nguoi));
}

/**
 * Bộ lọc áp lên mọi truy vấn số liệu: trả về danh sách extId được phép, hoặc
 * null khi không cần lọc (quản lý, hoặc chưa kênh nào bị khoá).
 */
function gioiHan(channels, nguoi, laQuanLy) {
  if (laQuanLy) return null;
  const coKhoa = (channels || []).some((c) => tachEmail(c.viewers).length);
  if (!coKhoa) return null;
  return kenhCuaNguoi(channels, nguoi, false).map((c) => c.extId || c.id).filter(Boolean);
}

/**
 * Giao cắt giới hạn với bộ lọc kênh người dùng tự chọn trên thanh lọc.
 *
 * Người dùng chọn kênh trên giao diện, nhưng giao diện là thứ sửa được — ai đó
 * gọi thẳng API với tên kênh không thuộc phần mình vẫn phải trả về rỗng. Chốt
 * nằm ở đây, phía máy chủ.
 */
function ganLoc(chonSan, hanMuc) {
  if (!hanMuc) return chonSan || [];
  if (!chonSan || !chonSan.length) return hanMuc;
  const cho = new Set(hanMuc);
  return chonSan.filter((x) => cho.has(x));
}

module.exports = { tachEmail, xemDuoc, kenhCuaNguoi, gioiHan, ganLoc };
