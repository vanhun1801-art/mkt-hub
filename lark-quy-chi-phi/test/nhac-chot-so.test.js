'use strict';
/**
 * ============================================================================
 * NHẮC CHỐT SỔ — không cần mạng, không cần app chạy
 * ============================================================================
 *
 *   node test/nhac-chot-so.test.js
 *
 * Bộ nhắc này chỉ chạy ĐÚNG HAI NGÀY một tháng. Sai một luật ngày thì phải chờ
 * tới cuối tháng sau mới biết, và cái biết được là "tháng vừa rồi không ai
 * nhắc" — tức là đã muộn. Nên luật ngày chốt ở đây, chạy được mọi lúc.
 *
 * Và chốt một luật nữa: TIN GỬI NHÓM KHÔNG ĐƯỢC CÓ SỐ TIỀN. Nhóm Phòng MKT có
 * cả phòng; tồn quỹ với tổng chi là chuyện giữa người giữ quỹ và kế toán.
 */
const n = require('../nhac-chot-so');

let pass = 0, fail = 0;
const fails = [];
function ok(ten, dieu, chiTiet) {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (chiTiet ? ' → ' + chiTiet : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (chiTiet ? '\n         ' + chiTiet : ''));
  }
}
const nhom = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');
const luc = (ngay, gio) => Date.parse(ngay + 'T' + (gio || '09:00') + ':00+07:00');

nhom('Hai mốc bám NGÀY CUỐI THẬT của tháng');
/* Ghim cứng ngày 30 thì tháng 2 nhắc trượt hai ngày, tháng 31 ngày nhắc sớm
 * một ngày. Mà nhắc trượt thì không ai thấy gì để báo lại. */
const moc = (d) => n.mocCua(luc(d));
ok('tháng 30 ngày: 29 là áp chót, 30 là ngày cuối',
  moc('2026-09-29') === 'apChot' && moc('2026-09-30') === 'cuoi');
ok('tháng 31 ngày: 30 và 31',
  moc('2026-10-30') === 'apChot' && moc('2026-10-31') === 'cuoi');
ok('tháng 2 (28 ngày): 27 và 28',
  moc('2026-02-27') === 'apChot' && moc('2026-02-28') === 'cuoi');
ok('năm nhuận (29 ngày): 28 và 29',
  moc('2028-02-28') === 'apChot' && moc('2028-02-29') === 'cuoi',
  moc('2028-02-28') + ' / ' + moc('2028-02-29'));
ok('ngày thường thì im', !moc('2026-09-28') && !moc('2026-10-01') && !moc('2026-09-15'));
ok('đọc đúng số ngày của tháng',
  n.ngayCuoiThang(luc('2026-02-10')) === 28 && n.ngayCuoiThang(luc('2028-02-10')) === 29
  && n.ngayCuoiThang(luc('2026-09-10')) === 30 && n.ngayCuoiThang(luc('2026-10-10')) === 31);

/* Giờ Việt Nam, không phải UTC. Render chạy UTC: 30/09 lúc 23:00 giờ VN là
 * 16:00 UTC cùng ngày, nhưng 01/10 lúc 06:00 giờ VN vẫn là 30/09 bên UTC —
 * đọc theo UTC là nhắc nhầm sang ngày đã qua. */
nhom('Đọc theo giờ Việt Nam, không phải UTC');
ok('nửa đêm giờ VN đã sang ngày mới',
  n.mocCua(luc('2026-10-01', '00:30')) === '', n.mocCua(luc('2026-10-01', '00:30')));
ok('cuối ngày 30/09 giờ VN vẫn là mốc cuối',
  n.mocCua(luc('2026-09-30', '23:30')) === 'cuoi');

nhom('Tin gửi NHÓM: một chữ số tiền cũng không');
const chuoi = (the) => JSON.stringify(the);
for (const m of ['apChot', 'cuoi']) {
  const the = n.theNhom(m, 'https://hub.example', luc('2026-09-29'));
  const s = chuoi(the);
  ok('[' + m + '] không có cụm số kiểu tiền', !/\d[\d.,]{4,}/.test(s),
    (s.match(/\d[\d.,]{4,}/) || [''])[0]);
  ok('[' + m + '] không nhắc tồn quỹ / tổng chi',
    !/tồn quỹ|tổng chi|số dư/i.test(s));
  ok('[' + m + '] nói đúng việc của cả phòng: nộp hoá đơn',
    /hoá đơn/i.test(s) && /chứng từ/i.test(s));
  ok('[' + m + '] có nút mở app', /"tag":"action"/.test(s) && /quy-chi-phi/.test(s));
}
ok('áp chót nói "mai", ngày cuối nói "hôm nay"',
  /Mai/.test(chuoi(n.theNhom('apChot', '', luc('2026-09-29'))))
  && /Hôm nay/.test(chuoi(n.theNhom('cuoi', '', luc('2026-09-30')))));

nhom('Tin RIÊNG người giữ quỹ: có số để quyết');
const so = { ky: 'THÁNG 09', ton: 13376196, soKhoan: 20, chuaQuyetToan: 12, thieuChungTu: 3 };
const r = chuoi(n.theRieng(so, 'apChot', '', luc('2026-09-29')));
ok('có tồn quỹ', /13\.376\.196/.test(r));
ok('có số khoản chưa quyết toán', /12/.test(r) && /chưa có mã quyết toán/.test(r));
ok('có số khoản thiếu chứng từ', /3 khoản chưa có chứng từ/.test(r));
ok('chỉ đường tới đúng nút phải bấm', /Chốt kỳ & mở kỳ mới/.test(r));
/* Sổ sạch thì đừng bịa ra việc — nói thẳng là chốt được ngay. */
const sach = chuoi(n.theRieng({ ...so, chuaQuyetToan: 0, thieuChungTu: 0 }, 'cuoi', '', luc('2026-09-30')));
ok('sổ sạch thì nói chốt được ngay, không liệt kê việc rỗng',
  /chốt kỳ được ngay/i.test(sach) && !/chưa có mã quyết toán/.test(sach));

nhom('Số của kỳ lấy từ kỳ ĐANG DÙNG');
const dot = [
  { id: 'd1', ma: 'THÁNG 08', tinhTrang: 'Đã chốt', conLai: 970000, tongNap: 1, tongChi: 1 },
  { id: 'd2', ma: 'THÁNG 09', tinhTrang: 'Đang dùng', conLai: 13376196, tongNap: 22970000, tongChi: 9593804 },
];
const chi = [
  { dot: ['d2'], maQuyetToan: '', tinhTrang: 'Đã chi', hoaDon: [{ token: 'x' }] },
  { dot: ['d2'], maQuyetToan: '', tinhTrang: 'Đã chi', hoaDon: [], linkCu: '' },
  { dot: ['d2'], maQuyetToan: 'QTTU61/LVH', tinhTrang: 'Đã quyết toán', hoaDon: [] },
  { dot: ['d1'], maQuyetToan: '', tinhTrang: 'Đã chi', hoaDon: [] },
];
const s2 = n.soCuaKy(chi, dot);
ok('chỉ đếm khoản của kỳ đang dùng', s2.soKhoan === 3, JSON.stringify(s2));
ok('tồn lấy từ ô công thức của Base', s2.ton === 13376196);
ok('đếm đúng số chưa quyết toán', s2.chuaQuyetToan === 2, String(s2.chuaQuyetToan));
/* Khoản đã có mã quyết toán thì kế toán nhận rồi — đừng réo đòi chứng từ nữa. */
ok('không réo chứng từ của khoản đã quyết toán', s2.thieuChungTu === 1, String(s2.thieuChungTu));
ok('không có kỳ nào đang dùng thì trả null',
  n.soCuaKy(chi, [dot[0]]) === null);

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
if (fail) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
