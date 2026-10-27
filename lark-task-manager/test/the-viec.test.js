/**
 * Sáu điều anh Hùng chốt cho thẻ việc ngoài danh sách, 27/10/2026:
 *   1. bấm vào đâu trên thẻ cũng mở chi tiết, không riêng dòng tiêu đề;
 *   2. việc con cũng chia nhỏ thêm được (tới trần 3 cấp);
 *   3. kéo việc lớn thì cả nhánh con đi theo và nhìn thấy là nó đi theo;
 *   4. thu gọn có chuyển động, mở và đóng đều có;
 *   5. vừa nhấc thẻ lên là thấy thả vào đâu được, không phải rê đi dò;
 *   6. nút "Yêu cầu điều chỉnh" rời khỏi thẻ.
 *
 * Mấy thứ này sống trong DOM nên không chạy thẳng được; bài soát mã nguồn thật
 * của public/app.js, để một lần dọn dẹp sau này xoá nhầm thì có chỗ kêu lên.
 * Riêng theTrongNhanh() là hàm thuần nên chạy thật với DOM giả.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

function layHam(ten) {
  const i = SRC.indexOf('function ' + ten + '(');
  assert.ok(i >= 0, 'không thấy hàm ' + ten + ' trong public/app.js');
  const sau = SRC.indexOf('{', i);
  let m = 0;
  for (let j = sau; j < SRC.length; j++) {
    if (SRC[j] === '{') m++;
    else if (SRC[j] === '}') { m--; if (!m) return SRC.slice(i, j + 1); }
  }
  throw new Error('không đóng ngoặc: ' + ten);
}

/* ---- 1. bấm cả thẻ ---- */
test('bấm vào đâu trên thẻ cũng mở chi tiết, trừ nút và tay nắm', () => {
  const w = layHam('workCard');
  assert.ok(/c\.onclick\s*=/.test(w), 'cả thẻ phải bắt được cú bấm');
  assert.ok(/openDrawer\(t\)/.test(w), 'bấm thẻ phải mở đúng việc của thẻ đó');
  const chua = w.match(/e\.target\.closest\('([^']+)'\)/);
  assert.ok(chua, 'phải chừa những thứ có việc riêng khi bấm');
  for (const x of ['button', 'input', '.wc-nam']) {
    assert.ok(chua[1].includes(x), 'phải chừa ' + x + ' ra');
  }
  assert.ok(!/title\.onclick/.test(w),
    'tiêu đề không giữ cú bấm riêng nữa — hai chỗ bắt một cú bấm là chỗ để lọt lỗi');
  assert.ok(/^\.wcard \{ cursor: pointer; \}$/m.test(CSS)
    || /\.wcard \{[^}]*cursor: pointer/.test(CSS), 'con trỏ phải báo là thẻ bấm được');
});

/* ---- 2. việc con chia nhỏ thêm được ---- */
test('việc con có cả hàng "Thuộc việc lớn" lẫn khối "Việc con" của riêng nó', () => {
  const h = layHam('hangViecLon');
  assert.ok(/!idCha\(t\)\) return null/.test(h), 'hàng này chỉ có ở việc con');
  const k = layHam('khoiViecCon');
  assert.ok(!/if \(idCha\(t\)\)/.test(k),
    'khoiViecCon không được thoát sớm khi t là việc con — thoát sớm là việc con không chia nhỏ được nữa');
  const g = layHam('ganKhoiViecCon');
  assert.ok(/hangViecLon\(t\)/.test(g) && /khoiViecCon\(t\)/.test(g),
    'ô chi tiết phải gắn cả hai khối');
  /* Trần 3 cấp vẫn do chiaDuoc() giữ, không nới ra theo. */
  assert.ok(/capCuaViec\(t\) >= CAP_TOI_DA\) return false/.test(layHam('chiaDuoc')),
    'tới cấp 3 thì hết chia, không có ô thêm việc con');
});

/* ---- 3. kéo việc lớn thì nhánh đi theo ---- */
test('theTrongNhanh đọc đúng nhánh nằm dưới một thẻ', () => {
  const ma = [layHam('capCuaThe'), layHam('theTrongNhanh'), 'return { capCuaThe, theTrongNhanh };'].join('\n');
  const { capCuaThe, theTrongNhanh } = new Function(ma)();
  /* DOM giả: A(gốc) B(cấp2) C(cấp3) D(gốc). */
  const the = ['wcard', 'wcard cap-2', 'wcard cap-3', 'wcard'].map((cls, i) => ({
    className: cls, ten: 'ABCD'[i],
    classList: { contains: (x) => cls.split(' ').includes(x) },
  }));
  the.forEach((x, i) => { x.nextElementSibling = the[i + 1] || null; });
  assert.strictEqual(capCuaThe(the[0]), 1);
  assert.strictEqual(capCuaThe(the[2]), 3);
  assert.deepStrictEqual(theTrongNhanh(the[0]).map((x) => x.ten), ['B', 'C']);
  assert.deepStrictEqual(theTrongNhanh(the[1]).map((x) => x.ten), ['C']);
  assert.deepStrictEqual(theTrongNhanh(the[3]).map((x) => x.ten), []);
  /* Thẻ cuối nhánh không được nuốt luôn thẻ gốc đứng sau nó. */
  assert.ok(!theTrongNhanh(the[0]).includes(the[3]), 'nhánh dừng ở thẻ gốc kế tiếp');
});

test('kéo việc lớn thì nhánh mờ theo và nói rõ mang bao nhiêu việc', () => {
  const k = layHam('ganKeoThe');
  assert.ok(/theTrongNhanh\(c\)/.test(k), 'lúc nhấc lên phải biết nhánh gồm những gì');
  assert.ok(/việc con/.test(k) && /dataset\.mang/.test(k),
    'ảnh kéo chỉ vẽ được một thẻ nên phải nói bằng chữ là còn mang theo mấy việc');
  assert.ok(/\.wcard\.theo-cha \{ opacity/.test(CSS), 'nhánh đi theo phải mờ như thẻ đang kéo');
  const d = layHam('donDauKeoThe');
  for (const lop of ['theo-cha', 'tha-duoc', 'tha-khong']) {
    assert.ok(d.includes(lop), 'dọn xong phải sạch lớp ' + lop + ', không thì lượt kéo sau dính lại');
  }
});

/* ---- 4. thu gọn có chuyển động ---- */
test('thu gọn mở có hiệu ứng thì đóng cũng có, và tôn ý máy xin bớt chuyển động', () => {
  const n = layHam('nutGap');
  assert.ok(/vua-mo/.test(n), 'mở ra phải có hiệu ứng');
  assert.ok(/dang-cup/.test(n), 'đóng lại cũng phải có — nguyên tắc chung của Hub');
  assert.ok(/itChuyenDong\(\)/.test(n), 'máy xin bớt chuyển động thì làm ngay, không chờ hiệu ứng');
  assert.ok(/setTimeout\(xong, 220\)/.test(n), 'phải cụp xong mới vẽ lại, không thì không thấy gì');
  assert.ok(/@keyframes wc-xoe/.test(CSS) && /@keyframes wc-cup/.test(CSS));
  const cup = CSS.match(/\.wcard\.dang-cup \{[^}]*\}/)[0];
  assert.ok(/--cd-ra/.test(cup), 'đóng đi theo nhịp --cd-ra');
  assert.ok(/--cd-vao/.test(CSS.match(/\.wcard\.vua-mo \{[^}]*\}/)[0]), 'mở đi theo nhịp --cd-vao');
  assert.ok(/prefers-reduced-motion: reduce\) \{\s*\.wcard\.vua-mo, \.wcard\.dang-cup \{ animation: none/.test(CSS),
    'xin bớt chuyển động thì tắt hẳn hiệu ứng');
  assert.ok(/\.wc-gap\.cup > span \{ transform: rotate\(-90deg\)/.test(CSS),
    'mũi tên xoay chứ không đổi ký tự — đổi ký tự thì nó nhảy');
});

/* ---- 5. gợi ý thả vào đâu ---- */
test('vừa nhấc thẻ lên là chấm sẵn thả vào đâu được', () => {
  const s = layHam('soiChoTha');
  assert.ok(/nhanConDuoc\(t, KEO_THE\)/.test(s),
    'phải hỏi đúng cái luật mà lúc thả sẽ hỏi, không được đoán kiểu khác');
  assert.ok(/tha-duoc/.test(s) && /tha-khong/.test(s));
  assert.ok(/theo-cha/.test(s), 'nhánh đang mang đi thì không phải chỗ thả');
  assert.ok(/soiChoTha\(c\)/.test(layHam('ganKeoThe')), 'phải gọi lúc bắt đầu kéo');
  assert.ok(/\.wcard\.tha-khong \{ opacity/.test(CSS), 'chỗ không nhận thì lùi lại');
});

/* ---- 6. bỏ nút Yêu cầu điều chỉnh khỏi thẻ ---- */
test('thẻ ngoài danh sách không còn nút Yêu cầu điều chỉnh', () => {
  const w = layHam('workCard');
  assert.ok(!/'Yêu cầu điều chỉnh'/.test(w), 'nút đó đã rời khỏi thẻ');
  assert.ok(!/openAdjust/.test(w), 'và không còn đường gọi nó từ thẻ');
  /* Nhưng vẫn phải còn chỗ khác để gửi, không thì tính năng mất hẳn. */
  assert.ok(/openAdjust\(/.test(SRC.replace(w, '')), 'ô chi tiết vẫn phải gửi được yêu cầu điều chỉnh');
  /* Câu chỉ đường ở đầu làn phải chỉ tới chỗ nút đang đứng thật. */
  const hint = SRC.match(/hint: 'Đọc kỹ yêu cầu[^']*'/)[0];
  assert.ok(/mở việc ra/.test(hint), 'câu gợi ý không được chỉ tới một nút không còn trên thẻ');
});
