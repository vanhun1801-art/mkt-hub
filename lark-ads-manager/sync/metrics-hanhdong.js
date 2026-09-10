'use strict';
/**
 * Xếp thứ tự bảng "chi tiết hành động chuyển đổi".
 *
 * Tách ra file riêng vì đây là một QUYẾT ĐỊNH NGHIỆP VỤ, không phải mã hiển thị:
 * nhóm nào gần tiền hơn thì lên trên. Để trong tệp giao diện thì lần sau muốn đổi
 * phải đi dò trong đám HTML.
 *
 * Vì sao không xếp theo số: Facebook trả "Tương tác trang 105.951" và "Xem video
 * 97.863" đứng đầu, còn "Bắt đầu nhắn tin 1.221" tụt xuống hàng thứ tám. Một lượt
 * bắt đầu nhắn tin có thể thành đơn; một lượt xem video thì không. Xếp theo số là
 * để cái nhiều nhấn chìm cái đáng tiền.
 */

/* Càng nhỏ càng lên trên. Tên nhóm gồm cả của Google Ads (chữ hoa, gạch dưới) và
 * của Meta (do nhomHanhDong() của sync/meta.js đặt). */
const THU_TU_NHOM = {
  PURCHASE: 0, 'MUA HÀNG': 0,
  SUBMIT_LEAD_FORM: 1, 'LIÊN HỆ': 1, CONTACT: 1, PHONE_CALL_LEAD: 1,
  'NHẮN TIN': 2,
  BEGIN_CHECKOUT: 3, ADD_TO_CART: 3,
  'TRUY CẬP': 4, PAGE_VIEW: 4, DOWNLOAD: 4, SIGNUP: 4,
  'XEM VIDEO': 6,
  ENGAGEMENT: 7, 'TƯƠNG TÁC': 7, DEFAULT: 8,
};

/** Nhóm chưa biết thì xếp giữa: không giành chỗ của nhóm gần tiền, cũng không bị vùi. */
const CHUA_BIET = 5;

const hangNhom = (nhom) => {
  const k = String(nhom || '').trim();
  if (k in THU_TU_NHOM) return THU_TU_NHOM[k];
  return CHUA_BIET;
};

/**
 * Xếp danh sách hành động: nhóm gần tiền lên trên, trong nhóm thì số lớn lên trên.
 * KHÔNG lọc bỏ dòng nào — bỏ dòng là tổng không khớp và không ai biết vì sao.
 */
function xepHanhDong(rows) {
  return [...(rows || [])].sort((a, b) => {
    const d = hangNhom(a.nhom) - hangNhom(b.nhom);
    if (d) return d;
    return (Number(b.so) || 0) - (Number(a.so) || 0);
  });
}

/* Tiền tố "bề mặt" của Meta. Cùng một sự kiện được báo lại dưới từng bề mặt, nên
 * bỏ tiền tố đi là ra tên gốc. Xếp dài trước ngắn: bỏ `onsite_web_app_` trước
 * `onsite_web_`, nếu không thì cái ngắn khớp trước và còn sót `app_`. */
const TIEN_TO_BE_MAT = [
  'onsite_conversion.', 'onsite_web_app_', 'onsite_web_', 'onsite_app_',
  'offsite_conversion.fb_pixel_', 'offsite_', 'omni_', 'web_', 'app_',
];

/* Vài cặp Meta gọi khác nhau cho cùng một việc. */
const DONG_NGHIA = {
  initiated_checkout: 'initiate_checkout',
  purchases: 'purchase',
  leads: 'lead',
  lead_grouped: 'lead',
};

/* Đuôi Meta gắn thêm khi báo lại CÙNG một sự kiện dưới tên sự kiện pixel khác.
 * Đo thật: năm dòng cùng 118 — onsite_web_lead, lead_grouped, và ba dòng
 * offsite_*_add_meta_leads. Tất cả là cùng 118 khách tiềm năng. */
const DUOI_BI_DANH = [
  { duoi: '_add_meta_leads', ve: 'lead' },
];

/** Tên gốc của một mã hành động, sau khi bỏ tiền tố bề mặt và đuôi bí danh. */
function tenGoc(ma) {
  let s = String(ma || '').trim().toLowerCase();
  for (const { duoi, ve } of DUOI_BI_DANH) {
    if (s.endsWith(duoi)) return ve;
  }
  let doi = true;
  while (doi) {
    doi = false;
    for (const t of TIEN_TO_BE_MAT) {
      if (s.startsWith(t)) { s = s.slice(t.length); doi = true; break; }
    }
  }
  return DONG_NGHIA[s] || s;
}

/**
 * Gom các bí danh của cùng một sự kiện về MỘT dòng.
 *
 * Lấy giá trị LỚN NHẤT trong nhóm, không cộng: cộng là nhân số lên đúng như cái
 * đang muốn sửa. Tên rộng nhất (`omni_*` = mọi bề mặt) vốn đã bao trọn các tên hẹp.
 *
 * Giữ lại danh sách bí danh trong `biDanh` để không có gì bị ẩn đi — người đọc bấm
 * vào vẫn tra được, và tổng vẫn kiểm được.
 *
 * Chỉ gom khi tên gốc GIỐNG nhau. Không gom theo con số: "Bắt đầu nhắn tin 1.221"
 * và "Hội thoại có trả lời 1.221" bằng nhau nhưng là hai sự kiện khác nhau.
 */
function gomTrungLap(rows, tenTheoGoc = null) {
  const gom = new Map();
  (rows || []).forEach((r) => {
    const goc = tenGoc(r.ma || r.ten);
    const cu = gom.get(goc);
    const so = Number(r.so) || 0;
    if (!cu) {
      /* Tên hiện ra tra theo TÊN GỐC, không theo bí danh nào tình cờ đã được dịch.
       * `initiate_checkout` có trong bảng dịch, nhưng ba bí danh Meta trả về đều
       * KHÔNG trùng tên gốc — nên nếu chờ bí danh thì bảng hiện mã máy. */
      const tenGocDich = tenTheoGoc ? tenTheoGoc(goc) : '';
      gom.set(goc, { ...r, so, ten: tenGocDich || r.ten, biDanh: [r.ma || r.ten] });
      return;
    }
    cu.biDanh.push(r.ma || r.ten);
    if (so > cu.so) cu.so = so;
    /* Giữ cái tên ĐỌC ĐƯỢC: tên đã dịch (khác mã) hơn mã máy. Nếu cả hai đều là
     * mã thì giữ cái ngắn hơn — nó thường là tên gốc, không mang tiền tố. */
    if (tenTheoGoc && tenTheoGoc(goc)) return;   // đã có tên gốc đã dịch, khỏi đổi
    const daDich = (x) => x.ten && x.ma && x.ten !== x.ma;
    if (daDich(r) && !daDich(cu)) cu.ten = r.ten;
    else if (!daDich(cu) && String(r.ten).length < String(cu.ten).length) cu.ten = r.ten;
  });
  return [...gom.values()];
}

module.exports = { xepHanhDong, hangNhom, gomTrungLap, tenGoc,
  THU_TU_NHOM, CHUA_BIET, TIEN_TO_BE_MAT, DUOI_BI_DANH };
