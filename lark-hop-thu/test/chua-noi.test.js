'use strict';
/**
 * Máy không có lark-cli (bản chạy chung trên Render, 28/10/2026): trước đây
 * giao diện bày nguyên khối stack của Node "Cannot find module
 * '/opt/render/…/run.js'". Nay phải là một câu nói lý do, mã 503 kèm cờ
 * chuaNoi, và không lộ đường dẫn máy chủ.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

process.env.HOP_THU_DU_LIEU = fs.mkdtempSync(path.join(os.tmpdir(), 'hop-thu-'));
process.env.LARK_CLI_SCRIPT = path.join(os.tmpdir(), 'khong-co-lark-cli', 'run.js');
delete process.env.HUB;

const thu = require('../thu');
const { server } = require('../server');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

console.log('\nLỗi lark-cli thô thành một dòng');
const STACK = "node:internal/modules/cjs/loader:1459\n  throw err;\n  ^\n\nError: Cannot find module '/opt/render/x/run.js'\n" +
  '    at Module._resolveFilename (node:internal/modules/cjs/loader:1456:15)\n    at defaultResolveImpl (node:internal/modules/cjs/loader:1066:19) {\n' +
  "  code: 'MODULE_NOT_FOUND',\n  requireStack: []\n}\n\nNode.js v24.14.1";
const g = thu.loiGon(STACK);
ok('lấy đúng dòng nói lỗi', /Cannot find module/.test(g.message), g.message);
ok('không kèm dòng "at …" hay node:internal', !/\bat |node:internal|loader:/.test(g.message), g.message);
ok('bản đầy đủ giữ cho log', /MODULE_NOT_FOUND/.test(g.chiTiet));

const goi = (duong, h = {}) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: server.address().port, path: duong, headers: h }, (res) => {
    let s = '';
    res.on('data', (c) => { s += c; });
    res.on('end', () => resolve({ ma: res.statusCode, s, j: (() => { try { return JSON.parse(s); } catch (_) { return null; } })() }));
  }).on('error', reject);
});

server.listen(0, '127.0.0.1', async () => {
  console.log('\nMáy không có lark-cli');
  for (const [ten, h] of [['chạy một mình', {}], ['qua hub', { 'x-hub-user-id': 'ou_1', 'x-hub-user-email': 'hunglv%40rootytrip.com' }]]) {
    const r = await goi('/api/thu', h);
    ok(ten + ': 503 kèm cờ chuaNoi', r.ma === 503 && r.j && r.j.chuaNoi === true, r.s.slice(0, 200));
    ok(ten + ': câu nói lý do', /chỉ đọc được trên máy đã đăng nhập Lark/.test(r.j && r.j.error));
    ok(ten + ': không lộ đường dẫn hay stack', !/run\.js|node_modules|node:internal|khong-co-lark-cli/.test(r.s));
  }
  ok('cửa thử sức khoẻ của hub vẫn 200', (await goi('/api/suc-khoe')).ma === 200);
  server.close();
  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
});
