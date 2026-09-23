'use strict';
/* ============================================================
   LỊCH LÀM VIỆC — giao diện
   Hai tab: "Lịch của tôi" (ai cũng có) và "Cả phòng" (quản lý).
   Mọi luật (lịch chuẩn, cộng công, cảnh báo) do server tính — ở đây chỉ vẽ
   và gửi lên dãy mã công người dùng đã chọn.
   ============================================================ */
const S = {
  meta: null,
  tab: 'toi',
  thang: '',
  du: null,          // /api/thang
  ma: [],            // dãy mã đang sửa (chưa lưu)
  co: 'NP',          // mã đang cầm để "tô" lên ngày
  phong: null,       // /api/ca-phong (quản lý)
  tv: null,          // /api/thanh-vien (quản lý)
  tvSua: '',         // recordId dòng thành viên đang sửa, 'moi' = đang thêm
  hoNguoi: '',       // recordId nhân sự quản lý đang sửa hộ
  dangLuu: false,
  ghiChu: null,      // ghi chú đang gõ — giữ qua các lần vẽ lại
};
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const p2 = (n) => String(n).padStart(2, '0');
const veThang = (t) => (t ? t.slice(5) + '/' + t.slice(0, 4) : '');
/* Giờ VIỆT NAM cho mốc kỳ đăng ký, không theo giờ máy người xem. */
const veLucVN = (ms) => {
  if (!ms) return '';
  const d = new Date(ms + 7 * 3600000);
  return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ' ' + p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1);
};
const veKy = (k) => (k ? veLucVN(k.mo) + ' → ' + veLucVN(k.dong) : '');
const veLuc = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' ' + p2(d.getDate()) + '/' + p2(d.getMonth() + 1);
};
function congThang(t, b) {
  const n = Number(t.slice(0, 4)) * 12 + Number(t.slice(5)) - 1 + b;
  return Math.floor(n / 12) + '-' + p2((n % 12) + 1);
}

async function goi(url, opt) {
  const r = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opt || {}));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

let hTimer = 0;
function bao(chu, loai) {
  const t = $('#toast');
  t.textContent = chu;
  t.className = loai || '';
  t.hidden = false;
  clearTimeout(hTimer);
  hTimer = setTimeout(() => { t.hidden = true; }, loai === 'do' ? 6000 : 2600);
}

const tenMa = (m) => ((S.meta && S.meta.maCong.find((x) => x.ma === m)) || {}).ten || m;

/* ---------------- khung ---------------- */
/* Nhân sự: KHÔNG có tab — chỉ một màn đăng ký + xem lịch của mình.
 * Quản lý: hai tab — Lịch đăng ký (lịch của mình + bảng cả phòng) · Thành viên. */
function veTabs() {
  const ql = S.meta && S.meta.toi.quanLy;
  const t = $('#tabs');
  t.hidden = !ql;
  t.innerHTML = ql ? [['toi', 'Lịch đăng ký'], ['tv', 'Thành viên']].map(([v, ten]) =>
    '<button class="pill' + (S.tab === v ? ' on' : '') + '" data-tab="' + v + '">' + ten + '</button>').join('') : '';
  $('#thangNhan').textContent = 'Tháng ' + veThang(S.thang);
}
const laQL = () => !!(S.meta && S.meta.toi.quanLy);

async function nap(moi) {
  veTabs();
  try {
    const m = moi ? '&moi=1' : '';
    if (S.tab === 'tv') {
      S.tv = await goi('/api/thanh-vien?thang=' + S.thang + m);
      S.ch = await goi('/api/cau-hinh' + (moi ? '?moi=1' : ''));
    } else {
      /* Đọc TUẦN TỰ, không song song: server xếp hàng mọi lượt đọc Base (chống
       * 800004135), bắn hai cái một lúc cũng chẳng nhanh hơn. */
      S.du = await goi('/api/thang?thang=' + S.thang + (S.hoNguoi ? '&nhan-su=' + encodeURIComponent(S.hoNguoi) : '') + m);
      S.ma = S.du.ngay ? S.du.ngay.map((x) => x.ma) : [];
      S.ghiChu = null;
      S.phong = laQL() && !S.hoNguoi ? await goi('/api/ca-phong?thang=' + S.thang + m) : null;
    }
    ve();
  } catch (e) {
    $('#man').innerHTML = '<div class="bao cam">' + esc(e.message) + '</div>';
  }
}

function ve() {
  veTabs();
  $('#man').innerHTML = S.tab === 'tv' ? veTV() : veToi() + (S.phong ? vePhong() : '');
}

/* ---------------- tab Lịch của tôi ---------------- */
function tinhTam() {
  /* Số tạm tính NGAY trên trình duyệt để người chọn thấy công nhảy theo từng cú
   * bấm; lúc lưu server tính lại và ghi số của server. Cùng bảng lam/luong. */
  const bang = new Map(S.meta.maCong.map((m) => [m.ma, m]));
  let lam = 0, luong = 0, nghi = 0;
  S.ma.forEach((m, i) => {
    const t = bang.get(m) || {}, c = bang.get(S.du.ngay[i].chuan) || {};
    lam += t.lam || 0; luong += t.luong || 0;
    nghi += Math.max(0, (c.lam || 0) - (t.lam || 0));
  });
  return { tongCong: lam + luong, nghi, phep: S.ma.filter((m) => m === 'NP').length + S.ma.filter((m) => m === 'NP/2').length / 2,
    khongLuong: S.ma.filter((m) => m === 'KL').length };
}

function veToi() {
  const d = S.du;
  if (d.chuaKhop) {
    const ds = S.meta.chonDuoc;
    return '<section class="the"><div class="the-dau"><h2>Bạn là ai trong danh sách HCNS?</h2></div>' +
      '<div class="the-than"><div class="hang-nut">' +
      (ds.length ? ds.map((x) => '<button class="btn" data-toi-la="' + esc(x.recordId) + '">' + esc(x.hoTen) +
        ' <span class="nho">' + esc(x.chucVu) + '</span></button>').join('')
        : '<span class="nho">Không còn tên nào chưa gắn tài khoản — nhờ quản lý thêm bạn vào bảng Nhân sự.</span>') +
      '</div></div></section>';
  }
  const t = tinhTam();
  const ph = d.phieu;
  const doi = S.ma.some((m, i) => m !== (d.ngay[i] && d.ngay[i].ma));
  const trangThai = !ph ? '<span class="nhan-tt cam">Chưa đăng ký</span>'
    : ph.trangThai === 'Đã chuyển HCNS' ? '<span class="nhan-tt tim">Đã chuyển HCNS ' + esc(veLuc(ph.chuyenLuc)) + '</span>'
      : ph.daNop ? '<span class="nhan-tt xanh">Đã nộp ' + esc(veLuc(ph.nopLuc)) + '</span>'
        : '<span class="nhan-tt cam">Nháp · chưa nộp</span>';

  let h = '';
  if (d.ky && !d.hoNguoi) {
    h += d.ky.dangMo && d.ky.thang === d.thang
      ? '<div class="bao xanh">Đang mở đăng ký tháng ' + veThang(d.ky.thang) + ' · đóng lúc ' + esc(veLucVN(d.ky.dong)) + '</div>'
      : !d.suaDuoc ? '<div class="bao tim">Đăng ký tháng ' + veThang(d.ky.thang) + ' mở ' + esc(veKy(d.ky)) + '</div>' : '';
  }
  if (d.hoNguoi) {
    h += '<div class="bao tim">Đang sửa hộ <b>' + esc(d.nhanSu.hoTen) + '</b> · ' + esc(d.nhanSu.maNV) +
      ' <button class="btn nho" data-ve-toi="1">Về lịch của tôi</button></div>';
  }
  if (ph && ph.suaSau) h += '<div class="bao cam">Lịch này đã sửa sau lần chép sang HCNS.</div>';

  h += '<div class="luoi-so">' +
    oSo('Công chuẩn', d.tinh.congChuan, '') +
    oSo('Tổng công', t.tongCong, t.tongCong < d.tinh.congChuan ? 'cam' : 'xanh') +
    oSo('Ngày nghỉ', t.nghi, t.nghi ? 'cam' : '') +
    oSo('Phép năm', t.phep, '') +
    oSo('Không lương', t.khongLuong, t.khongLuong ? 'do' : '') +
    '</div>';

  const sua = d.suaDuoc;
  h += '<section class="the"><div class="the-dau"><h2>' + esc(d.nhanSu.hoTen) + ' · tháng ' + veThang(d.thang) + '</h2>' +
    trangThai + '<span class="lon"></span>' +
    (sua ? '<button class="btn nho" data-chuan="1">Về lịch chuẩn</button>' : '') + '</div>';
  if (sua) {
    h += '<div class="the-than" style="border-bottom:1px solid var(--border)"><div class="co-ds">' +
      S.meta.maCong.map((m) => '<button class="co mc' + (S.co === m.ma ? ' on' : '') + '" data-ma="' + esc(m.ma) +
        '" data-co="' + esc(m.ma) + '" title="' + esc(m.ten) + '"><b>' + esc(m.ma) + '</b><span>' + esc(m.ten) + '</span></button>').join('') +
      '</div></div>';
  }
  h += '<div class="the-than">' + veLich(d, sua) + '</div></section>';

  if (!doi && d.canhBao && d.canhBao.length) {
    h += '<div class="bao cam"><b>' + d.canhBao.length + ' điểm cần xem lại</b><ul>' +
      d.canhBao.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
  }

  if (sua) {
    h += '<section class="the"><div class="the-than">' +
      '<textarea class="in" id="ghiChu" placeholder="Ghi chú cho quản lý / HCNS">' + esc(S.ghiChu != null ? S.ghiChu : ((ph && ph.ghiChu) || '')) + '</textarea>' +
      '<div class="hang-nut" style="margin-top:10px"><span class="lon"></span>' +
      (doi ? '<span class="nho">' + S.ma.filter((m, i) => m !== d.ngay[i].ma).length + ' ngày chưa lưu</span>' : '') +
      '<button class="btn" data-luu="0"' + (S.dangLuu ? ' disabled' : '') + '>Lưu nháp</button>' +
      '<button class="btn chinh" data-luu="1"' + (S.dangLuu ? ' disabled' : '') + '>' +
      (ph && ph.daNop ? 'Nộp lại' : 'Nộp đăng ký') + '</button></div></div></section>';
  }
  return h;
}

const oSo = (nhan, so, lop) =>
  '<div class="o-so ' + (lop || '') + '"><div class="nhan">' + nhan + '</div><div class="so">' +
  String(so).replace('.', ',') + '</div></div>';

function veLich(d, sua) {
  const homNay = (() => { const x = new Date(); return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate()); })();
  /* Tuần bắt đầu từ Thứ 2 như lịch treo tường, CN ở cuối hàng. */
  const lech = (d.ngay[0].thu + 6) % 7;
  let h = '<div class="lich">' + ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((x) => '<div class="thu">' + x + '</div>').join('');
  for (let i = 0; i < lech; i++) h += '<div class="ngay rong"></div>';
  d.ngay.forEach((n, i) => {
    const ma = S.ma[i];
    const khac = ma !== n.chuan;
    const tip = THU[n.thu] + ' ' + p2(n.d) + '/' + d.thang.slice(5) + (n.le ? ' · ' + n.le : '') +
      (khac ? ' · lịch chuẩn: ' + n.chuan : '');
    h += '<button class="ngay mc' + (khac ? ' doi' : '') + (d.thang + '-' + p2(n.d) === homNay ? ' nay' : '') +
      '" data-ma="' + esc(ma) + '" data-ngay="' + i + '" title="' + esc(tip) + '"' + (sua ? '' : ' disabled') + '>' +
      '<span class="so-ngay">' + n.d + '</span><span class="ma">' + esc(ma) + '</span>' +
      '<span class="ten-ma">' + esc(n.le || tenMa(ma)) + '</span></button>';
  });
  return h + '</div>';
}

async function luu(nop) {
  if (S.dangLuu) return;
  S.dangLuu = true;
  ve();
  const ghi = $('#ghiChu');
  const ghiChu = ghi ? ghi.value : undefined;
  try {
    const r = await goi('/api/thang', { method: 'POST', body: JSON.stringify({
      thang: S.thang, ma: S.ma, nop, ghiChu, nhanSu: S.hoNguoi || undefined,
    }) });
    bao(nop ? 'Đã nộp lịch tháng ' + veThang(S.thang) : 'Đã lưu nháp');
    S.dangLuu = false;
    await nap(true);
    /* Báo lớp vỏ để nó tắt hộp nhắc đăng ký ngay, khỏi đợi lần tải sau. */
    if (nop && window.parent !== window) window.parent.postMessage({ hub: 'llv-da-nop', thang: S.thang }, '*');
    return r;
  } catch (e) {
    S.dangLuu = false;
    ve();
    bao(e.message, 'do');
  }
}

/* ---------------- tab Cả phòng ---------------- */
function vePhong() {
  const b = S.phong;
  const daNop = b.hang.filter((r) => r.phieu && r.phieu.daNop);
  const choChuyen = b.hang.filter((r) => r.phieu && r.phieu.trangThai === 'Đã nộp');
  const suaSau = b.hang.filter((r) => r.phieu && r.phieu.suaSau);
  let h = '<section class="the"><div class="the-dau"><h2>Lịch cả phòng · tháng ' + veThang(b.thang) + '</h2>' +
    '<span class="nhan-tt ' + (daNop.length < b.hang.length ? 'cam' : 'xanh') + '">' + daNop.length + '/' + b.hang.length + ' đã nộp</span>' +
    (choChuyen.length ? '<span class="nhan-tt cam">' + choChuyen.length + ' chờ chép HCNS</span>' : '') +
    (suaSau.length ? '<span class="nhan-tt do">' + suaSau.length + ' sửa sau khi chép</span>' : '') +
    '<span class="lon"></span>' +
    '<button class="btn nho" data-chep="1">Chép khối ngày</button>' +
    '<a class="btn nho" href="api/xuat?thang=' + b.thang + '" download>Tải Excel</a>' +
    '<button class="btn nho chinh" data-chuyen="1"' + (daNop.length ? '' : ' disabled') + '>Đánh dấu đã chép HCNS</button>' +
    '<a class="btn nho mo" href="' + esc(S.meta.hcnsUrl) + '" target="_blank" rel="noopener">Sheet HCNS</a>' +
    '</div><div class="the-than khit cuon"><table class="bang-phong"><thead><tr><th class="ten">Nhân sự</th>' +
    b.ngay.map((x) => '<th class="' + (x.thu === 0 ? 'cn' : '') + '">' + p2(x.d) + '<br><span class="nho">' + THU[x.thu] + '</span></th>').join('') +
    '<th>Công</th></tr></thead><tbody>' +
    b.hang.map((r) => {
      const ph = r.phieu;
      const tt = !ph ? '<span class="nhan-tt cam">Chưa đăng ký</span>'
        : ph.suaSau ? '<span class="nhan-tt do">Sửa sau khi chép</span>'
          : ph.trangThai === 'Đã chuyển HCNS' ? '<span class="nhan-tt tim">Đã chép</span>'
            : ph.daNop ? '<span class="nhan-tt xanh">Đã nộp</span>' : '<span class="nhan-tt cam">Nháp</span>';
      return '<tr data-sua="' + esc(r.nhanSu.recordId) + '" title="Mở lịch của ' + esc(r.nhanSu.hoTen) + '">' +
        '<td class="ten"><b>' + esc(r.nhanSu.hoTen) + '</b> ' + tt + '<small>' + esc(r.nhanSu.maNV) + ' · ' + esc(r.nhanSu.chucVu) + '</small></td>' +
        r.ma.map((m, i) => '<td class="o' + (b.ngay[i].thu === 0 ? ' cn' : '') + '"><span class="mc" data-ma="' + esc(m) + '">' + esc(m) + '</span></td>').join('') +
        '<td class="tong">' + String(r.tinh.tongCong).replace('.', ',') + '</td></tr>';
    }).join('') +
    '</tbody></table></div></section>';
  return h;
}

/** Khối mã công theo đúng thứ tự dòng bên sheet HCNS, tách bằng Tab — dán vào ô
 *  "01" của người đầu tiên là cả khối vào đúng chỗ. */
function khoiNgay() {
  return S.phong.hang.map((r) => r.ma.join('\t')).join('\n');
}

async function chep() {
  const t = khoiNgay();
  try {
    await navigator.clipboard.writeText(t);
    bao('Đã chép ' + S.phong.hang.length + ' dòng × ' + S.phong.ngay.length + ' ngày — dán vào ô ngày 01 của dòng đầu tiên');
  } catch (_) {
    /* Iframe trong Lark có thể chặn clipboard — lùi về ô chọn sẵn để Ctrl+C. */
    const o = document.createElement('textarea');
    o.value = t;
    document.body.appendChild(o);
    o.select();
    try { document.execCommand('copy'); bao('Đã chép khối ngày'); } catch (e) { bao('Trình duyệt chặn chép — dùng Tải Excel', 'do'); }
    o.remove();
  }
}

async function chuyen() {
  const so = S.phong.hang.filter((r) => r.phieu && r.phieu.daNop).length;
  if (!confirm('Đánh dấu ' + so + ' lịch đã nộp là "Đã chuyển HCNS"? Ai sửa sau đó sẽ hiện "Sửa sau khi chép".')) return;
  try {
    const r = await goi('/api/chuyen-hcns', { method: 'POST', body: JSON.stringify({ thang: S.thang }) });
    bao('Đã đánh dấu ' + r.so + ' lịch');
    await nap(true);
  } catch (e) { bao(e.message, 'do'); }
}

/* ---------------- tab Thành viên (quản lý) ---------------- */
function veTV() {
  const ds = S.tv.ds;
  const dang = ds.filter((x) => x.dangLam), nghi = ds.filter((x) => !x.dangLam);
  const ttLich = (x) => !x.trangThai ? '<span class="nhan-tt cam">Chưa đăng ký</span>'
    : x.suaSau ? '<span class="nhan-tt do">Sửa sau khi chép</span>'
      : x.trangThai === 'Đã chuyển HCNS' ? '<span class="nhan-tt tim">Đã chép</span>'
        : x.trangThai === 'Nháp' ? '<span class="nhan-tt cam">Nháp</span>' : '<span class="nhan-tt xanh">Đã nộp</span>';
  const o = (ten, v, rong) => '<input class="in-o" data-f="' + ten + '" value="' + esc(v == null ? '' : v) + '"' +
    (rong ? ' style="width:' + rong + '"' : '') + '>';
  const dongSua = (x) => '<tr class="tv-sua" data-rec="' + esc(x.recordId || 'moi') + '">' +
    '<td>' + o('thuTu', x.thuTu, '48px') + '</td><td>' + o('hoTen', x.hoTen) + '</td><td>' + o('maNV', x.maNV, '96px') +
    '</td><td>' + o('chucVu', x.chucVu) + '</td><td>' + o('email', x.email) + '</td><td colspan="2"></td>' +
    '<td class="tv-nut"><button class="btn nho chinh" data-tv-luu="' + esc(x.recordId || 'moi') + '">Lưu</button>' +
    '<button class="btn nho mo" data-tv-huy="1">Huỷ</button></td></tr>';
  const dong = (x) => S.tvSua === x.recordId ? dongSua(x) :
    '<tr class="' + (x.dangLam ? '' : 'mo-di') + '"><td class="so">' + (x.thuTu || '') + '</td>' +
    '<td><b>' + esc(x.hoTen) + '</b></td><td>' + esc(x.maNV) + '</td><td>' + esc(x.chucVu) + '</td>' +
    '<td>' + (x.email ? esc(x.email) : x.lienKet ? '<span class="nho">đã gắn tài khoản</span>' : '<span class="nho">chưa gắn</span>') + '</td>' +
    '<td>' + (x.dangLam ? ttLich(x) : '') + '</td>' +
    '<td><label class="tv-lam"><input type="checkbox" data-tv-lam="' + esc(x.recordId) + '" data-lam="' + (x.dangLam ? '0' : '1') + '"' +
      (x.dangLam ? ' checked' : '') + '> Đang làm</label></td>' +
    '<td class="tv-nut"><button class="btn nho" data-tv-sua="' + esc(x.recordId) + '">Sửa</button>' +
    (x.dangLam ? '<button class="btn nho" data-sua="' + esc(x.recordId) + '">Sửa lịch</button>' : '') +
    (x.lienKet ? '<button class="btn nho mo" data-tv-go="' + esc(x.recordId) + '" data-ten="' + esc(x.hoTen) + '">Gỡ liên kết</button>' : '') +
    '</td></tr>';
  return veCauHinh() + '<section class="the"><div class="the-dau"><h2>Thành viên</h2>' +
    '<span class="nhan-tt">' + dang.length + ' đang làm</span>' + (nghi.length ? '<span class="nhan-tt">' + nghi.length + ' đã nghỉ</span>' : '') +
    '<span class="lon"></span>' +
    (S.tvSua === 'moi' ? '' : '<button class="btn nho chinh" data-tv-sua="moi">Thêm thành viên</button>') +
    '</div><div class="the-than khit cuon"><table class="bang-tv"><thead><tr>' +
    '<th>#</th><th>Họ tên</th><th>Mã NV</th><th>Chức vụ</th><th>Tài khoản</th><th>Lịch ' + veThang(S.tv.thang) + '</th><th></th><th></th>' +
    '</tr></thead><tbody>' +
    (S.tvSua === 'moi' ? dongSua({}) : '') + dang.map(dong).join('') + nghi.map(dong).join('') +
    '</tbody></table></div></section>';
}

/* Kỳ đăng ký cố định: quản lý chỉnh ngày/giờ mở, số ngày tới lúc đóng, và có
 * khoá các app khác của hub hay không. */
function veCauHinh() {
  const c = S.ch.ch, k = S.ch.ky;
  const so = (f, v, min, max) => '<input class="in-o" type="number" data-ch="' + f + '" value="' + esc(v) + '" min="' + min + '" max="' + max + '" style="width:64px">';
  const gio = (f, v) => '<input class="in-o" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" data-ch="' + f + '" value="' + esc(v) + '" style="width:72px">';
  return '<section class="the"><div class="the-dau"><h2>Kỳ đăng ký</h2>' +
    '<span class="nhan-tt ' + (k.dangMo ? 'xanh' : '') + '">' + (k.dangMo ? 'Đang mở' : 'Kỳ tới') +
    ' · tháng ' + veThang(k.thang) + ' · ' + esc(veKy(k)) + '</span></div>' +
    '<div class="the-than"><div class="hang-nut ch-dong">' +
    '<span>Mở ngày</span>' + so('ngayMo', c.ngayMo, 1, 31) + '<span>lúc</span>' + gio('gioMo', c.gioMo) +
    '<span class="ch-cach">Đóng sau</span>' + so('dongSauNgay', c.dongSauNgay, 0, 10) + '<span>ngày, lúc</span>' + gio('gioDong', c.gioDong) +
    '<label class="tv-lam ch-cach"><input type="checkbox" data-ch="batBuoc"' + (c.batBuoc ? ' checked' : '') + '> Bắt buộc — khoá app khác tới khi nộp</label>' +
    '<span class="lon"></span><button class="btn nho chinh" data-ch-luu="1">Lưu kỳ đăng ký</button>' +
    '</div></div></section>';
}

async function luuCH() {
  const o = {};
  document.querySelectorAll('[data-ch]').forEach((i) => { o[i.dataset.ch] = i.type === 'checkbox' ? i.checked : i.value; });
  try {
    const r = await goi('/api/cau-hinh', { method: 'POST', body: JSON.stringify(o) });
    bao('Đã lưu · tháng ' + veThang(r.ky.thang) + ' mở ' + veKy(r.ky));
    await nap(true);
  } catch (e) { bao(e.message, 'do'); }
}

async function luuTV(rec) {
  const tr = document.querySelector('tr.tv-sua');
  const o = {};
  tr.querySelectorAll('[data-f]').forEach((i) => { o[i.dataset.f] = i.value; });
  if (o.thuTu === '') delete o.thuTu;
  if (rec !== 'moi') o.recordId = rec;
  try {
    await goi('/api/thanh-vien', { method: 'POST', body: JSON.stringify(o) });
    S.tvSua = '';
    bao(rec === 'moi' ? 'Đã thêm ' + o.hoTen : 'Đã lưu');
    await nap(true);
  } catch (e) { bao(e.message, 'do'); }
}

async function doiTV(rec, o, hoi) {
  if (hoi && !confirm(hoi)) return;
  try {
    await goi('/api/thanh-vien', { method: 'POST', body: JSON.stringify(Object.assign({ recordId: rec }, o)) });
    await nap(true);
  } catch (e) { bao(e.message, 'do'); await nap(true); }
}

/* ---------------- sự kiện ---------------- */
document.addEventListener('click', async (e) => {
  const el = (s) => e.target.closest(s);
  let x;
  if ((x = el('[data-tab]'))) {
    S.tab = x.dataset.tab;
    S.hoNguoi = '';
    return nap();
  }
  if ((x = el('[data-co]'))) { S.co = x.dataset.co; return ve(); }
  if ((x = el('.ngay[data-ngay]'))) {
    const i = Number(x.dataset.ngay);
    const chuan = S.du.ngay[i].chuan;
    /* Bấm lại đúng mã đang cầm lên ngày đã mang mã đó = trả về lịch chuẩn. */
    S.ma[i] = S.ma[i] === S.co ? chuan : S.co;
    return ve();
  }
  if (el('[data-chuan]')) { S.ma = S.du.ngay.map((n) => n.chuan); return ve(); }
  if ((x = el('[data-luu]'))) return luu(x.dataset.luu === '1');
  if ((x = el('[data-toi-la]'))) {
    try {
      await goi('/api/toi-la', { method: 'POST', body: JSON.stringify({ recordId: x.dataset.toiLa }) });
      S.meta = await goi('/api/meta');
      return nap(true);
    } catch (err) { return bao(err.message, 'do'); }
  }
  if (el('[data-ve-toi]')) { S.hoNguoi = ''; return nap(); }
  if ((x = el('[data-sua]'))) {
    S.tab = 'toi'; S.hoNguoi = x.dataset.sua;
    await nap();
    return window.scrollTo(0, 0);
  }
  if (el('[data-ch-luu]')) return luuCH();
  if ((x = el('[data-tv-sua]'))) { S.tvSua = x.dataset.tvSua; return ve(); }
  if (el('[data-tv-huy]')) { S.tvSua = ''; return ve(); }
  if ((x = el('[data-tv-luu]'))) return luuTV(x.dataset.tvLuu);
  if ((x = el('[data-tv-go]'))) return doiTV(x.dataset.tvGo, { goLienKet: true },
    'Gỡ tài khoản đang gắn với ' + x.dataset.ten + '? Lần mở sau app nhận lại người theo tên.');
  if ((x = el('[data-tv-lam]'))) return doiTV(x.dataset.tvLam, { dangLam: x.dataset.lam === '1' });
  if (el('[data-chep]')) return chep();
  if (el('[data-chuyen]')) return chuyen();
});
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'ghiChu') S.ghiChu = e.target.value;
});
$('#thangTruoc').onclick = () => { S.thang = congThang(S.thang, -1); nap(); };
$('#thangSau').onclick = () => { S.thang = congThang(S.thang, 1); nap(); };

/* Lớp vỏ đặt tone sáng/tối và có thể bảo nhảy tab. */
window.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.hub === 'theme') {
    if (d.v === 'toi' || d.v === 'sang') document.documentElement.dataset.theme = d.v;
    else delete document.documentElement.dataset.theme;
  }
  if (d.hub === 'tab' && ['toi', 'phong', 'tv'].includes(d.v)) { S.tab = d.v === 'tv' ? 'tv' : 'toi'; S.hoNguoi = ''; nap(); }
});

(async function khoiDong() {
  try {
    S.meta = await goi('/api/meta');
  } catch (e) {
    $('#man').innerHTML = '<div class="bao cam">' + esc(e.message) + '</div>';
    return;
  }
  const q = new URLSearchParams(location.search);
  S.thang = /^\d{4}-\d{2}$/.test(q.get('thang') || '') ? q.get('thang') : S.meta.thangMacDinh;
  if (q.get('tab') === 'tv' && S.meta.toi.quanLy) S.tab = 'tv';
  const toi = S.meta.toi;
  const chip = $('#chipToi');
  chip.classList.toggle('ql', !!toi.quanLy);
  chip.lastElementChild.textContent = (S.meta.toiLa ? S.meta.toiLa.hoTen : toi.ten) + (toi.quanLy ? ' · quản lý' : '');
  const ky = S.meta.ky;
  $('#phuDe').textContent = ky && ky.dangMo ? 'Đang mở đăng ký tháng ' + veThang(ky.thang) : 'Phòng Marketing';
  if (toi.quanLy) {
    const b = $('#btnLark');
    b.hidden = false;
    b.onclick = () => window.open(S.meta.larkUrl, '_blank', 'noopener');
  }
  nap();
})();
