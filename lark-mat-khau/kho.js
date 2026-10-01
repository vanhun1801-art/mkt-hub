'use strict';
/**
 * Đọc Base "TÀI SẢN PHÒNG BAN" → hai danh sách gọn cho giao diện.
 *
 * QUY TẮC SỐ MỘT CỦA TỆP NÀY: bản ghi đi ra khỏi kho KHÔNG mang mật khẩu, kể cả
 * chuỗi đã mã hoá. Chỉ có cờ `coMatKhau` / `chuaMaHoa`. Mật khẩu đi đường riêng
 * `layMatKhau()` — đọc tươi từ Base, từng ô một, sau khi server đã kiểm quyền và
 * ghi nhật ký. Nhờ vậy không có danh sách nào, bộ đệm nào, hay câu trả lời
 * /api/tong-quan nào của hub lỡ tay chở mật khẩu đi.
 */
const cfg = require('./config');
const { daMaHoa } = require('./ma-hoa');

const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');
const NGAY = 86400000;
const DEM_MS = 60000;

let dem = null;          // { luc, tk, goi }
let dangDoc = null;

/* ---------------- đọc ô ---------------- */

const chu = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? (x.text || x.name || x.link || '') : x)).join('');
  if (typeof v === 'object') return v.text || v.name || v.link || '';
  return String(v);
};
const mot = (v) => (Array.isArray(v) ? chu(v[0]) : chu(v));
/* Ô rỗng ra null, KHÔNG ra 0 — Number('') === 0 và "0đ" trông như một mức giá thật. */
const so = (v) => {
  if (v == null || v === '') return null;
  const n = Number(typeof v === 'number' ? v : chu(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
/* Ngày: lark-cli trả chuỗi ISO có múi giờ, Open API trả epoch ms. */
const ngay = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
};
const nguoi = (v) => (Array.isArray(v) ? v : [])
  .map((x) => ({ id: (x && (x.id || x.open_id)) || '', ten: (x && (x.name || x.en_name)) || '' }))
  .filter((x) => x.id || x.ten);

/* Ô "Email/TK Đăng nhập" của bảng gói có dạng markdown "[a@b](mailto:a@b)". */
const boMailto = (s) => {
  const m = /^\[([^\]]*)\]\((?:mailto:)?[^)]*\)$/.exec(String(s || '').trim());
  return m ? m[1] : String(s || '').trim();
};

/* ---------------- chuẩn hoá ---------------- */

function tuTaiKhoan(r) {
  const c = r.cells || {};
  const F = cfg.f.tk;
  const mk = chu(c[F.matKhau]);
  return {
    bang: 'tk',
    id: r.record_id,
    ten: chu(c[F.ten]).trim(),
    nenTang: chu(c[F.nenTang]).trim(),
    nhom: mot(c[F.nhom]) || 'Khác',
    link: chu(c[F.link]).trim(),
    user: chu(c[F.user]).trim(),
    sdt: chu(c[F.sdt]).trim(),
    phuTrach: nguoi(c[F.phuTrach]),
    duocXem: nguoi(c[F.duocXem]),
    trangThai: mot(c[F.trangThai]) || 'Đang dùng',
    ghiChu: chu(c[F.ghiChu]).trim(),
    doiLuc: ngay(c[F.doiLuc]),
    stt: so(c[F.stt]),
    coMatKhau: !!mk,
    coMatKhauCu: !!chu(c[F.matKhauCu]),
    co2fa: !!chu(c[F.ma2fa]),
    chuaMaHoa: !!mk && !daMaHoa(mk),
  };
}

function tuGoi(r) {
  const c = r.cells || {};
  const F = cfg.f.goi;
  const mk = chu(c[F.matKhau]);
  const hetHan = ngay(c[F.hetHan]);
  const chuKy = mot(c[F.chuKy]);
  const chiPhi = so(c[F.chiPhi]);
  const soLuong = so(c[F.soLuong]) || 1;
  /* Quy mọi gói về tiền MỘT THÁNG để cộng được với nhau. "Chi phí" là giá một
     kỳ của MỘT suất; "Số lượng" là số suất mua. */
  const thang = chiPhi == null ? null
    : (chuKy === 'Năm' ? chiPhi / 12 : chiPhi) * soLuong;
  return {
    bang: 'goi',
    id: r.record_id,
    ten: chu(c[F.ten]).trim(),
    loai: mot(c[F.loai]),
    chuKy,
    chiPhi,
    soLuong,
    chiPhiThang: thang == null ? null : Math.round(thang),
    phuTrach: nguoi(c[F.phuTrach]),
    duocXem: nguoi(c[F.duocXem]),
    trangThai: chu(c[F.trangThai]).trim() || 'Đang dùng',
    mucDo: chu(c[F.mucDo]).trim(),
    batDau: ngay(c[F.batDau]),
    hetHan,
    conLai: hetHan == null ? null : Math.ceil((hetHan - Date.now()) / NGAY),
    tbToiDa: so(c[F.tbToiDa]),
    tbDangDung: so(c[F.tbDangDung]),
    user: boMailto(chu(c[F.dangNhap])),
    ghiChu: chu(c[F.ghiChu]).trim(),
    stt: so(c[F.stt]),
    coMatKhau: !!mk,
    co2fa: !!chu(c[F.ma2fa]),
    chuaMaHoa: !!mk && !daMaHoa(mk),
  };
}

async function docMoi() {
  const [tkRaw, goiRaw] = await Promise.all([
    lark.listAllRecords(cfg.tkTableId),
    lark.listAllRecords(cfg.goiTableId),
  ]);
  const tk = tkRaw.map(tuTaiKhoan).filter((x) => x.ten || x.nenTang || x.user || x.coMatKhau || x.ghiChu)
    .sort((a, b) => (a.stt ?? 1e9) - (b.stt ?? 1e9) || a.nenTang.localeCompare(b.nenTang, 'vi'));
  const goi = goiRaw.map(tuGoi).filter((x) => x.ten)
    .sort((a, b) => (a.hetHan ?? 9e15) - (b.hetHan ?? 9e15));
  return { luc: Date.now(), tk, goi };
}

async function tatCa({ moi } = {}) {
  if (!moi && dem && Date.now() - dem.luc < DEM_MS) return dem;
  if (dangDoc) return dangDoc;
  dangDoc = docMoi().then((d) => { dem = d; return d; }).finally(() => { dangDoc = null; });
  return dangDoc;
}

const xoaDem = () => { dem = null; };

/**
 * Đọc MỘT ô mật khẩu, luôn tươi từ Base — không qua bộ đệm.
 * Trả về chuỗi như trên Base (đã mã hoá hoặc chữ thường cũ); server giải mã.
 */
async function layO(bang, id, truong) {
  const tableId = bang === 'goi' ? cfg.goiTableId : cfg.tkTableId;
  const F = bang === 'goi' ? cfg.f.goi : cfg.f.tk;
  const fid = F[truong];
  if (!fid) throw new Error('Không có cột ' + truong);
  const r = await lark.getRecord(id, tableId);
  if (!r) return { co: false };
  return { co: true, gia: chu((r.cells || {})[fid]), banGhi: r };
}

module.exports = { tatCa, xoaDem, layO, tuTaiKhoan, tuGoi, chu, nguoi, lark, _dat: (d) => { dem = d; } };
