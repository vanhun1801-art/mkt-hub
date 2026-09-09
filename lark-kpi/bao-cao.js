'use strict';
/**
 * BÁO CÁO TỔNG HỢP — gom số liệu của MỌI base về một chỗ, cho một khoảng thời gian.
 *
 * Đây là nửa thứ nhất của app (nửa kia là KPI). Mục đích: mở ra thấy toàn cảnh
 * phòng Marketing trong kỳ, rồi xuất một tệp gửi Sếp.
 *
 * Nguyên tắc như `nguon.js`: KHÔNG tự gọi nền tảng, chỉ hỏi các app con — mỗi
 * chỉ số chỉ có một định nghĩa, nằm ở app sở hữu nó. Ở đây chỉ làm việc dịch
 * hình dạng trả về của từng app thành một khuôn chung để xếp cạnh nhau.
 *
 * App nào không chạy thì báo rõ "chưa chạy", KHÔNG hiện 0 — số 0 và "không đọc
 * được" là hai chuyện khác hẳn nhau, lẫn lộn là báo cáo sai gửi lên Sếp.
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
];

function goi(url, giay = 25) {
  return new Promise((giai, tu) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return tu(new Error('HTTP ' + res.statusCode));
        try { giai(JSON.parse(s)); } catch (_) { tu(new Error('trả về không phải JSON')); }
      });
    });
    req.on('error', (e) => tu(new Error(e.code === 'ECONNREFUSED' ? 'app chưa chạy' : e.message)));
    req.setTimeout(giay * 1000, () => { req.destroy(new Error('quá ' + giay + ' giây')); });
  });
}

const so = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const q = (tu, den) => '?from=' + encodeURIComponent(tu) + '&to=' + encodeURIComponent(den);

/* Kỳ trước có cùng độ dài, nằm liền ngay trước — để mọi ô có mốc so sánh. */
function kyTruoc(tu, den) {
  const a = new Date(tu + 'T00:00:00Z');
  const b = new Date(den + 'T00:00:00Z');
  const dai = Math.round((b - a) / 86400000) + 1;
  const bTruoc = new Date(a.getTime() - 86400000);
  const aTruoc = new Date(bTruoc.getTime() - (dai - 1) * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { tu: iso(aTruoc), den: iso(bTruoc), soNgay: dai };
}

/* ---------------- bộ dịch từng app ---------------- */

async function docSocial(app, tu, den) {
  const d = await goi(app.url + '/api/tong-quan' + q(tu, den));
  const t = d.tong || {};
  const l = d.doi || {};
  return {
    o: [
      { nhan: 'Lượt xem', so: so(t.views), dinhDang: 'so', lech: l.views },
      { nhan: 'Lượt tiếp cận', so: so(t.reach), dinhDang: 'so', lech: l.reach },
      { nhan: 'Follower', so: so(t.followers), dinhDang: 'so', ghi: 'chốt ngày mới nhất' },
      { nhan: 'Follower tăng ròng', so: so(t.followNet), dinhDang: 'so', lech: l.followNet },
      { nhan: 'Tương tác', so: so(t.engagement), dinhDang: 'so', lech: l.engagement },
      /* KHÔNG dùng `tong.tyLeTuongTac` của app Social: mẫu số của nó là tổng
       * reach, mà Facebook không trả reach nên tổng reach chỉ còn của Instagram
       * — tỷ lệ vọt lên 294%. Ở báo cáo này lấy mẫu số là LƯỢT XEM và gọi đúng
       * tên, để không ai phải đoán mẫu số là gì. */
      { nhan: 'Tương tác / lượt xem', dinhDang: 'pt',
        so: so(t.views) ? (so(t.engagement) / so(t.views)) * 100 : 0 },
      { nhan: 'Số bài đăng', so: so(t.posts), dinhDang: 'so', lech: l.posts },
    ],
    bang: {
      tieuDe: 'Theo kênh',
      cot: ['Kênh', 'Nền tảng', 'Lượt xem', 'Tương tác', 'Follower tăng', 'Bài'],
      dong: (d.kenh || []).slice(0, 30).map((k) => [k.name, k.platform,
        so(k.views), so(k.engagement), so(k.followUp), so(k.posts)]),
      soCot: [2, 3, 4, 5],
    },
  };
}

async function docQuangCao(app, tu, den) {
  const d = await goi(app.url + '/api/overview' + q(tu, den));
  const k = d.kpi || {};
  const l = d.delta || {};
  const canh = d.alerts || [];
  return {
    o: [
      { nhan: 'Chi tiêu', so: so(k.spend), dinhDang: 'vnd', lech: l.spend },
      { nhan: 'Doanh thu từ QC', so: so(k.revenue), dinhDang: 'vnd', lech: l.revenue },
      { nhan: 'ROAS', so: so(k.roas), dinhDang: 'x', lech: l.roas },
      { nhan: 'Chuyển đổi', so: so(k.conversions), dinhDang: 'so', lech: l.conversions },
      /* CPA thấp là tốt — `dao` để giao diện đổi chiều màu của mũi tên. */
      { nhan: 'CPA', so: so(k.cpa), dinhDang: 'vnd', lech: l.cpa, dao: true },
      { nhan: 'Cảnh báo', so: canh.length, dinhDang: 'so',
        muc: canh.some((a) => a.level === 'high') ? 'cao' : (canh.length ? 'vua' : 'ok') },
    ],
    bang: canh.length ? {
      tieuDe: 'Cảnh báo quảng cáo',
      cot: ['Mức', 'Nội dung', 'Chi tiết'],
      dong: canh.slice(0, 20).map((a) => [
        a.level === 'high' ? 'Cao' : a.level === 'mid' ? 'Vừa' : 'Thấp', a.title, a.detail || '']),
    } : null,
  };
}

async function docOta(app, tu, den) {
  /* Lọc theo NGÀY ĐI như hub, không phải ngày đặt: báo cáo vận hành quan tâm
   * tour chạy trong kỳ. */
  const qq = '?moc=ngayDi&from=' + encodeURIComponent(tu) + '&to=' + encodeURIComponent(den);
  const d = await goi(app.url + '/api/thongke' + qq);
  const t = d.tong || {};
  return {
    o: [
      { nhan: 'Doanh thu thu về', so: so(t.thucNhan), dinhDang: 'vnd',
        ghi: so(t.bookingSong) + ' booking · ' + so(t.khach) + ' khách' },
      { nhan: 'Booking', so: so(t.bookingSong), dinhDang: 'so' },
      { nhan: 'Khách', so: so(t.khach), dinhDang: 'so' },
      { nhan: 'Hoa hồng OTA', so: so(t.hoaHong), dinhDang: 'vnd',
        ghi: t.tongTien ? so(t.tyLeHoaHong) + '% doanh thu' : 'chưa nhập giá OTA bán' },
    ],
    bang: Array.isArray(d.theoKenh) && d.theoKenh.length ? {
      tieuDe: 'Theo sàn',
      cot: ['Sàn', 'Booking', 'Khách', 'Doanh thu'],
      dong: d.theoKenh.slice(0, 20).map((x) => [x.ten || x.kenh, so(x.booking), so(x.khach), so(x.thucNhan)]),
      soCot: [1, 2, 3],
    } : null,
  };
}

/* Việc và Lịch không nhận from/to (chúng là bảng trạng thái, không phải số liệu
 * theo ngày) nên đọc toàn bộ rồi tự lọc theo mốc thời gian ở đây. */
const msOf = (v) => (v == null || v === '' ? 0 : typeof v === 'number' ? v : Date.parse(v) || 0);
const nhanOf = (v) => (v && typeof v === 'object' ? (v.text || v.name || '') : (v || ''));

async function docCongViec(app, tu, den) {
  const d = await goi(app.url + '/api/tasks');
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
  const xongTrongKy = trongKy.filter((t) => nhanOf(t.status) === 'Hoàn thành');
  const mo = ds.filter((t) => !DONG.has(nhanOf(t.status)));
  const treHan = ds.filter((t) => nhanOf(t.status) === 'Trễ deadline');
  const quaHan = mo.filter((t) => han(t) && han(t) < bay);
  const chuaGiao = mo.filter((t) => !(t.owner || []).length);
  return {
    o: [
      { nhan: 'Đến hạn trong kỳ', so: trongKy.length, dinhDang: 'so' },
      { nhan: 'Trong đó đã xong', so: xongTrongKy.length, dinhDang: 'so',
        ghi: trongKy.length ? Math.round((xongTrongKy.length / trongKy.length) * 100) + '% đúng hạn' : '' },
      { nhan: 'Việc đang mở', so: mo.length, dinhDang: 'so' },
      { nhan: 'Quá hạn', so: quaHan.length, dinhDang: 'so', muc: quaHan.length ? 'cao' : 'ok' },
      { nhan: 'Gắn cờ trễ deadline', so: treHan.length, dinhDang: 'so', muc: treHan.length ? 'vua' : 'ok' },
      { nhan: 'Chưa phân công', so: chuaGiao.length, dinhDang: 'so', muc: chuaGiao.length ? 'vua' : 'ok' },
    ],
    bang: quaHan.length ? {
      tieuDe: 'Việc quá hạn',
      cot: ['Việc', 'Loại', 'Người', 'Hạn'],
      dong: quaHan.slice().sort((x, y) => han(x) - han(y)).slice(0, 25).map((t) => [
        t.title || '(không tên)', nhanOf(t.workType),
        (t.owner || []).map((u) => u.name || u.id).join(', '),
        han(t) ? new Date(han(t)).toLocaleDateString('vi-VN') : '']),
    } : null,
  };
}

async function docLich(app, tu, den) {
  /* App Lịch trả luôn danh sách trong /api/meta (khoá `items`) và không nhận
   * from/to, nên lọc theo `start` ở đây. Bản đầu của hàm này đoán các khoá
   * `tong` / `choDuyet` không tồn tại nên ô nào cũng ra 0 mà vẫn báo "đọc được"
   * — im lặng sai còn tệ hơn báo lỗi. */
  const d = await goi(app.url + '/api/meta');
  const it = (d.items || []).filter((x) => {
    const ng = String(x.start || '').slice(0, 10);
    return ng && ng >= tu && ng <= den;
  });
  const dem = (...tt) => it.filter((x) => tt.includes(nhanOf(x.status))).length;
  const huy = dem('Hủy lịch', 'Từ chối', 'Từ chối/Cần điều chỉnh');
  const cho = dem('Chờ duyệt/Xử lý', 'Đang lên kế hoạch');
  const gio = it.reduce((t, x) => t + so(x.hours), 0);
  const chi = it.reduce((t, x) => t + so(x.costActual), 0);
  const duToan = it.reduce((t, x) => t + so(x.costPlan), 0);
  return {
    o: [
      { nhan: 'Buổi tác nghiệp', so: it.length, dinhDang: 'so' },
      { nhan: 'Đã hoàn tất', so: dem('Đã hoàn tất'), dinhDang: 'so',
        ghi: it.length ? Math.round((dem('Đã hoàn tất') / it.length) * 100) + '% số buổi' : '' },
      { nhan: 'Huỷ / từ chối', so: huy, dinhDang: 'so', muc: huy ? 'vua' : 'ok' },
      { nhan: 'Chờ duyệt', so: cho, dinhDang: 'so', muc: cho ? 'vua' : 'ok' },
      { nhan: 'Giờ tác nghiệp', so: gio, dinhDang: 'so', ghi: 'giờ' },
      { nhan: 'Chi phí thực tế', so: chi, dinhDang: 'vnd', ghi: duToan ? 'dự toán ' + Math.round(duToan) : '' },
    ],
    bang: it.length ? {
      tieuDe: 'Buổi tác nghiệp trong kỳ',
      cot: ['Ngày', 'Nội dung', 'Trạng thái', 'Người'],
      dong: it.slice(0, 25).map((x) => [String(x.start || '').slice(0, 10),
        x.title || '(không tên)', nhanOf(x.status),
        (x.owner || x.staff || []).map((u) => u.name || u.id).join(', ')]),
    } : null,
  };
}

const BO_DOC = {
  social: docSocial,
  'quang-cao': docQuangCao,
  ota: docOta,
  'cong-viec': docCongViec,
  'lich-tac-nghiep': docLich,
};

/**
 * Gom báo cáo cho một khoảng thời gian.
 * Gọi song song và KHÔNG để một app chết kéo cả báo cáo chết theo.
 */
async function gom(tu, den) {
  const truoc = kyTruoc(tu, den);
  const base = await Promise.all(APP.map(async (app) => {
    const nen = { id: app.id, ten: app.ten, mo: app.mo, mau: app.mau };
    try {
      const r = await BO_DOC[app.id](app, tu, den);
      return { ...nen, chay: true, ...r };
    } catch (e) {
      return { ...nen, chay: false, loi: e.message, o: [], bang: null };
    }
  }));
  return {
    tu, den, kyTruoc: truoc, soNgay: truoc.soNgay,
    base, luc: Date.now(),
    soChay: base.filter((b) => b.chay).length, soApp: base.length,
  };
}

/**
 * Gom kỳ này VÀ kỳ trước, rồi tự tính mức lệch cho những ô mà app nguồn không
 * kèm sẵn (OTA, Công việc, Lịch).
 *
 * Vì sao đáng gọi hai lần: một con số đứng một mình không nói được gì. "4 booking"
 * là tốt hay xấu chỉ biết khi đặt cạnh kỳ trước. Hai app Social và Quảng cáo tự
 * trả `lech`, ba app kia thì không — nếu chỉ hiện lệch cho hai app thì báo cáo
 * khập khiễng, chỗ có chỗ không.
 */
async function gomSoSanh(tu, den) {
  const kt = kyTruoc(tu, den);
  const [nay, truoc] = await Promise.all([gom(tu, den), gom(kt.tu, kt.den)]);
  nay.base.forEach((b) => {
    const bt = truoc.base.find((x) => x.id === b.id);
    (b.o || []).forEach((o) => {
      if (o.lech != null || !bt || !bt.chay) return;
      const ot = (bt.o || []).find((x) => x.nhan === o.nhan);
      if (!ot) return;
      o.soTruoc = ot.so;
      /* Kỳ trước bằng 0 thì không có phần trăm nào có nghĩa (chia cho 0) — để
       * trống và cho giao diện hiện số tuyệt đối thay vì "∞%". */
      o.lech = ot.so ? ((o.so - ot.so) / Math.abs(ot.so)) * 100 : null;
    });
  });
  nay.kyTruocDoc = truoc.base.filter((b) => b.chay).length;
  return nay;
}

module.exports = { gom, gomSoSanh, kyTruoc, APP };
