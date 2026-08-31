'use strict';
/**
 * Cấu hình app "Booking OTA" — nhận booking từ các kênh OTA rồi tự ghi vào Lark Base.
 *
 * KHÁC ba app kia một điểm quan trọng: base OTA chưa tồn tại lúc viết code, nên ở
 * đây KHÔNG hardcode field ID. App dò field ID theo TÊN CỘT lúc chạy (schema.js) —
 * đúng nguyên tắc "không đoán ID" của repo, mà vẫn chạy được ngay từ hôm nay.
 *
 * Chưa nối base thì app vẫn nhận webhook và lưu vào hàng đợi cục bộ, không mất
 * booking nào; nối base xong bấm "Đẩy hàng đợi vào Base" là chuyển hết sang Base.
 */
const path = require('path');

const npmRoot = process.env.LARK_NPM_ROOT ||
  path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData/Roaming'), 'npm/node_modules');

/** Đọc JSON trong biến môi trường, hỏng thì trả mặc định (không làm app chết lúc boot). */
function envJson(ten, macDinh) {
  const raw = process.env[ten];
  if (!raw || !raw.trim()) return macDinh;
  try { return JSON.parse(raw); } catch (e) {
    console.warn('[config] ' + ten + ' không phải JSON hợp lệ — dùng mặc định. ' + e.message);
    return macDinh;
  }
}

/* ------------------------------------------------------------------
 * 7 kênh OTA. `id` dùng trong URL webhook: POST /webhook/<id>
 * `ten` là giá trị ghi vào cột select "Kênh OTA" của Base.
 * `hoaHong` là % hoa hồng mặc định, CHỈ dùng khi OTA không trả số hoa hồng thật
 * (khi đó app đánh dấu là số ước tính, không trộn lẫn với số thật).
 * ------------------------------------------------------------------ */
/* % hoa hồng theo hợp đồng của Rooty Trip với từng kênh (2026). Đây là phần OTA
 * GIỮ LẠI, nên doanh thu thực nhận = tổng tiền − hoa hồng. */
const KENH_MAC_DINH = [
  { id: 'klook',      ten: 'Klook',        hoaHong: 15 },
  { id: 'kkday',      ten: 'KKday',        hoaHong: 15 },
  { id: 'gyg',        ten: 'GetYourGuide', hoaHong: 30 },
  { id: 'ctrip',      ten: 'Ctrip',        hoaHong: 20 },
  { id: 'waug',       ten: 'WAUG',         hoaHong: 15 },
  { id: 'myrealtrip', ten: 'MyRealTrip',   hoaHong: 10 },
  { id: 'viator',     ten: 'Viator',       hoaHong: 22 },
];

/* Đổi % bằng env khi hợp đồng đổi, KHÔNG cần sửa code:
 * OTA_RATES_JSON={"gyg":28,"viator":20} — kênh nào không khai thì giữ số ở trên. */
const rates = envJson('OTA_RATES_JSON', {});
const kenh = KENH_MAC_DINH.map((k) => ({
  ...k,
  hoaHong: Number.isFinite(Number(rates[k.id])) ? Number(rates[k.id]) : k.hoaHong,
}));

module.exports = {
  port: Number(process.env.PORT || 5177),
  identity: process.env.LARK_IDENTITY || 'user',

  /* cli: dùng phiên lark-cli của máy · api: gọi Open API bằng app credentials */
  mode: process.env.LARK_MODE ||
    ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',

  cliScript: process.env.LARK_CLI_SCRIPT ||
    path.join(npmRoot, '@larksuite/cli/scripts/run.js'),

  /* Base chứa bảng booking OTA (Rooty Trip · 2026).
   * Token là đoạn giữa /base/ và ?table= trong URL. Ghi đè bằng env khi cần. */
  baseToken: process.env.OTA_BASE_TOKEN || 'XrMkbW5FPaQlHpsMSN8lQFO9geW',

  /* ID bảng booking. Base này đã có sẵn và đang chạy thật (33 booking nhập tay),
   * nên ID dưới là ID THẬT của bảng "Bookings", không phải phỏng đoán.
   * ID đọc từ URL Base có thể là dạng `blk...` (bảng nằm trong một block) mà API
   * bản ghi không nhận — schema.js vẫn KIỂM TRA ID này trước rồi mới tin, khai
   * sai thì nó dò lại theo TÊN BẢNG. */
  tableId: process.env.OTA_TABLE_ID || 'tblKNgLQEQVQKSRP',

  get baseUrl() {
    if (!this.baseToken) return '';
    return 'https://rootytrip2.sg.larksuite.com/base/' + this.baseToken +
      (this.tableId ? '?table=' + this.tableId : '');
  },

  /* Tên bảng — dùng để dò lại table ID khi ID khai ở trên không dùng được.
   * `biBang` là các tên gọi khác cũng chấp nhận. KHÔNG để token cụt kiểu 'ota' ở
   * đây: base còn hai bảng danh mục tên "Danh mục OTA" / "Danh mục Tour", dò lỏng
   * tay là bám nhầm vào bảng danh mục rồi báo "thiếu hết cột". */
  tableName: process.env.OTA_TABLE_NAME || 'Bookings',
  biBang: ['Booking', 'Booking OTA', 'Đơn OTA'],

  /* ---- hai bảng danh mục mà bảng Bookings trỏ tới bằng cột liên kết ----
   * Danh mục OTA  : Tên OTA · Mã · Hoa hồng % · Nguyên tệ mặc định
   * Danh mục Tour : Tên tour · Mã tour · Giá thu về NL · Giá thu về TE
   * App KHÔNG ghi vào hai bảng này, chỉ đọc để (a) nối link đúng bản ghi,
   * (b) lấy giá thu về làm bảng giá NET, (c) lấy % hoa hồng theo hợp đồng. */
  tableOtaId: process.env.OTA_TABLE_OTA_ID || 'tblwRIAxRKKTo6W1',
  tableOtaName: process.env.OTA_TABLE_OTA_NAME || 'Danh mục OTA',
  tableTourId: process.env.OTA_TABLE_TOUR_ID || 'tbl9Wzl4ZvtDvKt7',
  tableTourName: process.env.OTA_TABLE_TOUR_NAME || 'Danh mục Tour',

  /* Cột của hai bảng danh mục (dò theo tên, y như bảng chính). */
  cotOta: {
    ten:     { ten: 'Tên OTA',  bi: ['Tên', 'OTA'] },
    ma:      { ten: 'Mã',       bi: ['Mã OTA'] },
    hoaHong: { ten: 'Hoa hồng %', bi: ['Hoa hồng', 'HH %'] },
    tienTe:  { ten: 'Nguyên tệ mặc định', bi: ['Nguyên tệ'] },
    thiTruong: { ten: 'Thị trường khách chính', bi: ['Thị trường khách'] },
    dangHopTac: { ten: 'Đang hợp tác', bi: [] },
  },
  cotTour: {
    ten:      { ten: 'Tên tour', bi: ['Tour'] },
    ma:       { ten: 'Mã tour',  bi: [] },
    nguoiLon: { ten: 'Giá thu về NL', bi: ['Giá thu về người lớn'] },
    treEm:    { ten: 'Giá thu về TE', bi: ['Giá thu về trẻ em'] },
    ghiChu:   { ten: 'Ghi chú', bi: [] },
    dangBan:  { ten: 'Đang bán', bi: [] },
  },

  /* OTA gửi ngày đi theo giờ địa phương của tour (Phú Quốc = UTC+7). Nếu cột ngày
   * trong Base hiển thị lệch một ngày thì đổi biến này cho khớp instance Base. */
  tzOffsetHours: Number(process.env.OTA_TZ || 7),

  cacheTtlMs: Number(process.env.OTA_CACHE_TTL || 30000),

  /* Bí mật webhook. Bắt buộc khi chạy server chung: OTA gọi vào
   * POST /webhook/<kenh>?secret=... hoặc header x-ota-secret.
   * Để trống ở máy cá nhân thì app chỉ nhận webhook từ 127.0.0.1. */
  webhookSecret: process.env.OTA_WEBHOOK_SECRET || '',

  /* File cục bộ (đều nằm trong .gitignore) */
  queueFile: process.env.OTA_QUEUE_FILE || path.join(__dirname, '.tmp', 'hang-doi.json'),
  schemaFile: process.env.OTA_SCHEMA_FILE || path.join(__dirname, '.tmp', 'schema.json'),

  kenh,
  kenhTen: kenh.map((k) => k.ten),

  /* ------------------------------------------------------------------
   * Trạng thái booking — LẤY ĐÚNG option của cột select "Trạng thái" trong Base.
   * Ghi một chuỗi không nằm trong danh sách này là Lark từ chối cả bản ghi, nên
   * chuanhoa.js phải quy mọi kiểu chữ của OTA về đúng 5 giá trị dưới đây.
   *
   * Base không có trạng thái "Hoàn tiền" riêng: OTA báo refund thì coi là "Đã huỷ"
   * và app điền thêm Ngày huỷ + Lý do huỷ, đúng vòng đời mà chủ base đã thiết kế
   * ("Vòng đời: Chờ xác nhận → Đã xác nhận → Đã hoàn thành / Đã huỷ / No-show").
   * ------------------------------------------------------------------ */
  trangThai: ['Chờ xác nhận', 'Đã xác nhận', 'Đã hoàn thành', 'Đã huỷ', 'No-show'],
  trangThaiMoi: 'Chờ xác nhận',        // booking vừa về, chưa ai xác nhận
  trangThaiDong: ['Đã huỷ', 'No-show'], // không chạy nữa ⇒ không đòi SĐT/điểm đón, không tính doanh thu
  trangThaiChuaChot: ['Chờ xác nhận'],  // còn phải xác nhận với khách

  /* Option của cột "Lý do huỷ" (select). App chỉ điền khi tự đặt trạng thái huỷ. */
  lyDoHuy: ['Khách huỷ', 'Mình huỷ', 'Thời tiết', 'Không đủ khách', 'OTA huỷ', 'Khác'],

  /* Option của cột "Nguyên tệ" (select) — ngoài danh sách này thì để trống chứ
   * không ghi bừa, vì ghi option lạ là Lark chặn cả dòng. */
  tienTe: ['VND', 'USD', 'KRW', 'EUR', 'CNY', 'TWD', 'HKD', 'SGD', 'THB'],

  /* Option của cột "Thị trường khách" (select). chuanhoa.js đoán từ quốc tịch /
   * ngôn ngữ OTA gửi; không đoán được thì để trống. */
  thiTruong: ['Hàn Quốc', 'Trung Quốc', 'Đài Loan', 'Âu Mỹ', 'Đông Nam Á',
    'Việt Nam', 'Malaysia', 'India', 'Taiwan', 'Khác'],

  /* ------------------------------------------------------------------
   * Tỷ giá về VNĐ. Base tính "Gross VND" = Gross nguyên tệ × Tỷ giá về VND, nên
   * booking bán bằng USD/KRW/EUR mà app không điền tỷ giá thì Gross VND = giá trị
   * nguyên tệ — sai vài chục lần mà không ai thấy.
   *
   * Đây là số ƯỚC TÍNH để dòng mới không rỗng; kế toán vẫn sửa tay từng dòng khi
   * đối soát. Đổi bằng env, không cần sửa code:
   *   OTA_TY_GIA_JSON={"USD":26200,"KRW":18.4}
   * ------------------------------------------------------------------ */
  tyGia: Object.assign(
    { VND: 1, USD: 26200, EUR: 28500, KRW: 18.5, CNY: 3600, TWD: 810, HKD: 3350, SGD: 19500, THB: 730 },
    envJson('OTA_TY_GIA_JSON', {})
  ),

  /* ------------------------------------------------------------------
   * Bản đồ cột của bảng "Bookings" (44 cột, đã chạy thật).
   *
   * `ten`     tên cột trong Base — app dò field ID theo tên này, không hardcode ID.
   * `bi`      tên gọi khác cũng chấp nhận, để đổi tên cột mà không phải sửa code.
   * `kieu`    loại cột, để màn hình Thiết lập in ra đúng thứ cần tạo.
   * `batBuoc` thiếu là không ghi được.
   * `chiDoc`  ⚠️ CỘT CÔNG THỨC / TỰ ĐỘNG — app CHỈ ĐỌC, ghi vào là Lark báo lỗi
   *           cả bản ghi. Đây là điểm khác lớn nhất so với bản app gốc: tiền
   *           trong base này do CÔNG THỨC tính (Gross VND, Hoa hồng VND, Doanh
   *           thu thu về, Lệch giá…), app không được tính lại rồi ghi đè.
   * `link`    cột liên kết sang bảng danh mục — ghi bằng mảng record_id.
   * `tuyChon` cột app muốn có nhưng base CHƯA có; thiếu thì app vẫn chạy, chỉ
   *           tắt bớt tính năng và nhắc trong tab Thiết lập.
   *
   * NGUYÊN TẮC CHIA VIỆC: app ghi dữ liệu THÔ mà OTA gửi (khách, ngày, số khách,
   * nguyên tệ, gross, tỷ giá, link OTA + link Tour); Base tự tính mọi con tiền.
   * Nhờ vậy số trên dashboard và số trong Base không bao giờ lệch nhau.
   * ------------------------------------------------------------------ */
  cot: {
    /* --- nối sang danh mục: quyết định % hoa hồng và giá thu về --- */
    kenh:       { ten: 'OTA',     kieu: 'Liên kết', batBuoc: true, link: 'ota',
                  bi: ['Kênh OTA'] },
    tour:       { ten: 'Tour',    kieu: 'Liên kết', batBuoc: true, link: 'tour',
                  bi: ['Tên tour / sản phẩm'] },

    /* --- dữ liệu thô của booking: app ghi --- */
    maBooking:  { ten: 'ID BK',   kieu: 'Văn bản', batBuoc: true,
                  bi: ['Mã booking OTA', 'Mã booking', 'Booking code', 'Mã đơn'] },
    tenKhach:   { ten: 'Tên khách', kieu: 'Văn bản', batBuoc: false, bi: ['Khách hàng'] },
    sdt:        { ten: 'Số điện thoại', kieu: 'Văn bản', batBuoc: false, bi: ['SĐT', 'Phone'] },
    email:      { ten: 'Email', kieu: 'Văn bản', batBuoc: false, bi: ['Email khách'] },
    ngayDat:    { ten: 'Ngày đặt', kieu: 'Ngày giờ', batBuoc: false, bi: ['Ngày booking'] },
    ngayDi:     { ten: 'Ngày đi', kieu: 'Ngày giờ', batBuoc: true, bi: ['Ngày sử dụng', 'Ngày tour'] },
    nguoiLon:   { ten: 'Người lớn', kieu: 'Số', batBuoc: false, bi: ['Số người lớn', 'Adult'] },
    treEm:      { ten: 'Trẻ em', kieu: 'Số', batBuoc: false, bi: ['Số trẻ em', 'Child'] },
    diemDon:    { ten: 'Điểm đón', kieu: 'Văn bản', batBuoc: false, bi: ['Điểm đón / khách sạn', 'Khách sạn', 'Pickup'] },
    ngonNgu:    { ten: 'Thị trường khách', kieu: 'Lựa chọn đơn', batBuoc: false,
                  bi: ['Thị trường'], option: 'thiTruong' },
    tienTe:     { ten: 'Nguyên tệ', kieu: 'Lựa chọn đơn', batBuoc: false,
                  bi: ['Currency', 'Loại tiền'], option: 'tienTe' },
    tongTien:   { ten: 'Gross nguyên tệ', kieu: 'Số', batBuoc: false,
                  bi: ['Tổng tiền booking', 'Gross'] },
    tyGia:      { ten: 'Tỷ giá về VND', kieu: 'Số', batBuoc: false, bi: ['Tỷ giá'] },
    trangThai:  { ten: 'Trạng thái', kieu: 'Lựa chọn đơn', batBuoc: true,
                  bi: ['Tình trạng'], option: 'trangThai' },
    ngayHuy:    { ten: 'Ngày huỷ', kieu: 'Ngày giờ', batBuoc: false, bi: [] },
    lyDoHuy:    { ten: 'Lý do huỷ', kieu: 'Lựa chọn đơn', batBuoc: false, bi: [], option: 'lyDoHuy' },

    /* --- công thức của Base: CHỈ ĐỌC. Đây là nguồn tiền chuẩn của app --- */
    kenhChu:      { ten: 'Kênh', kieu: 'Công thức', batBuoc: false, chiDoc: true, bi: [] },
    sanPham:      { ten: 'Sản phẩm', kieu: 'Công thức', batBuoc: false, chiDoc: true, bi: [] },
    tongKhach:    { ten: 'Tổng khách', kieu: 'Công thức', batBuoc: false, chiDoc: true, bi: ['Tổng số khách', 'Pax'] },
    tongTienVnd:  { ten: 'Gross VND', kieu: 'Công thức', batBuoc: false, chiDoc: true, bi: [] },
    hoaHongTyLe:  { ten: 'HH % từ OTA', kieu: 'Công thức', batBuoc: false, chiDoc: true, bi: [] },
    hoaHong:      { ten: 'Hoa hồng VND', kieu: 'Công thức', batBuoc: false, chiDoc: true, bi: ['Hoa hồng OTA'] },
    /* "Doanh thu thu về" = số khách × giá thu về trong Danh mục Tour. Chính là
     * khái niệm "thực nhận theo bảng giá NET" mà app gốc tự tính — nay đọc thẳng
     * từ Base để hai bên không thể lệch. */
    thucNhan:     { ten: 'Doanh thu thu về', kieu: 'Công thức', batBuoc: false, chiDoc: true,
                    bi: ['Doanh thu thực nhận'] },
    netVnd:       { ten: 'Net VND', kieu: 'Công thức', batBuoc: false, chiDoc: true, bi: [] },
    lechBangGia:  { ten: 'Lệch giá OTA vs bảng giá', kieu: 'Công thức', batBuoc: false, chiDoc: true,
                    bi: ['Chênh lệch bảng giá'] },
    kiemTra:      { ten: 'Kiểm tra dữ liệu', kieu: 'Công thức', batBuoc: false, chiDoc: true, bi: [] },
    nhanLuc:      { ten: 'Thời gian nhập', kieu: 'Tự động', batBuoc: false, chiDoc: true,
                    bi: ['Thời gian nhận booking'] },
    nguoiNhap:    { ten: 'Người nhập', kieu: 'Tự động', batBuoc: false, chiDoc: true, bi: [] },

    /* --- kế toán, app chỉ đọc chứ không tự điền --- */
    daThanhToan:  { ten: 'Đã nhận tiền', kieu: 'Ô đánh dấu', batBuoc: false, chiDoc: true, bi: [] },
    kyDoiSoat:    { ten: 'Kỳ đối soát', kieu: 'Văn bản', batBuoc: false, chiDoc: true, bi: [] },

    /* ------------------------------------------------------------------
     * Cột app CẦN mà bảng Bookings chưa có. Thiếu thì app vẫn chạy:
     *   gioDon / ghiChu  — chỉ mất thông tin phụ để gọi khách;
     *   daNhan           — MẤT nút "Nhận booking" (cả trong app lẫn trên hub);
     *   payloadGoc       — mất bản gốc OTA gửi, không đối chứng được khi hỏi lại.
     * Thêm 4 cột này vào bảng Bookings là bật lại đủ. Tab Thiết lập in sẵn.
     * ------------------------------------------------------------------ */
    gioDon:     { ten: 'Giờ đón', kieu: 'Văn bản', batBuoc: false, tuyChon: true, bi: ['Giờ pickup'] },
    ghiChu:     { ten: 'Ghi chú khách', kieu: 'Văn bản', batBuoc: false, tuyChon: true,
                  bi: ['Ghi chú của khách', 'Yêu cầu của khách'] },
    daNhan:     { ten: 'Sales đã nhận', kieu: 'Ô đánh dấu', batBuoc: false, tuyChon: true, bi: [] },
    payloadGoc: { ten: 'Payload gốc', kieu: 'Văn bản', batBuoc: false, tuyChon: true,
                  bi: ['Dữ liệu gốc', 'Raw'] },
  },
};
