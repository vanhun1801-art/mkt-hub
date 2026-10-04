'use strict';
/**
 * ============================================================================
 * DỰNG HỒ SƠ KHÁCH TỪ NHIỀU NGUỒN
 * ============================================================================
 * Mỗi người một hồ sơ, khoá bằng SỐ ĐIỆN THOẠI đã chuẩn hoá.
 *
 * Vì sao khoá bằng số chứ không bằng mã khách Tourwell: mã chỉ có ở Tourwell.
 * Hội thoại Facebook, lead tải từ Ads Manager, sau này là Zalo — không cái nào
 * có mã ấy. Lấy mã làm khoá thì mỗi kênh thành một hòn đảo riêng, mà gộp các
 * kênh lại chính là việc cần làm.
 *
 * Người KHÔNG có số (phần lớn hội thoại TikTok — đo 28/09/2026: 97% không số)
 * vẫn được một hồ sơ, khoá tạm theo tên+kênh, và bị đánh dấu mức thấp nhất.
 * Vứt họ đi thì con số "bao nhiêu người từng hỏi" sai hẳn; trộn lẫn họ vào
 * như khách đầy đủ thì mọi phép đếm đều hoá ra nói dối. Nên: giữ, và ghi rõ.
 */

/* Mức đầy đủ — anh Hùng 02/10/2026: "lấy hết, đánh dấu rõ ai đủ ai thiếu". */
const MUC = {
  DU: 'đủ',              // có số + tên + ít nhất một đơn
  CO_SO: 'có số',        // có số + tên, chưa có đơn
  CHI_TEN: 'chỉ tên',    // không có số — gần như không ghép được với gì
};

const chu = (v) => (v == null ? '' : String(v).trim());

/** Một người từng mua gì, đi mùa nào, đón ở đâu — phần "nhu cầu". */
function gomDichVu(dons) {
  const tour = new Map();
  const loai = new Map();
  const thang = {};
  const diemDon = {};
  for (const d of dons) {
    for (const s of d.dichVu || []) {
      if (s.loai) loai.set(s.loai, (loai.get(s.loai) || 0) + 1);
      if (s.ten) tour.set(s.ten, (tour.get(s.ten) || 0) + 1);
      if (s.di) {
        const m = Number(String(s.di).slice(5, 7));
        if (m >= 1 && m <= 12) thang[m] = (thang[m] || 0) + 1;
      }
      if (s.don) diemDon[s.don] = (diemDon[s.don] || 0) + 1;
    }
  }
  return {
    tour: [...tour.entries()].sort((a, b) => b[1] - a[1]).map(([ten, so]) => ({ ten, so })),
    loai: [...loai.entries()].sort((a, b) => b[1] - a[1]).map(([ten, so]) => ({ ten, so })),
    thang, diemDon,
  };
}

/**
 * Gộp khách + đơn Tourwell thành hồ sơ.
 * `them` là các nguồn khác (lead tải về, hội thoại) — mỗi phần tử
 * { sdt, ten, kenh, luc, ghiChu }.
 */
function dung({ khach = [], don = [], them = [] }) {
  const theoMa = new Map();
  const hs = new Map();

  const moi = (khoa) => ({
    khoa, ten: '', sdt: '', gioi: '', nuoc: '', hang: '', nhom: '',
    maTw: '', link: '', sales: [], kenh: [], don: [], lanDau: '', lanCuoi: '',
    doanhThu: 0, soDon: 0,
  });
  const dat = (o, k, v) => { if (!o[k] && chu(v)) o[k] = chu(v); };

  /* ---- 1. khách Tourwell ---- */
  for (const k of khach) {
    const khoa = k.sdt || ('tw:' + k.ma);
    const o = hs.get(khoa) || moi(khoa);
    dat(o, 'ten', k.ten); dat(o, 'sdt', k.sdt); dat(o, 'gioi', k.gioi);
    dat(o, 'nuoc', k.nuoc); dat(o, 'hang', k.hang); dat(o, 'nhom', k.nhom);
    dat(o, 'maTw', k.ma); dat(o, 'link', k.link);
    for (const s of k.sales || []) if (!o.sales.includes(s)) o.sales.push(s);
    if (!o.kenh.includes('Tourwell')) o.kenh.push('Tourwell');
    hs.set(khoa, o);
    if (k.ma) theoMa.set(k.ma, khoa);
  }

  /* ---- 2. đơn, gắn vào đúng người theo mã khách ---- */
  for (const d of don) {
    const khoa = theoMa.get(d.khachMa);
    /* Đơn của khách KHÔNG có trong danh sách khách: vẫn giữ, mở một hồ sơ theo
     * mã. Bỏ đi là doanh thu hụt mà không ai biết vì sao. */
    const k = khoa || ('tw:' + (d.khachMa || d.ma));
    const o = hs.get(k) || moi(k);
    dat(o, 'ten', d.khachTen); dat(o, 'maTw', d.khachMa);
    if (!o.kenh.includes('Tourwell')) o.kenh.push('Tourwell');
    o.don.push(d);
    hs.set(k, o);
    if (!khoa && d.khachMa) theoMa.set(d.khachMa, k);
  }

  /* ---- 3. các nguồn khác ---- */
  for (const t of them) {
    const sdt = chu(t.sdt);
    const khoa = sdt || ('ten:' + chu(t.ten).toLowerCase() + '|' + chu(t.kenh));
    const o = hs.get(khoa) || moi(khoa);
    dat(o, 'ten', t.ten); dat(o, 'sdt', sdt);
    if (t.kenh && !o.kenh.includes(t.kenh)) o.kenh.push(t.kenh);
    if (t.luc) { if (!o.lanDau || t.luc < o.lanDau) o.lanDau = t.luc; }
    hs.set(khoa, o);
  }

  /* ---- 4. chốt số liệu từng hồ sơ ---- */
  for (const o of hs.values()) {
    o.don.sort((a, b) => String(a.luc).localeCompare(String(b.luc)));
    o.soDon = o.don.length;
    o.doanhThu = o.don.reduce((s, d) => s + (Number(d.tien) || 0), 0);
    const mocs = o.don.map((d) => d.luc).filter(Boolean);
    if (mocs.length) {
      if (!o.lanDau || mocs[0] < o.lanDau) o.lanDau = mocs[0];
      o.lanCuoi = mocs[mocs.length - 1];
    }
    for (const d of o.don) for (const s of d.sales || []) if (!o.sales.includes(s)) o.sales.push(s);
    o.nhuCau = gomDichVu(o.don);
    o.muc = !o.sdt ? MUC.CHI_TEN : (o.soDon ? MUC.DU : MUC.CO_SO);
    /* Thiếu gì thì nói thẳng ra, đừng để người đọc tự đoán từ ô trống. */
    o.thieu = [];
    if (!o.sdt) o.thieu.push('số điện thoại');
    if (!o.nuoc) o.thieu.push('quốc gia');
    if (!o.soDon) o.thieu.push('đơn hàng');
  }

  return [...hs.values()];
}

/** Số tổng cho trang đầu. */
function tongQuan(ds) {
  const d = {
    tong: ds.length, coSdt: 0, coNuoc: 0, coDon: 0, doanhThu: 0,
    muc: {}, nuoc: {}, gioi: {}, nhom: {}, hang: {}, nguon: {}, tour: {}, loai: {}, thang: {},
  };
  for (const o of ds) {
    if (o.sdt) d.coSdt++;
    if (o.nuoc) { d.coNuoc++; d.nuoc[o.nuoc] = (d.nuoc[o.nuoc] || 0) + 1; }
    if (o.soDon) d.coDon++;
    d.doanhThu += o.doanhThu;
    d.muc[o.muc] = (d.muc[o.muc] || 0) + 1;
    if (o.gioi) d.gioi[o.gioi] = (d.gioi[o.gioi] || 0) + 1;
    if (o.nhom) d.nhom[o.nhom] = (d.nhom[o.nhom] || 0) + 1;
    if (o.hang) d.hang[o.hang] = (d.hang[o.hang] || 0) + 1;
    for (const dd of o.don) {
      if (dd.nguon) d.nguon[dd.nguon] = (d.nguon[dd.nguon] || 0) + 1;
      for (const s of dd.dichVu || []) {
        if (s.ten) d.tour[s.ten] = (d.tour[s.ten] || 0) + 1;
        if (s.loai) d.loai[s.loai] = (d.loai[s.loai] || 0) + 1;
        if (s.di) {
          /* s.di đã được ngayVN() đổi sang YYYY-MM-DD ngay ở cửa vào, nên cắt
           * ký tự 5–7 là đúng tháng. Nếu một ngày nào đó nguồn trả thẳng
           * "20/10/2026" vào đây thì phép cắt này ra "10/2" và biểu đồ mùa đi
           * RỖNG — đã xảy ra thật 04/10/2026. */
          const m = Number(String(s.di).slice(5, 7));
          if (m >= 1 && m <= 12) d.thang[m] = (d.thang[m] || 0) + 1;
        }
      }
    }
  }
  return d;
}

module.exports = { dung, tongQuan, MUC };
