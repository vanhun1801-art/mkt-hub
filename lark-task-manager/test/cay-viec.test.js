/**
 * Cây việc trong danh sách và nút thu gọn (27/10/2026).
 *
 * Anh Hùng: "cần chỉnh đầu tiên là cách sắp xếp, sau đó cho phép thu gọn task
 * lớn lại dễ nhìn". Hai luật phải giữ được:
 *   - việc con ngồi liền dưới việc lớn, kể cả khi trạng thái của nó thuộc làn
 *     khác (lúc đó thẻ mang thêm nhãn ghi làn thật);
 *   - gấp một việc lớn thì cả nhánh biến mất, KHÔNG rơi xuống cuối làn.
 *
 * Lỗi rơi xuống cuối làn đã xảy ra thật khi làm: vòng vét cuối xepCay() tưởng
 * nhánh đang gấp là việc bị bỏ sót. Bài này cột đúng chỗ đó lại.
 *
 * Lấy thẳng mã nguồn các hàm trong public/app.js ra chạy, không chép luật sang
 * đây — chép lại thì bài vẫn xanh dù app đã đổi.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

/** Cắt mã nguồn một hàm theo tên, đếm ngoặc để biết chỗ kết thúc. */
function layHam(ten) {
  const i = SRC.indexOf('function ' + ten + '(');
  assert.ok(i >= 0, 'không thấy hàm ' + ten + ' trong public/app.js');
  const sau = SRC.indexOf('{', i);
  let m = 0;
  for (let j = sau; j < SRC.length; j++) {
    if (SRC[j] === '{') m++;
    else if (SRC[j] === '}') { m--; if (!m) return SRC.slice(i, j + 1); }
  }
  throw new Error('không đóng ngoặc: ' + ten);
}

function layDong(dau) {
  const d = SRC.split('\n').find((x) => x.startsWith(dau));
  assert.ok(d, 'không thấy dòng bắt đầu bằng: ' + dau);
  return d;
}

/* Việc giả: cha A1 có con B1, B2; B1 có con C1. A2 đứng riêng. */
function cay() {
  const v = (id, cha, them) => Object.assign({
    id, title: id, parent: cha ? [cha] : [], status: 'Đang tiến hành',
    owner: [{ id: 'u1' }], helper: [], deadline: '2026-11-0' + id.slice(-1) + 'T03:00:00Z',
  }, them || {});
  return [v('A1'), v('A2'), v('B1', 'A1'), v('B2', 'A1'), v('C1', 'B1')];
}

function dung(ds, gap) {
  const S = { tasks: ds, orders: [], thuTuCon: {}, gapViec: gap || {}, meta: { me: { id: 'u1' } } };
  const ma = [
    layDong('const idCha ='),
    layHam('parseDate'),
    layHam('daysLeft'),
    layHam('laneOf'),
    layHam('laneSort'),
    layHam('xepTheoThuTuCon'),
    layHam('theGoc'),
    layHam('xepCay'),
    'return { laneOf, theGoc, xepCay, S };',
  ].join('\n');
  return new Function('S', ma)(S);
}

/** Rút gọn kết quả thành "cấp:id" cho dễ đọc khi bài đỏ. */
const tom = (ra) => ra.map((o) => o.cap + ':' + o.t.id);

test('việc con nằm liền dưới việc lớn, không rải theo hạn', () => {
  const ds = cay();
  /* Cho B2 hạn sớm nhất: danh sách phẳng kiểu cũ sẽ đẩy nó lên đầu làn, tách
   * khỏi cha. Cây thì phải giữ nó dưới A1. */
  ds.find((x) => x.id === 'B2').deadline = '2026-01-01T03:00:00Z';
  const { xepCay } = dung(ds);
  assert.deepStrictEqual(tom(xepCay(ds)), ['1:A1', '2:B2', '2:B1', '3:C1', '1:A2']);
});

test('thứ tự anh tự kéo thắng thứ tự theo hạn', () => {
  const ds = cay();
  const api = dung(ds);
  api.S.thuTuCon = { A1: ['B2', 'B1'] };
  assert.deepStrictEqual(tom(api.xepCay(ds)), ['1:A1', '2:B2', '2:B1', '3:C1', '1:A2']);
});

test('gấp việc lớn thì cả nhánh biến mất, không rơi xuống cuối làn', () => {
  const ds = cay();
  const { xepCay } = dung(ds, { A1: true });
  const ra = tom(xepCay(ds));
  assert.deepStrictEqual(ra, ['1:A1', '1:A2']);
  for (const id of ['B1', 'B2', 'C1']) {
    assert.ok(!ra.some((x) => x.endsWith(':' + id)), id + ' phải ẩn, không được rơi xuống cuối');
  }
});

test('gấp ở cấp giữa chỉ giấu nhánh dưới nó', () => {
  const ds = cay();
  const { xepCay } = dung(ds, { B1: true });
  assert.deepStrictEqual(tom(xepCay(ds)), ['1:A1', '2:B1', '2:B2', '1:A2']);
});

test('soCon chỉ đếm con đang hiện, để thẻ không mang nút gấp rỗng', () => {
  const ds = cay();
  const { xepCay } = dung(ds);
  const theo = new Map(xepCay(ds).map((o) => [o.t.id, o.soCon]));
  assert.strictEqual(theo.get('A1'), 2);
  assert.strictEqual(theo.get('B1'), 1);
  assert.strictEqual(theo.get('A2'), 0);
  /* Chỉ đưa vào A1 và A2: B1 vắng mặt thì A1 không còn con nào để gấp. */
  const hep = ds.filter((x) => x.id === 'A1' || x.id === 'A2');
  assert.strictEqual(xepCay(hep).find((o) => o.t.id === 'A1').soCon, 0);
});

test('cha không hiện ra thì con tự đứng làm gốc', () => {
  const ds = cay();
  const { theGoc, xepCay } = dung(ds);
  const chiCon = ds.filter((x) => x.id !== 'A1');
  /* B1 hạn sớm nhất nên lên đầu, C1 vẫn nép dưới nó; A2 và B2 cùng hạn. */
  assert.deepStrictEqual(tom(xepCay(chiCon)), ['1:B1', '2:C1', '1:A2', '1:B2']);
  /* Cha bị Hủy cũng vậy: laneOf() trả null nên nó không hiện, con không nép được. */
  ds.find((x) => x.id === 'A1').status = 'Hủy';
  const hien = new Map(ds.map((t) => [t.id, t]));
  assert.strictEqual(theGoc(ds.find((x) => x.id === 'B1'), hien, 'u1').id, 'B1');
});

test('con khác trạng thái vẫn nép theo cha, và theGoc leo tới tận gốc', () => {
  const ds = cay();
  ds.find((x) => x.id === 'C1').status = 'Trễ deadline';
  const { theGoc, laneOf } = dung(ds);
  const hien = new Map(ds.map((t) => [t.id, t]));
  const c1 = ds.find((x) => x.id === 'C1');
  assert.strictEqual(laneOf(c1, 'u1'), 'late');          // làn thật của nó
  assert.strictEqual(theGoc(c1, hien, 'u1').id, 'A1');   // nhưng ngồi theo gốc
  assert.strictEqual(laneOf(theGoc(c1, hien, 'u1'), 'u1'), 'doing');
});

test('vòng tròn cha–con không treo trang và không nuốt mất việc', () => {
  /* Base không canh gì nên A→B→A là dữ liệu ghi được. Phải vẽ ra hết, kể cả
   * khi không có gốc nào với tới. */
  const ds = cay();
  ds.find((x) => x.id === 'A1').parent = ['C1'];
  const { theGoc, xepCay } = dung(ds);
  const hien = new Map(ds.map((t) => [t.id, t]));
  assert.ok(theGoc(ds.find((x) => x.id === 'C1'), hien, 'u1'));  // không treo
  const ra = xepCay(ds);
  assert.strictEqual(ra.length, ds.length, 'mọi việc phải còn trên màn hình');
  for (const t of ds) assert.ok(ra.some((o) => o.t.id === t.id), t.id + ' bị nuốt mất');
});

test('chỗ vẽ dùng xepCay và nhớ nút gấp vào máy', () => {
  const r = layHam('renderLanes');
  assert.ok(/xepCay\(groups\[def\.key\]\)/.test(r), 'renderLanes phải xếp cây, không còn laneSort phẳng');
  assert.ok(/theGoc\(t, hien, who\)/.test(r), 'thẻ phải ngồi theo làn của việc lớn ngoài cùng');
  const g = layHam('nutGap');
  assert.ok(/luuGapViec\(\)/.test(g), 'gấp xong phải nhớ lại, không thì tải trang là bung hết');
  assert.ok(/aria-expanded/.test(g), 'nút gấp phải khai trạng thái cho trình đọc màn hình');
  const tc = layHam('theTrongCay');
  assert.ok(/tag-lan/.test(tc), 'con ngồi nhờ làn khác phải có nhãn ghi làn thật');
  assert.ok(/workCard\(o\.t, laneThat \|\| laneKey\)/.test(tc),
    'nút trên thẻ phải theo trạng thái thật, không theo làn nó ngồi');
});

test('đánh dấu con cuối nhánh, để vạch nối biết chỗ dừng', () => {
  const ds = cay();
  const { xepCay } = dung(ds);
  const theo = new Map(xepCay(ds).map((o) => [o.t.id, o.cuoi]));
  /* A1 có B1, B2 — B2 là con cuối. B1 có mỗi C1 nên C1 cũng là con cuối. */
  assert.strictEqual(theo.get('B2'), true, 'B2 là con cuối của A1');
  assert.strictEqual(theo.get('C1'), true, 'C1 là con cuối của B1');
  assert.strictEqual(theo.get('B1'), false, 'B1 còn B2 đứng sau');
  assert.strictEqual(theo.get('A1'), false, 'việc gốc không phải con của ai');
});
