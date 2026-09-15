'use strict';
/**
 * ============================================================================
 * TỆP ĐÍNH KÈM CỦA THÔNG BÁO
 * ============================================================================
 * Anh Hùng: "chỗ thông báo mà gửi được thêm ảnh hoặc file thì sẽ tốt hơn".
 *
 * Ba chỗ dễ hỏng, và đều hỏng im lặng:
 *
 *   đọc ô sai   — Base trả ô đính kèm bằng mấy tên khoá khác nhau (file_token
 *                 hay token, name hay file_name). Đọc hụt là popup không hiện
 *                 tệp nào, mà cũng chẳng có lỗi gì.
 *   mở toang    — đường tải tệp lên mà không chỉ quản lý thì bất kỳ ai đăng
 *                 nhập cũng đẩy được tệp vào Base của phòng.
 *   tên tiếng Việt — tên tệp đi qua header, nhét thẳng chữ có dấu vào header là
 *                 Node ném "Invalid character in header" và lượt tải lên chết.
 *
 * Bài này KHÔNG gọi Lark: phần đọc ô là hàm thuần, phần chặn quyền chạy trên
 * một hub thật dựng bằng khoá giả.
 *
 * Chạy: node test/tep-dinh-kem.test.js
 */
const { spawn } = require('child_process');
const path = require('path');
const baseLark = require('../base-lark');

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

group('Đọc ô đính kèm của Base');
{
  const d = baseLark.docOTep;
  ok('dạng file_token + name', d([{ file_token: 'tk1', name: 'a.png', type: 'image/png', size: 70 }])[0].token === 'tk1');
  ok('lấy đúng tên', d([{ file_token: 'tk1', name: 'a.png' }])[0].ten === 'a.png');
  ok('dạng token + file_name', d([{ token: 'tk2', file_name: 'b.pdf' }])[0].ten === 'b.pdf');
  ok('ô trống', d(null).length === 0 && d([]).length === 0);
  ok('không phải mảng thì bỏ qua', d('abc').length === 0 && d({ file_token: 'x' }).length === 0);
  ok('mục không có token bị loại', d([{ name: 'a.png' }, { file_token: 'tk', name: 'b.png' }]).length === 1);
  ok('giữ nhiều tệp đúng thứ tự',
    d([{ file_token: 'a' }, { file_token: 'b' }]).map((x) => x.token).join(',') === 'a,b');
  ok('cỡ tệp là số', d([{ file_token: 't', size: '2048' }])[0].co === 2048);
}

group('Tên tệp tiếng Việt đi qua header');
{
  /* Đúng cách mà giao diện làm: base64 của CHUỖI BYTE UTF-8. Nếu dùng btoa
   * thẳng trên chuỗi có dấu thì trình duyệt ném InvalidCharacterError. */
  const ten = 'ảnh chụp màn hình (2).png';
  const b64 = Buffer.from(ten, 'utf8').toString('base64');
  ok('mã hoá rồi giải ra đúng tên', Buffer.from(b64, 'base64').toString('utf8') === ten);
  ok('chuỗi mã hoá chỉ còn ASCII', /^[A-Za-z0-9+/=]+$/.test(b64), b64);
}

group('Đường tải tệp lên chỉ dành cho quản lý');
{
  /* Dựng hub ở chế độ api với khoá giả — không gọi Lark được, nhưng cửa chặn
   * quyền nằm TRƯỚC mọi lời gọi Lark nên vẫn thử được đúng thứ cần thử.
   *
   * Cổng 5199, KHÔNG phải 519x thấp hơn: 5194 và 5196 đang có app con của phòng
   * ngồi sẵn, và bài này gõ vào đó thì nhận 404 của app khác rồi tưởng route
   * của hub biến mất — đã mất một lượt truy nguyên vì đúng chuyện đó. */
  const PORT = 5199;
  const env = Object.assign({}, process.env, {
    PORT: String(PORT),
    LARK_APP_ID: 'cli_gia_de_vao_che_do_api',
    LARK_APP_SECRET: 'gia',
    SESSION_SECRET: 'kiem-thu-tep',
    PUBLIC_URL: 'http://localhost:' + PORT,
    HUB_AUTOSTART: '0',
  });
  const con = spawn(process.execPath, ['server.js'],
    { env, cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  const G = 'http://localhost:' + PORT;

  const cho = async () => {
    for (let i = 0; i < 60; i++) {
      try { await fetch(G + '/healthz'); return true; } catch (_) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    return false;
  };

  (async () => {
    try {
      if (!await cho()) { ok('hub thử lên được', false, 'cổng ' + PORT + ' không trả lời'); return; }

      const up = await fetch(G + '/api/tb-app/tep?recordId=rec1', {
        method: 'POST',
        headers: { 'Content-Type': 'image/png', 'x-ten-tep': Buffer.from('a.png').toString('base64') },
        body: Buffer.from('x'),
      });
      ok('người chưa đăng nhập KHÔNG tải tệp lên được', up.status === 401 || up.status === 403,
        'HTTP ' + up.status);

      const go = await fetch(G + '/api/tb-app/go-tep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: 'rec1', token: 'tk' }),
      });
      ok('người chưa đăng nhập KHÔNG gỡ tệp được', go.status === 401 || go.status === 403,
        'HTTP ' + go.status);

      /* Cửa PHÁT LẠI cũng nằm sau tường đăng nhập của hub. Người NHẬN thông báo
       * thì đã đăng nhập rồi, nên vẫn xem được ảnh mà không cần quyền gì trên
       * Base — nhưng người ngoài thì không lấy được tệp của phòng bằng một
       * đường dẫn đoán mò. */
      const tai = await fetch(G + '/api/tb-app/tep/rec1/tk1');
      ok('người chưa đăng nhập KHÔNG tải tệp về được', tai.status === 401 || tai.status === 403,
        'HTTP ' + tai.status);
    } finally {
      con.kill();
      console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
      if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
    }
  })();
}
