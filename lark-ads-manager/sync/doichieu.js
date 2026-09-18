'use strict';
/**
 * Đối chiếu Base với TÌNH TRẠNG THẬT trên nền tảng.
 *
 * Anh Hùng, 18/09/2026: "Ngày kết thúc anh nghĩ dựa vào tình trạng thực tế quảng
 * cáo của anh chứ không phải dựa vào cái anh ghi, vì nó không thực tế, không cập
 * nhật theo thời gian thực."
 *
 * Đúng. Đo được: cả hai chiến dịch Facebook đều KHÔNG đặt ngày kết thúc, trong
 * khi Base khai 31/08 — nên 6 cảnh báo "quá ngày kết thúc" là bịa từ một ô điền
 * tượng trưng. Ô đó là KẾ HOẠCH; muốn biết chiến dịch còn chạy hay đã dừng thì
 * phải hỏi nơi nó đang chạy.
 *
 * MỖI NỀN TẢNG MỘT MỨC ĐỘ, và module này nói thẳng mức nào:
 *
 *   Facebook    đủ — status, effective_status, start_time, stop_time
 *   Google Ads  đủ — campaign.status, start_date, end_date
 *   TikTok      KHÔNG đọc được cấp chiến dịch: /campaign/get/ nằm trong nhóm
 *               quyền "Campaign" mà mình cố ý không xin (nhóm đó kèm cả tạo và
 *               XOÁ chiến dịch). Đọc được cấp NHÓM, và nhóm cũng có trạng thái
 *               thật — đủ để biết đã hết lịch hay chưa.
 *
 * Chỗ không biết thì nói "chưa đối chiếu được", không đoán. Đoán ở đây là quay
 * lại đúng cái sai vừa bỏ đi.
 */
const { getJson, scrub, hideSecret } = require('./http');

const TT_BASE = 'https://business-api.tiktok.com/open_api/v1.3';
const metaVer = (c) => (c && c.apiVersion) || 'v21.0';

/** Mã trạng thái nào nghĩa là ĐÃ HẾT LỊCH CHẠY, theo từng nền tảng. */
const HET_LICH = /TIME_DONE|CAMPAIGN_STATUS_TIME_DONE|ADGROUP_STATUS_TIME_DONE/i;

const ngay = (s) => (s ? String(s).slice(0, 10) : '');

/* ================================================================ Facebook */

async function metaChienDich(c, extId, deps = {}) {
  const gj = deps.getJson || getJson;
  hideSecret(c.accessToken);
  const f = 'name,status,effective_status,start_time,stop_time,daily_budget,lifetime_budget';
  const r = await gj(`https://graph.facebook.com/${metaVer(c)}/${encodeURIComponent(extId)}`
    + `?fields=${f}&access_token=${encodeURIComponent(c.accessToken)}`,
    { label: 'Meta đọc chiến dịch', retries: 1 });
  if (r && r.error) throw new Error(scrub('Meta báo lỗi: ' + (r.error.message || 'không rõ')));
  return {
    doc: true,
    ten: r.name || '',
    trangThai: r.status || '',
    trangThaiThat: r.effective_status || '',
    batDau: ngay(r.start_time),
    /* Không đặt ngày kết thúc thì Meta KHÔNG trả stop_time. Đây chính là sự thật
     * mà ô trong Base đang nói ngược. */
    ketThuc: ngay(r.stop_time),
    nganSachNgay: r.daily_budget == null ? null : Number(r.daily_budget) || 0,
  };
}

/* ================================================================== TikTok */

/**
 * TikTok: đọc ở cấp NHÓM, vì cấp chiến dịch nằm sau nhóm quyền không xin.
 *
 * Trả về trạng thái tổng của các nhóm thuộc chiến dịch: còn nhóm nào đang chạy
 * thì chiến dịch còn chạy. Nói rõ `capDo: 'nhóm'` để giao diện không trình bày
 * nó như thể đã hỏi cấp chiến dịch.
 */
async function ttChienDich(c, extId, deps = {}) {
  const gj = deps.getJson || getJson;
  hideSecret(c.accessToken);
  for (const adv of (c.advertiserIds || [])) {
    const q = encodeURIComponent(JSON.stringify({ campaign_ids: [String(extId)] }));
    const r = await gj(`${TT_BASE}/adgroup/get/?advertiser_id=${encodeURIComponent(adv)}`
      + `&filtering=${q}&page_size=100`,
      { headers: { 'Access-Token': c.accessToken, 'Content-Type': 'application/json' },
        label: 'TikTok đọc nhóm theo chiến dịch', retries: 1 });
    const ma = Number((r && r.code) || 0);
    if (ma !== 0) {
      const loi = String((r && r.message) || '');
      if (/lacks the required scope|Permission error/i.test(loi)) {
        throw new Error('TikTok: token thiếu nhóm quyền quản lý quảng cáo');
      }
      continue;
    }
    const ds = (r.data && r.data.list) || [];
    if (!ds.length) continue;
    const dangChay = ds.filter((g) => /ENABLE/i.test(g.operation_status || '')
      && !HET_LICH.test(g.secondary_status || ''));
    const hetLich = ds.filter((g) => HET_LICH.test(g.secondary_status || ''));
    return {
      doc: true, capDo: 'nhóm',
      soNhom: ds.length, soNhomDangChay: dangChay.length, soNhomHetLich: hetLich.length,
      trangThaiThat: dangChay.length ? 'đang chạy' : (hetLich.length ? 'đã hết lịch' : 'đang tắt'),
      /* Không có ngày kết thúc ở mức này — nói rõ là KHÔNG BIẾT, chứ không để
       * chuỗi rỗng rồi bên gọi hiểu thành "không đặt ngày kết thúc". */
      ketThuc: null,
    };
  }
  return { doc: false, vi: 'Không tìm thấy nhóm nào của chiến dịch này trong các tài khoản đã khai' };
}

/* ============================================================== Google Ads */

function gaChienDich(gads, conf, extId) {
  return gads.trangThaiChienDich(conf, extId);
}

/* ================================================================== chung */

/**
 * Đối chiếu từng chiến dịch trong Base với nền tảng.
 *
 * @returns {Promise<Array>} mỗi dòng: { id, ten, nenTang, base:{...}, that:{...}, lech:[...] }
 */
async function doiChieu({ campaigns = [], conf = {}, gads, homNay, log = () => {} }) {
  const ra = [];
  for (const c of campaigns) {
    const dong = { id: c.id, ten: c.name, nenTang: c.platform, extId: c.extId || '',
      base: { trangThai: c.status || '', ketThuc: c.end || '', batDau: c.start || '' },
      that: null, lech: [], loi: '' };

    if (!c.extId) {
      dong.loi = 'Chưa ghép ID nền tảng trong Base — không đối chiếu được';
      ra.push(dong); continue;
    }
    try {
      if (c.platform === 'Facebook') dong.that = await metaChienDich(conf.meta || {}, c.extId);
      else if (c.platform === 'TikTok') dong.that = await ttChienDich(conf.tiktok || {}, c.extId);
      else if (c.platform === 'Google Ads') dong.that = await gaChienDich(gads, conf.googleAds || {}, c.extId);
      else dong.loi = `Chưa biết cách hỏi nền tảng ${c.platform}`;
    } catch (e) { dong.loi = e.message; }

    if (dong.that && dong.that.doc) dong.lech = soLech(dong.base, dong.that, homNay);
    ra.push(dong);
  }
  log(`  đối chiếu ${ra.length} chiến dịch`);
  return ra;
}

/**
 * So ô trong Base với tình trạng thật, trả về danh sách chỗ lệch.
 *
 * Hàm THUẦN để kiểm được: đây là chỗ quyết định app nói gì, và nói sai ở đây là
 * lại sinh ra một loạt cảnh báo bịa như sáu dòng "quá ngày kết thúc" cũ.
 */
function soLech(base, that, homNay) {
  const ds = [];
  const dangChayThat = /ACTIVE|ENABLED|đang chạy/i.test(that.trangThaiThat || that.trangThai || '');

  /* NGÀY KẾT THÚC — cái anh Hùng nói thẳng là không đáng tin trong Base.
   * `ketThuc === ''` nghĩa là nền tảng KHÔNG đặt ngày kết thúc (đã hỏi và biết).
   * `ketThuc === null` nghĩa là CHƯA HỎI ĐƯỢC ở mức này — hai chuyện khác nhau. */
  if (that.ketThuc === '' && base.ketThuc) {
    ds.push({ o: 'Ngày kết thúc', base: base.ketThuc, that: 'không đặt',
      y: 'Trên nền tảng chiến dịch chạy vô thời hạn. Ô trong Base là kế hoạch, không phải thực tế.' });
  } else if (that.ketThuc && base.ketThuc && that.ketThuc !== base.ketThuc) {
    ds.push({ o: 'Ngày kết thúc', base: base.ketThuc, that: that.ketThuc,
      y: 'Hai bên khai hai ngày khác nhau.' });
  }

  /* ĐÃ HẾT LỊCH THẬT mà Base vẫn ghi đang chạy — đây mới là cảnh báo đáng có,
   * vì nó dựa trên nền tảng chứ không dựa trên ô gõ tay. */
  if (that.ketThuc && homNay && that.ketThuc < homNay && dangChayThat) {
    ds.push({ o: 'Lịch chạy', base: base.ketThuc || '—', that: that.ketThuc,
      y: 'Nền tảng khai kết thúc từ ngày này mà chiến dịch vẫn đang chạy.' });
  }

  /* TRẠNG THÁI: Base ghi một đằng, nền tảng chạy một nẻo. */
  const baseDangChay = /Đang chạy/i.test(base.trangThai || '');
  if (baseDangChay !== dangChayThat) {
    ds.push({ o: 'Trạng thái', base: base.trangThai || '—',
      that: dangChayThat ? 'đang chạy' : (that.trangThaiThat || that.trangThai || 'không chạy'),
      y: 'Ô trạng thái trong Base không khớp nền tảng.' });
  }
  return ds;
}

module.exports = { doiChieu, soLech, metaChienDich, ttChienDich, HET_LICH };
