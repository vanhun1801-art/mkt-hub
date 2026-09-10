/* Bộ vẽ biểu đồ SVG tự viết — không thư viện ngoài, không cần mạng. */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

/* Màu khung biểu đồ lấy từ biến CSS -> tự đổi khi sang chế độ tối.
   Không dùng var() trong presentation attribute của SVG vì trình duyệt không
   giải nó ở đó, nên phải đọc giá trị đã tính ra rồi truyền vào attribute. */
function mau(ten, duPhong) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(ten).trim();
    return v || duPhong;
  } catch (e) { return duPhong; }
}
const KHUNG = () => ({
  luoi: mau('--line-soft', '#eef1f6'),
  nhan: mau('--ink-3', '#8b95a7'),
  chu: mau('--ink', '#1a2233'),
  chu2: mau('--ink-2', '#5b6779'),
  ray: mau('--panel-2', '#f2f5fa'),
  do: mau('--bad', '#dc2b3d'),
});

  const PALETTE = ['#2b5cff', '#12a150', '#d98300', '#7a3cff', '#dc2b3d', '#0aa3b0', '#8b95a7'];
  /* Màu nền tảng đọc từ CSS: chế độ tối phải đổi (TikTok đen tuyền sẽ tàng hình
     trên thẻ tối) nên --fb/--tt/--gg có hai giá trị sáng/tối trong styles.css. */
  const platformColor = () => ({
    Facebook: mau('--fb', '#1877f2'),
    TikTok: mau('--tt', '#111827'),
    Instagram: mau('--ig', '#d62976'),
    'Zalo OA': mau('--za', '#0068ff'),
    Douyin: mau('--dy', '#7a3cff'),
    Xiaohongshu: mau('--xhs', '#ff2442'),
    'Google Ads': mau('--gg', '#ea9c1b'),
    '(chưa gán)': KHUNG().nhan,
    '(không rõ)': KHUNG().nhan,
  });
  const colorFor = (name, i) => platformColor()[name] || PALETTE[i % PALETTE.length];

  function el(tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  /**
   * viewBox khớp đúng số pixel thật của vùng chứa (tỉ lệ 1:1) nên chữ và nét
   * không bị bóp méo — quan trọng vì host rộng bao nhiêu là tuỳ layout.
   */
  function svgRoot(w, h) {
    const s = el('svg', { viewBox: `0 0 ${w} ${h}`, class: 'chart', width: w, height: h });
    s.style.maxWidth = '100%';
    return s;
  }

  /** Chiều rộng thật của vùng chứa, có mức tối thiểu để không vỡ chữ. */
  const hostWidth = (host, min = 340) => Math.max(min, Math.floor(host.clientWidth || host.parentElement?.clientWidth || 900));

  const shortNum = (v) => {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'tr';
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
    return String(Math.round(v));
  };
  const dayLabel = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
  /** Cắt nhãn cho vừa số ký tự khả dụng (SVG không tự wrap/ellipsis). */
  const clip = (s, max) => (max >= 4 && String(s).length > max ? String(s).slice(0, max - 1) + '…' : String(s));

  /** Trục + lưới dùng chung. */
  function frame(svg, box, maxY, xLabels, opts = {}) {
    const { x, y, w, h } = box;
    const ticks = opts.ticks || 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (maxY / ticks) * i;
      const yy = y + h - (h / ticks) * i;
      svg.appendChild(el('line', { x1: x, y1: yy, x2: x + w, y2: yy, stroke: KHUNG().luoi, 'stroke-width': 1 }));
      svg.appendChild(el('text', {
        x: x - 8, y: yy + 4, 'text-anchor': 'end', fill: KHUNG().nhan, 'font-size': 10.5,
      }, opts.fmtY ? opts.fmtY(v) : shortNum(v)));
    }
    const step = w / Math.max(1, xLabels.length);
    const every = Math.ceil(xLabels.length / (opts.maxXLabels || 14));
    xLabels.forEach((lb, i) => {
      if (i % every) return;
      svg.appendChild(el('text', {
        x: x + step * (i + 0.5), y: y + h + 15, 'text-anchor': 'middle', fill: KHUNG().nhan, 'font-size': 10.5,
      }, lb));
    });
  }

  /**
   * Biểu đồ cột xếp lớp theo ngày + đường phụ (vd CPA) trên trục phải.
   * series: [{ key, color }], rows: [{ date, [key]: number, _line: number }]
   */
  function stackedBars(host, rows, keys, opts = {}) {
    host.innerHTML = '';
    if (!rows.length) { host.innerHTML = '<div class="empty">Không có dữ liệu trong khoảng đã chọn</div>'; return; }
    const H = opts.height || 260;
    const W = hostWidth(host);
    const box = { x: 52, y: 12, w: W - 52 - (opts.lineKey ? 54 : 14), h: H - 46 };
    const svg = svgRoot(W, H);

    const totals = rows.map((r) => keys.reduce((s, k) => s + (r[k] || 0), 0));
    const maxY = Math.max(1, ...totals) * 1.12;
    frame(svg, box, maxY, rows.map((r) => dayLabel(r.date)), { fmtY: opts.fmtY, maxXLabels: opts.maxXLabels });

    const step = box.w / rows.length;
    const bw = Math.max(3, Math.min(34, step * 0.62));
    rows.forEach((r, i) => {
      let acc = 0;
      keys.forEach((k, ki) => {
        const v = r[k] || 0;
        if (v <= 0) return;
        const hh = (v / maxY) * box.h;
        const yy = box.y + box.h - (acc / maxY) * box.h - hh;
        const rect = el('rect', {
          x: box.x + step * (i + 0.5) - bw / 2, y: yy, width: bw, height: Math.max(1, hh),
          fill: colorFor(k, ki), rx: 2,
        });
        rect.appendChild(el('title', {}, `${dayLabel(r.date)} · ${k}: ${(opts.fmtTip || shortNum)(v)}`));
        svg.appendChild(rect);
        acc += v;
      });
    });

    if (opts.lineKey) {
      const vals = rows.map((r) => r[opts.lineKey] || 0);
      const maxL = Math.max(1, ...vals) * 1.15;
      const pts = vals.map((v, i) => [box.x + step * (i + 0.5), box.y + box.h - (v / maxL) * box.h]);
      svg.appendChild(el('polyline', {
        points: pts.map((p) => p.join(',')).join(' '), fill: 'none',
        stroke: opts.lineColor || KHUNG().do, 'stroke-width': 2, 'stroke-linejoin': 'round',
      }));
      pts.forEach((p, i) => {
        const c = el('circle', { cx: p[0], cy: p[1], r: 2.6, fill: opts.lineColor || KHUNG().do });
        c.appendChild(el('title', {}, `${dayLabel(rows[i].date)} · ${opts.lineLabel || opts.lineKey}: ${(opts.fmtLine || shortNum)(vals[i])}`));
        svg.appendChild(c);
      });
      for (let i = 0; i <= 4; i++) {
        const v = (maxL / 4) * i;
        svg.appendChild(el('text', {
          x: box.x + box.w + 8, y: box.y + box.h - (box.h / 4) * i + 4,
          fill: opts.lineColor || KHUNG().do, 'font-size': 10.5,
        }, (opts.fmtLine || shortNum)(v)));
      }
    }
    host.appendChild(svg);
  }

  /** Nhiều đường trên cùng một trục. */
  function lines(host, rows, series, opts = {}) {
    host.innerHTML = '';
    if (!rows.length) { host.innerHTML = '<div class="empty">Không có dữ liệu</div>'; return; }
    const H = opts.height || 240;
    const W = hostWidth(host);
    const box = { x: 52, y: 12, w: W - 66, h: H - 46 };
    const svg = svgRoot(W, H);
    const maxY = Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.key] || 0))) * 1.15;
    frame(svg, box, maxY, rows.map((r) => dayLabel(r.date)), { fmtY: opts.fmtY, maxXLabels: opts.maxXLabels });
    const step = box.w / rows.length;
    series.forEach((s, si) => {
      const pts = rows.map((r, i) => [box.x + step * (i + 0.5), box.y + box.h - ((r[s.key] || 0) / maxY) * box.h]);
      svg.appendChild(el('polyline', {
        points: pts.map((p) => p.join(',')).join(' '), fill: 'none',
        stroke: s.color || colorFor(s.key, si), 'stroke-width': 2.2, 'stroke-linejoin': 'round',
      }));
      pts.forEach((p, i) => {
        const c = el('circle', { cx: p[0], cy: p[1], r: 2.6, fill: s.color || colorFor(s.key, si) });
        c.appendChild(el('title', {}, `${dayLabel(rows[i].date)} · ${s.label || s.key}: ${(opts.fmtTip || shortNum)(rows[i][s.key] || 0)}`));
        svg.appendChild(c);
      });
    });
    host.appendChild(svg);
  }

  /** Cột ngang so sánh (dùng cho CPA theo chiến dịch / nền tảng). */
  function hbars(host, items, opts = {}) {
    host.innerHTML = '';
    if (!items.length) { host.innerHTML = '<div class="empty">Không có dữ liệu</div>'; return; }
    const rowH = opts.rowH || 30;
    const W = hostWidth(host);
    const H = items.length * rowH + 20;
    const labelW = Math.min(opts.labelW || 300, Math.round(W * 0.42));
    const svg = svgRoot(W, H);
    const max = Math.max(1, ...items.map((i) => i.value), opts.marker || 0) * 1.1;
    const barW = W - labelW - 90;
    items.forEach((it, i) => {
      const y = 10 + i * rowH;
      svg.appendChild(el('text', { x: 0, y: y + rowH / 2 + 4, fill: KHUNG().chu2, 'font-size': 12 },
        clip(it.label, Math.floor(labelW / 6.2))));
      svg.appendChild(el('rect', { x: labelW, y: y + 5, width: barW, height: rowH - 14, fill: KHUNG().ray, rx: 4 }));
      const w = Math.max(2, (it.value / max) * barW);
      const rect = el('rect', { x: labelW, y: y + 5, width: w, height: rowH - 14, fill: it.color || colorFor(it.label, i), rx: 4 });
      rect.appendChild(el('title', {}, `${it.label}: ${(opts.fmt || shortNum)(it.value)}`));
      svg.appendChild(rect);
      svg.appendChild(el('text', {
        x: labelW + barW + 8, y: y + rowH / 2 + 4, fill: KHUNG().chu, 'font-size': 12, 'font-weight': 600,
      }, (opts.fmt || shortNum)(it.value)));
    });
    if (opts.marker) {
      const x = labelW + (opts.marker / max) * barW;
      svg.appendChild(el('line', { x1: x, y1: 4, x2: x, y2: H - 6, stroke: KHUNG().do, 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }));
    }
    host.appendChild(svg);
  }

  /** Vòng tròn tỉ trọng. */
  function donut(host, items, opts = {}) {
    host.innerHTML = '';
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total) { host.innerHTML = '<div class="empty">Không có dữ liệu</div>'; return; }
    const size = Math.min(opts.size || 190, hostWidth(host, 150));
    const svg = svgRoot(size, size);
    const cx = size / 2, cy = size / 2, r = size / 2 - 8, ir = r * 0.6;
    let ang = -Math.PI / 2;
    items.forEach((it, i) => {
      const a = (it.value / total) * Math.PI * 2;
      const [x1, y1] = [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
      const [x2, y2] = [cx + r * Math.cos(ang + a), cy + r * Math.sin(ang + a)];
      const [x3, y3] = [cx + ir * Math.cos(ang + a), cy + ir * Math.sin(ang + a)];
      const [x4, y4] = [cx + ir * Math.cos(ang), cy + ir * Math.sin(ang)];
      const large = a > Math.PI ? 1 : 0;
      const path = el('path', {
        d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${ir} ${ir} 0 ${large} 0 ${x4} ${y4} Z`,
        fill: it.color || colorFor(it.label, i),
      });
      path.appendChild(el('title', {}, `${it.label}: ${(opts.fmt || shortNum)(it.value)} (${Math.round((it.value / total) * 100)}%)`));
      svg.appendChild(path);
      ang += a;
    });
    svg.appendChild(el('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', fill: KHUNG().chu, 'font-size': 15, 'font-weight': 700 },
      (opts.fmt || shortNum)(total)));
    svg.appendChild(el('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', fill: KHUNG().nhan, 'font-size': 10.5 }, opts.centerLabel || 'Tổng'));
    host.appendChild(svg);
  }

  global.Charts = { stackedBars, lines, hbars, donut, colorFor, shortNum, dayLabel, platformColor };
})(window);
