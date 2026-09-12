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
  chi: [], dot: [], nap: [], quy: { tongUng: 0, tongChi: 0, conLai: 0, soLanUng: 0 },
  options: { loaiChi: [], tinhTrang: [] },
  me: null, chuQuy: false, larkUrl: '',
  loc: { loai: '', tinhTrang: '', thang: '', tim: '' },
  chon: new Set(),
  tab: 'so',              // so | thieu | ung
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
  S.quy = d.quy || S.quy;
  S.options = d.options || S.options;
  S.me = d.me; S.chuQuy = !!d.chuQuy; S.larkUrl = d.larkUrl || '';
  S.chon.clear();
  ve();
}

/* Các lần ứng tiền, mới nhất trước. "Chuyển từ kỳ trước" không phải tiền công
 * ty đưa thêm — nó là tồn của kỳ trước, đếm vào là tính trùng. */
const LAN_CHUYEN_TIEP = 'Chuyển từ kỳ trước';
const cacLanUng = () => S.nap.filter((n) => n.loai !== LAN_CHUYEN_TIEP)
  .sort((a, b) => String(b.ngay || '').localeCompare(String(a.ngay || '')));

/**
 * KHOẢN NÀO THẬT SỰ CẦN BỔ SUNG CHỨNG TỪ
 *
 * Luật đầu tiên tôi viết là "không đủ cả hoá đơn LẪN UNC = thiếu", và nó gắn cờ
 * 68/162 khoản — trong đó 67 khoản kế toán đã nhận và đóng sổ từ lâu. Một cảnh
 * báo réo sai 67 lần thì lần thứ 68 cũng không ai nhìn.
 *
 * Luật đúng theo cách kế toán thật sự làm việc:
 *
 *   · ĐÃ QUYẾT TOÁN thì thôi — có mã QTTU nghĩa là kế toán đã kiểm và chấp nhận.
 *     Đòi thêm chứng từ của khoản đã đóng là vô nghĩa.
 *   · "Không cần chứng từ" là một câu trả lời hợp lệ, không phải chỗ trống. Chi
 *     nhỏ lẻ, hỗ trợ tiền ăn thường không có hoá đơn VAT; hoá đơn tay hoặc ảnh
 *     là đủ và kế toán vẫn duyệt.
 *   · Chỉ cần MỘT bằng chứng, không đòi cả hai. Trả tiền mặt thì không bao giờ
 *     có UNC; mua ở chỗ không xuất hoá đơn thì chỉ có UNC. Đòi đủ cả hai là bịa
 *     ra một chuẩn mà chính kế toán không đặt.
 */
function thieuChungTu(c) {
  if (c.tinhTrang === 'Chờ chi') return false;
  if (String(c.maQuyetToan || '').trim()) return false;
  if (c.tinhTrang === 'Đã quyết toán') return false;
  if (c.chungTu === 'Không cần chứng từ') return false;
  const coHoaDon = (c.hoaDon || []).length || String(c.linkCu || '').trim();
  const coUnc = (c.unc || []).length || String(c.linkUncCu || '').trim();
  return !coHoaDon && !coUnc;
}

function locChi() {
  const l = S.loc;
  const tim = l.tim.trim().toLowerCase();
  return S.chi.filter((c) => {
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
  $('#phuDe').textContent = (S.chuQuy ? 'Sổ quỹ · ' : 'Chỉ xem · ')
    + S.chi.length + ' khoản chi · ' + S.quy.soLanUng + ' lần ứng tiền';

  $('#man').innerHTML = veTong() + veLoc() + (S.tab === 'ung' ? veUng() : veBang());
  ganSuKien();
}

function veTong() {
  const thangNay = thangCua(new Date().toISOString());
  const chiThang = S.chi.filter((c) => thangCua(c.ngayChi || c.ngayDeNghi) === thangNay)
    .reduce((a, c) => a + c.tien, 0);
  const soThieu = S.chi.filter(thieuChungTu).length;
  const chuaQuyetToan = S.chi.filter((c) => c.tinhTrang === 'Đã chi').length;

  /* MỘT con số cho cả quỹ. Các lần ứng chỉ là mốc nhận tiền, không phải sáu
   * túi riêng — nên không chia số dư theo đợt nữa. */
  return '<section class="tong">'
    + '<div class="o chinh">'
      + '<div class="nhan">Còn trong quỹ</div>'
      + '<div class="so ' + (S.quy.conLai < 0 ? 'am' : '') + '">'
        + tien(S.quy.conLai) + '<span class="d">đ</span></div>'
      + '<div class="mo">đã ứng ' + tien(S.quy.tongUng) + ' · đã chi ' + tien(S.quy.tongChi) + '</div>'
    + '</div>'
    + '<div class="o"><div class="nhan">Chi tháng này</div><div class="so nho">' + tien(chiThang)
      + '<span class="d">đ</span></div></div>'
    + '<div class="o' + (soThieu ? ' canhbao' : '') + '" data-tab="thieu">'
      + '<div class="nhan">Cần bổ sung chứng từ</div><div class="so nho">' + soThieu + '</div>'
      + '<div class="mo">' + (soThieu ? 'bấm để xem' : 'không còn khoản nào') + '</div></div>'
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
      + ['so:Sổ quỹ', 'thieu:Cần bổ sung chứng từ', 'ung:Các lần ứng tiền'].map((x) => {
        const [k, t] = x.split(':');
        return '<button class="tab' + (S.tab === k ? ' on' : '') + '" data-tab="' + k + '">' + t + '</button>';
      }).join('')
    + '</div>'
    + (S.tab === 'ung' ? '' :
      '<div class="loc">'
      + '<input id="lTim" placeholder="Tìm nội dung, mã điều hành, mã quyết toán…" value="' + esc(S.loc.tim) + '">'
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
    const dv = tachDon(c.maDon);
    const tep = (arr, linkCu, nhan, key) => {
      /* Chip chứng từ mở XEM tại chỗ, kèm một chip ⇩ để tải về. Trước đây nó chỉ
       * là liên kết bắn sang tab mới, mà tab mới hoặc bị chặn hoặc lạc khỏi app
       * — anh Hùng báo 12/09/2026 "ấn vào xem không được". */
      const co = (arr || []).map((f, i) => {
        const ten = f.name || (nhan + (arr.length > 1 ? ' ' + (i + 1) : ''));
        return '<span class="tep" data-xem="' + esc(f.token) + '" data-rec="' + esc(c.id) +
          '" data-ten="' + esc(ten) + '" title="' + esc(ten) + '">' + esc(nhan) +
          (arr.length > 1 ? ' ' + (i + 1) : '') + '</span>' +
          '<a class="tep tai" title="Tải ' + esc(ten) + ' về máy" data-tai="1" data-rec="'
          + esc(c.id) + '" data-token="' + esc(f.token) + '" data-ten="' + esc(ten) + '">⇩</a>';
      }).join('');
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
        + '<div class="phu2">' + [
          /* Mã đơn Tourwell: bấm được, mở thẳng đơn. Kế toán đối chiếu theo mã
           * này nên nó phải nổi hơn mấy thứ khác trong dòng phụ. */
          dv ? (dv.link
            ? '<a class="ma-don" target="_blank" href="' + esc(dv.link) + '">' + esc(dv.ma) + '</a>'
            : '<span class="ma-don">' + esc(dv.ma) + '</span>') : '',
          c.maDieuHanh
            ? esc(c.maDieuHanh)
            : (S.chuQuy ? '<button class="ma-them" data-gansg="' + c.id + '">+ mã điều hành</button>' : ''),
          c.maQuyetToan ? '<span class="qt">' + esc(c.maQuyetToan) + '</span>' : '',
        ].filter(Boolean).join(' · ') + '</div></td>'
      + '<td class="loai"><span class="the">' + esc(c.loai || '—') + '</span></td>'
      + '<td class="num">' + tien(c.tien) + '</td>'
      + '<td class="ngay">' + esc(ngayVN(c.ngayChi || c.ngayDeNghi)) + '</td>'
      + '<td class="ai">' + esc(((c.nguoi || [])[0] || {}).name || '') + '</td>'
      + '<td class="teps">' + tep(c.hoaDon, c.linkCu, 'Hoá đơn', 'hoaDon')
        + tep(c.unc, c.linkUncCu, 'UNC', 'unc')
        + (c.chungTu === 'Không cần chứng từ'
          ? '<span class="the" title="Kế toán đã đồng ý không cần chứng từ">không cần</span>'
          : c.chungTu === 'Hoá đơn tay / ảnh'
            ? '<span class="the" title="Hoá đơn tay hoặc ảnh — kế toán chấp nhận">tay/ảnh</span>' : '')
        + '</td>'
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

/**
 * CÁC LẦN ỨNG TIỀN — không phải "các cục tiền".
 *
 * Mã phiếu chi PC… chỉ là chứng từ của từng lần công ty đưa tiền; tiêu thì tiêu
 * từ một quỹ chung. Nên bảng này là một cuốn nhật ký nhận tiền, không có cột
 * "còn lại của đợt" — số dư chỉ có một, nằm ở đầu trang.
 *
 * Dòng "Chuyển từ kỳ trước" cố ý hiện mờ và KHÔNG cộng vào tổng: nó là tồn của
 * kỳ trước, đếm vào là tính trùng 11.194.600 đ.
 */
function veUng() {
  if (!S.nap.length) return '<section class="bang"><div class="trong">Chưa có lần ứng nào.</div></section>';
  const ds = [...S.nap].sort((a, b) => String(b.ngay || '').localeCompare(String(a.ngay || '')));

  const dong = (n) => {
    const chuyen = n.loai === LAN_CHUYEN_TIEP;
    return '<tr' + (chuyen ? ' class="mo"' : '') + '>'
      + '<td class="nd"><b>' + esc(n.noiDung || n.loai || '(không tên)') + '</b>'
        + (n.ghiChu ? '<div class="phu2">' + esc(n.ghiChu) + '</div>' : '') + '</td>'
      + '<td class="num' + (chuyen ? '' : ' duong') + '">' + (chuyen ? '' : '+ ') + tien(n.tien) + '</td>'
      + '<td class="ngay">' + esc(ngayVN(n.ngay)) + '</td>'
      + '<td><span class="badge ' + (chuyen ? 'xam' : 'xanh') + '">' + esc(n.loai || '—') + '</span></td>'
      + '<td class="phu2">' + (chuyen ? 'không tính vào tiền công ty đưa' : '') + '</td>'
    + '</tr>';
  };

  return '<section class="bang"><div class="cuon"><table><thead><tr>'
    + '<th>Nội dung</th><th class="num">Số tiền</th><th>Ngày</th><th>Loại</th><th></th>'
    + '</tr></thead><tbody>' + ds.map(dong).join('') + '</tbody>'
    + '<tfoot><tr><td>Công ty đã ứng ' + S.quy.soLanUng + ' lần</td>'
      + '<td class="num">' + tien(S.quy.tongUng) + '</td><td colspan="3"></td></tr></tfoot>'
    + '</table></div>'
    + (S.chuQuy ? '<div class="duoi"><button class="btn" id="btnNap2">+ Ghi một lần ứng tiền</button></div>' : '')
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

/* ============ xem chứng từ ============
 * Hoá đơn và UNC là thứ người ta phải NHÌN mới đối chiếu được. Trước đây mỗi
 * chứng từ chỉ là một liên kết bắn sang tab mới; anh Hùng báo 12/09/2026 bấm vào
 * "xem không được". Giờ mở ngay tại chỗ, nút Tải xuống đứng riêng.
 * HEIC không trình duyệt nào mở được (ảnh iPhone hay dính đuôi này) nên không
 * nhận là xem được — đưa người ta một khung trắng còn tệ hơn là bảo tải về.
 */
const laAnh = (n) => /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(n || '');
const laPdf = (n) => /\.pdf$/i.test(n || '');
const laChu = (n) => /\.(txt|csv|md|log)$/i.test(n || '');
const xemDuocTep = (n) => laAnh(n) || laPdf(n) || laChu(n);

const urlTep = (recId, token, tai) =>
  apiUrl('/api/chi/' + recId + '/tep/' + token + '/tai' + (tai ? '?tai=1' : ''));

/* Chứng từ được LẤY VỀ bằng fetch rồi mới dựng, chứ không gán thẳng URL vào
 * <img>. Khi máy chủ trả lỗi (hay gặp nhất: app Lark chưa được cấp quyền tệp nên
 * bản online không tải được đính kèm), <img src> chỉ hiện một ô vỡ và <a
 * download> thì trình duyệt báo "Site wasn't available" — không ai biết vì sao.
 * Anh Hùng gặp đúng cảnh đó 12/09/2026. Lấy bằng fetch thì đọc được câu lỗi máy
 * chủ viết ra và in thẳng lên màn hình. */
let xtUrl = null;                  // object URL đang mở, phải thu hồi khi đóng

async function layTep(recId, token) {
  const r = await fetch(urlTep(recId, token));
  if (!r.ok) {
    let lyDo = 'Máy chủ trả lỗi ' + r.status;
    try { const d = await r.json(); if (d && d.error) lyDo = d.error; } catch (_) {}
    throw new Error(lyDo);
  }
  return r.blob();
}

async function moXemTep(recId, token, ten) {
  $('#xtTen').textContent = ten || 'chứng từ';
  const tai = $('#xtTai');
  tai.removeAttribute('href');
  tai.setAttribute('data-tai', '1');
  tai.dataset.rec = recId;
  tai.dataset.token = token;
  tai.dataset.ten = ten || '';
  $('#xtThan').innerHTML = '<div class="xt-khong"><div class="ic">ĐANG MỞ</div></div>';
  $('#xemTep').classList.add('on');

  if (!xemDuocTep(ten)) {
    $('#xtThan').innerHTML = '<div class="xt-khong"><div class="ic">TỆP</div>' +
      '<div>Kiểu tệp này không xem trực tiếp được.</div>' +
      '<a class="btn primary" data-tai="1" data-rec="' + esc(recId) + '" data-token="' +
      esc(token) + '" data-ten="' + esc(ten || '') + '">Tải về để mở</a></div>';
    return;
  }

  try {
    const blob = await layTep(recId, token);
    if (xtUrl) URL.revokeObjectURL(xtUrl);
    xtUrl = URL.createObjectURL(blob);
    $('#xtThan').innerHTML = laAnh(ten)
      ? '<img src="' + xtUrl + '" alt="">'
      : '<iframe src="' + xtUrl + '"></iframe>';
  } catch (e) {
    $('#xtThan').innerHTML = '<div class="xt-khong"><div class="ic">KHÔNG MỞ ĐƯỢC</div>' +
      '<div>' + esc(e.message) + '</div></div>';
  }
}

/* Tải cũng đi bằng fetch, vì lý do y hệt: hỏng thì nói được hỏng cái gì.
 * Chứng từ ở đây là hoá đơn và ảnh chuyển khoản, không có tệp nặng. */
async function taiTepVe(recId, token, ten) {
  try {
    const blob = await layTep(recId, token);
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = ten || 'chung-tu';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  } catch (e) {
    toast('Không tải được "' + (ten || 'tệp') + '": ' + e.message, 'err');
  }
}

function dongXemTep() {
  $('#xemTep').classList.remove('on');
  $('#xtThan').innerHTML = '';
  if (xtUrl) { URL.revokeObjectURL(xtUrl); xtUrl = null; }
}

const o = (nhan, html, rong) => '<label class="o' + (rong ? ' rong' : '') + '">'
  + '<span>' + esc(nhan) + '</span>' + html + '</label>';
const chon = (id, ds, gt) => '<select id="' + id + '">'
  + ds.map((x) => '<option' + (x === gt ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';

function moKhaiChi(sua) {
  const c = sua ? S.chi.find((x) => x.id === sua) : null;

  moModal(c ? 'Sửa khoản chi' : 'Khai khoản chi',
    '<div class="form">'
    + o('Nội dung chi', '<input id="fNoiDung" value="' + esc(c ? c.noiDung : '') + '" placeholder="VD: Xanh SM đi Vinwonders tác nghiệp">', true)
    + o('Số tiền (đ)', '<input id="fTien" type="number" min="0" step="1000" value="' + (c ? c.tien : '') + '">')
    + o('Loại chi', chon('fLoai', S.options.loaiChi, c ? c.loai : 'Khác'))
    + o('Ngày chi', '<input id="fNgay" type="date" value="'
        + (c && c.ngayChi ? new Date(c.ngayChi).toISOString().slice(0, 10) : homNay()) + '">')
    + o('Tình trạng', chon('fTT', S.options.tinhTrang, c ? c.tinhTrang : 'Đã chi'))
    + o('Mã điều hành', '<input id="fMaDH" value="' + esc(c ? c.maDieuHanh : '') + '" placeholder="SG…">')
    + o('Chứng từ', '<select id="fChungTu"><option value="">— chưa xác định —</option>'
        + (S.options.chungTu || []).map((x) => '<option' + (c && c.chungTu === x ? ' selected' : '')
          + '>' + esc(x) + '</option>').join('') + '</select>')
    + o('Số hoá đơn', '<input id="fSoHD" value="' + esc(c ? c.soHoaDon : '') + '">')
    + o('Mã số thuế NCC', '<input id="fMST" value="' + esc(c ? c.mst : '') + '" placeholder="kế toán kiểm MST">')
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

function moNapQuy() {
  moModal('Ghi một lần ứng tiền',
    '<div class="form">'
    + o('Số tiền (đ)', '<input id="nTien" type="number" min="0" step="100000" placeholder="10000000">')
    + o('Ngày nhận', '<input id="nNgay" type="date" value="' + homNay() + '">')
    + o('Nội dung', '<input id="nNoiDung" placeholder="Tạm ứng đợt tháng 10 · phiếu chi PC…">', true)
    + '<div class="nhac">Quỹ là <b>một cục</b>: số dư đầu trang cộng mọi lần ứng rồi trừ mọi khoản chi. '
      + 'Mã phiếu chi ghi vào ô Nội dung để đối chiếu với kế toán, không phải để chia tiền thành nhiều túi.</div>'
    + '</div>',
    '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>'
    + '<button class="btn primary" id="btnLuuNap">Ghi vào quỹ</button>');
  setTimeout(() => $('#nTien') && $('#nTien').focus(), 30);
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

/**
 * KẾT QUẢ TẠO ĐƠN TOURWELL
 *
 * Cửa sổ này tồn tại vì Open API chỉ làm được nửa quy trình: đơn đã có, dòng
 * chi phí Quỹ Marketing đã có, nhưng đơn đang ở "Đang xử lý" — chưa chuyển
 * thành công, chưa gửi điều hành. Đóng lại mà không kê ra thì người khai tưởng
 * xong, và tháng sau kế toán mới phát hiện đơn treo.
 *
 * Năm việc dưới đây là phần Tourwell KHÔNG mở API; phần gõ số — chỗ dễ sai
 * nhất — máy đã làm.
 */
function moKetQuaTourwell(tw, khoan) {
  if (!tw || (tw.bo && tw.bo !== 'da-co')) return;

  if (tw.loi && !tw.ma) {
    moModal('Chưa tạo được đơn Tourwell',
      '<div class="tw-hop">'
      + '<p><b>Khoản chi đã ghi vào sổ quỹ</b> — phần đó không sao.</p>'
      + '<div class="nhac canhbao">' + esc(tw.loi) + '</div>'
      + '<p class="nho">Tạo tay trên Tourwell như cũ, hoặc sửa xong thì xoá ô '
      + '<b>Mã đơn Tourwell</b> của khoản này rồi khai lại.</p></div>',
      '<div class="sp"></div><button class="btn" data-close="1">Đóng</button>');
    return;
  }

  const viec = [
    'Bấm <b>Chuyển thành công</b> ở góc trên phải',
    'Bấm <b>Xác nhận chuyển thành công</b>',
    'Tải <b>hoá đơn + UNC</b> vào ô Tệp đính kèm',
    'Vào <b>Mã điều hành</b> → <b>Nhận điều hành</b> → <b>Đồng ý</b>',
    'Bấm <b>Hoàn thành</b>',
  ];

  moModal('Đã tạo đơn Tourwell',
    '<div class="tw-hop">'
    + '<div class="tw-ma">' + esc(tw.ma) + '</div>'
    + '<div class="nho">' + tien(tw.tien) + ' đ · Quỹ Marketing · VAT 8% đã gồm'
      + (khoan && khoan.noiDung ? ' · ' + esc(khoan.noiDung) : '') + '</div>'
    + (tw.dayDu === false
      ? '<div class="nhac canhbao">Đơn đã tạo nhưng dòng chi phí chưa vào: ' + esc(tw.loi || '')
        + '<br>Vào đơn thêm tay ở mục <b>Sửa giá net</b>.</div>'
      : '<div class="nhac ok">✔ Dòng chi phí Quỹ Marketing đã vào — điều hành thấy sẵn, '
        + 'và khoản này sẽ hiện trong lịch sử chi của nhà cung cấp Quỹ Marketing.</div>')
    + '<div class="tw-con">Còn ' + viec.length + ' việc phải bấm tay trên Tourwell '
      + '<span class="nho">(API không làm được mấy bước này)</span></div>'
    + '<ol class="tw-ds">' + viec.map((v) => '<li>' + v + '</li>').join('') + '</ol>'
    + (tw.loiGhiBase
      ? '<div class="nhac canhbao">Chưa ghi được mã đơn vào sổ: ' + esc(tw.loiGhiBase)
        + '<br>Lưu mã <b>' + esc(tw.ma) + '</b> lại, kẻo lần sửa sau tạo thêm đơn nữa.</div>'
      : '')
    + '</div>',
    '<a class="btn primary" target="_blank" href="' + esc(tw.link) + '">Mở đơn trên Tourwell</a>'
    + '<div class="sp"></div><button class="btn" data-close="1">Để sau</button>');
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
  g('#lThang', 'change', (e) => { S.loc.thang = e.target.value; ve(); });
  g('#lLoai', 'change', (e) => { S.loc.loai = e.target.value; ve(); });
  g('#lTT', 'change', (e) => { S.loc.tinhTrang = e.target.value; ve(); });
  g('#chonHet', 'change', (e) => {
    const ds = locChi();
    if (e.target.checked) ds.forEach((c) => S.chon.add(c.id));
    else ds.forEach((c) => S.chon.delete(c.id));
    ve();
  });
  g('#btnNap2', 'click', () => moNapQuy());
}

/* Gõ tìm kiếm thì chỉ vẽ lại phần bảng, giữ nguyên con trỏ trong ô tìm. */
let henVe = null;
function veLai() {
  clearTimeout(henVe);
  henVe = setTimeout(() => {
    const b = $('.bang');
    if (b) b.outerHTML = S.tab === 'ung' ? veUng() : veBang();
  }, 160);
}

document.addEventListener('click', async (e) => {
  const T = e.target;

  /* Xem chứng từ đứng TRƯỚC data-close: chip tệp nằm trong bảng lẫn trong form
   * khai chi, bắt sau là mở chứng từ xong đóng luôn form đang gõ dở. */
  if (T.closest('[data-xtclose]') || T.id === 'xemTep') return dongXemTep();
  const xt = T.closest('[data-xem]');
  if (xt) return moXemTep(xt.dataset.rec, xt.dataset.xem, xt.dataset.ten);
  const xtTai = T.closest('[data-tai]');
  if (xtTai) { e.preventDefault(); return taiTepVe(xtTai.dataset.rec, xtTai.dataset.token, xtTai.dataset.ten); }

  if (T.closest('[data-close]') || T.id === 'modal') return dongModal();
  if (T.closest('#btnTaiLai')) { toast('Đang đọc lại…'); return taiLai(true).then(() => toast('Xong', 'ok')); }
  if (T.closest('#btnLark')) return window.open(S.larkUrl, '_blank');
  if (T.closest('#btnChiMoi')) return S.chuQuy ? moKhaiChi() : toast('Bạn đang xem ở chế độ chỉ đọc.', 'err');
  if (T.closest('#btnNap')) return S.chuQuy ? moNapQuy() : toast('Bạn đang xem ở chế độ chỉ đọc.', 'err');

  const tab = T.closest('[data-tab]');
  if (tab) { S.tab = tab.dataset.tab; S.chon.clear(); return ve(); }

  const sua = T.closest('[data-sua]');
  if (sua) return moKhaiChi(sua.dataset.sua);

  /* Gán mã điều hành SG… — Tourwell không đưa mã này qua API nên phải dán tay.
   * Đặt ngay trên dòng thay vì bắt mở cửa sổ sửa: việc này làm sau khi nhận
   * điều hành xong, lúc đang nhìn danh sách. */
  const gansg = T.closest('[data-gansg]');
  if (gansg) {
    const id = gansg.dataset.gansg;
    const c = S.chi.find((x) => x.id === id);
    const ma = prompt('Mã điều hành của khoản "' + ((c && c.noiDung) || '') + '"'
      + '\n\nChép từ mục Điều hành & Đặt dịch vụ trên Tourwell (dạng SG…)',
      (c && c.maDieuHanh) || '');
    if (ma === null) return;
    try {
      await api('/api/chi/' + id, { method: 'PATCH', body: JSON.stringify({ maDieuHanh: ma.trim() }) });
      toast(ma.trim() ? 'Đã gán ' + ma.trim() : 'Đã xoá mã điều hành', 'ok');
      await taiLai(true);
    } catch (e) { toast(e.message, 'err'); }
    return;
  }

  const tep = T.closest('[data-taitep]');
  if (tep) return taiTep(tep.dataset.taitep, tep.dataset.o);

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
      tinhTrang: $('#fTT').value,
      maDieuHanh: $('#fMaDH').value.trim(),
      chungTu: $('#fChungTu').value || null,
      soHoaDon: $('#fSoHD').value.trim(),
      mst: $('#fMST').value.trim(),
      ncc: $('#fNCC').value.trim(),
      chuyenKhoan: $('#fCK').value.trim(),
      ghiChu: $('#fGhiChu').value.trim(),
    };
    if (!body.noiDung) return toast('Phải ghi nội dung chi.', 'err');
    if (!(body.tien > 0)) return toast('Số tiền phải lớn hơn 0.', 'err');
    try {
      let kq = null;
      if (id) await api('/api/chi/' + id, { method: 'PATCH', body: JSON.stringify(body) });
      else kq = await api('/api/chi', { method: 'POST', body: JSON.stringify(body) });
      dongModal();
      toast(id ? 'Đã lưu' : 'Đã ghi vào sổ', 'ok');
      await taiLai(true);
      if (kq && kq.tourwell) moKetQuaTourwell(kq.tourwell, body);
    } catch (err) { toast(err.message, 'err'); }
    return;
  }

  /* ---- nạp quỹ ---- */
  if (T.closest('#btnLuuNap')) {
    const body = {
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
  /* Lớp xem chứng từ nằm trên cùng nên Esc đóng nó trước — đóng cả form khai chi
   * bên dưới thì người ta mất công gõ lại chỉ vì liếc qua một cái hoá đơn. */
  if (e.key === 'Escape' && $('#xemTep').classList.contains('on')) return dongXemTep();
  if (e.key === 'Escape') dongModal();
});

taiLai().catch((e) => {
  $('#man').innerHTML = '<div class="dangTai err">Không đọc được sổ quỹ: ' + esc(e.message) + '</div>';
});
