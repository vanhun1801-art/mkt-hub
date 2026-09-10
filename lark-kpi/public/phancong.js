'use strict';
/* MÀN PHÂN CÔNG — "ai chịu kênh nào, ở tỷ trọng bao nhiêu".
 *
 * Bộ luật có hai tầng tách rời:
 *   tầng CHUNG — mỗi kênh có mục tiêu và tỷ trọng chỉ số, ai làm cũng như nhau
 *   tầng RIÊNG — bảng `nguoi[].kenh`, người này chịu kênh nào ở mức nào
 *
 * Tầng riêng mới là chỗ áp chỉ số lên người, và nó vốn chỉ nằm trong tệp JSON:
 * không màn hình nào bày ra, không sửa được trên app, dù máy chủ đã nhận lệnh
 * sửa từ lâu. Đây là màn đó.
 *
 * Bày theo chiều KÊNH → NGƯỜI (ngược với hình dạng trong bộ luật) vì đó là
 * chiều nhìn ra lỗi. Đứng ở phía người mà hỏi "người này đủ 100% chưa" thì hai
 * lỗi nặng nhất lọt hết, vì tính riêng từng người đều hợp lệ:
 *   - kênh KHÔNG AI nhận  → số liệu chạy về hằng ngày mà không vào KPI của ai
 *   - kênh NHIỀU NGƯỜI nhận → một lượt view cho điểm hai lần, hai người
 *
 * Nạp TRƯỚC app.js; dùng chung tiện ích khai ở đó ($, el, esc, goi, bao).
 */
var PC = null;      // eslint-disable-line no-var — dữ liệu máy chủ trả về
var PC_SUA = null;  // eslint-disable-line no-var — { maNguoi: { khoaNhóm: tỷTrọng } } đang sửa

async function vePhanCong() {
  $('#noiDung').innerHTML = '<div class="rong">đang đọc bộ luật…</div>';
  try { PC = await goi('phan-cong?thang=' + encodeURIComponent(THANG)); }
  catch (e) { $('#noiDung').innerHTML = '<div class="rong">' + esc(e.message) + '</div>'; return; }

  /* Bản nháp tách khỏi dữ liệu máy chủ: sửa ô nào cũng chỉ đụng bản nháp, chưa
   * ghi gì. Bấm Lưu mới gửi đi — giống hệt lối làm ở màn Thử luật. */
  PC_SUA = {};
  PC.nguoi.forEach((n) => { PC_SUA[n.ma] = Object.assign({}, n.kenh); });

  veLuoiPhanCong();
}

/** Tổng tỷ trọng một người đang giữ, theo bản nháp. */
function pcTongNguoi(ma) {
  return Object.values(PC_SUA[ma] || {}).reduce((s, x) => s + (Number(x) || 0), 0);
}
/** Những người đang giữ một kênh, theo bản nháp. */
function pcAiGiu(khoa) {
  return PC.nguoi.filter((n) => n.anTheoKenh && Number((PC_SUA[n.ma] || {})[khoa]) > 0);
}
const pcCoSua = () => PC.nguoi.some((n) =>
  JSON.stringify(Object.entries(PC_SUA[n.ma] || {}).filter((x) => x[1]).sort())
  !== JSON.stringify(Object.entries(n.kenh || {}).filter((x) => x[1]).sort()));

function veLuoiPhanCong() {
  const g = el('div');
  const coKenh = PC.nguoi.filter((n) => n.anTheoKenh);

  g.appendChild(el('div', 'canhbao tin', '<div>'
    + '<b>Đây là chỗ áp chỉ số lên người.</b> Mục tiêu và tỷ trọng của mỗi kênh nằm ở tab '
    + '“Mục tiêu &amp; thử luật” — ai làm cũng như nhau. Còn bảng này quyết định '
    + '<b>ai gánh kênh nào</b>. Một ô là phần trăm kênh đó đóng vào phần “'
    + esc((coKenh[0] || {}).tenTieuChi || 'Hiệu quả công việc chính') + '” của người đó.'
    + '</div>'));

  if (PC.daChot) {
    g.appendChild(el('div', 'canhbao canhBao', '<div><b>Tháng này đã chốt.</b> '
      + 'Số đã đi vào bảng lương — sửa phân công lúc này là đổi điểm sau khi đã trả tiền. '
      + 'Bỏ chốt ở tab “Soát &amp; chốt” trước nếu thật sự cần sửa.</div>'));
  }

  g.appendChild(pcKhoiSoat());
  g.appendChild(pcKhoiLuoi(coKenh));
  g.appendChild(pcKhoiNgoai());

  $('#noiDung').innerHTML = '';
  $('#noiDung').appendChild(g);
}

/* ---------------- khối soát ---------------- */
function pcKhoiSoat() {
  const the = el('div', 'the');
  const coKenh = PC.nguoi.filter((n) => n.anTheoKenh);

  /* Tính lại tại chỗ từ bản nháp, không dùng `PC.soat` của máy chủ: người dùng
   * sửa một ô là phải thấy lỗi mất đi ngay, chứ không phải bấm Lưu rồi mới biết. */
  const lechTong = coKenh.filter((n) => Math.abs(pcTongNguoi(n.ma) - 1) > 0.0001);
  const moCoi = PC.nhom.filter((n) => !pcAiGiu(n.khoa).length);
  const moCoiCoSo = moCoi.filter((n) => n.coSoLieu);
  const chung = PC.nhom.filter((n) => pcAiGiu(n.khoa).length > 1);

  the.appendChild(el('header', '', '<h3>Soát phân công</h3>'
    + '<span class="phu">tính lại ngay mỗi lần sửa ô</span>'));

  const luoi = el('div', 'o-luoi');
  const oo = (nhan, so, ghi, lop) => luoi.appendChild(el('div', 'o' + (lop ? ' ' + lop : ''),
    '<div class="nhan">' + nhan + '</div><div class="so">' + so + '</div>'
    + (ghi ? '<div class="ghi">' + ghi + '</div>' : '')));
  oo('Nhân sự ăn theo kênh', coKenh.length + '/' + PC.nguoi.length,
    (PC.nguoi.length - coKenh.length) + ' người chấm bằng chỉ số riêng');
  oo('Không đủ 100%', lechTong.length, lechTong.length ? 'chặn lưu' : 'mọi người đủ',
    lechTong.length ? 'xau' : 'tot');
  oo('Kênh không ai nhận', moCoi.length,
    moCoiCoSo.length ? moCoiCoSo.length + ' kênh đang có số' : 'không kênh nào đang có số',
    moCoiCoSo.length ? 'xau' : (moCoi.length ? '' : 'tot'));
  oo('Kênh nhiều người nhận', chung.length,
    chung.length ? 'view tính điểm nhiều lần' : 'không trùng ai', chung.length ? 'xau' : 'tot');
  the.appendChild(luoi);

  const than = el('div', 'than');
  let coGi = false;

  if (lechTong.length) {
    coGi = true;
    than.appendChild(el('div', 'canhbao chan', '<div><b>Tỷ trọng không cộng đủ 100%</b> — '
      + lechTong.map((n) => esc(n.ten) + ' <b>' + Math.round(pcTongNguoi(n.ma) * 100) + '%</b>').join(' · ')
      + '. Thiếu thì người đó mất phần điểm tương ứng, thừa thì được cộng thêm. '
      + 'Chưa sửa xong thì không lưu được.</div>'));
  }

  if (chung.length) {
    coGi = true;
    than.appendChild(el('div', 'canhbao canhBao', '<div>'
      + '<b>' + chung.length + ' kênh có từ hai người cùng nhận.</b> '
      + 'Cùng một lượt view sẽ cho điểm nhiều người. '
      + 'Chuyện này có thể đúng (bàn giao, làm chung) nhưng phải là quyết định, không phải lỗi chép.'
      + '<ul class="luu-y">' + chung.map((n) => '<li>' + esc(n.ten) + ' — '
        + pcAiGiu(n.khoa).map((x) => esc(x.ten) + ' ' + Math.round(PC_SUA[x.ma][n.khoa] * 100) + '%').join(' · ')
        + '</li>').join('') + '</ul></div>'));
  }

  if (moCoiCoSo.length) {
    coGi = true;
    than.appendChild(el('div', 'canhbao canhBao', '<div>'
      + '<b>' + moCoiCoSo.length + ' kênh đang có số liệu nhưng không ai nhận.</b> '
      + 'Số chạy về hằng ngày mà không vào KPI của ai — kênh tụt cũng không ai chịu trách nhiệm.'
      + '<ul class="luu-y">' + moCoiCoSo.map((n) => '<li>' + esc(n.ten) + '</li>').join('')
      + '</ul></div>'));
  }

  if (!coGi) {
    than.appendChild(el('div', 'canhbao tin',
      '<div>Không có lỗi phân công nào. Mỗi người đủ 100%, mỗi kênh đúng một người nhận.</div>'));
  }
  the.appendChild(than);
  return the;
}

/* ---------------- lưới kênh × người ---------------- */
function pcKhoiLuoi(coKenh) {
  const the = el('div', 'the');
  const hd = el('header', '', '<h3>Kênh × nhân sự</h3>'
    + '<span class="phu">gõ phần trăm · để trống hoặc 0 là không phụ trách</span>');

  const nut = el('div', 'nut-hang');
  const nutLuu = el('button', 'btn chinh', 'Lưu phân công');
  nutLuu.id = 'pcLuu';
  nutLuu.disabled = true;
  nutLuu.onclick = pcLuu;
  const nutBo = el('button', 'btn ghost', 'Bỏ sửa');
  nutBo.id = 'pcBo';
  nutBo.disabled = true;
  nutBo.onclick = () => { vePhanCong(); };
  nut.appendChild(nutLuu); nut.appendChild(nutBo);
  hd.appendChild(nut);
  the.appendChild(hd);

  const b = el('table', 'pc-bang');
  b.innerHTML = '<thead><tr><th>Kênh</th>'
    + coKenh.map((n) => '<th class="so">' + esc(n.ten) + '</th>').join('')
    + '<th class="so">Tổng kênh</th><th>Ai nhận</th></tr></thead>';
  const tb = el('tbody');

  /* Xếp kênh có vấn đề lên đầu — mở màn ra là thấy ngay chỗ phải sửa, khỏi cuộn
   * qua 21 dòng đúng để tìm 5 dòng sai. */
  const uu = (n) => {
    const ai = pcAiGiu(n.khoa).length;
    if (ai > 1) return 0;
    if (!ai && n.coSoLieu) return 1;
    if (!ai) return 2;
    return 3;
  };
  PC.nhom.slice().sort((a, b2) => uu(a) - uu(b2) || a.ten.localeCompare(b2.ten)).forEach((n) => {
    const tr = el('tr');
    tr.dataset.khoa = n.khoa;
    let h = '<td class="dai"><b>' + esc(n.ten) + '</b>'
      + '<div class="mo nho">' + n.soTieuChi + ' chỉ số · '
      + (n.coSoLieu ? '<span class="nhan-o ok">đang có số</span>'
        : '<span class="nhan-o im">kỳ này chưa có số</span>') + '</div></td>';
    coKenh.forEach((ng) => {
      const v = Number((PC_SUA[ng.ma] || {})[n.khoa]) || 0;
      h += '<td class="so"><input class="pc-o" type="number" min="0" max="100" step="1"'
        + ' value="' + (v ? Math.round(v * 100) : '') + '" placeholder="—"'
        + ' data-ng="' + esc(ng.ma) + '" data-khoa="' + esc(n.khoa) + '"'
        + ' aria-label="' + esc(ng.ten + ' — ' + n.ten) + '"></td>';
    });
    h += '<td class="so pc-tong-kenh"></td><td class="pc-ai nho"></td>';
    tr.innerHTML = h;
    tb.appendChild(tr);
  });

  /* Hàng chân: tổng của từng người. Đây là con số bộ luật bắt phải bằng 100%. */
  const chan = el('tr', 'pc-chan');
  chan.innerHTML = '<td><b>Tổng mỗi người</b><div class="mo nho">phải đúng 100%</div></td>'
    + coKenh.map((n) => '<td class="so pc-tong-nguoi" data-ng="' + esc(n.ma) + '"></td>').join('')
    + '<td></td><td></td>';
  tb.appendChild(chan);
  b.appendChild(tb);

  const kh = el('div', 'bang-cuon');
  kh.appendChild(b);
  the.appendChild(kh);

  the.appendChild(el('div', 'than nho nhat',
    'Tỷ trọng ở đây là phần trăm <b>bên trong</b> tiêu chí “Hiệu quả công việc chính”, '
    + 'không phải phần trăm lương. Ví dụ tiêu chí đó có trọng số 0,7 — một kênh 40% nghĩa là '
    + 'kênh đó đóng 0,28 điểm khi đạt đủ mục tiêu.'));

  /* Một trình nghe cho cả bảng, không gắn từng ô: 21 × 5 ô là hơn trăm trình
   * nghe, và vẽ lại bảng là phải gắn lại hết. */
  b.addEventListener('input', (ev) => {
    const i = ev.target.closest('input.pc-o');
    if (!i) return;
    const v = i.value === '' ? 0 : Number(i.value) / 100;
    if (!Number.isFinite(v) || v < 0) return;
    if (v) PC_SUA[i.dataset.ng][i.dataset.khoa] = v;
    else delete PC_SUA[i.dataset.ng][i.dataset.khoa];
    pcCapNhatTong();
  });

  setTimeout(pcCapNhatTong, 0);
  return the;
}

/**
 * Vẽ lại các con số phái sinh: tổng theo cột, tổng theo hàng, cột "Ai nhận".
 *
 * Cố ý KHÔNG vẽ lại cả bảng mỗi lần gõ — vẽ lại là con trỏ nhảy ra khỏi ô đang
 * gõ, gõ số hai chữ số thì mất chữ thứ hai.
 */
function pcCapNhatTong() {
  const coKenh = PC.nguoi.filter((n) => n.anTheoKenh);

  document.querySelectorAll('.pc-tong-nguoi').forEach((td) => {
    const t = pcTongNguoi(td.dataset.ng);
    const dung = Math.abs(t - 1) < 0.0001;
    td.innerHTML = '<span class="pt ' + (dung ? 'tot' : 'xau') + '">'
      + Math.round(t * 100) + '%</span>';
  });

  document.querySelectorAll('tr[data-khoa]').forEach((tr) => {
    const khoa = tr.dataset.khoa;
    const ai = pcAiGiu(khoa);
    const tong = ai.reduce((s, n) => s + Number(PC_SUA[n.ma][khoa]), 0);
    tr.classList.toggle('pc-trung', ai.length > 1);
    tr.classList.toggle('pc-mocoi', ai.length === 0);
    tr.querySelector('.pc-tong-kenh').innerHTML = ai.length
      ? '<span class="nhat">' + Math.round(tong * 100) + '%</span>' : '';
    tr.querySelector('.pc-ai').innerHTML = ai.length === 0
      ? '<span class="nhan-o chan">không ai nhận</span>'
      : ai.length === 1
        ? '<span class="mo">' + esc(ai[0].ten) + '</span>'
        : '<span class="nhan-o canh">' + ai.length + ' người</span> <span class="mo">'
          + ai.map((x) => esc(x.ten)).join(' · ') + '</span>';
  });

  const co = pcCoSua();
  const lech = coKenh.some((n) => Math.abs(pcTongNguoi(n.ma) - 1) > 0.0001);
  const luu = $('#pcLuu'); const bo = $('#pcBo');
  if (luu) {
    luu.disabled = !co || lech || PC.daChot;
    luu.textContent = co ? 'Lưu phân công' : 'Chưa sửa gì';
    luu.title = PC.daChot ? 'Tháng đã chốt — bỏ chốt trước'
      : lech ? 'Còn người chưa đủ 100%' : 'Ghi vào bộ luật của tháng này';
  }
  if (bo) bo.disabled = !co;

  /* Khối soát ở trên phải theo kịp ô vừa gõ. Vẽ lại riêng nó, không đụng bảng. */
  const cu = document.querySelector('#noiDung .the');
  if (cu && cu.querySelector('h3') && cu.querySelector('h3').textContent === 'Soát phân công') {
    cu.replaceWith(pcKhoiSoat());
  }
}

async function pcLuu() {
  const n = PC.nguoi.filter((x) => x.anTheoKenh).length;
  if (!confirm('Ghi bảng phân công vào bộ luật tháng '
    + Number(THANG.slice(5)) + '/' + THANG.slice(0, 4) + '?\n\n'
    + 'Điểm của ' + n + ' người sẽ tính lại theo phân công mới.\n'
    + 'Bộ luật gốc nhập từ Excel không bị mất — bỏ sửa luật ở tab “Mục tiêu & thử luật” '
    + 'là quay lại được.')) return;
  try {
    await goi('luu-phan-cong', { method: 'POST', body: JSON.stringify({ thang: THANG, phanBo: PC_SUA }) });
    bao('Đã lưu phân công');
    await napThang();
    vePhanCong();
  } catch (e) { bao(e.message, true); }
}

/* ---------------- người không ăn theo kênh ---------------- */
function pcKhoiNgoai() {
  const ngoai = PC.nguoi.filter((n) => !n.anTheoKenh);
  const the = el('div', 'the');
  the.appendChild(el('header', '', '<h3>Nhân sự không chấm theo kênh</h3>'
    + '<span class="phu">' + ngoai.length + ' người</span>'));
  if (!ngoai.length) {
    the.appendChild(el('div', 'than nhat', 'Mọi người đều chấm theo kênh.'));
    return the;
  }
  the.appendChild(el('div', 'than nho mo',
    'Mấy bạn này chấm bằng <b>chỉ số riêng</b> (SEO · Ads · OTA · KOL) chứ không gộp từ kênh, '
    + 'nên không có cột trong bảng trên. Bảng kênh của họ nếu có cũng bị bỏ qua khi tính. '
    + 'Sửa tiêu chí của họ ở tab “Mục tiêu &amp; thử luật”.'));
  const t = el('table');
  t.innerHTML = '<thead><tr><th>Nhân sự</th><th>Vị trí</th><th>Chấm bằng gì</th></tr></thead>'
    + '<tbody>' + ngoai.map((n) => '<tr><td><b>' + esc(n.ten) + '</b></td>'
      + '<td class="mo">' + esc(n.viTri || '—') + '</td>'
      + '<td class="mo nho">chỉ số riêng, không gộp từ kênh</td></tr>').join('') + '</tbody>';
  the.appendChild(el('div', 'bang-cuon')).appendChild(t);
  return the;
}
