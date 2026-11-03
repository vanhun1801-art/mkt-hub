'use strict';
/**
 * Đồng bộ hộp pito@routinehospitality.vn → Base "OTA Routine Hospitality".
 *
 *   thư GoHost / Agoda  →  sự kiện (gohost.js)  →  booking (gop.js)  →  Base
 *
 * Chỉ ĐỌC thư: không đánh dấu đã đọc, không chuyển thư mục. Chỉ thêm và sửa dòng
 * trong Base riêng của Routine, không xoá dòng nào.
 *
 * Đọc thư qua lớp của app Hộp thư (lark-hop-thu/thu.js): máy cá nhân dùng lark-cli,
 * bản chung trên Render truyền tenant token để gọi thẳng OpenAPI Mail.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const lark = cfg.mode === 'api' ? require('../larkapi') : require('../lark');
const thu = require('../../lark-hop-thu/thu');
const G = require('./gohost');
const { gop } = require('./gop');

const R = cfg.routine;
const BO_DEM = path.join(__dirname, '.thu-da-doc.json');

/* Thư cần đọc thân. Thư khác của GoHost (hoá đơn, đổi trạng thái phòng) và của
 * Agoda (tin nhắn khách, đánh giá, khuyến mãi) bỏ qua ngay từ tiêu đề. */
const LA_GOHOST = (t) => /@gohost\.vn$/.test(t.tu.email) &&
  /đơn đặt phòng mới|hủy đặt phòng|huỷ đặt phòng|đã nhận phòng|đã trả phòng|đã thêm thanh toán|đã đổi phòng|Đơn OTA có sửa đổi/i.test(t.tieuDe);
const LA_AGODA = (t) => /@agoda\.com$/.test(t.tu.email) && /Agoda Booking ID \d+ - (CONFIRMED|CANCELLED)/i.test(t.tieuDe);

/* Sự kiện đã đọc theo mã thư: thư không đổi nên không đọc lại thân. Mất tệp (Render
 * khởi động lại) thì chỉ chậm lần đầu. */
function napBoDem() { try { return JSON.parse(fs.readFileSync(BO_DEM, 'utf8')); } catch (_) { return {}; } }
function luuBoDem(o) { try { fs.writeFileSync(BO_DEM, JSON.stringify(o)); } catch (_) {} }

async function tokenThu() {
  return cfg.mode === 'api' ? lark.tenantToken() : '';
}

/** Đọc thư mới, trả [{ luc, su }] của mọi thư booking trong cửa sổ đọc. */
async function docThu() {
  const tk = await tokenThu();
  const ds = [];
  for (const thuMuc of ['INBOX', 'ARCHIVED']) {
    ds.push(...await thu.danhSach(R.hop, R.soThu, tk, thuMuc));
  }
  const boDem = napBoDem();
  const ra = [];
  let moi = 0;
  for (const t of ds) {
    const nguon = LA_GOHOST(t) ? 'gohost' : LA_AGODA(t) ? 'agoda' : '';
    if (!nguon) continue;
    if (!(t.id in boDem)) {
      const d = await thu.doc(R.hop, t.id, tk);
      const su = nguon === 'gohost' ? G.docGoHost(d.tieuDe, d.noiDung) : G.docAgoda(d.tieuDe, d.noiDung);
      boDem[t.id] = su ? { luc: t.ngay, su: { ...su, nguon } } : null;
      moi++;
    }
    if (boDem[t.id]) ra.push(boDem[t.id]);
  }
  if (moi) luuBoDem(boDem);
  return { suKien: ra, soThu: ds.length, thuMoi: moi };
}

/* ---------------- booking ↔ dòng Base ---------------- */

const gioBase = (s) => (!s ? null : s.length === 10 ? s + ' 00:00:00' : s.slice(0, 16) + ':00');

/** Booking → { tên cột: giá trị } chỉ gồm ô có dữ liệu (không xoá ô người đã điền). */
function sangDong(b) {
  const o = {
    'Mã đặt phòng': b.maGoHost,
    'Kênh': b.kenh,
    'Mã OTA': b.maOta,
    'Tên khách': b.tenKhach,
    'Trạng thái': b.trangThai,
    'Ngày đặt': gioBase(b.ngayDat),
    'Nhận phòng': gioBase(b.nhanPhong),
    'Trả phòng': gioBase(b.traPhong),
    'Số đêm': b.soDem,
    'Phòng': b.phong,
    'Hạng phòng': b.hangPhong,
    'Số khách': b.soKhach,
    'Quốc gia': b.quocGia,
    'Số tiền': b.soTien,
    'Hoa hồng OTA': b.hoaHong,
    'Giá bán OTA': b.giaBan,
    'Đã thanh toán': b.daThanhToan,
    'OTA đã sửa': b.daSua ? true : undefined,
    'Yêu cầu / ghi chú': [b.yeuCau, b.ghiChu].filter(Boolean).join('\n') || undefined,
    'Lịch sử': b.suKien.join('\n'),
    'Thư mới nhất': gioBase(b.capNhat),
  };
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null || o[k] === '') delete o[k];
  return o;
}

const chu = (v) => (Array.isArray(v) ? v.map((x) => (x && (x.text || x.name)) || x).join('') : v == null ? '' : String(v));

/** Đọc bảng Routine: [{ id, ma, lichSu }] */
async function docBang() {
  return lark.voiBase(R.baseToken, async () => {
    const cot = await lark.listFields(R.tableId);
    const id = (ten) => (cot.find((c) => c.name === ten) || {}).id;
    const fMa = id('Mã đặt phòng'), fLs = id('Lịch sử');
    if (!fMa || !fLs) throw new Error('Bảng Routine thiếu cột "Mã đặt phòng" hoặc "Lịch sử"');
    const ds = await lark.listAll(R.tableId);
    return ds.map((r) => ({ id: r.id, ma: chu(r.c[fMa]).trim(), lichSu: chu(r.c[fLs]) }));
  });
}

/**
 * Chạy một lượt. `ghi: false` = chỉ đọc và báo sẽ thêm/sửa gì.
 * @returns {{ soThu, thuMoi, soBooking, them, sua, giuNguyen }}
 */
async function dongBo({ ghi = true } = {}) {
  const { suKien, soThu, thuMoi } = await docThu();
  const bookings = gop(suKien);
  const coSan = new Map((await docBang()).map((r) => [r.ma, r]));

  const them = [], sua = {};
  for (const b of bookings) {
    const r = coSan.get(b.maGoHost);
    if (!r) { them.push(sangDong(b)); continue; }
    /* Thư cũ có thể đã trôi khỏi cửa sổ đọc: gộp lịch sử cũ + mới, và chỉ ghi khi
     * có dòng lịch sử mới, để không ghi đè thông tin cũ bằng bản thiếu hơn. */
    const cu = r.lichSu.split('\n').filter(Boolean);
    const gopLai = [...new Set([...cu, ...b.suKien])].sort((x, y) => (x.slice(0, 16) < y.slice(0, 16) ? -1 : x.slice(0, 16) > y.slice(0, 16) ? 1 : 0));
    if (gopLai.length === cu.length) continue;
    sua[r.id] = sangDong({ ...b, suKien: gopLai });
  }

  if (ghi) {
    await lark.voiBase(R.baseToken, async () => {
      if (them.length) await lark.createMany(R.tableId, them);
      if (Object.keys(sua).length) await lark.updateMany(R.tableId, sua);
    });
  }
  return {
    soThu, thuMoi, soBooking: bookings.length,
    them: them.length, sua: Object.keys(sua).length,
    giuNguyen: bookings.length - them.length - Object.keys(sua).length,
    luc: new Date().toISOString(),
  };
}

module.exports = { dongBo, docThu, docBang, sangDong };

/* node routine/dong-bo.js        → đồng bộ thật
 * node routine/dong-bo.js --thu  → chỉ đọc, in số dòng sẽ thêm/sửa */
if (require.main === module) {
  dongBo({ ghi: !process.argv.includes('--thu') })
    .then((kq) => { console.log(JSON.stringify(kq, null, 2)); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
