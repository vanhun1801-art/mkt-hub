/**
 * Phân quyền theo KÊNH: ai xem việc người nấy.
 *
 * Anh Hùng chạy Facebook + TikTok, chị Hân chạy Google Ads. Chốt này quyết định
 * mỗi người thấy những con số nào — nên sai ở đây là một trong hai kiểu:
 *
 *   rò   người này thấy số của kênh người kia
 *   khoá cả phòng mở app lên thấy trắng trơn
 *
 * Kiểu thứ hai dễ xảy ra hơn nhiều, vì nó đến từ việc lẫn ba trạng thái rất
 * giống nhau: "chưa ai khai gì", "khai là không kênh nào", và "khai đúng mấy
 * kênh". Nửa đầu bộ test này chỉ để tách ba cái đó ra.
 */
const path = require('path');
const quyen = require('../quyen');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const API = { mode: 'api' };
const FILE = { mode: 'file' };
const ENV = {};
const req = (h = {}) => ({ headers: h });
const kenh = (v) => req({ 'x-hub-perm-kenh': v });

console.log('— ba trạng thái, ba ý nghĩa KHÁC HẲN nhau');
{
  /* Đây là chỗ dễ hỏng nhất của cả tính năng. `null` và `[]` chỉ khác nhau một
   * dấu ngoặc mà hậu quả ngược hẳn: một cái là "không giới hạn", cái kia là
   * "cấm sạch". */
  t('không có header = KHÔNG giới hạn (null)', quyen.kenhDuocXem(req(), API, ENV) === null);
  t('header rỗng cũng là không giới hạn', quyen.kenhDuocXem(kenh(''), API, ENV) === null);
  t('dấu * = không giới hạn', quyen.kenhDuocXem(kenh('*'), API, ENV) === null);

  const khong = quyen.kenhDuocXem(kenh('-'), API, ENV);
  t('dấu - = mảng RỖNG, tức không kênh nào', Array.isArray(khong) && khong.length === 0);

  const hai = quyen.kenhDuocXem(kenh('Facebook,TikTok'), API, ENV);
  t('danh sách đọc đúng', JSON.stringify(hai) === '["Facebook","TikTok"]', JSON.stringify(hai));
  t('có khoảng trắng thừa vẫn đọc được',
    JSON.stringify(quyen.kenhDuocXem(kenh(' Facebook , TikTok '), API, ENV)) === '["Facebook","TikTok"]');

  /* Vì sao "không header" KHÔNG được hiểu là cấm: hub bản cũ chưa biết gửi header
   * này. Hiểu im lặng thành cấm là cả phòng mất số ngay giây deploy hub, mà
   * chẳng ai làm gì sai. */
  t('máy cá nhân thì không giới hạn bao giờ', quyen.kenhDuocXem(kenh('-'), FILE, ENV) === null);
  /* Cổng mở ra ngoài thì header không đáng tin — nhưng "không tin" ở đây phải là
   * KHÔNG GIỚI HẠN, không phải cấm: cấm dựa trên một header không tin được cũng
   * vô lý như cho phép dựa trên nó. */
  t('HUB_TRUST_HEADER=0 thì bỏ qua header', quyen.kenhDuocXem(kenh('-'), API, { HUB_TRUST_HEADER: '0' }) === null);
}

console.log('— giao giữa "chọn xem" và "được xem"');
{
  const GA = ['Google Ads'];
  t('không chọn gì = xem hết phần mình được',
    JSON.stringify(quyen.locKenh([], GA)) === '["Google Ads"]');
  t('chọn đúng kênh mình được thì giữ nguyên',
    JSON.stringify(quyen.locKenh(['Google Ads'], GA)) === '["Google Ads"]');

  /* Gõ thẳng ?platform=Facebook vào thanh địa chỉ là chuyện làm được, nên phép
   * giao phải nằm ở SERVER chứ không phải ở nút bấm. */
  const lach = quyen.locKenh(['Facebook'], GA);
  t('chọn kênh KHÔNG được phép thì không lọt', !lach.includes('Facebook'), JSON.stringify(lach));

  /* Và phải trả về một tên không khớp gì cả, chứ KHÔNG trả mảng rỗng: xuống tới
   * filterDaily, mảng rỗng lại có nghĩa "không lọc" — tức mở toang đúng cái vừa
   * định chặn. Đây là loại lỗi im lặng nhất trong cả tính năng này. */
  t('và KHÔNG trả mảng rỗng (rỗng = không lọc = mở toang)', lach.length > 0);
  t('không kênh nào cũng phải khác mảng rỗng', quyen.locKenh([], []).length > 0);

  t('trộn được và không được thì chỉ giữ phần được',
    JSON.stringify(quyen.locKenh(['Facebook', 'Google Ads'], GA)) === '["Google Ads"]');
  t('không giới hạn thì chọn sao dùng vậy',
    JSON.stringify(quyen.locKenh(['Facebook'], null)) === '["Facebook"]');
}

console.log('— cắt bộ dữ liệu');
{
  const data = {
    campaigns: [
      { id: 'c1', name: 'FB1', platform: 'Facebook' },
      { id: 'c2', name: 'GA1', platform: 'Google Ads' },
      { id: 'c3', name: 'Chưa gán', platform: '(chưa gán)' },
    ],
    groups: [
      { id: 'g1', name: 'n1', campaignId: 'c1' },
      { id: 'g2', name: 'n2', campaignId: 'c2' },
    ],
    ads: [
      { id: 'a1', name: 'QC FB', platform: 'Facebook' },
      { id: 'a2', name: 'QC GA', platform: 'Google Ads' },
    ],
    daily: [
      { id: 'd1', date: '2026-09-01', platform: 'Facebook', spend: 100 },
      { id: 'd2', date: '2026-09-01', platform: 'Google Ads', spend: 200 },
      { id: 'd3', date: '2026-09-01', platform: '(chưa gán)', spend: 7 },
    ],
    sales: [
      { id: 's1', channel: 'Facebook', revenue: 1000 },
      { id: 's2', channel: 'Google Ads', revenue: 2000 },
      { id: 's3', channel: 'Khác', revenue: 9000 },
    ],
  };
  const MOI = ['Facebook', 'TikTok', 'Google Ads'];

  t('không giới hạn thì trả về NGUYÊN bộ cũ',
    quyen.locDuLieuTheoKenh(data, null) === data);

  const ga = quyen.locDuLieuTheoKenh(data, ['Google Ads'], MOI);
  t('chỉ còn chiến dịch của kênh mình', ga.campaigns.some((c) => c.id === 'c2')
    && !ga.campaigns.some((c) => c.id === 'c1'));
  /* Nhóm quảng cáo KHÔNG mang tên nền tảng, phải lọc theo chiến dịch của nó. */
  t('nhóm lọc theo chiến dịch, không theo tên nền tảng',
    ga.groups.length === 1 && ga.groups[0].id === 'g2', JSON.stringify(ga.groups.map((g) => g.id)));
  t('chỉ còn quảng cáo của kênh mình', ga.ads.length === 1 && ga.ads[0].id === 'a2');

  /* Doanh thu cũng bị cắt — anh Hùng đã chọn "có áp cho tab Doanh thu & ROAS".
   * Kênh "Khác" (lữ hành, khách cũ) không phải của ai nên cũng không hiện. */
  t('doanh thu chỉ còn kênh mình', ga.sales.length === 1 && ga.sales[0].channel === 'Google Ads',
    JSON.stringify(ga.sales.map((s) => s.channel)));

  /* Dòng vô chủ giữ cho MỌI người: đo thật có 2 dòng "(chưa gán)" 24.273đ. Lọc
   * bỏ thì khi cả phòng đều bị giới hạn, không ai còn thấy chúng — kể cả cảnh
   * báo "chưa gắn quảng cáo" sinh ra từ chính mấy dòng đó. */
  t('dòng KHÔNG thuộc kênh nào vẫn giữ lại', ga.daily.some((d) => d.id === 'd3'),
    JSON.stringify(ga.daily.map((d) => d.platform)));
  t('nhưng dòng của kênh khác thì bỏ', !ga.daily.some((d) => d.id === 'd1'));

  /* Bảng tra phải dựng lại: để nguyên là nó vẫn trỏ tới bản ghi vừa bị cắt, và
   * một chỗ nào đó tra ra dữ liệu lẽ ra không được thấy. */
  t('bảng tra dựng lại theo bộ đã cắt', !ga.cMap.c1 && !!ga.cMap.c2);
  t('có cờ báo là đang bị giới hạn', ga.biGioiHan === true);
  t('và kèm danh sách kênh để giao diện nói ra', JSON.stringify(ga.kenhDuocXem) === '["Google Ads"]');

  /* Không kênh nào thì KHÔNG GÌ CẢ, kể cả dòng vô chủ: người này không dùng app
   * này, cho họ thấy 24.273đ vô chủ chỉ làm băng báo "không có số để hiện" thành
   * ra nói sai. */
  const khong = quyen.locDuLieuTheoKenh(data, [], MOI);
  t('không kênh nào thì sạch mọi bảng',
    !khong.campaigns.length && !khong.ads.length && !khong.daily.length && !khong.sales.length);
  t('kể cả dòng vô chủ', khong.daily.length === 0);
}

console.log('— server phải canh ở CẢ HAI chỗ, không đường nào lọt');
{
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  /* Hai chốt: queryOpts (bộ lọc từ URL) và dataFor (bộ dữ liệu). Thiếu `req` là
   * chốt không biết người hỏi là ai, tức không canh gì cả. */
  t('queryOpts nhận req', /function queryOpts\(u, req\)/.test(src));
  t('dataFor nhận req', /async function dataFor\(u, req\)/.test(src));
  t('queryOpts có ép phép giao kênh', /quyen\.locKenh\(list\('platform'\), quyen\.kenhDuocXem\(req, cfg\)\)/.test(src));
  t('dataFor có cắt dữ liệu', /quyen\.locDuLieuTheoKenh\(d, quyen\.kenhDuocXem\(req, cfg\)\)/.test(src));

  /* Gọi thiếu req là lỗi im lặng: JS cho `undefined` trôi qua, chốt trả "không
   * giới hạn", và app mở toang mà không báo gì. */
  t('không còn chỗ nào gọi queryOpts(u) thiếu req', !/queryOpts\(u\)/.test(src));
  t('không còn chỗ nào gọi dataFor(u) thiếu req', !/dataFor\(u\)/.test(src));

  /* Đường điều khiển phải tìm quảng cáo trong bộ ĐÃ CẮT. Đọc thẳng store.get()
   * là chị Hân tắt được quảng cáo Facebook của anh Hùng, chỉ cần biết id. */
  const dk = src.indexOf("p === '/api/dieu-khien/xem-truoc'");
  /* Bỏ chú thích trước khi dò: chính lời chú thích ở đó có câu "dataFor() chứ
   * KHÔNG phải store.get()", nên dò nguyên văn thì test bắt được chữ trong lời
   * giải thích và báo lỗi cho một đoạn mã hoàn toàn đúng. Tôi đã viết hụt đúng
   * như vậy ở bản đầu. */
  const boChuThich = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const khoiDK = boChuThich(src.slice(dk, dk + 1600));
  t('điều khiển tìm quảng cáo qua dataFor', /dataFor\(u, req\)/.test(khoiDK));
  t('và KHÔNG đọc thẳng store.get()', !/store\.get\(\)/.test(khoiDK));

  /* Ba đường hỏi thẳng nền tảng nên phép cắt ở dataFor không với tới. */
  t('/api/hanh-dong bỏ qua kênh không được xem',
    /chiKenh && !chiKenh\.includes\(ten\)/.test(src));
  t('/api/dieu-khien/kha-nang chỉ dò kênh được xem', /const duocXem = \(ten\)/.test(src));

  /* Chip nguồn ở đầu trang in thẳng danh sách kênh — không cắt thì nó ghi đủ ba
   * kênh trong khi số bên dưới chỉ có một. Số đúng mà nhãn nói dối. */
  t('chip nguồn cắt theo kênh được xem',
    /kenhTrucTiep: data\.kenhDuocXem/.test(src));
}

console.log('— giao diện phải NÓI RA là đang bị giới hạn');
{
  const fs = require('fs');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  /* Lọc im lặng là loại lỗi tệ nhất ở đây: mở lên thấy "Chi tiêu 24.803.881đ" và
   * tưởng đó là cả công ty. Số đúng, nhãn sai — cùng loại với ROAS 174,93×. */
  t('có băng báo giới hạn', /function veBangGioiHanKenh/.test(app));
  t('băng được vẽ khi nạp meta', /veBangGioiHanKenh\(m\)/.test(app));
  t('nói rõ số chỉ tính phần kênh mình', /không phải cả công ty/.test(app));
  t('chưa có kênh nào thì chỉ đường đi xin', /Phân quyền/.test(app));
  /* Ô "Doanh thu toàn công ty" phải GIẤU khi bị giới hạn: lúc đó nó tính đúng
   * phép nhưng sai ý nghĩa — nó chỉ còn là doanh thu của kênh mình. */
  t('giấu ô doanh thu toàn công ty khi bị giới hạn',
    /\$\{d\.biGioiHan \? '' : `<div class="kpi"><div class="k-label">Doanh thu toàn công ty/.test(app));
  t('và lưới ô số co lại cho khỏi hở', /repeat\(\$\{d\.biGioiHan \? 3 : 4\}/.test(app));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
