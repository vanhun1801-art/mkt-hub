'use strict';
/**
 * ============================================================================
 * PHÍA APP CON của kho Base dùng chung: hỏi hub trước khi tự đọc Lark.
 * ============================================================================
 * Cặp với lark-mkt-hub/kho-base.js. Được lark-core.js gọi ở hai chỗ đọc
 * (docTrang, docCotTho) và mọi chỗ ghi (để báo hub làm tươi).
 *
 * VÌ SAO CÓ: cùng một Base bị nhiều app đọc (KOL + Sản phẩm; Bảng công việc +
 * Báo cáo + KPI của hub), mỗi app một bộ đệm riêng hết hạn khác thời điểm —
 * số trên màn này không khớp màn kia, và lúc hub khởi động 12 app cùng đọc là
 * dính 800004135. Hub đọc MỘT lần, phát cho tất cả.
 *
 * BA ĐIỀU BẮT BUỘC (giống nhip-lark.js — đây nằm trên đường đọc của mọi app):
 *   1. KHÔNG CÓ HUB THÌ IM. Chạy lẻ hay dưới máy không qua hub: HUB_KHO_URL
 *      trống → trả null ngay, lark-core tự đọc Lark như cũ.
 *   2. KHÔNG BAO GIỜ CHẶN VIỆC THẬT. Hub bận, chết, trả rác → null → đọc thẳng.
 *   3. HUB HỎNG THÌ THÔI HỎI. Hỏng mấy lần liên tiếp thì nghỉ một phút.
 *
 * Hạn chờ dài hơn nhịp (hub có thể phải đi đọc Lark hộ, vài giây là bình thường)
 * nhưng vẫn có trần: quá HAN_MS thì bỏ, đọc thẳng.
 */
const http = require('http');

const URL_KHO = process.env.HUB_KHO_URL || '';
const KHOA = process.env.HUB_KHOA_NOI_BO || '';
const HAN_MS = Math.max(1000, Number(process.env.HUB_KHO_HAN_HOI || 25000));
const NGHI_MS = 60 * 1000;
const HONG_TOI_DA = 3;

let soHong = 0;
let nghiToi = 0;
const dem = { trung: 0, hut: 0, hong: 0, lamTuoi: 0 };

const bat = () => Boolean(URL_KHO && KHOA) && process.env.HUB_KHO_TAT !== '1';

function goi(method, duong, than) {
  return new Promise((xong) => {
    let da = false;
    const tra = (v) => { if (!da) { da = true; xong(v); } };
    let req;
    try {
      const u = new URL(URL_KHO.replace(/\/+$/, '') + duong);
      req = http.request(u, {
        method,
        headers: Object.assign({ 'x-hub-khoa': KHOA },
          than ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(than) } : {}),
      }, (res) => {
        let s = '';
        res.on('data', (d) => { s += d; if (s.length > 64 * 1024 * 1024) req.destroy(); });
        res.on('end', () => {
          if (res.statusCode !== 200) return tra(null);
          try { tra(JSON.parse(s)); } catch (_) { tra(null); }
        });
      });
    } catch (_) { return tra(null); }
    req.setTimeout(HAN_MS, () => { req.destroy(); tra(null); });
    req.on('error', () => tra(null));
    req.end(than || undefined);
  });
}

function ghiNhan(d) {
  if (d && typeof d === 'object') { soHong = 0; dem.trung += 1; return d; }
  dem.hong += 1;
  soHong += 1;
  if (soHong >= HONG_TOI_DA) { nghiToi = Date.now() + NGHI_MS; soHong = 0; }
  return null;
}

const q = (s) => encodeURIComponent(String(s || ''));

/** Một trang bản ghi (dạng cột như Lark trả). null = tự đọc Lark. */
async function docTrang(base, table, offset, as) {
  if (!bat() || Date.now() < nghiToi) { dem.hut += 1; return null; }
  return ghiNhan(await goi('GET', '/' + q(base) + '/' + q(table) + '/records?offset=' + (offset | 0) + '&as=' + q(as || 'user')));
}

/** Danh sách cột thô. null = tự đọc Lark. */
async function docCot(base, table, as) {
  if (!bat() || Date.now() < nghiToi) { dem.hut += 1; return null; }
  const d = await ghiNhan(await goi('GET', '/' + q(base) + '/' + q(table) + '/fields?as=' + q(as || 'user')));
  return d ? d.fields : null;
}

/** Báo hub bỏ bản đệm của bảng vừa ghi. Không chờ, không ném. */
function lamTuoi(base, table) {
  if (!bat()) return;
  dem.lamTuoi += 1;
  goi('POST', '/' + q(base) + '/' + q(table) + '/lam-tuoi', '{}').catch(() => {});
}

function tinhTrang() { return Object.assign({ bat: bat(), url: URL_KHO }, dem); }

module.exports = { docTrang, docCot, lamTuoi, bat, tinhTrang };
