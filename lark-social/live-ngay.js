'use strict';
/**
 * ============================================================================
 * ĐỌC BẢN XUẤT THEO NGÀY CỦA TIKTOK LIVE CENTER
 * ============================================================================
 * Anh Hùng 28/09/2026: nhân sự LIVE tải bốn tệp này lên Marketing Hub, app tự
 * ghi vào Base; tuần và tháng báo cáo thì tải lại một lượt là số cập nhật.
 *
 * TIKTOK KHÔNG MỞ API CHO LIVE. Đã truy hết đường: Display API không có, Business
 * API chỉ có video. Nên số LIVE của TikTok chỉ về được bằng tay, và đây là bản
 * xuất chính chủ — tin được hơn gõ lại.
 *
 * BỐN TỆP, MỘT TRỤC NGÀY. LIVE Center chia số ra bốn bản tải riêng, mỗi bản một
 * ZIP chứa một CSV, cùng một cột Date:
 *   Viewership  lượt xem, người xem riêng, người xem tương tác, thời gian xem
 *               trung bình, đỉnh đồng thời, trung bình đồng thời
 *   Activity    tổng thời lượng LIVE (giây), số phiên trong ngày
 *   Engagement  người tặng quà, follower mới, người bình luận, thích, chia sẻ
 *   Rewards     kim cương, USD
 *
 * VÌ SAO KHÔNG DÙNG BẢNG "PHIÊN LIVE" CÓ SẴN. Bảng đó mỗi dòng là MỘT PHIÊN, có
 * giờ bắt đầu và giờ kết thúc. Bản xuất này gộp theo NGÀY và một ngày có thể 4
 * phiên — nhét một ngày vào một dòng phiên là nói dối về dữ liệu. Nguy hiểm cụ
 * thể: tien-live.js gắn doanh thu cho phiên theo khung giờ, một "phiên" dài
 * trọn ngày sẽ vơ hết lead của cả ngày về cho LIVE.
 *
 * NHẬN CỘT THEO TÊN, KHÔNG THEO THỨ TỰ — cùng lý do với bang-dan.js: LIVE Center
 * đổi thứ tự cột giữa các bản xuất, mà đọc theo thứ tự thì số vào sai ô và bảng
 * vẫn trông bình thường.
 */
const { moZip, laZip } = require('../lark-chung/xlsx-doc');

/* Tên cột (viết thường) → tên trường. Mỗi khoá nói rõ nó thuộc bản xuất nào để
 * sau này thêm cột mới còn biết đặt vào đâu.
 *
 * CÓ HAI BẢN NGÔN NGỮ. LIVE Center xuất tiêu đề cột theo ngôn ngữ của người
 * đang đăng nhập, nên hai kênh của cùng một phòng ra hai bộ tiêu đề khác nhau.
 * Chỉ "Date" và "USD" là giữ nguyên tiếng Anh ở cả hai bản — và đúng chỗ đó đã
 * gây ra lỗi 08/10/2026: tệp tiếng Việt của kênh "Cuộc sống tại Phú Quốc" đọc
 * được ngày nên app nhận tệp, nhưng mọi cột số đều lạ nên ghi vào Base toàn số
 * 0, riêng USD trúng tên nên sống sót. Bảy ngày LIVE thành một dòng rỗng. */
const COT = {
  /* trục chung */
  date: 'ngay',
  ngày: 'ngay',

  /* Viewership · Số liệu người xem */
  views: 'luotXem',
  'lượt xem': 'luotXem',
  'unique viewers': 'nguoiXemRieng',
  'người xem duy nhất': 'nguoiXemRieng',
  'active viewers': 'nguoiXemTuongTac',
  'người xem tích cực': 'nguoiXemTuongTac',
  'average watch duration': 'xemTrungBinh',
  'thời lượng xem trung bình': 'xemTrungBinh',
  'peak concurrent viewers': 'dinhDongThoi',
  'số người xem đồng thời cao nhất': 'dinhDongThoi',
  'average concurrent viewers': 'trungBinhDongThoi',
  'số người xem đồng thời trung bình': 'trungBinhDongThoi',

  /* Activity · Hoạt động */
  'live duration': 'thoiLuong',
  'thời lượng live': 'thoiLuong',
  'total live streams': 'soPhien',
  'tổng số phiên live': 'soPhien',

  /* Engagement · Tương tác */
  gifters: 'nguoiTangQua',
  'người gửi quà tặng': 'nguoiTangQua',
  'new followers': 'followerMoi',
  'follower mới': 'followerMoi',
  'viewers who commented': 'nguoiBinhLuan',
  'người xem đã bình luận': 'nguoiBinhLuan',
  likes: 'thich',
  'lượt thích': 'thich',
  shares: 'chiaSe',
  'lượt chia sẻ': 'chiaSe',

  /* Rewards · Phần thưởng */
  diamonds: 'kimCuong',
  'kim cương': 'kimCuong',
  usd: 'usd',
};

/* Bản xuất nào nhận ra nhờ cột nào — chỉ để nói lại cho người dùng biết họ vừa
 * tải cái gì lên, không dùng để quyết định đọc. */
const NHAN_DANG = [
  ['Số liệu người xem', 'luotXem'],
  ['Hoạt động', 'thoiLuong'],
  ['Tương tác', 'thich'],
  ['Phần thưởng', 'kimCuong'],
];

const chuanCot = (s) => String(s || '').replace(/^﻿/, '').trim().toLowerCase();

/** Tách một dòng CSV có dấu nháy kép, chịu được dấu phẩy nằm trong ô. */
function tachDong(dong) {
  const ra = [];
  let o = '';
  let trongNhay = false;
  for (let i = 0; i < dong.length; i += 1) {
    const c = dong[i];
    if (c === '"') {
      if (trongNhay && dong[i + 1] === '"') { o += '"'; i += 1; }
      else trongNhay = !trongNhay;
    } else if ((c === ',' || c === '\t') && !trongNhay) { ra.push(o); o = ''; }
    else o += c;
  }
  ra.push(o);
  return ra.map((x) => x.trim());
}

/**
 * Đọc ngày của LIVE Center.
 *
 * Dạng thật trong tệp: "Sat Aug 01 2026 07:00:00 GMT+0700 (Indochina Time)".
 * Date.parse hiểu được, nhưng phải lấy ngày theo GIỜ VIỆT NAM chứ không theo
 * UTC — 07:00+07 là 00:00 UTC cùng ngày, nhưng một bản xuất khác giờ là lệch
 * sang hôm trước. Cắt thẳng từ chuỗi khi nhận ra dạng đó thì không phụ thuộc
 * máy chạy ở múi giờ nào.
 */
const THANG = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function docNgay(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  let m = /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/.exec(t);
  if (m) {
    const th = THANG[m[1].toLowerCase()];
    if (th) return m[3] + '-' + String(th).padStart(2, '0') + '-' + String(Number(m[2])).padStart(2, '0');
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return m[0];
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(t);          // dd/mm/yyyy
  if (m) return m[3] + '-' + String(Number(m[2])).padStart(2, '0') + '-' + String(Number(m[1])).padStart(2, '0');
  return '';
}

const soCua = (v) => {
  const t = String(v == null ? '' : v).replace(/[\s,]/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Đọc một tệp (ZIP, CSV hay TSV) thành các dòng theo ngày.
 * @returns { loai, ds, soCot, cotLa }  — ds rỗng nghĩa là không nhận ra tệp.
 * `soCot` là số cột SỐ đọc được, `cotLa` là những tiêu đề không hiểu. Phải trả
 * cả hai ra ngoài: tệp đọc được ngày mà không đọc được cột số nào thì phải TỪ CHỐI,
 * chứ ghi vào Base toàn số 0 thì bảng vẫn trông bình thường mà số thì mất.
 */
function docMot(buf, ten) {
  let than = buf;
  let tenThat = ten || '';
  if (laZip(buf)) {
    const trong = moZip(buf).filter((x) => /\.(csv|tsv|txt)$/i.test(x.ten));
    if (!trong.length) throw new Error('ZIP không có tệp CSV nào bên trong');
    than = trong[0].than;
    tenThat = trong[0].ten;
  }
  const chu = Buffer.isBuffer(than) ? than.toString('utf8') : String(than);
  const dong = chu.replace(/^﻿/, '').trim().split(/\r?\n/).filter(Boolean);
  if (dong.length < 2) return { loai: '', ds: [], soCot: 0, cotLa: [], ten: tenThat };

  const tieuDe = tachDong(dong[0]).map(chuanCot);
  const map = tieuDe.map((c) => COT[c] || '');
  if (!map.includes('ngay')) return { loai: '', ds: [], soCot: 0, cotLa: tieuDe, ten: tenThat };

  const ds = [];
  for (let i = 1; i < dong.length; i += 1) {
    const o = tachDong(dong[i]);
    const r = {};
    map.forEach((k, j) => {
      if (!k) return;
      if (k === 'ngay') r.ngay = docNgay(o[j]);
      else r[k] = soCua(o[j]);
    });
    if (r.ngay) ds.push(r);
  }
  const loai = (NHAN_DANG.find(([, k]) => map.includes(k)) || ['Không rõ'])[0];
  const cotLa = tieuDe.filter((c, j) => c && !map[j]);
  return { loai, ds, soCot: map.filter(Boolean).length - 1, cotLa, ten: tenThat };
}

/**
 * Gộp nhiều tệp lại theo ngày.
 *
 * NGÀY KHÔNG CÓ SỐ NÀO THÌ BỎ. Bản xuất trải đủ 31 ngày của tháng, ngày không
 * LIVE thì mọi cột đều 0 — ghi hết là Base đầy những dòng rỗng, và biểu đồ
 * "ngày có LIVE" thành sai. Đo trên bản xuất thật: 31 ngày, chỉ 12 ngày có số.
 */
function gop(teps) {
  const theoNgay = new Map();
  const loai = [];
  let boQua = 0;
  (teps || []).forEach((t) => {
    if (t.loai) loai.push(t.loai);
    (t.ds || []).forEach((r) => {
      const cu = theoNgay.get(r.ngay) || { ngay: r.ngay };
      Object.keys(r).forEach((k) => { if (k !== 'ngay') cu[k] = r[k]; });
      theoNgay.set(r.ngay, cu);
    });
  });
  const ra = [];
  [...theoNgay.values()].sort((a, b) => a.ngay.localeCompare(b.ngay)).forEach((r) => {
    const coSo = Object.keys(r).some((k) => k !== 'ngay' && Number(r[k]) > 0);
    if (coSo) ra.push(r); else boQua += 1;
  });
  return { ds: ra, loai: [...new Set(loai)], boQuaNgayTrong: boQua };
}

/**
 * Đoán kênh từ tên tệp. LIVE Center đặt tên kèm handle:
 * "LIVE_58550-10-15_58632-12-04_rootytrip.official_Viewership.zip".
 * Đoán hụt thì thôi, để người dùng tự chọn — đoán bừa là số vào nhầm kênh.
 */
function handleTuTen(ten) {
  /* KHÔNG cho gạch dưới vào lớp ký tự của handle: tên tệp còn hai cụm số phía
   * trước ("LIVE_58550-10-15_58632-12-04_…"), gạch dưới lọt vào là nuốt luôn
   * mấy cụm ấy và ra "1_2_abc.def". Handle TikTok có gạch dưới thì đoán hụt —
   * mà đoán hụt nghĩa là người dùng tự chọn kênh, tức là an toàn. */
  /* Tên tệp cũng dịch theo ngôn ngữ tài khoản: "_Hoạt động.zip" thay vì
   * "_Activity.zip". Thiếu bản tiếng Việt thì không đoán được kênh, nhân sự phải
   * tự chọn — chọn nhầm là số vào nhầm kênh. */
  const duoi = 'Viewership|Activity|Engagement|Rewards'
    + '|Số liệu người xem|Hoạt động|Tương tác|Phần thưởng';
  const m = new RegExp('_([A-Za-z0-9.]{3,30})_(' + duoi + ')(?=[._]|$)', 'i')
    .exec(String(ten || '').replace(/\.(zip|csv|tsv|txt)$/i, ''));
  return m ? m[1].toLowerCase() : '';
}

/* ---------------- ghi vào Base ---------------- */

const SO = ['soPhien', 'thoiLuong', 'luotXem', 'nguoiXemRieng', 'nguoiXemTuongTac',
  'xemTrungBinh', 'dinhDongThoi', 'trungBinhDongThoi', 'nguoiTangQua', 'followerMoi',
  'nguoiBinhLuan', 'thich', 'chiaSe', 'kimCuong', 'usd'];

/**
 * Ghi các dòng đã gộp vào bảng "LIVE theo ngày", theo KHOÁ nên tải lại đè lên
 * chính nó — đúng ý anh Hùng: "báo cáo theo tuần và tháng cập nhật lại một lần".
 *
 * CHỈ GHI CỘT CÓ TRONG TỆP VỪA TẢI. Tải mỗi tệp Rewards thì không được phép
 * xoá trắng lượt xem đã ghi từ tệp Viewership hôm trước. Đây là chỗ dễ sai
 * nhất của kiểu nhập nhiều tệp rời.
 */
async function ghi({ ds, kenh, nguon, store, lark, cfg }) {
  const T = cfg.tables.liveNgay;
  const f = T.f;
  if (!kenh || !kenh.extId) throw new Error('Chưa biết ghi cho kênh nào');

  const cu = await lark.listAll(T.id);
  const theoKhoa = new Map(cu.map((r) => [store.clean(r.c[f.key]), r.id]));
  const luc = store.gioVeBase(new Date().toISOString());

  const moi = [];
  const sua = {};
  ds.forEach((r) => {
    const khoa = kenh.extId + '#' + r.ngay;
    const o = {
      [f.key]: khoa,
      [f.date]: store.ngayVeBase(r.ngay),
      [f.platform]: kenh.platform || 'TikTok',
      [f.source]: nguon || 'TikTok LIVE Center',
      [f.updated]: luc,
    };
    if (kenh.id) o[f.channel] = [kenh.id];
    SO.forEach((k) => { if (r[k] != null) o[f[k]] = Number(r[k]) || 0; });
    const recId = theoKhoa.get(khoa);
    if (recId) sua[recId] = o; else moi.push(o);
  });

  if (moi.length) await lark.createMany(T.id, moi);
  if (Object.keys(sua).length) await lark.updateMany(T.id, sua);
  return { them: moi.length, capNhat: Object.keys(sua).length };
}

module.exports = { docMot, gop, ghi, handleTuTen, docNgay, tachDong, COT, SO };
