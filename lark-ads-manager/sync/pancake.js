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
/**
 * Key POS bị dán vào ô token của thẻ hội thoại — đã xảy ra thật, và Pancake chỉ
 * trả về "Invalid access_token" nên không ai biết mình dán sai CHỖ.
 *
 * Nhận ra được: api_key của POS là 32 ký tự hex (đã thấy hai mẫu thật:
 * b7c5321ef4d14cc08908beea0560d584 và a34cdb2e870a9b11aa96c1a...). Token của
 * pages.fm không có dạng đó. Nói thẳng ra thay vì để người dùng tự mò.
 */
function laKeyPOS(v) {
  return /^[0-9a-f]{32}$/i.test(String(v || '').trim());
}

async function danhSachPage(conf) {
  const token = (conf && conf.userToken) || '';
  if (!token) throw new Error('Chưa có userToken (Pancake → Ảnh đại diện → Cài đặt cá nhân → API Access Token)');
  if (laKeyPOS(token)) {
    throw new Error('Chuỗi này là api_key của Pancake POS (32 ký tự hex), không phải token của pages.fm. '
      + 'Dán nó vào ô api_key ở thẻ "Pancake POS — đơn hàng & mã lead Tourwell" bên dưới.');
  }
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


/* ---------------- ghép với bảng chi tiêu ---------------- */

/**
 * `ad_ids` của Pancake là ID cấp nào?
 *
 * Pancake gắn nhãn "Ad ID", nhưng ID quảng cáo và ID chiến dịch của Meta cùng một
 * không gian số và thường chỉ lệch nhau vài chữ số — trong Base này chiến dịch
 * `Daily_Tour Đảo` là 52518121733306 còn quảng cáo `IS_Giá chưa tới 1 củ` là
 * 52518121733506, lệch đúng MỘT chữ số. Nhìn mắt thường không phân biệt được, mà
 * chọn sai cấp thì hoặc khớp 0 dòng, hoặc tệ hơn: khớp nhầm sang bản ghi khác và
 * mọi con số sau đó đều sai mà vẫn nhìn hợp lý.
 *
 * Nên KHÔNG chọn. Đếm thật xem mỗi ID khớp ở cấp nào rồi báo ra, để người đọc tự
 * thấy dữ liệu đang ở cấp nào.
 */
function phanLoaiId(adIds, data) {
  const bang = (arr) => new Map((arr || [])
    .filter((x) => x.extId)
    .map((x) => [String(x.extId), x]));
  const mAd = bang(data.ads);
  const mNhom = bang(data.groups);
  const mCd = bang(data.campaigns);

  const out = { quangCao: [], nhom: [], chienDich: [], khongKhop: [] };
  [...new Set((adIds || []).map(String))].forEach((id) => {
    if (mAd.has(id)) out.quangCao.push({ id, ten: mAd.get(id).name, rec: mAd.get(id) });
    else if (mNhom.has(id)) out.nhom.push({ id, ten: mNhom.get(id).name, rec: mNhom.get(id) });
    else if (mCd.has(id)) out.chienDich.push({ id, ten: mCd.get(id).name, rec: mCd.get(id) });
    else out.khongKhop.push({ id });
  });

  const dem = {
    quangCao: out.quangCao.length, nhom: out.nhom.length,
    chienDich: out.chienDich.length, khongKhop: out.khongKhop.length,
  };
  const tong = dem.quangCao + dem.nhom + dem.chienDich + dem.khongKhop;
  // Cấp nào khớp nhiều nhất thì đó là cấp Pancake đang trả. Chỉ kết luận khi nó
  // chiếm đa số rõ rệt; lẫn lộn thì nói là lẫn lộn, đừng đoán.
  let capDo = 'chua-ro';
  const khop = dem.quangCao + dem.nhom + dem.chienDich;
  if (khop > 0) {
    const cao = Math.max(dem.quangCao, dem.nhom, dem.chienDich);
    if (cao / khop >= 0.8) {
      capDo = cao === dem.quangCao ? 'quang-cao' : cao === dem.nhom ? 'nhom' : 'chien-dich';
    } else capDo = 'lan-lon';
  }
  return { ...out, dem, tong, capDo, tyLeKhop: tong ? khop / tong : 0 };
}

/**
 * Ghép (quảng cáo × ngày) của Pancake với chi tiêu (quảng cáo × ngày) trong Base.
 *
 * Ghép ở cấp nào là do phanLoaiId nói, không do mình đặt trước. Nếu Pancake trả ID
 * chiến dịch thì cộng chi tiêu của mọi quảng cáo thuộc chiến dịch đó trong ngày đó.
 *
 * Trả về cả dòng KHÔNG ghép được (chi tiêu có mà không có hội thoại, và ngược lại)
 * — đó mới là chỗ đáng xem, vì nó nói mình đang mù ở đâu.
 */
function ghepVoiChiTieu(gomTheoAd, data, { from, to } = {}) {
  const phanLoai = phanLoaiId(gomTheoAd.rows.map((r) => r.adId), data);

  // extId → danh sách record_id ở cấp quảng cáo, để tra chi tiêu theo dòng ngày.
  const veAd = new Map();
  (data.ads || []).forEach((a) => { if (a.extId) veAd.set(String(a.extId), [a.id]); });
  (data.groups || []).forEach((g) => {
    if (!g.extId) return;
    veAd.set(String(g.extId), (data.ads || []).filter((a) => a.groupId === g.id).map((a) => a.id));
  });
  (data.campaigns || []).forEach((c) => {
    if (!c.extId) return;
    veAd.set(String(c.extId), (data.ads || []).filter((a) => a.campaignId === c.id).map((a) => a.id));
  });

  // (record_id quảng cáo × ngày) → chi tiêu
  const chi = new Map();
  (data.daily || []).forEach((r) => {
    if (from && r.date < from) return;
    if (to && r.date > to) return;
    const k = `${r.adId}|${r.date}`;
    const o = chi.get(k) || { spend: 0, conversions: 0, clicks: 0, impressions: 0 };
    o.spend += r.spend || 0;
    o.conversions += r.conversions || 0;
    o.clicks += r.clicks || 0;
    o.impressions += r.impressions || 0;
    chi.set(k, o);
  });

  const ten = new Map();
  ['ads', 'groups', 'campaigns'].forEach((k) => (data[k] || []).forEach((x) => {
    if (x.extId) ten.set(String(x.extId), x.name);
  }));

  const daDung = new Set();
  const rows = gomTheoAd.rows.map((r) => {
    const recs = veAd.get(String(r.adId)) || [];
    let spend = 0, cvNenTang = 0;
    recs.forEach((rid) => {
      const k = `${rid}|${r.ngay}`;
      const o = chi.get(k);
      if (o) { spend += o.spend; cvNenTang += o.conversions; daDung.add(k); }
    });
    return {
      adId: r.adId,
      ten: ten.get(String(r.adId)) || '',
      ghepDuoc: recs.length > 0,
      ngay: r.ngay,
      platform: r.platform,
      hoiThoai: r.hoiThoai,
      coSdt: r.coSdt,
      chot: r.chot,
      soDon: r.soDon,
      spend,
      cvNenTang,
      // Ba chỉ số quyết định ngân sách. Chia cho 0 thì để null, đừng để Infinity
      // lọt ra giao diện rồi hiện "∞đ".
      giaMoiHoiThoai: r.hoiThoai ? Math.round(spend / r.hoiThoai) : null,
      giaMoiSdt: r.coSdt ? Math.round(spend / r.coSdt) : null,
      giaMoiChot: r.chot ? Math.round(spend / r.chot) : null,
      /* Đơn POS lấy từ recent_phone_numbers[].order_id — Pancake tự gắn, không do
       * ai gõ tay. Tin được hơn cả has_phone (chỉ bật khi Pancake tự dò ra số) và
       * hơn tag "Chốt" (sales phải nhớ gắn). */
      giaMoiDon: r.soDon ? Math.round(spend / r.soDon) : null,
    };
  });

  // Chi tiêu trong khoảng mà KHÔNG có hội thoại nào ghép vào — tiền đang chạy mà
  // không đo được. Đây là con số cần nhìn nhất, nên tính hẳn ra.
  let chiKhongGhep = 0;
  let chiTongKhoang = 0;
  /* Không chỉ TỔNG tiền không đo được, mà là NẰM Ở ĐÂU. Một con số 61% cho biết
   * có chuyện, nhưng không cho biết phải đi sửa chỗ nào; gom theo từng quảng cáo
   * và từng nền tảng thì thấy ngay là lệch cả một kênh hay chỉ vài mẫu lẻ. */
  const theoAdChua = new Map();
  chi.forEach((o, k) => {
    chiTongKhoang += o.spend;
    if (!daDung.has(k)) {
      chiKhongGhep += o.spend;
      const rid = k.slice(0, k.lastIndexOf('|'));
      const g = theoAdChua.get(rid) || { spend: 0, soNgay: 0 };
      g.spend += o.spend;
      g.soNgay += 1;
      theoAdChua.set(rid, g);
    }
  });
  /* Quảng cáo nào đã ghép được ở ÍT NHẤT MỘT ngày. Thiếu chỗ này thì mọi ngày
   * trống đều bị đổ cho "page chưa nối", trong khi thật ra chỉ là ngày không ai
   * nhắn tin — hai chuyện phải làm hai việc khác nhau để sửa. */
  const ghepDuocNgayNaoDo = new Set();
  daDung.forEach((k) => ghepDuocNgayNaoDo.add(k.slice(0, k.lastIndexOf('|'))));

  /* Số ID không khớp KHÔNG nói lên mức độ nghiêm trọng — 17 trên 33 ID nghe nhiều
   * nhưng có thể chỉ mang vài chục hội thoại. Đếm theo khối lượng thật để biết có
   * đáng đi truy tiếp hay không. */
  const khongKhop = rows.filter((r) => !r.ghepDuoc);
  const doLon = {
    hoiThoai: khongKhop.reduce((a, r) => a + r.hoiThoai, 0),
    coSdt: khongKhop.reduce((a, r) => a + r.coSdt, 0),
    chot: khongKhop.reduce((a, r) => a + r.chot, 0),
    soDon: khongKhop.reduce((a, r) => a + r.soDon, 0),
  };
  const tongHoiThoai = rows.reduce((a, r) => a + r.hoiThoai, 0);
  doLon.tyLeHoiThoai = tongHoiThoai ? doLon.hoiThoai / tongHoiThoai : 0;
  // Năm ID không khớp mang nhiều hội thoại nhất — để truy đúng cái đáng truy
  doLon.nangNhat = [...khongKhop]
    .sort((a, b) => b.hoiThoai - a.hoiThoai)
    .slice(0, 5)
    .map((r) => ({ adId: r.adId, hoiThoai: r.hoiThoai, coSdt: r.coSdt }));

  const ghepDuoc = rows.filter((r) => r.ghepDuoc);
  const tong = ghepDuoc.reduce((s, r) => ({
    spend: s.spend + r.spend,
    hoiThoai: s.hoiThoai + r.hoiThoai,
    coSdt: s.coSdt + r.coSdt,
    chot: s.chot + r.chot,
    soDon: s.soDon + r.soDon,
  }), { spend: 0, hoiThoai: 0, coSdt: 0, chot: 0, soDon: 0 });

  /* record_id quảng cáo -> tên và nền tảng, để dòng báo cáo đọc được bằng mắt
   * chứ không phải một dãy recXXXX. */
  const adTheoRec = new Map();
  (data.ads || []).forEach((a) => adTheoRec.set(a.id, a));
  const chiKhongGhepTheoAd = [...theoAdChua.entries()]
    .map(([rid, g]) => {
      const a = adTheoRec.get(rid) || {};
      return {
        recId: rid,
        extId: a.extId || '',
        ten: a.name || '(không rõ tên)',
        platform: a.platform || '',
        spend: g.spend,
        soNgay: g.soNgay,
        // Chưa có extId nghĩa là bản ghi chưa được ghép ID nền tảng — hỏng ở Base,
        // khác hẳn với có extId mà Pancake không thấy hội thoại nào.
        thieuExtId: !a.extId,
        // Ngày khác của chính quảng cáo này VẪN ghép được -> đây chỉ là ngày
        // không ai nhắn, không phải lỗi kết nối.
        ghepDuocNgayKhac: ghepDuocNgayNaoDo.has(rid),
        vi: !a.extId ? 'thieu-id' : (ghepDuocNgayNaoDo.has(rid) ? 'ngay-trong' : 'mu'),
      };
    })
    .filter((x) => x.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  /* Con số đáng nhìn nhất: bao nhiêu tiền MÙ THẬT SỰ. Tổng 61% gộp cả ngày trống
   * nên nói quá mức nghiêm trọng; tách ra rồi mới quyết được có đáng đi sửa không. */
  const chiKhongGhepTheoVi = { 'thieu-id': 0, mu: 0, 'ngay-trong': 0 };
  chiKhongGhepTheoAd.forEach((x) => { chiKhongGhepTheoVi[x.vi] += x.spend; });

  const chiKhongGhepTheoNenTang = {};
  chiKhongGhepTheoAd.forEach((x) => {
    const k = x.platform || '(không rõ)';
    const o = chiKhongGhepTheoNenTang[k] || { spend: 0, soAd: 0, thieuExtId: 0 };
    o.spend += x.spend;
    o.soAd += 1;
    if (x.thieuExtId) o.thieuExtId += 1;
    chiKhongGhepTheoNenTang[k] = o;
  });

  rows.sort((a, b) => b.spend - a.spend);
  return {
    phanLoai: {
      dem: phanLoai.dem, tong: phanLoai.tong, capDo: phanLoai.capDo,
      tyLeKhop: phanLoai.tyLeKhop,
      viDuKhongKhop: phanLoai.khongKhop.slice(0, 5).map((x) => x.id),
    },
    rows,
    tong,
    chiKhongGhep,
    chiKhongGhepTheoAd,
    chiKhongGhepTheoNenTang,
    chiKhongGhepTheoVi,
    chiTongKhoang,
    soDongKhongGhep: rows.length - ghepDuoc.length,
    doLonKhongKhop: doLon,
  };
}

module.exports = {
  danhSachPage, danhSachTag, fetchConversations, test,
  theoAdVaNgay, phanLoaiId, ghepVoiChiTieu, laKeyPOS,
  chuanSdt, chuanNenTang, doanNenTang, ngayVN, dauNgay, cuoiNgay,
};
