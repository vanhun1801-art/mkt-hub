'use strict';
/**
 * ============================================================================
 * MỌI CUỘC GỌI RA NGOÀI PHẢI CÓ HẠN GIỜ
 * ============================================================================
 * Anh Hùng 29/09/2026: "tuyệt đối không để sót một lỗi nào… kể cả kết nối".
 *
 * Soát ra: KHÔNG cuộc gọi nào ra Lark có hạn giờ. Node để mặc định 300 giây,
 * và ngay trong đợt này lớp thử-lại vừa được thêm sẽ thử tới 3 lần — nên xấu
 * nhất là MƯỜI LĂM PHÚT treo cho một lần đăng nhập, trong khi người dùng chỉ
 * thấy một trang trắng không nói gì.
 *
 * Đây đúng là loại hỏng tệ nhất: nó không bao giờ xuất hiện lúc thử, chỉ xuất
 * hiện đúng hôm Lark có sự cố — tức đúng hôm mình cần app chạy nhất.
 *
 * Mốc chọn theo VIỆC, không chọn một số chung:
 *   · gọi Lark, gọi danh bạ, đổi token   20 giây  (bình thường dưới 1 giây)
 *   · tải tệp lên Lark                  120 giây  (ảnh vài MB qua mạng chậm)
 *   · gọi Tourwell                       30 giây  (hệ của bên khác)
 *
 * Quá hạn thì ném TimeoutError, mà câu lỗi của nó có chữ "timeout" nên
 * laTamThoi() nhận ra là lỗi tạm thời — tức là vẫn được thử lại đàng hoàng,
 * chứ không phải cắt rồi bỏ.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '\n      ' + vi : '')); }
};

const HUB = path.join(__dirname, '..');
const GOC = path.join(HUB, '..');

console.log('\nkhông cuộc gọi ra ngoài nào được phép treo vô hạn');

/* ---- quét từng lời gọi fetch trong các tệp gọi ra ngoài ---- */
const TEP = [
  ['lark-mkt-hub/base-lark.js', 'đọc/ghi Base, đổi token, tải tệp'],
  ['lark-mkt-hub/auth.js', 'đăng nhập Lark'],
  ['lark-mkt-hub/anh-dai-dien.js', 'danh bạ & ảnh đại diện'],
  ['lark-mkt-hub/nhom-lark.js', 'đọc thành viên nhóm'],
  ['lark-chung/tourwell.js', 'gọi Tourwell'],
];

/* Và cả 12 app con. Trên Render (chế độ api) thì CHÍNH chúng mới là lớp gọi
 * Lark thật — hub chỉ đọc Phân quyền, Thông báo và ô phát. Vá hub mà bỏ app
 * con là vá đúng một phần nhỏ của vấn đề. */
for (const app of ['lark-task-manager', 'lark-lich-tac-nghiep', 'lark-ads-manager',
  'lark-ota-manager', 'lark-social', 'lark-chinh-anh', 'lark-kpi', 'lark-quy-chi-phi',
  'lark-bao-cao', 'lark-san-pham', 'lark-lich-lam-viec', 'lark-kol']) {
  TEP.push([app + '/larkapi.js', 'lớp gọi Lark khi chạy trên Render']);
}

/* Kho media không có larkapi.js: nó gọi Drive qua `lark-cli` (execFile). Cùng một nguyên tắc,
 * soi theo đúng cách nó gọi ra ngoài — mỗi execFile phải khai `timeout:` trong chính lời gọi. */
/* Bản online của nó gọi Lark bằng fetch (lark-api.js) → soi như larkapi.js của các app khác */
TEP.push(['lark-kho-media/lark-api.js', 'Kho media gọi Drive bằng khoá app khi chạy trên Render']);
for (const tep of ['server.js', 'tac-nghiep.js', 'dong-bo-len.js', 'gan-the/chuan-bi.js']) {
  const s = fs.readFileSync(path.join(GOC, 'lark-kho-media', tep), 'utf8');
  const viTri = []; let i = -1;
  while ((i = s.indexOf('execFile(', i + 1)) !== -1) viTri.push(i);
  const thieu = viTri.filter(v => !/timeout:/.test(s.slice(v, v + 400))).map(v => 'dòng ' + s.slice(0, v).split('\n').length);
  ok('lark-kho-media/' + tep + ': cả ' + viTri.length + ' lời gọi lark-cli đều có hạn giờ',
    viTri.length > 0 && thieu.length === 0, viTri.length ? 'còn treo ở ' + thieu.join(', ') : 'không tìm thấy lời gọi nào');
}

/* Từ 29/09/2026 larkapi.js của 12 app là vỏ mỏng gọi lõi lark-chung/lark-core.js
 * (docs/hop-nhat-du-lieu.md): app nào uỷ quyền cho lõi thì soi lõi thay cho nó. */
const LOI = path.join(GOC, 'lark-chung', 'lark-core.js');
const nguonThat = (p) => {
  const s = fs.readFileSync(p, 'utf8');
  return /require\(['"][^'"]*lark-core['"]\)|require\(['"]\.\/lark['"]\)/.test(s) ? fs.readFileSync(LOI, 'utf8') : s;
};

for (const [tep, viec] of TEP) {
  const s = nguonThat(path.join(GOC, tep));
  /* Cắt từ mỗi `fetch(` tới dấu `});` gần nhất — đủ để thấy có khai signal
   * trong CHÍNH lời gọi đó hay không. Đếm theo từng lời gọi chứ không đếm cả
   * tệp: một tệp có 3 lời gọi mà chỉ 1 chỗ đặt hạn thì vẫn còn 2 chỗ treo. */
  const viTri = [];
  let i = -1;
  while ((i = s.indexOf('await fetch(', i + 1)) !== -1) viTri.push(i);
  const thieu = [];
  for (const v of viTri) {
    const het = s.indexOf('});', v);
    const doan = s.slice(v, het === -1 ? v + 400 : het + 3);
    if (!/signal:/.test(doan)) thieu.push('dòng ' + (s.slice(0, v).split('\n').length));
  }
  ok(tep + ' (' + viec + '): cả ' + viTri.length + ' lời gọi đều có hạn giờ',
    viTri.length > 0 && thieu.length === 0,
    viTri.length === 0 ? 'không tìm thấy lời gọi nào — phép thử đang soi nhầm tệp'
      : 'còn treo ở ' + thieu.join(', '));
}

/* ---- mốc phải hợp lý: không quá ngắn để cắt oan, không quá dài thành vô nghĩa ---- */
const bl = fs.readFileSync(path.join(HUB, 'base-lark.js'), 'utf8');
const soGoi = Number((/const HAN_GOI = (\d+)/.exec(bl) || [])[1]);
const soTai = Number((/const HAN_TAI = (\d+)/.exec(bl) || [])[1]);
ok('hạn gọi Base nằm trong khoảng hợp lý (10–60 giây)', soGoi >= 10000 && soGoi <= 60000, String(soGoi));
ok('hạn tải tệp rộng hơn hạn gọi (ảnh vài MB cần thời gian thật)', soTai > soGoi, soTai + ' vs ' + soGoi);

const tw = fs.readFileSync(path.join(GOC, 'lark-chung', 'tourwell.js'), 'utf8');
ok('hạn gọi Tourwell nằm trong khoảng hợp lý', /AbortSignal\.timeout\((?:2|3|4|6)0000\)/.test(tw));

/* ---- và quá hạn phải được coi là lỗi TẠM THỜI, không phải lỗi vĩnh viễn ----
 * Nếu không, hạn giờ biến một sự cố thoáng qua thành một lần hỏng dứt khoát —
 * tức là chữa một bệnh bằng cách gây một bệnh khác. */
ok('lớp thử lại nhận ra lỗi quá hạn', /timeout|timed out/i.test(
  (/const laTamThoi = [\s\S]*?\};/.exec(bl) || [''])[0]));

/* Chốt bằng hành vi thật của Node, không chỉ bằng chữ trong mã: câu lỗi mà
 * AbortSignal.timeout ném ra phải khớp được với biểu thức đó. */
(async () => {
  let e;
  try {
    await fetch('http://127.0.0.1:9', { signal: AbortSignal.timeout(1) });
  } catch (x) { e = x; }
  const cau = String((e && e.message) || '');
  ok('câu lỗi quá hạn của Node khớp biểu thức đang dùng',
    /timeout|timed out|fetch failed/i.test(cau), cau);

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
  process.exit(fail ? 1 : 0);
})();
