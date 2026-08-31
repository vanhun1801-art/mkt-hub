'use strict';
/* ============================================================================
 * Chuẩn hoá payload OTA → một booking duy nhất, 20 trường + cờ cần xử lý.
 *
 * BẢY OTA GỌI MỘT THỨ BẢY TÊN KHÁC NHAU. Klook gọi điểm đón là `pickup_location`,
 * KKday `pickup_point`, Viator nhét trong `logistics.travelerPickup.location`.
 * Viết bảy adapter riêng thì mỗi lần OTA đổi payload là sửa bảy chỗ, nên ở đây
 * làm một bộ trích SÂU theo danh sách tên gọi (alias): làm phẳng payload thành
 * đường dẫn → giá trị, rồi khớp tên khoá cuối với alias, ưu tiên đường dẫn nông
 * nhất. Mỗi kênh chỉ khai thêm alias RIÊNG của nó ở KENH_ALIAS để phá thế lưỡng
 * nghĩa (ví dụ Viator có cả `bookingRef` và `productCode`).
 *
 * NGUYÊN TẮC: OTA không trả thì để TRỐNG, tuyệt đối không suy đoán. Số hoa hồng
 * ước tính theo % cấu hình luôn được đánh dấu `hoaHongUocTinh: true` để không
 * trộn lẫn với số hoa hồng thật OTA trả về.
 *
 * Tên khoá dưới đây gom từ tài liệu partner của từng kênh và là danh sách MỞ:
 * chạy webhook với ?dryRun=1 sẽ in ra đúng đường dẫn mà mỗi trường lấy được,
 * thấy trường nào trống thì thêm tên khoá thật vào alias tương ứng — không phải
 * sửa logic.
 * ========================================================================== */
const cfg = require('./config');
const gia = require('./gia');

/* ---------------------------------------------------------------- làm phẳng */
const chuanKhoa = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * payload → [{ path, khoa, value }] cho mọi giá trị vô hướng.
 * `khoa` là tên khoá cuối đã chuẩn hoá; `sau` là độ sâu để ưu tiên nông trước.
 */
function lamPhang(o, path = '', out = [], sau = 0) {
  if (o == null || sau > 8) return out;
  if (Array.isArray(o)) {
    o.forEach((v, i) => lamPhang(v, path + '[' + i + ']', out, sau + 1));
    return out;
  }
  if (typeof o === 'object') {
    Object.keys(o).forEach((k) => lamPhang(o[k], path ? path + '.' + k : k, out, sau + 1));
    return out;
  }
  const doan = path.split('.');
  const cuoi = doan[doan.length - 1].replace(/\[\d+\]$/, '');
  out.push({ path, khoa: chuanKhoa(cuoi), value: o, sau: doan.length });
  return out;
}

const trong = (v) => v == null || String(v).trim() === '';

/**
 * Lấy giá trị đầu tiên khớp một trong các alias.
 * Alias đứng trước thắng alias đứng sau; cùng alias thì đường dẫn nông thắng.
 * Trả { value, path } để chế độ dryRun in ra được nguồn của từng trường.
 */
function lay(phang, aliases) {
  const bang = aliases.map(chuanKhoa);
  let tot = null;
  for (const o of phang) {
    if (trong(o.value)) continue;
    const hang = bang.indexOf(o.khoa);
    if (hang < 0) continue;
    if (!tot || hang < tot.hang || (hang === tot.hang && o.sau < tot.sau)) {
      tot = { hang, sau: o.sau, value: o.value, path: o.path };
    }
  }
  return tot ? { value: tot.value, path: tot.path } : null;
}

/* ------------------------------------------------------- alias dùng chung */
const ALIAS = {
  maBooking: ['booking_ref_no', 'booking_reference', 'bookingRef', 'booking_ref', 'booking_no',
    'booking_id', 'bookingId', 'order_no', 'order_id', 'orderId', 'order_mid', 'ordermid',
    'reservation_code', 'reservation_no', 'reservationNumber', 'confirmation_code',
    'confirmation_no', 'voucher_no', 'ref_no', 'reference', 'ma_booking'],

  tenKhach: ['customer_name', 'contact_name', 'guest_name', 'traveler_name', 'travellerName',
    'passenger_name', 'booker_name', 'user_name', 'buyer_name', 'contactName', 'fullName',
    'full_name', 'ten_khach', 'name'],

  ho: ['first_name', 'firstName', 'given_name', 'givenName'],
  ten: ['last_name', 'lastName', 'family_name', 'familyName', 'surname'],

  sdt: ['phone_number', 'phoneNumber', 'contact_tel', 'contact_phone', 'user_phone', 'mobile_number',
    'mobile', 'cellphone', 'cell_phone', 'telephone', 'phone', 'tel', 'so_dien_thoai', 'sdt'],

  email: ['email_address', 'emailAddress', 'contact_email', 'user_email', 'buyer_email', 'email'],

  ngayDat: ['booking_date', 'bookingDate', 'order_date', 'orderDate', 'purchase_date', 'booked_at',
    'order_time', 'create_time', 'created_at', 'createdAt', 'created', 'paid_at'],

  ngayDi: ['participation_date', 'participationDate', 'travel_date', 'travelDate', 'use_date',
    'usage_date', 'usageDate', 'activity_date', 'service_date', 'visit_date', 'tour_date',
    'departure_date', 'checkin_date', 'start_date', 'startTime', 'start_time', 'date_time',
    'ngay_di'],

  tour: ['activity_name', 'activityName', 'product_name', 'productName', 'product_title',
    'productTitle', 'package_name', 'packageName', 'item_name', 'tour_name', 'sku_name',
    'activity', 'product', 'title', 'ten_tour'],

  nguoiLon: ['adult_count', 'adultCount', 'num_adults', 'numAdults', 'adult_qty', 'adult_pax',
    'adults', 'adult', 'nguoi_lon'],

  treEm: ['child_count', 'childCount', 'num_children', 'numChildren', 'child_qty', 'child_pax',
    'children', 'child', 'kids', 'tre_em'],

  tongKhach: ['total_pax', 'totalPax', 'total_travelers', 'num_travelers', 'total_guests',
    'group_size', 'participants', 'pax', 'quantity', 'qty', 'tong_khach'],

  diemDon: ['pickup_location', 'pickupLocation', 'pickup_point', 'pickupPoint', 'pickup_address',
    'pickup_hotel', 'hotel_name', 'hotelName', 'accommodation', 'pickup', 'hotel', 'diem_don'],

  gioDon: ['pickup_time', 'pickupTime', 'pickup_hour', 'gio_don'],

  ghiChu: ['special_requirements', 'specialRequirements', 'customer_note', 'customer_remark',
    'additional_info', 'additionalInfo', 'remarks', 'remark', 'notes', 'note', 'comment',
    'comments', 'message', 'requests', 'ghi_chu'],

  ngonNgu: ['guide_language', 'guideLanguage', 'traveler_language', 'language_code', 'language',
    'nationality', 'country_code', 'country', 'locale', 'lang', 'ngon_ngu', 'quoc_tich'],

  tongTien: ['total_amount', 'totalAmount', 'gross_amount', 'total_price', 'totalPrice',
    'order_amount', 'price_total', 'selling_price', 'retail_price', 'total_fare', 'total',
    'amount', 'tong_tien'],

  hoaHong: ['commission_amount', 'commissionAmount', 'ota_commission', 'platform_fee',
    'service_fee', 'commission', 'hoa_hong'],

  thucNhan: ['net_amount', 'netAmount', 'net_price', 'netPrice', 'payout_amount', 'payout',
    'net_rate', 'merchant_amount', 'supplier_amount', 'net', 'thuc_nhan'],

  trangThai: ['booking_status', 'bookingStatus', 'order_status', 'orderStatus',
    'reservation_status', 'status', 'state', 'trang_thai'],

  tienTe: ['currency_code', 'currencyCode', 'currency', 'curr', 'tien_te'],
};

/* ------------------------------------------- alias riêng của từng kênh ----
 * Chỉ khai những trường mà tên khoá của kênh KHÔNG có trong ALIAS chung, hoặc
 * cần ưu tiên trước để tránh lấy nhầm ô khác. Kênh nào không khai thì dùng
 * hoàn toàn alias chung.
 */
const KENH_ALIAS = {
  klook: {
    maBooking: ['booking_ref_no', 'booking_id'],
    tour: ['activity_name', 'package_name'],
    ngayDi: ['participation_date'],
    diemDon: ['pickup_location'],
    tongTien: ['total_amount', 'selling_price'],
  },
  kkday: {
    maBooking: ['order_mid', 'order_no'],
    tour: ['prod_name', 'product_name'],
    ngayDi: ['use_date', 'used_date'],
    sdt: ['contact_tel'],
    tenKhach: ['contact_name'],
    diemDon: ['pickup_point'],
  },
  gyg: {
    maBooking: ['booking_reference', 'booking_hash'],
    tour: ['activity_name', 'option_title'],
    ngayDi: ['date_time', 'start_time'],
    tenKhach: ['traveler_name', 'customer_name'],
    ghiChu: ['communication', 'special_requirements'],
    tongKhach: ['number_of_travelers', 'total_travelers'],
  },
  ctrip: {
    maBooking: ['orderId', 'order_id', 'otaOrderId'],
    tour: ['productName', 'resourceName'],
    ngayDi: ['travelDate', 'useDate', 'arrivalDate'],
    tenKhach: ['contactName', 'passengerName'],
    sdt: ['contactMobile', 'contactPhone'],
    ghiChu: ['remark', 'specialRequest'],
  },
  waug: {
    maBooking: ['reservation_code', 'booking_code'],
    tour: ['product_title', 'product_name'],
    ngayDi: ['use_date', 'schedule_date'],
    tenKhach: ['user_name', 'reserver_name'],
    sdt: ['user_phone', 'reserver_phone'],
  },
  myrealtrip: {
    maBooking: ['reservation_no', 'reservation_id'],
    tour: ['product_name', 'offer_name'],
    ngayDi: ['usage_date', 'use_date', 'reservation_date'],
    tenKhach: ['traveler_name', 'buyer_name'],
  },
  viator: {
    maBooking: ['bookingRef', 'itineraryRef', 'distributorRef'],
    tour: ['productTitle', 'productName'],
    ngayDi: ['travelDate', 'startTime'],
    tenKhach: ['bookerInfo.firstName', 'primaryContactName'],
    sdt: ['communication.phone', 'phoneNumber'],
    email: ['communication.email'],
    diemDon: ['pickupPoint', 'location'],
    ghiChu: ['specialRequirements'],
  },
};

/* ------------------------------------------------------------- kiểu dữ liệu */

/** "3.450.000" / "3,450,000" / "1234.56" / 1234 → số. Không đoán được thì null. */
function soTien(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,-]/g, '').trim();
  if (!s) return null;
  const cham = s.lastIndexOf('.');
  const phay = s.lastIndexOf(',');
  /* Dấu phân cách thập phân là dấu ĐỨNG SAU CÙNG, và chỉ khi nó tách ra đúng
   * 1-2 chữ số ở cuối; "3.450.000" thì dấu cuối cách 3 số nên là phân cách nghìn. */
  const cuoi = Math.max(cham, phay);
  if (cuoi >= 0 && s.length - cuoi - 1 <= 2 && s.length - cuoi - 1 >= 1) {
    s = s.slice(0, cuoi).replace(/[.,]/g, '') + '.' + s.slice(cuoi + 1);
  } else {
    s = s.replace(/[.,]/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const soNguyen = (v) => {
  const n = soTien(v);
  return n == null ? null : Math.round(n);
};

/**
 * Làm tròn tiền theo đúng loại tiền: VNĐ không có phần lẻ, còn EUR/USD/CNY thì
 * có xu. Làm tròn EUR về số nguyên là 117,6 € thành 118 € — lệch tiền thật.
 */
function lamTron(n, tienTe) {
  if (n == null) return null;
  if (!tienTe || tienTe === 'VND') return Math.round(n);
  return Math.round(n * 100) / 100;
}

/**
 * Ngày từ OTA → 'YYYY-MM-DD' (chỉ phần ngày; giờ đón đi cột riêng).
 * Nhận: ISO, epoch giây/ms, 'DD/MM/YYYY', 'MM/DD/YYYY' (chỉ khi ngày > 12),
 * 'YYYY-MM-DD HH:mm'. Không chắc chắn thì trả '' — thà trống hơn sai ngày tour.
 */
function ngay(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' || /^\d{10}$|^\d{13}$/.test(String(v).trim())) {
    const n = Number(v);
    const ms = String(Math.trunc(n)).length <= 10 ? n * 1000 : n;
    const d = new Date(ms + cfg.tzOffsetHours * 3600000);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];

  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) {
    let d1 = Number(m[1]), d2 = Number(m[2]);
    // >12 ở ô đầu chỉ có thể là ngày ⇒ MM/DD; còn lại giữ DD/MM (chuẩn VN + phần lớn OTA)
    const [dd, mm] = d1 > 12 ? [d1, d2] : d2 > 12 ? [d2, d1] : [d1, d2];
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
    return m[3] + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
  }

  const t = Date.parse(s);
  if (Number.isFinite(t)) return new Date(t + cfg.tzOffsetHours * 3600000).toISOString().slice(0, 10);
  return '';
}

/** 'HH:mm' lấy từ chuỗi ngày-giờ hoặc từ ô giờ đón riêng. */
function gio(v) {
  if (v == null || v === '') return '';
  const s = String(v);
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return '';
  return String(h).padStart(2, '0') + ':' + m[2];
}

/** Giữ + và chữ số; bỏ khoảng trắng, gạch, ngoặc. KHÔNG tự thêm mã quốc gia. */
function dienThoai(v) {
  if (v == null) return '';
  const s = String(v).trim();
  /* Dấu + có thể nằm trong ngoặc: "(+84) 912-345-678". Coi là số quốc tế khi
   * gặp dấu + TRƯỚC chữ số đầu tiên — mất dấu + là gọi không được. */
  const co = /^[^\d]*\+/.test(s);
  const so = s.replace(/[^\d]/g, '');
  if (so.length < 6) return '';           // rác kiểu "N/A", "-", "000"
  return (co ? '+' : '') + so;
}

const chu = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

/* --------------------------------------------------------- trạng thái ----
 * Quy mọi kiểu chữ của 7 OTA về ĐÚNG 5 option của cột select "Trạng thái" trong
 * Base: Chờ xác nhận · Đã xác nhận · Đã hoàn thành · Đã huỷ · No-show.
 * Ghi một chuỗi ngoài danh sách đó là Lark từ chối cả bản ghi, nên đây là hàng
 * rào bắt buộc chứ không phải chuyện thẩm mỹ.
 *
 * Base KHÔNG có trạng thái "Hoàn tiền" riêng: refund là một dạng huỷ, và khoản
 * tiền đã trả lại thì theo dõi ở cột "Đã nhận tiền" / "Phí phạt" của kế toán.
 * Nên refund → 'Đã huỷ', và nhan.js điền thêm Ngày huỷ + Lý do huỷ.
 *
 * Thứ tự QUAN TRỌNG: khớp từ trên xuống, cái hẹp nhất đứng trước. "no-show" phải
 * đứng trước 'Đã huỷ' vì chuỗi "no_show_cancelled" chứa cả hai.
 */
const TU_TRANG_THAI = [
  [/no.?show|khach.?khong.?den|불참/i, 'No-show'],
  [/refund|hoan\s*tien|chargeback|money.?back/i, 'Đã huỷ'],
  [/cancel|canceled|cancelled|void|reject|declin|fail|huy|hủy/i, 'Đã huỷ'],
  /* "đã dùng vé / đã check-in / hoàn tất" là tour ĐÃ CHẠY XONG, khác với "đã xác
   * nhận sẽ chạy". Base tách hai cái này nên app cũng phải tách — gộp lại thì
   * không đếm được tour nào còn phải phục vụ. */
  [/complete|completed|finish|utiliz|redeem|used|checked.?in|hoan\s*tat|da\s*di/i, 'Đã hoàn thành'],
  [/confirm|success|paid|approved|accept|xac\s*nhan/i, 'Đã xác nhận'],
  [/new|pending|await|process|created|hold|reserved|moi|mới/i, 'Chờ xác nhận'],
];

/* ------------------------------------------------------- thị trường khách --
 * Cột "Thị trường khách" trong Base là select có sẵn option, không phải ô chữ.
 * OTA thì gửi đủ kiểu: 'ko', 'ko-KR', 'Korea', '한국', 'KR', 'Korean'. Quy về
 * đúng option; KHÔNG nhận ra thì trả rỗng chứ không nhét 'Khác' — 'Khác' phải là
 * lựa chọn có ý nghĩa của người vận hành, không phải chỗ đổ rác của app.
 */
const TU_THI_TRUONG = [
  [/^ko|korea|korean|한국|hanquoc/i, 'Hàn Quốc'],
  [/^zh.?(cn|hans)|^cn$|china|chinese|中国|中國|trungquoc/i, 'Trung Quốc'],
  [/^zh.?(tw|hk|hant)|taiwan|^tw$|台湾|台灣|daŭ|dailoan/i, 'Đài Loan'],
  [/^vi|vietnam|viet\s*nam|việt/i, 'Việt Nam'],
  [/^ms|malaysia|^my$/i, 'Malaysia'],
  [/^hi$|india|^in$/i, 'India'],
  [/^en|^de|^fr|^es|^it|^nl|^ru|usa|^us$|america|europe|australia|canada|uk|british|aumy/i, 'Âu Mỹ'],
  [/^th|thai|^id|indonesia|singapore|^sg$|philippin|^ph$|dongnama/i, 'Đông Nam Á'],
];

/** Ngôn ngữ / quốc tịch OTA gửi → option của cột "Thị trường khách". */
function thiTruong(v) {
  const s = chu(v);
  if (!s) return '';
  const dung = cfg.thiTruong.find((x) => x.toLowerCase() === s.toLowerCase());
  if (dung) return dung;
  for (const [re, ra] of TU_THI_TRUONG) if (re.test(s)) return ra;
  return '';
}

/** Chuỗi trạng thái của OTA → 1 trong 5 trạng thái của Base. Không rõ ⇒ chờ xác nhận. */
function trangThai(v) {
  const s = chu(v);
  if (!s) return cfg.trangThaiMoi;
  for (const [re, ra] of TU_TRANG_THAI) if (re.test(s)) return ra;
  return cfg.trangThaiMoi;
}

/* ------------------------------------------------------------ số khách ---
 * Nhiều OTA không gửi adults/children mà gửi mảng đơn vị vé:
 *   unit_items: [{ name: 'Adult', count: 2 }, { name: 'Child', count: 1 }]
 *   paxMix:     [{ ageBand: 'ADULT', numberOfTravelers: 2 }, ...]
 * Hàm này quét mọi mảng trong payload, tìm cặp (nhãn loại vé × số lượng).
 */
const RE_NGUOI_LON = /adult|nguoi\s*lon|người\s*lớn|성인|大人|成人/i;
const RE_TRE_EM = /child|kid|infant|tre\s*em|trẻ\s*em|아동|小人|儿童|兒童/i;

function khachTuMang(o, ra = { nguoiLon: 0, treEm: 0, thay: false }) {
  if (o == null || typeof o !== 'object') return ra;
  if (Array.isArray(o)) {
    o.forEach((x) => khachTuMang(x, ra));
    return ra;
  }
  const khoa = Object.keys(o);
  const nhan = khoa.filter((k) => /name|type|category|ageband|age_band|title|unit|label/i.test(k))
    .map((k) => chu(o[k])).filter(Boolean).join(' ');
  const dem = khoa.filter((k) => /count|quantity|qty|number|num|pax|persons?|travelers?/i.test(k))
    .map((k) => soNguyen(o[k])).find((n) => n != null);

  if (nhan && dem != null && dem > 0) {
    if (RE_NGUOI_LON.test(nhan)) { ra.nguoiLon += dem; ra.thay = true; }
    else if (RE_TRE_EM.test(nhan)) { ra.treEm += dem; ra.thay = true; }
  }
  khoa.forEach((k) => { if (o[k] && typeof o[k] === 'object') khachTuMang(o[k], ra); });
  return ra;
}

/* ------------------------------------------------------------ ghép tên ---
 * Có kênh trả nguyên "Nguyễn Văn A", có kênh tách first/last. Ghép theo thứ tự
 * OTA đưa ra (first rồi last) — không tự đảo, vì đảo tên khách là sai tên khách.
 */
function tenKhach(phang, aliasKenh) {
  const cau = lay(phang, [...(aliasKenh.tenKhach || []), ...ALIAS.tenKhach]);
  if (cau && chu(cau.value).length >= 2) return cau;
  const ho = lay(phang, ALIAS.ho);
  const ten = lay(phang, ALIAS.ten);
  const ghep = [ho && chu(ho.value), ten && chu(ten.value)].filter(Boolean).join(' ');
  if (!ghep) return null;
  return { value: ghep, path: [ho && ho.path, ten && ten.path].filter(Boolean).join(' + ') };
}

/* ============================================================ chuẩn hoá == */

/**
 * @param {string} kenhId  id kênh trong cfg.kenh (klook, kkday, gyg, ...)
 * @param {object} payload nguyên văn OTA gửi
 * @returns {{ booking: object, nguon: object, canhBao: string[] }}
 *   booking — 20 trường + canXuLy/cờ; nguon — trường nào lấy từ đường dẫn nào
 *   (dùng cho ?dryRun=1); canhBao — những chỗ app KHÔNG dám suy đoán.
 */
function chuanHoa(kenhId, payload) {
  const kenh = cfg.kenh.find((k) => k.id === kenhId);
  if (!kenh) {
    const e = new Error('Kênh OTA không nhận ra: ' + kenhId +
      '. Kênh hợp lệ: ' + cfg.kenh.map((k) => k.id).join(', '));
    e.code = 400;
    throw e;
  }

  const aliasKenh = KENH_ALIAS[kenhId] || {};
  const phang = lamPhang(payload);
  const nguon = {};
  const canhBao = [];

  /** Lấy một trường: alias riêng của kênh trước, rồi alias chung. */
  const g = (key) => {
    const r = lay(phang, [...(aliasKenh[key] || []), ...(ALIAS[key] || [])]);
    if (r) nguon[key] = r.path;
    return r ? r.value : null;
  };

  const ten = tenKhach(phang, aliasKenh);
  if (ten) nguon.tenKhach = ten.path;

  const ngayDiTho = g('ngayDi');
  const gioTho = g('gioDon');

  let nguoiLon = soNguyen(g('nguoiLon'));
  let treEm = soNguyen(g('treEm'));
  let tongKhach = soNguyen(g('tongKhach'));

  // Không có ô adults/children rõ ràng thì thử suy từ mảng đơn vị vé
  if (nguoiLon == null && treEm == null) {
    const m = khachTuMang(payload);
    if (m.thay) {
      nguoiLon = m.nguoiLon || null;
      treEm = m.treEm || null;
      nguon.nguoiLon = nguon.treEm = '(suy từ mảng đơn vị vé)';
    }
  }
  // Tổng khách: OTA trả thì tin, không thì cộng. Cộng được mà lệch số OTA gửi
  // thì giữ số của OTA và ghi cảnh báo — không tự sửa số của đối tác.
  const cong = (nguoiLon || 0) + (treEm || 0);
  if (tongKhach == null && cong > 0) {
    tongKhach = cong;
    nguon.tongKhach = '(người lớn + trẻ em)';
  } else if (tongKhach != null && cong > 0 && tongKhach !== cong) {
    canhBao.push('OTA gửi tổng ' + tongKhach + ' khách nhưng người lớn + trẻ em = ' + cong +
      ' — giữ nguyên số của OTA, cần đối chiếu lại.');
  }

  const tienTe = (chu(g('tienTe')) || 'VND').toUpperCase();
  const laVnd = tienTe === 'VND';
  const tongTien = soTien(g('tongTien'));       // giá OTA BÁN, theo nguyên tệ của OTA
  const hoaHongOta = soTien(g('hoaHong'));      // số OTA tự báo, nguyên tệ
  const thucNhanOta = soTien(g('thucNhan'));    // số OTA tự báo, nguyên tệ

  /* ------------------------------------------------------------------
   * THỰC NHẬN — luôn tính bằng VNĐ, theo thứ tự tin cậy:
   *
   *   1. BẢNG GIÁ NET của Rooty Trip (gia.js)  ← chính xác, không phải ước tính
   *   2. số OTA tự báo, nếu booking bằng VNĐ
   *   3. tổng tiền − hoa hồng OTA báo, nếu bằng VNĐ
   *   4. tổng tiền × (1 − % hợp đồng)          ← ước tính, có gắn cờ
   *
   * Bảng giá đứng đầu vì hợp đồng là giá NET cố định: mình nhận đúng 650.000đ
   * một người lớn bất kể OTA bán bao nhiêu, bán bằng tiền gì. Nhờ vậy booking
   * bán bằng EUR/CNY vẫn ra được doanh thu VNĐ — thứ mà cách tính theo % không
   * làm được.
   * ------------------------------------------------------------------ */
  const bg = gia.thucNhanTheoBangGia({
    tour: chu(g('tour')),
    // giá áp theo NGÀY ĐI (ngày thực hiện dịch vụ); chưa có ngày đi thì lấy ngày đặt
    ngay: ngay(ngayDiTho) || ngay(g('ngayDat')) || '',
    nguoiLon, treEm,
  });

  let thucNhan = null;
  let nguonThucNhan = '';
  let hoaHongUocTinh = false;

  if (bg.tien != null) {
    thucNhan = bg.tien;
    nguonThucNhan = 'bang-gia';
    nguon.thucNhan = 'bảng giá NET ' + bg.hieuLuc + ': ' + bg.chiTiet;
  } else if (laVnd && thucNhanOta != null) {
    thucNhan = lamTron(thucNhanOta, 'VND');
    nguonThucNhan = 'ota';
  } else if (laVnd && hoaHongOta != null && tongTien != null) {
    thucNhan = lamTron(tongTien - hoaHongOta, 'VND');
    nguonThucNhan = 'ota-suy';
    nguon.thucNhan = '(tổng tiền − hoa hồng OTA báo)';
  } else if (laVnd && tongTien != null) {
    thucNhan = lamTron(tongTien * (1 - kenh.hoaHong / 100), 'VND');
    nguonThucNhan = 'uoc-tinh';
    hoaHongUocTinh = true;
    nguon.thucNhan = '(ước tính: tổng tiền − ' + kenh.hoaHong + '% — không map được sản phẩm)';
  }

  /* Hoa hồng = phần OTA GIỮ LẠI, giữ theo nguyên tệ của tổng tiền (nó là hiệu
   * của hai số cùng tệ). KHÔNG lấy hiệu giữa tổng tiền ngoại tệ và thực nhận VNĐ. */
  let hoaHong = hoaHongOta;
  if (hoaHong == null && thucNhanOta != null && tongTien != null) {
    hoaHong = lamTron(tongTien - thucNhanOta, tienTe);
    nguon.hoaHong = '(tổng tiền − thực nhận OTA báo)';
  } else if (hoaHong == null && laVnd && tongTien != null && thucNhan != null) {
    hoaHong = lamTron(tongTien - thucNhan, 'VND');
    nguon.hoaHong = nguonThucNhan === 'bang-gia'
      ? '(tổng tiền − thực nhận theo bảng giá)' : '(tổng tiền − thực nhận)';
  } else if (hoaHong == null && tongTien != null) {
    hoaHong = lamTron((tongTien * kenh.hoaHong) / 100, tienTe);
    hoaHongUocTinh = true;
    nguon.hoaHong = '(ước tính ' + kenh.hoaHong + '% — OTA không trả)';
  }

  /* ĐỐI CHIẾU — chỗ giữ tiền cho công ty.
   * Có cả bảng giá lẫn số OTA báo (cùng VNĐ) thì so; lệch quá 1.000đ là cờ đỏ:
   * hoặc OTA trả thiếu, hoặc map sai sản phẩm, hoặc bảng giá đã cũ. */
  let lechBangGia = null;
  if (nguonThucNhan === 'bang-gia' && laVnd) {
    const otaNet = thucNhanOta != null ? thucNhanOta
      : (tongTien != null && hoaHongOta != null ? tongTien - hoaHongOta : null);
    if (otaNet != null && Math.abs(bg.tien - otaNet) > 1000) {
      lechBangGia = Math.round(bg.tien - otaNet);
    }
  }

  if (tongTien != null && !laVnd) {
    canhBao.push(nguonThucNhan === 'bang-gia'
      ? 'OTA bán bằng ' + tienTe + ', nhưng thực nhận lấy từ bảng giá NET nên doanh thu ' +
        'vẫn là VNĐ chính xác. Riêng ô "tổng tiền" giữ nguyên tệ, không quy đổi.'
      : 'Booking tính bằng ' + tienTe + ' mà chưa map được sản phẩm trong bảng giá, nên app ' +
        'KHÔNG tính được doanh thu VNĐ. Bổ sung sản phẩm vào bảng giá là hết cảnh báo này.');
  }
  if (bg.loi === 'trung') {
    canhBao.push('Tên tour khớp nhiều sản phẩm trong bảng giá (' + (bg.ungVien || []).join(' / ') +
      ') — app không chọn bừa. Sửa luật nhận diện trong gia.js cho rõ ràng hơn.');
  }
  if (lechBangGia != null) {
    canhBao.push('OTA báo trả lệch ' + lechBangGia.toLocaleString('vi-VN') + 'đ so với bảng giá NET ' +
      '— đối chiếu lại trước khi chốt thanh toán.');
  }

  const booking = {
    kenh: kenh.ten,
    kenhId: kenh.id,
    maBooking: chu(g('maBooking')),
    tenKhach: ten ? chu(ten.value) : '',
    sdt: dienThoai(g('sdt')),
    email: chu(g('email')).toLowerCase(),
    ngayDat: ngay(g('ngayDat')),
    ngayDi: ngay(ngayDiTho),
    tour: chu(g('tour')),
    nguoiLon, treEm, tongKhach,
    diemDon: chu(g('diemDon')),
    // Giờ đón: ô riêng nếu có, không thì lấy phần giờ của chính ngày đi
    gioDon: gio(gioTho) || gio(ngayDiTho),
    ghiChu: chu(g('ghiChu')),
    ngonNgu: chu(g('ngonNgu')),
    /* Bản đã quy về option của Base — store.js ghi cột này, còn `ngonNgu` giữ
     * nguyên văn OTA gửi để còn đối chiếu khi quy sai. */
    thiTruong: thiTruong(g('ngonNgu')),
    tienTe,
    tongTien, hoaHong, thucNhan, hoaHongUocTinh,
    /* Dấu vết để đối chiếu: số OTA tự báo (nguyên tệ), sản phẩm khớp trong bảng
     * giá, và chênh lệch so với bảng giá. Thiếu mấy trường này thì khi kế toán
     * hỏi "sao thực nhận ra số đó" không ai trả lời được. */
    hoaHongOta, thucNhanOta,
    nguonThucNhan,
    sanPham: bg.sanPham ? bg.sanPham.ten : '',
    sanPhamId: bg.sanPham ? bg.sanPham.id : '',
    bangGiaLoi: bg.loi || '',
    bangGiaUngVien: bg.ungVien || null,
    lechBangGia,
    trangThai: trangThai(g('trangThai')),
    nhanLuc: Date.now(),
    daNhan: false,
  };

  if (!booking.maBooking) {
    canhBao.push('Không tìm thấy mã booking trong payload — đây là khoá chống trùng, ' +
      'thiếu nó thì mỗi lần OTA gửi lại là tạo thêm một dòng.');
  }

  booking.canXuLy = coCanXuLy(booking);
  return { booking, nguon, canhBao };
}

/* ==================================================== cột "cần xử lý" ==== */

/** Hôm nay theo giờ tour (UTC+7 mặc định), dạng YYYY-MM-DD. */
function homNay() {
  return new Date(Date.now() + cfg.tzOffsetHours * 3600000).toISOString().slice(0, 10);
}

const cachNgay = (a, b) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/**
 * Cờ "Thông tin cần xử lý" — thứ duy nhất chị cần đọc để biết booking nào phải
 * gọi khách. Đủ thông tin thì chỉ việc nhận rồi chạy tour.
 * Trả mảng { muc: 'cao'|'vua'|'ok', nhan } — server ghép thành chuỗi cho Base.
 */
function coCanXuLy(b) {
  const co = [];
  const dong = cfg.trangThaiDong.includes(b.trangThai);

  if (!dong) {
    if (!b.sdt) co.push({ muc: 'cao', nhan: '⚠️ Chưa có SĐT' });
    if (!b.diemDon) co.push({ muc: 'cao', nhan: '⚠️ Chưa có điểm đón' });
    if (!b.ngayDi) co.push({ muc: 'cao', nhan: '⚠️ Chưa có ngày đi' });
    if (!b.tenKhach) co.push({ muc: 'cao', nhan: '⚠️ Chưa có tên khách' });

    // Sát ngày mà vẫn chưa xác nhận thì phải gọi OTA, không chờ
    if (b.ngayDi && cfg.trangThaiChuaChot.includes(b.trangThai)) {
      const con = cachNgay(homNay(), b.ngayDi);
      if (con < 0) co.push({ muc: 'cao', nhan: '⚠️ Đã qua ngày đi mà chưa xác nhận' });
      else if (con <= 2) co.push({ muc: 'cao', nhan: '⚠️ Còn ' + con + ' ngày, chưa xác nhận' });
    }
    /* --- tiền: cờ nào bật phụ thuộc doanh thu lấy từ đâu --- */
    if (b.lechBangGia) {
      // cờ ĐỎ vì đây là tiền: OTA trả thiếu, hoặc map sai sản phẩm, hoặc bảng giá cũ
      const d = Math.abs(b.lechBangGia).toLocaleString('vi-VN');
      co.push({ muc: 'cao', nhan: b.lechBangGia > 0
        ? '⚠️ OTA trả THIẾU ' + d + 'đ so với bảng giá'
        : '⚠️ OTA trả cao hơn bảng giá ' + d + 'đ' });
    }
    if (b.bangGiaLoi === 'trung') {
      co.push({ muc: 'cao', nhan: '⚠️ Trùng nhiều sản phẩm trong bảng giá' });
    } else if (b.bangGiaLoi === 'khong-co-so-khach') {
      /* Có sản phẩm nhưng OTA chỉ gửi TỔNG số khách, không tách người lớn / trẻ em
       * — mà bảng giá hai mức giá khác nhau. Coi hết là người lớn thì tính vượt
       * tiền của khách, coi hết là trẻ em thì mình mất tiền: không đoán. */
      co.push({ muc: 'cao', nhan: '⚠️ Chưa tách người lớn / trẻ em' });
    } else if (b.bangGiaLoi && b.tour) {
      co.push({ muc: 'cao', nhan: '⚠️ Chưa map được sản phẩm trong bảng giá' });
    }
    /* Ngoại tệ chỉ còn là vấn đề khi KHÔNG lấy được giá từ bảng giá NET — có bảng
     * giá thì doanh thu đã là VNĐ chính xác, không cần quy đổi gì. */
    if (b.tienTe && b.tienTe !== 'VND' && b.nguonThucNhan !== 'bang-gia') {
      co.push({ muc: 'vua', nhan: '⚠️ Tiền ' + b.tienTe + ', chưa quy đổi' });
    }
    if (b.nguonThucNhan === 'uoc-tinh') {
      co.push({ muc: 'vua', nhan: '⚠️ Doanh thu ước tính theo %' });
    }
    // Không có bảng giá, không có số OTA, không có tổng tiền VNĐ ⇒ không có doanh thu
    if (b.thucNhan == null && b.tongTien != null) {
      co.push({ muc: 'cao', nhan: '⚠️ Chưa tính được doanh thu' });
    }
    /* Bảng giá tính trẻ em theo CHIỀU CAO (1m–1m4), OTA gửi theo TUỔI. Một bé 9
     * tuổi cao hơn 1m4 phải tính giá người lớn — app không suy ra được từ payload,
     * nên nhắc hướng dẫn viên đo tại điểm đón. */
    if ((b.treEm || 0) > 0) {
      co.push({ muc: 'vua', nhan: '⚠️ Trẻ em — xác nhận chiều cao 1m–1m4' });
    }
  }

  if (!co.length) co.push({ muc: 'ok', nhan: dong ? '— ' + b.trangThai : '✅ Đủ thông tin' });
  return co;
}

/** Mức nặng nhất trong danh sách cờ — dùng để sắp xếp và tô màu. */
function mucCanXuLy(co) {
  if (co.some((x) => x.muc === 'cao')) return 'cao';
  if (co.some((x) => x.muc === 'vua')) return 'vua';
  return 'ok';
}

const chuoiCanXuLy = (co) => co.map((x) => x.nhan).join(' · ');

module.exports = {
  chuanHoa, coCanXuLy, mucCanXuLy, chuoiCanXuLy,
  // xuất ra để test và để store.js dùng lại đúng một bộ quy tắc
  lamPhang, lay, soTien, soNguyen, lamTron, ngay, gio, dienThoai, chu, trangThai, thiTruong, khachTuMang,
  homNay, cachNgay, ALIAS, KENH_ALIAS,
};
