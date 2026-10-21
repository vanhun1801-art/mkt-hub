'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../nhac-nghiem-thu');
const now = Date.parse('2026-10-22T08:00:00+07:00');
const pending = { id: 'recPending', title: 'Video mới', status: 'Trễ deadline', daGiaiQuyet: true, ngayGiaiQuyet: '2026-10-20T09:00:00+07:00', requester: [{ id: 'hung', name: 'Hùng' }, { id: 'other', name: 'Khác' }], owner: [{ id: 'editor', name: 'Editor' }], deadline: '2026-10-20T17:00:00+07:00' };
const working = { ...pending, id: 'recWorking', daGiaiQuyet: false };
function fixture(cfg = { mode: 'pilot', pilot: { id: 'hung', name: 'Hùng' } }) {
  let settings = cfg; let time = now; let tasks = [pending, working];
  const marks = new Set(), sent = [];
  let fail = false;
  const store = { read: async () => settings, write: async s => { settings = s; }, has: async k => marks.has(k), mark: async k => marks.add(k) };
  const dep = { store, now: () => time, url: 'https://hub.example', getTasks: async () => tasks,
    send: async r => { if (fail) throw new Error('Lark 403'); sent.push(r); return { ok: true, msgId: 'om123' }; }, log: () => {} };
  const service = N.create(dep);
  return { service, dep, sent, marks, setTime: t => { time = Date.parse(t); }, setTasks: t => { tasks = t; }, setFail: t => { fail = t; }, settings: () => settings };
}
test('Lọc nghiệm thu chỉ việc đã nộp còn mở, bỏ bản nháp/hủy/hoàn thành/liên phòng', () => {
  assert(N.choDuyet(pending)); assert(!N.choDuyet(working));
  for (const status of ['Hoàn thành', 'Hủy', 'Nháp']) assert(!N.choDuyet({ ...pending, status }));
  assert(!N.choDuyet({ ...pending, lienPhong: true }));
});
test('Thông báo nộp sản phẩm: pilot chỉ đúng người order thử; chống trùng', async () => {
  const f = fixture();
  await f.service.submission(pending); await f.service.submission(pending);
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].userId, 'hung');
  assert.match(JSON.stringify(f.sent[0].card), /Xem sản phẩm & nghiệm thu/);
  assert.match(JSON.stringify(f.sent[0].card), /mo=nghiem-thu&rec=recPending/);
  await f.service.submission({ ...pending, id: 'new', requester: [{ id: 'other' }] });
  assert.equal(f.sent.length, 1);
});
test('Lượt nộp lại sau chỉnh sửa có thể báo tiếp, không bị dấu lượt cũ chặn', async () => {
  const f = fixture();
  await f.service.submission({ ...pending, nhacVong: 1 });
  await f.service.submission({ ...pending, nhacVong: 2 });
  assert.equal(f.sent.length, 2);
});
test('Chưa bật hoặc tắt thì không tự gửi; chế độ triển khai mới gửi từng người order', async () => {
  for (const mode of ['off', 'pilot']) {
    const f = fixture({ mode, pilot: null }); await f.service.tick(); await f.service.submission(pending); assert.equal(f.sent.length, 0);
  }
  const f = fixture({ mode: 'all' }); await f.service.submission(pending);
  assert.deepEqual(f.sent.map(r => r.userId), ['hung', 'other']);
});
test('Nhắc 08:00 và 17:00 giờ VN, dấu gửi bền qua tạo lại service, không nhắc sau xử lý', async () => {
  const f = fixture();
  await f.service.tick(); await f.service.tick(); assert.equal(f.sent.length, 1);
  await N.create(f.dep).tick(); assert.equal(f.sent.length, 1);
  f.setTime('2026-10-22T17:00:00+07:00'); await f.service.tick(); assert.equal(f.sent.length, 2);
  f.setTasks([{ ...pending, status: 'Hoàn thành' }, { ...working, status: 'Làm lại' }]);
  f.setTime('2026-10-23T08:00:00+07:00'); await f.service.tick(); assert.equal(f.sent.length, 2);
});
test('Không nhắc đêm, không bù mốc sáng quá 30 phút, lỗi gửi không đánh dấu thành công', async () => {
  const f = fixture();
  for (const t of ['00:00', '07:59', '08:30', '16:59', '17:30', '23:59']) {
    f.setTime('2026-10-22T' + t + ':00+07:00'); await f.service.tick();
  }
  assert.equal(f.sent.length, 0);
  f.setTime('2026-10-22T08:01:00+07:00'); f.setFail(true); await f.service.tick(); assert.equal(f.marks.size, 0);
  f.setFail(false); await f.service.tick(); assert.equal(f.sent.length, 1);
});
test('Gửi 2 mẫu chỉ cho người đăng nhập, chọn pilot, retry không nhân đôi', async () => {
  const f = fixture({ mode: 'off' }); const me = { id: 'me', name: 'Tôi' };
  await f.service.demo(me, 'request-one'); await f.service.demo(me, 'request-one');
  assert.equal(f.sent.length, 2); assert(f.sent.every(r => r.userId === 'me'));
  assert.equal(f.settings().pilot.id, 'me'); assert.equal(f.settings().mode, 'pilot');
  assert.match(JSON.stringify(f.sent[0].card), /Hiện bạn không có việc/);
  assert.match(JSON.stringify(f.sent[1].card), /Việc cần làm/);
  await f.service.stop(); assert.equal(f.settings().mode, 'off');
});
test('Cảnh báo gắn hành động theo trạng thái, không nhắc thực hiện lại việc đã nộp', () => {
  const list = N.canhBao([pending, working, { ...working, id: 'done', status: 'Hoàn thành' }, { ...working, id: 'lateFuture', status: 'Đang tiến hành', deadline: '2027-01-01', deadline1: '' }], now);
  assert.equal(list.length, 2); assert.equal(list[0].t.id, 'recWorking');
  assert.match(list[0].action, /Nộp sản phẩm ngay/);
  assert.match(list[1].action, /Cập nhật tiến độ/);
});
test('Kho cấu hình/lịch nhắc dùng Base, không đụng các dòng dữ liệu khác', async () => {
  const rows = [{ recordId: 'logo', 'Ô': 'logo' }];
  const B = { docHet: async () => rows, tao: async cells => { const id = 'rec' + rows.length; rows.push({ recordId: id, ...cells }); return id; }, ghi: async (id, cells) => Object.assign(rows.find(r => r.recordId === id), cells) };
  const store = N.storage(B);
  assert.equal((await store.read()).pilot, null);
  await store.write({ mode: 'pilot', pilot: { id: 'hung' } }); assert.equal((await store.read()).pilot.id, 'hung');
  await store.mark('stamp'); assert(await store.has('stamp'));
  await store.write({ mode: 'off' }); assert.equal((await store.read()).mode, 'off');
  assert.equal(rows[0]['Ô'], 'logo'); assert.equal(rows.length, 3);
});
test('Mẫu thứ hai lỗi: báo lỗi, chưa bật pilot; thử lại chỉ gửi phần còn thiếu', async () => {
  const f = fixture({ mode: 'off' }); let attempt = 0;
  const service = N.create({ ...f.dep, send: async r => {
    attempt++;
    if (attempt === 2) throw new Error('mất kết nối');
    f.sent.push(r); return { ok: true };
  } });
  const me = { id: 'hung', name: 'Hùng' };
  await assert.rejects(service.demo(me, 'partial'), /mất kết nối/);
  assert.equal(f.sent.length, 1); assert.equal(f.settings().mode, 'off');
  await service.demo(me, 'partial'); assert.equal(f.sent.length, 2); assert.equal(f.settings().mode, 'pilot');
});

test('Endpoint gửi thử bắt buộc quản lý, lấy người nhận từ phiên và chỉ dùng POST để ghi/gửi', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const s = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const a = s.indexOf("  if (p === '/api/bot-nghiem-thu' && ['GET', 'POST'].includes(req.method)) {");
  const b = s.indexOf("  if (p === '/api/my-orders'", a);
  async function run({ manager = true, guest = false, method = 'POST' } = {}) {
    let delivered = null, preview = 0; const response = {};
    const ctx = vm.createContext({ p: '/api/bot-nghiem-thu', req: { method }, res: response,
      requireManager: async () => { if (!manager) Object.assign(response, { status: 403 }); return manager; },
      laKhach: () => guest, whoAmI: async () => ({ id: 'session-hung', name: 'Hùng' }),
      json: (_r, data, status = 200) => Object.assign(response, { status, data }),
      readBody: async () => ({ action: 'demo', requestId: 'valid-request-id-1234', userId: 'someone-else' }),
      botNghiemThu: { preview: async () => { preview++; return {}; }, demo: async me => { delivered = me.id; return { ok: true }; } },
    });
    await vm.runInContext('(async () => {\n' + s.slice(a, b) + '\n})()', ctx);
    return { response, delivered, preview };
  }
  assert.equal((await run()).delivered, 'session-hung');
  for (const options of [{ manager: false }, { guest: true }]) {
    const r = await run(options); assert.equal(r.response.status, 403); assert.equal(r.delivered, null);
  }
  const get = await run({ method: 'GET' }); assert.equal(get.preview, 1); assert.equal(get.delivered, null);
});

test('Cảnh báo nhanh ưu tiên kỳ hiện tại, tách tồn cũ khỏi danh sách hành động', () => {
  const old = { ...working, id: 'recMay', deadline: '2026-05-01T17:00:00+07:00' };
  const data = [old, working];
  assert.equal(N.canhBao(data, now)[0].t.id, working.id);
  const card = JSON.stringify(N.theCanhBao(data, 'https://hub.example', now));
  assert.match(card, /1 việc trễ trong tháng/);
  assert.match(card, /Tồn cũ cần rà soát: 1/);
  assert(!card.includes('recMay'));
});
