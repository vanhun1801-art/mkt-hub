'use strict';
/**
 * Hàng đợi booking cục bộ — lưới an toàn cho webhook.
 *
 * VÌ SAO CẦN: OTA gọi webhook bất kể base đã dựng xong chưa, token còn hạn chưa,
 * Lark có đang lỗi hay không. Trả lỗi 500 cho OTA là mất booking (phần lớn OTA
 * chỉ thử lại vài lần rồi bỏ). Nên mọi booking nhận được đều ghi xuống file này
 * TRƯỚC, rồi mới đẩy vào Base; đẩy thành công thì đánh dấu, thất bại thì nằm lại
 * chờ lần đẩy sau.
 *
 * Ổ đĩa Render là TẠM: file này mất sau mỗi lần deploy. Vì vậy nó chỉ là vùng
 * đệm, không phải nơi lưu trữ chính — nối base càng sớm càng tốt.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const TOI_DA = 3000;

function docFile() {
  try {
    const j = JSON.parse(fs.readFileSync(cfg.queueFile, 'utf8'));
    return Array.isArray(j.rows) ? j.rows : [];
  } catch (_) { return []; }
}

function ghiFile(rows) {
  fs.mkdirSync(path.dirname(cfg.queueFile), { recursive: true });
  const giu = rows.slice(-TOI_DA);
  fs.writeFileSync(cfg.queueFile, JSON.stringify({ rows: giu }, null, 1));
  return giu;
}

/** Khoá chống trùng: một mã booking của một kênh chỉ có một dòng. */
const khoa = (b) => (b.kenhId || '') + '|' + (b.maBooking || '');

/** Toàn bộ hàng đợi, mới nhất trước. */
function doc() {
  return docFile().slice().reverse();
}

/** Số booking chưa đẩy được vào Base. */
function demChuaDay() {
  return docFile().filter((b) => !b.recordId).length;
}

/**
 * Thêm mới hoặc cập nhật một booking.
 * Mã booking rỗng thì KHÔNG dedupe (không có khoá) — vẫn nhận, nhưng gắn cờ để
 * cột "cần xử lý" nhắc người vận hành đi tra mã thật.
 */
function themHoacCapNhat(b) {
  const rows = docFile();
  const k = khoa(b);
  const i = b.maBooking ? rows.findIndex((r) => khoa(r) === k) : -1;
  if (i >= 0) {
    // giữ lại những gì người vận hành đã sửa tay trong app
    const cu = rows[i];
    rows[i] = { ...cu, ...b, id: cu.id, daNhan: b.daNhan || cu.daNhan, suaTay: cu.suaTay || null };
    ghiFile(rows);
    return { row: rows[i], moi: false };
  }
  const row = { ...b, id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
  rows.push(row);
  ghiFile(rows);
  return { row, moi: true };
}

/** Sửa một booking trong hàng đợi (nhận booking, điền điểm đón/SĐT thiếu…). */
function capNhat(id, patch) {
  const rows = docFile();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return null;
  rows[i] = { ...rows[i], ...patch, id: rows[i].id, suaTay: Date.now() };
  ghiFile(rows);
  return rows[i];
}

/** Đánh dấu đã nằm trong Base (kèm record_id) — lần đẩy sau không tạo trùng. */
function danhDauDaDay(map) {
  const rows = docFile();
  rows.forEach((r) => { if (map[r.id]) r.recordId = map[r.id]; });
  ghiFile(rows);
  return rows.filter((r) => r.recordId).length;
}

function xoaDaDay() {
  const rows = docFile();
  const con = rows.filter((r) => !r.recordId);
  ghiFile(con);
  return rows.length - con.length;
}

module.exports = { doc, demChuaDay, themHoacCapNhat, capNhat, danhDauDaDay, xoaDaDay, khoa };
