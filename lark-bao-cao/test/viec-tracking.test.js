'use strict';
/**
 * ============================================================================
 * Đầu việc lấy từ app Tracking — khớp đúng người, và chịu được khi Tracking tắt
 * ============================================================================
 * Ô "Công việc" không còn cho gõ tự do, nên nếu hàm khớp người ở đây trượt thì
 * nhân sự mở app ra thấy menu RỖNG và không có đường nào nộp báo cáo. Đó là lỗi
 * chặn đường, không phải lỗi hiển thị.
 *
 * Chỗ dễ trượt nhất: open_id do TỪNG app Lark cấp riêng, nên app Báo cáo và app
 * Tracking có thể gọi cùng một người bằng hai id khác nhau. Vì thế phải khớp
 * được cả bằng email lẫn bằng tên.
 *
 * Chạy: node test/viec-tracking.test.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const VT = require('../viec-tracking');

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

group('Khớp người — ba khoá, vì open_id khác nhau theo từng app Lark');
{
  const viec = {
    owner: [{ id: 'ou_tracking_abc', name: 'Danh Minh Trường' }],
    helper: [{ id: 'ou_khac', name: 'Huỳnh Chí Khanh', email: 'khanh@rootytrip.com' }],
  };

  ok('khớp bằng open_id', VT.cuaAi(viec, { id: 'ou_tracking_abc' }));
  ok('khớp bằng tên khi id khác nhau',
    VT.cuaAi(viec, { id: 'ou_bao_cao_xyz', ten: 'Danh Minh Trường' }),
    'đây chính là trường hợp trên Render: cùng một người, hai app cho hai id');
  ok('khớp bằng email', VT.cuaAi(viec, { id: 'ou_la', email: 'khanh@rootytrip.com' }));
  ok('người hỗ trợ cũng tính là của mình', VT.cuaAi(viec, { ten: 'Huỳnh Chí Khanh' }));

  ok('người khác thì KHÔNG khớp', !VT.cuaAi(viec, { id: 'ou_nguoi_la', ten: 'Ai Đó' }),
    'khớp rộng tay thì nhân sự thấy việc của đồng nghiệp trong menu của mình');
  ok('tên hoa thường khác nhau vẫn khớp', VT.cuaAi(viec, { ten: 'danh minh trường' }));
  ok('tên thừa khoảng trắng vẫn khớp', VT.cuaAi(viec, { ten: '  Danh Minh Trường ' }));

  ok('người rỗng thì không khớp bừa', !VT.cuaAi(viec, {}),
    'khớp bừa nghĩa là ai cũng thấy việc của mọi người');
  ok('việc không có ai đứng tên thì không thuộc về ai',
    !VT.cuaAi({ owner: [], helper: [] }, { id: 'ou_a', ten: 'A' }));
  ok('chuỗi rỗng không phải là khoá', !VT.cuaAi(viec, { id: '', ten: '', email: '' }));
}

group('Trạng thái đóng');
{
  ok('Hoàn thành là đóng', VT.daXong({ status: 'Hoàn thành' }));
  ok('Xong ở cột Luồng cũng là đóng', VT.daXong({ flow: 'Xong' }));
  ok('Huỷ là đóng', VT.daXong({ status: 'Huỷ' }));
  ok('"Hủy" không dấu móc cũng là đóng', VT.daXong({ status: 'Hủy' }),
    'Base có cả hai cách viết, bỏ sót một là việc đã huỷ vẫn nằm trong menu');
  ok('Trễ deadline KHÔNG phải đóng', !VT.daXong({ status: 'Trễ deadline' }),
    'việc trễ là việc còn phải làm — bỏ nó khỏi menu thì không ai báo cáo được nó');
  ok('Đang tiến hành không phải đóng', !VT.daXong({ status: 'Đang tiến hành' }));
}

group('Đoán nhóm việc từ "Loại công việc" bên Tracking');
{
  ok('Thiết kế', VT.doanNhom('Thiết kế', '') === 'Thiết kế');
  ok('Edit → Edit video', VT.doanNhom('Edit', '') === 'Edit video');
  ok('Chỉnh ảnh', VT.doanNhom('Chỉnh ảnh', '') === 'Chỉnh ảnh');
  ok('đoán được từ TÊN việc khi loại để trống',
    VT.doanNhom('', 'Dựng video tour Rạch Vẹm') === 'Edit video');
  ok('không đoán ra thì về Khác, không bịa',
    VT.doanNhom('Linh tinh', 'Việc gì đó') === 'Khác');
  /* Việc thật trong Base: mẫu dò chữ "dựng" đứng một mình khớp luôn "Xây dựng",
   * nên việc soạn tài liệu bị xếp vào Edit video. */
  ok('"Xây dựng Profile" KHÔNG phải Edit video',
    VT.doanNhom('Khác', 'Xây dựng Profile + các sự kiện hết năm 2026') === 'Khác',
    'đang ra: ' + VT.doanNhom('Khác', 'Xây dựng Profile + các sự kiện hết năm 2026'));
  ok('nhưng "dựng clip" thì vẫn là Edit video',
    VT.doanNhom('', 'Dựng clip Rạch Vẹm') === 'Edit video');
  ok('rỗng cũng ra Khác, không nổ', VT.doanNhom(null, undefined) === 'Khác');
}

/* ---- phần cần một máy chủ Tracking giả ---- */
(async () => {
  const CONG = 5198;
  process.env.BC_CONG_TRACKING = String(CONG);
  delete require.cache[require.resolve('../viec-tracking')];
  const VT2 = require('../viec-tracking');

  const nay = Date.now();
  const TASKS = {
    tasks: [
      { id: 'r1', title: 'Đang làm', status: 'Đang tiến hành', workType: 'Thiết kế',
        owner: [{ id: 'ou_a', name: 'A' }], deadline: new Date(nay + NGAY).toISOString() },
      { id: 'r2', title: 'Vừa xong hôm qua', status: 'Hoàn thành', workType: 'Edit',
        owner: [{ id: 'ou_a', name: 'A' }],
        ngayGiaiQuyet: new Date(nay - NGAY).toISOString() },
      { id: 'r3', title: 'Xong từ đời nào', status: 'Hoàn thành', workType: 'Edit',
        owner: [{ id: 'ou_a', name: 'A' }],
        ngayGiaiQuyet: new Date(nay - 90 * NGAY).toISOString() },
      { id: 'r4', title: 'Của người khác', status: 'Đang tiến hành',
        owner: [{ id: 'ou_b', name: 'B' }] },
    ],
  };

  /* Máy chủ giả GHI LẠI header nhận được — đó là cả điểm của nhóm kiểm tra
   * "gửi danh tính" bên dưới. */
  const nhanDuoc = [];
  const sv = http.createServer((req, res) => {
    nhanDuoc.push(req.headers);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(TASKS));
  });
  await new Promise((r) => sv.listen(CONG, '127.0.0.1', r));

  group('Lọc việc cho một người');
  {
    const ds = await VT2.vieCuaNguoi({ id: 'ou_a', ten: 'A' }, nay, true);
    const ten = ds.map((v) => v.ten);
    ok('lấy việc đang làm', ten.includes('Đang làm'));
    ok('lấy cả việc vừa đóng trong 7 ngày', ten.includes('Vừa xong hôm qua'),
      'lúc gõ báo cáo thì việc làm xong hôm nay đã chuyển sang Hoàn thành rồi — ' +
      'bỏ nó đi là người ta không tìm thấy đúng việc mình vừa làm');
    ok('bỏ việc đóng đã lâu', !ten.includes('Xong từ đời nào'));
    ok('KHÔNG lấy việc của người khác', !ten.includes('Của người khác'),
      'đây là rò dữ liệu: nhân sự thấy đầu việc của đồng nghiệp');

    const dangLam = ds.find((v) => v.ten === 'Đang làm');
    ok('việc đang mở xếp trước việc đã đóng', ds[0].dong === false);
    ok('có cờ đóng để giao diện đánh dấu ✓',
      ds.find((v) => v.ten === 'Vừa xong hôm qua').dong === true);
    ok('mang theo id để nối về Tracking', dangLam.id === 'r1');
    ok('mang theo loại việc', dangLam.loai === 'Thiết kế');
  }

  group('Gửi DANH TÍNH sang Tracking — thiếu là nhân sự thấy menu rỗng');
  {
    /* Đây là lỗi đã lọt lên bản chạy thật. `visibleFor()` bên Tracking viết:
     *     const me = await whoAmI(req);
     *     if (!me) return [];
     * Không danh tính thì nó trả MẢNG RỖNG, không báo lỗi gì. Trên máy anh Hùng
     * không lộ vì quyen.json xếp anh vào quản lý nên Tracking trả hết việc;
     * trên Render thì nhân sự mở ra thấy menu trống trơn. */
    nhanDuoc.length = 0;
    await VT2.vieCuaNguoi({ id: 'ou_a', ten: 'Nguyễn Văn A', email: 'a@rootytrip.com' },
      nay, true, false);
    const h = nhanDuoc[nhanDuoc.length - 1] || {};

    ok('có gửi x-hub-user-id', h['x-hub-user-id'] === 'ou_a',
      'thiếu header này thì Tracking trả về mảng rỗng — im lặng, không lỗi');
    ok('có gửi tên, đã mã hoá để không vỡ dấu',
      decodeURIComponent(h['x-hub-user-name'] || '') === 'Nguyễn Văn A',
      'đang ra: ' + h['x-hub-user-name']);
    ok('có gửi email làm khoá phụ', decodeURIComponent(h['x-hub-user-email'] || '') === 'a@rootytrip.com');
    ok('nhân sự thì KHÔNG gắn cờ quản lý', h['x-hub-user-manager'] === undefined,
      'gắn cờ đó là mở đúng cái cửa mà bảng phân quyền đang giữ');

    nhanDuoc.length = 0;
    await VT2.vieCuaNguoi({ id: 'ou_sep', ten: 'Sếp' }, nay, true, true);
    const hq = nhanDuoc[nhanDuoc.length - 1] || {};
    ok('quản lý thì có cờ quản lý', hq['x-hub-user-manager'] === '1',
      'thiếu thì quản lý không xem được đầu việc của nhân sự khác');
  }

  group('Nhớ tạm phải khoá theo NGƯỜI');
  {
    /* Kết quả nay phụ thuộc danh tính gửi kèm. Dùng chung một ô nhớ thì người mở
     * sau nhận nguyên danh sách của người mở trước — rò dữ liệu, và im lặng. */
    nhanDuoc.length = 0;
    await VT2.vieCuaNguoi({ id: 'ou_a', ten: 'A' }, nay, false);
    const lan1 = nhanDuoc.length;
    await VT2.vieCuaNguoi({ id: 'ou_b', ten: 'B' }, nay, false);
    ok('người khác thì hỏi Tracking lại, không dùng lại ô nhớ của người trước',
      nhanDuoc.length > lan1,
      'dùng chung ô nhớ nghĩa là B thấy đúng danh sách việc của A');

    const lan2 = nhanDuoc.length;
    await VT2.vieCuaNguoi({ id: 'ou_a', ten: 'A' }, nay, false);
    ok('cùng một người trong vòng một phút thì dùng lại ô nhớ',
      nhanDuoc.length === lan2);
  }

  group('Thời gian chờ — 6 giây là quá ngắn cho Render');
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'viec-tracking.js'), 'utf8');
    const m = src.match(/BC_TIMEOUT_TRACKING \|\| (\d+)/);
    ok('có khai thời gian chờ', !!m);
    ok('chờ ít nhất 15 giây', m && Number(m[1]) >= 15000,
      'đang là ' + (m && m[1]) + 'ms. Render gói Free ngủ sau ~15 phút; lần gọi ' +
      'đầu Tracking phải đọc 425 bản ghi từ Base, 6 giây là hụt — và màn hình ' +
      'báo "Không nối được" trong khi Tracking vẫn sống');
    ok('có thử lại một lần khi hụt giờ', /catch \(e\) \{[\s\S]{0,400}goiTracking/.test(src),
      'lần đầu hụt, lần hai thì cache đã ấm');
  }

  group('Tracking tắt — phải nói thật, không im lặng');
  {
    await new Promise((r) => sv.close(r));
    process.env.BC_CONG_TRACKING = '5197';   // cổng không có ai nghe
    delete require.cache[require.resolve('../viec-tracking')];
    const VT3 = require('../viec-tracking');
    let noi = null;
    try { await VT3.vieCuaNguoi({ id: 'ou_a' }, nay, true); } catch (e) { noi = e; }
    ok('không trả về mảng rỗng lặng lẽ mà NÉM lỗi', noi !== null,
      'menu rỗng thì người dùng tưởng mình không có việc nào — phải phân biệt ' +
      '"không có việc" với "không hỏi được"');
    ok('song() trả false khi không nối được', (await VT3.song()) === false);
  }

  console.log('\n' + '─'.repeat(56));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('NỔ: ' + e.stack); process.exit(1); });
