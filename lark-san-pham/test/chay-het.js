#!/usr/bin/env node
/**
 * Chạy toàn bộ test và cộng tổng.
 * Bộ nào không in được dòng `N pass · M fail` bị tính là HỎNG, không phải "0 lỗi" —
 * một bộ im lặng mà báo xanh thì tệ hơn không có test.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const thuMuc = __dirname;
const bo = fs.readdirSync(thuMuc).filter((f) => f.endsWith('.test.js')).sort();
const ANSI = new RegExp(String.fromCharCode(27) + '\[[0-9;]*m', 'g');

let tongPass = 0, tongFail = 0, hong = 0;
for (const f of bo) {
  const r = cp.spawnSync(process.execPath, [path.join(thuMuc, f)],
    { encoding: 'utf8', cwd: path.join(thuMuc, '..') });
  const ra = ((r.stdout || '') + (r.stderr || '')).replace(ANSI, '');
  const dong = ra.split('\n').map((x) => x.trim())
    .filter((x) => /^\d+ pass · \d+ fail/.test(x)).pop();
  if (!dong || r.status !== 0) {
    hong++;
    console.log('  \x1b[31mHỎNG\x1b[0m ' + f + (dong ? '  (' + dong + ')' : ''));
    if (!dong) console.log(ra.split('\n').slice(-12).join('\n'));
    continue;
  }
  const [, p, q] = dong.match(/^(\d+) pass · (\d+) fail/);
  tongPass += Number(p); tongFail += Number(q);
  console.log('   ok   ' + f.padEnd(24) + dong);
}
console.log('\n' + bo.length + ' bộ · ' + tongPass + ' pass · ' + tongFail + ' fail' +
  (hong ? ' · ' + hong + ' HỎNG' : ''));
process.exit(tongFail || hong ? 1 : 0);
