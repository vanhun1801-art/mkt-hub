'use strict';
/**
 * Lớp gọi Lark của app — vỏ mỏng của lõi dùng chung `lark-chung/lark-core.js`
 * (họ B: listAllRecords(tableId = cfg.tableId, base), bản ghi { record_id, cells }).
 * downloadAttachment / uploadAttachment đi qua .tmp/ của thư mục này (lark-cli
 * chỉ nhận đường dẫn tương đối trong cwd).
 */
const cfg = require('./config');
module.exports = require('../lark-chung/lark-core').taoLark(cfg, { ho: 'B', thuMuc: __dirname, bangMacDinh: cfg.tableId });
