'use strict';
/**
 * Adapter TikTok — kênh TỰ NHIÊN (nội dung), không phải quảng cáo.
 * Quảng cáo TikTok đã có app riêng đọc Marketing API; ở đây là hai API khác hẳn.
 *
 * Hai đường, khai ở `mode` của từng kênh:
 *
 *   'business' — TikTok Business Account API (business-api.tiktok.com/…/business/)
 *       Cần tài khoản đã chuyển sang TikTok Business và app được duyệt phạm vi
 *       tương ứng. Đổi lại: có lượt tiếp cận, lượt xem hồ sơ, follower tăng/giảm
 *       THEO NGÀY, và từng video có tỷ lệ xem hết + thời gian xem trung bình.
 *
 *   'display' — TikTok Display API (open.tiktokapis.com/v2/)
 *       Đường phổ thông, tài khoản nào cũng nối được. Chỉ có: follower hiện tại
 *       (một con số, KHÔNG có lịch sử theo ngày) và từng video với view/like/
 *       comment/share LUỸ KẾ TỚI THỜI ĐIỂM GỌI.
 *
 * Vì sao chuyện "luỹ kế" quan trọng: ở chế độ display, lượt xem trả về là tổng
 * đời của video, không phải lượt xem trong ngày. Cộng thẳng vào ô "Lượt xem" của
 * một ngày là sai. App giải quyết ở tầng trên (sync/index.js): so bản mới với bản
 * đã lưu trong bảng Bài đăng rồi lấy phần CHÊNH LỆCH làm số của ngày. Adapter này
 * chỉ có nhiệm vụ trả số thô đúng như nền tảng nói.
 *
 * LIVE: TikTok KHÔNG mở API cho phiên phát trực tiếp — không có endpoint nào cho
 * lượt xem / bình luận / follow mới của một buổi LIVE. Adapter trả mảng rỗng và
 * ghi cảnh báo; số LIVE phải nhập tay hoặc nhập từ file xuất của LIVE Center.
 */
const { getJson, postJson, request, scrub, hideSecret } = require('./http');

const PLATFORM = 'TikTok';
const NGUON = 'TikTok API';

const OPEN = 'https://open.tiktokapis.com/v2';
const BIZ = 'https://business-api.tiktok.com/open_api/v1.3/business';

const num = (v) => {
  const n = Number(String(v == null ? 0 : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const ngayCua = (giay) => (giay ? new Date(num(giay) * 1000).toISOString().slice(0, 10) : '');

/* ---------------- token ---------------- */

/**
 * Phạm vi xin của mỗi kênh.
 *   display  — đủ cho follower + danh sách video kèm view/like/comment/share
 *   business — thêm phạm vi tài khoản doanh nghiệp (tiếp cận, xem hồ sơ, tỷ lệ
 *              xem hết). App phải được TikTok bật sản phẩm Business Account thì
 *              phạm vi này mới hiện ra, không thì tick cũng vô ích.
 */
const PHAM_VI = {
  display: ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list'],
  business: ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list', 'biz.creation.info'],
};

/**
 * Dựng link để CHỦ KÊNH bấm vào và bấm đồng ý.
 *
 * Mỗi kênh TikTok là một tài khoản riêng nên phải làm một lần cho từng kênh —
 * không có đường tắt kiểu "một token thấy hết" như Facebook Page.
 */
function linkCapQuyen(conf, redirectUri, mode = 'display', state = '') {
  if (!conf.clientKey) throw new Error('Chưa khai clientKey của TikTok');
  if (!redirectUri) throw new Error('Chưa khai địa chỉ chuyển hướng (redirect URI)');
  const q = new URLSearchParams({
    client_key: conf.clientKey,
    scope: (PHAM_VI[mode] || PHAM_VI.display).join(','),
    response_type: 'code',
    redirect_uri: redirectUri,
    state: state || String(Date.now()),
  });
  return 'https://www.tiktok.com/v2/auth/authorize/?' + q.toString();
}

/**
 * Đổi mã uỷ quyền lấy cặp token. Chạy MỘT LẦN cho mỗi kênh.
 *
 * BẪY: mã TikTok trả về trên thanh địa chỉ đang ở dạng URL-encode và thường kết
 * thúc bằng `%2A` (dấu *). Dán nguyên vào mà không giải mã thì TikTok trả lỗi
 * "invalid_grant" rất khó đoán — nên ở đây giải mã trước, và chịu được cả khi
 * người dùng đã tự giải mã sẵn.
 */
async function doiMa(conf, code, redirectUri, codeVerifier = '') {
  if (!conf.clientKey || !conf.clientSecret) throw new Error('Chưa khai clientKey / clientSecret của TikTok');
  if (!code) throw new Error('Chưa có mã uỷ quyền');
  hideSecret(conf.clientSecret);

  let ma = String(code).trim();
  // Người dùng hay dán nguyên cả URL chuyển hướng — tự nhặt tham số code ra.
  if (/[?&]code=/.test(ma)) {
    const m = ma.match(/[?&]code=([^&#]+)/);
    if (m) ma = m[1];
  }
  try { ma = decodeURIComponent(ma); } catch (_) { /* đã ở dạng thô rồi */ }

  const body = { client_key: conf.clientKey, client_secret: conf.clientSecret,
    code: ma, grant_type: 'authorization_code' };
  if (redirectUri) body.redirect_uri = redirectUri;
  if (codeVerifier) body.code_verifier = codeVerifier;

  const r = await request(OPEN + '/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    label: 'TikTok đổi mã', retries: 1,
  });
  let j = {};
  try { j = JSON.parse(r.text); } catch (_) {}
  if (j.error || !j.access_token) {
    throw new Error(scrub('TikTok từ chối đổi mã: '
      + (j.error_description || j.error || r.text.slice(0, 200))
      + (String(j.error) === 'invalid_grant'
        ? ' — mã chỉ dùng được MỘT LẦN và sống vài phút; bấm lại link cấp quyền để lấy mã mới.'
        : '')));
  }
  hideSecret(j.access_token);
  hideSecret(j.refresh_token);
  return {
    openId: j.open_id || '',
    accessToken: j.access_token,
    refreshToken: j.refresh_token || '',
    expiresAt: Date.now() + Math.max(60, num(j.expires_in) - 120) * 1000,
    refreshExpiresAt: Date.now() + num(j.refresh_expires_in) * 1000,
    scope: j.scope || '',
  };
}

/**
 * Làm mới access token. TikTok cấp refresh token DÙNG MỘT LẦN: mỗi lần gọi là
 * nhận refresh token mới và cái cũ chết ngay. Người gọi BẮT BUỘC phải lưu lại
 * bản mới (xem ketnoi.luuToken) — không lưu thì lần sau kênh tắt.
 */
async function lamMoiToken(conf, ch) {
  if (!conf.clientKey || !conf.clientSecret) throw new Error('Chưa khai clientKey / clientSecret của TikTok');
  if (!ch.refreshToken) throw new Error('Kênh ' + (ch.name || ch.openId) + ' chưa có refreshToken');
  hideSecret(conf.clientSecret);
  hideSecret(ch.refreshToken);

  const body = new URLSearchParams({
    client_key: conf.clientKey,
    client_secret: conf.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: ch.refreshToken,
  }).toString();

  const r = await request(OPEN + '/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body, label: 'TikTok làm mới token', retries: 2,
  });
  let j = {};
  try { j = JSON.parse(r.text); } catch (_) {}
  if (j.error || !j.access_token) {
    throw new Error(scrub('TikTok từ chối làm mới token: '
      + (j.error_description || j.error || r.text.slice(0, 200))));
  }
  hideSecret(j.access_token);
  hideSecret(j.refresh_token);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || ch.refreshToken,
    expiresAt: Date.now() + Math.max(60, num(j.expires_in) - 120) * 1000,
    refreshExpiresAt: Date.now() + num(j.refresh_expires_in) * 1000,
    openId: j.open_id || ch.openId,
  };
}

/** Token còn dùng được không (chừa 2 phút). */
const conHan = (ch) => Boolean(ch.accessToken) && num(ch.expiresAt) > Date.now();

/**
 * Trả access token dùng được cho kênh, tự làm mới khi hết hạn.
 * `onMoi(ch, token)` được gọi khi vừa xoay token, để tầng trên đem đi lưu.
 */
async function tokenCuaKenh(conf, ch, onMoi) {
  if (conHan(ch)) { hideSecret(ch.accessToken); return ch.accessToken; }
  const moi = await lamMoiToken(conf, ch);
  if (onMoi) await onMoi(ch, moi);
  Object.assign(ch, moi);
  return moi.accessToken;
}

/* ---------------- chế độ display ---------------- */

const TRUONG_USER = ['open_id', 'union_id', 'avatar_url', 'display_name', 'username',
  'follower_count', 'following_count', 'likes_count', 'video_count', 'profile_deep_link'];

async function hoSoDisplay(token) {
  const r = await getJson(OPEN + '/user/info/?fields=' + TRUONG_USER.join(','),
    { headers: { Authorization: 'Bearer ' + token }, label: 'TikTok user/info', retries: 2 });
  const err = r.error || {};
  if (err.code && err.code !== 'ok') {
    throw new Error(scrub('TikTok báo lỗi (' + err.code + '): ' + (err.message || '')));
  }
  const u = (r.data && r.data.user) || {};
  return {
    openId: u.open_id || '',
    name: u.display_name || u.username || '',
    handle: u.username || '',
    url: u.profile_deep_link || (u.username ? 'https://tiktok.com/@' + u.username : ''),
    followers: num(u.follower_count),
    likes: num(u.likes_count),
    videos: num(u.video_count),
  };
}

const TRUONG_VIDEO = ['id', 'create_time', 'title', 'video_description', 'duration',
  'cover_image_url', 'share_url', 'view_count', 'like_count', 'comment_count', 'share_count'];

async function videoDisplay(token, tran, from) {
  const out = [];
  let cursor = 0;
  for (let vong = 0; vong < 40 && out.length < tran; vong++) {
    const r = await postJson(OPEN + '/video/list/?fields=' + TRUONG_VIDEO.join(','),
      { cursor, max_count: 20 },
      { headers: { Authorization: 'Bearer ' + token }, label: 'TikTok video/list', retries: 2 });
    const err = r.error || {};
    if (err.code && err.code !== 'ok') {
      throw new Error(scrub('TikTok báo lỗi (' + err.code + '): ' + (err.message || '')));
    }
    const ds = (r.data && r.data.videos) || [];
    out.push(...ds);
    if (!(r.data && r.data.has_more) || !ds.length) break;
    cursor = r.data.cursor;
    /* Danh sách trả về mới nhất trước. Đi qua khỏi mốc `from` là đủ — video cũ
     * hơn không thuộc kỳ đang xét, kéo tiếp chỉ tốn quota. */
    if (from && ds.length && ngayCua(ds[ds.length - 1].create_time) < from) break;
  }
  return out.slice(0, tran);
}

/* ---------------- chế độ business ---------------- */

const TRUONG_BIZ = ['username', 'display_name', 'profile_image', 'followers_count',
  'following_count', 'likes_count', 'video_count', 'video_views', 'profile_views',
  'likes', 'comments', 'shares', 'reach', 'net_followers'];

async function bizGet(token, businessId, from, to) {
  const q = new URLSearchParams({
    business_id: businessId,
    fields: JSON.stringify(TRUONG_BIZ),
  });
  if (from) q.set('start_date', from);
  if (to) q.set('end_date', to);
  const r = await getJson(BIZ + '/get/?' + q, {
    headers: { 'Access-Token': token }, label: 'TikTok business/get', retries: 2,
  });
  if (Number(r.code) !== 0) {
    throw new Error(scrub('TikTok Business báo lỗi (' + r.code + '): ' + (r.message || 'không rõ')));
  }
  return r.data || {};
}

/**
 * Rút chuỗi số liệu theo ngày từ phản hồi business/get.
 *
 * Hình dạng phản hồi của TikTok đã đổi vài lần và tài liệu không thống nhất, nên
 * ở đây chấp nhận cả ba dạng đã gặp: `daily_metrics` (mảng có khoá date),
 * `metrics` là mảng, hoặc `metrics` là object gộp cả kỳ. Dạng cuối không chia
 * được theo ngày nên trả rỗng — tầng trên sẽ dùng đường chênh lệch như display.
 */
function ngayTuBiz(data) {
  const ds = Array.isArray(data.daily_metrics) ? data.daily_metrics
    : (Array.isArray(data.metrics) ? data.metrics : null);
  if (!ds) return [];
  return ds.map((m) => ({
    date: String(m.date || m.stat_time_day || '').slice(0, 10),
    views: num(m.video_views),
    reach: num(m.reach),
    profileViews: num(m.profile_views),
    likes: num(m.likes),
    comments: num(m.comments),
    shares: num(m.shares),
    followers: num(m.followers_count),
    netFollowers: num(m.net_followers),
  })).filter((x) => x.date);
}

const TRUONG_VIDEO_BIZ = ['item_id', 'create_time', 'thumbnail_url', 'share_url', 'caption',
  'video_views', 'likes', 'comments', 'shares', 'reach', 'video_duration',
  'full_video_watched_rate', 'total_time_watched', 'average_time_watched'];

async function videoBiz(token, businessId, tran, from, to) {
  const out = [];
  let cursor = 0;
  for (let vong = 0; vong < 40 && out.length < tran; vong++) {
    const q = new URLSearchParams({
      business_id: businessId,
      fields: JSON.stringify(TRUONG_VIDEO_BIZ),
      max_count: '20',
      cursor: String(cursor),
    });
    if (from) q.set('start_date', from);
    if (to) q.set('end_date', to);
    const r = await getJson(BIZ + '/video/list/?' + q, {
      headers: { 'Access-Token': token }, label: 'TikTok business/video/list', retries: 2,
    });
    if (Number(r.code) !== 0) {
      throw new Error(scrub('TikTok Business báo lỗi (' + r.code + '): ' + (r.message || 'không rõ')));
    }
    const ds = (r.data && (r.data.videos || r.data.list)) || [];
    out.push(...ds);
    if (!(r.data && r.data.has_more) || !ds.length) break;
    cursor = r.data.cursor;
  }
  return out.slice(0, tran);
}

/* ---------------- chuẩn hoá ---------------- */

function dongTrong(extId, d) {
  return {
    platform: PLATFORM, extId: String(extId), date: d, source: NGUON,
    followers: 0, followUp: 0, followDown: 0, views: 0, reach: 0, impressions: 0,
    profileViews: 0, likes: 0, comments: 0, shares: 0, saves: 0,
    engagement: 0, clicks: 0, messages: 0, leads: 0, posts: 0, lives: 0,
  };
}

/* ---------------- điểm vào ---------------- */

/**
 * conf   = khối tiktok của ket-noi.json
 * onMoi(ch, tokenMoi) — gọi khi token vừa xoay, để tầng trên lưu lại.
 */
async function fetchRange(conf, from, to, opts = {}, log = () => {}, onMoi = null) {
  const chs = (conf.channels || []).filter((c) => c && (c.openId || c.businessId));
  if (!chs.length) throw new Error('Chưa khai kênh TikTok nào trong cấu hình kết nối');

  const canhBao = [];
  const ghiChu = [];
  const daily = []; const posts = []; const channels = [];
  let coDisplay = false;

  for (const ch of chs) {
    const ten = ch.name || ch.handle || ch.openId;
    let token;
    try {
      token = await tokenCuaKenh(conf, ch, onMoi);
    } catch (e) {
      canhBao.push('TikTok · ' + ten + ': ' + e.message);
      continue;
    }

    const business = ch.mode === 'business' && (ch.businessId || ch.openId);

    /* --- hồ sơ kênh --- */
    let hs = { openId: ch.openId, name: ten, handle: ch.handle || '', url: '', followers: 0 };
    try {
      if (business) {
        const d = await bizGet(token, ch.businessId || ch.openId, from, to);
        hs = {
          openId: ch.openId,
          name: d.display_name || ten,
          handle: d.username || ch.handle || '',
          url: d.username ? 'https://tiktok.com/@' + d.username : '',
          followers: num(d.followers_count),
        };
        const chuoi = ngayTuBiz(d);
        chuoi.forEach((m) => {
          if (m.date < from || m.date > to) return;
          const row = dongTrong(ch.openId, m.date);
          row.views = m.views; row.reach = m.reach; row.profileViews = m.profileViews;
          row.likes = m.likes; row.comments = m.comments; row.shares = m.shares;
          row.followers = m.followers;
          if (m.netFollowers >= 0) row.followUp = m.netFollowers;
          else row.followDown = Math.abs(m.netFollowers);
          row.engagement = m.likes + m.comments + m.shares;
          daily.push(row);
        });
        if (!chuoi.length) {
          coDisplay = true;
          canhBao.push('TikTok · ' + ten + ': API Business không trả chuỗi theo ngày cho kỳ này — '
            + 'app chuyển sang tính số ngày bằng chênh lệch lượt xem giữa hai lần đồng bộ.');
        }
        log('TikTok · ' + ten + ' (business): ' + chuoi.length + ' ngày');
      } else {
        hs = await hoSoDisplay(token);
        coDisplay = true;
        /* Display API không có lịch sử — chỉ chốt được follower của HÔM NAY.
         * Ghi đúng một dòng cho ngày cuối kỳ, không bịa các ngày trước. */
        const row = dongTrong(ch.openId || hs.openId, to);
        row.followers = hs.followers;
        daily.push(row);
        log('TikTok · ' + ten + ' (display): follower ' + hs.followers);
      }
    } catch (e) {
      canhBao.push('TikTok · ' + ten + ': ' + e.message);
    }

    channels.push({
      platform: PLATFORM,
      extId: String(ch.openId || hs.openId),
      name: ch.name || hs.name || ten,
      handle: hs.handle || ch.handle || '',
      url: hs.url || '',
    });

    /* --- video --- */
    if (opts.layBai !== false) {
      try {
        const tran = opts.soBaiToiDa || 200;
        const ds = business
          ? await videoBiz(token, ch.businessId || ch.openId, tran, from, to)
          : await videoDisplay(token, tran, from);
        ds.forEach((v) => {
          const id = String(v.item_id || v.id || '');
          if (!id) return;
          const d = ngayCua(v.create_time);
          if (from && d && d < from) return;
          if (to && d && d > to) return;
          const likes = num(v.likes != null ? v.likes : v.like_count);
          const cmts = num(v.comments != null ? v.comments : v.comment_count);
          const shares = num(v.shares != null ? v.shares : v.share_count);
          const views = num(v.video_views != null ? v.video_views : v.view_count);
          posts.push({
            platform: PLATFORM,
            extId: String(ch.openId || hs.openId),
            postId: id,
            title: String(v.caption || v.title || v.video_description || '').slice(0, 200),
            publishedAt: v.create_time ? new Date(num(v.create_time) * 1000).toISOString() : '',
            type: 'Video',
            url: v.share_url || '',
            views,
            reach: num(v.reach),
            impressions: 0,
            likes, comments: cmts, shares, saves: 0,
            engagement: likes + cmts + shares,
            clicks: 0,
            avgWatch: num(v.average_time_watched),
            // TikTok trả tỷ lệ dạng 0..1 hoặc 0..100 tuỳ trường; chuẩn về 0..1
            fullWatchRate: (() => {
              const x = num(v.full_video_watched_rate);
              return x > 1 ? x / 100 : x;
            })(),
            source: NGUON,
          });
        });
        log('TikTok · ' + ten + ': ' + ds.length + ' video');
      } catch (e) {
        canhBao.push('TikTok video · ' + ten + ': ' + e.message);
      }
    }
  }

  /* Hai câu dưới là GHI CHÚ, không phải cảnh báo: chúng đúng ở mọi lượt chạy, mãi
   * mãi. Trộn vào cảnh báo thì cột Kết quả trong Nhật ký không bao giờ ra "Thành
   * công" nữa — mà một cột lúc nào cũng vàng thì chẳng ai còn nhìn nó. */
  ghiChu.push('TikTok không mở API cho LIVE — LIVE-view / LIVE-theo dõi / LIVE-bình luận '
    + 'phải nhập tay hoặc nhập từ file xuất của LIVE Center.');
  if (coDisplay) {
    ghiChu.push('Có kênh TikTok chạy chế độ display: lượt xem nền tảng trả về là TỔNG ĐỜI của '
      + 'video, nên số theo ngày được tính bằng phần tăng thêm so với lần đồng bộ trước. '
      + 'Lần chạy đầu tiên chưa có mốc so sánh nên số ngày sẽ bằng 0.');
  }

  return { channels, daily, posts, lives: [], canhBao, ghiChu, coDisplay };
}

async function test(conf, onMoi = null) {
  const chs = (conf.channels || []).filter((c) => c && (c.openId || c.businessId));
  if (!chs.length) return { ok: false, message: 'Chưa khai kênh TikTok nào' };
  const results = [];
  for (const ch of chs) {
    const ten = ch.name || ch.handle || ch.openId;
    try {
      const token = await tokenCuaKenh(conf, ch, onMoi);
      if (ch.mode === 'business' && (ch.businessId || ch.openId)) {
        const d = await bizGet(token, ch.businessId || ch.openId, '', '');
        results.push({
          account: ch.openId, ok: true, name: d.display_name || ten,
          followers: num(d.followers_count), che_do: 'business',
        });
      } else {
        const hs = await hoSoDisplay(token);
        results.push({
          account: ch.openId, ok: true, name: hs.name || ten,
          followers: hs.followers, che_do: 'display',
        });
      }
    } catch (e) {
      results.push({ account: ch.openId, ok: false, name: ten, message: e.message });
    }
  }
  return { ok: results.some((r) => r.ok), results };
}

module.exports = {
  PLATFORM, NGUON, fetchRange, test,
  lamMoiToken, tokenCuaKenh, hoSoDisplay, videoDisplay, bizGet, ngayTuBiz,
  doiMa, linkCapQuyen, PHAM_VI,
};
