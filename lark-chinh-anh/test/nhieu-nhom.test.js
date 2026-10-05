'use strict';
/* `node test/nhieu-nhom.test.js` — gửi báo cáo vào NHIỀU nhóm chat.
 *
 * Anh Hiển nhờ đẩy thông báo sửa ảnh lên cả nhóm "CSKH - ẢNH,VIDEO" bên cạnh
 * nhóm SỬA ẢNH (05/10/2026): Media kiểm ảnh ở một nhóm, CSKH lấy ảnh gửi khách
 * ở nhóm khác.
 *
 * Bộ này KHÔNG gọi Lark. Nó thay `guiTin` bằng một hàm giả để soi đúng ba thứ
 * dễ sai nhất khi một tin phải đi nhiều nơi:
 *   1. mỗi nhóm nhận ĐÚNG MỘT tin
 *   2. khoá chống-gửi-trùng phải khác nhau theo nhóm, không thì Lark nuốt tin
 *      thứ hai và nhóm đó chẳng nhận được gì mà app vẫn báo thành công
 *   3. một nhóm hỏng thì các nhóm còn lại vẫn nhận, và tên nhóm hỏng phải được
 *      nêu ra — im lặng là tưởng đã gửi đủ
 */
const assert = require('assert');
const path = require('path');

/* Thay lark + store TRƯỚC khi nạp server.js, vì server giữ tham chiếu lúc nạp. */
const duongLark = require.resolve('../lark');
const duongStore = require.resolve('../store');

const daGui = [];        // mọi lời gọi guiTin
let hongVoi = null;      // chatId nào sẽ hỏng
require.cache[duongLark] = {
  id: duongLark, filename: duongLark, loaded: true, exports: {
    guiTin: async ({ chatId, card, text, khoa }) => {
      daGui.push({ chatId, khoa, co: card ? 'the' : 'chu', text });
      if (hongVoi && chatId === hongVoi) return { ok: false, loi: 'bot chưa ở trong nhóm' };
      return { ok: true, msgId: 'om_' + chatId.slice(-4) + '_' + daGui.length };
    },
  },
};

const nhatKy = [];
const daDanhDau = [];
require.cache[duongStore] = {
  id: duongStore, filename: duongStore, loaded: true, exports: {
    ghiNhatKy: async (x) => { nhatKy.push(x); },
    danhDauDaGui: async (ids) => { daDanhDau.push(...ids); },
    tai: async () => ({ baoCao: [], tours: [], caiDat: {} }),
    homNay: () => '2026-10-05',
    themNgay: (k) => k,
  },
};

const { dsNhomChat, guiVeNhom } = require('../server');

let so = 0;
const ta = async (ten, fn) => {
  daGui.length = 0; nhatKy.length = 0; daDanhDau.length = 0; hongVoi = null;
  try { await fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

const A = { id: 'oc_aaaaaaaaaaaaaaaa1111', ten: 'SỬA ẢNH' };
const B = { id: 'oc_bbbbbbbbbbbbbbbb2222', ten: 'CSKH - ẢNH,VIDEO' };
const goi = (nhoms) => guiVeNhom({
  nhoms, card: { elements: [] }, text: 'noi dung', khoa: 'bc-rec1', baoCaoIds: ['rec1'],
});

(async () => {
  console.log('\nđọc cài đặt');

  await ta('ô chat_ds (JSON) cho ra đủ các nhóm', async () => {
    const ds = dsNhomChat({ caiDat: { chat_ds: JSON.stringify([A, B]) } });
    assert.deepStrictEqual(ds.map((x) => x.id), [A.id, B.id]);
  });

  await ta('chưa có chat_ds thì lùi về cặp chat_id/chat_ten của bản cũ', async () => {
    const ds = dsNhomChat({ caiDat: { chat_id: A.id, chat_ten: A.ten } });
    assert.deepStrictEqual(ds, [{ id: A.id, ten: A.ten, tuBase: true }]);
  });

  await ta('chat_ds hỏng (không phải JSON) vẫn gửi được, lùi về nhóm cũ', async () => {
    /* Ô trên Base ai cũng sửa tay được. Hỏng ô đó mà cả app câm là mất báo cáo
     * cả ngày, trong khi lùi về nhóm cũ thì chỉ mất nhóm thứ hai. */
    const ds = dsNhomChat({ caiDat: { chat_ds: '{hong', chat_id: A.id, chat_ten: A.ten } });
    assert.strictEqual(ds.length, 1);
    assert.strictEqual(ds[0].id, A.id);
  });

  await ta('nhóm trùng id chỉ tính một lần', async () => {
    const ds = dsNhomChat({ caiDat: { chat_ds: JSON.stringify([A, A, B]) } });
    assert.strictEqual(ds.length, 2, 'gửi hai tin giống hệt vào cùng một nhóm');
  });

  await ta('id sai dạng bị loại', async () => {
    const ds = dsNhomChat({ caiDat: { chat_ds: JSON.stringify([{ id: 'linh tinh', ten: 'X' }, B]) } });
    assert.deepStrictEqual(ds.map((x) => x.id), [B.id]);
  });

  console.log('\ngửi vào nhiều nhóm');

  await ta('mỗi nhóm nhận đúng một tin', async () => {
    const r = await goi([A, B]);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(daGui.length, 2, 'số lần gửi: ' + daGui.length);
    assert.deepStrictEqual(daGui.map((x) => x.chatId).sort(), [A.id, B.id].sort());
    assert.deepStrictEqual(r.daGui.sort(), [A.ten, B.ten].sort());
  });

  await ta('khoá chống-gửi-trùng KHÁC NHAU theo nhóm', async () => {
    await goi([A, B]);
    const khoa = daGui.map((x) => x.khoa);
    assert.strictEqual(new Set(khoa).size, 2,
      'dùng chung khoá thì Lark coi tin thứ hai là gửi lại và nuốt mất: ' + khoa.join(' , '));
  });

  await ta('nhật ký ghi một dòng cho mỗi nhóm', async () => {
    await goi([A, B]);
    assert.strictEqual(nhatKy.length, 2);
    assert.deepStrictEqual(nhatKy.map((x) => x.chat).sort(), [A.id, B.id].sort());
  });

  await ta('đánh dấu "đã gửi" đúng một lần cho lô', async () => {
    await goi([A, B]);
    assert.deepStrictEqual(daDanhDau, ['rec1'], 'đánh dấu ' + daDanhDau.length + ' lần');
  });

  console.log('\nmột nhóm hỏng');

  await ta('nhóm kia vẫn nhận, và tên nhóm hỏng được nêu ra', async () => {
    hongVoi = B.id;
    const r = await goi([A, B]);
    assert.strictEqual(r.ok, true, 'một nhóm hỏng không được làm hỏng cả lượt gửi');
    assert.deepStrictEqual(r.daGui, [A.ten]);
    assert.deepStrictEqual(r.truot, [B.ten]);
    assert.ok(/CSKH/.test(r.canhBao || ''), 'cảnh báo không nêu tên nhóm hỏng: ' + r.canhBao);
    assert.deepStrictEqual(daDanhDau, ['rec1'], 'đã có nhóm nhận thì phải đóng dấu đã gửi');
  });

  await ta('hỏng HẾT thì báo hỏng, và không đóng dấu đã gửi', async () => {
    hongVoi = null;
    /* Cho cả hai cùng hỏng bằng cách trỏ vào một id duy nhất rồi bắt nó hỏng. */
    hongVoi = A.id;
    const r = await goi([A]);
    assert.strictEqual(r.ok, false);
    assert.ok(/SỬA ẢNH/.test(r.loi), r.loi);
    assert.deepStrictEqual(daDanhDau, [], 'chưa nhóm nào nhận mà đã đóng dấu đã gửi');
  });

  await ta('không nhóm nào thì nói rõ, không ném lỗi', async () => {
    const r = await goi([]);
    assert.strictEqual(r.ok, false);
    assert.ok(/Chưa chọn nhóm/.test(r.loi), r.loi);
    assert.strictEqual(daGui.length, 0);
  });

  await ta('vẫn nhận dạng gọi cũ một chatId', async () => {
    const r = await guiVeNhom({ chatId: A.id, card: {}, text: 'x', khoa: 'k', baoCaoId: 'rec9' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(daGui.length, 1);
  });

  console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
})();
