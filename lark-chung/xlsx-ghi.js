'use strict';
/**
 * ============================================================================
 * GHI FILE .XLSX — không thêm một thư viện nào
 * ============================================================================
 *
 *   const { ghiXlsx } = require('../lark-chung/xlsx-ghi');
 *   const buf = ghiXlsx({
 *     ten: 'Tác nghiệp',
 *     cot: [{ ten: 'Ngày', rong: 12 }, { ten: 'Nội dung', rong: 40 }],
 *     hang: [['01/09/2026', 'Livestream ĐTH'], …],
 *     tieuDe: 'ROOTY TRIP · BÁO CÁO TÁC NGHIỆP',   // tuỳ chọn
 *     phuDe: 'Vinwonders · 01/09 – 30/09/2026',    // tuỳ chọn
 *   });
 *
 * VÌ SAO KHÔNG XUẤT CSV RỒI ĐỔI ĐUÔI. File này đem trình đối tác. CSV mở bằng
 * Excel thì tiếng Việt vỡ dấu nếu thiếu BOM, cột số bị đoán sai kiểu, và không
 * có tiêu đề in đậm hay độ rộng cột — trông như dữ liệu thô chứ không như một
 * bản báo cáo. Một tệp .xlsx thật chỉ tốn chừng này mã, và không phải dặn người
 * nhận "nhớ mở bằng Import".
 *
 * .xlsx là một file ZIP chứa XML. Bộ đọc đã có sẵn ở lark-ads-manager/sync/
 * xlsx.js; tệp này là chiều ngược lại, và hai bên kiểm chéo nhau trong phép thử
 * — ghi ra rồi đọc lại phải khớp từng ô.
 *
 * Chỉ dựng đúng sáu phần bắt buộc để Excel, Google Sheets và LibreOffice cùng
 * mở được. Không sharedStrings (dùng inlineStr cho gọn), không theme, không
 * calcChain.
 */
const zlib = require('zlib');

/* ---------------------------------------------------------------------------
 * ZIP
 * -------------------------------------------------------------------------
 * Ghi Local header cho từng mục, rồi Central directory, rồi EOCD. Nén bằng
 * deflateRaw (method 8) — zlib có sẵn trong Node.
 * ------------------------------------------------------------------------- */
const BANG_CRC = (() => {
  const b = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    b[n] = c;
  }
  return b;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = BANG_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Giờ kiểu MS-DOS. Excel không đọc tới, nhưng ZIP nào cũng phải có hai ô này. */
function gioDos(d) {
  const gio = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const ngay = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  return { gio, ngay };
}

function taoZip(muc) {
  const luc = gioDos(new Date());
  const cuc = [];
  const trungTam = [];
  let viTri = 0;

  for (const { ten, noiDung } of muc) {
    const tenBuf = Buffer.from(ten, 'utf8');
    const goc = Buffer.isBuffer(noiDung) ? noiDung : Buffer.from(noiDung, 'utf8');
    const nen = zlib.deflateRawSync(goc);
    const crc = crc32(goc);

    const dau = Buffer.alloc(30);
    dau.writeUInt32LE(0x04034b50, 0);
    dau.writeUInt16LE(20, 4);            // cần bản 2.0 để giải nén
    dau.writeUInt16LE(0, 6);             // cờ chung
    dau.writeUInt16LE(8, 8);             // phương pháp: deflate
    dau.writeUInt16LE(luc.gio, 10);
    dau.writeUInt16LE(luc.ngay, 12);
    dau.writeUInt32LE(crc, 14);
    dau.writeUInt32LE(nen.length, 18);
    dau.writeUInt32LE(goc.length, 22);
    dau.writeUInt16LE(tenBuf.length, 26);
    dau.writeUInt16LE(0, 28);            // không có phần phụ
    cuc.push(dau, tenBuf, nen);

    const tt = Buffer.alloc(46);
    tt.writeUInt32LE(0x02014b50, 0);
    tt.writeUInt16LE(20, 4);
    tt.writeUInt16LE(20, 6);
    tt.writeUInt16LE(0, 8);
    tt.writeUInt16LE(8, 10);
    tt.writeUInt16LE(luc.gio, 12);
    tt.writeUInt16LE(luc.ngay, 14);
    tt.writeUInt32LE(crc, 16);
    tt.writeUInt32LE(nen.length, 20);
    tt.writeUInt32LE(goc.length, 24);
    tt.writeUInt16LE(tenBuf.length, 28);
    tt.writeUInt32LE(0, 38);             // thuộc tính ngoài
    tt.writeUInt32LE(viTri, 42);
    trungTam.push(tt, tenBuf);

    viTri += dau.length + tenBuf.length + nen.length;
  }

  const thanTrungTam = Buffer.concat(trungTam);
  const cuoi = Buffer.alloc(22);
  cuoi.writeUInt32LE(0x06054b50, 0);
  cuoi.writeUInt16LE(muc.length, 8);
  cuoi.writeUInt16LE(muc.length, 10);
  cuoi.writeUInt32LE(thanTrungTam.length, 12);
  cuoi.writeUInt32LE(viTri, 16);
  return Buffer.concat([...cuc, thanTrungTam, cuoi]);
}

/* ---------------------------------------------------------------------------
 * XML
 * ------------------------------------------------------------------------- */
/**
 * Dải ký tự điều khiển không hợp lệ trong XML của Excel.
 *
 * Dựng bằng RegExp(chuỗi) chứ KHÔNG viết thẳng một literal /[…]/ : mấy dấu
 * thoát dạng u-bốn-số từng bị nuốt trên đường ghi tệp và biến thành ký tự
 * điều khiển THẬT nằm ngay trong mã nguồn. Lúc ấy regex vẫn đúng nghĩa nên
 * chẳng ai thấy — nhưng một lần dán qua lại là mất, và mất thì Excel báo
 * "file hỏng" chứ app không báo gì.
 */
const RA_KHOI_XML = new RegExp('[\u0000-\u0008\u000b\u000c\u000e-\u001f]', 'g');

const thoat = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  /* Ký tự điều khiển làm Excel báo "file hỏng" và không nói vì sao. Dữ liệu
   * gõ tay từ Base có lẫn chúng (dán từ Word, xuống dòng kiểu cũ). Tab,
   * xuống dòng và về đầu dòng thì GIỮ — ba cái đó hợp lệ trong ô Excel. */
  .replace(RA_KHOI_XML, '');

/** Số cột → chữ cột: 1→A, 27→AA. */
function chuCot(n) {
  let s = '';
  while (n > 0) {
    const d = (n - 1) % 26;
    s = String.fromCharCode(65 + d) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Một ô. Số thì ghi kiểu số để Excel cộng được; còn lại ghi chuỗi thẳng vào ô
 * (inlineStr) — khỏi phải dựng bảng sharedStrings chỉ để tiết kiệm vài byte.
 */
function veO(hang, cot, gt, kieu) {
  const dc = chuCot(cot) + hang;
  const s = kieu ? ' s="' + kieu + '"' : '';
  if (gt == null || gt === '') return '<c r="' + dc + '"' + s + '/>';
  if (typeof gt === 'number' && Number.isFinite(gt)) {
    return '<c r="' + dc + '"' + s + '><v>' + gt + '</v></c>';
  }
  return '<c r="' + dc + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">'
    + thoat(gt) + '</t></is></c>';
}

/* Bốn kiểu, đúng thứ tự khai trong styles.xml dưới đây:
 *   0 thường · 1 tiêu đề lớn · 2 phụ đề · 3 đầu cột */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2B5CFF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFD9DEE8"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>
</cellXfs>
</styleSheet>`;

/* ---------------------------------------------------------------------------
 * ẢNH NỔI (logo)
 * -------------------------------------------------------------------------
 * Excel không đặt ảnh VÀO ô. Ảnh là một đối tượng NỔI bên trên lưới, neo vào
 * một ô, và mô tả ở một phần riêng (xl/drawings/). Nên đóng logo lên tệp không
 * phải là ghi thêm một ô — là thêm bốn phần vào gói ZIP rồi khai chúng ở ba
 * chỗ khác nhau. Thiếu một khai báo là Excel báo "file hỏng" mà không nói vì
 * sao, nên bốn phần đó dựng chung một chỗ ở đây thay vì rải trong ghiXlsx.
 *
 * EMU là đơn vị đo của OOXML: 914400 EMU = 1 inch = 96 px, nên 1 px = 9525.
 * ------------------------------------------------------------------------- */
const EMU = 9525;

const DUOI_ANH = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif' };

/** Bốn phần của một ảnh nổi neo ở ô A1. */
function phanAnh(logo) {
  const duoi = DUOI_ANH[String(logo.mime || '').toLowerCase()] || 'png';
  const cx = Math.round((logo.rong || 150) * EMU);
  const cy = Math.round((logo.cao || 52) * EMU);
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  /* oneCellAnchor: neo góc trên-trái vào A1 rồi giữ NGUYÊN khổ ảnh. Dùng
   * twoCellAnchor thì ảnh co giãn theo độ rộng cột — mà độ rộng cột ở đây do
   * nội dung quyết định, nên logo sẽ méo mỗi bảng một kiểu. */
  const drawing = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + '<xdr:oneCellAnchor>'
    + '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>' + (4 * EMU) + '</xdr:colOff>'
    + '<xdr:row>0</xdr:row><xdr:rowOff>' + (3 * EMU) + '</xdr:rowOff></xdr:from>'
    + '<xdr:ext cx="' + cx + '" cy="' + cy + '"/>'
    + '<xdr:pic>'
    + '<xdr:nvPicPr><xdr:cNvPr id="1" name="Logo"/>'
    + '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'
    + '<xdr:blipFill><a:blip xmlns:r="' + R + '" r:embed="rId1"/>'
    + '<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
    + '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>'
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>'
    + '</xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>';

  return {
    duoi,
    muc: [
      { ten: 'xl/media/image1.' + duoi, noiDung: logo.buf },
      { ten: 'xl/drawings/drawing1.xml', noiDung: drawing },
      {
        ten: 'xl/drawings/_rels/drawing1.xml.rels',
        noiDung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + '<Relationship Id="rId1" Type="' + R + '/image" Target="../media/image1.' + duoi + '"/>'
          + '</Relationships>',
      },
      {
        ten: 'xl/worksheets/_rels/sheet1.xml.rels',
        noiDung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + '<Relationship Id="rId1" Type="' + R + '/drawing" Target="../drawings/drawing1.xml"/>'
          + '</Relationships>',
      },
    ],
  };
}

/**
 * @param {object} o
 * @param {string} o.ten     tên sheet
 * @param {Array}  o.cot     [{ ten, rong }]
 * @param {Array}  o.hang    mảng các mảng ô
 * @param {string} [o.tieuDe]
 * @param {string} [o.phuDe]
 * @param {object} [o.logo]  { buf, mime, rong, cao } — ảnh nổi ở góc trên-trái
 * @returns {Buffer} nội dung file .xlsx
 */
function ghiXlsx({ ten = 'Sheet1', cot = [], hang = [], tieuDe = '', phuDe = '', logo = null,
  khongDauCot = false }) {
  const anh = (logo && logo.buf && logo.buf.length) ? phanAnh(logo) : null;
  const soCot = Math.max(cot.length, ...hang.map((h) => h.length), 1);
  const dong = [];
  let r = 0;

  /* Tiêu đề và phụ đề nằm TRONG sheet, không nằm ở tên file: người nhận mở ra
   * là biết ngay đây là bảng gì của kỳ nào, kể cả khi tệp đã bị đổi tên hay
   * chuyển tiếp qua mấy lần. */
  /* Ảnh NỔI nên không tự đẩy nội dung xuống: phải chừa sẵn một hàng cao đúng
   * bằng nó, nếu không logo nằm đè lên dòng tiêu đề. Chiều cao hàng đo bằng
   * point (1px = 0,75pt), cộng thêm chút cho thoáng. */
  if (anh) {
    r++;
    dong.push('<row r="' + r + '" ht="' + (Math.round((logo.cao || 52) * 0.75) + 6)
      + '" customHeight="1"/>');
  }
  if (tieuDe) { r++; dong.push('<row r="' + r + '" ht="22" customHeight="1">' + veO(r, 1, tieuDe, 1) + '</row>'); }
  if (phuDe) { r++; dong.push('<row r="' + r + '">' + veO(r, 1, phuDe, 2) + '</row>'); }
  if (tieuDe || phuDe) { r++; dong.push('<row r="' + r + '"/>'); }

  /* `khongDauCot`: giữ ĐỘ RỘNG cột nhưng không vẽ hàng tên cột, đóng băng hay
   * bộ lọc. Dùng cho tờ có khối tóm tắt nằm TRÊN bảng chi tiết — ở đó một hàng
   * tên cột chễm chệ trên đầu tờ giấy là tên của bảng nằm tận giữa trang, đọc
   * lên tưởng tờ này bắt đầu bằng bảng. */
  const hangDauCot = r + 1;
  if (cot.length && !khongDauCot) {
    r++;
    dong.push('<row r="' + r + '" ht="20" customHeight="1">'
      + cot.map((c, i) => veO(r, i + 1, c.ten, 3)).join('') + '</row>');
  }
  for (const h of hang) {
    r++;
    dong.push('<row r="' + r + '">' + h.map((v, i) => veO(r, i + 1, v, 0)).join('') + '</row>');
  }

  const cols = cot.length
    ? '<cols>' + cot.map((c, i) =>
      '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.rong || 16) + '" customWidth="1"/>').join('') + '</cols>'
    : '';
  /* Đóng băng hàng tiêu đề: bảng vài trăm dòng mà cuộn xuống là quên mất cột nào
   * là cột nào. */
  const dongBang = (cot.length && !khongDauCot)
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + hangDauCot
      + '" topLeftCell="A' + (hangDauCot + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '';
  const loc = (cot.length && !khongDauCot)
    ? '<autoFilter ref="A' + hangDauCot + ':' + chuCot(soCot) + Math.max(r, hangDauCot) + '"/>'
    : '';

  /* <drawing> phải đứng SAU <autoFilter>: lược đồ của Excel quy định thứ tự các
   * thẻ con, sai thứ tự là tệp hỏng dù từng thẻ đều đúng. */
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + dongBang + cols + '<sheetData>' + dong.join('') + '</sheetData>' + loc
    + (anh ? '<drawing r:id="rId1"/>' : '') + '</worksheet>';

  return taoZip([
    {
      ten: '[Content_Types].xml',
      noiDung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + (anh ? '<Default Extension="' + anh.duoi + '" ContentType="image/'
          + (anh.duoi === 'jpg' ? 'jpeg' : anh.duoi) + '"/>'
          + '<Override PartName="/xl/drawings/drawing1.xml"'
          + ' ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : '')
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
        + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets><sheet name="' + thoat(ten).slice(0, 31) + '" sheetId="1" r:id="rId1"/></sheets>'
        + '</workbook>',
    },
    {
      ten: 'xl/_rels/workbook.xml.rels',
      noiDung: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + '</Relationships>',
    },
    { ten: 'xl/styles.xml', noiDung: STYLES },
    { ten: 'xl/worksheets/sheet1.xml', noiDung: sheet },
    ...(anh ? anh.muc : []),
  ]);
}

/**
 * CSV kèm BOM. Đây là đường vào Google Sheets: Tệp → Nhập → tải lên, hoặc kéo
 * thẳng vào Drive. Không có BOM thì Excel mở ra vỡ hết dấu tiếng Việt.
 */
function ghiCsv(cot, hang) {
  const o = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const ds = [cot.map((c) => o(c.ten)).join(','), ...hang.map((h) => h.map(o).join(','))];
  return Buffer.from('﻿' + ds.join('\r\n'), 'utf8');
}

module.exports = { ghiXlsx, ghiCsv, chuCot, taoZip };
