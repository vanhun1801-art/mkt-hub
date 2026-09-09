'use strict';
/* ============================================================================
 * Booking OTA — giao diện.
 *
 * Ba màn hình theo đúng luồng đang dùng:
 *   "Booking mới"  — dữ liệu nhân viên đã nhập một lần vào Lark Base.
 *   "Thống kê OTA" — khách / doanh thu / hoa hồng / lead time theo kênh.
 *   "Dữ liệu Lark" — sức khoẻ nguồn gốc, form nhập và hai bảng danh mục.
 *
 * API OTA chỉ là điểm chờ cho tương lai. Hiện tại Lark Base là nguồn dữ liệu gốc
 * duy nhất; OTA Manager không yêu cầu nhân viên nhập lại lần thứ hai.
 *
 * Mọi phép lọc và cộng dồn đều làm ở SERVER (thongke.js). Client chỉ vẽ — nếu
 * client cũng tính thì hai nơi sẽ lệch nhau ngay lần sửa quy tắc đầu tiên.
 * ========================================================================== */

const $ = (s, g) => (g || document).querySelector(s);
const $$ = (s, g) => [...(g || document).querySelectorAll(s)];

const S = {
  meta: null,
  tab: 'moi',
  data: null,        // /api/bookings
  coDaNhan: true,    // Base có cột "Sales đã nhận" hay không
  tk: null,          // /api/thongke
  nhom: '',          // thẻ số đang chọn ở màn Booking mới
  loc: { moc: '7ngay', truong: 'ngayDi', from: '', to: '', kenh: [], trangThai: [], tim: '',
         sap: 'ngayDi' },
  tuHub: false,      // khoảng thời gian do lớp vỏ áp xuống
  nguon: 'base',   // Lark Base luôn là nguồn chính; hàng đợi chỉ mở tạm để soi lỗi
  live: true,        // tự kiểm tra Lark định kỳ; SSE chỉ hỗ trợ API/webhook tương lai
  es: null,          // EventSource đang mở
  liveLuc: 0,        // lần cuối đọc lại Lark thành công
  autoTimer: null,
  autoDang: false,
  autoLoi: '',
  perm: { chiPhi: true, duocSua: true },
};

/* ------------------------------------------------------------- tiện ích -- */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Phòng tuyến cuối cho câu lỗi: dù tầng dưới có lỡ đẩy lên nguyên stack trace thì
 * băng thông báo vẫn chỉ hiện một đoạn đọc được, không phá vỡ cả trang. */
const gonLoi = (t, n = 240) => {
  const s2 = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  return s2.length > n ? s2.slice(0, n) + '…' : s2;
};

const vnd = (n) => (n == null || n === '' ? '—' : Math.round(Number(n)).toLocaleString('vi-VN') + 'đ');
const soVn = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('vi-VN'));

/** Tiền theo ĐÚNG nguyên tệ của booking. In "3.180đ" cho một booking CNY là nói sai. */
function tien(n, tienTe) {
  if (n == null || n === '') return '—';
  const t = (tienTe || 'VND').toUpperCase();
  if (t === 'VND') return vnd(n);
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + '\u00a0' + t;
}

/** '2026-09-02' → '02/09' (kèm năm nếu khác năm nay). */
function ngayNgan(k) {
  if (!k) return '—';
  const [y, m, d] = k.split('-');
  const namNay = new Date().getFullYear();
  return d + '/' + m + (Number(y) === namNay ? '' : '/' + y);
}
function ngayDay(k) {
  if (!k) return '—';
  const [y, m, d] = k.split('-');
  return d + '/' + m + '/' + y;
}
/**
 * Nhãn tương đối cho ngày đi: "Hôm nay", "Mai", "Còn 3 ngày", "Đã qua 2 ngày".
 * Con số 02/09 một mình không nói được gì khi đang đứng ngày 31/08 — nhãn này là
 * thứ người vận hành đọc trước.
 */
function nhanNgay(k, homNay) {
  if (!k) return { chu: 'chưa có ngày', muc: 'cao' };
  if (!homNay) return { chu: '', muc: '' };
  const n = Math.round((Date.parse(k + 'T00:00:00Z') - Date.parse(homNay + 'T00:00:00Z')) / 86400000);
  if (n === 0) return { chu: 'Hôm nay', muc: 'cao' };
  if (n === 1) return { chu: 'Mai', muc: 'vua' };
  if (n === 2) return { chu: 'Mốt', muc: 'vua' };
  if (n > 2) return { chu: 'Còn ' + n + ' ngày', muc: '' };
  return { chu: n === -1 ? 'Hôm qua' : 'Đã qua ' + -n + ' ngày', muc: 'qua' };
}

function gioPhut(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toast(msg, loai) {
  const el = document.createElement('div');
  el.className = 'toast' + (loai ? ' ' + loai : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), loai === 'xau' ? 8000 : 4000);
}

async function goi(duong, opts) {
  const r = await fetch(duong, opts);
  const raw = await r.text();
  let d = null;
  try { d = raw ? JSON.parse(raw) : {}; } catch (_) {}
  if (!r.ok) throw new Error((d && d.error) || 'HTTP ' + r.status + ' ' + raw.slice(0, 200));
  return d;
}

/* Lớp vỏ tối panel lại khi app con mở cửa sổ (chạy độc lập thì không có hàm này). */
function hubChe(mo) {
  try { if (window.__HUB__ && window.__HUB__.che) window.__HUB__.che(!!mo); } catch (_) {}
}

/* ------------------------------------------------------------- bộ lọc ---- */
const MOC = [
  { id: 'homnay', ten: 'Hôm nay' },
  { id: '7ngay', ten: '7 ngày tới' },
  { id: '30ngay', ten: '30 ngày tới' },
  { id: 'thang', ten: 'Tháng này' },
  { id: 'thangtruoc', ten: 'Tháng trước' },
  { id: 'tatca', ten: 'Toàn bộ' },
];
const TRUONG = [
  { id: 'ngayDi', ten: 'Ngày đi' },
  { id: 'ngayDat', ten: 'Ngày đặt' },
  { id: 'nhanLuc', ten: 'Ngày nhập Lark' },
];

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Mốc nhanh → from/to. Chọn tay ngày thì mốc chuyển sang '' (tự do). */
function apMoc(id) {
  const nay = new Date(); nay.setHours(0, 0, 0, 0);
  const cong = (n) => { const x = new Date(nay); x.setDate(x.getDate() + n); return iso(x); };
  if (id === 'homnay') return { from: iso(nay), to: iso(nay) };
  if (id === '7ngay') return { from: iso(nay), to: cong(7) };
  if (id === '30ngay') return { from: iso(nay), to: cong(30) };
  if (id === 'thang') {
    const d1 = new Date(nay.getFullYear(), nay.getMonth(), 1);
    const d2 = new Date(nay.getFullYear(), nay.getMonth() + 1, 0);
    return { from: iso(d1), to: iso(d2) };
  }
  if (id === 'thangtruoc') {
    const d1 = new Date(nay.getFullYear(), nay.getMonth() - 1, 1);
    const d2 = new Date(nay.getFullYear(), nay.getMonth(), 0);
    return { from: iso(d1), to: iso(d2) };
  }
  return { from: '', to: '' };
}

function veBoLoc() {
  $('#mocSeg').innerHTML = MOC.map((m) =>
    `<button data-moc="${m.id}" class="${S.loc.moc === m.id ? 'on' : ''}">${esc(m.ten)}</button>`).join('');
  $('#truongSeg').innerHTML = TRUONG.map((t) =>
    `<button data-truong="${t.id}" class="${S.loc.truong === t.id ? 'on' : ''}">${esc(t.ten)}</button>`).join('');
  $('#fFrom').value = S.loc.from;
  $('#fTo').value = S.loc.to;
  $('#fTim').value = S.loc.tim;

  const kenh = (S.meta && S.meta.kenh) || [];
  $('#fKenh').innerHTML = kenh.map((k) =>
    `<button data-kenh="${esc(k.id)}" class="${S.loc.kenh.includes(k.id) ? 'on' : ''}">${esc(k.ten)}</button>`).join('');

  const tt = (S.meta && S.meta.trangThai) || [];
  $('#fTrangThai').innerHTML = tt.map((t) =>
    `<button data-tt="${esc(t)}" class="${S.loc.trangThai.includes(t) ? 'on' : ''}">${esc(t)}</button>`).join('');
}

function queryLoc() {
  const q = new URLSearchParams();
  if (S.loc.from) q.set('from', S.loc.from);
  if (S.loc.to) q.set('to', S.loc.to);
  q.set('moc', S.loc.truong);
  if (S.loc.kenh.length) q.set('kenh', S.loc.kenh.join(','));
  if (S.loc.trangThai.length) q.set('trangThai', S.loc.trangThai.join(','));
  if (S.loc.tim) q.set('tim', S.loc.tim);
  if (S.loc.sap) q.set('sap', S.loc.sap);
  if (S.nguon) q.set('nguon', S.nguon);
  return q.toString();
}

/* ============================================================ màn hình == */

/* Doanh thu lấy từ đâu — hiện ngay dưới con số, vì "3.725.000đ theo hợp đồng" và
 * "3.725.000đ ước tính theo %" là hai độ tin cậy hoàn toàn khác nhau.
 * Nguồn tốt nhất (bảng giá NET) không ghi chú gì — im lặng nghĩa là chuẩn. */
const NGUON_TN = {
  'bang-gia': '',
  'ota': 'số OTA báo',
  'ota-suy': 'suy từ hoa hồng OTA',
  'uoc-tinh': 'ước tính theo %',
};

const TT_CLASS = {
  /* Năm trạng thái của cột select trong Base. 'Đã hoàn thành' dùng lại màu xanh
   * của 'Đã xác nhận' (đều là booking tốt), 'No-show' dùng màu cảnh báo. */
  'Chờ xác nhận': 'tt-moi', 'Đã xác nhận': 'tt-xac-nhan', 'Đã hoàn thành': 'tt-xong',
  'Đã huỷ': 'tt-huy', 'No-show': 'tt-hoan',
};

function veTheSo(the) {
  return `<div class="the-hang">` + the.map((t) => `
    <button class="the ${t.muc || ''} ${S.nhom === t.khoa ? 'dang-chon' : ''}" data-nhom="${esc(t.khoa || '')}">
      <div class="nhan">${esc(t.nhan)}</div>
      <div class="so">${soVn(t.so)}</div>
      <div class="ghi">${esc(t.ghi || '')}</div>
    </button>`).join('') + `</div>`;
}

function veCo(b) {
  return `<div class="co">` +
    b.canXuLy.map((c) => `<span class="${c.muc}">${esc(c.nhan)}</span>`).join('') + `</div>`;
}

/**
 * Số khách.
 * @param {boolean} gon dạng gọn cho BẢNG ("2 NL + 1 TE"). Bảng có 12 cột, viết
 *   "2 người lớn + 1 trẻ em" là cột này chiếm chỗ của cột "Thông tin cần xử lý" —
 *   cột quan trọng nhất và là cột bị cắt đầu tiên. Cửa sổ chi tiết thì viết đủ chữ.
 */
function veKhach(b, gon) {
  const sl = [];
  if (b.nguoiLon) sl.push(b.nguoiLon + (gon ? ' NL' : ' người lớn'));
  if (b.treEm) sl.push(b.treEm + (gon ? ' TE' : ' trẻ em'));
  return sl.length ? sl.join(' + ') : (b.tongKhach ? b.tongKhach + ' khách' : '—');
}

function veBangBooking(rows) {
  const homNay = (S.meta && S.meta.homNay) || '';
  if (!rows.length) {
    return `<div class="empty">Không có booking nào khớp bộ lọc.</div>`;
  }
  return `<div class="bang-boc"><table>
    <thead><tr>
      <th>Kênh</th><th>Mã booking</th><th>Khách</th><th>Tour</th>
      <th>Ngày đi</th><th>Số khách</th><th>Điểm đón</th>
      ${S.perm.chiPhi ? `<th>Sản phẩm (bảng giá)</th>
      <th class="so">OTA bán</th><th class="so">Thực nhận</th>` : ''}
      <th>Trạng thái</th><th class="can-xu-ly">Thông tin cần xử lý</th><th></th>
    </tr></thead>
    <tbody>${rows.map((b) => `
      <tr data-id="${esc(b.id)}" class="${b.dong ? 'dong' : ''}">
        <td><span class="kenh">${esc(b.kenh)}</span></td>
        <td class="ma-booking"><span class="dam">${esc(b.maBooking || '(chưa có mã)')}</span>
            <div class="manh">${gioPhut(b.nhanLuc)}</div></td>
        <td><span class="dam">${esc(b.tenKhach || '(chưa có tên)')}</span>
            <div class="manh">${b.sdt ? '📞 ' + esc(b.sdt) : '—'}</div></td>
        <td class="tour-ten">${esc(b.tour || '—')}</td>
        <td style="white-space:nowrap">${ngayNgan(b.ngayDi)}
            <div class="ngay-nhan ${nhanNgay(b.ngayDi, homNay).muc}">${
              esc(nhanNgay(b.ngayDi, homNay).chu)}${b.gioDon ? ' · ' + esc(b.gioDon) : ''}</div></td>
        <td style="white-space:nowrap">${esc(veKhach(b, true))}</td>
        <td class="diem-don">${esc(b.diemDon || '—')}</td>
        ${S.perm.chiPhi ? `
        <td>${b.sanPham ? esc(b.sanPham) : '<span class="manh">chưa map</span>'}</td>
        <td class="so">${tien(b.tongTien, b.tienTe)}</td>
        <td class="so ${b.lechBangGia ? 'lech' : ''}">${vnd(b.thucNhan)}${
          b.nguonThucNhan && NGUON_TN[b.nguonThucNhan]
            ? '<div class="manh">' + esc(NGUON_TN[b.nguonThucNhan]) + '</div>' : ''}</td>` : ''}
        <td><span class="tt ${TT_CLASS[b.trangThai] || ''}">${esc(b.trangThai)}</span></td>
        <td class="can-xu-ly">${veCo(b)}</td>
        <td>${b.dong || !S.coDaNhan ? '' : b.daNhan
            ? '<span class="chip tot">đã nhận</span>'
            : S.perm.duocSua
              ? `<button class="btn small primary" data-nhan="${esc(b.id)}">Nhận</button>`
              : ''}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

/* --------------------------------------------------- màn Booking mới ----- */
function veBookingMoi() {
  const d = S.data;
  if (!d) return `<div class="loading">Đang nạp booking…</div>`;

  const vh = d.vanHanh;
  const nhomDS = S.nhom && vh.nhom[S.nhom] ? vh.nhom[S.nhom] : null;
  const rows = nhomDS || d.rows;
  const tenNhom = S.nhom ? (vh.the.find((t) => t.khoa === S.nhom) || {}).nhan : '';

  let html = '';
  if (d.epNguon) {
    html += `<div class="canhbao"><div class="noi">
      <b>Đang xem HÀNG ĐỢI CỤC BỘ, không phải Lark Base</b>
      <p>Lark Base vẫn đọc được bình thường — đây là lựa chọn của bạn để soi booking nào
      chưa đẩy lên Base được. <a href="#" id="veBase">Quay lại xem Base</a></p>
    </div></div>`;
  } else if (d.nguon === 'base' && (S.meta.chuaDay || 0) > 0) {
    html += `<div class="canhbao"><div class="noi">
      <b>${soVn(S.meta.chuaDay)} booking chưa đẩy được lên Base</b>
      <p>Chúng vẫn nằm an toàn trong hàng đợi cục bộ, nhưng ổ đĩa Render là tạm nên sẽ mất
      sau lần deploy tới. <a href="#" id="xemHangDoi">Xem hàng đợi</a> ·
      quản lý bấm <b>Đẩy hàng đợi vào Base</b> ở tab Dữ liệu Lark.</p>
    </div></div>`;
  }
  if (d.loi) {
    html += `<div class="canhbao xau"><div class="noi"><b>${esc(d.loi)}</b>
      <p>Đang xem dữ liệu từ <b>${esc(d.nguon === 'base' ? 'Lark Base' : 'hàng đợi cục bộ')}</b>.
      Vào tab <b>Dữ liệu Lark</b> để xử lý.</p></div></div>`;
  }

  const n = (S.meta && S.meta.nhapBooking) || {};
  const linkNhap = n.url || (S.meta && S.meta.baseUrl) || '';
  html += `<div class="nhap-mot-lan">
    <div><span class="nhap-kicker">LUỒNG ĐANG DÙNG</span>
      <b>Nhập booking đúng một lần trong Lark</b>
      <p>OTA chưa cấp API: nhân viên nhập tại view <b>${esc(n.viewName || 'Nhập booking OTA')}</b>.
        OTA Manager tự đọc bảng <b>Bookings</b>, tính thống kê và cảnh báo — không nhập lại ở đây.</p></div>
    ${linkNhap ? `<a class="btn primary" href="${esc(linkNhap)}" target="_blank" rel="noreferrer">+ ${n.laForm ? 'Mở form nhập booking' : 'Mở Lark để nhập'}</a>` : ''}
  </div>`;

  html += veTheSo(vh.the);
  html += `<div class="khoi">
    <h2>${S.nhom ? esc(tenNhom) : 'Danh sách booking'}
      <span class="phu">${soVn(rows.length)} booking${
        S.nhom ? ' · <a href="#" id="boNhom">xem toàn bộ</a>' : ''}${
        d.catBot ? ' · đã cắt bớt ' + soVn(d.catBot) + ' dòng, lọc hẹp lại để xem hết' : ''}</span>
    </h2>
    <div class="khoi-thanh">
      <span class="nhan-sap">Sắp theo</span>
      <div class="seg" id="sapSeg">
        <button data-sap="ngayDi" class="${S.loc.sap === 'ngayDi' ? 'on' : ''}">Ngày đi gần nhất</button>
        <button data-sap="nhanLuc" class="${S.loc.sap === 'nhanLuc' ? 'on' : ''}">Mới nhập vào Lark</button>
      </div>
      <span class="manh">${S.loc.sap === 'ngayDi'
        ? 'hôm nay lên đầu, rồi mai, mốt… tour đã chạy xuống cuối; cùng ngày thì theo giờ đón'
        : 'booking vừa được nhập vào Lark xếp trước'}</span>
    </div>
    ${veBangBooking(rows)}
  </div>`;
  return html;
}

/* ----------------------------------------------------- màn Thống kê ------ */
/**
 * Gross / hoa hồng là số OTA báo theo nguyên tệ. Một dòng chỉ có booking ngoại tệ
 * phải in “— EUR”, không được giả thành 0đ. Riêng `thucNhan` luôn là VNĐ vì lấy
 * từ bảng giá NET, nên các ô thực nhận dùng `vnd()` trực tiếp, không qua hàm này.
 */
const tienOtaGop = (g, v) => (g.bookingVnd === 0 && g.ngoaiTe
  ? '<span class="manh">— ' + esc(g.dsNgoaiTe.join('/')) + '</span>'
  : vnd(v));

function veThongKe() {
  const tk = S.tk;
  if (!tk) return `<div class="loading">Đang tính thống kê…</div>`;
  const t = tk.tong;

  const the = [
    { nhan: 'Booking', so: t.bookingSong, ghi: t.booking !== t.bookingSong ? t.booking + ' kể cả huỷ/hoàn' : '' },
    { nhan: 'Khách', so: t.khach, ghi: t.nguoiLon + ' người lớn · ' + t.treEm + ' trẻ em' },
    { nhan: 'Tổng tiền booking', so: t.tongTien, tien: true,
      ghi: 'TB ' + vnd(t.tbBooking) + '/booking' + (t.ngoaiTe ? ' · chỉ ' + t.bookingVnd + ' booking VNĐ' : '') },
    { nhan: 'Hoa hồng OTA', so: t.hoaHong, tien: true, ghi: t.tyLeHoaHong + '% doanh thu' },
    { nhan: 'Doanh thu thực nhận', so: t.thucNhan, tien: true, muc: 'ok',
      ghi: t.theoBangGia === t.bookingSong
        ? 'cả ' + t.bookingSong + ' booking theo bảng giá NET'
        : t.theoBangGia + '/' + t.bookingSong + ' booking theo bảng giá NET' },
    { nhan: 'Đặt trước trung bình', chu: t.datTruocCoDuLieu ? soVn(t.datTruocTb) + ' ngày' : '—',
      ghi: t.datTruocCoDuLieu
        ? 'trung vị ' + soVn(t.datTruocTrungVi) + ' ngày · ' + t.datTruocCoDuLieu + '/' + t.bookingSong + ' booking có ngày đặt'
        : 'chưa có đủ Ngày đặt và Ngày đi' },
    { nhan: 'Huỷ / hoàn tiền', so: t.huy + t.hoanTien, muc: t.tyLeHuy > 10 ? 'cao' : t.tyLeHuy > 0 ? 'vua' : 'ok',
      ghi: t.tyLeHuy + '% booking · hoàn ' + vnd(t.tienHoan) },
  ];

  let html = `<div class="the-hang">` + the.map((x) => `
    <div class="the ${x.muc || ''}" style="cursor:default">
      <div class="nhan">${esc(x.nhan)}</div>
      <div class="so">${x.chu != null ? esc(x.chu) : x.tien ? vnd(x.so) : soVn(x.so)}</div>
      <div class="ghi">${esc(x.ghi || '')}</div>
    </div>`).join('') + `</div>`;

  if (t.lechBangGia) {
    html += `<div class="canhbao xau"><div class="noi">
      <b>${soVn(t.lechBangGia)} booking có số OTA báo trả LỆCH bảng giá NET — tổng lệch ${vnd(t.tienLech)}</b>
      <p>Số dương là OTA trả <b>thiếu</b> so với hợp đồng. Ba nguyên nhân có thể:
      OTA trả sai, app map sai sản phẩm, hoặc bảng giá trong app đã cũ.
      Lọc cột "Thông tin cần xử lý" ở màn Booking mới để xem từng booking rồi đối chiếu
      với báo cáo thanh toán của OTA.</p>
    </div></div>`;
  }

  if (t.chuaMapSanPham || t.khongCoDoanhThu) {
    html += `<div class="canhbao"><div class="noi">
      <b>${soVn(t.chuaMapSanPham)} booking chưa map được sản phẩm trong bảng giá${
        t.khongCoDoanhThu ? `, trong đó ${soVn(t.khongCoDoanhThu)} booking chưa tính được doanh thu` : ''}</b>
      <p>Doanh thu ở trên còn khuyết đúng bằng số booking đó. Bổ sung sản phẩm (hoặc thêm
      tên gọi khác của tour) vào bảng giá ở tab <b>Dữ liệu Lark</b> là hết — không cần deploy lại.</p>
    </div></div>`;
  }

  if (t.ngoaiTe) {
    html += `<div class="canhbao"><div class="noi">
      <b>${soVn(t.ngoaiTe)} booking OTA bán bằng ${esc(t.dsNgoaiTe.join(' / '))}</b>
      <p><b>Doanh thu thực nhận vẫn ĐÚNG và ĐỦ</b> — nó lấy từ bảng giá NET nên luôn là VNĐ,
      không phụ thuộc OTA bán bằng tiền gì. Chỉ hai ô <i>Tổng tiền booking</i> và
      <i>Hoa hồng OTA</i> là không cộng các booking này, vì đó là số của OTA theo nguyên tệ
      và app không tự quy đổi tỷ giá.</p>
    </div></div>`;
  }

  if (t.hoaHongUocTinh) {
    html += `<div class="canhbao"><div class="noi">
      <b>${soVn(t.hoaHongUocTinh)} booking có hoa hồng ƯỚC TÍNH theo % cấu hình</b>
      <p>OTA không trả số hoa hồng thật cho những booking này. Số hoa hồng và thực nhận
      ở trên là con số tạm — đối chiếu với báo cáo thanh toán của OTA trước khi chốt sổ.</p>
    </div></div>`;
  }

  /* ---- lead time / thời gian đặt trước ---- */
  const nhomDatTruoc = [
    { ten: 'Cùng ngày', so: (t.datTruocNhom || {}).cungNgay || 0 },
    { ten: '1–3 ngày', so: (t.datTruocNhom || {}).motDenBa || 0 },
    { ten: '4–7 ngày', so: (t.datTruocNhom || {}).bonDenBay || 0 },
    { ten: '8–14 ngày', so: (t.datTruocNhom || {}).tamDenMuoiBon || 0 },
    { ten: 'Trên 14 ngày', so: (t.datTruocNhom || {}).trenMuoiBon || 0 },
  ];
  const maxDatTruoc = Math.max(1, ...nhomDatTruoc.map((x) => x.so));
  html += `<div class="khoi">
    <h2>Thời gian đặt trước <span class="phu">lead time = Ngày đi − Ngày đặt</span></h2>
    <div class="khoi-than">
      <div class="lead-grid">${nhomDatTruoc.map((x) => `<div class="lead-row">
        <span>${esc(x.ten)}</span><div class="thanh"><i style="width:${Math.round((x.so / maxDatTruoc) * 100)}%"></i></div>
        <b>${soVn(x.so)}</b></div>`).join('')}</div>
      <p class="manh lead-note">Đã tính ${soVn(t.datTruocCoDuLieu || 0)} booking còn hiệu lực.${
        t.datTruocThieu ? ' Còn ' + soVn(t.datTruocThieu) + ' booking thiếu Ngày đặt, thiếu Ngày đi hoặc ngày không hợp lệ.' : ' Không có booking thiếu ngày.'}</p>
    </div>
  </div>`;

  /* ---- theo kênh ---- */
  const maxNhan = Math.max(1, ...tk.kenh.map((k) => k.thucNhan));

  html += `<div class="khoi">
    <h2>Theo kênh OTA <span class="phu">sắp theo doanh thu thực nhận</span></h2>
    <div class="bang-boc"><table>
      <thead><tr>
        <th>Kênh</th><th class="so">Booking</th><th class="so">Khách</th><th class="so">Đặt trước TB</th>
        <th class="so">Tổng tiền</th><th class="so">Hoa hồng</th><th class="so">% HH</th>
        <th class="so">Thực nhận</th><th style="width:120px">Tỷ trọng</th>
        <th class="so">TB/booking</th><th class="so">Huỷ</th>
      </tr></thead>
      <tbody>${tk.kenh.filter((k) => k.booking).map((k) => `
        <tr>
          <td><span class="kenh">${esc(k.kenh)}</span></td>
          <td class="so">${soVn(k.bookingSong)}${
            k.ngoaiTe ? '<div class="manh">' + k.ngoaiTe + ' ' + esc(k.dsNgoaiTe.join('/')) + '</div>' : ''}</td>
          <td class="so">${soVn(k.khach)}</td>
          <td class="so">${k.datTruocCoDuLieu ? soVn(k.datTruocTb) + ' ngày' : '—'}</td>
          <td class="so">${tienOtaGop(k, k.tongTien)}</td>
          <td class="so">${tienOtaGop(k, k.hoaHong)}</td>
          <td class="so">${k.bookingVnd === 0 && k.ngoaiTe ? '<span class="manh">—</span>' : k.tyLeHoaHong + '%'}${
            k.bookingVnd && k.hoaHongCauHinh != null && Math.abs(k.tyLeHoaHong - k.hoaHongCauHinh) > 2
              ? '<div class="manh">cấu hình ' + k.hoaHongCauHinh + '%</div>' : ''}</td>
          <td class="so dam">${vnd(k.thucNhan)}</td>
          <td><div class="thanh"><i style="width:${Math.round((k.thucNhan / maxNhan) * 100)}%"></i></div></td>
          <td class="so">${tienOtaGop(k, k.tbBooking)}</td>
          <td class="so">${k.huy + k.hoanTien ? soVn(k.huy + k.hoanTien) + ' · ' + k.tyLeHuy + '%' : '—'}</td>
        </tr>`).join('')}</tbody>
      <tfoot><tr>
        <th>Tổng</th><th class="so">${soVn(t.bookingSong)}</th><th class="so">${soVn(t.khach)}</th>
        <th class="so">${t.datTruocCoDuLieu ? soVn(t.datTruocTb) + ' ngày' : '—'}</th>
        <th class="so">${vnd(t.tongTien)}</th><th class="so">${vnd(t.hoaHong)}</th>
        <th class="so">${t.tyLeHoaHong}%</th><th class="so">${vnd(t.thucNhan)}</th><th></th>
        <th class="so">${vnd(t.tbBooking)}</th><th class="so">${t.tyLeHuy}%</th>
      </tr></tfoot>
    </table></div>
  </div>`;

  /* ---- cần xử lý ---- */
  if (tk.canXuLy.length) {
    html += `<div class="khoi">
      <h2>Thông tin còn thiếu <span class="phu">gom theo loại, trong khoảng đang lọc</span></h2>
      <div class="khoi-than"><div class="pills">${tk.canXuLy.map((c) =>
        `<span class="chip ${/SĐT|điểm đón|ngày đi|tên khách|chưa xác nhận/i.test(c.nhan) ? 'xau' : 'canh'}">
          ${esc(c.nhan)} — ${soVn(c.so)}</span>`).join('')}</div></div>
    </div>`;
  }

  /* ---- theo tour ---- */
  if (tk.tour.length) {
    html += `<div class="khoi">
      <h2>Tour bán tốt nhất <span class="phu">top ${tk.tour.length}</span></h2>
      <div class="bang-boc"><table>
        <thead><tr><th>Tour / sản phẩm</th><th class="so">Booking</th><th class="so">Khách</th>
          <th class="so">Tổng tiền</th><th class="so">Thực nhận</th></tr></thead>
        <tbody>${tk.tour.map((x) => `<tr>
          <td>${esc(x.tour)}</td><td class="so">${soVn(x.bookingSong)}</td>
          <td class="so">${soVn(x.khach)}</td><td class="so">${tienOtaGop(x, x.tongTien)}</td>
          <td class="so">${vnd(x.thucNhan)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  }

  /* ---- theo ngày ---- */
  if (tk.ngay.length) {
    const max = Math.max(1, ...tk.ngay.map((x) => x.tongTien));
    html += `<div class="khoi">
      <h2>Theo ${esc((TRUONG.find((x) => x.id === tk.moc) || {}).ten || 'ngày')}
        <span class="phu">${tk.ngay.length} ngày có booking</span></h2>
      <div class="bang-boc"><table>
        <thead><tr><th>Ngày</th><th class="so">Booking</th><th class="so">Khách</th>
          <th class="so">Tổng tiền</th><th style="width:180px"></th><th class="so">Thực nhận</th></tr></thead>
        <tbody>${tk.ngay.map((x) => `<tr>
          <td>${ngayDay(x.ngay)}</td><td class="so">${soVn(x.bookingSong)}</td>
          <td class="so">${soVn(x.khach)}</td><td class="so">${tienOtaGop(x, x.tongTien)}</td>
          <td><div class="thanh"><i style="width:${Math.round((x.tongTien / max) * 100)}%"></i></div></td>
          <td class="so">${vnd(x.thucNhan)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  }

  return html;
}

/* -------------------------------------------------- màn Dữ liệu Lark ----- */
function veDuLieuLark() {
  const m = S.meta;
  if (!m) return `<div class="loading">Đang đọc cấu hình Lark…</div>`;

  const L = m.luocDo || {};
  const hd = L.huongDan || { tenBang: 'Bookings', cot: [], canThem: [], danhMuc: [] };
  const n = m.nhapBooking || {};
  const formUrl = n.url || m.baseUrl || '';
  const formTen = n.viewName || 'Nhập booking OTA';
  const apiOta = m.apiOta || [];
  const bg = m.bangGia || [];
  const cot = hd.cot || [];
  const tongCot = cot.length;
  const cotDaCo = cot.filter((x) => x.daCo).length;
  const batBuoc = cot.filter((x) => x.batBuoc);
  const batBuocDaCo = batBuoc.filter((x) => x.daCo).length;
  const canThem = hd.canThem || [];
  const khoaVanHanh = new Set(['gioDon', 'ghiChu', 'daNhan']);
  const canThemVanHanh = canThem.filter((x) => khoaVanHanh.has(x.key));
  const dmOta = (m.danhMuc && m.danhMuc.ota) || [];
  const dmTour = (m.danhMuc && m.danhMuc.tour) || [];
  const quyenChu = L.quyenGhi === true ? 'Đọc & cập nhật' : L.quyenGhi === false ? 'Chỉ đọc' : 'Đang kiểm tra';
  const quyenGhiChu = L.quyenGhi === false
    ? 'Đủ cho quy trình nhập trực tiếp tại Lark'
    : L.quyenGhi === true ? 'Có thể cập nhật một số trường vận hành' : 'Không ảnh hưởng việc xem số liệu';

  const nutNhap = formUrl
    ? `<a class="btn primary" href="${esc(formUrl)}" target="_blank" rel="noreferrer">+ ${n.laForm ? 'Mở form ' + esc(formTen) : 'Mở Lark để nhập'}</a>`
    : `<button class="btn primary" disabled>+ Mở ${esc(formTen)}</button>`;

  let html = '';

  if (m.nguon === 'hang-doi') {
    html += `<div class="canhbao"><div class="noi">
      <b>Đang soi hàng đợi kỹ thuật — đây không phải nguồn báo cáo chính thức</b>
      <p>Booking vận hành phải lấy từ bảng <b>Bookings</b> trong Lark Base.
        <a href="#" id="veBase">Quay lại Lark Base</a></p>
    </div></div>`;
  }

  if (!L.ok) {
    html += `<div class="canhbao xau"><div class="noi">
      <b>Chưa đọc được Lark Base — chưa thể lấy Bookings làm nguồn dữ liệu gốc</b>
      <p>${esc(gonLoi(L.loi || m.loi || 'Kiểm tra lại quyền chia sẻ và cấu hình Base.'))}</p>
      <p>Dữ liệu ở hàng đợi cục bộ chỉ là tạm thời, không dùng để chốt báo cáo.</p>
    </div></div>`;
  } else if (L.quyenGhi === false) {
    html += `<div class="canhbao lark-doc"><div class="noi">
      <b>Đã đọc được Lark Base ở chế độ chỉ đọc — phù hợp với luồng nhập tại Lark</b>
      <p>Nhân viên vẫn nhập booking trực tiếp trong view <b>${esc(formTen)}</b>; OTA Manager đọc,
        thống kê và cảnh báo bình thường. Chỉ các thao tác sửa booking ngay trong OTA Manager được ẩn.</p>
    </div></div>`;
  }

  if ((m.chuaDay || 0) > 0) {
    html += `<div class="canhbao"><div class="noi">
      <b>${soVn(m.chuaDay)} booking đang nằm trong hàng đợi kỹ thuật, chưa có trong Lark</b>
      <p>Luồng nhập tay hiện tại không tạo hàng đợi này. Đây thường là dữ liệu thử hoặc webhook cũ;
        chỉ đẩy lên Base sau khi đã kiểm tra để tránh trùng booking.</p>
    </div></div>`;
  }

  html += `<section class="lark-hero ${L.ok ? 'ok' : 'loi'}">
    <div class="lark-hero-copy">
      <span class="nhap-kicker">NGUỒN DỮ LIỆU GỐC DUY NHẤT</span>
      <h2>Lark Base · ${esc(L.tableTen || hd.tenBang || 'Bookings')}</h2>
      <p>OTA có booking → nhân viên nhập <b>một lần</b> vào Lark → OTA Manager tự đọc,
        hiện Booking mới, tính thống kê và cảnh báo. Không nhập lại trong Marketing Hub.</p>
    </div>
    <div class="lark-hero-actions">
      ${nutNhap}
      ${m.baseUrl ? `<a class="btn" href="${esc(m.baseUrl)}" target="_blank" rel="noreferrer">Mở bảng Bookings</a>` : ''}
    </div>
  </section>`;

  html += `<div class="khoi">
    <h2>Luồng vận hành hiện tại <span class="phu">dùng được ngay, không chờ API</span></h2>
    <div class="khoi-than">
      <div class="luong-du-lieu">
        <div class="luong-buoc"><span>1</span><b>OTA có booking</b><small>Klook · KKday · GYG · Trip.com · WAUG · MRT · Viator</small></div>
        <div class="luong-buoc nhan"><span>2</span><b>Nhân viên nhập 1 lần</b><small>View “${esc(formTen)}” trong Lark</small></div>
        <div class="luong-buoc goc"><span>3</span><b>Lark Bookings</b><small>Nguồn dữ liệu chuẩn duy nhất</small></div>
        <div class="luong-buoc tu-dong"><span>4</span><b>OTA Manager tự xử lý</b><small>Booking mới · thống kê · lead time · cảnh báo</small></div>
      </div>
    </div>
  </div>`;

  const tinhTrang = [
    { nhan: 'Kết nối Bookings', so: L.ok ? 'Đang đọc' : 'Chưa kết nối', ghi: L.ok ? (L.tableTen || hd.tenBang) : 'Cần kiểm tra Base', muc: L.ok ? 'tot' : 'xau' },
    { nhan: 'Dữ liệu hiện có', so: soVn(m.soBooking || 0) + ' booking', ghi: 'Đọc lại ' + gioPhut(m.luc), muc: L.ok ? 'tot' : 'canh' },
    { nhan: 'Danh mục OTA', so: soVn(dmOta.length) + '/7 kênh', ghi: m.danhMuc && m.danhMuc.tenBangOta || 'Danh mục OTA', muc: dmOta.length >= 7 ? 'tot' : 'canh' },
    { nhan: 'Danh mục Tour', so: soVn(dmTour.length) + ' tour', ghi: m.danhMuc && m.danhMuc.tenBangTour || 'Danh mục Tour', muc: dmTour.length ? 'tot' : 'canh' },
    { nhan: 'Cột bắt buộc', so: batBuocDaCo + '/' + batBuoc.length, ghi: batBuocDaCo === batBuoc.length ? 'Đủ để đọc dữ liệu chuẩn' : 'Còn thiếu cột', muc: batBuocDaCo === batBuoc.length ? 'tot' : 'xau' },
    { nhan: 'Quyền của app', so: quyenChu, ghi: quyenGhiChu, muc: L.ok ? 'tot' : 'canh' },
  ];

  html += `<div class="khoi">
    <h2>Tình trạng dữ liệu Lark <span class="phu">kiểm tra nguồn gốc trước khi xem báo cáo</span></h2>
    <div class="khoi-than">
      <div class="suc-khoe-grid">${tinhTrang.map((x) => `<div class="suc-khoe-card ${x.muc}">
        <span>${esc(x.nhan)}</span><b>${esc(x.so)}</b><small>${esc(x.ghi)}</small>
      </div>`).join('')}</div>
      <div class="lark-actions">
        ${m.quanLy ? `<button class="btn primary" id="btnLuocDo">Kiểm tra lại cấu trúc Lark</button>` : ''}
        ${m.quanLy && canThemVanHanh.length && L.noiBase && L.quyenGhi !== false
          ? `<button class="btn" id="btnTaoCotVanHanh" data-so="${canThemVanHanh.length}">Tạo ${canThemVanHanh.length} cột vận hành</button>` : ''}
        ${m.quanLy && m.chuaDay && L.quyenGhi !== false ? `<button class="btn" id="btnDay">Đẩy hàng đợi vào Base (${soVn(m.chuaDay)})</button>` : ''}
        ${m.baseUrl ? `<a class="btn" href="${esc(m.baseUrl)}" target="_blank" rel="noreferrer">Mở Lark Base</a>` : ''}
      </div>
      ${canThemVanHanh.length
        ? `<div class="cot-van-hanh-note ${L.quyenGhi === false ? 'xau' : ''}"><b>Còn thiếu: ${canThemVanHanh.map((x) => esc(x.ten)).join(' · ')}</b><span>${L.quyenGhi === false
            ? 'Ứng dụng đang chỉ có quyền xem nên chưa thể tạo cột.'
            : 'Nút “Tạo cột vận hành” chỉ thêm cột chưa có; không đổi dữ liệu, công thức hay cột hiện tại.'}</span></div>`
        : `<div class="cot-van-hanh-note tot"><b>Đã đủ 3 cột vận hành</b><span>Giờ đón · Ghi chú khách · Sales đã nhận</span></div>`}
    </div>
  </div>`;

  const cotNhap = [
    'OTA', 'ID booking', 'Tên khách', 'SĐT / Email', 'Ngày đặt', 'Ngày đi',
    'Tour', 'Người lớn / Trẻ em', 'Điểm đón / Giờ đón', 'Gross / Nguyên tệ',
    'Trạng thái', 'Ghi chú khách',
  ];
  const tuDong = [
    { ten: 'Tổng khách', nguon: 'Công thức Lark' },
    { ten: 'Gross VND', nguon: 'Công thức Lark' },
    { ten: 'Hoa hồng OTA', nguon: 'Danh mục OTA + công thức' },
    { ten: 'Doanh thu thu về', nguon: 'Danh mục Tour + công thức' },
    { ten: 'Lead time', nguon: 'OTA Manager tính từ Ngày đặt → Ngày đi' },
    { ten: 'Báo cáo ngày / tháng', nguon: 'OTA Manager tổng hợp' },
    { ten: 'Cảnh báo thiếu dữ liệu', nguon: 'OTA Manager kiểm tra' },
  ];

  html += `<div class="khoi">
    <h2>Form “${esc(formTen)}” <span class="phu">ngắn gọn cho nhân viên, không kéo ngang bảng nhiều cột</span></h2>
    <div class="khoi-than">
      <div class="form-lark-grid">
        <div class="form-lark-cot">
          <h3>Nhân viên nhập</h3>
          <p>Chỉ các thông tin có trên booking OTA. Thiếu SĐT hoặc điểm đón vẫn lưu, OTA Manager sẽ bật cảnh báo.</p>
          <div class="tag-list">${cotNhap.map((x) => `<span>${esc(x)}</span>`).join('')}</div>
        </div>
        <div class="form-lark-cot auto">
          <h3>Hệ thống tự xử lý</h3>
          <p>Không đưa các cột này vào form nhập để tránh nhân viên phải tính hoặc nhập lại.</p>
          <div class="auto-list">${tuDong.map((x) => `<div><b>${esc(x.ten)}</b><small>${esc(x.nguon)}</small></div>`).join('')}</div>
        </div>
      </div>
      <div class="form-lark-foot">
        <div>${n.laForm
          ? `Nút phía trên đang mở thẳng link form đã cấu hình.`
          : `Nút phía trên đang mở Lark Base; vào view <b>${esc(formTen)}</b> để nhập. Có thể gắn link form trực tiếp ở phần nâng cao bên dưới.`}</div>
        ${nutNhap}
      </div>
    </div>
  </div>`;

  html += `<div class="khoi">
    <h2>Danh mục chuẩn <span class="phu">sửa tại Lark, không sửa code</span></h2>
    <div class="khoi-than">
      <div class="danh-muc-grid">
        <article class="danh-muc-card">
          <span class="nhap-kicker">DANH MỤC OTA</span>
          <h3>${soVn(dmOta.length)} kênh đang đọc</h3>
          <p>Chuẩn hoá tên kênh, mã OTA, nguyên tệ và tỷ lệ hoa hồng.</p>
          ${S.perm.chiPhi ? `<div class="pills">${dmOta.map((k) => `<span class="chip">${esc(k.ten)} · ${k.hoaHong == null ? '—' : k.hoaHong + '%'}</span>`).join('')}</div>` : ''}
        </article>
        <article class="danh-muc-card">
          <span class="nhap-kicker">DANH MỤC TOUR</span>
          <h3>${soVn(dmTour.length)} tour / sản phẩm</h3>
          <p>Chuẩn hoá tour và giá thu về người lớn / trẻ em để báo cáo doanh thu luôn khớp Base.</p>
          <div class="pills"><span class="chip ${m.nguonGia === 'danh-muc' ? 'tot' : 'canh'}">${m.nguonGia === 'danh-muc' ? 'Đang dùng dữ liệu Lark' : 'Đang dùng dữ liệu dự phòng'}</span></div>
        </article>
      </div>
    </div>
  </div>`;

  if (S.perm.chiPhi && bg.length) {
    const duocSuaGia = !!(m.quanLy && S.perm.duocSua && L.quyenGhi !== false && m.nguonGia === 'danh-muc');
    html += `<div class="khoi"><details class="chi-tiet-lark bang-gia-edit" open>
      <summary>Xem bảng giá NET đang dùng <span>${bg.reduce((s, x) => s + (x.sanPham || []).length, 0)} dòng sản phẩm</span></summary>
      <div class="chi-tiet-than">
        <div class="bang-gia-toolbar">
          <div><b>${m.nguonGia === 'danh-muc' ? 'Giá đang đọc trực tiếp từ Danh mục Tour trên Lark' : 'Đang dùng bảng giá dự phòng'}</b>
            <small>${duocSuaGia ? 'Sửa tại đây sẽ cập nhật lại Lark Base.' : 'Muốn sửa trực tiếp cần quyền quản lý + quyền ghi Lark và nguồn giá Danh mục Tour.'}</small></div>
          ${duocSuaGia ? `<button class="btn primary" id="btnThemGia">+ Thêm sản phẩm</button>` : ''}
        </div>
        ${bg.map((ban) => `<h4>${ban.nguon === 'danh-muc' ? 'Đang hiệu lực từ Danh mục Tour' : 'Hiệu lực từ ' + ngayDay(ban.hieuLuc)}</h4>
          <div class="bang-boc"><table class="bang-gia-table"><thead><tr><th>Nhóm</th><th>Sản phẩm</th><th class="so">Người lớn</th><th class="so">Trẻ em</th><th>Luật nhận diện</th><th>Trạng thái</th>${duocSuaGia ? '<th></th>' : ''}</tr></thead>
          <tbody>${(ban.sanPham || []).map((sp) => `<tr data-gia-id="${esc(sp.recordId || '')}" data-gia-json="${esc(JSON.stringify({nhom:sp.nhom||'',ten:sp.ten||'',nguoiLon:sp.nguoiLon,treEm:sp.treEm,luat:sp.luat||'',dangBan:sp.dangBan!==false}))}">
            <td class="manh">${esc(sp.nhom)}</td><td class="dam">${esc(sp.ten)}</td>
            <td class="so">${vnd(sp.nguoiLon)}</td><td class="so">${vnd(sp.treEm)}</td><td class="manh luat-gia">${esc(sp.luat || '')}</td>
            <td><span class="chip ${sp.dangBan === false ? 'canh' : 'tot'}">${sp.dangBan === false ? 'Ngưng' : 'Đang dùng'}</span></td>
            ${duocSuaGia ? `<td class="gia-actions">${sp.recordId ? '<button class="btn nho" data-sua-gia>Sửa</button>' : '<span class="manh">Dự phòng</span>'}</td>` : ''}
          </tr>`).join('')}</tbody></table></div>`).join('')}
      </div>
    </details></div>`;
  }

  html += `<div class="khoi"><details class="chi-tiet-lark">
    <summary>Kiểm tra chi tiết cấu trúc bảng “${esc(hd.tenBang || 'Bookings')}”
      <span>${cotDaCo}/${tongCot} cột đã nhận diện${canThem.length ? ' · ' + canThem.length + ' cột nên thêm' : ''}</span></summary>
    <div class="chi-tiet-than">
      <p class="manh">OTA Manager dò cột theo tên, không phụ thuộc thứ tự. Cột công thức chỉ đọc, không bị app ghi đè.</p>
      <div class="bang-boc"><table>
        <thead><tr><th>Tên cột</th><th>Kiểu cột</th><th>Vai trò</th><th>Tình trạng</th></tr></thead>
        <tbody>${cot.map((c) => `<tr><td class="dam">${esc(c.ten)}</td><td>${esc(c.kieu)}</td>
          <td>${c.chiDoc ? '<span class="chip">Hệ thống tự tính / chỉ đọc</span>' : c.batBuoc ? '<span class="chip xau">Nhập bắt buộc</span>' : '<span class="manh">Dữ liệu nhập</span>'}</td>
          <td>${c.daCo ? '<span class="chip tot">Đã có</span>' : c.tuyChon ? '<span class="chip canh">Nên thêm</span>' : '<span class="chip xau">Còn thiếu</span>'}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
  </details></div>`;

  html += `<div class="khoi api-cho-khoi">
    <h2>API OTA — điểm chờ cho tương lai <span class="phu">không ảnh hưởng quy trình đang chạy</span></h2>
    <div class="khoi-than">
      <div class="api-cho-note"><b>Hiện tại: OTA → nhân viên nhập Lark → Bookings.</b>
        Khi một kênh được cấp API, chỉ thay bước đầu thành <b>API → Bookings</b>; Booking mới, thống kê và báo cáo phía sau giữ nguyên.</div>
      <div class="api-cho-grid">${apiOta.map((k) => `<article class="api-cho-card ${k.daCauHinh ? 'co-key' : ''}">
        <div><span class="ota-api-logo">${esc(k.ten.slice(0, 2).toUpperCase())}</span>
          <div><h3>${esc(k.ten)}</h3><p>Hiện tại: nhập tại Lark Base</p></div></div>
        <span class="api-cho-status ${k.daCauHinh ? 'co-key' : ''}">${k.daCauHinh ? 'Có credential · chờ bật' : 'Chưa được cấp API'}</span>
        <div class="api-duong"><span>Tương lai</span><b>API → Bookings</b></div>
      </article>`).join('')}</div>
    </div>
  </div>`;

  html += `<div class="khoi"><details class="chi-tiet-lark nho">
    <summary>Thiết lập nâng cao cho quản lý <span>không cần làm để vận hành hằng ngày</span></summary>
    <div class="chi-tiet-than">
      <p><b>Mở thẳng form:</b> tạo link chia sẻ của view/form “${esc(formTen)}”, rồi khai biến
        <code>OTA_INPUT_FORM_URL</code> trên Render. Nếu chưa khai, nút Nhập booking mở Base hiện tại.</p>
      <p><b>Tự cập nhật:</b> OTA Manager kiểm tra Lark mỗi ${Math.round(((m.tuDongLark || {}).moiMs || 60000) / 1000)} giây khi màn hình đang mở.
        Có thể đổi bằng <code>OTA_AUTO_REFRESH_MS</code>, tối thiểu 30.000 ms.</p>
      <p><b>API/Webhook:</b> hạ tầng nhận dữ liệu vẫn được giữ trong backend để dùng sau này,
        nhưng không phải bước bắt buộc và không còn là trọng tâm của giao diện.</p>
    </div>
  </details></div>`;

  return html;
}


/* ================================================================ vẽ ==== */
function ve() {
  $('#filters').hidden = S.tab === 'lark';
  const el = $('#view');
  el.innerHTML = S.tab === 'moi' ? veBookingMoi()
    : S.tab === 'thongke' ? veThongKe()
    : veDuLieuLark();
  ganSuKienView();
}

/**
 * Huy hiệu tự cập nhật Lark.
 *
 * Booking hiện được nhập trực tiếp trong Lark nên SSE một mình không đủ: Lark
 * không bắn sự kiện vào app. Khi bật, client chủ động đọc lại Base theo chu kỳ;
 * SSE chỉ là đường nhanh dự phòng cho API/webhook trong tương lai.
 */
function veChipNguon() {
  const m = S.meta;
  const el = $('#nguonChip');
  if (!el || !m) return;
  const gio = (t) => (t ? new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');
  const giay = Math.round((((m.tuDongLark || {}).moiMs) || 60000) / 1000);

  if (m.nguon === 'hang-doi') {
    el.className = 'btn src off';
    el.innerHTML = '<span class="dot"></span>Hàng đợi cục bộ';
    el.title = 'Đây không phải nguồn báo cáo chính thức. Quay lại Lark Base ở băng cảnh báo.';
    el.onclick = () => moTab('lark');
    return;
  }

  if (S.live) {
    const tot = !!(m.luocDo && m.luocDo.ok) && !S.autoLoi;
    el.className = 'btn src ' + (tot ? 'on' : 'off');
    el.innerHTML = `<span class="dot"></span>${tot ? 'Tự cập nhật Lark' : 'Chờ kết nối Lark'}` +
      (S.liveLuc || m.luc ? ` <span class="t">${gio(S.liveLuc || m.luc)}</span>` : '');
    el.title = tot
      ? `Tự đọc lại bảng Bookings mỗi ${giay} giây. Bấm để tắt tự cập nhật.`
      : `Chưa đọc được Lark Base${S.autoLoi ? ': ' + gonLoi(S.autoLoi, 100) : ''}. Bấm để tắt.`;
  } else {
    el.className = 'btn src';
    el.innerHTML = `<span class="dot"></span>Đang xem ảnh chụp Base` +
      (m.luc ? ` <span class="t">${gio(m.luc)}</span>` : '');
    el.title = `Số liệu không tự đổi. Bấm để kiểm tra Lark mỗi ${giay} giây.`;
  }

  el.onclick = () => {
    S.live = !S.live;
    try { localStorage.setItem('ota-live', S.live ? '1' : '0'); } catch (_) {}
    if (S.live) {
      moLive();
      batTuDongLark();
      tuDongDocLark({ imLang: false });
    } else {
      dongLive();
      tatTuDongLark();
      veChipNguon();
    }
  };
}

/* ---------------------------------------------------- chế độ trực tiếp ---- */

/**
 * Mở luồng SSE. Server chỉ báo "có thay đổi" nên ở đây gọi lại API để lấy số —
 * không tin dữ liệu đi kèm gói tin, vì kênh SSE không qua bước cắt tiền theo quyền.
 */
function moLive() {
  if (!window.EventSource || (S.es && S.es.readyState !== 2)) return;
  try {
    const es = new EventSource('/api/su-kien');
    S.es = es;

    es.addEventListener('mo', () => { veChipNguon(); });

    es.addEventListener('booking', (ev) => {
      S.liveLuc = Date.now();
      let d = {};
      try { d = JSON.parse(ev.data || '{}'); } catch (_) {}
      toast((d.moi === false ? 'Cập nhật từ API · ' : 'Booking API mới · ') +
        [d.kenh, d.tenKhach || d.maBooking].filter(Boolean).join(' · '), 'tot');
      napChamTre();
    });

    es.addEventListener('sua', () => { S.liveLuc = Date.now(); napChamTre(); });

    es.onerror = () => {
      /* EventSource tự nối lại theo `retry:` server gửi — chỉ cần vẽ lại huy hiệu
       * cho người dùng thấy đang mất kết nối, đừng tự tạo kết nối thứ hai. */
      veChipNguon();
    };
  } catch (e) { S.es = null; }
}

function dongLive() {
  if (S.es) { try { S.es.close(); } catch (_) {} S.es = null; }
}

function chuKyTuDong() {
  return Math.max(30000, Number((S.meta && S.meta.tuDongLark && S.meta.tuDongLark.moiMs) || 60000));
}

function tatTuDongLark() {
  if (S.autoTimer) clearInterval(S.autoTimer);
  S.autoTimer = null;
}

function batTuDongLark() {
  tatTuDongLark();
  if (!S.live) return;
  S.autoTimer = setInterval(() => tuDongDocLark({ imLang: true }), chuKyTuDong());
}

/** Đọc lại Base thật, không chỉ lấy cache của server. */
async function tuDongDocLark({ imLang = true } = {}) {
  if (!S.live || S.autoDang || document.hidden || S.nguon === 'hang-doi') return;
  S.autoDang = true;
  const truoc = Number(S.meta && S.meta.soBooking) || 0;
  try {
    await goi('/api/refresh?nguon=base', { method: 'POST' });
    await napLai();
    const sau = Number(S.meta && S.meta.soBooking) || 0;
    S.liveLuc = Date.now();
    S.autoLoi = '';
    if (sau > truoc) toast(`${sau - truoc} booking mới đã được nhập vào Lark`, 'tot');
    else if (!imLang) toast('Đã đọc dữ liệu mới nhất từ Lark', 'tot');
  } catch (e) {
    S.autoLoi = e.message;
    if (!imLang) toast(gonLoi(e.message, 160), 'xau');
  } finally {
    S.autoDang = false;
    veChipNguon();
  }
}

/* Nhiều booking về liền nhau (OTA gửi cả lô) thì gộp lại một lần nạp — nếu không
 * mỗi gói tin là một lượt gọi API, dashboard nháy liên tục. */
let henNap = null;
function napChamTre() {
  clearTimeout(henNap);
  henNap = setTimeout(() => { napLai().catch(() => {}); }, 700);
}

function veDauTrang() {
  const m = S.meta;
  if (!m) return;
  S.perm = Object.assign({ chiPhi: true, duocSua: true }, m.perm || {});
  /* Luồng hiện tại là nhập tại Lark. Nếu app chỉ có quyền đọc thì vẫn báo cáo
   * đầy đủ, nhưng không hiện nút sửa để người dùng bấm rồi gặp lỗi quyền. */
  if (m.luocDo && m.luocDo.quyenGhi === false) S.perm.duocSua = false;

  $('#brandSub').textContent = (m.soBooking != null ? soVn(m.soBooking) + ' booking' : '') +
    (m.nguon === 'base' ? ' · Lark Base là nguồn dữ liệu gốc' : ' · đang xem hàng đợi cục bộ') +
    (S.perm.chiPhi ? '' : ' · chỉ xem vận hành');
  veChipNguon();
  $('#meChip').textContent = m.me ? m.me.name : (m.quanLy ? 'quản lý' : '—');

  const lb = $('#linkBase');
  if (m.baseUrl) { lb.href = m.baseUrl; lb.hidden = false; } else lb.hidden = true;

  const nb = $('#btnNhapBooking');
  const n = m.nhapBooking || {};
  if (nb && n.url) {
    nb.href = n.url;
    nb.textContent = '+ Nhập booking OTA';
    nb.title = n.laForm
      ? 'Mở thẳng form ' + (n.viewName || 'Nhập booking OTA')
      : 'Mở Lark Base rồi chọn view ' + (n.viewName || 'Nhập booking OTA');
    nb.hidden = false;
  } else if (nb) nb.hidden = true;

  /* Không có quyền chi phí thì bỏ luôn tab Thống kê và nút Xuất CSV — cả hai đều
   * là số tiền. Server cũng chặn, đây chỉ là để không hiện nút bấm vào là lỗi. */
  const tabTk = $('#tabs button[data-tab="thongke"]');
  if (tabTk) tabTk.hidden = !S.perm.chiPhi;
  $('#btnCsv').hidden = !S.perm.chiPhi;
  if (!S.perm.chiPhi && S.tab === 'thongke') S.tab = 'moi';
}

/** Chuyển tab bằng code. */
function moTab(id) {
  S.tab = id;
  S.nhom = '';
  $$('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === id));
  nap();
}

/* ============================================================ dữ liệu == */
async function napMeta() {
  S.meta = await goi('/api/meta' + (S.nguon ? '?nguon=' + S.nguon : ''));
  veDauTrang();
  veBoLoc();
}

async function nap() {
  try {
    if (S.tab === 'thongke') S.tk = await goi('/api/thongke?' + queryLoc());
    else if (S.tab === 'moi') {
      S.data = await goi('/api/bookings?' + queryLoc());
      /* Bảng Bookings chưa có cột "Sales đã nhận" ⇒ ẩn hẳn cột và nút "Nhận".
       * Hiện nút rồi bấm vào báo lỗi là cách nhanh nhất làm người dùng mất tin. */
      S.coDaNhan = S.data.coDaNhan !== false;
    }
    ve();
  } catch (e) {
    $('#view').innerHTML = `<div class="canhbao xau"><div class="noi">
      <b>${/quyền/i.test(e.message) ? 'Không đủ quyền' : 'Không nạp được dữ liệu'}</b>
      <p>${esc(gonLoi(e.message))}</p></div></div>`;
    if (!/quyền/i.test(e.message)) toast(gonLoi(e.message, 160), 'xau');
  }
}

async function napLai() {
  await napMeta();
  await nap();
}

/* ========================================================= cửa sổ ====== */
function moModal(html) {
  $('#modal').innerHTML = html;
  $('#modalWrap').hidden = false;
  hubChe(true);
}
function dongModal() {
  $('#modalWrap').hidden = true;
  $('#modal').innerHTML = '';
  hubChe(false);
}

function chiTiet(b) {
  const m = S.meta;
  const dong = (k, v) => `<dt>${esc(k)}</dt><dd>${v}</dd>`;
  moModal(`
    <h3>${esc(b.kenh)} · ${esc(b.maBooking || '(chưa có mã)')}</h3>
    <div class="modal-than">
      <dl class="dl">
        ${dong('Tên khách', esc(b.tenKhach || '—'))}
        ${dong('Số điện thoại', b.sdt ? esc(b.sdt) : '<span class="chip xau">chưa có</span>')}
        ${dong('Email', esc(b.email || '—'))}
        ${dong('Tour / sản phẩm', esc(b.tour || '—'))}
        ${dong('Ngày đi', ngayDay(b.ngayDi) + (b.gioDon ? ' · ' + esc(b.gioDon) : ''))}
        ${dong('Ngày đặt', ngayDay(b.ngayDat))}
        ${dong('Số khách', esc(veKhach(b)) + (b.tongKhach ? ' (tổng ' + b.tongKhach + ')' : ''))}
        ${dong('Điểm đón', b.diemDon ? esc(b.diemDon) : '<span class="chip xau">chưa có điểm đón</span>')}
        ${dong('Ghi chú của khách', esc(b.ghiChu || '—'))}
        ${dong('Ngôn ngữ / quốc tịch', esc(b.ngonNgu || '—'))}
        ${S.perm.chiPhi ? `
        ${dong('Sản phẩm (bảng giá)', b.sanPham
          ? esc(b.sanPham)
          : '<span class="chip xau">chưa map được sản phẩm</span>')}
        ${dong('OTA bán', tien(b.tongTien, b.tienTe))}
        ${dong('Hoa hồng OTA', tien(b.hoaHong, b.tienTe) + (b.hoaHongUocTinh ? ' <span class="chip canh">ước tính</span>' : ''))}
        ${dong('Thực nhận (VNĐ)', '<b>' + vnd(b.thucNhan) + '</b>' +
          (b.nguonThucNhan === 'bang-gia' ? ' <span class="chip tot">theo bảng giá NET</span>'
            : b.nguonThucNhan ? ' <span class="chip canh">' + esc(NGUON_TN[b.nguonThucNhan] || '') + '</span>' : ''))}
        ${b.thucNhanOta != null ? dong('Số OTA tự báo', tien(b.thucNhanOta, b.tienTe)) : ''}
        ${b.lechBangGia ? dong('Chênh lệch bảng giá',
          '<b class="lech">' + vnd(b.lechBangGia) + '</b> — ' +
          (b.lechBangGia > 0 ? 'OTA báo trả THIẾU so với bảng giá' : 'OTA báo trả cao hơn bảng giá')) : ''}` : ''}
        ${dong('Nhập vào Lark lúc', gioPhut(b.nhanLuc))}
        ${dong('Cần xử lý', veCo(b))}
      </dl>

      ${!S.perm.duocSua ? `<p class="manh" style="margin-top:20px">Bạn chỉ được xem, không được sửa
        booking. Quản lý cấp quyền trong bảng <b>Phân quyền app</b> của Marketing Hub.</p>` : `
      <h4 style="margin:20px 0 10px">Sửa phần OTA không trả</h4>
      <p class="manh" style="margin-top:0">Mã booking và số tiền là dữ liệu của OTA — app không cho
        sửa tay để còn đối chiếu được với báo cáo thanh toán.</p>
      <div class="suaform">
        <label>Số điện thoại<input type="text" id="sSdt" value="${esc(b.sdt)}"></label>
        <label>Email<input type="text" id="sEmail" value="${esc(b.email)}"></label>
        <label>Điểm đón / khách sạn<input type="text" id="sDiemDon" value="${esc(b.diemDon)}"></label>
        <label>Giờ đón<input type="text" id="sGioDon" value="${esc(b.gioDon)}" placeholder="07:45"></label>
        <label>Ngôn ngữ / quốc tịch<input type="text" id="sNgonNgu" value="${esc(b.ngonNgu)}"></label>
        <label>Trạng thái<select id="sTrangThai">${m.trangThai.map((t) =>
          `<option ${t === b.trangThai ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label style="grid-column:1/-1">Ghi chú của khách<textarea id="sGhiChu" rows="2">${esc(b.ghiChu)}</textarea></label>
      </div>`}
    </div>
    <div class="modal-chan">
      <button class="btn" data-dong="1">Đóng</button>
      ${!S.perm.duocSua || b.daNhan || !S.coDaNhan ? '' : `<button class="btn" id="btnNhanTrongModal">Nhận booking</button>`}
      ${S.perm.duocSua ? `<button class="btn primary" id="btnLuu" data-id="${esc(b.id)}">Lưu</button>` : ''}
    </div>`);

  const nutLuu = $('#btnLuu');
  if (nutLuu) nutLuu.onclick = async (ev) => {
    const nut = ev.currentTarget;
    nut.disabled = true;
    try {
      await goi('/api/booking/' + encodeURIComponent(b.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdt: $('#sSdt').value, email: $('#sEmail').value,
          diemDon: $('#sDiemDon').value, gioDon: $('#sGioDon').value,
          ngonNgu: $('#sNgonNgu').value, ghiChu: $('#sGhiChu').value,
          trangThai: $('#sTrangThai').value,
        }),
      });
      toast('Đã lưu booking ' + (b.maBooking || ''), 'tot');
      dongModal();
      await napLai();
    } catch (e) { toast(e.message, 'xau'); nut.disabled = false; }
  };
  const nhanNut = $('#btnNhanTrongModal');
  if (nhanNut) nhanNut.onclick = () => { dongModal(); nhanBooking(b.id); };
}

async function nhanBooking(id) {
  try {
    await goi('/api/booking/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daNhan: true }),
    });
    toast('Đã nhận booking', 'tot');
    await napLai();
  } catch (e) { toast(e.message, 'xau'); }
}

/** Cửa sổ "Thử mapping": payload mẫu bên trái, 20 trường app đọc ra bên phải. */
async function thuMapping(kenhId) {
  try {
    const d = await goi('/api/thu-mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kenh: kenhId }),
    });
    const b = d.booking;
    const hang = (k, ten, v) => `<tr><td>${esc(ten)}</td><td class="dam">${
      v == null || v === '' ? '<span class="chip xau">trống</span>' : esc(String(v))}</td>
      <td class="manh">${esc(d.nguon[k] || '—')}</td></tr>`;
    moModal(`
      <h3>Thử mapping — ${esc(kenhId)}</h3>
      <div class="modal-than">
        <p style="margin-top:0;color:var(--ink-2)">Chạy payload mẫu qua bộ chuẩn hoá,
          <b>không ghi gì</b>. Cột cuối cho biết mỗi trường lấy từ khoá nào trong payload —
          trường nào <span class="chip xau">trống</span> thì thêm tên khoá thật của OTA vào
          <code>chuanhoa.js → KENH_ALIAS.${esc(kenhId)}</code>.</p>
        <div class="bang-boc"><table>
          <thead><tr><th>Trường</th><th>Giá trị đọc được</th><th>Lấy từ</th></tr></thead>
          <tbody>
            ${hang('maBooking', 'Mã booking', b.maBooking)}
            ${hang('tenKhach', 'Tên khách', b.tenKhach)}
            ${hang('sdt', 'Số điện thoại', b.sdt)}
            ${hang('email', 'Email', b.email)}
            ${hang('ngayDat', 'Ngày đặt', b.ngayDat)}
            ${hang('ngayDi', 'Ngày đi', b.ngayDi)}
            ${hang('tour', 'Tên tour', b.tour)}
            ${hang('nguoiLon', 'Người lớn', b.nguoiLon)}
            ${hang('treEm', 'Trẻ em', b.treEm)}
            ${hang('tongKhach', 'Tổng khách', b.tongKhach)}
            ${hang('diemDon', 'Điểm đón', b.diemDon)}
            ${hang('gioDon', 'Giờ đón', b.gioDon)}
            ${hang('ghiChu', 'Ghi chú', b.ghiChu)}
            ${hang('ngonNgu', 'Ngôn ngữ/QT', b.ngonNgu)}
            ${hang('tienTe', 'Tiền tệ', b.tienTe)}
            ${hang('tongTien', 'Tổng tiền', b.tongTien)}
            ${hang('hoaHong', 'Hoa hồng', b.hoaHong)}
            ${hang('thucNhan', 'Thực nhận', b.thucNhan)}
            ${hang('trangThai', 'Trạng thái', b.trangThai)}
          </tbody>
        </table></div>
        <h4>Cần xử lý</h4>${veCo(b)}
        ${d.canhBao && d.canhBao.length ? '<h4>Cảnh báo</h4><ul>' +
          d.canhBao.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>' : ''}
        <h4>Payload mẫu</h4>
        <pre>${esc(JSON.stringify(d.payload, null, 2))}</pre>
      </div>
      <div class="modal-chan"><button class="btn" data-dong="1">Đóng</button></div>`);
  } catch (e) { toast(e.message, 'xau'); }
}

/* ========================================================= sự kiện ===== */
function formGiaHtml(d = {}) {
  return `<div class="gia-form-grid">
    <label>Nhóm<input id="giaNhom" value="${esc(d.nhom || '')}" placeholder="TOUR CANO"></label>
    <label>Sản phẩm<input id="giaTen" value="${esc(d.ten || '')}" placeholder="Tên tour / sản phẩm"></label>
    <label>Người lớn<input id="giaNl" type="number" min="0" step="1000" value="${d.nguoiLon == null ? '' : Number(d.nguoiLon)}"></label>
    <label>Trẻ em<input id="giaTe" type="number" min="0" step="1000" value="${d.treEm == null ? '' : Number(d.treEm)}"></label>
    <label class="gia-luat">Luật nhận diện<textarea id="giaLuat" rows="3" placeholder="(cano / speedboat / 3dao) VÀ (captreo / cablecar) — loại nếu có: 4dao / 4island">${esc(d.luat || '')}</textarea></label>
    <label class="gia-check"><input id="giaDangBan" type="checkbox" ${d.dangBan === false ? '' : 'checked'}> Đang bán / đang áp dụng</label>
  </div>`;
}

function moFormGia(recordId, data) {
  const wrap = $('#modalWrap');
  const moi = !recordId;
  $('#modalTitle').textContent = moi ? 'Thêm sản phẩm vào bảng giá NET' : 'Sửa bảng giá NET';
  $('#modalBody').innerHTML = formGiaHtml(data || {});
  $('#modalFoot').innerHTML = `<button class="btn" data-dong>Hủy</button><button class="btn primary" id="btnLuuGia">${moi ? 'Thêm sản phẩm' : 'Lưu thay đổi'}</button>`;
  wrap.hidden = false; hubChe(true);
  const btn = $('#btnLuuGia');
  btn.onclick = async () => {
    const payload = {
      nhom: $('#giaNhom').value.trim(), ten: $('#giaTen').value.trim(),
      nguoiLon: $('#giaNl').value === '' ? null : Number($('#giaNl').value),
      treEm: $('#giaTe').value === '' ? null : Number($('#giaTe').value),
      luat: $('#giaLuat').value.trim(), dangBan: $('#giaDangBan').checked,
    };
    if (!payload.ten) return toast('Nhập tên sản phẩm trước khi lưu', 'xau');
    if (!Number.isFinite(payload.nguoiLon) || payload.nguoiLon < 0 || !Number.isFinite(payload.treEm) || payload.treEm < 0) {
      return toast('Giá người lớn / trẻ em phải là số từ 0 trở lên', 'xau');
    }
    btn.disabled = true; btn.textContent = 'Đang lưu vào Lark…';
    try {
      await goi(recordId ? '/api/danh-muc-tour/' + encodeURIComponent(recordId) : '/api/danh-muc-tour', {
        method: recordId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      dongModal(); toast(moi ? 'Đã thêm sản phẩm vào Lark Base' : 'Đã cập nhật bảng giá trên Lark Base', 'tot');
      await napLai();
    } catch (e) { toast(e.message, 'xau'); btn.disabled = false; btn.textContent = moi ? 'Thêm sản phẩm' : 'Lưu thay đổi'; }
  };
  $$('[data-dong]', $('#modalFoot')).forEach((b) => { b.onclick = dongModal; });
}

function ganSuKienView() {
  const el = $('#view');

  // thẻ số ở màn Booking mới
  $$('.the[data-nhom]', el).forEach((b) => {
    b.onclick = () => { S.nhom = S.nhom === b.dataset.nhom ? '' : b.dataset.nhom; ve(); };
  });
  const sapSeg = $('#sapSeg', el);
  if (sapSeg) sapSeg.onclick = (ev) => {
    const b = ev.target.closest('button[data-sap]');
    if (!b || b.dataset.sap === S.loc.sap) return;
    S.loc.sap = b.dataset.sap;
    nap();
  };

  const doiNguon = (n) => {
    S.nguon = n;
    try {
      // Không nhớ chế độ hàng đợi qua lần mở sau: báo cáo chính thức luôn quay về Base.
      if (n === 'base') localStorage.setItem('ota-nguon', 'base');
      else localStorage.removeItem('ota-nguon');
    } catch (_) {}
    napLai();
  };
  const lVe = $('#veBase', el);
  if (lVe) lVe.onclick = (e) => { e.preventDefault(); doiNguon('base'); };
  const lHd = $('#xemHangDoi', el);
  if (lHd) lHd.onclick = (e) => { e.preventDefault(); doiNguon('hang-doi'); };

  const bo = $('#boNhom', el);
  if (bo) bo.onclick = (e) => { e.preventDefault(); S.nhom = ''; ve(); };

  // dòng booking
  $$('tbody tr[data-id]', el).forEach((tr) => {
    tr.style.cursor = 'pointer';
    tr.onclick = (ev) => {
      if (ev.target.closest('button')) return;
      const nguon = S.nhom && S.data.vanHanh.nhom[S.nhom] ? S.data.vanHanh.nhom[S.nhom] : S.data.rows;
      const b = nguon.find((x) => x.id === tr.dataset.id);
      if (b) chiTiet(b);
    };
  });
  $$('button[data-nhan]', el).forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); nhanBooking(b.dataset.nhan); };
  });

  // Dữ liệu Lark và các công cụ kỹ thuật nâng cao
  $$('button[data-copy-env]', el).forEach((b) => {
    b.onclick = () => {
      navigator.clipboard.writeText(b.dataset.copyEnv || '')
        .then(() => { b.textContent = 'Đã copy'; setTimeout(() => { b.textContent = 'Copy tên biến'; }, 1500); })
        .catch(() => toast('Không copy được — chọn tên biến rồi Ctrl+C', 'xau'));
    };
  });
  $$('button[data-copy]', el).forEach((b) => {
    b.onclick = () => {
      navigator.clipboard.writeText(b.dataset.copy)
        .then(() => { b.textContent = 'Đã copy'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); })
        .catch(() => toast('Không copy được — bấm giữ để chọn rồi Ctrl+C', 'xau'));
    };
  });
  $$('button[data-thu]', el).forEach((b) => { b.onclick = () => thuMapping(b.dataset.thu); });

  const bThemGia = $('#btnThemGia', el);
  if (bThemGia) bThemGia.onclick = () => moFormGia('', { dangBan: true });
  $$('button[data-sua-gia]', el).forEach((b) => {
    b.onclick = () => {
      const tr = b.closest('tr[data-gia-id]');
      if (!tr || !tr.dataset.giaId) return;
      let d = {};
      try { d = JSON.parse(tr.dataset.giaJson || '{}'); } catch (_) {}
      moFormGia(tr.dataset.giaId, d);
    };
  });

  const bLuoc = $('#btnLuocDo', el);
  if (bLuoc) bLuoc.onclick = async () => {
    bLuoc.disabled = true;
    try {
      const d = await goi('/api/luoc-do', { method: 'POST' });
      toast(d.ok ? 'Đã nối Base — đủ cột bắt buộc' : (d.loi || 'Chưa nối được Base'), d.ok ? 'tot' : 'xau');
      await napLai();
    } catch (e) { toast(e.message, 'xau'); } finally { bLuoc.disabled = false; }
  };

  const bTaoCot = $('#btnTaoCotVanHanh', el);
  if (bTaoCot) bTaoCot.onclick = async () => {
    const so = Number(bTaoCot.dataset.so || 0);
    const dongY = window.confirm(
      `Tạo ${so} cột vận hành còn thiếu trong bảng Bookings?\n\n` +
      'Hệ thống chỉ thêm Giờ đón, Ghi chú khách và Sales đã nhận nếu chưa có. ' +
      'Không sửa dữ liệu, công thức hoặc cột hiện tại.'
    );
    if (!dongY) return;
    const cu = bTaoCot.textContent;
    bTaoCot.disabled = true;
    bTaoCot.textContent = 'Đang tạo cột…';
    try {
      const d = await goi('/api/tao-cot-van-hanh', { method: 'POST' });
      const tao = d.tao || [];
      const loi = d.loi || [];
      if (tao.length) toast('Đã tạo: ' + tao.map((x) => x.ten).join(', '), 'tot');
      else if (!loi.length) toast('Ba cột vận hành đã có sẵn, không tạo trùng', 'tot');
      loi.slice(0, 3).forEach((x) => toast(x.ten + ': ' + x.loi, 'xau'));
      await napLai();
    } catch (e) { toast(e.message, 'xau'); }
    finally { bTaoCot.disabled = false; bTaoCot.textContent = cu; }
  };

  const bDay = $('#btnDay', el);
  if (bDay) bDay.onclick = async () => {
    bDay.disabled = true;
    try {
      const d = await goi('/api/day-hang-doi', { method: 'POST' });
      toast('Đã đẩy ' + d.day + ' booking mới, cập nhật ' + d.capNhat +
        (d.con ? ', còn tồn ' + d.con : ''), d.loi.length ? 'xau' : 'tot');
      if (d.loi.length) d.loi.slice(0, 3).forEach((x) => toast(x.maBooking + ': ' + x.loi, 'xau'));
      await napLai();
    } catch (e) { toast(e.message, 'xau'); } finally { bDay.disabled = false; }
  };

  const bMau = $('#btnMau', el);
  if (bMau) bMau.onclick = async () => {
    bMau.disabled = true;
    try {
      const d = await goi('/api/mau', { method: 'POST' });
      toast('Đã tạo ' + d.tao + ' booking mẫu (mỗi kênh một cái)', 'tot');
      S.tab = 'moi';
      $$('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === 'moi'));
      await napLai();
    } catch (e) { toast(e.message, 'xau'); } finally { bMau.disabled = false; }
  };
}

function ganSuKienChung() {
  $$('#tabs button').forEach((b) => { b.onclick = () => moTab(b.dataset.tab); });

  $('#mocSeg').onclick = (ev) => {
    const b = ev.target.closest('button[data-moc]');
    if (!b) return;
    S.loc.moc = b.dataset.moc;
    Object.assign(S.loc, apMoc(S.loc.moc));
    S.tuHub = false;
    if (window.hubBaoKhoang) window.hubBaoKhoang(S.loc.from, S.loc.to);
    veBoLoc(); nap();
  };
  $('#truongSeg').onclick = (ev) => {
    const b = ev.target.closest('button[data-truong]');
    if (!b) return;
    S.loc.truong = b.dataset.truong;
    veBoLoc(); nap();
  };
  $('#fKenh').onclick = (ev) => {
    const b = ev.target.closest('button[data-kenh]');
    if (!b) return;
    const k = b.dataset.kenh;
    S.loc.kenh = S.loc.kenh.includes(k) ? S.loc.kenh.filter((x) => x !== k) : S.loc.kenh.concat(k);
    veBoLoc(); nap();
  };
  $('#fTrangThai').onclick = (ev) => {
    const b = ev.target.closest('button[data-tt]');
    if (!b) return;
    const t = b.dataset.tt;
    S.loc.trangThai = S.loc.trangThai.includes(t)
      ? S.loc.trangThai.filter((x) => x !== t) : S.loc.trangThai.concat(t);
    veBoLoc(); nap();
  };
  $('#fFrom').onchange = () => { S.loc.from = $('#fFrom').value; S.loc.moc = ''; veBoLoc(); nap(); };
  $('#fTo').onchange = () => { S.loc.to = $('#fTo').value; S.loc.moc = ''; veBoLoc(); nap(); };

  let hen = null;
  $('#fTim').oninput = () => {
    clearTimeout(hen);
    hen = setTimeout(() => { S.loc.tim = $('#fTim').value.trim(); nap(); }, 300);
  };

  $('#btnBoLoc').onclick = () => {
    S.loc = { moc: 'tatca', truong: 'ngayDi', from: '', to: '', kenh: [], trangThai: [], tim: '',
              sap: 'ngayDi' };
    S.nhom = '';
    veBoLoc(); nap();
  };

  $('#btnRefresh').onclick = async (ev) => {
    ev.currentTarget.disabled = true;
    try {
      await goi('/api/refresh' + (S.nguon ? '?nguon=' + S.nguon : ''), { method: 'POST' });
      await napLai(); S.liveLuc = Date.now(); toast('Đã đọc dữ liệu mới nhất từ Lark', 'tot');
    }
    catch (e) { toast(e.message, 'xau'); }
    finally { ev.currentTarget.disabled = false; }
  };

  $('#btnCsv').onclick = () => { window.location = '/api/export.csv?' + queryLoc(); };


  // đóng cửa sổ
  $('#modalWrap').onclick = (ev) => {
    if (ev.target === $('#modalWrap') || ev.target.closest('[data-dong]')) dongModal();
  };
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') dongModal(); });

  /* Bộ lọc thời gian dùng chung của lớp vỏ: một nơi đổi, mọi app theo. */
  window.hubApKhoang = function (tu, den) {
    S.loc.from = tu || '';
    S.loc.to = den || '';
    S.loc.moc = tu ? '' : 'tatca';
    S.tuHub = !!tu;
    veBoLoc();
    nap();
  };
}

/* ============================================================== chạy ==== */
(async function () {
  Object.assign(S.loc, apMoc(S.loc.moc));
  try {
    const n = localStorage.getItem('ota-nguon');
    if (n === 'base') S.nguon = 'base';
    else localStorage.removeItem('ota-nguon');
    // Tự cập nhật mặc định BẬT: booking nhập ở Lark sẽ hiện mà không cần nhập lại
    S.live = localStorage.getItem('ota-live') !== '0';
  } catch (_) {}
  ganSuKienChung();
  try {
    await napMeta();
    /* Chưa nối Base thì vào thẳng Dữ liệu Lark — đây là nguồn duy nhất cần sửa. */
    if (!S.meta.luocDo.ok && !S.meta.soBooking) {
      S.tab = 'lark';
      $$('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === 'lark'));
    }
    await nap();
    S.liveLuc = S.meta.luc || 0;
    if (S.live) { moLive(); batTuDongLark(); }
  } catch (e) {
    $('#view').innerHTML = `<div class="canhbao xau"><div class="noi">
      <b>Không đọc được cấu hình app</b><p>${esc(e.message)}</p></div></div>`;
  }
})();

// Đóng luồng và timer khi rời trang.
window.addEventListener('beforeunload', () => { dongLive(); tatTuDongLark(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.live) tuDongDocLark({ imLang: true });
});
