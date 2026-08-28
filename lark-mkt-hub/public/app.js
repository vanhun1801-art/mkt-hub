'use strict';
/* ============================================================
   Marketing Hub — lớp vỏ
   - Panel bên trái: danh sách base (module) đang quản lý
   - Sân khấu bên phải: app của base đó, giữ nguyên bộ tab riêng
   - Trang chủ "Tổng quan chung" do chính lớp vỏ dựng từ /api/tongquan
   Mỗi module được nhúng bằng iframe và GIỮ LẠI trong DOM sau khi mở, nên
   chuyển qua lại không mất trạng thái (bộ lọc, tab đang xem, ô đang nhập).
   ============================================================ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const S = {
  hub: null,
  modules: [],
  tq: null,            // dữ liệu /api/tongquan
  view: 'home',        // 'home' | id module
  frames: new Map(),   // id -> { wrap, iframe, phu }
  phu: new Map(),      // id -> dòng phụ đề module tự báo
  ky: 'thang',         // khoảng thời gian đang lọc — mặc định THÁNG HIỆN TẠI
  tu: '', den: '',     // dùng khi ky = 'tuychon'
  lich: null,          // dữ liệu /api/lich-chung
  lichLoi: '',
  xem: 'luoi',         // cách xem lịch chung: 'luoi' | 'ngay'
  theme: 'auto',       // 'sang' | 'toi' | 'auto'
};

/* ---------------- bộ lọc thời gian ----------------
 * Mặc định là tháng hiện tại, giống bộ lọc trong ba app module.
 * Khoảng ngày do client tính vì "tháng này" phụ thuộc đồng hồ/múi giờ của máy.
 */
const KY = [
  ['thang', 'Tháng này'],
  ['thang-truoc', 'Tháng trước'],
  ['tuan', 'Tuần này'],
  ['7', '7 ngày'],
  ['30', '30 ngày'],
  ['tuychon', 'Tuỳ chọn'],
  ['all', 'Toàn bộ'],
];
const KY_MAC_DINH = 'thang';

/** Date -> 'YYYY-MM-DD' theo giờ địa phương (không dùng toISOString kẻo lệch ngày). */
function d2s(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** Kỳ đang chọn -> { tu, den } hoặc null nếu xem toàn bộ. */
function khoangDangLoc() {
  const now = new Date();
  const k = S.ky;
  if (k === 'all') return null;
  if (k === 'tuychon') return S.tu && S.den ? { tu: S.tu, den: S.den } : null;
  if (k === 'thang') {
    return { tu: d2s(new Date(now.getFullYear(), now.getMonth(), 1)),
             den: d2s(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  if (k === 'thang-truoc') {
    return { tu: d2s(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
             den: d2s(new Date(now.getFullYear(), now.getMonth(), 0)) };
  }
  if (k === 'tuan') {
    const t = new Date(now); t.setHours(0, 0, 0, 0);
    const thu2 = new Date(t); thu2.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    const cn = new Date(thu2); cn.setDate(thu2.getDate() + 6);
    return { tu: d2s(thu2), den: d2s(cn) };
  }
  const soNgay = Number(k) || 7;                     // '7' | '30'
  const den = new Date(now); den.setHours(0, 0, 0, 0);
  const tu = new Date(den); tu.setDate(den.getDate() - (soNgay - 1));
  return { tu: d2s(tu), den: d2s(den) };
}

/* ============================================================
   SÁNG / TỐI
   Một công tắc duy nhất cho cả hệ: lớp vỏ đặt data-theme lên <html> của mình,
   rồi gửi xuống từng iframe module (cùng origin nhờ proxy) để vỏ và ruột không
   bao giờ lệch tone. 'auto' = bỏ data-theme, để CSS theo prefers-color-scheme.
   ============================================================ */
const THEME = [['sang', 'Sáng'], ['toi', 'Tối'], ['auto', 'Theo hệ thống']];

function docTheme() {
  // ?theme=toi|sang|auto — mở thẳng một tone, không ghi vào localStorage
  const q = new URLSearchParams(location.search).get('theme');
  if (q === 'sang' || q === 'toi' || q === 'auto') return q;
  try {
    const v = localStorage.getItem('hub.theme');
    if (v === 'sang' || v === 'toi' || v === 'auto') return v;
  } catch (_) {}
  return 'auto';
}

/** Theme thực tế đang hiển thị ('sang' | 'toi') — 'auto' thì hỏi hệ thống. */
function themeThuc() {
  if (S.theme !== 'auto') return S.theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'toi' : 'sang';
}

function apTheme(luu) {
  const el = document.documentElement;
  if (S.theme === 'auto') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', S.theme);
  if (luu) { try { localStorage.setItem('hub.theme', S.theme); } catch (_) {} }
  veSegTheme();
  guiThemeXuongModule();
}

/** Gửi theme thực tế xuống mọi module đang mở (và cho iframe mới khi load). */
function guiThemeXuongModule() {
  const v = themeThuc();
  S.frames.forEach((x) => {
    try { x.iframe.contentWindow.postMessage({ hub: 'theme', v }, location.origin); } catch (_) {}
  });
}

function veSegTheme() {
  const host = $('#segTheme');
  if (!host) return;
  host.innerHTML = THEME.map(([v, t]) =>
    '<button data-theme-set="' + v + '" class="' + (S.theme === v ? 'on' : '') + '" title="' + t + '">' +
    icon(v) + '</button>').join('');
}

/* ---------------- tiện ích ---------------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf = new Intl.NumberFormat('vi-VN');
function so(v, dinhDang) {
  const n = Number(v || 0);
  if (dinhDang === 'vnd') return nf.format(Math.round(n)) + 'đ';
  if (dinhDang === 'pt') return nf.format(Math.round(n * 100) / 100) + '%';
  if (dinhDang === 'x') return (Math.round(n * 100) / 100).toString().replace('.', ',') + 'x';
  return nf.format(n);
}

function gio(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  // đồng hồ máy và mốc từ server lệch nhau vài ms -> đừng để ra "-1 giây trước"
  const giay = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (giay < 5) return 'vừa xong';
  if (giay < 60) return giay + ' giây trước';
  if (giay < 3600) return Math.round(giay / 60) + ' phút trước';
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function toast(msg, loai = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + loai;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function goi(duongDan, opts) {
  const r = await fetch(duongDan, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
  const raw = await r.text();
  let d = {};
  try { d = raw ? JSON.parse(raw) : {}; } catch (e) { throw new Error(raw.slice(0, 200)); }
  if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
  return d;
}

/* ---------------- panel bên trái ---------------- */
const NHAN_TT = {
  chay: ['Đang chạy', 'luc'],
  ngoai: ['Chạy sẵn ngoài hub', 'luc'],
  'dang-khoi-dong': ['Đang khởi động…', 'vang'],
  loi: ['Lỗi', 'do'],
  tat: ['Đã tắt', ''],
  'ngoai-url': ['App ngoài', ''],
  lark: ['Mở trong Lark', ''],
};

function demCanXuLy(id) {
  if (!S.tq) return 0;
  const m = (S.tq.modules || []).find((x) => x.id === id);
  if (!m || !m.the) return 0;
  return (m.the || []).filter((t) => t.muc === 'cao').reduce((a, t) => a + (Number(t.so) || 0), 0);
}

function veRail() {
  const nav = $('#railNav');
  const hienTai = S.view;

  const item = (o) => `
    <a class="rail-item ${o.on ? 'on' : ''}" href="${o.href}" title="${esc(o.title || o.ten)}" data-id="${esc(o.id || '')}">
      <span class="ri-ic" style="${o.mau ? 'background:' + esc(o.mau) + '22;color:' + esc(o.mau) : ''}">${icon(o.icon)}</span>
      <span class="ri-tx"><b>${esc(o.ten)}</b>${o.phu ? '<small>' + esc(o.phu) + '</small>' : ''}</span>
      ${o.badge ? '<span class="ri-badge">' + (o.badge > 99 ? '99+' : o.badge) + '</span>' : ''}
      ${o.dot ? '<span class="ri-dot ' + o.dot + '" title="' + esc(o.dotTitle || '') + '"></span>' : ''}
    </a>`;

  let html = item({
    id: '', href: '#/tong-quan', icon: 'tong-quan', ten: 'Tổng quan chung',
    mau: '#2b5cff', on: hienTai === 'home',
  });

  const dsBat = S.modules.filter((m) => m.bat);
  html += '<div class="rail-group">Base đang quản lý</div>';
  html += dsBat.map((m) => {
    const tt = m.tinhTrang || {};
    const nhan = NHAN_TT[tt.trangThai] || ['', ''];
    return item({
      id: m.id,
      href: m.kieu === 'lark' ? '#/lark/' + m.id : '#/m/' + m.id,
      icon: m.icon, ten: m.ten,
      // chỉ hiện dòng phụ khi module tự báo số liệu thật (VD "384 việc · vừa xong")
      phu: S.phu.get(m.id) || '',
      mau: m.mau,
      on: hienTai === m.id,
      badge: demCanXuLy(m.id),
      dot: m.kieu === 'local' ? tt.trangThai : '',
      dotTitle: nhan[0] + (tt.loi ? ' — ' + tt.loi : ''),
      title: m.ten + (m.mo_ta ? ' — ' + m.mo_ta : '') + (m.kieu === 'local' ? '  [cổng ' + m.cong + ']' : ''),
    });
  }).join('');

  const tat = S.modules.filter((m) => !m.bat);
  if (tat.length) {
    html += '<div class="rail-group">Đang ẩn</div>';
    html += tat.map((m) => item({
      id: m.id, href: '#/cai-dat', icon: m.icon, ten: m.ten, mau: '#8b95a7',
    })).join('');
  }

  nav.innerHTML = html;
}

/* ---------------- sân khấu: iframe từng module ---------------- */
function khungCuaModule(mod) {
  if (S.frames.has(mod.id)) return S.frames.get(mod.id);

  const wrap = document.createElement('div');
  wrap.className = 'page';
  wrap.style.padding = '0';
  wrap.innerHTML = '<div class="frame-loading"><span class="spin"></span> Đang mở ' + esc(mod.ten) + '…</div>';

  const f = document.createElement('iframe');
  f.src = mod.kieu === 'local' ? '/m/' + mod.id + '/' : mod.url;
  f.title = mod.ten;
  f.setAttribute('allow', 'clipboard-write; fullscreen');
  f.addEventListener('load', () => {
    const l = wrap.querySelector('.frame-loading');
    if (l) l.remove();
    // module vừa nạp -> đẩy theme hiện tại xuống ngay cho khỏi nháy sai tone
    try { f.contentWindow.postMessage({ hub: 'theme', v: themeThuc() }, location.origin); } catch (_) {}
  });

  wrap.appendChild(f);
  $('#stage').appendChild(wrap);
  const o = { wrap, iframe: f, mod };
  S.frames.set(mod.id, o);
  return o;
}

function moModule(id) {
  const mod = S.modules.find((m) => m.id === id);
  if (!mod) { location.hash = '#/tong-quan'; return; }

  if (mod.kieu === 'lark') {
    window.open(mod.larkUrl || mod.url, '_blank', 'noopener');
    location.hash = '#/tong-quan';
    return;
  }

  S.view = id;
  $('#pageHome').hidden = true;
  const o = khungCuaModule(mod);
  S.frames.forEach((x, k) => { x.wrap.hidden = k !== id; });
  o.wrap.hidden = false;
  document.title = mod.ten + ' · Marketing Hub';
  veRail();
}

function moHome() {
  S.view = 'home';
  $('#pageHome').hidden = false;
  S.frames.forEach((x) => { x.wrap.hidden = true; });
  document.title = 'Marketing Hub · Rooty Trip';
  veRail();
  veThanhLoc();
  napTongQuan();
}

/* ---------------- trang Tổng quan chung ---------------- */
/* ---------------- thanh lọc thời gian (dùng chung cho các trang) ---------------- */
const dmy = (s) => String(s || '').split('-').reverse().join('/');

function veThanhLoc() {
  const k = khoangDangLoc();
  const html =
    '<span class="loc-nhan">Thời gian</span>' +
    '<div class="seg">' + KY.map(([v, t]) =>
      '<button data-ky="' + v + '" class="' + (S.ky === v ? 'on' : '') + '">' + esc(t) + '</button>').join('') +
    '</div>' +
    '<span class="loc-ngay"' + (S.ky === 'tuychon' ? '' : ' hidden') + '>' +
      '<input type="date" class="tuNgay" value="' + esc(S.tu) + '">' +
      '<span class="loc-mo">→</span>' +
      '<input type="date" class="denNgay" value="' + esc(S.den) + '">' +
    '</span>' +
    '<span class="loc-mo">' + (k ? dmy(k.tu) + ' → ' + dmy(k.den) : 'Toàn bộ dữ liệu') + '</span>' +
    '<span class="grow"></span>' +
    (S.ky === KY_MAC_DINH ? '' : '<button class="btn ghost nho btnMacDinh">Về mặc định</button>');

  $$('.loc-bar').forEach((el) => { el.innerHTML = html; });
}

/** Bộ lọc đổi -> nạp lại đúng trang đang mở. */
function napTheoTrang() {
  if (S.view === 'home') napTongQuan();
}

function datKy(ky) {
  S.ky = ky;
  if (ky === 'tuychon' && (!S.tu || !S.den)) {
    const k = khoangDangLoc() || {};
    const now = new Date();
    S.tu = k.tu || d2s(new Date(now.getFullYear(), now.getMonth(), 1));
    S.den = k.den || d2s(now);
  }
  luuLoc();
  veThanhLoc();
  napTheoTrang();
}

function luuLoc() {
  try {
    localStorage.setItem('hub.ky', S.ky);
    localStorage.setItem('hub.tu', S.tu);
    localStorage.setItem('hub.den', S.den);
  } catch (_) {}
}

function docLoc() {
  try {
    const x = localStorage.getItem('hub.xem');
    if (x === 'luoi' || x === 'ngay') S.xem = x;
    const k = localStorage.getItem('hub.ky');
    if (k && KY.some(([x]) => x === k)) S.ky = k;
    S.tu = localStorage.getItem('hub.tu') || '';
    S.den = localStorage.getItem('hub.den') || '';
  } catch (_) {}
}

function theHtml(t, moduleId) {
  const muc = t.muc || '';
  let lech = '';
  // 0% vs kỳ trước khi số cũng bằng 0 chỉ là rác — bỏ đi
  if (t.lech != null && Number.isFinite(t.lech) && !(t.lech === 0 && !Number(t.so))) {
    const tot = t.dao ? t.lech < 0 : t.lech > 0;
    lech = '<div class="lech ' + (t.lech === 0 ? '' : tot ? 'tot' : 'xau') + '">' +
      (t.lech > 0 ? '+' : t.lech < 0 ? '−' : '') + Math.abs(t.lech) + '% vs kỳ trước</div>';
  }
  const dai = t.dinhDang === 'vnd' && Math.abs(Number(t.so) || 0) >= 1000000 ? ' dai' : '';
  // thẻ số bấm được: mở thẳng app của base (kèm tab nếu bộ đọc khai)
  const mo = moduleId
    ? ' data-mo="' + esc(moduleId) + '"' + (t.tab ? ' data-tab="' + esc(t.tab) + '"' : '') +
      ' title="Mở app để xử lý"'
    : '';
  return '<div class="the ' + muc + (moduleId ? ' bam-duoc' : '') + '"' + mo + '>' +
    '<div class="nhan">' + esc(t.nhan) + '</div>' +
    '<div class="so' + dai + '">' + so(t.so, t.dinhDang) + '</div>' + lech +
    (t.ghi ? '<div class="ghi">' + esc(t.ghi) + '</div>' : '') + '</div>';
}

function dongViecHtml(v, tenModule) {
  // có id thì cả dòng bấm được: mở app rồi mở đúng bản ghi đó
  const mo = v.id && v.module
    ? ' data-mo="' + esc(v.module) + '" data-rec="' + esc(v.id) + '" title="Bấm để mở việc này trong app"'
    : '';
  return '<div class="viec-dong' + (mo ? ' bam-duoc' : '') + '"' + mo + '>' +
    '<span class="muc muc-' + (v.muc || 'thap') + '"></span>' +
    '<div class="noi"><div class="tieu-de">' + esc(v.tieuDe) + '</div>' +
    (v.phu ? '<div class="phu">' + esc(v.phu) + '</div>' : '') +
    ((v.the || []).length ? '<div>' + v.the.map((x) => '<span class="the-nho">' + esc(x) + '</span>').join('') + '</div>' : '') +
    '</div>' +
    (tenModule ? '<span class="mod">' + esc(tenModule) + '</span>' : '') +
    '</div>';
}

function veHome() {
  const body = $('#homeBody');
  const tq = S.tq;
  if (!tq) return;

  const byId = new Map((tq.modules || []).map((m) => [m.id, m]));
  const dsBat = S.modules.filter((m) => m.bat);

  /* --- băng cảnh báo module lỗi --- */
  let html = '';
  const hong = dsBat.filter((m) => m.kieu === 'local' &&
    ['loi', 'tat'].includes((m.tinhTrang || {}).trangThai));
  if (hong.length) {
    html += hong.map((m) => '<div class="canh-bao do">' +
      '<b>' + esc(m.ten) + '</b>' +
      '<span class="grow">' + esc((m.tinhTrang.loi || 'Đang tắt') + '') + '</span>' +
      '<button class="btn nho" data-batlai="' + esc(m.id) + '">Bật lại</button>' +
      '<button class="btn nho ghost" data-log="' + esc(m.id) + '">Xem log</button>' +
      '</div>').join('');
  }

  /* --- từng base một khối: số liệu lên trước --- */
  let khoiBase = '';
  dsBat.forEach((m) => {
    const r = byId.get(m.id);
    const tt = m.tinhTrang || {};
    const nhan = NHAN_TT[tt.trangThai] || ['', ''];
    let noi;
    if (!r) {
      noi = '<div class="trong">Base này chưa có bộ đọc chỉ số. Mở app để xem chi tiết, hoặc khai <code>kpi</code> trong <code>modules.json</code>.</div>';
    } else if (!r.ok) {
      noi = '<div class="canh-bao do"><span class="grow">Không đọc được chỉ số: ' + esc(r.loi || '') + '</span>' +
        '<button class="btn nho" data-batlai="' + esc(m.id) + '">Bật lại module</button></div>';
    } else {
      noi = '<div class="the-luoi">' + (r.the || []).map((x) => theHtml(x, m.id)).join('') + '</div>' +
        (r.cu ? '<div class="canh-bao" style="margin-top:12px"><span class="grow">Đang hiển thị số cũ (' +
          gio(r.luc) + ') — lần đọc mới nhất lỗi: ' + esc(r.loi || '') + '</span></div>' : '');
    }

    khoiBase += '<section class="nhom-base">' +
      '<div class="khoi-head">' +
      '<span class="kh-ic" style="background:' + esc(m.mau) + '22;color:' + esc(m.mau) + '">' + icon(m.icon) + '</span>' +
      // dòng phụ chỉ mang số liệu module tự báo, không mô tả suông
      '<div><h2>' + esc(m.ten) + '</h2>' +
      (S.phu.get(m.id) ? '<div class="kh-sub">' + esc(S.phu.get(m.id)) + '</div>' : '') + '</div>' +
      '<span class="grow"></span>' +
      // đang chạy thì chỉ một chấm nhỏ; chỉ khi cần chú ý mới hiện chữ
      (m.kieu !== 'local' ? ''
        : ['chay', 'ngoai'].includes(tt.trangThai)
          ? '<span class="den luc" title="' + esc(nhan[0]) + '"></span>'
          : '<span class="chip ' + nhan[1] + '" title="' + esc(tt.loi || nhan[0]) + '">' + esc(nhan[0]) + '</span>') +
      (m.larkUrl ? '<a class="btn ghost nho" href="' + esc(m.larkUrl) + '" target="_blank" rel="noreferrer" title="Mở Lark Base trong tab mới">Base</a>' : '') +
      '<a class="btn nho primary" href="' + (m.kieu === 'lark' ? '#/lark/' + m.id : '#/m/' + m.id) + '" title="Mở app ' + esc(m.ten) + '">Mở app</a>' +
      '</div>' + noi + '</section>';
  });
  html += '<div class="luoi-base">' + khoiBase + '</div>';

  /* --- việc gấp bị bộ lọc thời gian che đi --- */
  if (tq.ngoaiKhoang) {
    const chiTiet = (tq.modules || []).filter((r) => r.ngoaiKhoangNhan)
      .map((r) => {
        const mm = S.modules.find((x) => x.id === r.id);
        return (mm ? mm.ten + ': ' : '') + r.ngoaiKhoangNhan;
      }).join(' · ');
    html += '<div class="canh-bao">' +
      '<b>Bộ lọc đang che ' + tq.ngoaiKhoang + ' việc gấp</b>' +
      '<span class="grow">' + esc(chiTiet) + '</span>' +
      '<button class="btn nho" data-ky="all">Xem toàn bộ</button></div>';
  }

  /* --- tải nhân sự: ai làm gì ngày nào --- */
  html += khoiTaiNhanSu();

  /* --- cần xử lý ngay (gộp mọi base), cuộn trong khối --- */
  const cxl = tq.canXuLy || [];
  html += '<section class="khoi">' +
    '<div class="khoi-head">' +
    '<span class="kh-ic" style="background:#fdeaec;color:#dc2b3d">' + icon('gap') + '</span>' +
    '<div><h2>Cần xử lý ngay</h2>' +
    (cxl.length ? '<div class="kh-sub">' + cxl.length + ' việc</div>' : '') + '</div>' +
    '<span class="grow"></span></div>' +
    '<div class="khoi-body"><div class="viec viec-cuon">' +
    (cxl.length ? cxl.map((v) => {
      const m = S.modules.find((x) => x.id === v.module);
      return dongViecHtml(v, m ? m.ten : v.module);
    }).join('') : '<div class="trong">Không còn việc nào.</div>') +
    '</div></div></section>';

  body.innerHTML = html;

  $('#homeSub').textContent = dsBat.length + ' base · ' + cxl.length + ' việc cần xử lý · cập nhật ' + gio(tq.luc);
  const ai = (tq.modules || []).map((m) => m.nguoi).find(Boolean);
  $('#homeUser').textContent = ai ? 'Tài khoản Lark: ' + ai : '';
  $('#homeUser').hidden = !ai;
}

/* ============================================================
   LỊCH CHUNG — lưới nhân sự × ngày
   Mục đích: thấy ai đang bị dồn việc ngày nào. Ô càng đậm càng nhiều việc,
   từ 4 việc/ngày trở lên tô đỏ (quá tải). Bấm vào ô để xem chi tiết.
   ============================================================ */
const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const NGUONG_QUA_TAI = 4;
// base nào là "đi tác nghiệp" — ngày có việc của base này được đánh chấm ở góc ô
const MODULE_TAC_NGHIEP = 'lich-tac-nghiep';

/** Khoảng cho lịch: luôn cần biên, chọn "Toàn bộ" thì lấy tháng hiện tại. */
function khoangLich() {
  const k = khoangDangLoc();
  if (k) return k;
  const now = new Date();
  return {
    tu: d2s(new Date(now.getFullYear(), now.getMonth(), 1)),
    den: d2s(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

let dangNapLich = false;
async function napLich(refresh) {
  if (dangNapLich) return;
  dangNapLich = true;
  const k = khoangLich();
  try {
    const q = new URLSearchParams({ tu: k.tu, den: k.den });
    if (refresh) q.set('refresh', '1');
    S.lich = await goi('/api/lich-chung?' + q);
    S.lichLoi = '';
  } catch (e) {
    S.lich = null;
    S.lichLoi = e.message;
  } finally {
    dangNapLich = false;
  }
}

/** Khối "Tải nhân sự" trong trang Tổng quan: dải nhiệt người × ngày. */
function khoiTaiNhanSu() {
  const d = S.lich;
  if (S.lichLoi) {
    return '<section class="khoi"><div class="khoi-head"><div><h2>Tải nhân sự</h2></div></div>' +
      '<div class="khoi-body"><div class="canh-bao do"><span class="grow">' + esc(S.lichLoi) + '</span></div></div></section>';
  }
  if (!d) {
    return '<section class="khoi"><div class="khoi-head"><div><h2>Tải nhân sự</h2></div></div>' +
      '<div class="khoi-body"><div class="trong"><span class="spin"></span> Đang nạp…</div></div></section>';
  }

  const nguoi = d.hang.filter((r) => r.id);
  const quaTai = nguoi.filter((r) => r.dinh >= NGUONG_QUA_TAI);
  const dinhCao = Math.max(1, ...d.hang.map((r) => r.tong));

  const head = '<div class="khoi-head">' +
    '<span class="kh-ic" style="background:#eaf0ff;color:#2b5cff">' + icon('nguoi') + '</span>' +
    '<div><h2>Tải nhân sự</h2><div class="kh-sub">' +
      nguoi.length + ' người · ' + d.tongLuot + ' lượt' +
      (quaTai.length ? ' · ' + quaTai.length + ' người có ngày ≥ ' + NGUONG_QUA_TAI + ' việc' : '') +
    '</div></div>' +
    '<span class="grow"></span>' +
    '<div class="seg seg-nho">' +
      [['luoi', 'Dải nhiệt'], ['ngay', 'Theo ngày']].map(([v, t]) =>
        '<button data-xem="' + v + '" class="' + (S.xem === v ? 'on' : '') + '">' + t + '</button>').join('') +
    '</div>' +
    '<span class="thang-do" title="số việc trong một ngày">' +
      '<i class="m0"></i><i class="m1"></i><i class="m2"></i><i class="m3"></i><i class="m4"></i>' +
      '<b>' + NGUONG_QUA_TAI + '+</b>' +
    '</span>' +
    '<span class="chu-thich"><i class="tn-diem tn-diem-tho"></i>tác nghiệp</span></div>';

  return '<section class="khoi khoi-tai">' + head + '<div class="khoi-body">' +
    (S.xem === 'ngay' ? lichTheoNgay(d) : daiNhiet(d, dinhCao)) +
    '</div></section>';
}

/** Dải nhiệt: mỗi người một hàng ô bo góc, đậm dần theo số việc trong ngày. */
function daiNhiet(d, dinhCao) {
  const homNay = d2s(new Date());
  const cot = d.ngay.map((n) => {
    const t = new Date(n + 'T00:00:00');
    return { n, ngay: Number(n.slice(8)), thu: t.getDay(), nay: n === homNay };
  });
  const mucCua = (so) => (so >= NGUONG_QUA_TAI ? 4 : so);

  // thước ngày: chỉ ghi mốc 1 / 5 / 10 … cho đỡ rối
  const thuoc = cot.map((c) => {
    const ghi = c.ngay === 1 || c.ngay % 5 === 0;
    return '<span class="tn-moc' + (c.nay ? ' nay' : '') + '">' + (ghi ? c.ngay : '') + '</span>';
  }).join('');

  const hang = d.hang.map((r) => {
    const o = cot.map((c) => {
      const ds = r.o[c.n] || [];
      const m = mucCua(ds.length);
      // ngày đó có đi tác nghiệp -> chấm nhỏ góc trên phải của ô
      const soTN = ds.filter((v) => v.module === MODULE_TAC_NGHIEP).length;
      const tip = ds.length
        ? dmy(c.n) + ' · ' + ds.length + ' việc' + (soTN ? ' (' + soTN + ' tác nghiệp)' : '') + '\n' +
          ds.slice(0, 6).map((v) => '· ' + (v.gio ? v.gio + ' ' : '') + v.tieuDe).join('\n')
        : '';
      return '<span class="tn-o m' + m + (c.nay ? ' nay' : '') + (c.thu === 0 || c.thu === 6 ? ' cuoi' : '') + '"' +
        (ds.length ? ' data-n="' + c.n + '" data-nguoi="' + esc(r.id) + '" title="' + esc(tip) + '"' : '') +
        '>' + (ds.length >= NGUONG_QUA_TAI ? ds.length : '') +
        (soTN ? '<i class="tn-diem" ></i>' : '') + '</span>';
    }).join('');

    return '<div class="tn-hang' + (r.id ? '' : ' chua') + '">' +
      '<div class="tn-ten" title="' + esc(r.ten) + '">' + esc(r.ten) +
        (r.gap ? '<span class="tn-gap" title="việc gấp / quá hạn">' + r.gap + '</span>' : '') + '</div>' +
      '<div class="tn-dai">' + o + '</div>' +
      '<div class="tn-tong"><span class="tn-cot" style="width:' +
        Math.round((r.tong / dinhCao) * 100) + '%"></span><b>' + r.tong + '</b></div>' +
      '</div>';
  }).join('');

  return '<div class="tai-nhiet">' +
    '<div class="tn-hang tn-thuoc"><div class="tn-ten"></div><div class="tn-dai">' + thuoc +
    '</div><div class="tn-tong"></div></div>' + hang + '</div>';
}

/** Danh sách theo từng ngày: ai làm gì hôm đó. */
function lichTheoNgay(d) {
  const homNay = d2s(new Date());
  let h = '<div class="ngay-cot">';

  d.ngay.forEach((n) => {
    const t = new Date(n + 'T00:00:00');
    const theoNguoi = d.hang
      .map((r) => ({ ten: r.ten, id: r.id, ds: r.o[n] || [] }))
      .filter((x) => x.ds.length);
    if (!theoNguoi.length) return;

    h += '<section class="khoi ngay-khoi' + (n === homNay ? ' nay' : '') + '">' +
      '<div class="khoi-head"><div><h2>' + THU[t.getDay()] + ' · ' + dmy(n) + '</h2>' +
      '<div class="kh-sub">' + (d.theoNgay[n] || 0) + ' lượt · ' + theoNguoi.length + ' người</div></div></div>' +
      '<div class="khoi-body ngay-body">' +
      theoNguoi.map((x) => '<div class="ng-dong' + (x.ds.length >= NGUONG_QUA_TAI ? ' qua-tai' : '') + '">' +
        '<div class="ng-ten">' + esc(x.ten) + '<span class="ng-n">' + x.ds.length + '</span></div>' +
        '<div class="ng-viec">' + x.ds.map((v) => vienViecHtml(v)).join('') + '</div>' +
        '</div>').join('') +
      '</div></section>';
  });

  h += '</div>';
  return h.includes('ngay-khoi') ? h : '<div class="trong">Không có việc nào trong khoảng này.</div>';
}

function vienViecHtml(v) {
  const m = S.modules.find((x) => x.id === v.module);
  return '<span class="viec-vien muc-' + esc(v.muc) + (v.vai === 'ho-tro' ? ' ho-tro' : '') + '"' +
    ' title="' + esc((m ? m.ten + ' · ' : '') + v.trangThai + (v.vai === 'ho-tro' ? ' · hỗ trợ' : '')) + '">' +
    (v.gio ? '<b>' + esc(v.gio) + '</b> ' : '') + esc(v.tieuDe) + '</span>';
}

/* ---------------- mở đúng bản ghi trong app con ----------------
 * Lớp vỏ không tự sửa dữ liệu: nó mở app của base rồi nhờ app mở ô chi tiết
 * (postMessage cùng origin). Mọi quy tắc nghiệp vụ vẫn nằm trong app.
 */
function moViec(moduleId, rec) {
  const mod = S.modules.find((m) => m.id === moduleId);
  if (!mod) return;
  if (mod.kieu === 'lark') { window.open(mod.larkUrl || mod.url, '_blank', 'noopener'); return; }

  dongModal();
  location.hash = '#/m/' + moduleId;

  /* App con phải nạp xong dữ liệu từ Base mới mở được ô chi tiết, mà lúc iframe
   * vừa load thì nó chưa có gì. Nên gửi lại đến khi app báo "đã mở" (ack) hoặc
   * hết 12s. Rẻ hơn nhiều so với việc bắt app phát tín hiệu "đã nạp xong". */
  if (S.doiMo) { clearInterval(S.doiMo.timer); S.doiMo = null; }
  const gui = () => {
    const f = S.frames.get(moduleId);
    if (!f) return;
    try { f.iframe.contentWindow.postMessage({ hub: 'open', rec }, location.origin); } catch (_) {}
  };
  let lan = 0;
  gui();
  S.doiMo = {
    rec,
    timer: setInterval(() => {
      lan += 1;
      if (lan > 12) { clearInterval(S.doiMo.timer); S.doiMo = null; return; }
      gui();
    }, 1000),
  };
}

/** Mở app của base, kèm gợi ý tab nếu app hiểu (VD tab Cảnh báo của app quảng cáo). */
function moTab(moduleId, tab) {
  const daCo = S.frames.has(moduleId);
  location.hash = '#/m/' + moduleId;
  if (!tab) return;
  const gui = () => {
    const f = S.frames.get(moduleId);
    if (!f) return;
    try { f.iframe.contentWindow.postMessage({ hub: 'tab', v: tab }, location.origin); } catch (_) {}
  };
  if (daCo) gui();
  else {
    const f = S.frames.get(moduleId);
    if (f) f.iframe.addEventListener('load', () => setTimeout(gui, 400), { once: true });
  }
}

/** Bấm một ô trong lưới -> chi tiết việc của người đó trong ngày đó. */
function moChiTietO(nguoiId, ngay) {
  const d = S.lich;
  if (!d) return;
  const r = d.hang.find((x) => x.id === nguoiId);
  if (!r) return;
  const ds = (r.o[ngay] || []);
  const t = new Date(ngay + 'T00:00:00');

  moModal(r.ten + ' · ' + THU[t.getDay()] + ' ' + dmy(ngay),
    '<div class="viec">' + ds.map((v) => {
      const m = S.modules.find((x) => x.id === v.module);
      return '<div class="viec-dong bam-duoc" data-mo="' + esc(v.module) + '" data-rec="' + esc(v.id) +
        '" title="Bấm để mở việc này trong app">' +
        '<span class="muc muc-' + (v.muc === 'cao' ? 'cao' : v.muc === 'vua' ? 'vua' : 'thap') + '"></span>' +
        '<div class="noi"><div class="tieu-de">' + esc(v.tieuDe) + '</div>' +
        '<div class="phu">' + [v.gio, v.trangThai, v.vai === 'ho-tro' ? 'hỗ trợ' : '']
          .filter(Boolean).map(esc).join(' · ') + '</div>' +
        ((v.the || []).length ? '<div>' + v.the.map((x) => '<span class="the-nho">' + esc(x) + '</span>').join('') + '</div>' : '') +
        '</div>' +
        (m ? '<span class="mod">' + esc(m.ten) + '</span>' : '') +
        '</div>';
    }).join('') + '</div>',
    '<button class="btn ghost" data-close="1">Đóng</button>');
}

/* ---------------- nạp dữ liệu ---------------- */
async function napHub() {
  const d = await goi('/api/hub');
  S.hub = d;
  S.modules = d.modules || [];
  $('#hubTen').textContent = d.ten;
  $('#hubPhu').textContent = d.phu;
  // phân quyền là việc của quản lý -> nhân sự không thấy nút đó trong Cài đặt
  S.quanLy = !!d.quanLy;
  veRail();
}

let dangNapTQ = false;
async function napTongQuan(refresh) {
  if (dangNapTQ) return;
  dangNapTQ = true;
  try {
    const k = khoangDangLoc();
    const q = new URLSearchParams();
    if (refresh) q.set('refresh', '1');
    if (k) { q.set('tu', k.tu); q.set('den', k.den); }
    const [tq] = await Promise.all([
      goi('/api/tongquan' + (q.toString() ? '?' + q : '')),
      napLich(refresh),
    ]);
    S.tq = tq;
    if (S.view === 'home') veHome();
    veRail();
  } catch (e) {
    if (S.view === 'home') $('#homeBody').innerHTML =
      '<div class="canh-bao do"><span class="grow">Không đọc được tổng quan: ' + esc(e.message) + '</span></div>';
  } finally {
    dangNapTQ = false;
  }
}

/* ---------------- modal ---------------- */
function moModal(tieuDe, thanHtml, chanHtml, rong) {
  $('.modal').classList.toggle('rong', !!rong);   // bảng nhiều cột thì nới hộp thoại
  $('#mdTitle').textContent = tieuDe;
  $('#mdBody').innerHTML = thanHtml;
  $('#mdFoot').innerHTML = chanHtml || '<button class="btn ghost" data-close="1">Đóng</button>';
  $('#modalWrap').hidden = false;
}
const dongModal = () => { $('#modalWrap').hidden = true; };

/* ---- Cài đặt ---- */
function modalCaiDat() {
  const dong = S.modules.map((m) => {
    const tt = m.tinhTrang || {};
    const nhan = NHAN_TT[tt.trangThai] || ['', ''];
    return '<tr>' +
      '<td><b>' + esc(m.ten) + '</b></td>' +
      '<td>' + esc(m.kieu) + (m.kieu === 'local' ? ' · :' + m.cong : '') + '</td>' +
      '<td><span class="chip ' + nhan[1] + '">' + esc(nhan[0]) + '</span>' +
      (tt.loi ? '<div class="kh-sub" style="color:#f54a45">' + esc(tt.loi) + '</div>' : '') + '</td>' +
      '<td><div class="thao-tac">' +
      (m.kieu === 'local'
        ? '<button class="btn nho" data-batlai="' + esc(m.id) + '">Bật lại</button>' +
          '<button class="btn nho ghost" data-tat="' + esc(m.id) + '">Tắt</button>' +
          '<button class="btn nho ghost" data-log="' + esc(m.id) + '">Log</button>'
        : '') +
      '<button class="btn nho ghost" data-an="' + esc(m.id) + '">' + (m.bat ? 'Ẩn khỏi panel' : 'Hiện lại') + '</button>' +
      '<button class="btn nho do" data-xoa="' + esc(m.id) + '">Xoá</button>' +
      '</div></td></tr>';
  }).join('');

  moModal('Cài đặt · các base trong panel',
    '<div id="oToi" class="canh-bao" hidden></div>' +
    '<table class="bang"><thead><tr><th>Base</th><th>Kiểu</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>' +
    '<tbody>' + dong + '</tbody></table>',
    (S.quanLy ? '<button class="btn ghost" id="btnPhanQuyen">Phân quyền thành viên</button>' : '') +
    '<button class="btn ghost" id="btnKiemTra">Kiểm tra hệ thống</button>' +
    '<button class="btn ghost" data-close="1">Đóng</button>');

  const bkt = $('#btnKiemTra');
  if (bkt) bkt.onclick = modalKiemTra;
  const bpq = $('#btnPhanQuyen');
  if (bpq) bpq.onclick = () => modalPhanQuyen();   // định nghĩa trong quyen.js

  /* Chế độ chạy chung: mỗi app Lark thấy một open_id khác nhau cho cùng một người.
   * Hiện id ngay đây để dán vào LARK_MANAGER_IDS khi cần cấp vai quản lý. */
  goi('/api/toi').then((t) => {
    const o = $('#oToi');
    if (!o || t.che_do !== 'api' || !t.id) return;
    o.hidden = false;
    o.className = 'canh-bao' + (t.la_quan_ly ? '' : ' do');
    const khoa = t.email || t.id;
    const bien = t.email ? 'LARK_MANAGER_EMAILS' : 'LARK_MANAGER_IDS';
    o.innerHTML = '<div class="grow"><b>' + esc(t.ten || '') + '</b> · <code>' + esc(khoa) + '</code>' +
      '<div class="kh-sub">' + (t.la_quan_ly
        ? 'Đang có vai quản lý.'
        : 'Chưa có vai quản lý — thêm chuỗi này vào biến ' + bien + ' trên Render rồi Save.') +
      '</div></div>' +
      '<button class="btn nho" data-copy-id="' + esc(khoa) + '">Copy</button>';
  }).catch(() => {});
}

/** Tự kiểm tra hệ thống: nói rõ đang thiếu quyền gì, ở đâu. */
async function modalKiemTra() {
  moModal('Kiểm tra hệ thống', '<div class="trong"><span class="spin"></span> Đang hỏi từng base…</div>',
    '<button class="btn ghost" data-close="1">Đóng</button>');
  let d;
  try { d = await goi('/api/kiem-tra'); } catch (e) {
    $('#mdBody').innerHTML = '<div class="canh-bao do"><span class="grow">' + esc(e.message) + '</span></div>';
    return;
  }

  const h = d.hub;
  const dong = (nhan, gt, tot) =>
    '<tr><td>' + esc(nhan) + '</td><td><b class="' + (tot === false ? 'kt-xau' : tot === true ? 'kt-tot' : '') + '">' +
    esc(gt) + '</b></td></tr>';

  let html = '<table class="bang"><tbody>' +
    dong('Chế độ', h.che_do === 'api' ? 'api (server chung)' : 'cli (máy cá nhân)') +
    (h.commit ? dong('Bản đang chạy', h.commit) : '') +
    (h.che_do === 'api' ? (
      dong('Tài khoản của bạn', h.toi ? h.toi.ten + '  ·  ' + h.toi.id : 'chưa đăng nhập', !!h.toi) +
      dong('Vai quản lý', h.la_quan_ly ? 'có' : 'KHÔNG — dán open_id trên vào LARK_MANAGER_IDS', h.la_quan_ly) +
      dong('Số quản lý đang khai', String(h.so_quan_ly_dang_khai), h.so_quan_ly_dang_khai > 0) +
      dong('PUBLIC_URL', (h.public_url || '(trống)') + (h.public_url_khop ? '' : '  ≠  ' + h.host_that), h.public_url_khop) +
      dong('Khoá phiên (SESSION_SECRET)', h.co_session_secret ? 'có' : 'THIẾU', h.co_session_secret)
    ) : '') +
    '</tbody></table>';

  html += '<div class="the-luoi" style="margin-top:14px">' + (d.modules || []).map((m) => {
    const loi = m.loi || '';
    const ma = /9999167d/.test(loi) ? 'Thiếu quyền (scope) hoặc chưa Publish version'
      : /91403/.test(loi) ? 'App chưa được chia sẻ Base này'
      : /Cannot find module|lark-cli/.test(loi) ? 'Đang gọi lark-cli — sai chế độ chạy'
      : '';
    return '<div class="the ' + (loi ? 'cao' : 'ok') + '">' +
      '<div class="nhan">' + esc(m.ten) + '</div>' +
      (loi
        ? '<div class="ghi" style="color:var(--do)"><b>' + esc(ma || 'Lỗi') + '</b><br>' + esc(loi.slice(0, 180)) + '</div>'
        : '<div class="so">' + (m.tong == null ? '—' : so(m.tong)) + '</div>' +
          '<div class="ghi">bản ghi đọc được' +
          (m.vai ? ' · vai: ' + esc(m.vai) : '') +
          (m.danhBa != null ? ' · danh bạ ' + m.danhBa : '') +
          (m.phamVi != null ? ' · phạm vi ' + m.phamVi : '') +
          '</div>') +
      '</div>';
  }).join('') + '</div>';

  $('#mdBody').innerHTML = html;
}

async function modalLog(id) {
  const m = S.modules.find((x) => x.id === id);
  const d = await goi('/api/modules/' + encodeURIComponent(id) + '/log?n=200');
  const html = (d.logs || []).map((l) =>
    '<span class="t">' + esc(l.t) + '</span> <span class="' + esc(l.loai) + '">' + esc(l.d) + '</span>').join('\n');
  moModal('Log · ' + (m ? m.ten : id),
    '<div class="log">' + (html || 'Chưa có log.') + '</div>',
    '<button class="btn ghost" data-lograeload="' + esc(id) + '">Tải lại log</button>' +
    '<button class="btn nho primary" data-batlai="' + esc(id) + '">Bật lại module</button>' +
    '<button class="btn ghost" data-close="1">Đóng</button>');
  const box = $('.log');
  if (box) box.scrollTop = box.scrollHeight;
}

/* ---- Thêm base ---- */
function modalThem() {
  moModal('Thêm base vào panel', `
    <div class="dong-form">
      <label>Kiểu</label>
      <select id="fKieu">
        <option value="local">App Node trên máy này</option>
        <option value="ngoai">App đã có URL riêng</option>
        <option value="lark">Mở thẳng Lark Base</option>
      </select>
      <label>Tên hiển thị</label><input type="text" id="fTen" placeholder="Theo dõi chiến dịch">
      <label>Chữ viết tắt</label><input type="text" id="fIcon" value="BS" maxlength="3" style="width:80px">
      <label>Màu</label><input type="text" id="fMau" value="#2b5cff" style="width:120px">
    </div>
    <div class="dong-form" id="nhomLocal">
      <label>Thư mục app</label><input type="text" id="fThuMuc" placeholder="../lark-app-moi">
      <label>Cổng</label><input type="number" id="fCong" placeholder="5177" style="width:140px">
    </div>
    <div class="dong-form" id="nhomUrl" hidden>
      <label>URL app</label><input type="url" id="fUrl" placeholder="https://...">
    </div>
    <div class="dong-form">
      <label>Link Lark Base</label><input type="url" id="fLark" placeholder="https://rootytrip2.sg.larksuite.com/base/...">
      <label>Bộ đọc chỉ số</label>
      <select id="fKpi"><option value="">— chưa có —</option></select>
    </div>`,
    '<button class="btn ghost" data-close="1">Huỷ</button><button class="btn primary" id="btnLuuThem">Thêm base</button>');

  goi('/api/bo-doc-kpi').then((d) => {
    const sel = $('#fKpi');
    (d.ds || []).forEach((k) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = k;
      sel.appendChild(o);
    });
  }).catch(() => {});

  $('#fKieu').onchange = () => {
    const k = $('#fKieu').value;
    $('#nhomLocal').hidden = k !== 'local';
    $('#nhomUrl').hidden = k === 'local';
  };

  $('#btnLuuThem').onclick = async () => {
    const b = {
      kieu: $('#fKieu').value,
      ten: $('#fTen').value.trim(),
      mo_ta: '',
      icon: $('#fIcon').value.trim() || '▦',
      mau: $('#fMau').value.trim(),
      larkUrl: $('#fLark').value.trim(),
      kpi: $('#fKpi').value,
      thuMuc: $('#fThuMuc') ? $('#fThuMuc').value.trim() : '',
      cong: $('#fCong') ? Number($('#fCong').value) : 0,
      url: $('#fUrl') ? $('#fUrl').value.trim() : '',
    };
    try {
      const m = await goi('/api/modules', { method: 'POST', body: JSON.stringify(b) });
      dongModal();
      toast('Đã thêm "' + m.ten + '" vào panel', 'luc');
      await napHub();
      location.hash = m.kieu === 'lark' ? '#/tong-quan' : '#/m/' + m.id;
      napTongQuan(true);
    } catch (e) {
      toast(e.message, 'do');
    }
  };
}

/* ---------------- hành động module ---------------- */
async function hanhDong(id, act) {
  const m = S.modules.find((x) => x.id === id);
  try {
    if (act === 'batlai') {
      toast('Đang bật lại ' + (m ? m.ten : id) + '…');
      const r = await goi('/api/modules/' + encodeURIComponent(id) + '/bat-lai', { method: 'POST' });
      const tb = r.tinhTrang && r.tinhTrang.thongBao;
      if (tb) { toast(tb, 'do'); await napHub(); return; }
      // nạp lại iframe sau vài giây cho module kịp sẵn sàng
      setTimeout(() => {
        const f = S.frames.get(id);
        if (f) f.iframe.src = f.iframe.src;
        napHub().then(() => napTongQuan(true));
      }, 3000);
    } else if (act === 'tat') {
      const r = await goi('/api/modules/' + encodeURIComponent(id) + '/tat', { method: 'POST' });
      const tb = r.tinhTrang && r.tinhTrang.thongBao;
      toast(tb || ('Đã tắt ' + (m ? m.ten : id)), tb ? 'do' : '');
      await napHub();
      if (!$('#modalWrap').hidden) modalCaiDat();
    } else if (act === 'an') {
      const bat = !(m && m.bat);
      await goi('/api/modules/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ bat }) });
      toast(bat ? 'Đã hiện lại trong panel' : 'Đã ẩn khỏi panel');
      await napHub();
      if (!bat && S.view === id) location.hash = '#/tong-quan';
      modalCaiDat();
    } else if (act === 'xoa') {
      if (!confirm('Xoá "' + (m ? m.ten : id) + '" khỏi panel? Thư mục app và dữ liệu trên Lark Base KHÔNG bị xoá.')) return;
      await goi('/api/modules/' + encodeURIComponent(id), { method: 'DELETE' });
      const f = S.frames.get(id);
      if (f) { f.wrap.remove(); S.frames.delete(id); }
      toast('Đã xoá khỏi panel');
      await napHub();
      if (S.view === id) location.hash = '#/tong-quan';
      modalCaiDat();
    }
  } catch (e) {
    toast(e.message, 'do');
  }
}

/* ---------------- router ---------------- */
function dinhTuyen() {
  const h = location.hash.replace(/^#/, '') || '/tong-quan';
  const mm = /^\/m\/(.+)$/.exec(h);
  const ml = /^\/lark\/(.+)$/.exec(h);
  // #/lich-chung  hoặc  #/lich-chung?xem=ngay  (chia chuỗi, không dùng regex)
  const [duong, truyVan] = h.split('?');
  if (duong === '/lich-chung') {                 // link cũ: lịch giờ nằm trong Tổng quan
    const x = new URLSearchParams(truyVan || '').get('xem');
    if (x === 'luoi' || x === 'ngay') S.xem = x;
    location.hash = '#/tong-quan';
    return;
  }
  if (h === '/cai-dat') { moHome(); modalCaiDat(); return; }
  if (h === '/phan-quyen') { moHome(); modalPhanQuyen(); return; }
  if (ml) { moModule(decodeURIComponent(ml[1])); return; }
  if (mm) { moModule(decodeURIComponent(mm[1])); return; }
  moHome();
}

/* ---------------- gắn sự kiện ---------------- */
document.addEventListener('click', (e) => {
  // đổi khoảng lọc: nút trong thanh lọc, hoặc nút nhanh trong băng cảnh báo
  const dk = e.target.closest('[data-ky]');
  if (dk) { e.preventDefault(); datKy(dk.getAttribute('data-ky')); return; }
  if (e.target.closest('.btnMacDinh')) {
    e.preventDefault();
    S.tu = ''; S.den = '';
    datKy(KY_MAC_DINH);
    return;
  }
  // một ô trong lưới lịch chung
  const cp = e.target.closest('[data-copy-id]');
  if (cp) {
    e.preventDefault();
    navigator.clipboard.writeText(cp.getAttribute('data-copy-id'))
      .then(() => toast('Đã copy open_id', 'luc'))
      .catch(() => toast('Không copy được — bấm giữ để chọn thủ công', 'do'));
    return;
  }
  const th = e.target.closest('[data-theme-set]');
  if (th) {
    e.preventDefault();
    S.theme = th.getAttribute('data-theme-set');
    apTheme(true);
    return;
  }
  // bấm một việc (danh sách cần xử lý, hoặc trong ô chi tiết của dải nhiệt)
  const viec = e.target.closest('[data-rec][data-mo]');
  if (viec) { e.preventDefault(); moViec(viec.dataset.mo, viec.dataset.rec); return; }
  // bấm thẻ số -> mở app của base đó (kèm tab nếu có)
  const the = e.target.closest('.the[data-mo]');
  if (the) { e.preventDefault(); moTab(the.dataset.mo, the.dataset.tab || ''); return; }

  const o = e.target.closest('.tn-o[data-n]');
  if (o) { moChiTietO(o.dataset.nguoi, o.dataset.n); return; }
  const xem = e.target.closest('[data-xem]');
  if (xem) {
    S.xem = xem.getAttribute('data-xem');
    try { localStorage.setItem('hub.xem', S.xem); } catch (_) {}
    veHome();
    return;
  }

  const t = e.target.closest('[data-close],[data-batlai],[data-tat],[data-an],[data-xoa],[data-log],[data-lograeload]');
  if (!t) return;
  if (t.hasAttribute('data-close')) { dongModal(); return; }
  if (t.hasAttribute('data-log')) { e.preventDefault(); modalLog(t.getAttribute('data-log')); return; }
  if (t.hasAttribute('data-lograeload')) { e.preventDefault(); modalLog(t.getAttribute('data-lograeload')); return; }
  for (const a of ['batlai', 'tat', 'an', 'xoa']) {
    if (t.hasAttribute('data-' + a)) { e.preventDefault(); hanhDong(t.getAttribute('data-' + a), a); return; }
  }
});

$('#btnPin').onclick = () => {
  const r = $('#rail');
  r.classList.toggle('min');
  $('#btnPin').textContent = r.classList.contains('min') ? '›' : '‹';
  try { localStorage.setItem('hub.rail.min', r.classList.contains('min') ? '1' : '0'); } catch (_) {}
};
$('#btnAdd').onclick = modalThem;
$('#btnSettings').onclick = modalCaiDat;
$('#btnReload').onclick = () => napHub().then(() => napTongQuan(true));

// hai ô ngày của bộ lọc "Tuỳ chọn" — thanh lọc được vẽ lại nên bắt kiểu uỷ quyền
document.addEventListener('change', (e) => {
  if (!e.target.matches('.tuNgay, .denNgay')) return;
  const bar = e.target.closest('.loc-bar');
  S.tu = bar.querySelector('.tuNgay').value;
  S.den = bar.querySelector('.denNgay').value;
  if (S.tu && S.den) { S.ky = 'tuychon'; luuLoc(); veThanhLoc(); napTheoTrang(); }
});

window.addEventListener('hashchange', dinhTuyen);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modalWrap').hidden) dongModal();
});

// module tự báo phụ đề (số bản ghi, thời điểm nạp…) để panel hiển thị
window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin) return;
  const d = ev.data;
  // app con báo đã mở được bản ghi -> thôi gửi lại
  if (d && d.hub === 'opened') {
    if (S.doiMo && (!d.rec || d.rec === S.doiMo.rec)) { clearInterval(S.doiMo.timer); S.doiMo = null; }
    return;
  }
  if (d && d.hub === 'khong-thay') {
    if (S.doiMo) { clearInterval(S.doiMo.timer); S.doiMo = null; }
    toast('Không thấy việc này trong phạm vi bạn xem được', 'do');
    return;
  }
  if (!d || d.hub !== 'phu' || !d.id) return;
  const cu = S.phu.get(d.id);
  if ((d.text || '') === cu) return;
  S.phu.set(d.id, d.text || '');
  veRail();
});

/* ---------------- khởi động ---------------- */
(async function () {
  try {
    if (localStorage.getItem('hub.rail.min') === '1') {
      $('#rail').classList.add('min');
      $('#btnPin').textContent = '›';
    }
  } catch (_) {}

  docLoc();
  veThanhLoc();
  // icon cho hai nút cuối panel (khai bằng data-ic trong index.html)
  $$('[data-ic]').forEach((el) => { el.innerHTML = icon(el.getAttribute('data-ic')); });

  S.theme = docTheme();
  apTheme(false);
  // đang ở 'auto' mà hệ thống đổi sáng/tối -> đẩy tone mới xuống các module
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => { if (S.theme === 'auto') guiThemeXuongModule(); });

  try {
    await napHub();
  } catch (e) {
    $('#homeBody').innerHTML = '<div class="canh-bao do"><span class="grow">Không đọc được danh sách base: ' +
      esc(e.message) + '</span></div>';
    return;
  }
  dinhTuyen();
  napTongQuan();

  // trạng thái module 10s/lần; chỉ số 60s/lần (và khi quay lại tab)
  setInterval(() => napHub().catch(() => {}), 10000);
  setInterval(() => { if (!document.hidden) napTongQuan(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.view === 'home') napTongQuan(); });
})();
