/**
 * Pancake Chat (pages.fm) — nguồn duy nhất còn giữ được "khách này đến từ quảng
 * cáo nào". Tourwell chỉ giữ được nguồn ở mức nhãn, mà nhãn đó lại do một
 * webhook cấp cửa hàng đóng chung cho mọi page nên không phân biệt được kênh.
 *
 * Hai loại token, đừng lẫn:
 *   - access_token       (cấp tài khoản)  https://pages.fm/api/v1/...
 *                        Hết hạn tối đa 90 ngày. Chỉ dùng để liệt kê page.
 *   - page_access_token  (cấp page)       https://pages.fm/api/public_api/v2/...
 *                        KHÔNG hết hạn. Đây là thứ app dùng để chạy lâu dài.
 * Cả hai truyền bằng query param, không có Authorization header.
 *
 * Giới hạn: 5 request/giây cho MỖI page (tính riêng từng page_id).
 */
const { getJson, hideSecret, scrub } = require('./http');

const BASE_USER = 'https://pages.fm/api/v1';
const BASE_PAGE = 'https://pages.fm/api/public_api/v2';

/* Pancake gọi nền tảng bằng nhiều tên; quy về đúng tên nền tảng trong Base để
 * ghép được với bảng chi tiêu. */
const NEN_TANG = {
  facebook: 'Facebook', fb: 'Facebook', page: 'Facebook',
  tiktok: 'TikTok', tiktok_business: 'TikTok',
  instagram: 'Instagram', zalo: 'Zalo', whatsapp: 'WhatsApp',
};

function chuanNenTang(v) {
  const k = String(v || '').toLowerCase().trim();
  return NEN_TANG[k] || (v ? String(v) : '');
}

/**
 * Đoán nền tảng từ tiền tố của page_id.
 *
 * API /pages trả trường platform cho page Facebook nhưng để trống với mấy loại
 * khác, nên bảng hiện ra bắt người dùng tự chọn — mà nhìn `ttm_-0004gFkT50UIFZT…`
 * thì không ai biết đó là TikTok. Tiền tố là tín hiệu chắc chắn, dùng luôn:
 *   igo_  → Instagram        waba_ → WhatsApp
 *   ttm_  → TikTok           chỉ toàn số → Facebook
 * Zalo cũng toàn số như Facebook nên KHÔNG đoán bừa: chỉ nhận số là Facebook khi
 * API không nói gì khác, và trường platform của API luôn được ưu tiên.
 */
const TIEN_TO = [
  [/^igo[_-]/i, 'Instagram'],
  [/^waba[_-]/i, 'WhatsApp'],
  [/^ttm[_-]/i, 'TikTok'],
  [/^zalo[_-]/i, 'Zalo'],
];

function doanNenTang(pageId, tuApi) {
  const theoApi = chuanNenTang(tuApi);
  if (theoApi) return theoApi;
  const id = String(pageId || '');
  for (const [re, ten] of TIEN_TO) if (re.test(id)) return ten;
  return /^\d{6,}$/.test(id) ? 'Facebook' : '';
}

/** 'YYYY-MM-DD' (giờ VN) → unix giây tại 00:00:00 +07. */
function dauNgay(ngay) {
  return Math.floor(Date.parse(`${ngay}T00:00:00+07:00`) / 1000);
}
/** 'YYYY-MM-DD' → unix giây tại 23:59:59 +07. */
function cuoiNgay(ngay) {
  return Math.floor(Date.parse(`${ngay}T23:59:59+07:00`) / 1000);
}
/** ISO datetime → 'YYYY-MM-DD' theo giờ VN. */
function ngayVN(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function qs(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

/* ---------------- cấp tài khoản ---------------- */

/**
 * Liệt kê page mà tài khoản quản. Dùng để lấy page_id — thứ không hiện rõ trong
 * giao diện Pancake, và là chỗ dễ gõ nhầm nhất khi khai bằng tay.
 */
async function danhSachPage(conf) {
  const token = (conf && conf.userToken) || '';
  if (!token) throw new Error('Chưa có userToken (Pancake → Ảnh đại diện → Cài đặt cá nhân → API Access Token)');
  hideSecret(token);
  const res = await getJson(`${BASE_USER}/pages?${qs({ access_token: token })}`,
    { label: 'Pancake danh sách page', retries: 2 });
  if (res && res.success === false) throw new Error(scrub(res.message || 'Pancake trả về success=false'));
  const raw = (res && (res.categorized || res.pages)) || {};
  const out = [];
  const nhan = (arr, nenTang) => (arr || []).forEach((p) => {
    const pageId = String(p.id || p.page_id || '');
    out.push({
      pageId,
      label: p.name || '',
      platform: doanNenTang(pageId, p.platform || nenTang),
      username: p.username || p.page_username || '',
    });
  });
  if (Array.isArray(raw)) nhan(raw);
  else Object.entries(raw).forEach(([k, v]) => nhan(v, k));
  return out.filter((p) => p.pageId);
}

/* ---------------- cấp page ---------------- */

/** Tag của page, kèm cờ is_lead_event — Pancake tự đánh dấu tag nào là sự kiện chốt. */
async function danhSachTag(page) {
  if (!page || !page.token) throw new Error('Page chưa có token');
  hideSecret(page.token);
  const res = await getJson(
    `${BASE_PAGE}/pages/${encodeURIComponent(page.pageId)}/tags?${qs({ page_access_token: page.token })}`,
    { label: `Pancake tag ${page.pageId}`, retries: 2 });
  const list = (res && (res.tags || res.data)) || [];
  return list.filter(Boolean).map((t) => ({
    id: t.id, text: t.text || '', color: t.color || '',
    laChot: !!t.is_lead_event, ngung: !!t.is_deactive,
  }));
}

/**
 * Hội thoại của một page trong khoảng ngày.
 *
 * Phân trang bằng last_conversation_id, mỗi lượt 60 dòng. `since`/`until` là
 * unix GIÂY. Tài liệu không nói rõ hai tham số đó lọc theo inserted_at hay
 * updated_at, nên lọc lại phía mình theo inserted_at và ĐẾM số dòng bị loại —
 * đoán bừa chỗ này là ghi sai ngày cho cả bảng.
 */
async function fetchConversations(page, from, to, log = () => {}) {
  if (!page || !page.token) throw new Error('Page chưa có token');
  if (!page.pageId) throw new Error('Page chưa có pageId');
  hideSecret(page.token);

  const since = dauNgay(from);
  const until = cuoiNgay(to);
  const rows = [];
  let cursor = '';
  let luot = 0;
  let ngoaiKhoang = 0;
  const MAX_LUOT = 400; // chặn vòng lặp vô hạn nếu cursor không tiến

  while (luot < MAX_LUOT) {
    const url = `${BASE_PAGE}/pages/${encodeURIComponent(page.pageId)}/conversations?`
      + qs({
        page_access_token: page.token,
        order_by: 'inserted_at',
        since, until,
        last_conversation_id: cursor || undefined,
      });
    const res = await getJson(url, { label: `Pancake hội thoại ${page.pageId}`, retries: 2 });
    if (res && res.success === false) throw new Error(scrub(res.message || 'Pancake trả về success=false'));
    const batch = (res && (res.conversations || res.data)) || [];
    if (!batch.length) break;

    let hetKhoang = false;
    for (const c of batch) {
      const ngay = ngayVN(c.inserted_at);
      if (!ngay) { ngoaiKhoang += 1; continue; }
      if (ngay < from) { hetKhoang = true; ngoaiKhoang += 1; continue; }
      if (ngay > to) { ngoaiKhoang += 1; continue; }
      rows.push(chuanHoa(c, page));
    }

    const cuoi = batch[batch.length - 1];
    const idCuoi = cuoi && cuoi.id;
    if (!idCuoi || idCuoi === cursor) break; // cursor không tiến → dừng, đừng quay vòng
    cursor = idCuoi;
    luot += 1;
    if (hetKhoang) break; // đã lùi qua mốc from, các trang sau còn cũ hơn
    await nghi(210); // 5 req/giây mỗi page → giãn ra hơn 200ms cho chắc
  }

  if (luot >= MAX_LUOT) log(`  ! ${page.label || page.pageId}: dừng ở ${MAX_LUOT} lượt phân trang`);
  log(`  ${page.label || page.pageId}: ${rows.length} hội thoại trong khoảng`
    + (ngoaiKhoang ? `, bỏ ${ngoaiKhoang} dòng ngoài khoảng` : ''));
  return { rows, ngoaiKhoang, luot };
}

function nghi(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Rút gọn hội thoại về đúng những gì cần cho việc đo. */
function chuanHoa(c, page) {
  const sdt = (c.recent_phone_numbers || []).filter(Boolean);
  const tags = (c.tags || []).filter(Boolean);
  return {
    id: c.id,
    pageId: c.page_id || page.pageId,
    platform: page.platform || '',
    label: page.label || '',
    type: c.type || '',
    ngay: ngayVN(c.inserted_at),
    insertedAt: c.inserted_at,
    updatedAt: c.updated_at,
    adIds: (c.ad_ids || []).filter(Boolean).map(String),
    postId: c.post_id || '',
    coSdt: !!c.has_phone || sdt.length > 0,
    sdt: sdt.map((p) => chuanSdt(p.phone_number)).filter(Boolean),
    orderIds: sdt.map((p) => p.order_id).filter((x) => x != null),
    tags: tags.map((t) => t.text || '').filter(Boolean),
    tagChotCuaPancake: tags.some((t) => t.is_lead_event),
    soTinNhan: c.message_count || 0,
    khachId: c.customer_id || '',
    tenKhach: (c.from && c.from.name) || '',
    sales: (c.current_assign_users || []).map((u) => u.name).filter(Boolean),
  };
}

/**
 * Chuẩn hoá số điện thoại về một dạng duy nhất. Bắt buộc phải có: Tourwell lưu
 * '(+84)982266226', Pancake lưu '0933833893' — cùng một người, hai chuỗi khác
 * nhau. Không chuẩn hoá thì ghép doanh thu ra 1 dòng trên 998.
 */
function chuanSdt(v) {
  let s = String(v == null ? '' : v).replace(/[^\d+]/g, '');
  if (!s) return '';
  s = s.replace(/^\+?84/, '0');
  if (!s.startsWith('0')) s = `0${s}`;
  return s.length >= 9 && s.length <= 12 ? s : '';
}

/* ---------------- tổng hợp ---------------- */

/**
 * Gom hội thoại theo (quảng cáo × ngày) — cùng khoá với bảng chi tiêu, để nối
 * được trực tiếp. Một hội thoại có nhiều ad_ids thì tính cho mọi ad: Pancake
 * không nói ad nào là ad cuối, và chia nhỏ ra sẽ tạo số thập phân vô nghĩa.
 * Chỗ này ghi rõ để người đọc báo cáo biết tổng theo ad có thể lớn hơn tổng thật.
 */
function theoAdVaNgay(rows, { tagChot = [] } = {}) {
  const chot = new Set(tagChot.map((t) => String(t).toLowerCase().trim()).filter(Boolean));
  const m = new Map();
  let khongCoAd = 0;
  let trungAd = 0;

  for (const r of rows) {
    if (!r.adIds.length) { khongCoAd += 1; continue; }
    if (r.adIds.length > 1) trungAd += 1;
    const laChot = r.tagChotCuaPancake
      || r.tags.some((t) => chot.has(String(t).toLowerCase().trim()));
    for (const adId of r.adIds) {
      const key = `${adId}|${r.ngay}`;
      let o = m.get(key);
      if (!o) {
        o = {
          adId, ngay: r.ngay, platform: r.platform,
          hoiThoai: 0, coSdt: 0, chot: 0, soDon: 0, sdt: new Set(),
        };
        m.set(key, o);
      }
      o.hoiThoai += 1;
      if (r.coSdt) o.coSdt += 1;
      if (laChot) o.chot += 1;
      o.soDon += r.orderIds.length;
      r.sdt.forEach((p) => o.sdt.add(p));
    }
  }
  const out = [...m.values()].map((o) => ({ ...o, sdt: [...o.sdt] }));
  out.sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : 0));
  return { rows: out, khongCoAd, trungAd };
}

/* ---------------- kiểm tra kết nối ---------------- */

async function test(conf) {
  const pages = (conf && conf.pages) || [];
  if (!pages.length) return { ok: false, message: 'Chưa khai page nào' };
  const results = [];
  for (const p of pages) {
    if (!p.token) { results.push({ pageId: p.pageId, label: p.label, ok: false, message: 'Chưa có token' }); continue; }
    hideSecret(p.token);
    try {
      const url = `${BASE_PAGE}/pages/${encodeURIComponent(p.pageId)}/conversations?`
        + qs({ page_access_token: p.token, order_by: 'inserted_at' });
      const res = await getJson(url, { label: `Pancake test ${p.pageId}`, retries: 1 });
      if (res && res.success === false) {
        results.push({ pageId: p.pageId, label: p.label, ok: false, message: scrub(res.message || 'success=false') });
        continue;
      }
      const list = (res && (res.conversations || res.data)) || [];
      const coAd = list.filter((c) => (c.ad_ids || []).filter(Boolean).length).length;
      const coSdt = list.filter((c) => c.has_phone).length;
      results.push({
        pageId: p.pageId, label: p.label, platform: p.platform, ok: true,
        mau: list.length, coAdIds: coAd, coSdt,
        moiNhat: list.length ? ngayVN(list[0].inserted_at) : '',
      });
    } catch (e) {
      results.push({ pageId: p.pageId, label: p.label, ok: false, message: scrub(e.message) });
    }
    await nghi(210);
  }
  return { ok: results.every((r) => r.ok), results };
}

module.exports = {
  danhSachPage, danhSachTag, fetchConversations, test,
  theoAdVaNgay, chuanSdt, chuanNenTang, doanNenTang, ngayVN, dauNgay, cuoiNgay,
};
