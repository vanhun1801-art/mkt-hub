'use strict';
/**
 * ============================================================================
 * CHÂN DUNG KHÁCH HÀNG — rút từ 16.605 khách thật, không phải viết ra rồi tin
 * ============================================================================
 * Anh Hùng 04/10/2026 gửi khung 5 bước dựng Buyer Persona và bảo kết hợp với
 * dữ liệu đang có.
 *
 * Khung đó dựng một chân dung mẫu: "Chị Ngọc, mẹ bỉm đi tour gia đình". Nhưng
 * đo trên dữ liệu thật thì **hơn một nửa khách là B2B**:
 *
 *   Đại lý, đối tác  9.027   ·   Cá nhân  7.082
 *   Cộng tác viên      445   ·   Doanh nghiệp  15
 *
 * Người quyết định mua ở nhánh B2B là một đại lý bán lại, không phải người đi
 * tour. Họ hỏi khác, sợ khác, chốt khác. Nên tách hẳn HAI NHÁNH — anh Hùng đã
 * chốt 04/10/2026 — chứ không nhét chung rồi lấy trung bình của hai thứ không
 * cùng loại.
 *
 * Ranh giới của bộ này: nó chỉ dựng được phần ĐO ĐƯỢC — ai, đi mấy người, mua
 * gì, vào từ kênh nào, đặt trước bao lâu, quay lại không. Thu nhập, nghề
 * nghiệp, động cơ, nỗi sợ thì KHÔNG đo được từ đơn hàng; chỗ đó phải hỏi
 * người, và khi gắn vào phải để riêng, đánh dấu khác màu. Trộn "máy đo được"
 * với "người đoán" vào cùng một bảng là cách nhanh nhất để một bản chân dung
 * trông khoa học mà thật ra là cảm tính.
 */
const { laHuy, laChiPhiNoiBo } = require('./marketing');

const NGAY = 86400000;
const ngay = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };
const ngayDi = (d) => {
  const ds = (d.dichVu || []).map((s) => ngay(s.di)).filter(Boolean);
  return ds.length ? Math.min(...ds) : null;
};

/* Nhóm khách của Tourwell nào thuộc nhánh nào. "Cá nhân" là người đi thật;
 * mọi nhóm còn lại đều là người mua hộ / bán lại. */
const B2C = new Set(['Cá nhân']);
const laB2B = (o) => !!o.nhom && !B2C.has(o.nhom);

/**
 * Chia nhánh B2C theo AI ĐI CÙNG AI.
 *
 * Đây là chiều phân nhóm có sức nặng nhất mà dữ liệu cho được: một người đi
 * một mình, một cặp đôi, và một gia đình có con nhỏ cần ba thông điệp hoàn
 * toàn khác nhau, dù có thể mua cùng một tour.
 *
 * Thứ tự xét có chủ ý: CÓ TRẺ EM xét trước quy mô. Một nhà bốn người có con
 * nhỏ là "gia đình", không phải "nhóm bạn 3–4 người" — gộp nhầm là mất đúng
 * cái nhóm mà nội dung quảng cáo cần nhắm.
 */
function nhomB2C(don) {
  /* "Chưa mua gì" và "có mua nhưng không đếm được số người" là HAI chuyện.
   * Gộp chung thì nhóm đó phình lên 6.999 người và nuốt mất mọi nhóm thật —
   * mà nhìn vào lại tưởng công ty có bảy nghìn khách bí ẩn, trong khi phần lớn
   * chỉ là chưa phát sinh đơn nào. */
  if (!don.length) return 'Chưa phát sinh';
  const coTre = don.some((d) => d.khach && d.khach.coTre);
  if (coTre) return 'Gia đình có trẻ nhỏ';
  const cs = don.map((d) => (d.khach && d.khach.tong) || 0).filter((n) => n > 0);
  /* Đơn khách sạn và vé lẻ không có dòng "Người lớn" nên không đếm được ai đi
   * cùng ai — đo được 40% đơn như vậy. Để riêng chứ đừng đoán bừa. */
  if (!cs.length) return 'Có mua, chưa rõ số khách';
  const tb = cs.reduce((a, b) => a + b, 0) / cs.length;
  if (tb <= 1.4) return 'Đi một mình';
  if (tb <= 2.4) return 'Cặp đôi';
  if (tb <= 8) return 'Nhóm bạn';
  return 'Đoàn lớn';
}

/**
 * Chia nhánh B2B theo MỨC ĐỘ LÀM ĂN, vì đó là thứ quyết định cách chăm.
 * Đại lý ruột cần giữ; đại lý thử việc cần đẩy; đại lý ngủ cần đánh thức.
 */
function nhomB2B(don, doanhThu, bayGio) {
  if (!don.length) return 'Chưa phát sinh';
  const cuoi = Math.max(...don.map((d) => ngay(d.luc) || 0));
  const imLang = cuoi && (bayGio - cuoi) / NGAY > 180;
  if (imLang) return 'Đại lý đã ngủ';
  if (don.length >= 10 || doanhThu >= 300e6) return 'Đại lý ruột';
  if (don.length >= 3) return 'Đại lý thường';
  return 'Đại lý mới / thử việc';
}

const themDem = (o, k) => { if (k) o[k] = (o[k] || 0) + 1; };
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([ten, so]) => ({ ten, so }));

function moi(ten, nhanh) {
  return {
    ten, nhanh, soKhach: 0, soDon: 0, doanhThu: 0, soNguoi: 0,
    coTre: 0, quayLai: 0, kenh: {}, tour: {}, loai: {}, thangDi: {},
    _datTruoc: [], _coKhach: 0,
  };
}

/**
 * Một khách thuộc nhóm nào. Tách riêng để màn hình bấm vào nhóm là lấy được
 * ĐÚNG những người đã được đếm vào nhóm đó — dùng lại chính phép chia này,
 * không viết một bản thứ hai rồi để hai bên trôi xa nhau.
 */
function nhomCua(o, bayGio = Date.now()) {
  const don = (o.don || []).filter((d) => !laHuy(d) && !laChiPhiNoiBo(d));
  const tien = don.reduce((s, d) => s + (Number(d.tien) || 0), 0);
  const nhanh = laB2B(o) ? 'b2b' : 'b2c';
  return { nhanh, ten: nhanh === 'b2b' ? nhomB2B(don, tien, bayGio) : nhomB2C(don), don, tien };
}

/**
 * @param ds  danh sách hồ sơ khách (từ hoso.dung)
 * @returns   { b2c:[...], b2b:[...], tong:{...} }
 */
function dungChanDung(ds, bayGio = Date.now()) {
  const nhom = new Map();
  const tong = { b2c: { khach: 0, tien: 0 }, b2b: { khach: 0, tien: 0 }, chuaRo: 0 };

  for (const o of ds) {
    /* Bỏ luôn đơn chi phí nội bộ — nếu không, "Tạm ứng lương" đứng trong
     * bảng sản phẩm hay mua của nhóm Đại lý ruột. */
    const { nhanh, ten, don, tien } = nhomCua(o, bayGio);
    if (!o.nhom) tong.chuaRo += 1;

    const k = nhanh + '|' + ten;
    const g = nhom.get(k) || moi(ten, nhanh);
    nhom.set(k, g);

    g.soKhach += 1;
    g.soDon += don.length;
    g.doanhThu += tien;
    if (don.length >= 2) g.quayLai += 1;
    tong[nhanh].khach += 1;
    tong[nhanh].tien += tien;

    for (const d of don) {
      themDem(g.kenh, d.nguon || '(không ghi nguồn)');
      for (const s of d.dichVu || []) { themDem(g.tour, s.ten); themDem(g.loai, s.loai); }
      const n = (d.khach && d.khach.tong) || 0;
      if (n > 0) { g.soNguoi += n; g._coKhach += 1; }
      if (d.khach && d.khach.coTre) g.coTre += 1;
      const dat = ngay(d.luc); const di = ngayDi(d);
      if (dat && di) {
        const cach = Math.round((di - dat) / NGAY);
        if (cach >= 0 && cach <= 400) g._datTruoc.push(cach);
      }
      if (di && di >= bayGio) {
        const dd = new Date(di);
        themDem(g.thangDi, dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0'));
      }
    }
  }

  const chot = (g, tienNhanh) => {
    const sx = g._datTruoc.slice().sort((a, b) => a - b);
    return {
      ten: g.ten, nhanh: g.nhanh,
      soKhach: g.soKhach, soDon: g.soDon, doanhThu: g.doanhThu,
      /* Phần doanh thu tính TRONG NHÁNH của nó, không phải trên tổng công ty.
       * So một nhóm đại lý với tổng gồm cả B2C là so hai thứ khác loại. */
      phanTramTien: tienNhanh ? g.doanhThu / tienNhanh : 0,
      tbMoiDon: g.soDon ? Math.round(g.doanhThu / g.soDon) : 0,
      khachMoiDon: g._coKhach ? Math.round((g.soNguoi / g._coKhach) * 10) / 10 : null,
      tbMoiNguoi: g.soNguoi ? Math.round(g.doanhThu / g.soNguoi) : null,
      tyLeCoTre: g.soDon ? g.coTre / g.soDon : 0,
      tyLeQuayLai: g.soKhach ? g.quayLai / g.soKhach : 0,
      datTruocGiua: sx.length ? sx[Math.floor(sx.length / 2)] : null,
      kenh: top(g.kenh, 5), tour: top(g.tour, 5), loai: top(g.loai, 4),
      thangDi: Object.keys(g.thangDi).sort().slice(0, 6).map((m) => ({ ten: m, so: g.thangDi[m] })),
    };
  };

  const ra = { b2c: [], b2b: [], tong };
  for (const g of nhom.values()) ra[g.nhanh].push(chot(g, tong[g.nhanh].tien));
  ra.b2c.sort((a, b) => b.doanhThu - a.doanhThu);
  ra.b2b.sort((a, b) => b.doanhThu - a.doanhThu);
  return ra;
}

module.exports = { dungChanDung, nhomCua, nhomB2C, nhomB2B, laB2B };
