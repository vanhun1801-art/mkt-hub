'use strict';
/**
 * Gửi một THẺ Lark cho anh Hùng từ bất kỳ app con nào (25/09/2026).
 *
 * Trong hub (Render hay máy): POST về hub — /_noi-bo/gui-tin (lark-mkt-hub/bao-loi-api.js).
 * Hub gửi bằng bot Marketing Hub tới open_id của dòng "Lê Văn Hùng" trong bảng Phân quyền,
 * nên app con không phải tự lo open_id (riêng theo từng app) hay khoá app.
 *
 * Chạy lẻ ngoài hub (máy cá nhân, `node server.js`): gửi bằng bot lark-cli qua hàm `cli`
 * app truyền vào, tới open_id của anh Hùng dưới app lark-cli (LARK_ANH_HUNG_CLI_ID).
 */
const http = require('http');

const ID_CLI = process.env.LARK_ANH_HUNG_CLI_ID || 'ou_f0d3514abf6b168bef076441f350c585';

function quaHub(card, khoa) {
  return new Promise((ok) => {
    const than = JSON.stringify({ card, khoa });
    const r = http.request(process.env.HUB_GUI_TIN_URL, {
      method: 'POST', timeout: 30000,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(than), 'x-hub-khoa': process.env.HUB_KHOA_NOI_BO },
    }, (res) => {
      let s = ''; res.on('data', (d) => { s += d; });
      res.on('end', () => { try { ok(JSON.parse(s)); } catch (_) { ok({ ok: res.statusCode < 300, loi: s.slice(0, 200) }); } });
    });
    r.on('error', (e) => ok({ ok: false, loi: 'hub: ' + e.message }));
    r.on('timeout', () => { r.destroy(); ok({ ok: false, loi: 'hub không trả lời' }); });
    r.end(than);
  });
}

/** @param {{card:object, khoa?:string, cli?:Function}} o  cli = lark.cli của app (dự phòng khi chạy lẻ) */
async function gui({ card, khoa, cli }) {
  let r = null;
  if (process.env.HUB_GUI_TIN_URL && process.env.HUB_KHOA_NOI_BO) {
    r = await quaHub(card, khoa);
    /* hub trên máy thường không có khoá app → nó trả lỗi, thử tiếp bằng lark-cli */
    if (r.ok || !cli) return r;
  }
  if (!cli) return { ok: false, loi: 'không chạy trong hub và không có lark-cli để gửi' };
  try {
    const args = ['im', '+messages-send', '--as', 'bot', '--user-id', ID_CLI, '--msg-type', 'interactive', '--content', JSON.stringify(card), '--format', 'json'];
    if (khoa) args.push('--idempotency-key', khoa);
    await cli(args, { retries: 1 });
    return { ok: true, qua: 'lark-cli' };
  } catch (e) { return { ok: false, loi: e.message }; }
}

module.exports = { gui };
