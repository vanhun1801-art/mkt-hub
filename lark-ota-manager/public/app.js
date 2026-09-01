'use strict';
/* ============================================================================
 * Booking OTA — giao diện.
 *
 * Hai màn hình chính:
 *   "Booking mới"  — vận hành hằng ngày: hôm nay chạy tour nào, booking nào phải
 *                    gọi khách, cái nào chưa ai nhận. Bấm một thẻ số là bảng bên
 *                    dưới lọc theo đúng nhóm đó.
 *   "Thống kê OTA" — booking / khách / doanh thu / hoa hồng theo từng kênh.
 * Thêm "Thiết lập" để nối Base và lấy đường webhook đưa cho OTA.
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
  nguon: '',         // '' = auto · 'base' · 'hang-doi' (người xem tự chọn)
  live: true,        // chế độ Trực tiếp: booking về là hiện ngay (SSE)
  es: null,          // EventSource đang mở
  liveLuc: 0,        // lần cuối nhận được tín hiệu từ server
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
  { id: 'tatca', ten: 'Toàn bộ' },
];
const TRUONG = [
  { id: 'ngayDi', ten: 'Ngày đi' },
  { id: 'ngayDat', ten: 'Ngày đặt' },
  { id: 'nhanLuc', ten: 'Ngày về hệ thống' },
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
      quản lý bấm <b>Đẩy hàng đợi vào Base</b> ở tab Thiết lập.</p>
    </div></div>`;
  }
  if (d.loi) {
    html += `<div class="canhbao xau"><div class="noi"><b>${esc(d.loi)}</b>
      <p>Đang xem dữ liệu từ <b>${esc(d.nguon === 'base' ? 'Lark Base' : 'hàng đợi cục bộ')}</b>.
      Vào tab <b>Thiết lập</b> để xử lý.</p></div></div>`;
  }
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
        <button data-sap="nhanLuc" class="${S.loc.sap === 'nhanLuc' ? 'on' : ''}">Mới về hệ thống</button>
      </div>
      <span class="manh">${S.loc.sap === 'ngayDi'
        ? 'hôm nay lên đầu, rồi mai, mốt… tour đã chạy xuống cuối; cùng ngày thì theo giờ đón'
        : 'booking OTA vừa gửi về xếp trước'}</span>
    </div>
    ${veBangBooking(rows)}
  </div>`;
  return html;
}

/* ----------------------------------------------------- màn Thống kê ------ */
/**
 * Ô tiền của một dòng gộp (kênh / tour / ngày) mà TOÀN BỘ là booking ngoại tệ thì
 * phải in "— EUR" chứ không phải "0đ": in 0đ khiến người đọc tưởng dòng đó không
 * ra đồng nào, trong khi thật ra app cố ý không quy đổi ngoại tệ.
 */
const tienGop = (g, v) => (g.bookingVnd === 0 && g.ngoaiTe
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
    { nhan: 'Huỷ / hoàn tiền', so: t.huy + t.hoanTien, muc: t.tyLeHuy > 10 ? 'cao' : t.tyLeHuy > 0 ? 'vua' : 'ok',
      ghi: t.tyLeHuy + '% booking · hoàn ' + vnd(t.tienHoan) },
  ];

  let html = `<div class="the-hang">` + the.map((x) => `
    <div class="the ${x.muc || ''}" style="cursor:default">
      <div class="nhan">${esc(x.nhan)}</div>
      <div class="so">${x.tien ? vnd(x.so) : soVn(x.so)}</div>
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
      tên gọi khác của tour) vào bảng giá ở tab <b>Thiết lập</b> là hết — không cần deploy lại.</p>
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

  /* ---- theo kênh ---- */
  const maxNhan = Math.max(1, ...tk.kenh.map((k) => k.thucNhan));

  html += `<div class="khoi">
    <h2>Theo kênh OTA <span class="phu">sắp theo doanh thu thực nhận</span></h2>
    <div class="bang-boc"><table>
      <thead><tr>
        <th>Kênh</th><th class="so">Booking</th><th class="so">Khách</th>
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
          <td class="so">${tienGop(k, k.tongTien)}</td>
          <td class="so">${tienGop(k, k.hoaHong)}</td>
          <td class="so">${k.bookingVnd === 0 && k.ngoaiTe ? '<span class="manh">—</span>' : k.tyLeHoaHong + '%'}${
            k.bookingVnd && k.hoaHongCauHinh != null && Math.abs(k.tyLeHoaHong - k.hoaHongCauHinh) > 2
              ? '<div class="manh">cấu hình ' + k.hoaHongCauHinh + '%</div>' : ''}</td>
          <td class="so dam">${tienGop(k, k.thucNhan)}</td>
          <td><div class="thanh"><i style="width:${Math.round((k.thucNhan / maxNhan) * 100)}%"></i></div></td>
          <td class="so">${tienGop(k, k.tbBooking)}</td>
          <td class="so">${k.huy + k.hoanTien ? soVn(k.huy + k.hoanTien) + ' · ' + k.tyLeHuy + '%' : '—'}</td>
        </tr>`).join('')}</tbody>
      <tfoot><tr>
        <th>Tổng</th><th class="so">${soVn(t.bookingSong)}</th><th class="so">${soVn(t.khach)}</th>
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
          <td class="so">${soVn(x.khach)}</td><td class="so">${tienGop(x, x.tongTien)}</td>
          <td class="so">${tienGop(x, x.thucNhan)}</td></tr>`).join('')}</tbody>
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
          <td class="so">${soVn(x.khach)}</td><td class="so">${tienGop(x, x.tongTien)}</td>
          <td><div class="thanh"><i style="width:${Math.round((x.tongTien / max) * 100)}%"></i></div></td>
          <td class="so">${tienGop(x, x.thucNhan)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  }

  return html;
}

/* ----------------------------------------------------- màn Thiết lập ----- */
function veThietLap() {
  const m = S.meta;
  if (!m) return `<div class="loading">Đang đọc cấu hình…</div>`;
  const L = m.luocDo;
  let html = '';

  /* Đọc được nhưng KHÔNG ghi được — trạng thái nguy hiểm nhất vì trông như đang
   * chạy tốt: mọi số trên dashboard đều đúng (chúng chỉ đọc), chỉ có booking mới
   * là lặng lẽ nằm lại hàng đợi. Nên nó phải đứng trên cùng, màu đỏ. */
  if (L.ok && L.quyenGhi === false) {
    html += `<div class="canhbao xau"><div class="noi">
      <b>Đọc được Base nhưng KHÔNG ghi được — booking mới sẽ nằm lại hàng đợi</b>
      <p>Tài khoản Lark đang dùng chỉ có quyền <b>Xem</b> trên base
        "${esc(L.tableTen || '')}". Mọi con số trên các màn hình khác vẫn đúng vì
        chúng chỉ đọc — nhưng webhook về thì không ghi vào Base được.</p>
      <p><b>Cách sửa:</b> mở Base → <b>Chia sẻ</b> → nâng tài khoản (hoặc ứng dụng
        Lark, nếu chạy trên server chung) lên <b>Có thể chỉnh sửa</b>. Xong thì bấm
        <b>Làm mới lược đồ</b> ở dưới, rồi <b>Đẩy hàng đợi vào Base</b> — booking
        đang chờ không mất.</p>
    </div></div>`;
  }

  /* trạng thái nối base */
  if (L.ok) {
    html += `<div class="canhbao" style="background:var(--good-soft)"><div class="noi">
      <b>Đã nối Lark Base — booking ${L.quyenGhi === false ? 'ĐỌC được' : 'ghi thẳng'} vào bảng "${esc(L.tableTen || '')}"</b>
      <p>Bảng <code>${esc(L.tableId)}</code> · danh mục:
        <b>${esc(m.danhMuc.tenBangOta)}</b> ${(m.danhMuc.ota || []).length} kênh ·
        <b>${esc(m.danhMuc.tenBangTour)}</b> ${(m.danhMuc.tour || []).length} tour.</p>
      <p>Tiền do <b>công thức của Base</b> tính (Gross VND · Hoa hồng VND · Doanh thu thu về);
        app chỉ ghi dữ liệu thô và nối hai cột liên kết OTA / Tour. Nhờ vậy số ở đây
        và số trong Base luôn là một.</p>
      ${(L.huongDan.canThem || []).length ? `<p><b>Còn ${L.huongDan.canThem.length} cột nên thêm
        vào bảng "${esc(L.tableTen || '')}"</b> — thiếu thì app vẫn chạy, chỉ mất tính năng:</p>
        <ul style="margin:6px 0 0;padding-left:20px;line-height:1.7">${
          L.huongDan.canThem.map((c) => `<li><code>${esc(c.ten)}</code>
            <span class="manh">(${esc(c.kieu)}) — ${esc(c.viSao)}</span></li>`).join('')}</ul>`
        : '<p>Đủ cả cột tuỳ chọn.</p>'}
    </div></div>`;
  } else {
    html += `<div class="canhbao ${L.noiBase ? 'xau' : ''}"><div class="noi">
      <b>Chưa ghi được vào Lark Base — booking đang giữ ở hàng đợi cục bộ${
        m.chuaDay ? ' (' + soVn(m.chuaDay) + ' dòng chờ)' : ''}</b>
      <p>${esc(gonLoi(L.loi || ''))}</p>
      <p>Webhook vẫn nhận booking bình thường, không mất dòng nào. Làm xong bảng bên dưới
      thì bấm <b>Làm mới lược đồ</b> rồi <b>Đẩy hàng đợi vào Base</b>.</p>
      <p><b>Ổ đĩa Render là tạm</b> — hàng đợi mất sau mỗi lần deploy, nên nối Base càng sớm càng tốt.</p>
    </div></div>`;
  }

  html += `<div class="khoi"><h2>Việc cần làm
      <span class="phu">theo đúng thứ tự</span></h2><div class="khoi-than">
    <ol style="margin:0;padding-left:20px;line-height:1.9">
      <li>App bám sẵn bảng <code>${esc(L.huongDan.tenBang)}</code> của base Booking OTA
          cùng hai bảng danh mục. Đổi sang base khác thì khai
          <code>OTA_BASE_TOKEN</code> (đoạn token trong URL <code>.../base/<b>TOKEN</b>?table=…</code>),
          app tự dò lại table ID theo tên bảng.</li>
      <li>Thêm ${(L.huongDan.canThem || []).length || 'các'} cột tuỳ chọn ở khối trên nếu cần
          nút "Nhận booking" và giờ đón / ghi chú của khách.</li>
      <li>Đặt <code>OTA_WEBHOOK_SECRET</code> = một chuỗi ngẫu nhiên dài, rồi đưa cho từng OTA
          kèm đường dẫn ở khối "Webhook cho OTA" bên dưới.</li>
      <li>Giá thu về sửa thẳng trong <b>${esc(m.danhMuc.tenBangTour)}</b>, % hoa hồng sửa trong
          <b>${esc(m.danhMuc.tenBangOta)}</b> — không phải sửa code, không phải deploy lại.
          Sửa xong bấm <b>Làm mới lược đồ</b> để app đọc lại ngay.</li>
    </ol>
  </div></div>`;

  /* bảng cột cần tạo */
  html += `<div class="khoi">
    <h2>${L.huongDan.cot.length} cột app dùng của bảng "${esc(L.huongDan.tenBang)}"
      <span class="phu">dò theo TÊN cột, không theo thứ tự · cột "chỉ đọc" là công thức của Base</span></h2>
    <div class="bang-boc"><table>
      <thead><tr><th>Tên cột</th><th>Kiểu cột trong Base</th><th>App làm gì</th>
        <th>Trong Base</th><th>Ghi chú</th></tr></thead>
      <tbody>${L.huongDan.cot.map((c) => `<tr>
        <td class="dam">${esc(c.ten)}</td>
        <td>${esc(c.kieu)}</td>
        <td>${c.chiDoc ? '<span class="chip">chỉ đọc</span>'
          : c.batBuoc ? '<span class="chip xau">ghi · bắt buộc</span>'
          : '<span class="manh">ghi</span>'}</td>
        <td>${c.daCo ? '<span class="chip tot">đã có</span>'
          : c.tuyChon ? '<span class="chip canh">nên thêm</span>'
          : '<span class="chip canh">chưa có</span>'}</td>
        <td class="manh">${c.option ? 'Option: ' + esc(c.option.join(' · ')) : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="modal-chan" style="justify-content:flex-start">
      ${m.quanLy ? `
      <button class="btn primary" id="btnLuocDo">Làm mới lược đồ</button>
      <button class="btn" id="btnDay" ${m.chuaDay ? '' : 'disabled'}>Đẩy hàng đợi vào Base${
        m.chuaDay ? ' (' + soVn(m.chuaDay) + ')' : ''}</button>
      <button class="btn" id="btnMau">Tạo booking mẫu để xem thử</button>`
      : '<span class="manh">Ba thao tác thiết lập (dò lược đồ · đẩy hàng đợi · tạo booking mẫu) ' +
        'chỉ quản lý dùng được.</span>'}
    </div>
  </div>`;

  /* webhook — URL phải ĐÚNG với cách app đang được mở.
   * Mở trong Marketing Hub thì OTA gọi qua lớp vỏ: <hub>/ota/webhook/<kênh>.
   * Mở trực tiếp app này thì đường đó không tồn tại: <app>/webhook/<kênh>.
   * In sai một cái là chị copy về dán cho OTA rồi webhook chết âm thầm. */
  const trongHub = !!window.__HUB__;
  const duong = (id) => location.origin + (trongHub ? '/ota/webhook/' : '/webhook/') + id;
  html += `<div class="khoi">
    <h2>Webhook cho OTA <span class="phu">${m.webhook.coSecret
      ? 'đã có secret' : 'CHƯA có secret — hiện chỉ nhận webhook từ chính máy này'}</span></h2>
    <div class="khoi-than">
      <p style="margin-top:0;color:var(--ink-2)">Đưa cho mỗi OTA đúng một đường dẫn dưới đây.
        Gửi secret bằng header <code>x-ota-secret</code> (hoặc <code>?secret=…</code> nếu OTA
        không cho đặt header). Thêm <code>?dryRun=1</code> để thử mapping mà không ghi gì.</p>
      <div class="bang-boc"><table>
        <thead><tr><th>Kênh</th>
          <th>Đường dẫn ${trongHub ? '(đang mở trong Marketing Hub)' : '(đang mở trực tiếp app này)'}</th>
          <th></th></tr></thead>
        <tbody>${m.kenh.map((k) => {
          const url = duong(k.id);
          return `<tr><td><span class="kenh">${esc(k.ten)}</span></td>
            <td><code>${esc(url)}</code></td>
            <td><button class="btn small" data-copy="${esc(url)}">Copy</button>
                <button class="btn small" data-thu="${esc(k.id)}">Thử mapping</button></td></tr>`;
        }).join('')}</tbody>
      </table></div>
      <p class="manh">${trongHub
        ? 'Đây là đường công khai duy nhất của hub — nó nằm ngoài cổng đăng nhập Lark ' +
          '(máy của Klook/Viator không đăng nhập Lark được) và chỉ nhận POST đúng dạng này.'
        : 'Deploy sau Marketing Hub thì đường dẫn đưa cho OTA là ' +
          '<code>https://&lt;hub&gt;/ota/webhook/&lt;kênh&gt;</code> — chỉ hub mới có URL công khai.'}</p>
    </div>
  </div>`;

  /* ---- bảng giá NET ---- */
  const bg = m.bangGia || [];
  html += `<div class="khoi">
    <h2>Bảng giá NET <span class="phu">giá thu về / khách · ${
      m.nguonGia === 'danh-muc' ? 'đọc từ bảng "' + esc(m.danhMuc.tenBangTour) + '" trong Base'
      : m.nguonGia === 'env' ? 'từ biến OTA_GIA_JSON' : 'bảng dự phòng trong code'}</span></h2>
    <div class="khoi-than">
      <p style="margin-top:0;color:var(--ink-2)">Đây là <b>nguồn doanh thu chính</b>:
        thu về = số người lớn × giá NL + số trẻ em × giá TE — đúng công thức
        <code>Doanh thu thu về</code> của Base, vì cùng đọc một bảng giá. Booking bán bằng
        EUR/CNY vẫn ra doanh thu VNĐ.</p>
      ${m.nguonGia === 'danh-muc' ? `<p style="color:var(--ink-2)"><b>Sửa giá ở đâu:</b>
        mở bảng <b>${esc(m.danhMuc.tenBangTour)}</b> trong Base, sửa cột
        <code>Giá thu về NL</code> / <code>Giá thu về TE</code>. App đọc lại trong 10 phút,
        hoặc bấm <b>Làm mới lược đồ</b> để thấy ngay. Không cần sửa code.</p>` : ''}
      ${bg.map((ban) => `
        <h4 style="margin:14px 0 8px">${ban.nguon === 'danh-muc' ? 'Đang hiệu lực'
          : 'Hiệu lực từ ' + ngayDay(ban.hieuLuc)}
          <span class="manh">${esc(ban.ghiChu || '')}</span></h4>
        <div class="bang-boc"><table>
          <thead><tr><th>Nhóm</th><th>Sản phẩm</th>
            <th class="so">Người lớn</th><th class="so">Trẻ em (1m–1m4)</th>
            <th>Nhận diện từ tên tour OTA gửi</th></tr></thead>
          <tbody>${ban.sanPham.map((sp) => `<tr>
            <td class="manh">${esc(sp.nhom)}</td>
            <td class="dam">${esc(sp.ten)}</td>
            <td class="so">${vnd(sp.nguoiLon)}</td>
            <td class="so">${vnd(sp.treEm)}</td>
            <td class="manh" style="max-width:340px">${esc(sp.luat)}${
              sp.ghepVoi && sp.ghepVoi !== sp.ten
                ? '<div>≡ bảng giá cũ: ' + esc(sp.ghepVoi) + '</div>' : ''}${
              sp.recordId ? '' : '<div class="chip canh">chưa có trong danh mục</div>'}</td>
          </tr>`).join('')}</tbody>
        </table></div>`).join('')}
      <p class="manh">Chưa nối được Base thì app dùng bảng dự phòng trong code, sửa bằng biến
        môi trường <code>OTA_GIA_JSON</code>. Nối được rồi thì bảng trong Base luôn thắng.</p>
      <p class="manh">Cột "Nhận diện từ tên tour OTA gửi" là luật khớp tên tour đa ngôn ngữ
        (Anh · Trung · Hàn) — thứ quyết định booking nối được vào tour nào. Tour nào bị
        "không nhận ra" thì bổ sung tên gọi khác vào luật (trong <code>gia.js</code>) hoặc
        đặt lại tên trong danh mục cho gần tên OTA gửi.</p>
      <p class="manh"><b>Lưu ý:</b> bảng giá tính trẻ em theo <b>chiều cao 1m–1m4</b>, còn OTA
        gửi theo <b>tuổi</b>. App tính theo đúng cái OTA gửi rồi bật cờ nhắc xác nhận chiều cao
        tại điểm đón — nó không tự suy chiều cao từ tuổi được.</p>
    </div>
  </div>`;

  html += `<div class="khoi">
    <h2>% hoa hồng OTA giữ lại <span class="phu">${
      (m.danhMuc.ota || []).length ? 'đọc từ bảng "' + esc(m.danhMuc.tenBangOta) + '" trong Base'
      : 'bộ số dự phòng trong code'}</span></h2>
    <div class="khoi-than">
      ${(m.danhMuc.ota || []).length ? `
        <p style="margin-top:0;color:var(--ink-2)">Công thức <code>Hoa hồng VND</code> của Base
          lấy % từ đây, nên đây mới là số có hiệu lực. Hợp đồng đổi thì sửa cột
          <code>Hoa hồng %</code> trong bảng <b>${esc(m.danhMuc.tenBangOta)}</b> —
          không cần sửa code.</p>
        <div class="pills">${m.danhMuc.ota.map((k) =>
          `<span class="chip">${esc(k.ten)} — ${k.hoaHong == null ? '—' : k.hoaHong + '%'}${
            k.tienTe ? ' · ' + esc(k.tienTe) : ''}</span>`).join('')}</div>
        <p class="manh" style="margin-bottom:0">Bộ số dự phòng trong code
          (${m.kenh.map((k) => esc(k.ten) + ' ' + k.hoaHong + '%').join(' · ')})
          chỉ dùng khi chưa nối được Base.</p>`
      : `<div class="pills">${m.kenh.map((k) =>
          `<span class="chip">${esc(k.ten)} — ${k.hoaHong}%</span>`).join('')}</div>
        <p class="manh" style="margin-bottom:0">Chưa đọc được
          <b>${esc(m.danhMuc.tenBangOta)}</b>${m.danhMuc.loi ? ' (' + esc(m.danhMuc.loi) + ')' : ''}
          nên đang dùng bộ số dự phòng, đổi bằng <code>OTA_RATES_JSON</code>.</p>`}
    </div>
  </div>`;

  return html;
}

/* ================================================================ vẽ ==== */
function ve() {
  $('#filters').hidden = S.tab === 'thietlap';
  const el = $('#view');
  el.innerHTML = S.tab === 'moi' ? veBookingMoi()
    : S.tab === 'thongke' ? veThongKe()
    : veThietLap();
  ganSuKienView();
}

/**
 * Huy hiệu nguồn dữ liệu — cùng kiểu với app quảng cáo.
 *
 * Hai nguồn của app này: Lark Base (nơi lưu chính thức) và hàng đợi cục bộ
 * (booking webhook nhận được nhưng chưa đẩy lên Base được). Bấm để xem hàng đợi
 * kể cả khi Base đang tốt — đó là cách soi booking nào đang kẹt.
 */
/**
 * Huy hiệu nguồn — cùng kiểu và cùng chỗ với app quảng cáo.
 *
 *   🟢 Trực tiếp            — SSE đang mở, booking về là hiện ngay
 *   ⚪ Đang xem số trong Base — ảnh chụp tại thời điểm nạp, phải bấm Làm mới
 *
 * Bấm để đổi qua lại. Riêng việc xem HÀNG ĐỢI cục bộ không nằm ở huy hiệu này —
 * nó là việc soi lỗi, nằm ở đường link trong băng thông báo, để huy hiệu chỉ trả
 * lời đúng một câu: "số đang tự chảy về, hay đang đứng yên".
 */
function veChipNguon() {
  const m = S.meta;
  const el = $('#nguonChip');
  if (!el || !m) return;
  const gio = (t) => (t ? new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');
  const tenNguon = m.nguon === 'base' ? 'Lark Base' : 'hàng đợi cục bộ';

  if (S.live) {
    const song = !!(S.es && S.es.readyState === 1);
    el.className = 'btn src ' + (song ? 'on' : 'off');
    el.innerHTML = `<span class="dot"></span>${song ? 'Trực tiếp' : 'Đang nối lại…'}` +
      (S.liveLuc ? ` <span class="t">${gio(S.liveLuc)}</span>` : '');
    el.title = song
      ? 'Booking OTA gửi về là hiện ngay, không phải bấm Làm mới. Đang đọc từ ' + tenNguon + '.' +
        '\nBấm để tắt, chuyển sang xem ảnh chụp trong Base.'
      : 'Mất kết nối trực tiếp, đang tự nối lại. Bấm để tắt chế độ trực tiếp.';
  } else {
    el.className = 'btn src';
    el.innerHTML = `<span class="dot"></span>Đang xem số trong ` +
      (m.nguon === 'base' ? 'Base' : 'hàng đợi') + (m.luc ? ` <span class="t">${gio(m.luc)}</span>` : '');
    el.title = 'Số đọc từ ' + tenNguon + ' lúc ' + gio(m.luc) + ', KHÔNG tự cập nhật.' +
      '\nBấm để bật chế độ trực tiếp — booking về là hiện ngay.';
  }

  el.onclick = () => {
    S.live = !S.live;
    try { localStorage.setItem('ota-live', S.live ? '1' : '0'); } catch (_) {}
    if (S.live) { moLive(); napLai(); } else { dongLive(); veChipNguon(); }
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

    es.addEventListener('mo', () => { S.liveLuc = Date.now(); veChipNguon(); });

    es.addEventListener('booking', (ev) => {
      S.liveLuc = Date.now();
      let d = {};
      try { d = JSON.parse(ev.data || '{}'); } catch (_) {}
      toast((d.moi === false ? 'Cập nhật booking ' : 'Booking mới · ') +
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
  $('#brandSub').textContent = (m.soBooking != null ? soVn(m.soBooking) + ' booking' : '') +
    (m.nguon === 'base' ? ' · Lark Base' : ' · hàng đợi cục bộ') +
    (S.perm.chiPhi ? '' : ' · chỉ xem vận hành');
  veChipNguon();
  $('#meChip').textContent = m.me ? m.me.name : (m.quanLy ? 'quản lý' : '—');
  const lb = $('#linkBase');
  if (m.baseUrl) { lb.href = m.baseUrl; lb.hidden = false; } else lb.hidden = true;

  /* Không có quyền chi phí thì bỏ luôn tab Thống kê và nút Xuất CSV — cả hai đều
   * là số tiền. Server cũng chặn, đây chỉ là để không hiện nút bấm vào là lỗi. */
  const tabTk = $('#tabs button[data-tab="thongke"]');
  if (tabTk) tabTk.hidden = !S.perm.chiPhi;
  $('#btnCsv').hidden = !S.perm.chiPhi;
  if (!S.perm.chiPhi && S.tab === 'thongke') S.tab = 'moi';
}

/** Chuyển tab bằng code (chip nguồn, nút Webhook…). */
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
        ${dong('Về hệ thống lúc', gioPhut(b.nhanLuc))}
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
    try { localStorage.setItem('ota-nguon', n); } catch (_) {}
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

  // thiết lập
  $$('button[data-copy]', el).forEach((b) => {
    b.onclick = () => {
      navigator.clipboard.writeText(b.dataset.copy)
        .then(() => { b.textContent = 'Đã copy'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); })
        .catch(() => toast('Không copy được — bấm giữ để chọn rồi Ctrl+C', 'xau'));
    };
  });
  $$('button[data-thu]', el).forEach((b) => { b.onclick = () => thuMapping(b.dataset.thu); });

  const bLuoc = $('#btnLuocDo', el);
  if (bLuoc) bLuoc.onclick = async () => {
    bLuoc.disabled = true;
    try {
      const d = await goi('/api/luoc-do', { method: 'POST' });
      toast(d.ok ? 'Đã nối Base — đủ cột bắt buộc' : (d.loi || 'Chưa nối được Base'), d.ok ? 'tot' : 'xau');
      await napLai();
    } catch (e) { toast(e.message, 'xau'); } finally { bLuoc.disabled = false; }
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
      await napLai(); toast('Đã nạp lại', 'tot');
    }
    catch (e) { toast(e.message, 'xau'); }
    finally { ev.currentTarget.disabled = false; }
  };

  $('#btnCsv').onclick = () => { window.location = '/api/export.csv?' + queryLoc(); };

  $('#btnWebhook').onclick = () => moTab('thietlap');

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
    if (n === 'base' || n === 'hang-doi') S.nguon = n;
    // Trực tiếp mặc định BẬT: đây là màn vận hành, booking về phải thấy ngay
    S.live = localStorage.getItem('ota-live') !== '0';
  } catch (_) {}
  ganSuKienChung();
  try {
    await napMeta();
    /* Chưa nối Base và chưa có booking nào thì vào thẳng Thiết lập — người mở app
     * lần đầu cần biết phải làm gì, không phải nhìn một bảng trống. */
    if (!S.meta.luocDo.ok && !S.meta.soBooking) {
      S.tab = 'thietlap';
      $$('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === 'thietlap'));
    }
    await nap();
    if (S.live) moLive();
  } catch (e) {
    $('#view').innerHTML = `<div class="canhbao xau"><div class="noi">
      <b>Không đọc được cấu hình app</b><p>${esc(e.message)}</p></div></div>`;
  }
})();

// Đóng luồng khi rời trang, đừng để server giữ kết nối chết
window.addEventListener('beforeunload', dongLive);
