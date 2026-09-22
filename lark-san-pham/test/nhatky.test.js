'use strict';
/**
 * ============================================================================
 * Nhật ký thay đổi -> tin cho bảng tin tổng quát
 * ============================================================================
 * Không chạm mạng: `lark` là bản giả.
 *
 * Chạy: node test/nhatky.test.js
 */
const nk = require('../nhatky');
const cfg = require('../config');

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
const nay = Date.now();
const F = cfg.f.nhatKy;

(async () => {
  /* ---------------------------------------------------------------- */
  group('ghi(): một lô, một mã lô, ghi bằng field ID');
  {
    let ghiCuoi = null;
    const lark = { createMany: async (rows, tableId) => { ghiCuoi = { rows, tableId }; } };
    await nk.ghi(lark, [
      { spId: 'recA', ma: 'G4', ten: 'Tour cano', cot: 'Giá công bố NL', cu: '900.000đ', moi: '800.000đ' },
      { spId: 'recB', ma: 'G2', ten: 'Tour cáp treo', cot: 'Giá công bố NL', cu: '1.550.000đ', moi: '1.450.000đ' },
    ], { nguon: 'Hàng loạt', nguoi: 'Lê Văn Hùng' });

    ok('ghi đúng bảng Nhật ký', ghiCuoi.tableId === cfg.nhatKyTableId);
    ok('hai dòng', ghiCuoi.rows.length === 2);
    ok('ghi bằng field ID', ghiCuoi.rows[0][F.cot] === 'Giá công bố NL');
    ok('giữ cả giá trị cũ lẫn mới',
      ghiCuoi.rows[0][F.giaTriCu] === '900.000đ' && ghiCuoi.rows[0][F.giaTriMoi] === '800.000đ');
    /* Cả lô chung một mã: bảng tin gộp thành MỘT tin thay vì hai tin giống nhau. */
    ok('cả lô dùng chung một mã lô',
      ghiCuoi.rows[0][F.lo] && ghiCuoi.rows[0][F.lo] === ghiCuoi.rows[1][F.lo]);
    ok('có người đổi và nguồn',
      ghiCuoi.rows[0][F.nguoiDoi] === 'Lê Văn Hùng' && ghiCuoi.rows[0][F.nguon] === 'Hàng loạt');
  }

  /* ---------------------------------------------------------------- */
  group('ghi(): hỏng thì nuốt lỗi, KHÔNG làm hỏng việc chính');
  {
    /* Người dùng đã thấy giá đổi trên màn hình rồi. Base chậm lúc ghi nhật ký mà
     * ném lỗi lên thì thao tác của họ báo thất bại trong khi thật ra đã xong. */
    const lark = { createMany: async () => { throw new Error('Base sập'); } };
    let nem = false;
    try {
      await nk.ghi(lark, [{ spId: 'recA', ma: 'G4', cot: 'Giá', cu: '1', moi: '2' }],
        { nguon: 'Sửa tay', nguoi: 'ai đó' });
    } catch (_) { nem = true; }
    ok('không ném lỗi ra ngoài', nem === false);
  }

  {
    let goi = 0;
    const lark = { createMany: async () => { goi++; } };
    await nk.ghi(lark, [], { nguon: 'Sửa tay' });
    ok('không có gì để ghi thì không gọi Base', goi === 0);
  }

  /* ---------------------------------------------------------------- */
  group('dungTin(): gộp theo lô, cắt theo thời gian');
  {
    const ten = new Map([['recA', 'G4 — Tour cano 3 đảo'], ['recB', 'G2 — Tour cáp treo']]);
    const dong = (o) => Object.assign({
      id: 'n' + Math.random(), ten: 'x', spIds: ['recA'], cot: 'Giá công bố NL',
      cu: '900.000đ', moi: '800.000đ', nguon: 'Sửa tay', nguoi: 'Hùng', luc: nay, lo: '',
    }, o);

    const mot = nk.dungTin([dong({ lo: 'L1' })], ten, 'http://base');
    ok('một thay đổi -> một tin', mot.length === 1);
    ok('tiêu đề mang tên sản phẩm', /G4 — Tour cano 3 đảo/.test(mot[0].tieuDe), mot[0].tieuDe);
    ok('nội dung có cả cũ lẫn mới', /900\.000đ → 800\.000đ/.test(mot[0].noiDung), mot[0].noiDung);
    /* Cờ này là thứ ngăn tin tự động bị lớp vỏ đối xử như thông báo của quản lý. */
    ok('đánh dấu là tin tự động', mot[0].tuDong === true);
    ok('mức độ là Tin, không phải Gấp', mot[0].mucDo === 'Tin');

    /* Một lần đặt ưu tiên cho 12 sản phẩm không được thành 12 tin giống nhau. */
    const nhieu = nk.dungTin([
      dong({ lo: 'L2', spIds: ['recA'] }),
      dong({ lo: 'L2', spIds: ['recB'] }),
      dong({ lo: 'L2', spIds: ['recC'] }),
    ], ten, 'http://base');
    ok('cùng lô + cùng cột -> gộp thành MỘT tin', nhieu.length === 1, String(nhieu.length));
    ok('tiêu đề nói số lượng', /^3 sản phẩm/.test(nhieu[0].tieuDe), nhieu[0].tieuDe);

    /* Cùng lô nhưng khác cột là hai chuyện khác nhau — tách. */
    const haiCot = nk.dungTin([
      dong({ lo: 'L3', cot: 'Giá công bố NL' }),
      dong({ lo: 'L3', cot: 'Lịch trình tóm tắt' }),
    ], ten, 'http://base');
    ok('cùng lô khác cột -> hai tin', haiCot.length === 2, String(haiCot.length));

    /* Bảng tin là nơi "có gì mới", không phải kho lưu trữ. */
    const cu = nk.dungTin([dong({ lo: 'L4', luc: nay - 60 * NGAY })], ten, 'http://base', 14);
    ok('thay đổi quá cũ thì không lên bảng tin', cu.length === 0);

    const khongLuc = nk.dungTin([dong({ lo: 'L5', luc: 0 })], ten, 'http://base');
    ok('dòng không có mốc thời gian thì bỏ qua', khongLuc.length === 0);

    /* Mới nhất lên trước — bảng tin đọc từ trên xuống. */
    const xep = nk.dungTin([
      dong({ lo: 'A', luc: nay - 3 * NGAY }),
      dong({ lo: 'B', luc: nay }),
    ], ten, 'http://base');
    ok('tin mới nhất đứng trước', xep[0].tuNgay > xep[1].tuNgay);

    const tran = nk.dungTin(
      Array.from({ length: 30 }, (_, k) => dong({ lo: 'T' + k, luc: nay - k * 1000 })),
      ten, 'http://base', 14, 12);
    ok('cắt theo trần', tran.length === 12, String(tran.length));
  }

  /* ---------------------------------------------------------------- */
  group('gon(): cắt chữ dài để một dòng tin không tràn');
  {
    ok('giữ nguyên chữ ngắn', nk.gon('800.000đ') === '800.000đ');
    ok('rỗng thành (trống)', nk.gon('') === '(trống)' && nk.gon(null) === '(trống)');
    ok('cắt chữ dài và thêm dấu …', nk.gon('x'.repeat(200)).length === 71);
    /* Lịch trình nhiều dòng nhét vào một dòng tin thì phải thành một dòng. */
    ok('gộp xuống dòng thành khoảng trắng', nk.gon('a\nb\n\nc') === 'a b c');
  }

  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) { console.log(fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})();
