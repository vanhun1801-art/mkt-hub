'use strict';
/**
 * Đọc file .xlsx bằng thư viện chuẩn của Node — không thêm phụ thuộc nào.
 *
 * Vì sao phải tự viết: Tourwell chỉ xuất .xlsx, và cả app này chạy với zero
 * dependency (xem package.json). Thêm một thư viện đọc Excel là thêm một thứ phải
 * nuôi, phải vá bảo mật, và làm hỏng tính chất "tải repo về là chạy".
 *
 * .xlsx là một file ZIP chứa XML:
 *   xl/sharedStrings.xml        — bảng chuỗi dùng chung
 *   xl/worksheets/sheet1.xml    — dữ liệu ô, trỏ vào bảng chuỗi bằng chỉ số
 *   xl/workbook.xml             — tên các sheet
 *
 * Đọc ZIP đi từ End Of Central Directory rồi qua Central Directory, KHÔNG quét
 * chuỗi "PK\x03\x04": với bit 3 của general purpose flag, kích thước trong local
 * header có thể bằng 0 và dữ liệu thật nằm ở data descriptor phía sau. Quét local
 * header là cách hỏng âm thầm với file do một số bộ ghi tạo ra.
 */
const zlib = require('zlib');

/* ---------------- ZIP ---------------- */

const EOCD = 0x06054b50;      // End of Central Directory
const CEN = 0x02014b50;       // Central Directory file header
const LOC = 0x04034b50;       // Local file header

/** Đọc mục lục ZIP → Map(tên file → {offset, method, sizeC, sizeU}). */
function mucLuc(buf) {
  // EOCD nằm ở cuối, có thể có comment tối đa 65535 byte phía sau
  let p = -1;
  const tuDay = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= tuDay; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD) { p = i; break; }
  }
  if (p < 0) throw new Error('Không phải file .xlsx (thiếu mục lục ZIP)');

  const soMuc = buf.readUInt16LE(p + 10);
  let cd = buf.readUInt32LE(p + 16);
  const out = new Map();
  for (let i = 0; i < soMuc; i += 1) {
    if (buf.readUInt32LE(cd) !== CEN) break;
    const method = buf.readUInt16LE(cd + 10);
    const sizeC = buf.readUInt32LE(cd + 20);
    const sizeU = buf.readUInt32LE(cd + 24);
    const nLen = buf.readUInt16LE(cd + 28);
    const eLen = buf.readUInt16LE(cd + 30);
    const cLen = buf.readUInt16LE(cd + 32);
    const off = buf.readUInt32LE(cd + 42);
    const ten = buf.toString('utf8', cd + 46, cd + 46 + nLen);
    out.set(ten, { off, method, sizeC, sizeU });
    cd += 46 + nLen + eLen + cLen;
  }
  return out;
}

/** Lấy nội dung một file trong ZIP. */
function docTrongZip(buf, muc, ten) {
  const m = muc.get(ten);
  if (!m) return null;
  if (buf.readUInt32LE(m.off) !== LOC) throw new Error('ZIP hỏng ở ' + ten);
  const nLen = buf.readUInt16LE(m.off + 26);
  const eLen = buf.readUInt16LE(m.off + 28);
  const dau = m.off + 30 + nLen + eLen;
  const raw = buf.subarray(dau, dau + m.sizeC);
  if (m.method === 0) return raw;                    // store
  if (m.method === 8) return zlib.inflateRawSync(raw); // deflate
  throw new Error('ZIP dùng kiểu nén chưa hỗ trợ (' + m.method + ') ở ' + ten);
}

/* ---------------- XML ---------------- */

const GIAI_MA = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
function boThe(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => GIAI_MA[m]);
}

/** Bảng chuỗi dùng chung. Một <si> có thể gồm nhiều <t> (chữ định dạng rời). */
function bangChuoi(xml) {
  if (!xml) return [];
  const out = [];
  /* `[^>]*?` LAZY, và nhánh tự đóng đặt TRƯỚC.
   *
   * Bản đầu dùng `[^>]*` tham lam: nó nuốt cả dấu `/` của thẻ tự đóng, nên
   * `<c r="J3" s="12"/>` bị khớp theo nhánh CÓ nội dung, rồi đi tìm `</c>` ở ô
   * SAU — ngốn luôn giá trị của ô kế tiếp. Đúng lỗi này đã làm cột `Nguồn` của
   * bản xuất Tourwell biến mất hoàn toàn (1000/1000 dòng đọc ra rỗng) trong khi
   * dữ liệu vẫn ở đó. Sai âm thầm, không có lỗi nào được ném ra. */
  const reSi = /<si\b([^>]*?)(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m;
  while ((m = reSi.exec(xml)) !== null) {
    const trong = m[2] || '';
    let s = '';
    const reT = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = reT.exec(trong)) !== null) s += t[1];
    out.push(boThe(s));
  }
  return out;
}

/** 'BC' → 28 (chỉ số cột, bắt đầu từ 0). */
function cotSo(ref) {
  const m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Đọc một sheet → mảng mảng chuỗi. */
function docSheet(xml, chuoi) {
  const rows = [];
  // LAZY + nhánh tự đóng trước — xem chú thích ở bangChuoi()
  const reRow = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let r;
  while ((r = reRow.exec(xml)) !== null) {
    const trong = r[2] || '';
    const o = [];
    let max = -1;
    // LAZY — đây chính là chỗ đã làm mất cột Nguồn. Xem chú thích ở bangChuoi()
    const reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    while ((c = reC.exec(trong)) !== null) {
      const attr = c[1] || '';
      const trongC = c[2] || '';
      const ref = (/r="([^"]+)"/.exec(attr) || [])[1] || '';
      const kieu = (/t="([^"]+)"/.exec(attr) || [])[1] || '';
      let i = ref ? cotSo(ref) : max + 1;
      if (i < 0) i = max + 1;

      let v = '';
      if (kieu === 'inlineStr') {
        const reT = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let t;
        while ((t = reT.exec(trongC)) !== null) v += t[1];
        v = boThe(v);
      } else {
        const mv = /<v>([\s\S]*?)<\/v>/.exec(trongC);
        const raw = mv ? boThe(mv[1]) : '';
        v = kieu === 's' ? (chuoi[Number(raw)] || '') : raw;
      }
      o[i] = v;
      if (i > max) max = i;
    }
    for (let i = 0; i <= max; i += 1) if (o[i] === undefined) o[i] = '';
    rows.push(o);
  }
  return rows;
}

/* ---------------- API ---------------- */

/**
 * Đọc file .xlsx → { sheets: [{ ten, rows }] }.
 * `buf` là Buffer nội dung file.
 */
function doc(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  const muc = mucLuc(buf);
  const ss = docTrongZip(buf, muc, 'xl/sharedStrings.xml');
  const chuoi = bangChuoi(ss ? ss.toString('utf8') : '');

  // tên sheet theo thứ tự, lấy từ workbook.xml
  const wb = docTrongZip(buf, muc, 'xl/workbook.xml');
  const tenSheet = [];
  if (wb) {
    const re = /<sheet\b[^>]*name="([^"]*)"[^>]*>/g;
    let m;
    while ((m = re.exec(wb.toString('utf8'))) !== null) tenSheet.push(boThe(m[1]));
  }

  const duong = [...muc.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => Number(/(\d+)/.exec(a)[1]) - Number(/(\d+)/.exec(b)[1]));

  const sheets = duong.map((d, i) => ({
    ten: tenSheet[i] || d,
    rows: docSheet(docTrongZip(buf, muc, d).toString('utf8'), chuoi),
  }));
  return { sheets };
}

/**
 * Đọc sheet đầu thành mảng object, dùng một dòng làm tiêu đề.
 *
 * Bản xuất của Tourwell có dòng 1 là tiêu đề trang ("DANH SÁCH LEAD (CƠ HỘI)") và
 * dòng 2 mới là tên cột. Nên phải TỰ TÌM dòng tiêu đề thay vì mặc định dòng 1 —
 * đoán sai một dòng là mọi tên cột lệch và không cột nào khớp.
 */
function docBang(buf, { tenCot = [] } = {}) {
  const { sheets } = doc(buf);
  if (!sheets.length) throw new Error('File không có sheet nào');
  const rows = sheets[0].rows;

  let iTieuDe = -1;
  let diem = -1;
  const can = tenCot.map((x) => String(x).toLowerCase().trim());
  for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
    const o = rows[i].map((x) => String(x || '').toLowerCase().trim());
    const khop = can.length ? can.filter((c) => o.includes(c)).length : o.filter(Boolean).length;
    if (khop > diem) { diem = khop; iTieuDe = i; }
  }
  if (iTieuDe < 0) throw new Error('Không tìm được dòng tiêu đề');
  if (can.length && diem === 0) {
    throw new Error('File này không có cột nào trong số: ' + tenCot.join(', '));
  }

  const cot = {};
  rows[iTieuDe].forEach((h, i) => {
    const t = String(h || '').trim();
    if (t && cot[t] === undefined) cot[t] = i;
  });
  const out = [];
  for (let i = iTieuDe + 1; i < rows.length; i += 1) {
    const r = rows[i];
    if (!r.some((x) => String(x || '').trim())) continue;
    const o = {};
    Object.entries(cot).forEach(([k, j]) => { o[k] = r[j] === undefined ? '' : r[j]; });
    out.push(o);
  }
  return { rows: out, cot: Object.keys(cot), dongTieuDe: iTieuDe + 1, tenSheet: sheets[0].ten };
}

module.exports = { doc, docBang, cotSo, boThe };
