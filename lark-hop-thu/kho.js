'use strict';
/**
 * Dữ liệu chạy của app, cất thành tệp JSON trong du-lieu/ (đã gitignore):
 *   ai.json    bộ đệm kết quả AI theo thư, để mở lại không tốn thêm lượt gọi
 *   luat.json  luật anh tự đặt: "thư từ địa chỉ này luôn vào ngăn X"
 *   hen.json   thư hẹn nhắc lại: ẩn khỏi ngăn tới giờ hẹn
 *
 * Ghi qua tệp tạm rồi đổi tên, để tắt máy giữa chừng không để lại tệp hỏng.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const bo = {};

function duong(ten) { return path.join(cfg.duLieu, ten + '.json'); }

function doc(ten) {
  if (bo[ten]) return bo[ten];
  let d = {};
  try { d = JSON.parse(fs.readFileSync(duong(ten), 'utf8')) || {}; } catch (_) { d = {}; }
  bo[ten] = d;
  return d;
}

function ghi(ten) {
  fs.mkdirSync(cfg.duLieu, { recursive: true });
  const f = duong(ten);
  fs.writeFileSync(f + '.tmp', JSON.stringify(bo[ten] || {}, null, 1));
  fs.renameSync(f + '.tmp', f);
}

const khoa = (hop, id) => hop + '|' + id;

/* Bộ đệm AI không phình mãi: giữ 2000 thư gần nhất là đủ cho mọi hộp. */
const TRAN_AI = 2000;

module.exports = {
  khoa,
  layAi: (hop, id) => doc('ai')[khoa(hop, id)] || null,
  datAi(hop, id, v) { this.datAiNhieu([{ hop, id, v }]); },
  datAiNhieu(ds) {
    const d = doc('ai');
    for (const x of ds) d[khoa(x.hop, x.id)] = Object.assign({ luc: Date.now() }, x.v);
    const ks = Object.keys(d);
    if (ks.length > TRAN_AI) {
      ks.sort((a, b) => (d[a].luc || 0) - (d[b].luc || 0))
        .slice(0, ks.length - TRAN_AI).forEach((k) => delete d[k]);
    }
    ghi('ai');
  },

  luat: () => doc('luat'),
  datLuat(email, ngan) {
    const d = doc('luat');
    if (ngan) d[email] = ngan; else delete d[email];
    ghi('luat');
  },

  hen: () => doc('hen'),
  datHen(hop, id, den) {
    const d = doc('hen');
    if (den) d[khoa(hop, id)] = den; else delete d[khoa(hop, id)];
    ghi('hen');
  },

  /* Chỉ cho test: quên bộ nhớ đệm để đọc lại từ tệp. */
  _quen() { for (const k of Object.keys(bo)) delete bo[k]; },
};
