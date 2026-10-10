'use strict';
/**
 * TIN NHẮN KHÁCH TỪ PANCAKE, gom theo kênh — cho khối Social của Báo cáo & KPI.
 *
 * Anh Hùng 10/10/2026: "còn thiếu một chỉ số từ kênh Social là lượt tin nhắn.
 * Một là tin nhắn từ các kênh tự nhiên (chỉ anh xem); hai là tin nhắn được
 * nhân viên Sale gắn thẻ (coi là lead, cho cả nhân sự xem)."
 *
 * ========================= MẤY CHỖ ĐÃ DÒ RA =========================
 *
 * 1. PHẢI ĐI CỔNG v2, KHÔNG ĐI v1. Cổng v1 (token tài khoản) chỉ phục vụ page
 *    Facebook, mà còn đếm hụt nặng: kênh Rooty Trip Phú Quốc tháng 10 v1 trả
 *    48 hội thoại, v2 trả 553. TikTok, Instagram, Zalo thì v1 trả 0 trong khi
 *    v2 trả 871 cho riêng một kênh TikTok. Đo ngày 10/10/2026.
 *
 * 2. TOKEN TỪNG PAGE: page Facebook thì XIN ĐƯỢC bằng token tài khoản
 *    (POST /api/v1/pages/{id}/generate_page_access_token). Page có tiền tố
 *    (ttm_ TikTok, igo_ Instagram, zl_ Zalo) thì Pancake trả "page_id không
 *    hợp lệ" — mấy kênh đó phải dán token tay trong Cài đặt của app Quảng cáo.
 *    Kênh chưa có token KHÔNG trả 0, mà trả `chuaNoi: true` — số 0 đọc như
 *    "không ai nhắn", còn sự thật là "chưa nối được".
 *
 * 3. LEAD = HỘI THOẠI CÓ THẺ. Thẻ của Pancake gần như toàn tên viết tắt của
 *    Sale (THUTA, TRIEL, MYPTD…), kèm vài thẻ trạng thái (Chốt, SPAM, CANCEL,
 *    FOLLOW, CSKH, ĐỐI TÁC). Đo trên 871 hội thoại TikTok tháng 10: có thẻ bất
 *    kỳ 611, có thẻ tên Sale 610 — lệch đúng 1. Nên không bày đặt luật phức
 *    tạp: CÓ THẺ là tính, trừ hội thoại chỉ mang mỗi thẻ SPAM hoặc CANCEL.
 *
 * 4. TỰ NHIÊN = KHÔNG GẮN QUẢNG CÁO. v2 trả `ad_ids`; rỗng nghĩa là khách tự
 *    tìm tới chứ không qua quảng cáo. TikTok tháng 10: 481 từ quảng cáo, 390
 *    tự nhiên.
 *
 * 5. TOKEN TÀI KHOẢN HẾT HẠN 01/11/2026 (đọc claim `exp` trong JWT). Hết hạn
 *    thì không xin được token page Facebook nữa. Trả `hanToken` ra ngoài để
 *    màn hình nhắc trước, đừng đợi tới lúc bảng trống mới đi tìm nguyên nhân.
 */
const pancake = require('./pancake');
const { getJson, hideSecret } = require('./http');

const BASE_USER = 'https://pages.fm/api/v1';

/* Thẻ chỉ nói "bỏ qua", không phải dấu hiệu Sale đang theo khách. */
const THE_BO = new Set(['spam', 'cancel']);

/* Một lượt gom mất hàng chục giây (mỗi kênh vài chục lượt phân trang, 5 lượt
 * mỗi giây). Báo cáo mở đi mở lại nên phải nhớ, nếu không mỗi lần Làm mới là
 * ngồi chờ cả phút. */
const DEM = new Map();
const HAN_DEM = 10 * 60 * 1000;

/** Hạn của token tài khoản, đọc từ claim `exp`. Không phải JWT thì trả rỗng. */
function hanToken(userToken) {
  try {
    const p = JSON.parse(Buffer.from(String(userToken).split('.')[1], 'base64').toString());
    return p.exp ? new Date(p.exp * 1000).toISOString().slice(0, 10) : '';
  } catch (_) { return ''; }
}

/**
 * Token của một page. Ưu tiên token đã khai trong Cài đặt; page Facebook thì
 * xin mới được. Trả rỗng khi chịu — nơi gọi phải đánh dấu "chưa nối".
 */
async function tokenCuaPage(conf, page, daKhai) {
  if (daKhai && daKhai.token) return daKhai.token;
  /* Chỉ page Facebook mới xin được: id có tiền tố là Pancake từ chối. */
  if (/^[a-z]+_/i.test(String(page.pageId))) return '';
  try {
    hideSecret(conf.userToken);
    const r = await getJson(
      `${BASE_USER}/pages/${encodeURIComponent(page.pageId)}/generate_page_access_token`
      + `?access_token=${encodeURIComponent(conf.userToken)}`,
      { label: `Pancake xin token ${page.pageId}`, method: 'POST', retries: 1 });
    return (r && r.page_access_token) || '';
  } catch (_) { return ''; }
}

/* Gọi tên nền tảng y như bảng Kênh của app Social, vì báo cáo ghép hai bên
 * bằng khoá "Nền tảng|Tên kênh". Pancake ghi "Zalo", Social ghi "Zalo OA" —
 * lệch một chữ là kênh đó rơi ra ngoài phạm vi của mọi nhân sự. */
const TEN_NEN = { Zalo: 'Zalo OA' };
const chuanNen = (v) => TEN_NEN[v] || v || '';

function gomMot(ds) {
  const coThe = (c) => (c.tags || []).some((t) => !THE_BO.has(String(t).trim().toLowerCase()));
  return {
    soHoiThoai: ds.length,
    soTinNhan: ds.reduce((a, c) => a + (Number(c.soTinNhan) || 0), 0),
    lead: ds.filter(coThe).length,
    tuQuangCao: ds.filter((c) => (c.adIds || []).length).length,
    tuNhien: ds.filter((c) => !(c.adIds || []).length).length,
    coSdt: ds.filter((c) => c.coSdt).length,
  };
}

/**
 * Gom tin nhắn theo kênh trong khoảng ngày.
 * @returns { rows, chuaNoi, hanToken, luc }
 *   rows: [{ platform, channel, soHoiThoai, soTinNhan, lead, tuQuangCao, tuNhien, coSdt }]
 */
async function gomTinNhan(conf, tu, den, log = () => {}) {
  if (!conf || !conf.userToken) throw new Error('Chưa khai Pancake trong Cài đặt app Quảng cáo');
  const khoa = tu + '|' + den;
  const cu = DEM.get(khoa);
  if (cu && Date.now() - cu.luc < HAN_DEM) return cu;

  const dsPage = await pancake.danhSachPage(conf);
  const daKhai = new Map((conf.pages || []).map((p) => [String(p.pageId), p]));

  const rows = [];
  const chuaNoi = [];
  for (const page of dsPage) {
    // eslint-disable-next-line no-await-in-loop
    const token = await tokenCuaPage(conf, page, daKhai.get(String(page.pageId)));
    if (!token) {
      chuaNoi.push({ platform: chuanNen(page.platform), channel: page.label });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await pancake.fetchConversations(
        { ...page, token }, tu, den, (m) => log('  ' + m));
      rows.push({ platform: chuanNen(page.platform), channel: page.label, ...gomMot(r.rows || []) });
    } catch (e) {
      chuaNoi.push({ platform: chuanNen(page.platform), channel: page.label,
        loi: String(e.message).slice(0, 120) });
    }
  }
  const ra = { rows, chuaNoi, hanToken: hanToken(conf.userToken), luc: Date.now(), tu, den };
  DEM.set(khoa, ra);
  return ra;
}

module.exports = { gomTinNhan, hanToken, THE_BO };
