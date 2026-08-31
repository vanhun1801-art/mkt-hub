#!/usr/bin/env node
'use strict';
/**
 * Sinh nội dung cho biến môi trường ADS_CONNECT_JSON của Render.
 *
 * Vì sao cần file này chứ không gõ lệnh dài: mỗi lần thêm/đổi token là phải tạo
 * lại, và lần đầu dán bản CŨ (thiếu TikTok) lên Render nên mất kênh.
 *
 * Bản đầu của file này lại mắc đúng lỗi nó ra đời để chống: bảng đối chiếu liệt kê
 * bốn kênh CỐ ĐỊNH trong code. Thêm Pancake và Pancake POS vào cấu hình thì bảng
 * vẫn chỉ in bốn dòng cũ — hai kênh mới rỗng mà không có gì kêu, dán lên là mất.
 *
 * Nay bảng đi từ ketnoi.status(), tức từ chính DEFAULT, nên thêm kênh bao nhiêu
 * lần cũng không thể sót. Và kênh nào TRỐNG thì in cảnh báo to, vì trường hợp
 * nguy hiểm nhất là: đã khai kênh đó trên Render, rồi dán chuỗi rỗng lên đè mất.
 *
 * Chạy: node tao-env.js
 */
const fs = require('fs');
const path = require('path');
const ketnoi = require('./sync/ketnoi');

const RA = path.join(__dirname, 'ADS_CONNECT_JSON.txt');
const boChuThich = (o) => (Array.isArray(o) || typeof o !== 'object' || !o ? o
  : Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, boChuThich(v)])));

const c = boChuThich(ketnoi.read());
const motDong = JSON.stringify(c);
fs.writeFileSync(RA, motDong, { encoding: 'utf8', mode: 0o600 });

const st = ketnoi.status();
/* Gộp cả nguồn chi tiêu và nguồn chỉ-để-đo. Đi từ status() nên không có danh sách
 * cứng nào để quên cập nhật. */
const kenh = [
  ...st.providers.map((p) => ({ ...p, loai: 'chi tiêu' })),
  ...(st.doLuong || []).map((p) => ({ ...p, loai: 'đo lường' })),
];

const rong = [];
const banRa = kenh.map((p) => {
  const co = p.coToken;
  const trangThai = p.enabled ? 'BẬT' : 'tắt';
  if (!co) rong.push(p);
  return {
    ten: p.key,
    dong: `${trangThai.padEnd(4)} · ${co ? 'CÓ thông tin' : 'TRỐNG'}`
      + (p.soTaiKhoan ? ` · ${p.soTaiKhoan} tài khoản` : '')
      + (p.thieu && p.thieu.length ? `  (thiếu: ${p.thieu.join(', ')})` : ''),
  };
});

const rongDai = Math.max(...banRa.map((x) => x.ten.length));

console.log('');
console.log('  Đã ghi ADS_CONNECT_JSON.txt — ' + motDong.length + ' ký tự, MỘT dòng');
console.log('');
banRa.forEach((x) => console.log('  ' + x.ten.padEnd(rongDai + 2) + x.dong));
console.log('');

if (rong.length) {
  console.log('  ' + '!'.repeat(66));
  console.log('  ! ' + rong.length + ' kênh TRỐNG trong chuỗi vừa tạo: ' + rong.map((x) => x.key).join(', '));
  console.log('  !');
  console.log('  ! Chuỗi này đi từ cấu hình Ở MÁY NÀY. Nếu kênh nào trong số đó anh đã');
  console.log('  ! khai TRÊN RENDER (dán token qua web) thì dán chuỗi này lên là MẤT nó:');
  console.log('  ! ổ đĩa Render bị xoá mỗi lần deploy, và biến môi trường sẽ không có gì');
  console.log('  ! để thay thế.');
  console.log('  !');
  console.log('  ! Cách xử lý: mở http://localhost:5176 → tab Kết nối, khai các kênh đó');
  console.log('  ! ngay tại máy này, rồi chạy lại node tao-env.js.');
  console.log('  ' + '!'.repeat(66));
  console.log('');
}

const batMaThieu = kenh.filter((p) => p.enabled && !p.sanSang);
if (batMaThieu.length) {
  console.log('  ! Kênh đang BẬT nhưng chưa đủ thông tin: '
    + batMaThieu.map((x) => x.key).join(', ') + '\n');
}

console.log('  Việc tiếp theo:');
console.log('    1. Mở ADS_CONNECT_JSON.txt, Ctrl+A, Ctrl+C');
console.log('       (hoặc: type ADS_CONNECT_JSON.txt | clip)');
console.log('    2. Render → Environment → biến ADS_CONNECT_JSON → XOÁ SẠCH giá trị cũ, dán mới, Save Changes');
console.log('    3. Deploy xong, mở tab Kết nối kiểm băng xanh "Deploy lại không mất gì"');
console.log('       — băng đó phải liệt kê ĐỦ các kênh anh đang dùng');
console.log('    4. Xoá file này: del ADS_CONNECT_JSON.txt');
console.log('');
