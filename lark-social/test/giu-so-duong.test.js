'use strict';
/* Test thuần Node: `node test/giu-so-duong.test.js`. */
const assert = require('assert');
const Module = require('module');

let so = 0;
const ok = (ten) => { so++; console.log('  ✓ ' + ten); };
const hong = (ten, e) => {
  console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1;
};

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

const F = store.T.live.f;
const dong = (khoa, views, likes) => ({
  [F.key]: khoa, [F.views]: views, [F.likes]: likes, [F.title]: 'Phiên thử',
});

async function chay(cu, moi, giu) {
  KHO.cu = cu; KHO.tao = []; KHO.sua = null;
  await store.ghiTheoKhoa('live', moi, (x) => x[F.key], giu);
  return { sua: KHO.sua, tao: KHO.tao };
}

async function t(ten, fn) {
  try { await fn(); ok(ten); } catch (e) { hong(ten, e); }
}

(async () => {
  console.log('\nghiTheoKhoa — không để số 0 xoá số đã đo được');

  /* Chuyện thật 08/10/2026: hai máy cùng ghi vào một Base. Máy chạy bản cũ
     chưa biết đọc cột `views` của Meta ghi 0 đè lên số đúng mà máy kia vừa
     ghi — năm phiên LIVE Facebook ngày 04 và 06/10 về 0 lượt xem, trong khi
     Meta vẫn trả đủ số. */
  const daCo = () => [{ id: 'rec1', c: dong('Facebook#123', 5157, 11) }];
  const GIU = [F.views, F.likes];

  await t('0 KHÔNG đè được lên số dương đã có', async () => {
    const r = await chay(daCo(), [dong('Facebook#123', 0, 0)], GIU);
    assert.strictEqual(r.sua, null, 'không được sinh lệnh sửa nào');
  });

  await t('số đo được mới vẫn ghi đè bình thường', async () => {
    const r = await chay(daCo(), [dong('Facebook#123', 9999, 50)], GIU);
    assert.strictEqual(r.sua.rec1[F.views], 9999);
    assert.strictEqual(r.sua.rec1[F.likes], 50);
  });

  await t('số tụt nhưng còn dương thì vẫn ghi', async () => {
    /* Chỉ chặn đúng số 0, vì chỉ 0 mới là dấu hiệu chắc của "không đo được".
       Nền tảng đôi khi hiệu chỉnh giảm, lúc đó số mới mới là số đúng. */
    const r = await chay(daCo(), [dong('Facebook#123', 4000, 11)], GIU);
    assert.strictEqual(r.sua.rec1[F.views], 4000);
  });

  await t('một cột hỏng không kéo theo cột còn đo được', async () => {
    const r = await chay(daCo(), [dong('Facebook#123', 0, 42)], GIU);
    assert.ok(!(F.views in r.sua.rec1), 'lượt xem giữ nguyên số cũ');
    assert.strictEqual(r.sua.rec1[F.likes], 42, 'lượt thích vẫn cập nhật');
  });

  await t('dòng mới chưa có gì thì 0 vẫn ghi được', async () => {
    const r = await chay(daCo(), [dong('Facebook#999', 0, 0)], GIU);
    assert.strictEqual(r.tao.length, 1);
  });

  await t('bảng không khai cột giữ thì hành vi không đổi', async () => {
    /* Bảng Ngày và bảng Bài vẫn để 0 đè như cũ — ở đó 0 có thể là số thật. */
    const r = await chay(daCo(), [dong('Facebook#123', 0, 0)], undefined);
    assert.strictEqual(r.sua.rec1[F.views], 0);
  });

  console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
})();
