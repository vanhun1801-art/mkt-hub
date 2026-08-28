'use strict';
/**
 * Siêu ứng dụng phòng Marketing — Rooty Trip Phú Quốc.
 *
 * Đây là LỚP VỎ (hub): panel bên trái liệt kê các base đang quản lý, khung bên
 * phải là app của base đó (giữ nguyên bộ tab riêng của nó). Hub tự bật các app
 * module trên máy, proxy chúng vào cùng một origin, và tự dựng trang
 * "Tổng quan chung" gom chỉ số của mọi base.
 *
 * Chạy:  node server.js      ->  http://localhost:5180
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const kids = require('./children');
const kpi = require('./kpi');
const lich = require('./lichchung');
const auth = require('./auth');
const { chuyenTiep } = require('./proxy');

const PUBLIC = path.join(__dirname, 'public');

/* ---------------- HTTP tiện ích ---------------- */
function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}
const ok = (res, b) => send(res, 200, b);
const loi = (res, code, msg) => send(res, code, { error: msg });

function docBody(req) {
  return new Promise((resolve, reject) => {
    const buf = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > 1024 * 1024) { reject(new Error('Body quá lớn')); req.destroy(); return; }
      buf.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(buf).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('JSON không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function tinh(res, duongDan) {
  const p = duongDan === '/' ? '/index.html' : duongDan;
  const f = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
    return send(res, 404, 'Không có ' + p, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  const body = fs.readFileSync(f);
  send(res, 200, body, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
}

/* ---------------- danh sách module ---------------- */
function danhSach() {
  try { return cfg.docModules(); } catch (e) {
    console.error('  modules.json lỗi: ' + e.message);
    return [];
  }
}
const timMod = (id) => danhSach().find((m) => m.id === id) || null;

function congKhai(m) {
  return {
    id: m.id, ten: m.ten, mo_ta: m.mo_ta, icon: m.icon, mau: m.mau, kieu: m.kieu,
    cong: m.cong, url: m.kieu === 'local' ? '/m/' + m.id + '/' : m.url,
    larkUrl: m.larkUrl, kpi: m.kpi, bat: m.bat, coKpi: !!kpi.BO_DOC[m.kpi],
    thuMuc: m.thuMuc ? path.basename(m.thuMuc) : '',
    tinhTrang: kids.tinhTrang(m),
  };
}

/* ---------------- API ---------------- */
async function api(req, res, u) {
  const p = u.pathname;
  const m = req.method;

  if (p === '/api/hub' && m === 'GET') {
    return ok(res, {
      ten: cfg.ten, phu: cfg.phu, build: cfg.build, cong: cfg.port,
      modules: danhSach().map(congKhai),
    });
  }

  if (p === '/api/tongquan' && m === 'GET') {
    const mods = danhSach().filter((x) => x.bat && kpi.BO_DOC[x.kpi]);
    if (u.searchParams.get('refresh') === '1') kpi.xoaCache();
    // Khoảng lọc do client tính (nó biết múi giờ, "tháng này" theo máy người dùng)
    const ngay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
    const tu = ngay(u.searchParams.get('tu'));
    const den = ngay(u.searchParams.get('den'));
    const khoang = tu && den ? { tu, den } : null;
    const kq = await kpi.tongQuan(mods, khoang, cfg.mode === 'api' ? auth.sessionUser(req) : null);
    return ok(res, kq);
  }

  if (p === '/api/lich-chung' && m === 'GET') {
    const ngay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
    let tu = ngay(u.searchParams.get('tu'));
    let den = ngay(u.searchParams.get('den'));
    if (!tu || !den) {
      // không truyền khoảng thì lấy tháng hiện tại — lưới người × ngày phải có biên
      const now = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      const dau = new Date(now.getFullYear(), now.getMonth(), 1);
      const cuoi = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const s = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
      tu = s(dau); den = s(cuoi);
    }
    if (tu > den) [tu, den] = [den, tu];
    // lưới quá rộng thì vô dụng mà còn nặng — chặn ở 92 ngày
    const soNgay = Math.round((Date.parse(den) - Date.parse(tu)) / 86400000) + 1;
    if (soNgay > 92) return loi(res, 400, 'Khoảng quá rộng (' + soNgay + ' ngày) — chọn tối đa 3 tháng.');

    const mods = danhSach().filter((x) => x.bat && lich.BO_DOC[x.kpi]);
    if (u.searchParams.get('refresh') === '1') lich.xoaCache();
    return ok(res, await lich.lichChung(mods, tu, den, u.searchParams.get('refresh') === '1',
      cfg.mode === 'api' ? auth.sessionUser(req) : null));
  }

  // /api/modules/<id>/<hanhDong>
  const mm = /^\/api\/modules\/([^/]+)(?:\/(bat|tat|bat-lai|log))?$/.exec(p);
  if (mm) {
    const mod = timMod(decodeURIComponent(mm[1]));
    if (!mod) return loi(res, 404, 'Không có module ' + mm[1]);
    const act = mm[2];

    if (act === 'log' && m === 'GET') {
      return ok(res, { id: mod.id, logs: kids.logs(mod.id, Number(u.searchParams.get('n') || 150)) });
    }
    if (act === 'bat' && m === 'POST') { await kids.khoiDong(mod); return ok(res, congKhai(mod)); }
    if (act === 'tat' && m === 'POST') { await kids.tat(mod); return ok(res, congKhai(mod)); }
    if (act === 'bat-lai' && m === 'POST') {
      kpi.xoaCache(mod.id);
      await kids.batLai(mod);
      return ok(res, congKhai(mod));
    }

    if (!act && m === 'PATCH') {
      const body = await docBody(req);
      const tho = cfg.docModulesTho();
      const i = tho.findIndex((x) => x.id === mod.id);
      if (i < 0) return loi(res, 404, 'Không thấy trong modules.json');
      ['ten', 'mo_ta', 'icon', 'mau', 'larkUrl', 'url', 'bat', 'kpi'].forEach((k) => {
        if (k in body) tho[i][k] = body[k];
      });
      cfg.ghiModules(tho);
      const moi = timMod(mod.id);
      if (moi && moi.bat && moi.kieu === 'local') kids.khoiDong(moi);
      if (moi && !moi.bat) kids.tat(moi);
      return ok(res, congKhai(moi || mod));
    }

    if (!act && m === 'DELETE') {
      await kids.tat(mod);
      const tho = cfg.docModulesTho().filter((x) => x.id !== mod.id);
      cfg.ghiModules(tho);
      kpi.xoaCache(mod.id);
      return ok(res, { xoa: mod.id });
    }
  }

  if (p === '/api/modules' && m === 'POST') {
    const b = await docBody(req);
    const ten = String(b.ten || '').trim();
    if (!ten) return loi(res, 400, 'Thiếu tên base');
    const kieu = ['local', 'ngoai', 'lark'].includes(b.kieu) ? b.kieu : 'ngoai';
    const id = String(b.id || '').trim() || khongDau(ten);
    if (timMod(id)) return loi(res, 400, 'Đã có module id "' + id + '"');

    if (kieu === 'local') {
      const tm = path.resolve(cfg.root, String(b.thuMuc || ''));
      if (!b.thuMuc || !fs.existsSync(tm)) return loi(res, 400, 'Không thấy thư mục: ' + tm);
      if (!fs.existsSync(path.join(tm, 'server.js'))) return loi(res, 400, 'Thư mục không có server.js');
      if (!Number(b.cong)) return loi(res, 400, 'Thiếu cổng cho module chạy trên máy');
    } else if (!String(b.url || '').startsWith('http')) {
      return loi(res, 400, 'Thiếu URL (http/https)');
    }

    const moi = {
      id, ten,
      mo_ta: String(b.mo_ta || ''),
      icon: String(b.icon || '▦').slice(0, 4),
      mau: /^#[0-9a-f]{3,8}$/i.test(String(b.mau || '')) ? b.mau : '#3370ff',
      kieu,
      kpi: b.kpi && kpi.BO_DOC[b.kpi] ? b.kpi : '',
      larkUrl: String(b.larkUrl || ''),
      bat: true,
    };
    if (kieu === 'local') {
      moi.thuMuc = String(b.thuMuc);
      moi.cong = Number(b.cong);
      moi.lenh = Array.isArray(b.lenh) && b.lenh.length ? b.lenh : ['node', 'server.js'];
      if (Array.isArray(b.an)) moi.an = b.an;
      if (b.phuSelector) moi.phuSelector = String(b.phuSelector);
    } else {
      moi.url = String(b.url);
    }

    const tho = cfg.docModulesTho();
    tho.push(moi);
    cfg.ghiModules(tho);
    const mod = timMod(id);
    if (mod && mod.kieu === 'local') kids.khoiDong(mod);
    return ok(res, congKhai(mod));
  }

  if (p === '/api/bo-doc-kpi' && m === 'GET') return ok(res, { ds: Object.keys(kpi.BO_DOC) });

  if (p === '/healthz') {
    const mods = danhSach();
    return ok(res, {
      ok: true, build: cfg.build,
      modules: mods.map((x) => ({ id: x.id, trangThai: kids.tinhTrang(x).trangThai })),
    });
  }

  return loi(res, 404, 'Không có API ' + p);
}

/** "Bảng công việc" -> "bang-cong-viec" (id không dấu, dùng cho URL). */
function khongDau(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'base';
}

/* ---------------- server ---------------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = u.pathname;

  /* Chế độ api (deploy chung): hub đăng nhập Lark một lần cho cả hệ. Mọi thứ đều
   * phải qua cổng này, trừ /healthz (Render gọi để biết app còn sống) và /auth/*. */
  if (cfg.mode === 'api') {
    if (p.startsWith('/auth/')) {
      const xong = await auth.handle(req, res, u);
      if (xong !== false) return;
    }
    if (p !== '/healthz' && !auth.sessionUser(req)) return auth.requireLogin(res, u);
  }

  // proxy vào module: /m/<id>/...
  const mm = /^\/m\/([^/]+)(\/.*)?$/.exec(p);
  if (mm) {
    const id = decodeURIComponent(mm[1]);
    const mod = timMod(id);
    if (!mod) return send(res, 404, 'Không có module ' + id, { 'Content-Type': 'text/plain; charset=utf-8' });
    if (mod.kieu !== 'local') {
      // module ngoài chỉ có URL — chuyển hướng thẳng ra đó
      res.writeHead(302, { Location: mod.url || '/' });
      return res.end();
    }
    if (!mm[2]) { // /m/<id> -> /m/<id>/
      res.writeHead(302, { Location: p + '/' + (u.search || '') });
      return res.end();
    }
    kids.khoiDong(mod); // bảo đảm đang chạy (không chờ)
    const nguoi = cfg.mode === 'api' ? auth.sessionUser(req) : null;
    return chuyenTiep(req, res, mod, mm[2] + (u.search || ''), nguoi);
  }

  if (p.startsWith('/api/') || p === '/healthz') {
    return api(req, res, u).catch((e) => {
      console.error('[API]', p, '->', e.message);
      if (!res.headersSent) loi(res, 500, e.message || 'Lỗi không xác định');
    });
  }

  return tinh(res, p);
});

/* ---------------- khởi động ---------------- */
const mods = danhSach();

server.listen(cfg.port, () => {
  console.log('');
  console.log('  ' + cfg.ten + ' · ' + cfg.phu + '   (build ' + cfg.build + ')');
  console.log('  ->  http://localhost:' + cfg.port);
  console.log('');
  console.log('  Base đang quản lý:');
  mods.forEach((m) => console.log('   ' + (m.bat ? '•' : '·') + ' ' + m.icon + ' ' + m.ten +
    '  [' + m.kieu + (m.kieu === 'local' ? ' :' + m.cong : '') + ']' + (m.bat ? '' : '  (đang tắt)')));
  console.log('');

  if (cfg.tuKhoiDong) {
    mods.filter((m) => m.bat && m.kieu === 'local').forEach((m, i) => {
      setTimeout(() => kids.khoiDong(m), i * 600);
    });
  } else {
    console.log('  HUB_AUTOSTART=0 — không tự bật module, mở trong Cài đặt.');
  }

  setInterval(() => { kids.ktSucKhoe(danhSach()).catch(() => {}); }, 10000);
  console.log('  Ctrl+C để dừng (tắt luôn các module do hub bật).');
  console.log('');
});

let dangDong = false;
function dong() {
  if (dangDong) return;
  dangDong = true;
  console.log('\n  Đang tắt các module…');
  kids.tatHet().finally(() => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}
process.on('SIGINT', dong);
process.on('SIGTERM', dong);
process.on('SIGHUP', dong);
