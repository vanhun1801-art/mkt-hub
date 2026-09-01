'use strict';
/**
 * Dò lược đồ bảng "Bookings": table ID theo TÊN BẢNG, field ID theo TÊN CỘT.
 *
 * VÌ SAO KHÁC BA APP KIA: ở đó base do chính app dựng nên field ID hardcode được.
 * Base OTA thì đã có sẵn và do người khác vận hành — cột có thể được đổi tên, thêm
 * bớt bất cứ lúc nào. Dò theo tên rồi nhớ vào .tmp là cách vừa không đoán ID vừa
 * sống sót khi base đổi.
 *
 * Ngoài bảng chính, module còn dò hai bảng danh mục (Danh mục OTA / Danh mục Tour)
 * vì bảng Bookings trỏ sang chúng bằng cột liên kết: không có field ID của chúng
 * thì không nối được link, mà không nối link thì Base không tính ra đồng nào.
 *
 * So tên bỏ dấu và bỏ ký tự lạ, nên "Số điện thoại", "SO DIEN THOAI", "📞 Số
 * điện thoại" đều khớp. Mỗi cột còn có danh sách tên gọi khác trong config.cot.bi.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const lark = require('./lark');

/** Bỏ dấu tiếng Việt + ký tự không phải chữ/số, để so tên cột "lỏng tay". */
function chuanTen(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const KEYS = Object.keys(cfg.cot);
/* Cột app được phép GHI = không phải công thức/tự động. Danh sách này là hàng rào
 * cuối cùng trước khi gọi API: ghi vào cột công thức là Lark từ chối CẢ bản ghi,
 * nên một booking hỏng vì lý do đó sẽ mất luôn chứ không chỉ thiếu một ô. */
const KEYS_GHI = KEYS.filter((k) => !cfg.cot[k].chiDoc);

/* Kiểu cột Lark mà app tuyệt đối không ghi vào, kể cả khi config quên đánh dấu
 * `chiDoc`. Base do người khác vận hành nên thêm một cột công thức mới là chuyện
 * bình thường — chặn theo KIỂU thì không phụ thuộc việc mình có cập nhật kịp. */
const KIEU_CHI_DOC = new Set(['formula', 'created_at', 'created_by', 'modified_at',
  'modified_by', 'auto_number', 'lookup', 'rollup', 'button', 'group_chat']);

/* Bao lâu thì thử lại sau một lần dò lược đồ thất bại. */
const LOI_TTL_MS = Number(process.env.OTA_SCHEMA_LOI_TTL || 30000);

let dem = null;          // { at, luoc }
let dangDo = null;

/* ---------------------------------------------------------- nhớ ra đĩa ---- */
function docDem() {
  try {
    const j = JSON.parse(fs.readFileSync(cfg.schemaFile, 'utf8'));
    // Đổi base/table trong env thì lược đồ cũ vô nghĩa
    if (j.baseToken !== cfg.baseToken) return null;
    return j;
  } catch (_) { return null; }
}

function ghiDem(luoc) {
  try {
    fs.mkdirSync(path.dirname(cfg.schemaFile), { recursive: true });
    /* KHÔNG nhớ `quyenGhi` ra đĩa: tên cột thì cả tháng không đổi, còn quyền thì
     * chủ base mở một cái là đổi ngay. Nhớ lại số cũ nghĩa là app còn kêu "không
     * ghi được" rất lâu sau khi đã ghi được. */
    const { quyenGhi, ...ben } = luoc;
    fs.writeFileSync(cfg.schemaFile, JSON.stringify({ ...ben, baseToken: cfg.baseToken }, null, 2));
  } catch (e) {
    console.warn('[schema] không ghi được ' + cfg.schemaFile + ': ' + e.message);
  }
}

/* ------------------------------------------------------------- dò bảng ----
 * Khai OTA_TABLE_ID thì KIỂM TRA trước rồi mới tin: ID lấy từ URL Base có thể là
 * dạng `blk...` (bảng nằm trong một block) mà API bản ghi không nhận. Gọi thử
 * field-list là biết ngay; không dùng được thì dò lại theo tên bảng. Nhờ vậy khai
 * sai ID cũng không làm app tê liệt, chỉ chậm hơn một lần gọi.
 */
async function timTable() {
  if (cfg.tableId) {
    try {
      // chỉ THỬ, không cần bền: retries=1 để không treo 3 nhịp khi ID sai
      const f = await lark.listFields(cfg.tableId, { retries: 1 });
      if (f.length) return { id: cfg.tableId, tuDo: false, fields: f };
      console.warn('[schema] OTA_TABLE_ID=' + cfg.tableId + ' không có cột nào — dò lại theo tên bảng.');
    } catch (e) {
      console.warn('[schema] OTA_TABLE_ID=' + cfg.tableId + ' không dùng được (' + e.message +
        ') — dò lại theo tên bảng "' + cfg.tableName + '".');
    }
  }
  const ds = await lark.listTables();
  const khop = timBang(ds, cfg.tableName, cfg.biBang);
  if (!khop) {
    throw new Error('Base không có bảng nào tên "' + cfg.tableName + '". Các bảng đang có: ' +
      (ds.map((t) => t.name).join(', ') || '(không đọc được bảng nào)'));
  }
  return { id: khop.id, tuDo: true, ten: khop.name };
}

/**
 * Tìm một bảng theo tên. KHỚP ĐÚNG trước, chỉ "chứa" khi tên tìm đủ dài.
 *
 * ⚠️ Chỗ này từng làm app bám nhầm bảng: base có "Bookings", "Danh mục OTA" và
 * "Danh mục Tour"; dò lỏng tay bằng token 'ota' thì "Danh mục OTA" khớp trước và
 * app báo "bảng thiếu hết cột" trong khi bảng đúng vẫn nằm đó. Nên: tên ngắn dưới
 * 6 ký tự chỉ chấp nhận khớp ĐÚNG, và khớp "chứa" chỉ tính khi đúng MỘT bảng.
 */
function timBang(ds, ten, bi = []) {
  const ungVien = [ten, ...bi].map(chuanTen).filter(Boolean);
  for (const u of ungVien) {
    const dung = ds.find((t) => chuanTen(t.name) === u);
    if (dung) return dung;
  }
  for (const u of ungVien) {
    if (u.length < 6) continue;
    const gan = ds.filter((t) => chuanTen(t.name).includes(u));
    if (gan.length === 1) return gan[0];
  }
  return null;
}

/**
 * Lược đồ một bảng danh mục: id bảng + { key: fieldId }.
 * Không tìm thấy thì trả { ok: false } chứ không ném — thiếu danh mục làm app mất
 * khả năng nối link, nhưng phần còn lại (nhận webhook, hàng đợi) vẫn phải chạy.
 */
async function doDanhMuc(ds, { id, ten, bi, cot }) {
  let fields = null;
  let tableId = '';
  if (id) {
    try {
      const f = await lark.listFields(id, { retries: 1 });
      if (f.length) { fields = f; tableId = id; }
    } catch (_) { /* ID khai sai — dò lại theo tên */ }
  }
  if (!fields) {
    const khop = timBang(ds, ten, bi || []);
    if (!khop) return { ok: false, tableId: '', fields: {}, loi: 'Base không có bảng "' + ten + '"' };
    tableId = khop.id;
    fields = await lark.listFields(tableId);
  }
  const theoTen = new Map();
  fields.forEach((f) => { const k = chuanTen(f.name); if (!theoTen.has(k)) theoTen.set(k, f); });
  const map = {};
  const thieu = [];
  Object.keys(cot).forEach((key) => {
    const spec = cot[key];
    const hit = [spec.ten, ...(spec.bi || [])].map(chuanTen).map((t) => theoTen.get(t)).find(Boolean);
    if (hit) map[key] = hit.id; else thieu.push(spec.ten);
  });
  return {
    ok: !!map.ten, tableId, fields: map, thieu,
    loi: map.ten ? '' : 'Bảng "' + ten + '" không có cột tên — không nối link được',
  };
}

/* -------------------------------------------------------------- dò cột ---- */
function ghepCot(fields) {
  const theoTen = new Map();
  fields.forEach((f) => {
    const k = chuanTen(f.name);
    if (!theoTen.has(k)) theoTen.set(k, f);
  });

  const map = {};
  const kieu = {};
  const thieu = [];
  KEYS.forEach((key) => {
    const spec = cfg.cot[key];
    const ungVien = [spec.ten, ...(spec.bi || [])].map(chuanTen);
    let hit = ungVien.map((t) => theoTen.get(t)).find(Boolean);
    /* Vẫn không thấy thì khớp "chứa" — cột hay bị thêm emoji hoặc hậu tố kiểu
     * "Số điện thoại (khách)". Chỉ nhận khi đúng MỘT cột chứa tên đó, tránh
     * gắn bừa vào cột khác. */
    if (!hit) {
      const gan = fields.filter((f) => ungVien.some((t) => t.length >= 4 && chuanTen(f.name).includes(t)));
      if (gan.length === 1) hit = gan[0];
    }
    if (hit) { map[key] = hit.id; kieu[key] = hit.type || ''; }
    else thieu.push(key);
  });

  /* Cột nào GHI được: config nói không phải chiDoc, VÀ kiểu thật trong Base cũng
   * không phải kiểu tự tính. Hai lớp vì base do người khác vận hành — hôm nay
   * "Người lớn" là cột số, mai chủ base có thể đổi thành công thức. */
  const ghiDuoc = {};
  KEYS_GHI.forEach((k) => {
    if (map[k] && !KIEU_CHI_DOC.has(String(kieu[k] || '').toLowerCase())) ghiDuoc[k] = map[k];
  });

  /* Cột công thức mà app TRÔNG CHỜ để lấy tiền. Thiếu thì app không chết, nhưng
   * dashboard mất số — phải nói ra chứ không im lặng hiện 0đ. */
  const thieuCongThuc = thieu.filter((k) => cfg.cot[k].chiDoc);

  return {
    fields: map,
    kieu,
    ghiDuoc,
    thieu,
    thieuBatBuoc: thieu.filter((k) => cfg.cot[k].batBuoc),
    thieuTuyChon: thieu.filter((k) => cfg.cot[k].tuyChon),
    thieuCongThuc,
    coTrongBase: fields.map((f) => f.name),
  };
}

/** Hỏi backend xem có quyền ghi không; lỗi gì cũng trả null chứ không doạ nhầm. */
function hoiQuyenGhi() {
  if (!lark.quyenGhi) return Promise.resolve(null);
  return lark.quyenGhi().catch(() => null);
}

/* --------------------------------------------------------------- công khai */

/**
 * Lược đồ hiện tại.
 * @returns {{ ok, noiBase, tableId, fields, thieu, thieuBatBuoc, loi, luc }}
 *   ok = ghi được vào Base ngay. noiBase = có khai base token hay chưa.
 */
async function doc({ force = false } = {}) {
  if (!cfg.baseToken) {
    return {
      ok: false, noiBase: false, tableId: '', fields: {}, ghiDuoc: {}, kieu: {},
      thieu: KEYS, thieuBatBuoc: [], thieuTuyChon: [], thieuCongThuc: [],
      danhMuc: { ota: { ok: false, fields: {} }, tour: { ok: false, fields: {} } },
      quyenGhi: null,
      loi: 'Chưa khai OTA_BASE_TOKEN — app đang lưu booking vào hàng đợi cục bộ.',
      luc: Date.now(),
    };
  }

  if (!force) {
    if (dem && dem.luoc.ok) return dem.luoc;
    /* Đệm CẢ khi lỗi, trong thời gian ngắn.
     * Không đệm thì mỗi lần gọi /api/meta lại thử lark-cli 3 lần có giãn cách —
     * Base hỏng là mọi lần mở trang treo cả chục giây. Đệm 30 giây thì vẫn tự
     * thử lại đủ nhanh sau khi người vận hành sửa xong, mà không treo. */
    if (dem && !dem.luoc.ok && Date.now() - dem.at < LOI_TTL_MS) return dem.luoc;
    if (dangDo) return dangDo;
    const dia = docDem();
    if (dia && dia.ok) {
      // lược đồ thì dùng lại được, riêng quyền phải hỏi lại (xem ghiDem)
      const luoc = { ...dia, quyenGhi: await hoiQuyenGhi() };
      dem = { at: Date.now(), luoc };
      return luoc;
    }
  }

  dangDo = (async () => {
    try {
      const tbl = await timTable();
      // timTable() đã lấy fields khi kiểm tra ID khai sẵn — đừng gọi lại lần nữa
      const fields = tbl.fields || await lark.listFields(tbl.id);
      const ghep = ghepCot(fields);

      /* Có quyền ghi không — hỏi song song, không chặn phần còn lại. Kết quả
       * KHÔNG được dùng để cấm ghi: quyền có thể vừa được mở mà đệm chưa kịp
       * hết hạn, cấm nhầm thì mất booking. Nó chỉ để nói trước cho người vận
       * hành biết, và để Hub kêu lên. */
      const pQuyen = hoiQuyenGhi();

      /* Hai bảng danh mục: chỉ gọi listTables MỘT lần rồi dùng chung cho cả hai. */
      let dsBang = [];
      try { dsBang = await lark.listTables(); } catch (_) { dsBang = []; }
      const [dmOta, dmTour] = await Promise.all([
        doDanhMuc(dsBang, { id: cfg.tableOtaId, ten: cfg.tableOtaName, bi: ['OTA'], cot: cfg.cotOta })
          .catch((e) => ({ ok: false, tableId: '', fields: {}, thieu: [], loi: e.message })),
        doDanhMuc(dsBang, { id: cfg.tableTourId, ten: cfg.tableTourName, bi: ['Tour'], cot: cfg.cotTour })
          .catch((e) => ({ ok: false, tableId: '', fields: {}, thieu: [], loi: e.message })),
      ]);

      const luoc = {
        /* `ok` = ghi được một booking đầy đủ. Cột liên kết OTA/Tour là bắt buộc,
         * mà nối link thì phải đọc được hai bảng danh mục — nên chúng cũng tính
         * vào điều kiện ok, không thì app ghi ra dòng trống rỗng không có tiền. */
        ok: ghep.thieuBatBuoc.length === 0 && dmOta.ok && dmTour.ok,
        noiBase: true,
        tableId: tbl.id,
        tableTuDo: !!tbl.tuDo,
        tableTen: tbl.ten || cfg.tableName,
        danhMuc: { ota: dmOta, tour: dmTour },
        quyenGhi: await pQuyen,
        ...ghep,
        loi: ghep.thieuBatBuoc.length
          ? 'Bảng thiếu cột bắt buộc: ' + ghep.thieuBatBuoc.map((k) => '"' + cfg.cot[k].ten + '"').join(', ')
          : (dmOta.ok ? '' : dmOta.loi) || (dmTour.ok ? '' : dmTour.loi),
        luc: Date.now(),
      };
      dem = { at: Date.now(), luoc };
      if (luoc.ok) ghiDem(luoc);
      return luoc;
    } catch (e) {
      const luoc = {
        ok: false, noiBase: true, tableId: cfg.tableId, fields: {}, ghiDuoc: {}, kieu: {},
        thieu: KEYS, thieuBatBuoc: [], thieuTuyChon: [], thieuCongThuc: [],
        danhMuc: { ota: { ok: false, fields: {} }, tour: { ok: false, fields: {} } },
        quyenGhi: null,
        loi: e.message, luc: Date.now(),
      };
      dem = { at: Date.now(), luoc };
      return luoc;
    } finally { dangDo = null; }
  })();

  return dangDo;
}

function xoaCache() {
  dem = null;
  try { fs.unlinkSync(cfg.schemaFile); } catch (_) {}
}

/**
 * Bản hướng dẫn tạo bảng, để màn hình thiết lập in ra đúng thứ cần bấm trong
 * Lark Base. Không tự tạo cột hộ: tạo cột sai kiểu trong base thật là việc khó
 * dọn, mà người vận hành base mới biết cột nào nên là select có sẵn option gì.
 */
function huongDan(luoc) {
  const thieu = (luoc && luoc.thieu) || KEYS;
  const dm = (luoc && luoc.danhMuc) || {};
  return {
    tenBang: cfg.tableName,
    /* Bốn cột app cần mà bảng Bookings chưa có — tách riêng để tab Thiết lập nói
     * gọn "thêm 4 cột này là xong" thay vì bắt người đọc soi cả bảng 36 dòng. */
    canThem: KEYS.filter((k) => thieu.includes(k) && cfg.cot[k].tuyChon).map((k) => ({
      key: k, ten: cfg.cot[k].ten, kieu: cfg.cot[k].kieu,
      viSao: VI_SAO[k] || '',
    })),
    danhMuc: [
      { ten: cfg.tableOtaName, ok: !!dm.ota && dm.ota.ok, loi: (dm.ota && dm.ota.loi) || '',
        thieu: (dm.ota && dm.ota.thieu) || [] },
      { ten: cfg.tableTourName, ok: !!dm.tour && dm.tour.ok, loi: (dm.tour && dm.tour.loi) || '',
        thieu: (dm.tour && dm.tour.thieu) || [] },
    ],
    cot: KEYS.map((key) => ({
      key,
      ten: cfg.cot[key].ten,
      kieu: cfg.cot[key].kieu,
      batBuoc: !!cfg.cot[key].batBuoc,
      chiDoc: !!cfg.cot[key].chiDoc,
      tuyChon: !!cfg.cot[key].tuyChon,
      daCo: !thieu.includes(key),
      option: cfg.cot[key].option ? cfg[cfg.cot[key].option] : null,
    })),
  };
}

/* Vì sao cần cột đó — in thẳng cạnh tên cột, để người vận hành base quyết định
 * có đáng thêm hay không thay vì thêm cho đủ danh sách. */
const VI_SAO = {
  gioDon: 'Giờ đón khách. Không có thì sales phải mở lại từng booking bên OTA để biết đón lúc mấy giờ.',
  ghiChu: 'Yêu cầu riêng của khách (dị ứng, trẻ nhỏ, xe lăn…). OTA gửi kèm, không có cột thì mất luôn.',
  daNhan: 'Đánh dấu sales đã nhận booking. THIẾU CỘT NÀY LÀ MẤT NÚT "Nhận booking" cả trong app lẫn trên Marketing Hub.',
  payloadGoc: 'Bản gốc OTA gửi. Khi kế toán hỏi "số này ở đâu ra" thì đây là bằng chứng.',
};

module.exports = { doc, xoaCache, huongDan, chuanTen, timBang, KEYS, KEYS_GHI };
