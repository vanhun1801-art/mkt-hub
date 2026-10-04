'use strict';
/**
 * ============================================================================
 * CHI PHÍ QUẢNG CÁO — để biết tiền bỏ ra đổi lấy được gì
 * ============================================================================
 * Đây là lỗ hổng lớn nhất của app trước khi có tệp này: app Khách hàng biết
 * doanh thu theo kênh, app Quảng cáo biết chi phí theo kênh, mà hai bên không
 * nói chuyện với nhau — Marketing phải mở hai tab rồi tự nhẩm.
 *
 * Dùng lại nguyên các adapter đã có của app Quảng cáo (meta.js, tiktok.js,
 * gads.js) và chính tệp cấu hình kết nối của nó. Viết lại một bản thứ hai là
 * chắc chắn hai bên sẽ trôi xa nhau, rồi hai app cùng nói về "chi phí Facebook
 * tháng 10" mà ra hai con số.
 */
const path = require('path');
const GOC = path.join(__dirname, '..', '..', 'lark-ads-manager', 'sync');

/**
 * GHÉP KÊNH — chỗ dễ nói dối nhất trong cả tệp này.
 *
 * Tourwell ghi nguồn đơn bằng tên người đặt tự chọn ("Tiktok Rooty Trip Phú
 * Quốc", "Facebook", "Zalo", "Lữ hành", "Hotline"…). Nền tảng quảng cáo thì
 * chỉ có Meta, TikTok, Google. Hai bên không phải một-đối-một.
 *
 * Nguyên tắc: CHỈ ghép những gì chắc chắn. Kênh nào không có chi phí quảng
 * cáo thì để trống và nói rõ là "không chạy quảng cáo", chứ tuyệt đối không
 * chia đều chi phí cho các kênh còn lại — làm vậy thì mọi chỉ số đều có số để
 * hiện, và mọi số đều sai.
 *
 * Zalo, Hotline, Lữ hành, OTA, Khách cũ: không có ngân sách quảng cáo trong
 * ba nền tảng trên, nên chi phí = chưa biết, KHÔNG phải = 0.
 */
const GHEP = [
  [/tiktok/i, 'TikTok'],
  [/facebook|fb\b|meta|instagram|\big\b/i, 'Meta'],
  [/google|gdn|youtube|search/i, 'Google Ads'],
];
const nenTang = (nguon) => {
  const s = String(nguon || '');
  for (const [re, ten] of GHEP) if (re.test(s)) return ten;
  return null;
};

/** Website có thể do Google Ads kéo về, nhưng cũng có thể do SEO hay khách tự
 *  gõ — không chứng minh được nên không ghép. Ghi ra đây để lần sau khỏi phải
 *  nghĩ lại: đã cân nhắc và cố ý bỏ. */
const KHONG_GHEP = ['Website', 'Zalo', 'Hotline', 'Lữ hành', 'OTA', 'Khách cũ', 'CTV', 'Whatsapp'];

/**
 * Cắt khoảng ngày thành từng mảnh tối đa 30 ngày.
 *
 * TikTok từ chối thẳng nếu xin hơn 30 ngày: "max time span is 30 days when use
 * stat_time_day". Xin cả quý là nhận lỗi 40002 và KHÔNG có dữ liệu nào — mà
 * nhìn màn hình thì chỉ thấy chi phí TikTok bằng 0, trông y như tháng đó không
 * chạy quảng cáo. Cắt nhỏ ở đây để chỗ gọi khỏi phải nhớ luật riêng của từng
 * nền tảng.
 */
function cheoKhoang(tu, den, soNgay = 30) {
  const a = Date.parse(tu + 'T00:00:00Z');
  const z = Date.parse(den + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(z) || z < a) return [[tu, den]];
  const ra = [];
  const NGAY = 86400000;
  for (let t = a; t <= z; t += soNgay * NGAY) {
    const h = Math.min(t + (soNgay - 1) * NGAY, z);
    ra.push([new Date(t).toISOString().slice(0, 10), new Date(h).toISOString().slice(0, 10)]);
  }
  return ra;
}

async function keoChiPhi(tu, den, bao = () => {}) {
  const k = require(path.join(GOC, 'ketnoi.js'));
  const cfg = (typeof k.read === 'function') ? k.read() : k;
  /* tenQC: mã quảng cáo -> tên. Hội thoại Pancake chỉ mang MÃ, mà mã thì
   * không ai đọc được. Có tên thì mới nói được "quảng cáo Flycam kéo về khách
   * hỏi ảnh, quảng cáo Combo kéo về khách hỏi giá". */
  const ra = { theoNgay: [], theoNenTang: {}, tenQC: {}, loi: [] };

  const chay = async (ten, tep, conf) => {
    if (!conf || conf.enabled === false) { bao(ten + ': chưa bật'); return; }
    try {
      const mod = require(path.join(GOC, tep));
      /* Mỗi adapter trả một hình dạng khác nhau: meta.js trả {rows, actionTypes},
       * tiktok.js trả thẳng mảng. Không chuẩn hoá thì lỗi hiện ra dưới dạng
       * "rows is not iterable" — nghe như hỏng mạng, thật ra chỉ là khác kiểu. */
      const rows = [];
      for (const [a, z] of cheoKhoang(tu, den)) {
        const res = await mod.fetchRange(conf, a, z, () => {});
        rows.push(...(Array.isArray(res) ? res : ((res && res.rows) || [])));
      }
      let tong = 0;
      for (const r of rows) {
        const chi = Number(r.spend) || 0;
        tong += chi;
        ra.theoNgay.push({ nenTang: ten, ngay: r.date, chi, hienThi: Number(r.impressions) || 0, bam: Number(r.clicks) || 0 });
        if (r.adExtId && r.adName) ra.tenQC[String(r.adExtId)] = r.adName;
      }
      ra.theoNenTang[ten] = (ra.theoNenTang[ten] || 0) + tong;
      bao(ten + ': ' + rows.length + ' dòng · ' + Math.round(tong).toLocaleString('vi-VN') + ' đ');
    } catch (e) {
      /* Một nền tảng hỏng thì KHÔNG được làm hỏng cả bảng. Ghi lại lý do và
       * đi tiếp — và màn hình phải nói ra là thiếu nền tảng nào, không thì
       * người đọc tưởng tháng đó không chạy quảng cáo. */
      ra.loi.push(ten + ': ' + String((e && e.message) || e).slice(0, 160));
      bao('! ' + ten + ' hỏng: ' + String((e && e.message) || e).slice(0, 90));
    }
  };

  await chay('Meta', 'meta.js', cfg.meta);
  await chay('TikTok', 'tiktok.js', cfg.tiktok);
  await chay('Google Ads', 'gads.js', cfg.googleAds);
  return ra;
}

/**
 * Ghép chi phí với doanh thu theo kênh.
 * @param kenh  { "<tên nguồn Tourwell>": {don, tien, khach, …} } từ marketing.soLieu
 */
function ghepVoiDoanhThu(kenh, chiPhi) {
  const theoNT = {};
  for (const [nguon, e] of Object.entries(kenh || {})) {
    const nt = nenTang(nguon);
    if (!nt) continue;
    const o = theoNT[nt] || (theoNT[nt] = { nenTang: nt, nguon: [], don: 0, tien: 0, khach: 0 });
    o.nguon.push(nguon);
    o.don += e.don; o.tien += e.tien; o.khach += e.khach || 0;
  }
  const ra = [];
  for (const nt of new Set([...Object.keys(theoNT), ...Object.keys(chiPhi.theoNenTang || {})])) {
    const o = theoNT[nt] || { nenTang: nt, nguon: [], don: 0, tien: 0, khach: 0 };
    const chi = Math.round(chiPhi.theoNenTang[nt] || 0);
    ra.push({
      ...o, chi,
      /* ROAS chỉ có nghĩa khi CÓ chi phí. Chi = 0 mà vẫn chia là ra vô cực,
       * và một ô "∞" trên màn hình thì không ai biết phải làm gì với nó. */
      roas: chi > 0 ? o.tien / chi : null,
      chiMoiDon: chi > 0 && o.don ? Math.round(chi / o.don) : null,
      chiMoiKhach: chi > 0 && o.khach ? Math.round(chi / o.khach) : null,
      lai: chi > 0 ? o.tien - chi : null,
    });
  }
  ra.sort((a, b) => b.tien - a.tien);
  return ra;
}

/**
 * KHÁCH Ở TỈNH NÀO — hỏi thẳng Meta Ads.
 *
 * Anh Hùng 04/10/2026: "vị trí cụ thể hơn các tỉnh thì tốt quá". Tourwell thì
 * chịu: ô address.city rỗng 100%, address.country cũng chỉ 9%. Nhưng Meta có
 * `breakdowns=region` và trả về 32 tỉnh thành Việt Nam — đo được ngay.
 *
 * PHẢI NÓI RÕ ĐÂY LÀ GÌ: đây là người ĐƯỢC QUẢNG CÁO TIẾP CẬN, không phải
 * người đã mua. Hai thứ khác nhau, và nhầm thì ra quyết định sai: thấy "Hà
 * Nội 34.626" mà tưởng là 34.626 khách hàng thì sai gấp hàng trăm lần. Dùng
 * để chọn nơi nhắm quảng cáo thì đúng; dùng để nói về khách thì không.
 */
async function keoTinh(tu, den) {
  const k = require(path.join(GOC, 'ketnoi.js'));
  const cfg = (typeof k.read === 'function') ? k.read() : k;
  const M = cfg.meta || {};
  if (!M.enabled || !M.accessToken || !(M.accountIds || []).length) {
    return { tinh: [], loi: 'Chưa bật Meta hoặc chưa khai tài khoản' };
  }
  const V = M.apiVersion || 'v21.0';
  const gop = {};
  const loi = [];
  for (const acc of M.accountIds) {
    const u = 'https://graph.facebook.com/' + V + '/act_' + String(acc).replace(/^act_/, '')
      + '/insights?fields=reach,impressions,clicks,spend&breakdowns=region'
      + '&time_range=' + encodeURIComponent(JSON.stringify({ since: tu, until: den }))
      + '&level=account&limit=500&access_token=' + M.accessToken;
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
      const j = await r.json();
      if (j.error) { loi.push(String(j.error.message).slice(0, 120)); continue; }
      for (const x of (j.data || [])) {
        const ten = String(x.region || '').trim();
        if (!ten) continue;
        const o = gop[ten] || (gop[ten] = { ten, tiepCan: 0, bam: 0, chi: 0 });
        o.tiepCan += Number(x.reach) || 0;
        o.bam += Number(x.clicks) || 0;
        o.chi += Number(x.spend) || 0;
      }
    } catch (e) { loi.push(String((e && e.message) || e).slice(0, 120)); }
  }
  const tinh = Object.values(gop).sort((a, b) => b.tiepCan - a.tiepCan);
  return { tinh, loi: loi.join(' · ') };
}

module.exports = { keoChiPhi, keoTinh, ghepVoiDoanhThu, nenTang, KHONG_GHEP };
