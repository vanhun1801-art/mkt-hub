'use strict';
/**
 * Phía app con của đồng hồ nhịp: xin hub một lượt trước khi gọi Lark.
 *
 * Cặp với lark-mkt-hub/nhip.js. Gắn vào canh-api.js — thứ đã được nhét vào MỌI
 * app con bằng NODE_OPTIONS --require — nên mười hai app hưởng mà không phải
 * sửa tệp nào của chúng.
 *
 * BA ĐIỀU BẮT BUỘC, vì đây nằm trên đường đi của mọi lời gọi Lark:
 *
 *   1. KHÔNG CÓ HUB THÌ IM. Chạy dưới máy (chế độ cli) hay chạy lẻ thì
 *      HUB_NHIP_URL trống — hàm trả về ngay, không tốn gì.
 *
 *   2. KHÔNG BAO GIỜ CHẶN VIỆC THẬT. Hub bận, hub chết, hub trả rác — đều coi
 *      như "đi đi". Hạn mức là chuyện tối ưu; để một lời gọi Lark chết vì cái
 *      đồng hồ đếm nhịp thì tệ hơn nhiều so với dính 99991400 rồi thử lại.
 *      Vì thế có hạn chờ riêng và rất ngắn.
 *
 *   3. HUB HỎNG THÌ THÔI HỎI. Hỏng mấy lần liên tiếp thì nghỉ một phút rồi mới
 *      hỏi lại. Không có chỗ này thì mỗi lời gọi Lark phải chờ hết hạn một lần
 *      nữa — hub sập biến thành mọi app chậm gấp đôi.
 */
const http = require('http');

const URL_NHIP = process.env.HUB_NHIP_URL || '';
const KHOA = process.env.HUB_KHOA_NOI_BO || '';
const HAN_HOI_MS = Math.max(50, Number(process.env.HUB_NHIP_HAN_HOI || 400));
const NGHI_MS = 60 * 1000;
const HONG_TOI_DA = 3;

const LARK = /^open\.(larksuite\.com|feishu\.cn)$/;

let soHong = 0;
let nghiToi = 0;
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

const bat = () => Boolean(URL_NHIP && KHOA);

/** Máy chủ này có nằm dưới hạn mức dùng chung của app Lark không. */
const thuocHanMuc = (host) => LARK.test(String(host || ''));

function hoiHub() {
  return new Promise((xong) => {
    let da = false;
    const tra = (v) => { if (!da) { da = true; xong(v); } };
    let req;
    try {
      req = http.request(URL_NHIP, { method: 'GET', headers: { 'x-hub-khoa': KHOA } }, (res) => {
        let s = '';
        res.on('data', (d) => { s += d; if (s.length > 4096) req.destroy(); });
        res.on('end', () => {
          try { tra(JSON.parse(s)); } catch (_) { tra(null); }
        });
      });
    } catch (_) { return tra(null); }
    req.setTimeout(HAN_HOI_MS, () => { req.destroy(); tra(null); });
    req.on('error', () => tra(null));
    req.end();
  });
}

/**
 * Chờ tới lượt mình. Trả về số mili giây đã chờ (0 là đi ngay) — chỉ để phép
 * thử soi, chỗ gọi không cần dùng.
 */
async function xinLuot(host) {
  if (!bat() || !thuocHanMuc(host)) return 0;
  if (Date.now() < nghiToi) return 0;

  const d = await hoiHub();
  if (!d || typeof d.cho !== 'number' || !Number.isFinite(d.cho)) {
    soHong += 1;
    if (soHong >= HONG_TOI_DA) { nghiToi = Date.now() + NGHI_MS; soHong = 0; }
    return 0;
  }
  soHong = 0;
  /* Chặn trên ngay tại đây nữa: hub lỗi mà trả về một con số khổng lồ thì
   * không được phép làm treo app con. */
  const cho = Math.min(Math.max(0, d.cho), 5000);
  if (cho > 0) await ngu(cho);
  return cho;
}

module.exports = { xinLuot, thuocHanMuc, bat };
