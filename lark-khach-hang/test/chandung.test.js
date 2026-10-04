'use strict';
/**
 * ============================================================================
 * CHÂN DUNG — chỗ một phép chia nhóm sai làm cả bản chân dung nói dối
 * ============================================================================
 * Anh Hùng 04/10/2026 gửi khung Buyer Persona và chốt "tách thành 2 nhánh".
 *
 * Vì sao phải tách: đo thật thì hơn một nửa khách là B2B (đại lý 9.027 so với
 * cá nhân 7.082). Người quyết định mua bên B2B là đại lý bán lại chứ không
 * phải người đi tour — gộp chung rồi lấy trung bình là lấy trung bình của hai
 * thứ không cùng loại.
 *
 * Ba chỗ dễ sai, cả ba đều đã gặp khi dựng:
 *   1. Gộp "chưa mua gì" với "có mua nhưng không đếm được số người". Nhóm đó
 *      phình lên 6.999 người và nuốt hết mọi nhóm thật.
 *   2. Khớp chữ tiếng Việt có dấu trong biểu thức. "Người lớn" ở dạng NFC có
 *      chữ "ờ" mang sẵn hai dấu, không nằm trong lớp [oơ] như tưởng — biểu
 *      thức lặng lẽ không khớp và số khách ra 0.
 *   3. Xét quy mô trước khi xét trẻ em. Nhà bốn người có con nhỏ sẽ bị xếp
 *      thành "nhóm bạn", mất đúng nhóm mà nội dung quảng cáo cần nhắm.
 */
const c = require('../chandung');
const tw = require('../nguon/tourwell');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

const NGAY = 86400000;
const BAY_GIO = Date.parse('2026-10-04T00:00:00Z');
const luc = (n) => new Date(BAY_GIO + n * NGAY).toISOString();
const don = (o) => Object.assign({ ma: 'D', tien: 1000000, luc: luc(-10), dichVu: [], khach: null }, o);
const ngCount = (lon, tre) => ({ nguoiLon: lon, treEm: tre, tong: lon + tre, coTre: tre > 0 });
const kh = (khoa, nhom, dons) => ({ khoa, ten: khoa, sdt: khoa, nhom, don: dons });

console.log('\nchân dung khách hàng');

/* ---- 1. đếm người từ dòng giá ---- */
{
  const d = (rows) => tw.doiDon({ code: 'D', customer: { code: 'K' },
    services: [{ prices: rows.map(([t, q]) => ({ object: { title: t }, quantity: q })) }] }).khach;
  ok('đếm được "Người lớn" (chữ có dấu)', d([['Người lớn', 5]]).tong === 5, JSON.stringify(d([['Người lớn', 5]])));
  ok('đếm được "Trẻ em (1m < 1m4)"', d([['Người lớn', 2], ['Trẻ em (1m < 1m4)', 1]]).coTre === true);
  ok('đếm được "Em bé"', d([['Người lớn', 2], ['Em bé', 1]]).treEm === 1);
  ok('BỎ dòng dịch vụ và dòng kế toán, không cộng thành khách',
    d([['Người lớn', 3], ['DỊCH VỤ THUÊ XE 7 CHỖ', 1], ['lợi nhuận', 1], ['DELUXE DOUBLE', 2]]).tong === 3);
  ok('đơn không có dòng người thì trả 0, không đoán bừa', d([['VÉ DINNER SHOW', 4]]).tong === 0);
}

/* ---- 2. chia nhánh ---- */
{
  ok('"Cá nhân" là B2C', c.laB2B({ nhom: 'Cá nhân' }) === false);
  for (const n of ['Đại lý, đối tác', 'Cộng tác viên', 'Doanh nghiệp', 'Cơ quan, tổ chức']) {
    ok('"' + n + '" là B2B', c.laB2B({ nhom: n }) === true);
  }
  /* Không khai nhóm thì về B2C — chọn mặc định an toàn hơn là coi như đại lý. */
  ok('không khai nhóm thì xếp B2C', c.laB2B({ nhom: '' }) === false);
}

/* ---- 3. chia nhóm B2C ---- */
{
  const g = (dons) => c.nhomB2C(dons);
  ok('chưa đơn nào → "Chưa phát sinh"', g([]) === 'Chưa phát sinh');
  ok('có đơn nhưng không đếm được người → nhóm RIÊNG, không lẫn với chưa phát sinh',
    g([don({ khach: ngCount(0, 0) })]) === 'Có mua, chưa rõ số khách');
  ok('1 khách → "Đi một mình"', g([don({ khach: ngCount(1, 0) })]) === 'Đi một mình');
  ok('2 khách → "Cặp đôi"', g([don({ khach: ngCount(2, 0) })]) === 'Cặp đôi');
  ok('4 khách không trẻ → "Nhóm bạn"', g([don({ khach: ngCount(4, 0) })]) === 'Nhóm bạn');
  ok('15 khách → "Đoàn lớn"', g([don({ khach: ngCount(15, 0) })]) === 'Đoàn lớn');
  /* Bẫy số 3: có trẻ em phải thắng quy mô. */
  ok('nhà 4 người CÓ TRẺ là "Gia đình", không phải "Nhóm bạn"',
    g([don({ khach: ngCount(2, 2) })]) === 'Gia đình có trẻ nhỏ');
  ok('đoàn 15 người có trẻ cũng là "Gia đình"',
    g([don({ khach: ngCount(13, 2) })]) === 'Gia đình có trẻ nhỏ');
}

/* ---- 4. chia nhóm B2B ---- */
{
  const g = (dons, tien) => c.nhomB2B(dons, tien, BAY_GIO);
  ok('chưa đơn nào → "Chưa phát sinh"', g([], 0) === 'Chưa phát sinh');
  ok('10 đơn → "Đại lý ruột"', g(Array.from({ length: 10 }, () => don({})), 10e6) === 'Đại lý ruột');
  ok('doanh thu lớn cũng là "Đại lý ruột" dù ít đơn', g([don({})], 400e6) === 'Đại lý ruột');
  ok('3 đơn → "Đại lý thường"', g([don({}), don({}), don({})], 10e6) === 'Đại lý thường');
  ok('1 đơn → "Đại lý mới / thử việc"', g([don({})], 1e6) === 'Đại lý mới / thử việc');
  /* Ngủ phải thắng mọi hạng: đại lý to mà nửa năm không đặt thì việc cần làm
   * là đánh thức, không phải xếp họ vào nhóm đang chăm tốt. */
  ok('đại lý lớn nhưng im hơn 6 tháng → "Đại lý đã ngủ"',
    g(Array.from({ length: 20 }, () => don({ luc: luc(-200) })), 900e6) === 'Đại lý đã ngủ');
}

/* ---- 5. số liệu từng nhóm ---- */
{
  const r = c.dungChanDung([
    kh('A', 'Cá nhân', [don({ tien: 2e6, khach: ngCount(2, 0) })]),
    kh('B', 'Cá nhân', [don({ tien: 4e6, khach: ngCount(2, 0) }), don({ tien: 4e6, khach: ngCount(2, 0) })]),
    kh('C', 'Đại lý, đối tác', [don({ tien: 50e6, khach: ngCount(20, 0) })]),
  ], BAY_GIO);

  ok('hai nhánh tách bạch', r.b2c.length >= 1 && r.b2b.length >= 1);
  ok('tổng B2C đúng', r.tong.b2c.khach === 2 && r.tong.b2c.tien === 10e6, JSON.stringify(r.tong.b2c));
  ok('tổng B2B đúng', r.tong.b2b.khach === 1 && r.tong.b2b.tien === 50e6, JSON.stringify(r.tong.b2b));

  const doi = r.b2c.find((g) => g.ten === 'Cặp đôi');
  ok('gom đúng nhóm Cặp đôi', !!doi && doi.soKhach === 2, JSON.stringify(doi && doi.soKhach));
  ok('  tính đúng trung bình mỗi đơn', doi.tbMoiDon === Math.round(10e6 / 3), doi.tbMoiDon);
  ok('  tính đúng số khách mỗi đơn', doi.khachMoiDon === 2, doi.khachMoiDon);
  ok('  tính đúng tiền mỗi khách', doi.tbMoiNguoi === Math.round(10e6 / 6), doi.tbMoiNguoi);
  ok('  tỉ lệ quay lại tính theo NGƯỜI, không theo đơn', doi.tyLeQuayLai === 0.5, doi.tyLeQuayLai);

  /* Phần trăm phải tính TRONG NHÁNH. So một nhóm đại lý với tổng gồm cả khách
   * lẻ là so hai thứ khác loại, và con số sẽ bé đi một cách vô nghĩa. */
  ok('phần trăm doanh thu tính trong nhánh, không trên tổng công ty',
    Math.abs(doi.phanTramTien - 1) < 1e-9, doi.phanTramTien);
  const b2b0 = r.b2b.find((g) => g.ten === 'Đại lý mới / thử việc');
  ok('  nhánh B2B cũng vậy', Math.abs(b2b0.phanTramTien - 1) < 1e-9, b2b0.phanTramTien);
}

/* ---- 6. đơn huỷ không được tính vào chân dung ---- */
{
  const r = c.dungChanDung([
    kh('A', 'Cá nhân', [don({ tien: 9e6, maTT: 2, khach: ngCount(2, 0) })]),
  ], BAY_GIO);
  ok('khách chỉ có đơn huỷ → "Chưa phát sinh", doanh thu 0',
    r.b2c.length === 1 && r.b2c[0].ten === 'Chưa phát sinh' && r.b2c[0].doanhThu === 0,
    JSON.stringify(r.b2c.map((g) => [g.ten, g.doanhThu])));
}

/* ---- 7. rỗng thì không vỡ ---- */
{
  const r = c.dungChanDung([], BAY_GIO);
  ok('danh sách rỗng không làm vỡ', r.b2c.length === 0 && r.b2b.length === 0 && r.tong.b2c.tien === 0);
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
process.exit(fail ? 1 : 0);
