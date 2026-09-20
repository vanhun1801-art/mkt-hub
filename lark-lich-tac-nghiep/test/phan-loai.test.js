'use strict';
/**
 * ============================================================================
 * LUẬT ĐOÁN ĐỊA ĐIỂM & LOẠI HÌNH — không cần mạng, không cần app chạy
 * ============================================================================
 *
 *   node test/phan-loai.test.js
 *
 * Mọi tên và mục đích dưới đây là dữ liệu THẬT lấy từ 129 dòng đầu của sổ, kể
 * cả mấy cách gõ lệch. Sửa luật mà quên một cách gõ thì phép thử đỏ ngay — còn
 * trên Base thì chỉ là vài ô lặng lẽ trống, không ai nhìn ra.
 */
const {
  doanDiaDiem, doanLoaiHinh, DS_DIA_DIEM, DS_LOAI_HINH, DIA_DIEM, LOAI_HINH,
} = require('../phan-loai');

let pass = 0, fail = 0;
const fails = [];
function ok(ten, dieu, chiTiet) {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (chiTiet ? ' → ' + chiTiet : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (chiTiet ? '\n         ' + chiTiet : ''));
  }
}
const nhom = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

/* ---------------------------------------------------------------- địa điểm */
nhom('Địa điểm — tên thật trong sổ');
[
  /* Phần lớn tên chỉ viết tên SHOW, không viết tên chỗ. */
  ['Live/stre/am chill Show + Kiss of the Sea', 'Sunset Town'],
  ['Livestream ĐTH Diner Show + Kiss of the Sea', 'Sunset Town'],
  ['Lives/tream ĐTH + SOTS', 'Sunset Town'],
  ['Livestream Địa Trung Hải Dinner show + KOTS', 'Sunset Town'],
  ['Chill show Symphony', 'Sunset Town'],
  ['Awaken Sea + Dinner Show', 'Sunset Town'],
  ['Livestream Bãi biển SOTS show + KOTS', 'Sunset Town'],

  ['Vinwonder Phú Quốc', 'Vinwonders'],
  ['Lives/tream Vinwonder Phú Quốc', 'Vinwonders'],
  ['VINWONDERS', 'Vinwonders'],
  ['QUAY + LIVESTREAM VINWONDERS', 'Vinwonders'],

  ['Live/stream Grand World', 'Grand World'],
  ['Grand World Phú Quốc', 'Grand World'],
  ['Live/stream Grand World + THVN', 'Grand World'],   // THVN = Tinh hoa Việt Nam
  ['Liv/etream Chợ đêm Vuifest', 'Grand World'],       // Vuifest nằm trong Grand World

  ['Cáp Treo Hòn Thơm', 'Hòn Thơm'],
  ['Live/stream Cáp treo HT', 'Hòn Thơm'],
  ['Liv/e/tream Safari', 'Safari'],
  ['Tour Cano 3 Đảo diễn viên Trang Nơ FAPTV', 'Tour Đảo'],
  ['Tour đảo', 'Tour Đảo'],
  ['Khách sạn Hillside', 'Khách sạn - Resort'],
  ['Tác nghiệp đoàn REGENT', 'Khách sạn - Resort'],
  ['SANTO BEACH CLUB', 'Nhà hàng'],
  ['KHAI TRƯƠNG STARBUCKS', 'Nhà hàng'],
  ['Bãi Sao', 'Bãi Sao'],
  ['Tư liệu 2/9 - khu vực Dương đông', 'Dương Đông'],
  ['Cập nhật thông tin Công trình APEC 2027 Bãi Đất Đỏ', 'Bãi Đất Đỏ'],

  /* Tám chỗ chưa có buổi nào, khai sẵn — lịch mới nhắc tới là khớp ngay. */
  ['Livestream Nhà Tù Phú Quốc', 'Nhà Tù Phú Quốc'],
  ['Quay tư liệu Tượng đài Bác Hồ', 'Tượng Đài Bác Hồ'],
  ['Live bãi Trường hoàng hôn', 'Bãi Trường'],
  ['Tác nghiệp Gành Dầu', 'Gành Dầu'],
  ['Quay sao biển Rạch Vẹm', 'Rạch Vẹm'],
  ['Đón đoàn tại bến tàu Bãi Vòng', 'Bến Tàu Bãi Vòng'],
  ['Đón khách sân bay Phú Quốc', 'Sân bay Phú Quốc'],
  ['Quay cảng Vịnh Đầm', 'Vịnh Đầm'],
].forEach(([ten, mong]) => {
  const ra = doanDiaDiem(ten);
  ok(ten.slice(0, 46), ra === mong, 'ra "' + ra + '", mong "' + mong + '"');
});

nhom('Địa điểm — thứ tự luật');
/* Bãi Khem nằm TRONG khu Sunset Town, nên tên nhắc cả hai khớp cả hai luật.
 * Anh Hùng tách Bãi Khem thành chỗ riêng nên nó phải thắng. Đảo thứ tự trong
 * DIA_DIEM là phép thử này đỏ. */
ok('"bãi Khem - Sunset Town" ra Bãi Khem, không ra Sunset Town',
  doanDiaDiem('[quay + chụp] bãi Khem - Sunset Town') === 'Bãi Khem',
  doanDiaDiem('[quay + chụp] bãi Khem - Sunset Town'));
ok('"nhà hàng Cường Kua - Grand World" ra Grand World, không ra Nhà hàng',
  doanDiaDiem('Khảo sát nhà hàng Cường Kua - Grand World') === 'Grand World',
  doanDiaDiem('Khảo sát nhà hàng Cường Kua - Grand World'));
ok('"Tour đảo Cáp treo" ra Hòn Thơm, không ra Tour Đảo',
  doanDiaDiem('Tour đảo Cáp treo') === 'Hòn Thơm',
  doanDiaDiem('Tour đảo Cáp treo'));
/* "đón khách sân bay" bỏ dấu thành "don khach san bay" — chứa nguyên "khach
 * san". Luật khách sạn phải đứng CUỐI, nếu không mọi buổi đón sân bay thành
 * khách sạn, và sai lặng lẽ. */
ok('"đón khách sân bay" ra Sân bay, không ra Khách sạn',
  doanDiaDiem('Đón khách sân bay Phú Quốc') === 'Sân bay Phú Quốc',
  doanDiaDiem('Đón khách sân bay Phú Quốc'));

nhom('Địa điểm — gõ hoa thường và dấu không ảnh hưởng');
['vinwonders', 'VinWonders', 'VINWONDERS', 'Vinwonder'].forEach((t) => {
  ok(t, doanDiaDiem(t) === 'Vinwonders', doanDiaDiem(t));
});
ok('"cap treo hon thom" không dấu cũng khớp',
  doanDiaDiem('cap treo hon thom') === 'Hòn Thơm');

nhom('Địa điểm — không gắn với chỗ nào thì để TRỐNG');
['Media đội xe Rooty Trip', 'Quay cập nhật source', 'Sunday Game', '', null]
  .forEach((t) => ok(JSON.stringify(t), doanDiaDiem(t) === '', doanDiaDiem(t)));

/* --------------------------------------------------------------- loại hình */
nhom('Loại hình — dấu gạch cắt giữa chữ vẫn phải bắt được');
/* Người ta gõ "Liv/e/tream" để né bộ lọc của nền tảng. Dò /live/ trên chuỗi
 * thường thì trượt hết, mà trượt LẶNG LẼ — ô chỉ trống chứ không báo gì. */
[
  'Live/stre/am chill Show + Kiss of the Sea',
  'Liv/e/tream Safari',
  'Liv/es/tre/am ĐTH + Dinner SOTS',
  'Lives/tream Vinwonder Phú Quốc',
  'Live/stream Grand World',
  'Livestream Dinner show + KOTS',
  'Liv/etream Chợ đêm Vuifest',
].forEach((t) => ok(t.slice(0, 44), doanLoaiHinh(t) === 'Livestream', doanLoaiHinh(t)));

nhom('Loại hình — tên không nói gì thì đọc Mục đích');
/* Gần một nửa số dòng đặt tên chỉ bằng địa điểm. Câu trả lời nằm ở cột bên
 * cạnh; bỏ qua nó là tự để trống 45/129 dòng. */
[
  ['Vinwonder Phú Quốc', '- Li/v/e/stre/a/m bán hàng/ tư vấn tour\n- Công viên nước', 'Livestream'],
  ['Safari', '- Quay source trải nghiệm nhân vật Safari cho kênh vệ tinh.', 'Quay - chụp'],
  ['Tour đảo Cáp treo', '- Src cho Content Snokerling', 'Quay - chụp'],
  ['Bãi Sao', '- Làm clip hướng dẫn đường vào Bãi Sao không mất phí', 'Quay - chụp'],
  ['Wyndham Garden', '- Tư liệu cho tour bán hàng + truyền thông khách sạn', 'Quay - chụp'],
].forEach(([ten, md, mong]) => {
  const ra = doanLoaiHinh(ten, md);
  ok(ten + ' + mục đích', ra === mong, 'ra "' + ra + '", mong "' + mong + '"');
});

nhom('Loại hình — ba nhóm cũ gộp vào Quay - chụp');
/* Bản đầu có bảy nhóm; "Tư liệu - cập nhật source", "Khai trương - sự kiện" và
 * "Review" gộp hết vào Quay - chụp. Soi lại cả 15 dòng thì mục đích đều là đi
 * quay, đi chụp — chia nhỏ nữa là chia theo CHỦ ĐỀ của buổi, không phải theo
 * việc làm, mà cột này hỏi việc làm. */
[
  ['Tư liệu 2/9 - khu vực Dương đông', 'Quay tư liệu src 2/9 tại các địa điểm du lịch'],
  ['VINWONDERS', 'Cập nhật source VinWonders cho Lễ 2/09'],
  ['KHAI TRƯƠNG STARBUCKS', 'Content cập nhật về sự kiện khai trương Starbucks'],
  ['Tư liệu Quốc khánh 2/9', '- Src và hình ảnh: Tại các địa điểm mang không khí Việt Nam'],
  ['Sunday Game', 'Content cho kênh Phú Quốc không phanh: Review chụp ảnh photobooth'],
  ['Review quán 6 Củi + Kiss of the sea', '- Quay content review cho kênh Phú Quốc không phanh'],
].forEach(([ten, md]) => {
  const ra = doanLoaiHinh(ten, md);
  ok(ten.slice(0, 40), ra === 'Quay - chụp', 'ra "' + ra + '"');
});

nhom('Loại hình — thứ tự luật');
ok('"Live Đoàn Intercontinental" ra Media đoàn khách, không ra Livestream',
  doanLoaiHinh('Live Đoàn Intercontinental') === 'Media đoàn khách',
  doanLoaiHinh('Live Đoàn Intercontinental'));
ok('"QUAY + LIVESTREAM VINWONDERS" ra Livestream, không ra Quay - chụp',
  doanLoaiHinh('QUAY + LIVESTREAM VINWONDERS') === 'Livestream',
  doanLoaiHinh('QUAY + LIVESTREAM VINWONDERS'));
ok('"Khảo sát nhà hàng…" ra Khảo sát dù mục đích nói quay source',
  doanLoaiHinh('Khảo sát nhà hàng Cường Kua - Grand World', 'Quay source nhà hàng') === 'Khảo sát',
  doanLoaiHinh('Khảo sát nhà hàng Cường Kua - Grand World', 'Quay source nhà hàng'));
/* "tour đảo" bỏ dấu thành "tour dao" — KHÔNG được khớp \bdoan\b. Trượt chỗ này
 * là mọi buổi tour đảo bị xếp thành media đoàn khách. */
ok('"Tour đảo" KHÔNG bị nhận nhầm thành "đoàn"',
  doanLoaiHinh('Tour đảo', '- Src sửa dụng cho kịch bản bán hàng cho tour đảo')
    !== 'Media đoàn khách',
  doanLoaiHinh('Tour đảo', '- Src sửa dụng cho kịch bản bán hàng cho tour đảo'));

/* ---------------------------------------------------- danh sách bày ra */
nhom('Danh sách bày ra khớp luật, nhưng KHÁC thứ tự');
const bo = (a) => [...a].sort().join('|');
ok('địa điểm: đủ nhãn, không thừa không thiếu',
  bo(DS_DIA_DIEM) === bo(DIA_DIEM.map(([n]) => n)));
ok('loại hình: đủ nhãn, không thừa không thiếu',
  bo(DS_LOAI_HINH) === bo(LOAI_HINH.map(([n]) => n)));
ok('địa điểm: không nhãn nào trùng', new Set(DS_DIA_DIEM).size === DS_DIA_DIEM.length);
/* Thứ tự BÀY RA xếp theo số lần dùng; thứ tự LUẬT xếp theo độ đặc trưng. Trộn
 * hai thứ vào một danh sách là hỏng một trong hai, mà hỏng lặng lẽ. */
ok('hai thứ tự cố ý KHÁC nhau',
  DS_DIA_DIEM.join('|') !== DIA_DIEM.map(([n]) => n).join('|'));
ok('chỗ hay đi nhất đứng đầu ô chọn', DS_DIA_DIEM[0] === 'Sunset Town');
/* Cột loại hình KHÔNG xếp theo tần suất như cột địa điểm — anh Hùng xếp tay,
 * Livestream 86 buổi vẫn đứng thứ hai. Chỗ khác nhau giữa hai cột là cố ý. */
ok('loại hình giữ đúng thứ tự anh Hùng chốt',
  DS_LOAI_HINH.join(' | ') === 'Quay - chụp | Livestream | Media đoàn khách | Khảo sát',
  DS_LOAI_HINH.join(' | '));
ok('chỉ còn bốn loại hình', DS_LOAI_HINH.length === 4, String(DS_LOAI_HINH.length));

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
if (fail) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
