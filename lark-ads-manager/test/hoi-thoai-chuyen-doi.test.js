/**
 * "Ra doanh thu rồi thì phải biết hội thoại nào đã chuyển đổi đúng không."
 * — anh Hùng, 28/09/2026, khi Tổng quan hiện cạnh nhau:
 *
 *     Doanh thu từ quảng cáo   131.666.724đ · 21 đơn
 *     Chuyển đổi               0
 *
 * Anh đúng. Và lý do app không trả lời được là nó có HAI SỔ không nối nhau:
 *
 *   · Ô doanh thu đọc bảng Sales trên Base, đếm dòng có ô Kênh = Facebook /
 *     TikTok / Google Ads. Đó là ô "nguồn" Tourwell tự khai — không truy về
 *     hội thoại nào, và nó theo bộ lọc ngày ở đầu trang.
 *   · Ô hội thoại đọc roas-cache.json của lượt ghi công gần nhất, đi đường
 *     số điện thoại → lead Tourwell → đơn, và KHÔNG theo bộ lọc đó.
 *
 * Đo trên bản ghi công 02/08–31/08: 905/941 hội thoại (96%) không để lại số
 * điện thoại, nên theo cách tính hiện tại chúng KHÔNG BAO GIỜ vào được nhóm
 * Chuyển đổi — dù khách có mua thật. Bộ test này giữ ba thứ:
 *   1. hội thoại chuyển đổi phải nói ra ĐƠN NÀO, không chỉ nói "có đơn";
 *   2. đơn ghi công phải truy ngược được về hội thoại sinh ra nó;
 *   3. đường POS không đi qua Pancake — chỗ đó phải để trống và đếm riêng,
 *      không được đoán bừa một hội thoại.
 */
const roas = require('../sync/roas');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

/* Dữ liệu dựng tay: một quảng cáo, một khách, một lead, một đơn. */
const data = {
  ads: [
    { id: 'rec1', extId: '111', name: 'QC hội thoại', platform: 'TikTok' },
    { id: 'rec2', extId: '222', name: 'QC POS', platform: 'Facebook' },
  ],
  daily: [
    { adId: 'rec1', date: '2026-09-10', spend: 1000000 },
    { adId: 'rec2', date: '2026-09-10', spend: 1000000 },
  ],
};
const CHUNG = { data, from: '2026-09-01', to: '2026-09-30', cuaSo: 60 };

console.log('— hội thoại ra đơn: phải nói ĐƠN NÀO');
{
  const kq = roas.tinh({
    ...CHUNG,
    hoiThoaiRows: [{ id: 'ht-1', type: 'INBOX', adIds: ['111'], ngay: '2026-09-05',
      sdt: ['0900000001'], coSdt: true, soTinNhan: 12, tenKhach: 'Khách A', platform: 'TikTok' }],
    leadRows: [{ id: 1, ma: 'LU1', sdt: '0900000001', kh: 'KH-A', ngay: '2026-09-05' }],
    donRows: [{ ma: 'RT9001', kh: 'KH-A', ngay: '2026-09-06', tien: 5000000, thu: 4000000 }],
  });
  const h = (kq.hoiThoaiPhanLoai || [])[0] || {};
  t('xếp vào nhóm chuyển đổi', h.nhom === 'chuyen-doi', h.nhom);
  /* Bản trước chỉ ghi "Số điện thoại đã ghép được với đơn hàng" — biết có đơn
   * mà không nói được đơn nào thì vẫn chưa trả lời được câu anh Hùng hỏi. */
  t('kèm mã đơn cụ thể', Array.isArray(h.maDon) && h.maDon.includes('RT9001'), JSON.stringify(h.maDon));
  t('lý do nhắc thẳng mã đơn', /RT9001/.test(h.lyDo || ''), h.lyDo);

  const g = (kq.ghiCongDon || []).find((x) => x.ma === 'RT9001') || {};
  t('đơn truy ngược được về đúng hội thoại', g.hoiThoaiId === 'ht-1', JSON.stringify(g));
  t('và ghi rõ đi đường hội thoại', g.duong === 'hội thoại', g.duong);
}

console.log('— đường POS: KHÔNG đi qua Pancake, phải để trống chứ đừng đoán');
{
  const kq = roas.tinh({
    ...CHUNG,
    posRows: [{ leadId: 2, adId: '222' }],
    hoiThoaiRows: [],
    leadRows: [{ id: 2, ma: 'LU2', sdt: '0900000002', kh: 'KH-B', ngay: '2026-09-05' }],
    donRows: [{ ma: 'RT9002', kh: 'KH-B', ngay: '2026-09-07', tien: 8000000, thu: 6000000 }],
  });
  const g = (kq.ghiCongDon || []).find((x) => x.ma === 'RT9002') || {};
  t('đơn POS vẫn được ghi công', g.duong === 'POS', JSON.stringify(g));
  t('nhưng không gán bừa hội thoại nào', g.hoiThoaiId === '', JSON.stringify(g.hoiThoaiId));

  const C = kq.cauNoi || {};
  t('đếm riêng số đơn đi đường POS', C.donQuaPOS === 1, JSON.stringify(C));
  t('và số đơn truy được về hội thoại là 0', C.donTruyVeHoiThoai === 0, JSON.stringify(C));
}

console.log('— cầu nối: đủ số để giải thích vì sao hai ô lệch nhau');
{
  const kq = roas.tinh({
    ...CHUNG,
    posRows: [{ leadId: 2, adId: '222' }],
    hoiThoaiRows: [
      { id: 'ht-1', type: 'INBOX', adIds: ['111'], ngay: '2026-09-05', sdt: ['0900000001'], coSdt: true },
      /* Hội thoại KHÔNG để lại số — đây là 96% thực tế. */
      { id: 'ht-2', type: 'INBOX', adIds: ['111'], ngay: '2026-09-06', sdt: [], coSdt: false },
      { id: 'ht-3', type: 'INBOX', adIds: ['111'], ngay: '2026-09-07', sdt: [], coSdt: false },
    ],
    leadRows: [
      { id: 1, ma: 'LU1', sdt: '0900000001', kh: 'KH-A', ngay: '2026-09-05' },
      { id: 2, ma: 'LU2', sdt: '0900000002', kh: 'KH-B', ngay: '2026-09-05' },
    ],
    donRows: [
      { ma: 'RT9001', kh: 'KH-A', ngay: '2026-09-06', tien: 5000000, thu: 4000000 },
      { ma: 'RT9002', kh: 'KH-B', ngay: '2026-09-07', tien: 8000000, thu: 6000000 },
    ],
  });
  const C = kq.cauNoi || {};
  t('tổng đơn ghi công', C.donGhiCong === 2, JSON.stringify(C));
  t('tách được hai đường', C.donQuaHoiThoai === 1 && C.donQuaPOS === 1, JSON.stringify(C));
  t('đếm hội thoại không có số điện thoại', C.hoiThoaiKhongSdt === 2, JSON.stringify(C));
  t('đếm hội thoại có số điện thoại', C.hoiThoaiCoSdt === 1, JSON.stringify(C));
  /* Đây là chỗ mấu chốt: 2 đơn ghi công nhưng chỉ 1 hội thoại chuyển đổi.
   * Chênh lệch đó là THẬT, không phải lỗi — và app phải nói được ra nó. */
  const soChuyenDoi = (kq.hoiThoaiPhanLoai || []).filter((h) => h.nhom === 'chuyen-doi').length;
  t('2 đơn ghi công mà chỉ 1 hội thoại chuyển đổi — và giải thích được',
    soChuyenDoi === 1 && C.donGhiCong - C.donTruyVeHoiThoai === 1,
    `${soChuyenDoi} · ${JSON.stringify(C)}`);
}

console.log('— giao diện: phải nói ra hai chỗ trước đây im lặng');
{
  const fs = require('fs');
  const path = require('path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  /* Ô doanh thu đếm theo cột Kênh của Tourwell, không phải ghi công. Gọi nó là
   * "đơn ghi công được" là nói app biết thứ nó không biết. */
  t('bỏ chữ "đơn ghi công được" ở ô doanh thu', !/đơn ghi công được/.test(app));
  t('nói đúng nguồn của con số đó', /Tourwell ghi nguồn là/.test(app));

  /* Khối hội thoại đọc lượt ghi công gần nhất, không theo bộ lọc đầu trang. */
  t('nói rõ khối hội thoại không theo bộ lọc', /không theo bộ lọc ở đầu trang/.test(app));
  t('in ra khoảng ngày của lượt ghi công', /kyChay/.test(app));
  t('có khối giải thích vì sao hai ô lệch nhau', /không khớp ô doanh thu phía trên/.test(app));
  t('danh sách hội thoại hiện mã đơn', /label: 'Đơn ghép được'/.test(app));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
