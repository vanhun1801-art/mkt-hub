'use strict';
/**
 * Phân quyền thành viên — lưu trong một bảng Lark Base, không lưu file.
 *
 * Vì sao Base chứ không phải file JSON: ổ đĩa của Render là tạm, file mất sau mỗi
 * lần deploy. Để trong Base thì quản lý sửa được cả trong app lẫn trực tiếp trên
 * Lark, và dữ liệu đi cùng chỗ với mọi thứ khác của phòng.
 *
 * Bảng: "Phân quyền app" (mặc định nằm trong Base Tracking).
 *   Người · Email · open_id · Vai · Vị trí · Base được xem · Quản lý base ·
 *   Xem toàn bộ base · Xem tải người khác · Được tạo mới · Xem chi phí · Ghi chú
 *
 * Hai cột KIỂU VĂN BẢN giữ danh sách — "Base được xem" và "Xem tải người khác" —
 * đọc bằng cùng một quy ước (xem docOBase / docXemTai ở dưới). Các cột quyền
 * còn lại là Checkbox.
 *
 * "Vai = Quản lý" là toàn quyền TOÀN HỆ. "Quản lý base" là nấc giữa: trong đúng
 * những base ghi ở ô đó thì người này là quản lý (thấy mọi bản ghi, mọi số tiền,
 * thao tác được hết), còn ở lớp vỏ vẫn là nhân sự — không thêm/xoá base, không
 * sửa phân quyền, không Xem như. Dành cho Lead phụ trách một app.
 *
 * Khớp người theo EMAIL trước, rồi mới tới open_id: open_id khác nhau giữa các
 * app Lark nên không dùng làm khoá chính được.
 *
 * Ô "Base được xem" có BA trạng thái, đừng lẫn:
 *   "cong-viec,lich-tac-nghiep"  chỉ đúng những base này (base thêm sau KHÔNG có)
 *   ""  (trống)                  không base nào — đã cấp quyền mà bỏ trống là cấm sạch
 *   "*"                          mọi base, kể cả base thêm sau này
 * Trước đây trống bị hiểu là "mọi base", nên bỏ tick hết trong màn Phân quyền lại
 * thành mở hết — xem [[quyen-base-trong]] trong README.
 */
const fsn = require('fs');
const pathn = require('path');
/* Lớp gọi Base tách ra base-lark.js từ lúc hub có bảng thứ hai (Thông báo) —
 * hai bản sao của cùng một lớp gọi API thì sớm muộn lệch nhau. */
const baseLark = require('./base-lark');

const BASE = process.env.HUB_QUYEN_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG';
const TABLE = process.env.HUB_QUYEN_TABLE || 'tblBKm6ZurhN3703';

/* Bảng phân quyền để trong một FILE thay vì Base — chỉ dùng cho kiểm thử và cho
 * máy không nối được Lark. Có seam này thì luật "ai thấy base nào" kiểm thử được
 * mà không cần khoá app thật (xem test/quyen-base.test.js). */
const FILE = process.env.HUB_QUYEN_FILE || '';

const F = {
  nguoi: 'Người',
  email: 'Email',
  openId: 'open_id',
  vai: 'Vai',
  viTri: 'Vị trí',
  base: 'Base được xem',
  quanLyBase: 'Quản lý base',
  toanBo: 'Xem toàn bộ base',
  /* Hẹp hơn toanBo hai lần: chỉ mở lưới bảng nhiệt ở lớp vỏ (KHÔNG chuyển
   * xuống app con), và chỉ mở tải của ĐÚNG những người được kê tên.
   *
   * Kiểu cột: VĂN BẢN, cùng quy ước với "Base được xem" — open_id cách nhau
   * bằng dấu phẩy, `*` là tất cả, để trống là không ai. */
  xemTai: 'Xem tải người khác',
  taoMoi: 'Được tạo mới',
  chiPhi: 'Xem chi phí',
  ghiChu: 'Ghi chú',
};

/* Bộ hàm gọi đúng bảng này. Chế độ api / cli nằm trong base-lark.js. */
const B = baseLark.bang(BASE, TABLE);

/* ---------------- đọc ---------------- */
const asText = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : (x && (x.text || x.name)) || '')).join('');
  if (typeof v === 'object') return v.text || v.name || '';
  return String(v);
};

let cache = { at: 0, ds: null };

/** Ô "Base được xem" -> { base: [...id], moiBase: true/false }. Xem đầu file. */
function docOBase(raw) {
  const phan = String(raw == null ? '' : raw).split(',').map((x) => x.trim()).filter(Boolean);
  const laMoi = (x) => x === '*' || /^(tất cả|tat ca|all)$/i.test(x);
  return { base: phan.filter((x) => !laMoi(x)), moiBase: phan.some(laMoi) };
}

/**
 * Ô "Xem tải người khác" -> { ai: [...open_id], moiAi: true/false }.
 *
 * Cùng quy ước với "Base được xem": danh sách cách nhau bằng dấu phẩy, `*` là
 * cả phòng, để trống là KHÔNG AI (không phải "tất cả").
 *
 * Để riêng một hàm vì cùng cái ô này được giải nghĩa ở ba chỗ — đọc từ Base,
 * đọc từ file, ghi xuống Base. Ba đoạn code rời thì sớm muộn lệch nhau một
 * mức, mà lệch ở đây nghĩa là có người thấy tải của người mình không được thấy.
 */
function docXemTai(raw) {
  /* Đường lùi: cột này từng được hướng dẫn tạo kiểu Checkbox. Boolean phải bắt
   * riêng — `asText(true)` ra chuỗi "true", đem tách dấu phẩy thì thành một
   * open_id rác tên là "true". true hiểu là `*`, để đổi kiểu cột không làm mất
   * quyền đã cấp cho ai. */
  if (typeof raw === 'boolean') return { ai: [], moiAi: raw };
  const o = docOBase(asText(raw));
  return { ai: o.base, moiAi: o.moiBase };
}

/** Ngược lại: { xemTaiAi, moiXemTai } -> chuỗi ghi vào ô Văn bản. */
function ghiXemTai(hang) {
  return hang && hang.moiXemTai ? '*' : ((hang && hang.xemTaiAi) || []).join(',');
}

async function docTatCa(boQuaCache) {
  if (!boQuaCache && cache.ds && Date.now() - cache.at < 20000) return cache.ds;
  if (FILE) return docTuFile();

  const out = await B.docHet();

  const ds = out.map((r) => {
    const oB = docOBase(asText(r[F.base]));
    const recId = r.recordId;
    const oX = docXemTai(r[F.xemTai]);
    return {
      recordId: recId,
      nguoi: asText(r[F.nguoi]),
      email: asText(r[F.email]).trim().toLowerCase(),
      openId: asText(r[F.openId]).trim(),
      vai: asText(Array.isArray(r[F.vai]) ? r[F.vai][0] : r[F.vai]) || '',
      viTri: asText(r[F.viTri]).trim(),
      base: oB.base,
      moiBase: oB.moiBase,
      quanLyBase: docOBase(asText(r[F.quanLyBase])).base,
      toanBo: r[F.toanBo] === true,
      xemTaiAi: oX.ai,
      moiXemTai: oX.moiAi,
      taoMoi: r[F.taoMoi] === true,
      chiPhi: r[F.chiPhi] === true,
      ghiChu: asText(r[F.ghiChu]),
    };
  }).filter((r) => r.email || r.openId || r.nguoi);

  cache = { at: Date.now(), ds };
  return ds;
}

const chuanTen = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Dòng phân quyền của một người, hoặc null nếu chưa khai.
 *
 * Khớp theo ba lớp, vì `open_id` KHÁC NHAU giữa các app Lark: quản lý thêm người
 * từ danh bạ ở máy mình (open_id của lark-cli) mà nhân sự lại đăng nhập trên bản
 * deploy (open_id của app Marketing Hub) -> hai chuỗi không giống nhau.
 *   1. email        — không đổi giữa các app, chắc nhất
 *   2. open_id      — đúng khi cùng một app
 *   3. TÊN hiển thị — phao cứu sinh; chỉ nhận khi đúng MỘT dòng trùng tên
 *
 * Khớp được bằng tên thì tự vá dòng đó (ghi lại open_id/email thật) để lần sau
 * khớp thẳng, không phải dựa vào tên nữa.
 */
async function cuaNguoi(nguoi) {
  if (!nguoi) return null;
  const ds = await docTatCa();
  const mail = String(nguoi.email || '').trim().toLowerCase();

  const mailPhu = String(nguoi.emailPhu || '').trim().toLowerCase();
  const theoMail = (mail ? ds.find((r) => r.email === mail) : null) ||
                   (mailPhu ? ds.find((r) => r.email === mailPhu) : null);
  if (theoMail) return theoMail;

  const theoId = nguoi.id ? ds.find((r) => r.openId && r.openId === nguoi.id) : null;
  if (theoId) return theoId;

  const ten = chuanTen(nguoi.name);
  if (!ten) return null;
  const trungTen = ds.filter((r) => chuanTen(r.nguoi) === ten);
  if (trungTen.length !== 1) return null;      // trùng tên nhiều dòng thì không đoán

  vaDanhTinh(trungTen[0], nguoi).catch(() => {});
  return trungTen[0];
}

/** Ghi open_id/email thật vào dòng vừa khớp bằng tên (chạy nền, lỗi thì bỏ qua). */
async function vaDanhTinh(hang, nguoi) {
  const mail = String(nguoi.email || '').trim();
  const id = String(nguoi.id || '').trim();
  if (!mail && !id) return;
  if (hang.email === mail.toLowerCase() && hang.openId === id) return;
  await ghi(Object.assign({}, hang, {
    email: mail || hang.email,
    openId: id || hang.openId,
    ghiChu: (hang.ghiChu ? hang.ghiChu + ' · ' : '') + 'tự nhận diện theo tên',
  }));
}

/* ---------------- ghi ---------------- */
async function ghi(hang) {
  if (FILE) return ghiVaoFile(hang);
  const cells = {
    [F.nguoi]: hang.nguoi || '',
    [F.email]: (hang.email || '').trim(),
    [F.openId]: (hang.openId || '').trim(),
    [F.vai]: hang.vai === 'Quản lý' ? 'Quản lý' : 'Nhân sự',
    [F.viTri]: hang.viTri || '',
    // '*' = mọi base kể cả base thêm sau; trống = không base nào (KHÔNG phải "tất cả")
    [F.base]: hang.moiBase ? '*' : (hang.base || []).join(','),
    [F.quanLyBase]: (hang.quanLyBase || []).join(','),
    [F.toanBo]: !!hang.toanBo,
    [F.xemTai]: ghiXemTai(hang),
    [F.taoMoi]: !!hang.taoMoi,
    [F.chiPhi]: !!hang.chiPhi,
    [F.ghiChu]: hang.ghiChu || '',
  };

  /* Bảng của người dùng có thể thiếu cột mới (chưa thêm "Quản lý base" chẳng
   * hạn). Ghi vào cột không tồn tại là Lark trả lỗi và mất luôn cả bản ghi —
   * nên lọc theo cột thật, và nói ra cột nào bị bỏ (xem B.locCotThat). */
  await B.locCotThat(cells, 'phân quyền');

  if (hang.recordId) {
    await B.ghi(hang.recordId, cells);
    cache.at = 0;
    return hang.recordId;
  }
  const id = await B.tao(cells);
  cache.at = 0;
  return id;
}

async function xoa(recordId) {
  if (FILE) {
    const ds = docTuFile().filter((r) => r.recordId !== recordId);
    fsn.writeFileSync(pathn.resolve(FILE), JSON.stringify(ds, null, 2), 'utf8');
    cache.at = 0;
    return;
  }
  await B.xoa(recordId);
  cache.at = 0;
}

function xoaCache() { cache.at = 0; }

/**
 * Những cột của F còn THIẾU trên bảng phân quyền.
 *
 * Đường ghi đã lọc bỏ cột thiếu để không làm mất cả bản ghi, nhưng nó chỉ
 * console.warn — mà quản lý không đọc log. Trả danh sách ra để panel nói thẳng:
 * bật một quyền mà cột chưa có thì quyền đó KHÔNG có tác dụng, và im lặng là
 * cách chắc nhất để không ai biết.
 */
async function cotThieu() {
  /* Chỉ bỏ qua ở chế độ FILE (tệp JSON không có khái niệm cột). Chế độ cli đọc
   * được danh sách cột qua `base +field-list`, nên vẫn kiểm — bản đầu tôi chặn
   * luôn cả cli, thành ra ở máy cá nhân không bao giờ biết bảng thiếu cột. */
  if (FILE) return [];
  try {
    const co = new Set(Object.values(await B.tenCot()));
    return Object.values(F).filter((ten) => !co.has(ten));
  } catch (e) {
    return [];
  }
}

/* ---------------- bảng phân quyền để trong file (kiểm thử / máy rời Lark) ----
 * File là một mảng JSON các dòng đã chuẩn hoá:
 *   [{ "nguoi": "...", "email": "...", "base": ["cong-viec"], "moiBase": false,
 *      "vai": "Nhân sự", "toanBo": false, "taoMoi": true, "chiPhi": false }]
 */
function docTuFile() {
  let tho = [];
  try { tho = JSON.parse(fsn.readFileSync(pathn.resolve(FILE), 'utf8')); } catch (_) { tho = []; }
  if (!Array.isArray(tho)) tho = tho && Array.isArray(tho.hang) ? tho.hang : [];
  const ds = tho.map((r, i) => {
    const o = typeof r.base === 'string' ? docOBase(r.base) : { base: r.base || [], moiBase: !!r.moiBase };
    /* File cho khai hai kiểu: `xemTai` một ô như trên Base, hoặc đôi
     * xemTaiAi/moiXemTai đã tách sẵn như code dùng. */
    const oX = 'xemTai' in r ? docXemTai(r.xemTai)
      : { ai: r.xemTaiAi || [], moiAi: !!r.moiXemTai };
    return {
      recordId: r.recordId || 'f' + i,
      nguoi: String(r.nguoi || ''),
      email: String(r.email || '').trim().toLowerCase(),
      openId: String(r.openId || '').trim(),
      vai: r.vai === 'Quản lý' ? 'Quản lý' : 'Nhân sự',
      viTri: String(r.viTri || ''),
      base: o.base, moiBase: o.moiBase,
      quanLyBase: typeof r.quanLyBase === 'string'
        ? docOBase(r.quanLyBase).base : (r.quanLyBase || []),
      toanBo: !!r.toanBo, xemTaiAi: oX.ai, moiXemTai: oX.moiAi,
      taoMoi: r.taoMoi !== false, chiPhi: !!r.chiPhi,
      ghiChu: String(r.ghiChu || ''),
    };
  }).filter((r) => r.email || r.openId || r.nguoi);
  cache = { at: Date.now(), ds };
  return ds;
}

function ghiVaoFile(hang) {
  const ds = docTuFile().filter((r) => !hang.recordId || r.recordId !== hang.recordId);
  const id = hang.recordId || 'f' + Date.now();
  ds.push(Object.assign({}, hang, { recordId: id }));
  fsn.writeFileSync(pathn.resolve(FILE), JSON.stringify(ds, null, 2), 'utf8');
  cache.at = 0;
  return id;
}

module.exports = {
  BASE, TABLE, F,
  docTatCa, cuaNguoi, ghi, xoa, xoaCache, cotThieu, docOBase, docXemTai, ghiXemTai,
  larkUrl: 'https://rootytrip2.sg.larksuite.com/base/' + BASE + '?table=' + TABLE,
};
