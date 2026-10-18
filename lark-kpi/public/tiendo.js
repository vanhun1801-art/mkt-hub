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
 * Bốn bảng, đi từ thô đến chi tiết:
 *   1. theo người, hôm nay
 *   2. theo người, mốc từng tuần
 *   3. theo kênh, mốc từng tuần   ← kênh cũng cần mốc tuần như người
 *   4. từng chỉ số của từng kênh  ← "kênh này hụt ở CHỖ NÀO"
 *
 * Nạp TRƯỚC app.js; dùng chung các hàm tiện ích khai ở đó ($ , el, esc, goi,
 * ptLon, thanhPt, gon) — hai tệp cùng phạm vi toàn cục.
 */
var TD = null;   // eslint-disable-line no-var
var TD_KENH = ''; // eslint-disable-line no-var — kênh đang mở ở bảng chi tiết

async function veTienDo() {
  const g = await dungTienDo();
  if (!g) return;
  $('#noiDung').innerHTML = '';
  $('#noiDung').appendChild(g);
}

/**
 * Dựng khối Tiến độ và TRẢ VỀ, không tự ghi lên màn hình.
 *
 * Tách ra vì tab KPI gộp bốn màn cũ vào một trang: tiến độ, phiếu, chấm tay,
 * chốt. Mỗi màn phải dựng được thành một khối rồi xếp chồng, thay vì màn nào
 * cũng giành lấy #noiDung cho riêng mình.
 */
async function dungTienDo(oCho) {
  /* `oCho` là chỗ để báo "đang tải". Mặc định là cả màn hình, nhưng tab KPI
   * xếp nhiều khối chồng nhau nên phải đưa một ô riêng — nếu không, khối nạp
   * sau sẽ ghi đè lên toàn bộ những khối đã vẽ xong trước nó. */
  const cho = (h) => {
    if (oCho) oCho.innerHTML = h; else $('#noiDung').innerHTML = h;
  };
  if (!TD || TD._thang !== THANG) {
    cho('<div class="rong">đang đọc số mới từ các app…</div>');
    try {
      TD = await goi('tien-do?thang=' + encodeURIComponent(THANG) + (TD_MOI ? '&moi=1' : ''));
      TD._thang = THANG; TD_MOI = false;
    }
    catch (e) { cho('<div class="rong">' + esc(e.message) + '</div>'); return null; }
  }
  if (oCho) oCho.innerHTML = '';
  const g = el('div');
  const cuoi = TD.moc[TD.moc.length - 1] || { nguoi: [], nhom: [] };

  g.appendChild(el('div', 'canhbao tin',
    '<div><b>Số đọc thẳng từ các app, không phải số đã chốt.</b> '
    + 'Tính đến hết ngày ' + Number(TD.denHomNay.slice(8)) + '/' + Number(TD.thang.slice(5))
    + ', đã qua ' + Math.round(TD.nhipChuan * 100) + '% tháng. '
    + 'View là <b>số thô</b>, chưa áp luật bù view và hệ số Bán hàng/Tương tác nên cao hơn số chốt lương.</div>'));

  /* --- ô tổng --- */
  const co = cuoi.nguoi.filter((n) => n.phanTram != null);
  const tbPt = co.length ? co.reduce((s, n) => s + n.phanTram, 0) / co.length : null;
  const kip = co.filter((n) => n.phanTram >= TD.nhipChuan).length;
  const t0 = el('div', 'the');
  t0.appendChild(el('header', '', '<h3>Tính đến hôm nay</h3>'
    + '<span class="phu">cập nhật lúc ' + new Date(TD.capNhat).toLocaleTimeString('vi-VN') + '</span>'));
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
  const banNhom = new Map((cuoi.nhom || []).map((x) => [x.khoa, x]));
  cuoi.nguoi.forEach((n) => {
    const d = n.phanTram == null ? null : n.phanTram - TD.nhipChuan;
    const tr = el('tr', 'bam');
    tr.innerHTML = '<td><b>' + esc(n.ten) + '</b></td>'
      + '<td class="so">' + ptLon(n.phanTram) + '</td>'
      + '<td style="min-width:150px">' + (thanhPt(n.phanTram, TD.nhipChuan) || '<span class="nhat nho">—</span>') + '</td>'
      + '<td class="so">' + (d == null ? '—'
        : '<span class="lech ' + (d >= 0 ? 'len' : 'xuong') + '">'
          + (d >= 0 ? '▲ +' : '▼ ') + Math.round(Math.abs(d) * 100) + '%</span>') + '</td>'
      + '<td class="so nhat">' + Math.round(n.doPhu * 100) + '%'
      + ' <span class="mo nho">xem chỉ số ›</span></td>';
    /* Bấm một người là bung ra đúng những chỉ số đang chấm cho bạn ấy. Trước
     * đây câu "vì sao bạn này 33%" phải đi ba màn mới trả lời được. */
    tr.onclick = () => {
      const cu = tb1.querySelector('tr.phu[data-ng="' + CSS.escape(n.ma) + '"]');
      if (cu) { cu.remove(); return; }
      tr.after(dongChiTietNguoi(n, banNhom));
    };
    tb1.appendChild(tr);
  });
  b1.appendChild(tb1);
  t1.appendChild(el('div', 'bang-cuon')).appendChild(b1);
  t1.appendChild(el('div', 'than nho nhat',
    '“Đo được” là phần trọng số đã có số; dưới 100% là còn nguồn chưa nối (Ads · OTA · Thiết kế · SEO · KOL). '
    + '% đạt chỉ tính trên phần đo được, nên “chưa đo được” khác “đạt 0%”.'));
  g.appendChild(t1);

  /* --- mốc tuần theo người --- */
  g.appendChild(bangMoc('Mốc theo tuần · theo người', 'nguoi', (m) => m.nguoi,
    (x) => x.ten, (x) => x.phanTram));

  /* --- mốc tuần theo kênh --- */
  g.appendChild(bangMoc('Mốc theo tuần · theo kênh', 'nhom', (m) => m.nhom,
    (x) => x.ten, (x) => x.phanTram));

  /* --- theo kênh, hôm nay --- */
  const t3 = el('div', 'the');
  t3.appendChild(el('header', '', '<h3>% đạt mục tiêu theo kênh</h3>'
    + '<span class="phu">bấm một kênh để xem từng chỉ số</span>'));
  const b3 = el('table');
  b3.innerHTML = '<thead><tr><th>Kênh</th><th class="so">% đạt</th><th>So với nhịp</th>'
    + '<th class="so">Chênh nhịp</th><th class="so">Chỉ số đo được</th></tr></thead>';
  const tb3 = el('tbody');
  xepKenh(cuoi.nhom).forEach((n) => {
    const tc = n.tieuChi || [];
    const doDuoc = tc.filter((x) => !x.boQua).length;
    const d = n.phanTram == null ? null : n.phanTram - TD.nhipChuan;
    const tr = el('tr', 'bam');
    tr.innerHTML = '<td class="dai">' + esc(n.ten) + '</td>'
      + '<td class="so">' + ptLon(n.phanTram) + '</td>'
      + '<td style="min-width:150px">' + (thanhPt(n.phanTram, TD.nhipChuan) || '<span class="nhat nho">—</span>') + '</td>'
      + '<td class="so">' + (d == null ? '—'
        : '<span class="lech ' + (d >= 0 ? 'len' : 'xuong') + '">'
          + (d >= 0 ? '▲ +' : '▼ ') + Math.round(Math.abs(d) * 100) + '%</span>') + '</td>'
      + '<td class="so nhat">' + doDuoc + '/' + tc.length + '</td>';
    tr.onclick = () => {
      const cu = tb3.querySelector('tr.phu[data-k="' + CSS.escape(n.khoa) + '"]');
      if (cu) { cu.remove(); return; }
      tr.after(dongChiTietKenh(n));
    };
    tb3.appendChild(tr);
  });
  b3.appendChild(tb3);
  t3.appendChild(el('div', 'bang-cuon')).appendChild(b3);
  g.appendChild(t3);

  /* --- bảng phẳng: mọi chỉ số của mọi kênh --- */
  g.appendChild(bangChiSo(cuoi.nhom));

  return g;
}

/** Đạt cao lên trên; kênh chưa đo được xuống cuối chứ không lẫn vào nhóm 0%. */
function xepKenh(ds) {
  return ds.slice().sort((a, b) => {
    if ((a.phanTram == null) !== (b.phanTram == null)) return a.phanTram == null ? 1 : -1;
    return (b.phanTram || 0) - (a.phanTram || 0);
  });
}

/**
 * Bảng mốc tuần dùng chung cho cả người lẫn kênh.
 *
 * Bản trước chỉ có mốc tuần cho NGƯỜI. Nhưng người quản kênh cần biết kênh nào
 * đang tụt dần qua từng tuần — một kênh đứng 34% cả tháng và một kênh tụt từ
 * 90% xuống 34% là hai câu chuyện khác hẳn, mà nhìn cột hôm nay thì giống nhau.
 */
function bangMoc(tieuDe, khoaHang, layDs, layTen, layPt) {
  const the = el('div', 'the');
  the.appendChild(el('header', '', '<h3>' + esc(tieuDe) + '</h3>'
    + '<span class="phu">luỹ kế từ đầu tháng · so với nhịp chuẩn cùng mốc</span>'));
  const cuoi = TD.moc[TD.moc.length - 1] || {};
  const hang = layDs(cuoi) || [];
  if (!hang.length) {
    the.appendChild(el('div', 'than nhat', 'Chưa có dòng nào.'));
    return the;
  }
  const b = el('table');
  b.innerHTML = '<thead><tr><th>' + (khoaHang === 'nguoi' ? 'Người' : 'Kênh') + '</th>'
    + TD.moc.map((m) => '<th class="so">hết ngày ' + m.ngay + '</th>').join('')
    + '<th class="so">Xu hướng</th></tr></thead>';
  const tb = el('tbody');
  tb.appendChild(el('tr', '', '<td class="nhat">Nhịp chuẩn</td>'
    + TD.moc.map((m) => '<td class="so nhat">' + Math.round(m.nhipChuan * 100) + '%</td>').join('')
    + '<td></td>'));

  const xep = khoaHang === 'nhom' ? xepKenh(hang) : hang;
  xep.forEach((n) => {
    const khoa = n.ma || n.khoa;
    let h = '<td' + (khoaHang === 'nhom' ? ' class="dai"' : '') + '><b>' + esc(layTen(n)) + '</b></td>';
    const day = [];
    TD.moc.forEach((m) => {
      const x = (layDs(m) || []).find((y) => (y.ma || y.khoa) === khoa);
      const v = x ? layPt(x) : null;
      day.push(v);
      h += '<td class="so">' + (v == null ? '<span class="nhat">—</span>'
        : '<span class="pt ' + (v >= m.nhipChuan ? 'tot' : 'xau') + '" style="font-size:13px">'
          + Math.round(v * 100) + '%</span>') + '</td>';
    });
    h += '<td class="so">' + xuHuong(day) + '</td>';
    tb.appendChild(el('tr', '', h));
  });
  b.appendChild(tb);
  the.appendChild(el('div', 'bang-cuon')).appendChild(b);
  return the;
}

/**
 * So mốc cuối với mốc trước nó. Chỉ số phần trăm là LUỸ KẾ nên gần như luôn
 * tăng — cái đáng nhìn là mốc vừa rồi tăng NHANH HƠN hay CHẬM HƠN nhịp chuẩn.
 *
 * Chữ phải trung tính với cả người đang dẫn lẫn người đang hụt: bản đầu ghi
 * "khép lại / giãn ra" theo khoảng cách tới nhịp, nên người đang ở 309% mà tuần
 * cuối chững lại thì hiện "giãn ra 5%" — đọc y như đang tụt hậu.
 */
function xuHuong(day) {
  const co = day.map((v, i) => ({ v, i })).filter((x) => x.v != null);
  if (co.length < 2) return '<span class="nhat">—</span>';
  const a = co[co.length - 2];
  const b = co[co.length - 1];
  const chenhA = a.v - (TD.moc[a.i] || {}).nhipChuan;
  const chenhB = b.v - (TD.moc[b.i] || {}).nhipChuan;
  const d = chenhB - chenhA;
  if (Math.abs(d) < 0.03) return '<span class="nhat">bám nhịp</span>';
  return '<span class="lech ' + (d > 0 ? 'len' : 'xuong') + '">'
    + (d > 0 ? '▲ bứt lên ' : '▼ chậm lại ') + Math.round(Math.abs(d) * 100) + '%</span>';
}

/**
 * Dòng bung ra dưới một NGƯỜI: toàn bộ thứ đang chấm cho bạn ấy.
 *
 * Anh Hùng 18/10/2026: "ấn vào tiến độ của thành viên thì nó hiện ra các chỉ số
 * chi tiết đang được gán cho bạn".
 *
 * Ba khối, đúng ba kiểu nguồn mà bộ luật có:
 *   - kênh  : bạn ấy gánh kênh nào, tỷ trọng bao nhiêu, kênh đó đang mấy %,
 *             và mở tiếp ra từng chỉ số với mục tiêu, kết quả
 *   - chỉ số: chấm thẳng bằng một con số của app khác (Ads, KOL, Thiết kế)
 *   - tay   : HCNS hoặc trưởng phòng chấm
 *
 * Tiêu chí CHƯA ĐO ĐƯỢC phải nói rõ thiếu ở đâu chứ không ghi 0 — nếu không thì
 * nhìn vào tưởng bạn ấy làm không ra gì, trong khi thật ra app chưa lấy được số.
 */
function dongChiTietNguoi(n, banNhom) {
  const tr = el('tr', 'phu');
  tr.dataset.ng = n.ma;
  const td = el('td');
  td.colSpan = 5;

  const tc = n.tieuChi || [];
  const theoKenh = tc.filter((x) => x.kieu === 'kenh');
  const theoChiSo = tc.filter((x) => x.kieu === 'chiSo');
  const theoTay = tc.filter((x) => x.kieu === 'tay');

  /* --- tiêu chí nào tạo nên điểm của người này --- */
  const tTc = el('table');
  tTc.innerHTML = '<thead><tr><th>Tiêu chí tính lương</th><th>Lấy số từ đâu</th>'
    + '<th class="so">Trọng số</th><th class="so">Tình trạng</th></tr></thead>'
    + '<tbody>' + tc.map((x, i) => {
      const nguon = x.kieu === 'kenh'
        ? (n.kenh || []).length + ' kênh bên dưới'
        : (x.kieu === 'tay'
          ? (x.boi === 'HCNS' ? 'HCNS chấm tay' : 'Trưởng phòng chấm tay')
          : (x.nguonMa ? '<code>' + esc(x.nguonMa) + '</code>' : 'chưa khai nguồn'));
      return '<tr class="bam" data-tc="' + i + '"><td><b>' + esc(x.ten) + '</b></td>'
        + '<td class="nhat">' + nguon + '</td>'
        + '<td class="so nhat">' + Math.round((x.trongSo || 0) * 100) + '%</td>'
        + '<td class="so">' + (x.chuaCo
          ? '<span class="nhan-o im">chưa có số</span>'
          : '<span class="nhan-o ok">đã có số</span>')
        + ' <span class="mo nho">›</span></td></tr>';
    }).join('') + '</tbody>';
  /* Bấm một tiêu chí là mở cửa sổ: "Hiệu quả công việc chính" bày từng chỉ số
   * của từng kênh, ba tiêu chí chấm tay bày NỘI DUNG ĐÁNH GIÁ. Anh Hùng chốt
   * 18/10/2026 — trước đó không có đường nào xem được lý do chấm. */
  tTc.addEventListener('click', (ev) => {
    const tr = ev.target.closest('[data-tc]');
    if (!tr) return;
    ev.stopPropagation();
    moTieuChi(n, tc[Number(tr.dataset.tc)], banNhom);
  });
  td.appendChild(el('div', 'than nho nhat', 'Tiêu chí đang gán cho ' + esc(n.ten)));
  td.appendChild(tTc);

  /* --- kênh và từng chỉ số của kênh --- */
  if (theoKenh.length) {
    const ds = (n.kenh || []).slice().sort((a, b) => (b.tyTrong || 0) - (a.tyTrong || 0));
    td.appendChild(el('div', 'than nho nhat', 'Kênh đang gánh'));
    if (!ds.length) {
      td.appendChild(el('div', 'than nhat',
        'Chưa phân kênh nào cho ' + esc(n.ten) + '. Khai ở tab Phân công kênh.'));
    } else {
      const tK = el('table');
      tK.innerHTML = '<thead><tr><th>Kênh</th><th class="so">Tỷ trọng</th>'
        + '<th class="so">Kênh đạt</th><th>Chỉ số của kênh</th></tr></thead>';
      const tbK = el('tbody');
      ds.forEach((k) => {
        const nh = banNhom.get(k.khoa);
        const ct = (nh && nh.tieuChi) || [];
        const doDuoc = ct.filter((x) => !x.boQua);
        const tomTat = ct.length
          /* Chỉ số chưa đo được phải NÓI RA là chưa đo, không để trơ cái tên.
           * Tên đứng một mình đọc như "có chỉ số này mà bằng 0". */
          ? ct.map((x) => '<span class="nhan-o ' + (x.boQua ? 'im' : (x.datMucTieu >= TD.nhipChuan ? 'ok' : 'chan')) + '">'
              + esc(x.ten) + (x.boQua ? ' · chưa đo được' : ' ' + Math.round((x.datMucTieu || 0) * 100) + '%') + '</span>').join(' ')
          : '<span class="nhat">bộ luật không khai chỉ số nào</span>';
        tbK.appendChild(el('tr', '', '<td class="dai">' + esc(k.ten || k.khoa) + '</td>'
          + '<td class="so nhat">' + Math.round((k.tyTrong || 0) * 100) + '%</td>'
          + '<td class="so">' + ptLon(k.boQua ? null : k.diemNhom) + '</td>'
          + '<td>' + tomTat + (ct.length
            ? '<div class="nho nhat">' + doDuoc.length + '/' + ct.length + ' chỉ số đo được</div>' : '') + '</td>'));
      });
      tK.appendChild(tbK);
      td.appendChild(tK);
    }
  }

  /* --- chỉ số rời và chấm tay, gộp làm một bảng "còn thiếu gì" --- */
  const con = [...theoChiSo, ...theoTay].filter((x) => x.chuaCo);
  if (con.length) {
    td.appendChild(el('div', 'than nho nhat', 'Chưa có số — ' + con.length + ' mục'));
    td.appendChild(el('div', 'than nhat', con.map((x) => esc(x.ten) + ' ('
      + (x.kieu === 'tay'
        ? (x.boi === 'HCNS' ? 'chờ HCNS chấm' : 'chờ trưởng phòng chấm')
        : 'chưa nối nguồn ' + (x.nguonMa || '')) + ')').join(' · ')));
  }

  const nut = el('button', 'btn small', 'Xuất phiếu của ' + n.ten);
  nut.title = 'Phiếu KPI dạng văn bản, có logo và chỗ ký';
  nut.onclick = (ev) => {
    ev.stopPropagation();
    window.open('api/xuat-kpi?kieu=nguoi&ma=' + encodeURIComponent(n.ma) + '&thang=' + THANG, '_blank');
  };
  const hang = el('div', 'than');
  hang.appendChild(nut);
  td.appendChild(hang);

  tr.appendChild(td);
  return tr;
}

/** Dòng bung ra dưới một kênh: từng chỉ số của kênh đó. */
function dongChiTietKenh(n) {
  const tr = el('tr', 'phu');
  tr.dataset.k = n.khoa;
  const td = el('td');
  td.colSpan = 5;
  const tc = n.tieuChi || [];
  if (!tc.length) { td.innerHTML = '<span class="nhat">Bộ luật không khai tiêu chí nào cho kênh này.</span>'; }
  else {
    const t = el('table');
    t.innerHTML = '<thead><tr><th>Chỉ số</th><th class="so">Đang có</th><th class="so">Mục tiêu tháng</th>'
      + '<th class="so">% đạt</th><th>So với nhịp</th><th class="so">Tỷ trọng</th></tr></thead>'
      + '<tbody>' + tc.map((x) => hangChiSo(x)).join('') + '</tbody>';
    td.appendChild(t);
  }
  tr.appendChild(td);
  return tr;
}

function hangChiSo(x) {
  return '<tr><td>' + esc(x.ten) + '</td>'
    + '<td class="so">' + (x.boQua ? '<span class="nhan-o im">chưa đo được</span>' : gon(x.ketQua)) + '</td>'
    + '<td class="so nhat">' + gon(x.mucTieu) + '</td>'
    + '<td class="so">' + ptLon(x.boQua ? null : x.datMucTieu) + '</td>'
    + '<td style="min-width:140px">'
    + (x.boQua ? '<span class="nhat nho">—</span>' : thanhPt(x.datMucTieu, TD.nhipChuan)) + '</td>'
    + '<td class="so nhat">' + (x.tyTrong == null ? '—' : Math.round(x.tyTrong * 100) + '%') + '</td></tr>';
}

/**
 * Mọi chỉ số của mọi kênh trong MỘT bảng phẳng, lọc được.
 *
 * Bảng bung-từng-dòng ở trên tốt để soi một kênh; bảng này để trả lời câu ngược
 * lại — "toàn phòng đang hụt chỉ số nào" — mà không phải mở 21 kênh ra đếm.
 */
function bangChiSo(nhom) {
  const the = el('div', 'the');
  the.appendChild(el('header', '', '<h3>Chi tiết từng chỉ số của từng kênh</h3>'
    + '<span class="phu">xếp theo mức hụt so với nhịp chuẩn</span>'));

  const hang = [];
  nhom.forEach((n) => (n.tieuChi || []).forEach((x) => hang.push({ kenh: n.ten, ...x })));
  if (!hang.length) {
    the.appendChild(el('div', 'than nhat', 'Chưa có chỉ số nào.'));
    return the;
  }

  const than = el('div', 'than loc-hang');
  const nhomLoc = el('div', 'loc-nhom');
  nhomLoc.innerHTML = '<label>Lọc</label>';
  const seg = el('div', 'seg');
  const LOC = [
    { ma: 'tat', nhan: 'Tất cả', loc: () => true },
    { ma: 'hut', nhan: 'Đang hụt nhịp', loc: (x) => !x.boQua && x.datMucTieu < TD.nhipChuan },
    { ma: 'dat', nhan: 'Đạt nhịp', loc: (x) => !x.boQua && x.datMucTieu >= TD.nhipChuan },
    { ma: 'khong', nhan: 'Chưa đo được', loc: (x) => x.boQua },
  ];
  const bangKhung = el('div', 'bang-cuon');

  const veBang = (ma) => {
    const l = LOC.find((x) => x.ma === ma) || LOC[0];
    const ds = hang.filter(l.loc).sort((a, b) => {
      if (a.boQua !== b.boQua) return a.boQua ? 1 : -1;
      return (a.datMucTieu || 0) - (b.datMucTieu || 0);
    });
    const t = el('table');
    t.innerHTML = '<thead><tr><th>Kênh</th><th>Chỉ số</th><th class="so">Đang có</th>'
      + '<th class="so">Mục tiêu tháng</th><th class="so">% đạt</th><th>So với nhịp</th>'
      + '<th class="so">Còn thiếu</th></tr></thead>'
      + '<tbody>' + (ds.length ? ds.map((x) => {
        /* "Còn thiếu" là con số hành động được: đẩy thêm bao nhiêu thì chạm mục
         * tiêu. Một cột %  không nói được điều đó. */
        const thieu = x.boQua || x.mucTieu == null ? null : Math.max(0, x.mucTieu - x.ketQua);
        return '<tr><td class="dai">' + esc(x.kenh) + '</td><td>' + esc(x.ten) + '</td>'
          + '<td class="so">' + (x.boQua ? '<span class="nhan-o im">chưa đo được</span>' : gon(x.ketQua)) + '</td>'
          + '<td class="so nhat">' + gon(x.mucTieu) + '</td>'
          + '<td class="so">' + ptLon(x.boQua ? null : x.datMucTieu) + '</td>'
          + '<td style="min-width:140px">'
          + (x.boQua ? '<span class="nhat nho">—</span>' : thanhPt(x.datMucTieu, TD.nhipChuan)) + '</td>'
          + '<td class="so">' + (thieu == null ? '—' : (thieu > 0
            ? '<b>' + gon(thieu) + '</b>' : '<span class="nhan-o ok">đã vượt</span>')) + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="nhat">Không có dòng nào.</td></tr>') + '</tbody>';
    bangKhung.innerHTML = '';
    bangKhung.appendChild(t);
  };

  LOC.forEach((l) => {
    const b = el('button', 'seg-nut' + (l.ma === (TD_KENH || 'tat') ? ' chon' : ''),
      l.nhan + ' · ' + hang.filter(l.loc).length);
    b.onclick = () => {
      TD_KENH = l.ma;
      seg.querySelectorAll('.seg-nut').forEach((x) => x.classList.remove('chon'));
      b.classList.add('chon');
      veBang(l.ma);
    };
    seg.appendChild(b);
  });
  nhomLoc.appendChild(seg);
  than.appendChild(nhomLoc);
  the.appendChild(than);
  veBang(TD_KENH || 'tat');
  the.appendChild(bangKhung);
  return the;
}
