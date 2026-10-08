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
 * NƠI LƯU: bảng "Phạm vi báo cáo" trên Lark Base. Trước đây ghi vào
 * `du-lieu/pham-vi-bao-cao.json`, mà thư mục đó không lên git và đĩa Render bị
 * xoá mỗi lần deploy — nghĩa là mọi chỉnh sửa của trưởng phòng biến mất ở lần
 * deploy kế tiếp, lặng lẽ, không báo gì.
 *
 * Bản `MAC_DINH` dưới đây giữ lại làm NỀN: dựng theo mô tả của anh Hùng ngày
 * 05/10/2026, dùng để gieo bảng Base lần đầu, và để đỡ khi Base không đọc được.
 * Thêm người mới thì khai ở đây, lần nạp sau Base sẽ phủ lên phần đã sửa.
 */

const cfg = require('./config');
const lark = require('./lark');

const T = cfg.bang.phamVi;

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
    tenDang: ['Võ Hằng'],
    khoi: ['social', 'cong-viec', 'lich-tac-nghiep'],
    kenh: KENH_NOI_DUNG,
    loaiViec: null,
  },
  thu: {
    ten: 'Huỳnh Thị Anh Thư', viTri: 'Content',
    tenApp: ['Huỳnh Thị Anh Thư'],
    /* Tên trong plugin Người đăng khác tên trong bộ luật KPI — anh Hùng xác
     * nhận ngày 07/10/2026: "Phương Ái" là Thư, "Lý Thư Bạch" là Ngọc. KHÔNG
     * suy từ tên: hai bên không giống nhau một chữ nào. */
    tenDang: ['Phương Ái'],
    khoi: ['social', 'cong-viec', 'lich-tac-nghiep'],
    kenh: KENH_NOI_DUNG,
    loaiViec: null,
  },
  ngoc: {
    ten: 'Nguyễn Hồng Ngọc', viTri: 'Content',
    tenApp: ['Nguyễn Hồng Ngọc'],
    tenDang: ['Lý Thư Bạch'],
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

/* Bản khai đọc từ Base, giữ trong RAM. Mọi phép ĐỌC phải đồng bộ: tầng báo cáo
 * gọi `cua()` ở giữa vòng dựng số và `laCuaNguoi()` trong vòng lặp từng dòng —
 * biến chúng thành async là phải sửa cả chuỗi gọi, cho một bảng sáu dòng. Nên
 * nạp một lần lúc khởi động, rồi nạp lại sau mỗi lần lưu. */
let KHO = null;
let NGUON = 'mặc định';
let LOI = '';

/* Các cột danh sách lưu bằng TEXT, mỗi mục một dòng. Không dùng ô chọn nhiều:
 * thêm một khối mới trong mã sẽ phải nhớ thêm lựa chọn trên Base, quên một chỗ
 * là ghi hỏng mà không báo. */
const dong = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);
const viet = (a) => (Array.isArray(a) ? a.filter(Boolean).join('\n') : '');

const chu = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => (x && x.text) || x || '').join('');
  return typeof v === 'object' ? (v.text || '') : String(v);
};

/** Một dòng Base → bản khai. */
function tuDong(c) {
  const lay = (k) => chu(c[T.f[k]]);
  return {
    ten: lay('ten'),
    viTri: lay('viTri'),
    khoi: dong(lay('khoi')),
    kenh: dong(lay('kenh')),
    tenApp: dong(lay('tenApp')),
    loaiViec: dong(lay('loaiViec')),
    tenDang: dong(lay('tenDang')),
    nenTangQc: dong(lay('nenTangQc')),
  };
}

/** Bản khai → các ô của một dòng Base. */
function raDong(ma, pv) {
  const f = T.f;
  return {
    [f.ma]: ma,
    [f.ten]: String(pv.ten || ''),
    [f.viTri]: String(pv.viTri || ''),
    [f.khoi]: viet(pv.khoi),
    [f.kenh]: viet(pv.kenh),
    [f.tenApp]: viet(pv.tenApp),
    [f.loaiViec]: viet(pv.loaiViec),
    [f.tenDang]: viet(pv.tenDang),
    [f.nenTangQc]: viet(pv.nenTangQc),
    [f.capNhat]: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };
}

/** Gieo bản mặc định lên Base lần đầu, khi bảng còn trống. */
async function gieo() {
  await lark.createMany(T.id, Object.keys(MAC_DINH).map((ma) => raDong(ma, MAC_DINH[ma])));
}

/**
 * Nạp bản khai từ Base vào RAM. Gọi một lần lúc khởi động, trước khi mở cổng.
 *
 * Base hỏng thì rơi về bản mặc định trong mã — thà chạy với phạm vi gốc còn hơn
 * chặn sạch nhân sự khỏi tab Báo cáo. Nhưng phải NÓI RA là đang chạy bản mặc
 * định: lúc đó mọi chỉnh sửa của trưởng phòng không có hiệu lực, và im lặng thì
 * đúng là cái bẫy đã dính với bản ghi tệp.
 */
async function nap(lanHai) {
  if (!cfg.dungBase) { KHO = null; NGUON = 'mặc định'; return { nguon: NGUON }; }
  try {
    const rows = await lark.listAll(T.id);
    const ra = {};
    rows.forEach((r) => {
      const ma = chu((r.c || {})[T.f.ma]).trim();
      if (!ma) return;
      ra[ma] = { ...tuDong(r.c), _id: r.id };
    });
    /* Bảng trống (vừa tạo) thì gieo bản mặc định rồi đọc lại — để trống nghĩa là
     * không một nhân sự nào xem được tab Báo cáo. Chỉ thử MỘT lần: gieo hỏng mà
     * cứ gọi lại là vòng lặp vô tận. */
    if (!Object.keys(ra).length && !lanHai) {
      await gieo();
      return nap(true);
    }
    KHO = Object.keys(ra).length ? ra : null;
    NGUON = KHO ? 'base' : 'mặc định';
    LOI = '';
    return { nguon: NGUON, nguoi: Object.keys(ra).length };
  } catch (e) {
    KHO = null;
    NGUON = 'mặc định';
    LOI = 'Không đọc được bảng Phạm vi báo cáo: ' + e.message;
    return { nguon: NGUON, loi: LOI };
  }
}

/**
 * Bản khai đang dùng: mặc định trong mã làm nền, dòng Base phủ lên.
 * Giữ lớp nền để người mới khai trong mã vẫn có phạm vi ngay, chưa cần ai vào
 * Base bấm thêm dòng.
 */
function tatCa() {
  const ra = {};
  Object.keys(MAC_DINH).forEach((ma) => { ra[ma] = { ...MAC_DINH[ma] }; });
  if (KHO) Object.keys(KHO).forEach((ma) => { ra[ma] = { ...(ra[ma] || {}), ...KHO[ma] }; });
  return ra;
}

/** Đang đọc phạm vi từ đâu — giao diện phải nói ra khi còn chạy bản mặc định. */
const trangThai = () => ({ nguon: NGUON, loi: LOI, baseUrl: cfg.baseUrl, bang: T.id });

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
    /* Tên người này trong plugin "Người đăng" của app Social. Dùng để tách
     * phần bài CHÍNH NGƯỜI NÀY ĐĂNG ra khỏi số của cả kênh — ba người Content
     * dùng chung sáu kênh, không tách thì phiếu ai cũng giống nhau. */
    tenDang: pv.tenDang && pv.tenDang.length ? pv.tenDang : null,
  };
}

/**
 * Lưu bản sửa của một người xuống Base. Trả về bản khai mới của cả phòng.
 *
 * Ghi thẳng rồi nạp lại, không ghi đệm: bảng sáu dòng, một lượt ghi chưa tới
 * một giây, còn đệm thì sinh ra cảnh màn hình báo đã lưu mà Base chưa có —
 * với thứ quyết định ai xem được gì thì cảnh đó không chấp nhận được.
 */
async function luu(ma, pv) {
  if (!cfg.dungBase) throw new Error('Chưa nối Lark Base nên không lưu được phạm vi');
  const sach = (a) => (Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean) : []);
  const o = raDong(ma, {
    ten: pv.ten,
    viTri: pv.viTri,
    tenApp: sach(pv.tenApp),
    khoi: sach(pv.khoi).filter((k) => KHOI.some((x) => x.id === k)),
    kenh: sach(pv.kenh),
    tenDang: sach(pv.tenDang),
    loaiViec: sach(pv.loaiViec),
    nenTangQc: sach(pv.nenTangQc),
  });
  const cu = KHO && KHO[ma];
  if (cu && cu._id) await lark.updateMany(T.id, { [cu._id]: o });
  else await lark.createRecord(T.id, o);
  await nap();
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
  KHOI, KHOI_RIENG_QUAN_LY, MAC_DINH, nap, tatCa, cua, luu, choXem, laCuaNguoi,
  maTheoTen, trangThai,
};
