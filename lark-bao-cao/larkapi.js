'use strict';
/** Backend Open API (chế độ server chung) — vỏ mỏng của lõi dùng chung, ép mode api. */
const cfg = require('./config');
module.exports = require('../lark-chung/lark-core').taoLark(cfg, { ho: 'B', thuMuc: __dirname, bangMacDinh: cfg.phieuTableId, mode: 'api' });
