'use strict';
/* Test thuần Node: `node test/bao-cao.test.js`
 *
 * Hai lỗi thật, cùng nằm trong một khung nhìn của tab Báo cáo (14/09/2026).
 *
 * 1. Ô "Bảng công việc" đỏ chữ "HTTP 401". App Tracking có lớp đăng nhập riêng
 *    và ở chế độ api (bản trên Render) nó chặn mọi /api/ khi không biết người
 *    gọi là ai. bao-cao.js gọi trần, không kèm danh tính, nên bị chặn. Bốn app
 *    kia không có lớp đó nên lâu nay không lộ.
 *
 * 2. "Giờ tác nghiệp" luôn ra 0. Cột `hours` của Base là ô công thức
 *    (kết thúc − bắt đầu) và trả về CHUỖI; buổi chưa nộp báo cáo thì chưa có giờ
 *    kết thúc nên công thức ra -1.110.497. Cộng cả cột lên là số vô nghĩa.
 *
 * Ở đây dựng năm app giả trên một cổng, rồi soi đúng thứ bao-cao.js gửi đi và
 * con số nó tính ra.
 */
const assert = require('assert');
const http = require('http');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

/* Buổi tác nghiệp mẫu — cố ý trộn cả bốn cảnh có thật trong Base:
 *   - xong hẳn, hours là chuỗi số đúng
 *   - chưa có giờ kết thúc, hours là số rác âm khổng lồ
 *   - chưa có giờ kết thúc và cũng không có hours
 *   - kết thúc TRƯỚC lúc bắt đầu (nhập nhầm) */
const BUOI = [
  { title: 'Xong', start: '2026-09-02T08:00:00+07:00', end: '2026-09-02T13:30:00+07:00',
    hours: '5.5', duration: '5', status: 'Đã hoàn tất', costActual: 300000, costPlan: 400000 },
  { title: 'Xong nữa', start: '2026-09-03T09:00:00+07:00', end: '2026-09-03T16:00:00+07:00',
    hours: '7', duration: '7', status: 'Đã hoàn tất', costActual: 200000, costPlan: 200000 },
  { title: 'Chưa nộp báo cáo', start: '2026-09-04T08:00:00+07:00', end: null,
    hours: '-1110497.5', duration: '4', status: 'Duyệt/Chờ tác nghiệp', costActual: 0, costPlan: 500000 },
  { title: 'Chưa có gì', start: '2026-09-05T08:00:00+07:00', end: '',
    hours: null, duration: null, status: 'Chờ duyệt/Xử lý', costActual: 0, costPlan: 0 },
  { title: 'Nhập ngược giờ', start: '2026-09-06T15:00:00+07:00', end: '2026-09-06T09:00:00+07:00',
    hours: '-6', duration: '3', status: 'Đã hoàn tất', costActual: 0, costPlan: 0 },
  { title: 'Ngoài kỳ', start: '2026-08-20T08:00:00+07:00', end: '2026-08-20T18:00:00+07:00',
    hours: '10', duration: '10', status: 'Đã hoàn tất', costActual: 999999, costPlan: 999999 },
];

/** Ghi lại header của mọi lời gọi, và bắt chước Tracking: không danh tính thì 401. */
const daNhan = [];
const may = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  daNhan.push({ p, h: req.headers });
  const tra = (o) => {
    const b = Buffer.from(JSON.stringify(o));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': b.length });
    res.end(b);
  };

  // Tracking: chốt đăng nhập y như auth.js của nó
  if (p === '/api/tasks') {
    if (!req.headers['x-hub-user-id']) {
      const b = Buffer.from(JSON.stringify({ error: 'Chưa đăng nhập', code: 'NO_SESSION' }));
      res.writeHead(401, { 'Content-Type': 'application/json', 'Content-Length': b.length });
      return res.end(b);
    }
    return tra({ tasks: [] });
  }
  if (p === '/api/meta') return tra({ items: BUOI });
  return tra({});
});

may.listen(0, '127.0.0.1', async () => {
  const cong = may.address().port;
  const u = 'http://127.0.0.1:' + cong;
  ['KPI_URL_SOCIAL', 'KPI_URL_ADS', 'KPI_URL_OTA', 'KPI_URL_VIEC', 'KPI_URL_LICH']
    .forEach((k) => { process.env[k] = u; });

  // require SAU khi đặt env: APP đọc env lúc nạp module
  const baoCao = require('../bao-cao');
  const NGUOI = { id: 'ou_abc', ten: 'Lê Văn Hùng', quanLy: true };

  console.log('\ngửi kèm danh tính thì app có lớp đăng nhập mới trả lời');

  const co = await baoCao.gom('2026-09-01', '2026-09-30', NGUOI);
  const cv = co.base.find((b) => b.id === 'cong-viec');
  t('có danh tính → Bảng công việc đọc được', () => {
    assert.strictEqual(cv.chay, true, 'vẫn hỏng: ' + cv.loi);
  });

  t('header gửi đi đúng bộ hub dùng, tên đã encode', () => {
    const g = daNhan.find((x) => x.p === '/api/tasks');
    assert.ok(g, 'không thấy lời gọi nào tới /api/tasks');
    assert.strictEqual(g.h['x-hub-user-id'], 'ou_abc');
    assert.strictEqual(g.h['x-hub-user-manager'], '1');
    assert.strictEqual(decodeURIComponent(g.h['x-hub-user-name']), 'Lê Văn Hùng');
  });

  daNhan.length = 0;
  const khong = await baoCao.gom('2026-09-01', '2026-09-30', null);
  const cv2 = khong.base.find((b) => b.id === 'cong-viec');
  t('không danh tính → hỏng, ĐÚNG như bản cũ đã hỏng', () => {
    assert.strictEqual(cv2.chay, false);
  });
  t('câu lỗi nói rõ vì sao, không chỉ trơ con số', () => {
    assert.ok(/401/.test(cv2.loi), cv2.loi);
    assert.ok(/Chưa đăng nhập/.test(cv2.loi),
      'thiếu câu app con viết ra thì đọc "HTTP 401" không biết đi sửa ở đâu: ' + cv2.loi);
  });

  console.log('\ngiờ tác nghiệp tính từ start/end, không cộng cột công thức');

  const lich = co.base.find((b) => b.id === 'lich-tac-nghiep');
  const oGio = (lich.o || []).find((x) => x.nhan === 'Giờ tác nghiệp');
  t('chỉ cộng buổi có đủ hai đầu và kết thúc sau bắt đầu', () => {
    assert.strictEqual(oGio.so, 12.5, 'chờ 5.5 + 7 = 12.5');
  });
  t('số rác âm của ô công thức không lọt vào tổng', () => {
    assert.ok(oGio.so > 0, 'ra ' + oGio.so + ' — đang cộng cả -1110497.5');
  });
  t('nói rõ bao nhiêu trên bao nhiêu buổi đã góp giờ', () => {
    assert.ok(/2\/5 buổi/.test(oGio.ghi), oGio.ghi);
  });
  t('buổi ngoài kỳ không được tính', () => {
    const oBuoi = lich.o.find((x) => x.nhan === 'Buổi tác nghiệp');
    assert.strictEqual(oBuoi.so, 5, 'lọt buổi 20/08');
  });

  console.log('\nchuỗi số vẫn cộng được (ô công thức Base hay trả chuỗi)');

  t('chi phí thực tế cộng đúng', () => {
    const o = lich.o.find((x) => x.nhan === 'Chi phí thực tế');
    assert.strictEqual(o.so, 500000, 'chờ 300000 + 200000');
  });

  may.close();
  console.log('\n' + so + ' phép thử đạt\n');
});
