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

/* Lý do một đơn KHÔNG ghép được quảng cáo — ba nhóm, dùng chung nhãn ở mọi nơi
 * hiển thị (bảng Đơn gần nhất, ghi chú trên Base) để khỏi lệch chữ. Cố tình
 * KHÔNG cố đoán chi tiết hơn (vd. lead nào, tại sao nhập nhằng) — bảng Đơn gần
 * nhất chỉ cần đủ để người đọc tin "Khác" là thật, không cần dựng lại cả phép
 * ghép cho từng dòng. */
const NHAN_LY_DO = {
  'khong-co-lead': 'Không có lead Tourwell nào của khách này',
  'ngoai-cua-so': 'Có lead nhưng đơn nằm ngoài cửa sổ quy đổi (đơn tạo trước lead, hoặc quá xa ngày lead)',
  'lead-chua-ghep-qc': 'Có lead trong cửa sổ nhưng lead đó chưa ghép được với đúng một quảng cáo (chưa thấy trong Pancake/POS, hoặc khớp nhiều quảng cáo)',
};

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
  // Chiều ngược: khách hàng → các lead của khách đó. Chỉ dùng để GIẢI THÍCH vì
  // sao một đơn không ghép được quảng cáo, không dùng để ghi công.
  const leadTheoKh = new Map();
  leadRows.forEach((r) => {
    if (!r.kh) return;
    if (!leadTheoKh.has(r.kh)) leadTheoKh.set(r.kh, []);
    leadTheoKh.get(r.kh).push(r);
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
  /* Đơn -> quảng cáo đã ghi công cho nó. Bảng ROAS gom theo quảng cáo nên không
   * ai truy được chiều ngược lại; mà chiều ngược lại mới là thứ cần khi muốn ghi
   * đúng cột Kênh cho từng dòng doanh thu. */
  const ghiCongDon = new Map();
  const nhat = { nhapNhangPOS: 0, nhapNhangHoiThoai: 0, leadKhongCoTrongXuat: 0, sdtKhongKhopLead: 0, sdtNhieuLead: 0 };

  const layO = (adId, duong) => {
    const k = `${adId}|${duong}`;
    if (!theoAd.has(k)) theoAd.set(k, { adId, duong, lead: 0, don: 0, tien: 0, thu: 0, treTong: 0 });
    return theoAd.get(k);
  };

  /** Ghi công mọi đơn hợp lệ của một lead cho một quảng cáo. */
  const ghi = (o, lead, hoiThoaiId = '') => {
    if (!lead.ngay || !lead.kh) return 0;
    let n = 0;
    (donTheoKH.get(lead.kh) || []).forEach((d) => {
      if (!d.ngay) return;
      const tre = cachNgay(lead.ngay, d.ngay);
      if (tre < 0 || tre > cuaSo) return;
      if (daDungDon.has(d.ma)) return;
      daDungDon.add(d.ma);
      ghiCongDon.set(String(d.ma), {
        adId: o.adId, duong: o.duong, maLead: lead.ma || '', leadId: lead.id,
        /* Hội thoại nào sinh ra đơn này. Đường POS không đi qua hội thoại nào
         * nên để rỗng — và chỗ rỗng đó chính là câu trả lời cho "sao ra doanh
         * thu mà không thấy hội thoại nào chuyển đổi". */
        hoiThoaiId: hoiThoaiId || '',
      });
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
    ghi(o, lead, h.id);
  });

  /* ---------- phân loại hội thoại (chất lượng lead từ quảng cáo) ----------
   * Ba nhóm theo ĐÚNG yêu cầu: dựa vào có để lại số điện thoại và có ra đơn
   * hay không — KHÔNG dùng tag CSKH (team chưa gắn tag nào cho việc này, gắn
   * tay thì cảm tính và dễ sai). Chỉ xét hội thoại INBOX có gắn ad_ids: hội
   * thoại không đến từ quảng cáo không thuộc câu hỏi "lead quảng cáo".
   *
   * ĐỘC LẬP với phần ghi công doanh thu ở trên (không dùng chung `daDungDon`):
   * ghi công doanh thu không được đếm một đơn hai lần, nhưng "khách này từng
   * mua chưa" thì hai hội thoại của cùng một khách được phép cùng trả lời
   * "có" — đó là hai câu hỏi khác nhau, không phải cùng một phép tính.
   *
   * `nguonPhanLoai: 'heuristic'` cố tình để riêng một trường — chỗ cắm sau
   * này nếu có AI đọc hội thoại đánh giá lại, không phải sửa lại hình dạng dữ
   * liệu ở nơi khác đang dùng nó. */
  /* Trả về MÃ ĐƠN và SỐ TIỀN, không trả true/false.
   *
   * Anh Hùng hỏi đúng chỗ hai lần: "ra doanh thu rồi thì phải biết hội thoại nào
   * đã chuyển đổi" (27/09), rồi "lượt tin nhắn mà biết chuyển đổi ra tiền thì
   * tốt biết mấy" (28/09). Biết có đơn mà không nói được đơn nào, bao nhiêu
   * tiền, thì vẫn chưa trả lời được câu đó.
   *
   * Dùng Map theo mã đơn chứ không cộng thẳng: một hội thoại có thể chạm tới
   * cùng một đơn qua nhiều số điện thoại, cộng thẳng là nhân đôi tiền. */
  const donTrongCuaSo = (sdtList) => {
    const theoMa = new Map();
    sdtList.forEach((p) => {
      (leadTheoSdt.get(p) || []).forEach((lead) => {
        (donTheoKH.get(lead.kh) || []).forEach((d) => {
          if (!d.ngay || !lead.ngay || !d.ma) return;
          const tre = cachNgay(lead.ngay, d.ngay);
          if (tre >= 0 && tre <= cuaSo) theoMa.set(String(d.ma), d);
        });
      });
    });
    const ds = [...theoMa.values()];
    return {
      ma: [...theoMa.keys()],
      tien: ds.reduce((a, d) => a + (d.tien || 0), 0),
      thu: ds.reduce((a, d) => a + (d.thu || 0), 0),
    };
  };
  const hoiThoaiPhanLoai = hoiThoaiRows
    .filter((h) => h.type === 'INBOX' && (h.adIds || []).length)
    .map((h) => {
      const sdt = (h.sdt || []).filter(Boolean);
      const coLienHe = !!h.coSdt || sdt.length > 0;
      let nhom = 'rac';
      let lyDo = 'Không để lại số điện thoại';
      let maDon = [];
      let tien = 0;
      let thu = 0;
      if (coLienHe) {
        nhom = 'tiem-nang';
        lyDo = 'Có để lại số điện thoại, chưa thấy ra đơn';
        if (sdt.length) {
          const k = donTrongCuaSo(sdt);
          maDon = k.ma; tien = k.tien; thu = k.thu;
          if (maDon.length) {
            nhom = 'chuyen-doi';
            lyDo = 'Ghép được với đơn ' + maDon.slice(0, 3).join(', ')
              + (maDon.length > 3 ? ` và ${maDon.length - 3} đơn nữa` : '');
          }
        }
      }
      return {
        id: h.id, pageId: h.pageId || '', khachId: h.khachId || '', ngay: h.ngay,
        adIds: h.adIds || [], platform: h.platform || '',
        soTinNhan: h.soTinNhan || 0, tenKhach: h.tenKhach || '',
        nhom, lyDo, maDon, tien, thu, nguonPhanLoai: 'heuristic',
      };
    });

  /* ---------- lý do "Khác" cho từng đơn chưa ghép được ----------
   * Chỉ để GIẢI THÍCH cho người đọc, không ảnh hưởng tới số tiền/ROAS ở trên.
   * Ba nhóm theo thứ tự kiểm: không có lead nào của khách → có lead nhưng đơn
   * ngoài cửa sổ ngày → có lead trong cửa sổ nhưng bản thân lead đó chưa ghép
   * được với đúng một quảng cáo (khoá cứng POS/hội thoại không thấy hoặc nhập
   * nhằng). Không cố suy chi tiết hơn — bấy nhiêu là đủ để "Khác" đáng tin. */
  const lyDoTheoDon = new Map();
  donRows.forEach((d) => {
    if (!d.ma || daDungDon.has(d.ma)) return;
    const cands = leadTheoKh.get(d.kh) || [];
    if (!cands.length) { lyDoTheoDon.set(String(d.ma), 'khong-co-lead'); return; }
    const trongCuaSo = cands.some((l) => {
      if (!l.ngay || !d.ngay) return false;
      const tre = cachNgay(l.ngay, d.ngay);
      return tre >= 0 && tre <= cuaSo;
    });
    if (!trongCuaSo) { lyDoTheoDon.set(String(d.ma), 'ngoai-cua-so'); return; }
    lyDoTheoDon.set(String(d.ma), 'lead-chua-ghep-qc');
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
    /* Kèm tên và nền tảng để người gọi không phải tự tra lại — và để chỉ có MỘT
     * chỗ định nghĩa "đơn này thuộc kênh nào". */
    ghiCongDon: [...ghiCongDon.entries()].map(([ma, g]) => {
      const a = adTheoExt.get(String(g.adId)) || {};
      return { ma, adId: g.adId, ten: a.name || '', nenTang: a.platform || '',
        duong: g.duong, maLead: g.maLead, leadId: g.leadId, hoiThoaiId: g.hoiThoaiId || '' };
    }),
    donKhongGhep: {
      so: donRows.length - daDungDon.size,
      tien: donRows.filter((d) => !daDungDon.has(d.ma)).reduce((a, d) => a + d.tien, 0),
    },
    /* Lý do "Khác" cho từng đơn — xem giải thích ở khối tính phía trên. */
    lyDoTheoDon: [...lyDoTheoDon.entries()].map(([ma, lyDo]) => ({ ma, lyDo, lyDoText: NHAN_LY_DO[lyDo] })),
    /* Phân loại lead từ hội thoại quảng cáo — xem giải thích ở khối tính phía trên. */
    hoiThoaiPhanLoai,
    /* CẦU NỐI giữa hai con số hay bị đọc cạnh nhau trên Tổng quan: doanh thu ghi
     * công được, và số hội thoại chuyển đổi. Hai cái đi hai đường khác nhau nên
     * chênh nhau là chuyện thường — nhưng phải NÓI RA mới đọc được, không thì
     * nhìn "131 triệu" cạnh "0 hội thoại chuyển đổi" là thấy app tự mâu thuẫn.
     *
     * `donQuaPOS` là phần không bao giờ đánh dấu được hội thoại nào: đường POS
     * ghép bằng ad_id + mã LU trên đơn, không đi qua Pancake. */
    cauNoi: (() => {
      const g = [...ghiCongDon.values()];
      const cd = hoiThoaiPhanLoai.filter((h) => h.nhom === 'chuyen-doi');
      /* Tiền của NHÓM hội thoại chuyển đổi. Cộng theo mã đơn đã khử trùng ở mỗi
       * hội thoại, nhưng hai hội thoại KHÁC NHAU vẫn có thể cùng chạm một đơn
       * (khách nhắn hai lần) — nên khử trùng thêm một lần nữa ở mức nhóm, không
       * cộng thẳng h.tien. Bỏ bước này là số tiền phồng lên trông rất đẹp. */
      const donCuaHoiThoai = new Set();
      cd.forEach((h) => (h.maDon || []).forEach((m) => donCuaHoiThoai.add(m)));
      const tienNhom = donRows
        .filter((d) => d.ma && donCuaHoiThoai.has(String(d.ma)))
        .reduce((a, d) => a + (d.tien || 0), 0);
      return {
        donGhiCong: g.length,
        donQuaHoiThoai: g.filter((x) => x.duong === 'hội thoại').length,
        donQuaPOS: g.filter((x) => x.duong === 'POS').length,
        donTruyVeHoiThoai: g.filter((x) => x.hoiThoaiId).length,
        hoiThoaiCoSdt: hoiThoaiPhanLoai.filter((h) => h.nhom !== 'rac').length,
        hoiThoaiKhongSdt: hoiThoaiPhanLoai.filter((h) => h.nhom === 'rac').length,
        /* Câu trả lời cho "lượt tin nhắn ra bao nhiêu tiền". */
        hoiThoaiChuyenDoi: cd.length,
        donCuaHoiThoai: donCuaHoiThoai.size,
        tienCuaHoiThoai: tienNhom,
        tienMoiHoiThoai: cd.length ? Math.round(tienNhom / cd.length) : 0,
      };
    })(),
  };
}

module.exports = { tinh, NHAN_LY_DO };
