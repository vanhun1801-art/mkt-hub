'use strict';
/**
 * Dữ liệu chạy của app, cất thành tệp JSON trong du-lieu/ (đã gitignore):
 *   ai.json    bộ đệm kết quả AI theo thư, để mở lại không tốn thêm lượt gọi
 *   luat.json  luật anh tự đặt: "thư từ địa chỉ này luôn vào ngăn X"
 *   hen.json   thư hẹn nhắc lại: ẩn khỏi ngăn tới giờ hẹn
 *
 * Luật và hẹn là của TỪNG người: bản chạy chung có nhiều người dùng, mỗi
 * người một cặp tệp luat-<mã>.json / hen-<mã>.json. Khoá '' (chủ máy) giữ
 * tên tệp cũ để dữ liệu đã có trên máy anh Hùng không mất.
 *
 * Ghi qua tệp tạm rồi đổi tên, để tắt máy giữa chừng không để lại tệp hỏng.
 */
const fs = require('fs');
const crypto = require('crypto');
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
const cua = (ten, nguoi) => (nguoi
  ? ten + '-' + crypto.createHash('sha256').update(String(nguoi)).digest('hex').slice(0, 16) : ten);

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

  luat: (nguoi = '') => doc(cua('luat', nguoi)),
  datLuat(email, ngan, nguoi = '') {
    const t = cua('luat', nguoi);
    const d = doc(t);
    if (ngan) d[email] = ngan; else delete d[email];
    ghi(t);
  },

  hen: (nguoi = '') => doc(cua('hen', nguoi)),
  datHen(hop, id, den, nguoi = '') {
    const t = cua('hen', nguoi);
    const d = doc(t);
    if (den) d[khoa(hop, id)] = den; else delete d[khoa(hop, id)];
    ghi(t);
  },

  /* Chỉ cho test: quên bộ nhớ đệm để đọc lại từ tệp. */
  _quen() { for (const k of Object.keys(bo)) delete bo[k]; },
};
