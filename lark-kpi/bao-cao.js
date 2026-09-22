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

const APP = [
  { id: 'social', ten: 'Social', mo: 'TikTok · Facebook · Instagram · Zalo OA',
    mau: '#d62976', url: process.env.KPI_URL_SOCIAL || 'http://localhost:5178' },
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
];

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

function kyTruoc(tu, den) {
  const a = new Date(tu + 'T00:00:00Z');
  const b = new Date(den + 'T00:00:00Z');
  const dai = Math.round((b - a) / 86400000) + 1;
  const bTruoc = new Date(a.getTime() - 86400000);
  const aTruoc = new Date(bTruoc.getTime() - (dai - 1) * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { tu: iso(aTruoc), den: iso(bTruoc), soNgay: dai };
}

/* ================= SOCIAL ================= */
async function docSocial(app, tu, den) {
  const d = await goi(app, '/api/tong-quan' + q(tu, den));
  const t = d.tong || {};
  const l = d.doi || {};
  const nt = d.nenTang || [];
  /* `n(khoa)` gắn vào ô danh sách nền tảng có / không có con số đó — xem gopNen. */
  const n = (khoa) => gopNen(nt, khoa);
  return {
    luuY: d.luuY || [],
    o: [
      { nhan: 'Lượt xem', so: so(t.views), dinhDang: 'so', lech: l.views, chinh: true, nen: n('views') },
      { nhan: 'Lượt hiển thị', so: so(t.impressions), dinhDang: 'so', lech: l.impressions, nen: n('impressions') },
      { nhan: 'Lượt tiếp cận', so: so(t.reach), dinhDang: 'so', lech: l.reach, nen: n('reach') },
      { nhan: 'Follower', so: so(t.followers), dinhDang: 'so', ghi: 'chốt ngày mới nhất', nen: n('followers') },
      { nhan: 'Follower tăng', so: so(t.followUp), dinhDang: 'so', lech: l.followUp, nen: n('followUp') },
      { nhan: 'Follower giảm', so: so(t.followDown), dinhDang: 'so', lech: l.followDown, dao: true, nen: n('followDown') },
      { nhan: 'Follower tăng ròng', so: so(t.followNet), dinhDang: 'so', lech: l.followNet, nen: n('followNet') },
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
      { nhan: 'Số phiên LIVE', so: so(t.lives), dinhDang: 'so', lech: l.lives, nen: n('lives') },
      /* KHÔNG dùng `tyLeTuongTac` của app Social ở tầng tổng: mẫu số là tổng
       * reach, mà Facebook không trả reach nên tỷ lệ vọt lên 294%. Ở đây lấy mẫu
       * số là LƯỢT XEM và gọi đúng tên, để không ai phải đoán mẫu số là gì. */
      { nhan: 'Tương tác / lượt xem', dinhDang: 'pt',
        so: so(t.views) ? (so(t.engagement) / so(t.views)) * 100 : 0 },
      { nhan: 'Xem trung bình mỗi bài', so: so(t.xemMoiBai), dinhDang: 'so' },
      { nhan: 'Tương tác mỗi bài', so: so(t.tuongTacMoiBai), dinhDang: 'so' },
      { nhan: 'Lead / 1.000 lượt xem', so: so(t.leadTrenNghinXem), dinhDang: 'so2' },
    ],
    chuoi: {
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
      phan: (d.nenTang || []).map((x) => ({ nhan: x.platform, so: so(x.views) })).filter((x) => x.so),
    },
    bang: [
      { tieuDe: 'Theo nền tảng',
        cot: ['Nền tảng', 'Lượt xem', 'Hiển thị', 'Tương tác', 'Follower tăng', 'Bài', 'LIVE'],
        soCot: [1, 2, 3, 4, 5, 6],
        dong: (d.nenTang || []).map((x) => [x.platform, so(x.views), so(x.impressions),
          so(x.engagement), so(x.followUp), so(x.posts), so(x.lives)]) },
      { tieuDe: 'Theo kênh',
        cot: ['Kênh', 'Nền tảng', 'Lượt xem', 'Tương tác', 'Follower tăng', 'Bài'],
        soCot: [2, 3, 4, 5],
        dong: (d.kenh || []).map((k) => [k.name, k.platform, so(k.views), so(k.engagement),
          so(k.followUp), so(k.posts)]) },
      { tieuDe: 'Bài xem nhiều nhất',
        cot: ['Bài', 'Kênh', 'Lượt xem', 'Tương tác'],
        soCot: [2, 3],
        dong: (d.topBai || []).slice(0, 15).map((b) => [
          (b.title || '(không tiêu đề)').slice(0, 90), b.channel || b.platform || '',
          so(b.views), so(b.engagement)]) },
    ].filter((b) => b.dong.length),
  };
}

/* ================= QUẢNG CÁO ================= */
async function docQuangCao(app, tu, den) {
  const d = await goi(app, '/api/overview' + q(tu, den));
  const k = d.kpi || {};
  const l = d.delta || {};
  const canh = d.alerts || [];
  const nang = canh.filter((a) => a.level === 'high').length;
  const n = (khoa) => gopNen(d.byPlatform || [], khoa);
  return {
    o: [
      { nhan: 'Chi tiêu', so: so(k.spend), dinhDang: 'vnd', lech: l.spend, chinh: true, nen: n('spend') },
      { nhan: 'Doanh thu từ QC', so: so(k.revenue), dinhDang: 'vnd', lech: l.revenue,
        ghi: so(k.revenue) ? '' : 'chưa ghi công được đơn nào' },
      { nhan: 'ROAS', so: so(k.roas), dinhDang: 'x', lech: l.roas },
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
      nhan: 'Chi tiêu & chuyển đổi theo ngày',
      diem: (d.series || []).map((x) => ({ x: x.date, spend: so(x.spend), conversions: so(x.conversions) })),
      duong: [{ key: 'spend', label: 'Chi tiêu', mau: '#ff7d00' },
        { key: 'conversions', label: 'Chuyển đổi', mau: '#2b5cff', truc: 2 }],
    },
    tron: {
      nhan: 'Cơ cấu chi tiêu theo nền tảng',
      giua: 'Chi tiêu',
      phan: (d.byPlatform || []).map((x) => ({ nhan: x.platform, so: so(x.spend) })).filter((x) => x.so),
    },
    bang: [
      { tieuDe: 'Theo nền tảng',
        cot: ['Nền tảng', 'Chi tiêu', '% chi', 'Hiển thị', 'Nhấp', 'CTR', 'Chuyển đổi', 'CPA'],
        soCot: [1, 2, 3, 4, 5, 6, 7],
        dong: (d.byPlatform || []).map((x) => [x.platform, so(x.spend), so(x.shareSpend),
          so(x.impressions), so(x.clicks), so(x.ctr), so(x.conversions), so(x.cpa)]) },
      { tieuDe: 'Theo chiến dịch',
        cot: ['Chiến dịch', 'Nền tảng', 'Trạng thái', 'Chi tiêu', 'Chuyển đổi', 'CPA'],
        soCot: [3, 4, 5],
        dong: (d.byCampaign || []).map((x) => [x.name, x.platform, x.status,
          so(x.spend), so(x.conversions), so(x.cpa)]) },
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
async function docCongViec(app, tu, den) {
  const d = await goi(app, '/api/tasks');
  const ds = d.tasks || [];
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
  const coMinhChung = trongKy.filter((t) => (t.attachment || []).length || (t.fileKetQua || []).length
    || t.linkKetQua || t.link).length;
  return {
    o: [
      { nhan: 'Đến hạn trong kỳ', so: trongKy.length, dinhDang: 'so', chinh: true },
      { nhan: 'Trong đó đã xong', so: xong.length, dinhDang: 'so',
        ghi: trongKy.length ? Math.round((xong.length / trongKy.length) * 100) + '% đúng hạn' : '' },
      { nhan: 'Có minh chứng', so: coMinhChung, dinhDang: 'so',
        ghi: trongKy.length ? Math.round((coMinhChung / trongKy.length) * 100) + '% số việc' : '' },
      { nhan: 'Việc đang mở', so: mo.length, dinhDang: 'so' },
      { nhan: 'Quá hạn', so: quaHan.length, dinhDang: 'so', muc: quaHan.length ? 'cao' : 'ok', dao: true },
      { nhan: 'Gắn cờ trễ deadline', so: ds.filter((t) => nhanOf(t.status) === 'Trễ deadline').length,
        dinhDang: 'so', muc: 'vua', dao: true },
      { nhan: 'Đang tiến hành', so: ds.filter((t) => nhanOf(t.status) === 'Đang tiến hành').length, dinhDang: 'so' },
      { nhan: 'Chờ tiếp nhận', so: ds.filter((t) => nhanOf(t.status) === 'Chờ tiếp nhận').length, dinhDang: 'so' },
      { nhan: 'Chưa phân công', so: mo.filter((t) => !(t.owner || []).length).length, dinhDang: 'so', dao: true },
      { nhan: 'Tổng việc trên bảng', so: ds.length, dinhDang: 'so' },
    ],
    tron: {
      nhan: 'Cơ cấu việc theo trạng thái',
      giua: 'Việc',
      phan: tt.map((x) => ({ nhan: x._k, so: x._n })),
    },
    bang: [
      { tieuDe: 'Việc đến hạn trong kỳ, theo người',
        cot: ['Người', 'Số việc'], soCot: [1],
        dong: theoNguoi.sort((x, y) => y._n - x._n).map((x) => [x._k, x._n]) },
      { tieuDe: 'Theo loại công việc',
        cot: ['Loại', 'Số việc'], soCot: [1],
        dong: theoLoai.sort((x, y) => y._n - x._n).map((x) => [x._k, x._n]) },
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
async function docLich(app, tu, den) {
  /* App Lịch trả luôn danh sách trong /api/meta (khoá `items`) và không nhận
   * from/to, nên lọc theo `start` ở đây. Bản đầu đoán các khoá `tong`/`choDuyet`
   * không tồn tại nên ô nào cũng ra 0 mà vẫn báo "đọc được" — im lặng sai còn
   * tệ hơn báo lỗi. */
  const d = await goi(app, '/api/meta');
  const it = (d.items || []).filter((x) => {
    const ng = String(x.start || '').slice(0, 10);
    return ng && ng >= tu && ng <= den;
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
    ],
    tron: {
      nhan: 'Cơ cấu buổi theo trạng thái',
      giua: 'Buổi',
      phan: tt.map((x) => ({ nhan: x._k, so: x._n })),
    },
    bang: [
      { tieuDe: 'Buổi tác nghiệp trong kỳ',
        cot: ['Ngày', 'Nội dung', 'Trạng thái', 'Người', 'Chi phí'],
        soCot: [4],
        dong: it.slice().sort((x, y) => String(x.start).localeCompare(String(y.start)))
          .slice(0, 40).map((x) => [String(x.start || '').slice(0, 10),
            x.title || '(không tên)', nhanOf(x.status),
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

const BO_DOC = {
  social: docSocial,
  'quang-cao': docQuangCao,
  ota: docOta,
  'cong-viec': docCongViec,
  'lich-tac-nghiep': docLich,
  'quy-chi-phi': docQuyChiPhi,
};

/** @param {{id,ten,quanLy}} nguoi Người đang xem — gửi kèm cho app con biết ai hỏi. */
async function gom(tu, den, nguoi) {
  const truoc = kyTruoc(tu, den);
  const base = await Promise.all(APP.map(async (app) => {
    const nen = { id: app.id, ten: app.ten, mo: app.mo, mau: app.mau };
    try {
      const r = await BO_DOC[app.id]({ ...app, nguoi }, tu, den);
      return { ...nen, chay: true, bang: [], chuoi: null, tron: null, luuY: [], ...r };
    } catch (e) {
      return { ...nen, chay: false, loi: e.message, o: [], bang: [], chuoi: null, tron: null, luuY: [] };
    }
  }));
  return {
    tu, den, kyTruoc: truoc, soNgay: truoc.soNgay,
    base, luc: Date.now(),
    chiPhi: gomChiPhi(base),
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
  const dt = lay('quang-cao', 'Doanh thu từ QC');

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
      /* Doanh thu ghi công được cho quảng cáo, KHÔNG phải doanh thu cả phòng —
       * nên chỉ đặt cạnh chi quảng cáo, không chia cho tổng chi. */
      { nhan: 'Doanh thu ghi công cho QC', so: dt ? dt.so : 0, dinhDang: 'vnd',
        lech: dt ? dt.lech : null,
        ghi: dt && dt.so ? '' : 'chưa ghi công được đơn nào' },
    ],
    tron: {
      nhan: 'Tiền phòng đi về đâu',
      giua: 'Tổng chi',
      phan: [{ nhan: 'Quảng cáo', so: qc.so }, { nhan: 'Quỹ chi phí', so: quy.so }]
        .filter((x) => x.so > 0),
    },
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
async function gomSoSanh(tu, den, nguoi) {
  const kt = kyTruoc(tu, den);
  const [nay, truoc] = await Promise.all([gom(tu, den, nguoi), gom(kt.tu, kt.den, nguoi)]);
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
      if (o.lech != null) return;
      /* Kỳ trước bằng 0 thì không phần trăm nào có nghĩa (chia cho 0) — để trống
       * và cho giao diện hiện ghi chú thay vì "∞%". */
      o.lech = ot.so ? ((o.so - ot.so) / Math.abs(ot.so)) * 100 : null;
    });
  });
  /* Tính LẠI khối chi phí sau khi đã điền mức lệch: `gom()` dựng nó từ các ô
   * lúc chưa có `lech`, nên bản dựng trong đó luôn thiếu phần so sánh. */
  nay.chiPhi = gomChiPhi(nay.base);
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

module.exports = { gom, gomSoSanh, kyTruoc, APP };
