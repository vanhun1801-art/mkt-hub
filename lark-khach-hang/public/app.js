'use strict';
/* Khách hàng — Rooty Trip. Bản local. */

const $ = (s, g = document) => g.querySelector(s);
const el = (t, c, x) => { const o = document.createElement(t); if (c) o.className = c; if (x != null) o.textContent = x; return o; };
const so = (n) => (Number(n) || 0).toLocaleString('vi-VN');
const tien = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(v >= 1e10 ? 0 : 1).replace('.', ',') + ' tỷ';
  if (v >= 1e6) return Math.round(v / 1e6) + ' tr';
  return so(v);
};
const req = async (d, o) => {
  const r = await fetch(d, o);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
};

let TQ = null, MKT = null, TRUOC = null;


/* ---------------- bộ lọc kỳ ---------------- */
/* Cùng bộ mốc với app Quản lý quảng cáo, để hai app đọc cùng một ngôn ngữ:
 * bấm "Tháng này" ở đây và ở đó phải ra cùng một khoảng ngày, không thì so
 * tiền quảng cáo với doanh thu là so hai khoảng khác nhau. */
/* Gộp hai bộ mốc đang có trong nhà, vì hiện mỗi nơi một kiểu:
 *   Quảng cáo          : Hôm nay · Tháng này · 7/14/30 ngày · Toàn bộ
 *   Báo cáo, KPI, Việc : Hôm nay · Hôm qua · Tuần này/trước · Tháng này/trước
 * Ai quen app nào mở app này cũng thấy mốc mình hay dùng, và quan trọng hơn:
 * bấm "Tháng này" ở đây với ở app Quảng cáo phải ra ĐÚNG một khoảng ngày, nếu
 * không thì so tiền quảng cáo với doanh thu là so hai khoảng khác nhau. */
const KY = [
  { k: 'today', ten: 'Hôm nay' },
  { k: 'homqua', ten: 'Hôm qua' },
  { k: 'tuan', ten: 'Tuần này' },
  { k: 'tuantruoc', ten: 'Tuần trước' },
  { k: 'thang', ten: 'Tháng này' },
  { k: 'thangtruoc', ten: 'Tháng trước' },
  { k: 7, ten: '7 ngày' },
  { k: 30, ten: '30 ngày' },
  { k: 'all', ten: 'Toàn bộ' },
];
let KY_DANG = 'thang';
let THEO = 'dat';

const d2s = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  + '-' + String(d.getDate()).padStart(2, '0');

/* Tuần bắt đầu từ THỨ HAI — cùng quy ước với Báo cáo và Bảng công việc. Lấy
 * Chủ nhật làm đầu tuần (mặc định của JavaScript) thì "tuần này" ở hai app lệch
 * nhau một ngày, và không ai hiểu vì sao hai con số không khớp. */
function dauTuan(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const thu = (x.getDay() + 6) % 7;        // 0 = thứ Hai
  x.setDate(x.getDate() - thu);
  return x;
}

function khoangCua(k) {
  const h = new Date();
  if (k === 'all') return { tu: '', den: '' };
  if (k === 'today') return { tu: d2s(h), den: d2s(h) };
  if (k === 'homqua') {
    const q = new Date(h); q.setDate(q.getDate() - 1);
    return { tu: d2s(q), den: d2s(q) };
  }
  if (k === 'tuan') return { tu: d2s(dauTuan(h)), den: d2s(h) };
  if (k === 'tuantruoc') {
    const a = dauTuan(h); a.setDate(a.getDate() - 7);
    const z = new Date(a); z.setDate(z.getDate() + 6);
    return { tu: d2s(a), den: d2s(z) };
  }
  if (k === 'thang') return { tu: d2s(new Date(h.getFullYear(), h.getMonth(), 1)), den: d2s(h) };
  if (k === 'thangtruoc') {
    return {
      tu: d2s(new Date(h.getFullYear(), h.getMonth() - 1, 1)),
      den: d2s(new Date(h.getFullYear(), h.getMonth(), 0)),
    };
  }
  const t = new Date(h); t.setDate(t.getDate() - (Number(k) - 1));
  return { tu: d2s(t), den: d2s(h) };
}

/**
 * Kỳ liền trước, DÀI BẰNG kỳ đang xem.
 *
 * Một con số không có mốc so thì không ra quyết định được: thấy "1,2 tỷ" mà
 * không biết tốt hay tệ. So với kỳ trước dài bằng nhau mới công bằng — so
 * tháng này (4 ngày) với tháng trước (31 ngày) là so hai thứ khác cỡ.
 */
function kyTruoc(tu, den) {
  if (!tu || !den) return null;
  const a = new Date(tu + 'T00:00:00'), z = new Date(den + 'T00:00:00');
  const soNgay = Math.round((z - a) / 86400000) + 1;
  const z2 = new Date(a); z2.setDate(z2.getDate() - 1);
  const a2 = new Date(z2); a2.setDate(a2.getDate() - (soNgay - 1));
  return { tu: d2s(a2), den: d2s(z2) };
}

function veSegKy() {
  const h = $('#segKy'); h.innerHTML = '';
  for (const r of KY) {
    const b = el('button', KY_DANG === r.k ? 'dang' : '', r.ten);
    b.onclick = () => { KY_DANG = r.k; const g = khoangCua(r.k); $('#kyTu').value = g.tu; $('#kyDen').value = g.den; nap(); };
    h.appendChild(b);
  }
}

/* ---------------- thanh ngang ---------------- */
function veThanh(hop, cap, { lop = () => '', dinh = null, tran = 12, dinhDang = so } = {}) {
  hop.innerHTML = '';
  const ds = cap.slice(0, tran);
  if (!ds.length) { hop.appendChild(el('div', 'phu', 'Chưa có dữ liệu.')); return; }
  const max = dinh != null ? dinh : Math.max(...ds.map((x) => x[1]));
  for (const [ten, n] of ds) {
    const h = el('div', 'hang ' + lop(ten));
    h.appendChild(el('span', 'ten', ten));
    h.appendChild(el('span', 'so', dinhDang(n)));
    const t = el('div', 'thanh'); const i = el('i');
    i.style.width = Math.max(2, (n / max) * 100) + '%';
    t.appendChild(i); h.appendChild(t);
    hop.appendChild(h);
  }
}
const sx = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]);
const lopMuc = (t) => (t === 'đủ' ? 'du' : t === 'có số' ? 'coso' : 'chiten');

/* ---------------- tổng quan ---------------- */
function veTongQuan() {
  const d = TQ, m = MKT;
  const pc = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '0%');

  /* ---- hàng số đầu: chọn cái ĐỔI ĐƯỢC QUYẾT ĐỊNH, không phải cái to nhất ---- */
  const oSo = $('#oSo'); oSo.innerHTML = '';
  /* So với kỳ trước. Chỉ hiện khi CÓ kỳ trước để so — không có thì thà để
   * trống còn hơn hiện "0%" làm người đọc tưởng đứng yên. */
  const soSanh = (nay, cu) => {
    if (TRUOC == null || cu == null || !Number.isFinite(cu) || cu === 0) return null;
    const pc = Math.round(((nay - cu) / Math.abs(cu)) * 100);
    return { pc, len: pc > 0, bang: pc === 0 };
  };
  const them = (nhan, giaTri, duoi, nhanManh, ss, tốt) => {
    const o = el('div', 'o' + (nhanManh ? ' manh' : ''));
    o.appendChild(el('b', null, giaTri));
    o.appendChild(el('span', null, nhan));
    if (ss) {
      /* Tăng không phải lúc nào cũng tốt: "chi phí mỗi khách" tăng là xấu.
       * Màu đi theo Ý NGHĨA, không đi theo dấu cộng trừ. */
      const hay = ss.bang ? null : (tốt === false ? !ss.len : ss.len);
      const m = el('em', 'ss' + (hay == null ? '' : (hay ? ' tot' : ' xau')),
        (ss.len ? '▲ ' : ss.bang ? '— ' : '▼ ') + Math.abs(ss.pc) + '% so kỳ trước');
      o.appendChild(m);
    }
    if (duoi) o.appendChild(el('i', null, duoi));
    oSo.appendChild(o);
  };
  const T = TRUOC;
  them('doanh thu (đã trừ đơn huỷ)', tien(m.doanhThu), so(m.soDon) + ' đơn', false,
    soSanh(m.doanhThu, T && T.doanhThu));
  them('trung bình mỗi đơn', tien(m.giaTriTB), 'dùng để đặt ngân sách mỗi khách', false,
    soSanh(m.giaTriTB, T && T.giaTriTB));
  them('khách quay lại', pc(m.khachQuayLai, m.khachMua),
    so(m.khachQuayLai) + ' / ' + so(m.khachMua) + ' người đã mua', true,
    soSanh(m.tyLeQuayLai, T && T.tyLeQuayLai));
  them('đặt trước', (m.datTruocGiua == null ? '—' : m.datTruocGiua + ' ngày'),
    m.datTruocTB != null ? 'trung bình ' + m.datTruocTB + ' ngày' : '', true);
  them('sắp khởi hành 30 ngày', so(m.sapDi30), so(m.sapDi7) + ' đi trong 7 ngày tới');
  them('hồ sơ khách', so(d.tong), so(d.coSdt) + ' có số điện thoại');

  /* ---- kênh: bảng, vì bốn con số một dòng thì thanh ngang không chở nổi ---- */
  const ks = Object.entries(m.kenh).sort((a, b) => b[1].tien - a[1].tien).slice(0, 12);
  const hop = $('#bangKenh'); hop.innerHTML = '';
  if (!ks.length) hop.appendChild(el('div', 'phu', 'Chưa có đơn nào.'));
  else {
    const t = el('table', 'bang');
    t.innerHTML = '<thead><tr><th>Kênh</th><th class="p">Doanh thu</th><th class="p">Đơn</th>'
      + '<th class="p">TB/đơn</th><th class="p">Khách quay lại</th></tr></thead>';
    const tb = el('tbody');
    const max = ks[0][1].tien || 1;
    for (const [ten, e] of ks) {
      const tr = el('tr');
      const td1 = el('td');
      td1.appendChild(el('span', 'kten', ten));
      const th = el('div', 'thanh'); const ii = el('i');
      ii.style.width = Math.max(2, (e.tien / max) * 100) + '%';
      th.appendChild(ii); td1.appendChild(th);
      tr.appendChild(td1);
      tr.appendChild(el('td', 'p manh', tien(e.tien)));
      tr.appendChild(el('td', 'p', so(e.don)));
      tr.appendChild(el('td', 'p', tien(e.tbMoiDon)));
      tr.appendChild(el('td', 'p', pc(e.quayLai, e.don)));
      tb.appendChild(tr);
    }
    t.appendChild(tb); hop.appendChild(t);
  }

  /* ---- đặt trước ---- */
  /* ---- đặt trước: CỘT, giữ ĐÚNG thứ tự bậc chứ không xếp theo số lớn —
   * đây là một dải liên tục, xếp lại là mất hình dạng phân bố ---- */
  const BAC = ['Trong 3 ngày', '4–7 ngày', '1–2 tuần', '2–4 tuần', '1–2 tháng', 'Trên 2 tháng'];
  BD.veCot($('#bdDatTruoc'),
    BAC.filter((b) => m.datTruoc[b]).map((b) => ({ nhan: b, giaTri: m.datTruoc[b] })), { dinhDang: so });
  $('#ghiDatTruoc').textContent = m.datTruocGiua == null ? ''
    : 'Một nửa số khách đặt trong vòng ' + m.datTruocGiua + ' ngày trước khi đi. '
      + 'Trung bình ' + m.datTruocTB + ' ngày — cao hơn vì vài khách đặt trước rất xa kéo lên.';

  /* ---- quay lại ---- */
  veThanh($('#bdQuayLai'), [
    ['Khách mua một lần', m.khachMua - m.khachQuayLai],
    ['Khách quay lại', m.khachQuayLai],
  ], { tran: 2 });
  $('#ghiQuayLai').textContent = 'Khách quay lại mang về ' + tien(m.doanhThuQuayLai)
    + ' — ' + pc(m.doanhThuQuayLai, m.doanhThu) + ' tổng doanh thu, dù chỉ chiếm '
    + pc(m.khachQuayLai, m.khachMua) + ' số người mua.';

  /* ---- doanh thu theo ngày: ĐƯỜNG ---- */
  const ngay = Object.keys(m.theoNgay || {}).sort();
  BD.veDuong($('#bdNgay'), ngay.map((k) => ({
    nhan: Number(k.slice(8)) + '/' + Number(k.slice(5, 7)),
    giaTri: m.theoNgay[k].tien,
    phu: m.theoNgay[k].don + ' đơn',
  })), { dinhDang: tien });

  /* ---- sắp khởi hành: CỘT (so chiều cao nhanh hơn so chữ số) ---- */
  /* Nhãn ngắn hết mức: sáu đến tám cột trong một thẻ, dài một chữ là cụt. */
  const TH = (k) => Number(k.slice(5)) + '/' + k.slice(2, 4);
  BD.veCot($('#bdThangDi'),
    Object.keys(m.thangDi).sort().slice(0, 8).map((k) => ({ nhan: TH(k), giaTri: m.thangDi[k] })),
    { dinhDang: so });

  /* ---- remarketing ---- */
  const rm = $('#dsRemar'); rm.innerHTML = '';
  for (const [nhan, x] of Object.entries(m.nguMe)) {
    const r = el('div', 'remar');
    r.appendChild(el('b', null, so(x.so)));
    r.appendChild(el('span', null, 'khách im lặng hơn ' + nhan));
    r.appendChild(el('i', null, 'từng mua ' + tien(x.tien)));
    rm.appendChild(r);
  }

  veThanh($('#bdLoaiTien'), sx(m.loaiTien).map(([a, b]) => [a, Math.round(b)]), { tran: 8, dinhDang: tien });
  veThanh($('#bdTourTien'), sx(m.tourTien).map(([a, b]) => [a, Math.round(b)]), { tran: 10, dinhDang: tien });
  veThanh($('#bdMuc'), sx(d.muc), { lop: lopMuc });
  const loaiBo = [];
  if (m.donHuy) loaiBo.push(so(m.donHuy) + ' đơn huỷ');
  if (m.donNoiBo) loaiBo.push(so(m.donNoiBo) + ' đơn chi phí nội bộ (tạm ứng lương, xăng dầu, bảo hiểm…)');
  $('#ghiHuy').textContent = loaiBo.length
    ? 'Đã loại khỏi mọi phép tính: ' + loaiBo.join(' và ') + '.' : '';

  /* phần dùng ở các tab khác */
  veThanh($('#bdNuoc'), sx(d.nuoc), { tran: 40 });
  veThanh($('#bdLoai'), sx(d.loai), { tran: 10 });
  veThanh($('#bdTour'), sx(d.tour), { tran: 14 });
  veThanh($('#bdGioi'), sx(d.gioi), { tran: 6 });
  const THANG = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
  veThanh($('#bdThang'), Object.entries(d.thang || {}).sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([mm, n]) => [THANG[Number(mm)] || mm, n]), { tran: 12 });

  const thieu = d.tong - d.coNuoc;
  $('#canhBaoBanDo').innerHTML =
    '<b>Bản đồ này chỉ vẽ được ' + so(d.coNuoc) + ' / ' + so(d.tong) + ' hồ sơ</b> ('
    + pc(d.coNuoc, d.tong) + ').<br>' + so(thieu)
    + ' hồ sơ còn lại bỏ trống ô quốc gia trên Tourwell — không phải không có khách, mà là chưa ai điền.';
}

/* ---------------- bản đồ thế giới ---------------- */
/* Toạ độ thủ công cho những nước THẬT SỰ xuất hiện trong dữ liệu. Không bê về
 * một bảng 200 nước: phần lớn sẽ không bao giờ dùng tới, mà bảng càng dài thì
 * càng khó soi khi tên nước viết sai chính tả. Tên nào chưa có ở đây sẽ được
 * liệt kê riêng bên dưới bản đồ để còn bổ sung. */
const TOA_DO = {
  'việt nam': [108.3, 14.1], 'vietnam': [108.3, 14.1],
  'ấn độ': [78.9, 20.6], 'an do': [78.9, 20.6], 'india': [78.9, 20.6],
  'mỹ': [-98.5, 39.8], 'hoa kỳ': [-98.5, 39.8], 'usa': [-98.5, 39.8],
  'đài loan': [121.0, 23.7], 'taiwan': [121.0, 23.7],
  'pakistan': [69.3, 30.4],
  'ả rập saudi': [45.1, 23.9], 'saudi arabia': [45.1, 23.9],
  'hashemite jordan': [36.2, 31.3], 'jordan': [36.2, 31.3],
  'myanmar': [95.9, 21.9],
  'hàn quốc': [127.8, 36.5], 'korea': [127.8, 36.5],
  'nhật bản': [138.3, 36.2], 'japan': [138.3, 36.2],
  'trung quốc': [104.2, 35.9], 'china': [104.2, 35.9],
  'thái lan': [100.9, 15.9], 'thailand': [100.9, 15.9],
  'singapore': [103.8, 1.35], 'malaysia': [101.98, 4.2],
  'indonesia': [113.9, -0.8], 'philippines': [121.8, 12.9],
  'campuchia': [104.9, 12.6], 'cambodia': [104.9, 12.6],
  'lào': [102.5, 19.9], 'laos': [102.5, 19.9],
  'úc': [133.8, -25.3], 'australia': [133.8, -25.3],
  'anh': [-3.4, 55.4], 'vương quốc anh': [-3.4, 55.4], 'uk': [-3.4, 55.4],
  'pháp': [2.2, 46.2], 'france': [2.2, 46.2],
  'đức': [10.5, 51.2], 'germany': [10.5, 51.2],
  'nga': [105.3, 61.5], 'russia': [105.3, 61.5],
  'canada': [-106.3, 56.1], 'ý': [12.6, 41.9], 'italy': [12.6, 41.9],
  'tây ban nha': [-3.7, 40.5], 'hà lan': [5.3, 52.1], 'thụy sĩ': [8.2, 46.8],
  'new zealand': [174.9, -40.9], 'nam phi': [22.9, -30.6],
  'các tiểu vương quốc ả rập thống nhất': [53.8, 23.4], 'uae': [53.8, 23.4],
  'israel': [34.9, 31.0], 'thổ nhĩ kỳ': [35.2, 39.0], 'bangladesh': [90.4, 23.7],
  'nepal': [84.1, 28.4], 'sri lanka': [80.8, 7.9], 'hồng kông': [114.2, 22.3],
  /* Bổ sung sau khi chạy thật trên dữ liệu Tourwell 02/10/2026 — chính dải
   * cảnh báo "chưa có toạ độ cho…" chỉ ra những cái còn thiếu. */
  'iran': [53.7, 32.4], 'i-ran': [53.7, 32.4],
  'ả rập sarawi': [-12.9, 24.2], 'tây sahara': [-12.9, 24.2],
  'nam phi': [22.9, -30.6], 'nga': [105.3, 61.5], 'pháp': [2.2, 46.2],
  'ai cập': [30.8, 26.8], 'ma rốc': [-7.1, 31.8], 'kuwait': [47.5, 29.3],
  'qatar': [51.2, 25.3], 'oman': [56.0, 21.5], 'iraq': [43.7, 33.2],
  'li băng': [35.9, 33.9], 'bỉ': [4.5, 50.5], 'thụy điển': [18.6, 60.1],
  'na uy': [8.5, 60.5], 'đan mạch': [9.5, 56.3], 'ba lan': [19.1, 51.9],
  'séc': [15.5, 49.8], 'áo': [14.6, 47.5], 'bồ đào nha': [-8.2, 39.4],
  'hy lạp': [21.8, 39.1], 'brazil': [-51.9, -14.2], 'mexico': [-102.6, 23.6],
  'argentina': [-63.6, -38.4], 'chile': [-71.5, -35.7],
};
const chuanNuoc = (s) => String(s || '').trim().toLowerCase();

let banDo = null, daNapMap = false;
function veBanDo() {
  if (!TQ) return;
  const ds = sx(TQ.nuoc);
  const diem = [], thieuToaDo = [];
  for (const [ten, n] of ds) {
    const t = TOA_DO[chuanNuoc(ten)];
    if (t) diem.push({ ten, n, lng: t[0], lat: t[1] });
    else thieuToaDo.push(ten);
  }
  if (thieuToaDo.length) {
    $('#canhBaoBanDo').innerHTML += '<br>Chưa có toạ độ cho: <b>' + thieuToaDo.join(', ')
      + '</b> — vẫn đếm trong bảng bên dưới, chỉ là chưa chấm lên bản đồ.';
  }
  if (!diem.length) return;

  const ve = () => {
    const max = Math.max(...diem.map((d) => d.n));
    if (!banDo) {
      banDo = new window.maplibregl.Map({
        container: 'banDo',
        style: 'https://tiles.openfreemap.org/styles/positron',
        center: [60, 20], zoom: 1.1, attributionControl: true,
      });
      banDo.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    }
    const them = () => {
      if (banDo.getLayer('kh-tron')) { banDo.removeLayer('kh-tron'); banDo.removeLayer('kh-chu'); banDo.removeSource('kh'); }
      banDo.addSource('kh', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: diem.map((d) => ({
            type: 'Feature',
            properties: { ten: d.ten, n: d.n, nhan: d.ten + ' · ' + so(d.n) },
            geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
          })),
        },
      });
      banDo.addLayer({
        id: 'kh-tron', type: 'circle', source: 'kh',
        paint: {
          /* Bán kính theo CĂN BẬC HAI của số khách, không theo tỉ lệ thẳng:
           * mắt người đọc vòng tròn theo DIỆN TÍCH, nên tỉ lệ thẳng sẽ thổi
           * phồng nước đông lên gấp nhiều lần sự thật. */
          'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 0, 4, Math.sqrt(max), 34],
          'circle-color': '#289683', 'circle-opacity': .55,
          'circle-stroke-width': 1.5, 'circle-stroke-color': '#289683',
        },
      });
      banDo.addLayer({
        id: 'kh-chu', type: 'symbol', source: 'kh',
        layout: { 'text-field': ['get', 'nhan'], 'text-size': 11, 'text-offset': [0, 1.9], 'text-allow-overlap': false },
        paint: { 'text-color': '#16302b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
      });
    };
    if (banDo.isStyleLoaded()) them(); else banDo.on('load', them);
  };

  if (daNapMap) { ve(); return; }
  daNapMap = true;
  const B = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/';
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = B + 'maplibre-gl.css';
  document.head.appendChild(css);
  const js = document.createElement('script');
  js.src = B + 'maplibre-gl.js';
  js.onload = ve;
  js.onerror = () => { $('#banDo').innerHTML = '<div class="phu" style="padding:16px">Không tải được thư viện bản đồ. Bảng quốc gia bên dưới vẫn đọc được.</div>'; };
  document.head.appendChild(js);
}



/* ---------------- tiền quảng cáo đổi lấy được gì ---------------- */
async function napQuangCao() {
  const tu = $('#kyTu').value, den = $('#kyDen').value;
  const hop = $('#bangQC');
  if (!tu || !den) {
    hop.innerHTML = '';
    hop.appendChild(el('div', 'phu', 'Chọn một khoảng ngày để so chi phí với doanh thu — "Toàn bộ" thì không so được vì quảng cáo chỉ có số liệu theo ngày.'));
    $('#ghiQC').textContent = '';
    return;
  }
  hop.innerHTML = ''; hop.appendChild(el('div', 'phu', 'Đang lấy số liệu từ Meta và TikTok Ads…'));
  let d;
  try { d = await req('/api/quang-cao?tu=' + tu + '&den=' + den + '&theo=dat'); }
  catch (e) { hop.innerHTML = ''; hop.appendChild(el('div', 'phu', 'Không lấy được: ' + e.message)); return; }

  hop.innerHTML = '';
  if (!d.bang.length) { hop.appendChild(el('div', 'phu', 'Không có chi phí quảng cáo trong khoảng này.')); }
  else {
    const t = el('table', 'bang');
    t.innerHTML = '<thead><tr><th>Nền tảng</th><th class="p">Chi quảng cáo</th><th class="p">Doanh thu</th>'
      + '<th class="p">Thu / Chi</th><th class="p">Chi mỗi đơn</th><th class="p">Lãi</th></tr></thead>';
    const tb = el('tbody');
    for (const r of d.bang) {
      const tr = el('tr');
      tr.appendChild(el('td', null, r.nenTang));
      tr.appendChild(el('td', 'p', tien(r.chi)));
      tr.appendChild(el('td', 'p manh', tien(r.tien)));
      /* "Thu/Chi" chứ không viết "ROAS": người đọc bảng này là người làm nội
       * dung, không phải người chạy ads. */
      tr.appendChild(el('td', 'p manh', r.roas == null ? '—' : r.roas.toFixed(1) + '×'));
      tr.appendChild(el('td', 'p', r.chiMoiDon == null ? '—' : tien(r.chiMoiDon)));
      tr.appendChild(el('td', 'p', r.lai == null ? '—' : tien(r.lai)));
      tb.appendChild(tr);
    }
    t.appendChild(tb); hop.appendChild(t);
  }

  const ghi = [];
  ghi.push('Ghép theo ô "Nguồn" mà sales điền trên Tourwell — nguồn ghi sai thì con số này sai theo.');
  if (d.khongGhep && d.khongGhep.length) {
    ghi.push('Không có chi phí quảng cáo: ' + d.khongGhep.join(', ')
      + ' — để trống chứ không chia đều chi phí sang, vì chia đều là mọi ô đều có số và mọi số đều sai.');
  }
  if (d.loi && d.loi.length) ghi.push('⚠ ' + d.loi.join(' · '));
  $('#ghiQC').textContent = ghi.join(' ');

  /* Tỉnh thành: THANH NGANG chứ không cột đứng — tên tỉnh dài, cột đứng là
   * chồng chữ lên nhau. */
  veThanh($('#bdTinh'), (d.tinh || []).slice(0, 15).map((t) => [t.ten, t.tiepCan]), { tran: 15 });
}


/* ---------------- giá bán thật so với giá công bố ---------------- */
async function napGia() {
  const hop = $('#bangGia'); const ghi = $('#ghiGia');
  let d;
  try { d = await req('/api/gia'); }
  catch (e) { hop.innerHTML = ''; hop.appendChild(el('div', 'phu', 'Không đọc được app Sản phẩm: ' + e.message)); return; }
  const co = (d.sp || []).filter((x) => x.lechPt != null);
  hop.innerHTML = '';
  if (!co.length) hop.appendChild(el('div', 'phu', 'Chưa so được sản phẩm nào.'));
  else {
    const t = el('table', 'bang');
    t.innerHTML = '<thead><tr><th>Sản phẩm</th><th class="p">Giá công bố</th><th class="p">Bán thật / khách</th>'
      + '<th class="p">Lệch</th><th class="p">Đơn</th></tr></thead>';
    const tb = el('tbody');
    for (const x of co.slice(0, 12)) {
      const tr = el('tr');
      const td = el('td');
      td.appendChild(el('span', 'kten', x.ten || x.ma));
      if (x.uuDai) td.appendChild(el('span', 'moc', 'ưu đãi: ' + x.uuDai.slice(0, 60)));
      tr.appendChild(td);
      tr.appendChild(el('td', 'p', tien(x.giaNL)));
      tr.appendChild(el('td', 'p manh', tien(x.thucMoiNguoi)));
      const l = el('td', 'p manh');
      const pct = Math.round(x.lechPt * 100);
      l.textContent = (pct > 0 ? '+' : '') + pct + '%';
      /* Bán dưới giá công bố là chuyện bình thường, nhưng dưới sâu thì đáng
       * nhìn — tô cam từ 20% trở xuống, không tô đỏ vì đây chưa chắc là xấu. */
      if (pct <= -20) l.style.color = 'var(--cam)';
      tr.appendChild(l);
      tr.appendChild(el('td', 'p', so(x.soDon)));
      tb.appendChild(tr);
    }
    t.appendChild(tb); hop.appendChild(t);
  }

  /* Nói thẳng phủ được bao nhiêu. Bảng ba dòng mà không nói nó đại diện cho
   * mấy phần trăm thì người đọc tưởng đó là toàn bộ danh mục. */
  const tongDV = (d.khop || 0) + (d.khongKhop || 0) + (d.boQuaGop || 0);
  const g = ['So được ' + so(d.khop) + ' / ' + so(tongDV) + ' lượt dịch vụ ('
    + (tongDV ? Math.round(d.khop * 100 / tongDV) : 0) + '%).'];
  if (d.boQuaGop) {
    g.push('Bỏ qua ' + so(d.boQuaGop) + ' lượt nằm trong đơn gộp nhiều dịch vụ — không biết dịch vụ nào '
      + 'chiếm bao nhiêu tiền, chia đều thì ra con số sai (thử rồi: mọi sản phẩm đều hiện "rẻ hơn 60%").');
  }
  if (d.khongKhop) {
    g.push('Còn ' + so(d.khongKhop) + ' lượt không khớp được tên với app Sản phẩm'
      + (d.chuaKhop && d.chuaKhop.length
        ? ' — hay gặp nhất: ' + d.chuaKhop.slice(0, 4).map((x) => '"' + x.ten.slice(0, 34) + '" (' + x.so + ')').join(', ')
        : '') + '. Thêm mã sản phẩm vào tên dịch vụ trên Tourwell là khớp được ngay.');
  }
  ghi.textContent = g.join(' ');
}


/* ---------------- công sức tự nhiên ---------------- */
async function napSocial() {
  const tu = $('#kyTu').value, den = $('#kyDen').value;
  const hop = $('#bangSocial');
  hop.innerHTML = ''; hop.appendChild(el('div', 'phu', 'Đang đọc app Social…'));
  let d;
  try { d = await req('/api/social?tu=' + tu + '&den=' + den); }
  catch (e) { hop.innerHTML = ''; hop.appendChild(el('div', 'phu', 'Không đọc được: ' + e.message)); return; }
  const ds = (d.kenh || []).filter((k) => k.xemTuNhien || k.bai);
  hop.innerHTML = '';
  if (!ds.length) { hop.appendChild(el('div', 'phu', 'Chưa có số liệu trong kỳ.')); return; }

  const t = el('table', 'bang');
  t.innerHTML = '<thead><tr><th>Kênh</th><th class="p">Bài</th><th class="p">Live</th>'
    + '<th class="p">Lượt xem</th><th class="p">Tương tác</th><th class="p">Người nhắn tin</th></tr></thead>';
  const tb = el('tbody');
  const max = Math.max(...ds.map((k) => k.xemTuNhien), 1);
  for (const k of ds.slice(0, 10)) {
    const tr = el('tr');
    const td = el('td');
    td.appendChild(el('span', 'kten', k.kenh));
    const th = el('div', 'thanh'); const i = el('i');
    i.style.width = Math.max(2, (k.xemTuNhien / max) * 100) + '%';
    th.appendChild(i); td.appendChild(th);
    tr.appendChild(td);
    tr.appendChild(el('td', 'p', so(k.bai)));
    tr.appendChild(el('td', 'p', so(k.live)));
    tr.appendChild(el('td', 'p', so(k.xemTuNhien)));
    tr.appendChild(el('td', 'p', so(k.tuongTac)));
    /* Cột cuối tô đậm vì đây mới là thứ nối sang app này: người nhắn tin hôm
     * nay là người có thể thành đơn hôm sau. Lượt xem thì không. */
    const n = el('td', 'p manh', so(k.nhanTin));
    if (!k.nhanTin && k.xemTuNhien > 100000) n.style.color = 'var(--cam)';
    tr.appendChild(n);
    tb.appendChild(tr);
  }
  t.appendChild(tb); hop.appendChild(t);

  const cao = ds.filter((k) => k.xemTuNhien > 100000 && !k.nhanTin);
  const g = ['Số liệu tự nhiên của ' + so(ds.length) + ' kênh.'];
  if (cao.length) {
    g.push('⚠ ' + cao.map((k) => k.kenh).join(', ')
      + ' có hơn trăm nghìn lượt xem mà KHÔNG một tin nhắn nào — xem nhiều không có nghĩa là ra khách.');
  }
  g.push('Đây là tương quan theo ngày, không phải ghi công: hôm nào đăng nhiều mà cũng nhiều đơn '
    + 'thì chỉ có nghĩa hai việc cùng xảy ra.');
  $('#ghiSocial').textContent = g.join(' ');
}


/* ---------------- buổi tác nghiệp ---------------- */
async function napTacNghiep() {
  const tu = $('#kyTu').value, den = $('#kyDen').value;
  const hop = $('#bangTN');
  if (!tu || !den) { hop.innerHTML = ''; hop.appendChild(el('div', 'phu', 'Chọn một khoảng ngày.')); return; }
  hop.innerHTML = ''; hop.appendChild(el('div', 'phu', 'Đang đọc Lịch tác nghiệp…'));
  let d;
  try { d = await req('/api/tac-nghiep?tu=' + tu + '&den=' + den); }
  catch (e) { hop.innerHTML = ''; hop.appendChild(el('div', 'phu', 'Không đọc được: ' + e.message)); return; }
  hop.innerHTML = '';
  const ds = (d.loai || []).filter((l) => l.soBuoi);
  if (!ds.length) { hop.appendChild(el('div', 'phu', 'Không có buổi tác nghiệp nào trong kỳ.')); return; }

  const t = el('table', 'bang');
  t.innerHTML = '<thead><tr><th>Loại hình</th><th class="p">Buổi</th><th class="p">Chi mỗi buổi</th>'
    + '<th class="p">Lượt xem 7 ngày sau</th><th class="p">Người nhắn</th></tr></thead>';
  const tb = el('tbody');
  const max = Math.max(...ds.map((l) => l.xemMoiBuoi), 1);
  for (const l of ds) {
    const tr = el('tr');
    const td = el('td');
    td.appendChild(el('span', 'kten', l.loai));
    const th = el('div', 'thanh'); const i = el('i');
    i.style.width = Math.max(2, (l.xemMoiBuoi / max) * 100) + '%';
    th.appendChild(i); td.appendChild(th);
    tr.appendChild(td);
    tr.appendChild(el('td', 'p', so(l.soBuoi)));
    tr.appendChild(el('td', 'p', l.chiMoiBuoi ? tien(l.chiMoiBuoi) : '—'));
    tr.appendChild(el('td', 'p manh', so(l.xemMoiBuoi)));
    tr.appendChild(el('td', 'p manh', l.nhanMoiBuoi));
    tb.appendChild(tr);
  }
  t.appendChild(tb); hop.appendChild(t);

  $('#ghiTN').textContent = 'Trung bình mỗi buổi, trong 7 ngày kể từ ngày tác nghiệp. '
    + 'Các cửa sổ 7 ngày CHỒNG LÊN NHAU nên không cộng lại được, và không đọc là "một buổi đem về ngần này" — '
    + 'chỉ so loại hình này với loại hình kia. Mùa vụ và quảng cáo chạy song song đều ảnh hưởng, app chưa tách ra được.';
}

/* ---------------- chân dung ---------------- */
let CD = null, NHANH = 'b2c';

/* Một câu tả nhóm, viết cho người đọc chứ không phải cho máy. Mỗi nhóm có một
 * điểm riêng đáng nhớ — nói đúng cái đó thay vì đọc lại con số đã có ở trên. */
const TA = {
  'Gia đình có trẻ nhỏ': 'Đi cả nhà, có con nhỏ. Quan tâm an toàn, lịch trình thong thả, ảnh đẹp.',
  'Cặp đôi': 'Đi hai người. Đơn nhỏ nhưng đông, hay vào từ mạng xã hội.',
  'Nhóm bạn': 'Ba tới tám người, không trẻ em. Quyết nhanh, hay chọn tour ghép.',
  'Đoàn lớn': 'Trên tám người. Ít khách nhưng mỗi đơn rất lớn.',
  'Đi một mình': 'Một khách. Thường là khách công tác hoặc đi lẻ ghép đoàn.',
  'Có mua, chưa rõ số khách': 'Đơn khách sạn và vé lẻ — không có dòng "Người lớn" nên không đếm được ai đi cùng ai.',
  'Chưa phát sinh': 'Có hồ sơ nhưng chưa đơn nào. Đây là nhóm để đánh thức, không phải nhóm để phân tích.',
  'Đại lý ruột': 'Đặt đều, doanh thu lớn. Nhóm phải giữ bằng mọi giá.',
  'Đại lý thường': 'Đặt vài lần. Nhóm có thể đẩy lên thành đại lý ruột.',
  'Đại lý mới / thử việc': 'Mới một hai đơn. Chưa biết có ở lại hay không.',
  'Đại lý đã ngủ': 'Từng đặt nhưng hơn sáu tháng không quay lại. Nhóm cần đánh thức.',
};

function veChanDung() {
  if (!CD) return;
  const ds = CD[NHANH] || [];
  const t = CD.tong && CD.tong[NHANH];
  $('#cdGhi').innerHTML = CD.tong
    ? '<b>Chia theo nhóm khách ghi trên Tourwell.</b> '
      + 'Khách lẻ ' + so(CD.tong.b2c.khach) + ' người · ' + tien(CD.tong.b2c.tien) + ' — '
      + 'Đại lý &amp; đối tác ' + so(CD.tong.b2b.khach) + ' người · ' + tien(CD.tong.b2b.tien) + '.<br>'
      + 'Mỗi nhóm chỉ gồm những gì ĐO ĐƯỢC từ đơn hàng. Thu nhập, nghề nghiệp, động cơ và nỗi sợ '
      + 'không có trong dữ liệu — phần đó phải hỏi người, và sẽ để riêng khi bổ sung.'
    : '';

  const hop = $('#cdDs'); hop.innerHTML = '';
  if (!ds.length) { hop.appendChild(el('div', 'phu', 'Chưa có dữ liệu.')); return; }
  const lonNhat = Math.max(...ds.map((g) => g.doanhThu));
  for (const g of ds) {
    const c = el('div', 'cd' + (g.doanhThu === lonNhat && lonNhat > 0 ? ' to' : ''));
    c.appendChild(el('h3', null, g.ten));
    c.appendChild(el('div', 'tom', TA[g.ten] || ''));

    const s4 = el('div', 'so4');
    const o = (b, sp) => { const x = el('div'); x.appendChild(el('b', null, b)); x.appendChild(el('span', null, sp)); s4.appendChild(x); };
    o(so(g.soKhach), 'khách');
    o(tien(g.doanhThu), Math.round(g.phanTramTien * 100) + '% doanh thu nhánh');
    o(tien(g.tbMoiDon), 'mỗi đơn');
    o(g.khachMoiDon == null ? '—' : g.khachMoiDon, 'khách mỗi đơn');
    c.appendChild(s4);

    const dl = el('dl');
    const cap = (a, b) => { if (b == null || b === '') return; dl.appendChild(el('dt', null, a)); dl.appendChild(el('dd', null, b)); };
    if (g.tbMoiNguoi) cap('Mỗi khách', tien(g.tbMoiNguoi));
    cap('Đặt trước', g.datTruocGiua == null ? null : g.datTruocGiua + ' ngày');
    cap('Quay lại', Math.round(g.tyLeQuayLai * 100) + '%');
    if (g.tyLeCoTre > 0) cap('Có trẻ em', Math.round(g.tyLeCoTre * 100) + '% số đơn');
    c.appendChild(dl);

    const nhomChip = (nhan, arr) => {
      if (!arr || !arr.length) return;
      c.appendChild(el('div', 'ghi-duoi', nhan));
      const w = el('div');
      for (const x of arr) {
        const ch = el('span', 'chip');
        ch.appendChild(el('b', null, x.ten));
        ch.appendChild(document.createTextNode(' ' + x.so));
        w.appendChild(ch);
      }
      c.appendChild(w);
    };
    nhomChip('Vào từ kênh', g.kenh);
    nhomChip('Hay mua', g.tour);
    nhomChip('Sắp đi', g.thangDi.map((x) => ({ ten: 'T' + Number(x.ten.slice(5)) + '/' + x.ten.slice(2, 4), so: x.so })));

    const nut = el('div', 'cd-nut');
    const xem = el('button', 'btn nho', 'Xem ' + so(g.soKhach) + ' khách');
    xem.onclick = () => moNhom(g);
    const tai = el('a', 'btn nho', 'Tải CSV');
    tai.href = '/api/nhom-khach?tep=csv&nhanh=' + g.nhanh + '&ten=' + encodeURIComponent(g.ten);
    tai.setAttribute('download', '');
    nut.appendChild(xem); nut.appendChild(tai);
    c.appendChild(nut);
    hop.appendChild(c);
  }
}


/** Bấm vào một nhóm chân dung -> danh sách người trong nhóm đó. */
async function moNhom(g) {
  const d = await req('/api/nhom-khach?nhanh=' + g.nhanh + '&ten=' + encodeURIComponent(g.ten));
  $('#hsTen').textContent = g.ten;
  $('#hsPhu').textContent = so(d.tong) + ' khách'
    + (d.tong > d.ds.length ? ' · đang hiện ' + d.ds.length + ' người nhiều tiền nhất' : '');
  const than = $('#hsThan'); than.innerHTML = '';

  const tai = el('a', 'btn nho', 'Tải cả ' + so(d.tong) + ' khách ra CSV');
  tai.href = '/api/nhom-khach?tep=csv&nhanh=' + g.nhanh + '&ten=' + encodeURIComponent(g.ten);
  tai.setAttribute('download', '');
  tai.style.marginBottom = '12px';
  tai.style.display = 'inline-block';
  than.appendChild(tai);

  if (!d.ds.length) { than.appendChild(el('div', 'phu', 'Nhóm này chưa có ai.')); }
  for (const x of d.ds) {
    const b = el('button', 'kq');
    b.appendChild(el('span', 'ten', x.ten || '(chưa có tên)'));
    b.appendChild(el('span', 'tien', x.doanhThu ? tien(x.doanhThu) : ''));
    const d2 = el('div', 'd2');
    if (x.sdt) d2.appendChild(el('span', null, '+' + x.sdt));
    if (x.nuoc) d2.appendChild(el('span', null, x.nuoc));
    if (x.soDon) d2.appendChild(el('span', null, x.soDon + ' đơn'));
    if (x.kenh) d2.appendChild(el('span', null, x.kenh));
    b.appendChild(d2);
    b.onclick = () => moHoSo(x.khoa);
    than.appendChild(b);
  }
  $('#ngan').hidden = false;
}


/* ---------------- khách hỏi gì, lo gì ---------------- */
let henHT = 0;
function kyHienTai() {
  const tu = $('#kyTu').value, den = $('#kyDen').value;
  /* Không chọn kỳ thì lấy 30 ngày gần nhất: quét "toàn bộ lịch sử" là hàng
   * chục nghìn hội thoại, mỗi cái một lượt gọi — không ai chờ nổi. */
  if (tu && den) return { tu, den };
  const g = khoangCua(30);
  return g;
}

async function hoiTienDoHT() {
  const { tu, den } = kyHienTai();
  const d = await req('/api/hoi-thoai?tu=' + tu + '&den=' + den + '&gioiHan=80');
  const hop = $('#htKq');
  if (d.chuaChay) { hop.innerHTML = ''; return; }
  if (d.dangChay) {
    hop.innerHTML = '';
    hop.appendChild(el('div', 'phu', 'Đang đọc hội thoại… ' + (d.dong.slice(-1)[0] || '')));
    $('#btnQuet').disabled = true;
    clearTimeout(henHT); henHT = setTimeout(hoiTienDoHT, 2500);
    return;
  }
  $('#btnQuet').disabled = false;
  if (d.loi) { hop.innerHTML = ''; hop.appendChild(el('div', 'phu', 'Không quét được: ' + d.loi)); return; }
  veHoiThoai(d.kq, d.tenQC || {});
}

function veHoiThoai(r, tenQC) {
  const hop = $('#htKq'); hop.innerHTML = '';
  if (!r) return;
  const ds = Object.entries(r.chuDe).sort((a, b) => b[1] - a[1]);
  /* Nói rõ đã đọc bao nhiêu trên tổng bao nhiêu. Đây là MẪU, không phải toàn
   * bộ — giấu tỉ lệ đó đi thì người đọc tưởng đây là con số tuyệt đối. */
  hop.appendChild(el('div', 'ghi-duoi',
    'Đã đọc ' + so(r.daDoc) + ' / ' + so(r.soHoiThoai) + ' hội thoại trong kỳ (lấy mẫu trải đều) · '
    + so(r.soTinKhach) + ' tin do khách gõ · ' + so(r.soCauHoi) + ' câu hỏi.'));
  if (!ds.length) { hop.appendChild(el('div', 'phu', 'Chưa gom được mối bận tâm nào.')); return; }

  const luoi = el('div', 'ht-ds');
  const max = ds[0][1];
  for (const [ten, n] of ds) {
    const o = el('div', 'ht');
    const h = el('div', 'ht-dau');
    h.appendChild(el('span', 'ht-ten', ten));
    h.appendChild(el('span', 'ht-so', so(n)));
    o.appendChild(h);
    const t = el('div', 'thanh'); const i = el('i');
    i.style.width = Math.max(3, (n / max) * 100) + '%';
    t.appendChild(i); o.appendChild(t);
    for (const v of (r.viDu[ten] || []).slice(0, 3)) {
      const c = el('div', 'ht-cau', '“' + v.cau + '”');
      o.appendChild(c);
    }
    luoi.appendChild(o);
  }
  hop.appendChild(luoi);

  /* Mối lo theo TỪNG QUẢNG CÁO — chỗ biến "khách hay hỏi giá" thành một việc
   * làm được: sửa đúng quảng cáo đang kéo về khách hỏi giá. */
  const qcs = Object.values(r.theoQC || {}).sort((a, b) => b.soHoiThoai - a.soHoiThoai).slice(0, 10);
  if (qcs.length) {
    hop.appendChild(el('div', 'ghi-duoi',
      'Tách theo quảng cáo dẫn khách vào (' + so(r.soQC) + ' quảng cáo có người nhắn):'));
    const t = el('table', 'bang');
    t.innerHTML = '<thead><tr><th>Quảng cáo</th><th class="p">Hội thoại</th><th>Khách lo gì nhất</th></tr></thead>';
    const tb = el('tbody');
    for (const q of qcs) {
      const tr = el('tr');
      const ten = (tenQC && tenQC[q.ad]) || ('Mã ' + String(q.ad).slice(-8));
      const td = el('td');
      td.appendChild(el('span', 'kten', ten));
      td.appendChild(el('span', 'moc', q.kenh));
      tr.appendChild(td);
      tr.appendChild(el('td', 'p manh', so(q.soHoiThoai)));
      const lo = Object.entries(q.chuDe).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const td3 = el('td');
      if (!lo.length) td3.appendChild(el('span', 'moc', 'không ai hỏi gì'));
      for (const [k, n] of lo) {
        const ch = el('span', 'chip');
        ch.appendChild(el('b', null, k));
        ch.appendChild(document.createTextNode(' ' + n));
        td3.appendChild(ch);
      }
      tr.appendChild(td3);
      tb.appendChild(tr);
    }
    t.appendChild(tb); hop.appendChild(t);
  }

  if (r.loi && r.loi.length) hop.appendChild(el('div', 'ghi-duoi', '⚠ ' + r.loi.slice(0, 2).join(' · ')));
}

async function napChanDung() {
  CD = await req('/api/chan-dung');
  veChanDung();
  hoiTienDoHT().catch(() => {});
}

/* ---------------- tra cứu ---------------- */
let henTim = 0;
async function timKiem() {
  const q = $('#oTim').value.trim();
  const p = new URLSearchParams({ q, muc: $('#locMuc').value, coDon: $('#locDon').value, so: '60' });
  const d = await req('/api/tim?' + p);
  $('#soKq').textContent = so(d.tong) + ' hồ sơ' + (d.tong > d.ds.length ? ' — hiện ' + d.ds.length + ' đầu' : '');
  const hop = $('#dsKq'); hop.innerHTML = '';
  if (!d.ds.length) { hop.appendChild(el('div', 'phu', 'Không có hồ sơ nào khớp.')); return; }
  for (const o of d.ds) {
    const b = el('button', 'kq');
    b.appendChild(el('span', 'ten', o.ten || '(chưa có tên)'));
    b.appendChild(el('span', 'tien', o.soDon ? tien(o.doanhThu) : ''));
    const d2 = el('div', 'd2');
    const nhan = el('span', 'nhan ' + lopMuc(o.muc), o.muc);
    d2.appendChild(nhan);
    if (o.sdt) d2.appendChild(el('span', null, '+' + o.sdt));
    if (o.nuoc) d2.appendChild(el('span', null, o.nuoc));
    if (o.nhom) d2.appendChild(el('span', null, o.nhom));
    if (o.soDon) d2.appendChild(el('span', null, o.soDon + ' đơn'));
    b.appendChild(d2);
    b.onclick = () => moHoSo(o.khoa);
    hop.appendChild(b);
  }
}

/* ---------------- hồ sơ một người ---------------- */
async function moHoSo(khoa) {
  const { khach: o } = await req('/api/khach?khoa=' + encodeURIComponent(khoa));
  $('#hsTen').textContent = o.ten || '(chưa có tên)';
  const phu = [];
  if (o.sdt) phu.push('+' + o.sdt);
  if (o.maTw) phu.push(o.maTw);
  $('#hsPhu').textContent = phu.join(' · ');

  const than = $('#hsThan'); than.innerHTML = '';
  const khoi = (ten) => { const k = el('div', 'khoi'); k.appendChild(el('h3', null, ten)); than.appendChild(k); return k; };

  /* 1. ai */
  const k1 = khoi('Hồ sơ');
  const dl = el('dl', 'cap');
  const cap = (a, b) => { if (!b) return; dl.appendChild(el('dt', null, a)); dl.appendChild(el('dd', null, b)); };
  cap('Mức đầy đủ', o.muc);
  cap('Giới tính', o.gioi);
  cap('Quốc gia', o.nuoc);
  cap('Nhóm', o.nhom);
  cap('Hạng', o.hang);
  cap('Kênh', (o.kenh || []).join(', '));
  cap('Sales', (o.sales || []).join(', '));
  k1.appendChild(dl);
  if (o.thieu && o.thieu.length) k1.appendChild(el('div', 'thieu', 'Còn thiếu: ' + o.thieu.join(', ')));

  /* 2. nhu cầu */
  if (o.nhuCau && o.nhuCau.tour && o.nhuCau.tour.length) {
    const k2 = khoi('Đã mua gì');
    const h = el('div');
    veThanh(h, o.nhuCau.tour.map((t) => [t.ten, t.so]), { tran: 10 });
    k2.appendChild(h);
  }

  /* 3. hành trình */
  const k3 = khoi('Hành trình');
  const mo = el('div', 'mo');
  const dong = (khi, gi) => {
    const r = el('div', 'moc-dong');
    r.appendChild(el('div', 'cham'));
    const n = el('div', 'noi');
    n.appendChild(el('div', 'khi', khi));
    n.appendChild(el('div', 'gi', gi));
    r.appendChild(n); mo.appendChild(r);
  };
  if (!o.don.length) dong('—', 'Chưa có đơn nào. ' + (o.sdt ? 'Có số nhưng chưa mua.' : 'Chỉ mới biết tên.'));
  for (const d of o.don) {
    const ngay = (d.luc || '').slice(0, 10).split('-').reverse().join('/');
    const dv = (d.dichVu || []).map((s) => s.ten).filter(Boolean).join(' · ') || d.ma;
    const di = (d.dichVu || []).map((s) => s.di).filter(Boolean)[0];
    dong(ngay + (d.nguon ? ' · ' + d.nguon : ''),
      dv + (d.tien ? '  —  ' + tien(d.tien) : '') + (di ? '\nKhởi hành ' + di.slice(0, 10).split('-').reverse().join('/') : ''));
  }
  k3.appendChild(mo);

  $('#ngan').hidden = false;
}

/* ---------------- kéo lại ---------------- */
let henTd = 0;
async function theoDoiKeo() {
  const d = await req('/api/tien-do');
  $('#tienDo').hidden = !d.dangChay && !d.dong.length;
  $('#tdLog').textContent = d.dong.join('\n');
  $('#tdPhu').textContent = d.dangChay ? 'đang chạy…' : (d.loi ? 'hỏng: ' + d.loi : 'xong');
  $('#btnKeo').disabled = d.dangChay;
  if (d.dangChay) { clearTimeout(henTd); henTd = setTimeout(theoDoiKeo, 2000); }
  else { await nap(); }
}

async function nap() {
  const g = { tu: $('#kyTu').value, den: $('#kyDen').value };
  const q = new URLSearchParams({ tu: g.tu, den: g.den, theo: THEO });
  const d = await req('/api/tong-quan?' + q);
  veSegKy();
  const nhan = (KY.find((x) => x.k === KY_DANG) || {}).ten || 'khoảng tự chọn';
  $('#ghiKy').textContent = (g.tu || g.den)
    ? nhan + ': ' + (g.tu || '…') + ' → ' + (g.den || '…')
      + ' · tính theo ' + (THEO === 'di' ? 'ngày khởi hành' : 'ngày đặt')
      + (d.truoc ? ' · so với ' + d.truoc.ky.tu + ' → ' + d.truoc.ky.den : '')
    : 'Toàn bộ lịch sử · tính theo ' + (THEO === 'di' ? 'ngày khởi hành' : 'ngày đặt');
  $('#mocKeo').textContent = d.luc
    ? 'kéo lúc ' + new Date(d.luc).toLocaleString('vi-VN')
    : (d.loi || 'chưa có dữ liệu');
  if (!d.tq) return;
  TQ = d.tq;
  MKT = d.mkt;
  TRUOC = d.truoc || null;
  if (!MKT) return;
  veTongQuan();
  napQuangCao().catch(() => {});
  napGia().catch(() => {});
  napSocial().catch(() => {});
  napTacNghiep().catch(() => {});
  if ($('#man-ban-do').classList.contains('dang')) veBanDo();
}

/* ---------------- khởi động ---------------- */
document.querySelectorAll('.tab').forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('dang', x === t));
    const id = t.dataset.tab;
    document.querySelectorAll('.man').forEach((m) => m.classList.toggle('dang', m.id === 'man-' + id));
    if (id === 'ban-do') veBanDo();
    if (id === 'chan-dung') napChanDung();
    if (id === 'tra-cuu') { $('#oTim').focus(); timKiem(); }
  };
});
document.querySelectorAll('#segNhanh button').forEach((b) => {
  b.onclick = () => {
    NHANH = b.dataset.nhanh;
    document.querySelectorAll('#segNhanh button').forEach((x) => x.classList.toggle('dang', x === b));
    veChanDung();
  };
});
$('#btnQuet').onclick = async () => {
  const { tu, den } = kyHienTai();
  $('#btnQuet').disabled = true;
  await req('/api/hoi-thoai?tu=' + tu + '&den=' + den + '&gioiHan=80', { method: 'POST' });
  hoiTienDoHT();
};
$('#oTim').oninput = () => { clearTimeout(henTim); henTim = setTimeout(timKiem, 220); };
$('#locMuc').onchange = timKiem;
$('#locDon').onchange = timKiem;
$('#hsDong').onclick = () => { $('#ngan').hidden = true; };
$('.ngan-nen').onclick = () => { $('#ngan').hidden = true; };
$('#btnKeo').onclick = async () => {
  $('#btnKeo').disabled = true;
  await req('/api/keo', { method: 'POST' });
  theoDoiKeo();
};

document.querySelectorAll('#segTheo button').forEach((b) => {
  b.onclick = () => {
    THEO = b.dataset.theo;
    document.querySelectorAll('#segTheo button').forEach((x) => x.classList.toggle('dang', x === b));
    nap();
  };
});
$('#kyTu').onchange = () => { KY_DANG = 'tuy'; nap(); };
$('#kyDen').onchange = () => { KY_DANG = 'tuy'; nap(); };

/* Mở ra là "Tháng này" — mốc hay dùng nhất, và cũng là mốc app Quảng cáo mở
 * mặc định, nên hai bên nhìn cùng một khoảng. */
{ const g = khoangCua('thang'); $('#kyTu').value = g.tu; $('#kyDen').value = g.den; }

/* Nhãn "bản local" chỉ đúng khi chạy một mình — trong Hub thì nó nói sai. */
req('/api/boi-canh').then((b) => {
  const n = document.querySelector('.nhan-local');
  if (!n) return;
  if (b.trongHub) n.remove();
}).catch(() => {});

nap().catch((e) => { $('#mocKeo').textContent = 'lỗi: ' + e.message; });
theoDoiKeo().catch(() => {});
