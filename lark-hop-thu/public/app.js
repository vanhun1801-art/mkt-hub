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
  cho: [],             // thư anh gửi đi mà bên kia chưa hồi âm (từ thư mục Đã gửi)
  nhom: [],            // nhóm việc đang theo dõi
  moLau: false,        // đang mở dòng "thư đã chờ quá 7 ngày"
  /* Mở app là vào "Việc cần làm" (anh Hùng 28/10/2026: "một nơi cho anh biết cần làm gì"). */
  loc: { ngan: 'viec', hop: '', tim: '', xong: false, nhom: '' },
  chon: '',            // khoá thư đang mở: hop|id
  ct: null,            // chi tiết thư đang mở { thu, ai, hen }
  daLuu: new Map(),    // khoá → thư vừa đánh dấu xong, giữ dòng "Hoàn tác" 8 giây
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
/* "2026-10-28 14:23" (giờ Việt Nam) → mili giây. */
function msCua(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/.exec(s || '');
  return m ? Date.UTC(+m[1], m[2] - 1, +m[3], m[4] - 7, +m[5]) : 0;
}

/*
 * Mức chờ (anh Hùng 28/10/2026: "cái nào bị chờ lâu mà không phản hồi phải
 * nhảy màu lên để mình chú ý"). Tính theo giờ làm việc thực tế của phòng:
 *   dưới 1 ngày   bình thường
 *   1 đến 2 ngày  vàng
 *   từ 3 ngày     đỏ, nhịp sáng lên tắt xuống
 * Thư Ban giám đốc lên mức sớm hơn một nấc (nửa ngày đã vàng, 1 ngày đã đỏ).
 */
function mucCho(t) {
  const gio = (Date.now() - msCua(t.ngay)) / 3600e3;
  if (!(gio > 0)) return { gio: 0, muc: '' };
  const vang = t.sep ? 12 : 24, ma = t.sep ? 24 : 72;
  return { gio, muc: gio >= ma ? 'do' : gio >= vang ? 'vang' : '' };
}
function chuCho(gio) {
  if (gio < 1) return 'vừa xong';
  if (gio < 24) return Math.floor(gio) + ' giờ';
  return Math.floor(gio / 24) + ' ngày';
}
const TUAN = 7 * 86400e3;
/** Thư đến này còn chờ anh trả lời không. */
const conCho = (t) => !t.daGui && t.ngan === 'xu-ly' && !t.xong && !t.boQua && !t.daTraLoi && !t.henDen;
/* Thư đã rời ngăn: anh xử lý xong, hoặc bỏ qua vì là việc của người khác trong hộp chung. */
const daRoi = (t) => Boolean(t.xong || t.boQua);

/* Ảnh đại diện chữ cái: màu theo địa chỉ gửi, cùng người luôn cùng màu. */
const MAU_AVT = ['#289683', '#3b82c4', '#8a5cf6', '#d9822b', '#c2417a', '#4f8a3a', '#b5651d', '#5b6fd6'];
function avatar(ten, email, lop = '') {
  const s = String(ten || email || '?').replace(/["'<>]/g, '').trim();
  const chu = (s.split(/\s+/).filter(Boolean).slice(-1)[0] || '?')[0].toUpperCase();
  let h = 0; for (const c of String(email || s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return '<span class="avt ' + lop + '" style="--avt:' + MAU_AVT[h % MAU_AVT.length] + '" aria-hidden="true">' + esc(chu) + '</span>';
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
    S.cho = (d.cho || []).map((g) => Object.assign({ daGui: true, tu: { ten: 'Anh gửi', email: g.hop } }, g));
    S.nhom = d.nhom || [];
    ve();
    if (ep) bao('Đã đọc lại hộp thư', 'ok');
    if (!d.du) napDu();
  } finally {
    S.dangNap = false;
    $('#btnLamMoi').classList.remove('quay');
  }
}

/* Nhịp hai: máy chủ đang đọc thêm tới 200 thư mỗi hộp. Chờ xong rồi vẽ đè,
 * giữ nguyên ngăn, ô tìm và thư đang mở; nút đọc lại quay trong lúc chờ. */
let dangNapDu = false;
async function napDu() {
  if (dangNapDu) return;
  dangNapDu = true;
  $('#btnLamMoi').classList.add('quay');
  $('#moc').textContent = 'Đang đọc thêm thư cũ…';
  try {
    const d = await api('thu?du=1');
    S.thu = d.thu; S.loi = d.loi || []; S.luc = d.luc;
    S.cho = (d.cho || []).map((g) => Object.assign({ daGui: true, tu: { ten: 'Anh gửi', email: g.hop } }, g));
    S.nhom = d.nhom || [];
    const cuon = $('#cotDs').scrollTop;
    ve();
    $('#cotDs').scrollTop = cuon;
  } catch (_) { veMoc(); }
  finally { dangNapDu = false; $('#btnLamMoi').classList.remove('quay'); }
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

/* "Xong" chỉ là dấu riêng trong app (không lưu trữ trên Lark): thư xong ẩn
 * khỏi ngăn, xem lại được bằng dòng "N thư đã xong" ở cuối danh sách. */
function hienTrong(t, ngan, xemXong = false) {
  if (S.daLuu.has(khoa(t))) return ngan === S.loc.ngan;      // giữ chỗ cho dòng "Hoàn tác"
  if (daRoi(t) !== xemXong) return false;
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

const dem = (id) => S.thu.filter((t) => !S.daLuu.has(khoa(t)) && hienTrong(t, id) && khopLoc(t)).length;

function veNgan() {
  const nav = $('#dsNgan');
  /* "Hẹn lại" chỉ hiện khi có thư đang hẹn: ngăn trống là thêm một chữ phải đoán nghĩa. */
  const ds = [{ id: 'viec', ten: 'Việc cần làm' }].concat(S.ngan,
    dem('hen') || S.loc.ngan === 'hen' ? [{ id: 'hen', ten: 'Hẹn lại' }] : []);
  /* Số trên ngăn là thư CHƯA ĐỌC, như app thư trên điện thoại: "117" cả cũ
   * lẫn mới thì không biết hôm nay còn bao nhiêu việc. Ngăn Hẹn lại đếm hết.
   * "Việc cần làm" đếm số việc đã chờ quá hạn (vàng, đỏ), và đỏ thì số đỏ. */
  const chuaDoc = (id) => S.thu.filter((t) => !S.daLuu.has(khoa(t)) && hienTrong(t, id) && khopLoc(t) && t.chuaDoc).length;
  const tre = S.thu.filter((t) => conCho(t) && khopLoc(t) && msCua(t.ngay) >= Date.now() - TUAN).map(mucCho);
  const soTre = tre.filter((x) => x.muc).length;
  const coDo = tre.some((x) => x.muc === 'do');
  nav.innerHTML = ds.map((n) => {
    const so = n.id === 'viec' ? soTre : n.id === 'hen' ? dem(n.id) : chuaDoc(n.id);
    const lop = n.id === 'viec' && soTre ? ' so-' + (coDo ? 'do' : 'vang') : '';
    return '<button role="tab" data-ngan="' + n.id + '" aria-selected="' + (S.loc.ngan === n.id && !S.loc.nhom) + '">' +
      esc(n.ten) + (so ? '<span class="so' + lop + '">' + so + '</span>' : '') + '</button>';
  }).join('');
  /* Viên trượt dựng MỘT lần rồi giữ lại: dựng mới mỗi lần vẽ là nó lại trượt
   * từ mép trái sang ô đang chọn, nhìn như giao diện nhảy (anh Hùng 28/10/2026). */
  nav.appendChild(vienTruot);
  datVienTruot();
}
const vienTruot = Object.assign(document.createElement('span'), { className: 'vien-truot' });
let vienDaDat = false;
function datVienTruot() {
  const nav = $('#dsNgan');
  const b = nav.querySelector('[aria-selected="true"]');
  if (!b) { vienTruot.style.opacity = '0'; return; }
  /* Lần đầu đặt thẳng vào chỗ, không trượt. */
  if (!vienDaDat) vienTruot.style.transition = 'none';
  vienTruot.style.opacity = '';
  vienTruot.style.left = b.offsetLeft + 'px';
  vienTruot.style.width = b.offsetWidth + 'px';
  if (!vienDaDat) { void vienTruot.offsetWidth; vienTruot.style.transition = ''; vienDaDat = true; }
}
/* Chữ trên ngăn đổi cỡ (dịch sang tiếng Anh, phông nạp muộn) thì đặt lại viên. */
if (window.ResizeObserver) new ResizeObserver(() => datVienTruot()).observe($('#dsNgan'));

/* Chọn hộp thư: một nút, bấm mới bày danh sách. Tám hộp bày thành một dải
 * chip thì tràn khỏi màn và nhiều hộp trùng tên "pito@". */
function veHop() {
  const box = $('#dsHop');
  if (S.hop.length < 2) { box.hidden = true; return; }
  box.hidden = false;
  const ten = S.loc.hop ? tenHop(S.loc.hop) : 'Mọi hộp thư';
  box.innerHTML = '<button class="chip chon-hop" data-viec="chon-hop" aria-haspopup="menu" aria-pressed="' + Boolean(S.loc.hop) + '">' +
    '<span data-no-i18n>' + esc(ten) + '</span>' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>';
}
function menuHop(nut) {
  const chuaDoc = (email) => S.thu.filter((t) => (!email || t.hop === email) && t.chuaDoc && !t.henDen).length;
  const dong = (email, ten) => {
    const so = chuaDoc(email);
    return '<button role="menuitemradio" aria-checked="' + (S.loc.hop === email) + '" data-hop="' + esc(email) + '">' +
      '<span' + (email ? ' data-no-i18n' : '') + '>' + esc(ten) + '</span>' + (so ? '<span class="so">' + so + '</span>' : '') + '</button>';
  };
  moMenu(nut, '<div class="ghi">Số bên phải là thư chưa đọc</div>' + dong('', 'Mọi hộp thư') +
    S.hop.map((h) => dong(h.email, h.email)).join(''), (b) => { S.loc.hop = b.dataset.hop; ve(); }, 'trai');
}

function dongThu(t) {
  const k = khoa(t);
  if (S.daLuu.has(k)) {
    return '<div class="da-luu" data-k="' + esc(k) + '"><span>' + (S.daLuu.get(k)._boQua ? 'Đã bỏ qua' : 'Đã xong') + ': <span data-no-i18n>' + esc(t.tieuDe || '(không tiêu đề)') +
      '</span></span><button data-hoan="' + esc(k) + '">Hoàn tác</button></div>';
  }
  const phu = [];
  /* Chờ lâu thì cả dòng mang màu (vàng, đỏ nhịp sáng) và nhãn "chờ N ngày". */
  const mc = t.daGui ? mucCho({ ngay: t.ngay }) : conCho(t) ? mucCho(t) : { muc: '' };
  if (t.daGui) phu.push('<span class="nhan cho-ho' + (mc.muc ? ' ' + mc.muc : '') + '">Chờ bên kia ' + chuCho(mc.gio) + '</span>');
  else if (mc.muc) phu.push('<span class="nhan cho ' + mc.muc + '">Chờ anh ' + chuCho(mc.gio) + '</span>');
  if (t.daTraLoi && !t.daGui) phu.push('<span class="nhan da-tl">Đã trả lời</span>');
  if (t.sep) phu.push('<span class="nhan sep">Ban giám đốc</span>');
  if (t.boQua && !S.daLuu.has(k)) phu.push('<span class="nhan bo-qua">Đã bỏ qua</span>');
  if (t.rac) phu.push('<span class="nhan rac" title="Lark xếp thư này vào Thư rác">Thư rác</span>');
  if (S.hop.length > 1 && !S.loc.hop) phu.push('<span class="nhan o-hop" data-no-i18n>' + esc(tenHop(t.hop)) + '</span>');
  if (t.sao) phu.push('<span class="nhan sao" aria-label="Có gắn sao">★</span>');
  if (t.henDen) phu.push('<span class="nhan lam">' + esc(gioHen(t.henDen)) + '</span>');
  else if (t.canLam) phu.push('<span class="nhan lam">Cần làm</span>');
  /* Dòng hai là câu tóm tắt của AI. Không có thì để trống, không in lý do
   * xếp ngăn: chữ kiểu "Chưa luật nào nhận" chỉ có nghĩa với người viết app. */
  const dong2 = t.tomTat || t.canLam || '';
  /* Quá 7 ngày vẫn mang màu nhưng thôi nhấp nháy (xem veViec). */
  const lauRoi = mc.muc && mc.gio > TUAN / 3600e3;
  /* Nhịp thở theo đồng hồ: vẽ lại danh sách không làm quầng sáng giật về đầu nhịp. */
  const nhip = mc.muc === 'do' ? ' style="--tho-tre:-' + (Date.now() % 3200) + 'ms"' : '';
  return '<button class="dong' + (t.chuaDoc ? ' chua-doc' : '') + (mc.muc ? ' muc-' + mc.muc : '') + (lauRoi ? ' lau' : '') + '" data-k="' + esc(k) + '"' + nhip +
    (S.chon === k ? ' aria-current="true"' : '') + '>' +
    avatar(t.daGui ? 'Anh' : t.tu.ten, t.daGui ? t.hop : t.tu.email, t.daGui ? 'gui' : '') +
    '<span class="nguoi" data-no-i18n>' + esc(t.daGui ? 'Anh gửi · ' + tenHop(t.hop) : t.tu.ten || t.tu.email) + '</span>' +
    '<span class="gio">' + esc(gioNgan(t.ngay)) + '</span>' +
    '<span class="td" data-no-i18n>' + esc(t.tieuDe || '(không tiêu đề)') + '</span>' +
    '<span class="tt">' + phu.join('') + '<span' + (t.tomTat || t.canLam ? ' data-no-i18n' : '') + '>' + esc(dong2) + '</span></span>' +
    '</button>';
}

const TRONG = {
  'xu-ly': 'Không còn thư nào cần trả lời.',
  don: 'Không có đơn khách đặt nào đang chờ.',
  biet: 'Không có thư nào.',
  hen: 'Chưa hẹn nhắc thư nào.',
};

/* Tất cả thư của một chuỗi: thư đến + thư anh gửi đang chờ. */
const cuaChuoi = (c) => S.thu.filter((t) => t.hop === c.hop && t.chuoi === c.chuoi)
  .concat(S.cho.filter((g) => g.hop === c.hop && g.chuoi === c.chuoi));

/**
 * Tình hình một nhóm theo dõi: thư mới nhất của mọi chuỗi trong nhóm quyết
 * định đang đến lượt ai. Thư đến chưa trả lời → đến lượt anh; thư anh gửi
 * chưa ai hồi âm → đang chờ bên kia.
 */
function tinhNhom(g) {
  const thu = [].concat(...g.chuoi.map(cuaChuoi)).sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
  const nguoi = new Set(thu.filter((t) => !t.daGui).map((t) => t.tu.email));
  const moi = thu[0];
  let tinh = { chu: 'Chưa có thư nào trong hộp đang đọc', muc: '' };
  if (moi && moi.daGui) { const m = mucCho(moi); tinh = { chu: 'Đang chờ bên kia ' + chuCho(m.gio), muc: m.muc ? 'cho-ho ' + m.muc : 'cho-ho' }; }
  else if (moi && conCho(moi)) { const m = mucCho(moi); tinh = { chu: 'Đến lượt anh · chờ ' + chuCho(m.gio), muc: 'cho ' + (m.muc || 'moi') }; }
  else if (moi) tinh = { chu: 'Không có gì cần làm', muc: 'xong' };
  return { thu, nguoi: nguoi.size, moi, tinh };
}

function theNhom(g) {
  const n = tinhNhom(g);
  return '<button class="the-nhom" data-nhom="' + esc(g.id) + '">' +
    '<span class="ten-nhom" data-no-i18n>' + esc(g.ten) + '</span>' +
    '<span class="nhan ' + n.tinh.muc + '">' + esc(n.tinh.chu) + '</span>' +
    '<span class="phu-nhom">' + n.thu.length + ' thư · ' + n.nguoi + ' người' +
    (n.moi ? ' · mới nhất ' + esc(gioNgan(n.moi.ngay)) : '') + '</span></button>';
}

/**
 * "Việc cần làm": một chỗ trả lời câu "hôm nay phải làm gì".
 *   1. Người khác đang chờ anh trả lời (chờ lâu nhất lên đầu, đỏ, vàng)
 *   2. Đơn khách đặt chưa xem
 *   3. Anh đang chờ người khác (thư gửi đi chưa ai hồi âm)
 *   4. Nhóm việc anh theo dõi
 * Thư quá 30 ngày không còn coi là "đang chờ": gom thành một dòng dẫn sang ngăn.
 */
function veViec() {
  const tu = Date.now() - 30 * 86400e3;
  const cho = S.thu.filter((t) => conCho(t) && khopLoc(t));
  const DIEM = { do: 2, vang: 1, '': 0 };
  const xep = (ds) => ds.sort((a, b) => {
    const ma = mucCho(a), mb = mucCho(b);
    return (DIEM[mb.muc] - DIEM[ma.muc]) || (Number(Boolean(b.sep)) - Number(Boolean(a.sep))) || (mb.gio - ma.gio);
  });
  /* Chỉ thư trong 7 ngày gần nhất bày ra và nhảy màu. Cái gì cũng nhấp nháy
   * thì không còn gì nổi bật: thư chờ 7 đến 30 ngày gom một dòng, bấm mới mở. */
  const gan = xep(cho.filter((t) => msCua(t.ngay) >= Date.now() - TUAN));
  const lau = xep(cho.filter((t) => msCua(t.ngay) < Date.now() - TUAN && msCua(t.ngay) >= tu));
  const doiHo = S.cho.filter((g) => !S.loc.hop || g.hop === S.loc.hop)
    .filter((g) => !S.loc.tim || g.tieuDe.toLowerCase().includes(S.loc.tim.trim().toLowerCase()));
  const donMoi = S.thu.filter((t) => hienTrong(t, 'don') && khopLoc(t) && t.chuaDoc).length;
  const khuc = (ten, so, than, them = '') => '<section class="khuc"><h3>' + ten + (so ? '<span class="so">' + so + '</span>' : '') + them + '</h3>' + than + '</section>';

  let h = '';
  if (S.loi.length) h += '<div class="bao-nho">Chưa đọc được ' + S.loi.length + ' hộp: ' + S.loi.map((x) => esc(x.hop)).join(', ') + '.</div>';
  h += khuc('Người khác đang chờ anh', gan.length,
    (gan.length ? gan.map(dongThu).join('') : '<div class="trong nho">Tuần này không ai đang chờ anh trả lời.</div>') +
    (lau.length ? '<button class="dong gom lau-gom" data-mo-lau aria-expanded="' + S.moLau + '">' +
      '<span class="avt gom" aria-hidden="true">' + lau.length + '</span>' +
      '<span class="nguoi">' + lau.length + ' thư đã chờ quá 7 ngày</span><span class="gio">' + (S.moLau ? 'Thu lại' : 'Xem') + '</span>' +
      '<span class="td">Xử lý xong thì bấm Xong. Việc của người khác thì vào ⋯ chọn Bỏ qua.</span></button>' +
      (S.moLau ? lau.map(dongThu).join('') : '') : '') +
    (cho.length > gan.length + lau.length ? '<button class="xem-xong" data-ngan="xu-ly">' + (cho.length - gan.length - lau.length) + ' thư cũ hơn 30 ngày ở ngăn Cần trả lời</button>' : ''));
  if (donMoi) {
    h += '<button class="dong gom" data-ngan="don"><span class="avt gom" aria-hidden="true">' + donMoi + '</span>' +
      '<span class="nguoi">' + donMoi + ' đơn khách đặt chưa xem</span><span class="gio"></span>' +
      '<span class="td">Form đặt dịch vụ và booking mới. Bấm để xem từng đơn.</span></button>';
  }
  h += khuc('Anh đang chờ người khác', doiHo.length,
    doiHo.length ? doiHo.map(dongThu).join('') : '<div class="trong nho">Thư anh gửi đi đều đã có hồi âm.</div>');
  h += khuc('Nhóm việc anh theo dõi', S.nhom.length,
    S.nhom.length ? '<div class="luoi-nhom">' + S.nhom.map(theNhom).join('') + '</div>'
      : '<div class="trong nho">Mở một thư, bấm ⋯ rồi "Theo dõi trong nhóm" để gom các thư cùng một việc.</div>');
  $('#ds').innerHTML = h;
}

/** Xem một nhóm: mọi thư của các chuỗi trong nhóm, mới nhất trước. */
function veNhom() {
  const g = S.nhom.find((x) => x.id === S.loc.nhom);
  if (!g) { S.loc.nhom = ''; veDs(); return; }
  const n = tinhNhom(g);
  $('#ds').innerHTML = '<div class="dau-nhom">' +
    '<button class="nut-tron" data-ra-nhom aria-label="Về Việc cần làm"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
    '<div><b data-no-i18n>' + esc(g.ten) + '</b><span class="nhan ' + n.tinh.muc + '">' + esc(n.tinh.chu) + '</span></div>' +
    '<button class="nut-tron" data-sua-nhom aria-label="Đổi tên hoặc xoá nhóm"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/></svg></button>' +
    '</div>' +
    (n.thu.length ? n.thu.map(dongThu).join('')
      : '<div class="trong">Các thư của nhóm không còn trong số thư gần đây của hộp. Nhóm vẫn được giữ.</div>');
}

function veDs() {
  if (S.loc.nhom) return veNhom();
  if (S.loc.ngan === 'viec' && !S.loc.xong) return veViec();
  const box = $('#ds');
  const ds = S.thu.filter((t) => hienTrong(t, S.loc.ngan, S.loc.xong) && khopLoc(t));
  let h = '';
  if (S.loc.xong) h += '<button class="dong gom" data-xem-xong="0"><span class="avt gom" aria-hidden="true"></span><span class="nguoi">Thư đã xong và đã bỏ qua</span>' +
    '<span class="gio"></span><span class="td">Chỉ đánh dấu trong app, Lark Mail giữ nguyên. Bấm để quay lại.</span></button>';
  if (S.loi.length) {
    h += '<div class="bao-nho">Chưa đọc được ' + S.loi.length + ' hộp: ' +
      S.loi.map((x) => esc(x.hop)).join(', ') + '. Bấm đọc lại để thử lần nữa.</div>';
  }
  /* Đơn khách đặt gom thành một dòng ở đầu "Cần trả lời": nhắc là có đơn,
   * mà không để hàng chục form giống hệt nhau chôn mất thư người thật viết. */
  const soDon = S.loc.ngan === 'xu-ly' && !S.loc.xong ? dem('don') : 0;
  if (soDon) {
    const moi = S.thu.filter((t) => hienTrong(t, 'don') && khopLoc(t) && t.chuaDoc).length;
    h += '<button class="dong gom" data-ngan="don">' +
      '<span class="avt gom" aria-hidden="true"></span><span class="nguoi">'+ soDon + ' đơn khách đặt</span>' +
      '<span class="gio">' + (moi ? moi + ' chưa đọc' : '') + '</span>' +
      '<span class="td">Form đặt dịch vụ và booking mới. Bấm để xem từng đơn.</span></button>';
  }
  if (!ds.length) {
    h += '<div class="trong">' + (S.loc.tim ? 'Không thư nào khớp "' + esc(S.loc.tim) + '".' :
      TRONG[S.loc.ngan] || 'Không có thư nào.') + '</div>';
  } else h += ds.map(dongThu).join('');
  const roi = S.loc.xong ? [] : S.thu.filter((t) => hienTrong(t, S.loc.ngan, true) && khopLoc(t));
  const soBo = roi.filter((t) => t.boQua).length, soXong = roi.length - soBo;
  if (roi.length) {
    h += '<button class="xem-xong" data-xem-xong="1">' +
      [soXong ? soXong + ' thư đã xong' : '', soBo ? soBo + ' thư đã bỏ qua' : ''].filter(Boolean).join(', ') + ' trong ngăn này</button>';
  }
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

/** Thư theo khoá: thư đến, hoặc thư anh gửi đang chờ hồi âm. */
const timThu = (k) => S.thu.find((x) => khoa(x) === k) || S.cho.find((x) => khoa(x) === k);

async function mo(k) {
  const t = timThu(k);
  if (!t) return;
  S.chon = k;
  S.ct = null;
  veDs();
  boAn('doc');                      // khung đọc đang đóng thì mở thư là mở lại
  const cot = $('#cotDoc');
  cot.classList.remove('dong-lai');
  cot.hidden = false;
  /* Vẽ ngay khuôn thư từ dòng trong danh sách (nút, tiêu đề, người gửi, ô trả
   * lời), chỉ phần nội dung chờ tải. Trước đây khung đọc trắng trơn một nhịp
   * rồi mọi thứ mới bật ra (29/10/2026, "ấn vào thì hiện các thứ không bình thường"). */
  veDoc(t);
  try {
    const d = await api(duongThu(t));
    if (S.chon !== k) return;
    S.ct = d;
    veDoc();
    if (t.chuaDoc) danhDau(t, { daDoc: true }, true);
    const aiDu = d.ai && !d.ai.chiXep;
    if (S.ai && !aiDu && t.ngan === 'xu-ly') phanTich();
    lienQuan(d.thu);
  } catch (e) {
    if (S.chon !== k) return;
    $('#docThan').innerHTML = '<div class="loi-hop"><b>Không mở được thư</b>' + esc(e.message) + '</div>';
  }
}

/* Phần bên phải khi chưa chọn thư. Máy tính luôn bày phần này để khuôn hai
 * cột đứng yên; điện thoại thì cột đọc ẩn hẳn. */
function veDocTrong() {
  $('#hangNut').innerHTML = '';
  const o = $('#docSoan');
  o.hidden = true; o.innerHTML = ''; o.dataset.k = '';
  $('#docThan').innerHTML = '<div class="doc-trong">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5L12 13l8.5-6.5"/></svg>' +
    '<b>Chọn một thư bên trái để đọc</b><span>Trả lời, giao việc hay đánh dấu xong ngay trên thư.</span></div>';
}

function dongDoc() {
  const cot = $('#cotDoc');
  S.chon = ''; S.ct = null;
  veDs();
  if (!laHep()) { veDocTrong(); return; }
  cot.classList.add('dong-lai');
  setTimeout(() => { if (!S.chon) { cot.hidden = true; cot.classList.remove('dong-lai'); veDocTrong(); } }, 240);
}

const IC = {
  traLoi: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v4"/>',
  viec: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
};
/* Ba việc hay làm nhất có chữ hẳn hoi; các việc còn lại cất vào "Thêm". */
const nutChu = (viec, ic, nhan, lop = '') =>
  '<button class="nut ' + lop + '" data-viec="' + viec + '">' +
  '<svg viewBox="0 0 24 24" aria-hidden="true">' + ic + '</svg><span>' + nhan + '</span></button>';
const IC_THEM = '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>';
const IC_XONG = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
const IC_VE = '<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-2"/>';

/* tam: dòng thư trong danh sách, vẽ khuôn trong lúc chờ tải nội dung. */
function veDoc(tam) {
  const d = tam ? { thu: Object.assign({ den: [], cc: [], tep: [] }, tam) } : S.ct;
  if (!d) return;
  const t = d.thu;
  const tom = timThu(S.chon) || {};
  /* Thư anh gửi (đang chờ hồi âm): nút "Nhắc lại" mở ô soạn gửi tiếp cho
   * những người nhận ban đầu; không có Xong vì thư không nằm trong Hộp đến. */
  $('#hangNut').innerHTML = nutChu('tra-loi', IC.traLoi, tom.daGui ? 'Nhắc lại' : 'Trả lời') +
    nutChu('viec', IC.viec, 'Giao việc') +
    (tom.daGui ? '' : daRoi(tom) ? nutChu('bo-xong', IC_VE, 'Đưa về') : nutChu('luu', IC_XONG, 'Xong', 'chinh')) +
    '<button class="nut-tron" data-viec="them" title="Thêm" aria-label="Thêm" aria-haspopup="menu">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true">' + IC_THEM + '</svg></button>';

  const nguoi = (n) => esc(n.ten ? n.ten + ' <' + n.email + '>' : n.email);
  const mc = tom.daGui ? mucCho({ ngay: tom.ngay }) : conCho(tom) ? mucCho(tom) : { muc: '' };
  let h = '<h2 data-no-i18n>' + esc(t.tieuDe || '(không tiêu đề)') + '</h2>' +
    '<div class="dau-thu">' + avatar(t.tu.ten, t.tu.email, 'lon') +
    '<div class="ai-gui" data-no-i18n><div class="dong-1"><b>' + esc(t.tu.ten || t.tu.email) + '</b>' +
    (t.tu.ten ? '<span class="mo">' + esc(t.tu.email) + '</span>' : '') + '<span class="mo gio-thu">' + esc(t.ngay) + '</span></div>' +
    '<div class="dong-2">Tới ' + (t.den.map(nguoi).join(', ') || esc(t.hop)) +
    (t.cc.length ? ' · CC ' + t.cc.map(nguoi).join(', ') : '') + '</div></div></div>' +
    '<div class="nhan-thu">' +
    '<span class="nhan o-hop" data-no-i18n>' + esc(t.hop) + '</span>' +
    (tom.daGui ? '<span class="nhan cho-ho' + (mc.muc ? ' ' + mc.muc : '') + '">Chờ bên kia hồi âm ' + chuCho(mc.gio) + '</span>' : '') +
    (!tom.daGui && mc.muc ? '<span class="nhan cho ' + mc.muc + '">Chờ anh trả lời ' + chuCho(mc.gio) + '</span>' : '') +
    (tom.daTraLoi ? '<span class="nhan da-tl">Đã trả lời</span>' : '') +
    (tom.sep ? '<span class="nhan sep">Ban giám đốc</span>' : '') +
    (tom.henDen ? '<span class="nhan lam">Hẹn ' + esc(gioHen(tom.henDen)) + '</span>' : '') +
    (nhomCuaThu(tom).map((g) => '<button class="nhan nhom" data-nhom="' + esc(g.id) + '" data-no-i18n>' + esc(g.ten) + '</button>').join('')) +
    '<span id="lienQuan" class="lien-quan"></span></div>';
  if (tam) {
    h += '<div class="xuong-chu" aria-busy="true"><i></i><i></i><i></i><i></i></div>';
    $('#docThan').innerHTML = h;
    $('#docThan').dataset.k = '';
    $('#docThan').scrollTop = 0;
    ganSoan(tom.daGui);
    capNhatNutGui();
    return;
  }
  if (tom.rac) h += '<div class="canh-bao">Lark xếp thư này vào Thư rác. Xem kỹ địa chỉ người gửi trước khi bấm link hay trả lời. Thư vẫn nằm trong Thư rác trên Lark.</div>';
  else if (t.canhBao) h += '<div class="canh-bao">Lark đánh dấu thư này có dấu hiệu rủi ro. Kiểm tra người gửi trước khi bấm link hay trả lời.</div>';
  h += '<div id="theAi">' + theAi() + '</div>';
  h += '<div id="vungDich" class="vung-dich"></div>';
  h += '<div class="noi-dung" data-no-i18n>' + linkHoa(t.noiDung || (t.trich ? '' : '(Thư không có nội dung chữ)')) + '</div>';
  if (t.trich) {
    h += '<button class="nut mo-trich" data-viec="trich" aria-expanded="false">Thư trước</button>' +
      '<div class="trich-cu"><div><div class="noi-dung" data-no-i18n>' + linkHoa(t.trich) + '</div></div></div>';
  }
  if (t.tep.length) {
    h += '<div class="tep" data-no-i18n>' + t.tep.map((x) => '<span class="nhan">📎 ' + esc(x.ten) + '</span>').join('') + '</div>';
  }
  const cuon = $('#docThan').dataset.k === S.chon ? $('#docThan').scrollTop : 0;
  $('#docThan').innerHTML = h;
  $('#docThan').dataset.k = S.chon;
  ganSoan(tom.daGui);
  nutDich(t);
  $('#docThan').scrollTop = cuon;           // vẽ lại cùng thư (gắn sao, AI xong) thì giữ chỗ đang đọc
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

const MAU_NHAC = [
  { nhan: 'Nhắc nhẹ', chu: 'Anh/chị xem giúp em thư bên dưới và phản hồi khi tiện nhé. Em cảm ơn.' },
  { nhan: 'Hỏi tiến độ', chu: 'Em hỏi thăm tiến độ việc này ạ. Anh/chị cần em bổ sung gì thì báo em nhé.' },
];

/* daGui: thư của chính anh đang chờ hồi âm, ô soạn thành ô "nhắc lại" gửi cho
 * mọi người nhận ban đầu (tick sẵn Trả lời tất cả). */
function veGoiY(daGui) {
  const a = S.ct && S.ct.ai;
  const goiY = a && !a.chiXep && Array.isArray(a.goiY) ? a.goiY : [];
  const mau = daGui ? MAU_NHAC : MAU;
  return mau.map((m, i) => '<button class="nut" data-mau="' + i + '">' + esc(m.nhan) + '</button>').join('') +
    goiY.map((g) => '<button class="nut ai" data-no-i18n data-goi-y="' + esc(g) + '">✦ ' + esc(g) + '</button>').join('') +
    (S.ai ? '<button class="nut ai" data-viec="ai-viet">✦ AI viết theo ý trong ô</button>' : '');
}

/**
 * Ô soạn ghim ở đáy khung đọc. Chỉ dựng lại khi đổi sang thư khác: veDoc()
 * chạy lại sau mỗi lần gắn sao, tóm tắt AI… mà dựng lại ô soạn là mất chữ
 * đang gõ. Cùng thư thì chỉ thay hàng gợi ý.
 */
function ganSoan(daGui) {
  const o = $('#docSoan');
  o.hidden = false;
  if (o.dataset.k === S.chon && $('#oSoan')) {
    $('#soan .goi-y').innerHTML = veGoiY(daGui);
    return;
  }
  o.dataset.k = S.chon;
  o.innerHTML = veSoan(daGui);
}

function veSoan(daGui) {
  return '<div class="soan" id="soan">' +
    '<div class="goi-y">' + veGoiY(daGui) + '</div>' +
    '<textarea id="oSoan" placeholder="' + (daGui ? 'Viết lời nhắc gửi lại cho người nhận' : 'Viết trả lời') + '"></textarea>' +
    '<div class="chan-soan">' +
    '<label><input type="checkbox" id="tatCa"' + (daGui ? ' checked' : '') + '> Trả lời tất cả</label>' +
    '<label title="Anh viết tiếng Việt, app dịch sang tiếng Anh, xem trước rồi mới gửi"><input type="checkbox" id="guiAnh"> Gửi bằng tiếng Anh</label>' +
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
  o.classList.toggle('co-chu', !trong);      // có chữ thì ô giữ cỡ lớn cả khi bấm ra ngoài
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

/* ---------------- dịch ----------------
 * Anh Hùng 28/10/2026: dịch thư tiếng nước ngoài sang tiếng Việt, và soạn
 * tiếng Việt rồi gửi bản tiếng Anh. Dùng bộ dịch có sẵn trong Chrome
 * (Translator API: chạy trên máy, thư không rời máy). Trình duyệt không có thì
 * nhờ máy chủ (Claude, cần khoá). Lần đầu một cặp ngôn ngữ Chrome có thể tải
 * gói dịch vài giây. */

const boDich = new Map();
let boNhanDien = null;

async function doanNgonNgu(chu) {
  const s = String(chu || '').slice(0, 1200);
  /* Tiếng Việt khi chữ có dấu chiếm phần đáng kể: một thư tiếng Anh nhắc
   * "Phú Quốc" vài lần vẫn là thư tiếng Anh. */
  const chuCai = (s.match(/\p{L}/gu) || []).length || 1;
  const coDau = (s.match(/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹáàãéèíìóòõúùýđ]/gi) || []).length;
  if (coDau / chuCai > 0.06) return 'vi';
  if ('LanguageDetector' in self) {
    try {
      const quaGio = new Promise((_, loi) => setTimeout(() => loi(new Error('quá giờ')), 3000));
      if (!boNhanDien) boNhanDien = LanguageDetector.create();
      const r = (await Promise.race([(await Promise.race([boNhanDien, quaGio])).detect(s), quaGio]))[0];
      if (r && r.confidence > 0.5 && r.detectedLanguage !== 'und') return r.detectedLanguage.split('-')[0];
    } catch (_) { boNhanDien = null; }
  }
  if (/[Ѐ-ӿ]/.test(s)) return 'ru';
  if (/[가-힯]/.test(s)) return 'ko';
  if (/[぀-ヿ]/.test(s)) return 'ja';
  if (/[一-鿿]/.test(s)) return 'zh';
  if (/[฀-๿]/.test(s)) return 'th';
  return /[a-z]{3,}/i.test(s) ? 'en' : 'vi';
}

async function dichTrenMay(chu, tu, den) {
  if (!('Translator' in self) || !tu || tu === den) return null;
  const k = tu + '>' + den;
  if (!boDich.has(k)) {
    /* Trình duyệt nào không tải được gói dịch thì create() treo mãi (đã gặp ở
     * trình duyệt nhúng): quá 30 giây thì thôi, rơi xuống máy chủ. */
    const quaGio = new Promise((_, loi) => setTimeout(() => loi(new Error('Trình duyệt chưa tải được gói dịch')), 30000));
    boDich.set(k, Promise.race([Translator.create({ sourceLanguage: tu, targetLanguage: den }), quaGio])
      .catch((e) => { boDich.delete(k); throw e; }));
  }
  const may = await boDich.get(k);
  /* Dịch từng đoạn: giữ xuống dòng, và không đưa cả lá thư dài vào một lượt. */
  const doan = String(chu).split(/(\n{2,})/);
  const ra = [];
  for (const d of doan) ra.push(d.trim() && !/^\n+$/.test(d) ? await may.translate(d) : d);
  return ra.join('');
}

async function dich(chu, den, tu) {
  const nguon = tu || await doanNgonNgu(chu);
  if (nguon === den) return chu;
  try { const r = await dichTrenMay(chu, nguon, den); if (r != null) return r; } catch (_) { /* rơi xuống máy chủ */ }
  return (await api('dich', { body: { chu, den } })).chu;
}

/* Bản dịch đã có, theo thư: { ngu, td, than, xemGoc } */
const banDich = new Map();

async function nutDich(t) {
  const k = S.chon;
  const ngu = await doanNgonNgu((t.tieuDe || '') + '\n' + (t.noiDung || ''));
  if (S.chon !== k) return;
  const o = $('#vungDich');
  if (!o) return;
  const bd = banDich.get(k);
  if (ngu === 'vi' && !bd) { o.innerHTML = ''; return; }
  /* Thư tiếng nước ngoài thì ô soạn tự tick "Gửi bằng tiếng Anh". */
  const guiAnh = $('#guiAnh');
  if (guiAnh && !guiAnh.dataset.daDoi && ngu !== 'vi') guiAnh.checked = true;
  if (bd && bd.than) { veBanDich(); return; }
  o.innerHTML = '<button class="nut dich" data-viec="dich"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c0 3-3 7-7 9"/><path d="M13 21l4-9 4 9M14.5 18h5"/></svg>' +
    '<span>Dịch sang tiếng Việt</span></button>';
}

function veBanDich() {
  const bd = banDich.get(S.chon);
  const o = $('#vungDich');
  if (!o || !bd) return;
  o.innerHTML = '<div class="ban-dich">' +
    '<div class="dau-dich"><b>Bản dịch tiếng Việt</b><button class="lien" data-viec="xem-goc">' + (bd.xemGoc ? 'Xem bản dịch' : 'Xem bản gốc') + '</button></div>' +
    (bd.xemGoc ? '' : (bd.td ? '<div class="td-dich" data-no-i18n>' + esc(bd.td) + '</div>' : '') +
      '<div class="noi-dung" data-no-i18n>' + linkHoa(bd.than) + '</div>') + '</div>';
  /* Đang xem bản dịch thì ẩn thân gốc, đỡ phải đọc hai lần. */
  const goc = $('#docThan > .noi-dung');
  if (goc) goc.hidden = !bd.xemGoc;
}

async function dichThu() {
  const k = S.chon;
  const t = S.ct && S.ct.thu;
  if (!t) return;
  const o = $('#vungDich');
  o.innerHTML = '<div class="ban-dich cho">Đang dịch… Lần đầu dịch một ngôn ngữ, trình duyệt tải gói dịch mất ít giây.</div>';
  try {
    const ngu = await doanNgonNgu((t.tieuDe || '') + '\n' + (t.noiDung || ''));
    const [td, than] = await Promise.all([dich(t.tieuDe || '', 'vi', ngu), dich(t.noiDung || '', 'vi', ngu)]);
    banDich.set(k, { ngu, td, than, xemGoc: false });
    if (S.chon === k) veBanDich();
  } catch (e) {
    if (S.chon === k) o.innerHTML = '<div class="ban-dich cho"><span>' + esc(e.message) + '</span><button class="nut" data-viec="dich">Thử lại</button></div>';
  }
}

/* ---------------- xem trước khi gửi ----------------
 * Anh Hùng 28/10/2026: "nhấn gửi thì cho xem hình thức trước, tự soát được
 * chính tả rồi mới gửi". Bấm Gửi chỉ mở bản xem trước: đúng thân thư sẽ đi
 * (phần viết + chữ ký + trích thư gốc), người nhận, tiêu đề, và các chỗ chữ
 * nên sửa. Sửa từng chỗ hoặc "Sửa hết" thì ô soạn đổi theo và bản xem trước
 * dựng lại. Chỉ nút "Gửi ngay" trong hộp này mới gửi. */

let banXem = null;     // { t, chu, tatCa, coChuKy, kq }

function hoiGui() {
  const o = $('#oSoan');
  const chu = o.value.trim();
  if (!chu) return;
  const t = S.ct.thu;
  const tiengAnh = Boolean($('#guiAnh') && $('#guiAnh').checked);
  banXem = { t, chu, chuViet: chu, tiengAnh, tatCa: $('#tatCa').checked, coChuKy: banXem && banXem.t === t ? banXem.coChuKy : true };
  $('#hopGuiThan').innerHTML = (tiengAnh ? '<div class="ban-dich cho">Đang dịch sang tiếng Anh…</div>' : '') +
    '<div class="xuong"><i></i><i style="height:220px"></i></div>';
  $('#hopGuiLyDo').textContent = '';
  moHop(guiThat);
  if (!tiengAnh) { napXemTruoc(); return; }
  /* Soạn tiếng Việt, gửi tiếng Anh: dịch trước, bản xem trước là bản tiếng Anh. */
  const b = banXem;
  $('#hopGuiOk').disabled = true;
  dich(chu, 'en', 'vi').then((en) => {
    if (banXem !== b) return;
    b.chu = en;
    napXemTruoc();
  }).catch((e) => {
    if (banXem !== b) return;
    $('#hopGuiThan').innerHTML = '<div class="loi-hop"><b>Chưa dịch được sang tiếng Anh</b>' + esc(e.message) + '</div>';
  });
}

async function napXemTruoc() {
  const b = banXem;
  $('#hopGuiOk').disabled = true;
  try {
    const kq = await api(duongThu(b.t, 'xem-truoc'), { body: { chu: b.chu, tatCa: b.tatCa, coChuKy: b.coChuKy, ngonNgu: b.tiengAnh ? 'en' : 'vi' } });
    if (banXem !== b) return;
    b.kq = kq;
    veXemTruoc();
  } catch (e) {
    if (banXem !== b) return;
    $('#hopGuiThan').innerHTML = '<div class="loi-hop"><b>Chưa xem trước được</b>' + esc(e.message) + '</div>';
  }
}

function veXemTruoc() {
  const b = banXem, kq = b.kq;
  const ds = (x) => x.map((n) => esc(n.ten ? n.ten + ' <' + n.email + '>' : n.email)).join(', ');
  let h = '<dl class="xt-dau" data-no-i18n><dt>Từ</dt><dd>' + esc(kq.tu) + '</dd>' +
    '<dt>Tới</dt><dd>' + (ds(kq.den) || '<span class="loi-chu">Chưa có người nhận</span>') + '</dd>' +
    (kq.cc.length ? '<dt>CC</dt><dd>' + ds(kq.cc) + '</dd>' : '') +
    '<dt>Tiêu đề</dt><dd>' + esc(kq.tieuDe) + '</dd></dl>';
  if (b.tiengAnh) {
    h += '<div class="xt-anh">Gửi bản tiếng Anh, dịch từ chữ anh viết. Muốn sửa câu chữ thì bấm Sửa tiếp và sửa bản tiếng Việt.' +
      '<details><summary>Bản tiếng Việt anh viết</summary><div class="trich" data-no-i18n>' + esc(b.chuViet) + '</div></details></div>';
  }
  if (kq.loi.length) {
    h += '<div class="xt-soat"><div class="xt-soat-dau"><b>' + kq.loi.length + ' chỗ nên sửa</b>' +
      (kq.aiSoat ? '<span class="mo">Claude đã soát cùng</span>' : '') +
      '<button class="nut" data-sua-het>Sửa hết</button></div>' +
      kq.loi.map((x, i) => '<div class="xt-loi"><span class="ly">' + esc(x.ly) + '</span>' +
        '<span class="sai" data-no-i18n>' + esc(x.sai.replace(/ /g, '·')) + '</span><span class="mui" aria-hidden="true">→</span>' +
        '<span class="dung" data-no-i18n>' + esc(x.sua.replace(/ /g, '·')) + '</span>' +
        '<button class="nut nho" data-sua="' + i + '">Sửa</button></div>').join('') + '</div>';
  } else {
    h += '<div class="xt-sach"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' +
      'Không thấy lỗi chính tả' + (kq.aiSoat ? ', Claude đã soát cùng' : '') + '</div>';
  }
  /* Thân thư do máy chủ dựng từ chữ đã thoát ký tự (thanThu + trích dạng chữ),
   * không có HTML gốc của thư nào. Bày như tờ giấy nền trắng, giống bên nhận. */
  h += '<div class="xt-giay" data-no-i18n>' + kq.html + '</div>';
  h += '<div class="xt-chan-giay"><label><input type="checkbox" id="xtChuKy"' + (b.coChuKy ? ' checked' : '') + '> Kèm chữ ký</label>' +
    '<button class="lien" data-sua-chu-ky>Sửa chữ ký</button></div>';
  $('#hopGuiThan').innerHTML = h;
  $('#hopGuiOk').disabled = !kq.den.length;
  $('#hopGuiLyDo').textContent = !kq.den.length ? 'Thư chưa có người nhận'
    : kq.loi.length ? 'Còn ' + kq.loi.length + ' chỗ nên sửa, vẫn gửi được' : '';
}

/** Áp lỗi (một hoặc tất cả) vào chữ đang soạn, từ cuối lên để vị trí không lệch. */
function suaChu(ds) {
  const b = banXem;
  let s = b.chu;
  for (const x of ds.slice().sort((p, q) => q.vt - p.vt)) {
    if (s.slice(x.vt, x.vt + x.dai) === x.sai) s = s.slice(0, x.vt) + x.sua + s.slice(x.vt + x.dai);
  }
  b.chu = s;
  const o = $('#oSoan');
  if (o && S.ct && S.ct.thu === b.t && !b.tiengAnh) { o.value = s; capNhatNutGui(); }
  napXemTruoc();
}

async function guiThat() {
  const b = banXem;
  if (!b) return;
  $('#btnGui') && ($('#btnGui').disabled = true);
  try {
    await api(duongThu(b.t, 'tra-loi'), { body: { chu: b.chu, tatCa: b.tatCa, coChuKy: b.coChuKy, gui: true } });
    bao('Đã gửi thư trả lời', 'ok');
    const o = $('#oSoan');
    if (o && S.ct && S.ct.thu === b.t) o.value = '';
    const t = timThu(khoa(b.t));
    if (t) { t.daTraLoi = true; ve(); }
    banXem = null;
  } catch (e) { bao('Chưa gửi được: ' + e.message, 'loi'); }
  finally { capNhatNutGui(); }
}

$('#hopGuiThan').addEventListener('click', (e) => {
  const s = e.target.closest('[data-sua]');
  if (s && banXem && banXem.kq) { suaChu([banXem.kq.loi[+s.dataset.sua]]); return; }
  if (e.target.closest('[data-sua-het]') && banXem && banXem.kq) { suaChu(banXem.kq.loi); return; }
  if (e.target.closest('[data-sua-chu-ky]')) suaChuKy(() => banXem && napXemTruoc());
});
$('#hopGuiThan').addEventListener('change', (e) => {
  if (e.target.id === 'xtChuKy' && banXem) { banXem.coChuKy = e.target.checked; napXemTruoc(); }
});

/* ---------------- hộp nhỏ dùng chung ---------------- */

let nhoOk = null;
function moNho({ tieu, than, nutOk = 'Lưu', ok }) {
  nhoOk = ok;
  $('#hopNhoTieu').textContent = tieu;
  $('#hopNhoThan').innerHTML = than;
  $('#hopNhoOk').textContent = nutOk;
  $('#hopNhoOk').disabled = false;
  $('#hopNhoLyDo').textContent = '';
  const n = $('#hopNho');
  n.classList.remove('dong-lai');
  n.hidden = false;
  const o = n.querySelector('input:not([type=checkbox]):not([type=radio]), textarea');
  if (o) setTimeout(() => o.focus(), 60);
}
function dongNho() {
  const n = $('#hopNho');
  if (n.hidden) return;
  n.classList.add('dong-lai');
  setTimeout(() => { n.hidden = true; n.classList.remove('dong-lai'); }, 220);
  nhoOk = null;
}
$('#hopNhoHuy').addEventListener('click', dongNho);
$('#hopNho').addEventListener('click', (e) => { if (e.target.id === 'hopNho') dongNho(); });
$('#hopNhoOk').addEventListener('click', async () => {
  if (!nhoOk) return;
  const nut = $('#hopNhoOk');
  nut.disabled = true;
  try { if ((await nhoOk()) !== false) dongNho(); }
  catch (e) { $('#hopNhoLyDo').textContent = e.message; }
  finally { nut.disabled = false; }
});

/** Sửa chữ ký: lần đầu gợi ý từ chữ ký Lark Mail của hộp chính. */
async function suaChuKy(sau) {
  let ck = { chuKy: '' };
  try { ck = await api('chu-ky'); } catch (_) {}
  moNho({
    tieu: 'Chữ ký của anh',
    than: '<p class="ghi-nho">Gắn cuối mọi thư trả lời gửi từ app. Mỗi dòng một dòng trong chữ ký.</p>' +
      '<textarea id="oChuKy" rows="5" data-no-i18n>' + esc(ck.chuKy || '') + '</textarea>' +
      (ck.daDat ? '' : '<p class="ghi-nho">Đây là bản gợi ý từ chữ ký trên Lark Mail. Bấm Lưu để dùng.</p>'),
    ok: async () => {
      await api('chu-ky', { body: { chuKy: $('#oChuKy').value } });
      bao('Đã lưu chữ ký', 'ok');
      if (sau) sau();
    },
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

let henDongMenu = 0;
function moMenu(nut, html, xuLy, canh) {
  const m = $('#menuNoi');
  clearTimeout(henDongMenu);      // menu trước đang đóng dở thì đừng để nó ẩn luôn menu mới
  m.innerHTML = html;
  m.classList.remove('dong-lai');
  m.hidden = false;
  const r = nut.getBoundingClientRect();
  const w = m.offsetWidth;
  m.style.top = Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 8) + 'px';
  m.style.left = Math.max(8, Math.min(canh === 'trai' ? r.left : r.right - w, innerWidth - w - 8)) + 'px';
  m.onclick = (e) => { const b = e.target.closest('button'); if (b) { dongMenu(); xuLy(b); } };
}
function dongMenu() {
  const m = $('#menuNoi');
  if (m.hidden || m.classList.contains('dong-lai')) return;
  m.classList.add('dong-lai');
  henDongMenu = setTimeout(() => { m.hidden = true; m.classList.remove('dong-lai'); }, 200);
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
    bao('Chưa lưu được: ' + e.message, 'loi');
  }
}

/* Xong: dấu riêng trong app, thư vẫn nằm nguyên trong Hộp đến trên Lark.
 * boQua: thư của người khác trong hộp chung (anh Hùng 29/10/2026: "ấn xong thì
 * có thể ảnh hưởng đến công việc của bạn khác"). Cũng chỉ là sổ riêng của
 * mình, người khác vẫn thấy thư y nguyên; khác Xong ở chữ và ở nhãn. */
async function luuTru(t, boQua = false) {
  const k = khoa(t);
  const truong = boQua ? 'boQua' : 'xong';
  t._boQua = boQua;                  // dòng "Hoàn tác" nói đúng việc vừa làm
  S.daLuu.set(k, t);
  if (S.chon === k) dongDoc();
  ve();
  /* Gắn dấu sau khi máy chủ nhận: gắn trước thì Việc cần làm lọc mất dòng
   * ngay, không còn chỗ cho "Hoàn tác". */
  /* Gắn cả vào bản thư đang nằm trong danh sách: lượt đọc ngầm (napDu) có thể
   * đã thay S.thu bằng đối tượng mới, gắn mỗi `t` cũ là thư hiện lại sau 8 giây. */
  try { await api(duongThu(t, 'doi'), { body: { [truong]: true } }); for (const x of [t, timThu(k)]) if (x) x[truong] = Date.now(); }
  catch (e) {
    S.daLuu.delete(k); ve();
    bao((boQua ? 'Chưa bỏ qua được: ' : 'Chưa đánh dấu xong được: ') + e.message, 'loi');
    return;
  }
  /* Dòng "Hoàn tác" ở lại 8 giây rồi thư chuyển xuống mục "đã xong". */
  setTimeout(() => {
    if (!S.daLuu.has(k)) return;
    S.daLuu.delete(k);
    const x = timThu(k);
    if (x && !x[truong]) x[truong] = Date.now();
    ve();
  }, 8000);
}

/* Đưa thư về ngăn: gỡ cả dấu Xong lẫn dấu Bỏ qua. */
async function boXong(t) {
  try {
    await api(duongThu(t, 'doi'), { body: { xong: false, boQua: false } });
    for (const x of [t, timThu(khoa(t))]) if (x) { x.xong = 0; x.boQua = 0; }
    ve(); if (S.chon === khoa(t) && S.ct) veDoc();
    bao('Thư đã quay lại ngăn', 'ok');
  } catch (e) { bao('Chưa đưa thư về được: ' + e.message, 'loi'); }
}

async function hoanTac(k) {
  const t = S.daLuu.get(k);
  if (!t) return;
  S.daLuu.delete(k);
  await boXong(t);
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

/* ---------------- gói thư thành việc ----------------
 * Anh Hùng 28/10/2026: giao việc từ thư chuyển tiếp chỉ ra chữ ký công ty và
 * dòng "Chuyển tiếp:", phần thư thật nằm khuất trong "Thư trước". Việc phải
 * đọc hiểu được mà không cần mở thư: tên sạch, ai gửi, thư gốc nói gì, và
 * một thẻ "Email gốc" bấm về đúng thư (Bảng công việc vẽ từ ô link). */

const TIEN_TO = /^((tr[aả] l[oờ]i|re|fw|fwd|tl|chuy[eể]n ti[eế]p|forward(ed)?)\s*:\s*)+/i;
const boTienTo = (s) => String(s || '').replace(TIEN_TO, '').trim();

/* Dòng chữ ký công ty lặp ở cuối mọi thư nội bộ: bỏ khỏi phần trích. */
const CHU_KY_CTY = [/^your trip\.? our passion/i, /^dẫn đầu du lịch phú quốc/i, /^-{2,}\s*$/];

function lamSach(chu) {
  return String(chu || '')
    /* Thư quảng cáo nhét cả dòng ký tự vô hình để đẩy phần xem trước: bỏ hẳn. */
    .replace(/[­͏​-‏⁠﻿]/g, '')
    .split('\n')
    .map((d) => d.replace(/\s+$/, ''))
    .filter((d) => !CHU_KY_CTY.some((r) => r.test(d.trim())))
    .join('\n')
    /* Link theo dõi dài cả trăm ký tự chỉ là nhiễu trong việc. */
    .replace(/https?:\/\/[^\s)>\]]{70,}/g, (u) => { try { return new URL(u).origin + '/…'; } catch (_) { return '(link)'; } })
    .replace(/^[ \t ]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Tách đầu thư chuyển tiếp ("Từ:", "Tiêu đề:"…) ra khỏi phần thân. */
function tachChuyenTiep(chu) {
  const dong = lamSach(chu).split('\n');
  const dau = {};
  const than = [];
  for (const d of dong) {
    const m = /^\s*(từ|from|tiêu đề|subject|ngày|date|đến|to|cc)\s*:\s*(.+)$/i.exec(d);
    if (m && than.join('').trim() === '') {
      const k = m[1].toLowerCase();
      dau[/từ|from/.test(k) ? 'tu' : /tiêu đề|subject/.test(k) ? 'td' : /ngày|date/.test(k) ? 'ngay' : 'khac'] = m[2].trim();
      continue;
    }
    if (/^-{3,}.*(chuyển tiếp|forwarded|original message).*-{3,}$/i.test(d.trim())) continue;
    than.push(d);
  }
  return { dau, than: than.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

function goiViecTuThu(t, th, a) {
  const tu = th.tu.ten ? th.tu.ten + ' <' + th.tu.email + '>' : th.tu.email;
  const coAi = a && !a.chiXep;
  const loiNhan = lamSach(th.noiDung);
  const goc = th.trich ? tachChuyenTiep(th.trich) : null;
  const laChuyenTiep = /^(fw|fwd|chuy[eể]n ti[eế]p|forward)/i.test(String(th.tieuDe || '').trim());

  const ds = [];
  if (coAi && a.canLam) ds.push('Cần làm: ' + a.canLam);
  if (coAi && a.han) ds.push('Hạn trong thư: ' + a.han);
  if (coAi && a.tomTat) ds.push('Tóm tắt: ' + a.tomTat);
  if (ds.length) ds.push('');
  ds.push('Email: ' + (boTienTo(th.tieuDe) || '(không tiêu đề)'));
  ds.push((laChuyenTiep ? 'Người chuyển tiếp: ' : 'Người gửi: ') + tu + ' · ' + th.ngay + ' · hộp ' + th.hop);
  if (loiNhan) ds.push('', laChuyenTiep ? 'Lời nhắn kèm:' : 'Nội dung:', loiNhan.slice(0, 900));
  if (goc && goc.than) {
    ds.push('', laChuyenTiep ? 'Thư được chuyển tiếp' + (goc.dau.tu ? ' (từ ' + goc.dau.tu + ')' : '') + ':' : 'Thư trước đó:');
    ds.push(goc.than.slice(0, laChuyenTiep ? 1500 : 600));
  }
  const ten = (coAi && a.canLam) || boTienTo(th.tieuDe) || (goc && goc.dau.td) || 'Việc từ email';
  const q = new URLSearchParams({ rec: t.hop + '~' + t.id, td: boTienTo(th.tieuDe).slice(0, 120), tu: th.tu.ten || th.tu.email });
  return { title: ten, detail: ds.join('\n').slice(0, 3000), link: location.origin + '/#/m/hop-thu?' + q.toString() };
}

function giaoViec(t) {
  let mo = null;
  try { mo = parent !== window && parent.hubTaoViec ? parent.hubTaoViec : null; } catch (_) {}
  if (!mo) { bao('Mở app trong Marketing Hub để giao việc', 'loi'); return; }
  mo(goiViecTuThu(t, S.ct.thu, S.ct && S.ct.ai));
}

/* ---------------- sự kiện ---------------- */

$('#dsNgan').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ngan]');
  if (!b) return;
  S.loc.ngan = b.dataset.ngan;
  S.loc.xong = false;
  veNgan(); veDs();
  $('#cotDs').scrollTop = 0;
});
$('#dsHop').addEventListener('click', (e) => {
  const b = e.target.closest('[data-viec="chon-hop"]');
  if (b) menuHop(b);
});
$('#oTim').addEventListener('input', (e) => { S.loc.tim = e.target.value; veNgan(); veDs(); });
$('#btnLamMoi').addEventListener('click', () => napThu(true).catch((e) => bao(e.message, 'loi')));
$('#btnVe').addEventListener('click', dongDoc);

function vaoNhom(id) {
  S.loc.nhom = id;
  veNgan(); veDs();
  $('#cotDs').scrollTop = 0;
}

$('#ds').addEventListener('click', (e) => {
  const h = e.target.closest('[data-hoan]');
  if (h) { hoanTac(h.dataset.hoan); return; }
  const nh = e.target.closest('[data-nhom]');
  if (nh) { vaoNhom(nh.dataset.nhom); return; }
  if (e.target.closest('[data-ra-nhom]')) { vaoNhom(''); return; }
  if (e.target.closest('[data-mo-lau]')) { S.moLau = !S.moLau; veDs(); return; }
  const sn = e.target.closest('[data-sua-nhom]');
  if (sn) { suaNhom(S.loc.nhom); return; }
  const g = e.target.closest('[data-ngan]');
  if (g) { S.loc.ngan = g.dataset.ngan; S.loc.nhom = ''; veNgan(); veDs(); $('#cotDs').scrollTop = 0; return; }
  const x = e.target.closest('[data-xem-xong]');
  if (x) { S.loc.xong = x.dataset.xemXong === '1'; veDs(); $('#cotDs').scrollTop = 0; return; }
  const d = e.target.closest('.dong');
  if (d && d.dataset.k) mo(d.dataset.k);
});

$('#cotDoc').addEventListener('click', (e) => {
  const lq = e.target.closest('[data-mo-app]');
  if (lq) { moApp(lq.dataset.moApp); return; }
  const nh = e.target.closest('.nhan.nhom[data-nhom]');
  if (nh) { vaoNhom(nh.dataset.nhom); return; }
  const t = timThu(S.chon);
  const b = e.target.closest('button');
  if (!b || !t || !S.ct) return;
  if (b.dataset.mau != null) {
    const m = (t.daGui ? MAU_NHAC : MAU)[+b.dataset.mau];
    if (S.ai) aiViet(m.nhan + ': ' + m.chu); else { $('#oSoan').value = m.chu; capNhatNutGui(); $('#oSoan').focus(); }
    return;
  }
  if (b.dataset.goiY) { aiViet(b.dataset.goiY); return; }
  const v = b.dataset.viec;
  if (v === 'tra-loi') $('#oSoan').focus();
  else if (v === 'viec') giaoViec(t);
  else if (v === 'sao') danhDau(t, { sao: !t.sao });
  else if (v === 'chua-doc') { danhDau(t, { daDoc: false }); dongDoc(); }
  else if (v === 'luu') luuTru(t);
  else if (v === 'bo-xong') boXong(t);
  else if (v === 'phan-tich') phanTich();
  else if (v === 'dich') dichThu();
  else if (v === 'xem-goc') { const bd = banDich.get(S.chon); if (bd) { bd.xemGoc = !bd.xemGoc; veBanDich(); } }
  else if (v === 'trich') {
    const mo = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(mo));
    b.nextElementSibling.classList.toggle('mo', mo);
  }
  else if (v === 'ai-viet') aiViet($('#oSoan').value.trim() || 'Trả lời phù hợp với nội dung thư');
  else if (v === 'luu-nhap') luuNhap();
  else if (v === 'gui') hoiGui();
  else if (v === 'them') menuThem(b, t);
});

/* Menu "Thêm" của một thư. Hẹn và chuyển ngăn mở tiếp menu con ngay tại nút,
 * đợi menu trước trượt ra xong rồi mới mở. */
function menuThem(nut, t) {
  const sau = (f) => setTimeout(f, 210);
  const nhom = nhomCuaThu(t);
  moMenu(nut,
    /* Hộp chung: thư người khác lo thì bỏ qua, không bấm Xong thay họ. */
    (t.daGui || daRoi(t) ? '' : '<button data-lam="bo-qua">Bỏ qua, việc của người khác</button><hr>') +
    '<button data-lam="lich">Thêm vào lịch</button>' +
    '<button data-lam="nhom">Theo dõi trong nhóm…</button>' +
    nhom.map((g) => '<button data-lam="bo-nhom" data-id="' + esc(g.id) + '">Bỏ khỏi nhóm <span data-no-i18n>' + esc(g.ten) + '</span></button>').join('') +
    '<hr>' +
    (t.daGui ? '' : '<button data-lam="hen">' + (t.henDen ? 'Đổi giờ nhắc lại' : 'Nhắc lại sau') + '</button>' +
      '<button data-lam="ngan">Chuyển sang ngăn khác</button>' +
      '<button data-lam="sao">' + (t.sao ? 'Bỏ gắn sao' : 'Gắn sao') + '</button>' +
      '<button data-lam="chua-doc">Đánh dấu chưa đọc</button>') +
    '<button data-lam="chu-ky">Chữ ký của tôi</button>' +
    '<div class="ghi">Các thao tác này chỉ lưu trong app, Lark Mail giữ nguyên.</div>',
  (x) => {
    const lam = x.dataset.lam;
    if (lam === 'bo-qua') luuTru(t, true);
    else if (lam === 'hen') sau(() => menuHen(nut, t));
    else if (lam === 'ngan') sau(() => menuNgan(nut, t));
    else if (lam === 'sao') danhDau(t, { sao: !t.sao });
    else if (lam === 'chua-doc') { danhDau(t, { daDoc: false }); dongDoc(); }
    else if (lam === 'lich') themLich(t);
    else if (lam === 'nhom') chonNhom(t);
    else if (lam === 'bo-nhom') boKhoiNhom(t, x.dataset.id);
    else if (lam === 'chu-ky') suaChuKy();
  });
}

/* ---------------- nhóm việc theo dõi ----------------
 * Một nhóm gom nhiều chuỗi thư cùng một việc ("Hợp tác PITO Hotel"). Nhóm
 * lưu trong sổ riêng của từng người; thư vẫn nằm nguyên trên Lark Mail. */

const nhomCuaThu = (t) => (t && t.chuoi ? S.nhom.filter((g) => g.chuoi.some((c) => c.hop === t.hop && c.chuoi === t.chuoi)) : []);

async function luuNhom(ds) {
  const cu = S.nhom;
  S.nhom = ds;
  ve(); if (S.ct) veDoc();
  try { S.nhom = (await api('nhom', { body: { nhom: ds } })).nhom; }
  catch (e) { S.nhom = cu; ve(); if (S.ct) veDoc(); throw e; }
}

function chonNhom(t) {
  if (!t.chuoi) { bao('Thư này không có mã chuỗi để theo dõi', 'loi'); return; }
  const tenGoiY = boTienTo(t.tieuDe).slice(0, 60);
  moNho({
    tieu: 'Theo dõi trong nhóm',
    nutOk: 'Thêm vào nhóm',
    than: (S.nhom.length ? '<div class="chon-nhom">' + S.nhom.map((g, i) =>
      '<label><input type="radio" name="nhom" value="' + esc(g.id) + '"' + (i === 0 ? ' checked' : '') + '>' +
      '<span data-no-i18n>' + esc(g.ten) + '</span><span class="mo">' + g.chuoi.length + ' chuỗi thư</span></label>').join('') +
      '<label><input type="radio" name="nhom" value=""' + (S.nhom.length ? '' : ' checked') + '><span>Nhóm mới</span></label></div>' : '') +
      '<input id="oTenNhom" type="text" maxlength="80" placeholder="Tên nhóm mới, ví dụ Hợp tác PITO Hotel" value="' + esc(tenGoiY) + '">' +
      '<p class="ghi-nho">Các thư sau này trong cùng chuỗi tự vào nhóm.</p>',
    ok: async () => {
      const chon = (document.querySelector('input[name="nhom"]:checked') || {}).value || '';
      const c = { hop: t.hop, chuoi: t.chuoi, td: boTienTo(t.tieuDe).slice(0, 200) };
      let ds;
      if (chon) {
        ds = S.nhom.map((g) => (g.id === chon && !g.chuoi.some((x) => x.hop === c.hop && x.chuoi === c.chuoi)
          ? Object.assign({}, g, { chuoi: g.chuoi.concat([c]) }) : g));
      } else {
        const ten = $('#oTenNhom').value.trim();
        if (!ten) throw new Error('Đặt tên cho nhóm mới');
        ds = S.nhom.concat([{ id: 'n' + Date.now().toString(36), ten, luc: Date.now(), chuoi: [c] }]);
      }
      await luuNhom(ds);
      bao('Đã thêm vào nhóm theo dõi', 'ok');
    },
  });
  /* Gõ tên mới thì tự chọn "Nhóm mới". */
  const o = $('#oTenNhom');
  o.addEventListener('input', () => { const r = document.querySelector('input[name="nhom"][value=""]'); if (r) r.checked = true; });
}

async function boKhoiNhom(t, id) {
  const ds = S.nhom.map((g) => (g.id === id ? Object.assign({}, g, { chuoi: g.chuoi.filter((c) => !(c.hop === t.hop && c.chuoi === t.chuoi)) }) : g));
  try { await luuNhom(ds); bao('Đã bỏ thư khỏi nhóm', 'ok'); } catch (e) { bao(e.message, 'loi'); }
}

function suaNhom(id) {
  const g = S.nhom.find((x) => x.id === id);
  if (!g) return;
  let xacNhanXoa = false;
  moNho({
    tieu: 'Sửa nhóm',
    than: '<input id="oTenNhom" type="text" maxlength="80" value="' + esc(g.ten) + '">' +
      '<button class="nut nguy" id="btnXoaNhom">Xoá nhóm</button>' +
      '<p class="ghi-nho" id="ghiXoaNhom">Xoá nhóm chỉ bỏ việc theo dõi; thư vẫn nằm nguyên trong hộp thư.</p>',
    ok: async () => {
      const ten = $('#oTenNhom').value.trim();
      if (!ten) throw new Error('Tên nhóm đang trống');
      await luuNhom(S.nhom.map((x) => (x.id === id ? Object.assign({}, x, { ten }) : x)));
    },
  });
  $('#btnXoaNhom').addEventListener('click', async () => {
    if (!xacNhanXoa) {
      xacNhanXoa = true;
      $('#btnXoaNhom').textContent = 'Bấm lần nữa để xoá nhóm "' + g.ten + '"';
      return;
    }
    try { await luuNhom(S.nhom.filter((x) => x.id !== id)); dongNho(); S.loc.nhom = ''; ve(); bao('Đã xoá nhóm', 'ok'); }
    catch (e) { $('#hopNhoLyDo').textContent = e.message; }
  });
}

/* ---------------- thêm vào lịch ----------------
 * Gợi ý sẵn ngày giờ nếu thư có nhắc ("15/11", "14h30", "9:00"), không có
 * thì 9 giờ sáng mai. Mô tả kèm người gửi và đường về đúng thư. */

function doanNgayGio(chu) {
  const s = String(chu || '');
  const nay = new Date();
  let ngay = null;
  const md = /\b(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?\b/.exec(s);
  if (md) {
    const d = +md[1], m = +md[2];
    let y = md[3] ? +md[3] : nay.getFullYear();
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      ngay = new Date(y, m - 1, d);
      if (!md[3] && ngay < new Date(nay.getFullYear(), nay.getMonth(), nay.getDate())) ngay.setFullYear(y + 1);
    }
  }
  let gio = 9, phut = 0;
  const mg = /\b(\d{1,2})\s*(?:h|giờ|:)\s*(\d{2})?\b/i.exec(s);
  if (mg && +mg[1] < 24) { gio = +mg[1]; phut = mg[2] ? +mg[2] : 0; }
  if (!ngay) { ngay = new Date(nay); ngay.setDate(nay.getDate() + 1); }
  ngay.setHours(gio, phut, 0, 0);
  return ngay;
}

const pad = (n) => String(n).padStart(2, '0');

function themLich(t) {
  const th = S.ct ? S.ct.thu : t;
  const a = S.ct && S.ct.ai && !S.ct.ai.chiXep ? S.ct.ai : null;
  const goiY = doanNgayGio((a && a.han) || ((th.tieuDe || '') + '\n' + (th.noiDung || '')));
  const link = location.origin + '/#/m/hop-thu?rec=' + encodeURIComponent(t.hop + '~' + t.id);
  const moTa = 'Từ email "' + boTienTo(th.tieuDe) + '" của ' + (th.tu.ten || th.tu.email) + ' (' + th.ngay + ').\nMở thư: ' + link;
  moNho({
    tieu: 'Thêm vào lịch Lark',
    nutOk: 'Thêm vào lịch',
    than: '<label class="o">Tên sự kiện<input id="lTen" type="text" maxlength="200" value="' + esc(boTienTo(th.tieuDe)) + '"></label>' +
      '<div class="hang-o"><label class="o">Ngày<input id="lNgay" type="date" value="' + goiY.getFullYear() + '-' + pad(goiY.getMonth() + 1) + '-' + pad(goiY.getDate()) + '"></label>' +
      '<label class="o">Bắt đầu<input id="lGio" type="time" value="' + pad(goiY.getHours()) + ':' + pad(goiY.getMinutes()) + '"></label>' +
      '<label class="o">Thời lượng<select id="lDai"><option value="30">30 phút</option><option value="60" selected>1 giờ</option>' +
      '<option value="120">2 giờ</option><option value="240">Nửa ngày</option></select></label></div>' +
      '<label class="o">Ghi chú<textarea id="lMoTa" rows="3" data-no-i18n>' + esc(moTa) + '</textarea></label>' +
      '<p class="ghi-nho">Sự kiện nằm trên lịch Lark của riêng anh, nhắc trước 30 phút.</p>',
    ok: async () => {
      const [y, mo, d] = $('#lNgay').value.split('-').map(Number);
      const [h, mi] = $('#lGio').value.split(':').map(Number);
      if (!y || h == null) throw new Error('Chọn ngày và giờ bắt đầu');
      const batDau = new Date(y, mo - 1, d, h, mi || 0).getTime();
      try {
        await api('lich', { body: { tieuDe: $('#lTen').value, moTa: $('#lMoTa').value, batDau, ketThuc: batDau + Number($('#lDai').value) * 60000 } });
      } catch (e) {
        if (e.canQuyenLich) { moiQuyenLich(); return false; }
        throw e;
      }
      bao('Đã thêm vào lịch Lark', 'ok');
    },
  });
}

/* Bản chạy chung: lần đầu dùng lịch phải cho phép Marketing Hub thêm lịch. */
function moiQuyenLich() {
  $('#hopNhoLyDo').innerHTML = 'Cần cho phép Marketing Hub thêm lịch. <button class="lien" id="btnQuyenLich">Cho phép</button>';
  $('#btnQuyenLich').onclick = () => {
    let tren = window;
    try { tren = window.top; void tren.location.href; } catch (_) { tren = window; }
    tren.location.href = '/auth/noi-thu?them=lich&next=' + encodeURIComponent('/' + (tren === window ? '#/m/hop-thu' : tren.location.hash || '#/m/hop-thu'));
  };
}

/* ---------------- liên quan: hồ sơ ở app khác ----------------
 * Chỉ chạy trong hub (cùng origin, hub tự gắn danh tính và quyền). App nào
 * người dùng không được xem thì hub trả 403, chip đó đơn giản là không hiện.
 *   KOL       khớp email người gửi với KOL hoặc đối tác
 *   Khách     khớp số điện thoại có trong thư với hồ sơ khách (form đặt dịch vụ có SĐT)
 */
const trongHub = (() => { try { return parent !== window && Boolean(parent.__iosDao || parent.hubTaoViec); } catch (_) { return false; } })();
let kolDem = null;

function timSdt(chu) {
  const ds = String(chu || '').match(/(?:\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/g) || [];
  return [...new Set(ds.map((x) => x.replace(/\D/g, '').replace(/^84/, '0')))].filter((x) => x.length >= 9 && x.length <= 11);
}

async function lienQuan(t) {
  if (!trongHub) return;
  const k = S.chon;
  const chip = [];
  try {
    if (!kolDem) kolDem = fetch('../kol/api/du-lieu').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const d = await kolDem;
    const em = t.tu.email;
    if (d && em) {
      const kol = (d.kol || []).find((x) => String(x.email || '').toLowerCase() === em);
      if (kol) {
        const ht = (d.hopTac || []).filter((h) => h.kol === kol.id).pop();
        chip.push({ chu: 'KOL · ' + (kol.ten || em), mo: '#/m/kol' + (ht ? '?rec=' + encodeURIComponent(ht.id) : '') });
      }
      const dt = (d.doiTac || []).find((x) => String(x.email || '').toLowerCase() === em);
      if (dt) chip.push({ chu: 'Đối tác · ' + (dt.ten || em), mo: '#/m/kol' });
    }
  } catch (_) {}
  for (const so of timSdt((t.noiDung || '') + '\n' + (t.trich || '')).slice(0, 2)) {
    try {
      const r = await fetch('../khach-hang/api/tim?so=1&q=' + encodeURIComponent(so));
      const o = r.ok ? ((await r.json()).ds || [])[0] : null;
      if (o) chip.push({ chu: 'Khách · ' + o.ten + (o.soDon ? ' · ' + o.soDon + ' đơn' : ' · chưa có đơn'), mo: '#/m/khach-hang' });
    } catch (_) {}
  }
  const o = $('#lienQuan');
  if (S.chon !== k || !o) return;
  o.innerHTML = chip.map((c) => '<button class="nhan lq" data-mo-app="' + esc(c.mo) + '" data-no-i18n>' + esc(c.chu) + '</button>').join('');
}

function moApp(hash) {
  try { if (parent !== window) { parent.location.hash = hash; return; } } catch (_) {}
  window.open('/' + hash, '_blank', 'noopener');
}

/* ---------------- khuôn: vách kéo, ẩn từng phần ----------------
 * Anh Hùng 28/10/2026: "phần chia này dùng chuột để kéo tỷ lệ hoặc đóng được".
 * Độ rộng nhớ trên máy người dùng (localStorage, hỏng thì về mặc định). */

const KHOA_RONG = 'hopThu.rongTrai';
const docRong = () => { try { return Number(localStorage.getItem(KHOA_RONG)) || 0; } catch (_) { return 0; } };
const ghiRong = (w) => { try { if (w) localStorage.setItem(KHOA_RONG, String(w)); else localStorage.removeItem(KHOA_RONG); } catch (_) {} };

function datRong(w) {
  const cot = $('#cotTrai');
  if (!w) { cot.style.width = ''; return; }
  cot.style.width = Math.max(280, Math.min(w, innerWidth - 440)) + 'px';
}

function capNhatNutAn() {
  const anDs = document.body.classList.contains('an-ds');
  const b = $('#btnThuDs');
  b.setAttribute('aria-pressed', String(anDs));
  b.title = anDs ? 'Hiện danh sách' : 'Ẩn danh sách';
  b.setAttribute('aria-label', b.title);
}
function boAn(phan) {
  document.body.classList.remove('an-' + phan);
  capNhatNutAn();
}
function anPhan(phan) {
  const b = document.body.classList;
  /* Không bao giờ ẩn cả hai: ẩn phần này thì phần kia phải hiện. */
  b.add('an-' + phan);
  b.remove('an-' + (phan === 'ds' ? 'doc' : 'ds'));
  capNhatNutAn();
  datVienTruot();
}

(function vachKeo() {
  const v = $('#vach');
  datRong(docRong());
  let dangKeo = false;
  v.addEventListener('pointerdown', (e) => {
    if (laHep()) return;
    dangKeo = true;
    try { v.setPointerCapture(e.pointerId); } catch (_) {}
    document.body.classList.add('dang-keo');
  });
  /* Kéo sát mép trái thì đóng danh sách, sát mép phải thì đóng khung đọc
   * (anh Hùng 28/10/2026). Lúc tay còn đang kéo, phần sắp đóng mờ đi để
   * biết trước; thả tay mới đóng, và độ rộng đã lưu giữ nguyên để mở lại. */
  const MEP = 160;
  let sapAn = '';
  const rongCu = () => docRong();
  v.addEventListener('pointermove', (e) => {
    if (!dangKeo) return;
    const trai = $('#cotTrai').getBoundingClientRect().left;
    const w = e.clientX - trai;
    sapAn = w < MEP ? 'ds' : e.clientX > innerWidth - MEP ? 'doc' : '';
    document.body.classList.toggle('sap-an-ds', sapAn === 'ds');
    document.body.classList.toggle('sap-an-doc', sapAn === 'doc');
    if (!sapAn) datRong(w);
    datVienTruot();
  });
  const tha = () => {
    if (!dangKeo) return;
    dangKeo = false;
    document.body.classList.remove('dang-keo', 'sap-an-ds', 'sap-an-doc');
    if (sapAn) {
      datRong(rongCu());
      if (sapAn === 'doc') { S.chon = ''; S.ct = null; veDs(); veDocTrong(); }
      anPhan(sapAn);
      sapAn = '';
      return;
    }
    ghiRong(parseInt($('#cotTrai').style.width, 10) || 0);
  };
  v.addEventListener('pointerup', tha);
  v.addEventListener('pointercancel', tha);
  v.addEventListener('dblclick', () => { datRong(0); ghiRong(0); datVienTruot(); });
  v.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const w = $('#cotTrai').getBoundingClientRect().width + (e.key === 'ArrowRight' ? 32 : -32);
    datRong(w); ghiRong(w); datVienTruot();
  });
})();

$('#btnThuDs').addEventListener('click', () => {
  if (document.body.classList.contains('an-ds')) boAn('ds'); else anPhan('ds');
  datVienTruot();
});
$('#btnDongDoc').addEventListener('click', () => {
  if (laHep()) { dongDoc(); return; }
  anPhan('doc');
  S.chon = ''; S.ct = null;
  veDs(); veDocTrong();
});
function menuHen(nut, t) {
  moMenu(nut, '<div class="ghi">Cất thư đi, tới lúc này thư quay lại</div>' +
    mocHen().map(([n, ms]) => '<button data-den="' + ms + '">' + esc(n) + '</button>').join('') +
    (t.henDen ? '<hr><button data-den="0">Bỏ hẹn</button>' : ''),
  (x) => hen(t, Number(x.dataset.den)));
}
function menuNgan(nut, t) {
  moMenu(nut, '<div class="ghi">Từ nay thư của <span data-no-i18n>' + esc(t.tu.email) + '</span> luôn vào</div>' +
    S.ngan.map((n) => '<button role="menuitemradio" aria-checked="' + (t.ngan === n.id) + '" data-ngan="' + n.id + '">' + esc(n.ten) + '</button>').join('') +
    (t.nguon === 'tay' ? '<hr><button data-ngan="">Để app tự xếp như trước</button>' : ''),
  (x) => chuyenNgan(t, x.dataset.ngan || null));
}
$('#cotDoc').addEventListener('input', (e) => { if (e.target.id === 'oSoan') capNhatNutGui(); });
/* Anh tự đổi ô "Gửi bằng tiếng Anh" thì app thôi tự tick theo ngôn ngữ thư. */
$('#cotDoc').addEventListener('change', (e) => { if (e.target.id === 'guiAnh') e.target.dataset.daDoi = '1'; });

$('#hopGuiHuy').addEventListener('click', dongHop);
$('#hopGuiOk').addEventListener('click', () => { const f = hopOk; dongHop(); if (f) f(); });
$('#hopGui').addEventListener('click', (e) => { if (e.target.id === 'hopGui') dongHop(); });

document.addEventListener('click', (e) => {
  if (!e.target.closest('#menuNoi') && !e.target.closest('[data-viec="them"],[data-viec="chon-hop"]')) dongMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#hopNho').hidden) dongNho();
  else if (!$('#hopGui').hidden) dongHop();
  else if (!$('#menuNoi').hidden) dongMenu();
  else if (S.chon && laHep()) dongDoc();
});
addEventListener('resize', datVienTruot);

/* ---------------- khởi động ---------------- */

(async function batDau() {
  $('#ds').innerHTML = '<div class="xuong">' + '<i></i>'.repeat(6) + '</div>';
  veDocTrong();
  try {
    await napHop();
    await napThu(false);
  } catch (e) {
    document.body.classList.add('khong-doc');      // chưa đọc được hộp nào thì không bày khung đọc trống
    $('#ds').innerHTML = '<div class="loi-hop"><b>' +
      (e.khongPhaiChu ? 'Không mở được hộp thư'
        : e.noiDuoc ? 'Chưa nối hộp thư'
          : e.chuaNoi ? 'Hộp thư chưa mở được ở đây' : 'Chưa đọc được Lark Mail') +
      '</b>' + esc(e.message) +
      (e.noiDuoc ? '<button class="nut chinh" id="btnNoiThu">Nối hộp thư</button>' : '') + '</div>';
    /* Trang hỏi quyền của Lark không mở được trong khung iframe: đi ở cửa sổ
     * ngoài cùng, xong Lark đưa về đúng Hộp thư trong hub. */
    const nut = $('#btnNoiThu');
    if (nut) nut.onclick = () => {
      let tren = window;
      try { tren = window.top; void tren.location.href; } catch (_) { tren = window; }
      tren.location.href = '/auth/noi-thu?next=' + encodeURIComponent('/' + (tren === window ? '#/m/hop-thu' : tren.location.hash || '#/m/hop-thu'));
    };
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
