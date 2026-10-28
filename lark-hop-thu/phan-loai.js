'use strict';
/**
 * Xếp thư vào ngăn bằng LUẬT: người gửi + tiêu đề. Hàm thuần, không gọi mạng,
 * để test được và để phần lớn thư không phải tốn một lượt AI.
 *
 * Bốn ngăn, xếp theo việc người đọc phải làm chứ không theo nguồn thư:
 *   xu-ly  Cần xử lý — đề xuất xin duyệt, thư hỏi cần trả lời
 *   sep    Sếp giao  — thư từ Ban giám đốc (giao việc, phản hồi đề xuất)
 *   biet   Để biết   — UNC, hoá đơn, đơn đặt dịch vụ, thông báo chung
 *   tu-dong Tự động  — mã xác nhận, thư quảng cáo, sự kiện, thư máy gửi
 *
 * Thứ tự ưu tiên: luật người dùng tự đặt > luật cài sẵn > AI > "xu-ly".
 * Thư không luật nào nhận mà chưa có AI thì vào "Cần xử lý": để sót một thư
 * cần duyệt trong ngăn "Để biết" tệ hơn nhiều so với chiều ngược lại.
 */

const NGAN = [
  { id: 'xu-ly', ten: 'Cần xử lý' },
  { id: 'sep', ten: 'Sếp giao' },
  { id: 'biet', ten: 'Để biết' },
  { id: 'tu-dong', ten: 'Tự động' },
];
const LA_NGAN = new Set(NGAN.map((n) => n.id));

const bo = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/* Luật cài sẵn. Mỗi luật: điều kiện trên { email, tieuDe (đã bỏ dấu) } → ngăn
 * kèm lý do để giao diện nói được vì sao thư nằm đây. */
function luatCaiSan(cfg) {
  const sep = new Set((cfg && cfg.sep) || []);
  return [
    {
      ten: 'Mã xác nhận',
      ngan: 'tu-dong',
      khop: (t) => /\b(otp|ma xac (nhan|thuc|minh)|ma dang nhap|xac minh (lan )?dang nhap|verification code|security code|login verification|account verification|mat khau mot lan|secure link)\b/.test(t.tieuDe),
    },
    {
      ten: 'Ban giám đốc',
      ngan: 'sep',
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
      ngan: 'xu-ly',
      khop: (t) => /\b(dat dich vu|service booking|booking moi|don booking moi|loi nhan moi)\b/.test(t.tieuDe) ||
        /бронирован/.test(t.tieuDe),
    },
    {
      ten: 'Thông báo chung',
      ngan: 'biet',
      khop: (t) => /^(thong bao|tb)\b/.test(t.tieuDeGoc) || /\[tb tu dong\]/.test(t.tieuDe),
    },
    {
      ten: 'Thư máy gửi',
      ngan: 'tu-dong',
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
 * Trả { ngan, nguon: 'tay'|'luat'|'ai'|'mac-dinh', lyDo }.
 */
function xep(thu, { cfg, tay = {}, ai = null, minh = [] } = {}) {
  const email = String((thu.tu && thu.tu.email) || '').toLowerCase();
  if (tay[email] && LA_NGAN.has(tay[email])) {
    return { ngan: tay[email], nguon: 'tay', lyDo: 'Luật anh đặt cho ' + email };
  }
  /* Thư tự gửi cho mình (bản đề xuất mình trình, bản lưu) không phải việc cần
   * làm. Đặt sau luật tay: ai muốn khác thì đặt luật cho chính địa chỉ đó. */
  if (minh.includes(email)) return { ngan: 'biet', nguon: 'luat', lyDo: 'Thư anh tự gửi' };
  const t = {
    email,
    tieuDe: bo(thu.tieuDe).replace(/^((tra loi|re|fw|fwd|chuyen tiep)\s*:\s*)+/g, ''),
    tieuDeGoc: bo(thu.tieuDe),
  };
  for (const l of luatCaiSan(cfg)) {
    if (l.khop(t)) return { ngan: l.ngan, nguon: 'luat', lyDo: l.ten };
  }
  if (ai && LA_NGAN.has(ai.ngan)) return { ngan: ai.ngan, nguon: 'ai', lyDo: 'AI xếp' };
  return { ngan: 'xu-ly', nguon: 'mac-dinh', lyDo: 'Chưa luật nào nhận' };
}

module.exports = { NGAN, LA_NGAN, xep, luatCaiSan, boDau: bo };
