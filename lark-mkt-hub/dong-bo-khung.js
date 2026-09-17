#!/usr/bin/env node
'use strict';
/**
 * Chép khung-xuong.css + khung-xuong.js sang public/ của CHÍN app con.
 *
 * Vì sao phải chép chứ không dùng chung một file: mỗi app con chạy độc lập được
 * (cổng riêng, server riêng, thư mục public riêng), nên nó chỉ phục vụ được file
 * nằm trong thư mục của chính nó. Qua proxy của hub thì `href="/khung-xuong.css"`
 * còn bị viết lại thành `/m/<id>/khung-xuong.css` — cũng trỏ về app con. Tức là
 * mỗi app phải có một bản.
 *
 * Bản GỐC nằm ở lark-mkt-hub/public/. Sửa ở đó rồi chạy:
 *     node dong-bo-khung.js
 * test/khung-xuong.test.js canh cho không bản nào lệch bản gốc.
 */
const fs = require('fs');
const path = require('path');

const TEP = ['khung-xuong.css', 'khung-xuong.js'];
const CHA = path.join(__dirname, '..');
const APP = [
  'lark-task-manager', 'lark-lich-tac-nghiep', 'lark-ads-manager', 'lark-ota-manager',
  'lark-social', 'lark-chinh-anh', 'lark-kpi', 'lark-quy-chi-phi', 'lark-bao-cao',
];

const goc = TEP.map((t) => fs.readFileSync(path.join(__dirname, 'public', t)));
let doi = 0;
for (const ten of APP) {
  const thuMuc = path.join(CHA, ten, 'public');
  if (!fs.existsSync(thuMuc)) { console.log('BỎ QUA (không có public/):', ten); continue; }
  const lech = [];
  TEP.forEach((t, i) => {
    const dich = path.join(thuMuc, t);
    let cu = null;
    try { cu = fs.readFileSync(dich); } catch (_) {}
    if (cu && cu.equals(goc[i])) return;
    fs.writeFileSync(dich, goc[i]);
    lech.push(t);
  });
  if (!lech.length) { console.log('  đã khớp :', ten); continue; }
  doi++;
  console.log('  đã chép :', ten, '(' + lech.join(', ') + ')');
}
console.log(doi ? '\nXong — ' + doi + ' app được cập nhật.' : '\nXong — mọi app đã khớp bản gốc.');
