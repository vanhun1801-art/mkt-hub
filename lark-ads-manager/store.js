'use strict';
/**
 * Đọc toàn bộ base về bộ nhớ, chuẩn hoá và dựng cây
 * Chiến dịch → Nhóm → Quảng cáo → Hiệu suất theo ngày.
 *
 * App KHÔNG dựa vào các cột formula/rollup của Lark để tính tổng: mọi số liệu
 * đều cộng lại từ bảng "Hiệu suất theo ngày" nên lọc được theo bất kỳ khoảng
 * ngày nào (formula trong Base chỉ tính cả kỳ hoặc "hôm nay").
 */
const cfg = require('./config');
const lark = require('./lark');

const T = cfg.tables;

/* ---------- chuẩn hoá cell ---------- */
const num = (v) => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const txt = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(txt).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.text || v.name || v.link || '');
  return String(v);
};
/** Text của Base hay chứa markdown link tự sinh + xuống dòng — làm sạch để hiển thị. */
const clean = (v) => txt(v)
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();
const sel = (v) => (Array.isArray(v) ? txt(v[0]) : txt(v));
const links = (v) => (Array.isArray(v) ? v.map((x) => (x && x.id) || '').filter(Boolean) : []);
const users = (v) => (Array.isArray(v) ? v.map((u) => ({ id: u.id, name: u.name || u.id })) : []);
/** Ô URL của Base trả về dạng markdown [url](url) */
const url = (v) => {
  const s = txt(v);
  const m = s.match(/^\[(.*?)\]\((.*?)\)$/);
  return m ? m[2] : s;
};

/* ---------- ngày ---------- */
const TZ = cfg.tzOffsetHours * 3600 * 1000;

/** ISO/epoch của Base → 'YYYY-MM-DD' theo giờ base (giống cột "Ngày (khóa)"). */
function toKey(v) {
  if (!v) return '';
  const t = typeof v === 'number' ? v : Date.parse(txt(v));
  if (!Number.isFinite(t)) return '';
  return new Date(t + TZ).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → chuỗi datetime UTC để ghi vào Base = 00:00 giờ base. */
function keyToBaseDatetime(key) {
  const [y, m, d] = key.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) - TZ;
  return new Date(t).toISOString().slice(0, 19).replace('T', ' ');
}

/** Hôm nay theo giờ base. */
function todayKey() {
  return new Date(Date.now() + TZ).toISOString().slice(0, 10);
}

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/* ---------- tải & dựng ---------- */
let cache = null;
let loading = null;

async function load() {
  const [campaignsRaw, groupsRaw, adsRaw, dailyRaw, productsRaw, salesRaw] = await Promise.all([
    lark.listAll(T.campaign.id),
    lark.listAll(T.group.id),
    lark.listAll(T.ad.id),
    lark.listAll(T.daily.id),
    lark.listAll(T.product.id),
    lark.listAll(T.sales.id),
  ]);

  const F = T.campaign.f;
  const campaigns = campaignsRaw.map((r) => ({
    id: r.id,
    name: clean(r.c[F.name]) || '(chưa đặt tên)',
    platform: sel(r.c[F.platform]) || '(chưa gán)',
    objective: sel(r.c[F.objective]),
    budget: num(r.c[F.budget]),
    dailyBudget: num(r.c[F.dailyBudget]),
    start: toKey(r.c[F.start]),
    end: toKey(r.c[F.end]),
    status: sel(r.c[F.status]) || '(chưa đặt)',
    owners: users(r.c[F.owner]),
    note: clean(r.c[F.note]),
    productIds: links(r.c[F.products]),
    groupIds: links(r.c[F.groups]),
    extId: txt(r.c[F.extId]).trim(),
  }));

  const GF = T.group.f;
  const groups = groupsRaw.map((r) => ({
    id: r.id,
    name: clean(r.c[GF.name]) || '(chưa đặt tên)',
    campaignId: links(r.c[GF.campaign])[0] || null,
    adIds: links(r.c[GF.ads]),
    budget: num(r.c[GF.budget]),
    status: sel(r.c[GF.status]) || '(chưa đặt)',
    optimize: sel(r.c[GF.optimize]),
    placement: sel(r.c[GF.placement]),
    audience: clean(r.c[GF.audience]),
    extId: txt(r.c[GF.extId]).trim(),
  }));

  const AF = T.ad.f;
  const ads = adsRaw.map((r) => ({
    id: r.id,
    name: clean(r.c[AF.name]) || '(chưa đặt tên)',
    groupId: links(r.c[AF.group])[0] || null,
    creative: sel(r.c[AF.creative]),
    approval: sel(r.c[AF.approval]) || '(chưa đặt)',
    url: url(r.c[AF.url]),
    caption: clean(r.c[AF.caption]),
    hasFile: Array.isArray(r.c[AF.file]) && r.c[AF.file].length > 0,
    extId: txt(r.c[AF.extId]).trim(),
  }));

  const PF = T.product.f;
  const products = productsRaw.map((r) => ({
    id: r.id,
    name: clean(r.c[PF.name]),
    code: txt(r.c[PF.code]),
    type: sel(r.c[PF.type]),
    price: num(r.c[PF.price]),
    destination: txt(r.c[PF.destination]),
  }));

  const DF = T.daily.f;
  const daily = dailyRaw.map((r) => ({
    id: r.id,
    date: txt(r.c[DF.dateKey]) || toKey(r.c[DF.date]),
    adId: links(r.c[DF.ad])[0] || null,
    spend: num(r.c[DF.spend]),
    impressions: num(r.c[DF.impressions]),
    clicks: num(r.c[DF.clicks]),
    conversions: num(r.c[DF.conversions]),
    label: clean(r.c[DF.label]),
    source: sel(r.c[DF.source]) || 'Nhập tay',
  }));

  const SF = T.sales.f;
  const sales = salesRaw.map((r) => ({
    id: r.id,
    date: txt(r.c[SF.dateKey]) || toKey(r.c[SF.time]),
    channel: sel(r.c[SF.channel]) || '(chưa gán)',
    status: sel(r.c[SF.status]) || '(chưa đặt)',
    revenue: num(r.c[SF.revenue]),
    service: sel(r.c[SF.service]),
    staff: users(r.c[SF.staff]),
    customer: txt(r.c[SF.customer]),
    province: txt(r.c[SF.province]),
  }));

  /* ---- index & liên kết hai chiều ---- */
  const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const cMap = byId(campaigns), gMap = byId(groups), aMap = byId(ads), pMap = byId(products);

  // Nhóm nào chưa trỏ ngược lên chiến dịch thì suy từ cột "DS nhóm" của chiến dịch
  campaigns.forEach((c) => c.groupIds.forEach((gid) => {
    const g = gMap[gid];
    if (g && !g.campaignId) g.campaignId = c.id;
  }));
  groups.forEach((g) => g.adIds.forEach((aid) => {
    const a = aMap[aid];
    if (a && !a.groupId) a.groupId = g.id;
  }));

  ads.forEach((a) => {
    const g = a.groupId ? gMap[a.groupId] : null;
    const c = g && g.campaignId ? cMap[g.campaignId] : null;
    a.groupName = g ? g.name : '(không thuộc nhóm)';
    a.campaignId = c ? c.id : null;
    a.campaignName = c ? c.name : '(không thuộc chiến dịch)';
    a.platform = c ? c.platform : '(chưa gán)';
    a.campaignStatus = c ? c.status : '';
    a.groupStatus = g ? g.status : '';
  });

  daily.forEach((d) => {
    const a = d.adId ? aMap[d.adId] : null;
    d.adName = a ? a.name : '(chưa gắn quảng cáo)';
    d.groupId = a ? a.groupId : null;
    d.groupName = a ? a.groupName : '';
    d.campaignId = a ? a.campaignId : null;
    d.campaignName = a ? a.campaignName : '';
    d.platform = a ? a.platform : '(chưa gán)';
    d.orphan = !a;
  });

  campaigns.forEach((c) => {
    c.productNames = c.productIds.map((id) => (pMap[id] ? pMap[id].name : '')).filter(Boolean);
  });

  const dates = [...new Set(daily.map((d) => d.date).filter(Boolean))].sort();

  return {
    loadedAt: Date.now(),
    campaigns, groups, ads, daily, products, sales,
    cMap, gMap, aMap, pMap,
    dates,
    minDate: dates[0] || todayKey(),
    maxDate: dates[dates.length - 1] || todayKey(),
  };
}

async function get({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.loadedAt < cfg.cacheTtlMs) return cache;
  if (loading) return loading;
  loading = load().then((d) => { cache = d; loading = null; return d; })
    .catch((e) => { loading = null; throw e; });
  return loading;
}

function invalidate() { cache = null; }

module.exports = {
  get, invalidate,
  toKey, keyToBaseDatetime, todayKey, addDays, daysBetween,
  num, txt, clean, sel, links, url,
};
