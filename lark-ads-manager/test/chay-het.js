#!/usr/bin/env node
/**
 * Chạy toàn bộ test và cộng tổng.
 *
 * Vì sao cần: `npm test` trước đây chỉ chạy api.test.js — 1 trong 14 bộ. Nó xanh
 * trong khi hai bộ khác đang NỔ, và một bộ không hề có câu kiểm nào. "Test pass"
 * mà chỉ chạy một phần thì tệ hơn không có test, vì nó tạo cảm giác yên tâm sai.
 *
 * Quy ước: mỗi bộ in dòng cuối dạng `N pass · M fail`. Bộ nào không in được dòng
 * đó bị tính là HỎNG, không phải "0 lỗi".
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const thuMuc = __dirname;
const bo = fs.readdirSync(thuMuc).filter((f) => f.endsWith('.test.js')).sort();

let tongPass = 0, tongFail = 0, hong = 0;
const chiTiet = [];

for (const f of bo) {
  const r = cp.spawnSync(process.execPath, [path.join(thuMuc, f)],
    { encoding: 'utf8', cwd: path.join(thuMuc, '..') });
  const ra = (r.stdout || '') + (r.stderr || '');
  const dong = ra.split('\n').map((x) => x.trim()).filter((x) => /^\d+ pass · \d+ fail$/.test(x)).pop();
  if (!dong) {
    hong += 1;
    console.log(`  HỎNG  ${f}`);
    ra.trim().split('\n').slice(-6).forEach((l) => console.log('        ' + l));
    chiTiet.push([f, 'HỎNG']);
    continue;
  }
  const [, p, m] = dong.match(/^(\d+) pass · (\d+) fail$/);
  tongPass += Number(p); tongFail += Number(m);
  const dau = Number(m) ? 'FAIL ' : ' ok  ';
  console.log(`  ${dau} ${f.padEnd(26)} ${dong}`);
  if (Number(m)) ra.split('\n').filter((l) => l.includes('FAIL')).forEach((l) => console.log('        ' + l));
  chiTiet.push([f, dong]);
}

const boQua = chiTiet.filter(([, d]) => d === '0 pass · 0 fail').map(([f]) => f);
if (boQua.length) {
  console.log(`\nBỎ QUA (không tự chạy): ${boQua.join(', ')}`);
  console.log('  write.test.js ghi vào Base thật — chạy riêng: GHI_THAT=1 node test/write.test.js');
}

console.log(`\n${bo.length} bộ · ${tongPass} pass · ${tongFail} fail` + (hong ? ` · ${hong} HỎNG` : ''));
process.exitCode = (tongFail || hong) ? 1 : 0;
