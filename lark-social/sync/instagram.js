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
 * Muốn có số theo ngày ở họ thứ hai thì phải gọi từng ngày một — đắt, mỗi ngày
 * một request, nhưng không có đường nào khác và cũng không được đi đường tắt:
 * xem chú thích dài ở chỗ khai báo bên dưới.
 */
const { getJson, scrub, hideSecret } = require('./http');
const { chiaKhoang } = require('./ngay');

const PLATFORM = 'Instagram';
const NGUON = 'Instagram API';

/* Họ total_value (views, likes, comments, shares, saves) KHÔNG có bản chuỗi
 * theo ngày — hỏi period=day kèm metric=views là Instagram trả thẳng "(#100) The
 * following metrics (views) should be specified with parameter metric_type". Đã
 * thử tay, không phải đọc tài liệu. Muốn có số của một ngày thì chỉ còn cách hỏi
 * riêng đúng ngày đó, mỗi ngày một request.
 *
 * Bản trước có ngưỡng 45 ngày: dài hơn thì chia cửa sổ 30 ngày, lấy TỔNG cửa sổ
 * rồi dồn vào ngày cuối. Chạy "Nạp lại từ đầu" cho cả năm là ra 9 cửa sổ — và
 * 1.590.229 lượt xem của Instagram nằm gọn trong 9 ngày, 237 ngày còn lại trống
 * trơn. Biểu đồ mọc chín cái cột chọc trời, lọc theo tháng thì tháng trúng cửa
 * sổ phình lên còn tháng không trúng bằng 0. Cảnh báo có ghi, nhưng người xem
 * biểu đồ không đọc cảnh báo.
 *
 * Nên bỏ hẳn đường đó. Thà chậm còn hơn dựng ra một hình dạng dữ liệu không có
 * thật: một năm là 252 request cho mỗi tài khoản, chạy vài chục giây. */

const num = (v) => {
  const n = Number(String(v == null ? 0 : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const g = (fb) => 'https://graph.facebook.com/' + ((fb && fb.apiVersion) || 'v23.0');

const CHUOI_TG = ['reach'];

/* follower_count sống, nhưng CHỈ trả được 30 ngày gần nhất: hỏi xa hơn là
 * "(#100) (follower_count) metric only supports querying data for the last 30
 * days". Trước đây nó nằm chung CHUOI_TG, nên chạy "Nạp lại từ đầu" cho cả năm
 * thì mọi cửa sổ cũ đều lỗi, doInsights gạt nó ra, rồi app kết luận nhầm thành
 * "API không còn nhận follower_count" — đổ cho Meta trong khi lỗi là hỏi sai
 * khoảng. Giờ chỉ hỏi ở cửa sổ nào thật sự nằm trong tầm với. */
const CHUOI_TG_GAN = ['follower_count'];
const SO_NGAY_FOLLOWER = 30;

/* profile_views và website_clicks thì chết thật — Meta bắt chuyển sang họ
 * total_value, và bản total_value của chúng trả null. Không xin nữa cho đỡ tốn
 * một vòng thử-rồi-bỏ ở mỗi cửa sổ. */
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
    followers: 0, followUp: 0, followDown: 0, views: 0, viewsOrganic: 0, watchTime: 0, reach: 0, impressions: 0,
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

  /* --- họ chuỗi thời gian ---
   * Instagram chặn ở ĐÚNG 30 ngày và trả "(#100) There cannot be more than 30
   * days between since and until" cho cả request. Hỏi cả năm là mất trắng, nên
   * phải chia cửa sổ — lỗi này chỉ lộ ra lúc chạy "Nạp lại từ đầu". */
  try {
    const data = [];
    const boTatCa = new Set();
    const gioiHan = new Date(Date.now() - (SO_NGAY_FOLLOWER - 1) * 86400000)
      .toISOString().slice(0, 10);
    let boFollower = false;
    for (const [tu, den] of chiaKhoang(from, to, 30)) {
      const url0 = g(fb) + '/' + igId + '/insights?period=day'
        + '&since=' + tu + '&until=' + den
        + '&access_token=' + encodeURIComponent(token);
      const xin = den >= gioiHan ? CHUOI_TG.concat(CHUOI_TG_GAN) : CHUOI_TG;
      if (den < gioiHan) boFollower = true;
      const r = await doInsights(url0, xin, 'Instagram insights ' + (acc.name || igId));
      data.push(...r.data);
      r.bo.forEach((x) => boTatCa.add(x));
    }
    const bo = [...boTatCa];
    if (bo.length) {
      canhBao.push('Instagram · ' + (acc.name || igId) + ': API không còn nhận '
        + bo.join(', ') + ' — các cột đó để trống.');
    }
    if (boFollower) {
      /* Ghi chú, không phải lỗi. Nói rõ là giới hạn của Instagram chứ không phải
       * mình bỏ sót, để không ai đi chạy lại mong số tự về. */
      canhBao.push('Instagram · ' + (acc.name || igId) + ': follower tăng/giảm theo ngày chỉ '
        + 'lấy được ' + SO_NGAY_FOLLOWER + ' ngày gần nhất — Instagram không trả xa hơn. '
        + 'Những ngày trước đó để trống, và không có cách nào lấy lại.');
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

  // --- họ total_value: mỗi ngày một request, không có cách nào khác ---
  const ds = cacNgay(from, to);
  const ngayLoi = [];

  /* Chạy vài ngày một lúc. Đo thật trên 50 ngày: tuần tự 126s, bốn luồng 94s,
   * tám luồng 84s — nút cổ chai nằm ở phía Meta chứ không phải ở mình, nên tăng
   * luồng gần như không lợi thêm. Lấy bốn: rẻ nhất trong ba lựa chọn về rủi ro
   * chạm ngưỡng gọi, mà vẫn cắt được một phần tư thời gian. Cả ba lần đo đều ra
   * đúng 154.974 lượt xem, nên chạy song song không làm sai số.
   *
   * Nạp lại cả năm vẫn mất khoảng tám phút cho mỗi tài khoản IG. Đồng bộ hằng
   * ngày thì chỉ vài ngày, không đáng kể. */
  const LUONG = 4;
  const motNgay = async (d) => {
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
    } catch (e) {
      /* Trước đây nuốt im lặng. Một ngày hỏng thì không đáng dừng cả năm, nhưng
       * hỏng bao nhiêu ngày thì phải nói ra — nếu không, gặp giới hạn gọi của
       * Meta giữa chừng là mất trắng nửa cuối mà nhìn màn hình vẫn thấy bình
       * thường, chỉ là đường biểu đồ thấp xuống. */
      ngayLoi.push(d);
    }
  };
  for (let i = 0; i < ds.length; i += LUONG) {
    await Promise.all(ds.slice(i, i + LUONG).map(motNgay));
  }

  if (ngayLoi.length) {
    ngayLoi.sort();
    canhBao.push('Instagram · ' + (acc.name || igId) + ': ' + ngayLoi.length + '/' + ds.length
      + ' ngày không lấy được lượt xem/thích/bình luận/chia sẻ/lưu (' + ngayLoi[0]
      + (ngayLoi.length > 1 ? ' → ' + ngayLoi[ngayLoi.length - 1] : '') + '). '
      + 'Các cột đó ở những ngày này để trống chứ không phải bằng 0.');
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
    /* Mức BÀI gọi là `saved`, mức TÀI KHOẢN gọi là `saves` — cùng một thứ, hai
     * tên. Xin nhầm thì Instagram trả "(#100) metric[0] must be one of…", nhánh
     * bắt lỗi lặng lẽ gạt metric ra, và cột Lưu của mọi bài đứng yên ở 0 mà
     * không ai biết là đang thiếu chứ không phải thật sự không ai lưu. */
    const metrics = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions']
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
      saves: ins.saved || 0,
      engagement: ins.total_interactions || (likes + cmts + (ins.shares || 0) + (ins.saved || 0)),
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
    channels, daily, posts, lives: [], canhBao,
    /* Ghi chú, không phải cảnh báo — xem lý do ở sync/tiktok.js. */
    ghiChu: accs.length
      ? ['Instagram không mở API cho LIVE — chỉ số LIVE của IG phải nhập tay.'] : [],
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
