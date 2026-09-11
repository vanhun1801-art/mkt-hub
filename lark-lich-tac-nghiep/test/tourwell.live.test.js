'use strict';
/**
 * ============================================================================
 * TỰ TẠO ĐƠN TOURWELL — phép thử CHẠM HỆ THỐNG THẬT
 * ============================================================================
 *
 *   TOURWELL_TOKEN=... node test/tourwell.live.test.js --that
 *
 * Vì sao cần đến nó dù đã có 40 phép thử không mạng: những phép kia chỉ chứng
 * minh mình DỰNG thân yêu cầu đúng ý mình. Chúng không biết Tourwell có nhận
 * hay không. Riêng module này thì tài liệu đã sai một lần rồi (bảo service_id
 * chỉ nhận 6/10, thực tế nhận 7), nên "đúng theo tài liệu" không phải bằng chứng.
 *
 * Nó TẠO MỘT ĐƠN THẬT rồi tự huỷ. Phải gõ --that để chạy — không ai lỡ tay
 * chạy nhầm khi gõ `npm test`.
 *
 * Đơn để lại trên hệ thống ở trạng thái "Đã hủy" (API không xoá hẳn được).
 */
const tw = require('../tourwell');

const THAT = process.argv.includes('--that');
if (!THAT) {
  console.log('Phép thử này tạo đơn THẬT trên Tourwell rồi tự huỷ.');
  console.log('Chạy lại với --that nếu thực sự muốn:  node test/tourwell.live.test.js --that');
  process.exit(0);
}
if (!tw.bat()) {
  console.error('Chưa khai token Tourwell (tourwell.json hoặc TOURWELL_TOKEN).');
  process.exit(1);
}

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + name); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + name + (detail ? '\n         ' + detail : '')); }
}

/* Lịch giả, đặt tên sao cho nhìn trong danh sách đơn là biết ngay đơn rác. */
const LICH = {
  id: 'rec_test',
  title: 'TEST tu dong - huy giup',
  start: new Date().toISOString(),
  costActual: 100000,
};

(async () => {
  console.log('\n\x1b[1mTạo đơn thật qua đúng đường mà nút "Đã thanh toán" đi\x1b[0m');

  let kq = null;
  try {
    kq = await tw.taoDonChoLich(LICH);
  } catch (e) {
    ok('tạo được đơn', false, e.message);
    process.exit(1);
  }

  ok('có mã đơn trả về', !!kq.ma, JSON.stringify(kq));
  ok('có link mở đơn', /^https?:\/\//.test(kq.link || ''), kq.link);
  ok('dòng chi phí đã vào', kq.dayDu === true, kq.loi || '');
  console.log('       → ' + kq.ma + '  ' + kq.link);

  /* Đọc lại bằng con mắt độc lập: tiền phải tách đúng 8% ĐÃ GỒM.
   * 100.000 đã gồm 8% → 92.592,59 trước VAT. Đây là con số kế toán quyết toán,
   * và là chỗ duy nhất phân biệt "đã gồm" với "chưa gồm" — nếu gửi nhầm thành
   * chưa gồm thì total_amount_cost sẽ là 100.000 chẵn. */
  const cf = tw.docCauHinh();
  const r = await fetch(cf.host + '/api/v1/orders/' + kq.id, {
    headers: { Authorization: 'Bearer ' + cf.token, Accept: 'application/json' },
  });
  const d = ((await r.json()) || {}).data || {};
  const dv = (d.services || [])[0] || {};
  const truocVat = Math.round(Number((dv.financial_summary || {}).total_amount_cost) || 0);

  ok('đơn đúng kiểu "Dịch vụ khác"', (dv.service_info || {}).id === 7,
    JSON.stringify(dv.service_info));

  /* NGƯỜI TẠO ĐƠN đi theo TOKEN, không theo trường nào trong thân yêu cầu.
   * Token của tài khoản "Api Official" thì đơn mang tên Api Official; nếu tài
   * khoản Lê Văn Hùng cũng có token riêng thì dùng token đó, đơn sẽ mang tên
   * anh — giống hệt lúc bấm tay. Không khẳng định đúng/sai ở đây, chỉ in ra,
   * vì chạy với token nào là quyết định của người chạy. */
  console.log('       → người tạo đơn: ' + ((d.creator || {}).name || '?')
    + ' (id ' + ((d.creator || {}).id) + ')');
  ok('sale phụ trách là Lê Văn Hùng', (d.sales_person || []).some((s) => s.id === 33),
    JSON.stringify(d.sales_person));
  ok('nguồn "Khác"', (d.source || {}).id === 17, JSON.stringify(d.source));
  ok('chi phí trước VAT = 92.593 (tức VAT 8% ĐÃ GỒM)', truocVat === 92593, String(truocVat));
  ok('đơn dừng ở "Đang xử lý" — đúng như đã báo cho người dùng', d.status === 'Đang xử lý', d.status);

  /* Dọn. Không dùng module vì module cố ý KHÔNG có hàm huỷ: app không bao giờ
   * được tự huỷ đơn của kế toán. Ở đây là dọn rác của chính phép thử. */
  const rh = await fetch(cf.host + '/api/v1/orders/' + kq.id + '/cancel', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cf.token, Accept: 'application/json' },
  });
  ok('đã huỷ đơn thử', rh.ok, 'HTTP ' + rh.status + ' — vào huỷ tay ở ' + kq.link);

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
  if (fail) process.exit(1);
})();
