'use strict';
/**
 * Toạ độ tâm 63 tỉnh thành Việt Nam, kèm tên tiếng Anh mà Meta Ads trả về.
 *
 * Meta ghi tên lẫn lộn: "Ho Chi Minh City", "Hanoi", nhưng lại "Đồng Nai
 * Province", "Bà Rịa–Vũng Tàu Province" — có dấu tiếng Việt kèm chữ
 * "Province". Nên khoá tra là tên ĐÃ BỎ DẤU và đã cắt đuôi "province", và
 * mỗi tỉnh khai thêm vài cách viết hay gặp.
 *
 * Tỉnh nào Meta trả về mà bảng này chưa có thì màn hình nói thẳng tên đó ra,
 * không im lặng bỏ qua — im lặng thì bản đồ thiếu mà không ai biết thiếu gì.
 */
const TINH_VN = [
  ['An Giang', 105.12, 10.52], ['Bà Rịa - Vũng Tàu', 107.17, 10.54, 'ba ria vung tau'],
  ['Bạc Liêu', 105.49, 9.29], ['Bắc Giang', 106.49, 21.30], ['Bắc Kạn', 105.83, 22.30],
  ['Bắc Ninh', 106.08, 21.12], ['Bến Tre', 106.38, 10.24], ['Bình Dương', 106.68, 11.17],
  ['Bình Định', 109.00, 14.17], ['Bình Phước', 106.90, 11.75], ['Bình Thuận', 108.10, 11.09],
  ['Cà Mau', 105.15, 9.18], ['Cao Bằng', 106.25, 22.67], ['Cần Thơ', 105.78, 10.03, 'can tho city'],
  ['Đà Nẵng', 108.22, 16.05, 'da nang city'], ['Đắk Lắk', 108.21, 12.71, 'dak lak,daklak'],
  ['Đắk Nông', 107.69, 12.26], ['Điện Biên', 103.02, 21.80], ['Đồng Nai', 107.00, 11.07],
  ['Đồng Tháp', 105.63, 10.49], ['Gia Lai', 108.24, 13.81], ['Hà Giang', 104.98, 22.80],
  ['Hà Nam', 105.92, 20.54], ['Hà Nội', 105.84, 21.03, 'hanoi,ha noi,hanoi city'],
  ['Hà Tĩnh', 105.90, 18.34], ['Hải Dương', 106.33, 20.94], ['Hải Phòng', 106.68, 20.86, 'hai phong city'],
  ['Hậu Giang', 105.63, 9.78], ['Hoà Bình', 105.34, 20.82, 'hoa binh'],
  ['Hưng Yên', 106.05, 20.65], ['Khánh Hoà', 109.19, 12.26, 'khanh hoa'],
  ['Kiên Giang', 105.08, 10.01], ['Kon Tum', 108.00, 14.35], ['Lai Châu', 103.47, 22.40],
  ['Lạng Sơn', 106.76, 21.85], ['Lào Cai', 103.98, 22.49], ['Lâm Đồng', 108.44, 11.94],
  ['Long An', 106.41, 10.56], ['Nam Định', 106.18, 20.42], ['Nghệ An', 104.94, 19.23],
  ['Ninh Bình', 105.97, 20.25], ['Ninh Thuận', 108.99, 11.57], ['Phú Thọ', 105.22, 21.32],
  ['Phú Yên', 109.09, 13.09], ['Quảng Bình', 106.42, 17.47], ['Quảng Nam', 108.02, 15.57],
  ['Quảng Ngãi', 108.80, 15.12], ['Quảng Ninh', 107.28, 21.01], ['Quảng Trị', 107.19, 16.75],
  ['Sóc Trăng', 105.97, 9.60], ['Sơn La', 103.92, 21.33], ['Tây Ninh', 106.11, 11.31],
  ['Thái Bình', 106.34, 20.45], ['Thái Nguyên', 105.84, 21.59], ['Thanh Hoá', 105.78, 19.81, 'thanh hoa'],
  ['Thừa Thiên Huế', 107.58, 16.47, 'thua thien hue,hue'],
  ['Tiền Giang', 106.34, 10.45], ['TP. Hồ Chí Minh', 106.70, 10.78, 'ho chi minh city,ho chi minh,saigon,tp ho chi minh'],
  ['Trà Vinh', 106.34, 9.93], ['Tuyên Quang', 105.21, 21.82], ['Vĩnh Long', 105.97, 10.25],
  ['Vĩnh Phúc', 105.60, 21.31], ['Yên Bái', 104.87, 21.72],
];

const boDauTinh = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd').toLowerCase()
  .replace(/\bprovince\b|\bcity\b|\btinh\b|\btp\.?\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const TRA_TINH = (() => {
  const m = new Map();
  for (const [ten, lng, lat, biDanh] of TINH_VN) {
    const o = { ten, lng, lat };
    m.set(boDauTinh(ten), o);
    for (const b of String(biDanh || '').split(',')) {
      const k = boDauTinh(b);
      if (k) m.set(k, o);
    }
  }
  return m;
})();

window.TINH = { tra: (ten) => TRA_TINH.get(boDauTinh(ten)) || null, boDau: boDauTinh };
