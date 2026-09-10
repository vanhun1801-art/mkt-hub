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

const CONG = ['views', 'viewsOrganic', 'watchTime', 'reach', 'impressions', 'profileViews', 'likes', 'comments',
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

  /* Mẫu số của tỷ lệ tương tác phải chọn THEO TỪNG DÒNG rồi mới cộng.
   *
   * Bản trước cộng hết rồi mới chọn: `engagement / (reach || views)`. Gộp ba nền
   * tảng lại thì `reach` chỉ có Instagram (Meta đã gỡ reach của Facebook, TikTok
   * display không có) — thành ra lấy 919.384 tương tác của cả ba chia cho 60.402
   * lượt tiếp cận của riêng Instagram, ra 1.522%. Chọn mẫu số theo từng dòng thì
   * con số thật là 4,93%. */
  let mauSo = 0;

  rows.forEach((r) => {
    CONG.forEach((k) => { t[k] += num(r[k]); });
    mauSo += num(r.reach) || num(r.views);
    const kenh = r.channelExtId || r.channel || r.platform;
    const cu = cuoiTheoKenh.get(kenh);
    if (num(r.followers) && (!cu || r.date > cu.date)) {
      cuoiTheoKenh.set(kenh, { date: r.date, followers: num(r.followers) });
    }
  });

  t.followers = [...cuoiTheoKenh.values()].reduce((s, x) => s + x.followers, 0);
  t.followNet = t.followUp - t.followDown;
  t.mauSo = mauSo;

  // Các tỷ lệ — định nghĩa duy nhất của cả app
  t.tyLeTuongTac = chia(t.engagement, mauSo);
  t.xemMoiBai = chia(t.views, t.posts);
  t.tuongTacMoiBai = chia(t.engagement, t.posts);
  t.tanSuat = chia(t.impressions, t.reach);
  t.leadTrenNghinXem = chia(t.leads * 1000, t.views);

  return t;
}

/**
 * Follower chốt gần nhất TẠI HOẶC TRƯỚC `den`, tính theo từng kênh rồi cộng ngang.
 *
 * Vì sao không lấy trong khoảng lọc: Facebook trả follower luỹ kế mỗi ngày, còn
 * TikTok và Zalo chỉ chốt được follower vào ngày chạy đồng bộ. Lọc tháng 5 thì
 * TikTok/Instagram không có dòng nào mang follower, và ô "Follower hiện có" tụt
 * xuống chỉ còn Facebook — nhìn như mất kênh. Lấy mốc gần nhất trước đó mới đúng
 * nghĩa "đang có bao nhiêu follower tính tới cuối kỳ".
 */
function followerChot(tatCa, den, filter) {
  const cuoi = new Map();
  loc(tatCa, { ...filter, from: '', to: den }).forEach((r) => {
    if (!num(r.followers)) return;
    const k = r.channelExtId || r.channel || r.platform;
    const c = cuoi.get(k);
    if (!c || r.date > c.date) {
      cuoi.set(k, { kenh: k, platform: r.platform, date: r.date, followers: num(r.followers) });
    }
  });
  return [...cuoi.values()];
}

/**
 * Những câu cần đọc TRƯỚC khi tin vào biểu đồ, sinh theo nền tảng đang có mặt.
 *
 * Trước đây các câu này chỉ nằm trong nhật ký đồng bộ. Người mở tab Tổng quan
 * nhìn đường lượt xem TikTok không bao giờ đọc tới đó, và sẽ hiểu mỗi đỉnh là
 * "hôm ấy nhiều người xem" — trong khi thật ra là "hôm ấy đăng một bài về sau
 * rất nhiều lượt xem". Hai câu chuyện khác hẳn nhau.
 */
function luuYNenTang(rows) {
  const co = new Set(rows.map((r) => r.platform));
  const ra = [];
  if (co.has('TikTok')) {
    ra.push('TikTok: API chỉ trả tổng lượt xem trọn đời của mỗi video, không có số theo ngày. '
      + 'Cột của một ngày là tổng đời của các video ĐĂNG ngày đó, không phải lượt xem phát sinh trong ngày.');
  }
  if (co.has('Facebook')) {
    ra.push('Facebook: "Tiếp cận" đếm người, "Hiển thị" đếm lần — một người xem ba lần '
      + 'thì tiếp cận +1 còn hiển thị +3. Dòng nào ghi trước ngày nối lại chỉ số này '
      + 'thì cột tiếp cận trống; chạy "Nạp lại từ đầu" để dựng lại.');
  }
  if (co.has('Instagram')) {
    ra.push('Instagram: API không còn trả follower theo ngày, chỉ chốt được tại lúc đồng bộ.');
  }
  return ra;
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
function theoKenh(rows, channels, chotFollower) {
  const m = new Map();
  rows.forEach((r) => {
    const k = r.channelExtId || r.channel || '(chưa gắn kênh)';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  });
  const byExt = new Map((channels || []).map((c) => [c.extId, c]));
  return [...m.entries()].map(([k, ds]) => {
    const c = byExt.get(k);
    const chot = chotFollower && chotFollower.get(k);
    return {
      extId: k,
      name: (c && c.name) || (ds[0] && ds[0].channel) || k,
      platform: (c && c.platform) || (ds[0] && ds[0].platform) || '',
      url: (c && c.url) || '',
      owner: (c && c.owner) || [],
      ...agg(ds),
      ...(chot ? { followers: chot } : {}),
    };
  }).sort((a, b) => b.views - a.views);
}

/** Bảng theo nền tảng. */
function theoNenTang(rows, chotFollower) {
  const m = new Map();
  rows.forEach((r) => {
    const k = r.platform || '(không rõ)';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  });
  const theoNen = new Map();
  (chotFollower || []).forEach((x) => {
    theoNen.set(x.platform, (theoNen.get(x.platform) || 0) + x.followers);
  });
  return [...m.entries()]
    .map(([platform, ds]) => ({
      platform,
      ...agg(ds),
      ...(theoNen.has(platform) ? { followers: theoNen.get(platform) } : {}),
    }))
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

  /* Follower lấy mốc gần nhất trước `den`, không giới hạn trong khoảng lọc —
   * xem chú thích ở followerChot(). Tính lại luôn cả kỳ trước và % thay đổi,
   * nếu không mũi tên bên cạnh ô follower sẽ so hai cách đo khác nhau. */
  const chot = followerChot(d.daily, den, f);
  const chotTruoc = followerChot(d.daily, so.kyTruoc.to, f);
  const cong = (ds) => ds.reduce((x, y) => x + y.followers, 0);
  so.nay.followers = cong(chot);
  so.truoc.followers = cong(chotTruoc);
  so.doi.followers = so.truoc.followers
    ? (so.nay.followers - so.truoc.followers) / so.truoc.followers
    : (so.nay.followers ? 1 : 0);
  const chotTheoKenh = new Map(chot.map((x) => [x.kenh, x.followers]));

  /* Kênh có lưu lượng trong kỳ nhưng chưa từng chốt follower trước `den`.
   * TikTok và Zalo chỉ đọc được follower TẠI THỜI ĐIỂM chạy đồng bộ — không nền
   * tảng nào trả lại lịch sử — nên lọc một tháng đã qua thì mấy kênh đó không có
   * mốc nào để lấy. Con số vẫn đúng, nhưng phải nói ra là nó chưa gồm những kênh
   * này, kẻo đọc 770.240 lại tưởng là của cả 10 kênh. */
  const coLuuLuong = new Set(rows.map((r) => r.channelExtId || r.channel || r.platform));
  const thieuFollower = [...coLuuLuong].filter((k) => !chotTheoKenh.has(k));
  so.nay.soKenhCoFollower = chotTheoKenh.size;
  so.nay.soKenhThieuFollower = thieuFollower.length;

  /* Tiếp cận cũng vậy: Meta đã gỡ page_impressions_unique của Facebook và TikTok
   * display không có reach, nên ô "Lượt tiếp cận" thực chất chỉ là của Instagram. */
  const nenCoReach = [...new Set(rows.filter((r) => num(r.reach)).map((r) => r.platform))];

  return {
    tu, den,
    tong: so.nay,
    kyTruoc: so.truoc,
    doi: so.doi,
    khoangTruoc: so.kyTruoc,
    ngay: theoNgay(rows, tu, den),
    kenh: theoKenh(rows, d.channels, chotTheoKenh),
    nenTang: theoNenTang(rows, chot),
    topBai: topBai(d.posts, { ...f, from: tu, to: den, theo: 'views', n: 20 }),
    live: d.lives.filter((l) => (!l.date || (l.date >= tu && l.date <= den))
      && (!platforms || !platforms.length || platforms.includes(l.platform)))
      .sort((a, b) => String(b.start).localeCompare(String(a.start)))
      .slice(0, 50),
    nenCoReach,
    thieuFollower,
    luuY: luuYNenTang(rows),
    soKenh: d.channels.length,
    soBai: d.posts.length,
    capNhat: d.luc,
  };
}

module.exports = { agg, loc, followerChot, theoNgay, theoKenh, theoNenTang, topBai,
  soKyTruoc, tongQuan, chia };
