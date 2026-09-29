'use strict';
/**
 * Lớp gọi Lark của app — chỉ còn là vỏ mỏng của lõi dùng chung
 * `lark-chung/lark-core.js` (họ A: listAll(tableId), bản ghi { id, c }).
 * Chế độ cli/api chọn theo config; chữ ký hàm giữ nguyên như trước.
 */
const cfg = require('./config');
module.exports = require('../lark-chung/lark-core').taoLark(cfg, { ho: 'A', thuMuc: __dirname });
