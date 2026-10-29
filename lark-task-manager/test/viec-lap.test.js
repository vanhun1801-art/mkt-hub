'use strict';
/**
 * VIỆC LẶP LẠI (29/10/2026) — viec-lap.js.
 *
 * Canh, không gọi Lark (kho mẫu và hàm tạo việc đều là bản giả trong bộ nhớ):
 *   1. đến kỳ đúng ngày theo giờ Việt Nam: hằng ngày (có/không trừ CN), hằng
 *      tuần theo thứ, hằng tháng theo ngày, ngày 31 rơi về cuối tháng ngắn;
 *   2. hạn mang đúng giờ trong mẫu, múi +07:00;
 *   3. trước 07:00 không tạo; mỗi ngày một việc dù nhịp chạy nhiều lần;
 *   4. tạo hỏng thì trả mốc để lượt sau thử lại; mẫu tạm dừng không tạo;
 *   5. chuanHoa chặn mẫu thiếu tên / thiếu thứ / thiếu ngày, gọt người lạ.
 * Chạy: node test/viec-lap.test.js
 */
const VL = require('../viec-lap');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};
/** Mốc thời gian của một giờ Việt Nam. */
const luc = (ngay, gio = 9) => Date.parse(ngay + 'T' + String(gio).padStart(2, '0') + ':00:00+07:00');

/* ---- 1. đến kỳ ---- */
const v = (ngay) => VL.ngayVN(luc(ngay));
ok('hằng ngày: ngày nào cũng tới kỳ', VL.denKy({ chuKy: 'ngay' }, v('2026-11-01')));
ok('hằng ngày trừ CN: Chủ nhật 01/11/2026 không tạo', !VL.denKy({ chuKy: 'ngay', boCN: true }, v('2026-11-01')));
ok('hằng ngày trừ CN: thứ Hai vẫn tạo', VL.denKy({ chuKy: 'ngay', boCN: true }, v('2026-11-02')));
ok('hằng tuần T2, T5: thứ Hai 02/11 tới kỳ', VL.denKy({ chuKy: 'tuan', thu: [1, 4] }, v('2026-11-02')));
ok('hằng tuần T2, T5: thứ Ba 03/11 không', !VL.denKy({ chuKy: 'tuan', thu: [1, 4] }, v('2026-11-03')));
ok('hằng tháng ngày 15: đúng ngày 15', VL.denKy({ chuKy: 'thang', ngay: [15] }, v('2026-11-15')));
ok('hằng tháng ngày 31: tháng 11 có 30 ngày → tạo ngày 30', VL.denKy({ chuKy: 'thang', ngay: [31] }, v('2026-11-30')));
ok('hằng tháng ngày 31: không tạo ngày 29/11', !VL.denKy({ chuKy: 'thang', ngay: [31] }, v('2026-11-29')));
ok('mẫu tạm dừng không tới kỳ', !VL.denKy({ chuKy: 'ngay', tat: true }, v('2026-11-02')));
/* 23:30 giờ UTC ngày 1 là 06:30 sáng ngày 2 ở Việt Nam: phải tính theo ngày VN. */
const vn = VL.ngayVN(Date.parse('2026-11-01T23:30:00Z'));
ok('ngày tính theo giờ Việt Nam, không theo UTC', vn.ngay === '2026-11-02' && vn.thu === 1, JSON.stringify(vn));

/* ---- 2. hạn ---- */
ok('hạn mang giờ của mẫu, múi +07:00',
  VL.hanCua({ gioHan: '9:05' }, v('2026-11-02')) === '2026-11-02T09:05:00+07:00',
  VL.hanCua({ gioHan: '9:05' }, v('2026-11-02')));
ok('mô tả hằng tuần đọc được', VL.moTa({ chuKy: 'tuan', thu: [4, 1], gioHan: '17:00' }) === 'Hằng tuần · T2, T5 · hạn 17:00');

/* ---- 3 + 4. nhịp tạo việc ---- */
function khoGia(ds) {
  const ghi = [];
  return { ds, ghi, async list() { return ds; }, async sua(m) { ghi.push(m.lanCuoi); return m; } };
}
(async () => {
  let now = luc('2026-11-02', 6);
  const K = khoGia([{ id: 'a', title: 'Báo cáo ngày', chuKy: 'ngay', gioHan: '17:00' }]);
  const tao = [];
  const lich = VL.create({ kho: K, taoViec: async (m, x) => { tao.push(x.ngay); }, now: () => now, log: () => {} });

  await lich.tick();
  ok('trước 07:00 không tạo', tao.length === 0);
  now = luc('2026-11-02', 8);
  await lich.tick();
  await lich.tick();
  ok('mỗi ngày đúng một việc dù nhịp chạy nhiều lần', tao.length === 1 && tao[0] === '2026-11-02', JSON.stringify(tao));
  ok('ghi mốc lanCuoi trước khi tạo', K.ds[0].lanCuoi === '2026-11-02');
  now = luc('2026-11-03', 10);
  await lich.tick();
  ok('sang ngày mới thì tạo tiếp', tao.length === 2 && tao[1] === '2026-11-03');

  const K2 = khoGia([{ id: 'b', title: 'Hỏng', chuKy: 'ngay', lanCuoi: '2026-11-01' }]);
  const loi = [];
  const lich2 = VL.create({ kho: K2, taoViec: async () => { throw new Error('Base bận'); }, now: () => luc('2026-11-02'), log: (s) => loi.push(s) });
  await lich2.tick();
  ok('tạo hỏng thì trả mốc cũ để lượt sau thử lại', K2.ds[0].lanCuoi === '2026-11-01' && loi.length === 1, K2.ds[0].lanCuoi);

  /* ---- 5. chuanHoa ---- */
  ok('thiếu tên thì từ chối', !!VL.chuanHoa({ chuKy: 'ngay' }).loi);
  ok('hằng tuần không chọn thứ thì từ chối', !!VL.chuanHoa({ title: 'x', chuKy: 'tuan', thu: [] }).loi);
  ok('hằng tháng không có ngày thì từ chối', !!VL.chuanHoa({ title: 'x', chuKy: 'thang', ngay: [0, 40] }).loi);
  const c = VL.chuanHoa({ title: ' Đăng bài ', chuKy: 'tuan', thu: [1, 1, 9], gioHan: '25:00',
    owner: [{ id: 'ou_abc', name: 'Hằng' }, { id: 'khong-hop-le' }], tuNhap: 'recX', status: 'Hoàn thành' });
  ok('gọt mẫu: bỏ thứ trùng/sai, giờ sai về 17:00, bỏ người id lạ, bỏ ô không thuộc mẫu',
    c.mau && c.mau.title === 'Đăng bài' && c.mau.thu.join() === '1' && c.mau.gioHan === '17:00' &&
    c.mau.owner.length === 1 && !('tuNhap' in c.mau) && !('status' in c.mau), JSON.stringify(c));

  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
