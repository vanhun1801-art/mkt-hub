'use strict';
/**
 * Kiểm thử API. Cần server đang chạy: `node server.js` (cửa sổ khác).
 *
 * An toàn: các phép GHI chỉ chạy khi app CHƯA nối Lark Base (đang dùng hàng đợi
 * cục bộ trong .tmp/). Nối base thật rồi thì phần ghi tự bỏ qua — test không bao
 * giờ đổ dữ liệu giả vào base vận hành.
 */
const cfg = require('../config');
const mau = require('../mau');

const B = process.env.APP_URL || ('http://localhost:' + cfg.port);
let pass = 0, fail = 0, boQua = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};
const bo = (name, ly) => { boQua++; console.log('  --  ' + name + ' (bỏ qua: ' + ly + ')'); };

async function goi(duong, opts) {
  const r = await fetch(B + duong, opts);
  const txt = await r.text();
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch (_) {}
  return { s: r.status, j, txt };
}
const get = (p, headers) => goi(p, headers ? { headers } : undefined);

/* Giả lập lớp vỏ gửi header danh tính + phân quyền xuống app con.
 * Chỉ có tác dụng khi app chạy chế độ `api`; chế độ cli (máy cá nhân) coi người
 * ngồi trước máy là quản lý nên phần này tự bỏ qua. */
const NHAN_SU = { 'x-hub-user-id': 'ou_test_nhansu', 'x-hub-user-name': 'Nhan%20Su' };
const NHAN_SU_CO_TIEN = { ...NHAN_SU, 'x-hub-perm-chi-phi': '1' };
const NHAN_SU_CHI_XEM = { ...NHAN_SU, 'x-hub-perm-khong-tao': '1' };
const QUAN_LY = { ...NHAN_SU, 'x-hub-user-manager': '1' };
const post = (p, body) => goi(p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});
const patch = (p, body) => goi(p, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});

(async () => {
  console.log('— server sống chưa');
  let r = await get('/healthz');
  if (r.s !== 200) {
    console.error('Không gọi được ' + B + ' — bật server trước: node server.js');
    process.exit(1);
  }
  t('/healthz trả 200', r.s === 200 && r.j.ok === true);

  console.log('— /api/meta');
  r = await get('/api/meta');
  const meta = r.j || {};
  t('trả 200', r.s === 200);
  t('có 7 kênh', (meta.kenh || []).length === 7, String((meta.kenh || []).length));
  t('trạng thái đúng bằng option của cột select trong Base',
    JSON.stringify(meta.trangThai) === JSON.stringify(cfg.trangThai), JSON.stringify(meta.trangThai));
  t('hướng dẫn liệt kê đủ cột đã khai', ((meta.luocDo || {}).huongDan || {}).cot &&
    meta.luocDo.huongDan.cot.length === Object.keys(cfg.cot).length,
    String((((meta.luocDo || {}).huongDan || {}).cot || []).length));
  /* Cột công thức phải được đánh dấu chiDoc — đây là hàng rào giữ app không ghi
   * vào "Doanh thu thu về" / "Gross VND" rồi làm hỏng cả bản ghi. */
  t('cột tiền được đánh dấu chỉ đọc',
    ['thucNhan', 'hoaHong', 'tongTienVnd', 'tongKhach'].every((k) => cfg.cot[k].chiDoc));
  t('/api/meta nói rõ cột nào Base thực sự có',
    meta.coCot && typeof meta.coCot.daNhan === 'boolean');
  t('nói rõ đang đọc nguồn nào', ['base', 'hang-doi', 'loi'].includes(meta.nguon), String(meta.nguon));
  t('liệt kê trường cho sửa', Array.isArray(meta.choSua) && meta.choSua.includes('diemDon'));

  const noiBase = !!(meta.luocDo && meta.luocDo.ok);
  console.log('  → chế độ: ' + (noiBase ? 'ĐÃ NỐI BASE (bỏ qua phần ghi)' : 'hàng đợi cục bộ'));

  console.log('— webhook: xác thực');
  r = await post('/webhook/klook?dryRun=1', mau.mau('klook'));
  t('gọi từ localhost được nhận', r.s === 200, r.txt.slice(0, 160));
  r = await goi('/webhook/klook', { method: 'GET' });
  t('GET webhook → 405', r.s === 405, String(r.s));
  r = await post('/webhook/agoda?dryRun=1', {});
  t('kênh lạ → 400', r.s === 400, r.txt.slice(0, 120));
  r = await goi('/webhook/klook?dryRun=1', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'khong-phai-json',
  });
  t('body rác → 400', r.s === 400, r.txt.slice(0, 120));

  console.log('— webhook dryRun: soi mapping, KHÔNG ghi gì');
  const truoc = (await get('/api/meta')).j.soBooking;
  r = await post('/webhook/viator?dryRun=1', mau.mau('viator'));
  t('trả booking đã chuẩn hoá', r.s === 200 && r.j.booking && !!r.j.booking.maBooking, r.txt.slice(0, 160));
  t('có bản đồ nguồn từng trường', r.j.booking && r.j.nguon && !!r.j.nguon.maBooking);
  t('luuVao = null (không ghi)', r.j.luuVao === null, String(r.j.luuVao));
  const sau = (await get('/api/meta')).j.soBooking;
  t('số booking không đổi', truoc === sau, truoc + ' → ' + sau);

  console.log('— /api/thu-mapping cho cả 7 kênh');
  for (const k of cfg.kenh) {
    r = await post('/api/thu-mapping', { kenh: k.id });
    const b = r.j && r.j.booking;
    t(k.id + ': map ra mã + tên + ngày đi + tour',
      r.s === 200 && b && b.maBooking && b.tenKhach && b.ngayDi && b.tour,
      r.txt.slice(0, 140));
  }

  /* ------------------------------------------------------------------
   * Đường GHI vào Base thật không chạy được trong test (không đổ dữ liệu giả vào
   * base vận hành). Nên kiểm hai tính chất quyết định của nó bằng cách khác:
   *   1. mọi ô app định ghi đều là cột GHI ĐƯỢC — ghi nhầm vào cột công thức là
   *      Lark từ chối cả bản ghi, tức MẤT nguyên booking;
   *   2. booking mẫu của cả 7 kênh đều nối được sang Danh mục Tour / Danh mục OTA
   *      — không nối được thì dòng vào Base im lặng ra 0đ.
   * ------------------------------------------------------------------ */
  if (noiBase) {
    console.log('— đường ghi vào Base (kiểm gián tiếp, không ghi gì)');
    const schema = require('../schema');
    const store = require('../store');
    const luoc = await schema.doc();
    const idCongThuc = new Set(Object.keys(cfg.cot)
      .filter((k) => cfg.cot[k].chiDoc).map((k) => luoc.fields[k]).filter(Boolean));

    const bMau = (await post('/api/thu-mapping', { kenh: 'klook' })).j.booking;
    const cells = store.sangCell({ ...bMau, kenhRecordId: 'recX', tourRecordId: 'recY' }, luoc);
    t('có sinh ra ô để ghi', Object.keys(cells).length > 5, String(Object.keys(cells).length));
    t('KHÔNG ghi vào bất kỳ cột công thức nào',
      Object.keys(cells).every((fid) => !idCongThuc.has(fid)),
      Object.keys(cells).filter((fid) => idCongThuc.has(fid)).join(', '));
    t('ghi cột liên kết OTA/Tour dạng mảng record_id',
      Array.isArray(cells[luoc.fields.kenh]) && Array.isArray(cells[luoc.fields.tour]));
    t('luôn điền tỷ giá để Gross VND không bằng số nguyên tệ',
      cells[luoc.fields.tyGia] > 0, String(cells[luoc.fields.tyGia]));
    t('trạng thái ghi ra nằm trong option của Base',
      cfg.trangThai.includes(cells[luoc.fields.trangThai]), String(cells[luoc.fields.trangThai]));

    console.log('— nối danh mục cho cả 7 kênh');
    for (const k of cfg.kenh) {
      const kq = (await post('/api/thu-mapping', { kenh: k.id })).j;
      t(k.id + ': nối được kênh trong ' + cfg.tableOtaName,
        !!(kq.noiDanhMuc && kq.noiDanhMuc.kenh),
        JSON.stringify(kq.noiDanhMuc));
      /* Tour thì KHÔNG bắt buộc nối được: payload mẫu của Ctrip là tour 4 đảo,
       * mà Danh mục Tour hiện chỉ có tour 3 đảo. Điều bắt buộc là khi không nối
       * được thì phải KÊU LÊN — im lặng mới là lỗi, vì dòng đó vào Base sẽ ra 0đ. */
      const noiTour = !!(kq.noiDanhMuc && kq.noiDanhMuc.tourRecordId);
      t(k.id + ': ' + (noiTour ? 'nối được tour' : 'không nối được tour thì có cảnh báo rõ'),
        noiTour || (kq.canhBao || []).some((c) => /không nhận ra tour|chưa có trong|khớp nhiều/i.test(c)),
        JSON.stringify(kq.canhBao || []));
    }

    bo('nhận booking thật + sửa + đẩy hàng đợi', 'đang nối Base thật, không ghi dữ liệu test');
  } else {
    console.log('— nhận booking thật vào hàng đợi');
    const p = mau.mau('klook');
    r = await post('/webhook/klook', p);
    t('nhận 200', r.s === 200 && r.j.nhan === true, r.txt.slice(0, 160));
    t('đánh dấu là booking mới', r.j.moi === true, String(r.j.moi));
    t('lưu vào hàng đợi', r.j.luuVao === 'hang-doi', String(r.j.luuVao));
    const ma = r.j.maBooking;

    console.log('— gửi LẠI cùng mã booking: phải cập nhật, không tạo trùng');
    const dem1 = (await get('/api/bookings?moc=nhanLuc')).j.tongTatCa;
    r = await post('/webhook/klook', p);
    t('lần hai không phải booking mới', r.j.moi === false, String(r.j.moi));
    const dem2 = (await get('/api/bookings?moc=nhanLuc')).j.tongTatCa;
    t('tổng số booking không tăng', dem1 === dem2, dem1 + ' → ' + dem2);

    console.log('— OTA gửi lại mà THIẾU điểm đón: không xoá dữ liệu đã có');
    const p2 = { ...p };
    delete p2.pickup_location;
    await post('/webhook/klook', p2);
    let ds = (await get('/api/bookings?moc=nhanLuc')).j.rows;
    let b = ds.find((x) => x.maBooking === ma);
    t('điểm đón cũ còn nguyên', b && /Seashells/.test(b.diemDon || ''), b && b.diemDon);

    console.log('— sửa booking (SĐT / điểm đón / nhận booking)');
    r = await patch('/api/booking/' + b.id, { diemDon: 'Pullman Phu Quoc', daNhan: true });
    t('sửa được', r.s === 200, r.txt.slice(0, 160));
    ds = (await get('/api/bookings?moc=nhanLuc')).j.rows;
    b = ds.find((x) => x.maBooking === ma);
    t('điểm đón đã đổi', b && b.diemDon === 'Pullman Phu Quoc', b && b.diemDon);
    t('đã đánh dấu nhận', b && b.daNhan === true, String(b && b.daNhan));

    r = await patch('/api/booking/' + b.id, { tongTien: 999 });
    t('không cho sửa số tiền → 400', r.s === 400, r.txt.slice(0, 120));
    r = await patch('/api/booking/' + b.id, { trangThai: 'Xong rồi' });
    t('trạng thái lạ → 400', r.s === 400, r.txt.slice(0, 120));
    r = await patch('/api/booking/khong-co-that', { diemDon: 'x' });
    t('booking không tồn tại → 404', r.s === 404, r.txt.slice(0, 120));

    console.log('— booking huỷ: doanh thu KHÔNG được cộng');
    const pHuy = { ...mau.mau('klook'), booking_status: 'CANCELLED' };
    r = await post('/webhook/klook', pHuy);
    const maHuy = r.j.maBooking;
    const tk = (await get('/api/thongke?moc=nhanLuc')).j;
    const dsHuy = (await get('/api/bookings?moc=nhanLuc')).j.rows.find((x) => x.maBooking === maHuy);
    t('trạng thái là Đã huỷ', dsHuy && dsHuy.trangThai === 'Đã huỷ', dsHuy && dsHuy.trangThai);
    t('booking huỷ không nằm trong bookingSong',
      tk.tong.bookingSong < tk.tong.booking, tk.tong.bookingSong + '/' + tk.tong.booking);
    t('huỷ được đếm riêng', tk.tong.huy >= 1, String(tk.tong.huy));
  }

  console.log('— /api/bookings: thẻ số vận hành');
  r = await get('/api/bookings?moc=nhanLuc');
  t('trả 200', r.s === 200);
  const vh = (r.j || {}).vanHanh || {};
  /* 6 thẻ khi Base có cột "Sales đã nhận", 5 khi chưa — thẻ "Chưa ai nhận" bị bỏ
   * hẳn thay vì hiện số 0 vĩnh viễn. */
  const soThe = (r.j || {}).coDaNhan === false ? 5 : 6;
  t('có ' + soThe + ' thẻ số', (vh.the || []).length === soThe, String((vh.the || []).length));
  t('không hiện thẻ "Chưa ai nhận" khi Base chưa có cột đó',
    (r.j || {}).coDaNhan !== false || !(vh.the || []).some((x) => x.khoa === 'chua-nhan'));
  t('mỗi thẻ có nhóm bản ghi kèm theo',
    (vh.the || []).every((x) => Array.isArray((vh.nhom || {})[x.khoa])),
    JSON.stringify((vh.the || []).map((x) => x.khoa)));
  t('thẻ "Cần liên hệ khách" khớp số dòng trong nhóm', (() => {
    const the = (vh.the || []).find((x) => x.khoa === 'can-goi');
    return the && the.so === (vh.nhom['can-goi'] || []).length;
  })());

  console.log('— /api/thongke');
  r = await get('/api/thongke?moc=nhanLuc');
  const tk = r.j || {};
  t('trả 200', r.s === 200);
  t('có tổng + theo kênh + theo ngày + theo tour', tk.tong && tk.kenh && tk.ngay && tk.tour);
  /* KHÔNG còn đẳng thức "thực nhận = tổng tiền − hoa hồng": thực nhận lấy từ bảng
   * giá NET (luôn VNĐ, cộng cả booking ngoại tệ), còn tổng tiền/hoa hồng là số của
   * OTA theo nguyên tệ nên chỉ cộng booking VNĐ. Kiểm bằng bất biến khác. */
  t('doanh thu có nguồn rõ ràng cho từng booking',
    tk.tong.theoBangGia + tk.tong.khongCoDoanhThu <= tk.tong.bookingSong,
    JSON.stringify({ bg: tk.tong.theoBangGia, khong: tk.tong.khongCoDoanhThu, song: tk.tong.bookingSong }));
  t('thực nhận không âm và không vượt tổng tiền OTA bán (phần VNĐ)',
    tk.tong.thucNhan >= 0, String(tk.tong.thucNhan));
  t('cộng theo kênh khớp tổng',
    Math.abs(tk.kenh.reduce((s, k) => s + k.thucNhan, 0) - tk.tong.thucNhan) < 1,
    String(tk.kenh.reduce((s, k) => s + k.thucNhan, 0)) + ' vs ' + tk.tong.thucNhan);
  t('cộng số khách theo kênh khớp tổng',
    tk.kenh.reduce((s, k) => s + k.khach, 0) === tk.tong.khach);
  /* Ctrip gửi CNY, GetYourGuide gửi EUR. Nếu chúng lọt vào ô tiền VNĐ thì
   * "doanh thu thực nhận" là con số vô nghĩa mà trông vẫn hợp lý. */
  t('booking ngoại tệ KHÔNG nằm trong ô tiền VNĐ',
    tk.tong.ngoaiTe === 0 || tk.tong.bookingVnd === tk.tong.bookingSong - tk.tong.ngoaiTe,
    JSON.stringify({ ngoaiTe: tk.tong.ngoaiTe, vnd: tk.tong.bookingVnd, song: tk.tong.bookingSong }));
  t('có liệt kê các loại ngoại tệ gặp phải',
    tk.tong.ngoaiTe === 0 || (Array.isArray(tk.tong.dsNgoaiTe) && tk.tong.dsNgoaiTe.length > 0),
    JSON.stringify(tk.tong.dsNgoaiTe));

  console.log('— sắp xếp: mặc định phải là ngày đi gần nhất trước');
  {
    r = await get('/api/bookings');
    t('trả về kiểu sắp đang dùng', r.j.sap === 'ngayDi', String(r.j.sap));
    const nay = (await get('/api/meta')).j.homNay;
    /* Ba khối theo đúng thứ tự việc phải làm: chưa có ngày đi → sắp đi → đã qua.
     * Trong khối "sắp đi" thì ngày phải tăng dần. */
    const khoi = (b) => (!b.ngayDi ? 0 : b.ngayDi >= nay ? 1 : 2);
    const ds = r.j.rows;
    let dungKhoi = true, dungNgay = true;
    for (let i = 1; i < ds.length; i++) {
      if (khoi(ds[i]) < khoi(ds[i - 1])) dungKhoi = false;
      if (khoi(ds[i]) === 1 && khoi(ds[i - 1]) === 1 && ds[i].ngayDi < ds[i - 1].ngayDi) dungNgay = false;
    }
    t('đúng thứ tự khối (chưa có ngày → sắp đi → đã qua)', dungKhoi,
      ds.map((b) => khoi(b) + ':' + (b.ngayDi || '—')).join(' '));
    t('trong khối sắp đi, ngày đi tăng dần', dungNgay,
      ds.filter((b) => khoi(b) === 1).map((b) => b.ngayDi).join(' '));

    const sapDi = ds.filter((b) => khoi(b) === 1);
    t('booking đi gần nhất nằm trên booking đi xa hơn',
      sapDi.length < 2 || sapDi[0].ngayDi <= sapDi[sapDi.length - 1].ngayDi,
      sapDi.length ? sapDi[0].ngayDi + ' … ' + sapDi[sapDi.length - 1].ngayDi : '(không có)');

    r = await get('/api/bookings?sap=nhanLuc');
    const theoVe = r.j.rows;
    let giamDan = true;
    for (let i = 1; i < theoVe.length; i++) {
      if ((theoVe[i].nhanLuc || 0) > (theoVe[i - 1].nhanLuc || 0)) giamDan = false;
    }
    t('sap=nhanLuc → mới về trước', r.j.sap === 'nhanLuc' && giamDan, String(r.j.sap));

    r = await get('/api/bookings?sap=lung-tung');
    t('kiểu sắp lạ → quay về mặc định ngayDi', r.j.sap === 'ngayDi', String(r.j.sap));

    const nhom = (await get('/api/bookings')).j.vanHanh.nhom['7-ngay'];
    let nhomDung = true;
    for (let i = 1; i < nhom.length; i++) {
      if (nhom[i].ngayDi < nhom[i - 1].ngayDi) nhomDung = false;
    }
    t('nhóm sau thẻ số cũng sắp theo ngày đi', nhomDung,
      nhom.map((b) => b.ngayDi).join(' '));
  }

  console.log('— bảng giá NET qua API');
  {
    const ds = (await get('/api/bookings?moc=nhanLuc')).j.rows;

    const coSp = ds.filter((b) => b.sanPham);
    t('có booking map được sản phẩm trong bảng giá', coSp.length > 0, String(coSp.length));
    t('booking map được thì luôn có doanh thu VNĐ',
      coSp.every((b) => b.thucNhan > 0 && b.nguonThucNhan === 'bang-gia'),
      JSON.stringify(coSp.filter((b) => !(b.thucNhan > 0)).map((b) => b.maBooking)));

    /* Điểm quan trọng nhất của bảng giá: OTA bán bằng EUR/CNY mà doanh thu vẫn ra
     * VNĐ chính xác — cách tính theo % không làm được việc này. */
    const ngoai = ds.filter((b) => b.tienTe && b.tienTe !== 'VND' && b.sanPham);
    t('booking bán ngoại tệ nhưng map được ⇒ vẫn có doanh thu VNĐ',
      ngoai.length === 0 || ngoai.every((b) => b.thucNhan > 0),
      JSON.stringify(ngoai.map((b) => [b.tienTe, b.thucNhan])));

    const vndCoSp = coSp.filter((b) => (!b.tienTe || b.tienTe === 'VND') && b.tongTien);
    t('thực nhận không vượt giá OTA bán (booking VNĐ)',
      vndCoSp.every((b) => b.thucNhan <= b.tongTien),
      JSON.stringify(vndCoSp.filter((b) => b.thucNhan > b.tongTien)
        .map((b) => [b.maBooking, b.thucNhan, b.tongTien])));

    const meta2 = (await get('/api/meta')).j;
    t('/api/meta trả bảng giá cho màn Thiết lập',
      Array.isArray(meta2.bangGia) && meta2.bangGia[0] && meta2.bangGia[0].sanPham.length >= 7,
      JSON.stringify((meta2.bangGia || []).map((b) => b.sanPham.length)));
    /* Nối được Base thì giá PHẢI đến từ Danh mục Tour, không phải bảng cứng trong
     * code — nếu không, sửa giá trong Base mà app vẫn báo số cũ. */
    if (noiBase) {
      t('giá lấy từ Danh mục Tour, không phải bảng cứng trong code',
        meta2.nguonGia === 'danh-muc', String(meta2.nguonGia));
      t('mỗi sản phẩm mang record_id để nối cột liên kết Tour',
        meta2.bangGia[0].sanPham.every((sp) => sp.recordId),
        JSON.stringify(meta2.bangGia[0].sanPham.filter((sp) => !sp.recordId).map((sp) => sp.ten)));
      t('đọc được cả hai bảng danh mục',
        (meta2.danhMuc.ota || []).length > 0 && (meta2.danhMuc.tour || []).length > 0,
        meta2.danhMuc.loi);
    }
  }

  console.log('— bộ lọc');
  r = await get('/api/bookings?kenh=klook&moc=nhanLuc');
  t('lọc theo kênh chỉ ra Klook',
    r.j.rows.every((x) => x.kenh === 'Klook'), String(r.j.rows.length));
  r = await get('/api/bookings?tim=khong-bao-gio-co-chuoi-nay&moc=nhanLuc');
  t('tìm không thấy → 0 dòng', r.j.rows.length === 0);
  r = await get('/api/bookings?trangThai=' + encodeURIComponent('Đã huỷ') + '&moc=nhanLuc');
  t('lọc trạng thái hoạt động', r.j.rows.every((x) => x.trangThai === 'Đã huỷ'));

  console.log('— nguồn dữ liệu: Base vs hàng đợi cục bộ');
  {
    r = await get('/api/bookings?moc=nhanLuc');
    t('trả về đang đọc nguồn nào', ['base', 'hang-doi'].includes(r.j.nguon), String(r.j.nguon));

    r = await get('/api/bookings?moc=nhanLuc&nguon=hang-doi');
    t('ép xem hàng đợi → nguon = hang-doi', r.j.nguon === 'hang-doi', String(r.j.nguon));

    r = await get('/api/bookings?moc=nhanLuc&nguon=base');
    t('xin Base: nối được thì trả base, chưa nối thì nói thẳng chứ không im lặng',
      noiBase ? r.j.nguon === 'base' : (r.j.nguon === 'hang-doi' && !!r.j.loi),
      JSON.stringify({ nguon: r.j.nguon, loi: r.j.loi }));

    r = await get('/api/bookings?moc=nhanLuc&nguon=tu-dau-ra');
    t('nguồn lạ → quay về auto', ['base', 'hang-doi'].includes(r.j.nguon), String(r.j.nguon));

    /* Đệm phải theo TỪNG nguồn: đổi nguồn xong mà vẫn ra dữ liệu nguồn cũ thì
     * người dùng tưởng nút không ăn. */
    const a = (await get('/api/bookings?moc=nhanLuc&nguon=hang-doi')).j.nguon;
    const b2 = (await get('/api/bookings?moc=nhanLuc&nguon=base')).j.nguon;
    const c = (await get('/api/bookings?moc=nhanLuc&nguon=hang-doi')).j.nguon;
    t('đổi nguồn qua lại không bị đệm trả sai', a === 'hang-doi' && c === 'hang-doi',
      [a, b2, c].join(' → '));
  }

  console.log('— chế độ trực tiếp (SSE)');
  {
    /* Không dùng EventSource (không có trong Node) — đọc thẳng luồng để kiểm đúng
     * thứ quan trọng: header đúng chuẩn SSE, và webhook về thì có gói tin bắn ra. */
    const ac = new AbortController();
    const rs = await fetch(B + '/api/su-kien', { signal: ac.signal });
    t('/api/su-kien trả 200', rs.status === 200, String(rs.status));
    t('content-type là text/event-stream',
      /text\/event-stream/.test(rs.headers.get('content-type') || ''),
      String(rs.headers.get('content-type')));
    t('không cho proxy đệm lại', rs.headers.get('x-accel-buffering') === 'no',
      String(rs.headers.get('x-accel-buffering')));

    /* Bơm luồng trong một vòng NỀN rồi mới đi kiểm nội dung.
     * Không được race doc.read() với setTimeout: bỏ dở một read rồi gọi read()
     * tiếp là reader vào trạng thái có-read-đang-chờ, các gói sau lọt hết. */
    const doc = rs.body.getReader();
    const de = new TextDecoder();
    let thu = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await doc.read();
          if (done) break;
          thu += de.decode(value, { stream: true });
        }
      } catch (_) { /* abort() làm read() ném — bình thường */ }
    })();

    /** Chờ tới khi luồng chứa `re`, tối đa `ms`. */
    const cho = async (re, ms) => {
      const het = Date.now() + ms;
      while (Date.now() < het) {
        if (re.test(thu)) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return re.test(thu);
    };

    await cho(/event: mo/, 1500);
    t('mở luồng là nhận ngay gói "mo"', /event: mo/.test(thu), thu.slice(0, 120));
    t('có khai retry để client tự nối lại', /retry: \d+/.test(thu), thu.slice(0, 60));

    /* Bắn một booking THẬT vào webhook rồi xem gói tin có tới không.
     *
     * ⚠️ CHỈ chạy khi app CHƯA nối Base. Webhook là đường ghi thật: nối Base rồi
     * thì mỗi lần chạy test lại đẻ một dòng "SSE-…" vào bảng vận hành, và dọn
     * bằng tay. Nối Base thì chỉ kiểm phần luồng SSE (mở · nhịp tim · đóng),
     * phần bắn tín hiệu để cho lần chạy ở chế độ hàng đợi. */
    if (noiBase) {
      bo('webhook về ⇒ có gói tin bắn ra luồng', 'đang nối Base thật, không ghi dữ liệu test');
    } else {
      const pm = { ...mau.mau('klook'), booking_ref_no: 'SSE-' + Date.now() };
      await post('/webhook/klook', pm);
      await cho(/event: booking/, 4000);
      t('webhook về ⇒ có gói tin "booking" bắn ra luồng', /event: booking/.test(thu), thu.slice(-220));
      t('gói tin KHÔNG chứa số tiền (kênh này không qua bước cắt tiền theo quyền)',
        !/thucNhan|tongTien|hoaHong/.test(thu), thu.slice(-220));
      t('gói tin có đủ thứ để hiện toast', /"kenh"/.test(thu) && /"maBooking"/.test(thu), thu.slice(-220));
    }

    // dryRun KHÔNG được bắn tín hiệu — nó là phép thử, không phải booking thật
    const truocDry = (thu.match(/event: booking/g) || []).length;
    await post('/webhook/viator?dryRun=1', mau.mau('viator'));
    await new Promise((r) => setTimeout(r, 800));
    t('dryRun không bắn tín hiệu',
      (thu.match(/event: booking/g) || []).length === truocDry, String(truocDry));

    ac.abort();
    // đóng xong thì server phải nhả kết nối, mở lại được ngay
    await new Promise((r) => setTimeout(r, 300));
    const rs2 = await fetch(B + '/api/su-kien');
    t('đóng rồi mở lại được', rs2.status === 200, String(rs2.status));
    rs2.body.cancel();

    r = await goi('/api/su-kien', { method: 'POST' });
    t('POST /api/su-kien → 404 (chỉ nhận GET)', r.s === 404, String(r.s));
  }

  console.log('— phân quyền (bảng "Phân quyền app" của lớp vỏ)');
  if (cfg.mode !== 'api') {
    bo('phân quyền theo header', 'app đang chạy chế độ cli — người ngồi trước máy là quản lý');
  } else {
    r = await get('/api/meta', NHAN_SU);
    t('nhân sự KHÔNG có quyền chi phí', r.j.perm && r.j.perm.chiPhi === false, JSON.stringify(r.j.perm));
    t('nhân sự vẫn được sửa booking', r.j.perm.duocSua === true);
    t('không có quyền chi phí ⇒ /api/meta KHÔNG trả bảng giá NET',
      Array.isArray(r.j.bangGia) && r.j.bangGia.length === 0, JSON.stringify((r.j.bangGia || []).length));

    r = await get('/api/bookings?moc=nhanLuc', NHAN_SU);
    const b0 = (r.j.rows || [])[0] || {};
    t('bảng booking bị CẮT các ô tiền ở server',
      !('thucNhan' in b0) && !('tongTien' in b0) && !('hoaHong' in b0) && !('sanPham' in b0),
      JSON.stringify(Object.keys(b0).filter((k) => /tien|Nhan|hoaHong|sanPham|lech/i.test(k))));
    t('khối cộng dồn cũng không còn ô tiền',
      !('thucNhan' in (r.j.tong || {})) && !('tongTien' in (r.j.tong || {})),
      JSON.stringify(Object.keys(r.j.tong || {})));
    /* Cờ "OTA trả THIẾU 200.000đ" có chứa SỐ TIỀN — che tiền mà để lọt cờ này thì
     * vẫn lộ. */
    t('cờ cần xử lý không rò số tiền',
      (r.j.rows || []).every((x) => !/THIẾU|bảng giá|Hoa hồng|Doanh thu/i.test(x.canXuLyChuoi || '')),
      JSON.stringify((r.j.rows || []).map((x) => x.canXuLyChuoi).filter((x) => /THIẾU|bảng giá/i.test(x))));

    r = await get('/api/thongke?moc=nhanLuc', NHAN_SU);
    t('màn Thống kê bị chặn 403', r.s === 403 && r.j.code === 'CHI_PHI_ONLY', r.txt.slice(0, 120));

    r = await goi('/api/export.csv?moc=nhanLuc', { headers: NHAN_SU });
    t('CSV không có cột tiền', !/Thực nhận|Hoa hồng|Tổng tiền/.test(r.txt.split('\r\n')[0]),
      r.txt.split('\r\n')[0].slice(0, 120));

    r = await get('/api/meta', NHAN_SU_CO_TIEN);
    t('cấp quyền chi phí ⇒ thấy tiền + bảng giá',
      r.j.perm.chiPhi === true && (r.j.bangGia || []).length > 0, JSON.stringify(r.j.perm));

    r = await get('/api/bookings?moc=nhanLuc', NHAN_SU_CO_TIEN);
    t('có quyền chi phí ⇒ ô tiền trở lại', 'thucNhan' in ((r.j.rows || [])[0] || {}),
      JSON.stringify(Object.keys((r.j.rows || [])[0] || {}).slice(0, 6)));

    const idThu = ((await get('/api/bookings?moc=nhanLuc', QUAN_LY)).j.rows[0] || {}).id;
    r = await goi('/api/booking/' + idThu, {
      method: 'PATCH', headers: { ...NHAN_SU_CHI_XEM, 'Content-Type': 'application/json' },
      body: JSON.stringify({ diemDon: 'X' }),
    });
    t('người chỉ-xem sửa booking → 403', r.s === 403 && r.j.code === 'CHI_XEM', r.txt.slice(0, 120));

    r = await goi('/api/booking/' + idThu, {
      method: 'PATCH', headers: { ...NHAN_SU, 'Content-Type': 'application/json' },
      body: JSON.stringify({ diemDon: 'Sales dien tay' }),
    });
    t('nhân sự thường vẫn sửa được điểm đón', r.s === 200, r.txt.slice(0, 120));
    t('phản hồi sau khi sửa cũng bị che tiền', !('thucNhan' in (r.j || {})),
      JSON.stringify(Object.keys(r.j || {}).filter((k) => /Nhan|tien/i.test(k))));

    for (const duong of ['/api/luoc-do', '/api/day-hang-doi', '/api/mau']) {
      r = await goi(duong, { method: 'POST', headers: NHAN_SU });
      t('nhân sự gọi ' + duong + ' → 403', r.s === 403 && r.j.code === 'MANAGER_ONLY', r.txt.slice(0, 100));
    }
  }

  console.log('— xuất CSV');
  {
    /* Kiểm BOM ở mức BYTE: res.text() của fetch tự cắt BOM theo chuẩn UTF-8
     * decode, nên đọc bằng text() sẽ luôn "không thấy BOM" dù server có gửi.
     * Thiếu BOM là Excel mở ra hỏng hết tiếng Việt — phải kiểm cho chắc. */
    const res = await fetch(B + '/api/export.csv?moc=nhanLuc');
    const buf = Buffer.from(await res.arrayBuffer());
    t('trả 200', res.status === 200);
    t('có BOM UTF-8 (Excel đọc đúng tiếng Việt)',
      buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF,
      [buf[0], buf[1], buf[2]].join(' '));
    const dong1 = buf.toString('utf8').replace(/^﻿/, '').split('\r\n')[0];
    // 19 cột vận hành + 5 cột tiền (chỉ khi người xem có quyền chi phí)
    t('24 cột tiêu đề (có quyền chi phí)', dong1.split(',').length === 24, String(dong1.split(',').length));
    t('có cột "Sản phẩm (bảng giá)" và "Chênh lệch bảng giá"',
      /Sản phẩm \(bảng giá\)/.test(dong1) && /Chênh lệch bảng giá/.test(dong1), dong1.slice(0, 200));
    t('tiêu đề có cột "Cần xử lý"', /Cần xử lý/.test(dong1), dong1.slice(0, 80));
  }

  console.log('— API không có');
  r = await get('/api/khong-co-that');
  t('→ 404', r.s === 404);

  console.log(`\n${pass} pass · ${fail} fail${boQua ? ' · ' + boQua + ' bỏ qua' : ''}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('LỖI TEST:', e.stack); process.exit(1); });
