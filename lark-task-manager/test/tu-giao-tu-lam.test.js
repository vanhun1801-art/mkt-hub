/**
 * Người order chính là người làm thì bỏ bước nghiệm thu (27/10/2026).
 *
 * Anh Hùng: "nếu việc người order giống với người phụ trách thì không cần bước
 * nghiệm thu mà hoàn thành luôn". Bắt nộp rồi chờ là bắt người ta tự duyệt
 * việc của chính mình — một vòng rỗng.
 *
 * Luật sống ở hai nơi: tuGiaoTuLam() trong server.js quyết định thật, bản cùng
 * tên trong public/app.js chỉ để gọi đúng tên cái nút. Bài này chạy CẢ HAI bản
 * mã thật trên cùng một bộ việc, lệch nhau là đỏ.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const goc = path.join(__dirname, '..');
const SV = fs.readFileSync(path.join(goc, 'server.js'), 'utf8');
const FE = fs.readFileSync(path.join(goc, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(goc, 'public', 'styles.css'), 'utf8');

function layHam(src, ten, ten_tep) {
  const i = src.indexOf('function ' + ten + '(');
  assert.ok(i >= 0, 'không thấy hàm ' + ten + ' trong ' + ten_tep);
  const sau = src.indexOf('{', i);
  let m = 0;
  for (let j = sau; j < src.length; j++) {
    if (src[j] === '{') m++;
    else if (src[j] === '}') { m--; if (!m) return src.slice(i, j + 1); }
  }
  throw new Error('không đóng ngoặc: ' + ten);
}

const mayChu = new Function(layHam(SV, 'tuGiaoTuLam', 'server.js') + '\nreturn tuGiaoTuLam;')();
const giaoDien = new Function(layHam(FE, 'tuGiaoTuLam', 'public/app.js') + '\nreturn tuGiaoTuLam;')();

const A = { id: 'u-a' }, B = { id: 'u-b' };
const viec = (them) => Object.assign({ requester: [A], owner: [A] }, them);

/* Mỗi ca chạy qua cả hai bản: hai bên lệch nhau là viền nút nói một đằng, máy
 * chủ làm một nẻo. */
function ca(ten, t, mong) {
  test(ten, () => {
    assert.strictEqual(mayChu(t), mong, 'máy chủ');
    assert.strictEqual(giaoDien(t), mong, 'giao diện (phải khớp máy chủ)');
  });
}

ca('một người vừa order vừa làm: bỏ nghiệm thu', viec(), true);
ca('order một người, người khác làm: vẫn phải nghiệm thu', viec({ owner: [B] }), false);
ca('order một người, hai người làm trong đó có mình: bỏ nghiệm thu',
  viec({ owner: [A, B] }), true);
ca('order hai người, chỉ một người trong đó làm: vẫn nghiệm thu (người kia còn phải duyệt)',
  viec({ requester: [A, B], owner: [A] }), false);
ca('chưa có người order thì không tính', viec({ requester: [] }), false);
ca('chưa phân công thì không tính', viec({ owner: [] }), false);
ca('người order rỗng dữ liệu (không có id) cũng không tính',
  viec({ requester: [{}] }), false);
ca('việc liên phòng: người giao ở bên công ty, nghiệm thu là của họ',
  viec({ lienPhong: true }), false);
ca('việc liên phòng đã lưu về phòng cũng vậy', viec({ maLienPhong: 'GV-1' }), false);

test('máy chủ chỉ bỏ bước chờ khi việc CHƯA trễ', () => {
  const i = SV.indexOf('const tuChotDuoc =');
  assert.ok(i >= 0, 'không thấy chỗ máy chủ quyết định bỏ bước chờ');
  const dong = SV.slice(i, SV.indexOf('\n', i));
  assert.ok(/tuGiaoTuLam\(task\)/.test(dong) && /!laTreTheoHan\(task\)/.test(dong),
    'việc đã trễ thì vẫn đi đường nộp-chờ: "trễ thì nhân sự không tự đóng" là chuyện thời hạn, không phải chuyện nghiệm thu');
  assert.ok(/if \(\(action === 'nop' \|\| action === 'giai-quyet'\) && !tuChotDuoc\) \{/.test(SV),
    'nhánh nộp-chờ phải nhường đường khi tự order tự làm');
});

test('không nhắn cho chính mình rằng việc mình vừa đóng đã xong', () => {
  const i = SV.indexOf('// báo người order vào nghiệm thu');
  const j = SV.indexOf('Báo người order vào nghiệm thu');
  assert.ok(i < 0 && j >= 0, 'khối báo tin phải được bọc trong điều kiện mới');
  assert.ok(/if \(!tuGiaoTuLam\(task\)\) \{[\s\S]{0,400}?Mời bạn nghiệm thu/.test(SV),
    'chỉ nhắn khi còn người ngoài để nghiệm thu');
});

test('nút gọi đúng tên việc sắp xảy ra', () => {
  const w = layHam(FE, 'workCard', 'public/app.js');
  assert.ok(/const tuChot = tuGiaoTuLam\(t\) && !laTreTheoHan\(t\);/.test(w));
  assert.ok(/tuChot \? '✓ Hoàn thành' : '✓ Đã gửi sản phẩm'/.test(w),
    'tự order cho mình thì nút phải nói Hoàn thành, không hứa một bước nghiệm thu không có thật');
  const d = layHam(FE, 'openDone', 'public/app.js');
  assert.ok(/tuChot \? 'Hoàn thành' : 'Gửi sản phẩm'/.test(d), 'nút trong cửa sổ cũng vậy');
  assert.ok(/bạn tự order việc này/.test(d), 'và nói rõ vì sao không phải chờ ai');
});

test('việc liên phòng có màu nút riêng', () => {
  const w = layHam(FE, 'workCard', 'public/app.js');
  assert.ok(/'btn btn-primary' \+ \(t\.lienPhong \? ' btn-lp' : ''\)/.test(w),
    'bấm nút này là ghi sang Base công ty, không phải nộp trong phòng');
  assert.ok(/doneSubmit'\)\.classList\.toggle\('btn-lp', !!t\.lienPhong\)/.test(FE),
    'nút trong cửa sổ mang cùng màu — cùng một hành động thì cùng một màu');
  assert.ok(/\.btn\.btn-primary\.btn-lp \{[^}]*background: var\(--purple\)/.test(CSS),
    'dùng biến màu có sẵn, vì nó đã có bản cho nền tối');
  /* --purple phải khai cho CẢ hai nền, không thì nền tối đọc không ra chữ. */
  assert.strictEqual((CSS.match(/--purple:\s*#/g) || []).length >= 2, true,
    '--purple phải có bản riêng cho nền tối');
});
