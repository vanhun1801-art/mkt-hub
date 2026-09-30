'use strict';
/**
 * Mã hoá mật khẩu trước khi nó chạm vào Base.
 *
 * AES-256-GCM, khoá 32 byte lấy từ TK_KHOA (base64). Mỗi lần mã hoá một IV mới,
 * nên cùng một mật khẩu ghi hai lần ra hai chuỗi khác nhau — nhìn Base không đoán
 * được hai tài khoản nào dùng chung mật khẩu. GCM kèm thẻ xác thực: ai sửa tay
 * một ký tự trong ô trên Base là giải ra lỗi, không ra một mật khẩu sai lặng lẽ.
 *
 * Dạng lưu:  enc:v1:<base64(iv 12 byte | tag 16 byte | bản mã)>
 *
 * Ô không mang tiền tố "enc:v1:" là chữ thường chưa mã hoá (dữ liệu cũ trên bảng
 * gói đăng ký, hoặc ai đó gõ thẳng trên Base). App VẪN đọc được để không mất
 * gì, nhưng gắn cờ `chuaMaHoa` để giao diện nhắc chạy `node nhap.js --ma-hoa-goi`.
 */
const crypto = require('crypto');

const TIEN_TO = 'enc:v1:';

function khoa() {
  const k = process.env.TK_KHOA || '';
  if (!k) return null;
  const b = Buffer.from(k, 'base64');
  if (b.length !== 32) throw new Error('TK_KHOA phải là 32 byte dạng base64 (chạy: node nhap.js --tao-khoa)');
  return b;
}

const coKhoa = () => { try { return !!khoa(); } catch (_) { return false; } };

function maHoa(chu) {
  if (chu == null || chu === '') return '';
  const k = khoa();
  if (!k) throw new Error('Chưa có khoá mã hoá TK_KHOA — không ghi mật khẩu dạng chữ thường lên Base.');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ma = Buffer.concat([c.update(String(chu), 'utf8'), c.final()]);
  return TIEN_TO + Buffer.concat([iv, c.getAuthTag(), ma]).toString('base64');
}

function giaiMa(o) {
  if (o == null || o === '') return '';
  const s = String(o);
  if (!s.startsWith(TIEN_TO)) return s;              // chữ thường cũ — xem chú thích đầu tệp
  const k = khoa();
  if (!k) throw new Error('Máy chủ chưa có khoá TK_KHOA nên không mở được mật khẩu.');
  const b = Buffer.from(s.slice(TIEN_TO.length), 'base64');
  if (b.length < 29) throw new Error('Chuỗi mã hoá bị cắt cụt.');
  const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  try {
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch (_) {
    throw new Error('Không giải được: ô trên Base đã bị sửa tay, hoặc khoá TK_KHOA không phải khoá đã mã hoá ô này.');
  }
}

const daMaHoa = (o) => typeof o === 'string' && o.startsWith(TIEN_TO);

const taoKhoa = () => crypto.randomBytes(32).toString('base64');

module.exports = { maHoa, giaiMa, daMaHoa, coKhoa, taoKhoa, TIEN_TO };
