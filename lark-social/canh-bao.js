'use strict';
/**
 * Cảnh báo chủ động: app tự nhắn vào nhóm Lark khi có chuyện, thay vì chờ ai đó
 * nhớ mở màn hình ra xem.
 *
 * Ba luật, chọn theo đúng thứ dữ liệu này ĐO ĐƯỢC:
 *
 *   1. Kênh im lặng   — lâu rồi không đăng bài nào.
 *   2. Kênh tụt       — lượt xem tuần này thấp hẳn so với tuần trước.
 *   3. Đồng bộ hỏng   — lượt chạy gần nhất lỗi, hoặc một nền tảng ngừng về số.
 *
 * LUẬT "KÊNH TỤT" KHÔNG ÁP CHO TIKTOK, và đây là chỗ dễ làm sai nhất. TikTok
 * Display API không trả số theo ngày, nên app ghi trọn lượt xem đời của mỗi video
 * vào NGÀY ĐĂNG. Hệ quả: tuần nào không đăng thì lượt xem tuần đó bằng 0 — không
 * phải vì không ai xem, mà vì không có gì để ghi. Đo trên dữ liệu thật ngày
 * 15/09: bốn kênh TikTok cùng hiện "-100%" trong khi kênh vẫn chạy bình thường.
 * Bật luật tụt cho TikTok là mỗi tuần nhóm nhận mấy tin báo động giả, và sau
 * đúng hai tuần thì không ai đọc cảnh báo nữa — hỏng luôn cả những cảnh báo
 * thật. Với TikTok chỉ dùng luật im lặng, vốn đo bằng ngày đăng nên đúng.
 *
 * CHỐNG LẶP: mỗi cảnh báo ghi một dòng vào bảng Cảnh báo với một khoá. Trước khi
 * gửi thì tra xem khoá đó đã gửi trong `NGAY_NHAC_LAI` ngày gần đây chưa. Không
 * có bước này thì một kênh im ba tuần sẽ sinh hai mươi mốt cái tin giống hệt.
 */
const cfg = require('./config');
const store = require('./store');
const lark = require('./lark');
const { tao } = require('../lark-chung/tin-lark');

/** Im bao lâu thì nhắc lại cùng một cảnh báo. */
const NGAY_NHAC_LAI = 7;

const MAC_DINH = {
  bat: false,
  chatId: '',
  ngayImLang: 5,        // không đăng bài quá bấy nhiêu ngày thì báo
  tutPhanTram: 35,      // tụt từ bấy nhiêu % trở lên thì báo
  tutToiThieu: 5000,    // kỳ trước phải đạt bấy nhiêu lượt xem mới xét, tránh nhiễu kênh nhỏ
};

/* Nền tảng có số liệu theo NGÀY thật — chỉ những nền tảng này mới xét luật tụt. */
const CO_SO_THEO_NGAY = new Set(['Facebook', 'Instagram']);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ngayCua = (s) => String(s || '').slice(0, 10);

function cachNgay(a, b) {
  const t = Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z');
  return Number.isFinite(t) ? Math.round(t / 86400000) : 0;
}

/* ---------------- phát hiện ---------------- */

/**
 * @returns [{ khoa, loai, muc, platform, kenh, noiDung }]
 */
function doTim(d, luat, homNay) {
  const c = { ...MAC_DINH, ...(luat || {}) };
  const ra = [];
  const den = homNay || store.homNay();

  /* --- luật 1: kênh im lặng --- */
  const baiCuoi = new Map();
  (d.posts || []).forEach((p) => {
    const k = p.channelExtId || p.channel;
    if (!k) return;
    const ng = ngayCua(p.date);
    if (!ng) return;
    const cu = baiCuoi.get(k);
    if (!cu || ng > cu.ngay) baiCuoi.set(k, { ngay: ng, platform: p.platform, ten: p.channel || k });
  });
  const im = [];
  baiCuoi.forEach((v, k) => {
    const soNgay = cachNgay(den, v.ngay);
    if (soNgay < num(c.ngayImLang)) return;
    im.push({ k, ...v, soNgay });
  });

  /* GỘP KHI GẦN NHƯ MỌI KÊNH CÙNG IM.
   *
   * Mười kênh cùng "không đăng bài 6 ngày" thì lời giải thích gần như chắc chắn
   * không phải mười đội cùng nghỉ, mà là app không lấy được bài mới. Kiểm chứng
   * ngày 15/09: Base dừng ở bài ngày 08/09, hỏi thẳng Graph API thì Facebook trả
   * 39 bài từ 08 đến 14/09 — bài có thật, chỉ là không vào được Base.
   *
   * Gửi mười tin "kênh X im lặng" trong tình huống đó là đổ lỗi cho mười người
   * về một cái lỗi của máy. Nên gộp thành MỘT tin nói đúng nghi vấn. */
  const tongKenh = baiCuoi.size;
  const gopLai = tongKenh >= 4 && im.length >= Math.ceil(tongKenh * 0.7);
  if (gopLai) {
    const moiNhatBai = im.map((x) => x.ngay).sort().pop();
    ra.push({
      khoa: 'im-tat-ca|' + moiNhatBai,
      loai: 'Đồng bộ hỏng',
      muc: 'Nặng',
      platform: '',
      kenh: '',
      noiDung: 'Cả ' + im.length + '/' + tongKenh + ' kênh đều không có bài mới từ '
        + moiNhatBai + '. Mười kênh cùng ngừng đăng là chuyện hiếm — nhiều khả năng '
        + 'app không lấy được bài mới chứ không phải không ai đăng. Kiểm tra Nhật ký '
        + 'đồng bộ và kết nối trước khi hỏi các bạn nội dung.',
    });
  } else {
    im.forEach((v) => ra.push({
      khoa: 'im|' + v.k,
      loai: 'Kênh im lặng',
      muc: v.soNgay >= num(c.ngayImLang) * 2 ? 'Nặng' : 'Vừa',
      platform: v.platform || '',
      kenh: v.ten,
      noiDung: v.ten + ' (' + (v.platform || '?') + ') đã ' + v.soNgay
        + ' ngày không đăng bài. Bài gần nhất: ' + v.ngay + '.',
    }));
  }

  /* --- luật 2: kênh tụt --- */
  const tu = store.themNgay(den, -6);
  const truocDen = store.themNgay(tu, -1);
  const truocTu = store.themNgay(truocDen, -6);
  const xem = new Map();
  (d.daily || []).forEach((r) => {
    if (!CO_SO_THEO_NGAY.has(r.platform)) return;   // xem chú thích đầu file
    const k = r.channelExtId || r.channel;
    if (!k) return;
    if (!xem.has(k)) xem.set(k, { nay: 0, truoc: 0, platform: r.platform, ten: r.channel || k });
    const o = xem.get(k);
    if (r.date >= tu && r.date <= den) o.nay += num(r.views);
    else if (r.date >= truocTu && r.date <= truocDen) o.truoc += num(r.views);
  });
  xem.forEach((o, k) => {
    if (o.truoc < num(c.tutToiThieu)) return;
    const giam = (o.truoc - o.nay) / o.truoc * 100;
    if (giam < num(c.tutPhanTram)) return;
    ra.push({
      khoa: 'tut|' + k + '|' + tu,
      loai: 'Kênh tụt',
      muc: giam >= 60 ? 'Nặng' : 'Vừa',
      platform: o.platform,
      kenh: o.ten,
      noiDung: o.ten + ' (' + o.platform + ') tụt ' + Math.round(giam) + '% lượt xem: '
        + Math.round(o.nay).toLocaleString('vi-VN') + ' tuần này so với '
        + Math.round(o.truoc).toLocaleString('vi-VN') + ' tuần trước.',
    });
  });

  /* --- luật 3: một nền tảng ngừng về số --- */
  const moiNhat = new Map();
  (d.daily || []).forEach((r) => {
    const p = r.platform;
    if (!p || !r.date) return;
    if (!moiNhat.get(p) || r.date > moiNhat.get(p)) moiNhat.set(p, r.date);
  });
  moiNhat.forEach((ng, p) => {
    const im = cachNgay(den, ng);
    if (im < 3) return;
    ra.push({
      khoa: 'dung|' + p + '|' + ng,
      loai: 'Đồng bộ hỏng',
      muc: im >= 7 ? 'Nặng' : 'Vừa',
      platform: p,
      kenh: '',
      noiDung: p + ' đã ' + im + ' ngày không có số mới (dòng cuối ' + ng
        + '). Kiểm tra kết nối — token có thể đã hết hạn.',
    });
  });

  const uuTien = { Nặng: 0, Vừa: 1, Nhẹ: 2 };
  return ra.sort((a, b) => (uuTien[a.muc] - uuTien[b.muc]) || a.loai.localeCompare(b.loai));
}

/* ---------------- kho cảnh báo trên Base ---------------- */

async function daGui(homNay) {
  const T = cfg.tables.alert;
  const f = T.f;
  try {
    const rows = await lark.listAll(T.id);
    const moc = store.themNgay(homNay, -NGAY_NHAC_LAI);
    const ra = new Set();
    rows.forEach((r) => {
      const ng = ngayCua(r.c[f.at] && (r.c[f.at].text || r.c[f.at]));
      const khoa = String(r.c[f.key] || '').trim();
      if (!khoa) return;
      /* Không đọc được ngày thì coi như vừa gửi — thà bỏ sót một tin còn hơn
       * nhắn lại cùng một chuyện cho cả nhóm. */
      if (!ng || ng >= moc) ra.add(khoa);
    });
    return ra;
  } catch (e) {
    console.warn('[canh-bao] không đọc được bảng Cảnh báo: ' + e.message);
    return null;   // null = không biết, và không biết thì KHÔNG gửi
  }
}

async function ghiLai(ds, daGuiXong) {
  const T = cfg.tables.alert;
  const f = T.f;
  const luc = store.gioVeBase(new Date().toISOString());
  for (const x of ds) {
    try {
      await lark.createRecord(T.id, {
        [f.key]: x.khoa,
        [f.type]: x.loai,
        [f.level]: x.muc,
        [f.platform]: x.platform || '',
        [f.channel]: x.kenh || '',
        [f.content]: String(x.noiDung).slice(0, 1000),
        [f.at]: luc,
        [f.sent]: Boolean(daGuiXong),
        [f.sentAt]: daGuiXong ? luc : null,
      });
    } catch (e) {
      console.warn('[canh-bao] không ghi được cảnh báo: ' + e.message);
    }
  }
}

/* ---------------- soạn tin ---------------- */

const ICON = { Nặng: '🔴', Vừa: '🟡', Nhẹ: '⚪' };

function soanTin(ds, den) {
  const dong = ds.map((x) => (ICON[x.muc] || '•') + ' ' + x.noiDung);
  return 'Social · cảnh báo ' + den + '\n\n' + dong.join('\n')
    + '\n\nMở Social để xem chi tiết.';
}

/* ---------------- chạy ---------------- */

/**
 * Tìm, lọc trùng, gửi, ghi lại. Không ném — cảnh báo hỏng không được làm hỏng
 * lượt đồng bộ vừa chạy xong.
 *
 * @param {object} luat  khối cấu hình canhBao
 * @param {object} guiCfg { appId, appSecret, apiHost, tenApp }
 * @param {object} opts  { batBuoc: bỏ qua lọc trùng và cờ bật — dùng cho nút Thử }
 */
async function chay(luat, guiCfg, opts = {}) {
  const c = { ...MAC_DINH, ...(luat || {}) };
  if (!c.bat && !opts.batBuoc) return { bo: 'chưa bật' };
  if (!c.chatId) return { bo: 'chưa khai nhóm nhận' };

  const den = store.homNay();
  const d = await store.tai();
  const tim = doTim(d, c, den);
  if (!tim.length) return { tim: 0, gui: 0 };

  let moi = tim;
  if (!opts.batBuoc) {
    const da = await daGui(den);
    if (da === null) return { tim: tim.length, gui: 0, loi: 'không đọc được bảng Cảnh báo' };
    moi = tim.filter((x) => !da.has(x.khoa));
  }
  if (!moi.length) return { tim: tim.length, gui: 0, trung: tim.length };

  const tin = tao(guiCfg);
  const r = await tin.gui({
    chatId: c.chatId,
    text: soanTin(moi, den),
    khoa: 'social-canh-bao-' + den + '-' + moi.length,
  });
  await ghiLai(moi, r.ok);
  return { tim: tim.length, gui: r.ok ? moi.length : 0, loi: r.ok ? '' : r.loi };
}

module.exports = { MAC_DINH, NGAY_NHAC_LAI, CO_SO_THEO_NGAY, doTim, soanTin, chay };
