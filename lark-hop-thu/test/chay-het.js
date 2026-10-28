'use strict';
/* Chạy mọi tệp *.test.js trong thư mục này — quét thư mục chứ không liệt kê
 * bằng tay, vì liệt kê tay đã từng làm sót hai bộ ở app Bảng công việc và
 * chúng mục đi trong im lặng. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let hong = 0;
const ds = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();
for (const f of ds) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const ra = (r.stdout || '') + (r.stderr || '');
  const m = /(\d+)\s*pass[^\d]*(\d+)\s*fail/i.exec(ra);
  const dat = r.status === 0;
  if (!dat) hong += 1;
  console.log((dat ? '   ok   ' : '  FAIL  ') + f.padEnd(26) + (m ? m[1] + ' pass · ' + m[2] + ' fail' : (dat ? 'xong' : 'hỏng')));
  if (!dat) ra.split('\n').filter((d) => /✗|FAIL/.test(d)).slice(0, 5).forEach((d) => console.log('        ' + d.trim()));
}
console.log('\n' + ds.length + ' bộ · ' + (ds.length - hong) + ' xanh · ' + hong + ' đỏ');
process.exit(hong ? 1 : 0);
