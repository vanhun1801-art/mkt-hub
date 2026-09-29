'use strict';
/**
 * ============================================================================
 * SỔ CẤU HÌNH GỐC — mọi Base, bảng, danh tính mặc định của cả hệ ở MỘT chỗ
 * ============================================================================
 * Trước 2026-09-29: 12 `config.js` mỗi file cắm cứng token Base và table id của
 * mình; open_id anh Hùng nằm ở 3 file; cùng một Base (Sản phẩm) được KOL và
 * Sản phẩm khai hai nơi. Đổi một Base là dò từng file, đổi App Lark là quản lý
 * bị tụt vai (docs/gop-ve-mot-app.md). Và tên biến môi trường `LARK_BASE_TOKEN`
 * mang SÁU nghĩa khác nhau ở sáu app — đặt nó trên Render (hub truyền env cho
 * mọi app con) là sáu app cùng trỏ vào một Base sai.
 *
 * Từ nay:
 *   - Mỗi Base có một TÊN và một biến env RIÊNG, dạng `MKT_BASE_<TEN>`; mỗi bảng
 *     là `MKT_BANG_<TEN>_<BANG>`. Không còn hai app hiểu một biến hai kiểu.
 *   - Tên biến CŨ của từng app (`LARK_BASE_TOKEN`, `OTA_BASE_TOKEN`, `LARK_TB_PHIEU`…)
 *     VẪN được nhận, nhưng chỉ khi app đó đọc — giữ nguyên cấu hình Render đang
 *     chạy, không phải đổi gì trong một đêm. Thứ tự ưu tiên: env mới → env cũ
 *     → mặc định ghi ở đây.
 *   - `config.js` của app chỉ còn `require('../lark-chung/cau-hinh')` rồi trỏ
 *     vào mục của mình; các thứ chỉ app đó quan tâm (field id, luật nghiệp vụ)
 *     vẫn ở lại config.js của app.
 *
 * QUY ƯỚC: mặc định ở đây là bản đang chạy THẬT (đối chiếu với từng config.js
 * ngày 2026-09-29). Đổi Base thì đổi ở đây, hoặc đặt env — đừng sửa config.js.
 */

const env = (...ten) => {
  for (const t of ten) {
    if (t && process.env[t] !== undefined && process.env[t] !== '') return process.env[t];
  }
  return undefined;
};

/**
 * Khai một Base. `cu` là danh sách tên env cũ (chỉ có nghĩa với app sở hữu).
 * Trả về { token, bang: { <ten>: id } }.
 */
function base(ten, macDinh, cu, bang) {
  const TEN = ten.toUpperCase().replace(/-/g, '_');
  const token = env('MKT_BASE_' + TEN, ...(cu || [])) || macDinh;
  const b = {};
  for (const [k, v] of Object.entries(bang || {})) {
    const [id, ...cuBang] = Array.isArray(v) ? v : [v];
    b[k] = env('MKT_BANG_' + TEN + '_' + k.toUpperCase(), ...cuBang) || id;
  }
  return { ten, token, bang: b };
}

/* ---------------------------------------------------------------------------
 * DANH TÍNH & NHÓM
 * ------------------------------------------------------------------------- */
/* open_id của một người KHÁC NHAU giữa các app Lark → mọi phân quyền mới nên
 * dùng EMAIL (LARK_MANAGER_EMAILS). open_id dưới đây là của anh Hùng dưới app
 * lark-cli trên máy anh; chỉ còn dùng làm mặc định cho chế độ cli. */
const NGUOI = {
  quanLyMacDinh: (env('MKT_QUAN_LY_IDS', 'LARK_MANAGER_IDS') || 'ou_f0d3514abf6b168bef076441f350c585')
    .split(',').map((s) => s.trim()).filter(Boolean),
  quanLyEmail: (env('MKT_QUAN_LY_EMAILS', 'LARK_MANAGER_EMAILS') || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  /* Quỹ chi phí: ai là chủ quỹ (mặc định = quản lý đầu tiên). */
  chuQuy: (env('MKT_CHU_QUY_IDS', 'LARK_CHU_QUY') || 'ou_f0d3514abf6b168bef076441f350c585')
    .split(',').map((s) => s.trim()).filter(Boolean),
};

const NHOM = {
  /* nhóm chat SỬA ẢNH — nơi app Chỉnh ảnh gửi báo cáo */
  suaAnh: env('MKT_NHOM_SUA_ANH', 'ANH_CHAT_ID') || 'oc_510640bcfd1063a51d32db0d58f95d72',
};

/* ---------------------------------------------------------------------------
 * CÁC BASE — mặc định là bản đang chạy thật ngày 2026-09-29
 * ------------------------------------------------------------------------- */
const BASE = {
  /* Bảng công việc (Tracking) — cũng là nguồn cho Báo cáo công việc, KPI, bot */
  tracking: base('tracking', 'JhZtbxv0gamk5ys3Fr0luHnsgwG', ['LARK_BASE_TOKEN_TRACKING'], {
    viec: ['tbl2ZBrfhXfmrsD4', 'LARK_TABLE_ID'],
    yeuCau: ['tblYblcwsjzEVaXM', 'LARK_REQ_TABLE_ID'],
    binhLuan: ['tbl5uA7zSY0TJMLq', 'LARK_CMT_TABLE_ID'],
    phanPhoiLuong: ['tbl4zkfB8QtBsRty', 'LARK_LUONG_TABLE_ID'],
    phanPhoiNguoi: ['tblT6RaebdLHW4st', 'LARK_PP_NGUOI_TABLE_ID'],
  }),

  lichTacNghiep: base('lich-tac-nghiep', 'U8bAbfnwgalWgDsEU11lpHfPgTb', ['LARK_BASE_TOKEN_LICH_TAC_NGHIEP'], {
    lich: ['tblwfl1sEXHI9HOp', 'LARK_TABLE_ID'],
    cauHinh: ['tblZrFGHjUuHMpWI', 'LARK_TB_CAUHINH'],
    cuaSo: ['tbl8TOoS3hQIhjPE', 'LARK_TB_CUASO'],
  }),

  quangCao: base('quang-cao', 'WmWvbjjFQaiRmjsd3Z7lumQXgeb', ['LARK_BASE_TOKEN_ADS'], {
    campaign: 'tblAjZnCNCkGU6jq',
    group: 'tblwz78ln8gTPwcH',
    ad: 'tblr1AYMHrkAQrrB',
    daily: 'tblzQQR2YmeHQrlN',
    product: 'tblZnZkaNPthl7WE',
    sales: 'tblpToZtyNw5SBov',
  }),

  bookingOta: base('booking-ota', 'XrMkbW5FPaQlHpsMSN8lQFO9geW', ['OTA_BASE_TOKEN'], {
    bookings: ['tblKNgLQEQVQKSRP', 'OTA_TABLE_ID'],
    danhMucOta: ['tblwRIAxRKKTo6W1', 'OTA_TABLE_OTA_ID'],
    danhMucTour: ['tbl9Wzl4ZvtDvKt7', 'OTA_TABLE_TOUR_ID'],
  }),

  social: base('social', 'YzgUbMS3PaE0B9sDtdIlNYzFgsc', ['SOCIAL_BASE_TOKEN'], {
    channel: 'tbltYMMxACW3NdMd',
    daily: 'tblB6lUB7YiFbAMR',
    post: 'tblnVpF5EuY6qbGQ',
    live: 'tblZU6tSd9ssNrxv',
    liveNgay: 'tblNR46RzBJ8BVhe',
    label: 'tbl7hTSAe9vTikii',
    alert: 'tblIBfXZ8OeJ3RXR',
    pending: 'tblNWDKia355rJ0e',
    log: 'tblwHw0DuyA1bW8t',
    vault: 'tblbn4fdhv34XdUP',
  }),

  kpi: base('kpi', 'E2nYbb69OaJxdVs0nGGlHTy5g0f', ['KPI_BASE_TOKEN'], {
    goc: 'tblDJLNyDWINb0yM',
    sua: 'tblHBolhcwm21ctw',
  }),

  chinhAnh: base('chinh-anh', 'OzF9bSPkPamYQHsNcU8lmMVQgFb', ['ANH_BASE_TOKEN'], {
    tour: 'tblUV3PEDZ4RrqGh',
    baoCao: 'tblPBDyAV8sOM1ne',
    nhatKy: 'tbluySEbuMes6IjA',
    caiDat: 'tblRHAgZLJFdATqT',
  }),

  quyChiPhi: base('quy-chi-phi', 'IQfUbtDDZacFdCsl657l9hOPged', ['LARK_BASE_TOKEN_QUY'], {
    chi: ['tblf4Rq9ei6Fp6A1', 'LARK_TB_CHI'],
    dot: ['tblsgGaO4NWnMYRV', 'LARK_TB_DOT'],
    nap: ['tblkfhu5isXjjFUy', 'LARK_TB_NAP'],
  }),

  baoCao: base('bao-cao', 'IqK1b8mdSapQaIsYhavlMMxzgQf', ['LARK_BASE_TOKEN_BAO_CAO'], {
    phieu: ['tblMIviEWyBXNTFz', 'LARK_TB_PHIEU'],
    dong: ['tblo5FBTVuXzv0W0', 'LARK_TB_DONG'],
  }),

  /* Thông tin sản phẩm — KOL cũng ĐỌC base này (mã + giá công bố) */
  sanPham: base('san-pham', 'N7CjbeUiXaq67LsmChtlUQBfgrc', ['SP_BASE_TOKEN'], {
    sp: 'tblrljpiBqDdz2Sj',
    gia: 'tblb0i6N8CkbU4WD',
    chinhSach: 'tblOfu9c38xmFJ1c',
    media: 'tblUgaFAj0VZ4Chj',
    lich: 'tblSjAgrKdYI1eLy',
    giaPax: 'tblgB57gdBQqplrU',
    nhatKy: 'tblmEGalXqAuwINs',
    ncc: 'tblbvsET4Dotknkl',
    nccGia: 'tblyag9jkAm9kd1W',
    gvBien: 'tblSRVk1Z0wQ8tIG',
    gvCauThanh: 'tbl2nhz4wmzWRGZX',
    gvBac: 'tblXWOfxI57PoHHw',
    nld: 'tblePlFlFJQ7tYsH',
    hinh: ['tblGGq3F2wBJsAh4', 'SP_HINH_TABLE'],
  }),

  lichLamViec: base('lich-lam-viec', 'VTqxbgjx1a5ZIMsyMQGlLjtQg6c', ['LARK_BASE_TOKEN_LICH_LAM_VIEC'], {
    dangKy: ['tblad6snuvuCzh8y', 'LARK_TB_DANG_KY'],
    nhanSu: ['tblskRVfDIva6zOO', 'LARK_TB_NHAN_SU'],
    ngayLe: ['tblBjsVdlOyRZup6', 'LARK_TB_NGAY_LE'],
    cauHinh: ['tbl5fTk4rFFzBRr8', 'LARK_TB_CAU_HINH'],
  }),

  kol: base('kol', 'TqOFbEdN9aEKyNsGk8qlpeKZgHh', ['LARK_BASE_TOKEN_KOL'], {
    kol: 'tblhdV3zWa0XX7Dg',
    kenh: 'tblzSYUtWaL6qSNL',
    dichVu: 'tbl0qf9HkIzuBOPh',
    hopTac: 'tblEuYzkcBAnp2ZZ',
    hangMuc: 'tblvye5QlAByhzzl',
    banGiao: 'tblP7Y3sp2cxRXjd',
    doiTac: 'tblLrDZOC6LnSHeY',
    caiDat: 'tblUdsrWcpDILwSl',
    thanhVien: 'tblUQfBikrBphiYo',
  }),
};

/**
 * `LARK_BASE_TOKEN` cũ: SÁU app từng đọc cùng tên biến này với sáu nghĩa. Giữ
 * tương thích: app nào gọi `baseCu(tenBase)` thì nhận LARK_BASE_TOKEN CHỈ KHI
 * biến đó được đặt riêng cho app đó (chạy lẻ), còn dưới hub thì hub KHÔNG
 * truyền biến này xuống nữa (xem lark-mkt-hub/children.js) — tránh sáu app
 * cùng trỏ một Base.
 */
function tokenCu(b) {
  return env('LARK_BASE_TOKEN') || b.token;
}

module.exports = { BASE, NGUOI, NHOM, env, tokenCu };
