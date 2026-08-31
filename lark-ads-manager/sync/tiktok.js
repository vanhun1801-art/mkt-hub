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
    if (Number(res.code) !== 0) return { ok: false, message: `(${res.code}) ${res.message}` };
    return {
      ok: true,
      results: ((res.data && res.data.list) || []).map((a) => ({
        account: a.advertiser_id, ok: true, name: a.name,
        currency: a.currency, timezone: a.timezone,
      })),
    };
  } catch (e) { return { ok: false, message: e.message }; }
}

module.exports = { PLATFORM, fetchRange, test };
