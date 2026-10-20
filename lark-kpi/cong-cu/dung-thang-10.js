'use strict';
/**
 * DỰNG BỘ LUẬT THÁNG 10/2026 theo bảng phân công tháng 9 của anh Hùng.
 *
 *   node cong-cu/dung-thang-10.js          xem trước, không ghi gì
 *   node cong-cu/dung-thang-10.js --ghi    ghi vào tháng 10
 *
 * NGUỒN: Google Sheet "KPI MKT - R", tab "Bản sao của KPI - Content 1", khối
 * Tháng 9 — ba cột Mục tiêu 1/2/3 là ba bạn content. Anh Hùng 20/10/2026:
 * *"phân công chỗ các bạn content tháng 9 sẽ giống tháng 10"*.
 *
 * Đối chiếu để biết cột nào của ai: tháng 8 có cột "Tỷ trọng kênh của Thư" ghi
 * FB MICE 30% còn "của Ngọc" ghi 10%; khối mục tiêu đặt FB MICE 75.000 ở cột 1
 * và 25.000 ở cột 3. Nên cột 1 là Thư, cột 2 là Hằng, cột 3 là Ngọc.
 *
 * KHÁC HẲN BỘ LUẬT ĐANG CHẠY, và đây là chỗ anh Hùng nói "số em đưa sai sai":
 *   - Hằng vốn KHÔNG có FB Rooty Trip và TikTok Rooty Trip trong app, mà bảng
 *     cho bạn ấy một phần ba cả hai.
 *   - Instagram app gán cho Hằng, bảng ghi là của Ngọc.
 *   - Thư và Ngọc trong app chia đều mọi thứ; bảng chia 75/25 ở MICE và 60/40
 *     ở Rooty Trip 2.
 *
 * BA ĐIỀU ĐÃ CHỌN, nói rõ ở đây để ai đọc cũng cãi lại được:
 *
 * 1. Mục tiêu "Lượt view" của bảng hiểu là view ĐÃ QUY ĐỔI (bán hàng ×1,0 ·
 *    tương tác ×0,2). Căn cứ: khối của Khánh ghi thẳng "Lượt view bán hàng FB
 *    Rooty Trip = 4.000.000", đúng bằng 1.333.333 × 3 của ba bạn content — hai
 *    chỗ dùng chung một con số.
 * 2. View bán hàng và view tương tác đi kèm làm hai dòng THEO DÕI, tỷ trọng 0.
 *    Anh Hùng: *"cần biết view bán hàng và tương tác luôn"*. Chúng hiện số và
 *    % đạt nhưng không cộng vào điểm — điểm đã nằm ở dòng quy đổi, cộng thêm
 *    là tính hai lần.
 * 3. Follow và lead là kết quả của CẢ KÊNH, nền tảng không chia theo người
 *    đăng. Nên ba bạn cùng kênh nhận cùng một con số và cùng một mục tiêu
 *    (tổng của cả kênh), và tên tiêu chí ghi rõ "cả kênh".
 */
const path = require('path');
const store = require(path.join(__dirname, '..', 'store'));
const L = require(path.join(__dirname, '..', 'luat'));

const THANG = '2026-10';
const TEN = { thu: 'Thư', hang: 'Hằng', ngoc: 'Ngọc' };

/* Bảng tháng 9: [kênh, tên kênh] → { mã người: [view, follow, lead] }.
 * `null` nghĩa là bảng để trống ô đó. */
const PHAN_CONG = [
  ['FB', 'Rooty Trip Phú Quốc', {
    thu: [1333333, 2000, 433], hang: [1333333, 2000, 433], ngoc: [1333333, 2000, 433] }],
  ['FB', 'Tour Đảo Rooty Trip Phú Quốc', { hang: [1000000, 6000, 150] }],
  ['FB', 'Rooty MICE Phú Quốc', { thu: [75000, 750, 8], ngoc: [25000, 500, 3] }],
  ['Tiktok', 'Rooty Trip Phú Quốc', {
    thu: [500000, 3000, 500], hang: [500000, 3000, 500], ngoc: [500000, 3000, 500] }],
  ['Tiktok', 'Rooty Trip Phú Quốc 2', { thu: [60000, 1200, 60], ngoc: [40000, 800, 40] }],
  ['Tiktok', 'Cuộc sống tại Phú Quốc', { hang: [300000, 2000, 20] }],
  ['Tiktok', 'Phú Quốc Không Phanh', { hang: [100000, 1000, 100] }],
  ['Tiktok', 'Đi Phú Quốc cùng HDV vui tánh', { hang: [200000, 1000, 10] }],
  ['Tiktok', 'Vi Vu Phú Quốc', { thu: [100000, 500, 10] }],
  ['Insta', 'Rooty Trip Phú Quốc', { ngoc: [55000, 200, 30] }],
  ['ZaloOA', 'Rooty Trip Phú Quốc', { thu: [5000, null, 100] }],
];

/* Tỷ trọng ba tiêu chí trong một nhóm kênh — giữ đúng như bộ luật nhập từ
 * Excel: view 40% · follow 30% · lead 30%. */
const TY = { view: 0.4, follow: 0.3, lead: 0.3 };

function nhomContent() {
  const ra = [];
  PHAN_CONG.forEach(([kenh, tenKenh, ai]) => {
    const goc = kenh + '|' + tenKenh + '|Bài viết';
    /* Mục tiêu follow và lead của CẢ KÊNH = tổng phần của những người cùng giữ
     * kênh đó. Bảng chia nhỏ cho từng người, nhưng nền tảng chỉ đo được ở mức
     * kênh nên gộp lại mới so được với con số thật. */
    const tongF = Object.values(ai).reduce((a, x) => a + (x[1] || 0), 0);
    const tongL = Object.values(ai).reduce((a, x) => a + (x[2] || 0), 0);

    Object.entries(ai).forEach(([ma, [view, , ]]) => {
      const tc = [];
      const nguon = (cs) => goc + '|' + ma + '#' + cs;
      tc.push({ ma: 'view', ten: 'Lượt view quy đổi', mucTieu: view, tyTrong: TY.view,
        nguon: nguon('viewQuyDoi') });
      /* Hai dòng theo dõi: hiện số, không cộng điểm. */
      tc.push({ ma: 'viewBan', ten: '— trong đó: view bán hàng', mucTieu: view, tyTrong: 0,
        nguon: nguon('viewBanHang') });
      tc.push({ ma: 'viewTt', ten: '— trong đó: view tương tác', mucTieu: view, tyTrong: 0,
        nguon: nguon('viewTuongTac') });
      if (tongF > 0) {
        tc.push({ ma: 'follow', ten: 'Lượt follow (cả kênh)', mucTieu: tongF, tyTrong: TY.follow,
          nguon: goc + '#follow' });
      }
      if (tongL > 0) {
        tc.push({ ma: 'lead', ten: 'Số lead (cả kênh)', mucTieu: tongL, tyTrong: TY.lead,
          nguon: goc + '#lead' });
      }
      /* Tỷ trọng phải cộng đủ 100% — bộ luật CHẶN nếu không. Kênh thiếu follow
       * hoặc lead thì chia lại phần đó cho các tiêu chí còn tính điểm. */
      const tinhDiem = tc.filter((x) => x.tyTrong > 0);
      const tong = tinhDiem.reduce((a, x) => a + x.tyTrong, 0);
      tinhDiem.forEach((x) => { x.tyTrong = x.tyTrong / tong; });

      ra.push({ kenh, tenKenh, loai: 'Bài viết · ' + TEN[ma], tieuChi: tc });
    });
  });
  return ra;
}

/* LIVE và các khối không chia theo người — giữ nguyên mục tiêu tháng 9. */
const NHOM_KHAC = [
  { kenh: 'FB', tenKenh: 'Rooty Trip Phú Quốc', loai: 'Live', tieuChi: [
    { ma: 'liveView', ten: 'LIVE-view', mucTieu: 200000, tyTrong: 0.8, nguon: 'FB|Rooty Trip Phú Quốc|Live#liveView' },
    { ma: 'liveComment', ten: 'LIVE-bình luận', mucTieu: 100, tyTrong: 0.2, nguon: 'FB|Rooty Trip Phú Quốc|Live#liveComment' },
  ] },
  { kenh: 'Tiktok', tenKenh: 'Rooty Trip Phú Quốc', loai: 'Live', tieuChi: [
    { ma: 'liveView', ten: 'LIVE-view', mucTieu: 250000, tyTrong: 0.5, nguon: 'Tiktok|Rooty Trip Phú Quốc|Live#liveView' },
    { ma: 'liveFollow', ten: 'LIVE-theo dõi', mucTieu: 2000, tyTrong: 0.2, nguon: 'Tiktok|Rooty Trip Phú Quốc|Live#liveFollow' },
    { ma: 'liveComment', ten: 'LIVE-bình luận', mucTieu: 3000, tyTrong: 0.3, nguon: 'Tiktok|Rooty Trip Phú Quốc|Live#liveComment' },
  ] },
  { kenh: 'Tiktok', tenKenh: 'Cuộc sống tại Phú Quốc', loai: 'Live', tieuChi: [
    { ma: 'liveView', ten: 'LIVE-view', mucTieu: 20000, tyTrong: 0.5, nguon: 'Tiktok|Cuộc sống tại Phú Quốc|Live#liveView' },
    { ma: 'liveFollow', ten: 'LIVE-theo dõi', mucTieu: 500, tyTrong: 0.2, nguon: 'Tiktok|Cuộc sống tại Phú Quốc|Live#liveFollow' },
    { ma: 'liveComment', ten: 'LIVE-bình luận', mucTieu: 200, tyTrong: 0.3, nguon: 'Tiktok|Cuộc sống tại Phú Quốc|Live#liveComment' },
  ] },
  { kenh: 'Tiktok', tenKenh: 'Phú Quốc Không Phanh', loai: 'Live', tieuChi: [
    { ma: 'liveView', ten: 'LIVE-view', mucTieu: 10000, tyTrong: 0.5, nguon: 'Tiktok|Phú Quốc Không Phanh|Live#liveView' },
    { ma: 'liveFollow', ten: 'LIVE-theo dõi', mucTieu: 200, tyTrong: 0.2, nguon: 'Tiktok|Phú Quốc Không Phanh|Live#liveFollow' },
    { ma: 'liveComment', ten: 'LIVE-bình luận', mucTieu: 200, tyTrong: 0.3, nguon: 'Tiktok|Phú Quốc Không Phanh|Live#liveComment' },
  ] },
  /* Khối "view bán hàng" của Khánh — bảng tháng 9 ghi bốn dòng này. Giờ đo
   * được thật nhờ nhãn Mục đích trên từng bài. */
  { kenh: 'Fanpage + Tiktok', tenKenh: 'Rooty Trip Phú Quốc', loai: 'Chung', tieuChi: [
    { ma: 'vbFb', ten: 'View bán hàng FB Rooty Trip', mucTieu: 4000000, tyTrong: 0.4,
      nguon: 'FB|Rooty Trip Phú Quốc|Bài viết#viewBanHang' },
    { ma: 'vbTt', ten: 'View bán hàng TikTok Rooty Trip', mucTieu: 1500000, tyTrong: 0.3,
      nguon: 'Tiktok|Rooty Trip Phú Quốc|Bài viết#viewBanHang' },
    { ma: 'vbMice', ten: 'View bán hàng FB MICE', mucTieu: 100000, tyTrong: 0.15,
      nguon: 'FB|Rooty MICE Phú Quốc|Bài viết#viewBanHang' },
    { ma: 'vInsta', ten: 'Lượt xem Instagram', mucTieu: 55000, tyTrong: 0.15,
      nguon: 'Insta|Rooty Trip Phú Quốc|Bài viết#view' },
  ] },
];

function dungLuat(cu) {
  const luat = JSON.parse(JSON.stringify(cu));
  luat.nhom = [...nhomContent(), ...NHOM_KHAC];

  const khoaCua = (ma) => luat.nhom
    .filter((n) => n.loai === 'Bài viết · ' + TEN[ma])
    .map((n) => [n.kenh, n.tenKenh, n.loai].join('|'));

  /* Phân bổ tỷ trọng giữa các kênh của một người: theo chính MỤC TIÊU view mà
   * bảng giao. Ai gánh kênh mục tiêu lớn thì kênh đó nặng hơn trong điểm của
   * họ — đúng tinh thần "mục tiêu tỷ lệ với phân công". */
  const phanBo = (ma) => {
    const ds = luat.nhom.filter((n) => n.loai === 'Bài viết · ' + TEN[ma]);
    const tong = ds.reduce((a, n) => a + (n.tieuChi.find((t) => t.ma === 'view') || {}).mucTieu, 0);
    const o = {};
    ds.forEach((n) => {
      const mt = (n.tieuChi.find((t) => t.ma === 'view') || {}).mucTieu;
      o[[n.kenh, n.tenKenh, n.loai].join('|')] = mt / tong;
    });
    return o;
  };

  const tayChung = [
    { ma: 'tuanThu', ten: 'Tuân thủ quy định Công ty', trongSo: 0.1, nguon: { kieu: 'tay', boi: 'HCNS' } },
    { ma: 'quanLy', ten: 'Quản lý đánh giá', trongSo: 0.1, nguon: { kieu: 'tay', boi: 'TP' } },
    { ma: 'dongGop', ten: 'Đóng góp tiêu chí 2', trongSo: 0.3, nguon: { kieu: 'tay', boi: 'TP' } },
  ];

  const nguoiCu = (ma) => (cu.nguoi || []).find((x) => x.ma === ma) || {};
  luat.nguoi = [
    ...['thu', 'hang', 'ngoc'].map((ma) => ({
      ...nguoiCu(ma), ma, ten: nguoiCu(ma).ten || TEN[ma].toUpperCase(),
      tieuChi: [
        { ma: 'hieuQua', ten: 'Hiệu quả Công việc chính', trongSo: 0.7, nguon: { kieu: 'kenh' } },
        ...tayChung,
      ],
      kenh: phanBo(ma),
    })),
    { ...nguoiCu('khanh'), ma: 'khanh', ten: 'KHÁNH',
      tieuChi: [
        { ma: 'hieuQua', ten: 'Hiệu quả Công việc chính', trongSo: 0.7, nguon: { kieu: 'kenh' } },
        ...tayChung,
      ],
      kenh: {
        'Fanpage + Tiktok|Rooty Trip Phú Quốc|Chung': 0.7,
        'FB|Rooty Trip Phú Quốc|Live': 0.1,
        'Tiktok|Rooty Trip Phú Quốc|Live': 0.1,
        'Tiktok|Cuộc sống tại Phú Quốc|Live': 0.05,
        'Tiktok|Phú Quốc Không Phanh|Live': 0.05,
      } },
    /* TRƯỜNG — chấm bằng chỉ số rời của app Chỉnh ảnh, không qua nhóm kênh.
     *
     * Mã dạng `thietke.anh` chỉ đọc được ở tiêu chí `kieu: 'chiSo'`; nhét vào
     * một nhóm kênh thì lớp thu số liệu đòi dạng `Kênh|Tên|Loại#chỉ số` và trả
     * về "mã nguồn không đúng dạng". Đã thử và hỏng đúng như vậy.
     *
     * Bảng tháng 9 ghi hai tiêu chí "Số lượng thiết kế đạt = 30" và "Chỉnh ảnh
     * = 98%". App Chỉnh ảnh chưa đo được hai cái đó — nó đếm lô ảnh, số ảnh và
     * số video, chứ không đếm sản phẩm thiết kế lẫn tỷ lệ đạt. Dùng cái đang
     * đo được, và ghi lại đây để ai cần thì đi bổ sung chứ không tưởng là bỏ
     * sót. */
    { ...nguoiCu('truong'), ma: 'truong', ten: 'TRƯỜNG',
      tieuChi: [
        { ma: 'soAnh', ten: 'Số ảnh đã chỉnh', trongSo: 0.35, mucTieu: 15000,
          nguon: { kieu: 'chiSo', ma: 'thietke.anh' } },
        { ma: 'soVideo', ten: 'Số video khách', trongSo: 0.2, mucTieu: 500,
          nguon: { kieu: 'chiSo', ma: 'thietke.video' } },
        { ma: 'ngayCoAnh', ten: 'Số ngày có ảnh', trongSo: 0.15, mucTieu: 31,
          nguon: { kieu: 'chiSo', ma: 'thietke.ngayCoAnh' } },
        ...tayChung,
      ],
      kenh: {} },
    /* Hùng — anh Hùng 18/10/2026 chốt chấm bằng CPA, nên khai `dao`. */
    { ...nguoiCu('hung'), ma: 'hung', ten: 'HÙNG',
      tieuChi: [
        /* Ba tiêu chí này thay chỗ "Hiệu quả Công việc chính" của người khác,
         * nên tổng của chúng phải đúng 0,7 — bộ luật CHẶN khi tổng trọng số
         * của một người khác người còn lại. */
        { ma: 'cpa', ten: 'CPA quảng cáo', trongSo: 0.35, mucTieu: 20000, dao: true,
          nguon: { kieu: 'chiSo', ma: 'ads.cpa' } },
        { ma: 'donHang', ten: 'Đơn từ quảng cáo', trongSo: 0.2, mucTieu: 2000,
          nguon: { kieu: 'chiSo', ma: 'ads.donHang' } },
        { ma: 'kol', ten: 'Bài KOL đã đăng', trongSo: 0.15, mucTieu: 20,
          nguon: { kieu: 'chiSo', ma: 'kol.baiDang' } },
        ...tayChung,
      ],
      kenh: {} },
  ];
  /* Hân tạm không tính — anh Hùng 18/10/2026: "Hân thì phát triển ứng dụng
   * riêng nên tạm không cần tính Hân". */
  return luat;
}

(async () => {
  await store.nap();
  const t = store.thang(THANG);
  if (!t) { console.error('Chưa có tháng ' + THANG); process.exit(1); }
  const luat = dungLuat(t.luat);

  const van = L.soat(luat);
  const chan = van.filter((x) => x.muc === 'chan');
  console.log('Nhóm: ' + luat.nhom.length + ' · người: ' + luat.nguoi.length);
  luat.nguoi.forEach((n) => {
    const k = Object.entries(n.kenh || {});
    console.log('\n' + n.ten + '  (' + n.tieuChi.length + ' tiêu chí)');
    k.sort((a, b) => b[1] - a[1]).forEach(([khoa, ty]) =>
      console.log('   ' + String(Math.round(ty * 100) + '%').padStart(5) + '  ' + khoa));
  });
  console.log('\nSoát: ' + chan.length + ' chặn · ' + (van.length - chan.length) + ' cảnh báo');
  van.slice(0, 12).forEach((x) => console.log('  [' + x.muc + '] ' + x.o + ' — ' + x.viec));

  if (!process.argv.includes('--ghi')) {
    console.log('\n(xem trước — thêm --ghi để lưu)');
    return;
  }
  if (chan.length) { console.error('\nCòn mục chặn, KHÔNG ghi.'); process.exit(1); }
  store.luuLuat(THANG, luat);
  await store.day();
  console.log('\nĐã ghi bộ luật tháng ' + THANG);
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
