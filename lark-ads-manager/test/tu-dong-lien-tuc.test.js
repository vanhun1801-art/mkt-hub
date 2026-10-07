/**
 * Hội thoại + ROAS phải tự chạy, không cần ai bấm.
 *
 * Anh Hùng, 07/10/2026: "anh đang tự thủ công vào kéo từ Tourwell để xem hội
 * thoại, ROAS thì tải file về và tải lên để tính rồi tự ấn kéo lên Base. Anh
 * cần thay đổi việc này một cách tự động… anh vào xem là thấy ngay, không cần
 * nghĩ ngợi dữ liệu mới hay cũ."
 *
 * VÌ SAO TRƯỚC ĐÓ KHÔNG TỰ. Cả chuỗi hội thoại → ROAS → ghi Base nằm LỒNG BÊN
 * TRONG nhánh kéo Tourwell, nên chỉ chạy đúng những lượt vừa kéo Tourwell xong.
 * Ba ca đều làm nó không bao giờ chạy:
 *
 *   1. Tourwell chưa khai trên máy đang dùng → không vào nhánh
 *   2. kho còn tươi (dưới 2 giờ)             → vào nhánh rồi nhảy qua
 *   3. kho đến từ file Excel nhập tay        → không có ai kéo Tourwell cả
 *
 * Ca 3 đúng là ca anh làm hằng ngày — nên với anh thì mọi thứ đều là việc tay.
 *
 * Giá đã ĐO trước khi tách, không ước: hội thoại Pancake 30 ngày mất 31 giây
 * (2.393 hội thoại), 7 ngày mất 5 giây — rẻ, chạy mỗi lượt được. Tourwell 21
 * ngày mất ~6 phút — đắt, giữ cửa 2 giờ cho riêng nó.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

console.log('— hai bước tách hẳn nhau trong lượt hẹn giờ');
{
  const s = doc('sync/index.js');
  const i1 = s.indexOf('BƯỚC 1 — kéo lead + đơn Tourwell');
  const i2 = s.indexOf('BƯỚC 2 — hội thoại + ROAS + ghi Base');
  t('có bước 1 (Tourwell)', i1 > 0);
  t('có bước 2 (hội thoại + ROAS)', i2 > 0);
  t('bước 2 đứng sau bước 1', i2 > i1);

  /* Điểm mấu chốt: lời gọi tính ROAS KHÔNG còn nằm trong nhánh Tourwell. Cách
   * kiểm chắc nhất mà không phải chạy thật: nó phải đứng SAU dấu đóng try/catch
   * của khối Tourwell. */
  const iGoi = s.indexOf('ghiCongTuDong.chay(');
  const iDongTw = s.indexOf("logFn('  [hẹn giờ] Tourwell LỖI  '");
  t('tính ROAS nằm NGOÀI khối Tourwell', iGoi > iDongTw, `${iGoi} vs ${iDongTw}`);

  /* Và nó chỉ cần có kho ĐƠN, không cần biết kho đến từ đâu. */
  t('chỉ cần có kho đơn là chạy', /if \(!kho \|\| !kho\.don \|\| !kho\.don\.rows \|\| !kho\.don\.rows\.length\)/.test(s));
  t('chưa có kho thì nói rõ phải làm gì một lần',
    /nhập file Excel một lần là từ đó tự chạy/.test(s));

  /* Cửa 2 giờ vẫn phải còn — cho RIÊNG Tourwell, vì nó đắt. */
  t('Tourwell vẫn giữ cửa còn-tươi', /khoRoas\.conTuoi\(TUOI_KHO_GIO\)/.test(s));
  t('cửa đó chỉ bọc Tourwell, không bọc ROAS',
    s.indexOf('khoRoas.conTuoi(TUOI_KHO_GIO)') < iDongTw);

  /* Lỗi bước nào phải gọi đúng tên bước đó — hai khối riêng thì nhật ký cũng
   * phải riêng, không thì đọc log không biết chỗ nào hỏng. */
  t('lỗi ROAS có nhãn riêng', /\[hẹn giờ\] tính ROAS LỖI/.test(s));
  t('lỗi Tourwell vẫn có nhãn riêng', /\[hẹn giờ\] Tourwell LỖI/.test(s));
}

console.log('— màn hình nói độ tươi, không bắt tự trừ giờ');
{
  const s = doc('public/app.js');
  t('có hàm đo tuổi', /function doTuoi\(/.test(s));
  t('có dải chữ độ tươi', /function doTuoiHtml\(/.test(s));
  t('khối ROAS dùng dải này', /\$\{doTuoiHtml\(r\)\}/.test(s));
  /* Dòng cũ chỉ in mốc trần — đã thay, không được còn sót. */
  t('bỏ dòng "Tính lúc" trần', !/<div class="help">Tính lúc <b>/.test(s));

  /* Ngưỡng phải bám nhịp thật, không gõ cứng. */
  t('ngưỡng tính theo nhịp hẹn giờ', /Number\(moiSoGio\) > 0 \? Number\(moiSoGio\) \* 60 : 120/.test(s));
  t('nói lượt kế tiếp lúc nào', /lượt kế tiếp khoảng/.test(s));
  t('chưa bật tự chạy thì nói thẳng', /chưa bật tự tính/.test(s));
  t('đang chạy dở thì cảnh báo số đang xem là của lượt trước', /Đang tính lại/.test(s));
  t('quá cũ thì đoán là lượt tự chạy lỗi', /lượt tự chạy đang lỗi/.test(s));

  /* Câu cũ nói ghi công là "việc tay, không theo hẹn giờ" — từ hôm nay là sai. */
  t('bỏ câu nói ghi công là việc tay', !/việc tay, không theo hẹn giờ/.test(s));
  t('và nói đúng là tự chạy', /tự chạy theo hẹn giờ/.test(s));
}

console.log('— API trả kèm nhịp để màn hình nói được');
{
  const s = doc('server.js');
  t('cache ROAS trả kèm hẹn giờ', /hengio: sync\.schedulerState\(\), moiSoGio/.test(s));
  t('và trả cả khi chưa từng tính', /\{ luc: null, \.\.\.nhip \}/.test(s));
  t('và báo đang chạy dở', /dangChay: !!sync\.dangChay\(\)/.test(s));
}

console.log('— hàm đo tuổi chạy đúng trên các mốc thật');
{
  /* Nạp hai hàm ra khỏi file, không cần DOM. */
  const s = doc('public/app.js');
  const i = s.indexOf('function doTuoi(');
  const j = s.indexOf('const RS = { kq:');
  /* new Function chứ không eval: eval trực tiếp nhét hai hàm vào chính scope này
   * rồi đụng tên với biến hứng kết quả. */
  // eslint-disable-next-line no-new-func
  const { doTuoi, doTuoiHtml } = new Function(
    s.slice(i, j) + '\nreturn { doTuoi: doTuoi, doTuoiHtml: doTuoiHtml };')();
  const truoc = (phut) => new Date(Date.now() - phut * 60000).toISOString();

  t('dưới 2 phút là "vừa xong"', doTuoi(truoc(1), 1).chu === 'vừa xong');
  t('12 phút', doTuoi(truoc(12), 1).chu === '12 phút trước');
  t('5 giờ', doTuoi(truoc(300), 1).chu === '5 giờ trước');
  t('2 ngày', doTuoi(truoc(2880), 1).chu === '2 ngày trước');

  /* Cùng một mốc, hai nhịp khác nhau phải cho hai kết luận khác nhau — đây là
   * lý do không gõ cứng ngưỡng. */
  t('90 phút với nhịp 1 giờ là vẫn ổn', doTuoi(truoc(85), 1).muc === 'good');
  t('5 giờ với nhịp 1 giờ là quá cũ', doTuoi(truoc(300), 1).muc === 'bad');
  t('5 giờ với nhịp 6 giờ là bình thường', doTuoi(truoc(300), 6).muc === 'good');

  t('không có mốc thì không bịa', doTuoi(null, 1).co === false);
  t('mốc rác cũng không vỡ', doTuoi('xx', 1).co === false);
  /* Đồng hồ máy lệch về tương lai thì đừng hiện số âm. */
  t('mốc ở tương lai vẫn đọc được',
    doTuoi(new Date(Date.now() + 60000).toISOString(), 1).phut === 0);

  const html = doTuoiHtml({ luc: truoc(12), moiSoGio: 1,
    hengio: { dangBat: true, lanKeTiep: new Date(Date.now() + 48 * 60000).toISOString() } });
  t('dải chữ nêu khoảng cách', /12 phút trước/.test(html));
  t('dải chữ nêu nhịp', /mỗi <b>1 giờ<\/b>/.test(html));
  t('dải chữ nêu lượt kế tiếp', /lượt kế tiếp khoảng/.test(html));
  t('xanh khi còn tươi', /var\(--good\)/.test(html));

  const cu = doTuoiHtml({ luc: truoc(540), moiSoGio: 1, hengio: { dangBat: true } });
  t('đỏ khi quá cũ', /var\(--bad\)/.test(cu));
  t('và chỉ chỗ xem nhật ký', /Kết nối/.test(cu));
}

console.log('— một nguồn hỏng không được giết cả lượt');
{
  const s = doc('sync/ghicongtudong.js');
  /* Đo thật 07/10/2026: Pancake trả "An error occurred. Please try again later."
   * (bị chặn tần suất) trong khi POS vẫn sẵn sàng — mà kết quả là 0 đơn xác định
   * được kênh, vì hai nguồn nằm chung một try nên lỗi bên này ném trước khi bên
   * kia kịp dùng. Với lượt hẹn giờ mỗi tiếng, đó là một tiếng mất trắng vì một
   * cú nấc của Pancake. */
  t('POS có try riêng', /hong\.push\('POS: '/.test(s));
  t('Pancake có try riêng', /hong\.push\('Pancake: '/.test(s));
  t('một bên hỏng vẫn tính bằng bên kia',
    /vẫn tính bằng hội thoại/.test(s) && /vẫn tính bằng POS/.test(s));
  t('cả hai cùng hỏng mới coi là không biết gì',
    /if \(hong\.length && !posRows\.length && !htRows\.length\)/.test(s));
  /* Và phải NÓI RA trên màn hình, không chỉ ghi vào log của server: một con số
   * tính thiếu nguồn mà trông y hệt con số đủ nguồn là kiểu sai không ai thấy. */
  t('thiếu nguồn thì hiện lên khối ROAS', /Lượt này thiếu một nguồn/.test(s));
}

console.log('— nhắc "chưa bền" đặt ngay cạnh nút Lưu, không chỉ ở đầu trang');
{
  /* Anh Hùng, 07/10/2026: vừa khai lại 10 page Pancake trên server chung rồi hỏi
   * "khi anh deploy có mất không, vì thêm khá mất thời gian".
   *
   * App VỐN ĐÃ biết câu trả lời — benVung() so vân tay giữa đĩa và biến môi
   * trường, và băng đỏ "Đừng deploy trước khi làm việc này" ở ĐẦU trang nói đúng
   * điều đó. Nhưng lúc gõ 10 page thì người ta ở tận cuối thẻ Pancake, cách băng
   * ấy mấy màn hình cuộn. Cảnh báo đặt sai chỗ thì bằng không có. */
  const s = doc('public/ketnoi.js');
  t('có hàm nhắc', /const nhacChuaBen = \(c, key\) =>/.test(s));
  t('gắn ở thẻ Pancake', /\$\{nhacChuaBen\(c, 'pancake'\)\}/.test(s));
  t('gắn ở thẻ POS', /\$\{nhacChuaBen\(c, 'pancakePos'\)\}/.test(s));
  t('gắn ở thẻ Tourwell', /\$\{nhacChuaBen\(c, 'tourwell'\)\}/.test(s));

  /* Phải nằm SAU nút Lưu của chính thẻ đó — đó là cả lý do tồn tại của nó. */
  t('đứng sau nút Lưu Pancake', s.indexOf("nhacChuaBen(c, 'pancake')") > s.indexOf('id="pcLuu"'));
  t('đứng sau nút Lưu POS', s.indexOf("nhacChuaBen(c, 'pancakePos')") > s.indexOf('id="ppLuu"'));

  /* Phân biệt hai ca: mất hẳn, và tụt về giá trị cũ. Ca thứ hai tệ hơn vì app
   * vẫn chạy, chỉ chạy bằng thứ cũ, và không có gì báo. */
  t('nói ca mất hẳn', /deploy là mất hẳn/.test(s));
  t('nói ca tụt về giá trị cũ', /đang giữ giá trị CŨ/.test(s));

  /* Trên máy cá nhân phải IM: ở đó không có deploy nào, nói "deploy là mất" là
   * nói một điều không đúng hoàn cảnh. */
  t('chỉ hiện khi ổ đĩa là ổ tạm', /if \(!c\.oDiaTam\) return '';/.test(s));
  t('và chỉ hiện đúng kênh đang gặp', /if \(!\(b\.seMat \|\| \[\]\)\.includes\(key\)\) return '';/.test(s));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
