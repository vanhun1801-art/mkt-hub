'use strict';
/**
 * Nén phản hồi (gzip / brotli) — MỘT chỗ cho cả hệ.
 *
 * Vì sao đáng làm: lớp vỏ gửi 315 KB JS/CSS cho mỗi lần mở, và CHÍN app con đi
 * qua proxy này còn nặng hơn (Bảng công việc 268 KB, Lịch tác nghiệp 286 KB,
 * Quảng cáo 228 KB…). Đo thật: 315 KB xuống 94 KB, 1.3 MB của các app con xuống
 * ~355 KB. Trên gói Free của Render, đường truyền là thứ chậm nhất trong cả hệ —
 * không phải Lark, không phải Node.
 *
 * Vì sao đặt ở lớp vỏ chứ không ở từng app: proxy đã XOÁ `accept-encoding` khi
 * gọi lên app con (để còn chèn được CSS/JS vào HTML), nên app con luôn trả bản
 * thô. Nén ở đây phủ cả chín app mà không phải sửa một dòng nào của chúng —
 * đúng nguyên tắc kiến trúc của hub từ đầu.
 *
 * Ba chỗ KHÔNG được nén:
 *   - text/event-stream (luồng Trực tiếp của Booking OTA): zlib gom đệm chờ đủ
 *     khối mới đẩy, nên sự kiện đứng im hàng phút. SSE phải đi thẳng.
 *   - Ảnh / zip / xlsx / font: đã nén sẵn, nén lại tốn CPU mà to hơn.
 *   - Thân ngắn: dưới 1 KB thì phần đầu gzip còn dài hơn phần tiết kiệm được.
 */
const zlib = require('zlib');

/* Dưới mốc này thì nén lỗ vốn. 1 KB là mốc quen dùng của nginx. */
const NGUONG = 1024;

/* Brotli chậm hơn gzip đáng kể ở mức nén cao, nên chia hai đường:
 *   - file tĩnh: nén MỘT LẦN rồi giữ trong RAM -> dùng mức cao nhất (11 / 9).
 *   - phản hồi động (API, proxy): nén lại mỗi lượt -> mức vừa, đủ nhanh.
 * Đo trên app.js 80 KB: br(11) ~21 KB nhưng tốn ~90 ms; br(5) ~24 KB chỉ ~4 ms. */
const BR_NHANH = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } };
const BR_KY = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } };

/** Kiểu nội dung nào đáng nén. Mặc định KHÔNG nén — chỉ mở cho thứ mình biết. */
function nenDuoc(loai) {
  const t = String(loai || '').toLowerCase();
  if (!t) return false;
  if (t.startsWith('text/event-stream')) return false;   // SSE: xem đầu file
  if (/^text\//.test(t)) return true;
  if (/^image\/svg\+xml/.test(t)) return true;
  if (/^application\/(json|javascript|xml|manifest\+json|x-ndjson)/.test(t)) return true;
  return /\+json\b/.test(t);
}

/**
 * Trình duyệt nhận được kiểu nén nào. Trả '' nghĩa là gửi bản thô.
 *
 * Ưu tiên brotli: nhỏ hơn gzip ~15% và mọi trình duyệt từ 2017 đều hiểu. Chỉ
 * đọc `br`/`gzip`, và tôn trọng `q=0` — đó là cách chuẩn để client nói "đừng
 * dùng kiểu này", gặp thật ở vài proxy doanh nghiệp.
 */
function chon(req) {
  const ae = String((req.headers && req.headers['accept-encoding']) || '').toLowerCase();
  if (!ae) return '';
  const muc = {};
  for (const ph of ae.split(',')) {
    const [ten, ...ts] = ph.trim().split(';');
    const q = ts.map((x) => /^\s*q=([0-9.]+)/.exec(x)).find(Boolean);
    muc[ten.trim()] = q ? Number(q[1]) : 1;
  }
  const co = (ten) => {
    const v = muc[ten] !== undefined ? muc[ten] : muc['*'];
    return v !== undefined && v > 0;
  };
  if (co('br')) return 'br';
  if (co('gzip')) return 'gzip';
  return '';
}

/** Nén một Buffer. Trả Promise<Buffer>. `ky` = nén kỹ (dùng cho bản giữ lại). */
function nenBuf(buf, ma, ky) {
  return new Promise((giai, hong) => {
    const xong = (e, r) => (e ? hong(e) : giai(r));
    if (ma === 'br') zlib.brotliCompress(buf, ky ? BR_KY : BR_NHANH, xong);
    else zlib.gzip(buf, { level: ky ? 9 : 6 }, xong);
  });
}

/** Luồng nén để pipe (proxy trả tệp lớn — không gom hết vào RAM rồi mới gửi). */
function luong(ma) {
  return ma === 'br' ? zlib.createBrotliCompress(BR_NHANH) : zlib.createGzip({ level: 6 });
}

/* Đọc/xoá header không phân biệt hoa thường: `send()` của hub viết
 * 'Content-Type', còn app con trả về 'content-type'. Cùng một hàm phải hiểu cả
 * hai, nếu không thì nửa số phản hồi lọt qua mà không được nén. */
function lay(headers, ten) {
  const t = ten.toLowerCase();
  for (const k of Object.keys(headers || {})) if (k.toLowerCase() === t) return headers[k];
  return undefined;
}
function xoa(headers, ten) {
  const t = ten.toLowerCase();
  for (const k of Object.keys(headers || {})) if (k.toLowerCase() === t) delete headers[k];
}

/**
 * Trả lời có thân đã biết trước (API, file tĩnh, trang HTML đã chèn).
 *
 * Luôn đặt Content-Length: không có nó Node chuyển sang chunked, mà chunked thì
 * trình duyệt không vẽ được thanh tiến trình và mỗi khối tốn thêm vài byte.
 *
 * `daNen` = bản nén đã có sẵn (file tĩnh giữ trong RAM), khỏi nén lại.
 */
function traLoi(res, code, body, headers, daNen) {
  const h = Object.assign({}, headers);
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body == null ? '' : body), 'utf8');
  const laHead = !!(res.req && res.req.method === 'HEAD');
  const ma = res.__nen || '';
  const varyGoc = lay(h, 'Vary');

  const gui = (than, maNen) => {
    if (maNen) {
      xoa(h, 'Content-Encoding');
      xoa(h, 'Vary');
      h['Content-Encoding'] = maNen;
      /* Vary bắt buộc khi nội dung đổi theo Accept-Encoding: thiếu nó thì proxy
       * hay CDN đứng giữa có thể đưa bản br cho trình duyệt chỉ hiểu gzip. */
      h.Vary = varyGoc ? varyGoc + ', Accept-Encoding' : 'Accept-Encoding';
    }
    xoa(h, 'Content-Length');
    h['Content-Length'] = String(than.length);
    res.writeHead(code, h);
    /* HEAD: đúng bộ header, không thân. Gửi thân cho HEAD là sai chuẩn và làm
     * vài client treo chờ dữ liệu không bao giờ tới. */
    res.end(laHead ? undefined : than);
  };

  if (daNen && ma && daNen[ma]) return gui(daNen[ma], ma);
  if (!ma || buf.length < NGUONG || !nenDuoc(lay(h, 'Content-Type'))) return gui(buf, '');

  nenBuf(buf, ma, false).then(
    (z) => {
      /* Nén xong mà không nhỏ hơn (SVG đã tối giản, JSON toàn chuỗi ngẫu nhiên)
       * thì gửi bản thô — đỡ CPU cho cả hai đầu. */
      if (!res.writableEnded) {
        if (z.length < buf.length) gui(z, ma);
        else gui(buf, '');
      }
    },
    () => { if (!res.writableEnded) gui(buf, ''); }
  );
  return undefined;
}

module.exports = { chon, nenDuoc, nenBuf, luong, traLoi, NGUONG, BR_KY };
