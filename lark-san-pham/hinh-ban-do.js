'use strict';
/**
 * Hình minh hoạ của bản đồ du lịch (tab Bản đồ) — quản lý tải lên NGAY TRONG APP.
 *
 * Trước 26/09 muốn thay hình phải bỏ file vào lark-ban-do/hinh-rieng/ trên máy anh Hùng,
 * đóng gói rồi đẩy code lên Render. Giờ hình nằm trên Base (bảng "Hình bản đồ", cfg.hinhTableId):
 *   · quản lý chọn file ở tab Quản lý → TRÌNH DUYỆT cắt sát viền trong suốt + nén WebP 512 px
 *     (không cần thư viện ảnh trên máy chủ) → gửi lên đây → ghi vào ô đính kèm của Base
 *   · bản đồ đọc /ban-do/hinh-rieng.js = hình dựng sẵn trong repo + hình trên Base (Base thắng)
 *   · xoá dòng trên Base (nút "Về mặc định") = quay về hình dựng sẵn / hình vẽ sẵn
 *
 * Mã hợp lệ = mã 31 điểm trong lark-ban-do/diem.js + phương tiện (xe-may-bay, xe-may-bay-2 …).
 * Lạ mã là từ chối: bản đồ chỉ đọc những mã nó biết, ghi mã lạ chỉ tạo rác trên Base.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

const F = cfg.f.hinh;
const BD = path.join(__dirname, '..', 'lark-ban-do');
/* [mã, tên, số mẫu cho chọn] — bản đồ có 3 máy bay, 8 tàu, 3 cano, 4 cabin, 2 thuyền buồm */
const XE = [['xe-may-bay', 'Máy bay', 3], ['xe-tau', 'Tàu cao tốc', 4], ['xe-cano', 'Cano', 3], ['xe-cabin', 'Cabin cáp treo', 2], ['xe-buom', 'Thuyền buồm', 2]];
const TRAN_BYTE = 1.5 * 1024 * 1024;

const chu = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? (x.text || x.name || '') : String(x))).join('')
  : v == null ? '' : String(v)).trim();

let oDem = null;
function danhSachO() {
  if (oDem) return oDem;
  let diem = [];
  try { diem = require(path.join(BD, 'diem.js')).DIEM.map((d) => ({ ma: d.id, ten: d.ten, nhom: 'diem' })); } catch (_) { /* không có bản đồ */ }
  const xe = XE.flatMap(([ma, ten, n]) => Array.from({ length: n }, (_, i) => ({
    ma: i ? ma + '-' + (i + 1) : ma, ten: ten + (i ? ' — mẫu ' + (i + 1) : ''), nhom: 'xe',
  })));
  oDem = [...diem, ...xe];
  return oDem;
}
const laMa = (ma) => danhSachO().some((o) => o.ma === ma);

/* hình dựng sẵn trong repo (lark-ban-do/public/hinh-rieng.js do tao/hinh-rieng.js sinh) */
let gocDem = null;
function hinhGoc() {
  if (gocDem) return gocDem;
  try {
    const s = fs.readFileSync(path.join(BD, 'public', 'hinh-rieng.js'), 'utf8');
    gocDem = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  } catch (_) { gocDem = {}; }
  return gocDem;
}

/* ---- bảng Hình bản đồ trên Base ---- */
let dsDem = null;
async function docBase({ moi = false } = {}) {
  if (!moi && dsDem && Date.now() - dsDem.luc < 60000) return dsDem.ds;
  const rs = await lark.listAllRecords(cfg.hinhTableId);
  const ds = rs.map((r) => {
    const c = r.cells || {};
    const tep = (Array.isArray(c[F.hinh]) ? c[F.hinh] : [])[0] || null;
    return {
      id: r.record_id, ma: chu(c[F.ma]), ten: chu(c[F.ten]), co: +c[F.co] || 1, khung: chu(c[F.khung]), nguoi: chu(c[F.nguoi]),
      tep: tep && (tep.file_token || tep.fileToken || tep.token) || null,
    };
  }).filter((o) => o.ma);
  dsDem = { luc: Date.now(), ds };
  return ds;
}
const xoaDem = () => { dsDem = null; jsDem = null; };

const anhDem = new Map();                                 // file_token → Buffer (tệp đã nén, vài chục KB)
async function layAnh(o) {
  if (!anhDem.has(o.tep)) {
    const { buffer } = await lark.downloadAttachmentBuffer(o.id, o.tep, cfg.hinhTableId);
    if (anhDem.size > 80) anhDem.delete(anhDem.keys().next().value);
    anhDem.set(o.tep, buffer);
  }
  return anhDem.get(o.tep);
}
const kieuAnh = (b) => (b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b.slice(0, 4).toString() === 'RIFF' ? 'image/webp'
  : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : /<svg/i.test(b.slice(0, 400).toString()) ? 'image/svg+xml' : 'image/webp');

/* ---- window.PQ_HINH_RIENG cho bản đồ: hình dựng sẵn + hình trên Base ---- */
let jsDem = null;
async function hinhRiengJs() {
  const ds = await docBase();
  const khoa = ds.map((o) => o.ma + ':' + o.tep + ':' + o.co).join('|');
  if (jsDem && jsDem.khoa === khoa) return jsDem.js;
  const ra = Object.assign({}, hinhGoc());
  for (const o of ds) {
    if (!laMa(o.ma)) continue;
    if (o.tep) {
      try {
        const b = await layAnh(o);
        const [w, h] = o.khung.split('x').map(Number);
        ra[o.ma] = { url: 'data:' + kieuAnh(b) + ';base64,' + b.toString('base64'), w: w || 0, h: h || 0, co: o.co };
      } catch (e) { console.error('[HÌNH BẢN ĐỒ] không tải được', o.ma, e.message); }
    } else if (ra[o.ma]) ra[o.ma] = Object.assign({}, ra[o.ma], { co: o.co });   // chỉ chỉnh cỡ
  }
  const js = '/* Hình bản đồ: dựng sẵn trong repo + bảng "Hình bản đồ" trên Base (Base thắng). */\nwindow.PQ_HINH_RIENG = ' + JSON.stringify(ra) + ';\n';
  jsDem = { khoa, js };
  return js;
}

/** Ảnh một ô (để hiện hình nhỏ ở màn quản lý). Trả { buffer, kieu } hoặc null. */
async function anhCua(ma) {
  const o = (await docBase()).find((x) => x.ma === ma && x.tep);
  if (o) { const b = await layAnh(o); return { buffer: b, kieu: kieuAnh(b) }; }
  const g = hinhGoc()[ma];
  const url = g && (g.url || g);
  const m = typeof url === 'string' && url.match(/^data:([^;]+);base64,(.*)$/);
  return m ? { buffer: Buffer.from(m[2], 'base64'), kieu: m[1] } : null;
}

/** Danh sách ô cho màn quản lý: mọi điểm + phương tiện, kèm trạng thái hình. */
async function danhSach() {
  const ds = await docBase();
  const goc = hinhGoc();
  return danhSachO().map((o) => {
    const b = ds.find((x) => x.ma === o.ma);
    return Object.assign({}, o, {
      nguon: b && b.tep ? 'base' : goc[o.ma] ? 'goc' : 've-san',
      co: b ? b.co : (goc[o.ma] && goc[o.ma].co) || 1,
      nguoi: b ? b.nguoi : '',
      luc: b && b.tep ? b.tep.slice(-6) : '',
    });
  });
}

async function timHoacTao(ma, ten) {
  let o = (await docBase({ moi: true })).find((x) => x.ma === ma);
  if (!o) {
    await lark.createRecord({ [F.ma]: ma, [F.ten]: ten }, cfg.hinhTableId);
    o = (await docBase({ moi: true })).find((x) => x.ma === ma);
  }
  if (!o) throw new Error('Không tạo được dòng cho ' + ma + ' trên bảng Hình bản đồ');
  return o;
}

/** Ghi hình mới (dataURL đã nén ở trình duyệt). */
async function ghiHinh({ ma, anh, w, h, co }, nguoi) {
  if (!laMa(ma)) throw Object.assign(new Error('Mã hình lạ: ' + ma), { http: 400 });
  const m = String(anh || '').match(/^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw Object.assign(new Error('Hình phải là ảnh WebP/PNG/JPEG đã mã hoá'), { http: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > TRAN_BYTE) throw Object.assign(new Error('Hình sau khi nén vẫn quá lớn (' + Math.round(buf.length / 1024) + ' KB)'), { http: 413 });
  const ten = (danhSachO().find((o) => o.ma === ma) || {}).ten || ma;
  const o = await timHoacTao(ma, ten);
  await lark.uploadAttachment(o.id, F.hinh, buf, ma + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]), cfg.hinhTableId);
  const sua = { [F.khung]: Math.round(+w || 0) + 'x' + Math.round(+h || 0), [F.nguoi]: nguoi || '' };
  if (co != null && +co > 0) sua[F.co] = Math.min(3, Math.max(.3, +co));
  await lark.updateRecord(o.id, sua, cfg.hinhTableId);
  xoaDem();
}

async function ghiCo(ma, co, nguoi) {
  if (!laMa(ma)) throw Object.assign(new Error('Mã hình lạ: ' + ma), { http: 400 });
  const so = Math.min(3, Math.max(.3, +co || 1));
  const o = await timHoacTao(ma, (danhSachO().find((x) => x.ma === ma) || {}).ten || ma);
  await lark.updateRecord(o.id, { [F.co]: so, [F.nguoi]: nguoi || '' }, cfg.hinhTableId);
  xoaDem();
}

async function veMacDinh(ma) {
  const o = (await docBase({ moi: true })).find((x) => x.ma === ma);
  if (o) await lark.deleteRecords([o.id], cfg.hinhTableId);
  xoaDem();
}

module.exports = { danhSach, hinhRiengJs, anhCua, ghiHinh, ghiCo, veMacDinh, xoaDem, danhSachO };
