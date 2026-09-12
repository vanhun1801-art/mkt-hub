'use strict';
/**
 * ============================================================================
 * KHAI KHOẢN CHI → CÓ TẠO ĐƠN TOURWELL KHÔNG — phép thử CHẠM HỆ THỐNG THẬT
 * ============================================================================
 *
 *   node test/tourwell.live.test.js --that        (app phải đang chạy ở 5182)
 *
 * Nó khai một khoản chi 10.000 đ qua đúng API mà nút "Khai khoản chi" gọi, rồi
 * dọn sạch: huỷ đơn bên Tourwell và xoá dòng trong sổ quỹ.
 *
 * Vì sao không thử bằng hàm rời: đường đi thật gồm ba mắt xích — app ghi Base,
 * gọi Tourwell, rồi ghi mã ngược vào ô "Mã đơn Tourwell". Gãy mắt nào thì sổ và
 * Tourwell lệch nhau, mà lệch kiểu đó không có lỗi nào báo.
 */
const BASE = process.env.APP_URL || 'http://localhost:5182';
const tourwell = require('../../lark-chung/tourwell');

if (!process.argv.includes('--that')) {
  console.log('Phép thử này tạo đơn THẬT trên Tourwell rồi tự huỷ, và ghi một dòng vào sổ quỹ.');
  console.log('Chạy lại với --that nếu thực sự muốn.');
  process.exit(0);
}

let pass = 0, fail = 0;
function ok(ten, dieu, chiTiet) {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (chiTiet ? '\n         ' + chiTiet : '')); }
}

const goi = async (duong, opts) => {
  const r = await fetch(BASE + duong, Object.assign(
    { headers: { 'Content-Type': 'application/json' } }, opts || {}));
  return { status: r.status, body: await r.json().catch(() => null) };
};

(async () => {
  console.log('\n\x1b[1mKhai một khoản chi qua đúng đường của nút "Khai khoản chi"\x1b[0m');

  const r = await goi('/api/chi', {
    method: 'POST',
    body: JSON.stringify({
      noiDung: 'TEST tu dong - huy giup',
      tien: 10000,
      loai: 'Khác',
      ngayChi: new Date().toISOString(),
      tinhTrang: 'Đã chi',
    }),
  });

  ok('ghi được vào sổ quỹ', r.status === 200 && !!(r.body && r.body.id), JSON.stringify(r.body));
  if (!(r.body && r.body.id)) process.exit(1);

  const tw = r.body.tourwell || {};
  ok('có tạo đơn Tourwell', !!tw.ma, JSON.stringify(tw));
  ok('dòng chi phí Quỹ Marketing đã vào', tw.dayDu === true, tw.loi || '');
  ok('mã đơn ghi ngược được vào sổ', !tw.loiGhiBase, tw.loiGhiBase || '');
  if (tw.ma) console.log('       → ' + tw.ma + '  ' + tw.link);

  /* Đọc lại bằng con mắt độc lập: 10.000 đã gồm VAT 8% → 9.259 trước VAT.
   * Đây là chỗ duy nhất phân biệt "đã gồm" với "chưa gồm". */
  if (tw.id) {
    const cf = tourwell.docCauHinh();
    const res = await fetch(cf.host + '/api/v1/orders/' + tw.id, {
      headers: { Authorization: 'Bearer ' + cf.token, Accept: 'application/json' },
    });
    const d = ((await res.json()) || {}).data || {};
    const dv = (d.services || [])[0] || {};
    const truocVat = Math.round(Number((dv.financial_summary || {}).total_amount_cost) || 0);
    ok('đơn đúng kiểu "Dịch vụ khác"', (dv.service_info || {}).id === 7, JSON.stringify(dv.service_info));
    ok('chi phí trước VAT = 9.259 (tức VAT 8% ĐÃ GỒM)', truocVat === 9259, String(truocVat));

    const rh = await fetch(cf.host + '/api/v1/orders/' + tw.id + '/cancel', {
      method: 'POST', headers: { Authorization: 'Bearer ' + cf.token, Accept: 'application/json' },
    });
    ok('đã huỷ đơn thử', rh.ok, 'vào huỷ tay ở ' + tw.link);
  }

  const rx = await goi('/api/chi/' + r.body.id, { method: 'DELETE' });
  ok('đã xoá dòng thử khỏi sổ quỹ', rx.status === 200, JSON.stringify(rx.body));

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
  if (fail) process.exit(1);
})();
