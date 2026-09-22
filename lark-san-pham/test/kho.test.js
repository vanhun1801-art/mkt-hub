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

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) { console.log(fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
