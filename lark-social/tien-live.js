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
 *   hội thoại MỚI trên Pancake mở trong khung đó   → Tin nhắn
 *        ↓
 *   lead Tourwell rơi vào khung đó, đúng nền tảng  → Lead
 *        ↓
 *   đơn của cùng KHÁCH (customer.code), tạo sau lead ấy → Đơn · Doanh thu
 *
 * BỐN CỘT, BỐN KHOẢNG CÁCH TỚI BUỔI LIVE. Cột **Tin nhắn** gần nhất: mô hình
 * LIVE của anh Hùng là tư vấn rồi bảo khách bấm nút mũi tên cam để nhắn tin,
 * mà cú bấm đó mở một hội thoại trên Pancake kèm dấu thời gian — đó chính là
 * dấu vết của buổi LIVE, không phải suy đoán. Ba cột sau xa dần: lead chỉ sinh
 * ra sau khi sale nhập, đơn thì có thể vài ngày sau. Nên đọc bảng từ trái sang
 * phải là đọc từ chắc chắn sang phỏng đoán.
 *
 * NỐI LEAD VỚI ĐƠN BẰNG MÃ KHÁCH, KHÔNG BẰNG MÃ ĐƠN. Tài liệu và cả
 * lark-ads-manager/sync/tourwellapi.js đều đọc `orders[]` trong bản lead — dò
 * thật 21/09/2026 thì mảng đó RỖNG (0/25 dòng của một trang tháng 8 có đơn).
 * Tin vào nó thì cột Doanh thu im lặng bằng 0 mãi mãi, mà không có lỗi nào.
 * `customer.code` thì có ở 100% cả lead lẫn đơn — đó mới là khoá dùng được.
 * Một đơn về lead GẦN NHẤT TRƯỚC NÓ của cùng khách: khách quay lại nhiều lần
 * thì đơn thuộc về lần liên hệ sinh ra nó, không phải lần đầu tiên.
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
 *   · Đơn tạo TRƯỚC mọi lead của khách đó thì bỏ: buổi LIVE hôm nay không sinh
 *     ra doanh thu của hôm qua. Cùng luật với sync/roas.js bên app quảng cáo.
 *   · Lead phải kéo RỘNG BẰNG đơn (tới hôm nay), không chỉ trong khoảng xem.
 *     Thiếu lead tháng sau thì đơn tháng sau bị gán nhầm về lead của buổi LIVE
 *     tháng này — sai theo hướng thổi phồng, đúng hướng dễ tin nhất.
 *   · Doanh thu còn chạy sau khi phiên tắt (lead hôm nay chốt đơn tuần sau),
 *     nên mỗi lượt đồng bộ tính LẠI cả khoảng chứ không cộng dồn.
 *
 * Tourwell chặn 60 yêu cầu/phút và BỎ QUA `per_page` — luôn 25 dòng một trang.
 * Một tháng lead ≈ 10 trang, đơn ≈ 25 trang, nên một lượt gắn mất khoảng một
 * phút. Đó là lý do việc này chạy theo lượt đồng bộ chứ không chạy mỗi lần mở
 * tab LIVE.
 */
const fs = require('fs');
const path = require('path');
const { docCauHinh } = require('../lark-chung/tourwell');
const { request, scrub, hideSecret } = require('./sync/http');
const store = require('./store');

/* Mượn thẳng bộ đọc Pancake của app quảng cáo thay vì chép sang đây. Nó đã lo
 * phân trang bằng con trỏ, giãn nhịp 5 yêu cầu/giây mỗi page, và chuẩn hoá số
 * điện thoại — chép lại là nuôi hai bản rồi sửa một bên, bên kia sai lặng lẽ.
 * Hai app nằm chung một kho và deploy chung một lần, nên require chéo ở đây là
 * thật chứ không phải giả định. */
const pancake = require('../lark-ads-manager/sync/pancake');

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

/**
 * Mốc thời gian của PANCAKE → mili giây. Phải có riêng, không dùng chung moc().
 *
 * Pancake trả `inserted_at` dạng `2026-09-21T13:34:45.860818` — **không có `Z`,
 * không có `+07:00`**, mà giá trị thì là giờ UTC (đã đối chiếu: hội thoại mới
 * nhất 13:34 trong khi đồng hồ UTC lúc đó là 13:57).
 *
 * Chuỗi ISO có giờ mà thiếu phần múi giờ thì JavaScript hiểu là GIỜ MÁY. Nên
 * `Date.parse()` trần ra kết quả khác nhau tuỳ máy: đúng trên Render (UTC),
 * lệch đúng 7 tiếng trên máy ở Việt Nam. Đó là kiểu lỗi tệ nhất — chạy thử ở
 * nhà thấy sai, lên server lại thấy đúng, rồi không ai tin phép đo nào nữa.
 * Gắn 'Z' vào là hết, và gắn có điều kiện để chuỗi nào đã có múi giờ thì không
 * bị đụng tới.
 */
function mocUTC(v) {
  const t = String(v == null ? '' : v).trim();
  if (!t) return NaN;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) return Date.parse(t);
  return Date.parse(t + 'Z');
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

/**
 * Đơn do CHÍNH hệ thống mình tạo, không phải khách mua.
 *
 * `lark-chung/tourwell.js` tạo đơn chi phí tác nghiệp qua Open API, và mọi đơn
 * tạo bằng API đều mang người tạo "Api Official". Chúng nằm chung trong
 * `GET /api/v1/orders` với đơn thật. Không lọc thì một khoản chi của phòng có
 * thể hiện ra thành doanh thu của buổi LIVE — sai theo đúng hướng người ta
 * muốn tin, nên là kiểu sai nguy hiểm nhất.
 */
function laNoiBo(nguoiTao) {
  return /api\s*official/i.test(String(nguoiTao || ''));
}

/**
 * Các page Pancake đã khai bên app quảng cáo.
 *
 * Đọc đúng hai chỗ mà app ấy đọc, theo đúng thứ tự: tệp `ket-noi.json` (máy cá
 * nhân) rồi biến `ADS_CONNECT_JSON` (Render, vì ổ đĩa ở đó là tạm). Cố ý KHÔNG
 * bắt anh Hùng khai Pancake lần thứ hai cho app này — một token nằm hai chỗ là
 * một ngày nào đó hai chỗ lệch nhau.
 */
function pagePancake() {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'lark-ads-manager', 'ket-noi.json'), 'utf8'));
  } catch (_) { raw = null; }
  const coPage = (o) => o && o.pancake && Array.isArray(o.pancake.pages)
    && o.pancake.pages.some((p) => p && p.pageId && p.token);
  if (!coPage(raw) && process.env.ADS_CONNECT_JSON) {
    try { raw = JSON.parse(process.env.ADS_CONNECT_JSON); } catch (_) { /* giữ raw cũ */ }
  }
  if (!coPage(raw)) return [];
  if (raw.pancake.enabled === false) return [];
  return raw.pancake.pages.filter((p) => p && p.pageId && p.token);
}

/**
 * Hội thoại Pancake trong khoảng. Trả về mốc thời gian MỞ hội thoại.
 *
 * Đếm hội thoại MỞ MỚI chứ không đếm tin nhắn: `inserted_at` là lúc cuộc trò
 * chuyện với khách đó bắt đầu, tức đúng lúc người ta bấm nút. Khách cũ nhắn
 * lại thì không mở hội thoại mới nên KHÔNG được đếm — cột này là "bao nhiêu
 * người mới bấm vào", không phải "bao nhiêu tin nhắn". Nói rõ vì hai thứ đó
 * nghe giống nhau mà khác hẳn.
 */
async function docHoiThoai(from, to, log = () => {}) {
  const pages = pagePancake();
  if (!pages.length) return { rows: [], boQua: 'Chưa khai Pancake bên app quảng cáo' };

  /* Nới ra mỗi đầu MỘT NGÀY rồi tự lọc lại theo khung giờ.
   *
   * fetchConversations() lọc theo NGÀY bằng ngayVN() của app quảng cáo, mà hàm
   * đó lại Date.parse() thẳng cái chuỗi thiếu múi giờ — xem mocUTC() ở trên.
   * Hệ quả: hội thoại quanh nửa đêm có thể bị xếp nhầm sang ngày bên cạnh và
   * rơi ra ngoài. Nới một ngày là phép lọc thật nằm ở đây, trong gan(), nơi
   * giờ đã được hiểu đúng — không phụ thuộc app kia sửa hay chưa. */
  const tu = store.themNgay(from, -1);
  const den = store.themNgay(to, 1);

  const rows = [];
  for (const p of pages) {
    try {
      const r = await pancake.fetchConversations(p, tu, den, log);
      (r.rows || []).forEach((c) => rows.push({
        id: c.id,
        nenTang: c.platform || '',
        luc: mocUTC(c.insertedAt),
      }));
    } catch (e) {
      log('  ! Pancake ' + (p.label || p.pageId) + ': ' + e.message);
    }
  }
  return { rows: rows.filter((c) => Number.isFinite(c.luc)) };
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
    kh: chu(r.customer && r.customer.code),
    khach: chu(r.customer && r.customer.name),
  })).filter((r) => r.ma && Number.isFinite(r.luc));
}

/** Đơn trong khoảng, kèm GIỜ và tiền. */
async function docDon(xt, from, to, log) {
  const tho = await duyetTrang(xt, '/api/v1/orders',
    { created_at: `${ngayTW(from)} - ${ngayTW(to)}` }, log);
  return tho.map((r) => ({
    ma: chu(r.code),
    kh: chu(r.customer && r.customer.code),
    luc: moc(r.created_at_iso),
    tien: tien(r.total_payment),
    thu: tien(r.total_paid),
    trangThai: chu(r.status),
    huy: laHuy(chu(r.status)),
    noiBo: laNoiBo(chu(r.creator)),
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
function gan({ lives = [], leads = [], dons = [], hoiThoai = [], duoiPhut = DUOI_PHUT } = {}) {
  const kq = new Map();
  const khung = new Map();
  const theoNenTang = new Map();

  for (const l of lives) {
    if (!l || !l.key) continue;
    kq.set(l.key, { soTinNhan: 0, soLead: 0, soDon: 0, doanhThu: 0, maLead: [] });
    const k = khungPhien(l, duoiPhut);
    if (!k) continue;
    khung.set(l.key, k);
    const nt = l.platform || '';
    if (!theoNenTang.has(nt)) theoNenTang.set(nt, []);
    theoNenTang.get(nt).push(l);
  }

  /* Chọn phiên cho một mốc thời gian + nền tảng. Chồng giờ thì về phiên BẮT
   * ĐẦU MUỘN HƠN — phiên đang chạy tại thời điểm đó. Dùng chung cho cả hội
   * thoại lẫn lead để hai cột không bao giờ gắn theo hai luật khác nhau. */
  const chonPhien = (luc, nenTang) => {
    let chon = null; let chonTu = -Infinity;
    for (const l of (theoNenTang.get(nenTang) || [])) {
      const k = khung.get(l.key);
      if (!k || luc < k.tu || luc > k.den) continue;
      if (k.tu > chonTu) { chon = l; chonTu = k.tu; }
    }
    return chon;
  };

  /* Bước 0 — cú bấm nút: hội thoại mở trong khung giờ phiên. */
  for (const c of hoiThoai) {
    if (!c || !Number.isFinite(c.luc) || !c.nenTang) continue;
    const chon = chonPhien(c.luc, c.nenTang);
    if (chon) kq.get(chon.key).soTinNhan += 1;
  }

  /* Bước 1 — lead nào thuộc phiên nào. */
  const phienCuaLead = new Map();
  for (const ld of leads) {
    if (!ld || !Number.isFinite(ld.luc) || !ld.nenTang) continue;
    const chon = chonPhien(ld.luc, ld.nenTang);
    if (!chon) continue;
    const o = kq.get(chon.key);
    o.soLead += 1;
    o.maLead.push(ld.ma);
    phienCuaLead.set(ld.ma, chon.key);
  }

  /* Bước 2 — mỗi khách một dãy lead xếp theo thời gian, để tìm được "lần liên
   * hệ gần nhất trước khi đặt". Xếp ở đây một lần thay vì quét lại cho từng
   * đơn: một tháng có thể vài trăm lead và vài trăm đơn. */
  const theoKhach = new Map();
  for (const ld of leads) {
    if (!ld || !ld.kh || !Number.isFinite(ld.luc)) continue;
    if (!theoKhach.has(ld.kh)) theoKhach.set(ld.kh, []);
    theoKhach.get(ld.kh).push(ld);
  }
  for (const ds of theoKhach.values()) ds.sort((a, b) => a.luc - b.luc);

  /* Bước 3 — mỗi đơn về lead gần nhất TRƯỚC nó của cùng khách. Duyệt theo đơn
   * nên mỗi đơn chỉ được ghi công đúng một lần, không cần sổ chống trùng. */
  for (const d of dons) {
    if (!d || d.huy || d.noiBo || !d.kh || !Number.isFinite(d.luc)) continue;
    const ds = theoKhach.get(d.kh);
    if (!ds) continue;
    let chon = null;
    for (const ld of ds) {
      if (ld.luc > d.luc) break;
      chon = ld;
    }
    if (!chon) continue;              // đơn có trước mọi lần liên hệ đã biết
    const key = phienCuaLead.get(chon.ma);
    if (!key) continue;               // lead ấy không thuộc phiên LIVE nào
    const o = kq.get(key);
    o.soDon += 1;
    o.doanhThu += d.tien;
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

  /* Kéo RỘNG HƠN khoảng xem, tới hôm nay: lead của phiên hôm nay có thể chốt
   * đơn tuần sau. Và lead phải rộng ĐÚNG BẰNG đơn — nếu chỉ lấy lead trong
   * khoảng xem thì đơn tháng sau của một khách cũ sẽ bị gán nhầm về lead của
   * buổi LIVE tháng này, tức thổi phồng đúng con số người ta muốn tin. */
  const den = store.homNay();

  log(`Gắn tiền cho ${lives.length} phiên LIVE (${from} → ${to}, đọc Tourwell tới ${den})`);
  const leads = await docLead(xt, from, den, log);
  const dons = await docDon(xt, from, den, log);
  /* Hội thoại chỉ cần trong ĐÚNG khoảng xem: một cú bấm nút hoặc rơi vào khung
   * giờ phiên, hoặc không — nó không đến muộn như doanh thu. */
  const ht = await docHoiThoai(from, to, log);
  if (ht.boQua) log('  Tin nhắn: ' + ht.boQua);
  log(`  ${leads.length} lead, ${dons.length} đơn, ${ht.rows.length} hội thoại`);

  const map = gan({ lives, leads, dons, hoiThoai: ht.rows });
  const f = store.T.live.f;
  const rows = [];
  for (const l of lives) {
    const o = map.get(l.key);
    if (!o) continue;
    rows.push({
      [f.key]: l.key,
      [f.messages]: o.soTinNhan,
      [f.leads]: o.soLead,
      [f.orders]: o.soDon,
      [f.revenue]: o.doanhThu,
    });
  }
  const ghi = await store.ghiTheoKhoa('live', rows, (x) => x[f.key]);

  const tongTien = rows.reduce((s, r) => s + (r[f.revenue] || 0), 0);
  const tongLead = rows.reduce((s, r) => s + (r[f.leads] || 0), 0);
  const tongTin = rows.reduce((s, r) => s + (r[f.messages] || 0), 0);
  log(`  gắn được ${tongTin} tin nhắn · ${tongLead} lead · ${tongTien.toLocaleString('vi-VN')}đ`);
  return {
    bo: false,
    soPhien: rows.length,
    ganTinNhan: tongTin,
    soLead: leads.length,
    soDon: dons.length,
    ganLead: tongLead,
    doanhThu: tongTien,
    ...ghi,
  };
}

module.exports = {
  ganTien, gan, khungPhien, nenTangTuNguon, laHuy, laNoiBo, moc, mocUTC, tien, ngayTW,
  docLead, docDon, docHoiThoai, pagePancake, DUOI_PHUT,
};
