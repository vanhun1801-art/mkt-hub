'use strict';
/**
 * Ghi công doanh thu về từng quảng cáo, rồi tính ROAS.
 *
 * HAI ĐƯỜNG, độ tin khác nhau, và phải nói rõ dòng nào đi đường nào:
 *
 *   1. POS — khoá cứng. Đơn POS mang ĐỒNG THỜI `ad_id` và ghi chú `LU####`.
 *      Không phải đoán gì. Đây là đường của Facebook.
 *
 *   2. Hội thoại — khoá là SỐ ĐIỆN THOẠI. Hội thoại mang `ad_ids` và số điện thoại;
 *      ghép số đó với lead Tourwell. Yếu hơn: một số điện thoại có thể thuộc nhiều
 *      lead, và `has_phone` của Pancake đếm thiếu. Đây là đường duy nhất của TikTok,
 *      vì TikTok KHÔNG sinh đơn POS (đã kiểm: 586 đơn POS/3 tháng, 100% từ page
 *      Facebook).
 *
 * Ba quy tắc giữ cho số không phồng:
 *   - Một đơn chỉ được ghi công MỘT lần. Đường POS được ưu tiên.
 *   - Hội thoại hoặc lead quy về NHIỀU quảng cáo thì không ghi công cho ai cả —
 *     báo ra ở `nhapNhang` thay vì chọn bừa một cái.
 *   - Chỉ tính đơn tạo SAU ngày lead và trong `cuaSo` ngày. Đơn tạo trước lead là
 *     khách cũ: quảng cáo hôm nay không sinh ra doanh thu hôm qua.
 *
 * Số liệu thực đo được (02/08–31/08/2026): độ trễ lead→đơn có trung vị 0 ngày, 90%
 * dưới 2 ngày, xa nhất 6. Nên cuaSo 60 ngày là rất rộng — nó ở đó để chịu được
 * ngành khác, không phải để nới cho khớp.
 */

const cachNgay = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * @param {object} p
 * @param {Array}  p.posRows      đơn POS đã chuẩn hoá (sync/pancakepos)
 * @param {Array}  p.hoiThoaiRows hội thoại đã chuẩn hoá (sync/pancake)
 * @param {Array}  p.leadRows     lead từ bản xuất Tourwell (sync/tourwell)
 * @param {Array}  p.donRows      đơn từ bản xuất Tourwell
 * @param {object} p.data         store.get() — để lấy tên và chi tiêu theo quảng cáo
 * @param {string} p.from,p.to    khoảng ngày tính chi tiêu
 * @param {number} p.cuaSo        số ngày tối đa từ lead tới đơn
 */
function tinh({ posRows = [], hoiThoaiRows = [], leadRows = [], donRows = [], data, from, to, cuaSo = 60 }) {
  /* ---------- tra cứu ---------- */
  const leadTheoId = new Map();
  const leadTheoSdt = new Map();
  leadRows.forEach((r) => {
    if (r.id != null && !leadTheoId.has(r.id)) leadTheoId.set(r.id, r);
    if (r.sdt) {
      if (!leadTheoSdt.has(r.sdt)) leadTheoSdt.set(r.sdt, []);
      leadTheoSdt.get(r.sdt).push(r);
    }
  });
  const donTheoKH = new Map();
  donRows.forEach((r) => {
    if (!r.kh) return;
    if (!donTheoKH.has(r.kh)) donTheoKH.set(r.kh, []);
    donTheoKH.get(r.kh).push(r);
  });

  const adTheoExt = new Map();
  const adTheoRec = new Map();
  (data.ads || []).forEach((a) => {
    adTheoRec.set(a.id, a);
    if (a.extId) adTheoExt.set(String(a.extId), a);
  });
  const chiAd = new Map();
  (data.daily || []).forEach((r) => {
    if (from && r.date < from) return;
    if (to && r.date > to) return;
    const a = adTheoRec.get(r.adId);
    if (!a || !a.extId) return;
    const k = String(a.extId);
    chiAd.set(k, (chiAd.get(k) || 0) + (r.spend || 0));
  });

  /* ---------- ghi công ---------- */
  const theoAd = new Map();
  const daDungDon = new Set();
  const nhat = { nhapNhangPOS: 0, nhapNhangHoiThoai: 0, leadKhongCoTrongXuat: 0, sdtKhongKhopLead: 0, sdtNhieuLead: 0 };

  const layO = (adId, duong) => {
    const k = `${adId}|${duong}`;
    if (!theoAd.has(k)) theoAd.set(k, { adId, duong, lead: 0, don: 0, tien: 0, thu: 0, treTong: 0 });
    return theoAd.get(k);
  };

  /** Ghi công mọi đơn hợp lệ của một lead cho một quảng cáo. */
  const ghi = (o, lead) => {
    if (!lead.ngay || !lead.kh) return 0;
    let n = 0;
    (donTheoKH.get(lead.kh) || []).forEach((d) => {
      if (!d.ngay) return;
      const tre = cachNgay(lead.ngay, d.ngay);
      if (tre < 0 || tre > cuaSo) return;
      if (daDungDon.has(d.ma)) return;
      daDungDon.add(d.ma);
      o.don += 1;
      o.tien += d.tien;
      o.thu += d.thu;
      o.treTong += tre;
      n += 1;
    });
    return n;
  };

  // --- đường 1: POS (khoá cứng), chạy TRƯỚC để giữ quyền ưu tiên
  const leadTheoAd = new Map();   // leadId → Set(adId)
  posRows.forEach((r) => {
    if (r.leadId == null || !r.adId) return;
    if (!leadTheoAd.has(r.leadId)) leadTheoAd.set(r.leadId, new Set());
    leadTheoAd.get(r.leadId).add(r.adId);
  });
  leadTheoAd.forEach((ads, leadId) => {
    if (ads.size !== 1) { nhat.nhapNhangPOS += 1; return; }
    const lead = leadTheoId.get(leadId);
    if (!lead) { nhat.leadKhongCoTrongXuat += 1; return; }
    const adId = [...ads][0];
    const o = layO(adId, 'POS');
    o.lead += 1;
    ghi(o, lead);
  });

  // --- đường 2: hội thoại (khoá số điện thoại)
  hoiThoaiRows.forEach((h) => {
    const ads = [...new Set(h.adIds || [])];
    if (!ads.length) return;
    if (ads.length > 1) { nhat.nhapNhangHoiThoai += 1; return; }
    const sdt = (h.sdt || []).filter(Boolean);
    if (!sdt.length) return;
    let lead = null;
    for (const p of sdt) {
      const ds = leadTheoSdt.get(p);
      if (!ds || !ds.length) continue;
      if (ds.length > 1) {
        /* Một số điện thoại nhiều lead: chọn lead có ngày GẦN NHẤT TRƯỚC hội thoại.
         * Không chọn lead mới nhất tuyệt đối — khách quay lại sau vài tháng thì lead
         * mới không phải cái sinh ra bởi hội thoại này. */
        nhat.sdtNhieuLead += 1;
        const hop = ds.filter((x) => x.ngay && h.ngay && x.ngay <= h.ngay);
        lead = (hop.length ? hop : ds).sort((a, b) => (a.ngay < b.ngay ? 1 : -1))[0];
      } else lead = ds[0];
      if (lead) break;
    }
    if (!lead) { nhat.sdtKhongKhopLead += 1; return; }
    const o = layO(ads[0], 'hội thoại');
    o.lead += 1;
    ghi(o, lead);
  });

  /* ---------- bảng ---------- */
  const rows = [...theoAd.values()].map((o) => {
    const a = adTheoExt.get(String(o.adId)) || {};
    const spend = chiAd.get(String(o.adId)) || 0;
    return {
      adId: o.adId,
      ten: a.name || '',
      coTrongBase: !!a.name,
      nenTang: a.platform || '',
      duong: o.duong,
      spend,
      lead: o.lead,
      don: o.don,
      tien: o.tien,
      thu: o.thu,
      treTB: o.don ? Math.round(o.treTong / o.don) : null,
      roas: spend ? o.tien / spend : null,
      roasThu: spend ? o.thu / spend : null,
      giaMoiLead: o.lead ? Math.round(spend / o.lead) : null,
    };
  }).filter((r) => r.don > 0)
    .sort((x, y) => y.tien - x.tien);

  /* ---------- theo kênh ---------- */
  const kenh = new Map();
  rows.forEach((r) => {
    const k = r.nenTang || '(chưa rõ)';
    if (!kenh.has(k)) kenh.set(k, { nenTang: k, spendGhep: 0, tien: 0, thu: 0, don: 0, lead: 0 });
    const o = kenh.get(k);
    o.spendGhep += r.spend; o.tien += r.tien; o.thu += r.thu; o.don += r.don; o.lead += r.lead;
  });
  // chi tiêu CẢ KỲ theo nền tảng, để ROAS là sàn dưới chứ không phải số tô hồng
  const chiKy = new Map();
  (data.daily || []).forEach((r) => {
    if (from && r.date < from) return;
    if (to && r.date > to) return;
    const p = r.platform || '(chưa gán)';
    chiKy.set(p, (chiKy.get(p) || 0) + (r.spend || 0));
  });
  const theoKenh = [...new Set([...kenh.keys(), ...chiKy.keys()])].map((k) => {
    const o = kenh.get(k) || { spendGhep: 0, tien: 0, thu: 0, don: 0, lead: 0 };
    const spendKy = chiKy.get(k) || 0;
    return {
      nenTang: k, spendKy, spendGhep: o.spendGhep,
      tien: o.tien, thu: o.thu, don: o.don, lead: o.lead,
      roas: spendKy ? o.tien / spendKy : null,
      roasThu: spendKy ? o.thu / spendKy : null,
      phu: spendKy ? o.spendGhep / spendKy : null,
    };
  }).sort((a, b) => b.spendKy - a.spendKy);

  const tongTien = rows.reduce((a, r) => a + r.tien, 0);
  const tongThu = rows.reduce((a, r) => a + r.thu, 0);
  const tongChiKy = [...chiKy.values()].reduce((a, b) => a + b, 0);

  return {
    from, to, cuaSo,
    rows, theoKenh,
    tong: {
      chiKy: tongChiKy,
      tien: tongTien,
      thu: tongThu,
      don: rows.reduce((a, r) => a + r.don, 0),
      lead: rows.reduce((a, r) => a + r.lead, 0),
      roas: tongChiKy ? tongTien / tongChiKy : null,
      roasThu: tongChiKy ? tongThu / tongChiKy : null,
    },
    nhat,
    donKhongGhep: {
      so: donRows.length - daDungDon.size,
      tien: donRows.filter((d) => !daDungDon.has(d.ma)).reduce((a, d) => a + d.tien, 0),
    },
  };
}

module.exports = { tinh };
