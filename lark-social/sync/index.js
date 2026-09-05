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
 * HAI LOẠI BÀI, GÁN VÀO HAI NGÀY KHÁC NHAU — chỗ này bản trước làm sai:
 *
 *   - Bài ĐÃ CÓ trong Base → lấy phần tăng thêm, gán vào NGÀY CHẠY. Đúng, vì
 *     phần tăng đó kiếm được từ lần đồng bộ trước tới giờ.
 *
 *   - Bài LẦN ĐẦU nhìn thấy → lấy trọn số hiện tại, nhưng gán vào NGÀY ĐĂNG,
 *     không phải ngày chạy. Bản trước dồn hết vào ngày chạy: nối 5 kênh mới với
 *     khoảng 90 ngày là ra 21 triệu lượt xem đứng thành một cột duy nhất ngày
 *     06/09, còn 89 ngày kia trắng trơn. Biểu đồ vô nghĩa và mọi so sánh kỳ đều
 *     sai. Gán vào ngày đăng chỉ là XẤP XỈ (một video còn chạy tiếp nhiều ngày
 *     sau khi đăng), nhưng là xấp xỉ hợp lý — phần lớn lượt xem của TikTok đến
 *     trong ít ngày đầu — và nó cho một đường biểu đồ đọc được.
 *
 * KHÔNG đếm số bài ở đây. Việc đó do vòng riêng trong dongBo() lo, đếm theo ngày
 * đăng. Bản trước đếm ở cả hai chỗ nên 448 bài thành 884, dồn 436 vào một ngày.
 *
 * baiCu   : Map 'platform#postId' -> bản đã lưu trong Base (rỗng = nạp lại từ đầu)
 * baiMoi  : mảng bài vừa lấy về
 * ngay    : ngày chạy, dùng cho phần tăng thêm
 * chiKenh : Set extId của những kênh cần tính kiểu này (display/Zalo)
 */
function chenhLech(baiCu, baiMoi, ngay, from, chiKenh) {
  const theo = new Map();   // khoá 'extId#ngày'
  const lay = (b, d) => {
    const k = b.extId + '#' + d;
    if (!theo.has(k)) {
      theo.set(k, {
        platform: b.platform, extId: b.extId, date: d, source: b.source,
        followers: 0, followUp: 0, followDown: 0, views: 0, reach: 0, impressions: 0,
        profileViews: 0, likes: 0, comments: 0, shares: 0, saves: 0,
        engagement: 0, clicks: 0, messages: 0, leads: 0, posts: 0, lives: 0,
      });
    }
    return theo.get(k);
  };

  for (const b of baiMoi) {
    if (chiKenh && !chiKenh.has(String(b.extId))) continue;
    const cu = baiCu.get(b.platform + '#' + b.postId);
    const ngayDang = String(b.publishedAt || '').slice(0, 10);

    let d; let vaoNgay;
    if (cu) {
      vaoNgay = ngay;
      d = {
        views: Math.max(0, num(b.views) - num(cu.views)),
        likes: Math.max(0, num(b.likes) - num(cu.likes)),
        comments: Math.max(0, num(b.comments) - num(cu.comments)),
        shares: Math.max(0, num(b.shares) - num(cu.shares)),
        saves: Math.max(0, num(b.saves) - num(cu.saves)),
      };
    } else if (ngayDang && from && ngayDang >= from && ngayDang <= ngay) {
      vaoNgay = ngayDang;
      d = {
        views: num(b.views), likes: num(b.likes), comments: num(b.comments),
        shares: num(b.shares), saves: num(b.saves),
      };
    } else {
      // Chưa có mốc so sánh và bài đăng ngoài kỳ — bỏ qua, đừng đội số.
      continue;
    }

    const r = lay(b, vaoNgay);
    r.views += d.views; r.likes += d.likes; r.comments += d.comments;
    r.shares += d.shares; r.saves += d.saves;
    r.engagement += d.likes + d.comments + d.shares + d.saves;
  }
  return [...theo.values()];
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
  /* GHI CHÚ khác CẢNH BÁO: ghi chú là những câu đúng ở mọi lượt chạy (TikTok không
   * có API LIVE, Zalo không có chuỗi theo ngày…). Trộn chung thì cột Kết quả trong
   * Nhật ký vàng vĩnh viễn, và một cột lúc nào cũng vàng thì không ai nhìn nữa. */
  const ghiChu = [];
  const kenhDisplay = new Set();   // kênh dùng nguồn luỹ kế → phải tính chênh lệch

  const chay = async (ten, fn) => {
    if (chi && chi !== ten) return;
    try {
      const r = await fn();
      goi.push(r);
      if (r.canhBao) canhBao.push(...r.canhBao);
      if (r.ghiChu) ghiChu.push(...r.ghiChu);
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

  return { channels, daily, posts, lives, canhBao, ghiChu, kenhDisplay };
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
async function dongBo({ from, to, chi = '', napLai = false, log = () => {} } = {}) {
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
  /* napLai: cố tình BỎ QUA mốc cũ, coi mọi bài như lần đầu nhìn thấy — lượt xem
   * tổng đời được rải về ngày đăng của từng bài. Dùng khi lịch sử đang sai (ví
   * dụ dữ liệu ghi bởi bản cũ dồn hết vào một ngày) hoặc khi vừa nối thêm kênh
   * và muốn dựng lại đường biểu đồ của quá khứ. Chạy thường xuyên thì KHÔNG nên:
   * mỗi lần nạp lại là ghi đè phần tăng thêm đã tính đúng. */
  const baiCu = napLai ? new Map() : new Map(d0.posts.map((p) => [p.key, p]));
  if (napLai) log('Nạp lại từ đầu: bỏ mốc cũ, rải lượt xem về ngày đăng của từng bài.');

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
  /* Đếm bài / phiên LIVE vào ĐÚNG NGÀY ĐĂNG, và tạo dòng ngày nếu chưa có.
   *
   * Bản đầu chỉ cộng khi dòng ngày đã tồn tại (`if (gop.has(k))`). Với nguồn có
   * chuỗi theo ngày thì không sao, nhưng TikTok display và Zalo chỉ sinh đúng một
   * dòng cho ngày cuối kỳ — nên bài đăng ngày 02 rơi vào một khoá không tồn tại và
   * bị bỏ im lặng. Kết quả: cột "Số bài đăng" luôn trống đúng ở những kênh mà chỉ
   * tiêu KPI đang đếm số bài. */
  const dongTrongCho = (extId, d, platform, source) => {
    const k = extId + '#' + d;
    if (!gop.has(k)) {
      gop.set(k, {
        platform, extId, date: d, source: source || 'Nhập tay',
        followers: 0, followUp: 0, followDown: 0, views: 0, reach: 0, impressions: 0,
        profileViews: 0, likes: 0, comments: 0, shares: 0, saves: 0,
        engagement: 0, clicks: 0, messages: 0, leads: 0, posts: 0, lives: 0,
      });
    }
    return gop.get(k);
  };

  r.posts.forEach((p) => {
    const d = String(p.publishedAt || '').slice(0, 10);
    if (!d || d < tu || d > den) return;
    const row = dongTrongCho(p.extId, d, p.platform, p.source);
    row.posts = num(row.posts) + 1;
  });
  r.lives.forEach((l) => {
    const d = String(l.start || '').slice(0, 10);
    if (!d || d < tu || d > den) return;
    const row = dongTrongCho(l.extId, d, l.platform, l.source);
    row.lives = num(row.lives) + 1;
  });

  /* Nạp lại từ đầu thì phải DỌN trước khi dựng.
   *
   * ghiTheoKhoa() chỉ đè những dòng nó thật sự ghi, nên dòng cũ sai mà lượt nạp
   * lại không sinh ra nữa sẽ nằm nguyên đó — đúng cái cột 21 triệu lượt xem ngày
   * 06/09 vẫn trơ ra sau khi đã sửa cách tính.
   *
   * CHỈ xoá dòng do máy ghi, trong đúng khoảng ngày, của đúng những kênh vừa kéo.
   * Dòng "Nhập tay" và "CSV LIVE Center" là công người gõ — không được đụng. */
  if (napLai) {
    const cuaKenh = new Set(r.channels.map((c) => String(c.extId)));
    const MAY_GHI = (ng) => ng && ng !== 'Nhập tay' && ng !== 'CSV LIVE Center';
    const boDi = d0.daily
      .filter((x) => cuaKenh.has(String(x.channelExtId))
        && x.date >= tu && x.date <= den && MAY_GHI(x.source))
      .map((x) => x.id);
    if (boDi.length) {
      await store.xoaDong('daily', boDi);
      log('Nạp lại: đã dọn ' + boDi.length + ' dòng ngày cũ do máy ghi (giữ nguyên dòng nhập tay).');
    }
  }

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
    // Cảnh báo trước, ghi chú sau — người đọc nhật ký cần thấy cái hỏng trước tiên.
    message: r.canhBao.concat(r.ghiChu).join(' | '),
  });

  store.xoaCache();
  log('Xong sau ' + giay + 's — ' + dsDaily.length + ' dòng ngày, '
    + r.posts.length + ' bài, ' + r.lives.length + ' LIVE');

  return {
    tu, den, giay, ketQua,
    soKenh: r.channels.length,
    daily: kq.daily, posts: kq.posts, lives: kq.lives,
    soDongNgay: dsDaily.length, soBai: r.posts.length, soLive: r.lives.length,
    canhBao: r.canhBao, ghiChu: r.ghiChu,
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
