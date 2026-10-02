'use strict';
/**
 * Chạy MỌI tệp *.test.js trong thư mục này.
 *
 * Trước đây package.json liệt kê từng tệp bằng tay, và đã sót hai bộ —
 * campaign.test.js và nhap.test.js — không lần nào được chạy. Bộ thử tồn tại
 * mà không ai chạy thì tệ hơn là không có: nó mục đi trong im lặng, rồi tới
 * lúc cần thì không tin được nữa.
 *
 * Quét thư mục thì thêm tệp mới là tự có mặt, không phải nhớ sửa hai nơi.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ds = fs.readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

let hong = 0;
const bang = [];
for (const f of ds) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const ra = (r.stdout || '') + (r.stderr || '');
  const m = /(\d+)\s*(?:pass|đạt)[^\d]*(\d+)\s*(?:fail|hỏng)/i.exec(ra);
  const dat = r.status === 0;
  if (!dat) hong += 1;
  bang.push({ f, dat, tom: m ? m[1] + ' pass · ' + m[2] + ' fail' : (dat ? 'xong' : 'hỏng'), ra });
  console.log((dat ? '   ok   ' : '  FAIL  ') + f.padEnd(28) + bang[bang.length - 1].tom);
  if (!dat) {
    ra.split('\n').filter((d) => /✗|FAIL/.test(d)).slice(0, 6)
      .forEach((d) => console.log('        ' + d.trim()));
  }
}

const tong = bang.length;
console.log('\n' + tong + ' bộ · ' + (tong - hong) + ' xanh · ' + hong + ' đỏ');
process.exit(hong ? 1 : 0);
