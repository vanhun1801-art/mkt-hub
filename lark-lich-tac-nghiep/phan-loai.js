'use strict';
/**
 * ============================================================================
 * SUY ĐỊA ĐIỂM VÀ LOẠI HÌNH TỪ TÊN HOẠT ĐỘNG
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
 * Nên tách ra HAI cột, mỗi cột một câu hỏi:
 *   Địa điểm  — đi ĐÂU
 *   Loại hình — làm GÌ ở đó
 *
 * Hai chiều đó độc lập: "Live/stream Grand World" và "Khảo sát nhà hàng Cường
 * Kua - Grand World" cùng một chỗ nhưng khác hẳn việc.
 *
 * VÀ PHẢI SUY TỰ ĐỘNG CHO LỊCH MỚI. Điền dòng cũ rồi bỏ đó thì từ hôm sau mọi
 * lịch mới đều trống, một tháng nữa bộ lọc vô dụng. Server gọi hai hàm này lúc
 * tạo lịch và lúc sửa tên — CHỈ KHI ô đang trống: người xếp tay bao giờ cũng
 * đúng hơn luật đoán, ghi đè lựa chọn của họ là lấy mất quyền sửa.
 */

/* Bỏ dấu, hạ chữ thường: sổ này gõ tay nên "Cáp Treo", "cáp treo", "CÁP TREO"
 * là cùng một chỗ. */
const gon = (s) => String(s == null ? '' : s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

/* Dạng NÉN: bỏ hết thứ không phải chữ và số.
 *
 * Cần vì người ta gõ tên livestream với dấu gạch cắt giữa chữ để né bộ lọc của
 * nền tảng: "Liv/e/tream" · "Liv/es/tre/am" · "Lives/tream" · "Live/stre/am".
 * Dò /live/ trên dạng thường thì trượt hết, mà trượt lặng lẽ — ô chỉ trống chứ
 * không báo gì. Nén lại thì cả bốn cách gõ đều thành "livestream"/"livetream". */
const nen = (s) => gon(s).replace(/[^a-z0-9]/g, '');

/* ---------------------------------------------------------------------------
 * ĐỊA ĐIỂM — danh sách anh Hùng chốt 20/09/2026
 * -------------------------------------------------------------------------
 * THỨ TỰ QUAN TRỌNG Ở HAI CHỖ:
 *
 *   · Bãi Khem đứng TRƯỚC Sunset Town. Bãi Khem nằm trong khu Sunset Town nên
 *     tên nào nhắc cả hai ("[quay + chụp] bãi Khem - Sunset Town") sẽ khớp cả
 *     hai luật; anh Hùng tách Bãi Khem thành chỗ riêng nên nó phải thắng.
 *   · Grand World đứng trước Nhà hàng. "Khảo sát nhà hàng Cường Kua - Grand
 *     World" khớp cả hai; Grand World mới là chỗ thật sự đi tới.
 *
 * Danh sách này xếp theo ĐỘ ĐẶC TRƯNG để khớp cho đúng. Thứ tự BÀY RA trong ô
 * chọn là một danh sách khác — xem DS_DIA_DIEM ở cuối tệp.
 * ------------------------------------------------------------------------- */
const DIA_DIEM = [
  /* Bãi Khem nằm TRONG khu Sunset Town, nên "[quay + chụp] bãi Khem - Sunset
   * Town" khớp cả hai. Anh Hùng tách Bãi Khem ra thành chỗ riêng nên nó thắng. */
  ['Bãi Khem', [/bai khem/]],
  ['Grand World', [/grand world/, /grandworld/, /\bthvn\b/, /tinh hoa viet nam/,
    /cuong kua/, /vuifest/]],
  /* Mọi show của Sunset Town đều diễn ở thị trấn Địa Trung Hải: Kiss of the Sea
   * (KOTS), Symphony of the Sea (SOTS), Dinner Show, Chill Show, Awaken Sea.
   * Tên nào nhắc show là nhắc chỗ đó — và phần lớn tên trong sổ đúng là chỉ
   * viết tên show, không viết tên chỗ. */
  ['Sunset Town', [
    /\bdth\b/, /dia trung hai/, /kiss of the sea/, /\bkots\b/, /\bsots\b/,
    /chill show/, /dinner show/, /diner show/, /symphony/, /awaken sea/, /sunset town/,
  ]],
  ['Vinwonders', [/vinwonder/, /vin wonder/]],
  /* Cáp treo Hòn Thơm đứng trước Tour Đảo: "Tour đảo Cáp treo" là đi cáp treo. */
  ['Hòn Thơm', [/hon thom/, /cap treo/]],
  ['Safari', [/safari/]],
  ['Bãi Sao', [/bai sao/]],
  ['Dương Đông', [/duong dong/]],
  ['Bãi Đất Đỏ', [/bai dat do/, /apec/]],
  /* Tám chỗ dưới đây chưa có dòng nào trong sổ — khai sẵn để chọn tay, và để
   * lịch mới nhắc tới là khớp được ngay. */
  ['Nhà Tù Phú Quốc', [/nha tu\b/]],
  ['Tượng Đài Bác Hồ', [/tuong dai/]],
  ['Bãi Trường', [/bai truong/]],
  ['Gành Dầu', [/ganh dau/]],
  ['Rạch Vẹm', [/rach vem/]],
  ['Bến Tàu Bãi Vòng', [/bai vong/, /ben tau/]],
  ['Sân bay Phú Quốc', [/san bay/]],
  ['Vịnh Đầm', [/vinh dam/]],
  ['Tour Đảo', [/tour dao/, /tour cano/, /cano/, /\b3 dao\b/]],
  /* HAI LUẬT RỘNG NHẤT ĐỨNG CUỐI. "khách sạn" bỏ dấu thành "khach san", mà
   * "đón khách sân bay" cũng thành "don khach san bay" — chứa nguyên "khach
   * san". Để luật này lên trên thì mọi buổi đón khách sân bay thành khách sạn,
   * và sai lặng lẽ. Cùng lý do với "quán": nó nằm trong rất nhiều chữ khác. */
  ['Khách sạn - Resort', [/hillside/, /wyndham/, /regent/, /intercontinental/,
    /khach san/, /resort/]],
  ['Nhà hàng', [/nha hang/, /\bquan\b/, /6 cui/, /oc giang/, /starbucks/,
    /beach club/, /santo/, /sanato/]],
];

/* ---------------------------------------------------------------------------
 * LOẠI HÌNH — làm gì ở đó
 * -------------------------------------------------------------------------
 * Cũng theo thứ tự đặc trưng → rộng:
 *
 *   · "Đoàn" thắng mọi thứ. "Live Đoàn Intercontinental" và "[Quay + Chụp]
 *     Đoàn CÔNG TY…" là đi phục vụ một đoàn khách cụ thể — việc đó khác hẳn
 *     livestream bán tour, dù cách quay giống nhau.
 *   · Khảo sát và khai trương đứng trước Livestream vì chúng là mục đích của
 *     buổi đi, còn "live" có thể chỉ là một phần.
 *   · "QUAY + LIVESTREAM VINWONDERS" ra Livestream: livestream là cái bán hàng,
 *     quay chỉ là việc kèm theo.
 * ------------------------------------------------------------------------- */
const LOAI_HINH = [
  ['Media đoàn khách', [/\bdoan\b/]],
  ['Khảo sát', [/khao sat/]],
  ['Khai trương - sự kiện', [/khai truong/, /su kien/, /quoc khanh/, /\bgame\b/]],
  /* Dò trên dạng NÉN (xem `nen`): "Liv/e/tream" và "Liv/es/tre/am" chỉ thành
   * chữ liền khi bỏ hết dấu gạch. */
  ['Livestream', [], [/live/]],
  ['Review', [/review/]],
  ['Quay - chụp', [/quay/, /chup/, /\bmedia\b/, /\bclip\b/]],
  /* "src" là cách phòng viết tắt "source" — bỏ sót thì mấy dòng "Src cho
   * Content…" rơi hết vào ô trống trong khi câu trả lời nằm ngay đó. */
  ['Tư liệu - cập nhật source', [/tu lieu/, /source/, /\bsrc\b/, /cap nhat/]],
];

/**
 * Mỗi luật là [nhãn, mẫu dò trên dạng thường, mẫu dò trên dạng nén].
 * Dạng nén chỉ dùng cho mấy chữ bị cắt bằng dấu gạch — dò tất cả trên dạng nén
 * thì "bãi sao" thành "baisao" và mọi khoảng trắng biến mất, dễ khớp bừa.
 */
function theoLuat(luat, ten) {
  const g = gon(ten);
  if (!g) return '';
  const n = nen(ten);
  for (const [nhan, mau, mauNen] of luat) {
    if ((mau || []).some((m) => m.test(g))) return nhan;
    if ((mauNen || []).some((m) => m.test(n))) return nhan;
  }
  return '';
}

/**
 * Không đoán được thì trả CHUỖI RỖNG chứ không trả "Khác": ô trống nhìn ra ngay
 * là còn phải xếp tay, còn "Khác" thì trông như đã xếp xong rồi.
 */
const doanDiaDiem = (ten) => theoLuat(DIA_DIEM, ten);

/**
 * Loại hình đọc CẢ TÊN LẪN MỤC ĐÍCH, tên trước.
 *
 * Gần một nửa số dòng đặt tên chỉ bằng địa điểm — "Vinwonder Phú Quốc",
 * "Safari", "Dinner Show + Kiss of the Sea" — nên tên không nói được làm gì ở
 * đó. Nhưng ô Mục đích thì nói rất rõ: "Li/v/e/stre/a/m bán hàng/ tư vấn tour",
 * "Quay source flycam show…", "Hỗ trợ team Media chụp ảnh". Bỏ qua ô đó là tự
 * để trống 45/129 dòng trong khi câu trả lời nằm ngay cột bên cạnh.
 *
 * Tên đi trước vì nó cụ thể hơn: lịch tên "Khảo sát nhà hàng…" mà mục đích viết
 * "quay source" thì việc chính vẫn là khảo sát.
 */
const doanLoaiHinh = (ten, mucDich) =>
  theoLuat(LOAI_HINH, ten) || theoLuat(LOAI_HINH, mucDich);

/* ---------------------------------------------------------------------------
 * THỨ TỰ HIỆN RA — KHÁC thứ tự luật khớp, và cố ý khác
 * -------------------------------------------------------------------------
 * Luật khớp xếp theo ĐỘ ĐẶC TRƯNG: Bãi Khem phải đứng trước Sunset Town, nếu
 * không "[quay + chụp] bãi Khem - Sunset Town" rơi vào Sunset Town.
 *
 * Còn danh sách bày ra trong ô chọn thì xếp theo SỐ LẦN DÙNG — chỗ hay đi để
 * trên cùng, khỏi phải cuộn. Bãi Khem mới có 1 buổi nên nó xuống dưới, dù
 * trong luật nó đứng đầu.
 *
 * Trộn hai thứ tự vào một danh sách là hỏng một trong hai, và hỏng lặng lẽ:
 * hoặc ô chọn bày chỗ hiếm lên đầu, hoặc luật xếp nhầm chỗ.
 *
 * Số lần đếm trên 129 dòng đầu (20/09/2026). Tám chỗ cuối chưa có buổi nào,
 * giữ đúng thứ tự anh Hùng liệt kê.
 */
const DS_DIA_DIEM = [
  'Sunset Town',        // 44
  'Vinwonders',         // 19
  'Grand World',        // 18
  'Hòn Thơm',           // 14
  'Safari',             // 7
  'Tour Đảo',           // 5
  'Khách sạn - Resort', // 4
  'Nhà hàng',           // 3
  'Bãi Sao',            // 1
  'Bãi Khem',           // 1
  'Dương Đông',         // 1
  'Bãi Đất Đỏ',         // 1
  'Nhà Tù Phú Quốc',
  'Tượng Đài Bác Hồ',
  'Bãi Trường',
  'Gành Dầu',
  'Rạch Vẹm',
  'Bến Tàu Bãi Vòng',
  'Sân bay Phú Quốc',
  'Vịnh Đầm',
];

const DS_LOAI_HINH = [
  'Livestream',                 // 86
  'Quay - chụp',                // 20
  'Tư liệu - cập nhật source',  // 11
  'Media đoàn khách',           // 6
  'Khai trương - sự kiện',      // 3
  'Khảo sát',                   // 1
  'Review',                     // 1
];

module.exports = {
  doanDiaDiem, doanLoaiHinh,
  DS_DIA_DIEM, DS_LOAI_HINH,
  DIA_DIEM, LOAI_HINH,
};
