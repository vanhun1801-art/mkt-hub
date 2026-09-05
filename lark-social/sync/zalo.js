'use strict';
/**
 * Adapter Zalo OA — Zalo Open API.
 *
 * NÓI TRƯỚC CHO RÕ, để không ai ngồi chờ số không bao giờ về:
 * Zalo mở API hẹp hơn hẳn Meta và TikTok. Lấy được chắc chắn:
 *   - tổng follower hiện tại        (/v2.0/oa/getoa, /v2.0/oa/getfollowers)
 *   - số hội thoại gần đây          (/v2.0/oa/listrecentchat)
 *   - danh sách bài viết của OA     (/v2.0/article/getslice)
 * Còn LƯỢT XEM từng bài thì tuỳ gói dịch vụ và tuỳ thời điểm Zalo có trả hay
 * không — adapter đọc mọi tên trường đã từng thấy (total_view / view / views…),
 * không thấy thì để 0 và ghi cảnh báo, chứ không đoán.
 *
 * Zalo cũng KHÔNG có API chuỗi theo ngày: không có endpoint nào cho "ngày 12/3
 * có bao nhiêu follower". App vì thế chốt một dòng cho ngày cuối kỳ mỗi lần chạy;
 * chạy đều mỗi ngày thì tự nhiên có lịch sử.
 *
 * TOKEN: access token sống 1 giờ, refresh token 3 tháng và DÙNG MỘT LẦN —
 * mỗi lần làm mới là Zalo huỷ cái cũ. Bắt buộc phải lưu bản mới lại
 * (ketnoi.luuToken → kho khoá mã hoá trên Base), nếu không thì sau đúng một giờ
 * kênh chết và không ai biết vì sao.
 */
const { getJson, request, scrub, hideSecret } = require('./http');

const PLATFORM = 'Zalo OA';
const NGUON = 'Zalo API';

const OAUTH = 'https://oauth.zaloapp.com/v4/oa/access_token';
const API = 'https://openapi.zalo.me/v2.0';

const num = (v) => {
  const n = Number(String(v == null ? 0 : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Zalo báo lỗi bằng `error` khác 0 kèm `message`, kể cả khi HTTP là 200. */
function neuLoi(r, nhan) {
  if (r && Number(r.error) !== 0 && r.error !== undefined) {
    throw new Error(scrub(nhan + ' — Zalo báo lỗi (' + r.error + '): ' + (r.message || 'không rõ')));
  }
  return r;
}

/* ---------------- token ---------------- */

async function goiOauth(conf, body, nhan) {
  if (!conf.appId || !conf.secretKey) throw new Error('Chưa khai appId / secretKey của Zalo');
  hideSecret(conf.secretKey);
  const r = await request(OAUTH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      secret_key: conf.secretKey,
    },
    body: new URLSearchParams(body).toString(),
    label: nhan, retries: 2,
  });
  let j = {};
  try { j = JSON.parse(r.text); } catch (_) {}
  if (!j.access_token) {
    throw new Error(scrub(nhan + ': ' + (j.error_description || j.message || j.error || r.text.slice(0, 200))));
  }
  hideSecret(j.access_token);
  hideSecret(j.refresh_token);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || '',
    expiresAt: Date.now() + Math.max(60, num(j.expires_in) - 120) * 1000,
  };
}

/** Đổi oauth_code (lấy tay ở trang quản trị OA) sang cặp token. Chạy một lần. */
async function doiMa(conf, code, codeVerifier = '') {
  const body = { code, app_id: conf.appId, grant_type: 'authorization_code' };
  if (codeVerifier) body.code_verifier = codeVerifier;
  return goiOauth(conf, body, 'Zalo đổi mã');
}

async function lamMoiToken(conf, oa) {
  if (!oa.refreshToken) throw new Error('OA ' + (oa.name || oa.oaId) + ' chưa có refreshToken');
  hideSecret(oa.refreshToken);
  return goiOauth(conf, {
    refresh_token: oa.refreshToken, app_id: conf.appId, grant_type: 'refresh_token',
  }, 'Zalo làm mới token');
}

const conHan = (oa) => Boolean(oa.accessToken) && num(oa.expiresAt) > Date.now();

async function tokenCuaOa(conf, oa, onMoi) {
  if (conHan(oa)) { hideSecret(oa.accessToken); return oa.accessToken; }
  const moi = await lamMoiToken(conf, oa);
  if (onMoi) await onMoi(oa, moi);
  Object.assign(oa, moi);
  return moi.accessToken;
}

/* ---------------- các lời gọi ---------------- */

const dau = (token) => ({ access_token: token });

async function thongTinOa(token) {
  const r = await getJson(API + '/oa/getoa', { headers: dau(token), label: 'Zalo getoa', retries: 2 });
  neuLoi(r, 'Zalo getoa');
  const d = r.data || {};
  return {
    oaId: String(d.oa_id || ''),
    name: d.name || '',
    followers: num(d.num_follower != null ? d.num_follower : d.total_follower),
    goi: d.package_name || '',
    xacThuc: Boolean(d.is_verified),
  };
}

/** Tổng follower theo đường thứ hai — dùng khi getoa không trả num_follower. */
async function tongFollower(token) {
  const r = await getJson(API + '/oa/getfollowers?data=' + encodeURIComponent(JSON.stringify({ offset: 0, count: 1 })),
    { headers: dau(token), label: 'Zalo getfollowers', retries: 2 });
  neuLoi(r, 'Zalo getfollowers');
  return num((r.data || {}).total);
}

/** Số hội thoại gần đây — thước đo tin nhắn vào, dùng thay cột "Tin nhắn". */
async function soHoiThoai(token, tran = 200) {
  let tong = 0;
  for (let offset = 0; offset < tran; offset += 50) {
    const r = await getJson(API + '/oa/listrecentchat?data='
      + encodeURIComponent(JSON.stringify({ offset, count: 50 })),
      { headers: dau(token), label: 'Zalo listrecentchat', retries: 1 });
    neuLoi(r, 'Zalo listrecentchat');
    const ds = (r.data || []).length ? r.data : ((r.data || {}).items || []);
    tong += ds.length;
    if (ds.length < 50) break;
  }
  return tong;
}

/** Lượt xem: Zalo đặt tên trường không nhất quán giữa các gói/API. Thử hết. */
const layView = (o) => num(o.total_view != null ? o.total_view
  : (o.view != null ? o.view : (o.views != null ? o.views : o.total_views)));

async function baiViet(token, tran, from, to, canhBao) {
  const out = [];
  let thieuView = false;
  for (let offset = 0; offset < tran; offset += 10) {
    let r;
    try {
      r = await getJson(API + '/article/getslice?data='
        + encodeURIComponent(JSON.stringify({ offset, limit: 10, type: 'normal' })),
        { headers: dau(token), label: 'Zalo article/getslice', retries: 1 });
      neuLoi(r, 'Zalo article/getslice');
    } catch (e) {
      canhBao.push('Zalo OA: không đọc được danh sách bài viết — ' + e.message
        + ' (thường do gói OA chưa mở quyền bài viết)');
      break;
    }
    const d = r.data || {};
    const ds = d.medias || d.articles || d.items || [];
    if (!ds.length) break;
    for (const a of ds) {
      const ts = num(a.create_date || a.created_date || a.time);
      // Zalo trả mili-giây ở chỗ này, giây ở chỗ khác — chuẩn hoá theo độ dài
      const ms = ts > 1e12 ? ts : ts * 1000;
      const d0 = ts ? new Date(ms).toISOString().slice(0, 10) : '';
      if (from && d0 && d0 < from) return out;
      if (to && d0 && d0 > to) continue;
      const view = layView(a);
      if (!view) thieuView = true;
      out.push({
        id: String(a.id || a.token || ''),
        title: String(a.title || a.description || '').slice(0, 200),
        publishedAt: ts ? new Date(ms).toISOString() : '',
        url: a.link || a.url || '',
        views: view,
        likes: num(a.total_like || a.like),
        comments: num(a.total_comment || a.comment),
        shares: num(a.total_share || a.share),
        type: a.type === 'video' ? 'Video' : 'Bài viết',
      });
    }
    if (ds.length < 10) break;
  }
  if (thieuView && out.length) {
    canhBao.push('Zalo OA: có bài viết Zalo không trả lượt xem qua API (tuỳ gói dịch vụ) — '
      + 'cột Lượt xem của những bài đó để 0, cần nhập tay nếu muốn đủ KPI.');
  }
  return out;
}

/* ---------------- điểm vào ---------------- */

async function fetchRange(conf, from, to, opts = {}, log = () => {}, onMoi = null) {
  const oas = (conf.oas || []).filter((o) => o && (o.oaId || o.refreshToken));
  if (!oas.length) throw new Error('Chưa khai OA Zalo nào trong cấu hình kết nối');

  const canhBao = [];
  const ghiChu = [];
  const daily = []; const posts = []; const channels = [];

  for (const oa of oas) {
    const ten = oa.name || oa.oaId;
    let token;
    try {
      token = await tokenCuaOa(conf, oa, onMoi);
    } catch (e) {
      canhBao.push('Zalo OA · ' + ten + ': ' + e.message);
      continue;
    }

    let tt = { oaId: oa.oaId, name: ten, followers: 0 };
    try { tt = await thongTinOa(token); } catch (e) {
      canhBao.push('Zalo OA · ' + ten + ': ' + e.message);
    }
    if (!tt.followers) {
      try { tt.followers = await tongFollower(token); } catch (_) { /* đường dự phòng, im lặng */ }
    }
    const id = tt.oaId || oa.oaId || '';

    channels.push({
      platform: PLATFORM, extId: String(id), name: oa.name || tt.name || ten,
      handle: '', url: id ? 'https://zalo.me/' + id : '',
    });

    const row = {
      platform: PLATFORM, extId: String(id), date: to, source: NGUON,
      followers: tt.followers, followUp: 0, followDown: 0,
      views: 0, reach: 0, impressions: 0, profileViews: 0,
      likes: 0, comments: 0, shares: 0, saves: 0, engagement: 0,
      clicks: 0, messages: 0, leads: 0, posts: 0, lives: 0,
    };
    try { row.messages = await soHoiThoai(token); } catch (e) {
      canhBao.push('Zalo OA · ' + ten + ': không đếm được hội thoại — ' + e.message);
    }

    if (opts.layBai !== false) {
      try {
        const ds = await baiViet(token, opts.soBaiToiDa || 100, from, to, canhBao);
        ds.forEach((a) => {
          row.views += a.views; row.likes += a.likes;
          row.comments += a.comments; row.shares += a.shares;
          posts.push({
            platform: PLATFORM, extId: String(id), postId: a.id,
            title: a.title, publishedAt: a.publishedAt, type: a.type, url: a.url,
            views: a.views, reach: 0, impressions: 0,
            likes: a.likes, comments: a.comments, shares: a.shares, saves: 0,
            engagement: a.likes + a.comments + a.shares,
            clicks: 0, avgWatch: 0, fullWatchRate: 0, source: NGUON,
          });
        });
        row.posts = ds.length;
        row.engagement = row.likes + row.comments + row.shares;
        log('Zalo OA · ' + ten + ': ' + ds.length + ' bài, ' + tt.followers + ' follower');
      } catch (e) {
        canhBao.push('Zalo OA bài · ' + ten + ': ' + e.message);
      }
    }

    daily.push(row);
  }

  /* Ghi chú, không phải cảnh báo — xem lý do ở sync/tiktok.js. */
  ghiChu.push('Zalo không có API chuỗi theo ngày — mỗi lượt đồng bộ chốt số của ngày cuối kỳ. '
    + 'Chạy tự động hằng ngày thì lịch sử tự đầy lên.');

  return { channels, daily, posts, lives: [], canhBao, ghiChu };
}

async function test(conf, onMoi = null) {
  const oas = (conf.oas || []).filter((o) => o && (o.oaId || o.refreshToken));
  if (!oas.length) return { ok: false, message: 'Chưa khai OA Zalo nào' };
  const results = [];
  for (const oa of oas) {
    const ten = oa.name || oa.oaId;
    try {
      const token = await tokenCuaOa(conf, oa, onMoi);
      const tt = await thongTinOa(token);
      results.push({ account: tt.oaId || oa.oaId, ok: true, name: tt.name || ten, followers: tt.followers, goi: tt.goi });
    } catch (e) {
      results.push({ account: oa.oaId, ok: false, name: ten, message: e.message });
    }
  }
  return { ok: results.some((r) => r.ok), results };
}

module.exports = { PLATFORM, NGUON, fetchRange, test, doiMa, lamMoiToken, tokenCuaOa, thongTinOa };
