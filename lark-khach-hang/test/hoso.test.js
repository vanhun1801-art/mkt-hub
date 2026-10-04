'use strict';
/**
 * ============================================================================
 * GỘP HỒ SƠ KHÁCH — những chỗ sai sẽ làm MỌI con số phía sau sai theo
 * ============================================================================
 * Hồ sơ khách là nền của tra cứu, remarketing, báo cáo nguồn và bản đồ. Gộp
 * sai một chỗ ở đây thì không màn hình nào đúng được, mà lại không có gì báo
 * đỏ — số vẫn hiện ra, chỉ là sai.
 *
 * Ba chỗ dễ sai nhất, và cả ba đều đã có thật:
 *
 *   1. Số Việt Nam có HAI cách viết cho cùng một người (0912… và 84912…).
 *      Không gom về một dạng là cùng một khách thành hai hồ sơ — đúng cái
 *      "gộp trùng" mà anh Hùng xin.
 *   2. Đơn của khách không nằm trong danh sách khách. Bỏ đi thì doanh thu hụt
 *      mà không ai biết vì sao.
 *   3. Người không có số (97% hội thoại TikTok). Vứt đi thì con số "bao nhiêu
 *      người từng hỏi" sai hẳn; trộn vào như khách đủ thì mọi phép đếm nói
 *      dối. Phải giữ VÀ đánh dấu.
 */
const h = require('../hoso');
const { chuanSdt } = require('../nguon/tourwell');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

console.log('\ngộp hồ sơ khách');

/* ---- 1. số điện thoại về một dạng ---- */
ok('0912… và 84912… ra cùng một số', chuanSdt('0912345678', '84') === chuanSdt('84912345678', ''),
  chuanSdt('0912345678', '84') + ' vs ' + chuanSdt('84912345678', ''));
ok('bỏ khoảng trắng, dấu chấm, dấu gạch', chuanSdt('091 234.56-78', '84') === '84912345678',
  chuanSdt('091 234.56-78', '84'));
ok('số có +84 cũng về cùng dạng', chuanSdt('+84912345678', '') === '84912345678');
ok('mã vùng nước khác được giữ', chuanSdt('5551234', '1') === '15551234', chuanSdt('5551234', '1'));
ok('số rỗng trả rỗng, không bịa', chuanSdt('', '84') === '');

/* ---- 2. gộp hai cách viết thành MỘT hồ sơ ---- */
{
  const ds = h.dung({
    khach: [{ ma: 'KH1', ten: 'Nguyễn A', sdt: chuanSdt('0912345678', '84') }],
    don: [],
    them: [{ sdt: chuanSdt('84912345678', ''), ten: 'Nguyen A', kenh: 'Facebook' }],
  });
  ok('một người hai cách viết số → MỘT hồ sơ', ds.length === 1, ds.length + ' hồ sơ');
  ok('  và hồ sơ đó ghi nhận cả hai kênh',
    ds[0] && ds[0].kenh.includes('Tourwell') && ds[0].kenh.includes('Facebook'),
    JSON.stringify(ds[0] && ds[0].kenh));
}

/* ---- 3. đơn mồ côi: khách không có trong danh sách ---- */
{
  const ds = h.dung({
    khach: [],
    don: [{ ma: 'DH9', khachMa: 'KH-LA', khachTen: 'Khách lạ', tien: 5000000, luc: '2026-05-01T00:00:00Z', dichVu: [] }],
  });
  ok('đơn của khách không có trong danh sách vẫn được giữ', ds.length === 1);
  ok('  và doanh thu không bị hụt', ds[0] && ds[0].doanhThu === 5000000, ds[0] && ds[0].doanhThu);
}

/* ---- 4. mức đầy đủ ---- */
{
  const ds = h.dung({
    khach: [
      { ma: 'A', ten: 'Có số có đơn', sdt: '84900000001' },
      { ma: 'B', ten: 'Có số chưa mua', sdt: '84900000002' },
    ],
    don: [{ ma: 'D1', khachMa: 'A', tien: 100, luc: '2026-01-01T00:00:00Z', dichVu: [] }],
    them: [{ ten: 'Chỉ biết tên', kenh: 'TikTok' }],
  });
  const m = Object.fromEntries(ds.map((o) => [o.ten, o.muc]));
  ok('có số + có đơn → "đủ"', m['Có số có đơn'] === h.MUC.DU, m['Có số có đơn']);
  ok('có số, chưa mua → "có số"', m['Có số chưa mua'] === h.MUC.CO_SO, m['Có số chưa mua']);
  ok('không có số → "chỉ tên"', m['Chỉ biết tên'] === h.MUC.CHI_TEN, m['Chỉ biết tên']);
  const x = ds.find((o) => o.ten === 'Chỉ biết tên');
  ok('  người không số vẫn được GIỮ, không bị vứt', !!x);
  ok('  và nói rõ thiếu gì', x && x.thieu.includes('số điện thoại'), JSON.stringify(x && x.thieu));
}

/* ---- 5. hai người KHÔNG có số, khác tên → KHÔNG được gộp làm một ---- */
{
  const ds = h.dung({ khach: [], don: [], them: [
    { ten: 'Người Một', kenh: 'TikTok' },
    { ten: 'Người Hai', kenh: 'TikTok' },
  ] });
  ok('hai người không số khác tên vẫn là hai hồ sơ', ds.length === 2, ds.length + '');
}

/* ---- 6. nhu cầu: tour, mùa đi ---- */
{
  const ds = h.dung({
    khach: [{ ma: 'A', ten: 'K', sdt: '84900000003' }],
    don: [
      { ma: 'D1', khachMa: 'A', tien: 10, luc: '2026-03-01T00:00:00Z',
        dichVu: [{ ten: 'Tour Hòn Thơm', di: '2026-07-15', don: 'Dương Đông' }] },
      { ma: 'D2', khachMa: 'A', tien: 20, luc: '2026-04-01T00:00:00Z',
        dichVu: [{ ten: 'Tour Hòn Thơm', di: '2026-07-20', don: 'Dương Đông' }] },
    ],
  });
  const o = ds[0];
  ok('đếm đúng tour hay mua', o.nhuCau.tour[0] && o.nhuCau.tour[0].ten === 'Tour Hòn Thơm' && o.nhuCau.tour[0].so === 2,
    JSON.stringify(o.nhuCau.tour));
  ok('mùa đi lấy theo NGÀY KHỞI HÀNH, không phải ngày đặt',
    o.nhuCau.thang[7] === 2 && !o.nhuCau.thang[3], JSON.stringify(o.nhuCau.thang));
  ok('đơn xếp theo thời gian để dựng hành trình', o.don[0].ma === 'D1' && o.don[1].ma === 'D2');
  ok('cộng đúng doanh thu', o.doanhThu === 30, o.doanhThu);
}

/* ---- 7. tổng quan ---- */
{
  const ds = h.dung({
    khach: [
      { ma: 'A', ten: 'a', sdt: '84900000011', nuoc: 'Việt Nam' },
      { ma: 'B', ten: 'b', sdt: '84900000012', nuoc: '' },
    ],
    don: [{ ma: 'D', khachMa: 'A', tien: 7, luc: '2026-01-01T00:00:00Z', nguon: 'Facebook', dichVu: [] }],
    them: [{ ten: 'c', kenh: 'TikTok' }],
  });
  const t = h.tongQuan(ds);
  ok('đếm đúng tổng hồ sơ', t.tong === 3, t.tong);
  ok('đếm đúng số có số điện thoại', t.coSdt === 2, t.coSdt);
  ok('đếm đúng số biết quốc gia', t.coNuoc === 1, t.coNuoc);
  ok('đếm đúng số đã mua', t.coDon === 1, t.coDon);
  ok('nguồn ra đơn đếm theo ĐƠN, không theo người', t.nguon.Facebook === 1, JSON.stringify(t.nguon));
  /* Con số quan trọng nhất của bản đồ: phần KHÔNG biết quốc gia. Giấu nó đi là
   * nhìn bản đồ tưởng công ty chỉ có ngần ấy khách. */
  ok('biết được phần chưa rõ quốc gia', t.tong - t.coNuoc === 2, (t.tong - t.coNuoc) + '');
}

/* ---- 8. hai lỗi bắt được khi chạy trên ĐỦ 16.578 hồ sơ (04/10/2026) ----
 *
 * Cả hai đều không ném lỗi, chỉ làm ra số sai trông rất thật:
 *   · service_info / item_info là OBJECT. Ép sang chữ ra "[object Object]",
 *     mà vì cái nào cũng ra chuỗi giống hệt nhau nên bảng "tour bán chạy" hiện
 *     đúng MỘT dòng "[object Object] = 29.256" — nhìn như một con số thật.
 *   · departure_date là "20/10/2026" (ngày/tháng/năm). Cắt ký tự 5–7 kiểu ISO
 *     ra "10/2" nên biểu đồ mùa đi RỖNG. May là rỗng hẳn chứ không lệch; lệch
 *     thì không ai nhìn ra.
 */
{
  const tw = require('../nguon/tourwell');
  const d = tw.doiDon({
    code: 'DH1', customer: { code: 'K1', name: 'A' },
    services: [{
      service_info: { id: 6, name: 'Vé tham quan', code: 'ticket' },
      item_info: { name: 'Vé tham quan', description: '*VÉ DINNER SHOW' },
      departure_date: '20/10/2026', return_date: '20/10/2026',
    }],
  });
  const s0 = d.dichVu[0];
  ok('tên dịch vụ không ra "[object Object]"', s0.ten.indexOf('[object') === -1, s0.ten);
  ok('lấy đúng món cụ thể, không phải tên loại', s0.ten === '*VÉ DINNER SHOW', s0.ten);
  ok('giữ riêng LOẠI dịch vụ', s0.loai === 'Vé tham quan', s0.loai);
  ok('ngày 20/10/2026 đọc thành 20 tháng 10, không phải 10 tháng 20',
    s0.di === '2026-10-20', s0.di);

  const ds8 = h.dung({
    khach: [{ ma: 'K1', ten: 'A', sdt: '84900000099' }],
    don: [Object.assign({}, d, { khachMa: 'K1', tien: 1, luc: '2026-01-01T00:00:00Z' })],
  });
  const t8 = h.tongQuan(ds8);
  ok('mùa đi đếm được (không còn rỗng)', t8.thang[10] === 1, JSON.stringify(t8.thang));
  ok('thống kê có chiều LOẠI dịch vụ', t8.loai['Vé tham quan'] === 1, JSON.stringify(t8.loai));
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
process.exit(fail ? 1 : 0);
