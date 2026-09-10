'use strict';
/**
 * Gửi tin nhóm bằng danh tính của MỘT Lark app cố định — app **"Marketing Hub"**
 * (`cli_aa1a8ae21a78ded2`), chứ không phải app mà lark-cli đang buộc vào máy, cũng
 * không phải app nền tảng của Hub khi deploy.
 *
 * VÌ SAO PHẢI CÓ FILE NÀY — phòng có NĂM app Lark trong Developer Console, ba cái
 * dính vào luồng này:
 *
 *   cli_aa1a8ae21a78ded2  "Marketing Hub"  → app anh Hùng chọn đứng tên gửi tin
 *   cli_aa04305ecd385ed1  "Tracking"       → LARK_APP_ID của Hub khi deploy (chế độ api)
 *   cli_aaeafc646039ded1  "Lê Văn Hùng's Lark CLI" → app lark-cli buộc trên máy (chế độ cli)
 *
 * Không có file này thì tin gửi từ MÁY CÁ NHÂN mang danh tính app thứ ba, còn tin gửi
 * từ SERVER mang danh tính app thứ hai. Nhóm SỬA ẢNH thấy hai người gửi khác nhau tuỳ
 * app chạy ở đâu, và phải mời CẢ HAI bot vào nhóm — mời thiếu một cái là "gửi được ở
 * máy, deploy lên thì im", kiểu lỗi mất cả buổi để tìm.
 *
 * Anh Hùng chốt: nhóm chỉ thấy Marketing Hub. Nên khai ANH_TIN_APP_ID +
 * ANH_TIN_APP_SECRET là mọi tin đều đi qua đường này ở MỌI chế độ, chỉ phải mời một bot.
 *
 * Chưa khai khoá thì file này tự tắt (`co()` trả false) và lark.js lùi về lark-cli —
 * app vẫn chạy, chỉ là người gửi khác. Giao diện Cài đặt nói rõ đang gửi bằng ai để
 * không ai phải đoán.
 */
const cfg = require('./config');

const HOST = () => cfg.apiHost || 'https://open.larksuite.com';

/** Đã khai đủ khoá của app gửi tin chưa. */
const co = () => Boolean(cfg.tinAppId && cfg.tinAppSecret);

/* tenant_access_token sống 2 tiếng — giữ lại, trừ hao 5 phút. */
let kho = { token: null, het: 0 };

async function token() {
  if (kho.token && Date.now() < kho.het) return kho.token;
  const r = await fetch(HOST() + '/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: cfg.tinAppId, app_secret: cfg.tinAppSecret }),
  });
  const d = await r.json();
  if (d.code !== 0) {
    throw new Error('Không lấy được token của app gửi tin (' + cfg.tinAppId + '): '
      + (d.msg || d.code));
  }
  kho = { token: d.tenant_access_token, het: Date.now() + Math.max(60, (d.expire || 7200) - 300) * 1000 };
  return kho.token;
}

/** Xoá token đã cất — dùng khi Lark trả 99991663/99991661 (token hết hạn sớm). */
const xoaToken = () => { kho = { token: null, het: 0 }; };

/**
 * Cùng chữ ký với lark.guiTin(): trả { ok, msgId } hoặc { ok:false, loi }.
 * KHÔNG throw — báo cáo đã ghi vào Base rồi, tin nhắn không được làm vỡ yêu cầu.
 *
 * `khoa` đi vào trường `uuid` của Lark: bấm Báo cáo hai lần vì mạng chậm thì nhóm
 * chỉ nhận một tin. Cũng vì thế KHÔNG retry mù ở đây.
 */
async function gui({ chatId, userId, email, text, card, khoa }) {
  try {
    /* Ba cách chỉ đích, khác nhau ở receive_id_type — sai một chữ là Lark trả
     * "receive_id invalid":
     *   chatId  → chat_id   (nhắn vào nhóm; đường dùng thật của app)
     *   userId  → open_id   (nhắn riêng cho một người)
     *   email   → email     (nhắn riêng nhưng chỉ đích bằng email công ty)
     *
     * VÌ SAO CẦN `email`: **open_id là RIÊNG THEO TỪNG APP**. Cùng một con người,
     * app Lark CLI thấy `ou_A`, app Marketing Hub thấy `ou_B`. Đưa open_id của app
     * này cho app kia thì Lark trả `99992361 open_id cross app`. Email thì chung
     * cho cả tenant, nên dùng để nhắn thử là chắc nhất. */
    const kieu = email ? 'email' : (userId ? 'open_id' : 'chat_id');
    const body = {
      receive_id: email || userId || chatId,
      msg_type: card ? 'interactive' : 'text',
      content: JSON.stringify(card || { text: String(text || '') }),
    };
    if (khoa) body.uuid = String(khoa).slice(0, 50);

    let d = await goi(body, await token(), kieu);
    /* Token cất sẵn có thể đã bị Lark thu hồi (đổi App Secret chẳng hạn) — thử lại
     * ĐÚNG MỘT LẦN với token mới. Đây là lần duy nhất được phép gửi lại, vì lỗi này
     * xảy ra TRƯỚC khi Lark nhận tin nên không sinh tin trùng. */
    if (d.code === 99991663 || d.code === 99991661 || d.code === 99991664) {
      xoaToken();
      d = await goi(body, await token(), kieu);
    }

    if (d.code === 0) return { ok: true, msgId: (d.data && d.data.message_id) || '' };

    let loi = 'Lark ' + d.code + ': ' + (d.msg || 'lỗi không rõ');
    if ([230002, 230013].includes(d.code) || /out of the chat|not in the chat/i.test(d.msg || '')) {
      loi = 'Bot "' + cfg.tinAppTen + '" (' + cfg.tinAppId + ') chưa ở trong hội thoại này'
        + ' — mời bot vào nhóm (hoặc mở app cho người nhận) rồi gửi lại. (' + loi + ')';
    } else if (d.code === 99992361) {
      loi = 'open_id này thuộc app khác — open_id là riêng theo từng app. Dùng email'
        + ' hoặc lấy lại open_id bằng chính app "' + cfg.tinAppTen + '". (' + loi + ')';
    } else if (d.code === 99991672) {
      loi = 'App "' + cfg.tinAppTen + '" chưa được bật scope im:message, hoặc đã bật mà '
        + 'CHƯA phát hành version mới, trong Developer Console. (' + loi + ')';
    }
    return { ok: false, loi: loi.slice(0, 400) };
  } catch (e) {
    return { ok: false, loi: String(e.message || e).slice(0, 400) };
  }
}

async function goi(body, tk, kieu = 'chat_id') {
  const r = await fetch(HOST() + '/open-apis/im/v1/messages?receive_id_type=' + kieu, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + tk,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  return r.json();
}

/** Ai đang là người gửi — để giao diện nói rõ, khỏi ai phải đoán. */
function nguoiGui() {
  /* `nen` = bot ĐÁNG LẼ phải gửi. Cần riêng khỏi `ten` vì ở nhánh 'cli' thì `ten` là
   * app khác, mà giao diện vẫn phải nói được "phải mời bot NÀO". */
  const nen = { ten: cfg.tinAppTen, appId: cfg.tinAppId };
  if (co()) return { ...nen, qua: 'app', nen };
  if (cfg.mode === 'api') return { ten: cfg.tinAppTen, appId: cfg.appId, qua: 'api', nen };
  return { ten: 'app của lark-cli trên máy này', appId: 'cli_aaeafc646039ded1', qua: 'cli', nen };
}

module.exports = { co, gui, token, xoaToken, nguoiGui };
