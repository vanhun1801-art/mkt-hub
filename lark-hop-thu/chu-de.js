'use strict';
/**
 * Gom thư theo CHỦ ĐỀ (anh Hùng 31/10/2026: "nó cứ hiển thị thư mới mãi thôi…
 * theo chủ đề thì nó sẽ hiển thị theo luồng như các ứng dụng nhắn tin").
 *
 * Mã chuỗi (thread_id) của Lark là chưa đủ: Agoda, Booking, Trip.com gửi mỗi
 * tin nhắn của khách thành MỘT THƯ MỚI, chuỗi mới, cùng tiêu đề ("Reply from
 * SUNGHYWI IM (Nov 1-2, 2026)"). Nên hai thư cùng chủ đề khi:
 *   - cùng hộp và cùng chuỗi Lark; hoặc
 *   - cùng hộp, cùng tiêu đề (bỏ Re:/Fwd:/TL:…) và cùng người gửi.
 * Thư mình gửi đi (Đã gửi) không có người nhận trong bản tóm tắt, nên chỉ nhập
 * theo tiêu đề khi tiêu đề đó trong hộp chỉ thuộc về MỘT chủ đề; trùng nhiều
 * người thì chỉ nhập theo chuỗi, không đoán.
 * Tiêu đề quá ngắn hoặc chung chung ("Hello", "Báo giá") không dùng để gom:
 * hai khách khác nhau cùng viết "Báo giá" là hai việc.
 * Form trên website (Rootytrip "Service Booking Request", "Liên hệ tư vấn") và
 * đơn booking cũng không gom theo tiêu đề: cùng người gửi, cùng tiêu đề nhưng
 * mỗi thư là một khách khác. Bên gọi đánh dấu bằng `khongGom`.
 */
const crypto = require('crypto');

const TIEN_TO = /^\s*(?:(?:re|fw|fwd|aw|sv|wg|tr|tl|trả lời|chuyển tiếp|回复|答复|转发)\s*(?:\[\d+\]|\(\d+\))?\s*[:：]|\[(?:ext|external|bên ngoài)\])\s*/i;
const CHUNG_CHUNG = new Set(['hello', 'hi', 'xin chào', 'chào', 'báo giá', 'bao gia', 'hỏi giá', 'thông tin', 'test', 'liên hệ', 'contact', 'inquiry', 'question', 'booking', 'đặt phòng', 'đặt tour']);

/* Form web: tiêu đề kết thúc bằng tên form trong ngoặc kép. */
const LA_FORM = /["“][^"”]{2,60}["”]\s*$/;

/** "RE: Fwd:  Reply from X" → "reply from x". Rỗng nếu không đủ riêng để gom. */
function chuanTieuDe(s) {
  let t = String(s || '').normalize('NFC');
  for (let i = 0; i < 6 && TIEN_TO.test(t); i++) t = t.replace(TIEN_TO, '');
  t = t.replace(/\s+/g, ' ').trim().toLowerCase();
  if (t.length < 8 || CHUNG_CHUNG.has(t) || t === '(không tiêu đề)' || t === '(no subject)') return '';
  return t;
}

const bam = (s) => crypto.createHash('sha1').update(s).digest('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);

/**
 * den: thư đến (Hộp đến, Thư rác); gui: thư mình gửi (Đã gửi).
 * Trả Map "hộp|id" → mã chủ đề. Mã ổn định qua các lượt đọc:
 *   - chủ đề chỉ có một chuỗi Lark → chính mã chuỗi đó (sổ "ai đang lo" cũ
 *     ghi theo mã chuỗi, vẫn khớp);
 *   - gom từ nhiều chuỗi → "td:" + băm của tiêu đề và người gửi.
 */
function gomChuDe(den, gui = [], { khongGom = () => false } = {}) {
  const cha = new Map();
  const goc = (x) => { while (cha.get(x) !== x) { cha.set(x, cha.get(cha.get(x))); x = cha.get(x); } return x; };
  const noi = (a, b) => { const ra = goc(a), rb = goc(b); if (ra !== rb) cha.set(rb, ra); };
  const them = (x) => { if (!cha.has(x)) cha.set(x, x); return x; };

  const tat = den.map((t) => ({ t, di: false })).concat(gui.map((t) => ({ t, di: true })));
  /* Khoá tiêu đề của thư đến: hộp + tiêu đề + người gửi. Ghi lại để thư gửi đi
   * biết tiêu đề đó thuộc mấy chủ đề. */
  const theoTd = new Map();          // hộp|tiêu đề → Set khoá tiêu đề của thư đến
  const khoaTd = new Map();          // nút thư → khoá tiêu đề dùng làm mã
  for (const { t, di } of tat) {
    const n = them('m:' + t.hop + '|' + t.id);
    if (t.chuoi) noi(them('c:' + t.hop + '|' + t.chuoi), n);
    const td = chuanTieuDe(t.tieuDe);
    if (!td || di || LA_FORM.test(t.tieuDe || '') || khongGom(t)) continue;
    const k = t.hop + '|' + td + '|' + String((t.tu && t.tu.email) || '').toLowerCase();
    noi(them('t:' + k), n);
    khoaTd.set(n, k);
    if (!theoTd.has(t.hop + '|' + td)) theoTd.set(t.hop + '|' + td, new Set());
    theoTd.get(t.hop + '|' + td).add(k);
  }
  for (const { t, di } of tat) {
    if (!di) continue;
    const td = chuanTieuDe(t.tieuDe);
    const ds = td && theoTd.get(t.hop + '|' + td);
    if (ds && ds.size === 1) noi(goc('t:' + [...ds][0]), 'm:' + t.hop + '|' + t.id);
  }

  /* Mã cho từng nhóm. */
  const nhom = new Map();            // gốc → { chuoi, td, le: id của một thư, so: số thư }
  for (const { t } of tat) {
    const n = 'm:' + t.hop + '|' + t.id;
    const g = goc(n);
    if (!nhom.has(g)) nhom.set(g, { chuoi: new Set(), td: [], le: t.id, khongChuoi: 0, so: 0 });
    const x = nhom.get(g);
    x.so += 1;
    if (t.chuoi) x.chuoi.add(t.chuoi); else x.khongChuoi += 1;
    if (khoaTd.has(n)) x.td.push(khoaTd.get(n));
  }
  const ma = new Map();
  for (const [g, x] of nhom) {
    if (x.so === 1) ma.set(g, [...x.chuoi][0] || 'id:' + x.le);
    else if (x.chuoi.size === 1 && !x.khongChuoi) ma.set(g, [...x.chuoi][0]);
    else if (x.td.length) ma.set(g, 'td:' + bam(x.td.sort()[0]));
    else if (x.chuoi.size) ma.set(g, [...x.chuoi].sort()[0]);
    else ma.set(g, 'id:' + x.le);
  }
  const ra = new Map();
  for (const { t } of tat) ra.set(t.hop + '|' + t.id, ma.get(goc('m:' + t.hop + '|' + t.id)));
  return ra;
}

module.exports = { chuanTieuDe, gomChuDe };
