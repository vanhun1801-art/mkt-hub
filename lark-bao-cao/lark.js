'use strict';
/**
 * Lớp gọi Lark của app — vỏ mỏng của lõi dùng chung `lark-chung/lark-core.js`
 * (họ B: listAllRecords(tableId = bảng Phiếu, base), bản ghi { record_id, cells }).
 * Chữ ký hàm giữ nguyên như trước; guiTinNhan nằm trong lõi.
 */
const cfg = require('./config');
module.exports = require('../lark-chung/lark-core').taoLark(cfg, { ho: 'B', thuMuc: __dirname, bangMacDinh: cfg.phieuTableId });
