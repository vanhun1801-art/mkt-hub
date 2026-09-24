'use strict';
/* ==========================================================================
   CẬP NHẬT BẢN ĐỒ THEO BASE "SẢN PHẨM" (anh Hùng 26/09)

     1. kéo dữ liệu tour mới nhất từ Base (tao/du-lieu.js — cần máy còn đăng nhập lark-cli)
     2. so với lần trước: tour mới / bị gỡ / đổi giá / đổi trạng thái / đổi tên, lịch, thời lượng
     3. báo sản phẩm ĐANG BÁN trên Base nhưng chưa gắn vào điểm nào → chưa lên bản đồ
     4. đóng gói lại (kèm hình trong hinh-rieng/) + chép ra Desktop
     5. ghi nhật ký: lark-ban-do/NHAT-KY-CAP-NHAT.txt (mới nhất ở trên)

   Kéo Base lỗi (hết phiên đăng nhập, mất mạng) → GIỮ NGUYÊN dữ liệu cũ, vẫn đóng gói hình.
   Chạy:  node tao/cap-nhat.js        (hoặc bấm đúp hinh-rieng/CAP-NHAT-BAN-DO.bat)
          node tao/cap-nhat.js --thu  (chỉ kéo + so, không đóng gói)
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const GOC = path.join(__dirname, '..');
const DL = path.join(GOC, 'public', 'du-lieu.js');
const DESKTOP = path.join(require('os').homedir(), 'Desktop', 'Ban-do-du-lich-Phu-Quoc-thu-nghiem-2b.html');
const NHAT_KY = path.join(GOC, 'NHAT-KY-CAP-NHAT.txt');

const doc = (f) => { try { global.window = {}; eval(fs.readFileSync(f, 'utf8')); return window.PQ_DU_LIEU; } catch (_) { return null; } };
const gia = (n) => (n == null ? '—' : Number(n).toLocaleString('vi-VN') + 'đ');
const tenTour = (t) => t.ten + ' (' + t.ma + ')';

function soSanh(cu, moi) {
  const d = [];
  const a = (cu && cu.tour) || {}, b = moi.tour || {};
  for (const ma of Object.keys(b)) if (!a[ma]) d.push('＋ Tour mới lên bản đồ: ' + tenTour(b[ma]) + ' · ' + gia(b[ma].giaNL));
  for (const ma of Object.keys(a)) if (!b[ma]) d.push('－ Gỡ khỏi bản đồ (ngừng bán / đổi mã): ' + tenTour(a[ma]));
  const TRUONG = [['giaNL', 'giá NL', gia], ['giaTE', 'giá TE', gia], ['sauGiamNL', 'giá ưu đãi NL', gia], ['sauGiamTE', 'giá ưu đãi TE', gia],
    ['ten', 'tên', String], ['thoiLuong', 'thời lượng', String], ['khoiHanh', 'khởi hành', String],
    ['sapRaMat', 'sắp ra mắt', (v) => (v ? 'có' : 'không')], ['noiBat', 'nổi bật', (v) => (v ? 'có' : 'không')]];
  for (const ma of Object.keys(b)) {
    if (!a[ma]) continue;
    for (const [k, nhan, dang] of TRUONG) {
      if (JSON.stringify(a[ma][k] ?? null) !== JSON.stringify(b[ma][k] ?? null)) d.push('～ ' + tenTour(b[ma]) + ': ' + nhan + ' ' + dang(a[ma][k]) + ' → ' + dang(b[ma][k]));
    }
    if (JSON.stringify(a[ma].usp || []) !== JSON.stringify(b[ma].usp || [])) d.push('～ ' + tenTour(b[ma]) + ': đổi điểm nổi bật (USP)');
  }
  return d;
}

(async () => {
  const chiThu = process.argv.includes('--thu');
  const cu = doc(DL);
  const dong = [];
  let keoDuoc = false;
  console.log('① Kéo dữ liệu tour từ Base "Sản phẩm"…');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'du-lieu.js')], { stdio: 'inherit', timeout: 5 * 60 * 1000 });
    keoDuoc = true;
  } catch (e) {
    dong.push('⚠ KHÔNG kéo được dữ liệu Base (hết đăng nhập lark-cli hoặc mất mạng?) — giữ nguyên dữ liệu cũ.');
  }
  const moi = doc(DL) || cu;

  if (keoDuoc) {
    console.log('② So với lần trước…');
    const d = soSanh(cu, moi);
    dong.push(d.length ? 'Thay đổi so với lần trước (' + d.length + '):' : 'Base không có thay đổi nào ảnh hưởng bản đồ.');
    for (const x of d) dong.push('   ' + x);
    try {
      const cg = JSON.parse(fs.readFileSync(path.join(__dirname, 'dem', 'chua-gan.json'), 'utf8'));
      if (cg.chuaGan.length) {
        dong.push('Sản phẩm ĐANG BÁN trên Base nhưng CHƯA gắn vào điểm nào nên chưa lên bản đồ (' + cg.chuaGan.length + '):');
        for (const p of cg.chuaGan) dong.push('   · ' + p.ma + ' — ' + p.ten + (p.nhom ? ' [' + p.nhom + ']' : ''));
        dong.push('   → muốn lên bản đồ: thêm mã vào "tour" của điểm tương ứng trong diem.js (hoặc nhờ Claude).');
      }
      if (cg.thieu.length) dong.push('Mã tour có trong diem.js nhưng KHÔNG tìm thấy trên Base: ' + cg.thieu.join(', '));
    } catch (_) { /* chưa có báo cáo */ }
  }

  if (!chiThu) {
    console.log('③ Đóng gói bản đồ…');
    execFileSync(process.execPath, [path.join(__dirname, 'dong-goi.js')], { stdio: 'inherit' });
    try { fs.copyFileSync(path.join(GOC, 'dist', 'ban-do-phu-quoc.html'), DESKTOP); dong.push('Đã cập nhật file: ' + DESKTOP); }
    catch (e) { dong.push('⚠ Không chép được ra Desktop: ' + e.message); }
  }

  const luc = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const bao = '===== ' + luc + ' =====\n' + dong.join('\n') + '\n\n';
  let cuLog = ''; try { cuLog = fs.readFileSync(NHAT_KY, 'utf8'); } catch (_) { /* lần đầu */ }
  fs.writeFileSync(NHAT_KY, bao + cuLog.slice(0, 200000));
  console.log('\n' + bao + '(Nhật ký: ' + NHAT_KY + ')');
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
