'use strict';
/**
 * ============================================================================
 * SUY RA ĐỊA ĐIỂM TỪ TÊN HOẠT ĐỘNG
 * ============================================================================
 *
 * Cột "Tên hoạt động" gõ tay, nên 129 dòng đầu tiên đẻ ra 62 tên khác nhau —
 * mà khác nhau phần lớn do gõ lệch: "Live/stre/am" · "Lives/tream" ·
 * "Liv/e/tream" · "Livestream", rồi "ĐTH" với "Địa Trung Hải", "Vinwonder" với
 * "VINWONDERS". Lọc theo cột đó thì phải nhớ hết các cách gõ.
 *
 * VÌ SAO KHÔNG BIẾN CHÍNH CỘT ĐÓ THÀNH LỰA CHỌN:
 *   1. Nó là cột CHÍNH của bảng. Lark Base không cho cột chính mang kiểu chọn,
 *      và app ghi thẳng vào ô này mỗi lần đăng ký lịch.
 *   2. 62 lựa chọn là dọn cái bừa sang một chỗ mới chứ không dọn.
 *
 * Nên có cột "Địa điểm" riêng, bộ lựa chọn ngắn, suy từ tên.
 *
 * VÀ PHẢI SUY TỰ ĐỘNG CHO LỊCH MỚI. Điền xong 118 dòng cũ rồi bỏ đó thì từ hôm
 * sau mọi lịch mới đều trống ô này, và một tháng nữa bộ lọc vô dụng. Server gọi
 * hàm này lúc tạo lịch và lúc sửa tên.
 *
 * CHỈ ĐIỀN KHI Ô ĐANG TRỐNG. Người xếp tay bao giờ cũng đúng hơn luật đoán;
 * ghi đè lựa chọn của họ mỗi lần sửa tên là lấy mất quyền sửa.
 */

/* Bỏ dấu, hạ chữ thường: sổ này gõ tay nên "Cáp Treo", "cáp treo", "CÁP TREO"
 * là cùng một chỗ. */
const gon = (s) => String(s == null ? '' : s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

/* THỨ TỰ QUAN TRỌNG: luật đặc trưng đứng trước luật rộng. "Khảo sát nhà hàng
 * Cường Kua - Grand World" khớp cả "nhà hàng" lẫn "Grand World"; Grand World
 * mới là chỗ thật sự đi tới. */
const LUAT = [
  ['Grand World', [/grand world/, /\bthvn\b/, /tinh hoa viet nam/, /cuong kua/]],
  ['VinWonders', [/vinwonder/, /vin wonder/]],
  ['Safari', [/safari/]],
  ['Cáp treo Hòn Thơm', [/cap treo/, /hon thom/]],
  /* Mọi show của Sunset Town đều diễn ở thị trấn Địa Trung Hải: Kiss of the Sea
   * (KOTS), Symphony of the Sea (SOTS), Dinner Show, Chill Show, Awaken Sea.
   * Tên nào nhắc show là nhắc chỗ đó, kể cả khi không viết chữ "ĐTH" — và phần
   * lớn tên trong sổ đúng là chỉ viết tên show. */
  ['Địa Trung Hải – Sunset Town', [
    /\bdth\b/, /dia trung hai/, /kiss of the sea/, /\bkots\b/, /\bsots\b/,
    /chill show/, /dinner show/, /symphony/, /awaken sea/, /sunset town/, /bai khem/,
  ]],
  ['Tour đảo · cano', [/tour dao/, /tour cano/, /cano/, /\b3 dao\b/]],
  ['Chợ đêm Vuifest', [/vuifest/, /cho dem/]],
  ['Bãi Sao', [/bai sao/]],
  ['Bãi Đất Đỏ – APEC', [/bai dat do/, /apec/]],
  ['Dương Đông', [/duong dong/]],
  ['Khách sạn · resort', [/hillside/, /wyndham/, /regent/, /intercontinental/, /khach san/, /resort/]],
  ['Nhà hàng · quán · beach club', [
    /nha hang/, /\bquan\b/, /6 cui/, /oc giang/, /starbucks/, /beach club/, /santo/, /sanato/,
  ]],
];

/**
 * @param {string} ten tên hoạt động
 * @returns {string} tên địa điểm, hoặc '' khi không đoán được
 *
 * Không đoán được thì trả CHUỖI RỖNG chứ không trả "Khác": ô trống nhìn ra ngay
 * là còn phải xếp tay, còn "Khác" thì trông như đã xếp xong rồi. Mười dòng đầu
 * tiên rơi vào đây đều là việc không gắn với địa điểm — media đoàn khách, quay
 * tư liệu, media đội xe.
 */
function doanDiaDiem(ten) {
  const g = gon(ten);
  if (!g) return '';
  for (const [nhan, mau] of LUAT) if (mau.some((m) => m.test(g))) return nhan;
  return '';
}

const DANH_SACH = LUAT.map(([nhan]) => nhan);

module.exports = { doanDiaDiem, DANH_SACH, LUAT };
