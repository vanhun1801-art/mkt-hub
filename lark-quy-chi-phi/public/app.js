'use strict';
/* ============================================================================
 * QUỸ CHI PHÍ MARKETING — giao diện
 * ============================================================================
 *
 * Thay sáu tab của sheet cũ. Bốn việc app phải làm được, theo đúng thứ tự anh
 * Hùng cần trong ngày:
 *
 *   1. Còn bao nhiêu tiền trong quỹ — câu hỏi đầu tiên mỗi lần mở
 *   2. Khai một khoản chi, đính kèm hoá đơn + UNC ngay lúc khai
 *   3. Quyết toán theo lô — gán một mã QTTU cho hàng chục khoản cùng lúc
 *   4. Khoản nào thiếu chứng từ — sheet cũ thiếu UNC ở 67/162 dòng vì không ai
 *      nhìn ra được chỗ thiếu
 *
 * Không framework, cùng lối với các app khác của phòng.
 * ========================================================================== */

const S = {
  chi: [], dot: [], nap: [],
  options: { loaiChi: [], tinhTrang: [] },
  me: null, chuQuy: false, larkUrl: '',
  loc: { dot: '', loai: '', tinhTrang: '', thang: '', tim: '' },
  chon: new Set(),
  tab: 'so',              // so | thieu | dot
};

const $ = (s, g = document) => g.querySelector(s);
const $$ = (s, g = document) => [...g.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tien = (n) => (Number(n) || 0).toLocaleString('vi-VN');
const apiUrl = (p) => (location.pathname.replace(/\/+$/, '') + p).replace(/^\/\//, '/');

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 260); },
    kind === 'err' ? 5200 : 2600);
}

async function api(path, opts) {
  const r = await fetch(apiUrl(path), Object.assign(
    { headers: { 'Content-Type': 'application/json' } }, opts || {}));
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    if (!r.ok) throw new Error('Lỗi máy chủ ' + r.status);
    return r;
  }
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || ('Lỗi ' + r.status));
  return d;
}

/* ---------------- ngày ---------------- */
function ngayVN(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
}
function thangCua(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
const homNay = () => new Date().toISOString().slice(0, 10);

/* ---------------- đọc dữ liệu ---------------- */
async function taiLai(moi) {
  const d = await api('/api/meta' + (moi ? '?moi=1' : ''));
  S.chi = d.chi || [];
  S.dot = d.dot || [];
  S.nap = d.nap || [];
  S.options = d.options || S.options;
  S.me = d.me; S.chuQuy = !!d.chuQuy; S.larkUrl = d.larkUrl || '';
  S.chon.clear();
  ve();
}

/* Đợt đang dùng = đợt có tình trạng "Đang dùng"; không có thì lấy đợt còn tiền
 * nhiều nhất. Sổ quỹ luôn phải trả lời được "tiêu vào đâu bây giờ". */
function dotDangDung() {
  return S.dot.find((d) => d.tinhTrang === 'Đang dùng')
    || [...S.dot].sort((a, b) => b.conLai - a.conLai)[0] || null;
}

const tenDot = (id) => {
  const d = S.dot.find((x) => x.id === id);
  return d ? d.ma : '';
};

/** Khoản đã chi mà chưa có đủ chứng từ — cả tệp lẫn link cũ đều tính là có. */
function thieuChungTu(c) {
  if (c.tinhTrang === 'Chờ chi') return false;
  const coHoaDon = (c.hoaDon || []).length || String(c.linkCu || '').trim();
  const coUnc = (c.unc || []).length || String(c.linkUncCu || '').trim();
  return !coHoaDon || !coUnc;
}

function locChi() {
  const l = S.loc;
  const tim = l.tim.trim().toLowerCase();
  return S.chi.filter((c) => {
    if (l.dot && !(c.dot || []).includes(l.dot)) return false;
    if (l.loai && c.loai !== l.loai) return false;
    if (l.tinhTrang && c.tinhTrang !== l.tinhTrang) return false;
    if (l.thang && thangCua(c.ngayChi || c.ngayDeNghi) !== l.thang) return false;
    if (S.tab === 'thieu' && !thieuChungTu(c)) return false;
    if (tim) {
      const kho = [c.noiDung, c.maDieuHanh, c.maQuyetToan, c.ncc, c.soHoaDon, c.ghiChu]
        .join(' ').toLowerCase();
      if (!kho.includes(tim)) return false;
    }
    return true;
  }).sort((a, b) => String(b.ngayChi || b.ngayDeNghi || '').localeCompare(String(a.ngayChi || a.ngayDeNghi || '')));
}

/* ---------------- vẽ ---------------- */
function ve() {
  const dd = dotDangDung();
  $('#phuDe').textContent = (S.chuQuy ? 'Sổ quỹ · ' : 'Chỉ xem · ')
    + S.chi.length + ' khoản chi · ' + S.dot.length + ' đợt tạm ứng';

  $('#man').innerHTML = veTong(dd) + veLoc() + (S.tab === 'dot' ? veDot() : veBang());
  ganSuKien();
}

function veTong(dd) {
  const thangNay = thangCua(new Date().toISOString());
  const chiThang = S.chi.filter((c) => thangCua(c.ngayChi || c.ngayDeNghi) === thangNay)
    .reduce((a, c) => a + c.tien, 0);
  const soThieu = S.chi.filter(thieuChungTu).length;
  const chuaQuyetToan = S.chi.filter((c) => c.tinhTrang === 'Đã chi').length;

  return '<section class="tong">'
    + '<div class="o chinh">'
      + '<div class="nhan">Còn trong quỹ' + (dd ? ' · ' + esc(dd.ma) : '') + '</div>'
      + '<div class="so ' + (dd && dd.conLai < 0 ? 'am' : '') + '">'
        + (dd ? tien(dd.conLai) : '—') + '<span class="d">đ</span></div>'
      + (dd ? '<div class="mo">nạp ' + tien(dd.tongNap) + ' · đã chi ' + tien(dd.tongChi) + '</div>' : '')
    + '</div>'
    + '<div class="o"><div class="nhan">Chi tháng này</div><div class="so nho">' + tien(chiThang)
      + '<span class="d">đ</span></div></div>'
    + '<div class="o' + (soThieu ? ' canhbao' : '') + '" data-tab="thieu">'
      + '<div class="nhan">Thiếu chứng từ</div><div class="so nho">' + soThieu + '</div>'
      + '<div class="mo">' + (soThieu ? 'bấm để xem' : 'đủ cả') + '</div></div>'
    + '<div class="o"><div class="nhan">Chờ quyết toán</div><div class="so nho">' + chuaQuyetToan + '</div>'
      + '<div class="mo">đã chi, chưa gán mã</div></div>'
  + '</section>';
}

function veLoc() {
  const thangs = [...new Set(S.chi.map((c) => thangCua(c.ngayChi || c.ngayDeNghi)).filter(Boolean))]
    .sort().reverse();
  const opt = (ds, sel, rong) => '<option value="">' + rong + '</option>'
    + ds.map((x) => '<option value="' + esc(x.v != null ? x.v : x) + '"'
      + ((x.v != null ? x.v : x) === sel ? ' selected' : '') + '>'
      + esc(x.t != null ? x.t : x) + '</option>').join('');

  return '<section class="thanh">'
    + '<div class="tabs">'
      + ['so:Sổ quỹ', 'thieu:Thiếu chứng từ', 'dot:Đợt tạm ứng'].map((x) => {
        const [k, t] = x.split(':');
        return '<button class="tab' + (S.tab === k ? ' on' : '') + '" data-tab="' + k + '">' + t + '</button>';
      }).join('')
    + '</div>'
    + (S.tab === 'dot' ? '' :
      '<div class="loc">'
      + '<input id="lTim" placeholder="Tìm nội dung, mã điều hành, mã quyết toán…" value="' + esc(S.loc.tim) + '">'
      + '<select id="lDot">' + opt(S.dot.map((d) => ({ v: d.id, t: d.ma })), S.loc.dot, 'Mọi đợt') + '</select>'
      + '<select id="lThang">' + opt(thangs.map((m) => ({ v: m, t: 'Tháng ' + m.slice(5) + '/' + m.slice(0, 4) })), S.loc.thang, 'Mọi tháng') + '</select>'
      + '<select id="lLoai">' + opt(S.options.loaiChi, S.loc.loai, 'Mọi loại') + '</select>'
      + '<select id="lTT">' + opt(S.options.tinhTrang, S.loc.tinhTrang, 'Mọi tình trạng') + '</select>'
      + '</div>')
  + '</section>';
}

function veBang() {
  const ds = locChi();
  const tong = ds.reduce((a, c) => a + c.tien, 0);
  if (!ds.length) {
    return '<section class="bang"><div class="trong">'
      + (S.tab === 'thieu' ? 'Không khoản nào thiếu chứng từ.' : 'Không có khoản chi nào khớp bộ lọc.')
      + '</div></section>';
  }

  const dong = (c) => {
    const thieu = thieuChungTu(c);
    const tep = (arr, linkCu, nhan, key) => {
      const co = (arr || []).map((f) => '<a class="tep" target="_blank" href="'
        + apiUrl('/api/chi/' + c.id + '/tep/' + f.token + '/tai') + '">' + esc(nhan) + '</a>').join('');
      if (co) return co;
      if (String(linkCu || '').trim()) {
        return '<a class="tep cu" target="_blank" href="' + esc(linkCu) + '" title="Chứng từ cũ trên Google Drive">'
          + esc(nhan) + ' ↗</a>';
      }
      return S.chuQuy
        ? '<button class="tep thieu" data-taitep="' + c.id + '" data-o="' + key + '">+ ' + esc(nhan) + '</button>'
        : '<span class="tep thieu">— ' + esc(nhan) + '</span>';
    };
    return '<tr' + (thieu ? ' class="canhbao"' : '') + '>'
      + '<td class="chon">' + (S.chuQuy
        ? '<input type="checkbox" data-chon="' + c.id + '"' + (S.chon.has(c.id) ? ' checked' : '') + '>' : '') + '</td>'
      + '<td class="nd"><b>' + esc(c.noiDung || '(không tên)') + '</b>'
        + '<div class="phu2">' + esc(tenDot((c.dot || [])[0]))
        + (c.maDieuHanh ? ' · ' + esc(c.maDieuHanh) : '')
        + (c.maQuyetToan ? ' · <span class="qt">' + esc(c.maQuyetToan) + '</span>' : '') + '</div></td>'
      + '<td class="loai"><span class="the">' + esc(c.loai || '—') + '</span></td>'
      + '<td class="num">' + tien(c.tien) + '</td>'
      + '<td class="ngay">' + esc(ngayVN(c.ngayChi || c.ngayDeNghi)) + '</td>'
      + '<td class="ai">' + esc(((c.nguoi || [])[0] || {}).name || '') + '</td>'
      + '<td class="teps">' + tep(c.hoaDon, c.linkCu, 'Hoá đơn', 'hoaDon')
        + tep(c.unc, c.linkUncCu, 'UNC', 'unc') + '</td>'
      + '<td class="tt"><span class="badge ' + (c.tinhTrang === 'Đã quyết toán' ? 'xanh'
        : c.tinhTrang === 'Đã chi' ? 'vang' : 'xam') + '">' + esc(c.tinhTrang || '—') + '</span></td>'
      + '<td class="tacvu">' + (S.chuQuy
        ? '<button class="btn sm" data-sua="' + c.id + '">Sửa</button>' : '') + '</td>'
      + '</tr>';
  };

  return '<section class="bang">'
    + (S.chon.size ? veThanhChon() : '')
    + '<div class="cuon"><table><thead><tr>'
      + '<th class="chon">' + (S.chuQuy ? '<input type="checkbox" id="chonHet">' : '') + '</th>'
      + '<th>Nội dung</th><th>Loại</th><th class="num">Số tiền</th><th>Ngày chi</th>'
      + '<th>Người</th><th>Chứng từ</th><th>Tình trạng</th><th></th>'
    + '</tr></thead><tbody>' + ds.map(dong).join('') + '</tbody>'
    + '<tfoot><tr><td colspan="3">' + ds.length + ' khoản</td>'
      + '<td class="num">' + tien(tong) + '</td><td colspan="5"></td></tr></tfoot>'
    + '</table></div></section>';
}

function veThanhChon() {
  const ds = S.chi.filter((c) => S.chon.has(c.id));
  const tong = ds.reduce((a, c) => a + c.tien, 0);
  return '<div class="thanhchon">'
    + '<b>' + ds.length + ' khoản</b> · ' + tien(tong) + ' đ'
    + '<div class="sp"></div>'
    + '<button class="btn" data-bochon="1">Bỏ chọn</button>'
    + '<button class="btn primary" data-quyettoan="1">Quyết toán ' + ds.length + ' khoản</button>'
  + '</div>';
}

function veDot() {
  if (!S.dot.length) return '<section class="bang"><div class="trong">Chưa có đợt nào.</div></section>';
  const dong = (d) => {
    const lan = S.nap.filter((n) => (n.dot || []).includes(d.id));
    return '<tr>'
      + '<td class="nd"><b>' + esc(d.ma) + '</b><div class="phu2">'
        + esc(((d.nguoiGiu || [])[0] || {}).name || '') + (d.ngayMo ? ' · mở ' + ngayVN(d.ngayMo) : '') + '</div></td>'
      + '<td class="num">' + tien(d.tongNap) + '</td>'
      + '<td class="num">' + tien(d.tongChi) + '</td>'
      + '<td class="num ' + (d.conLai < 0 ? 'am' : 'duong') + '"><b>' + tien(d.conLai) + '</b></td>'
      + '<td>' + lan.length + ' lần nạp</td>'
      + '<td><span class="badge ' + (d.tinhTrang === 'Đang dùng' ? 'xanh' : 'xam') + '">'
        + esc(d.tinhTrang || '—') + '</span></td>'
      + '<td class="tacvu">' + (S.chuQuy
        ? '<button class="btn sm" data-napdot="' + d.id + '">Nạp tiền</button>' : '') + '</td>'
    + '</tr>';
  };
  return '<section class="bang"><div class="cuon"><table><thead><tr>'
    + '<th>Đợt</th><th class="num">Tổng nạp</th><th class="num">Đã chi</th><th class="num">Còn lại</th>'
    + '<th>Lần nạp</th><th>Tình trạng</th><th></th></tr></thead><tbody>'
    + S.dot.map(dong).join('') + '</tbody></table></div>'
    + (S.chuQuy ? '<div class="duoi"><button class="btn" id="btnDotMoi">+ Mở đợt tạm ứng mới</button></div>' : '')
  + '</section>';
}

/* ---------------- cửa sổ ---------------- */
function moModal(tieuDe, than, chan) {
  $('#mdTitle').textContent = tieuDe;
  $('#mdBody').innerHTML = than;
  $('#mdFoot').innerHTML = chan;
  $('#modal').classList.add('on');
}
const dongModal = () => $('#modal').classList.remove('on');

const o = (nhan, html, rong) => '<label class="o' + (rong ? ' rong' : '') + '">'
  + '<span>' + esc(nhan) + '</span>' + html + '</label>';
const chon = (id, ds, gt) => '<select id="' + id + '">'
  + ds.map((x) => '<option' + (x === gt ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';

function moKhaiChi(sua) {
  const c = sua ? S.chi.find((x) => x.id === sua) : null;
  const dd = dotDangDung();
  const dotId = c ? (c.dot || [])[0] : (dd && dd.id);

  moModal(c ? 'Sửa khoản chi' : 'Khai khoản chi',
    '<div class="form">'
    + o('Nội dung chi', '<input id="fNoiDung" value="' + esc(c ? c.noiDung : '') + '" placeholder="VD: Xanh SM đi Vinwonders tác nghiệp">', true)
    + o('Số tiền (đ)', '<input id="fTien" type="number" min="0" step="1000" value="' + (c ? c.tien : '') + '">')
    + o('Loại chi', chon('fLoai', S.options.loaiChi, c ? c.loai : 'Khác'))
    + o('Ngày chi', '<input id="fNgay" type="date" value="'
        + (c && c.ngayChi ? new Date(c.ngayChi).toISOString().slice(0, 10) : homNay()) + '">')
    + o('Đợt tạm ứng', '<select id="fDot">'
        + S.dot.map((d) => '<option value="' + d.id + '"' + (d.id === dotId ? ' selected' : '') + '>'
          + esc(d.ma) + ' · còn ' + tien(d.conLai) + '</option>').join('') + '</select>')
    + o('Tình trạng', chon('fTT', S.options.tinhTrang, c ? c.tinhTrang : 'Đã chi'))
    + o('Mã điều hành', '<input id="fMaDH" value="' + esc(c ? c.maDieuHanh : '') + '" placeholder="SG…">')
    + o('Số hoá đơn', '<input id="fSoHD" value="' + esc(c ? c.soHoaDon : '') + '">')
    + o('Nhà cung cấp trên TW', '<input id="fNCC" value="' + esc(c ? c.ncc : '') + '">')
    + o('Thông tin chuyển khoản', '<input id="fCK" value="' + esc(c ? c.chuyenKhoan : '') + '">')
    + o('Ghi chú', '<input id="fGhiChu" value="' + esc(c ? c.ghiChu : '') + '">', true)
    + (c ? '' : '<div class="nhac">Khai xong rồi đính hoá đơn và UNC ngay ở dòng của khoản — '
        + 'sổ cũ thiếu UNC ở 67/162 dòng vì để đó rồi quên.</div>')
    + '</div>',
    (c ? '<button class="btn nguyhiem" data-xoa="' + c.id + '">Xoá khoản này</button>' : '')
    + '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>'
    + '<button class="btn primary" id="btnLuuChi" data-id="' + (c ? c.id : '') + '">'
    + (c ? 'Lưu' : 'Ghi vào sổ') + '</button>');
  setTimeout(() => $('#fNoiDung') && $('#fNoiDung').focus(), 30);
}

function moNapQuy(dotId) {
  const dd = dotId ? S.dot.find((d) => d.id === dotId) : dotDangDung();
  moModal('Nạp tiền vào quỹ',
    '<div class="form">'
    + o('Đợt tạm ứng', '<select id="nDot">'
      + S.dot.map((d) => '<option value="' + d.id + '"' + (dd && d.id === dd.id ? ' selected' : '') + '>'
        + esc(d.ma) + ' · còn ' + tien(d.conLai) + '</option>').join('') + '</select>')
    + o('Số tiền (đ)', '<input id="nTien" type="number" min="0" step="100000" placeholder="10000000">')
    + o('Ngày nạp', '<input id="nNgay" type="date" value="' + homNay() + '">')
    + o('Nội dung', '<input id="nNoiDung" placeholder="Tạm ứng ngày …">', true)
    + '<div class="nhac">Số dư của đợt tự cộng lại ngay: <b>tổng nạp − tổng chi</b>. '
      + 'Không có cột Tồn gõ tay như sheet cũ nên không thể lệch.</div>'
    + '</div>',
    '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>'
    + '<button class="btn primary" id="btnLuuNap">Ghi vào quỹ</button>');
}

function moDotMoi() {
  moModal('Mở đợt tạm ứng mới',
    '<div class="form">'
    + o('Mã phiếu chi', '<input id="dMa" placeholder="PC17xxx hoặc THÁNG 10">', true)
    + o('Ngày mở', '<input id="dNgay" type="date" value="' + homNay() + '">')
    + o('Ghi chú', '<input id="dGhiChu">')
    + '<div class="nhac">Đợt cũ nên chuyển sang <b>Đã chốt</b> sau khi quyết toán xong, '
      + 'để màn hình đầu luôn chỉ vào đúng quỹ đang tiêu.</div>'
    + '</div>',
    '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>'
    + '<button class="btn primary" id="btnLuuDot">Mở đợt</button>');
}

function moQuyetToan() {
  const ds = S.chi.filter((c) => S.chon.has(c.id));
  const tong = ds.reduce((a, c) => a + c.tien, 0);
  const thieu = ds.filter(thieuChungTu);
  moModal('Quyết toán ' + ds.length + ' khoản',
    '<div class="form">'
    + '<div class="tomtat"><b>' + ds.length + ' khoản</b> · tổng <b>' + tien(tong) + ' đ</b></div>'
    + (thieu.length
      ? '<div class="nhac canhbao"><b>' + thieu.length + ' khoản chưa đủ chứng từ.</b> '
        + 'Quyết toán vẫn chạy, nhưng kế toán sẽ hỏi lại đúng mấy khoản này: '
        + esc(thieu.slice(0, 3).map((c) => c.noiDung).join(' · '))
        + (thieu.length > 3 ? '…' : '') + '</div>'
      : '<div class="nhac ok">Cả ' + ds.length + ' khoản đều đủ hoá đơn và UNC.</div>')
    + o('Mã quyết toán', '<input id="qMa" placeholder="QTTU31/LVH">', true)
    + '<div class="nhac">Mã này ghi vào cả ' + ds.length + ' khoản và chuyển tình trạng sang '
      + '<b>Đã quyết toán</b>. Sửa lại được bằng cách quyết toán lần nữa với mã khác.</div>'
    + '</div>',
    '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>'
    + '<button class="btn primary" id="btnLuuQT">Gán mã cho ' + ds.length + ' khoản</button>');
  setTimeout(() => $('#qMa') && $('#qMa').focus(), 30);
}

/* ---------------- tải tệp ---------------- */
function taiTep(id, key) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*,application/pdf';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    toast('Đang tải ' + f.name + '…');
    try {
      await api('/api/chi/' + id + '/tep/' + key + '?name=' + encodeURIComponent(f.name),
        { method: 'POST', headers: {}, body: f });
      toast('Đã đính ' + (key === 'unc' ? 'UNC' : 'hoá đơn'), 'ok');
      await taiLai(true);
    } catch (e) { toast(e.message, 'err'); }
  };
  inp.click();
}

/* ---------------- sự kiện ---------------- */
function ganSuKien() {
  const g = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };
  g('#lTim', 'input', (e) => { S.loc.tim = e.target.value; veLai(); });
  g('#lDot', 'change', (e) => { S.loc.dot = e.target.value; ve(); });
  g('#lThang', 'change', (e) => { S.loc.thang = e.target.value; ve(); });
  g('#lLoai', 'change', (e) => { S.loc.loai = e.target.value; ve(); });
  g('#lTT', 'change', (e) => { S.loc.tinhTrang = e.target.value; ve(); });
  g('#chonHet', 'change', (e) => {
    const ds = locChi();
    if (e.target.checked) ds.forEach((c) => S.chon.add(c.id));
    else ds.forEach((c) => S.chon.delete(c.id));
    ve();
  });
  g('#btnDotMoi', 'click', moDotMoi);
}

/* Gõ tìm kiếm thì chỉ vẽ lại phần bảng, giữ nguyên con trỏ trong ô tìm. */
let henVe = null;
function veLai() {
  clearTimeout(henVe);
  henVe = setTimeout(() => {
    const b = $('.bang');
    if (b) b.outerHTML = S.tab === 'dot' ? veDot() : veBang();
  }, 160);
}

document.addEventListener('click', async (e) => {
  const T = e.target;

  if (T.closest('[data-close]') || T.id === 'modal') return dongModal();
  if (T.closest('#btnTaiLai')) { toast('Đang đọc lại…'); return taiLai(true).then(() => toast('Xong', 'ok')); }
  if (T.closest('#btnLark')) return window.open(S.larkUrl, '_blank');
  if (T.closest('#btnChiMoi')) return S.chuQuy ? moKhaiChi() : toast('Bạn đang xem ở chế độ chỉ đọc.', 'err');
  if (T.closest('#btnNap')) return S.chuQuy ? moNapQuy() : toast('Bạn đang xem ở chế độ chỉ đọc.', 'err');

  const tab = T.closest('[data-tab]');
  if (tab) { S.tab = tab.dataset.tab; S.chon.clear(); return ve(); }

  const sua = T.closest('[data-sua]');
  if (sua) return moKhaiChi(sua.dataset.sua);

  const tep = T.closest('[data-taitep]');
  if (tep) return taiTep(tep.dataset.taitep, tep.dataset.o);

  const napDot = T.closest('[data-napdot]');
  if (napDot) return moNapQuy(napDot.dataset.napdot);

  if (T.closest('[data-bochon]')) { S.chon.clear(); return ve(); }
  if (T.closest('[data-quyettoan]')) return moQuyetToan();

  const xoa = T.closest('[data-xoa]');
  if (xoa) {
    const c = S.chi.find((x) => x.id === xoa.dataset.xoa);
    if (!confirm('Xoá khoản "' + (c ? c.noiDung : '') + '"?\n\nSố dư của đợt sẽ tự tính lại.')) return;
    try {
      await api('/api/chi/' + xoa.dataset.xoa, { method: 'DELETE' });
      dongModal(); toast('Đã xoá', 'ok'); await taiLai(true);
    } catch (err) { toast(err.message, 'err'); }
    return;
  }

  /* ---- lưu khoản chi ---- */
  if (T.closest('#btnLuuChi')) {
    const id = T.closest('#btnLuuChi').dataset.id;
    const body = {
      noiDung: $('#fNoiDung').value.trim(),
      tien: Number($('#fTien').value || 0),
      loai: $('#fLoai').value,
      ngayChi: $('#fNgay').value ? $('#fNgay').value + 'T00:00:00+07:00' : null,
      dot: $('#fDot').value ? [$('#fDot').value] : [],
      tinhTrang: $('#fTT').value,
      maDieuHanh: $('#fMaDH').value.trim(),
      soHoaDon: $('#fSoHD').value.trim(),
      ncc: $('#fNCC').value.trim(),
      chuyenKhoan: $('#fCK').value.trim(),
      ghiChu: $('#fGhiChu').value.trim(),
    };
    if (!body.noiDung) return toast('Phải ghi nội dung chi.', 'err');
    if (!(body.tien > 0)) return toast('Số tiền phải lớn hơn 0.', 'err');
    try {
      if (id) await api('/api/chi/' + id, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/api/chi', { method: 'POST', body: JSON.stringify(body) });
      dongModal();
      toast(id ? 'Đã lưu' : 'Đã ghi vào sổ', 'ok');
      await taiLai(true);
    } catch (err) { toast(err.message, 'err'); }
    return;
  }

  /* ---- nạp quỹ ---- */
  if (T.closest('#btnLuuNap')) {
    const body = {
      dot: $('#nDot').value ? [$('#nDot').value] : [],
      tien: Number($('#nTien').value || 0),
      ngay: $('#nNgay').value ? $('#nNgay').value + 'T00:00:00+07:00' : null,
      noiDung: $('#nNoiDung').value.trim(),
      loai: 'Nạp thêm',
    };
    if (!(body.tien > 0)) return toast('Số tiền nạp phải lớn hơn 0.', 'err');
    try {
      await api('/api/nap', { method: 'POST', body: JSON.stringify(body) });
      dongModal(); toast('Đã ghi ' + tien(body.tien) + ' đ vào quỹ', 'ok'); await taiLai(true);
    } catch (err) { toast(err.message, 'err'); }
    return;
  }

  /* ---- mở đợt ---- */
  if (T.closest('#btnLuuDot')) {
    const body = {
      ma: $('#dMa').value.trim(),
      ngayMo: $('#dNgay').value ? $('#dNgay').value + 'T00:00:00+07:00' : null,
      ghiChu: $('#dGhiChu').value.trim(),
      tinhTrang: 'Đang dùng',
    };
    if (!body.ma) return toast('Phải có mã phiếu chi.', 'err');
    try {
      await api('/api/dot', { method: 'POST', body: JSON.stringify(body) });
      dongModal(); toast('Đã mở đợt ' + body.ma, 'ok'); await taiLai(true);
    } catch (err) { toast(err.message, 'err'); }
    return;
  }

  /* ---- quyết toán lô ---- */
  if (T.closest('#btnLuuQT')) {
    const ma = $('#qMa').value.trim();
    if (!ma) return toast('Phải nhập mã quyết toán.', 'err');
    try {
      const r = await api('/api/quyet-toan', {
        method: 'POST', body: JSON.stringify({ ids: [...S.chon], ma }),
      });
      dongModal(); toast('Đã quyết toán ' + r.so + ' khoản với mã ' + ma, 'ok');
      S.chon.clear(); await taiLai(true);
    } catch (err) { toast(err.message, 'err'); }
    return;
  }
});

document.addEventListener('change', (e) => {
  const c = e.target.closest('[data-chon]');
  if (!c) return;
  if (c.checked) S.chon.add(c.dataset.chon); else S.chon.delete(c.dataset.chon);
  const t = $('.thanhchon');
  if (S.chon.size && t) t.outerHTML = veThanhChon();
  else ve();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') dongModal();
});

taiLai().catch((e) => {
  $('#man').innerHTML = '<div class="dangTai err">Không đọc được sổ quỹ: ' + esc(e.message) + '</div>';
});
