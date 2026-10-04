'use strict';
/**
 * ============================================================================
 * BIỂU ĐỒ — SVG thuần, không thêm thư viện nào
 * ============================================================================
 * Anh Hùng 04/10/2026: "cái nào trình bày bằng biểu đồ dễ hiểu hơn thì trình
 * bày". Chỉ đổi những chỗ biểu đồ THẬT SỰ đọc nhanh hơn:
 *
 *   doanh thu theo ngày   → ĐƯỜNG. Một bảng 30 dòng số thì không ai đọc; một
 *                           đường thì nhìn phát thấy hôm nào tụt.
 *   sắp khởi hành / đặt trước → CỘT. So chiều cao nhanh hơn so chữ số.
 *   tỉnh thành            → THANH NGANG, vì tên tỉnh dài, cột đứng sẽ chồng chữ.
 *
 * KHÔNG đổi: ô số lớn ở đầu trang (một con số + mức thay đổi thì tấm thẻ đọc
 * nhanh hơn mọi biểu đồ), và các BẢNG nhiều cột (kênh, quảng cáo) — bảng chở
 * được bốn con số một dòng, biểu đồ thì không.
 *
 * Màu: đã chạy qua bộ kiểm của nhà (lightness band, chroma, tách màu cho người
 * mù màu, tương phản nền) — sáng #289683/#eb6834, tối #2f9f87/#dd6f3a, đạt cả
 * năm phép. Một chuỗi thì một màu và không cần chú giải; tiêu đề đã nói nó là
 * gì rồi.
 */

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (t, a) => {
  const o = document.createElementNS(SVGNS, t);
  for (const k in a) if (a[k] != null) o.setAttribute(k, a[k]);
  return o;
};
const toiMau = () => matchMedia('(prefers-color-scheme: dark)').matches
  && document.documentElement.dataset.theme !== 'light';
const MAU = () => (toiMau()
  ? { ch: '#2f9f87', ph: '#dd6f3a', luoi: '#2d343a', chu: '#a7aeb6', nen: '#1b1f23' }
  : { ch: '#289683', ph: '#eb6834', luoi: '#e3e6ea', chu: '#596069', nen: '#ffffff' });

/** Mẹo chung: một ô chữ nổi theo con trỏ. */
function ganMach(hop) {
  let o = hop.querySelector('.bd-mach');
  if (!o) {
    o = document.createElement('div');
    o.className = 'bd-mach';
    o.hidden = true;
    hop.appendChild(o);
  }
  return o;
}

/**
 * ĐƯỜNG — doanh thu theo ngày.
 * @param ds [{nhan, giaTri, phu}]
 */
function veDuong(hop, ds, { dinhDang = (v) => v, cao = 130 } = {}) {
  hop.innerHTML = '';
  if (!ds.length) { hop.appendChild(Object.assign(document.createElement('div'), { className: 'phu', textContent: 'Chưa có dữ liệu.' })); return; }
  const m = MAU();
  const W = 1000, H = cao, L = 8, R = 8, T = 10, B = 14;
  const max = Math.max(...ds.map((d) => d.giaTri), 1);
  const x = (i) => L + (ds.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (ds.length - 1));
  const y = (v) => T + (1 - v / max) * (H - T - B);

  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bd', preserveAspectRatio: 'none' });
  /* Lưới mờ, lùi về sau — nó là chỗ dựa để đọc, không phải nội dung. */
  for (let i = 0; i <= 3; i++) {
    const yy = T + (i / 3) * (H - T - B);
    s.appendChild(sv('line', { x1: L, x2: W - R, y1: yy, y2: yy, stroke: m.luoi, 'stroke-width': 1 }));
  }
  const dChuoi = ds.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(d.giaTri).toFixed(1)).join(' ');
  /* Vùng tô nhạt dưới đường: một chuỗi thì vùng tô giúp thấy khối lượng, mà
   * không gây hiểu nhầm như khi có nhiều chuỗi chồng nhau. */
  const vung = dChuoi + ` L ${x(ds.length - 1).toFixed(1)} ${H - B} L ${x(0).toFixed(1)} ${H - B} Z`;
  s.appendChild(sv('path', { d: vung, fill: m.ch, opacity: '.12' }));
  s.appendChild(sv('path', { d: dChuoi, fill: 'none', stroke: m.ch, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  /* Nhãn trực tiếp ở điểm CAO NHẤT — không ghi số lên mọi điểm. */
  const iMax = ds.reduce((b, d, i) => (d.giaTri > ds[b].giaTri ? i : b), 0);
  s.appendChild(sv('circle', { cx: x(iMax), cy: y(ds[iMax].giaTri), r: 4, fill: m.ch, stroke: m.nen, 'stroke-width': 2 }));

  const mach = ganMach(hop);
  const vach = sv('line', { y1: T, y2: H - B, stroke: m.chu, 'stroke-width': 1, opacity: '0' });
  s.appendChild(vach);
  const cham = sv('circle', { r: 4.5, fill: m.ch, stroke: m.nen, 'stroke-width': 2, opacity: '0' });
  s.appendChild(cham);
  s.addEventListener('pointermove', (e) => {
    const r = s.getBoundingClientRect();
    const i = Math.max(0, Math.min(ds.length - 1,
      Math.round(((e.clientX - r.left) / r.width * W - L) / ((W - L - R) / Math.max(1, ds.length - 1)))));
    vach.setAttribute('x1', x(i)); vach.setAttribute('x2', x(i)); vach.setAttribute('opacity', '.35');
    cham.setAttribute('cx', x(i)); cham.setAttribute('cy', y(ds[i].giaTri)); cham.setAttribute('opacity', '1');
    mach.hidden = false;
    mach.textContent = ds[i].nhan + ': ' + dinhDang(ds[i].giaTri) + (ds[i].phu ? ' · ' + ds[i].phu : '');
    mach.style.left = Math.min(r.width - 150, Math.max(0, (e.clientX - r.left) - 70)) + 'px';
  });
  s.addEventListener('pointerleave', () => {
    vach.setAttribute('opacity', '0'); cham.setAttribute('opacity', '0'); mach.hidden = true;
  });
  hop.appendChild(s);

  const truc = document.createElement('div');
  truc.className = 'bd-truc';
  truc.innerHTML = '<span>' + ds[0].nhan + '</span><span>' + dinhDang(max) + ' cao nhất</span><span>'
    + ds[ds.length - 1].nhan + '</span>';
  hop.appendChild(truc);
}

/** CỘT — so chiều cao, dùng cho mùa đi và khoảng đặt trước. */
function veCot(hop, ds, { dinhDang = (v) => v, cao = 110 } = {}) {
  hop.innerHTML = '';
  if (!ds.length) { hop.appendChild(Object.assign(document.createElement('div'), { className: 'phu', textContent: 'Chưa có dữ liệu.' })); return; }
  const m = MAU();
  const W = 1000, H = cao, T = 10, B = 12;
  const max = Math.max(...ds.map((d) => d.giaTri), 1);
  const bRong = (W / ds.length);
  /* Khe 2px giữa các cột — quy cách của nhà, để hai cột cạnh nhau không dính
   * thành một khối. */
  const w = Math.max(6, bRong - 6);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bd', preserveAspectRatio: 'none' });
  const mach = ganMach(hop);
  ds.forEach((d, i) => {
    const h = Math.max(2, (d.giaTri / max) * (H - T - B));
    const x = i * bRong + (bRong - w) / 2;
    const r = sv('rect', { x, y: H - B - h, width: w, height: h, rx: 4, fill: m.ch, opacity: '.9' });
    r.addEventListener('pointerenter', (e) => {
      r.setAttribute('opacity', '1');
      mach.hidden = false;
      mach.textContent = d.nhan + ': ' + dinhDang(d.giaTri);
      const bb = hop.getBoundingClientRect();
      mach.style.left = Math.min(bb.width - 150, Math.max(0, (e.clientX - bb.left) - 70)) + 'px';
    });
    r.addEventListener('pointerleave', () => { r.setAttribute('opacity', '.9'); mach.hidden = true; });
    s.appendChild(r);
  });
  hop.appendChild(s);
  const nhan = document.createElement('div');
  nhan.className = 'bd-nhan';
  nhan.style.gridTemplateColumns = 'repeat(' + ds.length + ', 1fr)';
  for (const d of ds) {
    const o = document.createElement('span');
    o.textContent = d.nhan;
    o.title = d.nhan + ': ' + dinhDang(d.giaTri);
    nhan.appendChild(o);
  }
  hop.appendChild(nhan);
}

window.BD = { veDuong, veCot, MAU };
