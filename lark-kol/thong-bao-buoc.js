'use strict';
/**
 * Báo anh Hùng mỗi khi một hợp tác KOL ĐỔI BƯỚC (26/09).
 *
 * Móc ở kho.sua / kho.suaNhieu: MỌI đường đổi bước đều ghi một dòng Lịch sử bước theo
 * cùng mẫu tinh.dongLichSu — "dd/mm hh:mm · <từ> → <đến> · <lý do>" — dù là bấm trong app,
 * tự chuyển theo ngày đi/về (nhac.js), hay tự duyệt khi BGĐ trả lời email (theo-doi-mail.js).
 * Nên chỉ cần đọc dòng CUỐI của lịch sử vừa ghi, không phải sửa từng nơi đổi bước.
 * (Sửa tay thẳng trên Base thì không qua đây — không báo.)
 *
 * Gửi bằng app Marketing Hub, chỉ đích bằng open_id MÀ HUB GỬI XUỐNG (x-hub-user-id) —
 * open_id riêng theo từng app, và email tenant không chắc gắn tài khoản (app Sản phẩm đã đo
 * 26/09: 230001 invalid receive_id). Người nhận = người dùng app KOL qua hub gần nhất (app
 * chỉ anh Hùng dùng), nhớ vào du-lieu/nhan-tin.json. Chưa biết ai → dùng kênh của bộ nhắc
 * (nhac.kenhGui: email cấu hình, hoặc bot lark-cli khi chạy trên máy).
 *
 * Gom 20 giây: một thao tác đổi nhiều bước (vd. vòng tự chuyển theo ngày) ra MỘT tin.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const FILE = path.join(__dirname, 'du-lieu', 'nhan-tin.json');
let nguoi = null;
try { nguoi = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { /* chưa có */ }

/** Ghi nhớ người dùng qua hub (gọi ở aiGoi). Chỉ ghi khi đổi — không ghi đĩa mỗi request. */
function nho(toi) {
  if (!toi || !toi.quaHub || !toi.id || (nguoi && nguoi.id === toi.id)) return;
  nguoi = { id: toi.id, ten: toi.ten || '' };
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(nguoi)); } catch (_) { /* ổ tạm */ }
}

/* dòng lịch sử → { tu, den, ly } (null nếu dòng không phải đổi bước) */
function doc(dong) {
  const m = String(dong || '').match(/^\S+ \S+ · (.+?) → (.+?)(?: · (.*))?$/);
  if (!m || m[1] === m[2]) return null;
  return { tu: m[1].trim(), den: m[2].trim(), ly: (m[3] || '').trim() };
}

let tinApp = null;
/* gửi THẺ; kênh dự phòng của bộ nhắc chỉ nhận chữ nên kèm bản chữ */
async function gui(card, text) {
  const n = cfg.nhac || {};
  if (nguoi && nguoi.id && n.appId && n.appSecret) {
    if (!tinApp) tinApp = require('../lark-chung/tin-lark').tao({ appId: n.appId, appSecret: n.appSecret, apiHost: cfg.apiHost, tenApp: 'Marketing Hub' });
    const r = await tinApp.gui({ userId: nguoi.id, card });
    if (r.ok) return r;
    console.error('[KOL · BÁO BƯỚC] gửi theo open_id hỏng, thử kênh bộ nhắc:', r.loi);
  }
  return require('./nhac').guiTin(text);
}

/* ---------- thẻ ---------- */
const MAU_BUOC = { 'Chờ BGĐ duyệt': 'orange', 'BGĐ đã duyệt': 'green', 'KOL đã xác nhận': 'green', 'Hoàn tất': 'green', 'Đang đi tour': 'turquoise', 'Chờ nhận sản phẩm': 'purple', 'Huỷ': 'red' };
const urlHub = () => (process.env.PUBLIC_URL || process.env.HUB_URL || 'https://mkt-hub-w6hi.onrender.com').replace(/\/+$/, '');

/** Một hợp tác đổi bước → khối thẻ. `ls` = các lần đổi trong đợt gom (lấy đầu → cuối). */
function khoi(T, h, kol, ls) {
  const dau = ls[0], cuoi = ls[ls.length - 1];
  const BUOC = T.BUOC.filter((b) => b !== 'Huỷ');
  const vt = BUOC.indexOf(cuoi.den), lui = T.viTri(cuoi.den) < T.viTri(dau.tu);
  /* thanh tiến độ: ● đã qua · ◉ bước hiện tại · ○ chưa tới */
  const thanh = cuoi.den === 'Huỷ' ? '✕ Đã huỷ' : BUOC.map((b, i) => (i < vt ? '●' : i === vt ? '◉' : '○')).join(' ') + '   ' + (vt + 1) + '/' + BUOC.length;
  const khach = [h.nguoiLon ? h.nguoiLon + ' NL' : '', h.treEm ? h.treEm + ' TE' : '', h.emBe ? h.emBe + ' em bé' : ''].filter(Boolean).join(' + ');
  const chuyen = h.batDau ? T.ddmm(h.batDau) + (h.ketThuc && h.ketThuc !== h.batDau ? ' – ' + T.ddmm(h.ketThuc) : '') : 'chưa có ngày';
  return [
    { tag: 'markdown', content: '**' + (kol ? kol.ten : h.kolTen || '?') + '**  ·  ' + (h.ma || '') + (lui ? '  ·  <font color="red">lùi bước</font>' : '') },
    { tag: 'markdown', content: '<font color="grey">' + dau.tu + '</font>  →  **' + cuoi.den + '**\n' + thanh },
    { tag: 'div', fields: [
      { is_short: true, text: { tag: 'lark_md', content: '**Chuyến đi**\n' + chuyen } },
      { is_short: true, text: { tag: 'lark_md', content: '**Khách**\n' + (khach || '—') } },
    ] },
    ...(cuoi.ly ? [{ tag: 'note', elements: [{ tag: 'plain_text', content: 'Vì sao: ' + cuoi.ly }] }] : []),
    { tag: 'action', actions: [{ tag: 'button', type: 'primary', text: { tag: 'plain_text', content: 'Mở hợp tác' }, url: urlHub() + '/#/m/kol?rec=' + encodeURIComponent(h.id || '') }] },
  ];
}

function theDoiBuoc(T, muc) {
  const mot = muc.length === 1;
  const den = muc[0].ls[muc[0].ls.length - 1].den;
  const el = [];
  muc.forEach((m, i) => { if (i) el.push({ tag: 'hr' }); el.push(...khoi(T, m.h, m.kol, m.ls)); });
  return {
    config: { wide_screen_mode: true },
    header: {
      template: mot ? (MAU_BUOC[den] || 'blue') : 'blue',
      title: { tag: 'plain_text', content: mot ? 'KOL · ' + den : 'KOL · ' + muc.length + ' hợp tác vừa đổi bước' },
    },
    elements: el,
  };
}

const cho = new Map();                                      // id hợp tác → [{tu, den, ly}]
let hen = null;

/** Gọi sau khi ghi Base xong. `obj` là đúng đối tượng vừa ghi vào hợp tác `id`. */
function sauKhiGhi(id, obj) {
  if (process.env.KOL_BAO_BUOC_TAT === '1' || !obj || !obj.buoc || !obj.lichSu) return;
  const d = doc(String(obj.lichSu).split('\n').pop());
  if (!d || d.den !== obj.buoc) return;
  if (!cho.has(id)) cho.set(id, []);
  cho.get(id).push(d);
  if (!hen) hen = setTimeout(xa, 20000);
}

async function xa() {
  hen = null;
  const ds = [...cho.entries()];
  cho.clear();
  if (!ds.length) return;
  try {
    const kho = require('./kho');
    const dl = await kho.tatCa({ moi: true });
    const kolTheoId = new Map((dl.kol || []).map((k) => [k.id, k]));
    const T = require('./tinh');
    const dong = ds.map(([id, ls]) => {
      const h = (dl.hopTac || []).find((x) => x.id === id) || { ma: id };
      const kol = kolTheoId.get(h.kol);
      const dau = ls[0], cuoi = ls[ls.length - 1];
      const ngay = h.batDau ? ' · đi ' + T.ddmm(h.batDau) + (h.ketThuc ? '–' + T.ddmm(h.ketThuc) : '') : '';
      return '• ' + (kol ? kol.ten : h.kolTen || '?') + ' (' + (h.ma || '') + ')' + ngay + '\n   ' + dau.tu + ' → ' + cuoi.den +
        (cuoi.ly ? '  (' + cuoi.ly + ')' : '');
    });
    const text = 'KOL · ' + (ds.length === 1 ? 'hợp tác vừa đổi bước' : ds.length + ' hợp tác vừa đổi bước') + '\n\n' + dong.join('\n') + '\n\nMở app KOL: ' + urlHub() + '/#/m/kol';
    const muc = ds.map(([id, ls]) => { const h = (dl.hopTac || []).find((x) => x.id === id) || { id, ma: id }; return { h, kol: kolTheoId.get(h.kol), ls }; });
    const r = await gui(theDoiBuoc(T, muc), text);
    console.log('[KOL · BÁO BƯỚC]', r && r.ok ? 'đã báo ' + ds.length + ' hợp tác' : 'LỖI ' + (r && r.loi));
  } catch (e) { console.error('[KOL · BÁO BƯỚC]', e.message); }
}

module.exports = { nho, sauKhiGhi, doc, theDoiBuoc };
