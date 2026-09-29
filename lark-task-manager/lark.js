'use strict';
/**
 * Lớp gọi Lark của app — vỏ mỏng của lõi dùng chung `lark-chung/lark-core.js`
 * (họ B: listAllRecords(tableId = bảng Tracking), bản ghi { record_id, cells }).
 *
 * isTransient, updateField (PUT toàn phần — dựng `def` từ bản đọc về, xem
 * themLuaChon trong server.js), removeAttachment, sendMessage (trả true/false),
 * scopeUsers, downloadAttachment / uploadAttachment: tất cả trong lõi, đúng chữ ký cũ.
 */
const cfg = require('./config');
module.exports = require('../lark-chung/lark-core').taoLark(cfg, { ho: 'B', thuMuc: __dirname, bangMacDinh: cfg.tableId });
