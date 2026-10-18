'use strict';
/**
 * TAB KPI — một trang, xếp theo thứ tự anh Hùng chốt ngày 18/10/2026.
 *
 * Câu chốt lại cả màn này: *"Kết quả KPI thật ra bản chất anh muốn nhìn thấy
 * cái chỉ số được đạt thế nào, hiệu quả đó mới là hiệu quả cho doanh nghiệp,
 * còn KPI các thành viên chỉ phụ thôi."*
 *
 * Nên thứ tự là CHỈ SỐ → KÊNH → NGƯỜI, chứ không phải ngược lại. Bản trước mở
 * ra là bảy cái tên, còn lượt xem và lead của cả phòng nằm mãi bên dưới — đọc
 * lên thành một bảng chấm công, không phải một bảng kết quả kinh doanh.
 *
 * MỐC TUẦN TÍNH BẰNG SỐ THẬT, không chỉ bằng phần trăm. Anh Hùng: *"mục tiêu
 * tháng là 1tr lượt xem thì tuần 1 mốc chuẩn là 250 nghìn lượt xem chẳng hạn"*.
 * Phần trăm nói được "có kịp không" nhưng không nói được "còn thiếu bao nhiêu",
 * mà cái thiếu mới là cái đem đi giao việc được.
 *
 * Nạp SAU app.js và tiendo.js; dùng chung hàm tiện ích của hai tệp đó.
 */

/* Chỉ số nào là "cộng lại được" — lượt xem của bốn kênh cộng thành lượt xem của
 * phòng. Tỷ lệ thì không: trung bình của bốn tỷ lệ không phải tỷ lệ chung. Hiện
 * bộ luật chỉ có chỉ số cộng được, nhưng khai ra đây để mai kia thêm chỉ số
 * dạng tỷ lệ thì còn chỗ chặn. */
const KHONG_CONG = /^(tỷ lệ|ty le|cpa|cpc|roas)/i;

/** Gộp mọi kênh lại theo TÊN chỉ số, cho một mốc thời gian. */
function gomChiSo(nhom) {
  const m = new Map();
  (nhom || []).forEach((n) => {
    (n.tieuChi || []).forEach((tc) => {
      if (KHONG_CONG.test(tc.ten || '')) return;
      const o = m.get(tc.ten) || { ten: tc.ten, ketQua: 0, mucTieu: 0, soKenh: 0, soDo: 0, kenh: [] };
      o.soKenh += 1;
      /* Kênh chưa đo được thì BỎ KHỎI CẢ TỬ LẪN MẪU. Cộng mục tiêu của nó vào
       * mẫu mà không cộng kết quả là tự dìm con số chung xuống, rồi đọc thành
       * "phòng đang hụt" trong khi thật ra là chưa đo. */
      if (!tc.boQua) {
        o.soDo += 1;
        o.ketQua += Number(tc.ketQua) || 0;
        o.mucTieu += Number(tc.mucTieu) || 0;
      }
      o.kenh.push({ ten: n.ten, khoa: n.khoa, ketQua: tc.ketQua, mucTieu: tc.mucTieu, boQua: tc.boQua });
      m.set(tc.ten, o);
    });
  });
  return [...m.values()];
}

/** Thẻ 1 — CHỈ SỐ CỦA PHÒNG. Đây là khối đứng đầu trang. */
function theChiSoPhong(cuoi) {
  const ds = gomChiSo(cuoi.nhom).sort((a, b) => b.mucTieu - a.mucTieu);
  const the = el('div', 'the');
  the.appendChild(el('header', '', '<h3>Chỉ số của phòng</h3>'
    + '<span class="phu">gộp mọi kênh · bấm một chỉ số để xem từng tuần và từng kênh</span>'));

  if (!ds.length) {
    the.appendChild(el('div', 'than nhat', 'Bộ luật tháng này chưa khai chỉ số nào.'));
    return the;
  }

  const b = el('table');
  b.innerHTML = '<thead><tr><th>Chỉ số</th><th class="so">Đang có</th>'
    + '<th class="so">Mốc chuẩn hôm nay</th><th class="so">Mục tiêu tháng</th>'
    + '<th class="so">% đạt</th><th>So với nhịp</th><th class="so">Còn thiếu</th></tr></thead>';
  const tb = el('tbody');
  ds.forEach((x) => {
    const dat = x.mucTieu > 0 ? x.ketQua / x.mucTieu : null;
    const mocChuan = x.mucTieu * TD.nhipChuan;
    /* "Còn thiếu" tính tới MỐC HÔM NAY, không tới cuối tháng: giữa tháng mà báo
     * thiếu cả phần của những ngày chưa tới thì con số đó không sai nhưng vô
     * dụng — không ai giao được việc theo nó. */
    const thieu = Math.max(0, mocChuan - x.ketQua);
    /* KHÔNG KÊNH NÀO ĐO ĐƯỢC thì cả dòng là dấu gạch, không phải "đủ nhịp".
     * Bản đầu in 0/0/0 rồi gắn nhãn xanh "đủ nhịp" cho năm chỉ số chưa nối
     * nguồn — đọc lên thành đã xong, trong khi chưa đo được chữ nào. */
    const trong = x.soDo === 0;
    const tr = el('tr', 'bam');
    tr.innerHTML = '<td><b>' + esc(x.ten) + '</b>'
      + (x.soDo < x.soKenh
        ? '<span class="sub-line">' + x.soDo + '/' + x.soKenh + ' kênh đo được</span>' : '')
      + '</td>'
      + '<td class="so">' + (trong ? '<span class="nhan-o im">chưa đo được</span>' : '<b>' + gon(x.ketQua) + '</b>') + '</td>'
      + '<td class="so nhat">' + (trong ? '—' : gon(Math.round(mocChuan))) + '</td>'
      + '<td class="so nhat">' + (trong ? '—' : gon(x.mucTieu)) + '</td>'
      + '<td class="so">' + (trong ? '<span class="nhat">—</span>' : ptLon(dat)) + '</td>'
      + '<td style="min-width:150px">' + (trong ? '<span class="nhat nho">—</span>'
        : (thanhPt(dat, TD.nhipChuan) || '<span class="nhat nho">—</span>')) + '</td>'
      + '<td class="so">' + (trong ? '<span class="nhat">—</span>' : (thieu > 0
        ? '<span class="lech xuong">' + gon(Math.round(thieu)) + '</span>'
        : '<span class="nhan-o ok">đủ nhịp</span>')) + '</td>';
    tr.onclick = () => {
      const cu = tb.querySelector('tr.phu[data-cs="' + CSS.escape(x.ten) + '"]');
      if (cu) { cu.remove(); return; }
      tr.after(dongChiTietChiSo(x));
    };
    tb.appendChild(tr);
  });
  b.appendChild(tb);
  the.appendChild(el('div', 'bang-cuon')).appendChild(b);
  the.appendChild(el('div', 'than nho nhat',
    '“Mốc chuẩn hôm nay” là phần mục tiêu đáng lẽ phải xong tính tới hôm nay: '
    + 'mục tiêu tháng × ' + Math.round(TD.nhipChuan * 100) + '%. '
    + '“Còn thiếu” là khoảng cách tới mốc đó, không phải tới cuối tháng.'));
  return the;
}

/** Bung ra dưới một chỉ số: thang mốc tuần bằng SỐ THẬT, rồi tới từng kênh. */
function dongChiTietChiSo(x) {
  const tr = el('tr', 'phu');
  tr.dataset.cs = x.ten;
  const td = el('td');
  td.colSpan = 7;

  /* --- thang mốc tuần, tính bằng số --- */
  td.appendChild(el('div', 'than nho nhat', 'Từng mốc trong tháng — cần bao nhiêu, đang có bao nhiêu'));
  const bM = el('table');
  bM.innerHTML = '<thead><tr><th>Mốc</th><th class="so">Cần đạt</th><th class="so">Đang có</th>'
    + '<th class="so">Chênh</th><th class="so">% so mốc</th></tr></thead>';
  const tbM = el('tbody');
  TD.moc.forEach((m) => {
    const g = gomChiSo(m.nhom).find((y) => y.ten === x.ten);
    const can = x.mucTieu * m.nhipChuan;
    const co = g ? g.ketQua : null;
    const chenh = co == null ? null : co - can;
    tbM.appendChild(el('tr', '', '<td>hết ngày ' + m.ngay + '</td>'
      + '<td class="so nhat">' + gon(Math.round(can)) + '</td>'
      + '<td class="so"><b>' + (co == null ? '—' : gon(co)) + '</b></td>'
      + '<td class="so">' + (chenh == null ? '—'
        : '<span class="lech ' + (chenh >= 0 ? 'len' : 'xuong') + '">'
          + (chenh >= 0 ? '+' : '−') + gon(Math.abs(Math.round(chenh))) + '</span>') + '</td>'
      + '<td class="so">' + (co == null || !can ? '—' : ptLon(co / can)) + '</td>'));
  });
  bM.appendChild(tbM);
  td.appendChild(bM);

  /* --- kênh nào góp bao nhiêu --- */
  td.appendChild(el('div', 'than nho nhat', 'Kênh nào góp vào con số này'));
  const bK = el('table');
  bK.innerHTML = '<thead><tr><th>Kênh</th><th class="so">Đang có</th>'
    + '<th class="so">Mục tiêu</th><th class="so">% đạt</th><th class="so">Góp vào tổng</th></tr></thead>';
  const tbK = el('tbody');
  x.kenh.slice().sort((a, b) => (b.ketQua || 0) - (a.ketQua || 0)).forEach((k) => {
    const dat = !k.boQua && k.mucTieu > 0 ? k.ketQua / k.mucTieu : null;
    const gop = !k.boQua && x.ketQua > 0 ? k.ketQua / x.ketQua : null;
    tbK.appendChild(el('tr', '', '<td class="dai">' + esc(k.ten) + '</td>'
      + '<td class="so">' + (k.boQua ? '<span class="nhan-o im">chưa đo được</span>' : gon(k.ketQua)) + '</td>'
      + '<td class="so nhat">' + gon(k.mucTieu) + '</td>'
      + '<td class="so">' + ptLon(dat) + '</td>'
      + '<td class="so nhat">' + (gop == null ? '—' : Math.round(gop * 100) + '%') + '</td>'));
  });
  bK.appendChild(tbK);
  td.appendChild(bK);

  tr.appendChild(td);
  return tr;
}

/**
 * Thẻ 2 — KÊNH, một bảng duy nhất.
 *
 * Anh Hùng: *"kênh thì nên gộp cái % mục tiêu và theo tuần thành 1 ô thể hiện
 * duy nhất thay vì tách như hiện tại"*. Trước là hai bảng rời, cùng danh sách
 * kênh, xếp khác thứ tự nhau — phải tự dò mắt giữa hai bảng mới ghép được.
 */
function theKenh(cuoi) {
  const the = el('div', 'the');
  the.appendChild(el('header', '', '<h3>Kênh</h3>'
    + '<span class="phu">luỹ kế từng mốc · bấm một kênh để xem từng chỉ số</span>'));

  const b = el('table');
  b.innerHTML = '<thead><tr><th>Kênh</th>'
    + TD.moc.map((m) => '<th class="so">ngày ' + m.ngay + '</th>').join('')
    + '<th class="so">% đạt</th><th>So với nhịp</th><th class="so">Xu hướng</th>'
    + '<th class="so">Chỉ số</th></tr></thead>';
  const tb = el('tbody');

  /* Nhịp chuẩn đứng đầu bảng làm thước, thay vì nhắc lại ở mỗi dòng. */
  tb.appendChild(el('tr', 'nhip', '<td class="nhat">Nhịp chuẩn</td>'
    + TD.moc.map((m) => '<td class="so nhat">' + Math.round(m.nhipChuan * 100) + '%</td>').join('')
    + '<td class="so nhat">100%</td><td></td><td></td><td></td>'));

  xepKenh(cuoi.nhom).forEach((n) => {
    const day = TD.moc.map((m) => {
      const k = (m.nhom || []).find((y) => y.khoa === n.khoa);
      return k ? k.phanTram : null;
    });
    const tc = n.tieuChi || [];
    const doDuoc = tc.filter((y) => !y.boQua).length;
    const d = n.phanTram == null ? null : n.phanTram - TD.nhipChuan;
    const tr = el('tr', 'bam');
    tr.innerHTML = '<td class="dai">' + esc(n.ten) + '</td>'
      + day.map((v) => '<td class="so">' + (v == null
        ? '<span class="mo">—</span>'
        : '<span class="' + mucPt(v) + '">' + Math.round(v * 100) + '%</span>') + '</td>').join('')
      + '<td class="so">' + ptLon(n.phanTram) + '</td>'
      + '<td style="min-width:140px">' + (thanhPt(n.phanTram, TD.nhipChuan) || '<span class="nhat nho">—</span>') + '</td>'
      + '<td class="so">' + xuHuong(day) + '</td>'
      + '<td class="so nhat">' + doDuoc + '/' + tc.length
      + (d == null ? '' : ' <span class="mo nho">›</span>') + '</td>';
    tr.onclick = () => {
      const cu = tb.querySelector('tr.phu[data-k="' + CSS.escape(n.khoa) + '"]');
      if (cu) { cu.remove(); return; }
      tr.after(dongChiTietKenh(n));
    };
    tb.appendChild(tr);
  });
  b.appendChild(tb);
  the.appendChild(el('div', 'bang-cuon')).appendChild(b);
  return the;
}

/**
 * Thẻ 3 — NGƯỜI. Gộp "% kết quả công việc" với "Điểm tính lương".
 *
 * Anh Hùng: *"bảng điểm tính lương nên gom chung với lại % đạt mục tiêu bên
 * trên, có nút xuất vì tính chất nó như nhau"*. Đúng vậy: hai bảng cùng bảy
 * dòng, cùng một tháng, chỉ khác đơn vị — một bên phần trăm tiến độ, một bên
 * điểm trả lương. Tách ra chỉ khiến người đọc phải tự nối hai con số.
 */
function theNguoi(cuoi) {
  const the = el('div', 'the');
  const hd = el('header', '', '<h3>Theo người</h3>'
    + '<span class="phu">' + (DATA.chot
      ? '<span class="nhan-o ok">đã chốt ' + new Date(DATA.chot.luc).toLocaleDateString('vi-VN') + '</span>'
      : (DATA.chotDuoc ? 'đủ điều kiện chốt' : DATA.soChan + ' mục chặn, chưa chốt được')) + '</span>');

  const hang = el('div', 'nut-hang');
  const q = DATA.chiMinh
    ? 'kieu=nguoi&ma=' + encodeURIComponent(DATA.nguoi[0] ? DATA.nguoi[0].ma : '') + '&thang=' + THANG
    : 'kieu=phong&thang=' + THANG;
  const nXuat = el('button', 'btn chinh small', DATA.chiMinh ? 'Xuất phiếu của tôi' : 'Xuất văn bản KPI phòng');
  nXuat.title = 'Văn bản có logo và chỗ ký · bấm Ctrl+P để lưu PDF';
  nXuat.onclick = () => window.open('api/xuat-kpi?' + q, '_blank');
  const nCsv = el('button', 'btn small', 'CSV');
  nCsv.onclick = () => taiVe('xuat?' + q);
  hang.appendChild(nXuat); hang.appendChild(nCsv);
  if (!DATA.chiMinh) hang.appendChild(nutChot());
  hd.appendChild(hang);
  the.appendChild(hd);

  const diem = new Map(DATA.nguoi.map((x) => [x.ma, x]));
  const b = el('table');
  b.innerHTML = '<thead><tr><th>Người</th><th class="so">% tiến độ</th><th>So với nhịp</th>'
    + '<th class="so">Chênh nhịp</th><th class="so">Điểm tính lương</th>'
    + '<th>Tình trạng</th><th class="so">Đo được</th></tr></thead>';
  const tb = el('tbody');
  const banNhom = new Map((cuoi.nhom || []).map((x) => [x.khoa, x]));
  cuoi.nguoi.forEach((n) => {
    const d = n.phanTram == null ? null : n.phanTram - TD.nhipChuan;
    const ng = diem.get(n.ma);
    const thieu = ng ? ng.tieuChi.filter((x) => x.chuaCo).length : 0;
    const tr = el('tr', 'bam');
    tr.innerHTML = '<td><b>' + esc(n.ten) + '</b>'
      + (ng && ng.viTri ? '<span class="sub-line">' + esc(ng.viTri) + '</span>' : '') + '</td>'
      + '<td class="so">' + ptLon(n.phanTram) + '</td>'
      + '<td style="min-width:140px">' + (thanhPt(n.phanTram, TD.nhipChuan) || '<span class="nhat nho">—</span>') + '</td>'
      + '<td class="so">' + (d == null ? '—'
        : '<span class="lech ' + (d >= 0 ? 'len' : 'xuong') + '">'
          + (d >= 0 ? '▲ +' : '▼ ') + Math.round(Math.abs(d) * 100) + '%</span>') + '</td>'
      + '<td class="so">' + (ng
        ? '<span class="diem">' + n3(ng.tong) + '</span><span class="pt-phu"> / ' + n3(ng.tongTrongSo) + '</span>'
        : '—') + '</td>'
      + '<td>' + (ng && ng.dayDu
        ? '<span class="nhan-o ok">đủ dữ liệu</span>'
        : '<span class="nhan-o chan">thiếu ' + thieu + ' mục</span>') + '</td>'
      + '<td class="so nhat">' + Math.round(n.doPhu * 100) + '%'
      + ' <span class="mo nho">›</span></td>';
    tr.onclick = () => {
      const cu = tb.querySelector('tr.phu[data-ng="' + CSS.escape(n.ma) + '"]');
      if (cu) { cu.remove(); return; }
      tr.after(dongChiTietNguoi(n, banNhom));
    };
    tb.appendChild(tr);
  });
  b.appendChild(tb);
  the.appendChild(el('div', 'bang-cuon')).appendChild(b);

  /* Mục chặn gọn lại thành một dòng gấp, thay cho cả một thẻ "Soát tháng" —
   * anh Hùng thấy thẻ đó thừa. Nhưng danh sách thì KHÔNG bỏ được: không có nó
   * thì nút Chốt mờ đi mà không ai biết vì sao. */
  if (!DATA.chiMinh && (DATA.chan || []).length) {
    const d = el('details', 'luu-y-gap');
    d.appendChild(el('summary', '', 'Còn ' + DATA.chan.length + ' mục phải xong mới chốt được tháng'));
    const ul = el('div', 'than');
    DATA.chan.slice(0, 40).forEach((x) => ul.appendChild(
      el('div', 'nho', '· <b>' + esc(x.o) + ':</b> ' + esc(x.viec))));
    d.appendChild(ul);
    the.appendChild(d);
  }
  return the;
}

/** Nút chốt tháng — đứng cạnh nút xuất, vì cùng là việc cuối tháng. */
function nutChot() {
  const b = el('button', 'btn small', DATA.chot ? 'Bỏ chốt' : 'Chốt tháng');
  b.disabled = !DATA.chot && !DATA.chotDuoc;
  b.title = DATA.chot ? 'Mở lại tháng đã khoá'
    : (DATA.chotDuoc ? 'Khoá điểm của tháng để tính lương' : 'Còn mục chặn, chưa chốt được');
  b.onclick = async (ev) => {
    ev.stopPropagation();
    const td = 'tháng ' + Number(THANG.slice(5)) + '/' + THANG.slice(0, 4);
    if (DATA.chot) {
      if (!confirm('Bỏ chốt ' + td + '?\n\nBản chụp đã đóng băng sẽ bị xoá, điểm quay lại '
        + 'tính động theo số liệu và bộ luật hiện tại.')) return;
    } else if (!confirm('Chốt ' + td + '?\n\nĐiểm của ' + DATA.nguoi.length
      + ' người sẽ được đóng băng và không đổi nữa, kể cả khi số liệu hay bộ luật '
      + 'thay đổi sau này.\n\nĐây là con số dùng để tính lương.')) return;
    try {
      const duong = DATA.chot ? 'bo-chot' : 'chot';
      await goi(duong, { method: 'POST', body: JSON.stringify({ thang: THANG }) });
      bao(DATA.chot ? 'Đã bỏ chốt' : 'Đã chốt tháng');
      await napThang(); ve();
    } catch (e) { bao(e.message, true); }
  };
  return b;
}

/**
 * Cửa sổ chi tiết một tiêu chí của một người.
 *
 * Anh Hùng: *"ấn vào mục hiệu quả công việc thì có thể hiện lên cửa sổ thể hiện
 * các chỉ số của nhân sự đó chi tiết thì tốt. Còn 3 mục kia thì ấn vào có thể
 * xem nội dung đánh giá là gì"*.
 */
function moTieuChi(n, tc, banNhom) {
  const h = el('div');

  if (tc.kieu === 'tay') {
    /* Chấm tay: thứ người ta vào xem là LÝ DO, không phải con số. */
    h.appendChild(el('div', 'than',
      'Người chấm: <b>' + esc(tc.boi === 'HCNS' ? 'HCNS' : 'Trưởng phòng') + '</b>'
      + ' · trọng số ' + Math.round(tc.trongSo * 100) + '%'));
    h.appendChild(el('div', 'than',
      tc.chuaCo
        ? '<span class="nhan-o chan">chưa chấm</span>'
        : 'Điểm: <b>' + n3(tc.diem) + '</b> <span class="mo nho">(thang 0 → 2 · 1,0 là đạt yêu cầu)</span>'));
    h.appendChild(el('div', 'than nho nhat', 'Nội dung đánh giá'));
    h.appendChild(el('div', 'than', tc.ghiChu
      ? esc(tc.ghiChu)
      : '<span class="mo">Chưa ghi lý do. Ghi ở bảng “Điểm chấm tay” bên dưới — '
        + 'ghi chú in kèm trên phiếu KPI.</span>'));
  } else if (tc.kieu === 'chiSo') {
    h.appendChild(el('div', 'than', 'Lấy số từ <code>' + esc(tc.nguonMa || 'chưa khai nguồn') + '</code>'
      + ' · trọng số ' + Math.round(tc.trongSo * 100) + '%'));
    h.appendChild(el('div', 'than', tc.chuaCo
      ? '<span class="nhan-o chan">chưa có số</span> — xem tab Nguồn số liệu để biết thiếu ở đâu.'
      : 'Kết quả: <b>' + n3(tc.diem) + '</b>'));
  } else {
    /* Hiệu quả công việc chính: bày ĐÚNG những chỉ số đang chấm cho người này,
     * kênh nào ra kênh nấy. */
    const ds = (n.kenh || []).slice().sort((a, b) => (b.tyTrong || 0) - (a.tyTrong || 0));
    h.appendChild(el('div', 'than', 'Gộp từ <b>' + ds.length + ' kênh</b> · trọng số '
      + Math.round(tc.trongSo * 100) + '% · điểm ' + n3(tc.diem)));
    if (!ds.length) {
      h.appendChild(el('div', 'than nhat', 'Chưa phân kênh nào. Khai ở tab Phân công kênh.'));
    }
    ds.forEach((k) => {
      const nh = banNhom.get(k.khoa);
      const ct = (nh && nh.tieuChi) || [];
      h.appendChild(el('div', 'than nho nhat',
        esc(k.ten || k.khoa) + ' — tỷ trọng ' + Math.round((k.tyTrong || 0) * 100) + '%'
        + ' · kênh đạt ' + (k.boQua || k.diemNhom == null ? 'chưa đo được' : Math.round(k.diemNhom * 100) + '%')));
      if (!ct.length) { h.appendChild(el('div', 'than nhat', 'Bộ luật không khai chỉ số nào cho kênh này.')); return; }
      const t = el('table');
      t.innerHTML = '<thead><tr><th>Chỉ số</th><th class="so">Đang có</th>'
        + '<th class="so">Mục tiêu</th><th class="so">% đạt</th><th class="so">Tỷ trọng</th></tr></thead>'
        + '<tbody>' + ct.map((x) => '<tr><td>' + esc(x.ten) + '</td>'
          + '<td class="so">' + (x.boQua ? '<span class="nhan-o im">chưa đo được</span>' : gon(x.ketQua)) + '</td>'
          + '<td class="so nhat">' + gon(x.mucTieu) + '</td>'
          + '<td class="so">' + ptLon(x.boQua ? null : x.datMucTieu) + '</td>'
          + '<td class="so nhat">' + (x.tyTrong == null ? '—' : Math.round(x.tyTrong * 100) + '%') + '</td></tr>').join('')
        + '</tbody>';
      h.appendChild(t);
    });
  }

  $('#modalTieuDe').textContent = n.ten + ' · ' + tc.ten;
  $('#modalThan').innerHTML = '';
  $('#modalThan').appendChild(h);
  $('#modal').hidden = false;
}

/**
 * Thẻ 4 — NHIỀU THÁNG. Giữ "Sức khoẻ phòng" và "Theo nhân sự"; bỏ "Mạnh yếu
 * chung" và "Đã trả lương → app tính lại" theo đúng ý anh Hùng; "Tăng trưởng
 * theo kênh" đổi từ bảng số sang biểu đồ.
 */
function theNhieuThang() {
  const g = el('div');
  const nhan = (th) => 'T' + Number(th.slice(5));

  /* --- sức khoẻ phòng --- */
  const t1 = el('div', 'the');
  t1.appendChild(el('header', '', '<h3>Sức khoẻ phòng</h3><span class="phu">'
    + TQ.thang.length + ' tháng có số liệu</span>'));
  const maxTB = Math.max(...TQ.phong.map((p) => p.ptTB || 0), 1);
  const oPhong = el('div', 'than cot-thang');
  TQ.phong.forEach((p) => {
    const cao = Math.round(((p.ptTB || 0) / maxTB) * 100);
    oPhong.appendChild(el('div', 'cot',
      '<div class="cot-so">' + (p.ptTB == null ? '—' : Math.round(p.ptTB * 100) + '%') + '</div>'
      + '<div class="cot-than"><i class="' + mucPt(p.ptTB) + '" style="height:' + cao + '%"></i></div>'
      + '<div class="cot-nhan">' + nhan(p.thang) + '</div>'));
  });
  t1.appendChild(oPhong);
  g.appendChild(t1);

  /* --- theo nhân sự --- */
  const t2 = el('div', 'the');
  t2.appendChild(el('header', '', '<h3>Theo nhân sự</h3>'
    + '<span class="phu">% hoàn thành từng tháng</span>'));
  const b2 = el('table');
  b2.innerHTML = '<thead><tr><th>Người</th>'
    + TQ.thang.map((th) => '<th class="so">' + nhan(th) + '</th>').join('') + '</tr></thead>';
  const tb2 = el('tbody');
  TQ.nguoi.forEach((ng) => {
    const theo = new Map(ng.theoThang.map((x) => [x.thang, x.pt]));
    /* Người có thể đổi trách nhiệm và mục tiêu theo tháng, nên tháng nào không
     * có dòng là "chưa thuộc diện tính" chứ không phải "đạt 0%". Để dấu gạch. */
    tb2.appendChild(el('tr', '', '<td><b>' + esc(ng.ten) + '</b></td>'
      + TQ.thang.map((th) => {
        const v = theo.get(th);
        return '<td class="so">' + (v == null || !Number.isFinite(v)
          ? '<span class="mo">—</span>'
          : '<span class="' + mucPt(v) + '">' + Math.round(v * 100) + '%</span>') + '</td>';
      }).join('')));
  });
  b2.appendChild(tb2);
  t2.appendChild(el('div', 'bang-cuon')).appendChild(b2);
  t2.appendChild(el('div', 'than nho nhat',
    'Ô trống là tháng người đó chưa thuộc diện tính — đổi trách nhiệm hay mới vào '
    + 'đều rơi vào đây, và nó khác hẳn “đạt 0%”.'));
  g.appendChild(t2);

  /* --- tăng trưởng theo kênh, dạng biểu đồ --- */
  const t3 = el('div', 'the');
  t3.appendChild(el('header', '', '<h3>Tăng trưởng theo kênh</h3>'
    + '<span class="phu">điểm nhóm từng tháng</span>'));
  const than3 = el('div', 'than');
  /* Mỗi kênh một đường riêng trong ô của nó, thay vì chồng 16 đường lên một
   * khung. Mười sáu đường cùng màu nhạt thì không ai dò được đường nào của ai. */
  const luoi = el('div', 'luoi-sparkline');
  TQ.kenh.forEach((k) => {
    const theo = new Map(k.theoThang.map((x) => [x.thang, x.diem]));
    const day = TQ.thang.map((th) => {
      const v = theo.get(th);
      return Number.isFinite(v) ? v : null;
    });
    const co = day.filter((v) => v != null);
    if (!co.length) return;
    const o = el('div', 'o-spark');
    o.appendChild(el('div', 'spark-ten', esc(k.ten)));
    o.appendChild(veSparkline(day, TQ.thang.map(nhan)));
    const dau = co[0]; const cuoi = co[co.length - 1];
    const d = cuoi - dau;
    o.appendChild(el('div', 'spark-chan',
      '<span class="' + mucPt(cuoi) + '">' + Math.round(cuoi * 100) + '%</span>'
      + ' <span class="lech ' + (d >= 0 ? 'len' : 'xuong') + '">'
      + (d >= 0 ? '▲ +' : '▼ ') + Math.round(Math.abs(d) * 100) + '%</span>'
      + ' <span class="mo nho">so T' + Number(TQ.thang[0].slice(5)) + '</span>'));
    luoi.appendChild(o);
  });
  than3.appendChild(luoi);
  t3.appendChild(than3);
  g.appendChild(t3);

  return g;
}

/** Đường gấp khúc nhỏ, vẽ thẳng bằng SVG — không cần thư viện. */
function veSparkline(day, nhan) {
  const W = 180; const H = 42; const le = 3;
  const co = day.map((v, i) => ({ v, i })).filter((x) => x.v != null);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('class', 'spark');
  if (co.length < 2) {
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', 4); t.setAttribute('y', H / 2 + 4);
    t.setAttribute('font-size', '10'); t.setAttribute('fill', 'currentColor');
    t.textContent = 'chưa đủ tháng để vẽ';
    svg.appendChild(t); return svg;
  }
  /* Thang cố định 0 → 1,5: mỗi kênh một thang riêng thì hai ô cạnh nhau trông
   * giống nhau trong khi một bên 20% một bên 140%. */
  const TRAN = 1.5;
  const x = (i) => le + (i / (day.length - 1)) * (W - le * 2);
  const y = (v) => H - le - (Math.min(v, TRAN) / TRAN) * (H - le * 2);

  /* Vạch mốc 100% — thước để mắt bám vào. */
  const moc = document.createElementNS(ns, 'line');
  moc.setAttribute('x1', 0); moc.setAttribute('x2', W);
  moc.setAttribute('y1', y(1)); moc.setAttribute('y2', y(1));
  moc.setAttribute('class', 'spark-moc');
  svg.appendChild(moc);

  const p = document.createElementNS(ns, 'polyline');
  p.setAttribute('points', co.map((c) => x(c.i) + ',' + y(c.v)).join(' '));
  p.setAttribute('class', 'spark-duong');
  svg.appendChild(p);

  const cuoi = co[co.length - 1];
  const ch = document.createElementNS(ns, 'circle');
  ch.setAttribute('cx', x(cuoi.i)); ch.setAttribute('cy', y(cuoi.v)); ch.setAttribute('r', 2.6);
  ch.setAttribute('class', 'spark-cham');
  svg.appendChild(ch);

  const tt = document.createElementNS(ns, 'title');
  tt.textContent = co.map((c) => nhan[c.i] + ' ' + Math.round(c.v * 100) + '%').join(' · ');
  svg.appendChild(tt);
  return svg;
}
