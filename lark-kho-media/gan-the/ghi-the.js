'use strict';
/* Bước 3 của lượt gắn thẻ: gộp các file du-lieu/gan-the/lo/the-XXX.json vào du-lieu/the.json.
   Mỗi file the-XXX.json: { "<số>": ["mô tả một câu", "thẻ1,thẻ2,…", điểm 1-10], … }
   Chạy: node gan-the/ghi-the.js      (server kho-media tự nạp lại the.json) */
const fs = require('fs');
const path = require('path');
const { DL, docThe } = require('../chi-muc');

const LO = path.join(DL, 'gan-the', 'lo');
const loFile = path.join(LO, 'lo.json');
if (!fs.existsSync(loFile)) { console.log('Không có lô nào đang chờ.'); process.exit(0); }
const lo = JSON.parse(fs.readFileSync(loFile, 'utf8'));
const the = docThe();
const ngay = new Date().toISOString().slice(0, 10);
let ghi = 0; const hong = [];
for (const f of fs.readdirSync(LO).filter(n => /^the-\d+\.json$/.test(n))) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(LO, f), 'utf8')); } catch (e) { hong.push(f + ' (JSON hỏng: ' + e.message + ')'); continue; }
  for (const [so, v] of Object.entries(j)) {
    const m = lo[+so];
    /* null = khung hình đen/nhoè không đọc được: vẫn ghi để khỏi đưa lại vào lô sau */
    if (m && v === null) { the[m.t] = { mo: 'Khung hình không rõ nội dung', the: ['không rõ'], diem: 1, nguon: 'claude-hang-ngay', luc: ngay }; ghi++; continue; }
    if (!m || !Array.isArray(v) || typeof v[0] !== 'string' || !v[0].trim()) { hong.push(f + '#' + so); continue; }
    the[m.t] = { mo: v[0].trim(), the: String(v[1] || '').split(',').map(s => s.trim()).filter(Boolean), diem: Math.max(1, Math.min(10, Math.round(+v[2] || 5))), nguon: 'claude-hang-ngay', luc: ngay };
    ghi++;
  }
}
const thieu = lo.filter(m => !the[m.t]).map(m => m.so);
const dich = path.join(DL, 'the.json');
fs.writeFileSync(dich + '.tmp', JSON.stringify(the, null, 1));
fs.renameSync(dich + '.tmp', dich);
fs.appendFileSync(path.join(DL, 'gan-the', 'nhat-ky.txt'), `${new Date().toISOString()} ghi ${ghi}/${lo.length} · thiếu ${thieu.length} · tổng ${Object.keys(the).length}\n`);
console.log(`Đã ghi ${ghi}/${lo.length} thẻ · tổng trong kho ${Object.keys(the).length}` + (thieu.length ? ` · THIẾU số: ${thieu.slice(0, 40).join(',')}` : '') + (hong.length ? ` · lỗi: ${hong.slice(0, 10).join('; ')}` : ''));
if (!thieu.length) fs.rmSync(LO, { recursive: true, force: true });
else console.log('Lô chưa xoá vì còn số thiếu — bổ sung the-XXX.json rồi chạy lại.');
