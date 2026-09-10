'use strict';
/**
 * LỚP THU SỐ LIỆU — biến số của các app con thành `soLieu` mà bộ máy chấm điểm ăn được.
 *
 * Nguyên tắc: app KPI **không tự gọi nền tảng**. TikTok, Facebook, Instagram,
 * Zalo OA đã có app Social kéo về; quảng cáo đã có app Ads; booking đã có app OTA.
 * Gọi lại một lần nữa ở đây là tạo ra định nghĩa thứ hai cho cùng một chỉ số, và
 * đến lúc hai số lệch nhau thì không ai biết số nào đúng.
 *
 * Mã nguồn của một tiêu chí có dạng `Kênh|Tên kênh|Loại#chỉ số`, ví dụ
 * `FB|Rooty Trip Phú Quốc|Bài viết#view`. Nhờ vậy suy được nơi lấy số mà không
 * cần bảng ánh xạ riêng — thêm một kênh vào bộ luật là tự có nguồn.
 *
 * Chỉ số nào không suy được (SEO, KOL, thiết kế, các nền tảng không có API) thì
 * trả về `thieu` để giao diện biết mà đòi tải file lên.
 */
const http = require('http');
const https = require('https');

/* Địa chỉ các app con. Chạy cục bộ thì đúng cổng trong modules.json của hub;
 * lên Render thì khai lại bằng biến môi trường. */
const DIA_CHI = {
  social: process.env.KPI_URL_SOCIAL || 'http://localhost:5178',
  'quang-cao': process.env.KPI_URL_ADS || 'http://localhost:5176',
  ota: process.env.KPI_URL_OTA || 'http://localhost:5177',
  'cong-viec': process.env.KPI_URL_VIEC || 'http://localhost:5173',
};

/* Tên kênh trong bộ luật ↔ tên nền tảng trong app Social. */
const NEN_TANG = {
  fb: 'Facebook', facebook: 'Facebook',
  tiktok: 'TikTok',
  insta: 'Instagram', instagram: 'Instagram',
  zalooa: 'Zalo OA', zalo: 'Zalo OA',
  douying: 'Douyin', douyin: 'Douyin',
  xiaohongshu: 'Xiaohongshu',
  youtube: 'YouTube',
};

/* Chỉ số trong bộ luật ↔ trường app Social trả về. */
const CHI_SO_BAI = {
  view: 'views', follow: 'followUp', lead: 'leads',
  reach: 'reach', engagement: 'engagement', comment: 'comments',
  share: 'shares', save: 'saves', click: 'clicks', message: 'messages',
  post: 'posts', impression: 'impressions',
};
const CHI_SO_LIVE = {
  liveView: 'views', liveFollow: 'newFollows', liveComment: 'comments',
  liveLike: 'likes', liveShare: 'shares', livePeak: 'peak', liveMinute: 'minutes',
};

const chuan = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .replace(/\s+/g, ' ').trim().toLowerCase();

/** Tách mã nguồn thành các phần. Trả null nếu không phải dạng kênh. */
function tach(ma) {
  const i = String(ma).lastIndexOf('#');
  if (i < 0) return null;
  const phan = ma.slice(0, i).split('|');
  if (phan.length < 3) return null;
  return { kenh: phan[0], tenKenh: phan[1], loai: phan[2], chiSo: ma.slice(i + 1) };
}

function goi(url, giay = 20) {
  return new Promise((giai, tu) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return tu(new Error('HTTP ' + res.statusCode + ' — ' + s.slice(0, 120)));
        try { giai(JSON.parse(s)); } catch (_) { tu(new Error('Không phải JSON: ' + s.slice(0, 120))); }
      });
    });
    req.on('error', (e) => tu(new Error(e.code === 'ECONNREFUSED'
      ? 'app chưa chạy (' + url.split('/api')[0] + ')' : e.message)));
    req.setTimeout(giay * 1000, () => { req.destroy(new Error('quá ' + giay + ' giây')); });
  });
}

/** Ngày đầu và cuối của một tháng 'YYYY-MM'. */
function khoang(thang) {
  const [y, m] = thang.split('-').map(Number);
  const cuoi = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { tu: thang + '-01', den: thang + '-' + String(cuoi).padStart(2, '0') };
}

/**
 * Đổ số về cho một tháng.
 * @returns { soLieu, nhatKy: [{ma, nguon, so, trangThai, ghi}] }
 *   trangThai: 'lay-duoc' | 'thieu' | 'loi'
 */
async function docTuApp(thang, luat, khoangRieng) {
  /* `khoangRieng` cho phép đọc một lát cắt ngắn hơn tháng — dùng cho tiến độ
   * theo tuần: cùng bộ luật, chỉ đổi cửa sổ thời gian. */
  const { tu, den } = khoangRieng && khoangRieng.tu && khoangRieng.den
    ? khoangRieng : khoang(thang);
  const soLieu = {};
  const nhatKy = [];
  const loiApp = {};

  /* Gọi app Social đúng MỘT lần cho cả tháng rồi tra bảng — mỗi tiêu chí một
   * lời gọi thì 50 tiêu chí là 50 vòng mạng cho cùng một khoảng thời gian. */
  let social = null;
  try {
    social = await goi(DIA_CHI.social + '/api/tong-quan?from=' + tu + '&to=' + den);
  } catch (e) { loiApp.social = e.message; }

  /* Khớp kênh PHẢI có cả nền tảng, không được khớp mình cái tên.
   * "Rooty Trip Phú Quốc" tồn tại trên cả Facebook lẫn TikTok; bản đầu của hàm
   * này có nhánh dự phòng khớp theo tên nên đã điền view của TikTok vào ô view
   * của Facebook — đúng loại lỗi âm thầm đã phá file Excel, mà lần này số sai
   * chạy thẳng vào bảng lương. Thà báo thiếu còn hơn điền nhầm. */
  const kenhTheoTen = new Map();
  (social && social.kenh ? social.kenh : []).forEach((k) => {
    kenhTheoTen.set(chuan(k.platform) + '|' + chuan(k.name), k);
  });
  /* Gộp phiên LIVE theo kênh — app Social trả danh sách từng phiên. */
  const liveTheoKenh = new Map();
  (social && social.live ? social.live : []).forEach((l) => {
    const k = chuan(l.channel || l.channelName || '');
    const o = liveTheoKenh.get(k) || { views: 0, newFollows: 0, comments: 0, likes: 0, shares: 0, peak: 0, minutes: 0, soPhien: 0 };
    ['views', 'newFollows', 'comments', 'likes', 'shares', 'minutes'].forEach((x) => { o[x] += Number(l[x]) || 0; });
    o.peak = Math.max(o.peak, Number(l.peak) || 0);
    o.soPhien += 1;
    liveTheoKenh.set(k, o);
  });

  /**
   * @param cach với số CHƯA lấy được: phải làm gì để có nó. Bốn cách khác nhau
   *   hẳn về người làm và nơi làm, nên đừng dồn hết thành một chữ "thiếu":
   *     'base' — số có thể có, chỉ là base nguồn chưa nhập / chưa đồng bộ
   *     'file' — nền tảng không mở API, phải xuất file rồi tải lên đây
   *     'tay'  — không nền tảng nào đo được, người phụ trách tự nhập
   *     'noi'  — app nguồn đã có nhưng app này chưa nối vào
   *     'luat' — sai ở bộ luật, không phải thiếu số
   */
  const ghi = (ma, nguon, so, trangThai, chuThich, cach) => {
    if (typeof so === 'number' && Number.isFinite(so)) soLieu[ma] = so;
    nhatKy.push({
      ma, nguon, so: (typeof so === 'number' ? so : null), trangThai,
      ghi: chuThich || '', cach: trangThai === 'lay-duoc' ? '' : (cach || 'luat'),
    });
  };

  (luat.nhom || []).forEach((n) => {
    (n.tieuChi || []).forEach((tc) => {
      const t = tach(tc.nguon);
      if (!t) { ghi(tc.nguon, '', null, 'thieu', 'Mã nguồn không theo dạng Kênh|Tên|Loại#chỉ số', 'luat'); return; }

      const nt = NEN_TANG[chuan(t.kenh)];
      const laLive = chuan(t.loai) === 'live' || !!CHI_SO_LIVE[t.chiSo];

      if (!nt) { ghi(tc.nguon, t.kenh, null, 'thieu', 'Nền tảng này không có trong app Social — xuất file từ nền tảng rồi tải lên', 'file'); return; }
      if (loiApp.social) { ghi(tc.nguon, 'Social', null, 'loi', loiApp.social, 'noi'); return; }

      if (laLive) {
        const o = liveTheoKenh.get(chuan(t.tenKenh));
        const truong = CHI_SO_LIVE[t.chiSo];
        if (!truong) return ghi(tc.nguon, 'Social · LIVE', null, 'thieu', 'Bộ luật gọi tên chỉ số LIVE "' + t.chiSo + '" mà app Social không có', 'luat');
        /* Phân biệt hai chuyện mà bản trước gộp làm một:
         *   - CẢ THÁNG không kênh nào có phiên LIVE → nguồn LIVE chưa nối, chứ
         *     không phải phòng không livestream. LIVE của TikTok/Instagram
         *     KHÔNG có API (app Social khai rõ ở màn Nhập tay), nên số này chỉ
         *     có khi có người gõ vào.
         *   - Có kênh khác live mà kênh này không → đây mới là số 0 thật.
         * Bản trước lúc nào cũng ghi "kênh này chưa có phiên LIVE nào", đọc lên
         * thành "bạn đó không live" trong khi sự thật là chưa ai nối nguồn. */
        if (!o) {
          return liveTheoKenh.size === 0
            ? ghi(tc.nguon, 'Social · LIVE', null, 'thieu',
              'Chưa nối nguồn LIVE — cả tháng không kênh nào có phiên nào. '
              + 'LIVE của TikTok/Instagram không có API, phải nhập tay ở app Social → Nhập tay', 'tay')
            : ghi(tc.nguon, 'Social · LIVE', null, 'thieu',
              'Các kênh khác có phiên LIVE trong tháng, riêng kênh này không — '
              + 'nếu đúng là không live thì đây là số 0 thật, không phải thiếu nguồn', 'base');
        }
        return ghi(tc.nguon, 'Social · LIVE (' + o.soPhien + ' phiên)', o[truong], 'lay-duoc');
      }

      const k = kenhTheoTen.get(chuan(nt) + '|' + chuan(t.tenKenh));
      const truong = CHI_SO_BAI[t.chiSo];
      if (!truong) return ghi(tc.nguon, 'Social', null, 'thieu', 'Bộ luật gọi tên chỉ số "' + t.chiSo + '" mà app Social không có', 'luat');
      if (!k) return ghi(tc.nguon, 'Social', null, 'thieu', 'Base Social chưa có kênh "' + t.tenKenh + '" (' + nt + ') — thêm kênh rồi đồng bộ', 'base');
      /* Số từ nền tảng là số THÔ: chưa qua luật bù view, chưa nhân hệ số
       * Bán hàng / Tương tác. Cột kết quả trong Excel là số ĐÃ qua hai bước đó,
       * nên hai con số không cùng nghĩa. Đánh dấu để giao diện cảnh báo, đừng
       * lặng lẽ thay số thô vào công thức tính lương. */
      const thoBoc = ['view', 'reach', 'impression'].includes(t.chiSo);
      return ghi(tc.nguon, 'Social · ' + k.platform, Number(k[truong]) || 0, 'lay-duoc',
        thoBoc ? 'số thô — chưa áp luật bù view và hệ số nội dung' : '');
    });
  });

  /* Chỉ số đơn lẻ của Hân và Hùng — mỗi cái một app khác nhau. */
  const donLe = new Set();
  (luat.nguoi || []).forEach((ng) => (ng.tieuChi || []).forEach((tc) => {
    if (tc.nguon && tc.nguon.kieu === 'chiSo' && tc.nguon.ma) donLe.add(tc.nguon.ma);
  }));
  for (const ma of donLe) {
    if (ma.startsWith('seo.')) ghi(ma, 'Search Console / GA4', null, 'thieu', 'Google không mở API cho app này — xuất file rồi tải lên', 'file');
    else if (ma.startsWith('kol.')) ghi(ma, 'KOL', null, 'thieu', 'Không nền tảng nào đo — người phụ trách tự nhập', 'tay');
    else if (ma.startsWith('ads.')) ghi(ma, 'App Quản lý quảng cáo', null, 'thieu', 'App đã chạy, chỉ chưa nối vào phần KPI', 'noi');
    else if (ma.startsWith('ota.')) ghi(ma, 'App Booking OTA', null, 'thieu', 'App đã chạy, chỉ chưa nối vào phần KPI', 'noi');
    else ghi(ma, '', null, 'thieu', 'Bộ luật chưa khai nguồn cho chỉ số này', 'luat');
  }

  const dem = { layDuoc: 0, thieu: 0, loi: 0 };
  nhatKy.forEach((x) => {
    if (x.trangThai === 'lay-duoc') dem.layDuoc += 1;
    else if (x.trangThai === 'loi') dem.loi += 1;
    else dem.thieu += 1;
  });
  return { thang, tu, den, soLieu, nhatKy, dem, loiApp };
}

/* ---------------- tải file lên ----------------
 * Cho nền tảng không có API (YouTube, Douyin, Xiaohongshu) và cho SEO.
 * Nhận bảng dán từ Excel (tab) hoặc CSV. Nhận theo TÊN COT chứ không theo thứ tự
 * — người ta xuất file mỗi lần một kiểu, ép đúng thứ tự là tháng nào cũng vỡ. */
const COT = {
  kenh: ['kênh', 'tên kênh', 'channel', 'kenh'],
  chiSo: ['chỉ số', 'chi so', 'metric', 'tiêu chí', 'tieu chi'],
  giaTri: ['giá trị', 'gia tri', 'value', 'số', 'so', 'kết quả', 'ket qua'],
};

function tachBang(text) {
  const dong = String(text || '').split(/\r?\n/).filter((d) => d.trim());
  if (dong.length < 2) return { loi: 'Cần ít nhất một dòng tiêu đề và một dòng dữ liệu' };
  const dau = dong[0].includes('\t') ? '\t' : (dong[0].includes(';') ? ';' : ',');
  const tieuDe = dong[0].split(dau).map((x) => chuan(x.replace(/^"|"$/g, '')));
  const viTri = {};
  Object.entries(COT).forEach(([k, ten]) => {
    const i = tieuDe.findIndex((h) => ten.some((t) => h === chuan(t)));
    if (i >= 0) viTri[k] = i;
  });
  if (viTri.giaTri == null) {
    return { loi: 'Không thấy cột giá trị. Cần các cột: ' + Object.values(COT).map((v) => v[0]).join(' · ') };
  }
  const hang = [];
  for (let i = 1; i < dong.length; i += 1) {
    const o = dong[i].split(dau).map((x) => x.replace(/^"|"$/g, '').trim());
    const raw = o[viTri.giaTri];
    /* Số kiểu Việt (1.234.567,8) lẫn kiểu Anh (1,234,567.8) đều phải đọc được. */
    const so = doSo(raw);
    if (so == null) continue;
    hang.push({
      kenh: viTri.kenh != null ? o[viTri.kenh] : '',
      chiSo: viTri.chiSo != null ? o[viTri.chiSo] : '',
      giaTri: so,
    });
  }
  return { hang };
}

/**
 * Đọc số kiểu Việt (1.234.567,8) lẫn kiểu Anh (1,234,567.8).
 * Cùng một cách đọc với `soVN` của app Social — hai app đọc số khác nhau thì
 * cùng một file tải lên hai chỗ sẽ ra hai con số, và không ai biết vì sao.
 * Khác một điểm: ở đây trả `null` khi không phải số, để phân biệt "ô trống"
 * với "số 0" — bộ máy chấm điểm coi hai thứ đó khác hẳn nhau.
 */
function doSo(v) {
  const s = String(v == null ? '' : v).replace(/[^0-9.,-]/g, '');
  if (!s) return null;
  const cham = (s.match(/\./g) || []).length;
  const phay = (s.match(/,/g) || []).length;

  let thapPhan = '';
  if (cham && phay) thapPhan = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
  else if (cham === 1 || phay === 1) {
    /* Một dấu, theo sau đúng 3 chữ số thì coi là dấu nghìn: "2,345" là 2345,
     * không phải 2,345. Xuất từ nền tảng gần như luôn là dấu nghìn. */
    const d = cham ? '.' : ',';
    if (!/^-?\d+[.,]\d{3}$/.test(s)) thapPhan = d;
  }

  let ra = s;
  if (thapPhan) {
    const i = ra.lastIndexOf(thapPhan);
    ra = ra.slice(0, i).replace(/[.,]/g, '') + '.' + ra.slice(i + 1).replace(/[.,]/g, '');
  } else {
    ra = ra.replace(/[.,]/g, '');
  }
  const n = Number(ra);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ghép bảng đã tải lên vào mã nguồn của bộ luật.
 * Khớp theo tên kênh + tên chỉ số, bỏ dấu và không phân biệt hoa thường.
 */
function ghepFile(bang, luat) {
  const dich = [];
  (luat.nhom || []).forEach((n) => (n.tieuChi || []).forEach((tc) => {
    const t = tach(tc.nguon);
    if (t) dich.push({ ma: tc.nguon, kenh: chuan(t.tenKenh), chiSo: chuan(t.chiSo), ten: chuan(tc.ten) });
  }));

  const soLieu = {}; const khop = []; const truot = [];
  bang.forEach((h) => {
    const k = chuan(h.kenh); const c = chuan(h.chiSo);
    const hit = dich.find((d) => (!k || d.kenh === k) && (d.chiSo === c || d.ten === c));
    if (hit) { soLieu[hit.ma] = h.giaTri; khop.push({ ...h, ma: hit.ma }); }
    else truot.push(h);
  });
  return { soLieu, khop, truot };
}

module.exports = { docTuApp, tachBang, ghepFile, doSo, khoang, DIA_CHI };
