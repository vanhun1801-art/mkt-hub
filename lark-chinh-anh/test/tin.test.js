'use strict';
/* `node test/tin.test.js` — kiểm nội dung tin gửi nhóm mà KHÔNG gửi thật.
 *
 * Vì sao đáng test: thẻ Lark là JSON, sai một khoá thì Lark chỉ trả "invalid
 * card" chứ không nói sai ở đâu. Và một link rác lọt vào thẻ có thể làm Lark từ chối
 * CẢ tin — báo cáo đã ghi vào Base rồi mà nhóm không nhận được gì.
 *
 * Từ 10/09/2026 thẻ KHÔNG còn nút bấm nào (anh Hùng chốt: app khép kín). Vẫn giữ
 * hàm nut() để chốt lại điều đó — đừng ai thêm nút lại. */
const assert = require('assert');
const tin = require('../tin');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

const BC = {
  thuMuc: 'TOUR ĐẢO · Ghép · 10.09.2026',
  tour: 'TOUR ĐẢO', loai: 'Ghép', ngay: '2026-09-10',
  hangMuc: ['Chỉnh ảnh', 'Edit video'],
  linkAnh: 'https://photos.app.goo.gl/abc',
  linkVideo: 'https://drive.google.com/drive/folders/xyz',
  soAnh: 120, soVideo: 3,
  nguoiLam: [{ id: 'ou_1', name: 'Thanh' }],
  ghiChu: 'khách xin thêm ảnh nhóm',
  trangThai: 'Chờ nghiệm thu',
};

const BC2 = {
  thuMuc: 'LAND TOUR · VIP · 10.09.2026',
  tour: 'LAND TOUR', loai: 'VIP', ngay: '2026-09-10',
  hangMuc: ['Chỉnh ảnh'],
  linkAnh: 'https://photos.app.goo.gl/def', linkVideo: '',
  soAnh: 60, soVideo: 0,
  nguoiLam: [{ id: 'ou_2', name: 'Khánh' }],
  ghiChu: '', trangThai: 'Chờ nghiệm thu',
};

/** Duyệt cây thẻ, gom mọi nút bấm ra để kiểm. */
function nut(card) {
  const ra = [];
  (card.elements || []).forEach((e) => {
    if (e.tag === 'action') ra.push(...(e.actions || []));
  });
  return ra;
}

console.log('\nlinkSach');

t('chỉ nhận http/https', () => {
  assert.strictEqual(tin.linkSach('https://a.b/c'), 'https://a.b/c');
  assert.strictEqual(tin.linkSach('http://a.b'), 'http://a.b');
  assert.strictEqual(tin.linkSach('a.b/c'), '');
  assert.strictEqual(tin.linkSach('javascript:alert(1)'), '');
  assert.strictEqual(tin.linkSach(''), '');
  assert.strictEqual(tin.linkSach(null), '');
});

console.log('\nsoạn tin báo cáo');

t('thẻ có đủ ba trường Tour / Loại / Ngày và hai link thư mục', () => {
  const { card } = tin.soan(BC, { nguoiTen: 'Thanh' });
  const s = JSON.stringify(card);
  assert.ok(s.includes('TOUR ĐẢO'), 'thiếu tên tour');
  assert.ok(s.includes('10.09.2026'), 'thiếu ngày dạng dd.mm.yyyy');
  assert.ok(s.includes('](' + BC.linkAnh + ')'), 'thiếu link thư mục ảnh');
  assert.ok(s.includes('](' + BC.linkVideo + ')'), 'thiếu link thư mục video');
});

t('KHÔNG CÓ NÚT BẤM NÀO — app khép kín, người trong nhóm không có đường vào app', () => {
  /* Anh Hùng chốt 10/09/2026: bỏ hết nút. Nút "Nghiệm thu trong app" dẫn tới cánh
   * cửa người xem không mở được; có vấn đề thì họ nhắn thẳng trong nhóm. */
  [tin.soan(BC, { nguoiTen: 'Thanh' }), tin.soan([BC, BC2], {}),
    tin.soanNghiemThu({ ...BC, trangThai: 'Đạt' })].forEach((r) => {
    assert.strictEqual(nut(r.card).length, 0, 'còn nút trong thẻ');
    assert.ok(!JSON.stringify(r.card).includes('"action"'), 'còn khối action');
  });
});

t('không có link video thì không in link video rỗng', () => {
  const { card } = tin.soan({ ...BC, linkVideo: '', hangMuc: ['Chỉnh ảnh'] });
  const s = JSON.stringify(card);
  assert.ok(s.includes('Thư mục ảnh'));
  assert.ok(!s.includes('Thư mục video'), 'không có link mà vẫn in nhãn video');
});

t('link rác bị loại khỏi cả thẻ lẫn tin chữ', () => {
  const { card, text } = tin.soan({ ...BC, linkAnh: 'javascript:alert(1)' });
  assert.ok(!JSON.stringify(card).includes('javascript'), 'link rác lọt vào thẻ');
  assert.ok(!text.includes('javascript'), 'link rác lọt vào tin chữ');
});

t('mọi link trong thẻ đều là http(s) — không để lọt scheme lạ', () => {
  const { card } = tin.soan(BC, {});
  const s = JSON.stringify(card);
  [...s.matchAll(/\]\(([^)]+)\)/g)].forEach((m) => {
    assert.ok(/^https?:\/\//.test(m[1]), 'link lạ: ' + m[1]);
  });
});

t('tin chữ (đường lùi) mang đủ link và người chỉnh', () => {
  const { text } = tin.soan(BC, { nguoiTen: 'Thanh' });
  assert.ok(text.includes(BC.linkAnh));
  assert.ok(text.includes(BC.linkVideo));
  assert.ok(text.includes('Thanh'));
  assert.ok(text.includes('120 ảnh'));
});

t('báo cáo lại thì tiêu đề có đuôi "cập nhật" và thẻ đổi màu', () => {
  const moi = tin.soan(BC, { capNhat: false });
  const lai = tin.soan(BC, { capNhat: true });
  assert.ok(!/cập nhật/.test(moi.card.header.title.content), moi.card.header.title.content);
  assert.ok(/cập nhật/.test(lai.card.header.title.content), lai.card.header.title.content);
  assert.ok(/cập nhật/.test(lai.text.split('\n')[0]), 'tin chữ cũng phải nói');
  assert.strictEqual(moi.card.header.template, 'turquoise');
  assert.strictEqual(lai.card.header.template, 'orange');
});

t('tiêu đề nói cho MEDIA và CSKH, không phải tên thư mục nội bộ', () => {
  /* MKT chỉnh xong → gửi nhóm → Media kiểm và chỉnh tiếp → CSKH gửi khách. Người
   * đọc tin không phải người chỉnh ảnh, nên tiêu đề là "media giao khách ngày nào".
   * Tên thư mục vẫn phải còn, nhưng trong THÂN tin. */
  const cfg = require('../config');
  [tin.soan(BC, {}), tin.soan([BC, BC2], {})].forEach((r) => {
    const td = r.card.header.title.content;
    assert.ok(td.startsWith(cfg.tieuDeTin), td);
    assert.ok(!td.includes('TOUR ĐẢO'), 'tên thư mục không được nằm trên tiêu đề: ' + td);
    assert.ok(JSON.stringify(r.card).includes('TOUR ĐẢO'), 'nhưng phải còn trong thân tin');
  });
});

t('hai loại thẻ dùng CÙNG một tiêu đề — nhóm không thấy hai kiểu tin', () => {
  const mot = tin.soan(BC, {}).card.header.title.content;
  const nhieu = tin.soan([BC, BC2], {}).card.header.title.content;
  assert.strictEqual(mot, nhieu);
});

t('chưa ghi người chỉnh thì lấy tên người bấm nút, không để trống', () => {
  const { text } = tin.soan({ ...BC, nguoiLam: [] }, { nguoiTen: 'Hùng' });
  assert.ok(text.includes('Người chỉnh: Hùng'));
});

t('thiếu hết link thì vẫn soạn được tin, chỉ là không có dòng link', () => {
  const { card, text } = tin.soan({ ...BC, linkAnh: '', linkVideo: '' });
  assert.ok(!JSON.stringify(card).includes('Thư mục ảnh'));
  assert.ok(text.includes('TOUR ĐẢO'));
});

console.log('\nsoạn tin nghiệm thu');

t('Đạt thì thẻ xanh, Cần sửa lại thì thẻ đỏ', () => {
  const dat = tin.soanNghiemThu({ ...BC, trangThai: 'Đạt' });
  const sua = tin.soanNghiemThu({ ...BC, trangThai: 'Cần sửa lại', nhanXet: 'ảnh tối quá' });
  assert.strictEqual(dat.card.header.template, 'green');
  assert.strictEqual(sua.card.header.template, 'red');
});

t('nhận xét đi kèm vào cả thẻ và tin chữ — đó là thứ người làm cần đọc', () => {
  const sua = tin.soanNghiemThu({ ...BC, trangThai: 'Cần sửa lại', nhanXet: 'ảnh tối quá' });
  assert.ok(sua.text.includes('ảnh tối quá'));
  assert.ok(JSON.stringify(sua.card).includes('ảnh tối quá'));
});

console.log('\nkhác');

t('ngayGon đổi YYYY-MM-DD sang dd.mm.yyyy, giá trị lạ thì để nguyên', () => {
  assert.strictEqual(tin.ngayGon('2026-09-10'), '10.09.2026');
  assert.strictEqual(tin.ngayGon(''), '');
  assert.strictEqual(tin.ngayGon('hôm nay'), 'hôm nay');
});

t('hienGio ra giờ Việt Nam, không theo múi giờ của server', () => {
  // 2026-09-10T00:30:00Z = 07:30 ngày 10/09 giờ VN
  assert.strictEqual(tin.hienGio(new Date('2026-09-10T00:30:00Z')), '07:30 10/09');
});

console.log('\nsoạn tin NHIỀU mục trong một lần báo cáo');


t('gộp thành MỘT tin, thân tin nói số lô', () => {
  const { card, text } = tin.soan([BC, BC2], { nguoiTen: 'Thanh' });
  const s = JSON.stringify(card);
  assert.ok(/\*\*S\u1ed1 l\u00f4\*\*\\n2/.test(s), 'thiếu trường Số lô = 2');
  assert.ok(/2 l/.test(text.split('\n')[1]), text.split('\n')[1]);
});

t('cộng đúng tổng ảnh và tổng video của cả lần báo cáo', () => {
  const { card, text } = tin.soan([BC, BC2], { nguoiTen: 'Thanh' });
  const s = JSON.stringify(card);
  assert.ok(/180 /.test(s), 'phải là 120 + 60 = 180 ảnh');
  assert.ok(/3 video/.test(s));
  assert.ok(/180 /.test(text));
});

t('mỗi mục mang tên người chỉnh RIÊNG — hai người khác nhau không bị gộp mất', () => {
  const { card, text } = tin.soan([BC, BC2], { nguoiTen: 'Thanh' });
  const s = JSON.stringify(card);
  assert.ok(s.includes('do Thanh'), 'thiếu người của mục 1');
  assert.ok(s.includes('do Khánh'), 'thiếu người của mục 2');
  assert.ok(text.includes('do Khánh'));
});

t('link từng mục vẫn bấm được (markdown), và không có khối nút nào', () => {
  const { card } = tin.soan([BC, BC2], {});
  const s = JSON.stringify(card);
  assert.ok(s.includes('](' + BC.linkAnh + ')'), 'thiếu link ảnh mục 1');
  assert.ok(s.includes('](' + BC.linkVideo + ')'), 'thiếu link video mục 1');
  assert.ok(s.includes('](' + BC2.linkAnh + ')'), 'thiếu link ảnh mục 2');
  assert.strictEqual((card.elements || []).filter((e) => e.tag === 'action').length, 0);
});

t('mỗi mục là một khối riêng, cách nhau bằng đường kẻ', () => {
  /* Anh Hùng phản hồi 10/09/2026: hai mục trôi thành một khối chữ, không thấy mục
   * nào kết thúc ở đâu. Mỗi mục phải có hr ngăn phía trước (trừ mục đầu). */
  const { card } = tin.soan([BC, BC2], {});
  const t2 = (card.elements || []).map((e) => e.tag);
  const soHr = t2.filter((x) => x === 'hr').length;
  assert.ok(soHr >= 3, 'phải có hr sau phần tổng, giữa hai mục, và trước dòng chữ ký; thấy ' + soHr);

  /* Đường kẻ phải nằm NGAY TRƯỚC mục 2, không phải rải bừa. */
  const iMuc2 = (card.elements || []).findIndex((e) => e.tag === 'div' && e.text
    && e.text.content.startsWith('**2 · '));
  assert.ok(iMuc2 > 0, 'không thấy khối mục 2');
  assert.strictEqual(card.elements[iMuc2 - 1].tag, 'hr', 'mục 2 không có đường kẻ ngăn phía trước');
});

t('link đứng RIÊNG một dòng, không nhét cuối câu', () => {
  const { card } = tin.soan([BC, BC2], {});
  const khoi = (card.elements || []).find((e) => e.tag === 'div' && e.text
    && e.text.content.startsWith('**1 · '));
  const dong = khoi.text.content.split('\n');
  assert.ok(dong[0].startsWith('**1 · '), 'dòng đầu phải là tên thư mục đậm');
  assert.ok(!/\]\(/.test(dong[1]), 'dòng thông tin không được chứa link: ' + dong[1]);
  const iLink = dong.findIndex((x) => /^\[/.test(x));
  assert.ok(iLink > 0, 'không thấy dòng link riêng');
  /* Dòng link phải CHỈ có link, không lẫn chữ khác. */
  assert.ok(/^(\[[^\]]+\]\([^)]+\)(\s+·\s+)?)+$/.test(dong[iLink]), 'dòng link lẫn chữ: ' + dong[iLink]);
});

t('mục không có link thì chỉ còn 2 dòng, không để dòng trống', () => {
  const { card } = tin.soan([{ ...BC, linkAnh: '', linkVideo: '' }, BC2], {});
  const khoi = (card.elements || []).find((e) => e.tag === 'div' && e.text
    && e.text.content.startsWith('**1 · '));
  const dong = khoi.text.content.split('\n');
  assert.strictEqual(dong.length, 2);
  assert.ok(dong.every((x) => x.trim()), 'có dòng trống');
});

t('GHI CHÚ KHÔNG vào tin — hai dòng trên đã đủ cho Media và CSKH', () => {
  /* Anh Hùng chốt 10/09/2026 khi xem tin thử: dòng chữ nghiêng ghi chú không cần,
   * chỉ làm khối mục dài và rối. Ghi chú vẫn nằm trên Base và trong app.
   * Quy tắc phải GIỐNG NHAU ở cả hai kiểu thẻ, không thì báo 1 lô thấy ghi chú mà
   * báo 2 lô lại không. */
  const co = 'khách xin thêm ảnh nhóm';
  assert.ok(BC.ghiChu.includes(co), 'dữ liệu thử phải có ghi chú, nếu không phép thử vô nghĩa');
  [tin.soan(BC, {}), tin.soan([BC, BC2], {})].forEach((r) => {
    assert.ok(!JSON.stringify(r.card).includes(co), 'ghi chú lọt vào thẻ');
    assert.ok(!r.text.includes(co), 'ghi chú lọt vào tin chữ');
  });
});

t('bỏ ghi chú KHÔNG làm mất nhận xét nghiệm thu — đó là hai thứ khác nhau', () => {
  /* Nhận xét nghiệm thu là thứ người chỉnh PHẢI đọc để biết sửa gì, không được bỏ
   * theo. Chốt lại để lần dọn tin sau không quét luôn cả cái này. */
  const r = tin.soanNghiemThu({ ...BC, trangThai: 'Cần sửa lại', nhanXet: 'ảnh tối quá' });
  assert.ok(JSON.stringify(r.card).includes('ảnh tối quá'));
  assert.ok(r.text.includes('ảnh tối quá'));
});

t('cùng ngày thì in ngày lên tiêu đề, khác ngày thì KHÔNG in ngày sai', () => {
  const cung = tin.soan([BC, BC2], {});
  assert.ok(cung.card.header.title.content.includes('10.09.2026'));
  const khac = tin.soan([BC, { ...BC2, ngay: '2026-09-08' }], {});
  assert.ok(!khac.card.header.title.content.includes('10.09.2026'),
    'khác ngày mà vẫn in một ngày lên tiêu đề là nói sai');
});

t('mảng một phần tử ra đúng thẻ một mục, không phải thẻ gộp', () => {
  const a = tin.soan([BC], { nguoiTen: 'Thanh' });
  const b = tin.soan(BC, { nguoiTen: 'Thanh' });
  assert.deepStrictEqual(a.card, b.card);
  /* Thẻ một mục có lưới 6 trường; thẻ gộp có trường "Số lô". Lấy đó làm dấu. */
  assert.ok(!JSON.stringify(a.card).includes('Số lô'), 'ra thẻ gộp mất rồi');
});

t('thẻ gộp cũng không có nút, mọi link đều http(s)', () => {
  const { card } = tin.soan([BC, BC2], {});
  assert.strictEqual(nut(card).length, 0);
  [...JSON.stringify(card).matchAll(/\]\(([^)]+)\)/g)].forEach((m) => {
    assert.ok(/^https?:\/\//.test(m[1]), 'link lạ: ' + m[1]);
  });
});

t('link rác trong một mục không kéo cả tin gộp xuống', () => {
  const { card, text } = tin.soan([{ ...BC, linkAnh: 'javascript:alert(1)' }, BC2], {});
  assert.ok(!JSON.stringify(card).includes('javascript'));
  assert.ok(!text.includes('javascript'));
  assert.ok(JSON.stringify(card).includes(BC2.linkAnh), 'mục lành phải còn nguyên link');
});

t('nghiệm thu cũng nêu người chỉnh — người đọc cần biết nhắc ai', () => {
  const r = tin.soanNghiemThu({ ...BC, trangThai: 'Cần sửa lại', nhanXet: 'ảnh tối' },
    { nguoiTen: 'Hùng' });
  assert.ok(r.text.includes('Thanh'));
  assert.ok(/Người chỉnh/.test(JSON.stringify(r.card)));
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
