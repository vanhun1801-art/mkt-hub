/**
 * Luật "thả vào được hay không" của việc kéo gom, và trần 3 cấp (27/10/2026).
 *
 * nhanConDuoc() bên giao diện là BẢN CHIẾU của canhDoiCha() bên máy chủ. Máy
 * chủ vẫn là nơi chặn thật, nhưng hai bên lệch nhau thì viền xanh mọc ở chỗ
 * thả vào sẽ bị từ chối — người dùng kéo xong mới ăn lỗi. Bài này cột hai bên
 * lại với nhau, kể cả con số 3.
 *
 * Không dựng được DOM nên lấy thẳng mã nguồn mấy hàm đó ra chạy thật, chứ
 * không chép lại luật sang đây — chép lại thì bài luôn xanh dù app đã đổi.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const SV = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

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

/**
 * Dựng bản sao các hàm với trạng thái S giả.
 * `ds` là toàn bộ việc đang có — chính là thứ S.tasks giữ trong app.
 */
function dung(ds, them) {
  const S = Object.assign({
    isManager: true, viewAs: null, tasks: ds, orders: [],
    perm: { chiaViec: true, taoMoi: true }, meta: { me: { id: 'u1' } },
  }, them || {});
  const ma = [
    layDong('const idCha ='),
    layDong('const CAP_TOI_DA ='),
    layHam('moiViec'),
    layHam('capCuaViec'),
    layHam('caoCuaViec'),
    layHam('namDuoiViec'),
    layHam('chiaDuoc'),
    layHam('keoGomDuoc'),
    layHam('nhacDiDuoc'),
    layHam('nhanConDuoc'),
    layHam('viSaoKhongNhan'),
    'return { CAP_TOI_DA, capCuaViec, caoCuaViec, namDuoiViec, chiaDuoc,'
      + ' keoGomDuoc, nhacDiDuoc, nhanConDuoc, viSaoKhongNhan };',
  ].join('\n');
  return new Function('S', ma)(S);
}

const viec = (id, cha, them) =>
  Object.assign({ id, title: id, parent: cha ? [cha] : [], status: 'Đang làm' }, them || {});

/* Một cây ba cấp có sẵn: A1 › B1 › C1, cạnh đó A2 (gốc trơ) và B2 (con của A1). */
const CAY = [viec('A1'), viec('A2'), viec('B1', 'A1'), viec('B2', 'A1'), viec('C1', 'B1')];
const o = (ds, id) => ds.find((x) => x.id === id);

test('trần là 3 cấp, và giao diện với máy chủ cùng một con số', () => {
  const f = dung(CAY);
  assert.strictEqual(f.CAP_TOI_DA, 3);
  const m = /const CAP_TOI_DA = (\d+);/.exec(SV);
  assert.ok(m, 'server.js không còn CAP_TOI_DA');
  assert.strictEqual(Number(m[1]), f.CAP_TOI_DA, 'hai bên lệch số cấp');
});

test('đếm đúng cấp của từng việc trong cây', () => {
  const f = dung(CAY);
  assert.strictEqual(f.capCuaViec(o(CAY, 'A1')), 1);
  assert.strictEqual(f.capCuaViec(o(CAY, 'B1')), 2);
  assert.strictEqual(f.capCuaViec(o(CAY, 'C1')), 3);
});

test('đếm đúng độ dày của nhánh dưới mỗi việc', () => {
  const f = dung(CAY);
  assert.strictEqual(f.caoCuaViec(o(CAY, 'A1')), 3);
  assert.strictEqual(f.caoCuaViec(o(CAY, 'B1')), 2);
  assert.strictEqual(f.caoCuaViec(o(CAY, 'C1')), 1);
});

test('việc đồng cấp: thả vào nhau thì cái được thả vào thành việc lớn', () => {
  const f = dung(CAY);
  // hai việc gốc
  assert.strictEqual(f.nhanConDuoc(o(CAY, 'A2'), o(CAY, 'A1')), false, 'A1 dày 3 cấp, không lọt');
  const phang = [viec('X'), viec('Y')];
  const g = dung(phang);
  assert.strictEqual(g.nhanConDuoc(o(phang, 'X'), o(phang, 'Y')), true);
  // hai việc con cùng một cha: B2 thả vào B1 -> B2 thành cấp 3
  const f2 = dung([viec('A1'), viec('B1', 'A1'), viec('B2', 'A1')]);
  const ds2 = [viec('A1'), viec('B1', 'A1'), viec('B2', 'A1')];
  assert.strictEqual(f2.nhanConDuoc(o(ds2, 'B1'), o(ds2, 'B2')), true);
});

test('cấp 3 là hết — không thả thêm gì vào việc đã ở cấp 3', () => {
  const f = dung(CAY);
  assert.strictEqual(f.nhanConDuoc(o(CAY, 'C1'), o(CAY, 'A2')), false);
  assert.match(f.viSaoKhongNhan(o(CAY, 'C1'), o(CAY, 'A2')), /cấp 4, quá 3/);
  assert.strictEqual(f.chiaDuoc(o(CAY, 'C1')), false, 'cấp 3 cũng không chia tay được');
});

test('việc cấp 2 vẫn chia tiếp được — khác hẳn luật một tầng cũ', () => {
  const f = dung(CAY);
  assert.strictEqual(f.chiaDuoc(o(CAY, 'B1')), true);
  assert.strictEqual(f.nhanConDuoc(o(CAY, 'B2'), o(CAY, 'A2')), true);
});

test('kéo cả một nhánh thì nhánh đó phải lọt vừa chỗ mới', () => {
  const f = dung(CAY);
  // B1 dày 2 cấp: thả vào A2 (cấp 1) thì thành 3 cấp -> được
  assert.strictEqual(f.nhanConDuoc(o(CAY, 'A2'), o(CAY, 'B1')), true);
  // B1 thả vào B2 (cấp 2) thì thành 4 cấp -> không
  assert.strictEqual(f.nhanConDuoc(o(CAY, 'B2'), o(CAY, 'B1')), false);
  assert.match(f.viSaoKhongNhan(o(CAY, 'B2'), o(CAY, 'B1')), /nhánh sẽ thành 4 cấp/);
});

test('việc có con vẫn nhấc đi được, chỉ là kén chỗ', () => {
  const f = dung(CAY);
  assert.strictEqual(f.nhacDiDuoc(o(CAY, 'B1')), true);
});

test('không thả một việc vào việc con của chính nó', () => {
  const f = dung(CAY);
  assert.strictEqual(f.namDuoiViec('C1', 'A1'), true);
  assert.strictEqual(f.nhanConDuoc(o(CAY, 'C1'), o(CAY, 'A1')), false);
  assert.strictEqual(f.nhanConDuoc(o(CAY, 'B1'), o(CAY, 'A1')), false);
});

test('tự làm cha của chính mình — không', () => {
  const f = dung(CAY);
  assert.strictEqual(f.nhanConDuoc(o(CAY, 'A1'), o(CAY, 'A1')), false);
});

test('đã nằm sẵn trong việc đó — không thả lại', () => {
  const f = dung(CAY);
  assert.strictEqual(f.nhanConDuoc(o(CAY, 'A1'), o(CAY, 'B1')), false);
  assert.strictEqual(f.viSaoKhongNhan(o(CAY, 'A1'), o(CAY, 'B1')), 'Đã nằm trong việc này');
});

test('việc liên phòng: không nhận con, cũng không nhấc đi được', () => {
  const ds = [viec('A1', '', { lienPhong: true }), viec('A2'), viec('A3', '', { lienPhong: true })];
  const f = dung(ds);
  assert.strictEqual(f.nhanConDuoc(o(ds, 'A1'), o(ds, 'A2')), false);
  assert.strictEqual(f.nhanConDuoc(o(ds, 'A2'), o(ds, 'A3')), false);
  assert.strictEqual(f.nhacDiDuoc(o(ds, 'A3')), false);
});

test('việc đã huỷ và việc nháp đều nằm ngoài', () => {
  const ds = [viec('A1', '', { status: 'Hủy' }), viec('A2'), viec('A3', '', { isNew: true })];
  const f = dung(ds);
  assert.strictEqual(f.nhanConDuoc(o(ds, 'A1'), o(ds, 'A2')), false);
  assert.strictEqual(f.nhanConDuoc(o(ds, 'A2'), o(ds, 'A3')), false);
  assert.strictEqual(f.nhacDiDuoc(o(ds, 'A1')), false);
});

test('đang xem vai người khác thì không kéo gì được', () => {
  const f = dung(CAY, { viewAs: { id: 'u9' } });
  assert.strictEqual(f.keoGomDuoc(), false);
  assert.strictEqual(f.nhacDiDuoc(o(CAY, 'A2')), false);
});

test('nhân sự có quyền chia việc thì kéo gom được, không quyền thì không', () => {
  const co = dung(CAY, { isManager: false, perm: { chiaViec: true, taoMoi: true } });
  assert.strictEqual(co.keoGomDuoc(), true);
  const khong = dung(CAY, { isManager: false, perm: { chiaViec: false, taoMoi: false } });
  assert.strictEqual(khong.keoGomDuoc(), false);
});

test('dữ liệu Base thành vòng tròn thì không treo, chỉ là không thả được', () => {
  const ds = [viec('A', 'B'), viec('B', 'A'), viec('C')];
  const f = dung(ds);
  assert.ok(f.capCuaViec(o(ds, 'A')) > 3, 'vòng tròn phải bị coi là quá sâu');
  assert.strictEqual(f.nhanConDuoc(o(ds, 'A'), o(ds, 'C')), false);
  assert.ok(f.caoCuaViec(o(ds, 'A')) <= 4, 'đếm độ dày cũng phải dừng');
});

test('lý do từ chối luôn là một câu có chữ, không lọt biến rỗng', () => {
  const f = dung(CAY);
  const cap = [
    [o(CAY, 'C1'), o(CAY, 'A2')],
    [o(CAY, 'B2'), o(CAY, 'B1')],
    [o(CAY, 'A1'), o(CAY, 'B1')],
    [o(CAY, 'C1'), o(CAY, 'A1')],
  ];
  for (const [cha, con] of cap) {
    const chu = f.viSaoKhongNhan(cha, con);
    assert.ok(typeof chu === 'string' && chu.length > 4, 'thiếu lý do');
    assert.ok(!/undefined|null|NaN/.test(chu), 'lý do lọt biến rỗng: ' + chu);
  }
});

test('máy chủ giữ đủ các luật mà giao diện đang chiếu', () => {
  const i = SV.indexOf('async function canhDoiCha(');
  assert.ok(i > 0, 'server.js không còn canhDoiCha — giao diện đang chiếu một luật không tồn tại');
  const than = SV.slice(i, i + 3200);
  for (const ma of ['TU_LAM_CHA', 'VONG_TRON', 'QUA_SAU', 'CHA_LIEN_PHONG', 'KHONG_THAY_CHA']) {
    assert.ok(than.includes(ma), 'máy chủ mất luật ' + ma);
  }
  for (const ham of ['function banDoCha(', 'function capCua(', 'function caoCua(', 'function namDuoi(']) {
    assert.ok(SV.includes(ham), 'máy chủ mất hàm đếm tầng: ' + ham);
  }
});

test('nhánh TẠO việc con cũng canh theo cấp, không canh "đã là con"', () => {
  assert.ok(/capCua\(idCha, banDoCha\(dsTatCa\)\) >= CAP_TOI_DA/.test(SV),
    'nhánh POST chưa canh theo cấp');
  assert.ok(!/đã là việc con, không chia tiếp được nữa/.test(SV),
    'vẫn còn câu chặn một tầng cũ ở nhánh POST');
});

test('đường ghi vẫn đi qua PATCH parent, không ghi thẳng Base', () => {
  const i = SRC.indexOf('async function gomVaoViec(');
  assert.ok(i > 0, 'không còn gomVaoViec');
  const than = SRC.slice(i, i + 900);
  assert.ok(/method: 'PATCH'/.test(than), 'không còn gọi PATCH');
  assert.ok(/JSON\.stringify\(\{ parent:/.test(than), 'body phải là chuỗi JSON có parent');
  assert.ok(/loadAll\(true\)/.test(than), 'ghi xong phải tải lại từ Base, không tin số cũ');
});

test('mũi tên đầu tên việc con vẽ theo cấp', () => {
  const i = SRC.indexOf('function veTen(');
  assert.ok(i > 0, 'không còn veTen');
  const than = SRC.slice(i, i + 1200);
  assert.ok(/'↳'\.repeat\(/.test(than), 'mũi tên không còn nhân theo cấp');
  assert.ok(/capCuaViec\(t\)/.test(than), 'veTen không hỏi cấp');
});
