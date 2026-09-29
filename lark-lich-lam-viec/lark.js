'use strict';
/**
 * Lớp gọi Lark của app — vỏ mỏng của lõi dùng chung `lark-chung/lark-core.js`
 * (họ B: listAllRecords(tableId = bảng Đăng ký, base), bản ghi { record_id, cells }).
 */
const cfg = require('./config');
module.exports = require('../lark-chung/lark-core').taoLark(cfg, { ho: 'B', thuMuc: __dirname, bangMacDinh: cfg.dangKyTableId });
