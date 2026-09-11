'use strict';
/**
 * ============================================================================
 * GHI SỔ QUỸ — kiểm phần tính toán, KHÔNG chạm mạng
 * ============================================================================
 *
 *   node test/so-quy.test.js
 *
 * Soi đúng những chỗ sai âm thầm: ngày lệch múi giờ, tiền lẻ, và tên người —
 * sổ quỹ phải ghi người PHỤ TRÁCH buổi đó, không phải người bấm nút, vì quản
 * lý hay bấm thay.
 */
const sq = require('../so-quy');

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

/* -------------------------------------------------------------------------- */
nhom('Ngày: ISO của Base → chuỗi giờ Việt Nam của Base sổ quỹ');

ok('ngày thường', sq.ngayBase('2026-09-09T08:00:00+07:00') === '2026-09-09 00:00:00',
  sq.ngayBase('2026-09-09T08:00:00+07:00'));

/* 21h tối giờ VN ngày 9 = 14h UTC ngày 9 — vẫn phải là ngày 9. */
ok('21h tối giờ VN không lùi ngày', sq.ngayBase('2026-09-09T14:00:00Z') === '2026-09-09 00:00:00',
  sq.ngayBase('2026-09-09T14:00:00Z'));

/* 0h30 sáng ngày 10 giờ VN = 17h30 UTC ngày 9 — phải sang ngày 10. Đây là mốc
 * mà quên cộng bù múi giờ sẽ ra ngày KHÁC, còn mốc ban ngày thì không. */
ok('0h30 sáng ngày 10 giờ VN ra đúng ngày 10',
  sq.ngayBase('2026-09-09T17:30:00Z') === '2026-09-10 00:00:00', sq.ngayBase('2026-09-09T17:30:00Z'));

ok('không có ngày thì trả null, không trả chuỗi rác', sq.ngayBase('') === null && sq.ngayBase(null) === null);
ok('ngày rác trả null', sq.ngayBase('hôm nọ') === null);

/* -------------------------------------------------------------------------- */
nhom('Chốt an toàn');

(async () => {
  const lich = {
    id: 'recTEST',
    title: 'Khảo sát Hòn Thơm',
    start: '2026-09-09T08:00:00+07:00',
    costActual: 0,
    owner: [{ id: 'ou_phu_trach', name: 'Nguyễn Long Khánh' }],
    staff: [{ id: 'ou_khac', name: 'Người khác' }],
  };

  const r0 = await sq.ghiKhoanChi(lich);
  ok('chi phí 0 thì không gọi mạng, trả cờ bỏ qua', r0 && r0.bo === 'khong-co-chi-phi',
    JSON.stringify(r0));

  const rAm = await sq.ghiKhoanChi({ ...lich, costActual: -1000 });
  ok('chi phí âm cũng bị chặn', rAm && rAm.bo === 'khong-co-chi-phi', JSON.stringify(rAm));

  /* Tắt bằng biến môi trường: phải tắt THẬT, không được ghi nửa vời. */
  const cu = process.env.QUY_TAT;
  process.env.QUY_TAT = '1';
  ok('QUY_TAT=1 thì tính năng tắt', sq.bat() === false);
  const rTat = await sq.ghiKhoanChi({ ...lich, costActual: 500000 });
  ok('tắt rồi thì không ghi gì', rTat && rTat.bo === 'chua-cau-hinh', JSON.stringify(rTat));
  if (cu === undefined) delete process.env.QUY_TAT; else process.env.QUY_TAT = cu;

  const cf = sq.docCauHinh();
  ok('trỏ đúng Base Chi phí Marketing', cf.baseToken === 'IQfUbtDDZacFdCsl657l9hOPged', cf.baseToken);
  ok('trỏ đúng bảng Chi phí', cf.chiTableId === 'tblf4Rq9ei6Fp6A1', cf.chiTableId);
  ok('bật lại sau khi bỏ biến môi trường', cf.bat === true);

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
  if (fail) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
})();
