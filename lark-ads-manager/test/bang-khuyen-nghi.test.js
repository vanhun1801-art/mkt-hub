/**
 * Hai bảng khuyến nghị ở màn tổng quan không được nói ngược nhau.
 *
 * Vì sao có bộ này: anh Hùng hỏi có bấm tắt quảng cáo ngay trong app được không.
 * Trước khi gắn nút thì khuyến nghị phải đáng tin — mà đo trên dữ liệu thật 30
 * ngày, thẻ "Quảng cáo hiệu quả nhất" đang chứa hai dòng bị chính app gắn
 * "Tắt / xem lại":
 *
 *   7  TG01 - Mở màn 1 mùa hè sôi động   Facebook  CPA 29.059đ  Tắt / xem lại
 *   8  IS_So sánh chi tiêu lẻ và cả land Facebook  CPA 29.391đ  Tắt / xem lại
 *
 * Nguyên nhân: luật chọn lấy 8 cái CPA thấp nhất BẤT KỂ khuyến nghị, nên chưa đủ
 * 8 cái tốt thì nó lấy cái xấu bù cho đủ tám dòng. Một cái nút "Tắt" đặt cạnh
 * khuyến nghị mà app tự nói ngược thì tệ hơn là không có nút.
 *
 * Kiểm THẲNG hai hàm chọn, không đi qua overview(): overview() đọc mục tiêu CPA
 * từ muc-tieu.json trên máy, nên bộ test sẽ đo cả một thứ không liên quan và đổi
 * ngưỡng trên máy là đổi kết quả test.
 */
const M = require('../metrics');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const NGUONG = { minSpendJudge: 300000 };

/* Một quảng cáo đã có khuyến nghị. Chi tiêu suy ra từ CPA × chuyển đổi.
 *
 * 30 chuyển đổi, không phải 10: với 10 thì cái CPA thấp nhất (14.000đ) ra chi
 * tiêu 140.000đ — DƯỚI ngưỡng đánh giá 300.000đ, nên nó bị lọc và bài test đo
 * nhầm sang phép lọc ngưỡng chứ không đo phép lọc khuyến nghị. Tôi đã viết sai
 * đúng chỗ này ở bản đầu. */
const qc = (id, cpa, muc, cd = 30) => ({
  id, name: 'QC ' + id, cpa, conversions: cd, spend: cpa * cd, actionLevel: muc,
});

console.log('— quảng cáo bị bảo TẮT không được nằm trong thẻ "hiệu quả nhất"');
{
  /* Bốn cái tốt, tám cái xấu. Nếu luật còn lấy cho đủ tám dòng thì bốn dòng cuối
   * của thẻ "hiệu quả nhất" sẽ là dòng xấu — đúng lỗi đã đo trên dữ liệu thật. */
  const ads = [
    qc('t1', 14000, 'great'), qc('t2', 18000, 'great'),
    qc('t3', 21000, 'good'), qc('t4', 24000, 'good'),
    qc('x1', 29000, 'warn'), qc('x2', 31000, 'warn'),
    qc('x3', 34000, 'bad'), qc('x4', 38000, 'bad'),
    qc('x5', 41000, 'bad'), qc('x6', 45000, 'bad'),
    qc('x7', 52000, 'bad'), qc('x8', 60000, 'bad'),
  ];
  const tot = M.chonHieuQua(ads, NGUONG);
  const xau = M.chonCanXuLy(ads, NGUONG);

  const lot = tot.filter((a) => a.actionLevel === 'bad' || a.actionLevel === 'warn');
  t('không dòng xấu nào lọt vào thẻ hiệu quả', lot.length === 0, lot.map((a) => a.id).join(', '));
  t('thẻ thà bốn dòng còn hơn tám dòng nói ngược', tot.length === 4, String(tot.length));
  t('thẻ cần xử lý vẫn nhận đủ tám', xau.length === 8, String(xau.length));

  /* Không quảng cáo nào được xuất hiện ở CẢ HAI thẻ — đó chính là cái anh Hùng
   * nhìn thấy: cùng một dòng, hai nhãn ngược nhau. */
  const trong = new Set(tot.map((a) => a.id));
  const caHai = xau.filter((a) => trong.has(a.id));
  t('không quảng cáo nào nằm ở cả hai thẻ', caHai.length === 0, caHai.map((a) => a.id).join(', '));
}

console.log('— thứ tự trong từng thẻ');
{
  const ads = [qc('a', 24000, 'good'), qc('b', 14000, 'great'), qc('c', 21000, 'good'), qc('d', 18000, 'great')];
  const cpa = M.chonHieuQua(ads, NGUONG).map((a) => a.cpa);
  t('thẻ hiệu quả: CPA thấp nhất lên đầu',
    JSON.stringify(cpa) === JSON.stringify([...cpa].sort((x, y) => x - y)), cpa.join(', '));

  /* Quảng cáo 0 chuyển đổi phải lên ĐẦU thẻ cần xử lý. CPA của nó là vô cực chứ
   * không phải 0 — tính là 0 thì cái gấp nhất tụt xuống cuối bảng vì phép chia. */
  const xau = M.chonCanXuLy([
    qc('cpa-cao', 90000, 'bad'),
    { id: 'khong-cd', name: 'QC 0 CĐ', cpa: 0, conversions: 0, spend: 800000, actionLevel: 'bad' },
    qc('vua-vua', 40000, 'warn'),
  ], NGUONG);
  t('0 chuyển đổi xếp trên cả CPA cao nhất', xau[0].id === 'khong-cd', xau.map((a) => a.id).join(' > '));
  t('sau đó mới tới CPA cao dần xuống', xau[1].id === 'cpa-cao' && xau[2].id === 'vua-vua',
    xau.map((a) => a.id).join(' > '));
}

console.log('— chặn trên tám dòng, và bỏ dòng chưa đủ chi tiêu để đánh giá');
{
  const nhieu = [];
  for (let i = 0; i < 12; i += 1) nhieu.push(qc('t' + i, 10000 + i * 1000, 'good'));
  t('nhiều hơn tám cái tốt thì cắt còn tám', M.chonHieuQua(nhieu, NGUONG).length === M.SO_DONG_BANG);

  /* Dưới ngưỡng đánh giá thì khuyến nghị là "Chưa đủ dữ liệu" — không tốt cũng
   * không xấu. Đưa vào bảng nào cũng là nói quá, mà cái nút bật/tắt lại gắn theo
   * bảng. */
  const be = { id: 'be', name: 'QC bé', cpa: 5000, conversions: 2, spend: 10000, actionLevel: 'idle' };
  t('dòng chưa đủ dữ liệu không vào thẻ hiệu quả', M.chonHieuQua([be], NGUONG).length === 0);
  t('dòng chưa đủ dữ liệu không vào thẻ cần xử lý', M.chonCanXuLy([be], NGUONG).length === 0);

  /* Kể cả khi khuyến nghị là xấu: chi 100.000đ mà 0 chuyển đổi thì chưa kết luận
   * được gì, ngưỡng đánh giá tồn tại chính vì thế. */
  const beXau = { id: 'be2', name: 'QC bé xấu', cpa: 0, conversions: 0, spend: 100000, actionLevel: 'bad' };
  t('dòng xấu nhưng chi tiêu dưới ngưỡng cũng không vào bảng',
    M.chonCanXuLy([beXau], NGUONG).length === 0);
}

console.log('— hai hàm không được sửa vào danh sách gốc');
{
  /* Nếu chúng sort tại chỗ thì thứ tự của mảng ads gốc bị đổi, và mọi thứ tính
   * sau đó trong overview() nhận một mảng đã bị xáo. */
  const ads = [qc('a', 30000, 'bad'), qc('b', 10000, 'good'), qc('c', 20000, 'good')];
  const truoc = ads.map((a) => a.id).join(',');
  M.chonHieuQua(ads, NGUONG);
  M.chonCanXuLy(ads, NGUONG);
  t('danh sách gốc giữ nguyên thứ tự', ads.map((a) => a.id).join(',') === truoc,
    ads.map((a) => a.id).join(','));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
