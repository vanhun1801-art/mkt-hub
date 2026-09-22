'use strict';
/**
 * Cấu hình app "Thông tin sản phẩm".
 *
 * Mọi table/field ID dưới đây lấy từ +table-list / +field-list THẬT trên Base
 * "Sản phẩm" (dựng 22/09/2026), không đoán. App đọc/ghi bằng FIELD ID chứ không
 * bằng tên cột: anh Hùng còn đổi tên cột trên Base, mà đổi tên là app vỡ —
 * bài học từ app quảng cáo.
 */
const path = require('path');

const npmRoot = process.env.LARK_NPM_ROOT ||
  path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData/Roaming'), 'npm/node_modules');

const BASE_TOKEN = process.env.SP_BASE_TOKEN || 'N7CjbeUiXaq67LsmChtlUQBfgrc';

module.exports = {
  port: Number(process.env.PORT || 5184),
  identity: process.env.LARK_IDENTITY || 'user',

  /* cli: dùng phiên lark-cli của máy · api: gọi Open API bằng app credentials
     (khi deploy chung; danh tính người dùng do lớp vỏ mkt-hub truyền xuống). */
  mode: process.env.LARK_MODE ||
    ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',

  // Gọi thẳng script Node của lark-cli — launcher .cmd trên Windows hay hỏng
  cliScript: process.env.LARK_CLI_SCRIPT ||
    path.join(npmRoot, '@larksuite/cli/scripts/run.js'),

  baseToken: BASE_TOKEN,
  baseUrl: 'https://rootytrip2.sg.larksuite.com/base/' + BASE_TOKEN,

  /* Bảng chính. Tên `spTableId` cố tình trùng vai với `phieuTableId` của các app
     kia: lark.js/larkapi.js dùng nó làm bảng mặc định. */
  spTableId: 'tblrljpiBqDdz2Sj',
  giaTableId: 'tblb0i6N8CkbU4WD',
  chinhSachTableId: 'tblOfu9c38xmFJ1c',
  mediaTableId: 'tblUgaFAj0VZ4Chj',
  lichTableId: 'tblSjAgrKdYI1eLy',

  /* View "🛠 Cần bổ sung thông tin" — chỉ dùng để mở thẳng sang Base, app tự
     tính lại danh sách này từ cột công thức nên không phụ thuộc vào view. */
  viewCanBoSung: 'vewRbBhJm3',

  /** Field ID theo từng bảng. Đổi tên cột trên Base không ảnh hưởng gì ở đây. */
  f: {
    sp: {
      ma: 'fldO0qbhnA',
      ten: 'fldZWaezaw',
      tenEn: 'fldfV2RlLL',
      nhom: 'fldNsKm0zi',
      uuTien: 'fldIWcte95',
      trangThai: 'fldXNNmDiB',
      thoiLuong: 'fldPADsZPY',
      khoiHanh: 'fldSqoYliG',
      giaNL: 'fldG4h7M1q',
      giaTE: 'fld262MZEB',
      ghiChuGia: 'fldASAcUqK',
      hieuLucTu: 'fldoAlUshd',
      hieuLucDen: 'fld71yOuRV',
      tinhTrang: 'fldHBrChUf',      // công thức
      conLai: 'fldXtvBUJ8',         // công thức — số ngày
      thieu: 'fldhY5xFjE',          // công thức — chuỗi các mục còn trống
      usp: 'fldaVLajEk',
      noiBat: 'fldrkTB77c',
      doiTuong: 'fldbtZSi1s',
      tepKhach: 'fldyyd291M',
      traiNghiem: 'fldXupU3WS',
      lichTrinh: 'fld7VQcjHO',
      baoGom: 'fldLxLdi6R',
      chuaBaoGom: 'fldkxqpU45',
      csTreEm: 'fldDs3tXro',
      csPhuThu: 'fldOvaGEJZ',
      csGiamTru: 'fld8NC85Bq',
      uuDai: 'fldqCSnIcs',
      luuY: 'fldjq7G06Z',
      anhVI: 'fldSpOUh3A',
      anhEN: 'fldpkZYGP4',
      thuMuc: 'fldHIx0eYA',
      video: 'fldwlzAUO5',
      chuongTrinh: 'fldgBiirFk',
      nguon: 'fldGaZslEY',
      capNhat: 'fldWZGEhgr',
      nguoiCapNhat: 'fldCwoj0fC',
    },
    gia: {
      ten: 'fld37XM5WP',
      sanPham: 'flduWBKjkK',
      loai: 'fldQtEGMbD',
      tu: 'fldPwdTA41',
      den: 'fldYbSRsBS',
      giaNL: 'fldAOxrlh0',
      giaTE: 'fldHz50UFD',
      dieuKien: 'fldHsqbnsZ',
      ghiChu: 'fld2bN0cLT',
      tinhTrang: 'fldKosLIgG',
      nguon: 'fldYTuJu2B',
    },
    cs: {
      ten: 'fldZpcEw87',
      giamNL: 'fld6XN2zPG',
      giamTE: 'fldsQsw3Tt',
      giamPhanTram: 'fldhdLeHNX',
      apGia: 'fldHpAQZyd',
      ghiGiam: 'fldhMKbW5e',
      loai: 'fldFLzwGaL',
      phamVi: 'fldpkMjWJh',
      apDungCho: 'fldHWmrGTl',
      noiDung: 'fldx7WHZ1K',
      tu: 'fldCHngbE4',
      den: 'fldx8gotou',
      tinhTrang: 'flddnkpap5',
      truyenThong: 'flddqLyZbg',
      nguon: 'fldX9qVTVH',
    },
    lich: {
      ten: 'fldAR43dY8',
      sanPham: 'fldJjUurit',
      cot: 'fldQSoQh7n',
      giaTriMoi: 'fld6Gq5b3g',
      ngayApDung: 'fldruYGnGp',
      trangThai: 'fld2zzXNAm',
      giaTriCu: 'fldN6LwqfR',
      apDungLuc: 'fldIn1IgVh',
      ghiChu: 'fldY7Hh1gA',
    },
    media: {
      ten: 'fldl3QiDyx',
      sanPham: 'fldupjAUtJ',
      loai: 'fldHUwYQM5',
      ngonNgu: 'fldA9yy3t5',
      link: 'fldy0EXscM',
      ghiChu: 'fldTGo2MPr',
    },
  },

  /**
   * Các lựa chọn cố định.
   *
   * Vừa để xếp thứ tự và tô màu, vừa là DANH SÁCH TRẮNG khi ghi: select của Base
   * tự đẻ lựa chọn mới nếu ghi giá trị lạ, nên gõ nhầm một lần là cột có thêm
   * một mức rác vĩnh viễn và bộ lọc lệch từ đó.
   *
   * Thứ tự ở đây CŨNG là thứ tự các tầng trên Bảng đẩy — sửa thứ tự là đổi bố
   * cục màn đầu tiên người dùng nhìn thấy.
   */
  chon: {
    nhom: ['Tour ghép hằng ngày', 'Tour trọn gói', 'Combo tự túc', 'Dịch vụ lẻ'],
    uuTien: ['🔥 Ưu tiên đẩy', '🟢 Chạy hằng ngày', '🔵 Duy trì',
      '🌤 Theo mùa / theo yêu cầu', '⏸ Tạm dừng đẩy'],
    trangThai: ['🆕 Sắp ra mắt', 'Đang kinh doanh', 'Rất ít bán', 'Tạm ngưng', 'Ngừng bán'],
  },

  /**
   * Những cột quản lý sửa được THẲNG trong app.
   *
   * Cố ý hẹp. Mọi thứ còn lại (USP, lịch trình, dịch vụ bao gồm, chính sách) sửa
   * trên Lark Base — đó là nơi Kinh doanh và Marketing cùng nhìn, và dựng thêm
   * một màn nhập liệu ở đây chỉ tạo ra nguồn sự thật thứ hai. Danh sách này chỉ
   * gồm thứ phòng Marketing tự quyết và đổi vài lần một tuần.
   *
   * `kieu` quyết định cách kiểm giá trị ở server — xem server.js → doiTruong().
   */
  suaDuoc: {
    uuTien: { field: 'uuTien', kieu: 'select', chon: 'uuTien', nhan: 'Ưu tiên marketing' },
    trangThai: { field: 'trangThai', kieu: 'select', chon: 'trangThai', nhan: 'Trạng thái kinh doanh' },
    giaNL: { field: 'giaNL', kieu: 'so', nhan: 'Giá công bố NL' },
    giaTE: { field: 'giaTE', kieu: 'so', nhan: 'Giá công bố TE' },
    ghiChuGia: { field: 'ghiChuGia', kieu: 'chu', nhan: 'Ghi chú giá' },
    hieuLucTu: { field: 'hieuLucTu', kieu: 'ngay', nhan: 'Hiệu lực từ' },
    hieuLucDen: { field: 'hieuLucDen', kieu: 'ngay', nhan: 'Hiệu lực đến' },
    luuY: { field: 'luuY', kieu: 'chu', nhan: 'Lưu ý cho marketing' },
    uuDai: { field: 'uuDai', kieu: 'chu', nhan: 'Ưu đãi đang chạy' },
    /* Hai cột này ban đầu CỐ Ý không cho sửa từ app. Mở ra ngày 22/09/2026 vì
       Kinh doanh gửi đợt đổi lịch trình + dịch vụ bao gồm cho 8 tour, hẹn ngày
       01/10 — mà Lịch đổi thông tin chỉ ghi được vào cột nằm trong danh sách này.
       USP, chính sách, dịch vụ CHƯA bao gồm vẫn đóng: chúng không nằm trong đợt
       đổi nào, và mỗi cột mở thêm là một cột nữa có hai nơi sửa được. */
    lichTrinh: { field: 'lichTrinh', kieu: 'chu', nhan: 'Lịch trình tóm tắt' },
    baoGom: { field: 'baoGom', kieu: 'chu', nhan: 'Dịch vụ bao gồm' },
  },

  /** Lựa chọn của cột "Trạng thái" trong bảng Lịch đổi thông tin. */
  trangThaiLich: ['Chờ áp dụng', 'Đã áp dụng', 'Đã huỷ', 'Lỗi'],

  /* Ngưỡng cảnh báo "sắp hết hạn", tính bằng ngày. Cùng con số với công thức
     `Tình trạng hiệu lực` trên Base — để app và Base không nói hai chuyện khác
     nhau về cùng một dòng. Sửa ở đây thì sửa cả công thức trên Base. */
  ngaySapHetHan: 30,
};
