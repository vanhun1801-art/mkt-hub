'use strict';
/**
 * ============================================================================
 * DỰNG MỘT LÁ THƯ MIME (.eml) — để có ĐÍNH KÈM và có NHÁP
 * ============================================================================
 *
 * Lark Mail có hai đường gửi, và chúng khác nhau ở đúng chỗ quan trọng:
 *
 *   POST …/messages/send   nhận {subject, to, body_html} — gọn, nhưng CHỈ gửi
 *                          thẳng được và KHÔNG đính kèm được tệp nào.
 *   POST …/drafts          nhận { raw } = cả lá thư MIME mã base64url. Lưu
 *                          thành NHÁP, có đính kèm, và muốn gửi thì gọi tiếp
 *                          …/drafts/{id}/send.
 *
 * App KOL đang đi đường thứ nhất, nên trên Hub bấm "Lưu nháp" là báo không
 * làm được, và báo cáo quỹ gửi Ban Giám Đốc thì thiếu tệp Excel đính kèm.
 * Tệp này dựng lá thư cho đường thứ hai.
 *
 * VÌ SAO TỰ DỰNG chứ không thêm thư viện: một lá thư MIME là vài cái đầu mục
 * và mấy khối base64 ngăn nhau bằng một chuỗi biên. Chỗ khó duy nhất là tiếng
 * Việt trong tiêu đề và trong TÊN TỆP — và chỗ đó thì thư viện nào cũng phải
 * làm đúng hai chuẩn dưới đây, không có gì để tiết kiệm.
 */
const crypto = require('crypto');

const CRLF = '\r\n';

/** Cắt base64 thành dòng 76 ký tự — RFC 2045 đòi, và hộp thư cũ thì đòi thật. */
function xepBase64(buf) {
  const s = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(String(buf), 'utf8').toString('base64');
  return (s.match(/.{1,76}/g) || []).join(CRLF);
}

const coDauHoacLa = (s) => /[^\x20-\x7E]/.test(String(s || ''));

/**
 * Chữ có dấu trong ĐẦU MỤC thư phải mã theo RFC 2047: =?UTF-8?B?…?=
 *
 * Và phải CẮT NHỎ trước khi mã, không phải mã xong mới cắt: một "encoded-word"
 * tối đa 75 ký tự, mà cắt giữa chuỗi base64 là hỏng cả cụm. Cắt theo byte của
 * chuỗi UTF-8 gốc, mỗi mảnh 30 byte — 30 byte ra 40 ký tự base64, cộng phần
 * bọc vẫn dưới 75.
 */
function maDauMuc(s) {
  const t = String(s == null ? '' : s);
  if (!t) return '';
  if (!coDauHoacLa(t)) return t;
  const b = Buffer.from(t, 'utf8');
  const manh = [];
  for (let i = 0; i < b.length;) {
    let n = Math.min(30, b.length - i);
    /* Không cắt giữa một ký tự nhiều byte: lùi lại tới đầu ký tự. */
    while (n > 1 && (b[i + n] & 0xc0) === 0x80) n--;
    manh.push(b.slice(i, i + n).toString('base64'));
    i += n;
  }
  return manh.map((x) => '=?UTF-8?B?' + x + '?=').join(CRLF + ' ');
}

/** "Tên người" <a@b.c> — tên có dấu thì mã, địa chỉ thì để nguyên. */
function diaChi(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  const e = String(v.email || v.mail || '').trim();
  const t = String(v.ten || v.name || '').trim();
  if (!e) return '';
  return t ? maDauMuc(t) + ' <' + e + '>' : e;
}
const dsDiaChi = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;]+/))
  .map(diaChi).filter(Boolean).join(', ');

/**
 * Tên tệp đính kèm có dấu: khai HAI lần, cố ý.
 *
 *   filename="…"    dạng RFC 2047, cho hộp thư cũ
 *   filename*=UTF-8''…  dạng RFC 5987, cho hộp thư mới
 *
 * Khai một dạng thôi thì luôn có một phía hiện ra tên vỡ. Cùng lối với đầu mục
 * Content-Disposition mà app này vẫn trả khi cho tải tệp.
 */
function tenTepMIME(ten) {
  const t = String(ten || 'tep');
  return 'filename="' + maDauMuc(t).replace(/"/g, '') + '"; '
    + "filename*=UTF-8''" + encodeURIComponent(t);
}

/** Ngày kiểu RFC 5322, giờ Việt Nam. */
function ngayThu(d) {
  const t = d instanceof Date ? d : new Date();
  const vn = new Date(t.getTime() + 7 * 3600000);
  const THU = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const THANG = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n) => String(n).padStart(2, '0');
  return THU[vn.getUTCDay()] + ', ' + p(vn.getUTCDate()) + ' ' + THANG[vn.getUTCMonth()] + ' '
    + vn.getUTCFullYear() + ' ' + p(vn.getUTCHours()) + ':' + p(vn.getUTCMinutes()) + ':'
    + p(vn.getUTCSeconds()) + ' +0700';
}

/**
 * @param {object} t
 * @param {string|object}   t.tu       người gửi — 'a@b.c' hoặc {email, ten}
 * @param {string|string[]} t.den
 * @param {string|string[]} [t.cc]
 * @param {string}          t.tieuDe
 * @param {string}          t.html     thân thư
 * @param {Array}           [t.dinhKem] [{ten, kieu, than:Buffer}]
 * @returns {string} lá thư MIME đầy đủ
 */
function dungEml(t) {
  const den = dsDiaChi(t.den);
  if (!den) throw new Error('Thư chưa có người nhận');
  const cc = dsDiaChi(t.cc);
  const kem = (t.dinhKem || []).filter((f) => f && f.than && f.than.length);

  const dau = [
    'MIME-Version: 1.0',
    'Date: ' + ngayThu(t.luc),
    'From: ' + (diaChi(t.tu) || den.split(',')[0]),
    'To: ' + den,
  ];
  if (cc) dau.push('Cc: ' + cc);
  dau.push('Subject: ' + maDauMuc(t.tieuDe || ''));
  /* Message-ID để thư nằm đúng một hội thoại và không bị coi là rác. */
  dau.push('Message-ID: <' + crypto.randomBytes(12).toString('hex') + '@rootytrip.com>');

  const than = '<!doctype html><html><head><meta charset="utf-8"></head><body>'
    + String(t.html || '') + '</body></html>';

  if (!kem.length) {
    return dau.concat([
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '', xepBase64(than),
    ]).join(CRLF) + CRLF;
  }

  /* Biên phải là chuỗi KHÔNG THỂ có trong nội dung — lấy ngẫu nhiên. Trùng vào
   * nội dung là thư vỡ làm đôi ở đúng giữa câu. */
  const bien = '----rooty' + crypto.randomBytes(16).toString('hex');
  const phan = [
    '--' + bien,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '', xepBase64(than), '',
  ];
  for (const f of kem) {
    phan.push(
      '--' + bien,
      'Content-Type: ' + (f.kieu || 'application/octet-stream') + '; ' + tenTepMIME(f.ten),
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; ' + tenTepMIME(f.ten),
      '', xepBase64(f.than), '',
    );
  }
  phan.push('--' + bien + '--', '');

  return dau.concat([
    'Content-Type: multipart/mixed; boundary="' + bien + '"',
    '',
  ]).concat(phan).join(CRLF);
}

/** Lark nhận `raw` dạng base64URL (— và _ thay +/, bỏ dấu =). */
const sangRaw = (eml) => Buffer.from(eml, 'utf8').toString('base64url');

module.exports = { dungEml, sangRaw, maDauMuc, diaChi, dsDiaChi, tenTepMIME, ngayThu, xepBase64 };
