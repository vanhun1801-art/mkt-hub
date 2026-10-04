'use strict';
/**
 * ============================================================================
 * PHÂN TRANG TOURWELL — chốt chặn cho kiểu hỏng không hề báo lỗi
 * ============================================================================
 * Lần kéo đầu tiên (02/10/2026) dùng tham số `limit`. Tourwell nhận request,
 * trả 200 OK, nhưng BỎ QUA `page`: trang 1, trang 2 và trang 300 trả về y hệt
 * nhau. Kết quả là tải đúng 100 bản ghi lặp lại 375 lần, trong khi log đếm
 * "37.500 dòng" rất thuyết phục.
 *
 * Không lỗi, không cảnh báo, chỉ có một con số to và sai — nếu không tình cờ
 * so hai trang với nhau thì cả app sẽ dựng trên dữ liệu bịa.
 *
 * Đúng tham số là `per_page`, và một trang bị chặn cứng ở 25 bản ghi dù xin
 * bao nhiêu. 671 trang ≈ 16.775 khách ≈ 15 phút.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

const src = fs.readFileSync(path.join(__dirname, '..', 'nguon', 'tourwell.js'), 'utf8').split('\r\n').join('\n');

console.log('\nphân trang Tourwell');

ok('dùng per_page, KHÔNG dùng limit', /'per_page=' \+ MOI_TRANG/.test(src) && !/'limit=' \+ MOI_TRANG/.test(src));
ok('một trang 25 bản ghi (Tourwell chặn cứng, xin hơn cũng vô ích)', /MOI_TRANG = 25/.test(src));
ok('có trần số trang, không lặp vô tận', /TRAN_TRANG = \d+/.test(src));
ok('trần đủ cao cho 671 trang thật', Number((/TRAN_TRANG = (\d+)/.exec(src) || [])[1]) >= 800);

/* Chốt chặn quan trọng nhất. */
ok('phát hiện trang trùng trang trước thì DỪNG', /dau === dauTruoc/.test(src));
ok('và NÓI RA chứ không dừng im lặng', /phân trang không chạy/.test(src));
ok('dừng vì chạm trần cũng nói ra', src.indexOf("+ TRAN_TRANG + ' TRANG") !== -1);

/* Chạy thật phần chốt chặn bằng một API giả luôn trả cùng một trang. */
const duong = path.join(__dirname, '..', 'nguon', 'tourwell.js');
delete require.cache[require.resolve(duong)];
const twPath = require.resolve(path.join(__dirname, '..', '..', 'lark-chung', 'tourwell.js'));
let soLuot = 0;
require.cache[twPath] = {
  id: twPath, filename: twPath, loaded: true,
  exports: { goi: async () => { soLuot++; return { data: Array.from({ length: 25 }, (_, i) => ({ code: 'KL' + i, name: 'x' })) }; } },
};
const n = require(duong);
(async () => {
  const dong = [];
  const ds = await n.keoKhach((s) => dong.push(s));
  ok('API trả mãi một trang → dừng sau vài lượt, không chạy vô tận',
    soLuot <= 3, 'đã gọi ' + soLuot + ' lượt');
  ok('  và chỉ giữ MỘT trang, không nhân bản', ds.length === 25, ds.length + ' dòng');
  ok('  và có dòng cảnh báo cho người đọc',
    dong.some((d) => /trùng hệt trang trước/.test(d)), dong.join(' | ').slice(0, 120));

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
  process.exit(fail ? 1 : 0);
})();
