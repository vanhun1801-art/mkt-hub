'use strict';
/**
 * Điều khiển quảng cáo NGAY TRÊN NỀN TẢNG: bật/tắt và đổi ngân sách.
 *
 * Đây là module duy nhất trong app GHI vào nền tảng. Mọi thứ khác chỉ đọc. Nên
 * nó tách riêng, và mọi hàng rào an toàn đặt ở đây chứ không rải trong giao diện
 * — giao diện thì ai cũng sửa được, còn tiền thì không lấy lại được.
 *
 * BỐN HÀNG RÀO, và vì sao mỗi cái tồn tại:
 *
 * 1. Đọc-trước-khi-ghi. Mọi lệnh đổi ngân sách phải kèm `soTienCu` mà giao diện
 *    đã thấy; module đọc lại giá trị hiện tại trên nền tảng và từ chối nếu hai
 *    bên lệch. Không có nó thì anh Hùng mở tab lúc 9h, bấm lúc 14h, và ghi đè
 *    lên một con số ai đó vừa sửa mà không biết.
 *
 * 2. Chặn biên độ ±50% mỗi lệnh. Gõ thêm một số 0 là chuyện xảy ra thật. Muốn
 *    tăng gấp ba thì bấm ba lần, mỗi lần nhìn lại số một lần.
 *
 * 3. Chỉ ghi khi ĐO ĐƯỢC là có quyền. khaNang() hỏi thẳng nền tảng chứ không tin
 *    cấu hình. Đo ngày 10/09/2026: token Meta chỉ có `ads_read`, nên bấm tắt trên
 *    Facebook sẽ 403 — thà nói trước còn hơn để anh bấm rồi thấy lỗi.
 *
 * 4. Đơn vị tiền không được đoán. Đo trên tài khoản thật: tiền VND, và Meta trả
 *    `daily_budget: 300000` cho ngân sách 300.000đ — tức hệ số 1. Nếu tài khoản
 *    dùng tiền khác thì module TỪ CHỐI thay vì đoán hệ số, vì đoán sai là lệch
 *    100 lần.
 */
const { getJson, postJson, scrub, hideSecret } = require('./http');

/** Không cho một lệnh đổi ngân sách quá ±50%. Gõ thêm một số 0 là chuyện có thật. */
const BIEN_DO_TOI_DA = 0.5;

/* Meta trả tiền theo đơn vị nhỏ nhất của tiền tài khoản. Đo trên tài khoản thật
 * (Công Ty Cổ Phần Rooty Trip Phú Quốc, VND): daily_budget 300000 = 300.000đ,
 * hệ số 1. Các tiền có hào (USD, EUR) thì hệ số 100 — nhưng KHÔNG khai bừa ở
 * đây: tiền nào chưa đo thì từ chối ghi, xem heSoTien(). */
const HE_SO_TIEN = { VND: 1, KRW: 1, JPY: 1 };

const so = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Hệ số đổi giữa đơn vị nền tảng và đồng. Chưa biết thì trả null để bên gọi TỪ
 * CHỐI, không đoán: đoán sai hệ số là đổi ngân sách lệch 100 lần.
 */
function heSoTien(maTien) {
  const k = String(maTien || '').toUpperCase();
  return Object.prototype.hasOwnProperty.call(HE_SO_TIEN, k) ? HE_SO_TIEN[k] : null;
}

/**
 * Kiểm biên độ một lệnh đổi ngân sách.
 * @returns {{ok:boolean, vi?:string, tyLe:number}}
 */
function kiemBienDo(cu, moi) {
  const a = so(cu); const b = so(moi);
  if (b <= 0) return { ok: false, vi: 'Ngân sách mới phải lớn hơn 0', tyLe: 0 };
  if (a <= 0) {
    /* Chưa có ngân sách cũ để so thì không có biên độ nào để chặn. Cho qua, vì
     * đây là lần đặt đầu tiên — nhưng nói ra để giao diện bắt gõ lại số. */
    return { ok: true, tyLe: 0, lanDau: true };
  }
  const tyLe = (b - a) / a;
  if (Math.abs(tyLe) > BIEN_DO_TOI_DA) {
    const huong = tyLe > 0 ? 'tăng' : 'giảm';
    return {
      ok: false, tyLe,
      vi: `Một lệnh chỉ được đổi tối đa ${BIEN_DO_TOI_DA * 100}%. Lệnh này ${huong} `
        + `${Math.abs(Math.round(tyLe * 100))}% (${a.toLocaleString('vi-VN')}đ → `
        + `${b.toLocaleString('vi-VN')}đ). Muốn đổi nhiều thì bấm nhiều lần, `
        + 'mỗi lần nhìn lại số một lần.',
    };
  }
  return { ok: true, tyLe };
}

/* ================================================================ Meta */

const metaVer = (c) => (c && c.apiVersion) || 'v21.0';
const actId = (id) => (String(id || '').startsWith('act_') ? String(id) : 'act_' + String(id || ''));

/**
 * Quyền ghi của token Meta — hỏi thẳng nền tảng, không tin cấu hình.
 *
 * `ads_read` cho đọc insights nhưng KHÔNG cho bật/tắt hay đổi ngân sách; việc đó
 * cần `ads_management`. Đo ngày 10/09/2026 trên token đang dùng: chỉ có ads_read.
 */
async function metaKhaNang(c, deps = {}) {
  const gj = deps.getJson || getJson;
  if (!c || !c.enabled) return { ghi: false, vi: 'Kênh đang tắt trong app' };
  if (!c.accessToken) return { ghi: false, vi: 'Chưa có token' };
  hideSecret(c.accessToken);
  try {
    const r = await gj(`https://graph.facebook.com/${metaVer(c)}/debug_token`
      + `?input_token=${encodeURIComponent(c.accessToken)}`
      + `&access_token=${encodeURIComponent(c.accessToken)}`,
      { label: 'Meta debug_token', retries: 1 });
    const quyen = ((r && r.data && r.data.scopes) || []);
    if (quyen.includes('ads_management')) return { ghi: true, quyen };
    return {
      ghi: false, quyen,
      vi: 'Token chỉ có ads_read — quyền này cho ĐỌC số, không cho bật/tắt hay đổi ngân sách.',
      cachSua: 'Vào Business Settings → System Users → chọn user của app → Add Assets / '
        + 'Assign Partners, cấp thêm quyền ads_management cho tài khoản quảng cáo, '
        + 'rồi Generate New Token và dán lại vào app. Không phải sửa code.',
    };
  } catch (e) {
    return { ghi: false, vi: 'Không hỏi được quyền của token: ' + scrub(e.message) };
  }
}

/* Trường phải hỏi theo ĐÚNG cấp. Một quảng cáo KHÔNG có daily_budget — hỏi bừa
 * thì Meta trả `(#100) Tried accessing nonexisting field (daily_budget)` và cả
 * lệnh chết, dù việc đang làm chỉ là bật/tắt. Tôi đã mắc đúng lỗi này ở bản đầu. */
const META_TRUONG = {
  'quang-cao': 'name,status,effective_status,adset_id,campaign_id,account_id',
  nhom: 'name,status,effective_status,daily_budget,lifetime_budget,campaign_id',
  'chien-dich': 'name,status,effective_status,daily_budget,lifetime_budget',
};

/**
 * Đọc trạng thái + ngân sách của một mục Meta.
 *
 * Trả về CẢ `trangThai` (cờ của chính nó) và `trangThaiThat` (effective_status).
 * Hai cái này khác nhau thật: đo trên tài khoản thật có nhóm `ACTIVE` mà
 * effective_status là `CAMPAIGN_PAUSED` — bật nhóm lên vẫn không chạy vì chiến
 * dịch đang tắt. Chỉ hiện cái đầu là app nói một điều không đúng.
 *
 * Và ngân sách có thể KHÔNG nằm ở nhóm: đo thật, nhiều nhóm trả
 * `daily_budget: undefined` vì ngân sách đặt ở cấp chiến dịch (CBO).
 */
async function metaDoc(c, id, capDo = 'quang-cao', deps = {}) {
  const gj = deps.getJson || getJson;
  const f = META_TRUONG[capDo] || META_TRUONG['quang-cao'];
  const r = await gj(`https://graph.facebook.com/${metaVer(c)}/${encodeURIComponent(id)}`
    + `?fields=${f}&access_token=${encodeURIComponent(c.accessToken)}`,
    { label: `Meta đọc ${capDo}`, retries: 1 });
  if (r && r.error) throw new Error(scrub('Meta báo lỗi: ' + (r.error.message || 'không rõ')));
  return {
    id: String(id), capDo, ten: r.name || '',
    trangThai: r.status || '',
    trangThaiThat: r.effective_status || '',
    /* Lấy id nhóm và chiến dịch TỪ CHÍNH quảng cáo, không tra trong Base: đo thật
     * thấy nhiều nhóm trong Base chưa ghép ID nền tảng, mà Meta thì luôn trả
     * adset_id và campaign_id kèm quảng cáo. Hỏi nền tảng là đường chắc hơn. */
    nhomExtId: r.adset_id ? String(r.adset_id) : '',
    chienDichExtId: r.campaign_id ? String(r.campaign_id) : '',
    /* Để dựng link mở đúng quảng cáo trên Ads Manager. Lấy từ nền tảng chứ không
     * từ cấu hình: app khai nhiều accountIds, mà quảng cáo chỉ thuộc một. */
    taiKhoanId: r.account_id ? String(r.account_id) : '',
    nganSachNgay: r.daily_budget == null ? null : so(r.daily_budget),
    nganSachTron: r.lifetime_budget == null ? null : so(r.lifetime_budget),
  };
}

async function metaTien(c, deps = {}) {
  const gj = deps.getJson || getJson;
  const acc = actId((c.accountIds || [])[0]);
  const r = await gj(`https://graph.facebook.com/${metaVer(c)}/${acc}`
    + `?fields=currency&access_token=${encodeURIComponent(c.accessToken)}`,
    { label: 'Meta tiền tài khoản', retries: 1 });
  return (r && r.currency) || '';
}

async function metaDatTrangThai(c, id, bat, deps = {}) {
  const pj = deps.postJson || postJson;
  const r = await pj(`https://graph.facebook.com/${metaVer(c)}/${encodeURIComponent(id)}`,
    { status: bat ? 'ACTIVE' : 'PAUSED', access_token: c.accessToken },
    { label: 'Meta đặt trạng thái', retries: 0 });
  if (r && r.error) throw new Error(scrub('Meta từ chối: ' + (r.error.message || 'không rõ')));
  return { ok: r.success !== false };
}

async function metaDatNganSach(c, id, soTienDong, deps = {}) {
  const pj = deps.postJson || postJson;
  const r = await pj(`https://graph.facebook.com/${metaVer(c)}/${encodeURIComponent(id)}`,
    { daily_budget: String(Math.round(soTienDong)), access_token: c.accessToken },
    { label: 'Meta đặt ngân sách', retries: 0 });
  if (r && r.error) throw new Error(scrub('Meta từ chối: ' + (r.error.message || 'không rõ')));
  return { ok: r.success !== false };
}

/* ================================================================ TikTok */

const TT_BASE = 'https://business-api.tiktok.com/open_api/v1.3';
const ttHeaders = (c) => ({ 'Access-Token': c.accessToken, 'Content-Type': 'application/json' });

/**
 * Quyền ghi của token TikTok — DÒ bằng một lời gọi chỉ-đọc.
 *
 * TikTok không có đường nào trả về danh sách scope của token. Nhưng nó trả lỗi
 * rất rõ ràng khi thiếu scope, nên gọi `/ad/get/` với page_size=1 là biết: lệnh
 * này chỉ ĐỌC, không đổi gì, mà lại đi qua đúng nhóm quyền "Ad Account
 * Management" mà lệnh bật/tắt cần.
 *
 * Đo ngày 10/09/2026 trên token đang dùng, cả năm advertiser đều trả:
 *   code 40001 — "The access token lacks the required scope for endpoint /ad/get/"
 * Tức là TikTok cũng chưa ghi được. Dò được thì nói thẳng, tốt hơn là để "chưa
 * rõ" rồi bắt anh Hùng bấm một lần mới biết.
 */
async function ttKhaNang(c, deps = {}) {
  const gj = deps.getJson || getJson;
  if (!c || !c.enabled) return { ghi: false, vi: 'Kênh đang tắt trong app' };
  if (!c.accessToken) return { ghi: false, vi: 'Chưa có token' };
  const advs = (c.advertiserIds || []);
  if (!advs.length) return { ghi: false, vi: 'Chưa khai advertiserIds' };
  hideSecret(c.accessToken);
  try {
    const r = await gj(`${TT_BASE}/ad/get/?advertiser_id=${encodeURIComponent(advs[0])}&page_size=1`,
      { headers: ttHeaders(c), label: 'TikTok dò quyền', retries: 1 });
    if (so(r && r.code) === 0) return { ghi: true };
    const loi = String((r && r.message) || '');
    if (/lacks the required scope|Permission error/i.test(loi)) {
      return {
        ghi: false,
        vi: 'Token thiếu nhóm quyền quản lý quảng cáo (Ad Account Management) — '
          + 'quyền hiện có chỉ đủ đọc báo cáo.',
        cachSua: 'Vào TikTok Business Center → Developer / App của mình → thêm scope '
          + '"Ad Account Management", rồi uỷ quyền lại và dán token mới vào app. '
          + 'Không phải sửa code.',
        loiGoc: loi,
      };
    }
    return { ghi: null, vi: 'TikTok trả lỗi khác khi dò quyền: ' + scrub(loi) };
  } catch (e) {
    return { ghi: null, vi: 'Không dò được quyền TikTok: ' + scrub(e.message) };
  }
}

/**
 * advertiser_id nào đang giữ quảng cáo này. Hỏi từng tài khoản cho tới khi thấy.
 *
 * NÉM lỗi khi TikTok từ chối vì thiếu quyền, chứ không trả null. Bản đầu tôi
 * nuốt mọi phản hồi không có `list` rồi báo "không tìm thấy quảng cáo" — nên khi
 * token thiếu scope, app nói sai hẳn nguyên nhân và anh Hùng sẽ đi tìm quảng cáo
 * thay vì đi cấp quyền. Đo thật: cả năm advertiser trả code 40001 "lacks the
 * required scope".
 */
async function ttChuQuangCao(c, adId, deps = {}) {
  const gj = deps.getJson || getJson;
  for (const adv of (c.advertiserIds || [])) {
    const q = encodeURIComponent(JSON.stringify({ ad_ids: [String(adId)] }));
    const r = await gj(`${TT_BASE}/ad/get/?advertiser_id=${encodeURIComponent(adv)}&filtering=${q}`,
      { headers: ttHeaders(c), label: 'TikTok tìm quảng cáo', retries: 1 });
    const ma = so(r && r.code);
    if (ma !== 0) {
      const loi = String((r && r.message) || '');
      if (/lacks the required scope|Permission error/i.test(loi)) {
        throw new Error('TikTok từ chối vì token thiếu nhóm quyền quản lý quảng cáo '
          + '(Ad Account Management) — không phải vì không tìm thấy quảng cáo. '
          + 'Uỷ quyền lại app TikTok với scope đó rồi dán token mới.');
      }
      throw new Error(scrub('TikTok báo lỗi khi tìm quảng cáo: ' + loi));
    }
    const ds = (r && r.data && r.data.list) || [];
    if (ds.length) return { advertiserId: String(adv), qc: ds[0] };
  }
  return null;
}

async function ttDoc(c, adId, deps = {}) {
  const t = await ttChuQuangCao(c, adId, deps);
  if (!t) throw new Error('TikTok không tìm thấy quảng cáo ' + adId + ' trong các tài khoản đã khai');
  const q = t.qc || {};
  return {
    id: String(adId), ten: q.ad_name || '', advertiserId: t.advertiserId,
    groupExtId: q.adgroup_id ? String(q.adgroup_id) : '',
    trangThai: q.operation_status || '',
    trangThaiThat: q.secondary_status || q.operation_status || '',
    nganSachNgay: null,
  };
}

async function ttDatTrangThai(c, adId, bat, deps = {}) {
  const pj = deps.postJson || postJson;
  const t = await ttChuQuangCao(c, adId, deps);
  if (!t) throw new Error('TikTok không tìm thấy quảng cáo ' + adId);
  const r = await pj(`${TT_BASE}/ad/status/update/`, {
    advertiser_id: t.advertiserId,
    ad_ids: [String(adId)],
    operation_status: bat ? 'ENABLE' : 'DISABLE',
  }, { headers: ttHeaders(c), label: 'TikTok đặt trạng thái', retries: 0 });
  if (r && so(r.code) !== 0) throw new Error(scrub('TikTok từ chối: ' + (r.message || 'không rõ')));
  return { ok: true };
}

async function ttDocNhom(c, advertiserId, groupId, deps = {}) {
  const gj = deps.getJson || getJson;
  const q = encodeURIComponent(JSON.stringify({ adgroup_ids: [String(groupId)] }));
  const r = await gj(`${TT_BASE}/adgroup/get/?advertiser_id=${encodeURIComponent(advertiserId)}&filtering=${q}`,
    { headers: ttHeaders(c), label: 'TikTok đọc nhóm', retries: 1 });
  const g = ((r && r.data && r.data.list) || [])[0];
  if (!g) throw new Error('TikTok không tìm thấy nhóm quảng cáo ' + groupId);
  return {
    id: String(groupId), ten: g.adgroup_name || '',
    trangThai: g.operation_status || '', trangThaiThat: g.secondary_status || '',
    /* TikTok trả ngân sách bằng ĐƠN VỊ TIỀN của tài khoản, không phải đơn vị nhỏ
     * nhất — khác Meta. Nên không nhân chia gì ở đây. */
    nganSachNgay: g.budget == null ? null : so(g.budget),
    kieuNganSach: g.budget_mode || '',
  };
}

async function ttDatNganSach(c, advertiserId, groupId, soTienDong, deps = {}) {
  const pj = deps.postJson || postJson;
  const r = await pj(`${TT_BASE}/adgroup/budget/update/`, {
    advertiser_id: String(advertiserId),
    budget_list: [{ adgroup_id: String(groupId), budget: Math.round(soTienDong) }],
  }, { headers: ttHeaders(c), label: 'TikTok đặt ngân sách', retries: 0 });
  if (r && so(r.code) !== 0) throw new Error(scrub('TikTok từ chối: ' + (r.message || 'không rõ')));
  return { ok: true };
}

/* ================================================================ Google Ads */

/**
 * Google Ads: scope uỷ quyền là `https://www.googleapis.com/auth/adwords`, và
 * scope đó gồm CẢ đọc lẫn ghi — không có scope chỉ-đọc riêng. Nên nếu đọc số
 * đang chạy được thì ghi cũng đã được uỷ quyền.
 *
 * Nhưng còn một cửa nữa Google có thể chặn: mức truy cập của developer token
 * (Test / Basic / Standard). Token mức Test chỉ chạy trên tài khoản thử nghiệm.
 * Cái đó không hỏi trước được, nên nói rõ là "đã uỷ quyền, Google vẫn có thể từ
 * chối ở mức developer token" thay vì hứa chắc.
 */
function gaKhaNang(c) {
  if (!c || !c.enabled) return { ghi: false, vi: 'Kênh đang tắt trong app' };
  if (!c.refreshToken) return { ghi: false, vi: 'Chưa có refresh token' };
  if (!c.developerToken) return { ghi: false, vi: 'Chưa khai developer token' };
  return {
    ghi: true,
    vi: 'Scope auth/adwords gồm cả đọc lẫn ghi nên đã uỷ quyền. Google vẫn có thể '
      + 'từ chối nếu developer token còn ở mức Test — lúc đó app hiện đúng câu Google trả về.',
  };
}

/**
 * Link mở đúng chỗ trên nền tảng.
 *
 * Nhãn nói rõ nó mở CÁI GÌ, vì độ chính xác của link mỗi nền tảng mỗi khác:
 * Facebook lọc được tới từng quảng cáo, TikTok và Google chỉ tới được tài khoản.
 * Hứa "mở quảng cáo này" rồi nhảy ra trang tài khoản là một lời nói sai nhỏ,
 * nhưng vẫn là nói sai.
 */
function lienKetNenTang(nenTang, { taiKhoanId, adExtId, advertiserId, customerId } = {}) {
  if (nenTang === 'Facebook' && taiKhoanId) {
    return {
      url: 'https://adsmanager.facebook.com/adsmanager/manage/ads?act='
        + encodeURIComponent(String(taiKhoanId).replace(/^act_/, ''))
        + (adExtId ? '&selected_ad_ids=' + encodeURIComponent(adExtId) : ''),
      nhan: 'Mở quảng cáo này trên Ads Manager',
    };
  }
  if (nenTang === 'TikTok' && advertiserId) {
    return {
      url: 'https://ads.tiktok.com/i18n/perf/ads?aadvid=' + encodeURIComponent(advertiserId),
      nhan: 'Mở tài khoản này trên TikTok Ads',
    };
  }
  if (nenTang === 'Google Ads' && customerId) {
    return {
      url: 'https://ads.google.com/aw/campaigns?__c=' + encodeURIComponent(customerId),
      nhan: 'Mở tài khoản này trên Google Ads',
    };
  }
  return null;
}

module.exports = {
  lienKetNenTang,
  BIEN_DO_TOI_DA, HE_SO_TIEN, heSoTien, kiemBienDo,
  metaKhaNang, metaDoc, metaTien, metaDatTrangThai, metaDatNganSach,
  ttKhaNang, ttChuQuangCao, ttDoc, ttDatTrangThai, ttDocNhom, ttDatNganSach,
  gaKhaNang,
};
