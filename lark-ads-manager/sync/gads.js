'use strict';
/**
 * Adapter Google Ads — API THẬT (googleads.googleapis.com), khác với gsheet.js là
 * đường vòng qua Google Ads Script + Google Sheet.
 *
 * Cần bốn thứ, khai trong ket-noi.json (hoặc ADS_CONNECT_JSON trên Render):
 *   clientId / clientSecret  — OAuth client "Desktop app" ở Google Cloud Console
 *   refreshToken             — lấy một lần bằng `node ket-noi.js --google`
 *   developerToken           — xin ở Google Ads API Center (phải được Google duyệt)
 *   customerIds[]            — ID tài khoản quảng cáo, dạng 123-456-7890 hay 1234567890
 *   loginCustomerId          — ID tài khoản quản lý (MCC), nếu tài khoản nằm dưới MCC
 *
 * Vì sao vẫn giữ gsheet.js: developer token của Google phải xin duyệt, có thể mất
 * vài ngày đến vài tuần. Chưa có thì đường Sheet vẫn chạy, bật cái nào là việc của
 * quản lý — hai đường không đụng nhau vì mỗi dòng ghi kèm nguồn.
 */
const { getJson, postJson, scrub, hideSecret } = require('./http');

const PLATFORM = 'Google Ads';
const API_VER = 'v18';
const BASE = 'https://googleads.googleapis.com/' + API_VER;

const num = (v) => {
  const n = Number(String(v == null ? 0 : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** 123-456-7890 -> 1234567890. Google chỉ nhận dạng không gạch trong URL. */
const cid = (id) => String(id || '').replace(/[^0-9]/g, '');

/** Google trả tiền theo micro (1 đồng = 1.000.000 micro). */
const tuMicro = (v) => num(v) / 1000000;

/* ---------------------------------------------------------------- OAuth */

/**
 * Đổi refresh token thành access token (hạn 1 giờ). Không cache ra file: mỗi lần
 * đồng bộ gọi một lần là đủ, mà cache token ra đĩa thì thêm một chỗ rò bí mật.
 */
async function accessToken(conf) {
  if (!conf.clientId || !conf.clientSecret) throw new Error('Chưa khai clientId/clientSecret cho Google Ads');
  if (!conf.refreshToken) throw new Error('Chưa có refreshToken — chạy `node ket-noi.js --google` để lấy');
  hideSecret(conf.clientSecret);
  hideSecret(conf.refreshToken);

  const body = new URLSearchParams({
    client_id: conf.clientId,
    client_secret: conf.clientSecret,
    refresh_token: conf.refreshToken,
    grant_type: 'refresh_token',
  }).toString();

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    const chi = d.error_description || d.error || ('HTTP ' + r.status);
    // refresh token bị thu hồi là ca hay gặp nhất: nói rõ cách sửa
    const them = /invalid_grant/i.test(String(d.error || ''))
      ? ' — refresh token đã bị thu hồi hoặc hết hiệu lực, chạy lại `node ket-noi.js --google`'
      : '';
    throw new Error(scrub('Google từ chối cấp access token: ' + chi + them));
  }
  hideSecret(d.access_token);
  return d.access_token;
}

function headers(conf, token) {
  const h = {
    Authorization: 'Bearer ' + token,
    'developer-token': conf.developerToken || '',
    'Content-Type': 'application/json',
  };
  if (conf.loginCustomerId) h['login-customer-id'] = cid(conf.loginCustomerId);
  return h;
}

/* ---------------------------------------------------------------- truy vấn */

/**
 * GAQL lấy số theo NGÀY ở cấp quảng cáo. Cùng mức chi tiết với Meta/TikTok để
 * reconcile.js đối chiếu được bằng cùng một khoá (quảng cáo × ngày).
 */
const GAQL = (from, to) => `
  SELECT
    segments.date,
    campaign.id, campaign.name,
    ad_group.id, ad_group.name,
    ad_group_ad.ad.id, ad_group_ad.ad.name,
    metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
  FROM ad_group_ad
  WHERE segments.date BETWEEN '${from}' AND '${to}'
    AND metrics.impressions > 0
`.replace(/\s+/g, ' ').trim();

/** Tên quảng cáo của Google hay để trống — lấy tên nhóm cho đỡ trống trơn. */
const tenQC = (r) => {
  const ad = (r.adGroupAd && r.adGroupAd.ad) || {};
  return String(ad.name || (r.adGroup && r.adGroup.name) || ('Ad ' + (ad.id || '')));
};

async function fetchRange(conf, from, to, log = () => {}) {
  if (!conf.developerToken) throw new Error('Chưa có developerToken của Google Ads (xin ở API Center)');
  const accounts = (conf.customerIds || []).map(cid).filter(Boolean);
  if (!accounts.length) throw new Error('Chưa khai customerIds cho Google Ads trong ket-noi.json');

  const token = await accessToken(conf);
  const out = [];
  const raw = [];

  for (const acc of accounts) {
    log(`Google Ads ${acc}: đang lấy ${from} → ${to}`);
    const res = await postJson(`${BASE}/customers/${acc}/googleAds:searchStream`,
      { query: GAQL(from, to) },
      { headers: headers(conf, token), label: `Google Ads ${acc}` });

    /* searchStream trả về MẢNG các lô, mỗi lô có `results`. Lỗi thì trả object có
     * `error` — không phải mảng, nên phải xét cả hai dạng. */
    if (res && res.error) {
      const e = res.error;
      throw new Error(scrub(`Google Ads báo lỗi (${e.code || '?'}): ${e.message || 'không rõ'}`));
    }
    const lo = Array.isArray(res) ? res : [res];
    for (const l of lo) {
      const list = (l && l.results) || [];
      raw.push(...list);
      for (const r of list) {
        const m = r.metrics || {};
        out.push({
          platform: PLATFORM,
          date: String((r.segments && r.segments.date) || '').slice(0, 10),
          campaignExtId: String((r.campaign && r.campaign.id) || ''),
          campaignName: String((r.campaign && r.campaign.name) || ''),
          groupExtId: String((r.adGroup && r.adGroup.id) || ''),
          groupName: String((r.adGroup && r.adGroup.name) || ''),
          adExtId: String((r.adGroupAd && r.adGroupAd.ad && r.adGroupAd.ad.id) || ''),
          adName: tenQC(r),
          spend: tuMicro(m.costMicros),
          impressions: num(m.impressions),
          clicks: num(m.clicks),
          conversions: num(m.conversions),
        });
      }
    }
  }

  log(`Google Ads: ${out.length} dòng`);
  return { rows: out, raw };
}

/* ---------------------------------------------------------------- kiểm tra */

async function test(conf) {
  if (!conf.clientId || !conf.clientSecret) return { ok: false, message: 'Chưa khai clientId/clientSecret' };
  if (!conf.refreshToken) return { ok: false, message: 'Chưa có refreshToken — chạy `node ket-noi.js --google`' };
  if (!conf.developerToken) return { ok: false, message: 'Chưa có developerToken (xin ở Google Ads API Center)' };
  const accounts = (conf.customerIds || []).map(cid).filter(Boolean);
  if (!accounts.length) return { ok: false, message: 'Chưa khai customerIds' };

  try {
    const token = await accessToken(conf);
    const results = [];
    for (const acc of accounts) {
      try {
        const res = await postJson(`${BASE}/customers/${acc}/googleAds:search`,
          { query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1' },
          { headers: headers(conf, token), label: `Google Ads test ${acc}`, retries: 1 });
        if (res && res.error) {
          results.push({ account: acc, ok: false, message: scrub(res.error.message || 'lỗi không rõ') });
          continue;
        }
        const c = ((res.results || [])[0] || {}).customer || {};
        results.push({
          account: acc, ok: true,
          name: c.descriptiveName || '', currency: c.currencyCode || '', timezone: c.timeZone || '',
        });
      } catch (e) {
        results.push({ account: acc, ok: false, message: scrub(e.message) });
      }
    }
    return { ok: results.every((r) => r.ok), results };
  } catch (e) {
    return { ok: false, message: scrub(e.message) };
  }
}

/** Google cấp access token hạn 1 giờ và tự làm mới, nên không có "hạn" để lo. */
async function tokenInfo() {
  return { text: 'không hết hạn (tự làm mới bằng refresh token)', muc: 'ok' };
}

module.exports = { PLATFORM, fetchRange, test, tokenInfo, accessToken, GAQL };
