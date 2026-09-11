'use strict';
/**
 * ============================================================================
 * TỰ TẠO ĐƠN TOURWELL — kiểm phần tính toán, KHÔNG chạm mạng
 * ============================================================================
 *
 *   node test/tourwell.test.js
 *
 * Không có lời gọi HTTP nào ở đây. Ba nhóm dễ sai âm thầm được soi kỹ:
 *
 *   · NGÀY — Tourwell nhận DD/MM/YYYY còn Base trả ISO. Đọc nhầm thứ tự
 *     ngày/tháng thì "09/03" thành mùng 9 tháng 3, không ai phát hiện cho tới
 *     khi điều hành đi sai buổi. Thêm bẫy múi giờ: máy chủ trên Render chạy
 *     giờ UTC, buổi tác nghiệp 21h tối giờ VN nếu không cộng bù sẽ lùi một ngày.
 *
 *   · VAT — 8% ĐÃ GỒM. Sai sang "chưa gồm" thì tiền chi vẫn đúng nhưng thuế
 *     lệch, và đó là con số kế toán quyết toán.
 *
 *   · SỐ DANH MỤC — nguồn, nhà cung cấp, sale. Dò được từ máy chủ thật; đổi
 *     nhầm một con là đơn treo vào nhà cung cấp khác mà chẳng có lỗi nào.
 */
const tw = require('../tourwell');

let pass = 0, fail = 0;
const fails = [];

function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + name); }
  else {
    fail++; fails.push(name + (detail ? ' → ' + detail : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + name + (detail ? '\n         ' + detail : ''));
  }
}
function group(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }

/* -------------------------------------------------------------------------- */
group('Ngày: ISO của Base → DD/MM/YYYY của Tourwell');

ok('ngày thường', tw.ngayVN('2026-09-09T08:00:00+07:00') === '09/09/2026',
  tw.ngayVN('2026-09-09T08:00:00+07:00'));

/* Cùng một mốc, viết theo UTC. 21h ngày 9 giờ VN = 14h ngày 9 UTC — vẫn phải
 * ra ngày 9. Đây là bẫy đã cắn app này một lần ở chỗ khác (xem toCells). */
ok('21h tối giờ VN không lùi sang hôm trước',
  tw.ngayVN('2026-09-09T14:00:00Z') === '09/09/2026', tw.ngayVN('2026-09-09T14:00:00Z'));

/* 23h30 giờ VN ngày 9 = 16h30 UTC ngày 9. Nếu quên cộng bù, đọc theo UTC vẫn ra
 * ngày 9 — nên phải thử cả mốc mà quên bù sẽ ra ngày KHÁC: 00h30 ngày 10 giờ VN
 * = 17h30 UTC ngày 9. */
ok('0h30 sáng ngày 10 giờ VN ra đúng ngày 10',
  tw.ngayVN('2026-09-09T17:30:00Z') === '10/09/2026', tw.ngayVN('2026-09-09T17:30:00Z'));

ok('ngày mùng 1 vẫn đệm số 0', tw.ngayVN('2026-01-01T03:00:00Z') === '01/01/2026',
  tw.ngayVN('2026-01-01T03:00:00Z'));

ok('không có ngày thì trả rỗng, không trả "Invalid Date"', tw.ngayVN('') === '' && tw.ngayVN(null) === '');
ok('ngày rác trả rỗng', tw.ngayVN('hôm nọ') === '');

/* -------------------------------------------------------------------------- */
group('Tên hoạt động — hai chỗ duy nhất Tourwell nhận được chữ');

const lich = {
  title: 'Khảo sát Hòn Thơm',
  start: '2026-09-09T08:00:00+07:00',
  costActual: 1500000,
};

ok('kèm ngày để phân biệt hai buổi cùng tên',
  tw.moTa(lich) === 'Khảo sát Hòn Thơm (09/09/2026)', tw.moTa(lich));
ok('lịch chưa đặt tên vẫn có chữ, không để trống',
  tw.moTa({ start: lich.start }) === 'Tác nghiệp Marketing (09/09/2026)');

/* -------------------------------------------------------------------------- */
group('Thân đơn hàng');

const don = tw.thanDon(lich);
ok('kiểu dịch vụ 7 = "Dịch vụ khác"', don.service_id === 7, String(don.service_id));
ok('nguồn 17 = "Khác"', don.source_id === 17, String(don.source_id));
ok('sale 33 = Lê Văn Hùng', don.follower_id === 33, String(don.follower_id));
ok('mượn khuôn sản phẩm *CÔNG TÁC (280)', don.product_id === 280, String(don.product_id));
ok('ngày đi đúng định dạng Tourwell', don.depart_date === '09/09/2026', don.depart_date);
ok('tên hoạt động vào ghi chú đơn', don.note_order === 'Khảo sát Hòn Thơm (09/09/2026)');
ok('đơn giá bán = 0 (chi phí nội bộ, không có doanh thu)', don.pricing[0].price === 0);
ok('bảng giá bán có đúng một dòng', don.pricing.length === 1);

/* Máy chủ ĐÒI đủ những trường này; thiếu một cái là 422 mà chỉ biết lúc bấm thật. */
['contact_name', 'contact_phone', 'contact_email', 'product_id', 'service_id',
  'depart_date', 'note_order', 'source_id', 'branch_office_id', 'vat_type', 'pricing']
  .forEach((k) => ok('có trường bắt buộc ' + k, don[k] !== undefined && don[k] !== ''));

/* -------------------------------------------------------------------------- */
group('Dòng chi phí — chỗ kế toán đọc');

const cp = tw.thanChiPhi(lich);
ok('nhà cung cấp 274 = QUỸ MARKETING', cp.supplier_id === 274, String(cp.supplier_id));
ok('KHÔNG phải 280 "Hoạt động Marketing"', cp.supplier_id !== 280);
ok('VAT 8', cp.vat === 8, String(cp.vat));
ok('VAT tính theo phần trăm', cp.vat_mode === 'percent', cp.vat_mode);
ok('VAT ĐÃ GỒM trong giá', cp.vat_type === 'inc-vat', cp.vat_type);
ok('số lượng 1, số lần 1', cp.quantity === 1 && cp.period === 1);
ok('tiền lấy từ chi phí thực tế', cp.price === 1500000, String(cp.price));
ok('tiền tệ VND, tỷ giá 1', cp.currency_code === 'vnd' && cp.exchange_rate === 1);

/* Chi phí thực tế trong Base là number, có thể lẻ do chia đầu người. Tourwell
 * nhận integer — làm tròn ở đây chứ đừng để máy chủ tự cắt. */
ok('tiền lẻ được làm tròn, không gửi số thập phân',
  Number.isInteger(tw.thanChiPhi({ ...lich, costActual: 333333.3333 }).price));

/* -------------------------------------------------------------------------- */
group('Chốt an toàn');

(async () => {
  let loi = null;
  try { await tw.taoDonChoLich({ ...lich, costActual: 0 }); }
  catch (e) { loi = e.message; }
  ok('chi phí 0 thì không gọi mạng, báo lỗi ngay', !!loi && /chi phí/i.test(loi), String(loi));

  loi = null;
  try { await tw.taoDonChoLich({ ...lich, costActual: -5000 }); }
  catch (e) { loi = e.message; }
  ok('chi phí âm cũng bị chặn', !!loi);

  /* Tính năng phải TẮT khi chưa khai token — không được tự chạy nửa vời trên
   * máy của người chưa cấu hình gì. */
  const cu = process.env.TOURWELL_TOKEN;
  delete process.env.TOURWELL_TOKEN;
  const cf = tw.docCauHinh();
  ok('chưa có token thì tắt', cf.token ? true : cf.bat === false);
  ok('host mặc định là rootytrip', cf.host === 'https://rootytrip.tourwell.net', cf.host);

  /* Token còn là chữ mẫu có dấu: fetch sẽ ném "Cannot convert argument to a
   * ByteString ... value of 7853" — đã xảy ra thật hai lần lúc dựng tính năng
   * này. Câu lỗi phải chỉ đúng vào việc phải làm. */
  process.env.TOURWELL_TOKEN = '<token thật>';
  let loiToken = null;
  try { await tw.taoDonChoLich(lich); } catch (e) { loiToken = e.message; }
  ok('token còn chữ mẫu → báo đúng bệnh, không ném lỗi ByteString',
    !!loiToken && /chữ mẫu/.test(loiToken) && !/ByteString/.test(loiToken), String(loiToken));

  delete process.env.TOURWELL_TOKEN;
  if (cu) process.env.TOURWELL_TOKEN = cu;

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
  if (fail) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
})();
