'use strict';
/* Gọi Drive bằng tenant token của app (bản online — Render). Máy nội bộ dùng lark-cli.
   App Marketing Hub KHÔNG liệt kê được thư mục Drive Marketing (403 khi list) nhưng ĐỌC ĐƯỢC từng
   file đã chia sẻ trong công ty: ảnh thu nhỏ, bản xem trước 1080p, file gốc — kể cả theo đoạn
   (Range → 206), nên phát/tải được thẳng từ Lark mà không cần ổ đĩa của Render.
   CHỈ ĐỌC. Mọi lời gọi đều có hạn giờ (tới khi có header; luồng dữ liệu dài thì không cắt). */
const H = (process.env.LARK_API_HOST || 'https://open.larksuite.com').replace(/\/+$/, '');
const APP_ID = process.env.LARK_APP_ID || '';
const APP_SECRET = process.env.LARK_APP_SECRET || '';
const HAN_GOI = 20000;

const coApi = () => !!(APP_ID && APP_SECRET);
let tok = { v: '', het: 0 }, dangLay = null;
async function token(moi) {
  if (!moi && tok.v && Date.now() < tok.het - 120e3) return tok.v;
  if (!dangLay) {
    dangLay = (async () => {
      const r = await fetch(H + '/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }), signal: AbortSignal.timeout(HAN_GOI),
      });
      const j = await r.json();
      if (!j.tenant_access_token) throw new Error('không lấy được tenant token (' + j.code + ')');
      tok = { v: j.tenant_access_token, het: Date.now() + (j.expire || 7200) * 1000 };
      return tok.v;
    })().finally(() => { dangLay = null; });
  }
  return dangLay;
}

/* Trả Response (chưa đọc thân). Thử lại khi Lark bận (429/5xx) hoặc token hết hạn (401). */
async function goi(duong, { method = 'GET', headers = {}, body, huy } = {}) {
  let r;
  for (let lan = 0; lan < 3; lan++) {
    const ac = new AbortController();
    const hen = setTimeout(() => ac.abort(new Error('timeout ' + HAN_GOI + 'ms')), HAN_GOI);
    if (huy) huy.once('close', () => ac.abort(new Error('người xem đã đóng')));
    try {
      r = await fetch(H + duong, { method, body, headers: Object.assign({ Authorization: 'Bearer ' + await token(lan > 0 && r && r.status === 401) }, headers), signal: ac.signal });
    } finally { clearTimeout(hen); }
    if (r.status === 429 || r.status >= 500 || r.status === 401) { try { await r.arrayBuffer(); } catch (e) {} await new Promise(ok => setTimeout(ok, 400 * (lan + 1))); continue; }
    return r;
  }
  return r;
}

/* Lark báo bận còn có kiểu HTTP 200 + mã 99991400 / 800004135 trong thân — thử lại cả kiểu đó */
const MA_BAN = [99991400, 800004135];
async function docJson(duong, opt) {
  let j;
  for (let lan = 0; lan < 3; lan++) {
    j = await (await goi(duong, opt)).json();
    if (!MA_BAN.includes(j.code)) return j;
    await new Promise(ok => setTimeout(ok, 500 * (lan + 1)));
  }
  return j;
}
async function docBuf(duong, opt) { const r = await goi(duong, opt); return { r, buf: r.ok ? Buffer.from(await r.arrayBuffer()) : null }; }

/* ---- các việc cụ thể ---- */
const anh = (t, co) => docBuf('/open-apis/drive/v1/medias/' + t + '/preview_download?bus_type=' + encodeURIComponent(co) + '&preview_type=1');

/* Bản MP4 1080p Lark chuyển mã: phải hỏi preview_result lấy `version` trước. Nhớ version 6 giờ. */
const banXem = new Map();
async function phienBan1080(t) {
  const c = banXem.get(t);
  if (c && Date.now() - c.luc < 6 * 3600e3) return c.v;
  const j = await docJson('/open-apis/drive/v1/medias/' + t + '/preview_result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const co = j.code === 0 && (j.data.preview_results || []).some(p => p.preview_type === 23 && p.preview_status === 0);
  const v = co ? j.data.version : null;
  banXem.set(t, { v, luc: Date.now() });
  if (banXem.size > 5000) banXem.delete(banXem.keys().next().value);
  return v;
}
async function phat(t, range, huy) {
  const v = await phienBan1080(t);
  if (!v) return null;
  return goi('/open-apis/drive/v1/medias/' + t + '/preview_download?preview_type=23&version=' + encodeURIComponent(v), { headers: range ? { Range: range } : {}, huy });
}
const goc = (t, range, huy) => goi('/open-apis/drive/v1/files/' + t + '/download', { headers: range ? { Range: range } : {}, huy });
const taiFile = (t) => docBuf('/open-apis/drive/v1/files/' + t + '/download');

module.exports = { coApi, anh, phat, goc, taiFile };
