'use strict';
/**
 * MỞ THÁNG MỚI VÀ CHẤM THEO NGƯỜI ĐĂNG — `node test/thang-moi.test.js`.
 *
 * Hai lỗi thật của ngày 18/10/2026, tìm ra khi anh Hùng hỏi "KPI đang chạy thế
 * nào".
 *
 * 1. NỬA KPI ĐÃ CHẾT HAI THÁNG MÀ KHÔNG AI BIẾT. Kho chỉ nhận tháng do bản nhập
 *    Excel sinh ra, nên khi anh Hùng dừng nhập Excel từ tháng 9 thì tháng 9 và
 *    tháng 10 không tồn tại. App không báo gì: nó lặng lẽ nhảy về tháng gần
 *    nhất CÓ SỐ rồi bày số tháng 7 ra giữa tháng 10, kèm dòng "đã qua 100%
 *    tháng". Nhìn vào vẫn thấy bình thường.
 *
 * 2. THƯ VÀ NGỌC ĂN CHUNG Y HỆT MỘT BỘ KÊNH. Phân bổ của hai người giống nhau
 *    từng con số, nên mỗi lượt xem cho điểm hai lần, hai người. Anh Hùng chốt:
 *    mỗi bài đã có tên người đăng, chấm theo tên đó.
 *
 * Tên trong plugin Người đăng KHÔNG giống tên trong bộ luật một chữ nào —
 * "Phương Ái" là Thư, "Lý Thư Bạch" là Ngọc. Nên phép thử cuối canh đúng một
 * việc: không được suy người từ tên.
 */
const assert = require('assert');
const Module = require('module');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

/* Chặn ./lark trước khi nạp store, để không gọi ra Base thật. */
const nap = Module._load;
Module._load = function (yc) {
  if (yc === './lark') {
    return { listAll: async () => [], createMany: async () => [], updateMany: async () => 0 };
  }
  return nap.apply(this, arguments);
};
const store = require('../store');
const nguon = require('../nguon');
Module._load = nap;

console.log('\nmở tháng mới');

/* Dựng sẵn một tháng gốc trong RAM, không đụng tệp lẫn Base. */
const LUAT = {
  nhom: [{ kenh: 'FB', tenKenh: 'Rooty Trip Phú Quốc', loai: 'Bài viết', tieuChi: [] }],
  nguoi: [{ ma: 'thu', ten: 'THƯ', tieuChi: [] }],
};
function dungKho() {
  const g = require('../store');
  /* Đi qua đúng cửa công khai: nạp() đọc Base giả (rỗng) rồi ta bơm tay vào
   * tầng gốc. Không có cửa nào khác để dựng trạng thái, mà dùng tệp thật thì
   * phép thử sẽ ghi đè số liệu của máy đang chạy. */
  return g;
}

t('kho rỗng thì từ chối mở tháng, không dựng tháng không bộ luật', () => {
  const s = dungKho();
  /* Tầng gốc rỗng (Base giả) — chưa có tháng nào để chép bộ luật sang. */
  const truoc = s.danhSachThang().length;
  const kq = s.taoThang('2099-01');
  assert.ok(kq.loi, 'mở được tháng từ kho rỗng là dựng một tháng không có bộ luật');
  assert.strictEqual(s.danhSachThang().length, truoc, 'từ chối rồi thì đừng để lại dấu vết');
});

t('danh sách tháng gộp cả hai tầng, không chỉ tầng gốc Excel', () => {
  /* Đọc mỗi tầng gốc chính là lỗi làm tháng 9 và 10 tàng hình: mở xong là biến
     mất khỏi ô chọn tháng, vì chúng không có bản Excel nào. */
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'store.js'), 'utf8');
  const than = src.slice(src.indexOf('function danhSachThang'), src.indexOf('function taoThang'));
  assert.ok(/suaTay\(\)\.thang/.test(than), 'danhSachThang phải đọc cả tầng sửa');
  assert.ok(/lichSu\(\)\.thang/.test(than), 'và vẫn phải đọc tầng gốc');
});

console.log('\nmã nguồn mang tên người đăng');

t('tách được phần thứ tư là mã người', () => {
  const r = nguon.tach('Tiktok|Rooty Trip Phú Quốc|Bài viết|thu#view');
  assert.strictEqual(r.kenh, 'Tiktok');
  assert.strictEqual(r.tenKenh, 'Rooty Trip Phú Quốc');
  assert.strictEqual(r.loai, 'Bài viết');
  assert.strictEqual(r.nguoiDang, 'thu');
  assert.strictEqual(r.chiSo, 'view');
});

t('mã cũ không có phần người thì vẫn đọc như trước', () => {
  const r = nguon.tach('FB|Rooty Trip Phú Quốc|Bài viết#view');
  assert.strictEqual(r.nguoiDang, '', 'rỗng nghĩa là tính cả kênh');
  assert.strictEqual(r.chiSo, 'view');
});

t('tên kênh có dấu gạch đứng vẫn không nhầm sang mã người', () => {
  /* Dấu # là mốc cuối, còn | thì tách từ trái — tên kênh không được chứa |.
     Giữ phép thử này để ai đổi cách tách còn thấy ràng buộc đó. */
  const r = nguon.tach('Fanpage + Tiktok|Rooty Trip Phú Quốc|Chung#viewBanFB');
  assert.strictEqual(r.kenh, 'Fanpage + Tiktok');
  assert.strictEqual(r.nguoiDang, '');
});

console.log('\nkhông suy người từ tên');

t('bảng tên người đăng khai thẳng, không đoán theo chữ giống nhau', () => {
  const PV = require('../pham-vi');
  const thu = PV.MAC_DINH.thu;
  const ngoc = PV.MAC_DINH.ngoc;
  assert.deepStrictEqual(thu.tenDang, ['Phương Ái'],
    'Thư ký tên "Phương Ái" — đoán theo tên sẽ gán nhầm sang Ngọc');
  assert.deepStrictEqual(ngoc.tenDang, ['Lý Thư Bạch'],
    'Ngọc ký tên "Lý Thư Bạch" — chữ "Thư" trong đó là của Ngọc, không phải Thư');
  /* Hai người KHÔNG được trùng tên đăng, nếu không thì bài của người này lại
     cộng điểm cho người kia — đúng cái lỗi đang phải đi sửa. */
  const moi = [];
  Object.entries(PV.MAC_DINH).forEach(([ma, p]) => (p.tenDang || []).forEach((x) => moi.push(ma + '←' + x)));
  const ten = moi.map((x) => x.split('←')[1]);
  assert.strictEqual(new Set(ten).size, ten.length, 'có tên đăng bị khai cho hai người: ' + moi.join(' '));
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
