'use strict';
/* Đóng gói chỉ mục (ĐÃ lọc dữ liệu nhạy cảm) + mô tả AI + lịch tác nghiệp + từ đồng nghĩa thành
   MỘT file nén, rồi ghi đè lên Drive — bản online (Render) không tự liệt kê được thư mục Drive
   (app Marketing Hub bị 403 khi list), nên máy nội bộ quét rồi gửi kết quả lên cho nó.
   Chạy tay: node dong-bo-len.js        Server nội bộ tự gọi sau mỗi lần dữ liệu đổi (≤10 phút/lần).
   Mã file đích nằm ở dong-bo.json (không phải bí mật: chỉ người/app trong tenant có quyền mới đọc được). */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { DL, docMedia, docThe } = require('./chi-muc');

const CAU_HINH = path.join(__dirname, 'dong-bo.json');
const CLI = process.env.LARK_CLI_JS ||
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@larksuite', 'cli', 'scripts', 'run.js');

function dongGoi() {
  const d = docMedia();
  if (!d) throw new Error('chưa có du-lieu/cay.json');
  const the = docThe();
  let dongNghia = null;
  try { dongNghia = JSON.parse(fs.readFileSync(path.join(DL, 'hoc', 'dong-nghia.json'), 'utf8')); } catch (e) {}
  /* chỉ gửi đúng những gì bản online cần — không gửi cả cây 123 nghìn dòng thô */
  const items = d.items.map(i => [i.t, i.ten, i.duong.join('/'), i.loai, i.nam || 0, i.mod, i.tn || '']);
  const theCo = {}; for (const i of d.items) if (the[i.t]) theCo[i.t] = the[i.t];
  const tm = [...d.tm.entries()];
  const goi = { phien: 1, luc: 0, quetLuc: d.quetLuc, loaiNhayCam: d.loaiNhayCam, gop: d.gop, items, the: theCo, tm, lich: d.lich, dongNghia };
  /* Băm nội dung KHÔNG kể mốc giờ đóng gói: hai gói cùng dữ liệu thì cùng mã băm, dayLen() dựa
     vào đó để khỏi đẩy lại 3 MB lên Drive mỗi 15 phút khi chẳng có gì mới. */
  bamGoiCuoi = crypto.createHash('sha1').update(JSON.stringify(goi)).digest('hex');
  goi.luc = Date.now();
  return zlib.gzipSync(Buffer.from(JSON.stringify(goi)), { level: 9 });
}
let bamGoiCuoi = '';

function cli(args, cwd) {
  return new Promise((ok, loi) => execFile(process.execPath, [CLI, ...args, '--format', 'json'], { cwd, timeout: 180000, maxBuffer: 5e6 }, (e, out) => {
    let j = null; try { j = JSON.parse(out); } catch (er) {}
    if (j && j.ok) ok(j.data); else loi(new Error((j && j.error && j.error.message) || (e && e.message) || 'lark-cli lỗi'));
  }));
}

async function dayLen() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CAU_HINH, 'utf8')); } catch (e) {}
  if (!cfg.thuMuc) throw new Error('dong-bo.json chưa có thuMuc (thư mục Drive chứa gói chỉ mục)');
  const buf = dongGoi();
  /* Cùng nội dung với lần đẩy trước (mã băm lưu trong dong-bo.json nên sống qua lần bật lại) → thôi */
  if (cfg.file && cfg.bam === bamGoiCuoi) return { bytes: buf.length, file: cfg.file, boQua: true };
  const tam = path.join(DL, 'goi-chi-muc.json.gz');
  fs.writeFileSync(tam, buf);
  const args = ['drive', '+upload', '--file', path.basename(tam), '--name', 'kho-media-chi-muc.json.gz'];
  if (cfg.file) args.push('--file-token', cfg.file); else args.push('--folder-token', cfg.thuMuc);
  const r = await cli(args, DL);
  const token = r.file_token || (r.file && r.file.token) || cfg.file;
  if (token) { cfg.file = token; cfg.bam = bamGoiCuoi; fs.writeFileSync(CAU_HINH, JSON.stringify(cfg, null, 2) + '\n'); }
  return { bytes: buf.length, file: token };
}

module.exports = { dongGoi, dayLen };
if (require.main === module) dayLen().then(r => console.log('Đã đẩy gói chỉ mục:', r)).catch(e => { console.error('Lỗi:', e.message); process.exit(1); });
