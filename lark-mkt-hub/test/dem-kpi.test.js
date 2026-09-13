'use strict';
/**
 * Kiểm thử bộ đệm chỉ số (kpi.js) — chạy độc lập, KHÔNG cần hub và không chạm
 * vào Lark Base. Cắm một bộ đọc giả vào `BO_DOC` rồi đếm xem nó bị gọi mấy lần.
 *
 *   node test/dem-kpi.test.js
 *
 * Bốn tính chất được canh ở đây, mỗi cái vá một sự cố khác nhau:
 *   1. gộp lượt đang bay  — chống cơn ập khi nhiều tab cùng mở một lúc
 *   2. trả số hơi cũ ngay — người dùng không phải chờ 2.5 giây mỗi lần đệm hết hạn
 *   3. có trần            — tiến trình chạy cả tuần không phình bộ nhớ tới lúc bị giết
 *   4. đời của đệm        — xử lý xong một việc thì thẻ số phải đổi, không bị dựng lại số cũ
 */
/* Rút hạn đệm xuống 150 ms để thử được "hết hạn" mà không phải ngồi chờ 20 giây.
 * Phải đặt TRƯỚC require('../config') vì config đọc biến môi trường lúc nạp. */
process.env.HUB_KPI_MS = '150';

const kpi = require('../kpi');

let pass = 0, fail = 0;
function ok(dieuKien, ten, chiTiet) {
  if (dieuKien) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; console.log('  ✗ ' + ten + (chiTiet ? '  → ' + chiTiet : '')); }
}
const cho = (ms) => new Promise((r) => setTimeout(r, ms));

/* Bộ đọc giả: đếm số lần bị gọi, trả về đúng số đếm đó để nhận ra bản nào. */
let soLanGoi = 0;
let treMs = 0;
kpi.BO_DOC['thu-nghiem'] = async () => {
  soLanGoi += 1;
  const lan = soLanGoi;
  if (treMs) await cho(treMs);
  return { lan, the: [], nhom: {}, canXuLy: [] };
};
const MOD = { id: 'thu-nghiem', kpi: 'thu-nghiem', ten: 'Thử nghiệm' };

(async function () {
  console.log('\nKiểm thử bộ đệm chỉ số\n');

  /* ---- 1. gộp lượt đang bay ---- */
  console.log('[1] Nhiều lời gọi cùng lúc chỉ tốn một vòng đọc');
  kpi.xoaCache();
  soLanGoi = 0; treMs = 60;
  const nam = await Promise.all([1, 2, 3, 4, 5].map(() => kpi.doc(MOD, null, null)));
  ok(soLanGoi === 1, 'Năm lời gọi song song -> bộ đọc chỉ chạy 1 lần', 'chạy ' + soLanGoi + ' lần');
  ok(nam.every((x) => x.lan === 1), 'Cả năm nhận cùng một kết quả');
  ok(nam.every((x) => x.ok === true), 'Kết quả có cờ ok');

  /* ---- 2. đệm còn hạn ---- */
  console.log('\n[2] Đệm còn hạn thì không đọc lại');
  treMs = 0;
  const lai = await kpi.doc(MOD, null, null);
  ok(soLanGoi === 1, 'Gọi ngay sau đó -> vẫn 1 lần đọc');
  ok(lai.lan === 1, 'Nhận lại đúng bộ số cũ');

  /* ---- 3. trả số hơi cũ ngay, đọc lại phía sau ---- */
  console.log('\n[3] Hết hạn: trả ngay số cũ rồi đọc lại phía sau');
  await cho(200);                       // quá hạn 150 ms
  treMs = 120;
  const t0 = Date.now();
  const cu = await kpi.doc(MOD, null, null);
  const mat = Date.now() - t0;
  ok(mat < 60, 'Không bắt người dùng chờ vòng đọc mới (' + mat + ' ms)');
  ok(cu.lan === 1, 'Nhận số cũ chứ không phải rỗng');
  /* Cờ `cu` dành RIÊNG cho "lần đọc mới nhất LỖI" — giao diện treo băng cảnh
   * báo đỏ cho nó. Số chỉ hơi cũ không phải là lỗi, gắn cờ vào là báo động giả
   * mỗi phút một lần. */
  ok(!cu.cu, 'Không gắn cờ "số cũ vì lỗi" — đây không phải lỗi');
  await cho(250);
  ok(soLanGoi === 2, 'Vòng đọc mới đã chạy ở phía sau', 'chạy ' + soLanGoi + ' lần');
  const moi = await kpi.doc(MOD, null, null);
  ok(moi.lan === 2, 'Lượt sau đã nhận số mới');

  /* ---- 4. đời của đệm: xoá giữa chừng thì kết quả đang bay bị bỏ ---- */
  console.log('\n[4] Xử lý xong một việc -> không bị dựng lại số cũ');
  kpi.xoaCache();
  soLanGoi = 0; treMs = 150;
  const dangDoc = kpi.doc(MOD, null, null);      // khởi hành...
  await cho(30);
  kpi.xoaCache();                                 // ...rồi có người xử lý xong một việc
  await dangDoc;
  await cho(50);
  treMs = 0;
  const sauKhiXoa = await kpi.doc(MOD, null, null);
  ok(sauKhiXoa.lan > 1, 'Sau khi xoá đệm phải đọc lại thật, không lấy bản đang bay',
    'nhận lại bản ' + sauKhiXoa.lan);

  /* ---- 5. đệm có trần ---- */
  console.log('\n[5] Đệm không phình mãi');
  kpi.xoaCache();
  soLanGoi = 0; treMs = 0;
  /* Mỗi người xem là một khoá riêng (đúng như bản chạy chung). Đẩy quá trần 300
   * rồi kiểm: khoá ĐẦU TIÊN phải đã bị dọn, tức là phải đọc lại. */
  const dauTien = { id: 'ai-0' };
  await kpi.doc(MOD, null, dauTien);
  const sauLanDau = soLanGoi;
  for (let i = 1; i <= 340; i++) await kpi.doc(MOD, null, { id: 'ai-' + i });
  const truocKhiHoiLai = soLanGoi;
  await kpi.doc(MOD, null, dauTien);
  ok(soLanGoi === truocKhiHoiLai + 1,
    'Khoá cũ nhất đã bị dọn khỏi đệm (đọc lại thay vì lấy trong đệm)');
  ok(sauLanDau === 1, 'Người đầu tiên vẫn được đọc bình thường');

  /* Khoá vừa dùng thì PHẢI còn — dọn theo tuổi, không dọn bừa. */
  const gan = { id: 'ai-340' };
  const truoc = soLanGoi;
  await kpi.doc(MOD, null, gan);
  ok(soLanGoi === truoc, 'Khoá vừa dùng vẫn nằm trong đệm');

  delete kpi.BO_DOC['thu-nghiem'];
  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exitCode = fail ? 1 : 0;
})().catch((e) => {
  console.error('\nNổ giữa chừng: ' + e.stack);
  console.log('\n' + pass + ' pass · ' + (fail + 1) + ' fail');
  process.exitCode = 1;
});
