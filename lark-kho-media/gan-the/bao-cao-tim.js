'use strict';
/* Báo cáo các lần tìm kể từ lần báo cáo trước — đầu vào để lượt chạy hằng ngày bổ sung
   từ đồng nghĩa (du-lieu/hoc/dong-nghia.json).
   Chạy: node gan-the/bao-cao-tim.js            (xem, không đánh dấu)
         node gan-the/bao-cao-tim.js --danh-dau (xem rồi đánh dấu đã đọc tới giờ này) */
const fs = require('fs');
const path = require('path');
const { DL } = require('../chi-muc');
const hoc = require('../hoc');

const DIR = path.join(DL, 'hoc');
const MOC = path.join(DIR, 'moc-bao-cao.txt');
let tu = 0;
try { tu = +fs.readFileSync(MOC, 'utf8') || 0; } catch (e) {}
const nay = Date.now();

const q = new Map(); // khoá → { mau: câu gõ gần nhất, lan, tong, bam }
for (const f of fs.readdirSync(DIR).filter(n => /^su-kien-\d{4}-\d{2}\.jsonl$/.test(n)).sort()) {
  for (const dong of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) {
    let e; try { e = JSON.parse(dong); } catch (er) { continue; }
    if (!e.luc || e.luc <= tu) continue;
    const k = hoc.khoa(e.q); if (!k) continue;
    if (!q.has(k)) q.set(k, { mau: e.q, lan: 0, tong: null, bam: 0 });
    const x = q.get(k);
    if (e.loai === 'tim') { x.lan++; x.tong = e.tong; x.mau = e.q; } else if (hoc.TRONG[e.loai]) x.bam++;
  }
}
const ds = [...q.values()].filter(x => x.lan);
const khong = ds.filter(x => x.tong === 0).sort((a, b) => b.lan - a.lan);
const khongBam = ds.filter(x => x.tong > 0 && !x.bam).sort((a, b) => b.lan - a.lan);
const nhieu = [...ds].sort((a, b) => b.lan - a.lan).slice(0, 15);
const dong = x => `  "${x.mau}" — tìm ${x.lan} lần · ${x.tong} kết quả · ${x.bam} lượt bấm/tải/ghim`;
console.log(`Từ ${tu ? new Date(tu).toLocaleString('vi-VN') : 'đầu'} tới nay: ${ds.length} câu tìm khác nhau.`);
console.log(`\nKHÔNG RA KẾT QUẢ (${khong.length}):`); khong.slice(0, 40).forEach(x => console.log(dong(x)));
console.log(`\nRA KẾT QUẢ NHƯNG KHÔNG AI BẤM (${khongBam.length}):`); khongBam.slice(0, 40).forEach(x => console.log(dong(x)));
console.log(`\nTÌM NHIỀU NHẤT:`); nhieu.forEach(x => console.log(dong(x)));
if (process.argv.includes('--danh-dau')) fs.writeFileSync(MOC, String(nay));
