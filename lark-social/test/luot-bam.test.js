'use strict';
/**
 * LƯỢT BẤM CỦA BÀI ẢNH — test thuần Node: `node test/luot-bam.test.js`.
 *
 * Vì sao có tệp này. Bài ảnh và bài chữ của Facebook không còn lượt xem lẫn
 * lượt tiếp cận ở mức bài — Meta đã gỡ. 553 bài ảnh vì thế nằm trong Base với
 * mọi cột đếm người bằng 0, và tab Nội dung xếp hạng theo lượt xem nên chúng
 * luôn ở đáy bảng như thể không ai nhìn thấy.
 *
 * `post_clicks` là chỉ số đếm người duy nhất chúng còn. Phần đồng bộ vẫn xin
 * nó, nhưng bảng Bài đăng không có cột nên số xin về bị vứt — có bài trả về
 * 1.007 lượt bấm mà không ai biết. Ngày 17/10/2026 thêm cột "Lượt bấm".
 *
 * Ba cái bẫy mà mấy phép thử dưới đây canh:
 *   1. Ghi 0 khi không đo được. Instagram, TikTok, Zalo không trả chỉ số này.
 *   2. Để số 0 của một lượt hỏng xoá số đã đo được của lượt trước.
 *   3. Đọc ô trống thành 0 lúc nạp, làm mất luôn ranh giới giữa hai thứ.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

let so = 0;
const ok = (ten) => { so++; console.log('  ✓ ' + ten); };
const hong = (ten, e) => {
  console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1;
};
async function t(ten, fn) {
  try { await fn(); ok(ten); } catch (e) { hong(ten, e); }
}

const doc = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

/* Thay ./lark bằng bản giả TRƯỚC khi nạp store, để không gọi ra Base thật. */
const KHO = { cu: [], tao: [], sua: null };
const nap = Module._load;
Module._load = function (yc) {
  if (yc === './lark') {
    return {
      listAll: async () => KHO.cu,
      createMany: async (_id, rows) => { KHO.tao = rows; return []; },
      updateMany: async (_id, map) => { KHO.sua = map; return 0; },
    };
  }
  return nap.apply(this, arguments);
};
const store = require('../store');
Module._load = nap;

const F = store.T.post.f;

(async () => {
  console.log('\nlượt bấm — cột mới phải có mặt');

  await t('bảng Bài đăng có khai cột Lượt bấm', () => {
    assert.ok(F.clicks, 'thiếu khoá clicks trong config.tables.post.f');
    assert.match(F.clicks, /^fld/, 'phải là mã trường của Base: ' + F.clicks);
  });

  console.log('\nlượt bấm — 0 không được xoá số đã đo');

  await t('lượt sau trả 0 thì giữ nguyên số cũ', async () => {
    /* Đúng tình huống đã xảy ra với LIVE: baiCuaPage() gặp một metric bị Meta
       gỡ thì bỏ CẢ khối insights rồi hỏi lại, nên cả lượt về với clicks = 0.
       Không chặn thì một lần Meta trở chứng là xoá sạch số của bài ảnh. */
    KHO.cu = [{ id: 'rec1', c: { [F.key]: 'Facebook#1', [F.clicks]: 1007 } }];
    KHO.tao = []; KHO.sua = null;
    await store.ghiTheoKhoa('post',
      [{ [F.key]: 'Facebook#1', [F.clicks]: 0, [F.likes]: 22 }],
      (x) => x[F.key], [F.clicks]);
    const sua = (KHO.sua && KHO.sua.rec1) || {};
    assert.ok(!(F.clicks in sua), 'không được ghi đè lượt bấm bằng 0');
    assert.strictEqual(sua[F.likes], 22, 'các cột khác vẫn phải cập nhật bình thường');
  });

  await t('số lớn hơn thì vẫn ghi đè như thường', async () => {
    KHO.cu = [{ id: 'rec1', c: { [F.key]: 'Facebook#1', [F.clicks]: 1007 } }];
    KHO.tao = []; KHO.sua = null;
    await store.ghiTheoKhoa('post',
      [{ [F.key]: 'Facebook#1', [F.clicks]: 1200 }], (x) => x[F.key], [F.clicks]);
    assert.strictEqual(KHO.sua.rec1[F.clicks], 1200);
  });

  await t('ô đang trống mà đo được 0 thì vẫn để trống', async () => {
    /* Không phải chủ ý thiết kế, mà là hệ quả của khacNhau(): ô trống đọc ra 0
       nên 0 mới không khác gì. Ghi lại ở đây để ai đọc Base biết mà đừng tưởng
       đồng bộ bỏ sót — và để nếu sau này cần phân biệt "đo được 0 lượt bấm"
       với "chưa đo", người sửa biết phải động vào khacNhau chứ không phải vào
       dongPost. Thực tế chưa gặp bài ảnh nào Meta trả đúng 0. */
    KHO.cu = [{ id: 'rec1', c: { [F.key]: 'Facebook#1', [F.likes]: 5 } }];
    KHO.tao = []; KHO.sua = null;
    await store.ghiTheoKhoa('post',
      [{ [F.key]: 'Facebook#1', [F.clicks]: 0 }], (x) => x[F.key], [F.clicks]);
    assert.strictEqual(KHO.sua, null, 'không sinh lệnh sửa nào');
  });

  console.log('\nlượt bấm — trống khác 0');

  await t('dongPost chỉ ghi cột khi nền tảng thật sự trả số', () => {
    /* Soi mã nguồn, vì dongPost() không xuất ra ngoài. Viết thẳng
       `[f.clicks]: num(row.clicks)` là mọi bài Instagram, TikTok, Zalo vào Base
       với số 0, và ô trong bảng đọc thành "đo rồi, không ai bấm". */
    const s = doc('sync/index.js');
    assert.ok(/if \(row\.clicks != null\) o\[f\.clicks\]/.test(s),
      'dongPost phải bỏ qua cột khi row.clicks là null');
    assert.ok(!/\[f\.clicks\]: num\(row\.clicks\),\s*\n\s*\[f\.avgWatch\]/.test(s),
      'không được ghi cột lượt bấm vô điều kiện trong dongPost');
  });

  await t('Facebook trả null khi Meta không đưa post_clicks', () => {
    const s = doc('sync/facebook.js');
    assert.ok(/'post_clicks' in ins \? ins\.post_clicks : null/.test(s),
      'clicks phải là null khi thiếu metric, không phải 0');
    assert.ok(!/clicks: ins\.post_clicks \|\| 0/.test(s),
      '`|| 0` biến "chưa đo được" thành "không ai bấm"');
  });

  await t('nạp từ Base thì ô trống giữ nguyên là null', () => {
    const s = doc('store.js');
    assert.ok(/clicks: r\.c\[f\.clicks\] == null \? null : num\(r\.c\[f\.clicks\]\)/.test(s),
      'docBai phải giữ ô trống, num() sẽ biến nó thành 0');
  });

  console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
})();
