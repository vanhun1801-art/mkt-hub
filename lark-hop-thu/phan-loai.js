'use strict';
/**
 * Xếp thư vào ngăn bằng LUẬT: người gửi + tiêu đề. Hàm thuần, không gọi mạng,
 * để test được và để phần lớn thư không phải tốn một lượt AI.
 *
 * Ba ngăn, xếp theo việc người đọc phải làm chứ không theo nguồn thư
 * (anh Hùng 28/10/2026: bốn ngăn cũ "không biết phải làm gì"):
 *   xu-ly  Cần trả lời   — thư người thật viết: đề xuất, Ban giám đốc, khách hỏi
 *   don    Đơn khách đặt — form đặt dịch vụ trên web, booking mới của khách sạn
 *   biet   Chỉ để đọc    — UNC, hoá đơn, thông báo, mã xác nhận, thư máy gửi
 * Thư Ban giám đốc nằm trong "Cần trả lời" và mang cờ `sep` để giao diện gắn nhãn.
 *
 * Thứ tự ưu tiên: luật người dùng tự đặt > luật cài sẵn > AI > "xu-ly".
 * Thư không luật nào nhận mà chưa có AI thì vào "Cần trả lời": để sót một thư
 * cần duyệt trong ngăn "Chỉ để đọc" tệ hơn nhiều so với chiều ngược lại.
 */

const NGAN = [
  { id: 'xu-ly', ten: 'Cần trả lời' },
  { id: 'don', ten: 'Đơn khách đặt' },
  { id: 'biet', ten: 'Chỉ để đọc' },
];
const LA_NGAN = new Set(NGAN.map((n) => n.id));
/* Ngăn của bản cũ còn nằm trong luật tay và bộ đệm AI đã lưu. */
const NGAN_CU = { sep: 'xu-ly', 'tu-dong': 'biet' };
const chuan = (id) => (LA_NGAN.has(id) ? id : NGAN_CU[id] || '');

const bo = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/* Luật cài sẵn. Mỗi luật: điều kiện trên { email, tieuDe (đã bỏ dấu) } → ngăn
 * kèm lý do để giao diện nói được vì sao thư nằm đây. */
function luatCaiSan(cfg) {
  const sep = new Set((cfg && cfg.sep) || []);
  return [
    {
      ten: 'Mã xác nhận',
      ngan: 'biet',
      khop: (t) => /\b(otp|ma xac (nhan|thuc|minh)|ma dang nhap|xac minh (lan )?dang nhap|verification code|security code|login verification|account verification|mat khau mot lan|secure link)\b/.test(t.tieuDe),
    },
    {
      ten: 'Ban giám đốc',
      ngan: 'xu-ly',
      khop: (t) => sep.has(t.email),
    },
    {
      ten: 'Đề xuất xin duyệt',
      ngan: 'xu-ly',
      khop: (t) => /\b(de xuat|phe duyet|xin duyet|trinh duyet|xin y kien|can phan hoi|xac nhan va phe duyet)\b/.test(t.tieuDe),
    },
    {
      ten: 'Chứng từ, hoá đơn',
      ngan: 'biet',
      khop: (t) => /\b(gui unc|uy nhiem chi|phieu chi|hoa don dien tu|e-?invoice|bien lai)\b/.test(t.tieuDe),
    },
    {
      /* Tourwell gửi bản lưu đơn và UNC nội bộ: đơn đã nằm trong Tourwell. */
      ten: 'Bản lưu Tourwell',
      ngan: 'biet',
      khop: (t) => /@tourwell\.vn$/.test(t.email),
    },
    {
      /* Form đặt dịch vụ trên website, booking mới của khách sạn: khách đang
       * chờ người liên hệ lại. */
      ten: 'Khách đặt dịch vụ',
      ngan: 'don',
      khop: (t) => /\b(dat dich vu|service booking|booking moi|don booking moi|loi nhan moi)\b/.test(t.tieuDe) ||
        /бронирован/.test(t.tieuDe),
    },
    {
      /* Thư tự động của nền tảng đặt phòng, quảng cáo, mạng xã hội: không ai
       * chờ người nhận trả lời. Booking mới đã được luật "Khách đặt dịch vụ"
       * ở trên nhận trước. Xếp sau "Đề xuất xin duyệt" để đối tác thật viết
       * từ gmail không bị nhầm. */
      ten: 'Thư từ nền tảng',
      ngan: 'biet',
      khop: (t) => /@([\w-]+\.)*(expedia(group)?|trip|ctrip|agoda|booking|airbnb|traveloka|klook|google|youtube|facebookmail|meta|instagram|tiktok|bytedance|zalo|larksuite|feishu|gohost|hotelia|mustgo|linkedin|canva|shopee|lazada)\.(com|vn|net|io)$/.test(t.email),
    },
    {
      ten: 'Thông báo chung',
      ngan: 'biet',
      khop: (t) => /^(thong bao|tb)\b/.test(t.tieuDeGoc) || /\[tb tu dong\]/.test(t.tieuDe),
    },
    {
      ten: 'Thư máy gửi',
      ngan: 'biet',
      /* Tìm trong phần trước @: "ads-account-noreply@", "noreply-ebooking@",
       * "automated@airbnb.com" đều là máy gửi. */
      khop: (t) => /(no-?reply|do-?not-?reply|automated|notifications?|mailer-daemon|newsletter|feedback|discover)/
        .test(t.email.split('@')[0]),
    },
  ];
}

/**
 * Xếp một thư. `tay` = luật người dùng đặt theo địa chỉ gửi ({ email: ngan }),
 * `ai` = kết quả AI đã có trong bộ đệm (có thể rỗng).
 * Trả { ngan, nguon: 'tay'|'luat'|'ai'|'mac-dinh', lyDo, sep }.
 * `sep` = thư từ Ban giám đốc, để giao diện gắn nhãn.
 */
function xep(thu, opts = {}) {
  const email = String((thu.tu && thu.tu.email) || '').toLowerCase();
  const sep = new Set((opts.cfg && opts.cfg.sep) || []).has(email);
  return Object.assign(xepNgan(thu, email, opts), { sep });
}

function xepNgan(thu, email, { cfg, tay = {}, ai = null, minh = [] }) {
  if (chuan(tay[email])) {
    return { ngan: chuan(tay[email]), nguon: 'tay', lyDo: 'Luật anh đặt cho ' + email };
  }
  /* Thư tự gửi cho mình (bản đề xuất mình trình, bản lưu) không phải việc cần
   * làm. Đặt sau luật tay: ai muốn khác thì đặt luật cho chính địa chỉ đó. */
  if (minh.includes(email)) return { ngan: 'biet', nguon: 'luat', lyDo: 'Thư anh tự gửi' };
  const t = {
    email,
    tieuDe: bo(thu.tieuDe).replace(/^((tra loi|re|fw|fwd|chuyen tiep)\s*:\s*)+/g, ''),
    tieuDeGoc: bo(thu.tieuDe),
  };
  if (thu.rac) return xepRac(thu, t, cfg);
  for (const l of luatCaiSan(cfg)) {
    if (l.khop(t)) return { ngan: l.ngan, nguon: 'luat', lyDo: l.ten };
  }
  if (ai && chuan(ai.ngan)) return { ngan: chuan(ai.ngan), nguon: 'ai', lyDo: 'AI xếp' };
  return { ngan: 'xu-ly', nguon: 'mac-dinh', lyDo: '' };
}

/* Tên hiển thị mạo danh một hãng lớn mà địa chỉ gửi không thuộc hãng đó
 * ("MetaAdsSupport <x@n.tinhochay.org>", "TenTen Vn <ambul@roliambulance.be>"). */
const TEN_HANG = /\b(meta|facebook|instagram|google|tiktok|zalo|apple|microsoft|paypal|openai|tenten|ngan hang|bank)|support|copyright|policy|verification/;
const MIEN_HANG = /@([\w-]+\.)*(meta|facebook|facebookmail|instagram|google|tiktok|zalo|apple|microsoft|paypal|openai|tenten)\.(com|vn|me|net)$/;
/* Khách hay đối tác hỏi dịch vụ: thứ Lark hay xếp nhầm vào Thư rác. */
const KHACH_HOI = /\b(quot(e|ation)|bao gia|hoi gia|booking|reservation|dat (tour|phong|ve|xe)|inquir(y|ies)|enquir(y|ies)|request (for|a)|tour|trip|lich trinh|itinerary|transfer|cable car|cap treo|snorkel)/;

/**
 * Thư Lark xếp vào Thư rác. Không theo mặc định "Cần trả lời" như thư thường:
 * rác thật (chào hàng, lừa đảo) rất nhiều. Chỉ thư có dấu hiệu khách hỏi mới
 * vào "Cần trả lời"; thư mạo danh hãng lớn và phần còn lại vào "Chỉ để đọc".
 * Giao diện gắn nhãn "Thư rác" và nhắc kiểm người gửi.
 */
function xepRac(thu, t, cfg) {
  const ten = bo(thu.tu && thu.tu.ten);
  if (TEN_HANG.test(ten) && !MIEN_HANG.test(t.email)) return { ngan: 'biet', nguon: 'luat', lyDo: 'Thư rác mạo danh' };
  if (KHACH_HOI.test(t.tieuDe)) return { ngan: 'xu-ly', nguon: 'luat', lyDo: 'Thư rác có thể là khách hỏi' };
  for (const l of luatCaiSan(cfg)) {
    if (l.khop(t)) return { ngan: l.ngan, nguon: 'luat', lyDo: l.ten };
  }
  return { ngan: 'biet', nguon: 'luat', lyDo: 'Thư rác' };
}

module.exports = { NGAN, LA_NGAN, xep, luatCaiSan, chuanNgan: chuan, boDau: bo };
