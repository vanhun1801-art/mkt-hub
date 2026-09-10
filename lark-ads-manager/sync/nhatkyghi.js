'use strict';
/**
 * Nhật ký mọi lệnh app ghi vào nền tảng: ai, lúc nào, đổi cái gì, thành hay không.
 *
 * Vì sao phải có, kể cả khi nó không hoàn hảo: đây là những lệnh TIÊU TIỀN. Ba
 * hôm sau nhìn thấy một chiến dịch tắt mà không ai nhớ vì sao, thì câu hỏi đầu
 * tiên là "app tắt hay người tắt". Không có nhật ký thì không trả lời được.
 *
 * Ghi cả lệnh THẤT BẠI, không chỉ lệnh thành công. Một lệnh bị nền tảng từ chối
 * cũng là một điều cần biết — nhất là khi nó bị từ chối vì thiếu quyền.
 *
 * Hạn chế phải nói thẳng: file này nằm trên ổ đĩa, mà trên Render ổ đĩa là TẠM
 * nên nhật ký mất sau mỗi lần deploy. Muốn giữ lâu dài thì phải có một bảng riêng
 * trong Base — tôi không tự tạo bảng trong Base thật của công ty. Giao diện nói
 * rõ hạn chế này chứ không để anh Hùng tưởng nó còn mãi.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', process.env.ADS_NHAT_KY_FILE || 'nhat-ky-dieu-khien.jsonl');

/** Giữ bấy nhiêu dòng gần nhất khi đọc ra — nhật ký chỉ để tra, không để duyệt sổ. */
const SO_DONG_DOC = 200;

function ghi(dong) {
  const ban = { luc: new Date().toISOString(), ...dong };
  try {
    /* JSONL, mỗi lệnh một dòng: ghi thêm bằng một lần append, không đọc-sửa-ghi
     * cả file. Hai lệnh cùng lúc thì vẫn ra hai dòng nguyên vẹn. */
    fs.appendFileSync(FILE, JSON.stringify(ban) + '\n', { mode: 0o600 });
  } catch (_) {
    /* Không ghi được nhật ký thì KHÔNG được làm hỏng lệnh chính — lệnh đã gửi
     * lên nền tảng rồi, báo lỗi ở đây chỉ làm người dùng tưởng nó chưa chạy. */
  }
  return ban;
}

function doc(gioiHan = SO_DONG_DOC) {
  let raw = '';
  try { raw = fs.readFileSync(FILE, 'utf8'); } catch (_) { return []; }
  const dong = raw.split('\n').filter(Boolean);
  return dong.slice(-gioiHan).map((d) => {
    try { return JSON.parse(d); } catch (_) { return null; }
  }).filter(Boolean).reverse();
}

function xoa() {
  try { fs.unlinkSync(FILE); return true; } catch (_) { return false; }
}

module.exports = { FILE, ghi, doc, xoa, SO_DONG_DOC };
