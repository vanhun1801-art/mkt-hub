'use strict';
/* Giao diện Báo cáo & KPI.
 *
 * Đường API dùng dạng TƯƠNG ĐỐI ('api/…') vì app chạy được ở hai chỗ: một mình
 * tại / và nhúng trong hub tại /m/kpi/. Viết '/api/…' là gãy khi vào qua hub. */

const $ = (s, g = document) => g.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const n3 = (v) => (v == null || Number.isNaN(v) ? '—' : (Math.round(v * 1000) / 1000).toFixed(3));

/* Phần trăm là con số CHÍNH của cả app. Điểm KPI dạng 1,169 là chỉ số có trọng
 * số — nhìn vào không biết tốt hay xấu; "97%" thì biết ngay. Ngưỡng màu: từ 100%
 * là xanh, 80–100% là vàng, dưới 80% là đỏ. */
function mucPt(v) { return v == null ? '' : (v >= 1 ? 'tot' : (v >= 0.8 ? 'vua' : 'xau')); }
function ptLon(v, phu) {
  if (v == null) return '<span class="pt nhat">chưa đo được</span>';
  return '<span class="pt ' + mucPt(v) + '">' + Math.round(v * 100) + '%</span>'
    + (phu ? ' <span class="pt-phu">' + phu + '</span>' : '');
}
/* Thanh tiến độ: nền là 100% mục tiêu, vạch đen là nhịp chuẩn của thời gian. */
function thanhPt(v, nhip) {
  if (v == null) return '';
  const w = Math.max(0, Math.min(100, v * 100));
  return '<div class="thanh"><i class="' + mucPt(v) + '" style="width:' + w + '%"></i>'
    + (nhip != null ? '<b style="left:' + Math.min(100, nhip * 100) + '%"></b>' : '') + '</div>';
}
const pt = (v) => (v == null ? '—' : (Math.round(v * 1000) / 10).toString().replace('.', ',') + '%');
function gon(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const d = Math.abs(n);
  if (d >= 1e9) return (n / 1e9).toFixed(2).replace('.', ',') + ' tỷ';
  if (d >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + ' tr';
  if (d >= 1e4) return Math.round(n / 1e3) + 'k';
  return (Math.round(n * 100) / 100).toLocaleString('vi-VN');
}

let META = null;
let THANG = '';
let DATA = null;           // kết quả tháng đang xem
let TAB = 'phieu';
let SUA = { mucTieu: {}, tyTrong: {} };   // bộ sửa đang thử
let THU = null;            // kết quả thử luật

async function goi(duong, opts) {
  const r = await fetch('api/' + duong, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch (_) { throw new Error(t.slice(0, 200)); }
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

let docTimer;
function bao(msg, loi) {
  const d = $('#doc');
  d.textContent = msg; d.className = 'doc' + (loi ? ' loi' : ''); d.hidden = false;
  clearTimeout(docTimer); docTimer = setTimeout(() => { d.hidden = true; }, loi ? 6000 : 2600);
}

/* ---------------- khởi động ---------------- */
async function khoiDong() {
  try {
    META = await goi('meta');
  } catch (e) { $('#noiDung').innerHTML = '<div class="rong">Không nối được server: ' + esc(e.message) + '</div>'; return; }

  $('#meChip').textContent = META.nguoiXem.ten + (META.nguoiXem.quanLy ? ' · trưởng phòng' : '');
  const sel = $('#selThang');
  const coSo = new Set(META.thangCoSo || META.thang);
  sel.innerHTML = META.thang.map((t) => '<option value="' + t + '">Tháng ' + Number(t.slice(5)) + '/' + t.slice(0, 4)
    + (coSo.has(t) ? '' : ' — chưa có số liệu') + '</option>').join('');
  THANG = META.thangGoiY || META.thang[0] || '';
  sel.value = THANG;
  sel.onchange = () => { THANG = sel.value; SUA = { mucTieu: {}, tyTrong: {} }; THU = null; TD = null; TQ = null; napThang(); };
  /* Làm mới phải xoá cả hai bộ nhớ đệm phía trình duyệt, không thì bấm xong vẫn
   * thấy số cũ của tab Tiến độ và Tổng quan — người dùng tưởng app treo. */
  $('#btnLamMoi').onclick = () => { TD = null; TQ = null; napThang(); };

  /* App có HAI nửa, xếp theo đúng thứ tự đó:
   *   BÁO CÁO — gom mọi base theo khoảng thời gian, xuất tệp gửi Sếp
   *   KPI     — chấm điểm nhân sự theo tháng lương
   * Hai nửa dùng đơn vị thời gian khác nhau (khoảng tuỳ ý vs tháng) nên không
   * gộp chung bộ lọc được; tách tab là cách nói rõ điều đó. */
  const tabs = [];
  if (META.nguoiXem.quanLy) tabs.push(['baocao', 'Báo cáo']);
  tabs.push(['tiendo', 'Tiến độ KPI']);
  if (META.nguoiXem.quanLy) tabs.push(['tong', 'Tổng quan KPI']);
  tabs.push(['phieu', 'Phiếu KPI']);
  if (META.nguoiXem.quanLy) {
    tabs.push(['nguon', 'Nguồn số liệu'], ['thu', 'Mục tiêu & thử luật'], ['soat', 'Soát & chốt']);
  }
  TAB = tabs[0][0];
  $('#tabs').innerHTML = tabs.map(([k, t]) =>
    '<button class="tab' + (k === TAB ? ' chon' : '') + '" data-tab="' + k + '">' + t + '</button>').join('');
  $('#tabs').onclick = (ev) => {
    const b = ev.target.closest('[data-tab]'); if (!b) return;
    TAB = b.dataset.tab;
    [...$('#tabs').children].forEach((x) => x.classList.toggle('chon', x.dataset.tab === TAB));
    ve();
  };

  $('#modal').onclick = (ev) => { if (ev.target.closest('[data-dong]')) $('#modal').hidden = true; };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#modal').hidden = true; });

  /* Chưa có tháng nào thì ĐỪNG gọi API tháng.
   *
   * THANG lúc đó là chuỗi rỗng, máy chủ coi là không truyền rồi tự suy ra
   * danhSachThang()[0] — với kho rỗng thì ra undefined, và nó trả 404 "Chưa có
   * dữ liệu tháng undefined". Client in nguyên câu đó ra mặt người dùng: lọt
   * chữ undefined, trông như app lỗi chứ không phải như app chưa có dữ liệu.
   *
   * Cảnh này gặp NGAY trên server chung: du-lieu/ cố ý không lên GitHub (điểm
   * KPI gắn với lương từng người), mà ổ đĩa Render lại là tạm. */
  if (!(META.thang || []).length) {
    $('#brandSub').textContent = 'chưa có dữ liệu';
    $('#noiDung').innerHTML = '<div class="rong">Chưa nhập lịch sử KPI.<br>'
      + 'Mã nguồn và bộ luật có sẵn, nhưng số điểm nằm trong <code>du-lieu/</code> — '
      + 'thư mục này cố ý không lên GitHub vì gắn với lương từng người, nên bản chạy '
      + 'trên server chung luôn trống. Chạy bước nhập lịch sử trên máy cá nhân.</div>';
    return;
  }

  await napThang();
}

async function napThang() {
  $('#noiDung').innerHTML = '<div class="rong">đang tính…</div>';
  try {
    DATA = await goi('thang?thang=' + encodeURIComponent(THANG));
  } catch (e) { $('#noiDung').innerHTML = '<div class="rong">' + esc(e.message) + '</div>'; return; }
  const s = DATA.chot ? 'đã chốt' : (DATA.chotDuoc ? 'đủ điều kiện chốt' : DATA.soChan + ' mục chặn');
  $('#brandSub').textContent = 'tháng ' + Number(THANG.slice(5)) + '/' + THANG.slice(0, 4)
    + ' · ' + DATA.nguoi.length + ' người · ' + s
    + (DATA.daSuaLuat ? ' · bộ luật đã sửa' : '');
  ve();
}

function ve() {
  /* Chọn tháng chỉ có nghĩa với nửa KPI. Tab Báo cáo có thanh lọc khoảng thời
   * gian riêng, để nguyên ô chọn tháng ở trên là gây hiểu nhầm. */
  $('#oThang').hidden = (TAB === 'baocao');
  if (TAB === 'baocao') veBaoCao();
  else if (TAB === 'tiendo') veTienDo();
  else if (TAB === 'tong') veTongQuan();
  else if (TAB === 'phieu') vePhieu();
  else if (TAB === 'nguon') veNguon();
  else if (TAB === 'thu') veThu();
  else veSoat();
}

/* Tải một tệp do server sinh ra. Dùng thẻ <a download> chứ không fetch rồi tạo
 * blob: giữ được tên tệp có dấu mà server đặt trong Content-Disposition. */
function taiVe(duong) {
  const a = document.createElement('a');
  a.href = 'api/' + duong;
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------------- tab: nguồn số liệu ----------------
 * Hai đường vào: đổ tự động từ app con, và tải file cho nền tảng không có API.
 * Cả hai đều BẮT BUỘC xem trước rồi mới ghi — số này chạy thẳng vào bảng lương,
 * không được để ai bấm một nút rồi mới biết mình vừa đè lên số nào. */
async function veNguon() {
  $('#noiDung').innerHTML = '<div class="rong">đang dò nguồn…</div>';
  let r;
  try { r = await goi('nguon?thang=' + encodeURIComponent(THANG)); }
  catch (e) { $('#noiDung').innerHTML = '<div class="rong">' + esc(e.message) + '</div>'; return; }

  const g = el('div');

  /* --- đổ tự động --- */
  const t1 = el('div', 'the');
  t1.appendChild(el('header', '', '<h3>Đổ số tự động từ các app</h3>'
    + '<span class="phu">' + r.dem.layDuoc + ' lấy được · ' + r.dem.thieu + ' thiếu nguồn'
    + (r.dem.loi ? ' · ' + r.dem.loi + ' lỗi' : '') + '</span>'));
  const than1 = el('div', 'than');
  Object.entries(r.loiApp || {}).forEach(([app, loi]) =>
    than1.appendChild(el('div', 'canhbao chan', '<b>App ' + esc(app) + ' không gọi được</b> — ' + esc(loi))));
  if (DATA.chot) {
    than1.appendChild(el('div', 'canhbao canhBao', '<b>Tháng này đã chốt.</b> Bỏ chốt ở tab “Soát & đối chiếu” trước khi đổ số mới.'));
  }
  const nutDo = el('button', 'btn chinh', 'Đổ ' + r.dem.layDuoc + ' số về tháng này');
  nutDo.disabled = !r.dem.layDuoc || !!DATA.chot;
  /* Chỉ số đang có số mà đổ về thành 0 gần như luôn là "app nguồn chưa đo được
   * cái này", chứ không phải "tháng này làm ra 0". Ghi đè kiểu đó là xoá thành
   * quả thật bằng một khoảng trống — phải cảnh báo riêng, đậm hơn cảnh báo đổi số. */
  const veKhong = r.nhatKy.filter((x) => x.trangThai === 'lay-duoc'
    && x.so === 0 && x.dangDung != null && x.dangDung > 0);
  if (veKhong.length) {
    than1.appendChild(el('div', 'canhbao chan',
      '<b>' + veKhong.length + ' chỉ số đang có số sẽ bị đổ về 0</b> — app nguồn chưa đo được '
      + 'các chỉ số này (thường là lead và follow). Đổ về là mất số thật đang dùng. '
      + 'Nên nối đủ nguồn trước, hoặc tải file cho phần thiếu.'));
  }
  nutDo.onclick = async () => {
    const doi = r.nhatKy.filter((x) => x.trangThai === 'lay-duoc'
      && x.dangDung != null && Math.abs(x.dangDung - x.so) > 0.5).length;
    if (!confirm('Ghi ' + r.dem.layDuoc + ' số vào tháng này?\n\n'
      + (doi ? doi + ' chỉ số sẽ ĐỔI so với số đang dùng.\n' : '')
      + (veKhong.length ? '⚠ ' + veKhong.length + ' chỉ số đang có số sẽ bị đổ về 0.\n' : '')
      + '\nSố gốc nhập từ Excel không bị mất — bấm “Về số gốc” là quay lại được.')) return;
    try {
      const kq = await goi('dong-bo', { method: 'POST', body: JSON.stringify({ thang: THANG }) });
      bao('Đã ghi ' + kq.ghi + ' số'); await napThang(); ve();
    } catch (e) { bao(e.message, true); }
  };
  than1.appendChild(nutDo);
  if (r.coSoLieuMoi) {
    const ve0 = el('button', 'btn ghost', 'Về số gốc');
    ve0.style.marginLeft = '8px';
    ve0.onclick = async () => {
      if (!confirm('Bỏ toàn bộ số đã đổ về / tải lên của tháng này và quay lại số gốc?')) return;
      try {
        await goi('bo-so-lieu', { method: 'POST', body: JSON.stringify({ thang: THANG }) });
        bao('Đã về số gốc'); await napThang(); ve();
      } catch (e) { bao(e.message, true); }
    };
    than1.appendChild(ve0);
  }
  t1.appendChild(than1);

  const b1 = el('table');
  b1.innerHTML = '<thead><tr><th>Chỉ số</th><th>Nguồn</th><th class="so">Đang dùng</th>'
    + '<th class="so">Sẽ thành</th><th>Ghi chú</th></tr></thead>';
  const tb1 = el('tbody');
  const uu = { 'lay-duoc': 0, loi: 1, thieu: 2 };
  r.nhatKy.slice().sort((a, b) => (uu[a.trangThai] - uu[b.trangThai]) || a.ma.localeCompare(b.ma))
    .forEach((x) => {
      const doi = x.trangThai === 'lay-duoc' && x.dangDung != null && Math.abs(x.dangDung - x.so) > 0.5;
      tb1.appendChild(el('tr', '', '<td class="nho">' + esc(x.ma) + '</td>'
        + '<td>' + (x.trangThai === 'lay-duoc' ? '<span class="nhan-o ok">' + esc(x.nguon) + '</span>'
          : x.trangThai === 'loi' ? '<span class="nhan-o chan">lỗi</span>'
            : '<span class="nhan-o im">chưa có nguồn</span>') + '</td>'
        + '<td class="so mo">' + (x.dangDung == null ? '—' : gon(x.dangDung)) + '</td>'
        + '<td class="so">' + (x.so == null ? '—' : '<b>' + gon(x.so) + '</b>'
          + (doi ? ' <span class="lech ' + (x.so > x.dangDung ? 'len' : 'xuong') + '">≠</span>' : '')) + '</td>'
        + '<td class="nho mo">' + esc(x.ghi || '') + '</td>'));
    });
  b1.appendChild(tb1);
  t1.appendChild(el('div', 'bang-cuon')).appendChild(b1);
  g.appendChild(t1);

  /* --- tải file --- */
  const t2 = el('div', 'the');
  t2.appendChild(el('header', '', '<h3>Tải file lên</h3>'
    + '<span class="phu">cho nền tảng không có API: YouTube · Douyin · Xiaohongshu · SEO · KOL</span>'));
  const than2 = el('div', 'than');
  than2.appendChild(el('p', 'mo nho',
    'Dán thẳng từ Excel hoặc mở tệp CSV. Cần ba cột: <b>Kênh · Chỉ số · Giá trị</b>. '
    + 'Nhận theo TÊN cột nên thứ tự cột thế nào cũng được, và đọc được cả số kiểu Việt '
    + '(1.234.567) lẫn kiểu Anh (1,234,567).'));
  const oFile = el('input'); oFile.type = 'file'; oFile.accept = '.csv,.tsv,.txt';
  oFile.style.marginBottom = '8px';
  const oText = el('textarea');
  oText.rows = 6; oText.placeholder = 'Kênh\tChỉ số\tGiá trị\nRooty Trip Phú Quốc\tview\t1.234.567';
  oText.style.cssText = 'width:100%;font:12px ui-monospace,Consolas,monospace;padding:8px;'
    + 'border:1px solid var(--vien);border-radius:8px;resize:vertical';
  oFile.onchange = () => {
    const f = oFile.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => { oText.value = fr.result; bao('Đã đọc ' + f.name); };
    fr.readAsText(f, 'utf-8');
  };
  const ketQua = el('div');
  const nutXem = el('button', 'btn', 'Xem thử khớp vào đâu');
  const nutNap = el('button', 'btn chinh', 'Nạp vào tháng này');
  nutNap.style.marginLeft = '8px'; nutNap.disabled = true;
  nutXem.onclick = async () => {
    try {
      const d = await goi('tai-file', { method: 'POST', body: JSON.stringify({ thang: THANG, noiDung: oText.value, xem: true }) });
      ketQua.innerHTML = '';
      ketQua.appendChild(el('div', 'canhbao ' + (d.khop.length ? 'canhBao' : 'chan'),
        '<b>' + d.soDong + ' dòng đọc được · ' + d.khop.length + ' khớp · ' + d.truot.length + ' không khớp</b>'));
      d.khop.slice(0, 20).forEach((x) => ketQua.appendChild(el('div', 'nho',
        '✓ ' + esc(x.kenh) + ' · ' + esc(x.chiSo) + ' = ' + gon(x.giaTri) + ' → <b>' + esc(x.ma) + '</b>')));
      d.truot.slice(0, 10).forEach((x) => ketQua.appendChild(el('div', 'nho mo',
        '✗ ' + esc(x.kenh) + ' · ' + esc(x.chiSo) + ' — không có tiêu chí nào khớp')));
      nutNap.disabled = !d.khop.length || !!DATA.chot;
    } catch (e) { bao(e.message, true); }
  };
  nutNap.onclick = async () => {
    if (!confirm('Nạp số từ file vào tháng ' + Number(THANG.slice(5)) + '?')) return;
    try {
      const d = await goi('tai-file', { method: 'POST', body: JSON.stringify({ thang: THANG, noiDung: oText.value }) });
      bao('Đã nạp ' + d.ghi + ' số'); await napThang(); ve();
    } catch (e) { bao(e.message, true); }
  };
  than2.appendChild(oFile); than2.appendChild(oText);
  const hang2 = el('div'); hang2.style.marginTop = '8px';
  hang2.appendChild(nutXem); hang2.appendChild(nutNap);
  than2.appendChild(hang2); than2.appendChild(ketQua);
  t2.appendChild(than2);
  g.appendChild(t2);

  $('#noiDung').innerHTML = '';
  $('#noiDung').appendChild(g);
}

/* ---------------- tab 0: tổng quan nhiều tháng ----------------
 * Trả lời "phòng đang khoẻ hay yếu", không phải "tháng này ai bao nhiêu điểm".
 * Chỉ vẽ trên tháng thực sự có số liệu — tháng mới dựng sẵn mà chưa dán dữ liệu
 * đưa vào đường xu hướng là vẽ ra một cú sụp không có thật. */
let TQ = null;
async function veTongQuan() {
  if (!TQ) {
    $('#noiDung').innerHTML = '<div class="rong">đang dựng tổng quan…</div>';
    try { TQ = await goi('tong-quan'); }
    catch (e) { $('#noiDung').innerHTML = '<div class="rong">' + esc(e.message) + '</div>'; return; }
  }
  const g = el('div');
  const nhan = (th) => 'T' + Number(th.slice(5));

  /* --- 1. sức khoẻ phòng --- */
  const t1 = el('div', 'the');
  t1.appendChild(el('header', '', '<h3>Sức khoẻ phòng</h3><span class="phu">'
    + TQ.thang.length + ' tháng có số liệu</span>'));
  /* Cột đo theo % hoàn thành, không theo điểm thô: 100% là mốc "đạt", nên chiều
   * cao cột đọc được ngay mà không cần biết tổng trọng số là bao nhiêu. */
  const maxTB = Math.max(...TQ.phong.map((p) => p.ptTB || 0), 1);
  const oPhong = el('div', 'than cot-thang');
  TQ.phong.forEach((p) => {
    const cao = Math.round(((p.ptTB || 0) / maxTB) * 100);
    oPhong.appendChild(el('div', 'cot',
      '<div class="cot-so">' + (p.ptTB == null ? '—' : Math.round(p.ptTB * 100) + '%') + '</div>'
      /* Dùng chung thang màu với mọi chỗ khác (mucPt): ≥100% xanh, 80–100% vàng,
       * <80% đỏ. Trước đây cột có thang riêng nên 89% ra màu khác hẳn 97% ở bảng
       * bên dưới — cùng một mức mà hai màu là người đọc mất tin vào màu. */
      + '<div class="cot-nen"><i style="height:' + cao + '%" class="' + mucPt(p.ptTB) + '"></i></div>'
      + '<div class="cot-nhan">' + nhan(p.thang) + '</div>'
      + '<div class="cot-phu">' + p.soDat + '/' + p.soNguoi + ' đạt</div>'));
  });
  t1.appendChild(oPhong);
  g.appendChild(t1);

  /* --- 2. điểm yếu hệ thống --- */
  const t2 = el('div', 'the');
  t2.appendChild(el('header', '', '<h3>Mạnh yếu hệ thống</h3>'
    + '<span class="phu">gộp mọi kênh, mọi tháng — không phải lỗi của riêng ai</span>'));
  const b2 = el('table');
  b2.innerHTML = '<thead><tr><th>Loại tiêu chí</th><th class="so">Đạt trung bình</th>'
    + '<th class="so">Số lần chấm</th><th class="so">Dưới 50%</th><th class="so">Vượt 200%</th><th></th></tr></thead>';
  const tb2 = el('tbody');
  TQ.tieuChi.forEach((t) => {
    const w = Math.min(100, (t.datTB || 0) * 50);
    const lop = t.datTB < 0.5 ? 'kem' : (t.datTB > 2 ? 'qua' : '');
    tb2.appendChild(el('tr', '', '<td>' + esc(t.ten) + '</td>'
      + '<td class="so"><b>' + pt(t.datTB) + '</b></td>'
      + '<td class="so mo">' + t.soLan + '</td>'
      + '<td class="so">' + (t.duoi ? '<span class="nhan-o chan">' + t.duoi + '</span>' : '<span class="mo">0</span>') + '</td>'
      + '<td class="so">' + (t.vuot ? '<span class="nhan-o canh">' + t.vuot + '</span>' : '<span class="mo">0</span>') + '</td>'
      + '<td><div class="thanh"><i class="' + lop + '" style="width:' + w + '%"></i></div></td>'));
  });
  b2.appendChild(tb2);
  t2.appendChild(el('div', 'bang-cuon')).appendChild(b2);
  t2.appendChild(el('div', 'than nho mo',
    'Cột “Dưới 50%” đếm số lần một loại tiêu chí bị hụt quá nửa mục tiêu, tính trên mọi kênh mọi tháng. '
    + 'Con số lớn ở đây là điểm yếu của cả phòng hoặc mục tiêu đặt sai — đừng quy cho một cá nhân. '
    + 'Cột “Vượt 200%” ngược lại: mục tiêu nhiều khả năng đặt quá thấp.'));
  g.appendChild(t2);

  /* --- 3. theo người --- */
  const t3 = el('div', 'the');
  t3.appendChild(el('header', '', '<h3>Theo nhân sự</h3>'
    + '<span class="phu">xu hướng = nửa sau so với nửa đầu kỳ</span>'));
  const b3 = el('table');
  b3.innerHTML = '<thead><tr><th>Người</th>'
    + TQ.thang.map((th) => '<th class="so">' + nhan(th) + '</th>').join('')
    + '<th class="so">TB</th><th class="so">Xu hướng</th>'
    + '<th>Kênh kéo lên</th><th>Kênh dìm xuống</th></tr></thead>';
  const tb3 = el('tbody');
  TQ.nguoi.forEach((n) => {
    const theo = new Map(n.theoThang.map((x) => [x.thang, x.pt]));
    let h = '<td><b>' + esc(n.ten) + '</b></td>';
    TQ.thang.forEach((th) => {
      const v = theo.get(th);
      h += '<td class="so">' + (v == null ? '<span class="nhat">—</span>'
        : '<span class="pt ' + mucPt(v) + '" style="font-size:13px">' + Math.round(v * 100) + '%</span>') + '</td>';
    });
    const xh = n.xuHuong;
    /* Điểm nhóm kênh vốn đã là tỷ lệ đạt mục tiêu, nên hiện thẳng dạng % — cùng
     * một đơn vị với mọi con số khác trên màn hình, không bắt người đọc đổi đơn
     * vị giữa chừng. */
    h += '<td class="so">' + ptLon(n.diemTB) + '</td>'
      + '<td class="so"><span class="lech ' + (xh > 0.02 ? 'len' : (xh < -0.02 ? 'xuong' : '')) + '">'
      + (xh == null ? '—' : (xh > 0 ? '▲ +' : (xh < 0 ? '▼ ' : '')) + Math.round(Math.abs(xh) * 100) + '%') + '</span></td>'
      + '<td class="nho dai">' + (n.kenhTot
        ? esc(n.kenhTot.ten) + ' <span class="nhat">' + Math.round(n.kenhTot.tb * 100) + '%</span>'
        : '<span class="nhat">không ăn theo kênh</span>') + '</td>'
      + '<td class="nho dai">' + (n.kenhKem && n.kenhKem.khoa !== (n.kenhTot || {}).khoa
        ? esc(n.kenhKem.ten) + ' <span class="nhat">' + Math.round(n.kenhKem.tb * 100) + '%</span>'
        : '<span class="nhat">—</span>') + '</td>';
    tb3.appendChild(el('tr', '', h));
  });
  b3.appendChild(tb3);
  t3.appendChild(el('div', 'bang-cuon')).appendChild(b3);
  g.appendChild(t3);

  /* --- 4. tăng trưởng theo kênh --- */
  const t4 = el('div', 'the');
  t4.appendChild(el('header', '', '<h3>Tăng trưởng theo kênh</h3>'
    + '<span class="phu">điểm nhóm từng tháng · mũi tên là so với tháng liền trước</span>'));
  const b4 = el('table');
  b4.innerHTML = '<thead><tr><th>Kênh</th>'
    + TQ.thang.map((th) => '<th class="so">' + nhan(th) + '</th>').join('') + '<th>Diễn biến</th></tr></thead>';
  const tb4 = el('tbody');
  TQ.kenh.forEach((k) => {
    const theo = new Map(k.theoThang.map((x) => [x.thang, x.diem]));
    const day = TQ.thang.map((th) => theo.get(th)).filter((v) => v != null && Number.isFinite(v));
    let h = '<td>' + esc(k.ten) + '</td>';
    let truoc = null;
    TQ.thang.forEach((th) => {
      const v = theo.get(th);
      let mui = '';
      if (v != null && truoc != null && Number.isFinite(v) && Number.isFinite(truoc)) {
        const d = v - truoc;
        if (d > 0.05) mui = '<span class="lech len"> ▲</span>';
        else if (d < -0.05) mui = '<span class="lech xuong"> ▼</span>';
      }
      if (Number.isFinite(v)) truoc = v;
      h += '<td class="so">' + (v == null || !Number.isFinite(v) ? '<span class="mo">—</span>' : n3(v) + mui) + '</td>';
    });
    /* Kênh chết: có số ở đầu kỳ rồi mất hẳn — Douying và Xiaohongshu dừng từ T3. */
    const coDau = Number.isFinite(theo.get(TQ.thang[0]));
    const coCuoi = Number.isFinite(theo.get(TQ.thang[TQ.thang.length - 1]));
    let dienBien = '<span class="mo">—</span>';
    if (coDau && !coCuoi) dienBien = '<span class="nhan-o chan">ngừng có số liệu</span>';
    else if (day.length >= 4) {
      const n2 = Math.ceil(day.length / 2);
      const d = (day.slice(n2).reduce((a, b) => a + b, 0) / (day.length - n2))
        - (day.slice(0, n2).reduce((a, b) => a + b, 0) / n2);
      dienBien = d > 0.1 ? '<span class="nhan-o ok">đang lên</span>'
        : (d < -0.1 ? '<span class="nhan-o canh">đang xuống</span>' : '<span class="nhan-o im">đi ngang</span>');
    }
    h += '<td>' + dienBien + '</td>';
    tb4.appendChild(el('tr', '', h));
  });
  b4.appendChild(tb4);
  t4.appendChild(el('div', 'bang-cuon')).appendChild(b4);
  g.appendChild(t4);

  $('#noiDung').innerHTML = '';
  $('#noiDung').appendChild(g);
}

/* ---------------- tab 1: phiếu KPI ---------------- */
function vePhieu() {
  const g = el('div');

  if (DATA.chiMinh) {
    g.appendChild(el('div', 'canhbao canhBao',
      '<b>Bạn đang xem phiếu của chính mình.</b> Trưởng phòng và HCNS xem được cả phòng.'));
  }

  const the = el('div', 'the');
  const hd = el('header', '', '<h3>Điểm tính lương</h3>'
    + '<span class="phu">' + (DATA.chot
      ? 'đã chốt ' + new Date(DATA.chot.luc).toLocaleString('vi-VN')
      : 'chưa chốt') + '</span>');
  const nutXuat = el('button', 'btn small', DATA.chiMinh ? 'Xuất phiếu của tôi' : 'Xuất báo cáo phòng');
  nutXuat.onclick = () => taiVe(DATA.chiMinh
    ? 'xuat?kieu=nguoi&ma=' + encodeURIComponent(DATA.nguoi[0] ? DATA.nguoi[0].ma : '') + '&thang=' + THANG
    : 'xuat?kieu=phong&thang=' + THANG);
  hd.appendChild(nutXuat);
  the.appendChild(hd);

  const t = el('table');
  t.innerHTML = '<thead><tr><th>Người</th><th class="so">% hoàn thành</th><th>Mức đạt</th>'
    + '<th class="so">Điểm tính lương</th><th>Tình trạng</th><th></th></tr></thead>';
  const tb = el('tbody');
  DATA.nguoi.forEach((ng) => {
    const tr = el('tr', 'bam');
    const thieu = ng.tieuChi.filter((x) => x.chuaCo);
    /* % hoàn thành = điểm chia tổng trọng số. Đây mới là con số đọc lên hiểu
     * ngay; điểm 1,169 để nguyên thì không ai biết là tốt hay xấu. */
    const pht = ng.tongTrongSo > 0 ? ng.tong / ng.tongTrongSo : null;
    tr.innerHTML = '<td><b>' + esc(ng.ten) + '</b>'
      + (ng.viTri ? ' <span class="mo nho">' + esc(ng.viTri) + '</span>' : '') + '</td>'
      + '<td class="so">' + ptLon(pht) + '</td>'
      + '<td style="min-width:130px">' + thanhPt(pht) + '</td>'
      + '<td class="so"><span class="diem">' + n3(ng.tong) + '</span>'
      + '<span class="pt-phu"> / ' + n3(ng.tongTrongSo) + '</span></td>'
      + '<td>' + (ng.dayDu
        ? '<span class="nhan-o ok">đủ dữ liệu</span>'
        : '<span class="nhan-o chan">thiếu ' + thieu.length + ' mục</span>') + '</td>'
      + '<td class="so"><span class="mo nho">xem chuỗi tính ›</span>'
      + ' <button class="btn small" data-xuat="' + esc(ng.ma) + '">Xuất</button></td>';
    tr.onclick = (ev) => {
      const b = ev.target.closest('[data-xuat]');
      if (b) { ev.stopPropagation(); return taiVe('xuat?kieu=nguoi&ma=' + encodeURIComponent(b.dataset.xuat) + '&thang=' + THANG); }
      return moPhieu(ng);
    };
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  the.appendChild(el('div', 'bang-cuon')).appendChild(t);
  g.appendChild(the);

  /* chấm tay ngay tại đây — trưởng phòng khỏi phải mở từng phiếu */
  if (!DATA.chiMinh) g.appendChild(bangChamTay());

  $('#noiDung').innerHTML = '';
  $('#noiDung').appendChild(g);
}

function bangChamTay() {
  const cot = [];
  DATA.nguoi.forEach((ng) => ng.tieuChi.forEach((tc) => {
    if (tc.kieu === 'tay' && !cot.some((c) => c.ma === tc.ma)) cot.push({ ma: tc.ma, ten: tc.ten, boi: tc.boi });
  }));
  const the = el('div', 'the');
  the.appendChild(el('header', '', '<h3>Điểm chấm tay</h3>'
    + '<span class="phu">ô đỏ là chưa chấm — tháng không chốt được khi còn ô đỏ</span>'));
  const t = el('table');
  t.innerHTML = '<thead><tr><th>Người</th>'
    + cot.map((c) => '<th class="so">' + esc(c.ten) + '<div class="mo nho">' + esc(c.boi || '') + '</div></th>').join('')
    + '</tr></thead>';
  const tb = el('tbody');
  DATA.nguoi.forEach((ng) => {
    const tr = el('tr');
    let h = '<td><b>' + esc(ng.ten) + '</b></td>';
    cot.forEach((c) => {
      const tc = ng.tieuChi.find((x) => x.ma === c.ma);
      if (!tc) { h += '<td class="so mo">—</td>'; return; }
      h += '<td class="so"><input class="cham' + (tc.chuaCo ? ' thieu' : '') + '" type="number" step="0.1" min="0" max="2"'
        + ' value="' + (tc.chuaCo ? '' : tc.diem) + '" data-ng="' + ng.ma + '" data-tc="' + c.ma + '"></td>';
    });
    tr.innerHTML = h;
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  the.appendChild(el('div', 'bang-cuon')).appendChild(t);

  the.addEventListener('change', async (ev) => {
    const i = ev.target.closest('input.cham'); if (!i) return;
    try {
      DATA = await goi('cham', { method: 'POST', body: JSON.stringify({
        thang: THANG, nguoi: i.dataset.ng, tieuChi: i.dataset.tc,
        diem: i.value === '' ? null : Number(i.value) }) });
      bao('Đã chấm'); ve();
    } catch (e) { bao(e.message, true); }
  });
  return the;
}

/* ---- cửa sổ chuỗi tính của một người ---- */
function moPhieu(ng) {
  $('#modalTieuDe').textContent = ng.ten + ' — tháng ' + Number(THANG.slice(5)) + '/' + THANG.slice(0, 4);
  const b = el('div');

  const t1 = el('table');
  t1.innerHTML = '<thead><tr><th>Tiêu chí tính lương</th><th class="so">Điểm</th>'
    + '<th class="so">Trọng số</th><th class="so">Điểm tính lương</th><th>Nguồn</th></tr></thead>';
  const tb1 = el('tbody');
  ng.tieuChi.forEach((tc) => {
    const nguon = tc.kieu === 'kenh' ? 'gộp từ ' + tc.ghi
      : tc.kieu === 'chiSo' ? 'chỉ số tự động' : 'do ' + (tc.boi || 'người phụ trách') + ' chấm';
    tb1.appendChild(el('tr', '', '<td>' + esc(tc.ten) + '</td>'
      + '<td class="so">' + (tc.chuaCo ? '<span class="nhan-o chan">chưa có</span>' : n3(tc.diem)) + '</td>'
      + '<td class="so mo">' + n3(tc.trongSo) + '</td>'
      + '<td class="so"><b>' + n3(tc.diemTinhLuong) + '</b></td>'
      + '<td class="mo nho">' + esc(nguon) + '</td>'));
  });
  tb1.appendChild(el('tr', '', '<td><b>Tổng</b></td><td></td>'
    + '<td class="so mo">' + n3(ng.tongTrongSo) + '</td>'
    + '<td class="so"><span class="diem">' + n3(ng.tong) + '</span></td><td></td>'));
  t1.appendChild(tb1);
  b.appendChild(t1);

  if ((ng.kenh || []).length) {
    b.appendChild(el('h3', '', 'Phần "Hiệu quả công việc chính" đến từ đâu'));
    b.appendChild(el('p', 'mo nho', 'Điểm mỗi nhóm × tỷ trọng kênh của ' + esc(ng.ten) + '. Bấm một nhóm để xem từng tiêu chí.'));
    const t2 = el('table');
    t2.innerHTML = '<thead><tr><th>Nhóm kênh</th><th class="so">Tỷ trọng</th>'
      + '<th class="so">Điểm nhóm</th><th class="so">Góp vào</th></tr></thead>';
    const tb2 = el('tbody');
    ng.kenh.forEach((k) => {
      const tr = el('tr', 'bam');
      tr.innerHTML = '<td>' + esc(k.ten) + '</td>'
        + '<td class="so mo">' + pt(k.tyTrong) + '</td>'
        + '<td class="so">' + (k.boQua ? '<span class="nhan-o chan">không chấm được</span>' : n3(k.diemNhom)) + '</td>'
        + '<td class="so"><b>' + n3(k.diem) + '</b></td>';
      tr.onclick = () => { const r = tb2.querySelector('tr.phu[data-k="' + CSS.escape(k.khoa) + '"]');
        if (r) { r.remove(); return; } tr.after(dongNhom(k.khoa)); };
      tb2.appendChild(tr);
    });
    t2.appendChild(tb2);
    b.appendChild(t2);
  }

  $('#modalThan').innerHTML = '';
  $('#modalThan').appendChild(b);
  $('#modal').hidden = false;
}

function dongNhom(khoa) {
  const n = DATA.nhom.find((x) => x.khoa === khoa);
  const tr = el('tr', 'phu'); tr.dataset.k = khoa;
  const td = el('td'); td.colSpan = 4;
  if (!n) { td.textContent = 'Không tìm thấy nhóm này trong bộ luật.'; tr.appendChild(td); return tr; }
  const t = el('table');
  t.innerHTML = '<thead><tr><th>Tiêu chí</th><th class="so">Kết quả</th><th class="so">Mục tiêu</th>'
    + '<th class="so">% đạt</th><th class="so">Tỷ trọng</th><th class="so">Điểm</th></tr></thead>';
  const tb = el('tbody');
  n.tieuChi.forEach((tc) => {
    const d = tc.datMucTieu;
    const w = d == null ? 0 : Math.min(100, d * 100);
    const lop = d == null ? '' : (d > 3 ? 'qua' : (d < 0.2 ? 'kem' : ''));
    tb.appendChild(el('tr', '', '<td>' + esc(tc.ten)
      + (tc.boQua ? '<div class="mo nho">' + esc(tc.lyDo) + '</div>' : '') + '</td>'
      + '<td class="so">' + (tc.boQua ? '<span class="nhan-o im">không đo được</span>' : gon(tc.ketQua)) + '</td>'
      + '<td class="so mo">' + gon(tc.mucTieu) + '</td>'
      + '<td class="so">' + (tc.boQua ? '—' : pt(d) + '<div class="thanh"><i class="' + lop + '" style="width:' + w + '%"></i></div>') + '</td>'
      + '<td class="so ' + (tc.boQua ? 'gach' : 'mo') + '">' + pt(tc.boQua ? tc.tyTrongGoc : tc.tyTrong) + '</td>'
      + '<td class="so"><b>' + n3(tc.diem) + '</b></td>'));
  });
  tb.appendChild(el('tr', '', '<td colspan="5"><b>Điểm nhóm</b></td>'
    + '<td class="so"><span class="diem">' + n3(n.diem) + '</span></td>'));
  t.appendChild(tb);
  td.appendChild(t); tr.appendChild(td);
  return tr;
}

/* ---------------- tab 2: thử luật ---------------- */
async function veThu() {
  const g = el('div');
  g.appendChild(el('p', 'mo',
    'Đổi mục tiêu hoặc tỷ trọng rồi xem điểm cả phòng nhúc nhích ngay. Không có gì bị ghi xuống '
    + 'cho tới khi bấm “Lưu bộ luật”.'));
  const oGoiY = el('div');
  g.appendChild(oGoiY);

  const luoi = el('div', 'thu-luoi');
  const trai = el('div');
  const phai = el('div', 'cot-phai');

  let luat;
  try { luat = (await goi('luat?thang=' + encodeURIComponent(THANG))).luat; }
  catch (e) { $('#noiDung').innerHTML = '<div class="rong">' + esc(e.message) + '</div>'; return; }

  luat.nhom.forEach((n) => {
    const khoa = [n.kenh, n.tenKenh, n.loai].join('|');
    const the = el('div', 'the');
    the.appendChild(el('header', '', '<h3>' + esc([n.kenh, n.tenKenh, n.loai].filter(Boolean).join(' · ')) + '</h3>'));
    const t = el('table');
    t.innerHTML = '<thead><tr><th>Tiêu chí</th><th class="so">Mục tiêu</th><th class="so">Tỷ trọng</th><th class="so">Kết quả</th></tr></thead>';
    const tb = el('tbody');
    n.tieuChi.forEach((tc) => {
      const k = khoa + '#' + tc.ma;
      const dn = (DATA.nhom.find((x) => x.khoa === khoa) || { tieuChi: [] }).tieuChi.find((x) => x.ma === tc.ma);
      tb.appendChild(el('tr', '', '<td>' + esc(tc.ten) + '</td>'
        + '<td class="so"><input class="so" type="number" step="any" value="' + tc.mucTieu + '" data-loai="mucTieu" data-k="' + esc(k) + '"></td>'
        + '<td class="so"><input class="so" type="number" step="0.05" min="0" max="1" value="' + (Math.round(tc.tyTrong * 1000) / 1000) + '" data-loai="tyTrong" data-k="' + esc(k) + '"></td>'
        + '<td class="so mo">' + (dn ? gon(dn.ketQua) : '—') + '</td>'));
    });
    t.appendChild(tb);
    the.appendChild(el('div', '')).appendChild(t);
    trai.appendChild(the);
  });

  luoi.appendChild(trai);
  luoi.appendChild(phai);
  g.appendChild(luoi);
  $('#noiDung').innerHTML = '';
  $('#noiDung').appendChild(g);

  trai.addEventListener('input', (ev) => {
    const i = ev.target.closest('input.so'); if (!i) return;
    const v = Number(i.value);
    if (Number.isFinite(v)) SUA[i.dataset.loai][i.dataset.k] = v;
    i.classList.add('doi');
    clearTimeout(veThu._t); veThu._t = setTimeout(chayThu, 350);
  });
  veKetQuaThu(phai, null);
  chayThu();
  veGoiY(oGoiY, trai);

  async function chayThu() {
    try {
      THU = await goi('thu-luat', { method: 'POST', body: JSON.stringify({ thang: THANG, sua: SUA }) });
      veKetQuaThu(phai, THU);
    } catch (e) { bao(e.message, true); }
  }
}

/* ---- đặt mục tiêu dựa trên kết quả thật của các tháng trước ----
 * Đặt mục tiêu bằng cảm tính là gốc của mọi méo mó đã thấy: tháng 7 có kênh để
 * mục tiêu 30.000 view trong khi tháng nào cũng đạt vài trăm nghìn, một mình nó
 * kéo điểm hai người vọt lên. Ở đây mục tiêu bám vào số thật. */
async function veGoiY(hop, trai) {
  const the = el('div', 'the');
  the.appendChild(el('header', '', '<h3>Gợi ý mục tiêu từ số liệu cũ</h3>'
    + '<span class="phu">chưa áp gì cho tới khi bấm nút</span>'));
  const than = el('div', 'than');
  const dk = el('div', 'fld');
  dk.style.cssText = 'gap:14px;flex-wrap:wrap;margin-bottom:10px';
  dk.innerHTML = 'Lấy trung bình <input class="so" id="gyN" type="number" min="1" max="12" value="3" style="width:56px"> tháng gần nhất'
    + ' · đặt mục tiêu cao hơn <input class="so" id="gyTang" type="number" min="-50" max="200" step="5" value="10" style="width:64px">%';
  than.appendChild(dk);
  const bang = el('div');
  than.appendChild(bang);
  the.appendChild(than);
  hop.innerHTML = ''; hop.appendChild(the);

  let ds = [];
  async function nap() {
    bang.innerHTML = '<div class="mo">đang tính…</div>';
    try {
      const n = Number($('#gyN').value) || 3;
      const tang = (Number($('#gyTang').value) || 0) / 100;
      const r = await goi('goi-y-muc-tieu?thang=' + encodeURIComponent(THANG) + '&n=' + n + '&tang=' + tang);
      ds = r.danhSach.filter((x) => x.goiY != null);
      bang.innerHTML = '';
      if (!r.dungThang.length) {
        bang.appendChild(el('div', 'canhbao canhBao', 'Không có tháng nào trước tháng này để lấy số.'));
        return;
      }
      bang.appendChild(el('div', 'nho mo', 'Dựa trên: ' + r.dungThang.slice().reverse()
        .map((t) => 'T' + Number(t.slice(5))).join(', ')));

      /* Sắp mục tiêu lệch nhất lên đầu — đó là chỗ cần sửa, không phải chỗ đã đúng. */
      const xep = ds.slice().sort((a, b) => Math.abs(Math.log((b.datHienTai || 1) || 1))
        - Math.abs(Math.log((a.datHienTai || 1) || 1)));
      const t = el('table');
      t.innerHTML = '<thead><tr><th>Tiêu chí</th><th class="so">Mục tiêu hiện tại</th>'
        + '<th class="so">Thực tế TB</th><th class="so">Đạt</th><th class="so">Gợi ý</th></tr></thead>';
      const tb = el('tbody');
      xep.slice(0, 12).forEach((x) => {
        const d = x.datHienTai;
        const lech = d != null && (d > 2 || d < 0.5);
        tb.appendChild(el('tr', '', '<td class="nho">' + esc(x.nhom + ' · ' + x.tieuChi) + '</td>'
          + '<td class="so mo">' + gon(x.hienTai) + '</td>'
          + '<td class="so">' + gon(x.trungBinh) + '</td>'
          + '<td class="so">' + (d == null ? '—'
            : '<span class="nhan-o ' + (lech ? 'chan' : 'ok') + '">' + pt(d) + '</span>') + '</td>'
          + '<td class="so"><b>' + gon(x.goiY) + '</b></td>'));
      });
      t.appendChild(tb);
      bang.appendChild(el('div', 'bang-cuon')).appendChild(t);
      if (xep.length > 12) bang.appendChild(el('div', 'nho mo', '… và ' + (xep.length - 12) + ' tiêu chí nữa'));

      const nut = el('button', 'btn chinh', 'Áp ' + ds.length + ' gợi ý vào ô mục tiêu');
      nut.style.marginTop = '10px';
      nut.onclick = () => {
        ds.forEach((x) => { SUA.mucTieu[x.ma] = x.goiY; });
        /* Ghi thẳng vào ô nhập để nhìn thấy, chứ không đổi ngầm sau lưng. */
        trai.querySelectorAll('input.so[data-loai="mucTieu"]').forEach((i) => {
          const v = SUA.mucTieu[i.dataset.k];
          if (v != null) { i.value = v; i.classList.add('doi'); }
        });
        trai.dispatchEvent(new Event('input', { bubbles: true }));
        bao('Đã điền ' + ds.length + ' mục tiêu — xem cột “trước → sau” rồi mới lưu');
      };
      bang.appendChild(nut);
    } catch (e) { bang.innerHTML = '<div class="canhbao chan">' + esc(e.message) + '</div>'; }
  }
  dk.addEventListener('change', nap);
  nap();
}

function veKetQuaThu(hop, r) {
  hop.innerHTML = '';
  const the = el('div', 'the');
  the.appendChild(el('header', '', '<h3>Điểm trước → sau</h3>'));
  if (!r) { the.appendChild(el('div', 'than mo', 'đang tính…')); hop.appendChild(the); return; }

  const t = el('table');
  t.innerHTML = '<thead><tr><th>Người</th><th class="so">Trước</th><th class="so">Sau</th><th class="so">Lệch</th></tr></thead>';
  const tb = el('tbody');
  r.truoc.forEach((a, i) => {
    const b = r.sau[i] || {};
    const d = (b.tong || 0) - (a.tong || 0);
    tb.appendChild(el('tr', '', '<td>' + esc(a.ten) + '</td>'
      + '<td class="so mo">' + n3(a.tong) + '</td>'
      + '<td class="so"><b>' + n3(b.tong) + '</b></td>'
      + '<td class="so"><span class="lech ' + (d > 0.0005 ? 'len' : (d < -0.0005 ? 'xuong' : '')) + '">'
      + (Math.abs(d) < 0.0005 ? '—' : (d > 0 ? '+' : '') + n3(d)) + '</span></td>'));
  });
  t.appendChild(tb);
  the.appendChild(el('div', 'bang-cuon')).appendChild(t);

  const chan = (r.soatSau || []).filter((x) => x.muc === 'chan');
  const than = el('div', 'than');
  if (chan.length) {
    than.appendChild(el('div', 'canhbao chan', '<b>Bộ luật đang có ' + chan.length + ' lỗi chặn</b> — chưa lưu được.'));
    chan.slice(0, 5).forEach((x) => than.appendChild(el('div', 'nho mo', '· ' + esc(x.o) + ' — ' + esc(x.viec))));
  } else {
    than.appendChild(el('div', 'canhbao canhBao', 'Bộ luật hợp lệ. Lưu là áp cho tháng này.'));
  }
  const hang = el('div', '', '');
  const luu = el('button', 'btn chinh', 'Lưu bộ luật');
  luu.disabled = chan.length > 0;
  luu.onclick = async () => {
    try {
      await goi('luu-luat', { method: 'POST', body: JSON.stringify({ thang: THANG, luat: r.luat }) });
      bao('Đã lưu bộ luật cho tháng này'); SUA = { mucTieu: {}, tyTrong: {} }; await napThang(); ve();
    } catch (e) { bao(e.message, true); }
  };
  const ve0 = el('button', 'btn ghost', 'Về bản gốc');
  ve0.style.marginLeft = '8px';
  ve0.onclick = async () => {
    try {
      await goi('bo-sua-luat', { method: 'POST', body: JSON.stringify({ thang: THANG }) });
      SUA = { mucTieu: {}, tyTrong: {} }; bao('Đã về bản nhập từ Excel'); await napThang(); ve();
    } catch (e) { bao(e.message, true); }
  };
  hang.appendChild(luu); hang.appendChild(ve0);
  than.appendChild(hang);
  the.appendChild(than);
  hop.appendChild(the);
}

/* ---------------- tab 3: soát & đối chiếu ---------------- */
async function veSoat() {
  const g = el('div');

  /* --- cảnh báo tháng đang xem --- */
  const the1 = el('div', 'the');
  the1.appendChild(el('header', '', '<h3>Soát tháng ' + Number(THANG.slice(5)) + '</h3>'
    + '<span class="phu">' + (DATA.chotDuoc ? 'đủ điều kiện chốt' : DATA.soChan + ' mục chặn') + '</span>'));
  const than1 = el('div', 'than');
  const chan = DATA.chan || [];
  const canh = [...(DATA.canhBaoLuat || []), ...(DATA.canhBao || []).filter((x) => x.muc === 'canhBao')];
  if (!chan.length && !canh.length) than1.appendChild(el('div', 'mo', 'Không có gì phải soát.'));
  chan.slice(0, 40).forEach((x) => than1.appendChild(el('div', 'canhbao chan', '<b>' + esc(x.o) + '</b> — ' + esc(x.viec))));
  gopCanh(canh).slice(0, 40).forEach((x) => than1.appendChild(el('div', 'canhbao canhBao', '<b>' + esc(x.o) + '</b> — ' + esc(x.viec))));

  const nut = el('div', '');
  const bChot = el('button', 'btn chinh', DATA.chot ? 'Đã chốt — bỏ chốt' : 'Chốt tháng này');
  bChot.disabled = !DATA.chot && !DATA.chotDuoc;
  /* Chốt đóng băng con số dùng để trả lương nên phải hỏi lại. Trong lúc dựng app
   * đã có một bản chốt bị ghi mà không ai chủ ý bấm — một cú chạm nhầm không được
   * phép khoá sổ cả tháng. */
  bChot.onclick = async () => {
    const thangDoc = 'tháng ' + Number(THANG.slice(5)) + '/' + THANG.slice(0, 4);
    if (DATA.chot) {
      if (!confirm('Bỏ chốt ' + thangDoc + '?\n\nBản chụp đã đóng băng sẽ bị xoá, điểm quay lại '
        + 'tính động theo số liệu và bộ luật hiện tại.')) return;
    } else if (!confirm('Chốt ' + thangDoc + '?\n\nĐiểm của '
      + DATA.nguoi.length + ' người sẽ được đóng băng thành bản chụp và không đổi nữa, '
      + 'kể cả khi số liệu hay bộ luật thay đổi sau này.\n\nĐây là con số dùng để tính lương.')) return;
    try {
      if (DATA.chot) { await goi('bo-chot', { method: 'POST', body: JSON.stringify({ thang: THANG }) }); bao('Đã bỏ chốt'); }
      else { await goi('chot', { method: 'POST', body: JSON.stringify({ thang: THANG }) }); bao('Đã chốt ' + thangDoc); }
      await napThang(); ve();
    } catch (e) { bao(e.message, true); }
  };
  nut.appendChild(bChot);
  than1.appendChild(nut);
  the1.appendChild(than1);
  g.appendChild(the1);

  /* --- đối chiếu 8 tháng --- */
  const the2 = el('div', 'the');
  the2.appendChild(el('header', '', '<h3>Đã trả lương → app tính lại</h3>'
    + '<span class="phu">điểm lịch sử chỉ để tham chiếu, không dùng tính lại lương đã trả</span>'));
  the2.appendChild(el('div', 'than mo', 'đang tính…'));
  g.appendChild(the2);

  $('#noiDung').innerHTML = '';
  $('#noiDung').appendChild(g);

  let dc;
  try { dc = await goi('doi-chieu'); } catch (e) { the2.lastChild.textContent = e.message; return; }

  const map = new Map(dc.dong.map((d) => [d.thang + '|' + d.ma, d]));
  const t = el('table');
  t.innerHTML = '<thead><tr><th>Người</th>'
    + dc.thang.map((th) => '<th class="so">T' + Number(th.slice(5)) + '</th>').join('') + '</tr></thead>';
  const tb = el('tbody');
  let lech = 0; let tong = 0;
  dc.nguoi.forEach((ng) => {
    let h = '<td><b>' + esc(ng.ten) + '</b></td>';
    dc.thang.forEach((th) => {
      const d = map.get(th + '|' + ng.ma);
      if (!d) { h += '<td class="so mo">—</td>'; return; }
      tong += 1;
      const khac = d.cu != null && Math.abs(d.cu - d.moi) > 0.0005;
      if (khac) lech += 1;
      h += '<td class="so">' + (khac
        ? '<span class="mo">' + n3(d.cu) + '</span><br><b>' + n3(d.moi) + '</b>'
        : n3(d.moi)) + '</td>';
    });
    tb.appendChild(el('tr', '', h));
  });
  t.appendChild(tb);
  the2.lastChild.remove();
  the2.appendChild(el('div', 'bang-cuon')).appendChild(t);
  const chuThich = el('div', 'than nho mo',
    tong + ' ô · ' + (tong - lech) + ' khớp · ' + lech + ' lệch. '
    + 'Ô hiện hai số là ô lệch: số mờ ở trên là điểm đã trả lương, số đậm ở dưới là app tính lại. '
    + 'Mọi ô lệch đều do Excel bỏ trống ô mục tiêu nên cho 0 điểm mà vẫn giữ tỷ trọng; '
    + 'bộ luật của app chặn việc lưu tiêu chí không có mục tiêu nên không tái diễn.');
  the2.appendChild(chuThich);
}

/* Gộp cảnh báo trùng nội dung để danh sách còn đọc được. */
function gopCanh(ds) {
  const m = new Map();
  ds.forEach((x) => {
    const k = x.o + '|' + x.viec;
    if (!m.has(k)) m.set(k, x);
  });
  return [...m.values()];
}

khoiDong();
