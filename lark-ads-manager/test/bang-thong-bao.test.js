/**
 * Kiểm các BĂNG CẢNH BÁO trên đầu trang: băng nào được hiện trong tình huống nào.
 *
 * Hai lỗi của bản trước, đều là lỗi của tôi:
 *   1. Nó đọc `ADS_CONNECT_JSON.txt` — file chỉ có sau khi chạy `node tao-env.js`,
 *      và chứa TOKEN THẬT. Xoá file là bộ này nổ ngay lúc nạp module.
 *   2. Nó chỉ `console.log` chứ không kiểm gì cả, nên không bao giờ báo FAIL —
 *      chạy xong luôn "xanh" kể cả khi băng hiện sai.
 * Nay dùng token giả từ test/mau-cau-hinh.js và kiểm bằng câu khẳng định thật.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const mauCH = require('./mau-cau-hinh');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const ENV = mauCH.json();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bang-'));

/* Tên file cấu hình phải TƯƠNG ĐỐI: sync/ketnoi.js tính đường dẫn bằng
 * path.join(__dirname,'..',cfg.connectFile) nên đường dẫn tuyệt đối bị nối thành rác. */
const doc = [];
const ghiTam = (ten, noiDung) => {
  fs.writeFileSync(path.join(process.cwd(), ten), noiDung);
  doc.push(ten);
  return ten;
};
process.on('exit', () => doc.forEach((x) => { try { fs.unlinkSync(path.join(process.cwd(), x)); } catch (_) {} }));

const KHONG_CO = path.join(tmp, 'khong-co.json');
const CO_TOKEN = ghiTam('ket-noi.bang-test.json', ENV);

function trangThai(env, file) {
  const ra = cp.execFileSync(process.execPath, ['-e',
    `const k=require(${JSON.stringify(path.resolve('sync/ketnoi.js'))});
     const s=k.status();
     console.log(JSON.stringify({ nguon:s.nguon, oDiaTam:s.oDiaTam, canhBao:s.canhBaoODiaTam,
       coKenhSanSang: s.providers.some(p=>p.sanSang) }));`],
  { env: { ...process.env, ...env, LARK_CONNECT_FILE: file }, cwd: process.cwd(), encoding: 'utf8' });
  return JSON.parse(ra.trim().split('\n').pop());
}

console.log('— Render + ADS_CONNECT_JSON, không có file (cách đúng, không mất token khi deploy)');
let s = trangThai({ RENDER: '1', ADS_CONNECT_JSON: ENV }, KHONG_CO);
t('đọc từ biến môi trường', s.nguon === 'env', s.nguon);
t('băng "Chưa nối kênh nào" ẨN', s.coKenhSanSang === true);
t('băng "ổ đĩa là tạm" ẨN — token nằm ở env nên deploy không mất',
  s.canhBao === false, JSON.stringify(s));

console.log('— Render nhưng token chỉ nằm trên đĩa (deploy sau là mất)');
s = trangThai({ RENDER: '1' }, CO_TOKEN);
t('đọc từ file', s.nguon === 'file', s.nguon);
t('vẫn có kênh sẵn sàng', s.coKenhSanSang === true);
t('băng "ổ đĩa là tạm" PHẢI HIỆN — đây là cảnh báo đáng tiền nhất của thẻ này',
  s.canhBao === true, JSON.stringify(s));

console.log('— máy cá nhân, có file: không doạ người dùng vô cớ');
s = trangThai({}, CO_TOKEN);
t('đọc từ file', s.nguon === 'file', s.nguon);
t('không phải ổ đĩa tạm', s.oDiaTam === false);
t('băng "ổ đĩa là tạm" ẨN', s.canhBao === false);
t('băng "Chưa nối kênh nào" ẨN', s.coKenhSanSang === true);

console.log('— chưa nối gì cả: băng mời nối kênh phải hiện');
const RONG = ghiTam('ket-noi.bang-rong-test.json', JSON.stringify({ dongBo: { soNgayLui: 7 } }));
s = trangThai({}, RONG);
t('không kênh nào sẵn sàng', s.coKenhSanSang === false, JSON.stringify(s));

console.log('— cấu hình CHỈ có gian hàng POS vẫn được coi là có thông tin');
/* Nếu khoiCoThongTin() không nhìn thấy shops[].apiKey thì read() coi file là trắng
 * và lùi về ADS_CONNECT_JSON — tức xoá sạch phần người dùng vừa nhập. */
const CHI_POS = ghiTam('ket-noi.bang-pos-test.json', JSON.stringify({
  pancakePos: { enabled: true, shops: [{ shopId: '454586', apiKey: 'aaaaaaaabbbbbbbbccccccccdddddddd' }] },
}));
const giu = cp.execFileSync(process.execPath, ['-e',
  `const k=require(${JSON.stringify(path.resolve('sync/ketnoi.js'))});
   const c=k.read();
   console.log(JSON.stringify({ soGian:(c.pancakePos.shops||[]).length, nguon:k.status().nguon }));`],
{ env: { ...process.env, RENDER: '1', ADS_CONNECT_JSON: ENV, LARK_CONNECT_FILE: CHI_POS },
  cwd: process.cwd(), encoding: 'utf8' });
const gs = JSON.parse(giu.trim().split('\n').pop());
t('file thắng, không bị env đè', gs.nguon === 'file', JSON.stringify(gs));
t('gian hàng vừa nhập còn nguyên', gs.soGian === 1, JSON.stringify(gs));

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
