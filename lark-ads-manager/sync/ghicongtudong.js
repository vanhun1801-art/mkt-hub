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
const ghiKho = require('./ghikho');

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
    const hong = [];

    /* HAI NGUỒN, HAI TRY RIÊNG.
     *
     * Trước đây cả POS lẫn Pancake nằm chung một try, nên một lỗi thoáng qua của
     * bên nào cũng ném trước khi roasTinh.tinh() kịp chạy — mất luôn dữ liệu của
     * bên còn lại, và cả lượt tính coi như bỏ. Đo thật 07/10/2026: Pancake trả
     * "An error occurred. Please try again later." (bị chặn tần suất), POS vẫn
     * sẵn sàng, mà kết quả là 0 đơn xác định được kênh.
     *
     * Với lượt hẹn giờ mỗi tiếng thì đó là một tiếng mất trắng vì một cú nấc.
     * Giờ bên nào về được thì dùng bên đó; chỉ khi CẢ HAI cùng hỏng mới coi là
     * lượt không biết gì (kq = null) và không đụng tới cột Kênh.
     *
     * An toàn vì lenKeHoach() vẫn giữ nguyên Kênh của dòng đã ghi công được khi
     * lượt này không ghép lại được. Dòng mới chưa ghép được thì tạm mang 'Khác',
     * và lượt sau đủ nguồn sẽ ghi đè — 'Khác' không nằm trong LA_KENH_QC nên
     * không được bảo vệ, tức là tự lành. */
    if (c.pancakePos.enabled && pancakePos.danhSachGian(c.pancakePos).some((x) => x.apiKey)) {
      try {
        posRows = (await pancakePos.fetchOrders(c.pancakePos, tu, den, () => {})).rows;
      } catch (e) {
        hong.push('POS: ' + e.message);
        ghi('  ! không đọc được đơn POS lượt này — vẫn tính bằng hội thoại: ' + e.message);
      }
    }
    for (const pg of (c.pancake.pages || []).filter((x) => x.pageId && x.token)) {
      try {
        const r = await pancake.fetchConversations(pg, tu, den, () => {});
        htRows = htRows.concat(r.rows);
      } catch (e) {
        hong.push('Pancake: ' + e.message);
        ghi('  ! không đọc được hội thoại Pancake lượt này — vẫn tính bằng POS: ' + e.message);
      }
    }
    /* Cả hai cùng hỏng thì không có gì để ghép — ném ra cho khối catch bên dưới
     * xử lý như cũ, chứ đừng tính một kết quả rỗng rồi ghi 'Khác' cho tất cả. */
    if (hong.length && !posRows.length && !htRows.length) {
      throw new Error(hong.join(' · '));
    }
    kq = roasTinh.tinh({
      posRows, hoiThoaiRows: htRows,
      leadRows: (kho.lead && kho.lead.rows) || [], donRows: kho.don.rows,
      data: await store.get(), from: tu, to: den,
    });
    // Cùng hình dạng với /api/roas/tinh (log/loi/nguon) — để cache ra được thì
    // client hiển thị y hệt dù số đến từ đâu (tay hay tự động).
    kq.log = [];
    /* Nguồn nào hỏng thì NÓI RA trên màn hình, đừng chỉ ghi vào log server.
     * Khối ROAS hiện `r.loi` sẵn rồi — con số tính thiếu một nguồn mà trông y
     * hệt con số đủ nguồn là kiểu sai không ai nhìn ra. */
    kq.loi = hong.map((x) => 'Lượt này thiếu một nguồn — ' + x);
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
  //
  // BẪY ĐÃ CẮN THẬT (17/09/2026): bản trước đọc `r.fields[...]` — cả lark.js lẫn
  // larkapi.js đều trả record dạng { id, c }, KHÔNG có `.fields`. Nên `ma` luôn
  // rỗng, `daCo` luôn RỖNG, và mọi lượt chạy đều tưởng "chưa từng ghi" rồi tạo
  // dòng MỚI cho toàn bộ đơn — 12.000 dòng cho 1.463 mã đơn thật trước khi bắt
  // được (một mã lặp tới 16 lần). Lỗi có từ trước, nhưng ghi công giờ chạy tự
  // động (hẹn giờ + mỗi lần kéo API) nên nhân dòng nhanh hơn hẳn so với lúc còn
  // phải bấm tay. Test không bắt được vì test không đọc thật từ Lark — nhớ khi
  // viết test mới cho khối này.
  const daCo = banDoMaDon(await lark.listAll(T.sales.id), F);

  ghi('đang xác định kênh của từng đơn từ phép ghi công…');
  const { m: ghiCongTheoDon, kq } = await tinhGhiCong({ kho, from, to, ghi });
  ghi(`  ${ghiCongTheoDon.size} đơn xác định được kênh từ quảng cáo`);
  // Cache lại NGAY cả khi phần ghi Base bên dưới lỗi — số ROAS để xem vẫn đáng
  // có, tách bạch với việc ghi vào Base thật. kq null (Pancake/POS lỗi) thì bỏ
  // qua, giữ cache cũ thay vì xoá số đang có bằng một lượt hỏng.
  if (kq) roasCache.ghi(kq);

  /* `kq === null` nghĩa là tinhGhiCong() đã NÉM — Pancake/POS không trả lời.
   * Khác hẳn "chạy được nhưng không ghép ra đơn nào". Lượt không biết gì thì
   * không được viết gì vào cột Kênh. */
  const ghiCongHong = !kq;
  if (ghiCongHong) {
    ghi('  ! lượt này KHÔNG tính được ghi công — sẽ giữ nguyên cột Kênh của mọi dòng, '
      + 'không ghi "Khác" đè lên kết quả cũ');
  }
  const kh = ghiDT.lenKeHoach({ donRows, ghiCongTheoDon, daCo, F, ghiCongHong });
  const tt = ghiDT.tomTat(kh);
  ghi(`sẽ tạo ${kh.taoMoi.length} dòng, sửa ${kh.capNhat.length} dòng`);
  if ((kh.giuKenh || []).length) {
    ghi(`  giữ nguyên Kênh cho ${kh.giuKenh.length} đơn đã ghi công được từ lượt trước `
      + '— lượt này không ghép lại được nên KHÔNG hạ xuống "Khác"');
  }
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

  /* SAO LƯU KHO lên Base — lead và hội thoại, đè theo khoá.
   *
   * Anh Hùng, 07/10/2026: "nhập file hay kéo về em đều đưa lên base giúp anh,
   * đè lên nếu trùng… anh hay ấn lại và không lưu lại."
   *
   * Đặt ở ĐÂY chứ không ở từng nút, vì hàm này là chỗ duy nhất cả bốn đường
   * đều đi qua: nút ghi tay, nút kéo API, nhập file Excel, và lượt hẹn giờ mỗi
   * 2 giờ. Thêm vào từng nút là sớm muộn quên một nút.
   *
   * Đặt SAU bước ghi doanh thu, không phải trước: doanh thu là việc chính, sao
   * lưu là việc kèm. ghiKho.chay() tự nuốt lỗi từng bảng nên không làm hỏng
   * lượt này — nhưng có lỗi thì vẫn hiện ra trong nhật ký, không im. */
  const khoBase = await ghiKho.chay({
    leadRows: (kho.lead && kho.lead.rows) || [],
    htRows: (kq && kq.hoiThoaiPhanLoai) || [],
    ghi,
  });

  return { ...tt, taoXong, kq, khoBase };
}

/**
 * Bản ghi Base -> Map(mã đơn -> record_id), để SỬA dòng cũ chứ không tạo trùng.
 *
 * Tách thành hàm thuần vì đây đúng là chỗ đã cắn: đọc sai TÊN TRƯỜNG của bản ghi
 * thì map rỗng, và app lặng lẽ tạo dòng mới cho mọi đơn ở mọi lượt chạy. Không
 * có lỗi nào hiện ra — chỉ có bảng Base phình lên và doanh thu thổi theo.
 *
 * Hình dạng bản ghi là `{ id, c }`, KHÔNG phải `{ id, fields }`. Cả lark.js
 * (lark-cli) lẫn larkapi.js (tenant token) đều trả về `c`. Đây là giao ước giữa
 * hai lớp, và giao ước không có test là giao ước sẽ gãy.
 */
function banDoMaDon(rows, F) {
  const m = new Map();
  (rows || []).forEach((r) => {
    const o = (r && r.c) || {};
    const ma = String(o[F.orderCode] || '').trim();
    if (!ma) return;
    /* Mang theo KÊNH đang có, không chỉ record_id.
     *
     * lenKeHoach() cần biết dòng này đã ghi công được chưa, để một lượt thiếu dữ
     * liệu không hạ nó xuống 'Khác'. Bản trước chỉ trả id nên không có gì để so,
     * và mỗi lượt kém là xoá sạch kết quả của lượt tốt — tháng 9 từ 19 đơn ghi
     * công được còn 4 (đo 07/10/2026).
     *
     * Ô Kênh là select nên Lark trả về mảng hoặc đối tượng, không phải chuỗi. */
    const k = o[F.channel];
    const kenh = Array.isArray(k)
      ? String((k[0] && (k[0].text || k[0].name)) || k[0] || '')
      : (k && typeof k === 'object' ? String(k.text || k.name || '') : String(k || ''));
    m.set(ma, { id: r.id, kenh: kenh.trim() });
  });
  return m;
}

module.exports = { chay, tinhGhiCong, banDoMaDon };
