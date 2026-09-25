'use strict';
/**
 * Gom lỗi kết nối API của hub + mọi app con rồi nhắn anh Hùng NGAY (25/09/2026).
 *
 * Nguồn sự kiện: lark-chung/canh-api.js (bọc fetch/https trong từng tiến trình). App
 * con POST về /_noi-bo/loi-api kèm khoá ngẫu nhiên hub cấp lúc bật (HUB_KHOA_NOI_BO) —
 * chỉ nhận từ 127.0.0.1, không phải cửa ra Internet.
 *
 * GOM ĐỂ KHỎI NHIỄU:
 *   - lỗi đầu tiên → chờ 45 giây gom các lỗi đi kèm (một sự cố thường nổ một chùm) →
 *     MỘT thẻ;
 *   - cùng một khoá (app · dịch vụ · kiểu lỗi · mã) đã báo thì im 60 phút, chỉ đếm; hết
 *     60 phút mà vẫn lỗi thì báo lại kèm "lặp lại N lần".
 *
 * NGƯỜI NHẬN: open_id DƯỚI APP MARKETING HUB lấy từ bảng Phân quyền (cột open_id hub tự
 * vá khi người đó đăng nhập) — tìm theo tên HUB_BAO_LOI_TEN (mặc định "Lê Văn Hùng"),
 * hoặc khai thẳng HUB_BAO_LOI_ID. Lưu trên Base nên deploy xong vẫn biết gửi ai.
 * Tắt: HUB_BAO_LOI_TAT=1.
 */
const crypto = require('crypto');
const canh = require('../lark-chung/canh-api');

const KHOA = crypto.randomBytes(24).toString('hex');
const GOM_MS = 45 * 1000, IM_MS = 60 * 60 * 1000;
const TEN = process.env.HUB_BAO_LOI_TEN || 'Lê Văn Hùng';
const LECH = 7 * 3600000;

const DICH_VU = [
  [/open\.(larksuite\.com|feishu\.cn)$/, 'Lark Open API'],
  [/tourwell/, 'Tourwell'],
  [/pages\.fm$|pancake/, 'Pancake / POS'],
  [/graph\.facebook\.com$|facebook/, 'Facebook'],
  [/tiktok/, 'TikTok'],
  [/googleapis\.com$|google/, 'Google'],
  [/osrm/, 'OSRM (dẫn đường)'],
  [/openfreemap|maptiler/, 'Bản đồ nền'],
  [/zalo/, 'Zalo'],
  [/instagram/, 'Instagram'],
];
const tenDichVu = (h) => { for (const [re, t] of DICH_VU) if (re.test(h)) return t; return h; };

/* gợi ý việc cần làm theo kiểu lỗi */
function goiY(s) {
  const ma = Number(s.ma) || 0;
  if (s.status === 401 || /^9999166[1-8]$/.test(String(ma)) || ma === 190) return 'Token / khoá truy cập hết hạn hoặc sai — cần cấp lại.';
  if (s.status === 403 || [1254302, 1254301, 91403, 99991672, 99991679, 40004].includes(ma)) return 'Thiếu quyền — app chưa được cấp quyền hoặc chưa được thêm vào Base/nhóm.';
  if (s.status === 429 || [99991400, 1254290].includes(ma)) return 'Gọi quá dày, dịch vụ đang chặn tạm — thường tự hết sau vài phút.';
  if (s.kieu === 'mang') return 'Không nối được tới dịch vụ (mạng/DNS/hết giờ chờ) — thường tự hết; kéo dài thì dịch vụ đang sập.';
  if (s.status >= 500) return 'Máy chủ của dịch vụ đang lỗi — thường tự hết.';
  return '';
}

let guiTin = null, tenApp = (id) => id, docQuyen = null, urlHub = 'https://mkt-hub-w6hi.onrender.com';
const cho = new Map();                                    // khoá → nhóm đang gom
const daBao = new Map();                                  // khoá → { luc, dem }
const ganDay = [];                                        // 100 sự kiện gần nhất cho trang xem
let hen = null;

const khoaCua = (s) => [s.app, s.host, s.kieu, s.status || '', s.ma || ''].join('|');
const gio = (t) => { const d = new Date(t + LECH); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' ' + String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0'); };

function nhan(s) {
  if (!s || !s.host) return;
  ganDay.push(s); if (ganDay.length > 100) ganDay.shift();
  const k = khoaCua(s);
  const cu = daBao.get(k);
  if (cu && s.luc - cu.luc < IM_MS) { cu.dem++; return; }
  const g = cho.get(k);
  if (g) { g.dem++; g.cuoi = s.luc; g.duong.add(s.duong); if (s.loi) g.loi = s.loi; }
  else cho.set(k, { s, dem: 1, dau: s.luc, cuoi: s.luc, duong: new Set([s.duong]), loi: s.loi, lapLai: cu ? cu.dem : 0 });
  if (!hen) hen = setTimeout(xa, GOM_MS);
}

function theLoi(nhom) {
  const el = [];
  nhom.forEach((g, i) => {
    const s = g.s;
    if (i) el.push({ tag: 'hr' });
    const loiChu = s.kieu === 'mang' ? 'Không nối được' + (g.loi ? ' · ' + g.loi : '')
      : 'HTTP ' + (s.status || '?') + (s.ma ? ' · mã ' + s.ma : '') + (g.loi ? ' · ' + g.loi : '');
    el.push({ tag: 'markdown', content: '**' + tenApp(s.app) + '**  →  **' + tenDichVu(s.host) + '**' + (g.dem > 1 ? '  ·  ' + g.dem + ' lần' : '') + (g.lapLai ? '  ·  <font color="red">lặp lại ' + g.lapLai + ' lần trong 1 giờ qua</font>' : '') +
      '\n<font color="red">' + loiChu + '</font>' });
    el.push({ tag: 'div', fields: [
      { is_short: true, text: { tag: 'lark_md', content: '**API**\n' + s.pt + ' ' + s.host + [...g.duong].slice(0, 2).join(', ') } },
      { is_short: true, text: { tag: 'lark_md', content: '**Lúc**\n' + gio(g.dau) + (g.cuoi - g.dau > 60000 ? ' → ' + gio(g.cuoi).slice(0, 5) : '') } },
    ] });
    const gy = goiY(s);
    if (gy) el.push({ tag: 'note', elements: [{ tag: 'plain_text', content: gy }] });
  });
  el.push({ tag: 'action', actions: [{ tag: 'button', type: 'primary', text: { tag: 'plain_text', content: 'Mở Marketing Hub' }, url: urlHub + '/#/' }] });
  const soApp = new Set(nhom.map((g) => g.s.app)).size;
  return {
    config: { wide_screen_mode: true },
    header: { template: 'red', title: { tag: 'plain_text', content: 'Lỗi kết nối API · ' + (nhom.length === 1 ? tenApp(nhom[0].s.app) + ' → ' + tenDichVu(nhom[0].s.host) : nhom.length + ' lỗi ở ' + soApp + ' app') } },
    elements: el,
  };
}

async function nguoiNhan() {
  if (process.env.HUB_BAO_LOI_ID) return process.env.HUB_BAO_LOI_ID;
  if (!docQuyen) return null;
  const chuan = (x) => String(x || '').normalize('NFC').trim().toLowerCase();
  const ds = await docQuyen();
  const h = ds.find((r) => r.openId && chuan(r.nguoi) === chuan(TEN));
  return h ? h.openId : null;
}

async function xa() {
  hen = null;
  const nhom = [...cho.values()];
  cho.clear();
  if (!nhom.length) return;
  const luc = Date.now();
  nhom.forEach((g) => daBao.set(khoaCua(g.s), { luc, dem: 0 }));
  const card = theLoi(nhom);
  await canh.imLang(async () => {
    try {
      const id = await nguoiNhan();
      if (!id || !guiTin) { console.log('[LỖI API] chưa gửi được (thiếu người nhận hoặc khoá app):', nhom.map((g) => khoaCua(g.s)).join(' ; ')); return; }
      const r = await guiTin({ userId: id, card });
      console.log('[LỖI API]', r && r.ok ? 'đã báo ' + nhom.length + ' lỗi' : 'gửi hỏng: ' + (r && r.loi), '·', nhom.map((g) => khoaCua(g.s)).join(' ; '));
    } catch (e) { console.error('[LỖI API] gửi hỏng:', e.message); }
  });
}

/**
 * Bật. dep = { cfg, tenApp(id), docQuyen(): [{nguoi, openId}] , urlHub }.
 * Trả về env cần truyền cho app con.
 */
function bat(dep) {
  if (process.env.HUB_BAO_LOI_TAT === '1') return {};
  if (dep.tenApp) tenApp = dep.tenApp;
  if (dep.docQuyen) docQuyen = dep.docQuyen;
  if (dep.urlHub) urlHub = dep.urlHub;
  const c = dep.cfg || {};
  if (c.appId && c.appSecret) {
    const t = require('../lark-chung/tin-lark').tao({ appId: c.appId, appSecret: c.appSecret, apiHost: c.apiHost, tenApp: 'Marketing Hub' });
    guiTin = (o) => t.gui(o);
  }
  canh.cai(nhan);                                         // lỗi của chính hub
  return {
    HUB_BAO_LOI_URL: 'http://127.0.0.1:' + c.port + '/_noi-bo/loi-api',
    HUB_GUI_TIN_URL: 'http://127.0.0.1:' + c.port + '/_noi-bo/gui-tin',
    HUB_KHOA_NOI_BO: KHOA,
    /* gạch chéo xuôi: trong NODE_OPTIONS có ngoặc kép thì "\" là ký tự thoát — để
     * nguyên đường dẫn Windows là mọi app con chết ngay lúc nạp (đã gặp khi thử). */
    NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ' --require "' + require.resolve('../lark-chung/canh-api').replace(/\\/g, '/') + '"').trim(),
  };
}

/** Xử lý POST /_noi-bo/loi-api. Trả true nếu đã xử lý request. */
function xuLy(req, res, p) {
  if (p !== '/_noi-bo/loi-api' && p !== '/_noi-bo/gui-tin') return false;
  const tuMay = /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(req.socket.remoteAddress || '');
  if (req.method !== 'POST' || !tuMay || req.headers['x-hub-khoa'] !== KHOA) { res.writeHead(404); res.end(); return true; }
  const tran = p === '/_noi-bo/gui-tin' ? 200000 : 8192;
  let than = '';
  req.on('data', (d) => { than += d; if (than.length > tran) req.destroy(); });
  req.on('end', async () => {
    if (p === '/_noi-bo/loi-api') { try { nhan(JSON.parse(than)); } catch (_) { /* bỏ */ } res.writeHead(204); return res.end(); }
    /* app con nhờ hub gửi một thẻ cho anh Hùng (lark-chung/gui-anh-hung.js) */
    let kq;
    try { kq = await guiAnhHung(JSON.parse(than)); } catch (e) { kq = { ok: false, loi: e.message }; }
    res.writeHead(kq.ok ? 200 : 502, { 'content-type': 'application/json' });
    res.end(JSON.stringify(kq));
  });
  return true;
}

async function guiAnhHung({ card, khoa }) {
  if (!card || typeof card !== 'object') return { ok: false, loi: 'thiếu thẻ' };
  if (!guiTin) return { ok: false, loi: 'hub chưa có khoá app Marketing Hub' };
  const id = await nguoiNhan();
  if (!id) return { ok: false, loi: 'không tìm thấy "' + TEN + '" có open_id trong bảng Phân quyền' };
  return canh.imLang(() => guiTin({ userId: id, card, khoa }));
}

module.exports = { bat, xuLy, nhan, theLoi, ganDay: () => ganDay.slice().reverse(), _xa: xa };
