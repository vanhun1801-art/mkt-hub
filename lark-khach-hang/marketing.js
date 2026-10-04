'use strict';
/**
 * ============================================================================
 * SỐ LIỆU CHO MARKETING — những con số ĐỔI ĐƯỢC QUYẾT ĐỊNH
 * ============================================================================
 * Anh Hùng 04/10/2026: "trang tổng quan cần thông tin hữu ích hơn cho công
 * việc của Marketing".
 *
 * Bản cũ đếm: bao nhiêu hồ sơ, bao nhiêu đơn, nhóm nào mấy người. Đúng, nhưng
 * đọc xong không làm gì khác đi. Bản này chọn những con số mà nhìn vào là biết
 * nên làm gì tiếp:
 *
 *   · Kênh nào ra TIỀN, không phải kênh nào ra nhiều đơn. Một kênh 222 đơn nhỏ
 *     có thể thua một kênh 41 đơn lớn — đếm đơn thì không bao giờ thấy.
 *   · Khách QUAY LẠI bao nhiêu phần trăm, và kênh nào mang về khách quay lại.
 *     Đây là thước đo chất lượng kênh, khác hẳn thước đo số lượng.
 *   · ĐẶT TRƯỚC bao nhiêu ngày. Biết khách đặt trước trung bình 12 ngày thì
 *     biết quảng cáo cho đợt lễ phải chạy từ lúc nào.
 *   · Ai SẮP ĐI — để nhắn đúng lúc, bán thêm dịch vụ.
 *   · Ai LÂU KHÔNG QUAY LẠI — chính là danh sách remarketing.
 *
 * ĐƠN HUỶ bị loại khỏi mọi phép tính tiền. 27/500 đơn trong mẫu là đơn huỷ;
 * cộng vào thì mọi con số phồng lên mà vẫn trông hợp lý.
 */

const NGAY = 86400000;
const ngay = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
};
/**
 * Đơn này có phải một khoản CHI PHÍ NỘI BỘ không.
 *
 * Phòng kế toán dùng đơn Tourwell để ghi chi phí công ty: "Tạm ứng lương
 * tháng 09 - Nguyễn Văn Tèo", "Phí môi trường tháng 08", "Vệ sinh văn phòng".
 * Chúng lọt vào bảng "sản phẩm bán chạy" của Marketing, đứng chung với tour.
 *
 * Phải đủ CẢ BA điều kiện, vì mỗi điều kiện riêng lẻ đều quá tay — đo trên
 * 1.000 đơn:
 *
 *   tiền = 0 một mình                      → 233 đơn, phần lớn là đơn thật
 *                                            chưa chốt giá
 *   tiền 0 + loại toàn "Dịch vụ khác"      → 145 đơn, vẫn thừa 119
 *   thêm nội dung là khoản chi             → 26 đơn, đúng cái cần bỏ
 *
 * Đã thử lọc theo TÀI KHOẢN và loại bỏ cách đó: cả ba tài khoản ghi chi phí
 * đều có đơn thật (11, 25 và 1 đơn) — lọc theo người là xoá mất doanh thu
 * thật.
 *
 * Danh sách từ khoá chắc chắn sẽ sót khi kế toán viết kiểu mới. Nên app ĐẾM
 * và HIỆN RA số đơn đã loại, để còn soi được chứ không lọc âm thầm.
 */
const TU_CHI_PHI = /t[aạ]m [uứ]ng|l[uư][oơ]ng|chi ph[ií]|v[eệ] sinh|m[oô]i tr[uư][oơ]ng|l[oơ]i nhu[aậ]n|c[oơ]m ng[aà]y|thanh to[aá]n c[aá]c lo[aạ]i|ti[eề]n đi[eệ]n|v[aă]n ph[oò]ng|b[aả]o hi[eể]m|thu[eế]|c[oô]ng t[aá]c ph[ií]|ti[eề]n n[uư][oơ]c|c[uư][oơ]c|kh[aấ]u hao|mua d[aầ]u|mua x[aă]ng|nhi[eê]n li[eệ]u/i;

const laChiPhiNoiBo = (d) => {
  if (Number(d.tien) > 0) return false;
  const dv = d.dichVu || [];
  if (!dv.length) return false;
  if (!dv.every((s) => s.loai === 'Dịch vụ khác')) return false;
  return dv.some((s) => TU_CHI_PHI.test(String(s.ten || '')));
};

/**
 * Đơn này có bị huỷ không.
 *
 * Hỏi BA chỗ chứ không tin một ô. Dữ liệu kéo về từ nhiều đợt, đợt cũ chưa có
 * ô `daHuy` — mà chỉ cần ô ấy vắng mặt là 27/500 đơn huỷ lọt thẳng vào doanh
 * thu, im lặng, và con số vẫn trông hợp lý. Một phép lọc quyết định tiền thì
 * không nên dựa vào đúng một ô có thể vắng.
 */
const laHuy = (d) => d.daHuy === true
  || Number(d.maTT) === 2
  || String(d.trangThai).trim() === '2'
  || /h[uủ][yỷ]/i.test(String(d.trangThai))   /* "hủy" có dấu ở Ủ, không phải ở Y */
  || !!d.huyLuc;

/** Ngày khởi hành sớm nhất của một đơn — mốc để biết khách đi khi nào. */
const ngayDi = (d) => {
  const ds = (d.dichVu || []).map((s) => ngay(s.di)).filter(Boolean);
  return ds.length ? Math.min(...ds) : null;
};

/* Khoảng đặt trước: nhóm theo việc marketing làm gì với nó, không chia đều cho
 * đẹp. 0–3 ngày là khách bốc đồng, cần quảng cáo luôn-và-ngay; trên 30 ngày là
 * khách lên kế hoạch, cần nội dung dài hơi. */
const BAC_DAT_TRUOC = [
  [0, 3, 'Trong 3 ngày'],
  [4, 7, '4–7 ngày'],
  [8, 14, '1–2 tuần'],
  [15, 30, '2–4 tuần'],
  [31, 60, '1–2 tháng'],
  [61, 1e9, 'Trên 2 tháng'],
];

/**
 * Mốc thời gian của một đơn, theo cách đang xem.
 *
 *   'dat' — ngày khách chốt đơn. Đây là ngày của MARKETING: nó khớp với ngày
 *           chi tiền quảng cáo bên app Quảng cáo, nên mới so được "tháng này
 *           tiêu bao nhiêu / thu về bao nhiêu".
 *   'di'  — ngày khởi hành. Đây là ngày của ĐIỀU HÀNH: ai đi tháng này.
 *
 * Hai mốc cho hai con số khác hẳn nhau trên cùng một khoảng ngày, nên phải
 * chọn rõ chứ không được ngầm định rồi để người đọc tự đoán.
 */
const mocDon = (d, theo) => (theo === 'di' ? ngayDi(d) : ngay(d.luc));

/**
 * @param loc {tu, den, theo} — khoảng ngày và mốc tính. Thiếu thì tính toàn bộ.
 *
 * Có ba con số CỐ Ý KHÔNG theo bộ lọc, vì lọc chúng thì thành vô nghĩa:
 *   · "sắp khởi hành" luôn đếm từ hôm nay trở đi;
 *   · "khách im lặng 6/12 tháng" luôn so với hôm nay;
 *   · "khách quay lại" xét TRỌN ĐỜI — một người mua tháng 1 và tháng 10 vẫn là
 *     khách quay lại, lọc về tháng 10 rồi gọi họ là khách mua-một-lần là nói
 *     sai về chính người đó.
 * Màn hình phải ghi rõ mấy chỗ này không theo bộ lọc.
 */
function soLieu(ds, loc = {}) {
  const bayGio = loc.bayGio || Date.now();
  const theo = loc.theo === 'di' ? 'di' : 'dat';
  const tu = loc.tu ? Date.parse(loc.tu + 'T00:00:00+07:00') : null;
  const den = loc.den ? Date.parse(loc.den + 'T23:59:59+07:00') : null;
  const trongKy = (d) => {
    if (tu == null && den == null) return true;
    const m = mocDon(d, theo);
    if (m == null) return false;
    return (tu == null || m >= tu) && (den == null || m <= den);
  };

  const r = {
    ky: { tu: loc.tu || '', den: loc.den || '', theo },

    /* tiền */
    doanhThu: 0, soDon: 0, giaTriTB: 0,
    /* khách */
    tongKhach: ds.length, khachMua: 0, khachQuayLai: 0, tyLeQuayLai: 0,
    doanhThuQuayLai: 0, doanhThuKhachMoi: 0,
    /* kênh */
    kenh: {},          // {ten: {don, tien, khach:Set→số, quayLai}}
    /* thời gian */
    datTruoc: {}, datTruocTB: null, datTruocGiua: null,
    sapDi7: 0, sapDi30: 0, tienSapDi30: 0,
    thangDi: {},       // khởi hành SẮP TỚI, không phải lịch sử
    /* remarketing */
    nguMe: { '6 tháng': { so: 0, tien: 0 }, '12 tháng': { so: 0, tien: 0 } },
    /* sản phẩm */
    tourTien: {}, loaiTien: {},
    /* Doanh thu từng ngày trong kỳ — để vẽ đường. Một bảng con số theo ngày
     * thì không ai đọc; một đường thì nhìn phát thấy ngay hôm nào tụt. */
    theoNgay: {},
    /* chất lượng dữ liệu */
    donHuy: 0, tienDonHuy: 0, donNoiBo: 0,
  };

  /* ---- phần KHÔNG theo bộ lọc, tính trên toàn bộ khách ----
   *
   * Phải là một vòng lặp riêng, chạy trước. Nhét chung vào vòng lặp đã lọc thì
   * khách không có đơn trong kỳ bị bỏ qua từ sớm — và "sắp khởi hành" tụt từ
   * 120 xuống 53 chỉ vì người xem bấm "tháng này", dù chuyến sắp đi chẳng liên
   * quan gì tới việc đơn được đặt khi nào. Gặp thật 04/10/2026. */
  for (const o of ds) {
    const songSot = (o.don || []).filter((d) => !laHuy(d) && !laChiPhiNoiBo(d));
    if (!songSot.length) continue;

    for (const d of songSot) {
      const di = ngayDi(d);
      if (!di || di < bayGio) continue;
      const con = (di - bayGio) / NGAY;
      if (con <= 7) r.sapDi7 += 1;
      if (con <= 30) { r.sapDi30 += 1; r.tienSapDi30 += (Number(d.tien) || 0); }
      const dd = new Date(di);
      const kh = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0');
      r.thangDi[kh] = (r.thangDi[kh] || 0) + 1;
    }

    /* Ngủ mê: đã từng mua nhưng lâu rồi không quay lại. Cũng so với HÔM NAY,
     * không theo kỳ — đây là danh sách để nhắn lại, không phải báo cáo kỳ. */
    const cuoi = Math.max(...songSot.map((d) => ngay(d.luc) || 0));
    if (cuoi) {
      const tienDoi = songSot.reduce((x, d) => x + (Number(d.tien) || 0), 0);
      const cach = (bayGio - cuoi) / NGAY;
      if (cach > 365) { r.nguMe['12 tháng'].so += 1; r.nguMe['12 tháng'].tien += tienDoi; }
      else if (cach > 180) { r.nguMe['6 tháng'].so += 1; r.nguMe['6 tháng'].tien += tienDoi; }
    }
  }

  const bacDat = [];
  for (const o of ds) {
    const songSot = (o.don || []).filter((d) => !laHuy(d) && !laChiPhiNoiBo(d));
    r.donNoiBo += (o.don || []).filter((d) => laChiPhiNoiBo(d) && trongKy(d)).length;
    const don = songSot.filter(trongKy);
    r.donHuy += (o.don || []).filter((d) => laHuy(d) && trongKy(d)).length;
    if (!don.length) continue;

    r.khachMua += 1;
    const tienKhach = don.reduce((s, d) => s + (Number(d.tien) || 0), 0);
    r.doanhThu += tienKhach;
    r.soDon += don.length;

    /* Quay lại = từ hai đơn trở lên. Không dùng "có đơn cũ hơn 30 ngày" hay
     * mẹo tương tự: hai đơn là hai lần quyết định mua, đó mới là thứ marketing
     * muốn đo. */
    /* Trọn đời, không theo kỳ — xem ghi chú ở đầu hàm. */
    const laQuayLai = songSot.length >= 2;
    if (laQuayLai) { r.khachQuayLai += 1; r.doanhThuQuayLai += tienKhach; }
    else r.doanhThuKhachMoi += tienKhach;

    for (const d of don) {
      const t = Number(d.tien) || 0;
      const k = d.nguon || '(không ghi nguồn)';
      const ng = String(mocDon(d, theo) ? new Date(mocDon(d, theo)).toISOString().slice(0, 10) : '');
      if (ng) {
        const x = r.theoNgay[ng] || (r.theoNgay[ng] = { tien: 0, don: 0 });
        x.tien += t; x.don += 1;
      }
      const e = r.kenh[k] || (r.kenh[k] = { don: 0, tien: 0, khach: new Set(), quayLai: 0 });
      e.don += 1; e.tien += t; e.khach.add(o.khoa);
      if (laQuayLai) e.quayLai += 1;

      for (const s of d.dichVu || []) {
        if (s.ten) r.tourTien[s.ten] = (r.tourTien[s.ten] || 0) + t / (d.dichVu.length || 1);
        if (s.loai) r.loaiTien[s.loai] = (r.loaiTien[s.loai] || 0) + t / (d.dichVu.length || 1);
      }

      const dat = ngay(d.luc);
      const di = ngayDi(d);
      if (dat && di) {
        const cach = Math.round((di - dat) / NGAY);
        /* Bỏ số âm: đơn nhập sau khi khách đã đi (ghi bù). Giữ lại thì "đặt
         * trước trung bình" bị kéo xuống bởi thứ không phải hành vi đặt. */
        if (cach >= 0 && cach <= 400) {
          bacDat.push(cach);
          const b = BAC_DAT_TRUOC.find(([a, z]) => cach >= a && cach <= z);
          if (b) r.datTruoc[b[2]] = (r.datTruoc[b[2]] || 0) + 1;
        }
      }
    }
  }

  r.giaTriTB = r.soDon ? Math.round(r.doanhThu / r.soDon) : 0;
  r.tyLeQuayLai = r.khachMua ? r.khachQuayLai / r.khachMua : 0;
  if (bacDat.length) {
    r.datTruocTB = Math.round(bacDat.reduce((a, b) => a + b, 0) / bacDat.length);
    /* Dùng cả TRUNG VỊ: vài đơn đặt trước một năm đủ kéo trung bình lệch hẳn,
     * mà marketing cần con số "đa số khách" chứ không phải con số bị vài ca
     * ngoại lệ kéo đi. */
    const sx = bacDat.slice().sort((a, b) => a - b);
    r.datTruocGiua = sx[Math.floor(sx.length / 2)];
  }
  /* Set không đi qua JSON được — đổi sang số trước khi trả. */
  for (const k of Object.keys(r.kenh)) {
    const e = r.kenh[k];
    r.kenh[k] = {
      don: e.don, tien: e.tien, khach: e.khach.size, quayLai: e.quayLai,
      tbMoiDon: e.don ? Math.round(e.tien / e.don) : 0,
    };
  }
  return r;
}

module.exports = { soLieu, laHuy, laChiPhiNoiBo, mocDon, BAC_DAT_TRUOC };
