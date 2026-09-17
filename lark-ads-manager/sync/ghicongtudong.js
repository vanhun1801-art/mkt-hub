'use strict';
/**
 * MỘT hàm dùng chung cho "có đơn Tourwell mới thì tự ghi công + ghi doanh thu
 * lên Base" — trước đây đây là việc TAY: bấm "Tính ROAS" rồi bấm riêng "Ghi
 * doanh thu lên Base" mỗi khi có dữ liệu mới. Ba nơi gọi hàm này:
 *   - server.js  /api/roas/ghi-base   (nút bấm tay, giữ lại cho ai muốn ghi lại
 *     một khoảng ngày cụ thể mà không cần đợi)
 *   - server.js  /api/roas/keo-api    (bấm "Kéo lại từ Tourwell ngay")
 *   - sync/index.js  hẹn giờ          (lượt tự động mỗi TUOI_KHO_GIO giờ)
 *   - server.js  /api/roas/nhap       (nhập file Excel tay, đường lùi khi không
 *     dùng API)
 * Gộp về một chỗ để chỉ có MỘT định nghĩa "có đơn mới thì làm gì", không phải
 * nhớ gọi đúng thứ tự tính-rồi-ghi ở từng nơi.
 */
const cfg = require('../config');
const lark = cfg.mode === 'api' ? require('../larkapi') : require('../lark');
const store = require('../store');
const ketnoi = require('./ketnoi');
const pancake = require('./pancake');
const pancakePos = require('./pancakepos');
const ghiDT = require('./ghidoanhthu');
const roasTinh = require('./roas');
const ghiBaseLuc = require('./ghibaseluc');
const roasCache = require('./roascache');

const T = cfg.tables;

/**
 * Ghi công (POS khoá cứng + hội thoại số điện thoại) rồi trả về map
 * mã đơn -> {platform, tenQC, maLead} | {lyDo} cho ghiDT.dongBase(), kèm kq đầy
 * đủ của roasTinh.tinh() để cache lại cho màn "ROAS từng quảng cáo" hiển thị mà
 * không phải bấm "Tính ROAS" mỗi lần.
 *
 * Phép ghi công là phần DỄ VỠ NHẤT trong cả lượt (gọi mạng ra Pancake/POS —
 * token hết hạn, mất mạng, Pancake sập). Bọc try/catch RIÊNG quanh nó: hỏng ở
 * đây thì trả `kq: null` và map rỗng (mọi đơn thành 'Khác'), để chay() vẫn ghi
 * được doanh thu — mất cột Kênh còn hơn mất cả bản sao lưu doanh thu.
 */
async function tinhGhiCong({ kho, from, to, ghi = () => {} }) {
  const m = new Map();
  const tu = from || kho.don.tomTat.tu;
  const den = to || kho.don.tomTat.den;
  let kq = null;
  try {
    const c = ketnoi.read();
    let posRows = [];
    let htRows = [];
    if (c.pancakePos.enabled && pancakePos.danhSachGian(c.pancakePos).some((x) => x.apiKey)) {
      posRows = (await pancakePos.fetchOrders(c.pancakePos, tu, den, () => {})).rows;
    }
    for (const pg of (c.pancake.pages || []).filter((x) => x.pageId && x.token)) {
      const r = await pancake.fetchConversations(pg, tu, den, () => {});
      htRows = htRows.concat(r.rows);
    }
    kq = roasTinh.tinh({
      posRows, hoiThoaiRows: htRows,
      leadRows: (kho.lead && kho.lead.rows) || [], donRows: kho.don.rows,
      data: await store.get(), from: tu, to: den,
    });
    // Cùng hình dạng với /api/roas/tinh (log/loi/nguon) — để cache ra được thì
    // client hiển thị y hệt dù số đến từ đâu (tay hay tự động).
    kq.log = [];
    kq.loi = [];
    kq.nguon = {
      posDon: posRows.length,
      hoiThoai: htRows.length,
      lead: (kho.lead && kho.lead.rows.length) || 0,
      don: kho.don.rows.length,
      nhapLuc: kho.luc,
      khoangXuatDon: [kho.don.tomTat.tu, kho.don.tomTat.den],
      khoangXuatLead: kho.lead ? [kho.lead.tomTat.tu, kho.lead.tomTat.den] : [null, null],
    };
    (kq.ghiCongDon || []).forEach((gc) => {
      m.set(String(gc.ma), { platform: gc.nenTang, tenQC: gc.ten, maLead: gc.maLead });
    });
    // Đơn không ghép được QC: vẫn ghi vào map để dongBase() biết VÌ SAO mà gắn
    // 'Khác', không chỉ gắn 'Khác' trơ.
    (kq.lyDoTheoDon || []).forEach((x) => {
      if (!m.has(String(x.ma))) m.set(String(x.ma), { lyDo: x.lyDo });
    });
  } catch (e) {
    ghi('  ! không tính được ghi công (Pancake/POS lỗi) — vẫn ghi doanh thu, Kênh sẽ là "Khác": ' + e.message);
    console.error('  ghi công: không tính được — ' + e.message);
  }
  return { m, kq };
}

/**
 * Ghi thật lên bảng "Báo cáo Sales (theo ngày)". from/to bỏ trống = cả kho.
 * @returns {object} { taoMoi, capNhat, boQua, khongConNguon, tongTien, taoXong, kq }
 */
async function chay({ kho, from = '', to = '', ghi = () => {} }) {
  if (!kho || !kho.don || !kho.don.rows || !kho.don.rows.length) {
    throw new Error('Chưa có dữ liệu đơn hàng trong kho — kéo từ Tourwell hoặc nhập file Excel trước.');
  }
  const F = T.sales.f;
  let donRows = kho.don.rows;
  if (from) donRows = donRows.filter((r) => !r.ngay || r.ngay >= from);
  if (to) donRows = donRows.filter((r) => !r.ngay || r.ngay <= to);

  // Những dòng đã có trên Base, để SỬA chứ không tạo trùng.
  const daCo = new Map();
  const cu = await lark.listAll(T.sales.id);
  cu.forEach((r) => {
    const ma = String((r.fields && (r.fields[F.orderCode] || r.fields['⚙️ Mã đơn Tourwell'])) || '').trim();
    if (ma) daCo.set(ma, r.record_id || r.id);
  });

  ghi('đang xác định kênh của từng đơn từ phép ghi công…');
  const { m: ghiCongTheoDon, kq } = await tinhGhiCong({ kho, from, to, ghi });
  ghi(`  ${ghiCongTheoDon.size} đơn xác định được kênh từ quảng cáo`);
  // Cache lại NGAY cả khi phần ghi Base bên dưới lỗi — số ROAS để xem vẫn đáng
  // có, tách bạch với việc ghi vào Base thật. kq null (Pancake/POS lỗi) thì bỏ
  // qua, giữ cache cũ thay vì xoá số đang có bằng một lượt hỏng.
  if (kq) roasCache.ghi(kq);

  const kh = ghiDT.lenKeHoach({ donRows, ghiCongTheoDon, daCo, F });
  const tt = ghiDT.tomTat(kh);
  ghi(`sẽ tạo ${kh.taoMoi.length} dòng, sửa ${kh.capNhat.length} dòng`);
  let taoXong = 0;
  for (let i = 0; i < kh.taoMoi.length; i += 200) {
    const lo = kh.taoMoi.slice(i, i + 200).map((x) => x.fields);
    await lark.createMany(T.sales.id, lo);
    taoXong += lo.length;
    ghi(`  đã tạo ${taoXong}/${kh.taoMoi.length}`);
  }
  const mapSua = {};
  kh.capNhat.forEach((x) => { mapSua[x.record_id] = x.fields; });
  if (Object.keys(mapSua).length) {
    await lark.updateMany(T.sales.id, mapSua);
    ghi(`  đã sửa ${Object.keys(mapSua).length} dòng`);
  }
  store.invalidate();
  ghiBaseLuc.ghi({ from, to, taoMoi: kh.taoMoi.length, capNhat: kh.capNhat.length });
  if (kh.khongConNguon.length) {
    ghi(`  ! ${kh.khongConNguon.length} dòng trên Base không còn trong nguồn — KHÔNG xoá, tự xem lại`);
  }
  return { ...tt, taoXong, kq };
}

module.exports = { chay, tinhGhiCong };
