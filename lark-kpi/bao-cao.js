'use strict';
/**
 * BÁO CÁO TỔNG HỢP — gom TOÀN BỘ số liệu của mọi base, cho một khoảng thời gian.
 *
 * Đây là nửa thứ nhất của app (nửa kia là KPI). Mục đích: mở ra thấy đủ mọi con
 * số mà từng app đang có, rồi xuất một tệp gửi Sếp.
 *
 * Nguyên tắc như `nguon.js`: KHÔNG tự gọi nền tảng, chỉ hỏi các app con — mỗi
 * chỉ số chỉ có một định nghĩa, nằm ở app sở hữu nó. Ở đây chỉ dịch hình dạng
 * trả về của từng app sang một khuôn chung để xếp cạnh nhau.
 *
 * App nào không chạy thì báo rõ "không đọc được", KHÔNG hiện 0 — số 0 và không
 * đọc được là hai chuyện khác hẳn, lẫn lộn là báo cáo sai gửi lên Sếp.
 *
 * Mỗi base trả về:
 *   o[]     — ô số, lấy hết những gì app cấp
 *   chuoi   — chuỗi theo ngày để vẽ đường
 *   tron    — cơ cấu để vẽ vành khuyên
 *   bang[]  — các bảng chi tiết
 */
const http = require('http');
const https = require('https');

const MT = require('./muc-tieu');
const PV = require('./pham-vi');
const { CHI_SO_BAI, CHI_SO_LIVE } = require('./nguon');

const APP = [
  { id: 'social', ten: 'Social', mo: 'TikTok · Facebook · Instagram · Zalo OA',
    mau: '#d62976', url: process.env.KPI_URL_SOCIAL || 'http://localhost:5178' },
  { id: 'live', ten: 'LIVE', mo: 'Phiên phát trực tiếp — TikTok · Facebook',
    mau: '#e0245e', url: process.env.KPI_URL_SOCIAL || 'http://localhost:5178' },
  { id: 'quang-cao', ten: 'Quảng cáo', mo: 'Meta · TikTok · Google',
    mau: '#ff7d00', url: process.env.KPI_URL_ADS || 'http://localhost:5176' },
  { id: 'ota', ten: 'Booking OTA', mo: 'Klook · KKday · GYG · Trip.com…',
    mau: '#7a3cff', url: process.env.KPI_URL_OTA || 'http://localhost:5177' },
  { id: 'cong-viec', ten: 'Bảng công việc', mo: 'Tracking toàn phòng',
    mau: '#3370ff', url: process.env.KPI_URL_VIEC || 'http://localhost:5173' },
  { id: 'lich-tac-nghiep', ten: 'Lịch tác nghiệp', mo: 'Đăng ký · duyệt · báo cáo',
    mau: '#00b96b', url: process.env.KPI_URL_LICH || 'http://localhost:5174' },
  { id: 'quy-chi-phi', ten: 'Quỹ chi phí', mo: 'Sổ quỹ tạm ứng · quyết toán',
    mau: '#d4a017', url: process.env.KPI_URL_QUY || 'http://localhost:5182' },
  { id: 'chinh-anh', ten: 'Hậu kỳ — ảnh & video', mo: 'Edit video · thiết kế · nghiệm thu',
    mau: '#e0529c', url: process.env.KPI_URL_ANH || 'http://localhost:5181' },
  { id: 'kol', ten: 'KOL', mo: 'Mời · đi tour · bàn giao bài',
    mau: '#8b5cf6', url: process.env.KPI_URL_KOL || 'http://localhost:5186' },
];
/* BỎ khỏi báo cáo: Sản phẩm · Báo cáo công việc · Kho media · Lịch làm việc.
 * Bốn app đó trả số TỒN KHO và số việc nội bộ (bao nhiêu sản phẩm đang bán, bao
 * nhiêu ảnh đã gắn thẻ, ai chưa đăng ký ca) — không nói phòng làm được gì trong
 * kỳ, mà lại đứng ngang hàng với Social và Quảng cáo. Báo cáo này là báo cáo
 * KẾT QUẢ, không phải bảng kiểm nội bộ. */

/**
 * Hỏi một app con.
 *
 * PHẢI GỬI KÈM DANH TÍNH. App Tracking có lớp đăng nhập riêng (auth.js) và ở chế
 * độ api nó chặn mọi /api/ khi không biết người gọi là ai — gọi trần thì nhận
 * HTTP 401 và ô "Bảng công việc" trong báo cáo trống trơn. Anh Hùng gặp đúng
 * cảnh này 14/09/2026. Bốn app kia không có lớp đó nên lâu nay không lộ.
 *
 * Danh tính gửi đi là CHÍNH người đang xem báo cáo, không phải một tài khoản
 * dịch vụ: đường /api/bao-cao vốn đã chặn ai không phải trưởng phòng, nên đây
 * chỉ là chuyển tiếp cái hub đã chốt, không tự phong quyền cho ai.
 *
 * Header y hệt bộ hub đặt khi proxy (xem lark-mkt-hub/proxy.js) — app con không
 * phải học thêm cách nhận danh tính thứ hai.
 */
function goi(app, duong, giay = 30) {
  const url = app.url + duong;
  const nguoi = app.nguoi || null;
  const headers = { Accept: 'application/json' };
  if (nguoi && nguoi.id) {
    headers['x-hub-user-id'] = nguoi.id;
    headers['x-hub-user-name'] = encodeURIComponent(nguoi.ten || nguoi.id);
    if (nguoi.quanLy) headers['x-hub-user-manager'] = '1';
  }
  return new Promise((giai, tu) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => {
        /* Kèm câu app con viết ra, đừng chỉ trả con số. "HTTP 401" một mình
         * không nói được là chưa đăng nhập hay hết quyền — mà đó lại đúng là
         * thứ người đọc cần biết để đi sửa. */
        if (res.statusCode >= 400) {
          let vi = '';
          try { const d = JSON.parse(s); vi = d && d.error ? ' — ' + d.error : ''; }
          catch (_) { vi = s ? ' — ' + s.slice(0, 120) : ''; }
          return tu(new Error('HTTP ' + res.statusCode + vi));
        }
        try { giai(JSON.parse(s)); } catch (_) { tu(new Error('trả về không phải JSON')); }
      });
    });
    req.on('error', (e) => tu(new Error(e.code === 'ECONNREFUSED' ? 'app chưa chạy' : e.message)));
    req.setTimeout(giay * 1000, () => { req.destroy(new Error('quá ' + giay + ' giây')); });
  });
}

/**
 * Ép về số để cộng.
 *
 * NHẬN CẢ CHUỖI SỐ. Năm app trả JSON theo năm cách, và ô công thức của Lark Base
 * hay về dạng chuỗi ("9.416666667") — bản trước chỉ nhận `typeof v === 'number'`
 * nên những ô đó cộng ra đúng 0 mãi mà vẫn báo "đọc được". Im lặng sai, đúng thứ
 * đầu file này dặn là không được làm. Chuỗi không phải số (VD "9 giờ") vẫn ra 0.
 *
 * Nhưng nhận được không có nghĩa là cộng được: ô công thức của Base còn trả số
 * rác khi thiếu đầu vào (xem docLich — cột `hours` ra -1.110.497 cho buổi chưa
 * có giờ kết thúc). Chỉ số nào có luật riêng thì tính theo luật của app sở hữu
 * nó, đừng cộng thẳng cả cột.
 */
const so = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};
const q = (tu, den) => '?from=' + encodeURIComponent(tu) + '&to=' + encodeURIComponent(den);
const msOf = (v) => (v == null || v === '' ? 0 : typeof v === 'number' ? v : Date.parse(v) || 0);
const nhanOf = (v) => (v && typeof v === 'object' ? (v.text || v.name || '') : (v || ''));
/* Tiền rút gọn cho câu ghi chú. `Math.round(x / 1e6)` làm 6,95 triệu thành "7 tr"
 * rồi hai vế cộng lại không khớp tổng in ở trên — giữ một chữ số thập phân. */
const gonTrieu = (v) => (Math.round(so(v) / 1e5) / 10).toString().replace('.', ',') + ' tr';
/** Gom một mảng theo khoá, cộng dồn các trường số. */
function gomTheo(ds, khoa, truong) {
  const m = new Map();
  (ds || []).forEach((x) => {
    const k = typeof khoa === 'function' ? khoa(x) : (x[khoa] || '(không rõ)');
    const o = m.get(k) || { _k: k, _n: 0 };
    o._n += 1;
    truong.forEach((t) => { o[t] = so(o[t]) + so(x[t]); });
    m.set(k, o);
  });
  return [...m.values()];
}

/**
 * Nền tảng nào thực sự đóng góp vào con số này, nền tảng nào không.
 *
 * Vì sao cần: một tổng đứng một mình che mất chuyện quan trọng. "Lượt tiếp cận
 * 15k" trông như số của cả phòng, sự thật là chỉ Instagram trả về — Meta đã gỡ
 * mọi chỉ số đếm người duy nhất nên Facebook không có, TikTok cũng không. Đọc
 * con số đó như số toàn phòng là hiểu sai một bậc độ lớn.
 *
 * Ở đây KHÔNG kết luận "hệ thống chưa đo được" hay "thật sự bằng 0" — hai cái
 * đó nhìn từ ngoài giống hệt nhau. Chỉ liệt kê ai có số, ai không, để người đọc
 * tự thấy tổng này đại diện cho bao nhiêu phần của thực tế.
 */
function gopNen(ds, khoa, tenKhoa = 'platform') {
  const co = [];
  const khong = [];
  (ds || []).forEach((x) => {
    const v = so(x[khoa]);
    if (v) co.push({ ten: String(x[tenKhoa] || '?'), so: v });
    else khong.push(String(x[tenKhoa] || '?'));
  });
  co.sort((a, b) => b.so - a.so);
  return { co, khong, tong: co.length + khong.length };
}

/**
 * Kỳ đem ra so sánh. Ba kiểu, vì ba câu hỏi khác nhau:
 *
 *   'truoc'     — khoảng liền trước, cùng độ dài. Trả lời "so với vừa rồi".
 *   'thangtruoc'— cùng ngày, lùi một tháng. Trả lời "so với tháng trước", giữ
 *                 đúng vị trí trong tháng (mùng 1–15 so với mùng 1–15).
 *   'namtruoc'  — cùng ngày, lùi một năm. Trả lời "cùng kỳ năm ngoái", là cách
 *                 duy nhất so được khi việc kinh doanh có mùa.
 *
 * `soNgay` luôn là độ dài của kỳ ĐANG XEM, không phải của kỳ so sánh — lùi một
 * tháng từ 31/03 ra tháng 2 ngắn hơn, nhưng số ngày in trên báo cáo phải là số
 * ngày của kỳ người ta chọn.
 */
const KIEU_SS = {
  truoc: 'kỳ liền trước',
  thangtruoc: 'cùng kỳ tháng trước',
  namtruoc: 'cùng kỳ năm trước',
};

function kyTruoc(tu, den, kieu) {
  const a = new Date(tu + 'T00:00:00Z');
  const b = new Date(den + 'T00:00:00Z');
  const dai = Math.round((b - a) / 86400000) + 1;
  const iso = (d) => d.toISOString().slice(0, 10);

  if (kieu === 'thangtruoc' || kieu === 'namtruoc') {
    const lui = (d) => {
      const x = new Date(d.getTime());
      if (kieu === 'namtruoc') x.setUTCFullYear(x.getUTCFullYear() - 1);
      else {
        /* Lùi tháng phải đặt về ngày 1 TRƯỚC khi đổi tháng. `setUTCMonth(-1)`
         * trên ngày 31 tháng 3 ra ngày 3 tháng 3 (tháng 2 không có 31) — lặng
         * lẽ lệch cả kỳ. Đặt ngày 1, lùi tháng, rồi kẹp ngày vào cuối tháng. */
        const ngay = x.getUTCDate();
        x.setUTCDate(1);
        x.setUTCMonth(x.getUTCMonth() - 1);
        const cuoi = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
        x.setUTCDate(Math.min(ngay, cuoi));
      }
      return x;
    };
    return { tu: iso(lui(a)), den: iso(lui(b)), soNgay: dai, kieu, nhan: KIEU_SS[kieu] };
  }

  const bTruoc = new Date(a.getTime() - 86400000);
  const aTruoc = new Date(bTruoc.getTime() - (dai - 1) * 86400000);
  return { tu: iso(aTruoc), den: iso(bTruoc), soNgay: dai, kieu: 'truoc', nhan: KIEU_SS.truoc };
}

/* Cộng lại số tổng từ một tập dòng kênh. Dùng khi báo cáo bị giới hạn vào mấy
 * kênh của một người — `tong` mà app Social trả về là của cả phòng. */
const CONG_KENH = ['views', 'viewsOrganic', 'watchTime', 'reach', 'impressions',
  'profileViews', 'likes', 'comments', 'shares', 'saves', 'engagement', 'clicks',
  'messages', 'leads', 'posts', 'lives', 'followUp', 'followDown', 'followers'];

function congKenh(ds) {
  const t = {};
  CONG_KENH.forEach((f) => { t[f] = ds.reduce((a, x) => a + so(x[f]), 0); });
  t.followNet = t.followUp - t.followDown;
  /* Trung bình phải chia cho mẫu số của CHÍNH tập này, không mượn của app. */
  t.xemMoiBai = t.posts ? t.views / t.posts : 0;
  t.tuongTacMoiBai = t.posts ? t.engagement / t.posts : 0;
  t.leadTrenNghinXem = t.views ? (t.leads / t.views) * 1000 : 0;
  return t;
}

/** Gộp các dòng kênh thành dòng nền tảng, giữ đúng hình dạng app Social trả. */
function gopNenTang(ds) {
  const m = new Map();
  ds.forEach((k) => {
    const o = m.get(k.platform) || { platform: k.platform };
    CONG_KENH.forEach((f) => { o[f] = so(o[f]) + so(k[f]); });
    o.followNet = so(o.followUp) - so(o.followDown);
    m.set(k.platform, o);
  });
  return [...m.values()];
}

/* ================= SOCIAL ================= */
async function docSocial(app, tu, den, pv) {
  const d = await goi(app, '/api/tong-quan' + q(tu, den));
  /* LỌC THEO KÊNH ĐƯỢC PHÂN CÔNG. Phải cộng LẠI từ các dòng kênh chứ không lấy
   * `d.tong` rồi trừ bớt: `tong` đã gộp cả kênh của người khác, không gỡ ra
   * được. App Social trả đủ số của từng kênh nên cộng lại là chính xác. */
  const locKenh = pv && pv.kenh ? new Set(pv.kenh) : null;
  const dsKenh = locKenh
    ? (d.kenh || []).filter((k) => locKenh.has(k.platform + '|' + k.name))
    : (d.kenh || []);
  const t = locKenh ? congKenh(dsKenh) : (d.tong || {});
  const l = locKenh ? {} : (d.doi || {});
  const nt = locKenh ? gopNenTang(dsKenh) : (d.nenTang || []);
  /* `n(khoa)` gắn vào ô danh sách nền tảng có / không có con số đó — xem gopNen. */
  const n = (khoa) => gopNen(nt, khoa);

  /* FOLLOWER TĂNG KHÔNG PHỦ HẾT CÁC KÊNH — phải nói ra, không thì con số bị đọc
   * như thành tích của cả phòng.
   *
   * TikTok nối bằng Display API: nó trả follower HIỆN TẠI, không trả tăng/giảm
   * theo ngày, và ảnh chụp follower cũng chỉ ghi được rải rác vài ngày trong
   * tháng. Zalo OA cũng vậy. Nên "follower tăng" thật ra chỉ đo được Facebook và
   * Instagram — trong khi TikTok chiếm hơn một phần ba tổng người theo dõi.
   *
   * Đã cân nhắc lấy hiệu số hai lần chốt để suy ra mức tăng cho TikTok, và bỏ:
   * phần lớn kênh có lần chốt đầu tháng bằng 0 (chưa đồng bộ), lấy hiệu số ra
   * "+301.369 follower mới" — một con số bịa to hơn cả sự thật. Thà nói không đo
   * được. Ô "Follower toàn phòng" ở trên thì cộng đủ mọi kênh, vì đó là ảnh chụp
   * hiện tại chứ không phải mức tăng. */
  const thieuDong = (d.nenTang || []).filter((x) => so(x.followers) > 0
    && !so(x.followUp) && !so(x.followDown));
  const ghiFollow = thieuDong.length
    ? 'chưa gồm ' + thieuDong.map((x) => x.platform + ' ('
      + Math.round(so(x.followers) / 1000) + 'k follower)').join(', ')
      + ' — nền tảng không trả số tăng giảm theo ngày'
    : '';
  /* Ô "Số phiên LIVE" đã chuyển hẳn sang khối LIVE. Để lại đây thì hai khối cùng
   * báo một con số, và người đọc phải tự đoán hai chỗ có phải cùng một thứ
   * không. Cột LIVE trong bảng "Theo nền tảng" thì giữ, vì ở đó nó trả lời câu
   * khác: nền tảng nào gánh phần live. */

  return {
    luuY: d.luuY || [],
    o: [
      { nhan: 'Lượt xem', so: so(t.views), dinhDang: 'so', lech: l.views, chinh: true, nen: n('views') },
      { nhan: 'Lượt hiển thị', so: so(t.impressions), dinhDang: 'so', lech: l.impressions, nen: n('impressions') },
      { nhan: 'Lượt tiếp cận', so: so(t.reach), dinhDang: 'so', lech: l.reach, nen: n('reach') },
      { nhan: locKenh ? 'Follower các kênh của tôi' : 'Follower toàn phòng',
        so: so(t.followers), dinhDang: 'so', chinh: true,
        ghi: 'chốt mới nhất · cộng đủ ' + dsKenh.length + ' kênh', nen: n('followers') },
      { nhan: 'Follower tăng', so: so(t.followUp), dinhDang: 'so', lech: l.followUp,
        ghi: ghiFollow, nen: n('followUp') },
      { nhan: 'Follower giảm', so: so(t.followDown), dinhDang: 'so', lech: l.followDown,
        dao: true, ghi: ghiFollow, nen: n('followDown') },
      { nhan: 'Follower tăng ròng', so: so(t.followNet), dinhDang: 'so', lech: l.followNet,
        ghi: ghiFollow, nen: n('followNet') },
      { nhan: 'Tương tác', so: so(t.engagement), dinhDang: 'so', lech: l.engagement, nen: n('engagement') },
      { nhan: 'Thích', so: so(t.likes), dinhDang: 'so', lech: l.likes, nen: n('likes') },
      { nhan: 'Bình luận', so: so(t.comments), dinhDang: 'so', lech: l.comments, nen: n('comments') },
      { nhan: 'Chia sẻ', so: so(t.shares), dinhDang: 'so', lech: l.shares, nen: n('shares') },
      { nhan: 'Lưu', so: so(t.saves), dinhDang: 'so', lech: l.saves, nen: n('saves') },
      { nhan: 'Xem hồ sơ', so: so(t.profileViews), dinhDang: 'so', lech: l.profileViews, nen: n('profileViews') },
      { nhan: 'Click liên kết', so: so(t.clicks), dinhDang: 'so', lech: l.clicks, nen: n('clicks') },
      { nhan: 'Tin nhắn', so: so(t.messages), dinhDang: 'so', lech: l.messages, nen: n('messages') },
      { nhan: 'Lead', so: so(t.leads), dinhDang: 'so', lech: l.leads, nen: n('leads') },
      { nhan: 'Số bài đăng', so: so(t.posts), dinhDang: 'so', lech: l.posts, nen: n('posts') },
      /* KHÔNG dùng `tyLeTuongTac` của app Social ở tầng tổng: mẫu số là tổng
       * reach, mà Facebook không trả reach nên tỷ lệ vọt lên 294%. Ở đây lấy mẫu
       * số là LƯỢT XEM và gọi đúng tên, để không ai phải đoán mẫu số là gì. */
      { nhan: 'Tương tác / lượt xem', dinhDang: 'pt',
        so: so(t.views) ? (so(t.engagement) / so(t.views)) * 100 : 0 },
      { nhan: 'Xem trung bình mỗi bài', so: so(t.xemMoiBai), dinhDang: 'so' },
      { nhan: 'Tương tác mỗi bài', so: so(t.tuongTacMoiBai), dinhDang: 'so' },
      { nhan: 'Lead / 1.000 lượt xem', so: so(t.leadTrenNghinXem), dinhDang: 'so2' },
    ],
    /* Biểu đồ theo ngày KHÔNG lọc được theo kênh: app Social chỉ trả tổng mỗi
     * ngày, không tách kênh. Người xem phạm vi hẹp thì bỏ hẳn biểu đồ này, chứ
     * vẽ đường của cả phòng dưới các ô đã lọc là nói dối bằng hình. */
    chuoi: locKenh ? null : {
      nhan: 'Lượt xem & tương tác theo ngày',
      diem: (d.ngay || []).map((x) => ({ x: x.date, views: so(x.views), engagement: so(x.engagement) })),
      /* Tương tác đi TRỤC PHẢI: 33k đứng cạnh 729k trên cùng một thang thì nó
       * dẹp thành đường thẳng sát đáy, nhìn như cả tháng không ai tương tác. */
      duong: [{ key: 'views', label: 'Lượt xem', mau: '#2b5cff' },
        { key: 'engagement', label: 'Tương tác', mau: '#12a150', truc: 2 }],
    },
    tron: {
      nhan: 'Cơ cấu lượt xem theo nền tảng',
      giua: 'Lượt xem',
      phan: nt.map((x) => ({ nhan: x.platform, so: so(x.views) })).filter((x) => x.so),
    },
    bang: [
      { tieuDe: 'Theo nền tảng',
        cot: ['Nền tảng', 'Lượt xem', 'Hiển thị', 'Tương tác', 'Follower tăng', 'Bài', 'LIVE'],
        soCot: [1, 2, 3, 4, 5, 6],
        dong: nt.map((x) => [x.platform, so(x.views), so(x.impressions),
          so(x.engagement), so(x.followUp), so(x.posts), so(x.lives)]) },
      { tieuDe: locKenh ? 'Kênh tôi phụ trách' : 'Theo kênh',
        cot: ['Kênh', 'Nền tảng', 'Follower', 'Follower tăng', 'Lượt xem', 'Tương tác', 'Bài'],
        soCot: [2, 3, 4, 5, 6],
        /* Cột Follower đứng ngay cạnh cột tăng: kênh nào có tệp lớn mà cột tăng
         * để trống thì thấy ngay đó là kênh chưa đo được, không phải kênh chết. */
        dong: dsKenh.slice().sort((a, b) => so(b.followers) - so(a.followers))
          .map((k) => [k.name, k.platform, so(k.followers),
            so(k.followUp) || so(k.followDown) ? so(k.followUp) : '—',
            so(k.views), so(k.engagement), so(k.posts)]) },
      { tieuDe: 'Bài xem nhiều nhất',
        cot: ['Bài', 'Kênh', 'Lượt xem', 'Tương tác'],
        soCot: [2, 3],
        dong: (d.topBai || []).filter((b) => !locKenh
          || locKenh.has((b.platform || '') + '|' + (b.channel || ''))).slice(0, 15).map((b) => [
          (b.title || '(không tiêu đề)').slice(0, 90), b.channel || b.platform || '',
          so(b.views), so(b.engagement)]) },
    ].filter((b) => b.dong.length),
  };
}

/**
 * DỰNG PHỄU — chỉ dùng được khi các bậc CÙNG MỘT TẬP NGƯỜI và cùng một hệ đo.
 *
 * Đây là điều kiện bắt buộc, không phải lời khuyên. Xếp mấy chỉ số rời rạc
 * thành hình phễu là vẽ ra một dòng chảy không tồn tại, và mọi tỷ lệ rút ra từ
 * nó đều vô nghĩa — xem chú thích dài trong gomTepMoi(). Chỉ hai chỗ trong cả
 * báo cáo đạt điều kiện: trong một nền tảng quảng cáo (chính nó quy công người
 * đã nhấp thành người chuyển đổi) và trong một phiên LIVE (người bình luận là
 * người đang xem phiên đó).
 *
 * @param {{nhan:string,so:number}[]} bac Các bậc, từ rộng tới hẹp.
 */
function dungPheu(bac) {
  const ds = bac.filter((x) => Number.isFinite(x.so) && x.so > 0);
  if (ds.length < 2) return null;
  return ds.map((x, i) => ({
    nhan: x.nhan,
    so: x.so,
    conLai: i === 0 ? null : Math.round((x.so / ds[i - 1].so) * 1000) / 10,
    moiMot: i === 0 ? null : Math.round(ds[0].so / x.so),
  }));
}

/* ================= LIVE =================
 * Tách khỏi Social thành khối riêng. Lý do: LIVE là một cách làm khác hẳn —
 * người thật ngồi trước máy mấy tiếng, đo bằng giờ lên sóng và đơn chốt, chứ
 * không đo bằng lượt xem bài như nội dung đăng sẵn. Trộn chung thì mười ô LIVE
 * lọt thỏm giữa hai mươi ô bài đăng và không ai đọc ra công của nó.
 *
 * Số vẫn lấy từ app Social (nó sở hữu bảng phiên LIVE) — chỉ trình bày riêng. */
async function docLiveRieng(app, tu, den, pv) {
  const d = await goi(app, '/api/tong-quan' + q(tu, den));
  const locKenh = pv && pv.kenh ? new Set(pv.kenh) : null;
  const ds = (d.live || []).filter((x) => !locKenh
    || locKenh.has((x.platform || '') + '|' + (x.channel || '')));
  const cong = (f) => ds.reduce((a, x) => a + so(x[f]), 0);
  const phut = cong('minutes');
  const views = cong('views');
  const tuongTac = cong('comments') + cong('likes') + cong('shares');
  /* Trung bình phải chia cho SỐ PHIÊN CÓ SỐ, không phải mọi phiên. Phiên chưa
   * nhập số mà vẫn nằm dưới mẫu thì "xem trung bình" tụt xuống một cách vô cớ. */
  const coXem = ds.filter((x) => so(x.views) > 0).length;
  const nenTang = gomTheo(ds, (x) => x.platform || '(không rõ)', ['views']);

  /* Cột nào cả 28 phiên đều ghi 0 thì gần như chắc chắn là KHÔNG AI ĐIỀN, chứ
   * không phải phiên nào cũng thật sự bằng 0 (không lẽ 17 giờ lên sóng mà không
   * một người nào bấm theo dõi). Base lưu 0 nên không phân biệt được bằng kiểu
   * dữ liệu — nhưng nói thẳng nghi ngờ đó ra còn hơn để người đọc tin vào 0. */
  const trong = (f) => (ds.length && ds.every((x) => so(x[f]) === 0)
    ? ds.length + '/' + ds.length + ' phiên ghi 0 — nhiều khả năng cột này chưa ai điền'
    : '');

  /* ĐỘ PHỦ TỪNG CỘT. Đây là chỗ con số LIVE dễ bị đọc sai nhất: "lượt xem 31k"
   * nghe như kết quả của cả 28 phiên, thật ra chỉ 11 phiên có nhập số, 17 phiên
   * để trống. Ghi thẳng tỷ lệ lên ô, đừng giấu xuống dòng trung bình. */
  const coSo = (f) => ds.filter((x) => so(x[f]) > 0).length;
  const phu = (f) => {
    const c = coSo(f);
    if (!ds.length || c === ds.length) return '';
    return c + '/' + ds.length + ' phiên có nhập số — '
      + (ds.length - c) + ' phiên để trống, số thật cao hơn';
  };
  /* Cảnh báo về chất lượng số LIVE. App Social sở hữu bảng phiên; báo cáo chỉ
   * nói ra những gì đếm được, không tự đoán vì sao thiếu. */
  const luuY = [];
  const thieuXem = ds.length - coSo('views');
  if (thieuXem > 0) {
    luuY.push('Chỉ ' + coSo('views') + '/' + ds.length + ' phiên có nhập lượt xem — '
      + thieuXem + ' phiên để trống. Mọi con số cộng dồn bên dưới vì vậy THẤP HƠN '
      + 'thực tế, không phải vì phiên đó không ai xem.');
  }
  const nt = [...new Set(ds.map((x) => x.platform).filter(Boolean))];
  if (ds.length && !nt.includes('TikTok')) {
    luuY.push('Không có phiên LIVE TikTok nào trong kỳ (' + (nt.join(', ') || 'không rõ nền tảng')
      + ' thôi). Nếu đội có live TikTok thật thì phiên đó chưa vào hệ thống — '
      + 'app Social chưa nối được LIVE của TikTok.');
  }

  return {
    luuY,
    o: [
      { nhan: 'Số phiên LIVE', so: ds.length, dinhDang: 'so', chinh: true,
        ghi: nt.length ? nt.join(' · ') : '' },
      { nhan: 'Giờ lên sóng', so: phut / 60, dinhDang: 'so2', ghi: 'giờ' },
      { nhan: 'Lượt xem', so: views, dinhDang: 'so', ghi: phu('views') },
      { nhan: 'Đỉnh cùng lúc', so: Math.max(0, ...ds.map((x) => so(x.peak))), dinhDang: 'so',
        ghi: trong('peak') || 'người xem cao nhất một phiên' },
      { nhan: 'Bình luận', so: cong('comments'), dinhDang: 'so', ghi: phu('comments') },
      { nhan: 'Follow mới', so: cong('newFollows'), dinhDang: 'so', ghi: trong('newFollows') },
      { nhan: 'Tin nhắn', so: cong('messages'), dinhDang: 'so', ghi: trong('messages') },
      { nhan: 'Lead', so: cong('leads'), dinhDang: 'so', ghi: phu('leads') },
      { nhan: 'Đơn chốt', so: cong('orders'), dinhDang: 'so', ghi: phu('orders') },
      { nhan: 'Xem trung bình một phiên', so: coXem ? views / coXem : 0, dinhDang: 'so',
        ghi: coXem === ds.length ? '' : coXem + '/' + ds.length + ' phiên đã nhập lượt xem' },
      { nhan: 'Phút lên sóng mỗi phiên', so: ds.length ? phut / ds.length : 0, dinhDang: 'so' },
      { nhan: 'Tương tác trên 1.000 lượt xem', so: views ? (tuongTac / views) * 1000 : 0,
        dinhDang: 'so2' },
    ],
    /* BỎ PHỄU LIVE.
     *
     * Lý thuyết thì phễu này hợp lệ — người bình luận đúng là người đang xem
     * phiên đó. Nhưng số thật không cho phép: lượt xem chỉ có ở 11/28 phiên,
     * bình luận 27/28, lead 10/28, đơn 6/28. Bốn bậc bốn tập phiên khác nhau,
     * nên "cứ 2.555 lượt xem mới có 1 lead" là chia lượt xem của mười một phiên
     * cho lead của mười phiên khác — đúng cái lỗi đã gỡ ở khối Tệp khách mới.
     *
     * Khi nào đội nhập đủ số cho mọi phiên thì mở lại — lúc đó bốn bậc mới
     * cùng một tập. */

    /* DOANH THU LIVE chưa đưa vào — anh Hùng gác lại vì chưa rõ cơ chế ghi nhận:
     * cột doanh thu trong bảng phiên không nói rõ là đơn chốt ngay trên sóng hay
     * đơn khách nhắn tin sau đó, nên cộng vào là cộng nhầm với doanh thu Quảng
     * cáo và OTA. Khi nào chốt được luật ghi nhận thì mở lại ô này. */
    cot: {
      nhan: 'Lượt xem LIVE theo nền tảng',
      don: 'so',
      muc: nenTang.map((x) => ({ nhan: x._k, so: x.views })).filter((x) => x.so),
    },
    bang: [
      { tieuDe: 'Phiên LIVE trong kỳ',
        cot: ['Ngày', 'Kênh', 'Nền tảng', 'Phút', 'Lượt xem', 'Đỉnh', 'Bình luận', 'Follow mới', 'Đơn'],
        soCot: [3, 4, 5, 6, 7, 8],
        dong: ds.slice().sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')))
          .slice(0, 40).map((x) => [String(x.start || '').slice(0, 10), x.channel || '',
            x.platform || '', so(x.minutes), so(x.views), so(x.peak), so(x.comments),
            so(x.newFollows), so(x.orders)]) },
    ].filter((b) => b.dong.length),
  };
}

/** Dựng lại bộ chỉ số quảng cáo từ một tập dòng nền tảng. */
function congQuangCao(ds) {
  const c = (f) => ds.reduce((a, x) => a + so(x[f]), 0);
  const spend = c('spend');
  const imp = c('impressions');
  const clicks = c('clicks');
  const conv = c('conversions');
  const rev = c('revenue');
  return {
    rows: c('rows'), spend, impressions: imp, clicks, conversions: conv, revenue: rev,
    ctr: imp ? (clicks / imp) * 100 : 0,
    cvr: clicks ? (conv / clicks) * 100 : 0,
    cpc: clicks ? spend / clicks : 0,
    cpm: imp ? (spend / imp) * 1000 : 0,
    cpa: conv ? spend / conv : 0,
    roas: spend ? rev / spend : 0,
    /* Doanh thu toàn công ty KHÔNG chia theo nền tảng được — để trống chứ đừng
     * gán hết cho một nền tảng. */
    revenueCongTy: null, revenueNgoaiQuangCao: null, tyLeTuQuangCao: null,
  };
}

/* ================= QUẢNG CÁO ================= */
async function docQuangCao(app, tu, den, pv) {
  const d = await goi(app, '/api/overview' + q(tu, den));
  /* Giới hạn vào mấy nền tảng được phân công thì phải DỰNG LẠI bộ chỉ số từ các
   * dòng nền tảng, không lấy `kpi` của cả phòng. Các tỷ lệ (CTR, CPA, ROAS)
   * cũng phải tính lại từ tử số và mẫu số mới, lấy nguyên tỷ lệ cũ là sai. */
  const locNen = pv && pv.nenTangQc ? new Set(pv.nenTangQc) : null;
  const dsNen = locNen
    ? (d.byPlatform || []).filter((x) => locNen.has(x.platform))
    : (d.byPlatform || []);
  const k = locNen ? congQuangCao(dsNen) : (d.kpi || {});
  const l = locNen ? {} : (d.delta || {});
  const canh = d.alerts || [];
  const nang = canh.filter((a) => a.level === 'high').length;
  const n = (khoa) => gopNen(dsNen, khoa);
  return {
    /* Phễu QUẢNG CÁO. Đây là phễu thật duy nhất ngoài LIVE: cùng một nền tảng
     * đo cả ba bậc, và chính nó quy công người đã nhấp thành người chuyển đổi.
     * "Cứ N lượt hiển thị mới có 1 chuyển đổi" ở đây có nghĩa vì cùng một tập
     * người — khác hẳn phép chia tiếp cận Facebook cho booking WAUG. */
    pheu: dungPheu([
      { nhan: 'Lượt hiển thị', so: so(k.impressions) },
      { nhan: 'Lượt nhấp', so: so(k.clicks) },
      { nhan: 'Chuyển đổi', so: so(k.conversions) },
    ]),
    goc: 'lượt hiển thị',
    o: [
      { nhan: 'Chi tiêu', so: so(k.spend), dinhDang: 'vnd', lech: l.spend, chinh: true, nen: n('spend') },
      { nhan: 'Doanh thu từ QC', so: so(k.revenue), dinhDang: 'vnd', lech: l.revenue,
        ghi: so(k.revenue) ? 'đơn ghi công được cho quảng cáo' : 'chưa ghi công được đơn nào' },
      { nhan: 'ROAS', so: so(k.roas), dinhDang: 'x', lech: l.roas,
        ghi: 'mỗi đồng chi ra thu về' },
      /* Ba ô đặt doanh thu quảng cáo vào bối cảnh công ty. App Ads đã tính sẵn;
       * thiếu chúng thì "157 triệu" đọc lên như toàn bộ doanh thu của phòng. */
      { nhan: 'Doanh thu toàn công ty', so: so(k.revenueCongTy), dinhDang: 'vnd',
        ghi: 'mọi nguồn, để đặt cạnh mà so' },
      { nhan: 'Doanh thu NGOÀI quảng cáo', so: so(k.revenueNgoaiQuangCao), dinhDang: 'vnd' },
      { nhan: 'Phần doanh thu đến từ QC', so: so(k.tyLeTuQuangCao), dinhDang: 'pt',
        ghi: 'trên doanh thu toàn công ty' },
      { nhan: 'Doanh thu mỗi chuyển đổi', so: so(k.conversions) ? so(k.revenue) / so(k.conversions) : 0,
        dinhDang: 'vnd' },
      { nhan: 'Chuyển đổi', so: so(k.conversions), dinhDang: 'so', lech: l.conversions, nen: n('conversions') },
      /* CPA / CPC / CPM thấp là TỐT — `dao` để giao diện đảo chiều màu mũi tên,
       * không đảo thì "CPA giảm 20%" bị tô đỏ như một tin xấu. */
      { nhan: 'CPA', so: so(k.cpa), dinhDang: 'vnd', lech: l.cpa, dao: true },
      { nhan: 'CPC', so: so(k.cpc), dinhDang: 'vnd', lech: l.cpc, dao: true },
      { nhan: 'CPM', so: so(k.cpm), dinhDang: 'vnd', lech: l.cpm, dao: true },
      { nhan: 'Lượt hiển thị', so: so(k.impressions), dinhDang: 'so', lech: l.impressions, nen: n('impressions') },
      { nhan: 'Lượt nhấp', so: so(k.clicks), dinhDang: 'so', lech: l.clicks, nen: n('clicks') },
      { nhan: 'CTR', so: so(k.ctr), dinhDang: 'pt', lech: l.ctr },
      { nhan: 'CVR', so: so(k.cvr), dinhDang: 'pt', lech: l.cvr },
      { nhan: 'Cảnh báo', so: canh.length, dinhDang: 'so',
        muc: nang ? 'cao' : (canh.length ? 'vua' : 'ok'),
        ghi: nang ? nang + ' mức cao' : '' },
    ],
    chuoi: {
      nhan: 'Chi tiêu · doanh thu · chuyển đổi theo ngày',
      diem: (d.series || []).map((x) => ({ x: x.date, spend: so(x.spend),
        revenue: so(x.revenue), conversions: so(x.conversions) })),
      duong: [{ key: 'spend', label: 'Chi tiêu', mau: '#ff7d00' },
        { key: 'revenue', label: 'Doanh thu', mau: '#12a150' },
        { key: 'conversions', label: 'Chuyển đổi', mau: '#2b5cff', truc: 2 }],
    },
    tron: {
      nhan: 'Cơ cấu chi tiêu theo nền tảng',
      giua: 'Chi tiêu',
      phan: (d.byPlatform || []).map((x) => ({ nhan: x.platform, so: so(x.spend) })).filter((x) => x.so),
    },
    bang: [
      { tieuDe: 'Theo nền tảng',
        cot: ['Nền tảng', 'Chi tiêu', '% chi', 'Doanh thu', 'ROAS', 'Nhấp', 'CTR', 'Chuyển đổi', 'CPA'],
        soCot: [1, 2, 3, 4, 5, 6, 7, 8],
        dong: (d.byPlatform || []).map((x) => [x.platform, so(x.spend), so(x.shareSpend),
          so(x.revenue), so(x.roas), so(x.clicks), so(x.ctr), so(x.conversions), so(x.cpa)]) },
      { tieuDe: 'Theo chiến dịch',
        cot: ['Chiến dịch', 'Nền tảng', 'Trạng thái', 'Chi tiêu', 'Chuyển đổi', 'CPA'],
        soCot: [3, 4, 5],
        dong: (d.byCampaign || []).map((x) => [x.name, x.platform, x.status,
          so(x.spend), so(x.conversions), so(x.cpa)]) },
      { tieuDe: 'Doanh thu ghi nhận theo chiến dịch',
        cot: ['Chiến dịch', 'Nền tảng', 'Chi tiêu', 'Doanh thu', 'ROAS', 'Chuyển đổi', 'CPA'],
        soCot: [2, 3, 4, 5, 6],
        dong: (d.byCampaign || []).slice().sort((a, b) => so(b.revenue) - so(a.revenue))
          .map((x) => [x.name, x.platform, so(x.spend), so(x.revenue), so(x.roas),
            so(x.conversions), so(x.cpa)]) },
      { tieuDe: 'Quảng cáo hiệu quả nhất',
        cot: ['Quảng cáo', 'Chiến dịch', 'Chi tiêu', 'Chuyển đổi', 'CPA'],
        soCot: [2, 3, 4],
        dong: (d.topAds || []).slice(0, 10).map((x) => [x.name, x.campaignName,
          so(x.spend), so(x.conversions), so(x.cpa)]) },
      { tieuDe: 'Cảnh báo',
        cot: ['Mức', 'Nội dung', 'Chi tiết'],
        dong: canh.slice(0, 30).map((a) => [
          a.level === 'high' ? 'Cao' : a.level === 'mid' ? 'Vừa' : 'Thấp', a.title, a.detail || '']) },
    ].filter((b) => b.dong.length),
  };
}

/* ================= BOOKING OTA ================= */
async function docOta(app, tu, den) {
  /* Lọc theo NGÀY ĐI như hub, không phải ngày đặt: báo cáo vận hành quan tâm
   * tour chạy trong kỳ. */
  const qq = '?moc=ngayDi&from=' + encodeURIComponent(tu) + '&to=' + encodeURIComponent(den);
  const d = await goi(app, '/api/thongke' + qq);
  const t = d.tong || {};
  /* OTA không có "nền tảng" mà có SÀN — cùng ý nghĩa: sàn nào góp vào con số này. */
  const n = (khoa) => gopNen(d.kenh || [], khoa, 'kenh');
  return {
    o: [
      { nhan: 'Doanh thu thu về', so: so(t.thucNhan), dinhDang: 'vnd', chinh: true,
        ghi: so(t.bookingSong) + ' booking · ' + so(t.khach) + ' khách', nen: n('thucNhan') },
      { nhan: 'Booking', so: so(t.booking), dinhDang: 'so' },
      { nhan: 'Booking còn sống', so: so(t.bookingSong), dinhDang: 'so', nen: n('bookingSong') },
      { nhan: 'Huỷ', so: so(t.huy), dinhDang: 'so', dao: true, muc: so(t.huy) ? 'vua' : 'ok', nen: n('huy') },
      { nhan: 'Tỷ lệ huỷ', so: so(t.tyLeHuy), dinhDang: 'pt', dao: true },
      { nhan: 'Khách', so: so(t.khach), dinhDang: 'so',
        ghi: so(t.nguoiLon) + ' lớn · ' + so(t.treEm) + ' trẻ em', nen: n('khach') },
      { nhan: 'Hoa hồng OTA', so: so(t.hoaHong), dinhDang: 'vnd', dao: true,
        ghi: so(t.tongTien) ? so(t.tyLeHoaHong) + '% doanh thu' : 'chưa nhập giá OTA bán' },
      { nhan: 'Đặt trước trung bình', so: so(t.datTruocTb), dinhDang: 'so2', ghi: 'ngày' },
      { nhan: 'Đặt trước trung vị', so: so(t.datTruocTrungVi), dinhDang: 'so', ghi: 'ngày' },
      { nhan: 'Hoàn tiền', so: so(t.tienHoan), dinhDang: 'vnd', dao: true },
      { nhan: 'No-show', so: so(t.noShow), dinhDang: 'so', dao: true },
      { nhan: 'Thiếu tỷ giá', so: so(t.thieuTyGia), dinhDang: 'so', dao: true,
        muc: so(t.thieuTyGia) ? 'vua' : 'ok' },
    ],
    chuoi: {
      nhan: 'Booking & doanh thu theo ngày đi',
      diem: (d.ngay || []).map((x) => ({ x: x.ngay, booking: so(x.bookingSong), thucNhan: so(x.thucNhan) })),
      duong: [{ key: 'thucNhan', label: 'Doanh thu', mau: '#7a3cff' },
        { key: 'booking', label: 'Booking', mau: '#12a150', truc: 2 }],
    },
    tron: {
      nhan: 'Cơ cấu doanh thu theo sàn',
      giua: 'Doanh thu',
      phan: (d.kenh || []).map((x) => ({ nhan: x.kenh, so: so(x.thucNhan) })).filter((x) => x.so),
    },
    bang: [
      { tieuDe: 'Theo sàn',
        cot: ['Sàn', 'Booking', 'Huỷ', 'Khách', 'Doanh thu', 'Hoa hồng'],
        soCot: [1, 2, 3, 4, 5],
        dong: (d.kenh || []).map((x) => [x.kenh, so(x.bookingSong), so(x.huy),
          so(x.khach), so(x.thucNhan), so(x.hoaHong)]) },
      { tieuDe: 'Theo tour',
        cot: ['Tour', 'Booking', 'Khách', 'Doanh thu'],
        soCot: [1, 2, 3],
        dong: (d.tour || []).map((x) => [x.tour, so(x.bookingSong), so(x.khach), so(x.thucNhan)]) },
      { tieuDe: 'Cần xử lý',
        cot: ['Việc', 'Số'],
        soCot: [1],
        dong: (d.canXuLy || []).map((x) => [x.nhan, so(x.so)]) },
    ].filter((b) => b.dong.length),
  };
}

/* ================= BẢNG CÔNG VIỆC ================= */
async function docCongViec(app, tu, den, pv) {
  const d = await goi(app, '/api/tasks');
  /* Lọc theo NGƯỜI rồi mới theo LOẠI VIỆC. Khớp tên đúng tuyệt đối — bảng này
   * có cả "Nguyễn Long Khánh (Pinky)" lẫn "Huỳnh Chí Khanh", khớp mờ là gộp
   * việc của hai người thành một. */
  const ds = (d.tasks || []).filter((t) => {
    if (pv && !(t.owner || []).some((u) => PV.laCuaNguoi(pv, u.name || u.id))) return false;
    if (pv && pv.loaiViec && !pv.loaiViec.includes(nhanOf(t.workType))) return false;
    return true;
  });
  const a = new Date(tu + 'T00:00:00Z').getTime();
  const b = new Date(den + 'T23:59:59Z').getTime();
  const bay = Date.now();
  /* Trạng thái THẬT của Base: Hoàn thành · Trễ deadline · Đang tiến hành · Hủy ·
   * Chờ tiếp nhận. Lấy từ dữ liệu chạy thật, không đoán tên khác. */
  const DONG = new Set(['Hoàn thành', 'Hủy']);
  const han = (t) => msOf(t.deadline);
  /* Bảng việc KHÔNG có ngày hoàn thành, chỉ có deadline — nên "trong kỳ" ở đây
   * nghĩa là việc ĐẾN HẠN trong kỳ. Gọi đúng tên như vậy; gọi là "hoàn thành
   * trong kỳ" là để người đọc hiểu sang một nghĩa mà số không đo được. */
  const trongKy = ds.filter((t) => { const x = han(t); return x >= a && x <= b; });
  const xong = trongKy.filter((t) => nhanOf(t.status) === 'Hoàn thành');
  const mo = ds.filter((t) => !DONG.has(nhanOf(t.status)));
  const quaHan = mo.filter((t) => han(t) && han(t) < bay);
  const tt = gomTheo(ds, (t) => nhanOf(t.status) || '(trống)', []);
  const theoLoai = gomTheo(trongKy, (t) => nhanOf(t.workType) || '(chưa phân loại)', []);
  const theoNguoi = gomTheo(trongKy, (t) => (t.owner || []).map((u) => u.name).join(', ') || '(chưa giao)', []);
  const coMinhChungDs = trongKy.filter((t) => (t.attachment || []).length
    || (t.fileKetQua || []).length || t.linkKetQua || t.link);
  const coMinhChung = coMinhChungDs.length;

  /* ĐẾM THEO LOẠI VIỆC ĐÃ XONG. Người làm hậu kỳ cần đúng một con số: tháng này
   * tôi ra được bao nhiêu video. Bảng "theo loại" bên dưới đếm việc ĐẾN HẠN,
   * gồm cả việc chưa xong — không dùng để báo sản lượng được. */
  const xongTheoLoai = gomTheo(xong, (t) => nhanOf(t.workType) || '(chưa phân loại)', []);
  const oSanLuong = xongTheoLoai
    .slice().sort((a, b) => b._n - a._n)
    .map((x) => ({
      nhan: 'Đã xong · ' + x._k, so: x._n, dinhDang: 'so',
      chinh: /video|thiết kế|design/i.test(x._k),
    }));

  /* Liên kết kết quả của một việc, ưu tiên link người ta tự điền. */
  const linkCua = (t) => t.linkKetQua || t.link
    || ((t.fileKetQua || [])[0] || {}).url || ((t.attachment || [])[0] || {}).url || '';
  const ngayCua = (t) => (t.ngayGiaiQuyet ? msOf(t.ngayGiaiQuyet) : han(t));
  return {
    o: [
      { nhan: 'Đến hạn trong kỳ', so: trongKy.length, dinhDang: 'so', chinh: true },
      ...oSanLuong,
      /* "% số việc", không phải "% đúng hạn" — xem chú thích ở khối Hậu kỳ: bảng
       * này không có ngày hoàn thành nên không ai kiểm được chuyện kịp hạn. */
      { nhan: 'Trong đó đã xong', so: xong.length, dinhDang: 'so',
        ghi: trongKy.length ? Math.round((xong.length / trongKy.length) * 100) + '% số việc đến hạn' : '' },
      { nhan: 'Có minh chứng', so: coMinhChung, dinhDang: 'so',
        ghi: trongKy.length ? Math.round((coMinhChung / trongKy.length) * 100) + '% số việc' : '' },
      { nhan: 'Việc đang mở', so: mo.length, dinhDang: 'so' },
      { nhan: 'Quá hạn', so: quaHan.length, dinhDang: 'so', muc: quaHan.length ? 'cao' : 'ok', dao: true },
      { nhan: 'Gắn cờ trễ deadline', so: ds.filter((t) => nhanOf(t.status) === 'Trễ deadline').length,
        dinhDang: 'so', muc: 'vua', dao: true },
      { nhan: 'Đang tiến hành', so: ds.filter((t) => nhanOf(t.status) === 'Đang tiến hành').length, dinhDang: 'so' },
      { nhan: 'Chờ tiếp nhận', so: ds.filter((t) => nhanOf(t.status) === 'Chờ tiếp nhận').length, dinhDang: 'so' },
      { nhan: 'Chưa phân công', so: mo.filter((t) => !(t.owner || []).length).length, dinhDang: 'so', dao: true },
      /* Khi đã lọc theo người thì ĐỔI TÊN Ô. "Tổng việc trên bảng" đọc như số
       * việc của cả phòng, trong khi nó đang là số việc của riêng người này —
       * Khánh thấy 95 và tưởng cả bảng chỉ có 95 việc, thật ra là 536. */
      { nhan: pv ? 'Tổng việc của tôi trên bảng' : 'Tổng việc trên bảng',
        so: ds.length, dinhDang: 'so',
        ghi: pv && pv.loaiViec ? 'chỉ loại ' + pv.loaiViec.join(', ') : '' },
    ],
    /* Bảng việc chỉ cần ĐỊNH LƯỢNG: kỳ này làm được bao nhiêu việc, loại gì, ai
     * làm. Vành khuyên trạng thái đã bỏ (nó trả lời "việc đang nằm ở đâu" — câu
     * của người trực bảng, không phải của người đọc báo cáo tháng), và cột trạng
     * thái cũng bỏ nốt: "407 việc Hoàn thành" là con số cộng dồn của cả bảng từ
     * đầu năm, đứng trong báo cáo một tháng thì chỉ gây hiểu nhầm.
     *
     * Còn lại một hình duy nhất, gọn: việc LÀM TRONG KỲ theo loại. */
    thanh: {
      nhan: 'Việc đến hạn trong kỳ, theo loại',
      don: 'so',
      muc: theoLoai.slice().sort((x, y) => y._n - x._n)
        .map((x) => ({ nhan: x._k, so: x._n })),
    },
    thanh2: {
      nhan: 'Theo người',
      don: 'so',
      muc: theoNguoi.slice().sort((x, y) => y._n - x._n)
        .map((x) => ({ nhan: x._k, so: x._n })),
    },
    bang: [
      { tieuDe: 'Việc đến hạn trong kỳ, theo người',
        cot: ['Người', 'Số việc'], soCot: [1],
        dong: theoNguoi.sort((x, y) => y._n - x._n).map((x) => [x._k, x._n]) },
      { tieuDe: 'Theo loại công việc',
        cot: ['Loại', 'Số việc'], soCot: [1],
        dong: theoLoai.sort((x, y) => y._n - x._n).map((x) => [x._k, x._n]) },
      /* LIỆT KÊ CỤ THỂ VIỆC ĐÃ LÀM. Con số "33 việc đã xong" không chứng minh
       * được gì khi trình ra; danh sách tên việc kèm link kết quả thì có. Đây
       * cũng là thứ nhân sự cần nhất ở phiếu của mình. */
      { tieuDe: 'Việc đã xong trong kỳ — liệt kê',
        cot: ['Hạn', 'Việc', 'Loại', 'Chiến dịch', 'Kết quả'],
        dong: xong.slice().sort((x, y) => ngayCua(y) - ngayCua(x)).slice(0, 60).map((t) => [
          ngayCua(t) ? new Date(ngayCua(t)).toLocaleDateString('vi-VN') : '',
          (t.title || '(không tên)').slice(0, 90), nhanOf(t.workType),
          nhanOf(t.campaign), linkCua(t) ? 'có link' : '—']) },
      { tieuDe: 'Việc quá hạn',
        cot: ['Việc', 'Loại', 'Người', 'Hạn'],
        dong: quaHan.slice().sort((x, y) => han(x) - han(y)).slice(0, 30).map((t) => [
          t.title || '(không tên)', nhanOf(t.workType),
          (t.owner || []).map((u) => u.name || u.id).join(', '),
          han(t) ? new Date(han(t)).toLocaleDateString('vi-VN') : '']) },
    ].filter((x) => x.dong.length),
  };
}

/* ================= LỊCH TÁC NGHIỆP ================= */
async function docLich(app, tu, den, pv) {
  /* App Lịch trả luôn danh sách trong /api/meta (khoá `items`) và không nhận
   * from/to, nên lọc theo `start` ở đây. Bản đầu đoán các khoá `tong`/`choDuyet`
   * không tồn tại nên ô nào cũng ra 0 mà vẫn báo "đọc được" — im lặng sai còn
   * tệ hơn báo lỗi. */
  const d = await goi(app, '/api/meta');
  const it = (d.items || []).filter((x) => {
    const ng = String(x.start || '').slice(0, 10);
    if (!ng || ng < tu || ng > den) return false;
    if (pv && ![...(x.owner || []), ...(x.staff || [])]
      .some((u) => PV.laCuaNguoi(pv, u.name || u.id))) return false;
    return true;
  });
  const dem = (...tt) => it.filter((x) => tt.includes(nhanOf(x.status))).length;
  const huy = dem('Hủy lịch', 'Từ chối', 'Từ chối/Cần điều chỉnh');
  const cong = (f) => it.reduce((s, x) => s + so(x[f]), 0);

  /* GIỜ TÁC NGHIỆP TỰ TÍNH TỪ start/end, KHÔNG lấy cột `hours`.
   *
   * `hours` là ô công thức của Base: (kết thúc − bắt đầu). Buổi nào chưa nộp báo
   * cáo thì chưa có giờ kết thúc, và công thức lấy 0 trừ đi mốc bắt đầu, ra
   * -1.110.497 "giờ". Cộng cả cột lên là con số vô nghĩa.
   *
   * Dùng đúng luật của app sở hữu chỉ số này (realHours trong Lịch tác nghiệp):
   * chỉ tính buổi có ĐỦ hai đầu và kết thúc sau bắt đầu. Buổi chưa xong thì
   * không góp giờ — và ô ghi rõ bao nhiêu trên bao nhiêu buổi đã góp, để không
   * ai đọc con số này như giờ của cả kỳ. */
  let soBuoiCoGio = 0;
  const gioThuc = it.reduce((s, x) => {
    const a = Date.parse(x.start), b = Date.parse(x.end);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return s;
    soBuoiCoGio += 1;
    return s + (b - a) / 36e5;
  }, 0);
  const tt = gomTheo(it, (x) => nhanOf(x.status) || '(trống)', []);
  /* Địa điểm: app Lịch có cột `diaDiem` mà báo cáo chưa bao giờ đọc tới. Đây là
   * thứ duy nhất nói được phòng đã ra những đâu trong kỳ — và nhìn ra chỗ nào đi
   * nhiều mà tốn kém thì mới bàn được chuyện gộp buổi. */
  const dd = gomTheo(it.filter((x) => nhanOf(x.diaDiem)),
    (x) => nhanOf(x.diaDiem), ['costActual']);
  const chuaGhiDd = it.length - dd.reduce((a, x) => a + x._n, 0);

  /* Giờ tác nghiệp theo người — đây là con số duy nhất trong app Lịch nói được
   * "ai ra hiện trường bao nhiêu". Chia đều giờ của buổi cho những người cùng
   * đi, chứ không cộng đủ giờ cho từng người: bốn người đi một buổi bốn tiếng là
   * bốn tiếng của phòng, không phải mười sáu. */
  const gioNguoi = new Map();
  it.forEach((x) => {
    const a2 = Date.parse(x.start), b2 = Date.parse(x.end);
    if (!Number.isFinite(a2) || !Number.isFinite(b2) || b2 <= a2) return;
    const ds = (x.owner || x.staff || []).map((u) => u.name || u.id).filter(Boolean);
    const ten = ds.length ? ds : ['(chưa ghi người)'];
    const phan = ((b2 - a2) / 36e5) / ten.length;
    ten.forEach((t) => gioNguoi.set(t, (gioNguoi.get(t) || 0) + phan));
  });

  return {
    o: [
      { nhan: 'Buổi tác nghiệp', so: it.length, dinhDang: 'so', chinh: true },
      { nhan: 'Đã hoàn tất', so: dem('Đã hoàn tất'), dinhDang: 'so',
        ghi: it.length ? Math.round((dem('Đã hoàn tất') / it.length) * 100) + '% số buổi' : '' },
      { nhan: 'Duyệt / chờ tác nghiệp', so: dem('Duyệt/Chờ tác nghiệp'), dinhDang: 'so' },
      { nhan: 'Chờ duyệt', so: dem('Chờ duyệt/Xử lý', 'Đang lên kế hoạch'), dinhDang: 'so', muc: 'vua' },
      { nhan: 'Huỷ / từ chối', so: huy, dinhDang: 'so', dao: true, muc: huy ? 'vua' : 'ok' },
      { nhan: 'Giờ tác nghiệp', so: Math.round(gioThuc * 10) / 10, dinhDang: 'so2',
        ghi: soBuoiCoGio === it.length
          ? 'giờ'
          : 'giờ · ' + soBuoiCoGio + '/' + it.length + ' buổi đã có giờ kết thúc' },
      { nhan: 'Chi phí thực tế', so: cong('costActual'), dinhDang: 'vnd', trungTinh: true },
      { nhan: 'Dự toán', so: cong('costPlan'), dinhDang: 'vnd' },
      { nhan: 'Chênh dự toán', so: cong('costActual') - cong('costPlan'), dinhDang: 'vnd', dao: true },
      { nhan: 'Có báo cáo sau buổi', so: it.filter((x) => x.reportAfter || x.report).length, dinhDang: 'so' },
      { nhan: 'Số địa điểm đã đến', so: dd.length, dinhDang: 'so',
        ghi: chuaGhiDd ? chuaGhiDd + '/' + it.length + ' buổi chưa ghi địa điểm' : '' },
    ],
    cot: {
      nhan: 'Buổi theo trạng thái',
      don: 'so',
      muc: tt.slice().sort((x, y) => y._n - x._n).map((x) => ({ nhan: x._k, so: x._n })),
    },
    thanh: {
      nhan: 'Địa điểm tác nghiệp nhiều nhất',
      don: 'so',
      muc: dd.slice().sort((x, y) => y._n - x._n).map((x) => ({ nhan: x._k, so: x._n })),
    },
    thanh2: {
      nhan: 'Giờ tác nghiệp theo người',
      don: 'so2',
      muc: [...gioNguoi.entries()].sort((x, y) => y[1] - x[1])
        .map(([ten, g]) => ({ nhan: ten, so: Math.round(g * 10) / 10 })),
    },
    bang: [
      { tieuDe: 'Theo địa điểm',
        cot: ['Địa điểm', 'Số buổi', 'Chi phí thực tế'], soCot: [1, 2],
        dong: dd.slice().sort((x, y) => y._n - x._n)
          .map((x) => [x._k, x._n, so(x.costActual)]) },
      { tieuDe: 'Buổi tác nghiệp trong kỳ',
        cot: ['Ngày', 'Nội dung', 'Địa điểm', 'Trạng thái', 'Người', 'Chi phí'],
        soCot: [5],
        dong: it.slice().sort((x, y) => String(x.start).localeCompare(String(y.start)))
          .slice(0, 40).map((x) => [String(x.start || '').slice(0, 10),
            x.title || '(không tên)', nhanOf(x.diaDiem) || '—', nhanOf(x.status),
            (x.owner || x.staff || []).map((u) => u.name || u.id).join(', '), so(x.costActual)]) },
    ].filter((x) => x.dong.length),
  };
}

/* ================= QUỸ CHI PHÍ =================
 * App Quỹ không có đường lọc theo kỳ cho TỪNG khoản — `/api/tong-quan` của nó
 * chỉ trả mấy con số gộp. Nhưng `/api/meta` trả nguyên 169 dòng chi kèm loại,
 * người và ngày, nên lọc kỳ ngay tại đây là đủ, không phải sửa app của họ.
 *
 * Lọc theo NGÀY ĐỀ NGHỊ chứ không phải ngày chi — đó là ngày khoản chi phát
 * sinh. Ngày chi có thể còn trống (chưa chi), lọc theo nó thì khoản mới nhất
 * biến mất khỏi báo cáo.
 */
async function docQuyChiPhi(app, tu, den) {
  const d = await goi(app, '/api/meta');
  const tatCa = d.chi || [];
  const q = d.quy || {};
  const trongKy = tatCa.filter((r) => {
    const ng = String(r.ngayDeNghi || '').slice(0, 10);
    return ng && ng >= tu && ng <= den;
  });
  const tien = (ds) => ds.reduce((s, r) => s + so(r.tien), 0);
  const tongKy = tien(trongKy);
  const dem = (tt) => tatCa.filter((r) => r.tinhTrang === tt).length;

  const theoLoai = gomTheo(trongKy, (r) => nhanOf(r.loai) || '(chưa phân loại)', ['tien']);
  const theoNguoi = gomTheo(trongKy, (r) => nhanOf(r.nguoi) || '(chưa rõ)', ['tien']);
  /* Chi theo ngày để vẽ đường — gom sẵn ở đây vì `chuoi` cần mảng đã theo ngày. */
  const theoNgay = gomTheo(trongKy, (r) => String(r.ngayDeNghi || '').slice(0, 10), ['tien'])
    .sort((a, b) => a._k.localeCompare(b._k));

  return {
    o: [
      { nhan: 'Chi trong kỳ', so: tongKy, dinhDang: 'vnd', chinh: true, trungTinh: true,
        ghi: trongKy.length + ' khoản' },
      { nhan: 'Còn trong quỹ', so: so(q.conLai), dinhDang: 'vnd',
        ghi: 'đã ứng ' + so(q.soLanUng) + ' lần' },
      { nhan: 'Chi trung bình một khoản', so: trongKy.length ? tongKy / trongKy.length : 0,
        dinhDang: 'vnd', trungTinh: true },
      { nhan: 'Khoản lớn nhất', so: Math.max(0, ...trongKy.map((r) => so(r.tien))), dinhDang: 'vnd', trungTinh: true },
      { nhan: 'Số loại chi', so: theoLoai.length, dinhDang: 'so' },
      { nhan: 'Người đề nghị', so: theoNguoi.length, dinhDang: 'so' },
      { nhan: 'Chờ chi', so: dem('Chờ chi'), dinhDang: 'so', dao: true,
        muc: dem('Chờ chi') ? 'vua' : 'ok' },
      { nhan: 'Chờ quyết toán', so: dem('Đã chi'), dinhDang: 'so', dao: true,
        muc: dem('Đã chi') ? 'vua' : 'ok', ghi: 'tiền đã ra, chưa khoá sổ' },
      { nhan: 'Thiếu chứng từ', so: trongKy.filter((r) => !(r.chungTu || []).length).length,
        dinhDang: 'so', dao: true },
      { nhan: 'Đã chi từ đầu quỹ', so: so(q.tongChi), dinhDang: 'vnd', trungTinh: true },
    ],
    chuoi: {
      nhan: 'Chi theo ngày đề nghị',
      diem: theoNgay.map((x) => ({ x: x._k, tien: x.tien, soKhoan: x._n })),
      duong: [{ key: 'tien', label: 'Số tiền', mau: '#7a3cff' },
        { key: 'soKhoan', label: 'Số khoản', mau: '#d98300', truc: 2 }],
    },
    tron: {
      nhan: 'Cơ cấu chi theo loại',
      giua: 'Chi',
      phan: theoLoai.map((x) => ({ nhan: x._k, so: x.tien })).filter((x) => x.so),
    },
    bang: [
      { tieuDe: 'Theo loại chi',
        cot: ['Loại', 'Số khoản', 'Số tiền', '% chi kỳ'],
        soCot: [1, 2, 3],
        dong: theoLoai.sort((a, b) => b.tien - a.tien)
          .map((x) => [x._k, x._n, x.tien, tongKy ? Math.round((x.tien / tongKy) * 1000) / 10 : 0]) },
      { tieuDe: 'Theo người đề nghị',
        cot: ['Người', 'Số khoản', 'Số tiền'],
        soCot: [1, 2],
        dong: theoNguoi.sort((a, b) => b.tien - a.tien).map((x) => [x._k, x._n, x.tien]) },
      { tieuDe: 'Khoản chi lớn nhất',
        cot: ['Nội dung', 'Loại', 'Người', 'Ngày đề nghị', 'Số tiền', 'Tình trạng'],
        soCot: [4],
        dong: trongKy.slice().sort((a, b) => so(b.tien) - so(a.tien)).slice(0, 20)
          .map((r) => [String(r.noiDung || '(không ghi)').slice(0, 80), nhanOf(r.loai),
            nhanOf(r.nguoi), String(r.ngayDeNghi || '').slice(0, 10), so(r.tien),
            nhanOf(r.tinhTrang)]) },
    ].filter((b) => b.dong.length),
  };
}

/* ================= SÁU APP CÒN LẠI =================
 * Sáu app này đều cấp `/api/tong-quan` theo quy ước chung của Hub: một mảng
 * `the` gồm các ô đã có sẵn nhãn, số, định dạng và mức nghiêm trọng. Không phải
 * viết bộ đọc riêng cho từng cái — chép thẳng mảng đó sang là xong, và app nào
 * thêm chỉ số mới thì báo cáo tự có theo.
 *
 * ĐÁNH ĐỔI, nói trước: quy ước `the` KHÔNG mang khoảng thời gian cho mọi app.
 * Cái nào nhận `tu`/`den` thì lọc đúng kỳ; cái nào không thì trả số tại thời
 * điểm mở (tồn kho, số đang chờ xử lý). Ô nào thuộc loại đó được gắn cờ
 * `hienTai` để giao diện ghi rõ "số hiện tại", chứ không để người đọc tưởng nó
 * là số phát sinh trong kỳ.
 */
function chepThe(d, hienTai) {
  return (d.the || []).map((t) => ({
    nhan: t.nhan,
    so: so(t.so),
    dinhDang: t.dinhDang || 'so',
    chinh: !!t.chinh,
    muc: t.muc,
    ghi: t.ghi || '',
    /* App con tự biết ô nào "thấp là tốt" — nhưng quy ước `the` chưa mang cờ
     * đó, nên suy từ mức nghiêm trọng: ô nào app đánh dấu là đáng lo thì càng
     * nhiều càng xấu. */
    dao: t.muc === 'cao' || t.muc === 'vua',
    hienTai: !!hienTai,
  }));
}

/* ================= KOL =================
 * Trước đây khối này chỉ chép `/api/tong-quan` của app KOL, tức là bốn ô TRẠNG
 * THÁI CÔNG VIỆC: chờ BGĐ duyệt, sắp đi, bàn giao quá hạn, đến hạn nhập số.
 * Đọc xong không biết tiền bỏ ra đổi được cái gì.
 *
 * Nên đọc thẳng `/api/du-lieu` và báo KẾT QUẢ: bài KOL đã đăng, lượt xem và
 * tương tác bài đó mang về, tệp theo dõi của kênh đã đăng, tiền và giá trị FOC
 * đã bỏ ra, rồi chia ra giá mỗi nghìn lượt xem. Bốn ô trạng thái cũ vẫn giữ,
 * nhưng xuống cuối — việc cần làm là phần phụ của báo cáo kết quả.
 */
async function docKol(app, tu, den) {
  const d = await goi(app, '/api/du-lieu');
  const a = new Date(tu + 'T00:00:00Z').getTime();
  const b = new Date(den + 'T23:59:59Z').getTime();
  const trong = (ms) => ms >= a && ms <= b;

  const dsKol = (d.kol || []).filter((x) => !x.daXoa);
  const dsKenh = d.kenh || [];
  const dsHt = d.hopTac || [];
  const dsBg = d.banGiao || [];
  const tenKol = new Map(dsKol.map((k) => [k.id, k.ten]));
  const kenhTheo = new Map(dsKenh.map((k) => [k.id, so(k.theoDoi)]));

  /* "Trong kỳ" của hợp tác tính theo NGÀY BẮT ĐẦU chuyến đi, của bài bàn giao
   * tính theo NGÀY ĐĂNG. Hai mốc khác nhau vì hai việc khác nhau: tiền tiêu khi
   * đoàn đi, còn kết quả về khi bài lên sóng — có khi lệch nhau cả tháng. */
  const htKy = dsHt.filter((h) => trong(msOf(h.batDau)));
  const dangKy = dsBg.filter((x) => nhanOf(x.trangThai) === 'Đã đăng' && trong(msOf(x.ngayDang)));

  const cong = (ds, f) => ds.reduce((t, x) => t + so(x[f]), 0);
  const tienMat = cong(htKy, 'tienCongTy');
  const foc = cong(htKy, 'giaTriFOC');
  const tongChi = tienMat + foc;
  const khach = cong(htKy, 'nguoiLon') + cong(htKy, 'treEm') + cong(htKy, 'emBe');

  /* 0 ≠ CHƯA ĐO ĐƯỢC. Bài mới đăng chưa tới mốc 7 ngày thì `xem7` là null, không
   * phải 0 lượt xem. Cộng null thành 0 rồi chia trung bình là bịa ra một con số
   * thấp hơn sự thật — nên đếm riêng bài đã có số và ghi rõ trên ô. */
  const coSo = dangKy.filter((x) => x.xem7 != null);
  const xem7 = cong(coSo, 'xem7');
  const tt7 = cong(coSo, 'thich7') + cong(coSo, 'binhLuan7')
    + cong(coSo, 'chiaSe7') + cong(coSo, 'luu7');
  const ghiSo = coSo.length === dangKy.length ? ''
    : coSo.length + '/' + dangKy.length + ' bài đã có số 7 ngày';

  /* Tệp theo dõi CHẠM TỚI: cộng follower của các kênh đã đăng bài trong kỳ, mỗi
   * kênh đếm một lần. Đây là quy mô tiếp cận tiềm năng, KHÔNG phải số người đã
   * xem — nói rõ trên ô để không ai đọc nhầm thành lượt xem. */
  const kenhDaDang = new Set();
  dangKy.forEach((x) => (x.kenhDang || []).forEach((k) => kenhDaDang.add(k)));
  const tepTheoDoi = [...kenhDaDang].reduce((t, k) => t + (kenhTheo.get(k) || 0), 0);

  const dungChuan = dangKy.filter((x) => x.theTag && x.cta).length;
  const treHan = dsBg.filter((x) => nhanOf(x.trangThai) !== 'Đã đăng'
    && msOf(x.hanDang) && msOf(x.hanDang) < Date.now()).length;

  /* Bảng theo KOL — ai mang về nhiều nhất trên mỗi đồng bỏ ra. */
  const theoKol = new Map();
  const oKol = (id) => {
    if (!theoKol.has(id)) {
      theoKol.set(id, { ten: tenKol.get(id) || '(không rõ)', bai: 0, xem: 0, tt: 0, chi: 0 });
    }
    return theoKol.get(id);
  };
  htKy.forEach((h) => { const o = oKol(h.kol); o.chi += so(h.tienCongTy) + so(h.giaTriFOC); });
  const kolCuaHt = new Map(dsHt.map((h) => [h.id, h.kol]));
  dangKy.forEach((x) => {
    const o = oKol(kolCuaHt.get(x.hopTac));
    o.bai += 1; o.xem += so(x.xem7);
    o.tt += so(x.thich7) + so(x.binhLuan7) + so(x.chiaSe7) + so(x.luu7);
  });
  const bangKol = [...theoKol.values()].sort((x, y) => y.xem - x.xem);

  /* Tiền và kết quả của KOL KHÔNG rơi vào cùng một kỳ: hợp tác trả tiền lúc đoàn
   * đi, còn bài lên sóng có khi cả tháng sau. Nếu kỳ này chỉ có một trong hai
   * đầu thì phải nói ra, không thì người đọc lấy tử số kỳ này chia mẫu số kỳ
   * khác rồi kết luận nhầm về hiệu quả. */
  const luuY = [];
  if (dangKy.length && !htKy.length) {
    luuY.push('Kỳ này có bài KOL lên sóng nhưng không hợp tác nào khởi hành — '
      + 'tiền cho những bài này đã chi ở kỳ trước, nên khối này chưa tính được giá mỗi lượt xem.');
  }
  if (htKy.length && !dangKy.length) {
    luuY.push('Kỳ này có hợp tác khởi hành nhưng chưa bài nào lên sóng — '
      + 'chi phí đã phát sinh, kết quả sẽ rơi vào kỳ sau.');
  }
  if (dangKy.length && !coSo.length) {
    luuY.push('Chưa bài nào tới mốc đo 7 ngày hoặc chưa ai nhập số, nên lượt xem '
      + 'để trống chứ không phải bằng 0.');
  }

  return {
    luuY,
    o: [
      { nhan: 'Bài KOL đã lên sóng', so: dangKy.length, dinhDang: 'so', chinh: true },
      { nhan: 'Lượt xem 7 ngày', so: xem7, dinhDang: 'so', chinh: true, ghi: ghiSo },
      { nhan: 'Tương tác 7 ngày', so: tt7, dinhDang: 'so', ghi: ghiSo },
      { nhan: 'Tệp theo dõi chạm tới', so: tepTheoDoi, dinhDang: 'so',
        ghi: kenhDaDang.size + ' kênh đã đăng · là quy mô tiếp cận, không phải số người đã xem' },
      /* Hai ô trung bình cũng chỉ hiện khi có mẫu số thật. Không có bài nào đã
       * đo mà vẫn in "0 lượt xem mỗi bài" thì người đọc hiểu là bài KOL không ai
       * xem, trong khi sự thật là chưa tới ngày đo. */
      ...(coSo.length ? [{ nhan: 'Xem trung bình mỗi bài',
        so: xem7 / coSo.length, dinhDang: 'so' }] : []),
      ...(xem7 ? [{ nhan: 'Tương tác trên 1.000 lượt xem',
        so: (tt7 / xem7) * 1000, dinhDang: 'so2' }] : []),
      { nhan: 'Chi cho KOL', so: tongChi, dinhDang: 'vnd', trungTinh: true,
        ghi: tongChi
          ? 'tiền mặt ' + gonTrieu(tienMat) + ' + FOC ' + gonTrieu(foc)
          : 'không hợp tác nào khởi hành trong kỳ này' },
      /* HAI Ô GIÁ CHỈ HIỆN KHI CÓ CẢ TỬ SỐ LẪN MẪU SỐ. Thiếu một đầu mà vẫn in
       * thì ra "0 đ mỗi nghìn lượt xem" — đọc như KOL không tốn xu nào, trong
       * khi sự thật là tiền tiêu ở kỳ khác. Thà trống còn hơn rẻ giả. */
      ...(tongChi && xem7 ? [{ nhan: 'Giá mỗi 1.000 lượt xem',
        so: (tongChi / xem7) * 1000, dinhDang: 'vnd', dao: true }] : []),
      ...(tongChi && dangKy.length ? [{ nhan: 'Giá mỗi bài lên sóng',
        so: tongChi / dangKy.length, dinhDang: 'vnd', dao: true }] : []),
      { nhan: 'Bài đúng chuẩn gắn thẻ + CTA', so: dungChuan, dinhDang: 'so',
        ghi: dangKy.length ? Math.round((dungChuan / dangKy.length) * 100) + '% số bài' : '' },
      { nhan: 'Hợp tác khởi hành trong kỳ', so: htKy.length, dinhDang: 'so' },
      { nhan: 'Lượt khách KOL đi tour', so: khach, dinhDang: 'so' },
      { nhan: 'Bài quá hạn chưa đăng', so: treHan, dinhDang: 'so', dao: true,
        muc: treHan ? 'cao' : 'ok' },
    ],
    cot: {
      nhan: 'Lượt xem 7 ngày mang về, theo KOL',
      don: 'so',
      muc: bangKol.filter((x) => x.xem).map((x) => ({ nhan: x.ten, so: x.xem })),
    },
    bang: [
      { tieuDe: 'Kết quả theo KOL',
        cot: ['KOL', 'Bài đã đăng', 'Lượt xem 7 ngày', 'Tương tác', 'Chi', 'Giá mỗi 1.000 xem'],
        soCot: [1, 2, 3, 4, 5],
        dong: bangKol.map((x) => [x.ten, x.bai, x.xem, x.tt, x.chi,
          x.xem ? Math.round((x.chi / x.xem) * 1000) : 0]) },
      { tieuDe: 'Bài KOL đã lên sóng trong kỳ',
        cot: ['Ngày đăng', 'Bài', 'Loại', 'Nền tảng', 'Xem 7 ngày', 'Tương tác 7 ngày'],
        soCot: [4, 5],
        dong: dangKy.slice().sort((x, y) => msOf(y.ngayDang) - msOf(x.ngayDang)).slice(0, 30)
          .map((x) => [new Date(msOf(x.ngayDang)).toLocaleDateString('vi-VN'),
            (x.ten || '(không tên)').slice(0, 80), x.loai || '',
            (x.nenTang || []).join(', '),
            x.xem7 == null ? '—' : so(x.xem7),
            x.xem7 == null ? '—' : so(x.thich7) + so(x.binhLuan7) + so(x.chiaSe7) + so(x.luu7)]) },
      { tieuDe: 'Việc KOL còn phải xử lý',
        cot: ['Việc', 'Số'], soCot: [1],
        dong: (d.canXuLy || []).map((x) => [x.nhan || x.ten || '', so(x.so)])
          .concat(treHan ? [['Bài quá hạn chưa đăng', treHan]] : []) },
    ].filter((x) => x.dong.length),
  };
}

/** App nhận khoảng thời gian: Chỉnh ảnh · Báo cáo công việc. */
async function docTheoKy(app, tu, den) {
  const d = await goi(app, '/api/tong-quan?tu=' + tu + '&den=' + den
    + '&from=' + tu + '&to=' + den);
  return { o: chepThe(d, false), bang: [] };
}

/**
 * HẬU KỲ — ẢNH & VIDEO. Gộp hai nguồn, vì không nguồn nào đủ một mình.
 *
 * App "Chỉnh ảnh & Edit video" đáng lẽ là nguồn chuẩn: nó có nghiệm thu, có
 * phân loại ảnh/video, có gửi nhóm. Nhưng Base của nó hiện CHƯA CÓ PHIẾU NÀO —
 * mọi ô đều bằng 0. Khối này trước đây in tám con số 0 mà không nói gì thêm,
 * đọc y như phòng cả tháng không dựng được cái video nào.
 *
 * Trong khi đó Bảng công việc có 90 việc "Edit Video" và 184 việc "Thiết kế",
 * phần lớn đã hoàn thành. Đó mới là chỗ ghi lại công hậu kỳ thật.
 *
 * Nên: lấy số từ Bảng công việc, giữ số app Chỉnh ảnh làm phần nghiệm thu, và
 * nói rõ ô nào từ đâu. Một lưu ý phải nêu: MỘT VIỆC KHÔNG CHẮC LÀ MỘT VIDEO —
 * một dòng trên bảng có thể gồm cả loạt. Gọi đúng tên là "việc", không gọi là
 * "video", rồi để người đọc tự biết cái mình đang đếm.
 */
async function docHauKy(app, tu, den, pv) {
  const a = new Date(tu + 'T00:00:00Z').getTime();
  const b = new Date(den + 'T23:59:59Z').getTime();

  /* Hai nguồn đọc song song, và HỎNG MỘT BÊN KHÔNG KÉO ĐỔ BÊN KIA: app Chỉnh
   * ảnh tắt thì vẫn phải báo được số việc hậu kỳ trên bảng, và ngược lại. */
  const bangCv = APP.find((x) => x.id === 'cong-viec');
  const [ca, cv] = await Promise.all([
    goi(app, '/api/tong-quan?tu=' + tu + '&den=' + den).catch(() => null),
    bangCv ? goi(bangCv, '/api/tasks').catch(() => null) : Promise.resolve(null),
  ]);
  if (!ca && !cv) throw new Error('không đọc được cả app Chỉnh ảnh lẫn Bảng công việc');

  const viec = (cv && cv.tasks) || [];
  const han = (t) => msOf(t.deadline);
  const trongKy = viec.filter((t) => { const x = han(t); return x >= a && x <= b; });
  const nhomHauKy = (t) => {
    const k = nhanOf(t.workType);
    return k === 'Edit Video' || k === 'Thiết kế' ? k : null;
  };
  const hk = trongKy.filter(nhomHauKy).filter((t) => !pv
    || (t.owner || []).some((u) => PV.laCuaNguoi(pv, u.name || u.id)));
  const xong = (ds) => ds.filter((t) => nhanOf(t.status) === 'Hoàn thành');
  const video = hk.filter((t) => nhanOf(t.workType) === 'Edit Video');
  const thietKe = hk.filter((t) => nhanOf(t.workType) === 'Thiết kế');
  const coKetQua = (t) => (t.fileKetQua || []).length || (t.attachment || []).length || t.linkKetQua;

  const nguoiCua = (t) => (t.owner || []).map((u) => u.name || u.id).join(', ') || '(chưa giao)';
  const theoNguoi = gomTheo(xong(hk), nguoiCua, []);

  const dem = (v) => so(v);
  const tuBang = 'từ Bảng công việc';
  const o = [];
  if (cv) {
    o.push(
      { nhan: 'Việc Edit Video đã xong', so: xong(video).length, dinhDang: 'so', chinh: true,
        ghi: tuBang + ' · ' + video.length + ' việc đến hạn trong kỳ' },
      { nhan: 'Việc Thiết kế đã xong', so: xong(thietKe).length, dinhDang: 'so', chinh: true,
        ghi: tuBang + ' · ' + thietKe.length + ' việc đến hạn trong kỳ' },
      { nhan: 'Tổng sản phẩm hậu kỳ', so: xong(hk).length, dinhDang: 'so',
        ghi: 'edit video + thiết kế' },
      /* Gọi là "hoàn thành", KHÔNG gọi là "đúng hạn". Bảng việc chỉ có deadline,
       * không có ngày hoàn thành — một việc hạn mùng 5 mà đến 28 mới tick xong
       * vẫn nằm trong con số này. Nói "đúng hạn" là hứa một điều số liệu không
       * kiểm được. */
      { nhan: 'Tỷ lệ hoàn thành', so: hk.length ? (xong(hk).length / hk.length) * 100 : 0,
        dinhDang: 'pt', ghi: xong(hk).length + '/' + hk.length
          + ' việc đến hạn đã báo xong · bảng không ghi ngày hoàn thành nên không rõ có kịp hạn không' },
      { nhan: 'Có file hoặc link kết quả', so: hk.filter(coKetQua).length, dinhDang: 'so',
        ghi: hk.length ? Math.round((hk.filter(coKetQua).length / hk.length) * 100)
          + '% số việc — phần còn lại báo xong nhưng không đính sản phẩm' : '' },
      { nhan: 'Người làm hậu kỳ', so: theoNguoi.length, dinhDang: 'so' },
    );
  }
  if (ca) {
    o.push(
      { nhan: 'Lô sản phẩm đã báo', so: dem(ca.soBaoCao), dinhDang: 'so', ghi: 'từ app Chỉnh ảnh' },
      { nhan: 'Ảnh đã chỉnh', so: dem(ca.soAnh), dinhDang: 'so', ghi: 'từ app Chỉnh ảnh' },
      { nhan: 'Video đã dựng (có nghiệm thu)', so: dem(ca.soVideo), dinhDang: 'so',
        ghi: 'từ app Chỉnh ảnh' },
      { nhan: 'Chờ nghiệm thu', so: dem(ca.choNghiemThu), dinhDang: 'so', dao: true,
        muc: dem(ca.choNghiemThu) ? 'vua' : 'ok' },
      { nhan: 'Đã nghiệm thu đạt', so: dem(ca.dat), dinhDang: 'so' },
      { nhan: 'Cần sửa lại', so: dem(ca.canSua), dinhDang: 'so', dao: true },
    );
  }

  const luuY = [];
  if (cv) {
    luuY.push('Số việc KHÔNG bằng số video: một dòng "Edit Video" trên Bảng công việc '
      + 'có thể là một video, cũng có thể là cả loạt. Đây là số VIỆC hậu kỳ đã xong.');
  }
  if (ca && !dem(ca.soBaoCao)) {
    luuY.push('App Chỉnh ảnh & Edit video chưa có phiếu nào trong kỳ — sáu ô nghiệm thu '
      + 'bên dưới bằng 0 vì chưa ai lập phiếu, không phải vì không có sản phẩm. '
      + 'Nghiệm thu chất lượng vẫn đang nằm ngoài hệ thống.');
  }
  if (!ca) luuY.push('Không đọc được app Chỉnh ảnh — chỉ còn số từ Bảng công việc.');
  if (!cv) luuY.push('Không đọc được Bảng công việc — chỉ còn số nghiệm thu của app Chỉnh ảnh.');

  return {
    luuY,
    o,
    thanh: {
      nhan: 'Sản phẩm hậu kỳ đã xong, theo người',
      don: 'so',
      muc: theoNguoi.slice().sort((x, y) => y._n - x._n).map((x) => ({ nhan: x._k, so: x._n })),
    },
    bang: [
      { tieuDe: 'Việc hậu kỳ đến hạn trong kỳ',
        cot: ['Việc', 'Loại', 'Người', 'Trạng thái', 'Hạn', 'Kết quả'],
        dong: hk.slice().sort((x, y) => han(y) - han(x)).slice(0, 40).map((t) => [
          (t.title || '(không tên)').slice(0, 80), nhanOf(t.workType), nguoiCua(t),
          nhanOf(t.status), han(t) ? new Date(han(t)).toLocaleDateString('vi-VN') : '',
          coKetQua(t) ? 'có' : '—']) },
      { tieuDe: 'Cần xử lý',
        cot: ['Việc', 'Số'], soCot: [1],
        dong: ((ca && ca.canXuLy) || []).map((x) => [x.nhan || x.ten || '', so(x.so)]) },
    ].filter((x) => x.dong.length),
  };
}

const BO_DOC = {
  social: docSocial,
  'quang-cao': docQuangCao,
  ota: docOta,
  'cong-viec': docCongViec,
  'lich-tac-nghiep': docLich,
  'quy-chi-phi': docQuyChiPhi,
  'chinh-anh': docHauKy,
  kol: docKol,
  live: docLiveRieng,
};

/**
 * GẮN MỤC TIÊU VÀO CÁC Ô ĐÃ DỰNG.
 *
 * Chỉ gắn cho những chỉ số bộ luật thật sự có mục tiêu. Ô nào không có thì để
 * nguyên — KHÔNG bịa một mục tiêu bằng 0 hay bằng kỳ trước, vì "chưa đặt mục
 * tiêu" và "đặt mục tiêu 0" là hai chuyện khác hẳn nhau.
 *
 * Bộ luật đặt mục tiêu theo TỪNG KÊNH. Cộng lại thành mục tiêu phòng là hợp lệ
 * với các chỉ số cộng được (view, follow, lead) — không áp dụng cho tỷ lệ.
 */
function ganMucTieu(base, mt) {
  const p = mt.phong;
  const dat = (b, nhan, khoa) => {
    if (!b || !b.chay || !Number.isFinite(p[khoa]) || p[khoa] <= 0) return;
    const i = (b.o || []).findIndex((x) => x.nhan === nhan);
    if (i < 0) return;
    b.o[i] = MT.gan(b.o[i], p[khoa]);
  };
  const social = base.find((x) => x.id === 'social');
  const live = base.find((x) => x.id === 'live');

  dat(social, 'Lượt xem', 'view');
  dat(social, 'Follower tăng', 'follow');
  dat(social, 'Lead', 'lead');
  dat(live, 'Lượt xem', 'liveView');
  dat(live, 'Follow mới', 'liveFollow');
  dat(live, 'Bình luận', 'liveComment');

  /* Bảng "Theo kênh" của Social là chỗ mục tiêu có ích nhất: nó cho biết kênh
   * nào kéo cả phòng xuống. Thêm ba cột — mục tiêu view, % đạt, và mục tiêu
   * follow — chứ không thêm hết mọi chỉ số, bảng sẽ không đọc nổi. */
  if (social && social.chay) {
    const bg = (social.bang || []).find((x) => x.tieuDe === 'Theo kênh');
    if (bg && !bg.cot.includes('Mục tiêu xem')) {
      bg.cot = ['Kênh', 'Nền tảng', 'Follower', 'Follower tăng', 'Lượt xem',
        'Mục tiêu xem', '% đạt', 'Tương tác', 'Bài'];
      bg.soCot = [2, 3, 4, 5, 6, 7, 8];
      bg.dong = bg.dong.map((r) => {
        const k = mt.kenh.get(r[1] + '|' + r[0]);
        const mtXem = k && k.view;
        const xem = so(r[4]);
        return [r[0], r[1], r[2], r[3], r[4],
          mtXem ? Math.round(mtXem) : '—',
          mtXem ? Math.round((xem / mtXem) * 1000) / 10 : '—',
          r[5], r[6]];
      });
    }
  }
}

/**
 * TỆP KHÁCH HÀNG TIẾP CẬN MỚI.
 *
 * Mọi app đều đo phần việc của riêng nó — Social đo lượt xem, LIVE đo phiên,
 * Quảng cáo đo click, KOL đo bài. Không app nào trả lời được câu Sếp hỏi trước
 * nhất: kỳ này có thêm bao nhiêu người mới biết đến Rooty Trip, và mỗi người
 * như vậy tốn bao nhiêu. Khối này gom lại từ các app đã đọc được.
 *
 * Xếp theo độ CHẮC CHẮN, từ xa đến gần: người mới chỉ nhìn thấy → người theo dõi
 * → người chủ động nhắn → người để lại thông tin → người đã đặt. Càng xuống dưới
 * càng ít người mà càng đáng tiền, và đọc dọc xuống là thấy phễu rơi ở đâu.
 *
 * Ô nào không có app nào đo được thì KHÔNG hiện, chứ không hiện số 0 — 0 ở đây
 * sẽ bị đọc thành "không ai biết tới mình", trong khi thật ra là chưa đo.
 */
function gomTepMoi(base, tongChi) {
  const lay = (id, nhan) => {
    const b = base.find((x) => x.id === id);
    if (!b || !b.chay) return null;
    const o = (b.o || []).find((x) => x.nhan === nhan);
    return o && Number.isFinite(so(o.so)) ? { so: so(o.so), lech: o.lech } : null;
  };
  /* Cộng nhiều nguồn cho cùng một ý. Trả null khi KHÔNG nguồn nào đọc được, và
   * ghi tên nguồn đã góp — để người đọc biết con số này gồm những đâu. */
  const congNguon = (ds) => {
    const co = ds.filter((x) => x.v);
    if (!co.length) return null;
    return { so: co.reduce((t, x) => t + x.v.so, 0), nguon: co.map((x) => x.ten) };
  };

  /* Mỗi ô ghi rõ CHỖ NÀO ĐO ĐƯỢC chỉ số đó, không chỉ ghi app nào trả về. Bản
   * trước ghi "từ Social" cho cả lượt tiếp cận lẫn tin nhắn, trong khi tiếp cận
   * chỉ đo được ở Facebook + Instagram còn tin nhắn thì 100% là Zalo OA. */
  const phuSong = (id, nhan) => {
    const b = base.find((x) => x.id === id);
    if (!b || !b.chay) return '';
    const o = (b.o || []).find((x) => x.nhan === nhan);
    if (!o || !o.nen || !o.nen.co.length) return '';
    return o.nen.co.map((k) => k.ten).join(' + ');
  };

  const oList = [
    { nhan: 'Lượt tiếp cận', chinh: true,
      g: congNguon([{ ten: 'Social', v: lay('social', 'Lượt tiếp cận') }]),
      do: phuSong('social', 'Lượt tiếp cận'),
      ghi: 'số lần nội dung hiện ra trước một người — chưa phải số người' },
    { nhan: 'Người theo dõi mới (ròng)', chinh: true,
      g: congNguon([{ ten: 'Social', v: lay('social', 'Follower tăng ròng') },
        { ten: 'LIVE', v: lay('live', 'Follow mới') }]),
      do: phuSong('social', 'Follower tăng ròng') },
    { nhan: 'Tệp theo dõi KOL chạm tới',
      g: congNguon([{ ten: 'KOL', v: lay('kol', 'Tệp theo dõi chạm tới') }]),
      ghi: 'quy mô kênh KOL đã đăng bài' },
    { nhan: 'Click về kênh bán',
      g: congNguon([{ ten: 'Social', v: lay('social', 'Click liên kết') },
        { ten: 'Quảng cáo', v: lay('quang-cao', 'Lượt nhấp') }]) },
    { nhan: 'Người chủ động nhắn tin',
      g: congNguon([{ ten: 'Social', v: lay('social', 'Tin nhắn') },
        { ten: 'LIVE', v: lay('live', 'Tin nhắn') }]),
      do: phuSong('social', 'Tin nhắn') },
    { nhan: 'Lead để lại thông tin', chinh: true,
      g: congNguon([{ ten: 'Social', v: lay('social', 'Lead') },
        { ten: 'LIVE', v: lay('live', 'Lead') }]),
      do: phuSong('social', 'Lead') },
    /* KHÔNG cộng chung "chuyển đổi quảng cáo" với "booking OTA". Một booking đến
     * từ quảng cáo được đếm ở CẢ HAI chỗ: Meta ghi một chuyển đổi, sàn OTA ghi
     * một booking. Cộng lại là đếm đôi. */
    { nhan: 'Booking đã chốt trên OTA', chinh: true,
      g: congNguon([{ ten: 'OTA', v: lay('ota', 'Booking') }]),
      ghi: 'đơn có thật trên sàn Klook · WAUG · GetYourGuide…' },
    { nhan: 'Chuyển đổi quảng cáo ghi nhận',
      g: congNguon([{ ten: 'Quảng cáo', v: lay('quang-cao', 'Chuyển đổi') }]),
      ghi: 'nền tảng quảng cáo tự đếm — trùng một phần với booking OTA, không cộng dồn' },
    { nhan: 'Đơn chốt trên sóng LIVE',
      g: congNguon([{ ten: 'LIVE', v: lay('live', 'Đơn chốt') }]) },
  ];

  const o = oList.filter((x) => x.g).map((x) => ({
    nhan: x.nhan, so: x.g.so, dinhDang: 'so', chinh: !!x.chinh,
    ghi: (x.ghi ? x.ghi + ' · ' : '')
      + (x.do ? 'đo được ở ' + x.do : 'từ ' + x.g.nguon.join(' + ')),
  }));
  if (!o.length) return null;

  /* Giá mỗi người mới. Chỉ tính khi ĐỌC ĐƯỢC tổng chi của cả phòng — chia cho
   * một nửa chi phí thì ra một cái giá rẻ giả, tệ hơn là không có giá nào.
   *
   * KHÔNG còn "chi cho mỗi booking": chia tổng chi của phòng cho booking OTA là
   * gán công của cả phòng cho đơn đến từ chợ của WAUG và GetYourGuide — bảng
   * OTA không có lấy một trường nguồn marketing nào để nói hai bên có liên
   * quan. Hai ô còn lại vẫn là tỷ số thô, nên gọi đúng tên "chia đều", không
   * gọi là chi phí để có được một người. */
  const tim = (nhan) => o.find((x) => x.nhan === nhan);
  if (tongChi) {
    const tdMoi = tim('Người theo dõi mới (ròng)');
    const lead = tim('Lead để lại thông tin');
    if (tdMoi && tdMoi.so > 0) {
      o.push({ nhan: 'Chi phòng chia đều mỗi người theo dõi mới', so: tongChi / tdMoi.so,
        dinhDang: 'vnd', dao: true,
        ghi: 'tỷ số thô — phần lớn tiền quảng cáo chạy để bán tour, không phải để kéo follow' });
    }
    if (lead && lead.so > 0) {
      o.push({ nhan: 'Chi phòng chia đều mỗi lead', so: tongChi / lead.so,
        dinhDang: 'vnd', dao: true, ghi: 'tỷ số thô — chỉ tính lead Social và LIVE đã ghi nhận' });
    }
  }

  /* KHÔNG DỰNG PHỄU Ở ĐÂY NỮA.
   *
   * Bản trước xếp năm ô này thành phễu: tiếp cận → theo dõi → nhắn tin → lead →
   * booking, kèm "rơi 99,9%" và "cứ 516.891 lượt tiếp cận mới có 1 booking".
   * Nhìn thì thuyết phục, nhưng kiểm lại thì năm bậc đó là NĂM TẬP NGƯỜI KHÁC
   * NHAU, không phải năm chặng của một dòng người:
   *
   *   - Lượt tiếp cận chỉ đo được ở Facebook và Instagram (TikTok nối bằng
   *     Display API nên không có reach, Zalo cũng không).
   *   - Người theo dõi mới cũng chỉ Facebook + Instagram.
   *   - Tin nhắn thì 100% là Zalo OA — Facebook, TikTok, Instagram đều bằng 0.
   *   - Lead không có cái nào đến từ Social; cả 12 lead là của các phiên LIVE.
   *   - Booking đến từ WAUG, GetYourGuide, Trip.com — và bảng OTA KHÔNG CÓ một
   *     trường nguồn marketing nào. Khách đặt trên chợ của WAUG, không đi ra từ
   *     bài Facebook của mình.
   *
   * Không có một mã khách, một UTM hay một trường nguồn nào nối năm bậc lại.
   * Thiếu cái đó thì phễu không phải "đo chưa đủ chính xác" — nó là một dòng
   * chảy không tồn tại, và mọi tỷ lệ rút ra từ nó đều vô nghĩa.
   *
   * Phễu thật nằm ở chỗ có quy công thật: trong app Quảng cáo (hiển thị → nhấp
   * → chuyển đổi, cùng một hệ đo, cùng một người) và trong một phiên LIVE (xem
   * → bình luận → lead → đơn, cùng một phiên). Hai chỗ đó đã có phễu riêng. */
  return { o };
}

/* ================= XU HƯỚNG NHIỀU THÁNG =================
 * Báo cáo chỉ so được hai kỳ, nên không phân biệt được "tháng này kém" với
 * "đang xuống dốc ba tháng liền". Phú Quốc làm du lịch theo mùa rất nặng: giảm
 * 51% so tháng trước có thể chỉ là hết cao điểm, cũng có thể là hỏng thật —
 * chỉ nhìn nhiều tháng mới phân biệt được.
 *
 * Đọc NHẸ: chỉ bốn app có số kinh tế, không đọc đủ chín. Quét sáu tháng × chín
 * app là năm mươi tư lượt gọi, người dùng ngồi chờ cả phút để xem một cái bảng.
 */
const APP_XU_HUONG = ['social', 'quang-cao', 'ota', 'quy-chi-phi'];

async function xuHuong(denThang, soThang, docLuat) {
  const n = Math.max(2, Math.min(12, Number(soThang) || 6));
  const [Y, M] = denThang.split('-').map(Number);
  const thang = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(Y, M - 1 - i, 1));
    thang.push(d.toISOString().slice(0, 7));
  }
  const khoang = thang.map((th) => {
    const [y, m] = th.split('-').map(Number);
    return {
      thang: th,
      tu: th + '-01',
      den: th + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0'),
    };
  });

  /* Chạy TUẦN TỰ chứ không Promise.all sáu tháng một lúc: mỗi tháng đã bắn bốn
   * lượt gọi song song rồi, nhân lên hai mươi tư thì các app con bị dồn và bắt
   * đầu trả lỗi timeout — chậm hơn là chạy lần lượt. */
  const ky = [];
  for (const k of khoang) {
    /* eslint-disable no-await-in-loop */
    const d = await gom(k.tu, k.den, undefined, 'khong', docLuat, APP_XU_HUONG);
    ky.push({ ...k, d });
  }

  const lay = (d, id, nhan) => {
    const b = d.base.find((x) => x.id === id);
    if (!b || !b.chay) return null;
    const o = (b.o || []).find((x) => x.nhan === nhan);
    return o && Number.isFinite(so(o.so)) ? so(o.so) : null;
  };
  const oMT = (d, id, nhan) => {
    const b = d.base.find((x) => x.id === id);
    if (!b || !b.chay) return null;
    const o = (b.o || []).find((x) => x.nhan === nhan);
    return o && Number.isFinite(o.mucTieu) ? o.mucTieu : null;
  };

  const DONG = [
    { nhan: 'Tổng chi phí phòng', dinhDang: 'vnd', trungTinh: true,
      lay: (d) => (d.chiPhi && d.chiPhi.doc ? d.chiPhi.tong : null) },
    { nhan: 'Chi quảng cáo', dinhDang: 'vnd', trungTinh: true,
      lay: (d) => lay(d, 'quang-cao', 'Chi tiêu') },
    { nhan: 'Doanh thu ghi công cho QC', dinhDang: 'vnd',
      lay: (d) => lay(d, 'quang-cao', 'Doanh thu từ QC') },
    { nhan: 'ROAS', dinhDang: 'x', lay: (d) => lay(d, 'quang-cao', 'ROAS') },
    { nhan: 'Booking OTA', dinhDang: 'so', lay: (d) => lay(d, 'ota', 'Booking') },
    { nhan: 'Doanh thu OTA', dinhDang: 'vnd', lay: (d) => lay(d, 'ota', 'Doanh thu thu về') },
    { nhan: 'Lượt xem Social', dinhDang: 'so', lay: (d) => lay(d, 'social', 'Lượt xem'),
      mt: (d) => oMT(d, 'social', 'Lượt xem') },
    { nhan: 'Follower tăng ròng', dinhDang: 'so',
      lay: (d) => lay(d, 'social', 'Follower tăng ròng') },
  ];

  return {
    thang,
    /* Tháng nào có base không đọc được thì đánh dấu, để giao diện không vẽ một
     * cột thấp như thể tháng đó làm kém — có khi chỉ là app tắt. */
    thieu: ky.filter((k) => k.d.soChay < k.d.soApp)
      .map((k) => ({ thang: k.thang, doc: k.d.soChay, tong: k.d.soApp })),
    dong: DONG.map((r) => ({
      nhan: r.nhan,
      dinhDang: r.dinhDang,
      trungTinh: !!r.trungTinh,
      diem: ky.map((k) => ({
        thang: k.thang,
        so: r.lay(k.d),
        mucTieu: r.mt ? r.mt(k.d) : null,
      })),
    })),
  };
}

/** @param {(thang:string)=>object|null} docLuat Đọc bộ luật một tháng — truyền
 *  từ server để tầng này không phải biết tới store, và phép thử khỏi cần Base. */
async function gom(tu, den, nguoi, kieuSS, docLuat, chiApp, pv) {
  const truoc = kyTruoc(tu, den, kieuSS === 'khong' ? 'truoc' : kieuSS);
  /* `chiApp` giới hạn danh sách base phải đọc. Bảng xu hướng quét 6 tháng, đọc
   * đủ 9 app mỗi tháng là 54 lượt gọi và người dùng ngồi chờ cả phút — mà bảng
   * đó chỉ cần số của 4 app. */
  let dsApp = chiApp ? APP.filter((x) => chiApp.includes(x.id)) : APP;
  /* PHẠM VI NGƯỜI XEM. Cắt danh sách base TRƯỚC khi gọi, không gọi đủ rồi mới
   * giấu: gọi app mà người ta không được xem là vừa chậm vừa để số đó lọt vào
   * bộ nhớ đệm của trình duyệt. */
  if (pv) dsApp = dsApp.filter((x) => PV.choXem(pv, x.id));
  const base = await Promise.all(dsApp.map(async (app) => {
    const nen = { id: app.id, ten: app.ten, mo: app.mo, mau: app.mau };
    try {
      const r = await BO_DOC[app.id]({ ...app, nguoi }, tu, den, pv);
      return { ...nen, chay: true, bang: [], chuoi: null, tron: null, luuY: [], ...r };
    } catch (e) {
      return { ...nen, chay: false, loi: e.message, o: [], bang: [], chuoi: null, tron: null, luuY: [] };
    }
  }));
  /* MỤC TIÊU — gắn sau khi mọi base đã đọc xong, vì nó sửa thẳng vào các ô. */
  const mt = docLuat ? MT.gomMucTieu(tu, den, docLuat) : null;
  if (mt) ganMucTieu(base, mt);

  /* Chi phí toàn phòng và tệp khách mới là số của CẢ PHÒNG — chỉ trưởng phòng
   * xem. Mở cho nhân sự là để họ thấy ngân sách và kết quả của người khác. */
  const cp = pv ? null : gomChiPhi(base);
  return {
    tu, den, kyTruoc: truoc, soNgay: truoc.soNgay,
    base, luc: Date.now(),
    chiPhi: cp,
    phamVi: pv ? { ten: pv.ten, viTri: pv.viTri, soKenh: pv.kenh ? pv.kenh.length : 0,
      khoi: pv.khoi, loaiViec: pv.loaiViec } : null,
    tepMoi: pv ? null : gomTepMoi(base, cp && cp.doc ? cp.tong : 0),
    mucTieu: mt ? {
      coLuat: mt.coLuat, thieuLuat: mt.thieuLuat,
      tronThang: mt.tronThang, soKenh: mt.kenh.size,
    } : null,
    soChay: base.filter((b) => b.chay).length, soApp: base.length,
    soO: base.reduce((s, b) => s + (b.o || []).length, 0),
  };
}

/**
 * CHI PHÍ TOÀN PHÒNG — gộp hai ví tiền vốn nằm ở hai app khác nhau.
 *
 * Tiền của phòng đi ra hai đường: mua quảng cáo (app Quảng cáo) và quỹ chi phí
 * (app Quỹ). Trước nay muốn biết tháng này phòng tiêu bao nhiêu thì phải mở hai
 * app rồi tự cộng — mà hai app đó dùng hai cách gọi kỳ khác nhau, nên cộng nhầm
 * là chuyện thường.
 *
 * Trả `null` khi KHÔNG đọc được đủ cả hai. Cộng một nửa rồi gọi là "tổng chi phí
 * phòng" là con số sai nguy hiểm hơn hẳn việc không có con số nào — người đọc
 * không có cách nào biết nó thiếu.
 */
function gomChiPhi(base) {
  const lay = (id, nhan) => {
    const b = base.find((x) => x.id === id);
    if (!b || !b.chay) return null;
    const o = (b.o || []).find((x) => x.nhan === nhan);
    return o ? { so: so(o.so), lech: o.lech } : null;
  };
  const qc = lay('quang-cao', 'Chi tiêu');
  const quy = lay('quy-chi-phi', 'Chi trong kỳ');
  /* KHÔNG lấy doanh thu vào khối này nữa. Khối này trả lời đúng MỘT câu: tiền
   * của phòng đi về đâu. Đặt doanh thu ghi công cho quảng cáo cạnh tổng chi thì
   * người đọc tự bắc cầu thành "phòng lãi bao nhiêu" — mà hai con số đó không
   * so được: doanh thu ghi công chỉ là phần nền tảng quảng cáo tự nhận, còn chi
   * thì gồm cả quỹ, tác nghiệp, KOL. Doanh thu vẫn còn nguyên trong khối Quảng
   * cáo, đứng cạnh chi quảng cáo — đúng chỗ của nó. */

  /* Hạng mục chi — lấy thẳng bảng "Theo loại chi" của app Quỹ và bảng "Theo nền
   * tảng" của app Quảng cáo, gộp thành MỘT danh sách hạng mục của cả phòng.
   * Không có nó thì "44 triệu" chỉ là một con số, không ai biết tiêu vào đâu. */
  const bangCua = (id, tieuDe) => {
    const b = base.find((x) => x.id === id);
    if (!b || !b.chay) return null;
    return (b.bang || []).find((x) => x.tieuDe === tieuDe) || null;
  };
  const hangMuc = [];
  const bQuy = bangCua('quy-chi-phi', 'Theo loại chi');
  if (bQuy) {
    bQuy.dong.forEach((r) => hangMuc.push({ nhan: r[0], vi: 'Quỹ chi phí', soKhoan: so(r[1]), so: so(r[2]) }));
  }
  const bQc = bangCua('quang-cao', 'Theo nền tảng');
  if (bQc) {
    bQc.dong.forEach((r) => hangMuc.push({ nhan: 'Quảng cáo ' + r[0], vi: 'Quảng cáo', soKhoan: null, so: so(r[1]) }));
  }
  hangMuc.sort((a, b) => b.so - a.so);

  const thieu = [];
  if (!qc) thieu.push('Quảng cáo');
  if (!quy) thieu.push('Quỹ chi phí');
  if (thieu.length) return { doc: false, thieu };

  const tong = qc.so + quy.so;
  return {
    doc: true,
    tong,
    o: [
      /* KHÔNG `dao`: tổng tiền đã chi không phải chỉ số "thấp là tốt". Chi ít đi
       * có thể là tiết kiệm, cũng có thể là ngừng chạy quảng cáo và doanh thu
       * tụt theo — tô xanh ở đây là đọc hộ người ta một kết luận sai. */
      { nhan: 'Tổng chi phí phòng', so: tong, dinhDang: 'vnd', chinh: true, trungTinh: true,
        ghi: 'quảng cáo + quỹ chi phí' },
      { nhan: 'Chi quảng cáo', so: qc.so, dinhDang: 'vnd', lech: qc.lech, trungTinh: true,
        ghi: tong ? Math.round((qc.so / tong) * 100) + '% tổng chi' : '' },
      { nhan: 'Chi từ quỹ', so: quy.so, dinhDang: 'vnd', lech: quy.lech, trungTinh: true,
        ghi: tong ? Math.round((quy.so / tong) * 100) + '% tổng chi' : '' },
      { nhan: 'Số hạng mục đã chi', so: hangMuc.length, dinhDang: 'so',
        ghi: hangMuc.length ? 'lớn nhất: ' + hangMuc[0].nhan : '' },
      { nhan: 'Hạng mục lớn nhất chiếm', so: tong && hangMuc.length
        ? (hangMuc[0].so / tong) * 100 : 0, dinhDang: 'pt', trungTinh: true,
        ghi: hangMuc.length ? hangMuc[0].nhan : '' },
    ],
    tron: {
      nhan: 'Tiền phòng đi về đâu — theo ví',
      giua: 'Tổng chi',
      phan: [{ nhan: 'Quảng cáo', so: qc.so }, { nhan: 'Quỹ chi phí', so: quy.so }]
        .filter((x) => x.so > 0),
    },
    hangMuc,
    bang: [
      { tieuDe: 'Chi theo hạng mục — tiền đi vào việc gì',
        cot: ['Hạng mục', 'Ví tiền', 'Số khoản', 'Số tiền', '% tổng chi'],
        soCot: [2, 3, 4],
        dong: hangMuc.map((x) => [x.nhan, x.vi, x.soKhoan == null ? '—' : x.soKhoan, x.so,
          tong ? Math.round((x.so / tong) * 1000) / 10 : 0]) },
    ].filter((b) => b.dong.length),
  };
}

/**
 * Gom kỳ này VÀ kỳ trước, rồi tự tính mức lệch cho những ô mà app nguồn không
 * kèm sẵn (OTA, Công việc, Lịch).
 *
 * Vì sao đáng gọi hai lần: một con số đứng một mình không nói được gì. "4 booking"
 * là tốt hay xấu chỉ biết khi đặt cạnh kỳ trước. Hai app Social và Quảng cáo tự
 * trả `lech`, ba app kia thì không — chỉ hiện lệch cho hai app thì báo cáo khập
 * khiễng, chỗ có chỗ không.
 */
async function gomSoSanh(tu, den, nguoi, kieuSS, docLuat, pv) {
  /* NHÂN SỰ KHÔNG SO SÁNH. Phiếu của một người đọc để biết tháng này mình làm
   * được gì, không phải để bị đối chiếu với tháng trước — và mỗi mũi tên đỏ là
   * một câu hỏi mà bản rút gọn không trả lời nổi ("giảm 60%" vì làm ít hơn hay
   * vì tháng trước có chiến dịch?). Bỏ luôn ở tầng này cho chắc, đừng trông
   * vào màn hình nhớ gửi `ss=khong`. */
  if (pv) kieuSS = 'khong'; // eslint-disable-line no-param-reassign
  /* TẮT SO SÁNH. Không phải chuyện ẩn vài cái mũi tên: bỏ so sánh thì khỏi phải
   * đọc lại toàn bộ 9 base cho kỳ trước, tức là nhanh gấp đôi. Ai chỉ cần xem
   * "tháng này ra sao" thì không nên phải chờ máy đọc cả tháng trước. */
  if (kieuSS === 'khong') {
    const d = await gom(tu, den, nguoi, 'khong', docLuat, null, pv);
    /* Xoá sạch mức lệch, kể cả mức do app nguồn tự trả. Social và Quảng cáo gắn
     * sẵn `lech` theo cửa sổ của riêng chúng; để nguyên thì tắt so sánh xong vẫn
     * còn vài ô đeo mũi tên "▼ 3,9% so kỳ trước" — so với kỳ nào thì không ai
     * biết, vì màn hình vừa nói là không so với kỳ nào cả. */
    d.base.forEach((b) => (b.o || []).forEach((o) => { delete o.lech; delete o.soTruoc; }));
    if (d.chiPhi && d.chiPhi.o) {
      d.chiPhi.o.forEach((o) => { delete o.lech; delete o.soTruoc; });
      d.chiPhi.soSanh = [];
    }
    if (d.tepMoi && d.tepMoi.o) d.tepMoi.o.forEach((o) => { delete o.lech; delete o.soTruoc; });
    d.kyTruoc = null;
    d.kyTruocDoc = 0;
    return d;
  }
  const kt = kyTruoc(tu, den, kieuSS);
  const [nay, truoc] = await Promise.all([
    gom(tu, den, nguoi, kieuSS, docLuat, null, pv),
    /* Kỳ trước KHÔNG gắn mục tiêu: nó chỉ góp con số để so, còn mục tiêu của nó
     * lại là mục tiêu tháng khác — hiện lên là hai thang lẫn vào nhau. */
    gom(kt.tu, kt.den, nguoi, kieuSS, null, null, pv),
  ]);
  nay.base.forEach((b) => {
    const bt = truoc.base.find((x) => x.id === b.id);
    (b.o || []).forEach((o) => {
      if (!bt || !bt.chay) return;
      const ot = (bt.o || []).find((x) => x.nhan === o.nhan);
      if (!ot) return;
      /* Luôn ghi `soTruoc`, kể cả khi app nguồn đã tự trả `lech`. Bản trước
       * `return` sớm ở đây nên hai base tự tính lệch (Social, Quảng cáo) không
       * bao giờ có số kỳ trước — và biểu đồ so sánh của chúng rỗng trơn. */
      o.soTruoc = ot.so;
      /* TÍNH LẠI mức lệch từ chính hai con số này, KỂ CẢ khi app nguồn đã trả
       * sẵn `lech`.
       *
       * Bản trước giữ nguyên `lech` của app nguồn. Nhưng Social và Quảng cáo tự
       * so với cửa sổ của RIÊNG chúng, không phải cửa sổ người xem chọn ở đây.
       * Hậu quả lộ ra ngay khi biểu đồ bắt đầu vẽ hai cột: ô "Bình luận" hiện
       * 24 → 58 mà nhãn ghi ▲ +1,4%. Cột lấy từ cửa sổ này, phần trăm lấy từ
       * cửa sổ kia — hai thứ cạnh nhau nói hai chuyện khác nhau.
       *
       * Ai đặt khoảng thời gian thì người đó định nghĩa "kỳ trước". Khoảng này
       * do báo cáo đặt, nên phần trăm cũng phải do báo cáo tính. */
      /* Kỳ trước bằng 0 thì không phần trăm nào có nghĩa (chia cho 0) — để trống
       * và cho giao diện hiện ghi chú thay vì "∞%". */
      o.lech = ot.so ? ((o.so - ot.so) / Math.abs(ot.so)) * 100 : null;
    });
  });
  /* Tính LẠI khối chi phí sau khi đã điền mức lệch: `gom()` dựng nó từ các ô
   * lúc chưa có `lech`, nên bản dựng trong đó luôn thiếu phần so sánh. */
  nay.chiPhi = pv ? null : gomChiPhi(nay.base);
  if (nay.chiPhi && nay.chiPhi.doc && truoc.chiPhi && truoc.chiPhi.doc) {
    nay.chiPhi.tongTruoc = truoc.chiPhi.tong;
    nay.chiPhi.o.forEach((o) => {
      const ot = truoc.chiPhi.o.find((x) => x.nhan === o.nhan);
      if (!ot) return;
      o.soTruoc = ot.so;
      if (o.lech == null) o.lech = ot.so ? ((o.so - ot.so) / Math.abs(ot.so)) * 100 : null;
    });
    nay.chiPhi.soSanh = dungSoSanh(nay.chiPhi.o);
  }

  /* Dữ liệu cho biểu đồ so sánh kỳ trước của từng base. */
  nay.base.forEach((b) => { if (b.chay) b.soSanh = dungSoSanh(b.o || []); });

  nay.kyTruocDoc = truoc.base.filter((x) => x.chay).length;
  return nay;
}

/**
 * Dữ liệu cho biểu đồ SO SÁNH KỲ TRƯỚC.
 *
 * Vì sao là biểu đồ PHẦN TRĂM ĐỔI chứ không phải cột kỳ này cạnh cột kỳ trước:
 * các chỉ số trong một base lệch nhau mấy bậc độ lớn — lượt xem 1,99 triệu đứng
 * cạnh bình luận 40. Vẽ chung một thang thì cột bình luận dẹp thành đường kẻ và
 * biểu đồ chỉ nói được đúng một chuyện là "view nhiều hơn comment", thứ ai cũng
 * biết. Đổi sang % thay đổi thì mọi chỉ số về chung một thang và biểu đồ trả lời
 * đúng câu cần hỏi: **tháng này cái gì lên, cái gì xuống, bao nhiêu**.
 *
 * Bỏ qua chỉ số kỳ trước bằng 0 (không có phần trăm nào có nghĩa) và chỉ số
 * không đổi quá 0,5% (chỉ làm rối, không mang tin gì).
 */
function dungSoSanh(oList) {
  const ds = (oList || [])
    .filter((o) => o.soTruoc != null && o.soTruoc !== 0
      && o.lech != null && Number.isFinite(o.lech) && Math.abs(o.lech) >= 0.5)
    .map((o) => ({
      nhan: o.nhan,
      nay: so(o.so),
      truoc: so(o.soTruoc),
      lech: o.lech,
      dinhDang: o.dinhDang || 'so',
      /* `dao` = chỉ số thấp là tốt (CPA, chi phí, huỷ, quá hạn). Biểu đồ phải
       * biết để tô màu: "chi phí giảm 20%" là tin TỐT, tô đỏ là đọc ngược. */
      dao: !!o.dao,
      trungTinh: !!o.trungTinh,
      /* `tot` chỉ có nghĩa khi chỉ số có chiều tốt/xấu. Trung tính thì để null
       * và giao diện tô xám — in ra mức đổi, không phán xét. */
      tot: o.trungTinh ? null : (o.dao ? o.lech < 0 : o.lech > 0),
    }))
    .sort((a, b) => Math.abs(b.lech) - Math.abs(a.lech));
  /* Cắt 12 dòng: biểu đồ 22 thanh không ai đọc hết, mà 12 cái đổi mạnh nhất đã
   * kể đủ câu chuyện của kỳ. Số đầy đủ vẫn nằm ở các ô phía trên. */
  return ds.slice(0, 12);
}

module.exports = { gom, gomSoSanh, xuHuong, kyTruoc, KIEU_SS, APP };
