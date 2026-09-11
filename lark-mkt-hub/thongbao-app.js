'use strict';
/**
 * ============================================================================
 * THÔNG BÁO CHẶN MÀN HÌNH — quản lý nói một câu, cả phòng buộc phải đọc
 * ============================================================================
 * Anh Hùng cần một nơi gửi thông báo che phủ toàn bộ app, bắt buộc đọc. Hai
 * mức, chọn theo từng thông báo (đúng lời anh: "tùy mức độ thông báo"):
 *
 *   chỉ đọc        — hiện ra, bấm "Tôi đã đọc" là xong
 *   có chỗ để ấn   — kèm một nút mở link/base; bật "Buộc bấm" thì chưa bấm
 *                    vào đó thì nút "Tôi đã đọc" còn khoá
 *
 * Và một khoảng hiển thị (từ ngày – đến ngày). Ngoài khoảng thì không hiện,
 * khỏi phải nhớ vào tắt.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO LƯU TRÊN BASE, KHÔNG PHẢI FILE
 *
 * Ổ đĩa của Render là tạm: file mất sau mỗi lần deploy. Với thông báo thì mất
 * file nghĩa là mất cả danh sách AI ĐÃ ĐỌC — cả phòng bị chặn lại lần nữa bởi
 * một thông báo họ đã xác nhận tuần trước. Trên Base thì sống mãi, và anh sửa
 * thẳng trong Lark cũng được. Cùng lý do với bảng Phân quyền (xem quyen.js).
 *
 * Bảng nằm CÙNG Base với bảng Phân quyền, chỉ khác table id — khỏi thêm một
 * Base nữa để nhớ.
 *
 * ---------------------------------------------------------------------------
 * "ĐÃ ĐỌC" LƯU TRONG MỘT Ô, VÀ ĐÂY LÀ CHỖ PHẢI CẨN THẬN
 *
 * Một dòng = một thông báo, ô "Đã đọc" giữ `open_id@thời-điểm` cách nhau bằng
 * dấu phẩy. Gọn, đọc được bằng mắt ngay trong Lark, không cần bảng thứ hai.
 *
 * Cái giá: hai người xác nhận trong cùng một nhịp thì đường ghi là đọc–sửa–ghi,
 * người sau có thể ghi đè người trước. Nên `xacNhan()` đọc lại từ Base BỎ QUA
 * bộ đệm ngay trước khi ghi, thu hẹp khe hở xuống còn một nhịp gọi API. Phòng
 * hơn mười người thì gần như không gặp; mà nếu gặp thì hậu quả tự lành: popup
 * hiện lại, họ bấm lần nữa. Đổi sang bảng-thứ-hai (một dòng một người) là cách
 * chắc chắn, để dành khi nào phòng đông lên.
 */
const fsn = require('fs');
const pathn = require('path');
const baseLark = require('./base-lark');
/* Chỉ lấy đúng một hàm: cách đọc ô danh sách (`*` = tất cả). Dùng lại để bảng
 * này và bảng Phân quyền không bao giờ hiểu "ai nhận" theo hai cách khác nhau. */
const { docOBase } = require('./quyen');

/* Cùng Base với bảng Phân quyền; table id khai riêng.
 *
 * Có giá trị mặc định cứng, cùng lối với quyen.js: bảng này đã tạo sẵn trên
 * Base của phòng nên khai mặc định là deploy chạy được ngay, không phải nhớ
 * thêm một biến môi trường nữa. Biến HUB_TB_TABLE vẫn ghi đè được khi cần
 * trỏ sang bảng khác (kiểm thử, hoặc phòng khác dùng lại code này). */
const BASE = process.env.HUB_TB_BASE || process.env.HUB_QUYEN_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG';
const TABLE = process.env.HUB_TB_TABLE || 'tblcJnEvbMfHgNgn';

/* Bảng để trong FILE thay vì Base — chỉ dùng cho kiểm thử và máy rời Lark.
 * Có seam này thì luật "ai thấy thông báo nào" thử được mà không cần khoá app. */
const FILE = process.env.HUB_TB_FILE || '';

/* Chỉ dựng bộ gọi khi thật sự có table id: `bang()` không gọi mạng lúc dựng,
 * nhưng để null thì mọi chỗ dùng phải tự kiểm tra, dễ sót. */
const B = TABLE ? baseLark.bang(BASE, TABLE) : null;

/** Tên cột trên Base. Đổi tên cột thì sửa đúng một chỗ này. */
const F = {
  tieuDe: 'Tiêu đề',
  noiDung: 'Nội dung',
  mucDo: 'Mức độ',
  nhanNut: 'Nút hành động',
  lienKet: 'Liên kết',
  buocBam: 'Buộc bấm nút',
  tuNgay: 'Từ ngày',
  denNgay: 'Đến ngày',
  nguoiNhan: 'Người nhận',
  bat: 'Bật',
  daDoc: 'Đã đọc',
};

const MUC_DO = ['Tin', 'Quan trọng', 'Gấp'];

/* ---------------- phụ trợ ---------------- */
const asText = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === 'string' ? x : (x && (x.text || x.name)) || '')).join('');
  }
  if (typeof v === 'object') return v.text || v.name || '';
  return String(v);
};

/** Ô ngày của Base trả về số ms, hoặc chuỗi. Trả 0 khi để trống. */
const asMs = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const t = Date.parse(asText(v));
  return t || 0;
};

/**
 * Ô "Đã đọc" -> Map(open_id -> thời điểm ISO).
 *
 * Nhận cả dạng chỉ có open_id (không kèm thời điểm) để sửa tay trong Lark vẫn
 * được: gõ mấy open_id cách nhau bằng dấu phẩy là đánh dấu họ đã đọc.
 */
function docDaDoc(raw) {
  const m = new Map();
  String(raw == null ? '' : raw).split(',').forEach((phan) => {
    const s = phan.trim();
    if (!s) return;
    const i = s.indexOf('@');
    if (i < 0) m.set(s, '');
    else m.set(s.slice(0, i).trim(), s.slice(i + 1).trim());
  });
  return m;
}

const ghiDaDoc = (m) => [...m.entries()].map(([id, luc]) => (luc ? id + '@' + luc : id)).join(',');

/* ---------------- đọc ---------------- */
let cache = { at: 0, ds: null };
function xoaCache() { cache.at = 0; }

function docTuFile() {
  let tho = [];
  try { tho = JSON.parse(fsn.readFileSync(pathn.resolve(FILE), 'utf8')); } catch (_) { tho = []; }
  if (!Array.isArray(tho)) tho = (tho && tho.ds) || [];
  return tho.map((r, i) => chuanHoa(Object.assign({ recordId: 'f' + i }, r)));
}

/** Một dòng thô (Base hoặc file) -> dạng chuẩn mà cả hub dùng. */
function chuanHoa(r) {
  const oN = docOBase(asText(r.nguoiNhan != null ? r.nguoiNhan : r[F.nguoiNhan]));
  const lay = (k) => (r[k] != null ? r[k] : r[F[k]]);
  const mucDo = asText(Array.isArray(lay('mucDo')) ? lay('mucDo')[0] : lay('mucDo')).trim();
  return {
    recordId: r.recordId || r.id || '',
    tieuDe: asText(lay('tieuDe')).trim(),
    noiDung: asText(lay('noiDung')),
    mucDo: MUC_DO.includes(mucDo) ? mucDo : 'Tin',
    nhanNut: asText(lay('nhanNut')).trim(),
    lienKet: asText(lay('lienKet')).trim(),
    buocBam: lay('buocBam') === true,
    tuNgay: asMs(lay('tuNgay')),
    denNgay: asMs(lay('denNgay')),
    ai: oN.base,
    moiAi: oN.moiBase,
    bat: lay('bat') !== false,
    daDoc: docDaDoc(asText(lay('daDoc'))),
  };
}

async function docTatCa(boQuaCache) {
  if (!boQuaCache && cache.ds && Date.now() - cache.at < 20000) return cache.ds;
  let ds;
  if (FILE) ds = docTuFile();
  else if (!B) ds = [];
  else ds = (await B.docHet()).map(chuanHoa);
  ds = ds.filter((r) => r.tieuDe || r.noiDung);
  cache = { at: Date.now(), ds };
  return ds;
}

/* ---------------- luật hiển thị ---------------- */

/**
 * Thông báo này có phải của người này, và có đang trong khoảng hiển thị không.
 *
 * Bốn cửa, và cả bốn đều phải qua. Tách thành hàm riêng vì đúng luật này quyết
 * định "ai bị chặn màn hình" — thứ không được đoán, và phải thử được.
 */
function dangHieuLuc(tb, nguoiId, luc) {
  const t = luc == null ? Date.now() : luc;
  if (!tb.bat) return false;
  if (tb.tuNgay && t < tb.tuNgay) return false;
  /* "Đến ngày" tính HẾT ngày đó: quản lý đặt 20/09 là có ý bao gồm cả ngày 20,
   * không phải tắt lúc 00:00 sáng 20. Ô ngày của Base trỏ vào 00:00, nên cộng
   * thêm một ngày. */
  if (tb.denNgay && t >= tb.denNgay + 86400000) return false;
  if (tb.moiAi) return true;
  return !!nguoiId && tb.ai.includes(nguoiId);
}

/** Người này đã xác nhận đọc chưa. */
const daXacNhan = (tb, nguoiId) => !!nguoiId && tb.daDoc.has(nguoiId);

/**
 * Những thông báo người này CÒN PHẢI ĐỌC, thông báo gấp lên trước.
 *
 * Cắt ở máy chủ chứ không lọc trên giao diện: danh sách này che màn hình của
 * người ta, nên nội dung thông báo của người khác không được lọt xuống máy họ.
 */
async function cuaNguoi(nguoi, boQuaCache) {
  const id = (nguoi && nguoi.id) || '';
  const ds = await docTatCa(boQuaCache);
  const bac = { 'Gấp': 0, 'Quan trọng': 1, 'Tin': 2 };
  return ds
    .filter((tb) => dangHieuLuc(tb, id) && !daXacNhan(tb, id))
    .sort((a, b) => (bac[a.mucDo] - bac[b.mucDo]) || (b.tuNgay - a.tuNgay))
    .map((tb) => ({
      recordId: tb.recordId,
      tieuDe: tb.tieuDe,
      noiDung: tb.noiDung,
      mucDo: tb.mucDo,
      nhanNut: tb.nhanNut,
      lienKet: tb.lienKet,
      buocBam: tb.buocBam,
      denNgay: tb.denNgay,
    }));
}

/* ---------------- ghi ---------------- */

/**
 * Ghi một lượt xác nhận, rồi ĐỌC LẠI để chắc nó còn ở đó.
 *
 * Cả danh sách đã đọc nằm trong MỘT ô văn bản, nên mỗi lượt bấm là đọc–sửa–ghi
 * lại cả ô. Hai người bấm cùng một nhịp thì người sau ghi đè người trước, và
 * Lark không có kiểu ghi "chỉ khi chưa ai đổi" — nên lúc ghi không phát hiện
 * được, chỉ sau khi ghi mới biết.
 *
 * Trước đây chuyện này gần như không xảy ra vì mỗi thông báo gửi cho một người.
 * Giờ một thông báo gửi cho cả phòng: popup bật cùng lúc trên tám máy, nên bấm
 * trùng nhịp là chuyện SẼ xảy ra — 11/09 đã có hai lượt cách nhau 2 giây.
 *
 * Chỉ tự lo cho MÌNH: đọc lại không thấy id của mình thì ghi lại. Không dựng
 * lại giúp người khác — lượt ghi nào cũng tự kiểm tra phần của nó, mà "dựng lại
 * giúp" thì lỡ quản lý vừa xoá tay ô đó để hỏi lại cả phòng là mình lôi mấy tên
 * cũ về, xoá xong lại thấy y như cũ.
 *
 * Thử hết số lần vẫn không được thì NÉM LỖI. Người nhận thấy popup chưa đóng và
 * một câu bảo bấm lại — khó chịu, nhưng đúng: im lặng coi như xong thì họ tưởng
 * đã xác nhận, còn bảng của quản lý thì không có tên họ.
 *
 * `doc()` trả Map(open_id -> lúc) của đúng dòng đó, hoặc null nếu dòng không
 * còn. `ghi(map)` ghi cả ô. Truyền vào từ ngoài để thử được cảnh ghi đè mà
 * không cần Base thật.
 */
async function ghiCoDocLai(doc, ghi, nguoiId, soLan) {
  const lan = soLan || 3;
  /* Giữ NGUYÊN một mốc thời gian cho mọi lần thử: đó là lúc họ bấm, không phải
   * lúc lần ghi cuối cùng lọt. */
  const luc = new Date().toISOString();
  for (let i = 0; i < lan; i++) {
    const m = await doc();
    if (!m) throw new Error('Không thấy thông báo này.');
    /* Vòng đầu thấy sẵn = họ đã xác nhận từ trước, không ghi đè thời điểm cũ
     * (đó là bằng chứng "đọc lúc nào"). Vòng sau thấy = lần ghi vừa rồi lọt. */
    if (m.has(nguoiId)) return i === 0 ? { daCo: true } : { ok: true, lanGhi: i };
    m.set(nguoiId, luc);
    await ghi(m);
  }
  const cuoi = await doc();
  if (cuoi && cuoi.has(nguoiId)) return { ok: true, lanGhi: lan };
  throw new Error('Lark nhận lượt xác nhận rồi lại làm mất — có người bấm cùng nhịp. ' +
    'Bấm "Tôi đã đọc" thêm lần nữa giúp em.');
}

/** Ghi lại cả tệp với ô "Đã đọc" của một dòng đã đổi. Chỉ dùng cho kiểm thử. */
function ghiDaDocVaoFile(recordId, m) {
  const tho = docTuFile().map((x) => ({
    recordId: x.recordId, tieuDe: x.tieuDe, noiDung: x.noiDung, mucDo: x.mucDo,
    nhanNut: x.nhanNut, lienKet: x.lienKet, buocBam: x.buocBam,
    tuNgay: x.tuNgay, denNgay: x.denNgay,
    nguoiNhan: x.moiAi ? '*' : x.ai.join(','), bat: x.bat,
    daDoc: ghiDaDoc(x.recordId === recordId ? m : x.daDoc),
  }));
  fsn.writeFileSync(pathn.resolve(FILE), JSON.stringify(tho, null, 2), 'utf8');
}

/**
 * Đánh dấu người này đã đọc.
 *
 * Đọc lại đúng dòng đó BỎ QUA bộ đệm ngay trước khi ghi, và đọc lại lần nữa sau
 * khi ghi — xem ghiCoDocLai. Cố ý đọc cả bảng chứ không đọc một dòng: đường đọc
 * cả bảng là đường đã chạy thật ở cả hai chế độ api/cli, còn record-get thì
 * chưa. Bảng này chỉ có mấy chục dòng nên rẻ.
 */
async function xacNhan(recordId, nguoiId) {
  if (!recordId || !nguoiId) throw new Error('Thiếu mã thông báo hoặc người đọc.');

  if (FILE) {
    return ghiCoDocLai(
      () => {
        const tb = docTuFile().find((x) => x.recordId === recordId);
        return tb ? tb.daDoc : null;
      },
      (m) => { ghiDaDocVaoFile(recordId, m); xoaCache(); },
      nguoiId);
  }
  if (!B) throw new Error('Chưa khai HUB_TB_TABLE — xem README.');

  return ghiCoDocLai(
    async () => {
      const tb = (await docTatCa(true)).find((x) => x.recordId === recordId);
      return tb ? tb.daDoc : null;
    },
    async (m) => {
      await B.ghi(recordId, { [F.daDoc]: ghiDaDoc(m) });
      xoaCache();
    },
    nguoiId);
}

/** Soạn / sửa một thông báo (chỉ quản lý — máy chủ chốt). */
async function luu(hang) {
  if (FILE) throw new Error('Bản chạy này giữ thông báo trong file, sửa trực tiếp file đó.');
  if (!B) throw new Error('Chưa khai HUB_TB_TABLE — xem README.');
  const cells = {
    [F.tieuDe]: hang.tieuDe || '',
    [F.noiDung]: hang.noiDung || '',
    [F.mucDo]: MUC_DO.includes(hang.mucDo) ? hang.mucDo : 'Tin',
    [F.nhanNut]: hang.nhanNut || '',
    [F.lienKet]: hang.lienKet || '',
    [F.buocBam]: !!hang.buocBam,
    [F.nguoiNhan]: hang.moiAi ? '*' : (hang.ai || []).join(','),
    [F.bat]: hang.bat !== false,
  };
  if (hang.tuNgay) cells[F.tuNgay] = Number(hang.tuNgay);
  if (hang.denNgay) cells[F.denNgay] = Number(hang.denNgay);
  /* Bảng thiếu cột thì bỏ ô đó ra thay vì để Lark trả lỗi và mất cả bản ghi. */
  await B.locCotThat(cells, 'thông báo');
  const id = hang.recordId ? await B.ghi(hang.recordId, cells) : await B.tao(cells);
  xoaCache();

  /* ĐỌC LẠI để chắc nó thật sự nằm trên bảng.
   *
   * Ngày 11/09 đã có một lần: quản lý soạn xong, panel báo "Đã lưu" màu xanh,
   * mà đọc bảng bằng API mấy phút sau vẫn chỉ thấy hai dòng cũ. Không phân biệt
   * được là ghi rơi hay Lark trả bản chụp cũ, vì lúc đó không có chỗ nào kiểm
   * tra lại cả.
   *
   * Nên: ghi xong đọc lại. Không thấy thì NÉM LỖI thay vì hiện "Đã lưu" —
   * "gửi rồi mà cả phòng không nhận được gì" là loại lỗi không có dấu hiệu nào,
   * phải nói ra ngay lúc nó xảy ra chứ không để đoán về sau. Thà báo nhầm một
   * lần rồi soạn lại, còn hơn tưởng đã gửi.
   */
  const co = (await docTatCa(true)).some((x) => x.recordId === id);
  if (!co) {
    throw new Error('Lark nhận rồi nhưng đọc lại chưa thấy thông báo trên bảng. ' +
      'Mở bảng trong Lark xem có dòng vừa soạn không: có thì chỉ là Lark chậm, ' +
      'không có thì soạn lại.');
  }
  return id;
}

async function xoa(recordId) {
  if (FILE) throw new Error('Bản chạy này giữ thông báo trong file.');
  if (!B) throw new Error('Chưa khai HUB_TB_TABLE — xem README.');
  await B.xoa(recordId);
  xoaCache();
}

/** Cột nào của F còn thiếu trên bảng — panel nói thẳng thay vì im lặng bỏ qua. */
async function cotThieu() {
  if (FILE || !B) return [];
  try {
    const co = new Set(Object.values(await B.tenCot()));
    return Object.values(F).filter((ten) => !co.has(ten));
  } catch (e) {
    return [];
  }
}

const coBang = () => !!(FILE || B);
const larkUrl = () => (B ? B.larkUrl : '');

module.exports = {
  F, MUC_DO, docTatCa, cuaNguoi, xacNhan, luu, xoa, xoaCache, cotThieu, coBang, larkUrl,
  // để kiểm thử gọi trực tiếp
  dangHieuLuc, daXacNhan, docDaDoc, ghiDaDoc, chuanHoa, ghiCoDocLai,
};
