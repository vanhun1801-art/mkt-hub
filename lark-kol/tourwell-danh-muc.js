'use strict';
/**
 * Danh mục Tourwell cho bảng kê — anh Hùng 23/09/2026: "thêm dòng nên lấy từ
 * Tourwell về sẽ khớp hơn là tự nhập". CHỈ ĐỌC, không tạo gì trên Tourwell.
 *
 *   sanPham()        GET /api/v1/products              — tour, vé, combo (202 mã, giá = 0 trên Tourwell)
 *   nhaCungCap()     GET /api/v1/suppliers (mọi trang)  — khách sạn, nhà hàng, xe… (~450)
 *   dichVuNcc(id)    GET /api/v1/suppliers/products     — bảng giá net của một nhà cung cấp
 *
 * Máy chủ Tourwell bỏ qua per_page (luôn 25 dòng) và chặn 60 yêu cầu/phút; lark-chung
 * đã xếp hàng 1,5 giây/lần. Nhà cung cấp ~18 trang → ~30 giây cho lần đầu, nên đệm
 * trong bộ nhớ + tệp du-lieu/ (sống qua restart; Render mất tệp khi deploy — không sao,
 * lần đầu nạp lại).
 */
const fs = require('fs');
const path = require('path');
const tw = require('../lark-chung/tourwell');

const TEP = path.join(__dirname, 'du-lieu', 'tourwell-danh-muc.json');
const SONG = { sanPham: 6 * 3600000, ncc: 12 * 3600000, dv: 3600000 };
let kho = { sanPham: null, spLuc: 0, ncc: null, nccLuc: 0, dv: {} };
try { kho = { ...kho, ...JSON.parse(fs.readFileSync(TEP, 'utf8')), dv: {} }; } catch (_) {}
const luu = () => { try { fs.mkdirSync(path.dirname(TEP), { recursive: true }); fs.writeFileSync(TEP, JSON.stringify({ ...kho, dv: undefined })); } catch (_) {} };

const coToken = () => { try { return !!tw.docCauHinh().token; } catch (_) { return false; } };

/* Loại trên Tourwell → nhóm của bảng kê. */
function nhomTheoLoai(loai) {
  const s = String(loai || '').toLowerCase();
  if (/vé|tham quan/.test(s)) return 'Vé tham quan';
  if (/khách sạn|lưu trú|resort|villa|homestay/.test(s)) return 'Lưu trú';
  if (/nhà hàng|ăn/.test(s)) return 'Ăn uống';
  if (/xe|phương tiện|vận chuyển|máy bay|tàu/.test(s)) return 'Di chuyển';
  if (/tour|combo|thuyền|teambuilding|event/.test(s)) return 'Tour';
  return 'Khác';
}

let bay = {};
const mot = (k, fn) => { if (!bay[k]) bay[k] = fn().finally(() => { delete bay[k]; }); return bay[k]; };

async function sanPham({ moi = false } = {}) {
  if (!moi && kho.sanPham && Date.now() - kho.spLuc < SONG.sanPham) return kho.sanPham;
  return mot('sp', async () => {
    const r = await tw.goi('GET', '/api/v1/products?limit=1000&is_active=1');
    kho.sanPham = (r.data || []).filter((x) => x.active !== 0).map((x) => ({
      id: x.id, ma: x.code, ten: String(x.name || '').replace(/^\*+\s*/, '').trim(), loai: x.type || '',
      nhom: nhomTheoLoai(x.type), thoiLuong: x.duration || '',
      gia: (x.pricing && x.pricing.sale_price) || 0,
    }));
    kho.spLuc = Date.now(); luu();
    return kho.sanPham;
  });
}

async function nhaCungCap({ moi = false } = {}) {
  if (!moi && kho.ncc && Date.now() - kho.nccLuc < SONG.ncc) return kho.ncc;
  return mot('ncc', async () => {
    const ds = [];
    let trang = 1, cuoi = 1;
    do {
      const r = await tw.goi('GET', '/api/v1/suppliers?page=' + trang);
      for (const x of r.data || []) {
        if (x.deleted_at) continue;
        ds.push({ id: x.id, ma: x.code, ten: String(x.name || '').trim(), loai: x.type_of_service || '', nhom: nhomTheoLoai(x.type_of_service),
          email: String(x.email || '').replace(/^mailto:/i, '').trim(), sdt: String(x.phone || '').trim(), diaChi: x.address || '' });
      }
      cuoi = (r.meta && r.meta.last_page) || 1;
      trang++;
    } while (trang <= cuoi && trang < 60);
    kho.ncc = ds; kho.nccLuc = Date.now(); luu();
    return ds;
  });
}

/** Bảng giá net của một nhà cung cấp, gom theo nhóm giá (vd "NLD D1 Bò Tơ"). */
async function dichVuNcc(id) {
  const c = kho.dv[id];
  if (c && Date.now() - c.luc < SONG.dv) return c.ds;
  const r = await tw.goi('GET', '/api/v1/suppliers/products?supplier_id=' + encodeURIComponent(id));
  const ds = [];
  for (const g of r.data || []) {
    for (const s of g.services || []) {
      if (s.status === 0 || s.deleted_at) continue;
      ds.push({ id: s.id, nhom: g.group_name || '', ten: s.name || (s.item_type === 'room' ? 'Phòng' : 'Dịch vụ'), loai: s.item_type,
        gia: Number(s.price_in) || 0, giaBan: Number(s.price_out) || 0, hieuLuc: s.date_range || g.date_range || '',
        moTa: String(s.description || g.description || '').replace(/\r/g, '').slice(0, 300) });
    }
  }
  kho.dv[id] = { luc: Date.now(), ds };
  return ds;
}

const trangThai = () => ({ coToken: coToken(), sanPham: kho.sanPham ? kho.sanPham.length : 0, spLuc: kho.spLuc,
  ncc: kho.ncc ? kho.ncc.length : 0, nccLuc: kho.nccLuc });

module.exports = { sanPham, nhaCungCap, dichVuNcc, nhomTheoLoai, trangThai, coToken };
