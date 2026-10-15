'use strict';
/**
 * `node test/trao-doi.test.js` — Trao đổi trong lịch (trao-doi.js).
 *
 * Chạy với một Lark GIẢ trong bộ nhớ: không đọc, không ghi Base thật, không
 * gửi tin cho ai. Canh những chỗ hỏng ngầm:
 *   1. ô liên kết phải là [{ id }] — gửi chuỗi trần là Lark từ chối cả dòng;
 *   2. tin của lịch khác không lọt sang;
 *   3. đã xem là SỬA dòng cũ, không đẻ dòng mới mỗi lần mở;
 *   4. người nhận: không gửi cho chính mình, không ai nhận hai lần, quản lý
 *      trùng người trong lịch (cùng email) chỉ nhận một bản;
 *   5. thẻ Lark mở thẳng vào ô chat (?rec=…&mo=trao-doi).
 */
process.env.LARK_MODE = 'cli';
delete process.env.LARK_APP_ID;
process.env.LARK_MANAGER_EMAILS = 'quanly@rootytrip.com';
const assert = require('assert');
const cfg = require('../config');
const td = require('../trao-doi');

let so = 0, hong = 0;
const t = async (ten, fn) => {
  try { await fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { hong++; console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

/* Lark giả: bảng -> [{ record_id, cells(theo field id) }]. Ghi theo TÊN cột như lark.js thật. */
function larkGia(bangQuyen) {
  const bang = {};
  const idTheoTen = {};
  for (const nhom of [cfg.traoDoi, cfg.daXem]) {
    bang[nhom.tableId] = [];
    for (const [k, f] of Object.entries(nhom)) if (k !== 'tableId') idTheoTen[nhom.tableId + '/' + f.name] = f.id;
  }
  let dem = 0;
  const ghi = { tao: [], sua: [] };
  return {
    ghi,
    bang,
    async listAllRecords(tableId, base) {
      if (base) return bangQuyen.rows;
      return bang[tableId] || [];
    },
    async listFields(tableId, base) { return base ? bangQuyen.fields : []; },
    async createRecord(fields, tableId) {
      ghi.tao.push({ tableId, fields });
      const cells = {};
      for (const [ten, v] of Object.entries(fields)) cells[idTheoTen[tableId + '/' + ten]] = v;
      const rec = { record_id: 'recGia' + (++dem), cells };
      bang[tableId].push(rec);
      return { record_id_list: [rec.record_id] };
    },
    async updateRecord(id, fields, tableId) {
      ghi.sua.push({ id, tableId, fields });
      const rec = bang[tableId].find((r) => r.record_id === id);
      for (const [ten, v] of Object.entries(fields)) rec.cells[idTheoTen[tableId + '/' + ten]] = v;
    },
  };
}

const QUYEN = {
  fields: [{ id: 'fV', name: 'Vai' }, { id: 'fM', name: 'Email' }, { id: 'fI', name: 'open_id' },
    { id: 'fQ', name: 'Quản lý base' }, { id: 'fN', name: 'Người' }],
  rows: [
    { record_id: 'r1', cells: { fV: 'Quản lý', fM: 'ql2@rootytrip.com', fI: 'ou_ql2', fN: 'Quản lý Hai' } },
    { record_id: 'r2', cells: { fV: 'Nhân sự', fM: 'lead@rootytrip.com', fI: 'ou_lead', fQ: 'kol,lich-tac-nghiep', fN: 'Lead Lịch' } },
    { record_id: 'r3', cells: { fV: 'Nhân sự', fM: 'ns@rootytrip.com', fI: 'ou_ns', fN: 'Nhân sự thường' } },
    // trùng người trong lịch theo email: chỉ nhận một bản
    { record_id: 'r4', cells: { fV: 'Quản lý', fM: 'an@rootytrip.com', fI: 'ou_an_app_hub', fN: 'An' } },
  ],
};

(async () => {
  console.log('\nghi và đọc tin');
  const L = larkGia(QUYEN);
  const me = { id: 'ou_an', name: 'An', email: 'an@rootytrip.com' };

  await t('ô liên kết ghi dạng [{ id }], có giờ, có người viết', async () => {
    await td.ghiTin(L, 'recLich1', me, 'Mai mấy giờ xuất phát?');
    const f = L.ghi.tao[0].fields;
    assert.deepStrictEqual(f[cfg.traoDoi.lich.name], [{ id: 'recLich1' }]);
    assert.deepStrictEqual(f[cfg.traoDoi.nguoiViet.name], [{ id: 'ou_an' }]);
    assert.match(f[cfg.traoDoi.thoiGian.name], /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  });

  await t('chỉ đọc tin của đúng lịch đó, theo thứ tự thời gian', async () => {
    const T = cfg.traoDoi;
    L.bang[T.tableId].push(
      { record_id: 'recX', cells: { [T.noiDung.id]: 'tin lịch khác', [T.lich.id]: [{ record_ids: ['recLich2'] }], [T.thoiGian.id]: 1 } },
      { record_id: 'recY', cells: { [T.noiDung.id]: [{ text: 'tin cũ hơn' }], [T.lich.id]: [{ id: 'recLich1' }], [T.thoiGian.id]: 1000,
        [T.nguoiViet.id]: [{ id: 'ou_binh', name: 'Bình' }] } });
    const ds = await td.docTin(L, 'recLich1');
    assert.deepStrictEqual(ds.map((c) => c.content), ['tin cũ hơn', 'Mai mấy giờ xuất phát?']);
    assert.strictEqual(ds[0].author[0].name, 'Bình');
  });

  console.log('\nđã xem');
  await t('lần đầu tạo dòng, lần sau SỬA đúng dòng đó', async () => {
    await td.ghiDaXem(L, 'recLich1', me);
    await td.ghiDaXem(L, 'recLich1', me);
    assert.strictEqual(L.bang[cfg.daXem.tableId].length, 1, 'mỗi lần mở đẻ thêm một dòng');
    assert.strictEqual(L.ghi.sua.length, 1);
    const dx = await td.docDaXem(L, 'recLich1');
    assert.deepStrictEqual(dx.map((x) => x.id), ['ou_an']);
  });

  console.log('\nai nhận báo Lark');
  const item = {
    id: 'recLich1', title: 'Hòn Thơm',
    owner: [{ id: 'ou_an', name: 'An', email: 'an@rootytrip.com' }],
    staff: [{ id: 'ou_binh', name: 'Bình' }, { id: 'ou_binh', name: 'Bình' }],
  };
  const ql = await td.quanLyLich(L);

  await t('quản lý lấy từ env + Vai Quản lý + Lead base lich-tac-nghiep, bỏ nhân sự thường', async () => {
    // máy cá nhân còn thêm quản lý theo open_id trong quyen.json (không có email)
    const mails = ql.map((x) => x.email).filter(Boolean).sort();
    assert.deepStrictEqual(mails, ['an@rootytrip.com', 'lead@rootytrip.com', 'ql2@rootytrip.com', 'quanly@rootytrip.com']);
  });

  await t('An gửi: không nhận tin của chính mình (kể cả bản quản lý trùng email)', async () => {
    const nhan = td.gopNguoiNhan(item, ql, me);
    assert.ok(!nhan.some((x) => x.id === 'ou_an' || x.email === 'an@rootytrip.com'), JSON.stringify(nhan));
    assert.strictEqual(nhan.filter((x) => x.id === 'ou_binh').length, 1, 'Bình nhận hai lần');
    const chiId = ql.filter((x) => !x.email && x.id !== 'ou_an').length;
    assert.strictEqual(nhan.length, 4 + chiId);   // Bình + 3 quản lý còn lại (+ quản lý chỉ có open_id)
  });

  await t('Bình gửi: An nhận MỘT bản dù vừa phụ trách vừa là quản lý', async () => {
    const nhan = td.gopNguoiNhan(item, ql, { id: 'ou_binh', name: 'Bình', email: '' });
    const an = nhan.filter((x) => x.id === 'ou_an' || x.email === 'an@rootytrip.com');
    assert.strictEqual(an.length, 1, JSON.stringify(nhan));
  });

  console.log('\nthẻ Lark');
  await t('nút "Mở trao đổi" mở thẳng ô chat của đúng lịch', async () => {
    const the = td.theTraoDoi(item, me, 'x'.repeat(900), 'https://hub.vd');
    const nut = the.elements.find((e) => e.tag === 'action').actions[0];
    assert.strictEqual(nut.url, 'https://hub.vd/#/m/lich-tac-nghiep?rec=recLich1&mo=trao-doi');
    assert.ok(the.header.title.content.includes('Hòn Thơm'));
    const than = the.elements.find((e) => e.tag === 'div').text.content;
    assert.ok(than.length < 640, 'tin dài phải cắt bớt');
  });

  console.log('\n  ' + so + ' pass · ' + hong + ' fail');
})();
