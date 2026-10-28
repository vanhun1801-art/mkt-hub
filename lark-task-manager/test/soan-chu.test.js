/**
 * Ô soạn chi tiết yêu cầu (28/10/2026): Ctrl+B/I/U, dán bảng Excel, không thanh
 * công cụ. Cột "Chi tiết" trên Base là chữ thuần nên định dạng đi bằng dấu kiểu
 * Markdown. Bài này giữ hai chiều chuyển đổi khớp nhau: soạn -> lưu -> mở lại
 * phải ra đúng như lúc soạn, và chữ cũ không dấu thì hiện y như trước.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const SC = require('../public/soan-chu.js');

/* DOM giả đủ cho tuHtml: nodeType, nodeName, childNodes, style, getAttribute. */
const chu = (s) => ({ nodeType: 3, nodeValue: s });
function the(ten, con, thuocTinh) {
  const tt = thuocTinh || {};
  return {
    nodeType: 1, nodeName: ten.toUpperCase(), style: tt.style || {},
    getAttribute: (k) => (k in tt ? String(tt[k]) : null),
    childNodes: (con || []).map((c) => (typeof c === 'string' ? chu(c) : c)),
  };
}

test('chữ cũ không dấu hiện y như trước, chỉ đổi xuống dòng thành <br>', () => {
  assert.strictEqual(SC.sangHtml('Dòng 1\nDòng 2'), 'Dòng 1<br>Dòng 2');
  assert.strictEqual(SC.sangHtml('a < b & "c"'), 'a &lt; b &amp; &quot;c&quot;');
  assert.strictEqual(SC.sangHtml('* gạch đầu dòng'), '* gạch đầu dòng', 'dấu * đầu dòng không thành nghiêng');
  assert.strictEqual(SC.sangHtml('5*3*2'), '5*3*2');
});

test('đậm, nghiêng, gạch chân', () => {
  assert.strictEqual(SC.sangHtml('**đậm** *nghiêng* <u>gạch</u>'), '<b>đậm</b> <i>nghiêng</i> <u>gạch</u>');
});

test('không để lọt thẻ HTML người gõ vào', () => {
  assert.ok(!/<script|<img/i.test(SC.sangHtml('<script>x</script><img src=x onerror=1>')));
});

test('link bấm được ở bản chỉ đọc, dấu * trong link không bị đọc nhầm', () => {
  const h = SC.sangHtml('xem https://a.com/x*y*z nhé', { link: true });
  assert.ok(h.includes('href="https://a.com/x*y*z"'));
  assert.ok(!h.includes('<i>'));
  assert.ok(!SC.sangHtml('https://a.com').includes('<a'), 'ô soạn không biến link thành thẻ a');
});

test('bảng Markdown thành <table>, dòng đầu là tiêu đề', () => {
  const h = SC.sangHtml('Trên\n| A | B |\n| --- | --- |\n| 1 | **2** |\nDưới');
  assert.strictEqual(h, 'Trên<table class="sc-bang"><thead><tr><th>A</th><th>B</th></tr></thead>' +
    '<tbody><tr><td>1</td><td><b>2</b></td></tr></tbody></table>Dưới');
});

test('dán từ Excel (TSV), kể cả ô có xuống dòng và dấu |', () => {
  assert.ok(SC.laBangTab('a\tb\n1\t2\n'));
  assert.ok(!SC.laBangTab('chữ thường\n'));
  const md = SC.tsvSangMd('Tên\tGhi chú\nTour A\t"dòng 1\ndòng 2"\nTour B\ta|b\n');
  assert.strictEqual(md, '| Tên | Ghi chú |\n| --- | --- |\n| Tour A | dòng 1<br>dòng 2 |\n| Tour B | a\\|b |');
  const h = SC.sangHtml(md);
  assert.ok(h.includes('<td>dòng 1<br>dòng 2</td>'));
  assert.ok(h.includes('<td>a|b</td>'));
});

test('ô soạn -> chữ có dấu: dòng kiểu Chrome, đậm/nghiêng/gạch chân', () => {
  const o = the('div', [
    'Mở đầu ', the('b', ['đậm ']), the('i', ['nghiêng']),
    the('div', [the('u', ['gạch'])]),
    the('div', [the('br')]),
    the('div', ['cuối']),
  ]);
  assert.strictEqual(SC.tuHtml(o), 'Mở đầu **đậm** *nghiêng*\n<u>gạch</u>\n\ncuối');
});

test('dán từ Google Docs: thẻ <b style="font-weight:normal"> không làm đậm cả đoạn', () => {
  const o = the('body', [the('b', ['thường ', the('span', ['đậm'], { style: { fontWeight: '700' } })], { style: { fontWeight: 'normal' } })]);
  assert.strictEqual(SC.tuHtml(o), 'thường **đậm**');
});

test('bảng HTML (Excel, Sheets) -> bảng Markdown, bỏ <style>, gộp ô giữ đúng cột', () => {
  const o = the('body', [
    the('style', ['td{color:red}']),
    the('table', [the('tbody', [
      the('tr', [the('td', ['Kênh']), the('td', ['Chi phí'])]),
      the('tr', [the('td', ['Tổng'], { colspan: 2 })]),
    ])]),
  ]);
  assert.strictEqual(SC.tuHtml(o), '| Kênh | Chi phí |\n| --- | --- |\n| Tổng |  |');
});

test('khứ hồi: chữ có dấu -> HTML -> đọc lại vẫn y nguyên', () => {
  /* Giả lập ngược: dựng DOM từ đúng HTML mà sangHtml sinh ra cho mẫu này. */
  const o = the('div', [
    'Trên', the('br'), the('br'),
    the('table', [the('thead', [the('tr', [the('th', ['A']), the('th', ['B'])])]),
      the('tbody', [the('tr', [the('td', ['1']), the('td', [the('b', ['2'])])])])]),
    the('br'), 'Dưới',
  ]);
  const md = 'Trên\n\n| A | B |\n| --- | --- |\n| 1 | **2** |\n\nDưới';
  assert.strictEqual(SC.sangHtml(md), 'Trên<br><br><table class="sc-bang"><thead><tr><th>A</th><th>B</th></tr></thead>' +
    '<tbody><tr><td>1</td><td><b>2</b></td></tr></tbody></table><br>Dưới');
  assert.strictEqual(SC.tuHtml(o), md);
});

test('chữ trơn cho thẻ việc: bỏ dấu, bảng thành một dòng', () => {
  assert.strictEqual(SC.chuTho('**Gấp** làm *ngay*\n| A | B |\n| --- | --- |\n| 1 | 2 |'), 'Gấp làm ngay A · B 1 · 2');
});

test('form tạo việc và form quản lý dùng ô soạn, bản chỉ đọc giữ định dạng', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(/field\(idCha\(t\) \? 'Chi tiết yêu cầu' : 'Chi tiết yêu cầu \*', oChiTiet\(t\)\)/.test(SRC));
  assert.ok(/field\('Chi tiết yêu cầu', oChiTiet\(t\)\)/.test(SRC));
  assert.ok(!/moTaCoLink\(t\.detail\)/.test(SRC), 'chi tiết chỉ đọc phải qua moTaDinhDang');
  assert.ok(HTML.indexOf('soan-chu.js') < HTML.indexOf('/app.js'), 'soan-chu.js phải nạp trước app.js');
});

test('thiếu soan-chu.js thì app vẫn chạy: không gọi thẳng SoanChu ngoài hàm có rào', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  /* Gọi SoanChu.x() thẳng trong lúc vẽ thẻ mà tệp tải hụt (trang mở dở lúc deploy)
   * là ReferenceError, cả danh sách việc không vẽ được và không bấm được gì. */
  const dong = SRC.split('\n').filter((d) => /SoanChu\./.test(d));
  for (const d of dong) {
    assert.ok(/coSoanChu\(\)/.test(d) || /box\.innerHTML = SoanChu\.sangHtml/.test(d), 'gọi SoanChu không có rào: ' + d.trim());
  }
  assert.ok(/function moTaDinhDang\(text\) \{\s*if \(!coSoanChu\(\)\) return moTaCoLink\(text\);/.test(SRC));
  assert.ok(/function coSoanChu\(/.test(SRC), 'coSoanChu phải là function để gọi được trước dòng khai báo');
});
