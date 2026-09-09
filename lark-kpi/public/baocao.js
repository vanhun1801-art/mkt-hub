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
  const hang = el('div', '');
  const nutXuat = el('button', 'btn chinh', 'Xuất báo cáo gửi Sếp');
  nutXuat.onclick = () => window.open('api/xuat-bao-cao?tu=' + BC_KY.tu + '&den=' + BC_KY.den, '_blank');
  const nutMoi = el('button', 'btn');
  nutMoi.textContent = 'Đọc lại';
  nutMoi.style.marginLeft = '8px';
  nutMoi.onclick = () => veBaoCao();
  hang.appendChild(nutXuat); hang.appendChild(nutMoi);
  g4.appendChild(hang);

  than.appendChild(g1); than.appendChild(g2); than.appendChild(g3); than.appendChild(g4);
  t.appendChild(than);
  return t;
}

function bcKhoi(b) {
  const t = el('div', 'the');
  t.appendChild(el('header', '',
    '<span class="cham" style="background:' + esc(b.mau) + '"></span>'
    + '<h3>' + esc(b.ten) + '</h3>'
    + '<span class="phu">' + (b.chay ? esc(b.mo) : '<span class="nhan-o chan">không đọc được</span>') + '</span>'));

  if (!b.chay) {
    t.appendChild(el('div', 'than', '<div class="canhbao chan"><div>'
      + '<b>Không đọc được số liệu</b> — ' + esc(b.loi) + '. '
      + 'Ô của base này để trống chứ không hiện 0, vì 0 và “không đọc được” là hai chuyện khác nhau.'
      + '</div></div>'));
    return t;
  }

  const luoi = el('div', 'o-luoi');
  (b.o || []).forEach((o) => {
    const l = o.lech;
    /* CPA thấp là tốt nên đảo chiều màu — không đảo thì "CPA giảm 20%" bị tô đỏ
     * như tin xấu. */
    const tot = l == null ? null : (o.dao ? l < 0 : l > 0);
    const duoi = (l != null && Number.isFinite(l))
      ? '<div class="ghi ' + (tot ? 'tot' : 'xau') + '">'
        + (l > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(l * 10) / 10).toString().replace('.', ',')
        + '% so kỳ trước</div>'
      : (o.ghi ? '<div class="ghi">' + esc(o.ghi) + '</div>' : '');
    luoi.appendChild(el('div', 'o' + (o.muc === 'cao' ? ' xau' : ''),
      '<div class="nhan">' + esc(o.nhan) + '</div>'
      + '<div class="so">' + bcSo(o.so, o.dinhDang) + '</div>' + duoi));
  });
  t.appendChild(luoi);

  if (b.bang) {
    const soCot = new Set(b.bang.soCot || []);
    const tb = el('table');
    tb.innerHTML = '<thead><tr>' + b.bang.cot.map((c, i) =>
      '<th' + (soCot.has(i) ? ' class="so"' : '') + '>' + esc(c) + '</th>').join('')
      + '</tr></thead><tbody>' + b.bang.dong.map((r) => '<tr>' + r.map((c, i) =>
        '<td' + (soCot.has(i) ? ' class="so"' : ' class="dai"') + '>'
        + (typeof c === 'number' ? gon(c) : esc(c)) + '</td>').join('') + '</tr>').join('')
      + '</tbody>';
    const kh = el('div', 'bang-cuon');
    kh.appendChild(tb);
    t.appendChild(el('div', 'than nho nhat', b.bang.tieuDe));
    t.appendChild(kh);
  }
  return t;
}
