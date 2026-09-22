'use strict';
/**
 * Adapter Facebook Page — số liệu TỰ NHIÊN (organic), không phải quảng cáo.
 * Quảng cáo đã có app riêng (lark-ads-manager) đọc Marketing API; ở đây là
 * Graph API phần Page Insights.
 *
 * Ba mức số liệu, ba endpoint — và mỗi cái vướng một kiểu, đã kiểm chứng thật
 * trên Page của Rooty Trip ngày 09/09/2026 với API v23.0:
 *
 *   trang → /{page-id}/insights
 *           Chạy được, nhưng Meta đã BỎ page_impressions và page_impressions_unique,
 *           nên Lượt hiển thị và Lượt tiếp cận của Facebook KHÔNG còn lấy được.
 *
 *   bài   → /{page-id}/posts + insights
 *           Đòi thêm quyền `pages_read_user_content`. Thiếu là (#10), không đọc
 *           được bài nào — nhưng số liệu mức trang vẫn về bình thường.
 *
 *   LIVE  → /{page-id}/live_videos
 *           Đòi Meta duyệt App Review. Xin thêm scope KHÔNG giải quyết được.
 *           Chưa duyệt thì LIVE của Facebook phải nhập tay như TikTok.
 *
 * BẪY LỚN NHẤT của Graph API Insights: xin một metric mà phiên bản API đó đã bỏ
 * thì Meta trả lỗi cho CẢ REQUEST, không phải chỉ metric đó — và nhiều khi nó
 * KHÔNG nói metric nào hỏng, chỉ buông một câu "The value must be a valid
 * insights metric". Nên ở đây không hard-code một danh sách rồi cầu trời: xem
 * doInsights() — đọc được tên thủ phạm thì bỏ đúng cái đó, không đọc được thì dò
 * từng metric một rồi nhớ lại. Trang mất một chỉ số chứ không mất cả ngày dữ liệu.
 */
const { getJson, scrub, hideSecret } = require('./http');
const { chiaKhoang, ngayKe } = require('./ngay');

const PLATFORM = 'Facebook';
const NGUON = 'Facebook API';

const num = (v) => {
  const n = Number(String(v == null ? 0 : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const ngay = (s) => String(s || '').slice(0, 10);

/**
 * Metric theo ngày ở mức trang — DANH SÁCH NÀY LÀ KẾT QUẢ DÒ THẬT, không phải
 * chép từ tài liệu.
 *
 * Dò trên Page thật ngày 09/09/2026, API v23.0: Meta đã BỎ HẲN ba chỉ số cốt lõi
 * mà ai cũng tưởng còn — `page_impressions`, `page_impressions_unique` và
 * `page_fans` (cùng `page_fan_adds`, `page_fan_removes`, `page_posts_impressions`).
 * Tất cả trả về "(#100) The value must be a valid insights metric".
 *
 * Hệ quả nghiệp vụ, phải nói thẳng: **Facebook Page không còn cho Lượt hiển thị
 * và Lượt tiếp cận qua API nữa.** Hai cột đó của Facebook sẽ trống, và không có
 * cách nào lấy được — không phải app thiếu quyền.
 *
 * Muốn kiểm lại khi Meta đổi lần nữa: `node .tmp/do-metric.js`.
 */
const METRIC_NGAY = [
  'page_post_engagements',            // tương tác
  'page_views_total',                 // lượt xem trang
  'page_video_views',                 // lượt xem video
  'page_daily_follows_unique',        // follower tăng trong ngày
  'page_daily_unfollows_unique',      // follower giảm trong ngày
  'page_follows',                     // tổng follower (luỹ kế)
  'page_actions_post_reactions_total', // cảm xúc trên bài
  'page_total_actions',               // lượt bấm vào nút/liên kết của trang
  'page_posts_impressions_organic',   // lượt hiển thị bài — KHÔNG phải tiếp cận
  'page_posts_impressions_organic_unique_v2', // tiếp cận thật, đếm người
  'page_video_views_organic',         // lượt xem video KHÔNG do quảng cáo đẩy
  'page_video_view_time',             // tổng thời gian xem video (mili giây)
];

/** Ánh xạ tên metric của Meta sang tên cột của mình. */
const COT = {
  page_post_engagements: 'engagement',
  page_views_total: 'profileViews',
  page_video_views: 'views',
  page_daily_follows_unique: 'followUp',
  page_daily_unfollows_unique: 'followDown',
  page_follows: 'followers',
  page_actions_post_reactions_total: 'likes',
  page_total_actions: 'clicks',
  /* Đếm LẦN hiển thị: một người xem ba lần tính ba. Khác hẳn tiếp cận ngay dưới,
   * nên hai cột riêng. */
  page_posts_impressions_organic: 'impressions',
  /* TIẾP CẬN THẬT — đếm người.
   *
   * Lượt trước tôi kết luận "v23.0 đã gỡ sạch mọi chỉ số đếm người duy nhất" sau
   * khi thử 21 tên. Kết luận đó SAI: tôi thử page_posts_impressions_organic_unique
   * và page_impressions_organic_unique_v2, nhưng không thử đúng cái ghép cả hai —
   * page_posts_impressions_organic_unique_v2. Nó sống, 44.224 người/ngày trên
   * Rooty Trip Phú Quốc. Bài học: "thử 21 tên đều chết" không chứng minh được
   * metric không tồn tại, chỉ chứng minh 21 tên đó chết. */
  page_posts_impressions_organic_unique_v2: 'reach',
  /* Phải xin bằng tên có _v2, nhưng Meta TRẢ VỀ dưới tên không có _v2. Thiếu
   * dòng này thì request thành công, số về đủ, mà cột tiếp cận vẫn trắng — vì
   * bảng ánh xạ tra theo tên trong phản hồi chứ không phải tên mình đã xin. */
  page_posts_impressions_organic_unique: 'reach',
  /* `page_video_views` đếm cả lượt do quảng cáo đẩy. Với một app đo organic thì
   * đó là lẫn: một chiến dịch chạy mạnh có thể làm "lượt xem tự nhiên" của tháng
   * trông tăng vọt trong khi nội dung chẳng khá hơn. Nên giữ cả hai cạnh nhau —
   * cột Lượt xem là tổng, cột Lượt xem tự nhiên là phần thật sự do nội dung. */
  page_video_views_organic: 'viewsOrganic',
  page_video_view_time: 'watchTime',
};

/**
 * Bộ quyền System User token cần có. Nút "Thử kết nối" đối chiếu với bộ này rồi
 * nói thẳng cái nào thiếu — vì hậu quả của việc thiếu quyền rất khó đoán từ màn
 * hình: thiếu pages_read_user_content thì số mức trang vẫn chạy ngon, chỉ có bài
 * đăng trống trơn.
 */
const QUYEN_CAN = [
  'pages_show_list',
  'pages_read_engagement',
  'read_insights',
  'pages_read_user_content',   // đọc bài đăng — thiếu là 0 bài
  'instagram_basic',
  'instagram_manage_insights',
];

/* Metric mà Meta đã từ chối trong tiến trình này — hỏi lại chỉ tốn lượt gọi.
 * Nhớ ở mức tiến trình nên trang thứ hai trở đi khỏi dò lại. */
const DA_CHET = new Set();

/**
 * Lỗi này có đúng nghĩa "metric không tồn tại" không?
 *
 * Phân biệt sống còn: thiếu quyền (#10, #200), token hết hạn (#190) hay quá tải
 * (#4, #17) đều KHÔNG phải metric chết. Gộp chung thì một token thiếu quyền làm
 * app đánh dấu chết sạch mọi metric và báo sai hoàn toàn nguyên nhân.
 */
const laMetricHong = (err) => Number(err && err.code) === 100
  && /valid insights metric|nonexisting field|Unsupported get request/i
    .test(String((err && err.message) || ''));

const g = (conf) => 'https://graph.facebook.com/' + (conf.apiVersion || 'v23.0');

/**
 * Gọi /insights và tự bỏ những metric mà phiên bản API hiện tại không nhận nữa.
 * Trả { data, bo: [tên metric đã phải bỏ] }.
 */
async function doInsights(url0, metrics, nhan) {
  const goi = async (ds) => {
    try {
      return await getJson(url0 + '&metric=' + encodeURIComponent(ds.join(',')),
        { label: nhan, retries: 2 });
    } catch (e) { throw new Error(scrub(nhan + ': ' + e.message)); }
  };

  const neLoi = (err) => new Error(scrub(nhan + ' — Meta báo lỗi ('
    + err.code + '): ' + String(err.message || '')));

  let conLai = metrics.filter((m) => !DA_CHET.has(m));
  const bo = [];

  for (let vong = 0; vong < metrics.length; vong++) {
    if (!conLai.length) return { data: [], bo };
    const res = await goi(conLai);
    if (!res.error) return { data: res.data || [], bo };

    /* Lỗi KHÔNG phải "metric không hợp lệ" thì ném thẳng, đừng dò gì cả.
     *
     * Bản trước coi mọi lỗi là metric chết, nên một token thiếu read_insights làm
     * cả tám metric bị đánh dấu chết và nhật ký ghi "v23.0 không còn nhận
     * page_post_engagements, page_views_total…" — kể tên đúng những metric vừa
     * kiểm chứng là còn sống. Một câu bịa như thế còn tệ hơn im lặng: người đọc
     * đi tìm cách thay metric trong khi việc phải làm là cấp lại token. */
    if (!laMetricHong(res.error)) throw neLoi(res.error);

    const msg = String(res.error.message || '');
    const thuPham = conLai.find((m) => msg.includes(m));
    if (thuPham) {
      // Meta gọi tên metric hỏng ngay trong câu lỗi — loại đúng cái đó rồi hỏi lại.
      DA_CHET.add(thuPham);
      bo.push(thuPham);
      conLai = conLai.filter((m) => m !== thuPham);
      continue;
    }

    /* Meta biết là metric hỏng nhưng KHÔNG nói cái nào — chỉ "The value must be a
     * valid insights metric". Dò từng cái một, rồi nhớ vào DA_CHET nên trang sau
     * khỏi dò lại. Nhờ vậy Meta có gỡ thêm metric nào nữa thì app tự lách. */
    const song = [];
    for (const m of conLai) {
      const r1 = await goi([m]);
      if (!r1.error) { song.push(m); continue; }
      if (!laMetricHong(r1.error)) throw neLoi(r1.error);
      DA_CHET.add(m);
      bo.push(m);
    }
    if (!song.length) return { data: [], bo };
    const cuoi = await goi(song);
    if (cuoi.error) throw neLoi(cuoi.error);
    return { data: cuoi.data || [], bo };
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
  const ten = page.name || page.id;

  /* Chia nhỏ khoảng: Meta chặn ở ~93 ngày và trả "(#100) Invalid parameter" cho
   * cả request. Kéo 7 ngày thì không bao giờ gặp, nên lỗi này chỉ lộ ra lúc chạy
   * "Nạp lại từ đầu" cho cả năm — và khi đó Facebook mất trắng số liệu. */
  const data = [];
  const boTatCa = new Set();
  /* 89 chứ không phải 90, cùng lý do với Instagram: until cộng thêm một ngày. */
  for (const [tu, den] of chiaKhoang(from, to, 89)) {
    const url0 = g(conf) + '/' + page.id + '/insights'
      + '?period=day&since=' + tu + '&until=' + ngayKe(den)
      + '&access_token=' + encodeURIComponent(token);
    const r = await doInsights(url0, METRIC_NGAY, 'Facebook insights ' + ten);
    data.push(...r.data);
    r.bo.forEach((m) => boTatCa.add(m));
  }
  const bo = [...boTatCa];
  if (bo.length) {
    canhBao.push('Facebook · ' + ten + ': phiên bản API '
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
        followers: 0, followUp: 0, followDown: 0, views: 0, viewsOrganic: 0, watchTime: 0, reach: 0, impressions: 0,
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
      // Meta trả thời gian xem bằng mili giây; bảng ghi giây.
      else if (cot === 'watchTime') row.watchTime += Math.round(so / 1000);
      else row[cot] += so;
    });
  });

  return [...theoNgay.values()];
}

/* ---------------- bài đăng ---------------- */

/** Phần luôn lấy được, không phụ thuộc metric insight nào. */
const TRUONG_BAI_GON = [
  'id', 'created_time', 'message', 'permalink_url', 'status_type',
  'shares',
  'comments.summary(true).limit(0)',
  'likes.summary(true).limit(0)',
  /* Con số Facebook hiện dưới bài là TỔNG CẢM XÚC, không phải riêng "Thích".
   * `likes.summary` chỉ đếm cảm xúc Thích; bài có 80 cảm xúc trên màn hình thì
   * nó trả 74. Đối tác mở bài ra đếm tay là thấy lệch ngay, nên lấy `reactions`
   * và giữ `likes` làm phương án dự phòng. */
  'reactions.summary(true).limit(0)',
].join(',');

/**
 * `status_type` của Facebook, không phải tên loại người ta hay nói.
 *
 * Giá trị thật Graph trả về là `added_video`, `added_photos`… chứ không phải
 * `video`, `photo`. Bảng cũ tra bằng tên rút gọn nên KHÔNG khớp gì cả, và 563
 * bài của trang — trong đó có bài 1,9 triệu lượt xem — đều bị xếp là "Bài viết".
 * Màn hình Nội dung vì thế báo "Bài viết" là dạng đông nhất, trong khi thật ra
 * trang chạy chủ yếu bằng video.
 */
const LOAI_BAI = {
  added_video: 'Video', video: 'Video',
  added_photos: 'Ảnh', photo: 'Ảnh',
  album: 'Album', shared_story: 'Bài viết', share: 'Bài viết',
  mobile_status_update: 'Bài viết', status: 'Bài viết',
  published_story: 'Bài viết', link: 'Bài viết',
  reel: 'Reels', created_note: 'Bài viết',
};

async function baiCuaPage(conf, page, from, to, tran, canhBao) {
  const token = await tokenPage(conf, page);
  const fields = [TRUONG_BAI_GON,
    /* CHỈ XIN NHỮNG METRIC MỌI DẠNG BÀI ĐỀU CÓ.
     *
     * Trước đây xin kèm post_video_views_organic và post_video_view_time. Video
     * có, ảnh không — mà Meta chỉ cần một metric không hợp lệ là trả lỗi cho CẢ
     * request, rồi app rơi xuống nhánh dự phòng bỏ sạch khối insights. Hậu quả:
     * 533 bài ảnh vào Base với lượt bấm bằng 0, trong khi hỏi riêng post_clicks
     * cho đúng bài đó thì API trả 1.007.
     *
     * Số của video giờ lấy ở node video (xem soThatChoVideo), nên ở đây chỉ giữ
     * ba metric sống với mọi dạng bài. */
    'insights.metric(post_clicks,post_clicks_by_type,post_activity_by_action_type)',
  ].join(',');

  const out = [];
  /* Hai mươi lăm bài một trang, không phải năm mươi.
   *
   * Mỗi bài kéo theo năm metric insight, nên xin nhiều bài một lượt là Meta trả
   * "Please reduce the amount of data you're asking for" và mất TRẮNG trang đó.
   * Gặp thật khi chạy lại cả năm: hai trong ba Page trả 0 bài, còn Page thứ ba
   * (ít bài hơn) thì chạy ngon — nên nhìn nhật ký rất dễ tưởng là lỗi quyền. */
  const dungUrl = (f, tu, den) => g(conf) + '/' + page.id + '/posts?limit=25'
    + '&since=' + tu + '&until=' + ngayKe(den)
    + '&fields=' + encodeURIComponent(f)
    + '&access_token=' + encodeURIComponent(token);

  let truong = fields;

  /* Chia theo tháng. Kéo cả năm một lượt thì dù có phân trang, chính lời gọi đầu
   * tiên đã quá nặng với Meta. */
  let chamTran = false;
  theoKy:
  for (const [tuKy, denKy] of chiaKhoang(from, to, 31)) {
  let url = dungUrl(truong, tuKy, denKy);

  for (let trang = 0; url && trang < 40; trang++) {
    if (out.length >= tran) { chamTran = true; break theoKy; }
    let res = await getJson(url, { label: 'Facebook posts ' + (page.name || page.id), retries: 2 });

    /* Insight từng bài nhúng ngay trong lời gọi danh sách — tiện, nhưng Meta gỡ
     * metric mức bài thì hỏng CẢ request và mất luôn danh sách bài, dù phần tên
     * bài / thích / bình luận chẳng liên quan gì. Gặp lỗi metric thì bỏ khối
     * insights ra rồi hỏi lại: mất mấy cột chi tiết còn hơn mất sạch bài. */
    if (res.error && laMetricHong(res.error) && truong !== TRUONG_BAI_GON) {
      canhBao.push('Facebook · ' + (page.name || page.id) + ': Meta đã gỡ vài chỉ số '
        + 'mức bài, nên bỏ phần insight từng bài — vẫn lấy được bài, thích, bình luận, '
        + 'chia sẻ; riêng lượt hiển thị và thời gian xem của từng bài để trống.');
      truong = TRUONG_BAI_GON;
      url = dungUrl(truong, tuKy, denKy);
      res = await getJson(url, { label: 'Facebook posts (gọn) ' + (page.name || page.id), retries: 2 });
    }

    if (res.error) {
      /* Thiếu quyền đọc insight từng bài thì vẫn còn số liệu mức trang — báo cho
       * người dùng biết rồi đi tiếp, đừng làm hỏng cả lượt đồng bộ. */
      const m = String(res.error.message || '');
      canhBao.push('Facebook · ' + (page.name || page.id) + ': không đọc được danh sách bài — '
        + scrub(m)
        + (/pages_read_user_content/.test(m)
          ? ' → Token thiếu quyền pages_read_user_content. Tạo lại mã ở Người dùng hệ thống'
            + ' và tick thêm đúng quyền này.' : ''));
      break;
    }
    (res.data || []).forEach((p) => {
      /* META TRẢ CÙNG MỘT METRIC HAI LẦN, hai chu kỳ khác nhau — `lifetime` rồi
       * `day` — và chỉ khi xin nhiều metric một lượt. Gán thẳng theo tên thì bản
       * `day` đè bản `lifetime`, nên một bài 1.948.242 lượt xem trọn đời vào Base
       * thành 1 (số của riêng hôm đó). Cả bảng Bài đăng Facebook vì thế gần như
       * trống lượt xem, mà vẫn đầy tương tác — nhìn là thấy vô lý, nhưng phải mở
       * đúng phản hồi thô mới biết vì sao.
       *
       * Ở đây cần số TRỌN ĐỜI của bài, nên ưu tiên `lifetime`; không có thì mới
       * lấy cái đầu tiên gặp. */
      const ins = {};
      ((p.insights && p.insights.data) || []).forEach((m) => {
        const v = num(((m.values || [])[0] || {}).value);
        if (m.period === 'lifetime' || !(m.name in ins)) ins[m.name] = v;
      });
      const camXuc = num(p.reactions && p.reactions.summary && p.reactions.summary.total_count);
      const chiThich = num(p.likes && p.likes.summary && p.likes.summary.total_count);
      const likes = camXuc || chiThich;
      const cmts = num(p.comments && p.comments.summary && p.comments.summary.total_count);
      const shares = num(p.shares && p.shares.count);
      /* Mức bài không còn chỉ số đếm người — tiếp cận chỉ có ở mức trang. */
      const reach = 0;
      /* Lượt xem của video được điền sau, ở soThatChoVideo() — mức bài chỉ có
       * lượt xem từ 3 giây, thấp hơn con số Meta hiển thị tới 42%. Ảnh và bài
       * chữ thì không có lượt xem ở bất kỳ đường nào — đã thử từng chỉ số một,
       * trên cả sáu phiên bản API từ v18 đến v23. */
      const views = 0;
      const xemHet = 0;
      out.push({
        platform: PLATFORM,
        extId: String(page.id),
        postId: String(p.id),
        title: (p.message || '').slice(0, 200),
        publishedAt: p.created_time || '',
        type: LOAI_BAI[p.status_type] || 'Bài viết',
        url: p.permalink_url || '',
        views,
        reach,
        impressions: 0,
        likes, comments: cmts, shares, saves: 0,
        engagement: likes + cmts + shares,
        clicks: ins.post_clicks || 0,
        /* Meta trả mili giây, bảng ghi giây. */
        avgWatch: 0,
        fullWatchRate: views ? xemHet / views : 0,
        source: NGUON,
      });
    });
    url = (res.paging && res.paging.next) || null;
  }
  }
  /* CHẶN Ở ĐÂY LÀ CẮT MẤT THÁNG GẦN NHẤT, không phải cắt bớt cho nhẹ.
   *
   * Vòng ngoài đi từ tháng cũ đến tháng mới, nên 200 bài đầu tiên găm hết vào
   * tháng đầu năm rồi dừng — những tháng gần đây không bao giờ được đọc lại.
   * Chạy lại cả năm chỉ làm mới 525/933 bài, nhưng nhật ký vẫn báo "Thành
   * công" — nên 319 reel từ tháng 5 trở đi vẫn mang dạng "Bài viết" sai từ
   * trước lần sửa bảng tra, và báo cáo đối tác giấu luôn lượt xem của chúng.
   *
   * Giờ nói thẳng ra khi chạm trần. Trần vẫn cần để khỏi kéo vô tận, nhưng im
   * lặng cắt thì không. */
  if (chamTran) {
    canhBao.push('Facebook · ' + (page.name || page.id) + ': chạm trần ' + tran
      + ' bài nên DỪNG GIỮA CHẪNG — những tháng gần đây nhất trong khoảng chọn'
      + ' chưa được đọc lại. Chia nhỏ khoảng ngày rồi chạy lại, hoặc nâng soBaiToiDa.');
    return out.slice(0, tran);
  }
  return out;
}

/* ---------------- số thật của video ---------------- */

/**
 * MỨC BÀI KHÔNG CÒN ĐỦ SỐ CHO VIDEO — PHẢI HỎI RIÊNG NODE VIDEO.
 *
 * `post_video_views` ở mức bài là lượt xem TỪ 3 GIÂY, còn con số "Lượt xem"
 * Meta hiện trong Business Suite là TỔNG LƯỢT PHÁT, kể cả xem lại. Reel
 * 1408945757797599: mức bài trả 722.194, Meta hiện 1,3 triệu — không phải mình
 * mất số, mà là hỏi nhầm chỉ số. Đúng phải là fb_reels_total_plays = 1.250.933
 * (895.523 lượt phát + 355.410 lượt xem lại).
 *
 * Đòi lại được hai thứ nữa mà mức bài đã gỡ:
 *   post_impressions_unique   — TIẾP CẬN thật (901.534, Meta hiện 924,6K)
 *   post_video_social_actions — bình luận KỂ CẢ TRẢ LỜI (486, trong khi
 *                               comments.summary chỉ đếm bình luận gốc: 288)
 *
 * Đổi lại là mỗi video một lời gọi. Đặt số đúng lên trước tốc độ: báo cáo gửi
 * đối tác mà thấp hơn sự thật 40% thì chạy nhanh để làm gì.
 */
const ID_VIDEO = /\/(?:reel|videos)\/(\d+)/;
const LUONG_VIDEO = 4;

function soTu(ds, ten) {
  const m = (ds || []).find((x) => x.name === ten);
  return m ? ((m.values || [])[0] || {}).value : undefined;
}

async function soThatChoVideo(conf, token, ds, ten, canhBao) {
  const canDoi = ds.filter((p) => ID_VIDEO.test(p.url || ''));
  if (!canDoi.length) return;
  let hong = 0;

  /* Node video hỏng thì về lại số mức bài — lượt xem từ 3 giây, thấp hơn sự thật
   * nhưng còn hơn để trống. Không xin chung trong danh sách bài được, vì metric này
   * không hợp lệ với ảnh và chỉ một metric hỏng là Meta trả lỗi cho cả request. */
  const duPhong = async (p) => {
    try {
      const r = await getJson(g(conf) + '/' + String(p.postId) + '/insights'
        + '?metric=post_video_views_organic&access_token=' + encodeURIComponent(token),
      { label: 'Facebook post_video_views_organic', retries: 0 });
      const v = num(soTu((r && r.data) || [], 'post_video_views_organic'));
      if (v && !num(p.views)) p.views = v;
    } catch (_) { /* hết cách thì thôi, đã có cảnh báo ở dưới */ }
  };

  const lam = async (p) => {
    const vid = ID_VIDEO.exec(p.url)[1];
    const r = await getJson(g(conf) + '/' + vid + '/video_insights'
      + '?access_token=' + encodeURIComponent(token),
    { label: 'Facebook video_insights ' + vid, retries: 1 });
    if (!r || r.error || !r.data) { hong++; await duPhong(p); return; }
    const d = r.data;

    /* Reels đếm bằng fb_reels_total_plays; video thường bằng total_video_views. */
    const xem = num(soTu(d, 'fb_reels_total_plays')) || num(soTu(d, 'total_video_views'));
    if (xem) p.views = xem;

    const tiepCan = num(soTu(d, 'post_impressions_unique'))
      || num(soTu(d, 'total_video_impressions_unique'));
    if (tiepCan) p.reach = tiepCan;

    const hienThi = num(soTu(d, 'total_video_impressions'));
    if (hienThi) p.impressions = hienThi;

    const xh = soTu(d, 'post_video_social_actions');
    if (xh && typeof xh === 'object') {
      p.comments = Math.max(num(p.comments), num(xh.COMMENT));
      p.shares = Math.max(num(p.shares), num(xh.SHARE));
    }
    const cx = soTu(d, 'post_video_likes_by_reaction_type');
    if (cx && typeof cx === 'object') {
      p.likes = Math.max(num(p.likes), Object.values(cx).reduce((a, b) => a + num(b), 0));
    }
    const tb = num(soTu(d, 'post_video_avg_time_watched'))
      || num(soTu(d, 'total_video_avg_time_watched'));
    if (tb) p.avgWatch = tb / 1000;

    p.engagement = num(p.likes) + num(p.comments) + num(p.shares);
    const hetBai = num(soTu(d, 'total_video_complete_views'));
    if (p.views) p.fullWatchRate = hetBai / p.views;
  };

  for (let i = 0; i < canDoi.length; i += LUONG_VIDEO) {
    await Promise.all(canDoi.slice(i, i + LUONG_VIDEO)
      .map((p) => lam(p).catch(() => { hong++; return duPhong(p); })));
  }
  if (hong) {
    canhBao.push('Facebook · ' + ten + ': ' + hong + '/' + canDoi.length + ' video không đọc'
      + ' được số chi tiết — những bài đó giữ số ở mức bài, tức lượt xem từ 3 giây'
      + ' chứ không phải tổng lượt phát.');
  }
}

/* ---------------- phiên LIVE ---------------- */

/**
 * Lấy thêm lượt xem / cảm xúc / bình luận của một video đã xử lý xong.
 * Dùng chung cho cả hai đường đọc LIVE bên dưới.
 */
async function boSungTuVideo(conf, token, vid, row) {
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
  return row;
}

/* Trường hỏi ở /videos. Thứ tự có ý: hai trường ĐẦU là dấu nhận ra một video
 * sinh ra từ phát trực tiếp — mất cả hai thì không còn cách nào phân biệt LIVE
 * với video đăng thường, và khi đó thà không trả gì còn hơn đổ cả kho video
 * vào bảng Phiên LIVE. */
const TRUONG_VIDEO = [
  'live_status', 'broadcast_start_time',
  'id', 'title', 'description', 'created_time', 'length', 'permalink_url',
];

/* Meta báo trường lạ bằng vài kiểu câu khác nhau; bắt cả ba để còn biết BỎ CÁI
 * NÀO. Không đọc được tên thủ phạm thì thôi dò — mò từng trường trên một edge
 * có thể hàng trăm video là quá tốn. */
const RE_TRUONG_HONG = /nonexisting field \(([^)]+)\)|unknown fields?:? ?([A-Za-z_]+)|field ([A-Za-z_]+) is invalid/i;

/**
 * ĐƯỜNG VÒNG cho LIVE của Facebook: đọc từ /{page-id}/videos.
 *
 * Vì sao cần: `/live_videos` đòi Meta duyệt App Review, xin thêm scope vô ích.
 * Nhưng một phiên LIVE đã tắt thì trở thành một VIDEO bình thường của Trang, mà
 * video thì đọc được bằng đúng quyền app đang xin. Video sinh ra từ phát trực
 * tiếp mang thêm `live_status` / `broadcast_start_time` — đó là dấu nhận ra nó.
 *
 * CHƯA THỬ ĐƯỢC TRÊN PAGE THẬT: lúc viết (21/09/2026) app chưa nối Facebook nên
 * không có token nào để chạy. Vì thế viết theo lối phòng thủ — hỏi cả danh sách
 * trường, trường nào Meta không nhận thì bỏ ĐÚNG trường đó rồi hỏi lại, và ghi
 * vào ghi chú những trường đã phải bỏ. Nối xong nhìn nhật ký là biết Meta cho gì.
 *
 * Hệ quả cần biết: đường này chỉ thấy phiên ĐÃ TẮT (phiên đang chạy chưa thành
 * video), và không có "người xem cao nhất" — `live_views` chỉ có ở `/live_videos`.
 */
async function liveTuVideo(conf, page, from, to, canhBao, ghiChu = []) {
  const token = await tokenPage(conf, page);
  const ten = page.name || page.id;
  let truong = TRUONG_VIDEO.slice();
  const boTruong = [];
  const out = [];

  const dungUrl = () => g(conf) + '/' + page.id + '/videos?limit=50'
    + '&since=' + from + '&until=' + to
    + '&fields=' + encodeURIComponent(truong.join(','))
    + '&access_token=' + encodeURIComponent(token);

  let url = null;
  for (let vong = 0; vong < TRUONG_VIDEO.length; vong++) {
    const thu = await getJson(dungUrl(), { label: 'Facebook videos ' + ten, retries: 2 });
    if (!thu.error) { url = dungUrl(); break; }
    const m = RE_TRUONG_HONG.exec(String(thu.error.message || ''));
    const hong = m && (m[1] || m[2] || m[3]);
    if (!hong || !truong.includes(hong)) {
      canhBao.push('Facebook · ' + ten + ': không đọc được video để dò LIVE — '
        + scrub(String(thu.error.message || '')));
      return [];
    }
    boTruong.push(hong);
    truong = truong.filter((t) => t !== hong);
  }
  if (!url) {
    canhBao.push('Facebook · ' + ten + ': bỏ hết trường mà vẫn không đọc được /videos.');
    return [];
  }

  /* Mất cả hai dấu nhận biết thì DỪNG. Đổ mọi video vào bảng Phiên LIVE là hỏng
   * dữ liệu của người khác, tệ hơn hẳn việc trả rỗng và nói rõ vì sao. */
  if (!truong.includes('live_status') && !truong.includes('broadcast_start_time')) {
    ghiChu.push('Facebook · ' + ten + ': Meta không cho đọc live_status lẫn '
      + 'broadcast_start_time nên không tách được video LIVE khỏi video thường — '
      + 'LIVE của trang này vẫn phải nhập tay.');
    return [];
  }
  if (boTruong.length) {
    ghiChu.push('Facebook · ' + ten + ': /videos không nhận trường '
      + boTruong.join(', ') + ' — đã bỏ và đọc tiếp.');
  }

  for (let trang = 0; url && trang < 20; trang++) {
    const res = await getJson(url, { label: 'Facebook videos ' + ten, retries: 2 });
    if (res.error) {
      canhBao.push('Facebook · ' + ten + ': đọc video hỏng giữa chừng — '
        + scrub(String(res.error.message || '')));
      break;
    }
    for (const v of (res.data || [])) {
      // Không mang dấu phát trực tiếp thì là video đăng thường — bỏ qua.
      const batDau = v.broadcast_start_time || '';
      if (!v.live_status && !batDau) continue;
      // Phiên đang chạy chưa có số đầy đủ; để lượt đồng bộ sau lấy.
      if (String(v.live_status || '').toUpperCase() === 'LIVE') continue;

      const mocBatDau = batDau || v.created_time || '';
      const d = ngay(mocBatDau);
      if (from && d && d < from) continue;
      if (to && d && d > to) continue;

      const row = {
        platform: PLATFORM,
        extId: String(page.id),
        liveId: String(v.id),
        title: (v.title || v.description || '').slice(0, 200),
        start: mocBatDau,
        end: '',
        minutes: v.length ? Math.round(num(v.length) / 60) : 0,
        views: 0,
        peak: 0,          // /videos không có live_views — cột Đỉnh đành để trống
        comments: 0, likes: 0, shares: 0, newFollows: 0,
        url: v.permalink_url ? 'https://facebook.com' + v.permalink_url : '',
        source: NGUON,
      };
      const t0 = Date.parse(row.start);
      if (Number.isFinite(t0) && row.minutes) {
        row.end = new Date(t0 + row.minutes * 60000).toISOString();
      }
      await boSungTuVideo(conf, token, String(v.id), row);
      out.push(row);
    }
    url = (res.paging && res.paging.next) || null;
  }
  return out;
}

async function liveCuaPage(conf, page, from, to, canhBao, ghiChu = []) {
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
      const m = String(res.error.message || '');
      /* Endpoint live_videos đòi App Review của Meta, không phải thiếu quyền — xin
       * thêm scope bao nhiêu cũng vô ích. Đây là GHI CHÚ đúng ở mọi lượt chạy, để
       * vào cảnh báo thì cột Kết quả vàng vĩnh viễn và cảnh báo thật chìm nghỉm. */
      if (/reviewed and approved|review/i.test(m)) {
        /* Không bỏ trắng nữa: phiên đã tắt vẫn còn là video của Trang, đọc được
         * bằng quyền sẵn có. Đây là GHI CHÚ chứ không phải cảnh báo — nó đúng ở
         * mọi lượt chạy, để vào cảnh báo thì cột Kết quả vàng vĩnh viễn. */
        ghiChu.push('Facebook LIVE: /live_videos cần Meta duyệt App Review — đã chuyển '
          + 'sang đọc phiên đã tắt từ /videos. Cột "Người xem cao nhất" sẽ trống.');
        return liveTuVideo(conf, page, from, to, canhBao, ghiChu);
      }
      canhBao.push('Facebook · ' + (page.name || page.id) + ': không đọc được LIVE — ' + scrub(m));
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
      if (vid && lv.status !== 'LIVE') await boSungTuVideo(conf, token, vid, row);
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
  const ghiChu = [];
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
        const p = await baiCuaPage(conf, page, from, to, opts.soBaiToiDa || 2000, canhBao);
        /* Đổi lại lượt xem / tiếp cận / bình luận thật cho từng video — xem
         * soThatChoVideo(). Làm ở đây chứ không trong baiCuaPage để phần lấy danh
         * sách bài vẫn chạy được dù bước này hỏng. */
        try {
          await soThatChoVideo(conf, await tokenPage(conf, page), p,
            page.name || page.id, canhBao);
        } catch (e) {
          canhBao.push('Facebook · ' + (page.name || page.id) + ': không đọc được số chi'
            + ' tiết của video — ' + e.message + '. Bài vẫn vào đủ, nhưng lượt xem là loại'
            + ' từ 3 giây chứ không phải tổng lượt phát, và tiếp cận để trống.');
        }
        posts.push(...p);
        log('Facebook · ' + (page.name || page.id) + ': ' + p.length + ' bài');
      } catch (e) { canhBao.push('Facebook bài · ' + (page.name || page.id) + ': ' + e.message); }
    }
    if (opts.layLive !== false) {
      try {
        const l = await liveCuaPage(conf, page, from, to, canhBao, ghiChu);
        lives.push(...l);
        log('Facebook · ' + (page.name || page.id) + ': ' + l.length + ' phiên LIVE');
      } catch (e) { canhBao.push('Facebook LIVE · ' + (page.name || page.id) + ': ' + e.message); }
    }
  }

  return { channels, daily, posts, lives, canhBao, ghiChu };
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
      /* Liệt kê đủ bộ, không chỉ ba cái tối thiểu. Thiếu pages_read_user_content
       * thì số mức trang vẫn về bình thường còn bài đăng trống trơn — nhìn màn
       * hình không đoán ra được, nên để nút Thử kết nối nói thẳng tên quyền thiếu. */
      thieuQuyen: QUYEN_CAN.filter((q) => !(d.scopes || []).includes(q)),
      results: pages.map((p) => ({ account: p.id, ok: true, name: p.name, followers: p.followers })),
    };
  } catch (e) { return { ok: false, message: e.message }; }
}

module.exports = {
  PLATFORM, NGUON, fetchRange, test, danhSachPage,
  METRIC_NGAY, COT, QUYEN_CAN, doInsights, laMetricHong,
};
