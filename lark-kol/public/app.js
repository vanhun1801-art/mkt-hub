'use strict';
/* ==========================================================================
   App KOL — giao diện. Mọi con số tiền "chính thức" do server tính (tinh.js);
   ở đây chỉ tính lại để hiện tổng NGAY khi đang gõ bảng kê.
   ========================================================================== */
const $ = (s, g = document) => g.querySelector(s);
const $$ = (s, g = document) => [...g.querySelectorAll(s)];
const e = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tien = (n) => (n == null || n === '' ? '' : Math.round(Number(n) || 0).toLocaleString('vi-VN'));
const p2 = (n) => String(n).padStart(2, '0');
const VN = 7 * 3600000;
const NGAY_MS = 86400000;
const vn = (ms) => { const d = new Date(ms + VN); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), thu: d.getUTCDay() }; };
const ngayIn = (ms) => { if (!ms) return ''; const t = vn(ms); return t.y + '-' + p2(t.m) + '-' + p2(t.d); };
const gioIn = (ms) => { if (!ms) return ''; const t = vn(ms); return ngayIn(ms) + 'T' + p2(t.h) + ':' + p2(t.mi); };
const hhmm = (ms) => { const t = vn(ms); return p2(t.h) + ':' + p2(t.mi); };
const ddmm = (ms) => { if (!ms) return ''; const t = vn(ms); return p2(t.d) + '/' + p2(t.m); };
const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const tuChuoi = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) - VN : 0; };
const dauNgay = (ms) => tuChuoi(ngayIn(ms));

const BUOC = ['Đang trao đổi', 'Chờ BGĐ duyệt', 'BGĐ đã duyệt', 'Đã mời KOL', 'KOL đã xác nhận', 'Đã tạo tour Tourwell', 'Đang đi tour', 'Chờ nhận sản phẩm', 'Hoàn tất', 'Huỷ'];
const NHOM = ['Tour', 'Vé tham quan', 'Ăn uống', 'Lưu trú', 'Di chuyển', 'Khác'];
const LOAI_KHACH = ['Người lớn', 'Trẻ em', 'Em bé', 'Phòng', 'Xe/Chuyến', 'Trọn gói'];
const HINH_THUC = ['Công ty chi', 'FOC đối tác', 'KOL tự trả'];
const TT_HM = ['Chờ', 'Đã xong', 'Có sự cố', 'Huỷ'];
const NEN_TANG = ['TikTok', 'Facebook', 'YouTube', 'Instagram', 'Threads', 'Zalo', 'Khác'];
const LOAI_BG = ['Video', 'Ảnh', 'Story', 'Bộ ảnh', 'Re-up', 'Livestream', 'Bài viết'];
const TT_BG = ['Chưa làm', 'Đã gửi nháp', 'Cần sửa', 'Đã đăng', 'Huỷ'];
const QUOC_GIA = ['Việt Nam', 'Hàn Quốc', 'Nhật Bản', 'Trung Quốc', 'Đài Loan', 'Thái Lan', 'Singapore', 'Malaysia', 'Philippines', 'Ấn Độ', 'Nga', 'Mỹ', 'Úc', 'Anh', 'Pháp', 'Đức', 'Khác'];
const NGUON = ['Tìm trên TikTok', 'Tìm trên Facebook', 'Tìm trên Instagram', 'Tìm trên YouTube', 'Được giới thiệu', 'KOL tự liên hệ', 'Agency', 'Khác'];
const LINH_VUC = ['Gia đình', 'Du lịch', 'Ẩm thực', 'Review', 'Lifestyle', 'Giải trí', 'Làm đẹp', 'Khác'];
const TT_KOL = ['Tiềm năng', 'Đang trao đổi', 'Đã hợp tác', 'Không phù hợp'];
const XUNG = ['Chị', 'Anh', 'Bạn', 'Em'];
const LOAI_DV = ['Lưu trú', 'Ăn uống', 'Vé tham quan', 'Tour', 'Di chuyển', 'Khác'];
const DON_VI = ['Người', 'Phòng/đêm', 'Suất', 'Chuyến', 'Vé'];

const S = { meta: null, dl: null, sp: null, loc: '', sua: null };

/* ---------------- tiện ích ---------------- */
async function api(duong, than) {
  const r = await fetch(duong, than === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(than),
  });
  const j = await r.json().catch(() => ({ error: 'Máy chủ trả lời lạ (' + r.status + ')' }));
  if (!r.ok || j.error) throw new Error(j.error || ('Lỗi ' + r.status));
  return j;
}
let hToast = 0;
function toast(s, loi) {
  const t = $('#toast');
  t.textContent = s; t.className = loi ? 'do' : ''; t.hidden = false;
  clearTimeout(hToast); hToast = setTimeout(() => { t.hidden = true; }, loi ? 6000 : 2800);
}
const opt = (ds, v, rong) => (rong ? '<option value=""></option>' : '') +
  ds.map((x) => '<option' + (x === v ? ' selected' : '') + '>' + e(x) + '</option>').join('');
const nhanTT = (s, mau) => '<span class="nhan-tt ' + (mau || '') + '">' + e(s) + '</span>';
const mauBuoc = (b) => ({ 'Chờ BGĐ duyệt': 'cam', 'Đang đi tour': 'xanh', 'Chờ nhận sản phẩm': 'tim', 'Hoàn tất': 'xanh', 'Huỷ': '' }[b] || '');
const kolCua = (id) => (S.dl.kol.find((k) => k.id === id) || {});
const htCua = (id) => S.dl.hopTac.find((h) => h.id === id);
const tenGon = (s) => String(s || '').replace(/\s+[—-]\s+(Người lớn|Trẻ em|Em bé)$/i, '').trim();
async function chep(s) {
  try { await navigator.clipboard.writeText(s); toast('Đã chép'); } catch (_) {
    const t = document.createElement('textarea'); t.value = s; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); toast('Đã chép'); } catch (__) { toast('Không chép được', true); } t.remove();
  }
}

/* tiền — bản sao của tinh.js để hiện tổng khi đang gõ */
const heSo = (h) => (Number(h.soLuong) || 0) * (h.demLuot === '' || h.demLuot == null ? 1 : Number(h.demLuot) || 0);
const thanhTien = (h) => (h.hinhThuc === 'Công ty chi' ? Math.round(heSo(h) * (Number(h.donGiaChi) || 0)) : 0);
const quyDoi = (h) => (h.tinhTrang === 'Huỷ' ? 0 : Math.round(heSo(h) * (Number(h.giaCongBo !== '' && h.giaCongBo != null ? h.giaCongBo : h.donGiaChi) || 0)));

/* ---------------- modal ---------------- */
function moModal(tieuDe, than, chan, rong) {
  $('#modal').innerHTML = '<div class="phu-man"><div class="hop' + (rong ? ' rong' : '') + '"><div class="hop-dau"><h2>' + e(tieuDe) +
    '</h2><button class="nut-x" data-dong>×</button></div><div class="hop-than">' + than + '</div>' +
    (chan ? '<div class="hop-chan">' + chan + '</div>' : '') + '</div></div>';
  $('#modal [data-dong]').onclick = dongModal;
  $('#modal .phu-man').addEventListener('mousedown', (ev) => { if (ev.target.classList.contains('phu-man')) dongModal(); });
  return $('#modal .hop');
}
const dongModal = () => { $('#modal').innerHTML = ''; };
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if ($('#hoi').innerHTML) return;          // hộp hỏi tự lo phím Esc của nó
  if ($('#modal').innerHTML) dongModal();
});

/**
 * Hộp hỏi của app — thay prompt()/confirm() của trình duyệt: hộp mặc định lệch
 * tông, không hiện được khi app nằm trong iframe của hub trên một số máy, và chặn
 * cả trang. Nằm ở #hoi (trên #modal) nên hỏi được ngay trong cửa sổ email.
 * Trả về: có ô nhập → chuỗi (hoặc null nếu huỷ); không ô → true/false.
 */
function hoi({ tieuDe, noiDung = '', o = null, nut = 'Đồng ý', nguy = false }) {
  return new Promise((xong) => {
    const vung = $('#hoi');
    const oNhap = o ? (o.type === 'textarea'
      ? '<textarea class="in" id="hoiO" placeholder="' + e(o.placeholder || '') + '">' + e(o.value || '') + '</textarea>'
      : '<input class="in-o" id="hoiO" type="' + (o.type || 'text') + '" value="' + e(o.value || '') + '" placeholder="' + e(o.placeholder || '') + '">') : '';
    vung.innerHTML = '<div class="phu-man" style="z-index:80;align-items:center"><div class="hop" style="width:min(460px,100%)"><div class="hop-dau"><h2>' + e(tieuDe) +
      '</h2></div><div class="hop-than">' + (noiDung ? '<div style="margin-bottom:' + (o ? '10px' : '0') + '">' + e(noiDung) + '</div>' : '') + oNhap +
      '</div><div class="hop-chan"><button class="btn mo" id="hoiHuy">Huỷ</button><button class="btn chinh" id="hoiOk"' +
      (nguy ? ' style="background:var(--red);border-color:var(--red)"' : '') + '>' + e(nut) + '</button></div></div></div>';
    const ra = (v) => { vung.innerHTML = ''; document.removeEventListener('keydown', phim, true); xong(v); };
    const lay = () => (o ? $('#hoiO').value : true);
    const phim = (ev) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); ra(o ? null : false); }
      if (ev.key === 'Enter' && !(o && o.type === 'textarea')) { ev.preventDefault(); ra(lay()); }
    };
    document.addEventListener('keydown', phim, true);
    $('#hoiHuy').onclick = () => ra(o ? null : false);
    $('#hoiOk').onclick = () => ra(lay());
    $('.phu-man', vung).addEventListener('mousedown', (ev) => { if (ev.target.classList.contains('phu-man')) ra(o ? null : false); });
    setTimeout(() => { const x = $('#hoiO') || $('#hoiOk'); if (x) x.focus(); }, 0);
  });
}

/* ---------------- nạp ---------------- */
async function nap(moi) {
  const [meta, dl] = await Promise.all([S.meta && !moi ? S.meta : api('/api/meta'), api('/api/du-lieu' + (moi ? '?moi=1' : ''))]);
  S.meta = meta; S.dl = dl;
  $('#phuDe').textContent = dl.hopTac.filter((h) => !['Hoàn tất', 'Huỷ'].includes(h.buoc)).length + ' hợp tác đang chạy · ' + dl.kol.length + ' KOL';
  const l = $('#btnLark'); l.href = meta.larkUrl; l.hidden = false;
}
async function napSp() {
  if (S.sp) return S.sp;
  const r = await api('/api/san-pham');
  if (r.loi) toast(r.loi, true);
  S.sp = r.sanPham || [];
  return S.sp;
}

/* ---------------- điều hướng ---------------- */
const TABS = [['tong-quan', 'Hợp tác'], ['lich-trinh', 'Lịch trình'], ['ban-giao', 'Bàn giao'], ['kol', 'KOL'], ['dich-vu', 'Đối tác']];
function duong() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q] = h.split('?');
  const phan = p.split('/');
  return { trang: phan[0] || 'tong-quan', id: phan[1] || '', con: phan[2] || '', q: new URLSearchParams(q || '') };
}
const di = (h) => { location.hash = h; };
function veTabs(trang) {
  const on = trang === 'ht' ? 'tong-quan' : trang;
  $('#tabs').innerHTML = TABS.map(([k, t]) => '<button class="pill' + (k === on ? ' on' : '') + '" data-tab="' + k + '">' + t + '</button>').join('');
}
$('#tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) di('#/' + b.dataset.tab); });

async function ve() {
  if (S.quayLai) { S.quayLai = false; return; }
  if (S.sua && S.sua.ban) {
    const bo = await hoi({ tieuDe: 'Bảng đang sửa chưa lưu', noiDung: 'Rời trang sẽ mất các thay đổi chưa bấm Lưu.', nut: 'Bỏ thay đổi', nguy: true });
    /* Ở lại: trả địa chỉ về trang cũ, và bỏ qua đúng một lượt hashchange do chính việc đó gây ra. */
    if (!bo) { S.quayLai = true; history.back(); return; }
  }
  S.sua = null;
  const d = duong();
  veTabs(d.trang);
  const man = $('#man');
  try {
    if (d.trang === 'ht' && d.id) { veChiTiet(man, d.id, d.con || 'thong-tin'); return ganBanDo(man); }
    if (d.trang === 'lich-trinh') { veLichTrinh(man, d.q.get('ht')); return ganBanDo(man); }
    if (d.trang === 'ban-giao') return veBanGiaoTat(man);
    if (d.trang === 'kol') return veKol(man);
    if (d.trang === 'dich-vu') return veDichVu(man);
    return veTongQuan(man);
  } catch (err) {
    man.innerHTML = '<div class="bao cam">' + e(err.message) + '</div>';
  }
}
window.addEventListener('hashchange', ve);
window.addEventListener('beforeunload', (ev) => { if (S.sua && S.sua.ban) { ev.preventDefault(); ev.returnValue = ''; } });

/* ==========================================================================
   TỔNG QUAN
   ========================================================================== */
function thanhBuoc(b) {
  const i = BUOC.indexOf(b);
  return '<div class="thanh-buoc' + (b === 'Huỷ' ? ' huy' : '') + '">' + BUOC.slice(0, 9).map((_, j) =>
    '<i class="' + (j < i ? 'qua' : j === i ? 'nay' : '') + '"></i>').join('') + '</div>';
}
function khach(h) {
  return [h.nguoiLon ? h.nguoiLon + ' NL' : '', h.treEm ? h.treEm + ' TE' : '', h.emBe ? h.emBe + ' EB' : ''].filter(Boolean).join(' · ');
}
/* Hàng hợp tác trên một lưới CỘT CỐ ĐỊNH chung cho cả danh sách (anh Hùng 24/09: mỗi hàng tự co
 * cột theo nội dung nên ngày / tiền lệch nhau, khó dò). Cột trạng thái rộng cố định, nhãn xuống dòng. */
function dongHt(h) {
  const kq = h.kq || {};
  return '<button class="dong-ht" data-ht="' + h.id + '">' +
    '<div class="c-kol"><b>' + e(h.kolTen || '(chưa gắn KOL)') + '</b> <span class="phu">' + e(h.ma) + '</span>' + thanhBuoc(h.buoc) + '</div>' +
    '<div><div>' + (h.batDau ? ddmm(h.batDau) + ' – ' + ddmm(h.ketThuc || h.batDau) : '<span class="phu">Chưa chốt ngày</span>') + '</div><div class="phu">' + e(khach(h)) + '</div></div>' +
    '<div class="so"><div class="tien">' + tien(kq.tienCongTy) + 'đ</div><div class="phu">quy đổi ' + tien(kq.giaTriQuyDoi) + 'đ</div></div>' +
    '<div class="so"><div class="tien">' + (kq.camKet ? (kq.daDang || 0) + '/' + kq.camKet : '<span class="phu">—</span>') + '</div><div class="phu">' +
      (kq.xem ? tien(kq.xem) + ' xem' : kq.camKet ? 'chưa có số' : 'chưa có bàn giao') + '</div></div>' +
    '<div class="canh">' + nhanTT(h.buoc, mauBuoc(h.buoc)) + (h.treHan ? nhanTT(h.treHan + ' bàn giao trễ', 'do') : '') +
    (h.canKiem ? nhanTT(h.canKiem + ' dòng cần kiểm', 'cam') : '') + '</div></button>';
}
const DAU_HT = '<div class="dong-ht dau" aria-hidden="true"><div>KOL · tiến độ</div><div>Thời gian · khách</div><div class="so">Chi phí công ty</div>' +
  '<div class="so">Bài đã đăng</div><div class="canh">Tình trạng</div></div>';
function veTongQuan(man) {
  const dl = S.dl;
  const now = Date.now();
  const song = (h) => !['Hoàn tất', 'Huỷ'].includes(h.buoc);
  const LOC = {
    'cho-duyet': ['Chờ BGĐ duyệt', dl.so.choDuyet, 'cam', (h) => h.buoc === 'Chờ BGĐ duyệt'],
    'sap-di': ['Sắp đi 7 ngày', dl.so.sapDi, '', (h) => song(h) && h.batDau && h.batDau >= dauNgay(now) && h.batDau - now <= 7 * NGAY_MS],
    'dang-di': ['Đang đi tour', dl.so.dangDi, 'xanh', (h) => h.buoc === 'Đang đi tour'],
    'tre': ['Bàn giao quá hạn', dl.so.treHan, dl.so.treHan ? 'do' : '', (h) => h.treHan > 0],
    'can-do': ['Đến hạn nhập số', dl.so.canDo, dl.so.canDo ? 'cam' : '', null],
  };
  const loc = LOC[S.loc] && LOC[S.loc][3] ? S.loc : '';
  const ds = dl.hopTac.slice().sort((a, b) => (a.batDau || 9e15) - (b.batDau || 9e15));
  const dangLam = ds.filter((h) => song(h) && (!loc || LOC[loc][3](h)));
  const xong = ds.filter((h) => !song(h) && (!loc || LOC[loc][3](h))).reverse();
  man.innerHTML = '<div class="luoi-so">' + Object.entries(LOC).map(([k, [nhan, so, mau]]) =>
    '<button class="o-so bam ' + mau + (loc === k ? ' on' : '') + '" data-loc="' + k + '"><div class="nhan">' + nhan + '</div><div class="so">' + so + '</div></button>').join('') +
    '</div><div class="hang-nut" style="margin-bottom:12px"><button class="btn chinh" id="taoHt">Tạo hợp tác</button>' +
    (loc ? '<button class="btn mo" data-loc="">Bỏ lọc: ' + e(LOC[loc][0]) + '</button>' : '') + '</div>' +
    '<div class="ds-ht">' + (dangLam.length ? DAU_HT + dangLam.map(dongHt).join('') : '<div class="bao">Không có hợp tác nào đang chạy.</div>') + '</div>' +
    (xong.length ? '<h3 class="muc">Đã xong · ' + xong.length + '</h3><div class="ds-ht">' + DAU_HT + xong.map(dongHt).join('') + '</div>' : '');
  man.onclick = (ev) => {
    const b = ev.target.closest('[data-loc]');
    if (b) { const k = b.dataset.loc; if (k === 'can-do') return di('#/ban-giao?loc=can-do'); S.loc = S.loc === k ? '' : k; return veTongQuan(man); }
    const h = ev.target.closest('[data-ht]');
    if (h) return di('#/ht/' + h.dataset.ht);
    if (ev.target.id === 'taoHt') return moTaoHopTac();
  };
}

/* ---------------- form KOL dùng chung (Tạo hợp tác + Sửa KOL) ---------------- */
const MV = window.MaVung;
const UU_TIEN = 16;   // 16 nước đầu danh sách ma-vung.js = thị trường hay gặp
const DS_NUOC = [...MV.DS.slice(0, UU_TIEN), ...MV.DS.slice(UU_TIEN).sort((a, b) => a.ten.localeCompare(b.ten, 'vi'))];
const optNuoc = (v) => '<option value=""></option>' + DS_NUOC.map((x, i) =>
  (i === UU_TIEN ? '<option disabled>──────────</option>' : '') +
  '<option value="' + e(x.ten) + '"' + (x.ten === v ? ' selected' : '') + '>' + e(x.ten) + ' (+' + x.ma + ')</option>').join('');
/* Một mã có thể chung nhiều nước (+1 Mỹ/Canada, +7 Nga/Kazakhstan) — gộp tên vào một dòng. */
const DS_MA = (() => {
  const m = new Map();
  for (const x of DS_NUOC) { if (!m.has(x.ma)) m.set(x.ma, []); m.get(x.ma).push(x.ten); }
  return [...m.entries()].map(([ma, ten]) => ({ ma, nhan: '+' + ma + ' · ' + ten.slice(0, 3).join(', ') + (ten.length > 3 ? '…' : '') }));
})();
const optMa = (v) => { const c = String(v || '').replace(/\D/g, ''); return '<option value=""></option>' +
  DS_MA.map((x) => '<option value="+' + x.ma + '"' + (x.ma === c ? ' selected' : '') + '>' + e(x.nhan) + '</option>').join(''); };
/* Phần số sau mã vùng, để ô nhập không lặp lại "+84". */
const soNoi = (k) => { if (!k.sdt) return ''; const c = MV.chuan(k.sdt, k.maVung); return c.dep.replace(/^\+\d+\s*/, ''); };

function formKol(k, kenh, coTinhTrang) {
  const lv = new Set(k.linhVuc || []);
  return '<div class="luoi-form">' +
    '<label>Tên KOL<input class="in-o" data-k="ten" value="' + e(k.ten) + '" placeholder="Châu Kim Cương"></label>' +
    '<label>Xưng hô<select class="in-o" data-k="xungHo">' + opt(XUNG, k.xungHo || 'Chị', true) + '</select></label>' +
    '<label>Tên gọi trong thư<input class="in-o" data-k="tenGoi" value="' + e(k.tenGoi) + '" placeholder="Cương"></label>' +
    '<label>Quốc gia<select class="in-o" data-k="quocGia" data-vai="qg">' + optNuoc(k.quocGia || 'Việt Nam') + '</select></label>' +
    '<label>Mã vùng<select class="in-o" data-k="maVung" data-vai="mv">' + optMa(k.maVung || '+84') + '</select></label>' +
    '<label>Số điện thoại<input class="in-o" data-k="sdt" data-vai="sdt" value="' + e(soNoi(k)) + '" placeholder="778 866 707" inputmode="tel">' +
      '<span class="goi-y" data-vai="goiY"></span></label>' +
    '<label>Email<input class="in-o" type="email" data-k="email" value="' + e(k.email) + '"></label>' +
    '<label>Liên hệ khác<input class="in-o" data-k="lienHe" value="' + e(k.lienHe) + '" placeholder="Zalo, quản lý…"></label>' +
    '<label>Nguồn<select class="in-o" data-k="nguon">' + opt(NGUON, k.nguon, true) + '</select></label>' +
    '<label>Đánh giá<select class="in-o" data-k="danhGia">' + opt(['1', '2', '3', '4', '5'], k.danhGia ? String(k.danhGia) : '', true) + '</select></label>' +
    (coTinhTrang ? '<label>Tình trạng<select class="in-o" data-k="tinhTrang">' + opt(TT_KOL, k.tinhTrang, true) + '</select></label>' : '') +
    '<label class="rong">Lĩnh vực<div class="chip-ds" data-vai="lv">' + LINH_VUC.map((x) => '<button type="button" class="chip-chon' + (lv.has(x) ? ' on' : '') + '" data-lv="' + x + '">' + x + '</button>').join('') + '</div></label>' +
    '</div><h3 class="muc">Kênh</h3><div class="cuon"><table class="bang" data-vai="kenh"></table></div>' +
    '<button type="button" class="btn nho" data-vai="themKenh" style="margin-top:8px">Thêm kênh</button>';
}

/** Gắn hành vi cho form KOL trong `goc`. Trả về hàm đọc {kol, kenh, loi}. */
function ganFormKol(goc, k, kenhBanDau) {
  const kenh = kenhBanDau.map((x) => ({ ...x }));
  const q = (vai) => $('[data-vai="' + vai + '"]', goc);
  const veKenh = () => {
    q('kenh').innerHTML = '<thead><tr><th class="w-chon">Nền tảng</th><th>Tên kênh</th><th>Link</th><th class="so w-tien">Theo dõi</th><th>Re-up</th><th></th></tr></thead><tbody>' +
      kenh.map((x, i) => '<tr data-i="' + i + '"><td><select class="in-o" data-f="nenTang">' + opt(NEN_TANG, x.nenTang) + '</select></td><td><input class="in-o" data-f="ten" value="' + e(x.ten) + '"></td>' +
        '<td><input class="in-o" data-f="link" value="' + e(x.link) + '" placeholder="https://"></td><td><input class="in-o" type="number" min="0" data-f="theoDoi" value="' + (x.theoDoi ?? '') + '"></td>' +
        '<td style="text-align:center"><input type="checkbox" data-f="reup"' + (x.reup ? ' checked' : '') + '></td><td><button type="button" class="nut-x" data-xk="' + i + '">×</button></td></tr>').join('') + '</tbody>';
  };
  veKenh();
  q('kenh').oninput = q('kenh').onchange = (ev) => {
    const tr = ev.target.closest('tr[data-i]'); const f = ev.target.dataset.f; if (!tr || !f) return;
    const x = kenh[+tr.dataset.i]; const t = ev.target;
    x[f] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? null : Number(t.value)) : t.value;
    if (f === 'theoDoi') x.capNhat = Date.now();
    /* Dán link là đoán luôn nền tảng + tên kênh — đỡ gõ hai lần. */
    if (f === 'link' && ev.type === 'change') {
      const l = t.value;
      const nt = /tiktok\./i.test(l) ? 'TikTok' : /facebook\.|fb\./i.test(l) ? 'Facebook' : /youtu/i.test(l) ? 'YouTube' : /instagram\./i.test(l) ? 'Instagram' : /threads\./i.test(l) ? 'Threads' : '';
      const m = /@([\w.\-]+)/.exec(l) || /(?:facebook|instagram|threads)\.[a-z]+\/([\w.\-]+)/i.exec(l);
      if (nt) x.nenTang = nt;
      if (!x.ten && m) x.ten = m[1];
      if (nt || m) veKenh();
    }
  };
  q('kenh').onclick = (ev) => { const b = ev.target.closest('[data-xk]'); if (b) { kenh.splice(+b.dataset.xk, 1); veKenh(); } };
  q('themKenh').onclick = () => { kenh.push({ nenTang: 'TikTok', ten: '', link: '', theoDoi: null }); veKenh(); };
  q('lv').onclick = (ev) => { const b = ev.target.closest('[data-lv]'); if (b) b.classList.toggle('on'); };

  /* Số điện thoại: gợi ý ngay khi gõ, tự sửa khi rời ô. */
  const sdt = q('sdt'), mv = q('mv'), qg = q('qg'), goiY = q('goiY');
  const xem = () => {
    const c = MV.chuan(sdt.value, mv.value);
    if (!sdt.value.trim()) { goiY.textContent = ''; goiY.className = 'goi-y'; return c; }
    goiY.className = 'goi-y ' + (c.loi ? 'loi' : 'dung');
    goiY.textContent = c.loi ? c.loi : '→ ' + c.dep + (c.sua.length ? ' · ' + c.sua.join(', ') : '');
    return c;
  };
  sdt.addEventListener('input', xem);
  sdt.addEventListener('blur', () => {
    const c = xem();
    if (!sdt.value.trim()) return;
    if (c.ma && '+' + c.ma !== mv.value) {
      mv.value = '+' + c.ma;
      /* Số dán vào mang mã nước khác → quốc gia đi theo, không để "Thái Lan · +84". */
      const hienTai = MV.theoTen(qg.value);
      if (!hienTai || hienTai.ma !== c.ma) { const n = MV.theoMa(c.ma); if (n) qg.value = n.ten; }
    }
    if (c.so) sdt.value = c.dep.replace(/^\+\d+\s*/, '');
    xem();
  });
  mv.addEventListener('change', xem);
  qg.addEventListener('change', () => { const n = MV.theoTen(qg.value); if (n) { mv.value = '+' + n.ma; xem(); } });
  xem();

  return () => {
    const kol = { id: k.id || undefined, linhVuc: $$('[data-lv].on', goc).map((b) => b.dataset.lv) };
    $$('[data-k]', goc).forEach((x) => { kol[x.dataset.k] = x.dataset.k === 'danhGia' ? (x.value ? Number(x.value) : null) : x.value; });
    const c = MV.chuan(kol.sdt, kol.maVung);
    if (kol.sdt) { kol.sdt = c.quocTe; if (c.ma) kol.maVung = '+' + c.ma; }
    /* Base từ chối email sai dạng bằng một lỗi khó đọc (đã gặp thật 23/09) — kiểm ở đây trước. */
    kol.email = String(kol.email || '').trim().replace(/\s+/g, '');
    const loi = !String(kol.ten || '').trim() ? 'Chưa có tên KOL'
      : kol.email && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(kol.email) ? 'Email "' + kol.email + '" chưa đúng dạng (ví dụ ten@gmail.com)' : '';
    return { kol, kenh: kenh.filter((x) => x.ten || x.link), loi, canhSdt: sdt.value.trim() && c.loi ? c.loi : '' };
  };
}

/* ---------------- Tạo hợp tác: MỘT màn, đủ thông tin cần nhất ---------------- */
const YEU_CAU_MAU = 'Nhắc tên Rooty Trip Phú Quốc trong video (voice + hình ảnh), có kêu gọi hành động (CTA) đến Rooty Trip Phú Quốc. ' +
  'Gắn thẻ Rooty Trip Phú Quốc, hashtag #RootyTrip #RootyTripPhuQuoc + hashtag của cơ sở tài trợ.';
function canhBaoKhach(nl, te, eb) {
  if (nl + te + eb === 0) return 'Chưa có khách nào';
  if (nl === 0) return 'Chưa có người lớn nào';
  if (nl + te + eb > 15) return 'Tổng ' + (nl + te + eb) + ' khách — nhiều bất thường cho một chuyến KOL, kiểm lại';
  if (te > nl * 4) return te + ' trẻ em cho ' + nl + ' người lớn — kiểm lại có gõ nhầm không';
  return '';
}

function moTaoHopTac(kolId) {
  const trong = { quocGia: 'Việt Nam', maVung: '+84', xungHo: 'Chị', linhVuc: [] };
  let kolChon = kolId ? S.dl.kol.find((k) => k.id === kolId) || trong : trong;
  const hop = moModal('Tạo hợp tác', '<div class="bao" style="background:var(--surface-3);margin-bottom:12px">' +
    '<label class="ch-dong" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>KOL</b><select class="in-o" id="thChonKol" style="max-width:320px">' +
    '<option value="">— KOL mới —</option>' + S.dl.kol.map((k) => '<option value="' + k.id + '"' + (k.id === kolChon.id ? ' selected' : '') + '>' + e(k.ten) + '</option>').join('') +
    '</select><span class="nho">Chọn KOL cũ thì thông tin tự điền, sửa ở đây là sửa luôn hồ sơ KOL.</span></label></div>' +
    '<div id="thKol"></div>' +
    '<h3 class="muc">Chuyến đi</h3><div class="luoi-form">' +
    '<label>Người lớn (≥1m40)<input class="in-o" type="number" min="0" max="30" id="thNL" value="2"></label>' +
    '<label>Trẻ em (1m–1m39)<input class="in-o" type="number" min="0" max="30" id="thTE" value="0"></label>' +
    '<label>Em bé (&lt;1m)<input class="in-o" type="number" min="0" max="30" id="thEB" value="0"></label>' +
    '<label>Ngày bắt đầu<input class="in-o" type="date" id="thTu"></label>' +
    '<label>Ngày kết thúc<input class="in-o" type="date" id="thDen"></label>' +
    '<label>Mã đơn Tourwell<input class="in-o" id="thRT" placeholder="RT… (điền sau cũng được)"></label>' +
    '<label class="rong"><span class="goi-y" id="thCanh"></span></label>' +
    '<label class="rong">Yêu cầu nội dung<textarea class="in" id="thYc">' + e(YEU_CAU_MAU) + '</textarea></label></div>',
  '<div class="lon"></div><button class="btn mo" data-dong>Huỷ</button><button class="btn chinh" id="thTao">Tạo và dựng bảng kê</button>', true);
  $('.hop-chan [data-dong]', hop).onclick = dongModal;
  let doc;
  const veKol = () => {
    const kenh = kolChon.id ? S.dl.kenh.filter((x) => x.kol === kolChon.id) : [{ nenTang: 'TikTok', ten: '', link: '', theoDoi: null }];
    $('#thKol').innerHTML = formKol(kolChon, kenh, false);
    doc = ganFormKol($('#thKol'), kolChon, kenh);
  };
  veKol();
  $('#thChonKol').onchange = (ev) => { kolChon = S.dl.kol.find((k) => k.id === ev.target.value) || trong; veKol(); };
  const kiem = () => {
    const nl = +$('#thNL').value || 0, te = +$('#thTE').value || 0, eb = +$('#thEB').value || 0;
    const tu = tuChuoi($('#thTu').value), den = tuChuoi($('#thDen').value);
    const ds = [canhBaoKhach(nl, te, eb)];
    if (tu && den && den < tu) ds.push('Ngày kết thúc trước ngày bắt đầu');
    else if (tu && den) ds.push('');
    const dem = tu && den && den >= tu ? Math.round((den - tu) / NGAY_MS) : null;
    const loi = ds.filter(Boolean).join(' · ');
    $('#thCanh').className = 'goi-y ' + (loi ? 'loi' : 'dung');
    $('#thCanh').textContent = loi || (dem != null ? (dem + 1) + ' ngày ' + dem + ' đêm · ' + (nl + te + eb) + ' khách' : '');
    return loi;
  };
  ['#thNL', '#thTE', '#thEB', '#thTu', '#thDen'].forEach((s) => $(s).addEventListener('input', kiem));
  $('#thTu').addEventListener('change', () => { if (!$('#thDen').value) $('#thDen').value = $('#thTu').value; kiem(); });
  kiem();
  $('#thTao').onclick = async () => {
    const f = doc();
    if (f.loi) return toast(f.loi, true);
    const loiKhach = kiem();
    if (/Ngày kết thúc/.test(loiKhach)) return toast(loiKhach, true);
    if (loiKhach && !(await hoi({ tieuDe: 'Kiểm lại số khách', noiDung: loiKhach + '. Vẫn tạo?', nut: 'Vẫn tạo' }))) return;
    if (f.canhSdt && !(await hoi({ tieuDe: 'Số điện thoại có vẻ sai', noiDung: f.canhSdt + '. Vẫn lưu?', nut: 'Vẫn lưu' }))) return;
    const ht = { nguoiLon: +$('#thNL').value || 0, treEm: +$('#thTE').value || 0, emBe: +$('#thEB').value || 0,
      batDau: $('#thTu').value, ketThuc: $('#thDen').value, maTourwell: $('#thRT').value.trim(), yeuCau: $('#thYc').value };
    $('#thTao').disabled = true;
    try {
      const r = await api('/api/hop-tac/tao', { kol: f.kol, kenh: f.kenh, ht });
      dongModal(); await nap(true); toast('Đã tạo ' + r.ma + ' — dựng bảng kê'); di('#/ht/' + r.id + '/bang-ke');
    } catch (err) { toast(err.message, true); $('#thTao').disabled = false; }
  };
}


/* ==========================================================================
   CHI TIẾT HỢP TÁC
   ========================================================================== */
const TAB_CT = [['thong-tin', 'Thông tin'], ['bang-ke', 'Bảng kê'], ['ban-giao', 'Bàn giao'], ['lich-trinh', 'Lịch trình'], ['email', 'Email']];
const MOC_BUOC = { 'Chờ BGĐ duyệt': 'trinhLuc', 'BGĐ đã duyệt': 'duyetLuc', 'Đã mời KOL': 'thuMoiLuc', 'KOL đã xác nhận': 'xacNhanLuc', 'Đang đi tour': 'batDau', 'Chờ nhận sản phẩm': 'ketThuc' };

function veChiTiet(man, id, con) {
  const ht = htCua(id);
  if (!ht) { man.innerHTML = '<div class="bao cam">Không thấy hợp tác này — có thể đã bị xoá trên Base.</div>'; return; }
  const kol = kolCua(ht.kol);
  const i = BUOC.indexOf(ht.buoc);
  man.innerHTML = '<div class="ct-dau"><div style="flex:1;min-width:240px"><div class="phu"><a href="#/tong-quan">Hợp tác</a> / ' + e(ht.ma) + '</div><h1>' + e(kol.ten || '(chưa gắn KOL)') + '</h1>' +
    '<div class="phu">' + (ht.batDau ? ddmm(ht.batDau) + ' – ' + ddmm(ht.ketThuc) + '/' + vn(ht.ketThuc || ht.batDau).y : 'Chưa chốt ngày') + ' · ' + e(khach(ht)) + '</div></div>' +
    '<div class="luoi-tong" style="flex:2;min-width:320px">' +
    '<div class="o-so"><div class="nhan">Chi phí công ty</div><div class="so">' + tien(ht.kq.tienCongTy) + '</div></div>' +
    '<div class="o-so"><div class="nhan">Giá trị quy đổi</div><div class="so">' + tien(ht.kq.giaTriQuyDoi) + '</div>' + (ht.kq.thieuGia ? '<div class="duoi">' + ht.kq.thieuGia + ' dòng FOC thiếu giá công bố</div>' : '') + '</div>' +
    '<div class="o-so"><div class="nhan">Bàn giao</div><div class="so">' + ht.kq.daDang + '/' + ht.kq.camKet + '</div>' + (ht.kq.xem ? '<div class="duoi">' + tien(ht.kq.xem) + ' lượt xem</div>' : '') + '</div>' +
    '</div></div>' +
    '<div class="buoc-ds">' + BUOC.slice(0, 9).map((b, j) => '<div class="buoc-o ' + (ht.buoc === 'Huỷ' ? '' : j < i ? 'qua' : j === i ? 'nay' : '') + '"><span></span>' + e(b) +
      (MOC_BUOC[b] && ht[MOC_BUOC[b]] && j <= i ? '<small>' + ddmm(ht[MOC_BUOC[b]]) + '</small>' : '') + '</div>').join('') + '</div>' +
    '<div class="the">' + viecTiep(ht) + '</div>' +
    '<div class="pills" style="display:inline-flex;margin-bottom:12px">' + TAB_CT.map(([k, t]) => '<button class="pill' + (k === con ? ' on' : '') + '" data-con="' + k + '">' + t + '</button>').join('') + '</div>' +
    '<div id="ctThan"></div>';
  man.onclick = (ev) => {
    const c = ev.target.closest('[data-con]');
    if (c) return di('#/ht/' + id + '/' + c.dataset.con);
    const v = ev.target.closest('[data-viec]');
    if (v) return lamViec(ht, v.dataset.viec, v);
  };
  const than = $('#ctThan');
  ({ 'thong-tin': veThongTin, 'bang-ke': veBangKe, 'ban-giao': veBanGiaoHt, 'lich-trinh': (t, h) => veDongThoiGian(t, h, true), email: veEmail }[con] || veThongTin)(than, ht);
}

function viecTiep(ht) {
  const b = ht.buoc;
  const n = (viec, chu, chinh) => '<button class="btn' + (chinh ? ' chinh' : '') + '" data-viec="' + viec + '">' + chu + '</button>';
  let nut = '';
  if (b === 'Đang trao đổi') nut = ht.chotLuc ? n('email:de-xuat', 'Soạn email trình BGĐ', 1) + n('moChot', 'Mở chốt bảng kê')
    : n('xem:bang-ke', 'Bảng kê & hợp tác FOC') + n('chot', 'Chốt bảng kê', 1);
  else if (b === 'Chờ BGĐ duyệt') nut = n('daDuyet', 'BGĐ đã duyệt', 1) + n('tuChoi', 'BGĐ yêu cầu sửa') + n('email:de-xuat', 'Gửi lại email') + n('kiemThu', 'Kiểm thư trả lời');
  else if (b === 'BGĐ đã duyệt') nut = n('email:thu-moi', 'Soạn thư mời KOL', 1);
  else if (b === 'Đã mời KOL') nut = n('kolXacNhan', 'KOL đã xác nhận', 1) + n('email:thu-moi', 'Gửi lại thư mời') + n('kiemThu', 'Kiểm thư trả lời');
  else if (b === 'KOL đã xác nhận') nut = '<input class="in-o" id="maRT" placeholder="Mã đơn Tourwell (RT…)" style="width:200px" value="' + e(ht.maTourwell) + '">' + n('taoDichVu', 'Đã tạo tour Tourwell', 1);
  else if (b === 'Đã tạo tour Tourwell' || b === 'Đang đi tour') nut = n('xem:lich-trinh', 'Theo dõi lịch trình', 1) + n('xem:ban-giao', 'Sản phẩm cam kết');
  else if (b === 'Chờ nhận sản phẩm') nut = n('xem:ban-giao', 'Nhận sản phẩm', 1) + n('email:bao-cao', 'Soạn báo cáo BGĐ') + n('hoanTat', 'Hoàn tất');
  else if (b === 'Hoàn tất') nut = n('email:bao-cao', 'Soạn báo cáo BGĐ');
  /* Thư trả lời bộ theo dõi bắt được — hiện ngay cạnh nút để anh bấm một cái. */
  const tl = b === 'Chờ BGĐ duyệt' && ht.bgdTraLoi ? ['BGĐ trả lời', ht.bgdTraLoi, ht.bgdTraLoiLuc]
    : b === 'Đã mời KOL' && ht.kolTraLoi ? ['KOL trả lời', ht.kolTraLoi, ht.kolTraLoiLuc] : null;
  const phai = '<div class="lon"></div>' + (BUOC.indexOf(b) > 0 || b === 'Huỷ' ? '<button class="btn mo nho" data-viec="lui" title="Bấm nhầm? Quay về bước trước">Lùi bước</button>' : '') +
    (!['Hoàn tất', 'Huỷ'].includes(b) ? '<button class="btn mo nho" data-viec="huy">Huỷ hợp tác</button>' : '');
  return '<div class="viec-tiep"><span class="nhan">Việc tiếp theo</span>' + (nut || '<span class="nho">' + e(b) + '</span>') + phai + '</div>' +
    (tl ? '<div class="tra-loi"><b>' + tl[0] + (tl[2] ? ' · ' + ddmm(tl[2]) + ' ' + hhmm(tl[2]) : '') + '</b><div>' + e(tl[1]) + '</div></div>' : '');
}

async function lamViec(ht, viec, nut) {
  if (viec.startsWith('email:')) return moEmail(ht, viec.slice(6));
  if (viec.startsWith('xem:')) return di('#/ht/' + ht.id + '/' + viec.slice(4));
  if (viec === 'kiemThu') {
    if (nut) nut.disabled = true;
    try {
      const r = await api('/api/theo-doi/kiem', {});
      if (r.loi) toast(r.loi, true); else toast(r.moi ? 'Có ' + r.moi + ' thư trả lời mới' : 'Chưa có thư trả lời mới');
      await nap(true); ve();
    } catch (err) { toast(err.message, true); if (nut) nut.disabled = false; }
    return;
  }
  const b = { viec };
  if (viec === 'chot') {
    if (S.sua && S.sua.ban) return toast('Bảng kê đang sửa chưa lưu — bấm Lưu bảng kê trước', true);
    if (!(await hoi({ tieuDe: 'Chốt bảng kê', noiDung: 'Chốt ' + tien(ht.kq.tienCongTy) + 'đ chi phí công ty (giá trị quy đổi ' + tien(ht.kq.giaTriQuyDoi) + 'đ) để trình Ban Giám Đốc? Sau khi chốt, bảng kê khoá lại — cần sửa thì bấm Mở chốt.', nut: 'Chốt bảng kê' }))) return;
  } else if (viec === 'moChot') {
    if (!(await hoi({ tieuDe: 'Mở chốt bảng kê', noiDung: BUOC.indexOf(ht.buoc) >= 1 ? 'Bảng kê đã trình BGĐ. Sửa xong nhớ chốt lại và gửi lại email cho BGĐ.' : 'Mở để sửa bảng kê. Sửa xong chốt lại rồi mới trình BGĐ.', nut: 'Mở chốt' }))) return;
  } else if (viec === 'lui') {
    const truoc = ht.buoc === 'Huỷ' ? 'bước trước khi huỷ' : '"' + BUOC[BUOC.indexOf(ht.buoc) - 1] + '"';
    if (!(await hoi({ tieuDe: 'Lùi bước', noiDung: 'Quay "' + ht.buoc + '" về ' + truoc + '? Mốc thời gian của bước đang đứng sẽ được xoá, lịch sử vẫn giữ.', nut: 'Lùi bước' }))) return;
  } else if (viec === 'daDuyet') {
    const y = await hoi({ tieuDe: 'BGĐ đã duyệt', noiDung: 'Ghi lại ý kiến của BGĐ nếu có.', o: { type: 'textarea', placeholder: 'Ý kiến (có thể để trống)', value: ht.bgdTraLoi || '' }, nut: 'Ghi đã duyệt' });
    if (y === null) return; b.yKien = y;
  } else if (viec === 'tuChoi') {
    const y = await hoi({ tieuDe: 'BGĐ yêu cầu sửa', noiDung: 'Hợp tác quay về bước Đang trao đổi.', o: { type: 'textarea', placeholder: 'BGĐ yêu cầu sửa gì?', value: ht.bgdTraLoi || '' }, nut: 'Ghi yêu cầu' });
    if (y === null) return; b.yKien = y;
  } else if (viec === 'taoDichVu') {
    b.maTourwell = (($('#maRT') || {}).value || '').trim();
    if (!b.maTourwell && !(await hoi({ tieuDe: 'Chưa có mã đơn Tourwell', noiDung: 'Vẫn chuyển sang bước Đã tạo tour Tourwell? Mã RT dán sau ở tab Thông tin được.', nut: 'Vẫn chuyển' }))) return;
  } else if (viec === 'huy') {
    const y = await hoi({ tieuDe: 'Huỷ hợp tác', o: { type: 'textarea', placeholder: 'Lý do huỷ' }, nut: 'Huỷ hợp tác', nguy: true });
    if (y === null) return; b.lyDo = y;
  } else if (viec === 'hoanTat') {
    if (ht.kq.daDang < ht.kq.camKet && !(await hoi({ tieuDe: 'Chưa đủ sản phẩm', noiDung: 'Mới nhận ' + ht.kq.daDang + '/' + ht.kq.camKet + ' sản phẩm cam kết. Vẫn đánh dấu hoàn tất?', nut: 'Vẫn hoàn tất' }))) return;
  }
  if (nut) nut.disabled = true;
  try {
    const r = await api('/api/hop-tac/' + ht.id + '/buoc', b);
    await nap(true); toast(viec === 'chot' ? 'Đã chốt bảng kê — bây giờ soạn email trình BGĐ' : viec === 'moChot' ? 'Đã mở chốt bảng kê' : (viec === 'lui' ? 'Đã lùi về: ' : 'Đã chuyển: ') + r.buoc); ve();
  } catch (err) { toast(err.message, true); if (nut) nut.disabled = false; }
}

/* ---------------- Thông tin ---------------- */
function veThongTin(than, ht) {
  const kol = kolCua(ht.kol);
  const lichSu = String(ht.lichSu || '').split('\n').filter(Boolean).reverse();
  than.innerHTML = '<div class="the"><div class="the-dau"><h2>Chuyến đi</h2><span class="goi-y" id="ttCanh"></span><div class="lon"></div><button class="btn chinh nho" id="luuTT">Lưu</button></div><div class="the-than"><div class="luoi-form">' +
    '<label>Người lớn (≥1m40)<input class="in-o" type="number" min="0" max="30" data-k="nguoiLon" value="' + (ht.nguoiLon || 0) + '"></label>' +
    '<label>Trẻ em (1m–1m39)<input class="in-o" type="number" min="0" max="30" data-k="treEm" value="' + (ht.treEm || 0) + '"></label>' +
    '<label>Em bé (&lt;1m)<input class="in-o" type="number" min="0" max="30" data-k="emBe" value="' + (ht.emBe || 0) + '"></label>' +
    '<label>Ngày bắt đầu<input class="in-o" type="date" data-k="batDau" value="' + ngayIn(ht.batDau) + '"></label>' +
    '<label>Ngày kết thúc<input class="in-o" type="date" data-k="ketThuc" value="' + ngayIn(ht.ketThuc) + '"></label>' +
    '<label>Mã đơn Tourwell<input class="in-o" data-k="maTourwell" value="' + e(ht.maTourwell) + '" placeholder="RT…"></label>' +
    '<label>Trạng thái Tourwell<select class="in-o" data-k="ttTourwell">' + opt(['Chưa tạo', 'Đang xử lý', 'Thành công', 'Đã gửi điều hành'], ht.ttTourwell, true) + '</select></label>' +
    '<label class="rong">Yêu cầu nội dung<textarea class="in" data-k="yeuCau" placeholder="Nhắc tên, CTA, gắn thẻ, hashtag…">' + e(ht.yeuCau) + '</textarea></label>' +
    '<label class="rong">Yêu cầu nội dung (tiếng Anh, cho thư mời KOL nước ngoài)<textarea class="in" data-k="yeuCauEn" placeholder="Để trống = app tự dịch các câu quen (nhắc tên, CTA, gắn thẻ, hashtag); câu lạ giữ tiếng Việt">' + e(ht.yeuCauEn) + '</textarea></label>' +
    '<label class="rong">Ghi chú<textarea class="in" data-k="ghiChu">' + e(ht.ghiChu) + '</textarea></label>' +
    '</div></div></div>' +
    '<div class="the"><div class="the-dau"><h2>KOL</h2><div class="lon"></div><button class="btn nho" id="suaKol">Sửa KOL</button></div><div class="the-than">' + tomTatKol(kol) + '</div></div>' +
    '<div class="the"><div class="the-dau"><h2>Duyệt &amp; mốc</h2></div><div class="the-than"><div class="luoi-form">' +
    [['Trình BGĐ', ht.trinhLuc], ['BGĐ duyệt', ht.duyetLuc], ['Gửi thư mời', ht.thuMoiLuc], ['KOL xác nhận', ht.xacNhanLuc]].map(([n, v]) =>
      '<label>' + n + '<span style="font-weight:400;color:var(--text)">' + (v ? ddmm(v) + ' ' + hhmm(v) : '—') + '</span></label>').join('') +
    '<label>Người duyệt<span style="font-weight:400;color:var(--text)">' + e(ht.nguoiDuyet || '—') + (ht.kenhDuyet ? ' · ' + e(ht.kenhDuyet) : '') + '</span></label>' +
    '<label class="rong">Ý kiến BGĐ<span style="font-weight:400;color:var(--text)">' + e(ht.yKien || '—') + '</span></label>' +
    (ht.lyDoHuy ? '<label class="rong">Lý do huỷ<span style="font-weight:400;color:var(--text)">' + e(ht.lyDoHuy) + '</span></label>' : '') +
    '<label>Nhảy thẳng tới bước<select class="in-o" id="doiBuoc">' + opt(BUOC, ht.buoc) + '</select></label>' +
    '</div>' + (lichSu.length ? '<h3 class="muc">Lịch sử bước</h3><div class="lich-su">' + lichSu.map((d) => '<div>' + e(d) + '</div>').join('') + '</div>' : '') +
    '</div></div>';
  const kiemKhach = () => {
    const g = (k) => +($('[data-k="' + k + '"]', than).value || 0);
    const l = canhBaoKhach(g('nguoiLon'), g('treEm'), g('emBe'));
    $('#ttCanh').className = 'goi-y ' + (l ? 'loi' : '');
    $('#ttCanh').textContent = l;
    return l;
  };
  $$('[data-k="nguoiLon"],[data-k="treEm"],[data-k="emBe"]', than).forEach((x) => x.addEventListener('input', kiemKhach));
  kiemKhach();
  $('#luuTT').onclick = async () => {
    const l = kiemKhach();
    if (l && !(await hoi({ tieuDe: 'Kiểm lại số khách', noiDung: l + '. Vẫn lưu?', nut: 'Vẫn lưu' }))) return;
    const b = { id: ht.id };
    $$('[data-k]', than).forEach((x) => { b[x.dataset.k] = x.type === 'number' ? Number(x.value || 0) : x.value; });
    $('#luuTT').disabled = true;
    try { await api('/api/hop-tac', b); await nap(true); toast('Đã lưu'); ve(); } catch (err) { toast(err.message, true); $('#luuTT').disabled = false; }
  };
  $('#suaKol').onclick = () => moKol(kol.id);
  $('#doiBuoc').onchange = async (ev) => {
    if (!(await hoi({ tieuDe: 'Nhảy thẳng tới bước', noiDung: 'Chuyển "' + ht.buoc + '" sang "' + ev.target.value + '"? Chỉ dùng khi sửa sai — các nút Việc tiếp theo tự ghi ngày trình, ngày duyệt…; nhảy tay thì không. Bấm nhầm một bước thì dùng nút Lùi bước.', nut: 'Chuyển' }))) { ev.target.value = ht.buoc; return; }
    try { await api('/api/hop-tac/' + ht.id + '/buoc', { viec: 'doiBuoc', buoc: ev.target.value }); await nap(true); ve(); } catch (err) { toast(err.message, true); }
  };
}

function tomTatKol(kol) {
  if (!kol || !kol.id) return '<span class="nho">Chưa gắn KOL</span>';
  const kenh = S.dl.kenh.filter((k) => k.kol === kol.id);
  return '<div class="luoi-form">' + [['Tên', kol.ten + (kol.xungHo ? ' (' + kol.xungHo + ' ' + (kol.tenGoi || '') + ')' : '')], ['Quốc gia', kol.quocGia], ['Điện thoại', kol.sdt],
    ['Email', kol.email], ['Liên hệ khác', kol.lienHe], ['Tổng theo dõi', tien(kol.tongTheoDoi)]].map(([n, v]) =>
    '<label>' + n + '<span style="font-weight:400;color:var(--text)">' + e(v || '—') + '</span></label>').join('') + '</div>' +
    '<div class="kenh-ds">' + kenh.map(chipKenh).join('') + '</div>';
}
const chipKenh = (k) => '<span class="kenh-chip">' + e(k.nenTang) + ' · ' + (k.link ? '<a href="' + e(k.link) + '" target="_blank" rel="noopener">' + e(k.ten) + '</a>' : e(k.ten)) +
  (k.theoDoi != null ? ' <b>' + soGon(k.theoDoi) + '</b>' : '') + (k.reup ? ' · re-up' : '') + '</span>';
const soGon = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n || 0));

/* ---------------- Bảng kê (kèm lịch trình ngay bên cạnh) ---------------- */
const XIN_FOC = ['Không áp dụng', 'Chưa đề xuất', 'Đã gửi đề xuất', 'Đối tác đồng ý', 'Đối tác từ chối'];
const FOC_CHO = ['Chưa đề xuất', 'Đã gửi đề xuất'];
const MAU_FOC = { 'Chưa đề xuất': 'cam', 'Đã gửi đề xuất': 'cam', 'Đối tác đồng ý': 'xanh', 'Đối tác từ chối': 'do' };
/* Đối tác trả lời đề xuất FOC → dòng tự đổi hình thức chi — bản sao của tinh.theoFoc để tổng đổi ngay. */
const theoFoc = (t) => (t === 'Đối tác đồng ý' ? { hinhThuc: 'FOC đối tác', donGiaChi: 0 } : t === 'Đối tác từ chối' ? { hinhThuc: 'Công ty chi' } : {});
/** Tên đối tác đã biết — gợi ý cho ô Đối tác. */
function dsDoiTac(them) {
  return [...new Set(['Sun World', 'Vinpearl', ...S.dl.doiTac.map((d) => d.ten), ...S.dl.dichVu.map((d) => d.nhaCungCap),
    ...S.dl.hangMuc.map((h) => h.nhaCungCap), ...(them || [])].map((x) => String(x || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
}

/* ---------------- bản đồ lịch trình (public/ban-do.js) ----------------
 * htmlBanDo() chỉ đặt KHUNG + ghi dữ liệu vào S.bd; ganBanDo() gắn bản đồ thật (Leaflet)
 * sau khi khung đã nằm trên trang. Tách hai bước vì Leaflet cần phần tử thật, và để gõ
 * phím trong bảng kê không phải dựng lại bản đồ. */
S.bd = {}; let soBd = 0;
function htmlBanDo(moc, nho) {
  if (!window.BanDo || !moc.length) return '';
  const id = 'bd' + (++soBd);
  S.bd[id] = { moc, nho };
  return '<div class="bd-khung' + (nho ? ' nho' : '') + '"><button type="button" class="bd-phong-nut" data-bdfs title="Mở rộng toàn màn hình (Esc để thu về)">Toàn màn hình</button>' +
    '<div class="bd-that" id="' + id + '"></div><div class="bd-chu" data-bdc="' + id + '"></div></div>';
}
/* Toàn màn hình: dùng Fullscreen API thật (iframe của hub đã allow="fullscreen"); trình duyệt
 * chặn thì phóng bằng CSS phủ kín khung (.bd-phong). Đổi kích thước xong phải bảo Leaflet vẽ lại. */
function veLaiBanDo(khung) {
  const m = khung && $('.bd-that', khung);
  if (m && m._banDo) setTimeout(() => m._banDo.invalidateSize(), 120);
}
function doiToanManHinh(khung) {
  const dangMo = document.fullscreenElement === khung || khung.classList.contains('bd-phong');
  const nut = $('[data-bdfs]', khung);
  if (dangMo) {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    khung.classList.remove('bd-phong');
    if (nut) nut.textContent = 'Toàn màn hình';
    return veLaiBanDo(khung);
  }
  const phongCss = () => { khung.classList.add('bd-phong'); if (nut) nut.textContent = 'Thu nhỏ'; veLaiBanDo(khung); };
  if (khung.requestFullscreen) {
    khung.requestFullscreen().then(() => { if (nut) nut.textContent = 'Thu nhỏ'; veLaiBanDo(khung); }).catch(phongCss);
  } else phongCss();
}
document.addEventListener('click', (ev) => { const b = ev.target.closest('[data-bdfs]'); if (b) doiToanManHinh(b.closest('.bd-khung')); });
document.addEventListener('fullscreenchange', () => {
  for (const k of $$('.bd-khung')) {
    if (document.fullscreenElement !== k && !k.classList.contains('bd-phong')) { const n = $('[data-bdfs]', k); if (n) n.textContent = 'Toàn màn hình'; }
    veLaiBanDo(k);
  }
});
/* Esc thu bản phóng CSS (bản Fullscreen API trình duyệt tự lo Esc). */
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  const k = $('.bd-khung.bd-phong');
  if (k) { ev.stopPropagation(); doiToanManHinh(k); }
}, true);
const giaiLink = {};
async function ganBanDo(goc) {
  for (const el of $$('.bd-that', goc || document)) {
    const cf = S.bd[el.id];
    if (!cf || el.dataset.xong) continue;
    el.dataset.xong = '1';
    /* Link Google Maps rút gọn trong Điểm hẹn → hỏi server giải ra toạ độ (một lần mỗi link). */
    const can = [...new Set(cf.moc.map((m) => window.BanDo.linkNgan(m.h.diemHen)).filter((u) => u && !(u in giaiLink)))];
    await Promise.all(can.map((u) => api('/api/vi-tri?u=' + encodeURIComponent(u)).then((r) => { giaiLink[u] = r.lat ? r : null; }).catch(() => { giaiLink[u] = null; })));
    const ngay = [...new Set(cf.moc.map((m) => m.ngay).filter(Boolean))].sort((x, y) => x - y);
    const nhan = ngay.map((d) => { const t = vn(d); return THU[t.thu] + ' ' + p2(t.d) + '/' + p2(t.m); });
    const r = await window.BanDo.veThat(el, cf.moc, { nho: cf.nho, giai: giaiLink, ngayNhan: nhan });
    const chu = $('[data-bdc="' + el.id + '"]', goc || document);
    if (!chu) continue;
    if (!r.soDiem) {
      chu.innerHTML = '<span class="nho">Chưa đặt được mốc nào lên bản đồ — ghi Điểm hẹn (VinWonders, Bãi Sao…) hoặc dán link Google Maps vào Điểm hẹn.</span>';
      continue;
    }
    chu.innerHTML = nhan.map((t, i) => (r.theoNgay && r.theoNgay[i]
      ? '<a class="bd-ngay n' + (i % 5) + '" href="' + e(r.theoNgay[i]) + '" target="_blank" rel="noopener" title="Mở lộ trình ngày này trên Google Maps">' + t + '</a>'
      : '<span class="bd-ngay n' + (i % 5) + '">' + t + '</span>')).join('') +
      (r.caChuyen && r.caChuyen.length ? r.caChuyen.map((c, i) => '<a class="btn nho" href="' + e(c.link) + '" target="_blank" rel="noopener">' +
        (r.caChuyen.length > 1 ? 'Hành trình ' + c.tu + '–' + c.den : 'Mở cả hành trình') + ' trên Google Maps</a>').join('') : '') +
      (r.ok ? '<span class="nho">bấm ngày để xem riêng ngày đó</span>' : '<span class="nho">không tải được bản đồ — đang hiện sơ đồ vẽ tay</span>') +
      (r.chuaRo.length ? '<span class="nho" title="' + e(r.chuaRo.join('; ')) + '">· ' + r.chuaRo.length + ' mốc chưa rõ vị trí</span>' : '');
  }
}

/** Lịch trình dựng từ chính các dòng đang sửa — thêm dòng nào hiện ngay dòng đó. */
function htmlLichBk(ds, ht, chiDanhSach) {
  const song = ds.filter((h) => h.tinhTrang !== 'Huỷ');
  const nhom = new Map();
  for (const h of song) {
    const d = h.gioHen || h.ngay ? dauNgay(h.gioHen || h.ngay) : 0;
    const k = d + '|' + (h.gioHen || '') + '|' + tenGon(h.ten);
    if (!nhom.has(k)) nhom.set(k, { d, gio: h.gioHen, ten: tenGon(h.ten) || '(chưa đặt tên)', ds: [] });
    nhom.get(k).ds.push(h);
  }
  const ngay = [];
  if (ht.batDau) for (let t = dauNgay(ht.batDau); t <= dauNgay(ht.ketThuc || ht.batDau); t += NGAY_MS) ngay.push(t);
  for (const g of nhom.values()) if (g.d && !ngay.includes(g.d)) ngay.push(g.d);
  ngay.sort((a, b) => a - b);
  const moc = [...nhom.values()].sort((a, b) => (a.gio || a.d + 1) - (b.gio || b.d + 1));
  const veMoc = (g) => {
    const h = g.ds[0];
    const khachS = g.ds.map((x) => (x.soLuong ? x.soLuong + ' ' + String(x.loaiKhach || '').toLowerCase() : '')).filter(Boolean).join(' + ');
    const foc = g.ds.some((x) => x.xinFoc === 'Đã gửi đề xuất') ? nhanTT('chờ đối tác trả lời FOC', 'cam')
      : g.ds.some((x) => x.xinFoc === 'Chưa đề xuất' && x.hinhThuc === 'FOC đối tác') ? nhanTT('chưa gửi đề xuất FOC', 'cam')
      : g.ds.every((x) => x.hinhThuc === 'FOC đối tác' || x.loaiKhach === 'Em bé') ? nhanTT('FOC', 'xanh') : '';
    return '<div class="lbk-moc"><b>' + (g.gio ? hhmm(g.gio) : '--:--') + '</b><div><div>' + e(g.ten) + ' ' + foc + '</div><div class="nho">' +
      e([h.nhaCungCap, khachS].filter(Boolean).join(' · ')) + '</div></div></div>';
  };
  const chua = moc.filter((g) => !g.d);
  const mocBd = moc.filter((g) => g.d).map((g) => ({ ngay: g.d, gio: g.gio, ten: g.ten, h: g.ds[0] }));
  const dsHtml = ngay.map((d) => { const t = vn(d); const ds2 = moc.filter((g) => g.d === d);
      return '<div class="lbk-ngay"><div class="lbk-dau">' + THU[t.thu] + ', ' + p2(t.d) + '/' + p2(t.m) + '</div>' + (ds2.map(veMoc).join('') || '<div class="nho" style="padding:2px 0 6px">Trống</div>') + '</div>'; }).join('') +
    (chua.length ? '<div class="lbk-ngay"><div class="lbk-dau">Chưa xếp ngày</div>' + chua.map(veMoc).join('') + '</div>' : '');
  if (chiDanhSach) return dsHtml;
  return '<div class="the lbk"><div class="the-dau"><h2>Lịch trình</h2><span class="nho">' + (ngay.length ? ngay.length + ' ngày' : '') + '</span></div><div class="the-than">' +
    (moc.length ? htmlBanDo(mocBd, true) : '<div class="nho">Thêm dòng vào bảng kê, lịch trình hiện ở đây.</div>') +
    '<div id="bkLichDs">' + dsHtml + '</div></div></div>';
}

function veBangKe(than, ht) {
  const goc = S.dl.hangMuc.filter((h) => h.hopTac === ht.id).sort((a, b) => (a.ngay || 9e15) - (b.ngay || 9e15) || (a.gioHen || 0) - (b.gioHen || 0));
  S.sua = { ban: false, ds: goc.map((h) => ({ ...h })) };
  const tong = () => {
    const song = S.sua.ds.filter((k) => k.tinhTrang !== 'Huỷ');
    return { tt: song.reduce((s, h) => s + thanhTien(h), 0), qd: song.reduce((s, h) => s + quyDoi(h), 0),
      foc: song.filter((h) => h.hinhThuc === 'FOC đối tác').reduce((s, h) => s + quyDoi(h), 0) };
  };
  const veLai = () => {
    const ds = S.sua.ds;
    const t = tong();
    const choXin = [...new Set(ds.filter((h) => FOC_CHO.includes(h.xinFoc)).map((h) => h.nhaCungCap).filter(Boolean))];
    const chot = !!ht.chotLuc;
    than.innerHTML = '<div class="bk-luoi"><div style="min-width:0">' +
      (chot ? '<div class="bao xanh" style="display:flex;gap:10px;align-items:center"><b>Đã chốt ' + ddmm(ht.chotLuc) + ' ' + hhmm(ht.chotLuc) + '</b><span>Chi phí công ty ' + tien(t.tt) + 'đ · sẵn sàng trình BGĐ</span><div class="lon"></div><button class="btn nho" data-viec="moChot">Mở chốt để sửa</button></div>' : '') +
      '<div class="the' + (chot ? ' da-chot' : '') + '"><div class="the-dau"><h2>Bảng kê chi phí · ' + ds.filter((h) => h.tinhTrang !== 'Huỷ').length + ' dòng</h2><div class="lon"></div>' +
      '<button class="btn nho" id="bkFoc">Đề xuất hợp tác FOC' + (choXin.length ? ' · ' + choXin.length + ' đối tác' : '') + '</button>' +
      (chot ? '' : '<button class="btn chinh nho" id="bkSp">Lấy từ Base Sản phẩm</button><button class="btn nho" id="bkChon">Thêm từ danh mục</button><button class="btn nho" id="bkThem">Dòng tự nhập</button>' +
      '<button class="btn nho" id="bkLuu"' + (S.sua.ban ? '' : ' disabled') + '>Lưu bảng kê</button>' +
      '<button class="btn chinh nho" data-viec="chot"' + (ds.length ? '' : ' disabled') + '>Chốt bảng kê</button>') + '</div>' +
      '<div class="the-than khit cuon"><datalist id="dsDoiTac">' + dsDoiTac().map((x) => '<option value="' + e(x) + '">').join('') + '</datalist>' +
      '<table class="bang"><thead><tr><th>Ngày</th><th>Nhóm</th><th>Khoản mục</th><th title="Nơi cung cấp dịch vụ (Sun World, Vinpearl, nhà hàng…). Bắt buộc với dòng FOC — app gom theo đối tác để soạn email đề xuất">Đối tác</th><th>Loại khách</th>' +
      '<th class="so">SL</th><th class="so">Đêm/Lượt</th><th title="Ai trả tiền dòng này: Công ty chi = Rooty Trip trả · FOC đối tác = đối tác tài trợ, công ty 0đ · KOL tự trả = không tính vào chi phí">Hình thức</th><th title="Tiến độ xin tài trợ với đối tác: Chưa đề xuất → Đã gửi đề xuất → Đối tác đồng ý (FOC, 0đ) / Đối tác từ chối (chuyển về Công ty chi)">Hợp tác FOC</th><th class="so">Đơn giá chi</th><th class="so">Giá công bố</th>' +
      '<th class="so">Thành tiền</th><th>Giờ hẹn</th><th>Điểm hẹn</th><th title="Tích thì bot nhắn anh trước giờ hẹn (kèm tin soạn sẵn gửi KOL). Cần có Giờ hẹn">Bot nhắc</th><th title="Đánh dấu dòng còn nghi ngờ (giá, số khách…) — dòng tô vàng và đếm ở trang Hợp tác cho khỏi quên">Cần kiểm</th><th title="Diễn biến trong chuyến: Chờ = chưa tới · Đã xong = KOL đã dùng dịch vụ · Có sự cố = trục trặc, cần xử lý · Huỷ = bỏ, không tính tiền">Tình trạng</th><th></th></tr></thead><tbody>' +
      ds.map((h, i) => '<tr data-i="' + i + '" class="' + (h.kiemLai ? 'kiem' : '') + (h.tinhTrang === 'Huỷ' ? ' huy' : '') + '">' +
        '<td><input class="in-o" type="date" data-f="ngay" value="' + ngayIn(h.ngay) + '"></td>' +
        '<td><select class="in-o" data-f="nhom">' + opt(NHOM, h.nhom, true) + '</select></td>' +
        '<td><input class="in-o" data-f="ten" value="' + e(h.ten) + '" title="' + e((h.maDv ? '[' + h.maDv + '] ' : '') + (h.ghiChu || '')) + '"></td>' +
        '<td><input class="in-o' + (h.hinhThuc === 'FOC đối tác' && !h.nhaCungCap ? ' thieu' : '') + '" data-f="nhaCungCap" list="dsDoiTac" value="' + e(h.nhaCungCap) + '" placeholder="' + (h.hinhThuc === 'FOC đối tác' ? 'cần đối tác' : '—') + '"></td>' +
        '<td><select class="in-o" data-f="loaiKhach">' + opt(LOAI_KHACH, h.loaiKhach, true) + '</select></td>' +
        '<td><input class="in-o" type="number" min="0" data-f="soLuong" value="' + (h.soLuong ?? '') + '"></td>' +
        '<td><input class="in-o" type="number" min="0" data-f="demLuot" value="' + (h.demLuot ?? 1) + '"></td>' +
        '<td><select class="in-o" data-f="hinhThuc">' + opt(HINH_THUC, h.hinhThuc) + '</select></td>' +
        '<td><select class="in-o foc-' + (MAU_FOC[h.xinFoc] || '') + (h.hinhThuc !== 'FOC đối tác' && FOC_CHO.includes(h.xinFoc) ? ' lech' : '') + '" data-f="xinFoc" title="' +
          (h.hinhThuc !== 'FOC đối tác' && FOC_CHO.includes(h.xinFoc) ? 'Dòng Công ty chi mà vẫn đang xin FOC — chọn lại Hình thức hoặc đặt Không áp dụng' : '') + '">' + opt(XIN_FOC, h.xinFoc || 'Không áp dụng') + '</select></td>' +
        '<td><input class="in-o" type="number" min="0" step="1000" data-f="donGiaChi" value="' + (h.donGiaChi ?? '') + '"' + (h.hinhThuc === 'Công ty chi' ? '' : ' disabled') + '></td>' +
        '<td><input class="in-o" type="number" min="0" step="1000" data-f="giaCongBo" value="' + (h.giaCongBo ?? '') + '" placeholder="' + (h.hinhThuc === 'FOC đối tác' && h.loaiKhach !== 'Em bé' ? 'thiếu' : '') + '"></td>' +
        '<td class="so tt">' + (h.hinhThuc === 'Công ty chi' ? tien(thanhTien(h)) : '<span class="nho">' + (h.hinhThuc === 'FOC đối tác' ? 'FOC' : 'KOL trả') + '</span>') + '</td>' +
        '<td><input class="in-o" type="datetime-local" data-f="gioHen" value="' + gioIn(h.gioHen) + '"></td>' +
        '<td><input class="in-o" data-f="diemHen" value="' + e(h.diemHen) + '"></td>' +
        '<td style="text-align:center"><input type="checkbox" data-f="nhacHen"' + (h.nhacHen ? ' checked' : '') + '></td>' +
        '<td style="text-align:center"><input type="checkbox" data-f="kiemLai"' + (h.kiemLai ? ' checked' : '') + '></td>' +
        '<td><select class="in-o" data-f="tinhTrang">' + opt(TT_HM, h.tinhTrang || 'Chờ') + '</select></td>' +
        '<td><button class="nut-x" data-xoa="' + i + '" title="Xoá dòng">×</button></td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="11">Chi phí công ty</td><td class="so" id="bkTong">' + tien(t.tt) + '</td><td colspan="6"><span class="nho" id="bkQd">' + chuQd(t.foc, t.qd) + '</span></td></tr></tfoot></table></div></div>' +
      (goc.some((h) => h.ghiChu) ? '<div class="the"><div class="the-dau"><h2>Ghi chú dòng</h2></div><div class="the-than">' + goc.filter((h) => h.ghiChu).map((h) =>
        '<div style="margin-bottom:6px"><b>' + e(h.ten) + ':</b> <span class="nho">' + e(h.ghiChu) + '</span></div>').join('') + '</div></div>' : '') +
      '</div><div id="bkLich">' + htmlLichBk(ds, ht) + '</div></div>';
    setTimeout(() => ganBanDo(than), 0);
    /* Đã chốt: khoá mọi ô, chỉ còn xem (mở chốt ở băng phía trên). */
    if (chot) { $$('.da-chot input, .da-chot select, .da-chot .nut-x', than).forEach((x) => { x.disabled = true; }); $('#bkLich').innerHTML = htmlLichBk(ds, ht); }
    if (chot) { $('#bkFoc').onclick = () => moXinFoc(ht); return; }
    $('#bkThem').onclick = () => { ds.push({ ten: '', nhom: 'Khác', ngay: ht.batDau || 0, loaiKhach: 'Người lớn', soLuong: ht.nguoiLon || 1, demLuot: 1, hinhThuc: 'Công ty chi', xinFoc: 'Không áp dụng', tinhTrang: 'Chờ', nguonDv: 'Nhập tay' }); S.sua.ban = true; veLai(); };
    $('#bkChon').onclick = () => moChonDichVu(ht, (moi) => { ds.push(...moi); S.sua.ban = true; veLai(); });
    $('#bkSp').onclick = () => moChonSanPham(ht, (moi) => { ds.push(...moi); S.sua.ban = true; veLai(); });
    $('#bkFoc').onclick = () => moXinFoc(ht);
    $('#bkLuu').onclick = async () => {
      $('#bkLuu').disabled = true;
      try {
        await api('/api/hop-tac/' + ht.id + '/hang-muc', { ds: ds.map(choGhiHm) });
        S.sua = null; await nap(true); toast('Đã lưu bảng kê'); ve();
      } catch (err) { toast(err.message, true); $('#bkLuu').disabled = false; }
    };
  };
  than.oninput = than.onchange = (ev) => {
    if (!S.sua) return;   // bảng đã lưu + vẽ lại: sự kiện change muộn của ô vừa mất focus thì bỏ
    const tr = ev.target.closest('tr[data-i]');
    const f = ev.target.dataset.f;
    if (!tr || !f) return;
    const h = S.sua.ds[+tr.dataset.i];
    const x = ev.target;
    h[f] = x.type === 'checkbox' ? x.checked : x.type === 'number' ? (x.value === '' ? null : Number(x.value)) :
      x.type === 'date' ? tuChuoi(x.value) : x.type === 'datetime-local' ? tuChuoi(x.value) : x.value;
    if (f === 'gioHen' && h.gioHen) h.ngay = dauNgay(h.gioHen);
    if (f === 'hinhThuc' && h.hinhThuc !== 'Công ty chi') h.donGiaChi = 0;
    /* Hai cột Hình thức và Hợp tác FOC phải khớp nhau (anh Hùng 24/09 thấy dòng "Công ty chi" mà "Chưa đề xuất"):
     *  chọn FOC đối tác → bắt đầu quy trình xin (Chưa đề xuất) · chọn Công ty chi / KOL tự trả → thôi xin (Không áp dụng)
     *  chọn Chưa đề xuất / Đã gửi → dòng đó là FOC đối tác · Đồng ý / Từ chối → theoFoc() lo */
    if (f === 'hinhThuc') {
      if (h.hinhThuc === 'FOC đối tác' && (!h.xinFoc || h.xinFoc === 'Không áp dụng')) h.xinFoc = 'Chưa đề xuất';
      if (h.hinhThuc !== 'FOC đối tác' && FOC_CHO.includes(h.xinFoc)) h.xinFoc = 'Không áp dụng';
    }
    if (f === 'xinFoc' && FOC_CHO.includes(h.xinFoc)) { h.hinhThuc = 'FOC đối tác'; h.donGiaChi = 0; }
    if (f === 'xinFoc') Object.assign(h, theoFoc(h.xinFoc));
    /* Gõ tên đối tác cho một dòng FOC → đánh dấu chưa đề xuất để nhớ gửi thư. */
    if (f === 'nhaCungCap' && ev.type === 'change' && h.nhaCungCap && (!h.xinFoc || h.xinFoc === 'Không áp dụng') && h.hinhThuc === 'FOC đối tác') h.xinFoc = 'Chưa đề xuất';
    S.sua.ban = true;
    /* Ô gõ (chữ, số) KHÔNG vẽ lại cả bảng — mất con trỏ và nuốt cú bấm sang ô kế.
     * Chỉ cập nhật ô Thành tiền + dòng tổng + cột lịch trình. Chọn / tích / ngày thì vẽ lại được. */
    if (ev.type === 'change' && (x.tagName === 'SELECT' || x.type === 'checkbox' || x.type === 'date' || x.type === 'datetime-local')) return veLai();
    const td = $('td.tt', tr);
    if (td && h.hinhThuc === 'Công ty chi') td.textContent = tien(thanhTien(h));
    const t = tong();
    $('#bkTong').textContent = tien(t.tt);
    $('#bkQd').textContent = chuQd(t.foc, t.qd);
    if ($('#bkLichDs')) $('#bkLichDs').innerHTML = htmlLichBk(S.sua.ds, ht, true);
    $('#bkLuu').disabled = false;
  };
  than.onclick = async (ev) => {
    if (!S.sua) return;
    const x = ev.target.closest('[data-xoa]');
    if (!x) return;
    const h = S.sua.ds[+x.dataset.xoa];
    if (h.id && !(await hoi({ tieuDe: 'Xoá dòng', noiDung: '"' + (h.ten || '') + '" sẽ bị xoá khỏi Base khi bấm Lưu bảng kê.', nut: 'Xoá dòng', nguy: true }))) return;
    S.sua.ds.splice(+x.dataset.xoa, 1); S.sua.ban = true; veLai();
  };
  veLai();
}
const chuQd = (foc, qd) => 'FOC quy đổi ' + tien(foc) + ' · tổng quy đổi ' + tien(qd);
function choGhiHm(h) {
  const o = {};
  ['id', 'ten', 'nhom', 'ngay', 'gioHen', 'diemHen', 'nguonDv', 'maDv', 'dichVu', 'loaiKhach', 'soLuong', 'demLuot', 'hinhThuc', 'donGiaChi', 'giaCongBo',
    'vat', 'nhaCungCap', 'tinhTrang', 'nhacHen', 'tinNhan', 'kiemLai', 'ghiChu', 'xinFoc', 'tourwellId'].forEach((k) => { if (h[k] !== undefined) o[k] = h[k]; });
  if (o.ngay === 0) o.ngay = null;
  if (o.gioHen === 0) o.gioHen = null;
  return o;
}

/** Danh sách đối tác của chuyến + trạng thái hợp tác FOC, mỗi đối tác một nút soạn thư. */
async function moXinFoc(ht) {
  if (S.sua && S.sua.ban) {
    if (!(await hoi({ tieuDe: 'Lưu bảng kê trước', noiDung: 'Thư đề xuất lấy dữ liệu đã lưu. Bấm Lưu bảng kê rồi mở lại.', nut: 'Đã hiểu' }))) return;
    return;
  }
  const hm = S.dl.hangMuc.filter((h) => h.hopTac === ht.id && h.tinhTrang !== 'Huỷ');
  const dt = [...new Set(hm.map((h) => h.nhaCungCap).filter(Boolean))];
  const hop = moModal('Đề xuất hợp tác FOC', dt.length ? '<table class="bang"><thead><tr><th>Đối tác</th><th>Dịch vụ</th><th>Trạng thái</th><th>Email</th><th></th></tr></thead><tbody>' +
    dt.map((ten) => {
      const ds = hm.filter((h) => h.nhaCungCap === ten);
      const tt = [...new Set(ds.map((h) => h.xinFoc || 'Không áp dụng'))];
      const d = S.dl.doiTac.find((x) => x.ten.toLowerCase() === ten.toLowerCase());
      return '<tr><td><b>' + e(ten) + '</b></td><td>' + e([...new Set(ds.map((h) => tenGon(h.ten)))].join('; ')) + '</td><td>' + tt.map((x) => nhanTT(x, MAU_FOC[x])).join(' ') +
        (ds[0].xinFocLuc ? '<div class="nho">gửi ' + ddmm(ds[0].xinFocLuc) + '</div>' : '') + '</td><td class="nho">' + e((d && d.email) || 'chưa có') + '</td>' +
        '<td><button class="btn nho chinh" data-dt="' + e(ten) + '">Soạn email</button></td></tr>';
    }).join('') + '</tbody></table><div class="nho" style="margin-top:10px">Đối tác phản hồi xong thì đổi cột Hợp tác FOC trong bảng kê sang "Đối tác đồng ý" / "Đối tác từ chối" — hình thức chi tự đổi theo.</div>'
    : '<div class="bao cam">Chưa dòng nào có tên đối tác. Điền cột Đối tác (Sun World, Vinpearl, nhà hàng…) trong bảng kê trước.</div>', '', true);
  hop.onclick = (ev) => { const b = ev.target.closest('[data-dt]'); if (b) moEmail(ht, 'xin-foc', b.dataset.dt); };
}

const khongDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const gon = (s) => khongDau(s).replace(/[^a-z0-9]/g, '');
const DM = { twSp: null, twNcc: null };
async function napTw(loai) {
  if (DM[loai]) return DM[loai];
  const r = await api(loai === 'twSp' ? '/api/tourwell/san-pham' : '/api/tourwell/ncc');
  if (r.loi) throw new Error(r.loi);
  DM[loai] = r.ds;
  return r.ds;
}
/* Giá công bố của sản phẩm Tourwell: Tourwell không giữ giá bán, nên tìm cùng tên bên Base Sản phẩm. */
function giaRooty(ten) {
  const g = gon(ten);
  if (!g || !S.sp) return null;
  return S.sp.find((s) => { const k = gon(s.ten); return k.length > 6 && (g.includes(k) || k.includes(g)); }) || null;
}

/**
 * Thêm dòng bảng kê — anh Hùng 23/09: "lấy từ Tourwell về sẽ khớp hơn là tự nhập".
 * Bốn nguồn, Tourwell đứng trước: sản phẩm Tourwell · nhà cung cấp Tourwell (kèm bảng giá net) ·
 * bảng giá Rooty (Base Sản phẩm, có giá công bố) · dịch vụ tự khai.
 */
/* Lấy nhiều dòng một lượt từ Base Sản phẩm (anh Hùng 24/09: bảng kê thường dựng từ tour đang có,
 * phát sinh mới tự thêm tay). Trình bày như bảng kê: tick sản phẩm, mỗi dòng chỉnh ngày · giờ ·
 * số NL/TE · hình thức · đơn giá chi, bấm Thêm là ra đủ dòng NL/TE vào bảng kê (qua taoDong). */
async function moChonSanPham(ht, xong) {
  const ngayChuyen = [];
  if (ht.batDau) for (let t = dauNgay(ht.batDau); t <= dauNgay(ht.ketThuc || ht.batDau); t += NGAY_MS) ngayChuyen.push(t);
  const chon = new Map();   // id sản phẩm → {ngay, gio, nl, te, hinhThuc, dgNL, dgTE, dt}
  moModal('Lấy từ Base Sản phẩm', '<div class="luoi-form" style="margin-bottom:10px;grid-template-columns:minmax(0,1fr) auto">' +
    '<label><input class="in-o" id="csTim" placeholder="Tìm theo mã hoặc tên (VD: G4, land 5, vinwonders)"></label>' +
    '<label style="justify-content:flex-end"><span><input type="checkbox" id="csNhac" checked> Bật nhắc hẹn cho dòng có giờ</span></label></div>' +
    '<div class="cuon" id="csBang" style="max-height:56vh"><div class="bao">Đang đọc Base Sản phẩm…</div></div>',
    '<span class="nho" id="csDem" style="margin-right:auto">Chưa chọn sản phẩm nào</span><button class="btn" id="csHuy">Huỷ</button><button class="btn chinh" id="csThem" disabled>Thêm vào bảng kê</button>', true);
  let sp = [];
  try { sp = await napSp(); } catch (err) { $('#csBang').innerHTML = '<div class="bao cam">' + e(err.message) + '</div>'; return; }
  const macDinh = (s) => {
    const dt = doiTacTheoMa(s.ma, s.ten);
    return { ngay: ngayChuyen[0] || 0, gio: '', nl: ht.nguoiLon || 1, te: ht.treEm || 0, hinhThuc: dt ? 'FOC đối tác' : 'Công ty chi', dgNL: null, dgTE: null, dt };
  };
  const optNgay = (v) => (ngayChuyen.length ? ngayChuyen : [v || 0]).map((t) => '<option value="' + t + '"' + (t === v ? ' selected' : '') + '>' +
    (t ? THU[vn(t).thu] + ' ' + ddmm(t) : 'chưa có ngày') + '</option>').join('');
  const ve = () => {
    const tu = khongDau($('#csTim').value).split(/[^a-z0-9]+/).filter(Boolean);
    const khop = (s) => { const g = gon(s.ma + ' ' + s.ten); return tu.every((w) => g.includes(w)); };
    /* dòng đang chọn luôn còn trên bảng (dù ô tìm đã đổi), gom theo nhóm sản phẩm */
    const ds = sp.filter((s) => chon.has(s.id) || !tu.length || khop(s));
    const nhom = [...new Set(ds.map((s) => s.nhom || 'Khác'))];
    const hang = (s) => {
      const c = chon.get(s.id);
      const o = c || macDinh(s);
      const dis = c ? '' : ' disabled';
      return '<tr data-id="' + s.id + '" class="' + (c ? 'cs-chon' : '') + '"><td style="text-align:center"><input type="checkbox" data-cs="chon"' + (c ? ' checked' : '') + '></td>' +
        '<td><code>' + e(s.ma) + '</code></td><td class="w-ten">' + e(s.ten) + (o.dt ? ' <span class="nhan-tt xanh">' + e(o.dt) + '</span>' : '') + '</td>' +
        '<td class="so nho">' + (s.giaNL ? tien(s.giaNL) : '') + (s.giaTE ? '<br>' + tien(s.giaTE) : '') + '</td>' +
        '<td><select class="in-o" data-cs="ngay"' + dis + '>' + optNgay(o.ngay) + '</select></td>' +
        '<td><input class="in-o" type="time" data-cs="gio" value="' + e(o.gio) + '"' + dis + '></td>' +
        '<td><input class="in-o" type="number" min="0" data-cs="nl" value="' + o.nl + '"' + dis + ' style="width:58px"></td>' +
        '<td><input class="in-o" type="number" min="0" data-cs="te" value="' + o.te + '"' + dis + ' style="width:58px"></td>' +
        '<td><select class="in-o" data-cs="hinhThuc"' + dis + '>' + opt(HINH_THUC, o.hinhThuc) + '</select></td>' +
        '<td><input class="in-o" type="number" min="0" step="1000" data-cs="dgNL" value="' + (o.dgNL ?? '') + '" placeholder="' + (s.giaNL ? tien(s.giaNL) : 'NL') + '"' + (c && o.hinhThuc === 'Công ty chi' ? '' : ' disabled') + ' style="width:96px"></td>' +
        '<td><input class="in-o" type="number" min="0" step="1000" data-cs="dgTE" value="' + (o.dgTE ?? '') + '" placeholder="' + (s.giaTE ? tien(s.giaTE) : 'TE') + '"' + (c && o.hinhThuc === 'Công ty chi' && o.te ? '' : ' disabled') + ' style="width:96px"></td></tr>';
    };
    $('#csBang').innerHTML = ds.length ? '<table class="bang"><thead><tr><th></th><th>Mã</th><th class="w-ten">Sản phẩm</th><th class="so">Giá công bố<br>NL / TE</th><th>Ngày</th><th>Giờ hẹn</th>' +
      '<th>NL</th><th>TE</th><th>Hình thức</th><th>Đơn giá chi NL</th><th>Đơn giá chi TE</th></tr></thead><tbody>' +
      nhom.map((n) => '<tr class="cs-nhom"><td colspan="11">' + e(n) + '</td></tr>' + ds.filter((s) => (s.nhom || 'Khác') === n).sort((a, b) => chon.has(b.id) - chon.has(a.id)).map(hang).join('')).join('') +
      '</tbody></table>' : '<div class="bao">Không thấy sản phẩm khớp.</div>';
    const n = chon.size;
    $('#csDem').textContent = n ? 'Đã chọn ' + n + ' sản phẩm → ' + [...chon.values()].reduce((t, c) => t + (c.nl ? 1 : 0) + (c.te ? 1 : 0), 0) + ' dòng bảng kê' : 'Chưa chọn sản phẩm nào';
    $('#csThem').disabled = !n;
  };
  ve();
  $('#csTim').oninput = ve;
  $('#csBang').onchange = (ev) => {
    const tr = ev.target.closest('tr[data-id]'); const f = ev.target.dataset.cs;
    if (!tr || !f) return;
    const s = sp.find((x) => x.id === tr.dataset.id);
    if (f === 'chon') { if (ev.target.checked) chon.set(s.id, macDinh(s)); else chon.delete(s.id); return ve(); }
    const c = chon.get(s.id); if (!c) return;
    const v = ev.target.value;
    c[f] = f === 'ngay' ? +v : f === 'nl' || f === 'te' ? Math.max(0, +v || 0) : f === 'dgNL' || f === 'dgTE' ? (v === '' ? null : +v) : v;
    if (f === 'hinhThuc' || f === 'te' || f === 'nl') ve();
  };
  $('#csHuy').onclick = () => dongModal();
  $('#csThem').onclick = () => {
    const nhac = $('#csNhac').checked;
    const dong = [];
    for (const [id, c] of chon) {
      const s = sp.find((x) => x.id === id);
      const gio = c.gio && c.ngay ? tuChuoi(ngayIn(c.ngay) + 'T' + c.gio) : 0;
      if (!c.nl && !c.te) continue;
      const ds = taoDong({ ...ht, nguoiLon: c.nl, treEm: c.te, emBe: 0 }, { nguon: 'sp', s }, c.ngay, gio, nhac && !!gio)
        .filter((d) => (d.loaiKhach === 'Người lớn' ? c.nl : c.te) > 0);
      for (const d of ds) {
        if (c.hinhThuc !== 'FOC đối tác') { d.hinhThuc = c.hinhThuc; d.xinFoc = 'Không áp dụng'; d.donGiaChi = c.hinhThuc === 'Công ty chi' ? (d.loaiKhach === 'Trẻ em' ? c.dgTE : c.dgNL) : 0; }
        else { d.hinhThuc = 'FOC đối tác'; d.donGiaChi = 0; d.xinFoc = 'Chưa đề xuất'; }
        dong.push(d);
      }
    }
    xong(dong);
    toast('Đã thêm ' + dong.length + ' dòng từ Base Sản phẩm — nhớ bấm Lưu bảng kê');
    dongModal();
  };
}

async function moChonDichVu(ht, xong) {
  const NGUON = [['twSp', 'Sản phẩm Tourwell'], ['twNcc', 'Nhà cung cấp Tourwell'], ['rooty', 'Bảng giá Rooty'], ['tuKhai', 'Dịch vụ tự khai']];
  let nguon = 'twSp';
  let nccChon = null;
  const hop = moModal('Thêm từ danh mục', '<div class="pills" id="cdNguon" style="display:inline-flex;margin-bottom:10px">' +
    NGUON.map(([k, t]) => '<button class="pill' + (k === nguon ? ' on' : '') + '" data-ng="' + k + '">' + t + '</button>').join('') + '</div>' +
    '<div class="luoi-form" style="margin-bottom:10px"><label>Ngày dùng<input class="in-o" type="date" id="cdNgay" value="' + ngayIn(ht.batDau) + '"></label>' +
    '<label>Giờ hẹn<input class="in-o" type="time" id="cdGio"></label><label style="justify-content:flex-end"><span><input type="checkbox" id="cdNhac" checked> Bật nhắc hẹn</span></label>' +
    '<label class="rong"><input class="in-o" id="cdTim" placeholder="Tìm theo tên hoặc mã"></label></div><div class="chon-dv" id="cdDs"></div>', '', true);
  napSp().catch(() => {});
  const lay = () => ({ ngay: tuChuoi($('#cdNgay').value) || 0, gio: $('#cdGio').value ? tuChuoi($('#cdNgay').value + 'T' + $('#cdGio').value) : 0 });
  const them = (dong, ten) => {
    const { gio } = lay();
    const nhac = $('#cdNhac').checked && !!gio;
    xong(dong.map((d) => ({ ...d, nhacHen: nhac })));
    toast('Đã thêm ' + ten + ' — nhớ bấm Lưu bảng kê');
    dongModal();
  };
  const dongTheoKhach = (ht2, nen, gia) => cacLoai(ht2).map(([loai, sl, k]) => ({ ...nen, ten: nen.ten + ' — ' + loai, loaiKhach: loai, soLuong: sl, ...gia(k) }));

  const veDs = async () => {
    /* Tìm theo từng từ: 'vinwonders set menu' khớp 'Vé vào cửa VinWonders … + Set Menu 800K'. */
    const tu = khongDau($('#cdTim').value).split(/[^a-z0-9]+/).filter(Boolean);
    const q = tu.length > 0;
    const khop = (s) => { const g = gon(s); return tu.every((w) => g.includes(w)); };
    const ds = $('#cdDs');
    const nut = (i, ma, ten, phu, gia) => '<button data-m="' + i + '"><code>' + e(ma) + '</code><span>' + e(ten) + (phu ? ' <span class="nho">· ' + e(phu) + '</span>' : '') +
      '</span><span class="gia">' + (gia || '') + '</span></button>';
    try {
      if (nguon === 'twSp') {
        ds.innerHTML = '<div class="bao">Đang đọc sản phẩm Tourwell…</div>';
        const sp = await napTw('twSp');
        const loc = sp.filter((x) => !q || khop(x.ma + ' ' + x.ten)).slice(0, 100);
        ds.innerHTML = loc.map((x) => { const r = giaRooty(x.ten); return nut(sp.indexOf(x), x.ma, x.ten, x.loai, r && r.giaNL ? 'công bố ' + tien(r.giaNL) : ''); }).join('') || '<div class="bao">Không thấy sản phẩm.</div>';
        ds.onclick = (ev) => {
          const b = ev.target.closest('[data-m]'); if (!b) return;
          const x = sp[+b.dataset.m]; const r = giaRooty(x.ten); const { ngay, gio } = lay();
          const dt = doiTacTheoMa(x.ma, x.ten);
          const nen = { ten: x.ten, ngay, gioHen: gio || null, tinhTrang: 'Chờ', demLuot: 1, nhom: x.nhom, nguonDv: 'Tourwell', maDv: x.ma, tourwellId: 'sp:' + x.id,
            nhaCungCap: dt, xinFoc: dt ? 'Chưa đề xuất' : 'Không áp dụng', hinhThuc: dt ? 'FOC đối tác' : 'Công ty chi' };
          if (x.nhom === 'Di chuyển') return them([{ ...nen, loaiKhach: 'Xe/Chuyến', soLuong: 1, donGiaChi: dt ? 0 : null, giaCongBo: null }], x.ten);
          them(dongTheoKhach(ht, nen, (k) => ({ donGiaChi: dt || k === 'EB' ? 0 : null, giaCongBo: k === 'EB' ? 0 : r ? (k === 'NL' ? r.giaNL : r.giaTE) : null })), x.ten);
        };
      } else if (nguon === 'twNcc' && !nccChon) {
        ds.innerHTML = '<div class="bao">Đang đọc nhà cung cấp Tourwell (lần đầu mất khoảng 20 giây)…</div>';
        const ncc = await napTw('twNcc');
        const loc = ncc.filter((x) => !q || khop(x.ten + ' ' + x.ma)).slice(0, 100);
        ds.innerHTML = loc.map((x) => nut(ncc.indexOf(x), x.loai || 'NCC', x.ten, x.diaChi, '')).join('') || '<div class="bao">Không thấy nhà cung cấp.</div>';
        ds.onclick = (ev) => { const b = ev.target.closest('[data-m]'); if (!b) return; nccChon = ncc[+b.dataset.m]; $('#cdTim').value = ''; veDs(); };
      } else if (nguon === 'twNcc') {
        const x = nccChon;
        ds.innerHTML = '<div class="bao">Đang đọc bảng giá ' + e(x.ten) + '…</div>';
        const dv = (await api('/api/tourwell/ncc/' + x.id)).ds;
        const nhom = [...new Set(dv.map((d) => d.nhom))];
        const loaiKhachCua = (ten) => (/trẻ em|tre em|child/i.test(ten) ? 'Trẻ em' : /em bé|em be|infant|baby/i.test(ten) ? 'Em bé' : /người lớn|nguoi lon|adult/i.test(ten) ? 'Người lớn' : '');
        const dongDv = (d) => {
          const { ngay, gio } = lay();
          const lk = loaiKhachCua(d.ten);
          const phong = d.loai === 'room' || x.nhom === 'Lưu trú';
          const dem = phong && ht.batDau && ht.ketThuc ? Math.max(1, Math.round((dauNgay(ht.ketThuc) - dauNgay(ngay || ht.batDau)) / NGAY_MS)) : 1;
          const loai = lk || (phong ? 'Phòng' : x.nhom === 'Di chuyển' ? 'Xe/Chuyến' : 'Người lớn');
          return { ten: x.ten + (d.nhom ? ' · ' + d.nhom : '') + (lk ? ' — ' + lk : d.ten && !phong ? ' · ' + d.ten : ''), ngay, gioHen: gio || null, tinhTrang: 'Chờ',
            nhom: x.nhom, nguonDv: 'Tourwell', tourwellId: 'ncc:' + x.id + ':' + d.id, nhaCungCap: x.ten, loaiKhach: loai,
            soLuong: lk ? slGoi(lk, ht) : phong || loai === 'Xe/Chuyến' ? 1 : (ht.nguoiLon || 1), demLuot: dem,
            hinhThuc: 'Công ty chi', xinFoc: 'Không áp dụng', donGiaChi: d.gia || null, giaCongBo: d.giaBan && d.giaBan !== d.gia ? d.giaBan : null,
            ghiChu: d.moTa ? d.moTa.replace(/\n/g, ', ') : '' };
        };
        ds.innerHTML = '<div class="bao" style="margin:0;border-radius:0;display:flex;gap:8px;align-items:center"><button class="btn nho" id="cdLui">‹ Nhà cung cấp khác</button><b>' + e(x.ten) + '</b><span class="nho">' + e(x.loai) + '</span></div>' +
          (dv.length ? nhom.map((g) => '<div class="lbk-dau" style="padding:8px 12px 2px">' + e(g || 'Dịch vụ') + (dv.filter((d) => d.nhom === g).length > 1 ? ' <button class="btn nho" data-nhom="' + e(g) + '" style="margin-left:6px">Thêm cả nhóm</button>' : '') + '</div>' +
            dv.filter((d) => d.nhom === g).map((d) => nut(dv.indexOf(d), d.loai === 'room' ? 'Phòng' : 'Dịch vụ', d.ten, d.hieuLuc, d.gia ? 'net ' + tien(d.gia) : 'chưa có giá')).join('')).join('')
            : '<div class="bao">' + e(x.ten) + ' chưa có bảng giá trên Tourwell.</div>') +
          '<button data-tu="1"><code>Tự nhập</code><span>Thêm ' + e(x.ten) + ' làm một dòng, điền giá sau</span><span></span></button>';
        $('#cdLui').onclick = (ev) => { ev.stopPropagation(); nccChon = null; veDs(); };
        ds.onclick = (ev) => {
          const g = ev.target.closest('[data-nhom]');
          if (g) return them(dv.filter((d) => d.nhom === g.dataset.nhom).map(dongDv), x.ten + ' · ' + g.dataset.nhom);
          const b = ev.target.closest('[data-m]');
          if (b) return them([dongDv(dv[+b.dataset.m])], x.ten);
          if (ev.target.closest('[data-tu]')) return them([dongDv({ id: 0, ten: '', nhom: '', gia: 0, loai: x.nhom === 'Lưu trú' ? 'room' : '' })].map((d) => ({ ...d, donGiaChi: null })), x.ten);
        };
      } else if (nguon === 'rooty') {
        ds.innerHTML = '<div class="bao">Đang đọc Base Sản phẩm…</div>';
        const sp = await napSp();
        const loc = sp.filter((m) => !q || khop(m.ma + ' ' + m.ten)).slice(0, 100);
        ds.innerHTML = loc.map((s) => nut(sp.indexOf(s), s.ma, s.ten, s.nhom, s.giaNL ? tien(s.giaNL) + (s.giaTE ? ' / ' + tien(s.giaTE) : '') : '')).join('') || '<div class="bao">Không thấy.</div>';
        ds.onclick = (ev) => { const b = ev.target.closest('[data-m]'); if (!b) return; const s = sp[+b.dataset.m]; const { ngay, gio } = lay(); them(taoDong(ht, { nguon: 'sp', s }, ngay, gio, false), s.ten); };
      } else {
        const dv = S.dl.dichVu.filter((d) => d.dangDung !== false);
        const loc = dv.filter((d) => !q || khop(d.ten + ' ' + d.nhaCungCap));
        ds.innerHTML = loc.map((d) => nut(dv.indexOf(d), d.loai || 'Dịch vụ', d.ten, d.nhaCungCap, d.cbNL ? tien(d.cbNL) : d.netNL ? 'net ' + tien(d.netNL) : '')).join('') ||
          '<div class="bao">Chưa có dịch vụ tự khai. Thêm ở tab Đối tác.</div>';
        ds.onclick = (ev) => { const b = ev.target.closest('[data-m]'); if (!b) return; const d = dv[+b.dataset.m]; const { ngay, gio } = lay(); them(taoDong(ht, { nguon: 'dv', d }, ngay, gio, false), d.ten); };
      }
    } catch (err) { ds.innerHTML = '<div class="bao cam">' + e(err.message) + '</div>'; }
  };
  $('#cdNguon').onclick = (ev) => {
    const b = ev.target.closest('[data-ng]'); if (!b) return;
    nguon = b.dataset.ng; nccChon = null;
    $$('#cdNguon .pill').forEach((x) => x.classList.toggle('on', x === b));
    veDs();
  };
  let hen = 0;
  $('#cdTim').oninput = () => { clearTimeout(hen); hen = setTimeout(veDs, 150); };
  veDs(); $('#cdTim').focus();
  void hop;
}
const slGoi = (lk, ht) => (lk === 'Trẻ em' ? ht.treEm || 0 : lk === 'Em bé' ? ht.emBe || 0 : ht.nguoiLon || 1);

/* Mã sản phẩm của Sun / Vin → đối tác cho FOC. Tour ghép của chính Rooty Trip thì không có đối tác. */
function doiTacTheoMa(ma, ten) {
  if (/^SUN-/i.test(ma) || /hòn thơm|sun world|sun paradise/i.test(ten || '')) return 'Sun World';
  if (/^VIN-|_VIN$/i.test(ma) || /vinwonders|vinpearl|safari|grand world/i.test(ten || '')) return 'Vinpearl';
  return '';
}
/** Một mục danh mục → các dòng bảng kê, tách theo loại khách của chuyến. */
function taoDong(ht, m, ngay, gio, nhac) {
  const chung = { ngay, gioHen: gio || null, nhacHen: nhac, tinhTrang: 'Chờ', demLuot: 1 };
  if (m.nguon === 'dv') {
    const d = m.d;
    const foc = !!d.focThuong;
    const nen = { ...chung, nhom: d.loai === 'Tour' ? 'Tour' : (d.loai || 'Khác'), nguonDv: 'Dịch vụ đối tác', dichVu: d.id, nhaCungCap: d.nhaCungCap || '',
      hinhThuc: foc ? 'FOC đối tác' : 'Công ty chi', xinFoc: foc ? 'Chưa đề xuất' : 'Không áp dụng' };
    if (d.loai === 'Lưu trú' || d.donVi === 'Phòng/đêm') {
      const dem = ht.batDau && ht.ketThuc ? Math.max(1, Math.round((dauNgay(ht.ketThuc) - dauNgay(ngay || ht.batDau)) / NGAY_MS)) : 1;
      return [{ ...nen, ten: d.ten, loaiKhach: 'Phòng', soLuong: 1, demLuot: dem, donGiaChi: foc ? 0 : d.netNL, giaCongBo: d.cbNL }];
    }
    return cacLoai(ht).map(([loai, sl, k]) => ({ ...nen, ten: d.ten + ' — ' + loai, loaiKhach: loai, soLuong: sl,
      donGiaChi: foc || k === 'EB' ? 0 : d['net' + k], giaCongBo: k === 'EB' ? (d.cbEB || 0) : d['cb' + k] }));
  }
  const s = m.s;
  const nhom = /lẻ/i.test(s.nhom) ? 'Vé tham quan' : 'Tour';
  const dt = doiTacTheoMa(s.ma, s.ten);
  /* Dịch vụ của Sun / Vin: mặc định dự kiến hợp tác FOC. Đối tác từ chối thì dòng tự về Công ty chi. */
  return cacLoai(ht).map(([loai, sl, k]) => ({ ...chung, ten: s.ten + ' — ' + loai, nhom, nguonDv: 'Base Sản phẩm', maDv: s.ma, loaiKhach: loai, soLuong: sl,
    nhaCungCap: dt, xinFoc: dt ? 'Chưa đề xuất' : 'Không áp dụng', hinhThuc: dt ? 'FOC đối tác' : 'Công ty chi',
    donGiaChi: dt || k === 'EB' ? 0 : null, giaCongBo: k === 'EB' ? 0 : (k === 'NL' ? s.giaNL : s.giaTE) }));
}
function cacLoai(ht) {
  const ds = [];
  if (ht.nguoiLon) ds.push(['Người lớn', ht.nguoiLon, 'NL']);
  if (ht.treEm) ds.push(['Trẻ em', ht.treEm, 'TE']);
  if (ht.emBe) ds.push(['Em bé', ht.emBe, 'EB']);
  return ds.length ? ds : [['Người lớn', 1, 'NL']];
}

/* ---------------- Bàn giao (của một chuyến) ---------------- */
function veBanGiaoHt(than, ht) {
  const goc = S.dl.banGiao.filter((b) => b.hopTac === ht.id);
  /* Kênh đăng chọn thẳng từ các kênh đã khai của KOL — không gõ lại. */
  const kenh = S.dl.kenh.filter((k) => k.kol === ht.kol);
  S.sua = { ban: false, ds: goc.map((b) => ({ ...b, kenhDang: [...(b.kenhDang || [])] })) };
  const veLai = () => {
    const ds = S.sua.ds;
    const dang = ds.map((b, i) => [b, i]).filter(([b]) => b.trangThai === 'Đã đăng');
    const doiTacBg = [...new Set(goc.map((b) => String(b.traDoiTac || '').trim()).filter(Boolean))];
    than.innerHTML = '<div class="the"><div class="the-dau"><h2>Sản phẩm KOL cam kết</h2><div class="lon"></div>' +
      doiTacBg.map((d) => '<button class="btn nho" data-bcdt="' + e(d) + '">Báo cáo cho ' + e(d) + '</button>').join('') +
      '<button class="btn nho" id="bgThem">Thêm sản phẩm</button>' +
      '<button class="btn chinh nho" id="bgLuu"' + (S.sua.ban ? '' : ' disabled') + '>Lưu</button></div>' +
      (kenh.length ? '' : '<div class="the-than"><div class="bao cam" style="margin:0">KOL này chưa khai kênh nào — mở tab Thông tin → Sửa KOL để thêm, rồi chọn kênh đăng ở đây.</div></div>') +
      '<div class="the-than khit cuon"><datalist id="dsDtBg">' + dsDoiTac().map((x) => '<option value="' + e(x) + '">').join('') + '</datalist><table class="bang"><thead><tr>' +
      '<th>Chủ đề</th><th>Sản phẩm</th><th>Loại</th><th>Kênh đăng</th><th class="so">SL</th><th>Trả cho đối tác</th><th>Hạn đăng</th><th>Trạng thái</th>' +
      '<th>Ngày đăng</th><th>Link bài</th><th title="Đủ gắn thẻ + hashtag">Thẻ</th><th title="Có nhắc tên + CTA">CTA</th><th></th></tr></thead><tbody>' +
      ds.map((b, i) => { const tt = b.tt || {}; return '<tr data-i="' + i + '"' + (tt.ma === 'tre' ? ' class="kiem"' : '') + '>' +
        '<td><input class="in-o" data-f="chuDe" value="' + e(b.chuDe) + '" style="min-width:120px"></td>' +
        '<td><input class="in-o" data-f="ten" value="' + e(b.ten) + '"></td>' +
        '<td><select class="in-o" data-f="loai">' + opt(LOAI_BG, b.loai, true) + '</select></td>' +
        '<td><div class="chip-ds" style="min-width:200px">' + (kenh.map((k) => '<button class="chip-chon' + ((b.kenhDang || []).includes(k.id) ? ' on' : '') + '" data-kd="' + k.id + '" title="' + e(k.link || '') + '">' +
          e(k.nenTang) + ' · ' + e(k.ten) + (k.reup ? ' (re-up)' : '') + '</button>').join('') || '<span class="nho">' + e((b.nenTang || []).join(', ') || '—') + '</span>') + '</div></td>' +
        '<td><input class="in-o" type="number" min="1" data-f="soLuong" value="' + (b.soLuong ?? 1) + '"></td>' +
        '<td><input class="in-o" data-f="traDoiTac" list="dsDtBg" value="' + e(b.traDoiTac) + '" placeholder="—" style="min-width:120px"></td>' +
        '<td><input class="in-o" type="date" data-f="hanDang" value="' + ngayIn(b.hanDang) + '"></td>' +
        '<td><select class="in-o" data-f="trangThai">' + opt(TT_BG, b.trangThai || 'Chưa làm') + '</select></td>' +
        '<td><input class="in-o" type="date" data-f="ngayDang" value="' + ngayIn(b.ngayDang) + '"></td>' +
        '<td><input class="in-o" data-f="link" value="' + e(b.link) + '" placeholder="https://" style="min-width:160px"></td>' +
        '<td style="text-align:center"><input type="checkbox" data-f="theTag"' + (b.theTag ? ' checked' : '') + '></td>' +
        '<td style="text-align:center"><input type="checkbox" data-f="cta"' + (b.cta ? ' checked' : '') + '></td>' +
        '<td><button class="nut-x" data-xoa="' + i + '">×</button></td></tr>'; }).join('') + '</tbody></table></div></div>' +
      (dang.length ? '<div class="the"><div class="the-dau"><h2>Số liệu bài đăng</h2></div><div class="the-than khit cuon"><table class="bang"><thead><tr><th>Bài</th><th>Mốc</th>' +
        ['Xem', 'Thích', 'Bình luận', 'Chia sẻ', 'Lưu'].map((c) => '<th class="so">' + c + '</th>').join('') + '<th>Nhập lúc</th></tr></thead><tbody>' +
        dang.map(([b, i]) => ['7', '30'].map((moc) => '<tr data-i="' + i + '"><td>' + (moc === '7' ? (b.link ? '<a href="' + e(b.link) + '" target="_blank" rel="noopener">' + e(b.ten) + '</a>' : e(b.ten)) +
          '<div class="nho">đăng ' + ddmm(b.ngayDang) + '</div>' : '') + '</td><td>' + moc + ' ngày' + (b.ngayDang ? '<div class="nho">từ ' + ddmm(dauNgay(b.ngayDang) + +moc * NGAY_MS) + '</div>' : '') + '</td>' +
          ['xem', 'thich', 'binhLuan', 'chiaSe', 'luu'].map((k) => '<td><input class="in-o" type="number" min="0" data-f="' + k + moc + '" value="' + (b[k + moc] ?? '') + '" style="min-width:90px"></td>').join('') +
          '<td class="nho">' + (b['nhap' + moc] ? ddmm(b['nhap' + moc]) : '') + '</td></tr>').join('')).join('') + '</tbody></table></div></div>' : '');
    $('#bgThem').onclick = () => {
      /* Mặc định chọn kênh chính đầu tiên của KOL. */
      const chinh = kenh.find((k) => !k.reup);
      ds.push({ ten: '', chuDe: '', loai: 'Video', kenhDang: chinh ? [chinh.id] : [], soLuong: 1, trangThai: 'Chưa làm', hanDang: ht.ketThuc ? ht.ketThuc + 7 * NGAY_MS : 0 });
      S.sua.ban = true; veLai();
    };
    $('#bgLuu').onclick = async () => {
      $('#bgLuu').disabled = true;
      try {
        await api('/api/hop-tac/' + ht.id + '/ban-giao', { ds: ds.map((b) => {
          const { tt, hopTac, nhap7, nhap30, ...r } = b;
          if (!r.hanDang) r.hanDang = null; if (!r.ngayDang) r.ngayDang = null;
          /* Nền tảng suy từ kênh đã chọn — bảng số liệu và các app khác vẫn lọc theo nền tảng được. */
          const nt = [...new Set((r.kenhDang || []).map((id) => (kenh.find((k) => k.id === id) || {}).nenTang).filter(Boolean))];
          if (nt.length) r.nenTang = nt;
          return r;
        }) });
        S.sua = null; await nap(true); toast('Đã lưu sản phẩm'); ve();
      } catch (err) { toast(err.message, true); $('#bgLuu').disabled = false; }
    };
  };
  than.oninput = than.onchange = (ev) => {
    if (!S.sua) return;   // bảng đã lưu + vẽ lại: sự kiện change muộn của ô vừa mất focus thì bỏ
    const tr = ev.target.closest('tr[data-i]'); const f = ev.target.dataset.f;
    if (!tr || !f) return;
    const b = S.sua.ds[+tr.dataset.i]; const x = ev.target;
    b[f] = x.type === 'checkbox' ? x.checked : x.type === 'number' ? (x.value === '' ? null : Number(x.value)) : x.type === 'date' ? tuChuoi(x.value) : x.value;
    if (f === 'trangThai' && b.trangThai === 'Đã đăng' && !b.ngayDang) b.ngayDang = Date.now();
    S.sua.ban = true; $('#bgLuu').disabled = false;
    if (ev.type === 'change' && f === 'trangThai') veLai();
  };
  than.onclick = (ev) => {
    const bc = ev.target.closest('[data-bcdt]');
    if (bc) return moEmail(ht, 'bao-cao-doi-tac', bc.dataset.bcdt);
    if (!S.sua) return;
    const kd = ev.target.closest('[data-kd]');
    if (kd) { const b = S.sua.ds[+kd.closest('tr').dataset.i]; const s = new Set(b.kenhDang || []); s.has(kd.dataset.kd) ? s.delete(kd.dataset.kd) : s.add(kd.dataset.kd); b.kenhDang = [...s]; S.sua.ban = true; return veLai(); }
    const x = ev.target.closest('[data-xoa]');
    if (x) { S.sua.ds.splice(+x.dataset.xoa, 1); S.sua.ban = true; veLai(); }
  };
  veLai();
}

/* ---------------- Email ---------------- */
function veEmail(than, ht) {
  const o = (loai, ten, phu, dt) => '<div class="o-email"><b>' + ten + '</b><div class="phu">' + phu + '</div><button class="btn chinh nho" data-em="' + loai + '"' +
    (dt ? ' data-dt="' + e(dt) + '"' : '') + '>Soạn</button></div>';
  const hm = S.dl.hangMuc.filter((h) => h.hopTac === ht.id && h.tinhTrang !== 'Huỷ');
  const bg = S.dl.banGiao.filter((b) => b.hopTac === ht.id);
  const dtFoc = [...new Set(hm.map((h) => h.nhaCungCap).filter(Boolean))];
  const dtBg = [...new Set(bg.map((b) => String(b.traDoiTac || '').trim()).filter(Boolean))];
  const kyHieu = (ms, tl) => (ms ? 'Đã gửi ' + ddmm(ms) + ' ' + hhmm(ms) : 'Chưa gửi') + (tl ? ' · đã có trả lời' : '');
  than.innerHTML = '<div class="the"><div class="the-dau"><h2>Ban Giám Đốc &amp; KOL</h2></div><div class="the-than"><div class="the-email">' +
    o('de-xuat', 'Trình Ban Giám Đốc', kyHieu(ht.trinhLuc, ht.bgdTraLoi)) +
    o('thu-moi', 'Thư mời KOL', kyHieu(ht.thuMoiLuc, ht.kolTraLoi)) +
    o('bao-cao', 'Báo cáo kết quả cho BGĐ', ht.kq.daDang + '/' + ht.kq.camKet + ' sản phẩm đã đăng') + '</div></div></div>' +
    '<div class="the"><div class="the-dau"><h2>Đối tác</h2></div><div class="the-than">' +
    (dtFoc.length || dtBg.length ? '<div class="the-email">' +
      dtFoc.map((d) => { const ds = hm.filter((h) => h.nhaCungCap === d); const tt = [...new Set(ds.map((h) => h.xinFoc || 'Không áp dụng'))].join(', ');
        return o('xin-foc', 'Đề xuất hợp tác · ' + d, tt + (ds[0].xinFocLuc ? ' · gửi ' + ddmm(ds[0].xinFocLuc) : ''), d); }).join('') +
      dtBg.map((d) => o('bao-cao-doi-tac', 'Báo cáo cho ' + d, bg.filter((b) => String(b.traDoiTac || '').trim() === d).length + ' sản phẩm trả đối tác', d)).join('') + '</div>'
      : '<div class="nho">Điền cột Đối tác trong bảng kê (hợp tác FOC) hoặc "Trả cho đối tác" ở tab Bàn giao để soạn thư cho đối tác.</div>') +
    '</div></div>';
  than.onclick = (ev) => { const b = ev.target.closest('[data-em]'); if (b) moEmail(ht, b.dataset.em, b.dataset.dt); };
}

const TEN_EMAIL = { 'de-xuat': 'Email trình Ban Giám Đốc', 'thu-moi': 'Thư mời KOL', 'bao-cao': 'Báo cáo kết quả', 'xin-foc': 'Đề xuất hợp tác FOC', 'bao-cao-doi-tac': 'Báo cáo cho đối tác' };
async function moEmail(ht, loai, dt, lang) {
  const duong = '/api/hop-tac/' + ht.id + '/email/' + loai + (dt ? '?dt=' + encodeURIComponent(dt) : lang ? '?lang=' + lang : '');
  let m;
  try { m = await api(duong); } catch (err) { return toast(err.message, true); }
  const guiDuoc = S.meta.mail.guiDuoc;
  const coBuoc = loai === 'de-xuat' || loai === 'thu-moi';
  const hop = moModal(TEN_EMAIL[loai] + (dt ? ' · ' + dt : ''), (m.chan ? '<div class="bao cam">' + e(m.chan) + '</div>' : '') +
    (S.meta.mail.mode === 'api' ? (S.meta.mail.hopThu && S.meta.mail.hopThu.ketNoi
      ? '<div class="bao xanh" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span>Gửi từ <b>' + e(S.meta.mail.from) + '</b> bằng tài khoản đã kết nối <b>' + e(S.meta.mail.hopThu.email) + '</b>. Bản trên Hub chỉ gửi thẳng, không lưu nháp.' +
        (S.meta.mail.hopThu.docDuoc ? ' App tự đọc thư trả lời mỗi 10 phút.' : ' <b>Chưa có quyền đọc thư trả lời</b> — bấm Ngắt kết nối rồi Kết nối hộp thư lại.')
        /* Quyền LƯU NHÁP thêm ngày 25/09/2026. Phiên kết nối trước đó không có
         * nó, nên lưu nháp và đính kèm tệp sẽ hỏng — nói ra ở đây để thấy
         * trước khi bấm, thay vì bấm rồi mới nhận câu lỗi. */
        + (S.meta.mail.hopThu.nhapDuoc ? ' Lưu nháp và đính kèm tệp: được.' : ' <b>Chưa lưu nháp / đính kèm tệp được</b> — ngắt rồi kết nối lại để cấp thêm quyền.') + '</span><div class="lon"></div><button class="btn nho" id="emNgat">Ngắt kết nối</button></div>'
      : '<div class="bao cam" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span>Chưa kết nối hộp thư. Bấm <b>Kết nối hộp thư</b>, đăng nhập Lark bằng tài khoản giữ hộp thư <b>' + e(S.meta.mail.from) + '</b> và đồng ý quyền gửi thư — làm một lần.</span><div class="lon"></div>' +
        '<a class="btn chinh nho" id="emKetNoi" href="' + e(((window.__HUB__ && window.__HUB__.prefix) || '') + '/api/mail/ket-noi') + '" target="_blank" rel="noopener">Kết nối hộp thư</a></div>') : '') +
    (loai === 'xin-foc' && !m.den ? '<div class="bao cam">Chưa có email của ' + e(dt) + '. Điền vào ô Gửi — app nhớ cho lần sau.</div>' : '') +
    (m.coLang ? '<div class="hang-nut" style="margin-bottom:8px"><span class="nho">Ngôn ngữ thư</span>' + [['vi', 'Tiếng Việt'], ['en', 'English']].map(([k, t]) =>
      '<button type="button" class="chip-chon' + (m.lang === k ? ' on' : '') + '" data-lang="' + k + '">' + t + '</button>').join('') +
      (m.lang === 'en' ? '<span class="nho">Tên dịch vụ lấy tên tiếng Anh trên Base Sản phẩm; chỗ còn tiếng Việt thì sửa thẳng trong khung.</span>' : '') + '</div>' : '') +
    '<div class="thu-dau"><span>Từ</span><div>' + e(m.from) + '</div><span>Gửi</span><input class="in-o" id="emDen" value="' + e(m.den) + '">' +
    '<span>CC</span><input class="in-o" id="emCc" value="' + e(m.cc || '') + '" placeholder="cách nhau bằng dấu phẩy"><span>Tiêu đề</span><input class="in-o" id="emTd" value="' + e(m.tieuDe) + '"></div>' +
    '<div class="thu-than" id="emThan" contenteditable="true">' + m.html + '</div>' +
    (S.meta.mail.mode === 'api' ? '<div class="thu-ck"><div class="thu-ck-dau"><span>Chữ ký</span><button type="button" class="btn nho" id="emCk">Sửa chữ ký</button></div><div id="emCkXem" class="nho">Đang tải…</div></div>' : ''),
  '<span class="nho" style="margin-right:auto">Sửa trực tiếp trong khung. ' + (S.meta.mail.mode === 'api' ? 'Chữ ký bên dưới được gắn cuối thư khi gửi.' : 'Chữ ký Lark Mail tự thêm khi gửi.') + '</span>' +
    (coBuoc ? '<button class="btn" id="emDaGui"' + (m.chan ? ' disabled' : '') + '>Đã gửi từ Lark Mail</button>' : '') +
    '<button class="btn" id="emChep" title="Chép tiêu đề + nội dung (giữ bảng) để dán vào Lark Mail">Chép nội dung</button>' +
    '<button class="btn" id="emNhap"' + (m.chan || !guiDuoc || !S.meta.mail.nhapDuoc ? ' disabled' : '') + (S.meta.mail.nhapDuoc ? '' : ' title="Chỉ bản chạy trên máy anh lưu nháp được"') + '>Lưu nháp</button><button class="btn chinh" id="emGui"' + (m.chan || !guiDuoc ? ' disabled' : '') + '>Gửi ngay</button>', true);
  const goi = async (gui) => {
    const b = { den: $('#emDen').value, cc: $('#emCc').value, tieuDe: $('#emTd').value, html: $('#emThan').innerHTML, gui, lang: m.lang || 'vi' };
    if (gui && !(await hoi({ tieuDe: 'Gửi email', noiDung: '"' + b.tieuDe + '" tới ' + b.den + (b.cc ? ' (CC ' + b.cc + ')' : '') + '. Gửi đi là không thu hồi được.', nut: 'Gửi ngay' }))) return;
    $$('.hop-chan .btn', hop).forEach((x) => { x.disabled = true; });
    try {
      const r = await api(duong, b);
      dongModal(); await nap(true);
      toast(r.daGui ? 'Đã gửi' + (r.buoc ? '. Bước: ' + r.buoc : '') : 'Đã lưu nháp trong Lark Mail' + (coBuoc ? ' — gửi xong bấm "Đã gửi từ Lark Mail"' : '')); ve();
    } catch (err) { toast(err.message, true); $$('.hop-chan .btn', hop).forEach((x) => { x.disabled = false; }); }
  };
  $('#emGui').onclick = () => goi(true);
  $('#emNhap').onclick = () => goi(false);
  $$('[data-lang]', hop).forEach((b) => { b.onclick = () => { if (b.dataset.lang !== m.lang) moEmail(ht, loai, dt, b.dataset.lang); }; });
  /* chữ ký (bản trên Hub): xem trước + sửa bằng cách dán từ Lark Mail */
  if ($('#emCkXem')) {
    const veCk = (h) => { $('#emCkXem').innerHTML = h || '<span class="canh">Chưa có chữ ký — thư sẽ đi không có chữ ký. Bấm Sửa chữ ký để dán.</span>'; };
    const ckLang = m.lang === 'en' ? 'en' : 'vi';
    if (ckLang === 'en') $('.thu-ck-dau span').textContent = 'Chữ ký tiếng Anh';
    api('/api/mail/chu-ky?lang=' + ckLang).then((r) => { if (r.html || ckLang === 'vi') return veCk(r.html);
      $('#emCkXem').innerHTML = '<span class="canh">Chưa có chữ ký tiếng Anh — thư sẽ dùng chữ ký tiếng Việt. Bấm Sửa chữ ký để dán bản tiếng Anh.</span>'; }).catch(() => veCk(''));
    $('#emCk').onclick = () => {
      const cu = $('#emCkXem').querySelector('.canh') ? '' : $('#emCkXem').innerHTML;
      const vung = document.createElement('div');
      vung.className = 'ck-sua';
      vung.innerHTML = '<div class="ck-hop"><b>Chữ ký email</b><div class="nho" style="margin:4px 0 8px">Mở một thư anh đã gửi bằng Lark Mail (hoặc Cài đặt → Chữ ký), bôi đen phần chữ ký, Ctrl+C rồi dán vào khung dưới (giữ được định dạng, logo, link).</div>' +
        '<div class="thu-than" id="ckThan" contenteditable="true" style="min-height:140px">' + cu + '</div>' +
        '<div class="hang-nut" style="margin-top:10px;justify-content:flex-end"><button class="btn" id="ckHuy">Huỷ</button><button class="btn chinh" id="ckLuu">Lưu chữ ký</button></div></div>';
      document.body.appendChild(vung);
      $('#ckThan').focus();
      $('#ckHuy').onclick = () => vung.remove();
      $('#ckLuu').onclick = async () => {
        $('#ckLuu').disabled = true;
        try { const r = await api('/api/mail/chu-ky', { html: $('#ckThan').innerHTML, lang: ckLang }); veCk(r.html); vung.remove(); toast('Đã lưu chữ ký' + (ckLang === 'en' ? ' tiếng Anh' : '')); }
        catch (err) { toast(err.message, true); $('#ckLuu').disabled = false; }
      };
    };
  }
  /* kết nối hộp thư (bản trên Hub): mở tab Lark; quay lại tab này thì đọc lại trạng thái và mở lại khung */
  if ($('#emKetNoi')) {
    $('#emKetNoi').addEventListener('click', () => {
      const lai = async () => { window.removeEventListener('focus', lai); try { S.meta = await api('/api/meta'); } catch (_) { return; }
        if (S.meta.mail.hopThu && S.meta.mail.hopThu.ketNoi) { toast('Đã kết nối hộp thư ' + S.meta.mail.hopThu.email); moEmail(ht, loai, dt); } };
      window.addEventListener('focus', lai);
    });
  }
  if ($('#emNgat')) {
    $('#emNgat').onclick = async () => {
      if (!(await hoi({ tieuDe: 'Ngắt kết nối hộp thư?', noiDung: 'App KOL trên Hub sẽ không gửi email được nữa cho tới khi kết nối lại.', nut: 'Ngắt kết nối' }))) return;
      try { await api('/api/mail/ngat', {}); S.meta = await api('/api/meta'); toast('Đã ngắt kết nối'); moEmail(ht, loai, dt); } catch (err) { toast(err.message, true); }
    };
  }
  $('#emChep').onclick = async () => {
    const html = $('#emThan').innerHTML, chu = $('#emThan').innerText;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([chu], { type: 'text/plain' }) })]);
      toast('Đã chép nội dung — dán vào Lark Mail (tiêu đề: ' + $('#emTd').value.slice(0, 40) + '…)');
    } catch (_) { chep(chu); }
  };
  if ($('#emDaGui')) $('#emDaGui').onclick = async () => {
    try { const r = await api('/api/hop-tac/' + ht.id + '/buoc', { viec: 'daGui', loai, tieuDe: $('#emTd').value }); dongModal(); await nap(true); toast('Đã ghi bước: ' + r.buoc); ve(); } catch (err) { toast(err.message, true); }
  };
}

/* ==========================================================================
   LỊCH TRÌNH
   ========================================================================== */
const TT_LICH = { qua: 'Đã qua', dang: 'Đang diễn ra', sap: 'Sắp tới', xong: 'Đã xong', 'su-co': 'Có sự cố' };
function gomMoc(hm) {
  const m = new Map();
  for (const h of hm) {
    const k = (h.gioHen || ('n' + (h.ngay || 0))) + '|' + tenGon(h.ten);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(h);
  }
  return [...m.values()].sort((a, b) => (a[0].gioHen || a[0].ngay || 9e15) - (b[0].gioHen || b[0].ngay || 9e15));
}
function veDongThoiGian(than, ht, trongCt) {
  const now = Date.now();
  const hm = S.dl.hangMuc.filter((h) => h.hopTac === ht.id && h.tinhTrang !== 'Huỷ');
  const moc = gomMoc(hm);
  const cacNgay = [];
  if (ht.batDau) for (let t = dauNgay(ht.batDau); t <= dauNgay(ht.ketThuc || ht.batDau); t += NGAY_MS) cacNgay.push(t);
  for (const g of moc) { const d = g[0].gioHen || g[0].ngay; if (d && !cacNgay.includes(dauNgay(d))) cacNgay.push(dauNgay(d)); }
  cacNgay.sort((a, b) => a - b);
  const chuaNgay = moc.filter((g) => !(g[0].gioHen || g[0].ngay));
  const dang = moc.find((g) => g[0].ttLich === 'dang');
  const tiep = moc.find((g) => g[0].gioHen && g[0].gioHen > now && g[0].ttLich !== 'xong');
  const nhac = S.meta.nhac;
  const veMoc = (g) => {
    const h = g[0];
    const tt = h.ttLich || (h.tinhTrang === 'Đã xong' ? 'xong' : '');
    const khachStr = g.map((x) => (x.soLuong ? x.soLuong + ' ' + (x.loaiKhach || '').toLowerCase() : '')).filter(Boolean).join(' + ');
    const nhacStr = h.nhacHen ? (h.daNhac ? 'đã nhắc ' + hhmm(h.daNhac) : h.gioHen ? 'nhắc ' + hhmm(h.gioHen - nhac.truocPhut * 60000) : 'chưa có giờ để nhắc') : '';
    return '<div class="lt-moc ' + (h.gioHen ? tt : 'chua-gio') + '" data-ids="' + g.map((x) => x.id).join(',') + '"><div class="gio">' + (h.gioHen ? hhmm(h.gioHen) : '--:--') +
      '<small>' + (TT_LICH[tt] || (h.gioHen ? '' : 'chưa giờ')) + '</small></div><div><div class="ten">' + e(tenGon(h.ten)) + '</div><div class="phu">' +
      [h.diemHen, khachStr, h.nhaCungCap, nhacStr].filter(Boolean).map(e).join(' · ') + '</div></div><div class="lt-nut">' +
      (h.gioHen ? '<button class="btn nho" data-tin="' + h.id + '">Tin KOL</button>' : '') +
      '<button class="btn nho" data-gio="' + h.id + '">' + (h.gioHen ? 'Đổi giờ' : 'Đặt giờ') + '</button>' +
      (tt !== 'xong' ? '<button class="btn nho" data-tt="Đã xong">Xong</button><button class="btn nho mo" data-tt="Có sự cố">Sự cố</button>' : '<button class="btn nho mo" data-tt="Chờ">Mở lại</button>') +
      '</div></div>';
  };
  than.innerHTML = (dang ? '<div class="lt-dang"><div>Đang</div><b>' + e(tenGon(dang[0].ten)) + '</b><span>từ ' + hhmm(dang[0].gioHen) + (dang[0].diemHen ? ' · ' + e(dang[0].diemHen) : '') + '</span></div>' :
    tiep ? '<div class="lt-dang"><div>Tiếp theo</div><b>' + e(tenGon(tiep[0].ten)) + '</b><span>' + ddmm(tiep[0].gioHen) + ' ' + hhmm(tiep[0].gioHen) + ' · còn ' + conLai(tiep[0].gioHen - now) + '</span></div>' : '') +
    '<div class="lt-luoi"><div class="the lt-bd"><div class="the-dau"><h2>Sơ đồ Phú Quốc</h2></div><div class="the-than">' +
    htmlBanDo(moc.filter((g) => g[0].gioHen || g[0].ngay).map((g) => ({ ngay: dauNgay(g[0].gioHen || g[0].ngay), gio: g[0].gioHen, ten: tenGon(g[0].ten), h: g[0] })), false) +
    '</div></div><div class="the" style="min-width:0"><div class="the-dau"><h2>Các mốc</h2><div class="lon"></div>' +
    (moc.length ? '<a class="btn nho chinh" href="' + e(((window.__HUB__ && window.__HUB__.prefix) || '') + '/in-lich.html?ht=' + ht.id) + '" target="_blank" rel="noopener" title="Bản lịch trình có bản đồ và logo Rooty Trip, lưu PDF gửi KOL">Xuất PDF cho KOL</a>' : '') +
    '</div><div class="the-than">' +
    (moc.length ? '' : '<div class="bao">Chưa có hạng mục nào. Thêm ở tab Bảng kê, đặt Giờ hẹn cho từng mốc.</div>') +
    cacNgay.map((d) => { const ds = moc.filter((g) => dauNgay(g[0].gioHen || g[0].ngay) === d); const t = vn(d);
      return '<div class="lt-ngay' + (d === dauNgay(now) ? ' nay' : '') + '"><b>' + THU[t.thu] + ', ' + p2(t.d) + '/' + p2(t.m) + (d === dauNgay(now) ? ' · hôm nay' : '') + '</b><div class="lt-ds">' +
        (ds.map(veMoc).join('') || '<div class="nho">Không có mốc</div>') + '</div></div>'; }).join('') +
    (chuaNgay.length ? '<div class="lt-ngay"><b>Chưa xếp ngày</b><div class="lt-ds">' + chuaNgay.map(veMoc).join('') + '</div></div>' : '') +
    '</div></div></div>';
  than.onclick = async (ev) => {
    const moc = ev.target.closest('[data-ids]');
    if (!moc) return;
    const ids = moc.dataset.ids.split(',');
    const tin = ev.target.closest('[data-tin]');
    if (tin) {
      try {
        const r = await api('/api/nhac/xem-truoc?hm=' + tin.dataset.tin);
        moModal('Tin nhắn nhắc hẹn', '<b>Gửi KOL (Zalo / Messenger)</b><pre class="tin" id="tinKol">' + e(r.tinKol) + '</pre><b>Bot sẽ nhắn anh</b><pre class="tin">' + e(r.tinAnh) + '</pre>',
          '<button class="btn chinh" id="chepTin">Chép tin gửi KOL</button>');
        $('#chepTin').onclick = () => chep(r.tinKol);
      } catch (err) { toast(err.message, true); }
      return;
    }
    const gio = ev.target.closest('[data-gio]');
    if (gio) {
      const h = S.dl.hangMuc.find((x) => x.id === gio.dataset.gio);
      const v = await hoi({ tieuDe: 'Giờ hẹn · ' + tenGon(h.ten), noiDung: 'Bot nhắc anh trước ' + S.meta.nhac.truocPhut + ' phút.',
        o: { type: 'datetime-local', value: h.gioHen ? gioIn(h.gioHen) : ngayIn(h.ngay || ht.batDau) + 'T08:00' }, nut: 'Đặt giờ' });
      if (v === null) return;
      const ms = tuChuoi(v);
      if (!ms) return toast('Chưa chọn giờ', true);
      try { for (const id of ids) await api('/api/hang-muc/' + id, { gioHen: ms, ngay: dauNgay(ms), nhacHen: true }); await nap(true); ve(); toast('Đã đặt giờ — bot sẽ nhắc trước ' + S.meta.nhac.truocPhut + ' phút'); } catch (err) { toast(err.message, true); }
      return;
    }
    const tt = ev.target.closest('[data-tt]');
    if (tt) {
      try { for (const id of ids) await api('/api/hang-muc/' + id, { tinhTrang: tt.dataset.tt }); await nap(true); ve(); } catch (err) { toast(err.message, true); }
    }
  };
  void trongCt;
}
const conLai = (ms) => { const p = Math.round(ms / 60000); return p < 60 ? p + ' phút' : p < 1440 ? Math.floor(p / 60) + ' giờ ' + (p % 60 ? p % 60 + ' phút' : '') : Math.round(p / 1440) + ' ngày'; };

/* Thẻ chọn chuyến (anh Hùng 23/09: dải chip cũ khó đọc): ai · khi nào · đang ở đâu trong chuyến ·
 * xong bao nhiêu mốc · mốc kế tiếp. Nhìn lướt biết chuyến nào cần để mắt. */
function theChuyen(h, on, now) {
  const hm = gomMoc(S.dl.hangMuc.filter((x) => x.hopTac === h.id && x.tinhTrang !== 'Huỷ'));
  const xong = hm.filter((g) => g[0].tinhTrang === 'Đã xong').length;
  const chuaGio = hm.filter((g) => !g[0].gioHen).length;
  const di = h.batDau ? dauNgay(h.batDau) : 0, ve = h.ketThuc ? dauNgay(h.ketThuc) : di;
  const soNgay = di ? Math.round((ve - di) / NGAY_MS) + 1 : 0;
  const homNay = dauNgay(now);
  let thoi = '', mauThoi = '';
  if (di && homNay < di) { const n = Math.round((di - homNay) / NGAY_MS); thoi = n === 1 ? 'Đi ngày mai' : 'Còn ' + n + ' ngày'; mauThoi = 'cam'; }
  else if (di && homNay <= ve) { thoi = 'Đang đi · ngày ' + (Math.round((homNay - di) / NGAY_MS) + 1) + '/' + soNgay; mauThoi = 'xanh'; }
  else if (di) { const n = Math.round((homNay - ve) / NGAY_MS); thoi = n === 0 ? 'Về hôm nay' : 'Đã về ' + n + ' ngày'; }
  const tiep = hm.find((g) => g[0].gioHen && g[0].gioHen > now && g[0].tinhTrang !== 'Đã xong');
  const phan = hm.length ? Math.round(xong / hm.length * 100) : 0;
  const k = kolCua(h.kol);
  const chu = String(h.kolTen || h.ma || '?').replace(/^\[[^\]]*\]\s*/, '').trim();
  const tat = chu.split(/\s+/).filter(Boolean);
  return '<button type="button" class="lt-the' + (on ? ' on' : '') + '" data-chon="' + h.id + '">' +
    '<div class="lt-the-dau"><span class="lt-avt">' + e(((tat[0] || '?')[0] + (tat.length > 1 ? tat[tat.length - 1][0] : '')).toUpperCase()) + '</span>' +
      '<div class="lt-the-ten"><b>' + e(h.kolTen || h.ma) + '</b><small>' + e([h.ma, k.quocGia].filter(Boolean).join(' · ')) + '</small></div></div>' +
    '<div class="lt-the-ngay">' + (di ? ddmm(di) + (soNgay > 1 ? ' – ' + ddmm(ve) : '') + ' · ' + soNgay + 'N' + (soNgay > 1 ? (soNgay - 1) + 'Đ' : '') : 'Chưa có ngày đi') +
      (thoi ? nhanTT(thoi, mauThoi) : '') + '</div>' +
    '<div class="lt-the-tien"><i style="width:' + phan + '%"></i></div>' +
    '<div class="lt-the-chan"><span>' + (hm.length ? xong + '/' + hm.length + ' mốc xong' : 'Chưa có mốc') + '</span><span>' + e(h.buoc) + '</span></div>' +
    '<div class="lt-the-tiep">' + (tiep ? 'Tiếp: <b>' + e(tenGon(tiep[0].ten)) + '</b> ' + ddmm(tiep[0].gioHen) + ' ' + hhmm(tiep[0].gioHen)
      : chuaGio && homNay <= ve ? '<span class="canh">' + chuaGio + ' mốc chưa có giờ hẹn</span>' : '&nbsp;') + '</div>' +
    '</button>';
}

function veLichTrinh(man, htId) {
  const now = Date.now();
  const uu = { 'Đang đi tour': 0, 'Đã tạo tour Tourwell': 1, 'KOL đã xác nhận': 2, 'Đã mời KOL': 3, 'BGĐ đã duyệt': 4 };
  const ds = S.dl.hopTac.filter((h) => h.buoc in uu).sort((a, b) => uu[a.buoc] - uu[b.buoc] || (a.batDau || 9e15) - (b.batDau || 9e15));
  const gan = S.dl.hopTac.filter((h) => h.buoc === 'Chờ nhận sản phẩm').sort((a, b) => (b.ketThuc || 0) - (a.ketThuc || 0)).slice(0, 3);
  const tatCa = [...ds, ...gan];
  const chon = tatCa.find((h) => h.id === htId) || tatCa[0];
  const nhac = S.meta.nhac;
  man.innerHTML = '<div class="the"><div class="the-dau"><h2>Nhắc hẹn</h2><span class="nho">' + (nhac.tat ? 'Đang tắt' : nhac.coKenh ? e(nhac.kenh) + ' · trước ' + nhac.truocPhut + ' phút' : 'Chưa có kênh gửi tin') +
    (nhac.lanCuoi ? ' · gửi lần cuối ' + ddmm(nhac.lanCuoi) + ' ' + hhmm(nhac.lanCuoi) : '') + '</span><div class="lon"></div><button class="btn nho" id="thuNhac">Gửi tin thử</button></div>' +
    (nhac.loiCuoi ? '<div class="the-than"><div class="bao cam" style="margin:0">' + e(nhac.loiCuoi) + '</div></div>' : '') + '</div>' +
    (tatCa.length ? '<div class="lt-chuyen">' + tatCa.map((h) => theChuyen(h, chon && h.id === chon.id, now)).join('') + '</div><div id="ltThan"></div>' :
      '<div class="bao">Không có chuyến nào sắp đi hoặc đang đi.</div>');
  if (chon) veDongThoiGian($('#ltThan'), chon);
  man.onclick = async (ev) => {
    const c = ev.target.closest('[data-chon]');
    if (c) return di('#/lich-trinh?ht=' + c.dataset.chon);
    if (ev.target.id === 'thuNhac') {
      ev.target.disabled = true;
      try { await api('/api/nhac/thu', {}); toast('Đã gửi tin thử — kiểm tra Lark'); S.meta = await api('/api/meta'); } catch (err) { toast(err.message, true); }
      ev.target.disabled = false;
    }
  };
  void now;
}

/* ==========================================================================
   BÀN GIAO (toàn bộ)
   ========================================================================== */
/* Nhập số nhanh (anh Hùng 23/09): chỉ lấy số HIỂN THỊ công khai trên bài — mở link, nhìn, gõ.
 * Mốc 7 ngày cho biết bài có "nổ" không; mốc 30 ngày là số chốt để báo cáo. */
const SO_BAI = [['xem', 'Xem'], ['thich', 'Thích'], ['binhLuan', 'Bình luận'], ['chiaSe', 'Chia sẻ'], ['luu', 'Lưu']];
function htmlNhapNhanh(ds) {
  if (!ds.length) return '<div class="bao xanh">Không có bài nào đến hạn nhập số. Bài "Đã đăng" sẽ hiện ở đây sau 7 ngày và 30 ngày kể từ ngày đăng.</div>';
  return '<div class="nhap-nhanh">' + ds.map((b) => {
    const ht = htCua(b.hopTac) || {};
    const moc = b.tt.ma === 'do-30' ? '30' : '7';
    const tu = b.ngayDang ? ddmm(dauNgay(b.ngayDang) + +moc * NGAY_MS) : '';
    return '<div class="the nn-the" data-bg="' + b.id + '" data-moc="' + moc + '"><div class="the-than">' +
      '<div class="nn-dau"><div><b>' + e(ht.kolTen || '') + '</b> <span class="nho">' + e(ht.ma || '') + '</span><div>' + e(b.ten) + '</div>' +
      '<div class="nho">đăng ' + ddmm(b.ngayDang) + ' · số ' + moc + ' ngày (từ ' + tu + ')' + (moc === '30' && b.xem7 != null ? ' · mốc 7 ngày: ' + tien(b.xem7) + ' xem' : '') + '</div></div>' +
      (b.link ? '<a class="btn nho" href="' + e(b.link) + '" target="_blank" rel="noopener">Mở bài</a>' : '') + '</div>' +
      (b.link ? '' : '<label class="nn-link">Link bài<input class="in-o" data-o="link" placeholder="Dán link bài để lần sau mở nhanh"></label>') +
      '<div class="nn-so">' + SO_BAI.map(([k, n]) => '<label>' + n + '<input class="in-o" type="number" min="0" inputmode="numeric" data-o="' + k + moc + '" placeholder="' +
        (moc === '30' && b[k + '7'] != null ? tien(b[k + '7']) : '') + '"></label>').join('') +
      '<button class="btn chinh" data-luu="' + b.id + '">Lưu</button></div></div></div>';
  }).join('') + '</div>';
}

/* Bảng bàn giao (anh Hùng 24/09): mỗi bài một dòng, có kênh, link, số xem và từng loại tương tác.
 * Số lấy mốc MỚI NHẤT (30 ngày nếu đã nhập, không thì 7 ngày); cột "Mốc" nói số đang hiện là mốc nào. */
const tenKenhBg = (b) => {
  const k = (b.kenhDang || []).map((id) => S.dl.kenh.find((x) => x.id === id)).filter(Boolean);
  return k.length ? k.map((x) => x.nenTang || x.ten).filter((x, i, a) => a.indexOf(x) === i).join(', ') : (b.nenTang || []).join(', ');
};
function soBai(b) {
  const moc = b.xem30 != null ? '30' : b.xem7 != null ? '7' : '';
  const g = (k) => (moc ? b[k + moc] : null);
  const so = { moc, xem: g('xem'), thich: g('thich'), binhLuan: g('binhLuan'), chiaSe: g('chiaSe'), luu: g('luu') };
  so.tuongTac = moc ? ['thich', 'binhLuan', 'chiaSe', 'luu'].reduce((t, k) => t + (Number(so[k]) || 0), 0) : null;
  so.tiLe = so.xem ? so.tuongTac / so.xem * 100 : null;
  return so;
}
function htmlBangBg(ds) {
  const mau = { tre: 'do', 'do-7': 'cam', 'do-30': 'cam', dang: 'xanh' };
  const o = (v) => '<td class="so">' + (v == null || v === '' ? '<span class="phu">–</span>' : tien(v)) + '</td>';
  const tong = { xem: 0, tuongTac: 0, bai: 0 };
  const dong = ds.map((b) => {
    const ht = htCua(b.hopTac) || {};
    const s = soBai(b);
    if (s.moc) { tong.xem += Number(s.xem) || 0; tong.tuongTac += s.tuongTac || 0; tong.bai++; }
    return '<tr><td><div class="bg-kol">' + e(ht.kolTen || '') + '</div><div class="nho">' + e(ht.ma || '') + '</div></td>' +
      '<td class="w-ten"><div>' + e(b.ten) + '</div><div class="nho">' + e([b.chuDe, b.loai + (b.soLuong > 1 ? ' ×' + b.soLuong : '')].filter(Boolean).join(' · ')) + '</div></td>' +
      '<td>' + e(tenKenhBg(b)) + '</td>' +
      '<td>' + (b.ngayDang ? 'đăng ' + ddmm(b.ngayDang) : 'hạn ' + ddmm(b.hanDang)) + '</td>' +
      '<td>' + nhanTT(b.tt.nhan, mau[b.tt.ma]) + '</td>' +
      '<td class="giua">' + (b.link ? '<a class="btn nho" href="' + e(b.link) + '" target="_blank" rel="noopener" title="' + e(b.link) + '">Mở bài</a>' : '<span class="phu">chưa có</span>') + '</td>' +
      '<td class="giua">' + (s.moc ? '<span class="nhan-tt">' + s.moc + 'N</span>' : '') + '</td>' +
      o(s.xem) + o(s.thich) + o(s.binhLuan) + o(s.chiaSe) + o(s.luu) +
      '<td class="so"><b>' + (s.tuongTac == null ? '<span class="phu">–</span>' : tien(s.tuongTac)) + '</b></td>' +
      '<td class="so">' + (s.tiLe == null ? '<span class="phu">–</span>' : s.tiLe.toFixed(1).replace('.', ',') + '%') + '</td>' +
      '<td><button class="btn nho" data-ht="' + b.hopTac + '">Sửa</button></td></tr>';
  }).join('');
  return '<div class="the"><div class="the-than khit cuon"><table class="bang bang-bg"><thead><tr><th>KOL</th><th class="w-ten">Sản phẩm</th><th>Kênh</th><th>Ngày</th><th>Tình trạng</th>' +
    '<th class="giua">Link</th><th class="giua">Mốc</th><th class="so">Xem</th><th class="so">Thích</th><th class="so">Bình luận</th><th class="so">Chia sẻ</th><th class="so">Lưu</th>' +
    '<th class="so">Tương tác</th><th class="so" title="(thích + bình luận + chia sẻ + lưu) / xem">Tỉ lệ</th><th></th></tr></thead><tbody>' +
    (dong || '<tr><td colspan="15" class="nho" style="padding:16px">Không có mục nào.</td></tr>') + '</tbody>' +
    (tong.bai ? '<tfoot><tr><td colspan="7"><b>Tổng ' + tong.bai + ' bài đã có số</b></td><td class="so"><b>' + tien(tong.xem) + '</b></td><td colspan="4"></td>' +
      '<td class="so"><b>' + tien(tong.tuongTac) + '</b></td><td class="so"><b>' + (tong.xem ? (tong.tuongTac / tong.xem * 100).toFixed(1).replace('.', ',') + '%' : '') + '</b></td><td></td></tr></tfoot>' : '') +
    '</table></div></div>';
}

function veBanGiaoTat(man) {
  const loc = duong().q.get('loc') || '';
  const LOC = [['', 'Tất cả'], ['tre', 'Quá hạn đăng'], ['cho', 'Chưa đăng'], ['can-do', 'Đến hạn nhập số'], ['dang', 'Đã đăng']];
  const khop = (b) => !loc || (loc === 'can-do' ? ['do-7', 'do-30'].includes(b.tt.ma) : loc === 'dang' ? b.trangThai === 'Đã đăng' : b.tt.ma === loc);
  const ds = S.dl.banGiao.filter((b) => b.tt.ma !== 'huy' && khop(b)).sort((a, b) => (a.hanDang || 9e15) - (b.hanDang || 9e15));
  const soCanDo = S.dl.banGiao.filter((b) => ['do-7', 'do-30'].includes(b.tt.ma)).length;
  man.innerHTML = '<div class="hang-nut" style="margin-bottom:12px">' + LOC.map(([k, t]) => '<button class="chip-chon' + (k === loc ? ' on' : '') + '" data-loc="' + k + '">' + t +
      (k === 'can-do' && soCanDo ? ' · ' + soCanDo : '') + '</button>').join('') + '</div>' +
    (loc === 'can-do' ? htmlNhapNhanh(ds) :
    htmlBangBg(ds));
  const luu = async (the) => {
    const b = {};
    $$('[data-o]', the).forEach((x) => { if (x.value.trim() !== '') b[x.dataset.o] = x.dataset.o === 'link' ? x.value.trim() : Number(x.value); });
    const moc = the.dataset.moc;
    if (!('xem' + moc in b)) return toast('Nhập ít nhất lượt xem', true);
    const nut = $('[data-luu]', the); nut.disabled = true;
    try { await api('/api/ban-giao/' + the.dataset.bg, b); await nap(true); toast('Đã lưu số ' + moc + ' ngày'); ve(); }
    catch (err) { toast(err.message, true); nut.disabled = false; }
  };
  man.onclick = (ev) => {
    const l = ev.target.closest('[data-loc]');
    if (l) return di('#/ban-giao' + (l.dataset.loc ? '?loc=' + l.dataset.loc : ''));
    const s = ev.target.closest('[data-luu]');
    if (s) return luu(s.closest('.nn-the'));
    const h = ev.target.closest('[data-ht]');
    if (h) di('#/ht/' + h.dataset.ht + '/ban-giao');
  };
  /* Enter trong ô số = lưu thẻ đó */
  man.onkeydown = (ev) => { if (ev.key === 'Enter' && ev.target.closest('.nn-the')) { ev.preventDefault(); luu(ev.target.closest('.nn-the')); } };
}

/* ==========================================================================
   KOL
   ========================================================================== */
function veKol(man) {
  const q = (duong().q.get('tim') || '').toLowerCase();
  const ds = S.dl.kol.filter((k) => !q || (k.ten + k.email + k.sdt).toLowerCase().includes(q)).sort((a, b) => (b.tongTheoDoi || 0) - (a.tongTheoDoi || 0));
  man.innerHTML = '<div class="hang-nut" style="margin-bottom:12px"><button class="btn chinh" id="kolMoi">Thêm KOL</button><input class="in-o" id="kolTim" placeholder="Tìm tên, email, số điện thoại" style="max-width:300px" value="' + e(q) + '"></div>' +
    '<div class="luoi-kol">' + ds.map((k) => { const kenh = S.dl.kenh.filter((x) => x.kol === k.id); const lan = S.dl.hopTac.filter((h) => h.kol === k.id);
      return '<div class="the-kol" role="button" tabindex="0" data-kol="' + k.id + '"><div style="display:flex;gap:10px;align-items:flex-start"><div style="flex:1"><b>' + e(k.ten) + '</b><div class="nho">' + e([k.quocGia, k.sdt].filter(Boolean).join(' · ')) +
        '</div></div><div style="text-align:right"><div class="so-lon">' + soGon(k.tongTheoDoi || 0) + '</div><div class="nho">theo dõi</div></div></div>' +
        '<div class="kenh-ds">' + kenh.map(chipKenh).join('') + '</div><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' + nhanTT(k.tinhTrang || 'Tiềm năng', k.tinhTrang === 'Đã hợp tác' ? 'xanh' : k.tinhTrang === 'Không phù hợp' ? '' : 'cam') +
        (lan.length ? nhanTT(lan.length + ' lần hợp tác') : '') + (k.danhGia ? nhanTT(k.danhGia + '/5') : '') + '</div></div>'; }).join('') + '</div>';
  $('#kolMoi').onclick = () => moKol(null);
  $('#kolTim').onchange = (ev) => di('#/kol' + (ev.target.value ? '?tim=' + encodeURIComponent(ev.target.value) : ''));
  /* Bấm link kênh trên thẻ thì chỉ mở kênh, không mở luôn cửa sổ sửa KOL. */
  man.onclick = (ev) => { if (ev.target.closest('a')) return; const k = ev.target.closest('[data-kol]'); if (k) moKol(k.dataset.kol); };
}

function moKol(id) {
  const k = id ? S.dl.kol.find((x) => x.id === id) : { quocGia: 'Việt Nam', maVung: '+84', tinhTrang: 'Tiềm năng', xungHo: 'Chị', linhVuc: [] };
  const kenh = id ? S.dl.kenh.filter((x) => x.kol === id) : [{ nenTang: 'TikTok', ten: '', link: '', theoDoi: null }];
  const hop = moModal(id ? 'KOL · ' + k.ten : 'Thêm KOL', formKol(k, kenh, true) +
    '<label class="rong" style="display:flex;flex-direction:column;gap:4px;margin-top:12px;font-size:12px;color:var(--text-3);font-weight:600">Ghi chú' +
    '<textarea class="in" data-k="ghiChu">' + e(k.ghiChu) + '</textarea></label>',
  (id ? '<button class="btn" id="kHt">Tạo hợp tác</button>' : '') + '<div class="lon"></div><button class="btn mo" data-dong>Đóng</button><button class="btn chinh" id="kLuu">Lưu</button>', true);
  $('.hop-chan [data-dong]', hop).onclick = dongModal;
  const doc = ganFormKol($('.hop-than', hop), k, kenh);
  if ($('#kHt')) $('#kHt').onclick = () => moTaoHopTac(id);
  $('#kLuu').onclick = async () => {
    const f = doc();
    if (f.loi) return toast(f.loi, true);
    if (f.canhSdt && !(await hoi({ tieuDe: 'Số điện thoại có vẻ sai', noiDung: f.canhSdt + '. Vẫn lưu?', nut: 'Vẫn lưu' }))) return;
    $('#kLuu').disabled = true;
    try { await api('/api/kol', { ...f.kol, kenh: f.kenh }); dongModal(); await nap(true); toast('Đã lưu KOL'); ve(); }
    catch (err) { toast(err.message, true); $('#kLuu').disabled = false; }
  };
}

/* ==========================================================================
   DỊCH VỤ ĐỐI TÁC
   ========================================================================== */
function veDichVu(man) {
  const q = gon(duong().q.get('tim') || '');
  const loai = duong().q.get('loai') || '';
  const dsDt = S.dl.doiTac.slice().sort((a, b) => String(a.loai).localeCompare(b.loai, 'vi') || String(a.ten).localeCompare(b.ten, 'vi'));
  const cacLoai = [...new Set(dsDt.map((d) => d.loai).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const locDt = dsDt.filter((d) => (!loai || d.loai === loai) && (!q || gon(d.ten + d.email + d.lienHe).includes(q)));
  const ds = S.dl.dichVu.slice().sort((a, b) => String(a.loai).localeCompare(b.loai) || String(a.ten).localeCompare(b.ten));
  const soDong = 150;
  man.innerHTML = '<div class="the"><div class="the-dau"><h2>Đối tác · ' + dsDt.length + '</h2><div class="lon"></div>' +
    '<input class="in-o" id="dtTim" placeholder="Tìm tên, email, người liên hệ" style="max-width:240px" value="' + e(duong().q.get('tim') || '') + '">' +
    '<select class="in-o" id="dtLoai" style="max-width:180px">' + '<option value="">Mọi loại</option>' + cacLoai.map((x) => '<option' + (x === loai ? ' selected' : '') + '>' + e(x) + '</option>').join('') + '</select>' +
    '<button class="btn nho" id="dtMoi">Thêm đối tác</button><button class="btn nho chinh" id="dtNhap">Cập nhật từ Tourwell</button></div>' +
    '<div class="the-than khit cuon"><table class="bang"><thead><tr><th>Đối tác</th><th>Loại</th><th>Email</th><th>Người liên hệ</th><th>SĐT</th><th></th></tr></thead><tbody>' +
    (locDt.slice(0, soDong).map((d) => '<tr><td><b>' + e(d.ten) + '</b>' + (d.maTw ? ' <span class="nho">TW ' + e(d.maTw) + '</span>' : '') + '</td><td>' + e(d.loai) + '</td><td>' + e(d.email || '—') +
      (d.cc ? '<div class="nho">CC ' + e(d.cc) + '</div>' : '') + '</td><td>' + e(d.lienHe) + '</td><td>' + e(d.sdt) + '</td><td><button class="btn nho" data-dt="' + d.id + '">Sửa</button></td></tr>').join('') ||
      '<tr><td colspan="6" class="nho" style="padding:16px">' + (dsDt.length ? 'Không có đối tác khớp bộ lọc.' : 'Chưa có đối tác — bấm "Cập nhật từ Tourwell" để lấy danh sách nhà cung cấp.') + '</td></tr>') +
    (locDt.length > soDong ? '<tr><td colspan="6" class="nho" style="padding:10px 12px">Còn ' + (locDt.length - soDong) + ' đối tác — gõ ô tìm để thu hẹp.</td></tr>' : '') +
    '</tbody></table></div></div>' +
    '<div class="the"><div class="the-dau"><h2>Dịch vụ tự khai · ' + ds.length + '</h2><span class="nho">dịch vụ không có trên Tourwell / Base Sản phẩm</span><div class="lon"></div><button class="btn nho" id="dvMoi">Thêm dịch vụ</button></div>' +
    '<div class="the-than khit cuon"><table class="bang"><thead><tr>' +
    '<th>Loại</th><th>Dịch vụ</th><th>Nhà cung cấp</th><th>Đơn vị</th><th class="so">Công bố NL</th><th class="so">Công bố TE</th><th class="so">Net NL</th><th class="so">Net TE</th><th>FOC</th><th></th></tr></thead><tbody>' +
    (ds.map((d) => '<tr' + (d.dangDung === false ? ' class="huy"' : '') + '><td>' + e(d.loai) + '</td><td>' + e(d.ten) + '</td><td>' + e(d.nhaCungCap) + '</td><td>' + e(d.donVi) + '</td><td class="so">' + tien(d.cbNL) +
      '</td><td class="so">' + tien(d.cbTE) + '</td><td class="so">' + tien(d.netNL) + '</td><td class="so">' + tien(d.netTE) + '</td><td>' + (d.focThuong ? 'Thường FOC' : '') +
      '</td><td><button class="btn nho" data-dv="' + d.id + '">Sửa</button></td></tr>').join('') || '<tr><td colspan="10" class="nho" style="padding:16px">Chưa có dịch vụ nào.</td></tr>') + '</tbody></table></div></div>';
  const loc = () => { const t = $('#dtTim').value.trim(), l = $('#dtLoai').value; di('#/dich-vu' + (t || l ? '?' + new URLSearchParams({ ...(t ? { tim: t } : {}), ...(l ? { loai: l } : {}) }) : '')); };
  $('#dtTim').onchange = loc; $('#dtLoai').onchange = loc;
  $('#dtMoi').onclick = () => moDoiTac(null);
  $('#dvMoi').onclick = () => moDichVu(null);
  $('#dtNhap').onclick = async (ev) => {
    const nut = ev.target;
    if (!(await hoi({ tieuDe: 'Cập nhật đối tác từ Tourwell', noiDung: 'Lấy danh sách nhà cung cấp trên Tourwell (khoảng 450, mất chừng 20 giây). Đối tác mới được thêm; đối tác đã có chỉ được điền ô còn trống — email, người liên hệ anh đã sửa giữ nguyên.', nut: 'Cập nhật' }))) return;
    nut.disabled = true; nut.textContent = 'Đang lấy từ Tourwell…';
    try { const r = await api('/api/doi-tac/nhap-tourwell', {}); await nap(true); toast('Tourwell: thêm ' + r.them + ', cập nhật ' + r.capNhat + ' đối tác'); ve(); }
    catch (err) { toast(err.message, true); nut.disabled = false; nut.textContent = 'Cập nhật từ Tourwell'; }
  };
  man.onclick = (ev) => {
    const b = ev.target.closest('[data-dv]'); if (b) return moDichVu(b.dataset.dv);
    const d = ev.target.closest('[data-dt]'); if (d) return moDoiTac(d.dataset.dt);
  };
}
function moDoiTac(id) {
  const d = id ? S.dl.doiTac.find((x) => x.id === id) : {};
  const o = (k, n, kieu, goiY) => '<label>' + n + '<input class="in-o" data-k="' + k + '"' + (kieu ? ' type="' + kieu + '"' : '') + ' value="' + e(d[k]) + '" placeholder="' + e(goiY || '') + '"></label>';
  const hop = moModal(id ? d.ten : 'Thêm đối tác', '<div class="luoi-form">' +
    '<label class="rong">Tên đối tác<input class="in-o" data-k="ten" value="' + e(d.ten) + '"></label>' +
    o('loai', 'Loại dịch vụ', '', 'Khách sạn, Nhà hàng…') + o('email', 'Email', 'email', 'nhận thư đề xuất hợp tác') + o('cc', 'CC', '', 'cách nhau bằng dấu phẩy') +
    o('lienHe', 'Người liên hệ', '', 'Chị Lan — Marketing') + o('sdt', 'SĐT') +
    '<label class="rong">Ghi chú<textarea class="in" data-k="ghiChu">' + e(d.ghiChu) + '</textarea></label></div>' +
    (d.maTw ? '<div class="nho" style="margin-top:8px">Mã nhà cung cấp Tourwell: ' + e(d.maTw) + '</div>' : ''),
  '<button class="btn mo" data-dong>Đóng</button><button class="btn chinh" id="dtLuu">Lưu</button>');
  $('.hop-chan [data-dong]', hop).onclick = dongModal;
  $('#dtLuu').onclick = async () => {
    const b = { id: id || undefined };
    $$('[data-k]', hop).forEach((x) => { b[x.dataset.k] = x.value.trim(); });
    if (!b.ten) return toast('Chưa có tên đối tác', true);
    const sai = [b.email, ...String(b.cc || '').split(/[,;\s]+/)].filter(Boolean).find((x) => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(x));
    if (sai) return toast('Email "' + sai + '" chưa đúng dạng', true);
    try { await api('/api/doi-tac', b); dongModal(); await nap(true); toast('Đã lưu đối tác'); ve(); } catch (err) { toast(err.message, true); }
  };
}
function moDichVu(id) {
  const d = id ? S.dl.dichVu.find((x) => x.id === id) : { loai: 'Lưu trú', donVi: 'Phòng/đêm', dangDung: true };
  const so = (k, n) => '<label>' + n + '<input class="in-o" type="number" min="0" step="1000" data-k="' + k + '" value="' + (d[k] ?? '') + '"></label>';
  const hop = moModal(id ? d.ten : 'Thêm dịch vụ đối tác', '<div class="luoi-form">' +
    '<label class="rong">Tên dịch vụ<input class="in-o" data-k="ten" value="' + e(d.ten) + '"></label>' +
    '<label>Loại<select class="in-o" data-k="loai">' + opt(LOAI_DV, d.loai, true) + '</select></label>' +
    '<label>Đơn vị tính<select class="in-o" data-k="donVi">' + opt(DON_VI, d.donVi, true) + '</select></label>' +
    '<label>Nhà cung cấp<input class="in-o" data-k="nhaCungCap" value="' + e(d.nhaCungCap) + '"></label>' +
    so('cbNL', 'Giá công bố NL') + so('cbTE', 'Giá công bố TE') + so('cbEB', 'Giá công bố EB') + so('netNL', 'Giá net NL') + so('netTE', 'Giá net TE') + so('netEB', 'Giá net EB') +
    '<label>Người liên hệ<input class="in-o" data-k="lienHe" value="' + e(d.lienHe) + '"></label><label>SĐT liên hệ<input class="in-o" data-k="sdtLienHe" value="' + e(d.sdtLienHe) + '"></label>' +
    '<label class="rong">Địa chỉ<input class="in-o" data-k="diaChi" value="' + e(d.diaChi) + '"></label>' +
    '<label><span><input type="checkbox" data-k="focThuong"' + (d.focThuong ? ' checked' : '') + '> Thường FOC</span></label><label><span><input type="checkbox" data-k="dangDung"' + (d.dangDung !== false ? ' checked' : '') + '> Đang dùng</span></label>' +
    '<label class="rong">Ghi chú<textarea class="in" data-k="ghiChu">' + e(d.ghiChu) + '</textarea></label></div>',
  '<button class="btn mo" data-dong>Đóng</button><button class="btn chinh" id="dvLuu">Lưu</button>');
  $('.hop-chan [data-dong]', hop).onclick = dongModal;
  $('#dvLuu').onclick = async () => {
    const b = { id: id || undefined };
    $$('[data-k]', hop).forEach((x) => { b[x.dataset.k] = x.type === 'checkbox' ? x.checked : x.type === 'number' ? (x.value === '' ? null : Number(x.value)) : x.value; });
    try { await api('/api/dich-vu', b); dongModal(); await nap(true); toast('Đã lưu'); ve(); } catch (err) { toast(err.message, true); }
  };
}

/* ==========================================================================
   khởi động + cầu nối hub
   ========================================================================== */
$('#btnLamMoi').onclick = async () => { try { await nap(true); ve(); toast('Đã làm mới'); } catch (err) { toast(err.message, true); } };
window.addEventListener('message', (ev) => {
  const d = ev.data || {};
  if (d.hub === 'open' && d.rec && S.dl) {
    const ht = htCua(d.rec);
    if (ht) { di('#/ht/' + ht.id); parent.postMessage({ hub: 'opened' }, '*'); } else parent.postMessage({ hub: 'khong-thay' }, '*');
  }
  if (d.hub === 'tab' && d.v) di('#/' + d.v);
});
setInterval(() => {
  const d = duong();
  if (S.sua && S.sua.ban) return;
  /* đang xem bản đồ toàn màn hình thì đừng vẽ lại, kẻo thu bản đồ về */
  if (document.fullscreenElement || $('.bd-khung.bd-phong')) return;
  if (d.trang === 'lich-trinh' || d.con === 'lich-trinh') nap(false).then(ve).catch(() => {});
}, 60000);

(async () => {
  try {
    await nap(false);
    const rec = new URLSearchParams(location.search).get('rec');
    if (rec && htCua(rec)) location.hash = '#/ht/' + rec;
    ve();
  } catch (err) {
    $('#man').innerHTML = '<div class="bao cam">' + e(err.message) + '</div>';
  }
})();
