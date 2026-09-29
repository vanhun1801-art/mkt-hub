'use strict';
/* Bước 1 của lượt gắn thẻ hằng ngày: chọn N ảnh/video CHƯA có thẻ, lấy ảnh thu nhỏ,
   ghép thành tấm 5×4 đánh số để Claude xem một lượt 20 cái.
   Chạy: node gan-the/chuan-bi.js [--so 1000]
   Ra: du-lieu/gan-the/lo/{lo.json, danh-sach.txt, to-00.jpg…}   Chỉ ĐỌC Drive. */
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const { DL, docMedia, docThe } = require('../chi-muc');

const SO = +(process.argv[process.argv.indexOf('--so') + 1] || 0) || 1000;
const MOI_TO = 20;
const GT = path.join(DL, 'gan-the');
const LO = path.join(GT, 'lo');
const ANH = path.join(DL, 'anh');
const KHONG_ANH = path.join(GT, 'khong-anh.json');
const CLI = process.env.LARK_CLI_JS ||
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@larksuite', 'cli', 'scripts', 'run.js');

function layAnh(t) {
  const co = ['.png', '.jpg', '.jpeg', '.webp'].map(d => path.join(ANH, t + '-grid' + d)).find(f => fs.existsSync(f));
  if (co) return Promise.resolve(co);
  return new Promise(ok => execFile(process.execPath, [CLI, 'drive', '+cover', '--file-token', t, '--spec', 'grid', '--output', t + '-grid', '--if-exists', 'overwrite', '--format', 'json'],
    { cwd: ANH, timeout: 30000, maxBuffer: 5e6 }, (e, out) => {
      try { const j = JSON.parse(out); ok(j.ok && fs.existsSync(j.data.output_path) ? j.data.output_path : null); } catch (er) { ok(null); }
    }));
}

(async () => {
  const d = docMedia();
  if (!d) { console.log('Chưa có du-lieu/cay.json — chạy node quet-drive.js trước'); process.exit(1); }
  if (fs.existsSync(path.join(LO, 'lo.json'))) {
    console.log('Lô cũ chưa ghi thẻ còn ở du-lieu/gan-the/lo — chạy ghi-the.js trước (hoặc xoá thư mục lo nếu muốn bỏ).');
    process.exit(2);
  }
  const the = docThe();
  let khongAnh = {};
  try { khongAnh = JSON.parse(fs.readFileSync(KHONG_ANH, 'utf8')); } catch (e) {}
  const cho = d.items.filter(i => i.loai !== 'r' && !the[i.t] && !khongAnh[i.t]);
  /* File mới tải lên trước; trong cùng đợt tải thì xoay vòng giữa các thư mục cho lô đa dạng */
  /* Media của lịch tác nghiệp vừa hoàn tất lên trước hết (lịch mới nhất trước), rồi mới tới file mới tải */
  const kt = i => (i.tn && d.lich[i.tn] ? d.lich[i.tn].kt : 0);
  cho.sort((a, b) => kt(b) - kt(a) || b.mod - a.mod);
  const theoTM = new Map();
  for (const i of cho) { const k = i.duong.join('/'); if (!theoTM.has(k)) theoTM.set(k, []); theoTM.get(k).push(i); }
  const chon = [];
  const cacTM = [...theoTM.values()];
  for (let vong = 0; chon.length < SO * 1.1 && cacTM.some(a => a.length > vong); vong++)
    for (const a of cacTM) { if (a[vong]) chon.push(a[vong]); if (chon.length >= SO * 1.1) break; }
  console.log(`Chưa gắn thẻ: ${cho.length} · lấy lô ${Math.min(SO, chon.length)}`);

  fs.mkdirSync(LO, { recursive: true }); fs.mkdirSync(ANH, { recursive: true });
  const co = [];
  let k = 0, loi = 0;
  const chay = async () => {
    while (k < chon.length && co.length < SO) {
      const i = chon[k++];
      const f = await layAnh(i.t);
      if (f) co.push({ i, f }); else { khongAnh[i.t] = Date.now(); loi++; }
    }
  };
  await Promise.all([chay(), chay(), chay(), chay()]);
  fs.writeFileSync(KHONG_ANH, JSON.stringify(khongAnh));
  co.splice(SO);
  co.sort((a, b) => a.i.duong.join('/').localeCompare(b.i.duong.join('/')));

  const lo = co.map((x, n) => ({ so: n, t: x.i.t, ten: x.i.ten, loai: x.i.loai, duong: x.i.duong.join(' / ') }));
  fs.writeFileSync(path.join(LO, 'lo.json'), JSON.stringify(lo, null, 1));
  fs.writeFileSync(path.join(LO, 'danh-sach.txt'), lo.map(x => `${x.so} | ${x.loai === 'v' ? 'video' : 'ảnh'} | ${x.duong} / ${x.ten}`).join('\n'));
  fs.writeFileSync(path.join(LO, 'anh.txt'), co.map(x => x.f).join('\n'));
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'ghep.ps1'), path.join(LO, 'anh.txt'), LO, String(MOI_TO)], { stdio: 'inherit' });
  console.log(`Xong: ${lo.length} media · ${Math.ceil(lo.length / MOI_TO)} tấm · ${loi} file Lark không có ảnh thu nhỏ (bỏ qua, ghi vào khong-anh.json)`);
})();
