'use strict';
/**
 * Lớp gọi Lark của app — vỏ mỏng của lõi dùng chung `lark-chung/lark-core.js`
 * (họ A: listAll(tableId), bản ghi { id, c }).
 *
 * App này dò field ID theo TÊN cột nên dùng listTables / listFields (đã chuẩn
 * hoá { id, name, type }), createField, quyenGhi và gonLoi — tất cả nằm trong lõi.
 */
const cfg = require('./config');
module.exports = require('../lark-chung/lark-core').taoLark(cfg, { ho: 'A', thuMuc: __dirname });
