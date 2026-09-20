'use strict';
/**
 * ============================================================================
 * LUẬT ĐOÁN ĐỊA ĐIỂM — không cần mạng, không cần app chạy
 * ============================================================================
 *
 *   node test/dia-diem.test.js
 *
 * Mọi tên dưới đây là tên THẬT lấy từ 129 dòng đầu của sổ, kể cả mấy cách gõ
 * lệch. Sửa luật mà quên một cách gõ là phép thử đỏ ngay — còn trên Base thì
 * chỉ là vài ô lặng lẽ trống, không ai nhìn ra.
 */
const { doanDiaDiem, DANH_SACH } = require('../dia-diem');

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

/* Tên thật → địa điểm phải ra. */
const CA = [
  /* Địa Trung Hải: phần lớn tên chỉ viết tên SHOW, không viết tên chỗ. */
  ['Live/stre/am chill Show + Kiss of the Sea', 'Địa Trung Hải – Sunset Town'],
  ['Livestream ĐTH Diner Show + Kiss of the Sea', 'Địa Trung Hải – Sunset Town'],
  ['Lives/tream ĐTH + SOTS', 'Địa Trung Hải – Sunset Town'],
  ['Livestream Địa Trung Hải Dinner show + KOTS', 'Địa Trung Hải – Sunset Town'],
  ['Chill show Symphony', 'Địa Trung Hải – Sunset Town'],
  ['Awaken Sea + Dinner Show', 'Địa Trung Hải – Sunset Town'],
  ['Livestream Bãi biển SOTS show + KOTS', 'Địa Trung Hải – Sunset Town'],
  ['[quay + chụp] bãi Khem - Sunset Town', 'Địa Trung Hải – Sunset Town'],

  /* Bốn cách gõ khác nhau của cùng một chỗ. */
  ['Vinwonder Phú Quốc', 'VinWonders'],
  ['Lives/tream Vinwonder Phú Quốc', 'VinWonders'],
  ['VINWONDERS', 'VinWonders'],
  ['QUAY + LIVESTREAM VINWONDERS', 'VinWonders'],

  ['Live/stream Grand World', 'Grand World'],
  ['Grand World Phú Quốc', 'Grand World'],
  /* THVN = Tinh hoa Việt Nam, nằm trong Grand World. */
  ['Live/stream Grand World + THVN', 'Grand World'],

  ['Liv/e/tream Safari', 'Safari'],
  ['Safari', 'Safari'],

  ['Cáp Treo Hòn Thơm', 'Cáp treo Hòn Thơm'],
  ['Live/stream Cáp treo HT', 'Cáp treo Hòn Thơm'],

  ['Tour Cano 3 Đảo diễn viên Trang Nơ FAPTV', 'Tour đảo · cano'],
  ['Tour đảo', 'Tour đảo · cano'],

  ['Liv/etream Chợ đêm Vuifest', 'Chợ đêm Vuifest'],
  ['Bãi Sao', 'Bãi Sao'],
  ['Cập nhật thông tin Công trình APEC 2027 Bãi Đất Đỏ', 'Bãi Đất Đỏ – APEC'],
  ['Tư liệu 2/9 - khu vực Dương đông', 'Dương Đông'],
  ['Khách sạn Hillside', 'Khách sạn · resort'],
  ['Tác nghiệp đoàn REGENT', 'Khách sạn · resort'],
  ['SANTO BEACH CLUB', 'Nhà hàng · quán · beach club'],
  ['KHAI TRƯƠNG STARBUCKS', 'Nhà hàng · quán · beach club'],
];

/* Không đoán được thì phải trả RỖNG, không được nhét vào một nhãn nào đó. Ô
 * trống nhìn ra ngay là còn phải xếp tay; xếp bừa thì trông như đã xong. */
const TRONG = [
  'Media đội xe Rooty Trip',
  'Media đoàn du lịch Trường Cao Đẳng Lào Cai',
  'Tác nghiệp đoàn CÔNG TY TNHH FISCHER SIA',
  'Quay cập nhật source',
  'Tư liệu Quốc khánh 2/9',
  'Sunday Game',
  '',
  null,
];

nhom('Tên thật trong sổ ra đúng địa điểm');
CA.forEach(([ten, mong]) => {
  const ra = doanDiaDiem(ten);
  ok(ten.slice(0, 46), ra === mong, 'ra "' + ra + '", mong "' + mong + '"');
});

nhom('Việc không gắn với địa điểm thì để TRỐNG');
TRONG.forEach((ten) => {
  const ra = doanDiaDiem(ten);
  ok(JSON.stringify(ten), ra === '', 'ra "' + ra + '"');
});

nhom('Luật khớp có thứ tự');
/* Một tên chứa hai từ khoá thì luật đặc trưng phải thắng. Đảo thứ tự trong
 * LUAT là hai phép thử này đỏ. */
ok('"nhà hàng Cường Kua - Grand World" ra Grand World, không ra Nhà hàng',
  doanDiaDiem('Khảo sát nhà hàng Cường Kua - Grand World') === 'Grand World',
  doanDiaDiem('Khảo sát nhà hàng Cường Kua - Grand World'));
ok('"Tour đảo Cáp treo" ra Cáp treo, không ra Tour đảo',
  doanDiaDiem('Tour đảo Cáp treo') === 'Cáp treo Hòn Thơm',
  doanDiaDiem('Tour đảo Cáp treo'));

nhom('Gõ hoa thường và dấu không ảnh hưởng');
['vinwonders', 'VinWonders', 'VINWONDERS', 'Vinwonder'].forEach((t) => {
  ok(t, doanDiaDiem(t) === 'VinWonders', doanDiaDiem(t));
});
ok('"cáp treo" không dấu cũng khớp',
  doanDiaDiem('cap treo hon thom') === 'Cáp treo Hòn Thơm');

nhom('Bộ lựa chọn khai ra khớp với luật');
ok('mọi nhãn luật đều nằm trong danh sách lựa chọn',
  CA.every(([, mong]) => DANH_SACH.includes(mong)));
ok('danh sách không có nhãn trùng', new Set(DANH_SACH).size === DANH_SACH.length);

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
if (fail) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
