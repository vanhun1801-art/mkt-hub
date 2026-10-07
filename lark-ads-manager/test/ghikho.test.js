/**
 * Kho lead + hội thoại ghi lên Base, đè theo khoá.
 *
 * Anh Hùng, 07/10/2026: "bất kỳ thứ gì anh cũng muốn gắn đè lên base, nên là
 * nhập file hay kéo về em đều đưa lên base giúp anh, đè lên nếu trùng, còn này
 * thì anh hay ấn lại và không lưu lại."
 *
 * Hai điều phải giữ bằng mọi giá, vì cả hai đều đã cắn thật ở bảng Sales:
 *
 *   1. ĐỌC ĐÚNG HÌNH DẠNG BẢN GHI. Lark trả `{ id, c }`, không phải
 *      `{ id, fields }`. Đọc nhầm thì bản đồ khoá RỖNG, và mỗi lượt chạy tạo
 *      dòng mới cho toàn bộ dữ liệu — 12.000 dòng cho 1.463 mã đơn, 17/09/2026.
 *      Không có lỗi nào hiện ra, chỉ có bảng phình lên.
 *   2. KHÔNG TỰ XOÁ. Dòng trên Base mà nguồn không còn thì báo ra, không dọn.
 *
 * Không có test nào ở đây gọi mạng.
 */
const cfg = require('../config');
const gk = require('../sync/ghikho');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const FL = cfg.tables.lead.f;
const FH = cfg.tables.hoiThoai.f;

console.log('— bảng và cột phải có thật trong cấu hình');
{
  t('có bảng Lead Tourwell', cfg.tables.lead.id === 'tblCy0RnWTou70Un');
  t('có bảng Hội thoại quảng cáo', cfg.tables.hoiThoai.id === 'tblTxGFvp1dGlLD8');
  const thieuL = Object.entries(FL).filter(([, v]) => !/^fld\w+$/.test(v));
  const thieuH = Object.entries(FH).filter(([, v]) => !/^fld\w+$/.test(v));
  t('mọi cột lead là field ID thật', thieuL.length === 0, JSON.stringify(thieuL));
  t('mọi cột hội thoại là field ID thật', thieuH.length === 0, JSON.stringify(thieuH));
  /* Hai bảng không được dùng chung field ID — dấu hiệu chép nhầm cấu hình. */
  const chung = Object.values(FL).filter((v) => Object.values(FH).includes(v));
  t('hai bảng không dùng chung field ID', chung.length === 0, JSON.stringify(chung));
}

console.log('— đọc bản ghi Base: `c`, KHÔNG phải `fields`');
{
  const rows = [
    { id: 'rec1', c: { [FL.ma]: 'LU1001' } },
    { id: 'rec2', c: { [FL.ma]: '  LU1002  ' } },   // có khoảng trắng thừa
    { id: 'rec3', c: { [FL.ma]: '' } },             // khoá rỗng → bỏ
    { id: 'rec4', fields: { [FL.ma]: 'LU9999' } },  // hình dạng SAI → không đọc được
  ];
  const m = gk.banDoKhoa(rows, FL.ma);
  t('đọc được khoá', m.get('LU1001') === 'rec1');
  t('cắt khoảng trắng hai đầu', m.get('LU1002') === 'rec2');
  t('bỏ dòng khoá rỗng', !m.has(''));
  t('chỉ đọc 2 dòng hợp lệ', m.size === 2, String(m.size));
  /* Nếu một ngày ai đó đổi lark.js sang trả `.fields`, test này vẫn pass nhưng
   * dòng dưới sẽ bắt được: bản ghi dạng fields KHÔNG được âm thầm coi là hợp lệ. */
  t('bản ghi sai hình dạng không lọt vào map', !m.has('LU9999'));
}

console.log('— kế hoạch ghi: có khoá thì SỬA, không có thì TẠO');
{
  const daCo = new Map([['LU1', 'recA'], ['LU2', 'recB']]);
  const kh = gk.lenKeHoach({
    rows: [{ ma: 'LU1' }, { ma: 'LU3' }, { ma: 'LU1' }, { ma: '' }],
    daCo,
    layKhoa: gk.khoaLead,
    lamDong: (r) => ({ x: r.ma }),
  });
  t('LU1 đã có → sửa', kh.capNhat.length === 1 && kh.capNhat[0].record_id === 'recA');
  t('LU3 chưa có → tạo', kh.taoMoi.length === 1 && kh.taoMoi[0].fields.x === 'LU3');
  t('LU1 lần hai bị bỏ, không ghi đè chính nó',
    kh.boQua.some((b) => b.ly === 'trùng trong dữ liệu nguồn'));
  t('dòng không có khoá bị bỏ', kh.boQua.some((b) => b.ly === 'không có khoá'));
  t('LU2 không còn trong nguồn → BÁO ra', kh.khongConNguon.join() === 'LU2');
  /* Và tuyệt đối không sinh ra việc xoá nào. */
  t('kế hoạch không có mục xoá', !('xoa' in kh));
}

console.log('— một lead → các ô ghi lên Base');
{
  const o = gk.dongLead({
    ma: 'LU1234', id: 1234, kh: 'KH-A', khach: 'Cô Hai Họ Đào',
    sdt: '0901234567', ngay: '2026-09-05', nguon: 'Facebook',
    trangThai: 'Đang tư vấn', donHang: 'RT1, RT2',
    ghiChu: 'khách quen · QC=12345 · gọi lại chiều',
  }, FL);
  t('mã lead là khoá', o[FL.ma] === 'LU1234');
  t('ngày đổi sang dạng Base', o[FL.ngay] === '2026-09-04 17:00:00', o[FL.ngay]);
  /* Anh Hùng chọn "cứ lưu đầy đủ" — KHÔNG che số. Che là mất khoá ghép lại. */
  t('số điện thoại lưu đầy đủ, không che', o[FL.sdt] === '0901234567');
  /* Mã QC người nối tay rút thành ô riêng, nhưng ghi chú gốc vẫn còn nguyên. */
  t('rút được mã quảng cáo từ ghi chú', o[FL.maQC] === '12345', o[FL.maQC]);
  t('vẫn giữ nguyên ghi chú gốc', /QC=12345/.test(o[FL.ghiChu]));
  t('có ô cập nhật lúc', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(o[FL.capNhat]));

  const trong = gk.dongLead({ ma: 'LU9' }, FL);
  t('ngày rác thì KHÔNG ghi ô ngày bịa', !(FL.ngay in trong));
  t('ghi chú trống không rút ra mã QC', trong[FL.maQC] === '');
  /* Lead không có mã nhưng có id vẫn lưu được — bản Excel hay thiếu cột mã. */
  t('không có mã thì lấy id làm khoá', gk.khoaLead({ id: 77 }) === '77');
  t('không có gì thì khoá rỗng, để bị bỏ qua', gk.khoaLead({}) === '');
}

console.log('— một hội thoại → các ô ghi lên Base');
{
  const o = gk.dongHoiThoai({
    id: 'conv-1', ngay: '2026-09-10', platform: 'Facebook',
    adIds: ['111', '222'], nhom: 'chuyen-doi', lyDo: 'Ghép được với đơn RT1',
    maDon: ['RT1'], tien: 5000000, soTinNhan: 12, tenKhach: 'Cô Hai',
  }, FH);
  t('id hội thoại là khoá', o[FH.id] === 'conv-1');
  t('phân loại nói tiếng người', o[FH.phanLoai] === 'Đã ra đơn', o[FH.phanLoai]);
  t('giữ nguyên lý do để đọc lại được', o[FH.viSao] === 'Ghép được với đơn RT1');
  t('nhiều mã QC thì nối bằng dấu phẩy', o[FH.maQC] === '111, 222');
  t('doanh thu là số', o[FH.doanhThu] === 5000000);

  /* ÉP SỐ — cùng bài học với o.tien trong roas.js: một ô thiếu làm cột thành
   * NaN, JSON hoá null, màn hình trống mà không báo gì. */
  const thieu = gk.dongHoiThoai({ id: 'conv-2', nhom: 'rac' }, FH);
  t('thiếu tiền → 0, không NaN', thieu[FH.doanhThu] === 0);
  t('thiếu số tin nhắn → 0, không NaN', thieu[FH.soTinNhan] === 0);
  const rac = gk.dongHoiThoai({ id: 'c3', tien: 'abc', soTinNhan: null, nhom: 'tiem-nang' }, FH);
  t('tiền kiểu chuỗi → 0', rac[FH.doanhThu] === 0, String(rac[FH.doanhThu]));
  t('ba nhóm đều có nhãn tiếng Việt',
    Object.keys(gk.NHAN_NHOM).join() === 'chuyen-doi,tiem-nang,rac');
}

console.log('— giờ gửi lên Base là UTC, cùng quy ước với gioBase()');
{
  /* ĐÃ ĐO: ghi 1.000 lead lên bảng thật rồi đọc lại, Base trả đúng chuỗi đã gửi
   * kèm `+00:00`. Bản đầu cộng 8 giờ vì nhớ nhầm Base đọc theo múi giờ của chính
   * nó — ô vẫn có số, chỉ chạy trước 8 tiếng. Kiểu sai không ai nhìn ra. */
  const d = new Date('2026-10-07T03:00:00Z');
  t('không cộng trừ gì vào giờ UTC', gk.bayGio(d) === '2026-10-07 03:00:00', gk.bayGio(d));
  const g = require('../sync/ghidoanhthu');
  t('cùng quy ước với ô ngày của bảng Sales',
    g.gioBase('2026-08-15') === '2026-08-14 17:00:00', g.gioBase('2026-08-15'));
}

console.log('— cả bốn đường ghi đều đi qua một chỗ');
{
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'sync', 'ghicongtudong.js'), 'utf8');
  /* Nút ghi tay, nút kéo API, nhập file Excel và lượt hẹn giờ đều gọi chay()
   * của file này. Gắn bước sao lưu ở đây nghĩa là không đường nào bỏ sót. */
  t('ghicongtudong có gọi ghiKho', /ghiKho\.chay\(/.test(src));
  t('truyền lead từ kho', /leadRows: \(kho\.lead/.test(src));
  t('truyền hội thoại đã phân loại', /htRows: \(kq && kq\.hoiThoaiPhanLoai\)/.test(src));
  /* Sao lưu là việc KÈM: phải nằm sau bước ghi doanh thu. */
  t('đặt sau bước ghi doanh thu',
    src.indexOf('ghiKho.chay(') > src.indexOf('ghiBaseLuc.ghi('));

  /* Đường nhập file có một lối rẽ: chỉ có file LEAD, chưa có file đơn. Lối đó
   * KHÔNG đi qua ghicongtudong (hàm ấy ném khi kho không có đơn), nên phải gọi
   * thẳng — không thì nhập mỗi file lead là không có gì lên Base, đúng cái lỗi
   * anh Hùng đang kêu. */
  const sv = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'server.js'), 'utf8');
  t('nhập chỉ file lead vẫn lưu lên Base', /ghiKho\.chayLead\(\{ leadRows: moi\.lead\.rows/.test(sv));
}

console.log('— lỗi một bảng không được làm chết bảng kia, và không được im');
(async () => {
  const lark = cfg.mode === 'api' ? require('../larkapi') : require('../lark');
  const goc = { listAll: lark.listAll, createMany: lark.createMany, updateMany: lark.updateMany };
  const nhat = [];
  try {
    lark.listAll = async (id) => {
      if (id === cfg.tables.hoiThoai.id) throw new Error('Base sập');
      return [];
    };
    lark.createMany = async () => ({});
    lark.updateMany = async () => ({});
    const kq = await gk.chay({
      leadRows: [{ ma: 'LU1', ngay: '2026-09-05' }],
      htRows: [{ id: 'c1', ngay: '2026-09-05', nhom: 'rac' }],
      ghi: (s) => nhat.push(s),
    });
    t('lead vẫn lưu được', kq.lead && kq.lead.taoMoi === 1, JSON.stringify(kq.lead));
    t('hội thoại lỗi thì báo, không ném ra ngoài', kq.loi.length === 1, JSON.stringify(kq.loi));
    t('lỗi nêu rõ bảng nào', /hội thoại: Base sập/.test(kq.loi[0]), kq.loi[0]);
    t('và có trong nhật ký cho người đọc thấy',
      nhat.some((x) => /không lưu được hội thoại/.test(x)), JSON.stringify(nhat));
  } finally { Object.assign(lark, goc); }

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exitCode = fail ? 1 : 0;
})();
