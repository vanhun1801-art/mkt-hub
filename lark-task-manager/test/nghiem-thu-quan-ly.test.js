'use strict';
// Thực thi endpoint và bộ lọc thật với dữ liệu giả, không kết nối Lark.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const fe = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const fn = (src, name) => {
  const at = src.search(new RegExp('(?:async )?function ' + name + '\\('));
  assert(at >= 0, name);
  return src.slice(at, src.indexOf('\n}', at) + 2);
};
const tasks = [
  { id: 'mine', requester: [{ id: 'me', name: 'Tôi' }], status: 'Đang tiến hành' },
  { id: 'other', requester: [{ id: 'other', name: 'Người order khác' }], status: 'Trễ deadline', daGiaiQuyet: true, deadline: '2026-01-01' },
  { id: 'working', requester: [{ id: 'other' }], status: 'Đang tiến hành' },
  { id: 'closed', requester: [{ id: 'other' }], status: 'Hoàn thành', daGiaiQuyet: true },
  { id: 'cancelled', requester: [{ id: 'other' }], status: 'Hủy', daGiaiQuyet: true },
];
const start = sv.indexOf("  if (p === '/api/my-orders' && req.method === 'GET') {");
const end = sv.indexOf("  if (p === '/api/tasks' && req.method === 'POST')", start);
async function orders({ manager = false, guest = false, query = '?nghiemThu=1', me = { id: 'me' } } = {}) {
  const ctx = vm.createContext({ p: '/api/my-orders', req: { method: 'GET' }, res: {},
    url: new URL('http://test/api/my-orders' + query), whoAmI: async () => me,
    getRecords: async () => tasks, toTask: t => t, ganTienDoCon: t => t,
    laKhach: () => guest, isManager: async () => manager,
    DONG_HAN: ['Hoàn thành', 'Hủy'], cache: { at: 1 },
    json: (_res, data) => data,
    LP: { docHet: async () => [], lienQuan: () => [] }, lark: {},
  });
  return vm.runInContext('(async () => {\n' + sv.slice(start, end) + '\n})()', ctx);
}
test('Quản lý thấy việc do người khác giao đã nộp, kể cả quá hạn cũ; không lẫn việc đóng/chưa nộp', async () => {
  assert.deepEqual(Array.from((await orders({ manager: true })).tasks, t => t.id), ['mine', 'other']);
});
test('Nhân sự, quyền chỉ xem toàn bộ và khách không được mở thêm phạm vi nghiệm thu', async () => {
  for (const options of [{}, { guest: true }, { guest: true, manager: true }]) {
    assert.deepEqual(Array.from((await orders(options)).tasks, t => t.id), ['mine']);
  }
});
test('Giữ tương thích endpoint cũ, order liên phòng, và không trả dữ liệu khi chưa xác định danh tính', async () => {
  assert.deepEqual(Array.from((await orders({ manager: true, query: '' })).tasks, t => t.id), ['mine']);
  assert.deepEqual(Array.from((await orders({ manager: true, query: '?nghiemThu=1&lienPhong=1' })).tasks, t => t.id), ['mine', 'other']);
  assert.equal((await orders({ manager: true, me: null })).tasks.length, 0);
});
test('Bộ lọc tách việc mình order với hàng chờ toàn phòng, tìm theo người order', () => {
  const S = { orders: tasks, meta: { me: { id: 'me' } }, isManager: true, orderScope: 'mine', of: {}, filters: {} };
  const ctx = vm.createContext({ S, isClosed: t => ['Hoàn thành', 'Hủy'].includes(t.status) });
  vm.runInContext(fn(fe, 'filterOrders'), ctx);
  assert.deepEqual(Array.from(ctx.filterOrders(), t => t.id), ['mine']);
  S.orderScope = 'review';
  assert.deepEqual(Array.from(ctx.filterOrders(), t => t.id), ['other']);
  S.filters.q = 'người order khác';
  assert.equal(ctx.filterOrders().length, 1);
  S.filters.q = 'không tồn tại'; assert.equal(ctx.filterOrders().length, 0);
  S.filters.q = ''; S.isManager = false;
  assert.deepEqual(Array.from(ctx.filterOrders(), t => t.id), ['mine']);
});

const actionStart = sv.indexOf('  const mAct = p.match(');
const actionEnd = sv.indexOf('  /* ---- báo cáo tổng quan', actionStart);
async function action(manager, requester, method) {
  const record = { ...tasks[1], id: 'recOther', record_id: 'recOther', linkKetQua: 'https://example.com/product', owner: [{ id: 'editor' }] };
  let written;
  const response = {};
  const ctx = vm.createContext({ p: '/api/tasks/recOther/' + method,
    req: { method: 'POST' }, res: response, url: new URL('http://test/'),
    getRecords: async () => [record], toTask: t => t,
    isManager: async () => manager, whoAmI: async () => ({ id: requester ? 'other' : 'me' }),
    ownedBy: (t, id) => t.owner.some(u => u.id === id),
    json: (_r, data, status = 200) => Object.assign(response, { data, status }),
    readBody: async () => ({ note: 'Cần sửa nội dung' }),
    cfg: { chanHoanThanhKhiTre: true, proofRequiredFor: 'Hoàn thành' },
    lark: { updateRecord: async (_id, patch) => { written = patch; } },
    toCells: t => t, applyLocal: Object.assign, baoTin: () => {},
    XD: '\n', duoiTin: () => '', laTreTheoHan: () => true,
    themVaoBaoCao: async () => ({}),
  });
  vm.runInContext(fn(sv, 'laNguoiOrder') + '\n' + fn(sv, 'requireOwnTask'), ctx);
  await vm.runInContext('(async () => {\n' + sv.slice(actionStart, actionEnd) + '\n})()', ctx);
  return { ...response, written };
}
for (const method of ['complete', 'tra-ve']) {
  test('Quản lý nghiệm thu việc người khác giao: ' + method, async () => {
    const r = await action(true, false, method);
    assert.equal(r.status, 200);
    assert.equal(r.written.status, method === 'complete' ? 'Hoàn thành' : 'Làm lại');
    if (method === 'tra-ve') { assert.equal(r.written.daGiaiQuyet, false); assert.equal(r.written.note, 'Cần sửa nội dung'); }
  });
  test('Người order vẫn nghiệm thu được; người không liên quan bị chặn: ' + method, async () => {
    assert.equal((await action(false, true, method)).status, 200);
    const denied = await action(false, false, method);
    assert.equal(denied.status, 403); assert.equal(denied.written, undefined);
  });
}
