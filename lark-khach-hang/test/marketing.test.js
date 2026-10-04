'use strict';
/**
 * ============================================================================
 * SỐ LIỆU MARKETING — nơi một phép lọc sai làm sai TOÀN BỘ con số tiền
 * ============================================================================
 * Anh Hùng 04/10/2026: "tổng quan cần thông tin hữu ích hơn cho Marketing".
 *
 * Những con số này được dùng để quyết định tiêu tiền quảng cáo, nên sai ở đây
 * đắt hơn sai ở chỗ khác. Ba chỗ dễ sai nhất, cả ba đều đã gặp thật:
 *
 *   1. ĐƠN HUỶ. Tourwell để trạng thái ở hai ô (status_code 2, status "Đã
 *      hủy", và cancel_at). Dữ liệu kéo về từ nhiều đợt nên đợt cũ thiếu ô
 *      `daHuy` — chỉ cần tin vào đúng một ô là 27/500 đơn huỷ lọt vào doanh
 *      thu, im lặng, mà con số vẫn trông hợp lý.
 *   2. ĐẶT TRƯỚC. Vài đơn đặt trước cả năm đủ kéo trung bình lệch hẳn, nên
 *      phải có TRUNG VỊ. Và đơn ghi bù (đặt SAU ngày đi) cho số âm — giữ lại
 *      là kéo con số xuống bằng thứ không phải hành vi đặt.
 *   3. KÊNH. Xếp theo số đơn thì một kênh nhiều đơn nhỏ luôn đứng trên một
 *      kênh ít đơn lớn — đúng ngược với cái marketing cần biết.
 */
const m = require('../marketing');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

const NGAY = 86400000;
const BAY_GIO = Date.parse('2026-10-04T00:00:00Z');
const luc = (songay) => new Date(BAY_GIO + songay * NGAY).toISOString();
const dich = (ten, di) => ({ ten, loai: ten, di });
const don = (o) => Object.assign({ ma: 'D', tien: 0, luc: luc(-1), dichVu: [] }, o);
const khach = (khoa, dons) => ({ khoa, ten: khoa, sdt: khoa, don: dons, nuoc: '', muc: 'đủ' });

console.log('\nsố liệu cho Marketing');

/* ---- 1. đơn huỷ: nhận ra bằng BẤT KỲ dấu hiệu nào ---- */
{
  for (const [nhan, d] of [
    ['cờ daHuy', don({ tien: 100, daHuy: true })],
    ['mã trạng thái số 2', don({ tien: 100, maTT: 2 })],
    ['mã trạng thái chuỗi "2"', don({ tien: 100, trangThai: '2' })],
    ['chữ "Đã hủy"', don({ tien: 100, trangThai: 'Đã hủy' })],
    ['có mốc huỷ', don({ tien: 100, huyLuc: '2026-10-03T09:24:11+07:00' })],
  ]) ok('nhận ra đơn huỷ qua ' + nhan, m.laHuy(d) === true);
  ok('đơn thành công KHÔNG bị coi là huỷ',
    m.laHuy(don({ tien: 100, maTT: 1, trangThai: 'Thành công' })) === false);
  ok('đơn đang xử lý KHÔNG bị coi là huỷ',
    m.laHuy(don({ tien: 100, maTT: 0, trangThai: 'Đang xử lý' })) === false);

  const r = m.soLieu([khach('A', [
    don({ tien: 1000, maTT: 1 }),
    don({ tien: 9999, maTT: 2 }),        // huỷ — không được tính
  ])], BAY_GIO);
  ok('doanh thu KHÔNG cộng đơn huỷ', r.doanhThu === 1000, r.doanhThu);
  ok('đếm được số đơn huỷ đã loại', r.donHuy === 1, r.donHuy);
  ok('số đơn cũng không tính đơn huỷ', r.soDon === 1, r.soDon);
  /* Và người chỉ có đúng một đơn huỷ thì KHÔNG phải "khách đã mua". */
  const r2 = m.soLieu([khach('B', [don({ tien: 500, maTT: 2 })])], BAY_GIO);
  ok('người chỉ có đơn huỷ không tính là đã mua', r2.khachMua === 0, r2.khachMua);
}

/* ---- 2. khách quay lại ---- */
{
  const r = m.soLieu([
    khach('A', [don({ tien: 100 }), don({ tien: 200 })]),   // quay lại
    khach('B', [don({ tien: 50 })]),                         // mua một lần
    khach('C', []),                                          // chưa mua
  ], BAY_GIO);
  ok('đếm đúng khách đã mua', r.khachMua === 2, r.khachMua);
  ok('đếm đúng khách quay lại (từ 2 đơn)', r.khachQuayLai === 1, r.khachQuayLai);
  ok('tách đúng doanh thu khách quay lại', r.doanhThuQuayLai === 300, r.doanhThuQuayLai);
  ok('tách đúng doanh thu khách mới', r.doanhThuKhachMoi === 50, r.doanhThuKhachMoi);
  /* Hai đơn mà MỘT bị huỷ thì chỉ còn một đơn — không phải khách quay lại. */
  const r2 = m.soLieu([khach('A', [don({ tien: 100 }), don({ tien: 200, maTT: 2 })])], BAY_GIO);
  ok('đơn huỷ không biến khách một lần thành khách quay lại', r2.khachQuayLai === 0, r2.khachQuayLai);
}

/* ---- 3. đặt trước ---- */
{
  const d = (cach) => don({ tien: 10, luc: luc(-100), dichVu: [dich('T', new Date(BAY_GIO + (cach - 100) * NGAY).toISOString().slice(0, 10))] });
  const r = m.soLieu([khach('A', [d(1), d(2), d(3), d(4), d(300)])], BAY_GIO);
  ok('trung vị KHÔNG bị vài đơn đặt xa kéo lệch', r.datTruocGiua === 3, r.datTruocGiua);
  ok('trung bình thì bị kéo lên (nên mới cần trung vị)', r.datTruocTB > r.datTruocGiua,
    'TB=' + r.datTruocTB + ' giữa=' + r.datTruocGiua);
  ok('xếp đúng bậc "Trong 3 ngày"', r.datTruoc['Trong 3 ngày'] === 3, JSON.stringify(r.datTruoc));

  /* Đơn ghi bù: đặt SAU ngày đi → số âm, phải bỏ. */
  const am = don({ tien: 10, luc: luc(0), dichVu: [dich('T', new Date(BAY_GIO - 30 * NGAY).toISOString().slice(0, 10))] });
  const r2 = m.soLieu([khach('A', [am])], BAY_GIO);
  ok('đơn ghi bù (đặt sau ngày đi) không kéo con số xuống', r2.datTruocGiua === null, r2.datTruocGiua);
}

/* ---- 4. sắp khởi hành ---- */
{
  const di = (cach) => don({ tien: 10, dichVu: [dich('T', new Date(BAY_GIO + cach * NGAY).toISOString().slice(0, 10))] });
  const r = m.soLieu([khach('A', [di(3), di(20), di(60), di(-5)])], BAY_GIO);
  ok('đếm đúng khách đi trong 7 ngày', r.sapDi7 === 1, r.sapDi7);
  ok('đếm đúng khách đi trong 30 ngày', r.sapDi30 === 2, r.sapDi30);
  ok('chuyến ĐÃ ĐI không tính vào sắp đi', !Object.keys(r.thangDi).some((k) => k < '2026-10'),
    JSON.stringify(r.thangDi));
}

/* ---- 5. kênh: tiền, không phải số đơn ---- */
{
  const r = m.soLieu([
    khach('A', [don({ tien: 1000000, nguon: 'TikTok' })]),
    khach('B', [don({ tien: 100000, nguon: 'Lữ hành' }), don({ tien: 100000, nguon: 'Lữ hành' }),
      don({ tien: 100000, nguon: 'Lữ hành' })]),
  ], BAY_GIO);
  const xep = Object.entries(r.kenh).sort((a, b) => b[1].tien - a[1].tien).map((x) => x[0]);
  ok('kênh ít đơn nhưng nhiều tiền xếp trên', xep[0] === 'TikTok', xep.join(','));
  ok('tính đúng trung bình mỗi đơn', r.kenh['TikTok'].tbMoiDon === 1000000
    && r.kenh['Lữ hành'].tbMoiDon === 100000,
    JSON.stringify({ tt: r.kenh['TikTok'].tbMoiDon, lh: r.kenh['Lữ hành'].tbMoiDon }));
  ok('đếm được số KHÁCH riêng của kênh, không chỉ số đơn',
    r.kenh['Lữ hành'].khach === 1 && r.kenh['Lữ hành'].don === 3,
    JSON.stringify(r.kenh['Lữ hành']));
  ok('đơn không ghi nguồn vẫn được gom, không biến mất',
    m.soLieu([khach('C', [don({ tien: 5 })])], BAY_GIO).kenh['(không ghi nguồn)'].don === 1);
}

/* ---- 6. remarketing: ai im lặng bao lâu ---- */
{
  const r = m.soLieu([
    khach('A', [don({ tien: 100, luc: luc(-200) })]),   // 6–12 tháng
    khach('B', [don({ tien: 200, luc: luc(-400) })]),   // hơn 12 tháng
    khach('C', [don({ tien: 300, luc: luc(-10) })]),    // mới mua
  ], BAY_GIO);
  ok('đếm đúng khách im lặng hơn 6 tháng', r.nguMe['6 tháng'].so === 1, JSON.stringify(r.nguMe));
  ok('đếm đúng khách im lặng hơn 12 tháng', r.nguMe['12 tháng'].so === 1);
  ok('mỗi khách chỉ nằm MỘT nhóm, không đếm hai lần',
    r.nguMe['6 tháng'].so + r.nguMe['12 tháng'].so === 2);
  ok('kèm doanh thu cũ để biết nhóm đó đáng bao nhiêu',
    r.nguMe['12 tháng'].tien === 200, r.nguMe['12 tháng'].tien);
}

/* ---- 7. không có dữ liệu thì không được vỡ ---- */
{
  const r = m.soLieu([], BAY_GIO);
  ok('danh sách rỗng không làm vỡ', r.doanhThu === 0 && r.giaTriTB === 0 && r.datTruocGiua === null);
  const r2 = m.soLieu([khach('A', [])], BAY_GIO);
  ok('khách chưa mua không làm lệch tỉ lệ quay lại', r2.tyLeQuayLai === 0, r2.tyLeQuayLai);
}

/* ---- 8. bộ lọc kỳ ----
 * Anh Hùng 04/10/2026: "có nên theo bộ lọc như các ứng dụng khác không".
 *
 * Có — nhưng app này khác các app kia ở chỗ có HAI loại ngày, và cùng một
 * khoảng ngày ra hai con số khác hẳn. Đo thật trên tháng 10: theo ngày đặt
 * được 1,2 tỷ và TikTok đứng đầu; theo ngày khởi hành được 763 tr và Lữ hành
 * đứng đầu. Chọn nhầm mốc là ra kết luận ngược.
 *
 * Và ba con số CỐ Ý không theo bộ lọc. Canh kỹ, vì lỗi ở đây rất khó thấy: nó
 * chỉ làm con số nhỏ đi chứ không làm vỡ gì.
 */
{
  const dd = (ngayDat, ngayDiChuoi, tienSo) => don({
    tien: tienSo, luc: ngayDat + 'T00:00:00+07:00', dichVu: [dich('T', ngayDiChuoi)],
  });
  /* Đặt tháng 9, đi tháng 11 — rơi vào kỳ nào là tuỳ mốc tính. */
  const ds = [khach('A', [dd('2026-09-15', '2026-11-20', 100)])];
  const dat9 = m.soLieu(ds, { tu: '2026-09-01', den: '2026-09-30', bayGio: BAY_GIO });
  const di9 = m.soLieu(ds, { tu: '2026-09-01', den: '2026-09-30', theo: 'di', bayGio: BAY_GIO });
  const di11 = m.soLieu(ds, { tu: '2026-11-01', den: '2026-11-30', theo: 'di', bayGio: BAY_GIO });
  ok('tháng 9 theo NGÀY ĐẶT: có đơn', dat9.soDon === 1, dat9.soDon);
  ok('tháng 9 theo NGÀY ĐI: không có đơn', di9.soDon === 0, di9.soDon);
  ok('tháng 11 theo NGÀY ĐI: có đơn', di11.soDon === 1, di11.soDon);
  ok('kỳ được ghi lại để màn hình nói đúng đang xem gì',
    di11.ky.theo === 'di' && di11.ky.tu === '2026-11-01', JSON.stringify(di11.ky));
  ok('không khai kỳ = toàn bộ, không ngầm cắt mất gì',
    m.soLieu(ds, { bayGio: BAY_GIO }).soDon === 1);

  /* Ba con số không theo bộ lọc. */
  const sapDi = (cach) => don({
    tien: 10, luc: luc(-500),
    dichVu: [dich('T', new Date(BAY_GIO + cach * NGAY).toISOString().slice(0, 10))],
  });
  const ds2 = [khach('A', [sapDi(5)]), khach('B', [don({ tien: 20, luc: luc(-1) })])];
  const het = m.soLieu(ds2, { bayGio: BAY_GIO });
  const hep = m.soLieu(ds2, { tu: '2026-10-04', den: '2026-10-04', bayGio: BAY_GIO });
  ok('"sắp khởi hành" KHÔNG đổi khi bật bộ lọc',
    het.sapDi7 === 1 && hep.sapDi7 === 1, het.sapDi7 + ' vs ' + hep.sapDi7);
  ok('  kể cả khi chủ đơn đó không có đơn nào trong kỳ', hep.sapDi30 === 1, hep.sapDi30);

  const ds3 = [khach('A', [don({ tien: 100, luc: luc(-400) })])];
  const h3 = m.soLieu(ds3, { tu: '2026-10-01', den: '2026-10-31', bayGio: BAY_GIO });
  ok('"khách im lặng" KHÔNG đổi khi bật bộ lọc', h3.nguMe['12 tháng'].so === 1, JSON.stringify(h3.nguMe));

  /* Quay lại xét TRỌN ĐỜI: mua tháng 1 và tháng 10 thì vẫn là khách quay lại,
   * dù lọc về tháng 10 chỉ nhìn thấy một đơn. */
  const ds4 = [khach('A', [
    don({ tien: 100, luc: '2026-01-10T00:00:00+07:00' }),
    don({ tien: 200, luc: '2026-10-02T00:00:00+07:00' }),
  ])];
  const h4 = m.soLieu(ds4, { tu: '2026-10-01', den: '2026-10-31', bayGio: BAY_GIO });
  ok('mua tháng 1 và tháng 10 vẫn là khách QUAY LẠI khi lọc tháng 10',
    h4.khachQuayLai === 1, h4.khachQuayLai);
  ok('  nhưng doanh thu chỉ tính phần trong kỳ', h4.doanhThu === 200, h4.doanhThu);

  const ds5 = [khach('A', [
    don({ tien: 50, maTT: 2, luc: '2026-01-05T00:00:00+07:00' }),
    don({ tien: 60, maTT: 2, luc: '2026-10-02T00:00:00+07:00' }),
    don({ tien: 70, luc: '2026-10-03T00:00:00+07:00' }),
  ])];
  const h5 = m.soLieu(ds5, { tu: '2026-10-01', den: '2026-10-31', bayGio: BAY_GIO });
  ok('chỉ đếm đơn huỷ TRONG KỲ, không đếm cả lịch sử', h5.donHuy === 1, h5.donHuy);
}

/* ---- 9. đơn chi phí nội bộ ----
 * Kế toán dùng đơn Tourwell để ghi chi phí công ty, và chúng lọt vào bảng
 * "sản phẩm bán chạy" đứng chung với tour. Anh Hùng 04/10/2026: "bỏ đơn chi
 * phí nội bộ".
 *
 * Phải đủ CẢ BA điều kiện. Đo trên 1.000 đơn: tiền=0 một mình bắt 233 đơn
 * (phần lớn là đơn thật chưa chốt giá); thêm loại "Dịch vụ khác" còn 145;
 * thêm nội dung mới đúng 26. Lọc theo TÀI KHOẢN thì sai hẳn — cả ba tài khoản
 * ghi chi phí đều có đơn thật (11, 25 và 1 đơn).
 */
{
  const noiBo = (ten, tienSo) => don({
    tien: tienSo, dichVu: [{ loai: 'Dịch vụ khác', ten, di: '' }],
  });
  ok('bắt được tạm ứng lương', m.laChiPhiNoiBo(noiBo('Tạm ứng lương tháng 09 - Nguyễn Văn Tèo', 0)));
  ok('bắt được chi phí tiền điện', m.laChiPhiNoiBo(noiBo('THANH TOÁN CHI PHÍ TIỀN ĐIỆN THÁNG 9', 0)));
  ok('bắt được bảo hiểm xã hội', m.laChiPhiNoiBo(noiBo('BẢO HIỂM XÃ HỘI THÁNG 08.2026', 0)));
  ok('bắt được xăng dầu', m.laChiPhiNoiBo(noiBo('MUA DẦU 618', 0)));

  /* Quan trọng hơn: KHÔNG được bắt nhầm đơn thật. */
  ok('đơn CÓ TIỀN không bao giờ bị coi là chi phí nội bộ',
    m.laChiPhiNoiBo(noiBo('Tạm ứng lương tháng 09', 5000000)) === false);
  ok('tour thật tiền 0 không bị loại',
    m.laChiPhiNoiBo(don({ tien: 0, dichVu: [{ loai: 'Tour ghép lẻ', ten: 'Tour 4 đảo', di: '' }] })) === false);
  ok('dịch vụ khác tiền 0 nhưng không phải khoản chi thì giữ',
    m.laChiPhiNoiBo(noiBo('Vé tham quan Hòn Thơm', 0)) === false);
  ok('đơn không có dịch vụ nào thì không bị loại',
    m.laChiPhiNoiBo(don({ tien: 0, dichVu: [] })) === false);
  ok('đơn có cả dịch vụ thật lẫn dòng chi phí thì GIỮ',
    m.laChiPhiNoiBo(don({ tien: 0, dichVu: [
      { loai: 'Tour ghép lẻ', ten: 'Tour 4 đảo', di: '' },
      { loai: 'Dịch vụ khác', ten: 'Tạm ứng lương', di: '' },
    ] })) === false);

  const r9 = m.soLieu([khach('A', [
    noiBo('Tạm ứng lương tháng 09', 0),
    don({ tien: 5000000 }),
  ])], { bayGio: BAY_GIO });
  ok('đơn nội bộ không tính vào số đơn', r9.soDon === 1, r9.soDon);
  ok('và được ĐẾM RIÊNG để còn soi, không loại âm thầm', r9.donNoiBo === 1, r9.donNoiBo);
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
process.exit(fail ? 1 : 0);
