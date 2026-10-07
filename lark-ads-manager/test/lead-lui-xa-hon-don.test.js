/**
 * Lead phải kéo lùi XA HƠN đơn.
 *
 * Tìm ra 07/10/2026 khi soát vì sao đường POS ghép được 0 đơn, dù bản dò trên
 * máy anh Hùng báo: 48 đơn POS · 29 có ad_id · 48 có mã lead Tourwell (100%).
 * Khoá cứng có đủ, mà vẫn không ra ghi công nào.
 *
 * LÝ DO: keoVeKho() gọi docLead(from, to) và docDon(from, to) với CÙNG một
 * khoảng. Nhưng lead luôn sinh TRƯỚC đơn — khách nhắn tin rồi mới chốt. Nên đơn
 * ở đầu khoảng chắc chắn mất lead của nó: đơn 23/09 mà lead sinh 18/09 thì lead
 * ấy nằm ngoài kho.
 *
 * Mất lead là mất HẲN, không đường nào cứu: cả POS, cả số điện thoại, cả tên
 * khách đều phải đi qua lead mới tới được đơn. Trong roas.js đó là bộ đếm
 * `leadKhongCoTrongXuat` — có sẵn từ lâu nhưng không chỗ nào hiện ra, nên không
 * ai biết đang mất bao nhiêu.
 */
const tw = require('../sync/tourwellapi');
const roas = require('../sync/roas');
const dt = require('../sync/dotin');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

console.log('— lùi ngày');
{
  t('lùi 14 ngày', tw.luiNgay('2026-09-16', 14) === '2026-09-02', tw.luiNgay('2026-09-16', 14));
  t('qua đầu tháng vẫn đúng', tw.luiNgay('2026-03-01', 14) === '2026-02-15');
  t('qua năm vẫn đúng', tw.luiNgay('2026-01-05', 14) === '2025-12-22');
  /* Không đọc được thì trả nguyên — thà giữ khoảng cũ còn hơn kéo nhầm cả năm. */
  t('ngày rác giữ nguyên', tw.luiNgay('hôm qua', 14) === 'hôm qua');
  t('rỗng giữ nguyên', tw.luiNgay('', 14) === '');
  t('lùi 0 giữ nguyên', tw.luiNgay('2026-09-16', 0) === '2026-09-16');
  t('mặc định lùi 14 ngày', tw.LUI_LEAD === 14, String(tw.LUI_LEAD));
}

console.log('— keoVeKho kéo lead sớm hơn đơn');
{
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'sync', 'tourwellapi.js'), 'utf8');
  t('lead dùng ngày đã lùi', /docLead\(conf, tuLead, to,/.test(src));
  /* Đơn KHÔNG nới theo: đơn là thứ đắt, và đơn cũ thì lượt trước đã ghi lên Base. */
  t('đơn vẫn giữ nguyên khoảng', /docDon\(conf, from, to, log\)/.test(src));
  t('có ghi vào nhật ký để đọc lại được', /lead kéo lùi tới/.test(src));
  t('đổi được bằng biến môi trường', /TOURWELL_LUI_LEAD/.test(src));
}

console.log('— đúng ca đã mất ghi công: lead sinh trước khoảng kéo');
{
  const NEN = {
    data: { ads: [{ id: 'r1', extId: '111', name: 'A', platform: 'TikTok' }],
      daily: [{ adId: 'r1', date: '2026-09-25', spend: 1000000, platform: 'TikTok' }] },
    from: '2026-09-16', to: '2026-10-07', cuaSo: 60,
  };
  const lead = { id: 2259, ma: 'LU2259', kh: 'KH-A', ngay: '2026-09-12' };  // TRƯỚC 16/09
  const don = { ma: 'RT1', kh: 'KH-A', ngay: '2026-09-23', tien: 5000000, thu: 5000000 };
  const pos = [{ leadId: 2259, adId: '111' }];

  /* Kho kéo cùng khoảng với đơn: lead 12/09 không lọt vào, mất ghi công. */
  const thieu = roas.tinh({ ...NEN, posRows: pos, leadRows: [], donRows: [don] });
  t('thiếu lead thì không ghi công được', thieu.tong.don === 0, JSON.stringify(thieu.tong));
  t('và đếm vào leadKhongCoTrongXuat', thieu.nhat.leadKhongCoTrongXuat === 1,
    JSON.stringify(thieu.nhat));

  /* Kho đã lùi lead 14 ngày: lead 12/09 lọt vào, ghi công được. */
  const du = roas.tinh({ ...NEN, posRows: pos, leadRows: [lead], donRows: [don] });
  t('có lead thì ghi công được', du.tong.don === 1, JSON.stringify(du.tong));
  t('đúng 5 triệu', du.tong.tien === 5000000);
  t('và đi đường POS', du.ghiCongDon[0].duong === 'POS', JSON.stringify(du.ghiCongDon));
  t('không còn đếm thiếu lead', du.nhat.leadKhongCoTrongXuat === 0);

  /* Đây là cả lý do của bản vá: cùng dữ liệu, chỉ khác khoảng kéo lead. */
  t('chênh lệch do khoảng kéo, không do dữ liệu',
    thieu.tong.tien === 0 && du.tong.tien === 5000000);
}

console.log('— màn hình nói ra chỗ mất này, thay vì im');
{
  const r = dt.danhGia({ kq: { nhat: { leadKhongCoTrongXuat: 17, nhapNhangPOS: 0 } } });
  const m = r.diem.find((x) => x.ten === 'Có khoá cứng nhưng thiếu lead để dùng');
  t('có mục', !!m, JSON.stringify(r.diem.map((x) => x.ten)));
  t('xếp NẶNG', m.nang === true);
  t('nêu đúng số lead hụt', /17 lead/.test(m.chu));
  t('giải thích vì sao hụt', /lead luôn sinh TRƯỚC đơn/i.test(m.chu));
  t('nói rõ mất là mất hẳn', /không đường nào\s*\n?\s*cứu được|mất hẳn/i.test(m.chu), m.chu);
  t('và nói đã sửa rồi', /Đã sửa/.test(m.lamGi));

  /* Không hụt lead thì im — đừng kêu một chuyện không xảy ra. */
  const sach = dt.danhGia({ kq: { nhat: { leadKhongCoTrongXuat: 0, nhapNhangPOS: 0 } } });
  t('không hụt thì không kêu',
    !sach.diem.some((x) => /thiếu lead/.test(x.ten)), JSON.stringify(sach.diem.map((x) => x.ten)));

  /* Nhập nhằng POS là chuyện BÌNH THƯỜNG, phải nói rõ thế — không thì người đọc
   * tưởng app hỏng và đi sửa nhầm chỗ. */
  const nn = dt.danhGia({ kq: { nhat: { leadKhongCoTrongXuat: 0, nhapNhangPOS: 3 } } });
  const k = nn.diem.find((x) => /nhiều quảng cáo cùng lúc/.test(x.ten));
  t('nhập nhằng POS chỉ là mức nhẹ', k && k.nang === false);
  t('và nói rõ không phải lỗi', /không phải lỗi/.test(k.lamGi));
  t('nêu rõ app không chọn bừa', /KHÔNG chọn bừa/.test(k.chu));
}

console.log('— nhật ký lượt chạy phải nói ra chỗ hụt');
{
  /* Đêm 07/10/2026 mất gần hai tiếng chỉ để biết rằng POS không ghép được KHÔNG
   * phải vì chưa tới lượt chạy. Ba lượt liên tiếp ra đúng một con số, mà nhật ký
   * không hé lộ nó hụt ở bước nào — dù roas.js đã đếm sẵn từng lý do. Một bộ đếm
   * không ai đọc thì bằng không có. */
  const s = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'sync', 'ghicongtudong.js'), 'utf8');
  t('có in lý do hụt', /vì sao những đơn khác không ghép được/.test(s));
  t('dịch leadKhongCoTrongXuat sang tiếng người', /lead KHÔNG CÓ trong kho/.test(s));
  t('dịch nhapNhangPOS sang tiếng người', /không chọn bừa/.test(s));
  /* Chỉ in lý do CÓ xảy ra — in cả dòng 0 là làm loãng nhật ký. */
  t('chỉ in lý do khác 0', /filter\(\(\[, v\]\) => v > 0\)/.test(s));
  t('không có lý do nào thì vẫn nói một câu', /mọi khoá đều dùng được/.test(s));
  /* Và in luôn đếm nguồn: thiếu nguồn hay thiếu khoá là hai chuyện khác nhau. */
  t('in cả số liệu nguồn', /nguồn lượt này/.test(s));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
