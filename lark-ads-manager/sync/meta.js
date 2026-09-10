'use strict';
/**
 * Adapter Facebook / Meta — Marketing API, endpoint Insights ở level=ad.
 *
 * Trả về mảng dòng đã chuẩn hoá:
 * { platform, date, campaignExtId, campaignName, groupExtId, groupName,
 *   adExtId, adName, spend, impressions, clicks, conversions }
 */
const { getJson, scrub, hideSecret } = require('./http');
/* Chỉ lấy tenGoc: bảng dịch dưới đây khoá theo tên gốc, nên phải tra
 * cùng một cách với chỗ gom trùng lặp. Hai đường tra là hai chỗ để lỗi trốn. */
const { tenGoc } = require('./metrics-hanhdong');

const PLATFORM = 'Facebook';

/** Chuẩn hoá ID tài khoản: 123456 hoặc act_123456 → act_123456 */
const actId = (id) => {
  const s = String(id).trim();
  return s.startsWith('act_') ? s : 'act_' + s.replace(/^act_/, '');
};

const num = (v) => {
  const n = Number(String(v == null ? 0 : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Meta trả conversions trong mảng `actions`: [{action_type, value}].
 * Lấy đúng loại action mà chiến dịch tối ưu cho — nếu lấy `conversions` chung
 * thì số sẽ lệch nhiều lần với chiến dịch Tin nhắn/Lead.
 */
function conversionsOf(row, metric) {
  const list = row.actions || [];
  const want = String(metric || '').trim();
  if (!want) return 0;
  // cho phép khai nhiều loại cách nhau bằng dấu phẩy (vd purchase,lead)
  const wants = want.split(',').map((s) => s.trim()).filter(Boolean);
  return list.reduce((s, a) => (wants.includes(a.action_type) ? s + num(a.value) : s), 0);
}

/**
 * Mã hành động của Meta -> tiếng người.
 *
 * Mã gốc như `onsite_conversion.messaging_first_reply` đọc không ra nghĩa với
 * người không làm quảng cáo. Mã nào chưa có trong bảng thì VẪN hiện mã gốc —
 * bỏ đi là mất số, mà mất số thì tổng không khớp và không ai biết vì sao.
 */
/* Bảng dịch khoá theo TÊN GỐC — tên đã bỏ tiền tố bề mặt của Meta
 * (`onsite_conversion.`, `omni_`, `onsite_web_`…), do tenGoc() rút ra.
 *
 * Vì sao không khoá theo mã đầy đủ: cùng một sự kiện được Meta báo lại dưới
 * nhiều bề mặt, nên khoá theo mã đầy đủ là phải khai đủ mọi biến thể — và thiếu
 * một biến thể thì dòng đó hiện nguyên mã máy. Đo thật: messaging_block trượt
 * đúng vì lý do này.
 */
const TEN_HANH_DONG = {
  messaging_conversation_started_7d: 'Bắt đầu nhắn tin',
  messaging_first_reply: 'Khách trả lời lần đầu',
  messaging_conversation_replied_7d: 'Hội thoại có trả lời',
  total_messaging_connection: 'Kết nối nhắn tin',
  messaging_welcome_message_view: 'Xem tin chào',
  /* Meta đánh dấu độ sâu hội thoại: khách đã gửi tới tin thứ N. Càng sâu càng gần
   * chốt, nên đáng đọc chứ không phải mã rác. */
  messaging_user_depth_2_message_send: 'Khách nhắn tới tin thứ 2',
  messaging_user_depth_3_message_send: 'Khách nhắn tới tin thứ 3',
  messaging_user_depth_5_message_send: 'Khách nhắn tới tin thứ 5',
  messaging_block: 'Khách chặn tin',
  messaging_user_call_placed: 'Khách bấm gọi trong hội thoại',
  messaging_20s_call_connect: 'Gọi nối được trên 20 giây',
  messaging_60s_call_connect: 'Gọi nối được trên 60 giây',
  messaging_order_created_v2: 'Tạo đơn trong hội thoại',
  lead: 'Khách tiềm năng',
  purchase: 'Mua hàng',
  link_click: 'Bấm vào link',
  landing_page_view: 'Xem trang đích',
  post_engagement: 'Tương tác bài viết',
  page_engagement: 'Tương tác trang',
  video_view: 'Xem video',
  post_reaction: 'Cảm xúc bài viết',
  comment: 'Bình luận',
  post: 'Chia sẻ bài',
  post_save: 'Lưu bài',
  post_unsave: 'Bỏ lưu bài',
  post_net_save: 'Lưu bài (đã trừ lượt bỏ)',
  /* Hai cặp này KHÔNG được trùng tên nhau. `like` là thích TRANG, còn
   * `post_net_like` là thích BÀI đã trừ lượt bỏ — đo thật ra 136 và 797, cùng
   * tên thì người đọc không biết dòng nào là gì. */
  post_net_comment: 'Bình luận bài (đã trừ lượt xoá)',
  post_net_like: 'Thích bài (đã trừ lượt bỏ)',
  post_unlike: 'Bỏ thích bài',
  like: 'Thích trang',
  /* Meta trả cả gross (mọi lượt) và net (đã trừ lượt bỏ) — giữ riêng hai dòng,
   * gộp lại là mất nghĩa. */
  post_interaction_gross: 'Tương tác bài (gồm lượt đã bỏ)',
  post_interaction_net: 'Tương tác bài (đã trừ lượt bỏ)',
  add_to_cart: 'Thêm vào giỏ',
  initiate_checkout: 'Bắt đầu thanh toán',
  complete_registration: 'Hoàn tất đăng ký',
  contact: 'Liên hệ',
  find_location: 'Tìm địa điểm',
};


/** Nhóm để xếp cùng loại với nhau, giống cột nhóm của Google Ads. */
function nhomHanhDong(ma) {
  const s = String(ma || '');
  if (/messaging|connection|welcome_message/.test(s)) return 'NHẮN TIN';
  if (/lead|complete_registration|contact|find_location/.test(s)) return 'LIÊN HỆ';
  if (/purchase|add_to_cart|checkout/.test(s)) return 'MUA HÀNG';
  if (/link_click|landing_page/.test(s)) return 'TRUY CẬP';
  if (/video/.test(s)) return 'XEM VIDEO';
  return 'TƯƠNG TÁC';
}

/**
 * Chi tiết hành động chuyển đổi trong khoảng ngày, hỏi ở cấp TÀI KHOẢN.
 *
 * Một lời gọi mỗi tài khoản, thay vì đi qua cả lượt đồng bộ per-ad-per-day chỉ để
 * cộng lại một bảng tổng.
 */
async function hanhDongChuyenDoi(conf, from, to, log = () => {}) {
  if (!conf || !conf.accessToken) return { rows: [], tong: 0, loi: 'Meta chưa nối' };
  hideSecret(conf.accessToken);
  const accs = (conf.accountIds || []).map(actId).filter(Boolean);
  if (!accs.length) return { rows: [], tong: 0, loi: 'Chưa khai accountIds' };

  /* Cùng cách lấy phiên bản như bốn hàm khác trong file này: `conf.apiVersion`
   * rồi lùi về v21.0. Bản đầu tôi gõ một hằng API_VER không tồn tại. */
  const ver = conf.apiVersion || 'v21.0';
  const gom = new Map();
  for (const acc of accs) {
    const u = `https://graph.facebook.com/${ver}/${acc}/insights`
      + `?level=account&fields=actions`
      + `&time_range=${encodeURIComponent(JSON.stringify({ since: from, until: to }))}`
      + `&access_token=${encodeURIComponent(conf.accessToken)}`;
    const res = await getJson(u, { label: `Meta hành động ${acc}`, retries: 2 });
    ((res && res.data) || []).forEach((r) => {
      (r.actions || []).forEach((a) => {
        const ma = String(a.action_type || '');
        if (!ma) return;
        gom.set(ma, (gom.get(ma) || 0) + num(a.value));
      });
    });
  }
  const rows = [...gom.entries()]
    .filter(([, v]) => v > 0)
    .map(([ma, so]) => ({ ma, ten: TEN_HANH_DONG[tenGoc(ma)] || ma, nhom: nhomHanhDong(ma), so }))
    .sort((a, b) => b.so - a.so);
  log(`  Meta: ${rows.length} hành động có dữ liệu`);
  return { rows, tong: rows.reduce((a, x) => a + x.so, 0) };
}

/** Các action_type thực có trong dữ liệu — dùng để anh chọn đúng chỉ số. */
function actionTypesSeen(rows) {
  const m = new Map();
  rows.forEach((r) => (r.actions || []).forEach((a) => {
    m.set(a.action_type, (m.get(a.action_type) || 0) + num(a.value));
  }));
  return [...m].sort((a, b) => b[1] - a[1]).map(([action_type, total]) => ({ action_type, total }));
}

async function fetchRange(conf, from, to, log = () => {}) {
  if (!conf.accessToken) throw new Error('Chưa có Meta accessToken trong ket-noi.json');
  hideSecret(conf.accessToken);
  const accounts = (conf.accountIds || []).map(actId);
  if (!accounts.length) throw new Error('Chưa khai accountIds cho Meta trong ket-noi.json');

  const ver = conf.apiVersion || 'v21.0';
  const clickField = conf.clickMetric === 'inline_link_clicks' ? 'inline_link_clicks' : 'clicks';
  const fields = [
    'date_start', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
    'ad_id', 'ad_name', 'spend', 'impressions', clickField, 'actions',
  ].join(',');

  const out = [];
  const raw = [];
  for (const acc of accounts) {
    let url = `https://graph.facebook.com/${ver}/${acc}/insights`
      + `?level=ad&time_increment=1&limit=300`
      + `&fields=${encodeURIComponent(fields)}`
      + `&time_range=${encodeURIComponent(JSON.stringify({ since: from, until: to }))}`
      + `&access_token=${encodeURIComponent(conf.accessToken)}`;
    let page = 0;
    while (url && page < 60) {
      const res = await getJson(url, { label: `Meta ${acc} trang ${page + 1}` });
      if (res.error) {
        const e = res.error;
        throw new Error(scrub(`Meta báo lỗi (${e.code}${e.error_subcode ? '/' + e.error_subcode : ''}): ${e.message}`));
      }
      const list = res.data || [];
      raw.push(...list);
      list.forEach((r) => out.push({
        platform: PLATFORM,
        date: String(r.date_start || '').slice(0, 10),
        campaignExtId: String(r.campaign_id || ''),
        campaignName: String(r.campaign_name || ''),
        groupExtId: String(r.adset_id || ''),
        groupName: String(r.adset_name || ''),
        adExtId: String(r.ad_id || ''),
        adName: String(r.ad_name || ''),
        spend: num(r.spend),
        impressions: num(r.impressions),
        clicks: num(r[clickField]),
        conversions: conversionsOf(r, conf.conversionMetric),
      }));
      url = (res.paging && res.paging.next) || null;
      page++;
      log(`Meta ${acc}: đã lấy ${out.length} dòng`);
    }
  }
  return { rows: out, actionTypes: actionTypesSeen(raw) };
}

/**
 * Soi chính token: còn sống không, hết hạn khi nào, có những quyền gì.
 *
 * Quan trọng với token cá nhân (loại ~60 ngày): không cảnh báo trước thì tới ngày
 * hết hạn đồng bộ sẽ chết âm thầm, Base cứ thế thiếu số mà không ai biết.
 * System User token thì trả về expires_at = 0 nghĩa là không hết hạn.
 */
async function tokenInfo(conf) {
  if (!conf.accessToken) return null;
  hideSecret(conf.accessToken);
  const ver = conf.apiVersion || 'v21.0';
  try {
    const r = await getJson(`https://graph.facebook.com/${ver}/debug_token`
      + `?input_token=${encodeURIComponent(conf.accessToken)}`
      + `&access_token=${encodeURIComponent(conf.accessToken)}`,
      { label: 'Meta debug_token', retries: 1 });
    const d = (r && r.data) || null;
    if (!d) return null;
    const exp = Number(d.expires_at || 0);
    const conHan = exp > 0 ? Math.floor((exp * 1000 - Date.now()) / 86400000) : null;
    return {
      hopLe: d.is_valid !== false,
      loai: d.type || '',
      vinhVien: exp === 0,
      hetHanLuc: exp > 0 ? new Date(exp * 1000).toISOString().slice(0, 10) : null,
      conLaiNgay: conHan,
      quyen: d.scopes || [],
      coAdsRead: (d.scopes || []).includes('ads_read') || (d.scopes || []).includes('ads_management'),
    };
  } catch (_) { return null; }
}

/** Kiểm tra token + quyền, không ghi gì. */
async function test(conf) {
  if (!conf.accessToken) return { ok: false, message: 'Chưa có accessToken' };
  hideSecret(conf.accessToken);
  const ver = conf.apiVersion || 'v21.0';
  const accounts = (conf.accountIds || []).map(actId);
  if (!accounts.length) return { ok: false, message: 'Chưa khai accountIds' };
  const results = [];
  for (const acc of accounts) {
    const url = `https://graph.facebook.com/${ver}/${acc}`
      + `?fields=name,account_status,currency,timezone_name`
      + `&access_token=${encodeURIComponent(conf.accessToken)}`;
    try {
      const res = await getJson(url, { label: `Meta test ${acc}`, retries: 1 });
      if (res.error) results.push({ account: acc, ok: false, message: scrub(res.error.message) });
      else results.push({
        account: acc, ok: true,
        name: res.name, currency: res.currency, timezone: res.timezone_name,
        status: res.account_status,
      });
    } catch (e) { results.push({ account: acc, ok: false, message: scrub(e.message) }); }
  }
  const info = await tokenInfo(conf);
  return { ok: results.every((r) => r.ok), results, token: info };
}

/**
 * Dò các tài khoản quảng cáo mà token này với tới — giao diện điền hộ accountIds,
 * đỡ phải đi tra ID trong Ads Manager (chỗ dễ gõ nhầm nhất).
 */
async function danhSachTaiKhoan(conf) {
  if (!conf.accessToken) throw new Error('Chưa có accessToken');
  hideSecret(conf.accessToken);
  const ver = conf.apiVersion || 'v21.0';
  const r = await getJson(`https://graph.facebook.com/${ver}/me/adaccounts`
    + '?fields=account_id,name,currency,account_status&limit=200'
    + `&access_token=${encodeURIComponent(conf.accessToken)}`,
    { label: 'Meta /me/adaccounts', retries: 1 });
  if (r && r.error) throw new Error(scrub(r.error.message || 'Meta từ chối'));
  return (r.data || []).map((a) => ({
    id: String(a.account_id || '').replace(/^act_/, ''),
    name: a.name || '',
    currency: a.currency || '',
    // 1 = đang chạy. Các trạng thái khác (2 = tắt, 3 = chưa duyệt…) vẫn cho chọn.
    dangChay: Number(a.account_status) === 1,
  })).filter((a) => a.id);
}

module.exports = {
  hanhDongChuyenDoi, TEN_HANH_DONG, nhomHanhDong,
  PLATFORM, fetchRange, test, tokenInfo, danhSachTaiKhoan, conversionsOf, actionTypesSeen,
};
