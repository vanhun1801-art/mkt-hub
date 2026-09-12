'use strict';
/**
 * ============================================================================
 * Số bản của file tĩnh — deploy xong phải thấy bản mới, không phải bản cũ
 * ============================================================================
 * Chuyện đã xảy ra: anh Hùng deploy bản có trình sửa khung giờ ngay trong Cài
 * đặt, nhưng màn hình vẫn hiện hàng "Sửa khung giờ hằng tuần … [Mở app]" của
 * mấy commit trước, rồi bấm Mở app thì chẳng tới chỗ nào sửa được. Code trên
 * Render đúng; cái sai là máy anh vẫn chạy caidat.js cũ trong cache.
 *
 * Vì sao lọt: index.html khai loc.js/i18n.js/tbapp.js kèm ?v=BUILD, còn
 * app.js, caidat.js, quyen.js, nhanh.js, styles.css thì khai trần. Hub lại
 * không gửi Cache-Control nào cho file tĩnh, nên trình duyệt tự quyết — và nó
 * quyết giữ bản cũ. Loại lỗi này im lặng tuyệt đối: không log, không lỗi đỏ,
 * chỉ là "em bảo làm rồi mà anh có thấy đâu".
 *
 * Nên bài này gác hai điều:
 *   1. MỌI file tĩnh của chính hub khai trong index.html đều phải có ?v=BUILD;
 *   2. verTinh() phải nhìn cả thư mục public, không phải một danh sách chép tay
 *      (danh sách cũ vừa sót caidat.js vừa kê i18n.js hai lần).
 *
 * Chạy: node test/so-ban.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (vi ? ' — ' + vi : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const GOC = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(GOC, 'public', 'index.html'), 'utf8');

group('index.html — không file nào được khai trần');
{
  /* Chỉ soi file của chính hub (đường dẫn bắt đầu bằng "/"), bỏ qua CDN nếu
   * sau này có. Lấy cả src= của <script> lẫn href= của <link rel=stylesheet>. */
  const ref = [];
  const re = /(?:src|href)="(\/[^"]+\.(?:js|css)[^"]*)"/g;
  let m;
  while ((m = re.exec(html))) ref.push(m[1]);

  ok('có bắt được file tĩnh để soi', ref.length >= 5,
    'chỉ thấy ' + ref.length + ' file — mẫu regex hỏng thì bài này gác gió');

  const tran = ref.filter((r) => !/[?&]v=/.test(r));
  ok('mọi .js/.css của hub đều kèm ?v=', tran.length === 0,
    'khai trần: ' + tran.join(', ') + ' — deploy xong trình duyệt vẫn giữ bản cũ');

  /* Phải đúng chữ BUILD: server.js chỉ thay chuỗi "v=BUILD". Ai đóng đinh một
   * số bản bằng tay (v=7) thì file đó đứng yên mãi mãi — còn tệ hơn khai trần
   * vì nhìn thì tưởng đã có đánh số. */
  const laBUILD = ref.filter((r) => /[?&]v=/.test(r) && !/[?&]v=BUILD\b/.test(r));
  ok('số bản là ?v=BUILD chứ không phải số đóng đinh', laBUILD.length === 0,
    'đóng đinh: ' + laBUILD.join(', '));
}

group('server.js — có thay BUILD bằng số bản thật');
{
  const sv = fs.readFileSync(path.join(GOC, 'server.js'), 'utf8');
  ok('server thay chuỗi v=BUILD khi trả index.html',
    sv.includes("split('v=BUILD').join('v=' + cfg.verChung)"),
    'không thay thì trình duyệt xin đúng file tên "?v=BUILD", số bản đứng im');
}

group('verTinh() — quét cả thư mục, không chép tay danh sách');
{
  const cfgSrc = fs.readFileSync(path.join(GOC, 'config.js'), 'utf8');
  const than = (cfgSrc.match(/function verTinh\(\)[\s\S]*?\n}/) || [''])[0];

  ok('verTinh() có trong config.js', than.length > 0);
  ok('verTinh() đọc thư mục public', /readdirSync/.test(than),
    'còn chép tay danh sách file thì file thêm sau này lại lọt sổ — đúng cái đã ' +
    'xảy ra với caidat.js');
  ok('verTinh() không còn danh sách file chép tay', !/'public\/[a-z0-9.-]+'/i.test(than),
    'trong thân hàm vẫn còn tên file cứng');

  /* Sự thật cuối cùng: số bản phải bằng mốc sửa gần nhất của cả thư mục. Đây là
   * câu duy nhất chứng minh được "file nào đổi cũng đổi số bản". */
  const cfg = require(path.join(GOC, 'config.js'));
  const d = path.join(GOC, 'public');
  let max = 0;
  for (const f of fs.readdirSync(d)) {
    const st = fs.statSync(path.join(d, f));
    if (st.isFile()) max = Math.max(max, st.mtimeMs);
  }
  ok('verChung = mốc sửa gần nhất trong public',
    cfg.verChung === String(Math.round(max / 1000)),
    'verChung=' + cfg.verChung + ' còn mốc thật=' + Math.round(max / 1000));

  /* Và phải thật sự đổi khi caidat.js đổi — chứ không chỉ "đúng công thức". */
  const tep = path.join(d, 'caidat.js');
  const cu = fs.statSync(tep).mtime;
  try {
    /* Phải là mốc TƯƠNG LAI so với cả thư mục, không phải "cũ + 1 tiếng":
     * caidat.js vốn là file cũ, cộng một tiếng vào vẫn thua index.html sửa hôm
     * nay, thế thì số bản đứng im là đúng và câu kiểm này báo oan. */
    const sau = new Date(Date.now() + 3600000);
    fs.utimesSync(tep, sau, sau);
    delete require.cache[require.resolve(path.join(GOC, 'config.js'))];
    const lai = require(path.join(GOC, 'config.js'));
    ok('sửa caidat.js là số bản đổi theo',
      lai.verChung !== cfg.verChung,
      'caidat.js mới hơn 1 tiếng mà verChung vẫn ' + lai.verChung);
  } finally {
    fs.utimesSync(tep, cu, cu);
  }
}

console.log('\n' + '─'.repeat(56));
console.log('  ' + pass + ' pass · ' + fail + ' fail');
if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
console.log('─'.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
