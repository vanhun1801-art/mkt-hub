'use strict';
/**
 * Quy ước tên thư mục: "<TOUR> · <Loại> · <dd.mm.yyyy>".
 *
 * App **tự ghép** tên này từ Tour + Loại + Ngày mà nhân sự chọn, không ai phải gõ.
 * Danh sách Tour là bảng *Danh mục Tour* trên Base — anh Hùng thêm/bớt ở đó và app
 * đọc theo, nên tên sản phẩm luôn khớp với danh mục.
 *
 * LỊCH SỬ: bản đầu có thêm nửa ĐỌC (dán tên thư mục → tách ra Tour/Loại/Ngày, chịu
 * được 18 kiểu viết bừa). Anh Hùng bỏ ô dán đó ngày 10/09/2026 — quản danh mục trong
 * Base là đủ, không cần đoán từ chuỗi người gõ. Nửa đọc đã xoá; cần lại thì lấy trong
 * git (commit "App thứ 7: MKT chỉnh ảnh xong báo một tin").
 */

/** Bỏ dấu tiếng Việt + hạ chữ thường. */
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

/** Ghép tên thư mục chuẩn từ ba trường. Thiếu trường nào thì bỏ phần đó. */
function dat({ tour, loai, ngay }) {
  return [String(tour || '').trim(), String(loai || '').trim(), ngayVietGon(ngay)]
    .filter(Boolean).join(' · ');
}

/**
 * Khoá chống trùng: một tour + một loại + một ngày là MỘT lô việc.
 * Bỏ dấu và gọn hoá để "TOUR ĐẢO" và "Tour đảo" không thành hai lô khác nhau —
 * tên trong Base có thể được sửa lại hoa/thường bất cứ lúc nào.
 */
function khoa({ tour, loai, ngay }) {
  if (!tour || !ngay) return '';
  return [gon(tour), gon(loai) || 'khac', String(ngay).slice(0, 10)].join('|');
}

module.exports = { dat, khoa, ngayVietGon, khongDau, gon };
