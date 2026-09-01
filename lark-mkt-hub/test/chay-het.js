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
  /* Tẩy mã màu ANSI trước khi đọc: bot.test.js in dòng tổng kết có kèm màu
   * nên mẫu `^<số> pass` không khớp — chuỗi bắt đầu bằng ký tự escape chứ
   * không phải chữ số. Không tẩy thì bộ chạy báo HỎNG oan cho bộ đang pass. */
  const ANSI = new RegExp(String.fromCharCode(27) + '\\['  + '[0-9;]*m', 'g');
  const ra = ((r.stdout || '') + (r.stderr || '')).replace(ANSI, '');
  let dong = ra.split('\n').map((x) => x.trim()).filter((x) => /^\d+ pass · \d+ fail/.test(x)).pop();

  /* Quy ước CŨ: api.test.js và quyen-panel.test.js in các dòng `OK ...` / `FAIL ...`
   * rồi thoát với mã 0/1, không in dòng tổng kết. Chúng là test tích hợp cần hub
   * đang chạy nên không viết lại; chỉ cần đọc được cả hai kiểu.
   *
   * Mã thoát mới là sự thật: một bộ in toàn "OK" mà thoát khác 0 thì vẫn là HỎNG. */
  if (!dong) {
    const dongs = ra.split('\n').map((x) => x.trim());
    const soOk = dongs.filter((x) => /^OK\b/.test(x)).length;
    const soFail = dongs.filter((x) => /^FAIL\b/.test(x)).length;
    if ((soOk || soFail) && !(r.status && soFail === 0)) dong = `${soOk} pass · ${soFail} fail`;
    else if (soOk || soFail) dong = `${soOk} pass · ${Math.max(soFail, 1)} fail`;
  }

  if (!dong) {
    hong += 1;
    console.log(`  HỎNG  ${f}` + (r.status ? ` (thoát ${r.status})` : ''));
    ra.trim().split('\n').slice(-6).forEach((l) => console.log('        ' + l));
    chiTiet.push([f, 'HỎNG']);
    continue;
  }
  /* Đã lọc bằng chính mẫu này ở trên nên bình thường không thể null. Vẫn chặn:
   * lần trước nó null thật và cả bộ chạy NỔ, che mất kết quả của mọi bộ khác. */
  const kh = dong.match(/^(\d+) pass · (\d+) fail/);
  if (!kh) {
    hong += 1;
    console.log(`  HỎNG  ${f} — không đọc được dòng tổng kết: ${JSON.stringify(dong)}`);
    chiTiet.push([f, 'HỎNG']);
    continue;
  }
  const [, p, m] = kh;
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
