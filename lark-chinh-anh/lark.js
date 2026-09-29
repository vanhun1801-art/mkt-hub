'use strict';
/**
 * Lớp gọi Lark của app — vỏ mỏng của lõi dùng chung `lark-chung/lark-core.js`
 * (họ A: listAll(tableId), bản ghi { id, c }).
 *
 * Riêng guiTin() giữ lại ở đây vì có đường rẽ sang tin-app.js: khai khoá app
 * đứng tên gửi thì gửi bằng danh tính app đó, không dùng bot của lark-cli
 * (xem đầu file tin-app.js — phòng từng có 5 app Lark).
 */
const cfg = require('./config');
const { taoLark } = require('../lark-chung/lark-core');

function taoVoi(mode) {
  const loi = taoLark(cfg, { ho: 'A', thuMuc: __dirname, mode });

  function guiTin({ chatId, userId, email, text, card, khoa }) {
    const tinApp = require('./tin-app');
    if (loi.mode === 'api') {
      /* Chế độ api: tenant token ĐÃ là app Marketing Hub, thường không cần tin-app.
       * Vẫn nhường đường nếu ANH_TIN_APP_ID khai một app khác — để chỗ quyết định
       * "ai đứng tên gửi" chỉ có một. */
      if (tinApp.co() && cfg.tinAppId !== cfg.appId) return tinApp.gui({ chatId, userId, email, text, card, khoa });
      return loi.guiTin({ chatId, userId, email, text, card, khoa });
    }
    if (tinApp.co()) return tinApp.gui({ chatId, userId, email, text, card, khoa });
    if (email && !userId && !chatId) {
      return Promise.resolve({ ok: false,
        loi: 'Chỉ đích bằng email cần khai ANH_TIN_APP_ID + ANH_TIN_APP_SECRET (lark-cli không có --email).' });
    }
    return loi.guiTin({ chatId, userId, text, card, khoa, as: cfg.identityTin });
  }

  return Object.assign(loi, { guiTin });
}

module.exports = taoVoi();
module.exports.taoVoi = taoVoi;
