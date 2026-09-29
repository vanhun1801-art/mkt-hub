'use strict';
/**
 * Lớp gọi Lark của app — vỏ mỏng của lõi dùng chung `lark-chung/lark-core.js`
 * (họ A: listAll(tableId), bản ghi { id, c }).
 *
 * chiaLo / TRAN_JSON / TRAN_DONG (chia lô theo độ dài JSON vì Windows chặn dòng
 * lệnh ~32k ký tự — bảng Bài đăng caption dài) nay nằm trong lõi và áp dụng cho
 * MỌI app, không riêng Social nữa. Vẫn export ở đây vì store.js đang dùng.
 */
const cfg = require('./config');
module.exports = require('../lark-chung/lark-core').taoLark(cfg, { ho: 'A', thuMuc: __dirname });
