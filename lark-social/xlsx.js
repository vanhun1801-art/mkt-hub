'use strict';
/**
 * Sinh tệp .xlsx thật, không phụ thuộc thư viện ngoài.
 *
 * VÌ SAO KHÔNG DÙNG CSV. App đã có CSV và nó vẫn hữu ích, nhưng tệp gửi đối tác
 * thì khác: CSV mở lên là một bảng trần, không tiêu đề đậm, không tách được
 * nhiều bảng, và Excel tiếng Việt còn hay đoán sai dấu phân cách. Một .xlsx
 * thật mở phát là đúng — nhiều sheet, cột rộng sẵn, tiêu đề đậm, số ra số.
 *
 * .xlsx là một tệp ZIP chứa mấy tệp XML. Node có sẵn `zlib`, nên chỉ còn phải
 * tự đóng gói ZIP: mỗi tệp một local header, rồi central directory, rồi
 * end-of-central-directory. Khoảng trăm dòng, đổi lại không kéo theo dependency
 * nào vào một repo cố tình giữ sạch.
 *
 * KHÔNG NÉN (store, method 0). Báo cáo nặng vài chục KB; nén lại tiết kiệm
 * không đáng bao nhiêu mà thêm một chỗ có thể sai. Excel mở tệp ZIP không nén
 * bình thường.
 */
const zlib = require('zlib');

/* ---------------- ZIP ---------------- */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * @param {Array<{ten: string, noiDung: string}>} tep
 * @returns {Buffer}
 */
function dongZip(tep) {
  const cuc = [];
  const muc = [];
  let offset = 0;

  tep.forEach((t) => {
    const ten = Buffer.from(t.ten, 'utf8');
    const data = Buffer.from(t.noiDung, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);        // cần version 2.0
    local.writeUInt16LE(0x0800, 6);    // cờ: tên tệp là UTF-8
    local.writeUInt16LE(0, 8);         // method 0 = store
    local.writeUInt16LE(0, 10);        // giờ
    local.writeUInt16LE(0x21, 12);     // ngày (1980-01-01, cố định cho tệp lặp lại được)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(ten.length, 26);
    local.writeUInt16LE(0, 28);
    cuc.push(local, ten, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(ten.length, 28);
    central.writeUInt32LE(offset, 42);
    muc.push(central, ten);

    offset += local.length + ten.length + data.length;
  });

  const than = Buffer.concat(cuc);
  const thuMuc = Buffer.concat(muc);
  const duoi = Buffer.alloc(22);
  duoi.writeUInt32LE(0x06054b50, 0);
  duoi.writeUInt16LE(tep.length, 8);
  duoi.writeUInt16LE(tep.length, 10);
  duoi.writeUInt32LE(thuMuc.length, 12);
  duoi.writeUInt32LE(than.length, 16);
  return Buffer.concat([than, thuMuc, duoi]);
}

/* ---------------- XML ---------------- */

const xEsc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  /* Ký tự điều khiển làm Excel báo "tệp hỏng" và từ chối mở hẳn. Caption lấy về
   * từ nền tảng có lẫn chúng nhiều hơn người ta tưởng. */
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** A1, B1… Z1, AA1 — cột quá 26 là chuyện thường với bảng báo cáo. */
function oTen(cot, hang) {
  let s = '';
  let n = cot;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s + hang;
}

/**
 * Một ô. Số thì ghi kiểu số để Excel cộng được; chữ ghi inline để khỏi phải
 * dựng bảng chuỗi dùng chung.
 */
function oXml(cot, hang, v, dam) {
  const ref = oTen(cot, hang);
  const style = dam ? ' s="1"' : '';
  if (v == null || v === '') return '<c r="' + ref + '"' + style + '/>';
  if (typeof v === 'number' && Number.isFinite(v)) {
    return '<c r="' + ref + '"' + style + '><v>' + v + '</v></c>';
  }
  return '<c r="' + ref + '" t="inlineStr"' + style + '><is><t xml:space="preserve">'
    + xEsc(v) + '</t></is></c>';
}

/**
 * Tên sheet Excel không được chứa : \ / ? * [ ] và tối đa 31 ký tự.
 * Đặt tên sheet là "VinWonders Phú Quốc / Safari" thì Excel từ chối mở tệp —
 * và lỗi đó chỉ hiện ra ở máy người nhận.
 */
function tenSheet(s, daDung) {
  const goc = String(s || 'Sheet').replace(/[:\\\/?*[\]]/g, '-').slice(0, 31).trim() || 'Sheet';
  let t = goc;
  let i = 2;
  /* Dựng lại từ tên GỐC mỗi vòng. Bản đầu nối hậu tố vào tên đã nối lần trước,
   * nên lần thứ ba ra "Tour (2) (3)" rồi bị cắt thành thứ không ai đoán được. */
  while (daDung.has(t.toLowerCase())) {
    const hau = ' (' + i + ')';
    t = goc.slice(0, 31 - hau.length) + hau;
    i++;
  }
  daDung.add(t.toLowerCase());
  return t;
}

function sheetXml(hang, rong) {
  const cols = (rong || []).length
    ? '<cols>' + rong.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1)
      + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>'
    : '';
  const body = hang.map((h, r) => {
    const o = (h.o || []).map((v, c) => oXml(c, r + 1, v, h.dam)).join('');
    return '<row r="' + (r + 1) + '">' + o + '</row>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + cols + '<sheetData>' + body + '</sheetData></worksheet>';
}

/**
 * @param {Array<{ten, hang: Array<{o: Array, dam?: boolean}>, rong?: number[]}>} sheets
 * @returns {Buffer} nội dung .xlsx
 */
function taoXlsx(sheets) {
  const daDung = new Set();
  const ds = sheets.map((s, i) => ({ ...s, ten: tenSheet(s.ten, daDung), id: i + 1 }));

  const tep = [
    {
      ten: '[Content_Types].xml',
      noiDung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + ds.map((s) => '<Override PartName="/xl/worksheets/sheet' + s.id
          + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')
        + '</Types>',
    },
    {
      ten: '_rels/.rels',
      noiDung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
    },
    {
      ten: 'xl/workbook.xml',
      noiDung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + ds.map((s) => '<sheet name="' + xEsc(s.ten) + '" sheetId="' + s.id
          + '" r:id="rId' + s.id + '"/>').join('')
        + '</sheets></workbook>',
    },
    {
      ten: 'xl/_rels/workbook.xml.rels',
      noiDung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + ds.map((s) => '<Relationship Id="rId' + s.id
          + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"'
          + ' Target="worksheets/sheet' + s.id + '.xml"/>').join('')
        + '<Relationship Id="rId' + (ds.length + 1)
        + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"'
        + ' Target="styles.xml"/>'
        + '</Relationships>',
    },
    {
      /* Đúng hai kiểu: thường và đậm. Bảng báo cáo chỉ cần phân biệt dòng tiêu
       * đề với dòng số — thêm nữa là thêm chỗ sai mà không ai nhìn ra. */
      ten: 'xl/styles.xml',
      noiDung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
        + '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        + '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
        + '<borders count="1"><border/></borders>'
        + '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
        + '<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs>'
        + '</styleSheet>',
    },
  ];

  ds.forEach((s) => {
    tep.push({ ten: 'xl/worksheets/sheet' + s.id + '.xml', noiDung: sheetXml(s.hang, s.rong) });
  });

  return dongZip(tep);
}

module.exports = { taoXlsx, oTen, tenSheet, crc32, dongZip, xEsc };
