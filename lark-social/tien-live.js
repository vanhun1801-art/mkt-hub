'use strict';
/**
 * ============================================================================
 * ĐO HIỆU QUẢ LIVE BẰNG TIỀN — gắn lead và đơn Tourwell vào từng phiên LIVE
 * ============================================================================
 *
 * VÌ SAO PHẢI CÓ MODULE NÀY
 *
 * Không nền tảng nào cho số LIVE tử tế: TikTok và Instagram không mở API cho
 * phát trực tiếp, Facebook thì `live_videos` đòi Meta duyệt App Review. Nên nếu
 * chỉ trông vào lượt xem thì tab LIVE mãi mãi là bảng nhập tay.
 *
 * Nhưng "hiệu quả" của một buổi LIVE bán tour đâu phải lượt xem — là có bao
 * nhiêu khách để lại thông tin và bao nhiêu tiền về. Hai thứ đó Tourwell trả
 * qua Open API, có giờ đến từng giây (`created_at_iso`, ví dụ
 * `2026-09-21T15:26:43+07:00`), và lead còn mang sẵn nhãn nền tảng ở
 * `source.name` — đã đếm thật 100 lead gần nhất: 55 "Tiktok Rooty Trip Phú
 * Quốc", 45 "Facebook Rooty Trip Phú Quốc". Đủ để tách TikTok với Facebook.
 *
 * PHÉP GẮN
 *
 *   phiên LIVE  [bắt đầu … kết thúc + đuôi]  ×  nền tảng
 *        ↓
 *   lead Tourwell rơi vào khung đó, đúng nền tảng
 *        ↓
 *   đơn của chính những lead ấy (lead trả kèm danh sách mã đơn)
 *        ↓
 *   Doanh thu
 *
 * Đuôi mặc định 120 phút: khách xem LIVE hiếm khi nhắn ngay lúc đang xem, và
 * không ai ngồi canh đúng giây phiên tắt. Đổi được bằng TIEN_LIVE_DUOI_PHUT.
 *
 * NÓI THẲNG CHỖ PHÉP NÀY YẾU — đừng đọc con số này như một bằng chứng:
 *
 *   · Đây là TRÙNG KHUNG GIỜ, không phải nhân quả. Lead đến trong lúc đang
 *     LIVE có thể do quảng cáo, do bài đăng hôm trước, hoặc do người quen giới
 *     thiệu. Buổi LIVE chỉ là thứ diễn ra cùng lúc.
 *   · Tourwell chỉ phân biệt được tới NỀN TẢNG (một nhãn nguồn cho cả trang).
 *     Hai kênh cùng một nền tảng LIVE cùng giờ thì không tách được — cả hai
 *     phiên sẽ nhận chung một rổ lead, nên tránh xếp trùng giờ.
 *   · Hai phiên cùng nền tảng chồng giờ thì lead về phiên BẮT ĐẦU MUỘN HƠN —
 *     phiên đang chạy tại thời điểm đó. Một lead không bao giờ đếm hai lần,
 *     một đơn cũng vậy.
 *   · Đơn tạo TRƯỚC lead thì bỏ: khách cũ quay lại mua, buổi LIVE hôm nay
 *     không sinh ra doanh thu của hôm qua. Cùng luật với sync/roas.js bên app
 *     quảng cáo.
 *   · Doanh thu còn chạy sau khi phiên tắt (lead hôm nay chốt đơn tuần sau),
 *     nên mỗi lượt đồng bộ tính LẠI cả khoảng chứ không cộng dồn.
 *
 * Tourwell chặn 60 yêu cầu/phút và BỎ QUA `per_page` — luôn 25 dòng một trang.
 * Một tháng lead ≈ 10 trang, đơn ≈ 25 trang, nên một lượt gắn mất khoảng một
 * phút. Đó là lý do việc này chạy theo lượt đồng bộ chứ không chạy mỗi lần mở
 * tab LIVE.
 */
const { docCauHinh } = require('../lark-chung/tourwell');
const { request, scrub, hideSecret } = require('./sync/http');
const store = require('./store');

const NHAN = 'Tourwell';
const MAX_TRANG = 200;

/* Giãn nhịp Ở MỨC MODULE chứ không trong từng vòng lặp: hai việc chạy chồng
 * nhau mà mỗi việc tự giãn thì cộng lại vẫn vượt trần của Tourwell. Cùng lý do
 * và cùng con số với lark-ads-manager/sync/tourwellapi.js. */
const GIAN_MS = Number(process.env.TOURWELL_GIAN_MS || 1500);
const CHO_429_MS = Number(process.env.TOURWELL_CHO_429_MS || 70000);
const DUOI_PHUT = Number(process.env.TIEN_LIVE_DUOI_PHUT || 120);

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

let hangDoi = Promise.resolve();
let lucCuoi = 0;
function xepHang(viec) {
  const kq = hangDoi.then(async () => {
    const cach = Date.now() - lucCuoi;
    if (cach < GIAN_MS) await nghi(GIAN_MS - cach);
    lucCuoi = Date.now();
    return viec();
  });
  hangDoi = kq.then(() => {}, () => {});
  return kq;
}

/* ---------------------------------------------------------------- đọc số ---- */

function chu(v) {
  if (v == null) return '';
  if (typeof v === 'object') return chu(v.name || v.title || v.code || '');
  return String(v).trim();
}

/** Tiền Tourwell: số, chuỗi "40,000,000", hoặc {foreign,base}. Đọc sai là cả
 *  cột về 0 mà không có lỗi nào — nên dò cả ba dạng. */
function tien(v) {
  if (v == null) return 0;
  if (typeof v === 'object') return tien(v.base != null ? v.base : v.foreign);
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' cho tham số `created_at` của Tourwell. */
function ngayTW(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * Mốc thời gian → mili giây. Chịu được CẢ HAI dạng:
 *   · số  — Base trả datetime bằng epoch ms
 *   · chuỗi ISO có múi giờ — Tourwell trả '2026-09-21T15:26:43+07:00'
 * Date.parse(một con số) trả NaN, nên thiếu nhánh đầu là mọi phiên đọc từ Base
 * đều rơi ra ngoài khung mà không báo gì.
 */
function moc(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  if (/^\d+$/.test(String(v))) return Number(v);
  return Date.parse(String(v));
}

/** Nhãn nguồn của Tourwell → tên nền tảng dùng trong Base. */
function nenTangTuNguon(s) {
  const t = String(s || '').toLowerCase();
  if (/tiktok|tik tok/.test(t)) return 'TikTok';
  if (/facebook|fanpage|\bfb\b/.test(t)) return 'Facebook';
  if (/instagram|\big\b/.test(t)) return 'Instagram';
  if (/zalo/.test(t)) return 'Zalo OA';
  return '';
}

/** Đơn đã huỷ thì không phải doanh thu. Tiếng Việt bỏ dấu hai kiểu — "hủy" và
 *  "huỷ" — nên bắt cả hai; bỏ sót là số phồng lên mà không ai biết. */
function laHuy(s) {
  return /h[uùủụũ][yỷýỳỵ]|cancel/i.test(String(s || ''));
}

async function goi(xt, duong, thamSo = {}) {
  const q = Object.entries(thamSo)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${xt.host}${duong}${q ? '?' + q : ''}`;
  const motLan = () => request(url, {
    method: 'GET',
    label: `${NHAN} ${duong}`,
    retries: 1,
    headers: { Authorization: `Bearer ${xt.token}`, Accept: 'application/json' },
  });

  let r = await xepHang(motLan);
  if (r.status === 429) {
    const noi = Number(r.headers && (r.headers.get('retry-after') || r.headers.get('Retry-After')));
    await nghi(Math.min(Number.isFinite(noi) && noi > 0 ? (noi + 2) * 1000 : 62000, CHO_429_MS));
    r = await xepHang(motLan);
  }
  if (r.status === 429) {
    throw new Error('Tourwell đang chặn vì quá nhiều yêu cầu (429). Để yên vài phút rồi thử lại.');
  }
  if (r.status === 401) {
    throw new Error('Tourwell từ chối token (401). Lấy lại ở Cấu hình → Quản lý tài khoản '
      + '→ tài khoản "Api Official", rồi ghi vào lark-chung/tourwell.json.');
  }
  let json = null;
  try { json = JSON.parse(r.text); } catch (_) { /* xử ở dưới */ }
  if (!r.ok || !json) {
    throw new Error(`${NHAN} ${duong}: HTTP ${r.status} — ${scrub(String(r.text || '')).slice(0, 200)}`);
  }
  return json;
}

/** Duyệt hết các trang. Tourwell bỏ qua `per_page`, luôn 25 dòng/trang. */
async function duyetTrang(xt, duong, thamSo, log) {
  const rows = [];
  let tongTrang = null;
  for (let trang = 1; trang <= MAX_TRANG; trang++) {
    const res = await goi(xt, duong, { ...thamSo, page: trang });
    const lo = (res && (res.data || res.items)) || [];
    if (!Array.isArray(lo) || !lo.length) break;
    rows.push(...lo);
    const meta = (res && res.meta) || {};
    if (tongTrang == null && Number(meta.last_page) > 0) tongTrang = Number(meta.last_page);
    if (tongTrang != null && trang >= tongTrang) break;
    if (tongTrang == null && lo.length < 25) break;
    if (trang % 5 === 0) log(`  ${duong}: ${rows.length} dòng${tongTrang ? `, trang ${trang}/${tongTrang}` : ''}`);
  }
  log(`  ${duong}: ${rows.length} dòng`);
  return rows;
}

/** Lead trong khoảng, kèm GIỜ và nền tảng. */
async function docLead(xt, from, to, log) {
  const tho = await duyetTrang(xt, '/api/v1/leads',
    { created_at: `${ngayTW(from)} - ${ngayTW(to)}` }, log);
  return tho.map((r) => ({
    ma: chu(r.code),
    luc: moc(r.created_at_iso || r.created_at_timestamp),
    nenTang: nenTangTuNguon(chu(r.source)),
    nguon: chu(r.source),
    khach: chu(r.customer && r.customer.name),
    donHang: (Array.isArray(r.orders) ? r.orders : []).map((o) => chu(o.code)).filter(Boolean),
  })).filter((r) => r.ma && Number.isFinite(r.luc));
}

/** Đơn trong khoảng, kèm GIỜ và tiền. */
async function docDon(xt, from, to, log) {
  const tho = await duyetTrang(xt, '/api/v1/orders',
    { created_at: `${ngayTW(from)} - ${ngayTW(to)}` }, log);
  return tho.map((r) => ({
    ma: chu(r.code),
    luc: moc(r.created_at_iso),
    tien: tien(r.total_payment),
    thu: tien(r.total_paid),
    trangThai: chu(r.status),
    huy: laHuy(chu(r.status)),
  })).filter((r) => r.ma);
}

/* ------------------------------------------------------------- phép gắn ---- */

/**
 * Khung giờ của một phiên: [bắt đầu … kết thúc + đuôi].
 * Không có giờ kết thúc thì lấy số phút đã ghi; không có nốt thì coi là 3 giờ —
 * đủ dài cho một buổi bán hàng, đủ ngắn để không nuốt cả buổi tối.
 */
function khungPhien(live, duoiPhut = DUOI_PHUT) {
  const tu = moc(live.start);
  if (!Number.isFinite(tu)) return null;
  let den = moc(live.end);
  if (!Number.isFinite(den) || den < tu) {
    const phut = Number(live.minutes) > 0 ? Number(live.minutes) : 180;
    den = tu + phut * 60000;
  }
  return { tu, den: den + duoiPhut * 60000 };
}

/**
 * Gắn lead/đơn vào phiên. HÀM THUẦN — không gọi mạng, để test được.
 *
 * @returns Map(khoá phiên → { soLead, soDon, doanhThu, maLead })
 */
function gan({ lives = [], leads = [], dons = [], duoiPhut = DUOI_PHUT } = {}) {
  const kq = new Map();
  const khung = new Map();
  const theoNenTang = new Map();

  for (const l of lives) {
    if (!l || !l.key) continue;
    kq.set(l.key, { soLead: 0, soDon: 0, doanhThu: 0, maLead: [] });
    const k = khungPhien(l, duoiPhut);
    if (!k) continue;
    khung.set(l.key, k);
    const nt = l.platform || '';
    if (!theoNenTang.has(nt)) theoNenTang.set(nt, []);
    theoNenTang.get(nt).push(l);
  }

  const donTheoMa = new Map(dons.map((d) => [d.ma, d]));
  const donDaTinh = new Set();   // một đơn chỉ được ghi công một lần

  for (const ld of leads) {
    if (!ld || !Number.isFinite(ld.luc) || !ld.nenTang) continue;
    let chon = null; let chonTu = -Infinity;
    for (const l of (theoNenTang.get(ld.nenTang) || [])) {
      const k = khung.get(l.key);
      if (!k || ld.luc < k.tu || ld.luc > k.den) continue;
      // Chồng giờ thì về phiên bắt đầu muộn hơn — phiên đang chạy lúc đó.
      if (k.tu > chonTu) { chon = l; chonTu = k.tu; }
    }
    if (!chon) continue;

    const o = kq.get(chon.key);
    o.soLead += 1;
    o.maLead.push(ld.ma);
    for (const ma of (ld.donHang || [])) {
      if (donDaTinh.has(ma)) continue;
      const d = donTheoMa.get(ma);
      if (!d || d.huy) continue;
      // Đơn tạo trước lead là khách cũ quay lại, không phải công của phiên này.
      if (Number.isFinite(d.luc) && d.luc < ld.luc) continue;
      donDaTinh.add(ma);
      o.soDon += 1;
      o.doanhThu += d.tien;
    }
  }
  return kq;
}

/* ------------------------------------------------------------- điều phối ---- */

/**
 * Tính lại tiền cho mọi phiên LIVE trong khoảng rồi ghi lên Base.
 *
 * Ghi ĐÈ cả ba cột kể cả khi ra 0 — vì đây là phép tính LẠI, không phải cộng
 * thêm. Phiên nào không có lead nào thì 0 là câu trả lời đúng, để nguyên số cũ
 * mới là nói dối.
 */
async function ganTien({ from, to, log = () => {} } = {}) {
  const xt = docCauHinh();
  if (!xt.bat) {
    return { bo: true, lyDo: 'Chưa có token Open API của Tourwell — chưa gắn được tiền cho phiên LIVE.' };
  }
  hideSecret(xt.token);

  const d = await store.tai(true);
  const lives = (d.lives || []).filter((l) => l.date && l.date >= from && l.date <= to);
  if (!lives.length) return { bo: true, lyDo: 'Không có phiên LIVE nào trong khoảng này.' };

  /* Đơn phải lấy RỘNG HƠN khoảng xem: lead của phiên hôm nay có thể chốt đơn
   * tuần sau. Lấy tới hôm nay là đủ — không có đơn nào của tương lai. */
  const denDon = store.homNay();

  log(`Gắn tiền cho ${lives.length} phiên LIVE (${from} → ${to})`);
  const leads = await docLead(xt, from, to, log);
  const dons = await docDon(xt, from, denDon, log);
  log(`  ${leads.length} lead, ${dons.length} đơn`);

  const map = gan({ lives, leads, dons });
  const f = store.T.live.f;
  const rows = [];
  for (const l of lives) {
    const o = map.get(l.key);
    if (!o) continue;
    rows.push({
      [f.key]: l.key,
      [f.leads]: o.soLead,
      [f.orders]: o.soDon,
      [f.revenue]: o.doanhThu,
    });
  }
  const ghi = await store.ghiTheoKhoa('live', rows, (x) => x[f.key]);

  const tongTien = rows.reduce((s, r) => s + (r[f.revenue] || 0), 0);
  const tongLead = rows.reduce((s, r) => s + (r[f.leads] || 0), 0);
  log(`  gắn được ${tongLead} lead · ${tongTien.toLocaleString('vi-VN')}đ`);
  return {
    bo: false,
    soPhien: rows.length,
    soLead: leads.length,
    soDon: dons.length,
    ganLead: tongLead,
    doanhThu: tongTien,
    ...ghi,
  };
}

module.exports = {
  ganTien, gan, khungPhien, nenTangTuNguon, laHuy, moc, tien, ngayTW,
  docLead, docDon, DUOI_PHUT,
};
