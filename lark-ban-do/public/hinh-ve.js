/* ==========================================================================
   Hình minh hoạ từng điểm + phương tiện.

   Vẽ lại 24/09/2026 (lần 3) theo mẫu hình Sao biển Rạch Vẹm mà anh Hùng khen đẹp:
     · MỘT chủ thể lớn, rõ, nhận ra ngay — bỏ chi tiết lắt nhắt và chữ
     · mảng màu tươi, VIỀN cùng tông đậm hơn (1.4px, bo tròn góc)
     · vài chấm/vệt sáng nhạt trên chủ thể
     · đứng trên một "đế" nhỏ: dải nước gợn sóng, bãi cát hoặc gò cỏ
     · thêm đúng một chi tiết bối cảnh (cầu gỗ, cây dừa, thuyền…)
   Đặc điểm công trình vẫn theo ảnh thật (Bing Hình ảnh):
     VinWonders lâu đài chóp tím · Safari hươu cao cổ · Grand World bát tre vàng trên nước
     Sunset Town tháp đồng hồ gạch cam · Cầu Hôn hai nửa cầu cong · Hộ Quốc cổng mái cong
     Dinh Cậu hải đăng trắng đỉnh đỏ trên đá · Sanato voi chân cà kheo · Nhà tù tháp canh gỗ
     Sân bay nhà ga T2 Phượng Hoàng + máy bay Sun PhuQuoc Airways
   Khung 64×64, mặt đất ở y≈56.
   ========================================================================== */
(function () {
  'use strict';
  const s = (id, noi, vb) => '<symbol id="' + id + '" viewBox="' + (vb || '0 0 64 64') + '">' + noi + '</symbol>';
  /* tô + viền cùng tông */
  /* 24/09 (lần 4): hợp tông bản đồ thật kiểu Sunset Town — viền mảnh, mờ; khối do bộ lọc ánh sáng
     #khoiHinh của trang tạo (sáng Tây Bắc, bóng đổ Đông Nam, cùng hướng đổ bóng địa hình) */
  const V = (to, vien, rong) => 'fill="' + to + '" stroke="' + vien + '" stroke-width="' + ((rong || 1.4) * .45).toFixed(2) + '" stroke-opacity=".55" stroke-linejoin="round" stroke-linecap="round"';
  const CHAM = (mau, ds) => '<g fill="' + mau + '">' + ds.map(([x, y, r]) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"/>').join('') + '</g>';
  const BONG = '';

  /* các loại đế */
  /* đế nền hoạt hình (dải nước, gò cỏ, bãi cát) bỏ — bản đồ đã có mặt đất/nước thật; chỉ còn bóng tiếp đất */
  const DE_NUOC = (y) => '<ellipse cx="33" cy="' + (y + 4) + '" rx="24" ry="4.2" fill="#0b2a20" opacity=".2"/>';
  const DE_CAT = '<ellipse cx="33" cy="53" rx="23" ry="4" fill="#0b2a20" opacity=".2"/>';
  const DE_CO = DE_CAT;
  const DUA = (x, y, k) => {
    k = k || 1;
    const P = (a, b) => (x + a * k).toFixed(1) + ' ' + (y + b * k).toFixed(1);
    return '<path d="M' + P(0, 0) + 'Q' + P(3, -11) + ' ' + P(1, -22) + '" fill="none" stroke="#a06a35" stroke-width="' + (3 * k).toFixed(1) + '" stroke-linecap="round"/>' +
      '<path d="M' + P(1, -22) + 'q' + (-7 * k) + ' ' + (-5 * k) + ' ' + (-13 * k) + ' ' + (1 * k) + 'q' + (7 * k) + ' ' + (-1 * k) + ' ' + (13 * k) + ' ' + (-1 * k) + 'Z" ' + V('#4fbf62', '#2f9c47', 1.1) + '/>' +
      '<path d="M' + P(1, -22) + 'q' + (7 * k) + ' ' + (-5 * k) + ' ' + (13 * k) + ' ' + (1 * k) + 'q' + (-7 * k) + ' ' + (-1 * k) + ' ' + (-13 * k) + ' ' + (-1 * k) + 'Z" ' + V('#5ccb6d', '#2f9c47', 1.1) + '/>' +
      '<path d="M' + P(1, -22) + 'q' + (-2 * k) + ' ' + (-8 * k) + ' ' + (-9 * k) + ' ' + (-9 * k) + 'q' + (5 * k) + ' ' + (3 * k) + ' ' + (9 * k) + ' ' + (9 * k) + 'Z" ' + V('#6ad67a', '#2f9c47', 1.1) + '/>' +
      '<path d="M' + P(1, -22) + 'q' + (3 * k) + ' ' + (-8 * k) + ' ' + (10 * k) + ' ' + (-8 * k) + 'q' + (-5 * k) + ' ' + (2 * k) + ' ' + (-10 * k) + ' ' + (8 * k) + 'Z" ' + V('#4fbf62', '#2f9c47', 1.1) + '/>';
  };
  const DAO = '<path d="M8 56q3-12 22-14 18-1 26 9 2 4-2 5Z" ' + V('#f8e3a6', '#e2c47a', 1.2) + '/>';
  /* máy bay nhìn ngang màu Sun PhuQuoc Airways, mũi hướng phải */
  const MAY_BAY_NGANG = (tx, ty, k, goc) => '<g transform="translate(' + tx + ' ' + ty + ') rotate(' + (goc || 0) + ') scale(' + k + ')">' +
    '<path d="M-2 0c0-2 1.6-3 4-3h26c3 0 6 1.4 8 3-2 1.6-5 3-8 3H2C-.4 3-2 2-2 0Z" ' + V('#ffffff', '#b9c4cc', 1) + '/>' +
    '<path d="M1-3 -3-13h4l6 10Z" ' + V('#e0322b', '#b8211c', .9) + '/><circle cx="1.4" cy="-8.4" r="1.6" fill="#ffc93c"/>' +
    '<path d="M14 1 8 9h3.4l9-8Z" ' + V('#eef2f5', '#b9c4cc', .8) + '/><rect x="11" y="3.4" width="6" height="2.8" rx="1.4" fill="#e0322b"/>' +
    '<path d="M5 -.6h19" stroke="#e0322b" stroke-width="1"/></g>';

  const HINH = [
    /* ================= Bắc đảo ================= */
    s('h-vinwonders', BONG + DE_CO +
      '<rect x="13" y="30" width="38" height="21" rx="2" ' + V('#fbe7ba', '#dcb46e') + '/>' +
      '<rect x="8" y="22" width="11" height="29" rx="2" ' + V('#fdf0cf', '#dcb46e') + '/><rect x="45" y="22" width="11" height="29" rx="2" ' + V('#fdf0cf', '#dcb46e') + '/>' +
      '<path d="M6.5 23.5 13.5 8l7 15.5Z" ' + V('#a48af2', '#7458d6') + '/><path d="M43.5 23.5 50.5 8l7 15.5Z" ' + V('#a48af2', '#7458d6') + '/>' +
      '<rect x="25" y="15" width="14" height="36" rx="2" ' + V('#fff4d8', '#dcb46e') + '/><path d="M23.5 16.5 32 1l8.5 15.5Z" ' + V('#8e70ee', '#6a4fd0') + '/>' +
      '<path d="M27.5 51v-8a4.5 4.5 0 0 1 9 0v8Z" ' + V('#7a62d8', '#5a43b8', 1.1) + '/>' +
      CHAM('#7a62d8', [[13.5, 31, 1.8], [50.5, 31, 1.8], [32, 26, 2]]) +
      CHAM('#ffffff', [[11, 18, 1], [48, 18, 1], [29, 10, 1.1]]) + '<circle cx="32" cy="1.6" r="1.3" fill="#ffc93c"/>'),

    s('h-safari', BONG + DE_CO +
      '<path d="M50 50V33" stroke="#a06a35" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="50" cy="29" rx="11" ry="6" ' + V('#6fcf6c', '#3fa34a') + '/>' +
      '<path d="M16 50V41M21 50V42M29 50V41M34 50V42" stroke="#d99a3a" stroke-width="3" stroke-linecap="round"/>' +
      '<ellipse cx="25" cy="39" rx="13" ry="7" ' + V('#f7bd52', '#d48f2c') + '/>' +
      '<path d="M32 36 37.5 11.5 42 12.4 38.6 38Z" ' + V('#f7bd52', '#d48f2c') + '/>' +
      '<ellipse cx="42" cy="10.4" rx="6.4" ry="4" transform="rotate(14 42 10.4)" ' + V('#f7bd52', '#d48f2c') + '/>' +
      '<path d="M39.5 7V3.6M42.6 7.4V4" stroke="#b36f22" stroke-width="1.6" stroke-linecap="round"/><circle cx="39.5" cy="3.2" r="1.3" fill="#b36f22"/><circle cx="42.6" cy="3.6" r="1.3" fill="#b36f22"/>' +
      '<circle cx="44" cy="9.6" r="1.1" fill="#4a2c10"/>' +
      CHAM('#dd9437', [[19, 37, 2.3], [26, 35.5, 2.1], [23, 41.5, 1.9], [31, 39.5, 1.8], [37, 19, 1.4], [36, 27, 1.5], [38.6, 14.5, 1.1]]) +
      CHAM('#fff3d6', [[20, 34.5, 1.1], [34.2, 33, .9]])),

    s('h-grand-world', BONG + DE_NUOC(46) +
      '<path d="M10 20Q32 12 54 20L47 46Q32 50 17 46Z" ' + V('#f2bf5c', '#c98a2e') + '/>' +
      '<path d="M10 20Q32 12 54 20 32 25 10 20Z" ' + V('#ffd98a', '#c98a2e') + '/>' +
      '<path d="M18 23.6 22 46.6M25 24.6l2 23M32 25v24M39 24.6l-2 23M46 23.6 42 46.6M12.8 31Q32 37 51.2 31M15 39Q32 44 49 39" fill="none" stroke="#c98a2e" stroke-width="1.1" stroke-linecap="round" opacity=".75"/>' +
      '<path d="M27 47v-6a5 5 0 0 1 10 0v6Z" ' + V('#8a5a24', '#6b4418', 1) + '/>' +
      CHAM('#fff4d0', [[20, 19, 1.2], [30, 16.8, 1], [44, 18, 1.1]])),

    s('h-ganh-dau', BONG + DE_NUOC(47) +
      '<path d="M16 50q2-8 10-10 10-1 14 4 4 3 2 7Z" ' + V('#b3a292', '#8a7a6a') + '/>' +
      '<path d="M26 41V17h10v24" ' + V('#ffffff', '#c9d2d8') + '/><path d="M26 23h10v5H26ZM26 33h10v5H26Z" ' + V('#ef5a4a', '#c93c2f', 1) + '/>' +
      '<rect x="24" y="12" width="14" height="5" rx="1.5" ' + V('#42505a', '#2b363d', 1) + '/><path d="M25 12 31 6l6 6Z" ' + V('#ef5a4a', '#c93c2f', 1) + '/>' +
      '<circle cx="31" cy="14.5" r="1.8" fill="#ffd166"/><path d="M40 14.5h8M40 11l6-3M40 18l6 3" stroke="#ffd166" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>'),

    /* mẫu gốc anh Hùng chọn — giữ nguyên */
    s('h-rach-vem', BONG +
      '<ellipse cx="33" cy="48" rx="26" ry="4" fill="#0b2a20" opacity=".18"/>' +
      '<path d="M40 44V30h16v14" fill="#b27a45"/><path d="M38 31l10-7 10 7Z" fill="#7d4f2a"/><path d="M36 44h24" stroke="#8a5a2b" stroke-width="2"/>' +
      '<path d="M4 44h34" stroke="#a06a35" stroke-width="2.4"/><path d="M8 44v8M16 44v8M24 44v8M32 44v8" stroke="#8a5a2b" stroke-width="1.4"/>' +
      '<g transform="translate(20 36) scale(.86)"><path d="M0-20l5.3 12.6 13.6.8-10.4 8.6 3.4 13.3L0 7.6l-11.9 7.3 3.4-13.3-10.4-8.6 13.6-.8Z" fill="#ff8a3d" stroke="#e0602a" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<g fill="#ffd4a8"><circle cx="0" cy="-10" r="1.4"/><circle cx="0" cy="-3" r="1.9"/><circle cx="8" cy="-3.6" r="1.2"/><circle cx="-8" cy="-3.6" r="1.2"/><circle cx="5" cy="4" r="1.2"/><circle cx="-5" cy="4" r="1.2"/></g></g>'),

    s('h-ham-rong', BONG + DE_NUOC(46) +
      '<path d="M10 50 17 30l11-6 9 9 7-3 9 9 3 11Z" ' + V('#b3a292', '#8a7a6a') + '/>' +
      '<path d="M17 30l11-6 5 5-6 3Z" fill="#cdbfb1"/>' + DUA(27, 26, .8) + CHAM('#e8ded3', [[22, 40, 1.4], [40, 42, 1.2]])),

    s('h-bai-thom', BONG + DE_CAT + DUA(20, 51, 1.05) + DUA(40, 52, .78) +
      '<path d="M26 45q7 5 12 0" fill="none" stroke="#ef5a4a" stroke-width="2" stroke-linecap="round"/>'),

    /* ================= Trung tâm ================= */
    s('h-duong-dong', BONG + DE_NUOC(44) +
      '<rect x="8" y="28" width="11" height="16" rx="1.5" ' + V('#ffe3a3', '#e0b85e') + '/><path d="M6.5 29 13.5 22l7 7Z" ' + V('#ef6a4f', '#c94a33') + '/>' +
      '<rect x="20" y="22" width="12" height="22" rx="1.5" ' + V('#ffffff', '#c9d2d8') + '/><path d="M18.5 23 26 15l7.5 8Z" ' + V('#4f8fd6', '#2f6fb5') + '/>' +
      '<rect x="33" y="30" width="10" height="14" rx="1.5" ' + V('#b6e6d8', '#7cc4b0') + '/><path d="M31.5 31 38 25l6.5 6Z" ' + V('#ef6a4f', '#c94a33') + '/>' +
      CHAM('#5b6b75', [[12, 34, 1.3], [16, 34, 1.3], [24, 28, 1.3], [28, 28, 1.3], [24, 35, 1.3], [28, 35, 1.3], [38, 36, 1.3]]) +
      '<path d="M36 49h24l-4 6H40Z" ' + V('#4f8fd6', '#2f6fb5') + '/><path d="M41 49v-4h11v4" ' + V('#ef6a4f', '#c94a33', 1) + '/>' +
      '<circle cx="56" cy="51.6" r="1.1" fill="#fff"/><path d="M46.5 45V38l5 4Z" ' + V('#ffffff', '#c9d2d8', 1) + '/>'),

    s('h-dinh-cau', BONG + DE_NUOC(47) +
      '<path d="M9 52q2-12 13-15 12-2 21 2 9 4 12 13Z" ' + V('#b3a292', '#8a7a6a') + '/>' +
      '<rect x="14" y="28" width="15" height="10" rx="1.5" ' + V('#ffd97a', '#e0ae3e') + '/><path d="M11 29.5h21l-3.6-6H14.6Z" ' + V('#e0493a', '#b8321f') + '/>' +
      '<path d="M19 38v-5.4a2.5 2.5 0 0 1 5 0V38Z" fill="#b8321f"/>' +
      '<path d="M37 39V16h7v23" ' + V('#ffffff', '#c9d2d8') + '/><rect x="35.6" y="12.6" width="9.8" height="4" rx="1" ' + V('#e0493a', '#b8321f', 1) + '/>' +
      '<rect x="37.6" y="8.6" width="5.8" height="4" rx="1" ' + V('#ffe79a', '#42505a', .9) + '/><path d="M36.8 8.8 40.5 4.6l3.7 4.2Z" ' + V('#e0493a', '#b8321f', 1) + '/>' +
      CHAM('#e8ded3', [[22, 45, 1.4], [44, 46, 1.2]])),

    s('h-cho-dem', BONG + DE_CAT +
      '<rect x="12" y="30" width="40" height="20" rx="2" ' + V('#b98357', '#8d5a33') + '/>' +
      '<path d="M8 30h48l-4-11H12Z" ' + V('#ef5a4a', '#c93c2f') + '/>' +
      '<path d="M20 19l-2 11M29 19l-1 11M38 19l1 11M46 19l2 11" stroke="#fff" stroke-width="3.2"/>' +
      '<path d="M8 30q5 5 10 0 5 5 10 0 5 5 10 0 5 5 10 0 5 5 8 0" ' + V('#ef5a4a', '#c93c2f', 1.2) + '/>' +
      '<rect x="16" y="39" width="32" height="5" rx="2.5" ' + V('#d9a376', '#8d5a33', 1) + '/>' +
      '<circle cx="21" cy="38.5" r="3" ' + V('#ffa24d', '#e07a22', 1) + '/><circle cx="29" cy="38.5" r="3" ' + V('#ffd166', '#e0a526', 1) + '/><circle cx="37" cy="38.5" r="3" ' + V('#8bd46a', '#5aa83a', 1) + '/><circle cx="44" cy="38.5" r="2.6" ' + V('#ff7a7a', '#d9504f', 1) + '/>' +
      '<path d="M14 9v5M32 7v6M50 9v5" stroke="#6b5a4a" stroke-width="1"/>' +
      '<ellipse cx="14" cy="15.6" rx="3.2" ry="3.8" ' + V('#ff5a4d', '#c93c2f', 1) + '/><ellipse cx="32" cy="14.6" rx="3.2" ry="3.8" ' + V('#ffc93c', '#e0a526', 1) + '/><ellipse cx="50" cy="15.6" rx="3.2" ry="3.8" ' + V('#ff5a4d', '#c93c2f', 1) + '/>'),

    s('h-sanato', BONG + DE_NUOC(44) +
      '<circle cx="32" cy="27" r="16" ' + V('#ffc36b', '#f0a23e', 1.2) + '/><circle cx="32" cy="27" r="10" fill="#ffe08f"/>' +
      '<path d="M18 21q12-8 24-1 3 3 1 6H19q-3-2-1-5Z" ' + V('#5f5450', '#3e3532') + '/>' +
      '<path d="M42 20q6 0 6 5 0 5-3 9" fill="none" stroke="#3e3532" stroke-width="2.6" stroke-linecap="round"/><path d="M42 20q6 0 6 5 0 5-3 9" fill="none" stroke="#5f5450" stroke-width="1.2" stroke-linecap="round"/>' +
      '<path d="M22 26 19 50M27 26l-1 24M36 26l1 24M41 26l3 24" stroke="#3e3532" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="41.5" cy="21.6" r=".9" fill="#fff"/>'),

    s('h-bai-truong', BONG + DE_CAT + DUA(16, 51, .95) +
      '<circle cx="43" cy="28" r="10" ' + V('#ffc36b', '#f0a23e', 1.2) + '/><circle cx="43" cy="28" r="6" fill="#ffe08f"/>' +
      '<path d="M31 42h24M35 46h16" stroke="#f0a23e" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>'),

    /* ================= Nam đảo ================= */
    s('h-ho-quoc', BONG + DE_CO +
      '<rect x="10" y="32" width="44" height="18" rx="2" ' + V('#f5c664', '#d49a2e') + '/>' +
      '<path d="M5 33.5Q32 24 59 33.5l-4.6-5.4H9.6Z" ' + V('#c9493a', '#9c3024') + '/><path d="M4 33.6q2-3 5.6-5.6M60 33.6q-2-3-5.6-5.6" fill="none" stroke="#9c3024" stroke-width="2.2" stroke-linecap="round"/>' +
      '<rect x="21" y="20" width="22" height="9" rx="1.5" ' + V('#f5c664', '#d49a2e') + '/>' +
      '<path d="M16.5 21.4Q32 14.6 47.5 21.4l-3.4-4H19.9Z" ' + V('#c9493a', '#9c3024') + '/><path d="M15.6 21.4q1.8-2.2 4.2-4M48.4 21.4q-1.8-2.2-4.2-4" fill="none" stroke="#9c3024" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="32" cy="13" r="2" ' + V('#ffd166', '#d49a2e', 1) + '/>' +
      '<path d="M27 50v-8a5 5 0 0 1 10 0v8Z" ' + V('#8b3a2b', '#6b2a1d', 1) + '/><path d="M14 50v-6a3 3 0 0 1 6 0v6ZM44 50v-6a3 3 0 0 1 6 0v6Z" ' + V('#8b3a2b', '#6b2a1d', 1) + '/>' +
      CHAM('#fff0c2', [[14, 36, 1.2], [50, 36, 1.2], [25, 23, 1]])),

    s('h-nha-tu', BONG + DE_CO +
      '<path d="M6 50V37M14 50V37M22 50V37M30 50V37" stroke="#8d6a45" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M5 40q3-2 6 0t6 0 6 0 6 0 6 0M5 45q3-2 6 0t6 0 6 0 6 0 6 0" fill="none" stroke="#7d8a90" stroke-width="1.2" stroke-linecap="round"/>' +
      '<path d="M38 55 42 24M58 55 54 24" stroke="#a06a35" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M40.6 42h15M41.4 33h13.4M39.4 50 55.2 36M56.6 50 40.8 36" stroke="#a06a35" stroke-width="1.5" stroke-linecap="round"/>' +
      '<rect x="37" y="16" width="22" height="10" rx="1.5" ' + V('#c08a57', '#8d5a33') + '/><rect x="40" y="18.4" width="16" height="5" rx="1" fill="#4a3a2e"/>' +
      '<path d="M34 17 48 7l14 10Z" ' + V('#8d6a45', '#6b4a2a') + '/>'),

    s('h-bai-sao', BONG + DE_CAT + DUA(14, 51, .85) +
      '<path d="M37 51 41 24" stroke="#a06a35" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M24 26q17-16 34 2Z" ' + V('#ff7a96', '#e0506f') + '/><path d="M34 13.6q-4 5-4 11.6M47.6 16q-1 5 1.6 10.4" fill="none" stroke="#fff" stroke-width="2" opacity=".85"/>' +
      '<path d="M42 50l11-4 6 4" fill="none" stroke="#4fa8e0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),

    s('h-bai-khem', BONG + DE_CAT +
      '<path d="M21 51 24 24" stroke="#a06a35" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M8 27q16-15 32 2Z" ' + V('#56b8ee', '#2f8fcc') + '/><path d="M18 15q-3 5-2 11.4M31 14.6q1 5-1 12" fill="none" stroke="#fff" stroke-width="2" opacity=".85"/>' +
      '<path d="M32 50l14-6 7 6" fill="none" stroke="#ff9a4a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' + DUA(52, 44, .6)),

    s('h-sunset-town', BONG + DE_NUOC(48) +
      '<circle cx="52" cy="14" r="5" ' + V('#ffc36b', '#f0a23e', 1) + '/>' +
      '<rect x="5" y="32" width="11" height="16" rx="1.5" ' + V('#ffd97a', '#e0ae3e') + '/><rect x="16" y="27" width="10" height="21" rx="1.5" ' + V('#ffb3cc', '#e07fa0') + '/>' +
      '<rect x="38" y="30" width="11" height="18" rx="1.5" ' + V('#9fe0cf', '#5fb8a0') + '/><rect x="49" y="35" width="10" height="13" rx="1.5" ' + V('#ffae8c', '#e07a55') + '/>' +
      '<rect x="26" y="16" width="12" height="32" rx="1" ' + V('#e0694a', '#b84a2f') + '/><path d="M26 30h12M26 39h12" stroke="#ffe9d6" stroke-width="1.3"/>' +
      '<rect x="25" y="10" width="14" height="7" rx="1" ' + V('#fff4e2', '#d9bfa3') + '/><path d="M28 17v-4M32 17v-4M36 17v-4" stroke="#b84a2f" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M24.4 10.4h15.2L32 1.6Z" ' + V('#5aa37b', '#3d8060') + '/>' +
      '<circle cx="32" cy="23.5" r="3.8" ' + V('#ffffff', '#b84a2f', 1) + '/><path d="M32 21.4v2.1l1.6 1" stroke="#42505a" stroke-width="1" fill="none" stroke-linecap="round"/>' +
      CHAM('#ffffff', [[8.5, 37, 1.1], [12.5, 37, 1.1], [21, 33, 1.1], [41.5, 36, 1.1], [45.5, 36, 1.1], [54, 40, 1]])),

    s('h-cau-hon', BONG +
      '<circle cx="32" cy="27" r="11" ' + V('#ffc36b', '#f0a23e', 1.2) + '/><circle cx="32" cy="27" r="7" fill="#ffe08f"/>' +
      DE_NUOC(42) +
      '<path d="M3 42Q18 40 29 26.5" fill="none" stroke="#e6d7bc" stroke-width="6.4" stroke-linecap="round"/><path d="M35 26.5Q46 40 61 42" fill="none" stroke="#e6d7bc" stroke-width="6.4" stroke-linecap="round"/>' +
      '<path d="M3 42Q18 40 29 26.5" fill="none" stroke="#fffaf0" stroke-width="3.6" stroke-linecap="round"/><path d="M35 26.5Q46 40 61 42" fill="none" stroke="#fffaf0" stroke-width="3.6" stroke-linecap="round"/>' +
      '<path d="M31.8 17.6c-1.5-2.4-5-.6-3 2.2l3 3 3-3c2-2.8-1.5-4.6-3-2.2Z" ' + V('#ff6f8f', '#e0506f', 1) + '/>'),

    s('h-ga-cap-treo', BONG + DE_CO +
      '<path d="M2 14 52 6" stroke="#42505a" stroke-width="1.4" stroke-linecap="round"/>' +
      '<path d="M50 54 53 6h4l3 48" fill="none" stroke="#dfe5e9" stroke-width="2.6" stroke-linejoin="round"/><path d="M51 42h8M51.8 30h6.4M52.6 18h4.8" stroke="#dfe5e9" stroke-width="1.6"/>' +
      '<path d="M50 54 53 6h4l3 48" fill="none" stroke="#9aa6ad" stroke-width=".8"/>' +
      '<path d="M24 10.2v6" stroke="#42505a" stroke-width="1.8" stroke-linecap="round"/>' +
      '<rect x="12" y="16" width="24" height="19" rx="5" ' + V('#ffc93c', '#d99a12') + '/><rect x="12" y="28" width="24" height="5" fill="#3a3a3a"/>' +
      '<rect x="15.5" y="19" width="17" height="6.4" rx="2" ' + V('#c9ecff', '#8ec6e6', 1) + '/>' +
      '<rect x="6" y="41" width="36" height="12" rx="1.5" ' + V('#fdf0d6', '#d9bf97') + '/><path d="M4 42h40l-5-6H9Z" ' + V('#e0694a', '#b84a2f') + '/>' +
      CHAM('#fff', [[17, 18, 1], [30, 20, .8]])),

    /* ================= Cửa ngõ ================= */
    s('h-san-bay', BONG + DE_CO +
      '<rect x="12" y="37" width="40" height="13" rx="2" ' + V('#b9e3f7', '#7fbfe0') + '/><path d="M22 37v13M32 37v13M42 37v13" stroke="#7fbfe0" stroke-width="1"/>' +
      '<path d="M32 38C24 29 12 28 3 32c7 .8 11 3 14 6Z" ' + V('#f05a3a', '#c83d22') + '/><path d="M32 38c8-9 20-10 29-6-7 .8-11 3-14 6Z" ' + V('#f05a3a', '#c83d22') + '/>' +
      '<path d="M32 38C26 32 18 31 11 33c5 .8 8 2.6 10 5ZM32 38c6-6 14-7 21-5-5 .8-8 2.6-10 5Z" fill="#ffb13d"/>' +
      '<path d="M32 38q-3-6 0-11 3 5 0 11Z" ' + V('#ffd166', '#e0a526', 1) + '/>' +
      MAY_BAY_NGANG(13, 17, .9, -14)),

    s('h-cang-bai-vong', BONG + DE_NUOC(44) +
      '<rect x="6" y="30" width="20" height="14" rx="1.5" ' + V('#ffffff', '#c9d2d8') + '/><path d="M4 31h24l-3.4-5.4H7.4Z" ' + V('#4f8fd6', '#2f6fb5') + '/>' +
      CHAM('#8fd0f0', [[11, 36.5, 1.8], [16, 36.5, 1.8], [21, 36.5, 1.8]]) +
      '<path d="M27 46h30q3 0 3 2l-3.4 5.6H30.6Z" ' + V('#ffffff', '#b9c4cc') + '/><path d="M30 49.4h28" stroke="#e0322b" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M33 46v-6h19l4 6Z" ' + V('#ffffff', '#b9c4cc') + '/><path d="M35.4 42.4h17" stroke="#4f8fd6" stroke-width="2.4" stroke-linecap="round"/>'),

    s('h-cang-vinh-dam', BONG + DE_NUOC(44) +
      '<path d="M3 43h30" stroke="#b27a45" stroke-width="3.4" stroke-linecap="round"/><path d="M8 43v10M16 43v10M24 43v10M31 43v10" stroke="#8a5a2b" stroke-width="1.6" stroke-linecap="round"/>' +
      '<rect x="4" y="27" width="17" height="16" rx="1.5" ' + V('#fff5e0', '#d9bf97') + '/><path d="M2 28l10.5-7.4L23 28Z" ' + V('#ff8a3d', '#e0602a') + '/><rect x="9" y="33" width="6" height="10" rx="1" fill="#4f8fd6"/>' +
      '<g transform="translate(33 44)"><path d="M0 2h22q3.4 0 6 2.4-2.6 3-6 3H2Z" ' + V('#ffffff', '#b9c4cc', 1.1) + '/><path d="M3 5.2h20" stroke="#ff7a1a" stroke-width="1.6" stroke-linecap="round"/><rect x="8" y="-2" width="9" height="4.4" rx="1.6" ' + V('#4f8fd6', '#2f6fb5', .9) + '/></g>'),

    s('h-cang-an-thoi', BONG + DE_NUOC(44) +
      '<path d="M10 44V14h3.4v30" ' + V('#ffa24d', '#e07a22', 1.1) + '/><path d="M4 12.6h28v3.6H4Z" ' + V('#ffa24d', '#e07a22', 1.1) + '/>' +
      '<path d="M26 16.4v8" stroke="#42505a" stroke-width="1"/><rect x="23.6" y="24.4" width="5" height="3.4" rx=".8" fill="#42505a"/>' +
      '<rect x="15" y="33" width="7" height="11" rx="1" ' + V('#4f8fd6', '#2f6fb5', 1) + '/><rect x="22" y="36" width="7" height="8" rx="1" ' + V('#ef5a4a', '#c93c2f', 1) + '/><rect x="15" y="27" width="7" height="6" rx="1" ' + V('#5cc27c', '#3a9a58', 1) + '/>' +
      '<path d="M30 45h28q3 0 2 2l-3 5.6H33Z" ' + V('#ffffff', '#b9c4cc') + '/><path d="M33 48.6h26" stroke="#4f8fd6" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M44 45v-8h11l3 8Z" ' + V('#ffffff', '#b9c4cc') + '/><rect x="48" y="31" width="4" height="6" rx="1" ' + V('#ef5a4a', '#c93c2f', .9) + '/>'),

    s('h-cang-quoc-te', BONG + DE_NUOC(40) +
      '<path d="M3 45 30 42" stroke="#f3eee4" stroke-width="3.6" stroke-linecap="round"/><path d="M7 45v8M14 44.4v8M21 43.6v8M28 42.8v8" stroke="#d6cdbb" stroke-width="1.4" stroke-linecap="round"/>' +
      '<path d="M24 40h36l-2.6 8H26.6Z" ' + V('#ffffff', '#b9c4cc') + '/><path d="M26.6 44.4h31" stroke="#4f8fd6" stroke-width="1.6"/>' +
      '<rect x="28" y="33" width="28" height="7" rx="1.5" ' + V('#ffffff', '#b9c4cc') + '/><rect x="31" y="27" width="22" height="6" rx="1.5" ' + V('#ffffff', '#b9c4cc') + '/><rect x="35" y="22" width="14" height="5" rx="1.5" ' + V('#ffffff', '#b9c4cc') + '/>' +
      '<path d="M30 36.4h24M33 30h18" stroke="#8fd0f0" stroke-width="1.6" stroke-dasharray="2 1.4"/>' +
      '<path d="M43 22v-6h4.4l1 6Z" ' + V('#4f8fd6', '#2f6fb5', 1) + '/><rect x="43" y="15.6" width="5.4" height="2" fill="#e0322b"/>'),

    s('h-ben-tau', BONG + DE_NUOC(44) +
      '<rect x="5" y="25" width="24" height="19" rx="1.5" ' + V('#ffffff', '#c9d2d8') + '/><path d="M3 26h28l-4-6H7Z" ' + V('#ef5a4a', '#c93c2f') + '/>' +
      CHAM('#8fd0f0', [[11, 32, 2], [17, 32, 2], [23, 32, 2]]) + '<rect x="14" y="37" width="6" height="7" rx="1" fill="#4f8fd6"/>' +
      '<path d="M30 46h27q3 0 3 2l-3.4 5.6H33.4Z" ' + V('#ffffff', '#b9c4cc') + '/><path d="M33 49.4h25" stroke="#e0322b" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M35 46v-6h17l4 6Z" ' + V('#ffffff', '#b9c4cc') + '/><path d="M37.4 42.4h15" stroke="#4f8fd6" stroke-width="2.4" stroke-linecap="round"/>'),

    /* ================= Quần đảo An Thới ================= */
    s('h-hon-thom', BONG + DE_NUOC(47) +
      '<path d="M5 52q6-20 26-22 22-1 29 22Z" ' + V('#7fd07d', '#4fae54') + '/>' +
      '<path d="M30 52q0-9 8-11t8-11 6-9" fill="none" stroke="#c93c2f" stroke-width="6" stroke-linecap="round"/><path d="M30 52q0-9 8-11t8-11 6-9" fill="none" stroke="#ff6a5a" stroke-width="3.6" stroke-linecap="round"/>' +
      '<path d="M40 52q-1-7 5-9t6-9" fill="none" stroke="#d99a12" stroke-width="5.4" stroke-linecap="round"/><path d="M40 52q-1-7 5-9t6-9" fill="none" stroke="#ffd23c" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M2 11 62 3" stroke="#42505a" stroke-width="1.3" stroke-linecap="round"/><path d="M20 8.6v5" stroke="#42505a" stroke-width="1.6" stroke-linecap="round"/>' +
      '<rect x="11" y="13.4" width="18" height="13" rx="3.4" ' + V('#ffc93c', '#d99a12', 1.2) + '/><rect x="11" y="21.6" width="18" height="3.6" fill="#3a3a3a"/><rect x="13.6" y="15.6" width="12.8" height="4.4" rx="1.4" fill="#c9ecff"/>'),

    s('h-may-rut', BONG + DE_NUOC(48) + DAO + DUA(25, 46, .85) + DUA(37, 47, .68) +
      '<path d="M44 46.6a5 2.6 0 0 1 10 0Z" ' + V('#ff7a96', '#e0506f', 1) + '/>'),
    s('h-may-rut-ngoai', BONG + DE_NUOC(48) + DAO + DUA(20, 46, .85) +
      '<circle cx="42" cy="34" r="9" ' + V('#ffc93c', '#d99a12') + '/><circle cx="42" cy="34" r="5.2" ' + V('#c9ecff', '#6b7a82', 1.1) + '/>' +
      '<rect x="37" y="42" width="10" height="4" rx="1.2" ' + V('#8a969c', '#6b7a82', 1) + '/><circle cx="40" cy="32" r="1.2" fill="#fff"/>' +
      '<g fill="none" stroke="#fff" stroke-width="1.3"><circle cx="52" cy="24" r="1.8"/><circle cx="55" cy="18" r="1.2"/></g>'),
    s('h-gam-ghi', BONG + DE_NUOC(40) +
      '<path d="M14 56V44m0 6-4-6m4 3 5-7M22 56V40m0 8 5-6m-5 2-4-7" fill="none" stroke="#e0506f" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M14 56V44m0 6-4-6m4 3 5-7M22 56V40m0 8 5-6m-5 2-4-7" fill="none" stroke="#ff8aa6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M40 56q-2-10 4-14 6 4 4 14Z" ' + V('#ffc36b', '#e0962e') + '/><path d="M49 56q0-8 6-10 3 5-1 10Z" ' + V('#c49cf0', '#9670d6') + '/>' +
      '<g transform="translate(30 22)"><path d="M0 0q8-7 16 0-8 7-16 0Z" ' + V('#ffd23c', '#e0a526', 1.1) + '/><path d="M16 0l6-5v10Z" ' + V('#ffa24d', '#e07a22', 1) + '/><circle cx="4.4" cy="-1" r="1.3" fill="#3a3a3a"/><path d="M9-4v8" stroke="#fff" stroke-width="1.6"/></g>' +
      '<g transform="translate(9 17) scale(.72)"><path d="M0 0q8-7 16 0-8 7-16 0Z" ' + V('#6cc4ee', '#3a95c8', 1.3) + '/><path d="M16 0l6-5v10Z" ' + V('#4f8fd6', '#2f6fb5', 1.2) + '/><circle cx="4.4" cy="-1" r="1.3" fill="#3a3a3a"/></g>'),
    s('h-mong-tay', BONG + DE_NUOC(48) +
      '<path d="M12 54q8-6 20-6 14 0 22 6Z" ' + V('#f8e3a6', '#e2c47a', 1.2) + '/>' +
      '<path d="M22 51q5-18 14-23 7 10 4 23Z" ' + V('#b3a292', '#8a7a6a') + '/><path d="M29 34q4-5 7-6 2 4 1 8Z" fill="#cdbfb1"/>' + DUA(46, 50, .6)),

    /* ================= phương tiện — nhìn từ trên, mũi hướng PHẢI ================= */
    s('xe-may-bay',
      '<path d="M36 29.2 26 5.5h-4.2l6.6 23.7ZM36 34.8 26 58.5h-4.2l6.6-23.7Z" ' + V('#eef2f5', '#b3bec6', .7) + '/>' +
      '<path d="M22 5.5h4l-1 2.2h-3.2ZM22 58.5h4l-1-2.2h-3.2Z" fill="#e0322b"/>' +
      '<rect x="27.5" y="15" width="7" height="3.6" rx="1.8" fill="#e0322b"/><rect x="27.5" y="45.4" width="7" height="3.6" rx="1.8" fill="#e0322b"/>' +
      '<path d="M10 30.4 4.6 21.6H2l3 8.8ZM10 33.6 4.6 42.4H2l3-8.8Z" ' + V('#eef2f5', '#b3bec6', .7) + '/>' +
      '<path d="M3 32c0-1.8 1.6-3 3.6-3H52c3.6 0 7.6 1.4 9.4 3-1.8 1.6-5.8 3-9.4 3H6.6C4.6 35 3 33.8 3 32Z" ' + V('#ffffff', '#b3bec6', .8) + '/>' +
      '<path d="M3.4 32H15" stroke="#e0322b" stroke-width="2.4" stroke-linecap="round"/><path d="M9 32h6" stroke="#ffb13d" stroke-width="2.4" stroke-linecap="round"/><circle cx="17" cy="32" r="1.3" fill="#ffc93c"/>' +
      '<path d="M57.4 30.8q1.8.5 2.6 1.2-.8.7-2.6 1.2Z" fill="#42505a"/>', '0 0 64 64'),
    s('xe-tau',
      '<path d="M0 32q7-6 16-6.6M0 32q7 6 16 6.6" fill="none" stroke="#fff" stroke-width="2.6" opacity=".55" stroke-linecap="round"/>' +
      '<path d="M12 25h34c7 0 13 3.6 16 7-3 3.4-9 7-16 7H12a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3Z" ' + V('#ffffff', '#b3bec6', .8) + '/>' +
      '<path d="M11 26.8h35c5 0 10 2.4 13 5.2M11 37.2h35c5 0 10-2.4 13-5.2" fill="none" stroke="#e0322b" stroke-width="1.3"/>' +
      '<rect x="15" y="28.4" width="28" height="7.2" rx="2.6" fill="#e9eff3"/><path d="M18 30h24M18 34h24" stroke="#4f8fd6" stroke-width="1.5" stroke-dasharray="2.4 1.2"/>', '0 0 64 64'),
    s('xe-cano',
      '<path d="M2 32q8-4 18-4M2 32q8 4 18 4" fill="none" stroke="#fff" stroke-width="2.2" opacity=".7" stroke-linecap="round"/>' +
      '<path d="M18 27.6h22c6 0 11 2 15 4.4-4 2.4-9 4.4-15 4.4H18Z" ' + V('#ffffff', '#b3bec6', .8) + '/>' +
      '<path d="M19 29.6h22c4 0 8 1 11 2.4M19 34.4h22c4 0 8-1 11-2.4" fill="none" stroke="#ff7a1a" stroke-width="1.3"/>' +
      '<rect x="25" y="29.4" width="10" height="5.2" rx="1.8" fill="#4f8fd6"/>', '0 0 64 64'),
    s('xe-cabin',
      '<path d="M32 4v10" stroke="#42505a" stroke-width="2" stroke-linecap="round"/><rect x="26" y="2" width="12" height="4" rx="1.4" fill="#42505a"/>' +
      '<rect x="18" y="14" width="28" height="26" rx="7" ' + V('#ffc93c', '#d99a12', 1.6) + '/><rect x="18" y="31" width="28" height="7" fill="#3a3a3a"/>' +
      '<rect x="22" y="18" width="20" height="9" rx="2.6" fill="#c9ecff"/>', '0 0 64 64'),
    s('xe-buom', '<path d="M6 22h20l-3 4H9Z" ' + V('#c08a57', '#8d5a33', .8) + '/><path d="M16 22V4l8 16Z" ' + V('#ffffff', '#c9d2d8', .8) + '/><path d="M15 22V7l-7 13Z" ' + V('#ffd166', '#e0a526', .8) + '/>' +
      '<path d="M3 27q4-2 8 0t8 0 8 0" fill="none" stroke="#fff" stroke-width="1.2" opacity=".8"/>', '0 0 32 32'),
  ];

  const THEO_DIEM = {
    'vinwonders': 'h-vinwonders', 'safari': 'h-safari', 'grand-world': 'h-grand-world',
    'ganh-dau': 'h-ganh-dau', 'rach-vem': 'h-rach-vem', 'ham-rong': 'h-ham-rong', 'bai-thom': 'h-bai-thom',
    'duong-dong': 'h-duong-dong', 'dinh-cau': 'h-dinh-cau', 'cho-dem': 'h-cho-dem',
    'sanato': 'h-sanato', 'bai-truong': 'h-bai-truong',
    'ho-quoc': 'h-ho-quoc', 'nha-tu': 'h-nha-tu', 'bai-sao': 'h-bai-sao', 'bai-khem': 'h-bai-khem',
    'sunset-town': 'h-sunset-town', 'cau-hon': 'h-cau-hon', 'ga-cap-treo': 'h-ga-cap-treo',
    'hon-thom': 'h-hon-thom', 'may-rut-trong': 'h-may-rut', 'may-rut-ngoai': 'h-may-rut-ngoai',
    'gam-ghi': 'h-gam-ghi', 'mong-tay': 'h-mong-tay',
    'san-bay': 'h-san-bay', 'cang-bai-vong': 'h-cang-bai-vong', 'cang-vinh-dam': 'h-cang-vinh-dam',
    'cang-an-thoi': 'h-cang-an-thoi', 'cang-quoc-te': 'h-cang-quoc-te', 'rach-gia': 'h-ben-tau', 'ha-tien': 'h-ben-tau',
  };

  window.PQ_HINH_VE = { defs: HINH.join(''), theoDiem: THEO_DIEM };
})();
