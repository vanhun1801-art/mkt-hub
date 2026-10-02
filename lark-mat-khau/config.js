'use strict';
/**
 * Cấu hình app "Tài khoản & gói dịch vụ".
 *
 * Mọi table/field ID lấy từ +table-list / +field-list THẬT trên Base
 * "TÀI SẢN PHÒNG BAN - MKT ROOTY TRIP" (dựng 30/09/2026), không đoán. App
 * đọc/ghi bằng FIELD ID chứ không bằng tên cột: đổi tên cột trên Base là app
 * vẫn chạy — bài học từ app quảng cáo.
 *
 * KHOÁ MÃ HOÁ (TK_KHOA) nằm ở .env trên máy và ở biến môi trường của Render,
 * KHÔNG BAO GIỜ ở Base hay ở git. Base chỉ giữ chuỗi đã mã hoá; ai mở được Base
 * mà không có khoá thì chỉ thấy "enc:v1:…". Mất khoá là mất mọi mật khẩu —
 * xem README mục "Giữ khoá".
 */
const fs = require('fs');
const path = require('path');

/* Cùng bộ nạp .env với app Chỉnh ảnh: không dùng dotenv (cả hệ không có
 * dependency npm), và biến đã có trong môi trường thì file KHÔNG ghi đè. */
(function napEnv() {
  for (const f of [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')]) {
    let raw;
    try { raw = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    raw.split('\n').forEach((dong) => {
      const d = dong.trim();
      if (!d || d[0] === '#') return;
      const i = d.indexOf('=');
      if (i < 1) return;
      const k = d.slice(0, i).trim();
      let v = d.slice(i + 1).trim();
      if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) v = v.slice(1, -1);
      if (process.env[k] === undefined) process.env[k] = v;
    });
  }
})();

const npmRoot = process.env.LARK_NPM_ROOT ||
  path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData/Roaming'), 'npm/node_modules');

const BASE_TOKEN = process.env.TK_BASE_TOKEN || 'StCObaElHaob0ksyL7zltNAzgdd';
const WIKI_URL = 'https://rootytrip2.sg.larksuite.com/wiki/JcERwvjFQiKIDSkPzqrlHiaIgmd';

module.exports = {
  port: Number(process.env.PORT || 5189),
  identity: process.env.LARK_IDENTITY || 'user',
  mode: process.env.LARK_MODE ||
    ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',
  cliScript: process.env.LARK_CLI_SCRIPT ||
    path.join(npmRoot, '@larksuite/cli/scripts/run.js'),

  baseToken: BASE_TOKEN,
  /* Base nằm trong wiki: mở bằng link wiki thì người xem đi đúng cây thư mục. */
  baseUrl: WIKI_URL,

  /* `tkTableId` là bảng mặc định của lark.js/larkapi.js. */
  tkTableId: 'tblja4dzNvyCVxrC',     // Tài khoản — dựng từ file Excel "TÀI KHOẢN MẬT KHẨU"
  goiTableId: 'tblTiL5EwinU9LUx',    // "Bảng" — gói đăng ký trả tiền (Adobe, Canva…)
  nkTableId: 'tblCbOuJipwJpbQj',     // Nhật ký truy cập

  f: {
    tk: {
      ten: 'fldriCIFwR',
      nenTang: 'fldUVpVgMD',
      nhom: 'fldhqlAhQ1',
      link: 'fldevtr86e',
      user: 'fldnAUvcN1',
      matKhau: 'fld8VUZ1eI',
      matKhauCu: 'fldxN0TKty',
      ma2fa: 'fldTffXxdc',         // mã bí mật 2FA, enc:v1:… (totp.js)
      doiLuc: 'fldE4YUVpr',
      sdt: 'fldlQ6F9bw',
      phuTrach: 'fldZh5g0oz',
      duocXem: 'fldKNwhKf1',
      trangThai: 'fldj9jegwF',
      ghiChu: 'fldsPxzPUw',
      stt: 'fldLpxmdQV',
    },
    goi: {
      ten: 'fldrGu0ozF',
      loai: 'fldwtl7XOa',          // "Gói dịch vụ": Chính hãng / NCC thứ 3
      chuKy: 'fldwVFlM9a',         // Tháng / Năm
      chiPhi: 'fldAqCrRHM',
      soLuong: 'fldI8gTUP8',
      phuTrach: 'fldcLrbyRP',
      matKhau: 'fldYKS1qya',       // chuỗi enc:v1:… sau khi chạy nhap.js --ma-hoa-goi
      trangThai: 'fldFPRGSil',
      batDau: 'fldlr8LDVV',
      hetHan: 'fldvF4Ttt4',
      tbToiDa: 'fldd4862yu',
      tbDangDung: 'fldl72Kvnd',
      user: 'fldoe079qN',          // "Email/TK Đăng nhập" — tên khoá khớp bản ghi đã chuẩn hoá (x.user)
      stt: 'fldNTIsdFj',
      ghiChu: 'fldtoKs9Y2',
      mucDo: 'fldgx8IRGs',
      duocXem: 'fldijWgbfp',
      ma2fa: 'fld9b1GRMj',
    },
    nk: {
      viec: 'fldtEJJubC',
      luc: 'fldagRHHbs',
      nguoi: 'fldKXqQrqD',
      hanhDong: 'fld6Nl6N9J',
      bang: 'fldDhclYSL',
      ma: 'fldXDVcJwS',
    },
  },

  nhom: ['Mạng xã hội', 'Email & Google', 'Kênh bán OTA', 'Website & hạ tầng', 'Công cụ & AI', 'Thanh toán', 'Khác'],

  /* CỘT QUẢN LÝ SỬA ĐƯỢC TRONG APP — danh sách trắng duy nhất.
     Giao diện hỏi server danh sách này (qua /api/khoi-tao) thay vì tự giữ một
     bản riêng: hai danh sách lệch nhau là nút hiện ra mà bấm vào báo 400.
     Mật khẩu KHÔNG nằm ở đây — nó có cửa riêng (đổi mật khẩu, mã hoá, giữ bản cũ).
     `ma` là khoá trong cfg.f.<bảng>; `kieu`: chu | so | ngay | chon | nguoi. */
  suaDuoc: {
    tk: [
      { k: 'nenTang', nhan: 'Nền tảng', kieu: 'chu' },
      { k: 'ten', nhan: 'Tên tài khoản', kieu: 'chu' },
      { k: 'nhom', nhan: 'Nhóm', kieu: 'chon', chon: ['Mạng xã hội', 'Email & Google', 'Kênh bán OTA', 'Website & hạ tầng', 'Công cụ & AI', 'Thanh toán', 'Khác'] },
      { k: 'user', nhan: 'User', kieu: 'chu' },
      { k: 'link', nhan: 'Link đăng nhập', kieu: 'chu', dai: 1000 },
      { k: 'sdt', nhan: 'Số điện thoại', kieu: 'chu', dai: 40 },
      { k: 'phuTrach', nhan: 'Người phụ trách', kieu: 'nguoi' },
      { k: 'trangThai', nhan: 'Trạng thái', kieu: 'chon', chon: ['Đang dùng', 'Ngừng dùng'] },
      { k: 'ghiChu', nhan: 'Ghi chú', kieu: 'chu', dai: 2000, nhieuDong: true },
    ],
    goi: [
      { k: 'ten', nhan: 'Tên dịch vụ', kieu: 'chu' },
      { k: 'loai', nhan: 'Loại gói', kieu: 'chon', chon: ['Chính hãng', 'NCC thứ 3'] },
      { k: 'chuKy', nhan: 'Chu kỳ thanh toán', kieu: 'chon', chon: ['Tháng', 'Năm'] },
      { k: 'chiPhi', nhan: 'Chi phí / kỳ (đ)', kieu: 'so' },
      { k: 'soLuong', nhan: 'Số suất', kieu: 'so' },
      { k: 'batDau', nhan: 'Ngày bắt đầu', kieu: 'ngay' },
      { k: 'hetHan', nhan: 'Ngày hết hạn', kieu: 'ngay' },
      { k: 'user', nhan: 'Email / TK đăng nhập', kieu: 'chu' },
      { k: 'tbToiDa', nhan: 'Thiết bị tối đa', kieu: 'so' },
      { k: 'tbDangDung', nhan: 'Thiết bị đang dùng', kieu: 'so' },
      { k: 'phuTrach', nhan: 'Người phụ trách', kieu: 'nguoi' },
      { k: 'trangThai', nhan: 'Trạng thái', kieu: 'chu', goiY: ['Đang dùng', 'Ngừng dùng'] },
      { k: 'mucDo', nhan: 'Mức độ cần thiết', kieu: 'chu', goiY: ['Cao', 'Trung bình', 'Thấp'] },
      { k: 'ghiChu', nhan: 'Ghi chú', kieu: 'chu', dai: 2000, nhieuDong: true },
    ],
  },

  /* Gói hết hạn trong bấy nhiêu ngày thì lên danh sách cần xử lý của hub. */
  sapHetNgay: 14,
  /* Mật khẩu để lâu hơn bấy nhiêu ngày chưa đổi thì nhắc đổi. */
  cuNgay: 180,
};
