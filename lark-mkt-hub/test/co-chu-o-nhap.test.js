'use strict';
/**
 * ============================================================================
 * TRÊN ĐIỆN THOẠI, Ô NHẬP CHỮ KHÔNG ĐƯỢC NHỎ HƠN 16px
 * ============================================================================
 * iOS Safari TỰ PHÓNG TO cả trang mỗi khi chạm vào một ô nhập chữ có cỡ dưới
 * 16px, rồi người dùng phải tự chụm tay thu lại. Anh Hùng đã nêu đúng hiện
 * tượng này ("thu phóng liên tục ra vào"), và nó đã được vá một lần bằng
 * `mobile-chung.css`.
 *
 * NHƯNG NÓ QUAY LẠI. Đo ngày 26/09/2026 trên máy thật:
 *   · Bảng công việc — ô tìm `.cal-filters > input[type=search]` = 15px
 *   · Báo cáo — ô chọn `td.o-viec .v-viec` = 15px
 * Cả hai do lớp giao diện iOS thêm sau, với `!important` và độ ưu tiên cao hơn
 * `mobile-chung.css`, nên luật sàn 16px thua.
 *
 * Soi một ô duy nhất thấy CHÍN luật font-size tranh nhau, từ bốn tệp CSS, với
 * chuỗi `:not(#_):not(#__)` leo thang độ ưu tiên. Trong đống đó, một con số 15
 * gõ vào là không ai nhận ra — trừ khi có phép thử này.
 *
 * Nên bộ này KHÔNG canh hai chỗ vừa sửa. Nó quét MỌI luật đặt cỡ chữ cho ô
 * nhập, trong MỌI khối `@media` của điện thoại, ở MỌI tệp CSS dùng chung.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '\n      ' + vi : '')); }
};

const PUB = path.join(__dirname, '..', 'public');
/* Tệp phủ lên MỌI app — sai ở đây là sai cả 12 app cùng lúc. */
const TEP = ['ios.css', 'dienthoai.css', 'mobile-chung.css', 'styles.css'];

/** Ô NHẬP CHỮ — tức là chạm vào thì bàn phím bật lên. Thanh trượt, ô tick,
 *  chọn màu, chọn tệp không làm bàn phím bật nên iOS không phóng to. */
const LA_O_CHU = /\b(input|select|textarea|\.cal-search|\.in-o|\.fld|\.v-viec|contenteditable)\b/;
const KHONG_TINH = /\[type=["']?(range|checkbox|radio|color|file|submit|button)["']?\]/;

console.log('\nsàn 16px cho ô nhập chữ trên điện thoại');

const viPham = [];
let soLuatDaSoi = 0;

for (const ten of TEP) {
  let css;
  try { css = fs.readFileSync(path.join(PUB, ten), 'utf8'); } catch (_) { continue; }
  css = css.replace(/\/\*[\s\S]*?\*\//g, ' ');   // bỏ chú thích, kẻo đọc nhầm ví dụ trong đó

  /* Đi qua từng khối @media của điện thoại, cắt bằng cách ĐẾM NGOẶC. */
  const re = /@media[^{]*\(\s*max-width\s*:\s*(\d+)px\s*\)[^{]*\{/g;
  let m;
  while ((m = re.exec(css))) {
    if (Number(m[1]) > 700) continue;            // không phải khối điện thoại
    let sau = 0, i = m.index + m[0].length - 1, het = i;
    for (; het < css.length; het++) {
      if (css[het] === '{') sau++;
      else if (css[het] === '}') { sau--; if (!sau) break; }
    }
    const khoi = css.slice(i + 1, het);

    /* Mỗi luật: "<bộ chọn> { <khai báo> }" */
    const reLuat = /([^{}]+)\{([^{}]*)\}/g;
    let l;
    while ((l = reLuat.exec(khoi))) {
      const sel = l[1].trim();
      const than = l[2];
      const cs = /font-size\s*:\s*([\d.]+)px/.exec(than);
      if (!cs) continue;
      if (!LA_O_CHU.test(sel)) continue;
      if (KHONG_TINH.test(sel)) continue;
      soLuatDaSoi++;
      if (Number(cs[1]) < 16) {
        viPham.push(ten + ' @' + m[1] + 'px  ' + sel.replace(/\s+/g, ' ').slice(0, 92) + '  -> ' + cs[1] + 'px');
      }
    }
  }
}

ok('có quét được luật nào không (phép thử không tự rỗng rồi báo đạt)',
  soLuatDaSoi >= 5, 'mới soi ' + soLuatDaSoi + ' luật');

ok('không luật nào đặt ô nhập chữ dưới 16px trên điện thoại',
  viPham.length === 0,
  viPham.length ? '\n      ' + viPham.join('\n      ') : '');

/* Chốt riêng hai chỗ đã từng hỏng, để thông báo lỗi gọi đúng tên màn hình. */
const ios = fs.readFileSync(path.join(PUB, 'ios.css'), 'utf8');
ok('Bảng công việc — ô tìm trong lịch đạt sàn',
  !/\.cal-filters > input\[type=search\][\s\S]{0,260}?font-size:\s*1[0-5]px/.test(ios));
ok('Báo cáo — ô chọn việc trong bảng đạt sàn',
  !/td\.o-viec \.v-viec \{[^}]*font-size:\s*1[0-5]px/.test(ios));

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
