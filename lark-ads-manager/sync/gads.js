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
/* Google khai tử phiên bản API sau khoảng một năm. Đo ngày 29/08/2026: v15–v21 đều
 * trả 404 kèm trang HTML, v22 còn sống. Khai được trong ket-noi.json để sau này đổi
 * không phải sửa code — dấu hiệu nhận biết là lỗi 404 kèm HTML thay vì JSON. */
const API_VER_MAC = 'v22';
const base = (conf) => 'https://googleads.googleapis.com/' + ((conf && conf.apiVersion) || API_VER_MAC);

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
  /* KHÔNG bảo chạy dòng lệnh: bản đang dùng chạy trên Render, ở đó không có dòng
   * lệnh nào để gõ. Chỉ vào đúng nút trong giao diện. */
  if (!conf.refreshToken) {
    throw new Error('Chưa có refresh token — vào tab Kết nối & Đồng bộ, thẻ Google Ads, '
      + 'bấm "Lấy link uỷ quyền" rồi "Đổi lấy token"');
  }
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
      ? ' — refresh token đã bị thu hồi hoặc hết hiệu lực'
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

/**
 * GAQL lấy chuyển đổi CHIA THEO TỪNG HÀNH ĐỘNG.
 *
 * `all_conversions` chứ không `conversions`: cột `conversions` chỉ đếm hành động
 * được đánh dấu "primary" (tính vào tối ưu hoá), nên click_call / click_zalo /
 * click_whatsapp biến mất hết — mà đó đúng là những hành động cần thấy.
 *
 * FROM customer: hỏi ở cấp tài khoản vì đây là bảng tổng, không cần biết hành
 * động thuộc quảng cáo nào. Hỏi ở cấp quảng cáo thì số dòng nhân lên hàng chục
 * lần mà bảng vẫn phải cộng lại.
 */
const GAQL_HANH_DONG = (from, to) => `
  SELECT
    segments.conversion_action_name,
    segments.conversion_action_category,
    metrics.all_conversions
  FROM customer
  WHERE segments.date BETWEEN '${from}' AND '${to}'
`.replace(/\s+/g, ' ').trim();

/**
 * Chi tiết hành động chuyển đổi trong khoảng ngày.
 * @returns {Promise<{rows: Array<{ten,nhom,so}>, tong:number}>} sắp giảm dần theo số
 */
async function hanhDongChuyenDoi(conf, from, to, log = () => {}) {
  if (!conf || !conf.refreshToken) return { rows: [], tong: 0, loi: 'Google Ads chưa nối' };
  const accounts = (conf.customerIds || []).map(cid).filter(Boolean);
  if (!accounts.length) return { rows: [], tong: 0, loi: 'Chưa khai customerIds' };

  const token = await accessToken(conf);
  /* Gộp theo (tên × nhóm) vì nhiều tài khoản có thể trùng tên hành động, và
   * Google cũng trả nhiều dòng cho cùng một hành động khi chia theo ngày. */
  const gom = new Map();
  for (const acc of accounts) {
    const res = await postJson(`${base(conf)}/customers/${acc}/googleAds:searchStream`,
      { query: GAQL_HANH_DONG(from, to) },
      { headers: headers(conf, token), label: `Google Ads hành động ${acc}` });
    if (res && res.error) {
      throw new Error(scrub(`Google Ads báo lỗi (${res.error.code || '?'}): `
        + (res.error.message || 'không rõ')));
    }
    const lo = Array.isArray(res) ? res : [res];
    for (const l of lo) {
      for (const r of ((l && l.results) || [])) {
        const sg = r.segments || {};
        const ten = String(sg.conversionActionName || '').trim();
        if (!ten) continue;
        const nhom = String(sg.conversionActionCategory || '').trim();
        const so = Number((r.metrics || {}).allConversions || 0);
        const k = ten + '\u0000' + nhom;
        const o = gom.get(k) || { ten, nhom, so: 0 };
        o.so += so;
        gom.set(k, o);
      }
    }
  }
  /* Làm tròn ở đây: Google trả số thập phân (một chuyển đổi có thể được ghi công
   * một phần), nhưng "9,000000001 lượt bấm gọi" thì không ai đọc. */
  const rows = [...gom.values()]
    .map((x) => ({ ...x, so: Math.round(x.so * 100) / 100 }))
    .filter((x) => x.so > 0)
    .sort((a, b) => b.so - a.so);
  log(`  Google Ads: ${rows.length} hành động có dữ liệu`);
  return { rows, tong: rows.reduce((a, x) => a + x.so, 0) };
}

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
    const res = await postJson(`${base(conf)}/customers/${acc}/googleAds:searchStream`,
      { query: GAQL(from, to) },
      { headers: headers(conf, token), label: `Google Ads ${acc}` });

    /* searchStream trả về MẢNG các lô, mỗi lô có `results`. Lỗi thì trả object có
     * `error` — không phải mảng, nên phải xét cả hai dạng. */
    if (res && res.error) {
      const e = res.error;
      if (Number(e.code) === 404 || /not found/i.test(String(e.message || ''))) {
        throw new Error('Phiên bản API ' + ((conf && conf.apiVersion) || API_VER_MAC) +
          ' không còn — khai apiVersion mới trong ket-noi.json (Google khai tử sau ~1 năm).');
      }
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
  if (!conf.refreshToken) {
    return { ok: false, message: 'Chưa có refresh token — bấm "Lấy link uỷ quyền" ở thẻ này' };
  }
  if (!conf.developerToken) return { ok: false, message: 'Chưa có developerToken (xin ở Google Ads API Center)' };
  const accounts = (conf.customerIds || []).map(cid).filter(Boolean);
  if (!accounts.length) return { ok: false, message: 'Chưa khai customerIds' };

  try {
    const token = await accessToken(conf);
    const results = [];
    for (const acc of accounts) {
      try {
        const res = await postJson(`${base(conf)}/customers/${acc}/googleAds:search`,
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

/* ---------------------------------------------------------------- dò tài khoản */

/**
 * Liệt kê các tài khoản mà refresh token này với tới được — để giao diện điền hộ
 * customerIds thay vì bắt đi tra ID ở Google Ads.
 *
 * listAccessibleCustomers chỉ trả ID, không trả tên (Google cố ý). Có MCC thì hỏi
 * thêm một lượt lấy tên; không có thì trả ID trơn, vẫn đủ để dán vào ô.
 */
async function danhSachTaiKhoan(conf) {
  const token = await accessToken(conf);
  const r = await getJson(`${base(conf)}/customers:listAccessibleCustomers`, {
    headers: { Authorization: 'Bearer ' + token, 'developer-token': conf.developerToken || '' },
    label: 'Google Ads listAccessibleCustomers', retries: 1,
  });
  if (r && r.error) throw new Error(scrub(r.error.message || 'Google Ads từ chối'));
  const ids = (r.resourceNames || []).map((s) => String(s).split('/').pop()).filter(Boolean);

  const ten = {};
  if (conf.loginCustomerId) {
    try {
      const q = await postJson(`${base(conf)}/customers/${cid(conf.loginCustomerId)}/googleAds:search`,
        { query: 'SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code FROM customer_client WHERE customer_client.status = "ENABLED"' },
        { headers: headers(conf, token), label: 'Google Ads customer_client', retries: 1 });
      ((q && q.results) || []).forEach((x) => {
        const c = x.customerClient || {};
        if (c.id) ten[String(c.id)] = { name: c.descriptiveName || '', currency: c.currencyCode || '' };
      });
    } catch (_) { /* không có quyền đọc cây MCC thì thôi, ID vẫn dùng được */ }
  }

  return ids.map((id) => ({
    id: dep(id),
    raw: id,
    name: (ten[id] || {}).name || '',
    currency: (ten[id] || {}).currency || '',
  }));
}

/** 1234567890 -> 123-456-7890, đúng cách Google Ads hiện trên màn hình. */
const dep = (id) => {
  const s = String(id).replace(/[^0-9]/g, '');
  return s.length === 10 ? `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}` : s;
};

module.exports = {
  hanhDongChuyenDoi,
  PLATFORM, fetchRange, test, tokenInfo, accessToken, danhSachTaiKhoan, GAQL, API_VER_MAC,
};
