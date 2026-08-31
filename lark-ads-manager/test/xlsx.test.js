/**
 * Test bộ đọc .xlsx.
 *
 * Tự dựng file xlsx trong bộ nhớ thay vì dựa vào file có sẵn trên đĩa — bài học từ
 * ba bộ test trước đó đọc ADS_CONNECT_JSON.txt rồi nổ khi file bị xoá.
 */
const zlib = require('zlib');
const x = require('../sync/xlsx');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  ok  ' + name); }
  else { fail += 1; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

/* ---------------- dựng file xlsx tối thiểu ---------------- */

/** Một mục trong ZIP: trả về {local, central} để nối lại thành file. */
function mucZip(ten, noiDung, offset, nen = true) {
  const data = Buffer.from(noiDung, 'utf8');
  const body = nen ? zlib.deflateRawSync(data) : data;
  const crc = (() => {
    let c = ~0;
    for (const b of data) {
      c ^= b;
      for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return (~c) >>> 0;
  })();
  const nameBuf = Buffer.from(ten, 'utf8');

  const local = Buffer.alloc(30 + nameBuf.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(nen ? 8 : 0, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  nameBuf.copy(local, 30);

  const central = Buffer.alloc(46 + nameBuf.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(nen ? 8 : 0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);
  nameBuf.copy(central, 46);

  return { local, body, central, tong: local.length + body.length };
}

function dungXlsx(sheetXml, chuoi = [], tenSheet = 'Sheet1') {
  const ss = '<?xml version="1.0"?><sst count="' + chuoi.length + '">'
    + chuoi.map((s) => '<si><t>' + s.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</t></si>').join('')
    + '</sst>';
  const wb = '<?xml version="1.0"?><workbook><sheets><sheet name="' + tenSheet + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const files = [
    ['xl/workbook.xml', wb],
    ['xl/sharedStrings.xml', ss],
    ['xl/worksheets/sheet1.xml', sheetXml],
  ];
  const muc = [];
  let off = 0;
  const phan = [];
  files.forEach(([ten, nd]) => {
    const m = mucZip(ten, nd, off);
    phan.push(m.local, m.body);
    muc.push(m.central);
    off += m.tong;
  });
  const cdDau = off;
  const cd = Buffer.concat(muc);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cdDau, 16);
  return Buffer.concat([...phan, cd, eocd]);
}

const o = (r, c, v, t) => '<c r="' + c + r + '"' + (t ? ' t="' + t + '"' : '') + '><v>' + v + '</v></c>';

/* ---------------- test ---------------- */

console.log('— đọc ZIP + XML cơ bản');
let buf = dungXlsx(
  '<worksheet><sheetData>'
  + '<row r="1">' + o(1, 'A', 0, 's') + o(1, 'B', 1, 's') + '</row>'
  + '<row r="2">' + o(2, 'A', 2, 's') + o(2, 'B', '1234.5') + '</row>'
  + '</sheetData></worksheet>',
  ['Tên', 'Số tiền', 'Rooty Trip'],
);
let d = x.doc(buf);
t('đọc được 1 sheet', d.sheets.length === 1, String(d.sheets.length));
t('lấy đúng tên sheet', d.sheets[0].ten === 'Sheet1', d.sheets[0].ten);
t('2 dòng', d.sheets[0].rows.length === 2);
t('giải được chuỗi dùng chung', d.sheets[0].rows[0][0] === 'Tên', d.sheets[0].rows[0][0]);
t('giữ dấu tiếng Việt', d.sheets[0].rows[1][0] === 'Rooty Trip');
t('số để nguyên dạng chuỗi', d.sheets[0].rows[1][1] === '1234.5', d.sheets[0].rows[1][1]);

console.log('— ô trống ở giữa không làm lệch cột');
buf = dungXlsx('<worksheet><sheetData><row r="1">'
  + o(1, 'A', 0, 's') + o(1, 'C', 1, 's') + '</row></sheetData></worksheet>', ['A', 'C']);
d = x.doc(buf);
t('cột B trống chứ không bị dồn', d.sheets[0].rows[0].length === 3
  && d.sheets[0].rows[0][1] === '' && d.sheets[0].rows[0][2] === 'C',
  JSON.stringify(d.sheets[0].rows[0]));

console.log('— thẻ tự đóng KHÔNG được ngốn ô kế tiếp');
/* Lỗi đã xảy ra thật và làm mất cả cột Nguồn của bản xuất Tourwell — 1000/1000
 * dòng đọc ra rỗng trong khi dữ liệu vẫn ở đó, không lỗi nào được ném ra.
 * Nguyên nhân: `[^>]*` tham lam nuốt luôn dấu '/' của <c .../> rồi đi tìm </c>
 * ở ô SAU. Ô trống có style (`<c r="B1" s="12"/>`) là dạng rất phổ biến. */
buf = dungXlsx('<worksheet><sheetData><row r="1">'
  + o(1, 'A', 0, 's')
  + '<c r="B1" s="12"/>'
  + o(1, 'C', 1, 's')
  + o(1, 'D', 2, 's')
  + '</row></sheetData></worksheet>', ['A', 'C', 'D']);
d = x.doc(buf);
t('ô trống tự đóng không làm mất ô sau',
  d.sheets[0].rows[0][0] === 'A' && d.sheets[0].rows[0][1] === ''
  && d.sheets[0].rows[0][2] === 'C' && d.sheets[0].rows[0][3] === 'D',
  JSON.stringify(d.sheets[0].rows[0]));

buf = dungXlsx('<worksheet><sheetData>'
  + '<row r="1">' + o(1, 'A', 0, 's') + '</row>'
  + '<row r="2"/>'
  + '<row r="3">' + o(3, 'A', 1, 's') + '</row>'
  + '</sheetData></worksheet>', ['dòng 1', 'dòng 3']);
d = x.doc(buf);
t('dòng trống tự đóng không làm mất dòng sau',
  d.sheets[0].rows.length === 3 && d.sheets[0].rows[2][0] === 'dòng 3',
  JSON.stringify(d.sheets[0].rows));

buf = dungXlsx('<worksheet><sheetData><row r="1">'
  + '<c r="A1" s="1"/>' + '<c r="B1" s="2"/>' + o(1, 'C', 0, 's')
  + '</row></sheetData></worksheet>', ['giá trị duy nhất']);
t('nhiều ô tự đóng liền nhau', x.doc(buf).sheets[0].rows[0][2] === 'giá trị duy nhất',
  JSON.stringify(x.doc(buf).sheets[0].rows[0]));

console.log('— cột sau Z');
t('AA → 26', x.cotSo('AA1') === 26, String(x.cotSo('AA1')));
t('BC → 54', x.cotSo('BC9') === 54, String(x.cotSo('BC9')));
t('A → 0', x.cotSo('A1') === 0);

console.log('— giải mã thực thể XML');
t('&amp; → &', x.boThe('a&amp;b') === 'a&b');
t('&#40; → (', x.boThe('&#40;x&#41;') === '(x)');
t('&#x1EA1; → ạ', x.boThe('&#x1EA1;') === 'ạ');

console.log('— inlineStr');
buf = dungXlsx('<worksheet><sheetData><row r="1">'
  + '<c r="A1" t="inlineStr"><is><t>Chữ </t><t>rời</t></is></c>'
  + '</row></sheetData></worksheet>');
t('nối nhiều <t> trong một ô', x.doc(buf).sheets[0].rows[0][0] === 'Chữ rời',
  x.doc(buf).sheets[0].rows[0][0]);

console.log('— docBang tự tìm dòng tiêu đề');
/* Bản xuất Tourwell có dòng 1 là tiêu đề trang, dòng 2 mới là tên cột. Đoán sai
 * một dòng là mọi tên cột lệch và không cột nào khớp. */
buf = dungXlsx(
  '<worksheet><sheetData>'
  + '<row r="1">' + o(1, 'A', 0, 's') + '</row>'
  + '<row r="2">' + o(2, 'A', 1, 's') + o(2, 'B', 2, 's') + '</row>'
  + '<row r="3">' + o(3, 'A', 3, 's') + o(3, 'B', 4, 's') + '</row>'
  + '</sheetData></worksheet>',
  ['DANH SÁCH LEAD (CƠ HỘI)', 'Mã lead', 'Mã KH', 'LU1998', 'KL15938'],
);
let b = x.docBang(buf, { tenCot: ['Mã lead', 'Mã KH'] });
t('bỏ được dòng tiêu đề trang', b.dongTieuDe === 2, String(b.dongTieuDe));
t('1 dòng dữ liệu', b.rows.length === 1, String(b.rows.length));
t('đọc đúng ô', b.rows[0]['Mã lead'] === 'LU1998' && b.rows[0]['Mã KH'] === 'KL15938',
  JSON.stringify(b.rows[0]));

console.log('— báo lỗi rõ khi file sai');
let loi = '';
try { x.doc(Buffer.from('day khong phai zip')); } catch (e) { loi = e.message; }
t('không phải xlsx → báo rõ', /không phải file/i.test(loi), loi);
loi = '';
try { x.docBang(buf, { tenCot: ['Cột không tồn tại', 'Cột khác'] }); } catch (e) { loi = e.message; }
t('thiếu cột cần → báo rõ tên cột', /không có cột nào/i.test(loi), loi);

console.log('— file không nén (method 0) vẫn đọc được');
// một số bộ ghi lưu file nhỏ không nén
const raw = mucZip('xl/worksheets/sheet1.xml',
  '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Không nén</t></is></c></row></sheetData></worksheet>',
  0, false);
const cdR = Buffer.concat([raw.central]);
const eR = Buffer.alloc(22);
eR.writeUInt32LE(0x06054b50, 0);
eR.writeUInt16LE(1, 8); eR.writeUInt16LE(1, 10);
eR.writeUInt32LE(cdR.length, 12); eR.writeUInt32LE(raw.tong, 16);
t('method 0 (store)', x.doc(Buffer.concat([raw.local, raw.body, cdR, eR]))
  .sheets[0].rows[0][0] === 'Không nén');

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
