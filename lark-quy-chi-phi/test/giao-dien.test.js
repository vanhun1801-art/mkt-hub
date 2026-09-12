'use strict';
/**
 * ============================================================================
 * CHẠY THỬ PHẦN VẼ GIAO DIỆN — không cần trình duyệt, không cần mạng
 * ============================================================================
 *
 *   node test/giao-dien.test.js
 *
 * Vì sao cần: `node --check public/app.js` chỉ soi CÚ PHÁP. Ngày 12/09/2026 tôi
 * chèn hụt hàm `tachDon` — tệp vẫn hợp lệ, vẫn qua --check, và chỉ vỡ khi anh
 * Hùng mở app trên bản web thật: "Không đọc được sổ quỹ: tachDon is not
 * defined". Cả màn hình trắng.
 *
 * Cách bắt: nạp app.js vào một môi trường giả (document, fetch đều là hàng dựng
 * sẵn), trả về một sổ quỹ mẫu, rồi để chính app vẽ. Hàm thiếu, biến sai tên,
 * gọi nhầm thứ tự — tất cả đều ném ReferenceError ngay ở bước vẽ.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SAO = String.fromCharCode(10, 27) + '[1m';   /* xuống dòng + in đậm */
const HET = String.fromCharCode(27) + '[0m';
let pass = 0, fail = 0;
const fails = [];
function ok(ten, dieu, chiTiet) {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (chiTiet ? ' → ' + chiTiet : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (chiTiet ? '\n         ' + chiTiet : ''));
  }
}

/* Một sổ quỹ mẫu đủ các dạng dữ liệu thật đã gặp: khoản có đơn Tourwell kèm
 * link, khoản chưa có mã điều hành, khoản thiếu chứng từ, khoản đã quyết toán,
 * và một dòng "Chuyển từ kỳ trước" không được tính vào tiền đã ứng. */
const META = {
  me: { id: 'ou_x', name: 'Lê Văn Hùng' },
  vai: 'chuQuy',
  chuQuy: true,
  larkUrl: 'https://example.larksuite.com/base/x',
  quy: { tongUng: 65559931, tongChi: 58587875, conLai: 6972056, soLanUng: 6 },
  options: {
    loaiChi: ['Tác nghiệp', 'Di chuyển', 'Khác'],
    tinhTrang: ['Chờ chi', 'Đã chi', 'Đã quyết toán'],
    chungTu: ['Hoá đơn VAT', 'Hoá đơn tay / ảnh', 'Không cần chứng từ'],
  },
  dot: [{ id: 'recD1', ma: 'THÁNG 09', tinhTrang: 'Đang dùng', tongNap: 10970000, tongChi: 3997944, conLai: 6972056, nguoiGiu: [{ id: 'ou_x', name: 'Lê Văn Hùng' }] }],
  nap: [
    { id: 'recN1', noiDung: 'Tạm ứng tháng 9', ngay: '2026-09-01', tien: 10000000, loai: 'Nạp thêm', dot: ['recD1'] },
    { id: 'recN2', noiDung: 'Số dư đầu kỳ', ngay: '', tien: 970000, loai: 'Chuyển từ kỳ trước', dot: ['recD1'] },
  ],
  chi: [
    {
      id: 'recC1', noiDung: 'Livestream ĐTH + Dinner SOTS (11/09)', loai: 'Tác nghiệp',
      tien: 406000, ngayChi: '2026-09-12', ngayDeNghi: '2026-09-11',
      nguoi: [{ id: 'ou_y', name: 'Nguyễn Long Khánh' }], tinhTrang: 'Đã chi',
      hoaDon: [{ name: 'hd1.jpg', token: 'tk1' }],
      unc: [{ name: 'unc1.jpg', token: 'tk9' }], soHoaDon: '', maDieuHanh: '',
      maDon: 'RT16438 · https://rootytrip.tourwell.net/admin/order/16438/show',
      ncc: '', chuyenKhoan: '', maQuyetToan: '', linkCu: '', linkUncCu: '',
      chungTu: null, mst: '0314567890', ghiChu: '', dot: ['recD1'],
    },
    {
      id: 'recC2', noiDung: 'Tác nghiệp Vinwonders (Live)', loai: 'Tác nghiệp',
      tien: 362000, ngayChi: '2026-09-06', nguoi: [], tinhTrang: 'Đã quyết toán',
      hoaDon: [], unc: [], maDieuHanh: 'SG21000', maDon: '', maQuyetToan: 'QTTU52/LVH',
      linkCu: 'https://drive.google.com/file/d/x/view', linkUncCu: '',
      chungTu: 'Hoá đơn tay / ảnh', dot: ['recD1'],
    },
    {
      id: 'recC3', noiDung: 'Khoản chưa có chứng từ gì', loai: 'Khác',
      tien: 367200, ngayChi: '2026-08-27', nguoi: [], tinhTrang: 'Đã chi',
      hoaDon: [], unc: [], maDieuHanh: '', maDon: '', maQuyetToan: '',
      linkCu: '', linkUncCu: '', chungTu: null, dot: ['recD1'],
    },
  ],
};

/* ---- môi trường giả ----
 * Mọi phần tử DOM là một Proxy trả về chính nó cho mọi thuộc tính và mọi lời
 * gọi. Đủ để app gán innerHTML, textContent, addEventListener… mà không cần
 * dựng cả một trình duyệt. */
function phanTuGia() {
  const p = new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : p),
    set: () => true,
    apply: () => p,
    has: () => true,
  });
  return p;
}

function chay(meta) {
  const goc = phanTuGia();
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    document: {
      querySelector: () => goc,
      querySelectorAll: () => [],
      createElement: () => goc,
      addEventListener: () => {},
    },
    location: { pathname: '/m/quy-chi-phi/' },
    window: {},
    setTimeout, clearTimeout, fetch: async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => meta,
    }),
    confirm: () => true,
    prompt: () => '',
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  /* createContext + runInContext (KHÔNG phải runInNewContext): biến khai bằng
   * const/let nằm ở tầng lexical của context và chỉ sống tiếp nếu các lần chạy
   * sau dùng đúng context đó. Nhờ vậy phép thử mới với tới được `S`. */
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'app.js' });
  ctx.__goi = (code) => vm.runInContext(code, ctx);
  return ctx;
}

(async () => {
  console.log('\n\x1b[1mNạp app.js và để chính nó vẽ sổ quỹ mẫu\x1b[0m');

  let ctx = null;
  let loi = null;
  try {
    ctx = chay(META);
    /* taiLai() chạy bất đồng bộ ở cuối tệp — đợi một nhịp cho nó vẽ xong. */
    await new Promise((r) => setTimeout(r, 60));
  } catch (e) { loi = e; }
  ok('nạp được app.js, không ném lỗi', !loi, loi && loi.message);

  /* Gọi thẳng từng hàm vẽ: đây mới là chỗ bắt được "hàm thiếu". */
  const ve = (ten, fn) => {
    let e = null;
    let ra = '';
    try { ra = fn(); } catch (err) { e = err; }
    ok('vẽ được ' + ten, !e, e && e.message);
    return ra;
  };

  if (ctx) {
    const bang = ve('bảng sổ quỹ', () => ctx.veBang());
    ok('bảng có mã đơn Tourwell, bấm được',
      String(bang).includes('RT16438') && String(bang).includes('order/16438'),
      String(bang).slice(0, 200));
    ok('khoản chưa có mã điều hành thì hiện nút thêm',
      String(bang).includes('data-gansg'));
    ok('khoản đã có mã điều hành thì hiện mã', String(bang).includes('SG21000'));

    const tong = ve('dải tổng quan', () => ctx.veTong());
    ok('số dư hiện đúng dạng có dấu phân cách', String(tong).includes('6.972.056'),
      String(tong).slice(0, 200));

    ve('thanh lọc', () => ctx.veLoc());
    ctx.__goi('S.tab = "ung"');
    ve('bảng các lần ứng tiền', () => ctx.veUng());
    ctx.__goi('S.tab = "thieu"');
    const tabThieu = ve('tab cần bổ sung chứng từ', () => ctx.veBang());
    ok('tab cần bổ sung chỉ còn khoản thật sự thiếu',
      String(tabThieu).includes('Khoản chưa có chứng từ gì')
      && !String(tabThieu).includes('Vinwonders'), String(tabThieu).slice(0, 160));
    ctx.__goi('S.tab = "so"');

    /* Các cửa sổ cũng phải mở được — chúng dùng chung mấy hàm phụ. */
    ve('cửa sổ khai khoản chi', () => ctx.moKhaiChi());
    ve('cửa sổ sửa khoản chi', () => ctx.moKhaiChi('recC1'));
    ve('cửa sổ nạp quỹ', () => ctx.moNapQuy());
    ctx.__goi('S.chon.add("recC1")');
    ve('cửa sổ quyết toán', () => ctx.moQuyetToan());
    ve('cửa sổ kết quả Tourwell', () => ctx.moKetQuaTourwell(
      { ma: 'RT1', link: 'https://x', tien: 1000, dayDu: true }, { noiDung: 'x' }));
  }

  /* ========================================================================
   * BA VAI — mỗi vai một màn hình khác, và khác đúng ở chỗ việc của họ khác
   * ======================================================================
   * Chủ quỹ giữ tiền nên thấy cả UNC (đối chiếu ngân hàng) và sửa được sổ.
   * Kế toán kiểm chứng từ rồi đóng sổ: chỉ HOÁ ĐƠN, có ô tích để quyết toán,
   * không có nút sửa. Vai xem thì không ghi được gì.
   *
   * Ba nhóm dưới đây bắt đúng loại lỗi hay xảy ra nhất khi thêm một vai: quên
   * một chỗ rẽ nhánh, rồi vai này bỗng nhìn thấy nút của vai kia.
   */
  const veVoiVai = (vai) => chay(Object.assign({}, META, { vai, chuQuy: vai === 'chuQuy' }));

  console.log(SAO + 'Vai kế toán' + HET);
  const kt = veVoiVai('keToan');
  await new Promise((r) => setTimeout(r, 40));
  const bKt = String(kt.veBang());
  ok('kế toán thấy hoá đơn', bKt.includes('Hoá đơn'), bKt.slice(0, 160));
  ok('kế toán KHÔNG thấy cột UNC', !bKt.includes('UNC'),
    (bKt.match(/.{0,60}UNC.{0,60}/) || [''])[0]);
  ok('kế toán tick chọn được để quyết toán', bKt.includes('data-chon'));
  ok('kế toán không có nút Sửa', !bKt.includes('data-sua'));
  ok('kế toán không có nút gán mã điều hành', !bKt.includes('data-gansg'));
  ok('kế toán không có nút đính tệp', !bKt.includes('data-taitep'));
  kt.__goi('S.chon.add("recC1")');
  let eQt = null;
  try { kt.moQuyetToan(); } catch (err) { eQt = err; }
  ok('kế toán mở được cửa sổ quyết toán', !eQt, eQt && eQt.message);
  ok('thanh chọn có nút quyết toán cho kế toán',
    String(kt.veThanhChon()).includes('data-quyettoan'));

  console.log(SAO + 'Vai chỉ xem' + HET);
  const xv = veVoiVai('xem');
  await new Promise((r) => setTimeout(r, 40));
  const bXv = String(xv.veBang());
  ok('vai chỉ xem không tick chọn được', !bXv.includes('data-chon'));
  ok('vai chỉ xem không có nút Sửa', !bXv.includes('data-sua'));
  ok('vai chỉ xem vẫn đọc được số tiền', bXv.includes('406.000'));

  console.log(SAO + 'Vai chủ quỹ vẫn đủ quyền' + HET);
  const cq = veVoiVai('chuQuy');
  await new Promise((r) => setTimeout(r, 40));
  const bCq = String(cq.veBang());
  ok('chủ quỹ thấy CẢ UNC', bCq.includes('UNC'));
  ok('chủ quỹ có nút Sửa', bCq.includes('data-sua'));
  ok('chủ quỹ đính được tệp còn thiếu', bCq.includes('data-taitep'));
  ok('mã số thuế hiện lên cho kế toán soi', bCq.includes('0314567890'));

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
  if (fail) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
})();
