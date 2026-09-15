/**
 * Cảnh báo phải nói rõ nó đang so với CÁI GÌ.
 *
 * Anh Hùng bắt được: "trên base anh để ngày kết thúc để tượng trưng mà thực tế
 * anh không set ngày kết thúc". Đo trên Facebook thật, cả hai chiến dịch:
 *
 *   Daily_Tour Đảo       Base: kết thúc 31/08   Facebook: KHÔNG đặt ngày kết thúc
 *   DM sản phẩm Hè 2026  Base: kết thúc 31/08   Facebook: KHÔNG đặt ngày kết thúc
 *
 * Nên 6 cảnh báo "Quá ngày kết thúc" là bịa ra từ một ô điền tượng trưng. Và 3
 * cảnh báo "Vượt ngân sách 374%/304%/452%" cũng vậy: chúng so chi tiêu TOÀN THỜI
 * GIAN với ô "Ngân sách dự kiến 6.000.000đ" gõ trong Base — trong khi ngân sách
 * ngày thật trên Facebook là 400.000đ và nền tảng không hề chặn ở 6 triệu.
 *
 * 9 trong 32 cảnh báo nói về Base chứ không nói về quảng cáo, mà lại ngồi ở ô
 * "NGHIÊM TRỌNG" và "CẦN THEO DÕI". Bộ test này giữ cho chúng không quay lại.
 */
const M = require('../metrics');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const NGUONG = {
  cpa: { default: 25000 }, minSpendJudge: 300000, budgetWarnPct: 80,
  ctrMin: 1, dataLagDays: 2, spendSpikePct: 50,
};

/* Dựng dữ liệu tay: bộ test phải chạy được cả khi Base rỗng, và phải dựng được
 * đúng tình huống "ô Base điền tượng trưng" mới bắt được lỗi. */
function duLieu({ end, budget, status = 'Đang chạy', approval = 'Đã duyệt' } = {}) {
  const ngay = '2026-09-01';
  return {
    campaigns: [{ id: 'c1', name: 'CD thử', platform: 'Facebook', status, end, start: null, budget: budget || 0, dailyBudget: 0 }],
    groups: [{ id: 'g1', name: 'Nhóm', campaignId: 'c1' }],
    ads: [{ id: 'a1', name: 'QC thử', groupId: 'g1', campaignId: 'c1', campaignName: 'CD thử',
      platform: 'Facebook', approval, campaignStatus: status, groupStatus: 'Đang chạy' }],
    daily: [{ id: 'd1', date: ngay, adId: 'a1', campaignId: 'c1', groupId: 'g1',
      platform: 'Facebook', spend: 27149101, impressions: 10000, clicks: 200, conversions: 50 }],
    sales: [], minDate: ngay, maxDate: ngay,
  };
}
const timKind = (rows, kind) => rows.filter((a) => a.kind === kind);

console.log('— ngân sách: phải nói rõ đó là ô KẾ HOẠCH trong Base');
{
  const a = M.alerts(duLieu({ budget: 6000000 }), NGUONG);
  const ns = timKind(a, 'budget');
  t('có cảnh báo ngân sách', ns.length > 0);
  const v = ns[0] || {};
  /* Bản trước ghi "Vượt ngân sách: <tên>" trống không — đọc lên tưởng nền tảng
   * đã chặn hoặc sắp chặn. Đo thật: Facebook vẫn chạy bình thường. */
  t('tiêu đề nói rõ là ngân sách DỰ KIẾN', /dự kiến/i.test(v.title || ''), v.title);
  t('chi tiết nói rõ con số lấy từ Base', /Base/.test(v.detail || ''), v.detail);
  t('và nói rõ đây KHÔNG phải giới hạn nền tảng',
    /không phải giới hạn trên nền tảng/i.test(v.detail || ''), v.detail);
  /* So chi tiêu TOÀN THỜI GIAN với một ô không ghi kỳ hạn — phải nói ra, không
   * thì người đọc tưởng đang so trong tháng. */
  t('nói rõ chi tiêu là toàn thời gian', /toàn thời gian/.test(v.detail || ''), v.detail);
}

console.log('— lịch chạy: GOM một dòng, và chỉ đúng việc phải làm');
{
  const d = duLieu({ end: '2026-08-31' });
  /* Ba chiến dịch cùng một ô ngày kết thúc tượng trưng — đúng như dữ liệu thật. */
  d.campaigns = ['c1', 'c2', 'c3'].map((id, i) => ({
    id, name: 'CD ' + i, platform: 'Facebook', status: 'Đang chạy',
    end: '2026-08-31', start: null, budget: 0, dailyBudget: 0,
  }));
  const a = M.alerts(d, NGUONG);

  /* Không còn nhóm 'schedule' riêng lẻ: ba dòng cùng một nguyên nhân thì một
   * dòng nói được, và ba dòng chỉ làm loãng trang. */
  t('không còn cảnh báo lịch chạy rời rạc', timKind(a, 'schedule').length === 0,
    String(timKind(a, 'schedule').length));

  const lech = timKind(a, 'lech');
  t('gom thành đúng MỘT dòng', lech.length === 1, String(lech.length));
  const v = lech[0] || {};
  t('đếm đúng số chiến dịch', /3 chiến dịch/.test(v.title || ''), v.title);
  t('nói rõ ngày đó là ô khai trong Base', /khai trong Base/.test(v.title || ''), v.title);

  /* Đây là chỗ quan trọng nhất: bản cũ gợi ý SAI việc. Ô ngày kết thúc lệch thì
   * việc phải làm là sửa ô trong Base, không phải tắt quảng cáo. */
  t('chỉ đúng việc: sửa ô trong Base', /sửa ô đó/.test(v.detail || ''), v.detail);
  t('và nói thẳng: đừng tắt quảng cáo', /đừng tắt quảng cáo/.test(v.detail || ''), v.detail);

  /* Hạ xuống mức ghi nhận: đây là việc dọn Base, không phải quảng cáo đang hỏng.
   * Để ở mức "cần theo dõi" là nó chiếm chỗ của những cái thật sự cần theo dõi. */
  t('ở mức ghi nhận, không phải cần theo dõi', v.level === 'low', v.level);
}

console.log('— trạng thái trong Base cũ thì nói là Base cũ');
{
  const a = M.alerts(duLieu({ approval: 'Tạm dừng' }), NGUONG);
  const lech = timKind(a, 'lech');
  t('có cảnh báo lệch', lech.length > 0);
  const v = lech.find((x) => /Tạm dừng/.test(x.title)) || {};
  /* Bản trước ghi "Trạng thái duyệt lệch" — đọc lên tưởng nền tảng đang trục
   * trặc. Sự thật ngược lại: quảng cáo vẫn chi tiêu, tức trên nền tảng nó ĐANG
   * CHẠY, và cái sai là ô trong Base. */
  t('tiêu đề nói rõ Base ghi một đằng, quảng cáo chạy một nẻo',
    /Base ghi .* nhưng quảng cáo vẫn chạy/.test(v.title || ''), v.title);
  t('chỉ đúng việc: sửa ô trong Base', /Sửa ô trong Base/.test(v.detail || ''), v.detail);
  t('không còn dùng nhóm "meta" mơ hồ', timKind(a, 'meta').length === 0);
}

console.log('— những cảnh báo ĐO TỪ SỐ THẬT thì giữ nguyên sức nặng');
{
  /* Phân biệt cho rõ: cái phải hạ giọng là cái so với ô khai tay. Cái đo từ chi
   * tiêu và chuyển đổi thật thì vẫn phải kêu to. */
  const d = duLieu({});
  d.daily[0].conversions = 0;
  const a = M.alerts(d, NGUONG);
  const perf = timKind(a, 'perf');
  t('đốt tiền không ra chuyển đổi vẫn là NGHIÊM TRỌNG',
    perf.some((x) => x.level === 'high' && /Không ra chuyển đổi/.test(x.title)),
    JSON.stringify(perf.map((x) => x.level + ':' + x.title)));
}

console.log('— giao diện: khuyến nghị bấm được, và bấm đúng chỗ');
{
  const fs = require('fs');
  const path = require('path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  /* Anh Hùng: "muốn thực hiện được luôn thay vì lên facebook ads, tiktok ads,
   * google ads mà thay đổi". Nút đã có trong hộp chi tiết; thiếu là đường đi từ
   * chỗ ĐỌC khuyến nghị tới chỗ BẤM. */
  t('nhãn khuyến nghị là nút bấm được', /function nutKhuyenNghi/.test(app));
  t('bấm là mở hộp và đi thẳng tới khối điều khiển',
    /window\.__adDetail\('\$\{r\.id\}', true\)/.test(app));
  t('hộp chi tiết nhận yêu cầu cuộn tới điều khiển',
    /window\.__adDetail = async \(id, toiDieuKhien = false\)/.test(app));

  /* Cuộn phải đợi trình duyệt dựng xong hộp: gọi ngay sau innerHTML thì chiều
   * cao còn 0 và cú cuộn rơi vào hư không — đo được scrollTop=0 trong khi
   * scrollHeight=3910. */
  t('cuộn sau khi hộp đã dựng xong', /requestAnimationFrame\(\(\) => \{[\s\S]{0,200}dkKhoi/.test(app));
  /* Và cuộn vùng cuộn CỦA HỘP: hộp thoại có thanh cuộn riêng. */
  t('cuộn đúng vùng cuộn của hộp', /closest\('\.modal'\)/.test(app));

  /* Khuyến nghị "Chưa đủ dữ liệu" thì đừng mời bấm — chưa có gì để quyết. */
  t('khuyến nghị chưa đủ dữ liệu thì không mời bấm', /r\.actionLevel === 'idle'/.test(app));

  /* Cảnh báo hiệu suất đi thẳng tới nút; cảnh báo Base lệch thì KHÔNG, vì việc
   * của nó nằm ở Base chứ không ở nền tảng. */
  t('cảnh báo hiệu suất có nút Xử lý ngay', /a\.kind === 'perf'/.test(app) && /Xử lý ngay/.test(app));
  t('nhóm cảnh báo mới có tên nói rõ việc nằm ở đâu', /lech: 'Base lệch thực tế'/.test(app));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
