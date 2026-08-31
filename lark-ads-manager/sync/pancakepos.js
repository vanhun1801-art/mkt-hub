/**
 * Pancake POS (pos.pages.fm) — mắt nối quan trọng nhất của cả chuỗi đo.
 *
 * Vì sao module này quan trọng hơn cả sync/pancake.js: một bản ghi đơn POS mang
 * ĐỒNG THỜI cả hai đầu mà trước đây phải ghép bằng số điện thoại —
 *
 *   ad_id           → quảng cáo nào (ghép thẳng với extId trong Base)
 *   conversation_id → hội thoại nào
 *   note            → "LU1998", tức mã lead Tourwell
 *   note_print      → link đầy đủ tới lead Tourwell
 *   bill_phone_number, total_price, cod, inserted_at
 *
 * Nghĩa là quảng cáo → lead Tourwell là KHOÁ CỨNG, không còn phải ghép theo số
 * điện thoại và không còn phải đoán theo ngày khi khách quay lại.
 *
 * Xác thực: `api_key` truyền bằng QUERY PARAM (không có Authorization header).
 * Key lấy ở Pancake POS → Cấu hình → Nâng cao → Tích hợp bên thứ 3 → tab API Key.
 * ĐÂY KHÔNG PHẢI key `pos_user_...` ở phần Cài đặt cá nhân — hai loại khác nhau.
 *
 * Lưu ý về đơn POS ở công ty này: chúng là VỎ RỖNG. Đã kiểm đơn 19421 —
 * không sản phẩm, total_price 0, cod 0. Chúng chỉ tồn tại để đưa khách sang
 * Tourwell. Nên KHÔNG dùng total_price của POS làm doanh thu; doanh thu ở Tourwell.
 * Vẫn đọc total_price ra để nếu ngày nào đó POS có tiền thật thì phát hiện được.
 */
const { getJson, hideSecret, scrub } = require('./http');
const { ngayVN } = require('./pancake');

const BASE = 'https://pos.pages.fm/api/v1';

function qs(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function nghi(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 'YYYY-MM-DD' (giờ VN) → unix giây. */
function dauNgay(ngay) { return Math.floor(Date.parse(`${ngay}T00:00:00+07:00`) / 1000); }
function cuoiNgay(ngay) { return Math.floor(Date.parse(`${ngay}T23:59:59+07:00`) / 1000); }

/**
 * Rút mã lead Tourwell ra khỏi ghi chú đơn POS.
 *
 * Hai chỗ, và phải xét cả hai vì không có gì bảo đảm chỗ nào luôn có:
 *   note       = "LU1998"
 *   note_print = "https://rootytrip.tourwell.net/admin/lead/1998/show"
 *
 * KHOÁ GHÉP LÀ SỐ, KHÔNG PHẢI CHUỖI. Tourwell đệm số 0 không nhất quán — trong
 * cùng một bản xuất có cả `LU00998` và `LU1997`. So chuỗi thì hai bên không bao
 * giờ khớp. Nên `ma` giữ nguyên đúng chuỗi đã thấy (để hiển thị và đối chiếu bằng
 * mắt), còn `id` là số dùng làm khoá ghép.
 */
function macLead(note, notePrint) {
  const tho = `${note || ''}\n${notePrint || ''}`;
  const m = tho.match(/\bLU\s*(\d{1,9})\b/i);
  if (m) return { ma: `LU${m[1]}`, id: Number(m[1]), tuDau: 'ghi-chu' };
  const u = tho.match(/\/admin\/lead\/(\d{1,9})\b/);
  if (u) return { ma: `LU${u[1]}`, id: Number(u[1]), tuDau: 'link' };
  return null;
}

/**
 * Chuẩn hoá mã lead ở BẤT KỲ dạng nào về số — dùng cho cả phía Pancake và phía
 * bản xuất Tourwell, để hai bên chắc chắn ra cùng một khoá.
 */
function soLead(v) {
  const m = String(v == null ? '' : v).match(/(\d{1,9})/);
  return m ? Number(m[1]) : null;
}

/* ---------------- gọi API ---------------- */

async function danhSachShop(conf) {
  const key = (conf && conf.apiKey) || '';
  if (!key) throw new Error('Chưa có api_key (Pancake POS → Cấu hình → Nâng cao → Tích hợp bên thứ 3 → tab API Key)');
  hideSecret(key);
  const res = await getJson(`${BASE}/shops?${qs({ api_key: key })}`,
    { label: 'POS danh sách shop', retries: 2 });
  if (res && res.success === false) throw new Error(scrub(res.message || 'POS trả về success=false'));
  const list = (res && (res.shops || res.data)) || [];
  return list.filter(Boolean).map((s) => ({
    shopId: String(s.id),
    name: s.name || '',
    soPage: Array.isArray(s.pages) ? s.pages.length : null,
  }));
}

/**
 * Đơn POS của một shop trong khoảng ngày.
 *
 * Phân trang bằng page_number, biết tổng số trang qua total_pages nên không phải
 * dò mù. `fields[]` chỉ xin đúng những cột cần — bản ghi đầy đủ có 116 trường,
 * kéo hết về là lãng phí và làm log khó đọc.
 */
async function fetchOrders(conf, from, to, log = () => {}) {
  const key = (conf && conf.apiKey) || '';
  if (!key) throw new Error('Chưa có api_key');
  const shops = (conf.shopIds || []).filter(Boolean);
  if (!shops.length) throw new Error('Chưa khai shopIds');
  hideSecret(key);

  const CAN = ['id', 'ad_id', 'conversation_id', 'page_id', 'post_id', 'note', 'note_print',
    'bill_phone_number', 'bill_full_name', 'total_price', 'cod', 'cash', 'money_to_collect',
    'inserted_at', 'status', 'status_name', 'ads_source', 'p_utm_source', 'p_utm_campaign'];

  const rows = [];
  let tongDon = 0;
  for (const shopId of shops) {
    let trang = 1;
    let tongTrang = 1;
    const MAX_TRANG = 200; // chặn nếu total_pages trả về sai
    while (trang <= tongTrang && trang <= MAX_TRANG) {
      const url = `${BASE}/shops/${encodeURIComponent(shopId)}/orders?` + qs({
        api_key: key,
        startDateTime: dauNgay(from),
        endDateTime: cuoiNgay(to),
        page_size: 100,
        page_number: trang,
      }) + CAN.map((f) => `&${encodeURIComponent('fields[]')}=${f}`).join('');
      const res = await getJson(url, { label: `POS đơn shop ${shopId} trang ${trang}`, retries: 2 });
      if (res && res.success === false) throw new Error(scrub(res.message || 'POS trả về success=false'));
      const batch = (res && res.data) || [];
      tongTrang = Number(res && res.total_pages) || 1;
      if (trang === 1) tongDon += Number(res && res.total_entries) || batch.length;
      batch.forEach((o) => rows.push(chuanHoa(o, shopId)));
      if (!batch.length) break;
      trang += 1;
      await nghi(150);
    }
    if (trang > MAX_TRANG) log(`  ! shop ${shopId}: dừng ở ${MAX_TRANG} trang`);
  }

  const coAd = rows.filter((r) => r.adId).length;
  const coLead = rows.filter((r) => r.leadMa).length;
  log(`  POS: ${rows.length} đơn (API báo tổng ${tongDon}) · ${coAd} có ad_id · ${coLead} có mã lead`);
  return { rows, tongDon };
}

function chuanHoa(o, shopId) {
  const lead = macLead(o.note, o.note_print);
  return {
    id: String(o.id),
    shopId: String(shopId),
    ngay: ngayVN(o.inserted_at),
    insertedAt: o.inserted_at,
    adId: o.ad_id ? String(o.ad_id) : '',
    conversationId: o.conversation_id ? String(o.conversation_id) : '',
    pageId: o.page_id ? String(o.page_id) : '',
    postId: o.post_id ? String(o.post_id) : '',
    leadMa: lead ? lead.ma : '',
    leadId: lead ? lead.id : null,
    leadTuDau: lead ? lead.tuDau : '',
    sdt: chuanSdt(o.bill_phone_number),
    tenKhach: o.bill_full_name || '',
    // Đơn POS ở đây là vỏ rỗng nên mấy số này đang là 0. Vẫn đọc để nếu đổi thì biết.
    tien: Number(o.total_price) || 0,
    cod: Number(o.cod) || 0,
    canThu: Number(o.money_to_collect) || 0,
    trangThai: o.status_name || (o.status != null ? String(o.status) : ''),
    adsSource: o.ads_source || '',
    utmSource: o.p_utm_source || '',
    utmCampaign: o.p_utm_campaign || '',
  };
}

/** Cùng luật với sync/pancake.js — hai bên phải ra CÙNG một khoá mới ghép được. */
function chuanSdt(v) {
  let s = String(v == null ? '' : v).replace(/[^\d+]/g, '');
  if (!s) return '';
  s = s.replace(/^\+?84/, '0');
  if (!s.startsWith('0')) s = `0${s}`;
  return s.length >= 9 && s.length <= 12 ? s : '';
}

/* ---------------- tổng hợp ---------------- */

/**
 * Gom theo (quảng cáo × ngày) — cùng khoá với bảng chi tiêu.
 *
 * Khác sync/pancake.js ở một chỗ quan trọng: mỗi đơn POS có ĐÚNG MỘT ad_id, nên
 * không có chuyện một bản ghi được tính cho nhiều quảng cáo. Tổng theo ad ở đây
 * bằng đúng tổng thật, không phồng lên.
 *
 * Một lead có thể có nhiều đơn POS (khách Tina có 2). Nên đếm lead theo TẬP HỢP
 * mã lead, không đếm theo số đơn — nếu không sẽ nhân đôi.
 */
function theoAdVaNgay(rows) {
  const m = new Map();
  let khongCoAd = 0;
  let khongCoLead = 0;
  const leadTatCa = new Set();

  for (const r of rows) {
    if (!r.adId) { khongCoAd += 1; continue; }
    if (r.leadId == null) khongCoLead += 1;
    else leadTatCa.add(r.leadId);
    const key = `${r.adId}|${r.ngay}`;
    let o = m.get(key);
    if (!o) {
      o = {
        adId: r.adId, ngay: r.ngay, pageId: r.pageId,
        soDon: 0, lead: new Set(), sdt: new Set(), tienPOS: 0,
      };
      m.set(key, o);
    }
    o.soDon += 1;
    if (r.leadId != null) o.lead.add(r.leadId);
    if (r.sdt) o.sdt.add(r.sdt);
    o.tienPOS += r.tien;
  }

  const out = [...m.values()].map((o) => ({
    ...o,
    soLead: o.lead.size,
    lead: [...o.lead],
    sdt: [...o.sdt],
  }));
  out.sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : b.soDon - a.soDon));
  return { rows: out, khongCoAd, khongCoLead, soLeadDuyNhat: leadTatCa.size };
}

/**
 * Bảng tra mã lead Tourwell → quảng cáo.
 *
 * Đây là thứ dùng để ghép với bản xuất Excel của Tourwell: cột "Mã lead" trong
 * file khớp thẳng với khoá của bảng này. Một lead lý thuyết chỉ thuộc một quảng
 * cáo, nhưng nếu có nhiều đơn POS mang ad_id khác nhau thì phải báo ra thay vì
 * chọn bừa một cái.
 */
function leadVeQuangCao(rows) {
  const m = new Map();
  for (const r of rows) {
    if (r.leadId == null) continue;
    let o = m.get(r.leadId);
    if (!o) { o = { leadId: r.leadId, leadMa: r.leadMa, adIds: new Set(), ngay: r.ngay, sdt: r.sdt, pageIds: new Set(), soDon: 0 }; m.set(r.leadId, o); }
    o.soDon += 1;
    if (r.adId) o.adIds.add(r.adId);
    if (r.pageId) o.pageIds.add(r.pageId);
    // giữ ngày SỚM NHẤT: đó là lúc quảng cáo sinh ra khách, không phải lúc sửa đơn
    if (r.ngay && (!o.ngay || r.ngay < o.ngay)) o.ngay = r.ngay;
    if (!o.sdt && r.sdt) o.sdt = r.sdt;
  }
  const out = [...m.values()].map((o) => ({
    ...o, adIds: [...o.adIds], pageIds: [...o.pageIds],
    roRang: o.adIds.size === 1,
  }));
  // .length chứ KHÔNG phải .size — tới đây adIds đã là mảng. Bản đầu đọc .size nên
  // hai bộ đếm dưới đây luôn ra 0, tức là lead nhập nhằng không bao giờ được báo.
  const nhapNhang = out.filter((x) => x.adIds.length > 1).length;
  const khongCoAd = out.filter((x) => x.adIds.length === 0).length;
  return { rows: out, nhapNhang, khongCoAd };
}

/* ---------------- kiểm tra kết nối ---------------- */

async function test(conf) {
  if (!conf || !conf.apiKey) return { ok: false, message: 'Chưa có api_key' };
  hideSecret(conf.apiKey);
  let shops = [];
  try { shops = await danhSachShop(conf); }
  catch (e) { return { ok: false, message: scrub(e.message) }; }

  const khai = (conf.shopIds || []).map(String);
  const results = [];
  for (const s of shops) {
    if (khai.length && !khai.includes(s.shopId)) continue;
    try {
      const url = `${BASE}/shops/${encodeURIComponent(s.shopId)}/orders?`
        + qs({ api_key: conf.apiKey, page_size: 20, page_number: 1 });
      const res = await getJson(url, { label: `POS test shop ${s.shopId}`, retries: 1 });
      const batch = (res && res.data) || [];
      const chuan = batch.map((o) => chuanHoa(o, s.shopId));
      results.push({
        shopId: s.shopId, name: s.name, ok: true,
        tongDon: Number(res && res.total_entries) || null,
        mau: chuan.length,
        coAdId: chuan.filter((x) => x.adId).length,
        coMaLead: chuan.filter((x) => x.leadMa).length,
        coTien: chuan.filter((x) => x.tien > 0).length,
        viDuLead: chuan.find((x) => x.leadMa) ? chuan.find((x) => x.leadMa).leadMa : '',
      });
    } catch (e) {
      results.push({ shopId: s.shopId, name: s.name, ok: false, message: scrub(e.message) });
    }
    await nghi(150);
  }
  if (!results.length) {
    return { ok: false, message: `api_key đọc được ${shops.length} shop nhưng không shop nào khớp shopIds đã khai`, shops };
  }
  return { ok: results.every((r) => r.ok), results, shops };
}

module.exports = {
  danhSachShop, fetchOrders, test,
  macLead, soLead, theoAdVaNgay, leadVeQuangCao, chuanSdt, dauNgay, cuoiNgay,
};
