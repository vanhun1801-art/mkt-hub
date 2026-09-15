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
    tinhTrang: ['Chờ chi', 'Đã chi', 'Đã quyết toán', 'Chờ điều chỉnh'],
    chungTu: ['Hoá đơn VAT', 'Hoá đơn tay / ảnh', 'Không cần chứng từ'],
  },
  dot: [{ id: 'recD1', ma: 'THÁNG 09', tinhTrang: 'Đang dùng', tongNap: 10970000, tongChi: 3997944, conLai: 6972056, nguoiGiu: [{ id: 'ou_x', name: 'Lê Văn Hùng' }] }],
  /* Tiền phải vào TRƯỚC khi tiêu. Bản mẫu cũ chỉ có một lần nạp và đặt nó ở
   * tháng 9, nên tháng 8 đóng sổ âm — một quyển sổ không tồn tại được ngoài
   * đời. Phép thử "kỳ âm phải kêu lên" đỏ ngay và nó đỏ đúng. */
  nap: [
    { id: 'recN1', noiDung: 'Tạm ứng tháng 8', ngay: '2026-08-01', tien: 10000000, loai: 'Nạp thêm', dot: ['recD1'] },
    { id: 'recN3', noiDung: 'Tạm ứng thêm tháng 9', ngay: '2026-09-01', tien: 2000000, loai: 'Nạp thêm', dot: ['recD1'] },
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
    {
      id: 'recC5', noiDung: 'Khoản chờ điều chỉnh', loai: 'Tác nghiệp',
      tien: 180000, ngayChi: '2026-09-10', nguoi: [], tinhTrang: 'Chờ điều chỉnh',
      hoaDon: [{ name: 'hd5.jpg', token: 'tk5' }], unc: [], maDieuHanh: '', maDon: '',
      maQuyetToan: '', linkCu: '', linkUncCu: '', chungTu: null,
      lyDoTuChoi: 'Hoá đơn mờ, không đọc được mã số thuế', dot: ['recD1'],
    },
    {
      id: 'recC4', noiDung: 'Khoản còn Chờ chi', loai: 'Khác',
      tien: 250000, ngayChi: '', ngayDeNghi: '2026-09-12', nguoi: [],
      tinhTrang: 'Chờ chi', hoaDon: [], unc: [], maDieuHanh: '', maDon: '',
      maQuyetToan: '', linkCu: '', linkUncCu: '', chungTu: null, dot: ['recD1'],
    },
  ],
};

/* ---- môi trường giả ----
 * Mọi phần tử DOM là một Proxy trả về chính nó cho mọi thuộc tính và mọi lời
 * gọi. Đủ để app gán innerHTML, textContent, addEventListener… mà không cần
 * dựng cả một trình duyệt. */
function phanTuGia(ten, ghi) {
  const p = new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : p),
    /* Ghi lại thứ app gán vào. Không có chỗ này thì innerHTML của cửa sổ rơi
     * vào hư không và phép thử chỉ biết "hàm chạy xong không ném lỗi" — trong
     * khi thứ đáng kiểm là NÓ VIẾT GÌ, ví dụ có cảnh báo ghi đè mã cũ không. */
    set: (t, k, v) => {
      if (ghi && ten) (ghi[ten] || (ghi[ten] = {}))[k] = String(v == null ? '' : v);
      return true;
    },
    apply: () => p,
    has: () => true,
  });
  return p;
}

function chay(meta) {
  const ghi = {};
  const kho = {};
  const layO = (sel) => (kho[sel] || (kho[sel] = phanTuGia(sel, ghi)));
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    document: {
      querySelector: (sel) => layO(sel),
      querySelectorAll: () => [],
      createElement: () => layO('<tạo mới>'),
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
  ctx.__ghi = ghi;                                   // những gì app đã viết ra DOM
  ctx.__than = () => (ghi['#mdBody'] || {}).innerHTML || '';
  ctx.__chan = () => (ghi['#mdFoot'] || {}).innerHTML || '';
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
  /* Cột chứng từ giờ là MỘT nút; chuyện "thấy gì" chuyển vào taiLieuCua() và
   * cửa sổ chứng từ, nên phải soi ở đó chứ không soi chuỗi trong bảng — soi
   * bảng thì phép thử xanh vì bảng chẳng còn chữ UNC nào cho ai cả. */
  ok('bảng chỉ còn một nút chứng từ mỗi dòng', /data-chungtu/.test(bKt) && !/data-taitep/.test(bKt));
  const ktCo = (id) => JSON.parse(kt.__goi(
    'JSON.stringify(taiLieuCua(S.chi.find(c=>c.id==="' + id + '")).map(t=>t.nhan))'));
  ok('kế toán mở chứng từ chỉ thấy hoá đơn', JSON.stringify(ktCo('recC1')) === '["Hoá đơn"]',
    JSON.stringify(ktCo('recC1')));
  kt.__goi('moChungTu("recC1")');
  ok('cửa sổ chứng từ của kế toán không có mục UNC', !/UNC/.test(kt.__than()),
    kt.__than().slice(0, 200));
  ok('kế toán không đính thêm tệp được', !/data-themtep/.test(kt.__than()));
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
  const cqCo = JSON.parse(cq.__goi(
    'JSON.stringify(taiLieuCua(S.chi.find(c=>c.id==="recC1")).map(t=>t.nhan))'));
  ok('chủ quỹ thấy CẢ hoá đơn lẫn UNC',
    cqCo.includes('Hoá đơn') && cqCo.includes('UNC'), JSON.stringify(cqCo));
  ok('chủ quỹ có nút Sửa', bCq.includes('data-sua'));
  cq.__goi('moChungTu("recC1")');
  ok('cửa sổ chứng từ của chủ quỹ có chỗ đính thêm', /data-themtep/.test(cq.__than()));
  ok('cửa sổ bày ô ảnh cho từng tệp', (cq.__than().match(/ct-the/g) || []).length === 2,
    (cq.__than().match(/ct-the/g) || []).length + ' ô');
  ok('mỗi tệp có cả nút Xem lẫn nút tải',
    /data-xem=/.test(cq.__than()) && /data-tai="1"/.test(cq.__than()));

  /* Khoản TRỐNG chứng từ: chủ quỹ vẫn bấm được để đính vào, vai khác thì nút
   * tắt hẳn. Nhưng khoản CÓ chứng từ thì ai cũng mở xem được — kể cả vai chỉ
   * xem; chặn đọc chứng từ là chặn đúng việc người ta mở app ra để làm. */
  ok('khoản chưa có gì thì chủ quỹ vẫn có nút đính',
    /data-chungtu="recC3"/.test(bCq));
  ok('vai chỉ xem vẫn mở được chứng từ của khoản CÓ tệp',
    /data-chungtu="recC1"/.test(bXv));
  ok('nhưng khoản trống thì nút tắt hẳn với vai chỉ xem',
    /ct-nut trong/.test(bXv) && !/data-chungtu="recC3"/.test(bXv),
    (bXv.match(/.{0,60}recC3.{0,80}/) || [''])[0]);

  console.log(SAO + 'Mã quyết toán đứng thành cột riêng' + HET);
  ok('bảng có cột Mã quyết toán', /<th>Mã quyết toán<\/th>/.test(bCq));
  ok('mã hiện trong ô của cột đó', /<td class="maqt"><span class="qt">QTTU52\/LVH/.test(bCq),
    (bCq.match(/.{0,40}maqt.{0,60}/) || [''])[0]);
  ok('khoản chưa có mã thì ô để gạch ngang', /<td class="maqt"><span class="mo">—/.test(bCq));
  ok('mã KHÔNG còn nằm lẫn trong dòng phụ dưới nội dung',
    !/class="phu2"[^>]*>[^<]*<span class="qt"/.test(bCq));
  ok('mã số thuế hiện lên cho kế toán soi', bCq.includes('0314567890'));

  /* ========================================================================
   * CHỌN HẾT KHÔNG ĐƯỢC QUÉT VÀO KHOẢN ĐÃ ĐÓNG SỔ
   * ======================================================================
   * Sổ thật có 163 khoản, trong đó 154 khoản mang mã QTTU riêng từ những đợt
   * quyết toán cũ. Một cú tích ở đầu bảng rồi một cú bấm "Quyết toán 163
   * khoản" là ghi đè sạch 154 mã đó, không hoàn lại được. Đây là chỗ dễ mất
   * dữ liệu nhất của cả app, nên phải có phép thử canh.
   *
   * `quyetToanDuoc` khai bằng const nên nằm ở tầng lexical của context, không
   * ló ra thành thuộc tính — phải hỏi qua __goi.
   */
  console.log(SAO + 'Chống xoá sổ lịch sử quyết toán' + HET);
  const q = veVoiVai('chuQuy');
  await new Promise((r) => setTimeout(r, 40));
  const duoc = (id) => q.__goi('quyetToanDuoc(S.chi.find(c=>c.id==="' + id + '"))');

  ok('khoản đã có mã QTTU thì KHÔNG quét vào nữa', duoc('recC2') === false);
  ok('khoản còn Chờ chi cũng không', duoc('recC4') === false);
  ok('khoản đã chi mà chưa có mã thì quét vào được', duoc('recC1') === true);

  /* ĐÓNG SỔ HÀNG LOẠT KHÔNG CÒN ĐỤNG VÀO KHOẢN ĐÃ CÓ MÃ.
   * Trước đây nó ghi đè kèm cảnh báo; giờ tách hẳn hai việc — muốn gán mã khác
   * thì bỏ quyết toán trước. Một cú bấm vừa gán vừa xoá là chỗ dễ mất dữ liệu
   * nhất, mà cảnh báo thì đọc một lần rồi lần sau bấm qua. */
  q.__goi('S.chon.clear(); S.chon.add("recC2"); S.chon.add("recC1"); moQuyetToan()');
  const than = q.__than();
  const chan = q.__chan();
  ok('cửa sổ nói rõ khoản đã có mã bị bỏ qua',
    /1 khoản đã có mã quyết toán nên không đụng tới/.test(than), than.slice(0, 260));
  ok('và chỉ đường: muốn gán lại thì bỏ quyết toán trước',
    /Bỏ quyết toán<\/b> trước/.test(than));
  ok('chỉ gửi đi id của khoản chưa có mã',
    /data-ids="recC1"/.test(chan), (chan.match(/data-ids="[^"]*"/) || [''])[0]);
  ok('không còn cờ ghi đè trong đường hàng loạt', !/data-ghide/.test(chan));

  /* Chọn toàn khoản đã đóng sổ rồi bấm Quyết toán: không mở cửa sổ trống. */
  q.__goi('S.chon.clear(); S.chon.add("recC2"); $("#mdBody").innerHTML = ""; moQuyetToan()');
  ok('chọn toàn khoản đã có mã thì không mở cửa sổ nào', q.__than() === '',
    q.__than().slice(0, 120));

  console.log(SAO + 'Bỏ quyết toán hàng loạt' + HET);
  q.__goi('S.chon.clear(); S.chon.add("recC2")');
  const thanh1 = String(q.veThanhChon());
  ok('chọn khoản đã đóng sổ thì hiện nút bỏ quyết toán',
    /data-boqt/.test(thanh1) && /Bỏ quyết toán 1 khoản/.test(thanh1), thanh1);
  ok('và KHÔNG hiện nút quyết toán cho khoản đó', !/data-quyettoan/.test(thanh1));

  q.__goi('S.chon.clear(); S.chon.add("recC1")');
  const thanh2 = String(q.veThanhChon());
  ok('chọn khoản chưa đóng sổ thì ngược lại',
    /data-quyettoan/.test(thanh2) && !/data-boqt/.test(thanh2), thanh2);

  q.__goi('S.chon.clear(); S.chon.add("recC1"); S.chon.add("recC2")');
  const thanh3 = String(q.veThanhChon());
  ok('chọn lẫn thì hiện cả hai, mỗi nút đếm đúng phần nó làm',
    /Bỏ quyết toán 1 khoản/.test(thanh3) && /Quyết toán 1 khoản/.test(thanh3), thanh3);

  /* Khoản "Chờ chi": tiền chưa rời quỹ mà đóng sổ là chứng từ chưa có thật. */
  q.__goi('S.chon.clear(); S.chon.add("recC4"); moQuyetToan()');
  ok('cửa sổ cảnh báo khoản còn Chờ chi', /Chờ chi/.test(q.__than()), q.__than().slice(0, 200));

  /* Không có gì đáng cảnh báo thì ĐỪNG cảnh báo — cảnh báo réo bừa là cảnh
   * báo không ai đọc, đúng bài học của luật thiếu chứng từ hồi 12/09. */
  q.__goi('S.chon.clear(); S.chon.add("recC1"); moQuyetToan()');
  ok('khoản sạch thì không doạ ghi đè',
    !/xoá hẳn/.test(q.__than()) && !/data-ghide/.test(q.__chan()));

  console.log(SAO + 'Tạo bù đơn Tourwell thay vì khai lại' + HET);
  const bQ = String(q.veBang());
  /* Chỉ MỘT khoản trong sổ mẫu chưa từng qua Tourwell: recC3 (không mã đơn,
   * không mã điều hành, không mã quyết toán). recC1 đã có đơn RT16438, recC2
   * có SG21000 + QTTU52, recC4 còn Chờ chi nhưng cũng sạch dấu vết nên được
   * mời — đúng, vì khai xong mà quên tạo đơn là chuyện hay xảy ra nhất. */
  const soNut = (bQ.match(/data-taodon/g) || []).length;
  /* Ba khoản sạch dấu vết: recC3, recC4 (Chờ chi) và recC5 (kế toán trả lại).
   * recC5 được mời là ĐÚNG — trả lại xong sửa chứng từ thì vẫn cần cái đơn. */
  ok('chỉ mời tạo đơn cho khoản chưa từng qua Tourwell', soNut === 3,
    soNut + ' nút / ' + META.chi.length + ' khoản');
  ok('khoản đã có mã điều hành SG thì KHÔNG mời tạo đơn',
    !/data-taodon="recC2"/.test(bQ));
  ok('khoản đã có đơn RT rồi cũng không', !/data-taodon="recC1"/.test(bQ));
  const kt2 = veVoiVai('keToan');
  await new Promise((r) => setTimeout(r, 40));
  ok('kế toán không tạo đơn Tourwell được', !String(kt2.veBang()).includes('data-taodon'));

  /* ========================================================================
   * MỘT KỲ LÀ MỘT THÁNG — bốn con số phải cộng khớp
   * ======================================================================
   * Kế toán chốt sổ theo tháng, nên thứ họ cần là:
   *     số dư đầu kỳ + nạp trong kỳ − chi trong kỳ = tồn cuối kỳ
   * Bốn con số đó đến từ bốn phép lọc khác nhau trên cùng dữ liệu, nên lệch
   * một đồng là biết ngay có chỗ lọc sai — y hệt cách quy.test.js đối chiếu
   * hai đường tính số dư.
   */
  console.log(SAO + 'Số liệu theo kỳ tháng' + HET);
  const kq = veVoiVai('chuQuy');
  await new Promise((r) => setTimeout(r, 40));
  const ky = (t) => kq.__goi('JSON.stringify(tinhKy("' + t + '"))');
  const k9 = JSON.parse(ky('2026-09'));

  ok('đầu kỳ + nạp − chi = cuối kỳ', k9.dauKy + k9.nap - k9.chi === k9.cuoiKy,
    JSON.stringify(k9));
  /* Đếm theo NGÀY CHI, thiếu thì lùi về ngày đề nghị. recC4 còn "Chờ chi" nhưng
   * vẫn tính vào kỳ — cùng luật với số dư quỹ, vốn cũng trừ khoản Chờ chi. Hai
   * chỗ mà tính khác nhau thì dải số trên đầu không cộng khớp nữa. */
  const chiT9 = kq.__goi('S.chi.filter(c => (c.ngayChi || c.ngayDeNghi || "").slice(0,7) === "2026-09")'
    + '.reduce((a,c) => a + c.tien, 0)');
  ok('chi trong kỳ khớp khi cộng tay lại', k9.chi === chiT9, k9.chi + ' vs ' + chiT9);
  ok('khoản Chờ chi vẫn nằm trong kỳ, cùng luật với số dư quỹ',
    k9.chi === 406000 + 362000 + 180000 + 250000, String(k9.chi));

  /* Bản ghi KHÔNG CÓ NGÀY là dữ liệu cũ nhập từ sheet. Xếp vào kỳ hiện tại thì
   * tháng này tự dưng phình ra một khoản không ai tiêu. */
  const k8 = JSON.parse(ky('2026-08'));
  ok('khoản tháng 8 không lọt sang kỳ tháng 9', k8.chi === 367200, String(k8.chi));
  ok('cuối kỳ tháng 8 chính là đầu kỳ tháng 9', k8.cuoiKy === k9.dauKy,
    k8.cuoiKy + ' vs ' + k9.dauKy);

  /* Không lọc tháng nào thì ô đầu là số dư sống của quỹ; lọc một tháng thì nó
   * đổi thành tồn cuối kỳ của đúng tháng đó. */
  const tongMacDinh = String(kq.veTong());
  ok('không lọc thì ô đầu là "Còn trong quỹ"', /Còn trong quỹ/.test(tongMacDinh));
  ok('luôn có ô số dư đầu kỳ', /Số dư đầu tháng/.test(tongMacDinh), tongMacDinh.slice(0, 200));
  kq.__goi('S.loc.thang = "2026-08"');
  const tongThang8 = String(kq.veTong());
  ok('lọc tháng 8 thì ô đầu thành tồn cuối kỳ', /Tồn cuối tháng 08\/2026/.test(tongThang8));
  ok('và cả dải số nhảy theo tháng 8', /Số dư đầu tháng 08\/2026/.test(tongThang8));
  kq.__goi('S.loc.thang = ""');

  console.log(SAO + 'Kế toán duyệt hoặc trả lại từng khoản' + HET);
  const k = veVoiVai('keToan');
  await new Promise((r) => setTimeout(r, 40));
  const bK = String(k.veBang());
  ok('khoản chưa đóng sổ có cả hai nút', /data-duyet="recC1"/.test(bK) && /data-tuchoi="recC1"/.test(bK));
  ok('khoản đã đóng sổ chỉ còn nút Sửa',
    /data-duyet="recC2"[^>]*>Sửa</.test(bK) && !/data-tuchoi="recC2"/.test(bK),
    (bK.match(/.{0,60}data-duyet="recC2".{0,30}/) || [''])[0]);
  ok('nút trả khoản về nói "Yêu cầu điều chỉnh", không nói "Từ chối"',
    /Yêu cầu điều chỉnh<\/button>/.test(bK) && !/>Từ chối</.test(bK));
  ok('kế toán không có nút Sửa', !/data-sua/.test(bK));

  k.__goi('moDuyetMot("recC1")');
  ok('cửa sổ duyệt kê lại đúng khoản đang đụng tới',
    k.__than().includes('Livestream ĐTH'), k.__than().slice(0, 160));
  ok('cửa sổ duyệt hỏi mã quyết toán', /id="dMa"/.test(k.__than()));
  k.__goi('moDuyetMot("recC2")');
  ok('đổi mã khoản đã có thì cảnh báo ghi đè',
    /xoá hẳn mã cũ/.test(k.__than()) && /data-ghide="1"/.test(k.__chan()),
    k.__than().slice(0, 200));
  /* Đóng sổ không còn là đường một chiều: bấm nhầm mã hay đổi ý thì gỡ được
   * ngay trong app, không phải mở Base sửa tay. */
  ok('cửa sổ khoản đã đóng sổ có nút bỏ quyết toán',
    /id="btnBoQuyetToan"/.test(k.__chan()), k.__chan().slice(0, 240));
  k.__goi('moDuyetMot("recC1")');
  ok('khoản chưa đóng sổ thì KHÔNG có nút bỏ quyết toán',
    !/btnBoQuyetToan/.test(k.__chan()));

  k.__goi('moTuChoi("recC1")');
  ok('cửa sổ yêu cầu điều chỉnh có ô ghi nội dung', /id="tLyDo"/.test(k.__than()));
  ok('có sẵn mấy lý do hay dùng để bấm', /data-lydo="Thiếu hoá đơn"/.test(k.__than()));
  /* Câu chữ trong app KHÔNG gọi tên ai. Người đọc câu này có thể đổi, mà chữ
   * trong app thì không đổi theo. */
  ok('không nhắc tên người nào trong câu chữ',
    !/Hùng/.test(k.__than()) && !/Hùng/.test(k.__chan()),
    (k.__than().match(/.{0,50}Hùng.{0,50}/) || [''])[0]);

  console.log(SAO + 'Lời từ chối phải đi ngược về người giữ quỹ' + HET);
  const bQ2 = String(kq.veBang());
  ok('sổ của người giữ quỹ hiện nguyên câu kế toán viết',
    bQ2.includes('Hoá đơn mờ, không đọc được mã số thuế'), '');
  ok('nhãn nói KHOẢN đang ở đâu, không nói ai làm',
    /Cần điều chỉnh:/.test(bQ2) && !/trả lại/i.test(bQ2),
    (bQ2.match(/.{0,40}điều chỉnh.{0,40}/) || [''])[0]);
  ok('dòng bị trả lại tô đỏ như dòng thiếu chứng từ',
    /class="canhbao"/.test(bQ2));
  ok('có ô đếm "Chờ điều chỉnh" trên dải tổng quan',
    /Chờ điều chỉnh/.test(String(kq.veTong())));

  /* Ô số 0 đứng thường trực là ô người ta học cách không nhìn. */
  kq.__goi('S.chi = S.chi.filter(c => c.tinhTrang !== "Chờ điều chỉnh")');
  ok('hết khoản chờ điều chỉnh thì ô đó biến mất hẳn',
    !/Chờ điều chỉnh/.test(String(kq.veTong())));

  console.log(SAO + 'Enter bấm đúng nút, không bấm nhầm nút đỏ' + HET);
  /* ======================================================================
   * Hai cửa sổ đặt một nút ĐỎ KHÔNG LÙI ĐƯỢC đứng TRƯỚC nút xác nhận:
   *   · "Sửa khoản chi"    → Xoá khoản này  |  Lưu
   *   · "Sửa quyết toán"   → Bỏ quyết toán  |  Ghi đè mã cũ
   * Chọn nút theo màu là gõ xong bấm Enter thì trúng nút đỏ, trong khi người
   * ta tưởng mình vừa lưu. Nên nút chính mang dấu data-chinh tường minh, và
   * phép thử này canh đúng chỗ đó — mỗi lần thêm một nút đỏ nữa vẫn an toàn.
   * ==================================================================== */
  const kq2 = veVoiVai('chuQuy');
  await new Promise((r) => setTimeout(r, 40));
  const nutChinh = (html) => {
    const m2 = html.match(/id="(bt[^"]+)"[^>]*data-chinh|data-chinh="1"[^>]*id="(bt[^"]+)"/);
    return m2 ? (m2[1] || m2[2]) : null;
  };

  kq2.__goi('moKhaiChi("recC1")');
  ok('cửa sổ sửa có cả nút xoá lẫn nút lưu',
    /data-xoa/.test(kq2.__chan()) && /btnLuuChi/.test(kq2.__chan()), kq2.__chan().slice(0, 200));
  ok('nút xoá đứng TRƯỚC nút lưu (nên mới dễ bắt nhầm)',
    kq2.__chan().indexOf('data-xoa') < kq2.__chan().indexOf('btnLuuChi'));
  ok('Enter nhắm nút Lưu, không nhắm nút Xoá', nutChinh(kq2.__chan()) === 'btnLuuChi',
    String(nutChinh(kq2.__chan())));

  const k3 = veVoiVai('keToan');
  await new Promise((r) => setTimeout(r, 40));
  k3.__goi('moDuyetMot("recC2")');
  ok('cửa sổ sửa quyết toán đặt nút gỡ trước nút xác nhận',
    k3.__chan().indexOf('btnBoQuyetToan') < k3.__chan().indexOf('btnDuyetMot'));
  ok('Enter nhắm nút xác nhận, không nhắm nút Bỏ quyết toán',
    nutChinh(k3.__chan()) === 'btnDuyetMot', String(nutChinh(k3.__chan())));

  kq2.__goi('S.chon.clear(); S.chon.add("recC1"); moQuyetToan()');
  ok('cửa sổ quyết toán lô có nút chính cho Enter',
    nutChinh(kq2.__chan()) === 'btnLuuQT', String(nutChinh(kq2.__chan())));

  /* Cửa sổ chỉ để xem thì Enter không được làm gì — ở đó không có việc nào
   * để xác nhận, mà bấm nhầm thì mở đơn Tourwell hay tải tệp. */
  kq2.__goi('moChungTu("recC1")');
  ok('cửa sổ chứng từ không có nút chính nào cho Enter', nutChinh(kq2.__chan()) === null,
    kq2.__chan().slice(0, 160));

  console.log(SAO + 'Kỳ đóng sổ âm phải kêu lên' + HET);
  /* ======================================================================
   * Ngày 15/09/2026: ba khoản (1.465.200) mang ngày 31/08 thay vì 01/09, tháng
   * 8 đóng ở −495.200 trong khi anh Hùng và kế toán đã chốt tháng đó ở 970.000.
   * Tổng quỹ vẫn đúng nên KHÔNG có gì bật ra — phải ngồi dò tay mới thấy.
   * Quỹ tạm ứng không âm được, nên một kỳ âm luôn là lỗi dữ liệu.
   * ==================================================================== */
  const ka = veVoiVai('chuQuy');
  await new Promise((r) => setTimeout(r, 40));
  ok('sổ lành thì KHÔNG doạ gì', !/bao-am/.test(String(ka.veTong())));

  /* Đẩy một khoản to sang tháng trước, đúng kiểu gõ nhầm ngày. */
  ka.__goi('S.chi.push({ id: "recAM", noiDung: "Khoản gõ nhầm ngày", loai: "Khác",'
    + ' tien: 99000000, ngayChi: "2026-07-15", nguoi: [], tinhTrang: "Đã chi",'
    + ' hoaDon: [], unc: [], maDieuHanh: "", maDon: "", maQuyetToan: "", dot: ["recD1"] })');
  const co = String(ka.veTong());
  ok('kỳ âm thì hiện vệt đỏ', /bao-am/.test(co), co.slice(0, 200));
  ok('vệt đỏ gọi đúng tên tháng bị âm', /tháng 07\/2026/.test(co), co.slice(0, 300));
  ok('và nói rõ nguyên nhân hay gặp là gõ nhầm ngày',
    /nhầm ngày/.test(co) && /không âm được/.test(co));

  /* Kỳ âm kéo theo mọi kỳ SAU nó cũng âm — đếm phải ra nhiều hơn một. */
  ok('đếm hết mọi kỳ bị âm, không chỉ kỳ đầu tiên',
    Number((co.match(/Có (\d+) kỳ đóng sổ âm/) || [])[1]) >= 1, co.slice(0, 200));

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass, ' + fail + ' fail\x1b[0m');
  if (fail) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
})();
