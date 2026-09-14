'use strict';
/**
 * ============================================================================
 * Kho — đọc/ghi hai bảng Base, và chỉ có thế
 * ============================================================================
 * Mọi câu hỏi "phiếu này đúng hạn chưa", "tuần này tổng bao nhiêu phút" đều nằm
 * ở ky.js. Ở đây chỉ có chuyện lấy dữ liệu ra và cất dữ liệu vào, để khi Base
 * đổi (đổi cột, đổi bảng) thì chỉ một file này phải sửa.
 */
const cfg = require('./config');
const K = require('./ky');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

const F = cfg.fields;
const C = cfg.chon;

/* ---------------- đọc ô Base ---------------- */

const asText = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v.map((x) => (x && (x.text || x.name)) || (typeof x === 'string' ? x : '')).join('');
  }
  if (typeof v === 'object') return v.text || v.name || '';
  return String(v);
};
const first = (v) => (Array.isArray(v) ? v[0] : v);

/**
 * Ô ngày giờ -> mốc ms.
 *
 * Base trả CHUỖI ISO ở chế độ cli và SỐ ms ở chế độ api — cùng một ô, hai kiểu.
 * Number("2026-09-12T...") ra NaN, mà NaN||0 ra 0, mà 0 lại đọc như "chưa đặt".
 * Đúng lỗi này đã làm mốc "đóng tay" của app Lịch đọc về rỗng trong khi Base ghi
 * đủ. Nên mọi ô ngày phải đi qua đây, không nơi nào được Number() thẳng.
 */
function asMs(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = asText(v);
  if (!s) return 0;
  const n = Number(s);
  if (Number.isFinite(n) && n > 1e11) return n;      // đã là ms
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Ô kiểu URL -> địa chỉ trần.
 *
 * Base trả ô URL về dưới dạng liên kết Markdown `[địa chỉ](địa chỉ)`. Ghi thẳng
 * chuỗi đó vào ô nhập rồi lưu lần nữa thì nó tự bọc thêm một lớp, và cứ mỗi lần
 * mở ra sửa lại dài gấp đôi. Gỡ ngay lúc đọc là chỗ duy nhất chặn được.
 */
function asLink(v) {
  const s = asText(v).trim();
  const m = s.match(/^\[[^\]]*\]\((.+)\)$/);
  return m ? m[1].trim() : s;
}

/**
 * Ô checkbox -> boolean thật.
 *
 * Không có nhánh riêng thì ô này đi qua asText() và thành CHUỖI "true"/"false"
 * — mà chuỗi "false" là truthy, nên mọi phiếu đều đếm là đã tick. Đúng cái bẫy
 * đã ghi trong test xem-tai của hub, và nó vừa tái diễn ở đây: phiếu trễ 18 giờ
 * bị đếm sang cột "nộp bù".
 */
function asTick(v) {
  if (v === true || v === 1) return true;
  if (v === false || v == null || v === '' || v === 0) return false;
  const s = asText(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

const asSo = (v) => {
  if (v === 0) return 0;
  if (v == null || v === '') return 0;
  const n = Number(typeof v === 'number' ? v : asText(v));
  return Number.isFinite(n) ? n : 0;
};

/** Một bản ghi Base -> object phẳng theo bản đồ trường. */
function doiRa(rec, map) {
  const c = rec.cells || {};
  const t = { id: rec.record_id };
  for (const [key, f] of Object.entries(map)) {
    const v = c[f.id];
    switch (f.type) {
      case 'select': t[key] = asText(first(v)) || null; break;
      case 'datetime': t[key] = asMs(v); break;
      case 'number': t[key] = asSo(v); break;
      case 'url': t[key] = asLink(v); break;
      case 'checkbox': t[key] = asTick(v); break;
      default: t[key] = asText(v); break;
    }
  }
  return t;
}

/** Bỏ ô rỗng trước khi ghi: Base coi null/"" là "ghi giá trị rỗng" chứ không
 *  phải "bỏ qua", và với ô select thì giá trị rỗng bị từ chối thẳng. */
function locO(cells) {
  const ra = {};
  for (const [k, v] of Object.entries(cells)) {
    if (v === undefined || v === null || v === '') continue;
    ra[k] = v;
  }
  return ra;
}

/* ---------------- cache ---------------- */
/* Đọc cả bảng rồi lọc trong bộ nhớ. Base không cho lọc theo nhiều điều kiện
 * kiểu này mà không dựng view riêng, và ở quy mô một phòng (vài nghìn dòng/năm)
 * thì đọc hết vẫn nhanh hơn là dựng view cho mỗi câu hỏi. */
const dem = { phieu: null, dong: null };

function xoaDem() { dem.phieu = null; dem.dong = null; }

async function docTat(loai, force) {
  const o = dem[loai];
  if (!force && o && Date.now() - o.luc < cfg.cacheTtlMs) return o.ds;
  const tableId = loai === 'phieu' ? cfg.phieuTableId : cfg.dongTableId;
  const map = loai === 'phieu' ? F.phieu : F.dong;
  const recs = await lark.listAllRecords(tableId);
  const ds = recs.map((r) => doiRa(r, map))
    /* Base sinh sẵn ba dòng trống khi tạo bảng. Không lọc thì mọi số đếm lệch,
     * và tệ hơn là hiện ra ba phiếu ma không của ai cả. */
    .filter((x) => (loai === 'phieu' ? x.ma : (x.maPhieu || x.congViec)));
  dem[loai] = { luc: Date.now(), ds };
  return ds;
}

/* ---------------- mã phiếu ---------------- */

/**
 * Khoá chống trùng: một người, một kỳ, một phiếu.
 *
 * Dùng mốc BẮT ĐẦU của kỳ chứ không phải ngày người bấm nút — nộp bù ngày 10
 * vào ngày 12 vẫn phải rơi đúng vào phiếu ngày 10, không tạo phiếu thứ hai.
 */
function maPhieu(loaiKy, tuMs, nguoiId) {
  const p = K.phanRaVN(tuMs);
  const p2 = (n) => String(n).padStart(2, '0');
  const moc = p.nam + p2(p.thang) + p2(p.ngay);
  return loaiKy + '-' + moc + '-' + (nguoiId || 'khuyet');
}

/* ---------------- đọc ---------------- */

async function dsPhieu(loc = {}, force) {
  let ds = await docTat('phieu', force);
  if (loc.loaiKy) ds = ds.filter((x) => x.loaiKy === C.loaiKy[loc.loaiKy]);
  if (loc.nguoi) ds = ds.filter((x) => cungNguoi(x, loc.nguoi));
  if (loc.tu) ds = ds.filter((x) => x.denNgay >= loc.tu);
  if (loc.den) ds = ds.filter((x) => x.tuNgay <= loc.den);
  return ds.sort((a, b) => b.tuNgay - a.tuNgay);
}

async function dsDong(loc = {}, force) {
  let ds = await docTat('dong', force);
  if (loc.maPhieu) {
    const bo = new Set([].concat(loc.maPhieu));
    ds = ds.filter((x) => bo.has(x.maPhieu));
  }
  if (loc.nguoi) ds = ds.filter((x) => cungNguoi(x, loc.nguoi));
  if (loc.tu) ds = ds.filter((x) => x.ngay >= loc.tu);
  if (loc.den) ds = ds.filter((x) => x.ngay <= loc.den);
  return ds;
}

/**
 * Cùng một người hay không.
 *
 * So open_id TRƯỚC, rồi mới tới email. Phải có cả hai vì open_id do từng app
 * Lark cấp riêng: cùng một người, app chạy trên máy và app trên Render cho ra
 * hai id khác nhau (đã đo: ou_f0d3514a… so với ou_5c7965c6…). Chỉ so id thì
 * người ta mở bản web ra là thấy mình thành người lạ, không phiếu nào của mình.
 */
function cungNguoi(hang, nguoi) {
  if (!nguoi) return true;
  const id = typeof nguoi === 'string' ? nguoi : nguoi.id;
  const email = typeof nguoi === 'string' ? '' : (nguoi.email || '');
  if (id && hang.nguoi && hang.nguoi === id) return true;
  if (email && hang.email && hang.email.toLowerCase() === email.toLowerCase()) return true;
  return false;
}

/* ---------------- ghi ---------------- */

function oNguoi(map, nguoi) {
  return {
    [map.nguoi.id]: nguoi.id || '',
    [map.email.id]: nguoi.email || '',
    [map.tenNguoi.id]: nguoi.ten || nguoi.name || '',
  };
}

/**
 * Lưu một phiếu NGÀY kèm toàn bộ dòng việc.
 *
 * `nop=false` là lưu nháp — vẫn ghi xuống Base để người ta đóng máy giữa chừng
 * không mất, nhưng không đóng dấu giờ nộp và không chấm hạn.
 */
async function luuNgay({ nguoi, ngayMs, ca, dinhMucTay, dong, nhanDinh, keHoach, canHoTro, linkVideo, nop }) {
  const k = K.kyNgay(ngayMs);
  const ma = maPhieu('ngay', k.tu, nguoi.id);
  const dm = K.dinhMuc(ca, dinhMucTay);
  const sach = (dong || [])
    .filter((d) => (d.congViec || '').trim() || asSo(d.phut) > 0)
    .map((d) => ({
      congViec: String(d.congViec || '').trim(),
      nhom: C.nhomViec.includes(d.nhom) ? d.nhom : 'Khác',
      phut: Math.max(0, Math.round(asSo(d.phut))),
      /* Tiến độ mặc định đo bằng %. Kẹp về 0–100 tại đây chứ không tin giao
       * diện: ô number cho gõ 500 hay -3 thoải mái, mà một dòng 500% làm hỏng
       * mọi phép trung bình phía sau. */
      tienDoPt: Math.max(0, Math.min(100, Math.round(asSo(d.tienDoPt)))),
      tienDo: String(d.tienDo || '').trim(),
      /* Rỗng = việc gõ tay, và chỉ nhóm "Khác" mới được gõ tay. Giữ mã lại là
       * sau này ghép báo cáo với Bảng công việc không phải khớp theo tên. */
      maViec: String(d.maViec || '').trim(),
      trangThai: C.trangThaiViec.includes(d.trangThai) ? d.trangThai : 'Hoàn thành',
      ghiChu: String(d.ghiChu || '').trim(),
    }));
  const g = K.gop(sach, dm);

  const luc = Date.now();
  const cuPhieu = (await docTat('phieu', true)).find((x) => x.ma === ma) || null;
  const kyLuat = nop ? oKyLuat(k, cuPhieu, luc) : null;
  const cham = kyLuat && kyLuat.cham;

  const cells = locO({
    [F.phieu.ma.id]: ma,
    [F.phieu.loaiKy.id]: C.loaiKy.ngay,
    [F.phieu.tuNgay.id]: k.tu,
    [F.phieu.denNgay.id]: k.den,
    ...oNguoi(F.phieu, nguoi),
    [F.phieu.ca.id]: C.ca[ca] || C.ca.ngay,
    [F.phieu.dinhMuc.id]: dm,
    [F.phieu.tongPhut.id]: g.tongPhut,
    [F.phieu.phanTram.id]: g.phanTram == null ? undefined : g.phanTram,
    [F.phieu.nhanDinh.id]: nhanDinh,
    [F.phieu.keHoach.id]: keHoach,
    [F.phieu.canHoTro.id]: canHoTro,
    [F.phieu.linkVideo.id]: linkVideo,
    [F.phieu.trangThai.id]: nop ? C.trangThaiPhieu.daNop : C.trangThaiPhieu.nhap,
    [F.phieu.hanNop.id]: K.hanNop(k),
    ...(nop ? kyLuat.o : {}),
  });

  const phieu = await ghiPhieu(ma, cells);
  await ghiDong(ma, k.tu, nguoi, sach);
  xoaDem();
  return { ma, phieu, tong: g, ky: k, cham, soLanNop: kyLuat && kyLuat.o[F.phieu.soLanNop.id] };
}

/**
 * Các ô kỷ luật nộp.
 *
 * `Nộp lúc` chỉ ghi LẦN ĐẦU và không bao giờ bị ghi đè. Bản trước ghi đè nó mỗi
 * lần bấm Nộp, nên người nộp đúng hạn hôm qua mà hôm nay mở ra sửa một chữ lập
 * tức bị chấm "trễ 18 giờ" — đúng cái làm hỏng toàn bộ bảng kỷ luật mà nó sinh
 * ra để phục vụ. Lần sửa ghi riêng vào `Sửa lúc`.
 *
 * `cu` là phiếu đang có trên Base (null nếu chưa có).
 */
function oKyLuat(k, cu, luc) {
  const nopDau = (cu && cu.nopLuc) || luc;
  const cham = K.chamHan(k, nopDau);
  /* Trả `o` và `cham` TÁCH nhau. Gộp chung rồi spread vào cells thì `cham` đi
   * thẳng xuống Base thành một trường tên "cham" — Base không có cột đó, và
   * kiểu lỗi này không nổ, nó chỉ âm thầm làm hỏng cả lượt ghi. */
  const o = {
    [F.phieu.nopLuc.id]: nopDau,
    [F.phieu.suaLuc.id]: luc,
    [F.phieu.soLanNop.id]: ((cu && cu.soLanNop) || 0) + 1,
    [F.phieu.dungHan.id]: C.dungHan[cham.trangThai] || C.dungHan.tre,
    [F.phieu.trePhut.id]: Math.round(cham.treMs / K.PHUT),
    /* Base từ chối `false` ở ô checkbox qua locO() vì nó không phải giá trị
     * rỗng — nhưng locO chỉ cắt undefined/null/'' nên false vẫn đi qua, và
     * phải đi qua: bỏ tick lại khi sửa từ nộp-bù về đúng hạn là chuyện thật. */
    [F.phieu.nopBu.id]: !!cham.bu,
  };
  return { o, cham };
}

/** Tạo mới hoặc cập nhật phiếu theo mã. */
async function ghiPhieu(ma, cells) {
  const co = (await docTat('phieu', true)).find((x) => x.ma === ma);
  if (co) {
    await lark.updateRecord(co.id, cells, cfg.phieuTableId);
    return { id: co.id, moi: false };
  }
  const r = await lark.createRecord(cells, cfg.phieuTableId);
  return { id: (r.records && r.records[0] && r.records[0].record_id) || null, moi: true };
}

/**
 * Đồng bộ dòng việc của một phiếu.
 *
 * Ghép theo THỨ TỰ: dòng cũ thứ i nhận nội dung mới thứ i, dư thì xoá, thiếu thì
 * tạo. Cách thô hơn là "xoá sạch rồi tạo lại" — nhưng nếu đứt mạng giữa hai bước
 * thì phiếu còn trắng, mà người dùng lại đang thấy màn hình báo đã lưu. Ghép
 * theo thứ tự thì tệ nhất cũng chỉ là một dòng chưa kịp đổi.
 */
async function ghiDong(ma, ngayMs, nguoi, sach) {
  const cu = (await docTat('dong', true)).filter((x) => x.maPhieu === ma);
  const chung = {
    [F.dong.maPhieu.id]: ma,
    [F.dong.ngay.id]: ngayMs,
    ...oNguoi(F.dong, nguoi),
  };
  const veO = (d) => locO({
    [F.dong.congViec.id]: d.congViec,
    [F.dong.nhom.id]: d.nhom,
    [F.dong.phut.id]: d.phut,
    /* 0 là giá trị THẬT của tiến độ (chưa bắt đầu), không phải "bỏ trống" — nên
     * không để locO() cắt mất nó. */
    [F.dong.tienDoPt.id]: d.tienDoPt === 0 ? 0 : d.tienDoPt,
    [F.dong.maViec.id]: d.maViec,
    [F.dong.tienDo.id]: d.tienDo,
    [F.dong.trangThai.id]: d.trangThai,
    [F.dong.ghiChu.id]: d.ghiChu,
    ...chung,
  });

  const sua = {};
  for (let i = 0; i < Math.min(cu.length, sach.length); i++) sua[cu[i].id] = veO(sach[i]);
  if (Object.keys(sua).length) await lark.updateMany(sua, cfg.dongTableId);

  if (sach.length > cu.length) {
    await lark.createMany(sach.slice(cu.length).map(veO), cfg.dongTableId);
  }
  if (cu.length > sach.length) {
    await lark.deleteRecords(cu.slice(sach.length).map((x) => x.id), cfg.dongTableId);
  }
}

/**
 * Cộng các phiếu NGÀY trong một kỳ tuần/tháng.
 *
 * Đây là chỗ trả lời đúng câu anh Hùng chốt: "máy tự cộng từ báo cáo ngày, người
 * chỉ viết nhận định". Định mức của kỳ = tổng định mức các ngày ĐÃ CÓ PHIẾU —
 * không phải số ngày công nhân 480, vì người nghỉ phép nửa tuần mà vẫn bị chia
 * cho cả tuần thì phần trăm nào cũng thành thảm hoạ.
 */
async function tongHop(loaiKy, mocMs, nguoi, force, denToiDa) {
  const k = K.ky(loaiKy, mocMs);
  /* `denToiDa` chỉ dùng khi đem kỳ này ra LÀM NỀN so sánh: tháng này mới tới
   * ngày 14 thì tháng trước cũng chỉ tính 14 ngày đầu — không thì kỳ nào đang
   * chạy dở cũng trông như tụt dốc. Để trống là lấy trọn kỳ, y như cũ. */
  const den = denToiDa == null ? k.den : Math.min(k.den, denToiDa);
  const phieuNgay = (await dsPhieu({ loaiKy: 'ngay', nguoi, tu: k.tu, den }, force))
    .filter((p) => p.trangThai === C.trangThaiPhieu.daNop);
  const dong = await dsDong({ maPhieu: phieuNgay.map((p) => p.ma) }, force);

  const dm = phieuNgay.reduce((s, p) => s + (p.dinhMuc || 0), 0);
  const g = K.gop(dong.map((d) => ({ nhom: d.nhom, phut: d.phut })), dm);

  const daNop = phieuNgay.map((p) => p.tuNgay);
  return {
    ky: k,
    soPhieuNgay: phieuNgay.length,
    ngayThieu: K.ngayThieu(k.tu, Math.min(den, Date.now()), daNop),
    ...g,
    phieuNgay,
    /* Trả cả dòng việc thô. Báo cáo tuần cần đọc lại từng đầu việc và từng
     * dòng ghi chú người đã viết trong tuần — mấy con số tổng không viết ra
     * được câu nào. */
    dong,
  };
}

/** Lưu phiếu TUẦN hoặc THÁNG: số do máy cộng, chữ do người viết. */
async function luuTongHop({ nguoi, loaiKy, mocMs, nhanDinh, keHoach, canHoTro, linkVideo, nop }) {
  if (loaiKy !== 'tuan' && loaiKy !== 'thang') throw new Error('Chỉ tuần hoặc tháng');
  const t = await tongHop(loaiKy, mocMs, nguoi, true);
  const k = t.ky;
  const ma = maPhieu(loaiKy, k.tu, nguoi.id);
  const luc = Date.now();
  const cuPhieu = (await docTat('phieu', true)).find((x) => x.ma === ma) || null;
  const kyLuat = nop ? oKyLuat(k, cuPhieu, luc) : null;
  const cham = kyLuat && kyLuat.cham;

  const cells = locO({
    [F.phieu.ma.id]: ma,
    [F.phieu.loaiKy.id]: C.loaiKy[loaiKy],
    [F.phieu.tuNgay.id]: k.tu,
    [F.phieu.denNgay.id]: k.den,
    ...oNguoi(F.phieu, nguoi),
    [F.phieu.dinhMuc.id]: t.dinhMucPhut,
    [F.phieu.tongPhut.id]: t.tongPhut,
    [F.phieu.phanTram.id]: t.phanTram == null ? undefined : t.phanTram,
    [F.phieu.nhanDinh.id]: nhanDinh,
    [F.phieu.keHoach.id]: keHoach,
    [F.phieu.canHoTro.id]: canHoTro,
    [F.phieu.linkVideo.id]: linkVideo,
    [F.phieu.trangThai.id]: nop ? C.trangThaiPhieu.daNop : C.trangThaiPhieu.nhap,
    [F.phieu.hanNop.id]: K.hanNop(k),
    ...(nop ? kyLuat.o : {}),
  });

  const phieu = await ghiPhieu(ma, cells);
  xoaDem();
  return { ma, phieu, tong: t, ky: k, cham, soLanNop: kyLuat && kyLuat.o[F.phieu.soLanNop.id] };
}

/** Một phiếu kèm dòng việc — dùng khi mở lại phiếu để sửa. */
async function motPhieu(loaiKy, mocMs, nguoi, force) {
  const k = K.ky(loaiKy, mocMs);
  const ma = maPhieu(loaiKy, k.tu, nguoi && nguoi.id);
  const p = (await dsPhieu({}, force)).find((x) => x.ma === ma) || null;
  const dong = p ? await dsDong({ maPhieu: ma }) : [];
  return { ma, ky: k, phieu: p, dong };
}

module.exports = {
  asText, asMs, asSo, asLink, asTick, doiRa, locO, cungNguoi,
  maPhieu, dsPhieu, dsDong, motPhieu,
  luuNgay, luuTongHop, tongHop, xoaDem,
};
