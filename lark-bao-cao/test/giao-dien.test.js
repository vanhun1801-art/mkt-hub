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
    dinhMucPhut: 1440, phanTram: 75,
    theoNhom: [{ ten: 'Thiết kế', phut: 720 }, { ten: 'Edit video', phut: 360 }],
    ngayThieu: [{ ms: nay - 2 * NGAY, nhan: 'Thứ 5 10/09/2026' }],
    phieuNgay: [],
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
  y: [{ muc: 'tot', chu: 'Nộp đúng hạn.', vi: '' },
    { muc: 'luu-y', chu: 'Mới khai 75% định mức.', vi: 'còn 2 giờ chưa vào đâu' },
    { muc: 'canh', chu: 'Có nêu vướng mắc cần hỗ trợ.', vi: 'thiếu file gốc' }],
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
    ok('có mục "Khác — tự nhập"', bang.includes('__khac'));
    ok('dòng gõ tay hiện ô nhập chữ (không bị hidden)',
      /class="v-cv" value="Việc tự nhập"(?![^>]*hidden)/.test(bang),
      'mở lại phiếu cũ mà ô ẩn thì người ta tưởng mất tên việc');
    ok('dòng chọn từ Tracking thì ô gõ tay ẩn',
      /class="v-cv" value=""[^>]*hidden/.test(bang));
    ok('tiến độ là thanh trượt %, không phải ô chữ',
      bang.includes('type="range"') && bang.includes('v-pt'));
    ok('tiến độ 100% được đánh dấu', bang.includes('pt du'));
    ok('có ô chọn ca', bang.includes('chonCa') && bang.includes('480 phút'));

    const tay = ve('khối tự viết', 'theVietTay(DU, "ngay")');
    ok('có ô nhận định', tay.includes('txNhanDinh'));
    ok('có ô kế hoạch kỳ sau', tay.includes('txKeHoach'));
    ok('có ô cần hỗ trợ', tay.includes('txHoTro'),
      'đây là nguồn của màn "Cần hỗ trợ" bên quản lý');
    ok('điền sẵn nội dung đã lưu', tay.includes('thiếu file gốc'));

    ve('khối nút lưu', 'theLuu(DU)');
    ok('phiếu đã nộp thì nút là "Cập nhật"', ctx.__goi('theLuu(DU)').includes('Cập nhật báo cáo'));
  }

  group('Cảnh báo khi Tracking tắt');
  {
    ctx.__goi('VIEC = { chay: false, ds: [] }');
    const b = ve('bảng khi không nối được Tracking', 'theBang(DU)');
    ok('nói thật là không nối được', b.includes('Không nối được Bảng công việc'),
      'menu rỗng mà im lặng thì người dùng tưởng mình không có việc nào');
    ok('vẫn chỉ đường gõ tay', b.includes('nhóm "Khác"'));
    ctx.__goi('VIEC = ' + JSON.stringify(VIEC));
  }

  group('Màn tuần / tháng — phần máy cộng');
  {
    ctx.__goi('DU = ' + JSON.stringify(PHIEU_TUAN));
    const t = ve('khối tổng hợp', 'theTongHop(DU)');
    ok('hiện số phiếu ngày đã nộp', t.includes('phiếu ngày đã nộp'));
    ok('hiện tổng thời lượng', t.includes('18 giờ'));
    ok('cảnh báo ngày còn thiếu', t.includes('Thứ 5 10/09/2026') && t.includes('thiếu 1 ngày'));
    ok('vẽ thanh theo nhóm việc', t.includes('class="thanh"'));
    ve('khối kỳ tuần', 'theKy("tuan")');
    ctx.__goi('DU = ' + JSON.stringify(PHIEU_NGAY));
  }

  group('Khối nhận định');
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
