'use strict';
/**
 * Quy ước tên thư mục: "<TOUR> · <Loại> · <dd.mm.yyyy>".
 *
 * Hai chiều, và chiều ĐỌC mới là chiều quan trọng: nhân sự vừa tạo thư mục trên
 * Google Photos xong, trong tay đã có sẵn cái tên. Bắt họ chọn lại Tour trong
 * combobox, chọn lại Ghép/VIP, chọn lại ngày là ba lần gõ cho một thứ máy đọc
 * được. Nên app cho dán tên thư mục (hoặc dán link có tên) và tự điền ba trường.
 *
 * Không dùng regex phức tạp: tên thư mục thật rất bừa — "1 TOUR ĐẢO", "Tour đảo
 * ghép 10/9", "TOURDAO-VIP-10.09.2026". Cách chịu bừa tốt hơn là bỏ dấu, bỏ ký tự
 * phân cách, rồi tìm tour nào có tên khớp DÀI NHẤT trong chuỗi.
 */

/** Bỏ dấu tiếng Việt + hạ chữ thường. So khớp tên tour phải chịu được "Đảo/DAO". */
function khongDau(s) {
  /* Tự lọc dấu bằng code point thay vì regex chứa ký tự tổ hợp: dải U+0300..U+036F
   * viết thẳng vào regex thì rất dễ bị editor/công cụ chuyển mã làm hỏng, và hỏng
   * kiểu câm — hàm vẫn chạy, chỉ là không bỏ được dấu nữa. */
  const nfd = String(s == null ? '' : s).normalize('NFD');
  let out = '';
  for (const ch of nfd) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) continue;         // dấu tổ hợp
    if (cp === 0x111 || cp === 0x110) { out += 'd'; continue; }   // đ / Đ
    out += ch;
  }
  return out.toLowerCase();
}

/** Chỉ giữ chữ và số — "1. TOUR ĐẢO" và "tourdao" phải ra cùng một chuỗi. */
const gon = (s) => khongDau(s).replace(/[^a-z0-9]/g, '');

const hai = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → 'dd.mm.yyyy' (cách viết ngày trên thư mục). */
function ngayVietGon(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return '';
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * Đọc ngày trong tên thư mục → 'YYYY-MM-DD'.
 *
 * Chấp nhận d.m.yyyy · d/m/yy · d-m (thiếu năm). Thiếu năm thì lấy năm của `mocNam`
 * (mặc định hôm nay) — nhưng nếu ngày đó rơi vào TƯƠNG LAI quá 6 tháng thì hiểu là
 * năm trước: tháng 1 mà thấy "20.12" thì đó là tháng 12 năm ngoái, không phải sang năm.
 */
function docNgay(s, mocNam) {
  const moc = mocNam ? new Date(mocNam + 'T00:00:00Z') : new Date();
  const txt = String(s || '');
  const m = /(\b|[^0-9])(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{2,4}))?(?![0-9])/.exec(txt);
  if (!m) return '';
  const d = Number(m[2]);
  const mo = Number(m[3]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return '';

  let y;
  if (m[4]) {
    y = Number(m[4]);
    if (y < 100) y += 2000;
  } else {
    y = moc.getUTCFullYear();
    const thu = Date.UTC(y, mo - 1, d);
    if (thu - moc.getTime() > 183 * 86400000) y -= 1;
  }
  return `${y}-${hai(mo)}-${hai(d)}`;
}

/* Loại: chỉ hai giá trị thật là Ghép và VIP. "ghep" cũng viết là "gộp"/"chung". */
const DAU_HIEU_LOAI = [
  ['VIP', ['vip', 'rieng', 'private']],
  ['Ghép', ['ghep', 'gop', 'chung', 'join']],
];

function docLoai(s) {
  const g = khongDau(s);
  for (const [ten, tu] of DAU_HIEU_LOAI) {
    if (tu.some((t) => g.includes(t))) return ten;
  }
  return '';
}

/**
 * Dò tên tour trong chuỗi. `dsTour` là mảng tên lấy từ bảng Danh mục Tour.
 *
 * Lấy tour khớp DÀI NHẤT, vì "TOUR ĐẢO" và "LAND TOUR" cùng chứa chữ "tour":
 * so ngắn nhất trước thì thư mục "LAND TOUR" bị nhận thành "TOUR ĐẢO".
 */
function docTour(s, dsTour) {
  const g = gon(s);
  let thang = '';
  let dai = 0;
  for (const t of dsTour || []) {
    const k = gon(t);
    if (k.length >= 3 && g.includes(k) && k.length > dai) { thang = t; dai = k.length; }
  }
  return thang;
}

/**
 * Đọc một tên thư mục (hoặc cả link có tên trong đó) ra { tour, loai, ngay }.
 * Trường nào không đoán được thì để chuỗi rỗng — giao diện tự hỏi lại đúng ô đó.
 */
function doc(s, dsTour, mocNam) {
  const txt = String(s || '')
    /* Link Google Photos/Drive không mang tên thư mục, chỉ mang ID — bỏ hẳn phần
     * đường dẫn để chuỗi ID ngẫu nhiên không bị đọc thành ngày. */
    .replace(/https?:\/\/\S+/g, ' ');
  return {
    tour: docTour(txt, dsTour),
    loai: docLoai(txt),
    ngay: docNgay(txt, mocNam),
  };
}

/** Ghép tên thư mục chuẩn từ ba trường. Thiếu trường nào thì bỏ phần đó. */
function dat({ tour, loai, ngay }) {
  return [String(tour || '').trim(), String(loai || '').trim(), ngayVietGon(ngay)]
    .filter(Boolean).join(' · ');
}

/**
 * Khoá chống trùng: một tour + một loại + một ngày là MỘT lô việc.
 * Bỏ dấu và gọn hoá để "TOUR ĐẢO" và "Tour đảo" không thành hai lô khác nhau.
 */
function khoa({ tour, loai, ngay }) {
  if (!tour || !ngay) return '';
  return [gon(tour), gon(loai) || 'khac', String(ngay).slice(0, 10)].join('|');
}

module.exports = { doc, dat, khoa, docNgay, docLoai, docTour, ngayVietGon, khongDau, gon };
