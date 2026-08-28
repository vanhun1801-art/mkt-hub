'use strict';
/**
 * VỊ TRÍ CÔNG VIỆC — mẫu quyền theo vị trí, để không phải tick tay từng người.
 *
 * Phòng có nhiều vị trí (Editor, Content, Designer, chỉnh ảnh, Media, Website,
 * Ads, KOL…). Mỗi vị trí có một bộ quyền mặc định; quản lý chọn vị trí cho một
 * người là các ô tự tick theo mẫu, sau đó vẫn sửa tay được cho từng trường hợp.
 *
 * `base` là id module trong modules.json. Base nào KHÔNG có trong danh sách thì
 * vị trí đó không thấy — thêm base mới thì nhớ khai vào đây, nếu không chỉ quản lý
 * và người được khai tay mới thấy.
 *
 * Đổi mà không cần sửa code: đặt biến môi trường HUB_VI_TRI_JSON bằng cả mảng này.
 */
const MOI_BASE = ['cong-viec', 'lich-tac-nghiep', 'quang-cao'];
const VIEC_LICH = ['cong-viec', 'lich-tac-nghiep'];

const MAC_DINH = [
  { ten: 'Quản lý',   base: MOI_BASE,  vai: 'Quản lý', toanBo: true,  taoMoi: true,  chiPhi: true,
    mo: 'Toàn quyền: mọi base, mọi số liệu' },
  { ten: 'Ads',       base: MOI_BASE,  toanBo: false, taoMoi: true,  chiPhi: true,
    mo: 'Chạy quảng cáo: thêm base Quản lý quảng cáo và số tiền' },
  { ten: 'Content',   base: VIEC_LICH, toanBo: false, taoMoi: true,  chiPhi: false,
    mo: 'Viết nội dung: việc của mình + lịch tác nghiệp' },
  { ten: 'Editor',    base: VIEC_LICH, toanBo: false, taoMoi: true,  chiPhi: false,
    mo: 'Dựng video: việc của mình + lịch tác nghiệp' },
  { ten: 'Designer',  base: VIEC_LICH, toanBo: false, taoMoi: true, chiPhi: false,
    mo: 'Thiết kế: việc của mình + lịch tác nghiệp' },
  { ten: 'Chỉnh ảnh', base: VIEC_LICH, toanBo: false, taoMoi: false, chiPhi: false,
    mo: 'Hậu kỳ ảnh: chỉ nhận việc, không tạo việc mới' },
  { ten: 'Media',     base: VIEC_LICH, toanBo: false, taoMoi: true,  chiPhi: false,
    mo: 'Quay/chụp: việc của mình + lịch tác nghiệp' },
  { ten: 'Website',   base: VIEC_LICH, toanBo: false, taoMoi: true, chiPhi: false,
    mo: 'Website: việc của mình + lịch tác nghiệp' },
  { ten: 'KOL',       base: VIEC_LICH, toanBo: false, taoMoi: true,  chiPhi: false,
    mo: 'Booking KOL: việc của mình + lịch tác nghiệp' },
  { ten: 'Khác',      base: VIEC_LICH, toanBo: false, taoMoi: true, chiPhi: false,
    mo: 'Chưa xếp vị trí: việc của mình + lịch tác nghiệp' },
];

function docDanhSach() {
  const raw = process.env.HUB_VI_TRI_JSON;
  if (!raw) return MAC_DINH;
  try {
    const ds = JSON.parse(raw);
    if (Array.isArray(ds) && ds.length && ds.every((x) => x && x.ten)) return ds;
  } catch (_) { /* khai sai thì dùng mặc định, đừng làm sập app */ }
  return MAC_DINH;
}

/** Mẫu quyền của một vị trí, hoặc null nếu không có vị trí đó. */
function mauCua(ten) {
  const t = String(ten || '').trim().toLowerCase();
  if (!t) return null;
  return docDanhSach().find((x) => x.ten.toLowerCase() === t) || null;
}

module.exports = { docDanhSach, mauCua };
