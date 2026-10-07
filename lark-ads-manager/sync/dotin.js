'use strict';
/**
 * ĐỘ TIN CỦA SỐ — liệt kê những chỗ con số đang KHÔNG đáng tin, và vì sao.
 *
 * Anh Hùng, 07/10/2026: "anh muốn biết tính chính xác của số liệu."
 *
 * Câu hỏi đó đáng ra app phải tự trả lời được, không phải đợi hỏi. Và lần soát
 * tay hôm ấy lòi ra một chuyện tệ hơn là số sai: app đang NÓI MỘT ĐIỀU NÓ KHÔNG
 * BIẾT.
 *
 * Màn hình ghi "888 đơn: Không có lead Tourwell nào của khách này" — đọc lên
 * nghe như một phát hiện về kinh doanh. Thật ra kho lead xuất từ Excel bị cắt ở
 * đúng 1.000 dòng, nên lead của 888 khách kia đơn giản là chưa bao giờ được nạp
 * vào. Đo được: chỉ 112/1.000 đơn có mã khách khớp một lead trong kho, tức dù
 * ghép hoàn hảo thì trần cũng chỉ 11,2%. Người đọc không có cách nào biết điều
 * đó, nên sẽ kết luận "quảng cáo không ra đơn" — một kết luận sai, rút ra từ
 * một con số đúng.
 *
 * Luật của file này: chỉ nói những gì ĐO ĐƯỢC từ dữ liệu đang có. Không ước
 * lượng, không chấm điểm tổng kiểu "độ tin 72%" — một con số gộp như thế che
 * mất đúng phần người đọc cần thấy.
 */

/** Những mức mà nhà xuất Excel hay cắt. Đúng chằn chặn một trong các số này là
 * dấu hiệu bị cắt, không phải trùng hợp. */
const MUC_CAT = [500, 1000, 2000, 5000, 10000];

const ptram = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/* Số trong câu chữ phải viết theo lối Việt: dấu PHẨY ngăn phần thập phân.
 * `11.2%` đọc ra là mười một phẩy hai hay một nghìn một trăm hai mươi? Ở một app
 * toàn tiền đồng thì nhầm lẫn đó không phải chuyện nhỏ. Giá trị số trả qua API
 * vẫn để nguyên kiểu number cho máy dùng. */
const chuPtram = (v) => (v == null ? '—' : String(v).replace('.', ','));

/** 'YYYY-MM-DD' hôm nay theo giờ Việt Nam. */
function homNay() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function cachNgay(a, b) {
  const x = Date.parse(a + 'T00:00:00Z');
  const y = Date.parse(b + 'T00:00:00Z');
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.round((y - x) / 86400000);
}

/**
 * @param kho   sync/khoroas.doc()
 * @param kq    kết quả roas.tinh() gần nhất (sync/roascache.doc().kq)
 * @param data  store.get() — ads + daily
 * @param conf  sync/ketnoi.read()
 * @param benVung  sync/ketnoi.status().benVung — kênh nào sống sót qua deploy
 * @returns {{diem: Array, tomTat: object}}
 */
function danhGia({ kho = null, kq = null, data = null, conf = null, benVung = null } = {}) {
  const diem = [];
  const them = (nang, ten, chu, lamGi) => diem.push({ nang, ten, chu, lamGi });

  /* ---- 1. KHO BỊ CẮT. Chỗ này nặng nhất, nên đặt đầu. ---- */
  let tranGhiCong = null;
  if (kho && kho.lead && kho.don) {
    const nLead = (kho.lead.rows || []).length;
    const nDon = (kho.don.rows || []).length;
    const catLead = !kho.tuApi && MUC_CAT.includes(nLead);
    const catDon = !kho.tuApi && MUC_CAT.includes(nDon);

    /* Trần ghi công: đơn nào mà khách của nó không có lead nào trong kho thì
     * không đường nào với tới được, dù bốn đường đều hoàn hảo. */
    const khLead = new Set((kho.lead.rows || []).map((x) => x.kh).filter(Boolean));
    const coLead = (kho.don.rows || []).filter((x) => khLead.has(x.kh)).length;
    tranGhiCong = ptram(coLead, nDon);

    if (catLead || catDon) {
      const ds = [catLead ? `lead ${nLead}` : '', catDon ? `đơn ${nDon}` : ''].filter(Boolean);
      them(true, 'Kho bị cắt ngang',
        `Kho đang có ${ds.join(' và ')} dòng — tròn chằn chặn, đó là giới hạn xuất file `
        + 'chứ không phải số thật. Phần nằm ngoài giới hạn chưa bao giờ được nạp vào, '
        + 'nên mọi đơn của những khách đó sẽ bị báo là "không có lead" dù lead có thật.',
        'Nối Tourwell API ở thẻ Tourwell — kho tự kéo về theo khoảng ngày, không có trần dòng.');
    }
    if (tranGhiCong != null && tranGhiCong < 50) {
      them(true, 'Trần ghi công',
        `Chỉ ${coLead}/${nDon} đơn (${chuPtram(tranGhiCong)}%) có mã khách khớp được một lead trong kho. `
        + `Dù ghép hoàn hảo, tỉ lệ ghi công cũng không thể vượt ${chuPtram(tranGhiCong)}% — `
        + 'phần còn lại thiếu lead để bắt đầu, không phải ghép sai.',
        catLead ? 'Cùng một nguyên nhân với mục trên: kho lead bị cắt.'
          : 'Kéo lead theo khoảng ngày rộng hơn đơn, vì lead luôn có trước đơn.');
    }
    if (!kho.tuApi) {
      them(false, 'Kho đến từ file Excel',
        'Số đang dùng là file nhập tay, không tự cập nhật. Đơn đổi trạng thái sau ngày '
        + 'xuất file sẽ không bao giờ được biết.',
        'Nối Tourwell API để kho tự làm mới mỗi 2 giờ.');
    }
  }

  /* ---- 2. ĐƯỜNG GHÉP NÀO ĐANG TẮT ---- */
  if (conf) {
    const pos = conf.pancakePos || {};
    const gian = require('./pancakepos').danhSachGian(pos);
    const thieuKhoa = gian.filter((x) => !x.apiKey);
    if (!pos.enabled || !gian.some((x) => x.apiKey)) {
      them(true, 'Đường POS đang tắt',
        'POS ghép bằng khoá cứng (ad_id + mã lead ghi thẳng trên đơn) — đây là đường chắc '
        + 'nhất và không cần số điện thoại. Đang tắt nghĩa là mọi đơn chỉ còn trông vào '
        + 'hội thoại, mà hội thoại thì phần lớn không có số.'
        + (thieuKhoa.length ? ` Gian chưa có khoá: ${thieuKhoa.map((x) => x.shopId).join(', ')}.` : ''),
        'Thẻ Pancake POS — dán api_key riêng của từng gian rồi Lưu cấu hình.');
    }
    const tw = conf.tourwell || {};
    if (!tw.enabled || !tw.host || !tw.token) {
      them(true, 'Chưa nối Tourwell API',
        'Lead và đơn đang phải nhập tay bằng file. Đây là gốc của cả hai mục đầu bảng.',
        'Thẻ Tourwell API — điền địa chỉ và token rồi Lưu cấu hình.');
    }
  }

  /* ---- 3. KÊNH CHI TIÊU NÀO ĐANG ĐỨNG ---- */
  const theoKenh = {};
  if (data && Array.isArray(data.daily)) {
    data.daily.forEach((r) => {
      const k = r.platform || '(chưa gán)';
      const o = theoKenh[k] || (theoKenh[k] = { chi: 0, dong: 0, cuoi: '' });
      o.chi += Number(r.spend) || 0;
      o.dong += 1;
      if (r.date && r.date > o.cuoi) o.cuoi = r.date;
    });
    const nay = homNay();
    Object.entries(theoKenh).forEach(([k, v]) => {
      if (k === '(chưa gán)') return;
      const tre = v.cuoi ? cachNgay(v.cuoi, nay) : null;
      /* 3 ngày: nền tảng chốt số có độ trễ, 1–2 ngày là bình thường. */
      if (tre != null && tre > 3) {
        them(true, `${k} đứng số từ ${v.cuoi}`,
          `Không có dòng chi tiêu nào sau ${v.cuoi}, tức thiếu ${tre} ngày. `
          + 'Chi tiêu thiếu làm ROAS trông ĐẸP HƠN thực tế, vì mẫu số nhỏ đi mà tử số thì không.',
          'Tab Kết nối & Đồng bộ — xem câu lỗi của kênh này, nó nói thẳng chỗ hỏng.');
      }
    });

    /* ---- 4. DÒNG NGÀY BỊ GÕ HAI LẦN ---- */
    const m = new Map();
    data.daily.forEach((r) => {
      const k = (r.adId || '(trống)') + '|' + r.date;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    let thua = 0;
    let soTrung = 0;
    m.forEach((v) => {
      if (v.length < 2) return;
      soTrung += 1;
      const chi = v.map((x) => Number(x.spend) || 0);
      thua += chi.reduce((a, b) => a + b, 0) - Math.max(...chi);
    });
    if (soTrung) {
      const tong = data.daily.reduce((a, x) => a + (Number(x.spend) || 0), 0);
      them(false, 'Có dòng chi tiêu bị đếm hai lần',
        `${soTrung} khoá (quảng cáo × ngày) có nhiều hơn một dòng — thừa khoảng `
        + `${Math.round(thua).toLocaleString('vi-VN')}đ trên ${Math.round(tong).toLocaleString('vi-VN')}đ `
        + `(${chuPtram(ptram(thua, tong))}%). Số kéo từ API không sinh dòng trùng; đây là dòng nhập tay.`,
        'Tab Dữ liệu theo ngày — lọc theo ngày đó rồi xoá dòng thừa.');
    }
  }

  /* ---- 5. HỘI THOẠI KHÔNG CÓ SỐ ĐIỆN THOẠI ---- */
  if (kq && Array.isArray(kq.hoiThoaiPhanLoai) && kq.hoiThoaiPhanLoai.length) {
    const ds = kq.hoiThoaiPhanLoai;
    const khong = ds.filter((h) => h.nhom === 'rac').length;
    const tl = ptram(khong, ds.length);
    if (tl != null && tl >= 50) {
      them(false, 'Phần lớn hội thoại không để lại số điện thoại',
        `${khong}/${ds.length} hội thoại (${chuPtram(tl)}%) không có số nào để ghép với đơn. `
        + 'Đây là giới hạn của nền tảng, không phải lỗi app — đã dò hết các đường và '
        + 'không có lối lấy số từ phía TikTok.',
        'Đường POS không cần số điện thoại — bật nó lên là cách duy nhất đi vòng qua chỗ này.');
    }
  }

  /* ---- 5b. GHÉP ĐƯỢC NHƯNG MẤT VÌ THIẾU LEAD ---- */
  if (kq && kq.nhat) {
    const n = kq.nhat;
    if (n.leadKhongCoTrongXuat > 0) {
      them(true, 'Có khoá cứng nhưng thiếu lead để dùng',
        `${n.leadKhongCoTrongXuat} lead được đơn POS trỏ tới nhưng không có trong kho. `
        + 'Lead luôn sinh TRƯỚC đơn, nên kéo lead cùng khoảng ngày với đơn là chắc chắn '
        + 'hụt phần đầu khoảng. Mỗi lead hụt là một ghi công mất hẳn — không đường nào '
        + 'cứu được, vì cả ba đường còn lại cũng phải đi qua lead.',
        'Đã sửa: lượt kéo tự lùi lead sớm hơn đơn 14 ngày. Kéo lại một lượt là hết.');
    }
    if (n.nhapNhangPOS > 0) {
      them(false, 'Đơn POS trỏ tới nhiều quảng cáo cùng lúc',
        `${n.nhapNhangPOS} lead có từ hai mã quảng cáo trở lên trên đơn POS. `
        + 'App KHÔNG chọn bừa một cái — thà bỏ còn hơn gán sai cho một quảng cáo.',
        'Bình thường khi khách nhắn qua nhiều quảng cáo; không phải lỗi.');
    }
  }

  /* ---- 5c. CẤU HÌNH SẼ MẤT Ở LẦN DEPLOY TỚI ----
   *
   * Chuyện này đã xảy ra thật, nhiều lần, và mỗi lần là một buổi khai lại tay.
   * Thẻ cảnh báo vốn chỉ nằm ở tab Kết nối — mà người mở app buổi sáng thì vào
   * tab Doanh thu & ROAS trước. Nhắc ở đây nữa, vì mất cấu hình không phải
   * chuyện của riêng tab cấu hình: mất là mọi con số dưới đây thành rỗng. */
  if (benVung && benVung.canLo && (benVung.seMat || []).length) {
    const ten = { meta: 'Facebook', tiktok: 'TikTok', googleAds: 'Google Ads',
      googleSheet: 'Google Sheet', pancake: 'Pancake', pancakePos: 'Pancake POS' };
    const ds = benVung.seMat.map((k) => ten[k] || k).join(', ');
    them(true, 'Cấu hình sẽ mất ở lần deploy tới',
      `${ds} đang nằm trên ổ đĩa tạm của server, chưa có trong biến ADS_CONNECT_JSON. `
      + 'Deploy một cái là phải khai lại từ đầu, và mọi số dưới đây về rỗng cho tới khi khai xong.',
      'Tab Kết nối & Đồng bộ → thẻ Giữ cấu hình qua lần deploy → Lấy nội dung ADS_CONNECT_JSON '
      + '→ dán vào Environment của Render. Làm TRƯỚC khi deploy, không phải sau.');
  }

  /* ---- 6. SỐ ĐÃ CŨ ---- */
  if (kho && kho.luc) {
    const gio = Math.round((Date.now() - Date.parse(kho.luc)) / 3600000);
    if (Number.isFinite(gio) && gio > 24) {
      them(gio > 24 * 7, 'Kho đã cũ',
        `Lead và đơn trong kho nạp cách đây ${gio >= 48 ? Math.round(gio / 24) + ' ngày' : gio + ' giờ'}.`,
        'Nối Tourwell API thì kho tự làm mới mỗi 2 giờ, khỏi phải nhớ.');
    }
  }

  return {
    diem,
    tomTat: {
      nang: diem.filter((x) => x.nang).length,
      nhe: diem.filter((x) => !x.nang).length,
      tranGhiCong,
      khoTuApi: !!(kho && kho.tuApi),
      kenh: Object.entries(theoKenh).map(([k, v]) => ({ kenh: k, chi: v.chi, dong: v.dong, cuoi: v.cuoi })),
    },
  };
}

module.exports = { danhGia, MUC_CAT };
