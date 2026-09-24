'use strict';
/* ==========================================================================
   Danh mục điểm đến trên bản đồ — phần DUY NHẤT phải sửa tay.
   Giá, tên tour, USP, trạng thái… KHÔNG khai ở đây: tao/du-lieu.js đọc từ Base
   "Sản phẩm" qua chính kho.js của app Sản phẩm, nên giá trên bản đồ luôn khớp app.

   Mỗi điểm:
     id        khoá dùng trong link (?diem=hon-thom) — đừng đổi khi đã gắn lên web
     ten/tenEn tên hiển thị
     vung      bac | trung | nam | dao | dat-lien   (Bắc đảo · Trung tâm · Nam đảo · Quần đảo An Thới · Đất liền)
     loai      cua-ngo | bien | vui-choi | van-hoa | check-in | di-chuyen
     lat, lon  toạ độ tra từ OpenStreetMap 23/09/2026; `uocLuong: true` = OSM chưa có,
               đặt theo mô tả — nên dán toạ độ Google Maps thật vào thay
     cap       0 = cửa ngõ, luôn hiện · 1 = điểm chính · 2 = hiện khi phóng to · 3 = điểm phụ
     tour      mã sản phẩm trên Base có ghé điểm này (tour ghép, tour riêng, vé lẻ)
   ========================================================================== */

const DIEM = [
  /* ---------------- Bắc đảo ---------------- */
  {
    id: 'vinwonders', ten: 'VinWonders Phú Quốc', tenEn: 'VinWonders Phu Quoc',
    vung: 'bac', loai: 'vui-choi', lat: 10.33800, lon: 103.85449, cap: 1,
    moTa: 'Công viên chủ đề lớn nhất Việt Nam: trò chơi cảm giác mạnh, công viên nước và thuỷ cung hình rùa.',
    moTaEn: 'Vietnam\'s largest theme park with thrill rides, a water park and the turtle-shaped aquarium.',
    tour: ['GLAND_VIN', 'VLAND_VIN', 'VIN-VW', 'VIN-CB1', 'VIN-CB2'],
  },
  {
    id: 'safari', ten: 'Vinpearl Safari', tenEn: 'Vinpearl Safari',
    vung: 'bac', loai: 'vui-choi', lat: 10.33987, lon: 103.89582, cap: 1,
    moTa: 'Vườn thú bán hoang dã đầu tiên của Việt Nam, ngồi xe xuyên khu thả tự nhiên.',
    moTaEn: 'Vietnam\'s first open-range safari park, explored by bus through free-roaming zones.',
    tour: ['VIN-SF', 'VIN-NSF', 'VIN-CB1', 'VIN-CB2'],
  },
  {
    id: 'grand-world', ten: 'Grand World', tenEn: 'Grand World',
    vung: 'bac', loai: 'vui-choi', lat: 10.32494, lon: 103.85814, cap: 1,
    moTa: '"Thành phố không ngủ": sông Venice, Bảo tàng Gấu Teddy, khu Tinh Hoa Việt Nam và show nhạc nước buổi tối.',
    moTaEn: 'The "city that never sleeps": Venice canal, Teddy Bear Museum, Essence of Vietnam and the nightly water show.',
    tour: ['GLAND_GW', 'GLAND_VIN', 'VLAND_GW', 'VLAND_VIN', 'VIN-THVN', 'VIN-BTG', 'VIN-VENICE', 'VIN-THVN-BTG'],
  },
  {
    id: 'ganh-dau', ten: 'Gành Dầu', tenEn: 'Ganh Dau',
    vung: 'bac', loai: 'bien', lat: 10.37605, lon: 103.85569, cap: 3,
    moTa: 'Mũi đất cực Bắc, làng chài yên bình nhìn sang bờ biển Campuchia.',
    moTaEn: 'The northern tip: a quiet fishing village facing the Cambodian coast.',
    tour: [],
  },
  {
    id: 'rach-vem', ten: 'Rạch Vẹm – Vương quốc sao biển', tenEn: 'Rach Vem – Starfish Beach',
    vung: 'bac', loai: 'bien', lat: 10.37368, lon: 103.93804, cap: 1,
    moTa: 'Làng chài lâu đời với bãi cạn đầy sao biển; ăn trưa trên nhà bè.',
    moTaEn: 'A long-standing fishing village with starfish-filled shallows and lunch on a floating raft.',
    tour: ['GLAND_RV', 'VLAND_RV'],
  },
  {
    id: 'ham-rong', ten: 'Mũi Hàm Rồng', tenEn: 'Ham Rong Cape',
    vung: 'bac', loai: 'bien', lat: 10.3925, lon: 103.9330, cap: 2, uocLuong: true,
    moTa: 'Bãi biển hoang sơ, nước trong, đi thuyền từ Rạch Vẹm ra.',
    moTaEn: 'An untouched beach with clear water, reached by boat from Rach Vem.',
    tour: ['GLAND_RV', 'VLAND_RV'],
  },
  {
    id: 'bai-thom', ten: 'Bãi Thơm', tenEn: 'Thom Beach',
    vung: 'bac', loai: 'bien', lat: 10.40845, lon: 104.04834, cap: 3,
    moTa: 'Bãi biển phía Đông Bắc còn nguyên nét hoang sơ, ít người.',
    moTaEn: 'A quiet, unspoiled beach on the north-east coast.',
    tour: [],
  },

  /* ---------------- Trung tâm ---------------- */
  {
    id: 'duong-dong', ten: 'Dương Đông – Trung tâm đảo', tenEn: 'Duong Dong – Town centre',
    vung: 'trung', loai: 'check-in', lat: 10.2200, lon: 103.9640, cap: 1,
    moTa: 'Thị trấn trung tâm của đảo: bến thuyền cửa sông, chợ Dương Đông, nhà hàng hải sản và khách sạn giá tốt.',
    moTaEn: 'The island\'s main town: river-mouth harbour, Duong Dong market, seafood restaurants and good-value hotels.',
    tour: [],
  },
  {
    id: 'dinh-cau', ten: 'Dinh Cậu', tenEn: 'Dinh Cau Shrine',
    vung: 'trung', loai: 'van-hoa', lat: 10.21722, lon: 103.95642, cap: 2,
    moTa: 'Ngôi miếu trên mỏm đá cửa sông Dương Đông, biểu tượng tâm linh của ngư dân đảo.',
    moTaEn: 'A shrine on the rocks at the Duong Dong river mouth, the fishermen\'s spiritual landmark.',
    tour: [],
  },
  {
    id: 'cho-dem', ten: 'Chợ đêm Phú Quốc', tenEn: 'Phu Quoc Night Market',
    vung: 'trung', loai: 'check-in', lat: 10.21630, lon: 103.96058, cap: 3,
    moTa: 'Hải sản tươi, đặc sản và quà lưu niệm ngay trung tâm Dương Đông.',
    moTaEn: 'Fresh seafood, local specialties and souvenirs in central Duong Dong.',
    tour: [],
  },
  {
    id: 'san-bay', ten: 'Sân bay quốc tế Phú Quốc', tenEn: 'Phu Quoc International Airport',
    vung: 'trung', loai: 'cua-ngo', lat: 10.1640, lon: 103.9925, cap: 0,
    moTa: 'Cửa ngõ chính vào đảo: bay thẳng từ Hà Nội, TP.HCM, Đà Nẵng và nhiều nước. Đang mở rộng cho APEC 2027 — đường băng số 2 dài 3.300 m và nhà ga T2 hình chim Phượng Hoàng lửa (dự kiến quý I/2027). Tour trọn gói Rooty Trip đón tiễn tận sân bay.',
    moTaEn: 'The island\'s main gateway, with direct flights from Hanoi, Ho Chi Minh City, Da Nang and abroad. Expanding for APEC 2027 — a second 3,300 m runway and the phoenix-shaped Terminal 2 (due Q1 2027). Rooty Trip packages include airport transfers.',
    tour: [],
  },
  {
    id: 'cang-quoc-te', ten: 'Cầu cảng Quốc tế Phú Quốc', tenEn: 'Phu Quoc International Cruise Port',
    vung: 'trung', loai: 'cua-ngo', lat: 10.22352, lon: 103.94969, cap: 1,
    moTa: 'Cảng đón tàu biển du lịch quốc tế tới 225.000 GT ở Dương Đông, cầu dẫn dài hơn 1 km vươn ra biển — cũng là điểm ngắm hoàng hôn, check-in mới.',
    moTaEn: 'Duong Dong\'s cruise terminal for ships up to 225,000 GT, with a 1 km approach bridge that doubles as a sunset spot.',
    tour: [],
  },
  {
    id: 'sanato', ten: 'Sunset Sanato', tenEn: 'Sunset Sanato',
    vung: 'trung', loai: 'check-in', lat: 10.15401, lon: 103.97942, cap: 2,
    moTa: 'Bãi biển với các tác phẩm sắp đặt khổng lồ, điểm chụp hoàng hôn nổi tiếng.',
    moTaEn: 'A beach of giant art installations and one of the island\'s famous sunset spots.',
    tour: ['GLAND1', 'VLAND1'],
  },
  {
    id: 'bai-truong', ten: 'Bãi Trường', tenEn: 'Long Beach',
    vung: 'trung', loai: 'bien', lat: 10.13802, lon: 103.97370, cap: 3,
    moTa: 'Bãi biển dài nhất đảo, dọc theo các khu nghỉ dưỡng bờ Tây.',
    moTaEn: 'The island\'s longest beach, lined with west-coast resorts.',
    tour: [],
  },

  /* ---------------- Nam đảo ---------------- */
  {
    id: 'ho-quoc', ten: 'Thiền viện Trúc Lâm Hộ Quốc', tenEn: 'Ho Quoc Pagoda',
    vung: 'nam', loai: 'van-hoa', lat: 10.11071, lon: 104.02852, cap: 1,
    moTa: 'Ngôi chùa lớn nhất đảo, tựa núi nhìn ra biển Đông.',
    moTaEn: 'The island\'s largest pagoda, set against the hills and facing the sea.',
    tour: ['GLAND1', 'VLAND1'],
  },
  {
    id: 'nha-tu', ten: 'Nhà tù Phú Quốc', tenEn: 'Phu Quoc Prison',
    vung: 'nam', loai: 'van-hoa', lat: 10.04374, lon: 104.01881, cap: 2,
    moTa: 'Di tích lịch sử quốc gia đặc biệt, còn gọi là trại giam Cây Dừa.',
    moTaEn: 'A special national historic site, also known as the Coconut Tree Prison.',
    tour: ['GLAND1', 'VLAND1'],
  },
  {
    id: 'bai-sao', ten: 'Bãi Sao', tenEn: 'Sao Beach',
    vung: 'nam', loai: 'bien', lat: 10.05294, lon: 104.03741, cap: 1,
    moTa: 'Cát trắng mịn như kem, nước xanh ngọc; tour dừng ăn trưa và tắm biển.',
    moTaEn: 'Powder-white sand and turquoise water; tours stop here for lunch and a swim.',
    tour: ['GLAND1', 'VLAND1'],
  },
  {
    id: 'bai-khem', ten: 'Bãi Khem', tenEn: 'Khem Beach',
    vung: 'nam', loai: 'bien', lat: 10.03582, lon: 104.03238, cap: 2,
    moTa: 'Vịnh cát trắng yên tĩnh ở mũi Nam, đẹp nhất lúc chiều.',
    moTaEn: 'A calm white-sand bay on the southern tip, loveliest in the afternoon.',
    tour: ['GLAND5', 'VLAND5'],
  },
  {
    id: 'sunset-town', ten: 'Thị trấn Hoàng Hôn', tenEn: 'Sunset Town',
    vung: 'nam', loai: 'check-in', lat: 10.02943, lon: 104.00831, cap: 1,
    moTa: 'Phố Địa Trung Hải bên biển: chợ đêm VUIFEST, pháo hoa và ga cáp treo ra Hòn Thơm.',
    moTaEn: 'A Mediterranean-style seaside town with the VUIFEST night market, fireworks and the cable car to Hon Thom.',
    tour: ['GLAND1', 'GLAND5', 'VLAND5', 'SUN-KOS', 'SUN-NIGHT'],
  },
  {
    id: 'ga-cap-treo', ten: 'Ga cáp treo An Thới', tenEn: 'An Thoi Cable Car Station',
    vung: 'nam', loai: 'di-chuyen', lat: 10.02704, lon: 104.00724, cap: 2,
    moTa: 'Ga đi cáp treo Hòn Thơm — tuyến cáp treo vượt biển dài gần 8 km, ngắm trọn quần đảo An Thới từ trên cao.',
    moTaEn: 'Departure station of the Hon Thom sea cable car — nearly 8 km over the An Thoi archipelago.',
    tour: ['G2', 'G2CHONTHOM', 'V2', 'V2CHONTHOM', 'SUN-C1B', 'SUN-C2', 'SUN-C2B', 'SUN-2DAY'],
  },
  {
    id: 'cau-hon', ten: 'Cầu Hôn', tenEn: 'Kiss Bridge',
    vung: 'nam', loai: 'check-in', lat: 10.02826, lon: 104.00419, cap: 2,
    moTa: 'Cây cầu hai nhịp không chạm nhau trên biển, nơi ngắm hoàng hôn và xem show Symphony of the Sea.',
    moTaEn: 'The two halves that never touch — a sunset spot and home of the Symphony of the Sea show.',
    tour: ['GLAND5', 'VLAND5', 'G2', 'G2CHONTHOM', 'SUN-CH', 'SUN-SYM', 'SUN-DINNER', 'SUN-2SHOW'],
  },

  {
    id: 'cang-bai-vong', ten: 'Cảng Bãi Vòng', tenEn: 'Bai Vong Ferry Port',
    vung: 'nam', loai: 'cua-ngo', lat: 10.14990, lon: 104.03740, cap: 0,
    moTa: 'Bến tàu cao tốc Superdong, Phú Quốc Express từ Rạch Giá (~2 giờ 30) và Hà Tiên (~1 giờ 15), cùng phà chở ô tô từ Hà Tiên.',
    moTaEn: 'Terminal for Superdong and Phu Quoc Express fast ferries from Rach Gia (~2h30) and Ha Tien (~1h15), plus the Ha Tien car ferry.',
    tour: [],
  },
  {
    id: 'cang-vinh-dam', ten: 'Cảng Vịnh Đầm', tenEn: 'Vinh Dam Port',
    vung: 'nam', loai: 'cua-ngo', lat: 10.0790, lon: 104.0290, cap: 0, uocLuong: true,
    moTa: 'Nơi cano Rooty Trip xuất phát lúc 9:15 đi tour đảo, và bến tàu cao tốc đi quần đảo Nam Du.',
    moTaEn: 'Where Rooty Trip speedboats depart at 9:15 for the island tours, and the fast-ferry pier for the Nam Du islands.',
    tour: ['G4', 'V4', 'G2', 'V2'],
  },
  {
    id: 'cang-an-thoi', ten: 'Cảng An Thới', tenEn: 'An Thoi Port',
    vung: 'nam', loai: 'cua-ngo', lat: 10.01258, lon: 104.01480, cap: 0,
    moTa: 'Cảng biển quốc tế phía Nam đảo: tàu đi Thổ Châu, tàu du lịch và thuyền ra quần đảo An Thới.',
    moTaEn: 'The southern international seaport: ferries to Tho Chau, excursion boats and trips to the An Thoi archipelago.',
    tour: [],
  },

  /* ---------------- Đất liền: nơi khách xuống tàu ra đảo ---------------- */
  {
    id: 'rach-gia', ten: 'Bến tàu Rạch Giá', tenEn: 'Rach Gia Ferry Terminal',
    vung: 'dat-lien', loai: 'cua-ngo', lat: 10.01229, lon: 105.07856, cap: 0,
    moTa: 'Bến tàu cao tốc Superdong trên đường Nguyễn Công Trứ, Rạch Giá — khoảng 4 chuyến mỗi ngày ra Phú Quốc (cảng Bãi Vòng).',
    moTaEn: 'Superdong fast-ferry terminal in Rach Gia — about 4 sailings a day to Phu Quoc (Bai Vong port).',
    tour: [],
  },
  {
    id: 'ha-tien', ten: 'Bến tàu Hà Tiên', tenEn: 'Ha Tien Ferry Terminal',
    vung: 'dat-lien', loai: 'cua-ngo', lat: 10.3805, lon: 104.4855, cap: 0, uocLuong: true,
    moTa: 'Tuyến ngắn nhất ra đảo: 5–6 chuyến tàu cao tốc mỗi ngày, khoảng 1 giờ 15 phút tới cảng Bãi Vòng.',
    moTaEn: 'The shortest crossing: 5–6 fast ferries a day, about 1h15 to Bai Vong port.',
    tour: [],
  },

  /* ---------------- Quần đảo An Thới ---------------- */
  {
    id: 'hon-thom', ten: 'Hòn Thơm – Cáp treo & Sun World', tenEn: 'Hon Thom – Cable car & Sun World',
    vung: 'dao', loai: 'vui-choi', lat: 9.95432, lon: 104.01784, cap: 1,
    moTa: 'Đi cáp treo vượt biển ba dây dài nhất thế giới, chơi công viên nước Aquatopia và ăn buffet trên đảo.',
    moTaEn: 'Ride the world\'s longest three-rope sea cable car, then Aquatopia water park and an island buffet.',
    tour: ['G2', 'G2CHONTHOM', 'V2', 'V2CHONTHOM', 'SUN-C1B', 'SUN-C2', 'SUN-C2B', 'SUN-2DAY'],
  },
  {
    id: 'may-rut-trong', ten: 'Hòn Mây Rút Trong', tenEn: 'May Rut Trong Island',
    vung: 'dao', loai: 'bien', lat: 9.9270, lon: 103.9965, cap: 2, uocLuong: true,
    moTa: 'Điểm dừng ăn trưa, tắm biển và nghỉ ngơi của tour cano 3 đảo.',
    moTaEn: 'Lunch, swimming and free time on the 3-island speedboat tour.',
    tour: ['G4', 'V4'],
  },
  {
    id: 'may-rut-ngoai', ten: 'Hòn Mây Rút Ngoài', tenEn: 'May Rut Ngoai Island',
    vung: 'dao', loai: 'bien', lat: 9.91148, lon: 103.99043, cap: 1,
    moTa: 'Bãi cát trắng, nước trong; đi bộ dưới đáy biển Seawalker và chụp flycam.',
    moTaEn: 'White sand and clear water; try the Seawalker undersea walk and drone photos.',
    tour: ['G4', 'V4', 'G2', 'V2', 'SW-TN', 'SW-TC', 'SW-VIP', 'SW-SCUBA'],
  },
  {
    id: 'gam-ghi', ten: 'Hòn Gầm Ghì', tenEn: 'Gam Ghi Island',
    vung: 'dao', loai: 'bien', lat: 9.91201, lon: 104.01427, cap: 1,
    moTa: 'Điểm lặn ngắm san hô tự nhiên đẹp nhất quần đảo An Thới.',
    moTaEn: 'The best natural coral snorkelling spot in the An Thoi archipelago.',
    tour: ['G4', 'V4', 'G2', 'V2'],
  },
  {
    id: 'mong-tay', ten: 'Hòn Móng Tay', tenEn: 'Mong Tay Island',
    vung: 'dao', loai: 'bien', lat: 9.91810, lon: 104.02366, cap: 3,
    moTa: 'Đảo nhỏ hình móng tay, bãi cát trắng và nước xanh trong vắt.',
    moTaEn: 'A tiny fingernail-shaped island with white sand and crystal-clear water.',
    tour: [],
  },
];

/* Thứ tự ghé thăm của từng tour — dùng để vẽ tuyến khi chọn tour.
   Chặng có đảo nhỏ ở một đầu vẽ nét đứt (cano); Sunset Town ↔ Hòn Thơm là cáp treo. */
const TUYEN = {
  G4: ['cang-vinh-dam', 'may-rut-ngoai', 'may-rut-trong', 'gam-ghi', 'cang-vinh-dam'],
  V4: ['cang-vinh-dam', 'may-rut-ngoai', 'may-rut-trong', 'gam-ghi', 'cang-vinh-dam'],
  G2: ['cang-vinh-dam', 'may-rut-ngoai', 'gam-ghi', 'hon-thom', 'ga-cap-treo', 'cau-hon'],
  V2: ['cang-vinh-dam', 'may-rut-ngoai', 'gam-ghi', 'hon-thom', 'ga-cap-treo'],
  GLAND1: ['sunset-town', 'nha-tu', 'bai-sao', 'ho-quoc', 'sanato'],
  VLAND1: ['sunset-town', 'nha-tu', 'bai-sao', 'ho-quoc', 'sanato'],
  GLAND5: ['bai-khem', 'cau-hon', 'sunset-town'],
  VLAND5: ['bai-khem', 'cau-hon', 'sunset-town'],
  GLAND_GW: ['grand-world'],
  VLAND_GW: ['grand-world'],
  GLAND_RV: ['rach-vem', 'ham-rong'],
  VLAND_RV: ['rach-vem', 'ham-rong'],
  G2CHONTHOM: ['ga-cap-treo', 'hon-thom', 'ga-cap-treo', 'cau-hon'],
  V2CHONTHOM: ['ga-cap-treo', 'hon-thom'],
  GLAND_VIN: ['vinwonders', 'grand-world'],
  VLAND_VIN: ['vinwonders', 'grand-world'],
};

/* Chặng nào đi cáp treo (không phải cano). */
const CAP_TREO = [['ga-cap-treo', 'hon-thom']];

/* Luồng cano giữa hai điểm (điểm trung gian [vĩ, kinh]) để tuyến không cắt ngang đảo.
   Khai một chiều; chiều ngược lại tự đảo. Không khai = đi thẳng.
   Theo "Tuyến đường cano di chuyển (Cảng Vịnh Đầm)" của Rooty Trip: cano chạy dọc bờ
   Đông xuống phía Đông Hòn Thơm rồi mới vào cụm đảo. */
const LUONG_BIEN = {
  'cang-vinh-dam>may-rut-ngoai': [[10.055, 104.050], [10.000, 104.056], [9.955, 104.040], [9.928, 104.006]],
  'gam-ghi>cang-vinh-dam': [[9.930, 104.036], [9.970, 104.047], [10.020, 104.058], [10.060, 104.050]],
  'gam-ghi>hon-thom': [[9.930, 104.030]],
  'cang-vinh-dam>hon-thom': [[10.055, 104.050], [10.000, 104.056], [9.965, 104.035]],
};

/* Tuyến tàu khách thật (vẽ mờ trên nền + cho tàu chạy). Nguồn: lịch Superdong,
   Phú Quốc Express 2026 — Rạch Giá ~2g30, Hà Tiên ~1g15 cập Bãi Vòng; Nam Du đi từ
   Vịnh Đầm; Thổ Châu (Superdong, từ 22/12/2025) đi từ An Thới. */
const TUYEN_TAU = [
  { id: 'rach-gia', ten: 'Rạch Giá – Phú Quốc · ~2 giờ 30', tenEn: 'Rach Gia – Phu Quoc · ~2h30', loai: 'tau',
    duong: [[10.0123, 105.0786], [10.020, 105.000], [10.065, 104.600], [10.120, 104.200], [10.146, 104.060], [10.1499, 104.0374]] },
  { id: 'ha-tien', ten: 'Hà Tiên – Phú Quốc · ~1 giờ 15', tenEn: 'Ha Tien – Phu Quoc · ~1h15', loai: 'tau',
    duong: [[10.3805, 104.4855], [10.345, 104.430], [10.225, 104.300], [10.170, 104.090], [10.1499, 104.0374]] },
  { id: 'nam-du', ten: 'Phú Quốc – Nam Du', tenEn: 'Phu Quoc – Nam Du', loai: 'tau',
    duong: [[10.0790, 104.0290], [10.060, 104.065], [9.850, 104.220], [9.690, 104.340]] },
  { id: 'tho-chau', ten: 'Phú Quốc – Thổ Châu · ~2 giờ 30', tenEn: 'Phu Quoc – Tho Chau · ~2h30', loai: 'tau',
    duong: [[10.0126, 104.0148], [10.004, 104.000], [9.950, 103.962], [9.850, 103.900], [9.300, 103.480]] },
];

/* Tuyến bay. Đường băng đang khai thác 10/28 (OSM: đầu Tây 10.17119,103.97948 —
   đầu Đông 10.16850,104.00670), hướng ~276°. Mùa gió Tây Nam (5–10) máy bay hạ cánh
   đường băng 28: vào từ phía Đông qua Hàm Ninh, cất cánh ra phía Tây rồi mới rẽ.
   `cao` 0..1 = độ cao tương đối (bóng đổ xa dần), `giay` = thời gian chặng. */
const TUYEN_BAY = [
  { id: 'sgn-den', ten: 'TP.HCM → Phú Quốc', tenEn: 'Ho Chi Minh City → Phu Quoc',
    duong: [[10.62, 105.30, 1, 0], [10.30, 104.56, .8, 9], [10.155, 104.143, .35, 8], [10.1685, 104.0067, 0, 6], [10.1705, 103.9870, 0, 5]] },
  { id: 'han-di', ten: 'Phú Quốc → Hà Nội', tenEn: 'Phu Quoc → Hanoi',
    duong: [[10.1690, 104.0020, 0, 0], [10.1712, 103.9795, 0, 5], [10.176, 103.935, .3, 4], [10.255, 103.862, .6, 6], [10.52, 103.87, .9, 8], [10.95, 104.05, 1, 9]] },
  { id: 'sin-di', ten: 'Phú Quốc → Singapore · Seoul', tenEn: 'Phu Quoc → Singapore · Seoul',
    duong: [[10.1690, 104.0020, 0, 0], [10.1712, 103.9795, 0, 5], [10.172, 103.930, .3, 4], [10.120, 103.870, .6, 6], [9.900, 103.860, .85, 8], [9.40, 103.95, 1, 10]] },
];

/* Nhãn địa danh vẽ thẳng lên nền (không bấm được). */
const DIA_DANH = [
  { ten: 'An Thới', tenEn: 'An Thoi', lat: 10.0121, lon: 104.0148, co: 'thi-tran' },
  { ten: 'Hàm Ninh', tenEn: 'Ham Ninh', lat: 10.1763, lon: 104.0326, co: 'lang' },
  { ten: 'Cửa Cạn', tenEn: 'Cua Can', lat: 10.2780, lon: 103.9220, co: 'lang' },
  { ten: 'Vườn quốc gia Phú Quốc', tenEn: 'Phu Quoc National Park', lat: 10.3200, lon: 104.0000, co: 'rung' },
];

/* Chữ vùng vẽ trên mặt biển. */
const VUNG = [
  { id: 'bac', ten: 'Bắc đảo', tenEn: 'North island', lat: 10.43, lon: 103.87 },
  { id: 'trung', ten: 'Trung tâm', tenEn: 'Central', lat: 10.20, lon: 103.87 },
  { id: 'nam', ten: 'Nam đảo', tenEn: 'South island', lat: 10.00, lon: 104.125 },
  { id: 'dao', ten: 'Quần đảo An Thới', tenEn: 'An Thoi archipelago', lat: 9.875, lon: 103.93 },
  { id: 'dat-lien', ten: 'Đất liền', tenEn: 'Mainland', lat: 10.25, lon: 104.80 },
];

/* Liên hệ đặt tour. Để trống = nút tương ứng không hiện trên bản đồ.
   `trangTour`: mã sản phẩm → link trang tour trên website (nút "Xem tour"). */
const LIEN_HE = {
  hotline: '',
  zalo: '',
  trangTour: {},
};

module.exports = { DIEM, TUYEN, CAP_TREO, LUONG_BIEN, TUYEN_TAU, TUYEN_BAY, DIA_DANH, VUNG, LIEN_HE };
