'use strict';
/* MÀN TIẾN ĐỘ — "hôm nay đang đạt bao nhiêu %, có kịp nhịp không".
 *
 * Tách riêng khỏi app.js vì đây là màn duy nhất đọc số TRỰC TIẾP từ các app con
 * (không dùng số đã chốt), và nó có nhịp làm mới riêng.
 *
 * Mọi con số ở đây là PHẦN TRĂM, và luôn đặt cạnh **nhịp chuẩn**: đi hết 71% số
 * ngày trong tháng thì đáng lẽ phải đạt 71% mục tiêu. Không có nhịp chuẩn thì
 * "62%" giữa tháng là tốt hay xấu không ai biết.
 *
 * Nạp TRƯỚC app.js; dùng chung các hàm tiện ích khai ở đó ($ , el, esc, goi,
 * ptLon, thanhPt) — hai tệp cùng phạm vi toàn cục.
 */
var TD = null;   // eslint-disable-line no-var

async function veTienDo() {
  if (!TD || TD._thang !== THANG) {
    $('#noiDung').innerHTML = '<div class="rong">đang đọc số mới từ các app…</div>';
    try { TD = await goi('tien-do?thang=' + encodeURIComponent(THANG)); TD._thang = THANG; }
    catch (e) { $('#noiDung').innerHTML = '<div class="rong">' + esc(e.message) + '</div>'; return; }
  }
  const g = el('div');
  const cuoi = TD.moc[TD.moc.length - 1] || { nguoi: [], nhom: [] };

  g.appendChild(el('div', 'canhbao tin',
    '<div><b>Số đọc thẳng từ các app, không phải số đã chốt.</b> '
    + 'Tính đến hết ngày ' + Number(TD.denHomNay.slice(8)) + '/' + Number(TD.thang.slice(5))
    + ' — đã đi ' + Math.round(TD.nhipChuan * 100) + '% thời gian của tháng. '
    + 'Phần view là <b>số thô</b>: chưa áp luật bù view và hệ số Bán hàng/Tương tác, '
    + 'nên cao hơn số dùng để chốt lương.</div>'));

  /* --- ô tổng --- */
  const co = cuoi.nguoi.filter((n) => n.phanTram != null);
  const tbPt = co.length ? co.reduce((s, n) => s + n.phanTram, 0) / co.length : null;
  const kip = co.filter((n) => n.phanTram >= TD.nhipChuan).length;
  const t0 = el('div', 'the');
  t0.appendChild(el('header', '', '<h3>Tính đến hôm nay</h3>'
    + '<span class="phu">đọc lại mỗi lần mở tab · ' + new Date(TD.capNhat).toLocaleTimeString('vi-VN') + '</span>'));
  const luoi = el('div', 'o-luoi');
  const oo = (nhan, so, ghi, lop) => luoi.appendChild(el('div', 'o' + (lop ? ' ' + lop : ''),
    '<div class="nhan">' + nhan + '</div><div class="so">' + so + '</div>'
    + (ghi ? '<div class="ghi">' + ghi + '</div>' : '')));
  oo('Nhịp chuẩn', Math.round(TD.nhipChuan * 100) + '%', TD.ngayDaQua + '/' + TD.soNgay + ' ngày');
  oo('Trung bình phòng', tbPt == null ? '—' : Math.round(tbPt * 100) + '%',
    'trên phần đo được', tbPt == null ? 'im' : (tbPt >= TD.nhipChuan ? 'tot' : 'xau'));
  oo('Kịp nhịp', kip + '/' + co.length, 'người đạt ≥ nhịp chuẩn',
    co.length && kip === co.length ? 'tot' : '');
  oo('Chưa đo được', (cuoi.nguoi.length - co.length) + ' người', 'thiếu nguồn số liệu',
    cuoi.nguoi.length - co.length ? 'xau' : 'im');
  t0.appendChild(luoi);
  g.appendChild(t0);

  /* --- theo người --- */
  const t1 = el('div', 'the');
  t1.appendChild(el('header', '', '<h3>% kết quả công việc theo người</h3>'
    + '<span class="phu">vạch đen trên thanh là nhịp chuẩn</span>'));
  const b1 = el('table');
  b1.innerHTML = '<thead><tr><th>Người</th><th class="so">% đạt</th><th>So với nhịp</th>'
    + '<th class="so">Chênh nhịp</th><th class="so">Đo được</th></tr></thead>';
  const tb1 = el('tbody');
  cuoi.nguoi.forEach((n) => {
    const d = n.phanTram == null ? null : n.phanTram - TD.nhipChuan;
    tb1.appendChild(el('tr', '', '<td><b>' + esc(n.ten) + '</b></td>'
      + '<td class="so">' + ptLon(n.phanTram) + '</td>'
      + '<td style="min-width:150px">' + (thanhPt(n.phanTram, TD.nhipChuan) || '<span class="nhat nho">—</span>') + '</td>'
      + '<td class="so">' + (d == null ? '—'
        : '<span class="lech ' + (d >= 0 ? 'len' : 'xuong') + '">'
          + (d >= 0 ? '▲ +' : '▼ ') + Math.round(Math.abs(d) * 100) + '%</span>') + '</td>'
      + '<td class="so nhat">' + Math.round(n.doPhu * 100) + '%</td>'));
  });
  b1.appendChild(tb1);
  t1.appendChild(el('div', 'bang-cuon')).appendChild(b1);
  t1.appendChild(el('div', 'than nho nhat',
    'Cột “Đo được” là phần trăm trọng số thực sự lấy được số. Dưới 100% nghĩa là còn nguồn '
    + 'chưa nối (Ads · OTA · Thiết kế · SEO · KOL). % đạt chỉ tính trên phần đo được, '
    + 'không suy ra cho phần còn thiếu — nên “chưa đo được” khác hẳn “đạt 0%”.'));
  g.appendChild(t1);

  /* --- mốc tuần --- */
  const t2 = el('div', 'the');
  t2.appendChild(el('header', '', '<h3>Mốc theo tuần</h3>'
    + '<span class="phu">luỹ kế từ đầu tháng đến hết mốc</span>'));
  const b2 = el('table');
  b2.innerHTML = '<thead><tr><th>Người</th>'
    + TD.moc.map((m) => '<th class="so">hết ngày ' + m.ngay + '</th>').join('') + '</tr></thead>';
  const tb2 = el('tbody');
  tb2.appendChild(el('tr', '', '<td class="nhat">Nhịp chuẩn</td>'
    + TD.moc.map((m) => '<td class="so nhat">' + Math.round(m.nhipChuan * 100) + '%</td>').join('')));
  cuoi.nguoi.forEach((n) => {
    let h = '<td><b>' + esc(n.ten) + '</b></td>';
    TD.moc.forEach((m) => {
      const x = m.nguoi.find((y) => y.ma === n.ma);
      const v = x ? x.phanTram : null;
      h += '<td class="so">' + (v == null ? '<span class="nhat">—</span>'
        : '<span class="pt ' + (v >= m.nhipChuan ? 'tot' : 'xau') + '" style="font-size:13px">'
          + Math.round(v * 100) + '%</span>') + '</td>';
    });
    tb2.appendChild(el('tr', '', h));
  });
  b2.appendChild(tb2);
  t2.appendChild(el('div', 'bang-cuon')).appendChild(b2);
  g.appendChild(t2);

  /* --- theo kênh --- */
  const t3 = el('div', 'the');
  t3.appendChild(el('header', '', '<h3>% đạt mục tiêu theo kênh</h3>'
    + '<span class="phu">xếp từ đạt cao xuống thấp</span>'));
  const b3 = el('table');
  b3.innerHTML = '<thead><tr><th>Kênh</th><th class="so">% đạt</th><th>So với nhịp</th></tr></thead>';
  const tb3 = el('tbody');
  cuoi.nhom.slice().sort((a, b) => (b.phanTram == null ? -1 : b.phanTram) - (a.phanTram == null ? -1 : a.phanTram))
    .forEach((n) => {
      tb3.appendChild(el('tr', '', '<td class="dai">' + esc(n.ten) + '</td>'
        + '<td class="so">' + ptLon(n.phanTram) + '</td>'
        + '<td style="min-width:150px">' + (thanhPt(n.phanTram, TD.nhipChuan) || '<span class="nhat nho">—</span>') + '</td>'));
    });
  b3.appendChild(tb3);
  t3.appendChild(el('div', 'bang-cuon')).appendChild(b3);
  g.appendChild(t3);

  $('#noiDung').innerHTML = '';
  $('#noiDung').appendChild(g);
}
