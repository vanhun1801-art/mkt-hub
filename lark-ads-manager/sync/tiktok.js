'use strict';
/**
 * Adapter TikTok — Marketing API, báo cáo tổng hợp (report/integrated/get)
 * ở data_level AUCTION_AD, chia theo ngày.
 */
const { getJson, scrub, hideSecret } = require('./http');

const PLATFORM = 'TikTok';
const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

const num = (v) => {
  const n = Number(String(v == null ? 0 : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const METRICS = [
  'spend', 'impressions', 'clicks', 'conversion', 'result',
  'ad_name', 'adgroup_id', 'adgroup_name', 'campaign_id', 'campaign_name',
];

async function fetchRange(conf, from, to, log = () => {}) {
  if (!conf.accessToken) throw new Error('Chưa có TikTok accessToken trong ket-noi.json');
  hideSecret(conf.accessToken);
  const advs = (conf.advertiserIds || []).map((x) => String(x).trim()).filter(Boolean);
  if (!advs.length) throw new Error('Chưa khai advertiserIds cho TikTok trong ket-noi.json');

  const convKey = conf.conversionMetric === 'result' ? 'result' : 'conversion';
  const out = [];
  for (const adv of advs) {
    let page = 1;
    for (let guard = 0; guard < 60; guard++) {
      const q = new URLSearchParams({
        advertiser_id: adv,
        report_type: 'BASIC',
        data_level: 'AUCTION_AD',
        service_type: 'AUCTION',
        dimensions: JSON.stringify(['ad_id', 'stat_time_day']),
        metrics: JSON.stringify(METRICS),
        start_date: from,
        end_date: to,
        page: String(page),
        page_size: '1000',
      });
      const res = await getJson(`${BASE}/report/integrated/get/?${q}`, {
        headers: { 'Access-Token': conf.accessToken },
        label: `TikTok ${adv} trang ${page}`,
      });
      if (Number(res.code) !== 0) {
        throw new Error(scrub(`TikTok báo lỗi (${res.code}): ${res.message || 'không rõ'}`));
      }
      const list = (res.data && res.data.list) || [];
      list.forEach((r) => {
        const d = r.dimensions || {};
        const m = r.metrics || {};
        out.push({
          platform: PLATFORM,
          date: String(d.stat_time_day || '').slice(0, 10),
          campaignExtId: String(m.campaign_id || ''),
          campaignName: String(m.campaign_name || ''),
          groupExtId: String(m.adgroup_id || ''),
          groupName: String(m.adgroup_name || ''),
          adExtId: String(d.ad_id || ''),
          adName: String(m.ad_name || ''),
          spend: num(m.spend),
          impressions: num(m.impressions),
          clicks: num(m.clicks),
          conversions: num(m[convKey]),
        });
      });
      log(`TikTok ${adv}: đã lấy ${out.length} dòng`);
      const info = (res.data && res.data.page_info) || {};
      if (!info.total_page || page >= Number(info.total_page)) break;
      page++;
    }
  }
  return { rows: out };
}

/**
 * Dịch lỗi của TikTok thành câu chỉ đúng chỗ hỏng.
 *
 * Phép kiểm hỏi CẢ NĂM tài khoản trong một lời gọi, nên chỉ cần một tài khoản
 * chưa được uỷ quyền là TikTok từ chối cả lượt — và câu nó trả về,
 * `(40105) Access token is incorrect or has been revoked`, nghe như token hỏng
 * hoàn toàn. Hai chuyện rất khác nhau, mà cách xử lý cũng khác hẳn:
 *   · token hỏng thật  → phải lấy token mới
 *   · token còn tốt    → chỉ cần uỷ quyền thêm tài khoản đó, hoặc bỏ nó khỏi ô
 *
 * Đo 07/10/2026: token trên máy anh Hùng hỏi từng tài khoản một thì CẢ NĂM đều
 * trả code 0 kèm tên. Nên khi hỏi gộp mà hỏng, phải hỏi lẻ rồi nói rõ cái nào.
 */
async function giaiThich(conf, advs, res, deps = {}) {
  /* Cho tiêm getJson — cùng cách sync/doichieu.js vẫn làm. Module bắt getJson
   * ngay lúc nạp bằng destructuring, nên không tiêm thì bộ test buộc phải gọi
   * mạng thật, mà gọi mạng thật thì phép kiểm phụ thuộc token còn sống hay không. */
  const gj = deps.getJson || getJson;
  const ma = Number(res.code);
  const goc = `(${res.code}) ${res.message}`;
  if (ma !== 40105 && ma !== 40100 && ma !== 40001) return goc;

  /* Hỏi lẻ từng tài khoản — chỉ vài lời gọi, và nó tách bạch được hai trường hợp. */
  const tot = [];
  const hong = [];
  for (const adv of advs) {
    try {
      const q = new URLSearchParams({ advertiser_ids: JSON.stringify([adv]) });
      const r = await gj(`${BASE}/advertiser/info/?${q}`, {
        headers: { 'Access-Token': conf.accessToken }, label: 'TikTok dò lẻ', retries: 1,
      });
      if (Number(r.code) === 0 && ((r.data && r.data.list) || []).length) tot.push(adv);
      else hong.push(adv);
    } catch (_) { hong.push(adv); }
  }

  if (!tot.length) {
    return goc + ' — token KHÔNG dùng được với tài khoản nào đang khai. '
      + 'Thường là token sai, đã bị thu hồi, hoặc thuộc một TikTok App khác. '
      + 'Lấy token mới: chạy `node ket-noi.js --tiktok` trên máy có cấu hình, '
      + 'hoặc dán token vào ô Access Token rồi Lưu cấu hình.';
  }
  return goc + ` — nhưng token vẫn dùng được với ${tot.length}/${advs.length} tài khoản. `
    + `Hỏng ở: ${hong.join(', ')}. Token KHÔNG sai — tài khoản đó chưa được uỷ quyền `
    + 'cho app này. Vào trang uỷ quyền TikTok thêm nó vào, hoặc bỏ nó khỏi ô '
    + '"Mã tài khoản quảng cáo".';
}

async function test(conf) {
  if (!conf.accessToken) return { ok: false, message: 'Chưa có accessToken' };
  hideSecret(conf.accessToken);
  const advs = (conf.advertiserIds || []).map((x) => String(x).trim()).filter(Boolean);
  if (!advs.length) return { ok: false, message: 'Chưa khai advertiserIds' };
  try {
    const q = new URLSearchParams({
      advertiser_ids: JSON.stringify(advs),
      // TikTok chỉ nhận 'name', KHÔNG có 'advertiser_name' — sai là trả 40002
      fields: JSON.stringify(['advertiser_id', 'name', 'currency', 'timezone']),
    });
    const res = await getJson(`${BASE}/advertiser/info/?${q}`, {
      headers: { 'Access-Token': conf.accessToken },
      label: 'TikTok test', retries: 1,
    });
    if (Number(res.code) !== 0) return { ok: false, message: await giaiThich(conf, advs, res) };
    return {
      ok: true,
      results: ((res.data && res.data.list) || []).map((a) => ({
        account: a.advertiser_id, ok: true, name: a.name,
        currency: a.currency, timezone: a.timezone,
      })),
    };
  } catch (e) { return { ok: false, message: e.message }; }
}

module.exports = { PLATFORM, fetchRange, test, giaiThich };
