'use strict';
/**
 * Adapter Facebook / Meta — Marketing API, endpoint Insights ở level=ad.
 *
 * Trả về mảng dòng đã chuẩn hoá:
 * { platform, date, campaignExtId, campaignName, groupExtId, groupName,
 *   adExtId, adName, spend, impressions, clicks, conversions }
 */
const { getJson, scrub, hideSecret } = require('./http');

const PLATFORM = 'Facebook';

/** Chuẩn hoá ID tài khoản: 123456 hoặc act_123456 → act_123456 */
const actId = (id) => {
  const s = String(id).trim();
  return s.startsWith('act_') ? s : 'act_' + s.replace(/^act_/, '');
};

const num = (v) => {
  const n = Number(String(v == null ? 0 : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Meta trả conversions trong mảng `actions`: [{action_type, value}].
 * Lấy đúng loại action mà chiến dịch tối ưu cho — nếu lấy `conversions` chung
 * thì số sẽ lệch nhiều lần với chiến dịch Tin nhắn/Lead.
 */
function conversionsOf(row, metric) {
  const list = row.actions || [];
  const want = String(metric || '').trim();
  if (!want) return 0;
  // cho phép khai nhiều loại cách nhau bằng dấu phẩy (vd purchase,lead)
  const wants = want.split(',').map((s) => s.trim()).filter(Boolean);
  return list.reduce((s, a) => (wants.includes(a.action_type) ? s + num(a.value) : s), 0);
}

/** Các action_type thực có trong dữ liệu — dùng để anh chọn đúng chỉ số. */
function actionTypesSeen(rows) {
  const m = new Map();
  rows.forEach((r) => (r.actions || []).forEach((a) => {
    m.set(a.action_type, (m.get(a.action_type) || 0) + num(a.value));
  }));
  return [...m].sort((a, b) => b[1] - a[1]).map(([action_type, total]) => ({ action_type, total }));
}

async function fetchRange(conf, from, to, log = () => {}) {
  if (!conf.accessToken) throw new Error('Chưa có Meta accessToken trong ket-noi.json');
  hideSecret(conf.accessToken);
  const accounts = (conf.accountIds || []).map(actId);
  if (!accounts.length) throw new Error('Chưa khai accountIds cho Meta trong ket-noi.json');

  const ver = conf.apiVersion || 'v21.0';
  const clickField = conf.clickMetric === 'inline_link_clicks' ? 'inline_link_clicks' : 'clicks';
  const fields = [
    'date_start', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
    'ad_id', 'ad_name', 'spend', 'impressions', clickField, 'actions',
  ].join(',');

  const out = [];
  const raw = [];
  for (const acc of accounts) {
    let url = `https://graph.facebook.com/${ver}/${acc}/insights`
      + `?level=ad&time_increment=1&limit=300`
      + `&fields=${encodeURIComponent(fields)}`
      + `&time_range=${encodeURIComponent(JSON.stringify({ since: from, until: to }))}`
      + `&access_token=${encodeURIComponent(conf.accessToken)}`;
    let page = 0;
    while (url && page < 60) {
      const res = await getJson(url, { label: `Meta ${acc} trang ${page + 1}` });
      if (res.error) {
        const e = res.error;
        throw new Error(scrub(`Meta báo lỗi (${e.code}${e.error_subcode ? '/' + e.error_subcode : ''}): ${e.message}`));
      }
      const list = res.data || [];
      raw.push(...list);
      list.forEach((r) => out.push({
        platform: PLATFORM,
        date: String(r.date_start || '').slice(0, 10),
        campaignExtId: String(r.campaign_id || ''),
        campaignName: String(r.campaign_name || ''),
        groupExtId: String(r.adset_id || ''),
        groupName: String(r.adset_name || ''),
        adExtId: String(r.ad_id || ''),
        adName: String(r.ad_name || ''),
        spend: num(r.spend),
        impressions: num(r.impressions),
        clicks: num(r[clickField]),
        conversions: conversionsOf(r, conf.conversionMetric),
      }));
      url = (res.paging && res.paging.next) || null;
      page++;
      log(`Meta ${acc}: đã lấy ${out.length} dòng`);
    }
  }
  return { rows: out, actionTypes: actionTypesSeen(raw) };
}

/**
 * Soi chính token: còn sống không, hết hạn khi nào, có những quyền gì.
 *
 * Quan trọng với token cá nhân (loại ~60 ngày): không cảnh báo trước thì tới ngày
 * hết hạn đồng bộ sẽ chết âm thầm, Base cứ thế thiếu số mà không ai biết.
 * System User token thì trả về expires_at = 0 nghĩa là không hết hạn.
 */
async function tokenInfo(conf) {
  if (!conf.accessToken) return null;
  hideSecret(conf.accessToken);
  const ver = conf.apiVersion || 'v21.0';
  try {
    const r = await getJson(`https://graph.facebook.com/${ver}/debug_token`
      + `?input_token=${encodeURIComponent(conf.accessToken)}`
      + `&access_token=${encodeURIComponent(conf.accessToken)}`,
      { label: 'Meta debug_token', retries: 1 });
    const d = (r && r.data) || null;
    if (!d) return null;
    const exp = Number(d.expires_at || 0);
    const conHan = exp > 0 ? Math.floor((exp * 1000 - Date.now()) / 86400000) : null;
    return {
      hopLe: d.is_valid !== false,
      loai: d.type || '',
      vinhVien: exp === 0,
      hetHanLuc: exp > 0 ? new Date(exp * 1000).toISOString().slice(0, 10) : null,
      conLaiNgay: conHan,
      quyen: d.scopes || [],
      coAdsRead: (d.scopes || []).includes('ads_read') || (d.scopes || []).includes('ads_management'),
    };
  } catch (_) { return null; }
}

/** Kiểm tra token + quyền, không ghi gì. */
async function test(conf) {
  if (!conf.accessToken) return { ok: false, message: 'Chưa có accessToken' };
  hideSecret(conf.accessToken);
  const ver = conf.apiVersion || 'v21.0';
  const accounts = (conf.accountIds || []).map(actId);
  if (!accounts.length) return { ok: false, message: 'Chưa khai accountIds' };
  const results = [];
  for (const acc of accounts) {
    const url = `https://graph.facebook.com/${ver}/${acc}`
      + `?fields=name,account_status,currency,timezone_name`
      + `&access_token=${encodeURIComponent(conf.accessToken)}`;
    try {
      const res = await getJson(url, { label: `Meta test ${acc}`, retries: 1 });
      if (res.error) results.push({ account: acc, ok: false, message: scrub(res.error.message) });
      else results.push({
        account: acc, ok: true,
        name: res.name, currency: res.currency, timezone: res.timezone_name,
        status: res.account_status,
      });
    } catch (e) { results.push({ account: acc, ok: false, message: scrub(e.message) }); }
  }
  const info = await tokenInfo(conf);
  return { ok: results.every((r) => r.ok), results, token: info };
}

module.exports = { PLATFORM, fetchRange, test, tokenInfo, conversionsOf, actionTypesSeen };
