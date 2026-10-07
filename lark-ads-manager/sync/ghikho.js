'use strict';
/**
 * Ghi KHO lên Base: bảng "Lead Tourwell" và bảng "Hội thoại quảng cáo".
 *
 * VÌ SAO CÓ FILE NÀY
 *
 * Anh Hùng, 07/10/2026: "bất kỳ thứ gì anh cũng muốn gắn đè lên base, nên là
 * nhập file hay kéo về em đều đưa lên base giúp anh, đè lên nếu trùng, còn này
 * thì anh hay ấn lại và không lưu lại."
 *
 * Đúng như thế, và lý do rất cụ thể: kho lead/đơn/hội thoại nằm trong
 * `roas-tourwell.json` trên ổ đĩa TẠM của Render. Mỗi lần deploy hoặc restart
 * là file biến mất. Bấm "Kéo từ Tourwell", thấy đủ số, hôm sau vào lại trống
 * trơn — không phải nút hỏng, là chỗ cất bị xoá. Doanh thu thì đã có bảng
 * "Báo cáo Sales"; lead và hội thoại thì trước nay không có bản gốc nào.
 *
 * Từ đây: file JSON chỉ còn là bộ nhớ đệm, Base mới là bản gốc.
 *
 * BA QUY TẮC, giống hệt sync/ghidoanhthu.js và vì cùng một lý do:
 *
 * - **Đè theo khoá.** Lead khoá bằng `Mã lead`, hội thoại bằng `ID hội thoại`.
 *   Ghi lại lần nữa thì SỬA đúng dòng cũ. Không có khoá thì mỗi lượt chạy là
 *   một lần nhân đôi bảng — đã trả giá 17/09/2026 với 12.000 dòng cho 1.463 mã.
 * - **Không xoá dòng nào.** Dòng trên Base mà nguồn không còn thì BÁO ra.
 * - **Không ghi đè bằng thứ mình không biết.** Lượt không tính được phân loại
 *   hội thoại thì không ghi gì vào bảng hội thoại, chứ không ghi dòng rỗng.
 *
 * SỐ ĐIỆN THOẠI ghi ĐẦY ĐỦ, không che. Anh Hùng chọn "cứ lưu đầy đủ" — Base
 * này chỉ người trong phòng xem được, và che số thì mất luôn khoá ghép lại.
 */

const cfg = require('../config');
const lark = cfg.mode === 'api' ? require('../larkapi') : require('../lark');
const { gioBase } = require('./ghidoanhthu');
const { docMaQC } = require('./noiquangcao');

const T = cfg.tables;

/**
 * Giờ hiện tại dạng Base, cho ô "Cập nhật lúc" của cả hai bảng.
 *
 * Chuỗi gửi lên là giờ UTC — ĐÃ ĐO chứ không đoán: ghi thử 1.000 lead rồi đọc
 * lại, Base trả đúng chuỗi đã gửi kèm `+00:00`. Cùng quy ước với gioBase() ở
 * sync/ghidoanhthu.js (hàm đó trừ 7 giờ để đổi 00:00 giờ Việt Nam sang UTC).
 *
 * Bản đầu của tôi CỘNG 8 giờ, vì nhớ nhầm rằng Base đọc chuỗi theo múi giờ của
 * chính nó. Kết quả là ô "Cập nhật lúc" chạy trước giờ thật 8 tiếng — vẫn có
 * số, trông vẫn bình thường, chỉ sai. Đọc lại từ Base mới thấy.
 */
function bayGio(d = new Date()) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Cắt cho vừa ô text của Base, không để một ô dài làm hỏng cả lô ghi. */
const cat = (v, n = 900) => String(v == null ? '' : v).trim().slice(0, n);

/* ---------------------------------------------------------------- LEAD ---- */

/**
 * Một lead Tourwell -> các ô sẽ ghi.
 * Hình dạng lead: xem sync/tourwellapi.js docLead() và sync/tourwell.js.
 */
function dongLead(l, F) {
  const o = {};
  o[F.ma] = cat(l.ma || l.id, 120);
  o[F.kh] = cat(l.kh, 120);
  o[F.khach] = cat(l.khach, 200);
  o[F.sdt] = cat(l.sdt, 60);
  const t = gioBase(l.ngay);
  if (t) o[F.ngay] = t;
  o[F.nguon] = cat(l.nguon, 200);
  o[F.trangThai] = cat(l.trangThai, 120);
  o[F.donHang] = cat(l.donHang, 500);
  /* Mã quảng cáo do NGƯỜI nối tay, nằm trong ghi chú dạng `QC=<id>` — đường 0
   * của phép ghi công. Rút ra thành ô riêng để lọc được trên Lark, nhưng vẫn
   * giữ nguyên ghi chú gốc bên cạnh: ô rút ra là tiện, ghi chú mới là bằng. */
  o[F.maQC] = cat(docMaQC(l.ghiChu) || '', 120);
  o[F.ghiChu] = cat(l.ghiChu);
  o[F.capNhat] = bayGio();
  return o;
}

/** Khoá đè của một lead. Rỗng = bỏ qua dòng đó, không đoán khoá thay. */
function khoaLead(l) {
  return String((l && (l.ma || l.id)) || '').trim();
}

/* ----------------------------------------------------------- HỘI THOẠI ---- */

/* Ba nhóm của roas.js, dịch sang chữ người đọc được trên Lark. */
const NHAN_NHOM = {
  'chuyen-doi': 'Đã ra đơn',
  'tiem-nang': 'Tiềm năng',
  rac: 'Chưa nhận ra khách',
};

/**
 * Một hội thoại đã phân loại -> các ô sẽ ghi.
 * Hình dạng: phần tử của kq.hoiThoaiPhanLoai trong sync/roas.js.
 */
function dongHoiThoai(h, F) {
  const o = {};
  o[F.id] = cat(h.id, 200);
  const t = gioBase(h.ngay);
  if (t) o[F.ngay] = t;
  o[F.kenh] = cat(h.platform, 60);
  o[F.maQC] = cat((h.adIds || []).join(', '), 500);
  o[F.phanLoai] = NHAN_NHOM[h.nhom] || cat(h.nhom, 60);
  o[F.viSao] = cat(h.lyDo);
  o[F.maDon] = cat((h.maDon || []).join(', '), 500);
  /* ÉP SỐ. Cùng bài học với o.tien trong roas.js: một ô thiếu làm cả cột thành
   * NaN, rồi JSON hoá null, rồi màn hình trống mà không báo gì. */
  o[F.doanhThu] = Number(h.tien) || 0;
  o[F.soTinNhan] = Number(h.soTinNhan) || 0;
  o[F.khach] = cat(h.tenKhach, 200);
  o[F.capNhat] = bayGio();
  return o;
}

function khoaHoiThoai(h) {
  return String((h && h.id) || '').trim();
}

/* ------------------------------------------------------------ CHUNG ------- */

/**
 * Bản ghi Base -> Map(khoá -> record_id).
 *
 * Hình dạng bản ghi là `{ id, c }`, KHÔNG phải `{ id, fields }` — cả lark.js
 * lẫn larkapi.js đều trả `c`. Đọc nhầm tên này là map rỗng, và app lặng lẽ tạo
 * dòng mới cho mọi thứ ở mọi lượt. Đã cắn một lần ở bảng Sales, đừng cắn lại.
 */
function banDoKhoa(rows, fieldId) {
  const m = new Map();
  (rows || []).forEach((r) => {
    const o = (r && r.c) || {};
    const k = String(o[fieldId] == null ? '' : o[fieldId]).trim();
    if (k) m.set(k, r.id);
  });
  return m;
}

/**
 * Dựng danh sách việc cần ghi. KHÔNG gọi mạng — để test được và xem trước được.
 *
 * @param rows    dữ liệu nguồn
 * @param daCo    Map(khoá -> record_id) những dòng Base đã có
 * @param layKhoa (row) -> khoá
 * @param lamDong (row) -> object các ô
 */
function lenKeHoach({ rows = [], daCo = new Map(), layKhoa, lamDong }) {
  const taoMoi = [];
  const capNhat = [];
  const boQua = [];
  const thay = new Set();

  rows.forEach((r) => {
    const k = layKhoa(r);
    if (!k) { boQua.push({ ly: 'không có khoá' }); return; }
    /* Nguồn có khoá trùng: giữ dòng ĐẦU, bỏ các dòng sau. Ghi cả hai thì dòng
     * sau đè dòng trước ngay trong cùng một lô, kết quả phụ thuộc thứ tự. */
    if (thay.has(k)) { boQua.push({ khoa: k, ly: 'trùng trong dữ liệu nguồn' }); return; }
    thay.add(k);
    const fields = lamDong(r);
    const recId = daCo.get(k);
    if (recId) capNhat.push({ record_id: recId, fields });
    else taoMoi.push({ fields });
  });

  // Dòng trên Base mà nguồn không còn: BÁO ra, không tự xoá.
  const khongConNguon = [...daCo.keys()].filter((k) => !thay.has(k));
  return { taoMoi, capNhat, boQua, khongConNguon };
}

/** Ghi thật một kế hoạch lên một bảng. Trả số dòng đã tạo / đã sửa. */
async function ghiKeHoach(tableId, kh, ghi = () => {}) {
  let taoXong = 0;
  for (let i = 0; i < kh.taoMoi.length; i += 200) {
    const lo = kh.taoMoi.slice(i, i + 200).map((x) => x.fields);
    await lark.createMany(tableId, lo);
    taoXong += lo.length;
    ghi(`  đã tạo ${taoXong}/${kh.taoMoi.length}`);
  }
  let suaXong = 0;
  const ds = kh.capNhat.slice();
  for (let i = 0; i < ds.length; i += 200) {
    const map = {};
    ds.slice(i, i + 200).forEach((x) => { map[x.record_id] = x.fields; });
    await lark.updateMany(tableId, map);
    suaXong += Object.keys(map).length;
    ghi(`  đã sửa ${suaXong}/${ds.length}`);
  }
  return { taoMoi: taoXong, capNhat: suaXong, boQua: kh.boQua.length,
    khongConNguon: kh.khongConNguon.length };
}

/* ------------------------------------------------------------- CỬA VÀO ---- */

/** Ghi lead lên bảng "Lead Tourwell". leadRows rỗng = không làm gì. */
async function chayLead({ leadRows = [], ghi = () => {} } = {}) {
  if (!leadRows.length) return null;
  const F = T.lead.f;
  const daCo = banDoKhoa(await lark.listAll(T.lead.id), F.ma);
  const kh = lenKeHoach({ rows: leadRows, daCo, layKhoa: khoaLead,
    lamDong: (l) => dongLead(l, F) });
  ghi(`Lead → Base: tạo ${kh.taoMoi.length}, sửa ${kh.capNhat.length} dòng`);
  const kq = await ghiKeHoach(T.lead.id, kh, ghi);
  if (kh.khongConNguon.length) {
    ghi(`  ! ${kh.khongConNguon.length} lead trên Base không còn trong lượt kéo này — KHÔNG xoá`);
  }
  return kq;
}

/** Ghi hội thoại đã phân loại lên bảng "Hội thoại quảng cáo". */
async function chayHoiThoai({ htRows = [], ghi = () => {} } = {}) {
  if (!htRows.length) return null;
  const F = T.hoiThoai.f;
  const daCo = banDoKhoa(await lark.listAll(T.hoiThoai.id), F.id);
  const kh = lenKeHoach({ rows: htRows, daCo, layKhoa: khoaHoiThoai,
    lamDong: (h) => dongHoiThoai(h, F) });
  ghi(`Hội thoại → Base: tạo ${kh.taoMoi.length}, sửa ${kh.capNhat.length} dòng`);
  const kq = await ghiKeHoach(T.hoiThoai.id, kh, ghi);
  if (kh.khongConNguon.length) {
    ghi(`  ! ${kh.khongConNguon.length} hội thoại trên Base không còn trong lượt kéo này — KHÔNG xoá`);
  }
  return kq;
}

/**
 * Cả hai bảng trong một lượt.
 *
 * Bọc try/catch RIÊNG từng bảng: đây là bước SAO LƯU, không phải bước chính.
 * Bảng hội thoại lỗi thì lead vẫn phải lưu được, và cả hai lỗi cũng không được
 * làm hỏng lượt ghi doanh thu đang gọi nó. Nhưng lỗi thì phải HIỆN RA — im lặng
 * ở bước sao lưu là kiểu hỏng tệ nhất: tưởng còn bản gốc, hoá ra không.
 */
async function chay({ leadRows = [], htRows = [], ghi = () => {} } = {}) {
  const kq = { lead: null, hoiThoai: null, loi: [] };
  try {
    kq.lead = await chayLead({ leadRows, ghi });
  } catch (e) {
    kq.loi.push('lead: ' + e.message);
    ghi('  ! không lưu được lead lên Base: ' + e.message);
  }
  try {
    kq.hoiThoai = await chayHoiThoai({ htRows, ghi });
  } catch (e) {
    kq.loi.push('hội thoại: ' + e.message);
    ghi('  ! không lưu được hội thoại lên Base: ' + e.message);
  }
  return kq;
}

module.exports = { chay, chayLead, chayHoiThoai, lenKeHoach, banDoKhoa,
  dongLead, dongHoiThoai, khoaLead, khoaHoiThoai, bayGio, NHAN_NHOM };
