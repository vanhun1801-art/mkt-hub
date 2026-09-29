'use strict';
/* Sản phẩm đang đẩy (Base "Sản phẩm", cột Ưu tiên marketing) → bộ từ khoá để tìm media hợp.
   CHỈ ĐỌC bảng Sản phẩm qua lark.js của app lark-san-pham. Cố ý KHÔNG gọi kho.tatCa():
   hàm đó áp "Lịch đổi thông tin" xuống Base tại lần đọc — kho media không được gây ghi. */
const fs = require('fs');
const path = require('path');
const { DL, bo } = require('./chi-muc');

const SP_DIR = process.env.KHO_SAN_PHAM_DIR || path.join(__dirname, '..', 'lark-san-pham');
const DEM = path.join(DL, 'san-pham.json');
const HAN = 6 * 3600e3;
const UU_TIEN = ['🔥 Ưu tiên đẩy', '🟢 Chạy hằng ngày'];

/* Địa danh/trải nghiệm có trọng số cao: thấy trong tên, trải nghiệm hoặc lịch trình thì
   dùng làm từ khoá. Từ chung (buffet, show…) trọng số thấp để không kéo ảnh lạc đề lên. */
const DIA_DANH = ['bãi khem', 'bãi sao', 'cầu hôn', 'symphony', 'kiss of the sea', 'pháo hoa', 'hòn thơm', 'cáp treo',
  'vinwonders', 'safari', 'grand world', 'sunset town', 'địa trung hải', 'nam đảo', 'rạch vẹm', 'dinh cậu', 'chợ đêm',
  'nhà tù', 'hòn móng tay', 'hòn gầm ghì', 'hòn mây rút', 'san hô', 'seawalker', 'đi bộ dưới biển', 'cano', 'an thới',
  'công viên nước', 'hồ tiêu', 'rượu sim', 'ngọc trai', 'tơ lụa', 'dù bay', 'lặn ngắm san hô', 'nhà bè', 'câu cá',
  'nước mắm', 'hộ quốc', 'thiền viện', 'sanato', 'thị trấn hoàng hôn', 'bãi trường', 'suối tranh', 'hàm ninh', 'gành dầu',
  /* KHÔNG thêm "vinpearl"/"ông lang": lịch trình ghi chúng là điểm ĐÓN khách, không phải điểm đến */
  'thuỷ cung', 'thủy cung', 'hòn thơm', 'bãi kem'];
const CHUNG = ['buffet', 'show', 'hoàng hôn', 'bãi biển', 'đảo'];

/* chữ thường CÓ dấu, dấu câu → khoảng trắng; "thuỷ/thủy" gộp một kiểu */
const thuong = s => String(s || '').normalize('NFC').toLowerCase().replace(/uỷ/g, 'ủy').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const coDau = s => /[^\x00-\x7f]/.test(s);
function tuKhoa(sp) {
  const van = bo([sp.ten, (sp.traiNghiem || []).join(' '), sp.lichTrinh, sp.noiBat].join(' '));
  const k = [];
  for (const d of DIA_DANH) if (van.includes(bo(d)) && !k.some(x => x.t === bo(d))) k.push({ t: bo(d), g: thuong(d), w: 3 });
  for (const d of CHUNG) if (van.includes(bo(d))) k.push({ t: bo(d), g: thuong(d), w: 1 });
  /* "Grand World" và "Sunset Town" hay đi đôi với tên cũ "Địa Trung Hải" trong thư mục Drive */
  if (k.some(x => x.t === 'sunset town') && !k.some(x => x.t === 'dia trung hai')) k.push({ t: 'dia trung hai', g: 'địa trung hải', w: 2 });
  return k;
}

let dem = null;
try { dem = JSON.parse(fs.readFileSync(DEM, 'utf8')); } catch (e) {}
let dang = null;

async function docMoi() {
  const lark = require(path.join(SP_DIR, 'lark'));
  const cfg = require(path.join(SP_DIR, 'config'));
  const { veSanPham } = require(path.join(SP_DIR, 'kho'));
  const raw = await lark.listAllRecords(cfg.spTableId);
  const ds = raw.map(veSanPham)
    .filter(s => (s.ma || s.ten) && UU_TIEN.includes(s.uuTien) && !/tạm dừng|ngừng/i.test(s.trangThai || '') && !/hết hạn/i.test(s.tinhTrang || ''))
    .map(s => ({ ma: s.ma, ten: s.ten, nhom: s.nhom, uuTien: s.uuTien.replace(/^[^\p{L}]+/u, ''), day: s.uuTien === UU_TIEN[0], tu: tuKhoa(s) }))
    .filter(s => s.tu.length)
    .sort((a, b) => (b.day - a.day) || a.ma.localeCompare(b.ma));
  dem = { luc: Date.now(), ds };
  fs.writeFileSync(DEM + '.tmp', JSON.stringify(dem, null, 1));
  fs.renameSync(DEM + '.tmp', DEM);
  return dem;
}

/* Trả bản đệm ngay (kể cả cũ), đọc lại phía sau khi quá 6 tiếng — Base chậm không làm trang chờ */
function danhSach() {
  if ((!dem || Date.now() - dem.luc > HAN) && !dang) {
    dang = docMoi().catch(e => { console.log('Không đọc được Base Sản phẩm:', e.message); return dem; }).finally(() => { dang = null; });
  }
  return dem ? Promise.resolve(dem) : dang;
}

/* Chấm điểm media theo một sản phẩm: khớp nội dung AI thấy ×2, khớp đường dẫn ×1, cộng điểm đẹp */
/* Chuẩn hoá chữ của một media, nhớ theo object (chỉ mục nạp lại là object mới → tự làm lại) */
const DEM_CHU = new WeakMap();
function chuan(i) {
  let c = DEM_CHU.get(i);
  if (c && c.mo === i.mo) return c;
  const doan = i.duong.concat(i.ten);
  c = {
    mo: i.mo,
    ai: i.mo ? ' ' + thuong(i.mo + ' ' + (i.the || []).join(' ')) + ' ' : '',
    dg: ' ' + thuong(doan.join(' ')) + ' ',
    dgKhongDau: ' ' + doan.filter(s => !coDau(s)).map(s => thuong(s)).join(' ') + ' ',
  };
  DEM_CHU.set(i, c);
  return c;
}

function goiYChoSanPham(sp, items, n = 12) {
  /* Tour ban ngày (không có pháo hoa/show trong lịch trình) thì ảnh ban đêm là lạc đề */
  const coDem = sp.tu.some(k => k.t === 'phao hoa' || k.t === 'show' || k.t === 'symphony' || k.t === 'kiss of the sea');
  const theoTu = new Map(sp.tu.map(k => [k.t, []]));
  /* Khớp NGUYÊN TỪ và CÓ DẤU: bỏ dấu thì "khách sạn hồ bơi" thành "san ho" = "san hô",
     thư mục "Canon" chứa "cano". Chỉ tên thư mục/file gõ không dấu mới so kiểu không dấu. */
  const tu = sp.tu.map(k => Object.assign({ pg: ' ' + (k.g || k.t) + ' ', pt: ' ' + k.t + ' ' }, k));
  for (const i of items) {
    if (i.loai === 'r' || (i.diem && i.diem <= 3)) continue;
    const { ai, dg, dgKhongDau } = chuan(i);
    if (!coDem && (ai.includes(' đêm ') || ai.includes(' pháo hoa '))) continue;
    let s = 0, chinh = null;
    for (const k of tu) {
      const hit = ai.includes(k.pg) ? k.w * 1.5 : (dg.includes(k.pg) || dgKhongDau.includes(k.pt)) ? k.w : 0;
      s += hit;
      if (hit && (!chinh || k.w > chinh.w)) chinh = k;
    }
    /* phải trúng ít nhất một địa danh/trải nghiệm chính (trọng số ≥2), từ chung như "đảo" không đủ */
    if (s < 3 || !chinh || chinh.w < 2) continue;
    theoTu.get(chinh.t).push([s + (i.diem || 5) / 2, i]);
  }
  /* Xoay vòng theo từng địa danh trong lịch trình (trọng số cao trước) để mỗi điểm đến
     đều có ảnh; trong một địa danh lấy ảnh điểm cao, tối đa 2 ảnh một thư mục */
  const hang = [...theoTu.entries()].filter(([, a]) => a.length)
    .sort((a, b) => (sp.tu.find(k => k.t === b[0]).w - sp.tu.find(k => k.t === a[0]).w))
    .map(([, a]) => a.sort((x, y) => y[0] - x[0] || y[1].mod - x[1].mod));
  const moiTM = new Map(); const kq = []; const da = new Set();
  for (let vong = 0; kq.length < n && hang.some(a => a.length > vong); vong++) {
    for (const a of hang) {
      const x = a[vong]; if (!x) continue;
      const i = x[1], k = i.duong.join('/');
      if (da.has(i.t) || (moiTM.get(k) || 0) >= 2) continue;
      moiTM.set(k, (moiTM.get(k) || 0) + 1); da.add(i.t); kq.push(i);
      if (kq.length >= n) break;
    }
  }
  return kq;
}

module.exports = { danhSach, goiYChoSanPham };
