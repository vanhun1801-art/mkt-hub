'use strict';
/**
 * ============================================================================
 * Lịch đổi thông tin — bộ máy tự ghi xuống Base
 * ============================================================================
 * Đây là đường DUY NHẤT trong app tự ghi mà không có ai bấm nút, nên nó phải
 * được canh kỹ nhất: sai một chỗ là lịch trình của một tour đang bán bị đổi sau
 * lưng cả phòng.
 *
 * Không chạm mạng: `lark` và `doiTruong` đều là bản giả.
 *
 * Chạy: node test/lich.test.js
 */
const lich = require('../lich');
const cfg = require('../config');
const { doiTruong } = require('../kiem');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (vi ? ' — ' + vi : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const NGAY = 86400000;
const NAY = Date.parse('2026-10-05T09:00:00+07:00');

function larkGia() {
  const g = { ghi: [] };
  g.updateMany = async (map, tableId) => { g.ghi.push({ map, tableId }); return {}; };
  g.cuaSP = () => (g.ghi.find((x) => x.tableId === cfg.spTableId) || {}).map;
  g.cuaLich = () => (g.ghi.find((x) => x.tableId === cfg.lichTableId) || {}).map;
  return g;
}
const sp = (o) => Object.assign({ id: 'recSP1', ma: 'G4', lichTrinh: 'lịch cũ', giaNL: 800000 }, o);
const row = (o) => Object.assign({
  id: 'recL1', ten: 'G4 · Lịch trình', spIds: ['recSP1'], cot: 'Lịch trình tóm tắt',
  giaTriMoi: 'lịch MỚI', ngayApDung: Date.parse('2026-10-01T00:00:00+07:00'),
  trangThai: 'Chờ áp dụng',
}, o);

(async () => {
  /* ---------------------------------------------------------------- */
  group('toiHan(): chỉ dòng đang CHỜ và đã tới ngày');
  {
    ok('chờ + quá ngày -> tới hạn', lich.toiHan(row(), NAY) === true);
    ok('chờ + chưa tới ngày -> chưa',
      lich.toiHan(row({ ngayApDung: Date.parse('2026-12-01T00:00:00+07:00') }), NAY) === false);
    /* Đã áp rồi mà áp lại là ghi đè bản Kinh doanh vừa sửa tay sau đó. */
    ok('đã áp dụng -> không áp lại', lich.toiHan(row({ trangThai: 'Đã áp dụng' }), NAY) === false);
    ok('đã huỷ -> không áp', lich.toiHan(row({ trangThai: 'Đã huỷ' }), NAY) === false);
    ok('dòng Lỗi -> không tự thử lại', lich.toiHan(row({ trangThai: 'Lỗi' }), NAY) === false);
    ok('chưa đặt ngày -> không áp', lich.toiHan(row({ ngayApDung: 0 }), NAY) === false);
    /* Đúng 0h ngày áp dụng là đã tới hạn, không phải hết ngày mới tính. */
    ok('đúng 0h ngày áp dụng là tới hạn',
      lich.toiHan(row(), Date.parse('2026-10-01T00:00:00+07:00')) === true);
  }

  /* ---------------------------------------------------------------- */
  group('apDungDenHan(): ghi đúng ô, lưu bản cũ, vá luôn bộ nhớ');
  {
    const g = larkGia();
    const p = sp();
    const kq = await lich.apDungDenHan([p], [row()], g, doiTruong, NAY);

    ok('báo lại một dòng đã áp', kq.length === 1 && kq[0].ok === true, JSON.stringify(kq));
    ok('ghi vào bảng Sản phẩm bằng field ID',
      g.cuaSP().recSP1[cfg.f.sp.lichTrinh] === 'lịch MỚI',
      JSON.stringify(g.cuaSP()));
    ok('đánh dấu dòng lịch là Đã áp dụng',
      g.cuaLich().recL1[cfg.f.lich.trangThai] === 'Đã áp dụng');
    /* Lưu bản cũ để còn lần ngược lại được — đây là thay đổi tự động, người ta
     * sẽ hỏi "trước đó nó là gì". */
    ok('lưu lại giá trị cũ', g.cuaLich().recL1[cfg.f.lich.giaTriCu] === 'lịch cũ');
    ok('ghi mốc áp dụng', /^2026-10-05 /.test(g.cuaLich().recL1[cfg.f.lich.apDungLuc]),
      g.cuaLich().recL1[cfg.f.lich.apDungLuc]);
    /* Lần đọc này đã lỡ lấy dữ liệu cũ; không vá thì người mở app đúng lúc đó
     * vẫn thấy bản cũ thêm một nhịp. */
    ok('vá luôn bản trong bộ nhớ', p.lichTrinh === 'lịch MỚI', p.lichTrinh);
  }

  /* ---------------------------------------------------------------- */
  group('Thứ tự ghi: sản phẩm TRƯỚC, đánh dấu lịch SAU');
  {
    const g = larkGia();
    await lich.apDungDenHan([sp()], [row()], g, doiTruong, NAY);
    /* Ngược lại thì lúc mạng đứt giữa chừng sẽ có dòng lịch ghi "Đã áp dụng"
     * trong khi sản phẩm chưa đổi gì — và không ai đi tìm lại nữa. */
    ok('bảng Sản phẩm được ghi trước', g.ghi[0].tableId === cfg.spTableId,
      g.ghi.map((x) => x.tableId).join(' -> '));
    ok('bảng Lịch được ghi sau', g.ghi[1].tableId === cfg.lichTableId);
  }

  /* ---------------------------------------------------------------- */
  group('Dòng không áp được thì đánh dấu LỖI kèm lý do');
  {
    /* Một dòng chờ vĩnh viễn trông y hệt một dòng chưa tới hạn — phải nói ra. */
    const g1 = larkGia();
    const k1 = await lich.apDungDenHan([sp()], [row({ spIds: [] })], g1, doiTruong, NAY);
    ok('chưa gán sản phẩm -> Lỗi', k1[0].ok === false);
    ok('  và nói rõ lý do', /Chưa gán sản phẩm/.test(k1[0].loi), k1[0].loi);
    ok('  không ghi gì vào bảng Sản phẩm', g1.cuaSP() === undefined);
    ok('  vẫn đánh dấu dòng lịch là Lỗi',
      g1.cuaLich().recL1[cfg.f.lich.trangThai] === 'Lỗi');

    const g2 = larkGia();
    const k2 = await lich.apDungDenHan([sp()], [row({ cot: 'USP' })], g2, doiTruong, NAY);
    ok('cột ngoài danh sách -> Lỗi', k2[0].ok === false && /không nằm trong danh sách/.test(k2[0].loi),
      k2[0].loi);
    ok('  không ghi gì vào bảng Sản phẩm', g2.cuaSP() === undefined);

    /* Kiểm giá trị dùng CHUNG một cửa với đường bấm tay. Nếu lịch đi cửa khác,
     * nó thành đường vòng để ghi giá trị mà bấm tay bị chặn. */
    const g3 = larkGia();
    const k3 = await lich.apDungDenHan([sp()],
      [row({ cot: 'Giá công bố NL', giaTriMoi: '-500' })], g3, doiTruong, NAY);
    ok('giá âm bị chặn y như bấm tay', k3[0].ok === false && /không âm/.test(k3[0].loi), k3[0].loi);

    const g4 = larkGia();
    const k4 = await lich.apDungDenHan([sp()],
      [row({ cot: 'Ưu tiên marketing', giaTriMoi: 'Đẩy mạnh' })], g4, doiTruong, NAY);
    ok('mức ưu tiên lạ bị chặn', k4[0].ok === false, JSON.stringify(k4[0]));
    ok('  và không đẻ option rác trên Base', g4.cuaSP() === undefined);
  }

  /* ---------------------------------------------------------------- */
  group('Không có gì tới hạn thì không đụng Base');
  {
    const g = larkGia();
    const kq = await lich.apDungDenHan([sp()],
      [row({ ngayApDung: Date.parse('2026-12-01T00:00:00+07:00') })], g, doiTruong, NAY);
    ok('trả mảng rỗng', kq.length === 0);
    ok('không gọi ghi lần nào', g.ghi.length === 0);
  }

  /* ---------------------------------------------------------------- */
  group('Nhiều dòng cùng tới hạn');
  {
    const g = larkGia();
    const p1 = sp({ id: 'recA', ma: 'G4', lichTrinh: 'cũ A', baoGom: 'bg cũ' });
    const p2 = sp({ id: 'recB', ma: 'G2', lichTrinh: 'cũ B' });
    const kq = await lich.apDungDenHan([p1, p2], [
      row({ id: 'r1', spIds: ['recA'], giaTriMoi: 'mới A' }),
      row({ id: 'r2', spIds: ['recA'], cot: 'Dịch vụ bao gồm', giaTriMoi: 'bg mới' }),
      row({ id: 'r3', spIds: ['recB'], giaTriMoi: 'mới B' }),
    ], g, doiTruong, NAY);
    ok('áp cả ba', kq.filter((x) => x.ok).length === 3);
    /* Hai dòng lịch cùng trỏ một sản phẩm phải gộp vào MỘT lần ghi, không ghi
     * đè lẫn nhau. */
    ok('gộp hai thay đổi của cùng một sản phẩm vào một lần ghi',
      g.cuaSP().recA[cfg.f.sp.lichTrinh] === 'mới A' &&
      g.cuaSP().recA[cfg.f.sp.baoGom] === 'bg mới',
      JSON.stringify(g.cuaSP().recA));
    ok('chỉ gọi updateMany một lần cho bảng Sản phẩm',
      g.ghi.filter((x) => x.tableId === cfg.spTableId).length === 1);
  }

  /* ---------------------------------------------------------------- */
  group('COT_DAT_DUOC khớp đúng cfg.suaDuoc');
  {
    /* Giao diện lấy danh sách này từ server. Lệch nhau thì ô chọn hiện một cột
     * mà lúc áp lại báo "không nằm trong danh sách". */
    const nhan = Object.values(cfg.suaDuoc).map((x) => x.nhan).sort();
    ok('đủ và không thừa', lich.COT_DAT_DUOC.slice().sort().join('|') === nhan.join('|'),
      lich.COT_DAT_DUOC.join('|'));
    ok('có Lịch trình tóm tắt', lich.COT_DAT_DUOC.includes('Lịch trình tóm tắt'));
    ok('có Dịch vụ bao gồm', lich.COT_DAT_DUOC.includes('Dịch vụ bao gồm'));
  }

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) { console.log(fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})();
