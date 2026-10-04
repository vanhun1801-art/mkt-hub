'use strict';
/**
 * ============================================================================
 * GIÁ CÔNG BỐ — để biết đang bán rẻ hơn niêm yết bao nhiêu
 * ============================================================================
 * Khách lo nhất là GIÁ: 43/206 tin nhắn, bỏ xa mọi mối lo khác. Nhưng tới giờ
 * app chỉ biết giá BÁN THẬT, không biết giá NIÊM YẾT — nên không trả lời được
 * câu "mình đang giảm sâu bao nhiêu, cho ai, qua kênh nào".
 *
 * App Sản phẩm giữ sẵn giá công bố cho người lớn và trẻ em, cộng USP, ưu đãi
 * đang chạy, tệp khách nhắm tới và chính sách trẻ em. Đọc thẳng Base của nó,
 * KHÔNG chép số sang đây — chép là hai nơi trôi xa nhau, rồi hai app cùng nói
 * về "giá tour Hòn Thơm" mà ra hai con số.
 */
const path = require('path');

/* ĐỌC BASE QUA LỚP CỦA CHÍNH APP ẤY, không tự gọi lark-cli.
 *
 * lark-cli chỉ có trên máy cá nhân; trên Render nó KHÔNG tồn tại. Tự gọi
 * lark-cli thì bản local chạy ngon còn bản thật im lặng trả rỗng — và một app
 * hiện bảng trống trông y như "kỳ này không có số liệu", không ai đoán được
 * là nó đang hỏng.
 *
 * `lark.js` của mỗi app tự chuyển sang Open API khi cfg.mode === 'api'. Mượn
 * đúng lớp đó thì chạy được cả hai nơi mà không phải viết thêm dòng nào. */
const CFG = require(path.join(__dirname, '..', '..', 'lark-san-pham', 'config.js'));
const LARK = require(path.join(__dirname, '..', '..', 'lark-san-pham', 'lark.js'));
const F = CFG.f.sp;

/* Dùng lark-cli giống mọi app khác trên máy này. Trên Render sẽ phải đổi sang
 * tenant token; để lại ghi chú vì bản này đang là bản local. */

const chu = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => (x && (x.text || x.name || x.ten)) || x).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.text || v.name || '');
  return String(v).trim();
};
const soTien = (v) => {
  const n = Number(String(chu(v)).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Đọc toàn bộ sản phẩm. Bảng chỉ vài trăm dòng nên một lượt là xong. */
async function doc() {
  const recs = await LARK.listAllRecords(CFG.spTableId);
  const lay = (r, fid) => r.cells[fid];
  return recs.map((r) => ({
    ma: chu(lay(r, F.ma)),
    ten: chu(lay(r, F.ten)),
    nhom: chu(lay(r, F.nhom)),
    trangThai: chu(lay(r, F.trangThai)),
    giaNL: soTien(lay(r, F.giaNL)),
    giaTE: soTien(lay(r, F.giaTE)),
    usp: chu(lay(r, F.usp)),
    uuDai: chu(lay(r, F.uuDai)),
    doiTuong: chu(lay(r, F.doiTuong)),
    tepKhach: chu(lay(r, F.tepKhach)),
    csTreEm: chu(lay(r, F.csTreEm)),
  })).filter((x) => x.ten || x.ma);
}

/* ---------------------------------------------------------------------------
 * GHÉP TÊN SẢN PHẨM VỚI TÊN DỊCH VỤ TRÊN ĐƠN
 *
 * Đây là chỗ dễ nói dối nhất. Tên trên Base Sản phẩm ("Tour cano 4 đảo") và
 * tên ghi trên đơn Tourwell ("*CB4N - DỊCH VỤ THAM QUAN TRỌN GÓI") do hai
 * người khác nhau gõ, hai lúc khác nhau. Ghép lỏng tay là gán nhầm giá niêm
 * yết của tour này cho tour kia, và con số "giảm bao nhiêu phần trăm" thành
 * bịa đặt — mà vẫn trông rất hợp lý.
 *
 * Nên chỉ nhận ba kiểu khớp, theo thứ tự chắc chắn giảm dần, và BẤT KỲ cái
 * nào không khớp thì để trống chứ không đoán gần đúng.
 * ------------------------------------------------------------------------- */
const boDau = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function lapBanDo(sps) {
  const theoMa = new Map(), theoTen = new Map();
  for (const s of sps) {
    if (s.ma) theoMa.set(boDau(s.ma), s);
    if (s.ten) theoTen.set(boDau(s.ten), s);
  }
  return { theoMa, theoTen };
}

/** Tìm sản phẩm ứng với một tên dịch vụ trên đơn. Không chắc thì trả null. */
function timSP(tenDichVu, bd) {
  const t = boDau(tenDichVu);
  if (!t) return null;
  /* 1. Mã sản phẩm xuất hiện nguyên vẹn trong tên dịch vụ (vd "*CB4N - ..."
   *    chứa mã "CB4N"). Chắc chắn nhất. Chỉ nhận mã từ 2 ký tự trở lên để
   *    tránh mã một chữ khớp bừa vào mọi chuỗi. */
  for (const [ma, sp] of bd.theoMa) {
    if (ma.length >= 2 && new RegExp('(^| )' + ma + '( |$)').test(t)) return { sp, cach: 'mã' };
  }
  /* 2. Tên trùng khít. */
  if (bd.theoTen.has(t)) return { sp: bd.theoTen.get(t), cach: 'tên khít' };
  /* 3. Tên sản phẩm nằm trọn trong tên dịch vụ, và đủ dài để không khớp bừa.
   *    Dưới 12 ký tự thì bỏ: "tour" hay "khách sạn" lọt vào mọi dòng. */
  for (const [ten, sp] of bd.theoTen) {
    if (ten.length >= 12 && t.includes(ten)) return { sp, cach: 'tên nằm trong' };
  }
  return null;
}

/**
 * So giá bán thật với giá công bố.
 * @param ds hồ sơ khách (từ hoso.dung) — đã kèm đơn và số khách
 */
function soGia(ds, sps, { laHuy, laChiPhiNoiBo }) {
  const bd = lapBanDo(sps);
  const theoSP = {};
  let khop = 0, khongKhop = 0, khongTinhDuoc = 0, boQuaGop = 0;
  const chuaKhop = {};

  for (const o of ds) {
    for (const d of (o.don || [])) {
      if (laHuy(d) || laChiPhiNoiBo(d)) continue;
      const soNguoi = (d.khach && d.khach.tong) || 0;
      const dvs = (d.dichVu || []).filter((s) => s.ten);
      if (!dvs.length) continue;
      /* CHỈ so giá trên đơn có ĐÚNG MỘT dịch vụ.
       *
       * Đơn gộp nhiều dịch vụ thì không có cách nào biết dịch vụ nào chiếm
       * bao nhiêu tiền. Thử chia đều rồi đo: ra "bán thấp hơn niêm yết 60%"
       * cho gần như mọi sản phẩm — một con số đều đặn đến mức đáng ngờ, và
       * đúng là sai: chia đều làm tour chính gánh chung tiền với mấy dịch vụ
       * phụ rẻ hơn nó nhiều lần.
       *
       * Thà so được ít mà đúng. Đơn gộp vẫn được đếm vào phần "chưa so được"
       * để người đọc biết mình đang nhìn bao nhiêu phần của bức tranh. */
      if (dvs.length > 1) { boQuaGop += dvs.length; continue; }
      const tienMoiDV = (Number(d.tien) || 0);
      for (const s of dvs) {
        const t = timSP(s.ten, bd);
        if (!t) {
          khongKhop += 1;
          chuaKhop[s.ten] = (chuaKhop[s.ten] || 0) + 1;
          continue;
        }
        khop += 1;
        const k = t.sp.ma || t.sp.ten;
        const e = theoSP[k] || (theoSP[k] = {
          ma: t.sp.ma, ten: t.sp.ten, giaNL: t.sp.giaNL, giaTE: t.sp.giaTE,
          usp: t.sp.usp, uuDai: t.sp.uuDai, tepKhach: t.sp.tepKhach, csTreEm: t.sp.csTreEm,
          soDon: 0, tien: 0, soNguoi: 0, cach: t.cach, theoKenh: {},
        });
        e.soDon += 1;
        e.tien += tienMoiDV;
        e.soNguoi += soNguoi;
        const kn = d.nguon || '(không ghi nguồn)';
        const x = e.theoKenh[kn] || (e.theoKenh[kn] = { don: 0, tien: 0, nguoi: 0 });
        x.don += 1; x.tien += tienMoiDV; x.nguoi += soNguoi;
      }
    }
  }

  const ra = [];
  for (const e of Object.values(theoSP)) {
    /* Giá bán thật MỖI KHÁCH mới so được với giá công bố — giá công bố là
     * giá một người. So giá cả đơn với giá một người là sai hẳn thang. */
    const thucMoiNguoi = e.soNguoi > 0 ? Math.round(e.tien / e.soNguoi) : null;
    if (thucMoiNguoi == null || !e.giaNL) khongTinhDuoc += 1;
    ra.push({
      ...e,
      thucMoiNguoi,
      lech: (thucMoiNguoi != null && e.giaNL) ? thucMoiNguoi - e.giaNL : null,
      lechPt: (thucMoiNguoi != null && e.giaNL) ? (thucMoiNguoi - e.giaNL) / e.giaNL : null,
      kenh: Object.entries(e.theoKenh)
        .map(([ten, x]) => ({ ten, don: x.don, moiNguoi: x.nguoi > 0 ? Math.round(x.tien / x.nguoi) : null }))
        .sort((a, b) => b.don - a.don).slice(0, 5),
    });
  }
  ra.sort((a, b) => b.tien - a.tien);
  return {
    sp: ra, khop, khongKhop, khongTinhDuoc, boQuaGop,
    chuaKhop: Object.entries(chuaKhop).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([ten, so]) => ({ ten, so })),
  };
}

module.exports = { doc, soGia, timSP, lapBanDo };
