'use strict';
/* Xuất hình minh hoạ đang dùng (public/hinh-ve.js) thành từng file SVG trong hinh-rieng/mau-hien-tai/
   để vẽ lại bằng Illustrator/Figma. Chạy: node tao/xuat-mau-hinh.js */
const fs = require('fs');
const path = require('path');
global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'hinh-ve.js'), 'utf8'));
const H = window.PQ_HINH_VE;
const RA = path.join(__dirname, '..', 'hinh-rieng', 'mau-hien-tai');
fs.mkdirSync(RA, { recursive: true });
const src = fs.readFileSync(path.join(__dirname, '..', 'diem.js'), 'utf8');
let n = 0;
for (const m of src.matchAll(/\bid:\s*'([a-z0-9-]+)',\s*ten:\s*'([^']+)'/g)) {
  const [, id, ten] = m, sid = H.theoDiem[id];
  if (!sid) continue;
  const dau = '<symbol id="' + sid + '" viewBox="', i = H.defs.indexOf(dau);
  if (i < 0) continue;
  const vbHet = H.defs.indexOf('"', i + dau.length), vb = H.defs.slice(i + dau.length, vbHet);
  const than = H.defs.slice(H.defs.indexOf('>', vbHet) + 1, H.defs.indexOf('</symbol>', i));
  fs.writeFileSync(path.join(RA, id + '.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="512" height="512">\n' +
    '<!-- ' + ten + ' — hình mẫu đang dùng. Hình mới lưu vào hinh-rieng/' + id + '.png (hoặc .webp/.svg): vuông, nền trong, chân công trình chạm ĐÁY khung. -->\n' + than + '\n</svg>\n');
  n++;
}
/* phương tiện */
const XE = { 'xe-may-bay': 'Máy bay (nhìn từ trên, MŨI HƯỚNG SANG PHẢI)', 'xe-tau': 'Tàu cao tốc (nhìn từ trên, mũi sang phải)', 'xe-cano': 'Cano (nhìn từ trên, mũi sang phải)', 'xe-cabin': 'Cabin cáp treo (nhìn thẳng, móc treo ở giữa mép trên)', 'xe-buom': 'Thuyền buồm (nhìn ngang, hướng sang phải)' };
for (const [id, ten] of Object.entries(XE)) {
  const dau = '<symbol id="' + id + '" viewBox="', i = H.defs.indexOf(dau);
  if (i < 0) continue;
  const vbHet = H.defs.indexOf('"', i + dau.length), vb = H.defs.slice(i + dau.length, vbHet);
  const than = H.defs.slice(H.defs.indexOf('>', vbHet) + 1, H.defs.indexOf('</symbol>', i));
  fs.writeFileSync(path.join(RA, id + '.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="512" height="512">\n<!-- ' + ten + '. Hình mới: hinh-rieng/' + id + '.png, nền trong, căn giữa. -->\n' + than + '\n</svg>\n');
  n++;
}
console.log('đã xuất', n, 'mẫu →', RA);
