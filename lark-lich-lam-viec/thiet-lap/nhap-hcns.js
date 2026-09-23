'use strict';
/**
 * Chép lịch của phòng Marketing từ sheet LLV của HCNS vào Base "Lịch làm việc MKT".
 *
 * Anh Hùng (23/09/2026): sheet HCNS là bản ĐÚNG — Base phải khớp nó. Chạy khi mới
 * dựng Base (tháng 9 chưa ai đăng ký qua app), hoặc khi HCNS sửa tay trên sheet.
 *
 *   node thiet-lap/nhap-hcns.js --thang 2026-09 --sheet RIiPf3          (xem trước, KHÔNG ghi)
 *   node thiet-lap/nhap-hcns.js --thang 2026-09 --sheet RIiPf3 --that   (ghi thật)
 *
 * Khớp người bằng MÃ NV (cột C của sheet) — không bằng tên. Chỉ lấy dòng có cột B
 * là "MKT". Ô ngày trống giữ trống (người nghỉ việc giữa tháng). Phiếu ghi xong
 * ở trạng thái "Đã chuyển HCNS" vì nó vốn đang nằm bên HCNS.
 */
const path = require('path');
const cfg = require('../config');
const MA = require('../ma-cong');
const kho = require('../kho');
const lark = require('../lark');

const thamSo = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : ''; };
const THANG = thamSo('--thang');
const SHEET = thamSo('--sheet');
const THAT = process.argv.includes('--that');
const WIKI = cfg.hcnsUrl;
const p2 = (n) => String(n).padStart(2, '0');

/** Một dòng CSV (có ngoặc kép) -> mảng ô. */
function tachCsv(dong) {
  const o = [];
  let cur = '', q = false;
  for (let i = 0; i < dong.length; i++) {
    const c = dong[i];
    if (q) {
      if (c === '"' && dong[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { o.push(cur); cur = ''; }
    else cur += c;
  }
  o.push(cur);
  return o;
}

(async () => {
  const t = MA.docThang(THANG);
  if (!t || !SHEET) throw new Error('Cần --thang YYYY-MM và --sheet <sheet_id> (tab LLV của tháng đó).');
  const soNgay = MA.soNgay(t.nam, t.thang);

  const d = await lark.cli(['sheets', '+csv-get', '--url', WIKI, '--sheet-id', SHEET, '--range', 'A1:AX140']);
  /* annotated_csv: mỗi dòng "[row=N] ô,ô,…" — ô có xuống dòng nằm trong ngoặc kép
   * nên phải ghép lại theo tiền tố [row=…], không tách thẳng theo \n. */
  const tho = String(d.annotated_csv || '');
  const dongs = [];
  tho.split('\n').forEach((l) => {
    if (/^\[row=\d+\] /.test(l)) dongs.push(l.replace(/^\[row=\d+\] /, ''));
    else if (dongs.length) dongs[dongs.length - 1] += '\n' + l;
  });
  const bang = dongs.map(tachCsv);

  /* Hàng tiêu đề có "01" ở cột ngày đầu tiên — tìm chứ không ghi cứng chỉ số cột. */
  const tieuDe = bang.find((r) => r.includes('01') && r.includes('Mã Nhân Viên'));
  if (!tieuDe) throw new Error('Không thấy hàng tiêu đề (Mã Nhân Viên … 01 02 …) trong sheet.');
  const cotNgay = tieuDe.indexOf('01');
  const cotMa = tieuDe.indexOf('Mã Nhân Viên');

  const mkt = bang.filter((r) => String(r[1] || '').trim() === 'MKT' && /^RT\d+/.test(String(r[cotMa] || '').trim()));
  const ns = await kho.dsNhanSu(true);
  const le = kho.leCua(await kho.dsNgayLe(true), THANG);
  const cu = await kho.dsDangKy(THANG, true);
  const D = cfg.fields.dangKy;
  const nay = Date.now();

  const ghi = [];
  for (const r of mkt) {
    const maNV = String(r[cotMa]).trim();
    const n = ns.find((x) => x.maNV === maNV);
    const ma = Array.from({ length: soNgay }, (_, i) => String(r[cotNgay + i] || '').trim());
    const la = ma.filter((m) => m && !MA.laMa(m));
    if (la.length) console.log('  ! ' + maNV + ' có mã lạ, để trống: ' + [...new Set(la)].join(', '));
    const sach = ma.map((m) => (MA.laMa(m) ? m : ''));
    const tinh = MA.tinh(THANG, sach, le);
    const o = {
      [D.ma.name]: THANG + '|' + maNV,
      [D.thang.name]: THANG,
      [D.maNV.name]: maNV,
      [D.hoTen.name]: (n && n.hoTen) || String(r[cotMa + 1] || '').trim(),
      [D.chucVu.name]: (n && n.chucVu) || String(r[cotMa + 2] || '').trim(),
      [D.trangThai.name]: cfg.chon.trangThai.daChuyen,
      [D.congChuan.name]: tinh.congChuan,
      [D.tongCong.name]: tinh.tongCong,
      [D.nghi.name]: tinh.nghi,
      [D.nopLuc.name]: nay,
      [D.suaLuc.name]: nay,
      [D.chuyenLuc.name]: nay,
      [D.suaSau.name]: false,
      [D.ghiChu.name]: 'Nhập từ sheet LLV ' + p2(t.thang) + '.' + t.nam + ' của HCNS',
    };
    if (n && n.nguoi) o[D.nguoi.name] = n.nguoi;
    if (n && n.email) o[D.email.name] = n.email;
    for (let i = 1; i <= 31; i++) o[cfg.fields.ngay[i].name] = i <= soNgay && sach[i - 1] ? sach[i - 1] : null;
    const p = cu.find((x) => x.ma === THANG + '|' + maNV);
    ghi.push({ maNV, ten: o[D.hoTen.name], p, o, tong: tinh.tongCong, ngay: sach.join(' ') });
    if (!n) console.log('  ! ' + maNV + ' chưa có trong bảng Nhân sự — vẫn nhập phiếu');
  }

  console.log((THAT ? 'GHI' : 'XEM TRƯỚC') + ' · tháng ' + THANG + ' · ' + ghi.length + ' người MKT');
  ghi.forEach((g) => console.log('  ' + (g.p ? 'sửa ' : 'thêm') + ' ' + g.maNV + ' ' + g.ten.padEnd(22) + ' công ' + g.tong + '  ' + g.ngay));
  if (!THAT) { console.log('\nThêm --that để ghi.'); return; }

  for (const g of ghi) {
    if (g.p) await lark.updateRecord(g.p.recordId, g.o, cfg.dangKyTableId);
    else await lark.createRecord(g.o, cfg.dangKyTableId);
  }
  console.log('Xong.');
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
