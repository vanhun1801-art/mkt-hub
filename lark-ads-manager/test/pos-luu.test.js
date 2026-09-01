/**
 * Test quy tắc LƯU cấu hình Pancake POS.
 *
 * Vì sao tách riêng: mọi bài kiểm ở đây phải GHI vào file cấu hình. Tôi đã một lần
 * chạy phép thử writePancakePos thẳng vào `ket-noi.json` thật và **xoá mất khoá
 * Facebook đang dùng** — vì hàm này dọn dạng cũ sau khi lưu. Nên ở đây luôn dùng
 * file tạm, và tên file phải TƯƠNG ĐỐI: sync/ketnoi.js tính đường dẫn bằng
 * path.join(__dirname,'..',cfg.connectFile) nên đường dẫn tuyệt đối bị nối thành rác.
 *
 * Quy tắc quan trọng nhất được kiểm: ô khoá để TRỐNG = giữ nguyên khoá cũ của gian
 * đó. Không có nó thì mỗi lần người dùng sửa tên gian là mất khoá.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  ok  ' + name); }
  else { fail += 1; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};

const FILE = 'ket-noi.pos-test.json';
const duong = path.join(process.cwd(), FILE);
const doc = [FILE];
process.on('exit', () => doc.forEach((x) => { try { fs.unlinkSync(path.join(process.cwd(), x)); } catch (_) {} }));

/** Chạy một đoạn trong tiến trình con, với file cấu hình tạm. */
function chay(js, batDau) {
  fs.writeFileSync(duong, JSON.stringify(batDau, null, 2));
  const ra = cp.execFileSync(process.execPath, ['-e',
    `const k=require(${JSON.stringify(path.resolve('sync/ketnoi.js'))});
     const pos=require(${JSON.stringify(path.resolve('sync/pancakepos.js'))});
     ${js}`],
  { env: { ...process.env, LARK_CONNECT_FILE: FILE }, cwd: process.cwd(), encoding: 'utf8' });
  return JSON.parse(ra.trim().split('\n').pop());
}

const KHOA_CU = 'aaaaaaaabbbbbbbbccccccccdddddddd';
const KHOA_MOI = '11111111222222223333333344444444';
const CU = { pancakePos: { enabled: true, shops: [], apiKey: KHOA_CU, shopIds: ['454586'] } };

console.log('— dạng cũ (một khoá cho mọi gian) vẫn đọc được');
let r = chay('console.log(JSON.stringify(pos.danhSachGian(k.read().pancakePos)))', CU);
t('chuyển thành 1 gian có khoá', r.length === 1 && r[0].shopId === '454586' && r[0].apiKey === KHOA_CU,
  JSON.stringify(r));

console.log('— thêm gian mới, gian cũ để trống ô khoá');
r = chay(`
  k.writePancakePos({ enabled: true, shops: [
    { shopId: '454586', ten: 'Fanpage', apiKey: '' },
    { shopId: '100087658', ten: 'TikTok', apiKey: '${KHOA_MOI}' },
  ] });
  console.log(JSON.stringify(pos.danhSachGian(k.read().pancakePos)));`, CU);
t('có hai gian', r.length === 2, String(r.length));
t('GIAN CŨ GIỮ NGUYÊN KHOÁ — không mất vì để trống ô',
  r.find((x) => x.shopId === '454586').apiKey === KHOA_CU,
  JSON.stringify(r.map((x) => [x.shopId, x.apiKey.slice(0, 8)])));
t('gian mới nhận khoá mới', r.find((x) => x.shopId === '100087658').apiKey === KHOA_MOI);
t('giữ tên gợi nhớ', r.find((x) => x.shopId === '454586').ten === 'Fanpage');

console.log('— lưu lại lần nữa với CẢ HAI ô trống');
r = chay(`
  k.writePancakePos({ shops: [
    { shopId: '454586', ten: 'Fanpage', apiKey: '${KHOA_CU}' },
    { shopId: '100087658', ten: 'TikTok', apiKey: '${KHOA_MOI}' },
  ] });
  k.writePancakePos({ shops: [{ shopId: '454586' }, { shopId: '100087658' }] });
  console.log(JSON.stringify(pos.danhSachGian(k.read().pancakePos)));`, CU);
t('cả hai khoá còn nguyên', r.length === 2 && r.every((x) => x.apiKey),
  JSON.stringify(r.map((x) => [x.shopId, !!x.apiKey])));

console.log('— xoá một gian không ảnh hưởng gian còn lại');
r = chay(`
  k.writePancakePos({ shops: [
    { shopId: '454586', apiKey: '${KHOA_CU}' },
    { shopId: '100087658', apiKey: '${KHOA_MOI}' },
  ] });
  k.writePancakePos({ shops: [{ shopId: '100087658' }] });
  console.log(JSON.stringify(pos.danhSachGian(k.read().pancakePos)));`, CU);
t('còn đúng một gian', r.length === 1 && r[0].shopId === '100087658', JSON.stringify(r));
t('và nó giữ khoá', r[0].apiKey === KHOA_MOI);

console.log('— dọn sạch dạng cũ sau khi lưu, không để hai nguồn sự thật');
r = chay(`
  k.writePancakePos({ shops: [{ shopId: '454586', apiKey: '${KHOA_CU}' }] });
  const c = k.read().pancakePos;
  console.log(JSON.stringify({ apiKey: c.apiKey, shopIds: c.shopIds, soShops: (c.shops||[]).length }));`, CU);
t('apiKey và shopIds cũ được dọn', r.apiKey === '' && r.shopIds.length === 0 && r.soShops === 1,
  JSON.stringify(r));

console.log('— status không bao giờ trả khoá ra ngoài');
r = chay(`
  k.writePancakePos({ shops: [{ shopId: '454586', apiKey: '${KHOA_MOI}' }] });
  console.log(JSON.stringify({ lot: JSON.stringify(k.status()).includes('11111111') }));`, CU);
t('khoá không lọt vào status', r.lot === false);

console.log('— gian không có shop_id bị bỏ, không tạo dòng rác');
r = chay(`
  k.writePancakePos({ shops: [{ shopId: '', apiKey: 'x' }, { shopId: '454586', apiKey: '${KHOA_CU}' }] });
  console.log(JSON.stringify(pos.danhSachGian(k.read().pancakePos)));`, CU);
t('chỉ còn gian có shop_id', r.length === 1 && r[0].shopId === '454586', JSON.stringify(r));

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
