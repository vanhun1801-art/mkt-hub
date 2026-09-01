'use strict';
/**
 * Kho lead + đơn Tourwell dùng để tính ROAS.
 *
 * Tách ra thành module vì nó có HAI người dùng, và trước đây chỉ có một:
 *   - server.js  — khi người dùng bấm nút nhập file / kéo API
 *   - sync/index.js — khi bộ hẹn giờ tự kéo, để ROAS không phải bấm tay nữa
 * Để nguyên trong server.js thì bộ hẹn giờ không với tới được, và cách duy nhất
 * làm ROAS tự động là có người mở trang rồi bấm nút.
 *
 * Vì sao lưu ra đĩa chứ không giữ trong bộ nhớ: người dùng đổi khoảng ngày, mở
 * lại tab, tính lại nhiều lượt — bắt nạp lại mỗi lần là không dùng được.
 * Vì sao KHÔNG ghi vào Base: đây là dữ liệu thô của một lần nạp, không phải sổ
 * sách; ghi vào Base là nhân đôi nguồn sự thật.
 *
 * Trên Render ổ đĩa là TẠM nên kho này mất sau mỗi lần deploy. Đó là lý do có
 * `tuApi`: nguồn Excel mất là phải đi xuất file lại bằng tay, còn nguồn API thì
 * lượt hẹn giờ kế tiếp tự dựng lại, không cần ai làm gì.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'roas-tourwell.json');

function doc() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return null; }
}

function ghi(kho) {
  fs.writeFileSync(FILE, JSON.stringify(kho), { mode: 0o600 });
  return kho;
}

function xoa() {
  try { fs.unlinkSync(FILE); return true; } catch (_) { return false; }
}

/** Tóm tắt cho giao diện — không bao giờ kèm dòng thô, chúng rất nặng. */
function tomTat() {
  const k = doc();
  return {
    coDuLieu: !!k,
    luc: k ? k.luc : null,
    tuApi: !!(k && k.tuApi),
    khoang: (k && k.khoang) || null,
    lead: k && k.lead ? k.lead.tomTat : null,
    don: k && k.don ? k.don.tomTat : null,
    oDiaTam: !!process.env.RENDER,
  };
}

/** Kho có còn tươi không — dùng để bộ hẹn giờ khỏi kéo lại mỗi lượt vô ích. */
function conTuoi(soGio = 6) {
  const k = doc();
  if (!k || !k.luc) return false;
  const t = Date.parse(k.luc);
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) < soGio * 3600 * 1000;
}

module.exports = { FILE, doc, ghi, xoa, tomTat, conTuoi };
