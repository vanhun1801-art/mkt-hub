'use strict';
/*
 * Dựng báo cáo tổng quan dạng HTML — mở ra xem được, bấm In là ra PDF.
 * Không dùng thư viện ngoài; mọi thứ nội tuyến để gửi qua Lark/email được.
 */
const cfg = require('./config');

const CLOSED = ['Hoàn thành', 'Hủy'];
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ngay = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN');
};

function conLai(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

const dongLai = (t) => CLOSED.includes(t.status);
const quaHan = (t) => !dongLai(t) && conLai(t.deadline) != null && conLai(t.deadline) < 0;

/** Thanh ngang đơn giản bằng div, in ra PDF vẫn giữ. */
function thanh(n, max, mau) {
  const w = max > 0 ? Math.round((n / max) * 100) : 0;
  return '<span class="bar"><i style="width:' + w + '%;background:' + mau + '"></i></span>';
}

function dungBaoCao(tasks, opt = {}) {
  const all = tasks;
  const open = all.filter((t) => !dongLai(t));
  const done = all.filter((t) => t.status === 'Hoàn thành');
  const scored = all.filter((t) => t.rating);
  const overdue = open.filter(quaHan);
  const unassigned = open.filter((t) => !(t.owner || []).length);
  const doing = open.filter((t) => t.status === 'Đang tiến hành' || t.status === 'Làm lại');

  const diem = scored.length
    ? (scored.reduce((s, t) => s + t.rating, 0) / scored.length).toFixed(2) : '—';
  const tyLe = all.length ? Math.round(done.length / all.length * 100) : 0;

  /* ---- theo nhân sự ---- */
  const nguoi = new Map();
  for (const t of all) {
    for (const u of (t.owner || [])) {
      if (!nguoi.has(u.id)) nguoi.set(u.id, { ten: u.name, mo: 0, tre: 0, xong: 0, cham: [], lamLai: 0 });
      const g = nguoi.get(u.id);
      if (!dongLai(t)) { g.mo++; if (quaHan(t) || t.status === 'Trễ deadline') g.tre++; if (t.status === 'Làm lại') g.lamLai++; }
      if (t.status === 'Hoàn thành') g.xong++;
      if (t.rating) g.cham.push(t.rating);
    }
  }
  const dsNguoi = [...nguoi.values()]
    .filter((g) => g.mo > 0 || g.xong > 0)
    .sort((a, b) => b.mo - a.mo || b.tre - a.tre);
  const maxMo = Math.max(1, ...dsNguoi.map((g) => g.mo));

  /* ---- phân bổ ---- */
  const gom = (key) => {
    const m = new Map();
    for (const t of open) {
      const k = t[key] || '(chưa điền)';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const theoLoai = gom('workType');
  const theoCd = gom('campaign');

  /* ---- danh sách cần chú ý ---- */
  const sapXep = (ds) => ds.slice().sort((a, b) => {
    const x = conLai(a.deadline), y = conLai(b.deadline);
    return (x == null ? 9999 : x) - (y == null ? 9999 : y);
  });

  const hangTre = sapXep(overdue).slice(0, 25).map((t) => `
    <tr>
      <td>${esc(t.title || '(chưa có tên)')}</td>
      <td>${esc((t.owner || []).map((u) => u.name).join(', ') || '—')}</td>
      <td>${esc(t.workType || '—')}</td>
      <td class="r">${ngay(t.deadline)}</td>
      <td class="r do">${Math.abs(conLai(t.deadline) || 0)} ngày</td>
    </tr>`).join('');

  const hangChuaGiao = sapXep(unassigned).slice(0, 15).map((t) => `
    <tr>
      <td>${esc(t.title || '(chưa có tên)')}</td>
      <td>${esc((t.requester || []).map((u) => u.name).join(', ') || '—')}</td>
      <td class="r">${ngay(t.deadline)}</td>
    </tr>`).join('');

  const kyBaoCao = (opt.tuNgay && opt.denNgay)
    ? esc(opt.tuNgay) + ' → ' + esc(opt.denNgay)
    : 'Toàn bộ dữ liệu';

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Báo cáo công việc · Phòng Marketing Rooty Trip</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#f2f4f7;color:#1a1d21;
    font:14px/1.6 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .page{max-width:1000px;margin:0 auto;padding:28px 24px 60px}
  .hd{display:flex;align-items:flex-start;gap:16px;padding-bottom:20px;border-bottom:2px solid #1a1d21;margin-bottom:24px}
  .hd h1{margin:0;font-size:25px;font-weight:700;letter-spacing:-.02em}
  .hd .sub{color:#5b636e;font-size:13px;margin-top:5px}
  .hd .meta{margin-left:auto;text-align:right;font-size:12px;color:#5b636e;line-height:1.7}

  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;margin-bottom:26px}
  .k{background:#fff;border:1px solid #dfe3e8;border-top:3px solid #9aa3ad;border-radius:9px;padding:13px 15px}
  .k b{display:block;font-size:27px;font-weight:700;line-height:1.15;letter-spacing:-.025em}
  .k span{font-size:12px;color:#5b636e}
  .k.do{border-top-color:#b3261e} .k.do b{color:#b3261e}
  .k.cam{border-top-color:#98510a} .k.cam b{color:#98510a}
  .k.luc{border-top-color:#066e48} .k.luc b{color:#066e48}
  .k.lam{border-top-color:#1b4ea6} .k.lam b{color:#1b4ea6}

  h2{font-size:16px;font-weight:700;margin:28px 0 12px;padding-left:10px;border-left:3px solid #1b4ea6}
  .box{background:#fff;border:1px solid #dfe3e8;border-radius:9px;overflow:hidden}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#5b636e;
     font-weight:700;padding:9px 12px;border-bottom:1px solid #dfe3e8;background:#f7f8fa}
  td{padding:9px 12px;border-bottom:1px solid #eef1f4;vertical-align:middle}
  tr:last-child td{border-bottom:0}
  td.r,th.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  td.do{color:#b3261e;font-weight:600}
  td.name{font-weight:600;white-space:nowrap}

  .bar{display:block;height:5px;background:#eef1f4;border-radius:3px;overflow:hidden;min-width:70px;margin-top:4px}
  .bar i{display:block;height:100%;border-radius:3px}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .empty{padding:18px;text-align:center;color:#5b636e;font-size:13px}
  .note{font-size:12px;color:#5b636e;margin-top:8px}
  .ft{margin-top:34px;padding-top:14px;border-top:1px solid #dfe3e8;font-size:11.5px;color:#79828d}

  .noprint{position:fixed;right:18px;bottom:18px;display:flex;gap:8px}
  .noprint button{font:inherit;font-size:13px;font-weight:600;padding:10px 16px;border-radius:8px;
    border:0;background:#1b4ea6;color:#fff;cursor:pointer;box-shadow:0 2px 10px rgba(27,78,166,.3)}
  @media print{
    body{background:#fff}
    .page{max-width:none;padding:0}
    .noprint{display:none}
    h2{break-after:avoid}
    .box,tr{break-inside:avoid}
    @page{margin:14mm}
  }
</style></head><body>
<div class="page">

  <div class="hd">
    <div>
      <h1>Báo cáo công việc</h1>
      <div class="sub">Phòng Marketing · Rooty Trip · Bảng Tracking</div>
    </div>
    <div class="meta">
      Kỳ báo cáo: <b>${kyBaoCao}</b><br>
      Xuất lúc: ${new Date().toLocaleString('vi-VN')}<br>
      ${opt.nguoiXuat ? 'Người xuất: ' + esc(opt.nguoiXuat) : ''}
    </div>
  </div>

  <div class="kpis">
    <div class="k"><b>${all.length}</b><span>Tổng công việc</span></div>
    <div class="k lam"><b>${open.length}</b><span>Đang mở</span></div>
    <div class="k lam"><b>${doing.length}</b><span>Đang tiến hành</span></div>
    <div class="k do"><b>${overdue.length}</b><span>Quá hạn</span></div>
    <div class="k cam"><b>${unassigned.length}</b><span>Chưa phân công</span></div>
    <div class="k luc"><b>${diem}</b><span>Điểm TB · ${scored.length} việc</span></div>
    <div class="k"><b>${tyLe}%</b><span>Tỉ lệ hoàn thành</span></div>
  </div>

  <h2>Tải việc theo nhân sự</h2>
  <div class="box">
    ${dsNguoi.length ? `<table>
      <thead><tr>
        <th>Nhân sự</th><th class="r">Đang mở</th><th class="r">Trễ</th>
        <th class="r">Làm lại</th><th class="r">Hoàn thành</th><th class="r">Điểm TB</th>
      </tr></thead>
      <tbody>${dsNguoi.map((g) => `
        <tr>
          <td class="name">${esc(g.ten)}</td>
          <td class="r">${g.mo}${thanh(g.mo, maxMo, g.tre ? '#b3261e' : '#1b4ea6')}</td>
          <td class="r${g.tre ? ' do' : ''}">${g.tre}</td>
          <td class="r">${g.lamLai}</td>
          <td class="r">${g.xong}</td>
          <td class="r">${g.cham.length ? (g.cham.reduce((a, b) => a + b, 0) / g.cham.length).toFixed(2) + ' <small>/' + g.cham.length + '</small>' : '—'}</td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">Chưa có dữ liệu.</div>'}
  </div>

  <h2>Việc quá hạn — cần xử lý ngay</h2>
  <div class="box">
    ${hangTre ? `<table>
      <thead><tr><th>Công việc</th><th>Phụ trách</th><th>Loại việc</th><th class="r">Hạn</th><th class="r">Trễ</th></tr></thead>
      <tbody>${hangTre}</tbody></table>` : '<div class="empty">Không có việc nào quá hạn.</div>'}
  </div>
  ${overdue.length > 25 ? `<div class="note">Hiển thị 25 / ${overdue.length} việc quá hạn, sắp theo mức trễ nhiều nhất.</div>` : ''}

  <h2>Chưa phân công</h2>
  <div class="box">
    ${hangChuaGiao ? `<table>
      <thead><tr><th>Công việc</th><th>Người order</th><th class="r">Hạn</th></tr></thead>
      <tbody>${hangChuaGiao}</tbody></table>` : '<div class="empty">Mọi việc đều đã có người phụ trách.</div>'}
  </div>

  <h2>Phân bổ việc đang mở</h2>
  <div class="two">
    <div class="box">
      <table><thead><tr><th>Loại công việc</th><th class="r">Số việc</th></tr></thead>
      <tbody>${theoLoai.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="r">${n}${thanh(n, theoLoai[0] ? theoLoai[0][1] : 1, '#1b4ea6')}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">—</td></tr>'}</tbody></table>
    </div>
    <div class="box">
      <table><thead><tr><th>Chiến dịch</th><th class="r">Số việc</th></tr></thead>
      <tbody>${theoCd.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="r">${n}${thanh(n, theoCd[0] ? theoCd[0][1] : 1, '#066e48')}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">—</td></tr>'}</tbody></table>
    </div>
  </div>

  <div class="ft">
    Báo cáo tạo tự động từ Lark Base “Tracking”. Số liệu tính tại thời điểm xuất.
    “Quá hạn” = deadline đã qua và việc chưa Hoàn thành/Hủy.
  </div>
</div>

<div class="noprint">
  <button onclick="window.print()">In / Lưu PDF</button>
</div>
</body></html>`;
}

module.exports = { dungBaoCao };
