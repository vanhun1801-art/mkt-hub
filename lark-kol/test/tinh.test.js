'use strict';
/* Quy tắc nghiệp vụ — chạy offline, không đụng Base. node test/tinh.test.js */
const assert = require('assert');
const T = require('../tinh');
const EM = require('../mau-email');

let dat = 0, hong = 0;
function ta(ten, fn) {
  try { fn(); dat++; console.log('  ok  ' + ten); } catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + e.message); }
}

/* Ca Châu Kim Cương — đúng như Base mẫu (4 NL + 2 TE). */
const CKC = [
  { ten: 'Cáp treo Hòn Thơm — Người lớn', nhom: 'Tour', loaiKhach: 'Người lớn', soLuong: 4, demLuot: 1, hinhThuc: 'FOC đối tác', donGiaChi: 0, giaCongBo: 1370000 },
  { ten: 'Cáp treo Hòn Thơm — Trẻ em', nhom: 'Tour', loaiKhach: 'Trẻ em', soLuong: 2, demLuot: 1, hinhThuc: 'FOC đối tác', donGiaChi: 0, giaCongBo: null },
  { ten: 'Lưu trú Devesun', nhom: 'Lưu trú', loaiKhach: 'Phòng', soLuong: 1, demLuot: 2, hinhThuc: 'Công ty chi', donGiaChi: 2100000 },
  { ten: 'Tour Land 5 — Người lớn', nhom: 'Tour', loaiKhach: 'Người lớn', soLuong: 4, demLuot: 1, hinhThuc: 'Công ty chi', donGiaChi: 550000 },
  { ten: 'Tour Land 5 — Trẻ em', nhom: 'Tour', loaiKhach: 'Trẻ em', soLuong: 2, demLuot: 1, hinhThuc: 'Công ty chi', donGiaChi: 275000 },
  { ten: 'Ăn tối Việt Xưa — Em bé', nhom: 'Ăn uống', loaiKhach: 'Em bé', soLuong: 1, demLuot: 1, hinhThuc: 'FOC đối tác', donGiaChi: 0 },
];

console.log('tiền');
ta('tiền công ty chi của ca mẫu = 6.950.000 (không phải 7.500.000 của bảng kê cũ)', () => {
  assert.strictEqual(T.tongHopTac(CKC).tienCongTy, 6950000);
});
ta('FOC không cộng vào tiền công ty chi nhưng có trong giá trị quy đổi', () => {
  const t = T.tongHopTac(CKC);
  assert.strictEqual(t.giaTriFOC, 4 * 1370000);
  assert.strictEqual(t.giaTriQuyDoi, 6950000 + 4 * 1370000);
});
ta('dòng FOC thiếu giá công bố được đếm (em bé thì không)', () => {
  assert.strictEqual(T.tongHopTac(CKC).thieuGia, 1);
});
ta('dòng Huỷ không tính tiền', () => {
  assert.strictEqual(T.tongHopTac([{ ...CKC[2], tinhTrang: 'Huỷ' }]).tienCongTy, 0);
});
ta('Đêm/Lượt trống coi là 1', () => {
  assert.strictEqual(T.thanhTien({ soLuong: 3, demLuot: null, hinhThuc: 'Công ty chi', donGiaChi: 100 }), 300);
});
ta('em bé mặc định miễn phí', () => { assert.strictEqual(T.giaGoiY('Em bé', 900000, 450000), 0); });
ta('số lượng gợi ý theo loại khách', () => {
  const ht = { nguoiLon: 4, treEm: 2, emBe: 1 };
  assert.deepStrictEqual(['Người lớn', 'Trẻ em', 'Em bé', 'Phòng'].map((l) => T.slGoiY(l, ht)), [4, 2, 1, 1]);
});

console.log('thời gian');
ta('số đêm 11/07 → 13/07 = 2', () => { assert.strictEqual(T.soDem(T.tuChuoi('2026-07-11'), T.tuChuoi('2026-07-13')), 2); });
ta('choBase ghi giờ Việt Nam', () => { assert.strictEqual(T.choBase(T.tuChuoi('2026-07-12T08:30')), '2026-07-12 08:30:00'); });
ta('23:30 giờ VN vẫn là cùng ngày', () => { assert.strictEqual(T.ngayCua(T.tuChuoi('2026-07-12T23:30')), '2026-07-12'); });

console.log('bước');
ta('chưa duyệt thì không gửi thư mời được', () => {
  assert.ok(T.duocLam({ buoc: 'Chờ BGĐ duyệt' }, 'guiThuMoi'));
  assert.strictEqual(T.duocLam({ buoc: 'BGĐ đã duyệt' }, 'guiThuMoi'), '');
});
ta('chưa chốt bảng kê thì chưa trình BGĐ được', () => {
  assert.ok(/chốt/.test(T.duocLam({ buoc: 'Đang trao đổi' }, 'trinhBgd')));
  assert.strictEqual(T.duocLam({ buoc: 'Đang trao đổi', chotLuc: 1 }, 'trinhBgd'), '');
});
ta('huỷ rồi thì chặn mọi việc', () => { assert.ok(T.duocLam({ buoc: 'Huỷ' }, 'trinhBgd')); });
ta('tới ngày đi thì Đã tạo tour Tourwell → Đang đi tour; qua ngày về → Chờ nhận sản phẩm', () => {
  const ht = { buoc: 'Đã tạo tour Tourwell', batDau: T.tuChuoi('2026-07-11'), ketThuc: T.tuChuoi('2026-07-13') };
  assert.strictEqual(T.buocTheoLich(ht, T.tuChuoi('2026-07-10T20:00')), '');
  assert.strictEqual(T.buocTheoLich(ht, T.tuChuoi('2026-07-11T06:00')), 'Đang đi tour');
  assert.strictEqual(T.buocTheoLich(ht, T.tuChuoi('2026-07-13T22:00')), 'Đang đi tour');
  assert.strictEqual(T.buocTheoLich(ht, T.tuChuoi('2026-07-14T06:00')), 'Chờ nhận sản phẩm');
  assert.strictEqual(T.buocTheoLich({ ...ht, buoc: 'Đã mời KOL' }, T.tuChuoi('2026-07-12')), '', 'chưa xác nhận thì không tự trôi');
});

ta('lùi bước: bỏ mốc của bước đang đứng; lùi vào khoảng đi tour thì khoá tự chuyển', () => {
  assert.deepStrictEqual(T.lui({ buoc: 'BGĐ đã duyệt' }), { buoc: 'Chờ BGĐ duyệt', xoa: { duyetLuc: null, nguoiDuyet: '', kenhDuyet: null } });
  assert.deepStrictEqual(T.lui({ buoc: 'Chờ BGĐ duyệt' }).xoa, { trinhLuc: null });
  assert.strictEqual(T.lui({ buoc: 'Đang trao đổi' }), null);
  const l = T.lui({ buoc: 'Đang đi tour' });
  assert.strictEqual(l.buoc, 'Đã tạo tour Tourwell'); assert.strictEqual(l.xoa.khongTuChuyen, true);
  assert.strictEqual(T.buocTheoLich({ buoc: 'Đã tạo tour Tourwell', khongTuChuyen: true, batDau: 1, ketThuc: 2 }, T.tuChuoi('2026-07-12')), '');
});
ta('lùi từ Huỷ về đúng bước trước lúc huỷ (đọc Lịch sử bước)', () => {
  const ls = [T.dongLichSu('', 'Đang trao đổi', 'tạo', 0), T.dongLichSu('Đang trao đổi', 'Chờ BGĐ duyệt', 'gửi', 1), T.dongLichSu('Chờ BGĐ duyệt', 'Huỷ', 'huỷ', 2)].join('\n');
  assert.strictEqual(T.lui({ buoc: 'Huỷ', lichSu: ls }).buoc, 'Chờ BGĐ duyệt');
  assert.strictEqual(T.lui({ buoc: 'Huỷ', lichSu: '' }).buoc, 'Đang trao đổi');
});
ta('hợp tác FOC: đối tác đồng ý → FOC 0đ, từ chối → Công ty chi', () => {
  assert.deepStrictEqual(T.theoFoc('Đối tác đồng ý'), { hinhThuc: 'FOC đối tác', donGiaChi: 0 });
  assert.deepStrictEqual(T.theoFoc('Đối tác từ chối'), { hinhThuc: 'Công ty chi' });
  assert.deepStrictEqual(T.theoFoc('Đã gửi đề xuất'), {});
});
ta('cảnh báo số khách lạ (ca thật: gõ 40 trẻ em)', () => {
  assert.ok(T.canhBaoKhach({ nguoiLon: 2, treEm: 40, emBe: 0 }));
  assert.ok(T.canhBaoKhach({ nguoiLon: 0, treEm: 1, emBe: 0 }));
  assert.strictEqual(T.canhBaoKhach({ nguoiLon: 4, treEm: 2, emBe: 1 }), '');
});

console.log('số điện thoại');
const MV = require('../public/ma-vung');
ta('danh sách mã vùng đủ rộng và không trùng ISO', () => {
  assert.ok(MV.DS.length > 180);
  assert.strictEqual(new Set(MV.DS.map((x) => x.iso)).size, MV.DS.length);
});
for (const [vao, ma, ra, coLoi] of [
  ['0778 866 707', '84', '+84778866707', false], ['(+84) 778866707', '84', '+84778866707', false],
  ['84778866707', '84', '+84778866707', false], ['+82 10-1234-5678', '84', '+821012345678', false],
  ['0O78 866 7O7', '84', '+8478866707', true], ['077886670', '84', '+8477886670', true],
  ['０７７８８６６７０７', '84', '+84778866707', false], ['0086 138 0013 8000', '', '+8613800138000', false],
]) {
  ta('"' + vao + '" → ' + ra + (coLoi ? ' (báo lỗi)' : ''), () => {
    const c = MV.chuan(vao, ma);
    assert.strictEqual(c.quocTe, ra); assert.strictEqual(!!c.loi, coLoi, c.loi);
  });
}

console.log('nhắc hẹn');
const moc = { id: 'a', nhacHen: true, gioHen: T.tuChuoi('2026-07-12T14:00'), tinhTrang: 'Chờ' };
ta('nhắc trong cửa sổ 60 phút', () => {
  assert.ok(T.canNhac(moc, T.tuChuoi('2026-07-12T13:05'), 60));
  assert.ok(!T.canNhac(moc, T.tuChuoi('2026-07-12T12:55'), 60), 'sớm quá');
  assert.ok(!T.canNhac(moc, T.tuChuoi('2026-07-12T14:01'), 60), 'qua giờ rồi');
  assert.ok(!T.canNhac({ ...moc, daNhac: 1 }, T.tuChuoi('2026-07-12T13:30'), 60), 'đã nhắc');
  assert.ok(!T.canNhac({ ...moc, nhacHen: false }, T.tuChuoi('2026-07-12T13:30'), 60), 'không bật nhắc');
});
ta('mốc đang diễn ra = mốc gần nhất đã qua trong ngày', () => {
  const ds = [{ id: 'x', gioHen: T.tuChuoi('2026-07-12T08:00') }, { id: 'y', gioHen: T.tuChuoi('2026-07-12T18:00') }];
  const tt = T.trangThaiLich(ds, T.tuChuoi('2026-07-12T10:00'));
  assert.strictEqual(tt.get('x'), 'dang');
  assert.strictEqual(tt.get('y'), 'sap');
});
ta('tin nhắc KOL có giờ, tên gọn, xưng hô', () => {
  const t = T.tinNhacKol({ ten: 'Tour Land 5 — Người lớn', gioHen: moc.gioHen, diemHen: 'sảnh Devesun' }, {}, { ten: 'Châu Kim Cương' });
  assert.ok(t.includes('14:00') && t.includes('Tour Land 5 tại sảnh Devesun') && !t.includes('Người lớn') && t.includes('chị Cương'), t);
});

ta('tin nhắc dùng Xưng hô + Tên gọi của bảng KOL (không cắt còn chữ cuối)', () => {
  const t = T.tinNhacKol({ ten: 'Tour', gioHen: moc.gioHen }, {}, { ten: '[TEST] Kim Min Ji', xungHo: 'Chị', tenGoi: 'Min Ji' });
  assert.ok(t.includes('chị Min Ji'), t);
  const a = T.tinNhacKol({ ten: 'Tour', gioHen: moc.gioHen }, {}, { ten: 'Trần Văn Nam', xungHo: 'Anh' });
  assert.ok(a.includes('anh Nam'), a);
});
ta('tin bot nhắn anh không có dòng trống thừa', () => {
  const tin = require('../nhac').tinMoc([{ ten: 'Tour — Người lớn', gioHen: moc.gioHen, loaiKhach: 'Người lớn', soLuong: 2 }], { ma: 'KOL-1' }, { ten: 'A' });
  assert.ok(!/\n\n\n/.test(tin) && tin.split('\n\n').length === 2, JSON.stringify(tin));
});

console.log('bàn giao');
ta('quá hạn đăng tính theo ngày (hết hạn hôm nay chưa trễ)', () => {
  const b = { trangThai: 'Chưa làm', hanDang: T.tuChuoi('2026-07-20') };
  assert.strictEqual(T.trangThaiBanGiao(b, T.tuChuoi('2026-07-20T22:00')).ma, 'cho');
  assert.strictEqual(T.trangThaiBanGiao(b, T.tuChuoi('2026-07-21T01:00')).ma, 'tre');
});
ta('đã đăng 7 ngày chưa nhập số → nhắc 7N; nhập rồi mà tới 30 ngày → nhắc 30N', () => {
  const b = { trangThai: 'Đã đăng', ngayDang: T.tuChuoi('2026-07-20') };
  assert.strictEqual(T.trangThaiBanGiao(b, T.tuChuoi('2026-07-26')).ma, 'dang');
  assert.strictEqual(T.trangThaiBanGiao(b, T.tuChuoi('2026-07-27')).ma, 'do-7');
  assert.strictEqual(T.trangThaiBanGiao({ ...b, nhap7: 1 }, T.tuChuoi('2026-08-19')).ma, 'do-30');
});
ta('chi phí / 1.000 lượt xem', () => {
  const k = T.ketQua({}, CKC, [{ trangThai: 'Đã đăng', soLuong: 1, xem7: 100000, xem30: 250000 }, { trangThai: 'Chưa làm', soLuong: 2 }]);
  assert.strictEqual(k.xem, 250000);
  assert.strictEqual(k.cpm, Math.round(6950000 / 250000 * 1000));
  assert.strictEqual(k.daDang, 1); assert.strictEqual(k.camKet, 3);
});

console.log('linh tinh');
ta('mã hợp tác tăng dần theo năm', () => { assert.strictEqual(T.maMoi(['KOL-2026-001', 'KOL-2026-007', 'KOL-2025-020'], 2026), 'KOL-2026-008'); });
ta('số điện thoại về dạng quốc tế', () => {
  assert.strictEqual(T.sdtQuocTe('0778 866 707', '+84'), '+84778866707');
  assert.strictEqual(T.sdtQuocTe('(+84) 778866707', '+84'), '+84778866707');
  assert.strictEqual(T.sdtQuocTe('010-1234-5678', '+82'), '+821012345678');
});

console.log('email');
const goi = {
  ht: { ma: 'KOL-2026-001', nguoiLon: 4, treEm: 2, emBe: 0, batDau: T.tuChuoi('2026-07-11'), ketThuc: T.tuChuoi('2026-07-13'), kenhDang: 'TikTok: Mẹ ZinZon', yeuCau: 'Gắn thẻ #RootyTrip' },
  kol: { ten: 'Châu Kim Cương', quocGia: 'Việt Nam', email: 'x@y.com', sdt: '+84778866707', xungHo: 'Chị', tenGoi: 'Cương', tongTheoDoi: 607000 },
  kenh: [{ nenTang: 'TikTok', ten: 'Mẹ ZinZon', theoDoi: 520000 }],
  hm: CKC.map((h) => ({ ...h, ngay: T.tuChuoi(h.ten.includes('Land') ? '2026-07-12' : '2026-07-11') })),
  bg: [{ ten: 'Video trải nghiệm Vinwonders', chuDe: 'Vinwonders', soLuong: 1, nenTang: ['TikTok'] }],
};
const cfgMail = { bgdTo: 'ceo@rootytrip.com', bgdTen: 'Ban Giám Đốc' };
ta('email trình BGĐ có bảng kê và tổng đúng', () => {
  const m = EM.deXuat(goi, cfgMail);
  assert.strictEqual(m.den, 'ceo@rootytrip.com');
  assert.ok(m.tieuDe.endsWith('CHÂU KIM CƯƠNG'));
  assert.ok(m.html.includes('6.950.000') && m.html.includes('Bảng kê') && m.html.includes('04 người lớn; 02 trẻ em'));
});
ta('thư mời KOL KHÔNG lộ giá, có xưng hô', () => {
  const m = EM.thuMoi(goi);
  assert.ok(!/550\.000|6\.950\.000|2\.100\.000/.test(m.html), 'thư mời không được có tiền');
  assert.ok(m.html.includes('đến chị Cương'), 'giữa câu viết thường');
  assert.ok(m.html.includes('>Chị Cương vui lòng'), 'đầu câu viết hoa');
  assert.strictEqual(m.den, 'x@y.com');
  assert.ok(m.tieuDe.includes('CHỊ CHÂU KIM CƯƠNG'));
});
ta('dòng NL/TE cùng dịch vụ gộp thành một trong nội dung tài trợ', () => {
  const m = EM.thuMoi(goi);
  assert.strictEqual((m.html.match(/Tour Land 5/g) || []).length, 1);
});
ta('tên có ký tự HTML bị thoát', () => {
  const m = EM.thuMoi({ ...goi, kol: { ...goi.kol, ten: '<b>x</b>' } });
  assert.ok(!m.html.includes('<b>x</b>'));
});

ta('kênh đăng lấy từ bàn giao (thay ô gõ tay)', () => {
  const kenh = [{ id: 'k1', nenTang: 'TikTok', ten: 'Mẹ ZinZon' }, { id: 'k2', nenTang: 'Facebook', ten: "ZinZon's Family", reup: true }];
  const m = EM.thuMoi({ ...goi, kenh, bg: [{ ten: 'Video', chuDe: 'A', soLuong: 1, kenhDang: ['k1', 'k2'] }] });
  assert.ok(m.html.includes('TikTok · Mẹ ZinZon') && m.html.includes('(re-up)'), 'thiếu tên kênh');
});
ta('thư đề xuất hợp tác FOC: đúng đối tác, không lộ giá, có quyền lợi trả đối tác', () => {
  const hm = [{ ten: 'Cáp treo — Người lớn', nhaCungCap: 'Sun World', loaiKhach: 'Người lớn', soLuong: 4, ngay: T.tuChuoi('2026-07-11'), donGiaChi: 0, giaCongBo: 1370000 }];
  const bg = [{ ten: 'Video Hòn Thơm', traDoiTac: 'Sun World', soLuong: 1 }, { ten: 'Video khác', traDoiTac: 'Vinpearl' }];
  const m = EM.xinFoc({ ...goi, hm, bg, kenh: [], doiTac: { email: 'mkt@sun.vn', lienHe: 'Chị Lan' }, tenDoiTac: 'Sun World' }, cfgMail);
  assert.strictEqual(m.den, 'mkt@sun.vn');
  assert.ok(m.html.includes('Video Hòn Thơm') && !m.html.includes('Video khác'));
  assert.ok(!/1\.370\.000/.test(m.html), 'không được lộ giá');
  assert.ok(m.tieuDe.includes('SUN WORLD'));
});
ta('cắt phần trích thư cũ khỏi thư trả lời', () => {
  const tl = require('../theo-doi-mail').catTrich('OK em, duyệt nhé.\n\nVào 09/07/2026 Lê Văn Hùng đã viết:\n> Kính gửi BGĐ');
  assert.strictEqual(tl, 'OK em, duyệt nhé.');
  assert.strictEqual(require('../theo-doi-mail').catTrich('Dạ chị đồng ý\nOn Tue, X wrote:\n> abc'), 'Dạ chị đồng ý');
});
ta('tìm thread_id trong kết quả +triage theo tiêu đề', () => {
  const td = require('../theo-doi-mail').timThread({ items: [{ subject: 'Khác', thread_id: 'a' }, { subject: 'ĐỀ XUẤT HỢP TÁC x KIM', thread_id: 'b' }] }, 'ĐỀ XUẤT HỢP TÁC x KIM');
  assert.deepStrictEqual(td, ['b']);
});

console.log('\n' + dat + ' đạt · ' + hong + ' hỏng');
process.exit(hong ? 1 : 0);
