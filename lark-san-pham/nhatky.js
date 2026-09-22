'use strict';
/**
 * ============================================================================
 * Nhật ký thay đổi — và bảng tin sản phẩm dựng từ đó
 * ============================================================================
 *
 * Anh Hùng: "các thay đổi trong sản phẩm sẽ biến thành tin tức được cập nhật tự
 * động trên bảng tin tổng quát để tất cả cùng nắm".
 *
 * Để loan tin thì phải biết CÁI GÌ vừa đổi. Trạng thái hiện tại của Base không
 * trả lời được câu đó — nhìn vào bảng Sản phẩm chỉ thấy giá đang là 800.000đ,
 * không thấy hôm qua nó là 900.000đ. Nên mọi đường ghi của app đều để lại một
 * dòng ở đây trước, rồi tin tức dựng từ nhật ký.
 *
 * ---------------------------------------------------------------------------
 * GHI KHÔNG ĐƯỢC LÀM HỎNG VIỆC CHÍNH
 *
 * Ghi nhật ký là việc PHỤ. Base chậm hay lỗi lúc ghi nhật ký thì thao tác của
 * người dùng vẫn phải coi như xong — họ đã thấy giá đổi trên màn hình rồi. Nên
 * mọi lời gọi ở đây tự nuốt lỗi và chỉ in ra, không ném lên trên.
 *
 * ---------------------------------------------------------------------------
 * GỘP THEO LÔ
 *
 * Một lần "đặt mức ưu tiên cho 30 sản phẩm" sinh 30 dòng nhật ký. Nếu mỗi dòng
 * thành một tin thì bảng tin ngập 30 tin giống hệt nhau. Nên mỗi thao tác hàng
 * loạt và mỗi đợt lịch mang một mã LÔ; bảng tin gộp cùng lô lại thành một tin
 * "30 sản phẩm chuyển sang …".
 */
const cfg = require('./config');

const F = cfg.f.nhatKy;

/** Giờ VN dạng Base nhận. Cùng lối với lich.js — Render chạy UTC. */
function gioBase(t) {
  const d = new Date(t + 7 * 3600000);
  const h = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + h(d.getUTCMonth() + 1) + '-' + h(d.getUTCDate()) +
    ' ' + h(d.getUTCHours()) + ':' + h(d.getUTCMinutes()) + ':' + h(d.getUTCSeconds());
}

const maLo = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Rút gọn giá trị cho dễ đọc trong một dòng tin. */
function gon(v, tran = 70) {
  const s = v == null || v === '' ? '(trống)' : String(v).replace(/\s+/g, ' ').trim();
  return s.length > tran ? s.slice(0, tran) + '…' : s;
}

/**
 * Ghi một lô thay đổi.
 *
 * @param lark    backend ghi
 * @param ds      [{ spId, ma, ten, cot, cu, moi }]
 * @param meta    { nguon, nguoi, lo? }
 */
async function ghi(lark, ds, meta) {
  if (!ds || !ds.length) return;
  const luc = gioBase(Date.now());
  const lo = meta.lo || maLo();
  const rows = ds.map((x) => ({
    [F.noiDung]: (x.ma || x.ten || '?') + ' · ' + x.cot,
    [F.sanPham]: x.spId ? [{ id: x.spId }] : null,
    [F.cot]: x.cot,
    [F.giaTriCu]: gon(x.cu, 500),
    [F.giaTriMoi]: gon(x.moi, 500),
    [F.nguon]: meta.nguon,
    [F.nguoiDoi]: meta.nguoi || '',
    [F.luc]: luc,
    [F.lo]: lo,
  }));
  try {
    await lark.createMany(rows, cfg.nhatKyTableId);
  } catch (e) {
    /* Việc phụ — không được làm hỏng việc chính. */
    console.error('[NHẬT KÝ] không ghi được:', e.message);
  }
}

/* ---------------- đọc + dựng tin ---------------- */

function veDong(r, chu, mot, ms, idLink) {
  const c = r.cells || {};
  return {
    id: r.record_id,
    ten: chu(c[F.noiDung]),
    spIds: idLink(c[F.sanPham]),
    cot: chu(c[F.cot]),
    cu: chu(c[F.giaTriCu]),
    moi: chu(c[F.giaTriMoi]),
    nguon: mot(c[F.nguon]),
    nguoi: chu(c[F.nguoiDoi]),
    luc: ms(c[F.luc]),
    lo: chu(c[F.lo]),
  };
}

const NGAY = 86400000;

/**
 * Dựng tin cho bảng tin tổng quát.
 *
 * Gộp theo LÔ + CỘT: một thao tác hàng loạt ra một tin, một sửa lẻ ra một tin.
 * Chỉ lấy trong `soNgay` ngày gần đây — bảng tin là nơi "có gì mới", không phải
 * kho lưu trữ; muốn tra đủ thì mở bảng Nhật ký thay đổi trên Base.
 */
function dungTin(dsLog, tenTheoId, baseUrl, soNgay = 14, tran = 12) {
  const moc = Date.now() - soNgay * NGAY;
  const nhom = new Map();
  for (const r of dsLog) {
    if (!r.luc || r.luc < moc || !r.cot) continue;
    const khoa = (r.lo || r.id) + '|' + r.cot;
    if (!nhom.has(khoa)) nhom.set(khoa, []);
    nhom.get(khoa).push(r);
  }

  const tin = [];
  for (const [khoa, rs] of nhom) {
    const dau = rs[0];
    const ten = (r) => tenTheoId.get(r.spIds[0]) || r.ten || '?';
    const nhieuSP = rs.length > 1;
    const tieuDe = nhieuSP
      ? rs.length + ' sản phẩm đổi ' + dau.cot.toLowerCase()
      : ten(dau) + ' — đổi ' + dau.cot.toLowerCase();
    const noiDung = nhieuSP
      ? rs.slice(0, 8).map(ten).join(' · ') + (rs.length > 8 ? ' …' : '') +
        '\n' + dau.cot + ': ' + gon(dau.moi)
      : dau.cot + ': ' + gon(dau.cu) + ' → ' + gon(dau.moi);
    tin.push({
      recordId: 'nk-' + khoa,
      tieuDe,
      noiDung,
      mucDo: 'Tin',
      nhanNut: 'Mở Base sản phẩm',
      lienKet: baseUrl,
      tuNgay: dau.luc,
      denNgay: 0,
      tep: [],
      daDoc: false,
      /* Cho lớp vỏ biết tin này do máy dựng, không phải quản lý soạn — nó không
         bao giờ được biến thành popup chặn màn hình. */
      tuDong: true,
      nguon: dau.nguon,
      nguoi: dau.nguoi,
    });
  }

  return tin.sort((a, b) => b.tuNgay - a.tuNgay).slice(0, tran);
}

module.exports = { ghi, veDong, dungTin, gioBase, maLo, gon };
