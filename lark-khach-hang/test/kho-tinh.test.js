'use strict';
/**
 * ============================================================================
 * KHO TRÊN BASE, VÀ BẢNG TRA TỈNH THÀNH
 * ============================================================================
 * Hai thứ làm 04/10/2026, mỗi thứ chặn một kiểu hỏng im lặng:
 *
 *   KHO TRÊN BASE — ổ đĩa Render là ổ tạm, mỗi lần deploy là trắng và app
 *   phải kéo lại 16.600 khách từ Tourwell: mười lăm phút không có số liệu, và
 *   mười lăm phút nện vào trần 60 lượt/phút dùng chung với app Quảng cáo và
 *   Quỹ chi phí. Cất lên Base thì khởi động lại chỉ mất ~35 giây.
 *
 *   BẢNG TRA TỈNH — Meta trả tên lẫn lộn: "Ho Chi Minh City", "Hanoi", nhưng
 *   "Đồng Nai Province", "Bà Rịa–Vũng Tàu Province". Tra trượt một tỉnh thì
 *   tỉnh đó biến mất khỏi bản đồ mà không ai biết là nó đã biến mất.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

console.log('\nkho trên Base và bảng tra tỉnh');

/* ---- bảng tra tỉnh: chạy THẬT mã của trang ---- */
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'tinh-vn.js'), 'utf8');
  const g = {};
  new Function('window', src)(g);          // eslint-disable-line no-new-func
  const T = g.TINH;
  ok('nạp được bảng tra', !!(T && T.tra));

  /* Đúng những tên Meta Ads thật sự trả về — chép từ phản hồi, không bịa. */
  const TEN_META = [
    ['Ho Chi Minh City', 'TP. Hồ Chí Minh'], ['Hanoi', 'Hà Nội'], ['Da Nang', 'Đà Nẵng'],
    ['Đồng Nai Province', 'Đồng Nai'], ['Bình Dương Province', 'Bình Dương'],
    ['Bắc Ninh Province', 'Bắc Ninh'], ['Bà Rịa–Vũng Tàu Province', 'Bà Rịa - Vũng Tàu'],
    ['Quảng Nam Province', 'Quảng Nam'], ['Thừa Thiên-Huế Province', 'Thừa Thiên Huế'],
    ['Khánh Hòa Province', 'Khánh Hoà'], ['Hải Phòng', 'Hải Phòng'],
  ];
  let trat = [];
  for (const [vao, mong] of TEN_META) {
    const r = T.tra(vao);
    if (!r || r.ten !== mong) trat.push(vao + ' → ' + (r ? r.ten : 'KHÔNG TRA ĐƯỢC'));
  }
  ok('tra đúng cả ' + TEN_META.length + ' tên Meta trả về', trat.length === 0, trat.join(' · '));

  /* Dấu và hậu tố không được làm trượt. */
  ok('bỏ dấu vẫn tra được', !!T.tra('ba ria vung tau'));
  ok('thêm "Province" vẫn tra được', !!T.tra('Lâm Đồng Province'));
  ok('"Hoà" và "Hòa" cùng ra một tỉnh',
    (T.tra('Khánh Hoà') || {}).ten === (T.tra('Khánh Hòa') || {}).ten);
  /* Và KHÔNG được tra bừa: tên lạ phải trả null, không gán vào tỉnh gần giống. */
  ok('tên không phải tỉnh Việt Nam thì trả null', T.tra('Bangkok') === null);
  ok('chuỗi rỗng trả null', T.tra('') === null);

  /* Toạ độ phải nằm trong khung Việt Nam — sai một dấu là chấm rơi xuống biển. */
  const xau = [];
  for (const [vao] of TEN_META) {
    const r = T.tra(vao);
    if (!r) continue;
    if (!(r.lng > 102 && r.lng < 110 && r.lat > 8 && r.lat < 24)) xau.push(r.ten + ' ' + r.lng + ',' + r.lat);
  }
  ok('mọi toạ độ nằm trong khung Việt Nam', xau.length === 0, xau.join(' · '));
}

/* ---- kho trên Base: canh những bất biến đọc được từ mã ---- */
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'kho-base.js'), 'utf8');
  ok('có nén trước khi cất', /gzipSync/.test(src));
  ok('nhận cả tệp chưa nén khi đọc (dòng cũ vẫn đọc được)',
    /0x1f && buf\[1\] === 0x8b/.test(src));
  /* Ô đính kèm của Lark CỘNG DỒN chứ không thay thế — không gỡ tệp cũ thì sau
   * mươi lần cất là mươi bản 1,6 MB nằm chồng nhau. */
  ok('gỡ tệp cũ trước khi đính tệp mới', /goTep\(rid, COT\.tep/.test(src));
  /* Kiểm JSON TRƯỚC khi ghi đè đĩa: tải về hỏng mà ghi đè là mất cả bản tốt. */
  ok('kiểm JSON trước khi ghi đè đĩa', /JSON\.parse\(raw[\s\S]{0,60}kiểm trước khi ghi đè/.test(src));
  ok('hỏng thì trả false chứ không ném (còn đường lùi về Tourwell)',
    /return false;/.test(src) && /catch \(e\)/.test(src));

  const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok('khởi động thử Base TRƯỚC khi kéo Tourwell', /khoBase\.veDia\(cfg\.tepTho\)/.test(sv));
  ok('kéo xong thì cất lên Base ngay', /khoBase\.catLen\(cfg\.tepTho/.test(sv));
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
process.exit(fail ? 1 : 0);
