'use strict';
/**
 * Nhạc trưởng của việc đồng bộ: gọi từng adapter, chuẩn hoá, rồi ghi vào Base.
 *
 * Việc khó nhất ở đây không phải gọi API mà là câu hỏi: "lượt xem của NGÀY HÔM
 * NAY là bao nhiêu?"
 *
 *   - Facebook và Instagram trả sẵn chuỗi theo ngày → dùng thẳng.
 *   - TikTok chế độ business cũng có chuỗi theo ngày → dùng thẳng.
 *   - TikTok chế độ display và Zalo thì KHÔNG: chúng chỉ trả tổng đời của từng
 *     bài. Cộng thẳng vào một ngày là sai — video đăng tháng trước có 1 triệu
 *     view sẽ đội hết vào hôm nay, tháng nào cũng thế.
 *
 * Cách xử lý ở chenhLech(): so bản vừa lấy với bản đã lưu trong bảng Bài đăng,
 * lấy phần TĂNG THÊM làm số của ngày. Bài chưa từng thấy mà đăng trong kỳ thì
 * tính trọn (đúng, vì cả lượt xem đó đều kiếm được trong kỳ); bài chưa từng thấy
 * mà đăng trước kỳ thì tính 0 — không có mốc so sánh thì thà thiếu còn hơn bịa.
 */
const cfg = require('../config');
const store = require('../store');
const ketnoi = require('../ketnoi');
const facebook = require('./facebook');
const instagram = require('./instagram');
const tiktok = require('./tiktok');
const zalo = require('./zalo');

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Cộng dồn hai dòng cùng (kênh, ngày) từ hai nguồn khác nhau. */
const CONG = ['views', 'reach', 'impressions', 'profileViews', 'likes', 'comments',
  'shares', 'saves', 'engagement', 'clicks', 'messages', 'leads', 'posts', 'lives',
  'followUp', 'followDown'];

function gopDong(a, b) {
  const out = { ...a };
  CONG.forEach((k) => { out[k] = num(a[k]) + num(b[k]); });
  // Follower là số chốt, không phải số cộng
  out.followers = Math.max(num(a.followers), num(b.followers));
  return out;
}

/* ---------------- chênh lệch cho nguồn luỹ kế ---------------- */

/**
 * Tính số của ngày từ mức tăng của từng bài.
 *
 * baiCu   : Map 'platform#postId' -> bản đã lưu trong Base
 * baiMoi  : mảng bài vừa lấy về
 * ngay    : ngày gán số vào
 * chiKenh : Set extId của những kênh cần tính kiểu này (display/Zalo)
 */
function chenhLech(baiCu, baiMoi, ngay, from, chiKenh) {
  const theoKenh = new Map();
  for (const b of baiMoi) {
    if (chiKenh && !chiKenh.has(String(b.extId))) continue;
    const khoa = b.platform + '#' + b.postId;
    const cu = baiCu.get(khoa);
    const ngayDang = String(b.publishedAt || '').slice(0, 10);

    let d;
    if (cu) {
      d = {
        views: Math.max(0, num(b.views) - num(cu.views)),
        likes: Math.max(0, num(b.likes) - num(cu.likes)),
        comments: Math.max(0, num(b.comments) - num(cu.comments)),
        shares: Math.max(0, num(b.shares) - num(cu.shares)),
        saves: Math.max(0, num(b.saves) - num(cu.saves)),
        moi: 0,
      };
    } else if (ngayDang && from && ngayDang >= from) {
      d = {
        views: num(b.views), likes: num(b.likes), comments: num(b.comments),
        shares: num(b.shares), saves: num(b.saves), moi: 1,
      };
    } else {
      // Chưa có mốc so sánh và bài đăng trước kỳ — bỏ qua, đừng đội số.
      continue;
    }

    if (!theoKenh.has(b.extId)) {
      theoKenh.set(b.extId, {
        platform: b.platform, extId: b.extId, date: ngay, source: b.source,
        followers: 0, followUp: 0, followDown: 0, views: 0, reach: 0, impressions: 0,
        profileViews: 0, likes: 0, comments: 0, shares: 0, saves: 0,
        engagement: 0, clicks: 0, messages: 0, leads: 0, posts: 0, lives: 0,
      });
    }
    const r = theoKenh.get(b.extId);
    r.views += d.views; r.likes += d.likes; r.comments += d.comments;
    r.shares += d.shares; r.saves += d.saves; r.posts += d.moi;
    r.engagement += d.likes + d.comments + d.shares + d.saves;
  }
  return [...theoKenh.values()];
}

/* ---------------- gọi các adapter ---------------- */

/** Trả hàm layToken(pageId) cho Instagram — token của IG chính là token của Page. */
function taoLayToken(confFb) {
  let ds = null;
  return async (pageId) => {
    const p0 = (confFb.pages || []).find((p) => String(p.id) === String(pageId));
    if (p0 && p0.token) return p0.token;
    if (!ds) ds = await facebook.danhSachPage(confFb);
    const p = ds.find((x) => x.id === String(pageId));
    if (!p || !p.token) throw new Error('không thấy Page ' + pageId + ' trong token hiện tại');
    return p.token;
  };
}

/**
 * Kéo số từ mọi nền tảng đang bật.
 * `chi` (tuỳ chọn) = tên nền tảng để chỉ chạy một cái, vd 'Facebook'.
 */
async function keoVe(conf, from, to, opts = {}, log = () => {}, chi = '') {
  const goi = [];
  const canhBao = [];
  const kenhDisplay = new Set();   // kênh dùng nguồn luỹ kế → phải tính chênh lệch

  const chay = async (ten, fn) => {
    if (chi && chi !== ten) return;
    try {
      const r = await fn();
      goi.push(r);
      if (r.canhBao) canhBao.push(...r.canhBao);
    } catch (e) {
      canhBao.push(ten + ': ' + e.message);
      log(ten + ' lỗi: ' + e.message);
    }
  };

  if (conf.facebook && conf.facebook.enabled) {
    await chay('Facebook', () => facebook.fetchRange(conf.facebook, from, to, opts, log));
  }
  if (conf.instagram && conf.instagram.enabled) {
    await chay('Instagram', () => instagram.fetchRange(
      conf.instagram, conf.facebook || {}, taoLayToken(conf.facebook || {}), from, to, opts, log));
  }
  if (conf.tiktok && conf.tiktok.enabled) {
    const luu = async () => {
      // Token vừa xoay — lưu ngay, đừng đợi hết lượt đồng bộ rồi mới lưu:
      // lượt đồng bộ có thể chết giữa chừng và refresh token cũ đã bị huỷ.
      await ketnoi.luuToken('tiktok', conf.tiktok.channels);
    };
    await chay('TikTok', async () => {
      const r = await tiktok.fetchRange(conf.tiktok, from, to, opts, log,
        async (ch, moi) => { Object.assign(ch, moi); await luu(); });
      (conf.tiktok.channels || []).forEach((c) => {
        if (c.mode !== 'business') kenhDisplay.add(String(c.openId));
      });
      if (r.coDisplay === false) { /* business trả chuỗi ngày đủ — không cần chênh lệch */ }
      return r;
    });
  }
  if (conf.zalo && conf.zalo.enabled) {
    await chay('Zalo OA', async () => {
      const r = await zalo.fetchRange(conf.zalo, from, to, opts, log,
        async (oa, moi) => {
          Object.assign(oa, moi);
          await ketnoi.luuToken('zalo', conf.zalo.oas);
        });
      /* Zalo trả lượt xem luỹ kế của bài, và adapter đã cộng thẳng vào dòng ngày.
       * Bỏ phần cộng đó đi, để chenhLech() tính lại cho đúng. */
      (r.daily || []).forEach((d) => {
        d.views = 0; d.likes = 0; d.comments = 0; d.shares = 0; d.engagement = 0; d.posts = 0;
        kenhDisplay.add(String(d.extId));
      });
      return r;
    });
  }

  const channels = []; const daily = []; const posts = []; const lives = [];
  goi.forEach((r) => {
    channels.push(...(r.channels || []));
    daily.push(...(r.daily || []));
    posts.push(...(r.posts || []));
    lives.push(...(r.lives || []));
  });

  return { channels, daily, posts, lives, canhBao, kenhDisplay };
}

/* ---------------- ghi vào Base ---------------- */

function dongDaily(row, kenhId) {
  const f = store.T.daily.f;
  const o = {
    [f.key]: row.extId + '#' + row.date,
    [f.date]: store.ngayVeBase(row.date),
    [f.platform]: row.platform,
    [f.followers]: num(row.followers),
    [f.followUp]: num(row.followUp),
    [f.followDown]: num(row.followDown),
    [f.views]: num(row.views),
    [f.reach]: num(row.reach),
    [f.impressions]: num(row.impressions),
    [f.profileViews]: num(row.profileViews),
    [f.likes]: num(row.likes),
    [f.comments]: num(row.comments),
    [f.shares]: num(row.shares),
    [f.saves]: num(row.saves),
    [f.engagement]: num(row.engagement),
    [f.clicks]: num(row.clicks),
    [f.messages]: num(row.messages),
    [f.leads]: num(row.leads),
    [f.posts]: num(row.posts),
    [f.lives]: num(row.lives),
    [f.source]: row.source,
  };
  if (kenhId) o[f.channel] = [{ id: kenhId }];
  return o;
}

function dongPost(row, kenhId) {
  const f = store.T.post.f;
  const o = {
    [f.key]: row.platform + '#' + row.postId,
    [f.title]: row.title || '',
    [f.platform]: row.platform,
    [f.extId]: String(row.postId),
    [f.type]: row.type || 'Bài viết',
    [f.url]: row.url || '',
    [f.views]: num(row.views),
    [f.reach]: num(row.reach),
    [f.impressions]: num(row.impressions),
    [f.likes]: num(row.likes),
    [f.comments]: num(row.comments),
    [f.shares]: num(row.shares),
    [f.saves]: num(row.saves),
    [f.engagement]: num(row.engagement),
    [f.avgWatch]: num(row.avgWatch),
    [f.fullWatchRate]: num(row.fullWatchRate),
    [f.source]: row.source,
  };
  const t = store.gioVeBase(row.publishedAt);
  if (t) o[f.publishedAt] = t;
  /* Tỷ lệ tương tác: tính ở đây, không nhờ formula của Base — cùng lý do với app
   * quảng cáo, và để một định nghĩa duy nhất dùng chung cho cả giao diện. */
  const mau = num(row.reach) || num(row.views);
  o[f.engRate] = mau ? num(row.engagement) / mau : 0;
  if (kenhId) o[f.channel] = [{ id: kenhId }];
  return o;
}

function dongLive(row, kenhId) {
  const f = store.T.live.f;
  const o = {
    [f.key]: row.platform + '#' + row.liveId,
    [f.title]: row.title || '',
    [f.platform]: row.platform,
    [f.extId]: String(row.liveId),
    [f.minutes]: num(row.minutes),
    [f.views]: num(row.views),
    [f.peak]: num(row.peak),
    [f.comments]: num(row.comments),
    [f.likes]: num(row.likes),
    [f.shares]: num(row.shares),
    [f.newFollows]: num(row.newFollows),
    [f.url]: row.url || '',
    [f.source]: row.source,
  };
  const b = store.gioVeBase(row.start);
  const k = store.gioVeBase(row.end);
  if (b) o[f.start] = b;
  if (k) o[f.end] = k;
  if (kenhId) o[f.channel] = [{ id: kenhId }];
  return o;
}

/**
 * Một lượt đồng bộ đầy đủ: kéo → tính chênh lệch → ghi Base → ghi nhật ký.
 */
async function dongBo({ from, to, chi = '', log = () => {} } = {}) {
  const batDau = Date.now();
  const conf = await ketnoi.doc();
  const opts = conf.dongBo || {};

  const den = to || store.homNay();
  const tu = from || store.themNgay(den, -(num(opts.soNgayLui) || 7) + 1);

  log('Đồng bộ ' + tu + ' → ' + den + (chi ? ' (chỉ ' + chi + ')' : ''));

  const r = await keoVe(conf, tu, den, opts, log, chi);

  /* Bài đăng trước: dòng ngày của nguồn luỹ kế phải so với bản CŨ trong Base,
   * nên phải đọc bảng Bài đăng TRƯỚC khi ghi đè nó. Đảo thứ tự là chênh lệch
   * luôn bằng 0 và mọi kênh TikTok/Zalo im lìm mãi mãi. */
  const d0 = await store.tai(true);
  const baiCu = new Map(d0.posts.map((p) => [p.key, p]));

  const buChenh = r.kenhDisplay.size
    ? chenhLech(baiCu, r.posts, den, tu, r.kenhDisplay)
    : [];

  // Gộp mọi dòng ngày theo (kênh, ngày)
  const gop = new Map();
  [...r.daily, ...buChenh].forEach((row) => {
    if (!row.extId || !row.date) return;
    const k = row.extId + '#' + row.date;
    gop.set(k, gop.has(k) ? gopDong(gop.get(k), row) : row);
  });

  // Đếm số bài / số phiên LIVE theo ngày đăng
  r.posts.forEach((p) => {
    const d = String(p.publishedAt || '').slice(0, 10);
    if (!d || d < tu || d > den) return;
    const k = p.extId + '#' + d;
    if (gop.has(k)) gop.get(k).posts = num(gop.get(k).posts) + 1;
  });
  r.lives.forEach((l) => {
    const d = String(l.start || '').slice(0, 10);
    if (!d || d < tu || d > den) return;
    const k = l.extId + '#' + d;
    if (gop.has(k)) gop.get(k).lives = num(gop.get(k).lives) + 1;
  });

  // Kênh phải có trước, vì ba bảng kia đều link sang nó
  const mapKenh = await store.baoDamKenh(r.channels);

  const kq = { daily: null, posts: null, lives: null };
  const dsDaily = [...gop.values()].map((row) => dongDaily(row, mapKenh[row.extId]));
  if (dsDaily.length) kq.daily = await store.ghiTheoKhoa('daily', dsDaily, (x) => x[store.T.daily.f.key]);

  if (r.posts.length) {
    const ds = r.posts.map((p) => dongPost(p, mapKenh[p.extId]));
    kq.posts = await store.ghiTheoKhoa('post', ds, (x) => x[store.T.post.f.key]);
  }
  if (r.lives.length) {
    const ds = r.lives.map((l) => dongLive(l, mapKenh[l.extId]));
    kq.lives = await store.ghiTheoKhoa('live', ds, (x) => x[store.T.live.f.key]);
  }

  const giay = Math.round((Date.now() - batDau) / 1000);
  const coSo = dsDaily.length + r.posts.length + r.lives.length;
  const ketQua = r.canhBao.length && !coSo ? 'Lỗi' : (r.canhBao.length ? 'Một phần' : 'Thành công');

  await store.ghiNhatKy({
    platform: chi || 'Tất cả', from: tu, to: den, result: ketQua,
    rowsDaily: dsDaily.length, rowsPost: r.posts.length, rowsLive: r.lives.length,
    seconds: giay,
    message: r.canhBao.join(' | '),
  });

  store.xoaCache();
  log('Xong sau ' + giay + 's — ' + dsDaily.length + ' dòng ngày, '
    + r.posts.length + ' bài, ' + r.lives.length + ' LIVE');

  return {
    tu, den, giay, ketQua,
    soKenh: r.channels.length,
    daily: kq.daily, posts: kq.posts, lives: kq.lives,
    soDongNgay: dsDaily.length, soBai: r.posts.length, soLive: r.lives.length,
    canhBao: r.canhBao,
  };
}

/** Thử kết nối từng nền tảng, không ghi gì vào Base. */
async function thu(chi = '') {
  const conf = await ketnoi.doc();
  const out = {};
  const c = (ten) => !chi || chi === ten;

  if (c('Facebook')) {
    out.facebook = conf.facebook && conf.facebook.enabled
      ? await facebook.test(conf.facebook).catch((e) => ({ ok: false, message: e.message }))
      : { ok: false, message: 'Đang tắt' };
  }
  if (c('Instagram')) {
    out.instagram = conf.instagram && conf.instagram.enabled
      ? await instagram.test(conf.instagram, conf.facebook || {}, taoLayToken(conf.facebook || {}))
        .catch((e) => ({ ok: false, message: e.message }))
      : { ok: false, message: 'Đang tắt' };
  }
  if (c('TikTok')) {
    out.tiktok = conf.tiktok && conf.tiktok.enabled
      ? await tiktok.test(conf.tiktok, async (ch, moi) => {
        Object.assign(ch, moi);
        await ketnoi.luuToken('tiktok', conf.tiktok.channels);
      }).catch((e) => ({ ok: false, message: e.message }))
      : { ok: false, message: 'Đang tắt' };
  }
  if (c('Zalo OA')) {
    out.zalo = conf.zalo && conf.zalo.enabled
      ? await zalo.test(conf.zalo, async (oa, moi) => {
        Object.assign(oa, moi);
        await ketnoi.luuToken('zalo', conf.zalo.oas);
      }).catch((e) => ({ ok: false, message: e.message }))
      : { ok: false, message: 'Đang tắt' };
  }
  return out;
}

module.exports = { dongBo, thu, keoVe, chenhLech, gopDong, taoLayToken };
