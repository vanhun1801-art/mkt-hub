'use strict';
/**
 * Lớp gọi Lark của app — vỏ mỏng của lõi dùng chung `lark-chung/lark-core.js`
 * (họ B: listAllRecords(tableId = bảng Hợp tác, base), bản ghi { record_id, cells }).
 * guiTinNhan, ganTep (thay cả ô đính kèm bằng danh sách tệp mới) và taiTep
 * (đọc một tệp về Buffer) nằm trong lõi với đúng chữ ký cũ.
 */
const cfg = require('./config');
module.exports = require('../lark-chung/lark-core').taoLark(cfg, { ho: 'B', thuMuc: __dirname, bangMacDinh: cfg.bang.hopTac });
