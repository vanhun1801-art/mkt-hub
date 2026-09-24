/* ==========================================================================
   Bản đồ du lịch Phú Quốc — Rooty Trip

   Bản đồ vector kiểu poster (25/09/2026, anh Hùng chọn lại hướng vector của bản đầu):
   hình học thật từ OpenStreetMap dựng sẵn ở hinh.js, vẽ bằng SVG nhiều lớp — không cần
   thư viện bản đồ, không cần mạng để hiện bản đồ. Điểm + tour từ Base Sản phẩm
   (du-lieu.js), tuyến tour theo đường bộ thật (OSRM), luồng tàu, đường bay, phương
   tiện chạy. Bản MapLibre trước đó còn ở tao/ (xem README).

   Tham số URL (dùng khi nhúng):
     ?diem=hon-thom   mở sẵn một điểm      ?tour=G4     mở sẵn một tour + vẽ tuyến
     ?lang=en         tiếng Anh            ?nhung=1     bỏ khối tiêu đề (trang web đã có)
     ?theme=toi       nền tối
   ========================================================================== */
(function () {
  'use strict';

  const H = window.PQ_HINH;
  const D = window.PQ_DU_LIEU;
  const Q = new URLSearchParams(location.search);
  const $ = (s, g) => (g || document).querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------------- chữ hai thứ tiếng ---------------- */
  const CHU = {
    vi: {
      tieuDe: 'Bản đồ du lịch Phú Quốc', phuDe: 'Phu Quoc tourism map',
      tim: 'Tìm điểm đến hoặc tour', diaDanh: 'Địa điểm', diaDiem: 'Địa điểm', tour: 'Tour',
      coTour: 'Có tour Rooty Trip', chuaTour: 'Điểm tham quan', quayLai: 'Quay lại',
      chiDuong: 'Chỉ đường', tourGhe: 'Tour ghé điểm này', veTai: 'Vé & dịch vụ tại đây',
      lichTrinh: 'Lịch trình trên bản đồ', suDungTai: 'Sử dụng tại', diemNoiBat: 'Điểm nổi bật',
      nguoiLon: 'Người lớn', treEm: 'Trẻ em', tu: 'Từ', moiKhach: '/khách', doanTu: 'Giá cho đoàn {n} khách',
      lienHe: 'Liên hệ để nhận giá', thoiLuong: 'Thời lượng', khoiHanh: 'Khởi hành',
      xemTour: 'Xem chi tiết tour', goi: 'Gọi đặt tour', zalo: 'Nhắn Zalo',
      noiBat: 'Nổi bật', sapRaMat: 'Sắp ra mắt', khongThay: 'Không tìm thấy kết quả phù hợp.',
      soTour: '{n} tour', tuGia: 'từ {g}', luongTau: 'Tàu cao tốc', duongBay: 'Đường bay',
    },
    en: {
      tieuDe: 'Phu Quoc Travel Map', phuDe: 'Bản đồ du lịch Phú Quốc',
      tim: 'Search places or tours', diaDanh: 'Places', diaDiem: 'Places', tour: 'Tours',
      coTour: 'Rooty Trip tour', chuaTour: 'Attraction', quayLai: 'Back',
      chiDuong: 'Directions', tourGhe: 'Tours visiting here', veTai: 'Tickets & services here',
      lichTrinh: 'Route on the map', suDungTai: 'Valid at', diemNoiBat: 'Highlights',
      nguoiLon: 'Adult', treEm: 'Child', tu: 'From', moiKhach: '/pax', doanTu: 'Price for a group of {n}',
      lienHe: 'Contact us for a quote', thoiLuong: 'Duration', khoiHanh: 'Departure',
      xemTour: 'View tour details', goi: 'Call to book', zalo: 'Chat on Zalo',
      noiBat: 'Featured', sapRaMat: 'Coming soon', khongThay: 'No matching results.',
      soTour: '{n} tours', tuGia: 'from {g}', luongTau: 'Fast ferry', duongBay: 'Flight path',
    },
  };

  const LOAI = {
    'cua-ngo': { vi: 'Cửa ngõ đến Phú Quốc', en: 'Getting to Phu Quoc' },
    'bien': { vi: 'Biển & đảo', en: 'Beaches & islands' },
    'vui-choi': { vi: 'Vui chơi giải trí', en: 'Theme parks' },
    'van-hoa': { vi: 'Văn hoá & lịch sử', en: 'Culture & history' },
    'check-in': { vi: 'Check-in & phố đêm', en: 'Photo spots & nightlife' },
    'di-chuyen': { vi: 'Di chuyển', en: 'Transport' },
  };
  const LOAI_TOUR = {
    ghep: { vi: 'Tour ghép hằng ngày', en: 'Daily join-in tours' },
    rieng: { vi: 'Tour riêng', en: 'Private tours' },
    ve: { vi: 'Vé & dịch vụ', en: 'Tickets & services' },
  };
  const THU_TU_VUNG = ['bac', 'trung', 'nam', 'dao', 'dat-lien'];
  const mauLoai = (l) => 'var(--' + l + ')';

  const S = {
    lang: Q.get('lang') === 'en' ? 'en' : 'vi',
    tab: 'diem',
    loai: new Set(),
    chiTour: false,
    loaiTour: new Set(),
    tim: '',
    chon: null,          // { kieu: 'diem' | 'tour', id }
    lichSu: [],
    ngan: 'giua',        // ngăn kéo trên điện thoại: thu | giua | lon
  };

  const t = (k, bien) => {
    let s = (CHU[S.lang][k] ?? CHU.vi[k] ?? k);
    if (bien) for (const [a, b] of Object.entries(bien)) s = s.replace('{' + a + '}', b);
    return s;
  };
  const ten = (o) => (S.lang === 'en' && o.tenEn) ? o.tenEn : o.ten;

  /* Thời lượng / lịch khởi hành trên Base chỉ có tiếng Việt, theo vài mẫu cố định. */
  function dichEn(s) {
    if (S.lang !== 'en' || !s) return s;
    return s
      .replace(/(\d+)\s*ngày\s*(\d+)\s*đêm/gi, (_, n, d) => n + ' days ' + d + ' night' + (d > 1 ? 's' : ''))
      .replace(/(\d+)\s*ngày/gi, (_, n) => n + (n > 1 ? ' days' : ' day'))
      .replace(/\(?\s*từ đủ\s*0?(\d+)\s*vé\s*\)?/gi, (_, n) => '(min. ' + n + ' guests)')
      .replace(/Khởi hành từ\s*0?(\d+)\s*vé/gi, (_, n) => 'Min. ' + n + ' guests')
      .replace(/,?\s*đoàn đi riêng không ghép/gi, ', private group')
      .replace(/Mỗi ngày/gi, 'Daily')
      .replace(/Theo yêu cầu(\s*đoàn\s*\/\s*khách lẻ)?/gi, 'On request');
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const khongDau = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const tien = (n) => n == null ? '' : S.lang === 'en'
    ? n.toLocaleString('en-US') + ' VND'
    : n.toLocaleString('vi-VN') + 'đ';

  const DIEM = D.diem;
  const THEO_ID = new Map(DIEM.map((d) => [d.id, d]));
  const TOUR = D.tour;

  /* Giá "hiển thị" của một tour: sau ưu đãi nếu có, rồi giá công bố, rồi giá theo đoàn. */
  const giaHien = (tr) => tr.sauGiamNL ?? tr.giaNL ?? (tr.tuPax ? tr.tuPax.gia : null);

  const ICON = {
    thuyen: '<path d="M3 17c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0"/><path d="M5 14 4 10h16l-2 4"/><path d="M12 10V4l5 3-5 2"/>',
    xe: '<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M4 11h16M8 19v-3M16 19v-3"/><circle cx="8" cy="13.5" r=".6"/><circle cx="16" cy="13.5" r=".6"/>',
    ve: '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z"/><path d="M14 5v12" stroke-dasharray="2 2"/>',
    chiDuong: '<path d="m3 11 18-8-8 18-2-8-8-2Z"/>',
    quayLai: '<path d="m15 18-6-6 6-6"/>',
    goi: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
    mo: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  };
  const icon = (k) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICON[k] + '</svg>';
  const iconTour = (tr) => icon(tr.loai === 've' ? 've' : tr.tuyen.some((id) => THEO_ID.get(id)?.vung === 'dao') ? 'thuyen' : 'xe');

  /* ---------------- lọc ---------------- */
  function khopTim(chuoi) {
    if (!S.tim) return true;
    const k = khongDau(chuoi);
    return khongDau(S.tim).split(/\s+/).filter(Boolean).every((w) => k.includes(w));
  }
  const chuoiDiem = (d) => [d.ten, d.tenEn, d.moTa, d.moTaEn, LOAI[d.loai].vi, LOAI[d.loai].en].join(' ');
  const chuoiTour = (tr) => [tr.ma, tr.ten, tr.tenEn, ...tr.tuyen.map((id) => THEO_ID.get(id)?.ten)].join(' ');

  const diemHien = (d) =>
    (!S.loai.size || S.loai.has(d.loai)) &&
    (!S.chiTour || d.tour.length > 0) &&
    khopTim(chuoiDiem(d));

  const tourCuaDiem = (d) => d.tour.map((m) => TOUR[m]).filter(Boolean);
  const diemCuaTour = (tr) => tr.tuyen.length
    ? tr.tuyen.map((id) => THEO_ID.get(id)).filter(Boolean)
    : DIEM.filter((d) => d.tour.includes(tr.ma));

  /* ==========================================================================
     BẢN ĐỒ VECTOR KIỂU POSTER (25/09/2026)
     Anh Hùng gửi ảnh mẫu và chọn lại hướng vector của bản đầu, "chỉ thiếu các lớp".
     Các lớp, từ dưới lên — hình học đều là dữ liệu thật OpenStreetMap (tao/hinh.js):
       biển xanh rực có gợn sóng → quầng nước nông quanh đảo → bọt sóng trắng → viền cát
       → mặt đất xanh tươi → vùng rừng đậm → bãi cát → sông suối → đường
       → đồi núi đổ khối (đỉnh núi thật) → cây minh hoạ (thông, tán tròn, dừa) → thác
       → luồng tàu, đường bay, tuyến tour → phương tiện chạy → hình minh hoạ các điểm.
     Kinh nghiệm hiệu năng (23/09): hoạt ảnh nằm ở lớp riêng, lớp đất tĩnh khi không kéo.
     ========================================================================== */
  const HV = (window.PQ_HINH_VE && window.PQ_HINH_VE.theoDiem) || {};
  /* đo độ rộng chữ thật (chữ đậm tiếng Việt rộng hơn ước lượng theo số ký tự) */
  const gDo = document.createElement('canvas').getContext('2d');
  const boDo = new Map();
  const doRong = (chu, fs, dam) => {
    const k = chu + '|' + fs + '|' + dam;
    if (!boDo.has(k)) { gDo.font = dam + ' ' + fs + 'px "Be Vietnam Pro", system-ui, sans-serif'; boDo.set(k, gDo.measureText(chu).width + 2.4); }
    return boDo.get(k);
  };
  document.fonts && document.fonts.ready.then(() => { boDo.clear(); veLai(); });
  const khung = $('#khung');
  const laDienThoai = () => innerWidth <= 760;
  let theme = null;
  S.cam = { s: 1, tx: 0, ty: 0 };
  S.sVua = 1;

  const C = H.chieu;
  const chieu = (lat, lon) => [(lon - C.TAY) * C.K * C.COS, (C.BAC - lat) * C.K];
  const tuLonLat = (p) => chieu(p[1], p[0]);
  const tao = (tag, attrs, cha) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (cha) cha.appendChild(e);
    return e;
  };
  const duongSvg = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');

  /* ---------- ký hiệu thiên nhiên (cây, núi, thác) ---------- */
  const KY_HIEU =
    /* 25/09 (bản minh hoạ): cây semi-flat — 2–3 tông phẳng, bóng rất nhẹ, 5 biến thể để không
       lặp hoạ tiết: c-tron nhiệt đới · c-rung cây rừng · c-dua dừa · c-bui bụi thấp · c-nuic cây núi */
    '<symbol id="c-tron" viewBox="0 0 20 30"><ellipse cx="12" cy="28.2" rx="6" ry="1.5" fill="#14462a" opacity=".13"/><path d="M9.3 28.3 9.7 18h.7l.4 10.3Z" fill="#7a5a3a"/><g fill="#4f9a45"><circle cx="10" cy="15.4" r="6.6"/><circle cx="5.8" cy="16.4" r="3.9"/><circle cx="14.2" cy="16.6" r="3.9"/><circle cx="10" cy="9.4" r="4.9"/></g><g fill="#6aac4e"><circle cx="8.8" cy="14.4" r="5.2"/><circle cx="5.4" cy="15.4" r="3"/><circle cx="9.2" cy="8.8" r="3.9"/></g><g fill="#9bcf6a" opacity="0.9"><circle cx="7.4" cy="8.6" r="1.9"/><circle cx="4.6" cy="13.6" r="1.3"/></g></symbol>' +
    '<symbol id="c-rung" viewBox="0 0 20 30"><ellipse cx="12" cy="28.2" rx="5.4" ry="1.5" fill="#14462a" opacity=".13"/><path d="M9.3 28.3 9.7 20h.7l.4 8.3Z" fill="#7a5a3a"/><g fill="#2f7a3c"><circle cx="10" cy="17.6" r="5.6"/><circle cx="10" cy="11.4" r="5.2"/><circle cx="10" cy="6.2" r="3.6"/></g><g fill="#468c42"><circle cx="9" cy="16.8" r="4.4"/><circle cx="9.1" cy="10.8" r="4.1"/><circle cx="9.3" cy="5.8" r="2.8"/></g><g fill="#7fb65a" opacity="0.85"><circle cx="7.8" cy="7.4" r="1.4"/><circle cx="7" cy="13.2" r="1.4"/></g></symbol>' +
    '<symbol id="c-dua" viewBox="0 0 22 30"><ellipse cx="14" cy="28" rx="6.4" ry="1.6" fill="#14462a" opacity=".13"/><path d="M11 28Q13.6 18 12 9" fill="none" stroke="#8a6440" stroke-width="1.8" stroke-linecap="round"/><g fill="#3f9146"><path d="M12 9q-5.4-3.4-11.4 1.4 6-1.6 11.4-1.4Z"/><path d="M12 9q5.4-3.2 10.4 2.6-5-2.8-10.4-2.6Z"/><path d="M12 9q-5.2 1.2-7.4 7.4 3.2-5.2 7.4-7.4Z"/></g><g fill="#62ad4f"><path d="M12 9q-2.4-6.4-8.6-7.2 5.4 3 8.6 7.2Z"/><path d="M12 9q3.2-6.2 9.4-6-5.2 2-9.4 6Z"/><path d="M12 9q4.6 1.6 5.8 7.6-2.6-5.4-5.8-7.6Z"/></g><circle cx="12" cy="9.4" r="1.2" fill="#6a4a2a"/></symbol>' +
    '<symbol id="c-bui" viewBox="0 0 20 30"><ellipse cx="11.5" cy="27.4" rx="7" ry="1.4" fill="#14462a" opacity=".12"/><g fill="#4a9443"><circle cx="6" cy="24.6" r="3.4"/><circle cx="11" cy="23.4" r="4.2"/><circle cx="15.2" cy="24.8" r="3"/></g><g fill="#6aac4e"><circle cx="5.6" cy="24" r="2.5"/><circle cx="10.3" cy="22.6" r="3.1"/><circle cx="14.6" cy="24.3" r="2.1"/></g><g fill="#9bcf6a" opacity="0.9"><circle cx="9" cy="21" r="1.2"/></g></symbol>' +
    '<symbol id="c-nuic" viewBox="0 0 20 30"><ellipse cx="12" cy="28.2" rx="5" ry="1.5" fill="#14462a" opacity=".13"/><path d="M9.3 28.3 9.7 21h.7l.4 7.300000000000001Z" fill="#7a5a3a"/><path d="M10 3.2C13.4 8 16 15.6 16 21.4 12.6 24.4 7.4 24.4 4 21.4 4 15.6 6.6 8 10 3.2Z" fill="#2b6d3a"/><path d="M10 3.2C8 8.4 6.6 14 6.6 21.8 5.6 21.6 4.7 21.3 4 21.4 4 15.6 6.6 8 10 3.2Z" fill="#43864a"/><path d="M9.4 6.4C8.4 9.4 7.8 12 7.6 15" stroke="#7fb65a" stroke-width=".9" stroke-linecap="round" fill="none" opacity=".8"/></symbol>' +
    /* sao biển Rạch Vẹm + trụ cáp treo dạng giàn thép */
    '<symbol id="c-sao" viewBox="-10 -10 20 20"><path d="M-1.79 -7.18Q0.00 -10.40 1.79 -7.18L2.00 -2.75L6.28 -3.92Q9.89 -3.21 7.38 -0.52L3.23 1.05L5.67 4.76Q6.11 8.41 2.77 6.86L0.00 3.40L-2.77 6.86Q-6.11 8.41 -5.67 4.76L-3.23 1.05L-7.38 -0.52Q-9.89 -3.21 -6.28 -3.92L-2.00 -2.75Z" fill="#f26b3a" stroke="#b8431f" stroke-width=".7" stroke-linejoin="round"/>' +
    '<g fill="#ffd2a0"><circle cx="0.00" cy="-2.60" r=".8"/><circle cx="0.00" cy="-5.00" r=".8"/><circle cx="2.47" cy="-0.80" r=".8"/><circle cx="4.76" cy="-1.55" r=".8"/><circle cx="1.53" cy="2.10" r=".8"/><circle cx="2.94" cy="4.05" r=".8"/><circle cx="-1.53" cy="2.10" r=".8"/><circle cx="-2.94" cy="4.05" r=".8"/><circle cx="-2.47" cy="-0.80" r=".8"/><circle cx="-4.76" cy="-1.55" r=".8"/><circle r="1.3"/></g></symbol>' +
    '<symbol id="c-tru" viewBox="0 0 10 30"><ellipse cx="7" cy="29" rx="4.6" ry="1.1" fill="#0b2a20" opacity=".3"/>' +
    '<path d="M3.8 3 1.2 29M6.2 3 8.8 29" stroke="#6f7a84" stroke-width=".9" fill="none"/><path d="M3.4 7 6.6 11 2.9 15.5 7.3 20 2.2 25 7.9 28M6.6 7 3.4 11 7.1 15.5 2.7 20 7.8 25 2.1 28" stroke="#8e98a2" stroke-width=".45" fill="none"/>' +
    '<path d="M.6 2.2h8.8v1.6H.6Z" fill="#5b6570"/><circle cx="1.2" cy="2.4" r=".7" fill="#e0322b"/><circle cx="8.8" cy="2.4" r=".7" fill="#e0322b"/></symbol>' +
    '<symbol id="c-nui" viewBox="0 0 60 36"><path d="M2 34Q14 8 30 3 46 8 58 34Z" fill="#5fb14a"/>' +
    '<path d="M30 3Q46 8 58 34H30Q34 18 30 3Z" fill="#4a9a3c"/><path d="M30 3Q20 10 16 22q7-8 14-19Z" fill="#8fd068" opacity=".85"/>' +
    '<path d="M22 20q4 3 6 9M40 16q-2 7 2 14" fill="none" stroke="#3f8a33" stroke-width="1.2" stroke-linecap="round" opacity=".6"/></symbol>' +
    '<symbol id="c-thac" viewBox="0 0 30 34"><path d="M2 20Q4 6 15 4 26 6 28 20v4H2Z" fill="#3f9a45"/><path d="M11 6h8v22h-8Z" fill="#bfeefa"/>' +
    '<path d="M13 7v20M16 7v21M18 8v19" stroke="#fff" stroke-width="1" stroke-linecap="round"/>' +
    '<ellipse cx="15" cy="29" rx="11" ry="4" fill="#5ccaf0"/><path d="M8 29q3-1.6 6 0t6 0" fill="none" stroke="#fff" stroke-width="1"/></symbol>';

  /* ---------- dựng các lớp ---------- */
  const D0 = H.daoChinh + H.hon;
  khung.innerHTML =
    '<svg class="lop" id="svgNen" xmlns="' + NS + '"><defs>' +
    '<linearGradient id="toBien" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--bien-1)"/><stop offset="1" style="stop-color:var(--bien-2)"/></linearGradient>' +
    '<linearGradient id="toDat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--dat-1)"/><stop offset=".55" style="stop-color:var(--dat-2)"/><stop offset="1" style="stop-color:var(--dat-3)"/></linearGradient>' +
    '<pattern id="song" width="260" height="170" patternUnits="userSpaceOnUse">' +
    '<path d="M20 40q14-5 28 0" class="gon"/><path d="M150 22q10-4 20 0" class="gon"/><path d="M90 118q16-5 32 0" class="gon"/><path d="M210 140q9-3 18 0" class="gon"/></pattern>' +
    '<radialGradient id="toBienPQ"><stop offset="0" stop-color="#1bb0d8"/><stop offset=".55" stop-color="#15a9d5"/><stop offset=".8" stop-color="#0c95cb" stop-opacity=".9"/><stop offset="1" stop-color="#0a8fca" stop-opacity="0"/></radialGradient>' +
    '<filter id="bongGhim" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#0b3a30" flood-opacity=".35"/></filter>' +
    /* 26/09: hình riêng của anh Hùng — quầng sáng trắng ngà ôm viền (tách khỏi nền xanh) + bóng đổ nhẹ */
    '<filter id="sangHinh" x="-30%" y="-30%" width="160%" height="160%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.3" result="d"/>' +
    '<feGaussianBlur in="d" stdDeviation="2.4" result="m"/><feFlood flood-color="#fffbea" flood-opacity=".95"/><feComposite in2="m" operator="in" result="sang"/>' +
    '<feDropShadow in="SourceGraphic" dx="1.4" dy="2.2" stdDeviation="1.6" flood-color="#082a22" flood-opacity=".3" result="khoi"/>' +
    '<feMerge><feMergeNode in="sang"/><feMergeNode in="khoi"/></feMerge></filter>' +
    '<radialGradient id="toSangNen"><stop offset="0" stop-color="#fffbe6" stop-opacity=".75"/><stop offset=".5" stop-color="#fff3c8" stop-opacity=".35"/><stop offset="1" stop-color="#fff3c8" stop-opacity="0"/></radialGradient>' +
    '<filter id="khoiHinh" x="-25%" y="-25%" width="160%" height="160%"><feDropShadow dx="1.6" dy="2.2" stdDeviation="1.5" flood-color="#082a22" flood-opacity=".38"/></filter>' +
    KY_HIEU + (window.PQ_HINH_VE ? window.PQ_HINH_VE.defs : '') +
    '</defs><rect id="nenSong" width="100%" height="100%" fill="url(#song)" style="display:none"/></svg>' +
    '<svg class="lop" id="svgDat" xmlns="' + NS + '"><g class="the-gioi">' +
    '<ellipse class="bien-pq" cx="' + (H.rong / 2) + '" cy="' + (H.cao / 2) + '" rx="' + (H.rong / 2 + 230) + '" ry="' + (H.cao / 2 + 170) + '" fill="url(#toBienPQ)"/>' +
    '<path class="bong-dao" transform="translate(3 6)" d="' + D0 + '"/>' +
    '<image id="anhNen" preserveAspectRatio="none"/>' +
    '<path class="quang-3" d="' + D0 + '"/><path class="quang-2" d="' + D0 + '"/><path class="quang-1" d="' + D0 + '"/>' +
    '<path class="bot" d="' + D0 + '"/><path class="vien-cat" d="' + D0 + '"/>' +
    '<path class="dat" d="' + D0 + '"/>' +
    '<path class="rung" d="' + (H.rung || '') + '"/>' +
    '<path class="bai-cat" d="' + (H.cat || '') + '"/>' +
    '<path class="ho" d="' + (H.ho || '') + '"/><path class="song-ngoi" d="' + (H.song || '') + '"/>' +
    '<path class="duong-mon" d="' + (H.duongMon || '') + '"/><path class="duong-khu" d="' + (H.duongKhu || '') + '"/><path class="duong-nho" d="' + (H.duongNho || '') + '"/>' +
    '<path class="duong-phu" d="' + H.duongPhu + '"/>' +
    '<path class="duong-vien" d="' + H.duongChinh + '"/><path class="duong-chinh" d="' + H.duongChinh + '"/>' +
    '<g id="lopNha"></g>' +                              // 26/09: nhà đứng trên mặt đất → nằm TRÊN mọi con đường
    '<g id="lopSanBay"></g><g id="lopSaoBien"></g><g id="lopTuNhien"></g><g id="lopCapTreo"></g>' +
    '</g></svg>' +
    '<svg class="lop" id="svgDong" xmlns="' + NS + '"><g class="the-gioi"><g id="lopLuong"></g><g id="lopTuyen"></g></g>' +
    '<g id="lopChuLuong"></g><g id="lopXe"></g></svg>' +
    '<svg class="lop" id="svgTren" xmlns="' + NS + '"><g id="lopChu"></g><g id="lopHinh"></g><g id="lopNhan"></g><g id="lopGhim"></g><g id="lopBay"></g></svg>';
  /* THỨ TỰ LỚP (26/09, dưới → trên):
     nền thế giới · biển/đất (canvas) · đường · khối nhà · sân bay · cây · dây cáp       (svgDat, tĩnh)
     luồng tàu/bay · tuyến tour · chữ luồng · tàu, cano, thuyền buồm, bóng máy bay     (svgDong)
     chữ vùng/địa danh · HÌNH landmark (xa → gần) · SỐ + TÊN · cabin + máy bay        (svgTren)
     → số/tên không bị hình khác che; vật trên không (máy bay, cabin) luôn nổi trên cùng. */

  const $$ = (s) => khung.querySelector(s);
  /* ---------- nền bản đồ thế giới quanh Phú Quốc (anh Hùng 25/09) ----------
     Ngoài Phú Quốc là bản đồ thường như Google Maps: OpenFreeMap (dữ liệu OSM, miễn phí kể cả
     dùng thương mại, không cần khoá) vẽ bằng MapLibre, tải từ CDN khi có mạng. Riêng Phú Quốc
     vẫn là bản minh hoạ, phủ lên trên bằng một vùng biển riêng mép loang (.bien-pq).
     MapLibre không nhận thao tác — chỉ bám theo camera của bản đồ này mỗi khung hình.
     Mất mạng: chỉ còn nền xanh, phần Phú Quốc vẫn chạy đủ. */
  const lopTG = document.createElement('div');
  lopTG.id = 'lopTheGioi';
  khung.prepend(lopTG);
  let banDoTG = null;
  function veTheGioi() {
    if (!banDoTG) return;
    const { s, tx, ty } = S.cam;
    const pxDoLon = C.K * C.COS * s, pxDoLat = C.K * s;
    const lon = C.TAY + (innerWidth / 2 - tx) / pxDoLon, lat = C.BAC - (innerHeight / 2 - ty) / pxDoLat;
    /* MapLibre: 512 px cho 360° kinh độ ở mức 0 */
    banDoTG.jumpTo({ center: [lon, lat], zoom: Math.log2(pxDoLon * 360 / 512) });
  }
  (function taiTheGioi() {
    if (!navigator.onLine && navigator.onLine !== undefined) return;
    const BAN = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/';
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = BAN + 'maplibre-gl.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = BAN + 'maplibre-gl.js'; js.async = true;
    js.onload = () => {
      try {
        banDoTG = new window.maplibregl.Map({
          container: lopTG, style: 'https://tiles.openfreemap.org/styles/liberty',
          interactive: false, attributionControl: false, renderWorldCopies: false, fadeDuration: 0,
          center: [104, 10.2], zoom: 8,
        });
        /* tên địa danh ưu tiên tiếng Việt khi xem tiếng Việt */
        banDoTG.on('style.load', () => {
          /* biển của bản đồ nền cùng tông biển sâu của Phú Quốc → mép vùng minh hoạ loang liền mạch */
          for (const l of banDoTG.getStyle().layers) {
            try {
              if (l.type === 'fill' && /water|ocean|sea/.test(l.id)) banDoTG.setPaintProperty(l.id, 'fill-color', '#0a8fca');
              if (l.type === 'line' && /waterway|river/.test(l.id)) banDoTG.setPaintProperty(l.id, 'line-color', '#48c6ce');
            } catch (_) { /* lớp không đổi được */ }
          }
          if (S.lang !== 'vi') return;
          for (const l of banDoTG.getStyle().layers) {
            if (l.type === 'symbol' && l.layout && l.layout['text-field']) {
              try { banDoTG.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:vi'], ['get', 'name']]); } catch (_) { /* lớp không đổi được */ }
            }
          }
        });
        banDoTG.once('load', () => khung.classList.add('co-the-gioi'));
        veTheGioi();
      } catch (_) { banDoTG = null; }                            // trình duyệt không có WebGL
    };
    document.head.appendChild(js);
  })();


  const theGioi = { setAttribute: (k, v) => khung.querySelectorAll('#svgDong .the-gioi').forEach((g) => g.setAttribute(k, v)) };

  /* Lớp đất (ảnh nền, ~780 cây, 24 núi, ~4.000 đoạn đường) nặng khi vẽ lại mỗi khung hình.
     Đo 25/09 (máy không tăng tốc đồ hoạ): 62 ms/khung khi phóng. Nên trong lúc kéo/phóng,
     cả lớp được co giãn như MỘT bức ảnh bằng CSS transform (GPU làm, gần như miễn phí);
     dừng tay 160 ms mới vẽ lại nét sắc. Lớp vẽ rộng gấp đôi khung nhìn để kéo không hở mép. */
  const lopDat = $('#svgDat'), gDat = lopDat.querySelector('.the-gioi');
  let camDat = null, henDat = 0;
  const lechDat = () => [innerWidth / 2, innerHeight / 2];
  function ghiLopDat() {
    const c = S.cam, [ox, oy] = lechDat();
    gDat.setAttribute('transform', 'translate(' + (c.tx + ox).toFixed(2) + ' ' + (c.ty + oy).toFixed(2) + ') scale(' + c.s.toFixed(5) + ')');
    lopDat.style.transform = '';
    camDat = Object.assign({}, c);
  }
  function coGianLopDat() {
    if (!camDat) return ghiLopDat();
    const c = S.cam, [ox, oy] = lechDat(), k = c.s / camDat.s;
    if (Math.abs(k - 1) < 1e-6 && Math.abs(c.tx - camDat.tx) < .01 && Math.abs(c.ty - camDat.ty) < .01) return;
    const dx = c.tx + ox - k * (camDat.tx + ox), dy = c.ty + oy - k * (camDat.ty + oy);
    lopDat.style.transform = 'translate(' + dx.toFixed(2) + 'px, ' + dy.toFixed(2) + 'px) scale(' + k.toFixed(5) + ')';
    clearTimeout(henDat);
    henDat = setTimeout(ghiLopDat, 160);
  }

  /* ---------- nền nước + đất vẽ bằng canvas (một lần) ----------
     Theo bản đồ Sunset Town anh Hùng gửi 25/09: nước chuyển màu mượt từ xanh dương ngoài
     khơi sang xanh ngọc sát bờ, đất có kết cấu, đồi núi đổ bóng thật. SVG không làm mờ mịn
     được mà không tốn khung hình khi phóng, nên vẽ sẵn một ảnh canvas lớn rồi đặt vào lớp
     đất như một <image>: phóng/kéo chỉ còn là co giãn ảnh. Vẽ xong mới ẩn lớp vector dự phòng. */
  (function veNenCanvas() {
    /* 25/09 (bản minh hoạ): biển 4 tầng sâu → khơi → nông → lagoon (bỏ viền cyan phát sáng),
       bờ = nước nông → cát → đất, đất tô theo TẦNG ĐỘ CAO (đất – đồi – núi – rừng sâu) + sườn
       đón nắng sáng nhẹ, sườn khuất xanh sẫm — không còn mảng bóng đen. */
    const M = 90;                                              // lề biển quanh khung đảo (đơn vị bản đồ)
    const k = Math.min(laDienThoai() ? 1.6 : 2, 4000 / (H.cao + 2 * M));
    const w = Math.round((H.rong + 2 * M) * k), h = Math.round((H.cao + 2 * M) * k);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    if (!g || typeof Path2D === 'undefined') return;
    g.setTransform(k, 0, 0, k, M * k, M * k);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const dat = new Path2D(H.daoChinh + H.hon);
    const coBlur = 'filter' in g;
    const bien = new Path2D(); bien.rect(-M, -M, H.rong + 2 * M, H.cao + 2 * M); bien.addPath(dat);

    /* nước: vẽ trên ảnh nhỏ (k .7) rồi phóng lên — làm mờ trên ảnh lớn rất tốn (đo 25/09) */
    const kN = .7;
    const cn = document.createElement('canvas');
    cn.width = Math.round((H.rong + 2 * M) * kN); cn.height = Math.round((H.cao + 2 * M) * kN);
    const gn = cn.getContext('2d');
    gn.setTransform(kN, 0, 0, kN, M * kN, M * kN);
    gn.lineJoin = 'round'; gn.lineCap = 'round';
    const DAI = [
      [150, 'rgba(21, 169, 213, .32)', 40], [96, 'rgba(24, 174, 214, .4)', 26], [58, 'rgba(48, 188, 214, .48)', 16],
      [32, 'rgba(85, 205, 215, .6)', 9], [16, 'rgba(110, 214, 212, .72)', 4.5],
    ];
    for (const [rong, mau, mo] of DAI) {
      if (coBlur) gn.filter = 'blur(' + (mo * kN).toFixed(1) + 'px)';
      gn.strokeStyle = mau; gn.lineWidth = rong; gn.stroke(dat);
    }
    /* rạn san hô quanh đảo tour phía Nam: mảng xanh ngọc đậm mờ */
    const sh = H.sanHo || { ran: [], da: [] };
    if (coBlur) gn.filter = 'blur(' + (1.4 * kN).toFixed(1) + 'px)';
    gn.fillStyle = 'rgba(40, 150, 160, .38)';
    for (let i = 0; i < sh.ran.length; i += 3) { gn.beginPath(); gn.ellipse(sh.ran[i], sh.ran[i + 1], sh.ran[i + 2] * 1.4, sh.ran[i + 2], i, 0, 7); gn.fill(); }
    gn.filter = 'none';
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingQuality = 'high';
    g.drawImage(cn, 0, 0, w, h);
    g.setTransform(k, 0, 0, k, M * k, M * k);
    /* lagoon sát bờ, vẽ ở độ phân giải đủ để không nhoè */
    if (coBlur) g.filter = 'blur(' + (1.6 * k).toFixed(1) + 'px)';
    g.strokeStyle = 'rgba(141, 221, 210, .82)'; g.lineWidth = 7; g.stroke(dat);
    g.filter = 'none';
    /* chấm san hô nhỏ */
    g.fillStyle = 'rgba(255, 170, 140, .55)';
    for (let i = 0; i < sh.ran.length; i += 3) for (let j = 0; j < 3; j++) {
      g.beginPath(); g.arc(sh.ran[i] + Math.cos(i + j * 2.1) * sh.ran[i + 2] * .7, sh.ran[i + 1] + Math.sin(i * 1.7 + j * 2.1) * sh.ran[i + 2] * .5, .22, 0, 7); g.fill();
    }

    /* sóng trắng mảnh chạy quanh bờ, đứt quãng (một vòng lệch ra biển ~2,3 đơn vị) */
    (() => {
      const cs = document.createElement('canvas'); cs.width = w; cs.height = h;
      const gs = cs.getContext('2d');
      gs.setTransform(k, 0, 0, k, M * k, M * k); gs.lineJoin = 'round'; gs.lineCap = 'round';
      gs.setLineDash([5, 17]); gs.strokeStyle = '#fff'; gs.lineWidth = 5.2; gs.stroke(dat);
      gs.setLineDash([]); gs.globalCompositeOperation = 'destination-out'; gs.lineWidth = 4.2; gs.stroke(dat);
      gs.fill(dat);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = .38; g.drawImage(cs, 0, 0); g.restore();
    })();
    /* bọt sóng 1–2 px chỉ ở các bãi cát (phía biển) */
    g.save(); g.clip(bien, 'evenodd');
    g.strokeStyle = 'rgba(255, 255, 255, .65)'; g.lineWidth = 1.3; g.stroke(new Path2D(H.cat || ''));
    g.restore();

    const mauTang = [[0, [126, 187, 94]], [40, [111, 175, 85]], [110, [88, 158, 76]], [230, [62, 135, 68]], [420, [42, 110, 60]]];
    const tang = (e) => {
      for (let i = 1; i < mauTang.length; i++) {
        if (e <= mauTang[i][0]) {
          const [e0, c0] = mauTang[i - 1], [e1, c1] = mauTang[i], t = (e - e0) / (e1 - e0);
          const m = t * t * (3 - 2 * t);                        // chuyển mềm giữa hai tầng
          return [c0[0] + (c1[0] - c0[0]) * m, c0[1] + (c1[1] - c0[1]) * m, c0[2] + (c1[2] - c0[2]) * m];
        }
      }
      return mauTang[mauTang.length - 1][1];
    };
    /* ảnh màu địa hình: tầng độ cao + ánh sáng sườn (không đen: tối nhất là xanh rừng sâu) */
    const toDiaHinh = (aCao, aBong) => {
      const W = aCao.naturalWidth, Hh = aCao.naturalHeight;
      const c = document.createElement('canvas'); c.width = W; c.height = Hh;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(aCao, 0, 0); const dc = x.getImageData(0, 0, W, Hh).data;
      x.drawImage(aBong, 0, 0, W, Hh); const db = x.getImageData(0, 0, W, Hh).data;
      const ra = x.createImageData(W, Hh), o = ra.data;
      const SANG = [214, 236, 160], TOI = [28, 84, 50];
      for (let i = 0; i < W * Hh; i++) {
        const v = dc[i * 4] / 255, e = v * v * 600;
        let [r, gg, b] = tang(e);
        const hs = Math.max(-1, Math.min(1, (db[i * 4] - 128) / 110)) * Math.min(1, e / 25);
        if (hs > 0) { const t = hs * .36; r += (SANG[0] - r) * t; gg += (SANG[1] - gg) * t; b += (SANG[2] - b) * t; }
        else { const t = -hs * .34; r += (TOI[0] - r) * t; gg += (TOI[1] - gg) * t; b += (TOI[2] - b) * t; }
        o[i * 4] = r; o[i * 4 + 1] = gg; o[i * 4 + 2] = b; o[i * 4 + 3] = 255;
      }
      x.putImageData(ra, 0, 0);
      return c;
    };

    const veDat = (aBong, aCao) => {
      g.save();
      g.clip(dat);
      g.fillStyle = '#75af58'; g.fillRect(-M, -M, H.rong + 2 * M, H.cao + 2 * M);
      if (aBong && aCao) {
        if (coBlur) g.filter = 'blur(' + (.7 * k).toFixed(1) + 'px)';
        g.drawImage(toDiaHinh(aCao, aBong), 0, 0, H.rong, H.cao);
        g.filter = 'none';
      }
      /* kết cấu rất nhẹ (thay feTurbulence — vẽ một lần, không tốn khi phóng) */
      const ck = document.createElement('canvas');
      ck.width = Math.round(H.rong); ck.height = Math.round(H.cao);
      const gk = ck.getContext('2d');
      let s = 11;
      const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < 4200; i++) {
        const x = r() * H.rong, y = r() * H.cao, rr = 1.5 + r() * 5;
        gk.fillStyle = r() < .5 ? 'rgba(255, 255, 200, .05)' : 'rgba(30, 90, 45, .05)';
        gk.beginPath(); gk.arc(x, y, rr, 0, 7); gk.fill();
      }
      if (coBlur) g.filter = 'blur(' + (1.2 * k).toFixed(1) + 'px)';
      g.drawImage(ck, 0, 0, H.rong, H.cao);
      /* rừng (OSM): phủ nhẹ tông rừng sâu, mép mềm */
      if (coBlur) g.filter = 'blur(' + (3 * k).toFixed(1) + 'px)';
      g.fillStyle = 'rgba(35, 95, 54, .2)'; g.fill(new Path2D(H.rung || ''));
      g.filter = 'none';
      /* bờ: dải cát mảnh quanh đảo + bãi cát rộng ở các bãi tắm, viền sáng sát mép nước */
      g.strokeStyle = 'rgba(236, 214, 150, .85)'; g.lineWidth = 1.5; g.stroke(dat);
      const cat = new Path2D(H.cat || '');
      g.fillStyle = '#f3d594'; g.fill(cat);
      g.strokeStyle = '#f3d594'; g.lineWidth = 2.6; g.stroke(cat);
      g.strokeStyle = 'rgba(251, 236, 192, .9)'; g.lineWidth = .7; g.stroke(dat);
      /* đá nhỏ ven các đảo phía Nam */
      for (let i = 0; i < sh.da.length; i += 3) {
        g.fillStyle = '#9d9788'; g.beginPath(); g.arc(sh.da[i], sh.da[i + 1], sh.da[i + 2], 0, 7); g.fill();
        g.fillStyle = '#cfc9b8'; g.beginPath(); g.arc(sh.da[i] - sh.da[i + 2] * .3, sh.da[i + 1] - sh.da[i + 2] * .3, sh.da[i + 2] * .45, 0, 7); g.fill();
      }
      g.restore();

      const xong = (url) => {
        const anh = $$('#anhNen');
        anh.setAttribute('href', url);
        anh.setAttribute('x', -M); anh.setAttribute('y', -M);
        anh.setAttribute('width', H.rong + 2 * M); anh.setAttribute('height', H.cao + 2 * M);
        khung.classList.add('co-anh-nen');
      };
      if (cv.toBlob) cv.toBlob((b) => xong(b ? URL.createObjectURL(b) : cv.toDataURL()), 'image/png');
      else xong(cv.toDataURL());
    };

    const DH = window.PQ_DIA_HINH;
    if (DH && DH.cao) {
      const a = new Image(), b = new Image();
      let con = 2;
      const mot = () => { if (--con === 0) veDat(a, b); };
      a.onload = b.onload = mot;
      a.onerror = b.onerror = () => { con = -1; veDat(null, null); };
      a.src = DH.anh; b.src = DH.cao;
    } else veDat(null, null);
  })();

  /* ---------- đồi núi, cây, thác (lớp đất, tĩnh) ---------- */
  (function veTuNhien() {
    const lop = $$('#lopTuNhien');
    const vat = [];
    /* hình núi hoạt hình bỏ từ 25/09: đã có đổ bóng địa hình thật (dia-hinh.js) — vẽ chồng là lạc tông;
       không có ảnh địa hình (bản dựng thiếu) thì mới vẽ lại */
    for (const n of window.PQ_DIA_HINH ? [] : (H.nui || [])) {
      const w = 22 + Math.min(34, (n.cao || 150) / 12);
      vat.push({ y: n.y, e: ['use', { href: '#c-nui', x: n.x - w / 2, y: n.y - w * .6 + 2, width: w, height: w * .6 }] });
    }
    const c = H.cay || [];
    const KY = ['#c-tron', '#c-rung', '#c-dua', '#c-bui', '#c-nuic'];
    for (let i = 0; i < c.length; i += 4) {
      const [x, y, s, k] = [c[i], c[i + 1], c[i + 2], c[i + 3]];
      const h = s * 1.5, w = h * (k === 2 ? .73 : .67);
      /* tầng: cây to (tiền cảnh) luôn hiện; cây vừa/nhỏ chỉ hiện khi phóng gần (LOD, xem ban-do.css) */
      const tangCay = s >= 5.6 ? 1 : s >= 4.7 ? 2 : 3;
      vat.push({ y, e: ['use', { class: 'cay t' + tangCay, href: KY[k] || KY[0], x: x - w / 2, y: y - h, width: w, height: h }] });
    }
    const [tx, ty] = chieu(10.18378, 104.01534);               // thác Suối Tranh
    vat.push({ y: ty, e: ['use', { href: '#c-thac', x: tx - 9, y: ty - 10, width: 18, height: 20 }] });
    vat.sort((a, b) => a.y - b.y).forEach((v) => tao(v.e[0], v.e[1], lop));
  })();

  /* ---------- cụm nhà mini: đô thị + resort (tao/minh-hoa.js) — không vẽ từng toà thật ---------- */
  (function veNha() {
    const N = H.nha, l = $('#lopNha');
    if (!N) return;
    const toi = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
    const bong = tao('g', { class: 'nha-bong', transform: 'translate(.28 .38)' }, l);
    for (const m in N.khoi) tao('path', { d: N.khoi[m][0] + N.khoi[m][1] }, bong);
    for (const m in N.khoi) {
      tao('path', { d: N.khoi[m][0], fill: N.mau[m], class: 'nha-mai' }, l);
      tao('path', { d: N.khoi[m][1], fill: toi(N.mau[m], .84), class: 'nha-mai' }, l);
    }
    if (N.hoBoi) tao('path', { class: 'ho-boi', d: N.hoBoi }, l);
  })();

  /* ---------- sân bay, sao biển Rạch Vẹm, trụ + dây cáp treo (lớp đất, tĩnh) — anh Hùng 25/09 ---------- */
  (function veCongTrinh() {
    const cv = document.createElement('canvas').getContext('2d');
    const dat = typeof Path2D !== 'undefined' ? new Path2D(D0) : null;
    const laDat = (x, y) => (dat && cv ? cv.isPointInPath(dat, x, y) : false);

    /* đường băng theo OSM (10/28 dài 3 km + 10R/28L 3,6 km), đường lăn, sân đỗ, nhà ga —
       bề rộng phóng 1,6 lần cho đọc được khi xem cả đảo */
    const sb = H.sanBay, l = $('#lopSanBay');
    if (sb) {
      tao('path', { class: 'sb-san', d: sb.san }, l);
      tao('path', { class: 'sb-lan', d: sb.lan }, l);
      for (const b of sb.bang) {
        tao('path', { class: 'sb-bang', d: b.d, 'stroke-width': (b.rong * 1.6).toFixed(2) }, l);
        tao('path', { class: 'sb-tim', d: b.d }, l);
      }
      tao('path', { class: 'sb-ga', d: sb.ga }, l);
    }

    /* sao biển rải ở vùng nước nông sát bờ quanh Rạch Vẹm (chỉ đặt chỗ là nước) */
    const [rx, ry] = chieu(10.37368, 103.93804);
    let hat = 7;
    const rnd = () => { hat = (hat * 16807) % 2147483647; return hat / 2147483647; };
    const ls = $('#lopSaoBien');
    /* dọc bãi cạn hai bên Rạch Vẹm: điểm nước nào cách bờ ≤ 5 đơn vị (~370 m) thì được đặt */
    const satBo = (x, y) => [0, 1, 2, 3, 4, 5, 6, 7].some((i) => laDat(x + Math.cos(i * .785) * 5, y + Math.sin(i * .785) * 5));
    const daCo = [];
    for (let i = 0, n = 0; i < 3000 && n < 16; i++) {
      const g = rnd() * 6.283, kc = 2 + rnd() * 15;
      const x = rx + Math.cos(g) * kc * 1.4, y = ry + Math.sin(g) * kc * .8;
      if (laDat(x, y) || !satBo(x, y) || daCo.some(([a, b]) => Math.hypot(a - x, b - y) < 2.6)) continue;
      daCo.push([x, y]);
      const k = 1.1 + rnd() * 1.1;
      tao('use', { class: 'sao-bien', href: '#c-sao', x: -k, y: -k, width: 2 * k, height: 2 * k, transform: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + Math.round(rnd() * 72) + ')' }, ls);
      n++;
    }

    /* cáp treo Hòn Thơm: trụ đặt giữa mỗi hòn đảo dây đi qua (Hòn Dừa, Hòn Rỏi…), dây đôi */
    const lc = $('#lopCapTreo');
    for (const [a, b] of D.capTreo || []) {
      const A = THEO_ID.get(a), B = THEO_ID.get(b);
      if (!A || !B) continue;
      const dx = B.x - A.x, dy = B.y - A.y, dai = Math.hypot(dx, dy), nx = -dy / dai, ny = dx / dai;
      const tru = [];
      let chay = null;
      for (let t = .05; t <= .951; t += .005) {
        const tr = laDat(A.x + dx * t, A.y + dy * t);
        if (tr && chay === null) chay = t;
        if ((!tr || t > .945) && chay !== null) {
          const doan = t - chay;
          if (doan * dai > 1.5) { const so = doan * dai > 14 ? 2 : 1; for (let j = 1; j <= so; j++) tru.push(chay + doan * j / (so + 1)); }
          chay = null;
        }
      }
      for (const o of [-.28, .28]) tao('path', { class: 'day-cap', d: 'M' + (A.x + nx * o).toFixed(2) + ' ' + (A.y + ny * o).toFixed(2) + 'L' + (B.x + nx * o).toFixed(2) + ' ' + (B.y + ny * o).toFixed(2) }, lc);
      for (const t of tru) {
        const x = A.x + dx * t, y = A.y + dy * t, h = 9;
        tao('use', { href: '#c-tru', x: (x - h / 6).toFixed(2), y: (y - h / 30).toFixed(2), width: (h / 3).toFixed(2), height: h }, lc);
      }
    }
  })();

  /* ---------- luồng tàu + đường bay (nét đứt trên biển, có chữ) ---------- */
  const LUONG = [
    ...D.tuyenTau.map((t) => ({ k: 'tau', ten: t, pts: t.duong.map(tuLonLat) })),
    ...D.tuyenBay.map((t) => ({ k: 'bay', ten: t, pts: t.duong.map((p) => chieu(p[1], p[0])) })),
  ];
  for (const l of LUONG) {
    tao('path', { class: 'luong luong-' + l.k, d: duongSvg(l.pts) }, $$('#lopLuong'));
    l.chu = tao('text', { class: 'chu-luong chu-' + l.k }, $$('#lopChuLuong'));
  }

  /* ---------- chữ vùng biển + địa danh ---------- */
  /* nhãn vùng như bản đầu: Bắc đảo · Trung tâm · Nam đảo · Quần đảo An Thới (bỏ chữ trang trí
     lấy theo ảnh mẫu — anh Hùng 25/09) */
  const CHU_BIEN = D.vung.filter((v) => v.id !== 'dat-lien').map((v) => {
    const g = tao('g', { class: 'chu-bien' }, $$('#lopChu'));
    const a = tao('text', { class: 'chu-vung', 'text-anchor': 'middle' }, g);
    return { o: v, g, a, p: chieu(v.lat, v.lon) };
  });
  const CHU_NEN = D.diaDanh.map((v) => ({ o: v, e: tao('text', { class: 'chu-dia-danh ' + v.co, 'text-anchor': 'middle' }, $$('#lopChu')) }));

  /* ---------- sóng trang trí ---------- */
  const SONG = [[10.30, 103.82], [10.05, 103.92], [9.88, 104.06], [10.20, 104.10], [10.44, 104.07]].map((ll, i) => {
    const g = tao('g', { class: 'song-trang-tri' }, $$('#lopChuLuong'));
    const t = tao('g', { class: 'lac', style: 'animation-delay:' + (-i * .7) + 's' }, g);
    tao('path', { d: 'M-14 0q7-3.4 14 0t14 0', class: 'song-net' }, t);
    return { g, p: chieu(ll[0], ll[1]) };
  });

  /* ---------- phương tiện ---------- */
  const XE = [];
  function themXe(loai, diem, o) {
    o = o || {};
    const pts = diem.map((p) => ({ xy: p.xy, cao: p.cao || 0, giay: p.giay }));
    const doan = [];
    let tong = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i].xy[0] - pts[i - 1].xy[0], pts[i].xy[1] - pts[i - 1].xy[1]);
      const t = pts[i].giay != null ? pts[i].giay : l / 9;          // mặc định ~9 đơn vị/giây
      doan.push({ t }); tong += t;
    }
    const tren = loai === 'may-bay' || loai === 'cabin';            // vật trên không: nổi trên landmark
    const g = tao('g', { class: 'xe xe-' + loai }, $$(tren ? '#lopBay' : '#lopXe'));
    const gb = loai === 'may-bay' ? tao('g', { class: 'xe xe-bong-g' }, $$('#lopXe')) : null;
    /* hình riêng (hinh-rieng/xe-<loại>.png) nếu có: căn giữa đúng tâm như hình vẽ sẵn, giữ tỉ lệ file */
    /* nhiều mẫu cho một loại (xe-may-bay, xe-may-bay-2, …): chiếc thứ n dùng mẫu thứ n (vòng lại) */
    const HR = window.PQ_HINH_RIENG || {};
    const mau = ['xe-' + loai, ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => 'xe-' + loai + '-' + i)].filter((k) => HR[k]);
    themXe.dem = themXe.dem || {};
    const thu = themXe.dem[loai] = (themXe.dem[loai] || 0) + 1;
    const hr = mau.length ? HR[mau[(thu - 1) % mau.length]] : null;
    const ve1 = (cls) => {
      if (!hr) return tao('use', Object.assign(cls ? { class: cls } : {}, { href: '#xe-' + loai, width: 64, height: 64, x: -32, y: -32 }), cls ? gb || g : g);
      const tl = hr.w ? hr.h / hr.w : 1, co = 64 * (hr.co || 1), w = tl > 1 ? co / tl : co, h = w * tl;
      return tao('image', Object.assign(cls ? { class: cls } : {}, { href: hr.url || hr, width: w.toFixed(1), height: h.toFixed(1), x: (-w / 2).toFixed(1), y: (-h / 2).toFixed(1), preserveAspectRatio: 'xMidYMid meet' }), cls ? gb || g : g);
    };
    const bong = loai === 'may-bay' ? ve1('xe-bong') : null;
    const than = ve1();
    XE.push(Object.assign({ loai, pts, doan, tong, g, gb, bong, than, pha: o.pha || 0, khuHoi: !!o.khuHoi, nghi: o.nghi || 0 }));
  }
  D.tuyenBay.forEach((t, i) => themXe('may-bay', t.duong.map((p) => ({ xy: chieu(p[1], p[0]), cao: p[2], giay: p[3] })), { pha: i * .33, nghi: 10 }));
  D.tuyenTau.forEach((t) => {
    const ds = t.duong.map((p) => ({ xy: tuLonLat(p) }));
    themXe('tau', ds, { khuHoi: true }); themXe('tau', ds, { pha: .5, khuHoi: true });
  });
  const cacChang = (tr) => {
    const ra = [];
    for (let i = 0; i < tr.tuyen.length - 1; i++) {
      const c = D.chang[tr.tuyen[i] + '>' + tr.tuyen[i + 1]];
      if (c) ra.push(c);
    }
    return ra;
  };
  const noiChang = (ma) => { const tr = TOUR[ma]; if (!tr) return null; const c = cacChang(tr).filter((x) => x.k === 'bien'); return c.length ? c.flatMap((x) => x.c).map((p) => ({ xy: tuLonLat(p) })) : null; };
  const g4 = noiChang('G4'); if (g4) themXe('cano', g4);
  const g2 = noiChang('G2'); if (g2) themXe('cano', g2, { pha: .25, khuHoi: true });
  const rv = D.chang['rach-vem>ham-rong']; if (rv) themXe('cano', rv.c.map((p) => ({ xy: tuLonLat(p) })), { khuHoi: true });
  const cap = D.chang['ga-cap-treo>hon-thom'];
  /* 26/09: pha 0 · .31 · .55 · .8 — với đường khứ hồi, pha p và 1−p trùng vị trí, nên tránh cặp đối xứng */
  if (cap) for (const pha of [0, .31, .55, .8]) themXe('cabin', cap.c.map((p) => ({ xy: tuLonLat(p) })), { pha, khuHoi: true });
  [[[10.12, 103.935], [10.16, 103.925], [10.21, 103.925], [10.16, 103.94], [10.12, 103.935]],
    [[10.33, 103.82], [10.36, 103.815], [10.39, 103.83], [10.35, 103.83], [10.33, 103.82]]].forEach((v, i) =>
    themXe('buom', v.map(([a, b]) => ({ xy: chieu(a, b) })), { pha: i * .4 }));

  function viTri(x, t) {
    const chuKy = x.tong * (x.khuHoi ? 2 : 1) + x.nghi;
    let k = ((t + x.pha * chuKy) % chuKy + chuKy) % chuKy;
    if (k > x.tong * (x.khuHoi ? 2 : 1)) return null;
    const kChuKy = k;
    let nguoc = false;
    if (x.khuHoi && k > x.tong) { k = 2 * x.tong - k; nguoc = true; }
    let i = 0;
    while (i < x.doan.length - 1 && k > x.doan[i].t) { k -= x.doan[i].t; i++; }
    const f = Math.min(1, k / (x.doan[i].t || 1));
    const a = x.pts[i].xy, b = x.pts[i + 1].xy;
    let goc = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    if (nguoc) goc += 180;
    const cao = x.pts[i].cao + (x.pts[i + 1].cao - x.pts[i].cao) * f;
    const mo = x.khuHoi ? 1 : Math.min(1, kChuKy / 1.5, (x.tong - kChuKy) / 1.5);
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, goc, cao, mo: Math.max(0, mo) };
  }

  const IT_CHUYEN_DONG = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();
  const giay = () => IT_CHUYEN_DONG ? 20 : (performance.now() - t0) / 1000;
  function veXe() {
    const { s, tx, ty } = S.cam;
    const ti = s / S.sVua, t = giay();
    const co = Math.max(.34, Math.min(.8, .38 * Math.pow(ti, .4)));
    for (const x of XE) {
      const p = viTri(x, t);
      if (!p) { x.g.style.display = 'none'; if (x.gb) x.gb.style.display = 'none'; continue; }
      x.g.style.display = '';
      const k = co * (x.loai === 'may-bay' ? 1.7 + p.cao * .5 : x.loai === 'tau' ? 1.1 : x.loai === 'cabin' ? .55 : x.loai === 'buom' ? 1.6 : .9);
      const quay = x.loai === 'cabin' ? '' : x.loai === 'buom' ? (Math.cos(p.goc * Math.PI / 180) < 0 ? ' scale(-1 1)' : '') : ' rotate(' + p.goc.toFixed(1) + ')';
      x.g.setAttribute('transform', 'translate(' + (p.x * s + tx).toFixed(1) + ' ' + (p.y * s + ty).toFixed(1) + ') scale(' + k.toFixed(3) + ')' + quay);
      x.g.style.opacity = p.mo.toFixed(2);
      if (x.gb) { x.gb.style.display = ''; x.gb.setAttribute('transform', x.g.getAttribute('transform')); x.gb.style.opacity = p.mo.toFixed(2); }
      if (x.bong) x.bong.setAttribute('transform', 'translate(' + (p.cao * 18).toFixed(1) + ' ' + (p.cao * 22).toFixed(1) + ')');
    }
    const song = $$('#song');
    song.setAttribute('patternTransform', 'translate(' + ((tx * .6 + t * 6) % 120).toFixed(1) + ' ' + ((ty * .6 + Math.sin(t / 3) * 3) % 70).toFixed(1) + ')');
  }
  let anim = 0, lanCuoi = 0;
  function vongAnim(now) {
    anim = requestAnimationFrame(vongAnim);
    if (now - lanCuoi < 40) return;
    lanCuoi = now;
    veXe();
  }
  const batAnim = () => { if (!IT_CHUYEN_DONG && !anim && !document.hidden) anim = requestAnimationFrame(vongAnim); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(anim); anim = 0; } else batAnim(); });

  /* ---------- ghim + hình minh hoạ + nhãn (lớp màn hình) ---------- */
  const lopGhim = $$('#lopGhim'), lopNhan = $$('#lopNhan');
  const GHIM = DIEM.map((d) => {
    const ngoai = d.x < -5 || d.y < -5 || d.x > H.rong + 5 || d.y > H.cao + 5;   // bến tàu đất liền: ngoài khung đảo
    const g = tao('g', { class: 'ghim' + (d.tour.length ? '' : ' khong-tour') + (d.loai === 'cua-ngo' ? ' cua-ngo' : ''), 'data-id': d.id }, lopGhim);
    g.style.setProperty('--mau', mauLoai(d.loai));
    const day = tao('line', { class: 'day' }, g);
    const nenTron = d.loai === 'cua-ngo' ? tao('circle', { class: 'nen-tron' }, g) : null;
    /* hình tự vẽ (hinh-rieng/<mã>.png, tao/hinh-rieng.js) được ưu tiên; chưa có thì dùng hình vẽ sẵn */
    const rieng = (window.PQ_HINH_RIENG || {})[d.id];
    const gh = rieng || HV[d.id] ? tao('g', { class: 'ghim ghim-hinh', 'data-id': d.id }, $$('#lopHinh')) : null;
    const sangNen = rieng ? tao('ellipse', { class: 'sang-nen', fill: 'url(#toSangNen)' }, gh) : null;   // vùng sáng loang sau hình riêng
    const hinh = rieng ? tao('image', { class: 'hinh rieng', href: rieng.url || rieng, preserveAspectRatio: 'xMidYMax meet' }, gh)
      : HV[d.id] ? tao('use', { class: 'hinh', href: '#' + HV[d.id], width: 64, height: 64 }, gh) : null;
    const pin = tao('g', { class: 'pin' }, g);
    const xung = tao('circle', { class: 'xung', r: 10 }, pin);
    const vong = tao('circle', { class: 'vong', r: 10 }, pin);
    const so = tao('text', { class: 'so' }, pin);
    so.textContent = d.so;
    const tt = tao('g', { class: 'tt', style: 'display:none' }, pin);
    tao('circle', { class: 'thu-tu', r: 7.5, cx: 9, cy: -9 }, tt);
    const ttSo = tao('text', { class: 'thu-tu-so', x: 9, y: -9 }, tt);
    const tenG = tao('text', { class: 'ten-ghim', style: 'display:none' }, pin);
    const ng = tao('g', { class: 'nhan-g' + (d.loai === 'cua-ngo' ? ' cua-ngo' : '') }, lopNhan);
    const nen = tao('rect', { class: 'nhan-nen', rx: 7.5, ry: 7.5, height: 15 }, ng);
    const nhan = tao('text', { class: 'nhan' }, ng);
    /* hình riêng đã cắt sát viền: to hơn hình vẽ sẵn ~1,6 lần (× hệ số trong hinh-rieng/kich-thuoc.json) */
    const hr = rieng && rieng.w ? { he: 1.6 * (rieng.co || 1), tl: rieng.h / rieng.w } : rieng ? { he: 1.3, tl: 1 } : null;
    return { d, g, gh, day, nenTron, hinh, sangNen, rieng: hr, pin, xung, vong, so, tt, ttSo, ten: tenG, ng, nen, nhan, ngoai };
  });

  /* ---------- camera ---------- */
  function vungNhin() {
    const p = $('#panel').getBoundingClientRect();
    if (laDienThoai()) {
      const cao = S.ngan === 'thu' ? 128 : S.ngan === 'lon' ? innerHeight * .82 : innerHeight * .46;
      return { x: 0, y: 0, w: innerWidth, h: Math.max(160, innerHeight - cao) };
    }
    const trai = p.right + 8;
    return { x: trai, y: 0, w: innerWidth - trai, h: innerHeight - 52 };
  }
  function camVua(b, dem) {
    const v = vungNhin();
    const pad = dem ?? 40;
    const s = Math.min((v.w - pad * 2) / (b.x2 - b.x1), (v.h - pad * 2) / (b.y2 - b.y1));
    return { s, tx: v.x + v.w / 2 - ((b.x1 + b.x2) / 2) * s, ty: v.y + v.h / 2 - ((b.y1 + b.y2) / 2) * s };
  }
  const TOAN_DAO = { x1: 60, y1: 15, x2: H.rong - 20, y2: H.cao - 25 };
  const gioiHan = (s) => Math.min(S.sVua * 7, Math.max(S.sVua * 0.3, s));
  let hen = 0;
  const veLai = () => { if (!hen) hen = requestAnimationFrame(() => { hen = 0; ve(); }); };
  let bay = null, camDich = null;
  function bayToi(dich, ms = 650) {
    camDich = dich;
    cancelAnimationFrame(bay);
    const tu = Object.assign({}, S.cam);
    const t1 = performance.now();
    const buoc = (now) => {
      const k = Math.min(1, (now - t1) / ms);
      const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const s = Math.exp(Math.log(tu.s) + (Math.log(dich.s) - Math.log(tu.s)) * e);
      const v = vungNhin();
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      const wx0 = (cx - tu.tx) / tu.s, wy0 = (cy - tu.ty) / tu.s;
      const wx1 = (cx - dich.tx) / dich.s, wy1 = (cy - dich.ty) / dich.s;
      const wx = wx0 + (wx1 - wx0) * e, wy = wy0 + (wy1 - wy0) * e;
      S.cam = { s, tx: cx - wx * s, ty: cy - wy * s };
      ve();
      if (k < 1) bay = requestAnimationFrame(buoc);
    };
    bay = requestAnimationFrame(buoc);
  }
  function phongQuanh(k, px, py) {
    const c = S.cam, s = gioiHan(c.s * k), r = s / c.s;
    S.cam = { s, tx: px - (px - c.tx) * r, ty: py - (py - c.ty) * r };
    veLai();
  }
  function bayToiDiem(d) {
    if (d.x < 0 || d.x > H.rong) {                      // bến đất liền: bay tới mép đảo phía luồng tàu
      return bayToi(camVua({ x1: H.rong * .45, y1: 0, x2: H.rong, y2: H.cao * .55 }, 40));
    }
    const v = vungNhin();
    let gan = Infinity;
    for (const o of DIEM) if (o !== d) gan = Math.min(gan, Math.hypot(o.x - d.x, o.y - d.y));
    const s = gioiHan(Math.max(S.cam.s, S.sVua * 2.4, 80 / gan));
    bayToi({ s, tx: v.x + v.w / 2 - d.x * s, ty: v.y + v.h / 2 - d.y * s });
  }
  function bayToiNhieu(ds) {
    ds = ds.filter((d) => d.x >= 0 && d.x <= H.rong);
    if (!ds.length) return;
    if (ds.length === 1) return bayToiDiem(ds[0]);
    const b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
    const them = (x, y) => { b.x1 = Math.min(b.x1, x); b.y1 = Math.min(b.y1, y); b.x2 = Math.max(b.x2, x); b.y2 = Math.max(b.y2, y); };
    ds.forEach((d) => them(d.x, d.y));
    const tr = S.chon?.kieu === 'tour' ? TOUR[S.chon.id] : null;
    if (tr) cacChang(tr).forEach((c) => c.c.forEach((p) => { const q = tuLonLat(p); them(q[0], q[1]); }));
    const c = camVua(b, 90);
    c.s = Math.min(c.s, S.sVua * 4.5);
    const v = vungNhin();
    c.tx = v.x + v.w / 2 - ((b.x1 + b.x2) / 2) * c.s;
    c.ty = v.y + v.h / 2 - ((b.y1 + b.y2) / 2) * c.s;
    bayToi(c);
  }
  const vuaDao = () => bayToi(camVua(TOAN_DAO));

  /* ---------- thước tỉ lệ ---------- */
  const KM_MOI_DV = 111.32 / C.K;                          // 1 đơn vị bản đồ ≈ 74 m
  function veThuoc() {
    const el = $('#thuoc');
    if (!el) return;
    const pxKm = S.cam.s / KM_MOI_DV;
    const km = [1, 2, 5, 10, 20].find((k) => k * pxKm >= 70) || 20;
    el.style.setProperty('--dai', (km * pxKm).toFixed(0) + 'px');
    el.querySelector('b').textContent = km + ' km';
  }

  /* ---------- vẽ khung hình ---------- */
  function ve() {
    const { s, tx, ty } = S.cam;
    theGioi.setAttribute('transform', 'translate(' + tx.toFixed(2) + ' ' + ty.toFixed(2) + ') scale(' + s.toFixed(5) + ')');
    coGianLopDat();
    veTheGioi();
    const ti = s / S.sVua;
    const X = (x) => x * s + tx, Y = (y) => y * s + ty;
    /* đường nhỏ: nhạt khi nhìn toàn đảo, rõ dần khi phóng gần */
    khung.style.setProperty('--mo-nho', Math.max(.3, Math.min(.9, .3 + (ti - 1) * .35)).toFixed(2));
    khung.style.setProperty('--mo-mon', Math.max(0, Math.min(.7, (ti - 1.8) * .4)).toFixed(2));
    /* LOD: xa chỉ địa hình + đường chính + điểm lớn; toàn đảo thêm đường phụ, đô thị, cây vừa;
       gần thêm đường nhỏ, cây nhỏ, trang trí */
    const lod = ti < .85 ? 1 : ti < 1.6 ? 2 : 3;
    khung.classList.toggle('an-cap', ti < 2.2);                  // cabin + trụ cáp chỉ hiện khi phóng gần
    if (khung.dataset.lod !== String(lod)) { khung.dataset.lod = lod; khung.classList.remove('lod-1', 'lod-2', 'lod-3'); khung.classList.add('lod-' + lod); }

    for (const c of CHU_NEN) {
      const an = (c.o.co !== 'thi-tran' && ti < 1.5) || ti > 6;
      c.e.style.display = an ? 'none' : '';
      if (an) continue;
      c.e.setAttribute('x', X(c.o.x).toFixed(1));
      c.e.setAttribute('y', Y(c.o.y).toFixed(1));
      c.e.textContent = ten(c.o);
    }
    for (const o of CHU_BIEN) {
      o.g.setAttribute('transform', 'translate(' + X(o.p[0]).toFixed(1) + ' ' + Y(o.p[1]).toFixed(1) + ')');
      o.a.textContent = ten(o.o);
      o.g.style.display = ti > 3.2 ? 'none' : '';
    }
    for (const o of SONG) o.g.setAttribute('transform', 'translate(' + X(o.p[0]).toFixed(1) + ' ' + Y(o.p[1]).toFixed(1) + ')');

    /* chữ trên luồng tàu / đường bay: đặt ở chặng dài nhất còn trong khung nhìn */
    for (const l of LUONG) {
      let tot = null, dai = 0;
      for (let i = 1; i < l.pts.length; i++) {
        const a = [X(l.pts[i - 1][0]), Y(l.pts[i - 1][1])], b = [X(l.pts[i][0]), Y(l.pts[i][1])];
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (m[0] < 420 && !laDienThoai() || m[0] < 20 || m[1] < 20 || m[0] > innerWidth - 20 || m[1] > innerHeight - 60) continue;
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L > dai) { dai = L; tot = { a, b, m }; }
      }
      if (!tot || dai < 150 || (l.k === 'bay' && ti < 1.4)) { l.chu.style.display = 'none'; continue; }
      let goc = Math.atan2(tot.b[1] - tot.a[1], tot.b[0] - tot.a[0]) * 180 / Math.PI;
      if (goc > 90) goc -= 180; if (goc < -90) goc += 180;
      l.chu.style.display = '';
      l.chu.textContent = S.lang === 'en' ? l.ten.tenEn : l.ten.ten;
      l.chu.setAttribute('transform', 'translate(' + tot.m[0].toFixed(1) + ' ' + tot.m[1].toFixed(1) + ') rotate(' + goc.toFixed(1) + ') translate(0 -6)');
    }
    veXe();
    veThuoc();

    const chonTour = S.chon?.kieu === 'tour' ? TOUR[S.chon.id] : null;
    const chonDiem = S.chon?.kieu === 'diem' ? S.chon.id : null;
    const trongTour = chonTour ? diemCuaTour(chonTour).reduce((m, d, i) => (m.has(d.id) ? m : m.set(d.id, i + 1)), new Map()) : null;

    const coHinh = Math.max(38, Math.min(72, 38 * Math.pow(ti, .5)));
    const daDat = [];
    const thuTu = [];
    const datGhim = [];
    for (const m of GHIM) {
      const d = m.d;
      const hien = (S.tab === 'tour' || chonTour ? true : diemHien(d) || d.id === chonDiem);
      m.g.style.display = hien ? '' : 'none';
      m.ng.style.display = 'none';
      if (!hien) continue;
      const mo = !!trongTour && !trongTour.has(d.id);
      const noi = d.id === chonDiem || (trongTour && trongTour.has(d.id));
      const nguong = d.cap <= 1 ? 0 : d.cap === 2 ? 1.45 : 2.2;
      const cham = !noi && ti < nguong;
      const cuaNgo = d.loai === 'cua-ngo';
      const coHinhNay = m.hinh && !cham ? coHinh * (cuaNgo ? (ti < 1.4 ? 1 : 1.15) : 1) * (d.id === chonDiem ? 1.2 : 1) : 0;
      const r = cham ? (d.cap === 3 ? 4 : 5) : coHinhNay ? (noi ? 10 : 9) : (noi ? 13 : 11);
      m.vong.setAttribute('r', r);
      m.xung.setAttribute('r', r);
      m.g.classList.toggle('cham', cham);
      m.g.classList.toggle('mo', mo);
      m.g.classList.toggle('chon', d.id === chonDiem);
      const so = trongTour && chonTour.tuyen.length ? trongTour.get(d.id) : null;
      m.tt.style.display = so ? '' : 'none';
      if (so) m.ttSo.textContent = so;
      datGhim.push({ m, x: X(d.x), y: Y(d.y), r, L: coHinhNay, cham, mo, ep: noi ? 1 : 0, uu: noi ? 0 : d.cap });
    }

    /* 25/09 (anh Hùng): mỗi điểm = HÌNH đặc trưng ở trên + dưới là [SỐ | TÊN]. Không đẩy lệch
       ghim nữa; thay vào đó ghim tự "hạ cấp" khi chật chỗ, theo thứ tự ưu tiên:
         3 = hình + số + tên · 2 = hình + số · 1 = chỉ số · 0 = chấm nhỏ
       Điểm quan trọng (cửa ngõ, cấp 1) xếp trước nên giữ được tên; điểm phụ nhường chỗ. */
    const v = { w: innerWidth, h: innerHeight };
    const dt = laDienThoai();
    datGhim.sort((a, b) => (b.ep - a.ep) || (a.uu - b.uu) || (b.L - a.L));
    for (const o of datGhim) {
      const m = o.m, d = m.d;
      const R = dt ? 8 : 9;                                    // bán kính ô số
      const fs = dt ? (o.uu <= 1 ? 11.5 : 10.5) : (o.uu <= 1 ? 13 : 11.5);
      const chu = ten(d);
      const wTen = doRong(chu, fs, o.uu === 0 ? 800 : o.uu === 1 ? 700 : 600) + 3;
      const choTen = !o.mo && (o.ep || o.uu <= 1 || (o.uu === 2 && ti >= 1.5) || ti >= 2.3);
      const L = o.L;
      /* dựng các phương án từ đầy đủ → gọn */
      /* 26/09 (anh Hùng): Ô SỐ nằm ĐÚNG toạ độ thật của điểm; hình đặc trưng đứng ngay trên ô số;
         tên ghi sang phải ô số (chật thì sang trái) — không căn giữa cả cụm như trước */
      const pa = [];
      const oSo = { x1: o.x - R - 1, y1: o.y - R - 1, x2: o.x + R + 1, y2: o.y + R + 1 };
      const tenPhai = { x1: o.x + R, y1: o.y - R - 1, x2: o.x + R + 4 + wTen + 2, y2: o.y + R + 1 };
      const tenTrai = { x1: o.x - R - 4 - wTen - 2, y1: o.y - R - 1, x2: o.x - R, y2: o.y + R + 1 };
      if (L) {
        const gy = o.y - R + 1;                                   // chân hình chạm mép trên ô số
        const hr = o.m.rieng;
        const hopHinh = (k) => hr
          ? (() => { const w = L * k * hr.he * (hr.tl > 1.15 ? 1.15 / hr.tl : 1), h = w * hr.tl; return { x1: o.x - w * .42, y1: gy - h * .9, x2: o.x + w * .42, y2: gy }; })()
          : { x1: o.x - L * k * .32, y1: gy - L * k * .74, x2: o.x + L * k * .32, y2: gy };
        if (choTen) {
          pa.push({ cap: 3, k: 1, gy, cx: o.x, cy: o.y, hop: [hopHinh(1), oSo, tenPhai] });
          pa.push({ cap: 3, k: 1, gy, cx: o.x, cy: o.y, trai: true, hop: [hopHinh(1), oSo, tenTrai] });
        }
        pa.push({ cap: 2, k: 1, gy, cx: o.x, cy: o.y, hop: [hopHinh(1), oSo] });
        pa.push({ cap: 2, k: .72, gy, cx: o.x, cy: o.y, hop: [hopHinh(.72), oSo] });
      } else if (choTen) {
        pa.push({ cap: 3, cx: o.x, cy: o.y, hop: [oSo, tenPhai] });
        pa.push({ cap: 3, cx: o.x, cy: o.y, trai: true, hop: [oSo, tenTrai] });
      }
      if (!o.cham || o.ep) pa.push({ cap: 1, cx: o.x, cy: o.y, hop: [{ x1: o.x - R - 1, y1: o.y - R - 1, x2: o.x + R + 1, y2: o.y + R + 1 }] });
      o.pa = pa;
    }
    /* lượt 1: mọi điểm lấy phương án GỌN nhất còn chỗ (hình + số, hình nhỏ + số, chỉ số);
       lượt 2: điểm nào còn chỗ thì mới "nâng" lên có tên — vậy ít tên hơn nhưng đủ hình */
    const hopCua = new Map();
    const giaoTru = (b, o) => { for (const [k, ds] of hopCua) { if (k === o) continue; for (const h of ds) if (b.x1 < h.x2 && b.x2 > h.x1 && b.y1 < h.y2 && b.y2 > h.y1) return true; } return false; };
    /* chừa: bảng bên trái (desktop), thanh chú thích đáy (desktop), cụm nút góc trên (điện thoại) */
    const trai = dt ? 2 : $('#panel').getBoundingClientRect().right + 4, day = dt ? v.h : v.h - 64;
    const tranKhung = (b) => b.x1 < trai || b.y2 > day || b.x2 > v.w - (dt && b.y1 < 200 ? 58 : 2);
    for (const o of datGhim) {
      const gon = o.pa.filter((p) => p.cap < 3);
      let chon = gon.find((p) => !p.hop.some((b) => giaoTru(b, o)));
      if (!chon && o.ep && o.pa.length) chon = o.pa[0];
      o.chon = chon || { cap: 0, cx: o.x, cy: o.y, hop: [] };
      hopCua.set(o, o.chon.hop);
    }
    for (const o of datGhim) {
      const ds3 = o.pa.filter((p) => p.cap === 3);
      if (!ds3.length || o.chon.cap === 3) continue;
      if (o.chon.cap === 0 && !o.ep) continue;
      const p3 = ds3.find((p) => !p.hop.some((b) => giaoTru(b, o) || tranKhung(b))) || (o.ep ? ds3[0] : null);
      if (p3) { o.chon = p3; hopCua.set(o, p3.hop); }
    }
    /* 26/09: chấm nhỏ (điểm bị nhường chỗ) rơi vào hình của điểm khác → ẩn hẳn, không vẽ đè lên hình */
    const hopHinhDat = [];
    for (const o of datGhim) if (o.chon.cap >= 2 && o.chon.hop[0]) hopHinhDat.push([o, o.chon.hop[0]]);
    for (const o of datGhim) {
      o.an = !o.ep && o.chon.cap === 0 && hopHinhDat.some(([k, b]) => k !== o && o.x > b.x1 - 3 && o.x < b.x2 + 3 && o.y > b.y1 - 3 && o.y < b.y2 + 6);
    }
    /* chữ địa danh (thị trấn, làng) nhường chỗ cho số, tên và hình */
    for (const c of CHU_NEN) {
      if (c.e.style.display === 'none') continue;
      const x = +c.e.getAttribute('x'), y = +c.e.getAttribute('y'), w = doRong(c.e.textContent, 11, 700);
      const b = { x1: x - w / 2, y1: y - 11, x2: x + w / 2, y2: y + 3 };
      if (giaoTru(b, null)) c.e.style.display = 'none';
    }
    for (const o of datGhim) {
      const m = o.m, d = m.d, chon = o.chon;
      if (o.an) { m.g.style.display = 'none'; continue; }
      const R = dt ? 8 : 9, L = o.L;
      const fs = dt ? (o.uu <= 1 ? 11.5 : 10.5) : (o.uu <= 1 ? 13 : 11.5);
      const chu = ten(d);
      const rr = chon.cap === 0 ? (d.cap === 3 ? 4 : 5) : R;
      m.vong.setAttribute('r', rr); m.xung.setAttribute('r', rr);
      m.g.classList.toggle('cham', chon.cap === 0);
      m.pin.setAttribute('transform', 'translate(' + chon.cx.toFixed(1) + ' ' + chon.cy.toFixed(1) + ')');
      m.day.style.display = 'none';
      if (m.nenTron) m.nenTron.style.display = 'none';
      if (m.hinh) {
        const coH = chon.cap >= 2;
        m.hinh.style.display = coH ? '' : 'none';
        if (m.sangNen && !coH) m.sangNen.style.display = 'none';
        /* hình vẽ sẵn: mặt đất ở y 57/64 · hình tự vẽ: chân công trình chạm đáy khung */
        const Lk = L * (chon.k || 1);
        if (coH && m.rieng) {
          /* hình riêng: đúng tỉ lệ ngang/dọc của file, chân hình chạm mép trên ô số; hình quá cao thì hạ bề ngang */
          const hr = m.rieng, w = Lk * hr.he * (hr.tl > 1.15 ? 1.15 / hr.tl : 1), h = w * hr.tl, gy = chon.gy ?? o.y;
          m.hinh.setAttribute('x', (o.x - w / 2).toFixed(1)); m.hinh.setAttribute('y', (gy - h).toFixed(1));
          m.hinh.setAttribute('width', w.toFixed(1)); m.hinh.setAttribute('height', h.toFixed(1));
          if (m.sangNen) {
            m.sangNen.style.display = '';
            m.sangNen.setAttribute('cx', o.x.toFixed(1)); m.sangNen.setAttribute('cy', (gy - h * .42).toFixed(1));
            m.sangNen.setAttribute('rx', (w * .66).toFixed(1)); m.sangNen.setAttribute('ry', (h * .62).toFixed(1));
          }
        } else if (coH) m.hinh.setAttribute('transform', 'translate(' + (o.x - Lk / 2).toFixed(1) + ' ' + ((chon.gy ?? o.y) - Lk * 57 / 64).toFixed(1) + ') scale(' + (Lk / 64).toFixed(4) + ')');
      }
      m.ten.style.display = chon.cap === 3 ? '' : 'none';
      if (chon.cap === 3) {
        m.ten.textContent = chu;
        m.ten.setAttribute('x', chon.trai ? -R - 4 : R + 4); m.ten.setAttribute('y', (fs * .36).toFixed(1));
        m.ten.style.textAnchor = chon.trai ? 'end' : 'start';
        m.ten.setAttribute('class', 'ten-ghim c' + Math.min(o.uu, 2));
        m.ten.style.fontSize = fs + 'px';
      }
    }
    /* lớp hình: đồng bộ với ghim; xếp theo toạ độ y (xa vẽ trước, gần vẽ sau đè lên), điểm chọn trên cùng */
    const hienHinh = [];
    for (const m of GHIM) {
      if (!m.gh) continue;
      m.gh.style.display = m.g.style.display;
      m.gh.setAttribute('class', m.g.getAttribute('class') + ' ghim-hinh');
    }
    for (const o of datGhim) if (o.m.gh) hienHinh.push([o.m.d.id === chonDiem ? 1e6 : o.y, o.m.gh]);
    hienHinh.sort((a, b) => a[0] - b[0]);
    const thuTuMoi = hienHinh.map((h) => h[1].dataset.id).join(',');
    if (thuTuMoi !== veLop.hinh) { veLop.hinh = thuTuMoi; const l = $$('#lopHinh'); for (const [, e] of hienHinh) l.appendChild(e); }
    const gChon = chonDiem && THEO_ID.has(chonDiem) ? GHIM.find((m) => m.d.id === chonDiem) : null;
    if (gChon && veLop.chon !== chonDiem) { veLop.chon = chonDiem; lopGhim.appendChild(gChon.g); }
  }
  const veLop = { hinh: '', chon: '' };

  /* ---------- tuyến tour: theo hình học thật của từng chặng (đường bộ OSRM, luồng cano, cáp treo) ---------- */
  function veTuyen() {
    const lop = $$('#lopTuyen');
    lop.innerHTML = '';
    const tr = S.chon?.kieu === 'tour' ? TOUR[S.chon.id] : null;
    if (!tr) return;
    for (const c of cacChang(tr)) {
      const d = duongSvg(c.c.map(tuLonLat));
      tao('path', { class: 'tuyen-nen ' + c.k, d }, lop);
      tao('path', { class: 'tuyen ' + c.k + (c.k !== 'bo' ? ' tuyen-chay' : ''), d }, lop);
    }
  }

  /* ---------- kéo, phóng, chạm ---------- */
  const tay = new Map();
  let keo = null;
  khung.addEventListener('pointerdown', (e) => {
    try { khung.setPointerCapture(e.pointerId); } catch (_) { /* con trỏ đã mất */ }
    tay.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelAnimationFrame(bay);
    batDau();
    keo.muc = e.target.closest('.ghim');
  });
  function batDau() {
    const ds = [...tay.values()];
    const cx = ds.reduce((a, p) => a + p.x, 0) / ds.length;
    const cy = ds.reduce((a, p) => a + p.y, 0) / ds.length;
    const dist = ds.length > 1 ? Math.hypot(ds[0].x - ds[1].x, ds[0].y - ds[1].y) : 0;
    keo = Object.assign({ cx, cy, dist, di: keo ? keo.di : 0, muc: keo ? keo.muc : null }, S.cam);
  }
  khung.addEventListener('pointermove', (e) => {
    if (!tay.has(e.pointerId) || !keo) return;
    tay.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ds = [...tay.values()];
    const cx = ds.reduce((a, p) => a + p.x, 0) / ds.length;
    const cy = ds.reduce((a, p) => a + p.y, 0) / ds.length;
    keo.di = Math.max(keo.di, Math.hypot(cx - keo.cx, cy - keo.cy));
    if (keo.di > 4) khung.classList.add('keo');
    let s = keo.s;
    if (ds.length > 1 && keo.dist) s = gioiHan(keo.s * Math.hypot(ds[0].x - ds[1].x, ds[0].y - ds[1].y) / keo.dist);
    const r = s / keo.s;
    S.cam = { s, tx: cx - (keo.cx - keo.tx) * r, ty: cy - (keo.cy - keo.ty) * r };
    veLai();
  });
  const tha = (e) => {
    if (!tay.has(e.pointerId)) return;
    tay.delete(e.pointerId);
    khung.classList.remove('keo');
    if (!tay.size) {
      if (keo && keo.di <= 4 && keo.muc && e.type === 'pointerup') chon({ kieu: 'diem', id: keo.muc.dataset.id });
      else if (keo && keo.di <= 4 && laDienThoai() && S.ngan === 'lon') datNgan('giua');
      keo = null;
    } else batDau();
  };
  khung.addEventListener('pointerup', tha);
  khung.addEventListener('pointercancel', tha);
  khung.addEventListener('wheel', (e) => {
    e.preventDefault();
    cancelAnimationFrame(bay);
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    phongQuanh(Math.exp(-d * 0.0016), e.clientX, e.clientY);
  }, { passive: false });
  khung.addEventListener('dblclick', (e) => {
    if (e.target.closest('.ghim')) return;
    const c = S.cam, s = gioiHan(c.s * 2), r = s / c.s;
    bayToi({ s, tx: e.clientX - (e.clientX - c.tx) * r, ty: e.clientY - (e.clientY - c.ty) * r }, 350);
  });
  const phongTam = (k) => {
    const v = vungNhin();
    const c = S.cam, s = gioiHan(c.s * k), r = s / c.s;
    const px = v.x + v.w / 2, py = v.y + v.h / 2;
    bayToi({ s, tx: px - (px - c.tx) * r, ty: py - (py - c.ty) * r }, 300);
  };
  $('#nutPhong').addEventListener('click', () => phongTam(1.6));
  $('#nutThu').addEventListener('click', () => phongTam(1 / 1.6));
  $('#nutVua').addEventListener('click', vuaDao);

  function canhLai() {
    cancelAnimationFrame(bay);
    camDat = null;                                    // cỡ khung đổi → vẽ lại lớp đất từ đầu
    S.sVua = camVua(TOAN_DAO).s;
    S.cam = camVua(TOAN_DAO);
    if (S.chon) {
      const ds = S.chon.kieu === 'diem' ? [THEO_ID.get(S.chon.id)] : diemCuaTour(TOUR[S.chon.id]);
      bayToiNhieu(ds);
      cancelAnimationFrame(bay);
      S.cam = camDich || S.cam;
    }
    ve();
  }
  let doiCo = 0;
  addEventListener('resize', () => { clearTimeout(doiCo); doiCo = setTimeout(canhLai, 150); });

  /* đổi ngôn ngữ / sáng tối: màu theo CSS nên chỉ cần vẽ lại chữ */
  const datKieu = () => ve();

  S.sVua = camVua(TOAN_DAO).s;
  S.cam = camVua(TOAN_DAO);
  batAnim();

  /* ---------------- panel ---------------- */
  const cuon = $('#cuon');
  const loc = $('#loc');

  function dongDiem(d) {
    const ts = tourCuaDiem(d);
    const tourThat = ts.filter((x) => x.loai !== 've');
    const gias = ts.map(giaHien).filter((g) => g != null);
    let phu = LOAI[d.loai][S.lang];
    if (ts.length) {
      phu = (tourThat.length ? t('soTour', { n: tourThat.length }) : LOAI_TOUR.ve[S.lang])
        + (gias.length ? ' · ' + t('tuGia', { g: tien(Math.min(...gias)) }) : '');
    }
    return '<button class="dong' + (S.chon?.id === d.id ? ' chon' : '') + '" data-diem="' + d.id + '" style="--mau:' + mauLoai(d.loai) + '">' +
      '<span class="o' + (d.tour.length ? '' : ' rong') + '">' + d.so + '</span>' +
      '<span class="than"><div class="ten">' + esc(ten(d)) + '</div><div class="mo-ta">' + esc(phu) + '</div></span></button>';
  }

  function khoiGia(tr, gon) {
    if (tr.giaNL != null) {
      const sau = tr.sauGiamNL;
      return gon
        ? '<span class="gia">' + (sau != null ? '<s>' + tien(tr.giaNL) + '</s>' + tien(sau) : tien(tr.giaNL)) + '</span>'
        : null;
    }
    if (tr.tuPax) return gon ? '<span class="gia">' + t('tu') + ' ' + tien(tr.tuPax.gia) + '</span>' : null;
    return gon ? '' : null;
  }

  function dongTour(tr, soThuTu) {
    const nhan = (tr.noiBat ? '<span class="nhan-nho">' + t('noiBat') + '</span>' : '') +
      (tr.sapRaMat ? '<span class="nhan-nho xam">' + t('sapRaMat') + '</span>' : '');
    const phu = tr.loai === 've'
      ? diemCuaTour(tr).map(ten).join(', ')
      : [tr.thoiLuong, tr.khoiHanh].filter(Boolean).map(dichEn).join(' · ');
    return '<button class="dong" data-tour="' + esc(tr.ma) + '">' +
      '<span class="o-tour">' + iconTour(tr) + '</span>' +
      '<span class="than"><div class="ten">' + esc(ten(tr)) + nhan + '</div><div class="mo-ta">' + esc(phu) + '</div></span>' +
      khoiGia(tr, true) + '</button>';
  }

  function veLoc() {
    if (S.chon) { loc.innerHTML = ''; return; }
    if (S.tab === 'diem') {
      loc.innerHTML = Object.entries(LOAI).map(([k, v]) =>
        '<button class="chip' + (S.loai.has(k) ? ' bat' : '') + '" data-loai="' + k + '" style="--mau:' + mauLoai(k) + '"><i></i>' + v[S.lang] + '</button>').join('') +
        '<button class="chip cong-tac' + (S.chiTour ? ' bat' : '') + '" data-chi-tour="1"><i></i>' + t('coTour') + '</button>';
    } else {
      loc.innerHTML = Object.entries(LOAI_TOUR).map(([k, v]) =>
        '<button class="chip' + (S.loaiTour.has(k) ? ' bat' : '') + '" data-loai-tour="' + k + '">' + v[S.lang] + '</button>').join('');
    }
  }

  function dsTour() {
    return Object.values(TOUR)
      .filter((tr) => (!S.loaiTour.size || S.loaiTour.has(tr.loai)) && khopTim(chuoiTour(tr)));
  }

  function veDanhSach() {
    if (S.chon) return veChiTiet();
    let h = '';
    if (S.tab === 'diem') {
      /* cửa ngõ (sân bay, cảng) luôn đứng đầu: khách cần biết đến đảo bằng đường nào trước */
      const cuaNgo = DIEM.filter((d) => d.loai === 'cua-ngo' && diemHien(d));
      if (cuaNgo.length) h += '<div class="nhom-tieu-de">' + LOAI['cua-ngo'][S.lang] + '</div>' + cuaNgo.map(dongDiem).join('');
      for (const vg of THU_TU_VUNG) {
        const ds = DIEM.filter((d) => d.vung === vg && d.loai !== 'cua-ngo' && diemHien(d));
        if (!ds.length) continue;
        const v = D.vung.find((x) => x.id === vg);
        h += '<div class="nhom-tieu-de">' + esc(ten(v)) + '</div>' + ds.map(dongDiem).join('');
      }
    } else {
      const ds = dsTour();
      for (const loai of Object.keys(LOAI_TOUR)) {
        const nhom = ds.filter((tr) => tr.loai === loai)
          .sort((a, b) => (b.noiBat - a.noiBat) || (a.sapRaMat - b.sapRaMat) || ((giaHien(a) ?? 9e9) - (giaHien(b) ?? 9e9)));
        if (!nhom.length) continue;
        h += '<div class="nhom-tieu-de">' + LOAI_TOUR[loai][S.lang] + '</div>' + nhom.map((x) => dongTour(x)).join('');
      }
    }
    cuon.innerHTML = h || '<div class="trong">' + t('khongThay') + '</div>';
  }

  function nutLienHe(tr) {
    const L = D.lienHe || {};
    let h = '';
    if (tr && tr.trang) h += '<a class="nut chinh" href="' + esc(tr.trang) + '" target="_blank" rel="noopener">' + icon('mo') + t('xemTour') + '</a>';
    if (L.hotline) h += '<a class="nut' + (h ? '' : ' chinh') + '" href="tel:' + esc(L.hotline.replace(/\s/g, '')) + '">' + icon('goi') + t('goi') + '</a>';
    if (L.zalo) h += '<a class="nut" href="' + esc(/^https?:/.test(L.zalo) ? L.zalo : 'https://zalo.me/' + L.zalo.replace(/\s/g, '')) + '" target="_blank" rel="noopener">' + icon('chat') + t('zalo') + '</a>';
    return h;
  }

  function veChiTiet() {
    const nutLui = '<button class="quay-lai" data-lui="1">' + icon('quayLai') + t('quayLai') + '</button>';
    if (S.chon.kieu === 'diem') {
      const d = THEO_ID.get(S.chon.id);
      const ts = tourCuaDiem(d);
      const tourThat = ts.filter((x) => x.loai !== 've');
      const ve = ts.filter((x) => x.loai === 've');
      const phu = S.lang === 'en' ? d.ten : (d.tenEn !== d.ten ? d.tenEn : '');
      cuon.innerHTML = '<div class="chi-tiet" style="--mau:' + mauLoai(d.loai) + '">' + nutLui +
        '<div class="ct-dau"><span class="o">' + d.so + '</span><div>' +
        '<div class="ct-loai">' + LOAI[d.loai][S.lang] + '</div><h2>' + esc(ten(d)) + '</h2>' +
        (phu ? '<div class="en">' + esc(phu) + '</div>' : '') + '</div></div>' +
        '<p class="ct-mo-ta">' + esc(S.lang === 'en' ? d.moTaEn : d.moTa) + '</p>' +
        '<div class="hang-nut"><a class="nut" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + d.lat + ',' + d.lon + '">' + icon('chiDuong') + t('chiDuong') + '</a></div>' +
        (tourThat.length ? '<div class="ct-muc">' + t('tourGhe') + '</div>' + tourThat.map((x) => dongTour(x)).join('') : '') +
        (ve.length ? '<div class="ct-muc">' + t('veTai') + '</div>' + ve.map((x) => dongTour(x)).join('') : '') +
        '</div>';
      return;
    }
    const tr = TOUR[S.chon.id];
    const ds = diemCuaTour(tr);
    let gia;
    if (tr.giaNL != null) {
      const o = (nhan, goc, sau) => goc == null ? '' :
        '<div><div class="nhan-gia">' + nhan + '</div>' + (sau != null ? '<s>' + tien(goc) + '</s>' : '') +
        '<div class="so-gia">' + tien(sau ?? goc) + '</div></div>';
      gia = o(t('nguoiLon'), tr.giaNL, tr.sauGiamNL) + o(t('treEm'), tr.giaTE, tr.sauGiamTE);
    } else if (tr.tuPax) {
      gia = '<div><div class="nhan-gia">' + t('tu') + '</div><div class="so-gia">' + tien(tr.tuPax.gia) +
        '<small>' + t('moiKhach') + '</small></div><s style="text-decoration:none">' + t('doanTu', { n: tr.tuPax.soKhach }) + '</s></div>';
    } else {
      gia = '<div><div class="so-gia" style="font-size:15px">' + t('lienHe') + '</div></div>';
    }
    const nhan = (tr.noiBat ? '<span class="nhan-nho">' + t('noiBat') + '</span>' : '') +
      (tr.sapRaMat ? '<span class="nhan-nho xam">' + t('sapRaMat') + '</span>' : '');
    const thongTin = [[t('thoiLuong'), dichEn(tr.thoiLuong)], [t('khoiHanh'), dichEn(tr.khoiHanh)]].filter((x) => x[1]);
    cuon.innerHTML = '<div class="chi-tiet">' + nutLui +
      '<div class="ct-dau"><span class="o-tour">' + iconTour(tr) + '</span><div>' +
      '<div class="ct-loai">' + LOAI_TOUR[tr.loai][S.lang] + '</div><h2>' + esc(ten(tr)) + nhan + '</h2></div></div>' +
      '<div class="o-gia">' + gia + '</div>' +
      (thongTin.length ? '<dl class="ct-thong-tin">' + thongTin.map(([a, b]) => '<dt>' + esc(a) + '</dt><dd>' + esc(b) + '</dd>').join('') + '</dl>' : '') +
      (nutLienHe(tr) ? '<div class="hang-nut">' + nutLienHe(tr) + '</div>' : '') +
      (tr.usp.length && S.lang === 'vi' ? '<div class="ct-muc">' + t('diemNoiBat') + '</div><ul class="usp">' + tr.usp.map((u) => '<li>' + esc(u) + '</li>').join('') + '</ul>' : '') +
      (ds.length ? '<div class="ct-muc">' + (tr.tuyen.length ? t('lichTrinh') : t('suDungTai')) + '</div><ol class="chang">' + ds.map((d) => '<li>' + dongDiem(d) + '</li>').join('') + '</ol>' : '') +
      '</div>';
  }

  function veChuThich() {
    $('#chuThich').innerHTML = Object.entries(LOAI).map(([k, v]) =>
      '<span style="--mau:' + mauLoai(k) + '"><i></i>' + v[S.lang] + '</span>').join('') +
      '<span><i class="day"></i>' + t('coTour') + '</span><span><i class="rong"></i>' + t('chuaTour') + '</span>' +
      '<span><b class="vach tau"></b>' + t('luongTau') + '</span><span><b class="vach bay"></b>' + t('duongBay') + '</span>';
  }

  function veChu() {
    document.documentElement.lang = S.lang;
    document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach((e) => { e.placeholder = t(e.dataset.i18nPh); });
    document.title = t('tieuDe') + ' · Rooty Trip';
    $('#demDiem').textContent = DIEM.length;
    $('#demTour').textContent = Object.keys(TOUR).length;
    document.querySelectorAll('#ngonNgu button').forEach((b) => b.classList.toggle('bat', b.dataset.lang === S.lang));
  }

  function veTatCa() {
    $('#tabDiem').classList.toggle('bat', S.tab === 'diem');
    $('#tabTour').classList.toggle('bat', S.tab === 'tour');
    veLoc();
    veDanhSach();
    veTuyen();
    ve();
  }

  /* ---------------- chọn / URL ---------------- */
  function ghiUrl() {
    const q = new URLSearchParams(location.search);
    q.delete('diem'); q.delete('tour');
    if (S.chon) q.set(S.chon.kieu, S.chon.id);
    if (S.lang === 'en') q.set('lang', 'en'); else q.delete('lang');
    const s = q.toString();
    try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) { /* iframe sandbox */ }
  }

  function chon(moi, { bay = true, luu = true } = {}) {
    if (luu && S.chon && (!moi || S.chon.id !== moi.id)) S.lichSu.push(S.chon);
    S.chon = moi;
    if (moi && laDienThoai() && S.ngan === 'thu') datNgan('giua');
    veTatCa();
    cuon.scrollTop = 0;
    ghiUrl();
    if (!bay) return;
    if (!moi) return;
    if (moi.kieu === 'diem') bayToiDiem(THEO_ID.get(moi.id));
    else bayToiNhieu(diemCuaTour(TOUR[moi.id]));
  }

  function lui() {
    const truoc = S.lichSu.pop() || null;
    chon(truoc, { luu: false, bay: !!truoc });
  }

  /* ---------------- ngăn kéo điện thoại ---------------- */
  function datNgan(tt) {
    S.ngan = tt;
    const p = $('#panel');
    p.classList.toggle('thu', tt === 'thu');
    p.classList.toggle('lon', tt === 'lon');
    document.body.dataset.ngan = tt;          // CSS đẩy dòng ghi công bản đồ lên trên ngăn kéo
  }
  $('#keoTay').addEventListener('click', () => datNgan(S.ngan === 'thu' ? 'giua' : S.ngan === 'giua' ? 'lon' : 'thu'));

  /* ---------------- sự kiện panel ---------------- */
  $('#panel').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.diem) return chon({ kieu: 'diem', id: b.dataset.diem });
    if (b.dataset.tour) return chon({ kieu: 'tour', id: b.dataset.tour });
    if (b.dataset.lui) return lui();
    if (b.dataset.loai) { S.loai.has(b.dataset.loai) ? S.loai.delete(b.dataset.loai) : S.loai.add(b.dataset.loai); return veTatCa(); }
    if (b.dataset.chiTour) { S.chiTour = !S.chiTour; return veTatCa(); }
    if (b.dataset.loaiTour) { S.loaiTour.has(b.dataset.loaiTour) ? S.loaiTour.delete(b.dataset.loaiTour) : S.loaiTour.add(b.dataset.loaiTour); return veTatCa(); }
  });
  $('#tabDiem').addEventListener('click', () => { S.tab = 'diem'; S.chon = null; S.lichSu = []; ghiUrl(); veTatCa(); });
  $('#tabTour').addEventListener('click', () => { S.tab = 'tour'; S.chon = null; S.lichSu = []; ghiUrl(); veTatCa(); });
  $('#oTim').addEventListener('input', (e) => {
    S.tim = e.target.value.trim();
    if (S.chon) { S.chon = null; S.lichSu = []; ghiUrl(); }
    veTatCa();
  });
  $('#ngonNgu').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]');
    if (!b) return;
    S.lang = b.dataset.lang;
    veChu(); veChuThich(); veTatCa(); ghiUrl(); datKieu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.chon) lui();
  });

  /* ---------------- giao diện sáng/tối ---------------- */
  function datTheme(v, dung) {
    theme = (v === 'toi' || v === 'sang') ? v : null;
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    if (dung !== false) datKieu();
  }
  datTheme(Q.get('theme'), false);
  if (theme === 'toi') datKieu();
  addEventListener('message', (e) => {
    const m = e.data;
    if (m && m.hub === 'theme') datTheme(m.v);
  });

  /* ---------------- khởi động ---------------- */
  if (Q.get('nhung') === '1') document.body.classList.add('nhung');
  if (laDienThoai()) datNgan('giua');
  veChu();
  veChuThich();

  const moTour = Q.get('tour'), moDiem = Q.get('diem');
  if (moTour && TOUR[moTour]) { S.tab = 'tour'; chon({ kieu: 'tour', id: moTour }, { luu: false }); }
  else if (moDiem && THEO_ID.has(moDiem)) chon({ kieu: 'diem', id: moDiem }, { luu: false });
  else veTatCa();
})();
