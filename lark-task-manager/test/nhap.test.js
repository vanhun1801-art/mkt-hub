'use strict';
/**
 * ============================================================================
 * NHÁP — việc đang soạn dở không được chảy ra toàn hệ
 * ============================================================================
 * Hàm thuần, không cần mạng, không cần Base, không cần bật server.
 *
 * Vì sao đáng test: bốn app khác (hub · KPI · Báo cáo · bot) đều đọc việc qua
 * /api/tasks của app này, mà /api/tasks lấy từ getRecords() — chốt lọc nháp nằm
 * đúng ở đó. Lọc sai thì nháp hiện trong danh sách nhân sự và bị đếm vào mọi báo
 * cáo, KHÔNG có lỗi nào nổ ra để biết.
 */
const { laNhap, locBoNhap, laChuNhap, chuOSelect } = require('../nhap');

let pass = 0, fail = 0;
const ok = (dk, ten, them) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; console.log('  ✗ ' + ten + (them ? '  → ' + them : '')); }
};

const ST = 'fldUEUt6TJ';      // cột Trạng thái
const RQ = 'fldNguoiOrder';   // cột Người order
const NHAP = 'Nháp';
const rec = (status, requester) => ({
  record_id: 'rec' + Math.random().toString(36).slice(2, 8),
  cells: { [ST]: status, [RQ]: requester },
});

console.log('\n[1] Đọc ô select — Base trả nhiều dạng tuỳ backend');
ok(chuOSelect('Nháp') === 'Nháp', 'chuỗi trần');
ok(chuOSelect(['Nháp']) === 'Nháp', 'mảng chuỗi (lark-cli)');
ok(chuOSelect([{ text: 'Nháp' }]) === 'Nháp', 'mảng object .text (Open API)');
ok(chuOSelect([{ name: 'Nháp' }]) === 'Nháp', 'mảng object .name');
ok(chuOSelect(null) === '' && chuOSelect([]) === '', 'ô trống ra chuỗi rỗng');

console.log('\n[2] Nhận ra bản ghi nháp');
ok(laNhap(rec(['Nháp']), ST, NHAP) === true, 'trạng thái Nháp → là nháp');
ok(laNhap(rec(['Chờ tiếp nhận']), ST, NHAP) === false, 'Chờ tiếp nhận → không phải nháp');
ok(laNhap(rec(null), ST, NHAP) === false, 'trạng thái trống → không phải nháp');
ok(laNhap({}, ST, NHAP) === false, 'bản ghi rỗng không làm nổ hàm');
/* Quan trọng: so khớp phải CHÍNH XÁC. Nhận nhầm "Nháp xong" là việc thật biến mất
 * khỏi mọi màn hình mà không ai hiểu vì sao. */
ok(laNhap(rec(['Nháp xong']), ST, NHAP) === false, 'không nhận nhầm trạng thái chỉ CHỨA chữ Nháp');
ok(laNhap(rec(['nháp']), ST, NHAP) === false, 'phân biệt hoa thường — chỉ đúng "Nháp" mới là nháp');

console.log('\n[3] Lọc bỏ nháp khỏi danh sách việc');
const ds = [rec(['Chờ tiếp nhận']), rec(['Nháp']), rec(['Hoàn thành']), rec(['Nháp']), rec(['Hủy'])];
const sau = locBoNhap(ds, ST, NHAP);
ok(sau.length === 3, 'bỏ đúng 2 nháp khỏi 5 bản ghi', 'còn ' + sau.length);
ok(!sau.some((r) => laNhap(r, ST, NHAP)), 'không còn nháp nào lọt lại');
ok(locBoNhap([], ST, NHAP).length === 0, 'danh sách rỗng không làm nổ hàm');
ok(locBoNhap(null, ST, NHAP).length === 0, 'null cũng không làm nổ hàm');
/* Việc thật phải còn NGUYÊN: lọc quá tay thì mất việc, cũng im lặng như lọt nháp. */
ok(locBoNhap(ds, ST, NHAP).filter((r) => chuOSelect(r.cells[ST]) === 'Hoàn thành').length === 1,
  'việc thật không bị lọc oan');

console.log('\n[4] Nháp là của riêng người order');
const toi = 'ou_toi', nguoiKhac = 'ou_nguoi_khac';
const cuaToi = rec(['Nháp'], [{ id: toi, name: 'Tôi' }]);
ok(laChuNhap(cuaToi, toi, RQ) === true, 'nháp của mình → đọc được');
ok(laChuNhap(cuaToi, nguoiKhac, RQ) === false, 'nháp người khác → KHÔNG đọc được');
ok(laChuNhap(cuaToi, '', RQ) === false, 'chưa đăng nhập thì không sở hữu nháp nào');
ok(laChuNhap(rec(['Nháp'], null), toi, RQ) === false, 'nháp không có người order → không ai nhận');

console.log('\n' + '-'.repeat(52));
console.log('  ' + pass + ' pass · ' + fail + ' fail');
console.log('-'.repeat(52) + '\n');
process.exit(fail ? 1 : 0);
