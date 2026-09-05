'use strict';
/**
 * Adapter Instagram Business — Instagram Graph API (đi qua Facebook Page).
 *
 * Token: KHÔNG có token riêng cho Instagram. Tài khoản IG Business luôn treo dưới
 * một Facebook Page, và mọi lời gọi dùng chính page token của trang đó. Nên khối
 * cấu hình `instagram.accounts[]` chỉ ghi `pageId`, còn token thì lấy từ khối
 * facebook — thiếu Facebook là Instagram cũng không chạy.
 *
 * BẪY của Insights bên IG: hai họ metric, không gọi chung một request được.
 *   - họ chuỗi thời gian (period=day, có since/until): reach, follower_count…
 *     → trả sẵn từng ngày.
 *   - họ total_value (metric_type=total_value): views, likes, comments, shares,
 *     saves, total_interactions… → trả MỘT con số cho cả khoảng, không chia ngày.
 * Muốn có số theo ngày ở họ thứ hai thì phải gọi từng ngày một. Đắt, nên chỉ làm
 * khi khoảng ngày đủ ngắn (xem NGAY_TOI_DA); dài hơn thì lấy tổng và dồn vào ngày
 * cuối, kèm cảnh báo — thà nói thật còn hơn bịa số cho từng ngày.
 */
const { getJson, scrub, hideSecret } = require('./http');

const PLATFORM = 'Instagram';
const NGUON = 'Instagram API';

/** Trần số ngày còn chịu gọi từng ngày cho họ total_value. */
const NGAY_TOI_DA = 45;

const num = (v) => {
  const n = Number(String(v == null ? 0 : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const g = (fb) => 'https://graph.facebook.com/' + ((fb && fb.apiVersion) || 'v23.0');

const CHUOI_TG = ['reach', 'follower_count', 'profile_views', 'website_clicks'];
const TONG = ['views', 'accounts_engaged', 'total_interactions', 'likes', 'comments',
  'shares', 'saves', 'replies', 'profile_links_taps'];

const COT = {
  reach: 'reach',
  follower_count: 'followUp',
  profile_views: 'profileViews',
  website_clicks: 'clicks',
  views: 'views',
  total_interactions: 'engagement',
  likes: 'likes',
  comments: 'comments',
  shares: 'shares',
  saves: 'saves',
  replies: 'messages',
  profile_links_taps: 'clicks',
  accounts_engaged: null,
};

/** Danh sách ngày YYYY-MM-DD trong khoảng, bao gồm hai đầu. */
function cacNgay(from, to) {
  const out = [];
  const d = new Date(from + 'T00:00:00Z');
  const het = new Date(to + 'T00:00:00Z');
  while (d <= het && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Gọi insights, tự bỏ metric mà phiên bản API không nhận nữa (giống facebook.js —
 * Meta cũng bỏ metric bên IG khá thường xuyên, v22 đổi `impressions` thành `views`).
 */
async function doInsights(url0, metrics, nhan) {
  let conLai = metrics.slice();
  const bo = [];
  for (let vong = 0; vong < metrics.length; vong++) {
    if (!conLai.length) break;
    const res = await getJson(url0 + '&metric=' + encodeURIComponent(conLai.join(',')),
      { label: nhan, retries: 2 });
    if (!res.error) return { data: res.data || [], bo };
    const msg = String(res.error.message || '');
    const thuPham = conLai.find((m) => msg.includes(m));
    if (!thuPham) throw new Error(scrub(nhan + ' — IG báo lỗi (' + res.error.code + '): ' + msg));
    bo.push(thuPham);
    conLai = conLai.filter((m) => m !== thuPham);
  }
  return { data: [], bo };
}

/* ---------------- hồ sơ ---------------- */

async function hoSo(fb, token, igId) {
  const r = await getJson(g(fb) + '/' + igId
    + '?fields=' + encodeURIComponent('id,username,name,followers_count,follows_count,media_count,profile_picture_url')
    + '&access_token=' + encodeURIComponent(token),
    { label: 'Instagram hồ sơ ' + igId, retries: 2 });
  if (r.error) throw new Error(scrub('IG báo lỗi (' + r.error.code + '): ' + r.error.message));
  return {
    id: String(r.id), username: r.username || '', name: r.name || r.username || '',
    followers: num(r.followers_count), media: num(r.media_count),
  };
}

/* ---------------- số liệu theo ngày ---------------- */

function dongTrong(igId, d) {
  return {
    platform: PLATFORM, extId: String(igId), date: d, source: NGUON,
    followers: 0, followUp: 0, followDown: 0, views: 0, reach: 0, impressions: 0,
    profileViews: 0, likes: 0, comments: 0, shares: 0, saves: 0,
    engagement: 0, clicks: 0, messages: 0, leads: 0, posts: 0, lives: 0,
  };
}

async function ngayCuaIg(fb, token, acc, from, to, canhBao) {
  const igId = acc.id;
  const theoNgay = new Map();
  const lay = (d) => {
    if (!theoNgay.has(d)) theoNgay.set(d, dongTrong(igId, d));
    return theoNgay.get(d);
  };

  // --- họ chuỗi thời gian: một lời gọi cho cả khoảng ---
  const url0 = g(fb) + '/' + igId + '/insights?period=day'
    + '&since=' + from + '&until=' + to
    + '&access_token=' + encodeURIComponent(token);
  try {
    const { data, bo } = await doInsights(url0, CHUOI_TG, 'Instagram insights ' + (acc.name || igId));
    if (bo.length) {
      canhBao.push('Instagram · ' + (acc.name || igId) + ': API không còn nhận '
        + bo.join(', ') + ' — các cột đó để trống.');
    }
    data.forEach((m) => {
      const cot = COT[m.name];
      if (!cot) return;
      (m.values || []).forEach((v) => {
        const t = new Date(v.end_time);
        if (Number.isNaN(t.getTime())) return;
        t.setUTCDate(t.getUTCDate() - 1);
        const d = t.toISOString().slice(0, 10);
        if (d < from || d > to) return;
        lay(d)[cot] += num(v.value);
      });
    });
  } catch (e) {
    canhBao.push('Instagram · ' + (acc.name || igId) + ': ' + e.message);
  }

  // --- họ total_value: phải gọi từng ngày mới có số theo ngày ---
  const ds = cacNgay(from, to);
  if (ds.length <= NGAY_TOI_DA) {
    for (const d of ds) {
      const sau = new Date(d + 'T00:00:00Z');
      sau.setUTCDate(sau.getUTCDate() + 1);
      const u = g(fb) + '/' + igId + '/insights?period=day&metric_type=total_value'
        + '&since=' + d + '&until=' + sau.toISOString().slice(0, 10)
        + '&access_token=' + encodeURIComponent(token);
      try {
        const { data } = await doInsights(u, TONG, 'Instagram total_value ' + d);
        const row = lay(d);
        data.forEach((m) => {
          const cot = COT[m.name];
          if (!cot) return;
          row[cot] += num(m.total_value && m.total_value.value);
        });
      } catch (_) { /* một ngày lỗi không đáng dừng cả tháng */ }
    }
  } else {
    try {
      const u = g(fb) + '/' + igId + '/insights?period=day&metric_type=total_value'
        + '&since=' + from + '&until=' + to
        + '&access_token=' + encodeURIComponent(token);
      const { data } = await doInsights(u, TONG, 'Instagram total_value gộp');
      const row = lay(to);
      data.forEach((m) => {
        const cot = COT[m.name];
        if (cot) row[cot] += num(m.total_value && m.total_value.value);
      });
      canhBao.push('Instagram · ' + (acc.name || igId) + ': khoảng ' + ds.length
        + ' ngày dài hơn ' + NGAY_TOI_DA + ' nên các chỉ số views/thích/bình luận/chia sẻ/lưu '
        + 'chỉ có TỔNG cả kỳ, đã dồn vào ngày ' + to + '. Chạy lại theo từng tháng để có số từng ngày.');
    } catch (e) {
      canhBao.push('Instagram · ' + (acc.name || igId) + ': ' + e.message);
    }
  }

  /* Follower luỹ kế: IG chỉ trả follower_count = số follow MỚI trong ngày, không
   * trả tổng theo ngày. Tổng hiện tại lấy từ hồ sơ rồi trừ ngược về quá khứ —
   * đúng với ngày gần nhất, và càng lùi xa càng chỉ là ước lượng. Ghi vào ngày
   * cuối cùng thôi để không bịa lịch sử. */
  const cuoi = theoNgay.get(to);
  if (cuoi && acc.followers) cuoi.followers = acc.followers;

  return [...theoNgay.values()];
}

/* ---------------- bài đăng ---------------- */

const LOAI = { IMAGE: 'Ảnh', VIDEO: 'Video', CAROUSEL_ALBUM: 'Album', REELS: 'Reels', STORY: 'Story' };

async function baiCuaIg(fb, token, acc, from, to, tran, canhBao) {
  const igId = acc.id;
  const out = [];
  const fields = 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count';
  let url = g(fb) + '/' + igId + '/media?limit=50&fields=' + encodeURIComponent(fields)
    + '&since=' + from + '&until=' + to
    + '&access_token=' + encodeURIComponent(token);

  const dsMedia = [];
  for (let trang = 0; url && trang < 40 && dsMedia.length < tran; trang++) {
    const res = await getJson(url, { label: 'Instagram media ' + (acc.name || igId), retries: 2 });
    if (res.error) {
      canhBao.push('Instagram · ' + (acc.name || igId) + ': không đọc được danh sách bài — '
        + scrub(res.error.message || ''));
      break;
    }
    dsMedia.push(...(res.data || []));
    url = (res.paging && res.paging.next) || null;
  }

  for (const m of dsMedia.slice(0, tran)) {
    const laReel = m.media_product_type === 'REELS';
    const metrics = ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'total_interactions']
      .concat(laReel ? ['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'] : []);
    const ins = {};
    try {
      const { data } = await doInsights(
        g(fb) + '/' + m.id + '/insights?access_token=' + encodeURIComponent(token),
        metrics, 'Instagram insight bài ' + m.id);
      data.forEach((x) => {
        ins[x.name] = x.total_value ? num(x.total_value.value) : num(((x.values || [])[0] || {}).value);
      });
    } catch (_) { /* bài cũ hoặc Story hết hạn thường không còn insight */ }

    const likes = ins.likes != null ? ins.likes : num(m.like_count);
    const cmts = ins.comments != null ? ins.comments : num(m.comments_count);
    const reach = ins.reach || 0;
    out.push({
      platform: PLATFORM,
      extId: String(igId),
      postId: String(m.id),
      title: (m.caption || '').slice(0, 200),
      publishedAt: m.timestamp || '',
      type: LOAI[laReel ? 'REELS' : m.media_type] || 'Bài viết',
      url: m.permalink || '',
      views: ins.views || reach,
      reach,
      impressions: 0,
      likes, comments: cmts,
      shares: ins.shares || 0,
      saves: ins.saves || 0,
      engagement: ins.total_interactions || (likes + cmts + (ins.shares || 0) + (ins.saves || 0)),
      clicks: 0,
      // API trả mili-giây
      avgWatch: ins.ig_reels_avg_watch_time ? ins.ig_reels_avg_watch_time / 1000 : 0,
      fullWatchRate: 0,
      source: NGUON,
    });
  }
  return out;
}

/* ---------------- điểm vào ---------------- */

/**
 * conf   = khối instagram trong ket-noi.json
 * confFb = khối facebook (để lấy page token + apiVersion)
 * layToken(pageId) -> Promise<token>
 */
async function fetchRange(conf, confFb, layToken, from, to, opts = {}, log = () => {}) {
  const accs = (conf.accounts || []).filter((a) => a && a.id);
  if (!accs.length) throw new Error('Chưa khai tài khoản Instagram nào trong cấu hình kết nối');

  const canhBao = [];
  const daily = []; const posts = []; const channels = [];

  for (const a of accs) {
    let token;
    try {
      token = await layToken(a.pageId);
      hideSecret(token);
    } catch (e) {
      canhBao.push('Instagram · ' + (a.name || a.id) + ': không lấy được token của Page '
        + a.pageId + ' — ' + e.message);
      continue;
    }

    let hs = { id: a.id, username: a.username || '', name: a.name || a.username || a.id, followers: 0 };
    try { hs = await hoSo(confFb, token, a.id); } catch (e) {
      canhBao.push('Instagram · ' + (a.name || a.id) + ': ' + e.message);
    }

    channels.push({
      platform: PLATFORM, extId: String(a.id),
      name: a.name || hs.name || hs.username || String(a.id),
      handle: hs.username || a.username || '',
      url: hs.username ? 'https://instagram.com/' + hs.username : '',
    });

    try {
      const d = await ngayCuaIg(confFb, token, { ...a, ...hs }, from, to, canhBao);
      daily.push(...d);
      log('Instagram · ' + (hs.username || a.id) + ': ' + d.length + ' ngày');
    } catch (e) { canhBao.push('Instagram · ' + (a.name || a.id) + ': ' + e.message); }

    if (opts.layBai !== false) {
      try {
        const p = await baiCuaIg(confFb, token, { ...a, ...hs }, from, to, opts.soBaiToiDa || 200, canhBao);
        posts.push(...p);
        log('Instagram · ' + (hs.username || a.id) + ': ' + p.length + ' bài');
      } catch (e) { canhBao.push('Instagram bài · ' + (a.name || a.id) + ': ' + e.message); }
    }
  }

  /* IG không mở API cho LIVE — không có endpoint nào trả lượt xem/bình luận của
   * một buổi phát trực tiếp. Trả mảng rỗng và nói thẳng, để người dùng biết mà
   * nhập tay chứ không ngồi chờ số tự về. */
  return {
    channels, daily, posts, lives: [],
    canhBao: canhBao.concat(accs.length
      ? ['Instagram không mở API cho LIVE — chỉ số LIVE của IG phải nhập tay.'] : []),
  };
}

async function test(conf, confFb, layToken) {
  const accs = (conf.accounts || []).filter((a) => a && a.id);
  if (!accs.length) return { ok: false, message: 'Chưa khai tài khoản Instagram nào' };
  const results = [];
  for (const a of accs) {
    try {
      const token = await layToken(a.pageId);
      const hs = await hoSo(confFb, token, a.id);
      results.push({ account: a.id, ok: true, name: hs.username || hs.name, followers: hs.followers });
    } catch (e) {
      results.push({ account: a.id, ok: false, name: a.name || a.id, message: e.message });
    }
  }
  return { ok: results.some((r) => r.ok), results };
}

module.exports = { PLATFORM, NGUON, fetchRange, test, hoSo, cacNgay };
