'use strict';
/**
 * Kho — đọc/ghi sáu bảng của Base KOL.
 *
 * Mỗi bảng khai bằng `khoá: [tên cột, kiểu]`. Đọc: dò id cột MỘT lần qua
 * +field-list rồi đổi ô theo kiểu. Ghi: đổi ngược sang CellValue theo tên cột
 * (lark-cli và Open API v3 đều nhận tên cột).
 *
 * Kiểu: t chữ · s chọn một · m chọn nhiều · n số · d ngày giờ (ms) · b ô tích ·
 *       l liên kết một · L liên kết nhiều (mảng record_id) · u đường dẫn
 */
const cfg = require('./config');
const T = require('./tinh');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

const SO_DO = (moc) => ({
  ['xem' + moc]: ['Xem ' + moc + 'N', 'n'], ['thich' + moc]: ['Thích ' + moc + 'N', 'n'],
  ['binhLuan' + moc]: ['Bình luận ' + moc + 'N', 'n'], ['chiaSe' + moc]: ['Chia sẻ ' + moc + 'N', 'n'],
  ['luu' + moc]: ['Lưu ' + moc + 'N', 'n'], ['nhap' + moc]: ['Nhập số ' + moc + 'N lúc', 'd'],
});

const BANG = {
  kol: {
    ten: ['Tên KOL', 't'], xungHo: ['Xưng hô', 's'], tenGoi: ['Tên gọi', 't'],
    tinhTrang: ['Tình trạng', 's'], quocGia: ['Quốc gia', 's'],
    maVung: ['Mã vùng', 't'], sdt: ['Số điện thoại', 't'], email: ['Email', 't'],
    lienHe: ['Liên hệ khác', 't'], nguon: ['Nguồn', 's'], linhVuc: ['Lĩnh vực', 'm'],
    tongTheoDoi: ['Tổng theo dõi', 'n'], danhGia: ['Đánh giá', 'n'], ghiChu: ['Ghi chú', 't'],
  },
  kenh: {
    ten: ['Tên kênh', 't'], kol: ['KOL', 'l'], nenTang: ['Nền tảng', 's'], link: ['Link', 'u'],
    theoDoi: ['Lượt theo dõi', 'n'], capNhat: ['Cập nhật số lúc', 'd'], reup: ['Chỉ re-up', 'b'],
  },
  dichVu: {
    ten: ['Tên dịch vụ', 't'], loai: ['Loại', 's'], nhaCungCap: ['Nhà cung cấp', 't'],
    donVi: ['Đơn vị tính', 's'],
    cbNL: ['Giá công bố NL', 'n'], cbTE: ['Giá công bố TE', 'n'], cbEB: ['Giá công bố EB', 'n'],
    netNL: ['Giá net NL', 'n'], netTE: ['Giá net TE', 'n'], netEB: ['Giá net EB', 'n'],
    focThuong: ['Thường FOC', 'b'], lienHe: ['Người liên hệ', 't'], sdtLienHe: ['SĐT liên hệ', 't'],
    diaChi: ['Địa chỉ', 't'], dangDung: ['Đang dùng', 'b'], ghiChu: ['Ghi chú', 't'],
  },
  hopTac: {
    ma: ['Mã hợp tác', 't'], kol: ['KOL', 'l'], buoc: ['Bước', 's'],
    nguoiLon: ['Người lớn', 'n'], treEm: ['Trẻ em', 'n'], emBe: ['Em bé', 'n'],
    batDau: ['Ngày bắt đầu', 'd'], ketThuc: ['Ngày kết thúc', 'd'],
    kenhDang: ['Kênh đăng tải', 't'], yeuCau: ['Yêu cầu nội dung', 't'],
    tienCongTy: ['Tiền công ty chi', 'n'], giaTriFOC: ['Giá trị FOC', 'n'], giaTriQuyDoi: ['Giá trị quy đổi', 'n'],
    trinhLuc: ['Trình BGĐ lúc', 'd'], nguoiDuyet: ['Người duyệt', 't'], kenhDuyet: ['Kênh duyệt', 's'],
    duyetLuc: ['Duyệt lúc', 'd'], yKien: ['Ý kiến BGĐ', 't'],
    thuMoiLuc: ['Gửi thư mời lúc', 'd'], xacNhanLuc: ['KOL xác nhận lúc', 'd'],
    maTourwell: ['Mã đơn Tourwell', 't'], ttTourwell: ['Trạng thái Tourwell', 's'],
    tongXem: ['Tổng lượt xem', 'n'], lyDoHuy: ['Lý do huỷ', 't'], ghiChu: ['Ghi chú', 't'],
    lichSu: ['Lịch sử bước', 't'], khongTuChuyen: ['Không tự chuyển', 'b'],
    thuBgd: ['Thư BGĐ', 't'], tdBgd: ['Tiêu đề thư BGĐ', 't'], bgdTraLoi: ['BGĐ trả lời', 't'], bgdTraLoiLuc: ['BGĐ trả lời lúc', 'd'],
    thuKol: ['Thư KOL', 't'], tdKol: ['Tiêu đề thư mời', 't'], kolTraLoi: ['KOL trả lời', 't'], kolTraLoiLuc: ['KOL trả lời lúc', 'd'],
    chotLuc: ['Chốt bảng kê lúc', 'd'],
  },
  doiTac: {
    ten: ['Tên đối tác', 't'], email: ['Email', 't'], cc: ['CC', 't'], lienHe: ['Người liên hệ', 't'],
    sdt: ['SĐT', 't'], ghiChu: ['Ghi chú', 't'], loai: ['Loại dịch vụ', 't'], maTw: ['Mã Tourwell', 't'],
  },
  hangMuc: {
    ten: ['Tên hạng mục', 't'], hopTac: ['Hợp tác', 'l'], nhom: ['Nhóm', 's'], ngay: ['Ngày dùng', 'd'],
    gioHen: ['Giờ hẹn', 'd'], diemHen: ['Điểm hẹn', 't'], nguonDv: ['Nguồn dịch vụ', 's'],
    maDv: ['Mã dịch vụ', 't'], dichVu: ['Dịch vụ đối tác', 'l'], loaiKhach: ['Loại khách', 's'],
    soLuong: ['Số lượng', 'n'], demLuot: ['Đêm/Lượt', 'n'], hinhThuc: ['Hình thức chi', 's'],
    donGiaChi: ['Đơn giá chi', 'n'], giaCongBo: ['Giá công bố', 'n'], vat: ['VAT %', 'n'],
    thanhTien: ['Thành tiền', 'n'], quyDoi: ['Giá trị quy đổi', 'n'], nhaCungCap: ['Nhà cung cấp', 't'],
    tinhTrang: ['Tình trạng', 's'], nhacHen: ['Nhắc hẹn', 'b'], daNhac: ['Đã nhắc lúc', 'd'],
    tinNhan: ['Tin nhắn nhắc', 't'], kiemLai: ['Cần kiểm lại', 'b'], ghiChu: ['Ghi chú', 't'],
    xinFoc: ['Hợp tác FOC', 's'], xinFocLuc: ['Gửi đề xuất FOC lúc', 'd'], tourwellId: ['Tourwell ID', 't'],
  },
  banGiao: {
    ten: ['Sản phẩm', 't'], hopTac: ['Hợp tác', 'l'], chuDe: ['Chủ đề', 't'], loai: ['Loại', 's'],
    nenTang: ['Nền tảng', 'm'], soLuong: ['Số lượng', 'n'], hanDang: ['Hạn đăng', 'd'],
    trangThai: ['Trạng thái', 's'], ngayDang: ['Ngày đăng', 'd'], link: ['Link bài', 'u'],
    theTag: ['Đủ gắn thẻ + hashtag', 'b'], cta: ['Có nhắc tên + CTA', 'b'],
    ...SO_DO(7), ...SO_DO(30), ghiChu: ['Ghi chú', 't'],
    kenhDang: ['Kênh đăng', 'L'], traDoiTac: ['Trả cho đối tác', 't'],
  },
};

/* ---------------- đọc ô ---------------- */
function chu(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    return v.map((p) => (typeof p === 'string' ? p : (p && (p.text || p.name || p.link)) || '')).join('').trim();
  }
  if (typeof v === 'object') return String(v.text || v.name || v.link || '').trim();
  return String(v).trim();
}
const nhieu = (v) => (v == null || v === '' ? [] : (Array.isArray(v) ? v : [v]).map(chu).filter(Boolean));
const so = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(chu(v).replace(/[^\d.-]/g, ''));
  return chu(v) && Number.isFinite(n) ? n : null;
};
const ms = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const t = Date.parse(chu(v));
  return Number.isFinite(t) ? t : 0;
};
const idLink = (v) => (Array.isArray(v) ? v : []).map((x) => (x && (x.id || x.record_id)) || '').filter(Boolean);
function url(v) {
  const t = chu(v);
  const m = /^\[(.*)\]\((.+)\)$/s.exec(t);
  const u = m ? m[2].trim() : t;
  return /^https?:\/\//i.test(u) ? u : '';
}
const DOC = {
  t: chu, s: (v) => nhieu(v)[0] || '', m: nhieu, n: so, d: ms, b: (v) => v === true,
  l: (v) => idLink(v)[0] || '', L: idLink, u: url,
};

/* ---------------- ghi ô ---------------- */
const GHI = {
  t: (v) => (v == null ? '' : String(v)),
  s: (v) => (v ? String(v) : null),
  m: (v) => (Array.isArray(v) ? v.filter(Boolean) : v ? [String(v)] : []),
  n: (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v)),
  d: (v) => (v ? T.choBase(typeof v === 'number' ? v : T.tuChuoi(v)) : null),
  b: (v) => v === true || v === 'true' || v === 1,
  l: (v) => (v ? [{ id: String(v) }] : []),
  L: (v) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean).map((id) => ({ id: String(id) })),
  u: (v) => (v ? String(v) : ''),
};

/** {khoá: giá trị} → {tên cột: CellValue}; bỏ khoá lạ (client không ghi được cột ngoài danh sách). */
function sangO(bang, obj) {
  const sd = BANG[bang];
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (!sd[k] || v === undefined) continue;
    out[sd[k][0]] = GHI[sd[k][1]](v);
  }
  return out;
}

/* ---------------- nạp ---------------- */
const idCot = {};          // bang → { fieldId: khoá }
async function napIdCot(bang) {
  if (idCot[bang]) return idCot[bang];
  const ds = await lark.listFields(cfg.bang[bang]);
  const theoTen = Object.fromEntries(Object.entries(BANG[bang]).map(([k, [ten]]) => [ten, k]));
  const m = {};
  for (const f of ds) {
    const k = theoTen[f.name || f.field_name];
    if (k) m[f.id || f.field_id] = k;
  }
  idCot[bang] = m;
  return m;
}

function veBanGhi(bang, r, m) {
  const sd = BANG[bang];
  const o = { id: r.record_id };
  for (const k of Object.keys(sd)) o[k] = DOC[sd[k][1]](undefined);
  for (const [fid, v] of Object.entries(r.cells || {})) {
    const k = m[fid];
    if (k) o[k] = DOC[sd[k][1]](v);
  }
  return o;
}

async function docBang(bang) {
  const [m, ds] = await Promise.all([napIdCot(bang), lark.listAllRecords(cfg.bang[bang])]);
  return ds.map((r) => veBanGhi(bang, r, m));
}

let dem = { luc: 0, dl: null, bay: null };
async function tatCa({ moi = false } = {}) {
  if (!moi && dem.dl && Date.now() - dem.luc < cfg.cacheTtlMs) return dem.dl;
  if (dem.bay) return dem.bay;
  dem.bay = (async () => {
    const ten = Object.keys(BANG);
    const kq = await Promise.all(ten.map(docBang));
    const dl = Object.fromEntries(ten.map((t, i) => [t, kq[i]]));
    dem = { luc: Date.now(), dl, bay: null };
    return dl;
  })();
  try { return await dem.bay; } finally { dem.bay = null; }
}
const lamMoi = () => { dem.luc = 0; };

/* ---------------- ghi ---------------- */
async function tao(bang, obj) {
  const r = await lark.createRecord(sangO(bang, obj), cfg.bang[bang]);
  lamMoi();
  const id = (r.record_id_list || [])[0] || (r.records && r.records[0] && r.records[0].record_id) || '';
  return id;
}
async function taoNhieu(bang, ds) {
  if (!ds.length) return [];
  const r = await lark.createMany(ds.map((o) => sangO(bang, o)), cfg.bang[bang]);
  lamMoi();
  return r.record_id_list || [];
}
async function sua(bang, id, obj) {
  const o = sangO(bang, obj);
  if (!Object.keys(o).length) return;
  await lark.updateRecord(id, o, cfg.bang[bang]);
  lamMoi();
}
async function suaNhieu(bang, map) {
  const m = {};
  for (const [id, obj] of Object.entries(map)) { const o = sangO(bang, obj); if (Object.keys(o).length) m[id] = o; }
  if (!Object.keys(m).length) return;
  await lark.updateMany(m, cfg.bang[bang]);
  lamMoi();
}
async function xoa(bang, ids) {
  if (!ids.length) return;
  await lark.deleteRecords(ids, cfg.bang[bang]);
  lamMoi();
}

/* ---------------- Base Sản phẩm (chỉ đọc) ---------------- */
let demSp = { luc: 0, ds: null };
async function sanPham() {
  if (demSp.ds && Date.now() - demSp.luc < 10 * 60000) return demSp.ds;
  const sp = cfg.sanPham;
  const ds = (await lark.listAllRecords(sp.bang, sp.baseToken)).map((r) => {
    const c = r.cells || {};
    return {
      id: r.record_id, ma: chu(c[sp.f.ma]), ten: chu(c[sp.f.ten]), nhom: nhieu(c[sp.f.nhom])[0] || '',
      giaNL: so(c[sp.f.giaNL]), giaTE: so(c[sp.f.giaTE]), trangThai: nhieu(c[sp.f.trangThai])[0] || '',
      /* cho lịch trình gửi KOL: tên tiếng Anh, thời lượng, giờ khởi hành, lịch trình tóm tắt của tour */
      tenEn: chu(c[sp.f.tenEn]), thoiLuong: chu(c[sp.f.thoiLuong]), khoiHanh: chu(c[sp.f.khoiHanh]), lichTrinh: chu(c[sp.f.lichTrinh]),
    };
  }).filter((x) => x.ten);
  demSp = { luc: Date.now(), ds };
  return ds;
}

module.exports = { BANG, tatCa, lamMoi, tao, taoNhieu, sua, suaNhieu, xoa, sanPham, sangO, veBanGhi, lark };
