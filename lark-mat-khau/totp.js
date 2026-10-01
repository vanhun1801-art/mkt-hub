'use strict';
/**
 * Mã 2FA 6 số (TOTP, RFC 6238) — cùng chuẩn Google Authenticator / Microsoft
 * Authenticator dùng, nên mã app hiện ra khớp đúng mã trên điện thoại.
 *
 * Nhận "mã bí mật" ở hai dạng người ta hay có trong tay:
 *   · chuỗi base32 trang cài 2FA cho chép ("JBSW Y3DP EHPK 3PXP", có/không dấu cách)
 *   · cả đường otpauth://totp/...?secret=...&digits=6&period=30 (quét QR ra chữ)
 *
 * Mã bí mật là thứ quý ngang mật khẩu (có nó là sinh được mã mãi mãi) nên trên
 * Base nó cũng chỉ là enc:v1:… — xem ma-hoa.js. Server sinh mã, trình duyệt chỉ
 * nhận 6 chữ số đang có hiệu lực, không bao giờ nhận mã bí mật.
 */
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function giaiBase32(s) {
  const sach = String(s || '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!sach || /[^A-Z2-7]/.test(sach)) throw new Error('Mã bí mật 2FA phải là chuỗi base32 (chữ A–Z và số 2–7).');
  let bit = 0, gt = 0;
  const ra = [];
  for (const c of sach) {
    gt = (gt << 5) | B32.indexOf(c);
    bit += 5;
    if (bit >= 8) { ra.push((gt >>> (bit - 8)) & 0xff); bit -= 8; }
  }
  if (ra.length < 10) throw new Error('Mã bí mật 2FA ngắn quá — chép đủ cả chuỗi trang web đưa.');
  return Buffer.from(ra);
}

/** Chuỗi người dán vào → { bimat (base32 sạch), so, chuKy, thuatToan }. Ném lỗi nếu không dùng được. */
function docCauHinh(nhap) {
  const s = String(nhap || '').trim();
  if (/^otpauth:\/\//i.test(s)) {
    let u;
    try { u = new URL(s); } catch (_) { throw new Error('Đường otpauth:// không đọc được.'); }
    if (u.hostname.toLowerCase() !== 'totp') throw new Error('Chỉ hỗ trợ mã theo thời gian (otpauth://totp), không hỗ trợ HOTP.');
    const p = u.searchParams;
    const so = Number(p.get('digits') || 6);
    const chuKy = Number(p.get('period') || 30);
    const thuatToan = String(p.get('algorithm') || 'SHA1').toUpperCase();
    if (![6, 7, 8].includes(so)) throw new Error('Số chữ số không hợp lệ: ' + so);
    if (!(chuKy >= 10 && chuKy <= 120)) throw new Error('Chu kỳ không hợp lệ: ' + chuKy);
    if (!['SHA1', 'SHA256', 'SHA512'].includes(thuatToan)) throw new Error('Thuật toán không hỗ trợ: ' + thuatToan);
    const bimat = String(p.get('secret') || '').toUpperCase().replace(/\s/g, '');
    giaiBase32(bimat);
    return { bimat, so, chuKy, thuatToan };
  }
  const bimat = s.toUpperCase().replace(/[\s-]/g, '');
  giaiBase32(bimat);
  return { bimat, so: 6, chuKy: 30, thuatToan: 'SHA1' };
}

/** Mã đang hiệu lực + số giây còn lại. `luc` để test (ms). */
function sinhMa(chCauHinh, luc = Date.now()) {
  const c = typeof chCauHinh === 'string' ? docCauHinh(chCauHinh) : chCauHinh;
  const buoc = Math.floor(luc / 1000 / c.chuKy);
  const dem = Buffer.alloc(8);
  dem.writeUInt32BE(Math.floor(buoc / 2 ** 32), 0);
  dem.writeUInt32BE(buoc >>> 0, 4);
  const h = crypto.createHmac(c.thuatToan.toLowerCase(), giaiBase32(c.bimat)).update(dem).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return {
    ma: String(n % 10 ** c.so).padStart(c.so, '0'),
    conLai: c.chuKy - (Math.floor(luc / 1000) % c.chuKy),
    chuKy: c.chuKy,
  };
}

/** Dạng cất (JSON gọn) — mã hoá xong mới lên Base. */
const dongGoi = (c) => JSON.stringify({ s: c.bimat, d: c.so, p: c.chuKy, a: c.thuatToan });
function moGoi(chu) {
  try {
    const o = JSON.parse(chu);
    if (o && o.s) return { bimat: o.s, so: o.d || 6, chuKy: o.p || 30, thuatToan: o.a || 'SHA1' };
  } catch (_) { /* dữ liệu cũ dạng chuỗi trần */ }
  return docCauHinh(chu);
}

module.exports = { docCauHinh, sinhMa, dongGoi, moGoi, giaiBase32 };
