'use strict';
/**
 * ============================================================================
 * LOGO THƯƠNG HIỆU — một bản duy nhất cho cả hệ
 * ============================================================================
 *
 *   const { layLogo } = require('../lark-chung/logo');
 *   const logo = await layLogo(path.join(__dirname, 'du-lieu'));  // {buf,mime} | null
 *
 * Bản gốc nằm ở Marketing Hub (Cài đặt → Nhận diện thương hiệu), lấy về qua
 * `GET /api/logo`. App con KHÔNG giữ bản riêng: đổi logo mà mỗi app một bản thì
 * phải nhớ đi sửa từng app, và không cách nào biết app nào đang đóng bản nào
 * lên tệp gửi ra ngoài.
 *
 * Ba tầng, rơi dần:
 *   1. hỏi hub        — bản đang dùng thật
 *   2. bản tải lần trước — hub ngủ (Render cho app con ngủ khi rảnh)
 *   3. không có logo  — tệp vẫn xuất bình thường, chỉ thiếu ảnh
 *
 * Tầng 3 là chỗ dễ làm sai nhất: một cái logo không lấy được KHÔNG được phép
 * làm hỏng bản xuất. Nên mọi đường lỗi ở đây đều trả về null chứ không ném.
 */
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

/* Hub bảo cổng của chính nó qua HUB_PORT lúc khởi động app con (children.js).
 * Đoán 5180 chỉ đúng trên máy cá nhân — trên Render hub nghe cổng do Render
 * cấp, gọi 5180 là hỏng IM LẶNG và mọi tệp xuất mất logo mà không ai biết vì
 * sao. */
const HUB = (process.env.HUB_NOI_BO
  || 'http://127.0.0.1:' + (process.env.HUB_PORT || '5180')).replace(/\/+$/, '');

function tai(duong, giay) {
  return new Promise((giai) => {
    const mod = duong.startsWith('https') ? https : http;
    let req;
    try {
      req = mod.get(duong, (r) => {
        if (r.statusCode !== 200) { r.resume(); return giai(null); }
        const manh = [];
        r.on('data', (c) => manh.push(c));
        r.on('end', () => giai({
          buf: Buffer.concat(manh),
          mime: String(r.headers['content-type'] || 'image/png').split(';')[0].trim(),
        }));
        r.on('error', () => giai(null));
      });
    } catch (_) { return giai(null); }
    req.on('error', () => giai(null));
    req.setTimeout(giay * 1000, () => { req.destroy(); giai(null); });
  });
}

/**
 * @param {string} thuMuc thư mục giữ bản tải về lần trước
 * @param {number} [giay] trần chờ hub
 * @returns {Promise<{buf: Buffer, mime: string}|null>}
 */
async function layLogo(thuMuc, giay = 6) {
  const cache = path.join(thuMuc, 'logo-hub');

  const tuHub = await tai(HUB + '/api/logo', giay);
  if (tuHub && tuHub.buf.length) {
    try {
      fs.mkdirSync(thuMuc, { recursive: true });
      fs.writeFileSync(cache, tuHub.buf);
      fs.writeFileSync(cache + '.mime', tuHub.mime);
    } catch (_) { /* thư mục chỉ đọc thì thôi, không đáng làm hỏng bản xuất */ }
    return tuHub;
  }

  try {
    if (fs.existsSync(cache)) {
      const mime = fs.existsSync(cache + '.mime')
        ? fs.readFileSync(cache + '.mime', 'utf8').trim() : 'image/png';
      return { buf: fs.readFileSync(cache), mime };
    }
  } catch (_) { /* bản lưu hỏng thì coi như không có */ }

  return null;
}

/** Kích thước thật của ảnh, để giữ đúng tỉ lệ khi đóng lên tệp.
 *  Chỉ đọc PNG và JPEG — hai thứ Cài đặt của hub nhận. Không đọc được thì trả
 *  null và chỗ gọi tự chọn một khổ mặc định. */
function coAnh(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
  /* PNG: 8 byte chữ ký, rồi khối IHDR — rộng và cao nằm ở byte 16 và 20. */
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { rong: buf.readUInt32BE(16), cao: buf.readUInt32BE(20) };
  }
  /* JPEG: dò từng đoạn tới SOF0..SOF3 / SOF5..SOF7 / SOF9..SOF11. */
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const ma = buf[i + 1];
      const dai = buf.readUInt16BE(i + 2);
      const laSOF = (ma >= 0xc0 && ma <= 0xc3) || (ma >= 0xc5 && ma <= 0xc7)
        || (ma >= 0xc9 && ma <= 0xcb);
      if (laSOF) return { cao: buf.readUInt16BE(i + 5), rong: buf.readUInt16BE(i + 7) };
      if (dai < 2) return null;
      i += 2 + dai;
    }
  }
  return null;
}

module.exports = { layLogo, coAnh, HUB };
