'use strict';
/**
 * XUẤT TỆP — mọi thứ app này sinh ra để gửi đi.
 *
 * Tách khỏi server.js vì đây là một việc riêng và khá dài: server lo định tuyến
 * và quyền, tệp này lo trình bày. Ba loại tệp, chung một bộ khung:
 *
 *   trangBaoCao()  — báo cáo tổng hợp mọi base, gửi Sếp
 *   vanBanNguoi()  — phiếu đánh giá KPI của một người
 *   vanBanPhong()  — báo cáo KPI cả phòng
 *
 * Ba nguyên tắc chi phối cách trình bày ở đây:
 *
 * 1. TỰ CHỨA. Không link ra ngoài, không tải font, logo nhúng base64, biểu đồ
 *    vẽ sẵn thành SVG. Gửi qua mail hay mở ở máy không mạng đều thấy đủ.
 *
 * 2. IN RA GIẤY ĐƯỢC. Đây là chỗ bản trước hỏng: không khai `@page` nên trang
 *    in lấy khổ mặc định của máy, nội dung rộng 1080px bị cắt mất mép phải.
 *    Và `.base{break-inside:avoid}` đặt trên khối cao 2000–3000px trong khi một
 *    mặt A4 chỉ chứa ~1030px — trình duyệt không tài nào tránh ngắt được, nên
 *    nó đẩy nguyên khối sang trang mới rồi vẫn cắt, để lại nửa trang trắng.
 *    Giờ chỉ tránh ngắt ở đơn vị NHỎ (một ô, một hàng bảng, một biểu đồ).
 *
 * 3. LƯU ĐƯỢC. Mở ra là có thanh nút: Lưu PDF · Tải tệp HTML · Tải CSV. Thanh
 *    này tự ẩn khi in.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

const hEsc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ================= LOGO =================
 * Logo KHÔNG ở app này. Nó nằm một chỗ duy nhất — Cài đặt của Marketing Hub,
 * mục "Nhận diện thương hiệu" — và app này xin về mỗi lần xuất tệp. Trước đây
 * mỗi app giữ một bản: đổi logo là phải nhớ đi sửa từng app, và không cách nào
 * biết app nào đang đóng bản nào lên tệp gửi Sếp.
 */
const LOGO_MAU = '#2aa08c';
const HUB = (process.env.KPI_URL_HUB || 'http://127.0.0.1:5180').replace(/\/+$/, '');

function taiTuHub(duong, giay = 6) {
  return new Promise((giai) => {
    const mod = duong.startsWith('https') ? require('https') : http;
    const req = mod.get(duong, (r) => {
      if (r.statusCode !== 200) { r.resume(); return giai(null); }
      const manh = [];
      r.on('data', (c) => manh.push(c));
      r.on('end', () => giai({ buf: Buffer.concat(manh), mime: r.headers['content-type'] || 'image/png' }));
    });
    req.on('error', () => giai(null));
    req.setTimeout(giay * 1000, () => { req.destroy(); giai(null); });
  });
}

/**
 * Thẻ <img> logo đã nhúng base64, hoặc bản chữ nếu chưa ai đặt logo.
 * Hub tắt thì rơi xuống bản đã tải về lần trước, rồi mới đến bản chữ.
 * KHÔNG tự vẽ lại logo: vẽ gần đúng một nhãn hiệu đã đăng ký rồi đóng lên báo
 * cáo gửi Sếp thì sai còn khó chịu hơn là không có.
 */
async function logoHtml(thuMuc) {
  const cache = path.join(thuMuc, 'logo-hub');
  const nhung = (buf, mime) =>
    '<img class="logo" src="data:' + mime + ';base64,' + buf.toString('base64') + '" alt="Rooty Trip">';

  const tuHub = await taiTuHub(HUB + '/api/logo');
  if (tuHub && tuHub.buf.length) {
    try {
      fs.writeFileSync(cache, tuHub.buf);
      fs.writeFileSync(cache + '.mime', tuHub.mime);
    } catch (_) { /* thư mục chỉ đọc thì bỏ qua, không đáng làm hỏng tệp báo cáo */ }
    return nhung(tuHub.buf, tuHub.mime);
  }
  try {
    if (fs.existsSync(cache)) {
      const mime = fs.existsSync(cache + '.mime')
        ? fs.readFileSync(cache + '.mime', 'utf8').trim() : 'image/png';
      return nhung(fs.readFileSync(cache), mime);
    }
  } catch (_) { /* cache hỏng thì rơi xuống bản chữ */ }
  return '<div class="logo-chu"><b>Rooty</b> trip<span>PHUQUOC</span></div>';
}

/* ================= SỐ =================
 * `gonSo` rút gọn cho ô số lớn (729.242 → 729,2k). Bảng thì để nguyên số đầy
 * đủ — bảng là chỗ người ta đối chiếu, rút gọn ở đó là mất số thật.
 */
function soDep(v, kieu) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (kieu === 'vnd') return Math.round(v).toLocaleString('vi-VN') + ' ₫';
  if (kieu === 'pt') return (Math.round(v * 10) / 10).toString().replace('.', ',') + '%';
  if (kieu === 'x') return (Math.round(v * 100) / 100).toString().replace('.', ',') + 'x';
  if (kieu === 'so2') return (Math.round(v * 100) / 100).toLocaleString('vi-VN');
  return Math.round(v).toLocaleString('vi-VN');
}

function gonSo(v, kieu) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (kieu === 'pt' || kieu === 'x' || kieu === 'so2') return soDep(v, kieu);
  const a = Math.abs(v);
  const rut = (n, d) => (Math.round(v / n * 10) / 10).toString().replace('.', ',') + d;
  if (kieu === 'vnd') {
    if (a >= 1e9) return rut(1e9, ' tỷ');
    if (a >= 1e6) return rut(1e6, ' tr');
    return Math.round(v).toLocaleString('vi-VN') + ' ₫';
  }
  if (a >= 1e9) return rut(1e9, ' tỷ');
  if (a >= 1e6) return rut(1e6, ' tr');
  if (a >= 10000) return Math.round(v / 1000) + 'k';
  return Math.round(v).toLocaleString('vi-VN');
}

const n3 = (v) => (v == null || !Number.isFinite(v) ? '—'
  : (Math.round(v * 1000) / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 }));
const ptS = (v) => (v == null || !Number.isFinite(v) ? '—' : Math.round(v * 100) + '%');
/* Cùng ngưỡng màu với giao diện (mucPt trong app.js): ≥100% tốt, ≥80% vừa.
 * KHÔNG kèm tên xếp loại kiểu "Xuất sắc / Đạt" — bộ luật không định nghĩa thang
 * đó, bịa ra rồi in lên văn bản chính thức là tự đặt ra một quy định nhân sự. */
const mauPt = (v) => (v == null ? '' : v >= 1 ? 'tot' : v >= 0.8 ? 'vua' : 'xau');

/* ================= BIỂU ĐỒ SVG =================
 * Tệp xuất là HTML tĩnh, không chạy JavaScript của app, nên biểu đồ phải vẽ sẵn
 * thành SVG ở máy chủ. Cùng bảng màu với biểu đồ trên giao diện.
 */

/**
 * Biểu đồ đường, HAI TRỤC.
 *
 * Bản trước mỗi đường tự chia cho max của chính nó nhưng chỉ in MỘT thang bên
 * trái, lấy max của đường đầu. Nên "Tương tác 33k" vẽ cao ngang "Lượt xem 729k"
 * và con số trên trục nói dối về đường thứ hai. Giờ đường nào khai `truc: 2`
 * thì đi thang bên PHẢI, có nhãn riêng, và chú thích ghi rõ đường nào theo trục
 * nào.
 */
function svgDuong(ch, W = 980, H = 230) {
  const d = (ch && ch.diem) || [];
  if (d.length < 2) return '';
  const L = 54; const R = 54; const T = 12; const B = 26;
  const w = W - L - R; const h = H - T - B;

  const nhomTruc = (n) => (ch.duong || []).filter((l) => (l.truc || 1) === n);
  const maxCua = (ds) => Math.max(1, ...ds.flatMap((l) => d.map((p) => Number(p[l.key]) || 0)));
  const trai = nhomTruc(1); const phai = nhomTruc(2);
  const maxTrai = maxCua(trai); const maxPhai = phai.length ? maxCua(phai) : 1;

  const veDuong = (l) => {
    const max = (l.truc || 1) === 2 ? maxPhai : maxTrai;
    const diem = d.map((p, i) => {
      const v = Number(p[l.key]) || 0;
      const x = L + (i / (d.length - 1)) * w;
      const y = T + h - (v / max) * h;
      return (Math.round(x * 10) / 10) + ',' + (Math.round(y * 10) / 10);
    }).join(' ');
    return '<polyline points="' + diem + '" fill="none" stroke="' + l.mau
      + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';
  };

  const luoi = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = T + h - f * h;
    return '<line x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y
      + '" stroke="#eef1f6" stroke-width="1"/>';
  }).join('');

  const nhanTruc = (max, x, neo) => [0, 0.5, 1].map((f) => {
    const y = T + h - f * h;
    return '<text x="' + x + '" y="' + (y + 3.5) + '" text-anchor="' + neo
      + '" font-size="9.5" fill="#8b95a7">' + gonSo(max * f) + '</text>';
  }).join('');

  const buoc = Math.max(1, Math.ceil(d.length / 10));
  const nhanX = d.map((p, i) => {
    if (i % buoc && i !== d.length - 1) return '';
    const x = L + (i / (d.length - 1)) * w;
    return '<text x="' + x + '" y="' + (H - 7) + '" text-anchor="middle" font-size="9.5" fill="#8b95a7">'
      + hEsc(String(p.x).slice(8) + '/' + String(p.x).slice(5, 7)) + '</text>';
  }).join('');

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="svg-duong" role="img">'
    + luoi + nhanTruc(maxTrai, L - 7, 'end')
    + (phai.length ? nhanTruc(maxPhai, W - R + 7, 'start') : '')
    + nhanX + (ch.duong || []).map(veDuong).join('')
    + '</svg>';
}

/** Chú thích của biểu đồ đường — nói rõ đường nào theo trục nào. */
function ctDuong(ch) {
  const coPhai = (ch.duong || []).some((l) => l.truc === 2);
  return '<div class="ct">' + (ch.duong || []).map((l) => '<span><i style="background:'
    + hEsc(l.mau) + '"></i>' + hEsc(l.label)
    + (coPhai ? '<em>' + ((l.truc || 1) === 2 ? 'trục phải' : 'trục trái') + '</em>' : '')
    + '</span>').join('') + '</div>';
}

const MAU_TRON = ['#2b5cff', '#12a150', '#d98300', '#7a3cff', '#dc2b3d', '#0aa3b0', '#8b95a7', '#d62976'];

function svgTron(tr, size = 150) {
  const ph = ((tr && tr.phan) || []).filter((x) => x.so > 0).sort((a, b) => b.so - a.so);
  if (!ph.length) return '';
  const tong = ph.reduce((s, x) => s + x.so, 0);
  const c = size / 2; const r = c - 4; const ir = r * 0.62;
  let goc = -Math.PI / 2;
  const cung = ph.map((x, i) => {
    const a = (x.so / tong) * Math.PI * 2;
    /* Một phần chiếm trọn 100% thì cung 360° vẽ ra một đường thẳng (điểm đầu
     * trùng điểm cuối). Vẽ hai vòng tròn lồng nhau thay vì cung. */
    if (ph.length === 1) {
      return '<circle cx="' + c + '" cy="' + c + '" r="' + ((r + ir) / 2) + '" fill="none" stroke="'
        + MAU_TRON[0] + '" stroke-width="' + (r - ir) + '"/>';
    }
    const [x1, y1] = [c + r * Math.cos(goc), c + r * Math.sin(goc)];
    const [x2, y2] = [c + r * Math.cos(goc + a), c + r * Math.sin(goc + a)];
    const [x3, y3] = [c + ir * Math.cos(goc + a), c + ir * Math.sin(goc + a)];
    const [x4, y4] = [c + ir * Math.cos(goc), c + ir * Math.sin(goc)];
    const lon = a > Math.PI ? 1 : 0;
    goc += a;
    return '<path d="M' + x1 + ' ' + y1 + 'A' + r + ' ' + r + ' 0 ' + lon + ' 1 ' + x2 + ' ' + y2
      + 'L' + x3 + ' ' + y3 + 'A' + ir + ' ' + ir + ' 0 ' + lon + ' 0 ' + x4 + ' ' + y4 + 'Z" fill="'
      + MAU_TRON[i % MAU_TRON.length] + '"/>';
  }).join('');
  const chuThich = ph.map((x, i) => '<span><i style="background:' + MAU_TRON[i % MAU_TRON.length]
    + '"></i>' + hEsc(x.nhan) + '<b>' + Math.round((x.so / tong) * 100) + '%</b></span>').join('');
  return '<div class="tron"><svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size
    + '" height="' + size + '">' + cung + '</svg><div class="tron-ct">' + chuThich + '</div></div>';
}

/* ================= THANH LƯU =================
 * Trước đây tệp mở ra là xong — không nút nào để giữ lại. Muốn có PDF thì phải
 * tự nhớ Ctrl+P, muốn giữ tệp thì phải Ctrl+S; không ai đoán ra.
 *
 * "Tải tệp HTML" lấy chính `document.documentElement.outerHTML` chứ không gọi
 * lại máy chủ: trang này vốn đã tự chứa, nên bản tải về giống hệt bản đang xem,
 * kể cả khi số liệu bên các base đã đổi trong lúc đọc.
 */
function thanhLuu(tenTep, duongCsv) {
  return '<div class="thanh-luu">'
    + '<div class="tl-tx"><b>Lưu lại</b><span>tệp này tự chứa — gửi mail hay mở máy khác đều đủ</span></div>'
    + '<button type="button" class="tl-nut chinh" onclick="window.print()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"'
    + ' stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7"/>'
    + '<path d="M6 17H3v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6h-3"/></svg>Lưu PDF</button>'
    + '<button type="button" class="tl-nut" onclick="taiHtml()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"'
    + ' stroke-linejoin="round"><path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/>'
    + '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>Tải tệp HTML</button>'
    + (duongCsv ? '<a class="tl-nut" href="' + hEsc(duongCsv) + '">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"'
      + ' stroke-linejoin="round"><path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/>'
      + '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>Tải CSV cho Excel</a>' : '')
    + '<span class="tl-meo">Ở hộp thoại in, chọn <b>Đích: Lưu thành PDF</b></span>'
    + '</div>'
    + '<script>function taiHtml(){'
    + 'var h="<!doctype html>"+document.documentElement.outerHTML;'
    + 'var a=document.createElement("a");'
    + 'a.href=URL.createObjectURL(new Blob([h],{type:"text/html;charset=utf-8"}));'
    + 'a.download=' + JSON.stringify(tenTep + '.html') + ';a.click();'
    + 'setTimeout(function(){URL.revokeObjectURL(a.href)},4000);}<\/script>';
}

const CSS_LUU = '.thanh-luu{position:sticky;top:0;z-index:9;display:flex;align-items:center;gap:9px;'
  + 'flex-wrap:wrap;padding:10px 14px;margin-bottom:16px;background:#fff;'
  + 'border:1px solid var(--vien);border-radius:11px;box-shadow:0 2px 10px rgba(20,30,60,.07)}'
  + '.tl-tx{margin-right:auto;line-height:1.35}'
  + '.tl-tx b{display:block;font-size:13px}'
  + '.tl-tx span{font-size:11.5px;color:var(--nhat)}'
  + '.tl-nut{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;'
  + 'border:1px solid var(--vien);border-radius:9px;background:#fff;color:var(--chu);'
  + 'font:550 13px inherit;cursor:pointer;text-decoration:none;white-space:nowrap}'
  + '.tl-nut:hover{background:#f7f9fc;border-color:var(--vien-dam)}'
  + '.tl-nut svg{width:16px;height:16px;flex:0 0 auto}'
  + '.tl-nut.chinh{background:var(--xanh);border-color:var(--xanh);color:#fff}'
  + '.tl-nut.chinh:hover{background:#1f4ae0}'
  + '.tl-meo{flex-basis:100%;font-size:11.5px;color:var(--nhat)}'
  + '@media print{.thanh-luu{display:none!important}}';

/* ================= BÁO CÁO TỔNG HỢP ================= */

const CSS_BC = ':root{--vien:#e3e8f0;--mem:#eef1f6;--chu:#1a2233;--mo:#5b6779;--nhat:#8b95a7;'
  + '--vien-dam:#cfd7e6;--luc:#12a150;--do:#dc2b3d;--xanh:#2b5cff}'
  + '*{box-sizing:border-box}'
  + 'body{margin:0;background:#f4f6fa;color:var(--chu);'
  + 'font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}'
  + '.trang{max-width:1120px;margin:0 auto;padding:20px 22px 60px}'

  /* --- đầu trang --- */
  + '.dau{display:flex;align-items:center;gap:18px;padding:18px 20px;background:#fff;'
  + 'border:1px solid var(--vien);border-radius:12px;margin-bottom:16px}'
  + '.dau .logo{height:52px;width:auto;flex:0 0 auto}'
  + '.logo-chu{font-size:26px;font-weight:800;color:' + LOGO_MAU + ';line-height:1;flex:0 0 auto}'
  + '.logo-chu span{display:block;font-size:11px;letter-spacing:.28em;color:#414141;font-weight:700}'
  + '.dau h1{font-size:21px;margin:0 0 3px;letter-spacing:-.01em}'
  + '.ky{color:var(--mo);font-size:12.5px;line-height:1.6}'
  + '.ky b{color:var(--chu)}'

  /* --- khối một base --- */
  + '.base{background:#fff;border:1px solid var(--vien);border-radius:12px;margin-bottom:16px;'
  + 'overflow:hidden}'
  + '.base>header{display:flex;align-items:center;gap:9px;padding:12px 16px;'
  + 'border-bottom:1px solid var(--vien);background:#fbfcfe}'
  + '.base>header b{font-size:15px}'
  + '.base>header .mo{color:var(--nhat);font-size:12px;margin-left:auto;text-align:right}'
  + '.cham-tron{width:9px;height:9px;border-radius:50%;display:inline-block;flex:0 0 auto}'

  /* --- ô số --- */
  + '.luoi{display:grid;grid-template-columns:repeat(6,1fr)}'
  + '.o{padding:11px 13px 12px;box-shadow:0 0 0 1px var(--mem);display:flex;flex-direction:column;'
  + 'break-inside:avoid;min-width:0}'
  + '.o .nhan{font-size:9.5px;color:var(--nhat);font-weight:700;text-transform:uppercase;'
  + 'letter-spacing:.04em;line-height:1.35;min-height:26px}'
  + '.o .so{font-size:20px;font-weight:750;margin-top:1px;letter-spacing:-.02em;'
  + 'font-variant-numeric:tabular-nums;line-height:1.15}'
  + '.o .lech,.o .ghi{font-size:11px;padding-top:3px;color:var(--nhat);line-height:1.4}'
  + '.o .lech.tot{color:var(--luc);font-weight:650}.o .lech.xau{color:var(--do);font-weight:650}'
  + '.o .nen{margin-top:auto;padding-top:5px;font-size:10px;color:var(--nhat);line-height:1.5;'
  + 'border-top:1px dashed var(--mem);display:flex;flex-wrap:wrap;gap:0 7px}'
  + '.o .nen b{color:var(--mo);font-weight:650}'
  + '.o .nen .thieu{font-style:italic;opacity:.8}.o .nen.trong{font-style:italic}'

  /* --- lưu ý của app nguồn --- */
  + '.ly{margin:12px 16px 0;padding:10px 13px;background:#fbfcfe;border:1px solid var(--mem);'
  + 'border-radius:9px;font-size:11.5px;color:var(--mo);break-inside:avoid}'
  + '.ly b{color:var(--chu);font-size:12px}'
  + '.ly ul{margin:5px 0 0;padding-left:17px}.ly li{margin:2px 0;line-height:1.5}'

  /* --- biểu đồ --- */
  + '.bd{display:grid;grid-template-columns:1fr 230px;gap:18px;padding:14px 16px 8px;'
  + 'align-items:start;break-inside:avoid}'
  + '.bd h3{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--nhat);'
  + 'font-weight:700;margin:0 0 7px}'
  + '.svg-duong{width:100%;height:230px;display:block}'
  + '.ct{display:flex;gap:16px;flex-wrap:wrap;font-size:11.5px;color:var(--mo);margin-top:6px}'
  + '.ct i,.tron-ct i{width:9px;height:9px;border-radius:2px;display:inline-block;'
  + 'margin-right:6px;flex:0 0 auto}'
  + '.ct span{display:inline-flex;align-items:center}'
  + '.ct em{font-style:normal;color:var(--nhat);font-size:10.5px;margin-left:5px}'
  + '.tron{display:flex;flex-direction:column;gap:9px;align-items:center}'
  + '.tron-ct{font-size:11px;color:var(--mo);display:flex;flex-direction:column;gap:4px;'
  + 'align-self:stretch}'
  + '.tron-ct span{display:flex;align-items:center}'
  + '.tron-ct b{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--chu)}'

  /* --- bảng --- */
  + '.bang-tieu{padding:14px 16px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;'
  + 'color:var(--nhat);font-weight:700;break-after:avoid}'
  + '.bang-tieu em{font-style:normal;text-transform:none;letter-spacing:0;font-weight:400;'
  + 'color:var(--nhat);margin-left:6px}'
  + 'table{width:100%;border-collapse:collapse;font-size:12.5px;table-layout:fixed}'
  + 'th,td{padding:7px 16px;text-align:left;border-bottom:1px solid var(--mem);'
  + 'overflow-wrap:anywhere;vertical-align:top}'
  + 'th{font-size:9.5px;color:var(--nhat);text-transform:uppercase;letter-spacing:.04em;'
  + 'background:#fbfcfe;font-weight:700;border-bottom:1px solid var(--vien)}'
  + 'tbody tr:nth-child(even) td{background:#fcfdfe}'
  + 'tr{break-inside:avoid}'
  + '.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;width:11%}'
  + '.loi{margin:14px 16px;color:var(--do)}'
  + '.chan{margin-top:24px;color:var(--nhat);font-size:11.5px;border-top:1px solid var(--vien);'
  + 'padding-top:12px;line-height:1.7}'

  /* --- IN RA GIẤY ---
     Khổ NGANG: báo cáo có bảng 8 cột và lưới 6 ô, ép vào khổ dọc là chữ nát.
     KHÔNG đặt break-inside:avoid lên `.base` — khối đó cao 1200–3000px trong khi
     một mặt A4 ngang chỉ chứa ~700px, trình duyệt không tránh ngắt được nên nó
     đẩy sang trang mới rồi vẫn cắt, để lại nửa trang trắng. Chỉ tránh ngắt ở
     đơn vị nhỏ: một ô, một hàng bảng, một biểu đồ. */
  + '@page{size:A4 landscape;margin:10mm}'
  + '@media print{'
  + 'body{background:#fff;font-size:11.5px}'
  + '.trang{max-width:none;width:100%;padding:0}'
  + '.dau{border:0;border-bottom:2px solid var(--chu);border-radius:0;padding:0 0 10px;margin-bottom:12px}'
  + '.dau h1{font-size:18px}'
  + '.base{border-radius:0;margin-bottom:14px;box-shadow:none;break-inside:auto}'
  + '.base>header{break-after:avoid;padding:8px 10px}'
  + '.o{padding:8px 10px}.o .so{font-size:16px}.o .nhan{min-height:0}'
  + 'th,td{padding:5px 10px}'
  /* Đầu bảng lặp lại ở mỗi trang — bảng 40 dòng cắt sang trang mà mất tên cột
     thì nửa sau không đọc được. */
  + 'thead{display:table-header-group}'
  + '.svg-duong{height:190px}'
  + '.chan{break-inside:avoid}'
  + '}'
  + '@media(max-width:1000px){.luoi{grid-template-columns:repeat(4,1fr)}.bd{grid-template-columns:1fr}}'
  + '@media(max-width:640px){.luoi{grid-template-columns:repeat(2,1fr)}}';

const TAT_NEN = { Facebook: 'FB', Instagram: 'IG', TikTok: 'TikTok', 'Zalo OA': 'Zalo', YouTube: 'YT' };
const tatNen = (x) => TAT_NEN[x] || x;

/**
 * Báo cáo tổng hợp — một tệp HTML tự chứa, không phụ thuộc máy chủ.
 * Mở ra bấm Lưu PDF là thành tệp gửi Sếp.
 */
function trangBaoCao(d, nx, logo) {
  const ngay = (s) => s.split('-').reverse().join('/');
  const ten = 'Bao cao Marketing ' + d.tu + ' den ' + d.den;

  /* Dòng "ai đóng góp vào con số này". Không có nó thì "Lượt tiếp cận 15k" đọc
   * lên như số toàn phòng, trong khi chỉ Instagram trả về chỉ số đó. */
  const nen = (x) => {
    if (!x.nen || !x.nen.tong) return '';
    if (!x.nen.co.length) return '<div class="nen trong">chưa nền tảng nào gửi số này</div>';
    return '<div class="nen">'
      + x.nen.co.slice(0, 4).map((k) => '<span><b>' + hEsc(tatNen(k.ten)) + '</b> '
        + gonSo(k.so, x.dinhDang) + '</span>').join('')
      + (x.nen.khong.length
        ? '<span class="thieu">' + hEsc(x.nen.khong.map(tatNen).join(' · ')) + ' chưa có</span>' : '')
      + '</div>';
  };

  const o = (x) => {
    const l = x.lech;
    /* CPA thấp là tốt nên mũi tên đảo chiều — không đảo thì "CPA giảm 20%" bị
     * tô đỏ như một tin xấu. */
    const tot = l == null ? null : (x.dao ? l < 0 : l > 0);
    return '<div class="o"><div class="nhan">' + hEsc(x.nhan) + '</div>'
      + '<div class="so">' + gonSo(x.so, x.dinhDang) + '</div>'
      + (l != null && Number.isFinite(l)
        ? '<div class="lech ' + (tot ? 'tot' : 'xau') + '">'
          + (l > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(l * 10) / 10).toString().replace('.', ',')
          + '%</div>'
        : '')
      + (x.ghi ? '<div class="ghi">' + hEsc(x.ghi) + '</div>' : '')
      + nen(x) + '</div>';
  };

  const bang = (b) => {
    if (!b) return '';
    const soCot = new Set(b.soCot || []);
    return '<div class="bang-tieu">' + hEsc(b.tieuDe)
      + '<em>' + b.dong.length + ' dòng</em></div><table><thead><tr>'
      + b.cot.map((c, i) => '<th' + (soCot.has(i) ? ' class="r"' : '') + '>' + hEsc(c) + '</th>').join('')
      + '</tr></thead><tbody>'
      + b.dong.map((r) => '<tr>' + r.map((c, i) => '<td' + (soCot.has(i) ? ' class="r"' : '') + '>'
        + (typeof c === 'number' ? soDep(c, 'so') : hEsc(c)) + '</td>').join('') + '</tr>').join('')
      + '</tbody></table>';
  };

  const bieuDo = (b) => {
    const duong = svgDuong(b.chuoi);
    const tron = svgTron(b.tron);
    if (!duong && !tron) return '';
    return '<div class="bd">'
      + (duong ? '<div><h3>' + hEsc(b.chuoi.nhan) + '</h3>' + duong + ctDuong(b.chuoi) + '</div>'
        : '<div></div>')
      + (tron ? '<div><h3>' + hEsc(b.tron.nhan) + '</h3>' + tron + '</div>' : '<div></div>')
      + '</div>';
  };

  /* Lưu ý của chính app nguồn về giới hạn số liệu của nó. Chép nguyên, không tự
   * diễn giải lại — app sở hữu chỉ số biết rõ nhất vì sao nó trống, và Sếp đọc
   * báo cáo cần thấy giới hạn đó chứ không chỉ thấy một ô bằng 0. */
  const luuY = (b) => (!(b.luuY || []).length ? ''
    : '<div class="ly"><b>Giới hạn số liệu</b><ul>'
      + b.luuY.map((x) => '<li>' + hEsc(x) + '</li>').join('') + '</ul></div>');

  const khoi = d.base.map((b) => '<section class="base">'
    + '<header><span class="cham-tron" style="background:' + hEsc(b.mau) + '"></span>'
    + '<b>' + hEsc(b.ten) + '</b><span class="mo">' + hEsc(b.mo) + '</span></header>'
    + (b.chay
      ? luuY(b) + '<div class="luoi">' + (b.o || []).map(o).join('') + '</div>'
        + bieuDo(b) + (b.bang || []).map(bang).join('')
      : '<p class="loi">Không đọc được số liệu — ' + hEsc(b.loi) + '</p>')
    + '</section>').join('');

  return '<!doctype html><html lang="vi"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Báo cáo Marketing ' + ngay(d.tu) + ' – ' + ngay(d.den) + '</title>'
    + '<style>' + CSS_BC + CSS_LUU + '</style></head><body><div class="trang">'
    + thanhLuu(ten, 'xuat-bao-cao-csv?tu=' + d.tu + '&den=' + d.den)
    + '<div class="dau">' + logo + '<div>'
    + '<h1>Báo cáo Marketing</h1>'
    + '<div class="ky">Kỳ <b>' + ngay(d.tu) + ' – ' + ngay(d.den) + '</b> (' + d.soNgay + ' ngày)'
    + ' · so với kỳ trước ' + ngay(d.kyTruoc.tu) + ' – ' + ngay(d.kyTruoc.den) + '<br>'
    + '<b>' + d.soChay + '/' + d.soApp + '</b> base đọc được · <b>' + d.soO + '</b> chỉ số'
    + '</div></div></div>'
    + khoi
    + '<div class="chan">Xuất lúc ' + new Date(d.luc).toLocaleString('vi-VN')
    + ' bởi ' + hEsc(nx.ten) + ' · Marketing Hub — Báo cáo &amp; KPI.<br>'
    + 'Số liệu đọc trực tiếp từ các base tại thời điểm xuất; base nào không đọc được đã ghi rõ. '
    + 'Mỗi ô ghi kèm nền tảng nào có số và nền tảng nào chưa — một tổng không nói được điều đó.'
    + '</div></div></body></html>';
}

/* ================= VĂN BẢN KPI =================
 * CSV mở bằng Excel thì đọc được số nhưng KHÔNG phải một văn bản: không tiêu
 * đề, không logo, không chỗ ký. Đưa cho nhân sự đọc kết quả tháng của mình,
 * hoặc gửi lên Sếp, đều không dùng được. Đây là bản văn bản — khổ A4 DỌC, in ra
 * là đưa ký được.
 */
const CSS_VB = ':root{--vien:#e3e8f0;--mem:#eef1f6;--chu:#1a2233;--mo:#5b6779;--nhat:#8b95a7;'
  + '--vien-dam:#cfd7e6;--luc:#12a150;--vang:#d98300;--do:#dc2b3d;--xanh:#2b5cff}'
  + '*{box-sizing:border-box}'
  + 'body{margin:0;background:#eef1f6;color:var(--chu);'
  + 'font:13.5px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}'
  + '.ngoai{max-width:900px;margin:20px auto;padding:0 16px}'
  + '.to{background:#fff;padding:32px 38px 40px;box-shadow:0 2px 24px rgba(20,30,60,.12)}'
  + '.dau{display:flex;align-items:center;gap:18px;border-bottom:2px solid var(--chu);padding-bottom:14px}'
  + '.dau .logo{height:56px;width:auto}'
  + '.logo-chu{font-size:26px;font-weight:800;color:' + LOGO_MAU + ';line-height:1}'
  + '.logo-chu span{display:block;font-size:11px;letter-spacing:.28em;color:#414141;font-weight:700}'
  + '.dau-tx{margin-left:auto;text-align:right;font-size:11.5px;color:var(--nhat);line-height:1.7}'
  + 'h1{font-size:19px;text-align:center;margin:22px 0 2px;text-transform:uppercase;letter-spacing:.02em}'
  + '.ky{text-align:center;color:var(--mo);margin-bottom:20px;font-size:13px}'
  + 'h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--mo);'
  + 'margin:26px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--vien);break-after:avoid}'
  + '.tt{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:7px 14px;font-size:13px;margin-bottom:6px}'
  + '.tt dt{color:var(--nhat)}.tt dd{margin:0;font-weight:600}'
  + '.kq{display:flex;gap:14px;margin:16px 0 4px;break-inside:avoid}'
  + '.kq>div{flex:1;border:1px solid var(--vien);border-radius:10px;padding:12px 15px;min-width:0}'
  + '.kq .n{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--nhat);font-weight:700}'
  + '.kq .v{font-size:28px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}'
  + '.kq .p{font-size:11.5px;color:var(--nhat)}'
  + '.v.tot{color:var(--luc)}.v.vua{color:var(--vang)}.v.xau{color:var(--do)}'
  + 'table{width:100%;border-collapse:collapse;font-size:12.5px;table-layout:fixed}'
  + 'th,td{padding:6px 9px;text-align:left;border:1px solid var(--vien);vertical-align:top;'
  + 'overflow-wrap:anywhere}'
  + 'th{background:#f7f9fc;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;'
  + 'color:var(--nhat);font-weight:700}'
  + '.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;width:13%}'
  + 'tr{break-inside:avoid}'
  + 'tr.tong td{background:#f7f9fc;font-weight:700}'
  + '.gc{color:var(--mo);font-size:11.5px;font-style:italic}'
  + '.im{color:var(--nhat);font-style:italic}'
  + '.nh{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700}'
  + '.nh.ok{background:#e6f7ee;color:var(--luc)}.nh.chan{background:#fdeaec;color:var(--do)}'
  + '.nh.canh{background:#fff4e0;color:var(--vang)}'
  + '.thanh{height:7px;border-radius:4px;background:var(--mem);position:relative;min-width:60px;margin-top:4px}'
  + '.thanh i{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--luc)}'
  + '.thanh i.vua{background:var(--vang)}.thanh i.xau{background:var(--do)}'
  + '.ky-ten{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:38px;'
  + 'text-align:center;font-size:12.5px;break-inside:avoid}'
  + '.ky-ten b{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em}'
  + '.ky-ten span{display:block;color:var(--nhat);font-size:11px;margin-top:3px}'
  + '.ky-ten em{display:block;height:64px}'
  + '.chan-tr{margin-top:30px;padding-top:12px;border-top:1px solid var(--vien);'
  + 'color:var(--nhat);font-size:11px;line-height:1.7;break-inside:avoid}'
  /* Khổ DỌC: đây là văn bản chữ, một cột — khác hẳn báo cáo tổng hợp. */
  + '@page{size:A4 portrait;margin:14mm}'
  + '@media print{body{background:#fff}'
  + '.ngoai{margin:0;max-width:none;padding:0}'
  + '.to{padding:0;box-shadow:none}'
  + 'thead{display:table-header-group}'
  + '}';

/** Khung chung của mọi văn bản KPI: thanh lưu, logo, tiêu đề, khối ký, chân trang. */
function voVanBan(o) {
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + hEsc(o.tieuDe) + ' — ' + hEsc(o.ky) + '</title>'
    + '<style>' + CSS_VB + CSS_LUU + '</style></head><body><div class="ngoai">'
    + thanhLuu(o.tenTep, o.csv)
    + '<div class="to">'
    + '<div class="dau">' + o.logo
    + '<div class="dau-tx">CÔNG TY ROOTY TRIP<br>Phòng Marketing<br>'
    + 'Số: KPI-' + hEsc(o.ky.replace(/[^0-9]/g, '')) + '</div></div>'
    + '<h1>' + hEsc(o.tieuDe) + '</h1>'
    + '<div class="ky">Kỳ đánh giá: <b>' + hEsc(o.ky) + '</b> · '
    + (o.chot ? 'đã chốt ngày ' + new Date(o.chot.luc).toLocaleDateString('vi-VN')
      : '<span class="nh canh">bản nháp — tháng chưa chốt</span>') + '</div>'
    + o.than
    + (o.kyTen || '')
    + '<div class="chan-tr">Kết xuất lúc ' + new Date().toLocaleString('vi-VN')
    + ' bởi ' + hEsc(o.nx.ten) + ' · Marketing Hub — Báo cáo &amp; KPI.<br>'
    + 'Điểm tính lương = Σ (điểm tiêu chí × trọng số). % hoàn thành = điểm tính lương ÷ tổng trọng số. '
    + 'Tiêu chí không có nguồn số liệu được loại khỏi mẫu số và ghi rõ “chưa đo được”, '
    + 'không tính thành 0.</div>'
    + '</div></div></body></html>';
}

const KHOI_KY = '<div class="ky-ten">'
  + '<div><b>Người được đánh giá</b><span>ký, ghi rõ họ tên</span><em></em></div>'
  + '<div><b>Trưởng phòng Marketing</b><span>ký, ghi rõ họ tên</span><em></em></div>'
  + '<div><b>Ban Giám đốc</b><span>ký, ghi rõ họ tên</span><em></em></div>'
  + '</div>';

/** Phiếu KPI của MỘT người. */
function vanBanNguoi(ng, kq, th, nx, logo) {
  const ky = 'Tháng ' + Number(th.slice(5)) + '/' + th.slice(0, 4);
  const pht = ng.tongTrongSo > 0 ? ng.tong / ng.tongTrongSo : null;
  const thieu = (ng.tieuChi || []).filter((x) => x.chuaCo);

  const tt = '<h2>Thông tin</h2><dl class="tt">'
    + '<dt>Họ và tên</dt><dd>' + hEsc(ng.ten) + '</dd>'
    + (ng.viTri ? '<dt>Vị trí</dt><dd>' + hEsc(ng.viTri) + '</dd>' : '')
    + '<dt>Bộ phận</dt><dd>Phòng Marketing</dd>'
    + '<dt>Kỳ đánh giá</dt><dd>' + hEsc(ky) + '</dd>'
    + '</dl>';

  const kqO = '<div class="kq">'
    + '<div><div class="n">% hoàn thành</div><div class="v ' + mauPt(pht) + '">' + ptS(pht) + '</div>'
    + '<div class="thanh"><i class="' + mauPt(pht) + '" style="width:'
    + Math.min(100, Math.round((pht || 0) * 100)) + '%"></i></div></div>'
    + '<div><div class="n">Điểm tính lương</div><div class="v">' + n3(ng.tong) + '</div>'
    + '<div class="p">trên tổng trọng số ' + n3(ng.tongTrongSo) + '</div></div>'
    + '<div><div class="n">Dữ liệu</div><div class="v ' + (thieu.length ? 'xau' : 'tot') + '">'
    + (ng.tieuChi.length - thieu.length) + '/' + ng.tieuChi.length + '</div>'
    + '<div class="p">' + (thieu.length ? 'còn ' + thieu.length + ' mục chưa có số' : 'đủ dữ liệu')
    + '</div></div></div>';

  /* Bề rộng cột khai thẳng: `table-layout:fixed` chia đều phần còn lại, nên cột
   * "Tiêu chí" bị bó còn 20% và tên dài xuống hai dòng, trong khi cột Ghi chú
   * thường trống lại rộng bằng ấy. */
  const b1 = '<h2>1. Tiêu chí tính lương</h2><table><thead><tr>'
    + '<th style="width:26%">Tiêu chí</th><th class="r" style="width:9%">Điểm</th>'
    + '<th class="r" style="width:11%">Trọng số</th>'
    + '<th class="r" style="width:14%">Điểm tính lương</th>'
    + '<th style="width:19%">Nguồn điểm</th><th>Ghi chú</th></tr></thead><tbody>'
    + ng.tieuChi.map((tc) => {
      const nguon = tc.kieu === 'kenh' ? 'gộp từ ' + hEsc(tc.ghi || 'các kênh phụ trách')
        : tc.kieu === 'chiSo' ? 'chỉ số tự động'
          : 'do ' + hEsc(tc.boi || 'người phụ trách') + ' chấm';
      return '<tr><td>' + hEsc(tc.ten) + '</td>'
        + '<td class="r">' + (tc.chuaCo ? '<span class="nh chan">chưa có</span>' : n3(tc.diem)) + '</td>'
        + '<td class="r">' + n3(tc.trongSo) + '</td>'
        + '<td class="r"><b>' + n3(tc.diemTinhLuong) + '</b></td>'
        + '<td>' + nguon + '</td>'
        + '<td class="gc">' + (tc.ghiChu ? hEsc(tc.ghiChu)
          : (tc.chuaCo ? '<span class="im">chưa được chấm</span>' : '')) + '</td></tr>';
    }).join('')
    + '<tr class="tong"><td>TỔNG</td><td class="r"></td><td class="r">' + n3(ng.tongTrongSo) + '</td>'
    + '<td class="r">' + n3(ng.tong) + '</td><td colspan="2">'
    + '% hoàn thành = ' + n3(ng.tong) + ' ÷ ' + n3(ng.tongTrongSo) + ' = <b>' + ptS(pht) + '</b>'
    + '</td></tr></tbody></table>';

  let b2 = '';
  if ((ng.kenh || []).length) {
    b2 = '<h2>2. “Hiệu quả công việc chính” đến từ đâu</h2>'
      + '<table><thead><tr><th style="width:52%">Nhóm kênh phụ trách</th>'
      + '<th class="r">Tỷ trọng</th>'
      + '<th class="r">Điểm nhóm</th><th class="r">Góp vào điểm</th></tr></thead><tbody>'
      + ng.kenh.map((k) => '<tr><td>' + hEsc(k.ten) + '</td>'
        + '<td class="r">' + ptS(k.tyTrong) + '</td>'
        + '<td class="r">' + (k.boQua ? '<span class="nh chan">không chấm được</span>' : n3(k.diemNhom)) + '</td>'
        + '<td class="r"><b>' + n3(k.diem) + '</b></td></tr>').join('')
      + '</tbody></table>';

    const chiTiet = ng.kenh.map((k) => {
      const n = (kq.nhom || []).find((x) => x.khoa === k.khoa);
      if (!n || !(n.tieuChi || []).length) return '';
      return '<tr class="tong"><td colspan="6">' + hEsc(n.ten) + '</td></tr>'
        + n.tieuChi.map((tc) => '<tr><td></td><td>' + hEsc(tc.ten) + '</td>'
          + '<td class="r">' + (tc.boQua ? '<span class="im">chưa đo được</span>' : soDep(tc.ketQua, 'so')) + '</td>'
          + '<td class="r">' + soDep(tc.mucTieu, 'so') + '</td>'
          + '<td class="r">' + (tc.boQua ? '—' : ptS(tc.datMucTieu)) + '</td>'
          + '<td class="r">' + n3(tc.diem) + '</td></tr>').join('');
    }).join('');
    if (chiTiet) {
      b2 += '<h2>3. Chi tiết từng chỉ số</h2>'
        + '<table><thead><tr><th style="width:14%"></th><th>Chỉ số</th><th class="r">Kết quả</th>'
        + '<th class="r">Mục tiêu</th><th class="r">% đạt</th><th class="r">Điểm</th>'
        + '</tr></thead><tbody>' + chiTiet + '</tbody></table>';
    }
  }

  const canh = thieu.length
    ? '<h2>Lưu ý</h2><p>Phiếu này còn <b>' + thieu.length + '</b> mục chưa có điểm ('
      + thieu.map((x) => hEsc(x.ten)).join(' · ') + '). Các mục đó đang tính 0 khi cộng tổng, '
      + 'nên <b>% hoàn thành ở trên là mức thấp nhất có thể</b> và sẽ tăng khi chấm đủ. '
      + 'Tháng chưa chốt được khi còn mục chưa chấm.</p>'
    : '';

  return voVanBan({
    logo, nx, chot: kq.chot, ky,
    tieuDe: 'Phiếu đánh giá KPI',
    tenTep: 'Phieu KPI ' + ng.ten + ' T' + Number(th.slice(5)) + '-' + th.slice(0, 4),
    csv: 'xuat?kieu=nguoi&ma=' + encodeURIComponent(ng.ma) + '&thang=' + th,
    than: tt + kqO + b1 + b2 + canh,
    kyTen: KHOI_KY,
  });
}

/** Báo cáo KPI cả phòng. */
function vanBanPhong(kq, th, nx, logo) {
  const ky = 'Tháng ' + Number(th.slice(5)) + '/' + th.slice(0, 4);
  const ds = kq.nguoi.map((ng) => ({
    ng, pht: ng.tongTrongSo > 0 ? ng.tong / ng.tongTrongSo : null,
  })).sort((a, b) => (b.pht || 0) - (a.pht || 0));
  const co = ds.filter((x) => x.pht != null);
  const tb = co.length ? co.reduce((s, x) => s + x.pht, 0) / co.length : null;
  const dat = co.filter((x) => x.pht >= 1).length;

  const kqO = '<div class="kq">'
    + '<div><div class="n">Trung bình phòng</div><div class="v ' + mauPt(tb) + '">' + ptS(tb) + '</div>'
    + '<div class="p">' + ds.length + ' nhân sự</div></div>'
    + '<div><div class="n">Đạt 100% trở lên</div><div class="v ' + (dat === ds.length ? 'tot' : '') + '">'
    + dat + '/' + ds.length + '</div><div class="p">người</div></div>'
    + '<div><div class="n">Trạng thái</div><div class="v ' + (kq.chotDuoc ? 'tot' : 'xau')
    + '" style="font-size:18px">' + (kq.chot ? 'Đã chốt' : (kq.chotDuoc ? 'Đủ điều kiện chốt' : 'Chưa chốt được'))
    + '</div><div class="p">' + (kq.soChan ? kq.soChan + ' mục còn chặn' : 'không có mục chặn')
    + '</div></div></div>';

  /* Bộ luật chưa khai vị trí cho ai thì BỎ HẲN cột đó, đừng in một cột toàn dấu
   * gạch lên văn bản chính thức. Ai đã khai thì cột hiện lại như thường. */
  const coViTri = ds.some((x) => x.ng.viTri);
  const b1 = '<h2>1. Kết quả từng nhân sự</h2><table><thead><tr>'
    + '<th' + (coViTri ? '' : ' style="width:34%"') + '>Nhân sự</th>'
    + (coViTri ? '<th>Vị trí</th>' : '')
    + '<th class="r" style="width:18%">% hoàn thành</th>'
    + '<th class="r">Điểm</th><th class="r">Tổng trọng số</th><th style="width:15%">Dữ liệu</th>'
    + '</tr></thead><tbody>'
    + ds.map((x) => {
      const ng = x.ng;
      const t = (ng.tieuChi || []).filter((y) => y.chuaCo).length;
      return '<tr><td><b>' + hEsc(ng.ten) + '</b></td>'
        + (coViTri ? '<td>' + hEsc(ng.viTri || '—') + '</td>' : '')
        + '<td class="r"><b class="v ' + mauPt(x.pht) + '" style="font-size:14px">' + ptS(x.pht) + '</b>'
        + '<div class="thanh"><i class="' + mauPt(x.pht) + '" style="width:'
        + Math.min(100, Math.round((x.pht || 0) * 100)) + '%"></i></div></td>'
        + '<td class="r">' + n3(ng.tong) + '</td><td class="r">' + n3(ng.tongTrongSo) + '</td>'
        + '<td>' + (t ? '<span class="nh chan">thiếu ' + t + ' mục</span>'
          : '<span class="nh ok">đủ</span>') + '</td></tr>';
    }).join('')
    + '</tbody></table>';

  const b2 = '<h2>2. Điểm từng nhóm kênh</h2><table><thead><tr>'
    + '<th style="width:52%">Nhóm kênh</th><th class="r" style="width:18%">Điểm nhóm</th>'
    + '<th class="r">Số chỉ số</th><th class="r">Đo được</th></tr></thead><tbody>'
    + (kq.nhom || []).slice().sort((a, b) => (b.diem || 0) - (a.diem || 0)).map((n) => {
      const tc = n.tieuChi || [];
      const d = tc.filter((x) => !x.boQua).length;
      return '<tr><td>' + hEsc(n.ten) + '</td>'
        + '<td class="r">' + (n.diem == null ? '<span class="im">không chấm được</span>' : n3(n.diem)) + '</td>'
        + '<td class="r">' + tc.length + '</td>'
        + '<td class="r">' + d + '/' + tc.length + '</td></tr>';
    }).join('')
    + '</tbody></table>';

  const b3 = (kq.chan || []).length
    ? '<h2>3. Mục còn chặn — chưa đủ điều kiện chốt</h2><table><thead><tr>'
      + '<th style="width:38%">Ở đâu</th><th>Cần làm gì</th></tr></thead><tbody>'
      + kq.chan.map((x) => '<tr><td>' + hEsc(x.o) + '</td><td>' + hEsc(x.viec) + '</td></tr>').join('')
      + '</tbody></table>'
    : '';

  return voVanBan({
    logo, nx, chot: kq.chot, ky,
    tieuDe: 'Báo cáo KPI phòng Marketing',
    tenTep: 'Bao cao KPI phong T' + Number(th.slice(5)) + '-' + th.slice(0, 4),
    csv: 'xuat?kieu=phong&thang=' + th,
    than: kqO + b1 + b2 + b3,
    kyTen: '<div class="ky-ten">'
      + '<div><b>Người lập</b><span>ký, ghi rõ họ tên</span><em></em></div>'
      + '<div><b>Trưởng phòng Marketing</b><span>ký, ghi rõ họ tên</span><em></em></div>'
      + '<div><b>Ban Giám đốc</b><span>ký, ghi rõ họ tên</span><em></em></div></div>',
  });
}

/* ================= CSV =================
 * BOM ở đầu để Excel trên Windows mở ra không vỡ tiếng Việt — thiếu ba byte đó
 * là mọi dấu thành ký tự lạ và người nhận tưởng tệp hỏng.
 */
function oCsv(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const lamCsv = (dong) => '﻿' + dong.map((d) => d.map(oCsv).join(',')).join('\r\n');

/**
 * Báo cáo tổng hợp dạng CSV — cho ai cần bê số sang bảng tính khác.
 * Một tệp phẳng: mỗi ô số một dòng, rồi tới các bảng chi tiết.
 */
function csvBaoCao(d) {
  const r = [
    ['Báo cáo Marketing', d.tu + ' đến ' + d.den, d.soNgay + ' ngày'],
    ['So với kỳ trước', d.kyTruoc.tu + ' đến ' + d.kyTruoc.den],
    ['Base đọc được', d.soChay + '/' + d.soApp], [],
    ['CHỈ SỐ TỔNG'], [],
    ['Base', 'Chỉ số', 'Giá trị', 'Đơn vị', '% so kỳ trước', 'Nền tảng có số', 'Nền tảng chưa có'],
  ];
  d.base.forEach((b) => {
    if (!b.chay) { r.push([b.ten, 'KHÔNG ĐỌC ĐƯỢC', b.loi]); return; }
    (b.o || []).forEach((o) => r.push([b.ten, o.nhan, o.so,
      o.dinhDang === 'vnd' ? 'VND' : o.dinhDang === 'pt' ? '%' : o.dinhDang === 'x' ? 'lần' : '',
      o.lech == null || !Number.isFinite(o.lech) ? '' : Math.round(o.lech * 10) / 10,
      o.nen ? o.nen.co.map((x) => x.ten + '=' + x.so).join(' | ') : '',
      o.nen ? o.nen.khong.join(' | ') : '']));
  });
  d.base.forEach((b) => {
    (b.bang || []).forEach((bg) => {
      r.push([], [b.ten.toUpperCase() + ' — ' + bg.tieuDe.toUpperCase()], bg.cot);
      bg.dong.forEach((x) => r.push(x));
    });
    /* Chuỗi theo ngày cũng đưa vào: đây là thứ người ta hay cần nhất khi mở
     * sang Excel — để tự vẽ lại biểu đồ theo ý mình. */
    if (b.chuoi && b.chuoi.diem.length) {
      r.push([], [b.ten.toUpperCase() + ' — ' + b.chuoi.nhan.toUpperCase()],
        ['Ngày', ...b.chuoi.duong.map((l) => l.label)]);
      b.chuoi.diem.forEach((p) => r.push([p.x, ...b.chuoi.duong.map((l) => p[l.key])]));
    }
  });
  return lamCsv(r);
}

module.exports = {
  hEsc, logoHtml, soDep, gonSo, n3, ptS, mauPt,
  svgDuong, svgTron, trangBaoCao, vanBanNguoi, vanBanPhong,
  oCsv, lamCsv, csvBaoCao, LOGO_MAU,
};
