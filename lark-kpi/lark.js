'use strict';
/**
 * Lớp gọi Lark của app — vỏ mỏng của lõi dùng chung `lark-chung/lark-core.js`
 * (họ A: listAll(tableId), bản ghi { id, c }). Chữ ký hàm giữ nguyên như trước.
 */
const cfg = require('./config');
module.exports = require('../lark-chung/lark-core').taoLark(cfg, { ho: 'A', thuMuc: __dirname });
