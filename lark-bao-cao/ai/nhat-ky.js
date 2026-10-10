'use strict';
/**
 * NHẬT KÝ CÁC LƯỢT AI NHẬN XÉT.
 *
 * Vì sao cần: lượt chạy theo lịch là một phiên Claude không ai ngồi xem. Ngày
 * 10/10/2026 lượt 8:30 Thứ 7 gom xong dữ liệu rồi ĐỨNG IM ở bước viết tệp —
 * vướng hộp xin phép mà không ai bấm. Phiên vẫn báo "đang chạy", Base không có
 * gì, và không một dòng nào ghi lại chuyện đó. Soi ra mới thấy tuần trước cũng
 * hỏng y hệt, lượt 14:00 mới làm xong.
 *
 * Nên mỗi bước phải tự để lại dấu. Có dấu thì ai.soat biết lượt nào bỏ dở, và
 * app đẩy được việc ấy lên khối "Cần xử lý ngay" của hub.
 *
 * Tệp nằm cạnh dữ liệu AI, không lên git (thư mục du-lieu/).
 */
const fs = require('fs');
const path = require('path');

const TEP = path.join(__dirname, 'du-lieu', 'nhat-ky.json');
const GIU = 200;   // đủ để nhìn lại vài tháng, không phình tệp

function doc() {
  try { const d = JSON.parse(fs.readFileSync(TEP, 'utf8')); return Array.isArray(d) ? d : []; }
  catch (_) { return []; }
}

/**
 * Ghi một dấu. `buoc`: 'chuan-bi' | 'ghi' | 'loi'.
 * Không bao giờ ném lỗi — nhật ký hỏng thì cũng đừng làm hỏng lượt chạy.
 */
function ghi(muc) {
  try {
    fs.mkdirSync(path.dirname(TEP), { recursive: true });
    const ds = doc();
    ds.push({ luc: new Date().toISOString(), ...muc });
    fs.writeFileSync(TEP, JSON.stringify(ds.slice(-GIU), null, 1), 'utf8');
  } catch (_) { /* im lặng, có chủ ý */ }
}

/** Dấu mới nhất của một kỳ, theo từng bước. */
function cuaKy(loai, ky) {
  const ds = doc().filter((x) => x.loai === loai && x.ky === ky);
  const lay = (b) => ds.filter((x) => x.buoc === b).slice(-1)[0] || null;
  return { chuanBi: lay('chuan-bi'), ghi: lay('ghi'), loi: lay('loi'), tatCa: ds };
}

module.exports = { ghi, doc, cuaKy, TEP };
