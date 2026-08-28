'use strict';
/**
 * Proxy ngược: /m/<id>/... -> http://127.0.0.1:<cong>/...
 *
 * Vì sao proxy chứ không nhúng thẳng http://localhost:5173?
 *  - Cả hub và module cùng một origin -> không vướng CORS, cookie, third-party
 *    cookie; khi deploy lên server thật chỉ cần MỘT URL công khai cho Lark.
 *  - Hub chèn được CSS/JS vào trang module (ẩn logo trùng, đọc dòng phụ đề)
 *    mà không phải sửa code của module — module vẫn chạy độc lập như cũ.
 *
 * Các app module gọi API bằng đường dẫn tuyệt đối '/api/...'. Trang HTML được
 * viết lại href/src, còn fetch/XHR lúc chạy do đoạn shim bên dưới vá lại.
 */
const http = require('http');
const cfg = require('./config');

const HTML_RE = /^text\/html/i;

/** Đường dẫn gốc của module trong hub. */
const tienTo = (mod) => '/m/' + mod.id;

/* ---------------- đoạn mã chèn vào trang module ---------------- */

function shimJs(mod, nguoi) {
  const P = tienTo(mod);
  return `
(function(){
  var P = ${JSON.stringify(P)};
  function fix(u){
    if (u == null) return u;
    u = String(u);
    if (!u || u[0] !== '/') return u;      // tương đối, hoặc http(s)://, data:, #...
    if (u.slice(0,2) === '//') return u;
    if (u.indexOf(P + '/') === 0 || u === P) return u;
    return P + u;
  }
  /* Vai do lớp vỏ quyết (theo email/open_id + bảng phân quyền) — app con nào
   * chưa tự biết vai thì đọc thẳng ở đây, VD để giới hạn bộ lọc của nhân sự. */
  window.__HUB__ = {
    prefix: P,
    id: ${JSON.stringify(mod.id)},
    quanLy: ${nguoi && nguoi.quanLy ? 'true' : 'false'},
    /* App con mở cửa sổ / ô chi tiết thì gọi __HUB__.che(true) — lớp vỏ tự tối
     * panel và thanh đầu lại, để cửa sổ nổi trên CẢ giao diện chứ không chỉ
     * trong khung nhúng. Chạy trực tiếp ngoài Hub thì hàm này không tồn tại,
     * app con phải tự bọc trong try hoặc kiểm tra trước khi gọi. */
    che: function(mo){
      try { parent.postMessage({ hub: 'che', id: window.__HUB__.id, mo: !!mo }, location.origin); }
      catch (e) {}
    },
  };

  var of = window.fetch;
  if (of) window.fetch = function(input, init){
    try {
      if (typeof input === 'string') input = fix(input);
      else if (input && typeof input === 'object' && input.url) input = new Request(fix(input.url), input);
    } catch (e) {}
    return of.call(this, input, init);
  };

  var oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(){
    if (arguments.length > 1) arguments[1] = fix(arguments[1]);
    return oo.apply(this, arguments);
  };

  var OES = window.EventSource;
  if (OES) {
    window.EventSource = function(u, c){ return new OES(fix(u), c); };
    window.EventSource.prototype = OES.prototype;
  }

  var ow = window.open;
  window.open = function(u){ var a = [].slice.call(arguments); a[0] = fix(u); return ow.apply(window, a); };

  // Link/form sinh ra lúc chạy
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('a[href^="/"]') : null;
    if (a && a.getAttribute('href').slice(0,2) !== '//') a.setAttribute('href', fix(a.getAttribute('href')));
  }, true);
  document.addEventListener('submit', function(e){
    var f = e.target;
    if (f && f.getAttribute && f.getAttribute('action') && f.getAttribute('action')[0] === '/') {
      f.setAttribute('action', fix(f.getAttribute('action')));
    }
  }, true);

  /* ---- sáng/tối: ăn theo lớp vỏ ----
   * Cùng origin nên đọc thẳng data-theme của trang cha được; ngoài ra lớp vỏ còn
   * postMessage mỗi lần người dùng đổi công tắc. Đặt thuộc tính lên <html> của
   * module để CSS của nó (khối [data-theme="toi"]) đổi theo.
   */
  function datTheme(v) {
    var el = document.documentElement;
    if (v === 'toi' || v === 'sang') el.setAttribute('data-theme', v);
    else el.removeAttribute('data-theme');
  }
  try {
    var cha = parent.document.documentElement.getAttribute('data-theme');
    if (cha) datTheme(cha);
    else datTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'toi' : 'sang');
  } catch (e) {}
  /* ---- bộ lọc thời gian dùng chung ----
   * Một nơi đổi, mọi nơi theo. Lớp vỏ giữ khoảng đang lọc rồi phát xuống; module
   * chỉ cần khai hai hàm:
   *   window.hubApKhoang(tu, den)  - áp khoảng lớp vỏ gửi xuống ('' = toàn bộ)
   *   window.hubBaoKhoang(tu, den) - gọi khi NGƯỜI DÙNG tự đổi trong module
   * Module nào chưa khai hubApKhoang thì đơn giản là không đồng bộ, không lỗi.
   */
  window.__HUB__.khoang = null;
  function apKhoang(tu, den) {
    window.__HUB__.khoang = tu && den ? { tu: tu, den: den } : null;
    if (typeof window.hubApKhoang !== 'function') return;
    try { window.hubApKhoang(tu || '', den || ''); } catch (e) {}
  }
  window.hubBaoKhoang = function (tu, den) {
    try {
      parent.postMessage({ hub: 'loc-doi', id: window.__HUB__.id, tu: tu || '', den: den || '' },
        location.origin);
    } catch (e) {}
  };

  window.addEventListener('message', function (ev) {
    if (ev.origin !== location.origin) return;
    if (!ev.data) return;
    if (ev.data.hub === 'theme') datTheme(ev.data.v);
    if (ev.data.hub === 'loc') apKhoang(ev.data.tu, ev.data.den);
  });

  /* Hai file dùng chung của lớp vỏ (cùng origin nên app con nạp được):
   *   loc.js  - danh sách mốc thời gian cho nhân sự
   *   i18n.js - từ điển Tiếng Việt / English, tự đọc data-lang của trang cha
   */
  /* document.write chứ không appendChild: script chèn động KHÔNG chặn parser, nên
   * app.js của module chạy trước và lúc đó chưa có HUB_LOC -> bộ lọc dựng sai một
   * nhịp. Viết thẳng vào lúc đang parse thì hai file này chắc chắn nạp xong trước. */
  var V = ${JSON.stringify('?v=' + (cfg.verChung || '1'))};
  document.write('<scr' + 'ipt src="/loc.js' + V + '"></scr' + 'ipt>');
  document.write('<scr' + 'ipt src="/i18n.js' + V + '"></scr' + 'ipt>');

  // Cho lớp vỏ biết trang con đã sẵn sàng + gửi dòng phụ đề để rail hiển thị
  var SEL = ${JSON.stringify(mod.phuSelector || '')};
  function guiPhu(){
    if (!SEL) return;
    var el = document.querySelector(SEL);
    var t = el ? (el.textContent || '').trim() : '';
    try { parent.postMessage({ hub: 'phu', id: window.__HUB__.id, text: t }, location.origin); } catch (e) {}
  }
  function bao(){
    try { parent.postMessage({ hub: 'ready', id: window.__HUB__.id, title: document.title }, location.origin); } catch (e) {}
    // xin khoảng lọc đang áp: mở app giữa phiên thì phải khớp ngay, không chờ đổi
    try { parent.postMessage({ hub: 'xin-loc', id: window.__HUB__.id }, location.origin); } catch (e) {}
    guiPhu();
    setInterval(guiPhu, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bao);
  else bao();
})();`;
}

function shimCss(mod) {
  const an = (mod.an || []).filter(Boolean);
  const rules = an.length ? an.join(',\n') + ' { display: none !important; }' : '';
  // `css` trong modules.json: chỉnh thêm cho vừa khung hub (VD ẩn logo xong thì
  // nhóm nút bên phải mất chỗ dựa, phải đẩy lại về phải bằng margin-left:auto)
  const them = (mod.css || '').trim();
  return `
/* hub: lớp vỏ đã có panel bên trái nên ẩn phần logo trùng của module */
${rules}
${them}
`;
}

function chenVaoHtml(html, mod, nguoi) {
  let out = html;

  // href="/x" src="/x" action="/x" -> thêm tiền tố (bỏ qua "//" và "/m/<id>")
  const P = tienTo(mod);
  out = out.replace(/(\s(?:href|src|action|data-src)=")\/(?!\/)/g, (m, g1) => g1 + P + '/');

  // đánh dấu để CSS của module (nếu muốn) biết đang chạy trong hub
  out = out.replace(/<html\b/i, '<html class="trong-hub"');

  const chen = '<style data-hub="1">' + shimCss(mod) + '</style>\n<script data-hub="1">' + shimJs(mod, nguoi) + '</script>\n';
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head([^>]*)>/i, (m) => m + '\n' + chen);
  else out = chen + out;
  return out;
}

/* ---------------- proxy ---------------- */

function suaCookie(giaTri, mod) {
  // Cách ly cookie giữa các module: Path=/ -> Path=/m/<id>/
  const P = tienTo(mod) + '/';
  return giaTri.map((c) => {
    if (/;\s*path=/i.test(c)) return c.replace(/;\s*path=[^;]*/i, '; Path=' + P);
    return c + '; Path=' + P;
  });
}

function chuyenTiep(req, res, mod, duongDan, nguoi) {
  const opts = {
    host: '127.0.0.1',
    port: mod.cong,
    method: req.method,
    path: duongDan || '/',
    headers: { ...req.headers, host: '127.0.0.1:' + mod.cong },
    timeout: cfg.goiTimeoutMs,
  };
  delete opts.headers['accept-encoding']; // để không phải giải nén khi chèn HTML
  delete opts.headers['x-forwarded-host'];
  /* Danh tính người dùng: hub đã đăng nhập Lark, module chỉ việc tin header này.
   * An toàn vì module chỉ nghe trên 127.0.0.1 — không ai ngoài hub gọi tới được.
   * Xoá header do client tự gửi trước khi ghi lại, kẻo có người tự mạo danh. */
  delete opts.headers['x-hub-user-id'];
  delete opts.headers['x-hub-user-name'];
  ['x-hub-user-manager','x-hub-perm-toan-bo','x-hub-perm-khong-tao','x-hub-perm-chi-phi']
    .forEach((h) => { delete opts.headers[h]; });
  if (nguoi && nguoi.id) {
    opts.headers['x-hub-user-id'] = nguoi.id;
    opts.headers['x-hub-user-name'] = encodeURIComponent(nguoi.name || nguoi.id);
    // hub đã quyết vai + tuỳ chọn (bảng "Phân quyền app") — module chỉ việc tin
    if (nguoi.quanLy) opts.headers['x-hub-user-manager'] = '1';
    if (nguoi.toanBo) opts.headers['x-hub-perm-toan-bo'] = '1';
    if (nguoi.taoMoi === false) opts.headers['x-hub-perm-khong-tao'] = '1';
    if (nguoi.chiPhi) opts.headers['x-hub-perm-chi-phi'] = '1';
  }

  const upstream = http.request(opts, (r) => {
    const loai = String(r.headers['content-type'] || '');
    const headers = { ...r.headers };
    delete headers['transfer-encoding'];

    if (headers['set-cookie']) headers['set-cookie'] = suaCookie([].concat(headers['set-cookie']), mod);
    if (headers.location && headers.location[0] === '/' && headers.location.slice(0, 2) !== '//') {
      headers.location = tienTo(mod) + headers.location;
    }

    if (HTML_RE.test(loai)) {
      const buf = [];
      r.on('data', (c) => buf.push(c));
      r.on('end', () => {
        const html = chenVaoHtml(Buffer.concat(buf).toString('utf8'), mod, nguoi);
        const body = Buffer.from(html, 'utf8');
        headers['content-length'] = String(body.length);
        headers['cache-control'] = 'no-store';
        res.writeHead(r.statusCode || 200, headers);
        res.end(body);
      });
      r.on('error', () => { try { res.destroy(); } catch (_) {} });
      return;
    }

    res.writeHead(r.statusCode || 200, headers);
    r.pipe(res);
  });

  upstream.on('timeout', () => {
    upstream.destroy(new Error('Module không trả lời trong ' + Math.round(cfg.goiTimeoutMs / 1000) + 's'));
  });

  upstream.on('error', (e) => {
    if (res.headersSent) { try { res.destroy(); } catch (_) {} return; }
    const laApi = duongDan.startsWith('/api/');
    const thongBao = 'Không kết nối được module "' + mod.ten + '" (cổng ' + mod.cong + '): ' + e.message;
    if (laApi) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: thongBao }));
    } else {
      res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(trangLoi(mod, thongBao));
    }
  });

  req.pipe(upstream);
}

function trangLoi(mod, thongBao) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>${esc(mod.ten)} — chưa sẵn sàng</title>
<style>
  body{margin:0;font:14px/1.6 -apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2329;background:#f5f6f7;
       display:grid;place-items:center;height:100vh}
  .box{max-width:520px;background:#fff;border:1px solid #e5e6eb;border-radius:12px;padding:28px 30px;
       box-shadow:0 4px 20px rgba(31,35,41,.06)}
  h1{margin:0 0 6px;font-size:17px}
  p{margin:8px 0;color:#646a73}
  code{background:#f2f3f5;padding:2px 6px;border-radius:4px}
  button{margin-top:14px;border:0;background:#3370ff;color:#fff;padding:9px 16px;border-radius:6px;
         font-size:14px;cursor:pointer}
</style></head><body><div class="box">
<h1>${esc(mod.icon)} ${esc(mod.ten)} chưa sẵn sàng</h1>
<p>${esc(thongBao)}</p>
<p>Module này chạy bằng <code>${esc((mod.lenh || []).join(' '))}</code> trong <code>${esc(mod.thuMuc || '')}</code>.
Xem log và bấm <b>Bật lại</b> ở mục <b>Cài đặt</b> của lớp vỏ.</p>
<button onclick="location.reload()">Thử lại</button>
</div></body></html>`;
}

/** Header danh tính + quyền gửi kèm khi hub tự gọi API của module. */
function headerNguoi(nguoi) {
  if (!nguoi || !nguoi.id) return {};
  const h = {
    'x-hub-user-id': nguoi.id,
    'x-hub-user-name': encodeURIComponent(nguoi.name || nguoi.id),
  };
  if (nguoi.quanLy) h['x-hub-user-manager'] = '1';
  if (nguoi.toanBo) h['x-hub-perm-toan-bo'] = '1';
  if (nguoi.taoMoi === false) h['x-hub-perm-khong-tao'] = '1';
  if (nguoi.chiPhi) h['x-hub-perm-chi-phi'] = '1';
  return h;
}

/**
 * Gọi API JSON của một module (trang Tổng quan chung, cửa sổ xử lý nhanh).
 * opts: { nguoi, method, body, timeoutMs }
 *
 * Module trả lỗi kèm mã (PROOF_REQUIRED, MANAGER_ONLY…) — giữ nguyên `code` và
 * câu `error` của nó trên Error để hub nói lại đúng lý do, không thành "HTTP 403".
 */
function goiJson(mod, duongDan, opts = {}) {
  const timeoutMs = opts.timeoutMs || cfg.goiTimeoutMs;
  const method = opts.method || 'GET';
  const than = opts.body == null ? null : Buffer.from(JSON.stringify(opts.body), 'utf8');
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: mod.cong,
        path: duongDan,
        method,
        timeout: timeoutMs,
        headers: Object.assign(
          { accept: 'application/json' },
          headerNguoi(opts.nguoi),
          than ? { 'content-type': 'application/json; charset=utf-8', 'content-length': than.length } : {}
        ),
      },
      (res) => {
        const buf = [];
        res.on('data', (c) => buf.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(buf).toString('utf8');
          let d = null;
          try { d = raw ? JSON.parse(raw) : {}; } catch (_) { d = null; }
          if (res.statusCode >= 400) {
            const e = new Error((d && d.error) || 'HTTP ' + res.statusCode + ' ' + raw.slice(0, 160));
            e.http = res.statusCode;
            if (d && d.code) e.code = d.code;
            if (d && d.hint) e.hint = d.hint;
            return reject(e);
          }
          if (d === null) return reject(new Error('Không phải JSON: ' + raw.slice(0, 120)));
          resolve(d);
        });
      }
    );
    req.on('timeout', () => { req.destroy(new Error('Quá thời gian chờ')); });
    req.on('error', reject);
    if (than) req.write(than);
    req.end();
  });
}

module.exports = { chuyenTiep, goiJson, tienTo };
