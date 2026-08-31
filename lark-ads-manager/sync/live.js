'use strict';
/**
 * Nguồn số TRỰC TIẾP từ nền tảng quảng cáo.
 *
 * Ý tưởng: app không phải chờ tới lượt đồng bộ mới có số. Khi bật chế độ trực tiếp,
 * mấy ngày gần đây được gọi thẳng từ Meta/TikTok/Google, còn lịch sử xa hơn vẫn lấy
 * từ Lark Base. Ghép lại thành đúng một bộ dữ liệu như store.get() trả về, nên toàn
 * bộ metrics/biểu đồ/cảnh báo dùng lại y nguyên, không phải viết lại gì.
 *
 * Quy tắc ghép, để không bao giờ đếm hai lần:
 *   - Trong cửa sổ trực tiếp: CHỈ dùng số nền tảng, và chỉ cho những nền tảng thực
 *     sự lấy được. Nền tảng chưa nối (vd TikTok) vẫn giữ số trong Base.
 *   - Ngoài cửa sổ: hoàn toàn theo Base.
 * Ngân sách, trạng thái, mục tiêu... luôn lấy từ Base — nền tảng không có mấy thứ đó
 * theo cách mình đang dùng.
 */
const store = require('./store-bridge');
const ketnoi = require('./ketnoi');

const meta = require('./meta');
const tiktok = require('./tiktok');
const gsheet = require('./gsheet');
const gads = require('./gads');

const NGUON = {
  meta: { mod: meta, platform: 'Facebook' },
  tiktok: { mod: tiktok, platform: 'TikTok' },
  googleAds: { mod: gads, platform: 'Google Ads' },
  googleSheet: { mod: gsheet, platform: 'Google Ads' },
};

/* ---------------- cache ngắn ---------------- */
let cache = null;          // { key, at, data }
const TTL = Number(process.env.LARK_LIVE_TTL || 180000);   // 3 phút

const now = () => Date.now();

/**
 * Hai nguồn cùng đại diện cho MỘT nền tảng thì chỉ được lấy một.
 *
 * `googleAds` (API) và `googleSheet` (script → Sheet) đều gắn nhãn "Google Ads".
 * Bật cả hai là mỗi ngày Google bị cộng hai lần — sai gấp đôi mà nhìn số vẫn hợp lý,
 * loại lỗi khó phát hiện nhất. Ưu tiên API vì nó tươi hơn và không phụ thuộc script.
 */
function boNguonTrung(keys) {
  if (keys.includes('googleAds') && keys.includes('googleSheet')) {
    return keys.filter((k) => k !== 'googleSheet');
  }
  return keys;
}

/** Nguồn bị bỏ vì trùng nền tảng với nguồn khác — để báo cho người dùng biết. */
function nguonBiBo() {
  const c = ketnoi.read();
  const bat = (k) => c[k] && c[k].enabled;
  if (bat('googleAds') && bat('googleSheet')) {
    return [{ kenh: 'googleSheet', platform: 'Google Ads', ly_do: 'đã có Google Ads API, bỏ nguồn Sheet để không cộng đôi' }];
  }
  return [];
}

/** Các nền tảng đang bật và đã cấu hình xong. */
function kenhDangBat() {
  const c = ketnoi.read();
  return boNguonTrung(Object.keys(NGUON).filter((k) => {
    const cf = c[k];
    if (!cf || !cf.enabled) return false;
    if (k === 'googleSheet') return !!cf.csvUrl;
    // Google Ads API không dùng accessToken sẵn mà tự đổi từ refresh token mỗi lần
    if (k === 'googleAds') {
      return !!(cf.clientId && cf.clientSecret && cf.refreshToken && cf.developerToken &&
        (cf.customerIds || []).length > 0);
    }
    return !!cf.accessToken && (cf.accountIds || cf.advertiserIds || []).length > 0;
  }));
}

const chuan = (s) => String(s == null ? '' : s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

/**
 * Lấy số thô từ các kênh đang bật.
 * Kênh nào lỗi thì ghi nhận lỗi rồi đi tiếp — hỏng một kênh không được làm sập app.
 */
async function layRows(from, to) {
  const c = ketnoi.read();
  const keys = kenhDangBat();
  const rows = [];
  const nenTang = [];
  const loi = [];
  for (const k of keys) {
    const { mod, platform } = NGUON[k];
    try {
      const r = await mod.fetchRange(c[k], from, to);
      rows.push(...r.rows);
      nenTang.push(platform);
    } catch (e) {
      loi.push({ kenh: k, platform, loi: e.message });
    }
  }
  return { rows, nenTang, loi };
}

/**
 * Dựng bộ dữ liệu hoàn chỉnh: Base cho lịch sử + nền tảng cho mấy ngày gần đây.
 * @param {object} opts { soNgay, force }
 */
async function duLieu(opts = {}) {
  const soNgay = Math.max(1, Math.min(90, Number(opts.soNgay || 14)));
  const key = 'live:' + soNgay;
  if (!opts.force && cache && cache.key === key && now() - cache.at < TTL) return cache.data;

  const base = await store.get();
  const keys = kenhDangBat();
  if (!keys.length) {
    // chưa nối kênh nào — trả nguyên Base, đánh dấu là không trực tiếp
    const d = { ...base, truacTiep: false, live: { bat: false, nenTang: [], loi: [], layLuc: null, from: null, to: null } };
    cache = { key, at: now(), data: d };
    return d;
  }

  const to = store.todayKey();
  const from = store.addDays(to, -(soNgay - 1));
  const { rows, nenTang, loi } = await layRows(from, to);

  /* --- chỉ mục bản ghi Base để gắn ngân sách/trạng thái --- */
  const byExt = (arr) => {
    const m = new Map();
    arr.forEach((x) => { if (x.extId) m.set(x.extId, x); });
    return m;
  };
  const byTen = (arr, keyFn) => {
    const m = new Map();
    arr.forEach((x) => {
      const k = keyFn(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    });
    return m;
  };
  const cExt = byExt(base.campaigns), gExt = byExt(base.groups), aExt = byExt(base.ads);
  const cTen = byTen(base.campaigns, (c) => c.platform + '||' + chuan(c.name));
  const aTen = byTen(base.ads, (a) => (a.campaignId || '') + '||' + chuan(a.name));
  const duyNhat = (arr) => (arr && arr.length === 1 ? arr[0] : null);

  /* --- dựng thực thể từ dữ liệu nền tảng --- */
  const campaigns = new Map();   // id → bản ghi hiển thị
  const groups = new Map();
  const ads = new Map();

  const idCua = (rec, extId, tienTo) => (rec ? rec.id : tienTo + ':' + extId);

  rows.forEach((r) => {
    // chiến dịch
    let cRec = cExt.get(r.campaignExtId) || duyNhat(cTen.get(r.platform + '||' + chuan(r.campaignName)));
    const cId = idCua(cRec, r.campaignExtId, 'live-cd');
    if (!campaigns.has(cId)) {
      campaigns.set(cId, cRec ? { ...cRec, tuNenTang: false } : {
        id: cId, name: r.campaignName || '(không tên)', platform: r.platform,
        objective: '', budget: 0, dailyBudget: 0, start: '', end: '',
        status: 'Đang chạy', owners: [], note: '', productIds: [], groupIds: [],
        productNames: [], extId: r.campaignExtId, tuNenTang: true,
      });
    }
    // nhóm
    let gRec = gExt.get(r.groupExtId);
    const gId = idCua(gRec, r.groupExtId, 'live-nh');
    if (!groups.has(gId)) {
      groups.set(gId, gRec ? { ...gRec, campaignId: cId, tuNenTang: false } : {
        id: gId, name: r.groupName || '(không tên)', campaignId: cId, adIds: [],
        budget: 0, status: 'Đang chạy', optimize: '', placement: '', audience: '',
        extId: r.groupExtId, tuNenTang: true,
      });
    }
    // quảng cáo
    let aRec = aExt.get(r.adExtId) || (cRec ? duyNhat(aTen.get(cRec.id + '||' + chuan(r.adName))) : null);
    const aId = idCua(aRec, r.adExtId, 'live-qc');
    if (!ads.has(aId)) {
      const c = campaigns.get(cId), g = groups.get(gId);
      ads.set(aId, {
        ...(aRec || {
          creative: '', approval: 'Đã duyệt', url: '', caption: '', hasFile: false,
        }),
        id: aId,
        name: (aRec && aRec.name) || r.adName || '(không tên)',
        extId: r.adExtId,
        groupId: gId, groupName: g.name,
        campaignId: cId, campaignName: c.name,
        platform: r.platform,
        campaignStatus: c.status, groupStatus: g.status,
        tuNenTang: !aRec,
      });
    }
    r._adId = aId; r._gId = gId; r._cId = cId;
  });

  /* --- dòng ngày: gộp theo (quảng cáo × ngày) --- */
  const goi = new Map();
  rows.forEach((r) => {
    const k = r._adId + '|' + r.date;
    const a = ads.get(r._adId);
    const cur = goi.get(k) || {
      id: 'live:' + k, date: r.date, adId: r._adId, adName: a.name,
      groupId: r._gId, groupName: a.groupName,
      campaignId: r._cId, campaignName: a.campaignName,
      platform: r.platform, label: '', source: 'Trực tiếp', orphan: false,
      spend: 0, impressions: 0, clicks: 0, conversions: 0,
    };
    cur.spend += r.spend; cur.impressions += r.impressions;
    cur.clicks += r.clicks; cur.conversions += r.conversions;
    goi.set(k, cur);
  });
  const liveDaily = [...goi.values()];

  /* --- ghép với lịch sử trong Base --- */
  const coLive = new Set(nenTang);
  const daily = base.daily
    // trong cửa sổ, nền tảng nào lấy được số trực tiếp thì bỏ số cũ của Base đi
    .filter((d) => !(d.date >= from && d.date <= to && coLive.has(d.platform)))
    .concat(liveDaily);

  /* --- danh mục: Base + những thứ chỉ có trên nền tảng --- */
  const themVao = (goc, moi, key) => {
    const m = new Map(goc.map((x) => [x[key], x]));
    moi.forEach((x) => { if (!m.has(x[key])) m.set(x[key], x); });
    return [...m.values()];
  };
  const campaignsRa = themVao(base.campaigns, [...campaigns.values()], 'id');
  const groupsRa = themVao(base.groups, [...groups.values()], 'id');
  const adsRa = themVao(base.ads, [...ads.values()], 'id');

  const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const dates = [...new Set(daily.map((d) => d.date).filter(Boolean))].sort();

  const data = {
    loadedAt: now(),
    campaigns: campaignsRa, groups: groupsRa, ads: adsRa,
    daily,
    products: base.products, sales: base.sales,
    cMap: byId(campaignsRa), gMap: byId(groupsRa), aMap: byId(adsRa), pMap: base.pMap,
    dates,
    minDate: dates[0] || store.todayKey(),
    maxDate: dates[dates.length - 1] || store.todayKey(),
    live: {
      bat: true, nenTang, loi, from, to, soNgay, biBo: nguonBiBo(),
      layLuc: new Date().toISOString(),
      soDong: liveDaily.length,
      chuaCoTrongBase: {
        chienDich: [...campaigns.values()].filter((x) => x.tuNenTang).map((x) => x.name),
        nhom: [...groups.values()].filter((x) => x.tuNenTang).map((x) => x.name),
        quangCao: [...ads.values()].filter((x) => x.tuNenTang).map((x) => x.name),
      },
    },
  };
  cache = { key, at: now(), data };
  return data;
}

function xoaCache() { cache = null; }

module.exports = { duLieu, xoaCache, kenhDangBat, nguonBiBo, layRows, TTL };
