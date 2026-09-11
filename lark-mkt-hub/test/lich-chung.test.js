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

  group('5. Quyền "Xem tải người khác" — CHỌN TỪNG NGƯỜI, ba mức');
  {
    /* Nhu cầu thật: nhân sự content cần xem editor/thiết kế đang bận gì để xếp
     * việc. Cờ "Xem toàn bộ base" làm được, nhưng nó còn được chuyển xuống ba
     * app con nên mở luôn toàn bộ bản ghi của cả ba — rộng quá.
     *
     * Bản đầu của quyền này là một ô tick: bật là thấy tải CẢ PHÒNG. Anh Hùng
     * chốt lại "chỉ cho phép thấy một số người nhất định chứ không phải ấn vào
     * là xem hết" — nên nó thành danh sách người, và có ba mức phải thử riêng:
     * không ai · đúng mấy người · cả phòng. */
    const KHACH = { id: 'ou_content', name: 'Bạn content' };
    /* Bạn content phải CÓ việc của mình, không thì "chỉ thấy dòng của mình" ra
     * 0 dòng và phép thử không phân biệt được "lọc đúng" với "lọc sạch trơn".
     * Bản đầu tôi quên chuyện này nên phép thử đỏ oan. */
    const ds = [viec({ id: 'r1', chinh: [HANG] }), viec({ id: 'r2', chinh: [THANH] }),
      viec({ id: 'r3', chinh: [KHACH], tieuDe: 'Viết bài landing' })];
    const ten = (kq) => (kq.hang || []).map((h) => h.ten).sort().join(', ');

    const khongCo = await chay(ds, KHACH);
    ok('không kê ai: chỉ thấy ĐÚNG dòng của mình',
      (khongCo.hang || []).length === 1 &&
      (khongCo.hang || [])[0].ten === 'Bạn content' && khongCo.chiMinh === true,
      'thấy ' + ten(khongCo) + ' · chiMinh=' + khongCo.chiMinh);

    /* Đây là mức mới, và là mức anh Hùng cần: kê ĐÚNG Hằng, thì Thành — người
     * KHÔNG được kê — phải biến khỏi lưới. Nếu chỉ thử mức "cả phòng" thì một
     * lần lỡ tay cho qua hết vẫn xanh, tức là phép thử không canh được gì. */
    const motSo = await chay(ds, Object.assign({ xemTaiAi: [HANG.id] }, KHACH));
    ok('kê một người: thấy mình + ĐÚNG người đó, không thấy người khác',
      ten(motSo) === 'Bạn content, Võ Hằng',
      'thấy ' + ten(motSo));
    ok('kê một người: nhãn khối KHÔNG còn là "của tôi"', motSo.chiMinh === false,
      'chiMinh=' + motSo.chiMinh);
    ok('kê một người: đọc được TÊN VIỆC của người được kê',
      (motSo.hang || []).some((h) => h.ten === 'Võ Hằng' &&
        (h.o[NGAY] || []).some((x) => x.tieuDe.includes('Awaken'))),
      '(không thấy tên việc trong dòng của người được kê)');
    /* Phụ đề dưới lưới đếm theo phần được xem — kê 1 người thì không được đếm
     * cả 3 việc, không thì lưới nói một đằng phụ đề một nẻo. */
    ok('kê một người: số việc đếm theo đúng phần được xem', motSo.tongViec === 2,
      'tongViec=' + motSo.tongViec);

    /* Kê tên mình vào danh sách là dư, nhưng không được vì thế mà nhân đôi dòng
     * hay làm dòng của mình biến mất. */
    const keCaMinh = await chay(ds, Object.assign({ xemTaiAi: [KHACH.id] }, KHACH));
    ok('kê chính mình: vẫn đúng một dòng của mình',
      (keCaMinh.hang || []).length === 1 && (keCaMinh.hang || [])[0].ten === 'Bạn content',
      'thấy ' + ten(keCaMinh));

    const caPhong = await chay(ds, Object.assign({ moiXemTai: true }, KHACH));
    ok('kê `*` (cả phòng): thấy cả lưới',
      (caPhong.hang || []).length === 3 && caPhong.chiMinh === false,
      'thấy ' + (caPhong.hang || []).length + ' dòng, chiMinh=' + caPhong.chiMinh);

    /* Nửa còn lại của quyền: KHÔNG được rò xuống app con. Nếu proxy chuyển nó
     * thành header thì content mở Bảng công việc là thấy hết — đúng thứ mà
     * quyền hẹp này ra đời để tránh. */
    const proxy = fs.readFileSync(path.join(__dirname, '..', 'proxy.js'), 'utf8');
    ok('proxy KHÔNG chuyển quyền xem tải xuống app con',
      !proxy.includes('xemTai') && !proxy.includes('XemTai'),
      'proxy.js có nhắc xemTai — quyền hẹp bị rò thành quyền rộng');
  }

  group('6. Việc chưa phân công vẫn gom về dòng riêng');
  {
    const kq = await chay([viec({ chinh: [], hoTro: [] })]);
    const h = dongCua(kq, 'Chưa phân công');
    ok('có dòng "Chưa phân công" với 1 việc', h && h.tong === 1, h ? 'tong=' + h.tong : 'không thấy');
  }

  group('7. Quyền có tới được APP CON không — lỗi đã xảy ra thật');
  {
    /* Muc 5 dùng một bộ đọc luôn trả về đủ danh sách, nên nó chứng minh được
     * bộ lọc chạy đúng mà KHÔNG chứng minh được có gì để lọc. Đó đúng là chỗ
     * hỏng.
     *
     * Hub không đọc Base trực tiếp: nó gọi /api/tasks và /api/meta của app con
     * BẰNG DANH TÍNH CỦA NGƯỜI XEM, và app con cắt theo quyền:
     *
     *   lark-task-manager      visibleFor()  -> manager || toanBo ? all : của mình
     *   lark-lich-tac-nghiep   /api/meta     -> qToanBo() ? all : của mình
     *
     * Nên cấp quyền xem tải mà không nâng tầm nhìn của LẦN ĐỌC GỘP thì bộ lọc
     * chỉ lọc một tập đã bị cắt sạch. Đo thật trên máy anh Hùng: cấp cho một
     * bạn content xem ba người, bạn ấy thấy hai dòng — mình, và một người tình
     * cờ đứng chung MỘT việc với mình. Trông như "quyền có chạy, chỉ hơi ít".
     *
     * Bộ đọc ở đây cắt y như app con, nên bài thử đi qua đúng chỗ đã hỏng. */
    const KHACH = { id: 'ou_content', name: 'Bạn content' };
    const CHUNG = viec({ id: 'r0', chinh: [KHACH], hoTro: [HANG],
      tieuDe: 'Việc Thư và Hằng làm chung' });
    const ds = [
      CHUNG,
      viec({ id: 'r1', chinh: [HANG], tieuDe: 'Việc riêng của Hằng' }),
      viec({ id: 'r2', chinh: [THANH], tieuDe: 'Việc riêng của Thành' }),
    ];
    const dungTrong = (v, id) =>
      [...(v.chinh || []), ...(v.hoTro || [])].some((x) => x && x.id === id);

    /** Bộ đọc CẮT theo quyền, đúng như app con thật. */
    async function chayNhuAppCon(nguoi) {
      let thay = null;
      BO_DOC.__thu = async (m, tu2, den2, ai) => {
        thay = ai;                       // giữ lại để soi đúng thứ được gửi xuống
        const het = !!(ai && (ai.quanLy || ai.toanBo));
        return het ? ds : ds.filter((v) => ai && dungTrong(v, ai.id));
      };
      xoaCache();
      const kq = await lichChung([{ id: 'lich', kpi: '__thu' }], TU, DEN, true, nguoi);
      delete BO_DOC.__thu;
      return { kq, thay };
    }
    const ten = (kq) => (kq.hang || []).map((h) => h.ten).sort().join(', ');

    /* Không có quyền: đọc hẹp là ĐÚNG — không có lý do kéo cả phòng vào bộ nhớ
     * để rồi cắt đi hết. Hằng vẫn hiện vì có việc chung, nhưng đó là việc của
     * chính Thư nên không phải rò rỉ. */
    const khong = await chayNhuAppCon(KHACH);
    ok('không có quyền: KHÔNG nâng tầm nhìn khi đọc',
      !(khong.thay && khong.thay.toanBo),
      'gửi xuống app con toanBo=' + (khong.thay && khong.thay.toanBo));
    ok('không có quyền: không thấy việc riêng của người khác',
      !(khong.kq.hang || []).some((h) => (h.o[NGAY] || [])
        .some((x) => /riêng của/.test(x.tieuDe))),
      'thấy: ' + ten(khong.kq));

    /* Có quyền, kê đúng hai người. Đây là bài canh lỗi. */
    const co = await chayNhuAppCon(Object.assign({ xemTaiAi: [HANG.id] }, KHACH));
    ok('có quyền: lần đọc gộp được nâng tầm nhìn',
      !!(co.thay && co.thay.toanBo),
      'app con vẫn nhận toanBo=' + (co.thay && co.thay.toanBo) +
      ' nên nó chỉ trả về việc của chính người xem — bộ lọc không có gì để lọc');
    ok('có quyền: thấy TẢI THẬT của người được kê, không chỉ việc chung',
      (co.kq.hang || []).some((h) => h.ten === 'Võ Hằng' && h.tong === 2),
      'dòng của Hằng: tong=' +
      (((co.kq.hang || []).find((h) => h.ten === 'Võ Hằng') || {}).tong));
    ok('có quyền: đọc được TÊN việc riêng của người được kê',
      (co.kq.hang || []).some((h) => h.ten === 'Võ Hằng' &&
        (h.o[NGAY] || []).some((x) => x.tieuDe === 'Việc riêng của Hằng')),
      '(bấm vào ô không ra tên việc — đúng điều anh Hùng báo)');
    ok('có quyền: người KHÔNG được kê vẫn bị cắt dù đã đọc rộng',
      !(co.kq.hang || []).some((h) => h.ten === 'Lê Trung Thành'),
      'đọc rộng mà quên cắt thì thành mở hết — thấy: ' + ten(co.kq));

    /* Kê `*` thì cũng phải nâng, không thì "cả phòng" cũng rỗng như trên. */
    const caPhong = await chayNhuAppCon(Object.assign({ moiXemTai: true }, KHACH));
    ok('kê cả phòng: cũng được nâng tầm nhìn và thấy đủ 3 dòng',
      !!(caPhong.thay && caPhong.thay.toanBo) && (caPhong.kq.hang || []).length === 3,
      'thấy: ' + ten(caPhong.kq));
  }


  console.log('\n' + '─'.repeat(56));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})();
