'use strict';
/**
 * ============================================================================
 * TỆP CỦA Ô PHÁT KHÔNG ĐƯỢC NẰM TRONG KHO MÃ
 * ============================================================================
 * Anh Hùng 28/09/2026: "anh đã gỡ nhiều lần mà deploy lại vẫn hiện hoài".
 *
 * Đo được, và nó là chuyện HAI NGUỒN:
 *
 *   nguồn thật : bảng "Ô phát trang Tổng quan" trên Lark Base (phim-kho.js).
 *                Đọc lúc kiểm: chỉ còn ô 1 — nút "Gỡ" đã chạy ĐÚNG.
 *   nguồn thừa : lark-mkt-hub/du-lieu/video-tong-quan-2.mp4 nằm trong git,
 *                do .gitignore có dòng bỏ-chặn riêng cho nó.
 *
 * Mỗi lần deploy, Render clone lại repo -> tệp quay về `du-lieu/`. Mà
 * `dsPhim()` quét ĐĨA để dựng danh sách ô, nên ô 2 sống lại. Gỡ bao nhiêu lần
 * cũng vậy, vì chỗ gỡ và chỗ hồi sinh là hai nơi khác nhau.
 *
 * Dòng bỏ-chặn đó viết ngày 15/09/2026 và ĐÚNG ở thời điểm đó: chưa có kho
 * trên Base, ổ đĩa Render là ổ tạm, để trong repo là cách duy nhất tệp sống
 * qua deploy. Tới 22/09 có phim-kho.js thì nó thành thừa — và thừa theo kiểu
 * giành quyền với nguồn thật.
 *
 * Bộ này canh để không ai vô tình commit lại tệp media.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '\n      ' + vi : '')); }
};

const GOC = path.join(__dirname, '..', '..');

console.log('\ntệp ô phát chỉ sống trên Base, không nằm trong kho mã');

let dsGit = [];
try {
  dsGit = execFileSync('git', ['ls-files', 'lark-mkt-hub/du-lieu/'], { cwd: GOC, encoding: 'utf8' })
    .split('\n').map((x) => x.trim()).filter(Boolean);
} catch (_) { /* không có git thì bỏ qua phần này */ }

ok('đọc được danh sách tệp git đang theo dõi', dsGit.length > 0, 'không chạy được git ls-files');

/* Chỉ MỘT thứ được phép nằm lại: nhom-mkt.json — bản lưu danh sách nhóm MKT,
 * để ngày đầu deploy đã có sẵn một bản dùng ngay khi chưa đọc được Lark.
 *
 * Logo TỪNG được phép, vì trước 28/09/2026 nó chưa có kho trên Base. Từ khi
 * cất được lên Base (phim-kho.js, khoá 'logo') thì giữ bản trong repo sẽ tái
 * lập đúng lỗi của Video 2: gỡ trong Cài đặt, deploy phát sau git khôi phục,
 * logo cũ sống lại. */
const DUOC_PHEP = /(^|\/)(nhom-mkt\.json)$/i;
const MEDIA = /\.(mp4|webm|mov|m4v|avi|mkv|png|jpe?g|gif|webp|avif)$/i;

const lot = dsGit.filter((f) => MEDIA.test(f) && !DUOC_PHEP.test(f));
ok('không tệp media nào của ô phát bị commit',
  lot.length === 0, lot.length ? lot.join(', ') : '');

ok('video-tong-quan* không còn trong kho mã',
  !dsGit.some((f) => /video-tong-quan/i.test(f)),
  dsGit.filter((f) => /video-tong-quan/i.test(f)).join(', '));

/* Và .gitignore không được mở cửa lại cho chúng. */
const gi = fs.readFileSync(path.join(GOC, '.gitignore'), 'utf8')
  .split('\n').filter((d) => !d.trim().startsWith('#')).join('\n');
const moCua = gi.split('\n').filter((d) => /^!.*video-tong-quan/i.test(d.trim()));
ok('.gitignore không còn dòng bỏ-chặn cho video ô phát',
  moCua.length === 0, moCua.join(' · '));

/* Logo giờ cũng sống trên Base — và phải KHÔNG còn trong kho mã, cùng lý do. */
ok('logo không còn trong kho mã', !dsGit.some((f) => /du-lieu\/logo\./i.test(f)),
  dsGit.filter((f) => /du-lieu\/logo\./i.test(f)).join(', '));
ok('.gitignore không còn dòng bỏ-chặn cho logo',
  !gi.split('\n').some((d2) => /^!.*du-lieu\/logo\./.test(d2.trim())));

/* Nhưng phải có đường cất logo lên Base thật — gỡ khỏi repo mà không có chỗ
 * cất là xoá trắng logo, vá quá tay cũng là một kiểu hỏng. */
const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
ok('POST /api/logo có cất lên Base', /phimKho\.ghiKho\(phimKho\.KHOA_LOGO/.test(sv));
ok('DELETE /api/logo có xoá trên Base', /phimKho\.xoaKho\(phimKho\.KHOA_LOGO\)/.test(sv));
ok('khởi động có kéo logo từ Base về', /KHOA_LOGO \? ghiDiaLogo/.test(sv));
ok('Cài đặt nói THẬT logo đang ở đâu (hỏi hàng trên Base, không phải hỏi kho có chạy)',
  /kho: await logoTrenBase\(\)/.test(sv));

/* Chốt lại lý do: nguồn thật phải là Base. */
const pk = fs.readFileSync(path.join(__dirname, '..', 'phim-kho.js'), 'utf8');
ok('phim-kho.js vẫn là nơi giữ thật (kéo từ Base về đĩa lúc khởi động)',
  /function veDia/.test(pk) && /docKho/.test(pk));

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
