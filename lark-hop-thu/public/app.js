'use strict';
/* ============================================================================
 * Hộp thư · giao diện
 * ----------------------------------------------------------------------------
 * Nội dung thư là dữ liệu từ bên ngoài: mọi chữ của thư đi qua esc() hoặc
 * textContent, không bao giờ chèn HTML của thư. Đường link trong thư chỉ nhận
 * http(s) và mở tab mới.
 *
 * Gọi API bằng đường TƯƠNG ĐỐI ('api/…') để chạy được cả riêng lẫn sau proxy
 * /m/hop-thu/ của hub.
 * ========================================================================== */

const $ = (s, g = document) => g.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  hop: [], chinh: '', ngan: [], ai: false,
  thu: [], loi: [], luc: 0,
  loc: { ngan: 'xu-ly', hop: '', tim: '' },
  chon: '',            // khoá thư đang mở: hop|id
  ct: null,            // chi tiết thư đang mở { thu, ai, hen }
  daLuu: new Map(),    // khoá → thư vừa lưu trữ, để hoàn tác
  dangNap: false,
};
const khoa = (t) => t.hop + '|' + t.id;

/* ---------------- gọi máy chủ ---------------- */

async function api(duong, opts = {}) {
  const r = await fetch('api/' + duong, Object.assign({
    headers: opts.body ? { 'content-type': 'application/json' } : {},
  }, opts, opts.body ? { method: opts.method || 'POST', body: JSON.stringify(opts.body) } : {}));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || ('Lỗi ' + r.status)); Object.assign(e, d, { ma: r.status }); throw e; }
  return d;
}
const duongThu = (t, viec) => 'thu/' + encodeURIComponent(t.hop) + '/' + encodeURIComponent(t.id) + (viec ? '/' + viec : '');

/** Thông báo: viên Dynamic Island của hub, chạy riêng thì ô nhỏ của app. */
function bao(chu, lop = '') {
  try { if (parent !== window && parent.__iosDao) { parent.__iosDao(chu, lop); return; } } catch (_) {}
  const h = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + lop;
  t.textContent = chu;
  h.appendChild(t);
  setTimeout(() => t.remove(), lop === 'loi' ? 6000 : 3200);
}

/* ---------------- thời gian ---------------- */

function gioNgan(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/.exec(s || '');
  if (!m) return s || '';
  const d = new Date(+m[1], m[2] - 1, +m[3]);
  const nay = new Date(); nay.setHours(0, 0, 0, 0);
  const lech = Math.round((nay - d) / 86400000);
  if (lech === 0) return m[4] + ':' + m[5];
  if (lech === 1) return 'Hôm qua';
  if (+m[1] === nay.getFullYear()) return +m[3] + '/' + +m[2];
  return +m[3] + '/' + +m[2] + '/' + m[1].slice(2);
}
function gioHen(ms) {
  const d = new Date(ms);
  return d.toLocaleString('vi-VN', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' });
}

/* ---------------- nạp dữ liệu ---------------- */

async function napHop() {
  const d = await api('hop');
  Object.assign(S, { hop: d.hop, chinh: d.chinh, ngan: d.ngan, ai: d.ai });
}

async function napThu(ep) {
  if (S.dangNap) return;
  S.dangNap = true;
  $('#btnLamMoi').classList.add('quay');
  try {
    const d = await api('thu' + (ep ? '?lam=1' : ''));
    S.thu = d.thu; S.loi = d.loi || []; S.luc = d.luc;
    ve();
    if (ep) bao('Đã đọc lại hộp thư', 'ok');
  } finally {
    S.dangNap = false;
    $('#btnLamMoi').classList.remove('quay');
  }
}

/* Xếp bằng AI những thư luật chưa nhận, chạy nền sau khi danh sách đã hiện. */
async function xepAi() {
  if (!S.ai || !S.thu.some((t) => t.nguon === 'mac-dinh')) return;
  try {
    const d = await api('xep-ai', { body: {} });
    if (d.xep) await napThu(false);
  } catch (e) { bao('AI chưa xếp được thư: ' + e.message, 'loi'); }
}

/* ---------------- lọc ---------------- */

function hienTrong(t, ngan) {
  if (S.daLuu.has(khoa(t))) return ngan === S.loc.ngan;      // giữ chỗ cho dòng "Hoàn tác"
  if (ngan === 'hen') return t.henDen > 0;
  return !t.henDen && t.ngan === ngan;
}
function khopLoc(t) {
  if (S.loc.hop && t.hop !== S.loc.hop) return false;
  const q = S.loc.tim.trim().toLowerCase();
  if (!q) return true;
  return (t.tu.ten + ' ' + t.tu.email + ' ' + t.tieuDe + ' ' + (t.tomTat || '')).toLowerCase().includes(q);
}

/* ---------------- vẽ ---------------- */

function ve() { veNgan(); veHop(); veDs(); veMoc(); }

function veMoc() {
  if (!S.luc) return;
  $('#moc').textContent = 'Đọc lúc ' + new Date(S.luc).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function veNgan() {
  const nav = $('#dsNgan');
  const ds = S.ngan.concat([{ id: 'hen', ten: 'Hẹn lại' }]);
  const dem = (id) => S.thu.filter((t) => !S.daLuu.has(khoa(t)) && hienTrong(t, id) && khopLoc(t)).length;
  nav.innerHTML = ds.map((n) => {
    const so = dem(n.id);
    return '<button role="tab" data-ngan="' + n.id + '" aria-selected="' + (S.loc.ngan === n.id) + '">' +
      esc(n.ten) + (so ? '<span class="so">' + so + '</span>' : '') + '</button>';
  }).join('') + '<span class="vien-truot"></span>';
  datVienTruot();
}
function datVienTruot() {
  const nav = $('#dsNgan');
  const b = nav.querySelector('[aria-selected="true"]');
  const v = nav.querySelector('.vien-truot');
  if (!b || !v) return;
  v.style.left = b.offsetLeft + 'px';
  v.style.width = b.offsetWidth + 'px';
}

function veHop() {
  const box = $('#dsHop');
  if (S.hop.length < 2) { box.hidden = true; return; }
  box.hidden = false;
  const dem = (email) => S.thu.filter((t) => (!email || t.hop === email) && t.chuaDoc && !t.henDen).length;
  const nut = (email, ten) => {
    const so = dem(email);
    return '<button class="chip" data-hop="' + esc(email) + '" aria-pressed="' + (S.loc.hop === email) + '">' +
      esc(ten) + (so ? '<span class="so">' + so + '</span>' : '') + '</button>';
  };
  box.innerHTML = nut('', 'Tất cả hộp') + S.hop.map((h) => nut(h.email, tenHop(h.email) + (h.chinh ? ' (chính)' : ''))).join('');
}

function dongThu(t) {
  const k = khoa(t);
  if (S.daLuu.has(k)) {
    return '<div class="da-luu" data-k="' + esc(k) + '"><span>Đã lưu trữ: ' + esc(t.tieuDe || '(không tiêu đề)') +
      '</span><button data-hoan="' + esc(k) + '">Hoàn tác</button></div>';
  }
  const phu = [];
  if (S.hop.length > 1 && !S.loc.hop) phu.push('<span class="nhan hop">' + esc(tenHop(t.hop)) + '</span>');
  if (t.sao) phu.push('<span class="nhan sao" aria-label="Có gắn sao">★</span>');
  if (t.henDen) phu.push('<span class="nhan lam">' + esc(gioHen(t.henDen)) + '</span>');
  else if (t.canLam) phu.push('<span class="nhan lam">Cần làm</span>');
  const dong2 = t.tomTat || t.canLam || t.lyDo || '';
  return '<button class="dong' + (t.chuaDoc ? ' chua-doc' : '') + '" data-k="' + esc(k) + '"' +
    (S.chon === k ? ' aria-current="true"' : '') + '>' +
    '<span class="cham"></span>' +
    '<span class="nguoi" data-no-i18n>' + esc(t.tu.ten || t.tu.email) + '</span>' +
    '<span class="gio">' + esc(gioNgan(t.ngay)) + '</span>' +
    '<span class="td" data-no-i18n>' + esc(t.tieuDe || '(không tiêu đề)') + '</span>' +
    '<span class="tt">' + phu.join('') + '<span' + (t.tomTat || t.canLam ? ' data-no-i18n' : '') + '>' + esc(dong2) + '</span></span>' +
    '</button>';
}

function veDs() {
  const box = $('#ds');
  const ds = S.thu.filter((t) => hienTrong(t, S.loc.ngan) && khopLoc(t));
  let h = '';
  if (S.loi.length) {
    h += '<div class="bao-nho">Chưa đọc được ' + S.loi.length + ' hộp: ' +
      S.loi.map((x) => esc(x.hop)).join(', ') + '. Bấm đọc lại để thử lần nữa.</div>';
  }
  if (!ds.length) {
    h += '<div class="trong">' + (S.loc.tim ? 'Không thư nào khớp "' + esc(S.loc.tim) + '".' :
      S.loc.ngan === 'hen' ? 'Chưa hẹn nhắc thư nào.' : 'Ngăn này trống.') + '</div>';
  } else h += ds.map(dongThu).join('');
  box.innerHTML = h;
}

/* ---------------- đọc một thư ---------------- */

function linkHoa(chu) {
  return esc(chu).replace(/\bhttps?:\/\/[^\s<>"']+/g, (u) => {
    const sach = u.replace(/[).,;:!?]+$/, '');
    return '<a href="' + sach + '" target="_blank" rel="noopener noreferrer">' + sach + '</a>' + u.slice(sach.length);
  });
}

const laHep = () => matchMedia('(max-width: 900px)').matches;

async function mo(k) {
  const t = S.thu.find((x) => khoa(x) === k);
  if (!t) return;
  S.chon = k;
  S.ct = null;
  veDs();
  const cot = $('#cotDoc');
  cot.classList.remove('dong-lai');
  cot.hidden = false;
  $('#hangNut').innerHTML = '';
  $('#docThan').innerHTML = '<div class="xuong"><i></i><i style="height:200px"></i></div>';
  try {
    const d = await api(duongThu(t));
    if (S.chon !== k) return;
    S.ct = d;
    veDoc();
    if (t.chuaDoc) danhDau(t, { daDoc: true }, true);
    const aiDu = d.ai && !d.ai.chiXep;
    if (S.ai && !aiDu && (t.ngan === 'xu-ly' || t.ngan === 'sep')) phanTich();
  } catch (e) {
    if (S.chon !== k) return;
    $('#docThan').innerHTML = '<div class="loi-hop"><b>Không mở được thư</b>' + esc(e.message) + '</div>';
  }
}

function dongDoc() {
  const cot = $('#cotDoc');
  S.chon = ''; S.ct = null;
  veDs();
  if (!laHep()) { cot.hidden = true; return; }
  cot.classList.add('dong-lai');
  setTimeout(() => { if (!S.chon) { cot.hidden = true; cot.classList.remove('dong-lai'); } }, 240);
}

const IC = {
  traLoi: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v4"/>',
  viec: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  hen: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M9 2.5h6"/>',
  ngan: '<path d="M3 7l3-3h12l3 3v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 7h18M9 12h6"/>',
  sao: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  chuaDoc: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5L12 13l8.5-6.5"/>',
  luu: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
};
const nutTron = (viec, ic, nhan, bat) =>
  '<button class="nut-tron' + (bat ? ' bat' : '') + '" data-viec="' + viec + '" title="' + nhan + '" aria-label="' + nhan + '">' +
  '<svg viewBox="0 0 24 24" aria-hidden="true">' + ic + '</svg></button>';

function veDoc() {
  const d = S.ct;
  if (!d) return;
  const t = d.thu;
  const tom = S.thu.find((x) => khoa(x) === S.chon) || {};
  $('#hangNut').innerHTML =
    nutTron('tra-loi', IC.traLoi, 'Trả lời') +
    nutTron('viec', IC.viec, 'Giao thành việc') +
    nutTron('hen', IC.hen, tom.henDen ? 'Đổi giờ hẹn' : 'Hẹn nhắc lại', Boolean(tom.henDen)) +
    nutTron('ngan', IC.ngan, 'Chuyển ngăn') +
    nutTron('sao', IC.sao, tom.sao ? 'Bỏ sao' : 'Gắn sao', tom.sao) +
    nutTron('chua-doc', IC.chuaDoc, 'Đánh dấu chưa đọc') +
    nutTron('luu', IC.luu, 'Lưu trữ');

  const nguoi = (n) => esc(n.ten ? n.ten + ' <' + n.email + '>' : n.email);
  let h = '<h2 data-no-i18n>' + esc(t.tieuDe || '(không tiêu đề)') + '</h2>' +
    '<div class="ai-gui" data-no-i18n><span><b>' + esc(t.tu.ten || t.tu.email) + '</b> ' + (t.tu.ten ? esc('<' + t.tu.email + '>') : '') + '</span>' +
    '<span>Tới ' + (t.den.map(nguoi).join(', ') || esc(t.hop)) + '</span>' +
    (t.cc.length ? '<span>CC ' + t.cc.map(nguoi).join(', ') + '</span>' : '') +
    '<span>' + esc(t.ngay) + '</span>' +
    '<span class="nhan hop">' + esc(t.hop) + '</span>' +
    '<span class="nhan">' + esc(tenNgan(tom.ngan)) + ' · ' + esc(tom.lyDo || '') + '</span></div>';
  if (t.canhBao) h += '<div class="canh-bao">Lark đánh dấu thư này có dấu hiệu rủi ro. Kiểm tra người gửi trước khi bấm link hay trả lời.</div>';
  h += '<div id="theAi">' + theAi() + '</div>';
  h += '<div class="noi-dung" data-no-i18n>' + linkHoa(t.noiDung || (t.trich ? '' : '(Thư không có nội dung chữ)')) + '</div>';
  if (t.trich) {
    h += '<button class="nut mo-trich" data-viec="trich" aria-expanded="false">Thư trước</button>' +
      '<div class="trich-cu"><div><div class="noi-dung" data-no-i18n>' + linkHoa(t.trich) + '</div></div></div>';
  }
  if (t.tep.length) {
    h += '<div class="tep" data-no-i18n>' + t.tep.map((x) => '<span class="nhan">📎 ' + esc(x.ten) + '</span>').join('') + '</div>';
  }
  h += veSoan();
  $('#docThan').innerHTML = h;
  $('#docThan').scrollTop = 0;
  capNhatNutGui();
}

/* Tên ngắn của hộp: phần trước @. Có bốn hộp cùng tên "pito@" ở bốn tên miền,
 * nên hộp nào trùng tên thì thêm tên miền (bỏ đuôi .com/.vn). */
function tenHop(email) {
  const [ten, mien = ''] = String(email).split('@');
  const trung = S.hop.filter((h) => h.email.split('@')[0] === ten).length > 1;
  return trung ? ten + '@' + mien.replace(/\.[a-z]+$/i, '') : ten;
}

function tenNgan(id) { return (S.ngan.find((n) => n.id === id) || {}).ten || id || ''; }

function theAi() {
  const a = S.ct && S.ct.ai;
  if (a && a.dangChay) return '<div class="the-ai cho">Đang tóm tắt bằng AI…</div>';
  if (a && a.loi) return '<div class="the-ai cho"><span>' + esc(a.loi) + '</span><button class="nut ai" data-viec="phan-tich">Thử lại</button></div>';
  if (!a || a.chiXep) {
    if (!S.ai) return '';
    return '<div class="the-ai cho"><span>Đọc nhanh: AI tóm tắt thư và gợi ý ý trả lời.</span><button class="nut ai" data-viec="phan-tich">Tóm tắt</button></div>';
  }
  const muc = [];
  if (a.han) muc.push('<span class="nhan lam">Hạn: ' + esc(a.han) + '</span>');
  if (a.soTien) muc.push('<span class="nhan">' + esc(a.soTien) + '</span>');
  return '<div class="the-ai"><div class="dau-ai">✦ AI tóm tắt</div>' +
    '<p data-no-i18n>' + esc(a.tomTat) + '</p>' +
    (a.canLam ? '<p><b>Cần làm:</b> <span data-no-i18n>' + esc(a.canLam) + '</span></p>' : '') +
    (muc.length ? '<div class="muc">' + muc.join('') + '</div>' : '') +
    (a.catBot ? '<div class="ghi">Thư quá dài, AI chỉ đọc phần đầu.</div>' : '') +
    '</div>';
}

async function phanTich() {
  const d = S.ct;
  if (!d) return;
  const k = S.chon;
  d.ai = { dangChay: true };
  $('#theAi').innerHTML = theAi();
  try {
    const r = await api(duongThu(d.thu, 'phan-tich'), { body: {} });
    if (S.chon !== k) return;
    d.ai = r.ai;
    const t = S.thu.find((x) => khoa(x) === k);
    if (t) Object.assign(t, { tomTat: r.ai.tomTat, canLam: r.ai.canLam });
    veDoc();
    veDs();
  } catch (e) {
    if (S.chon !== k) return;
    d.ai = { loi: e.message };
    $('#theAi').innerHTML = theAi();
  }
}

/* ---------------- soạn trả lời ---------------- */

const MAU = [
  { nhan: 'Đã nhận', chu: 'Đã nhận được thông tin. Cảm ơn anh/chị, tôi sẽ xem và phản hồi sớm.' },
  { nhan: 'Đồng ý', chu: 'Tôi đồng ý với nội dung đề xuất. Anh/chị triển khai theo kế hoạch nhé.' },
  { nhan: 'Cần bổ sung', chu: 'Anh/chị bổ sung giúp tôi thêm thông tin sau để tôi xem xét:\n- [..]' },
];

function veSoan() {
  const a = S.ct && S.ct.ai;
  const goiY = a && !a.chiXep && Array.isArray(a.goiY) ? a.goiY : [];
  return '<div class="soan" id="soan">' +
    '<div class="goi-y">' +
    MAU.map((m, i) => '<button class="nut" data-mau="' + i + '">' + esc(m.nhan) + '</button>').join('') +
    goiY.map((g) => '<button class="nut ai" data-no-i18n data-goi-y="' + esc(g) + '">✦ ' + esc(g) + '</button>').join('') +
    (S.ai ? '<button class="nut ai" data-viec="ai-viet">✦ AI viết theo ý trong ô</button>' : '') +
    '</div>' +
    '<textarea id="oSoan" placeholder="Viết trả lời"></textarea>' +
    '<div class="chan-soan">' +
    '<label><input type="checkbox" id="tatCa"> Trả lời tất cả</label>' +
    '<span class="sp"></span>' +
    '<span class="ly-do" id="lyDoGui"></span>' +
    '<button class="nut" data-viec="luu-nhap" id="btnNhap">Lưu nháp</button>' +
    '<button class="nut chinh" data-viec="gui" id="btnGui">Gửi</button>' +
    '</div></div>';
}

function capNhatNutGui() {
  const o = $('#oSoan');
  if (!o) return;
  const trong = !o.value.trim();
  $('#btnGui').disabled = trong;
  $('#btnNhap').disabled = trong;
  $('#lyDoGui').textContent = trong ? 'Viết nội dung trước khi gửi' : '';
}

async function aiViet(yDinh) {
  const d = S.ct;
  const o = $('#oSoan');
  const k = S.chon;
  const nut = document.querySelectorAll('#soan .nut.ai');
  nut.forEach((b) => { b.disabled = true; });
  bao('AI đang viết nháp…', 'cho');
  try {
    const r = await api(duongThu(d.thu, 'nhap'), { body: { yDinh } });
    if (S.chon !== k) return;
    o.value = r.chu;
    capNhatNutGui();
    o.focus();
    bao('Đã có nháp, anh xem lại trước khi gửi', 'ok');
  } catch (e) {
    bao(e.message, 'loi');
  } finally { nut.forEach((b) => { b.disabled = false; }); }
}

async function luuNhap() {
  const d = S.ct;
  const chu = $('#oSoan').value.trim();
  if (!chu) return;
  $('#btnNhap').disabled = true;
  try {
    await api(duongThu(d.thu, 'tra-loi'), { body: { chu, tatCa: $('#tatCa').checked, gui: false } });
    bao('Đã lưu nháp trong Lark Mail', 'ok');
  } catch (e) { bao('Chưa lưu được nháp: ' + e.message, 'loi'); }
  finally { capNhatNutGui(); }
}

function hoiGui() {
  const d = S.ct;
  const chu = $('#oSoan').value.trim();
  if (!chu) return;
  const t = d.thu;
  const tatCa = $('#tatCa').checked;
  const nhan = [t.tu.email].concat(tatCa ? t.den.concat(t.cc).map((n) => n.email).filter((e) => e !== t.hop) : []);
  const ds = Array.from(new Set(nhan.filter(Boolean)));
  $('#hopGuiThan').innerHTML = 'Thư đi ngay tới <b>' + esc(ds.join(', ')) + '</b>, gửi từ hộp <b>' + esc(t.hop) +
    '</b>. Gửi rồi người nhận đọc được ngay.<div class="trich" data-no-i18n>' + esc(chu) + '</div>';
  moHop(async () => {
    $('#btnGui').disabled = true;
    try {
      await api(duongThu(t, 'tra-loi'), { body: { chu, tatCa, gui: true } });
      bao('Đã gửi thư trả lời', 'ok');
      $('#oSoan').value = '';
    } catch (e) { bao('Chưa gửi được: ' + e.message, 'loi'); }
    finally { capNhatNutGui(); }
  });
}

/* ---------------- hộp xác nhận ---------------- */

let hopOk = null;
function moHop(ok) {
  hopOk = ok;
  const n = $('#hopGui');
  n.classList.remove('dong-lai');
  n.hidden = false;
  $('#hopGuiOk').focus();
}
function dongHop() {
  const n = $('#hopGui');
  n.classList.add('dong-lai');
  setTimeout(() => { n.hidden = true; n.classList.remove('dong-lai'); }, 220);
  hopOk = null;
}

/* ---------------- menu nổi ---------------- */

function moMenu(nut, html, xuLy) {
  const m = $('#menuNoi');
  m.innerHTML = html;
  m.classList.remove('dong-lai');
  m.hidden = false;
  const r = nut.getBoundingClientRect();
  const w = m.offsetWidth;
  m.style.top = Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 8) + 'px';
  m.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  m.onclick = (e) => { const b = e.target.closest('button'); if (b) { dongMenu(); xuLy(b); } };
}
function dongMenu() {
  const m = $('#menuNoi');
  if (m.hidden || m.classList.contains('dong-lai')) return;
  m.classList.add('dong-lai');
  setTimeout(() => { m.hidden = true; m.classList.remove('dong-lai'); }, 200);
}

function mocHen() {
  const nay = new Date();
  const luc = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x.getTime(); };
  const mai = new Date(nay); mai.setDate(nay.getDate() + 1);
  const thu2 = new Date(nay); thu2.setDate(nay.getDate() + ((8 - nay.getDay()) % 7 || 7));
  const ds = [];
  if (nay.getHours() < 16) ds.push(['Chiều nay, 17:00', luc(nay, 17)]);
  ds.push(['Sáng mai, 8:00', luc(mai, 8)]);
  ds.push(['Thứ Hai tới, 8:00', luc(thu2, 8)]);
  const tuan = new Date(nay); tuan.setDate(nay.getDate() + 7);
  ds.push(['Một tuần nữa, 8:00', luc(tuan, 8)]);
  return ds;
}

/* ---------------- thao tác trên thư ---------------- */

async function danhDau(t, thay, im) {
  const cu = { chuaDoc: t.chuaDoc, sao: t.sao };
  if ('daDoc' in thay) t.chuaDoc = !thay.daDoc;
  if ('sao' in thay) t.sao = thay.sao;
  veNgan(); veHop(); veDs(); if (!im) veDoc();
  try { await api(duongThu(t, 'doi'), { body: thay }); }
  catch (e) {
    Object.assign(t, cu);
    ve(); if (!im) veDoc();
    bao('Chưa đổi được trên Lark Mail: ' + e.message, 'loi');
  }
}

async function luuTru(t) {
  const k = khoa(t);
  S.daLuu.set(k, t);
  if (S.chon === k) dongDoc();
  ve();
  try { await api(duongThu(t, 'doi'), { body: { luuTru: true } }); }
  catch (e) {
    S.daLuu.delete(k); ve();
    bao('Chưa lưu trữ được: ' + e.message, 'loi');
    return;
  }
  /* Dòng "Hoàn tác" ở lại 8 giây rồi thư rời danh sách hẳn. */
  setTimeout(() => {
    if (!S.daLuu.has(k)) return;
    S.daLuu.delete(k);
    S.thu = S.thu.filter((x) => khoa(x) !== k);
    ve();
  }, 8000);
}

async function hoanTac(k) {
  const t = S.daLuu.get(k);
  if (!t) return;
  S.daLuu.delete(k);
  ve();
  try { await api(duongThu(t, 'doi'), { body: { luuTru: false } }); bao('Thư đã về Hộp đến', 'ok'); }
  catch (e) { bao('Chưa đưa thư về được: ' + e.message, 'loi'); }
}

async function hen(t, den) {
  try {
    await api(duongThu(t, 'hen'), { body: { den } });
    t.henDen = den || 0;
    bao(den ? 'Thư sẽ quay lại ' + gioHen(den) : 'Đã bỏ hẹn', 'ok');
    if (den && S.loc.ngan !== 'hen') dongDoc();
    ve(); if (S.chon) veDoc();
  } catch (e) { bao(e.message, 'loi'); }
}

async function chuyenNgan(t, ngan) {
  try {
    await api('luat', { body: { email: t.tu.email, ngan } });
    bao(ngan ? 'Thư từ ' + t.tu.email + ' sẽ luôn vào ngăn ' + tenNgan(ngan) : 'Đã bỏ luật cho ' + t.tu.email, 'ok');
    await napThu(false);
    if (S.chon) veDoc();
  } catch (e) { bao(e.message, 'loi'); }
}

function giaoViec(t) {
  let mo = null;
  try { mo = parent !== window && parent.hubTaoViec ? parent.hubTaoViec : null; } catch (_) {}
  if (!mo) { bao('Mở app trong Marketing Hub để giao việc', 'loi'); return; }
  const a = S.ct && S.ct.ai;
  const dau = [];
  if (a && !a.chiXep) {
    if (a.canLam) dau.push('Cần làm: ' + a.canLam);
    if (a.han) dau.push('Hạn trong thư: ' + a.han);
    if (a.tomTat) dau.push(a.tomTat);
  }
  const th = S.ct.thu;
  const detail = dau.concat([
    'Thư từ ' + (th.tu.ten ? th.tu.ten + ' <' + th.tu.email + '>' : th.tu.email) + ', ' + th.ngay + ', hộp ' + th.hop + '.',
    '',
    String(th.noiDung || '').trim().slice(0, 1500),
  ]).join('\n');
  mo({
    title: (a && !a.chiXep && a.canLam) || th.tieuDe || 'Việc từ email',
    detail,
    link: location.origin + '/#/m/hop-thu?rec=' + encodeURIComponent(t.hop + '~' + t.id),
  });
}

/* ---------------- sự kiện ---------------- */

$('#dsNgan').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ngan]');
  if (!b) return;
  S.loc.ngan = b.dataset.ngan;
  veNgan(); veDs();
  $('#cotDs').scrollTop = 0;
});
$('#dsHop').addEventListener('click', (e) => {
  const b = e.target.closest('[data-hop]');
  if (!b) return;
  S.loc.hop = b.dataset.hop;
  ve();
});
$('#oTim').addEventListener('input', (e) => { S.loc.tim = e.target.value; veNgan(); veDs(); });
$('#btnLamMoi').addEventListener('click', () => napThu(true).catch((e) => bao(e.message, 'loi')));
$('#btnVe').addEventListener('click', dongDoc);

$('#ds').addEventListener('click', (e) => {
  const h = e.target.closest('[data-hoan]');
  if (h) { hoanTac(h.dataset.hoan); return; }
  const d = e.target.closest('.dong');
  if (d) mo(d.dataset.k);
});

$('#cotDoc').addEventListener('click', (e) => {
  const t = S.thu.find((x) => khoa(x) === S.chon);
  const b = e.target.closest('button');
  if (!b || !t || !S.ct) return;
  if (b.dataset.mau != null) {
    const m = MAU[+b.dataset.mau];
    if (S.ai) aiViet(m.nhan + ': ' + m.chu); else { $('#oSoan').value = m.chu; capNhatNutGui(); $('#oSoan').focus(); }
    return;
  }
  if (b.dataset.goiY) { aiViet(b.dataset.goiY); return; }
  const v = b.dataset.viec;
  if (v === 'tra-loi') { $('#oSoan').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#oSoan').focus({ preventScroll: true }); }
  else if (v === 'viec') giaoViec(t);
  else if (v === 'sao') danhDau(t, { sao: !t.sao });
  else if (v === 'chua-doc') { danhDau(t, { daDoc: false }); dongDoc(); }
  else if (v === 'luu') luuTru(t);
  else if (v === 'phan-tich') phanTich();
  else if (v === 'trich') {
    const mo = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(mo));
    b.nextElementSibling.classList.toggle('mo', mo);
  }
  else if (v === 'ai-viet') aiViet($('#oSoan').value.trim() || 'Trả lời phù hợp với nội dung thư');
  else if (v === 'luu-nhap') luuNhap();
  else if (v === 'gui') hoiGui();
  else if (v === 'hen') {
    const ds = mocHen();
    moMenu(b, '<div class="ghi">Ẩn thư tới lúc</div>' +
      ds.map(([n, ms]) => '<button data-den="' + ms + '">' + esc(n) + '</button>').join('') +
      (t.henDen ? '<hr><button data-den="0">Bỏ hẹn</button>' : ''),
    (x) => hen(t, Number(x.dataset.den)));
  } else if (v === 'ngan') {
    moMenu(b, '<div class="ghi">Thư từ ' + esc(t.tu.email) + ' luôn vào</div>' +
      S.ngan.map((n) => '<button role="menuitemradio" aria-checked="' + (t.ngan === n.id) + '" data-ngan="' + n.id + '">' + esc(n.ten) + '</button>').join('') +
      (t.nguon === 'tay' ? '<hr><button data-ngan="">Bỏ luật, để app tự xếp</button>' : ''),
    (x) => chuyenNgan(t, x.dataset.ngan || null));
  }
});
$('#cotDoc').addEventListener('input', (e) => { if (e.target.id === 'oSoan') capNhatNutGui(); });

$('#hopGuiHuy').addEventListener('click', dongHop);
$('#hopGuiOk').addEventListener('click', () => { const f = hopOk; dongHop(); if (f) f(); });
$('#hopGui').addEventListener('click', (e) => { if (e.target.id === 'hopGui') dongHop(); });

document.addEventListener('click', (e) => {
  if (!e.target.closest('#menuNoi') && !e.target.closest('[data-viec="hen"],[data-viec="ngan"]')) dongMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#hopGui').hidden) dongHop();
  else if (!$('#menuNoi').hidden) dongMenu();
  else if (S.chon && laHep()) dongDoc();
});
addEventListener('resize', datVienTruot);

/* ---------------- khởi động ---------------- */

(async function batDau() {
  $('#ds').innerHTML = '<div class="xuong">' + '<i></i>'.repeat(6) + '</div>';
  try {
    await napHop();
    await napThu(false);
  } catch (e) {
    $('#ds').innerHTML = '<div class="loi-hop"><b>' +
      (e.khongPhaiChu ? 'Không mở được hộp thư' : e.chuaNoi ? 'Hộp thư chưa mở được ở đây' : 'Chưa đọc được Lark Mail') +
      '</b>' + esc(e.message) + '</div>';
    return;
  }
  /* Mở thẳng một thư: ?rec=<hộp>~<mã> (việc giao từ email dẫn về đây). */
  const rec = new URLSearchParams(location.search).get('rec');
  if (rec && rec.includes('~')) {
    const [hop, id] = [rec.slice(0, rec.indexOf('~')), rec.slice(rec.indexOf('~') + 1)];
    const t = S.thu.find((x) => x.hop === hop && x.id === id);
    if (t) { S.loc.ngan = t.henDen ? 'hen' : t.ngan; ve(); mo(khoa(t)); }
    else bao('Thư này không còn trong Hộp đến (đã lưu trữ hoặc quá cũ)', 'loi');
  }
  xepAi();
})();
