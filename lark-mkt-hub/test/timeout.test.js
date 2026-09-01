/**
 * Kiểm mốc thời gian chờ mà hub cho từng loại đường dẫn.
 *
 * Vì sao có bộ này: anh Hùng bấm "Tính ROAS" và nhận
 *   "Không kết nối được module Quản lý quảng cáo (cổng 5176):
 *    Module không trả lời trong 30s"
 * Câu đó đọc như module đã chết. Thật ra module vẫn chạy bình thường — nó đang
 * đọc toàn bộ Base qua API Lark rồi kéo đơn POS của 2 gian và hội thoại của 2
 * page, và việc đó lâu hơn 30 giây. Hub cắt ngang rồi báo một câu sai bản chất.
 *
 * Ba mốc phải giữ đúng, mỗi mốc có lý do riêng:
 *   - tải tệp        300000  nhận tệp rồi đẩy tiếp lên Lark
 *   - luồng sự kiện        0  SSE cố ý mở vô hạn, cắt là hỏng chế độ Trực tiếp
 *   - việc lâu        goiLauMs  gọi nhiều API bên ngoài rồi mới trả lời được
 *   - còn lại      goiTimeoutMs
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const src = fs.readFileSync(path.join(__dirname, '..', 'proxy.js'), 'utf8');
const cfg = require('../config');

/* Lấy đúng biểu thức đang dùng trong proxy.js thay vì chép lại một bản ở đây.
 * Chép lại thì hai bên trôi xa nhau mà test vẫn xanh. */
const m = src.match(/const VIEC_LAU = (\/.+\/);/);
t('proxy.js có khai VIEC_LAU', !!m);
const VIEC_LAU = m ? eval(m[1]) : /$^/;   // eslint-disable-line no-eval

console.log('— những đường vốn dĩ lâu phải được nới giờ');
[
  ['/api/roas/tinh', 'tính ROAS: đọc cả Base + POS + hội thoại'],
  ['/api/pancake-pos/ghep', 'ghép đơn POS với chi tiêu'],
  ['/api/pancake/phu', 'đếm phủ 14 ngày'],
  ['/api/sync', 'đồng bộ chi tiêu mọi kênh'],
  ['/api/import-csv', 'nhập CSV rồi ghi hàng loạt'],
].forEach(([p, vi]) => t(`${p} — ${vi}`, VIEC_LAU.test(p)));

t('có tham số đuôi vẫn nhận', VIEC_LAU.test('/api/sync?days=14'));

console.log('— đường thường KHÔNG được nới, kẻo lỗi thật bị treo lâu mới lộ');
[
  '/api/connect',
  '/api/daily',
  '/api/entry',
  '/api/meta',
  '/api/roas/trang-thai',   // chỉ đọc trạng thái, nhanh
  '/api/roas/xoa',
].forEach((p) => t(`${p} giữ mốc thường`, !VIEC_LAU.test(p), p));

console.log('— các mốc thời gian');
t('goiTimeoutMs là số dương', Number.isFinite(cfg.goiTimeoutMs) && cfg.goiTimeoutMs > 0,
  String(cfg.goiTimeoutMs));
t('goiLauMs là số dương', Number.isFinite(cfg.goiLauMs) && cfg.goiLauMs > 0,
  String(cfg.goiLauMs));
t('việc lâu phải được cho NHIỀU thời gian hơn việc thường',
  cfg.goiLauMs > cfg.goiTimeoutMs, `${cfg.goiLauMs} vs ${cfg.goiTimeoutMs}`);
t('nhưng không vô hạn — treo mãi thì người dùng không biết chuyện gì',
  cfg.goiLauMs <= 600000, String(cfg.goiLauMs));

console.log('— ba nhánh trong proxy.js còn nguyên');
t('tải tệp vẫn 5 phút', /upload\|attachment.*\n?.*300000/.test(src) || src.includes('300000'));
t('luồng su-kien vẫn không giới hạn', /su-kien\\b\/\.test\(duongDan \|\| ''\) \? 0/.test(src));
t('nhánh việc lâu dùng cfg.goiLauMs', src.includes('cfg.goiLauMs'));
t('nhánh còn lại vẫn dùng cfg.goiTimeoutMs', src.includes('cfg.goiTimeoutMs'));

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
