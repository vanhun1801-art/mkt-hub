'use strict';
/**
 * Hai bảng danh mục của base: "Danh mục OTA" và "Danh mục Tour".
 *
 * VÌ SAO PHẢI ĐỌC CHÚNG: bảng Bookings không tự chứa kênh và tour — nó TRỎ sang
 * đây bằng cột liên kết. Mọi con tiền trong base đều mọc ra từ hai link đó:
 *
 *   Hoa hồng VND      = Gross VND × [OTA].[Hoa hồng %]
 *   Doanh thu thu về  = Người lớn × [Tour].[Giá thu về NL] + Trẻ em × [Tour].[Giá thu về TE]
 *
 * Nên webhook ghi vào mà KHÔNG nối được hai link thì dòng đó ra 0đ — trông như
 * booking không đáng tiền, chứ không hề báo lỗi. Đó là lý do schema.js coi việc
 * đọc được hai bảng này là điều kiện để nói "đã nối Base".
 *
 * Danh mục cũng là NGUỒN GIÁ: giá thu về nằm trong Danh mục Tour chứ không phải
 * trong code. Sửa giá là sửa trong Base, app không cần deploy lại (xem gia.js).
 */
const cfg = require('./config');
const lark = require('./lark');
const schema = require('./schema');

/* Danh mục đổi rất thưa (thêm tour, sửa % hoa hồng) nên đệm dài hơn booking
 * nhiều. Bấm "Dò lại lược đồ" trong tab Thiết lập là xoá đệm ngay. */
const TTL_MS = Number(process.env.OTA_DANHMUC_TTL || 10 * 60 * 1000);

let dem = null;      // { at, data }
let dangNap = null;

const txt = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(txt).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.text || v.name || v.link || '');
  return String(v);
};
const clean = (v) => txt(v).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(txt(v)).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * % hoa hồng trong Base ghi dạng phân số (0.15 = 15%) vì cột định dạng phần trăm.
 * Nhưng người vận hành hoàn toàn có thể gõ 15 vào đó. Nhận cả hai: ≤ 1 coi là
 * phân số, > 1 coi là phần trăm. Trả về SỐ PHẦN TRĂM để app hiển thị.
 */
function phanTram(v) {
  const n = num(v);
  if (n == null) return null;
  return n <= 1 ? n * 100 : n;
}

async function nap() {
  const luoc = await schema.doc();
  const dm = luoc.danhMuc || {};
  const ra = { ota: [], tour: [], luc: Date.now(), loi: '' };

  if (dm.ota && dm.ota.ok) {
    const F = dm.ota.fields;
    const rows = await lark.listAll(dm.ota.tableId);
    ra.ota = rows.map((r) => ({
      recordId: r.id,
      ten: clean(r.c[F.ten]),
      ma: clean(r.c[F.ma]),
      hoaHong: phanTram(r.c[F.hoaHong]),
      tienTe: (clean(r.c[F.tienTe]) || '').toUpperCase(),
      thiTruong: clean(r.c[F.thiTruong]),
      dangHopTac: r.c[F.dangHopTac] === true,
    })).filter((x) => x.ten);
  } else {
    ra.loi = (dm.ota && dm.ota.loi) || 'Chưa đọc được Danh mục OTA';
  }

  if (dm.tour && dm.tour.ok) {
    const F = dm.tour.fields;
    const rows = await lark.listAll(dm.tour.tableId);
    ra.tour = rows.map((r) => ({
      recordId: r.id,
      ten: clean(r.c[F.ten]),
      ma: clean(r.c[F.ma]),
      nguoiLon: num(r.c[F.nguoiLon]),
      treEm: num(r.c[F.treEm]),
      ghiChu: clean(r.c[F.ghiChu]),
      dangBan: r.c[F.dangBan] === true,
    })).filter((x) => x.ten);
  } else if (!ra.loi) {
    ra.loi = (dm.tour && dm.tour.loi) || 'Chưa đọc được Danh mục Tour';
  }

  return ra;
}

async function get({ force = false } = {}) {
  if (!force && dem && Date.now() - dem.at < TTL_MS) return dem.data;
  if (dangNap) return dangNap;
  dangNap = nap()
    .then((d) => { dem = { at: Date.now(), data: d }; dangNap = null; return d; })
    .catch((e) => {
      dangNap = null;
      /* Không ném ra ngoài: danh mục hỏng thì app vẫn phải nhận được webhook.
       * Trả danh sách rỗng kèm lý do, phía trên tự bật cờ "chưa nối được". */
      const d = { ota: [], tour: [], luc: Date.now(), loi: e.message };
      dem = { at: Date.now(), data: d };
      return d;
    });
  return dangNap;
}

function xoaCache() { dem = null; }

/* --------------------------------------------------------------- tra cứu -- */

const chuan = (s) => String(s == null ? '' : s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

/**
 * Kênh của app → bản ghi trong Danh mục OTA.
 *
 * Tên không phải lúc nào cũng trùng: app gọi "Ctrip", danh mục ghi
 * "Ctrip / Trip.com". Nên thử theo thứ tự chắc chắn dần: mã (KLK, GYG…) →
 * tên đúng → tên chứa nhau. Không thấy thì trả null và để phía gọi bật cờ, TUYỆT
 * ĐỐI không lấy bừa bản ghi đầu tiên — gán nhầm kênh là sai % hoa hồng.
 */
function timOta(ds, kenh) {
  if (!kenh) return null;
  const ten = chuan(kenh.ten);
  const ma = chuan(kenh.ma || kenh.id);
  return ds.find((x) => x.ma && chuan(x.ma) === ma) ||
    ds.find((x) => chuan(x.ten) === ten) ||
    ds.find((x) => ten.length >= 4 && chuan(x.ten).includes(ten)) ||
    ds.find((x) => ten.length >= 4 && ten.includes(chuan(x.ten))) ||
    null;
}

module.exports = { get, xoaCache, timOta, phanTram, chuan };
