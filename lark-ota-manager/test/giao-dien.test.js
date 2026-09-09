'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

console.log('— giao diện manual-first');
t('có tab Dữ liệu Lark', /data-tab="lark">Dữ liệu Lark/.test(html));
t('có nút Nhập booking OTA', /id="btnNhapBooking"/.test(html));
t('không còn tab Thiết lập cũ', !/data-tab="thietlap"/.test(html));
t('Lark Base được ghi là nguồn dữ liệu gốc', /nguồn dữ liệu gốc duy nhất/i.test(app));
t('API chỉ là điểm chờ', /API OTA — điểm chờ cho tương lai/.test(app));
t('trạng thái API là Chưa được cấp API', /Chưa được cấp API/.test(app));
t('không còn khối Tùy chọn đồng bộ API', !/Tùy chọn đồng bộ/.test(app));
t('có tự đọc lại Lark định kỳ', /function tuDongDocLark/.test(app));
t('có báo cáo lead time', /Thời gian đặt trước/.test(app) && /Đặt trước trung bình/.test(app));
t('có mốc Tháng trước', /thangtruoc/.test(app));
t('mặc định dùng Lark Base, không dùng hàng đợi', /nguon:\s*'base'/.test(app));
t('không nhớ hàng đợi qua lần mở trang sau', /localStorage\.removeItem\('ota-nguon'\)/.test(app));
t('doanh thu thực nhận theo kênh luôn hiển thị VNĐ', /vnd\(k\.thucNhan\)/.test(app) && !/tienOtaGop\(k, k\.thucNhan\)/.test(app));
t('có nút tạo ba cột vận hành đã duyệt', /btnTaoCotVanHanh/.test(app) && /tao-cot-van-hanh/.test(app));
t('nói rõ thao tác không sửa dữ liệu hay công thức', /Không sửa dữ liệu, công thức hoặc cột hiện tại/.test(app));

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
