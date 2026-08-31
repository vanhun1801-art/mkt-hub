'use strict';
/**
 * Đường đi của một booking từ OTA vào hệ thống.
 *
 *   OTA  →  POST /webhook/<kênh>  →  chuanhoa.js  →  hàng đợi cục bộ  →  Lark Base
 *                                                     (ghi trước)      (đẩy sau)
 *
 * Ghi vào hàng đợi TRƯỚC rồi mới đẩy vào Base là có chủ ý: Lark lỗi hay token hết
 * hạn thì webhook vẫn trả 200 và booking vẫn còn, chỉ nằm chờ. Trả 500 cho OTA là
 * cách mất booking nhanh nhất — phần lớn OTA chỉ thử lại vài lần rồi thôi.
 *
 * CHỐNG TRÙNG hai lớp:
 *   1. hàng đợi — khoá (kênh, mã booking), giữ luôn record_id đã tạo;
 *   2. Base — trước khi tạo mới còn soi lại dữ liệu Base xem mã đó có chưa.
 * Lớp 2 tồn tại vì ổ đĩa Render là tạm: sau mỗi deploy hàng đợi trắng, mà OTA thì
 * vẫn có thể gửi lại booking cũ.
 */
const cfg = require('./config');
const lark = require('./lark');
const schema = require('./schema');
const store = require('./store');
const danhmuc = require('./danhmuc');
const gia = require('./gia');
const hangdoi = require('./hangdoi');
const H = require('./chuanhoa');

/* Những trường do sales điền tay khi OTA không trả. OTA gửi có giá trị thì OTA
 * thắng (nó là nguồn sự thật); OTA gửi trống thì GIỮ số cũ, không xoá công của
 * sales — đây đúng là tình huống "OTA chưa trả điểm đón" mà chị nói. */
const GIU_NEU_OTA_TRONG = ['sdt', 'email', 'diemDon', 'gioDon', 'ghiChu', 'ngonNgu', 'tenKhach', 'tour'];

function gopVoiCu(moi, cu) {
  if (!cu) return moi;
  const ra = { ...moi };
  GIU_NEU_OTA_TRONG.forEach((k) => {
    if (!ra[k] && cu[k]) { ra[k] = cu[k]; ra['giuCu_' + k] = true; }
  });
  // số khách / tiền: OTA trả null thì giữ số cũ
  ['nguoiLon', 'treEm', 'tongKhach', 'tongTien', 'hoaHong', 'thucNhan'].forEach((k) => {
    if (ra[k] == null && cu[k] != null) ra[k] = cu[k];
  });
  if (!ra.ngayDi && cu.ngayDi) ra.ngayDi = cu.ngayDi;
  if (!ra.ngayDat && cu.ngayDat) ra.ngayDat = cu.ngayDat;
  ra.daNhan = !!(moi.daNhan || cu.daNhan);
  return ra;
}

/**
 * Nối booking với hai bản ghi danh mục — BƯỚC KHÔNG ĐƯỢC BỎ.
 *
 * Bảng Bookings không chứa kênh và tour, nó trỏ sang danh mục bằng cột liên kết;
 * mọi công thức tiền của Base đều đi qua hai link đó. Ghi mà thiếu link thì dòng
 * ra 0đ, và tệ hơn: nó không báo lỗi gì cả, chỉ trông như một booking không đáng
 * tiền. Nên ở đây nối được thì gắn record_id, không nối được thì BẬT CỜ để cả
 * dashboard lẫn cột "Kiểm tra dữ liệu" của Base cùng nhìn thấy.
 *
 * @returns {{kenhRecordId, tourRecordId, canhBao: string[]}}
 */
async function noiDanhMuc(b) {
  const canhBao = [];
  const dm = await danhmuc.get();
  if (dm.tour && dm.tour.length) gia.capNhatTuDanhMuc(dm.tour);

  const kenh = cfg.kenh.find((k) => k.id === b.kenhId) || null;
  const oRec = danhmuc.timOta(dm.ota || [], kenh);
  if (!oRec) {
    canhBao.push('Không tìm thấy kênh "' + (b.kenh || b.kenhId) + '" trong ' + cfg.tableOtaName +
      ' — booking sẽ không có % hoa hồng.');
  }

  /* Tour: dùng đúng bộ luật nhận diện đa ngôn ngữ của gia.js, vì tên tour OTA gửi
   * không bao giờ trùng tên trong danh mục. */
  let tourRecordId = '';
  const kq = gia.nhanSanPham(b.tour, b.ngayDi);
  if (kq.loi === 'trung') {
    canhBao.push('Tên tour khớp nhiều sản phẩm (' + (kq.ungVien || []).join(' / ') +
      ') — chưa nối được, người vận hành chọn tay trong Base.');
  } else if (kq.loi) {
    canhBao.push('Không nhận ra tour "' + (b.tour || '(trống)') + '" trong ' + cfg.tableTourName +
      ' — booking sẽ không có doanh thu cho tới khi nối tay.');
  } else if (!kq.sanPham.recordId) {
    canhBao.push('Tour "' + kq.sanPham.ten + '" chưa có trong ' + cfg.tableTourName + '.');
  } else {
    tourRecordId = kq.sanPham.recordId;
  }

  return {
    kenhRecordId: oRec ? oRec.recordId : '',
    tourRecordId,
    tourTen: kq.loi ? '' : kq.sanPham.ten,
    hoaHongTyLe: oRec ? oRec.hoaHong : null,
    canhBao,
  };
}

/** Tìm record_id của một mã booking đã có trong Base (dùng dữ liệu đang cache). */
async function timTrongBase(kenhId, maBooking) {
  if (!maBooking) return null;
  try {
    const d = await store.get();
    if (d.nguon !== 'base') return null;
    const hit = d.rows.find((r) => r.maBooking === maBooking && (!kenhId || r.kenhId === kenhId));
    return hit ? { recordId: hit.recordId, cu: hit } : null;
  } catch (_) { return null; }
}

/**
 * Nhận một booking.
 * @param {string} kenhId  klook | kkday | gyg | ctrip | waug | myrealtrip | viator
 * @param {object} payload nguyên văn OTA gửi
 * @param {{dryRun?: boolean}} opts dryRun = chỉ soi mapping, không ghi gì
 */
async function nhan(kenhId, payload, { dryRun = false } = {}) {
  const { booking, nguon, canhBao } = H.chuanHoa(kenhId, payload);
  booking.payloadGoc = JSON.stringify(payload);

  const luoc = await schema.doc();

  if (dryRun) {
    /* Soi mapping mà không nói được "có nối vào tour nào không" thì soi để làm gì
     * — đó chính là thứ hay sai nhất khi cắm một kênh OTA mới. */
    const noi = luoc.ok ? await noiDanhMuc(booking).catch(() => null) : null;
    return {
      ok: true, dryRun: true, luuVao: null, moi: null,
      booking: store.boiThem({ ...booking, ...(noi || {}) }),
      nguon, canhBao: canhBao.concat((noi && noi.canhBao) || []),
      noiDanhMuc: noi ? { kenh: !!noi.kenhRecordId, tour: noi.tourTen || '', tourRecordId: noi.tourRecordId } : null,
      luocDo: { ok: luoc.ok, thieuBatBuoc: luoc.thieuBatBuoc, loi: luoc.loi },
    };
  }

  /* ---- 1. ghi vào hàng đợi (không bao giờ thất bại vì mạng) ---- */
  const cuTrongQ = hangdoi.doc().find((r) => r.maBooking && r.maBooking === booking.maBooking &&
    r.kenhId === booking.kenhId) || null;
  const hopNhat = gopVoiCu(booking, cuTrongQ);
  const q = hangdoi.themHoacCapNhat(hopNhat);

  const kq = {
    ok: true, dryRun: false, luuVao: 'hang-doi', moi: q.moi,
    booking: store.boiThem(q.row), nguon, canhBao, recordId: q.row.recordId || null,
  };

  /* ---- 2. đẩy vào Base nếu đã nối được ---- */
  if (!luoc.ok) {
    kq.ghiChuHeThong = luoc.loi || 'Chưa nối Base — booking đang nằm ở hàng đợi cục bộ.';
    store.invalidate();
    return kq;
  }

  try {
    let recordId = q.row.recordId || null;
    if (!recordId) {
      const daCo = await timTrongBase(booking.kenhId, booking.maBooking);
      if (daCo) {
        recordId = daCo.recordId;
        // gộp thêm lần nữa với dữ liệu thật trong Base (hàng đợi có thể vừa trắng)
        Object.assign(hopNhat, gopVoiCu(hopNhat, daCo.cu));
      }
    }

    /* Nối danh mục NGAY TRƯỚC khi ghi, không nối lúc chuẩn hoá: danh mục có thể
     * vừa được thêm tour mới trong lúc booking nằm chờ ở hàng đợi. */
    const noi = await noiDanhMuc(hopNhat);
    Object.assign(hopNhat, {
      kenhRecordId: noi.kenhRecordId,
      tourRecordId: noi.tourRecordId,
    });
    if (noi.canhBao.length) kq.canhBao = (kq.canhBao || []).concat(noi.canhBao);

    const cells = store.sangCell(hopNhat, luoc);
    if (recordId) {
      await lark.updateRecord(luoc.tableId, recordId, cells);
      kq.moi = false;
    } else {
      recordId = await lark.createRecord(luoc.tableId, cells);
      kq.moi = true;
    }

    hangdoi.danhDauDaDay({ [q.row.id]: recordId });
    hangdoi.xoaDaDay();                 // đẩy xong thì hàng đợi không giữ nữa
    kq.luuVao = 'base';
    kq.recordId = recordId;
    kq.booking = store.boiThem({ ...hopNhat, id: recordId, recordId });
  } catch (e) {
    /* Không ném lỗi ra webhook: booking đã nằm trong hàng đợi, mất mạng lúc này
     * không phải lỗi của OTA. Ghi lý do để màn hình thiết lập hiện ra. */
    console.error('[nhan] đẩy vào Base thất bại:', e.message);
    kq.loiDayBase = e.message;
    kq.ghiChuHeThong = 'Đã nhận và giữ trong hàng đợi, nhưng chưa ghi được vào Base: ' + e.message;
  }

  store.invalidate();
  return kq;
}

/** Đẩy toàn bộ hàng đợi còn tồn vào Base (bấm tay trong màn hình thiết lập). */
async function dayHangDoi() {
  const luoc = await schema.doc({ force: true });
  if (!luoc.ok) {
    const e = new Error(luoc.loi || 'Chưa nối được Base');
    e.code = 400;
    throw e;
  }

  const ton = hangdoi.doc().filter((r) => !r.recordId);
  if (!ton.length) return { day: 0, capNhat: 0, con: 0, loi: [] };

  const d = await store.get({ force: true });
  const theoMa = new Map();
  if (d.nguon === 'base') d.rows.forEach((r) => { if (r.maBooking) theoMa.set(r.kenhId + '|' + r.maBooking, r); });

  const daDay = {};
  const loi = [];
  let taoMoi = 0;
  let capNhat = 0;
  const toCreate = [];
  const idTheoThuTu = [];

  for (const r of ton) {
    const cu = theoMa.get(r.kenhId + '|' + r.maBooking);
    const b = gopVoiCu(r, cu || null);
    try {
      const noi = await noiDanhMuc(b);
      b.kenhRecordId = noi.kenhRecordId;
      b.tourRecordId = noi.tourRecordId;
      if (cu) {
        await lark.updateRecord(luoc.tableId, cu.recordId, store.sangCell(b, luoc));
        daDay[r.id] = cu.recordId;
        capNhat += 1;
      } else {
        toCreate.push(store.sangCell(b, luoc));
        idTheoThuTu.push(r.id);
      }
    } catch (e) { loi.push({ maBooking: r.maBooking, loi: e.message }); }
  }

  if (toCreate.length) {
    try {
      const ids = await lark.createMany(luoc.tableId, toCreate);
      ids.forEach((rid, i) => { if (rid && idTheoThuTu[i]) daDay[idTheoThuTu[i]] = rid; });
      taoMoi = ids.filter(Boolean).length;
    } catch (e) { loi.push({ maBooking: '(lô tạo mới)', loi: e.message }); }
  }

  hangdoi.danhDauDaDay(daDay);
  hangdoi.xoaDaDay();
  store.invalidate();

  return { day: taoMoi, capNhat, con: hangdoi.demChuaDay(), loi };
}

/**
 * Sửa một booking từ trong app: nhận booking, điền SĐT / điểm đón mà OTA thiếu,
 * đổi trạng thái. Chỉ cho sửa đúng những trường này — số tiền và mã booking là
 * dữ liệu của OTA, sửa tay là mất dấu đối chiếu.
 */
const CHO_SUA = ['sdt', 'email', 'diemDon', 'gioDon', 'ghiChu', 'ngonNgu', 'trangThai', 'daNhan'];

async function sua(id, patch) {
  const thay = {};
  CHO_SUA.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(patch, k)) thay[k] = patch[k];
  });
  if (!Object.keys(thay).length) {
    const e = new Error('Không có trường nào sửa được. Cho sửa: ' + CHO_SUA.join(', '));
    e.code = 400;
    throw e;
  }
  if (thay.trangThai && !cfg.trangThai.includes(thay.trangThai)) {
    const e = new Error('Trạng thái phải là một trong: ' + cfg.trangThai.join(' | '));
    e.code = 400;
    throw e;
  }
  if ('sdt' in thay) thay.sdt = H.dienThoai(thay.sdt);
  if ('daNhan' in thay) thay.daNhan = !!thay.daNhan;

  const d = await store.get();
  const cu = d.rows.find((r) => r.id === id);
  if (!cu) {
    const e = new Error('Không tìm thấy booking ' + id);
    e.code = 404;
    throw e;
  }
  const moi = { ...cu, ...thay };

  if (d.nguon === 'base') {
    const luoc = await schema.doc();
    /* Sửa một trường mà Base không có cột tương ứng thì sangCell lặng lẽ bỏ qua —
     * người bấm thấy "đã lưu" nhưng không có gì đổi. Nói thẳng còn hơn. */
    const khongCoCot = Object.keys(thay).filter((k) => !luoc.fields[k]);
    if (khongCoCot.length) {
      const e = new Error('Bảng "' + (luoc.tableTen || cfg.tableName) + '" chưa có cột ' +
        khongCoCot.map((k) => '"' + cfg.cot[k].ten + '"').join(', ') +
        ' — thêm cột đó vào Base rồi thử lại (xem tab Thiết lập).');
      e.code = 400;
      throw e;
    }
    // Ghi lại cả cột "cần xử lý" vì sửa SĐT/điểm đón là để cờ đó tắt đi
    await lark.updateRecord(luoc.tableId, cu.recordId, store.sangCell(moi, luoc));
  } else {
    hangdoi.capNhat(id, thay);
  }

  store.invalidate();
  return store.boiThem(moi);
}

module.exports = { nhan, dayHangDoi, sua, gopVoiCu, noiDanhMuc, CHO_SUA };
