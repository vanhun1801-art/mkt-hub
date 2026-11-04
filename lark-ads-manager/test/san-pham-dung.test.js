/**
 * Đơn ghép về quảng cáo có MUA ĐÚNG sản phẩm quảng cáo đó bán không
 * (sync/sanpham.js + phần nối trong sync/roas.js). Chỉ logic, không gọi mạng.
 *
 * Mẫu lấy từ đơn thật soát ngày 04/11/2026: bốn đơn ghi cho quảng cáo
 * "PITO Hotel_COMBOPITO4N3D" không đơn nào có PITO; đơn có PITO duy nhất là
 * RT18228 (CB3N + KS Aurora + KS PITO).
 */
const sp = require('../sync/sanpham');
const roas = require('../sync/roas');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

console.log('— mã sản phẩm rút từ tên dịch vụ');
[
  ['*G4 - TOUR GHÉP THAM QUAN ĐẢO BẰNG CANO', 'G4'],
  ['*CB1N - DỊCH VỤ THAM QUAN TRONG NGÀY', 'CB1N'],
  ['*GLAND_VIN_SAF - TOUR GHÉP THAM QUAN VINWONDERS & SAFARI', 'GLANDVINSAF'],
  ['*G2CHONTHOM - TOUR GHÉP THAM QUAN HÒN THƠM', 'G2CHONTHOM'],
  ['*VÉ NIGHT PARADISE', ''],            // chữ thường, không phải mã
  ['*VÉ DINNER SHOW', ''],
  ['Tên khách sạn PITO HOTEL HÒN THƠM', ''],
].forEach(([vao, ra]) => t(`${vao} → "${ra}"`, sp.maTuTen(vao) === ra, sp.maTuTen(vao)));

console.log('— tên khách sạn');
[
  ['Tên khách sạn PITO HOTEL HÒN THƠM', 'PITO'],
  ['Tên khách sạn KS AURORA GRAND WORLD HOTEL', 'AURORA'],
  ['SEASON HOTEL', 'SEASON'],
  ['Tên khách sạn WYNDHAM GARDEN - COMMIT 3000', 'WYNDHAM'],
].forEach(([vao, ra]) => {
  const k = sp.khoaDichVu({ loai: 'Khách sạn', ten: vao });
  t(`${vao} → ${ra}`, k.khoa === ra && k.kieu === 'ks', JSON.stringify(k));
});
t('vé máy bay không có khoá', sp.khoaDichVu({ loai: 'Vé máy bay', ten: 'Vé máy bay' }).khoa === '');

console.log('— đọc đơn Tourwell thô');
/* Hình dạng THẬT, chép từ RT18228 và RT18277 (đọc API 04/11/2026). Bẫy đã gặp:
 * tour ghép để mã ở item_info.name, description chỉ là "Tour ghép khách";
 * financial_summary.total_amount bằng 0 ở mọi dịch vụ. */
const fs0 = { total_amount: 0, total_amount_cost: 0, total_amount_profit: '5,555,556' };
const tho = {
  services: [
    { service_info: { name: 'Combo du lịch' }, financial_summary: fs0,
      item_info: { name: 'Combo du lịch', description: '*CB3N - DỊCH VỤ THAM QUAN TRỌN GÓI' },
      prices: [{ object: { title: 'DỊCH VỤ THAM QUAN TRỌN GÓI 3N2Đ' }, grand_total: { original: '24,100,000', forex: 0 } },
        { object: { title: 'NGƯỜI LỚN' }, grand_total: { original: '0', forex: 0 } }] },
    { service_info: { name: 'Khách sạn' }, financial_summary: fs0,
      item_info: { name: 'Khách sạn tại Việt Nam', description: 'Tên khách sạn PITO HOTEL HÒN THƠM' },
      prices: [{ object: { title: 'DỊCH VỤ ĐẶT PHÒNG KHÁCH SẠN PITO' }, grand_total: { original: '6,000,000', forex: 0 } }] },
    { service_info: { name: 'Tour ghép lẻ' }, financial_summary: fs0,
      item_info: { name: '*G4 - TOUR GHÉP THAM QUAN ĐẢO BẰNG CANO', description: 'Tour ghép khách',
        tour_info: { code: 'TD21884', name: '*G4 - TOUR GHÉP THAM QUAN ĐẢO BẰNG CANO' } },
      prices: [{ object: { title: 'Người lớn' }, grand_total: { original: '2,100,000', forex: 0 } },
        { object: { title: 'Trẻ em (1m < 1m4)' }, grand_total: { original: '350,000', forex: 0 } }] },
    { service_info: { name: 'Vé máy bay' }, item_info: {} },
  ],
};
const dv = sp.dichVuTuDonTho(tho);
t('bốn dịch vụ', dv.length === 4, dv.length);
t('CB3N có mã, tiền = cộng grand_total', dv[0].khoa === 'CB3N' && dv[0].tien === 24100000, JSON.stringify(dv[0]));
t('PITO là khách sạn, tiền 6 triệu', dv[1].khoa === 'PITO' && dv[1].kieu === 'ks' && dv[1].tien === 6000000, JSON.stringify(dv[1]));
t('tour ghép lấy mã G4 từ item_info.name', dv[2].khoa === 'G4' && dv[2].tien === 2450000, JSON.stringify(dv[2]));
t('total_amount = 0 không bị đọc thành tiền 0', dv[0].tien !== 0);
t('không có dòng giá thì tiền là null, không phải 0', dv[3].tien === null);
t('không bao giờ ra [object Object]', !JSON.stringify(dv).includes('[object'));

console.log('— đoán sản phẩm từ tên quảng cáo');
const td = { ma: new Set(['G4', 'G2', 'G2CHONTHOM', 'CB1N', 'CB3N', 'CT7']), ks: new Set(['PITO', 'SEASON', 'AURORA']) };
const doan = (...x) => sp.doanTuTen(x, td).sort().join(',');
t('COMBOPITO4N3D → PITO', doan('PITO Hotel_COMBOPITO4N3D_26102026', 'Khách đoàn_COMBOPITO4N3D', 'COMBOPITO4N3D') === 'PITO');
t('G2 không khớp nhầm trong G2CHONTHOM', doan('Tour G2CHONTHOM') === 'G2CHONTHOM');
t('#CT7 khớp theo từ', doan('Chỉ từ 6 củ #CT7 #RootyTrip') === 'CT7');
t('Daily_Tour Đảo không đoán bừa', doan('Daily_Tour Đảo') === '');

console.log('— xếp đơn');
const don = (ma, tien, ...dvs) => ({ ma, tien, dichVu: dvs.map(([khoa, kieu, t2 = null]) => ({ khoa, kieu, ten: khoa, tien: t2 })) });
const RT18322 = don('RT18322', 11150000, ['CB1N', 'ma']);
const RT18277 = don('RT18277', 2800000, ['G4', 'ma'], ['CB1N', 'ma']);
const RT18228 = don('RT18228', 35200000, ['CB3N', 'ma', 20000000], ['AURORA', 'ks', 8000000], ['PITO', 'ks', 7200000]);
const chiPito = don('X1', 9000000, ['PITO', 'ks'], ['', '']);   // PITO + vé bay
t('CB1N dưới quảng cáo PITO là mua thứ khác', sp.xepDon(RT18322, ['PITO']).nhom === 'khac');
t('G4+CB1N dưới quảng cáo G4 là có kèm', sp.xepDon(RT18277, ['G4']).nhom === 'kem');
const x28 = sp.xepDon(RT18228, ['PITO']);
t('RT18228 dưới quảng cáo PITO là có kèm', x28.nhom === 'kem');
t('…và chỉ cộng tiền đêm PITO', x28.tienDung === 7200000, x28.tienDung);
t('PITO + vé bay (không khoá) là đúng sản phẩm', sp.xepDon(chiPito, ['PITO']).nhom === 'dung');
t('kèm mà không tách được tiền thì null, không bịa', sp.xepDon(RT18277, ['G4']).tienDung === null);
t('quảng cáo chưa biết bán gì', sp.xepDon(RT18322, []).nhom === 'chua-khai');
t('đơn bản Excel (không dịch vụ)', sp.xepDon({ ma: 'E', tien: 1 }, ['PITO']).nhom === 'khong-ro');

console.log('— nối trong roas.tinh()');
const data = {
  campaigns: [{ id: 'c1', name: 'PITO Hotel_COMBOPITO4N3D_26102026', productIds: [] }],
  groups: [{ id: 'g1', name: 'Khách lẻ_COMBOPITO4N3D', campaignId: 'c1' }],
  ads: [{ id: 'a1', name: 'COMBOPITO4N3D', groupId: 'g1', extId: '52534656518706', platform: 'Facebook' }],
  daily: [{ adId: 'a1', date: '2026-10-30', spend: 1500000, platform: 'Facebook' }],
  products: [],
};
data.cMap = { c1: data.campaigns[0] }; data.gMap = { g1: data.groups[0] }; data.aMap = { a1: data.ads[0] }; data.pMap = {};
const kq = roas.tinh({
  posRows: [{ leadId: 2520, adId: '52534656518706' }],
  leadRows: [{ id: 2520, ma: 'LU2520', kh: 'K1', ngay: '2026-10-31' }],
  donRows: [
    { ...RT18322, kh: 'K1', ngay: '2026-11-01', thu: 1000000 },
    { ...RT18228, kh: 'K1', ngay: '2026-11-02', thu: 0 },
    // khách khác, có dịch vụ PITO, để từ điển biết PITO là khách sạn
  ],
  data, from: '2026-10-26', to: '2026-11-03',
});
const r = kq.rows[0] || {};
t('doanh thu ghi công không đổi (cả hai đơn)', r.tien === 11150000 + 35200000, r.tien);
t('sản phẩm đoán ra PITO', r.sanPham && r.sanPham.tuKhoa.join() === 'PITO' && r.sanPham.nguon === 'doan', JSON.stringify(r.sanPham));
t('1 đơn kèm, 1 đơn khác', r.sanPham.kem === 1 && r.sanPham.khac === 1 && r.sanPham.dung === 0);
t('tiền đúng sản phẩm = đêm PITO', r.sanPham.tienDung === 7200000, r.sanPham.tienDung);
t('ROAS đúng sản phẩm', Math.abs(r.roasDungSP - 7200000 / 1500000) < 1e-9, r.roasDungSP);
t('khách mua gì có CB1N', r.sanPham.muaGi.some((m) => m.khoa === 'CB1N'));
const g = kq.ghiCongDon.find((x) => x.ma === 'RT18322');
t('ghiCongDon mang nhãn khopSP', g && g.khopSP === 'khac', JSON.stringify(g));
t('tổng tiền đúng sản phẩm', kq.tong.tienDungSP === 7200000, kq.tong.tienDungSP);

console.log('— khai ở Base thắng đoán');
const data2 = JSON.parse(JSON.stringify(data));
data2.products = [{ id: 'p1', code: 'CB1N', name: 'CB1N' }];
data2.campaigns[0].productIds = ['p1'];
data2.cMap = { c1: data2.campaigns[0] }; data2.gMap = { g1: data2.groups[0] }; data2.pMap = { p1: data2.products[0] };
const m2 = sp.sanPhamTheoQC(data2, td);
t('chiến dịch nối sản phẩm CB1N thì lấy CB1N, nguồn khai', (m2.get('52534656518706') || {}).tuKhoa.join() === 'CB1N'
  && m2.get('52534656518706').nguon === 'khai');

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
