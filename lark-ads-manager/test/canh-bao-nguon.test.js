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
  /* Anh Hùng chốt 18/09/2026: ô "Ngân sách dự kiến" là cho MỖI THÁNG. Nên mốc so
   * là tháng đang chạy, và tiêu đề phải nói đúng chữ "tháng" — bản trước so toàn
   * thời gian, ra 397%/475%, mà với một ô nghĩa là mỗi tháng thì mấy con số đó
   * chẳng nói lên điều gì. */
  t('tiêu đề nói rõ là ngân sách THÁNG', /ngân sách tháng/i.test(v.title || ''), v.title);
  t('chi tiết nói rõ con số lấy từ Base', /Base/.test(v.detail || ''), v.detail);
  t('và nói rõ đây KHÔNG phải giới hạn nền tảng',
    /không phải giới hạn trên nền tảng/i.test(v.detail || ''), v.detail);
  t('nói rõ đang so trong THÁNG nào', /trong tháng \d{2}\/\d{4}/.test(v.detail || ''), v.detail);
}

console.log('— lịch chạy: KHÔNG kết luận gì từ ô trong Base nữa');
{
  /* Anh Hùng, 18/09/2026: "Ngày kết thúc anh nghĩ dựa vào tình trạng thực tế
   * quảng cáo của anh chứ không phải dựa vào cái anh ghi, vì nó không thực tế,
   * không cập nhật theo thời gian thực."
   *
   * Đo đúng vậy: cả hai chiến dịch Facebook đều KHÔNG đặt ngày kết thúc, trong
   * khi Base khai 31/08. Nên app không còn suy ra điều gì từ ô đó — việc đối
   * chiếu lịch chạy chuyển sang hỏi thẳng nền tảng (sync/doichieu.js). */
  const d = duLieu({ end: '2026-08-31' });
  d.campaigns = ['c1', 'c2', 'c3'].map((id, i) => ({
    id, name: 'CD ' + i, platform: 'Facebook', status: 'Đang chạy',
    end: '2026-08-31', start: null, budget: 0, dailyBudget: 0,
  }));
  const a = M.alerts(d, NGUONG);

  t('không còn cảnh báo lịch chạy nào', timKind(a, 'schedule').length === 0);
  t('và không gom thành dòng "quá ngày kết thúc" nữa',
    !a.some((x) => /quá ngày kết thúc/i.test(x.title)), JSON.stringify(a.map((x) => x.title)));
  t('ô "chưa tới ngày bắt đầu" cũng thôi',
    !a.some((x) => /chưa tới ngày bắt đầu/i.test(x.title)));
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
