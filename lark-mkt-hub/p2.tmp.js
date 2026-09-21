const fs = require('fs');
const p = 'public/quyen.js';
let s = fs.readFileSync(p, 'utf8');
const N = '\r\n';
const cu = [
  "  $('#fQuayLai').onclick = veDanhSachQuyen;",
  "  $('#fLuu').onclick = luuFormQuyen;",
].join(N);
if (!s.includes(cu)) throw new Error('không thấy chỗ gắn sự kiện');
const moi = [
  "  $('#fQuayLai').onclick = veDanhSachQuyen;",
  "  $('#fLuu').onclick = luuFormQuyen;",
  "  /* Nạp sau, không await: hộp thoại mở ngay, danh sách kênh điền vào sau. */",
  "  napKenhSocial($('#fMail').value);",
  "  $('#fMail').addEventListener('blur', () => napKenhSocial($('#fMail').value));",
].join(N);
s = s.replace(cu, moi);
fs.writeFileSync(p, s);
console.log('ok');
