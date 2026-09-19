'use strict';
/**
 * Gửi tin Lark bằng danh tính một app cố định, dùng chung cho mọi app con.
 *
 * Bản đầu tiên của đoạn này nằm trong lark-chinh-anh/tin-app.js và đọc thẳng
 * `./config` của app đó. Muốn app thứ hai gửi tin thì phải chép cả file — mà bài
 * học đắt nhất trong đó (open_id riêng theo từng app, bot phải ở trong nhóm,
 * scope phải phát hành version mới) thì chép được, còn bản vá sau này thì không:
 * sửa một bên, bên kia vẫn sai. Nên tách ra đây, nhận cấu hình qua tham số.
 *
 * VÌ SAO PHẢI CHỈ ĐÍCH DANH APP — không ghim thì tin gửi từ máy cá nhân mang
 * danh tính app của lark-cli, còn tin gửi từ Render mang danh tính app nền của
 * hub. Nhóm thấy hai người gửi khác nhau tuỳ code chạy ở đâu, và phải mời cả hai
 * bot vào nhóm — mời thiếu một cái là "gửi được ở máy, deploy lên thì im", kiểu
 * lỗi mất cả buổi để tìm.
 *
 * Anh Hùng đã chốt: nhóm chỉ thấy app "Marketing Hub" (cli_aa1a8ae21a78ded2), và
 * từ 19/09/2026 đó cũng là app nền tảng duy nhất của cả hệ.
 */

const HOST_MAC_DINH = 'https://open.larksuite.com';

/**
 * @param {object} c  { appId, appSecret, apiHost?, tenApp? }
 */
function tao(c) {
  const host = () => c.apiHost || HOST_MAC_DINH;
  const tenApp = c.tenApp || c.appId || 'app gửi tin';

  /** Đã khai đủ khoá chưa. Chưa thì mọi lời gọi trả lỗi có chữ, không ném. */
  const co = () => Boolean(c.appId && c.appSecret);

  /* tenant_access_token sống 2 tiếng — giữ lại, trừ hao 5 phút. */
  let kho = { token: null, het: 0 };
  const xoaToken = () => { kho = { token: null, het: 0 }; };

  async function token() {
    if (kho.token && Date.now() < kho.het) return kho.token;
    const r = await fetch(host() + '/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: c.appId, app_secret: c.appSecret }),
    });
    const d = await r.json();
    if (d.code !== 0) {
      throw new Error('Không lấy được token của app gửi tin (' + c.appId + '): '
        + (d.msg || d.code));
    }
    kho = {
      token: d.tenant_access_token,
      het: Date.now() + Math.max(60, (d.expire || 7200) - 300) * 1000,
    };
    return kho.token;
  }

  async function goi(body, tk, kieu) {
    const r = await fetch(host() + '/open-apis/im/v1/messages?receive_id_type=' + kieu, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + tk,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  /**
   * Trả { ok, msgId } hoặc { ok:false, loi }. KHÔNG ném: việc chính (ghi Base,
   * chạy đồng bộ) đã xong rồi, một cái tin nhắn không được làm vỡ nó.
   *
   * `khoa` đi vào trường `uuid` của Lark để chống gửi trùng. Cũng vì thế KHÔNG
   * được retry mù ở đây.
   */
  async function gui({ chatId, userId, email, text, card, khoa }) {
    if (!co()) return { ok: false, loi: 'Chưa khai App ID / App Secret của app gửi tin' };
    try {
      /* Ba cách chỉ đích, khác nhau ở receive_id_type — sai một chữ là Lark trả
       * "receive_id invalid":
       *   chatId → chat_id (nhắn nhóm) · userId → open_id · email → email
       *
       * VÌ SAO CẦN `email`: open_id là RIÊNG THEO TỪNG APP. Cùng một con người,
       * app này thấy `ou_A`, app kia thấy `ou_B`; đưa nhầm thì Lark trả
       * `99992361 open_id cross app`. Email chung cho cả tenant nên chắc nhất. */
      const kieu = email ? 'email' : (userId ? 'open_id' : 'chat_id');
      const body = {
        receive_id: email || userId || chatId,
        msg_type: card ? 'interactive' : 'text',
        content: JSON.stringify(card || { text: String(text || '') }),
      };
      if (khoa) body.uuid = String(khoa).slice(0, 50);

      let d = await goi(body, await token(), kieu);
      /* Token cất sẵn có thể đã bị thu hồi (đổi App Secret chẳng hạn) — thử lại
       * ĐÚNG MỘT LẦN. Lỗi này xảy ra TRƯỚC khi Lark nhận tin nên không sinh
       * tin trùng; mọi lỗi khác thì không được gửi lại. */
      if (d.code === 99991663 || d.code === 99991661 || d.code === 99991664) {
        xoaToken();
        d = await goi(body, await token(), kieu);
      }
      if (d.code === 0) return { ok: true, msgId: (d.data && d.data.message_id) || '' };

      let loi = 'Lark ' + d.code + ': ' + (d.msg || 'lỗi không rõ');
      if ([230002, 230013].includes(d.code) || /out of the chat|not in the chat/i.test(d.msg || '')) {
        loi = 'Bot "' + tenApp + '" (' + c.appId + ') chưa ở trong hội thoại này — mời bot '
          + 'vào nhóm rồi gửi lại. (' + loi + ')';
      } else if (d.code === 99992361) {
        loi = 'open_id này thuộc app khác — open_id riêng theo từng app. Dùng email, '
          + 'hoặc lấy lại open_id bằng chính app "' + tenApp + '". (' + loi + ')';
      } else if (d.code === 99991672) {
        loi = 'App "' + tenApp + '" chưa bật scope im:message, hoặc đã bật mà CHƯA phát '
          + 'hành version mới trong Developer Console. (' + loi + ')';
      }
      return { ok: false, loi: loi.slice(0, 400) };
    } catch (e) {
      return { ok: false, loi: String(e.message || e).slice(0, 400) };
    }
  }

  return { co, gui, token, xoaToken, tenApp, appId: c.appId };
}

module.exports = { tao };
