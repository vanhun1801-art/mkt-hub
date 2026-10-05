'use strict';
/**
 * PHẠM VI BÁO CÁO CỦA TỪNG NGƯỜI.
 *
 * Tab Báo cáo trước đây chỉ trưởng phòng mở được. Nhân sự cũng cần thấy số của
 * mình — nhưng chỉ phần liên quan đến việc mình phụ trách, không phải cả bảng
 * chi phí và doanh thu toàn phòng.
 *
 * Module này giữ MỘT bản khai: ai thấy khối nào, kênh nào, loại việc nào. Tầng
 * báo cáo đọc bản khai rồi lọc ngay từ lúc gọi app con, chứ không gom đủ rồi
 * mới cắt — gom đủ thì số tổng đã trộn kênh của người khác vào, cắt sau không
 * gỡ ra được.
 *
 * KHỚP NGƯỜI BẰNG TÊN ĐẦY ĐỦ, TUYỆT ĐỐI KHÔNG KHỚP MỜ. Bảng công việc có cả
 * "Nguyễn Long Khánh (Pinky)" lẫn "Huỳnh Chí Khanh" — hai người khác nhau, 95
 * và 55 việc. Khớp theo "khanh" thì gộp việc của người này vào phiếu người kia.
 * Nên mỗi người phải khai thẳng những cái tên xuất hiện ở các app khác.
 *
 * Bản khai mặc định dưới đây dựng theo đúng mô tả của anh Hùng ngày 05/10/2026.
 * Trưởng phòng sửa được ở tab "Phân công kênh" và bản sửa ghi xuống tệp. Để
 * trong code làm MẶC ĐỊNH là cố ý: tệp `du-lieu/` không lên git và mất sau mỗi
 * lần deploy, nên nếu chỉ có tệp thì lên server chung mọi người mất sạch phạm
 * vi. Khi nào chuyển hẳn sang Base thì bỏ phần mặc định này đi.
 */

const fs = require('fs');
const path = require('path');

const TEP = path.join(__dirname, 'du-lieu', 'pham-vi-bao-cao.json');

/** Tất cả khối báo cáo có thể mở cho một người. */
const KHOI = [
  { id: 'social', ten: 'Social — bài đăng', mo: 'lượt xem, follower, tương tác theo kênh' },
  { id: 'live', ten: 'LIVE', mo: 'phiên phát trực tiếp' },
  { id: 'quang-cao', ten: 'Quảng cáo', mo: 'chi tiêu, chuyển đổi, ROAS' },
  { id: 'ota', ten: 'Booking OTA', mo: 'đơn và doanh thu các sàn' },
  { id: 'cong-viec', ten: 'Bảng công việc', mo: 'việc đến hạn và đã xong' },
  { id: 'lich-tac-nghiep', ten: 'Lịch tác nghiệp', mo: 'buổi tác nghiệp, giờ, địa điểm' },
  { id: 'chinh-anh', ten: 'Hậu kỳ — ảnh & video', mo: 'edit video, thiết kế, nghiệm thu' },
  { id: 'kol', ten: 'KOL', mo: 'bài KOL, lượt xem, chi phí' },
  { id: 'quy-chi-phi', ten: 'Quỹ chi phí', mo: 'các khoản chi' },
];

/* Khối CHỈ TRƯỞNG PHÒNG. Chi phí toàn phòng và tệp khách mới gom tiền của cả
 * phòng — mở cho nhân sự là để họ thấy lương và ngân sách của người khác. */
const KHOI_RIENG_QUAN_LY = ['chiPhi', 'tepMoi', 'xuHuong'];

const kenh = (nenTang, ten) => nenTang + '|' + ten;

/* Sáu kênh đội nội dung phụ trách — anh Hùng liệt kê ngày 05/10/2026. */
const KENH_NOI_DUNG = [
  kenh('Facebook', 'Rooty Trip Phú Quốc'),
  kenh('Facebook', 'Tour Đảo Rooty Trip Phú Quốc'),
  kenh('TikTok', 'Rooty Trip Phú Quốc'),
  kenh('TikTok', 'Cuộc sống tại Phú Quốc'),
  kenh('TikTok', 'Phú Quốc Không Phanh'),
  kenh('TikTok', 'Đi Phú Quốc cùng HDV vui tánh'),
];

const MAC_DINH = {
  khanh: {
    ten: 'Nguyễn Long Khánh', viTri: 'Editor & Livestream',
    tenApp: ['Nguyễn Long Khánh (Pinky)'],
    khoi: ['live', 'cong-viec'],
    /* `null` = mọi kênh. Khánh phụ trách LIVE cả Facebook lẫn TikTok. */
    kenh: null,
    loaiViec: ['Edit Video'],
  },
  hang: {
    ten: 'Võ Thị Cẩm Hằng', viTri: 'Content',
    tenApp: ['Hằng', 'Võ Hằng'],
    khoi: ['social', 'cong-viec', 'lich-tac-nghiep'],
    kenh: KENH_NOI_DUNG,
    loaiViec: null,
  },
  thu: {
    ten: 'Huỳnh Thị Anh Thư', viTri: 'Content',
    tenApp: ['Huỳnh Thị Anh Thư'],
    khoi: ['social', 'cong-viec', 'lich-tac-nghiep'],
    kenh: KENH_NOI_DUNG,
    loaiViec: null,
  },
  ngoc: {
    ten: 'Nguyễn Hồng Ngọc', viTri: 'Content',
    tenApp: ['Nguyễn Hồng Ngọc'],
    khoi: ['social', 'cong-viec', 'lich-tac-nghiep'],
    kenh: KENH_NOI_DUNG,
    loaiViec: null,
  },
  han: {
    ten: 'Phù Mỹ Hân', viTri: 'Website & OTA',
    tenApp: ['Hân Phù MKT'],
    khoi: ['ota', 'quang-cao', 'cong-viec'],
    kenh: null,
    loaiViec: null,
    /* Chỉ Google Ads trong khối Quảng cáo — Hân lo website và sàn, không chạy
     * quảng cáo Facebook hay TikTok. */
    nenTangQc: ['Google Ads'],
  },
  truong: {
    ten: 'Danh Minh Trường', viTri: 'Editor & Chỉnh ảnh & Thiết kế',
    tenApp: ['Danh Minh Trường'],
    khoi: ['chinh-anh', 'cong-viec'],
    kenh: null,
    loaiViec: ['Thiết kế', 'Edit Video'],
  },
};

const docTep = () => {
  try { return JSON.parse(fs.readFileSync(TEP, 'utf8')); } catch (_) { return {}; }
};

function ghiTep(d) {
  fs.mkdirSync(path.dirname(TEP), { recursive: true });
  fs.writeFileSync(TEP, JSON.stringify(d, null, 2), 'utf8');
}

/** Bản khai đang dùng: mặc định trong code, phủ bằng bản sửa trong tệp. */
function tatCa() {
  const sua = docTep();
  const ra = {};
  Object.keys(MAC_DINH).forEach((ma) => { ra[ma] = { ...MAC_DINH[ma] }; });
  Object.keys(sua).forEach((ma) => { ra[ma] = { ...(ra[ma] || {}), ...sua[ma] }; });
  return ra;
}

/**
 * Phạm vi của một người, dạng tầng báo cáo dùng được.
 * Trả `null` khi chưa khai — gọi là CHƯA KHAI, không phải "không được xem gì":
 * hai chuyện đó khác nhau và giao diện phải nói khác nhau.
 */
function cua(ma) {
  if (!ma) return null;
  const pv = tatCa()[ma];
  if (!pv) return null;
  return {
    ma,
    ten: pv.ten || ma,
    viTri: pv.viTri || '',
    /* Tên dùng để khớp owner ở các app khác. Luôn gồm cả tên chính, vì có app
     * ghi tên đầy đủ còn app khác ghi tên rút gọn. */
    tenApp: [...new Set([...(pv.tenApp || []), pv.ten].filter(Boolean))],
    khoi: pv.khoi || [],
    kenh: pv.kenh && pv.kenh.length ? pv.kenh : null,
    loaiViec: pv.loaiViec && pv.loaiViec.length ? pv.loaiViec : null,
    nenTangQc: pv.nenTangQc && pv.nenTangQc.length ? pv.nenTangQc : null,
  };
}

/** Lưu bản sửa của một người. Trả về bản khai mới của cả phòng. */
function luu(ma, pv) {
  const sua = docTep();
  sua[ma] = {
    ten: pv.ten,
    viTri: pv.viTri,
    tenApp: Array.isArray(pv.tenApp) ? pv.tenApp.filter(Boolean) : [],
    khoi: Array.isArray(pv.khoi) ? pv.khoi.filter((k) => KHOI.some((x) => x.id === k)) : [],
    kenh: Array.isArray(pv.kenh) ? pv.kenh.filter(Boolean) : null,
    loaiViec: Array.isArray(pv.loaiViec) ? pv.loaiViec.filter(Boolean) : null,
    nenTangQc: Array.isArray(pv.nenTangQc) ? pv.nenTangQc.filter(Boolean) : null,
  };
  ghiTep(sua);
  return tatCa();
}

/**
 * Tìm mã người từ TÊN mà hub gửi xuống.
 *
 * Trước đây app chỉ tra được qua biến môi trường `KPI_MA_NGUOI` — mà biến đó
 * chưa khai, nên mọi nhân sự đều ra mã rỗng và không ai xem được phiếu của
 * mình. Bản khai phạm vi đã có sẵn tên đầy đủ của từng người để khớp owner ở
 * các app khác; dùng luôn nó, khỏi phải khai hai chỗ.
 *
 * Khớp ĐÚNG TUYỆT ĐỐI, không chứa, không bỏ dấu. Nhầm một người ở đây là mở
 * phiếu của người này cho người kia xem.
 */
function maTheoTen(ten) {
  const s = String(ten || '').trim();
  if (!s) return '';
  const ds = tatCa();
  const hop = Object.keys(ds).filter((ma) => {
    const pv = ds[ma];
    return [...(pv.tenApp || []), pv.ten].filter(Boolean).some((x) => String(x).trim() === s);
  });
  /* Hai người cùng một tên thì KHÔNG đoán — trả rỗng để màn hình báo chưa khai,
   * còn hơn mở nhầm phiếu. */
  return hop.length === 1 ? hop[0] : '';
}

/** Người này có được xem khối `id` không. */
const choXem = (pv, id) => !pv || pv.khoi.includes(id);

/** Tên `t` có phải của người này không — so KHỚP ĐÚNG, không chứa, không mờ. */
function laCuaNguoi(pv, t) {
  if (!pv) return true;
  const s = String(t || '').trim();
  return pv.tenApp.some((x) => x.trim() === s);
}

module.exports = {
  KHOI, KHOI_RIENG_QUAN_LY, MAC_DINH, tatCa, cua, luu, choXem, laCuaNguoi,
  maTheoTen, TEP,
};
