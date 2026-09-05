'use strict';
/**
 * Adapter Facebook Page — số liệu TỰ NHIÊN (organic), không phải quảng cáo.
 * Quảng cáo đã có app riêng (lark-ads-manager) đọc Marketing API; ở đây là
 * Graph API phần Page Insights.
 *
 * Ba mức số liệu, ba endpoint:
 *   trang  → /{page-id}/insights          (theo ngày: hiển thị, tiếp cận, follower…)
 *   bài    → /{page-id}/posts + insights  (từng bài)
 *   LIVE   → /{page-id}/live_videos       (Facebook có API LIVE thật, khác TikTok)
 *
 * BẪY LỚN NHẤT của Graph API Insights: xin một metric mà phiên bản API đó đã bỏ
 * thì Meta trả lỗi cho CẢ REQUEST, không phải chỉ metric đó. Meta lại bỏ metric
 * khá thường xuyên (v22 bỏ một loạt page_*). Nên ở đây không hard-code một danh
 * sách rồi cầu trời: xem doInsights() — nó tự đọc tên metric trong câu lỗi, bỏ
 * đúng cái đó ra rồi hỏi lại. Kênh mất một chỉ số chứ không mất cả ngày dữ liệu.
 */
const { getJson, scrub, hideSecret } = require('./http');

const PLATFORM = 'Facebook';
const NGUON = 'Facebook API';

const num = (v) => {
  const n = Number(String(v == null ? 0 : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const ngay = (s) => String(s || '').slice(0, 10);

/** Metric theo ngày ở mức trang. Thứ tự không quan trọng; tên thì rất quan trọng. */
const METRIC_NGAY = [
  'page_impressions',            // lượt hiển thị
  'page_impressions_unique',     // lượt tiếp cận
  'page_post_engagements',       // tương tác
  'page_views_total',            // lượt xem trang
  'page_video_views',            // lượt xem video
  'page_daily_follows_unique',   // follower tăng trong ngày
  'page_daily_unfollows_unique', // follower giảm trong ngày
  'page_fans',                   // tổng người thích (luỹ kế)
  'page_follows',                // tổng follower (luỹ kế)
];

/** Ánh xạ tên metric của Meta sang tên cột của mình. */
const COT = {
  page_impressions: 'impressions',
  page_impressions_unique: 'reach',
  page_post_engagements: 'engagement',
  page_views_total: 'profileViews',
  page_video_views: 'views',
  page_daily_follows_unique: 'followUp',
  page_daily_unfollows_unique: 'followDown',
  page_fans: 'followers',
  page_follows: 'followers',      // ưu tiên page_follows nếu có cả hai
};

const g = (conf) => 'https://graph.facebook.com/' + (conf.apiVersion || 'v23.0');

/**
 * Gọi /insights và tự bỏ những metric mà phiên bản API hiện tại không nhận nữa.
 * Trả { data, bo: [tên metric đã phải bỏ] }.
 */
async function doInsights(url0, metrics, nhan) {
  let conLai = metrics.slice();
  const bo = [];
  for (let vong = 0; vong < metrics.length; vong++) {
    if (!conLai.length) break;
    const url = url0 + '&metric=' + encodeURIComponent(conLai.join(','));
    let res;
    try {
      res = await getJson(url, { label: nhan, retries: 2 });
    } catch (e) {
      throw new Error(scrub(nhan + ': ' + e.message));
    }
    if (!res.error) return { data: res.data || [], bo };

    const msg = String(res.error.message || '');
    // Meta gọi tên metric hỏng ngay trong câu lỗi — bắt lấy rồi loại nó ra.
    const thuPham = conLai.find((m) => msg.includes(m));
    if (!thuPham) throw new Error(scrub(nhan + ' — Meta báo lỗi (' + res.error.code + '): ' + msg));
    bo.push(thuPham);
    conLai = conLai.filter((m) => m !== thuPham);
  }
  return { data: [], bo };
}

/* ---------------- danh sách Page ---------------- */

/**
 * Liệt kê Page mà token nhìn thấy, kèm page token của từng trang.
 * Đây là bước duy nhất cần token gốc; sau đó mọi lời gọi đều dùng page token.
 */
async function danhSachPage(conf) {
  if (!conf.userToken) throw new Error('Chưa có Facebook userToken');
  hideSecret(conf.userToken);
  const url = g(conf) + '/me/accounts?limit=100'
    + '&fields=' + encodeURIComponent('id,name,username,link,access_token,fan_count,followers_count,instagram_business_account{id,username}')
    + '&access_token=' + encodeURIComponent(conf.userToken);
  const res = await getJson(url, { label: 'Facebook /me/accounts' });
  if (res.error) throw new Error(scrub('Facebook báo lỗi (' + res.error.code + '): ' + res.error.message));
  return (res.data || []).map((p) => {
    if (p.access_token) hideSecret(p.access_token);
    return {
      id: String(p.id),
      name: p.name || '',
      handle: p.username || '',
      url: p.link || ('https://facebook.com/' + p.id),
      token: p.access_token || '',
      followers: num(p.followers_count || p.fan_count),
      instagram: p.instagram_business_account
        ? { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username || '' }
        : null,
    };
  });
}

/** Token của một page: ưu tiên cái đã lưu, thiếu thì hỏi lại Graph. */
async function tokenPage(conf, page) {
  if (page.token) { hideSecret(page.token); return page.token; }
  const ds = await danhSachPage(conf);
  const p = ds.find((x) => x.id === String(page.id));
  if (!p || !p.token) throw new Error('Không lấy được page token cho trang ' + (page.name || page.id));
  return p.token;
}

/* ---------------- số liệu theo ngày ---------------- */

async function ngayCuaPage(conf, page, from, to, canhBao) {
  const token = await tokenPage(conf, page);
  const url0 = g(conf) + '/' + page.id + '/insights'
    + '?period=day&since=' + from + '&until=' + to
    + '&access_token=' + encodeURIComponent(token);

  const { data, bo } = await doInsights(url0, METRIC_NGAY, 'Facebook insights ' + (page.name || page.id));
  if (bo.length) {
    canhBao.push('Facebook · ' + (page.name || page.id) + ': phiên bản API '
      + (conf.apiVersion || 'v23.0') + ' không còn nhận ' + bo.join(', ') + ' — các cột đó để trống.');
  }

  /* Meta trả mỗi metric một mảng values theo ngày. Gộp lại thành một dòng/ngày.
   * Lưu ý end_time của Meta là 08:00 UTC của NGÀY HÔM SAU (múi giờ của page),
   * nên phải lùi một ngày mới ra đúng ngày số liệu. */
  const theoNgay = new Map();
  const lay = (d) => {
    if (!theoNgay.has(d)) {
      theoNgay.set(d, {
        platform: PLATFORM, extId: String(page.id), date: d, source: NGUON,
        followers: 0, followUp: 0, followDown: 0, views: 0, reach: 0, impressions: 0,
        profileViews: 0, likes: 0, comments: 0, shares: 0, saves: 0,
        engagement: 0, clicks: 0, messages: 0, leads: 0, posts: 0, lives: 0,
      });
    }
    return theoNgay.get(d);
  };

  data.forEach((m) => {
    const cot = COT[m.name];
    if (!cot) return;
    (m.values || []).forEach((v) => {
      const t = new Date(v.end_time);
      if (Number.isNaN(t.getTime())) return;
      t.setUTCDate(t.getUTCDate() - 1);
      const d = t.toISOString().slice(0, 10);
      if (d < from || d > to) return;
      const row = lay(d);
      const so = typeof v.value === 'object' && v.value !== null
        ? Object.values(v.value).reduce((s, x) => s + num(x), 0)
        : num(v.value);
      // page_fans và page_follows cùng đổ vào followers — lấy số lớn hơn (follows
      // luôn >= fans, và trang nào tắt nút Thích thì chỉ có follows).
      if (cot === 'followers') row.followers = Math.max(row.followers, so);
      else row[cot] += so;
    });
  });

  return [...theoNgay.values()];
}

/* ---------------- bài đăng ---------------- */

const LOAI_BAI = {
  video: 'Video', photo: 'Ảnh', album: 'Album', link: 'Bài viết',
  status: 'Bài viết', reel: 'Reels', share: 'Bài viết',
};

async function baiCuaPage(conf, page, from, to, tran, canhBao) {
  const token = await tokenPage(conf, page);
  const fields = [
    'id', 'created_time', 'message', 'permalink_url', 'status_type',
    'shares',
    'comments.summary(true).limit(0)',
    'likes.summary(true).limit(0)',
    'insights.metric(post_impressions,post_impressions_unique,post_clicks,post_video_views,post_video_avg_time_watched)',
  ].join(',');

  const out = [];
  let url = g(conf) + '/' + page.id + '/posts?limit=50'
    + '&since=' + from + '&until=' + to
    + '&fields=' + encodeURIComponent(fields)
    + '&access_token=' + encodeURIComponent(token);

  for (let trang = 0; url && trang < 40 && out.length < tran; trang++) {
    const res = await getJson(url, { label: 'Facebook posts ' + (page.name || page.id), retries: 2 });
    if (res.error) {
      /* Thiếu quyền đọc insight từng bài thì vẫn còn số liệu mức trang — báo cho
       * người dùng biết rồi đi tiếp, đừng làm hỏng cả lượt đồng bộ. */
      canhBao.push('Facebook · ' + (page.name || page.id) + ': không đọc được danh sách bài — '
        + scrub(res.error.message || ''));
      break;
    }
    (res.data || []).forEach((p) => {
      const ins = {};
      ((p.insights && p.insights.data) || []).forEach((m) => {
        ins[m.name] = num(((m.values || [])[0] || {}).value);
      });
      const likes = num(p.likes && p.likes.summary && p.likes.summary.total_count);
      const cmts = num(p.comments && p.comments.summary && p.comments.summary.total_count);
      const shares = num(p.shares && p.shares.count);
      const reach = ins.post_impressions_unique || 0;
      const views = ins.post_video_views || 0;
      out.push({
        platform: PLATFORM,
        extId: String(page.id),
        postId: String(p.id),
        title: (p.message || '').slice(0, 200),
        publishedAt: p.created_time || '',
        type: LOAI_BAI[p.status_type] || 'Bài viết',
        url: p.permalink_url || '',
        views: views || reach,
        reach,
        impressions: ins.post_impressions || 0,
        likes, comments: cmts, shares, saves: 0,
        engagement: likes + cmts + shares,
        clicks: ins.post_clicks || 0,
        avgWatch: ins.post_video_avg_time_watched ? ins.post_video_avg_time_watched / 1000 : 0,
        fullWatchRate: 0,
        source: NGUON,
      });
    });
    url = (res.paging && res.paging.next) || null;
  }
  return out.slice(0, tran);
}

/* ---------------- phiên LIVE ---------------- */

async function liveCuaPage(conf, page, from, to, canhBao) {
  const token = await tokenPage(conf, page);
  const fields = [
    'id', 'title', 'description', 'status', 'creation_time',
    'broadcast_start_time', 'broadcast_end_time', 'live_views', 'permalink_url',
    'video{id,length,views}',
  ].join(',');

  const out = [];
  let url = g(conf) + '/' + page.id + '/live_videos?limit=50'
    + '&since=' + from + '&until=' + to
    + '&fields=' + encodeURIComponent(fields)
    + '&access_token=' + encodeURIComponent(token);

  for (let trang = 0; url && trang < 20; trang++) {
    const res = await getJson(url, { label: 'Facebook live ' + (page.name || page.id), retries: 2 });
    if (res.error) {
      canhBao.push('Facebook · ' + (page.name || page.id) + ': không đọc được LIVE — '
        + scrub(res.error.message || '') + ' (thường là thiếu quyền pages_manage_metadata)');
      break;
    }
    for (const lv of (res.data || [])) {
      const batDau = lv.broadcast_start_time || lv.creation_time || '';
      const d = ngay(batDau);
      if (from && d && d < from) continue;
      if (to && d && d > to) continue;

      const row = {
        platform: PLATFORM,
        extId: String(page.id),
        liveId: String(lv.id),
        title: (lv.title || lv.description || '').slice(0, 200),
        start: batDau,
        end: lv.broadcast_end_time || '',
        minutes: 0,
        views: num(lv.video && lv.video.views),
        peak: num(lv.live_views),          // live_views = số người xem cùng lúc lúc đỉnh
        comments: 0, likes: 0, shares: 0, newFollows: 0,
        url: lv.permalink_url ? 'https://facebook.com' + lv.permalink_url : '',
        source: NGUON,
      };
      if (row.start && row.end) {
        const p = (new Date(row.end) - new Date(row.start)) / 60000;
        if (Number.isFinite(p) && p > 0) row.minutes = Math.round(p);
      } else if (lv.video && lv.video.length) {
        row.minutes = Math.round(num(lv.video.length) / 60);
      }

      // Số liệu đầy đủ chỉ có sau khi phiên kết thúc và Meta xử lý xong video.
      const vid = lv.video && lv.video.id;
      if (vid && lv.status !== 'LIVE') {
        try {
          const ins = await getJson(g(conf) + '/' + vid + '/video_insights'
            + '?metric=' + encodeURIComponent('total_video_views,total_video_impressions,total_video_reactions_by_type_total')
            + '&access_token=' + encodeURIComponent(token),
            { label: 'Facebook video_insights ' + vid, retries: 1 });
          ((ins && ins.data) || []).forEach((m) => {
            const v = ((m.values || [])[0] || {}).value;
            if (m.name === 'total_video_views') row.views = Math.max(row.views, num(v));
            if (m.name === 'total_video_reactions_by_type_total' && v && typeof v === 'object') {
              row.likes = Object.values(v).reduce((s, x) => s + num(x), 0);
            }
          });
          const cm = await getJson(g(conf) + '/' + vid + '/comments?summary=true&limit=0'
            + '&access_token=' + encodeURIComponent(token),
            { label: 'Facebook live comments ' + vid, retries: 1 });
          row.comments = num(cm && cm.summary && cm.summary.total_count);
        } catch (_) { /* một phiên thiếu số không đáng làm hỏng cả lượt */ }
      }
      out.push(row);
    }
    url = (res.paging && res.paging.next) || null;
  }
  return out;
}

/* ---------------- điểm vào ---------------- */

/**
 * Kéo toàn bộ số liệu Facebook trong khoảng ngày.
 * Một trang hỏng thì ghi cảnh báo rồi đi tiếp — mất một trang còn hơn mất cả lượt.
 */
async function fetchRange(conf, from, to, opts = {}, log = () => {}) {
  const pages = (conf.pages || []).filter((p) => p && p.id);
  if (!pages.length) throw new Error('Chưa khai trang Facebook nào trong cấu hình kết nối');

  const canhBao = [];
  const daily = []; const posts = []; const lives = []; const channels = [];

  for (const page of pages) {
    channels.push({
      platform: PLATFORM, extId: String(page.id), name: page.name || String(page.id),
      handle: page.handle || '', url: page.url || ('https://facebook.com/' + page.id),
    });
    try {
      const d = await ngayCuaPage(conf, page, from, to, canhBao);
      daily.push(...d);
      log('Facebook · ' + (page.name || page.id) + ': ' + d.length + ' ngày');
    } catch (e) {
      canhBao.push('Facebook · ' + (page.name || page.id) + ': ' + e.message);
    }
    if (opts.layBai !== false) {
      try {
        const p = await baiCuaPage(conf, page, from, to, opts.soBaiToiDa || 200, canhBao);
        posts.push(...p);
        log('Facebook · ' + (page.name || page.id) + ': ' + p.length + ' bài');
      } catch (e) { canhBao.push('Facebook bài · ' + (page.name || page.id) + ': ' + e.message); }
    }
    if (opts.layLive !== false) {
      try {
        const l = await liveCuaPage(conf, page, from, to, canhBao);
        lives.push(...l);
        log('Facebook · ' + (page.name || page.id) + ': ' + l.length + ' phiên LIVE');
      } catch (e) { canhBao.push('Facebook LIVE · ' + (page.name || page.id) + ': ' + e.message); }
    }
  }

  return { channels, daily, posts, lives, canhBao };
}

/** Soi token: còn sống không, hết hạn khi nào, có quyền gì. */
async function test(conf) {
  if (!conf.userToken) return { ok: false, message: 'Chưa có userToken' };
  hideSecret(conf.userToken);
  try {
    const r = await getJson(g(conf) + '/debug_token'
      + '?input_token=' + encodeURIComponent(conf.userToken)
      + '&access_token=' + encodeURIComponent(conf.userToken),
      { label: 'Facebook debug_token', retries: 1 });
    const d = (r && r.data) || null;
    if (!d) return { ok: false, message: 'Không đọc được thông tin token' };
    const exp = Number(d.expires_at || 0);
    const pages = await danhSachPage(conf).catch(() => []);
    return {
      ok: d.is_valid !== false,
      vinhVien: exp === 0,
      conNgay: exp > 0 ? Math.floor((exp * 1000 - Date.now()) / 86400000) : null,
      quyen: d.scopes || [],
      thieuQuyen: ['pages_read_engagement', 'pages_show_list', 'read_insights']
        .filter((q) => !(d.scopes || []).includes(q)),
      results: pages.map((p) => ({ account: p.id, ok: true, name: p.name, followers: p.followers })),
    };
  } catch (e) { return { ok: false, message: e.message }; }
}

module.exports = { PLATFORM, NGUON, fetchRange, test, danhSachPage, METRIC_NGAY, doInsights };
