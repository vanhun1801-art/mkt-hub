'use strict';
/**
 * Lớp gọi Lark của app — vỏ mỏng của lõi dùng chung `lark-chung/lark-core.js`
 * (họ B: listAllRecords(tableId = bảng Sản phẩm, base), bản ghi { record_id, cells }).
 *
 * uploadAttachment của app này nhận BUFFER và THAY cả ô (hình bản đồ), khác chữ
 * ký uploadAttachment(relFilePath) của các app khác — nên ánh xạ sang
 * uploadAttachmentBuffer của lõi để giữ đúng hành vi cũ.
 */
const cfg = require('./config');
const { taoLark } = require('../lark-chung/lark-core');

function taoVoi(mode) {
  const loi = taoLark(cfg, { ho: 'B', thuMuc: __dirname, bangMacDinh: cfg.spTableId, mode });
  return Object.assign(loi, { uploadAttachment: loi.uploadAttachmentBuffer });
}

module.exports = taoVoi();
module.exports.taoVoi = taoVoi;
