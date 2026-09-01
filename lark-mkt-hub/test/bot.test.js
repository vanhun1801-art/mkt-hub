'use strict';
/**
 * Test cho nguồn số liệu của trợ lý.
 *
 * Hai nhóm:
 *   A. Hàm thuần (ngày tháng, so tên, sinh schema) — chạy được mà không cần mạng.
 *   B. Chốt chặn HTTP thật: token, chỉ GET, và QUAN TRỌNG NHẤT là không có một
 *      đồng tiền nào lọt ra. Nhóm B cần hub đang chạy; không có thì bỏ qua chứ
 *      không báo hỏng, để `npm test` trên máy trắng vẫn xanh.
 *
 * Chạy:  node test/bot.test.js
 * Có hub:  HUB_URL=http://127.0.0.1:5180 BOT_API_TOKEN=<token> node test/bot.test.js
 */
const bot = require('../bot');

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

/* Mốc cố định để test không đổi kết quả theo ngày chạy: 12:00 ngày 01/09/2026,
 * giờ VN. Dùng giờ trưa để lệch múi giờ của máy chủ không đẩy sang ngày khác. */
const NOW = Date.parse('2026-09-01T12:00:00+07:00');
const NGAY = 86400000;

(async () => {
  /* ================= A. hàm thuần ================= */
  group('1. Ngày tháng theo giờ Việt Nam');
  {
    ok('hôm nay bắt đầu đúng 00:00 giờ VN',
      new Date(bot.dauNgayVN(NOW)).toISOString() === '2026-08-31T17:00:00.000Z',
      new Date(bot.dauNgayVN(NOW)).toISOString());
    ok('gioVN in ra giờ VN chứ không phải UTC', bot.gioVN(NOW) === '01/09 12:00', bot.gioVN(NOW));
    ok('thuVN đúng thứ', bot.thuVN(NOW) === 'Thứ ba', bot.thuVN(NOW));

    /* Bẫy đã gặp hai lần trong dự án này: máy chủ Render chạy UTC, dùng getHours()
     * là lệch 7 tiếng và lịch 00:30 nhảy sang ngày hôm trước. */
    const nuaDem = Date.parse('2026-09-02T00:30:00+07:00');
    ok('00:30 giờ VN vẫn là ngày 02/09', bot.ngayVN(nuaDem) === '02/09', bot.ngayVN(nuaDem));
  }

  group('2. Từ khoá khoảng thời gian');
  {
    const k = (t, d) => bot.khoang(t, d, NOW);
    ok('bỏ trống = không lọc', k('') === null);
    ok('hom-nay gói đúng 1 ngày', k('hom-nay').den - k('hom-nay').tu === NGAY - 1);
    ok('mai bắt đầu sau hôm nay 1 ngày', k('mai').tu - k('hom-nay').tu === NGAY);
    ok('tuan-nay là 7 ngày', k('tuan-nay').den - k('tuan-nay').tu === 7 * NGAY - 1);
    ok('tuan-sau không chồng lên tuan-nay', k('tuan-sau').tu > k('tuan-nay').den);
    ok('thang-nay bắt đầu 01/09', bot.ngayVN(k('thang-nay').tu) === '01/09',
      bot.ngayVN(k('thang-nay').tu));
    ok('thang-nay kết thúc 30/09', bot.ngayVN(k('thang-nay').den) === '30/09',
      bot.ngayVN(k('thang-nay').den));
    ok('thang-truoc là tháng 8', bot.ngayVN(k('thang-truoc').tu) === '01/08' &&
      bot.ngayVN(k('thang-truoc').den) === '31/08');
    ok('một ngày cụ thể', bot.ngayVN(k('2026-09-10').tu) === '10/09');
    ok('khoảng hai ngày', bot.ngayVN(k('2026-09-10', '2026-09-12').den) === '12/09');

    /* Bộ não hay gõ tự do ("hôm nay", "tuần này"). Phải BÁO LỖI kèm danh sách từ
     * khoá đúng, chứ không được âm thầm bỏ lọc — bỏ lọc thì nó trả cả năm dữ liệu
     * rồi tự bịa ra "tuần này có 200 lịch". */
    ok('từ khoá lạ thì báo lỗi', !!k('hôm nay').loi, JSON.stringify(k('hôm nay')));
    ok('lỗi có kèm danh sách từ khoá đúng', /hom-nay/.test(k('xyz').loi));
    ok('ngày đảo ngược bị chặn', !!k('2026-09-10', '2026-09-01').loi);
  }

  group('3. So tên người');
  {
    ok('bỏ dấu', bot.khongDau('Danh Minh Trường') === 'danh minh truong',
      bot.khongDau('Danh Minh Trường'));
    ok('đ và Đ thành d', bot.khongDau('Đỗ Minh Hưng') === 'do minh hung',
      bot.khongDau('Đỗ Minh Hưng'));
    ok('gõ không dấu vẫn khớp', bot.khopTen(['Danh Minh Trường'], 'truong'));
    ok('gõ có dấu vẫn khớp', bot.khopTen(['Danh Minh Trường'], 'Trường'));
    ok('khớp một phần tên', bot.khopTen(['Nguyễn Long Khánh (Pinky)'], 'pinky'));
    ok('người khác thì không khớp', !bot.khopTen(['Danh Minh Trường'], 'hung'));
    ok('bỏ trống thì nhận tất cả', bot.khopTen(['Ai đó'], ''));
  }

  group('4. Schema cho Coze');
  {
    const s = bot.openapi('https://vi-du.onrender.com');
    ok('đúng bản OpenAPI 3', s.openapi === '3.0.1');
    ok('server là URL truyền vào', s.servers[0].url === 'https://vi-du.onrender.com');
    ok('có đủ một path cho mỗi công cụ',
      Object.keys(s.paths).length === Object.keys(bot.CONG_CU).length);
    ok('mọi path đều chỉ có GET',
      Object.values(s.paths).every((p) => Object.keys(p).length === 1 && p.get));
    /* Mô tả này là thứ DUY NHẤT ngăn bộ não đi trả lời câu hỏi về tiền bằng nguồn
     * không có tiền — mất câu đó là bot bắt đầu bịa số. */
    ok('mô tả nói rõ không có dữ liệu tiền',
      /KHÔNG có chi phí/.test(s.info.description), s.info.description);
    ok('khai bearer token', !!s.components.securitySchemes.bearer);

    /* PUBLIC_URL khai sai thì schema trỏ Coze về localhost: Coze gọi vào chính
     * máy nó, không báo lỗi rõ ràng, chỉ "không có dữ liệu". Phải tố giác. */
    const noiBo = bot.openapi('http://127.0.0.1:5180');
    ok('địa chỉ nội bộ thì schema tự cảnh báo', /CẢNH BÁO/.test(noiBo.info.description));
    ok('cảnh báo chỉ đúng biến phải sửa', /PUBLIC_URL/.test(noiBo.info.description));
    ok('địa chỉ https thì không cảnh báo gì', !/CẢNH BÁO/.test(s.info.description));
  }

  group('5. So token');
  {
    ok('khác độ dài thì khác', !bot.bangNhau('abc', 'abcd'));
    ok('giống thì bằng', bot.bangNhau('abcdef', 'abcdef'));
    ok('lệch một ký tự thì khác', !bot.bangNhau('abcdef', 'abcdeg'));
    ok('token tối thiểu đủ dài để không đoán được', bot.TOI_THIEU_TOKEN >= 24);
  }

  group('6. Danh tính bot');
  {
    /* Ba dòng này là chốt an toàn quan trọng nhất của cả tệp. Ai sửa NGUOI_BOT
     * thành quản lý hoặc bật chiPhi là mở đường cho tiền đi ra Internet. */
    ok('bot KHÔNG phải quản lý', bot.NGUOI_BOT.quanLy === false);
    ok('bot KHÔNG có quyền chi phí', bot.NGUOI_BOT.chiPhi === false);
    ok('bot KHÔNG được tạo mới', bot.NGUOI_BOT.taoMoi === false);
    ok('bot được xem toàn bộ (chỉ để đọc)', bot.NGUOI_BOT.toanBo === true);
    ok('danh tính bị đóng băng, không sửa được lúc chạy',
      Object.isFrozen(bot.NGUOI_BOT));
  }

  /* ================= B. chốt chặn HTTP thật ================= */
  const GOC = (process.env.HUB_URL || '').replace(/\/$/, '');
  const TOKEN = process.env.BOT_API_TOKEN || '';
  if (!GOC || !TOKEN) {
    group('7. Chốt chặn HTTP (BỎ QUA)');
    console.log('  \x1b[33mbỏ qua\x1b[0m — cần HUB_URL và BOT_API_TOKEN để chạy nhóm này');
  } else {
    const goi = async (duong, opts = {}) => {
      const r = await fetch(GOC + duong, {
        method: opts.method || 'GET',
        headers: opts.khongToken ? {} : { authorization: 'Bearer ' + (opts.token || TOKEN) },
      });
      let b = null;
      try { b = await r.json(); } catch (_) { b = null; }
      return { status: r.status, body: b };
    };

    group('7. Cửa vào');
    {
      ok('không token thì 401', (await goi('/bot/lich', { khongToken: true })).status === 401);
      ok('sai token thì 401', (await goi('/bot/lich', { token: 'sai-be-bet-nhung-du-dai-24-ky-tu' })).status === 401);
      ok('POST bị chặn', (await goi('/bot/lich', { method: 'POST' })).status === 405);
      ok('PATCH bị chặn', (await goi('/bot/lich', { method: 'PATCH' })).status === 405);
      ok('DELETE bị chặn', (await goi('/bot/lich', { method: 'DELETE' })).status === 405);
      ok('công cụ không tồn tại thì 404', (await goi('/bot/khong-co-dau')).status === 404);
      const r = await goi('/bot');
      ok('trang mục lục liệt kê đủ công cụ',
        r.status === 200 && r.body.congCu.length === Object.keys(bot.CONG_CU).length);
    }

    group('8. Không một đồng nào lọt ra');
    {
      /* Đây là test quan trọng nhất của tệp. Module TRẢ VỀ tiền (bảng OTA có
       * thucNhan/hoaHong, lịch có costPlan/costActual) — lớp bot phải lọc bằng
       * danh sách CHO PHÉP. Quét cả chuỗi JSON để cột tiền mới thêm sau này cũng
       * bị bắt, chứ không chỉ kiểm mấy tên cột em đang biết. */
      const NGHI_TIEN = ['chiPhi', 'costPlan', 'costActual', 'thucNhan', 'hoaHong',
        'tongTien', 'netVnd', 'doanhThu', 'tongTienGoc', 'giaVe', 'luong'];
      for (const duong of ['/bot/lich', '/bot/viec', '/bot/booking']) {
        const r = await goi(duong);
        if (r.status !== 200) { ok(duong + ' gọi được', false, 'status=' + r.status); continue; }
        const raw = JSON.stringify(r.body);
        const thay = NGHI_TIEN.filter((k) => raw.includes('"' + k + '"'));
        ok(duong + ' không có cột tiền nào', !thay.length, 'thấy: ' + thay.join(', '));
        ok(duong + ' không lộ open_id', !/\bou_[a-f0-9]{8}/.test(raw));
        ok(duong + ' không lộ email', !/@[a-z0-9-]+\.[a-z]{2,}/i.test(raw));
        ok(duong + ' có câu tomTat đọc được', typeof r.body.tomTat === 'string' && r.body.tomTat.length > 5);
      }
    }

    group('9. Tham số sai thì báo, không âm thầm trả hết');
    {
      const r = await goi('/bot/lich?tu=hôm%20nay');
      ok('từ khoá ngày sai thì 400', r.status === 400, 'status=' + r.status);
      ok('câu báo lỗi chỉ ra từ khoá đúng', /hom-nay/.test((r.body && r.body.error) || ''));

      const a = await goi('/bot/lich?tu=thang-nay');
      const b = await goi('/bot/lich');
      ok('có lọc thì ít hơn hoặc bằng không lọc', a.body.so <= b.body.so,
        a.body.so + ' vs ' + b.body.so);
      ok('trả về đúng nhãn khoảng đã lọc', a.body.khoang === 'tháng này', a.body.khoang);
      ok('chiTiet không dài hơn 40 dòng', (a.body.chiTiet || []).length <= 40);
    }
  }

  console.log('\n' + '─'.repeat(52));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nLỗi khi chạy test:', e.message); process.exit(2); });
