'use strict';
/**
 * ============================================================================
 * Lịch đổi thông tin — đặt trước một thay đổi, tới ngày thì tự áp
 * ============================================================================
 *
 * Kinh doanh gửi đợt đổi lịch trình cho 8 tour, hẹn ngày 01/10. Trước đây phòng
 * phải nhớ rồi tới hôm đó ngồi sửa tay từng dòng — nhớ sót thì bài đăng nói một
 * đằng, tour chạy một nẻo.
 *
 * Cách chạy: KHÔNG có cron. Mỗi lần app đọc dữ liệu (`kho.tatCa`) thì kiểm luôn
 * bảng lịch, dòng nào tới hạn thì ghi xuống Base ngay lúc đó.
 *
 * Vì sao không cron:
 *  · App chạy như tiến trình con trong lớp vỏ, và trên Render nó có thể bị ngủ.
 *    Một cron trong tiến trình sẽ im lặng không chạy đúng lúc ngủ, mà không ai biết.
 *  · Đọc-thì-áp tự lành: app ngủ qua ngày 01/10, sáng 02/10 có người mở là nó áp
 *    ngay, kèm nhật ký. Chậm tối đa bằng lần mở app kế tiếp — mà app này mở để
 *    xem thông tin sản phẩm, nên không ai đọc thì cũng chẳng ai thấy bản cũ.
 *  · Lớp vỏ còn gọi /api/tong-quan cho trang Tổng quan, nên thực tế nó được gọi
 *    vài phút một lần trong giờ làm.
 *
 * Chạy một lần một: `kho.tatCa` gom mọi lời gọi song song vào một promise, nên
 * hai tab mở cùng lúc không áp hai lần.
 */
const cfg = require('./config');

/** Nhãn cột -> khoá trong cfg.suaDuoc. Dựng một lần, dùng lại. */
const THEO_NHAN = new Map(
  Object.entries(cfg.suaDuoc).map(([khoa, o]) => [o.nhan, khoa])
);

/** Cột nào đặt lịch được — giao diện hỏi cái này thay vì tự giữ danh sách. */
const COT_DAT_DUOC = [...THEO_NHAN.keys()];

/**
 * Một dòng lịch đã tới hạn chưa.
 *
 * So theo NGÀY chứ không theo mili giây: Base lưu "01/10/2026" thành 00:00 giờ
 * VN, nên `den <= now` là đúng ngay 0h ngày hôm đó.
 */
const toiHan = (r, nay = Date.now()) =>
  r.trangThai === 'Chờ áp dụng' && !!r.ngayApDung && r.ngayApDung <= nay;

/**
 * Áp các dòng tới hạn.
 *
 * @param ds       mảng sản phẩm đã dựng (sửa tại chỗ để khỏi đọc Base lần hai)
 * @param dsLich   mảng dòng lịch đã dựng
 * @param lark     backend ghi (lark.js hoặc larkapi.js)
 * @param doiTruong  hàm kiểm + đổi giá trị của server.js — DÙNG CHUNG cố ý:
 *                 lịch đặt trước và người bấm tay phải qua đúng một cửa kiểm,
 *                 nếu không thì đặt lịch trở thành đường vòng để ghi giá trị mà
 *                 bấm tay bị chặn.
 * @returns {Promise<Array>} các dòng đã xử lý, để server ghi nhật ký
 */
async function apDungDenHan(ds, dsLich, lark, doiTruong, nay = Date.now()) {
  const den = dsLich.filter((r) => toiHan(r, nay));
  if (!den.length) return [];

  const theoId = new Map(ds.map((p) => [p.id, p]));
  const capNhatSP = {};   // recordId sản phẩm -> { fieldId: giá trị }
  const capNhatLich = {}; // recordId lịch     -> { fieldId: giá trị }
  const ketQua = [];

  for (const r of den) {
    const khoa = THEO_NHAN.get(r.cot);
    const p = r.spIds.length ? theoId.get(r.spIds[0]) : null;

    /* Không áp được thì đánh dấu LỖI kèm lý do, đừng để nó nằm mãi ở "Chờ áp
       dụng" — một dòng chờ vĩnh viễn trông y hệt một dòng chưa tới hạn. */
    let loi = '';
    if (!p) loi = 'Chưa gán sản phẩm nào cho dòng này.';
    else if (!khoa) loi = 'Cột "' + (r.cot || '(trống)') + '" không nằm trong danh sách app được ghi.';

    let o = null;
    if (!loi) {
      try { o = doiTruong(khoa, r.giaTriMoi); } catch (e) { loi = e.message; }
    }

    if (loi) {
      capNhatLich[r.id] = {
        [cfg.f.lich.trangThai]: 'Lỗi',
        [cfg.f.lich.ghiChu]: loi,
      };
      ketQua.push({ id: r.id, ok: false, loi, ten: r.ten });
      continue;
    }

    const cu = p[khoa];
    capNhatSP[p.id] = Object.assign(capNhatSP[p.id] || {}, { [cfg.f.sp[o.field]]: o.giaTri });
    capNhatLich[r.id] = {
      [cfg.f.lich.trangThai]: 'Đã áp dụng',
      [cfg.f.lich.giaTriCu]: cu == null || cu === '' ? '(trống)' : String(cu),
      [cfg.f.lich.apDungLuc]: gioBase(nay),
    };
    /* Sửa luôn bản trong bộ nhớ: lần đọc này đã lỡ lấy dữ liệu cũ rồi, không
       vá thì người mở app đúng lúc đó vẫn thấy bản cũ thêm một nhịp. */
    p[khoa] = o.field === 'giaNL' || o.field === 'giaTE' ? o.giaTri
      : /^hieuLuc/.test(o.field) ? (o.giaTri ? Date.parse(String(o.giaTri).slice(0, 10) + 'T00:00:00+07:00') : 0)
        : (o.giaTri == null ? '' : o.giaTri);
    ketQua.push({ id: r.id, ok: true, ten: r.ten, ma: p.ma, cot: r.cot,
      spId: p.id, cu, moi: o.giaTri });
  }

  /* Ghi sản phẩm TRƯỚC, đánh dấu lịch SAU. Đổi thứ tự thì lúc mạng đứt giữa
     chừng sẽ có dòng lịch ghi "Đã áp dụng" trong khi sản phẩm chưa đổi gì —
     và không ai đi tìm lại nữa. Ngược lại thì lần đọc sau nó thử lại. */
  if (Object.keys(capNhatSP).length) await lark.updateMany(capNhatSP, cfg.spTableId);
  if (Object.keys(capNhatLich).length) await lark.updateMany(capNhatLich, cfg.lichTableId);

  return ketQua;
}

/** Giờ VN dạng Base nhận: "YYYY-MM-DD HH:mm:ss". */
function gioBase(t) {
  const d = new Date(t + 7 * 3600000);
  const h = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + h(d.getUTCMonth() + 1) + '-' + h(d.getUTCDate()) +
    ' ' + h(d.getUTCHours()) + ':' + h(d.getUTCMinutes()) + ':' + h(d.getUTCSeconds());
}

module.exports = { apDungDenHan, toiHan, COT_DAT_DUOC, THEO_NHAN, gioBase };
