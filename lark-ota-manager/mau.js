'use strict';
/**
 * Payload MẪU của bảy kênh, viết theo hình dạng payload thật của từng OTA
 * (khoá lồng, tên khoá riêng, mảng đơn vị vé, tiền tệ khác VND).
 *
 * Dùng cho ba việc:
 *   1. test/chuanhoa.test.js — kiểm tra bộ trích sâu ra đúng 20 trường;
 *   2. nút "Thử mapping" trong app — soi trước khi nối OTA thật;
 *   3. nút "Tạo booking mẫu" — có dữ liệu để xem dashboard chạy thật thế nào.
 *
 * ĐÂY LÀ DỮ LIỆU MẪU, KHÔNG PHẢI HỢP ĐỒNG API. Tên khoá gom từ tài liệu partner
 * và phải đối chiếu lại với payload thật của từng kênh: bắn payload thật vào
 * POST /webhook/<kênh>?dryRun=1, xem phần `nguon` trả về, trường nào trống thì
 * thêm tên khoá thật vào chuanhoa.js → KENH_ALIAS.
 */

/** YYYY-MM-DD cách hôm nay n ngày (giờ Việt Nam). */
function ngay(n) {
  return new Date(Date.now() + 7 * 3600000 + n * 86400000).toISOString().slice(0, 10);
}

const MAU = {
  klook: () => ({
    event: 'booking.confirmed',
    booking_ref_no: 'KLK' + Math.floor(1e7 + Math.random() * 9e7),
    booking_status: 'CONFIRMED',
    activity_name: 'Phú Quốc: Cano 3 đảo + Cáp treo Hòn Thơm',
    package_name: 'Vé ghép đoàn · ăn trưa',
    participation_date: ngay(2),
    booking_date: ngay(-1),
    customer: { customer_name: 'Nguyễn Văn A', phone: '0912345678', email: 'vana@gmail.com' },
    unit_items: [
      { name: 'Adult', count: 2, unit_price: 1400000 },
      { name: 'Child (4-9)', count: 1, unit_price: 650000 },
    ],
    pickup_location: 'Seashells Phu Quoc Hotel & Spa',
    pickup_time: '07:45',
    remarks: 'Khách có 1 bé 5 tuổi, xin ghế trước.',
    language: 'Vietnamese',
    /* Số khớp bảng giá NET: 2 NL × 1.400.000 + 1 TE × 925.000 = 3.725.000 thực nhận.
     * Klook giữ 15% ⇒ bán 4.382.000, hoa hồng 657.000. Đặt số khớp nhau để demo
     * không báo động "OTA trả thiếu" giả. */
    total_amount: 4382000,
    currency: 'VND',
    commission_amount: 657000,
  }),

  kkday: () => ({
    order_mid: 'KK-' + Math.floor(1e6 + Math.random() * 9e6),
    order_status: 'SUCCESS',
    prod_name: 'Phú Quốc Grand World + Show Kiss The Stars',
    use_date: ngay(4),
    order_date: ngay(-2),
    contact: { contact_name: 'Lin Wei Chen', contact_tel: '+886912000111', contact_email: 'linwc@example.tw' },
    pkg_items: [{ title: '成人', quantity: 2 }],
    pickup_point: '',
    note: 'Đón muộn sau 15:00',
    lang: 'zh-TW',
    // Vinwonders/Grand World: 2 NL × 1.725.000 = 3.450.000 net · KKday giữ 15%
    total_amount: 4059000,
    currency: 'VND',
  }),

  gyg: () => ({
    booking_reference: 'GYG' + Math.floor(1e6 + Math.random() * 9e6),
    status: 'CONFIRMED',
    activity_name: 'Phu Quoc: 3-Island Speedboat Tour with Snorkeling',
    option_title: 'Shared boat, hotel pickup',
    date_time: ngay(1) + 'T13:30:00+07:00',
    created_at: ngay(-3) + 'T09:12:00Z',
    traveler: { first_name: 'Anna', last_name: 'Kowalski', phone_number: '+48501234567', email: 'anna.k@example.pl' },
    adults: 2,
    children: 0,
    pickup: { hotel_name: 'Salinda Resort Phu Quoc' },
    communication: 'Vegetarian lunch for one traveler please.',
    language: 'English',
    /* Bán bằng EUR nhưng sản phẩm có trong bảng giá NET ⇒ doanh thu vẫn ra
     * 1.300.000đ chính xác (2 NL × 650.000), không phải quy đổi tỷ giá. */
    total_price: { amount: 68, currency: 'EUR' },
    net_amount: 47.6,                   // GYG giữ 30%
  }),

  ctrip: () => ({
    orderId: 'CT' + Math.floor(1e9 + Math.random() * 9e9),
    orderStatus: 'Confirmed',
    productName: '富国岛四岛跳岛游（含浮潜）',
    travelDate: ngay(6),
    createTime: ngay(-1) + ' 21:04:10',
    contactName: 'Zhang Wei',
    contactMobile: '+8613800138000',
    passengers: [
      { type: 'Adult', number: 3 },
      { type: 'Child', number: 2 },
    ],
    hotelName: 'InterContinental Phu Quoc Long Beach',
    remark: '需要中文导游',
    currency: 'CNY',
    totalAmount: 3180,
  }),

  waug: () => ({
    reservation_code: 'WAUG-' + Math.floor(1e5 + Math.random() * 9e5),
    status: 'confirmed',
    product_title: '푸꾸옥 3섬 스노클링 투어',
    use_date: ngay(3),
    user_name: 'Kim Min Jun',
    user_phone: '+821012345678',
    schedule: { pickup_time: '08:00' },
    options: [{ name: '성인', count: 4 }, { name: '아동', count: 1 }],
    // WAUG chưa trả điểm đón — đúng tình huống phải để "Chưa có điểm đón"
    memo: '',
    // 4 NL × 650.000 + 1 TE × 325.000 = 2.925.000 net · WAUG giữ 15%
    total_amount: 3441000,
  }),

  myrealtrip: () => ({
    reservation_no: 'MRT' + Math.floor(1e7 + Math.random() * 9e7),
    reservation_status: 'PAYMENT_COMPLETED',
    product_name: '푸꾸옥 케이블카 + 아쿠아토피아 워터파크',
    usage_date: ngay(8),
    traveler: { traveler_name: 'Park Ji Ho' },
    // MyRealTrip ẩn số điện thoại tới sát ngày — booking này phải bật cờ "Chưa có SĐT"
    adult_count: 2,
    child_count: 0,
    accommodation: 'Novotel Phu Quoc Resort',
    // Cáp treo Hòn Thơm: 2 NL × 1.270.000 = 2.540.000 net · MyRealTrip giữ 10%
    total_price: 2822000,
    net_price: 2540000,
  }),

  viator: () => ({
    bookingRef: 'BR-' + Math.floor(1e8 + Math.random() * 9e8),
    status: 'CONFIRMED',
    productTitle: 'Phu Quoc: Vinwonders & Safari Combo Ticket',
    travelDate: ngay(5),
    bookingDate: ngay(-4),
    bookerInfo: { firstName: 'Michael', lastName: "O'Brien" },
    communication: { phone: '+353871234567', email: 'mobrien@example.ie' },
    paxMix: [
      { ageBand: 'ADULT', numberOfTravelers: 2 },
      { ageBand: 'CHILD', numberOfTravelers: 2 },
    ],
    logistics: { travelerPickup: { pickupPoint: 'Sailing Club Signature Resort Phu Quoc' } },
    specialRequirements: 'One traveler uses a wheelchair.',
    languageGuide: 'English',
    // Vinwonders: 2 NL × 1.725.000 + 2 TE × 1.055.000 = 5.560.000 net · Viator giữ 22%
    totalPrice: 7128000,
    currency: 'VND',
  }),
};

/** Một payload mẫu của kênh. */
function mau(kenhId) {
  const f = MAU[kenhId];
  if (!f) {
    const e = new Error('Không có payload mẫu cho kênh ' + kenhId);
    e.code = 400;
    throw e;
  }
  return f();
}

/** Mỗi kênh một payload — dùng cho nút "Tạo booking mẫu" và cho test. */
function tatCa() {
  return Object.keys(MAU).map((id) => ({ kenhId: id, payload: MAU[id]() }));
}

module.exports = { mau, tatCa, ngay, DS_KENH: Object.keys(MAU) };
