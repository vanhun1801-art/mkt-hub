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

test('kéo việc lớn thì cầm cả xấp, không phải một tờ', () => {
  const b = layHam('batDauKeo');
  assert.ok(/theTrongNhanh\(dat\.the\)/.test(b), 'lúc nhấc lên phải biết nhánh gồm những gì');
  assert.ok(/dungBongKeo\(dat\.the, nhanh\)/.test(b), 'cả nhánh phải đi vào cái xấp bay theo ngón tay');
  const d = layHam('dungBongKeo');
  assert.ok(/nhanh\.slice\(0, 2\)/.test(d), 'thò ra hai tờ, nhiều hơn thì che mất danh sách');
  assert.ok(/việc nữa/.test(d), 'quá hai việc con thì phần còn lại nói bằng số');
  /* Tờ sau đuổi theo tờ trước nên cả xấp trôi thành cái đuôi, chứ không dán
   * cứng vào con trỏ — anh Hùng: "các việc nhỏ không trôi theo". */
  const v = layHam('veBongKeo');
  assert.ok(/k\.lop\.forEach/.test(v), 'mỗi tờ phải có đường đi riêng');
  /* Tờ đang cầm bám DÍNH con trỏ: trễ một nhịp là mất cảm giác kiểm soát. */
  assert.ok(/l\.x = k\.dichX;/.test(v) && /l\.y = k\.dichY;/.test(v),
    'tờ đầu phải đặt thẳng vào chỗ con trỏ, không được đuổi theo');
  assert.ok(/k\.lop\[i - 1\]\.x \+ 7 - l\.x\) \* 0\.26/.test(v),
    'chỉ mấy tờ phía sau mới đuổi, để thành cái đuôi');
  assert.ok(/Math\.max\(-3, Math\.min\(3,/.test(v), 'biên nghiêng 3 độ, vừa phải');
  assert.ok(/\.keo-bong \.keo-lop \{[^}]*transition: none/.test(CSS),
    'bản sao không được thừa hưởng hiệu ứng trượt của .wcard — thừa hưởng thì nó trôi lờ đờ sau con trỏ và lần đầu trượt từ góc màn hình xuống');
  assert.ok(/KEO\.lop\.forEach\(\(l\) => \{ l\.el\.style\.transform/.test(layHam('batDauKeo')),
    'phải đặt chỗ ngay, không thì khung đầu tiên cả xấp nằm ở góc trên bên trái');
  assert.ok(/\.wcard\.theo-cha \{ opacity/.test(CSS), 'chỗ cũ của nhánh mờ đi, giữ chỗ');
  const dd = layHam('donDauKeoThe');
  for (const lop of ['theo-cha', 'tha-duoc', 'tha-khong', 'nhuong-cho']) {
    assert.ok(dd.includes(lop), 'dọn xong phải sạch lớp ' + lop + ', không thì lượt kéo sau dính lại');
  }
});

test('kéo bằng ngón tay: có ngưỡng, có đường lùi, có tự cuộn', () => {
  const g = layHam('ganKeoThe');
  assert.ok(/onpointerdown/.test(g), 'phải dùng pointer events — cảm ứng không bắn sự kiện kéo HTML5');
  assert.ok(!/draggable/.test(g) && !/dataTransfer/.test(g), 'không còn dựa vào cơ chế kéo của trình duyệt');
  assert.ok(/NGUONG_KEO/.test(g), 'chưa quá ngưỡng thì vẫn là một cú bấm, không phải cú kéo');
  assert.ok(/setPointerCapture/.test(g), 'bắt con trỏ, không thì rê nhanh là tuột');
  const b = layHam('batDauKeo');
  assert.ok(/Escape/.test(b), 'đang cầm một nhánh mà đổi ý thì phải có đường lùi');
  const v = layHam('veBongKeo');
  assert.ok(/window\.scrollBy/.test(v), 'rê tới mép thì trang tự chạy');
  assert.ok(/rotate\(/.test(v), 'nghiêng theo chiều đang kéo');
  assert.ok(/\.wc-nam \{ touch-action: none/.test(CSS),
    'tay nắm phải nuốt cú chạm, không thì ngón tay kéo làm cuộn trang');
  /* Thả hụt thì cái xấp phải bay về chỗ cũ, không được biến mất tại chỗ. */
  assert.ok(/hangCanhBong\(k, \{ x: r\.left, y: r\.top \}, false\)/.test(layHam('ketThucKeo')));
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
  assert.ok(/soiChoTha\(dat\.the\)/.test(layHam('batDauKeo')), 'phải gọi lúc bắt đầu kéo');
  assert.ok(/\.wcard\.tha-khong \{ opacity/.test(CSS), 'chỗ không nhận thì lùi lại');
  /* Chỗ đang nhắm tới mở một khe, và chỉ mở khi nó thật sự nhận. */
  const n = layHam('nhamChoTha');
  assert.ok(/nhanConDuoc\(moi\.t, k\.t\)/.test(n), 'hỏi đúng cái luật lúc thả sẽ hỏi');
  assert.ok(/if \(!ok\) return;/.test(n), 'không nhận thì không mở khe, đỡ hứa hão');
  /* Khe mở trễ: mở ngay thì lướt qua năm thẻ là năm lần danh sách nhấp nhô. */
  assert.ok(/setTimeout\(\(\) => \{[\s\S]*nhuong-cho[\s\S]*\}, 160\)/.test(n),
    'khe chỉ mở khi ngón tay dừng lại nhắm');
  assert.ok(/KEO\.dich !== moi\) return/.test(n), 'đổi đích trước khi hết hẹn thì bỏ, không mở nhầm chỗ');
  assert.ok(/clearTimeout\(k\.hen\)/.test(layHam('dongKhe')) && /clearTimeout\(k\.hen\)/.test(layHam('ketThucKeo')),
    'hẹn mở khe phải huỷ được, không thì khe bật ra sau khi đã thả xong');
  assert.ok(/\.wcard\.nhuong-cho \{ transform: translateY/.test(CSS));
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

/* ---- 7. thẻ có tin chưa đọc nháy sáng (27/10/2026) ---- */
test('tin chưa đọc thì thẻ nháy vài cái, và chỉ nháy khi số tin đổi', () => {
  const ma = [layHam('nhayTinMoi'), 'return nhayTinMoi;'].join('\n');
  const lop = [];
  const the = { classList: { add: (x) => lop.push(x) } };
  const S = { chuaDoc: new Map([['v1', { n: 2 }], ['v2', { n: 0 }]]) };
  const nhay = new Function('S', 'DA_NHAY', ma)(S, new Set());

  nhay(the, { id: 'v1' });
  assert.deepStrictEqual(lop, ['nhay-tin'], 'có tin chưa đọc thì nháy');
  nhay(the, { id: 'v1' });
  assert.strictEqual(lop.length, 1, 'vẽ lại mà số tin không đổi thì thôi, không nháy nữa');
  S.chuaDoc.set('v1', { n: 3 });
  nhay(the, { id: 'v1' });
  assert.strictEqual(lop.length, 2, 'thêm tin mới thì nháy tiếp');
  nhay(the, { id: 'v2' });
  nhay(the, { id: 'v3' });
  assert.strictEqual(lop.length, 2, 'không có tin chưa đọc thì không nháy');

  assert.ok(/nhayTinMoi\(c, t\)/.test(layHam('workCard')), 'phải gắn vào thẻ');
  assert.ok(/\.wcard\.nhay-tin \{ animation: wc-nhay [^;]*3; \}/.test(CSS),
    'ba nhịp rồi thôi — nháy mãi thì thành đèn báo động');
  assert.ok(/reduce\) \{\s*\/\*[^*]*\*\/\s*\.wcard\.nhay-tin \{ animation: none; box-shadow/.test(CSS),
    'xin bớt chuyển động thì không nháy, nhưng vẫn phải phân biệt được');
});
