'use strict';
/**
 * Phiếu TĂNG CA (15/10/2026).
 *
 * Nộp báo cáo ngày xong, tối tăng ca rồi chọn Ca để báo phần làm thêm: trước đây
 * là SỬA lại phiếu ngày, không có bản ghi tăng ca và không báo nhóm (Danh Minh
 * Trường 10/10). Anh Hùng chốt: phiếu riêng, báo nhóm riêng, phút cộng vào ngày.
 *
 * Chạy trên một Base GIẢ trong bộ nhớ, không gọi Lark.
 * Chạy: node test/tang-ca.test.js
 */
const path = require('path');

process.env.LARK_MODE = 'cli';
const cfg = require('../config');
const F = cfg.fields;

/* ---- Base giả: hai bảng, giữ bản ghi theo dạng { record_id, cells } ---- */
const bang = { [cfg.phieuTableId]: [], [cfg.dongTableId]: [] };
let soId = 0;
const gia = {
  listAllRecords: async (t) => bang[t].map((r) => ({ record_id: r.record_id, cells: Object.assign({}, r.cells) })),
  createRecord: async (cells, t) => { const r = { record_id: 'rec' + (++soId), cells: Object.assign({}, cells) }; bang[t || cfg.phieuTableId].push(r); return r; },
  createMany: async (ds, t) => ds.map((cells) => { const r = { record_id: 'rec' + (++soId), cells: Object.assign({}, cells) }; bang[t].push(r); return r; }),
  updateRecord: async (id, cells, t) => { const r = bang[t || cfg.phieuTableId].find((x) => x.record_id === id); Object.assign(r.cells, cells); return r; },
  updateMany: async (m, t) => { for (const [id, cells] of Object.entries(m)) { const r = bang[t].find((x) => x.record_id === id); if (r) Object.assign(r.cells, cells); } },
  deleteRecords: async (ids, t) => { bang[t] = bang[t].filter((x) => !ids.includes(x.record_id)); },
};
require.cache[path.join(__dirname, '..', 'lark.js')] = { id: 'lark', filename: 'lark', loaded: true, exports: gia };

const kho = require('../kho');
const K = require('../ky');
const TB = require('../thong-bao-nhom');

let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  PASS ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (vi !== undefined ? '\n        ' + JSON.stringify(vi) : '')); }
};

(async () => {
  const nguoi = { id: 'ou_truong', email: 'truong@rootytrip.com', ten: 'Danh Minh Trường' };
  /* 10/10/2026 trưa giờ VN — ngày thật của ca đã gặp */
  const ngay = Date.parse('2026-10-10T12:00:00+07:00');

  const r1 = await kho.luuNgay({ nguoi, ngayMs: ngay, ca: 'ngay', nop: true,
    dong: [{ congViec: 'Chỉnh ảnh tour', nhom: 'Chỉnh ảnh', phut: 480, tienDoPt: 100, trangThai: 'Hoàn thành' }] });
  kho.xoaDem();
  const r2 = await kho.luuNgay({ nguoi, ngayMs: ngay, ca: 'tangCa', nop: true,
    dong: [{ congViec: 'Chỉnh ảnh và video tối', nhom: 'Chỉnh ảnh', phut: 60, tienDoPt: 100, trangThai: 'Hoàn thành' }] });
  kho.xoaDem();

  ok('phiếu tăng ca có mã riêng, đuôi -tc', r2.ma === r1.ma + kho.DUOI_TC, [r1.ma, r2.ma]);
  ok('lần nộp tăng ca đầu tiên là lần 1, nên báo nhóm được', r2.soLanNop === 1, r2.soLanNop);
  ok('kết quả nộp mang cờ tăng ca', r2.tangCa === true);
  ok('phiếu tăng ca không có định mức riêng', K.dinhMuc('tangCa', 300) === 0);

  const tatCa = await kho.dsPhieu({}, true);
  ok('Base có HAI phiếu: ngày và tăng ca', tatCa.length === 2, tatCa.map((x) => x.ma));
  const dongNgay = await kho.dsDong({ maPhieu: r1.ma }, true);
  ok('phiếu ngày giữ nguyên dòng việc của nó', dongNgay.length === 1 && dongNgay[0].phut === 480, dongNgay);

  const ngayDs = await kho.dsPhieu({ loaiKy: 'ngay' }, true);
  ok('lọc phiếu ngày chỉ ra MỘT phiếu cho ngày đó (không đếm thành hai ngày)', ngayDs.length === 1, ngayDs.map((x) => x.ma));
  ok('phút tăng ca cộng vào phiếu ngày', ngayDs[0].tongPhut === 540 && ngayDs[0].phutTangCa === 60, ngayDs[0]);
  ok('% hoàn thành của ngày tính cả tăng ca', ngayDs[0].phanTram === Math.round(540 / 480 * 100), ngayDs[0].phanTram);
  ok('kèm tăng ca khi liệt kê', (await kho.dsPhieu({ loaiKy: 'ngay', kemTangCa: true }, true)).length === 2);

  const th = await kho.tongHop('tuan', ngay, nguoi, true);
  ok('tổng hợp tuần cộng cả phút tăng ca', th.tongPhut === 540, th.tongPhut);
  ok('tổng hợp tuần vẫn chỉ đếm một phiếu ngày', th.soPhieuNgay === 1, th.soPhieuNgay);

  const mo = await kho.motPhieu('ngay', ngay, nguoi, true, 'tangCa');
  ok('mở lại đúng phiếu tăng ca', mo.ma === r2.ma && mo.dong.length === 1 && mo.dong[0].phut === 60, mo.ma);
  const moNgay = await kho.motPhieu('ngay', ngay, nguoi, true);
  ok('mở phiếu ngày không lẫn dòng tăng ca', moNgay.ma === r1.ma && moNgay.dong.length === 1, moNgay.dong.length);

  /* ---- thẻ nhóm ---- */
  const t = TB.tuKetQua(nguoi, r2);
  const the = TB.dungThe(t);
  const tieuDe = the.header.title.content;
  ok('thẻ nhóm ghi rõ là tăng ca', /Tăng ca/.test(tieuDe) && !/BCCV Ngày/.test(tieuDe), tieuDe);
  const than = JSON.stringify(the.elements);
  ok('thẻ tăng ca không chấm đúng hạn hay trễ', !/Đúng hạn|TRỄ|NỘP BÙ/.test(than), than.slice(0, 200));
  const theNgay = TB.dungThe(TB.tuKetQua(nguoi, r1));
  ok('thẻ phiếu ngày giữ nguyên tiêu đề cũ', /BCCV Ngày/.test(theNgay.header.title.content), theNgay.header.title.content);

  console.log('\n' + pass + ' pass · ' + fail + ' fail\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('NỔ: ' + e.stack); process.exit(1); });
