'use strict';
/**
 * ============================================================================
 * Đọc ô Base — mấy cái bẫy đã sập ngay lần chạy thật đầu tiên
 * ============================================================================
 * Không chạm mạng: gọi thẳng các hàm thuần của kho.js với đúng hình dạng dữ
 * liệu mà Base trả về.
 *
 * Chạy: node test/kho.test.js
 */
const kho = require('../kho');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (vi ? ' — ' + vi : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

/* ------------------------------------------------------------------ */
group('so(): ô trống là CHƯA CÓ, không phải số 0');
{
  /* Đây là lỗi đã sập thật: cột công thức "Còn lại (ngày)" trả chuỗi rỗng cho
   * dòng chưa đặt hạn, `Number('')` ra 0, và 0 ngày nghĩa là "hết hạn hôm nay"
   * ⇒ cả 50 sản phẩm không có hạn nhảy lên đầu danh sách cảnh báo. */
  ok('chuỗi rỗng -> null', kho.so('') === null);
  ok('null -> null', kho.so(null) === null);
  ok('undefined -> null', kho.so(undefined) === null);
  ok('mảng rỗng -> null', kho.so([]) === null);
  ok('số 0 vẫn là 0, không thành null', kho.so(0) === 0);
  ok('chuỗi "0" vẫn là 0', kho.so('0') === 0);
  ok('số thường', kho.so(800000) === 800000);
  ok('NaN -> null', kho.so(NaN) === null);
  /* CỐ Ý không hiểu "1.550.000".
   *
   * Cột số của Base luôn về đây là number thật, nên chuỗi có dấu phân cách chỉ
   * xuất hiện khi ai đó khai nhầm kiểu cột. Lúc đó dấu `.` vừa có thể là phân
   * cách nghìn kiểu Việt (1.550.000 = một triệu rưỡi), vừa có thể là dấu thập
   * phân (12.5). Đoán sai là in một cái GIÁ SAI lên bài đăng — tệ hơn nhiều so
   * với để trống và bị cột "Thiếu thông tin" réo. */
  ok('chuỗi có dấu phân cách -> null chứ không đoán bừa', kho.so('1.550.000') === null);
  ok('số thập phân thật vẫn đọc được', kho.so('12.5') === 12.5);
}

/* ------------------------------------------------------------------ */
group('chu(): text của Base khi là chuỗi, khi là mảng đoạn');
{
  ok('chuỗi thường', kho.chu('  Tour cano  ') === 'Tour cano');
  ok('mảng đoạn giàu định dạng',
    kho.chu([{ text: 'Tour ' }, { text: 'cano' }]) === 'Tour cano');
  ok('mảng lẫn chuỗi trần', kho.chu(['A', { text: 'B' }]) === 'AB');
  ok('null -> chuỗi rỗng', kho.chu(null) === '');
}

/* ------------------------------------------------------------------ */
group('linkSach(): ô kiểu url hay về dạng markdown');
{
  const u = 'https://drive.google.com/file/d/abc/view';
  ok('dạng [nhãn](url) -> lấy url', kho.linkSach('[' + u + '](' + u + ')') === u);
  ok('nhãn khác url vẫn lấy đúng url', kho.linkSach('[Ảnh VI](' + u + ')') === u);
  ok('url trần giữ nguyên', kho.linkSach(u) === u);
  /* Ô "Ảnh lịch trình" của mấy dòng cũ chứa GHI CHÚ chứ không phải link
   * ("Không thường xuyên bán, ít đẩy truyền thông"). Trả về chuỗi rỗng để giao
   * diện không dựng một thẻ <a href="Không thường xuyên bán..."> bấm vào lỗi. */
  ok('chữ thường không phải link -> rỗng',
    kho.linkSach('Không thường xuyên bán, ít đẩy truyền thông') === '');
  ok('rỗng -> rỗng', kho.linkSach(null) === '');
}

/* ------------------------------------------------------------------ */
group('nhieu()/mot(): select đơn cũng về dạng mảng');
{
  ok('select đơn', kho.mot(['Đang kinh doanh']) === 'Đang kinh doanh');
  ok('select đơn dạng chuỗi', kho.mot('Đang kinh doanh') === 'Đang kinh doanh');
  ok('select nhiều', kho.nhieu(['A', 'B']).join('|') === 'A|B');
  ok('trống -> mảng rỗng', kho.nhieu(null).length === 0);
  ok('chuỗi rỗng -> mảng rỗng', kho.nhieu('').length === 0);
}

/* ------------------------------------------------------------------ */
group('idLink(): ô liên kết chỉ lấy record_id');
{
  ok('dạng {id}', kho.idLink([{ id: 'recA' }, { id: 'recB' }]).join() === 'recA,recB');
  ok('dạng {record_id}', kho.idLink([{ record_id: 'recC' }]).join() === 'recC');
  ok('trống -> rỗng', kho.idLink(null).length === 0);
}

/* ------------------------------------------------------------------ */
group('ms(): datetime khi là epoch, khi là chuỗi ISO');
{
  ok('epoch giữ nguyên', kho.ms(1790000000000) === 1790000000000);
  ok('chuỗi ISO', kho.ms('2026-09-30T00:00:00+07:00') === Date.parse('2026-09-30T00:00:00+07:00'));
  ok('trống -> 0', kho.ms('') === 0 && kho.ms(null) === 0);
}

/* ------------------------------------------------------------------ */
group('Lát cắt: sắp hết hạn / cần bổ sung đọc THẲNG cột công thức của Base');
{
  /* Một định nghĩa duy nhất, nằm trên Base — app không tính lại, để người mở
   * Base và người mở app không thấy hai con số khác nhau. */
  const ds = [
    { ma: 'A', tinhTrang: '✅ Còn hiệu lực', thieu: '' },
    { ma: 'B', tinhTrang: '⚠️ Sắp hết hạn', thieu: '' },
    { ma: 'C', tinhTrang: '❌ Đã hết hạn', thieu: 'USP' },
    { ma: 'D', tinhTrang: '—', thieu: 'Ảnh lịch trình' },
  ];
  ok('sapHetHan bắt cả sắp lẫn đã hết',
    kho.sapHetHan(ds).map((p) => p.ma).join() === 'B,C');
  ok('canBoSung chỉ lấy dòng có chữ trong cột Thiếu thông tin',
    kho.canBoSung(ds).map((p) => p.ma).join() === 'C,D');
}

/* ------------------------------------------------------------------ */
group('uuDaiSapHet(): gom theo chính sách, không theo sản phẩm');
{
  const NGAY = 86400000;
  const nay = Date.now();
  const chung = { id: 'cs1', ten: 'Voucher ẩm thực', den: nay + 8 * NGAY };
  const xa = { id: 'cs2', ten: 'Ưu đãi khách cũ', den: nay + 400 * NGAY };
  const cu = { id: 'cs3', ten: 'Đã hết', den: nay - 3 * NGAY };
  const ds = [
    { ma: 'TG01', ten: 'TG01', chinhSach: [chung, xa, cu] },
    { ma: 'TG03', ten: 'TG03', chinhSach: [chung] },
  ];
  const r = kho.uuDaiSapHet(ds, 30);
  ok('chỉ lấy ưu đãi hết hạn trong ngưỡng', r.length === 1, JSON.stringify(r.map((x) => x.ten)));
  /* Một chính sách nối tới hai sản phẩm phải ra MỘT dòng cảnh báo, không phải
   * hai — nếu không thì một ưu đãi áp cho 20 sản phẩm làm ngập danh sách. */
  ok('gộp thành một dòng, liệt kê các sản phẩm',
    r[0] && r[0].sanPham.join() === 'TG01,TG03', JSON.stringify(r[0] && r[0].sanPham));
  ok('ưu đãi đã hết hạn không nằm trong danh sách "sắp hết"',
    !r.some((x) => x.ten === 'Đã hết'));
}

/* ------------------------------------------------------------------ */
group('veSanPham(): cắt dấu · thừa ở cuối cột Thiếu thông tin');
{
  const cfg = require('../config');
  const p = kho.veSanPham({
    record_id: 'rec1',
    cells: {
      [cfg.f.sp.ma]: 'G4',
      [cfg.f.sp.ten]: 'Tour cano 3 đảo',
      [cfg.f.sp.thieu]: 'USP · Ảnh lịch trình · ',
      [cfg.f.sp.giaNL]: 800000,
      [cfg.f.sp.conLai]: '',
    },
  });
  ok('bỏ dấu phân cách treo ở cuối', p.thieu === 'USP · Ảnh lịch trình', JSON.stringify(p.thieu));
  ok('conLai rỗng -> null chứ không phải 0', p.conLai === null);
  ok('giá đọc đúng', p.giaNL === 800000);
  ok('mảng con luôn có sẵn', Array.isArray(p.gia) && Array.isArray(p.chinhSach) && Array.isArray(p.media));
}

/* ------------------------------------------------------------------ */
group('tinhGiaSauGiam(): chỉ trừ ưu đãi ĐƯỢC PHÉP trừ');
{
  const cs = (o) => Object.assign({
    id: 'c' + Math.random(), ten: 'CS', tinhTrang: '✅ Đang áp dụng',
    truyenThong: '✅ Dùng tự do', apGia: true,
    giamNL: null, giamTE: null, giamPhanTram: null, ghiGiam: '',
  }, o);
  const sp = (gia, ds) => ({ giaNL: gia[0], giaTE: gia[1], chinhSach: ds });

  const a = kho.tinhGiaSauGiam(sp([1550000, 995000], [cs({ giamNL: 100000, giamTE: 100000 })]));
  ok('trừ tiền cho cả hai loại vé', a.nl === 1450000 && a.te === 895000,
    JSON.stringify(a && { nl: a.nl, te: a.te }));
  ok('nói rõ đã trừ bao nhiêu', a.truNL === 100000 && a.truTE === 100000);
  ok('kèm danh sách chính sách đã trừ', a.ds.length === 1);

  /* Công tắc của con người. App KHÔNG tự suy "đây là khuyến mãi nên chắc là trừ" —
   * ưu đãi có điều kiện (khách cũ, mua từ 5 vé) mà chui vào giá công bố là hứa với
   * khách thứ một người mua lẻ không nhận được. */
  ok('ô "Áp vào giá hiển thị" tắt thì KHÔNG trừ',
    kho.tinhGiaSauGiam(sp([800000, 400000], [cs({ giamNL: 50000, apGia: false })])) === null);

  /* Mức giảm nội bộ mà lọt ra giá công bố là lộ chính sách nội bộ cho khách. */
  ok('chính sách "Chỉ nội bộ" thì KHÔNG trừ dù có bật ô',
    kho.tinhGiaSauGiam(sp([800000, 400000],
      [cs({ giamNL: 50000, truyenThong: '🔒 Chỉ nội bộ' })])) === null);

  ok('chính sách hết hiệu lực thì KHÔNG trừ',
    kho.tinhGiaSauGiam(sp([800000, 400000],
      [cs({ giamNL: 50000, tinhTrang: '❌ Hết hiệu lực' })])) === null);

  ok('không có mức giảm nào thì trả null',
    kho.tinhGiaSauGiam(sp([800000, 400000], [cs({})])) === null);

  /* Chưa có giá gốc thì không có giá sau giảm — đừng bịa ra số 0. */
  ok('sản phẩm chưa có giá thì trả null',
    kho.tinhGiaSauGiam(sp([null, null], [cs({ giamNL: 50000 })])) === null);

  const b = kho.tinhGiaSauGiam(sp([1000000, null], [cs({ giamNL: 100000 })]));
  ok('chỉ có giá NL thì TE để null, không thành 0', b.nl === 900000 && b.te === null,
    JSON.stringify(b && { nl: b.nl, te: b.te }));

  const c = kho.tinhGiaSauGiam(sp([1000000, 500000], [cs({ giamPhanTram: 20 })]));
  ok('giảm phần trăm', c.nl === 800000 && c.te === 400000,
    JSON.stringify(c && { nl: c.nl, te: c.te }));

  /* Thứ tự đã chốt: trừ TIỀN trước, rồi mới lấy PHẦN TRĂM trên phần còn lại.
   * Bình thường một chính sách chỉ có một trong hai; khai rõ để lúc có cả hai
   * thì app và người đọc Base hiểu giống nhau. */
  const d = kho.tinhGiaSauGiam(sp([1000000, null], [cs({ giamNL: 100000, giamPhanTram: 10 })]));
  ok('có cả tiền lẫn %: trừ tiền trước rồi mới lấy % trên phần còn lại',
    d.nl === 810000, String(d && d.nl));

  const e = kho.tinhGiaSauGiam(sp([1000000, null],
    [cs({ giamNL: 100000 }), cs({ giamNL: 50000 })]));
  ok('hai chính sách cùng bật thì cộng dồn', e.nl === 850000, String(e && e.nl));

  /* Giảm quá tay thì về 0, không âm — một giá âm lọt lên bài đăng thì hết đường chữa. */
  const f = kho.tinhGiaSauGiam(sp([100000, null], [cs({ giamNL: 500000 })]));
  ok('không bao giờ ra giá âm', f.nl === 0, String(f && f.nl));
}

/* ------------------------------------------------------------------ */
group('trongGiaHienThi(): ba điều kiện, thiếu một là không trừ');
{
  const c = (o) => Object.assign({
    apGia: true, tinhTrang: '✅ Đang áp dụng', truyenThong: '✅ Dùng tự do',
  }, o);
  ok('đủ ba điều kiện', kho.trongGiaHienThi(c({})) === true);
  ok('thiếu công tắc', kho.trongGiaHienThi(c({ apGia: false })) === false);
  ok('hết hiệu lực', kho.trongGiaHienThi(c({ tinhTrang: '❌ Hết hiệu lực' })) === false);
  ok('chỉ nội bộ', kho.trongGiaHienThi(c({ truyenThong: '🔒 Chỉ nội bộ' })) === false);
  /* "Sắp hết hạn" vẫn còn hiệu lực — vẫn phải trừ, nếu không thì trước ngày hết
   * hạn giá tự nhiên nhảy lên mà không ai đổi gì. */
  ok('sắp hết hạn thì vẫn còn trừ',
    kho.trongGiaHienThi(c({ tinhTrang: '⚠️ Sắp hết hạn' })) === true);
}

/* ------------------------------------------------------------------ */
group('laChinhSachChung(): "áp cho tất cả" đọc ô Phạm vi, KHÔNG đọc ô liên kết trống');
{
  /* Bản đầu coi mọi dòng chưa nối sản phẩm là áp cho tất cả. Đúng với ba dòng
   * lúc ấy, nhưng sập ngay khi thêm chính sách cho nhóm sản phẩm CHƯA CÓ trong
   * Base (ưu đãi tour riêng, 22/09/2026): dòng đó chưa nối được tới đâu, và mức
   * giảm 10% của tour riêng dán lên cả 59 sản phẩm đang bán.
   *
   * Chuỗi trong test phải là chuỗi THẬT trên Base, đủ dấu — bỏ dấu cho dễ gõ là
   * test xanh trong khi app đỏ. */
  ok('Toàn bộ sản phẩm -> chung', kho.laChinhSachChung({ phamVi: 'Toàn bộ sản phẩm' }) === true);
  ok('Nhóm sản phẩm -> KHÔNG chung', kho.laChinhSachChung({ phamVi: 'Nhóm sản phẩm' }) === false);
  ok('Sản phẩm cụ thể -> KHÔNG chung', kho.laChinhSachChung({ phamVi: 'Sản phẩm cụ thể' }) === false);
  ok('bỏ trống Phạm vi -> KHÔNG chung', kho.laChinhSachChung({ phamVi: '' }) === false);
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
