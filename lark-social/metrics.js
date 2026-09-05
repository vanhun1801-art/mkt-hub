'use strict';
/**
 * Gộp số cho giao diện. MỘT hàm agg() là định nghĩa duy nhất của mọi tỷ lệ —
 * bài học từ app quảng cáo: để mỗi màn hình tự tính "tỷ lệ tương tác" theo cách
 * riêng là chỉ vài tuần sau hai màn hình cùng một kỳ ra hai con số khác nhau, và
 * không ai biết cái nào đúng.
 */
const store = require('./store');

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const chia = (a, b) => (num(b) ? num(a) / num(b) : 0);

const CONG = ['views', 'reach', 'impressions', 'profileViews', 'likes', 'comments',
  'shares', 'saves', 'engagement', 'clicks', 'messages', 'leads', 'posts', 'lives',
  'followUp', 'followDown'];

/**
 * Gộp một tập dòng ngày thành một bộ chỉ số.
 *
 * `followers` KHÔNG cộng: nó là số chốt tại một thời điểm, không phải lưu lượng.
 * Cộng follower của 30 ngày lại là ra một con số vô nghĩa nhưng trông rất to —
 * lỗi kinh điển của mọi bảng social. Ở đây lấy giá trị của NGÀY MỚI NHẤT có số,
 * theo từng kênh, rồi mới cộng ngang các kênh.
 */
function agg(rows) {
  const t = {};
  CONG.forEach((k) => { t[k] = 0; });
  const cuoiTheoKenh = new Map();

  rows.forEach((r) => {
    CONG.forEach((k) => { t[k] += num(r[k]); });
    const kenh = r.channelExtId || r.channel || r.platform;
    const cu = cuoiTheoKenh.get(kenh);
    if (num(r.followers) && (!cu || r.date > cu.date)) {
      cuoiTheoKenh.set(kenh, { date: r.date, followers: num(r.followers) });
    }
  });

  t.followers = [...cuoiTheoKenh.values()].reduce((s, x) => s + x.followers, 0);
  t.followNet = t.followUp - t.followDown;

  // Các tỷ lệ — định nghĩa duy nhất của cả app
  t.tyLeTuongTac = chia(t.engagement, t.reach || t.views);
  t.xemMoiBai = chia(t.views, t.posts);
  t.tuongTacMoiBai = chia(t.engagement, t.posts);
  t.tanSuat = chia(t.impressions, t.reach);
  t.leadTrenNghinXem = chia(t.leads * 1000, t.views);

  return t;
}

/** Lọc theo khoảng ngày + nền tảng + kênh. */
function loc(rows, { from, to, platforms, channels } = {}) {
  const pset = platforms && platforms.length ? new Set(platforms) : null;
  const cset = channels && channels.length ? new Set(channels) : null;
  return rows.filter((r) => {
    if (from && r.date && r.date < from) return false;
    if (to && r.date && r.date > to) return false;
    if (pset && !pset.has(r.platform)) return false;
    if (cset && !cset.has(r.channelExtId) && !cset.has(r.channel)) return false;
    return true;
  });
}

/** Chuỗi theo ngày, đủ mọi ngày trong khoảng (ngày không có số thì bằng 0). */
function theoNgay(rows, from, to) {
  const m = new Map();
  rows.forEach((r) => {
    if (!r.date) return;
    if (!m.has(r.date)) m.set(r.date, []);
    m.get(r.date).push(r);
  });
  const out = [];
  let d = from;
  for (let i = 0; d && to && d <= to && i < 800; i++) {
    out.push({ date: d, ...agg(m.get(d) || []) });
    d = store.themNgay(d, 1);
  }
  return out;
}

/** Bảng theo kênh. */
function theoKenh(rows, channels) {
  const m = new Map();
  rows.forEach((r) => {
    const k = r.channelExtId || r.channel || '(chưa gắn kênh)';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  });
  const byExt = new Map((channels || []).map((c) => [c.extId, c]));
  return [...m.entries()].map(([k, ds]) => {
    const c = byExt.get(k);
    return {
      extId: k,
      name: (c && c.name) || (ds[0] && ds[0].channel) || k,
      platform: (c && c.platform) || (ds[0] && ds[0].platform) || '',
      url: (c && c.url) || '',
      owner: (c && c.owner) || [],
      ...agg(ds),
    };
  }).sort((a, b) => b.views - a.views);
}

/** Bảng theo nền tảng. */
function theoNenTang(rows) {
  const m = new Map();
  rows.forEach((r) => {
    const k = r.platform || '(không rõ)';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  });
  return [...m.entries()]
    .map(([platform, ds]) => ({ platform, ...agg(ds) }))
    .sort((a, b) => b.views - a.views);
}

/** Bài tốt nhất theo một chỉ số. */
function topBai(posts, { from, to, platforms, channels, theo = 'views', n = 20 } = {}) {
  const pset = platforms && platforms.length ? new Set(platforms) : null;
  const cset = channels && channels.length ? new Set(channels) : null;
  return posts
    .filter((p) => {
      if (from && p.date && p.date < from) return false;
      if (to && p.date && p.date > to) return false;
      if (pset && !pset.has(p.platform)) return false;
      if (cset && !cset.has(p.channelExtId) && !cset.has(p.channel)) return false;
      return true;
    })
    .sort((a, b) => num(b[theo]) - num(a[theo]))
    .slice(0, n);
}

/**
 * So hai kỳ liền nhau, để mỗi con số có một mũi tên bên cạnh thay vì đứng trơ.
 * Kỳ trước dài đúng bằng kỳ này và kết thúc ngay trước ngày `from`.
 */
function soKyTruoc(rows, from, to, filter) {
  const dai = Math.max(1, Math.round(
    (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000) + 1);
  const truocTo = store.themNgay(from, -1);
  const truocFrom = store.themNgay(truocTo, -(dai - 1));
  const nay = agg(loc(rows, { ...filter, from, to }));
  const truoc = agg(loc(rows, { ...filter, from: truocFrom, to: truocTo }));
  const doi = {};
  Object.keys(nay).forEach((k) => {
    if (typeof nay[k] !== 'number') return;
    doi[k] = truoc[k] ? (nay[k] - truoc[k]) / Math.abs(truoc[k]) : (nay[k] ? 1 : 0);
  });
  return { nay, truoc, doi, kyTruoc: { from: truocFrom, to: truocTo } };
}

/**
 * Toàn bộ số cho một lần mở màn hình. Gộp ở một chỗ để trình duyệt chỉ gọi
 * một lần thay vì năm lần rồi tự ghép — và để mọi tab nhìn cùng một bộ số.
 */
async function tongQuan({ from, to, platforms, channels } = {}) {
  const d = await store.tai();
  const den = to || store.homNay();
  const tu = from || store.themNgay(den, -29);
  const f = { platforms, channels };

  const rows = loc(d.daily, { ...f, from: tu, to: den });
  const so = soKyTruoc(d.daily, tu, den, f);

  return {
    tu, den,
    tong: so.nay,
    kyTruoc: so.truoc,
    doi: so.doi,
    khoangTruoc: so.kyTruoc,
    ngay: theoNgay(rows, tu, den),
    kenh: theoKenh(rows, d.channels),
    nenTang: theoNenTang(rows),
    topBai: topBai(d.posts, { ...f, from: tu, to: den, theo: 'views', n: 20 }),
    live: d.lives.filter((l) => (!l.date || (l.date >= tu && l.date <= den))
      && (!platforms || !platforms.length || platforms.includes(l.platform)))
      .sort((a, b) => String(b.start).localeCompare(String(a.start)))
      .slice(0, 50),
    soKenh: d.channels.length,
    soBai: d.posts.length,
    capNhat: d.luc,
  };
}

module.exports = { agg, loc, theoNgay, theoKenh, theoNenTang, topBai, soKyTruoc, tongQuan, chia };
