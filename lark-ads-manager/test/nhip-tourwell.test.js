/**
 * Test bộ điều nhịp gọi Tourwell.
 *
 * Vì sao đáng có bộ riêng: Tourwell chặn ở 60 yêu cầu/phút và đã trả 429 thật.
 * Nguyên nhân không phải "quên giãn nhịp" — bản trước CÓ giãn 1,1 giây, nhưng
 * giãn TRONG TỪNG VÒNG LẶP. Hub cắt lời gọi ở 4 phút mà module vẫn chạy tiếp,
 * người dùng bấm lại là thành hai luồng cùng gọi: mỗi luồng tự giãn đúng, cộng
 * lại vẫn vượt trần. Nên nhịp phải ở mức MODULE, dùng chung cho mọi luồng.
 *
 * Đặt nhịp nhỏ qua TOURWELL_GIAN_MS để test chạy trong vài giây thay vì vài phút.
 */
process.env.TOURWELL_GIAN_MS = '60';
const t_ = require('../sync/tourwellapi');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const GIAN = t_.GIAN_MS;
t('đọc được nhịp từ biến môi trường', GIAN === 60, String(GIAN));

(async () => {
  console.log('— nhiều lời gọi trong CÙNG một luồng phải thưa ra');
  let moc = [];
  const ghi = () => { moc.push(Date.now()); return 'xong'; };
  const r = await Promise.all([1, 2, 3, 4, 5].map(() => t_.xepHang(ghi)));
  t('trả về đúng kết quả của từng việc', r.every((x) => x === 'xong'));
  t('chạy đủ 5 lượt', moc.length === 5, String(moc.length));
  const cach = moc.slice(1).map((x, i) => x - moc[i]);
  t('mọi khoảng cách đều >= nhịp đã đặt',
    cach.every((c) => c >= GIAN - 12), JSON.stringify(cach));

  console.log('— HAI luồng song song vẫn không vượt trần (đây là ca đã ăn 429)');
  moc = [];
  await Promise.all([
    (async () => { for (let i = 0; i < 4; i += 1) await t_.xepHang(ghi); })(),
    (async () => { for (let i = 0; i < 4; i += 1) await t_.xepHang(ghi); })(),
  ]);
  t('chạy đủ 8 lượt', moc.length === 8, String(moc.length));
  const cach2 = moc.slice(1).map((x, i) => x - moc[i]);
  t('hai luồng gộp lại vẫn thưa đúng nhịp — KHÔNG gấp đôi tốc độ',
    cach2.every((c) => c >= GIAN - 12), JSON.stringify(cach2));

  console.log('— một việc lỗi không được làm tắc hàng đợi');
  let sau = null;
  try { await t_.xepHang(() => { throw new Error('cố tình lỗi'); }); }
  catch (e) { sau = e.message; }
  t('lỗi vẫn nổi lên đúng chỗ gọi', sau === 'cố tình lỗi', String(sau));
  const tiep = await t_.xepHang(() => 'vẫn chạy');
  t('việc sau đó vẫn chạy được', tiep === 'vẫn chạy', String(tiep));

  console.log('— việc bất đồng bộ cũng được chờ xong');
  const cham = await t_.xepHang(async () => {
    await new Promise((r2) => setTimeout(r2, 30));
    return 'xong sau 30ms';
  });
  t('chờ đúng promise bên trong', cham === 'xong sau 30ms');

  console.log('— các mốc cấu hình');
  const src = require('fs').readFileSync(require.resolve('../sync/tourwellapi.js'), 'utf8');
  t('nhịp mặc định thưa hơn 1,1 giây đã ăn 429', /TOURWELL_GIAN_MS \|\| 1500/.test(src));
  t('có xử lý 429 riêng, không dựa vào retry của http.js', /=== 429/.test(src));
  t('có đọc Retry-After của máy chủ', /retry-after/i.test(src));
  t('request được gọi với retries: 1 để không thử lại 429 vô ích',
    /retries: 1,/.test(src));
  t('lấy số điện thoại mặc định TẮT', /laySdt = false/.test(src));
  t('nói rõ lý do bỏ qua số điện thoại', /15\.948/.test(src));
  t('cắt trang thì phải báo, không im lặng', /DỪNG Ở \$\{tran\} TRANG/.test(src));

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exitCode = fail ? 1 : 0;
})();
