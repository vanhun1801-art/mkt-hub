#!/usr/bin/env node
'use strict';
/**
 * Sinh nội dung cho biến môi trường ADS_CONNECT_JSON của Render.
 *
 * Vì sao cần file này chứ không gõ lệnh dài: mỗi lần thêm/đổi token là phải tạo
 * lại, và lần trước dán bản CŨ (thiếu TikTok) lên Render nên mất kênh.
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

const dem = (k, ...truong) => {
  const v = c[k] || {};
  const co = truong.filter((t) => v[t] && String(v[t]).trim());
  const ids = (v.accountIds || v.advertiserIds || v.customerIds || []).length;
  return `${v.enabled ? 'BẬT ' : 'tắt '} · ${co.length}/${truong.length} thông tin${ids ? ' · ' + ids + ' tài khoản' : ''}`;
};

console.log('');
console.log('  Đã ghi ADS_CONNECT_JSON.txt — ' + motDong.length + ' ký tự, MỘT dòng');
console.log('');
console.log('  meta       ' + dem('meta', 'accessToken'));
console.log('  tiktok     ' + dem('tiktok', 'accessToken'));
console.log('  googleAds  ' + dem('googleAds', 'clientId', 'clientSecret', 'refreshToken', 'developerToken'));
console.log('  googleSheet ' + dem('googleSheet', 'csvUrl'));
console.log('');

const thieu = ['meta', 'tiktok', 'googleAds'].filter((k) => c[k] && c[k].enabled && !ketnoi.status().providers.find((p) => p.key === k && p.sanSang));
if (thieu.length) console.log('  ! Kênh bật nhưng chưa đủ thông tin: ' + thieu.join(', ') + '\n');

console.log('  Việc tiếp theo:');
console.log('    1. Mở ADS_CONNECT_JSON.txt, Ctrl+A, Ctrl+C');
console.log('    2. Render → Environment → biến ADS_CONNECT_JSON → dán, Save Changes');
console.log('    3. Deploy xong, mở tab Kết nối kiểm cả 3 kênh "Đang bật"');
console.log('    4. Xoá file này: del ADS_CONNECT_JSON.txt');
console.log('');
