'use strict';
/* MÀN BÁO CÁO — nửa thứ nhất của app.
 *
 * Gom số liệu của MỌI base trong một khoảng thời gian, để mở ra là thấy toàn
 * cảnh phòng, rồi xuất một tệp gửi Sếp.
 *
 * Khác hẳn nửa KPI: ở đây đơn vị là KHOẢNG THỜI GIAN tuỳ ý (tuần, tháng, quý),
 * không phải tháng lương. Nên thanh lọc riêng, giống hệt app Social để ai quen
 * app kia là dùng được ngay.
 *
 * Nạp trước app.js; dùng chung tiện ích khai ở đó.
 */
/* Biểu tượng làm mới, cùng nét với bộ icon của Hub (stroke 1.7, bo tròn đầu). */
const ICON_MOI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="16" height="16">'
  + '<path d="M20 11.5a8 8 0 1 1-2.6-5.4"/><path d="M20 4v5h-5"/></svg>';

var BC = null;        // eslint-disable-line no-var
var BC_KY = null;     // eslint-disable-line no-var — { tu, den, nhan }

/* ---- các mốc thời gian dựng sẵn, cùng bộ với app Social ---- */
function bcMoc() {
  const d = new Date();
  const iso = (x) => x.toISOString().slice(0, 10);
  const dauThang = (y, m) => new Date(Date.UTC(y, m, 1));
  const cuoiThang = (y, m) => new Date(Date.UTC(y, m + 1, 0));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  /* Tuần bắt đầu THỨ HAI — lịch làm việc của phòng, không phải Chủ nhật kiểu Mỹ. */
  const thu2 = new Date(Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  const thu2Truoc = new Date(thu2.getTime() - 7 * 86400000);
  return [
    { ma: 'thang-nay', nhan: 'Tháng này', tu: iso(dauThang(y, m)), den: iso(cuoiThang(y, m)) },
    { ma: 'thang-truoc', nhan: 'Tháng trước', tu: iso(dauThang(y, m - 1)), den: iso(cuoiThang(y, m - 1)) },
    { ma: 'tuan-nay', nhan: 'Tuần này', tu: iso(thu2), den: iso(new Date(thu2.getTime() + 6 * 86400000)) },
    { ma: 'tuan-truoc', nhan: 'Tuần trước', tu: iso(thu2Truoc), den: iso(new Date(thu2Truoc.getTime() + 6 * 86400000)) },
    { ma: 'quy-nay', nhan: 'Quý này', tu: iso(dauThang(y, Math.floor(m / 3) * 3)), den: iso(cuoiThang(y, Math.floor(m / 3) * 3 + 2)) },
    { ma: 'nam-nay', nhan: 'Năm nay', tu: y + '-01-01', den: y + '-12-31' },
  ];
}

function bcSo(v, kieu) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (kieu === 'vnd') {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' tỷ';
    if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' tr';
    return Math.round(v).toLocaleString('vi-VN') + ' ₫';
  }
  if (kieu === 'pt') return (Math.round(v * 10) / 10).toString().replace('.', ',') + '%';
  if (kieu === 'x') return (Math.round(v * 100) / 100).toString().replace('.', ',') + 'x';
  return gon(v);
}

async function veBaoCao() {
  if (!BC_KY) { const m = bcMoc(); BC_KY = { tu: m[0].tu, den: m[0].den, ma: m[0].ma }; }
  const g = el('div');
  g.appendChild(bcThanhLoc());

  const hop = el('div');
  g.appendChild(hop);
  $('#noiDung').innerHTML = '';
  $('#noiDung').appendChild(g);

  hop.innerHTML = '<div class="rong">đang đọc số từ 5 base…</div>';
  try {
    BC = await goi('bao-cao?tu=' + BC_KY.tu + '&den=' + BC_KY.den);
  } catch (e) { hop.innerHTML = '<div class="rong">' + esc(e.message) + '</div>'; return; }

  hop.innerHTML = '';
  const ngay = (s) => s.split('-').reverse().join('/');
  hop.appendChild(el('div', 'canhbao tin',
    '<div>Kỳ <b>' + ngay(BC.tu) + ' – ' + ngay(BC.den) + '</b> (' + BC.soNgay + ' ngày) · '
    + 'so với kỳ trước ' + ngay(BC.kyTruoc.tu) + ' – ' + ngay(BC.kyTruoc.den) + ' · '
    + '<b>' + BC.soChay + '/' + BC.soApp + '</b> base đọc được. '
    + 'Số đọc trực tiếp từ các base tại thời điểm mở.</div>'));

  BC.base.forEach((b) => hop.appendChild(bcKhoi(b)));
}

function bcThanhLoc() {
  const t = el('div', 'the');
  const than = el('div', 'than loc-hang');
  const moc = bcMoc();

  const g1 = el('div', 'loc-nhom');
  g1.innerHTML = '<label>Khoảng thời gian</label>';
  const seg = el('div', 'seg');
  moc.forEach((m) => {
    const b = el('button', 'seg-nut' + (BC_KY.ma === m.ma ? ' chon' : ''), m.nhan);
    b.onclick = () => { BC_KY = { tu: m.tu, den: m.den, ma: m.ma }; veBaoCao(); };
    seg.appendChild(b);
  });
  g1.appendChild(seg);

  const g2 = el('div', 'loc-nhom');
  g2.innerHTML = '<label>Từ ngày</label>';
  const i1 = el('input'); i1.type = 'date'; i1.value = BC_KY.tu;
  g2.appendChild(i1);
  const g3 = el('div', 'loc-nhom');
  g3.innerHTML = '<label>Đến ngày</label>';
  const i2 = el('input'); i2.type = 'date'; i2.value = BC_KY.den;
  g3.appendChild(i2);
  /* Đổi ngày tay thì bỏ chọn mốc dựng sẵn — nếu vẫn tô sáng "Tháng này" trong
   * khi ngày đã khác thì thanh lọc nói dối về cái đang xem. */
  const doiTay = () => {
    if (!i1.value || !i2.value || i1.value > i2.value) return;
    BC_KY = { tu: i1.value, den: i2.value, ma: '' };
    veBaoCao();
  };
  i1.onchange = doiTay; i2.onchange = doiTay;

  const g4 = el('div', 'loc-nhom grow');
  g4.innerHTML = '<label>&nbsp;</label>';
  const hang = el('div', 'nut-hang');
  const nutXuat = el('button', 'btn chinh', 'Xuất báo cáo');
  nutXuat.title = 'Mở tệp báo cáo hoàn chỉnh — trong đó có nút Lưu PDF, tải HTML, tải CSV';
  nutXuat.onclick = () => window.open('api/xuat-bao-cao?tu=' + BC_KY.tu + '&den=' + BC_KY.den, '_blank');
  /* Lối tắt cho ai chỉ cần số để bê sang bảng tính, khỏi mở tệp báo cáo ra rồi
   * mới bấm nút CSV trong đó. */
  const nutCsv = el('button', 'btn', 'CSV');
  nutCsv.title = 'Tải thẳng bảng số cho Excel';
  nutCsv.onclick = () => taiVe('xuat-bao-cao-csv?tu=' + BC_KY.tu + '&den=' + BC_KY.den);
  /* Nút đọc lại là BIỂU TƯỢNG, không phải chữ — giống mọi app khác trong Hub.
   * Chữ "Đọc lại" đứng cạnh "Xuất báo cáo" trông như hai hành động ngang hàng,
   * trong khi một cái là việc chính còn một cái chỉ là làm tươi màn hình. */
  const nutMoi = el('button', 'btn bt', ICON_MOI);
  nutMoi.title = 'Đọc lại số mới nhất từ Base';
  nutMoi.setAttribute('aria-label', 'Làm mới');
  nutMoi.onclick = () => { nutMoi.classList.add('quay'); veBaoCao(); };
  hang.appendChild(nutXuat); hang.appendChild(nutCsv); hang.appendChild(nutMoi);
  g4.appendChild(hang);

  than.appendChild(g1); than.appendChild(g2); than.appendChild(g3); than.appendChild(g4);
  t.appendChild(than);
  return t;
}

/* Rút gọn tên nền tảng cho vừa một dòng dưới ô số. */
const BC_TAT = { Facebook: 'FB', Instagram: 'IG', TikTok: 'TikTok', 'Zalo OA': 'Zalo', YouTube: 'YT' };
const bcTat = (x) => BC_TAT[x] || x;

/**
 * Dòng "ai đóng góp vào con số này" đặt ngay dưới mỗi ô.
 *
 * Đây là chỗ chữa lỗi đọc nguy hiểm nhất của trang tổng quan: "Lượt tiếp cận
 * 15k" trông như số toàn phòng, sự thật chỉ Instagram trả về. Giờ ô đó ghi rõ
 * "IG 15k" và "FB · TikTok chưa gửi số này".
 */
function bcNen(nen) {
  if (!nen || !nen.tong) return '';
  if (!nen.co.length) {
    return '<div class="o-nen trong">chưa nền tảng nào gửi số này</div>';
  }
  const co = nen.co.slice(0, 4).map((x) =>
    '<span class="o-nen-i"><b>' + esc(bcTat(x.ten)) + '</b> ' + gon(x.so) + '</span>').join('');
  const thieu = nen.khong.length
    ? '<span class="o-nen-thieu">' + nen.khong.map(bcTat).map(esc).join(' · ') + ' chưa có</span>'
    : '';
  return '<div class="o-nen">' + co + thieu + '</div>';
}

function bcKhoi(b) {
  const t = el('div', 'the');
  t.appendChild(el('header', '',
    '<span class="cham-tron" style="background:' + esc(b.mau) + '"></span>'
    + '<h3>' + esc(b.ten) + '</h3>'
    + '<span class="phu">' + (b.chay ? esc(b.mo) : '<span class="nhan-o chan">không đọc được</span>') + '</span>'));

  if (!b.chay) {
    t.appendChild(el('div', 'than', '<div class="canhbao chan"><div>'
      + '<b>Không đọc được số liệu</b> — ' + esc(b.loi) + '. '
      + 'Ô của base này để trống chứ không hiện 0, vì 0 và “không đọc được” là hai chuyện khác nhau.'
      + '</div></div>'));
    return t;
  }

  /* Lời cảnh báo của chính app nguồn về giới hạn số liệu của nó — ví dụ Meta đã
   * gỡ mọi chỉ số đếm người duy nhất nên Facebook không có lượt tiếp cận. Đây là
   * nguồn đáng tin nhất về "vì sao ô này trống", nên chép nguyên chứ không tự
   * đoán lại ở tầng này. */
  if ((b.luuY || []).length) {
    t.appendChild(el('div', 'than', '<div class="canhbao tin"><div>'
      + '<b>Giới hạn số liệu của ' + esc(b.ten) + '</b><ul class="luu-y">'
      + b.luuY.map((x) => '<li>' + esc(x) + '</li>').join('')
      + '</ul></div></div>'));
  }

  const luoi = el('div', 'o-luoi');
  (b.o || []).forEach((o) => {
    const l = o.lech;
    /* CPA thấp là tốt nên đảo chiều màu — không đảo thì "CPA giảm 20%" bị tô đỏ
     * như tin xấu. */
    const tot = l == null ? null : (o.dao ? l < 0 : l > 0);
    const dLech = (l != null && Number.isFinite(l))
      ? '<div class="ghi ' + (tot ? 'tot' : 'xau') + '">'
        + (l > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(l * 10) / 10).toString().replace('.', ',')
        + '% so kỳ trước</div>'
      : '';
    /* Ghi chú và mức lệch giờ hiện CÙNG LÚC. Bản trước chỉ hiện một trong hai,
     * nên ô nào có lệch là mất luôn lời giải thích của nó. */
    const dGhi = o.ghi ? '<div class="ghi">' + esc(o.ghi) + '</div>' : '';
    luoi.appendChild(el('div', 'o' + (o.muc === 'cao' ? ' xau' : '') + (o.chinh ? ' chinh' : ''),
      '<div class="nhan">' + esc(o.nhan) + '</div>'
      + '<div class="so">' + bcSo(o.so, o.dinhDang) + '</div>'
      + dLech + dGhi + bcNen(o.nen)));
  });
  t.appendChild(luoi);

  /* --- biểu đồ: đường theo ngày + vành khuyên cơ cấu, xếp cạnh nhau --- */
  if ((b.chuoi && b.chuoi.diem.length) || (b.tron && b.tron.phan.length)) {
    const khung = el('div', 'bieu-do bieu-do-doi');
    const oDuong = el('div');
    const oTron = el('div');
    khung.appendChild(oDuong); khung.appendChild(oTron);
    t.appendChild(khung);

    if (b.chuoi && b.chuoi.diem.length && window.Charts) {
      /* charts.js nhận mảng bản ghi + danh sách khoá; `x` của mình chính là
       * `date` mà nó mong đợi. */
      Charts.lines(oDuong, b.chuoi.diem.map((p) => Object.assign({ date: p.x }, p)),
        b.chuoi.duong.map((l) => ({ key: l.key, color: l.mau, label: l.label })),
        { height: 210 });
      const ct = el('div', 'chu-thich', b.chuoi.duong
        .map((l) => '<span><i style="background:' + esc(l.mau) + '"></i>' + esc(l.label) + '</span>').join(''));
      oDuong.appendChild(ct);
    }
    if (b.tron && b.tron.phan.length && window.Charts) {
      Charts.donut(oTron, b.tron.phan.map((x) => ({ label: x.nhan, value: x.so })),
        { centerLabel: b.tron.giua, size: 180 });
    }
  }

  /* --- các bảng chi tiết --- */
  (b.bang || []).forEach((bg) => {
    const soCot = new Set(bg.soCot || []);
    const tb = el('table');
    tb.innerHTML = '<thead><tr>' + bg.cot.map((c, i) =>
      '<th' + (soCot.has(i) ? ' class="so"' : '') + '>' + esc(c) + '</th>').join('')
      + '</tr></thead><tbody>' + bg.dong.map((r) => '<tr>' + r.map((c, i) =>
        '<td' + (soCot.has(i) ? ' class="so"' : ' class="dai"') + '>'
        + (typeof c === 'number' ? gon(c) : esc(c)) + '</td>').join('') + '</tr>').join('')
      + '</tbody>';
    const kh = el('div', 'bang-cuon');
    kh.appendChild(tb);
    t.appendChild(el('div', 'than nho nhat', bg.tieuDe + ' · ' + bg.dong.length + ' dòng'));
    t.appendChild(kh);
  });
  return t;
}
