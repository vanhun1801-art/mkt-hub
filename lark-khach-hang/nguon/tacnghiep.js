'use strict';
/**
 * ============================================================================
 * BUỔI TÁC NGHIỆP — công sức ra hiện trường đổi lấy được gì
 * ============================================================================
 * Mảnh cuối trong chuỗi: tiền quảng cáo → bài đăng → ĐI QUAY → đơn hàng.
 *
 * Lịch tác nghiệp ghi mỗi buổi phòng ra hiện trường: ngày nào, ở đâu, quay hay
 * live, ai đi, tốn bao nhiêu. 152 buổi, điền khá đủ (địa điểm 141/152, loại
 * hình 151, chi phí thực 77).
 *
 * NÓI RÕ GIỚI HẠN TRƯỚC KHI AI KỊP HIỂU NHẦM: đây là TƯƠNG QUAN CÓ ĐỘ TRỄ,
 * không phải ghi công. Buổi quay không sinh ra đơn ngay — nó sinh ra nội dung,
 * nội dung mới kéo người, người mới thành đơn, và quãng đó mất nhiều ngày.
 * Nên bảng này chỉ nói "sau buổi quay ấy bảy ngày thì các con số thế nào",
 * và nó CHỈ có nghĩa khi nhìn nhiều buổi cùng lúc. Một buổi tăng, một buổi
 * giảm thì không kết luận được gì — mùa vụ, lễ tết, quảng cáo chạy song song
 * đều ảnh hưởng và app này không tách được chúng ra.
 */
const path = require('path');

/* ĐỌC BASE QUA LỚP CỦA CHÍNH APP ẤY, không tự gọi lark-cli — lark-cli chỉ có
 * trên máy cá nhân, trên Render nó không tồn tại và app sẽ lặng lẽ trả rỗng,
 * trông y như "kỳ này không có số liệu". `lark.js` tự chuyển sang Open API
 * khi cfg.mode === 'api'. */
const CFG = require(path.join(__dirname, '..', '..', 'lark-lich-tac-nghiep', 'config.js'));
const LARK = require(path.join(__dirname, '..', '..', 'lark-lich-tac-nghiep', 'lark.js'));
const F = {
  title: 'fldMvjlOhk', diaDiem: 'fldz2r9RDG', loai: 'fld95sumMx',
  start: 'fldj5zK7xA', end: 'fldwj1Z06o', status: 'fldK5SXHep',
  owner: 'fldDmYi9su', costPlan: 'fldp2Niwos', costActual: 'flduWFHoEQ',
  mediaStatus: 'fldva9vZjw',
};


const chu = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => (x && (x.text || x.name)) || x).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.text || v.name || '');
  return String(v).trim();
};
const sonum = (v) => { const n = Number(chu(v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const ngayVN = (v) => {
  const n = Number(v);
  const d = Number.isFinite(n) && n > 1e11 ? new Date(n + 7 * 3600000) : new Date(chu(v));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

async function doc(tu, den) {
  const recs = await LARK.listAllRecords(CFG.tableId);
  const lay = (r, fid) => r.cells[fid];
  return recs.map((r) => ({
    ngay: ngayVN(lay(r, F.start)),
    ten: chu(lay(r, F.title)),
    noi: chu(lay(r, F.diaDiem)),
    loai: chu(lay(r, F.loai)),
    trangThai: chu(lay(r, F.status)),
    nguoi: chu(lay(r, F.owner)),
    chi: sonum(lay(r, F.costActual)) || sonum(lay(r, F.costPlan)),
    chiThuc: sonum(lay(r, F.costActual)) > 0,
  })).filter((x) => x.ngay && (!tu || x.ngay >= tu) && (!den || x.ngay <= den));
}

const NGAY = 86400000;
const congNgay = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * NGAY).toISOString().slice(0, 10);

/**
 * Sau mỗi buổi tác nghiệp, N ngày tiếp theo các con số thế nào.
 * @param theoNgay  { 'YYYY-MM-DD': {tien, don} }  — doanh thu
 * @param soc       [{ngay, xemTuNhien, nhanTin}]  — số liệu Social
 */
function sauBuoi(buoi, theoNgay, soc, soNgay = 7) {
  const socNgay = {};
  for (const r of (soc || [])) {
    const o = socNgay[r.ngay] || (socNgay[r.ngay] = { xem: 0, nhan: 0 });
    o.xem += r.xemTuNhien || 0; o.nhan += r.nhanTin || 0;
  }
  const cong = (bd, n, lay) => {
    let t = 0;
    for (let i = 0; i < n; i++) t += lay(congNgay(bd, i)) || 0;
    return t;
  };
  const ra = buoi.map((b) => ({
    ...b,
    xemSau: cong(b.ngay, soNgay, (d) => (socNgay[d] || {}).xem),
    nhanSau: cong(b.ngay, soNgay, (d) => (socNgay[d] || {}).nhan),
    donSau: cong(b.ngay, soNgay, (d) => ((theoNgay || {})[d] || {}).don),
    tienSau: cong(b.ngay, soNgay, (d) => ((theoNgay || {})[d] || {}).tien),
  })).sort((a, b) => b.ngay.localeCompare(a.ngay));

  /* Gộp theo LOẠI HÌNH — đây mới là chỗ nhiều buổi gộp lại thành một kết luận
   * dùng được. Một buổi riêng lẻ thì mùa vụ và quảng cáo chạy song song đủ
   * làm nhiễu hết. */
  const theoLoai = {};
  for (const b of ra) {
    const k = b.loai || '(không ghi loại)';
    const o = theoLoai[k] || (theoLoai[k] = { loai: k, soBuoi: 0, chi: 0, xemSau: 0, nhanSau: 0, donSau: 0, tienSau: 0 });
    o.soBuoi += 1; o.chi += b.chi;
    o.xemSau += b.xemSau; o.nhanSau += b.nhanSau; o.donSau += b.donSau; o.tienSau += b.tienSau;
  }
  /* CHỈ trả trung bình mỗi buổi, KHÔNG trả tổng.
   *
   * Cửa sổ bảy ngày của 44 buổi livestream chồng lên nhau gần hết, nên cộng
   * lại là cùng một đơn bị đếm mấy chục lần — bản đầu hiện "7.462 đơn sau
   * livestream" trong khi cả kỳ chỉ có vài trăm đơn. Một con số to và sai.
   *
   * Trung bình mỗi buổi cũng bị cửa sổ chồng nhau làm phồng, nhưng phồng
   * ĐỀU NHAU giữa các loại hình, nên còn dùng để SO loại này với loại kia.
   * Tuyệt đối không đọc nó như "một buổi livestream đem về 7,8 tin nhắn". */
  const loai = Object.values(theoLoai).map((o) => ({
    loai: o.loai, soBuoi: o.soBuoi, chi: o.chi,
    xemMoiBuoi: o.soBuoi ? Math.round(o.xemSau / o.soBuoi) : 0,
    nhanMoiBuoi: o.soBuoi ? Math.round((o.nhanSau / o.soBuoi) * 10) / 10 : 0,
    donMoiBuoi: o.soBuoi ? Math.round((o.donSau / o.soBuoi) * 10) / 10 : 0,
    chiMoiBuoi: o.soBuoi ? Math.round(o.chi / o.soBuoi) : 0,
  })).sort((a, b) => b.soBuoi - a.soBuoi);

  return { buoi: ra, loai, soNgay };
}

module.exports = { doc, sauBuoi };
