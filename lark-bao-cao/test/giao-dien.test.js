'use strict';
/**
 * ============================================================================
 * CHẠY THỬ PHẦN VẼ GIAO DIỆN — không cần trình duyệt, không cần mạng
 * ============================================================================
 *   node test/giao-dien.test.js
 *
 * Vì sao cần: `node --check public/app.js` chỉ soi CÚ PHÁP. Ngày 12/09/2026,
 * app Quỹ chi phí chèn hụt một hàm — tệp vẫn hợp lệ, vẫn qua --check, và chỉ vỡ
 * khi anh Hùng mở bản web thật, cả màn hình trắng (commit 4b6a9a3).
 *
 * Cách bắt: nạp app.js vào môi trường giả rồi gọi thẳng từng hàm vẽ với dữ liệu
 * mẫu. Hàm thiếu, biến sai tên, gọi nhầm thứ tự — tất cả ném ReferenceError
 * ngay tại đây thay vì trên máy người dùng.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (vi ? ' → ' + vi : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n         ' + vi : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const NGAY = 86400000;
const nay = Date.now();

const META = {
  toi: { id: 'ou_x', ten: 'Lê Văn Hùng', email: 'h@rootytrip.com', quanLy: true },
  cheDo: 'cli',
  larkUrl: 'https://example.larksuite.com/base/x',
  bayGio: nay,
  homNay: 'Thứ 7 12/09/2026',
  ca: [{ ma: 'ngay', ten: 'Cả ngày', phut: 480 },
    { ma: 'nua', ten: 'Nửa ngày', phut: 240 },
    { ma: 'khac', ten: 'Khác', phut: 0 }],
  nhomViec: ['Page', 'TikTok', 'Edit video', 'Thiết kế', 'Kịch bản', 'Khác'],
  trangThaiViec: ['Hoàn thành', 'Đang làm', 'Tạm dừng', 'Huỷ'],
  ky: { ngay: {}, tuan: {}, thang: {} },
  han: {},
};

const PHIEU_NGAY = {
  ma: 'ngay-x', ky: { loai: 'ngay', tu: nay - NGAY, den: nay },
  nhan: 'Thứ 6 11/09/2026', han: nay,
  cuaAi: { id: 'ou_x', ten: 'Lê Văn Hùng' },
  phieu: {
    ma: 'ngay-x', loaiKy: 'ngay', tu: nay - NGAY, den: nay, nhan: 'Thứ 6 11/09/2026',
    ca: 'Cả ngày', dinhMuc: 480, tongPhut: 360, tongGio: '6 giờ', phanTram: 75,
    nhanDinh: 'ổn', keHoach: 'tiếp tục', canHoTro: 'thiếu file gốc',
    linkVideo: 'https://minutes.example/abc',
    daNop: true, nopLuc: nay - 3600000, hanNop: nay,
    trangThaiHan: 'dung-han', veHan: 'Đúng hạn',
  },
  dong: [
    { congViec: 'Thiết kế logo', maViec: 'r1', nhom: 'Thiết kế', phut: 240,
      tienDoPt: 30, tienDo: 'chờ duyệt', trangThai: 'Đang làm' },
    /* Dòng gõ tay: không có mã tracking. Phải vẽ ra ô nhập chữ. */
    { congViec: 'Việc tự nhập', maViec: '', nhom: 'Khác', phut: 120,
      tienDoPt: 100, tienDo: '', trangThai: 'Hoàn thành' },
  ],
};

const PHIEU_TUAN = Object.assign({}, PHIEU_NGAY, {
  ky: { loai: 'tuan', tu: nay - 6 * NGAY, den: nay },
  dong: [],
  tongHop: {
    soPhieuNgay: 3, tongPhut: 1080, tongGio: '18 giờ',
    dinhMucPhut: 1440, dinhMucGio: '24 giờ', phanTram: 75,
    theoNhom: [{ ten: 'Thiết kế', phut: 720, gio: '12 giờ' },
      { ten: 'Edit video', phut: 360, gio: '6 giờ' }],
    ngayThieu: [{ ms: nay - 2 * NGAY, nhan: 'Thứ 5 10/09/2026' }],
    phieuNgay: [],
    viec: [
      { ten: 'Thiết kế logo', maViec: 'r1', nhom: 'Thiết kế', tongPhut: 720,
        gio: '12 giờ', soNgay: 3, ptDau: 30, ptCuoi: 70, trangThai: 'Đang làm',
        dungYen: false, ghiChu: [] },
      /* Việc đứng yên — thứ người viết báo cáo tuần cần bị đập vào mắt. */
      { ten: 'Kịch bản Rạch Vẹm', maViec: '', nhom: 'Kịch bản', tongPhut: 360,
        gio: '6 giờ', soNgay: 2, ptDau: 40, ptCuoi: 40, trangThai: 'Đang làm',
        dungYen: true, ghiChu: [] },
    ],
    theoNgay: [
      { tu: nay - 3 * NGAY, nhan: 'Thứ 4 09/09/2026', tongGio: '8 giờ', phanTram: 100,
        trangThaiHan: 'dung-han', veHan: 'Đúng hạn', nhanDinh: 'chạy tốt',
        keHoach: '', canHoTro: '', soViec: 2 },
      { tu: nay - NGAY, nhan: 'Thứ 6 11/09/2026', tongGio: '6 giờ', phanTram: 75,
        trangThaiHan: 'tre', veHan: 'trễ 2 giờ', nhanDinh: '', keHoach: '',
        canHoTro: 'thiếu file gốc', soViec: 1 },
    ],
    daViet: [
      { ngay: 'Thứ 4 09/09/2026', loai: 'Nhận định', chu: 'chạy tốt' },
      { ngay: 'Thứ 6 11/09/2026', loai: 'Cần hỗ trợ', chu: 'thiếu file gốc' },
      { ngay: 'Thứ 5 10/09/2026', loai: 'Thiết kế logo', chu: 'chờ sếp duyệt' },
    ],
  },
});

const VIEC = {
  chay: true,
  ds: [
    { id: 'r1', ten: 'Thiết kế logo', loai: 'Thiết kế', trangThai: 'Đang tiến hành', dong: false, nhom: 'Thiết kế' },
    { id: 'r2', ten: 'Edit clip Rạch Vẹm', loai: 'Edit', trangThai: 'Hoàn thành', dong: true, nhom: 'Edit video' },
  ],
};

const NHAN_DINH = {
  co: true, diem: 62, motCau: 'Mới khai 75% định mức.',
  y: [{ nhom: 'han', muc: 'tot', chu: 'Nộp đúng hạn.', vi: '' },
    { nhom: 'thoi-luong', muc: 'luu-y', chu: 'Mới khai 75% định mức.', vi: 'còn 2 giờ chưa vào đâu' },
    { nhom: 'ho-tro', muc: 'canh', chu: 'Có nêu vướng mắc cần hỗ trợ.', vi: 'thiếu file gốc' }],
};

const TOAN_PHONG = {
  ky: { tu: nay - 6 * NGAY, den: nay }, loaiKy: 'tuan', nhan: '05/09 – 11/09',
  nguoi: [{ ten: 'Thư', id: 'ou_t', email: 't@x.vn', soPhieu: 5, tongPhut: 2400,
    tongGio: '40 giờ', phanTram: 100, soThieu: 0, diem: 92,
    motCau: 'Nộp đúng hạn.', y: NHAN_DINH.y }],
};

const CAN_HO_TRO = {
  tu: nay - 21 * NGAY, den: nay,
  ds: [{ ten: 'Khanh', loaiKy: 'Ngày', nhan: '11/09/2026', tu: nay - NGAY,
    noi: 'Thiếu file gốc từ Sales.', daNop: true }],
};

const THEO_DOI = {
  tu: nay - 6 * NGAY, den: nay, soNgayCong: 6,
  nguoi: [{ ten: 'Hân', soNgayDaNop: 4, soTre: 1, tongPhut: 1920,
    thieu: [{ ms: nay - NGAY, nhan: '11/09' }] }],
};

const DANH_SACH = {
  tu: nay - 30 * NGAY, den: nay, caPhong: false,
  ds: [PHIEU_NGAY.phieu, Object.assign({}, PHIEU_NGAY.phieu,
    { loaiKy: 'tuan', daNop: false, trangThaiHan: 'thieu', phanTram: null })],
};

/* ---------------- môi trường giả ---------------- */

function phanTuGia() {
  const el = {
    innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
    dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    options: [], selectedOptions: [], children: [],
    style: {}, scrollIntoView() {}, focus() {}, remove() {}, click() {},
    insertAdjacentHTML() {}, appendChild() {}, replaceWith() {},
    addEventListener() {}, dispatchEvent() {},
    querySelector: () => phanTuGia(),
    querySelectorAll: () => [],
    selectedIndex: 0,
  };
  return el;
}

/** fetch giả: trả dữ liệu mẫu theo đúng đường được gọi. */
function fetchGia(ghi) {
  return async (duong) => {
    ghi.push(String(duong).split('?')[0]);
    const d = String(duong);
    const than =
      d.startsWith('/api/meta') ? META
        : d.startsWith('/api/viec-cua-toi') ? VIEC
          : d.startsWith('/api/nhan-dinh') ? NHAN_DINH
            : d.startsWith('/api/toan-phong') ? TOAN_PHONG
              : d.startsWith('/api/can-ho-tro') ? CAN_HO_TRO
                : d.startsWith('/api/theo-doi') ? THEO_DOI
                  : d.startsWith('/api/danh-sach') ? DANH_SACH
                    : d.startsWith('/api/phieu') ? PHIEU_NGAY
                      : {};
    return { ok: true, status: 200, text: async () => JSON.stringify(than) };
  };
}

function nap() {
  const ghi = [];
  const goc = phanTuGia();
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    document: {
      querySelector: () => goc,
      querySelectorAll: () => [],
      createElement: () => phanTuGia(),
      addEventListener() {},
      body: { appendChild() {} },
    },
    location: { pathname: '/m/bao-cao/', href: '' },
    setTimeout, clearTimeout,
    fetch: fetchGia(ghi),
    confirm: () => true,
    Event: class { constructor(t) { this.type = t; } },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'app.js' });
  ctx.__goi = (code) => vm.runInContext(code, ctx);
  ctx.__ghi = ghi;
  return ctx;
}

(async () => {
  group('Nạp app.js — bắt hàm thiếu ngay tại đây');
  let ctx = null, loi = null;
  try {
    ctx = nap();
    await new Promise((r) => setTimeout(r, 80));
  } catch (e) { loi = e; }
  ok('nạp được app.js, không ném lỗi', !loi, loi && (loi.message + '\n' + (loi.stack || '').split('\n')[1]));
  if (!ctx) {
    console.log('\n  ' + pass + ' pass · ' + fail + ' fail');
    process.exit(1);
  }

  const ve = (ten, code) => {
    let e = null, ra = '';
    try { ra = ctx.__goi(code); } catch (err) { e = err; }
    ok('vẽ được ' + ten, !e, e && e.message);
    return String(ra == null ? '' : ra);
  };

  /* Đặt sẵn trạng thái mà các hàm vẽ trông đợi. */
  ctx.__goi('META = ' + JSON.stringify(META));
  ctx.__goi('VIEC = ' + JSON.stringify(VIEC));
  ctx.__goi('DU = ' + JSON.stringify(PHIEU_NGAY));

  group('Màn nhập phiếu ngày');
  {
    const ky = ve('khối kỳ', 'theKy("ngay")');
    ok('có nhãn ngày', /Thứ|Chủ nhật/.test(ky), ky.slice(0, 120));
    ok('có nút lùi/tới và ô chọn ngày',
      ky.includes('btnLui') && ky.includes('chonNgay') && ky.includes('btnNay'));

    const bang = ve('bảng đầu việc', 'theBang(DU)');
    ok('mỗi dòng có menu chọn việc', bang.includes('v-viec'));
    ok('menu nạp việc thật từ Tracking', bang.includes('Thiết kế logo'),
      'không có thì nhân sự không chọn được gì');
    ok('việc đã đóng đánh dấu ✓', bang.includes('✓ Edit clip'));
    /* Anh Hùng xem bản dựng-mỗi-việc-một-khối rồi bảo "hiện tại anh thấy hơi
     * lớn… chỗ anh yêu cầu làm tinh tế gọn, thêm 1 hàng phía trên thôi". Nên
     * trở lại BẢNG, và ô Công việc có đúng hai hàng: chọn ở trên, gõ ở dưới. */
    ok('khối đầu việc mang tên "Báo cáo công việc"',
      bang.includes('<h2>Báo cáo công việc</h2>'),
      'đang ra: ' + (bang.match(/<h2>[^<]*<\/h2>/) || [''])[0]);
    ok('ô ghi chú tiến độ cũng để trống', !/class="v-td"[^>]*placeholder/.test(bang),
      'cột đã có tiêu đề rồi, và ô cao một dòng thì câu gợi ý bị cắt làm đôi');
    ok('giữ dạng bảng cho gọn', bang.includes('<table class="bang"'),
      'mỗi đầu việc một khối thì năm việc là năm khối cao, phải cuộn mới hết');
    ok('một đầu việc là một hàng',
      (bang.match(/<tr>/g) || []).length === 3, '1 hàng tiêu đề + 2 đầu việc');

    ok('ô Công việc có cả ô chọn lẫn ô gõ tay',
      (bang.match(/class="v-viec"/g) || []).length === 2 &&
      (bang.match(/class="v-cv"/g) || []).length === 2);
    ok('hai thứ nằm CÙNG một ô, không phải hai cột',
      (bang.match(/class="o-viec"/g) || []).length === 2,
      'tách thành hai cột là bảng rộng thêm mà chẳng rõ hơn');
    ok('ô gõ tay không bị ẩn', !/v-cv[^>]*hidden/.test(bang),
      'ẩn đi thì người dùng không biết là gõ thẳng được');
    ok('không còn mục "Khác — tự nhập" giả', !bang.includes('__khac'),
      'mục đó thừa khi ô gõ tay đã đứng sẵn ngay dưới');
    /* Anh Hùng: "với công việc nhập bằng tay thì ở trên tự động nhảy thành
     * Khác". Nên mục đầu chính là "Khác", và danh sách việc nằm trong một nhóm
     * có tên — mở menu ra là biết đang chọn từ đâu, không tốn thêm dòng chữ. */
    ok('mục đầu menu là "Khác"', /<option value="">Khác<\/option>/.test(bang));
    ok('danh sách việc nằm trong nhóm có tên',
      bang.includes('<optgroup label="Công việc đang tiến hành">'));
    ok('ô gõ tay gợi ý đúng chữ anh Hùng đưa', bang.includes('placeholder="Công việc khác"'));
    ok('cột Nhóm dời ra xa cột Công việc', bang.includes('class="tach"'),
      'hai ô sát nhau thì trông như cùng một nhóm ô, mà chúng nói hai chuyện khác nhau');
    ok('việc chọn từ Tracking vẫn điền sẵn tên vào ô',
      bang.includes('value="Thiết kế logo"'),
      'mở lại phiếu cũ mà ô trống thì người ta tưởng mất tên việc');
    ok('mỗi ô vẫn mang nhãn cột cho màn hẹp', bang.includes('data-nhan="Công việc"'));
    ok('tiến độ là thanh trượt %, không phải ô chữ',
      bang.includes('type="range"') && bang.includes('v-pt'));
    ok('tiến độ 100% được đánh dấu', bang.includes('pt du'));
    ok('có ô chọn ca', bang.includes('chonCa') && bang.includes('480 phút'));

    const tay = ve('khối tự viết', 'theVietTay(DU, "ngay")');
    ok('có ô nhận định', tay.includes('txNhanDinh'));
    ok('có ô kế hoạch kỳ sau', tay.includes('txKeHoach'));
    ok('có ô cần hỗ trợ', tay.includes('txHoTro'),
      'đây là nguồn của màn "Cần hỗ trợ" bên quản lý');
    ok('khối tự viết mang tên "Đánh giá báo cáo"', tay.includes('<h2>Đánh giá báo cáo</h2>'),
      'đang ra: ' + (tay.match(/<h2>[^<]*<\/h2>/) || [''])[0]);
    ok('điền sẵn nội dung đã lưu', tay.includes('thiếu file gốc'));

    /* Anh Hùng: "đổi thành ô trống không ghi nội dung". Mỗi ô đã có nhãn riêng
     * ngay trên nó; thêm câu mờ bên trong vừa thừa vừa đọc hộ người ta. */
    ok('các ô tự viết để TRỐNG, không chữ gợi ý',
      !/id="txNhanDinh"[^>]*placeholder/.test(tay) &&
      !/id="txKeHoach"[^>]*placeholder/.test(tay) &&
      !/id="txHoTro"[^>]*placeholder/.test(tay),
      'đang còn: ' + (tay.match(/placeholder="[^"]*"/g) || []).join(', '));
    ok('không còn dòng giải thích thừa dưới ô',
      !tay.includes('Ô này gom về một chỗ'));
    ok('nhãn vẫn còn để biết ô nào là ô nào',
      tay.includes('Nhận định') && tay.includes('Kế hoạch kỳ sau') &&
      tay.includes('Cần hỗ trợ'),
      'bỏ cả nhãn thì thành ba ô trắng không biết điền gì');

    ve('khối nút lưu', 'theLuu(DU)');

    /* Link video: chỉ hỏi ở tuần/tháng. Nhân sự vốn đã gửi kèm link Minutes cho
     * báo cáo tuần trong nhóm Lark — không có ô này thì họ mất một thứ đang làm
     * được, và quay lại dán vào nhóm chat. */
    const tayNgay = ctx.__goi('theVietTay(DU, "ngay")');
    ok('báo cáo NGÀY không hỏi link video', !String(tayNgay).includes('txVideo'),
      'chưa ai quay video cho báo cáo ngày — hỏi thêm chỉ làm dài biểu mẫu');
    ok('phiếu đã nộp thì nút là "Cập nhật"', ctx.__goi('theLuu(DU)').includes('Cập nhật báo cáo'));
  }

  group('Bấm thật vào các nút — chỗ node --check không soi tới');
  {
    /* Vừa để lọt một biến mồ côi ở đây: đổi bố cục xong, `const ds = ...` bị
     * xoá nhưng dòng dùng `ds` thì còn. Tệp vẫn qua --check, và chỉ nổ khi có
     * người bấm "+ Thêm dòng". Nên phải gọi thật mấy hàm xử lý nút. */
    const els = new Map();
    const tao = () => {
      const el = {
        _html: '', dataset: {}, value: '', hidden: false, disabled: false, title: '',
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        options: [], selectedOptions: [{ dataset: {} }], style: {},
        focus() {}, remove() {}, click() {}, scrollIntoView() {},
        insertAdjacentHTML(_, h) { this._html += h; },
        replaceWith() {}, addEventListener() {}, dispatchEvent() {},
        querySelector: () => tao(), querySelectorAll: () => [],
      };
      return el;
    };
    const goc = tao();
    ctx.__goi('DU = ' + JSON.stringify(PHIEU_NGAY));
    /* document giả trả về cùng một phần tử cho mọi truy vấn — đủ để các hàm
     * xử lý chạy hết thân của chúng. */
    ctx.document.querySelector = () => goc;
    ctx.document.querySelectorAll = () => [goc];

    let e = null;
    try { ctx.__goi('gan("ngay")'); } catch (err) { e = err; }
    ok('gắn được xử lý cho màn ngày', !e, e && e.message);

    for (const nut of ['btnThem', 'btnLui', 'btnToi', 'btnNay']) {
      let er = null;
      try { ctx.__goi('($("#' + nut + '").onclick || (() => {}))()'); } catch (err) { er = err; }
      ok('bấm ' + nut + ' không nổ', !er, er && er.message);
    }

    let e2 = null;
    try { ctx.__goi('ganHang(); docBang(); tinhLai();'); } catch (err) { e2 = err; }
    ok('ganHang / docBang / tinhLai chạy được', !e2, e2 && e2.message);

    ctx.document.querySelector = () => tao();
    ctx.document.querySelectorAll = () => [];
  }

  group('Ba trạng thái của danh sách đầu việc — gộp lại là người dùng hiểu sai');
  {
    /* Anh Hùng mở bản trên Render và thấy "Không nối được Bảng công việc" trong
     * khi Tracking vẫn chạy ở tab bên cạnh. Hai nguyên nhân chồng nhau: app này
     * gọi Tracking mà không gửi danh tính (Tracking trả mảng rỗng), và thời gian
     * chờ 6 giây quá ngắn cho lần gọi lạnh trên Render. Từ đó ba trạng thái phải
     * tách bạch, mỗi cái một câu khác nhau. */

    ctx.__goi('VIEC = { chay: false, ly: "Tracking không trả lời", cong: 5173, ds: [] }');
    const hong = ve('bảng khi KHÔNG NỐI ĐƯỢC', 'theBang(DU)');
    ok('nói thật là không nối được', hong.includes('Không nối được Bảng công việc'));
    ok('kèm nguyên văn lý do', hong.includes('Tracking không trả lời'),
      'không có lý do thì lần sau lại phải lần ngược từ code để đoán');
    ok('kèm cả cổng đang gọi', hong.includes('5173'));
    ok('vẫn chỉ đường gõ tay', hong.includes('gõ thẳng tên công việc'));

    ctx.__goi('VIEC = { chay: true, cuaAi: "Huỳnh Chí Khanh", ds: [] }');
    const trong = ve('bảng khi NỐI ĐƯỢC mà không có việc nào', 'theBang(DU)');
    ok('không đổ oan cho đường truyền', !trong.includes('Không nối được'),
      'nối được mà báo không nối được thì người ta đi tìm lỗi mạng vô ích');
    ok('nói rõ là không có đầu việc nào', trong.includes('Không có đầu việc nào'));
    ok('gọi tên người đang xem', trong.includes('Huỳnh Chí Khanh'));
    ok('chỉ đúng việc cần làm tiếp', trong.includes('nhờ quản lý giao việc trước'),
      'người dùng cần biết bước tiếp theo, không chỉ biết là trống');

    ctx.__goi('VIEC = ' + JSON.stringify(VIEC));
    const co = ve('bảng khi CÓ việc', 'theBang(DU)');
    ok('có việc thì không cảnh báo gì cả',
      !co.includes('Không nối được') && !co.includes('Không có đầu việc nào'));
  }

  group('Màn tuần / tháng — phần máy cộng');
  {
    ctx.__goi('DU = ' + JSON.stringify(PHIEU_TUAN));
    /* Anh Hùng xem bản đổ hết ra trang rồi bảo: "phía trên thì thông tin để như
     * báo cáo ngày, để khi chuyển qua không quá ngộp… ấn mở ra thì mới mở ra,
     * không cần hiện tràn ra. Vị trí thì em để bên phải, như Sổ của Claude hay
     * Gemini." Nên trang chính của kỳ tuần nay GIỐNG kỳ ngày, còn ba bảng dữ
     * liệu dời hết vào Sổ. */
    const t = ve('khối tổng hợp', 'theTongHop(DU)');
    ok('trang chính chỉ còn dải chip', t.includes('class="dai-so"'));
    ok('có nút mở Sổ', t.includes('id="btnSo"'));
    ok('KHÔNG đổ bảng ra trang chính',
      !t.includes('Đầu việc trong kỳ') && !t.includes('đã viết gì'),
      'đổ hết ra thì phải cuộn mãi mới tới ô cần điền');
    ok('vẫn nói đã nộp mấy ngày và tổng giờ',
      t.includes('3 ngày') && t.includes('18 giờ'));

    /* Tuần KHÔNG có dải so sánh — anh Hùng chốt chỉ làm cho tháng (14/09). */
    ok('kỳ tuần không kèm phần so với kỳ trước', !t.includes('So với'),
      'máy chủ không gửi kyTruoc cho tuần, giao diện cũng đừng tự vẽ ra');
  }

  group('Tháng: so với tháng trước');
  {
    const kem = (kyTruoc) => {
      const p = JSON.parse(JSON.stringify(PHIEU_TUAN));
      p.ky = { loai: 'thang', tu: nay - 13 * NGAY, den: nay + 16 * NGAY };
      p.tongHop.kyTruoc = kyTruoc;
      return p;
    };

    ctx.__goi('DU = ' + JSON.stringify(kem({
      nhan: 'Tháng 08/2026', dayDu: false, soNgay: 14, coDuLieu: true,
      soPhieuNgay: 11, tongPhut: 480, tongGio: '8 giờ', phanTram: 67,
      chenhPhut: 600, chenhGio: '+10 giờ', chenhPhanTram: 8,
    })));
    const t = ve('thẻ tháng có so sánh', 'theTongHop(DU)');
    ok('hiện tên tháng đem ra so', t.includes('Tháng 08/2026'));
    /* Thiếu câu này thì người đọc mặc định đang so hai tháng trọn vẹn, và mọi
     * kết luận rút ra từ đó đều lệch. */
    ok('nói rõ chỉ so mấy ngày đầu khi tháng chưa hết', t.includes('14 ngày đầu'),
      'tháng đang chạy dở mà không nói ra là con số đánh lừa người đọc');
    ok('hiện chênh giờ', t.includes('+10 giờ'));
    ok('hiện chênh điểm định mức kèm số cũ', t.includes('+8 điểm') && t.includes('67%'));
    /* Neo vào ĐÚNG con số chênh, không chỉ vào chữ "m xanh" ở đâu đó trong
     * thẻ: thẻ này còn mấy chip khác cũng tô màu, nên neo lỏng là phép thử
     * luôn xanh kể cả khi dải so sánh vẽ sai. */
    ok('tăng thì tô xanh', t.includes('m xanh">Định mức <b>+8 điểm'),
      'nhìn một cái là biết hơn hay kém');
    ok('tổng giờ KHÔNG tô màu — nhiều giờ chưa chắc tốt hơn',
      t.includes('<span class="m ">Tổng giờ <b>+10 giờ'),
      'tháng nhiều ngày công hơn thì nhiều giờ hơn là chuyện thường, không phải thành tích');

    ctx.__goi('DU = ' + JSON.stringify(kem({
      nhan: 'Tháng 08/2026', dayDu: true, soNgay: 31, coDuLieu: true,
      soPhieuNgay: 20, tongPhut: 9600, tongGio: '160 giờ', phanTram: 98,
      chenhPhut: -480, chenhGio: '-8 giờ', chenhPhanTram: -6,
    })));
    const g = ve('thẻ tháng đã kết thúc', 'theTongHop(DU)');
    ok('tháng trọn vẹn thì nói "cả tháng"', g.includes('cả tháng'));
    ok('giảm thì tô cam', g.includes('m cam">Định mức <b>-6 điểm'),
      'kém đi thì phải thấy ngay');

    /* Cảnh THẬT của tháng 9 đầu tiên: tháng 8 chưa ai dùng app. */
    ctx.__goi('DU = ' + JSON.stringify(kem({
      nhan: 'Tháng 08/2026', dayDu: false, soNgay: 14, coDuLieu: false,
      soPhieuNgay: 0, tongPhut: 0, tongGio: '', phanTram: null,
      chenhPhut: null, chenhGio: '', chenhPhanTram: null,
    })));
    const r = ve('thẻ tháng khi tháng trước trống', 'theTongHop(DU)');
    ok('nói thẳng là chưa so được', r.includes('chưa so được'));
    ok('và không vẽ ra con số chênh nào',
      !r.includes('+') && !r.includes('điểm'),
      'bịa "-100%" ở đây là vu cho cả phòng nghỉ việc');

    const so = ve('nội dung Sổ', 'soKy(DU)');
    ok('Sổ có chỗ dành sẵn cho AI', so.includes('class="cho-ai"'),
      'chừa sẵn thì sau này nối AI không phải xếp lại cả trang');
    ok('và nói thật là chưa nối', so.includes('chưa nối'));

    ok('Sổ có mục đầu việc', so.includes('Đầu việc trong kỳ'));
    ok('gộp theo việc, không theo ngày',
      so.includes('Thiết kế logo') && so.includes('12 giờ'));
    ok('tiến độ hiện đường đi, không chỉ con số cuối',
      so.includes('30% → ') && so.includes('<b>70%</b>'));
    ok('việc đứng yên bị gọi tên', so.includes('40% · đứng yên'),
      'đó là thứ người viết báo cáo tuần cần bị đập vào mắt');

    ok('Sổ có mục "đã viết gì"', so.includes('Anh/chị đã viết gì'),
      'muốn đọc lại bảy ngày mà phải mở bảy tấm ảnh thì không ai làm');
    ok('gom cả nhận định ngày', so.includes('chạy tốt'));
    ok('gom cả vướng mắc đã nêu', so.includes('thiếu file gốc'));
    ok('gom cả ghi chú tiến độ từng việc', so.includes('chờ sếp duyệt'));
    ok('mỗi ghi chú có mốc ngày', so.includes('class="dv-ngay"'));

    ok('Sổ có mục các ngày đã nộp', so.includes('Các báo cáo ngày đã nộp'));
    ok('mỗi ngày nói rõ đúng hạn hay trễ',
      so.includes('đúng hạn') && so.includes('trễ 2 giờ'));

    /* Hai mục đầu mở sẵn, phần còn lại đóng — mở hết thì lại thành cuộn dài,
     * mà cuộn dài chính là thứ vừa dọn khỏi trang chính. */
    ok('mở sẵn đúng hai mục', (so.match(/<details class="muc" open>/g) || []).length === 2,
      'đang mở: ' + (so.match(/<details class="muc" open>/g) || []).length);
    ok('mỗi mục có số đếm để liếc là biết', so.includes('class="dem"'));
  }

  group('Đóng mở Sổ');
  {
    let e = null;
    try {
      ctx.__goi('ganSo()');
      ctx.__goi('moSo("Chi tiết kỳ", "12/09 – 18/09", soKy(DU))');
      ctx.__goi('dongSo()');
    } catch (err) { e = err; }
    ok('mở rồi đóng Sổ không nổ', !e, e && e.message);
    ve('khối kỳ tuần', 'theKy("tuan")');
    const tayTuan = ve('khối tự viết của tuần', 'theVietTay(DU, "tuan")');
    ok('báo cáo TUẦN có ô link video', tayTuan.includes('txVideo'));
    ok('ô link video là kiểu url', /id="txVideo"[^>]*type="url"|type="url"[^>]*id="txVideo"/.test(tayTuan));
    ok('ô link video cũng để trống', !/id="txVideo"[^>]*placeholder/.test(tayTuan));
    /* Quay video báo cáo là QUY ĐỊNH của phòng. Ghi "không bắt buộc" ở đây là
     * app nói ngược lại quy định — anh Hùng: "video hiện tại bắt buộc quay, nên
     * em không cần note". */
    ok('KHÔNG ghi "không bắt buộc"', !tayTuan.includes('Không bắt buộc'),
      'app không được nói ngược quy định của phòng');
    ok('cũng không gợi ý bỏ trống', !tayTuan.includes('để trống nếu không quay'));
    ok('điền sẵn link đã lưu', tayTuan.includes('https://minutes.example/abc'),
      'mở lại phiếu cũ mà link biến mất thì phải dán lại mỗi lần sửa');
    ctx.__goi('DU = ' + JSON.stringify(PHIEU_NGAY));
  }

  group('Nhận định trên phiếu — note nhỏ trên đầu, không phải thẻ to ở cuối');
  {
    /* Anh Hùng: "để thành các note nhỏ đơn giản trên đầu là được, nhỏ nhỏ trên
     * đó đủ hiểu". Bản trước là một thẻ riêng ở CUỐI trang kèm điểm số to —
     * người gõ xong phiếu phải cuộn xuống mới thấy, mà thấy rồi thì nó lại to
     * hơn giá trị nó mang. */
    ctx.__goi('DU = ' + JSON.stringify(PHIEU_NGAY));
    const ky = ve('khối kỳ có chỗ cho note', 'theKy("ngay")');
    ok('chỗ đặt note nằm TRONG khối đầu trang', ky.includes('id="ndNote"'),
      'để ở cuối trang thì người vừa gõ xong không thấy');

    /* Ba chỗ, ba việc — bản trước cả ba cùng ghi "trễ 19 giờ 50 phút". */
    ok('nhãn cạnh tiêu đề chỉ nói đã nộp hay chưa',
      ky.includes('>Đã nộp<') && !/nhan-tt[^>]*>[^<]*trễ/.test(ky),
      'đang ra: ' + (ky.match(/<span class="nhan-tt[^<]*<\/span>/) || [''])[0]);
    ok('dòng dưới chỉ nói mốc giờ nộp',
      ky.includes('đã nộp ') && !/đã nộp [^<]*trễ/.test(ky),
      'nói kết luận ở cả hai chỗ thì người đọc phải kiểm xem hai câu có khớp không');

    const n = ve('dải note', 'noteY(' + JSON.stringify(NHAN_DINH.y) + ')');
    /* Anh Hùng: "chỉ cần nêu ra là nộp muộn, hay nộp đúng. Còn phần đánh giá
     * khác thì chưa cần." Mấy ý kia vẫn được tính và vẫn nằm ở màn Toàn phòng —
     * chỉ là không đặt lên đầu phiếu của người vừa gõ. */
    ok('chỉ còn MỘT note, về chuyện nộp', (n.match(/class="nd nd-/g) || []).length === 1,
      'đang ra: ' + n.slice(0, 200));
    ok('note đó nói về hạn nộp', n.includes('Nộp đúng hạn<'));
    ok('không mang ý thời lượng lên phiếu', !n.includes('định mức'));
    ok('không mang ý vướng mắc lên phiếu', !n.includes('vướng mắc'));
    ok('bỏ dấu chấm cuối câu', !n.includes('hạn.<'),
      'đây là note, không phải câu văn');

    const nhieu = ve('dải note khi nộp muộn', 'noteY(' + JSON.stringify([
      { nhom: 'han', muc: 'canh', chu: 'Nộp muộn — trễ 3 giờ.', vi: 'lý do gì đó' },
      { nhom: 'co-cau', muc: 'luu-y', chu: 'Edit video chiếm 80%.', vi: '' },
    ]) + ')');
    ok('nộp muộn vẫn hiện, và hiện một mình', (nhieu.match(/class="nd nd-/g) || []).length === 1 &&
      nhieu.includes('Nộp muộn'));
    ok('phần "vì" thành lời nhắc khi rê chuột', nhieu.includes('title="lý do gì đó"'),
      'nhét cả câu giải thích vào note thì nó hết nhỏ');

    ok('KHÔNG chấm điểm lên đầu phiếu của người vừa gõ', !/class="diem/.test(n),
      'điểm chỉ để xếp thứ tự bảng toàn phòng; đặt lên đây là đổi nghĩa nó từ ' +
      '"máy đọc dữ liệu" thành "máy chấm điểm anh"');
    ok('không còn thẻ nhận định riêng ở cuối phiếu',
      !ctx.__goi('veManPhieu.toString()').includes('oNhanDinh'));
  }

  group('Khối nhận định đầy đủ — vẫn dùng ở màn Toàn phòng của quản lý');
  {
    const y = ve('nhận định', 'theY("Nhận định tự động", ' + JSON.stringify(NHAN_DINH.y) + ', 62)');
    ok('mỗi ý một dòng có mức riêng',
      y.includes('class="y tot"') && y.includes('class="y luu-y"') && y.includes('class="y canh"'));
    ok('hiện điểm', y.includes('>62<'));
    ok('điểm 62 tô cam', y.includes('diem cam'));
    ok('điểm 92 tô xanh (mặc định)', ctx.__goi('mauDiem(92)') === '');
    ok('điểm 40 tô đỏ', ctx.__goi('mauDiem(40)') === 'do');
  }

  group('Ba màn quản lý');
  {
    for (const [ten, ma] of [['toàn phòng', 'toan-phong'], ['cần hỗ trợ', 'can-ho-tro'],
      ['theo dõi', 'theo-doi'], ['đã nộp', 'da-nop']]) {
      let e = null;
      try {
        ctx.__goi('MAN = "' + ma + '"');
        await ctx.__goi('ve()');
        await new Promise((r) => setTimeout(r, 30));
      } catch (err) { e = err; }
      ok('vẽ được màn ' + ten, !e, e && e.message);
    }
    ok('có gọi đúng các đường API',
      ['/api/toan-phong', '/api/can-ho-tro', '/api/theo-doi', '/api/danh-sach']
        .every((d) => ctx.__ghi.includes(d)),
      'đã gọi: ' + [...new Set(ctx.__ghi)].join(', '));
  }

  group('Hàm ngày giờ phía giao diện phải khớp phía máy chủ');
  {
    const K = require('../ky');
    const moc = K.tuNgayVN(2026, 9, 12) + 17 * K.GIO;
    ok('veNgay khớp', ctx.__goi('veNgay(' + moc + ')') === K.veNgay(moc));
    ok('veNgayThu khớp', ctx.__goi('veNgayThu(' + moc + ')') === K.veNgayThu(moc));
    ok('veLuc khớp', ctx.__goi('veLuc(' + moc + ')') === K.veLuc(moc));
    ok('vePhut khớp', ctx.__goi('vePhut(450)') === K.vePhut(450));
    /* Tuần phải cùng một quy ước Thứ 7 → Thứ 6 ở cả hai đầu; lệch thì bảng
     * "Theo dõi" đếm một khoảng, máy chủ tính một khoảng khác. */
    ok('mốc tuần khớp', ctx.__goi('mocTuan(' + moc + ').tu') === K.kyTuan(moc).tu,
      'client ' + ctx.__goi('mocTuan(' + moc + ').tu') + ' vs server ' + K.kyTuan(moc).tu);
    ok('đi vòng ISO không lệch ngày',
      ctx.__goi('tuISO(veISO(' + moc + '))') === K.dauNgay(moc));
  }

  console.log('\n' + '─'.repeat(56));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('NỔ: ' + e.stack); process.exit(1); });
