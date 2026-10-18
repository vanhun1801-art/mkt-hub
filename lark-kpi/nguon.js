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
  'chinh-anh': process.env.KPI_URL_CHINH_ANH || 'http://localhost:5181',
  kol: process.env.KPI_URL_KOL || 'http://localhost:5186',
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
  /* LƯỢT XEM TÁCH THEO MỤC ĐÍCH BÀI.
   *
   * Anh Hùng 18/10/2026: *"view thì để tính kết quả KPI sẽ là tính view của
   * video bán hàng hay video tương tác"*. Một lượt xem bài bán tour không cùng
   * giá trị với một lượt xem bài giải trí, nên gộp chung rồi chấm là chấm sai
   * — và sai lệch về đúng phía người đăng nhiều bài tương tác.
   *
   * Tháng 10/2026 đo được: Hằng 40 bài bán hàng / 13 tương tác, còn Ngọc 6 /
   * 47. Gộp chung thì hai người nhìn như nhau.
   *
   * `viewQuyDoi` nhân hệ số của bộ luật (Bán hàng ×1,0 · Tương tác ×0,2) —
   * chính con số mà cột kết quả của file Excel vẫn dùng.
   */
  viewBanHang: 'viewBanHang',
  viewTuongTac: 'viewTuongTac',
  viewQuyDoi: 'viewQuyDoi',
  baiBanHang: 'baiBanHang',
  baiTuongTac: 'baiTuongTac',
};

/* Nhãn mục đích trong Base, so không dấu. */
const LA_BAN_HANG = /^ban hang/;
const LA_TUONG_TAC = /^tuong tac/;
const CHI_SO_LIVE = {
  liveView: 'views', liveFollow: 'newFollows', liveComment: 'comments',
  liveLike: 'likes', liveShare: 'shares', livePeak: 'peak', liveMinute: 'minutes',
};

const chuan = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Tách mã nguồn thành các phần. Trả null nếu không phải dạng kênh.
 *
 * Phần thứ TƯ là tuỳ chọn: mã người đăng, ví dụ
 * `FB|Rooty Trip Phú Quốc|Bài viết|thu#view`. Có nó thì chỉ tính những bài do
 * người đó đăng. Anh Hùng chốt 18/10/2026: Thư và Ngọc cùng giữ một bộ kênh,
 * nên chia theo tỷ trọng kênh là mỗi lượt xem cho điểm hai lần, hai người —
 * phải chấm theo tên người đăng trên từng bài.
 */
function tach(ma) {
  const i = String(ma).lastIndexOf('#');
  if (i < 0) return null;
  const phan = ma.slice(0, i).split('|');
  if (phan.length < 3) return null;
  return {
    kenh: phan[0], tenKenh: phan[1], loai: phan[2],
    nguoiDang: phan[3] || '',
    chiSo: ma.slice(i + 1),
  };
}

function goi(url, giay = 20) {
  return new Promise((giai, tu) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return tu(new Error('HTTP ' + res.statusCode + ': ' + s.slice(0, 120)));
        try { giai(JSON.parse(s)); } catch (_) { tu(new Error('Dữ liệu trả về không đọc được: ' + s.slice(0, 120))); }
      });
    });
    req.on('error', (e) => tu(new Error(e.code === 'ECONNREFUSED'
      ? 'app chưa chạy (' + url.split('/api')[0] + ')' : e.message)));
    req.setTimeout(giay * 1000, () => { req.destroy(new Error('quá ' + giay + ' giây chưa trả lời')); });
  });
}

/** Danh sách bài của một khoảng, lấy thẳng từ app Social. */
async function layBai(tu, den) {
  const r = await goi(DIA_CHI.social + '/api/bai?from=' + tu + '&to=' + den + '&n=100000', 120);
  return (r && r.bai) || [];
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
async function docTuApp(thang, luat, khoangRieng, kho) {
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

  /* ---------------- số theo BÀI ----------------
   *
   * VÌ SAO KHÔNG LẤY THEO DÒNG NGÀY NỮA.
   *
   * Dòng ngày của TikTok không do nền tảng trả mà do app Social tự tính bằng
   * chênh lệch lượt xem giữa hai lần đồng bộ. Ngày nào không chạy đồng bộ thì
   * ngày đó không có số. Thực tế trong Base: lượt xem TikTok theo kênh có số
   * tháng 1–4/2026 rồi **bằng 0 suốt tháng 5 đến tháng 8**, trong khi bảng Bài
   * đăng của chính Base đó có 40 triệu lượt xem TikTok cả năm.
   *
   * Hậu quả đã xảy ra thật: màn Tiến độ hiện bốn kênh TikTok "0%" kèm chú
   * thích "3/3 chỉ số đo được" — app tin là đã đo và không ai xem. Thư và Ngọc
   * để 45% trọng số ở TikTok nên cả hai đứng ở 36%. Con số đó không phải kết
   * quả làm việc, nó là một đường dữ liệu đứt.
   *
   * Bảng Bài đăng thì đủ: ngày 17/10/2026 đối chiếu từng ID với Facebook,
   * Instagram, TikTok và Zalo — không thiếu bài nào. Nên mọi chỉ số đếm được
   * trên từng bài đều lấy từ đó, cộng các bài ĐĂNG trong kỳ.
   *
   * Còn `follow` thì bài không mang được — tăng người theo dõi là số của cả
   * kênh — nên nó vẫn đi đường dòng ngày, và phải tự biết lúc nào mình trống.
   */
  let dsBai = null;
  if (!loiApp.social) {
    /* Màn Tiến độ gọi hàm này một lần cho MỖI MỐC TUẦN — cùng một tháng, chỉ
     * khác ngày kết thúc. Danh sách bài của cả tháng nặng vài MB, kéo lại từng
     * mốc là tốn gấp mấy lần cho đúng một bộ dữ liệu. Nên người gọi đưa sẵn
     * danh sách của cả tháng vào `kho`, ở đây chỉ cắt theo ngày. */
    if (kho && kho.bai) {
      dsBai = kho.bai.filter((p) => {
        const d = (p.publishedAt || p.date || '').slice(0, 10);
        return !d || (d >= tu && d <= den);
      });
    } else {
      try {
        const r = await goi(DIA_CHI.social + '/api/bai?from=' + tu + '&to=' + den + '&n=100000', 90);
        dsBai = (r && r.bai) || [];
      } catch (e) { loiApp.bai = e.message; }
    }
  }

  /* Cộng bài theo kênh, và theo kênh × người đăng. Hai bảng dựng một lượt. */
  const baiTheoKenh = new Map();
  const CONG = ['views', 'reach', 'impressions', 'engagement', 'comments', 'shares', 'saves'];
  const THEO_MUC_DICH = ['viewBanHang', 'viewTuongTac', 'viewQuyDoi',
    'baiBanHang', 'baiTuongTac', 'baiChuaPhanLoai'];
  /* Hệ số quy đổi theo mục đích, lấy từ chính bộ luật của tháng. Không chép
   * cứng 1,0 / 0,2 vào đây: đổi hệ số là quyết định của quản lý, và nó phải
   * đổi ở MỘT chỗ rồi mọi nơi theo. */
  const heSo = (luat.heSo && luat.heSo.macDinh) || {};
  const heSoBan = Number.isFinite(Number(heSo['Bán hàng'])) ? Number(heSo['Bán hàng']) : 1;
  const heSoTt = Number.isFinite(Number(heSo['Tương tác'])) ? Number(heSo['Tương tác']) : 0.2;

  const gomBai = (khoa, p) => {
    const o = baiTheoKenh.get(khoa)
      || { soBai: 0, clicks: null, viewBanHang: 0, viewTuongTac: 0, viewQuyDoi: 0,
        baiBanHang: 0, baiTuongTac: 0, baiChuaPhanLoai: 0 };
    o.soBai += 1;
    CONG.forEach((f) => { o[f] = (o[f] || 0) + (Number(p[f]) || 0); });
    /* Lượt bấm: chỉ Facebook trả, và ô trống nghĩa là chưa đo được. Cộng ô
     * trống thành 0 là biến "chưa đo" thành "không ai bấm". */
    if (p.clicks != null) o.clicks = (o.clicks || 0) + Number(p.clicks);

    /* BÀI CHƯA GẮN NHÃN KHÔNG ĐƯỢC ĐOÁN BỪA. Xếp nó vào Tương tác là trừ oan
     * 80% lượt xem; xếp vào Bán hàng là cho không. Đếm riêng rồi nói ra. */
    const md = chuan(p.mucDich);
    const v = Number(p.views) || 0;
    if (LA_BAN_HANG.test(md)) {
      o.baiBanHang += 1; o.viewBanHang += v; o.viewQuyDoi += v * heSoBan;
    } else if (LA_TUONG_TAC.test(md)) {
      o.baiTuongTac += 1; o.viewTuongTac += v; o.viewQuyDoi += v * heSoTt;
    } else {
      o.baiChuaPhanLoai += 1;
    }
    baiTheoKenh.set(khoa, o);
  };
  (dsBai || []).forEach((p) => {
    const nen = chuan(p.platform);
    const ken = chuan(p.channel || p.channelExtId || '');
    gomBai(nen + '|' + ken, p);
    if (p.poster) gomBai(nen + '|' + ken + '|' + chuan(p.poster), p);
  });

  /* Tên trong plugin Người đăng KHÁC tên trong bộ luật, và không giống nhau một
   * chữ nào — "Phương Ái" là Thư, "Lý Thư Bạch" là Ngọc (anh Hùng xác nhận
   * 07/10/2026). Nên tra bằng bảng khai, tuyệt đối không suy từ tên. */
  /* LEAD không đếm được trên bài: nó là hội thoại của khách, nằm ở Pancake.
   * App Quảng cáo đã gom sẵn theo kênh (`/api/tin-nhan`) với luật "có thẻ của
   * Sale là lead" — dùng lại đúng con số đó thay vì tự định nghĩa lần hai. */
  let tinNhan = null;
  /* Pancake phải phân trang từng trang nên một lượt gom mất hàng chục giây.
   * Màn Tiến độ hỏi nhiều mốc tuần, mỗi mốc một khoảng khác nhau nên bộ nhớ
   * đệm bên app Quảng cáo không đỡ được. Cho người gọi nhớ hộ theo khoảng. */
  const khoaTn = tu + '|' + den;
  if (kho && kho.tinNhan && kho.tinNhan.has(khoaTn)) {
    tinNhan = kho.tinNhan.get(khoaTn);
  } else {
    try {
      const r = await goi(DIA_CHI['quang-cao'] + '/api/tin-nhan?tu=' + tu + '&den=' + den, 180);
      tinNhan = r || null;
    } catch (e) { loiApp.tinNhan = e.message; }
    if (kho && kho.tinNhan) kho.tinNhan.set(khoaTn, tinNhan);
  }
  const leadTheoKenh = new Map();
  ((tinNhan && tinNhan.rows) || []).forEach((r) => {
    leadTheoKenh.set(chuan(r.platform) + '|' + chuan(r.channel),
      { lead: Number(r.lead) || 0, hoiThoai: Number(r.soHoiThoai) || 0 });
  });
  const chuaNoiPancake = new Set(((tinNhan && tinNhan.chuaNoi) || [])
    .map((r) => chuan(r.platform) + '|' + chuan(r.channel)));

  const PV = require('./pham-vi');
  const tenDangCua = (maNguoi) => {
    const pv = PV.cua(maNguoi) || (PV.MAC_DINH || {})[maNguoi];
    return ((pv && pv.tenDang) || []).map(chuan);
  };
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

      if (!nt) { ghi(tc.nguon, t.kenh, null, 'thieu', 'Nền tảng này không có trong app Social. Xuất file từ nền tảng rồi tải lên', 'file'); return; }
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
              'Cả tháng chưa kênh nào có phiên LIVE. Nhập tay ở app Social → Nhập tay', 'tay')
            : ghi(tc.nguon, 'Social · LIVE', null, 'thieu',
              'Kênh khác có LIVE, riêng kênh này không. Nếu đúng là không live thì đây là số 0 thật', 'base');
        }
        return ghi(tc.nguon, 'Social · LIVE (' + o.soPhien + ' phiên)', o[truong], 'lay-duoc');
      }

      const k = kenhTheoTen.get(chuan(nt) + '|' + chuan(t.tenKenh));
      if (!CHI_SO_BAI[t.chiSo]) return ghi(tc.nguon, 'Social', null, 'thieu', 'Bộ luật gọi tên chỉ số "' + t.chiSo + '" mà app Social không có', 'luat');
      if (!k) return ghi(tc.nguon, 'Social', null, 'thieu', 'Base Social chưa có kênh "' + t.tenKenh + '" (' + nt + '). Thêm kênh rồi đồng bộ', 'base');
      if (loiApp.bai) return ghi(tc.nguon, 'Social · Bài đăng', null, 'loi', loiApp.bai, 'noi');

      /* Chọn đúng ô: cả kênh, hay riêng phần của một người. */
      const khoaKenh = chuan(nt) + '|' + chuan(t.tenKenh);
      let o = baiTheoKenh.get(khoaKenh);
      let nhan = 'Social · ' + nt + ' · theo bài';
      if (t.nguoiDang) {
        const tens = tenDangCua(t.nguoiDang);
        if (!tens.length) {
          return ghi(tc.nguon, 'Social', null, 'thieu',
            'Chưa khai tên trong plugin Người đăng cho mã "' + t.nguoiDang
            + '". Khai ở tab Phân công kênh rồi chấm lại', 'luat');
        }
        o = null;
        tens.forEach((tn) => {
          const phan = baiTheoKenh.get(khoaKenh + '|' + tn);
          if (!phan) return;
          o = o || { soBai: 0, clicks: null };
          o.soBai += phan.soBai;
          CONG.concat(THEO_MUC_DICH).forEach((f) => { o[f] = (o[f] || 0) + (phan[f] || 0); });
          if (phan.clicks != null) o.clicks = (o.clicks || 0) + phan.clicks;
        });
        nhan = 'Social · ' + nt + ' · bài của ' + tens.join(', ');
        /* Kênh có bài nhưng không bài nào mang tên người này: đó là số 0 THẬT
         * (tháng này bạn ấy không đăng kênh đó), khác hẳn kênh chưa có bài nào. */
        if (!o && baiTheoKenh.get(khoaKenh)) {
          o = { soBai: 0, clicks: null };
        }
      }

      /* TĂNG NGƯỜI THEO DÕI không nằm trên từng bài — nó là số của cả kênh, nên
       * vẫn phải đi đường dòng ngày. Và đường đó có lúc đứt: nếu cả kỳ dòng ngày
       * không có lượt xem nào trong khi bảng Bài đăng thì có, nghĩa là đồng bộ
       * theo ngày của kênh này không chạy — lúc ấy follow phải là CHƯA ĐO ĐƯỢC
       * chứ không phải 0. Ghi 0 vào đây là trừ điểm oan người giữ kênh. */
      if (t.chiSo === 'follow') {
        if (t.nguoiDang) {
          return ghi(tc.nguon, 'Social · theo ngày', null, 'thieu',
            'Tăng người theo dõi là số của cả kênh, không tách được theo người đăng', 'luat');
        }
        const tang = Number(k.followUp) || 0;
        const baiCoSo = !!(baiTheoKenh.get(khoaKenh) && baiTheoKenh.get(khoaKenh).views > 0);
        /* ĐÚNG SỐ 0 TRÊN MỘT KÊNH ĐANG CHẠY LÀ DẤU HIỆU KHÔNG ĐO ĐƯỢC, không
         * phải kết quả. Kênh có bài, bài có lượt xem, mà người theo dõi không
         * nhúc nhích một ai cả tháng thì gần như chắc là dòng ngày chưa chạy —
         * TikTok và Instagram đều đã rơi vào đúng cảnh này. Ghi 0 vào đây là
         * trừ điểm oan người giữ kênh, nên thà nói thẳng là chưa đo được. */
        if (!tang && baiCoSo) {
          return ghi(tc.nguon, 'Social · theo ngày', null, 'thieu',
            'Kênh có bài và có lượt xem nhưng số theo ngày không ghi nhận một'
            + ' người theo dõi mới nào — đồng bộ theo ngày của kênh này chưa'
            + ' chạy đủ, chưa đo được', 'base');
        }
        return ghi(tc.nguon, 'Social · theo ngày', tang, 'lay-duoc');
      }

      if (t.chiSo === 'lead') {
        if (t.nguoiDang) {
          return ghi(tc.nguon, 'Pancake', null, 'thieu',
            'Tin nhắn khách đến cả kênh, không tách được theo người đăng bài', 'luat');
        }
        if (loiApp.tinNhan) return ghi(tc.nguon, 'App Quảng cáo · Pancake', null, 'loi', loiApp.tinNhan, 'noi');
        const kl = leadTheoKenh.get(chuan(nt) + '|' + chuan(t.tenKenh));
        if (kl) return ghi(tc.nguon, 'Pancake (' + kl.hoiThoai + ' cuộc trò chuyện)', kl.lead, 'lay-duoc');
        if (chuaNoiPancake.has(chuan(nt) + '|' + chuan(t.tenKenh))) {
          return ghi(tc.nguon, 'Pancake', null, 'thieu',
            'Kênh này chưa dán mã trang trong Cài đặt app Quảng cáo nên Pancake'
            + ' chưa đọc được hội thoại', 'base');
        }
        return ghi(tc.nguon, 'Pancake', null, 'thieu',
          'Pancake không có trang nào tên "' + t.tenKenh + '" (' + nt + ')', 'base');
      }

      if (!o) {
        return ghi(tc.nguon, 'Social · Bài đăng', null, 'thieu',
          'Kênh này không có bài nào đăng trong kỳ', 'base');
      }

      const TU_BAI = {
        view: 'views', reach: 'reach', impression: 'impressions',
        engagement: 'engagement', comment: 'comments', share: 'shares',
        save: 'saves', click: 'clicks', post: 'soBai',
        viewBanHang: 'viewBanHang', viewTuongTac: 'viewTuongTac',
        viewQuyDoi: 'viewQuyDoi', baiBanHang: 'baiBanHang', baiTuongTac: 'baiTuongTac',
      };
      const truong = TU_BAI[t.chiSo];
      if (!truong) {
        /* lead và message không đếm được trên bài — chúng là hội thoại của
         * khách, nằm ở Pancake. Xử lý riêng bên dưới. */
        return ghi(tc.nguon, 'Social', null, 'thieu',
          'Chỉ số "' + t.chiSo + '" không đếm được trên từng bài đăng', 'noi');
      }
      const v = o[truong];
      if (v == null) {
        return ghi(tc.nguon, nhan, null, 'thieu',
          'Nền tảng không trả chỉ số này ở mức bài', 'file');
      }
      /* Số từ nền tảng là số THÔ: chưa nhân hệ số Bán hàng / Tương tác. Cột
       * kết quả trong Excel là số ĐÃ qua bước đó, nên hai con số không cùng
       * nghĩa. Nói ra để đừng lặng lẽ thay số thô vào công thức tính lương —
       * và chỉ ra luôn chỉ số đã quy đổi để dùng thay. */
      const theoMd = ['viewBanHang', 'viewTuongTac', 'viewQuyDoi', 'baiBanHang', 'baiTuongTac']
        .includes(t.chiSo);
      let chu = '';
      if (t.chiSo === 'view') {
        chu = 'số THÔ, gộp cả bài bán hàng lẫn bài tương tác.'
          + ' Dùng `viewQuyDoi` nếu muốn áp hệ số Bán hàng/Tương tác';
      } else if (['reach', 'impression'].includes(t.chiSo)) {
        chu = 'số thô, chưa áp hệ số nội dung';
      }
      /* Bài chưa gắn nhãn mục đích thì KHÔNG vào con số quy đổi. Phải kêu, vì
       * nhìn vào chỉ thấy một số nhỏ hơn chứ không thấy phần bị bỏ ra. */
      if (theoMd && o.baiChuaPhanLoai) {
        chu = o.baiChuaPhanLoai + '/' + o.soBai + ' bài chưa gắn nhãn Bán hàng hay '
          + 'Tương tác nên không được tính. Gắn ở app Social → Bài đăng'
          + (chu ? ' · ' + chu : '');
      }
      return ghi(tc.nguon, nhan + ' (' + o.soBai + ' bài)', Number(v) || 0, 'lay-duoc', chu);
    });
  });

  /* Chỉ số đơn lẻ của Hân và Hùng — mỗi cái một app khác nhau. */
  const donLe = new Set();
  (luat.nguoi || []).forEach((ng) => (ng.tieuChi || []).forEach((tc) => {
    if (tc.nguon && tc.nguon.kieu === 'chiSo' && tc.nguon.ma) donLe.add(tc.nguon.ma);
  }));
  /* Chỉ gọi app nào thật sự có chỉ số cần dùng — đừng bắt mọi lượt chấm phải
   * chờ ba app trả lời khi bộ luật không hỏi tới chúng. */
  const can = (tien) => [...donLe].some((m) => m.startsWith(tien));

  let ads = null; let kol = null; let tk = null;
  if (can('ads.')) {
    try { ads = await goi(DIA_CHI['quang-cao'] + '/api/overview?from=' + tu + '&to=' + den, 60); }
    catch (e) { loiApp.ads = e.message; }
  }
  if (can('kol.')) {
    try { kol = await goi(DIA_CHI.kol + '/api/du-lieu', 60); }
    catch (e) { loiApp.kol = e.message; }
  }
  if (can('thietke.')) {
    try { tk = await goi(DIA_CHI['chinh-anh'] + '/api/tong-quan?tu=' + tu + '&den=' + den, 60); }
    catch (e) { loiApp.thietke = e.message; }
  }

  /* Hạng mục KOL đã ĐĂNG trong kỳ. Số lượt xem nằm ở cột xem7/xem30 do người
   * phụ trách nhập tay sau 7 và 30 ngày — chưa nhập thì là CHƯA ĐO ĐƯỢC, không
   * phải không ai xem. */
  const kolTrongKy = (kol && kol.banGiao ? kol.banGiao : []).filter((b) => {
    if (!b.ngayDang) return false;
    const d = new Date(b.ngayDang + 7 * 3600 * 1000).toISOString().slice(0, 10);
    return d >= tu && d <= den;
  });
  const kolXem = kolTrongKy.reduce((a, b) => {
    const v = b.xem30 != null ? b.xem30 : b.xem7;
    return v == null ? a : a + Number(v);
  }, 0);
  const kolCoSo = kolTrongKy.filter((b) => b.xem30 != null || b.xem7 != null).length;

  const soAds = ads && ads.kpi ? ads.kpi : null;
  const ADS = soAds ? {
    'ads.donHang': soAds.conversions, 'ads.doanhThu': soAds.revenue,
    'ads.chiPhi': soAds.spend, 'ads.roas': soAds.roas,
    'ads.cpa': soAds.cpa, 'ads.click': soAds.clicks,
  } : {};
  const TK = tk ? {
    'thietke.anh': tk.soAnh, 'thietke.video': tk.soVideo,
    'thietke.lo': tk.soBaoCao,
    'thietke.ngayCoAnh': tk.soNgayCoAnh, 'thietke.ngayCoVideo': tk.soNgayCoVideo,
  } : {};
  const KOL = kol ? {
    'kol.baiDang': kolTrongKy.length,
    'kol.hopTac': (kol.hopTac || []).length,
  } : {};

  for (const ma of donLe) {
    if (ma in ADS) { ghi(ma, 'App Quảng cáo', Number(ADS[ma]) || 0, 'lay-duoc'); continue; }
    if (ma in TK) { ghi(ma, 'App Chỉnh ảnh', Number(TK[ma]) || 0, 'lay-duoc'); continue; }
    if (ma in KOL) { ghi(ma, 'App KOL', Number(KOL[ma]) || 0, 'lay-duoc'); continue; }

    if (ma === 'kol.view') {
      if (loiApp.kol) ghi(ma, 'App KOL', null, 'loi', loiApp.kol, 'noi');
      else if (!kolTrongKy.length) ghi(ma, 'App KOL', null, 'thieu', 'Kỳ này chưa có hạng mục KOL nào đăng', 'base');
      else if (!kolCoSo) {
        ghi(ma, 'App KOL', null, 'thieu',
          kolTrongKy.length + ' hạng mục đã đăng nhưng chưa ai nhập lượt xem.'
          + ' Nhập ở app KOL → Bàn giao', 'base');
      } else {
        ghi(ma, 'App KOL (' + kolCoSo + '/' + kolTrongKy.length + ' hạng mục có số)', kolXem, 'lay-duoc');
      }
      continue;
    }

    if (ma.startsWith('seo.')) ghi(ma, 'Search Console / GA4', null, 'thieu', 'Google không cho lấy tự động. Xuất file rồi tải lên', 'file');
    else if (ma.startsWith('ads.')) ghi(ma, 'App Quảng cáo', null, loiApp.ads ? 'loi' : 'thieu', loiApp.ads || 'App Quảng cáo không có chỉ số tên này', loiApp.ads ? 'noi' : 'luat');
    else if (ma.startsWith('kol.')) ghi(ma, 'App KOL', null, loiApp.kol ? 'loi' : 'thieu', loiApp.kol || 'App KOL không có chỉ số tên này', loiApp.kol ? 'noi' : 'luat');
    else if (ma.startsWith('thietke.')) ghi(ma, 'App Chỉnh ảnh', null, loiApp.thietke ? 'loi' : 'thieu', loiApp.thietke || 'App Chỉnh ảnh không có chỉ số tên này', loiApp.thietke ? 'noi' : 'luat');
    else if (ma.startsWith('ota.')) ghi(ma, 'App Booking OTA', null, 'thieu', 'App đã có, KPI chưa đọc sang', 'noi');
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

/* `tach`, `chuan` và ba bảng tra được mở ra ngoài để `muc-tieu.js` dùng lại.
 * Khớp kênh là chỗ đã từng sai một lần (điền view TikTok vào ô Facebook vì tên
 * kênh trùng nhau) — chỉ được có MỘT bản luật khớp trong cả app. */
module.exports = {
  docTuApp, layBai, tachBang, ghepFile, doSo, khoang, DIA_CHI,
  tach, chuan, NEN_TANG, CHI_SO_BAI, CHI_SO_LIVE,
};
