/* ==========================================================================
   Sơ đồ Phú Quốc — lịch trình vẽ bằng vector (anh Hùng 23/09/2026).

   KHÔNG phải bản đồ đo đạc: đường bờ biển là đa giác GẦN ĐÚNG (sai số ~1 km), đủ
   để nhìn chuyến đi chạy từ Bắc (VinWonders, Safari) xuống Nam (An Thới, Hòn Thơm)
   ra sao trong từng ngày. Địa điểm đoán bằng từ khoá trong tên hạng mục / điểm hẹn /
   đối tác; không đoán được thì để ở danh sách "chưa rõ vị trí" — thiếu dữ liệu
   thì không vẽ bừa.
   ========================================================================== */
(function (goc) {
  'use strict';
  /* [kinh độ, vĩ độ] theo chiều kim đồng hồ từ Gành Dầu (Tây Bắc). */
  const DAO = [[103.845, 10.372], [103.858, 10.398], [103.884, 10.418], [103.92, 10.438], [103.955, 10.452], [103.99, 10.458],
    [104.025, 10.447], [104.056, 10.43], [104.079, 10.408], [104.084, 10.382], [104.066, 10.36], [104.045, 10.345], [104.043, 10.315],
    [104.058, 10.286], [104.076, 10.255], [104.083, 10.222], [104.072, 10.19], [104.078, 10.158], [104.073, 10.12], [104.062, 10.088],
    [104.052, 10.058], [104.046, 10.03], [104.034, 10.006], [104.018, 10.004], [104.006, 10.022], [103.994, 10.055], [103.984, 10.09],
    [103.976, 10.128], [103.969, 10.165], [103.958, 10.2], [103.95, 10.228], [103.929, 10.255], [103.9, 10.276], [103.872, 10.298],
    [103.856, 10.322], [103.846, 10.348]];
  const DAO_NHO = [[104.03, 9.958, 0.009, 0.007], [104.012, 9.975, 0.006, 0.005], [104.0, 9.99, 0.005, 0.004], [104.045, 9.94, 0.006, 0.005], [103.99, 9.975, 0.004, 0.003]];

  /* Địa điểm hay đi — từ khoá viết không dấu, cụ thể đứng TRƯỚC chung chung. */
  const DIEM = [
    ['VinWonders', 103.861, 10.336, ['vinwonders', 'vin wonders']],
    ['Vinpearl Safari', 103.887, 10.339, ['safari']],
    ['Grand World', 103.873, 10.331, ['grand world', 'venice', 'tinh hoa viet nam', 'bao tang gau', 'teddy', 'gland_gw', 'gland_vin', 'wyndham']],
    ['Vinpearl Resort', 103.852, 10.327, ['vinpearl resort', 'melia vinpearl', 'wonderworld', 'vinholiday']],
    ['Gành Dầu', 103.846, 10.37, ['ganh dau']],
    ['Rạch Vẹm', 103.968, 10.382, ['rach vem', 'sao bien', 'gland_rv']],
    ['Bãi Thơm', 104.02, 10.362, ['bai thom']],
    ['Sân bay', 103.993, 10.17, ['san bay', 'don bay', 'tien bay', 'airport']],
    ['Bãi Trường', 103.967, 10.157, ['bai truong', 'long beach']],
    ['Suối Tranh', 104.02, 10.178, ['suoi tranh']],
    ['Hàm Ninh', 104.052, 10.183, ['ham ninh']],
    ['Thiền viện Trúc Lâm', 104.047, 10.107, ['ho quoc', 'thien vien', 'truc lam']],
    ['Nhà tù Phú Quốc', 104.034, 10.064, ['nha tu', 'coconut prison']],
    ['Bãi Sao', 104.038, 10.056, ['bai sao']],
    ['Bãi Khem', 104.031, 10.031, ['bai khem', 'symphony', 'kiss of the sea', 'sun premier', 'nha hat', 'gland5', 'land 5']],
    ['Sunset Town', 104.016, 10.031, ['sunset town', 'cau hon', 'kiss bridge', 'hoang hon', 'viet xua an thoi', 'an thoi']],
    ['Ga cáp treo An Thới', 104.011, 10.024, ['ga cap treo']],
    ['Hòn Thơm', 104.03, 9.958, ['hon thom', 'cap treo', 'sun world', 'aquatopia', 'exotica', 'sun paradise', 'sun-c', 'mango']],
    ['3 đảo (Hòn Mây Rút)', 104.0, 9.99, ['3 dao', 'ba dao', 'cano', 'hon may rut', 'hon gam ghi', 'lan bien', 'lan ngam', 'g4']],
    ['Dương Đông', 103.962, 10.217, ['duong dong', 'cho dem', 'dinh cau', 'night market', 'viet xua']],
  ];
  const kd = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

  const W = 300, H = 560, X0 = 103.82, X1 = 104.1, Y0 = 10.47, Y1 = 9.93;
  const px = (lng) => ((lng - X0) / (X1 - X0)) * W;
  const py = (lat) => ((Y0 - lat) / (Y0 - Y1)) * H;

  /** Đoán địa điểm của một hạng mục. Trả null khi không chắc. */
  function doan(h) {
    const t = kd([h.ten, h.diemHen, h.nhaCungCap, h.maDv].join(' '));
    for (const d of DIEM) if (d[3].some((k) => t.includes(k))) return { ten: d[0], x: px(d[1]), y: py(d[2]) };
    return null;
  }

  const e = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /**
   * @param moc  [{ngay (ms đầu ngày), gio (ms|0), ten, h (hạng mục đại diện)}] — đã gộp NL/TE
   * @param nho  true = bản nhỏ cho cột bên cạnh bảng kê
   * @returns {{svg:string, chuaRo:string[], coDiem:number}}
   */
  function ve(moc, nho) {
    const ngay = [...new Set(moc.map((m) => m.ngay).filter(Boolean))].sort((a, b) => a - b);
    const chuaRo = [];
    const diem = [];
    moc.forEach((m) => {
      const d = doan(m.h);
      if (!d) { chuaRo.push(m.ten); return; }
      /* Nhãn trên sơ đồ là TÊN ĐỊA ĐIỂM (ngắn, không chồng); tên hạng mục nằm trong tooltip. */
      diem.push({ ...d, noi: d.ten, ngay: ngay.indexOf(m.ngay), gio: m.gio, ten: m.ten });
    });
    const dao = 'M' + DAO.map(([a, b]) => px(a).toFixed(1) + ',' + py(b).toFixed(1)).join('L') + 'Z';
    const daoNho = DAO_NHO.map(([a, b, rx, ry]) => '<ellipse class="bd-dao" cx="' + px(a).toFixed(1) + '" cy="' + py(b).toFixed(1) +
      '" rx="' + (rx / (X1 - X0) * W).toFixed(1) + '" ry="' + (ry / (Y0 - Y1) * H).toFixed(1) + '"/>').join('');
    /* Đường đi: nối các điểm theo thứ tự thời gian trong TỪNG ngày. */
    const duong = ngay.map((_, i) => {
      const ds = diem.filter((d) => d.ngay === i).sort((a, b) => (a.gio || 0) - (b.gio || 0));
      return ds.length > 1 ? '<polyline class="bd-duong n' + (i % 5) + '" points="' + ds.map((d) => d.x.toFixed(1) + ',' + d.y.toFixed(1)).join(' ') + '"/>' : '';
    }).join('');
    /* Cùng một địa điểm nhiều mốc → một chấm, nhiều số. */
    const gom = new Map();
    /* Đánh số theo thứ tự thời gian của cả chuyến. */
    const theoGio = diem.slice().sort((a, b) => a.ngay - b.ngay || (a.gio || 0) - (b.gio || 0));
    theoGio.forEach((d, i) => { const k = d.noi; if (!gom.has(k)) gom.set(k, { ...d, so: [], muc: [] }); gom.get(k).so.push(i + 1); gom.get(k).muc.push(d.ten); });
    /* Nhãn bên phải; điểm nằm sát mép phải (bờ Đông) thì đặt nhãn bên trái cho khỏi tràn. Hai nhãn quá gần nhau thì nhãn sau lùi xuống. */
    const daDat = [];
    const cham = [...gom.values()].map((d) => {
      const trai = d.x > W * 0.62;
      let ly = d.y + 4;
      while (daDat.some((p) => Math.abs(p.y - ly) < 11 && Math.abs(p.x - d.x) < 90)) ly += 11;
      daDat.push({ x: d.x, y: ly });
      return '<g class="bd-diem n' + (d.ngay % 5) + '"><title>' + e(d.noi + ': ' + d.muc.join('; ')) + '</title><circle cx="' + d.x.toFixed(1) + '" cy="' + d.y.toFixed(1) + '" r="' + (nho ? 7 : 9) + '"/>' +
        '<text class="bd-so" x="' + d.x.toFixed(1) + '" y="' + (d.y + (nho ? 3 : 3.5)).toFixed(1) + '">' + (d.so.length > 2 ? d.so[0] + '+' : d.so.join(',')) + '</text>' +
        (nho ? '' : '<text class="bd-ten" text-anchor="' + (trai ? 'end' : 'start') + '" x="' + (d.x + (trai ? -13 : 13)).toFixed(1) + '" y="' + ly.toFixed(1) + '">' + e(d.noi) + '</text>') + '</g>';
    }).join('');
    const nhanVung = nho ? '' : [['DƯƠNG ĐÔNG', 103.93, 10.235], ['AN THỚI', 103.975, 10.04], ['GÀNH DẦU', 103.86, 10.395], ['HÒN THƠM', 104.05, 9.965]]
      .map(([t, a, b]) => '<text class="bd-vung" x="' + px(a).toFixed(1) + '" y="' + py(b).toFixed(1) + '">' + t + '</text>').join('');
    const svg = '<svg class="ban-do' + (nho ? ' nho' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sơ đồ lịch trình Phú Quốc">' +
      '<path class="bd-dao" d="' + dao + '"/>' + daoNho + nhanVung + duong + cham + '</svg>';
    return { svg, chuaRo, coDiem: diem.length, soNgay: ngay.length };
  }

  goc.BanDo = { ve, doan, DIEM };
})(window);
