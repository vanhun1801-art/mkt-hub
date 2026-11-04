'use strict';
/**
 * Đơn ghép được về một quảng cáo có MUA ĐÚNG sản phẩm quảng cáo đó bán không.
 *
 * Vì sao cần: ghi công (sync/roas.js) chỉ trả lời "khách đến từ quảng cáo nào".
 * Nó cộng MỌI đơn của khách đó. Đo 04/11/2026: bốn đơn ghi cho quảng cáo
 * "PITO Hotel_COMBOPITO4N3D" là CB1N, G4, vé bay, KS Season, không đơn nào có
 * PITO. Anh Hùng lên Tourwell soát tay mới thấy. Nên mỗi đơn phải mang thêm
 * nhãn: đúng sản phẩm / có kèm / mua thứ khác.
 *
 * Hai khoá nhận diện một dịch vụ trong đơn Tourwell:
 *   · MÃ SẢN PHẨM, đứng trước dấu gạch trong `item_info.description`:
 *     "*G4 - TOUR GHÉP…" → G4, "*GLAND_VIN_SAF - …" → GLANDVINSAF.
 *     Mã phải có số hoặc gạch dưới, để "*VÉ NIGHT PARADISE" không thành mã "VE".
 *   · TÊN KHÁCH SẠN, vì khách sạn không có mã: "Tên khách sạn PITO HOTEL HÒN
 *     THƠM" → PITO. Sales bán PITO bằng combo CB3N + một dòng khách sạn, không
 *     có sản phẩm "combo PITO" riêng (soát 450 đơn 25/10–04/11/2026).
 *
 * Sản phẩm của một quảng cáo: ưu tiên cột "Sản phẩm & Tour" của chiến dịch
 * trên Base (người khai). Trống thì ĐOÁN từ tên chiến dịch, nhóm, quảng cáo,
 * dò theo từ điển khoá rút ra từ chính các đơn Tourwell. Đoán thì phải nói là
 * đoán (`nguon: 'doan'`).
 */

const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D');

/** Mã so được: chữ hoa, không dấu, bỏ mọi thứ không phải chữ số (gạch dưới, cách). */
const chuanMa = (s) => boDau(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

/* Chữ chung của tên khách sạn, bỏ trước khi lấy tên riêng. */
const TU_CHUNG_KS = new Set(['TEN', 'KHACH', 'SAN', 'KS', 'HOTEL', 'HOTELS', 'RESORT', 'RESORTS',
  'AND', 'SPA', 'THE', 'VILLA', 'VILLAS', 'HOMESTAY', 'BUNGALOW', 'BOUTIQUE', 'PHU', 'QUOC',
  'PHUQUOC', 'BY', 'DE', 'LA', 'LE', 'CAN', 'HO', 'GRAND', 'NEW']);

/** "Tên khách sạn PITO HOTEL HÒN THƠM" → "PITO". Không rút được thì ''. */
function tenKhachSan(chu) {
  const tu = boDau(chu).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const rieng = tu.find((t) => t.length >= 3 && !TU_CHUNG_KS.has(t) && !/^\d+$/.test(t));
  return rieng || '';
}

/** "*G4 - TOUR GHÉP…" → "G4". Không phải mã thì ''. */
function maTuTen(chu) {
  const m = boDau(chu).toUpperCase().match(/^\s*\*?\s*([A-Z0-9_]+)\s*(?:-|$|\s)/);
  if (!m) return '';
  const tho = m[1];
  if (!/[0-9_]/.test(tho) || tho.length < 2 || tho.length > 24) return '';
  return chuanMa(tho);
}

const LA_KHACH_SAN = /khach san|hotel/i;

/**
 * Một dịch vụ Tourwell (đã gọn) → khoá nhận diện.
 * @param {{loai:string, ten:string}} dv
 * @returns {{khoa:string, kieu:'ma'|'ks'|''}}
 */
function khoaDichVu(dv) {
  const ten = String((dv && dv.ten) || '');
  const loai = String((dv && dv.loai) || '');
  const ma = maTuTen(ten);
  if (ma) return { khoa: ma, kieu: 'ma' };
  if (LA_KHACH_SAN.test(boDau(loai)) || /^\s*ten khach san/i.test(boDau(ten))) {
    const ks = tenKhachSan(ten.replace(/t[eê]n kh[aá]ch s[aạ]n/i, ''));
    if (ks) return { khoa: ks, kieu: 'ks' };
  }
  return { khoa: '', kieu: '' };
}

/* Tourwell bọc tiền trong object hoặc chuỗi "1,234,000". Đọc mềm: không chắc
 * `financial_summary` dùng khoá nào, nên thử vài khoá và trả null khi không có,
 * KHÔNG trả 0 (0 là "đo rồi bằng 0", null là "không đo được"). */
function soTien(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'object') {
    for (const k of ['base', 'original', 'amount', 'value', 'vnd']) {
      const x = soTien(v[k]);
      if (x != null) return x;
    }
    return null;
  }
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && String(v).match(/\d/) ? n : null;
}

const KHOA_TIEN_DV = ['total_payment', 'total_price', 'total_amount', 'total', 'revenue',
  'price_out', 'selling_price', 'amount'];

/** Tiền bán của một dịch vụ trong đơn Tourwell thô. null nếu không đọc được. */
function tienDichVu(s) {
  const fs = s && s.financial_summary;
  if (!fs || typeof fs !== 'object') return null;
  for (const k of KHOA_TIEN_DV) {
    const x = soTien(fs[k]);
    if (x != null) return x;
  }
  return null;
}

/**
 * Đơn Tourwell thô (GET /api/v1/orders) → danh sách dịch vụ gọn.
 * Cùng cách đọc với lark-khach-hang/nguon/tourwell.js: service_info, item_info
 * là OBJECT, ép thẳng sang chữ sẽ ra "[object Object]".
 */
function dichVuTuDonTho(r) {
  const chu = (v) => (v == null ? '' : String(v)).trim();
  return (Array.isArray(r && r.services) ? r.services : []).map((s) => {
    const it = (s && s.item_info) || {};
    const si = (s && s.service_info) || {};
    const ten = chu(it.description) || chu(it.name)
      || chu(s && s.prices && s.prices[0] && s.prices[0].object && s.prices[0].object.title)
      || chu(si.name);
    const dv = { loai: chu(si.name), ten, tien: tienDichVu(s) };
    const k = khoaDichVu(dv);
    return { ...dv, khoa: k.khoa, kieu: k.kieu };
  }).filter((d) => d.ten);
}

/* ---------------------------------------------------------------------------
 * Sản phẩm của một quảng cáo
 * ------------------------------------------------------------------------- */

/**
 * Từ điển khoá: mọi mã và tên khách sạn từng xuất hiện trong đơn, cộng mã ở
 * bảng sản phẩm của Base quảng cáo.
 */
function tuDien(donRows = [], products = []) {
  const ma = new Set();
  const ks = new Set();
  donRows.forEach((d) => (d.dichVu || []).forEach((v) => {
    if (v.kieu === 'ma' && v.khoa) ma.add(v.khoa);
    if (v.kieu === 'ks' && v.khoa) ks.add(v.khoa);
  }));
  products.forEach((p) => { const m = chuanMa(p.code); if (m) ma.add(m); });
  return { ma, ks };
}

/**
 * Đoán sản phẩm từ tên. Mã so theo TỪNG TỪ (để "G2" không khớp nhầm trong
 * "G2CHONTHOM"); tên khách sạn so theo CHUỖI CON (để "COMBOPITO4N3D" ra PITO),
 * chỉ với tên từ 4 ký tự.
 */
function doanTuTen(tens, td) {
  const ra = new Set();
  tens.filter(Boolean).forEach((t) => {
    const tho = boDau(t).toUpperCase();
    const tu = tho.split(/[^A-Z0-9_]+/).map(chuanMa).filter(Boolean);
    tu.forEach((x) => { if (td.ma.has(x)) ra.add(x); });
    const lien = chuanMa(tho);
    td.ks.forEach((k) => { if (k.length >= 4 && lien.includes(k)) ra.add(k); });
  });
  return [...ra];
}

/**
 * Sản phẩm của mỗi quảng cáo (theo ID nền tảng).
 * @param {object} data store.get()
 * @param {object} td   tuDien()
 * @returns {Map<string,{tuKhoa:string[], nguon:'khai'|'doan'|''}>}
 */
function sanPhamTheoQC(data, td) {
  const m = new Map();
  const cMap = data.cMap || {};
  const gMap = data.gMap || {};
  const pMap = data.pMap || {};
  (data.ads || []).forEach((a) => {
    if (!a.extId) return;
    const g = gMap[a.groupId] || {};
    const c = cMap[g.campaignId] || {};
    const khai = (c.productIds || []).map((id) => pMap[id]).filter(Boolean)
      .map((p) => chuanMa(p.code) || tenKhachSan(p.name)).filter(Boolean);
    if (khai.length) { m.set(String(a.extId), { tuKhoa: [...new Set(khai)], nguon: 'khai' }); return; }
    const doan = doanTuTen([c.name, g.name, a.name], td);
    m.set(String(a.extId), { tuKhoa: doan, nguon: doan.length ? 'doan' : '' });
  });
  return m;
}

/**
 * Xếp một đơn theo sản phẩm của quảng cáo.
 *   dung      mọi dịch vụ có khoá đều thuộc sản phẩm quảng cáo
 *   kem       có dịch vụ thuộc sản phẩm quảng cáo, kèm sản phẩm khác
 *   khac      không dịch vụ nào thuộc sản phẩm quảng cáo
 *   khong-ro  đơn không có dịch vụ nào nhận diện được (bản Excel, đơn lạ)
 *   chua-khai quảng cáo chưa biết bán sản phẩm gì
 * Dịch vụ không có khoá (vé bay, xe) là dịch vụ đi kèm, không tính vào đúng/sai.
 */
function xepDon(don, tuKhoa) {
  const dv = (don.dichVu || []).filter((v) => v.khoa);
  const khoa = [...new Set(dv.map((v) => v.khoa))];
  if (!tuKhoa || !tuKhoa.length) return { nhom: 'chua-khai', khoa, tienDung: null };
  if (!dv.length) return { nhom: 'khong-ro', khoa, tienDung: null };
  const k = new Set(tuKhoa);
  const trung = dv.filter((v) => k.has(v.khoa));
  if (!trung.length) return { nhom: 'khac', khoa, tienDung: 0 };
  if (trung.length === dv.length) return { nhom: 'dung', khoa, tienDung: Number(don.tien) || 0 };
  /* Có kèm: chỉ cộng tiền của dịch vụ đúng sản phẩm. Tourwell không trả tiền
   * từng dịch vụ thì để null, màn hình hiện số đơn mà không bịa số tiền. */
  const t = trung.map((v) => v.tien);
  return { nhom: 'kem', khoa, tienDung: t.every((x) => x != null) ? t.reduce((a, b) => a + b, 0) : null };
}

module.exports = {
  boDau, chuanMa, tenKhachSan, maTuTen, khoaDichVu, dichVuTuDonTho, tienDichVu,
  tuDien, doanTuTen, sanPhamTheoQC, xepDon,
};
