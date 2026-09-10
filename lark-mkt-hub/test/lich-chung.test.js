'use strict';
/**
 * ============================================================================
 * BẢNG ĐỒ NHIỆT TẢI NHÂN SỰ — một người một buổi chỉ được đếm MỘT lần
 * ============================================================================
 * Lỗi đã gặp thật: anh Hùng mở ô đồ nhiệt của Võ Hằng ngày 11/09, thấy hai
 * dòng "Awaken Sea + Dinner Show" y hệt nhau (chỉ khác chữ "hỗ trợ"), trong
 * khi trên Base chỉ có MỘT bản ghi.
 *
 * Nguyên nhân: bên Lịch tác nghiệp, `chinh` lấy từ ô Nhân sự và `hoTro` lấy từ
 * ô Phụ trách. Người phụ trách mà cũng đi tác nghiệp thì có tên ở CẢ HAI ô,
 * nên bị ghi vào hai lần. Hậu quả không chỉ là hai dòng trùng: `tong` (tổng
 * tải) và `dinh` (đỉnh tải) đều bị thổi lên, tức là bảng nói người ta bận gấp
 * đôi thực tế — mà bảng này chính là thứ để quyết định giao việc cho ai.
 *
 * Phép thử tiêm một bộ đọc giả vào BO_DOC nên không cần Base, không cần mạng.
 *
 * Chạy: node test/lich-chung.test.js
 */
const fs = require('fs');
const path = require('path');
const { lichChung, BO_DOC, xoaCache } = require('../lichchung');

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

/** Ngày nằm trong khoảng thử — không dùng hôm nay để khỏi phụ thuộc lúc chạy. */
const NGAY = '2026-09-11';
const TU = '2026-09-01';
const DEN = '2026-09-30';

const HANG = { id: 'ou_hang', name: 'Võ Hằng' };
const THANH = { id: 'ou_thanh', name: 'Lê Trung Thành' };

/** Dựng một "việc" như bộ đọc thật trả về. */
function viec(o) {
  return Object.assign({
    id: 'rec1', module: 'lich', ngay: NGAY, gio: '16:00',
    tieuDe: 'Awaken Sea + Dinner Show', trangThai: 'Duyệt/Chờ tác nghiệp',
    muc: 'thap', the: [], chinh: [], hoTro: [],
  }, o);
}

/** Gọi lichChung với một bộ đọc giả. */
async function chay(ds, nguoi) {
  BO_DOC.__thu = async () => ds;
  xoaCache();
  const kq = await lichChung([{ id: 'lich', kpi: '__thu' }], TU, DEN, true, nguoi || null);
  delete BO_DOC.__thu;
  return kq;
}
const dongCua = (kq, ten) => (kq.hang || []).find((h) => h.ten === ten);

(async () => {
  group('1. Người đứng ở CẢ hai ô — đúng cái lỗi đã gặp');
  {
    /* Bản ghi thật: Nhân sự = [Thành, Hằng], Phụ trách = [Hằng].
     * Bộ đọc Lịch tác nghiệp cho ra chinh = Nhân sự, hoTro = Phụ trách. */
    const kq = await chay([viec({ chinh: [THANH, HANG], hoTro: [HANG] })]);
    const h = dongCua(kq, 'Võ Hằng');

    ok('Hằng chỉ có 1 việc trong ngày, không phải 2',
      h && h.o[NGAY] && h.o[NGAY].length === 1,
      h ? 'thấy ' + (h.o[NGAY] || []).length + ' dòng: ' +
        (h.o[NGAY] || []).map((x) => x.vai).join(', ') : 'không thấy dòng của Hằng');

    ok('tổng tải của Hằng là 1', h && h.tong === 1, h ? 'tong=' + h.tong : '');
    ok('đỉnh tải của Hằng là 1', h && h.dinh === 1, h ? 'dinh=' + h.dinh : '');

    ok('vai CHÍNH thắng vai hỗ trợ',
      h && h.o[NGAY] && h.o[NGAY][0].vai === 'chinh',
      h && h.o[NGAY] && h.o[NGAY][0] ? 'vai=' + h.o[NGAY][0].vai : '');

    /* Người kia không được ảnh hưởng gì. */
    const t = dongCua(kq, 'Lê Trung Thành');
    ok('Thành vẫn có đúng 1 việc', t && t.tong === 1, t ? 'tong=' + t.tong : 'không thấy');
  }

  group('2. Thứ tự gọi không được ảnh hưởng — hỗ trợ trước, chính sau');
  {
    /* Nếu một base nào đó xếp ngược lại (người vào với vai hỗ trợ trước), vẫn
     * phải ra một dòng và vẫn phải là vai chính. */
    const kq = await chay([viec({ chinh: [HANG], hoTro: [HANG] })]);
    const h = dongCua(kq, 'Võ Hằng');
    ok('vẫn 1 dòng', h && h.o[NGAY].length === 1, h ? String(h.o[NGAY].length) : '');
    ok('vẫn là vai chính', h && h.o[NGAY][0].vai === 'chinh', h ? h.o[NGAY][0].vai : '');
  }

  group('3. Không chống trùng quá tay — việc KHÁC nhau vẫn phải đếm đủ');
  {
    const kq = await chay([
      viec({ id: 'recA', chinh: [HANG] }),
      viec({ id: 'recB', chinh: [HANG] }),
    ]);
    const h = dongCua(kq, 'Võ Hằng');
    ok('hai việc khác mã thì đếm 2', h && h.tong === 2, h ? 'tong=' + h.tong : '');
  }

  group('4. Hai base trùng mã bản ghi thì vẫn là hai việc');
  {
    /* Chống trùng phải tính cả module, không thì việc của base này ăn mất việc
     * của base kia khi hai bên tình cờ trùng mã. */
    const kq = await chay([
      viec({ id: 'recX', module: 'lich', chinh: [HANG] }),
      viec({ id: 'recX', module: 'cong-viec', chinh: [HANG] }),
    ]);
    const h = dongCua(kq, 'Võ Hằng');
    ok('cùng mã nhưng khác base thì đếm 2', h && h.tong === 2, h ? 'tong=' + h.tong : '');
  }

  group('5. Quyền "Xem tải người khác" — mở đúng lưới này, không mở gì thêm');
  {
    /* Nhu cầu thật: nhân sự content cần xem editor/thiết kế đang bận gì để xếp
     * việc. Cờ "Xem toàn bộ base" làm được, nhưng nó còn được chuyển xuống ba
     * app con nên mở luôn toàn bộ bản ghi của cả ba — rộng quá. `xemTai` là cờ
     * hẹp: chỉ lưới này. */
    const KHACH = { id: 'ou_content', name: 'Bạn content' };
    /* Bạn content phải CÓ việc của mình, không thì "chỉ thấy dòng của mình" ra
     * 0 dòng và phép thử không phân biệt được "lọc đúng" với "lọc sạch trơn".
     * Bản đầu tôi quên chuyện này nên phép thử đỏ oan. */
    const ds = [viec({ id: 'r1', chinh: [HANG] }), viec({ id: 'r2', chinh: [THANH] }),
      viec({ id: 'r3', chinh: [KHACH], tieuDe: 'Viết bài landing' })];

    const khongCo = await chay(ds, KHACH);
    ok('không có quyền: chỉ thấy ĐÚNG dòng của mình',
      (khongCo.hang || []).length === 1 &&
      (khongCo.hang || [])[0].ten === 'Bạn content' && khongCo.chiMinh === true,
      'thấy ' + (khongCo.hang || []).map((h) => h.ten).join(', ') +
      ' · chiMinh=' + khongCo.chiMinh);

    const co = await chay(ds, Object.assign({ xemTai: true }, KHACH));
    ok('có quyền: thấy cả lưới', (co.hang || []).length === 3 && co.chiMinh === false,
      'thấy ' + (co.hang || []).length + ' dòng, chiMinh=' + co.chiMinh);

    ok('có quyền: đọc được TÊN VIỆC của người khác',
      (co.hang || []).some((h) => h.ten === 'Võ Hằng' &&
        (h.o[NGAY] || []).some((x) => x.tieuDe.includes('Awaken'))),
      '(không thấy tên việc trong dòng của người khác)');

    /* Nửa còn lại của quyền: KHÔNG được rò xuống app con. Nếu proxy chuyển nó
     * thành header thì content mở Bảng công việc là thấy hết — đúng thứ mà cờ
     * hẹp này ra đời để tránh. */
    const proxy = fs.readFileSync(path.join(__dirname, '..', 'proxy.js'), 'utf8');
    ok('proxy KHÔNG chuyển xemTai xuống app con', !proxy.includes('xemTai'),
      'proxy.js có nhắc xemTai — cờ hẹp bị rò thành quyền rộng');
  }

  group('6. Việc chưa phân công vẫn gom về dòng riêng');
  {
    const kq = await chay([viec({ chinh: [], hoTro: [] })]);
    const h = dongCua(kq, 'Chưa phân công');
    ok('có dòng "Chưa phân công" với 1 việc', h && h.tong === 1, h ? 'tong=' + h.tong : 'không thấy');
  }

  console.log('\n' + '─'.repeat(56));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})();
