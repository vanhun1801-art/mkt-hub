'use strict';
/**
 * KHO DỮ LIỆU KPI.
 *
 * Hai tầng, đúng như hồi còn là hai tệp JSON — và giữ nguyên nguyên tắc quan
 * trọng nhất: **bản gốc không bao giờ bị ghi đè**. Sửa gì trên app cũng nằm ở
 * tầng "đã sửa" và chỉ đè lên bản gốc lúc ĐỌC, nên đổ nhầm thì xoá tầng sửa là
 * quay lại số ban đầu.
 *
 *   tầng gốc : số nhập từ Excel — bộ luật, số liệu, điểm đã trả lương
 *   tầng sửa : bộ luật sửa trên app, số đổ về, điểm chấm tay, ghi chú, chốt
 *
 * HAI CHỖ CẤT, chọn bằng `KPI_BASE_TOKEN`:
 *
 *   Lark Base (mặc định) — chỗ duy nhất số sống được trên server chung. Thư mục
 *     `du-lieu/` cố ý không lên GitHub (điểm gắn với lương, repo thì công khai),
 *     mà ổ đĩa Render lại là ổ TẠM: nhập tay vào đó cũng bay sau lần deploy sau.
 *   Tệp JSON — khi để trống KPI_BASE_TOKEN. Máy không nối được Lark vẫn chạy.
 *
 * VÌ SAO GIỮ API ĐỒNG BỘ dù Base là mạng: cả `tinhThang()` lẫn ~15 đầu mối trong
 * server.js đọc kho theo lối đồng bộ, và màn Tiến độ gọi `chamThang` năm lần cho
 * một yêu cầu. Đổi hết sang async là sửa lõi tính lương vì một chuyện hạ tầng.
 * Thay vào đó: nạp MỘT LẦN lúc khởi động vào RAM, đọc từ RAM, ghi thì vừa sửa
 * RAM vừa xếp hàng đẩy lên Base.
 *
 * MẤT SỐ THÌ PHẢI KÊU. Ghi xong mà chưa đẩy lên Base được thì tháng đó nằm trong
 * `choDay`, và `trangThai()` nói rõ — server trả kèm cảnh báo để giao diện hiện
 * chứ không im lặng coi như đã lưu.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const THU_MUC = path.join(__dirname, 'du-lieu');
const F_LICH_SU = path.join(THU_MUC, 'lich-su-2026.json');
const F_SUA = path.join(THU_MUC, 'sua-tay.json');

/* Nạp lark chậm (nó tự chọn backend cli/api theo env) và chỉ khi thật cần. */
let lark = null;
const layLark = () => (lark || (lark = require('./lark')));

function docJson(f, macDinh) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return macDinh; }
}
function ghiJson(f, data) {
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(data, null, 1), 'utf8');
    return true;
  } catch (_) { return false; }   // ổ chỉ đọc (Render) thì thôi, Base mới là chỗ thật
}

/* ---------------- bản chụp trong RAM ---------------- */
const KHO = {
  goc: { thang: {} },
  sua: { thang: {} },
  daNap: false,
  tuBase: false,
  choDay: new Set(),   // tháng đã sửa trong RAM mà chưa đẩy lên Base được
  loiDay: '',
  napLuc: 0,
};

/* Bản ghi Base của từng tháng, để `+record-batch-update` biết sửa dòng nào. */
const idBanGhi = { goc: {}, sua: {} };

const doc = (v) => {
  /* Ô Base là chuỗi JSON. Ô trống, "null", hay JSON hỏng đều trả về undefined —
   * KHÔNG ném lỗi: một ô hỏng của một tháng không được làm chết cả kho. */
  if (v == null || v === '') return undefined;
  const s = typeof v === 'string' ? v : (Array.isArray(v) ? v.map((x) => (x && x.text) || '').join('') : String(v));
  if (!s || s === 'null') return undefined;
  try { return JSON.parse(s); } catch (_) { return undefined; }
};
const viet = (v) => (v === undefined || v === null ? '' : JSON.stringify(v));

/** Đọc một bảng của Base về dạng { thang: { 'YYYY-MM': {...} } }. */
async function tuBang(bang, luuId) {
  const ds = await layLark().listAll(bang.id);
  const ra = {};
  const f = bang.f;
  ds.forEach((r) => {
    const th = String(doc(r.c[f.thang]) != null ? doc(r.c[f.thang])
      : (typeof r.c[f.thang] === 'string' ? r.c[f.thang]
        : (Array.isArray(r.c[f.thang]) ? r.c[f.thang].map((x) => (x && x.text) || '').join('') : ''))).trim();
    if (!/^\d{4}-\d{2}$/.test(th)) return;   // dòng rác hoặc dòng trống
    const o = {};
    Object.entries(f).forEach(([khoa, fid]) => {
      if (khoa === 'thang') return;
      const v = doc(r.c[fid]);
      if (v !== undefined) o[khoa] = v;
    });
    ra[th] = o;
    luuId[th] = r.id;
  });
  return { thang: ra };
}

/**
 * Nạp kho vào RAM. Gọi MỘT LẦN lúc khởi động, trước khi mở cổng.
 * Base gọi không được thì rơi xuống tệp — thà chạy với số cũ trên máy còn hơn
 * không mở được app.
 */
async function nap() {
  if (cfg.dungBase) {
    try {
      const [goc, sua] = await Promise.all([
        tuBang(cfg.bang.goc, idBanGhi.goc),
        tuBang(cfg.bang.sua, idBanGhi.sua),
      ]);
      KHO.goc = goc; KHO.sua = sua;
      KHO.daNap = true; KHO.tuBase = true; KHO.napLuc = Date.now(); KHO.loiDay = '';
      return { nguon: 'base', thang: Object.keys(goc.thang).length };
    } catch (e) {
      KHO.loiDay = 'Không đọc được Base: ' + e.message;
    }
  }
  KHO.goc = docJson(F_LICH_SU, { thang: {} });
  KHO.sua = docJson(F_SUA, { thang: {} });
  KHO.daNap = true; KHO.tuBase = false; KHO.napLuc = Date.now();
  return { nguon: 'tep', thang: Object.keys(KHO.goc.thang).length, loi: KHO.loiDay || undefined };
}

/** Đẩy những tháng đang chờ lên Base. Ném lỗi nếu không đẩy được. */
async function day() {
  if (!cfg.dungBase || !KHO.choDay.size) return { day: 0 };
  const ths = [...KHO.choDay];
  const f = cfg.bang.sua.f;
  const hang = (th) => {
    const t = KHO.sua.thang[th] || {};
    const o = { [f.thang]: th };
    Object.entries(f).forEach(([khoa, fid]) => {
      if (khoa !== 'thang') o[fid] = viet(t[khoa]);
    });
    return o;
  };
  try {
    /* MỘT THÁNG MỘT LỜI GỌI, không gộp lô.
     * Ở chế độ `cli`, lark-cli nhận JSON qua THAM SỐ DÒNG LỆNH, mà Windows chặn
     * ở ~32.000 ký tự. Một tháng đã ~17.000 — gộp hai tháng là spawn ENAMETOOLONG,
     * và lỗi đó nổ ra ở tầng hệ điều hành nên nhìn chẳng liên quan gì tới Base.
     * Chế độ `api` không vướng, nhưng giữ một lối đi cho cả hai cho đỡ lệch. */
    for (const th of ths) {
      const cu = idBanGhi.sua[th];
      if (cu) {
        await layLark().updateRecord(cfg.bang.sua.id, cu, hang(th));
      } else {
        const id = await layLark().createRecord(cfg.bang.sua.id, hang(th));
        if (id) idBanGhi.sua[th] = id;
      }
      KHO.choDay.delete(th);   // xoá từng cái: tháng nào xong là chắc chắn xong
    }
    KHO.loiDay = '';
    return { day: ths.length };
  } catch (e) {
    /* KHÔNG xoá khỏi choDay: lần ghi sau sẽ thử lại cả những tháng này. */
    KHO.loiDay = e.message;
    throw e;
  }
}

/** Kho đang ở đâu, có gì chưa lưu được không. */
function trangThai() {
  return {
    nguon: KHO.tuBase ? 'base' : 'tep',
    daNap: KHO.daNap,
    napLuc: KHO.napLuc,
    choDay: [...KHO.choDay],
    loi: KHO.loiDay || '',
    baseUrl: cfg.dungBase ? cfg.baseUrl : '',
  };
}

/* Ghi xuống chỗ cất. Luôn ghi tệp (còn giữ được bản trên máy), và xếp hàng đẩy
 * lên Base nếu đang dùng Base. */
function luu(th) {
  ghiJson(F_SUA, KHO.sua);
  if (cfg.dungBase) KHO.choDay.add(th);
}

/* ---------------- đọc ---------------- */

const lichSu = () => KHO.goc;
const suaTay = () => KHO.sua;

/**
 * Danh sách tháng có dữ liệu, mới nhất trước.
 *
 * Gộp CẢ HAI tầng. Tám tháng đầu năm vào bằng đường nhập Excel nên chỉ có ở
 * tầng gốc; từ tháng 10/2026 anh Hùng dừng nhập Excel, tháng mới mở thẳng trên
 * app nên chỉ có ở tầng sửa. Chỉ đọc tầng gốc thì tháng mới mở xong là biến
 * mất khỏi ô chọn tháng — đúng lỗi làm nửa KPI đứng im hai tháng liền.
 */
function danhSachThang() {
  return [...new Set([...Object.keys(lichSu().thang), ...Object.keys(suaTay().thang)])]
    .sort().reverse();
}

/**
 * Mở một tháng mới, chép bộ luật từ tháng gần nhất đã có.
 *
 * Chỉ chép BỘ LUẬT — mục tiêu, tỷ trọng, phân công. Không chép số liệu, không
 * chép điểm chấm tay, không chép dấu chốt: tháng mới phải trắng, số đổ về từ
 * các app con.
 *
 * Tháng mới nằm hẳn ở tầng sửa, không có bản gốc Excel. Nên `luatGoc` của nó
 * chính là bộ luật vừa chép — "về lại bản gốc" ở tháng này nghĩa là về lại lúc
 * mới mở, chứ không phải về một bảng Excel nào.
 */
function taoThang(th, tuThang) {
  if (lichSu().thang[th] || suaTay().thang[th]) return { loi: 'Tháng này đã có rồi' };
  const nguon = tuThang || danhSachThang()[0];
  const goc = thang(nguon);
  if (!goc || !goc.luat) return { loi: 'Không có tháng nào để chép bộ luật sang' };
  const s = suaTay();
  s.thang[th] = {
    luat: JSON.parse(JSON.stringify(goc.luat)),
    moTuApp: true,
    chepTu: nguon,
    moLuc: new Date().toISOString(),
  };
  luu(th);
  return { thang: th, chepTu: nguon };
}

/**
 * Gộp bản gốc với phần người dùng đã sửa trên app.
 * Bản gốc (nhập từ Excel) không bao giờ bị ghi đè — sửa gì cũng nằm ở tầng riêng,
 * nên luôn quay về được số gốc để đối chiếu.
 */
function thang(th) {
  const sua = suaTay().thang[th] || {};
  /* Tháng mở thẳng trên app không có bản gốc Excel — đọc được bằng tầng sửa.
   * Chặn ở đây theo kiểu "không gốc thì không có tháng" là chính chỗ khiến
   * không ai mở nổi tháng 9 và tháng 10. */
  const goc = lichSu().thang[th] || (sua.luat ? { luat: sua.luat } : null);
  if (!goc) return null;
  return {
    thang: th,
    luat: sua.luat || goc.luat,
    /* Tháng mở thẳng trên app luôn có sua.luat, nhưng đó là bộ luật GỐC của nó
     * chứ không phải một bản sửa — gắn nhãn "đã sửa luật" cho nó là nói sai. */
    daSuaLuat: !!sua.luat && !sua.moTuApp,
    moTuApp: !!sua.moTuApp,
    chepTu: sua.chepTu || '',
    luatGoc: goc.luat,
    soLieu: Object.assign({}, goc.soLieu, sua.soLieu || {}),
    chamTay: gopChamTay(goc.chamTay, sua.chamTay),
    ghiChuCham: sua.ghiChuCham || {},
    daTraLuong: goc.daTraLuong || {},
    boQuaKhiNhap: goc.boQuaKhiNhap || [],
    chot: sua.chot || null,
    nhatKySo: sua.nhatKySo || [],
    coSoLieuMoi: !!(sua.soLieu && Object.keys(sua.soLieu).length),
  };
}

function gopChamTay(a, b) {
  const ra = {};
  Object.keys(Object.assign({}, a, b)).forEach((ng) => {
    ra[ng] = Object.assign({}, (a || {})[ng], (b || {})[ng]);
  });
  return ra;
}

/* ---------------- ghi ---------------- */

/** Ghi một điểm chấm tay. Không đụng vào tầng gốc. */
function luuChamTay(th, maNguoi, maTieuChi, diem) {
  const s = suaTay();
  const t = s.thang[th] || (s.thang[th] = {});
  const c = t.chamTay || (t.chamTay = {});
  const ng = c[maNguoi] || (c[maNguoi] = {});
  if (diem === null || diem === '' || diem === undefined) delete ng[maTieuChi];
  else ng[maTieuChi] = Number(diem);
  luu(th);
  return true;
}

/**
 * Ghi chú cho một điểm chấm tay: "vì sao chấm 0,7".
 *
 * Để RIÊNG khỏi `chamTay` chứ không nhét chung thành object {diem, ghiChu}: cả
 * `tinh.js` lẫn 41 phép kiểm đều đọc `chamTay[ng][tc]` là một SỐ. Đổi hình dạng
 * đó để thêm một dòng chữ là sửa lõi tính lương vì một việc của giao diện.
 */
function luuGhiChuCham(th, maNguoi, maTieuChi, chu) {
  const s = suaTay();
  const t = s.thang[th] || (s.thang[th] = {});
  const c = t.ghiChuCham || (t.ghiChuCham = {});
  const ng = c[maNguoi] || (c[maNguoi] = {});
  const v = String(chu == null ? '' : chu).trim().slice(0, 500);
  if (!v) delete ng[maTieuChi];
  else ng[maTieuChi] = v;
  if (!Object.keys(ng).length) delete c[maNguoi];
  luu(th);
  return true;
}

/**
 * Ghi số liệu đổ về / tải lên cho một tháng.
 * Không đụng tầng gốc: số mới nằm ở tầng sửa và đè lên bản gốc khi đọc, nên luôn
 * quay lại được số ban đầu nếu đổ nhầm.
 * @param nguon nhãn cho biết số này ở đâu ra ('app' | 'file' | 'tay')
 */
function luuSoLieu(th, soLieu, nguon, boKhoa) {
  const s = suaTay();
  const t = s.thang[th] || (s.thang[th] = {});
  t.soLieu = Object.assign({}, t.soLieu, soLieu || {});
  /* Ô nguồn vừa báo CHƯA ĐO ĐƯỢC thì bỏ số cũ đi. Chỉ gộp đè thì số của lần
   * đổ trước nằm lì ở đó: follow TikTok tháng 10/2026 đã lỡ ghi 0, sau khi lớp
   * nguồn biết nói "chưa đo được" thì con 0 ấy vẫn được chấm như kết quả thật. */
  (boKhoa || []).forEach((k) => { if (!(k in (soLieu || {}))) delete t.soLieu[k]; });
  const g = t.nhatKySo || (t.nhatKySo = []);
  g.unshift({ luc: Date.now(), nguon: nguon || 'tay', so: Object.keys(soLieu || {}).length });
  t.nhatKySo = g.slice(0, 20);
  luu(th);
  return Object.keys(soLieu || {}).length;
}

/** Bỏ toàn bộ số liệu đã đổ về, quay lại bản gốc. */
function boSoLieu(th) {
  const s = suaTay();
  if (s.thang[th]) { delete s.thang[th].soLieu; delete s.thang[th].nhatKySo; luu(th); }
  return true;
}

/** Ghi đè bộ luật của một tháng (dùng khi lưu kết quả thử luật, hoặc phân công). */
function luuLuat(th, luat) {
  const s = suaTay();
  const t = s.thang[th] || (s.thang[th] = {});
  t.luat = luat;
  luu(th);
  return true;
}

/** Trả bộ luật của tháng về đúng bản nhập từ Excel. */
function boSuaLuat(th) {
  const s = suaTay();
  /* Tháng không có bản gốc Excel thì sua.luat CHÍNH LÀ bộ luật của nó. Xoá đi
   * là tháng biến mất khỏi app, cuốn theo mọi điểm đã chấm. */
  if (s.thang[th] && s.thang[th].moTuApp) {
    return { loi: 'Tháng này mở trên app, không có bản Excel nào để quay về' };
  }
  if (s.thang[th]) { delete s.thang[th].luat; luu(th); }
  return true;
}

/**
 * Chốt tháng: đóng băng bản chụp. Sau khi chốt, tính lại không đổi được số đã
 * chốt — đây đúng là thứ file Excel không có, nên một tháng đã trả lương vẫn có
 * thể âm thầm đổi số khi ai đó sửa công thức phía trên.
 */
function chot(th, banChup, boi) {
  const s = suaTay();
  const t = s.thang[th] || (s.thang[th] = {});
  t.chot = { luc: Date.now(), boi: boi || '', banChup };
  luu(th);
  return t.chot;
}
function boChot(th) {
  const s = suaTay();
  if (s.thang[th]) { delete s.thang[th].chot; luu(th); }
  return true;
}

/* ---------------- nhập lần đầu lên Base ----------------
 * Chỉ chạy tay một lần (xem cong-cu/len-base.js). Để ở đây vì nó phải biết
 * đúng hình dạng của kho. */
async function nhapLenBase(goc, sua) {
  const lk = layLark();
  const dong = (bang, thangObj) => Object.entries(thangObj.thang || {}).map(([th, t]) => {
    const o = { [bang.f.thang]: th };
    Object.entries(bang.f).forEach(([khoa, fid]) => {
      if (khoa !== 'thang') o[fid] = viet(t[khoa]);
    });
    return o;
  });
  /* Từng dòng một — xem chú thích ENAMETOOLONG ở day(). */
  let a = 0; let b = 0;
  for (const h of dong(cfg.bang.goc, goc)) { await lk.createRecord(cfg.bang.goc.id, h); a += 1; }
  for (const h of dong(cfg.bang.sua, sua)) { await lk.createRecord(cfg.bang.sua.id, h); b += 1; }
  return { goc: a, sua: b };
}

module.exports = {
  THU_MUC, F_LICH_SU, F_SUA,
  nap, day, trangThai, nhapLenBase,
  danhSachThang, taoThang, thang, luuChamTay, luuGhiChuCham, luuLuat, boSuaLuat, chot, boChot,
  luuSoLieu, boSoLieu,
  coLichSu: () => !!Object.keys(KHO.goc.thang).length,
};
