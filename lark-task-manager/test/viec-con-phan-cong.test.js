'use strict';
// Chạy luồng tạo nhanh và endpoint với Lark giả, không ghi dữ liệu thật.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cfg = require('../config');
const PP = require('../phanphoi');
const root = path.join(__dirname, '..');
const fe = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const sv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const fn = (src, name) => {
  const start = src.search(new RegExp('(?:async )?function ' + name + '\\('));
  assert(start >= 0, name);
  return src.slice(start, src.indexOf('\n}', start) + 2);
};
/* Nhánh POST canh số cấp (tối đa 3, 27/10/2026) nên cần mấy hàm đếm tầng.
 * Lấy mã thật của server.js ra chạy chứ không viết hàm giả — hàm giả thì bài
 * này vẫn xanh dù luật 3 cấp bên kia đã hỏng. */
const TANG = vm.runInNewContext(
  sv.slice(sv.indexOf('const CAP_TOI_DA ='), sv.indexOf('/**\n * Canh một lần DỜI'))
  + '\n({ CAP_TOI_DA, banDoCha, capCua, caoCua, namDuoi })', {});

const cha = { id: 'cha', title: 'Việc lớn', owner: [{ id: 'nguoi-lam' }],
  helper: [], parent: [], workType: 'Content', priority: 'Cao',
  campaign: 'Operate', deadline1: '2026-11-01T10:00:00Z' };
let pass = 0;
function check(name, cb) { cb(); pass++; console.log('  PASS ' + name); }

(async () => {
  for (const manager of [true, false]) {
    const S = { isManager: manager, tasks: [], meta: { me: { id: 'toi', name: 'Tôi' }, people: [] } };
    const ctx = vm.createContext({ S, req: async (_url, options) => {
      assert.equal(options.method, 'POST');
      assert.equal(JSON.parse(options.body).owner, undefined);
      return { id: 'con' };
    } });
    vm.runInContext(fn(fe, 'taoNhanhViecCon') + '\n' + fn(fe, 'ganViecConMoi'), ctx);
    const { kq, body } = await ctx.taoNhanhViecCon(cha, 'Việc con mới');
    ctx.ganViecConMoi(cha, kq, body);
    check('Enter không kế thừa hoặc tự gán người làm (' + manager + ')', () => {
      assert.equal(S.tasks[0].owner.length, 0);
      assert.equal(S.tasks[0].parent[0], cha.id);
      assert.equal(S.tasks[0].title, 'Việc con mới');
    });
  }

  const start = sv.indexOf("  if (p === '/api/tasks' && req.method === 'POST') {");
  const end = sv.indexOf('  /* ---------------- NHÁP', start);
  const toCells = vm.runInNewContext('(' + fn(sv, 'toCells') + ')', {
    F: cfg.fields, chuoiGioVN: (d) => d.toISOString(),
  });
  async function post(manager, owner, them = {}) {
    const body = { title: 'Việc con mới', parent: ['cha'] };
    if (owner) body.owner = owner;
    let written;
    const context = vm.createContext(Object.assign({}, TANG, {
      p: '/api/tasks', req: { method: 'POST' }, res: {},
      readBody: async () => body, whoAmI: async () => ({ id: them.toi || 'nguoi-lam' }),
      isManager: async () => manager, khongDuocTao: () => !!them.khongTao, cfg,
      laKhach: () => !!them.khach, visibleFor: async (ts) => (them.khongThay ? [] : ts),
      getRecords: async () => [{ ...cha, record_id: cha.id }], toTask: (r) => r,
      toCells, cache: { at: 1 }, baoTin: () => {}, XD: '\n', duoiTin: () => '',
      json: (_res, data, status = 200) => ({ data, status }),
      lark: { createRecord: async (cells) => {
        written = cells; return { record_id_list: ['con'] };
      } },
    }));
    const response = await vm.runInContext('(async () => {\n' + sv.slice(start, end) + '\n})()', context);
    return { response, written };
  }
  for (const manager of [true, false]) {
    const { response, written } = await post(manager);
    check('Server tạo việc con chưa phân công (' + manager + ')', () => {
      assert.equal(response.status, 200);
      assert.equal(response.data.id, 'con');
      assert.equal(written[cfg.fields.owner.name], undefined);
      assert.equal(written[cfg.fields.parent.name][0].id, 'cha');
    });
  }
  /* 26/10/2026, anh Hùng: việc con mở cho tất cả người trong phòng. */
  const nguoiKhac = await post(false, null, { toi: 'nguoi-khac' });
  check('Nhân sự không có tên trong việc lớn vẫn chia được (xem được là chia được)', () => {
    assert.equal(nguoiKhac.response.status, 200);
  });
  const tatTao = await post(false, null, { toi: 'nguoi-khac', khongTao: true });
  check('Bị tắt "Được tạo mới" vẫn thêm được việc con', () => {
    assert.equal(tatTao.response.status, 200);
  });
  const khongThay = await post(false, null, { toi: 'nguoi-khac', khongThay: true });
  check('Không xem được việc lớn thì không chia', () => {
    assert.equal(khongThay.response.status, 403);
  });
  const khach = await post(false, null, { toi: 'khach', khach: true });
  check('Khách công ty vẫn chỉ chia việc có tên mình', () => {
    assert.equal(khach.response.status, 403);
  });
  const explicit = await post(true, [{ id: 'da-chon' }]);
  check('Quản lý vẫn chọn người làm qua form thường được', () => {
    assert.equal(explicit.written[cfg.fields.owner.name][0].id, 'da-chon');
  });

  const conf = { chung: { bat: true, phut: 0, trangThai: ['Chờ tiếp nhận'] },
    luong: [{ loai: 'Content', bat: true, cach: 'tai', phut: 0 }],
    nguoi: [{ loai: 'Content', id: 'auto', ten: 'Auto', trongSo: 100 }] };
  const con = { id: 'con', parent: ['cha'], owner: [], workType: 'Content', status: 'Chờ tiếp nhận' };
  const regular = { ...con, id: 'thuong', parent: [] };
  const now = Date.now();
  const due = PP.denLuotTuGiao([con, regular], conf, now, new Map([['con', now - 60000], ['thuong', now - 60000]]));
  check('Tự phân phối bỏ việc con nhưng vẫn giao việc thường', () => {
    assert.equal(due.length, 1);
    assert.equal(due[0].id, 'thuong');
  });

  let full = 0;
  const S = { editing: cha, dirty: {}, isManager: true, suaDayDu: false };
  const context = vm.createContext({ S, window: { matchMedia: true },
    matchMedia: () => ({ matches: true }), $: () => ({ scrollTop: 0 }),
    idCha: (t) => (t.parent || [])[0],
    openDrawer: (t) => { S.editing = t; S.suaDayDu = false; },
    buildDrawer: () => { full++; },
  });
  vm.runInContext('let dangDiViec = false; let DT_TAB;\n' + fn(fe, 'moViecKhac'), context);
  await context.moViecKhac(con);
  check('Bấm việc con mở form đầy đủ cho quản lý', () => {
    assert.equal(S.editing.id, 'con'); assert.equal(S.suaDayDu, true); assert.equal(full, 1);
  });
  console.log('\n' + pass + ' pass · 0 fail');
})().catch((err) => { console.error(err); process.exitCode = 1; });
