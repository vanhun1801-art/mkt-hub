/**
 * Một kênh chết mà không ai được báo — lỗ hổng đắt nhất soát ra ngày 07/10/2026.
 *
 * Chuyện đã xảy ra: Google Ads ngừng ghi vào Base từ **23/09**, lý do là
 * "The provided client secret is invalid". Tới **07/10** anh Hùng mới thấy, tức
 * **im 14 ngày**. Trong 14 ngày đó bản tin 8:00 vẫn đi đều và vẫn trông bình
 * thường, vì Facebook với TikTok không sao còn bản tin thì chỉ nói chi tiêu.
 *
 * Hai chỗ hỏng, và bộ test này chắn cả hai:
 *
 *   1. `giam-sat.js` có đủ phép kiểm nhưng KHÔNG AI GỌI nó. Nó từng là một tác vụ
 *      Windows trên máy cá nhân, tác vụ đó ngừng từ 31/08 — trang-thai.json đứng
 *      im đúng ngày ấy. Việc kiểm phải sống cùng app, không sống nhờ máy ai.
 *   2. Bản tin hằng ngày không hề nhắc tới sức khoẻ đồng bộ.
 */
const fs = require('fs');
const path = require('path');
const bt = require('../ban-tin-qc');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

console.log('— bộ hẹn giờ phải TỰ chấm điểm, đừng chờ tác vụ ngoài');
{
  const idx = doc('sync/index.js');
  t('lượt tự động có gọi giám sát', /require\('\.\.\/giam-sat'\)/.test(idx));
  /* Bắt theo TÊN HÀM, đừng neo vào cặp ngoặc rỗng: từ 07/10 nó nhận thêm tham
   * số `cli`, và phép kiểm neo vào `chay()` trống đã kêu oan một lần. */
  t('gọi chay() chứ không chỉ chamDiem', /giamSat\.chay\(/.test(idx));
  /* Chấm điểm hỏng thì đồng bộ vẫn phải xong — bọc try riêng. */
  t('bọc try riêng để không kéo sập lượt đồng bộ',
    /try \{[\s\S]{0,700}giamSat\.chay\([\s\S]{0,400}\} catch/.test(idx));
  /* Và KHÔNG được tính vào r.tong.loi, kẻo kích cơ chế thử lại sau 60 giây cho
   * một việc chẳng liên quan tới ghi Base. */
  const i = idx.indexOf('giamSat.chay(');
  const sau = idx.slice(i, i + 600);
  t('không cộng vào bộ đếm lỗi đồng bộ', !/tong\.loi \+=|thuLai\(\)/.test(sau.split('} catch')[0]));
  t('ghi lại lý do trong chú thích', /im 14 ngày|IM 14 NGÀY/i.test(idx));
}

console.log('— bản tin: kênh chết phải đứng ĐẦU thẻ');
{
  const M = require('../metrics');
  /* Bộ dữ liệu tối thiểu cho M.overview — bản tin chỉ cần nó dựng được thẻ. */
  const ngay = '2026-10-06';
  const data = {
    campaigns: [{ id: 'c1', name: 'CD', platform: 'Facebook', status: 'Đang chạy', budget: 0, dailyBudget: 0, start: null, end: null, owners: [], products: [] }],
    groups: [{ id: 'g1', name: 'N', campaignId: 'c1' }],
    ads: [{ id: 'a1', name: 'QC', groupId: 'g1', campaignId: 'c1', campaignName: 'CD', platform: 'Facebook', approval: 'Đã duyệt', campaignStatus: 'Đang chạy', groupStatus: 'Đang chạy' }],
    daily: [{ id: 'd1', date: ngay, adId: 'a1', campaignId: 'c1', groupId: 'g1', platform: 'Facebook', spend: 500000, impressions: 1000, clicks: 20, conversions: 5 }],
    sales: [], minDate: ngay, maxDate: ngay,
  };
  const the = bt.dung(M, data, 'sang', Date.parse('2026-10-07T01:00:00Z'));
  const el = (the && (the.elements || (the.card && the.card.elements))) || [];
  const chu = JSON.stringify(el);

  /* Trên máy chạy test, trang-thai.json là bản THẬT vừa chấm — nên thẻ phải nói
   * một trong ba điều: đang có vấn đề, hoặc chưa biết, hoặc im vì khoẻ. */
  const coKhoi = /Đồng bộ đang có vấn đề|Chưa biết đồng bộ có khoẻ không/.test(chu);
  const tt = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'trang-thai.json'), 'utf8')); } catch (_) { return null; } })();
  const nenCo = !tt || !tt.luc
    || (Date.now() - Date.parse(tt.luc)) / 3600000 > 8
    || !tt.khoe;
  t('có khối sức khoẻ khi cần, im khi khoẻ', coKhoi === nenCo,
    `có=${coKhoi} nên có=${nenCo} khoe=${tt && tt.khoe}`);

  if (coKhoi) {
    /* Đứng ĐẦU: một kênh chết làm mọi con số bên dưới thành nửa sự thật. */
    t('khối sức khoẻ là phần tử đầu tiên',
      /Đồng bộ đang có vấn đề|Chưa biết đồng bộ/.test(JSON.stringify(el[0])), JSON.stringify(el[0]).slice(0, 120));
    t('có gạch ngăn với phần số liệu', el[1] && el[1].tag === 'hr', JSON.stringify(el[1]));
  }
}

console.log('— việc kiểm NGỪNG thì nói "chưa biết", đừng im như thể khoẻ');
{
  const src = doc('ban-tin-qc.js');
  /* Cùng bài học với băng "Đồng bộ đang khoẻ" hồi 18/09: kết quả kiểm cũ không
   * phải tin tốt về đồng bộ, nó là tin xấu về chính việc kiểm. */
  t('có xét tuổi của lần chấm điểm', /GIO_KIEM_COI_LA_CU/.test(src));
  t('quá cũ thì nói chưa biết', /Chưa biết đồng bộ có khoẻ không/.test(src));
  t('và nói rõ chính việc kiểm đã ngừng', /chính việc kiểm đã ngừng/.test(src));
  t('dặn đừng dựa vào số bên dưới', /Đừng dựa vào số dưới đây/.test(src));

  /* Nhánh "quá cũ" phải xét TRƯỚC nhánh khoẻ, nếu không nó không bao giờ chạy tới. */
  const iCu = src.indexOf('GIO_KIEM_COI_LA_CU');
  const iKhoe = src.indexOf('if (tt.khoe) return null');
  t('nhánh quá cũ đứng trước nhánh khoẻ', iCu > 0 && iCu < iKhoe, `${iCu} / ${iKhoe}`);

  /* Khoẻ thì IM — bản tin đã dài, đừng thêm một dòng "mọi thứ ổn" mỗi ngày. */
  t('khoẻ thì không chiếm chỗ', /if \(tt\.khoe\) return null/.test(src));
}

console.log('— tab Kết nối: trạng thái TRẮNG cũng phải nói ra');
{
  const kn = doc('public/ketnoi.js');
  /* Bản đầu: dải "Sức khoẻ từng kênh" trả rỗng khi không có kênh nào — tức đúng
   * lúc tệ nhất thì cái dải sinh ra để theo dõi lại biến mất. */
  t('không kênh nào vẫn vẽ dải sức khoẻ', /không có kênh nào để theo dõi/.test(kn));
  t('và nói rõ hệ quả: không ghi gì lên Base', /cũng không ghi gì lên Base/.test(kn));
  /* Dải đứng TRƯỚC khối đỏ trong luồng trang, nên phải trỏ XUỐNG. Bản đầu ghi
   * "phía trên" và trỏ vào chỗ không có gì — đúng loại lỗi đã mắc với băng gọi
   * tên nút "Lấy lại quyền". */
  t('trỏ đúng hướng tới khối đỏ', /ngay bên dưới<\/b> nói cách giữ token/.test(kn));

  /* Trên Render, câu "dán token vào rồi Lưu cấu hình" là dẫn người ta vào vòng
   * lặp: dán xong chạy được, deploy một cái là mất, rồi lại dán. */
  t('trên ổ đĩa tạm thì cảnh báo token sẽ mất', /sẽ mất ở lần deploy kế tiếp/.test(kn));
  t('chỉ đúng chỗ giữ được lâu dài', /ADS_CONNECT_JSON/.test(kn));
  t('nói rõ biến đó đã được đặt hay chưa', /chưa được đặt/.test(kn));
  t('có ba bước làm theo thứ tự', /Làm theo thứ tự này/.test(kn));
  /* Và hệ quả thật: không có biến đó thì mọi thứ phụ thuộc máy cá nhân. */
  t('nói ra hệ quả phụ thuộc máy cá nhân', /chỉ chạy khi máy cá nhân đang bật/.test(kn));

  /* Máy cá nhân thì KHÔNG được doạ, vì ở đó dán token là đủ. */
  t('máy cá nhân vẫn giữ lời khuyên cũ', /app tự tạo/.test(kn));
  t('phân nhánh theo oDiaTam', /c\.oDiaTam \? /.test(kn));

  /* 07/10/2026: anh Hùng sửa secret Google trên MỘT bản rồi đọc lỗi
   * Facebook/TikTok của bản KIA. Hai bản trông giống hệt nhau trong hub mà cấu
   * hình thì hoàn toàn riêng — màn hình phải nói đang xem bản nào. */
  t('có nhãn bản đang chạy', /function nhanBanChay/.test(kn));
  t('phân biệt server chung với máy cá nhân',
    /server chung<\/span>/.test(kn) && /máy cá nhân<\/span>/.test(kn));
  t('nói luôn cấu hình lấy từ đâu', /cấu hình lấy từ/.test(kn));
  t('nhãn gắn vào CẢ khối trắng', (kn.match(/nhanBanChay\(c\)/g) || []).length >= 2,
    String((kn.match(/nhanBanChay\(c\)/g) || []).length));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
