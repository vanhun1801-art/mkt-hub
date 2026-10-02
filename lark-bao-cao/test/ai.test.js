'use strict';
/**
 * ============================================================================
 * Đường AI nhận xét báo cáo — chốt an toàn, không cần Base
 * ============================================================================
 * Ba bước: ai/chuan-bi.js gom dữ liệu ẩn danh → Claude viết nhận xét → ai/ghi.js
 * ghi vào Base. Bài này canh hai thứ không được sai, vì sai thì KHÔNG AI NHÌN
 * RA BẰNG MẮT:
 *
 *   1. Nhận xét rơi nhầm người. Mã NS1, NS2… đánh lại mỗi lượt theo danh sách
 *      người có báo cáo trong kỳ. Lượt 01/10 có một người, chạy lại 02/10 có
 *      sáu người, thứ tự khác. Đem tệp kết quả cũ ghi bằng bảng mã mới là nhận
 *      xét của người này nằm trong phiếu người kia — mà nhận xét nào trông cũng
 *      hợp lý, nên không ai phát hiện.
 *   2. Lộ danh tính sang phía AI. Tệp đưa AI đọc chỉ được có mã NS.
 *
 * Chạy: node test/ai.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-ai-'));

group('ghi.js chặn tệp kết quả lạc lượt — trước khi chạm Base');
{
  const tepKq = path.join(tmp, 'ket-qua.json');
  const tepMa = path.join(tmp, 'ma.json');
  fs.writeFileSync(tepKq, JSON.stringify({ nguoi: [{ ma: 'NS1', nhanXet: 'x' }] }));
  fs.writeFileSync(tepMa, JSON.stringify({ loai: 'tuan', tu: 1790355600000,
    ma: { NS1: { id: 'ou_a', email: 'a@x.vn', ten: 'A' } } }));
  /* Bảng mã sửa SAU tệp kết quả 10 giây = hai lượt khác nhau. */
  const sau = new Date(Date.now() + 10000);
  fs.utimesSync(tepMa, sau, sau);

  let ra = '', ma = 0;
  try {
    execFileSync(process.execPath, [path.join(GOC, 'ai', 'ghi.js'), tepKq, tepMa],
      { cwd: GOC, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { ma = e.status; ra = String(e.stderr || '') + String(e.stdout || ''); }

  ok('bảng mã mới hơn kết quả thì DỪNG', ma === 1, 'mã thoát: ' + ma);
  ok('nói rõ vì sao dừng', /lẫn người|hai lượt khác nhau/.test(ra), ra.slice(0, 160));
  ok('và chưa ghi được dòng nào', !/đã ghi|xong:/.test(ra), ra.slice(0, 160));
}

group('Hai chốt phải còn trong mã nguồn');
{
  const cb = fs.readFileSync(path.join(GOC, 'ai', 'chuan-bi.js'), 'utf8');
  const gh = fs.readFileSync(path.join(GOC, 'ai', 'ghi.js'), 'utf8');

  ok('chuan-bi dọn tệp kết quả của lượt trước',
    /ket-qua-' \+ ten \+ '\.json/.test(cb) && /renameSync/.test(cb),
    'để nguyên thì lượt sau hỏng giữa chừng là tệp cũ bị đem đi ghi');
  ok('ghi.js so giờ sửa hai tệp', /mtimeMs/.test(gh) && /process\.exit\(1\)/.test(gh));

  /* Bảng mã → tên thật phải nằm NGOÀI tệp đưa AI đọc (luật chốt 12/09). */
  ok('tệp dữ liệu và bảng mã là hai tệp rời',
    /'ma-' \+ ten \+ '\.json'/.test(cb) && /tepDuLieu/.test(cb));
  ok('chỉ ghi.js đọc bảng mã', /tepMa/.test(gh) && !/ma-.*\.json/.test(
    cb.slice(cb.indexOf('tepDuLieu = '), cb.indexOf('fs.writeFileSync(tepDuLieu'))));
  ok('AI không chấm điểm — không đụng ô Điểm AI',
    !/diemAI/i.test(gh), 'luật anh Hùng chốt 12/09: điểm do luật, không do AI');
}

group('Tệp đưa AI đọc không được lộ danh tính');
{
  /* Đọc tệp thật đã sinh ra trên máy này (nếu có) — mẫu giả không bắt được lỗi
   * kiểu "quên bỏ cột email". */
  const thuMuc = path.join(GOC, 'ai', 'du-lieu');
  const ds = fs.existsSync(thuMuc)
    ? fs.readdirSync(thuMuc).filter((f) => /^(tuan|thang)-\d+\.json$/.test(f)) : [];
  if (!ds.length) {
    console.log('  – bỏ qua: chưa có tệp dữ liệu nào trên máy này');
  } else {
    const s = fs.readFileSync(path.join(thuMuc, ds[0]), 'utf8');
    ok('không có open_id trong tệp đưa AI đọc (' + ds[0] + ')', !/ou_[0-9a-f]{8}/.test(s));
    ok('không có email', !/@[a-z0-9-]+\.(com|vn)/i.test(s));
    ok('người được gọi bằng mã NS', /"ma": ?"NS1"/.test(s));
  }
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

console.log('\n' + '─'.repeat(56));
console.log('  ' + pass + ' pass · ' + fail + ' fail');
if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
console.log('─'.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
