'use strict';
/**
 * Cấu hình app "KOL" — app con thứ 12 của Marketing Hub.
 *
 * Vì sao có app này: hợp tác KOL không có hợp đồng, chỉ có chuỗi email + một
 * bảng kê Excel gõ tay. Ca Châu Kim Cương (07/2026) cho thấy ba tài liệu nói ba
 * điều khác nhau (tour ngày 12 ghi G4 / Land 5 / Cano 3 đảo; số trẻ em 2 vs 4).
 * App giữ MỘT bản ghi, mọi email và bảng kê sinh ra từ đó.
 *
 * Bảng đọc bằng TÊN CỘT (kho.js tự dò id lúc nạp) — đổi tên cột trên Base thì
 * phải sửa tên ở đây.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

/* .env cục bộ (không lên git): KOL_MAIL_FROM, KOL_NHAC_EMAIL, KOL_TIN_APP_ID… */
try {
  for (const d of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(d);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) {}

function timCli() {
  const rel = path.join('node_modules', '@larksuite', 'cli', 'scripts', 'run.js');
  const roots = [
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
    '/usr/local/lib', '/usr/lib',
  ];
  for (const r of roots) {
    const p = path.join(r, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const BASE = process.env.LARK_BASE_TOKEN || 'TqOFbEdN9aEKyNsGk8qlpeKZgHh';

module.exports = {
  port: Number(process.env.PORT || 5186),

  /* Dòng liên hệ in trên lịch trình PDF gửi KOL, VD "Lê Văn Hùng · 0901 234 567 · Zalo cùng số".
   * Để trống thì tờ in không có mục liên hệ — không tự đoán số điện thoại. */
  lienHeKol: process.env.KOL_LIEN_HE || '',

  mode: process.env.LARK_MODE ||
    ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),
  identity: process.env.LARK_AS || 'user',
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',
  cliScript: process.env.LARK_CLI_SCRIPT || timCli(),
  cacheTtlMs: 15000,

  /* Base "KOL · Hợp tác truyền thông", dựng 23/09/2026 bằng thiet-lap/tao-base.js. */
  baseToken: BASE,
  larkUrl: 'https://rootytrip2.sg.larksuite.com/base/' + BASE,
  bang: {
    kol: 'tblhdV3zWa0XX7Dg',
    kenh: 'tblzSYUtWaL6qSNL',
    dichVu: 'tbl0qf9HkIzuBOPh',
    hopTac: 'tblEuYzkcBAnp2ZZ',
    hangMuc: 'tblvye5QlAByhzzl',
    banGiao: 'tblP7Y3sp2cxRXjd',
    doiTac: 'tblLrDZOC6LnSHeY',     // thêm 23/09/2026 (thiet-lap/nang-cap-1.js)
    caiDat: 'tblUdsrWcpDILwSl',     // Khoá / Giá trị — phiên hộp thư gửi mail (mã hoá, xem ho-thu.js)
  },

  /* Base "Sản phẩm" — chỉ ĐỌC để lấy mã + giá công bố. Lark không cho link chéo
   * Base nên hạng mục chép mã + giá lúc chốt (giá đổi sau này không làm sai bảng kê cũ). */
  sanPham: {
    baseToken: 'N7CjbeUiXaq67LsmChtlUQBfgrc',
    bang: 'tblrljpiBqDdz2Sj',
    f: { ma: 'fldO0qbhnA', ten: 'fldZWaezaw', nhom: 'fldNsKm0zi', giaNL: 'fldG4h7M1q', giaTE: 'fld262MZEB',
      trangThai: 'fldXNNmDiB', tenEn: 'fldfV2RlLL', thoiLuong: 'fldPADsZPY', khoiHanh: 'fldSqoYliG',
      lichTrinh: 'fld7VQcjHO', usp: 'fldaVLajEk' },
  },

  /* ---- email (Lark Mail — MX của rootytrip.com là larksuite) ---- */
  mail: {
    /* Để trống = địa chỉ chính của hộp thư. Thư mời cũ gửi từ cmo@ nên cho đổi được. */
    from: process.env.KOL_MAIL_FROM || '',
    bgdTo: process.env.KOL_BGD_TO || 'ceo@rootytrip.com',
    bgdTen: process.env.KOL_BGD_TEN || 'Ban Giám Đốc',
    nguoiKy: process.env.KOL_NGUOI_KY || 'Lê Văn Hùng',
  },

  /* ---- nhắc hẹn ---- */
  nhac: {
    truocPhut: Number(process.env.KOL_NHAC_TRUOC_PHUT || 60),
    /* Gửi tin bằng app Marketing Hub nếu khai KOL_TIN_APP_ID/SECRET (hoặc LARK_APP_*),
     * người nhận chỉ định bằng EMAIL — open_id riêng theo từng app nên email chắc hơn.
     * Không khai thì chạy local sẽ gửi bằng bot của lark-cli tới chính người đang đăng nhập. */
    appId: process.env.KOL_TIN_APP_ID || process.env.LARK_APP_ID || '',
    appSecret: process.env.KOL_TIN_APP_SECRET || process.env.LARK_APP_SECRET || '',
    /* Trên Render (có LARK_APP_*) mặc định nhắc anh Hùng qua email Lark; máy cá nhân dùng bot lark-cli. */
    email: process.env.KOL_NHAC_EMAIL || ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'hunglv@rootytrip.com' : ''),
    /* Giờ gửi bản tin buổi sáng (bàn giao quá hạn, đến hạn nhập số 7N/30N). */
    gioSang: Number(process.env.KOL_NHAC_GIO_SANG || 8),
    tat: process.env.KOL_NHAC_TAT === '1',
  },

  /* Thứ tự bước — cũng là thứ tự cột Bước trên Base. */
  buoc: ['Đang trao đổi', 'Chờ BGĐ duyệt', 'BGĐ đã duyệt', 'Đã mời KOL', 'KOL đã xác nhận',
    'Đã tạo tour Tourwell', 'Đang đi tour', 'Chờ nhận sản phẩm', 'Hoàn tất', 'Huỷ'],

  /* Quốc gia → mã vùng. Khớp danh sách lựa chọn cột Quốc gia. */
  maVung: {
    'Việt Nam': '+84', 'Hàn Quốc': '+82', 'Nhật Bản': '+81', 'Trung Quốc': '+86', 'Đài Loan': '+886',
    'Thái Lan': '+66', 'Singapore': '+65', 'Malaysia': '+60', 'Philippines': '+63', 'Ấn Độ': '+91',
    'Nga': '+7', 'Mỹ': '+1', 'Úc': '+61', 'Anh': '+44', 'Pháp': '+33', 'Đức': '+49',
  },
};
